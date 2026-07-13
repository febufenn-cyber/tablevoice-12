import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { FixedAuthProvider } from '../src/auth';
import { MemoryRepositoryFactory } from '../src/repositories/memory';
import { RuleBasedIntelligence } from '../src/services/intelligence';
import { MemoryWorkflowStore } from '../src/workflow/store';

const actor = { id: '11111111-1111-4111-8111-111111111111', email: 'owner@example.com', platformRole: 'user' as const };
const env = { SUPABASE_URL: 'test', SUPABASE_ANON_KEY: 'test' } as CloudflareBindings;

async function body(response: Response) { return response.json() as Promise<any>; }

describe('Phase 3 production inbox', () => {
  let factory: MemoryRepositoryFactory;
  let workflowStore: MemoryWorkflowStore;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    factory = new MemoryRepositoryFactory();
    workflowStore = new MemoryWorkflowStore();
    app = createApp({
      authProvider: new FixedAuthProvider(actor),
      repositoryFactory: factory,
      intelligenceFactory: () => new RuleBasedIntelligence(),
      workflowFactory: () => ({ enabled: true, store: workflowStore }),
    });
  });

  async function createRestaurantWithVoice() {
    const orgResponse = await app.request('/v1/organizations', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Workflow Group' }),
    }, env);
    const organization = (await body(orgResponse)).organization;
    const restaurantResponse = await app.request('/v1/restaurants', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ organizationId: organization.id, brandName: 'Queue Kitchen', defaultLanguage: 'English', timezone: 'Asia/Kolkata' }),
    }, env);
    const restaurant = (await body(restaurantResponse)).restaurant;
    const voiceResponse = await app.request(`/v1/restaurants/${restaurant.id}/voice-profiles`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        supportedLanguages: ['English'], wordMin: 5, wordMax: 120,
        preferredPhrases: ['Thank you for choosing Queue Kitchen.'], prohibitedPhrases: ['valued customer'],
        contactChannel: 'support@example.com', compensationPolicy: 'approval_required', activate: true,
      }),
    }, env);
    expect(voiceResponse.status).toBe(201);
    return restaurant;
  }

  async function createReview(restaurantId: string, text = 'Excellent food and friendly service.') {
    const response = await app.request(`/v1/restaurants/${restaurantId}/reviews`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ rating: 5, reviewDate: '2026-07-13', reviewerDisplayName: 'Anu', originalText: text, verified: true }),
    }, env);
    expect(response.status).toBe(201);
    return (await body(response)).review;
  }

  it('supports queue claiming, SLA summary, and optimistic work-item updates', async () => {
    const restaurant = await createRestaurantWithVoice();
    const review = await createReview(restaurant.id);
    const inboxResponse = await app.request(`/v1/restaurants/${restaurant.id}/inbox`, {}, env);
    const inbox = await body(inboxResponse);
    expect(inboxResponse.status).toBe(200);
    expect(inbox.items).toHaveLength(1);
    expect(inbox.items[0].reviewId).toBe(review.id);

    const originalVersion = inbox.items[0].workflowVersion;
    const claimResponse = await app.request(`/v1/reviews/${review.id}/claim`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ expectedVersion: originalVersion }),
    }, env);
    const claimed = (await body(claimResponse)).workItem;
    expect(claimed.assigneeId).toBe(actor.id);
    expect(claimed.workflowVersion).toBe(originalVersion + 1);

    const staleResponse = await app.request(`/v1/reviews/${review.id}/work-item`, {
      method: 'PATCH', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ expectedVersion: originalVersion, priority: 'urgent' }),
    }, env);
    expect(staleResponse.status).toBe(409);
    expect((await body(staleResponse)).error.code).toBe('stale_work_item');

    const overdueResponse = await app.request(`/v1/reviews/${review.id}/work-item`, {
      method: 'PATCH', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ expectedVersion: claimed.workflowVersion, dueAt: '2026-01-01T00:00:00.000Z' }),
    }, env);
    expect(overdueResponse.status).toBe(200);

    const summaryResponse = await app.request(`/v1/restaurants/${restaurant.id}/inbox/summary`, {}, env);
    const summary = (await body(summaryResponse)).summary;
    expect(summary.total).toBe(1);
    expect(summary.overdue).toBe(1);
  });

  it('uses an authenticated one-time approval action and rejects replay', async () => {
    const restaurant = await createRestaurantWithVoice();
    const review = await createReview(restaurant.id);
    const processed = await body(await app.request(`/v1/reviews/${review.id}/process`, { method: 'POST' }, env));
    const qa = await body(await app.request(`/v1/reviews/${review.id}/qa`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ confirmedActions: [] }),
    }, env));
    expect(qa.review.state).toBe('awaiting_approval');

    const actionResponse = await app.request(`/v1/reviews/${review.id}/approval-actions`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ intendedActorId: actor.id, ttlMinutes: 30 }),
    }, env);
    const action = (await body(actionResponse)).action;
    expect(actionResponse.status).toBe(201);

    const previewResponse = await app.request(action.actionPath, {}, env);
    const preview = await body(previewResponse);
    expect(preview.review.id).toBe(review.id);
    expect(preview.allowedDecisions).toContain('approved_unchanged');

    const decisionResponse = await app.request(action.actionPath, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        decision: 'approved_unchanged', finalText: processed.draft.text, channel: 'email_link',
        expectedReviewUpdatedAt: preview.review.updatedAt,
      }),
    }, env);
    const decision = await body(decisionResponse);
    expect(decisionResponse.status).toBe(200);
    expect(decision.review.state).toBe('approved');

    const replayResponse = await app.request(action.actionPath, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ decision: 'approved_unchanged', finalText: processed.draft.text, channel: 'email_link' }),
    }, env);
    expect(replayResponse.status).toBeGreaterThanOrEqual(400);
  });

  it('rejects stale approval screens and records manual publication attempts', async () => {
    const restaurant = await createRestaurantWithVoice();
    const review = await createReview(restaurant.id);
    const processed = await body(await app.request(`/v1/reviews/${review.id}/process`, { method: 'POST' }, env));
    const qa = await body(await app.request(`/v1/reviews/${review.id}/qa`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ confirmedActions: [] }),
    }, env));

    const staleDecision = await app.request(`/v1/reviews/${review.id}/decision`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        decision: 'approved_unchanged', finalText: processed.draft.text, channel: 'web',
        expectedReviewUpdatedAt: '2026-01-01T00:00:00.000Z',
      }),
    }, env);
    expect(staleDecision.status).toBe(409);
    expect((await body(staleDecision)).error.code).toBe('stale_review');

    const decision = await app.request(`/v1/reviews/${review.id}/decision`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        decision: 'approved_unchanged', finalText: processed.draft.text, channel: 'web',
        expectedReviewUpdatedAt: qa.review.updatedAt,
      }),
    }, env);
    expect(decision.status).toBe(200);

    const publication = await app.request(`/v1/reviews/${review.id}/publication`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'idempotency-key': 'manual-publish-1' },
      body: JSON.stringify({ confirmed: true, evidence: 'operator screenshot' }),
    }, env);
    expect(publication.status).toBe(200);
    expect((await body(publication)).publicationAttempt.status).toBe('succeeded');

    const attemptsResponse = await app.request(`/v1/reviews/${review.id}/publication-attempts`, {}, env);
    const attempts = (await body(attemptsResponse)).attempts;
    expect(attempts).toHaveLength(1);
    expect(attempts[0].idempotencyKey).toBe('manual-publish-1');
  });
});
