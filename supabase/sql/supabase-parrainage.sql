-- Parrainage Binance et Payoneer (26/10/2026), dans « Inviter des amis ».
-- Chaque compte garde ici SON lien de parrainage de chaque plateforme :
-- c'est Binance ou Payoneer qui le paie, pas l'admin. La page ne fait que
-- garder le lien et le partager.

create table if not exists public.rohy_parrainage (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  binance text check (binance is null or char_length(binance) <= 300),
  payoneer text check (payoneer is null or char_length(payoneer) <= 300),
  updated_at timestamptz not null default now()
);
alter table public.rohy_parrainage enable row level security;

-- Mettre SON lien se paie, une fois (5 000 Ar, « spend » parrainage du
-- portefeuille, wallet_payouts kind « insite ») ; l'admin, lui, ne paie pas.
-- Le libellé est celui de SITE_ITEMS.parrainage (fonction wallet).
create or replace function public.parrainage_voaloa()
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.is_owner() or exists (
    select 1 from public.wallet_payouts p
    where p.email = lower(coalesce(auth.jwt() ->> 'email', ''))
      and p.kind = 'insite' and p.status = 'sent'
      and p.destination = 'Parrainage Binance & Payoneer'
  );
$$;
revoke all on function public.parrainage_voaloa() from public;
grant execute on function public.parrainage_voaloa() to authenticated;

drop policy if exists "parrainage an'ny tompony" on public.rohy_parrainage;
drop policy if exists "parrainage hitan'ny tompony" on public.rohy_parrainage;
create policy "parrainage hitan'ny tompony" on public.rohy_parrainage
  for select to authenticated using (user_id = auth.uid());
drop policy if exists "parrainage fafan'ny tompony" on public.rohy_parrainage;
create policy "parrainage fafan'ny tompony" on public.rohy_parrainage
  for delete to authenticated using (user_id = auth.uid());
drop policy if exists "parrainage voaloa ampidirina" on public.rohy_parrainage;
create policy "parrainage voaloa ampidirina" on public.rohy_parrainage
  for insert to authenticated with check (user_id = auth.uid() and public.parrainage_voaloa());
drop policy if exists "parrainage voaloa ovaina" on public.rohy_parrainage;
create policy "parrainage voaloa ovaina" on public.rohy_parrainage
  for update to authenticated using (user_id = auth.uid())
  with check (user_id = auth.uid() and public.parrainage_voaloa());

-- Les liens de l'admin se montrent à tous, dans la Botika (l'appli et
-- botika/) : un client qui s'inscrit chez Binance ou Payoneer par là fait
-- gagner l'admin, payé par la plateforme. Seule cette ligne-là sort.
create or replace function public.parrainage_admin()
returns table (binance text, payoneer text)
language sql stable security definer set search_path = public
as $$
  select r.binance, r.payoneer
  from public.rohy_parrainage r
  join auth.users u on u.id = r.user_id
  where u.email = 'rasolofonirainytokiniaina@gmail.com';
$$;
revoke all on function public.parrainage_admin() from public;
grant execute on function public.parrainage_admin() to anon, authenticated;
