-- Canaux de contact ajoutés à la main : le propriétaire peut effacer celui
-- qui est faux (« web.telegram.org », un nom avec une espace…) depuis
-- « Nous contacter » (contact.js, bouton ✕ sur le logo).
-- is_owner() est déjà défini (voir supabase-schema.sql).

drop policy if exists "owner deletes extra channels" on public.contact_extra_channels;
create policy "owner deletes extra channels"
  on public.contact_extra_channels for delete
  using (is_owner());
