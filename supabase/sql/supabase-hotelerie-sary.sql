-- ============================================================
-- Les sary du menu sakafo (Hasina Hôtellerie)
--
-- À COLLER DANS : Supabase > SQL Editor > New query > Run.
-- À passer APRÈS "supabase-hotelerie-menu.sql".
-- Se relance sans risque.
--
-- La photo d'un plat ne vit pas dans hotelerie_menu.plats : le menu se relit
-- toutes les 15 à 30 s, et des photos dedans le feraient retélécharger à
-- chaque tour. Elle va dans un bucket, et le plat n'en garde que l'adresse
-- (plat.sary) — que le navigateur, lui, garde en cache.
--
-- Le bucket est public : le menu est fait pour être vu par le client, sans
-- compte. Chacun n'écrit que dans son dossier : "<auth.uid()>/<fichier>.jpg".
-- ============================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('hotelerie-sary', 'hotelerie-sary', true, 524288, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = true, file_size_limit = 524288, allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

-- ---------- Qui touche à quoi ----------
-- La lecture publique passe par l'adresse publique ; cette règle sert au
-- propriétaire (le remplacement d'un fichier la demande).
drop policy if exists "hotelerie sary lecture" on storage.objects;
create policy "hotelerie sary lecture"
  on storage.objects for select to authenticated
  using (bucket_id = 'hotelerie-sary' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "hotelerie sary ecriture" on storage.objects;
create policy "hotelerie sary ecriture"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'hotelerie-sary' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "hotelerie sary remplacement" on storage.objects;
create policy "hotelerie sary remplacement"
  on storage.objects for update to authenticated
  using (bucket_id = 'hotelerie-sary' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'hotelerie-sary' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "hotelerie sary suppression" on storage.objects;
create policy "hotelerie sary suppression"
  on storage.objects for delete to authenticated
  using (bucket_id = 'hotelerie-sary' and (storage.foldername(name))[1] = auth.uid()::text);

-- ---------- Vérification ----------
-- Doit renvoyer le bucket, public.
select id, public, file_size_limit from storage.buckets where id = 'hotelerie-sary';
