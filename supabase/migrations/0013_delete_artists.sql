-- Delete an artist. Their holds stay on the calendar (same name) but are no longer linked.
-- Optionally the name is put on an "ignore" list so it isn't added back as an artist
-- the next time it's typed on a hold (for names like "TBD" that aren't artists).

create table public.artist_ignore (
  key        text primary key,          -- public.artist_key(name)
  name       text not null,
  created_by text,
  created_at timestamptz not null default now()
);
alter table public.artist_ignore enable row level security;
create policy "staff read ignored artist names" on public.artist_ignore for select to authenticated using (public.is_staff());

create or replace function public.delete_artist(p_id uuid, p_ignore boolean) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_actor text := public._require_booker();
  v       public.artists;
begin
  select * into v from public.artists where id = p_id;
  if not found then raise exception 'Artist not found.'; end if;
  if p_ignore then
    insert into public.artist_ignore (key, name, created_by)
    select public.artist_key(n), n, v_actor from unnest(array[v.name] || v.aliases) n
    on conflict (key) do nothing;
  end if;
  delete from public.artists where id = p_id;   -- holds.artist_id becomes null
end $$;

-- Take a name off the ignore list; its holds link up again (and recreate the artist).
create or replace function public.unignore_artist_name(p_key text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_actor text := public._require_booker();
begin
  delete from public.artist_ignore where key = p_key;
  update public.holds set title = title
   where artist_id is null and kind::text in ('show', 'copro') and public.artist_key(title) = p_key;
end $$;

revoke execute on function public.delete_artist(uuid, boolean) from public, anon;
revoke execute on function public.unignore_artist_name(text) from public, anon;

-- Holds whose name is on the ignore list aren't linked to an artist.
create or replace function public._hold_artist() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v public.artists;
begin
  if new.kind::text not in ('show', 'copro') or btrim(coalesce(new.title, '')) = ''
     or exists (select 1 from public.artist_ignore where key = public.artist_key(new.title)) then
    new.artist_id := null;
    return new;
  end if;
  if tg_op = 'UPDATE' and new.title is not distinct from old.title and new.kind = old.kind and new.artist_id is not null then
    return new;
  end if;

  v := public._find_artist(new.title);
  if v.id is null then
    insert into public.artists (name, agent_name, agent_company, agent_email)
    values (regexp_replace(btrim(new.title), '\s+', ' ', 'g'), new.agent_name, new.agent_company, new.agent_email)
    on conflict (key) do update set updated_at = public.artists.updated_at
    returning * into v;
  elsif v.agent_name is null and v.agent_email is null and (new.agent_name is not null or new.agent_email is not null) then
    update public.artists
       set agent_name = new.agent_name, agent_company = new.agent_company, agent_email = new.agent_email
     where id = v.id;
  end if;

  new.artist_id := v.id;
  new.title := v.name;
  return new;
end $$;
