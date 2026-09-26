-- ============================================================
-- Les notifications de la boutique, partagées entre le patron et ses employés
--
-- À COLLER DANS : Supabase > SQL Editor > New query > Run.
-- Se relance sans risque.
--
-- Demande d'abord "supabase-equipe.sql".
--
-- Chaque téléphone garde ses notifications pour lui. Celles-ci, non : une
-- sortie de stock, un article épuisé, l'argent qui entre ou sort du
-- portefeuille, un direct qui commence. Ce qui arrive chez l'un se sait
-- chez les autres — le patron voit ce que font ses employés, et eux ce que
-- fait le patron.
--
-- Le patron écrit et lit ici avec son compte. L'employé n'a pas de compte :
-- c'est la fonction « mpiasa » qui écrit et lit pour lui, au nom du patron
-- que désigne son jeton.
-- ============================================================

create table if not exists public.notifications_boutique (
  id uuid primary key default gen_random_uuid(),

  -- La boutique : l'email du patron, comme partout ailleurs.
  owner_email text not null,

  -- Qui l'a fait. Vide : le patron lui-même. Sinon l'employé — son nom est
  -- recopié, pour que la notification dise encore de qui elle vient une
  -- fois la personne retirée du registre.
  auteur_id uuid references public.equipe(id) on delete set null,
  auteur_nom text,

  -- 'sortie' · 'rupture' · 'parrainage' (portefeuille) · 'live'
  type text not null check (type in ('sortie', 'rupture', 'parrainage', 'live')),
  message text not null check (char_length(message) between 1 and 500),

  created_at timestamptz not null default now()
);

-- On lit toujours « les dernières de la boutique, depuis tel moment ».
create index if not exists notifications_boutique_owner_idx
  on public.notifications_boutique (owner_email, created_at desc);

alter table public.notifications_boutique enable row level security;

-- Le patron lit celles de sa boutique.
drop policy if exists "notifications boutique lecture proprietaire" on public.notifications_boutique;
create policy "notifications boutique lecture proprietaire"
  on public.notifications_boutique for select to authenticated
  using (lower(owner_email) = lower(auth.jwt() ->> 'email'));

-- Il écrit les siennes, à son nom : sans auteur, c'est lui. Celles d'un
-- employé ne passent que par la fonction, avec la clé de service.
drop policy if exists "notifications boutique ecriture proprietaire" on public.notifications_boutique;
create policy "notifications boutique ecriture proprietaire"
  on public.notifications_boutique for insert to authenticated
  with check (lower(owner_email) = lower(auth.jwt() ->> 'email') and auteur_id is null);

-- ---------- Vérification ----------
-- Doit renvoyer les colonnes de la table.
select column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'notifications_boutique'
order by ordinal_position;
