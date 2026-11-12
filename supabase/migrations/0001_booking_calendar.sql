-- xBk Ops — Phase 1, piece 1: booking calendar and hold rules
-- Rooms: xBk, The Annex, Ideal Dress Club (IDC)
-- Rules (confirmed Nov 12, 2026):
--   * New holds start at H2; only a booker/owner puts a hold in H1.
--   * Ranks are per room per date.
--   * When a hold releases, holds below move up one rank, never into H1.
--   * Challenges default to 48 hours; an expired challenge alerts, it never auto-releases.
--   * Rentals use the same ranks and challenges as shows.
--   * Owner and booker have the same permissions.
--   * Rooms book independently.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.rooms (
  id   text primary key,
  name text not null,
  sort int  not null
);

insert into public.rooms (id, name, sort) values
  ('xbk',   'xBk',              1),
  ('annex', 'The Annex',        2),
  ('idc',   'Ideal Dress Club', 3);

create table public.staff (
  email      text primary key check (email = lower(email)),
  name       text not null,
  role       text not null check (role in
               ('owner','booker','venue_manager','marketing','advance','production','mod')),
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

create type public.hold_status as enum ('hold', 'offer_out', 'confirmed', 'released');
create type public.hold_kind   as enum ('show', 'rental');

create table public.holds (
  id                 uuid primary key default gen_random_uuid(),
  room_id            text not null references public.rooms(id),
  date               date not null,
  rank               int check (rank >= 1 or rank = -1),   -- null once confirmed/released; -1 only mid-swap
  status             public.hold_status not null default 'hold',
  kind               public.hold_kind   not null default 'show',
  title              text not null,                         -- artist, or rental client/event
  agent_name         text,
  agent_company      text,
  agent_email        text,
  notes              text,
  group_id           uuid,                                  -- holds placed together for one request
  challenge_deadline timestamptz,                           -- set on a hold that has been challenged
  challenged_by      uuid references public.holds(id),
  released_reason    text,
  placed_by          text not null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- One hold per rank per room per date, among active holds.
create unique index holds_active_rank_unique
  on public.holds (room_id, date, rank)
  where status in ('hold', 'offer_out');

-- At most one confirmed booking per room per date.
create unique index holds_one_confirmed
  on public.holds (room_id, date)
  where status = 'confirmed';

create index holds_room_date on public.holds (room_id, date);
create index holds_date      on public.holds (date);

create table public.hold_events (
  id         bigint generated always as identity primary key,
  hold_id    uuid not null references public.holds(id),
  room_id    text not null,
  date       date not null,
  action     text not null,
  detail     text,
  actor      text not null,
  created_at timestamptz not null default now()
);

create index hold_events_hold on public.hold_events (hold_id);
create index hold_events_date on public.hold_events (room_id, date);

-- ---------------------------------------------------------------------------
-- Who is calling
-- ---------------------------------------------------------------------------

create or replace function public.current_email() returns text
language sql stable as $$
  select lower(coalesce(auth.jwt() ->> 'email', ''))
$$;

create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.staff where email = public.current_email() and active)
$$;

create or replace function public.can_book() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.staff
                 where email = public.current_email() and active and role in ('owner','booker'))
$$;

create or replace function public._require_booker() returns text
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.can_book() then
    raise exception 'Only a booker or owner can change holds.';
  end if;
  return public.current_email();
end $$;

create or replace function public._lock_date(p_room text, p_date date) returns void
language sql as $$
  select pg_advisory_xact_lock(hashtext(p_room || ':' || p_date::text))
$$;

create or replace function public._log(p_hold public.holds, p_action text, p_detail text, p_actor text)
returns void language sql security definer set search_path = public as $$
  insert into public.hold_events (hold_id, room_id, date, action, detail, actor)
  values (p_hold.id, p_hold.room_id, p_hold.date, p_action, p_detail, p_actor)
$$;

create or replace function public._rank_label(p_rank int) returns text
language sql immutable as $$ select 'H' || p_rank $$;

-- ---------------------------------------------------------------------------
-- Placing holds
-- ---------------------------------------------------------------------------

-- Place one hold. Goes in at H2, or the next open rank below the existing holds.
create or replace function public.place_hold(
  p_room          text,
  p_date          date,
  p_title         text,
  p_kind          public.hold_kind default 'show',
  p_agent_name    text default null,
  p_agent_company text default null,
  p_agent_email   text default null,
  p_notes         text default null,
  p_group         uuid default null
) returns public.holds
language plpgsql security definer set search_path = public as $$
declare
  v_actor text := public._require_booker();
  v_rank  int;
  v_hold  public.holds;
begin
  if coalesce(trim(p_title), '') = '' then
    raise exception 'Artist or event name is required.';
  end if;
  if not exists (select 1 from public.rooms where id = p_room) then
    raise exception 'Unknown room: %', p_room;
  end if;

  perform public._lock_date(p_room, p_date);

  if exists (select 1 from public.holds
             where room_id = p_room and date = p_date and status = 'confirmed') then
    raise exception '% is already confirmed in this room. Release it first to hold the date.',
      to_char(p_date, 'Mon DD, YYYY');
  end if;

  select greatest(2, coalesce(max(rank), 1) + 1) into v_rank
  from public.holds
  where room_id = p_room and date = p_date and status in ('hold', 'offer_out');

  insert into public.holds (room_id, date, rank, kind, title, agent_name, agent_company,
                            agent_email, notes, group_id, placed_by)
  values (p_room, p_date, v_rank, p_kind, trim(p_title), nullif(trim(p_agent_name), ''),
          nullif(trim(p_agent_company), ''), nullif(lower(trim(p_agent_email)), ''),
          nullif(trim(p_notes), ''), p_group, v_actor)
  returning * into v_hold;

  perform public._log(v_hold, 'placed', 'Placed as ' || public._rank_label(v_rank), v_actor);
  return v_hold;
end $$;

-- Place the same hold on several dates (e.g. "3/14, 3/15 or 3/16"), grouped together.
create or replace function public.place_holds(
  p_room          text,
  p_dates         date[],
  p_title         text,
  p_kind          public.hold_kind default 'show',
  p_agent_name    text default null,
  p_agent_company text default null,
  p_agent_email   text default null,
  p_notes         text default null
) returns setof public.holds
language plpgsql security definer set search_path = public as $$
declare
  v_group uuid := case when coalesce(array_length(p_dates, 1), 0) > 1 then gen_random_uuid() end;
  v_date  date;
begin
  if coalesce(array_length(p_dates, 1), 0) = 0 then
    raise exception 'Pick at least one date.';
  end if;
  foreach v_date in array (select array_agg(distinct d order by d) from unnest(p_dates) d) loop
    return next public.place_hold(p_room, v_date, p_title, p_kind, p_agent_name,
                                  p_agent_company, p_agent_email, p_notes, v_group);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Moving holds
-- ---------------------------------------------------------------------------

-- Move a hold to a rank (e.g. rank 1 = "Promote to H1"). The hold leaves its old
-- spot (holds below it move up, never into H1), then goes in at the new rank,
-- pushing anything at or below that rank down one.
create or replace function public.move_hold(p_id uuid, p_rank int) returns public.holds
language plpgsql security definer set search_path = public as $$
declare
  v_actor text := public._require_booker();
  v_hold  public.holds;
  v_row   public.holds;
  v_old   int;
  v_max   int;
  v_to    int := p_rank;
begin
  select * into v_hold from public.holds where id = p_id;
  if not found or v_hold.status not in ('hold', 'offer_out') then
    raise exception 'Only active holds can be moved.';
  end if;
  perform public._lock_date(v_hold.room_id, v_hold.date);
  select * into v_hold from public.holds where id = p_id;   -- re-read under lock
  v_old := v_hold.rank;

  if v_to is null or v_to < 1 then
    raise exception 'Pick a rank of H1 or lower.';
  end if;
  if v_to = v_old then
    return v_hold;
  end if;

  -- Take the hold out of the stack and close the gap it leaves.
  update public.holds set rank = -1 where id = v_hold.id;
  for v_row in
    select * from public.holds
    where room_id = v_hold.room_id and date = v_hold.date
      and status in ('hold', 'offer_out') and rank > v_old and v_old >= 2
    order by rank
  loop
    update public.holds set rank = v_row.rank - 1, updated_at = now() where id = v_row.id;
  end loop;

  -- Don't leave gaps at the bottom: the lowest it can go is just under the last hold.
  select max(rank) into v_max from public.holds
  where room_id = v_hold.room_id and date = v_hold.date
    and status in ('hold', 'offer_out') and id <> v_hold.id;
  if v_to > 1 then
    v_to := least(v_to, greatest(coalesce(v_max, 1) + 1, 2));
  end if;

  -- Make room at the new rank.
  if exists (select 1 from public.holds
             where room_id = v_hold.room_id and date = v_hold.date
               and status in ('hold', 'offer_out') and rank = v_to) then
    for v_row in
      select * from public.holds
      where room_id = v_hold.room_id and date = v_hold.date
        and status in ('hold', 'offer_out') and rank >= v_to and id <> v_hold.id
      order by rank desc
    loop
      update public.holds set rank = v_row.rank + 1, updated_at = now() where id = v_row.id;
    end loop;
  end if;

  update public.holds set rank = v_to, updated_at = now() where id = v_hold.id
  returning * into v_hold;

  perform public._log(v_hold,
    case when v_to = 1 then 'promoted' else 'moved' end,
    public._rank_label(v_old) || ' → ' || public._rank_label(v_to), v_actor);
  return v_hold;
end $$;

-- Close the gap a released hold leaves. Holds below move up one rank, never into H1.
create or replace function public._close_gap(p_room text, p_date date, p_rank int, p_actor text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_row public.holds;
begin
  if p_rank is null or p_rank < 2 then
    return;   -- an empty H1 stays empty
  end if;
  for v_row in
    select * from public.holds
    where room_id = p_room and date = p_date and status in ('hold', 'offer_out') and rank > p_rank
    order by rank
  loop
    update public.holds set rank = v_row.rank - 1, updated_at = now() where id = v_row.id;
    perform public._log(v_row, 'moved',
      public._rank_label(v_row.rank) || ' → ' || public._rank_label(v_row.rank - 1)
      || ' (hold above released)', p_actor);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Offers, challenges, release, confirm
-- ---------------------------------------------------------------------------

create or replace function public.set_offer_out(p_id uuid, p_out boolean) returns public.holds
language plpgsql security definer set search_path = public as $$
declare
  v_actor text := public._require_booker();
  v_hold  public.holds;
begin
  update public.holds
     set status = case when p_out then 'offer_out' else 'hold' end::public.hold_status,
         updated_at = now()
   where id = p_id and status in ('hold', 'offer_out')
  returning * into v_hold;
  if not found then
    raise exception 'Only active holds can have an offer marked.';
  end if;
  perform public._log(v_hold, case when p_out then 'offer_out' else 'offer_cleared' end,
    case when p_out then 'Offer marked as sent' else 'Offer mark removed' end, v_actor);
  return v_hold;
end $$;

-- A lower hold has a firm offer: challenge every hold above it.
create or replace function public.challenge(p_challenger uuid, p_hours int default 48)
returns setof public.holds
language plpgsql security definer set search_path = public as $$
declare
  v_actor    text := public._require_booker();
  v_hold     public.holds;
  v_row      public.holds;
  v_deadline timestamptz;
  v_count    int := 0;
begin
  if p_hours is null or p_hours < 1 or p_hours > 336 then
    raise exception 'Challenge window must be between 1 hour and 14 days.';
  end if;
  select * into v_hold from public.holds where id = p_challenger;
  if not found or v_hold.status not in ('hold', 'offer_out') then
    raise exception 'Only an active hold can make a challenge.';
  end if;
  perform public._lock_date(v_hold.room_id, v_hold.date);
  select * into v_hold from public.holds where id = p_challenger;

  v_deadline := now() + make_interval(hours => p_hours);

  for v_row in
    update public.holds
       set challenge_deadline = v_deadline, challenged_by = v_hold.id, updated_at = now()
     where room_id = v_hold.room_id and date = v_hold.date
       and status in ('hold', 'offer_out') and rank < v_hold.rank
    returning *
  loop
    v_count := v_count + 1;
    perform public._log(v_row, 'challenged',
      'Challenged by ' || v_hold.title || ' (' || public._rank_label(v_hold.rank) || '), '
      || p_hours || 'h to confirm or release', v_actor);
    return next v_row;
  end loop;

  if v_count = 0 then
    raise exception 'There are no holds above % to challenge.', public._rank_label(v_hold.rank);
  end if;

  perform public._log(v_hold, 'challenge_made',
    'Challenged ' || v_count || ' hold(s) above, ' || p_hours || 'h window', v_actor);
end $$;

create or replace function public.cancel_challenge(p_challenger uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_actor text := public._require_booker();
  v_row   public.holds;
begin
  for v_row in
    update public.holds set challenge_deadline = null, challenged_by = null, updated_at = now()
     where challenged_by = p_challenger
    returning *
  loop
    perform public._log(v_row, 'challenge_cancelled', 'Challenge withdrawn', v_actor);
  end loop;
end $$;

-- Release a hold (or cancel a confirmed date). Holds below move up, never into H1.
create or replace function public.release_hold(p_id uuid, p_reason text default null)
returns public.holds
language plpgsql security definer set search_path = public as $$
declare
  v_actor text := public._require_booker();
  v_hold  public.holds;
  v_rank  int;
begin
  select * into v_hold from public.holds where id = p_id;
  if not found or v_hold.status = 'released' then
    raise exception 'That hold is already released.';
  end if;
  perform public._lock_date(v_hold.room_id, v_hold.date);
  select * into v_hold from public.holds where id = p_id;
  v_rank := v_hold.rank;

  update public.holds
     set status = 'released', rank = null, challenge_deadline = null, challenged_by = null,
         released_reason = nullif(trim(p_reason), ''), updated_at = now()
   where id = p_id
  returning * into v_hold;

  -- Any challenge this hold was making goes away with it.
  update public.holds set challenge_deadline = null, challenged_by = null, updated_at = now()
   where challenged_by = p_id;

  perform public._log(v_hold, 'released',
    coalesce('Released from ' || public._rank_label(v_rank), 'Confirmed date cancelled')
    || coalesce(': ' || nullif(trim(p_reason), ''), ''), v_actor);

  perform public._close_gap(v_hold.room_id, v_hold.date, v_rank, v_actor);
  return v_hold;
end $$;

-- Confirm a hold. Every other hold on that room and date is released.
create or replace function public.confirm_hold(p_id uuid) returns setof public.holds
language plpgsql security definer set search_path = public as $$
declare
  v_actor text := public._require_booker();
  v_hold  public.holds;
  v_row   public.holds;
begin
  select * into v_hold from public.holds where id = p_id;
  if not found or v_hold.status not in ('hold', 'offer_out') then
    raise exception 'Only an active hold can be confirmed.';
  end if;
  perform public._lock_date(v_hold.room_id, v_hold.date);
  select * into v_hold from public.holds where id = p_id;

  for v_row in
    update public.holds
       set status = 'released', rank = null, challenge_deadline = null, challenged_by = null,
           released_reason = 'Date confirmed for ' || v_hold.title, updated_at = now()
     where room_id = v_hold.room_id and date = v_hold.date
       and status in ('hold', 'offer_out') and id <> v_hold.id
    returning *
  loop
    perform public._log(v_row, 'released', 'Released: date confirmed for ' || v_hold.title, v_actor);
    return next v_row;   -- returned so the booker knows whom to tell
  end loop;

  update public.holds
     set status = 'confirmed', rank = null, challenge_deadline = null, challenged_by = null,
         updated_at = now()
   where id = p_id
  returning * into v_hold;

  perform public._log(v_hold, 'confirmed', 'Confirmed', v_actor);
end $$;

create or replace function public.update_hold(
  p_id            uuid,
  p_title         text,
  p_kind          public.hold_kind,
  p_agent_name    text,
  p_agent_company text,
  p_agent_email   text,
  p_notes         text
) returns public.holds
language plpgsql security definer set search_path = public as $$
declare
  v_actor text := public._require_booker();
  v_hold  public.holds;
begin
  if coalesce(trim(p_title), '') = '' then
    raise exception 'Artist or event name is required.';
  end if;
  update public.holds
     set title = trim(p_title), kind = p_kind,
         agent_name = nullif(trim(p_agent_name), ''),
         agent_company = nullif(trim(p_agent_company), ''),
         agent_email = nullif(lower(trim(p_agent_email)), ''),
         notes = nullif(trim(p_notes), ''), updated_at = now()
   where id = p_id
  returning * into v_hold;
  if not found then
    raise exception 'Hold not found.';
  end if;
  perform public._log(v_hold, 'edited', 'Details updated', v_actor);
  return v_hold;
end $$;

-- ---------------------------------------------------------------------------
-- Security: staff can read everything; all changes go through the functions above.
-- ---------------------------------------------------------------------------

alter table public.rooms       enable row level security;
alter table public.staff       enable row level security;
alter table public.holds       enable row level security;
alter table public.hold_events enable row level security;

create policy "staff read rooms"  on public.rooms       for select to authenticated using (public.is_staff());
create policy "staff read staff"  on public.staff       for select to authenticated using (public.is_staff());
create policy "staff read holds"  on public.holds       for select to authenticated using (public.is_staff());
create policy "staff read events" on public.hold_events for select to authenticated using (public.is_staff());

-- Internal helpers are not callable from the app.
revoke execute on function public._require_booker()                         from public, anon, authenticated;
revoke execute on function public._lock_date(text, date)                    from public, anon, authenticated;
revoke execute on function public._log(public.holds, text, text, text)      from public, anon, authenticated;
revoke execute on function public._close_gap(text, date, int, text)         from public, anon, authenticated;

-- Public functions: signed-in users only (each one checks booker/owner itself).
revoke execute on function public.place_hold(text, date, text, public.hold_kind, text, text, text, text, uuid) from public, anon;
revoke execute on function public.place_holds(text, date[], text, public.hold_kind, text, text, text, text) from public, anon;
revoke execute on function public.move_hold(uuid, int)            from public, anon;
revoke execute on function public.set_offer_out(uuid, boolean)    from public, anon;
revoke execute on function public.challenge(uuid, int)            from public, anon;
revoke execute on function public.cancel_challenge(uuid)          from public, anon;
revoke execute on function public.release_hold(uuid, text)        from public, anon;
revoke execute on function public.confirm_hold(uuid)              from public, anon;
revoke execute on function public.update_hold(uuid, text, public.hold_kind, text, text, text, text) from public, anon;
