-- Phase 5.23 - Need conversion and generic event tracking

alter table public.needs add column if not exists alert_requested boolean not null default false;
alter table public.needs add column if not exists alert_requested_at timestamptz;
alter table public.needs add column if not exists saved_to_account_at timestamptz;
alter table public.needs add column if not exists account_attached_at timestamptz;

create table if not exists public.site_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete set null,
  session_id text,
  event_type text not null,
  entity_type text,
  entity_id uuid,
  path text,
  referrer text,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists idx_site_events_type_created on public.site_events(event_type, created_at desc);
create index if not exists idx_site_events_user_created on public.site_events(user_id, created_at desc);
create index if not exists idx_site_events_session_created on public.site_events(session_id, created_at desc);
create index if not exists idx_needs_alert_requested on public.needs(alert_requested, created_at desc);

alter table public.site_events enable row level security;

grant insert on public.site_events to anon, authenticated;
grant select on public.site_events to authenticated;
grant select, insert, update, delete on public.site_events to service_role;

drop policy if exists "anyone can track safe site events" on public.site_events;
create policy "anyone can track safe site events" on public.site_events
  for insert to anon, authenticated
  with check (user_id is null or user_id = (select auth.uid()) or public.is_admin_user());

drop policy if exists "users read own site events and admins all" on public.site_events;
create policy "users read own site events and admins all" on public.site_events
  for select to authenticated
  using (user_id = (select auth.uid()) or public.is_admin_user());

drop policy if exists "admins manage site events" on public.site_events;
create policy "admins manage site events" on public.site_events
  for all to authenticated
  using (public.is_admin_user())
  with check (public.is_admin_user());
