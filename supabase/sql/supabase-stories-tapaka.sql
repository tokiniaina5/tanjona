-- Les stories coupées : une vidéo plus longue que trente secondes entre,
-- et l'on choisit le morceau qu'on montre (trente secondes au plus) ; une
-- chanson commence là où on l'a choisi.
--
-- Le fichier n'est pas recoupé — le téléphone n'a pas de quoi réencoder une
-- vidéo. La ligne garde le début et la fin, et la visionneuse ne joue que ce
-- morceau. Le bucket accepte donc des fichiers plus lourds : 50 Mo, le
-- plafond d'envoi du projet.
--
-- À passer une fois, après supabase-stories-media.sql. Rejouable sans dommage.

update storage.buckets set file_size_limit = 52428800 where id = 'story-media';

alter table public.botika_stories
  add column if not exists video_debut real,
  add column if not exists video_fin real,
  add column if not exists hira_debut real;

alter table public.botika_stories drop constraint if exists botika_stories_tapaka_check;
alter table public.botika_stories add constraint botika_stories_tapaka_check
  check (
    (video_debut is null or video_debut >= 0)
    and (video_fin is null or (video_fin > coalesce(video_debut, 0) and video_fin - coalesce(video_debut, 0) <= 30.5))
    and (hira_debut is null or hira_debut >= 0)
  );
