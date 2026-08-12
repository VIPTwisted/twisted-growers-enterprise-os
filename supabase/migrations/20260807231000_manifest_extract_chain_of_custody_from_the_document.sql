-- Chain of custody read off the manifest itself.
--
-- WHY: all 2,550 outgoing transfer records carry a NULL recipient. Metrc returns
-- the recipient on the DELIVERY (/transfers/v2/{id}/deliveries) and the sync has
-- only ever pulled the header. So the platform can see everything that came in and
-- nothing about where anything went - 17,191 packages shipped, destination unknown.
-- The manifest PDF prints it, and 2,683 are already on disk.
--
-- RLS on from the first statement (rule: never after).

create table if not exists public.manifest_extract (
  manifest_number      text primary key,
  document_id          text,
  origin_name          text,
  origin_license       text,
  destination_name     text,
  destination_license  text,
  transporter_name     text,
  transporter_license  text,
  date_created         text,
  departure            text,
  arrival              text,
  is_lab_run           boolean,
  parse_note           text,
  parser_version       text,
  parsed_at            timestamptz not null default now()
);

alter table public.manifest_extract enable row level security;

drop policy if exists manifest_extract_read on public.manifest_extract;
create policy manifest_extract_read on public.manifest_extract
  for select to authenticated using (true);

comment on table public.manifest_extract is
  'Destination, transporter and dates read from the manifest PDF - the chain of '
  'custody outside the facility. Exists because metrc_transfers has a NULL recipient '
  'on all 2,550 outgoing records: Metrc puts it on the deliveries endpoint, which '
  'the sync has never called. destination_license is the authoritative one; a '
  'Massachusetts transporter is MX######, a laboratory is IL######.';
comment on column public.manifest_extract.destination_license is
  'WHO RECEIVED IT. The single field that closes the outbound half of seed-to-sale.';
comment on column public.manifest_extract.is_lab_run is
  'Destination is IL######, a testing laboratory. 228 outgoing manifests carrying '
  '1,402 sample packages are lab runs - against 29 sample packages visible in '
  'metrc_packages.';

create index if not exists manifest_extract_dest_idx on public.manifest_extract (destination_license);
create index if not exists manifest_extract_lab_idx  on public.manifest_extract (is_lab_run) where is_lab_run;;
