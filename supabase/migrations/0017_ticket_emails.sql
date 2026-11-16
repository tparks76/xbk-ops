-- Daily ticket sales from Eventim's "Daily Event Stats" email.
-- Each email is kept (with every row read from it); rows are matched to confirmed holds by
-- room, date and name, and saved as ticket counts.

alter table public.ticket_counts drop constraint if exists ticket_counts_source_check;
alter table public.ticket_counts add constraint ticket_counts_source_check check (source in ('manual', 'eventim', 'email'));
alter table public.ticket_counts add column if not exists capacity int;   -- sold + unsold, from Eventim

create table public.ticket_reports (
  id          uuid primary key default gen_random_uuid(),
  received_at timestamptz not null default now(),
  report_date date,
  rows        jsonb not null default '[]'::jsonb,   -- every event in the email, with the hold it matched (if any)
  matched     int not null default 0,
  unmatched   int not null default 0
);
alter table public.ticket_reports enable row level security;
create policy "staff read ticket reports" on public.ticket_reports for select to authenticated using (public.is_staff());

-- The same email is only read once.
alter table public.ticket_reports add column if not exists message_id text unique;
