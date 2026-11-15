-- Artist directory: one record per artist, so names are spelled the same everywhere and
-- holds, offers and reports can be grouped by artist.
-- Show and Co-Pro holds link to an artist automatically: typing a known name (or an alias)
-- uses that artist and its standard spelling; a new name creates a new artist.

create table public.artists (
  id             uuid primary key default gen_random_uuid(),
  name           text not null check (btrim(name) <> ''),
  -- the name used for matching: lower case, single spaces
  key            text generated always as (regexp_replace(lower(btrim(name)), '\s+', ' ', 'g')) stored unique,
  aliases        text[] not null default '{}',   -- other spellings that mean this artist
  genres         text[] not null default '{}',
  image_url      text,
  deezer_id      text,                           -- where the photo comes from
  musicbrainz_id text,                           -- where the genres come from
  -- links out: {"spotify": url, "instagram": url, "facebook": url, "tiktok": url, "youtube": url, "bandcamp": url, "website": url}
  links          jsonb not null default '{}'::jsonb,
  agent_name     text,                           -- default agent, filled in on new holds
  agent_company  text,
  agent_email    text,
  notes          text,
  looked_up_at   timestamptz,                    -- last photo/genre lookup; null = not looked up yet
  lookup_note    text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create or replace function public.artist_key(p text) returns text
language sql immutable as $$ select regexp_replace(lower(btrim(coalesce(p, ''))), '\s+', ' ', 'g') $$;

create index artists_aliases on public.artists using gin (aliases);

alter table public.holds add column artist_id uuid references public.artists(id) on delete set null;
create index holds_artist on public.holds (artist_id);

alter table public.artists enable row level security;
create policy "staff read artists" on public.artists for select to authenticated using (public.is_staff());
create policy "bookers edit artists" on public.artists for update to authenticated
  using (public.can_book()) with check (public.can_book());

-- Find an artist by name or alias.
create or replace function public._find_artist(p_name text) returns public.artists
language sql stable security definer set search_path = public as $$
  select a.* from public.artists a
   where a.key = public.artist_key(p_name)
      or exists (select 1 from unnest(a.aliases) x where public.artist_key(x) = public.artist_key(p_name))
   order by (a.key = public.artist_key(p_name)) desc
   limit 1
$$;

-- Link Show and Co-Pro holds to an artist whenever the name or type is set or changed.
create or replace function public._hold_artist() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v public.artists;
begin
  if new.kind::text not in ('show', 'copro') or btrim(coalesce(new.title, '')) = '' then
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
  new.title := v.name;   -- the standard spelling
  return new;
end $$;

create trigger holds_artist before insert or update of title, kind on public.holds
  for each row execute function public._hold_artist();

-- Save an artist from the artist page. Renaming keeps the old name as an alias and
-- updates the artist's holds to the new spelling.
create or replace function public.save_artist(
  p_id uuid, p_name text, p_aliases text[], p_genres text[], p_image_url text, p_links jsonb,
  p_agent_name text, p_agent_company text, p_agent_email text, p_notes text
) returns public.artists
language plpgsql security definer set search_path = public as $$
declare
  v_actor text := public._require_booker();
  v_old   public.artists;
  v_other public.artists;
  v_name  text := regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g');
  v_alias text[];
  v_row   public.artists;
begin
  select * into v_old from public.artists where id = p_id;
  if not found then raise exception 'Artist not found.'; end if;
  if v_name = '' then raise exception 'Enter the artist name.'; end if;
  v_other := public._find_artist(v_name);
  if v_other.id is not null and v_other.id <> p_id then
    raise exception '"%" is already an artist (or another artist''s alias). Merge the two instead.', v_name;
  end if;

  -- aliases: as entered, plus the old name if it changed; never the name itself; no repeats
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

  update public.holds set title = v_name, updated_at = now() where artist_id = p_id and title <> v_name;
  return v_row;
end $$;

-- Merge a duplicate into the artist to keep: its holds move over and its names become aliases.
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

  delete from public.artists where id = p_merge;
  update public.artists set
    aliases = (select coalesce(array_agg(distinct a), '{}') from unnest(v_keep.aliases || v_merge.aliases || array[v_merge.name]) a
                where public.artist_key(a) <> v_keep.key),
    genres = case when cardinality(genres) = 0 then v_merge.genres else genres end,
    image_url = coalesce(image_url, v_merge.image_url),
    links = v_merge.links || links,
    agent_name = coalesce(agent_name, v_merge.agent_name),
    agent_company = coalesce(agent_company, v_merge.agent_company),
    agent_email = coalesce(agent_email, v_merge.agent_email),
    notes = concat_ws(E'\n', notes, v_merge.notes),
    updated_at = now()
  where id = p_keep returning * into v_keep;

  -- the deleted artist's holds lost their link; re-link them by name (now an alias of the kept artist)
  update public.holds set title = v_keep.name, artist_id = null, updated_at = now()
   where artist_id is null and kind::text in ('show', 'copro')
     and public.artist_key(title) in (select public.artist_key(x) from unnest(v_keep.aliases || array[v_keep.name]) x);
  return v_keep;
end $$;

revoke execute on function public._find_artist(text) from public, anon, authenticated;
revoke execute on function public._hold_artist() from public, anon, authenticated;
revoke execute on function public.save_artist(uuid, text, text[], text[], text, jsonb, text, text, text, text) from public, anon;
revoke execute on function public.merge_artists(uuid, uuid) from public, anon;

-- Link the holds already on the calendar.
update public.holds set title = title where kind::text in ('show', 'copro');
