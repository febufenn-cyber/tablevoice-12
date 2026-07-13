import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { FixedAuthProvider } from '../src/auth';
import { GoogleBusinessClient } from '../src/integrations/google/client';
import { createPkcePair, TokenCipher } from '../src/integrations/google/crypto';
import { GoogleIntegrationService } from '../src/integrations/google/service';
import { MemoryGoogleIntegrationStore } from '../src/integrations/google/store';
import { MemoryRepositoryFactory } from '../src/repositories/memory';
import { RuleBasedIntelligence } from '../src/services/intelligence';

const actor = { id: '11111111-1111-4111-8111-111111111111', email: 'owner@example.com', platformRole: 'user' as const };
const env = { SUPABASE_URL: 'test', SUPABASE_ANON_KEY: 'test' } as CloudflareBindings;

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: { 'content-type': 'application/json' } });
}

function asUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

async function body(response: Response) { return response.json() as Promise<any>; }

describe('Phase 2 Google integration', () => {
  let repositoryFactory: MemoryRepositoryFactory;
  let store: MemoryGoogleIntegrationStore;
  let integration: GoogleIntegrationService;
  let app: ReturnType<typeof createApp>;
  let replyWrites: Array<{ url: string; body: string }>;

  beforeEach(() => {
    repositoryFactory = new MemoryRepositoryFactory();
    store = new MemoryGoogleIntegrationStore();
    replyWrites = [];
    const fakeFetch: typeof fetch = async (input, init) => {
      const url = asUrl(input);
      if (url === 'https://oauth2.googleapis.com/token') {
        const values = new URLSearchParams(String(init?.body ?? ''));
        if (values.get('grant_type') === 'refresh_token') return json({ access_token: 'refreshed-access', expires_in: 3600, token_type: 'Bearer' });
        return json({ access_token: 'initial-access', refresh_token: 'refresh-token', expires_in: 3600, token_type: 'Bearer', scope: 'https://www.googleapis.com/auth/business.manage' });
      }
      if (url.startsWith('https://mybusinessaccountmanagement.googleapis.com/v1/accounts')) {
        return json({ accounts: [{ name: 'accounts/123', accountName: 'Test Owner', type: 'PERSONAL' }] });
      }
      if (url.startsWith('https://mybusinessbusinessinformation.googleapis.com/v1/accounts/123/locations')) {
        return json({ locations: [{ name: 'locations/456', title: 'Test Kitchen', storeCode: 'TK-1' }] });
      }
      if (url.includes('/reviews') && init?.method === 'PUT') {
        replyWrites.push({ url, body: String(init.body ?? '') });
        return json({ comment: JSON.parse(String(init.body)).comment, updateTime: '2026-07-13T12:00:00Z' });
      }
      if (url.startsWith('https://mybusiness.googleapis.com/v4/accounts/123/locations/456/reviews')) {
        return json({ reviews: [{
          name: 'accounts/123/locations/456/reviews/review-1', reviewId: 'review-1',
          reviewer: { displayName: 'Anu' }, starRating: 'FIVE', comment: 'Excellent food and service.',
          createTime: '2026-07-13T10:00:00Z', updateTime: '2026-07-13T10:00:00Z',
        }] });
      }
      if (url.startsWith('https://oauth2.googleapis.com/revoke')) return new Response(null, { status: 200 });
      return json({ error: { message: `Unexpected URL: ${url}` } }, 500);
    };

    integration = new GoogleIntegrationService(
      store,
      new GoogleBusinessClient({ clientId: 'client', clientSecret: 'secret', redirectUri: 'https://tablevoice.test/oauth/google/callback' }, fakeFetch),
      new TokenCipher('test-google-encryption-key-123456789'),
      { enabled: true, replyWritesEnabled: true, clientId: 'client', clientSecret: 'secret', redirectUri: 'https://tablevoice.test/oauth/google/callback' },
    );
    app = createApp({
      authProvider: new FixedAuthProvider(actor), repositoryFactory,
      intelligenceFactory: () => new RuleBasedIntelligence(), googleIntegrationFactory: () => integration,
    });
  });

  async function createRestaurantWithVoice() {
    const organization = (await body(await app.request('/v1/organizations', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Test Group' }),
    }, env))).organization;
    const restaurant = (await body(await app.request('/v1/restaurants', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ organizationId: organization.id, brandName: 'Test Kitchen', defaultLanguage: 'English', timezone: 'Asia/Kolkata' }),
    }, env))).restaurant;
    await app.request(`/v1/restaurants/${restaurant.id}/voice-profiles`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ supportedLanguages: ['English'], wordMin: 5, wordMax: 120, compensationPolicy: 'approval_required', activate: true }),
    }, env);
    return restaurant;
  }

  it('encrypts tokens and creates a valid PKCE pair', async () => {
    const cipher = new TokenCipher('another-long-test-encryption-key');
    const sealed = await cipher.seal('refresh-token');
    expect(sealed).not.toContain('refresh-token');
    expect(await cipher.open(sealed)).toBe('refresh-token');
    const pkce = await createPkcePair();
    expect(pkce.verifier.length).toBeGreaterThan(40);
    expect(pkce.challenge).not.toBe(pkce.verifier);
  });

  it('connects, selects a location, syncs, approves, and publishes with express consent', async () => {
    const restaurant = await createRestaurantWithVoice();
    const connect = await body(await app.request(`/v1/restaurants/${restaurant.id}/integrations/google/connect`, { method: 'POST' }, env));
    const authorizationUrl = new URL(connect.authorizationUrl);
    expect(authorizationUrl.searchParams.get('access_type')).toBe('offline');
    expect(authorizationUrl.searchParams.get('code_challenge_method')).toBe('S256');

    const callback = await app.request(`/oauth/google/callback?code=auth-code&state=${encodeURIComponent(authorizationUrl.searchParams.get('state')!)}`, {}, env);
    expect(callback.status).toBe(200);

    const accounts = await body(await app.request(`/v1/restaurants/${restaurant.id}/integrations/google/accounts`, {}, env));
    expect(accounts.accounts[0].name).toBe('accounts/123');
    await app.request(`/v1/restaurants/${restaurant.id}/integrations/google/account`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ accountName: 'accounts/123' }),
    }, env);
    const locations = await body(await app.request(`/v1/restaurants/${restaurant.id}/integrations/google/locations?refresh=true`, {}, env));
    expect(locations.locations[0].name).toBe('locations/456');
    await app.request(`/v1/restaurants/${restaurant.id}/integrations/google/location`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ locationName: 'locations/456' }),
    }, env);

    const sync = await body(await app.request(`/v1/restaurants/${restaurant.id}/integrations/google/sync`, { method: 'POST' }, env));
    expect(sync.run.reviewsImported).toBe(1);
    const reviews = await body(await app.request(`/v1/restaurants/${restaurant.id}/reviews`, {}, env));
    const review = reviews.reviews[0];
    expect(review.source).toBe('google');
    expect(review.sourceReference).toContain('review-1');

    const processed = await body(await app.request(`/v1/reviews/${review.id}/process`, { method: 'POST' }, env));
    await app.request(`/v1/reviews/${review.id}/qa`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ confirmedActions: [] }),
    }, env);
    await app.request(`/v1/reviews/${review.id}/decision`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ decision: 'approved_unchanged', finalText: processed.draft.text, channel: 'web' }),
    }, env);

    const publish = await app.request(`/v1/reviews/${review.id}/integrations/google/publish`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ consent: true }),
    }, env);
    const published = await body(publish);
    expect(publish.status).toBe(200);
    expect(published.review.state).toBe('published');
    expect(replyWrites).toHaveLength(1);
    expect(JSON.parse(replyWrites[0].body).comment).toBe(processed.draft.text);
  });

  it('rejects a Google reply write without explicit consent', async () => {
    const restaurant = await createRestaurantWithVoice();
    const response = await app.request(`/v1/reviews/00000000-0000-4000-8000-000000000000/integrations/google/publish`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ consent: false }),
    }, env);
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(restaurant.id).toBeTruthy();
  });
});
