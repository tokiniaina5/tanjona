-- ============================================================
-- « Comptes supprimés » : le propriétaire voit qui a effacé son compte
--
-- À COLLER DANS : Supabase > SQL Editor > New query > Run. Tel quel :
-- il n'y a RIEN à remplacer. Se relance sans risque.
--
-- La fonction fafao-kaonty (« Supprimer mon compte ») y écrit une ligne
-- juste avant d'effacer le compte : nom, email, téléphone, date
-- d'inscription. Elle écrit avec la clé service : aucune règle d'écriture
-- n'est ouverte aux comptes. Seul le propriétaire relit et efface.
-- ============================================================

create table if not exists public.kaonty_voafafa (
  id bigint generated always as identity primary key,
  user_id uuid,
  email text,
  name text,
  phone text,
  inscrit_le timestamptz,
  created_at timestamptz not null default now()
);

alter table public.kaonty_voafafa enable row level security;

drop policy if exists "owner reads deleted accounts" on public.kaonty_voafafa;
create policy "owner reads deleted accounts"
  on public.kaonty_voafafa for select
  to authenticated
  using (lower(auth.jwt() ->> 'email') = 'rasolofonirainytokiniaina@gmail.com');

drop policy if exists "owner deletes deleted accounts" on public.kaonty_voafafa;
create policy "owner deletes deleted accounts"
  on public.kaonty_voafafa for delete
  to authenticated
  using (lower(auth.jwt() ->> 'email') = 'rasolofonirainytokiniaina@gmail.com');

-- ---------- Vérification ----------
select policyname, cmd, qual from pg_policies where tablename = 'kaonty_voafafa';
