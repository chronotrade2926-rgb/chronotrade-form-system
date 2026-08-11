-- ChronoTrade Phase 5.8 - Account rewards and light gamification
-- Date: 2026-08-09
-- Purpose: store premium, non-manipulative account badges without exposing private data.

create table if not exists public.badge_catalog (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  label text not null,
  description text,
  icon text not null default 'ti-award',
  reward_type text not null default 'badge' check (reward_type in ('badge', 'banner', 'theme', 'avatar_frame')),
  status text not null default 'active' check (status in ('draft', 'active', 'archived')),
  sort_order integer not null default 100,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_badges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  badge_id uuid not null references public.badge_catalog(id) on delete cascade,
  source_type text,
  source_id text,
  awarded_at timestamptz not null default now(),
  equipped boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  unique (user_id, badge_id)
);

alter table public.badge_catalog enable row level security;
alter table public.user_badges enable row level security;

grant select on public.badge_catalog to anon, authenticated;
grant select, insert, update, delete on public.badge_catalog to authenticated;
grant select, insert, update, delete on public.user_badges to authenticated;

drop policy if exists "Public reads active badges" on public.badge_catalog;
create policy "Public reads active badges"
on public.badge_catalog
for select
to anon, authenticated
using (status = 'active' or public.is_admin_user());

drop policy if exists "Admins manage badge catalog" on public.badge_catalog;
create policy "Admins manage badge catalog"
on public.badge_catalog
for all
to authenticated
using (public.is_admin_user())
with check (public.is_admin_user());

drop policy if exists "Users read own badges" on public.user_badges;
create policy "Users read own badges"
on public.user_badges
for select
to authenticated
using ((select auth.uid()) = user_id or public.is_admin_user());

drop policy if exists "Users equip own badges" on public.user_badges;
create policy "Users equip own badges"
on public.user_badges
for update
to authenticated
using ((select auth.uid()) = user_id or public.is_admin_user())
with check ((select auth.uid()) = user_id or public.is_admin_user());

drop policy if exists "Admins award badges" on public.user_badges;
create policy "Admins award badges"
on public.user_badges
for insert
to authenticated
with check (public.is_admin_user());

drop policy if exists "Admins delete badges" on public.user_badges;
create policy "Admins delete badges"
on public.user_badges
for delete
to authenticated
using (public.is_admin_user());

create index if not exists badge_catalog_status_sort_idx on public.badge_catalog(status, sort_order);
create index if not exists user_badges_user_awarded_idx on public.user_badges(user_id, awarded_at desc);

insert into public.badge_catalog(code, label, description, icon, reward_type, status, sort_order, metadata)
values
  ('first_purchase', 'Premier achat', 'Debloque apres un premier paiement confirme par Stripe.', 'ti-stars', 'badge', 'active', 10, '{"tone":"gold"}'::jsonb),
  ('early_member_2026', 'Early Member 2026', 'Badge reserve aux premiers comptes ChronoTrade.', 'ti-sparkles', 'badge', 'active', 20, '{"tone":"violet"}'::jsonb),
  ('verified_partner', 'Partenaire valide', 'Badge attribue aux professionnels valides dans le reseau ChronoTrade.', 'ti-shield-check', 'badge', 'active', 30, '{"tone":"green"}'::jsonb)
on conflict (code) do update set
  label = excluded.label,
  description = excluded.description,
  icon = excluded.icon,
  reward_type = excluded.reward_type,
  status = excluded.status,
  sort_order = excluded.sort_order,
  metadata = public.badge_catalog.metadata || excluded.metadata,
  updated_at = now();
