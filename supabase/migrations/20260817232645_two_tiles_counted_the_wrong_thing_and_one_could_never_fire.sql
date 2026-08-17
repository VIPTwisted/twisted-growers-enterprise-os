/* Two tiles counted the wrong thing, and one of them could never fire.
 *
 * Found by v_tile_drill_status, which compares every tile against the rows its own
 * drilldown opens.
 *
 * 1. METRC — "Packages mirrored": tile 19,585, drill 18,870, gap 715.
 *    The base matview computes count(*) FROM metrc_packages. That counts ROWS. A package
 *    is a TAG, and 715 tags hold more than one row because the same physical package is
 *    recorded under both licences when it moves MC281714 -> MP281909. Measured: 692+601
 *    inactive, 76+20 active, 38+3 in transit. The tile was reporting every cross-licence
 *    move as an extra package. Corrected to count(DISTINCT tag) = 18,870.
 *
 * 2. SETTINGS — "Business rules not yet set": tile 0, drill 29.
 *    The base computes count(*) FROM conversion_factors WHERE set_by LIKE 'default%'.
 *    NOT ONE ROW begins with "default" — Agent V read all 64 on 13 Aug 2026 and said so
 *    at the time. The tile therefore returns 0 permanently. It is not a wrong number, it
 *    is a CHECK THAT CANNOT FAIL: a green light wired to nothing, sitting on the Settings
 *    page telling the owner every business rule has been set by him while 29 were set by
 *    an agent. Corrected to count rules whose set_by is not the owner.
 *
 * WHY THIS IS FIXED IN THE VIEW AND NOT THE BASE MATVIEW.
 * The defects are in mv_department_dashboard_base, which is a MATERIALISED view and
 * cannot be CREATE OR REPLACE'd. Correcting it there means DROP ... CASCADE, and the E1
 * guard refused that with the reason: "It destroyed mv_department_dashboard three times
 * and blanked every dashboard with no visible error, because the front end swallows the
 * failure with ?? []." Three times. The guard is right and it is not being worked around
 * at the end of a long session.
 *
 * The serving view ALREADY uses this mechanism: it overrides Command/ord=1 with a CASE to
 * serve the corrected dried-flower figure. That is how that tile came to be right. These
 * two follow the same established pattern, so there is still exactly ONE value served per
 * KPI — the override replaces the base value rather than sitting alongside it.
 *
 * The base rows remain wrong underneath and must be corrected the next time that matview
 * is legitimately rebuilt under the three-reviewer rule. A ready migration and a verified
 * rollback are staged for that. Until then this comment is the record of why the base and
 * the serving layer disagree, so nobody "tidies up" the override and silently restores
 * both defects.
 */

create or replace view public.mv_department_dashboard as
 SELECT b.department,
    b.ord,
        CASE
            WHEN b.department = 'Command'::text AND b.ord = 1 THEN 'Dried flower on hand'::text
            ELSE b.kpi
        END AS kpi,
        CASE
            WHEN b.department = 'Command'::text AND b.ord = 1 THEN ( SELECT v_stock_headline.dried_lb
               FROM v_stock_headline)
            /* Corrected 17 Aug 2026: a package is a tag, not a row. 715 tags are recorded
               under both licences because the package moved between them. */
            WHEN b.department = 'Metrc'::text AND b.ord = 1 THEN ( SELECT count(DISTINCT mp.tag)::numeric
               FROM metrc_packages mp)
            /* Corrected 17 Aug 2026: the base tested set_by LIKE 'default%' and no row has
               ever begun with that word, so this tile could only ever read 0. */
            WHEN b.department = 'Settings'::text AND b.ord = 2 THEN ( SELECT count(*)::numeric
               FROM conversion_factors cf WHERE cf.set_by !~* '(owner|vinny)'::text)
            WHEN b.kpi = 'Moisture loss not recorded'::text THEN COALESCE(b.value, 0::numeric)
            ELSE b.value
        END AS value,
    b.unit,
    b.tone,
        CASE
            WHEN b.department = 'Command'::text AND b.ord = 1 THEN ('Dried only. Fresh frozen '::text || (( SELECT to_char(v_stock_headline.fresh_frozen_wet_lb, 'FM999999.0'::text) AS to_char
               FROM v_stock_headline))) || ' lb is held separately at wet weight and is never added to this.'::text
            WHEN b.department = 'Metrc'::text AND b.ord = 1 THEN
              'Distinct tags. 715 tags appear twice because the package moved between our two licences — that is one package, not two.'::text
            WHEN b.department = 'Settings'::text AND b.ord = 2 THEN
              'Conversion factors not set by the owner. Each one is a number the platform is using that he has not confirmed.'::text
            ELSE b.context
        END AS context,
    b.drill,
    b.computed_at
   FROM mv_department_dashboard_base b
UNION ALL
 SELECT s.department,
    s.ord,
    s.kpi,
    s.value,
    s.unit,
    s.tone,
    s.context,
    s.drill,
    s.computed_at
   FROM mv_dept_dash_supplement s;

comment on view public.mv_department_dashboard is
  'Serving layer for every category dashboard KPI strip. Overrides three base values that '
  'are wrong in mv_department_dashboard_base and cannot be corrected there without a '
  'DROP CASCADE the E1 guard refuses — that drop blanked every dashboard three times. '
  'Command/1 dried flower, Metrc/1 distinct tags not rows, Settings/2 rules not set by the '
  'owner. Do not remove these overrides without correcting the base first. Agent I, '
  '17 Aug 2026.';;
