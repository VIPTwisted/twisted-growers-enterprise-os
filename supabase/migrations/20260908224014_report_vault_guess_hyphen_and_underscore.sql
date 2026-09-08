-- GROK-WHY: Filenames from Metrc use hyphens (Packages-Transferred, Lab-Results, Inventory-Point-in-Time).
-- f_report_vault_guess only treated spaces as separators, so 8 of 9 vault drops sat unclassified
-- and the board kept saying MISSING. Harvests-Inactive fell through to harvests_active.
-- Bytes not rewritten. Parse still later. CERTIFIED 0. Cycle 56.

create or replace function public.f_report_vault_guess(p_name text)
returns table(need_key text, report_key text, licence text)
language sql stable as $$
  select
    case
      when n ~ 'harvests?[[:space:]_-]*inactive|moisture' then 'harvests_inactive'
      when n ~ 'plantings?[[:space:]_-]*inactive' then 'plantings_inactive'
      when n ~ 'plantings?[[:space:]_-]*active' then 'plantings_active'
      when n ~ 'flowering' then 'plants_flowering'
      when n ~ 'vegetative' then 'plants_vegetative'
      when n ~ 'plants?[[:space:]_-]*waste|plantwaste' then 'plants_waste'
      when n ~ 'destroyed' then 'plants_destroyed'
      when n ~ 'source[[:space:]_-]*harvest|packages[-_[:space:]]*active|packages[-_[:space:]]*inactive' then 'packages_lineage'
      when n ~ 'packages?[[:space:]_-]*transferred' then 'packages_transferred'
      when n ~ 'lab[[:space:]_-]*results' then 'lab_results'
      when n ~ 'point[[:space:]_-]*in[[:space:]_-]*time|inventorypointintime' then 'inventory_point_in_time'
      when n ~ 'adjust' then 'packages_adjustments'
      when n ~ 'test[[:space:]_-]*batch' then 'test_batches'
      when n ~ 'wholesale' then 'wholesale_transfers'
      when n ~ 'apex|shipping[-_[:space:]]*order|invoice' then 'apex_orders'
      when n ~ 'harvest' then 'harvests_active'
      else null end,
    case
      when n ~ 'harvests?[[:space:]_-]*inactive|moisture' then 'harvests_inactive'
      when n ~ 'packages?[[:space:]_-]*transferred' then 'packages_transferred'
      when n ~ 'lab[[:space:]_-]*results' then 'lab_results'
      when n ~ 'point[[:space:]_-]*in[[:space:]_-]*time|inventorypointintime' then 'inventory_point_in_time'
      when n ~ 'adjust' then 'packages_adjustments'
      when n ~ 'destroyed' then 'plants_destroyed'
      when n ~ 'waste' then 'plants_waste'
      when n ~ 'wholesale' then 'wholesale_transfers'
      when n ~ 'test[[:space:]_-]*batch' then 'test_batches'
      when n ~ 'harvest' then 'harvests'
      else null end,
    case when n ~ 'mp281909' then 'MP281909' when n ~ 'mc281714' then 'MC281714' else null end
  from (select lower(coalesce(p_name,'')) as n) s;
$$;
