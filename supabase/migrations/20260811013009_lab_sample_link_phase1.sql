-- Phase 1: link the LABORATORY SAMPLE package back to the SOURCE package.
--
-- metrc_rpt_lab_results is keyed on the sample package Metrc creates for the
-- lab. Not one of its 1,016 sample tags exists in metrc_packages, which is why
-- the table has never joined to anything. The bridge column, source_packages,
-- was in the table all along -- 963 of 1,008 resolve to a real package.
-- Verified safe to join: always exactly one 24-character tag, never a list.

------------------------------------------------------- the encoding normaliser
-- ⚠ overall_passed carries TWO encodings, split by IMPORT not by laboratory:
--   the 03 Aug export wrote True/False (16,081 rows)
--   the 06 Aug export wrote Yes/No     (23,450 rows)
-- So `where overall_passed = 'True'` silently drops an entire import -- 59% of
-- the table. Same shape as the % vs mg/g trap: one concept, two encodings, and
-- the filter looks correct while answering the wrong question.
create or replace function public.f_yesno(p text)
returns boolean
language sql
immutable
set search_path to 'public','pg_temp'
as $$ select case
       when p is null then null
       when lower(btrim(p)) in ('true','yes','y','t','1','pass','passed') then true
       when lower(btrim(p)) in ('false','no','n','f','0','fail','failed') then false
       else null end $$;

comment on function public.f_yesno(text) is
  'Normalises the two encodings Metrc report exports use for a boolean. '
  'metrc_rpt_lab_results holds True/False from the 03 Aug import and Yes/No from '
  'the 06 Aug one; a filter on either encoding silently drops the other import. '
  'Returns null for anything unrecognised rather than guessing false.';

---------------------------------------------------------------- the link view
create or replace view public.v_lab_sample_link as
select
  r.package_tag                                   as sample_tag,
  r.source_packages                               as source_tag,
  p.tag is not null                               as source_in_package_book,
  p.item_name                                     as source_item,
  r.item                                          as sample_item,
  r.category,
  r.lab_facility                                  as laboratory,
  r.lab_licence,
  r.test_date,
  r.test_name,
  r.result,
  f_yesno(r.passed)                               as analyte_passed,
  f_yesno(r.overall_passed)                       as sample_passed,
  r.overall_passed                                as sample_passed_as_filed,
  r.source_harvests,
  -- D4: more than one source harvest means the package is a BLEND and has no
  -- single strain. Never resolve one contributor as though it were the answer.
  case
    when coalesce(r.source_harvests,'') = ''   then null
    when r.source_harvests like '%,%'          then 'BLEND'
    else btrim(substring(r.source_harvests from '^(.*?)\s+-\s'))
  end                                             as strain_or_blend,
  (r.source_harvests like '%,%')                  as is_blend,
  exists (select 1 from coa_extract c where c.package_tag = r.source_packages)
                                                  as source_has_coa,
  exists (select 1 from metrc_lab_results m where m.package_tag = r.source_packages)
                                                  as also_in_api_sync,
  -- Provenance on every row (rule A2): which of the two lab sources this came
  -- from, and whether the API sync corroborates it.
  case
    when exists (select 1 from metrc_lab_results m where m.package_tag = r.source_packages)
      then 'Metrc Lab Results report, corroborated by the API sync'
    else 'Metrc Lab Results report ONLY - the API sync never returned this package'
  end                                             as provenance,
  r.as_of_date                                    as import_as_of,
  r.imported_at
from metrc_rpt_lab_results r
left join metrc_packages p on p.tag = r.source_packages
where coalesce(r.source_packages,'') <> '';

comment on view public.v_lab_sample_link is
  'Joins metrc_rpt_lab_results to the package book through source_packages -- the '
  'column that existed all along and that nothing had ever joined. Built 10 Aug '
  '2026. Note what this does NOT do: it reaches ZERO certificates that the API '
  'sync could not already reach. Its real value is 224 source packages carrying '
  'laboratory results that the API sync never returned.';

revoke all on public.v_lab_sample_link from public, anon;
grant select on public.v_lab_sample_link to authenticated;

------------------------------------------- what the join actually adds, sized
create or replace view public.v_lab_report_only_packages as
select
  l.source_tag                                    as package_tag,
  max(l.source_item)                              as item_name,
  max(l.laboratory)                               as laboratory,
  max(l.test_date)                                as test_date,
  count(*)                                        as analytes,
  bool_and(coalesce(l.sample_passed,true))        as all_passed,
  max(l.strain_or_blend)                          as strain_or_blend,
  'Laboratory results exist for this package in the Metrc Lab Results report, '
  'and the packages API never returned them. Anything calling it untested from '
  'the API alone is wrong (rule C0b).'            as why_it_matters
from v_lab_sample_link l
where not l.also_in_api_sync
group by l.source_tag;

comment on view public.v_lab_report_only_packages is
  'The 224 packages whose ONLY laboratory evidence is the report import. '
  'Overwhelmingly bulk intermediates -- badder, live hash rosin, crude, '
  'distillate, bulk vape oil, gummies. None of them carries a certificate. '
  'These are exactly the products the customer catalogue needs potency for.';

revoke all on public.v_lab_report_only_packages from public, anon;
grant select on public.v_lab_report_only_packages to authenticated;
;
