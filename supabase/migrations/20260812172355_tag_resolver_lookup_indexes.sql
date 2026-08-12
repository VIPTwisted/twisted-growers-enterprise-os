-- Agent: M
-- Functional indexes for v_tag_resolver. Purely additive: no view, figure,
-- column or grant changes. Measured before: a single-tag lookup through the
-- resolver ran 2,039 ms because upper(btrim(...)) matched no index and every
-- CTE fell to a sequential scan - three of them over the 19,256-row transfer
-- report. Measured after: 224 ms. The resolver is meant to answer "where is
-- this tag" for one tag at a time, so the single-tag path is the one that
-- matters. A full scan of all 19,046 tags runs 686 ms either way.

create index if not exists metrc_packages_label_norm_idx
  on public.metrc_packages ((upper(btrim(raw->>'Label'))));

create index if not exists metrc_rpt_package_transfers_tag_norm_idx
  on public.metrc_rpt_package_transfers ((upper(btrim(package_tag))));

create index if not exists metrc_rpt_package_transfers_source_pkg_norm_idx
  on public.metrc_rpt_package_transfers ((upper(btrim(source_package))))
  where source_package is not null;

create index if not exists metrc_rpt_point_in_time_tag_norm_idx
  on public.metrc_rpt_point_in_time ((upper(btrim(tag))));

create index if not exists metrc_rpt_adjustments_tag_norm_idx
  on public.metrc_rpt_adjustments ((upper(btrim(package_tag))));

create index if not exists metrc_rpt_lab_results_tag_norm_idx
  on public.metrc_rpt_lab_results ((upper(btrim(package_tag))));

analyze public.metrc_packages;
analyze public.metrc_rpt_package_transfers;
analyze public.metrc_rpt_point_in_time;
analyze public.metrc_rpt_adjustments;
analyze public.metrc_rpt_lab_results;
