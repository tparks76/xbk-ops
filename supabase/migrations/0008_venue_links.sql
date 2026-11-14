-- Better links for venues whose main site doesn't list shows in a readable way.
update public.watched_venues set url = 'https://www.firstfleetconcerts.com/first-fleet-venues/woolys' where name = 'Wooly''s';
update public.watched_venues set url = 'https://www.firstfleetconcerts.com/first-fleet-venues/val-air-ballroom' where name = 'Val Air Ballroom';
update public.watched_venues set url = 'https://hoytsherman.org/events/' where name = 'Hoyt Sherman Place';
update public.watched_venues set url = 'https://noce.turntabletickets.com' where name = 'Noce';
update public.watched_venues set url = 'https://www.localsdsm.com/calendar' where name = 'Locals Bar & Stage';
