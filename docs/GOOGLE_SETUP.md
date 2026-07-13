# Google Business Profile Setup

Phase 2 is disabled until an approved Google Cloud project and staging environment exist.

## Google Cloud prerequisites

1. Create or select a dedicated Google Cloud project.
2. Request Google Business Profile API access and wait for approval.
3. Enable the required Business Profile APIs, including account management, business information, and the review API surface.
4. Configure an OAuth consent screen.
5. Create a web OAuth client.
6. Add the exact callback URL used by the Worker, for example:

```text
https://staging.example.com/oauth/google/callback
```

7. Use the `https://www.googleapis.com/auth/business.manage` scope.

Google does not provide a Business Profile sandbox. Use a controlled real listing and keep reply writes disabled during initial testing.

## Supabase

Apply migrations in order, including:

```text
supabase/migrations/0003_phase2_google_integration.sql
```

The Phase 2 integration tables are intentionally server-only. Do not expose the service-role key to the browser or public API response.

## Cloudflare secrets and variables

```sh
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
npx wrangler secret put GOOGLE_CLIENT_ID
npx wrangler secret put GOOGLE_CLIENT_SECRET
npx wrangler secret put GOOGLE_TOKEN_ENCRYPTION_KEY
```

Set environment variables:

```text
GOOGLE_INTEGRATION_ENABLED=true
GOOGLE_REPLY_WRITES_ENABLED=false
GOOGLE_REDIRECT_URI=https://staging.example.com/oauth/google/callback
GOOGLE_OAUTH_SUCCESS_URL=https://staging.example.com/
```

Use a random token-encryption key of at least 24 characters. Rotate it only with a migration plan for already encrypted credentials.

## Staging sequence

1. Deploy with `GOOGLE_REPLY_WRITES_ENABLED=false`.
2. Connect a test restaurant.
3. Verify the Google account shown in Tablevoice.
4. Refresh and inspect location candidates.
5. Select exactly one intended location.
6. Sync reviews twice and confirm the second run does not duplicate rows.
7. Exercise access-token expiry and refresh-token recovery.
8. Test disconnect and revocation.
9. Verify an unrelated restaurant cannot inspect or mutate the connection.
10. Enable reply writes only for a controlled reply test.
11. Approve a draft in Tablevoice and provide explicit consent for that single publication request.
12. Disable reply writes again after the proof.

## Retention

Each Google review link receives a temporary-content expiry. Run the restaurant-scoped purge process regularly and verify that associated raw content is deleted within the allowed window.

Before production, extend deletion verification to every related artifact, including drafts, model runs, actions, reports, logs, and backups where applicable.

## Operational stop conditions

Disable the integration when:

- API quota is zero or approval is incomplete;
- OAuth tokens cannot be refreshed securely;
- the selected location cannot be verified;
- review mappings become inconsistent;
- a reply is attempted without explicit approval and consent;
- temporary content cannot be deleted on schedule;
- Google policy review does not support the intended downstream processing.
