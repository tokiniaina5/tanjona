-- ============================================================
-- Ce qui a été installé : quel fokontany, sur quel appareil
--
-- À COLLER DANS : Supabase > SQL Editor > New query > Run.
-- Se relance sans risque : "if not exists" partout.
--
-- L'admin installe l'application chez les fokontany, l'un après l'autre.
-- Sans trace, il ne sait plus lequel est fait — et il recommencerait, ou
-- donnerait deux accès au même. La ligne s'écrit toute seule, depuis
-- l'application, au moment où elle est installée.
--
-- C'est le fokontany lui-même qui l'écrit, sous son compte : le navigateur
-- n'écrit que sa propre ligne (règle « installation ecriture »). L'admin,
-- lui, les lit toutes — c'est à lui qu'elles servent.
-- ============================================================

create table if not exists public.fokontany_installation (
  id uuid primary key default gen_random_uuid(),

  -- Le compte qui a installé : son email, celui qui ouvre le site.
  email text not null,

  -- Le nom porté par l'application (« Fokontany Ambohimanarina ») et le
  -- commun dont il relève, tels qu'ils étaient dans la demande.
  fokontany text,
  commun text,

  -- « fokontany » ou « commun » : les deux applications s'installent.
  karazana text not null default 'fokontany'
    check (karazana in ('fokontany', 'commun')),

  appareil text,
  created_at timestamptz not null default now()
);

-- Un même compte n'installe qu'une fois la même application : réinstaller
-- ne fait pas une seconde ligne.
create unique index if not exists fokontany_installation_unique
  on public.fokontany_installation (lower(email), karazana);

create index if not exists fokontany_installation_nom_idx
  on public.fokontany_installation (lower(coalesce(fokontany, '')));

alter table public.fokontany_installation enable row level security;

-- Chacun voit la sienne ; le propriétaire les voit toutes.
drop policy if exists "installation lecture" on public.fokontany_installation;
create policy "installation lecture"
  on public.fokontany_installation for select to authenticated
  using (
    lower(email) = lower(auth.jwt() ->> 'email')
    or lower(auth.jwt() ->> 'email') = 'rasolofonirainytokiniaina@gmail.com'
  );

-- On n'écrit que sa propre installation.
drop policy if exists "installation ecriture" on public.fokontany_installation;
create policy "installation ecriture"
  on public.fokontany_installation for insert to authenticated
  with check (lower(email) = lower(auth.jwt() ->> 'email'));

-- Retirer une installation : le propriétaire seul (une machine rendue, un
-- fokontany qui s'arrête).
drop policy if exists "installation suppression" on public.fokontany_installation;
create policy "installation suppression"
  on public.fokontany_installation for delete to authenticated
  using (lower(auth.jwt() ->> 'email') = 'rasolofonirainytokiniaina@gmail.com');

notify pgrst, 'reload schema';

-- ---------- Vérification ----------
select table_name
from information_schema.tables
where table_schema = 'public' and table_name = 'fokontany_installation';
