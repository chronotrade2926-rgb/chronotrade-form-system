-- Phase B - Billing model and solution architecture
-- Retrocompatible with existing pricing_model data. Do not drop pricing_model.

alter table public.products
  add column if not exists billing_model text,
  add column if not exists credit_cost integer not null default 0,
  add column if not exists compatible_subscription_codes text[] not null default '{}'::text[],
  add column if not exists problem_solved text,
  add column if not exists solution_keywords text[] not null default '{}'::text[],
  add column if not exists target_profile text,
  add column if not exists solution_instructions text,
  add column if not exists access_rights jsonb not null default '{}'::jsonb;

alter table public.product_plans
  add column if not exists billing_model text,
  add column if not exists credit_cost integer not null default 0,
  add column if not exists access_rights jsonb not null default '{}'::jsonb;

alter table public.solutions
  add column if not exists billing_model text,
  add column if not exists credit_cost integer not null default 0,
  add column if not exists compatible_subscription_codes text[] not null default '{}'::text[],
  add column if not exists target_profile text,
  add column if not exists solution_instructions text,
  add column if not exists access_rights jsonb not null default '{}'::jsonb;

alter table public.orders_or_projects
  add column if not exists billing_model text,
  add column if not exists billing_snapshot jsonb not null default '{}'::jsonb;

update public.products
set billing_model = case lower(coalesce(billing_model, pricing_model, 'one_time'))
  when 'free' then 'FREE'
  when 'subscription' then 'SUBSCRIPTION'
  when 'credits' then 'CREDITS'
  when 'pack' then 'HYBRID'
  when 'team' then 'HYBRID'
  when 'marketplace_commission' then 'HYBRID'
  else 'ONE_TIME'
end
where billing_model is null or billing_model = '';

update public.product_plans
set billing_model = case lower(coalesce(billing_model, pricing_model, 'one_time'))
  when 'free' then 'FREE'
  when 'subscription' then 'SUBSCRIPTION'
  when 'credits' then 'CREDITS'
  when 'pack' then 'HYBRID'
  when 'team' then 'HYBRID'
  else 'ONE_TIME'
end
where billing_model is null or billing_model = '';

update public.solutions
set billing_model = case lower(coalesce(billing_model, price_model, 'one_time'))
  when 'free' then 'FREE'
  when 'subscription' then 'SUBSCRIPTION'
  when 'credits' then 'CREDITS'
  when 'pack' then 'HYBRID'
  when 'team' then 'HYBRID'
  else 'ONE_TIME'
end
where billing_model is null or billing_model = '';

alter table public.products drop constraint if exists products_billing_model_check;
alter table public.products
  add constraint products_billing_model_check
  check (billing_model in ('FREE','ONE_TIME','CREDITS','SUBSCRIPTION','HYBRID'));

alter table public.product_plans drop constraint if exists product_plans_billing_model_check;
alter table public.product_plans
  add constraint product_plans_billing_model_check
  check (billing_model in ('FREE','ONE_TIME','CREDITS','SUBSCRIPTION','HYBRID'));

alter table public.solutions drop constraint if exists solutions_billing_model_check;
alter table public.solutions
  add constraint solutions_billing_model_check
  check (billing_model in ('FREE','ONE_TIME','CREDITS','SUBSCRIPTION','HYBRID'));

alter table public.orders_or_projects drop constraint if exists orders_or_projects_billing_model_check;
alter table public.orders_or_projects
  add constraint orders_or_projects_billing_model_check
  check (billing_model is null or billing_model in ('FREE','ONE_TIME','CREDITS','SUBSCRIPTION','HYBRID'));

create index if not exists idx_products_billing_model on public.products(billing_model);
create index if not exists idx_products_solution_keywords on public.products using gin(solution_keywords);
create index if not exists idx_solutions_billing_model on public.solutions(billing_model);
create index if not exists idx_solutions_subscription_codes on public.solutions using gin(compatible_subscription_codes);

comment on column public.products.billing_model is 'Canonical ChronoTrade billing model: FREE, ONE_TIME, CREDITS, SUBSCRIPTION, HYBRID. pricing_model is kept for legacy compatibility.';
comment on column public.products.credit_cost is 'Credit cost for credit-based or hybrid usage. Debit must remain server-side.';
comment on column public.products.problem_solved is 'Human-readable problem this solution is meant to solve. Used by matching and admin review.';
comment on column public.products.solution_keywords is 'Admin-defined keywords used as matching signals, not as the only matching criterion.';
comment on column public.products.access_rights is 'Structured access rules/snapshots for delivery, subscriptions, credits or hybrid rights.';
