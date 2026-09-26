-- ============================================================
-- Les publications du jour, chez tous les clients, chaque soir à 18 h
--
-- À COLLER DANS : Supabase > SQL Editor > New query > Run. Tel quel :
-- il n'y a RIEN à remplacer. Se relance sans risque.
--
-- Le secret est celui que la tâche des boutiques utilise déjà
-- (« vaovao-boutique-quatre-fois ») : on le reprend de sa définition, et la
-- fonction "fandefasana-hariva" accepte ce même secret (VAOVAO_SECRET).
--
-- L'HEURE EST CELLE D'UTC : Madagascar a trois heures d'avance. 15 h UTC
-- font donc 18 h à Antananarivo.
-- ============================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

do $bloc$
declare
  s text;
begin
  select substring(command from $r$'x-secret-vaovao',\s*'([^']+)'$r$) into s
  from cron.job where jobname = 'vaovao-boutique-quatre-fois';
  if s is null then
    raise exception 'Tsy hita ny tâche vaovao-boutique-quatre-fois : alefaso aloha supabase-vaovao-boutique.sql.';
  end if;

  begin
    perform cron.unschedule('fandefasana-hariva');
  exception when others then
    null;  -- elle n'existait pas : il n'y a rien à retirer.
  end;

  perform cron.schedule(
    'fandefasana-hariva',
    '0 15 * * *',
    format($ordre$
      select net.http_post(
        url := 'https://ezpsapvthujkhttbfhlr.supabase.co/functions/v1/fandefasana-hariva',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-secret-hariva', %L
        ),
        body := '{}'::jsonb
      );
    $ordre$, s)
  );
end
$bloc$;

-- ---------- Vérification ----------
-- Doit renvoyer une ligne : fandefasana-hariva, 0 15 * * *, true.
select jobname, schedule, active from cron.job where jobname = 'fandefasana-hariva';

-- Ce que la fonction a répondu, une fois passée :
-- select status_code, content, created from net._http_response
-- order by created desc limit 10;

-- Pour l'arrêter un jour :
-- select cron.unschedule('fandefasana-hariva');
