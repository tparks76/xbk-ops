-- Let bookers and the owner delete offers. Deleting an offer doesn't touch its holds.
create policy "bookers delete offers" on public.offers
  for delete to authenticated
  using (public.can_book());
