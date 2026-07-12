-- Tablevoice Phase 1 RLS policies
-- Apply after 0001_phase1_schema.sql.
alter table public.organizations enable row level security;
alter table public.organization_memberships enable row level security;
alter table public.restaurants enable row level security;
alter table public.locations enable row level security;
alter table public.voice_profiles enable row level security;
alter table public.reviews enable row level security;
alter table public.model_runs enable row level security;
alter table public.drafts enable row level security;
alter table public.approvals enable row level security;
alter table public.internal_actions enable row level security;
alter table public.listing_findings enable row level security;
alter table public.weekly_reports enable row level security;
alter table public.audit_events enable row level security;

create policy organizations_insert on public.organizations for insert to authenticated with check (created_by = auth.uid());
create policy organizations_select on public.organizations for select to authenticated using (public.can_access_organization(id));
create policy organizations_update on public.organizations for update to authenticated using (public.can_manage_organization(id)) with check (public.can_manage_organization(id));

create policy memberships_select on public.organization_memberships for select to authenticated using (public.can_access_organization(organization_id));
create policy memberships_insert on public.organization_memberships for insert to authenticated
  with check (public.can_manage_organization(organization_id));
create policy memberships_update on public.organization_memberships for update to authenticated
  using (public.can_manage_organization(organization_id))
  with check (public.can_manage_organization(organization_id));
create policy memberships_delete on public.organization_memberships for delete to authenticated
  using (public.can_manage_organization(organization_id));

create policy restaurants_access on public.restaurants for all to authenticated
  using (public.can_access_organization(organization_id))
  with check (public.can_access_organization(organization_id));

create policy locations_access on public.locations for all to authenticated
  using (public.can_access_restaurant(restaurant_id))
  with check (public.can_access_restaurant(restaurant_id));

create policy voice_profiles_access on public.voice_profiles for all to authenticated
  using (public.can_access_restaurant(restaurant_id))
  with check (public.can_access_restaurant(restaurant_id));

create policy reviews_access on public.reviews for all to authenticated
  using (public.can_access_restaurant(restaurant_id))
  with check (public.can_access_restaurant(restaurant_id));

create policy model_runs_access on public.model_runs for all to authenticated
  using (public.can_access_restaurant(restaurant_id))
  with check (public.can_access_restaurant(restaurant_id));

create policy drafts_access on public.drafts for all to authenticated
  using (exists (select 1 from public.reviews r where r.id = review_id and public.can_access_restaurant(r.restaurant_id)))
  with check (exists (select 1 from public.reviews r where r.id = review_id and public.can_access_restaurant(r.restaurant_id)));

create policy approvals_access on public.approvals for all to authenticated
  using (exists (select 1 from public.reviews r where r.id = review_id and public.can_access_restaurant(r.restaurant_id)))
  with check (exists (select 1 from public.reviews r where r.id = review_id and public.can_access_restaurant(r.restaurant_id)));

create policy actions_access on public.internal_actions for all to authenticated
  using (public.can_access_restaurant(restaurant_id))
  with check (public.can_access_restaurant(restaurant_id));

create policy findings_access on public.listing_findings for all to authenticated
  using (public.can_access_restaurant(restaurant_id))
  with check (public.can_access_restaurant(restaurant_id));

create policy reports_access on public.weekly_reports for all to authenticated
  using (public.can_access_restaurant(restaurant_id))
  with check (public.can_access_restaurant(restaurant_id));

create policy audit_select on public.audit_events for select to authenticated
  using (restaurant_id is null or public.can_access_restaurant(restaurant_id));
create policy audit_insert on public.audit_events for insert to authenticated
  with check (actor_id = auth.uid() and (restaurant_id is null or public.can_access_restaurant(restaurant_id)));

revoke all on public.model_runs from anon;
revoke all on public.audit_events from anon;
