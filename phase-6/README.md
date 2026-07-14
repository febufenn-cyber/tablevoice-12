# Phase 6 — Issue-Resolution Layer

## Implemented

- Operational incidents grouping review, listing, or manual signals without deleting originals
- Explainable grouping suggestions requiring explicit confirmation
- Severity, confidence, ownership, due dates, root-cause hypothesis, confirmed cause, and escalation state
- Structured actions with dependencies, evidence, approver, and completion status
- Restricted incident evidence and customer-recovery records
- Compensation authority checks
- Independent resolution verification
- Evidence-backed dismissal and reopen history
- Restaurant-scoped APIs, service-role storage, migration, and regression tests

## Safety boundary

- Suggestions never become confirmed groupings automatically.
- Public-reply completion does not close an incident.
- Resolution requires verification evidence; dismissal requires a reason.
- Restricted recovery data is exposed only through higher-authority routes.
- Compensation amounts require approved authority.
- Phase 6 is not an HR, legal, or general task-management system.

## Feature flag

`PHASE6_INCIDENTS_ENABLED=false` by default.

## Deployment gate

Apply `0007_phase6_issue_resolution.sql`, verify restricted-access and tenant tests, drill a critical incident, complete one action/evidence/verification flow, and verify reopen history.
