-- Phase 5.11 - Suivi fin des projets ChronoTrade.
-- Objectif: commentaires, historique et livrables rattaches aux commandes/projets.
-- Compatible production: creation additive uniquement.

create table if not exists public.project_updates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  order_id uuid references public.orders_or_projects(id) on delete cascade,
  title text not null,
  body text,
  status text not null default 'visible' check (status in ('draft', 'visible', 'hidden', 'archived')),
  update_type text not null default 'progress' check (update_type in ('progress', 'decision', 'delivery', 'payment', 'support', 'system')),
  created_by uuid references public.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.project_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  order_id uuid references public.orders_or_projects(id) on delete cascade,
  author_role text not null default 'user' check (author_role in ('user', 'admin', 'system')),
  body text not null,
  status text not null default 'visible' check (status in ('visible', 'hidden', 'archived')),
  read_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.project_deliverables (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  order_id uuid references public.orders_or_projects(id) on delete cascade,
  title text not null,
  description text,
  delivery_type text not null default 'file' check (delivery_type in ('file', 'link', 'note', 'app_access', 'automation', 'document')),
  file_url text,
  storage_bucket text,
  storage_path text,
  is_private boolean not null default true,
  version text not null default '1.0',
  status text not null default 'draft' check (status in ('draft', 'available', 'archived')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.project_updates enable row level security;
alter table public.project_messages enable row level security;
alter table public.project_deliverables enable row level security;

grant select, insert, update, delete on public.project_updates, public.project_messages, public.project_deliverables to authenticated;

drop policy if exists "Users read own project updates" on public.project_updates;
create policy "Users read own project updates" on public.project_updates for select to authenticated
using ((select auth.uid()) = user_id or public.is_admin_user());

drop policy if exists "Admins manage project updates" on public.project_updates;
create policy "Admins manage project updates" on public.project_updates for all to authenticated
using (public.is_admin_user()) with check (public.is_admin_user());

drop policy if exists "Users read own project messages" on public.project_messages;
create policy "Users read own project messages" on public.project_messages for select to authenticated
using ((select auth.uid()) = user_id or public.is_admin_user());

drop policy if exists "Users create own project messages" on public.project_messages;
create policy "Users create own project messages" on public.project_messages for insert to authenticated
with check ((select auth.uid()) = user_id and author_role = 'user');

drop policy if exists "Admins manage project messages" on public.project_messages;
create policy "Admins manage project messages" on public.project_messages for all to authenticated
using (public.is_admin_user()) with check (public.is_admin_user());

drop policy if exists "Users read own project deliverables" on public.project_deliverables;
create policy "Users read own project deliverables" on public.project_deliverables for select to authenticated
using ((select auth.uid()) = user_id or public.is_admin_user());

drop policy if exists "Admins manage project deliverables" on public.project_deliverables;
create policy "Admins manage project deliverables" on public.project_deliverables for all to authenticated
using (public.is_admin_user()) with check (public.is_admin_user());

create index if not exists project_updates_user_order_idx on public.project_updates(user_id, order_id, created_at desc);
create index if not exists project_messages_user_order_idx on public.project_messages(user_id, order_id, created_at desc);
create index if not exists project_deliverables_user_order_idx on public.project_deliverables(user_id, order_id, created_at desc);
