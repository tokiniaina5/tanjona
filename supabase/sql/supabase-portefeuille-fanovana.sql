-- ============================================================
-- Avadika ho vola tena izy : la commission de parrainage inscrite dans
-- l'appli devient de l'argent qui se retire (Mobile Money), après accord
-- de l'admin (26/10/2026).
--
-- À COLLER DANS : Supabase > SQL Editor > New query > Run. Se relance sans
-- risque.
--
-- Tout l'argent de l'appli (solde moins vola tena izy) se change, depuis le
-- 26/10/2026 (avant : la seule commission « affiliation_inscription »),
-- après accord de l'admin. La fonction « wallet » fait tout.
--   en_attente : la somme est retenue sur le solde de l'appli ;
--   ekena      : la somme nette (moins les frais) entre en vola tena izy ;
--   lavina     : la somme revient au solde de l'appli.
-- Règles (secrets de la fonction, valeurs par défaut) :
--   CONV_MIN_AR=5000  CONV_MAX_MOIS_AR=50000  CONV_FRAIS_PCT=15
-- ============================================================

create table if not exists public.wallet_conversions (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  montant_ar numeric not null check (montant_ar > 0),
  frais_ar numeric not null default 0 check (frais_ar >= 0),
  net_ar numeric not null check (net_ar >= 0),
  status text not null default 'en_attente' check (status in ('en_attente', 'ekena', 'lavina')),
  note text,
  created_at timestamptz not null default now(),
  settled_at timestamptz
);
create index if not exists wallet_conversions_email_idx on public.wallet_conversions (email, created_at desc);
create index if not exists wallet_conversions_status_idx on public.wallet_conversions (status);

-- Aucune règle d'accès : seule la fonction (clef de service) lit et écrit.
-- Le statut ne change donc que par l'admin, à travers elle.
alter table public.wallet_conversions enable row level security;
