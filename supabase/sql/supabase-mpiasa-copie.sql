-- ============================================================
-- Le stock de départ d'un employé : les mouvements dans la copie
--
-- À COLLER DANS : Supabase > SQL Editor > New query > Run.
-- Se relance sans risque : "if not exists".
--
-- Demande d'abord "supabase-mpiasa-lien.sql" (le jeton et la copie
-- du stock).
--
-- Le lien d'un employé ouvre l'application entière, avec un stock à
-- lui. La première fois, ce stock part de la copie que le patron
-- dépose en ouvrant son application. Les articles y étaient déjà ; on
-- y ajoute les mouvements, sans quoi son tableau de bord et son
-- historique partiraient de rien.
-- ============================================================

alter table public.stock_partage
  add column if not exists mouvements jsonb not null default '[]'::jsonb;

-- ---------- Vérification ----------
-- Doit renvoyer une ligne.
select 'stock_partage.mouvements' as quoi
from information_schema.columns
where table_schema = 'public' and table_name = 'stock_partage' and column_name = 'mouvements';
