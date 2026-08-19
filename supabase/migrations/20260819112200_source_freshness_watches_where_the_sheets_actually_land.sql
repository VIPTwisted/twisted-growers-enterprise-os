/* THE SPREADSHEET WATCHER WAS LOOKING IN THE WRONG TABLE — caught within the
 * hour by testing it, 19 Aug 2026.
 *
 * v_source_freshness read import_run for the spreadsheets. sheet-sync does not
 * write there: it records every run in metrc_sync_runs under endpoint
 * 'google_sheet_fg'. So the first successful scheduled sheet sync — 156 rows
 * across all ten tabs, HTTP 200, proven through the cron path — still showed
 * STALE, and would have gone on showing stale forever while the sync ran
 * perfectly every morning.
 *
 * A watcher that cannot see success is exactly as useless as no watcher, and
 * it is worse than useless when it cries wolf: the one alarm nobody believes is
 * the one that was wrong the first ten times. Now it reads BOTH roads — the
 * sheet-sync run log and the spreadsheet importer — and takes the later, so
 * either path proves freshness. */

create or replace view public.v_source_freshness as
with last_run as (
  select 'metrc'::text as source,
         (select max(finished_at) from metrc_sync_runs
           where coalesce(status,'') not ilike '%fail%' and coalesce(status,'') not ilike '%error%'
             and coalesce(endpoint,'') not like 'google_sheet%') as last_ok,
         f_rule('metrc_sync_max_age_hours') as max_age_hours,
         'metrc-nightly-full 07:10, metrc-dispatcher every 15 min'::text as scheduled_as
  union all
  select 'apex',
         (select max(fetched_at) from apex_raw),
         f_rule('apex_sync_max_age_hours'),
         'apex-sync-daily 06:15'
  union all
  select 'spreadsheets',
         greatest(
           /* sheet-sync's own run log — the Google Sheet path */
           (select max(finished_at) from metrc_sync_runs
             where endpoint like 'google_sheet%' and coalesce(status,'') = 'ok'),
           /* the file importer — the upload path */
           (select max(finished_at) from import_run where coalesce(rows_accepted,0) > 0)
         ),
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
  'Metrc, Apex and the spreadsheets against their own owner-set freshness rules. The spreadsheet '
  'row reads BOTH roads — sheet-sync''s log in metrc_sync_runs (endpoint google_sheet%) and the '
  'file importer''s import_run — and takes the later, because the first version watched only '
  'import_run and reported STALE through a perfectly successful scheduled sync. A watcher that '
  'cannot see success is as useless as no watcher. Metrc''s row excludes the sheet endpoints so '
  'the two never borrow each other''s freshness. Agent I, 19 Aug 2026.';;
