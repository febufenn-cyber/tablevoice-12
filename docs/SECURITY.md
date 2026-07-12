# Security Model

## Defence in depth

Tablevoice uses:

1. Supabase authentication to establish the user identity.
2. A Supabase client created with the caller’s bearer token, preserving RLS.
3. RLS helper functions that limit rows to organisation membership or trusted platform roles.
4. Server-side state transitions and validation.
5. Audit events for mutations.

The anon key is not an authorisation bypass. Never place the service-role key in the Worker or browser for normal API traffic.

## Sensitive-case controls

- Deterministic red triggers fail closed.
- Normal approval controls are not used to generate routine model drafts for deterministic red reviews.
- Internal notes should avoid unnecessary personal or medical details.
- Audit metadata must not contain full sensitive records.

## Secrets

- Keep model and deployment keys in Cloudflare secrets.
- Do not commit `.dev.vars`, `.env`, or tokens.
- The operator console keeps bearer tokens in `sessionStorage`, not persistent local storage.

## Incident conditions

Treat these as critical:

- cross-tenant data access;
- wrong restaurant receives a review or draft;
- sensitive review downgraded and sent as routine;
- invented investigation or compensation reaches the customer;
- public publishing occurs without explicit authority;
- deletion request fails or data remains unexpectedly accessible.
