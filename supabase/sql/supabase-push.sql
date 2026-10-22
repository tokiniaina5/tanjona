-- ============================================================
-- Ny asako : les notifications qui arrivent même app fermée (Web Push)
--
-- À COLLER DANS : Supabase > SQL Editor > New query > Run. Tel quel :
-- il n'y a RIEN à remplacer. Se relance sans risque.
--
-- Chaque appareil qui accepte les notifications laisse ici son abonnement
-- (l'adresse que le navigateur donne), sous l'adresse de celui qui s'y sert :
-- l'email de son compte, ou « mpiasa-<id>@ny-asako.invalid » pour la page
-- d'un lien mpiasa. La fonction « push » (supabase/functions/push) seule les
-- lit et les écrit, avec la clé de service : aucune règle n'ouvre la table.
-- ============================================================

create table if not exists public.push_abonnement (
  endpoint text primary key,
  adiresy text not null,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);
-- La page à rouvrir au toucher de la notification (celle d'un lien mpiasa
-- porte son jeton dans l'adresse).
alter table public.push_abonnement add column if not exists pejy text;
create index if not exists push_abonnement_adiresy on public.push_abonnement (adiresy);
alter table public.push_abonnement enable row level security;
revoke all on public.push_abonnement from anon, authenticated;
