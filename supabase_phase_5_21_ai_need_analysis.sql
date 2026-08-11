-- Phase 5.21 - AI need analysis V1
-- Server-side only: prompts are versioned, analysis runs are logged, and existing solutions stay the only match source.

create table if not exists public.ai_prompt_versions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  version text not null,
  usage text not null,
  model text,
  prompt text not null,
  active boolean not null default false,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(name, version)
);

create table if not exists public.ai_analysis_runs (
  id uuid primary key default gen_random_uuid(),
  need_id uuid references public.needs(id) on delete cascade,
  prompt_version_id uuid references public.ai_prompt_versions(id) on delete set null,
  provider text not null default 'openai',
  model text,
  status text not null default 'pending' check (status in ('pending','started','completed','failed','skipped','timeout','invalid_response')),
  confidence_score numeric,
  needs_human_review boolean,
  safe_to_process boolean,
  error_message text,
  usage jsonb not null default '{}',
  result jsonb not null default '{}',
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

alter table public.need_analysis add column if not exists user_type text;
alter table public.need_analysis add column if not exists urgency text;
alter table public.need_analysis add column if not exists budget_if_mentioned text;
alter table public.need_analysis add column if not exists solution_tags text[] not null default '{}';
alter table public.need_analysis add column if not exists commercial_intent text;
alter table public.need_analysis add column if not exists needs_human_review boolean not null default false;
alter table public.need_analysis add column if not exists safe_to_process boolean not null default true;
alter table public.need_analysis add column if not exists rejection_reason_if_any text;
alter table public.need_analysis add column if not exists user_facing_suggestion text;
alter table public.need_analysis add column if not exists suggested_questions text[] not null default '{}';
alter table public.need_analysis add column if not exists human_validated boolean not null default false;
alter table public.need_analysis add column if not exists human_correction jsonb not null default '{}';

alter table public.need_solution_matches add column if not exists match_reason text;
alter table public.need_solution_matches add column if not exists user_facing_copy text;
alter table public.need_solution_matches add column if not exists confidence_band text check (confidence_band is null or confidence_band in ('high','medium','low','none'));

create index if not exists idx_ai_prompt_versions_active_usage on public.ai_prompt_versions(usage, active);
create index if not exists idx_ai_analysis_runs_need_status on public.ai_analysis_runs(need_id, status, created_at desc);
create index if not exists idx_need_analysis_category_confidence on public.need_analysis(category, confidence desc);

alter table public.ai_prompt_versions enable row level security;
alter table public.ai_analysis_runs enable row level security;

drop policy if exists "admin manage ai prompt versions" on public.ai_prompt_versions;
create policy "admin manage ai prompt versions" on public.ai_prompt_versions
  for all to authenticated
  using (public.is_admin_user())
  with check (public.is_admin_user());

drop policy if exists "admin read ai analysis runs" on public.ai_analysis_runs;
create policy "admin read ai analysis runs" on public.ai_analysis_runs
  for select to authenticated
  using (public.is_admin_user());

drop policy if exists "admin manage ai analysis runs" on public.ai_analysis_runs;
create policy "admin manage ai analysis runs" on public.ai_analysis_runs
  for all to authenticated
  using (public.is_admin_user())
  with check (public.is_admin_user());

grant select, insert, update, delete on public.ai_prompt_versions to authenticated;
grant select, insert, update, delete on public.ai_analysis_runs to authenticated;

insert into public.ai_prompt_versions (name, version, usage, model, prompt, active, metadata)
values (
  'need_analysis',
  'v1',
  'resolve_need_analysis',
  'gpt-4.1-mini',
  'Analyse une demande ChronoTrade. Retourne uniquement des donnees structurees utiles au produit. N''invente jamais de produit disponible. Les solutions affichables seront recherchees ensuite uniquement dans la base ChronoTrade. Si la demande est interdite, dangereuse ou hors perimetre, indique safe_to_process=false et needs_human_review=true.',
  true,
  '{"owner":"ChronoTrade","mode":"server_only","chain_of_thought":"never_store"}'::jsonb
)
on conflict (name, version) do update set
  usage = excluded.usage,
  model = excluded.model,
  prompt = excluded.prompt,
  active = excluded.active,
  metadata = excluded.metadata,
  updated_at = now();
