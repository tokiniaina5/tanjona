-- ============================================================
-- Moyens de paiement du déblocage — Gestion de Stockage
--
-- À COLLER DANS : Supabase > SQL Editor > New query > Run.
-- (Même façon de faire que supabase-schema.sql : ce projet n'utilise
--  pas de migrations, tout passe par l'éditeur SQL.)
--
-- Sans ces colonnes, le panneau admin « Nous contacter » ne peut plus
-- rien enregistrer du tout : il écrit toutes les colonnes d'un coup et
-- répond « Could not find the 'airtel_money' column ».
--
-- Se relance sans risque : "if not exists" partout, aucune donnée touchée.
-- ============================================================

-- ---------- Où les clients envoient les 20 000 Ar ----------
alter table public.contact_channels add column if not exists card_link text;      -- page de paiement par carte (Stripe, SumUp…)
alter table public.contact_channels add column if not exists bank_label text;     -- nom de la banque
alter table public.contact_channels add column if not exists bank_code text;      -- code banque   (ex. 00008)
alter table public.contact_channels add column if not exists bank_agency text;    -- code agence   (ex. 03016)
alter table public.contact_channels add column if not exists bank_account text;   -- n° de compte  (ex. 05001514368)
alter table public.contact_channels add column if not exists bank_key text;       -- clé RIB       (ex. 86)
alter table public.contact_channels add column if not exists mvola text;          -- numéro MVola        (Telma)
alter table public.contact_channels add column if not exists orange_money text;   -- numéro Orange Money
alter table public.contact_channels add column if not exists airtel_money text;   -- numéro Airtel Money

-- ---------- Comment chaque demande a été payée ----------
-- 'paypal', 'card', 'mobile' ou 'bank' : dit sur quel compte vérifier
-- l'arrivée de l'argent avant de débloquer.
alter table public.unlock_requests add column if not exists payment_method text default 'paypal';

-- Renseignées par la fonction "paypal-webhook" quand PayPal annonce que
-- l'argent est réellement arrivé. Tant que le solde ne bouge pas, elles
-- restent vides et rien ne se déclenche.
alter table public.unlock_requests add column if not exists paid_amount numeric;
alter table public.unlock_requests add column if not exists paid_currency text;
alter table public.unlock_requests add column if not exists paid_amount_ar numeric;
alter table public.unlock_requests add column if not exists auto_confirmed boolean default false;
alter table public.unlock_requests add column if not exists paypal_capture_id text;

-- Un même encaissement PayPal ne peut débloquer qu'une seule demande.
create unique index if not exists unlock_requests_capture_uniq
  on public.unlock_requests (paypal_capture_id)
  where paypal_capture_id is not null;

-- ---------- Vérification ----------
-- Doit renvoyer 9 lignes pour contact_channels et 6 pour unlock_requests.
select table_name, column_name
from information_schema.columns
where table_schema = 'public'
  and (
    (table_name = 'contact_channels' and column_name in
      ('card_link','bank_label','bank_code','bank_agency','bank_account',
       'bank_key','mvola','orange_money','airtel_money'))
    or
    (table_name = 'unlock_requests' and column_name in
      ('payment_method','paid_amount','paid_currency','paid_amount_ar','auto_confirmed','paypal_capture_id'))
  )
order by table_name, column_name;
