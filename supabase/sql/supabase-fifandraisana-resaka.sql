-- ============================================================
-- Pejy « 💬 Message » : sary tena izy sy fangatahana alohan'ny resaka.
--
-- 1) sary_olona(emails) : ny vignette (profil_sary) an'ireo olona ao
--    amin'ny lisitra, hitan'ny kaonty rehetra miditra.
-- 2) fifandraisana_resaka : tsy afaka mandefa hafatra amin'ny olona iray
--    raha tsy nanaiky ny fangatahana (« Ekena ») izy.
--
-- À exécuter dans Supabase > SQL Editor. Rejouable sans risque.
-- ============================================================

-- Tsy misy vignette (profil_sary) : ny sary voatahiry ao amin'ny kaonty no
-- raisina (28/10/2026) — ny sary profil taloha (logo), avy eo ny an'i
-- Google na GitHub (avatar_url, picture). 5 monja tamin'ny kaonty 41 no
-- nanana vignette, ka litera no hita tamin'ny ankamaroany.
create or replace function public.sary_olona(emails text[])
returns table (email text, sary text)
language sql
stable
security definer
set search_path = public
as $$
  with ny as (
    select distinct lower(trim(e)) as email from unnest(emails) e
  ), voafidy as (
    select ny.email,
      coalesce(
        p.sary,
        case when u.raw_user_meta_data->>'logo' like 'data:image/%' then u.raw_user_meta_data->>'logo' end,
        case when u.raw_user_meta_data->>'avatar_url' like 'https://%' then u.raw_user_meta_data->>'avatar_url' end,
        case when u.raw_user_meta_data->>'picture' like 'https://%' then u.raw_user_meta_data->>'picture' end
      ) as sary
    from ny
    left join public.profil_sary p on p.email = ny.email
    left join lateral (
      select x.raw_user_meta_data from auth.users x
      where lower(x.email) = ny.email limit 1
    ) u on true
  )
  select v.email, v.sary from voafidy v
  where auth.uid() is not null and v.sary is not null
  limit 300
$$;
revoke all on function public.sary_olona(text[]) from public, anon;
grant execute on function public.sary_olona(text[]) to authenticated;

create table if not exists public.fifandraisana_resaka (
  id uuid primary key default gen_random_uuid(),
  avy text not null,                 -- ilay nangataka (email)
  ho text not null,                  -- ilay nangatahina (email)
  sata text not null default 'miandry' check (sata in ('miandry', 'nekena', 'nolavina')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (avy, ho)
);
alter table public.fifandraisana_resaka enable row level security;

drop policy if exists "fifandraisana hitan'ny roa" on public.fifandraisana_resaka;
create policy "fifandraisana hitan'ny roa" on public.fifandraisana_resaka for select to authenticated
  using (lower(auth.jwt() ->> 'email') in (avy, ho));

-- Ny tenany ihany no mangataka, ary « miandry » foana ny fangatahana vaovao.
drop policy if exists "fifandraisana mangataka" on public.fifandraisana_resaka;
create policy "fifandraisana mangataka" on public.fifandraisana_resaka for insert to authenticated
  with check (avy = lower(auth.jwt() ->> 'email') and sata = 'miandry' and ho <> avy);

-- Ilay nangatahina no manaiky na mandà.
drop policy if exists "fifandraisana mamaly" on public.fifandraisana_resaka;
create policy "fifandraisana mamaly" on public.fifandraisana_resaka for update to authenticated
  using (ho = lower(auth.jwt() ->> 'email'))
  with check (ho = lower(auth.jwt() ->> 'email'));

-- Ilay nangataka dia afaka mangataka indray (miverina « miandry »).
drop policy if exists "fifandraisana mangataka indray" on public.fifandraisana_resaka;
create policy "fifandraisana mangataka indray" on public.fifandraisana_resaka for update to authenticated
  using (avy = lower(auth.jwt() ->> 'email'))
  with check (avy = lower(auth.jwt() ->> 'email') and sata = 'miandry');

drop policy if exists "fifandraisana fafana" on public.fifandraisana_resaka;
create policy "fifandraisana fafana" on public.fifandraisana_resaka for delete to authenticated
  using (lower(auth.jwt() ->> 'email') in (avy, ho));

grant select, insert, update, delete on public.fifandraisana_resaka to authenticated;
