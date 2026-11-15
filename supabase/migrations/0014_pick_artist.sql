-- Pick the exact artist for a hold (from Artists or from Deezer's artist search), so two
-- artists with the same name can be told apart. Typing a name without picking still works
-- the old way: it links by name.

-- Two artists may now share a name, as long as they are different Deezer artists.
alter table public.artists drop constraint if exists artists_key_key;
create index if not exists artists_key on public.artists (key);
-- Before that: the automatic lookup sometimes matched two artists to the same Deezer artist.
-- Keep the match on the artist with the most holds (then the oldest); the others lose it and
-- get a note so they can be checked (merge them if they're really the same artist).
with ranked as (
  select a.id, a.deezer_id,
         first_value(a.name) over w as keeper,
         row_number() over w as n
    from public.artists a
    left join lateral (select count(*) c from public.holds h where h.artist_id = a.id) hc on true
   where a.deezer_id is not null
  window w as (partition by a.deezer_id order by hc.c desc, a.created_at)
)
update public.artists a
   set deezer_id = null,
       lookup_note = 'Had the same Deezer match as ' || r.keeper || ': check the photo, or merge if it''s the same artist'
  from ranked r
 where a.id = r.id and r.n > 1;

create unique index if not exists artists_deezer_id on public.artists (deezer_id) where deezer_id is not null;
-- Artists added by hand as "not on Deezer": the automatic lookup won't take a Deezer photo for them.
alter table public.artists add column if not exists not_on_deezer boolean not null default false;

-- By name: an exact name beats an alias; with several of the same name, the one with a Deezer
-- match and then the oldest wins. (Pick from the menu to choose a different one.)
create or replace function public._find_artist(p_name text) returns public.artists
language sql stable security definer set search_path = public as $$
  select a.* from public.artists a
   where a.key = public.artist_key(p_name)
      or exists (select 1 from unnest(a.aliases) x where public.artist_key(x) = public.artist_key(p_name))
   order by (a.key = public.artist_key(p_name)) desc, (a.deezer_id is not null) desc, a.created_at
   limit 1
$$;

-- The artist that was picked: an existing artist, or a Deezer artist (found or added).
create or replace function public._resolve_artist(p_artist uuid, p_deezer_id text, p_name text, p_image text, p_new boolean default false)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  -- "Add as a new artist (not on Deezer)": the artist saved under this name without a Deezer
  -- match, or a new one.
  if p_new then
    select id into v_id from public.artists
     where key = public.artist_key(p_name) and deezer_id is null
     order by created_at limit 1;
    if v_id is null then
      insert into public.artists (name, not_on_deezer)
      values (regexp_replace(btrim(p_name), '\s+', ' ', 'g'), true)
      returning id into v_id;
    else
      update public.artists set not_on_deezer = true where id = v_id;
    end if;
    return v_id;
  end if;
  if p_artist is not null then
    select id into v_id from public.artists where id = p_artist;
    if v_id is not null then return v_id; end if;
  end if;
  if nullif(btrim(p_deezer_id), '') is null then return null; end if;
  select id into v_id from public.artists where deezer_id = btrim(p_deezer_id);
  if v_id is not null then return v_id; end if;
  -- An artist already saved under this name with no Deezer match yet becomes this Deezer artist.
  select id into v_id from public.artists
   where key = public.artist_key(p_name) and deezer_id is null
   order by created_at limit 1;
  if v_id is not null then
    update public.artists
       set deezer_id = btrim(p_deezer_id), image_url = coalesce(image_url, nullif(p_image, '')), not_on_deezer = false, looked_up_at = null
     where id = v_id;
    return v_id;
  end if;
  insert into public.artists (name, deezer_id, image_url)
  values (regexp_replace(btrim(p_name), '\s+', ' ', 'g'), btrim(p_deezer_id), nullif(p_image, ''))
  returning id into v_id;
  return v_id;
end $$;

-- Same as place_holds / update_hold, but the holds go to the picked artist.
create or replace function public.place_holds_picked(
  p_room text, p_dates date[], p_title text, p_kind public.hold_kind,
  p_agent_name text, p_agent_company text, p_agent_email text, p_notes text,
  p_artist uuid, p_deezer_id text, p_deezer_name text, p_image text, p_new boolean default false
) returns setof public.holds
language plpgsql security definer set search_path = public as $$
declare
  v_actor  text := public._require_booker();
  v_artist uuid := public._resolve_artist(p_artist, p_deezer_id, coalesce(nullif(p_deezer_name, ''), p_title), p_image, p_new);
begin
  perform set_config('xbk.artist', coalesce(v_artist::text, ''), true);
  return query select * from public.place_holds(p_room, p_dates, p_title, p_kind, p_agent_name, p_agent_company, p_agent_email, p_notes);
  perform set_config('xbk.artist', '', true);
end $$;

create or replace function public.update_hold_picked(
  p_id uuid, p_title text, p_kind public.hold_kind,
  p_agent_name text, p_agent_company text, p_agent_email text, p_notes text,
  p_artist uuid, p_deezer_id text, p_deezer_name text, p_image text, p_new boolean default false
) returns public.holds
language plpgsql security definer set search_path = public as $$
declare
  v_actor  text := public._require_booker();
  v_artist uuid := public._resolve_artist(p_artist, p_deezer_id, coalesce(nullif(p_deezer_name, ''), p_title), p_image, p_new);
  v_hold   public.holds;
begin
  perform set_config('xbk.artist', coalesce(v_artist::text, ''), true);
  -- set the artist first so the name check below doesn't relink it by name
  update public.holds set artist_id = v_artist where id = p_id and v_artist is not null;
  v_hold := public.update_hold(p_id, p_title, p_kind, p_agent_name, p_agent_company, p_agent_email, p_notes);
  perform set_config('xbk.artist', '', true);
  return v_hold;
end $$;

revoke execute on function public._resolve_artist(uuid, text, text, text, boolean) from public, anon, authenticated;
revoke execute on function public.place_holds_picked(text, date[], text, public.hold_kind, text, text, text, text, uuid, text, text, text, boolean) from public, anon;
revoke execute on function public.update_hold_picked(uuid, text, public.hold_kind, text, text, text, text, uuid, text, text, text, boolean) from public, anon;

create or replace function public._hold_artist() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v      public.artists;
  v_pick uuid := nullif(current_setting('xbk.artist', true), '')::uuid;
begin
  if new.kind::text not in ('show', 'copro') or btrim(coalesce(new.title, '')) = '' then
    new.artist_id := null;
    return new;
  end if;

  -- An artist picked from the menu wins.
  if v_pick is not null then
    select * into v from public.artists where id = v_pick;
    if v.id is not null then
      new.artist_id := v.id;
      new.title := v.name;
      return new;
    end if;
  end if;

  if exists (select 1 from public.artist_ignore where key = public.artist_key(new.title)) then
    new.artist_id := null;
    return new;
  end if;
  if tg_op = 'UPDATE' and new.title is not distinct from old.title and new.kind = old.kind and new.artist_id is not null then
    return new;
  end if;
  -- Still the same artist (name or another spelling of it)? Keep the link.
  if tg_op = 'UPDATE' and new.artist_id is not null then
    select * into v from public.artists a
     where a.id = new.artist_id
       and (a.key = public.artist_key(new.title)
            or exists (select 1 from unnest(a.aliases) x where public.artist_key(x) = public.artist_key(new.title)));
    if v.id is not null then
      new.title := v.name;
      return new;
    end if;
  end if;

  v := public._find_artist(new.title);
  if v.id is null then
    insert into public.artists (name, agent_name, agent_company, agent_email)
    values (regexp_replace(btrim(new.title), '\s+', ' ', 'g'), new.agent_name, new.agent_company, new.agent_email)
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

-- Fill a picked artist's default agent from the hold, like a typed one.
create or replace function public._hold_artist_agent() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.artist_id is not null and (new.agent_name is not null or new.agent_email is not null) then
    update public.artists
       set agent_name = new.agent_name, agent_company = new.agent_company, agent_email = new.agent_email
     where id = new.artist_id and agent_name is null and agent_email is null;
  end if;
  return null;
end $$;
drop trigger if exists holds_artist_agent on public.holds;
create trigger holds_artist_agent after insert on public.holds
  for each row execute function public._hold_artist_agent();

-- Renaming: a name may now match another artist only if both are different Deezer artists.
create or replace function public.save_artist(
  p_id uuid, p_name text, p_aliases text[], p_genres text[], p_image_url text, p_links jsonb,
  p_agent_name text, p_agent_company text, p_agent_email text, p_notes text
) returns public.artists
language plpgsql security definer set search_path = public as $$
declare
  v_actor text := public._require_booker();
  v_old   public.artists;
  v_name  text := regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g');
  v_alias text[];
  v_row   public.artists;
begin
  select * into v_old from public.artists where id = p_id;
  if not found then raise exception 'Artist not found.'; end if;
  if v_name = '' then raise exception 'Enter the artist name.'; end if;
  if exists (
    select 1 from public.artists a
     where a.id <> p_id
       and (a.key = public.artist_key(v_name)
            or exists (select 1 from unnest(a.aliases) x where public.artist_key(x) = public.artist_key(v_name)))
       and (a.deezer_id is null or v_old.deezer_id is null or a.deezer_id = v_old.deezer_id)
  ) then
    raise exception '"%" is already an artist (or another artist''s alias). Merge the two instead.', v_name;
  end if;

  select coalesce(array_agg(a order by a), '{}') into v_alias from (
    select distinct on (public.artist_key(a)) btrim(a) a
      from unnest(coalesce(p_aliases, '{}') ||
                  case when public.artist_key(v_old.name) <> public.artist_key(v_name) then array[v_old.name] else '{}' end) a
     where btrim(a) <> '' and public.artist_key(a) <> public.artist_key(v_name)
  ) s;

  update public.artists set
    name = v_name, aliases = v_alias,
    genres = coalesce((select array_agg(distinct btrim(g)) from unnest(coalesce(p_genres, '{}')) g where btrim(g) <> ''), '{}'),
    image_url = nullif(btrim(p_image_url), ''),
    links = coalesce((select jsonb_object_agg(k, btrim(v)) from jsonb_each_text(coalesce(p_links, '{}'::jsonb)) as e(k, v)
                       where btrim(v) <> ''), '{}'::jsonb),
    agent_name = nullif(btrim(p_agent_name), ''),
    agent_company = nullif(btrim(p_agent_company), ''), agent_email = nullif(lower(btrim(p_agent_email)), ''),
    notes = nullif(btrim(p_notes), ''), updated_at = now()
  where id = p_id returning * into v_row;

  -- renaming keeps each hold on this artist (the trigger sees the same artist by its new name)
  update public.holds set title = v_name, updated_at = now() where artist_id = p_id and title <> v_name;
  return v_row;
end $$;

-- Merging moves holds by artist (not by name), since two artists can now share a name.
create or replace function public.merge_artists(p_keep uuid, p_merge uuid) returns public.artists
language plpgsql security definer set search_path = public as $$
declare
  v_actor text := public._require_booker();
  v_keep  public.artists;
  v_merge public.artists;
begin
  if p_keep = p_merge then raise exception 'Pick a different artist to merge.'; end if;
  select * into v_keep from public.artists where id = p_keep;
  select * into v_merge from public.artists where id = p_merge;
  if v_keep.id is null or v_merge.id is null then raise exception 'Artist not found.'; end if;

  update public.holds set artist_id = p_keep where artist_id = p_merge;
  delete from public.artists where id = p_merge;
  update public.artists set
    aliases = (select coalesce(array_agg(distinct a), '{}') from unnest(v_keep.aliases || v_merge.aliases || array[v_merge.name]) a
                where public.artist_key(a) <> v_keep.key),
    genres = case when cardinality(genres) = 0 then v_merge.genres else genres end,
    image_url = coalesce(image_url, v_merge.image_url),
    deezer_id = coalesce(deezer_id, v_merge.deezer_id),
    musicbrainz_id = coalesce(musicbrainz_id, v_merge.musicbrainz_id),
    links = v_merge.links || links,
    agent_name = coalesce(agent_name, v_merge.agent_name),
    agent_company = coalesce(agent_company, v_merge.agent_company),
    agent_email = coalesce(agent_email, v_merge.agent_email),
    notes = nullif(concat_ws(E'\n', notes, v_merge.notes), ''),
    updated_at = now()
  where id = p_keep returning * into v_keep;

  update public.holds set title = v_keep.name, updated_at = now() where artist_id = p_keep and title <> v_keep.name;
  return v_keep;
end $$;
