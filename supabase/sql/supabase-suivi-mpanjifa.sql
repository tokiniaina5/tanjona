-- ============================================================
-- Le client suit sa livraison — et la clé de la carte se pose une fois
--
-- À COLLER DANS : Supabase > SQL Editor > New query > Run.
-- Se relance sans risque.
--
-- Demande d'abord "supabase-equipe.sql", "supabase-mpiasa-lien.sql"
-- et "supabase-positions.sql".
-- ============================================================

-- ---------- Le jeton d'une livraison ----------
-- Ce que le client reçoit par SMS. Il ne donne accès qu'à SA course :
-- ce qu'on lui apporte, où en est le livreur, et rien d'autre. Ni le
-- stock, ni les autres clients, ni les autres livreurs.
--
-- Il naît vide et ne se remplit que le jour où le patron décide de
-- partager : une livraison sans jeton n'a aucun lien qui la montre.
alter table public.livraisons add column if not exists jeton text;

-- Deux courses ne peuvent pas porter le même jeton, sans quoi un lien
-- montrerait tantôt l'une, tantôt l'autre. Les livraisons sans jeton,
-- elles, sont innombrables — d'où le "where".
create unique index if not exists livraisons_jeton_idx
  on public.livraisons (jeton) where jeton is not null;

-- ---------- Les réglages du compte ----------
-- Une ligne par commerçant. Pour l'instant elle ne porte qu'une chose :
-- la clé Google Maps.
--
-- Elle était rangée dans le navigateur, et n'y servait qu'à lui : le
-- téléphone du patron ne l'avait pas, et le client qui suit sa livraison
-- ne l'aurait jamais eue. Ici elle est au compte, donc partout.
--
-- Cette clé est faite pour être publique — elle part dans la page de
-- chaque visiteur, c'est ainsi que fonctionne Google Maps. Ce qui la
-- protège n'est pas le secret mais la restriction de domaine, posée
-- dans la console Google.
create table if not exists public.reglages (
  owner_email text primary key,
  cle_maps text,
  maj timestamptz not null default now()
);

alter table public.reglages enable row level security;

drop policy if exists "reglages lecture proprietaire" on public.reglages;
create policy "reglages lecture proprietaire"
  on public.reglages for select to authenticated
  using (lower(owner_email) = lower(auth.jwt() ->> 'email'));

drop policy if exists "reglages ecriture proprietaire" on public.reglages;
create policy "reglages ecriture proprietaire"
  on public.reglages for insert to authenticated
  with check (lower(owner_email) = lower(auth.jwt() ->> 'email'));

drop policy if exists "reglages modification proprietaire" on public.reglages;
create policy "reglages modification proprietaire"
  on public.reglages for update to authenticated
  using (lower(owner_email) = lower(auth.jwt() ->> 'email'))
  with check (lower(owner_email) = lower(auth.jwt() ->> 'email'));

-- ---------- Vérification ----------
select 'livraisons.jeton' as objet,
       count(*) filter (where column_name = 'jeton') as present
from information_schema.columns
where table_schema = 'public' and table_name = 'livraisons'
union all
select 'table reglages',
       count(*)
from information_schema.tables
where table_schema = 'public' and table_name = 'reglages';
