-- stg_mp_locations: part 1 of 1, 17 rows. NOT APPLIED, branch only.
-- Licence on every row comes from the FILE, never the filename.
create table if not exists public.stg_mp_locations (
  location text,
  source_file text not null,
  file_sha256 text not null,
  licence text not null,
  file_window text,
  ingested_at timestamptz not null default now()
);
alter table public.stg_mp_locations enable row level security;
drop policy if exists stg_mp_locations_read on public.stg_mp_locations;
create policy stg_mp_locations_read on public.stg_mp_locations for select to authenticated using (true);
insert into public.stg_mp_locations (location,source_file,file_sha256,licence,file_window) values
('BDA/Storage Room','Metrc-Massachusetts-MP281909-Locations.xlsx','1efea17d5bad08e5a0c973861cf8ca9758136139aff0147d09aea0b3103996dd','MP281909',null),
('Biomass Prep','Metrc-Massachusetts-MP281909-Locations.xlsx','1efea17d5bad08e5a0c973861cf8ca9758136139aff0147d09aea0b3103996dd','MP281909',null),
('Cure Vault','Metrc-Massachusetts-MP281909-Locations.xlsx','1efea17d5bad08e5a0c973861cf8ca9758136139aff0147d09aea0b3103996dd','MP281909',null),
('Dry Room #1','Metrc-Massachusetts-MP281909-Locations.xlsx','1efea17d5bad08e5a0c973861cf8ca9758136139aff0147d09aea0b3103996dd','MP281909',null),
('Dry Room #2','Metrc-Massachusetts-MP281909-Locations.xlsx','1efea17d5bad08e5a0c973861cf8ca9758136139aff0147d09aea0b3103996dd','MP281909',null),
('Finish Vault','Metrc-Massachusetts-MP281909-Locations.xlsx','1efea17d5bad08e5a0c973861cf8ca9758136139aff0147d09aea0b3103996dd','MP281909',null),
('Freezer/Biomass Storage','Metrc-Massachusetts-MP281909-Locations.xlsx','1efea17d5bad08e5a0c973861cf8ca9758136139aff0147d09aea0b3103996dd','MP281909',null),
('Fulfillment Vault','Metrc-Massachusetts-MP281909-Locations.xlsx','1efea17d5bad08e5a0c973861cf8ca9758136139aff0147d09aea0b3103996dd','MP281909',null),
('Grind Room','Metrc-Massachusetts-MP281909-Locations.xlsx','1efea17d5bad08e5a0c973861cf8ca9758136139aff0147d09aea0b3103996dd','MP281909',null),
('Hydrocarbon','Metrc-Massachusetts-MP281909-Locations.xlsx','1efea17d5bad08e5a0c973861cf8ca9758136139aff0147d09aea0b3103996dd','MP281909',null),
('Packaging Room','Metrc-Massachusetts-MP281909-Locations.xlsx','1efea17d5bad08e5a0c973861cf8ca9758136139aff0147d09aea0b3103996dd','MP281909',null),
('Pre-Trim Storage','Metrc-Massachusetts-MP281909-Locations.xlsx','1efea17d5bad08e5a0c973861cf8ca9758136139aff0147d09aea0b3103996dd','MP281909',null),
('Production Room','Metrc-Massachusetts-MP281909-Locations.xlsx','1efea17d5bad08e5a0c973861cf8ca9758136139aff0147d09aea0b3103996dd','MP281909',null),
('Quarantine','Metrc-Massachusetts-MP281909-Locations.xlsx','1efea17d5bad08e5a0c973861cf8ca9758136139aff0147d09aea0b3103996dd','MP281909',null),
('Shipping & Receiving','Metrc-Massachusetts-MP281909-Locations.xlsx','1efea17d5bad08e5a0c973861cf8ca9758136139aff0147d09aea0b3103996dd','MP281909',null),
('Solventless','Metrc-Massachusetts-MP281909-Locations.xlsx','1efea17d5bad08e5a0c973861cf8ca9758136139aff0147d09aea0b3103996dd','MP281909',null),
('Warehouse #1','Metrc-Massachusetts-MP281909-Locations.xlsx','1efea17d5bad08e5a0c973861cf8ca9758136139aff0147d09aea0b3103996dd','MP281909',null);
