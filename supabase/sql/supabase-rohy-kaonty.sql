-- « 🔗 Ajouter les liens » ouvert à tous les comptes (22/10/2026).
-- Chaque compte tient ses propres canaux ; la ligne id = 1 de
-- contact_channels reste celle de l'admin, que voient les clients dans
-- « Message ». Seul l'admin peut désormais l'écrire : elle porte aussi les
-- anciennes coordonnées de paiement.

create table if not exists public.kaonty_rohy (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  whatsapp text,
  facebook text,
  instagram text,
  tiktok text,
  threads text,
  twitter text,
  wechat text,
  updated_at timestamptz not null default now()
);
alter table public.kaonty_rohy enable row level security;

drop policy if exists "rohy hitan'ny rehetra" on public.kaonty_rohy;
create policy "rohy hitan'ny rehetra" on public.kaonty_rohy
  for select to anon, authenticated using (true);
drop policy if exists "rohy an'ny tompony" on public.kaonty_rohy;
create policy "rohy an'ny tompony" on public.kaonty_rohy
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Les canaux ajoutés à la main : user_id vide = ceux de l'admin.
alter table public.contact_extra_channels add column if not exists user_id uuid references auth.users(id) on delete cascade;
create index if not exists contact_extra_channels_user_id_idx on public.contact_extra_channels(user_id);

drop policy if exists "anyone can add extra channels" on public.contact_extra_channels;
drop policy if exists "canal ampian'ny tompony" on public.contact_extra_channels;
create policy "canal ampian'ny tompony" on public.contact_extra_channels
  for insert to authenticated
  with check ((user_id is null and public.is_owner()) or user_id = auth.uid());

drop policy if exists "owner deletes extra channels" on public.contact_extra_channels;
drop policy if exists "canal fafan'ny tompony" on public.contact_extra_channels;
create policy "canal fafan'ny tompony" on public.contact_extra_channels
  for delete to authenticated
  using (public.is_owner() or user_id = auth.uid());

-- La ligne de l'admin : l'admin seul l'écrit.
drop policy if exists "anyone can update contact channels" on public.contact_channels;
drop policy if exists "anyone can write contact channels" on public.contact_channels;
drop policy if exists "admin manova contact channels" on public.contact_channels;
create policy "admin manova contact channels" on public.contact_channels
  for update to authenticated using (public.is_owner()) with check (public.is_owner());
drop policy if exists "admin manoratra contact channels" on public.contact_channels;
create policy "admin manoratra contact channels" on public.contact_channels
  for insert to authenticated with check (public.is_owner());
