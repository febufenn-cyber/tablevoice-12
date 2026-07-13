# Phase 3 — Production Inbox and Approval Workflow

## Objective

Turn the Phase 1/2 review pipeline into a reliable operating queue without introducing automatic review replies or scheduled external-platform actions.

Phase 3 adds the workflow controls required when multiple people handle real customer reviews:

```text
review enters Tablevoice
  → queue work item created
  → priority and SLA assigned
  → operator claims or assigns work
  → classification, draft, and QA update the queue
  → authenticated one-time approval action
  → stale approvals rejected
  → manual or Google publication attempt recorded
  → success, uncertainty, or failure remains auditable
```

## Implemented capabilities

- Denormalized production inbox work items
- Assignee, priority, due date, next action, and contextual notes
- Cursor-based inbox pagination
- Queue filters for state, risk, priority, assignee, and overdue work
- Queue summary counts
- SLA states: on track, due soon, overdue, paused, and completed
- Atomic work-item claiming
- Optimistic work-item concurrency through `workflowVersion`
- Stale review-decision protection through `expectedReviewUpdatedAt`
- Authenticated, intended-user, one-time approval actions
- Configurable approval-action expiry and allowed decisions
- Durable manual and Google publication-attempt records
- Idempotency keys for publication attempts
- Review timeline endpoint using audit events
- Updated internal operator console
- Server-only Supabase workflow tables

## Security model

The workflow tables are accessed only by the Cloudflare Worker using the Supabase service-role key. Direct `anon` and `authenticated` table access is revoked.

Application endpoints still enforce:

1. Supabase authentication
2. restaurant membership
3. role authority
4. review state transitions
5. optimistic concurrency
6. one-time action-token scope

Approval action links do not bypass authentication. The signed-in user must match the intended actor unless the caller is a trusted Tablevoice platform operator or administrator.

## Safety boundaries

Phase 3 does not change the existing safety model:

- Red reviews remain escalated.
- QA is still required before routine approval.
- No reply is published automatically.
- Google publication still requires specific express consent.
- A publication attempt record does not imply successful publication.
- Stale approval screens fail with HTTP 409 rather than overwriting newer work.

## Environment flag

```text
PHASE3_WORKFLOW_ENABLED=false
```

When disabled, Phase 1/2 review endpoints continue to work and the operator console falls back to the original review list.

When enabled, `SUPABASE_SERVICE_ROLE_KEY` and migration `0004_phase3_production_workflow.sql` are required.

## Operational gate

Phase 3 should be enabled for production only after:

- migration `0004` is applied in staging;
- service-role secrets are configured only on the Worker;
- two-user claim collisions are tested;
- stale approval and replay tests pass;
- cross-restaurant queue access is denied;
- overdue calculations are checked in the restaurant timezone policy;
- manual and Google publication failure paths are exercised;
- one real pilot team uses assignments and approval actions for at least one week;
- queue use reduces operator coordination time compared with Phase 1.

## Explicitly out of scope

- Scheduled Google sync
- Automatic draft approval
- Automatic public replies
- WhatsApp or email delivery provider integration
- Escalation paging/on-call tooling
- Multi-location agency hierarchy
- Listing mutation automation
- Billing
