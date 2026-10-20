-- ============================================================
-- Ny asako Hôtellerie : la lakozia (cuisine) reçoit les commandes
--
-- À COLLER DANS : Supabase > SQL Editor > New query > Run. Tel quel :
-- il n'y a RIEN à remplacer. Se relance sans risque. Suppose
-- supabase-hotelerie-commande.sql déjà passé.
--
-- La cuisine n'a pas de compte : elle ouvre lakozia.html?id=<hôtel>&k=<code>,
-- un lien que l'hôtel donne depuis l'onglet « Commandes ». Le code, tiré au
-- hasard par l'hôtel, est la clé : sans lui, rien ne sort. L'hôtel peut le
-- changer, et l'ancien lien ne sert plus.
-- ============================================================

create table if not exists public.hotelerie_lakozia (
  hotel_id uuid primary key references auth.users (id) on delete cascade,
  code text not null check (char_length(code) between 16 and 64),
  updated_at timestamptz not null default now()
);
alter table public.hotelerie_lakozia enable row level security;

-- Le code ne se lit que par l'hôtel lui-même.
drop policy if exists "lakozia tompony" on public.hotelerie_lakozia;
create policy "lakozia tompony" on public.hotelerie_lakozia for all to authenticated
  using (hotel_id = auth.uid()) with check (hotel_id = auth.uid());
grant select, insert, update, delete on public.hotelerie_lakozia to authenticated;

-- Les commandes du jour, pour la cuisine : ce qu'il faut préparer, sans
-- l'argent (ni prix payé, ni moyen de paiement). Un code faux est une
-- erreur, et non une liste vide : la page dit alors que le lien ne vaut plus.
create or replace function public.hotelerie_lakozia_lisitra(hotel uuid, code text)
returns table (id uuid, latabatra int, plats jsonb, fanamarihana text, vita boolean, created_at timestamptz)
language plpgsql stable security definer set search_path = public
as $$
begin
  if not exists (select 1 from public.hotelerie_lakozia l where l.hotel_id = hotel and l.code = hotelerie_lakozia_lisitra.code) then
    raise exception 'code diso' using errcode = '28000';
  end if;
  return query
    select c.id, c.latabatra, c.plats, c.fanamarihana, c.vita, c.created_at
    from public.hotelerie_commande c
    where c.hotel_id = hotel and c.created_at > now() - interval '24 hours'
    order by c.created_at asc
    limit 200;
end;
$$;
revoke all on function public.hotelerie_lakozia_lisitra(uuid, text) from public;
grant execute on function public.hotelerie_lakozia_lisitra(uuid, text) to anon, authenticated;

-- La cuisine dit « vita » (prêt / servi), ou le reprend.
create or replace function public.hotelerie_lakozia_vita(hotel uuid, code text, commande uuid, vita boolean)
returns integer
language plpgsql volatile security definer set search_path = public
as $$
declare n integer;
begin
  if not exists (select 1 from public.hotelerie_lakozia l where l.hotel_id = hotel and l.code = hotelerie_lakozia_vita.code) then
    raise exception 'code diso';
  end if;
  update public.hotelerie_commande c set vita = coalesce(hotelerie_lakozia_vita.vita, true)
   where c.id = commande and c.hotel_id = hotel;
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke all on function public.hotelerie_lakozia_vita(uuid, text, uuid, boolean) from public;
grant execute on function public.hotelerie_lakozia_vita(uuid, text, uuid, boolean) to anon, authenticated;

-- ---------- « Tonga tany an-dakozia » ----------
-- La page de la cuisine, ouverte, dit avoir reçu les commandes (et sonné) :
-- lakozia_at. Le reçu du client, à la latabatra, l'affiche (🔔).
alter table public.hotelerie_commande add column if not exists lakozia_at timestamptz;

create or replace function public.hotelerie_lakozia_re(hotel uuid, code text, ids uuid[])
returns integer
language plpgsql volatile security definer set search_path = public
as $$
declare n integer;
begin
  if not exists (select 1 from public.hotelerie_lakozia l where l.hotel_id = hotel and l.code = hotelerie_lakozia_re.code) then
    raise exception 'code diso' using errcode = '28000';
  end if;
  update public.hotelerie_commande c set lakozia_at = now()
   where c.id = any (ids[1:200]) and c.hotel_id = hotel and c.lakozia_at is null;
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke all on function public.hotelerie_lakozia_re(uuid, text, uuid[]) from public;
grant execute on function public.hotelerie_lakozia_re(uuid, text, uuid[]) to anon, authenticated;

-- L'état du reçu porte désormais « lakozia » : le type de retour change, la
-- fonction de supabase-hotelerie-commande.sql est donc remplacée en entier.
drop function if exists public.hotelerie_commande_sata(uuid[]);
create function public.hotelerie_commande_sata(ids uuid[])
returns table (id uuid, vita boolean, voaloa boolean, lakozia boolean)
language sql stable security definer set search_path = public
as $$
  select c.id, c.vita, c.voaloa, c.lakozia_at is not null from public.hotelerie_commande c
  where c.id = any (ids[1:30]);
$$;
revoke all on function public.hotelerie_commande_sata(uuid[]) from public;
grant execute on function public.hotelerie_commande_sata(uuid[]) to anon, authenticated;
