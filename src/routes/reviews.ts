import type { Hono } from 'hono';
import type { AppEnv } from '../app-context';
import { audit, jsonBody, parse, requireRestaurantRole, requireReviewRole } from '../app-context';
import { approvalSchema, publicationSchema, qaSchema, reviewCreateSchema } from '../domain/schemas';
import type { Review } from '../domain/types';
import { AppError } from '../lib/errors';
import { csvRecords } from '../lib/csv';
import { newId } from '../lib/id';
import { ReviewService } from '../services/review-service';
import { ProductionWorkflowService } from '../workflow/service';

export function registerReviewRoutes(app: Hono<AppEnv>) {
  app.post('/v1/restaurants/:restaurantId/reviews', async (c) => {
    const actor = c.get('actor'); const repository = c.get('repository'); const restaurantId = c.req.param('restaurantId');
    if (!(await repository.getRestaurant(restaurantId, actor))) throw new AppError('Restaurant not found.', 404, 'not_found');
    await requireRestaurantRole(repository, restaurantId, actor, ['buyer', 'approver', 'operator']);
    const input = parse(reviewCreateSchema, await jsonBody(c)); const now = new Date().toISOString();
    let review: Review = {
      id: newId(), restaurantId, source: input.source, ...(input.sourceReference ? { sourceReference: input.sourceReference } : {}),
      rating: input.rating, reviewDate: input.reviewDate, ...(input.reviewerDisplayName ? { reviewerDisplayName: input.reviewerDisplayName } : {}),
      ...(input.originalLanguage ? { originalLanguage: input.originalLanguage } : {}), originalText: input.originalText,
      ...(input.translatedText ? { translatedText: input.translatedText } : {}), serviceMode: input.serviceMode,
      ingestionMethod: input.ingestionMethod, verificationStatus: input.verified ? 'verified' : 'unverified',
      state: input.verified ? 'verified' : 'needs_verification', createdBy: actor.id, createdAt: now, updatedAt: now,
    };
    const duplicate = await repository.findDuplicateReview(review, actor); if (duplicate) review = { ...review, duplicateOf: duplicate.id };
    const created = await repository.createReview(review, actor);
    const workflow = new ProductionWorkflowService(c.get('workflow'), repository, actor);
    await workflow.syncReview(created);
    await audit(repository, actor, { action: 'review.created', resourceType: 'review', resourceId: created.id, restaurantId, metadata: { ingestionMethod: created.ingestionMethod, duplicateOf: created.duplicateOf } });
    if (input.autoProcess && created.state === 'verified') {
      const result = await new ReviewService(repository, c.get('intelligence'), actor).process(created.id);
      await workflow.syncReview(result.review);
      return c.json({ review: result.review, draft: result.draft, action: result.action }, 201);
    }
    return c.json({ review: created }, 201);
  });

  app.post('/v1/restaurants/:restaurantId/reviews/import/csv', async (c) => {
    const actor = c.get('actor'); const repository = c.get('repository'); const restaurantId = c.req.param('restaurantId');
    if (!(await repository.getRestaurant(restaurantId, actor))) throw new AppError('Restaurant not found.', 404, 'not_found');
    await requireRestaurantRole(repository, restaurantId, actor, ['buyer', 'approver', 'operator']);
    const records = csvRecords(await c.req.text()); const results: Array<{ row: number; reviewId?: string; error?: string }> = [];
    const workflow = new ProductionWorkflowService(c.get('workflow'), repository, actor);
    for (const [index, record] of records.entries()) {
      try {
        const input = parse(reviewCreateSchema, {
          source: record.platform || 'csv', sourceReference: record.source_reference || undefined, rating: Number(record.rating),
          reviewDate: record.review_date, reviewerDisplayName: record.reviewer_display_name || undefined,
          originalLanguage: record.language || undefined, originalText: record.review_text,
          serviceMode: record.service_mode || 'unknown', ingestionMethod: 'csv', verified: false, autoProcess: false,
        });
        const now = new Date().toISOString();
        const review = await repository.createReview({
          id: newId(), restaurantId, source: input.source, ...(input.sourceReference ? { sourceReference: input.sourceReference } : {}),
          rating: input.rating, reviewDate: input.reviewDate, ...(input.reviewerDisplayName ? { reviewerDisplayName: input.reviewerDisplayName } : {}),
          ...(input.originalLanguage ? { originalLanguage: input.originalLanguage } : {}), originalText: input.originalText,
          serviceMode: input.serviceMode, ingestionMethod: 'csv', verificationStatus: 'unverified', state: 'needs_verification',
          createdBy: actor.id, createdAt: now, updatedAt: now,
        }, actor);
        await workflow.syncReview(review);
        results.push({ row: index + 2, reviewId: review.id });
      } catch (error) { results.push({ row: index + 2, error: error instanceof Error ? error.message : 'Import failed' }); }
    }
    await audit(repository, actor, { action: 'reviews.csv_imported', resourceType: 'restaurant', resourceId: restaurantId, restaurantId, metadata: { rows: records.length, succeeded: results.filter((result) => result.reviewId).length } });
    return c.json({ results }, 207);
  });

  app.get('/v1/restaurants/:restaurantId/reviews', async (c) => {
    const state = c.req.query('state'); const risk = c.req.query('risk'); const limit = Number(c.req.query('limit') ?? 100);
    const reviews = await c.get('repository').listReviews(c.req.param('restaurantId'), {
      ...(state ? { state: state as Review['state'] } : {}), ...(risk ? { risk } : {}),
      limit: Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 500) : 100,
    }, c.get('actor'));
    return c.json({ reviews });
  });

  app.get('/v1/reviews/:reviewId', async (c) => {
    const repository = c.get('repository'); const actor = c.get('actor');
    const review = await repository.getReview(c.req.param('reviewId'), actor); if (!review) throw new AppError('Review not found.', 404, 'not_found');
    const draft = await repository.getLatestDraft(review.id, actor);
    const actions = (await repository.listInternalActions(review.restaurantId, actor)).filter((action) => action.reviewId === review.id);
    const workflow = new ProductionWorkflowService(c.get('workflow'), repository, actor);
    const workItem = c.get('workflow').enabled ? await workflow.getWorkItem(review.id) : null;
    const publicationAttempts = c.get('workflow').enabled ? await workflow.listPublicationAttempts(review.id) : [];
    return c.json({ review, draft, actions, workItem, publicationAttempts });
  });

  app.post('/v1/reviews/:reviewId/verify', async (c) => {
    const repository = c.get('repository'); const actor = c.get('actor');
    const review = await requireReviewRole(repository, c.req.param('reviewId'), actor, ['buyer', 'approver', 'operator']);
    if (!['needs_verification', 'received'].includes(review.state)) throw new AppError('Review is not awaiting verification.', 409, 'invalid_state');
    const updated = await repository.updateReview(review.id, { verificationStatus: 'verified', state: 'verified', updatedAt: new Date().toISOString() }, actor);
    await new ProductionWorkflowService(c.get('workflow'), repository, actor).syncReview(updated);
    await audit(repository, actor, { action: 'review.verified', resourceType: 'review', resourceId: review.id, restaurantId: review.restaurantId, metadata: {} });
    return c.json({ review: updated });
  });

  app.post('/v1/reviews/:reviewId/process', async (c) => {
    await requireReviewRole(c.get('repository'), c.req.param('reviewId'), c.get('actor'), ['buyer', 'approver', 'operator']);
    const result = await new ReviewService(c.get('repository'), c.get('intelligence'), c.get('actor')).process(c.req.param('reviewId'));
    await new ProductionWorkflowService(c.get('workflow'), c.get('repository'), c.get('actor')).syncReview(result.review);
    return c.json(result);
  });
  app.post('/v1/reviews/:reviewId/qa', async (c) => {
    await requireReviewRole(c.get('repository'), c.req.param('reviewId'), c.get('actor'), ['buyer', 'approver', 'operator']);
    const input = parse(qaSchema, await jsonBody(c));
    const result = await new ReviewService(c.get('repository'), c.get('intelligence'), c.get('actor')).qa(c.req.param('reviewId'), input.confirmedActions);
    await new ProductionWorkflowService(c.get('workflow'), c.get('repository'), c.get('actor')).syncReview(result.review);
    return c.json(result);
  });
  app.post('/v1/reviews/:reviewId/decision', async (c) => {
    await requireReviewRole(c.get('repository'), c.req.param('reviewId'), c.get('actor'), ['buyer', 'approver']);
    const input = parse(approvalSchema, await jsonBody(c));
    const result = await new ReviewService(c.get('repository'), c.get('intelligence'), c.get('actor')).decide(c.req.param('reviewId'), input);
    await new ProductionWorkflowService(c.get('workflow'), c.get('repository'), c.get('actor')).syncReview(result.review);
    return c.json(result);
  });
  app.post('/v1/reviews/:reviewId/publication', async (c) => {
    const repository = c.get('repository'); const actor = c.get('actor');
    const review = await requireReviewRole(repository, c.req.param('reviewId'), actor, ['buyer', 'approver', 'operator']);
    const input = parse(publicationSchema, await jsonBody(c));
    const workflow = new ProductionWorkflowService(c.get('workflow'), repository, actor);
    const attempt = c.get('workflow').enabled ? await workflow.startPublicationAttempt(review, 'manual', c.req.header('idempotency-key')) : undefined;
    try {
      const updated = await new ReviewService(repository, c.get('intelligence'), actor).confirmPublication(review.id, input.confirmed, { evidence: input.evidence, reasonNotPublished: input.reasonNotPublished });
      await workflow.syncReview(updated);
      const completedAttempt = attempt ? await workflow.completePublicationAttempt(attempt.id, input.confirmed ? 'succeeded' : 'unconfirmed', { externalReference: input.evidence, metadata: { reasonNotPublished: input.reasonNotPublished } }) : undefined;
      return c.json({ review: updated, ...(completedAttempt ? { publicationAttempt: completedAttempt } : {}) });
    } catch (error) {
      if (attempt) await workflow.completePublicationAttempt(attempt.id, 'failed', { errorCode: error instanceof AppError ? error.code : 'publication_failed', errorMessage: error instanceof Error ? error.message : 'Publication failed' }).catch(() => undefined);
      throw error;
    }
  });
  app.post('/v1/reviews/:reviewId/escalate', async (c) => {
    await requireReviewRole(c.get('repository'), c.req.param('reviewId'), c.get('actor'), ['buyer', 'approver', 'operator']);
    const body = parse((await import('zod')).z.object({ reason: (await import('zod')).z.string().trim().min(3).max(1000) }), await jsonBody(c));
    const review = await new ReviewService(c.get('repository'), c.get('intelligence'), c.get('actor')).escalate(c.req.param('reviewId'), body.reason);
    await new ProductionWorkflowService(c.get('workflow'), c.get('repository'), c.get('actor')).syncReview(review);
    return c.json({ review });
  });
  app.delete('/v1/reviews/:reviewId', async (c) => {
    const repository = c.get('repository'); const actor = c.get('actor');
    const review = await requireReviewRole(repository, c.req.param('reviewId'), actor, ['buyer', 'operator']);
    await repository.deleteReview(review.id, actor);
    await audit(repository, actor, { action: 'review.deleted', resourceType: 'review', resourceId: review.id, restaurantId: review.restaurantId, metadata: {} });
    return c.body(null, 204);
  });
}
