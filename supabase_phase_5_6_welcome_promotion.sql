-- Phase 5.6 - Welcome promotion and guarded promotion usage.
-- Keeps promotions configurable from the super-admin while ensuring CHRONO10 exists.

alter table public.promotions add column if not exists max_redemptions integer;
alter table public.promotions add column if not exists per_user_limit integer not null default 1;
alter table public.promotions add column if not exists stackable boolean not null default false;
alter table public.promotions add column if not exists user_id uuid references public.users(id) on delete cascade;
alter table public.promotions add column if not exists stripe_coupon_id text;
alter table public.promotions add column if not exists stripe_promotion_code_id text;
alter table public.promotions add column if not exists metadata jsonb not null default '{}'::jsonb;

create table if not exists public.promotion_redemptions (
  id uuid primary key default gen_random_uuid(),
  promotion_id uuid not null references public.promotions(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  order_id uuid references public.orders_or_projects(id) on delete set null,
  user_id uuid references public.users(id) on delete set null,
  customer_email text,
  stripe_session_id text not null,
  discount_cents integer not null default 0,
  created_at timestamptz not null default now(),
  unique (promotion_id, stripe_session_id)
);

alter table public.promotion_redemptions enable row level security;

grant select, insert, update, delete on public.promotion_redemptions to authenticated;

drop policy if exists "Admins manage promotion redemptions" on public.promotion_redemptions;
create policy "Admins manage promotion redemptions"
on public.promotion_redemptions
for all
to authenticated
using (public.is_admin_user())
with check (public.is_admin_user());

create index if not exists idx_promotions_code_status on public.promotions(code, status);
create index if not exists idx_promotions_user_id on public.promotions(user_id);
create index if not exists idx_promotion_redemptions_promotion_user on public.promotion_redemptions(promotion_id, user_id);
create index if not exists idx_promotion_redemptions_session on public.promotion_redemptions(stripe_session_id);

insert into public.promotions (
  code,
  label,
  discount_type,
  discount_value,
  status,
  per_user_limit,
  stackable,
  metadata
)
values (
  'CHRONO10',
  'Offre de bienvenue ChronoTrade',
  'percent',
  10,
  'active',
  1,
  false,
  jsonb_build_object('welcome_offer', true, 'valid_hours_after_signup', 48, 'auto_apply', true)
)
on conflict (code) do update
set
  metadata = public.promotions.metadata || excluded.metadata,
  updated_at = now();
