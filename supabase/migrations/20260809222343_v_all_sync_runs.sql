/* Owner, 9 Aug 2026: "PANEL MUST REPORT EVERY SINGLE RUN ALWAYS."

   He pressed Sync all Apex, it ran fifteen entities and landed 186 rows, and the
   Recent Sync Runs panel showed nothing - so the only reasonable conclusion from the
   screen was that Apex had not synced. It had. The panel reads metrc_sync_runs, and
   Apex writes to apex_sync_run.

   That is a worse failure than a broken sync: a run log that is silent about a whole
   integration teaches you to distrust the log, and then the log is useless for the
   thing it exists for. Any future integration that invents its own run table will
   disappear the same way, so this UNIONs the sources rather than the panel picking
   one. */
create or replace view public.v_all_sync_runs as
select
  'Metrc / Sheets / ClickUp'                     as system,
  coalesce(r.endpoint, '?')                      as endpoint,
  coalesce(r.license, '-')                       as license,
  r.status,
  r.records                                      as records,
  r.started_at,
  r.finished_at,
  left(r.error, 400)                             as error
from public.metrc_sync_runs r
union all
select
  'Apex Trading'                                 as system,
  a.entity                                       as endpoint,
  '-'                                            as license,
  a.status,
  coalesce(a.rows_written, a.rows_seen)          as records,
  a.started_at,
  a.finished_at,
  left(a.error, 400)                             as error
from public.apex_sync_run a;

comment on view public.v_all_sync_runs is
  'EVERY sync run from EVERY integration, in one place. The Recent Sync Runs panel must read this and never a single source table - on 9 Aug 2026 it read metrc_sync_runs only, so a successful 15-entity Apex run that landed 186 rows appeared on screen as "Apex did not sync".';

grant select on public.v_all_sync_runs to authenticated;;
