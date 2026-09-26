-- ============================================================
-- La vidéo d'une annonce
--
-- À COLLER DANS : Supabase > SQL Editor > New query > Run.
-- Se relance sans risque.
--
-- Les photos d'une annonce vivent dans la ligne elle-même, en « data: » :
-- réduites à 900 px et compressées, elles pèsent cent kilo-octets et le fil
-- les emporte avec lui. Une vidéo, non. Dix secondes filmées au téléphone
-- font quinze méga-octets, vingt en base64, et le fil charge trente billets
-- d'un coup : il ne s'ouvrirait plus.
--
-- La vidéo va donc dans un bucket, et la ligne n'en garde que l'adresse.
-- Le navigateur ne la télécharge que si on la regarde.
--
-- Le bucket est public : une annonce est faite pour être vue, et ses
-- lecteurs n'ont pas tous un compte — celui qui essaie l'application les
-- premiers jours n'en a pas encore. Deux garde-fous tiennent la porte, et
-- c'est le serveur qui les applique, pas la page :
--   — 25 Mo par fichier, refusés au-delà ;
--   — les seuls types vidéo, rien d'autre.
-- ============================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'annonce-video', 'annonce-video', true, 26214400,
  array['video/mp4', 'video/webm', 'video/ogg', 'video/quicktime']
)
on conflict (id) do update set
  public = true,
  file_size_limit = 26214400,
  allowed_mime_types = array['video/mp4', 'video/webm', 'video/ogg', 'video/quicktime'];

-- ---------- Qui touche à quoi ----------
-- Lecture : tout le monde. Un bucket public se lit déjà sans clé par son
-- adresse ; la policy sert à ce que la page puisse aussi lister ce qu'elle a
-- déposé, sans quoi l'envoi se termine sur une erreur trompeuse.
drop policy if exists "annonce video lecture" on storage.objects;
create policy "annonce video lecture"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'annonce-video');

-- Dépôt : tout le monde aussi, comme pour la table des annonces
-- (client_news) — celui qui publie n'a pas forcément de compte. La taille et
-- le type, eux, sont tenus par le bucket lui-même.
drop policy if exists "annonce video depot" on storage.objects;
create policy "annonce video depot"
  on storage.objects for insert
  to anon, authenticated
  with check (bucket_id = 'annonce-video');

-- Ni remplacement ni suppression depuis le navigateur : une vidéo déposée
-- appartient à l'annonce qui la porte, et personne ne doit pouvoir effacer
-- celle d'un autre en connaissant son adresse. Le ménage se fait depuis le
-- tableau de bord Supabase, avec la clé de service.

-- ---------- Vérification ----------
-- Doit renvoyer une ligne : le bucket, public, plafonné à 25 Mo.
select id, public, file_size_limit, allowed_mime_types
from storage.buckets
where id = 'annonce-video';

-- Doit renvoyer les deux policies ci-dessus.
select policyname, cmd
from pg_policies
where schemaname = 'storage' and tablename = 'objects'
  and policyname like 'annonce video%'
order by policyname;
