/* THE GAP ENGINE WAS ASKING FOR WORDS THE LEDGER DOES NOT USE.
 *
 * v_gap_system maps the charter's event names onto the ledger's own: it
 * already knew move=location_change, package_create=packaged, lab_test=tested,
 * transfer_in=received. It did NOT know that this schema has always called a
 * transfer_out a 'shipped', a sale a 'sold', and an adjustment an 'adjusted' —
 * so it reported three types as missing that were only ever missing a
 * translation.
 *
 * That mattered: two of them are now backfilled (14,661 shipped, 11,188 sold)
 * and the engine would still have called them absent. A gap that cannot clear
 * when the work is done is a gap nobody believes twice.
 *
 * The mapping is the one place the two vocabularies meet, which is exactly
 * where it belongs — owner instruction: source names at the edges, house names
 * in the middle. */

create or replace view public.v_gap_system as
with required_types as (
  select unnest(array['planting','move','harvest','package_create','lab_test',
                      'transfer_out','transfer_in','sale','adjustment','destruction']) as spec_type
),
mapped as (
  select r.spec_type,
         case r.spec_type
           when 'move'           then 'location_change'
           when 'package_create' then 'packaged'
           when 'lab_test'       then 'tested'
           when 'transfer_in'    then 'received'
           when 'transfer_out'   then 'shipped'
           when 'sale'           then 'sold'
           when 'adjustment'     then 'adjusted'
           else r.spec_type end as ledger_type
  from required_types r
)
select 'missing_event_types'::text as gap_type, 'critical'::text as severity,
       m.spec_type as subject,
       'The specification requires a ' || m.spec_type || ' event; the ledger has recorded none '
         || '(this schema calls it "' || m.ledger_type || '").' as description,
       'Promote this fact from the mirror into tag_event so the tag timeline is complete. Every '
         || 'gate that depends on it stays blind until then.' as required_action
from mapped m
where not exists (select 1 from tag_event p where p.event_type = m.ledger_type)
union all
select 'source_sync_stale', 'critical', f.source, f.verdict,
       'Run the sync, read its error, and fix the cause. Do not clear this by hand — it clears itself on the next successful run.'
from v_source_freshness f where f.is_stale
union all
select 'import_failure', 'critical', i.source_key,
       'Import run ' || i.id || ' on ' || coalesce(i.started_at::date::text,'?') || ' from ' || i.source_key
         || ' read ' || coalesce(i.rows_read,0) || ' rows and accepted ' || coalesce(i.rows_accepted,0)
         || coalesce(' — outcome ' || i.outcome, '') || '.',
       'Re-run the import and read its error. An import that accepts nothing is a silent data outage.'
from import_run i
where i.started_at > now() - interval '30 days'
  and coalesce(i.rows_read,0) > 0 and coalesce(i.rows_accepted,0) = 0
union all
select 'date_range_not_applied', 'critical', b.department || ' ord ' || b.ord,
       'Dashboard figure "' || b.kpi || '" has no dated recomputation path, so it cannot honour a selected range.',
       'Add it to f_department_dashboard as a FLOW or an as-of POSITION, or state on the tile why it cannot move.'
from mv_department_dashboard b
where not exists (
  select 1 from f_department_dashboard(b.department, current_date - 30, current_date) d
  where d.ord = b.ord and d.honours_range)
union all
select 'quickbooks_not_connected', 'critical', 'QuickBooks',
       'No QuickBooks connection exists, so inventory_mismatch_os_quickbooks, the OS-to-QuickBooks '
         || 'revenue tie-out and invoice ageing cannot run.',
       'Build the connector, write every run to quickbooks_import_log, and reconcile OS sales to Apex to QuickBooks.'
where not exists (select 1 from information_schema.tables where table_name='quickbooks_import_log')
union all
select 'apex_inventory_not_synced', 'critical', 'Apex inventory',
       'Apex sends sales only. Inventory adjustments, counts and package-level inventory are not '
         || 'synced, so OS-to-Apex inventory cannot be reconciled.',
       'Extend apex-sync to the inventory endpoints per docs/vendor/APEX_API_MANUAL.md and log to apex_import_log.'
where not exists (select 1 from information_schema.tables where table_name='apex_import_log')
union all
select 'documents_not_consolidated', 'warning', 'document tables',
       'Documents live in metrc_documents, coa_extract and manifest_extract with no single '
         || 'document_id, so no one row identifies a document across the OS.',
       'Consolidate to one document table with a stable id and repoint the parsers.'
where not exists (select 1 from information_schema.tables where table_name='document');;
