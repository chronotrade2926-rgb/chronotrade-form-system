-- Phase B - Owner super-admin canonical fix
-- Purpose: align live Supabase/RLS with the single confirmed ChronoTrade owner account.
-- This migration is additive/repair-oriented and does not delete users, orders, credits, entitlements or history.

insert into public.admin_emails(email)
values ('bouchonnetflorent@gmail.com')
on conflict (email) do nothing;

delete from public.admin_emails
where lower(email) <> 'bouchonnetflorent@gmail.com';

update public.users
set role = 'client', updated_at = now()
where role in ('admin', 'super_admin')
  and lower(email) <> 'bouchonnetflorent@gmail.com';

update public.users
set role = 'super_admin', updated_at = now()
where lower(email) = 'bouchonnetflorent@gmail.com';

create or replace function public.is_super_admin_user()
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select exists (
    select 1
    from public.users u
    where u.id = (select auth.uid())
      and u.role = 'super_admin'
      and lower(u.email) = 'bouchonnetflorent@gmail.com'
  );
$$;

create or replace function public.is_admin_user()
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select public.is_super_admin_user();
$$;

create or replace function public.is_admin(user_id uuid default auth.uid())
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select exists (
    select 1
    from public.users u
    where u.id = user_id
      and u.role = 'super_admin'
      and lower(u.email) = 'bouchonnetflorent@gmail.com'
  );
$$;

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  requested_role text;
  normalized_email text;
begin
  normalized_email := lower(coalesce(new.email, ''));
  requested_role := coalesce(new.raw_user_meta_data->>'role', 'client');

  if normalized_email = 'bouchonnetflorent@gmail.com' then
    requested_role := 'super_admin';
  elsif requested_role not in ('client', 'partner') then
    requested_role := 'client';
  end if;

  insert into public.users (id, email, first_name, last_name, full_name, role)
  values (
    new.id,
    coalesce(new.email, ''),
    nullif(new.raw_user_meta_data->>'first_name', ''),
    nullif(new.raw_user_meta_data->>'last_name', ''),
    nullif(trim(coalesce(new.raw_user_meta_data->>'first_name', '') || ' ' || coalesce(new.raw_user_meta_data->>'last_name', '')), ''),
    requested_role
  )
  on conflict (id) do update set
    email = excluded.email,
    first_name = coalesce(public.users.first_name, excluded.first_name),
    last_name = coalesce(public.users.last_name, excluded.last_name),
    full_name = coalesce(public.users.full_name, excluded.full_name),
    role = case
      when lower(excluded.email) = 'bouchonnetflorent@gmail.com' then 'super_admin'
      when public.users.role = 'super_admin' and lower(public.users.email) = 'bouchonnetflorent@gmail.com' then 'super_admin'
      when excluded.role in ('client', 'partner') then excluded.role
      else 'client'
    end,
    updated_at = now();

  return new;
end;
$$;

create or replace function public.enforce_super_admin_security()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_email text;
  db_role text;
begin
  normalized_email := lower(coalesce(new.email, ''));
  db_role := current_setting('role', true);

  if normalized_email = 'bouchonnetflorent@gmail.com' then
    new.role := 'super_admin';
  end if;

  if new.role = 'super_admin'
    and normalized_email <> 'bouchonnetflorent@gmail.com' then
    raise exception 'super_admin role is restricted to the ChronoTrade owner account';
  end if;

  if tg_op = 'UPDATE' and new.role is distinct from old.role then
    if coalesce(db_role, '') not in ('service_role', 'postgres', 'supabase_admin')
      and not public.is_super_admin_user() then
      raise exception 'only the ChronoTrade owner can change account roles';
    end if;
  end if;

  if tg_op = 'UPDATE'
    and old.role = 'super_admin'
    and lower(coalesce(old.email, '')) = 'bouchonnetflorent@gmail.com'
    and normalized_email <> lower(coalesce(old.email, '')) then
    raise exception 'super_admin owner email cannot be changed from the public profile table';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_super_admin_security on public.users;
create trigger trg_enforce_super_admin_security
before insert or update on public.users
for each row
execute function public.enforce_super_admin_security();

insert into public.admin_activity_log(actor_id, action, entity_type, metadata)
select null, 'owner_super_admin_fix_applied', 'security', '{"phase":"B","super_admin_email":"bouchonnetflorent@gmail.com"}'::jsonb
where exists (
  select 1
  from information_schema.tables
  where table_schema = 'public'
    and table_name = 'admin_activity_log'
);
