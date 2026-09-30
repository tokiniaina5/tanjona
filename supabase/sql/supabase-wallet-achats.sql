-- Les achats du fil payés avec le portefeuille, l'argent tenu entre les deux.
--
-- Le panier (parametres.js) demande « achat » à la fonction wallet. Elle lit
-- le prix dans la base — jamais dans la page —, vérifie l'argent vraiment
-- payé de l'acheteur, et écrit ici une ligne « tazonina » : la somme a quitté
-- l'acheteur mais n'est pas encore chez le vendeur.
--
--   tazonina   tenue : sortie du solde de l'acheteur, pas encore chez le vendeur
--   voaray     l'acheteur a reçu l'entana : la somme entre chez le vendeur
--   naverina   rendue à l'acheteur (le vendeur ou le propriétaire l'a décidé)
--
-- Personne n'écrit ici depuis la page : seule la fonction wallet, avec la clé
-- de service. Chacun lit ce qui le concerne, comme acheteur ou comme vendeur.
--
-- À passer une fois. Rejouable sans dommage.

create table if not exists public.wallet_achats (
  id uuid primary key default gen_random_uuid(),
  buyer_email text not null,
  buyer_name text,
  seller_email text not null,
  seller_name text,
  news_id bigint,
  titre text,
  isa integer not null check (isa between 1 and 99),
  prix_ar bigint not null check (prix_ar > 0),
  amount_ar bigint not null check (amount_ar > 0),
  status text not null default 'tazonina' check (status in ('tazonina', 'voaray', 'naverina')),
  note text,
  created_at timestamptz not null default now(),
  settled_at timestamptz
);

create index if not exists wallet_achats_buyer_idx on public.wallet_achats (buyer_email, created_at desc);
create index if not exists wallet_achats_seller_idx on public.wallet_achats (seller_email, created_at desc);

alter table public.wallet_achats enable row level security;

drop policy if exists "read your own purchases and sales" on public.wallet_achats;
create policy "read your own purchases and sales"
  on public.wallet_achats for select
  to authenticated
  using (
    lower(buyer_email) = lower(auth.jwt() ->> 'email')
    or lower(seller_email) = lower(auth.jwt() ->> 'email')
  );
-- Aucune règle d'écriture : insert, update et delete sont refusés à tous,
-- sauf à la fonction wallet (clé de service, qui passe outre).
