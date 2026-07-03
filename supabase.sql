-- ChronoTrade Supabase schema
-- A executer dans Supabase SQL Editor.
-- Les donnees privees restent protegees par RLS. Le backend Render utilise la cle service_role.

create extension if not exists "pgcrypto";

create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  full_name text,
  role text not null default 'prospect' check (role in ('prospect', 'partner', 'admin')),
  created_at timestamptz not null default now()
);

create table if not exists public.partners (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete set null,
  name text not null,
  company text,
  email text not null,
  phone text,
  category text,
  expertise text,
  city text,
  website text,
  linkedin text,
  description text,
  portfolio_url text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now()
);

create table if not exists public.business_requests (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  email text not null,
  company text,
  need_type text,
  category_requested text,
  description text,
  budget text,
  urgency text,
  status text not null default 'new' check (status in ('new', 'in_review', 'matched', 'closed', 'lost')),
  created_at timestamptz not null default now()
);

create table if not exists public.partner_matches (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.business_requests(id) on delete cascade,
  partner_id uuid not null references public.partners(id) on delete cascade,
  status text not null default 'suggested' check (status in ('suggested', 'contact_requested', 'introduced', 'rejected')),
  created_at timestamptz not null default now(),
  unique (request_id, partner_id)
);

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  client_name text,
  company text,
  universe text not null check (universe in ('launch', 'os', 'studio', 'business')),
  title text not null,
  status text not null default 'prototype' check (status in ('prototype', 'in_progress', 'completed', 'paused')),
  created_at timestamptz not null default now()
);

create index if not exists partners_status_category_idx on public.partners(status, category);
create index if not exists business_requests_status_idx on public.business_requests(status);
create index if not exists projects_universe_status_idx on public.projects(universe, status);

alter table public.users enable row level security;
alter table public.partners enable row level security;
alter table public.business_requests enable row level security;
alter table public.partner_matches enable row level security;
alter table public.projects enable row level security;

-- Lecture publique limitee aux partenaires valides, sans donnees privees sensibles.
create or replace view public.approved_partners_public as
select
  id,
  name,
  company,
  category,
  city,
  description,
  portfolio_url,
  created_at
from public.partners
where status = 'approved';

-- Policies minimales. Le backend service_role contourne RLS pour l'ecriture serveur.
drop policy if exists "public_read_approved_partners" on public.partners;
create policy "public_read_approved_partners"
on public.partners
for select
using (status = 'approved');

drop policy if exists "public_read_completed_projects" on public.projects;
create policy "public_read_completed_projects"
on public.projects
for select
using (status in ('completed', 'prototype'));
