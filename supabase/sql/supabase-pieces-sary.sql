-- ============================================================
-- La photo de la pièce d'identité
--
-- À COLLER DANS : Supabase > SQL Editor > New query > Run.
-- À passer APRÈS "supabase-pieces-identite.sql".
-- Se relance sans risque.
--
-- La photo ne vit pas dans la table : elle va dans un bucket fermé, et la
-- ligne n'en garde que le chemin. Le bucket n'est pas public — une photo de
-- CIN qu'une adresse suffirait à ouvrir serait une photo perdue.
--
-- Chacun n'atteint que son propre dossier, nommé par son identifiant de
-- compte : "<auth.uid()>/<fichier>.jpg".
-- ============================================================

-- Deux faces : une CIN ne dit pas tout du même côté — le numéro et le nom
-- devant, la date et le lieu derrière.
alter table public.pieces_identite add column if not exists sary text;
alter table public.pieces_identite add column if not exists sary_verso text;

-- ---------- Le bucket ----------
insert into storage.buckets (id, name, public)
values ('pieces-identite', 'pieces-identite', false)
on conflict (id) do nothing;

-- ---------- Qui touche à quoi ----------
drop policy if exists "pieces sary lecture" on storage.objects;
create policy "pieces sary lecture"
  on storage.objects for select to authenticated
  using (bucket_id = 'pieces-identite' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "pieces sary ecriture" on storage.objects;
create policy "pieces sary ecriture"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'pieces-identite' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "pieces sary remplacement" on storage.objects;
create policy "pieces sary remplacement"
  on storage.objects for update to authenticated
  using (bucket_id = 'pieces-identite' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'pieces-identite' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "pieces sary suppression" on storage.objects;
create policy "pieces sary suppression"
  on storage.objects for delete to authenticated
  using (bucket_id = 'pieces-identite' and (storage.foldername(name))[1] = auth.uid()::text);

-- ---------- Vérification ----------
-- Doit renvoyer la colonne "sary" et le bucket fermé.
select (select count(*) from information_schema.columns
        where table_schema = 'public' and table_name = 'pieces_identite' and column_name = 'sary') as colonne_sary,
       (select public from storage.buckets where id = 'pieces-identite') as bucket_public;
