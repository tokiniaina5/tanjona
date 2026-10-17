-- ============================================================
-- Hasina Hôtellerie : le menu sakafo, en ligne
--
-- À COLLER DANS : Supabase > SQL Editor > New query > Run. Tel quel :
-- il n'y a RIEN à remplacer. Se relance sans risque.
--
-- Chaque compte a UN menu : une ligne, les plats en JSON. La page de l'hôtel
-- (hotelerie.js) la réécrit à chaque changement ; la page publique
-- (menu-sakafo.html?id=<compte>) la lit. Le lien envoyé une fois montre donc
-- toujours le menu du moment. Tout le monde lit — c'est un menu, fait pour
-- être vu — mais seul le propriétaire écrit le sien.
-- ============================================================

create table if not exists public.hotelerie_menu (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  plats jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.hotelerie_menu enable row level security;

drop policy if exists "menu lecture" on public.hotelerie_menu;
create policy "menu lecture" on public.hotelerie_menu for select to anon, authenticated
  using (true);
drop policy if exists "menu ajout" on public.hotelerie_menu;
create policy "menu ajout" on public.hotelerie_menu for insert to authenticated
  with check (user_id = auth.uid());
drop policy if exists "menu remplacement" on public.hotelerie_menu;
create policy "menu remplacement" on public.hotelerie_menu for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

grant select on public.hotelerie_menu to anon, authenticated;
grant insert, update on public.hotelerie_menu to authenticated;

-- ---------- Vérification ----------
select count(*) as regles from pg_policies where tablename = 'hotelerie_menu';
