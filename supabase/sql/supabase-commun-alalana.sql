-- ============================================================
-- L'entrée de « Commun » : demandée, accordée, ouverte par un code
--
-- À COLLER DANS : Supabase > SQL Editor > New query > Run.
-- Se relance sans risque : "if not exists" partout.
--
-- Deux tables :
--   commun_fangatahana : qui demande à entrer ;
--   commun_alalana     : à qui c'est accordé, et par quel code.
--
-- Le code ne part par aucun message : il s'affiche au propriétaire, qui le
-- transmet de la main à la main. Ce qui ne passe nulle part ne s'intercepte
-- pas.
--
-- Chacun ne voit que sa propre ligne ; le propriétaire les voit toutes, et
-- lui seul accorde, refuse ou retire.
-- ============================================================

-- L'adresse du propriétaire, écrite ici parce que les règles ne lisent pas
-- les variables de l'application.
create table if not exists public.commun_fangatahana (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  anarana text,
  hafatra text,
  -- 'miandry' · 'ekena' · 'lavina'
  statut text not null default 'miandry' check (statut in ('miandry', 'ekena', 'lavina')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Une demande par personne : la relancer ne fait pas une seconde file.
create unique index if not exists commun_fangatahana_email_idx
  on public.commun_fangatahana (lower(email));

alter table public.commun_fangatahana enable row level security;

drop policy if exists "fangatahana lecture" on public.commun_fangatahana;
create policy "fangatahana lecture"
  on public.commun_fangatahana for select to authenticated
  using (
    lower(email) = lower(auth.jwt() ->> 'email')
    or lower(auth.jwt() ->> 'email') = 'rasolofonirainytokiniaina@gmail.com'
  );

-- On ne demande que pour soi : une demande au nom d'un autre ferait entrer
-- quelqu'un qui n'a rien demandé.
drop policy if exists "fangatahana ecriture" on public.commun_fangatahana;
create policy "fangatahana ecriture"
  on public.commun_fangatahana for insert to authenticated
  with check (lower(email) = lower(auth.jwt() ->> 'email'));

drop policy if exists "fangatahana reponse" on public.commun_fangatahana;
create policy "fangatahana reponse"
  on public.commun_fangatahana for update to authenticated
  using (lower(auth.jwt() ->> 'email') = 'rasolofonirainytokiniaina@gmail.com')
  with check (lower(auth.jwt() ->> 'email') = 'rasolofonirainytokiniaina@gmail.com');

drop policy if exists "fangatahana suppression" on public.commun_fangatahana;
create policy "fangatahana suppression"
  on public.commun_fangatahana for delete to authenticated
  using (lower(auth.jwt() ->> 'email') = 'rasolofonirainytokiniaina@gmail.com');

-- ---------- Ce qui est accordé ----------
create table if not exists public.commun_alalana (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  anarana text,
  code text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists commun_alalana_email_idx
  on public.commun_alalana (lower(email));

alter table public.commun_alalana enable row level security;

-- Chacun lit sa ligne — c'est ainsi que le code tapé se vérifie — et le
-- propriétaire les lit toutes.
drop policy if exists "alalana lecture" on public.commun_alalana;
create policy "alalana lecture"
  on public.commun_alalana for select to authenticated
  using (
    lower(email) = lower(auth.jwt() ->> 'email')
    or lower(auth.jwt() ->> 'email') = 'rasolofonirainytokiniaina@gmail.com'
  );

-- Accorder, changer, retirer : le propriétaire seul.
drop policy if exists "alalana ecriture" on public.commun_alalana;
create policy "alalana ecriture"
  on public.commun_alalana for insert to authenticated
  with check (lower(auth.jwt() ->> 'email') = 'rasolofonirainytokiniaina@gmail.com');

drop policy if exists "alalana modification" on public.commun_alalana;
create policy "alalana modification"
  on public.commun_alalana for update to authenticated
  using (lower(auth.jwt() ->> 'email') = 'rasolofonirainytokiniaina@gmail.com')
  with check (lower(auth.jwt() ->> 'email') = 'rasolofonirainytokiniaina@gmail.com');

drop policy if exists "alalana suppression" on public.commun_alalana;
create policy "alalana suppression"
  on public.commun_alalana for delete to authenticated
  using (lower(auth.jwt() ->> 'email') = 'rasolofonirainytokiniaina@gmail.com');

-- ---------- Vérification ----------
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in ('commun_fangatahana', 'commun_alalana')
order by table_name;

-- ============================================================
-- Deuxième temps : le code saisi se confirme
--
-- Le code accordé ne suffit plus à entrer. Quand la personne le saisit, la
-- ligne le retient (nampiasaina_at) et le propriétaire en est averti ; la
-- page ne s'ouvre vraiment qu'une fois qu'il a confirmé (voamarina).
--
-- Un code lu par-dessus l'épaule, ou reçu dans une boîte ouverte par un
-- autre, n'ouvre donc rien tout seul.
-- ============================================================

alter table public.commun_alalana add column if not exists nampiasaina_at timestamptz;
alter table public.commun_alalana add column if not exists voamarina boolean not null default false;
alter table public.commun_alalana add column if not exists appareil text;
