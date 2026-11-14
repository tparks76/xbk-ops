-- Venues whose own events pages are read daily and added as date notes.
create table public.watched_venues (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  url          text not null,
  ignore_words text not null default '',  -- comma-separated; events whose title contains any are skipped
  active       boolean not null default true,
  last_checked timestamptz,
  last_found   int,
  last_method  text,
  last_error   text,
  created_at   timestamptz not null default now()
);

alter table public.watched_venues enable row level security;

create policy "staff read watched venues" on public.watched_venues
  for select to authenticated using (public.is_staff());
create policy "bookers add watched venues" on public.watched_venues
  for insert to authenticated with check (public.can_book());
create policy "bookers edit watched venues" on public.watched_venues
  for update to authenticated using (public.can_book()) with check (public.can_book());
create policy "bookers delete watched venues" on public.watched_venues
  for delete to authenticated using (public.can_book());

-- Starting list (edit links on the Venues page if a site has moved).
insert into public.watched_venues (name, url, ignore_words) values
  ('Casey''s Center', 'https://www.iowaeventscenter.com/events/all',
   'vs., parking, barnstormers, iowa wild, iowa wolves, disney on ice, monster jam, convention, expo, tournament, rodeo, circus, rv show, home show, galaxycon, wrestling, wwe, ufc, globetrotters'),
  ('Vibrant Music Hall', 'https://www.vibrantmusichall.com', 'parking'),
  ('Val Air Ballroom', 'https://www.valairballroom.com', 'parking'),
  ('Hoyt Sherman Place', 'https://www.hoytsherman.org', 'tour, class'),
  ('Wooly''s', 'https://www.woolysdm.com', 'parking'),
  ('Noce', 'https://www.nocedsm.com', ''),
  ('Locals Bar & Stage', 'https://www.localsdsm.com', '');
