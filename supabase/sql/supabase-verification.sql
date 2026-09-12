-- ============================================================
-- VÉRIFICATION — à exécuter dans Supabase > SQL Editor APRÈS
-- avoir lancé "supabase-schema.sql".
-- Chaque ligne doit afficher "OK". Toute ligne "MANQUANT"
-- signifie que le script principal n'est pas passé en entier.
-- ============================================================
with attendu(objet, present) as (

  -- les 10 tables de l'application
  select 'table  site_visits',            to_regclass('public.site_visits')            is not null
  union all select 'table  contact_messages',       to_regclass('public.contact_messages')       is not null
  union all select 'table  site_content',           to_regclass('public.site_content')           is not null
  union all select 'table  orders',                 to_regclass('public.orders')                 is not null
  union all select 'table  contact_channels',       to_regclass('public.contact_channels')       is not null
  union all select 'table  contact_extra_channels', to_regclass('public.contact_extra_channels') is not null
  union all select 'table  marketplace_links',      to_regclass('public.marketplace_links')      is not null
  union all select 'table  client_news',            to_regclass('public.client_news')            is not null
  union all select 'table  referrals',              to_regclass('public.referrals')              is not null
  union all select 'table  unlock_requests',        to_regclass('public.unlock_requests')        is not null
  union all select 'table  client_signups',         to_regclass('public.client_signups')         is not null
  union all select 'table  security_events',        to_regclass('public.security_events')        is not null
  union all select 'table  blocked_accounts',       to_regclass('public.blocked_accounts')       is not null

  -- les 2 colonnes ajoutées par la dernière version
  union all select 'colonne contact_channels.paypal', exists(
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'contact_channels' and column_name = 'paypal')
  union all select 'colonne unlock_requests.device_hash', exists(
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'unlock_requests' and column_name = 'device_hash')

  -- sécurité au niveau des lignes (RLS) sur les tables sensibles
  union all select 'RLS    unlock_requests', coalesce(
      (select rowsecurity from pg_tables where schemaname = 'public' and tablename = 'unlock_requests'), false)
  union all select 'RLS    contact_channels', coalesce(
      (select rowsecurity from pg_tables where schemaname = 'public' and tablename = 'contact_channels'), false)

  -- règles d'accès attendues sur unlock_requests (insert + select + update)
  union all select 'policies unlock_requests (3)', (
      select count(*) >= 3 from pg_policies
      where schemaname = 'public' and tablename = 'unlock_requests')
)
select
  objet,
  case when present then 'OK' else 'MANQUANT' end as etat
from attendu
order by (case when present then 1 else 0 end), objet;
