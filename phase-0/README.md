# Phase 0 — Concierge Validation

## Mission

Prove that restaurant decision-makers repeatedly trust, use, act on, and pay for Tablevoice before building platform integrations or a customer-facing SaaS.

Phase 0 is a 28-day field experiment. Customers experience the intended outcome, while review collection, quality control, approval routing, audit preparation, and reporting remain intentionally manual.

## Non-negotiable principles

1. **Behaviour beats compliments.** “Great idea” is not validation. A submitted review, published reply, corrected listing, repeat use, referral, or payment is evidence.
2. **No uncontrolled publishing.** Every public reply requires explicit customer approval and manual publication.
3. **Public reply and internal action are separate.** The correct wording does not resolve the underlying operational problem.
4. **Sensitive cases stop the normal workflow.** Food safety, allergy, harassment, discrimination, threats, fraud, legal claims, employee accusations, and personal-data exposure require escalation.
5. **Source evidence is preserved.** Every audit finding must identify the observed sources, confidence, and owner confirmation status.
6. **Manual work is measured.** Operator time and model cost are captured per restaurant and review.
7. **Phase 0 does not smuggle in Phase 1.** No OAuth, automatic publishing, multi-tenant dashboard, billing engine, scraping system, vector database, or mobile app.

## Target cohort

Recruit 10 qualified restaurants:

- 4 independent dine-in restaurants
- 2 delivery-heavy restaurants or cloud kitchens
- 2 cafés or bakeries
- 1 premium or family restaurant
- 1 agency-managed restaurant

Prefer one location, an identifiable decision-maker, at least 30 public reviews, 4–10 new reviews per month, unanswered reviews, and no established reputation-management platform.

## Offer

> For 14 days, Tablevoice will prepare review responses in your restaurant’s voice, flag sensitive complaints, identify public listing inconsistencies, and send a weekly action report. You approve and publish every response yourself.

### Customer deliverables

- Initial reputation and listing snapshot
- Restaurant profile and voice constitution
- Risk-classified review drafts
- Internal action recommendation for meaningful complaints
- Sensitive-case escalation
- Weekly owner report
- Final before/after and continuation recommendation

### Customer obligations

- Name the buyer, daily operator, approver, listing account holder, and operational owner
- Confirm official business facts
- Approve, edit, reject, or escalate drafts
- Publish approved replies manually
- Confirm listing corrections and internal actions
- Participate in midpoint and final interviews

## Operating cadence

### Days 1–2 — Prepare

- Freeze hypotheses and phase gates
- Create prospect list
- Rehearse audit and escalation workflow
- Define pricing offers
- Test all tracking sheets with synthetic data only

### Days 3–7 — Recruit

- Identify 30 qualified prospects
- Send 15 evidence-led messages
- Conduct 8–10 discovery conversations
- Deliver 5 short snapshots
- Secure 3–5 pilot commitments

### Days 8–14 — First delivery week

- Complete onboarding
- Process selected historical reviews and new reviews
- Route drafts through the customer's preferred channel
- Record every edit, decision, publication, and elapsed minute
- Deliver the first weekly report

### Days 15–21 — Repetition test

- Observe whether customers return without prompting
- Refine voice rules from edits
- Detect recurring complaint themes
- Test listing confirmation and correction behaviour
- Offer paid continuation

### Days 22–28 — Payment and decision

- Collect payment where accepted
- Run final interviews
- Calculate cost to serve
- Segment outcomes by buyer and workflow
- Complete `findings/phase-0-decision.md`

## Definition of active use

A restaurant is active in a seven-day period only when it completes at least one meaningful action:

- approves, edits, rejects, or escalates a real draft;
- confirms and acts on a listing finding;
- closes an internal operational action;
- requests another review be processed; or
- pays for continued service.

Opening a report or replying “okay” does not count.

## Repo map

- [`hypotheses.md`](hypotheses.md) — falsifiable assumptions
- [`customer-selection.md`](customer-selection.md) — qualification and cohort rules
- [`outreach/`](outreach/) — prospecting messages and interviews
- [`onboarding/`](onboarding/) — restaurant and voice profiles
- [`operations/`](operations/) — review workflow, taxonomy, escalation, QA
- [`audits/`](audits/) — evidence-backed listing audit
- [`reports/`](reports/) — weekly owner intelligence
- [`experiments/experiment-plan.md`](experiments/experiment-plan.md) — outreach, interface, and pricing tests
- [`metrics/`](metrics/) — events and phase gates
- [`data/`](data/) — CSV templates for field operations
- [`findings/`](findings/) — immutable experiment log and final decision

## Phase completion rule

Phase 0 documentation may be merged before the field experiment concludes, but **Phase 0 itself is not complete** until the decision record contains real customer evidence. Synthetic examples, internal opinions, and uncollected invoices cannot satisfy the gate.
