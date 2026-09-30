-- Effacer un commentaire du fil : seul celui qui l'a écrit le peut.
--
-- Le serveur le vérifie lui-même : l'adresse du commentaire doit être celle
-- de la session (auth.jwt). Une page modifiée qui enverrait l'ordre pour le
-- commentaire d'un autre serait refusée. Les réactions du commentaire
-- partent avec lui (on delete cascade, supabase-reactions-commentaires.sql).
--
-- À passer une fois, après supabase-commentaires.sql. Rejouable sans dommage.

drop policy if exists "delete your own comment" on public.client_news_comments;
create policy "delete your own comment"
  on public.client_news_comments for delete
  to authenticated
  using (lower(author_email) = lower(auth.jwt() ->> 'email'));
