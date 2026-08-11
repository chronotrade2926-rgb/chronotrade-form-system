-- ChronoTrade Phase 5.2 - Security, super admin, CMS catalogue
-- Date: 2026-08-08

alter table public.users drop constraint if exists users_role_check;
alter table public.users
  add constraint users_role_check
  check (role in ('client', 'partner', 'admin', 'super_admin'));

insert into public.admin_emails(email)
values
  ('flo.chronotrade@outlook.fr'),
  ('bouchonnetflorent@gmail.com'),
  ('chronotrade2926@gmail.com')
on conflict (email) do nothing;

update public.users
set role = 'super_admin', updated_at = now()
where lower(email) in ('bouchonnetflorent@gmail.com', 'chronotrade2926@gmail.com');

create or replace function public.is_admin_user()
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select exists (
    select 1
    from public.users u
    where u.id = (select auth.uid())
      and u.role in ('admin', 'super_admin')
  );
$$;

create or replace function public.is_super_admin_user()
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select exists (
    select 1
    from public.users u
    where u.id = (select auth.uid())
      and u.role = 'super_admin'
  );
$$;

create table if not exists public.product_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  description text,
  accent text,
  sort_order integer not null default 100,
  status text not null default 'active' check (status in ('active', 'hidden')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  category_id uuid references public.product_categories(id) on delete set null,
  title text not null,
  slug text unique not null,
  short_description text,
  description text,
  product_type text not null default 'sur_mesure' check (product_type in ('direct', 'personalise', 'sur_mesure', 'resource')),
  delivery_type text not null default 'manual' check (delivery_type in ('manual', 'questionnaire', 'download', 'access')),
  price_cents integer,
  currency text not null default 'EUR',
  stripe_price_id text,
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  featured boolean not null default false,
  promo_badge text,
  cover_url text,
  video_url text,
  form_url text,
  checkout_url text,
  tags jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.product_media (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  media_type text not null check (media_type in ('image', 'video', 'file')),
  url text not null,
  alt text,
  sort_order integer not null default 100,
  created_at timestamptz not null default now()
);

create table if not exists public.promotions (
  id uuid primary key default gen_random_uuid(),
  code text unique,
  label text not null,
  discount_type text not null check (discount_type in ('percent', 'fixed')),
  discount_value numeric not null,
  starts_at timestamptz,
  ends_at timestamptz,
  status text not null default 'draft' check (status in ('draft', 'active', 'expired', 'archived')),
  product_id uuid references public.products(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.homepage_sections (
  id uuid primary key default gen_random_uuid(),
  section_key text unique not null,
  title text not null,
  subtitle text,
  content jsonb not null default '{}'::jsonb,
  status text not null default 'draft' check (status in ('draft', 'published', 'hidden')),
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.admin_activity_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.users(id) on delete set null,
  action text not null,
  entity_type text,
  entity_id uuid,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.product_categories enable row level security;
alter table public.products enable row level security;
alter table public.product_media enable row level security;
alter table public.promotions enable row level security;
alter table public.homepage_sections enable row level security;
alter table public.admin_activity_log enable row level security;

grant select on public.product_categories, public.products, public.product_media, public.homepage_sections to anon, authenticated;
grant select, insert, update, delete on public.product_categories, public.products, public.product_media, public.promotions, public.homepage_sections to authenticated;
grant select, insert on public.admin_activity_log to authenticated;

drop policy if exists "Public reads active categories" on public.product_categories;
create policy "Public reads active categories"
on public.product_categories
for select
to anon, authenticated
using (status = 'active' or public.is_admin_user());

drop policy if exists "Admins manage categories" on public.product_categories;
create policy "Admins manage categories"
on public.product_categories
for all
to authenticated
using (public.is_admin_user())
with check (public.is_admin_user());

drop policy if exists "Public reads published products" on public.products;
create policy "Public reads published products"
on public.products
for select
to anon, authenticated
using (status = 'published' or public.is_admin_user());

drop policy if exists "Admins manage products" on public.products;
create policy "Admins manage products"
on public.products
for all
to authenticated
using (public.is_admin_user())
with check (public.is_admin_user());

drop policy if exists "Public reads media for published products" on public.product_media;
create policy "Public reads media for published products"
on public.product_media
for select
to anon, authenticated
using (
  exists (
    select 1 from public.products p
    where p.id = product_id and (p.status = 'published' or public.is_admin_user())
  )
);

drop policy if exists "Admins manage product media" on public.product_media;
create policy "Admins manage product media"
on public.product_media
for all
to authenticated
using (public.is_admin_user())
with check (public.is_admin_user());

drop policy if exists "Admins manage promotions" on public.promotions;
create policy "Admins manage promotions"
on public.promotions
for all
to authenticated
using (public.is_admin_user())
with check (public.is_admin_user());

drop policy if exists "Public reads published home sections" on public.homepage_sections;
create policy "Public reads published home sections"
on public.homepage_sections
for select
to anon, authenticated
using (status = 'published' or public.is_admin_user());

drop policy if exists "Admins manage home sections" on public.homepage_sections;
create policy "Admins manage home sections"
on public.homepage_sections
for all
to authenticated
using (public.is_admin_user())
with check (public.is_admin_user());

drop policy if exists "Admins read activity log" on public.admin_activity_log;
create policy "Admins read activity log"
on public.admin_activity_log
for select
to authenticated
using (public.is_admin_user());

drop policy if exists "Admins write activity log" on public.admin_activity_log;
create policy "Admins write activity log"
on public.admin_activity_log
for insert
to authenticated
with check (public.is_admin_user());

drop policy if exists "Users can read own diagnostics" on public.user_diagnostics;
create policy "Users can read own diagnostics"
on public.user_diagnostics
for select
to authenticated
using ((select auth.uid()) = user_id or public.is_admin_user());

drop policy if exists "Users can update own diagnostics" on public.user_diagnostics;
create policy "Users can update own diagnostics"
on public.user_diagnostics
for update
to authenticated
using ((select auth.uid()) = user_id or public.is_admin_user())
with check ((select auth.uid()) = user_id or public.is_admin_user());

drop policy if exists "Users can delete own diagnostics" on public.user_diagnostics;
create policy "Users can delete own diagnostics"
on public.user_diagnostics
for delete
to authenticated
using ((select auth.uid()) = user_id or public.is_admin_user());

drop policy if exists "Users can read own time simulations" on public.time_simulations;
create policy "Users can read own time simulations"
on public.time_simulations
for select
to authenticated
using ((select auth.uid()) = user_id or public.is_admin_user());

drop policy if exists "Users can update own time simulations" on public.time_simulations;
create policy "Users can update own time simulations"
on public.time_simulations
for update
to authenticated
using ((select auth.uid()) = user_id or public.is_admin_user())
with check ((select auth.uid()) = user_id or public.is_admin_user());

drop policy if exists "Users can delete own time simulations" on public.time_simulations;
create policy "Users can delete own time simulations"
on public.time_simulations
for delete
to authenticated
using ((select auth.uid()) = user_id or public.is_admin_user());

insert into public.product_categories(name, slug, description, accent, sort_order)
values
  ('Audit', 'audit', 'Analyses rapides et plans d action.', '#c9a84c', 10),
  ('Motion', 'motion', 'Publicites courtes et animations.', '#ff5f8f', 20),
  ('Automatisation', 'automatisation', 'Systemes, IA et workflows.', '#8b5cf6', 30),
  ('Studio', 'studio', 'Sites, image et presence digitale.', '#7dd3fc', 40),
  ('Sur mesure', 'sur-mesure', 'Demandes qualifiees selon le besoin.', '#27e895', 50)
on conflict (slug) do update set
  name = excluded.name,
  description = excluded.description,
  accent = excluded.accent,
  sort_order = excluded.sort_order;

insert into public.products(title, slug, short_description, description, product_type, delivery_type, price_cents, currency, status, featured, promo_badge, form_url, checkout_url, tags)
values
  ('Analyse Express', 'analyse-express', 'Un audit court pour savoir par ou commencer.', 'Analyse de votre projet, idee ou presence digitale avec plan clair.', 'personalise', 'questionnaire', 2900, 'EUR', 'published', true, 'Commencez ici', '/analyse-express/', '/api/checkout/analyse-express/session', '["audit","strategie","29-eur"]'::jsonb),
  ('Pack Motion Starter', 'pack-motion-starter', 'Une creation courte pour rendre votre marque plus vivante.', 'Animation de logo, pub courte ou format reseaux sociaux selon le besoin.', 'sur_mesure', 'manual', 14900, 'EUR', 'published', true, 'A partir de', '/services/?type=motion#form', null, '["motion","video","social"]'::jsonb),
  ('Projet sur mesure', 'projet-sur-mesure', 'Un formulaire court pour qualifier votre besoin.', 'ChronoTrade oriente la demande vers la bonne solution et prepare un devis coherent.', 'sur_mesure', 'manual', null, 'EUR', 'published', true, 'Sur mesure', '/services/#form', null, '["sur-mesure","devis"]'::jsonb)
on conflict (slug) do update set
  title = excluded.title,
  short_description = excluded.short_description,
  description = excluded.description,
  product_type = excluded.product_type,
  delivery_type = excluded.delivery_type,
  price_cents = excluded.price_cents,
  currency = excluded.currency,
  status = excluded.status,
  featured = excluded.featured,
  promo_badge = excluded.promo_badge,
  form_url = excluded.form_url,
  checkout_url = excluded.checkout_url,
  tags = excluded.tags,
  updated_at = now();
