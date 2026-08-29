-- stg_mc_plants_vegetative_asof_0806: part 1 of 1, 33 rows. NOT APPLIED, branch only.
-- Licence on every row comes from the FILE, never the filename.
create table if not exists public.stg_mc_plants_vegetative_asof_0806 (
  tag text,
  source_file text not null,
  file_sha256 text not null,
  licence text not null,
  file_window text,
  ingested_at timestamptz not null default now()
);
alter table public.stg_mc_plants_vegetative_asof_0806 enable row level security;
drop policy if exists stg_mc_plants_vegetative_asof_0806_read on public.stg_mc_plants_vegetative_asof_0806;
create policy stg_mc_plants_vegetative_asof_0806_read on public.stg_mc_plants_vegetative_asof_0806 for select to authenticated using (true);
insert into public.stg_mc_plants_vegetative_asof_0806 (tag,source_file,file_sha256,licence,file_window) values
('1A40A020000E5B1000048594','Metrc-Massachusetts-MC281714-Plants-Vegetative (1).xlsx','82d731587741e82ddbc1473af6e51c561d4562cc21c7ebe3baad68297d55882c','MC281714',null),
('1A40A020000E5B1000048582','Metrc-Massachusetts-MC281714-Plants-Vegetative (1).xlsx','82d731587741e82ddbc1473af6e51c561d4562cc21c7ebe3baad68297d55882c','MC281714',null),
('1A40A020000E5B1000053017','Metrc-Massachusetts-MC281714-Plants-Vegetative (1).xlsx','82d731587741e82ddbc1473af6e51c561d4562cc21c7ebe3baad68297d55882c','MC281714',null),
('1A40A020000E5B1000056258','Metrc-Massachusetts-MC281714-Plants-Vegetative (1).xlsx','82d731587741e82ddbc1473af6e51c561d4562cc21c7ebe3baad68297d55882c','MC281714',null),
('1A40A020000E5B1000056264','Metrc-Massachusetts-MC281714-Plants-Vegetative (1).xlsx','82d731587741e82ddbc1473af6e51c561d4562cc21c7ebe3baad68297d55882c','MC281714',null),
('1A40A020000E5B1000056265','Metrc-Massachusetts-MC281714-Plants-Vegetative (1).xlsx','82d731587741e82ddbc1473af6e51c561d4562cc21c7ebe3baad68297d55882c','MC281714',null),
('1A40A020000E5B1000056259','Metrc-Massachusetts-MC281714-Plants-Vegetative (1).xlsx','82d731587741e82ddbc1473af6e51c561d4562cc21c7ebe3baad68297d55882c','MC281714',null),
('1A40A020000E5B1000056260','Metrc-Massachusetts-MC281714-Plants-Vegetative (1).xlsx','82d731587741e82ddbc1473af6e51c561d4562cc21c7ebe3baad68297d55882c','MC281714',null),
('1A40A020000E5B1000056261','Metrc-Massachusetts-MC281714-Plants-Vegetative (1).xlsx','82d731587741e82ddbc1473af6e51c561d4562cc21c7ebe3baad68297d55882c','MC281714',null),
('1A40A020000E5B1000056262','Metrc-Massachusetts-MC281714-Plants-Vegetative (1).xlsx','82d731587741e82ddbc1473af6e51c561d4562cc21c7ebe3baad68297d55882c','MC281714',null),
('1A40A020000E5B1000056263','Metrc-Massachusetts-MC281714-Plants-Vegetative (1).xlsx','82d731587741e82ddbc1473af6e51c561d4562cc21c7ebe3baad68297d55882c','MC281714',null),
('1A40A020000E5B1000056266','Metrc-Massachusetts-MC281714-Plants-Vegetative (1).xlsx','82d731587741e82ddbc1473af6e51c561d4562cc21c7ebe3baad68297d55882c','MC281714',null),
('1A40A020000E5B1000056267','Metrc-Massachusetts-MC281714-Plants-Vegetative (1).xlsx','82d731587741e82ddbc1473af6e51c561d4562cc21c7ebe3baad68297d55882c','MC281714',null),
('1A40A020000E5B1000056270','Metrc-Massachusetts-MC281714-Plants-Vegetative (1).xlsx','82d731587741e82ddbc1473af6e51c561d4562cc21c7ebe3baad68297d55882c','MC281714',null),
('1A40A020000E5B1000056271','Metrc-Massachusetts-MC281714-Plants-Vegetative (1).xlsx','82d731587741e82ddbc1473af6e51c561d4562cc21c7ebe3baad68297d55882c','MC281714',null),
('1A40A020000E5B1000056274','Metrc-Massachusetts-MC281714-Plants-Vegetative (1).xlsx','82d731587741e82ddbc1473af6e51c561d4562cc21c7ebe3baad68297d55882c','MC281714',null),
('1A40A020000E5B1000056275','Metrc-Massachusetts-MC281714-Plants-Vegetative (1).xlsx','82d731587741e82ddbc1473af6e51c561d4562cc21c7ebe3baad68297d55882c','MC281714',null),
('1A40A020000E5B1000056276','Metrc-Massachusetts-MC281714-Plants-Vegetative (1).xlsx','82d731587741e82ddbc1473af6e51c561d4562cc21c7ebe3baad68297d55882c','MC281714',null),
('1A40A020000E5B1000056278','Metrc-Massachusetts-MC281714-Plants-Vegetative (1).xlsx','82d731587741e82ddbc1473af6e51c561d4562cc21c7ebe3baad68297d55882c','MC281714',null),
('1A40A020000E5B1000056279','Metrc-Massachusetts-MC281714-Plants-Vegetative (1).xlsx','82d731587741e82ddbc1473af6e51c561d4562cc21c7ebe3baad68297d55882c','MC281714',null),
('1A40A020000E5B1000056281','Metrc-Massachusetts-MC281714-Plants-Vegetative (1).xlsx','82d731587741e82ddbc1473af6e51c561d4562cc21c7ebe3baad68297d55882c','MC281714',null),
('1A40A020000E5B1000056282','Metrc-Massachusetts-MC281714-Plants-Vegetative (1).xlsx','82d731587741e82ddbc1473af6e51c561d4562cc21c7ebe3baad68297d55882c','MC281714',null),
('1A40A020000E5B1000056284','Metrc-Massachusetts-MC281714-Plants-Vegetative (1).xlsx','82d731587741e82ddbc1473af6e51c561d4562cc21c7ebe3baad68297d55882c','MC281714',null),
('1A40A020000E5B1000056286','Metrc-Massachusetts-MC281714-Plants-Vegetative (1).xlsx','82d731587741e82ddbc1473af6e51c561d4562cc21c7ebe3baad68297d55882c','MC281714',null),
('1A40A020000E5B1000056287','Metrc-Massachusetts-MC281714-Plants-Vegetative (1).xlsx','82d731587741e82ddbc1473af6e51c561d4562cc21c7ebe3baad68297d55882c','MC281714',null),
('1A40A020000E5B1000056268','Metrc-Massachusetts-MC281714-Plants-Vegetative (1).xlsx','82d731587741e82ddbc1473af6e51c561d4562cc21c7ebe3baad68297d55882c','MC281714',null),
('1A40A020000E5B1000056269','Metrc-Massachusetts-MC281714-Plants-Vegetative (1).xlsx','82d731587741e82ddbc1473af6e51c561d4562cc21c7ebe3baad68297d55882c','MC281714',null),
('1A40A020000E5B1000056272','Metrc-Massachusetts-MC281714-Plants-Vegetative (1).xlsx','82d731587741e82ddbc1473af6e51c561d4562cc21c7ebe3baad68297d55882c','MC281714',null),
('1A40A020000E5B1000056273','Metrc-Massachusetts-MC281714-Plants-Vegetative (1).xlsx','82d731587741e82ddbc1473af6e51c561d4562cc21c7ebe3baad68297d55882c','MC281714',null),
('1A40A020000E5B1000056277','Metrc-Massachusetts-MC281714-Plants-Vegetative (1).xlsx','82d731587741e82ddbc1473af6e51c561d4562cc21c7ebe3baad68297d55882c','MC281714',null),
('1A40A020000E5B1000056280','Metrc-Massachusetts-MC281714-Plants-Vegetative (1).xlsx','82d731587741e82ddbc1473af6e51c561d4562cc21c7ebe3baad68297d55882c','MC281714',null),
('1A40A020000E5B1000056283','Metrc-Massachusetts-MC281714-Plants-Vegetative (1).xlsx','82d731587741e82ddbc1473af6e51c561d4562cc21c7ebe3baad68297d55882c','MC281714',null),
('1A40A020000E5B1000056285','Metrc-Massachusetts-MC281714-Plants-Vegetative (1).xlsx','82d731587741e82ddbc1473af6e51c561d4562cc21c7ebe3baad68297d55882c','MC281714',null);
