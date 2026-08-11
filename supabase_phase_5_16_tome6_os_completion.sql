-- ChronoTrade Phase 5.16 - Tome 6 OS completion
-- Account follows, measured/estimated impact, product updates and cosmetic rewards.

create table if not exists public.user_follows (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  target_type text not null,
  target_id uuid,
  target_key text,
  label text,
  target_url text,
  status text not null default 'active' check (status in ('active', 'paused', 'notified', 'archived')),
  metadata jsonb not null default '{}'::jsonb,
  notified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, target_type, target_key)
);

create table if not exists public.user_impact_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  source_type text not null default 'system',
  source_id uuid,
  metric_type text not null,
  measurement_kind text not null check (measurement_kind in ('measured', 'estimated')),
  value numeric not null default 0,
  unit text not null default 'count',
  label text,
  calculation_note text,
  occurred_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.product_update_events (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  version text not null,
  title text not null,
  summary text,
  status text not null default 'published' check (status in ('draft', 'published', 'archived')),
  published_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.user_cosmetics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  cosmetic_type text not null check (cosmetic_type in ('banner', 'avatar_frame', 'theme', 'effect')),
  code text not null,
  cosmetic_key text not null,
  label text not null,
  status text not null default 'unlocked' check (status in ('unlocked', 'equipped', 'archived')),
  equipped boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  unlocked_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, cosmetic_key),
  unique (user_id, cosmetic_type, code)
);

alter table public.user_preferences add column if not exists preferred_hourly_rate numeric;
alter table public.user_preferences add column if not exists dashboard_layout jsonb not null default '{}'::jsonb;

alter table public.user_follows enable row level security;
alter table public.user_impact_events enable row level security;
alter table public.product_update_events enable row level security;
alter table public.user_cosmetics enable row level security;

grant select, insert, update, delete on public.user_follows to authenticated;
grant select, insert, update, delete on public.user_impact_events to authenticated;
grant select on public.product_update_events to anon, authenticated;
grant select, insert, update, delete on public.product_update_events to authenticated;
grant select, insert, update, delete on public.user_cosmetics to authenticated;

drop policy if exists "Users manage own follows" on public.user_follows;
create policy "Users manage own follows" on public.user_follows for all to authenticated
using ((select auth.uid()) = user_id or public.is_admin_user())
with check ((select auth.uid()) = user_id or public.is_admin_user());

drop policy if exists "Users read own impact" on public.user_impact_events;
create policy "Users read own impact" on public.user_impact_events for select to authenticated
using ((select auth.uid()) = user_id or public.is_admin_user());

drop policy if exists "Admins manage impact" on public.user_impact_events;
create policy "Admins manage impact" on public.user_impact_events for all to authenticated
using (public.is_admin_user())
with check (public.is_admin_user());

drop policy if exists "Public reads published product updates" on public.product_update_events;
create policy "Public reads published product updates" on public.product_update_events for select to anon, authenticated
using (status = 'published' or public.is_admin_user());

drop policy if exists "Admins manage product updates" on public.product_update_events;
create policy "Admins manage product updates" on public.product_update_events for all to authenticated
using (public.is_admin_user())
with check (public.is_admin_user());

drop policy if exists "Users manage own cosmetics" on public.user_cosmetics;
create policy "Users manage own cosmetics" on public.user_cosmetics for all to authenticated
using ((select auth.uid()) = user_id or public.is_admin_user())
with check ((select auth.uid()) = user_id or public.is_admin_user());

create index if not exists user_follows_user_status_idx on public.user_follows(user_id, status, created_at desc);
create index if not exists user_impact_events_user_kind_idx on public.user_impact_events(user_id, measurement_kind, occurred_at desc);
create index if not exists product_update_events_product_status_idx on public.product_update_events(product_id, status, published_at desc);
create index if not exists user_cosmetics_user_type_idx on public.user_cosmetics(user_id, cosmetic_type, status);
