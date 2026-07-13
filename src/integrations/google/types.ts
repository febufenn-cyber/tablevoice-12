export type GoogleConnectionStatus = 'pending' | 'connected' | 'needs_reauth' | 'disconnected' | 'error';

export interface GoogleOAuthFlow {
  id: string;
  restaurantId: string;
  actorId: string;
  stateHash: string;
  codeVerifierCiphertext: string;
  redirectUri: string;
  expiresAt: string;
  consumedAt?: string;
  createdAt: string;
}

export interface GoogleConnection {
  id: string;
  restaurantId: string;
  status: GoogleConnectionStatus;
  accessTokenCiphertext: string;
  refreshTokenCiphertext?: string;
  tokenType: string;
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

export interface GoogleLocationCandidate {
  name: string;
  title: string;
  storeCode?: string;
  metadata?: Record<string, unknown>;
}

export interface GoogleReviewLink {
  id: string;
  restaurantId: string;
  connectionId: string;
  googleReviewName: string;
  googleReviewId: string;
  localReviewId: string;
  googleUpdateTime: string;
  googleCreateTime: string;
  replyComment?: string;
  replyUpdateTime?: string;
  contentExpiresAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface GoogleSyncRun {
  id: string;
  restaurantId: string;
  connectionId: string;
  status: 'running' | 'succeeded' | 'failed';
  reviewsSeen: number;
  reviewsImported: number;
  reviewsUpdated: number;
  reviewsSkipped: number;
  pagesFetched: number;
  error?: string;
  startedAt: string;
  completedAt?: string;
}

export interface GoogleTokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
}

export interface GoogleAccount {
  name: string;
  accountName?: string;
  type?: string;
  role?: string;
  state?: Record<string, unknown>;
}

export interface GoogleLocation {
  name: string;
  title?: string;
  storeCode?: string;
  metadata?: Record<string, unknown>;
}

export type GoogleStarRating = 'ONE' | 'TWO' | 'THREE' | 'FOUR' | 'FIVE';

export interface GoogleReview {
  name: string;
  reviewId: string;
  reviewer?: { displayName?: string; profilePhotoUrl?: string; isAnonymous?: boolean };
  starRating: GoogleStarRating;
  comment?: string;
  createTime: string;
  updateTime: string;
  reviewReply?: { comment?: string; updateTime?: string };
}
