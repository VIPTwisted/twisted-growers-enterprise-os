-- ---------------------------------------------------------------------------
-- 0029 — METRC REPORTS AGE OUT. This changes the priority of everything.
--
-- Owner, 10 Aug 2026: "SOME REPORTS DO NOT ALLOW US TO GO BACK MORE THAN 700 AND
-- SOMETHING DAYS."
--
-- THE EVIDENCE MATCHES EXACTLY. The MC281714 Lab Results export pulled today
-- starts 1 September 2024 -- 708 days before 10 August 2026. That was read as a
-- data gap. It is not. It is a ROLLING RETENTION WINDOW, and it advances one day
-- every day.
--
-- SO HISTORY IS BEING LOST CONTINUOUSLY, SILENTLY, AND PERMANENTLY. Every day
-- that passes, one more day of 2024 becomes unpullable from Metrc forever. No
-- error is raised; the report simply returns a shorter range and looks normal.
--
-- THE CONSEQUENCE FOR THE 2024 AUDIT. Lab results for Jan-Aug 2024 are already
-- outside the window and cannot now be obtained from Metrc at all -- only from the
-- laboratories or the paper COAs. The 133 sample tags with no COA are therefore
-- NOT a backlog to work through; they are closed unless the labs supply them.
--
-- WHAT THIS MAKES URGENT. Every report that still reaches into 2024 must be pulled
-- and archived NOW, before its window closes. docs/metrc-exports and source_export
-- stop being a convenience and become the only surviving copy.
-- ---------------------------------------------------------------------------

alter table metrc_report_catalog
  add column if not exists retention_days integer,
  add column if not exists retention_note text;

comment on column metrc_report_catalog.retention_days is
  'How far back this report can be pulled TODAY. Measured, not assumed. The window '
  'rolls forward daily, so anything older is gone from Metrc permanently.';

update metrc_report_catalog set
  retention_days = 708,
  retention_note = 'MEASURED: the export pulled 10 Aug 2026 starts 1 Sep 2024 = 708 days. '
                || 'Jan-Aug 2024 lab results are ALREADY outside the window and cannot be '
                || 'obtained from Metrc at any future date. Only the laboratories or the '
                || 'paper COAs hold them now.'
where report_key in ('lab_results_mc','lab_results_mp');

update metrc_report_catalog set
  retention_note = 'Reaches to 15 May 2024 (817 days) as at 10 Aug 2026, so not obviously '
                || 'capped -- but if a ~700-day limit applies it will begin truncating '
                || 'this report within weeks. Archive now.'
where report_key in ('harvests_mc','harvest_moisture_mc');

update metrc_report_catalog set
  retention_note = 'Reaches into 2023 as at 10 Aug 2026, so it currently sees further back '
                || 'than Lab Results. It is the ONLY source of 2024 test dates before the '
                || 'Lab Results window. Archive before it truncates.'
where report_key = 'test_batches_mc';

update metrc_report_catalog set
  retention_note = 'Point in Time is requested for a SPECIFIC DATE rather than a range, so '
                || 'it may not be capped the same way -- but the 1 Jan 2024 pull returning '
                || 'zero rows for MP281909 must be read as evidence of nil stock, NOT as the '
                || 'window having closed. Confirm by pulling a date where stock is known.'
where report_key in ('point_in_time_mc','point_in_time_mp');


create or replace view v_report_retention_risk as
select c.report_key,
       c.metrc_report_name,
       c.licence,
       c.earliest_available,
       c.retention_days,
       (current_date - c.retention_days)                         as window_opens_on,
       case when c.retention_days is null then null
            else greatest(0, (current_date - c.retention_days) - c.earliest_available)
       end                                                       as days_already_lost,
       c.last_pulled_on,
       (c.last_pulled_on is not null)                            as archived_locally,
       case
         when c.retention_days is null
           then 'RETENTION UNKNOWN — measure it before assuming history is safe'
         when c.earliest_available < (current_date - c.retention_days)
           then 'HISTORY ALREADY LOST — the window has closed past this report''s earliest data'
         when c.earliest_available < (current_date - c.retention_days + 60)
           then 'CLOSING WITHIN 60 DAYS — pull and archive now'
         else 'inside the window'
       end                                                       as risk,
       c.retention_note
from metrc_report_catalog c
where c.active;

comment on view v_report_retention_risk is
  'Metrc reports age out on a rolling window -- measured at 708 days on Lab Results. '
  'History is lost silently: the report simply returns a shorter range and looks '
  'normal. This names what is already gone and what closes next, so exports are '
  'archived BEFORE the window shuts rather than discovered missing afterwards.';

grant select on v_report_retention_risk to authenticated;
;
