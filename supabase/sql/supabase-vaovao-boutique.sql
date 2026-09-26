-- ============================================================
-- Les quatre publications du jour, toutes seules
--
-- À COLLER DANS : Supabase > SQL Editor > New query > Run.
-- À passer APRÈS avoir déployé la fonction "vaovao-boutique" et posé son
-- secret. Se relance sans risque.
--
-- Le fil ne vivait que de ce que les gens y écrivaient : les jours où
-- personne n'écrivait, il ne disait rien. La maison y prend maintenant la
-- parole quatre fois par jour, et parle des boutiques d'achats
-- internationaux — une boutique par billet, avec ce que le site publie
-- lui-même pour être partagé.
--
-- QUATRE HEURES, ET NON QUATRE D'UN COUP. Chaque passage écrit UN billet.
-- Quatre publiées ensemble le matin rempliraient le fil d'un bloc et le
-- laisseraient muet jusqu'au lendemain — ce qui est exactement ce qu'on
-- cherche à éviter.
--
-- L'HEURE EST CELLE D'UTC, pas celle de Madagascar, qui est en avance de
-- trois heures. 5, 9, 13 et 17 heures UTC font donc 8 h, midi, 16 h et 20 h
-- à Antananarivo : le matin, le déjeuner, l'après-midi et le soir.
--
-- AVANT DE COLLER, remplacez VOTRE_SECRET_ICI par le secret que vous avez
-- posé dans VAOVAO_SECRET. Il vit ensuite dans la définition de la tâche,
-- lisible par qui a accès à cette base — c'est-à-dire vous.
--
-- Si "create extension" est refusé, activez pg_cron et pg_net depuis
-- Database > Extensions, puis relancez ce script sans les deux premières
-- lignes.
-- ============================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Une tâche du même nom ne se crée pas deux fois : on retire l'ancienne
-- avant de poser la nouvelle, pour que ce script se relance sans empiler.
do $$
begin
  perform cron.unschedule('vaovao-boutique-quatre-fois');
exception when others then
  null;  -- elle n'existait pas : il n'y a rien à retirer.
end $$;

select cron.schedule(
  'vaovao-boutique-quatre-fois',
  '0 5,9,13,17 * * *',
  $ordre$
  select net.http_post(
    url := 'https://ezpsapvthujkhttbfhlr.supabase.co/functions/v1/vaovao-boutique',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-secret-vaovao', 'VOTRE_SECRET_ICI'
    ),
    body := '{}'::jsonb
  );
  $ordre$
);

-- ---------- Vérification ----------
-- Doit renvoyer une ligne : la tâche, active, et son horaire.
select jobname, schedule, active
from cron.job
where jobname = 'vaovao-boutique-quatre-fois';

-- Ce qu'elle a donné, une fois qu'elle sera passée (vide au début) :
-- select d.status, d.return_message, d.start_time
-- from cron.job_run_details d
-- join cron.job j on j.jobid = d.jobid
-- where j.jobname = 'vaovao-boutique-quatre-fois'
-- order by d.start_time desc limit 10;
--
-- Cela ne dit que « l'ordre est parti ». Ce que la fonction a RÉPONDU :
-- select status_code, content, created
-- from net._http_response
-- order by created desc limit 10;

-- Les billets qu'elle a écrits :
-- select created_at, message, link from public.client_news
-- where client_name = 'Ny asako'
-- order by created_at desc limit 20;

-- Pour changer d'horaire : repassez ce script avec d'autres heures dans
-- '0 5,9,13,17 * * *'. Pour en faire deux par jour, laissez-en deux.

-- Pour l'arrêter un jour :
-- select cron.unschedule('vaovao-boutique-quatre-fois');
