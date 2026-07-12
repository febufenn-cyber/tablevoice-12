import type { Hono } from 'hono';
import type { AppEnv } from '../app-context';
import { audit, jsonBody, parse, requireOrganizationRole, requireRestaurantRole } from '../app-context';
import { organizationCreateSchema, restaurantCreateSchema, voiceProfileCreateSchema } from '../domain/schemas';
import type { Restaurant, VoiceProfile } from '../domain/types';
import { AppError } from '../lib/errors';
import { newId } from '../lib/id';

export function registerFoundationRoutes(app: Hono<AppEnv>) {
  app.get('/v1/me', (c) => c.json({ actor: c.get('actor') }));

  app.post('/v1/organizations', async (c) => {
    const actor = c.get('actor'); const repository = c.get('repository');
    const input = parse(organizationCreateSchema, await jsonBody(c));
    const organization = await repository.createOrganization({ id: newId(), name: input.name, createdAt: new Date().toISOString() }, actor);
    await audit(repository, actor, { action: 'organization.created', resourceType: 'organization', resourceId: organization.id, metadata: {} });
    return c.json({ organization }, 201);
  });

  app.post('/v1/restaurants', async (c) => {
    const actor = c.get('actor'); const repository = c.get('repository');
    const input = parse(restaurantCreateSchema, await jsonBody(c));
    await requireOrganizationRole(repository, input.organizationId, actor, ['buyer', 'operator']);
    const restaurant: Restaurant = {
      id: newId(), organizationId: input.organizationId, brandName: input.brandName,
      ...(input.legalName ? { legalName: input.legalName } : {}), ...(input.cuisine ? { cuisine: input.cuisine } : {}),
      ...(input.positioning ? { positioning: input.positioning } : {}), defaultLanguage: input.defaultLanguage,
      timezone: input.timezone, status: 'active', createdAt: new Date().toISOString(),
    };
    const created = await repository.createRestaurant(restaurant, actor);
    await audit(repository, actor, { action: 'restaurant.created', resourceType: 'restaurant', resourceId: created.id, restaurantId: created.id, metadata: {} });
    return c.json({ restaurant: created }, 201);
  });

  app.get('/v1/restaurants', async (c) => c.json({ restaurants: await c.get('repository').listRestaurants(c.get('actor')) }));

  app.get('/v1/restaurants/:restaurantId', async (c) => {
    const restaurant = await c.get('repository').getRestaurant(c.req.param('restaurantId'), c.get('actor'));
    if (!restaurant) throw new AppError('Restaurant not found.', 404, 'not_found');
    const voice = await c.get('repository').getActiveVoiceProfile(restaurant.id, c.get('actor'));
    return c.json({ restaurant, voice });
  });

  app.post('/v1/restaurants/:restaurantId/voice-profiles', async (c) => {
    const actor = c.get('actor'); const repository = c.get('repository'); const restaurantId = c.req.param('restaurantId');
    if (!(await repository.getRestaurant(restaurantId, actor))) throw new AppError('Restaurant not found.', 404, 'not_found');
    await requireRestaurantRole(repository, restaurantId, actor, ['buyer', 'approver', 'operator']);
    const input = parse(voiceProfileCreateSchema, await jsonBody(c));
    const current = await repository.getActiveVoiceProfile(restaurantId, actor);
    const profile: VoiceProfile = {
      id: newId(), restaurantId, version: (current?.version ?? 0) + 1, status: input.activate ? 'active' : 'draft',
      defaultLanguage: input.defaultLanguage, supportedLanguages: input.supportedLanguages, formality: input.formality,
      warmth: input.warmth, brevity: input.brevity, wordMin: input.wordMin, wordMax: input.wordMax,
      emojiPolicy: input.emojiPolicy, preferredPhrases: input.preferredPhrases, prohibitedPhrases: input.prohibitedPhrases,
      ...(input.contactChannel ? { contactChannel: input.contactChannel } : {}), compensationPolicy: input.compensationPolicy,
      employeeNamePolicy: input.employeeNamePolicy, ...(input.activate ? { approvedBy: actor.id, approvedAt: new Date().toISOString() } : {}),
      createdAt: new Date().toISOString(),
    };
    const created = await repository.createVoiceProfile(profile, actor);
    await audit(repository, actor, { action: 'voice_profile.created', resourceType: 'voice_profile', resourceId: created.id, restaurantId, metadata: { version: created.version, status: created.status } });
    return c.json({ voiceProfile: created }, 201);
  });
}
