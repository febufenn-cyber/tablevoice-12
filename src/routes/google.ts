import { z } from 'zod';
import type { Hono } from 'hono';
import type { AppEnv } from '../app-context';
import { audit, jsonBody, parse, requireRestaurantRole, requireReviewRole } from '../app-context';
import { googleIntegrationForEnv, type GoogleIntegrationFactory } from '../integrations/google/service';
import { AppError } from '../lib/errors';
import { ProductionWorkflowService } from '../workflow/service';

const accountSchema = z.object({ accountName: z.string().regex(/^accounts\/[A-Za-z0-9_-]+$/) });
const locationSchema = z.object({ locationName: z.string().regex(/^locations\/[A-Za-z0-9_-]+$/) });
const disconnectSchema = z.object({ revoke: z.boolean().default(true) });
const publishSchema = z.object({ consent: z.literal(true) });
const purgeSchema = z.object({ limit: z.number().int().min(1).max(500).default(100) });
const allRoles = ['buyer', 'approver', 'operator', 'action_owner', 'viewer'] as const;
const managerRoles = ['buyer', 'approver', 'operator'] as const;

export function registerGoogleRoutes(app: Hono<AppEnv>, factory: GoogleIntegrationFactory = googleIntegrationForEnv) {
  app.get('/oauth/google/callback', async (c) => {
    const integration = factory(c.env);
    const connection = await integration.completeAuthorization({
      code: c.req.query('code'), state: c.req.query('state'), error: c.req.query('error'),
    });
    if (integration.config.successUrl) {
      const redirect = new URL(integration.config.successUrl);
      redirect.searchParams.set('google', 'connected');
      redirect.searchParams.set('restaurantId', connection.restaurantId);
      return c.redirect(redirect.toString(), 302);
    }
    return c.json({ connection });
  });

  app.get('/v1/restaurants/:restaurantId/integrations/google', async (c) => {
    const restaurantId = c.req.param('restaurantId');
    await requireRestaurantRole(c.get('repository'), restaurantId, c.get('actor'), [...allRoles]);
    return c.json({ connection: await factory(c.env).status(restaurantId) });
  });

  app.post('/v1/restaurants/:restaurantId/integrations/google/connect', async (c) => {
    const restaurantId = c.req.param('restaurantId');
    const actor = c.get('actor');
    const repository = c.get('repository');
    await requireRestaurantRole(repository, restaurantId, actor, [...managerRoles]);
    const result = await factory(c.env).startAuthorization(actor, restaurantId);
    await audit(repository, actor, {
      action: 'google_oauth_started', resourceType: 'restaurant', resourceId: restaurantId, restaurantId,
      metadata: { expiresAt: result.expiresAt },
    });
    return c.json(result, 201);
  });

  app.get('/v1/restaurants/:restaurantId/integrations/google/accounts', async (c) => {
    const restaurantId = c.req.param('restaurantId');
    await requireRestaurantRole(c.get('repository'), restaurantId, c.get('actor'), [...managerRoles]);
    return c.json({ accounts: await factory(c.env).listAccounts(restaurantId) });
  });

  app.post('/v1/restaurants/:restaurantId/integrations/google/account', async (c) => {
    const restaurantId = c.req.param('restaurantId');
    const actor = c.get('actor');
    const repository = c.get('repository');
    await requireRestaurantRole(repository, restaurantId, actor, [...managerRoles]);
    const input = parse(accountSchema, await jsonBody(c));
    const connection = await factory(c.env).selectAccount(restaurantId, input.accountName);
    await audit(repository, actor, {
      action: 'google_account_selected', resourceType: 'restaurant', resourceId: restaurantId, restaurantId,
      metadata: { accountName: input.accountName },
    });
    return c.json({ connection });
  });

  app.get('/v1/restaurants/:restaurantId/integrations/google/locations', async (c) => {
    const restaurantId = c.req.param('restaurantId');
    await requireRestaurantRole(c.get('repository'), restaurantId, c.get('actor'), [...managerRoles]);
    const integration = factory(c.env);
    const locations = c.req.query('refresh') === 'true'
      ? await integration.refreshLocations(restaurantId)
      : await integration.listStoredLocations(restaurantId);
    return c.json({ locations });
  });

  app.post('/v1/restaurants/:restaurantId/integrations/google/location', async (c) => {
    const restaurantId = c.req.param('restaurantId');
    const actor = c.get('actor');
    const repository = c.get('repository');
    await requireRestaurantRole(repository, restaurantId, actor, [...managerRoles]);
    const input = parse(locationSchema, await jsonBody(c));
    const location = await factory(c.env).selectLocation(restaurantId, input.locationName);
    await audit(repository, actor, {
      action: 'google_location_selected', resourceType: 'restaurant', resourceId: restaurantId, restaurantId,
      metadata: { locationName: input.locationName },
    });
    return c.json({ location });
  });

  app.post('/v1/restaurants/:restaurantId/integrations/google/sync', async (c) => {
    const restaurantId = c.req.param('restaurantId');
    const actor = c.get('actor');
    const repository = c.get('repository');
    await requireRestaurantRole(repository, restaurantId, actor, [...managerRoles]);
    const run = await factory(c.env).syncReviews(actor, repository, restaurantId);
    if (c.get('workflow').enabled) {
      const workflow = new ProductionWorkflowService(c.get('workflow'), repository, actor);
      const reviews = await repository.listReviews(restaurantId, { limit: 500 }, actor);
      for (const review of reviews.filter((candidate) => candidate.source === 'google')) await workflow.syncReview(review);
    }
    await audit(repository, actor, {
      action: 'google_reviews_synced', resourceType: 'google_sync_run', resourceId: run.id, restaurantId,
      metadata: { reviewsSeen: run.reviewsSeen, imported: run.reviewsImported, updated: run.reviewsUpdated },
    });
    return c.json({ run });
  });

  app.get('/v1/restaurants/:restaurantId/integrations/google/sync-runs', async (c) => {
    const restaurantId = c.req.param('restaurantId');
    await requireRestaurantRole(c.get('repository'), restaurantId, c.get('actor'), [...allRoles]);
    return c.json({ runs: await factory(c.env).listSyncRuns(restaurantId) });
  });

  app.post('/v1/reviews/:reviewId/integrations/google/publish', async (c) => {
    const reviewId = c.req.param('reviewId');
    const actor = c.get('actor');
    const repository = c.get('repository');
    const review = await requireReviewRole(repository, reviewId, actor, [...managerRoles]);
    const input = parse(publishSchema, await jsonBody(c));
    const workflow = new ProductionWorkflowService(c.get('workflow'), repository, actor);
    const attempt = c.get('workflow').enabled ? await workflow.startPublicationAttempt(review, 'google', c.req.header('idempotency-key')) : undefined;
    try {
      const result = await factory(c.env).publishApprovedReply(actor, repository, reviewId, input.consent);
      await workflow.syncReview(result.review);
      const completedAttempt = attempt ? await workflow.completePublicationAttempt(attempt.id, 'succeeded', {
        externalReference: result.googleReply.updateTime,
        metadata: { explicitConsent: true },
      }) : undefined;
      await audit(repository, actor, {
        action: 'google_reply_published', resourceType: 'review', resourceId: reviewId, restaurantId: review.restaurantId,
        metadata: { explicitConsent: true, publicationAttemptId: completedAttempt?.id },
      });
      return c.json({ ...result, ...(completedAttempt ? { publicationAttempt: completedAttempt } : {}) });
    } catch (error) {
      if (attempt) await workflow.completePublicationAttempt(attempt.id, 'failed', {
        errorCode: error instanceof AppError ? error.code : 'google_publication_failed',
        errorMessage: error instanceof Error ? error.message : 'Google publication failed',
      }).catch(() => undefined);
      throw error;
    }
  });

  app.post('/v1/restaurants/:restaurantId/integrations/google/purge-expired', async (c) => {
    const restaurantId = c.req.param('restaurantId');
    const actor = c.get('actor');
    const repository = c.get('repository');
    await requireRestaurantRole(repository, restaurantId, actor, ['buyer', 'operator']);
    const input = parse(purgeSchema, await jsonBody(c));
    const result = await factory(c.env).purgeExpired(actor, repository, restaurantId, input.limit);
    await audit(repository, actor, {
      action: 'google_content_purged', resourceType: 'restaurant', resourceId: restaurantId, restaurantId,
      metadata: result,
    });
    return c.json(result);
  });

  app.post('/v1/restaurants/:restaurantId/integrations/google/disconnect', async (c) => {
    const restaurantId = c.req.param('restaurantId');
    const actor = c.get('actor');
    const repository = c.get('repository');
    await requireRestaurantRole(repository, restaurantId, actor, ['buyer', 'approver']);
    const input = parse(disconnectSchema, await jsonBody(c));
    const connection = await factory(c.env).disconnect(restaurantId, input.revoke);
    await audit(repository, actor, {
      action: 'google_disconnected', resourceType: 'restaurant', resourceId: restaurantId, restaurantId,
      metadata: { revoked: input.revoke },
    });
    return c.json({ connection });
  });
}
