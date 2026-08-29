-- stg_mc_employees: part 1 of 1, 29 rows. NOT APPLIED, branch only.
-- Licence on every row comes from the FILE, never the filename.
create table if not exists public.stg_mc_employees (
  license_number text,
  source_file text not null,
  file_sha256 text not null,
  licence text not null,
  file_window text,
  ingested_at timestamptz not null default now()
);
alter table public.stg_mc_employees enable row level security;
drop policy if exists stg_mc_employees_read on public.stg_mc_employees;
create policy stg_mc_employees_read on public.stg_mc_employees for select to authenticated using (true);
insert into public.stg_mc_employees (license_number,source_file,file_sha256,licence,file_window) values
('127854','Metrc-Massachusetts-MC281714-Employees.xlsx','b0c2df4d209dd9437f27e9846058b9b98159a65aaed3c2416cdd66a0141a87a2','MC281714',null),
('138756','Metrc-Massachusetts-MC281714-Employees.xlsx','b0c2df4d209dd9437f27e9846058b9b98159a65aaed3c2416cdd66a0141a87a2','MC281714',null),
('132633','Metrc-Massachusetts-MC281714-Employees.xlsx','b0c2df4d209dd9437f27e9846058b9b98159a65aaed3c2416cdd66a0141a87a2','MC281714',null),
('166125','Metrc-Massachusetts-MC281714-Employees.xlsx','b0c2df4d209dd9437f27e9846058b9b98159a65aaed3c2416cdd66a0141a87a2','MC281714',null),
('156504','Metrc-Massachusetts-MC281714-Employees.xlsx','b0c2df4d209dd9437f27e9846058b9b98159a65aaed3c2416cdd66a0141a87a2','MC281714',null),
('152803','Metrc-Massachusetts-MC281714-Employees.xlsx','b0c2df4d209dd9437f27e9846058b9b98159a65aaed3c2416cdd66a0141a87a2','MC281714',null),
('174468','Metrc-Massachusetts-MC281714-Employees.xlsx','b0c2df4d209dd9437f27e9846058b9b98159a65aaed3c2416cdd66a0141a87a2','MC281714',null),
('157559','Metrc-Massachusetts-MC281714-Employees.xlsx','b0c2df4d209dd9437f27e9846058b9b98159a65aaed3c2416cdd66a0141a87a2','MC281714',null),
('157556','Metrc-Massachusetts-MC281714-Employees.xlsx','b0c2df4d209dd9437f27e9846058b9b98159a65aaed3c2416cdd66a0141a87a2','MC281714',null),
('157557','Metrc-Massachusetts-MC281714-Employees.xlsx','b0c2df4d209dd9437f27e9846058b9b98159a65aaed3c2416cdd66a0141a87a2','MC281714',null),
('157618','Metrc-Massachusetts-MC281714-Employees.xlsx','b0c2df4d209dd9437f27e9846058b9b98159a65aaed3c2416cdd66a0141a87a2','MC281714',null),
('157594','Metrc-Massachusetts-MC281714-Employees.xlsx','b0c2df4d209dd9437f27e9846058b9b98159a65aaed3c2416cdd66a0141a87a2','MC281714',null),
('154635','Metrc-Massachusetts-MC281714-Employees.xlsx','b0c2df4d209dd9437f27e9846058b9b98159a65aaed3c2416cdd66a0141a87a2','MC281714',null),
('174248','Metrc-Massachusetts-MC281714-Employees.xlsx','b0c2df4d209dd9437f27e9846058b9b98159a65aaed3c2416cdd66a0141a87a2','MC281714',null),
('157491','Metrc-Massachusetts-MC281714-Employees.xlsx','b0c2df4d209dd9437f27e9846058b9b98159a65aaed3c2416cdd66a0141a87a2','MC281714',null),
('170984','Metrc-Massachusetts-MC281714-Employees.xlsx','b0c2df4d209dd9437f27e9846058b9b98159a65aaed3c2416cdd66a0141a87a2','MC281714',null),
('173815','Metrc-Massachusetts-MC281714-Employees.xlsx','b0c2df4d209dd9437f27e9846058b9b98159a65aaed3c2416cdd66a0141a87a2','MC281714',null),
('124326','Metrc-Massachusetts-MC281714-Employees.xlsx','b0c2df4d209dd9437f27e9846058b9b98159a65aaed3c2416cdd66a0141a87a2','MC281714',null),
('157492','Metrc-Massachusetts-MC281714-Employees.xlsx','b0c2df4d209dd9437f27e9846058b9b98159a65aaed3c2416cdd66a0141a87a2','MC281714',null),
('174245','Metrc-Massachusetts-MC281714-Employees.xlsx','b0c2df4d209dd9437f27e9846058b9b98159a65aaed3c2416cdd66a0141a87a2','MC281714',null),
('162809','Metrc-Massachusetts-MC281714-Employees.xlsx','b0c2df4d209dd9437f27e9846058b9b98159a65aaed3c2416cdd66a0141a87a2','MC281714',null),
('152557','Metrc-Massachusetts-MC281714-Employees.xlsx','b0c2df4d209dd9437f27e9846058b9b98159a65aaed3c2416cdd66a0141a87a2','MC281714',null),
('130352','Metrc-Massachusetts-MC281714-Employees.xlsx','b0c2df4d209dd9437f27e9846058b9b98159a65aaed3c2416cdd66a0141a87a2','MC281714',null),
('157117','Metrc-Massachusetts-MC281714-Employees.xlsx','b0c2df4d209dd9437f27e9846058b9b98159a65aaed3c2416cdd66a0141a87a2','MC281714',null),
('174086','Metrc-Massachusetts-MC281714-Employees.xlsx','b0c2df4d209dd9437f27e9846058b9b98159a65aaed3c2416cdd66a0141a87a2','MC281714',null),
('147711','Metrc-Massachusetts-MC281714-Employees.xlsx','b0c2df4d209dd9437f27e9846058b9b98159a65aaed3c2416cdd66a0141a87a2','MC281714',null),
('148832','Metrc-Massachusetts-MC281714-Employees.xlsx','b0c2df4d209dd9437f27e9846058b9b98159a65aaed3c2416cdd66a0141a87a2','MC281714',null),
('130158','Metrc-Massachusetts-MC281714-Employees.xlsx','b0c2df4d209dd9437f27e9846058b9b98159a65aaed3c2416cdd66a0141a87a2','MC281714',null),
('153877','Metrc-Massachusetts-MC281714-Employees.xlsx','b0c2df4d209dd9437f27e9846058b9b98159a65aaed3c2416cdd66a0141a87a2','MC281714',null);
