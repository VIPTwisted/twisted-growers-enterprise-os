-- GROK-WHY: Owner 8 Sep 2026 — wire harvest spine, two-size canopy, A/B/C DRAFT, FF bleed into live OS.
-- harvests OS table is 0 rows; Metrc has 389. Do not FK harvest_grades.harvest_id.
-- Append-only harvest_close_draft keyed by Metrc harvest name. Vincent APPROVES.
-- No Metrc write. No room_cycle_days change. No ledger rewrite. No DROP.

create table if not exists public.harvest_close_draft (
  id uuid primary key default gen_random_uuid(),
  metrc_harvest_name text not null unique,
  plants integer,
  wet_lb numeric(14,4),
  packaged_tags_lb numeric(14,4),
  grade_a_lb numeric(14,4) not null default 0,
  grade_b_lb numeric(14,4) not null default 0,
  grade_c_lb numeric(14,4) not null default 0,
  trim_lb numeric(14,4) not null default 0,
  waste_lb numeric(14,4) not null default 0,
  water_lb numeric(14,4),
  status text not null default 'DRAFT',
  recorded_by text,
  vincent_status text not null default 'WAITING',
  vincent_note text,
  vincent_at timestamptz,
  created_at timestamptz not null default now(),
  constraint harvest_close_draft_status_chk check (status in ('DRAFT','APPROVED','REJECTED')),
  constraint harvest_close_draft_vincent_chk check (vincent_status in ('WAITING','APPROVED','REJECTED'))
);

alter table public.harvest_close_draft enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where tablename='harvest_close_draft' and policyname='harvest_close_draft_select') then
    create policy harvest_close_draft_select on public.harvest_close_draft for select to authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies where tablename='harvest_close_draft' and policyname='harvest_close_draft_insert') then
    create policy harvest_close_draft_insert on public.harvest_close_draft for insert to authenticated with check (true);
  end if;
  if not exists (select 1 from pg_policies where tablename='harvest_close_draft' and policyname='harvest_close_draft_update') then
    create policy harvest_close_draft_update on public.harvest_close_draft for update to authenticated using (true) with check (true);
  end if;
end $$;

grant select, insert, update on public.harvest_close_draft to authenticated;

create or replace view public.v_canopy_two_size as
select
  g.code as room,
  case when g.code in ('F1','F3') then 'LARGE' else 'SMALL' end as size,
  g.plant_capacity as cap,
  g.tables,
  g.plants_per_table,
  s.plants as plants_now,
  case when g.plant_capacity is null or s.plants is null then null
       else g.plant_capacity - s.plants end as short_by,
  case
    when s.plants is null then 'NO SNAPSHOT'
    when g.plant_capacity is null then 'NO CAP'
    when s.plants < g.plant_capacity then 'SHORT'
    else 'FULL'
  end as verdict,
  'conversion_factors.room_capacity MATCH grow_rooms. 1150 is labor, not cap.'::text as law
from public.grow_rooms g
left join (
  select room_key, sum(plants)::bigint as plants
  from public.cult_room_plant_snapshot
  where taken_on = (select max(taken_on) from public.cult_room_plant_snapshot)
    and phase = 'Flowering'
  group by room_key
) s on s.room_key = g.code
where g.code in ('F1','F2','F3','F4');

grant select on public.v_canopy_two_size to authenticated;

insert into nav_registry (category, category_order, label, item_order, icon, view_key, table_ref, description, enabled, admin_only, sync_enabled, module, archetype, page_kind, surface)
select 'Command', (select category_order from nav_registry where view_key='tower' limit 1), v.l, v.o, v.i, v.k, v.t, v.d, true, false, false, 'command', 'dashboard', 'custom', 'side'
from (values
  ('Harvest spine', 4, 'activity', 'ops_spine', 'v_canopy_two_size',
   'Two-size canopy, dry close DRAFT for Vincent, moisture identity, FF bleed. Metrc read only. CERTIFIED 0 until dual MATCH.'),
  ('C&M overlay', 5, 'layers', 'ops_cm', 'v_canopy_two_size',
   'Dutchie cultivation + manufacturing as a read overlay. Work stays in Metrc/Apex. OS never writes Metrc.')
) v(l,o,i,k,t,d)
where not exists (select 1 from nav_registry n where n.view_key = v.k);

insert into nav_role_visibility (view_key, role, visible)
select k, r.role, r.vis from
 (values ('ops_spine'),('ops_cm')) x(k),
 (values ('owner',true),('executive',true),('planner',true),('dept_head',true),('staff',true),('readonly',true)) r(role,vis)
on conflict (view_key, role) do update set visible = excluded.visible;
