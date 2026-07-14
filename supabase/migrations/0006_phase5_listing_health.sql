-- Tablevoice Phase 5: evidence-backed listing-health audit engine

create table public.business_fact_versions (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  version integer not null check (version > 0),
  status text not null check (status in ('active','superseded')),
  facts jsonb not null,
  confirmation_source text not null,
  confirmed_by uuid not null references auth.users(id),
  effective_at timestamptz not null,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  unique (restaurant_id, version)
);
create unique index business_fact_one_active_idx on public.business_fact_versions(restaurant_id) where status='active';

create table public.listing_source_observations (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  source text not null check (source in ('manual','website','google','other')),
  source_reference text,
  facts jsonb not null,
  evidence text,
  confidence text not null check (confidence in ('high','medium','low')),
  observed_at timestamptz not null,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);
create index listing_observations_restaurant_idx on public.listing_source_observations(restaurant_id, observed_at desc);

create table public.listing_comparison_runs (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  canonical_version_id uuid not null references public.business_fact_versions(id) on delete cascade,
  observation_id uuid not null references public.listing_source_observations(id) on delete cascade,
  input_hash text not null,
  status text not null check (status='completed'),
  finding_count integer not null check (finding_count >= 0),
  created_at timestamptz not null default now(),
  unique (restaurant_id, input_hash)
);

create table public.listing_health_findings (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  comparison_run_id uuid not null references public.listing_comparison_runs(id) on delete cascade,
  field text not null,
  canonical_value jsonb,
  observed_value jsonb,
  severity text not null check (severity in ('critical','high','medium','low','informational')),
  confidence text not null check (confidence in ('high','medium','low')),
  status text not null check (status in ('needs_confirmation','confirmed_issue','dismissed','action_required','corrected','verification_pending','closed')),
  owner_confirmation text,
  assigned_to uuid references auth.users(id),
  due_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (comparison_run_id, field)
);
create index listing_health_queue_idx on public.listing_health_findings(restaurant_id, status, severity, created_at desc);

create table public.listing_correction_attempts (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  finding_id uuid not null references public.listing_health_findings(id) on delete cascade,
  evidence text not null,
  performed_by uuid not null references auth.users(id),
  attempted_at timestamptz not null,
  verification_status text not null check (verification_status in ('pending','verified','failed')),
  verification_evidence text,
  verified_by uuid references auth.users(id),
  verified_at timestamptz
);

alter table public.business_fact_versions enable row level security;
alter table public.listing_source_observations enable row level security;
alter table public.listing_comparison_runs enable row level security;
alter table public.listing_health_findings enable row level security;
alter table public.listing_correction_attempts enable row level security;

-- These evidence tables are server-only. Authenticated application routes perform
-- restaurant-role checks before using the service-role client.
