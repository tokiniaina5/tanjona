-- ============================================================
-- Qui a ouvert le site — tout le monde, et une seule fois chacun
--
-- À COLLER DANS : Supabase > SQL Editor > New query > Run.
-- Se relance sans risque : "if not exists" partout.
--
-- Il existait déjà "site_visits" : une ligne par page chargée. C'est un
-- journal de passages, pas une liste de personnes — la même personne y
-- figure cent fois, et aucune ligne ne dit qui elle est.
--
-- Cette table-ci compte des PERSONNES. Une ligne par installation :
-- celle qui ouvre l'application le premier jour sans compte, et celle
-- qui s'y connecte depuis deux ans, sont chacune une ligne, et une
-- seule. C'est ce qui permet au propriétaire de les voir toutes, et
-- d'être crédité une fois par personne plutôt qu'une fois par visite.
--
-- Personne ne l'écrit ni ne la lit depuis le navigateur : la fonction
-- Edge "visiteur" s'en charge, avec la clé de service. Elle contient
-- des noms et des emails — les laisser à la portée de n'importe quel
-- compte connecté reviendrait à donner la liste des clients à chacun
-- d'eux.
-- ============================================================

create table if not exists public.site_visiteurs (
  -- L'identifiant de l'installation (le même que celui du parrainage).
  -- C'est lui la personne : un navigateur, un appareil, quelqu'un.
  install_id text primary key,

  -- Ce qu'on sait d'elle, si elle a fini par créer un compte. Vide tant
  -- qu'elle essaie l'application sans se présenter.
  nom text,
  email text,

  -- L'installation qui l'a invitée, s'il y en a une. Le propriétaire
  -- voit ainsi qui vient de lui-même et qui vient d'un parrainage.
  invite_par text,

  -- 'Mobile', 'Tablette' ou 'Ordinateur' — déduit du navigateur, sans
  -- rien de ce qui permettrait de reconnaître l'appareil ailleurs.
  appareil text,

  premiere_visite timestamptz not null default now(),
  derniere_visite timestamptz not null default now(),
  visites integer not null default 1
);

-- La liste se lit de la plus récente à la plus ancienne : c'est l'ordre
-- dans lequel l'espace admin la montre.
create index if not exists site_visiteurs_derniere_idx
  on public.site_visiteurs (derniere_visite desc);

alter table public.site_visiteurs enable row level security;

-- Aucune policy, volontairement : ni lecture, ni écriture depuis le
-- navigateur. Seule la clé de service — celle des fonctions Edge, qui
-- ne quitte jamais le serveur — peut toucher à cette table. Une
-- policy oubliée ici, et la liste des clients serait publique.
drop policy if exists "site_visiteurs_lecture" on public.site_visiteurs;
drop policy if exists "site_visiteurs_ecriture" on public.site_visiteurs;

-- ---------- Vérification ----------
-- Doit renvoyer les colonnes de la table, et zéro policy.
select column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name = 'site_visiteurs'
order by ordinal_position;

select count(*) as policies_sur_site_visiteurs
from pg_policies
where schemaname = 'public' and tablename = 'site_visiteurs';
