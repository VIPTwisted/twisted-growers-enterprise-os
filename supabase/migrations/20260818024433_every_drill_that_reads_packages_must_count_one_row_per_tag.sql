/* Every drill that reads metrc_packages must count one row per tag.
 *
 * Four stock views were corrected today to stop counting the eleven cross-licence
 * in-flight packages twice. The tile-drill disagreement count then went UP, from 10 to 13,
 * and the reason is visible in the numbers: the drills still returned the OLD figures —
 * 2,145.8, 2,488.8, 555.1, 806.0, 971.8 — because the drill SQL in the contracts reads
 * metrc_packages DIRECTLY, not through any of the views that were fixed.
 *
 * 25 contracts do this. Only 10 of them are currently flagged. The other 15 AGREE — on a
 * double-counted number, because their tile carries the same duplication. An agreement
 * between two wrong figures is the most dangerous state a check can be in, and it is
 * exactly what this guard exists to break.
 *
 * So the drills are corrected wholesale rather than one at a time. The drill is the audit
 * side: it re-derives the tile from the underlying rows, and it has to be right even when
 * that makes a previously green contract go red. Anything that disagrees after this is a
 * genuinely wrong tile and can be dealt with on its merits.
 *
 * dash.inventory.81.cross_licence_tags is EXCLUDED. It exists to measure the duplication
 * itself; de-duplicating its drill would make it always return zero and it would stop
 * being able to see the thing it was written to watch.
 *
 * The de-duplication prefers an OPEN package first — a lesson from earlier tonight, when
 * ordering only on state and sync time let a closed row win and deleted 15.3 lb of dried
 * flower from v_stock_headline before the next query caught it.
 */

update public.tile_drill_contract
   set drill_sql = replace(drill_sql,
         'from metrc_packages mp',
         'from (select distinct on (d.tag) d.* from metrc_packages d '
         || 'order by d.tag, '
         || '(coalesce(d.quantity,0) > 0 and not coalesce((d.raw->>''IsFinished'')::boolean,false)) desc, '
         || '(d.source_state = ''active'') desc nulls last, '
         || 'd.synced_at desc nulls last) mp'),
       why_tolerance = coalesce(why_tolerance || ' | ', '')
         || 'Drill de-duplicated to one row per tag on 18 Aug 2026: eleven packages appear '
         || 'under both MC281714 and MP281909 while an internal transfer is in flight, and '
         || 'this drill was counting each of them twice.'
 where drill_sql ilike '%from metrc_packages mp%'
   and contract_key <> 'dash.inventory.81.cross_licence_tags';

update public.tile_drill_contract
   set drill_sql = replace(drill_sql,
         'from metrc_packages where',
         'from (select distinct on (d.tag) d.* from metrc_packages d '
         || 'order by d.tag, '
         || '(coalesce(d.quantity,0) > 0 and not coalesce((d.raw->>''IsFinished'')::boolean,false)) desc, '
         || '(d.source_state = ''active'') desc nulls last, '
         || 'd.synced_at desc nulls last) metrc_packages where'),
       why_tolerance = coalesce(why_tolerance || ' | ', '')
         || 'Drill de-duplicated to one row per tag on 18 Aug 2026, same reason.'
 where drill_sql ilike '%from metrc_packages where%';;
