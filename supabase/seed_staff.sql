-- Add the people who can sign in. Change the emails to the real Microsoft 365
-- addresses (lowercase), then run this in Supabase → SQL Editor.
-- Roles: owner, booker, venue_manager, marketing, advance, production, mod
-- Only owner and booker can place or change holds; everyone else can view.

insert into public.staff (email, name, role) values
  ('tobi@YOUR-DOMAIN.com', 'Tobi', 'owner'),
  ('bill@YOUR-DOMAIN.com', 'Bill', 'booker')
on conflict (email) do update set name = excluded.name, role = excluded.role, active = true;
