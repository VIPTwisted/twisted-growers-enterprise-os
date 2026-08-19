/* THE COMPLETE GAP LEDGER — owner's authoritative list, 19 Aug 2026, all
 * twelve families. Every type he named now exists as a row, detecting or with
 * its reason logged. Nothing unclassified, nothing left out.
 *
 * NOTABLE: he classes SYSTEM AND PIPELINE state as gaps — missing_event_types,
 * repo_structure_incomplete, import_failure. That is the OS monitoring its own
 * build completeness on the same ledger as its data. It is the right instinct:
 * an unfinished spine is a compliance risk exactly like a missing manifest,
 * and putting it on the same board means it cannot be quietly deprioritised.
 * missing_event_types detects TODAY and fires on the event types his spec
 * requires that the ledger has never recorded. */

insert into public.gap_rule (gap_type, family, severity, detects, detector, threshold_key, what_it_catches, why_not_yet) values
('document_mismatch','document','critical',true,'v_tag_gap rule G',null,
 'A certificate or manifest whose named party contradicts the tag lineage.',null),
('document_not_linked','document','warning',true,'v_tag_gap rule O',null,
 'A parsed document holding no tag we can attach it to.',null),
('document_parse_error','document','warning',false,null,null,
 'A document that reached the parser and came back without its key fields.',
 'Parser outcomes are recorded per run, not per document, so a single failed document cannot yet be named. Needs a per-document parse status.'),
('missing_package_coa','tag_package','critical',true,'v_tag_gap rule A',null,
 'A package with no certificate — same detector as missing_coa, kept under the owner name.',null),
('stale_document_ingestion','system','warning',false,null,'document_ingest_due_hours',
 'Documents arriving but not parsed inside the expected window.',
 'coa_extract records report_date, not the moment the file arrived, so "how long unparsed" cannot be measured. Needs an arrival timestamp on ingestion.'),
('room_off_cycle','cultivation','warning',false,null,'flower_cycle_days',
 'A room whose harvest date has drifted outside the 56-day rotation.',
 'The four rooms are declared as a rule but not yet ASSIGNED to the rotation, so there is no planned date for a room to drift from. Blocked on the harvest plan generator.'),
('date_range_not_applied','system','critical',true,'v_gap_system',null,
 'A dashboard figure with no dated recomputation path — it cannot honour the selected range.',null),
('date_range_partial_refresh','system','warning',false,null,null,
 'Some components on a page refreshing on a date change while others do not.',
 'Detectable only in the browser, not from the database. Belongs to a front-end assertion the page canary must carry.'),
('missing_event_types','system','critical',true,'v_gap_system',null,
 'An event type the specification requires that the ledger has never recorded.',null),
('repo_structure_incomplete','system','info',false,null,null,
 'Backend, frontend, infra and docs not yet in the specified layout.',
 'A repository fact, not a database one. Owner sequenced it LAST (19 Aug): after event types, document consolidation and the integrations, because moving paths breaks the Netlify build and all 37 gates. Tracked in brain/MASTER_BUILD.md.'),
('import_failure','system','critical',true,'v_gap_system',null,
 'An import run that read rows and accepted none, or ended in failure.',null),
('quickbooks_not_connected','system','critical',true,'v_gap_system',null,
 'QuickBooks is not connected, so three reconciliation gap types cannot run at all.',null),
('apex_inventory_not_synced','system','critical',true,'v_gap_system',null,
 'Apex sends sales only; inventory adjustments and counts are not synced, so OS-to-Apex inventory cannot be reconciled.',null),
('documents_not_consolidated','system','warning',true,'v_gap_system',null,
 'Documents live across several tables instead of one, so no single document_id exists.',null)
on conflict (gap_type) do update set
  family=excluded.family, severity=excluded.severity, detects=excluded.detects,
  detector=excluded.detector, threshold_key=excluded.threshold_key,
  what_it_catches=excluded.what_it_catches, why_not_yet=excluded.why_not_yet;

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
           else r.spec_type end as ledger_type
  from required_types r
)
select 'missing_event_types'::text as gap_type, 'critical'::text as severity,
       m.spec_type                as subject,
       'The specification requires a ' || m.spec_type || ' event; the ledger has recorded none '
         || '(expected as "' || m.ledger_type || '").' as description,
       'Promote this fact from the mirror into tag_event so the tag timeline is complete. Every '
         || 'gate that depends on it stays blind until then.' as required_action
from mapped m
where not exists (select 1 from tag_event p where p.event_type = m.ledger_type)
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
where not exists (select 1 from information_schema.tables where table_name='document');

comment on view public.v_gap_system is
  'System and pipeline gaps (owner ledger family 12 plus the five structural gaps he formalised '
  '19 Aug 2026): the OS monitoring its own build completeness on the same board as its data — '
  'missing event types, failed imports, undated dashboard figures, QuickBooks absent, Apex '
  'inventory unsynced, documents unconsolidated. An unfinished spine is a compliance risk exactly '
  'like a missing manifest, and putting it here means it cannot be quietly deprioritised. Each row '
  'disappears by itself the day the thing is built. Agent I.';

grant select on public.v_gap_system to authenticated;;
