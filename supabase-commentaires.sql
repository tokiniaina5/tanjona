-- ============================================================
-- Commentaires sous les publications de l'Accueil
--
-- À COLLER DANS : Supabase > SQL Editor > New query > Run.
-- Se relance sans risque : "if not exists" partout.
-- ============================================================

create table if not exists public.client_news_comments (
  id uuid primary key default gen_random_uuid(),
  news_id bigint not null references public.client_news(id) on delete cascade,
  author_name text,
  author_email text,
  message text not null,
  created_at timestamptz default now()
);

-- Les commentaires se lisent toujours par publication : c'est ce chemin-là
-- qu'il faut rendre rapide.
create index if not exists client_news_comments_news_idx
  on public.client_news_comments (news_id, created_at);

alter table public.client_news_comments enable row level security;

drop policy if exists "anyone can read comments" on public.client_news_comments;
create policy "anyone can read comments"
  on public.client_news_comments for select
  to anon, authenticated using (true);

-- Mêmes règles que les publications elles-mêmes : chacun peut écrire, et rien
-- ne peut être réécrit ni effacé depuis le navigateur — ce qui est dit reste
-- dit, et personne ne peut modifier le propos d'un autre.
drop policy if exists "anyone can comment" on public.client_news_comments;
create policy "anyone can comment"
  on public.client_news_comments for insert
  to anon, authenticated with check (true);


-- ---------- Vérification ----------
select column_name
from information_schema.columns
where table_schema = 'public' and table_name = 'client_news_comments'
order by ordinal_position;
