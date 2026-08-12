-- ---------------------------------------------------------------------------
-- 0075 — Three things the owner asked for, in one place.
--
-- 1. EVERY input overridable by tag, batch, brand, line, category or globally.
-- 2. LABOR and PACKAGING tracked per unit, from the worksheet.
-- 3. Only CEO / executive / CFO / admin may see or edit any of it, unless the
--    permission admin later grants the manage_inventory capability.
--
-- f_preroll_formulation(text,date) is NOT dropped - v_material_requirement depends
-- on it and a CASCADE would take the view with it. The scoped version is a new name
-- and the old two-argument form becomes a thin wrapper.
-- ---------------------------------------------------------------------------
create table if not exists production_standard_override (
  id             bigserial primary key,
  standard_key   text not null references production_yield_standard(key),
  scope          text not null check (scope in ('tag','batch','brand','product_line','category','global')),
  scope_key      text,
  value          numeric not null,
  effective_from date not null,
  effective_to   date,
  set_by         text not null,
  note           text,
  evidence_status text not null default 'provisional'
     check (evidence_status in ('provisional','measured','owner_set','definitional')),
  updated_at     timestamptz not null default now(),
  constraint override_scope_key_required check (scope = 'global' or scope_key is not null),
  constraint override_no_overlap exclude using gist (
    standard_key with =, scope with =, coalesce(scope_key,'') with =,
    daterange(effective_from, coalesce(effective_to,'infinity'::date), '[)') with &&)
);
create index if not exists production_standard_override_lookup
  on production_standard_override (standard_key, scope, scope_key, effective_from desc);

comment on table production_standard_override is
  'Overrides ANY production standard for one tag, one batch, a brand, a product line, '
  'a category, or globally, over any period. Most specific wins. Record a bad run or '
  'one batch of purchased trim HERE, never by editing the base standard - that would '
  'silently restate every period already reported.';

create or replace function f_yield_standard(
  p_key text, p_on date default current_date, p_tag text default null,
  p_batch text default null, p_brand text default null,
  p_product_line text default null, p_category text default null)
returns table (value numeric, scope text, scope_key text, set_by text, evidence_status text)
language sql stable as $$
  with ovr as (
    select o.value, o.scope, o.scope_key, o.set_by, o.evidence_status,
           case o.scope when 'tag' then 1 when 'batch' then 2 when 'brand' then 3
                        when 'product_line' then 4 when 'category' then 5 else 6 end as rnk
    from production_standard_override o
    where o.standard_key = p_key
      and p_on >= o.effective_from and (o.effective_to is null or p_on < o.effective_to)
      and ((o.scope='tag' and o.scope_key=p_tag) or (o.scope='batch' and o.scope_key=p_batch)
        or (o.scope='brand' and o.scope_key=p_brand)
        or (o.scope='product_line' and o.scope_key=p_product_line)
        or (o.scope='category' and o.scope_key=p_category) or o.scope='global'))
  (select value, scope, scope_key, set_by, evidence_status from ovr order by rnk, scope limit 1)
  union all
  (select s.value, 'base', null::text, s.set_by, s.evidence_status
   from production_yield_standard s where s.key=p_key and not exists (select 1 from ovr) limit 1);
$$;

-- Formulations get the same scope model. New NAME, so the existing view keeps working.
alter table preroll_formulation add column if not exists scope text not null default 'brand';
alter table preroll_formulation add column if not exists scope_key text;
update preroll_formulation set scope_key = brand where scope_key is null;
alter table preroll_formulation drop constraint if exists preroll_formulation_scope_check;
alter table preroll_formulation add constraint preroll_formulation_scope_check
  check (scope in ('tag','batch','brand','product_line','category','global'));
alter table preroll_formulation drop constraint if exists no_overlap_per_brand;
alter table preroll_formulation add constraint formulation_no_overlap exclude using gist (
  scope with =, coalesce(scope_key,'') with =,
  daterange(effective_from, coalesce(effective_to,'infinity'::date), '[)') with &&);

create or replace function f_preroll_formulation_at(
  p_brand text, p_on date, p_tag text default null, p_batch text default null)
returns table (flower_pct numeric, trim_pct numeric, set_by text, scope text, evidence_status text)
language sql stable as $$
  select f.flower_pct, f.trim_pct, f.set_by, f.scope, f.evidence_status
  from preroll_formulation f
  where p_on >= f.effective_from and (f.effective_to is null or p_on < f.effective_to)
    and ((f.scope='tag' and f.scope_key=p_tag) or (f.scope='batch' and f.scope_key=p_batch)
      or (f.scope='brand' and f.scope_key=p_brand) or f.scope='global')
  order by case f.scope when 'tag' then 1 when 'batch' then 2 when 'brand' then 3 else 4 end
  limit 1;
$$;

-- 2 · LABOR and PACKAGING per unit, from the worksheet.
insert into inventory_cost_rate (scope, scope_key, material, cost_per_unit, effective_from, set_by, note, evidence_status) values
 ('category','Vape Product','packaging', 1.037, date '2024-01-01','Manufacturing Production Worksheet',
  'VAPE sheet B11: 0.55 + 0.05 + 0.25 + 0.117 + 0.01 + 0.06 per unit.','provisional'),
 ('category','Vape Product','hardware',  1.43,  date '2024-01-01','Manufacturing Production Worksheet',
  'VAPE sheet B8: 1.18 + 0.25 per unit.','provisional'),
 ('category','Vape Product','labor',     0.6132,date '2024-01-01','Manufacturing Production Worksheet',
  'VAPE sheet: fill labor $20/hr at 430 units/hr = $0.0465, plus packaging labor of '
  '1.7 min per unit at $20/hr (plastic removal 0.2, sticker 0.75, tube fill 0.75) = $0.5667.','provisional'),
 ('category','Concentrate','packaging',  1.08,  date '2024-01-01','Manufacturing Production Worksheet',
  'Volatile IN_OUT B21-B23: glass jar 0.40 + primary box 0.64 + outer box 0.04.','provisional'),
 ('category','Concentrate','labor',      0.31,  date '2024-01-01','Manufacturing Production Worksheet',
  'Volatile IN_OUT F23: hand filling at 60/65 jars per minute, $20/hr.','provisional'),
 ('category','Raw Pre-Rolls','packaging',0.33,  date '2024-01-01','Manufacturing Production Worksheet',
  'Summary R9, packaging materials per 1 g raw pre-roll.','provisional'),
 ('category','Raw Pre-Rolls','labor',    5.062, date '2024-01-01','Manufacturing Production Worksheet',
  'Summary R7 rolling materials and labor 3.200 plus R11 packaging labor 1.862, per gram.','provisional'),
 ('category','Infused Pre-Rolls','labor',8.265, date '2024-01-01','Manufacturing Production Worksheet',
  'Summary U7 rolling materials and labor 6.403 plus packaging labor 1.862, per gram '
  '(30% liquid diamond infused).','provisional'),
 ('category','Infused Pre-Rolls','packaging',0.33, date '2024-01-01','Manufacturing Production Worksheet',
  'Summary U9.','provisional'),
 ('global', null, 'labor_rate_hour', 20.00, date '2024-01-01','Manufacturing Production Worksheet',
  'Volatile IN_OUT B18 / VAPE B9: employee rate $20 per hour, used by every labor figure above.','provisional')
on conflict do nothing;

-- 3 · PERMISSIONS. CEO / executive / CFO / admin only, unless granted manage_inventory.
create or replace function f_can_manage_inventory() returns boolean
language sql stable security definer set search_path to 'public','pg_temp' as $$
  select exists (select 1 from app_users u
                 where u.user_id = (select auth.uid())
                   and u.role = any (array['owner','executive','cfo','admin']::app_role[]))
      or public.f_role_can('manage_inventory');
$$;

comment on function f_can_manage_inventory is
  'Owner ruling 11 Aug 2026: only CEO, executives, CFO and admins may see or edit the '
  'cost and yield inputs. Others are granted access later through the permission admin '
  'by enabling the manage_inventory capability - which is why this is not a hardcoded '
  'role list alone.';

do $$
declare t text;
begin
  foreach t in array array['production_yield_standard','production_standard_override',
                           'inventory_cost_rate','preroll_formulation','product_brand_tier']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists %I on %I', t||'_manage', t);
    execute format($p$create policy %I on %I for all
                      using (public.f_can_manage_inventory())
                      with check (public.f_can_manage_inventory())$p$, t||'_manage', t);
    execute format('revoke all on %I from authenticated', t);
    execute format('grant select, insert, update, delete on %I to authenticated', t);
  end loop;
end $$;

insert into role_capability (role, capability, allowed)
select r, 'manage_inventory',
       r = any (array['owner','executive','cfo','admin']::app_role[])
from unnest(enum_range(null::app_role)) r
on conflict (role, capability) do nothing;

grant select on production_standard_override to authenticated;
grant execute on function f_yield_standard, f_preroll_formulation_at, f_can_manage_inventory to authenticated;
;
