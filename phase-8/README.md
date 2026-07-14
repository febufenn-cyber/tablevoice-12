# Phase 8 — Controlled Autopilot

## Implemented

- Versioned automation policies with levels 0–3
- Green-risk ceiling enforced in code and database
- Explicit source, category, and language allowlists
- Frozen voice profile, prompt, and model provenance
- Shadow decisions and human-agreement metrics
- Written-consent and minimum-shadow gates before activation
- Restaurant and global kill switches
- Revocation and pause controls
- Idempotent execution records
- Separate environment gates for evaluation and writes
- Metrics for shadow agreement, executed, blocked, and failed actions

## Safety boundary

- Amber, red, unknown, unclassified, and nonallowlisted reviews are never eligible.
- Manual workflows remain available at all times.
- Automation writes require both database policy and environment enablement.
- Consent revocation blocks future execution.
- A kill switch overrides every policy.
- This phase records controlled automation decisions; platform writes still require their provider-specific gate and policy.

## Feature flags

- `PHASE8_AUTOPILOT_ENABLED=false`
- `PHASE8_AUTOPILOT_WRITES_ENABLED=false`
- `PHASE8_GLOBAL_KILL_SWITCH=true` is the emergency environment override.

## Deployment gate

Apply `0009_phase8_controlled_autopilot.sql`, run shadow mode through the configured threshold, verify disagreement and incident metrics, test every kill switch and consent revocation, then enable writes only for a narrowly allowlisted pilot.
