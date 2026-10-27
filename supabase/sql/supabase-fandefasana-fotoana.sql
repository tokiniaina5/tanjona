-- ============================================================
-- L'envoi du soir, à l'heure et entre les dates que l'on choisit
--
-- À COLLER DANS : Supabase > SQL Editor > New query > Run. Tel quel :
-- il n'y a RIEN à remplacer. Se relance sans risque.
--
-- Remplace l'horaire fixe de supabase-fandefasana-hariva.sql (18 h) :
--   — la table « fandefasana_fikirana » garde l'heure (HH:MM, heure de
--     Madagascar) et deux dates facultatives, réglées depuis la page ;
--   — la tâche « fandefasana-hariva » passe toutes les CINQ MINUTES et
--     n'appelle la fonction que dans l'heure choisie, si rien n'est parti ce
--     jour-là (« farany_nalefa ») : hors de là, rien ne démarre (avant le
--     27/10/2026 : chaque minute, 1 440 appels par jour pour rien). La
--     fonction revérifie l'heure et les dates.
--
-- Personne n'y touche depuis le navigateur : aucune policy. La fonction
-- (clé de service) la lit et l'écrit pour le propriétaire connecté.
-- ============================================================

create table if not exists public.fandefasana_fikirana (
  id integer primary key default 1 check (id = 1),
  ora text check (ora ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  manomboka date,        -- vide : dès maintenant
  hatramin date,         -- vide : sans fin
  farany_nalefa date,    -- le dernier jour (Madagascar) où la tâche est partie
  updated_at timestamptz not null default now()
);

-- Sans heure (null), rien ne part tout seul.
alter table public.fandefasana_fikirana alter column ora drop not null;
alter table public.fandefasana_fikirana alter column ora drop default;

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
    '*/5 * * * *',
    format($ordre$
      select net.http_post(
        url := 'https://ezpsapvthujkhttbfhlr.supabase.co/functions/v1/fandefasana-hariva',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-secret-hariva', %L
        ),
        body := '{}'::jsonb
      )
      where exists (
        select 1 from public.fandefasana_fikirana f,
          lateral (select (now() at time zone 'Indian/Antananarivo') as t) m
        where f.id = 1 and f.ora is not null
          and (f.farany_nalefa is null or f.farany_nalefa < m.t::date)
          and extract(hour from m.t) * 60 + extract(minute from m.t)
              between split_part(f.ora, ':', 1)::int * 60 + split_part(f.ora, ':', 2)::int
                  and split_part(f.ora, ':', 1)::int * 60 + split_part(f.ora, ':', 2)::int + 59
      );
    $ordre$, s)
  );
end
$bloc$;

-- ---------- Vérification ----------
-- Doit renvoyer : fandefasana-hariva, */5 * * * *, true.
select jobname, schedule, active from cron.job where jobname = 'fandefasana-hariva';
select * from public.fandefasana_fikirana;
