-- Les réactions sur une story (les mêmes sept que sur les billets) : une
-- par personne et par story, qu'on change ou qu'on retire. L'auteur de la
-- story les voit comptées dans sa visionneuse.
--
-- À passer une fois, après supabase-stories.sql. Rejouable sans dommage.

create table if not exists public.botika_story_reactions (
  story_id uuid not null references public.botika_stories(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  reaction text not null check (reaction in ('like', 'love', 'care', 'haha', 'wow', 'sad', 'angry')),
  created_at timestamptz not null default now(),
  primary key (story_id, user_id)
);

alter table public.botika_story_reactions enable row level security;

drop policy if exists "story reactions lecture" on public.botika_story_reactions;
create policy "story reactions lecture" on public.botika_story_reactions
  for select to anon, authenticated using (true);

drop policy if exists "story reactions ajout" on public.botika_story_reactions;
create policy "story reactions ajout" on public.botika_story_reactions
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "story reactions change" on public.botika_story_reactions;
create policy "story reactions change" on public.botika_story_reactions
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "story reactions retrait" on public.botika_story_reactions;
create policy "story reactions retrait" on public.botika_story_reactions
  for delete to authenticated using (user_id = auth.uid());
