-- Allow each sport to have its own Court 1, Court 2, etc.
alter table public.courts drop constraint if exists courts_venue_id_name_key;
alter table public.courts drop constraint if exists courts_sport_id_name_key;
drop index if exists courts_sport_id_name_uidx;
create unique index courts_sport_id_name_uidx
  on public.courts (sport_id, name)
  where sport_id is not null;
