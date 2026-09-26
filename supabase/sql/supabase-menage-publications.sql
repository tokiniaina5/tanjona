-- ============================================================
-- Effacer les publications du fil passé un mois, chaque nuit
--
-- À COLLER DANS : Supabase > SQL Editor > New query > Run.
-- Se relance sans risque : la fonction se remplace, et la tâche se retire
-- avant d'être reposée.
--
-- Rien n'effaçait les billets du fil : ils restaient en base pour toujours,
-- avec leurs commentaires et leurs « j'aime », longtemps après que plus
-- personne ne les regarde. Ils s'entassaient sans fin.
--
-- Désormais ils s'en vont pour de bon au bout d'un mois : ce qui n'est plus
-- montré n'est plus gardé.
--
-- UN MOIS COMPTÉ EN TRENTE JOURS, et non en mois du calendrier. C'est la
-- fenêtre exacte que demande « botika/index.html » (30 × 24 × 60 × 60 ×
-- 1000) : un « interval '1 month' » durerait 31 jours en janvier et 28 en
-- février, et la page montrerait alors des billets déjà effacés — des trous
-- dans le fil. Trente jours des deux côtés, ou rien.
--
-- CE QUI PART AVEC LE BILLET. Les commentaires et les « j'aime » portent
-- « on delete cascade » vers client_news : ils s'effacent d'eux-mêmes avec
-- lui, et il n'y a rien à faire pour eux ici. La vidéo d'une annonce, elle,
-- vit dans le bucket « annonce-video » et non dans la base : c'est
-- "supabase-menage-video.sql" qui l'emporte, et il faut lui donner le même
-- âge — voir plus bas.
--
-- LE CHIFFRE SE TIENT EN TROIS ENDROITS. Trente jours ici, trente jours
-- dans « botika/index.html », trente jours pour la fonction
-- « menage-video » — qui les prend maintenant par défaut, mais qu'il faut
-- redéployer pour qu'elle les connaisse :
--     supabase functions deploy menage-video --no-verify-jwt
-- Et si le secret RETENTION_JOURS a été posé un jour à la main, il prime
-- sur ce défaut : reposez-le à 30.
--     supabase secrets set RETENTION_JOURS=30
-- Sans cela, les vidéos partent à sept jours pendant que le billet en vit
-- trente : entre les deux, l'annonce reste affichée avec une vidéo qui ne
-- charge plus.
--
-- L'Accueil, lui, n'en montre que sept jours (« renderCommunityNews », dans
-- gestion-stockage-js/parametres.js). C'est voulu et sans danger : montrer
-- MOINS que ce qu'on garde ne laisse aucun trou. L'inverse en laisserait.
--
-- SANS DATE, ON NE TOUCHE PAS. Un billet dont created_at est vide n'est
-- daté de rien : on ne peut pas dire s'il a un mois ou une minute, et l'on
-- n'efface pas ce qu'on ne sait pas dater. La vérification, plus bas, dit
-- s'il en existe ; c'est à regarder à la main.
--
-- Si "create extension" est refusé, activez pg_cron depuis
-- Database > Extensions, puis relancez ce script sans la première ligne.
-- ============================================================

create extension if not exists pg_cron;

-- Le ménage lui-même. Une fonction et non un ordre écrit dans la tâche :
-- on peut l'essayer à la main avant de la laisser courir, et le jour où la
-- durée change, elle ne change qu'ici.
--
-- « security definer » parce qu'elle efface : la table refuse toute
-- suppression venue du navigateur, et c'est voulu — personne ne doit
-- pouvoir effacer le billet d'un autre. Elle agit donc au nom de son
-- propriétaire, pas au nom de qui l'appelle.
create or replace function public.menage_publications()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $menage$
declare
  effaces integer;
begin
  delete from public.client_news
  where created_at is not null
    and created_at < now() - interval '30 days';
  get diagnostics effaces = row_count;
  return effaces;
end;
$menage$;

-- Une fonction est ouverte à tous par défaut. Celle-ci efface : elle ne
-- doit s'appeler que depuis la tâche de nuit, jamais depuis une page.
revoke execute on function public.menage_publications() from public;
revoke execute on function public.menage_publications() from anon;
revoke execute on function public.menage_publications() from authenticated;

-- Une tâche du même nom ne se crée pas deux fois : on retire l'ancienne
-- avant de poser la nouvelle, pour que ce script se relance sans empiler.
do $$
begin
  perform cron.unschedule('menage-publications-quotidien');
exception when others then
  null;  -- elle n'existait pas : il n'y a rien à retirer.
end $$;

-- Chaque nuit à 3 h 10 (heure UTC), soit 6 h 10 à Antananarivo. Dix minutes
-- après le ménage des vidéos : les deux ne se gênent pas, mais deux tâches
-- à la même minute rendent illisible ce qu'on lit ensuite dans le journal.
-- Rien ne presse, du reste : un billet de trente et un jours qui reste une
-- nuit de plus ne se voit nulle part.
select cron.schedule(
  'menage-publications-quotidien',
  '10 3 * * *',
  $ordre$ select public.menage_publications(); $ordre$
);

-- ---------- Vérification ----------
-- Doit renvoyer une ligne : la tâche, active, et son horaire.
select jobname, schedule, active
from cron.job
where jobname = 'menage-publications-quotidien';

-- Ce qui partirait maintenant, sans rien effacer :
-- select count(*) from public.client_news
-- where created_at is not null and created_at < now() - interval '30 days';

-- Les billets sans date, que le ménage laisse et que le fil ne montre pas :
-- select id, client_name, message from public.client_news
-- where created_at is null;

-- Pour passer le ménage tout de suite, sans attendre la nuit. Renvoie le
-- nombre de billets effacés :
-- select public.menage_publications();

-- Ce que la tâche a donné, une fois qu'elle sera passée (vide au début) :
-- select d.status, d.return_message, d.start_time
-- from cron.job_run_details d
-- join cron.job j on j.jobid = d.jobid
-- where j.jobname = 'menage-publications-quotidien'
-- order by d.start_time desc limit 10;

-- Pour changer la durée : le chiffre est dans la fonction ci-dessus, et
-- dans les deux autres endroits nommés en tête de ce fichier. Les trois
-- ensemble, ou aucun.

-- Pour l'arrêter un jour :
-- select cron.unschedule('menage-publications-quotidien');
