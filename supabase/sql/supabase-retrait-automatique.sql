-- ============================================================
-- Le retrait exécuté par la machine, et non à la main
--
-- À COLLER DANS : Supabase > SQL Editor > New query > Run.
-- À passer APRÈS "supabase-portefeuille.sql". Se relance sans risque.
--
-- Jusqu'ici un retrait était une demande : la ligne entrait en « pending »,
-- le propriétaire allait envoyer l'argent lui-même, puis marquait la ligne
-- « sent ». Rien ne changeait tant qu'un humain n'avait pas agi.
--
-- Ces colonnes gardent la trace de ce que la machine a fait à sa place :
-- chez qui elle a envoyé, quelle référence le fournisseur a rendue, et
-- combien de fois on a essayé. Sans elles, un envoi réussi dont la réponse
-- s'est perdue serait indiscernable d'un envoi jamais parti — et l'on
-- paierait deux fois.
--
-- L'ancien chemin ne disparaît pas. Un canal sans clefs configurées reste
-- exactement ce qu'il était : une demande que le propriétaire exécute.
-- ============================================================

-- Chez qui la machine a envoyé : 'paypal', 'mvola'… Vide si personne n'a
-- encore essayé, ou si ce canal se règle toujours à la main.
alter table public.wallet_payouts add column if not exists auto_provider text;

-- La référence rendue par le fournisseur. C'est la seule preuve qu'on a
-- que l'argent est parti, et c'est elle qu'on lui répète si l'on doute.
alter table public.wallet_payouts add column if not exists auto_ref text;

-- Combien de fois on a tenté. Un retrait qui a déjà été tenté ne se retente
-- pas tout seul : c'est un humain qui décide, en connaissance de cause.
alter table public.wallet_payouts add column if not exists auto_attempts integer not null default 0;

-- Ce que le fournisseur a répondu, mot pour mot. Le jour où un retrait est
-- contesté, c'est la seule pièce qui dise ce qui s'est réellement passé.
alter table public.wallet_payouts add column if not exists auto_raw jsonb;

-- Retrouver une ligne par la référence du fournisseur, quand c'est lui qui
-- pose la question.
create index if not exists wallet_payouts_auto_ref_idx
  on public.wallet_payouts (auto_ref);

-- ---------- Vérification ----------
-- Doit renvoyer les quatre colonnes ci-dessus.
select column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name = 'wallet_payouts'
  and column_name in ('auto_provider', 'auto_ref', 'auto_attempts', 'auto_raw')
order by column_name;
