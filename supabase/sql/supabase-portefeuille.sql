-- ============================================================
-- Portefeuille en ariary, retirable vers un compte extérieur
--
-- À COLLER DANS : Supabase > SQL Editor > New query > Run.
-- Se relance sans risque : "if not exists" partout.
--
-- Le solde n'est PAS une colonne que l'on incrémente : il se calcule
-- à partir de ce qui est déjà en base (parrainages gagnés, retraits
-- demandés, déblocages payés). Un solde stocké se désynchronise et,
-- surtout, un chiffre écrit depuis le navigateur se réécrit tout aussi
-- facilement — ce qui n'est pas acceptable pour de l'argent.
-- ============================================================

-- ---------- À qui appartient un appareil ----------
-- Les parrainages sont comptés par identifiant d'installation. Pour
-- qu'un retrait appartienne à une personne et non à un téléphone, on
-- rattache l'installation à son compte. Le premier qui le rattache le
-- garde : personne ne peut réclamer ensuite l'installation d'un autre.
create table if not exists public.wallet_owners (
  install_id text primary key,
  email text not null,
  claimed_at timestamptz default now()
);

create index if not exists wallet_owners_email_idx on public.wallet_owners (email);

alter table public.wallet_owners enable row level security;
-- Aucune écriture depuis le navigateur : tout passe par la fonction
-- « wallet », seule à détenir la clé de service.
drop policy if exists "wallet owners readable" on public.wallet_owners;
create policy "wallet owners readable"
  on public.wallet_owners for select
  to anon, authenticated using (true);


-- ---------- Retraits vers un compte extérieur ----------
create table if not exists public.wallet_payouts (
  id uuid primary key default gen_random_uuid(),
  email text not null,                 -- qui retire
  name text,
  amount_ar numeric not null,          -- somme prélevée sur le solde
  method text not null,                -- paypal | card | mobile
  destination text not null,           -- email PayPal, RIB, n° Mobile Money
  currency text,                       -- devise demandée à l'arrivée
  amount_out numeric,                  -- somme convertie, au taux du jour
  rate numeric,                        -- taux retenu au moment de la demande
  status text not null default 'pending',  -- pending | sent | refused
  note text,                           -- motif d'un refus, référence d'un envoi
  created_at timestamptz default now(),
  settled_at timestamptz,
  seen_by_owner boolean default false
);

create index if not exists wallet_payouts_email_idx on public.wallet_payouts (email);
create index if not exists wallet_payouts_status_idx on public.wallet_payouts (status);

alter table public.wallet_payouts enable row level security;

-- Lecture seule depuis le navigateur : chacun consulte l'état de ses
-- demandes, et le propriétaire les siennes. Créer, accepter ou refuser
-- un retrait passe obligatoirement par la fonction « wallet ».
drop policy if exists "payouts readable" on public.wallet_payouts;
create policy "payouts readable"
  on public.wallet_payouts for select
  to anon, authenticated using (true);


-- ---------- Vérification ----------
select table_name, column_name
from information_schema.columns
where table_schema = 'public'
  and table_name in ('wallet_owners', 'wallet_payouts')
order by table_name, ordinal_position;
