-- ============================================================
-- Affiliation : qui a amené qui
--
-- À COLLER DANS : Supabase > SQL Editor > New query > Run.
-- Se relance sans risque : "if not exists" partout.
--
-- Chacun partage son lien (« ?aff=<ID KEY> »). Une personne qui crée son
-- compte par ce lien y est rattachée pour toujours, une seule fois. Ensuite :
--   - à l'inscription, celui qui a partagé reçoit AFF_INSCRIPTION_AR
--     (une somme de l'appli, à dépenser ici) ;
--   - à CHAQUE paiement de la personne (abonnement, achat dans l'appli,
--     achat du fil reçu), il reçoit AFF_FIXE_AR + AFF_PCT % — de la vola
--     tena izy, qui se retire.
--
-- Les commissions ne vivent pas ici : ce sont des lignes de
-- « wallet_deposits » (provider « affiliation » / « affiliation_inscription »),
-- dont l'index unique (provider, provider_ref) empêche de payer deux fois.
--
-- Personne n'écrit depuis le navigateur : seule la fonction « wallet »,
-- avec la clé de service, rattache une personne.
-- ============================================================

create table if not exists public.affiliations (
  -- La personne amenée. Clé primaire : on n'est amené qu'une fois, et le
  -- premier lien l'emporte.
  filleul_email text primary key,

  -- Celle qui a partagé le lien, et touche les commissions.
  parrain_email text not null,

  -- L'ID KEY telle qu'elle était dans le lien, pour mémoire.
  code text,

  created_at timestamptz not null default now(),

  check (filleul_email <> parrain_email)
);

-- « Mes filleuls » se lit par celui qui a partagé.
create index if not exists affiliations_parrain_idx
  on public.affiliations (parrain_email, created_at desc);

alter table public.affiliations enable row level security;

-- Aucune policy : ni lecture ni écriture depuis le navigateur. La fonction
-- « wallet » rend à chacun ce qui le concerne, emails masqués.

-- Sur un achat du fil, c'est le VENDEUR qui paie la commission (25/10/2026) :
-- elle se retire de ce qu'il reçoit (wallet, « achatsFor »).
alter table public.wallet_achats add column if not exists commission_ar bigint not null default 0;
