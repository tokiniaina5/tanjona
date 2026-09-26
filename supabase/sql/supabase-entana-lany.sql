-- ============================================================
-- Un article publié, et qui s'en va quand il est épuisé
--
-- À COLLER DANS : Supabase > SQL Editor > New query > Run.
-- Se relance sans risque : "if not exists" et "drop policy if exists".
--
-- Une annonce « 🛒 Entana amidy » ne disait jusqu'ici que ce que son auteur
-- avait tapé : un texte, un prix, et rien qui la relie à la marchandise
-- qu'elle vend. Le jour où celle-ci était épuisée, l'annonce restait — et
-- l'on proposait à la vente ce qu'on n'avait plus. Le client écrivait, on
-- répondait qu'il n'y en avait plus : une déception par annonce oubliée.
--
-- Deux choses manquaient, et les voici.
--
-- 1. LE LIEN. La colonne "item_id" porte le numéro de l'article du stock
--    d'où l'annonce est partie. C'est le bouton « 📢 » de la page des
--    articles qui la remplit ; une annonce écrite à la main dans le fil la
--    laisse vide, et rien ne l'efface alors — elle ne vend l'article de
--    personne.
--
-- 2. LE DROIT D'EFFACER. La table ne l'accordait à personne : ce qui est
--    dit reste dit, et nul ne doit pouvoir effacer le billet d'un autre.
--    C'était juste, mais trop large — on ne pouvait plus retirer le sien.
--    La règle s'ouvre donc d'un cran, et d'un seul : ON N'EFFACE QUE CE
--    QU'ON A ÉCRIT, et il faut être connecté pour cela. L'adresse du billet
--    doit être celle du jeton ; un billet sans adresse d'auteur n'est
--    effaçable par personne.
--
-- CE QUI PART AVEC LE BILLET : ses commentaires et ses « j'aime » suivent
-- tout seuls, par le « on delete cascade » qu'ils portaient déjà.
--
-- LE STOCK, LUI, RESTE DANS L'APPAREIL. La base ne sait pas ce qu'il reste
-- d'un article : c'est le navigateur du propriétaire qui le sait, et c'est
-- donc lui qui efface, au moment où la dernière unité sort. Une annonce
-- publiée depuis un téléphone dont le stock vit ailleurs ne s'effacera pas
-- toute seule — il n'y a pas d'autre appareil qui sache qu'elle le devrait.
-- ============================================================

-- Le numéro de l'article du stock. Du texte et non un nombre : les articles
-- sont nommés « itm_1758... » dans l'appareil, et ce n'est pas la base qui
-- les numérote.
alter table public.client_news add column if not exists item_id text;

-- On cherche toujours « les billets de cet article-ci », pour les effacer.
create index if not exists client_news_item_idx
  on public.client_news (item_id);

-- Chacun peut retirer ce qu'il a écrit, et cela seulement. Sans le "is not
-- null", un billet ancien sans adresse d'auteur se comparerait à une adresse
-- absente — et la règle vaut mieux d'être dite deux fois que devinée une.
drop policy if exists "effacer son propre billet" on public.client_news;
create policy "effacer son propre billet"
  on public.client_news for delete
  to authenticated
  using (
    author_email is not null
    and lower(author_email) = lower(auth.jwt() ->> 'email')
  );

-- ---------- Vérification ----------
-- La colonne est là :
select column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'client_news'
  and column_name in ('item_id', 'author_email');

-- La règle est posée, et c'est une règle de suppression :
select policyname, cmd
from pg_policies
where schemaname = 'public' and tablename = 'client_news'
  and policyname = 'effacer son propre billet';

-- Les annonces attachées à un article du stock :
-- select id, client_name, message, price, item_id, created_at
-- from public.client_news
-- where item_id is not null
-- order by created_at desc limit 20;

-- Pour refermer la porte un jour :
-- drop policy if exists "effacer son propre billet" on public.client_news;
