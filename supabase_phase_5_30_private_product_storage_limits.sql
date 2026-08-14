-- Phase 5.30 - Limites de stockage des fichiers produits prives.
-- Le bucket reste prive. Les clients passent par /api/library/download pour obtenir une URL signee.

update storage.buckets
set
  public = false,
  file_size_limit = 104857600,
  allowed_mime_types = array[
    'application/pdf',
    'application/zip',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain',
    'text/csv',
    'image/png',
    'image/jpeg',
    'image/webp',
    'video/mp4',
    'video/quicktime'
  ]::text[]
where id = 'chronotrade-private-products';
