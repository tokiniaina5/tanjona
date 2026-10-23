-- ============================================================
-- « 👥 Ireo nanao inscription » : hitan'ny kaonty rehetra.
--
-- client_signups dia mbola ny tompony ihany no mahavaky azy (RLS,
-- supabase-securite-donnees.sql). Ity fonction ity no manome ny
-- lisitra ho an'ny rehetra :
--   - tsy misy session : ny anarana ihany (23/10/2026, nangatahin'ny tompony :
--     ny fenêtre niditra tamin'ny code de secours dia tsy manana session) ;
--   - kaonty miditra : anarana sy email (ilaina amin'ny hafatra ao anaty appli) ;
--   - admin : miampy ny laharana an-tariby.
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
  select s.name::text,
         case when auth.uid() is not null then s.email::text else null end,
         case when public.is_owner() then s.phone::text else null end,
         s.created_at
  from public.client_signups s
  order by s.created_at desc
  limit 1000
$$;

revoke all on function public.mpisoratra_rehetra() from public;
grant execute on function public.mpisoratra_rehetra() to anon, authenticated;
