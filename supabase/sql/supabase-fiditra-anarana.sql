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
