-- Make the vault-images bucket public so AI-generated card images render.
update storage.buckets set public = true where id = 'vault-images';

-- Ensure public read access to objects in the vault-images bucket.
drop policy if exists "Public read for vault-images" on storage.objects;
create policy "Public read for vault-images"
on storage.objects
for select
to public
using (bucket_id = 'vault-images');