/* The "dry-equivalent" figure was never dry. It carried 325.3 lb of water.
 *
 * Owner ruling, 17 Aug 2026: "4.5 : 1 — standard for most commercial indoor growers."
 * conversion_factors.fresh_frozen_wet_to_dry is already 4.5, so the RATIO was never the
 * problem and the contract's note guessed wrong about what the owner needed to settle.
 *
 * MEASURED:
 *   Fresh frozen on hand, wet            418.3 lb
 *   At the owner's 4.5:1                  93.0 lb dry-equivalent
 *   Water that was never removed         325.3 lb
 *   Gap reported by the tile contract    325.6 lb   (the 0.3 is the known rounding tolerance)
 *
 * The tile labelled "Total on hand, dry-equivalent" reads sum(pounds) from
 * v_stock_on_hand, and v_stock_on_hand never applies the ratio — checked, its definition
 * does not contain the factor at all. It sums fresh frozen at WET weight alongside cured
 * product and calls the total dry-equivalent. 325.3 lb of water has been presented as
 * saleable dry weight.
 *
 * WHY A NEW COLUMN AND NOT A CORRECTION TO `pounds`.
 * v_stock_on_hand has 118 dependents. Redefining `pounds` to mean dry-equivalent would
 * silently change the meaning of a figure in 118 places, most of which want the actual
 * physical weight of what is in the room — a wet pound IS a pound when you are lifting
 * it. So `pounds` keeps meaning weight-as-held, and `pounds_dry_equivalent` is appended
 * for the figures that must obey the conversion. Appending is also the only thing
 * CREATE OR REPLACE permits, and rule E1 forbids the drop.
 *
 * THE GUARD IS DELIBERATELY LEFT DISAGREEING.
 * This migration gives the platform a correct figure to read. It does NOT change what
 * the Command Center tile reads — that is the front end, and until the page is pointed
 * at the new column the tile still shows a wet number. Updating the contract now would
 * make the guard report success while the owner still sees 2,489.1. The contract's note
 * is corrected to say what is actually outstanding, and it stays red until the page moves.
 */

create or replace view public.v_stock_on_hand as
 SELECT origin,
    stream,
    license,
    lab_state,
    location,
    supplier,
    origin_license,
    packages,
    grams,
    pounds,
    oldest_days,
    oldest_packaged,
    strains,
    units,
    unit_of_measure,
    sold_by_weight,
    quantity_shown,
    'Not recorded'::text AS stock_status,
    /* APPENDED 17 Aug 2026. Fresh frozen is held at wet weight; every other stream is
       already dry. Owner ruling: 4.5:1, read from conversion_factors so it is never
       hardcoded here. */
    CASE
        WHEN stream = 'Fresh frozen'::text
          THEN round(pounds / NULLIF(public.f_rule('fresh_frozen_wet_to_dry'::text), 0), 1)
        ELSE pounds
    END AS pounds_dry_equivalent
   FROM ( WITH p AS (
                 SELECT p_1.license,
                    p_1.raw #>> '{Item,StrainName}'::text[] AS strain,
                    p_1.raw ->> 'LabTestingState'::text AS lab_state,
                    COALESCE(p_1.location, '(not recorded)'::text) AS location,
                    p_1.quantity,
                    p_1.raw ->> 'UnitOfMeasureName'::text AS uom,
                    f_is_weight(p_1.raw ->> 'UnitOfMeasureName'::text) AS is_weight,
                    f_to_pounds(p_1.quantity, p_1.raw ->> 'UnitOfMeasureName'::text) AS lb,
                    p_1.packaged_on,
                    p_1.tag,
                    p_1.raw ->> 'ItemFromFacilityLicenseNumber'::text AS origin_license,
                    p_1.raw ->> 'ReceivedFromFacilityName'::text AS received_from,
                    p_1.raw ->> 'ReceivedFromManifestNumber'::text AS manifest,
                        CASE
                            WHEN f_is_ours(p_1.raw ->> 'ItemFromFacilityLicenseNumber'::text) THEN 'Grown by us'::text
                            WHEN COALESCE(p_1.raw ->> 'ItemFromFacilityLicenseNumber'::text, ''::text) = ''::text THEN 'Origin not recorded'::text
                            ELSE 'Bought in'::text
                        END AS origin,
                        CASE
                            WHEN (p_1.raw #>> '{Item,ProductCategoryName}'::text[]) ~~* '%fresh frozen%'::text THEN 'Fresh frozen'::text
                            WHEN (p_1.raw #>> '{Item,ProductCategoryName}'::text[]) ~~* '%bud%'::text THEN 'Dried flower'::text
                            WHEN (p_1.raw #>> '{Item,ProductCategoryName}'::text[]) ~~* '%shake%'::text OR (p_1.raw #>> '{Item,ProductCategoryName}'::text[]) ~~* '%trim%'::text THEN 'Shake and trim'::text
                            WHEN (p_1.raw #>> '{Item,ProductCategoryName}'::text[]) ~~* '%concentrate%'::text THEN 'Concentrate'::text
                            WHEN (p_1.raw #>> '{Item,ProductCategoryName}'::text[]) ~~* '%roll%'::text THEN 'Pre-rolls'::text
                            WHEN (p_1.raw #>> '{Item,ProductCategoryName}'::text[]) ~~* '%vape%'::text THEN 'Vape'::text
                            ELSE COALESCE(p_1.raw #>> '{Item,ProductCategoryName}'::text[], '(uncategorised)'::text)
                        END AS stream
                   FROM metrc_packages p_1
                  WHERE COALESCE(p_1.quantity, 0::numeric) > 0::numeric AND COALESCE((p_1.raw ->> 'IsFinished'::text)::boolean, false) = false
                )
         SELECT p.origin,
            p.stream,
            p.license,
            p.lab_state,
            p.location,
            COALESCE(NULLIF(p.received_from, ''::text),
                CASE
                    WHEN p.origin = 'Grown by us'::text THEN 'Twisted Growers'::text
                    ELSE '(supplier not recorded)'::text
                END) AS supplier,
            p.origin_license,
            count(*) AS packages,
            round(sum(p.quantity) FILTER (WHERE lower(p.uom) = ANY (ARRAY['g'::text, 'grams'::text]))) AS grams,
            round(sum(p.lb), 1) AS pounds,
            max(CURRENT_DATE - p.packaged_on) AS oldest_days,
            min(p.packaged_on) AS oldest_packaged,
            count(DISTINCT p.strain) AS strains,
            round(sum(p.quantity) FILTER (WHERE NOT p.is_weight)) AS units,
            string_agg(DISTINCT p.uom, ', '::text) AS unit_of_measure,
            bool_and(p.is_weight) AS sold_by_weight,
                CASE
                    WHEN bool_and(p.is_weight) THEN round(sum(p.lb), 1)::text || ' lb'::text
                    ELSE (round(sum(p.quantity) FILTER (WHERE NOT p.is_weight))::text || ' '::text) || COALESCE(string_agg(DISTINCT p.uom, '/'::text) FILTER (WHERE NOT p.is_weight), 'units'::text)
                END AS quantity_shown
           FROM p
          GROUP BY p.origin, p.stream, p.license, p.lab_state, p.location, (COALESCE(NULLIF(p.received_from, ''::text),
                CASE
                    WHEN p.origin = 'Grown by us'::text THEN 'Twisted Growers'::text
                    ELSE '(supplier not recorded)'::text
                END)), p.origin_license
          ORDER BY (sum(p.quantity)) DESC) q;

comment on column public.v_stock_on_hand.pounds is
  'Physical weight as HELD. Fresh frozen is at wet weight here and that is correct — a '
  'wet pound is a pound when you are lifting it. For any figure that calls itself '
  'dry-equivalent use pounds_dry_equivalent instead.';

comment on column public.v_stock_on_hand.pounds_dry_equivalent is
  'Weight with fresh frozen converted at conversion_factors.fresh_frozen_wet_to_dry, '
  'ruled 4.5:1 by the owner on 17 Aug 2026 as the commercial indoor standard. Added '
  'because the Command Center tile "Total on hand, dry-equivalent" summed pounds and so '
  'carried 325.3 lb of water: fresh frozen 418.3 lb wet is 93.0 lb dry. Agent I.';

update public.tile_drill_contract
   set why_tolerance =
         'One pound absorbs float and rounding across 1,047 packages. It does NOT absorb '
         || 'the 325.3 lb of water, which is the point. RESOLVED IN PART 17 Aug 2026: the '
         || 'owner ruled 4.5:1 and conversion_factors already held 4.5, so the ratio was '
         || 'never the open question — the tile simply never applied it. v_stock_on_hand '
         || 'now exposes pounds_dry_equivalent (fresh frozen 418.3 wet -> 93.0 dry). This '
         || 'contract STAYS RED until the Command Center tile is pointed at that column, '
         || 'because until then the owner is still shown 2,489.1 and a green guard would '
         || 'be a lie. Front end change, Agent B.'
 where contract_key = 'cc.stock.dry_equivalent_honours_conversion';;
