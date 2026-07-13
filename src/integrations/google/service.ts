import type { Actor, Review } from '../../domain/types';
import { AppError } from '../../lib/errors';
import { newId } from '../../lib/id';
import type { Repository } from '../../repositories/repository';
import { GoogleBusinessClient } from './client';
import { createPkcePair, randomBase64Url, sha256Base64Url, TokenCipher } from './crypto';
import {
  MemoryGoogleIntegrationStore,
  SupabaseGoogleIntegrationStore,
  type GoogleIntegrationStore,
} from './store';
import type { GoogleAccount, GoogleConnection, GoogleReview, GoogleSyncRun } from './types';

export interface GoogleIntegrationConfig {
  enabled: boolean;
  replyWritesEnabled: boolean;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  successUrl?: string;
}

export interface GoogleConnectionView {
  id: string;
  restaurantId: string;
  status: GoogleConnection['status'];
  scope: string;
  expiresAt: string;
  externalAccountName?: string;
  externalAccountDisplayName?: string;
  selectedLocationName?: string;
  selectedLocationTitle?: string;
  connectedBy: string;
  connectedAt: string;
  updatedAt: string;
  disconnectedAt?: string;
  lastError?: string;
}

export interface GoogleIntegrationFactory {
  (env: CloudflareBindings): GoogleIntegrationService;
}

const ratingMap = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 } as const;
const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;

function addSeconds(seconds: number): string {
  return new Date(Date.now() + Math.max(30, seconds) * 1000).toISOString();
}

function reviewText(review: GoogleReview): string {
  return review.comment?.trim() || `${ratingMap[review.starRating]}-star Google rating without a written comment.`;
}

function publicConnection(connection: GoogleConnection): GoogleConnectionView {
  const {
    accessTokenCiphertext: _accessToken,
    refreshTokenCiphertext: _refreshToken,
    tokenType: _tokenType,
    ...view
  } = connection;
  return view;
}

export class GoogleIntegrationService {
  constructor(
    private readonly store: GoogleIntegrationStore,
    private readonly client: GoogleBusinessClient,
    private readonly cipher: TokenCipher,
    readonly config: GoogleIntegrationConfig,
  ) {}

  async startAuthorization(actor: Actor, restaurantId: string) {
    this.assertEnabled();
    const state = randomBase64Url(32);
    const { verifier, challenge } = await createPkcePair();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 10 * 60 * 1000).toISOString();
    await this.store.createOAuthFlow({
      id: newId(),
      restaurantId,
      actorId: actor.id,
      stateHash: await sha256Base64Url(state),
      codeVerifierCiphertext: await this.cipher.seal(verifier),
      redirectUri: this.config.redirectUri,
      expiresAt,
      createdAt: now.toISOString(),
    });
    return { authorizationUrl: this.client.buildAuthorizationUrl(state, challenge), expiresAt };
  }

  async completeAuthorization(input: { code?: string; state?: string; error?: string }) {
    this.assertEnabled();
    if (!input.state) throw new AppError('Missing OAuth state.', 400, 'google_oauth_state_missing');
    const now = new Date().toISOString();
    const flow = await this.store.consumeOAuthFlow(await sha256Base64Url(input.state), now);
    if (!flow) throw new AppError('OAuth state is invalid, expired, or already used.', 400, 'google_oauth_state_invalid');
    if (input.error) throw new AppError(`Google authorization was not completed: ${input.error}`, 400, 'google_oauth_denied');
    if (!input.code) throw new AppError('Missing Google authorization code.', 400, 'google_oauth_code_missing');

    const tokens = await this.client.exchangeCode(input.code, await this.cipher.open(flow.codeVerifierCiphertext));
    const existing = await this.store.getConnection(flow.restaurantId);
    const refreshTokenCiphertext = tokens.refresh_token
      ? await this.cipher.seal(tokens.refresh_token)
      : existing?.refreshTokenCiphertext;
    if (!refreshTokenCiphertext) {
      throw new AppError('Google did not return a refresh token. Reconnect with consent.', 409, 'google_refresh_token_missing');
    }

    const connection = await this.store.upsertConnection({
      id: existing?.id ?? newId(),
      restaurantId: flow.restaurantId,
      status: 'connected',
      accessTokenCiphertext: await this.cipher.seal(tokens.access_token),
      refreshTokenCiphertext,
      tokenType: tokens.token_type ?? 'Bearer',
      scope: tokens.scope ?? 'https://www.googleapis.com/auth/business.manage',
      expiresAt: addSeconds(tokens.expires_in),
      externalAccountName: existing?.externalAccountName,
      externalAccountDisplayName: existing?.externalAccountDisplayName,
      selectedLocationName: existing?.selectedLocationName,
      selectedLocationTitle: existing?.selectedLocationTitle,
      connectedBy: flow.actorId,
      connectedAt: existing?.connectedAt ?? now,
      updatedAt: now,
      lastError: '',
    });
    return publicConnection(connection);
  }

  async status(restaurantId: string): Promise<GoogleConnectionView | null> {
    const connection = await this.store.getConnection(restaurantId);
    return connection ? publicConnection(connection) : null;
  }

  async listAccounts(restaurantId: string): Promise<GoogleAccount[]> {
    return this.client.listAccounts(await this.accessToken(restaurantId));
  }

  async selectAccount(restaurantId: string, accountName: string) {
    const account = (await this.listAccounts(restaurantId)).find((candidate) => candidate.name === accountName);
    if (!account) throw new AppError('The selected Google account is not accessible.', 422, 'google_account_invalid');
    const updated = await this.store.updateConnection(restaurantId, {
      externalAccountName: account.name,
      externalAccountDisplayName: account.accountName ?? account.name,
      selectedLocationName: '',
      selectedLocationTitle: '',
      updatedAt: new Date().toISOString(),
      lastError: '',
    });
    await this.store.replaceLocations(restaurantId, updated.id, []);
    return publicConnection(updated);
  }

  async refreshLocations(restaurantId: string) {
    const connection = await this.requiredConnection(restaurantId);
    if (!connection.externalAccountName) throw new AppError('Select a Google account first.', 409, 'google_account_required');
    const locations = await this.client.listLocations(await this.accessToken(restaurantId), connection.externalAccountName);
    return this.store.replaceLocations(restaurantId, connection.id, locations.map((location) => ({
      name: location.name,
      title: location.title ?? location.name,
      storeCode: location.storeCode,
      metadata: location.metadata,
    })));
  }

  async listStoredLocations(restaurantId: string) {
    return this.store.listLocations(restaurantId);
  }

  async selectLocation(restaurantId: string, locationName: string) {
    let locations = await this.store.listLocations(restaurantId);
    if (!locations.length) locations = await this.refreshLocations(restaurantId);
    if (!locations.some((location) => location.name === locationName)) {
      throw new AppError('The selected Google location is not accessible.', 422, 'google_location_invalid');
    }
    const selected = await this.store.selectLocation(restaurantId, locationName);
    await this.store.updateConnection(restaurantId, {
      selectedLocationName: selected.name,
      selectedLocationTitle: selected.title,
      updatedAt: new Date().toISOString(),
      lastError: '',
    });
    return selected;
  }

  async syncReviews(actor: Actor, repository: Repository, restaurantId: string) {
    const connection = await this.requiredConnection(restaurantId);
    if (!connection.externalAccountName || !connection.selectedLocationName) {
      throw new AppError('Select a Google account and location before syncing.', 409, 'google_location_required');
    }

    const run: GoogleSyncRun = {
      id: newId(),
      restaurantId,
      connectionId: connection.id,
      status: 'running',
      reviewsSeen: 0,
      reviewsImported: 0,
      reviewsUpdated: 0,
      reviewsSkipped: 0,
      pagesFetched: 0,
      startedAt: new Date().toISOString(),
    };
    await this.store.createSyncRun(run);

    try {
      const result = await this.client.listReviews(
        await this.accessToken(restaurantId),
        connection.externalAccountName,
        connection.selectedLocationName,
      );
      run.pagesFetched = result.pagesFetched;
      run.reviewsSeen = result.reviews.length;

      for (const googleReview of result.reviews) {
        const link = await this.store.findReviewLinkByGoogleName(restaurantId, googleReview.name);
        if (link && link.googleUpdateTime === googleReview.updateTime) {
          run.reviewsSkipped += 1;
          await this.store.upsertReviewLink({
            ...link,
            contentExpiresAt: new Date(Date.now() + thirtyDaysMs).toISOString(),
            updatedAt: new Date().toISOString(),
          });
          continue;
        }

        let localReview = link ? await repository.getReview(link.localReviewId, actor) : null;
        if (localReview) {
          localReview = await repository.updateReview(localReview.id, {
            rating: ratingMap[googleReview.starRating],
            reviewDate: googleReview.createTime.slice(0, 10),
            reviewerDisplayName: googleReview.reviewer?.displayName,
            originalText: reviewText(googleReview),
            sourceReference: googleReview.name,
            state: 'verified',
            updatedAt: new Date().toISOString(),
          }, actor);
          run.reviewsUpdated += 1;
        } else {
          const now = new Date().toISOString();
          const input = {
            id: newId(),
            restaurantId,
            source: 'google',
            sourceReference: googleReview.name,
            rating: ratingMap[googleReview.starRating],
            reviewDate: googleReview.createTime.slice(0, 10),
            reviewerDisplayName: googleReview.reviewer?.displayName,
            originalText: reviewText(googleReview),
            serviceMode: 'unknown',
            ingestionMethod: 'api',
            verificationStatus: 'verified',
            state: 'verified',
            createdBy: actor.id,
            createdAt: now,
            updatedAt: now,
          } as unknown as Review;
          localReview = await repository.createReview(input, actor);
          run.reviewsImported += 1;
        }

        const now = new Date().toISOString();
        await this.store.upsertReviewLink({
          id: link?.id ?? newId(),
          restaurantId,
          connectionId: connection.id,
          googleReviewName: googleReview.name,
          googleReviewId: googleReview.reviewId,
          localReviewId: localReview.id,
          googleUpdateTime: googleReview.updateTime,
          googleCreateTime: googleReview.createTime,
          replyComment: googleReview.reviewReply?.comment,
          replyUpdateTime: googleReview.reviewReply?.updateTime,
          contentExpiresAt: new Date(Date.now() + thirtyDaysMs).toISOString(),
          createdAt: link?.createdAt ?? now,
          updatedAt: now,
        });
      }

      return this.store.updateSyncRun(run.id, {
        ...run,
        status: 'succeeded',
        completedAt: new Date().toISOString(),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown Google sync error.';
      await this.store.updateConnection(restaurantId, {
        status: 'error',
        lastError: message,
        updatedAt: new Date().toISOString(),
      }).catch(() => undefined);
      await this.store.updateSyncRun(run.id, {
        ...run,
        status: 'failed',
        error: message,
        completedAt: new Date().toISOString(),
      });
      throw error;
    }
  }

  async publishApprovedReply(actor: Actor, repository: Repository, reviewId: string, consent: boolean) {
    if (!this.config.replyWritesEnabled) {
      throw new AppError('Google reply writes are disabled for this environment.', 503, 'google_reply_writes_disabled');
    }
    if (!consent) {
      throw new AppError('Specific express consent is required for this reply.', 422, 'google_reply_consent_required');
    }

    const review = await repository.getReview(reviewId, actor);
    if (!review || review.source !== 'google') throw new AppError('Google review not found.', 404, 'not_found');
    if (!['approved', 'edited'].includes(review.state)) {
      throw new AppError('Only an approved review reply can be published.', 409, 'google_reply_not_approved');
    }

    const draft = await repository.getLatestDraft(review.id, actor);
    const comment = draft?.finalText ?? (draft?.status === 'approved' ? draft.text : undefined);
    if (!draft || !comment || draft.status !== 'approved') {
      throw new AppError('The latest draft is not approved.', 409, 'google_reply_not_approved');
    }

    const link = await this.store.findReviewLinkByLocalReviewId(review.id);
    if (!link) throw new AppError('Google review mapping not found.', 409, 'google_review_link_missing');
    const connection = await this.requiredConnection(review.restaurantId);
    if (!connection.externalAccountName || !connection.selectedLocationName) {
      throw new AppError('Google location selection is incomplete.', 409, 'google_location_required');
    }

    const reply = await this.client.updateReply(
      await this.accessToken(review.restaurantId),
      connection.externalAccountName,
      connection.selectedLocationName,
      link.googleReviewId,
      comment,
    );
    await this.store.upsertReviewLink({
      ...link,
      replyComment: reply.comment ?? comment,
      replyUpdateTime: reply.updateTime ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    const updatedReview = await repository.updateReview(review.id, {
      state: 'published',
      updatedAt: new Date().toISOString(),
    }, actor);
    return { review: updatedReview, googleReply: reply };
  }

  async disconnect(restaurantId: string, revoke: boolean) {
    const connection = await this.requiredConnection(restaurantId);
    if (revoke) {
      const encryptedToken = connection.refreshTokenCiphertext || connection.accessTokenCiphertext;
      if (encryptedToken) await this.client.revoke(await this.cipher.open(encryptedToken));
    }
    return publicConnection(await this.store.updateConnection(restaurantId, {
      status: 'disconnected',
      accessTokenCiphertext: '',
      refreshTokenCiphertext: '',
      expiresAt: new Date(0).toISOString(),
      disconnectedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));
  }

  async purgeExpired(actor: Actor, repository: Repository, restaurantId: string, limit = 100) {
    const links = await this.store.listExpiredReviewLinks(
      restaurantId,
      new Date().toISOString(),
      Math.min(Math.max(limit, 1), 500),
    );
    let deleted = 0;
    const failures: Array<{ linkId: string; error: string }> = [];
    for (const link of links) {
      try {
        await repository.deleteReview(link.localReviewId, actor);
        await this.store.deleteReviewLink(link.id);
        deleted += 1;
      } catch (error) {
        failures.push({
          linkId: link.id,
          error: error instanceof Error ? error.message : 'Unknown deletion error.',
        });
      }
    }
    return { considered: links.length, deleted, failures };
  }

  async listSyncRuns(restaurantId: string) {
    return this.store.listSyncRuns(restaurantId);
  }

  private assertEnabled() {
    if (!this.config.enabled) {
      throw new AppError('Google integration is disabled for this environment.', 503, 'google_integration_disabled');
    }
  }

  private async requiredConnection(restaurantId: string) {
    this.assertEnabled();
    const connection = await this.store.getConnection(restaurantId);
    if (!connection || connection.status === 'disconnected') {
      throw new AppError('Google is not connected for this restaurant.', 409, 'google_not_connected');
    }
    return connection;
  }

  private async accessToken(restaurantId: string): Promise<string> {
    const connection = await this.requiredConnection(restaurantId);
    if (new Date(connection.expiresAt).getTime() > Date.now() + 60_000 && connection.accessTokenCiphertext) {
      return this.cipher.open(connection.accessTokenCiphertext);
    }
    if (!connection.refreshTokenCiphertext) {
      await this.store.updateConnection(restaurantId, {
        status: 'needs_reauth',
        lastError: 'Refresh token missing.',
        updatedAt: new Date().toISOString(),
      });
      throw new AppError('Google authorization must be renewed.', 401, 'google_reauth_required');
    }

    try {
      const refreshed = await this.client.refresh(await this.cipher.open(connection.refreshTokenCiphertext));
      const updated = await this.store.updateConnection(restaurantId, {
        status: 'connected',
        accessTokenCiphertext: await this.cipher.seal(refreshed.access_token),
        expiresAt: addSeconds(refreshed.expires_in),
        scope: refreshed.scope ?? connection.scope,
        tokenType: refreshed.token_type ?? connection.tokenType,
        lastError: '',
        updatedAt: new Date().toISOString(),
      });
      return this.cipher.open(updated.accessTokenCiphertext);
    } catch (error) {
      await this.store.updateConnection(restaurantId, {
        status: 'needs_reauth',
        lastError: error instanceof Error ? error.message : 'Token refresh failed.',
        updatedAt: new Date().toISOString(),
      });
      throw error;
    }
  }
}

export function googleIntegrationForEnv(env: CloudflareBindings): GoogleIntegrationService {
  const config: GoogleIntegrationConfig = {
    enabled: env.GOOGLE_INTEGRATION_ENABLED === 'true',
    replyWritesEnabled: env.GOOGLE_REPLY_WRITES_ENABLED === 'true',
    clientId: env.GOOGLE_CLIENT_ID ?? '',
    clientSecret: env.GOOGLE_CLIENT_SECRET ?? '',
    redirectUri: env.GOOGLE_REDIRECT_URI ?? '',
    successUrl: env.GOOGLE_OAUTH_SUCCESS_URL,
  };

  if (!config.enabled) {
    return new GoogleIntegrationService(
      new MemoryGoogleIntegrationStore(),
      new GoogleBusinessClient(config),
      new TokenCipher(env.GOOGLE_TOKEN_ENCRYPTION_KEY ?? 'disabled-google-integration-key'),
      config,
    );
  }

  if (!config.clientId || !config.clientSecret || !config.redirectUri || !env.GOOGLE_TOKEN_ENCRYPTION_KEY || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new AppError('Google integration environment variables are incomplete.', 503, 'google_not_configured');
  }

  return new GoogleIntegrationService(
    new SupabaseGoogleIntegrationStore(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY),
    new GoogleBusinessClient(config),
    new TokenCipher(env.GOOGLE_TOKEN_ENCRYPTION_KEY),
    config,
  );
}
