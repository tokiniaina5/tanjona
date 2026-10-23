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

create or replace function public.sary_olona(emails text[])
returns table (email text, sary text)
language sql
stable
security definer
set search_path = public
as $$
  select p.email, p.sary
  from public.profil_sary p
  where auth.uid() is not null
    and p.email = any (select lower(trim(e)) from unnest(emails) e)
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
