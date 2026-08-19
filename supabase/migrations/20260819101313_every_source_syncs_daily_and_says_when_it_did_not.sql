/* EVERY SOURCE SYNCS ON A SCHEDULE — owner instruction, 19 Aug 2026: "AND YOU
 * CANNOT FORGET ABOUT THE SPREADSHEET SYNCS... THESE MUST LIKE METRC AND APEX
 * SYNC DAILY."
 *
 * Checking before building found something worse than the thing he asked for:
 * METRC is the ONLY source on a schedule. apex-sync appears in no cron job at
 * all, and neither does the spreadsheet importer. Every Apex figure and every
 * sheet figure in this OS has been arriving only when a person remembered to
 * press it — 13 sheet imports in thirty days, every one manual.
 *
 * Same class of defect as the deploy freeze: a pipeline nobody scheduled,
 * failing silently, with the owner as the detector. Both are now scheduled and
 * — more importantly — WATCHED, because a scheduled job that dies quietly is
 * exactly as useless as an unscheduled one. The freshness thresholds are
 * owner-editable rules, never numbers buried in code. */

insert into public.conversion_factors (key, value, unit, label, what_it_means, where_it_came_from, set_by) values
('apex_sync_max_age_hours', 24, 'hours', 'Apex sync freshness',
 'How long Apex sales data may go without a successful sync before the OS raises a critical gap. Apex is the sales source of record; stale Apex means every revenue figure is quietly out of date.',
 'Owner instruction 19 Aug 2026 that Apex and the sheets must sync daily like Metrc.', 'Vinny'),
('sheet_sync_max_age_hours', 24, 'hours', 'Spreadsheet sync freshness',
 'How long the operational spreadsheets may go without an import before the OS raises a critical gap. The sheets carry finished goods and production figures that exist nowhere else.',
 'Owner instruction 19 Aug 2026: "you cannot forget about the spreadsheet syncs — these must like Metrc and Apex sync daily."', 'Vinny'),
('metrc_sync_max_age_hours', 24, 'hours', 'Metrc sync freshness',
 'How long the Metrc mirror may go without a successful run before the OS raises a critical gap.',
 'Set alongside the Apex and sheet thresholds, 19 Aug 2026, so all three sources are held to one standard.', 'Vinny')
on conflict (key) do nothing;

select cron.schedule('apex-sync-daily', '15 6 * * *',
  $$set statement_timeout = '20min'; select tg_call_function('apex-sync')$$);

select cron.schedule('sheet-sync-daily', '25 6 * * *',
  $$set statement_timeout = '20min'; select tg_call_function('sheet-sync')$$);

create or replace view public.v_source_freshness as
with last_run as (
  select 'metrc'::text as source,
         (select max(finished_at) from metrc_sync_runs
           where coalesce(status,'') not ilike '%fail%' and coalesce(status,'') not ilike '%error%') as last_ok,
         f_rule('metrc_sync_max_age_hours') as max_age_hours,
         'metrc-nightly-full 07:10, metrc-dispatcher every 15 min'::text as scheduled_as
  union all
  select 'apex',
         (select max(fetched_at) from apex_raw),
         f_rule('apex_sync_max_age_hours'),
         'apex-sync-daily 06:15'
  union all
  select 'spreadsheets',
         (select max(finished_at) from import_run where coalesce(rows_accepted,0) > 0),
         f_rule('sheet_sync_max_age_hours'),
         'sheet-sync-daily 06:25'
)
select source, last_ok, max_age_hours, scheduled_as,
       round(extract(epoch from (now() - last_ok))/3600.0, 1) as hours_since,
       (last_ok is null or now() - last_ok > (max_age_hours || ' hours')::interval) as is_stale,
       case
         when last_ok is null
           then 'NEVER SYNCED — this source has no successful run on record at all.'
         when now() - last_ok > (max_age_hours || ' hours')::interval
           then 'STALE — last successful sync ' || round(extract(epoch from (now() - last_ok))/3600.0, 1)
                || ' hours ago, past the ' || max_age_hours || '-hour rule. Every figure from this source is that old.'
         else 'Fresh — last successful sync ' || round(extract(epoch from (now() - last_ok))/3600.0, 1) || ' hours ago.'
       end as verdict
from last_run;

comment on view public.v_source_freshness is
  'Metrc, Apex and the spreadsheets against their own owner-set freshness rules. Built 19 Aug 2026 '
  'when the owner asked for daily sheet syncs and the check found that NEITHER Apex NOR the sheets '
  'were scheduled at all — only Metrc was. A scheduled job that dies quietly is as useless as an '
  'unscheduled one, so this view is what the gap engine reads. Agent I.';

grant select on public.v_source_freshness to authenticated;

insert into public.gap_rule (gap_type, family, severity, detects, detector, threshold_key, what_it_catches, why_not_yet) values
('source_sync_stale','system','critical',true,'v_gap_system → v_source_freshness','apex_sync_max_age_hours',
 'A source system (Metrc, Apex or the spreadsheets) that has not synced inside its own freshness rule.', null)
on conflict (gap_type) do update set detects=excluded.detects, detector=excluded.detector,
  what_it_catches=excluded.what_it_catches, why_not_yet=excluded.why_not_yet;

insert into public.gap_routing (gap_type, owner_role, fixer, escalate_after_days, escalate_to, why_this_owner, machine_can_fix, why_not_machine)
values ('source_sync_stale','database','Agent I re-runs the sync and reads its error',1,'management',
        'A stale source silently ages every figure built on it; one day is the whole patience.', false,
        'A guard can detect the staleness but must not re-run an integration unattended — a sync that failed for a credential or a rate limit will simply fail again and hide the real cause.')
on conflict (gap_type) do nothing;

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
       m.spec_type as subject,
       'The specification requires a ' || m.spec_type || ' event; the ledger has recorded none '
         || '(expected as "' || m.ledger_type || '").' as description,
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
