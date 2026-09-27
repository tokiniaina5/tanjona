-- ============================================================
-- Le modèle Excel de facture propre à un client
--
-- À COLLER DANS : Supabase > SQL Editor > New query > Run. Tel quel :
-- il n'y a RIEN à remplacer. Se relance sans risque.
--
-- Un client qui a SA facture (un classeur .xlsx) la donne une fois : la page
-- Factures la garde, et chaque facture pour lui se remplit dans son modèle
-- (factures-modely.js). Un modèle par client et par compte ; le fichier,
-- petit, voyage en base64 dans la ligne même. Chacun ne voit que les siens.
-- ============================================================

create table if not exists public.facture_modely (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- Le nom du client en minuscules, sans espaces en trop : la clé.
  client_key text not null,
  client text not null,
  anarana text not null,          -- le nom du fichier .xlsx
  rakitra text not null,          -- le fichier, en base64
  updated_at timestamptz not null default now(),
  primary key (user_id, client_key)
);

alter table public.facture_modely enable row level security;

drop policy if exists "modely lecture" on public.facture_modely;
create policy "modely lecture" on public.facture_modely for select to authenticated
  using (user_id = auth.uid());
drop policy if exists "modely ajout" on public.facture_modely;
create policy "modely ajout" on public.facture_modely for insert to authenticated
  with check (user_id = auth.uid());
drop policy if exists "modely remplacement" on public.facture_modely;
create policy "modely remplacement" on public.facture_modely for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "modely suppression" on public.facture_modely;
create policy "modely suppression" on public.facture_modely for delete to authenticated
  using (user_id = auth.uid());

-- ---------- Vérification ----------
select count(*) as regles from pg_policies where tablename = 'facture_modely';
