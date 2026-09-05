-- Applied prod 20260905001017. One page on the period bus. Do not re-apply.
update public.nav_registry
   set default_range = 'this_month_td'
 where view_key = 'plant_loss_by_batch'
   and enabled
   and default_range is null
   and range_kind = 'activity';
