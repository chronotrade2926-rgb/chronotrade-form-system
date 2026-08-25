-- ChronoTrade Phase 5.7 - Super-admin account allowlist
-- Date: 2026-08-09
-- Purpose: keep the real owner accounts aligned with the platform super-admin role.

insert into public.admin_emails(email)
values
  ('bouchonnetflorent@gmail.com')
on conflict (email) do nothing;

update public.users
set role = 'super_admin', updated_at = now()
where lower(email) = 'bouchonnetflorent@gmail.com';

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
  elsif normalized_email in (select lower(email) from public.admin_emails) then
    requested_role := 'admin';
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
      when public.users.role = 'super_admin' then 'super_admin'
      when excluded.role = 'super_admin' then 'super_admin'
      when public.users.role = 'admin' then 'admin'
      else excluded.role
    end,
    updated_at = now();

  return new;
end;
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
    from public.users
    where id = user_id and role in ('admin', 'super_admin')
  );
$$;
