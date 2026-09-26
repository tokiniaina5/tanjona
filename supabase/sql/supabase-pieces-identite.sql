-- ============================================================
-- CIN et passeports : le registre des pièces d'identité
--
-- À COLLER DANS : Supabase > SQL Editor > New query > Run.
-- Se relance sans risque : "if not exists" partout.
--
-- Il s'ouvre dans la fenêtre « Commun », onglet « CIN / Passeport »
-- (gestion-stockage-js/pieces-identite.js).
--
-- Tout appartient au compte qui l'a créé. Chacun ne voit que le sien :
-- deux commerçants qui utilisent l'application ne se croisent jamais, et
-- des numéros de pièce d'identité n'ont rien à faire sous d'autres yeux.
-- ============================================================

create table if not exists public.pieces_identite (
  id uuid primary key default gen_random_uuid(),

  -- À quel compte cette pièce appartient : l'email du patron, comme
  -- partout ailleurs dans l'application.
  owner_email text not null,

  -- 'cin' · 'passeport'
  karazana text not null default 'cin' check (karazana in ('cin', 'passeport')),
  laharana text not null,
  anarana text not null,

  daty_nahazoana date,
  -- Une CIN malgache n'expire pas : seul le passeport la renseigne.
  daty_fahataperana date,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Un même numéro ne s'inscrit qu'une fois par compte : deux lignes pour une
-- seule pièce, et l'on ne saurait plus laquelle corriger.
create unique index if not exists pieces_identite_numero_idx
  on public.pieces_identite (lower(owner_email), karazana, laharana);

create index if not exists pieces_identite_owner_idx
  on public.pieces_identite (owner_email, created_at desc);

alter table public.pieces_identite enable row level security;

drop policy if exists "pieces lecture proprietaire" on public.pieces_identite;
create policy "pieces lecture proprietaire"
  on public.pieces_identite for select to authenticated
  using (lower(owner_email) = lower(auth.jwt() ->> 'email'));

drop policy if exists "pieces ecriture proprietaire" on public.pieces_identite;
create policy "pieces ecriture proprietaire"
  on public.pieces_identite for insert to authenticated
  with check (lower(owner_email) = lower(auth.jwt() ->> 'email'));

drop policy if exists "pieces modification proprietaire" on public.pieces_identite;
create policy "pieces modification proprietaire"
  on public.pieces_identite for update to authenticated
  using (lower(owner_email) = lower(auth.jwt() ->> 'email'))
  with check (lower(owner_email) = lower(auth.jwt() ->> 'email'));

drop policy if exists "pieces suppression proprietaire" on public.pieces_identite;
create policy "pieces suppression proprietaire"
  on public.pieces_identite for delete to authenticated
  using (lower(owner_email) = lower(auth.jwt() ->> 'email'));

-- ---------- Vérification ----------
-- Doit renvoyer la table.
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name = 'pieces_identite';
