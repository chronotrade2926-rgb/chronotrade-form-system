-- ChronoTrade Phase 5.3 - Account space, preferences, notifications, favorites
-- Date: 2026-08-08

create table if not exists public.orders_or_projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete set null,
  service_type text,
  title text,
  description text,
  status text not null default 'new',
  amount numeric,
  currency text not null default 'EUR',
  action_url text,
  stripe_session_id text unique,
  stripe_payment_intent text,
  invoice_url text,
  receipt_url text,
  delivery_status text not null default 'pending' check (delivery_status in ('pending', 'in_progress', 'delivered', 'cancelled')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.orders_or_projects add column if not exists stripe_payment_intent text;
alter table public.orders_or_projects add column if not exists invoice_url text;
alter table public.orders_or_projects add column if not exists receipt_url text;
alter table public.orders_or_projects add column if not exists delivery_status text not null default 'pending';
alter table public.orders_or_projects drop constraint if exists orders_or_projects_delivery_status_check;
alter table public.orders_or_projects
  add constraint orders_or_projects_delivery_status_check
  check (delivery_status in ('pending', 'in_progress', 'delivered', 'cancelled'));

create table if not exists public.entitlements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  resource_type text not null default 'product',
  status text not null default 'active' check (status in ('active', 'paused', 'expired', 'revoked')),
  access_url text,
  version text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.entitlements drop constraint if exists entitlements_user_resource_access_unique;
alter table public.entitlements
  add constraint entitlements_user_resource_access_unique
  unique (user_id, resource_type, access_url);

create table if not exists public.user_preferences (
  user_id uuid primary key references public.users(id) on delete cascade,
  appearance text not null default 'dark' check (appearance in ('dark', 'light', 'system')),
  language text not null default 'fr' check (language in ('fr', 'en')),
  accent text,
  reduced_motion boolean not null default false,
  dashboard_preferences jsonb not null default '{}'::jsonb,
  notification_preferences jsonb not null default '{}'::jsonb,
  avatar_url text,
  profile_banner_url text,
  public_profile_enabled boolean not null default false,
  updated_at timestamptz not null default now()
);

create table if not exists public.public_profiles (
  user_id uuid primary key references public.users(id) on delete cascade,
  display_name text,
  username text unique,
  bio text,
  activity text,
  skills jsonb not null default '[]'::jsonb,
  looking_for text,
  offering text,
  location_label text,
  avatar_url text,
  banner_url text,
  links jsonb not null default '{}'::jsonb,
  is_public boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.favorites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  target_type text not null,
  target_id uuid,
  target_key text,
  label text,
  target_url text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (user_id, target_type, target_key)
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  type text not null default 'system',
  title text not null,
  message text,
  action_url text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.ideas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete set null,
  title text not null,
  slug text unique,
  category text,
  summary text,
  description text,
  status text not null default 'submitted' check (status in ('submitted', 'published', 'in_review', 'prototype', 'testing', 'available', 'archived', 'rejected')),
  public_note text,
  vote_count integer not null default 0,
  featured boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.projects drop constraint if exists projects_universe_check;
alter table public.projects
  add constraint projects_universe_check
  check (universe in ('vision', 'launch', 'os', 'studio', 'motion', 'business', 'lab'));

alter table public.orders_or_projects enable row level security;
alter table public.entitlements enable row level security;
alter table public.user_preferences enable row level security;
alter table public.public_profiles enable row level security;
alter table public.favorites enable row level security;
alter table public.notifications enable row level security;
alter table public.ideas enable row level security;

grant select, insert, update, delete on public.user_preferences, public.public_profiles, public.favorites, public.notifications to authenticated;
grant select on public.entitlements, public.orders_or_projects to authenticated;
grant select, insert, update, delete on public.entitlements, public.orders_or_projects to authenticated;
grant select on public.public_profiles to anon;
grant select on public.ideas to anon, authenticated;
grant select, insert, update, delete on public.ideas to authenticated;

drop policy if exists "Users read own orders" on public.orders_or_projects;
create policy "Users read own orders" on public.orders_or_projects for select to authenticated
using ((select auth.uid()) = user_id or public.is_admin_user());

drop policy if exists "Admins manage orders" on public.orders_or_projects;
create policy "Admins manage orders" on public.orders_or_projects for all to authenticated
using (public.is_admin_user()) with check (public.is_admin_user());

drop policy if exists "Users read own entitlements" on public.entitlements;
create policy "Users read own entitlements" on public.entitlements for select to authenticated
using ((select auth.uid()) = user_id or public.is_admin_user());

drop policy if exists "Admins manage entitlements" on public.entitlements;
create policy "Admins manage entitlements" on public.entitlements for all to authenticated
using (public.is_admin_user()) with check (public.is_admin_user());

drop policy if exists "Users manage own preferences" on public.user_preferences;
create policy "Users manage own preferences" on public.user_preferences for all to authenticated
using ((select auth.uid()) = user_id or public.is_admin_user()) with check ((select auth.uid()) = user_id or public.is_super_admin_user());

drop policy if exists "Public reads visible public profiles" on public.public_profiles;
create policy "Public reads visible public profiles" on public.public_profiles for select to anon, authenticated
using (is_public = true or (select auth.uid()) = user_id or public.is_admin_user());

drop policy if exists "Users manage own public profile" on public.public_profiles;
create policy "Users manage own public profile" on public.public_profiles for all to authenticated
using ((select auth.uid()) = user_id or public.is_admin_user()) with check ((select auth.uid()) = user_id or public.is_admin_user());

drop policy if exists "Users manage own favorites" on public.favorites;
create policy "Users manage own favorites" on public.favorites for all to authenticated
using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "Admins read all favorites" on public.favorites;
create policy "Admins read all favorites" on public.favorites for select to authenticated
using (public.is_admin_user());

drop policy if exists "Users read own notifications" on public.notifications;
create policy "Users read own notifications" on public.notifications for select to authenticated
using ((select auth.uid()) = user_id or public.is_admin_user());

drop policy if exists "Users update own notifications" on public.notifications;
create policy "Users update own notifications" on public.notifications for update to authenticated
using ((select auth.uid()) = user_id or public.is_admin_user()) with check ((select auth.uid()) = user_id or public.is_admin_user());

drop policy if exists "Admins create notifications" on public.notifications;
create policy "Admins create notifications" on public.notifications for insert to authenticated
with check (public.is_admin_user());

drop policy if exists "Public reads published ideas" on public.ideas;
create policy "Public reads published ideas" on public.ideas for select to anon, authenticated
using (status in ('published', 'in_review', 'prototype', 'testing', 'available') or public.is_admin_user() or (select auth.uid()) = user_id);

drop policy if exists "Users submit own ideas" on public.ideas;
create policy "Users submit own ideas" on public.ideas for insert to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "Admins manage ideas" on public.ideas;
create policy "Admins manage ideas" on public.ideas for all to authenticated
using (public.is_admin_user()) with check (public.is_admin_user());

create index if not exists orders_or_projects_user_id_idx on public.orders_or_projects(user_id, created_at desc);
create index if not exists entitlements_user_id_idx on public.entitlements(user_id, created_at desc);
create index if not exists favorites_user_id_idx on public.favorites(user_id, created_at desc);
create index if not exists notifications_user_id_idx on public.notifications(user_id, created_at desc);
create index if not exists ideas_status_created_idx on public.ideas(status, created_at desc);
