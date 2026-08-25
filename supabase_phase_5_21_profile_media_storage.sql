-- Phase 5.21 - Stockage public des medias de profil ChronoTrade.
-- Objectif: permettre aux utilisateurs connectes d'importer avatar et banniere.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'chronotrade-profile-media',
  'chronotrade-profile-media',
  true,
  5242880,
  array['image/png','image/jpeg','image/webp','image/gif']::text[]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public reads ChronoTrade profile media" on storage.objects;
create policy "Public reads ChronoTrade profile media"
on storage.objects for select
to anon, authenticated
using (bucket_id = 'chronotrade-profile-media');

drop policy if exists "Users upload own ChronoTrade profile media" on storage.objects;
create policy "Users upload own ChronoTrade profile media"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'chronotrade-profile-media'
  and ((select auth.uid())::text = split_part(name, '/', 1) or public.is_admin_user())
);

drop policy if exists "Users update own ChronoTrade profile media" on storage.objects;
create policy "Users update own ChronoTrade profile media"
on storage.objects for update
to authenticated
using (
  bucket_id = 'chronotrade-profile-media'
  and ((select auth.uid())::text = split_part(name, '/', 1) or public.is_admin_user())
)
with check (
  bucket_id = 'chronotrade-profile-media'
  and ((select auth.uid())::text = split_part(name, '/', 1) or public.is_admin_user())
);

drop policy if exists "Users delete own ChronoTrade profile media" on storage.objects;
create policy "Users delete own ChronoTrade profile media"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'chronotrade-profile-media'
  and ((select auth.uid())::text = split_part(name, '/', 1) or public.is_admin_user())
);
