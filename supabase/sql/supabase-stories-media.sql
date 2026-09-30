-- Les stories en vidéo, et la musique qu'on pose sur une photo ou une vidéo.
--
-- Une photo reste dans la ligne (« data: », réduite). Une vidéo et une
-- chanson pèsent trop : elles vont dans le bucket « story-media », rangées
-- sous le dossier de leur auteur, et la ligne n'en garde que l'adresse.
--
-- Garde-fous tenus par le serveur :
--   — 30 Mo par fichier, et seulement des vidéos ou des sons ;
--   — chacun ne dépose et n'efface que dans son propre dossier ;
--   — la ligne n'accepte comme média qu'une photo « data: » ou une adresse de
--     ce bucket : pas de lien vers n'importe où.
--
-- À passer une fois, après supabase-stories.sql. Rejouable sans dommage.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'story-media', 'story-media', true, 31457280,
  array['video/mp4', 'video/webm', 'video/quicktime', 'video/ogg',
        'audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/aac', 'audio/x-m4a', 'audio/ogg', 'audio/wav', 'audio/webm']
)
on conflict (id) do update set
  public = true,
  file_size_limit = 31457280,
  allowed_mime_types = array['video/mp4', 'video/webm', 'video/quicktime', 'video/ogg',
        'audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/aac', 'audio/x-m4a', 'audio/ogg', 'audio/wav', 'audio/webm'];

drop policy if exists "story media lecture" on storage.objects;
create policy "story media lecture" on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'story-media');

drop policy if exists "story media depot" on storage.objects;
create policy "story media depot" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'story-media' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "story media fafana" on storage.objects;
create policy "story media fafana" on storage.objects
  for delete to authenticated
  using (bucket_id = 'story-media' and (storage.foldername(name))[1] = auth.uid()::text);

alter table public.botika_stories
  add column if not exists genre text not null default 'sary',
  add column if not exists hira text,
  add column if not exists hira_nom text;

alter table public.botika_stories drop constraint if exists botika_stories_genre_check;
alter table public.botika_stories add constraint botika_stories_genre_check
  check (genre in ('sary', 'video'));

alter table public.botika_stories drop constraint if exists botika_stories_media_source;
alter table public.botika_stories add constraint botika_stories_media_source
  check (
    (genre = 'sary' and media like 'data:image/%')
    or (genre = 'video' and media like 'https://ezpsapvthujkhttbfhlr.supabase.co/storage/v1/object/public/story-media/%')
  );

alter table public.botika_stories drop constraint if exists botika_stories_hira_source;
alter table public.botika_stories add constraint botika_stories_hira_source
  check (hira is null or hira like 'https://ezpsapvthujkhttbfhlr.supabase.co/storage/v1/object/public/story-media/%');

alter table public.botika_stories drop constraint if exists botika_stories_hira_nom_check;
alter table public.botika_stories add constraint botika_stories_hira_nom_check
  check (hira_nom is null or length(hira_nom) <= 120);
