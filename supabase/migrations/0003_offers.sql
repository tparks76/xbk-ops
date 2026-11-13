-- Offers: one offer covers the holds placed together in one action.
-- Terms (deal type, guarantee, %, tickets, costs, bonuses, show details)
-- are kept as JSON so the offer sheet can grow without database changes.

create table public.offers (
  id            uuid primary key default gen_random_uuid(),
  hold_ids      uuid[] not null,
  room_id       text not null references public.rooms(id),
  title         text not null,                -- artist
  agent_name    text,
  agent_company text,
  agent_email   text,
  terms         jsonb not null default '{}'::jsonb,
  status        text not null default 'draft' check (status in ('draft', 'sent', 'accepted', 'declined')),
  created_by    text not null,
  sent_at       timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index offers_hold_ids on public.offers using gin (hold_ids);

alter table public.offers enable row level security;

create policy "staff read offers" on public.offers
  for select to authenticated using (public.is_staff());

create policy "bookers add offers" on public.offers
  for insert to authenticated
  with check (public.can_book() and created_by = public.current_email());

create policy "bookers edit offers" on public.offers
  for update to authenticated
  using (public.can_book()) with check (public.can_book());

-- Mark an offer as sent: the offer's holds show "Offer out" on the calendar.
create or replace function public.mark_offer_sent(p_offer uuid) returns public.offers
language plpgsql security definer set search_path = public as $$
declare
  v_actor text := public._require_booker();
  v_offer public.offers;
  v_hold  public.holds;
begin
  update public.offers set status = 'sent', sent_at = now(), updated_at = now()
   where id = p_offer
  returning * into v_offer;
  if not found then
    raise exception 'Offer not found.';
  end if;

  for v_hold in
    update public.holds set status = 'offer_out', updated_at = now()
     where id = any (v_offer.hold_ids) and status = 'hold'
    returning *
  loop
    perform public._log(v_hold, 'offer_out', 'Offer sent', v_actor);
  end loop;
  return v_offer;
end $$;

revoke execute on function public.mark_offer_sent(uuid) from public, anon;
