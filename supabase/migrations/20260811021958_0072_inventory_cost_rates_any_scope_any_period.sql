-- ---------------------------------------------------------------------------
-- 0072 — COSTS, adjustable per TAG, per BATCH, or per any PERIOD.
--
-- Owner 11 Aug 2026: "WE MUST BE ABLE TO ADJUST COSTS PER BATCH, TAG, WEEKLY,
-- MONTHLY, QUARTERLY OR ANNUALLY FOR ALL INVENTORY."
--
-- One table, two axes:
--   SCOPE   how specific the rate is - a single tag, a batch, a brand, a product
--           line, a category, or everything. Most specific wins.
--   PERIOD  every rate is effective-dated, so weekly, monthly, quarterly and annual
--           are the same mechanism at different lengths. Editing a rate going
--           forward NEVER restates a closed period.
--
-- Costs are therefore never hardcoded in a view, and history cannot be silently
-- rewritten - the same rule the pre-roll formulation follows.
-- ---------------------------------------------------------------------------
create table if not exists inventory_cost_rate (
  id             bigserial primary key,
  scope          text not null check (scope in ('tag','batch','brand','product_line','category','global')),
  scope_key      text,                       -- null only when scope = 'global'
  material       text not null,              -- flower | trim | fresh_frozen | concentrate | packaging | labor
  cost_per_lb    numeric,                    -- for weight-denominated material
  cost_per_unit  numeric,                    -- for unit-denominated goods
  currency       text not null default 'USD',
  effective_from date not null,
  effective_to   date,                       -- null = still in force
  set_by         text not null,
  note           text,
  updated_at     timestamptz not null default now(),
  constraint scope_key_required check (scope = 'global' or scope_key is not null),
  constraint a_cost_is_given   check (cost_per_lb is not null or cost_per_unit is not null),
  constraint no_overlap exclude using gist (
    scope with =, coalesce(scope_key,'') with =, material with =,
    daterange(effective_from, coalesce(effective_to,'infinity'::date), '[)') with &&)
);

create index if not exists inventory_cost_rate_lookup
  on inventory_cost_rate (material, scope, scope_key, effective_from desc);

comment on table inventory_cost_rate is
  'Cost rates for every material, at any scope and any period. Precedence is most '
  'specific first: tag, then batch, then brand, then product line, then category, '
  'then global. Weekly / monthly / quarterly / annual are all just effective_from and '
  'effective_to - one mechanism, any length. An overlap constraint makes two '
  'conflicting rates at the same scope impossible.';

-- Seed from the owner's own worksheet. These are the cost bases the calculator uses.
insert into inventory_cost_rate (scope, scope_key, material, cost_per_lb, effective_from, set_by, note) values
 ('global', null, 'flower',        1200, date '2024-01-01','Manufacturing Production Worksheet',
  'Summary Q6, "Flower @ $1200/lb" — the cost basis for 1 g raw pre-roll costing.'),
 ('global', null, 'trim',           300, date '2024-01-01','Manufacturing Production Worksheet',
  'Summary C6 / A7, "Trim cost (g) @$300/lb".'),
 ('global', null, 'fresh_frozen',   240, date '2024-01-01','Manufacturing Production Worksheet',
  'Summary M11: fresh frozen is priced at 0.20 of the dry rate. 0.20 x $1,200 = $240/lb. '
  'Recomputed whenever the flower rate changes.')
on conflict do nothing;

-- Resolve the rate that applies to a given thing on a given date, most specific first.
create or replace function f_cost_rate(
  p_material     text,
  p_on           date,
  p_tag          text default null,
  p_batch        text default null,
  p_brand        text default null,
  p_product_line text default null,
  p_category     text default null)
returns table (cost_per_lb numeric, cost_per_unit numeric, scope text, scope_key text, set_by text)
language sql stable as $$
  select r.cost_per_lb, r.cost_per_unit, r.scope, r.scope_key, r.set_by
  from inventory_cost_rate r
  where r.material = p_material
    and p_on >= r.effective_from
    and (r.effective_to is null or p_on < r.effective_to)
    and ((r.scope='tag'          and r.scope_key = p_tag)
      or (r.scope='batch'        and r.scope_key = p_batch)
      or (r.scope='brand'        and r.scope_key = p_brand)
      or (r.scope='product_line' and r.scope_key = p_product_line)
      or (r.scope='category'     and r.scope_key = p_category)
      or  r.scope='global')
  order by case r.scope when 'tag' then 1 when 'batch' then 2 when 'brand' then 3
                        when 'product_line' then 4 when 'category' then 5 else 6 end,
           r.effective_from desc
  limit 1;
$$;

comment on function f_cost_rate is
  'The cost rate in force for a material on a date, resolved most-specific-first: '
  'tag, batch, brand, product line, category, global. Returns the scope it matched '
  'so a report can always show WHICH rate was applied and who set it.';

grant select on inventory_cost_rate to authenticated;
grant execute on function f_cost_rate to authenticated;


update product_brand_tier
   set tier = 'PREMIUM',
       material = 'Our premium flower plus diamonds or other concentrate',
       note = 'Owner 11 Aug 2026: "OUR PREMIUM FLOWER AND DIAMONDS AND OR OTHER CONTRATE." '
              'Infused blunts — they draw BOTH premium flower and concentrate, so they are '
              'not costed on a flower:trim formulation. 18,240 units at $5.72 average.',
       updated_at = now()
 where brand = 'North End Blunts';
;
