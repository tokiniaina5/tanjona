-- ============================================================
-- La corbeille des publications
--
-- À COLLER DANS : Supabase > SQL Editor > New query > Run.
-- Se relance sans risque : "if not exists" et "drop policy if exists".
-- À passer APRÈS supabase-sary-mpanoratra.sql (colonne author_email).
--
-- Effacer une publication l'effaçait pour de bon : un doigt qui glisse de
-- travers, et le billet, ses commentaires et ses « j'aime » partaient avec.
-- Désormais il passe d'abord par la corbeille (menu « 🗑️ Corbeille ») :
-- il disparaît du site pour tout le monde, mais son auteur peut encore l'y
-- reprendre. C'est là, et là seulement, qu'on l'efface pour de bon.
--
-- 1. LA DATE DE MISE À LA CORBEILLE. Vide : le billet est en ligne. Remplie :
--    il est à la corbeille depuis ce jour-là.
--
-- 2. LA LECTURE. Tout le monde lisait tous les billets. Un billet à la
--    corbeille ne se lit plus que par son auteur : sans cela, il resterait
--    lisible par qui interroge la base directement, et « tsy hita intsony »
--    ne serait vrai que pour l'écran.
--
-- 3. LE DROIT DE MODIFIER. La table ne l'accordait à personne. Il s'ouvre à
--    l'auteur, pour son billet seul — c'est ainsi qu'il le met à la
--    corbeille et l'en ressort. La règle d'effacement définitif, elle, ne
--    change pas (supabase-entana-lany.sql).
--
-- LE MÉNAGE DES TRENTE JOURS (supabase-menage-publications.sql) compte
-- toujours depuis la date de publication : un billet à la corbeille part
-- avec les autres de son âge.
-- ============================================================

alter table public.client_news add column if not exists deleted_at timestamptz;

-- Le fil ne demande que les billets en ligne : l'index le lui rend rapide.
create index if not exists client_news_en_ligne_idx
  on public.client_news (created_at desc) where deleted_at is null;

-- Lire : les billets en ligne pour tous ; ceux de la corbeille pour leur
-- auteur seul.
drop policy if exists "anyone can read client news" on public.client_news;
create policy "anyone can read client news"
  on public.client_news for select
  to anon, authenticated
  using (
    deleted_at is null
    or (
      author_email is not null
      and lower(author_email) = lower(auth.jwt() ->> 'email')
    )
  );

-- Modifier : son propre billet, et il doit le rester après.
drop policy if exists "modifier son propre billet" on public.client_news;
create policy "modifier son propre billet"
  on public.client_news for update
  to authenticated
  using (
    author_email is not null
    and lower(author_email) = lower(auth.jwt() ->> 'email')
  )
  with check (
    author_email is not null
    and lower(author_email) = lower(auth.jwt() ->> 'email')
  );

-- ---------- Vérification ----------
select column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'client_news'
  and column_name = 'deleted_at';

select policyname, cmd
from pg_policies
where schemaname = 'public' and tablename = 'client_news'
order by policyname;

-- Ce qui est à la corbeille en ce moment :
-- select id, client_name, author_email, deleted_at, left(message, 60)
-- from public.client_news
-- where deleted_at is not null
-- order by deleted_at desc;
