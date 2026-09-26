-- ============================================================
-- Le tableau de bord d'un employé : ce que le patron suit
--
-- À COLLER DANS : Supabase > SQL Editor > New query > Run.
-- Se relance sans risque : "if not exists" partout.
--
-- Demande d'abord "supabase-equipe.sql".
--
-- Le stock d'un employé entré par son lien vit dans son navigateur :
-- le patron n'en verrait rien. Son application en dépose ici une copie
-- après chaque changement, et la fenêtre de la personne en tire un
-- tableau de bord. Une ligne par personne : la dernière copie remplace
-- la précédente.
-- ============================================================

create table if not exists public.stock_mpiasa (
  -- La copie s'efface avec la personne : sans elle, elle ne dit plus rien.
  equipe_id uuid primary key references public.equipe(id) on delete cascade,

  -- Le patron qui la suit.
  owner_email text not null,

  articles jsonb not null default '[]'::jsonb,
  mouvements jsonb not null default '[]'::jsonb,

  -- Quand l'application de l'employé l'a envoyée : ce qu'on regarde date
  -- de là, et le tableau de bord l'écrit en tête.
  maj timestamptz not null default now()
);

create index if not exists stock_mpiasa_owner_idx
  on public.stock_mpiasa (owner_email);

alter table public.stock_mpiasa enable row level security;

-- Le patron lit. Personne n'écrit directement : l'employé n'a pas de
-- compte, et c'est la fonction « mpiasa », avec la clé de service, qui
-- dépose la copie de celui que désigne le jeton.
drop policy if exists "stock mpiasa lecture proprietaire" on public.stock_mpiasa;
create policy "stock mpiasa lecture proprietaire"
  on public.stock_mpiasa for select to authenticated
  using (lower(owner_email) = lower(auth.jwt() ->> 'email'));

-- ---------- Vérification ----------
select column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'stock_mpiasa'
order by ordinal_position;
