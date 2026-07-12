# Phase 1 — Manual Review Copilot

## Implementation status

**CODE COMPLETE FOR REVIEW — NOT YET PRODUCTION-APPROVED**

Phase 1 converts the Phase 0 manual operating procedure into a tested software workflow. It intentionally preserves manual source ingestion, operator QA, restaurant approval, and manual publication.

## Delivered slices

### 1A — Foundation and tenancy

- Supabase Auth identity
- Organisations, memberships, restaurants, and locations schema
- Row-level security helpers and policies
- Application-level role gates
- Versioned voice profiles
- Audit events

### 1B — Review intake and queue

- Manual intake
- CSV import with row-level results
- Verification status
- Duplicate warning
- Review queue filters
- Controlled lifecycle states

### 1C — Intelligence and drafting

- Deterministic category and risk assessment
- Sensitive-case risk floor
- Optional Claude Messages API adapter
- Strict structured-result validation
- Internal action recommendation
- Model-run audit records

### 1D — QA, approval, and publication evidence

- Deterministic draft validator
- Critical/major/minor defects
- Explicit approval/edit/reject/skip/escalate records
- Manual publication confirmation
- No publishing integration

### 1E — Listing and weekly intelligence

- Listing-difference records begin as `needs_confirmation`
- Owner confirmation and correction evidence
- Internal action tracking
- Weekly report drafts with small-sample caveats

### 1F — Hardening

- In-memory repository tests
- End-to-end API tests
- Safety evaluation corpus
- GitHub Actions CI
- Cloudflare Worker dry-run build
- Deployment, API, security, and pilot runbooks

## Verified locally

- TypeScript typecheck passes
- 19 automated tests pass
- Cloudflare Wrangler dry-run bundle succeeds

## Production gate

Before marking Phase 1 operationally complete:

1. Merge and independently review Phase 0.
2. Apply the migration to a disposable Supabase staging project.
3. Run cross-tenant RLS tests with two unrelated users.
4. Test membership revocation and expired tokens.
5. Deploy a staging Worker with `DEV_AUTH_BYPASS=false`.
6. Run the synthetic red-case drill and wrong-restaurant drill.
7. Process real pilot reviews only for a Phase 0-qualified restaurant.
8. Confirm operator time decreases without lowering safety.
9. Record staging findings and final Phase 1 decision.

## Next phase is not automatically unlocked

Google integration belongs to Phase 2 and requires a separate spike, platform approval, token lifecycle, revocation, retry, and data-policy review. Do not add it to this branch merely because the API is ready for an adapter.
