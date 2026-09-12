-- ============================================================
-- Mpiasa sy livreur : le registre, et les livraisons qu'on leur confie
--
-- À COLLER DANS : Supabase > SQL Editor > New query > Run.
-- Se relance sans risque : "if not exists" partout.
--
-- Deux tables, et la seconde s'appuie sur la première : on ne confie
-- pas une livraison à quelqu'un qui n'est pas dans le registre.
--
-- Tout appartient au compte qui l'a créé. Chacun ne voit que le sien :
-- deux commerçants qui utilisent l'application ne se croisent jamais.
-- ============================================================

-- ---------- Le registre ----------
create table if not exists public.equipe (
  id uuid primary key default gen_random_uuid(),

  -- À quel compte cette personne appartient. C'est l'email du patron,
  -- comme partout ailleurs dans l'application.
  owner_email text not null,

  nom text not null,
  telephone text,

  -- 'mpiasa' : au magasin · 'livreur' : sur la route.
  role text not null default 'mpiasa',

  -- Son email, quand elle en a un. C'est par lui qu'elle pourra un jour
  -- ouvrir l'application et voir ses propres livraisons.
  email text,

  -- Partie sans partir : on garde son nom sur les livraisons passées
  -- plutôt que d'effacer une trace qui explique une journée.
  actif boolean not null default true,

  note text,
  created_at timestamptz not null default now()
);

create index if not exists equipe_owner_idx on public.equipe (owner_email, actif);

alter table public.equipe enable row level security;

drop policy if exists "equipe lecture proprietaire" on public.equipe;
create policy "equipe lecture proprietaire"
  on public.equipe for select to authenticated
  using (lower(owner_email) = lower(auth.jwt() ->> 'email'));

drop policy if exists "equipe ecriture proprietaire" on public.equipe;
create policy "equipe ecriture proprietaire"
  on public.equipe for insert to authenticated
  with check (lower(owner_email) = lower(auth.jwt() ->> 'email'));

drop policy if exists "equipe modification proprietaire" on public.equipe;
create policy "equipe modification proprietaire"
  on public.equipe for update to authenticated
  using (lower(owner_email) = lower(auth.jwt() ->> 'email'))
  with check (lower(owner_email) = lower(auth.jwt() ->> 'email'));

drop policy if exists "equipe suppression proprietaire" on public.equipe;
create policy "equipe suppression proprietaire"
  on public.equipe for delete to authenticated
  using (lower(owner_email) = lower(auth.jwt() ->> 'email'));

-- ---------- Les livraisons ----------
create table if not exists public.livraisons (
  id uuid primary key default gen_random_uuid(),
  owner_email text not null,

  -- Ce qu'on livre, et à qui.
  designation text not null,
  client text,
  adresse text,
  telephone text,

  -- Qui s'en charge. Le lien se défait si la personne est retirée du
  -- registre : la livraison reste, sans porteur, plutôt que de
  -- disparaître avec lui.
  livreur_id uuid references public.equipe(id) on delete set null,
  -- Son nom au moment de la course. Le registre peut changer ; ce qui
  -- s'est passé ce jour-là, non.
  livreur_nom text,

  -- 'miandry' : à prendre · 'nalaina' : pris · 'an_dalana' : en route
  -- 'tonga' : arrivé · 'foana' : annulé
  statut text not null default 'miandry',

  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists livraisons_owner_idx on public.livraisons (owner_email, statut);
create index if not exists livraisons_livreur_idx on public.livraisons (livreur_id);

alter table public.livraisons enable row level security;

drop policy if exists "livraisons lecture proprietaire" on public.livraisons;
create policy "livraisons lecture proprietaire"
  on public.livraisons for select to authenticated
  using (lower(owner_email) = lower(auth.jwt() ->> 'email'));

drop policy if exists "livraisons ecriture proprietaire" on public.livraisons;
create policy "livraisons ecriture proprietaire"
  on public.livraisons for insert to authenticated
  with check (lower(owner_email) = lower(auth.jwt() ->> 'email'));

drop policy if exists "livraisons modification proprietaire" on public.livraisons;
create policy "livraisons modification proprietaire"
  on public.livraisons for update to authenticated
  using (lower(owner_email) = lower(auth.jwt() ->> 'email'))
  with check (lower(owner_email) = lower(auth.jwt() ->> 'email'));

drop policy if exists "livraisons suppression proprietaire" on public.livraisons;
create policy "livraisons suppression proprietaire"
  on public.livraisons for delete to authenticated
  using (lower(owner_email) = lower(auth.jwt() ->> 'email'));

-- ---------- Vérification ----------
-- Doit renvoyer les deux tables.
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in ('equipe', 'livraisons')
order by table_name;
