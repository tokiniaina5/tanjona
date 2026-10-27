-- ============================================================
-- Sary sy video alefa ao amin'ny resaka mivantana (live.js, boaty resaka)
--
-- À COLLER DANS : Supabase > SQL Editor > New query > Run.
-- Se relance sans risque.
--
-- Ny resaka dia mandeha amin'ny broadcast (tsy voatahiry) ; ny rakitra kosa
-- lehibe loatra ho an'ny broadcast, ka apetraka eto ary ny rohiny no
-- alefa. Ny mpitsidika tsy niditra (anon) dia mandefa koa, toy ny
-- « annonce-video » : voafetra ho sary, video ary feo voarakitra (🎤,
-- 27/10/2026), 25 Mo isaky ny rakitra.
-- ============================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('resaka-media', 'resaka-media', true, 26214400,
  array['image/jpeg','image/png','image/webp','image/gif',
        'video/mp4','video/webm','video/quicktime','video/ogg',
        'audio/webm','audio/ogg','audio/mp4','audio/mpeg','audio/aac','audio/wav','audio/x-m4a'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "resaka media depot" on storage.objects;
create policy "resaka media depot"
  on storage.objects for insert
  to anon, authenticated
  with check (bucket_id = 'resaka-media');

drop policy if exists "resaka media lecture" on storage.objects;
create policy "resaka media lecture"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'resaka-media');
