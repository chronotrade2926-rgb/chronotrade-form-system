-- ChronoTrade Phase 5.9 - Global site settings
-- Date: 2026-08-09
-- Purpose: centralize editable brand, social, footer and public configuration.

create table if not exists public.site_settings (
  setting_key text primary key,
  label text,
  value jsonb not null default '{}'::jsonb,
  status text not null default 'active' check (status in ('active', 'draft', 'archived')),
  updated_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'site_settings' and column_name = 'key'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'site_settings' and column_name = 'setting_key'
  ) then
    alter table public.site_settings rename column key to setting_key;
  end if;
end $$;

alter table public.site_settings add column if not exists label text;
alter table public.site_settings add column if not exists status text not null default 'active';
alter table public.site_settings add column if not exists updated_by uuid references public.users(id) on delete set null;
alter table public.site_settings add column if not exists created_at timestamptz not null default now();
update public.site_settings set label = coalesce(label, setting_key), status = coalesce(status, 'active');
alter table public.site_settings alter column label set not null;

alter table public.site_settings enable row level security;

grant select on public.site_settings to anon, authenticated;
grant select, insert, update, delete on public.site_settings to authenticated;

drop policy if exists public_reads_active_site_settings on public.site_settings;
create policy public_reads_active_site_settings
on public.site_settings
for select
to anon, authenticated
using (status = 'active');

drop policy if exists admins_manage_site_settings on public.site_settings;
create policy admins_manage_site_settings
on public.site_settings
for all
to authenticated
using (public.is_admin_user())
with check (public.is_admin_user());

insert into public.site_settings(setting_key, label, value, status)
values
  ('brand', 'Marque', '{"name":"ChronoTrade","tagline":"Plateforme de solutions numeriques","description":"Un besoin. Une solution numerique adaptee.","email":"flo.chronotrade@outlook.fr","logo":"/assets/chronotrade-logo.png"}'::jsonb, 'active'),
  ('social', 'Reseaux sociaux', '{"facebook":"https://www.facebook.com/share/1BNfi56xCA/?mibextid=wwXIfr","instagram":"https://www.instagram.com/chronotrade.officiel/","tiktok":"https://www.tiktok.com/@chrono.trade0","youtube":"https://www.youtube.com/@chrono.trade0","googleBusiness":"https://www.google.com/search?q=ChronoTrade&stick=H4sIAAAAAAAA_-NgU1I1qDAxMDMzM002Mk00Skw2SrW0MqiwSE4zMk5OskyxtDRJSk5MXcTK7ZxRlJ-XH1KUmJIKAEWe0Vw3AAAA&hl=en-GB&mat=CTspJ23EUm1vElcBa0lj_9drynJWHP_mInqOnE3FOgciqrOI6NsRrc3ucF-NBEohPBpBLGqcJlkTjF8ipfyCty-pMVgqLsuXWbCJDnNJr2HF_ufTz3iVOEM9NnnmWnzK9sA&authuser=1&ved=2ahUKEwipp_6nj4-WAxU_TqQEHdF_FBQQ-MgIegQIDxAh","googleReviewUrl":"https://g.page/r/Ca68lNm5PPKMEBI/review"}'::jsonb, 'active'),
  ('footer', 'Footer', '{"note":"Liens publics geres par ChronoTrade. Les URLs sociales exactes restent modifiables depuis le super-admin."}'::jsonb, 'active')
on conflict (setting_key) do update set
  label = excluded.label,
  value = public.site_settings.value || excluded.value,
  status = excluded.status,
  updated_at = now();
