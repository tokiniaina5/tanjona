-- ============================================================
-- Ny asako Hôtellerie : les commandes des clients, par latabatra
--
-- À COLLER DANS : Supabase > SQL Editor > New query > Run. Tel quel :
-- il n'y a RIEN à remplacer. Se relance sans risque. Suppose
-- supabase-hotelerie-menu.sql déjà passé.
--
-- Le client ouvre le lien du menu (menu-sakafo.html?id=<hôtel>), choisit sa
-- latabatra et commande : la ligne arrive ici. Il n'a pas de compte — il peut
-- donc écrire une commande, mais ni la relire, ni la changer. L'hôtel, lui,
-- voit les siennes dans l'onglet « Commandes » (hotelerie.js), les marque
-- servies ou les efface.
-- ============================================================

-- Combien de latabatra a l'hôtel : le client choisit parmi elles.
alter table public.hotelerie_menu add column if not exists latabatra int not null default 10;

create table if not exists public.hotelerie_commande (
  id uuid primary key default gen_random_uuid(),
  hotel_id uuid not null references auth.users (id) on delete cascade,
  latabatra int not null check (latabatra between 1 and 500),
  -- [{anarana, vidiny, isa}] : ce qui a été commandé, au prix du moment.
  plats jsonb not null check (jsonb_typeof(plats) = 'array' and jsonb_array_length(plats) between 1 and 60),
  fanamarihana text check (char_length(fanamarihana) <= 300),
  vita boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists hotelerie_commande_hotel on public.hotelerie_commande (hotel_id, created_at desc);

alter table public.hotelerie_commande enable row level security;

-- Le client : seulement vers un hôtel qui a un menu en ligne, et jamais une
-- commande déjà « vita ».
drop policy if exists "commande ajout" on public.hotelerie_commande;
create policy "commande ajout" on public.hotelerie_commande for insert to anon, authenticated
  -- Les colonnes nommées en entier : « latabatra » existe aussi dans
  -- hotelerie_menu, et sans préfixe la sous-requête la prendrait chez elle.
  with check (
    hotelerie_commande.vita = false
    and exists (select 1 from public.hotelerie_menu m
                where m.user_id = hotelerie_commande.hotel_id
                  and hotelerie_commande.latabatra <= m.latabatra)
  );
drop policy if exists "commande lecture" on public.hotelerie_commande;
create policy "commande lecture" on public.hotelerie_commande for select to authenticated
  using (hotel_id = auth.uid());
drop policy if exists "commande vita" on public.hotelerie_commande;
create policy "commande vita" on public.hotelerie_commande for update to authenticated
  using (hotel_id = auth.uid()) with check (hotel_id = auth.uid());
drop policy if exists "commande fafana" on public.hotelerie_commande;
create policy "commande fafana" on public.hotelerie_commande for delete to authenticated
  using (hotel_id = auth.uid());

grant insert on public.hotelerie_commande to anon, authenticated;
grant select, update, delete on public.hotelerie_commande to authenticated;

-- ---------- Vérification ----------
select count(*) as regles from pg_policies where tablename = 'hotelerie_commande';
