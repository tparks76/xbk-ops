-- Notes on a date (e.g. competing events elsewhere). Not holds.
create table public.date_notes (
  id         uuid primary key default gen_random_uuid(),
  date       date not null,
  body       text not null check (length(trim(body)) > 0),
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index date_notes_date on public.date_notes (date);

alter table public.date_notes enable row level security;

create policy "staff read date notes" on public.date_notes
  for select to authenticated using (public.is_staff());

create policy "bookers add date notes" on public.date_notes
  for insert to authenticated
  with check (public.can_book() and created_by = public.current_email());

create policy "bookers edit date notes" on public.date_notes
  for update to authenticated using (public.can_book()) with check (public.can_book());

create policy "bookers delete date notes" on public.date_notes
  for delete to authenticated using (public.can_book());
