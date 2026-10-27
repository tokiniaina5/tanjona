-- ============================================================
-- Espace admin : « Vider » sur chaque tableau
--
-- À COLLER DANS : Supabase > SQL Editor > New query > Run. Tel quel :
-- il n'y a RIEN à remplacer. Se relance sans risque.
--
-- Le propriétaire peut effacer les lignes qu'il lit déjà : inscriptions,
-- demandes de déblocage (la page garde celles « à vérifier »), alertes de
-- sécurité. « Tout le monde qui a ouvert le site » (site_visiteurs) se vide
-- par la fonction « visiteur » (action « vider ») : la table n'est pas
-- lisible depuis le navigateur. blocked_accounts n'a pas de « Vider » :
-- ce serait débloquer tout le monde d'un coup.
-- ============================================================

drop policy if exists "owner deletes signups" on public.client_signups;
create policy "owner deletes signups"
  on public.client_signups for delete
  to authenticated
  using (lower(auth.jwt() ->> 'email') = 'rasolofonirainytokiniaina@gmail.com');

drop policy if exists "owner deletes unlock requests" on public.unlock_requests;
create policy "owner deletes unlock requests"
  on public.unlock_requests for delete
  to authenticated
  using (lower(auth.jwt() ->> 'email') = 'rasolofonirainytokiniaina@gmail.com');

drop policy if exists "owner deletes security events" on public.security_events;
create policy "owner deletes security events"
  on public.security_events for delete
  to authenticated
  using (lower(auth.jwt() ->> 'email') = 'rasolofonirainytokiniaina@gmail.com');

-- ---------- Vérification ----------
select tablename, policyname, cmd from pg_policies
 where tablename in ('client_signups','unlock_requests','security_events') and cmd = 'DELETE';
