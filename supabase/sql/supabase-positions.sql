-- ============================================================
-- Où sont les livreurs, et depuis quand
--
-- À COLLER DANS : Supabase > SQL Editor > New query > Run.
-- Se relance sans risque.
--
-- Demande d'abord "supabase-equipe.sql" et "supabase-mpiasa-lien.sql".
--
-- Une ligne par relevé. On garde l'historique plutôt qu'une seule
-- position écrasée : savoir où quelqu'un est passé explique une
-- livraison en retard mieux que de savoir seulement où il est.
--
-- Personne n'écrit ici depuis une page : ni le patron, ni le livreur.
-- C'est la fonction « mpiasa » qui inscrit, après avoir vérifié le
-- jeton — sans quoi n'importe qui placerait n'importe qui n'importe où.
-- ============================================================

create table if not exists public.positions (
  id uuid primary key default gen_random_uuid(),

  owner_email text not null,
  equipe_id uuid not null references public.equipe(id) on delete cascade,

  -- Degrés décimaux, comme les rend le téléphone.
  lat double precision not null,
  lng double precision not null,

  -- Le rayon d'incertitude en mètres, tel que l'appareil l'annonce. Une
  -- position à cinquante mètres près et une à trois kilomètres près ne se
  -- lisent pas de la même façon : sans ce nombre, on les confondrait.
  precision_m double precision,

  at timestamptz not null default now()
);

-- On cherche toujours la dernière d'une personne.
create index if not exists positions_equipe_idx
  on public.positions (equipe_id, at desc);

-- Et, pour la carte : les dernières de tout le monde.
create index if not exists positions_owner_idx
  on public.positions (owner_email, at desc);

alter table public.positions enable row level security;

-- Le patron lit les siennes. Aucune policy d'écriture : seule la clé de
-- service, qui ne quitte jamais le serveur, inscrit une position.
drop policy if exists "positions lecture proprietaire" on public.positions;
create policy "positions lecture proprietaire"
  on public.positions for select to authenticated
  using (lower(owner_email) = lower(auth.jwt() ->> 'email'));

-- ---------- Vérification ----------
select column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'positions'
order by ordinal_position;
