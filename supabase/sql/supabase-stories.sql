-- Les « stories » du Botika : une photo (et quelques mots) qui reste
-- vingt-quatre heures, en rangée sous le titre, comme sur Facebook.
--
-- La photo vit dans la ligne, en « data: » réduite (900 px, JPEG), comme
-- celles des billets : pas de bucket à ouvrir pour si peu.
--
-- Tout le monde les voit tant qu'elles vivent ; seul un compte en publie, et
-- seul son auteur l'efface. La date de fin est posée par le serveur : la page
-- ne peut pas s'offrir une story éternelle.
--
-- À passer une fois. Rejouable sans dommage.

create table if not exists public.botika_stories (
  id uuid primary key default gen_random_uuid(),
  auteur_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  auteur_nom text not null default '' check (length(auteur_nom) <= 80),
  auteur_photo text check (auteur_photo is null or length(auteur_photo) <= 200000),
  media text not null check (length(media) <= 1500000),
  texte text check (texte is null or length(texte) <= 300),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '24 hours'
);
create index if not exists botika_stories_expires_idx on public.botika_stories (expires_at);

-- La date est celle du serveur ; au passage, on range celles qui ont fini.
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
  delete from public.botika_stories where expires_at < now();
  return new;
end;
$$;
drop trigger if exists botika_stories_avant_ajout on public.botika_stories;
create trigger botika_stories_avant_ajout
  before insert on public.botika_stories
  for each row execute function public.botika_stories_avant_ajout();
revoke execute on function public.botika_stories_avant_ajout() from public, anon, authenticated;

alter table public.botika_stories enable row level security;

drop policy if exists "stories lecture" on public.botika_stories;
create policy "stories lecture" on public.botika_stories
  for select to anon, authenticated
  using (expires_at > now());

drop policy if exists "stories ajout" on public.botika_stories;
create policy "stories ajout" on public.botika_stories
  for insert to authenticated
  with check (auteur_id = auth.uid());

drop policy if exists "stories fafana" on public.botika_stories;
create policy "stories fafana" on public.botika_stories
  for delete to authenticated
  using (auteur_id = auth.uid());
