-- Phase 5.22 - Resolve completion, consent and privacy requests

alter table public.needs add column if not exists email text;
alter table public.needs add column if not exists contact_permission text not null default 'service_only'
  check (contact_permission in ('none','service_only','solution_updates','marketing'));
alter table public.needs add column if not exists user_response_status text not null default 'not_sent'
  check (user_response_status in ('not_sent','prepared','sent','failed','not_applicable'));
alter table public.needs add column if not exists user_response_sent_at timestamptz;

create table if not exists public.need_clarifications (
  id uuid primary key default gen_random_uuid(),
  need_id uuid not null references public.needs(id) on delete cascade,
  user_id uuid references public.users(id) on delete set null,
  session_id text,
  question text not null,
  answer text not null,
  source text not null default 'user',
  created_at timestamptz not null default now()
);

create table if not exists public.privacy_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete set null,
  email text,
  request_type text not null check (request_type in ('access','export','rectification','delete_need','delete_account','marketing_opt_out','other')),
  target_type text,
  target_id uuid,
  status text not null default 'new' check (status in ('new','in_review','completed','rejected')),
  message text,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_need_clarifications_need on public.need_clarifications(need_id, created_at desc);
create index if not exists idx_privacy_requests_status on public.privacy_requests(status, created_at desc);
create index if not exists idx_needs_contact_permission on public.needs(contact_permission);

alter table public.need_clarifications enable row level security;
alter table public.privacy_requests enable row level security;

drop policy if exists "users manage own need clarifications" on public.need_clarifications;
create policy "users manage own need clarifications" on public.need_clarifications
  for all to authenticated
  using (user_id = (select auth.uid()) or public.is_admin_user())
  with check (user_id = (select auth.uid()) or public.is_admin_user());

drop policy if exists "anon insert need clarifications" on public.need_clarifications;
create policy "anon insert need clarifications" on public.need_clarifications
  for insert to anon
  with check (user_id is null);

drop policy if exists "users create privacy requests" on public.privacy_requests;
create policy "users create privacy requests" on public.privacy_requests
  for insert to anon, authenticated
  with check (user_id is null or user_id = (select auth.uid()) or public.is_admin_user());

drop policy if exists "users read own privacy requests" on public.privacy_requests;
create policy "users read own privacy requests" on public.privacy_requests
  for select to authenticated
  using (user_id = (select auth.uid()) or public.is_admin_user());

drop policy if exists "admin manage privacy requests" on public.privacy_requests;
create policy "admin manage privacy requests" on public.privacy_requests
  for all to authenticated
  using (public.is_admin_user())
  with check (public.is_admin_user());

grant select, insert, update, delete on public.need_clarifications to authenticated;
grant insert on public.need_clarifications to anon;
grant select, insert, update, delete on public.privacy_requests to authenticated;
grant insert on public.privacy_requests to anon;
