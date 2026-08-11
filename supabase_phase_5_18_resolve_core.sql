-- ChronoTrade Phase 5.18 - Resolve core
-- Generic need intake, matching, opportunities, community signals and feedback.

create table if not exists public.needs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete set null,
  session_id text,
  raw_text text not null,
  title text,
  status text not null default 'NEW' check (status in ('NEW','NEEDS_INFO','ANALYZING','MATCHED','PROPOSED','ACCEPTED','IN_PROGRESS','RESOLVED','DECLINED','UNRESOLVED','REJECTED_UNSAFE','REJECTED_ILLEGAL','OUT_OF_SCOPE','NEEDS_HUMAN_REVIEW')),
  user_type text,
  industry text,
  objective text,
  priority text,
  budget_range text,
  urgency text,
  contact_email text,
  contact_name text,
  wants_contact boolean not null default false,
  consent_service boolean not null default false,
  consent_marketing boolean not null default false,
  source_channel text,
  source_campaign text,
  source_content text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  landing_page text,
  referrer text,
  first_touch jsonb not null default '{}'::jsonb,
  last_touch jsonb not null default '{}'::jsonb,
  detected_category text,
  detected_objective text,
  recommended_services text[] not null default '{}'::text[],
  is_unmet boolean not null default false,
  public_idea_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.need_analysis (
  id uuid primary key default gen_random_uuid(),
  need_id uuid not null references public.needs(id) on delete cascade,
  summary text,
  primary_problem text,
  secondary_problems text[] not null default '{}'::text[],
  category text,
  subcategory text,
  desired_outcome text,
  constraints text,
  estimated_complexity text,
  commercial_value_score numeric,
  repeatability_score numeric,
  confidence numeric,
  analysis_version text not null default 'manual-v1',
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.need_tags (
  id uuid primary key default gen_random_uuid(),
  need_id uuid not null references public.needs(id) on delete cascade,
  tag text not null,
  source text not null default 'manual',
  created_at timestamptz not null default now(),
  unique (need_id, tag)
);

create table if not exists public.solutions (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('PRODUCT','APP','AUTOMATION','SERVICE','RESOURCE','PARTNER','EXPERT','AFFILIATE','CUSTOM')),
  name text not null,
  slug text not null unique,
  description text,
  problems_solved text[] not null default '{}'::text[],
  target_users text[] not null default '{}'::text[],
  industries text[] not null default '{}'::text[],
  price_model text,
  price numeric,
  recurring boolean not null default false,
  internal_or_external text not null default 'internal' check (internal_or_external in ('internal','external','partner')),
  provider_id uuid,
  product_id uuid references public.products(id) on delete set null,
  commission_model text,
  active boolean not null default true,
  public boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.need_solution_matches (
  id uuid primary key default gen_random_uuid(),
  need_id uuid not null references public.needs(id) on delete cascade,
  solution_id uuid references public.solutions(id) on delete set null,
  product_id uuid references public.products(id) on delete set null,
  match_type text not null default 'manual' check (match_type in ('manual','ai_assisted','automatic','fallback')),
  rank integer not null default 1,
  score numeric,
  status text not null default 'suggested' check (status in ('suggested','validated','sent','accepted','rejected','archived')),
  rationale text,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.need_events (
  id uuid primary key default gen_random_uuid(),
  need_id uuid not null references public.needs(id) on delete cascade,
  user_id uuid references public.users(id) on delete set null,
  event_type text not null,
  from_status text,
  to_status text,
  note text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.need_feedback (
  id uuid primary key default gen_random_uuid(),
  need_id uuid not null references public.needs(id) on delete cascade,
  user_id uuid references public.users(id) on delete set null,
  session_id text,
  resolution_result text not null check (resolution_result in ('yes','partial','no')),
  rating integer check (rating between 1 and 5),
  comment text,
  created_at timestamptz not null default now()
);

create table if not exists public.idea_votes (
  id uuid primary key default gen_random_uuid(),
  idea_id uuid not null references public.ideas(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  vote_type text not null default 'same_need' check (vote_type in ('same_need','useful','very_useful','essential')),
  created_at timestamptz not null default now(),
  unique (idea_id, user_id, vote_type)
);

create table if not exists public.idea_comments (
  id uuid primary key default gen_random_uuid(),
  idea_id uuid not null references public.ideas(id) on delete cascade,
  user_id uuid references public.users(id) on delete set null,
  parent_id uuid references public.idea_comments(id) on delete cascade,
  body text not null,
  display_mode text not null default 'pseudo' check (display_mode in ('real_name','pseudo','anonymous')),
  status text not null default 'published' check (status in ('published','hidden','reported','deleted')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.ideas add column if not exists same_need_count integer not null default 0;
alter table public.ideas add column if not exists comment_count integer not null default 0;
alter table public.ideas add column if not exists linked_need_count integer not null default 0;
alter table public.ideas add column if not exists market_signal_score numeric not null default 0;

alter table public.needs enable row level security;
alter table public.need_analysis enable row level security;
alter table public.need_tags enable row level security;
alter table public.solutions enable row level security;
alter table public.need_solution_matches enable row level security;
alter table public.need_events enable row level security;
alter table public.need_feedback enable row level security;
alter table public.idea_votes enable row level security;
alter table public.idea_comments enable row level security;

grant insert on public.needs to anon;
grant select, insert, update, delete on public.needs to authenticated;
grant select, insert, update, delete on public.needs to service_role;

grant select on public.need_analysis, public.need_tags, public.need_solution_matches, public.need_events to authenticated;
grant select, insert, update, delete on public.need_analysis, public.need_tags, public.need_solution_matches, public.need_events to authenticated;
grant select, insert, update, delete on public.need_analysis, public.need_tags, public.need_solution_matches, public.need_events to service_role;

grant select on public.solutions to anon, authenticated;
grant insert, update, delete on public.solutions to authenticated;
grant select, insert, update, delete on public.solutions to service_role;

grant insert on public.need_feedback to anon;
grant select, insert, update, delete on public.need_feedback to authenticated;
grant select, insert, update, delete on public.need_feedback to service_role;

grant select on public.idea_comments to anon, authenticated;
grant insert, update on public.idea_comments to authenticated;
grant select, insert, update, delete on public.idea_comments to service_role;

grant select, insert, delete on public.idea_votes to authenticated;
grant select, insert, update, delete on public.idea_votes to service_role;

drop policy if exists "Anyone can submit a need" on public.needs;
create policy "Anyone can submit a need" on public.needs for insert to anon, authenticated
with check (consent_service = true and (user_id is null or (select auth.uid()) = user_id));

drop policy if exists "Users read own needs and admins all" on public.needs;
create policy "Users read own needs and admins all" on public.needs for select to authenticated
using ((select auth.uid()) = user_id or public.is_admin_user());

drop policy if exists "Users update own needs and admins all" on public.needs;
create policy "Users update own needs and admins all" on public.needs for update to authenticated
using ((select auth.uid()) = user_id or public.is_admin_user())
with check ((select auth.uid()) = user_id or public.is_admin_user());

drop policy if exists "Admins delete needs" on public.needs;
create policy "Admins delete needs" on public.needs for delete to authenticated
using (public.is_admin_user());

drop policy if exists "Users read own need analysis" on public.need_analysis;
create policy "Users read own need analysis" on public.need_analysis for select to authenticated
using (public.is_admin_user() or exists (select 1 from public.needs n where n.id = need_analysis.need_id and n.user_id = (select auth.uid())));

drop policy if exists "Admins manage need analysis" on public.need_analysis;
create policy "Admins manage need analysis" on public.need_analysis for all to authenticated
using (public.is_admin_user()) with check (public.is_admin_user());

drop policy if exists "Users read own need tags" on public.need_tags;
create policy "Users read own need tags" on public.need_tags for select to authenticated
using (public.is_admin_user() or exists (select 1 from public.needs n where n.id = need_tags.need_id and n.user_id = (select auth.uid())));

drop policy if exists "Admins manage need tags" on public.need_tags;
create policy "Admins manage need tags" on public.need_tags for all to authenticated
using (public.is_admin_user()) with check (public.is_admin_user());

drop policy if exists "Public reads public active solutions" on public.solutions;
create policy "Public reads public active solutions" on public.solutions for select to anon, authenticated
using ((active = true and public = true) or public.is_admin_user());

drop policy if exists "Admins manage solutions" on public.solutions;
create policy "Admins manage solutions" on public.solutions for all to authenticated
using (public.is_admin_user()) with check (public.is_admin_user());

drop policy if exists "Users read own matches" on public.need_solution_matches;
create policy "Users read own matches" on public.need_solution_matches for select to authenticated
using (public.is_admin_user() or exists (select 1 from public.needs n where n.id = need_solution_matches.need_id and n.user_id = (select auth.uid())));

drop policy if exists "Admins manage matches" on public.need_solution_matches;
create policy "Admins manage matches" on public.need_solution_matches for all to authenticated
using (public.is_admin_user()) with check (public.is_admin_user());

drop policy if exists "Users read own events" on public.need_events;
create policy "Users read own events" on public.need_events for select to authenticated
using (public.is_admin_user() or exists (select 1 from public.needs n where n.id = need_events.need_id and n.user_id = (select auth.uid())));

drop policy if exists "Admins manage need events" on public.need_events;
create policy "Admins manage need events" on public.need_events for all to authenticated
using (public.is_admin_user()) with check (public.is_admin_user());

drop policy if exists "Anyone can submit need feedback" on public.need_feedback;
create policy "Anyone can submit need feedback" on public.need_feedback for insert to anon, authenticated
with check (true);

drop policy if exists "Users read own feedback" on public.need_feedback;
create policy "Users read own feedback" on public.need_feedback for select to authenticated
using (public.is_admin_user() or user_id = (select auth.uid()) or exists (select 1 from public.needs n where n.id = need_feedback.need_id and n.user_id = (select auth.uid())));

drop policy if exists "Admins manage feedback" on public.need_feedback;
create policy "Admins manage feedback" on public.need_feedback for all to authenticated
using (public.is_admin_user()) with check (public.is_admin_user());

drop policy if exists "Public reads idea comments" on public.idea_comments;
create policy "Public reads idea comments" on public.idea_comments for select to anon, authenticated
using (status = 'published' or public.is_admin_user() or user_id = (select auth.uid()));

drop policy if exists "Users insert own idea comments" on public.idea_comments;
create policy "Users insert own idea comments" on public.idea_comments for insert to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "Users update own idea comments" on public.idea_comments;
create policy "Users update own idea comments" on public.idea_comments for update to authenticated
using ((select auth.uid()) = user_id or public.is_admin_user())
with check ((select auth.uid()) = user_id or public.is_admin_user());

drop policy if exists "Users manage own idea votes" on public.idea_votes;
create policy "Users manage own idea votes" on public.idea_votes for all to authenticated
using ((select auth.uid()) = user_id or public.is_admin_user())
with check ((select auth.uid()) = user_id or public.is_admin_user());

create index if not exists needs_status_created_idx on public.needs(status, created_at desc);
create index if not exists needs_user_created_idx on public.needs(user_id, created_at desc);
create index if not exists needs_category_status_idx on public.needs(detected_category, status, created_at desc);
create index if not exists need_analysis_need_idx on public.need_analysis(need_id, created_at desc);
create index if not exists need_tags_tag_idx on public.need_tags(tag);
create index if not exists solutions_type_active_idx on public.solutions(type, active, public);
create index if not exists matches_need_rank_idx on public.need_solution_matches(need_id, rank);
create index if not exists need_events_need_created_idx on public.need_events(need_id, created_at desc);
create index if not exists need_feedback_need_idx on public.need_feedback(need_id, created_at desc);
create index if not exists idea_votes_idea_idx on public.idea_votes(idea_id, vote_type);
create index if not exists idea_comments_idea_created_idx on public.idea_comments(idea_id, created_at desc);

create or replace function public.refresh_idea_signal_counts(target_idea_id uuid)
returns void
language plpgsql
as $$
begin
  update public.ideas
  set
    same_need_count = (select count(*)::integer from public.idea_votes where idea_id = target_idea_id and vote_type = 'same_need'),
    comment_count = (select count(*)::integer from public.idea_comments where idea_id = target_idea_id and status = 'published'),
    market_signal_score = (
      (select count(*)::numeric from public.idea_votes where idea_id = target_idea_id and vote_type = 'same_need') * 3
      + (select count(*)::numeric from public.idea_votes where idea_id = target_idea_id and vote_type in ('very_useful','essential')) * 2
      + (select count(*)::numeric from public.idea_comments where idea_id = target_idea_id and status = 'published')
    )
  where id = target_idea_id;
end;
$$;

create or replace function public.refresh_idea_signal_counts_trigger()
returns trigger
language plpgsql
as $$
begin
  perform public.refresh_idea_signal_counts(coalesce(new.idea_id, old.idea_id));
  return coalesce(new, old);
end;
$$;

drop trigger if exists idea_votes_refresh_counts on public.idea_votes;
create trigger idea_votes_refresh_counts
after insert or update or delete on public.idea_votes
for each row execute function public.refresh_idea_signal_counts_trigger();

drop trigger if exists idea_comments_refresh_counts on public.idea_comments;
create trigger idea_comments_refresh_counts
after insert or update or delete on public.idea_comments
for each row execute function public.refresh_idea_signal_counts_trigger();
