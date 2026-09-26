-- ============================================================
-- Le commentaire qui arrive à la seconde où il est écrit
--
-- À COLLER DANS : Supabase > SQL Editor > New query > Run.
-- À passer APRÈS "supabase-commentaires.sql". Se relance sans risque.
--
-- Le fil ouvert se relit tout seul toutes les quatre secondes. C'est déjà
-- autre chose que de ne rien voir arriver, mais ce sont quand même quatre
-- secondes, et une requête par personne qui lit.
--
-- Le temps réel remplace les deux : le serveur prévient les pages ouvertes
-- dès que la ligne entre. Il faut pour cela que la table soit dans la
-- publication que Supabase écoute — sans quoi rien ne sort, en silence.
--
-- Ce n'est pas une brèche : le temps réel passe par les mêmes règles de
-- lecture (RLS) que le reste. Ce que quelqu'un n'a pas le droit de lire, il
-- ne le reçoit pas non plus par ce chemin. Les commentaires, eux, sont
-- lisibles de tous — c'est un fil public.
--
-- Rien n'est perdu si vous ne passez pas ce script : la page retombe sur sa
-- relecture régulière, et le commentaire arrive quelques secondes plus tard.
-- ============================================================

-- « add table » échoue si la table y est déjà : on regarde avant, pour que
-- le script se relance sans rien casser.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'client_news_comments'
  ) then
    alter publication supabase_realtime add table public.client_news_comments;
  end if;
end $$;

-- ---------- Vérification ----------
-- Doit renvoyer une ligne : la table est écoutée.
select schemaname, tablename
from pg_publication_tables
where pubname = 'supabase_realtime'
  and schemaname = 'public'
  and tablename = 'client_news_comments';
