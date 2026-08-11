-- Phase 5.15 - Tome 5 commerce, Stripe, promotions, emails.
-- Objectif: durcir le systeme commerce sans casser les tables deja en production.

alter table public.users add column if not exists stripe_customer_id text;

alter table public.orders_or_projects add column if not exists product_id uuid references public.products(id) on delete set null;
alter table public.orders_or_projects add column if not exists product_slug text;
alter table public.orders_or_projects add column if not exists product_version text not null default '1.0';
alter table public.orders_or_projects add column if not exists amount_cents integer;
alter table public.orders_or_projects add column if not exists discount_cents integer not null default 0;
alter table public.orders_or_projects add column if not exists stripe_price_id text;
alter table public.orders_or_projects add column if not exists promotion_id uuid references public.promotions(id) on delete set null;
alter table public.orders_or_projects add column if not exists paid_at timestamptz;
alter table public.orders_or_projects add column if not exists completed_at timestamptz;
alter table public.orders_or_projects add column if not exists refunded_at timestamptz;
alter table public.orders_or_projects add column if not exists canceled_at timestamptz;
alter table public.orders_or_projects add column if not exists stripe_customer_id text;

alter table public.orders_or_projects drop constraint if exists orders_or_projects_status_check;
alter table public.orders_or_projects
  add constraint orders_or_projects_status_check
  check (status in ('new','pending','processing','paid','failed','expired','refunded','canceled','cancelled','in_progress','delivered','completed','manual_review'));

alter table public.orders_or_projects drop constraint if exists orders_or_projects_delivery_status_check;
alter table public.orders_or_projects
  add constraint orders_or_projects_delivery_status_check
  check (delivery_status in ('pending','processing','in_progress','delivered','manual_review','completed','canceled','cancelled'));

alter table public.entitlements add column if not exists expires_at timestamptz;
alter table public.entitlements add column if not exists revoked_at timestamptz;
alter table public.entitlements drop constraint if exists entitlements_status_check;
alter table public.entitlements
  add constraint entitlements_status_check
  check (status in ('active','paused','expired','revoked','trial','pending'));

alter table public.promotions add column if not exists stacking_policy text not null default 'best_discount';
alter table public.promotions add column if not exists banner_enabled boolean not null default false;
alter table public.promotions add column if not exists banner_title_fr text;
alter table public.promotions add column if not exists banner_title_en text;
alter table public.promotions add column if not exists banner_cta_label_fr text;
alter table public.promotions add column if not exists banner_cta_label_en text;
alter table public.promotions add column if not exists banner_cta_url text;
alter table public.promotions add column if not exists banner_style text not null default 'gold';
alter table public.promotions add column if not exists new_badge_days integer not null default 21;
alter table public.promotions drop constraint if exists promotions_stacking_policy_check;
alter table public.promotions
  add constraint promotions_stacking_policy_check
  check (stacking_policy in ('best_discount','stackable','exclusive','disabled'));

create table if not exists public.stripe_events (
  id uuid primary key default gen_random_uuid(),
  stripe_event_id text unique not null,
  event_type text not null,
  livemode boolean not null default false,
  status text not null default 'processing' check (status in ('processing','processed','ignored','failed')),
  object_id text,
  payload jsonb not null default '{}'::jsonb,
  processed_at timestamptz,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.product_price_history (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references public.products(id) on delete set null,
  stripe_product_id text,
  stripe_price_id text,
  previous_stripe_price_id text,
  previous_amount_cents integer,
  amount_cents integer not null,
  currency text not null default 'EUR',
  pricing_model text,
  reason text,
  changed_by uuid references public.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.scheduled_emails (
  id uuid primary key default gen_random_uuid(),
  type text not null,
  user_id uuid references public.users(id) on delete cascade,
  order_id uuid references public.orders_or_projects(id) on delete set null,
  product_id uuid references public.products(id) on delete set null,
  recipient_email text not null,
  subject text not null,
  payload jsonb not null default '{}'::jsonb,
  scheduled_at timestamptz not null,
  sent_at timestamptz,
  status text not null default 'scheduled' check (status in ('scheduled','sent','cancelled','failed')),
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique(order_id, type)
);

alter table public.stripe_events enable row level security;
alter table public.product_price_history enable row level security;
alter table public.scheduled_emails enable row level security;

grant select, insert, update, delete on public.stripe_events, public.product_price_history, public.scheduled_emails to authenticated;

drop policy if exists "Admins manage stripe events" on public.stripe_events;
create policy "Admins manage stripe events" on public.stripe_events for all to authenticated
using (public.is_admin_user()) with check (public.is_admin_user());

drop policy if exists "Admins manage price history" on public.product_price_history;
create policy "Admins manage price history" on public.product_price_history for all to authenticated
using (public.is_admin_user()) with check (public.is_admin_user());

drop policy if exists "Admins manage scheduled emails" on public.scheduled_emails;
create policy "Admins manage scheduled emails" on public.scheduled_emails for all to authenticated
using (public.is_admin_user()) with check (public.is_admin_user());

create index if not exists idx_stripe_events_type_status on public.stripe_events(event_type, status);
create index if not exists idx_orders_stripe_payment_intent on public.orders_or_projects(stripe_payment_intent);
create index if not exists idx_orders_stripe_customer_id on public.orders_or_projects(stripe_customer_id);
create index if not exists idx_orders_product_status on public.orders_or_projects(product_id, status);
create index if not exists idx_entitlements_expires_at on public.entitlements(expires_at);
create index if not exists idx_product_price_history_product on public.product_price_history(product_id, created_at desc);
create index if not exists idx_scheduled_emails_due on public.scheduled_emails(status, scheduled_at);
