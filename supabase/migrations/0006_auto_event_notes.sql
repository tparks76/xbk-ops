-- Date notes added automatically from outside event listings (Ticketmaster).
alter table public.date_notes
  add column source      text not null default 'manual',  -- 'manual' or 'ticketmaster'
  add column external_id text,                            -- the listing's event id
  add column venue       text,
  add column url         text,
  add column hidden      boolean not null default false;  -- hidden auto notes stay hidden on re-sync

-- One note per outside event (manual notes have no external id).
alter table public.date_notes
  add constraint date_notes_source_external_unique unique (source, external_id);
