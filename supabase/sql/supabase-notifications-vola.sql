-- Les notifications d'argent des achats du fil (type « vola »).
--
-- La fonction wallet les écrit, avec la clé de service, dans la boutique du
-- vendeur : le patron les lit directement, son équipe (le livreur compris)
-- par la fonction mpiasa, comme les autres. Et dans celle de l'acheteur quand
-- son argent lui est rendu.
--
-- À passer une fois, après supabase-notifications.sql. Rejouable sans dommage.

alter table public.notifications_boutique
  drop constraint if exists notifications_boutique_type_check;
alter table public.notifications_boutique
  add constraint notifications_boutique_type_check
  check (type in ('sortie', 'rupture', 'parrainage', 'live', 'vola'));
