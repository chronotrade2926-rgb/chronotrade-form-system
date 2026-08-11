-- Phase 5.10 - Packs et composants produits ChronoTrade.
-- Objectif: permettre a un pack d'attribuer plusieurs droits d'acces apres paiement.
-- Compatible avec une base deja en production: aucune suppression de donnees.

create table if not exists public.product_components (
  id uuid primary key default gen_random_uuid(),
  bundle_product_id uuid not null references public.products(id) on delete cascade,
  component_product_id uuid not null references public.products(id) on delete cascade,
  quantity integer not null default 1 check (quantity > 0),
  access_type text not null default 'included' check (access_type in ('included', 'trial', 'bonus', 'upgrade')),
  sort_order integer not null default 100,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (bundle_product_id, component_product_id, access_type)
);

alter table public.product_components enable row level security;

grant select on public.product_components to anon, authenticated;
grant select, insert, update, delete on public.product_components to authenticated;

drop policy if exists "Public reads active product components" on public.product_components;
create policy "Public reads active product components" on public.product_components for select to anon, authenticated
using (
  exists (
    select 1
    from public.products bundle
    where bundle.id = bundle_product_id
      and bundle.status = 'published'
  )
);

drop policy if exists "Admins manage product components" on public.product_components;
create policy "Admins manage product components" on public.product_components for all to authenticated
using (public.is_admin_user())
with check (public.is_admin_user());

create index if not exists idx_product_components_bundle on public.product_components(bundle_product_id, sort_order);
create index if not exists idx_product_components_component on public.product_components(component_product_id);
