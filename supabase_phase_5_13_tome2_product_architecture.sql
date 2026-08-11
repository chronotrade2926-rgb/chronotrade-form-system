-- ChronoTrade Phase 5.13 - Tome 2 product architecture
-- Adds the ecosystem/product-state layer without breaking existing published/draft/archived flows.

alter table public.products
  add column if not exists lifecycle_status text not null default 'available',
  add column if not exists pricing_model text not null default 'one_time',
  add column if not exists provider_type text not null default 'chronotrade',
  add column if not exists cta_mode text not null default 'auto',
  add column if not exists availability text not null default 'available';

alter table public.products drop constraint if exists products_lifecycle_status_check;
alter table public.products
  add constraint products_lifecycle_status_check
  check (lifecycle_status in (
    'draft',
    'available',
    'free',
    'private_beta',
    'public_beta',
    'waitlist',
    'coming_soon',
    'unavailable',
    'archived',
    'chronolab'
  ));

alter table public.products drop constraint if exists products_pricing_model_check;
alter table public.products
  add constraint products_pricing_model_check
  check (pricing_model in (
    'free',
    'one_time',
    'subscription',
    'quote',
    'from_price',
    'pack',
    'credits',
    'team',
    'marketplace_commission'
  ));

alter table public.products drop constraint if exists products_provider_type_check;
alter table public.products
  add constraint products_provider_type_check
  check (provider_type in ('chronotrade', 'verified_partner', 'third_party'));

alter table public.products drop constraint if exists products_cta_mode_check;
alter table public.products
  add constraint products_cta_mode_check
  check (cta_mode in (
    'auto',
    'buy',
    'get',
    'try',
    'join_beta',
    'request_access',
    'notify',
    'follow',
    'quote',
    'none'
  ));

alter table public.products drop constraint if exists products_availability_check;
alter table public.products
  add constraint products_availability_check
  check (availability in ('available', 'coming_soon', 'unavailable', 'waitlist', 'beta', 'archived'));

update public.products
set
  lifecycle_status = case
    when status = 'archived' then 'archived'
    when status = 'draft' then 'draft'
    when coalesce(availability, 'available') = 'coming_soon' then 'coming_soon'
    when coalesce(availability, 'available') = 'unavailable' then 'unavailable'
    when pricing_model = 'free' or product_type = 'freebie' then 'free'
    else coalesce(nullif(lifecycle_status, ''), 'available')
  end,
  provider_type = coalesce(nullif(provider_type, ''), 'chronotrade'),
  cta_mode = coalesce(nullif(cta_mode, ''), 'auto'),
  availability = case
    when lifecycle_status in ('waitlist') then 'waitlist'
    when lifecycle_status in ('private_beta', 'public_beta') then 'beta'
    when lifecycle_status = 'coming_soon' then 'coming_soon'
    when lifecycle_status in ('archived', 'unavailable') then 'unavailable'
    else coalesce(nullif(availability, ''), 'available')
  end;

create index if not exists products_lifecycle_status_idx on public.products(lifecycle_status);
create index if not exists products_pricing_model_idx on public.products(pricing_model);
create index if not exists products_provider_type_idx on public.products(provider_type);

comment on column public.products.lifecycle_status is 'Tome 2 product state: available, beta, waitlist, coming_soon, chronolab, archived, etc. Existing status remains for publication workflow.';
comment on column public.products.pricing_model is 'Commercial model: free, one_time, subscription, quote, from_price, pack, credits, team, marketplace_commission.';
comment on column public.products.provider_type is 'Future marketplace preparation: chronotrade, verified_partner, third_party. Not exposed as a marketplace promise yet.';
comment on column public.products.cta_mode is 'CTA behavior override. auto derives the public CTA from lifecycle_status, price, checkout_url and form_url.';
