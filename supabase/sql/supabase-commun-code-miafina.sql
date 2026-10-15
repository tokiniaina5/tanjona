-- Le code de la porte « Mila alalana » ouvre désormais la page tout seul
-- (fonction commun-fiditra, qui le compare avec la clé de service). Il ne
-- doit donc plus se lire depuis le navigateur de celui qui l'attend : sinon,
-- demander suffirait, le code étant là, dans sa propre ligne.
--
-- La personne ne lit plus sa ligne ; elle demande seulement où elle en est
-- (commun_alalana_ahy), sans le code. Le propriétaire lit tout, comme avant.

create or replace function public.commun_alalana_ahy()
returns table (active boolean, voamarina boolean, nampiasaina_at timestamptz, anarana text)
language sql
stable
security definer
set search_path = public
as $$
  select a.active, a.voamarina, a.nampiasaina_at, a.anarana
  from public.commun_alalana a
  where lower(a.email) = lower(auth.jwt() ->> 'email')
  limit 1;
$$;

revoke all on function public.commun_alalana_ahy() from public, anon;
grant execute on function public.commun_alalana_ahy() to authenticated;

drop policy if exists "alalana lecture" on public.commun_alalana;
create policy "alalana lecture"
  on public.commun_alalana for select to authenticated
  using (lower(auth.jwt() ->> 'email') = 'rasolofonirainytokiniaina@gmail.com');
