-- Les réactions du fil, comme sur Facebook : J'aime, J'adore, Solidaire,
-- Haha, Wouah, Triste, Grrr.
--
-- Elles vivent dans la table des « j'aime » (supabase-jaime.sql) : une ligne
-- par personne et par billet, comme avant, qui dit maintenant laquelle.
-- Les « j'aime » déjà donnés restent des « j'aime » (valeur par défaut).
--
-- À passer une fois, après supabase-jaime.sql. Rejouable sans dommage.

alter table public.client_news_likes
  add column if not exists reaction text not null default 'like';

alter table public.client_news_likes
  drop constraint if exists client_news_likes_reaction_check;
alter table public.client_news_likes
  add constraint client_news_likes_reaction_check
  check (reaction in ('like', 'love', 'care', 'haha', 'wow', 'sad', 'angry'));

-- Changer d'avis : passer de « J'aime » à « Haha » sans retirer puis
-- remettre. Seulement la sienne, et sous son propre nom.
drop policy if exists "change your own reaction" on public.client_news_likes;
create policy "change your own reaction"
  on public.client_news_likes for update
  to authenticated
  using (author_email = (auth.jwt() ->> 'email'))
  with check (author_email = (auth.jwt() ->> 'email'));
