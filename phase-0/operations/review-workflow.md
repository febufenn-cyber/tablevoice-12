# Review Operations Workflow

## Purpose

Process real reviews consistently while preserving customer control, source evidence, and an auditable learning trail.

## State model

```text
received
  → normalised
  → classified
  → needs_context | draft_ready | escalated
  → qa_passed
  → sent_for_approval
  → approved | edited | rejected | skipped | escalated
  → published | not_published
  → internal_action_open | resolved | no_action
```

Never skip directly from `received` to `published`.

## 1. Receive

Accepted Phase 0 routes:

- Owner sends screenshot
- Owner copies review text
- Owner forwards a platform notification
- Operator observes a public review manually
- Owner supplies an authorised export

Capture platform, rating, date, review text, source URL/reference, and who submitted it. Do not infer missing text from a cropped screenshot.

## 2. Normalise

Record:

- Restaurant and location
- Review identifier
- Platform
- Rating
- Review date
- Reviewer display name or anonymised reference
- Original language
- Exact review text
- Dine-in, delivery, takeaway, or unknown
- Menu items, staff names, dates, times, or order details mentioned
- Existing public response
- Source-evidence location

Preserve original text separately from any translation or summary.

## 3. Classify

Apply one primary category, optional secondary categories, sentiment, risk, confidence, and urgency using `classification-taxonomy.md`.

Every meaningful complaint must yield two outputs:

1. **Public response strategy** — what can safely be said.
2. **Internal action** — what the restaurant should check or fix.

“Write a polite apology” is not an internal action.

## 4. Request context when needed

Ask only questions that could change the public response or operational action, such as:

- Was the order found in the records?
- Has a refund already been issued?
- Is the phone number in the review correct?
- Did the owner already speak to the customer?
- Is the listed opening time accurate?

Mark unverified claims explicitly. Do not delay simple green reviews for unnecessary context.

## 5. Draft

The draft package must contain:

- Risk label
- Main issue summary
- Confidence and uncertainty
- Suggested internal action
- Safe facts that may be referenced
- Facts that must not be asserted
- Proposed public reply
- Recommended disposition: reply / move offline / report to platform / do not reply / escalate

## 6. Quality assurance

Apply `qa-checklist.md`. Ordinary drafts require one operator check. Red cases require designated senior/owner review and may not use the normal approval shortcut.

## 7. Send for approval

Recommended action-card format:

```text
New {{platform}} review — {{rating}} stars
Risk: {{risk}}
Category: {{category}}

What happened:
{{summary}}

Suggested internal action:
{{action}}

Draft reply:
{{draft}}

Respond:
1 Approve
2 Edit
3 Skip
4 Escalate
```

Record sent time and channel.

## 8. Capture decision

Allowed decisions:

- **Approved unchanged**
- **Minor edit** — wording changes without changing posture, commitments, or facts
- **Major edit** — substantial rewrite or changed strategy
- **Rejected** — draft considered unusable
- **Skipped** — deliberate choice not to respond
- **Escalated** — moved to sensitive workflow

Capture the exact final text and edit reason. Never overwrite the original draft.

## 9. Manual publication

The customer publishes in Phase 0. Record:

- Publication confirmation
- Timestamp
- Screenshot or public link where appropriate
- Publication mismatch, if text differs from approved text
- Reason if an approved draft was not published

Approval is not publication.

## 10. Internal action tracking

For amber and red complaints, record:

- Action owner
- Due date
- Investigation status
- Root cause, when known
- Corrective action
- Evidence of completion
- Whether the customer was contacted privately

Public wording may close while the internal action remains open.

## 11. Learning

At the end of each interaction record:

- Voice-rule candidate
- Workflow friction
- Missing restaurant fact
- Model or operator error
- Repeated complaint signal
- Customer interface preference
- Minutes spent by workflow stage

## Service targets for the experiment

These are measurement targets, not customer promises:

- Green draft prepared within 4 business hours
- Amber draft prepared within 4 business hours after required context
- Red case acknowledged to the approver within 1 business hour
- Weekly report delivered on the agreed day

Record misses and causes rather than hiding them.
