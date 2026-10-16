-- Fidirana amin'ny anarana (Fokontany) : retrouver les emails d'un nom.
--
-- Le nom est celui posé à l'inscription (raw_user_meta_data.name). Plusieurs
-- comptes peuvent porter le même : la fonction les rend tous, et c'est le mot
-- de passe qui tranche (fonction fiditra-anarana).
--
-- Réservée à la clé de service : un visiteur ne doit pas pouvoir lire les
-- emails des autres en devinant des noms.

create or replace function public.emails_avy_anarana(p_anarana text)
returns setof text
language sql
stable
security definer
set search_path = public, auth
as $$
  select u.email::text
  from auth.users u
  where u.email is not null
    and length(trim(coalesce(p_anarana, ''))) > 0
    and lower(regexp_replace(trim(coalesce(u.raw_user_meta_data->>'name', '')), '\s+', ' ', 'g'))
      = lower(regexp_replace(trim(p_anarana), '\s+', ' ', 'g'))
  order by u.last_sign_in_at desc nulls last
  limit 10;
$$;

revoke all on function public.emails_avy_anarana(text) from public, anon, authenticated;
grant execute on function public.emails_avy_anarana(text) to service_role;

-- Fidirana amin'ny last name ihany : les emails dont le nom de famille est
-- celui-là. last_name quand l'inscription l'a posé ; sinon le premier ou le
-- dernier mot du nom (« Nom Prénoms » des anciens comptes, « Prénom Nom »
-- des nouveaux). Le mot de passe tranche entre les homonymes.
create or replace function public.emails_avy_farany(p_farany text)
returns setof text
language sql
stable
security definer
set search_path = public, auth
as $$
  with n as (
    select lower(regexp_replace(trim(coalesce(p_farany, '')), '\s+', ' ', 'g')) as v
  )
  select u.email::text
  from auth.users u, n
  where u.email is not null
    and length(n.v) > 0
    and (
      lower(trim(coalesce(u.raw_user_meta_data->>'last_name', ''))) = n.v
      or lower(regexp_replace(trim(coalesce(u.raw_user_meta_data->>'name', '')), '\s+', ' ', 'g')) = n.v
      or lower(regexp_replace(trim(coalesce(u.raw_user_meta_data->>'name', '')), '\s+', ' ', 'g')) like n.v || ' %'
      or lower(regexp_replace(trim(coalesce(u.raw_user_meta_data->>'name', '')), '\s+', ' ', 'g')) like '% ' || n.v
    )
  order by u.last_sign_in_at desc nulls last
  limit 25;
$$;

revoke all on function public.emails_avy_farany(text) from public, anon, authenticated;
grant execute on function public.emails_avy_farany(text) to service_role;

-- Fidirana amin'ny laharana finday : les emails dont le téléphone posé à
-- l'inscription (raw_user_meta_data.phone) finit par les mêmes 9 chiffres —
-- « 034 12 345 67 » et « +261 34 12 345 67 » sont le même numéro. Le mot de
-- passe tranche entre les comptes qui le partagent.
create or replace function public.emails_avy_finday(p_finday text)
returns setof text
language sql
stable
security definer
set search_path = public, auth
as $$
  with n as (
    select right(regexp_replace(coalesce(p_finday, ''), '\D', '', 'g'), 9) as v
  )
  select u.email::text
  from auth.users u, n
  where u.email is not null
    and length(n.v) = 9
    and right(regexp_replace(coalesce(u.raw_user_meta_data->>'phone', ''), '\D', '', 'g'), 9) = n.v
  order by u.last_sign_in_at desc nulls last
  limit 25;
$$;

revoke all on function public.emails_avy_finday(text) from public, anon, authenticated;
grant execute on function public.emails_avy_finday(text) to service_role;
