# Phase 2 — Google Business Profile Integration Proof

## Mission

Prove the hardest external dependency without turning Google into the foundation of the product.

Phase 2 must demonstrate that one authorised restaurant can:

1. connect a Google Business Profile account through OAuth;
2. explicitly choose the correct Google account and location;
3. retrieve reviews safely and idempotently;
4. run those reviews through the existing Tablevoice workflow;
5. publish one specifically approved reply only after express consent;
6. refresh expired credentials;
7. disconnect and revoke access; and
8. remove temporarily stored Google review content on schedule.

## Implemented flow

```text
restaurant manager starts OAuth
        ↓
PKCE + one-time state validation
        ↓
encrypted access and refresh tokens
        ↓
explicit Google account selection
        ↓
explicit location selection
        ↓
manual review sync
        ↓
Tablevoice classification, QA, approval
        ↓
per-action express consent
        ↓
Google reply update
```

## Safety and policy boundaries

- `GOOGLE_INTEGRATION_ENABLED=false` by default.
- `GOOGLE_REPLY_WRITES_ENABLED=false` independently disables all reply writes.
- A Google reply requires an approved Tablevoice draft and `consent: true` on that specific request.
- OAuth credentials are encrypted with AES-GCM before persistence.
- OAuth state is hashed, expires after ten minutes, and is single-use.
- Google integration tables are server-only and accessed with the Supabase service role.
- Google review mappings include a 30-day content expiry.
- Purge operations are restricted to the authorised restaurant.
- Disconnect supports token revocation.
- Automatic replies, scheduled publishing, and listing mutations are not implemented.

## Implemented capabilities

- OAuth 2.0 authorisation-code flow with PKCE
- Offline access and refresh-token rotation support
- Google account discovery
- Google location discovery using an explicit read mask
- Account and location validation before selection
- Paginated review retrieval
- Idempotent Google-to-local review mapping
- Update detection through Google `updateTime`
- Sync-run counters and failure records
- Optional approved-reply publication
- Token revocation and local disconnect
- Temporary-content purge endpoint
- Mocked end-to-end integration tests

## Explicitly excluded

- Automatic or scheduled review sync
- Automatic reply publishing
- Google listing edits
- Google Q&A or media management
- Zomato integration
- Review aggregation across customers
- Long-term retention of raw Google review content
- Production access before Google approval

## Blind spots to validate in staging

1. Google project approval and non-zero quotas
2. OAuth consent-screen verification
3. Behaviour when the restaurant is managed by an agency
4. Duplicate and suspended locations
5. Token revocation and reauthorisation
6. Pagination on a high-volume location
7. API rate limits and transient failures
8. Whether policy permits every intended downstream analysis
9. Purge completion for drafts, model runs, and derived records associated with expired content
10. Owner comprehension of account/location selection and reply consent

## Completion gate

Phase 2 is operationally complete only after:

- a Google-approved staging project is available;
- a real test restaurant completes OAuth;
- account and location selection are verified against the intended listing;
- reviews sync twice without duplication;
- a changed review updates the existing local row;
- token refresh is observed in staging;
- one approved reply is published with recorded express consent;
- disconnect and revoke are verified;
- 30-day deletion is verified end-to-end;
- no cross-restaurant review, token, location, or purge access is possible;
- Google policy review confirms the intended use of stored and derived review data.

Until those gates pass, the integration remains an implementation proof rather than a production feature.
