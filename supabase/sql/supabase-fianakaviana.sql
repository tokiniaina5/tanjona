-- ============================================================
-- Livre de famille : le livret, et ceux qui y sont inscrits
--
-- À COLLER DANS : Supabase > SQL Editor > New query > Run.
-- Se relance sans risque : "if not exists" partout.
--
-- Le livret ne tient pas une seconde liste de gens : ses membres sont
-- ceux du registre des CIN / passeports (pieces_identite), rattachés par
-- leur nom — comme les adidy et les taratasy le font déjà. Une personne
-- change de pièce, elle ne change pas de famille.
--
-- Le mariage des parents est porté par le livret lui-même : c'est de lui
-- que la famille date.
--
-- Tout appartient au compte qui l'a créé, et chacun ne voit que le sien.
-- ============================================================

create table if not exists public.fianakaviana (
  id uuid primary key default gen_random_uuid(),
  owner_email text not null,

  -- Le numéro porté sur le livret, et le nom de la famille.
  laharana text,
  anarana text not null,

  fonenana text,

  -- Le mariage des parents : quand, et où.
  fanambadiana_daty date,
  fanambadiana_toerana text,

  fanamarihana text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists fianakaviana_owner_idx
  on public.fianakaviana (owner_email, created_at desc);

alter table public.fianakaviana enable row level security;

drop policy if exists "fianakaviana lecture proprietaire" on public.fianakaviana;
create policy "fianakaviana lecture proprietaire"
  on public.fianakaviana for select to authenticated
  using (lower(owner_email) = lower(auth.jwt() ->> 'email'));

drop policy if exists "fianakaviana ecriture proprietaire" on public.fianakaviana;
create policy "fianakaviana ecriture proprietaire"
  on public.fianakaviana for insert to authenticated
  with check (lower(owner_email) = lower(auth.jwt() ->> 'email'));

drop policy if exists "fianakaviana modification proprietaire" on public.fianakaviana;
create policy "fianakaviana modification proprietaire"
  on public.fianakaviana for update to authenticated
  using (lower(owner_email) = lower(auth.jwt() ->> 'email'))
  with check (lower(owner_email) = lower(auth.jwt() ->> 'email'));

drop policy if exists "fianakaviana suppression proprietaire" on public.fianakaviana;
create policy "fianakaviana suppression proprietaire"
  on public.fianakaviana for delete to authenticated
  using (lower(owner_email) = lower(auth.jwt() ->> 'email'));


-- ---------- Ceux qui y sont inscrits ----------
-- « andraikitra » : ray, reny, zanaka, hafa. Tout s'écrit ici — le nom, la
-- pièce, la naissance : le livret est devenu le registre des gens, et il n'y
-- en a plus d'autre. Les adidy et les taratasy y prennent leurs personnes.
create table if not exists public.fianakaviana_mpikambana (
  id uuid primary key default gen_random_uuid(),
  owner_email text not null,
  fianakaviana_id uuid not null references public.fianakaviana(id) on delete cascade,

  anarana text not null,
  laharana_cin text,
  andraikitra text not null default 'zanaka'
    check (andraikitra in ('ray', 'reny', 'zanaka', 'hafa')),

  created_at timestamptz not null default now()
);

-- Deux fois la même personne dans le même livret : une seule ligne.
create unique index if not exists fianakaviana_mpikambana_unique
  on public.fianakaviana_mpikambana (fianakaviana_id, lower(anarana));

create index if not exists fianakaviana_mpikambana_idx
  on public.fianakaviana_mpikambana (owner_email, fianakaviana_id);

-- La pièce d'identité et la naissance, écrites à même le livret : ajoutées
-- après coup, pour qu'une base déjà créée les reçoive aussi.
alter table public.fianakaviana_mpikambana add column if not exists karazana text;
alter table public.fianakaviana_mpikambana drop constraint if exists fianakaviana_mpikambana_karazana_check;
alter table public.fianakaviana_mpikambana add constraint fianakaviana_mpikambana_karazana_check
  check (karazana is null or karazana in ('cin', 'passeport'));
alter table public.fianakaviana_mpikambana add column if not exists daty_fahataperana date;
alter table public.fianakaviana_mpikambana add column if not exists teraka_daty date;
alter table public.fianakaviana_mpikambana add column if not exists teraka_toerana text;

alter table public.fianakaviana_mpikambana enable row level security;

drop policy if exists "mpikambana lecture proprietaire" on public.fianakaviana_mpikambana;
create policy "mpikambana lecture proprietaire"
  on public.fianakaviana_mpikambana for select to authenticated
  using (lower(owner_email) = lower(auth.jwt() ->> 'email'));

drop policy if exists "mpikambana ecriture proprietaire" on public.fianakaviana_mpikambana;
create policy "mpikambana ecriture proprietaire"
  on public.fianakaviana_mpikambana for insert to authenticated
  with check (lower(owner_email) = lower(auth.jwt() ->> 'email'));

drop policy if exists "mpikambana modification proprietaire" on public.fianakaviana_mpikambana;
create policy "mpikambana modification proprietaire"
  on public.fianakaviana_mpikambana for update to authenticated
  using (lower(owner_email) = lower(auth.jwt() ->> 'email'))
  with check (lower(owner_email) = lower(auth.jwt() ->> 'email'));

drop policy if exists "mpikambana suppression proprietaire" on public.fianakaviana_mpikambana;
create policy "mpikambana suppression proprietaire"
  on public.fianakaviana_mpikambana for delete to authenticated
  using (lower(owner_email) = lower(auth.jwt() ->> 'email'));

-- Pour que le site voie tout de suite les tables nouvelles.
notify pgrst, 'reload schema';

-- ---------- Vérification ----------
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in ('fianakaviana', 'fianakaviana_mpikambana');
