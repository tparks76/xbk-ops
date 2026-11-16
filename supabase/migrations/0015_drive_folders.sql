-- Google Drive show folders: when a show is confirmed, a folder "MM.DD.YY - Artist" is made in the
-- xBk Master Show Files folder and the offer PDF is saved in it. These record where it went.
alter table public.holds add column if not exists drive_folder_url text;
alter table public.holds add column if not exists drive_note text;
