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

create policy "anyone can log a visit"
  on public.site_visits for insert
  to anon, authenticated
  with check (true);

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

create policy "anyone can send a message"
  on public.contact_messages for insert
  to anon, authenticated
  with check (true);

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

create policy "anyone can read site content"
  on public.site_content for select
  to anon, authenticated
  using (true);

create policy "only owner can write site content"
  on public.site_content for insert
  to authenticated
  with check (true);

create policy "only owner can update site content"
  on public.site_content for update
  to authenticated
  using (true);

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

create policy "anyone can place an order"
  on public.orders for insert
  to anon, authenticated
  with check (true);

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
-- 2. Dans Authentication > Providers > Email, désactiver
--    "Allow new users to sign up" pour qu'aucune autre personne
--    ne puisse créer un compte et accéder à l'admin.
-- ============================================================
