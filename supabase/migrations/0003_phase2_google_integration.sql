-- Tablevoice Phase 2: Google Business Profile integration proof
-- Google-sourced review content is linked to an explicit expiry and must be purged within 30 days.

alter table public.reviews drop constraint if exists reviews_ingestion_method_check;
alter table public.reviews add constraint reviews_ingestion_method_check
  check (ingestion_method in ('manual', 'csv', 'email', 'screenshot', 'api'));

create table public.google_oauth_flows (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  actor_id uuid not null references auth.users(id) on delete cascade,
  state_hash text not null unique,
  code_verifier_ciphertext text not null,
  redirect_uri text not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);
create index google_oauth_flows_expiry_idx on public.google_oauth_flows(expires_at) where consumed_at is null;

create table public.google_connections (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null unique references public.restaurants(id) on delete cascade,
  status text not null check (status in ('pending', 'connected', 'needs_reauth', 'disconnected', 'error')),
  access_token_ciphertext text not null,
  refresh_token_ciphertext text,
  token_type text not null default 'Bearer',
  scope text not null,
  expires_at timestamptz not null,
  external_account_name text,
  external_account_display_name text,
  selected_location_name text,
  selected_location_title text,
  connected_by uuid not null references auth.users(id),
  connected_at timestamptz not null,
  updated_at timestamptz not null default now(),
  disconnected_at timestamptz,
  last_error text
);

create table public.google_location_candidates (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  connection_id uuid not null references public.google_connections(id) on delete cascade,
  name text not null,
  title text not null,
  store_code text,
  metadata jsonb,
  selected boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (restaurant_id, name)
);
create unique index google_location_one_selected_idx on public.google_location_candidates(restaurant_id) where selected;

create table public.google_sync_runs (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  connection_id uuid not null references public.google_connections(id) on delete cascade,
  status text not null check (status in ('running', 'succeeded', 'failed')),
  reviews_seen integer not null default 0 check (reviews_seen >= 0),
  reviews_imported integer not null default 0 check (reviews_imported >= 0),
  reviews_updated integer not null default 0 check (reviews_updated >= 0),
  reviews_skipped integer not null default 0 check (reviews_skipped >= 0),
  pages_fetched integer not null default 0 check (pages_fetched >= 0),
  error text,
  started_at timestamptz not null,
  completed_at timestamptz
);
create index google_sync_runs_restaurant_idx on public.google_sync_runs(restaurant_id, started_at desc);

create table public.google_review_links (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  connection_id uuid not null references public.google_connections(id) on delete cascade,
  google_review_name text not null,
  google_review_id text not null,
  local_review_id uuid not null unique references public.reviews(id) on delete cascade,
  google_update_time timestamptz not null,
  google_create_time timestamptz not null,
  reply_comment text,
  reply_update_time timestamptz,
  content_expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (restaurant_id, google_review_name)
);
create index google_review_links_expiry_idx on public.google_review_links(content_expires_at);

-- These tables contain OAuth secrets or Google-provided content metadata. They are server-only.
alter table public.google_oauth_flows enable row level security;
alter table public.google_connections enable row level security;
alter table public.google_location_candidates enable row level security;
alter table public.google_sync_runs enable row level security;
alter table public.google_review_links enable row level security;

revoke all on public.google_oauth_flows from anon, authenticated;
revoke all on public.google_connections from anon, authenticated;
revoke all on public.google_location_candidates from anon, authenticated;
revoke all on public.google_sync_runs from anon, authenticated;
revoke all on public.google_review_links from anon, authenticated;
