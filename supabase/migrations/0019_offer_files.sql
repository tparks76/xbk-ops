-- Attachments on offers (a promoter's or co-promoter's offer, etc.), kept private in Supabase Storage.
-- Files are uploaded with one-time signed links and opened with short-lived signed links made by the
-- server, so no storage policies are needed.
insert into storage.buckets (id, name, public, file_size_limit)
values ('offer-files', 'offer-files', false, 26214400)   -- 25 MB per file
on conflict (id) do nothing;
