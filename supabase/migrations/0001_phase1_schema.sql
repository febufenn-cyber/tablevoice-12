-- Tablevoice Phase 1: manual review copilot
-- Apply through the Supabase CLI or SQL editor in a new project.

create extension if not exists pgcrypto;

create or replace function public.is_platform_operator()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((auth.jwt() -> 'app_metadata' ->> 'platform_role') in ('operator', 'admin'), false);
$$;

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 120),
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now()
);

create table public.organization_memberships (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('buyer', 'approver', 'operator', 'action_owner', 'viewer')),
  status text not null default 'active' check (status in ('active', 'revoked')),
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create or replace function public.add_organization_creator_membership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.organization_memberships (organization_id, user_id, role)
  values (new.id, new.created_by, 'buyer')
  on conflict do nothing;
  return new;
end;
$$;

create trigger organizations_add_creator
  after insert on public.organizations
  for each row execute function public.add_organization_creator_membership();

create or replace function public.can_access_organization(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_platform_operator() or exists (
    select 1 from public.organization_memberships membership
    where membership.organization_id = target_organization_id
      and membership.user_id = auth.uid()
      and membership.status = 'active'
  );
$$;

create or replace function public.can_manage_organization(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_platform_operator() or exists (
    select 1 from public.organization_memberships membership
    where membership.organization_id = target_organization_id
      and membership.user_id = auth.uid()
      and membership.status = 'active'
      and membership.role in ('buyer', 'approver')
  );
$$;

create table public.restaurants (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  brand_name text not null check (char_length(brand_name) between 2 and 120),
  legal_name text,
  cuisine text,
  positioning text,
  default_language text not null default 'English',
  timezone text not null default 'Asia/Kolkata',
  status text not null default 'active' check (status in ('active', 'paused', 'deleting')),
  created_at timestamptz not null default now()
);
create index restaurants_organization_id_idx on public.restaurants(organization_id);

create table public.locations (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  name text not null,
  address text,
  phone text,
  website text,
  operating_hours jsonb not null default '{}'::jsonb,
  service_modes text[] not null default array[]::text[],
  status text not null default 'active' check (status in ('active', 'paused', 'closed')),
  created_at timestamptz not null default now()
);
create index locations_restaurant_id_idx on public.locations(restaurant_id);

create or replace function public.can_access_restaurant(target_restaurant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.restaurants restaurant
    where restaurant.id = target_restaurant_id
      and public.can_access_organization(restaurant.organization_id)
  );
$$;

create table public.voice_profiles (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  version integer not null check (version > 0),
  status text not null check (status in ('draft', 'active', 'archived')),
  default_language text not null,
  supported_languages text[] not null default array['English']::text[],
  formality smallint not null check (formality between 1 and 5),
  warmth smallint not null check (warmth between 1 and 5),
  brevity smallint not null check (brevity between 1 and 5),
  word_min integer not null check (word_min between 5 and 200),
  word_max integer not null check (word_max between 20 and 500 and word_max >= word_min),
  emoji_policy text not null check (emoji_policy in ('none', 'limited', 'allowed')),
  preferred_phrases text[] not null default array[]::text[],
  prohibited_phrases text[] not null default array[]::text[],
  contact_channel text,
  compensation_policy text not null check (compensation_policy in ('never', 'approval_required', 'rule_based')),
  employee_name_policy text not null check (employee_name_policy in ('never', 'approval_required')),
  approved_by uuid references auth.users(id),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  unique (restaurant_id, version)
);
create unique index voice_profiles_one_active_idx on public.voice_profiles(restaurant_id) where status = 'active';

create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  source text not null check (source in ('manual', 'csv', 'email', 'google', 'zomato')),
  source_reference text,
  rating smallint not null check (rating between 1 and 5),
  review_date date not null,
  reviewer_display_name text,
  original_language text,
  original_text text not null check (char_length(original_text) between 1 and 12000),
  original_text_hash text generated always as (encode(digest(lower(regexp_replace(trim(original_text), '\s+', ' ', 'g')), 'sha256'), 'hex')) stored,
  translated_text text,
  service_mode text not null check (service_mode in ('dine_in', 'delivery', 'takeaway', 'unknown')),
  ingestion_method text not null check (ingestion_method in ('manual', 'csv', 'email', 'screenshot')),
  verification_status text not null check (verification_status in ('unverified', 'verified')),
  state text not null check (state in ('received','needs_verification','verified','classifying','classified','needs_context','drafting','draft_ready','qa_required','awaiting_approval','approved','edited','rejected','skipped','publishing_manually','published','publication_unconfirmed','escalated','closed')),
  classification jsonb,
  duplicate_of uuid references public.reviews(id),
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index reviews_restaurant_state_idx on public.reviews(restaurant_id, state, created_at desc);
create index reviews_duplicate_lookup_idx on public.reviews(restaurant_id, review_date, rating, original_text_hash);
create index reviews_classification_gin_idx on public.reviews using gin(classification);

create table public.model_runs (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  review_id uuid not null references public.reviews(id) on delete cascade,
  task_type text not null check (task_type in ('classify_and_draft', 'validate', 'weekly_report')),
  provider text not null,
  model text not null,
  prompt_version text not null,
  input_hash text not null,
  output jsonb,
  schema_valid boolean not null,
  latency_ms integer not null check (latency_ms >= 0),
  estimated_cost numeric(12,6),
  status text not null check (status in ('succeeded', 'failed')),
  error text,
  created_at timestamptz not null default now(),
  unique (review_id, task_type, prompt_version, input_hash)
);

create table public.drafts (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.reviews(id) on delete cascade,
  version integer not null check (version > 0),
  strategy text not null,
  text text not null check (char_length(text) between 1 and 12000),
  final_text text,
  status text not null check (status in ('generated', 'qa_passed', 'qa_failed', 'approved', 'rejected')),
  defects jsonb not null default '[]'::jsonb,
  model_run_id uuid references public.model_runs(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (review_id, version)
);
create index drafts_review_id_idx on public.drafts(review_id, version desc);

create table public.approvals (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.reviews(id) on delete cascade,
  draft_id uuid not null references public.drafts(id) on delete cascade,
  decision text not null check (decision in ('approved_unchanged','approved_minor_edit','approved_major_edit','rejected','skipped','escalated')),
  approved_text text,
  edit_reason text,
  decided_by uuid not null default auth.uid() references auth.users(id),
  decided_at timestamptz not null default now(),
  channel text not null check (channel in ('web', 'whatsapp_link', 'email_link', 'operator'))
);
create index approvals_review_id_idx on public.approvals(review_id, decided_at desc);

create table public.internal_actions (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  review_id uuid references public.reviews(id) on delete cascade,
  action_type text not null,
  description text not null,
  suggested_owner_role text not null check (suggested_owner_role in ('buyer', 'approver', 'operator', 'action_owner', 'viewer')),
  assigned_to uuid references auth.users(id),
  priority text not null check (priority in ('low', 'medium', 'high', 'immediate')),
  due_at timestamptz,
  status text not null check (status in ('open', 'in_progress', 'completed', 'dismissed')),
  completion_evidence text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create index internal_actions_restaurant_status_idx on public.internal_actions(restaurant_id, status, due_at);

create table public.listing_findings (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  field text not null,
  source_a text not null,
  source_a_value text not null,
  source_b text not null,
  source_b_value text not null,
  severity text not null check (severity in ('critical', 'high', 'medium', 'low', 'informational')),
  confidence text not null check (confidence in ('high', 'medium', 'low')),
  status text not null check (status in ('observed','needs_confirmation','confirmed_issue','dismissed','action_required','corrected','verification_pending','closed')),
  owner_confirmation text,
  recommended_action text not null,
  assigned_to uuid references auth.users(id),
  due_at timestamptz,
  resolved_at timestamptz,
  evidence text,
  created_at timestamptz not null default now()
);
create index listing_findings_restaurant_status_idx on public.listing_findings(restaurant_id, status);

create table public.weekly_reports (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  period_start date not null,
  period_end date not null check (period_end >= period_start),
  status text not null check (status in ('draft', 'approved', 'delivered')),
  summary jsonb not null,
  created_at timestamptz not null default now(),
  approved_at timestamptz,
  delivered_at timestamptz,
  unique (restaurant_id, period_start, period_end)
);

create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references auth.users(id),
  action text not null,
  resource_type text not null,
  resource_id uuid not null,
  restaurant_id uuid references public.restaurants(id) on delete cascade,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index audit_events_restaurant_created_idx on public.audit_events(restaurant_id, created_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
create trigger reviews_set_updated_at before update on public.reviews for each row execute function public.set_updated_at();
create trigger drafts_set_updated_at before update on public.drafts for each row execute function public.set_updated_at();

