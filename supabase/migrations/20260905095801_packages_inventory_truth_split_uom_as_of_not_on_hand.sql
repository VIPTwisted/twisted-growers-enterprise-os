-- Applied prod 20260905095801. Ledger quantity not rewritten.
-- Packages Inventory is an as-of freeze (2026-08-06). Not today on-hand.
-- quantity mixes g / lb / ea — total only qty_g / qty_lb / qty_ea.

create or replace view public.v_packages_inventory_truth as
select
  p.*,
  case when p.uom in ('g','Grams','GR') then p.quantity else null end as qty_g,
  case when p.uom in ('lb','Pounds','LBS') then p.quantity else null end as qty_lb,
  case when p.uom in ('ea','Each','Eachs') then p.quantity else null end as qty_ea,
  case
    when p.uom in ('g','Grams','GR','lb','Pounds','LBS','ea','Each','Eachs')
      then 'classified — total only the matching column'
    else 'unknown uom — do not total quantity'
  end as qty_class,
  ('as-of ' || p.as_of_date::text || ' — NOT today on-hand. Today on-hand is packages active qty>0.') as as_of_notice
from public.metrc_rpt_packages_inventory p;

alter view public.v_packages_inventory_truth set (security_invoker = true);

comment on view public.v_packages_inventory_truth is
  'Packages Inventory close as-of as_of_date. quantity is mixed g/lb/ea — do not total it. Use qty_g / qty_lb / qty_ea. Not a substitute for packages-active today.';
