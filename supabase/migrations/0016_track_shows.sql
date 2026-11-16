-- Track Shows: ticket counts for confirmed shows, set against the offer's numbers.
-- Each count is a snapshot ("as of now, this many sold per tier"), so sales pace can be shown.

alter table public.holds add column if not exists eventim_event_id text;   -- the show's event in Eventim US

create table public.ticket_counts (
  id          uuid primary key default gen_random_uuid(),
  hold_id     uuid not null references public.holds(id) on delete cascade,
  counted_at  timestamptz not null default now(),
  source      text not null default 'manual' check (source in ('manual', 'eventim')),
  tiers       jsonb not null default '[]'::jsonb,   -- [{ "name": "Advance", "sold": 120, "price": 20, "gross": 2400 }]
  sold        int not null default 0,                -- paid tickets, all tiers
  comps       int not null default 0,
  gross       numeric(12, 2) not null default 0,     -- face value of paid tickets, before tax
  note        text,
  created_by  text
);
create index ticket_counts_hold on public.ticket_counts (hold_id, counted_at desc);

alter table public.ticket_counts enable row level security;
create policy "staff read ticket counts" on public.ticket_counts for select to authenticated using (public.is_staff());
create policy "bookers add ticket counts" on public.ticket_counts for insert to authenticated
  with check (public.can_book() and created_by = public.current_email());
create policy "bookers delete ticket counts" on public.ticket_counts for delete to authenticated using (public.can_book());

-- Link a show to its Eventim event (holds are otherwise only changed through functions).
create or replace function public.set_eventim_event(p_hold uuid, p_event text) returns public.holds
language plpgsql security definer set search_path = public as $$
declare
  v_actor text := public._require_booker();
  v_hold  public.holds;
begin
  update public.holds set eventim_event_id = nullif(btrim(p_event), ''), updated_at = now()
   where id = p_hold returning * into v_hold;
  if not found then raise exception 'Hold not found.'; end if;
  return v_hold;
end $$;
revoke execute on function public.set_eventim_event(uuid, text) from public, anon;
