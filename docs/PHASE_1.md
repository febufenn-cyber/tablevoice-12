# Phase 1 — Manual Review Copilot

## Status

The software foundation is implemented. Production deployment and customer rollout remain gated by Phase 0 field evidence and environment configuration.

## Implemented workflow

```text
manual/CSV review intake
  → verification
  → structured classification and risk floor
  → internal action recommendation
  → restaurant-specific draft
  → deterministic QA
  → explicit approval/edit/reject/escalate
  → manual publication confirmation
  → weekly report and audit trail
```

## Implemented capabilities

- Supabase authentication and per-request, bearer-scoped repository clients
- Organisations, restaurant profiles, versioned voice profiles, and locations in the database
- Manual and CSV review intake with verification state and duplicate detection
- Controlled review state machine
- Deterministic green/amber/red safety floor
- Optional Claude Messages API drafting with strict structured-output validation
- Deterministic fallback when no model key is configured
- Internal action creation for complaint and sensitive-review workflows
- QA defects for invented investigations, compensation, absolutes, prohibited phrases, and review-removal pressure
- Explicit approval/edit/reject/skip/escalate records
- Manual publication confirmation; no platform publishing integration
- Listing-finding confirmation and resolution
- Draft weekly intelligence reports
- Immutable-style audit events and model-run records
- Review deletion endpoint
- Minimal operator console for pilot use
- Unit, policy, CSV, evaluation, and end-to-end tests

## Deliberately excluded

- Google OAuth and automatic review retrieval
- Google or Zomato reply publishing
- Zomato scraping
- Automatic public replies
- Stripe billing
- Native mobile apps
- Advanced agency/multi-location UI
- `pgvector`
- Automatic weekly report delivery

## Safety boundary

The deterministic policy is a risk floor. A configured model cannot downgrade a deterministic amber result to green. Deterministic red cases bypass normal model drafting and enter the escalation path. Publication is impossible through this service because Phase 1 only records manual confirmation.

## Known limitations

- The UI is an internal pilot console, not a finished customer product.
- CSV imports enter `needs_verification`; they are never trusted automatically.
- The Claude integration uses JSON-only schema validation rather than provider-specific structured-output beta features.
- Restaurant membership invitation and granular role-authority endpoints are represented in the schema but not exposed in the API yet.
- Screenshot OCR is not implemented; operators can attach source references and manually transcribe exact text.
- Weekly reports are descriptive drafts and require human review.
- The Supabase migration must be tested in a disposable project before production use.

## Phase 1 completion gate

The branch implements the software scope. Phase 1 should be marked operationally complete only after:

- migration and RLS tests pass against a real Supabase project;
- a staging Cloudflare Worker is deployed;
- tenant-isolation and revoked-user tests pass independently;
- at least one Phase 0 restaurant completes the workflow in staging;
- red-case handling is independently reviewed;
- operator time is measurably lower than the Phase 0 baseline.
