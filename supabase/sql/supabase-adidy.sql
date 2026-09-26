-- ============================================================
-- Adidy : ce que chacun doit, et ce que chacun a versé
--
-- À COLLER DANS : Supabase > SQL Editor > New query > Run.
-- À passer APRÈS "supabase-pieces-identite.sql".
-- Se relance sans risque : "if not exists" partout.
--
-- Deux tables, et la seconde s'appuie sur la première :
--   adidy            : la cotisation elle-même — son nom, son montant, et
--                      si elle revient chaque mois ou chaque année ;
--   adidy_fandoavana : un versement — qui, pour quelle cotisation, et pour
--                      quelle période.
--
-- Le versement ne pointe pas une ligne du registre des pièces mais un nom :
-- une personne peut avoir une CIN et un passeport, et effacer une pièce ne
-- doit pas effacer ce qu'elle a déjà versé.
--
-- Tout appartient au compte qui l'a créé, et chacun ne voit que le sien.
-- ============================================================

-- ---------- Les cotisations ----------
create table if not exists public.adidy (
  id uuid primary key default gen_random_uuid(),
  owner_email text not null,

  anarana text not null,
  -- Le montant en ariary. Vide pour un devoir qui ne se paie pas en argent :
  -- c'est alors la note qui dit ce qui est attendu.
  vidiny numeric,
  -- 'volana' : chaque mois · 'taona' : chaque année
  fe_potoana text not null default 'volana' check (fe_potoana in ('volana', 'taona')),
  fanamarihana text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists adidy_owner_idx on public.adidy (owner_email, created_at);

alter table public.adidy enable row level security;

drop policy if exists "adidy lecture proprietaire" on public.adidy;
create policy "adidy lecture proprietaire"
  on public.adidy for select to authenticated
  using (lower(owner_email) = lower(auth.jwt() ->> 'email'));

drop policy if exists "adidy ecriture proprietaire" on public.adidy;
create policy "adidy ecriture proprietaire"
  on public.adidy for insert to authenticated
  with check (lower(owner_email) = lower(auth.jwt() ->> 'email'));

drop policy if exists "adidy modification proprietaire" on public.adidy;
create policy "adidy modification proprietaire"
  on public.adidy for update to authenticated
  using (lower(owner_email) = lower(auth.jwt() ->> 'email'))
  with check (lower(owner_email) = lower(auth.jwt() ->> 'email'));

drop policy if exists "adidy suppression proprietaire" on public.adidy;
create policy "adidy suppression proprietaire"
  on public.adidy for delete to authenticated
  using (lower(owner_email) = lower(auth.jwt() ->> 'email'));

-- ---------- Les versements ----------
create table if not exists public.adidy_fandoavana (
  id uuid primary key default gen_random_uuid(),
  owner_email text not null,

  -- La cotisation supprimée emporte ses versements : ils ne diraient plus
  -- de quoi ils s'acquittaient.
  adidy_id uuid not null references public.adidy(id) on delete cascade,

  -- Le nom mis à plat (minuscules, espaces réduits) sert de clé ; l'autre
  -- garde la casse, pour l'affichage.
  olona text not null,
  anarana text not null,

  -- '2026-09' pour un mois, '2026' pour une année.
  vanim_potoana text not null,

  vola numeric,
  daty date not null default current_date,
  fanamarihana text,

  created_at timestamptz not null default now()
);

-- Une personne ne verse qu'une fois par période et par cotisation : deux
-- lignes pour un même versement, et l'on ne saurait plus ce qui est dû.
create unique index if not exists adidy_fandoavana_unique_idx
  on public.adidy_fandoavana (adidy_id, olona, vanim_potoana);

create index if not exists adidy_fandoavana_owner_idx
  on public.adidy_fandoavana (owner_email, adidy_id, vanim_potoana);

alter table public.adidy_fandoavana enable row level security;

drop policy if exists "fandoavana lecture proprietaire" on public.adidy_fandoavana;
create policy "fandoavana lecture proprietaire"
  on public.adidy_fandoavana for select to authenticated
  using (lower(owner_email) = lower(auth.jwt() ->> 'email'));

drop policy if exists "fandoavana ecriture proprietaire" on public.adidy_fandoavana;
create policy "fandoavana ecriture proprietaire"
  on public.adidy_fandoavana for insert to authenticated
  with check (lower(owner_email) = lower(auth.jwt() ->> 'email'));

drop policy if exists "fandoavana modification proprietaire" on public.adidy_fandoavana;
create policy "fandoavana modification proprietaire"
  on public.adidy_fandoavana for update to authenticated
  using (lower(owner_email) = lower(auth.jwt() ->> 'email'))
  with check (lower(owner_email) = lower(auth.jwt() ->> 'email'));

drop policy if exists "fandoavana suppression proprietaire" on public.adidy_fandoavana;
create policy "fandoavana suppression proprietaire"
  on public.adidy_fandoavana for delete to authenticated
  using (lower(owner_email) = lower(auth.jwt() ->> 'email'));

-- ---------- Vérification ----------
-- Doit renvoyer les deux tables.
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in ('adidy', 'adidy_fandoavana')
order by table_name;
