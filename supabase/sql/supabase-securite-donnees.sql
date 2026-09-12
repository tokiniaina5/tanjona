-- ============================================================
-- Renforcement : les listes de clients ne sont plus lisibles
-- par n'importe quel visiteur.
--
-- Jusqu'ici, "anyone can read" laissait quiconque possédant la clé
-- publique (elle est dans le code du site, c'est normal) lire la
-- liste des inscriptions et le journal de sécurité : noms, emails,
-- téléphones. Ces deux tables ne regardent que le propriétaire.
--
-- À exécuter dans Supabase > SQL Editor. Rejouable sans risque.
-- ============================================================

-- Qui est le propriétaire ? Son email, lu dans le jeton de session.
create or replace function public.is_owner()
returns boolean
language sql
stable
as $$
  select coalesce(auth.jwt() ->> 'email', '') = 'rasolofonirainytokiniaina@gmail.com'
$$;

-- --- Inscriptions : écriture ouverte (le compte vient d'être créé),
-- --- lecture réservée au propriétaire.
drop policy if exists "anyone can read signups" on public.client_signups;
drop policy if exists "owner reads signups" on public.client_signups;
create policy "owner reads signups"
  on public.client_signups for select
  to authenticated
  using (public.is_owner());

-- --- Journal de sécurité : une tentative peut être signalée sans être
-- --- connecté (c'est justement le cas d'une entrée forcée), mais seule
-- --- la personne propriétaire peut relire le journal.
drop policy if exists "anyone can read security events" on public.security_events;
drop policy if exists "owner reads security events" on public.security_events;
create policy "owner reads security events"
  on public.security_events for select
  to authenticated
  using (public.is_owner());
