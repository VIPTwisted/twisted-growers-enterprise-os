-- WHY THE DATE FILTER ONLY WORKED ON A FEW PAGES. Owner, 8 Aug 2026:
--   "I asked AI to add to all pages the date and date filter like QuickBooks has.
--    It only did so on a few of our pages. We need site wide."
--
-- The cause is not the UI. **40 of the tables behind those pages have NO DATE COLUMN
-- OF ANY KIND.** You cannot filter or sort by a date that does not exist, so the
-- previous attempt could only succeed on tables that already had one. A table with
-- no timestamp also cannot be audited at all - nobody can say when a row appeared or
-- last changed.
--
-- ADDED DELIBERATELY WITHOUT BACKFILLING. In Postgres, adding a column WITH a default
-- writes that default into every existing row - which would stamp hundreds of rows
-- with today's date and assert they were created today. That is a fabricated fact,
-- and this platform has paid for enough of those. So: add the column NULL, then set
-- the default for future rows only. Existing rows read NULL, which honestly means
-- "created before this was tracked" and sorts last.
--
-- updated_at is maintained by a trigger, not by hope - a column nothing writes to is
-- worse than no column, because it looks maintained.
-- UNDO: alter table <t> drop column created_at, drop column updated_at.

do $$
declare t text;
  tables text[] := array[
    'app_roles','company_licenses','concentrate_rate_map','cultivars','departments',
    'employee_work_schedules','figure_of_record','grow_rooms','harvest_alert_rules',
    'harvest_grades','import_check','inventory_config','inventory_values',
    'item_alert_route','labs','licence_profile','licence_type_prefix','machines',
    'metrc_endpoint_capability','metrc_report_types','nav_registry','nav_role_visibility',
    'permission_catalog','product_families','purchase_order_lines','report_alert_recipients',
    'report_registry','role_permissions','roles_catalog','sales_order_lines',
    'sheet_column_map','shift_templates','shipment_lines','sku_pack_sizes','skus',
    'source_precedence','task_standards','testing_slas','vendors','widget_catalog'];
begin
  foreach t in array tables loop
    -- NULL first, default second: existing rows stay honestly unknown.
    execute format('alter table public.%I add column if not exists created_at timestamptz', t);
    execute format('alter table public.%I alter column created_at set default now()', t);
    execute format('alter table public.%I add column if not exists updated_at timestamptz', t);
    execute format('alter table public.%I alter column updated_at set default now()', t);
    execute format($f$comment on column public.%I.created_at is
      'When the row was created. NULL means it pre-dates 8 Aug 2026, when timestamps were added - NOT backfilled, because stamping old rows with today would be a fabricated fact.'$f$, t);
  end loop;
end $$;

-- One trigger function for all of them. A column nothing writes to is worse than no
-- column: it looks maintained.
create or replace function public.tg_touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

comment on function public.tg_touch_updated_at() is
  'Stamps updated_at on every UPDATE. Attached to every table that gained timestamps '
  'on 8 Aug 2026 so the column is real rather than decorative.';

do $$
declare t text;
  tables text[] := array[
    'app_roles','company_licenses','concentrate_rate_map','cultivars','departments',
    'employee_work_schedules','figure_of_record','grow_rooms','harvest_alert_rules',
    'harvest_grades','import_check','inventory_config','inventory_values',
    'item_alert_route','labs','licence_profile','licence_type_prefix','machines',
    'metrc_endpoint_capability','metrc_report_types','nav_registry','nav_role_visibility',
    'permission_catalog','product_families','purchase_order_lines','report_alert_recipients',
    'report_registry','role_permissions','roles_catalog','sales_order_lines',
    'sheet_column_map','shift_templates','shipment_lines','sku_pack_sizes','skus',
    'source_precedence','task_standards','testing_slas','vendors','widget_catalog'];
begin
  foreach t in array tables loop
    execute format('drop trigger if exists %I on public.%I', 'touch_' || t, t);
    execute format('create trigger %I before update on public.%I
                    for each row execute function public.tg_touch_updated_at()',
                   'touch_' || t, t);
  end loop;
end $$;;
