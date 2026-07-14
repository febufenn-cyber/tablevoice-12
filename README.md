# Tablevoice

> A risk-aware review-operations platform for restaurants: understand every review, recommend the internal action, draft a public response in the restaurant’s voice, preserve explicit approval, and connect reputation signals to accountable operations.

## Repository roadmap status

All planned software phases are implemented on review branches and merged sequentially through the Phase 9 release candidate:

- **Phase 0:** concierge-validation operating system
- **Phase 1:** manual review copilot
- **Phase 2:** controlled Google Business Profile integration proof
- **Phase 3:** production inbox and approval workflow
- **Phase 4:** restaurant voice system
- **Phase 5:** listing-health audit engine
- **Phase 6:** issue-resolution layer
- **Phase 7:** weekly owner intelligence
- **Phase 8:** controlled autopilot
- **Phase 9:** multi-location, agency, entitlement, billing-event, and provider-capability platform

The scope, entry gates, acceptance tests, and autonomous merge protocol are recorded in [`docs/REMAINING_PHASES_EXECUTION_PLAN.md`](docs/REMAINING_PHASES_EXECUTION_PLAN.md). Each phase also has a dedicated `phase-N/README.md` deployment contract.

## End-to-end product path

```text
manual, CSV, or authorised Google review
        ↓
production inbox + ownership + SLA
        ↓
classification + deterministic risk floor
        ↓
restaurant voice version + draft provenance
        ↓
operator QA or tightly allowlisted shadow/autopilot decision
        ↓
explicit approval / consent / provider write gate
        ↓
publication-attempt ledger
        ↓
listing-health signals + operational incidents
        ↓
verified actions and resolution evidence
        ↓
reproducible weekly owner intelligence
        ↓
organization / brand / group / agency / entitlement controls
```

## Run locally

```sh
npm install
cp .env.example .dev.vars
npm run check
npm run dev
```

## Major implemented controls

- Supabase Auth, Postgres, RLS foundations, and server-side authorization
- Cloudflare Worker + Hono API
- Manual, CSV, and controlled Google review intake
- Green/amber/red deterministic safety policy
- Versioned restaurant voice profiles with preview, candidates, evidence, and rollback
- Assignment, SLA, optimistic concurrency, one-time approval actions, and publication history
- Evidence-backed listing comparisons and correction verification
- Operational incidents, restricted recovery records, and verified closure
- Reproducible owner reports with missing-data semantics and three-action limits
- Green-only controlled autopilot with shadow evidence, consent, provenance, and kill switches
- Multi-location hierarchy, agency delegation, entitlements, usage events, signed billing events, provider capability evidence, and preview-first bulk operations

## Feature flags

Every advanced capability remains independently disabled until its migration and staging gate pass:

```text
GOOGLE_INTEGRATION_ENABLED=false
GOOGLE_REPLY_WRITES_ENABLED=false
PHASE3_WORKFLOW_ENABLED=false
PHASE4_VOICE_ENABLED=false
PHASE5_LISTING_HEALTH_ENABLED=false
PHASE6_INCIDENTS_ENABLED=false
PHASE7_OWNER_INTELLIGENCE_ENABLED=false
PHASE7_DELIVERY_ENABLED=false
PHASE8_AUTOPILOT_ENABLED=false
PHASE8_AUTOPILOT_WRITES_ENABLED=false
PHASE8_GLOBAL_KILL_SWITCH=true
PHASE9_PLATFORM_ENABLED=false
PHASE9_BILLING_WEBHOOKS_ENABLED=false
```

No single flag bypasses review risk, authorization, consent, tenant isolation, provider capability, or kill-switch controls.

## Important boundary

**Repository implementation is not production approval.** Rollout remains gated by:

- Phase 0 customer, workflow, pricing, and payment evidence
- applying migrations `0001` through `0010` to disposable staging first
- real Supabase tenant-isolation and role-matrix testing
- Google project approval, quota, OAuth, refresh, revocation, retention, and controlled publication tests
- voice-version provenance and rollback verification
- listing normalization and correction-verification drills
- restricted-incident access, compensation authority, and reopen tests
- report metric reconciliation and notification-provider tests
- autopilot shadow thresholds, consent, kill switches, incident thresholds, and provider-specific write gates
- agency revocation, entitlement reconciliation, billing-event replay, and bulk-operation drills
- legal, privacy, platform-policy, security, and customer-pilot review

## Explicit non-claims and exclusions

- No unsupported Zomato scraping or automation
- No fabricated provider capability
- No scheduled Google sync enabled by default
- No automatic public replies without the Phase 8 and provider-specific gates
- No automatic listing mutation
- No live Stripe configuration or self-service billing claim; Phase 9 provides a generic signed billing-event contract
- No native mobile application
- No `pgvector` dependency

The product continues to operate through manual and CSV intake when Google, automation, billing, or expansion features are unavailable or deliberately disabled.
