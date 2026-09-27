-- ============================================================
-- « 📄 PDF » en ligne : les PDF du site, retrouvés sur tout appareil
--
-- À COLLER DANS : Supabase > SQL Editor > New query > Run. Tel quel :
-- il n'y a RIEN à remplacer. Se relance sans risque.
--
-- Le fichier va dans un bucket FERMÉ ("pdf"), sous le dossier du compte :
-- "<auth.uid()>/<id>.pdf". La table n'en garde que le nom lisible, la sorte
-- (facture, photocopie, taratasy, nampidirina) et la taille. Chacun ne voit,
-- n'ajoute et n'efface que les siens — l'employé entré par son lien a son
-- propre compte, donc ses propres PDF.
-- ============================================================

create table if not exists public.pdf_rakitra (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  anarana text not null,
  karazana text,
  habe integer,
  created_at timestamptz not null default now()
);

create index if not exists pdf_rakitra_user_idx on public.pdf_rakitra (user_id, created_at desc);

alter table public.pdf_rakitra enable row level security;

drop policy if exists "pdf lecture" on public.pdf_rakitra;
create policy "pdf lecture" on public.pdf_rakitra for select to authenticated
  using (user_id = auth.uid());
drop policy if exists "pdf ajout" on public.pdf_rakitra;
create policy "pdf ajout" on public.pdf_rakitra for insert to authenticated
  with check (user_id = auth.uid());
drop policy if exists "pdf suppression" on public.pdf_rakitra;
create policy "pdf suppression" on public.pdf_rakitra for delete to authenticated
  using (user_id = auth.uid());

-- ---------- Le bucket ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('pdf', 'pdf', false, 26214400, array['application/pdf'])
on conflict (id) do nothing;

drop policy if exists "pdf fichier lecture" on storage.objects;
create policy "pdf fichier lecture" on storage.objects for select to authenticated
  using (bucket_id = 'pdf' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "pdf fichier ajout" on storage.objects;
create policy "pdf fichier ajout" on storage.objects for insert to authenticated
  with check (bucket_id = 'pdf' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "pdf fichier suppression" on storage.objects;
create policy "pdf fichier suppression" on storage.objects for delete to authenticated
  using (bucket_id = 'pdf' and (storage.foldername(name))[1] = auth.uid()::text);

-- ---------- Vérification ----------
select (select count(*) from pg_policies where tablename = 'pdf_rakitra') as regles_table,
       (select public from storage.buckets where id = 'pdf') as bucket_public;
