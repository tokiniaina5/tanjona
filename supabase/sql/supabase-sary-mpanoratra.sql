-- ============================================================
-- La photo de l'auteur sur chaque publication de l'Accueil
--
-- À COLLER DANS : Supabase > SQL Editor > New query > Run.
-- Se relance sans risque : "if not exists" partout.
-- ============================================================

-- La photo voyage AVEC la publication, en vignette.
--
-- L'autre voie — retrouver l'auteur, puis aller chercher son portrait — n'est
-- pas ouverte : la photo d'un compte vit dans ses métadonnées d'authentification,
-- que le navigateur d'un tiers ne peut pas lire. Et la retrouver par le nom
-- affiché attribuerait le portrait d'une personne au billet d'une homonyme.
alter table public.client_news add column if not exists author_photo text;

-- L'adresse de l'auteur : elle ne s'affiche pas, mais elle dit à qui
-- appartient un billet — ce que le seul nom affiché ne garantit pas.
alter table public.client_news add column if not exists author_email text;


-- ---------- Les publications déjà écrites ----------
--
-- Elles ne portent aucune photo, et il n'en existe nulle part de récupérable :
-- le portrait des autres clients n'est lisible que depuis leur propre session.
-- Elles gardent donc leurs initiales, et prendront leur photo dès la
-- publication suivante de chacun. Il n'y a pas de moyen honnête de faire mieux
-- sans risquer de coller un visage sur le billet de quelqu'un d'autre.


-- ---------- Vérification ----------
select column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'client_news'
order by ordinal_position;
