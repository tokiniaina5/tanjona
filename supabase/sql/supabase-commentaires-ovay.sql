-- Modifier (« Ovay ») un commentaire du fil : seul celui qui l'a écrit le
-- peut, et seulement son texte.
--
-- Comme pour l'effacer (supabase-commentaires-fafana.sql), le serveur le
-- vérifie lui-même : l'adresse du commentaire doit être celle de la session.
-- Le droit de mise à jour ne porte que sur la colonne « message » : ni le
-- billet, ni le nom, ni l'adresse, ni la date ne peuvent être réécrits.
--
-- À passer une fois, après supabase-commentaires.sql. Rejouable sans dommage.

revoke update on public.client_news_comments from anon, authenticated;
grant update (message) on public.client_news_comments to authenticated;

drop policy if exists "update your own comment" on public.client_news_comments;
create policy "update your own comment"
  on public.client_news_comments for update
  to authenticated
  using (lower(author_email) = lower(auth.jwt() ->> 'email'))
  with check (lower(author_email) = lower(auth.jwt() ->> 'email') and length(trim(message)) > 0);
