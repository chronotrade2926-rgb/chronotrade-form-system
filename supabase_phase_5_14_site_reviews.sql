-- Phase 5.14 - Avis ChronoTrade generaux, moderes depuis le super-admin.

create table if not exists public.site_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete set null,
  author_name text not null,
  email text,
  company text,
  role_label text,
  rating integer not null check (rating between 1 and 5),
  title text,
  body text not null,
  source text not null default 'site' check (source in ('site', 'google', 'admin_import')),
  status text not null default 'pending' check (status in ('pending', 'approved', 'hidden', 'rejected', 'archived')),
  verified_client boolean not null default false,
  admin_reply text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.site_reviews enable row level security;

revoke all on public.site_reviews from anon;
grant select on public.site_reviews to authenticated;
grant insert on public.site_reviews to authenticated;
grant select, update, delete on public.site_reviews to authenticated;

drop policy if exists "Public reads approved site reviews" on public.site_reviews;
create policy "Public reads approved site reviews"
on public.site_reviews
for select
to authenticated
using (status = 'approved' or public.is_admin_user() or (select auth.uid()) = user_id);

drop policy if exists "Users submit own site reviews" on public.site_reviews;
create policy "Users submit own site reviews"
on public.site_reviews
for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "Admins manage site reviews" on public.site_reviews;
create policy "Admins manage site reviews"
on public.site_reviews
for all
to authenticated
using (public.is_admin_user())
with check (public.is_admin_user());

create index if not exists idx_site_reviews_status_created on public.site_reviews(status, created_at desc);
create index if not exists idx_site_reviews_user_id on public.site_reviews(user_id, created_at desc);
create index if not exists idx_site_reviews_rating on public.site_reviews(rating);

create or replace view public.site_reviews_public
with (security_invoker = true)
as
select
  id,
  author_name,
  company,
  role_label,
  rating,
  title,
  body,
  source,
  verified_client,
  admin_reply,
  created_at
from public.site_reviews
where status = 'approved';

grant select on public.site_reviews_public to anon, authenticated;
