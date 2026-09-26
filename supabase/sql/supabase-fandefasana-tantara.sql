-- ============================================================
-- Qui a reçu les publications du jour : le carnet des envois
--
-- À COLLER DANS : Supabase > SQL Editor > New query > Run. Tel quel :
-- il n'y a RIEN à remplacer. Se relance sans risque.
--
-- La fonction "fandefasana-hariva" y écrit une ligne à chaque envoi — la
-- tâche de 18 h comme le bouton « Alefa izao » — avec la liste des clients
-- à qui le message est parti. La page du propriétaire la relit pour
-- afficher « lasa tany amin'iza ».
--
-- Personne n'y lit ni n'y écrit depuis le navigateur : aucune policy. Seule
-- la fonction (clé de service) y touche, et elle ne rend le carnet qu'au
-- propriétaire connecté.
-- ============================================================

create table if not exists public.fandefasana_tantara (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),

  -- 'hariva' : la tâche de 18 h ; 'bokotra' : le bouton « Alefa izao ».
  loharano text not null,

  billets integer not null default 0,
  sujet text,

  -- [{ "email": "...", "name": "..." }, ...] : ceux à qui c'est parti.
  voaray jsonb not null default '[]'::jsonb,
  -- Ceux dont le paquet a échoué (erreur SMTP en cours de route).
  tsy_lasa jsonb not null default '[]'::jsonb,

  fahadisoana text
);

create index if not exists fandefasana_tantara_date_idx
  on public.fandefasana_tantara (created_at desc);

alter table public.fandefasana_tantara enable row level security;

-- ---------- Vérification ----------
-- Doit renvoyer les colonnes de la table.
select column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'fandefasana_tantara'
order by ordinal_position;

-- ---------- Ajout : ce que les réseaux ont répondu ----------
-- { "telegram": { "ok": true, "detail": "lasa" }, "x": { "ok": false, ... } }
alter table public.fandefasana_tantara add column if not exists tambajotra jsonb;
