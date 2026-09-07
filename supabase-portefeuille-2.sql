-- ============================================================
-- Portefeuille : sortir l'argent par n'importe quel canal
--
-- À COLLER DANS : Supabase > SQL Editor > New query > Run.
-- Se relance sans risque : "if not exists" partout.
--
-- Jusqu'ici un retrait n'avait que trois destinations possibles.
-- Il en accepte désormais autant qu'il en existe : un point cash,
-- un autre portefeuille (Wise, Payoneer, Skrill...), ou le paiement
-- d'un achat chez un marchand à l'étranger. D'où trois colonnes de
-- plus : de quel genre de sortie il s'agit, le lien du service, et
-- les consignes à suivre.
-- ============================================================

-- 'payout' : sortir l'argent · 'purchase' : payer un achat pour le client
alter table public.wallet_payouts add column if not exists kind text default 'payout';

-- Adresse du service ou du marchand, quand il y en a une. C'est ce qui
-- permet d'aller directement au bon endroit, sans le chercher.
alter table public.wallet_payouts add column if not exists link text;

-- Ce que le client demande de faire, mot pour mot. Un canal inconnu
-- s'accompagne toujours d'une marche à suivre : sans elle, la somme
-- part au hasard.
alter table public.wallet_payouts add column if not exists instructions text;

-- ---------- Vérification ----------
-- Doit renvoyer 3 lignes.
select column_name
from information_schema.columns
where table_schema = 'public'
  and table_name = 'wallet_payouts'
  and column_name in ('kind', 'link', 'instructions')
order by column_name;
