-- ============================================================
-- L'Administratif Commun lit les registres des fokontany
--
-- À COLLER DANS : Supabase > SQL Editor > New query > Run.
-- Se relance sans risque.
--
-- Chaque fokontany tient ses livrets, ses adidy et ses papiers sous son
-- propre compte, et ne voit que les siens — cela ne change pas. Le Commun,
-- lui, les surplombe : il doit tous les lire, sans quoi il ne montre que le
-- registre du propriétaire, qui n'en tient aucun.
--
-- LIRE, et rien d'autre : écrire, corriger, effacer restent l'affaire du
-- fokontany. Le Commun regarde.
-- ============================================================

drop policy if exists "fianakaviana lecture commun" on public.fianakaviana;
create policy "fianakaviana lecture commun"
  on public.fianakaviana for select to authenticated
  using (lower(auth.jwt() ->> 'email') = 'rasolofonirainytokiniaina@gmail.com');

drop policy if exists "mpikambana lecture commun" on public.fianakaviana_mpikambana;
create policy "mpikambana lecture commun"
  on public.fianakaviana_mpikambana for select to authenticated
  using (lower(auth.jwt() ->> 'email') = 'rasolofonirainytokiniaina@gmail.com');

drop policy if exists "adidy lecture commun" on public.adidy;
create policy "adidy lecture commun"
  on public.adidy for select to authenticated
  using (lower(auth.jwt() ->> 'email') = 'rasolofonirainytokiniaina@gmail.com');

drop policy if exists "adidy fandoavana lecture commun" on public.adidy_fandoavana;
create policy "adidy fandoavana lecture commun"
  on public.adidy_fandoavana for select to authenticated
  using (lower(auth.jwt() ->> 'email') = 'rasolofonirainytokiniaina@gmail.com');

drop policy if exists "taratasy lecture commun" on public.taratasy;
create policy "taratasy lecture commun"
  on public.taratasy for select to authenticated
  using (lower(auth.jwt() ->> 'email') = 'rasolofonirainytokiniaina@gmail.com');

notify pgrst, 'reload schema';

-- ---------- Vérification ----------
select tablename, policyname
from pg_policies
where schemaname = 'public' and policyname like '%lecture commun%'
order by tablename;
