-- Eventim sales import: capacity from Eventim's ticket allotments, and one saved count per day.
alter table public.ticket_counts add column if not exists capacity int;
alter table public.ticket_counts add column if not exists sales_day date;   -- for Eventim counts: the day the count is for
-- (manual counts leave sales_day empty, so they never clash)
create unique index if not exists ticket_counts_day on public.ticket_counts (hold_id, sales_day);
