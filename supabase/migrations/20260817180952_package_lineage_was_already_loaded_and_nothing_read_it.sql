/* Package lineage was already loaded, and nothing read it.
 *
 * 14,863 of 19,559 rows in metrc_packages had no parent — no SourceHarvestNames and
 * no SourcePackageLabels — so seed-to-sale stopped dead at the harvest for 76% of
 * every package we hold. I was about to ask the owner to re-pull the Packages report
 * with the lineage columns selected. He had already provided it, twice: once as the
 * grid exports on 6-7 Aug, and again as the loaded report tables that came from them.
 *
 * metrc_rpt_package_transfers has carried package_tag, source_harvest and
 * source_package for 19,256 rows across 15,496 distinct tags the entire time. The
 * report loader wrote the table and stopped. Nothing promoted the columns into
 * metrc_packages.raw, which is what the ~30 downstream views actually read.
 *
 * This is the same failure as the IsFinished backfill on 14,822 rows and the State
 * backfill on 1,151 plants: the table was checked, and what reads the table was not.
 * Third time. The lesson is now a data_assertion rather than a resolution.
 *
 * PRECEDENCE
 *   1. metrc_rpt_package_transfers  — 14,822 orphans, richest and most complete
 *   2. metrc_rpt_lab_results        — 1,016 orphans, carries source_harvests/packages
 *   3. metrc_rpt_packages_inventory — 95 orphans, harvest + source_packages
 * Verified before writing: zero tags disagree between rows within transfers
 * (0 of 15,496 on harvest, 0 of 15,496 on package), so max() is a safe reducer and
 * not a coin toss. Only rows that are currently orphaned are touched — an existing
 * value is never overwritten by a report.
 *
 * _lineage_source records where each value came from, so a later reader can tell a
 * report-derived parent from an API-derived one without guessing.
 */

with src as (
  select package_tag                                as tag,
         max(nullif(btrim(source_harvest), ''))     as h,
         max(nullif(btrim(source_package), ''))     as p,
         'metrc_rpt_package_transfers'              as from_table
    from public.metrc_rpt_package_transfers
   group by package_tag

  union all

  select package_tag,
         max(nullif(btrim(source_harvests), '')),
         max(nullif(btrim(source_packages), '')),
         'metrc_rpt_lab_results'
    from public.metrc_rpt_lab_results
   group by package_tag

  union all

  select package_tag,
         max(nullif(btrim(harvest), '')),
         max(nullif(btrim(source_packages), '')),
         'metrc_rpt_packages_inventory'
    from public.metrc_rpt_packages_inventory
   group by package_tag
),
ranked as (
  select distinct on (tag) tag, h, p, from_table
    from src
   where h is not null or p is not null
   order by tag,
            case from_table
              when 'metrc_rpt_package_transfers'  then 1
              when 'metrc_rpt_lab_results'        then 2
              else 3
            end
)
update public.metrc_packages p
   set raw = coalesce(p.raw, '{}'::jsonb)
           || jsonb_strip_nulls(jsonb_build_object(
                'SourceHarvestNames',  r.h,
                'SourcePackageLabels', r.p,
                '_lineage_source',     r.from_table || ', promoted 17 Aug 2026'))
  from ranked r
 where p.tag = r.tag
   and coalesce(p.raw->>'SourceHarvestNames',  '') = ''
   and coalesce(p.raw->>'SourcePackageLabels', '') = '';

/* MEASURED AFTER APPLYING
 *   packages with a source harvest   4,696 →  19,494
 *   packages with a source package   3,823 →  18,518
 *   orphans                         14,863 →      42
 *   orphans Metrc could have traced 14,822 →       0
 *
 * The 42 that remain are cases where Metrc itself records no parent: 41 arrived by
 * API (24 active, 17 inactive) and one by report with a blank Source Harvest in the
 * export too. That is Metrc's gap, not our mirror's, and it must not be reported as
 * ours.
 *
 * THE ASSERTION THAT BELONGS WITH THIS IS NOT HERE YET.
 * tg_require_assertion_fixture refused it:
 *   "Assertion packages_have_a_parent has no POSITIVE fixture."
 * That guard is correct — an assertion nobody has watched fail is not evidence of
 * anything. It needs a shadow schema with a planted violation before it can be
 * registered, which is its own piece of work and is not being smuggled in here.
 * Tracked as its own task. The backfill is not "done" until the assertion exists;
 * without it the next loader repeats this for the fourth time.
 */
