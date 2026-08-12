-- ---------------------------------------------------------------------------
-- 0076 — Labor and packaging are tracked only where the ADMIN turns them on.
--
-- Owner 11 Aug 2026: "WE HAVE TO TRACK LABOR AND ALSO ALL PACKAGING TOO PER UNIT
-- NOT ALL ITEMS ONLY THOSE NEED TO ON" / "ADMIN WILL DECIDE THIS".
--
-- 0075 seeded rates for four categories. A rate EXISTING is not the same as a rate
-- being APPLIED: bulk flower sold by the pound has no per-unit packaging, and
-- charging it some would quietly inflate the cost of goods. So tracking is an
-- explicit switch, off unless an admin turns it on, at whatever scope they choose.
-- ---------------------------------------------------------------------------
create table if not exists cost_tracking_policy (
  id             bigserial primary key,
  scope          text not null check (scope in ('tag','batch','brand','product_line','category','global')),
  scope_key      text,
  track_labor    boolean not null default false,
  track_packaging boolean not null default false,
  effective_from date not null default current_date,
  effective_to   date,
  set_by         text not null,
  note           text,
  updated_at     timestamptz not null default now(),
  constraint policy_scope_key_required check (scope = 'global' or scope_key is not null),
  constraint policy_no_overlap exclude using gist (
    scope with =, coalesce(scope_key,'') with =,
    daterange(effective_from, coalesce(effective_to,'infinity'::date), '[)') with &&)
);

comment on table cost_tracking_policy is
  'Which items carry per-unit LABOR and PACKAGING cost. OFF by default at every '
  'scope - an admin turns it on only where it belongs. Bulk flower sold by the pound '
  'has no per-unit packaging, and charging it some would quietly inflate cost of '
  'goods. Most specific scope wins, exactly as cost rates and yields do.';

-- Seeded ON only for the four categories that are genuinely made up into units, and
-- explicitly OFF globally. The admin changes any of this.
insert into cost_tracking_policy (scope, scope_key, track_labor, track_packaging, effective_from, set_by, note) values
 ('global',  null,               false, false, date '2024-01-01','Agent B, 11 Aug 2026',
  'DEFAULT OFF. Nothing carries per-unit labor or packaging unless an admin switches it on.'),
 ('category','Vape Product',      true,  true,  date '2024-01-01','Agent B, 11 Aug 2026',
  'Proposed ON: filled and packaged per unit. ADMIN TO CONFIRM.'),
 ('category','Concentrate',       true,  true,  date '2024-01-01','Agent B, 11 Aug 2026',
  'Proposed ON: jarred and packed per unit. ADMIN TO CONFIRM.'),
 ('category','Raw Pre-Rolls',     true,  true,  date '2024-01-01','Agent B, 11 Aug 2026',
  'Proposed ON: rolled and packaged per unit. ADMIN TO CONFIRM.'),
 ('category','Infused Pre-Rolls', true,  true,  date '2024-01-01','Agent B, 11 Aug 2026',
  'Proposed ON: rolled, infused and packaged per unit. ADMIN TO CONFIRM.')
on conflict do nothing;

create or replace function f_cost_tracking(
  p_on date default current_date, p_tag text default null, p_batch text default null,
  p_brand text default null, p_product_line text default null, p_category text default null)
returns table (track_labor boolean, track_packaging boolean, scope text, set_by text)
language sql stable as $$
  select p.track_labor, p.track_packaging, p.scope, p.set_by
  from cost_tracking_policy p
  where p_on >= p.effective_from and (p.effective_to is null or p_on < p.effective_to)
    and ((p.scope='tag' and p.scope_key=p_tag) or (p.scope='batch' and p.scope_key=p_batch)
      or (p.scope='brand' and p.scope_key=p_brand)
      or (p.scope='product_line' and p.scope_key=p_product_line)
      or (p.scope='category' and p.scope_key=p_category) or p.scope='global')
  order by case p.scope when 'tag' then 1 when 'batch' then 2 when 'brand' then 3
                        when 'product_line' then 4 when 'category' then 5 else 6 end
  limit 1;
$$;

comment on function f_cost_tracking is
  'Whether per-unit labor and packaging apply to a given thing on a date, and at which '
  'scope the decision was made. A cost report must call this before charging either.';

alter table cost_tracking_policy enable row level security;
drop policy if exists cost_tracking_policy_manage on cost_tracking_policy;
create policy cost_tracking_policy_manage on cost_tracking_policy for all
  using (f_can_manage_inventory()) with check (f_can_manage_inventory());
grant select, insert, update, delete on cost_tracking_policy to authenticated;
grant execute on function f_cost_tracking to authenticated;

insert into nav_registry (category, label, view_key, table_ref, surface, page_kind,
                          archetype, report_group, module, icon, description,
                          date_policy, default_range, range_kind, enabled, item_order, admin_only)
values
 ('Reports','Standard Overrides (tag / batch / brand)','production_standard_override',
  'production_standard_override','reports','report','rules_editor','Inventory & Audit','reports','box',
  'Override any production standard for one tag, one batch, a brand, a product line, a '
  'category, or globally, over any period. Most specific wins. Record a bad run here — '
  'never by editing the base standard, which would restate every period.',
  'auto','this_year','activity',true,11,true),
 ('Reports','Labor & Packaging Tracking','cost_tracking_policy',
  'cost_tracking_policy','reports','report','rules_editor','Inventory & Audit','reports','dollar',
  'Which items carry per-unit labor and packaging cost. OFF everywhere by default — an '
  'admin switches it on only where it belongs.',
  'auto','this_year','activity',true,12,true),
 ('Reports','Provisional Figures (not yet verified)','provisional_standards',
  'v_provisional_standards','reports','report','issue_queue','Inventory & Audit','reports','box',
  'Every standard, cost rate and formulation still carrying a placeholder. Real costs of '
  'material are still to be entered. Anything here is indicative only.',
  'not_applicable','this_year','activity',true,13,true)
on conflict (view_key) do update set
  label=excluded.label, table_ref=excluded.table_ref, description=excluded.description,
  admin_only=excluded.admin_only, enabled=true;

update nav_registry set admin_only = true
 where view_key in ('production_yield_standard','product_brand_tier','preroll_formulation',
                    'inventory_cost_rate','material_requirement');
;
