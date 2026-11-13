-- Release every upcoming hold for one artist (all rooms, today onward).
-- Confirmed dates are not touched. Each release follows the normal rules:
-- holds below move up one rank, never into H1.

create or replace function public.release_artist(p_title text, p_reason text default null)
returns setof public.holds
language plpgsql security definer set search_path = public as $$
declare
  v_actor text := public._require_booker();
  v_id    uuid;
  v_today date := (now() at time zone 'America/Chicago')::date;
begin
  if coalesce(trim(p_title), '') = '' then
    raise exception 'Artist name is required.';
  end if;
  for v_id in
    select id from public.holds
    where lower(title) = lower(trim(p_title))
      and status in ('hold', 'offer_out')
      and date >= v_today
    order by date, room_id, rank desc   -- lowest holds first on each date
  loop
    return next public.release_hold(
      v_id,
      coalesce(nullif(trim(p_reason), ''), 'Released all holds for ' || trim(p_title))
    );
  end loop;
end $$;

revoke execute on function public.release_artist(text, text) from public, anon;
