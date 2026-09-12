-- ============================================================
-- Pointage : l'heure d'arrivée et l'heure de départ
--
-- À COLLER DANS : Supabase > SQL Editor > New query > Run.
-- Se relance sans risque : "if not exists" partout.
--
-- Demande d'abord "supabase-equipe.sql" : un pointage sans personne
-- à qui l'attacher ne veut rien dire.
--
-- Une ligne par venue. L'arrivée s'inscrit quand elle arrive, le
-- départ reste vide jusqu'au soir — c'est ce vide qui dit, sans
-- rien calculer, qui est encore au travail.
-- ============================================================

create table if not exists public.pointages (
  id uuid primary key default gen_random_uuid(),

  -- Le compte à qui tout cela appartient.
  owner_email text not null,

  -- Qui pointe. La venue s'efface avec la personne : elle n'a plus de
  -- sens seule, contrairement à une livraison, qui a eu lieu.
  equipe_id uuid not null references public.equipe(id) on delete cascade,

  arrivee timestamptz not null default now(),
  depart timestamptz,

  note text,
  created_at timestamptz not null default now()
);

-- On cherche toujours la même chose : les venues d'une personne, la
-- plus récente d'abord.
create index if not exists pointages_equipe_idx
  on public.pointages (equipe_id, arrivee desc);

-- Et, pour le tableau du jour : qui n'est pas encore reparti.
create index if not exists pointages_ouverts_idx
  on public.pointages (owner_email, depart);

alter table public.pointages enable row level security;

drop policy if exists "pointages lecture proprietaire" on public.pointages;
create policy "pointages lecture proprietaire"
  on public.pointages for select to authenticated
  using (lower(owner_email) = lower(auth.jwt() ->> 'email'));

drop policy if exists "pointages ecriture proprietaire" on public.pointages;
create policy "pointages ecriture proprietaire"
  on public.pointages for insert to authenticated
  with check (lower(owner_email) = lower(auth.jwt() ->> 'email'));

drop policy if exists "pointages modification proprietaire" on public.pointages;
create policy "pointages modification proprietaire"
  on public.pointages for update to authenticated
  using (lower(owner_email) = lower(auth.jwt() ->> 'email'))
  with check (lower(owner_email) = lower(auth.jwt() ->> 'email'));

drop policy if exists "pointages suppression proprietaire" on public.pointages;
create policy "pointages suppression proprietaire"
  on public.pointages for delete to authenticated
  using (lower(owner_email) = lower(auth.jwt() ->> 'email'));

-- ---------- Vérification ----------
select column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'pointages'
order by ordinal_position;
