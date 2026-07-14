# Tablevoice Remaining Phases — Verified Autonomous Execution Plan

## Status

- Completed and merged: Phases 0, 1, 2, and 3
- Remaining roadmap phases: **6**
- Remaining sequence: **Phase 4 through Phase 9**
- Trigger phrase: **`build`**

This document is the execution contract for the remaining Tablevoice roadmap. It exists so every phase can be verified against an agreed scope before implementation begins and then executed sequentially without repeated planning questions.

Phase 9 is the final expansion phase in the current roadmap. It contains separate multi-location, agency, and additional-platform workstreams, but remains one gated roadmap phase unless evidence justifies splitting it later.

---

# 1. Autonomous build contract

When the user says **`build`**, execute all remaining phases in order, beginning with the first phase not already present on `main`.

For every phase:

1. Read this document and the previous phase’s completion record.
2. Inspect current `main`, migrations, routes, tests, feature flags, and open pull requests.
3. Verify the phase entry gate.
4. Resolve implementation details from repository evidence and this plan without asking routine clarification questions.
5. Create `agent/phase-{number}-{short-name}` from the latest remote `main`.
6. Implement only that phase’s approved scope.
7. Add or update:
   - domain types and schemas;
   - migrations and access policies;
   - services and routes;
   - operator/customer UI where required;
   - unit, integration, end-to-end, failure, security, and regression tests;
   - phase documentation and API documentation;
   - feature flags and deployment notes.
8. Run strict typechecking, the complete test suite, and the Cloudflare Worker dry-run build.
9. Open a draft pull request targeting `main`.
10. Inspect the full diff for omissions, accidental scope expansion, secrets, and unsafe defaults.
11. Treat GitHub Actions as a release blocker. Fix failures and rerun until green.
12. Mark the PR ready only when mergeable and CI is green.
13. Squash-merge with one phase-level commit.
14. Verify remote `main` points to the new squash commit.
15. Record and report:
   - phase number and name;
   - PR number and URL;
   - final `main` commit SHA;
   - files changed;
   - test and CI result;
   - feature flags and deployment gates;
   - anything that remains impossible to verify without external credentials or real customers.
16. Only then start the next phase from the newly verified `main`.

## Non-negotiable rules

- Never stack a later phase on an unmerged branch.
- Never merge failing CI.
- Never call approval, publication, payment, delivery, or issue resolution successful without durable evidence.
- Never enable an external write integration by default.
- Never weaken red-case review handling, tenant isolation, consent, auditability, or deletion controls to improve speed.
- Never commit credentials, tokens, secrets, customer personal data, or production exports.
- Every externally destructive or public action must be idempotent, permission-checked, auditable, and recoverable where possible.
- External dependencies that cannot be exercised must use capability adapters, deterministic fixtures, mocked tests, disabled-by-default flags, and documented staging gates.
- If a phase encounters a genuine external blocker, implement the safe adapter and test boundary, merge only if the software acceptance gate passes, and report the unverified external gate honestly.

## Stop conditions

Stop the autonomous sequence before merging the affected phase when:

- tenant isolation or authorization cannot be proven;
- critical safety tests fail;
- data migration is destructive without a tested rollback path;
- CI remains red;
- the requested capability would violate a platform policy or use an unsupported integration path;
- the implementation requires a secret or business decision that cannot be represented safely as a disabled configuration;
- `main` changes externally and the branch cannot be cleanly rebased or reconstructed.

A stop condition does not permit silently skipping the phase and continuing to later phases.

---

# 2. Cross-phase engineering standards

Every remaining phase must preserve these standards.

## Architecture

```text
HTTP/UI
  → authenticated application routes
  → domain services and state transitions
  → repository/capability interfaces
  → Supabase/Postgres or external adapters
```

- The UI must not directly mutate protected tables.
- External platforms remain behind capability adapters.
- Workflow transitions occur server-side.
- All retries and public writes use idempotency keys.
- Provider-specific identifiers do not become core-domain primary keys.

## Security

- Supabase authentication plus application authorization
- Row-level security for customer-owned business data
- Service-role access only for narrowly defined server-side integration tables
- Short-lived, one-time action tokens where links are used
- Optimistic concurrency for customer and operator decisions
- Encryption for external credentials
- Audit events for all material mutations
- Retention and deletion controls for source data and derived artifacts

## Testing

Each phase adds tests for:

- happy path;
- role and tenant isolation;
- invalid state transitions;
- stale writes;
- idempotent retries;
- provider timeout/invalid response;
- deletion and disconnection;
- critical safety paths;
- prior-phase regression.

## Release shape

Each phase produces:

- one branch;
- one PR;
- one final squash commit on `main`;
- one numbered migration or an explicit statement that no migration is required;
- one phase README containing entry gate, implementation, safety boundary, known limitations, deployment gate, and completion gate.

---

# 3. Phase 4 — Restaurant Voice System

## Mission

Turn the existing voice-profile record into a controlled, versioned, measurable restaurant language system that learns only from approved evidence.

## Entry gate

- Phase 3 production workflow exists on `main`.
- Draft, QA, approval, edit reason, and final-text histories are preserved.
- Voice behavior can remain disabled independently from review processing.

## Core scope

### Voice constitution

- Structured brand identity and tone controls
- Language and code-mixing policy
- Preferred and prohibited phrases
- Greeting, acknowledgement, apology, contact, invitation, and sign-off policy
- Compensation authority
- Employee-name and privacy policy
- Category-specific response posture
- Word-count and emoji constraints

### Versioning

- Immutable voice-profile versions
- Draft, active, superseded, and rolled-back states
- Diff between versions
- Approver and approval evidence
- Effective date
- Rollback to a previous approved version

### Voice evidence

- Approved owner examples
- Rejected examples
- Edit-derived rule candidates
- Reason and scope for each rule candidate
- Restaurant-wide rule versus one-off exception
- Explicit approval before a candidate changes the active voice

### Drafting integration

- Deterministic policy assembly
- Prompt context built from the active approved version
- Recent approved-reply repetition checks
- Language matching and controlled fallback
- Category and risk-specific voice rules
- Voice-version ID stored on each generated draft

### Evaluation

- Per-restaurant acceptance rate by voice version
- Major-edit and rejection rate
- Repetition score
- Prohibited-phrase violations
- Voice regression corpus
- Side-by-side preview before activation

## Suggested data model

- `voice_profiles`
- `voice_rules`
- `voice_examples`
- `voice_rule_candidates`
- `voice_profile_approvals`
- `voice_evaluations`

Existing `voice_profiles` should be migrated rather than replaced destructively.

## Required APIs

- Create voice draft version
- Retrieve active and historical versions
- Compare versions
- Add approved/rejected examples
- List and approve/reject rule candidates
- Preview a draft with a candidate version
- Activate and roll back a version
- Retrieve voice evaluation metrics

## UI

- Voice constitution editor
- Version timeline and diff
- Rule-candidate review queue
- Example library
- Draft preview using real or synthetic reviews
- Acceptance and edit-reason metrics

## Safety boundaries

- No automatic permanent learning from a single edit.
- Compensation, privacy, employee, safety, and legal rules cannot be weakened by stylistic learning.
- Red-case response posture remains controlled by safety policy.
- Customer examples must be scoped to their restaurant and deletion policy.

## Acceptance gate

- Every draft records the exact voice version used.
- An unapproved rule cannot affect production drafting.
- Rollback restores prior behavior without data loss.
- Repetition and prohibited-phrase tests pass.
- Cross-restaurant voice leakage tests pass.
- Existing Phase 1–3 review workflows remain green.

## Out of scope

- Autonomous brand-strategy generation
- Shared voice training across unrelated restaurants
- Public template marketplace
- Vector search unless the evaluation demonstrates a concrete need

---

# 4. Phase 5 — Listing-Health Audit Engine

## Mission

Turn manual listing findings into a repeatable evidence engine that discovers, confirms, prioritizes, assigns, and verifies public business-information inconsistencies without making unsupported claims.

## Entry gate

- Versioned restaurant facts and owner authority are available.
- Existing listing-finding workflow is durable.
- Phase 4 voice work is merged and does not alter listing facts.

## Core scope

### Canonical business facts

- Owner-confirmed canonical name, address, coordinates, phone, website, hours, service modes, ordering links, reservation links, menu links, and category data
- Fact versioning and confirmation source
- Effective and expiration dates
- Holiday-hours support

### Source observations

- Manual observations
- Website observations where permitted
- Google location read adapter where approved
- Structured source snapshot with observation time
- Evidence URL, screenshot reference, or provider resource ID
- Source freshness and confidence

### Comparison engine

- Field normalization
- Time-zone-aware hours comparison
- Phone and URL normalization
- Address and map-pin comparison
- Menu/ordering/reservation link checks
- Duplicate and stale-listing indicators
- Difference versus confirmed issue distinction

### Findings workflow

```text
observed difference
  → confidence/severity assessment
  → owner confirmation
  → confirmed issue or dismissed difference
  → assigned correction
  → correction evidence
  → verification check
  → closed
```

### Prioritization

- Safety/accessibility risk
- Visit or order disruption
- Revenue-impact hypothesis without fabricated amounts
- Trust degradation
- Workaround availability
- Source authority and freshness

## Suggested data model

- `canonical_business_facts`
- `business_fact_versions`
- `listing_source_observations`
- `listing_comparison_runs`
- expanded `listing_findings`
- `listing_correction_attempts`

## Required APIs

- Create/update canonical facts with owner confirmation
- Record source observation
- Run comparison
- List findings by status/severity/source
- Confirm, dismiss, assign, resolve, and verify finding
- Retrieve comparison and correction history
- Produce a listing-health snapshot

## UI

- Canonical-fact editor
- Source comparison table
- Evidence viewer
- Owner-confirmation inbox
- Correction queue
- Before/after verification report

## Safety boundaries

- A difference is not labelled an error until confirmed or directly authoritative.
- No unsupported revenue-loss claims.
- No automatic listing mutation in this phase.
- Scraping is not introduced where terms or technical access do not support it.
- Sensitive credentials are never requested merely to observe public data.

## Acceptance gate

- Normalization tests cover hours, phone, URL, address, and map/location cases.
- Repeated comparison runs are idempotent.
- Owner confirmation is required before issue state.
- Correction evidence and verification are distinct states.
- No cross-tenant observation leakage.
- Listing snapshot generation is deterministic from stored evidence.

## Out of scope

- Automatic Google listing edits
- Unsupported Zomato crawling
- Guaranteed revenue attribution
- Broad web crawler

---

# 5. Phase 6 — Issue-Resolution Layer

## Mission

Connect public review signals to accountable internal operational incidents, actions, ownership, evidence, and resolution outcomes.

## Entry gate

- Review categories and internal actions exist.
- Production queue and assignments are reliable.
- Listing findings can also generate actions.

## Core scope

### Incident model

- Group multiple reviews/findings into one operational issue
- Manual grouping and explainable suggested grouping
- Incident category, severity, confidence, location, service mode, menu item, daypart, and date range
- Root-cause hypothesis versus confirmed root cause
- Owner, collaborators, due date, and escalation state

### Action plans

- Structured corrective actions
- Checklist and dependencies
- Assignee and approver
- Due date and reminders
- Completion evidence
- Verification step
- Reopen flow

### Private customer recovery tracking

- Contact requested/completed
- Approved recovery type
- Compensation authority and amount range where allowed
- Outcome without exposing private data broadly
- Separation from public reply

### Recurrence engine

- Stable tags
- Threshold-based pattern detection
- Evidence list
- Confidence and minimum sample size
- Suppression of duplicate incident suggestions
- Trend comparison before and after resolution

### Escalation

- Sensitive/restricted incidents
- Role-limited notes
- Food safety, harassment, fraud, and legal workflows
- Critical-incident pause and containment

## Suggested data model

- `operational_incidents`
- `incident_signals`
- `incident_actions`
- `incident_members`
- `incident_evidence`
- `customer_recovery_records`
- `incident_verifications`

## Required APIs

- Create incident from review/finding
- Suggest and confirm signal grouping
- Assign and update incident
- Add action, evidence, root cause, and verification
- Record private recovery outcome
- Reopen or close
- Retrieve incident timeline and recurrence metrics

## UI

- Incident inbox
- Signal grouping view
- Action-plan board
- Restricted sensitive-case workspace
- Root-cause and verification form
- Before/after recurrence chart

## Safety boundaries

- Suggested grouping never silently becomes fact.
- Sensitive notes have stricter access than ordinary reviews.
- Employee and customer private data are minimized.
- Compensation remains authority-controlled.
- Closing a public reply does not close the operational incident.

## Acceptance gate

- Multiple reviews can map to one incident without losing original records.
- Incident closure requires evidence or an explicit dismissal reason.
- Restricted access tests pass.
- Reopening preserves history.
- Recurrence suggestions expose evidence and confidence.
- Incident actions are included in audit logs and retention behavior.

## Out of scope

- Full restaurant task-management replacement
- HR case-management system
- Legal case-management system
- Automatic compensation

---

# 6. Phase 7 — Weekly Owner Intelligence

## Mission

Transform reviews, listing findings, incidents, actions, and outcomes into concise, evidence-backed owner intelligence that drives a small number of decisions.

## Entry gate

- Review, listing, and incident data are reliable.
- Publication, action, and resolution outcomes are recorded.
- Metrics can distinguish missing data from zero.

## Core scope

### Metric definitions

- Review volume and response coverage
- Approval, edit, rejection, and publication rates
- Median response and approval time
- Risk and category distribution
- Open and overdue work
- Listing findings confirmed and corrected
- Incidents opened, resolved, reopened, and overdue
- Recurrence before/after action
- Operator minutes and model/provider cost where available

### Report generation

- Deterministic metric computation
- Model-assisted narrative only from supplied evidence
- Confidence and small-sample caveats
- Maximum three recommended owner actions
- Pending decisions
- Wins and risks
- Source period and data completeness

### Report workflow

```text
scheduled or manual generation
  → deterministic dataset snapshot
  → narrative draft
  → validator
  → operator/owner approval
  → delivery attempt
  → read/action evidence
```

### Delivery adapters

- Secure in-app report
- Email adapter
- WhatsApp-link adapter without exposing sensitive body content
- Delivery attempt and failure ledger
- Unsubscribe and notification preference support

### Intelligence history

- Report versioning
- Recommendation acceptance
- Action selected
- Action completed
- Report usefulness feedback
- Month-over-month comparison

## Suggested data model

- expanded `weekly_reports`
- `report_metric_snapshots`
- `report_recommendations`
- `report_delivery_attempts`
- `notification_preferences`
- `report_feedback`

## Required APIs

- Generate report preview
- Validate, approve, and deliver
- Retrieve report and metric snapshot
- Record selected recommendation and completion
- Manage notification preferences
- Retrieve historical comparisons

## UI

- Owner report
- Evidence drill-down
- Three-action decision panel
- Delivery status
- Historical report archive
- Report feedback

## Safety boundaries

- Narratives cannot invent causality, revenue impact, or trends.
- Small samples are labelled.
- Sensitive incidents are summarized according to role and privacy policy.
- Delivery does not expose confidential report content in unsecured notifications.
- Automated delivery remains feature-flagged until deliverability and consent are tested.

## Acceptance gate

- Every displayed metric can be reproduced from the metric snapshot.
- Narrative claims link to evidence.
- Zero and missing data are distinct.
- Delivery attempts are idempotent and auditable.
- Notification preferences are enforced.
- At least one end-to-end report path covers generation through action completion.

## Out of scope

- Arbitrary business-intelligence dashboard builder
- Financial forecasting
- Unsupported competitor benchmarking
- Guaranteed rating improvement claims

---

# 7. Phase 8 — Controlled Autopilot

## Mission

Introduce narrowly bounded automation only where historical evidence demonstrates sufficient reliability, while preserving explicit policy controls, kill switches, audit trails, and rapid rollback.

## Entry gate

- Production workflow metrics exist by restaurant, risk, category, language, and voice version.
- Voice, incident, and report systems have stable evaluations.
- External provider write paths are approved and tested in staging.
- Sufficient approved historical decisions exist to set measurable automation thresholds.

## Core scope

### Automation policy

Per restaurant and location:

- Allowed sources
- Allowed rating/risk/category/language combinations
- Approved voice version
- Minimum model and validator confidence
- Maximum reply length
- Blocked terms and commitments
- Operating hours
- Daily volume cap
- Required human sample-review rate
- Automatic pause conditions

### Automation levels

- Level 0: manual
- Level 1: automatic classification/draft, human QA and approval
- Level 2: automatic green QA pass, human approval
- Level 3: automatic publication for explicitly allowed low-risk cases

No higher level is introduced in the current roadmap.

### Shadow mode

- Generate automation decision without executing
- Compare with actual human decision
- Measure disagreement and safety defects
- Require a minimum observation window before enablement

### Execution controls

- Per-restaurant opt-in
- Express written consent
- Feature flag plus database policy
- Idempotent publication
- Global and restaurant kill switches
- Automatic pause on provider errors, policy violation, disagreement spike, or critical incident
- Rollback and customer notification process

### Monitoring

- Automation volume
- Human override rate
- Post-publication edit/delete rate
- False-positive and false-negative risk classification
- Unsafe draft rate
- Provider failure rate
- Customer complaint or opt-out

## Suggested data model

- `automation_policies`
- `automation_policy_versions`
- `automation_shadow_decisions`
- `automation_executions`
- `automation_overrides`
- `automation_kill_switch_events`

## Required APIs

- Create and preview automation policy
- Run shadow mode
- Retrieve eligibility and disagreement metrics
- Approve and enable policy
- Pause, resume, and disable
- Retrieve execution and override history

## UI

- Automation policy builder
- Eligibility preview
- Shadow-mode comparison
- Consent and activation screen
- Live automation monitor
- Kill switch
- Override and incident review

## Safety boundaries

- Red and unknown-risk cases can never autopublish.
- Amber cases remain human-controlled unless a future separately approved roadmap changes that rule.
- Compensation, legal, safety, harassment, fraud, employee, and personal-data cases are excluded.
- No restaurant is enabled by default.
- A model upgrade cannot silently inherit automation approval.
- Automation pauses fail closed.

## Acceptance gate

- Shadow mode meets predefined safety and agreement thresholds.
- Kill switches work in end-to-end tests.
- Model, prompt, policy, and voice versions are recorded on every execution.
- Duplicate requests cannot create duplicate public replies.
- Revoked consent immediately blocks execution.
- Critical incidents automatically pause the affected policy.
- Manual operation continues when automation is disabled.

## Out of scope

- Fully autonomous negative-review handling
- Automatic refunds or compensation
- Autonomous listing mutation
- Self-modifying policy
- Cross-customer learning without explicit safe aggregation design

---

# 8. Phase 9 — Multi-Location, Agency, and Platform Expansion

## Mission

Scale the proven system across multiple locations and agency operators without weakening isolation, approval authority, brand governance, billing boundaries, or provider-policy compliance.

## Entry gate

- Single-location workflows are stable and paid usage evidence exists.
- Role separation is understood.
- Controlled automation, if used, has safe operating evidence.
- At least one multi-location or agency customer demonstrates a real need.

## Workstream 9A — Multi-location hierarchy

- Organisation → brand → region/group → location hierarchy
- Location-specific facts, voice overrides, and automation policy
- Inherited defaults with explicit override visibility
- Cross-location queue and reporting
- Regional and brand roles
- Bulk operations with previews and limits

## Workstream 9B — Agency mode

- Agency organisation and client workspaces
- Delegated access contracts
- Client-owned data and revocation
- White-label configuration only where justified
- Agency operator queue
- Client approval routes
- Separate agency and client audit events
- Export and handoff when an agency relationship ends

## Workstream 9C — Commercial controls

- Subscription entitlements by location
- Usage metering
- Plan and feature enforcement
- Invoice/payment-provider adapter
- Trial and grace state
- Suspension without destructive deletion
- Billing webhooks with signature verification and idempotency

## Workstream 9D — Additional platforms

Add a platform only when an official or contractually supported route is verified.

Each adapter must declare capabilities:

```text
can_read_reviews
can_publish_replies
can_edit_replies
can_delete_replies
supports_webhooks
supports_incremental_sync
content_retention_rules
required_consent
```

Potential adapters remain uncommitted until verified. Unsupported scraping must not become a production dependency.

## Suggested data model

- `brands`
- `location_groups`
- expanded memberships and delegated grants
- `agency_client_relationships`
- `entitlements`
- `subscriptions`
- `usage_events`
- `billing_events`
- provider connection tables per supported platform

## Required APIs

- Manage hierarchy, inheritance, and overrides
- Manage agency-client delegation and revocation
- Cross-location queue and reporting
- Bulk action preview and execution
- Entitlement and usage endpoints
- Billing-provider webhook
- Provider capability and connection endpoints

## UI

- Portfolio switcher
- Cross-location queue
- Brand and location policy hierarchy
- Agency client manager
- Delegated approval view
- Usage and subscription screen
- Provider connection center

## Safety boundaries

- Agency access never changes data ownership.
- Revocation must immediately remove access and future actions.
- Cross-location bulk actions require preview, scope display, limits, and idempotency.
- Inheritance cannot silently override stricter local safety policies.
- Billing failures do not delete customer records.
- Additional platforms remain disabled until policy, retention, and real-environment tests pass.

## Acceptance gate

- Tenant and delegated-access matrix tests pass.
- Location overrides and inheritance are deterministic.
- Revoked agency access fails immediately.
- Bulk operations are resumable and idempotent.
- Billing webhook replay is safe.
- Entitlements are enforced server-side.
- Each new provider passes its own connection, sync, consent, write, revocation, retention, and failure tests.
- Existing single-location workflow remains usable.

## Out of scope

- Marketplace of unverified integrations
- Unlimited white-label customization
- Unsupported platform scraping
- Enterprise data warehouse
- Franchise accounting or POS replacement

---

# 9. Sequential dependency map

```text
Phase 3 production workflow
        ↓
Phase 4 controlled restaurant voice
        ↓
Phase 5 evidence-backed listing health
        ↓
Phase 6 operational incident resolution
        ↓
Phase 7 owner intelligence and delivery
        ↓
Phase 8 bounded autopilot
        ↓
Phase 9 multi-location, agency, billing, and supported platforms
```

Why this order:

- Autopilot cannot be safe before voice, workflow, incident, and evaluation data are reliable.
- Owner intelligence is weak before operational resolution outcomes exist.
- Multi-location inheritance magnifies mistakes, so it comes after single-location policy and automation controls.
- Billing and agency architecture should follow evidence about the real buyer rather than precede it.

---

# 10. Verification checklist before each phase

Before writing code, record the answers in the phase PR description.

## Repository verification

- [ ] Remote `main` SHA recorded
- [ ] Previous phase commit exists on `main`
- [ ] No conflicting open implementation PR
- [ ] Current migrations inspected
- [ ] Current domain types, routes, repositories, tests, feature flags, and docs inspected
- [ ] No secret or customer-data file present in proposed scope

## Scope verification

- [ ] Phase mission matches this document
- [ ] Entry gate is satisfied or external limitations are explicitly isolated
- [ ] Must-build and out-of-scope lists are preserved
- [ ] Safety boundaries identified
- [ ] Migration strategy and rollback considered
- [ ] External provider policy and API surface verified when applicable

## Acceptance verification

- [ ] New tests map to every acceptance criterion
- [ ] Tenant and role tests included
- [ ] Failure and retry behavior defined
- [ ] Audit and retention behavior defined
- [ ] Feature is disabled by default when external or high-risk
- [ ] Prior-phase regression suite remains mandatory

---

# 11. Merge and confirmation protocol

For every remaining phase, the final report must contain this exact evidence shape:

```text
Phase: <number and name>
Branch: agent/phase-<number>-<name>
PR: <number and URL>
CI: success
Merge method: squash
Main commit: <40-character SHA>
Remote main verified: yes
Files changed: <count>
Tests: <count or suite summary>
Feature flags: <list>
External gates still unverified: <list or none>
Next phase may start: yes/no
```

A GitHub squash merge is itself the remote push to `main`. Do not claim a separate local `git push` occurred when the GitHub merge directly updated the remote branch.

---

# 12. Meaning of the command `build`

After this plan is merged, **`build`** means:

> Implement Phases 4, 5, 6, 7, 8, and 9 sequentially using this document. For each phase, verify the plan, branch from the latest `main`, implement, test, open a PR, obtain green CI, squash-merge, verify the new remote `main` SHA, report the result, and continue to the next phase without requesting routine confirmation.

The command does not waive safety, platform-policy, CI, authorization, retention, or tenant-isolation gates.
