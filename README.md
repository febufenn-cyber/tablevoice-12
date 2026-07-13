# Tablevoice

> A risk-aware review-operations copilot for restaurants: understand every review, recommend the internal action, draft a public response in the restaurant’s voice, and preserve explicit human approval.

## Current repository position

- **Phase 0:** concierge-validation operating system
- **Phase 1:** working manual review copilot
- **Phase 2:** Google Business Profile integration proof

The Google path is deliberately controlled rather than automatic:

```text
restaurant-authorised OAuth
        ↓
explicit account and location selection
        ↓
manual review sync
        ↓
classification + deterministic risk floor
        ↓
operator QA and restaurant approval
        ↓
per-action express consent
        ↓
optional Google reply publication
```

## Run locally

```sh
npm install
cp .env.example .dev.vars
npm run check
npm run dev
```

Google integration remains disabled unless the required staging credentials and feature flags are configured.

## Implemented product foundation

- Cloudflare Worker and Hono API
- Supabase Auth/Postgres/RLS repository
- In-memory repository for deterministic tests
- Versioned restaurant voice profiles
- Manual and CSV review ingestion
- Controlled review state machine
- Green/amber/red deterministic safety policy
- Optional Claude drafting with schema validation
- QA defect detection
- Approval and edit history
- Internal actions, listing findings, and weekly reports
- Audit events and model-run records
- Internal pilot console

## Phase 2 Google proof

- OAuth 2.0 authorisation-code flow with PKCE
- Encrypted access and refresh tokens
- Google account and location discovery
- Explicit account and location selection
- Paginated review retrieval
- Idempotent external-to-local review mapping
- Token refresh and reauthorisation state
- Approved-reply publication behind a separate environment flag
- Specific express consent for every reply write
- Disconnect and token revocation
- 30-day temporary-content expiry and restaurant-scoped purge
- Mocked end-to-end integration tests

Read [`phase-2/README.md`](phase-2/README.md) for the phase gate and [`docs/GOOGLE_SETUP.md`](docs/GOOGLE_SETUP.md) for staging setup.

## Important boundary

The repository implementation does **not** mean the business or Google integration hypotheses have passed.

Production rollout remains gated by:

- Phase 0 customer and payment evidence
- real Supabase RLS and tenant-isolation tests
- Google project approval and non-zero quotas
- OAuth consent-screen verification
- a controlled real restaurant integration test
- refresh, revocation, duplication, and retention tests
- policy review of all stored and derived Google review data

## Disabled by default

- Google integration
- Google reply writes
- automatic review sync
- automatic public replies
- listing mutations

## Explicitly not implemented

- Zomato scraping or unofficial automation
- Stripe self-service billing
- native mobile apps
- `pgvector`
- agency white-labelling
- automatic listing edits

The product still works through manual and CSV intake when Google is unavailable, delayed, revoked, or intentionally disabled.
