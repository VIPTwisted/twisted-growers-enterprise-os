-- Queue 3 was reading every one of the 101,608 rows in metrc_lab_results and
-- every one of the 39,531 in metrc_rpt_lab_results, twice each, to find the 139
-- and 3,514 that record a failure. 2.16 seconds a scan; v_xq_summary scans it
-- four times and timed out. A failure is rare by definition, so the indexes are
-- partial - they hold only the failing lines and cost almost nothing to keep.
create index if not exists metrc_lab_results_failed_tag_idx
  on public.metrc_lab_results (package_tag)
  where passed is false;

create index if not exists metrc_rpt_lab_results_failed_tag_idx
  on public.metrc_rpt_lab_results (package_tag)
  where overall_passed in ('No','False');

analyze public.metrc_lab_results;
analyze public.metrc_rpt_lab_results;;
