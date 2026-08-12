-- Phase 5.24 - Need UX quality, corrections and taxonomy

alter table public.need_analysis add column if not exists original_ai_output_reference text;

alter table public.need_feedback add column if not exists understanding_result text
  check (understanding_result in ('yes','partial','no'));
alter table public.need_feedback add column if not exists match_acceptance_result text
  check (match_acceptance_result in ('accepted','uncertain','rejected'));
alter table public.need_feedback add column if not exists feedback_stage text not null default 'resolution'
  check (feedback_stage in ('understanding','match','resolution'));

create table if not exists public.need_analysis_corrections (
  id uuid primary key default gen_random_uuid(),
  need_id uuid not null references public.needs(id) on delete cascade,
  user_id uuid references public.users(id) on delete set null,
  session_id text,
  correction_type text not null default 'user_understanding'
    check (correction_type in ('user_understanding','admin_analysis','admin_matching')),
  original_summary text,
  corrected_text text not null,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table if not exists public.need_taxonomy (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid references public.need_taxonomy(id) on delete set null,
  label text not null,
  slug text not null,
  kind text not null default 'category' check (kind in ('category','subcategory','tag','industry','objective')),
  status text not null default 'active' check (status in ('active','archived','merged')),
  merged_into uuid references public.need_taxonomy(id) on delete set null,
  aliases text[] not null default '{}',
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (kind, slug)
);

create index if not exists idx_need_analysis_corrections_need on public.need_analysis_corrections(need_id, created_at desc);
create index if not exists idx_need_taxonomy_kind_status on public.need_taxonomy(kind, status, label);

alter table public.need_analysis_corrections enable row level security;
alter table public.need_taxonomy enable row level security;

grant insert on public.need_analysis_corrections to anon;
grant select, insert, update, delete on public.need_analysis_corrections to authenticated;
grant select, insert, update, delete on public.need_analysis_corrections to service_role;

grant select on public.need_taxonomy to anon, authenticated;
grant insert, update, delete on public.need_taxonomy to authenticated;
grant select, insert, update, delete on public.need_taxonomy to service_role;

drop policy if exists "anyone can add own need correction" on public.need_analysis_corrections;
create policy "anyone can add own need correction" on public.need_analysis_corrections
  for insert to anon, authenticated
  with check (user_id is null or user_id = (select auth.uid()) or public.is_admin_user());

drop policy if exists "users read own corrections and admins all" on public.need_analysis_corrections;
create policy "users read own corrections and admins all" on public.need_analysis_corrections
  for select to authenticated
  using (
    public.is_admin_user()
    or user_id = (select auth.uid())
    or exists (select 1 from public.needs n where n.id = need_analysis_corrections.need_id and n.user_id = (select auth.uid()))
  );

drop policy if exists "admins manage need corrections" on public.need_analysis_corrections;
create policy "admins manage need corrections" on public.need_analysis_corrections
  for all to authenticated
  using (public.is_admin_user())
  with check (public.is_admin_user());

drop policy if exists "public reads active taxonomy" on public.need_taxonomy;
create policy "public reads active taxonomy" on public.need_taxonomy
  for select to anon, authenticated
  using (status = 'active' or public.is_admin_user());

drop policy if exists "admins manage taxonomy" on public.need_taxonomy;
create policy "admins manage taxonomy" on public.need_taxonomy
  for all to authenticated
  using (public.is_admin_user())
  with check (public.is_admin_user());

insert into public.need_taxonomy (kind, label, slug, aliases, description)
values
  ('category','Automatisation','automatisation', array['workflow','ia','gain de temps'], 'Besoins lies aux taches repetitives, outils connectes et automatisations.'),
  ('category','Image et presence digitale','image-presence-digitale', array['site web','branding','logo'], 'Besoins lies au site, a l identite, au contenu et a la confiance percue.'),
  ('category','Lancement','lancement', array['idee','offre','business model'], 'Besoins lies a la clarification et au lancement d une activite.'),
  ('category','Partenaires et reseau','partenaires-reseau', array['prestataire','mise en relation','reseau'], 'Besoins lies aux partenaires, prestataires et opportunites.'),
  ('category','Avis et reputation','avis-reputation', array['avis google','reputation','fidelisation'], 'Besoins lies a la preuve sociale et aux retours clients.')
on conflict (kind, slug) do nothing;
