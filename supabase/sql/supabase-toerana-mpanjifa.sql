-- ============================================================
-- Toerana misy ny client — Ny asako
-- Chaque client colle dans Paramètres > « Mon profil » le lien Maps de
-- l'endroit où il se trouve. Le propriétaire le retrouve dans
-- « Nouvelles inscriptions » (bouton « 📍 Maps »).
--
-- client_signups reste fermée en écriture après l'inscription : le client
-- ne touche que son propre lien, par la fonction ci-dessous, et jamais le
-- nom ou le téléphone d'un autre.
-- ============================================================
alter table public.client_signups add column if not exists maps text;

create or replace function public.set_mon_lien_maps(lien text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  mon_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  propre text := nullif(trim(coalesce(lien, '')), '');
begin
  if mon_email = '' then return; end if;
  if propre is not null and propre !~* '^https?://' then
    raise exception 'lien invalide';
  end if;
  update public.client_signups
     set maps = left(propre, 500)
   where lower(email) = mon_email;
end;
$$;

revoke all on function public.set_mon_lien_maps(text) from public, anon;
grant execute on function public.set_mon_lien_maps(text) to authenticated;
