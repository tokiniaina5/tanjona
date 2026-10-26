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

drop policy if exists "parrainage an'ny tompony" on public.rohy_parrainage;
create policy "parrainage an'ny tompony" on public.rohy_parrainage
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
