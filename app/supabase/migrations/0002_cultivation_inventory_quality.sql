-- TG Enterprise OS — 0002 Cultivation, Inventory, Quality
-- CODE-004 Cultivation & Harvest, CODE-005 Inventory & Allocation, CODE-006 Quality & Testing
-- Enforces REQUIREMENT #2: every lot links to a COA; nothing ships without a passing COA.

-- ===== Cultivation (CODE-004) =====
create table grow_rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,              -- canonical: F1..F4 (legacy label kept alongside)
  legacy_label text,                      -- "Grow Room 1" etc.
  sqft numeric(8,1),
  plant_capacity int,
  cycle_days int,
  active boolean not null default true
);

create table cultivars (
  id uuid primary key default gen_random_uuid(),
  canonical_name text not null unique,
  aliases text[] not null default '{}',   -- absorbs Bicotti/Biscotti, SpecOps/Spec Ops, MAC 1/MAC...
  breeder text,
  status text not null default 'active'
);
create index cultivars_aliases on cultivars using gin (aliases);

create table harvests (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references grow_rooms(id),
  harvest_date date not null,
  metrc_harvest_batch text,
  plants int,
  wet_weight_g numeric(12,2),             -- the field the workbook never captured; Metrc audits this
  status text not null default 'planned', -- planned/harvested/drying/curing/graded/closed
  dry_complete_on date,
  cure_complete_on date,
  verified_by uuid references employees(id),
  note text,
  unique (room_id, harvest_date)
);

create table harvest_grades (
  id uuid primary key default gen_random_uuid(),
  harvest_id uuid not null references harvests(id),
  cultivar_id uuid not null references cultivars(id),
  plants int,
  dry_input_g numeric(12,2) not null default 0,
  grade_a_g numeric(12,2) not null default 0,
  grade_b_g numeric(12,2) not null default 0,
  grade_c_g numeric(12,2) not null default 0,
  trim_g numeric(12,2) not null default 0,
  fresh_frozen_g numeric(12,2) not null default 0,
  extraction_g numeric(12,2) not null default 0,
  samples_g numeric(12,2) not null default 0,
  waste_g numeric(12,2) not null default 0,
  accounted_g numeric(12,2) generated always as
    (grade_a_g+grade_b_g+grade_c_g+trim_g+fresh_frozen_g+extraction_g+samples_g+waste_g) stored,
  variance_g numeric(12,2) generated always as
    (dry_input_g-(grade_a_g+grade_b_g+grade_c_g+trim_g+fresh_frozen_g+extraction_g+samples_g+waste_g)) stored,
  graded_by uuid references employees(id),
  verified_by uuid references employees(id),
  unique (harvest_id, cultivar_id)
);

-- ===== Quality & Testing + COA registry (CODE-006, REQUIREMENT #2) =====
create table labs (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  state_license text,
  contact text,
  active boolean not null default true
);

create table coas (
  id uuid primary key default gen_random_uuid(),
  lab_id uuid references labs(id),
  coa_number text,
  sample_id text,
  metrc_lab_test_id text,
  submitted_on date,
  received_on date,
  status coa_status not null default 'pending',
  thca_pct numeric(6,3),
  thc_pct numeric(6,3),
  tac_pct numeric(6,3),
  terpenes_pct numeric(6,3),
  panels jsonb,                            -- pesticides/microbials/metals/solvents details
  file_url text,                           -- durable link (no shorteners)
  source text not null default 'manual',   -- manual | metrc | parsed
  created_at timestamptz not null default now(),
  check (thc_pct is null or tac_pct is null or thc_pct <= tac_pct)  -- the impossible-potency bug, made impossible
);

create table testing_slas (
  id uuid primary key default gen_random_uuid(),
  product_family_id uuid references product_families(id),
  test_type text not null,
  batch_size_min numeric(12,2) not null default 0,
  batch_size_max numeric(12,2),
  lab_id uuid references labs(id),
  lead_days int not null,
  sample_qty text,
  active boolean not null default true
);

create table test_requests (
  id uuid primary key default gen_random_uuid(),
  lot_id uuid,                             -- fk added below (lots defined after)
  harvest_id uuid references harvests(id),
  product_family_id uuid references product_families(id),
  test_type text,
  batch_size numeric(12,2),
  production_complete_on date,
  submit_due_on date,
  submitted_on date,
  expected_results_on date,
  coa_id uuid references coas(id),
  status test_status not null default 'planned',
  qa_released_by uuid references employees(id),
  qa_released_at timestamptz,
  committed_ship_on date,
  note text
);

-- ===== Inventory (CODE-005) =====
create table vendors (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  state_license text,                      -- MC/MP/MB/RMD license of the supplier
  contact text,
  approved boolean not null default false,
  note text
);

create table skus (
  id uuid primary key default gen_random_uuid(),
  sku_code text not null unique,
  name text not null,
  product_family_id uuid references product_families(id),
  department_id uuid references departments(id),
  category text,
  pack_size text,
  uom text not null default 'each',
  min_qty numeric(12,2) not null default 0,
  target_qty numeric(12,2) not null default 0,
  max_qty numeric(12,2),
  unit_cost numeric(10,4),
  wholesale_price numeric(10,2),
  active boolean not null default true
);

create table lots (
  id uuid primary key default gen_random_uuid(),
  lot_code text not null unique,
  sku_id uuid references skus(id),
  source_type text not null default 'harvest',        -- harvest | manufactured | purchased | third_party
  harvest_id uuid references harvests(id),
  cultivar_id uuid references cultivars(id),
  vendor_id uuid references vendors(id),
  metrc_tag text unique,                              -- FULL 24-char tag, never a suffix
  batch_code text,
  quantity numeric(14,3) not null default 0,
  uom text not null default 'g',
  packaged_units int,
  unit_cost numeric(12,4),
  landed_cost numeric(12,2),
  location text,
  created_on date,
  expires_on date,
  coa_id uuid references coas(id),                    -- REQUIREMENT #2: the COA link lives on the lot
  status lot_status not null default 'production_queue',
  physical_count_confirmed_on date,
  physical_count_by uuid references employees(id),
  note text,
  check (metrc_tag is null or length(metrc_tag) >= 16)  -- rejects truncated 4-5 digit suffixes
);
alter table test_requests add constraint test_requests_lot_fk foreign key (lot_id) references lots(id);

-- HARD GATE (REQUIREMENT #2): a lot cannot become ready_to_ship without a PASSING COA.
create or replace function enforce_coa_gate() returns trigger
language plpgsql as $$
declare c coa_status;
begin
  if new.status = 'ready_to_ship' then
    if new.coa_id is null then
      raise exception 'Lot % cannot be Ready To Ship: no COA linked', new.lot_code;
    end if;
    select status into c from coas where id = new.coa_id;
    if c not in ('pass','remediation_pass') then
      raise exception 'Lot % cannot be Ready To Ship: COA status is %', new.lot_code, c;
    end if;
    if new.expires_on is not null and new.expires_on < current_date then
      raise exception 'Lot % cannot be Ready To Ship: expired %', new.lot_code, new.expires_on;
    end if;
  end if;
  return new;
end $$;
create trigger lots_coa_gate before insert or update of status on lots
  for each row execute function enforce_coa_gate();

-- ===== Allocation (Vincent's control — CODE-005/003), netting enforced =====
create table allocations (
  id uuid primary key default gen_random_uuid(),
  lot_id uuid not null references lots(id),
  work_order_id uuid,                       -- fk added in 0003
  requested_qty numeric(14,3) not null check (requested_qty > 0),
  approved_qty numeric(14,3) not null default 0 check (approved_qty >= 0),
  approval approval_status not null default 'pending',
  approved_by uuid references employees(id),
  approved_at timestamptz,
  release release_status not null default 'pending',
  note text
);

-- Cumulative netting: total approved against a lot can never exceed the lot quantity.
create or replace function enforce_allocation_netting() returns trigger
language plpgsql as $$
declare total numeric; lotqty numeric; code text;
begin
  select quantity, lot_code into lotqty, code from lots where id = new.lot_id;
  select coalesce(sum(approved_qty),0) into total
    from allocations where lot_id = new.lot_id and id <> coalesce(new.id, gen_random_uuid());
  if total + new.approved_qty > lotqty then
    raise exception 'Over-allocation on lot %: % already approved + % requested > % available',
      code, total, new.approved_qty, lotqty;
  end if;
  return new;
end $$;
create trigger allocations_netting before insert or update of approved_qty on allocations
  for each row execute function enforce_allocation_netting();

create trigger audit_lots after insert or update or delete on lots
  for each row execute function audit_row();
create trigger audit_allocations after insert or update or delete on allocations
  for each row execute function audit_row();
create trigger audit_coas after insert or update or delete on coas
  for each row execute function audit_row();
create trigger audit_harvest_grades after insert or update or delete on harvest_grades
  for each row execute function audit_row();

-- RLS for the new tables (default deny + executive access)
do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname='public'
           and tablename in ('grow_rooms','cultivars','harvests','harvest_grades','labs','coas',
                             'testing_slas','test_requests','vendors','skus','lots','allocations')
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy exec_all on public.%I for all using (is_executive()) with check (is_executive())', t);
  end loop;
end $$;
