-- stg_mc_locations: part 1 of 1, 21 rows. NOT APPLIED, branch only.
-- Licence on every row comes from the FILE, never the filename.
create table if not exists public.stg_mc_locations (
  location text,
  source_file text not null,
  file_sha256 text not null,
  licence text not null,
  file_window text,
  ingested_at timestamptz not null default now()
);
alter table public.stg_mc_locations enable row level security;
drop policy if exists stg_mc_locations_read on public.stg_mc_locations;
create policy stg_mc_locations_read on public.stg_mc_locations for select to authenticated using (true);
insert into public.stg_mc_locations (location,source_file,file_sha256,licence,file_window) values
('BDA/Storage Room','Metrc-Massachusetts-MC281714-Locations (2).xlsx','3b7d2de79b9e76a47fdd677254b64178935f96cbe55c8b62d87498ba0fd37dc6','MC281714',null),
('Clone Room','Metrc-Massachusetts-MC281714-Locations (2).xlsx','3b7d2de79b9e76a47fdd677254b64178935f96cbe55c8b62d87498ba0fd37dc6','MC281714',null),
('Cure Vault','Metrc-Massachusetts-MC281714-Locations (2).xlsx','3b7d2de79b9e76a47fdd677254b64178935f96cbe55c8b62d87498ba0fd37dc6','MC281714',null),
('Dry Room #1','Metrc-Massachusetts-MC281714-Locations (2).xlsx','3b7d2de79b9e76a47fdd677254b64178935f96cbe55c8b62d87498ba0fd37dc6','MC281714',null),
('Dry Room #2','Metrc-Massachusetts-MC281714-Locations (2).xlsx','3b7d2de79b9e76a47fdd677254b64178935f96cbe55c8b62d87498ba0fd37dc6','MC281714',null),
('Finish Vault','Metrc-Massachusetts-MC281714-Locations (2).xlsx','3b7d2de79b9e76a47fdd677254b64178935f96cbe55c8b62d87498ba0fd37dc6','MC281714',null),
('Flower Room #1','Metrc-Massachusetts-MC281714-Locations (2).xlsx','3b7d2de79b9e76a47fdd677254b64178935f96cbe55c8b62d87498ba0fd37dc6','MC281714',null),
('Flower Room #2','Metrc-Massachusetts-MC281714-Locations (2).xlsx','3b7d2de79b9e76a47fdd677254b64178935f96cbe55c8b62d87498ba0fd37dc6','MC281714',null),
('Flower Room #3','Metrc-Massachusetts-MC281714-Locations (2).xlsx','3b7d2de79b9e76a47fdd677254b64178935f96cbe55c8b62d87498ba0fd37dc6','MC281714',null),
('Flower Room #4','Metrc-Massachusetts-MC281714-Locations (2).xlsx','3b7d2de79b9e76a47fdd677254b64178935f96cbe55c8b62d87498ba0fd37dc6','MC281714',null),
('Freezer/Biomass Storage','Metrc-Massachusetts-MC281714-Locations (2).xlsx','3b7d2de79b9e76a47fdd677254b64178935f96cbe55c8b62d87498ba0fd37dc6','MC281714',null),
('Fulfillment Vault','Metrc-Massachusetts-MC281714-Locations (2).xlsx','3b7d2de79b9e76a47fdd677254b64178935f96cbe55c8b62d87498ba0fd37dc6','MC281714',null),
('Grind Room','Metrc-Massachusetts-MC281714-Locations (2).xlsx','3b7d2de79b9e76a47fdd677254b64178935f96cbe55c8b62d87498ba0fd37dc6','MC281714',null),
('Mother Room','Metrc-Massachusetts-MC281714-Locations (2).xlsx','3b7d2de79b9e76a47fdd677254b64178935f96cbe55c8b62d87498ba0fd37dc6','MC281714',null),
('Packaging Room','Metrc-Massachusetts-MC281714-Locations (2).xlsx','3b7d2de79b9e76a47fdd677254b64178935f96cbe55c8b62d87498ba0fd37dc6','MC281714',null),
('Pre Trim Storage Room','Metrc-Massachusetts-MC281714-Locations (2).xlsx','3b7d2de79b9e76a47fdd677254b64178935f96cbe55c8b62d87498ba0fd37dc6','MC281714',null),
('QA Room','Metrc-Massachusetts-MC281714-Locations (2).xlsx','3b7d2de79b9e76a47fdd677254b64178935f96cbe55c8b62d87498ba0fd37dc6','MC281714',null),
('Quarantine','Metrc-Massachusetts-MC281714-Locations (2).xlsx','3b7d2de79b9e76a47fdd677254b64178935f96cbe55c8b62d87498ba0fd37dc6','MC281714',null),
('Shipping & Receiving','Metrc-Massachusetts-MC281714-Locations (2).xlsx','3b7d2de79b9e76a47fdd677254b64178935f96cbe55c8b62d87498ba0fd37dc6','MC281714',null),
('Trim Room','Metrc-Massachusetts-MC281714-Locations (2).xlsx','3b7d2de79b9e76a47fdd677254b64178935f96cbe55c8b62d87498ba0fd37dc6','MC281714',null),
('Vegetation Room','Metrc-Massachusetts-MC281714-Locations (2).xlsx','3b7d2de79b9e76a47fdd677254b64178935f96cbe55c8b62d87498ba0fd37dc6','MC281714',null);
