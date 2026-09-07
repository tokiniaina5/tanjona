-- ============================================================
-- « J'aime » sous les publications de l'Accueil
--
-- À COLLER DANS : Supabase > SQL Editor > New query > Run.
-- Se relance sans risque : "if not exists" partout.
-- ============================================================

-- La clé primaire porte la règle : une personne, une publication, un seul
-- « j'aime ». C'est la base qui l'impose, pas la page — un compteur gonflé
-- par des clics répétés ne veut plus rien dire.
create table if not exists public.client_news_likes (
  news_id bigint not null references public.client_news(id) on delete cascade,
  author_email text not null,
  author_name text,
  created_at timestamptz default now(),
  primary key (news_id, author_email)
);

alter table public.client_news_likes enable row level security;

-- Tout le monde peut compter les « j'aime » : c'est ce qui les rend visibles.
drop policy if exists "anyone can read likes" on public.client_news_likes;
create policy "anyone can read likes"
  on public.client_news_likes for select
  to anon, authenticated using (true);

-- Mais on ne peut aimer QU'EN SON NOM : l'adresse écrite doit être celle du
-- jeton de session. Sans cette condition, n'importe qui pourrait aimer à la
-- place de n'importe qui — ou retirer le « j'aime » d'un autre.
drop policy if exists "like in your own name" on public.client_news_likes;
create policy "like in your own name"
  on public.client_news_likes for insert
  to authenticated
  with check (author_email = (auth.jwt() ->> 'email'));

drop policy if exists "unlike only your own" on public.client_news_likes;
create policy "unlike only your own"
  on public.client_news_likes for delete
  to authenticated
  using (author_email = (auth.jwt() ->> 'email'));


-- ---------- Vérification ----------
select column_name
from information_schema.columns
where table_schema = 'public' and table_name = 'client_news_likes'
order by ordinal_position;
