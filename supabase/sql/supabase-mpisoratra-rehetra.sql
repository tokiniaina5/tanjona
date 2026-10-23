-- ============================================================
-- « 👥 Ireo nanao inscription » : hitan'ny kaonty rehetra.
--
-- client_signups dia mbola ny tompony ihany no mahavaky azy (RLS,
-- supabase-securite-donnees.sql). Ity fonction ity no manome ny
-- lisitra ho an'ny kaonty rehetra miditra : anarana sy email (ilaina
-- amin'ny hafatra ao anaty appli). Ny laharana an-tariby dia ho an'ny
-- admin ihany.
--
-- À exécuter dans Supabase > SQL Editor. Rejouable sans risque.
-- ============================================================

create or replace function public.mpisoratra_rehetra()
returns table (name text, email text, phone text, created_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select s.name::text, s.email::text,
         case when public.is_owner() then s.phone::text else null end,
         s.created_at
  from public.client_signups s
  where auth.uid() is not null
  order by s.created_at desc
  limit 1000
$$;

revoke all on function public.mpisoratra_rehetra() from public, anon;
grant execute on function public.mpisoratra_rehetra() to authenticated;
