-- ============================================================
-- « Visiteurs du site » : le propriétaire efface les lignes
--
-- À COLLER DANS : Supabase > SQL Editor > New query > Run. Tel quel :
-- il n'y a RIEN à remplacer. Se relance sans risque.
--
-- site_visits n'avait pas de règle d'effacement : personne ne pouvait
-- retirer une ligne. Le propriétaire le peut désormais, une à une
-- (glisser la ligne) ou toutes (« Vider »).
--
-- Au passage : la lecture, dite « only owner can read visits », était
-- ouverte à TOUT compte connecté (using true). Elle est ramenée au seul
-- propriétaire, comme son nom le promettait.
-- ============================================================

drop policy if exists "owner can delete visits" on public.site_visits;
create policy "owner can delete visits"
  on public.site_visits for delete
  to authenticated
  using (lower(auth.jwt() ->> 'email') = 'rasolofonirainytokiniaina@gmail.com');

drop policy if exists "only owner can read visits" on public.site_visits;
create policy "only owner can read visits"
  on public.site_visits for select
  to authenticated
  using (lower(auth.jwt() ->> 'email') = 'rasolofonirainytokiniaina@gmail.com');

-- ---------- Vérification ----------
select policyname, cmd, qual from pg_policies where tablename = 'site_visits';
