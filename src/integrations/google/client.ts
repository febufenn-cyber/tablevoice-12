import { AppError } from '../../lib/errors';
import type { GoogleAccount, GoogleLocation, GoogleReview, GoogleTokenResponse } from './types';

export interface GoogleClientConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export interface GoogleReviewsResult {
  reviews: GoogleReview[];
  pagesFetched: number;
}

function resourceId(name: string, expected: string): string {
  const [prefix, id] = name.split('/');
  if (prefix !== expected || !id) throw new AppError(`Invalid Google resource name: ${name}`, 422, 'google_resource_invalid');
  return id;
}

function googleError(payload: unknown, fallback: string): string {
  if (payload && typeof payload === 'object') {
    const root = payload as Record<string, unknown>;
    const error = root.error;
    if (error && typeof error === 'object') {
      const message = (error as Record<string, unknown>).message;
      if (typeof message === 'string') return message;
    }
    if (typeof root.error_description === 'string') return root.error_description;
  }
  return fallback;
}

export class GoogleBusinessClient {
  constructor(
    private readonly config: GoogleClientConfig,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  buildAuthorizationUrl(state: string, codeChallenge: string): string {
    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    url.search = new URLSearchParams({
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri,
      response_type: 'code',
      scope: 'https://www.googleapis.com/auth/business.manage',
      access_type: 'offline',
      include_granted_scopes: 'true',
      prompt: 'consent',
      state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    }).toString();
    return url.toString();
  }

  async exchangeCode(code: string, codeVerifier: string): Promise<GoogleTokenResponse> {
    return this.tokenRequest({
      code,
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      redirect_uri: this.config.redirectUri,
      grant_type: 'authorization_code',
      code_verifier: codeVerifier,
    });
  }

  async refresh(refreshToken: string): Promise<GoogleTokenResponse> {
    return this.tokenRequest({
      refresh_token: refreshToken,
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      grant_type: 'refresh_token',
    });
  }

  async revoke(token: string): Promise<void> {
    const response = await this.fetcher(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, {
      method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    });
    if (!response.ok) throw new AppError('Google token revocation failed.', 502, 'google_revoke_failed');
  }

  async listAccounts(accessToken: string): Promise<GoogleAccount[]> {
    const accounts: GoogleAccount[] = [];
    let pageToken = '';
    do {
      const url = new URL('https://mybusinessaccountmanagement.googleapis.com/v1/accounts');
      url.searchParams.set('pageSize', '20');
      if (pageToken) url.searchParams.set('pageToken', pageToken);
      const page = await this.authorizedJson<{ accounts?: GoogleAccount[]; nextPageToken?: string }>(url, accessToken);
      accounts.push(...(page.accounts ?? [])); pageToken = page.nextPageToken ?? '';
    } while (pageToken && accounts.length < 500);
    return accounts;
  }

  async listLocations(accessToken: string, accountName: string): Promise<GoogleLocation[]> {
    const accountId = resourceId(accountName, 'accounts');
    const locations: GoogleLocation[] = [];
    let pageToken = '';
    do {
      const url = new URL(`https://mybusinessbusinessinformation.googleapis.com/v1/accounts/${encodeURIComponent(accountId)}/locations`);
      url.searchParams.set('pageSize', '100');
      url.searchParams.set('readMask', 'name,title,storeCode,metadata');
      url.searchParams.set('orderBy', 'title');
      if (pageToken) url.searchParams.set('pageToken', pageToken);
      const page = await this.authorizedJson<{ locations?: GoogleLocation[]; nextPageToken?: string }>(url, accessToken);
      locations.push(...(page.locations ?? [])); pageToken = page.nextPageToken ?? '';
    } while (pageToken && locations.length < 5000);
    return locations;
  }

  async listReviews(accessToken: string, accountName: string, locationName: string): Promise<GoogleReviewsResult> {
    const accountId = resourceId(accountName, 'accounts');
    const locationId = resourceId(locationName, 'locations');
    const reviews: GoogleReview[] = [];
    let pageToken = ''; let pagesFetched = 0;
    do {
      const url = new URL(`https://mybusiness.googleapis.com/v4/accounts/${encodeURIComponent(accountId)}/locations/${encodeURIComponent(locationId)}/reviews`);
      url.searchParams.set('pageSize', '50');
      url.searchParams.set('orderBy', 'updateTime desc');
      if (pageToken) url.searchParams.set('pageToken', pageToken);
      const page = await this.authorizedJson<{ reviews?: GoogleReview[]; nextPageToken?: string }>(url, accessToken);
      reviews.push(...(page.reviews ?? [])); pageToken = page.nextPageToken ?? ''; pagesFetched += 1;
    } while (pageToken && reviews.length < 10000);
    return { reviews, pagesFetched };
  }

  async updateReply(accessToken: string, accountName: string, locationName: string, reviewId: string, comment: string): Promise<{ comment?: string; updateTime?: string }> {
    const accountId = resourceId(accountName, 'accounts');
    const locationId = resourceId(locationName, 'locations');
    const url = new URL(`https://mybusiness.googleapis.com/v4/accounts/${encodeURIComponent(accountId)}/locations/${encodeURIComponent(locationId)}/reviews/${encodeURIComponent(reviewId)}/reply`);
    return this.authorizedJson(url, accessToken, { method: 'PUT', body: JSON.stringify({ comment }) });
  }

  async deleteReply(accessToken: string, accountName: string, locationName: string, reviewId: string): Promise<void> {
    const accountId = resourceId(accountName, 'accounts');
    const locationId = resourceId(locationName, 'locations');
    const url = new URL(`https://mybusiness.googleapis.com/v4/accounts/${encodeURIComponent(accountId)}/locations/${encodeURIComponent(locationId)}/reviews/${encodeURIComponent(reviewId)}/reply`);
    await this.authorizedJson<Record<string, never>>(url, accessToken, { method: 'DELETE' });
  }

  private async tokenRequest(values: Record<string, string>): Promise<GoogleTokenResponse> {
    const response = await this.fetcher('https://oauth2.googleapis.com/token', {
      method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(values),
    });
    const payload = await response.json().catch(() => ({})) as unknown;
    if (!response.ok) throw new AppError(googleError(payload, 'Google token exchange failed.'), 502, 'google_token_failed');
    return payload as GoogleTokenResponse;
  }

  private async authorizedJson<T>(url: URL, accessToken: string, init: RequestInit = {}): Promise<T> {
    const response = await this.fetcher(url.toString(), {
      ...init,
      headers: {
        authorization: `Bearer ${accessToken}`,
        'content-type': 'application/json',
        'x-goog-api-format-version': '2',
        ...(init.headers ?? {}),
      },
    });
    if (response.status === 204) return {} as T;
    const payload = await response.json().catch(() => ({})) as unknown;
    if (!response.ok) {
      const status = response.status === 401 ? 401 : response.status === 403 ? 403 : 502;
      throw new AppError(googleError(payload, `Google API request failed (${response.status}).`), status, 'google_api_failed', payload);
    }
    return payload as T;
  }
}
