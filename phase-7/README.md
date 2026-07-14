# Phase 7 — Weekly Owner Intelligence

## Implemented

- Immutable metric snapshots with evidence IDs and data-completeness notes
- Explicit distinction between zero and unavailable data
- Small-sample warnings
- Versioned weekly owner reports with validation and approval states
- Maximum three evidence-backed owner recommendations
- Recommendation selection and evidence-backed completion
- Per-user notification preferences
- Idempotent delivery attempts for in-app, email, and WhatsApp-link channels
- External delivery disabled independently from report generation
- Restaurant-scoped APIs, migration, tests, and server-only storage

## Safety boundary

- Reports do not invent causes or financial impact.
- Missing data is never converted to zero.
- Delivery attempts do not imply delivery unless the adapter succeeds.
- Owner reports require human validation and approval.
- Phase 7 never authorizes public replies or listing changes.

## Feature flags

- `PHASE7_OWNER_INTELLIGENCE_ENABLED=false`
- `PHASE7_DELIVERY_ENABLED=false`

## Deployment gate

Apply `0008_phase7_owner_intelligence.sql`, verify tenant isolation and metric reproducibility, test preferences and retries, review reports at low and high sample sizes, and confirm completed recommendations link to evidence.
