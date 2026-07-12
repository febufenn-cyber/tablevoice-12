# Tablevoice

> A risk-aware review-operations copilot for restaurants: understand every review, recommend the internal action, draft a public response in the restaurant’s voice, and preserve explicit human approval.

## Current repository position

Phase 0 established the concierge-validation operating system. **Phase 1 now implements the manual review copilot as working software**, stacked on the Phase 0 branch.

The implementation is deliberately manual at the platform boundary:

```text
manual or CSV review intake
        ↓
verification and duplicate warning
        ↓
classification + deterministic risk floor
        ↓
internal action recommendation
        ↓
restaurant-specific reply draft
        ↓
operator QA
        ↓
explicit approve / edit / reject / escalate
        ↓
restaurant publishes manually
        ↓
publication confirmation + weekly intelligence
```

## Run locally

```sh
npm install
cp .env.example .dev.vars
npm run check
npm run dev
```

Open the local Worker URL to use the pilot operator console.

## Phase 1 components

- Cloudflare Worker and Hono API
- Supabase Auth/Postgres/RLS repository
- In-memory repository for deterministic testing
- Versioned restaurant voice profiles
- Manual and CSV review ingestion
- Controlled review state machine
- Green/amber/red deterministic safety policy
- Optional Claude drafting with schema validation
- Fail-closed deterministic fallback
- QA defect detection
- Approval and edit history
- Manual publication confirmation
- Internal actions and listing findings
- Weekly report drafts
- Audit events and model-run records
- Internal pilot console
- CI, regression tests, and safety evaluation corpus

Read [`docs/PHASE_1.md`](docs/PHASE_1.md) for implementation boundaries and [`phase-1/README.md`](phase-1/README.md) for the release gate.

## Important boundary

The code does **not** mean the business hypothesis has passed. Phase 0’s decision record remains open until real restaurant behaviour and payment evidence are collected. Phase 1 also remains unapproved for production until staging RLS, tenant-isolation, sensitive-case, deletion, and pilot tests pass.

## Explicitly not implemented

- Google OAuth or automatic review retrieval
- Google or Zomato response publishing
- Zomato scraping
- Automatic public replies
- Stripe self-service billing
- Native mobile apps
- `pgvector`
- Agency white-labelling

## Production direction

The intended stack remains Cloudflare Workers + Hono, Supabase Auth/Postgres/RLS, asynchronous jobs where necessary, and model routing. Platform integrations stay behind separate capability adapters and later evidence gates.
