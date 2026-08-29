-- stg_mc_transfers_incoming: part 1 of 1, 1 rows. NOT APPLIED, branch only.
-- Licence on every row comes from the FILE, never the filename.
create table if not exists public.stg_mc_transfers_incoming (
  manifest text,
  source_file text not null,
  file_sha256 text not null,
  licence text not null,
  file_window text,
  ingested_at timestamptz not null default now()
);
alter table public.stg_mc_transfers_incoming enable row level security;
drop policy if exists stg_mc_transfers_incoming_read on public.stg_mc_transfers_incoming;
create policy stg_mc_transfers_incoming_read on public.stg_mc_transfers_incoming for select to authenticated using (true);
insert into public.stg_mc_transfers_incoming (manifest,source_file,file_sha256,licence,file_window) values
('0003363149','Metrc-Massachusetts-MC281714-LicensedTransfers-Incoming (1).xlsx','e71422e89cab07906590d75b65268f7b13a1e6b6305325d9cec7752d1139d6ab','MC281714',null);
