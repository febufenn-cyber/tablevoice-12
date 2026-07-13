-- Tablevoice Phase 3: production inbox and approval workflow
-- Server-only workflow tables. The application API performs tenant and role checks.

create table public.review_work_items (
  review_id uuid primary key references public.reviews(id) on delete cascade,
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  state text not null check (state in ('received','needs_verification','verified','classifying','classified','needs_context','drafting','draft_ready','qa_required','awaiting_approval','approved','edited','rejected','skipped','publishing_manually','published','publication_unconfirmed','escalated','closed')),
  risk text not null check (risk in ('green','amber','red','unknown')),
  priority text not null check (priority in ('low','normal','high','urgent')),
  assignee_id uuid references auth.users(id) on delete set null,
  due_at timestamptz,
  preview text not null check (char_length(preview) <= 320),
  rating smallint not null check (rating between 1 and 5),
  source text not null check (source in ('manual','csv','email','google','zomato')),
  review_date date not null,
  reviewer_display_name text,
  next_action text not null,
  context_summary text check (context_summary is null or char_length(context_summary) <= 4000),
  workflow_version integer not null default 1 check (workflow_version > 0),
  last_activity_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index review_work_items_queue_idx on public.review_work_items(restaurant_id, updated_at desc, review_id desc);
create index review_work_items_sla_idx on public.review_work_items(restaurant_id, due_at) where due_at is not null;
create index review_work_items_assignee_idx on public.review_work_items(restaurant_id, assignee_id, updated_at desc);
create index review_work_items_priority_idx on public.review_work_items(restaurant_id, priority, state, updated_at desc);

create table public.approval_action_tokens (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  review_id uuid not null references public.reviews(id) on delete cascade,
  intended_actor_id uuid not null references auth.users(id) on delete cascade,
  token_hash text not null unique check (char_length(token_hash) = 64),
  allowed_decisions text[] not null check (cardinality(allowed_decisions) > 0),
  expires_at timestamptz not null,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  used_at timestamptz
);
create index approval_action_tokens_lookup_idx on public.approval_action_tokens(token_hash, expires_at) where used_at is null;
create index approval_action_tokens_review_idx on public.approval_action_tokens(review_id, created_at desc);

create table public.publication_attempts (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  review_id uuid not null references public.reviews(id) on delete cascade,
  channel text not null check (channel in ('manual','google')),
  status text not null check (status in ('in_progress','succeeded','unconfirmed','failed')),
  attempt_number integer not null check (attempt_number > 0),
  idempotency_key text not null check (char_length(idempotency_key) between 1 and 300),
  requested_by uuid not null references auth.users(id),
  external_reference text,
  error_code text,
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (review_id, channel, idempotency_key)
);
create index publication_attempts_review_idx on public.publication_attempts(review_id, created_at desc);
create index publication_attempts_status_idx on public.publication_attempts(restaurant_id, status, created_at desc);

alter table public.review_work_items enable row level security;
alter table public.approval_action_tokens enable row level security;
alter table public.publication_attempts enable row level security;

-- No client policies are created. These operational tables are accessed only through
-- the Worker with the Supabase service-role key after application-level authorization.
revoke all on public.review_work_items from anon, authenticated;
revoke all on public.approval_action_tokens from anon, authenticated;
revoke all on public.publication_attempts from anon, authenticated;
