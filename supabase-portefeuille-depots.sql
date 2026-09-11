-- ============================================================
-- Portefeuille : faire ENTRER de l'argent venu du dehors
--
-- À COLLER DANS : Supabase > SQL Editor > New query > Run.
-- Se relance sans risque : "if not exists" partout.
--
-- Jusqu'ici le solde ne pouvait que descendre : il naissait du
-- parrainage, puis sortait en retraits ou se dépensait dans
-- l'application. Rien ne pouvait y entrer.
--
-- Cette table reçoit les versements. Personne ne l'écrit depuis le
-- navigateur : c'est la fonction qui écoute le fournisseur de paiement
-- qui y inscrit une ligne, et elle seule — sans quoi il suffirait de
-- déclarer un versement pour se créditer soi-même.
-- ============================================================

create table if not exists public.wallet_deposits (
  id uuid primary key default gen_random_uuid(),

  -- À qui la somme revient. C'est l'email du compte, comme partout
  -- ailleurs dans le portefeuille.
  email text not null,

  -- En ariary, entier. Le portefeuille ne compte qu'en ariary ; les
  -- devises se convertissent au moment d'entrer.
  amount_ar integer not null check (amount_ar > 0),

  -- Qui a encaissé : 'mvola', 'orange', 'airtel', 'paypal'...
  provider text not null,

  -- La référence de la transaction CHEZ le fournisseur. C'est elle qui
  -- empêche de créditer deux fois : un fournisseur qui répète sa
  -- notification — ils le font tous quand ils doutent d'avoir été
  -- entendus — retombe sur la même ligne.
  provider_ref text not null,

  -- 'confirme' : l'argent est arrivé, le solde le compte.
  -- 'en_attente' : annoncé, pas encore confirmé — le solde l'ignore.
  -- 'refuse' : annulé ou remboursé.
  status text not null default 'en_attente',

  -- La notification telle qu'elle est arrivée. On la garde entière :
  -- le jour où un versement est contesté, c'est la seule pièce.
  raw jsonb,

  note text,
  created_at timestamptz not null default now(),
  confirmed_at timestamptz
);

-- Deux fois la même transaction du même fournisseur : une seule ligne.
create unique index if not exists wallet_deposits_ref_unique
  on public.wallet_deposits (provider, provider_ref);

-- Le solde se recalcule à chaque fois pour un email donné : il lui faut
-- cet index, sans quoi il relit toute la table.
create index if not exists wallet_deposits_email_idx
  on public.wallet_deposits (email, status);

alter table public.wallet_deposits enable row level security;

-- Chacun voit ses propres versements, et rien d'autre.
drop policy if exists "wallet_deposits_lecture_proprietaire" on public.wallet_deposits;
create policy "wallet_deposits_lecture_proprietaire"
  on public.wallet_deposits for select
  to authenticated
  using (lower(email) = lower(auth.jwt() ->> 'email'));

-- Personne n'écrit depuis le navigateur. Aucune policy d'insertion,
-- d'update ou de delete : seule la clé de service — celle des fonctions
-- Edge, qui ne quitte jamais le serveur — peut le faire.

-- ---------- Vérification ----------
-- Doit renvoyer les colonnes de la table.
select column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name = 'wallet_deposits'
order by ordinal_position;
