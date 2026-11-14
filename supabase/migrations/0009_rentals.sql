-- Rentals: one rental form (and contract) for the rental holds placed together in one action.
-- The form's fields are kept as JSON so the contract can grow without database changes.

create table public.rentals (
  id            uuid primary key default gen_random_uuid(),
  hold_ids      uuid[] not null default '{}',
  room_id       text not null references public.rooms(id),
  title         text not null,                -- client / organization
  contact_name  text,
  contact_email text,
  event_date    date,
  details       jsonb not null default '{}'::jsonb,
  status        text not null default 'draft' check (status in ('draft', 'sent', 'signed', 'cancelled')),
  created_by    text not null,
  sent_at       timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index rentals_hold_ids on public.rentals using gin (hold_ids);

alter table public.rentals enable row level security;

create policy "staff read rentals" on public.rentals
  for select to authenticated using (public.is_staff());

create policy "bookers add rentals" on public.rentals
  for insert to authenticated
  with check (public.can_book() and created_by = public.current_email());

create policy "bookers edit rentals" on public.rentals
  for update to authenticated
  using (public.can_book()) with check (public.can_book());

-- Deleting a rental doesn't touch its holds.
create policy "bookers delete rentals" on public.rentals
  for delete to authenticated
  using (public.can_book());

-- Mark a rental contract as sent: its holds show "Offer out" on the calendar, the same as offers.
create or replace function public.mark_rental_sent(p_rental uuid) returns public.rentals
language plpgsql security definer set search_path = public as $$
declare
  v_actor  text := public._require_booker();
  v_rental public.rentals;
  v_hold   public.holds;
begin
  update public.rentals set status = 'sent', sent_at = now(), updated_at = now()
   where id = p_rental
  returning * into v_rental;
  if not found then
    raise exception 'Rental not found.';
  end if;

  for v_hold in
    update public.holds set status = 'offer_out', updated_at = now()
     where id = any (v_rental.hold_ids) and status = 'hold'
    returning *
  loop
    perform public._log(v_hold, 'offer_out', 'Rental contract sent', v_actor);
  end loop;
  return v_rental;
end $$;

revoke execute on function public.mark_rental_sent(uuid) from public, anon;
