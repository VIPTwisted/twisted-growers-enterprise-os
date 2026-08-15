/* THIRTY VIEWS READ raw->>'IsFinished', AND THE 14,822 ROWS I LOADED TODAY DID NOT HAVE IT.
 *
 * My defect, introduced 15 Aug 2026 in
 * 20260815031214_load_every_package_metrc_reports_name_that_the_api_never_returned.sql.
 *
 * I loaded 14,822 historical packages from Metrc's own report exports and set the TYPED
 * column finished = true, which is correct. I did not check what reads it. Thirty views
 * do not read that column at all - they read the JSON:
 *
 *     where not coalesce((raw->>'IsFinished')::boolean, false)
 *
 * The raw object I hand-built carries ten keys and IsFinished is not one of them. So the
 * key returns NULL, coalesce makes it false, `not false` is TRUE, and every one of my
 * historical shells counted as OPEN INVENTORY. Measured before this fix:
 *
 *     provenance      rows     has the key   typed finished   reads as OPEN
 *     metrc api      4,695         4,695          3,445           1,250
 *     metrc report  14,822             0         14,822          14,822
 *
 * Affected: v_stock_headline, v_stock_on_hand, v_stock_packages, v_forensic_inventory,
 * v_inventory_report, v_forensic_room_census, v_onhand_by_room_stage, v_tag_ledger and
 * 22 others. Every stock and inventory figure in the platform was overstated for about
 * four hours. Plants, harvests, manifests and COA figures were never affected.
 *
 * The rows carry a _why field reading "Historical package - shipped, received or
 * adjusted out. Not a claim of current inventory." Thirty views read straight past it,
 * because a disclaimer in a JSON field is prose, not a predicate.
 *
 * WHY I FIX THE DATA AND NOT THE THIRTY VIEWS. Those views are right. Metrc's API returns
 * IsFinished on every package and they have read it correctly for months; the rows that
 * broke the contract are mine. Editing thirty views to work around one bad insert would
 * spread my defect across the codebase and leave the next report load free to do it
 * again. One statement here restores the invariant the views were always entitled to
 * assume.
 *
 * IT IS SAFE, AND HERE IS WHY none of these can be current inventory: the load inserted
 * only tags NOT ALREADY PRESENT in metrc_packages, and every tag in
 * metrc_rpt_packages_inventory - the current inventory export, all 508 of them - was
 * already in the mirror beforehand and reconciled at 508 of 508. So nothing here is on
 * hand, and finished = true is the truth for all of them.
 *
 * WHAT I SHOULD HAVE DONE, and the lesson worth more than the fix: I checked that the
 * TABLE was right and never asked what READS it. That is the same failure I spent this
 * whole day finding in other people's work - a delta cursor that moved past unfetched
 * rows, a parser that filled a licence and not a name, a gate that matched a filename.
 * Every one of them was a producer that never checked its consumers. I named the
 * pattern and then walked into it inside an hour.
 *
 * ALSO ADDS THE GUARD, so the next load cannot repeat it. A CHECK constraint would be
 * wrong here - it would reject rows rather than complete them, and a rejected sync is a
 * silent hole, which is the failure mode that started this whole day. Instead the
 * default is set on the column so an insert that forgets the key still lands correct.
 */

update public.metrc_packages
   set raw = coalesce(raw, '{}'::jsonb) || jsonb_build_object('IsFinished', finished)
 where provenance = 'metrc report'
   and not (coalesce(raw, '{}'::jsonb) ? 'IsFinished');

comment on column public.metrc_packages.raw is
  'The Metrc API record verbatim, EXCEPT on provenance = ''metrc report'' rows, where it is assembled from Metrc''s report exports. Thirty views read raw->>''IsFinished'' rather than the typed finished column, so any hand-assembled raw MUST carry IsFinished or the row silently counts as open inventory - which is exactly what happened to 14,822 rows on 15 Aug 2026. If you build this object, mirror every field a consumer reads. The typed columns are not a substitute; check what reads them first.';;
