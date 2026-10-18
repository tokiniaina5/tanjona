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
-- Le paiement : le client dit comment il paie (vola an-tanana, MVola,
-- Orange Money, Airtel Money vers le numéro de l'hôtel) et, s'il a déjà
-- envoyé, la référence de l'envoi. C'est l'hôtel qui coche « voaloa » : le
-- client ne peut pas se déclarer payé (la règle d'ajout l'exige faux).
alter table public.hotelerie_commande add column if not exists fandoavana text
  check (fandoavana in ('vola', 'mvola', 'orange', 'airtel', 'visa'));
alter table public.hotelerie_commande add column if not exists fandoavana_ref text
  check (char_length(fandoavana_ref) <= 60);
alter table public.hotelerie_commande add column if not exists voaloa boolean not null default false;
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
    and hotelerie_commande.voaloa = false
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

-- ---------- Le reçu du client ----------
-- Le client ne lit pas la table (la lecture est à l'hôtel seul). Pour que son
-- reçu dise « 💰 Voaloa » une fois que l'hôtel l'a coché, il demande l'état de
-- SES commandes, par leur identifiant — qu'il a tiré lui-même à l'envoi et
-- que personne d'autre ne connaît. Rien d'autre ne sort : ni plats, ni table.
create or replace function public.hotelerie_commande_sata(ids uuid[])
returns table (id uuid, vita boolean, voaloa boolean)
language sql stable security definer set search_path = public
as $$
  select c.id, c.vita, c.voaloa from public.hotelerie_commande c
  where c.id = any (ids[1:30]);
$$;
revoke all on function public.hotelerie_commande_sata(uuid[]) from public;
grant execute on function public.hotelerie_commande_sata(uuid[]) to anon, authenticated;

-- ---------- Le paiement, à part de la commande ----------
-- Le client commande d'abord, et paie quand il veut (souvent à la fin) : il
-- dit alors, pour SES commandes pas encore cochées « voaloa », comment il a
-- payé et la réf de son envoi. Il ne touche à rien d'autre — ni plats, ni
-- table, ni « voaloa », que l'hôtel seul coche.
create or replace function public.hotelerie_commande_handoa(ids uuid[], fomba text, ref text)
returns integer
language plpgsql volatile security definer set search_path = public
as $$
declare n integer;
begin
  if fomba is null or fomba not in ('vola', 'mvola', 'orange', 'airtel', 'visa') then
    raise exception 'fomba tsy fantatra';
  end if;
  update public.hotelerie_commande c
     set fandoavana = fomba,
         fandoavana_ref = case when fomba = 'vola' then null else nullif(left(trim(coalesce(ref, '')), 60), '') end
   where c.id = any (ids[1:30]) and c.voaloa = false;
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke all on function public.hotelerie_commande_handoa(uuid[], text, text) from public;
grant execute on function public.hotelerie_commande_handoa(uuid[], text, text) to anon, authenticated;

-- ---------- La carte (Visa) ----------
-- « visa » : le client paie par le lien de paiement par carte que l'hôtel a
-- donné (tete.vola.visa). Une base déjà installée garde l'ancienne règle :
-- on la remplace.
alter table public.hotelerie_commande drop constraint if exists hotelerie_commande_fandoavana_check;
alter table public.hotelerie_commande add constraint hotelerie_commande_fandoavana_check
  check (fandoavana in ('vola', 'mvola', 'orange', 'airtel', 'visa'));
