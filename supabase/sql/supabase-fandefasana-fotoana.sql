-- ============================================================
-- L'envoi du soir, à l'heure et entre les dates que l'on choisit
--
-- À COLLER DANS : Supabase > SQL Editor > New query > Run. Tel quel :
-- il n'y a RIEN à remplacer. Se relance sans risque.
--
-- Remplace l'horaire fixe de supabase-fandefasana-hariva.sql (18 h) :
--   — la table « fandefasana_fikirana » garde l'heure (HH:MM, heure de
--     Madagascar) et deux dates facultatives, réglées depuis la page ;
--   — la tâche « fandefasana-hariva » passe désormais CHAQUE MINUTE ; la
--     fonction ne part que si c'est l'heure, entre les dates, et pas déjà
--     partie ce jour-là (« farany_nalefa »).
--
-- Personne n'y touche depuis le navigateur : aucune policy. La fonction
-- (clé de service) la lit et l'écrit pour le propriétaire connecté.
-- ============================================================

create table if not exists public.fandefasana_fikirana (
  id integer primary key default 1 check (id = 1),
  ora text not null default '18:00' check (ora ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  manomboka date,        -- vide : dès maintenant
  hatramin date,         -- vide : sans fin
  farany_nalefa date,    -- le dernier jour (Madagascar) où la tâche est partie
  updated_at timestamptz not null default now()
);

insert into public.fandefasana_fikirana (id) values (1) on conflict (id) do nothing;

alter table public.fandefasana_fikirana enable row level security;

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
    null;
  end;

  perform cron.schedule(
    'fandefasana-hariva',
    '* * * * *',
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
-- Doit renvoyer : fandefasana-hariva, * * * * *, true.
select jobname, schedule, active from cron.job where jobname = 'fandefasana-hariva';
select * from public.fandefasana_fikirana;
