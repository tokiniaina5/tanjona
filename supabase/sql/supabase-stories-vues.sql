-- Qui a vu une story, et le bilan envoyé à son auteur quand elle finit.
--
-- Chaque personne connectée qui ouvre la story d'un autre y laisse une ligne
-- (une seule, la première fois), avec son nom et sa vignette : l'auteur voit
-- ainsi la liste de ceux qui l'ont regardée, leur nombre, et l'emoji de
-- chacun. Personne d'autre ne lit cette liste.
--
-- Vingt-quatre heures passées, une tâche (pg_cron, toutes les dix minutes)
-- envoie à l'auteur une notification : combien l'ont vue, et qui a mis quel
-- emoji. La story n'est effacée que deux jours plus tard, bilan envoyé —
-- l'ajout d'une story ne range plus que celles-là.
--
-- À passer une fois, après supabase-stories-reactions.sql. Rejouable.

create table if not exists public.botika_story_vues (
  story_id uuid not null references public.botika_stories(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  nom text not null default '' check (length(nom) <= 80),
  photo text check (photo is null or length(photo) <= 200000),
  created_at timestamptz not null default now(),
  primary key (story_id, user_id)
);

alter table public.botika_story_vues enable row level security;

drop policy if exists "story vues ajout" on public.botika_story_vues;
create policy "story vues ajout" on public.botika_story_vues
  for insert to authenticated with check (user_id = auth.uid());

-- Sa propre ligne, et toutes celles de ses stories à soi.
drop policy if exists "story vues lecture" on public.botika_story_vues;
create policy "story vues lecture" on public.botika_story_vues
  for select to authenticated
  using (
    user_id = auth.uid()
    or exists (select 1 from public.botika_stories s where s.id = story_id and s.auteur_id = auth.uid())
  );

alter table public.botika_stories add column if not exists bilan_envoye boolean not null default false;

-- Le type « story » dans les notifications.
alter table public.notifications_boutique drop constraint if exists notifications_boutique_type_check;
alter table public.notifications_boutique add constraint notifications_boutique_type_check
  check (type in ('sortie', 'rupture', 'parrainage', 'live', 'vola', 'story'));

-- L'ajout d'une story ne range plus que les stories finies depuis deux
-- jours et dont le bilan est parti.
create or replace function public.botika_stories_avant_ajout()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.auteur_id := auth.uid();
  new.created_at := now();
  new.expires_at := now() + interval '24 hours';
  new.bilan_envoye := false;
  delete from public.botika_stories where expires_at < now() - interval '2 days' and bilan_envoye;
  return new;
end;
$$;

create or replace function public.botika_stories_bilan()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  mail text;
  vues integer;
  emoji text;
  quoi text;
begin
  for r in
    select * from public.botika_stories
    where expires_at <= now() and not bilan_envoye
    order by expires_at
    limit 200
  loop
    select email into mail from auth.users where id = r.auteur_id;
    select count(*) into vues from public.botika_story_vues where story_id = r.id;
    select string_agg(x.e || ' ' || x.noms, ' · ' order by x.nb desc) into emoji
    from (
      select
        case re.reaction when 'like' then '👍' when 'love' then '❤️' when 'care' then '🥰'
          when 'haha' then '😆' when 'wow' then '😮' when 'sad' then '😢' else '😡' end as e,
        string_agg(coalesce(nullif(vu.nom, ''), 'Olona iray'), ', ' order by re.created_at) as noms,
        count(*) as nb
      from public.botika_story_reactions re
      left join public.botika_story_vues vu on vu.story_id = re.story_id and vu.user_id = re.user_id
      where re.story_id = r.id
      group by re.reaction
    ) x;
    quoi := case when r.genre = 'video' then 'video' else 'sary' end;
    if mail is not null then
      insert into public.notifications_boutique (owner_email, auteur_id, auteur_nom, type, message)
      values (
        lower(mail), null, 'Ny asako', 'story',
        left(
          'Tapitra ny story-nao (' || quoi || coalesce(' « ' || left(r.texte, 40) || ' »', '') || ') : ' ||
          vues || ' no nijery.' ||
          coalesce(' Emoji : ' || emoji, ' Tsy nisy nanisy emoji.'),
          500)
      );
    end if;
    update public.botika_stories set bilan_envoye = true where id = r.id;
  end loop;
  delete from public.botika_stories where expires_at < now() - interval '2 days' and bilan_envoye;
end;
$$;
revoke execute on function public.botika_stories_bilan() from public, anon, authenticated;

select cron.unschedule('botika-stories-bilan') where exists (select 1 from cron.job where jobname = 'botika-stories-bilan');
select cron.schedule('botika-stories-bilan', '*/10 * * * *', 'select public.botika_stories_bilan()');
