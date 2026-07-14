-- Tablevoice Phase 4: controlled restaurant voice system

alter table public.drafts
  add column if not exists voice_profile_id uuid references public.voice_profiles(id),
  add column if not exists voice_profile_version integer;

create or replace function public.set_draft_voice_provenance()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  active_profile public.voice_profiles%rowtype;
begin
  if new.voice_profile_id is not null then return new; end if;
  select profile.* into active_profile
  from public.reviews review
  join public.voice_profiles profile on profile.restaurant_id = review.restaurant_id and profile.status = 'active'
  where review.id = new.review_id
  order by profile.version desc
  limit 1;
  if active_profile.id is not null then
    new.voice_profile_id := active_profile.id;
    new.voice_profile_version := active_profile.version;
  end if;
  return new;
end;
$$;

drop trigger if exists drafts_set_voice_provenance on public.drafts;
create trigger drafts_set_voice_provenance
  before insert on public.drafts
  for each row execute function public.set_draft_voice_provenance();

create table public.voice_rules (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  voice_profile_id uuid not null references public.voice_profiles(id) on delete cascade,
  kind text not null,
  value text not null check (char_length(value) between 1 and 1000),
  category text,
  language text,
  priority integer not null default 50 check (priority between 0 and 100),
  created_at timestamptz not null default now()
);
create index voice_rules_profile_idx on public.voice_rules(voice_profile_id, priority desc);

create table public.voice_examples (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  voice_profile_id uuid references public.voice_profiles(id) on delete set null,
  disposition text not null check (disposition in ('approved','rejected')),
  review_text text not null,
  reply_text text not null,
  reason text,
  language text not null,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  expires_at timestamptz
);
create index voice_examples_restaurant_idx on public.voice_examples(restaurant_id, created_at desc);

create table public.voice_rule_candidates (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  source_review_id uuid references public.reviews(id) on delete set null,
  source_draft_id uuid references public.drafts(id) on delete set null,
  kind text not null,
  proposed_value text not null,
  scope text not null check (scope in ('restaurant','category','language','one_off')),
  category text,
  language text,
  reason text not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  decided_by uuid references auth.users(id),
  decided_at timestamptz,
  created_at timestamptz not null default now()
);
create index voice_rule_candidates_queue_idx on public.voice_rule_candidates(restaurant_id, status, created_at desc);

create table public.voice_profile_approvals (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  voice_profile_id uuid not null references public.voice_profiles(id) on delete cascade,
  action text not null check (action in ('activated','rolled_back','superseded')),
  approved_by uuid not null references auth.users(id),
  evidence text not null,
  previous_voice_profile_id uuid references public.voice_profiles(id),
  created_at timestamptz not null default now()
);

create table public.voice_evaluations (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  voice_profile_id uuid not null references public.voice_profiles(id) on delete cascade,
  metrics jsonb not null,
  corpus_version text not null,
  created_at timestamptz not null default now()
);

alter table public.voice_rules enable row level security;
alter table public.voice_examples enable row level security;
alter table public.voice_rule_candidates enable row level security;
alter table public.voice_profile_approvals enable row level security;
alter table public.voice_evaluations enable row level security;

-- No client policies are added. Phase 4 tables are accessed through authenticated
-- application routes after restaurant-role checks, using the server service role.
