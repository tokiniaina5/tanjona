-- ============================================================
-- Schéma Supabase pour le site de Tanjona
-- À exécuter UNE FOIS dans : Supabase Dashboard > SQL Editor
-- ============================================================

-- 1) Visites du site (écrites par n'importe quel visiteur, lues par le propriétaire uniquement)
create table if not exists public.site_visits (
  id uuid primary key default gen_random_uuid(),
  path text,
  referrer text,
  user_agent text,
  created_at timestamptz default now()
);

alter table public.site_visits enable row level security;

drop policy if exists "anyone can log a visit" on public.site_visits;
create policy "anyone can log a visit"
  on public.site_visits for insert
  to anon, authenticated
  with check (true);

drop policy if exists "only owner can read visits" on public.site_visits;
create policy "only owner can read visits"
  on public.site_visits for select
  to authenticated
  using (true);


-- 2) Messages du formulaire de contact (écrits par n'importe quel visiteur, lus par le propriétaire uniquement)
create table if not exists public.contact_messages (
  id uuid primary key default gen_random_uuid(),
  name text,
  email text,
  message text,
  created_at timestamptz default now()
);

alter table public.contact_messages enable row level security;

drop policy if exists "anyone can send a message" on public.contact_messages;
create policy "anyone can send a message"
  on public.contact_messages for insert
  to anon, authenticated
  with check (true);

drop policy if exists "only owner can read messages" on public.contact_messages;
create policy "only owner can read messages"
  on public.contact_messages for select
  to authenticated
  using (true);


-- 3) Contenu du site (lu par tout le monde pour l'afficher, modifié par le propriétaire uniquement)
create table if not exists public.site_content (
  key text primary key,
  value text,
  updated_at timestamptz default now()
);

alter table public.site_content enable row level security;

drop policy if exists "anyone can read site content" on public.site_content;
create policy "anyone can read site content"
  on public.site_content for select
  to anon, authenticated
  using (true);

drop policy if exists "only owner can write site content" on public.site_content;
create policy "only owner can write site content"
  on public.site_content for insert
  to authenticated
  with check (true);

drop policy if exists "only owner can update site content" on public.site_content;
create policy "only owner can update site content"
  on public.site_content for update
  to authenticated
  using (true);

drop policy if exists "only owner can delete site content" on public.site_content;
create policy "only owner can delete site content"
  on public.site_content for delete
  to authenticated
  using (true);


-- 4) Commandes de la boutique (écrites par n'importe quel visiteur, lues par le propriétaire uniquement)
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  customer_name text,
  customer_phone text,
  payment_method text,
  items text,
  total numeric,
  created_at timestamptz default now()
);

alter table public.orders enable row level security;

drop policy if exists "anyone can place an order" on public.orders;
create policy "anyone can place an order"
  on public.orders for insert
  to anon, authenticated
  with check (true);

drop policy if exists "only owner can read orders" on public.orders;
create policy "only owner can read orders"
  on public.orders for select
  to authenticated
  using (true);


-- ============================================================
-- Étape suivante (à faire manuellement, une seule fois) :
--
-- 1. Aller dans Supabase Dashboard > Authentication > Users
--    > "Add user" et créer VOTRE compte (email + mot de passe).
--    C'est ce compte qui vous servira à vous connecter sur
--    /admin.html du site.
--
-- 2. ATTENTION — ne PAS désactiver "Allow new users to sign up" :
--    les clients de "Gestion de Stockage" créent eux-mêmes leur
--    compte à leur première connexion. L'accès à /admin.html reste
--    réservé par l'email du propriétaire, pas par ce réglage.
--
-- 3. Authentication > Sign In / Providers > Email : décocher
--    "Confirm email" pour que le client entre directement après
--    avoir créé son compte (sinon il doit valider un mail d'abord).
-- ============================================================


-- ============================================================
-- Application "Gestion de Stockage" — tables partagées entre tous
-- les clients (canaux de contact, liens, actualités, parrainages).
-- ============================================================

-- Canaux de contact du propriétaire : une seule ligne (id = 1),
-- lue par tous les clients, modifiée par le propriétaire seul.
create table if not exists public.contact_channels (
  id integer primary key default 1,
  site_url text,
  paypal text,
  card_link text,                     -- lien de paiement par carte internationale
                                      -- (Stripe, PayPal…) pour un client sans PayPal
  bank_label text,                    -- nom de la banque du propriétaire
  bank_code text,                     -- code banque   (ex. 00008)
  bank_agency text,                   -- code agence   (ex. 03016)
  bank_account text,                  -- n° de compte  (ex. 05001514368)
  bank_key text,                      -- clé RIB       (ex. 86)
  mvola text,                         -- numéro MVola        (Telma)
  orange_money text,                  -- numéro Orange Money
  airtel_money text,                  -- numéro Airtel Money
  whatsapp text,
  facebook text,
  instagram text,
  tiktok text,
  threads text,
  twitter text,
  wechat text,
  updated_at timestamptz default now()
);

-- si la table existe déjà depuis une version précédente
alter table public.contact_channels add column if not exists card_link text;
alter table public.contact_channels add column if not exists bank_label text;
alter table public.contact_channels add column if not exists bank_code text;
alter table public.contact_channels add column if not exists bank_agency text;
alter table public.contact_channels add column if not exists bank_account text;
alter table public.contact_channels add column if not exists bank_key text;
alter table public.contact_channels add column if not exists mvola text;
alter table public.contact_channels add column if not exists orange_money text;
alter table public.contact_channels add column if not exists airtel_money text;

alter table public.contact_channels enable row level security;

drop policy if exists "anyone can read contact channels" on public.contact_channels;
create policy "anyone can read contact channels"
  on public.contact_channels for select
  to anon, authenticated using (true);

drop policy if exists "anyone can write contact channels" on public.contact_channels;
create policy "anyone can write contact channels"
  on public.contact_channels for insert
  to anon, authenticated with check (true);

drop policy if exists "anyone can update contact channels" on public.contact_channels;
create policy "anyone can update contact channels"
  on public.contact_channels for update
  to anon, authenticated using (true);


-- Canaux de contact supplémentaires ajoutés par le propriétaire
create table if not exists public.contact_extra_channels (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  url text not null,
  created_at timestamptz default now()
);

alter table public.contact_extra_channels enable row level security;

drop policy if exists "anyone can read extra channels" on public.contact_extra_channels;
create policy "anyone can read extra channels"
  on public.contact_extra_channels for select
  to anon, authenticated using (true);

drop policy if exists "anyone can add extra channels" on public.contact_extra_channels;
create policy "anyone can add extra channels"
  on public.contact_extra_channels for insert
  to anon, authenticated with check (true);


-- Liens "Achats internationaux" (Alibaba, AliExpress, ...)
create table if not exists public.marketplace_links (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  url text not null,
  created_at timestamptz default now()
);

alter table public.marketplace_links enable row level security;

drop policy if exists "anyone can read marketplace links" on public.marketplace_links;
create policy "anyone can read marketplace links"
  on public.marketplace_links for select
  to anon, authenticated using (true);

drop policy if exists "anyone can add marketplace links" on public.marketplace_links;
create policy "anyone can add marketplace links"
  on public.marketplace_links for insert
  to anon, authenticated with check (true);


-- Fil d'actualité de l'accueil (annonces publiées par les clients)
create table if not exists public.client_news (
  id uuid primary key default gen_random_uuid(),
  client_name text,
  network text,
  message text,
  link text,
  type text,
  price numeric,
  image text,
  created_at timestamptz default now()
);

alter table public.client_news enable row level security;

drop policy if exists "anyone can read client news" on public.client_news;
create policy "anyone can read client news"
  on public.client_news for select
  to anon, authenticated using (true);

drop policy if exists "anyone can publish client news" on public.client_news;
create policy "anyone can publish client news"
  on public.client_news for insert
  to anon, authenticated with check (true);


-- Parrainages : 1 ligne par personne arrivée via un lien d'invitation
create table if not exists public.referrals (
  id uuid primary key default gen_random_uuid(),
  inviter_id text not null,
  referred_id text not null unique,
  created_at timestamptz default now()
);

alter table public.referrals enable row level security;

drop policy if exists "anyone can read referrals" on public.referrals;
create policy "anyone can read referrals"
  on public.referrals for select
  to anon, authenticated using (true);

drop policy if exists "anyone can record a referral" on public.referrals;
create policy "anyone can record a referral"
  on public.referrals for insert
  to anon, authenticated with check (true);


-- ============================================================
-- Demandes de déblocage (mot de passe oublié) — Gestion de Stockage
-- Le client règle des frais de déblocage sur le PayPal du propriétaire,
-- puis envoie sa demande. Le propriétaire la confirme depuis Paramètres :
-- l'accès se rouvre alors tout seul sur l'appareil du client (aucun code).
-- ============================================================
alter table public.contact_channels add column if not exists paypal text;

create table if not exists public.unlock_requests (
  id uuid primary key default gen_random_uuid(),
  name text,
  email text not null,
  phone text,
  message text,
  amount integer default 20000,
  paypal_reference text,
  status text default 'pending',      -- pending | confirmed | used
  device_hash text,                   -- SHA-256 du jeton de l'appareil qui a envoyé la demande
                                      -- (seul cet appareil peut rouvrir l'accès ; aucun code ne circule)
  confirmed_at timestamptz,
  expires_at timestamptz,
  used_at timestamptz,
  created_at timestamptz default now()
);

-- si la table existe déjà depuis une version précédente
alter table public.unlock_requests add column if not exists device_hash text;
-- 'paypal', 'card' ou 'bank' : dit au propriétaire sur quel compte vérifier
-- l'arrivée de l'argent avant de confirmer.
alter table public.unlock_requests add column if not exists payment_method text default 'paypal';
-- Renseignées par la fonction "paypal-webhook" quand PayPal annonce que
-- l'argent est réellement arrivé sur le compte du propriétaire. Tant que le
-- solde ne bouge pas, elles restent vides et rien ne se déclenche.
alter table public.unlock_requests add column if not exists paid_amount numeric;
alter table public.unlock_requests add column if not exists paid_currency text;
-- La somme reçue convertie en ariary, pour la comparer aux 20 000 Ar.
alter table public.unlock_requests add column if not exists paid_amount_ar numeric;
alter table public.unlock_requests add column if not exists auto_confirmed boolean default false;
alter table public.unlock_requests add column if not exists paypal_capture_id text;
-- Un même encaissement PayPal ne peut débloquer qu'une seule demande.
create unique index if not exists unlock_requests_capture_uniq
  on public.unlock_requests (paypal_capture_id)
  where paypal_capture_id is not null;

alter table public.unlock_requests enable row level security;

drop policy if exists "anyone can send an unlock request" on public.unlock_requests;
create policy "anyone can send an unlock request"
  on public.unlock_requests for insert
  to anon, authenticated
  with check (true);

drop policy if exists "anyone can read unlock requests" on public.unlock_requests;
create policy "anyone can read unlock requests"
  on public.unlock_requests for select
  to anon, authenticated
  using (true);

drop policy if exists "anyone can update unlock requests" on public.unlock_requests;
create policy "anyone can update unlock requests"
  on public.unlock_requests for update
  to anon, authenticated
  using (true);


-- ============================================================
-- Inscriptions des clients — Gestion de Stockage
-- Chaque nouvelle inscription est envoyée automatiquement ici :
-- le propriétaire la voit dans Paramètres > "Nouvelles inscriptions"
-- (et dans /admin.html via contact_messages).
-- ============================================================
create table if not exists public.client_signups (
  id uuid primary key default gen_random_uuid(),
  name text,
  email text not null,
  phone text,
  created_at timestamptz default now()
);

alter table public.client_signups enable row level security;

drop policy if exists "anyone can record a signup" on public.client_signups;
create policy "anyone can record a signup"
  on public.client_signups for insert
  to anon, authenticated
  with check (true);

drop policy if exists "anyone can read signups" on public.client_signups;
create policy "anyone can read signups"
  on public.client_signups for select
  to anon, authenticated
  using (true);


-- ============================================================
-- Sécurité — Gestion de Stockage
-- Journal des tentatives suspectes (second compte ouvert sous
-- l'identité d'un client, entrées forcées) et comptes bloqués.
-- Seul le propriétaire consulte tout cela, dans son espace admin.
-- ============================================================
create table if not exists public.security_events (
  id uuid primary key default gen_random_uuid(),
  kind text not null,                 -- duplicate_identity | brute_force | unknown_device
  target text not null,               -- client | admin
  email text,                         -- compte visé
  name text,
  phone text,
  detail text,
  device_hash text,
  blocked boolean default false,
  created_at timestamptz default now()
);

alter table public.security_events enable row level security;

drop policy if exists "anyone can report a security event" on public.security_events;
create policy "anyone can report a security event"
  on public.security_events for insert
  to anon, authenticated
  with check (true);

drop policy if exists "anyone can read security events" on public.security_events;
create policy "anyone can read security events"
  on public.security_events for select
  to anon, authenticated
  using (true);


-- Comptes bloqués : l'application refuse de s'ouvrir tant que le
-- propriétaire n'a pas levé le blocage depuis son espace admin.
create table if not exists public.blocked_accounts (
  email text primary key,
  reason text,
  blocked_at timestamptz default now(),
  released_at timestamptz,
  active boolean default true
);

alter table public.blocked_accounts enable row level security;

drop policy if exists "anyone can read blocked accounts" on public.blocked_accounts;
create policy "anyone can read blocked accounts"
  on public.blocked_accounts for select
  to anon, authenticated
  using (true);

drop policy if exists "anyone can block an account" on public.blocked_accounts;
create policy "anyone can block an account"
  on public.blocked_accounts for insert
  to anon, authenticated
  with check (true);

drop policy if exists "anyone can update a blocked account" on public.blocked_accounts;
create policy "anyone can update a blocked account"
  on public.blocked_accounts for update
  to anon, authenticated
  using (true);
