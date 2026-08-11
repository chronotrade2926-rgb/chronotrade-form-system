-- Phase 5.20 - Resolve partner economy, opportunities and attribution
-- Completes the "need -> solution -> partner/product -> feedback" loop.

create table if not exists public.detected_opportunities (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  category text,
  need_count integer not null default 0,
  unresolved_count integer not null default 0,
  same_need_count integer not null default 0,
  comment_count integer not null default 0,
  opportunity_score numeric default 0,
  suggested_action text,
  status text not null default 'detected' check (status in ('detected','reviewing','chronolab','product_planned','partner_search','resolved','archived')),
  source_need_ids uuid[] not null default '{}',
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.partner_offers (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partners(id) on delete cascade,
  solution_id uuid references public.solutions(id) on delete set null,
  title text not null,
  description text,
  category text,
  pricing_model text not null default 'quote' check (pricing_model in ('quote','fixed','from_price','subscription','commission')),
  price_from numeric,
  currency text not null default 'EUR',
  commission_type text default 'none' check (commission_type in ('none','percent','fixed','hybrid')),
  commission_value numeric,
  service_area text,
  availability text not null default 'available' check (availability in ('available','limited','waitlist','paused','unavailable')),
  active boolean not null default false,
  trust_score numeric not null default 0,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.partner_leads (
  id uuid primary key default gen_random_uuid(),
  need_id uuid references public.needs(id) on delete set null,
  partner_id uuid not null references public.partners(id) on delete cascade,
  user_id uuid references public.users(id) on delete set null,
  offer_id uuid references public.partner_offers(id) on delete set null,
  status text not null default 'NEW' check (status in ('NEW','SENT','ACCEPTED','DECLINED','CONTACTED','IN_PROGRESS','COMPLETED','CANCELLED')),
  estimated_value numeric,
  commission_status text not null default 'not_applicable' check (commission_status in ('not_applicable','pending','eligible','invoiced','paid','cancelled')),
  source text not null default 'resolve',
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.partner_events (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid references public.partners(id) on delete cascade,
  user_id uuid references public.users(id) on delete set null,
  need_id uuid references public.needs(id) on delete set null,
  offer_id uuid references public.partner_offers(id) on delete set null,
  event_type text not null,
  source text,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table if not exists public.partner_reviews (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partners(id) on delete cascade,
  lead_id uuid references public.partner_leads(id) on delete set null,
  user_id uuid references public.users(id) on delete set null,
  rating integer check (rating between 1 and 5),
  comment text,
  verified_interaction boolean not null default false,
  status text not null default 'pending' check (status in ('pending','published','hidden','rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.solution_performance (
  solution_id uuid primary key references public.solutions(id) on delete cascade,
  requests_matched integer not null default 0,
  click_count integer not null default 0,
  conversion_count integer not null default 0,
  resolution_count integer not null default 0,
  average_rating numeric,
  refund_count integer not null default 0,
  metadata jsonb not null default '{}',
  updated_at timestamptz not null default now()
);

create index if not exists idx_detected_opportunities_status_score on public.detected_opportunities(status, opportunity_score desc);
create index if not exists idx_partner_offers_partner_active on public.partner_offers(partner_id, active);
create index if not exists idx_partner_offers_category_active on public.partner_offers(category, active);
create index if not exists idx_partner_leads_partner_status on public.partner_leads(partner_id, status);
create index if not exists idx_partner_leads_need on public.partner_leads(need_id);
create index if not exists idx_partner_events_partner_type on public.partner_events(partner_id, event_type, created_at desc);
create index if not exists idx_partner_reviews_partner_status on public.partner_reviews(partner_id, status);

alter table public.detected_opportunities enable row level security;
alter table public.partner_offers enable row level security;
alter table public.partner_leads enable row level security;
alter table public.partner_events enable row level security;
alter table public.partner_reviews enable row level security;
alter table public.solution_performance enable row level security;

drop policy if exists "admin manage detected opportunities" on public.detected_opportunities;
create policy "admin manage detected opportunities" on public.detected_opportunities
  for all to authenticated
  using (public.is_admin_user())
  with check (public.is_admin_user());

drop policy if exists "public read active partner offers" on public.partner_offers;
create policy "public read active partner offers" on public.partner_offers
  for select to anon, authenticated
  using (active = true);

drop policy if exists "partner manage own offers" on public.partner_offers;
create policy "partner manage own offers" on public.partner_offers
  for all to authenticated
  using (partner_id in (select id from public.partners where user_id = (select auth.uid())) or public.is_admin_user())
  with check (partner_id in (select id from public.partners where user_id = (select auth.uid())) or public.is_admin_user());

drop policy if exists "partner read own leads" on public.partner_leads;
create policy "partner read own leads" on public.partner_leads
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or partner_id in (select id from public.partners where user_id = (select auth.uid()))
    or public.is_admin_user()
  );

drop policy if exists "admin manage partner leads" on public.partner_leads;
create policy "admin manage partner leads" on public.partner_leads
  for all to authenticated
  using (public.is_admin_user())
  with check (public.is_admin_user());

drop policy if exists "partner update own lead status" on public.partner_leads;
create policy "partner update own lead status" on public.partner_leads
  for update to authenticated
  using (partner_id in (select id from public.partners where user_id = (select auth.uid())))
  with check (partner_id in (select id from public.partners where user_id = (select auth.uid())));

drop policy if exists "public insert partner events" on public.partner_events;
create policy "public insert partner events" on public.partner_events
  for insert to anon, authenticated
  with check (true);

drop policy if exists "partners read own events" on public.partner_events;
create policy "partners read own events" on public.partner_events
  for select to authenticated
  using (
    partner_id in (select id from public.partners where user_id = (select auth.uid()))
    or public.is_admin_user()
  );

drop policy if exists "users insert verified partner reviews" on public.partner_reviews;
create policy "users insert verified partner reviews" on public.partner_reviews
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.partner_leads pl
      where pl.id = lead_id
      and pl.user_id = (select auth.uid())
      and pl.partner_id = partner_reviews.partner_id
      and pl.status in ('COMPLETED','IN_PROGRESS','CONTACTED')
    )
  );

drop policy if exists "public read published partner reviews" on public.partner_reviews;
create policy "public read published partner reviews" on public.partner_reviews
  for select to anon, authenticated
  using (status = 'published' and verified_interaction = true);

drop policy if exists "admin manage partner reviews" on public.partner_reviews;
create policy "admin manage partner reviews" on public.partner_reviews
  for all to authenticated
  using (public.is_admin_user())
  with check (public.is_admin_user());

drop policy if exists "admin read solution performance" on public.solution_performance;
create policy "admin read solution performance" on public.solution_performance
  for select to authenticated
  using (public.is_admin_user());

drop policy if exists "admin manage solution performance" on public.solution_performance;
create policy "admin manage solution performance" on public.solution_performance
  for all to authenticated
  using (public.is_admin_user())
  with check (public.is_admin_user());

grant select, insert, update, delete on public.detected_opportunities to authenticated;
grant select, insert, update, delete on public.partner_offers to authenticated;
grant select on public.partner_offers to anon;
grant select, insert, update, delete on public.partner_leads to authenticated;
grant insert on public.partner_events to anon, authenticated;
grant select, insert, update, delete on public.partner_events to authenticated;
grant select, insert, update, delete on public.partner_reviews to authenticated;
grant select on public.partner_reviews to anon;
grant select, insert, update, delete on public.solution_performance to authenticated;
