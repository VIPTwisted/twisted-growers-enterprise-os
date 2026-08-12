-- 0010 Metrc FULL-catalog staging: everything the read API offers gets a home.
create table metrc_items (
  id bigint generated always as identity primary key,
  license text not null, metrc_id bigint not null,
  name text, category text, unit_of_measure text, strain text,
  raw jsonb not null, synced_at timestamptz not null default now(),
  unique (license, metrc_id)
);
create table metrc_strains (
  id bigint generated always as identity primary key,
  license text not null, metrc_id bigint not null,
  name text, testing_status text, thc_level numeric, cbd_level numeric,
  raw jsonb not null, synced_at timestamptz not null default now(),
  unique (license, metrc_id)
);
create table metrc_locations (
  id bigint generated always as identity primary key,
  license text not null, metrc_id bigint not null,
  name text, location_type text,
  raw jsonb not null, synced_at timestamptz not null default now(),
  unique (license, metrc_id)
);
create table metrc_sales (
  id bigint generated always as identity primary key,
  license text not null, receipt_number text not null,
  sales_date date, customer_type text, total numeric(14,2), package_count int,
  raw jsonb not null, synced_at timestamptz not null default now(),
  unique (license, receipt_number)
);
alter table metrc_packages add column source_state text not null default 'active';
alter table metrc_plants add column source_state text not null default 'active';
alter table metrc_harvests add column source_state text not null default 'active';
alter table metrc_plant_batches add column source_state text not null default 'active';

do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname='public'
           and tablename in ('metrc_items','metrc_strains','metrc_locations','metrc_sales')
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy exec_all on public.%I for all using (is_executive()) with check (is_executive())', t);
  end loop;
end $$;;
