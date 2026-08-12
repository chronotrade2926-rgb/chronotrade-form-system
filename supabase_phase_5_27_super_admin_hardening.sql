-- Phase 5.27 - Super-admin hardening
-- Locks the owner role to the two real ChronoTrade owner emails.
-- Prevents client-side role escalation through public.users updates.

insert into public.admin_emails(email)
values
  ('bouchonnetflorent@gmail.com'),
  ('chronotrade2926@gmail.com'),
  ('flo.chronotrade@outlook.fr')
on conflict (email) do nothing;

delete from public.admin_emails
where lower(email) in ('bouchonneflorent@gmail.com', 'chronotrade29-26@gmail.com');

update public.users
set role = 'admin', updated_at = now()
where role = 'super_admin'
  and lower(email) not in ('bouchonnetflorent@gmail.com', 'chronotrade2926@gmail.com');

update public.users
set role = 'super_admin', updated_at = now()
where lower(email) in ('bouchonnetflorent@gmail.com', 'chronotrade2926@gmail.com');

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
      and lower(u.email) in ('bouchonnetflorent@gmail.com', 'chronotrade2926@gmail.com')
  );
$$;

create or replace function public.is_admin_user()
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
      and (
        u.role = 'admin'
        or (
          u.role = 'super_admin'
          and lower(u.email) in ('bouchonnetflorent@gmail.com', 'chronotrade2926@gmail.com')
        )
      )
  );
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

  if normalized_email in ('bouchonnetflorent@gmail.com', 'chronotrade2926@gmail.com') then
    new.role := 'super_admin';
  end if;

  if new.role = 'super_admin'
    and normalized_email not in ('bouchonnetflorent@gmail.com', 'chronotrade2926@gmail.com') then
    raise exception 'super_admin role is restricted to ChronoTrade owner accounts';
  end if;

  if tg_op = 'UPDATE' and new.role is distinct from old.role then
    if coalesce(db_role, '') not in ('service_role', 'postgres', 'supabase_admin')
      and not public.is_super_admin_user() then
      raise exception 'only a ChronoTrade super-admin can change account roles';
    end if;
  end if;

  if tg_op = 'UPDATE'
    and old.role = 'super_admin'
    and lower(coalesce(old.email, '')) in ('bouchonnetflorent@gmail.com', 'chronotrade2926@gmail.com')
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

drop policy if exists "admin_emails_admin_read" on public.admin_emails;
drop policy if exists "super admins read admin emails" on public.admin_emails;
create policy "super admins read admin emails"
on public.admin_emails
for select to authenticated
using (public.is_super_admin_user());

drop policy if exists "super admins manage admin emails" on public.admin_emails;
create policy "super admins manage admin emails"
on public.admin_emails
for all to authenticated
using (public.is_super_admin_user())
with check (public.is_super_admin_user());

drop policy if exists "users_update_own_or_admin" on public.users;
drop policy if exists "users update own profile fields or admins all" on public.users;
create policy "users update own profile fields or admins all"
on public.users
for update to authenticated
using ((id = (select auth.uid())) or public.is_admin_user())
with check (
  (
    id = (select auth.uid())
    and role in ('client', 'partner')
  )
  or public.is_super_admin_user()
);

insert into public.admin_activity_log(actor_id, action, entity_type, metadata)
select null, 'super_admin_hardening_applied', 'security', '{"phase":"5.27","super_admin_emails":["bouchonnetflorent@gmail.com","chronotrade2926@gmail.com"]}'::jsonb
where exists (
  select 1
  from information_schema.tables
  where table_schema = 'public'
    and table_name = 'admin_activity_log'
);
