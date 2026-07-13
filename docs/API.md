# Tablevoice API

All `/v1/*` endpoints require a Supabase bearer token. Local development may use `DEV_AUTH_BYPASS=true` with `x-dev-user-id`.

The Google OAuth callback is public and protected by a short-lived, single-use state value plus PKCE.

## Foundation

- `GET /health`
- `GET /v1/me`
- `POST /v1/organizations`
- `POST /v1/restaurants`
- `GET /v1/restaurants`
- `GET /v1/restaurants/:restaurantId`
- `POST /v1/restaurants/:restaurantId/voice-profiles`

## Reviews

- `POST /v1/restaurants/:restaurantId/reviews`
- `POST /v1/restaurants/:restaurantId/reviews/import/csv`
- `GET /v1/restaurants/:restaurantId/reviews`
- `GET /v1/reviews/:reviewId`
- `POST /v1/reviews/:reviewId/verify`
- `POST /v1/reviews/:reviewId/process`
- `POST /v1/reviews/:reviewId/qa`
- `POST /v1/reviews/:reviewId/decision`
- `POST /v1/reviews/:reviewId/publication`
- `POST /v1/reviews/:reviewId/escalate`
- `DELETE /v1/reviews/:reviewId`

### CSV contract

Required headers:

```csv
platform,rating,review_date,review_text,reviewer_display_name,source_reference
```

Optional headers: `service_mode`, `language`. Import returns HTTP 207 with a result for every row.

## Google Business Profile integration

The integration and reply-write capabilities use independent environment flags.

- `GET /oauth/google/callback`
- `GET /v1/restaurants/:restaurantId/integrations/google`
- `POST /v1/restaurants/:restaurantId/integrations/google/connect`
- `GET /v1/restaurants/:restaurantId/integrations/google/accounts`
- `POST /v1/restaurants/:restaurantId/integrations/google/account`
- `GET /v1/restaurants/:restaurantId/integrations/google/locations`
- `POST /v1/restaurants/:restaurantId/integrations/google/location`
- `POST /v1/restaurants/:restaurantId/integrations/google/sync`
- `GET /v1/restaurants/:restaurantId/integrations/google/sync-runs`
- `POST /v1/reviews/:reviewId/integrations/google/publish`
- `POST /v1/restaurants/:restaurantId/integrations/google/purge-expired`
- `POST /v1/restaurants/:restaurantId/integrations/google/disconnect`

### Start OAuth

```json
POST /v1/restaurants/:restaurantId/integrations/google/connect
```

Response:

```json
{
  "authorizationUrl": "https://accounts.google.com/o/oauth2/v2/auth?...",
  "expiresAt": "2026-07-13T12:10:00.000Z"
}
```

The restaurant operator opens `authorizationUrl`. Google redirects to `/oauth/google/callback`.

### Select account

```json
{
  "accountName": "accounts/123456789"
}
```

### Select location

```json
{
  "locationName": "locations/987654321"
}
```

Pass `?refresh=true` to the locations endpoint to retrieve fresh candidates from Google.

### Sync reviews

Sync is manual in Phase 2. It imports new reviews, updates previously linked reviews when Google `updateTime` changes, and skips unchanged reviews.

### Publish an approved reply

```json
POST /v1/reviews/:reviewId/integrations/google/publish
{
  "consent": true
}
```

Publication requires:

- Google integration enabled;
- Google reply writes enabled;
- a Google-sourced review;
- an approved latest draft;
- the review in `approved` or `edited` state; and
- specific express consent on this request.

### Purge expired Google content

```json
POST /v1/restaurants/:restaurantId/integrations/google/purge-expired
{
  "limit": 100
}
```

The purge is restricted to the authorised restaurant.

## Internal actions

- `GET /v1/restaurants/:restaurantId/actions`
- `PATCH /v1/actions/:actionId`

## Listing findings

- `POST /v1/restaurants/:restaurantId/listing-findings`
- `GET /v1/restaurants/:restaurantId/listing-findings`
- `POST /v1/listing-findings/:findingId/confirm`

A difference begins as `needs_confirmation`; the API does not call it an error until the owner confirms it.

## Reports and audit

- `POST /v1/restaurants/:restaurantId/reports/weekly`
- `GET /v1/restaurants/:restaurantId/reports/weekly`
- `GET /v1/restaurants/:restaurantId/audit-events`

## Error contract

```json
{
  "error": {
    "code": "invalid_transition",
    "message": "Invalid review transition: received -> published",
    "details": null
  }
}
```
