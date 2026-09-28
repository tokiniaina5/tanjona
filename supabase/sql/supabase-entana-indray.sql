-- ============================================================
-- Les articles pas encore vendus reviennent en tête de la Botika,
-- tous les deux jours
--
-- À COLLER DANS : Supabase > SQL Editor > New query > Run. Tel quel :
-- il n'y a RIEN à remplacer. Se relance sans risque : la fonction se
-- remplace, et la tâche se retire avant d'être reposée.
--
-- CE QUI EST « PAS ENCORE VENDU ». Le stock vit dans l'appareil, la base
-- ne sait pas ce qu'il en reste. Mais l'annonce d'un article s'efface
-- d'elle-même le jour où il est épuisé ou retiré du stock
-- (« retirerLesBillets », gestion-stockage-js/stock.js). Une annonce
-- « entana » attachée à un article (item_id) et toujours en ligne, c'est
-- donc une marchandise qu'on a encore à vendre.
--
-- CE QU'ON NE TOUCHE PAS. Une annonce mise à la corbeille (deleted_at) :
-- quelqu'un l'a retirée du fil exprès, elle n'y revient pas toute seule.
-- Les nouvelles ordinaires et les directs non plus : seuls les articles.
--
-- REPUBLIER, C'EST REDATER. Le billet garde ses photos, ses commentaires et
-- ses « j'aime » ; seule sa date passe à maintenant. Il remonte ainsi en
-- tête du fil et de la vitrine (triés par created_at, botika/index.html),
-- et le ménage des trente jours (supabase-menage-publications.sql) ne
-- l'emporte plus tant que l'article est en vente. Il repart aussi dans
-- l'envoi du soir (fandefasana-hariva), qui prend ce qui a paru dans la
-- journée : c'est une publication du jour comme une autre.
--
-- L'HEURE EST CELLE D'UTC : 5 h UTC font 8 h à Antananarivo. La tâche passe
-- chaque matin, mais un billet ne remonte que s'il a au moins deux jours.
-- « 47 heures » et non « 2 days » : la tâche démarre à quelques secondes
-- près, et un billet redaté à 8 h 00 min 03 s il y a deux jours n'aurait
-- pas tout à fait ses 48 heures à 8 h 00 min 01 s — il attendrait un jour
-- de plus.
--
-- Si "create extension" est refusé, activez pg_cron depuis
-- Database > Extensions, puis relancez ce script sans la première ligne.
-- ============================================================

create extension if not exists pg_cron;

-- « security definer » : la table ne laisse modifier un billet qu'à son
-- auteur, et la tâche n'est l'auteur de rien.
create or replace function public.entana_avoaka_indray()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $indray$
declare
  isa integer;
begin
  update public.client_news
  set created_at = now()
  where type = 'entana'
    and item_id is not null
    and deleted_at is null
    and created_at is not null
    and created_at < now() - interval '47 hours';
  get diagnostics isa = row_count;
  return isa;
end;
$indray$;

-- Elle ne doit s'appeler que depuis la tâche, jamais depuis une page.
revoke execute on function public.entana_avoaka_indray() from public;
revoke execute on function public.entana_avoaka_indray() from anon;
revoke execute on function public.entana_avoaka_indray() from authenticated;

do $$
begin
  perform cron.unschedule('entana-avoaka-indray');
exception when others then
  null;  -- elle n'existait pas : il n'y a rien à retirer.
end $$;

select cron.schedule(
  'entana-avoaka-indray',
  '0 5 * * *',
  $ordre$ select public.entana_avoaka_indray(); $ordre$
);

-- ---------- Vérification ----------
-- Doit renvoyer une ligne : entana-avoaka-indray, 0 5 * * *, true.
select jobname, schedule, active from cron.job where jobname = 'entana-avoaka-indray';

-- Ce qui remonterait maintenant, sans rien changer :
-- select id, client_name, left(message, 60), created_at
-- from public.client_news
-- where type = 'entana' and item_id is not null and deleted_at is null
--   and created_at < now() - interval '47 hours';

-- Pour le faire tout de suite, sans attendre le matin (renvoie le nombre) :
-- select public.entana_avoaka_indray();

-- Ce que la tâche a donné :
-- select d.status, d.return_message, d.start_time
-- from cron.job_run_details d
-- join cron.job j on j.jobid = d.jobid
-- where j.jobname = 'entana-avoaka-indray'
-- order by d.start_time desc limit 10;

-- Pour l'arrêter un jour :
-- select cron.unschedule('entana-avoaka-indray');
