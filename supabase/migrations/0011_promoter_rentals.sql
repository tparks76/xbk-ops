-- More hold types: a promoter renting the room to put on a show, and co-promoted shows.
-- (Existing "rental" holds become "Private Rental" in the app; nothing changes in the data.)
alter type public.hold_kind add value if not exists 'promoter';
alter type public.hold_kind add value if not exists 'copro';
