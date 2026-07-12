# Deployment

## 1. Supabase

1. Create a Supabase project for staging.
2. Apply the SQL files in `supabase/migrations/` in numeric order.
3. Create test users through Supabase Auth.
4. Set `app_metadata.platform_role` only for trusted Tablevoice operators or administrators.
5. Test that two unrelated organisations cannot read each other’s restaurants, reviews, drafts, actions, findings, reports, model runs, or audit events.

## 2. Cloudflare Worker

Set secrets and variables:

```sh
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_ANON_KEY
npx wrangler secret put ANTHROPIC_API_KEY      # optional
npx wrangler secret put ANTHROPIC_MODEL        # optional
```

`DEV_AUTH_BYPASS` must remain `false` outside local development.

Deploy:

```sh
npm install
npm run check
npm run deploy
```

Cloudflare serves `public/` as static assets and runs the Worker first for `/v1/*` and `/health`.

## 3. Model operation

When both Anthropic variables are configured, the Worker uses the Messages API and validates JSON against the Phase 1 schema. Without them, it uses the deterministic fallback. Red deterministic triggers always use the fail-closed fallback and never a routine free-form draft.

## 4. Staging release checklist

- Typecheck and tests pass
- Database migration applied to disposable staging first
- RLS cross-tenant tests pass
- Auth-token expiry tested
- `DEV_AUTH_BYPASS=false`
- Red-case evaluation corpus passes
- Wrong-restaurant notification drill completed
- Review deletion tested
- Model timeout and invalid JSON tested
- Operator console checked on mobile and desktop
