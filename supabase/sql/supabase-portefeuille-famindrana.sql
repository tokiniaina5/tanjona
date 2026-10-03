-- ============================================================
-- Portefeuille : ID KEY sy famindrana vola eo amin'ny mpanjifa
--
-- À COLLER DANS : Supabase > SQL Editor > New query > Run.
-- Se relance sans risque : "if not exists" partout.
--
-- Chaque compte reçoit une clef à lui (« ID KEY »), différente de toutes
-- les autres : c'est elle qu'on donne pour recevoir de l'argent, au lieu
-- de son email. Un transfert passe la vola tena izy d'un portefeuille à
-- l'autre ; 0,5 % de frais vont au propriétaire.
--
-- Personne n'écrit ces tables depuis le navigateur : seule la fonction
-- « wallet » (clef de service) les lit et les écrit. RLS est donc activé
-- sans aucune règle — tout accès direct est refusé.
-- ============================================================

create table if not exists public.wallet_cles (
  email text primary key,
  -- « NA-XXXX-XXXX », tirée au hasard ; unique, jamais la même pour deux.
  cle text not null unique,
  created_at timestamptz not null default now()
);
alter table public.wallet_cles enable row level security;

create table if not exists public.wallet_transferts (
  id uuid primary key default gen_random_uuid(),
  from_email text not null,
  to_email text not null,
  -- Ce que reçoit le destinataire, en ariary.
  amount_ar bigint not null check (amount_ar > 0),
  -- Les frais, payés par l'expéditeur en plus, reçus par le propriétaire.
  fee_ar bigint not null default 0 check (fee_ar >= 0),
  note text,
  created_at timestamptz not null default now(),
  check (from_email <> to_email)
);
create index if not exists wallet_transferts_from on public.wallet_transferts (from_email);
create index if not exists wallet_transferts_to on public.wallet_transferts (to_email);
alter table public.wallet_transferts enable row level security;
