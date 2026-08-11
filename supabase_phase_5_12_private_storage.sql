-- Phase 5.12 - Stockage prive ChronoTrade.
-- Objectif: bucket prive pour produits, packs et livrables projet.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'chronotrade-private-products',
  'chronotrade-private-products',
  false,
  52428800,
  array[
    'application/pdf',
    'application/zip',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain',
    'text/csv',
    'image/png',
    'image/jpeg',
    'video/mp4',
    'video/quicktime'
  ]
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Admins upload ChronoTrade private files" on storage.objects;
create policy "Admins upload ChronoTrade private files"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'chronotrade-private-products'
  and public.is_admin_user()
);

drop policy if exists "Admins update ChronoTrade private files" on storage.objects;
create policy "Admins update ChronoTrade private files"
on storage.objects for update to authenticated
using (
  bucket_id = 'chronotrade-private-products'
  and public.is_admin_user()
)
with check (
  bucket_id = 'chronotrade-private-products'
  and public.is_admin_user()
);

drop policy if exists "Admins read ChronoTrade private files" on storage.objects;
create policy "Admins read ChronoTrade private files"
on storage.objects for select to authenticated
using (
  bucket_id = 'chronotrade-private-products'
  and public.is_admin_user()
);
