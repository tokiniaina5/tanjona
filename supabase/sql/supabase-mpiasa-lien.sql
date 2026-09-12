-- ============================================================
-- Le lien de l'employé, et la copie du stock qu'il regarde
--
-- À COLLER DANS : Supabase > SQL Editor > New query > Run.
-- Se relance sans risque : "if not exists" partout.
--
-- Demande d'abord "supabase-equipe.sql".
--
-- Deux choses ici :
--
--   1. Un jeton par personne. C'est lui, dans l'adresse du lien, qui
--      dit qui regarde. L'employé n'a pas de compte : il n'a que ce
--      lien, et le lien ne vaut que pour lui.
--
--   2. Une copie du stock. Les articles vivent dans le téléphone du
--      patron ; l'employé ne les verrait donc jamais. L'application en
--      dépose une copie à chaque ouverture, et c'est cette copie qu'il
--      regarde — sans pouvoir y toucher, puisqu'il n'écrit nulle part.
-- ============================================================

-- ---------- Le jeton ----------
alter table public.equipe add column if not exists jeton text;

-- Deux personnes ne peuvent pas partager un jeton : ce serait deux
-- personnes derrière la même porte.
create unique index if not exists equipe_jeton_unique
  on public.equipe (jeton) where jeton is not null;

-- ---------- La copie du stock ----------
create table if not exists public.stock_partage (
  -- Une ligne par compte : la dernière copie remplace la précédente.
  owner_email text primary key,

  -- Les articles tels qu'ils sont dans l'application, en bloc. On ne
  -- cherche pas à les découper en colonnes : rien ici ne les interroge,
  -- ils ne font que se lire.
  articles jsonb not null default '[]'::jsonb,

  maj timestamptz not null default now()
);

alter table public.stock_partage enable row level security;

-- Le patron lit et écrit la sienne. L'employé, lui, ne passe pas par
-- ici : il n'a pas de compte, et c'est la fonction « mpiasa » qui lui
-- répond, avec la clé de service. Aucune policy ne l'ouvre à personne
-- d'autre.
drop policy if exists "stock partage lecture proprietaire" on public.stock_partage;
create policy "stock partage lecture proprietaire"
  on public.stock_partage for select to authenticated
  using (lower(owner_email) = lower(auth.jwt() ->> 'email'));

drop policy if exists "stock partage ecriture proprietaire" on public.stock_partage;
create policy "stock partage ecriture proprietaire"
  on public.stock_partage for insert to authenticated
  with check (lower(owner_email) = lower(auth.jwt() ->> 'email'));

drop policy if exists "stock partage modification proprietaire" on public.stock_partage;
create policy "stock partage modification proprietaire"
  on public.stock_partage for update to authenticated
  using (lower(owner_email) = lower(auth.jwt() ->> 'email'))
  with check (lower(owner_email) = lower(auth.jwt() ->> 'email'));

-- ---------- Vérification ----------
-- Doit renvoyer la colonne "jeton" et la table "stock_partage".
select 'equipe.jeton' as quoi
from information_schema.columns
where table_schema = 'public' and table_name = 'equipe' and column_name = 'jeton'
union all
select 'table stock_partage'
from information_schema.tables
where table_schema = 'public' and table_name = 'stock_partage';
