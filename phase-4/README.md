# Phase 4 — Restaurant Voice System

## Entry gate

Phase 3 production inbox, approvals, edits, and publication history are present on `main`.

## Implemented

- Immutable draft voice versions built from the active version
- Explicit activation and rollback with approver evidence
- Structured rules for phrases, language, response posture, contact, privacy, greetings, apologies, invitations, and sign-offs
- Approved and rejected example library
- Edit-derived rule-candidate queue
- Candidate approval into a draft version only; activation remains separate
- Deterministic preview with language fallback, prohibited-phrase warnings, word limits, and repetition score
- Acceptance, major-edit, rejection, repetition, and prohibited-phrase metrics by exact voice version
- Database trigger that records the active `voice_profile_id` and `voice_profile_version` on every new draft
- Service-role storage behind restaurant-role-checked application routes

## API surface

- `GET/POST /v1/restaurants/:restaurantId/voice/versions`
- `GET /v1/restaurants/:restaurantId/voice/compare?from=&to=`
- `POST /v1/restaurants/:restaurantId/voice/versions/:profileId/rules`
- `POST /v1/restaurants/:restaurantId/voice/examples`
- `GET/POST /v1/restaurants/:restaurantId/voice/candidates`
- `POST /v1/restaurants/:restaurantId/voice/candidates/:candidateId/decision`
- `POST /v1/restaurants/:restaurantId/voice/versions/:profileId/activate`
- `POST /v1/restaurants/:restaurantId/voice/versions/:profileId/rollback`
- `POST /v1/restaurants/:restaurantId/voice/versions/:profileId/preview`
- `GET /v1/restaurants/:restaurantId/voice/versions/:profileId/evaluation`

## Safety boundary

- No edit changes production behavior automatically.
- Active versions cannot be mutated.
- Candidate approval cannot activate a version.
- Privacy/safety-policy candidates cannot be applied through the lightweight learning flow.
- Red-case handling remains controlled by the existing deterministic safety policy.
- Examples and metrics are always restaurant scoped.

## Feature flag

`PHASE4_VOICE_ENABLED=false` by default.

## Deployment gate

1. Apply migration `0005_phase4_restaurant_voice.sql` in staging.
2. Verify the draft-provenance trigger with existing and new restaurants.
3. Verify cross-restaurant authorization and service-role isolation.
4. Run side-by-side previews before activating a version.
5. Confirm rollback restores the previous version without deleting history.

## Known external limits

No external credential is required. Real acceptance-rate usefulness still requires restaurant approvals and edits from production or a controlled pilot.

## Completion gate

Phase 4 software is complete when CI is green and staging proves provenance, isolation, activation, candidate review, and rollback. Product effectiveness remains an evidence gate.
