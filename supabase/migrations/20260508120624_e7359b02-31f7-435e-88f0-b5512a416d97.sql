insert into storage.buckets (id, name, public) values ('tutorial-videos', 'tutorial-videos', true) on conflict (id) do update set public = true;

create policy "Tutorial videos are publicly readable"
on storage.objects for select
using (bucket_id = 'tutorial-videos');