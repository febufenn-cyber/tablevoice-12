import { z } from 'zod';
import type { Hono } from 'hono';
import type { AppEnv } from '../app-context';
import { audit, jsonBody, parse, requireRestaurantRole } from '../app-context';
import { voiceSystemForEnv } from '../voice/runtime';
import type { VoiceSystemFactory } from '../voice/service';

const managerRoles = ['buyer', 'approver', 'operator'] as const;
const viewerRoles = ['buyer', 'approver', 'operator', 'action_owner', 'viewer'] as const;
const category = z.enum(['PRAISE','FOOD_TASTE','PORTION','PRICE','SPEED','STAFF','HYGIENE','DELIVERY_DELAY','MISSING_ITEM','WRONG_ORDER','PACKAGING','AMBIENCE','PARKING','BILLING','RESERVATION','LISTING_INFO','SAFETY','HARASSMENT','FRAUD','FAKE_SUSPECTED','OTHER']);
const ruleKind = z.enum(['preferred_phrase','prohibited_phrase','greeting','acknowledgement','apology','contact','invitation','signoff','category_posture','language_policy','privacy_policy']);
const profileSchema = z.object({
  defaultLanguage: z.string().trim().min(2).max(80).optional(), supportedLanguages: z.array(z.string().trim().min(2).max(80)).min(1).max(20).optional(),
  formality: z.number().int().min(1).max(5).optional(), warmth: z.number().int().min(1).max(5).optional(), brevity: z.number().int().min(1).max(5).optional(),
  wordMin: z.number().int().min(5).max(200).optional(), wordMax: z.number().int().min(20).max(500).optional(), emojiPolicy: z.enum(['none','limited','allowed']).optional(),
  preferredPhrases: z.array(z.string().trim().min(1).max(240)).max(100).optional(), prohibitedPhrases: z.array(z.string().trim().min(1).max(240)).max(100).optional(),
  contactChannel: z.string().trim().max(240).optional(), compensationPolicy: z.enum(['never','approval_required','rule_based']).optional(), employeeNamePolicy: z.enum(['never','approval_required']).optional(),
});
const ruleSchema = z.object({ kind: ruleKind, value: z.string().trim().min(1).max(1000), category: category.optional(), language: z.string().trim().max(80).optional(), priority: z.number().int().min(0).max(100).default(50) });
const exampleSchema = z.object({ voiceProfileId: z.uuid().optional(), disposition: z.enum(['approved','rejected']), reviewText: z.string().trim().min(1).max(12000), replyText: z.string().trim().min(1).max(12000), reason: z.string().trim().max(1000).optional(), language: z.string().trim().min(2).max(80), expiresAt: z.iso.datetime().optional() });
const candidateSchema = z.object({ sourceReviewId: z.uuid().optional(), sourceDraftId: z.uuid().optional(), kind: ruleKind, proposedValue: z.string().trim().min(1).max(1000), scope: z.enum(['restaurant','category','language','one_off']), category: category.optional(), language: z.string().trim().max(80).optional(), reason: z.string().trim().min(3).max(1000) });

export function registerVoiceRoutes(app: Hono<AppEnv>, factory: VoiceSystemFactory = voiceSystemForEnv) {
  app.get('/v1/restaurants/:restaurantId/voice/versions', async (c) => {
    const restaurantId = c.req.param('restaurantId'); await requireRestaurantRole(c.get('repository'), restaurantId, c.get('actor'), [...viewerRoles]);
    return c.json({ versions: await factory(c.env).listVersions(restaurantId) });
  });
  app.post('/v1/restaurants/:restaurantId/voice/versions', async (c) => {
    const restaurantId = c.req.param('restaurantId'); const actor = c.get('actor'); const repository = c.get('repository');
    await requireRestaurantRole(repository, restaurantId, actor, [...managerRoles]); const input = parse(profileSchema, await jsonBody(c));
    const profile = await factory(c.env).createVersion(actor, restaurantId, input); await audit(repository, actor, { action: 'voice.version_created', resourceType: 'voice_profile', resourceId: profile.id, restaurantId, metadata: { version: profile.version } });
    return c.json({ profile }, 201);
  });
  app.get('/v1/restaurants/:restaurantId/voice/compare', async (c) => {
    const restaurantId = c.req.param('restaurantId'); await requireRestaurantRole(c.get('repository'), restaurantId, c.get('actor'), [...viewerRoles]);
    return c.json({ diff: await factory(c.env).compare(restaurantId, c.req.query('from') ?? '', c.req.query('to') ?? '') });
  });
  app.post('/v1/restaurants/:restaurantId/voice/versions/:profileId/rules', async (c) => {
    const restaurantId = c.req.param('restaurantId'); const actor = c.get('actor'); const repository = c.get('repository'); await requireRestaurantRole(repository, restaurantId, actor, [...managerRoles]);
    const rule = await factory(c.env).addRule(actor, restaurantId, c.req.param('profileId'), parse(ruleSchema, await jsonBody(c))); await audit(repository, actor, { action: 'voice.rule_added', resourceType: 'voice_rule', resourceId: rule.id, restaurantId, metadata: { profileId: rule.voiceProfileId, kind: rule.kind } });
    return c.json({ rule }, 201);
  });
  app.post('/v1/restaurants/:restaurantId/voice/examples', async (c) => {
    const restaurantId = c.req.param('restaurantId'); const actor = c.get('actor'); const repository = c.get('repository'); await requireRestaurantRole(repository, restaurantId, actor, [...managerRoles]);
    const example = await factory(c.env).addExample(actor, restaurantId, parse(exampleSchema, await jsonBody(c))); await audit(repository, actor, { action: 'voice.example_added', resourceType: 'voice_example', resourceId: example.id, restaurantId, metadata: { disposition: example.disposition } });
    return c.json({ example }, 201);
  });
  app.get('/v1/restaurants/:restaurantId/voice/candidates', async (c) => {
    const restaurantId = c.req.param('restaurantId'); await requireRestaurantRole(c.get('repository'), restaurantId, c.get('actor'), [...managerRoles]);
    return c.json({ candidates: await factory(c.env).store.listCandidates(restaurantId) });
  });
  app.post('/v1/restaurants/:restaurantId/voice/candidates', async (c) => {
    const restaurantId = c.req.param('restaurantId'); const actor = c.get('actor'); const repository = c.get('repository'); await requireRestaurantRole(repository, restaurantId, actor, [...managerRoles]);
    const candidate = await factory(c.env).addCandidate(restaurantId, parse(candidateSchema, await jsonBody(c))); await audit(repository, actor, { action: 'voice.candidate_created', resourceType: 'voice_rule_candidate', resourceId: candidate.id, restaurantId, metadata: { kind: candidate.kind, scope: candidate.scope } });
    return c.json({ candidate }, 201);
  });
  app.post('/v1/restaurants/:restaurantId/voice/candidates/:candidateId/decision', async (c) => {
    const restaurantId = c.req.param('restaurantId'); const actor = c.get('actor'); const repository = c.get('repository'); await requireRestaurantRole(repository, restaurantId, actor, ['buyer','approver']);
    const input = parse(z.object({ decision: z.enum(['approved','rejected']), targetProfileId: z.uuid().optional() }), await jsonBody(c));
    const result = await factory(c.env).decideCandidate(actor, restaurantId, c.req.param('candidateId'), input.decision, input.targetProfileId); await audit(repository, actor, { action: 'voice.candidate_decided', resourceType: 'voice_rule_candidate', resourceId: c.req.param('candidateId'), restaurantId, metadata: { decision: input.decision } });
    return c.json(result);
  });
  app.post('/v1/restaurants/:restaurantId/voice/versions/:profileId/activate', async (c) => {
    const restaurantId = c.req.param('restaurantId'); const actor = c.get('actor'); const repository = c.get('repository'); await requireRestaurantRole(repository, restaurantId, actor, ['buyer','approver']);
    const input = parse(z.object({ evidence: z.string().trim().min(3).max(2000) }), await jsonBody(c)); const result = await factory(c.env).activate(actor, restaurantId, c.req.param('profileId'), input.evidence); await audit(repository, actor, { action: 'voice.version_activated', resourceType: 'voice_profile', resourceId: result.profile.id, restaurantId, metadata: { version: result.profile.version } });
    return c.json(result);
  });
  app.post('/v1/restaurants/:restaurantId/voice/versions/:profileId/rollback', async (c) => {
    const restaurantId = c.req.param('restaurantId'); const actor = c.get('actor'); const repository = c.get('repository'); await requireRestaurantRole(repository, restaurantId, actor, ['buyer','approver']);
    const input = parse(z.object({ evidence: z.string().trim().min(3).max(2000) }), await jsonBody(c)); const result = await factory(c.env).rollback(actor, restaurantId, c.req.param('profileId'), input.evidence); await audit(repository, actor, { action: 'voice.version_rolled_back', resourceType: 'voice_profile', resourceId: result.profile.id, restaurantId, metadata: { version: result.profile.version } });
    return c.json(result);
  });
  app.post('/v1/restaurants/:restaurantId/voice/versions/:profileId/preview', async (c) => {
    const restaurantId = c.req.param('restaurantId'); await requireRestaurantRole(c.get('repository'), restaurantId, c.get('actor'), [...managerRoles]);
    const input = parse(z.object({ reviewText: z.string().trim().min(1).max(12000), category, language: z.string().trim().min(2).max(80) }), await jsonBody(c));
    return c.json({ preview: await factory(c.env).preview(restaurantId, c.req.param('profileId'), input.reviewText, input.category, input.language) });
  });
  app.get('/v1/restaurants/:restaurantId/voice/versions/:profileId/evaluation', async (c) => {
    const restaurantId = c.req.param('restaurantId'); await requireRestaurantRole(c.get('repository'), restaurantId, c.get('actor'), [...viewerRoles]);
    return c.json({ evaluation: await factory(c.env).evaluation(restaurantId, c.req.param('profileId')) });
  });
}
