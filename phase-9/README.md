# Phase 9 — Multi-Location, Agency, Billing, and Supported Platform Expansion

## Implemented

- Organization → brand → location-group → restaurant assignment hierarchy
- Policy resolution where the strictest safety level wins
- Agency/client relationships with capability-specific delegated grants
- Immediate relationship and grant revocation
- Plan, trial, and override entitlements with limits and expiry
- Idempotent usage events and entitlement enforcement
- Provider-neutral subscription records
- Signed, replay-safe billing webhook events behind an independent flag
- Provider capability registry requiring verification evidence before support is claimed
- Preview-first, idempotent bulk operations with per-location blocked reasons
- Authenticated organization and platform APIs, server-only tables, tests, and migration

## Safety boundary

- Agency access is explicit, scoped, and revocable.
- Local stricter safety settings cannot be weakened by inherited settings.
- Billing state does not rewrite historical customer data.
- Webhooks require a signature and provider event ID.
- Unsupported platforms remain `unverified` or `blocked`; no adapter is fabricated.
- Bulk changes require the exact stored preview before execution.
- New providers remain disabled until separately verified and implemented.

## Feature flags

- `PHASE9_PLATFORM_ENABLED=false`
- `PHASE9_BILLING_WEBHOOKS_ENABLED=false`
- `PHASE9_BILLING_WEBHOOK_SECRET` is server-only.

## Deployment gate

Apply `0010_phase9_expansion_platform.sql`, test the full role matrix across multiple organizations and locations, verify grant revocation, run entitlement and webhook replay tests, reconcile billing events, review every provider capability claim, and drill bulk previews with mixed eligible and blocked locations.

## Explicit non-claims

- No Zomato or other unsupported provider integration is added.
- The `stripe_adapter` is a generic signed billing-event contract, not a claim of live Stripe configuration.
- No automatic billing collection is enabled by repository code alone.
