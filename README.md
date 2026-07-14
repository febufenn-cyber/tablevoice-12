# Tablevoice

> A risk-aware review-operations copilot for restaurants: understand every review, recommend the internal action, draft a public response in the restaurant’s voice, and preserve explicit human approval.

## Current repository position

- **Phase 0:** concierge-validation operating system
- **Phase 1:** working manual review copilot
- **Phase 2:** controlled Google Business Profile integration proof
- **Phase 3:** production inbox and approval workflow
- **Remaining:** six roadmap phases, Phase 4 through Phase 9

The verified scope, entry gates, acceptance tests, and autonomous merge protocol for all remaining work are defined in [`docs/REMAINING_PHASES_EXECUTION_PLAN.md`](docs/REMAINING_PHASES_EXECUTION_PLAN.md).

After that plan is merged, the command **`build`** authorizes sequential implementation of Phases 4–9. Every phase must branch from the latest verified `main`, pass CI, squash-merge as its own commit, and have the remote `main` SHA confirmed before the next phase begins.

The operational path is now:

```text
manual, CSV, or authorised Google review
        ↓
production inbox work item
        ↓
priority, SLA, and assignee
        ↓
classification + deterministic risk floor
        ↓
operator QA
        ↓
authenticated one-time approval action
        ↓
stale-write protection
        ↓
manual or explicitly consented Google publication
        ↓
publication-attempt ledger + timeline
```

## Run locally

```sh
npm install
cp .env.example .dev.vars
npm run check
npm run dev
```

The Google and Phase 3 workflow capabilities remain disabled until their migrations, server secrets, and staging gates are configured.

## Product foundation

- Cloudflare Worker and Hono API
- Supabase Auth/Postgres/RLS repository
- In-memory repositories for deterministic tests
- Versioned restaurant voice profiles
- Manual and CSV review ingestion
- Controlled review state machine
- Green/amber/red deterministic safety policy
- Optional Claude drafting with schema validation
- QA defect detection
- Approval and edit history
- Internal actions, listing findings, and weekly reports
- Audit events and model-run records

## Phase 2 Google proof

- OAuth 2.0 authorisation-code flow with PKCE
- Encrypted access and refresh tokens
- Google account and location discovery
- Paginated, idempotent review sync
- Token refresh, disconnect, and revocation
- Reply publication behind an independent feature flag
- Per-action express consent
- Thirty-day temporary-content expiry path

Read [`phase-2/README.md`](phase-2/README.md) and [`docs/GOOGLE_SETUP.md`](docs/GOOGLE_SETUP.md).

## Phase 3 production workflow

- Denormalized inbox work items
- Assignment, claiming, priority, due date, and next action
- Cursor pagination and operational filters
- SLA summary and overdue detection
- Optimistic work-item concurrency
- Stale approval-screen rejection
- Authenticated, intended-user, one-time approval actions
- Idempotent manual and Google publication attempts
- Review timelines
- Updated operator console

Read [`phase-3/README.md`](phase-3/README.md).

## Remaining roadmap

1. **Phase 4:** Restaurant Voice System
2. **Phase 5:** Listing-Health Audit Engine
3. **Phase 6:** Issue-Resolution Layer
4. **Phase 7:** Weekly Owner Intelligence
5. **Phase 8:** Controlled Autopilot
6. **Phase 9:** Multi-Location, Agency, Billing, and Supported Platform Expansion

The complete executable plan is [`docs/REMAINING_PHASES_EXECUTION_PLAN.md`](docs/REMAINING_PHASES_EXECUTION_PLAN.md).

## Feature flags

```text
GOOGLE_INTEGRATION_ENABLED=false
GOOGLE_REPLY_WRITES_ENABLED=false
PHASE3_WORKFLOW_ENABLED=false
```

No flag enables automatic approval or automatic replies.

## Important boundary

Repository implementation does **not** mean the product, Google integration, or production-workflow hypotheses have passed.

Production rollout remains gated by:

- Phase 0 customer and payment evidence
- real Supabase tenant-isolation tests
- Google project approval and quota
- controlled OAuth and publication testing
- Phase 3 claim-collision, stale-action, replay, and publication-failure tests
- policy review of stored and derived platform data
- a real restaurant team pilot

## Explicitly not implemented

- Scheduled Google review sync
- Automatic public replies
- Zomato scraping or unofficial automation
- Stripe self-service billing
- Native mobile apps
- `pgvector`
- Agency white-labelling
- Automatic listing edits

The product continues to work through manual and CSV intake when Google or Phase 3 workflow features are unavailable or intentionally disabled.
