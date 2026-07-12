import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { FixedAuthProvider } from '../src/auth';
import { MemoryRepositoryFactory } from '../src/repositories/memory';
import { RuleBasedIntelligence } from '../src/services/intelligence';

const actor = { id: '11111111-1111-4111-8111-111111111111', email: 'owner@example.com', platformRole: 'user' as const };
const env = { SUPABASE_URL: 'test', SUPABASE_ANON_KEY: 'test' } as CloudflareBindings;

async function body(response: Response) {
  return response.json() as Promise<any>;
}

describe('Phase 1 API', () => {
  let factory: MemoryRepositoryFactory;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    factory = new MemoryRepositoryFactory();
    app = createApp({
      authProvider: new FixedAuthProvider(actor),
      repositoryFactory: factory,
      intelligenceFactory: () => new RuleBasedIntelligence(),
    });
  });

  async function createRestaurantWithVoice() {
    const orgResponse = await app.request('/v1/organizations', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Test Group' }),
    }, env);
    const organization = (await body(orgResponse)).organization;

    const restaurantResponse = await app.request('/v1/restaurants', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ organizationId: organization.id, brandName: 'Test Kitchen', defaultLanguage: 'English', timezone: 'Asia/Kolkata' }),
    }, env);
    const restaurant = (await body(restaurantResponse)).restaurant;

    const voiceResponse = await app.request(`/v1/restaurants/${restaurant.id}/voice-profiles`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        supportedLanguages: ['English'], wordMin: 5, wordMax: 120,
        preferredPhrases: ['Thank you for choosing Test Kitchen.'], prohibitedPhrases: ['valued customer'],
        contactChannel: 'support@example.com', compensationPolicy: 'approval_required', activate: true,
      }),
    }, env);
    expect(voiceResponse.status).toBe(201);
    return restaurant;
  }

  it('runs a green review from intake to confirmed publication', async () => {
    const restaurant = await createRestaurantWithVoice();
    const createResponse = await app.request(`/v1/restaurants/${restaurant.id}/reviews`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ rating: 5, reviewDate: '2026-07-12', reviewerDisplayName: 'Anu', originalText: 'Excellent food and wonderful service.', verified: true }),
    }, env);
    expect(createResponse.status).toBe(201);
    const reviewId = (await body(createResponse)).review.id;

    const processResponse = await app.request(`/v1/reviews/${reviewId}/process`, { method: 'POST' }, env);
    const processed = await body(processResponse);
    expect(processed.review.state).toBe('draft_ready');
    expect(processed.draft.text).toContain('Anu');

    const qaResponse = await app.request(`/v1/reviews/${reviewId}/qa`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ confirmedActions: [] }),
    }, env);
    const qa = await body(qaResponse);
    expect(qa.review.state).toBe('awaiting_approval');
    expect(qa.draft.status).toBe('qa_passed');

    const decisionResponse = await app.request(`/v1/reviews/${reviewId}/decision`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ decision: 'approved_unchanged', finalText: processed.draft.text, channel: 'web' }),
    }, env);
    expect((await body(decisionResponse)).review.state).toBe('approved');

    const publicationResponse = await app.request(`/v1/reviews/${reviewId}/publication`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ confirmed: true, evidence: 'https://example.test/review' }),
    }, env);
    expect((await body(publicationResponse)).review.state).toBe('published');

    const reportResponse = await app.request(`/v1/restaurants/${restaurant.id}/reports/weekly`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ periodStart: '2026-07-06', periodEnd: '2026-07-12' }),
    }, env);
    const report = (await body(reportResponse)).report;
    expect(report.summary.reviewsProcessed).toBe(1);
    expect(report.summary.byState.published).toBe(1);
  });

  it('escalates a food-safety review and creates no routine draft', async () => {
    const restaurant = await createRestaurantWithVoice();
    const createResponse = await app.request(`/v1/restaurants/${restaurant.id}/reviews`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ rating: 1, reviewDate: '2026-07-12', originalText: 'I had an allergic reaction and went to hospital.', verified: true }),
    }, env);
    const reviewId = (await body(createResponse)).review.id;
    const processResponse = await app.request(`/v1/reviews/${reviewId}/process`, { method: 'POST' }, env);
    const result = await body(processResponse);
    expect(result.review.state).toBe('escalated');
    expect(result.review.classification.risk).toBe('red');
    expect(result.draft).toBeUndefined();
    expect(result.action.priority).toBe('immediate');
  });

  it('does not allow publication before approval', async () => {
    const restaurant = await createRestaurantWithVoice();
    const response = await app.request(`/v1/restaurants/${restaurant.id}/reviews`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ rating: 5, reviewDate: '2026-07-12', originalText: 'Great.', verified: true }),
    }, env);
    const reviewId = (await body(response)).review.id;
    const publish = await app.request(`/v1/reviews/${reviewId}/publication`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ confirmed: true }),
    }, env);
    expect(publish.status).toBe(409);
  });
});
