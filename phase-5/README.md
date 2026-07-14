# Phase 5 — Listing-Health Audit Engine

## Entry gate

Phase 4 is merged, owner-authorized application routes exist, and manual listing findings already preserve evidence and confirmation states.

## Implemented

- Owner-confirmed, versioned canonical business facts
- Manual, website, Google-read, and other source observations with timestamp, evidence, and confidence
- Deterministic normalization for phone, URL, address, hours, holiday hours, coordinates, arrays, and links
- Idempotent comparison runs keyed by canonical and observation content
- Differences begin as `needs_confirmation`, never as alleged errors
- Explicit owner confirm/dismiss decision
- Assignment only after confirmation
- Correction evidence recorded separately from independent verification
- Deterministic listing-health snapshot from stored evidence
- Restaurant-scoped service-role storage behind authenticated authorization checks

## API

- `GET/POST /v1/restaurants/:restaurantId/listing-health/canonical`
- `GET/POST /v1/restaurants/:restaurantId/listing-health/observations`
- `POST /v1/restaurants/:restaurantId/listing-health/compare`
- `GET /v1/restaurants/:restaurantId/listing-health/findings`
- `POST /v1/restaurants/:restaurantId/listing-health/findings/:findingId/decision`
- `POST /v1/restaurants/:restaurantId/listing-health/findings/:findingId/assign`
- `POST /v1/restaurants/:restaurantId/listing-health/findings/:findingId/corrections`
- `POST /v1/restaurants/:restaurantId/listing-health/corrections/:attemptId/verify`
- `GET /v1/restaurants/:restaurantId/listing-health/snapshot`

## Safety boundary

- A difference is not an error until owner-confirmed or directly authoritative.
- No revenue-loss amount is generated.
- No listing mutation or broad crawler exists.
- Correction evidence does not close a finding without a separate verification action.
- Public-source observation does not require customer credentials.

## Feature flag

`PHASE5_LISTING_HEALTH_ENABLED=false` by default.

## Deployment gate

1. Apply migration `0006_phase5_listing_health.sql` in staging.
2. Verify service-role isolation and restaurant authorization.
3. Test time-zone-specific hours data for pilot restaurants.
4. Verify repeated comparisons do not duplicate runs or findings.
5. Complete one full confirmation → correction → verification flow.

## Known limitations

Website and Google observations are records supplied by supported adapters or operators. Phase 5 does not introduce scraping or automatic listing edits.

## Completion gate

Software completion requires green CI, deterministic snapshots, normalization coverage, idempotent comparisons, and tenant-isolation verification. Business impact remains a field-evidence gate.
