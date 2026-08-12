-- Phase 5.25 - Luna AI validation and cost tracking
-- Server-side only. No secret is exposed to public clients.

alter table public.need_analysis add column if not exists needs_clarification boolean not null default false;
alter table public.need_analysis add column if not exists moderation_reason text;

alter table public.ai_analysis_runs add column if not exists duration_ms integer;
alter table public.ai_analysis_runs add column if not exists input_tokens integer;
alter table public.ai_analysis_runs add column if not exists output_tokens integer;
alter table public.ai_analysis_runs add column if not exists total_tokens integer;
alter table public.ai_analysis_runs add column if not exists estimated_cost_usd numeric;
alter table public.ai_analysis_runs add column if not exists call_count integer not null default 0;

create table if not exists public.ai_analysis_reviews (
  id uuid primary key default gen_random_uuid(),
  need_id uuid not null references public.needs(id) on delete cascade,
  analysis_id uuid references public.need_analysis(id) on delete set null,
  reviewed_by uuid references public.users(id) on delete set null,
  result text not null check (result in ('yes','partial','no')),
  issue_type text check (issue_type is null or issue_type in ('wrong_category','misunderstood_problem','wrong_industry','wrong_solution','too_vague','useless_question','other')),
  comment text,
  created_at timestamptz not null default now()
);

create table if not exists public.ai_match_reviews (
  id uuid primary key default gen_random_uuid(),
  need_id uuid not null references public.needs(id) on delete cascade,
  match_id uuid references public.need_solution_matches(id) on delete cascade,
  solution_id uuid references public.solutions(id) on delete set null,
  reviewed_by uuid references public.users(id) on delete set null,
  result text not null check (result in ('validated','rejected','replaced','human_added')),
  replacement_solution_id uuid references public.solutions(id) on delete set null,
  comment text,
  created_at timestamptz not null default now()
);

create index if not exists idx_ai_analysis_reviews_need_created on public.ai_analysis_reviews(need_id, created_at desc);
create index if not exists idx_ai_analysis_reviews_result_created on public.ai_analysis_reviews(result, created_at desc);
create index if not exists idx_ai_match_reviews_need_created on public.ai_match_reviews(need_id, created_at desc);
create index if not exists idx_ai_match_reviews_match_created on public.ai_match_reviews(match_id, created_at desc);
create index if not exists idx_ai_analysis_runs_model_created on public.ai_analysis_runs(model, created_at desc);

alter table public.ai_analysis_reviews enable row level security;
alter table public.ai_match_reviews enable row level security;

grant select, insert, update, delete on public.ai_analysis_reviews to authenticated;
grant select, insert, update, delete on public.ai_match_reviews to authenticated;
grant select, insert, update, delete on public.ai_analysis_reviews to service_role;
grant select, insert, update, delete on public.ai_match_reviews to service_role;

drop policy if exists "admins manage ai analysis reviews" on public.ai_analysis_reviews;
create policy "admins manage ai analysis reviews" on public.ai_analysis_reviews
  for all to authenticated
  using (public.is_admin_user())
  with check (public.is_admin_user());

drop policy if exists "admins manage ai match reviews" on public.ai_match_reviews;
create policy "admins manage ai match reviews" on public.ai_match_reviews
  for all to authenticated
  using (public.is_admin_user())
  with check (public.is_admin_user());

insert into public.ai_prompt_versions (name, version, usage, model, prompt, active, metadata)
values (
  'need_analysis',
  'v2-luna',
  'resolve_need_analysis',
  'gpt-5.6-luna',
  'Analyse une demande ChronoTrade a partir du texte exact utilisateur. Objectif: comprendre le probleme reel, extraire les informations utiles et produire une reponse courte, concrete et personnalisee. N''invente jamais de solution disponible: les solutions affichables seront recherchees ensuite uniquement dans la base ChronoTrade. Ne stocke aucun raisonnement interne. Si une information determinante manque, propose 1 a 3 questions maximum. Si la demande est illegale, dangereuse, frauduleuse, malveillante ou hors cadre, indique safe_to_process=false, needs_human_review=true et moderation_reason.',
  true,
  '{"owner":"ChronoTrade","mode":"server_only","model_strategy":"luna_first","chain_of_thought":"never_store","max_questions":3}'::jsonb
)
on conflict (name, version) do update set
  usage = excluded.usage,
  model = excluded.model,
  prompt = excluded.prompt,
  active = excluded.active,
  metadata = excluded.metadata,
  updated_at = now();

update public.ai_prompt_versions
set active = false, updated_at = now()
where usage = 'resolve_need_analysis'
  and name = 'need_analysis'
  and version <> 'v2-luna';
