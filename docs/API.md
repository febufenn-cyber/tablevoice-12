# Phase 1 API

All `/v1/*` endpoints require a Supabase bearer token. Local development may use `DEV_AUTH_BYPASS=true` with `x-dev-user-id`.

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
