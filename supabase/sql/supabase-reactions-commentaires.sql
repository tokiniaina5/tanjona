-- Les réactions sous les commentaires du fil, comme sous les billets
-- (supabase-reactions.sql) : J'aime, J'adore, Solidaire, Haha, Wouah,
-- Triste, Grrr. Une ligne par personne et par commentaire.
--
-- À passer une fois, après supabase-commentaires.sql. Rejouable sans dommage.

create table if not exists public.client_news_comment_reactions (
  comment_id uuid not null references public.client_news_comments(id) on delete cascade,
  author_email text not null,
  author_name text,
  reaction text not null default 'like'
    check (reaction in ('like', 'love', 'care', 'haha', 'wow', 'sad', 'angry')),
  created_at timestamptz default now(),
  primary key (comment_id, author_email)
);

alter table public.client_news_comment_reactions enable row level security;

drop policy if exists "anyone can read comment reactions" on public.client_news_comment_reactions;
create policy "anyone can read comment reactions"
  on public.client_news_comment_reactions for select
  to anon, authenticated using (true);

drop policy if exists "react in your own name" on public.client_news_comment_reactions;
create policy "react in your own name"
  on public.client_news_comment_reactions for insert
  to authenticated
  with check (author_email = (auth.jwt() ->> 'email'));

drop policy if exists "change your own comment reaction" on public.client_news_comment_reactions;
create policy "change your own comment reaction"
  on public.client_news_comment_reactions for update
  to authenticated
  using (author_email = (auth.jwt() ->> 'email'))
  with check (author_email = (auth.jwt() ->> 'email'));

drop policy if exists "remove your own comment reaction" on public.client_news_comment_reactions;
create policy "remove your own comment reaction"
  on public.client_news_comment_reactions for delete
  to authenticated
  using (author_email = (auth.jwt() ->> 'email'));
