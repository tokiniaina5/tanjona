-- ============================================================
-- Ny asako : la photo du profil (celle de l'inscription), visible du patron
--
-- À COLLER DANS : Supabase > SQL Editor > New query > Run. Tel quel :
-- il n'y a RIEN à remplacer. Se relance sans risque. Suppose
-- supabase-equipe.sql déjà passé.
--
-- La photo du profil reste sur l'appareil (common.js, logoForServer : dans
-- le compte, elle alourdissait le jeton de chaque requête). Chaque appareil
-- en dépose ici une vignette (96 px), et le patron voit celle de ses mpiasa
-- dans 👷 Mpiasa et Hôtellerie › Lakozia.
-- ============================================================

create table if not exists public.profil_sary (
  email text primary key,
  finday text,
  sary text not null check (char_length(sary) < 60000),
  updated_at timestamptz not null default now()
);
alter table public.profil_sary enable row level security;

-- Chacun ne touche qu'à sa propre vignette.
drop policy if exists "profil sary tompony" on public.profil_sary;
create policy "profil sary tompony" on public.profil_sary for all to authenticated
  using (email = lower(auth.jwt() ->> 'email'))
  with check (email = lower(auth.jwt() ->> 'email'));
grant select, insert, update, delete on public.profil_sary to authenticated;

-- Le patron lit la vignette de ses mpiasa seulement : par l'email inscrit
-- dans 👷 Mpiasa, sinon par le numéro (les 9 derniers chiffres).
create or replace function public.equipe_sary_profil()
returns table (equipe_id uuid, sary text)
language sql stable security definer set search_path = public
as $$
  select distinct on (e.id) e.id, p.sary
  from public.equipe e
  join public.profil_sary p
    on (e.email is not null and lower(trim(e.email)) = p.email)
    or (e.telephone is not null and p.finday is not null
        and length(regexp_replace(p.finday, '\D', '', 'g')) >= 9
        and right(regexp_replace(e.telephone, '\D', '', 'g'), 9) = right(regexp_replace(p.finday, '\D', '', 'g'), 9))
  where e.owner_email = lower(auth.jwt() ->> 'email')
  order by e.id, (e.email is not null and lower(trim(e.email)) = p.email) desc, p.updated_at desc;
$$;
revoke all on function public.equipe_sary_profil() from public;
grant execute on function public.equipe_sary_profil() to authenticated;
