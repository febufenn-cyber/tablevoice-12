# Phase 0 Event Dictionary

Use stable event names. One row represents one event; do not infer events from memory at the end of the pilot.

## Prospect and sales events

| Event | Required properties | Definition |
|---|---|---|
| prospect_qualified | restaurant_id, score, segment, date | Meets recorded qualification rule |
| outreach_sent | restaurant_id, variant, channel, date | Personalised message delivered |
| outreach_replied | restaurant_id, response_type, date | Any substantive response |
| snapshot_accepted | restaurant_id, format, date | Prospect agrees to receive snapshot |
| snapshot_delivered | restaurant_id, findings_count, operator_minutes | Snapshot actually delivered |
| discovery_completed | restaurant_id, participant_role, date | Behaviour interview completed |
| pilot_offered | restaurant_id, offer, price, duration | Concrete pilot offer presented |
| pilot_accepted | restaurant_id, offer, price, start_date | Customer commits time/data |
| payment_received | restaurant_id, amount, offer, date | Funds actually received |
| continuation_accepted | restaurant_id, amount, period | Paid or contractually committed continuation |
| referral_introduced | restaurant_id, referred_prospect_id | Direct relevant introduction made |

## Onboarding events

| Event | Required properties | Definition |
|---|---|---|
| profile_completed | restaurant_id, completeness, date | Required business profile completed |
| voice_constitution_approved | restaurant_id, approver, version | Approver accepts voice rules |
| consent_recorded | restaurant_id, scope, timestamp | Explicit pilot consent captured |
| baseline_recorded | restaurant_id, review_count, response_coverage | Before-state captured |

## Review workflow events

| Event | Required properties | Definition |
|---|---|---|
| review_received | review_id, restaurant_id, source, timestamp | Real review enters workflow |
| review_normalised | review_id, language, completeness | Original and structured fields captured |
| review_classified | review_id, category, risk, confidence | Taxonomy applied |
| context_requested | review_id, question_type, timestamp | Necessary factual question sent |
| draft_created | review_id, model_or_method, operator_minutes | First draft exists |
| qa_completed | review_id, result, defect_severity | Checklist completed |
| draft_sent | review_id, channel, timestamp | Action card delivered |
| draft_approved | review_id, edit_level, timestamp | Customer accepts unchanged/minor/major edit |
| draft_rejected | review_id, reason, timestamp | Customer marks unusable |
| response_skipped | review_id, reason | Deliberate no-response choice |
| review_escalated | review_id, trigger, timestamp | Red/sensitive workflow opened |
| response_published | review_id, timestamp, evidence_type | Customer confirms public publication |
| response_not_published | review_id, reason | Approved reply remains unpublished |
| internal_action_opened | review_id, action_type, owner, due_date | Operational action assigned |
| internal_action_completed | review_id, completion_evidence, date | Corrective action confirmed |
| voice_rule_candidate | review_id, change, reason | Owner edit suggests a reusable rule |
| voice_rule_approved | restaurant_id, version, approver | Candidate becomes a restaurant rule |

## Audit and report events

| Event | Required properties | Definition |
|---|---|---|
| listing_finding_observed | finding_id, field, sources, confidence | Difference recorded without asserting error |
| listing_finding_confirmed | finding_id, owner, status | Owner confirms issue or correct state |
| listing_action_completed | finding_id, evidence, date | Public information corrected |
| weekly_report_delivered | restaurant_id, period, channel | Report delivered |
| weekly_action_selected | restaurant_id, action_id | Owner names first intended action |
| weekly_action_completed | restaurant_id, action_id, evidence | Recommended action completed |

## Incident events

| Event | Required properties | Definition |
|---|---|---|
| critical_incident_opened | incident_id, type, review_id, timestamp | Critical defect or safety/privacy failure found |
| critical_incident_contained | incident_id, action, timestamp | Exposure stopped |
| critical_incident_closed | incident_id, root_cause, corrective_action | Root cause and prevention documented |

## Derived metrics

- Snapshot acceptance = snapshot_accepted / qualified prospects contacted
- Pilot conversion = pilot_accepted / snapshot_delivered
- Paid conversion = payment_received restaurants / pilot_accepted restaurants
- Draft usefulness = approved unchanged + minor edit / drafts sent
- Major rewrite rate = major edit / drafts sent
- Rejection rate = rejected / drafts sent
- Publication rate = published / approved drafts
- Repeat-active rate = restaurants active in two separate weeks / activated restaurants
- Listing action rate = completed listing actions / confirmed material findings
- Internal action rate = completed internal actions / opened internal actions
- Median operator minutes per ordinary review
- Monthly contribution estimate by offer and segment

## Data-quality rules

- Use UTC timestamps plus local date/time where operationally useful.
- Never reuse identifiers across restaurants.
- Do not backfill customer decisions without noting the source.
- Preserve zero denominators rather than displaying misleading percentages.
- Record missing data as missing, not as zero.
