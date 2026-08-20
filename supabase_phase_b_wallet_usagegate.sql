-- Phase B - Wallet, credits, usage ledger and UsageGate foundation.
-- Apply only after reviewing in Supabase. This file is additive and preserves existing data.
-- Scope: only wallet, ledger and usage gate tables.
-- Product plans and subscriptions are managed by the commerce/CMS migrations.
-- Do not seed subscription plans here: the live schema requires product-linked plans.

create table if not exists public.user_wallets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  balance_credits integer not null default 0,
  currency text not null default 'CREDIT',
  status text not null default 'active' check (status in ('active','locked','closed')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id)
);

create table if not exists public.wallet_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  entry_type text not null check (entry_type in ('welcome_bonus','credit_purchase','subscription_allowance','usage_reserve','usage_settle','usage_release','refund','admin_adjustment')),
  amount_credits integer not null,
  balance_after integer not null default 0,
  amount_cents integer,
  currency text not null default 'EUR',
  external_reference text not null unique,
  stripe_session_id text,
  stripe_invoice_id text,
  usage_event_id uuid,
  status text not null default 'posted' check (status in ('pending','posted','released','refunded','void')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.usage_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  need_id uuid,
  session_id text,
  operation text not null,
  provider text,
  model text,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  total_tokens integer not null default 0,
  estimated_cost_usd numeric(12,6),
  charged_credits integer not null default 0,
  status text not null default 'recorded' check (status in ('reserved','recorded','settled','failed','refunded')),
  stripe_reference text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.usage_reservations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  operation text not null,
  reserved_credits integer not null,
  status text not null default 'reserved' check (status in ('reserved','settled','released','expired','failed')),
  usage_event_id uuid references public.usage_events(id) on delete set null,
  external_reference text not null unique,
  expires_at timestamptz not null default (now() + interval '30 minutes'),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_wallets enable row level security;
alter table public.wallet_ledger enable row level security;
alter table public.usage_events enable row level security;
alter table public.usage_reservations enable row level security;

grant select on public.user_wallets, public.wallet_ledger, public.usage_events, public.usage_reservations to authenticated;
grant insert, update on public.user_wallets, public.wallet_ledger, public.usage_events, public.usage_reservations to authenticated;

drop policy if exists "Users read own wallet" on public.user_wallets;
create policy "Users read own wallet" on public.user_wallets for select to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Users read own ledger" on public.wallet_ledger;
create policy "Users read own ledger" on public.wallet_ledger for select to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Users read own usage events" on public.usage_events;
create policy "Users read own usage events" on public.usage_events for select to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Users read own reservations" on public.usage_reservations;
create policy "Users read own reservations" on public.usage_reservations for select to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Admins manage wallets" on public.user_wallets;
create policy "Admins manage wallets" on public.user_wallets for all to authenticated
using (public.is_admin_user()) with check (public.is_admin_user());

drop policy if exists "Admins manage wallet ledger" on public.wallet_ledger;
create policy "Admins manage wallet ledger" on public.wallet_ledger for all to authenticated
using (public.is_admin_user()) with check (public.is_admin_user());

drop policy if exists "Admins manage usage events" on public.usage_events;
create policy "Admins manage usage events" on public.usage_events for all to authenticated
using (public.is_admin_user()) with check (public.is_admin_user());

drop policy if exists "Admins manage reservations" on public.usage_reservations;
create policy "Admins manage reservations" on public.usage_reservations for all to authenticated
using (public.is_admin_user()) with check (public.is_admin_user());

create index if not exists idx_user_wallets_user on public.user_wallets(user_id);
create index if not exists idx_wallet_ledger_user_created on public.wallet_ledger(user_id, created_at desc);
create index if not exists idx_wallet_ledger_reference on public.wallet_ledger(external_reference);
create index if not exists idx_wallet_ledger_stripe_session on public.wallet_ledger(stripe_session_id);
create index if not exists idx_wallet_ledger_invoice on public.wallet_ledger(stripe_invoice_id);
create index if not exists idx_usage_events_user_created on public.usage_events(user_id, created_at desc);
create index if not exists idx_usage_events_operation on public.usage_events(operation, status);
create index if not exists idx_usage_reservations_user_status on public.usage_reservations(user_id, status, expires_at);
