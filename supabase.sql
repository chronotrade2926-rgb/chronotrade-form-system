-- ChronoTrade Supabase platform schema
-- Deja applique sur le projet Supabase odkuwhunrnhbedbqazfn.
-- A garder comme reference de reproduction.

create extension if not exists "pgcrypto";

create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique not null,
  first_name text,
  last_name text,
  full_name text,
  role text not null default 'client' check (role in ('client', 'partner', 'admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.admin_emails (
  email text primary key,
  created_at timestamptz not null default now()
);

insert into public.admin_emails(email)
values ('flo.chronotrade@outlook.fr')
on conflict (email) do nothing;

create table if not exists public.partners (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references public.users(id) on delete cascade,
  first_name text,
  last_name text,
  company_name text,
  email text not null,
  phone text,
  category text,
  expertise text,
  city text,
  website text,
  instagram text,
  linkedin text,
  description text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.business_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete set null,
  full_name text not null,
  email text not null,
  company text,
  need_type text,
  category_requested text,
  city text,
  budget text,
  urgency text,
  description text,
  status text not null default 'new' check (status in ('new', 'in_review', 'matched', 'closed', 'lost')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.partner_matches (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.business_requests(id) on delete cascade,
  partner_id uuid not null references public.partners(id) on delete cascade,
  status text not null default 'suggested' check (status in ('suggested', 'contact_requested', 'introduced', 'rejected')),
  internal_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (request_id, partner_id)
);

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  slug text unique not null,
  client_name text,
  universe text not null check (universe in ('launch', 'os', 'studio', 'business', 'lab')),
  category text,
  short_description text,
  problem text,
  solution text,
  result text,
  images jsonb not null default '[]'::jsonb,
  external_url text,
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  featured boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Les triggers, fonctions et policies ont ete appliques via migrations Supabase :
-- chrono_platform_auth_partners_portfolio
-- harden_platform_security_policies
-- revoke_public_rpc_execution
-- set_owner_email_as_admin
