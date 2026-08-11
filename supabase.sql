-- ChronoTrade Supabase platform schema
-- Deja applique sur le projet Supabase odkuwhunrnhbedbqazfn.
-- A garder comme reference de reproduction.

create extension if not exists "pgcrypto";

create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique not null,
  first_name text,
  last_name text,
  full_name text,
  role text not null default 'client' check (role in ('client', 'partner', 'admin', 'super_admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.admin_emails (
  email text primary key,
  created_at timestamptz not null default now()
);

insert into public.admin_emails(email)
values ('flo.chronotrade@outlook.fr')
on conflict (email) do nothing;

insert into public.admin_emails(email)
values ('bouchonnetflorent@gmail.com'), ('chronotrade2926@gmail.com')
on conflict (email) do nothing;

create table if not exists public.partners (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references public.users(id) on delete cascade,
  first_name text,
  last_name text,
  company_name text,
  email text not null,
  phone text,
  category text,
  expertise text,
  city text,
  website text,
  instagram text,
  linkedin text,
  description text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.business_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete set null,
  full_name text not null,
  email text not null,
  company text,
  need_type text,
  category_requested text,
  city text,
  budget text,
  urgency text,
  description text,
  status text not null default 'new' check (status in ('new', 'in_review', 'matched', 'closed', 'lost')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.partner_matches (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.business_requests(id) on delete cascade,
  partner_id uuid not null references public.partners(id) on delete cascade,
  status text not null default 'suggested' check (status in ('suggested', 'contact_requested', 'introduced', 'rejected')),
  internal_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (request_id, partner_id)
);

create table if not exists public.user_diagnostics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  input_text text,
  selected_options jsonb not null default '[]'::jsonb,
  recommended_services jsonb not null default '[]'::jsonb,
  primary_service text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists user_diagnostics_user_id_idx on public.user_diagnostics(user_id, created_at desc);

create table if not exists public.time_simulations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  activity_type text,
  weekly_requests text,
  message_time text,
  admin_time text,
  tool_count text,
  main_blocker text,
  main_goal text,
  lost_hours_month numeric,
  recoverable_hours_min numeric,
  recoverable_hours_max numeric,
  estimated_value_min numeric,
  estimated_value_max numeric,
  recommended_service text,
  created_at timestamptz not null default now()
);

create index if not exists time_simulations_user_id_idx on public.time_simulations(user_id, created_at desc);

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  slug text unique not null,
  client_name text,
  universe text not null check (universe in ('launch', 'os', 'studio', 'business', 'lab')),
  category text,
  short_description text,
  problem text,
  solution text,
  result text,
  images jsonb not null default '[]'::jsonb,
  external_url text,
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  featured boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Les triggers, fonctions et policies ont ete appliques via migrations Supabase :
-- chrono_platform_auth_partners_portfolio
-- harden_platform_security_policies
-- revoke_public_rpc_execution
-- set_owner_email_as_admin

alter table public.user_diagnostics enable row level security;

grant select, insert, update, delete on public.user_diagnostics to authenticated;

drop policy if exists "Users can read own diagnostics" on public.user_diagnostics;
create policy "Users can read own diagnostics"
on public.user_diagnostics
for select
to authenticated
using ((select auth.uid()) = user_id or exists (select 1 from public.users u where u.id = (select auth.uid()) and u.role in ('admin', 'super_admin')));

drop policy if exists "Users can insert own diagnostics" on public.user_diagnostics;
create policy "Users can insert own diagnostics"
on public.user_diagnostics
for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update own diagnostics" on public.user_diagnostics;
create policy "Users can update own diagnostics"
on public.user_diagnostics
for update
to authenticated
using ((select auth.uid()) = user_id or exists (select 1 from public.users u where u.id = (select auth.uid()) and u.role in ('admin', 'super_admin')))
with check ((select auth.uid()) = user_id or exists (select 1 from public.users u where u.id = (select auth.uid()) and u.role in ('admin', 'super_admin')));

drop policy if exists "Users can delete own diagnostics" on public.user_diagnostics;
create policy "Users can delete own diagnostics"
on public.user_diagnostics
for delete
to authenticated
using ((select auth.uid()) = user_id or exists (select 1 from public.users u where u.id = (select auth.uid()) and u.role in ('admin', 'super_admin')));

alter table public.time_simulations enable row level security;

grant select, insert, update, delete on public.time_simulations to authenticated;

drop policy if exists "Users can read own time simulations" on public.time_simulations;
create policy "Users can read own time simulations"
on public.time_simulations
for select
to authenticated
using ((select auth.uid()) = user_id or exists (select 1 from public.users u where u.id = (select auth.uid()) and u.role in ('admin', 'super_admin')));

drop policy if exists "Users can insert own time simulations" on public.time_simulations;
create policy "Users can insert own time simulations"
on public.time_simulations
for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update own time simulations" on public.time_simulations;
create policy "Users can update own time simulations"
on public.time_simulations
for update
to authenticated
using ((select auth.uid()) = user_id or exists (select 1 from public.users u where u.id = (select auth.uid()) and u.role in ('admin', 'super_admin')))
with check ((select auth.uid()) = user_id or exists (select 1 from public.users u where u.id = (select auth.uid()) and u.role in ('admin', 'super_admin')));

drop policy if exists "Users can delete own time simulations" on public.time_simulations;
create policy "Users can delete own time simulations"
on public.time_simulations
for delete
to authenticated
using ((select auth.uid()) = user_id or exists (select 1 from public.users u where u.id = (select auth.uid()) and u.role in ('admin', 'super_admin')));
