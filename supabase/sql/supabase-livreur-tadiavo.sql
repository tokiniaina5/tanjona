-- ============================================================
-- « Tadiavo » : chercher un livreur maintenant
--
-- À COLLER DANS : Supabase > SQL Editor > New query > Run.
-- Se relance sans risque : "if not exists".
--
-- Demande d'abord "supabase-equipe.sql".
--
-- La position d'un livreur ne peut venir que de son téléphone, sa page
-- ouverte et son accord donné. Elle part d'elle-même une fois par minute.
-- Quand le patron ou le client presse « Tadiavo », on note ici l'heure
-- de la demande ; la page du livreur la guette, et envoie aussitôt une
-- position fraîche au lieu d'attendre sa minute.
--
-- Aucune règle nouvelle : le patron écrit déjà sur ses lignes d'équipe,
-- et le client passe par la fonction « suivi », qui ne touche que le
-- livreur de sa propre course.
-- ============================================================

alter table public.equipe
  add column if not exists position_demandee_at timestamptz;

-- ---------- Vérification ----------
-- Doit renvoyer une ligne.
select column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'equipe' and column_name = 'position_demandee_at';
