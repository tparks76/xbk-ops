-- Money collected for each Eventim count, split up: face value, add-ons, facility/service/processing
-- fees, tax, discounts, and the all-in total buyers paid.
alter table public.ticket_counts add column if not exists fees jsonb;
