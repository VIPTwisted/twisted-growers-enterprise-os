/* Finish the one-row-per-tag fix across every stock view.
 *
 * De-duplicating v_stock_packages alone was a HALF FIX and it made things briefly worse:
 * tile-drill disagreements went from 10 to 12. That is the guard behaving correctly. One
 * view started reporting 1,297 while its neighbours still reported 1,308, so contracts
 * that had quietly agreed on a wrong number began to disagree on a right one.
 *
 * Newly surfaced by the half fix, and both real:
 *   cc.stock.packages_lb                        2,479.3 vs 2,488.8   the 9.5 lb the
 *                                                                     duplicate rows carried
 *   dash.command.1b.dried_flower_vs_its_real_drill  971.8 vs 969.4   the 2.4 lb of it
 *                                                                     that was dried flower
 *
 * MEASURED source of the duplication — it is in the base table, not the views:
 *   metrc_packages, open rows   1,308
 *   metrc_packages, distinct tags 1,297
 *   v_stock_packages   1,297  fixed
 *   v_stock_proof      1,297  already correct
 *   v_stock_on_hand    1,308  NOT fixed
 *   v_room_board_complete 1,308  NOT fixed
 *
 * The eleven tags each appear under both MC281714 and MP281909 with the same quantity —
 * one side intransit, one active — because Metrc records both ends of a transfer between
 * our own licences while it is in flight. Same rule as before: the accepted row wins, then
 * the freshest, per the owner ruling that in-transit is ours until the destination accepts.
 *
 * v_stock_on_hand has 118 dependents and every one of them has been double counting these
 * eleven packages. None of them needs to change; the column list is untouched.
 */

do $$
declare d text; n_before int; n_after int;
begin
  select sum(packages) into n_before from public.v_stock_on_hand;

  d := pg_get_viewdef('public.v_stock_on_hand'::regclass, true);

  if position('DISTINCT ON (p_1.tag)' in d) > 0 then
    raise exception 'v_stock_on_hand already de-duplicates. Refusing to double-apply.';
  end if;
  if position('SELECT p_1.license,' in d) = 0 then
    raise exception 'Expected inner CTE shape not found in v_stock_on_hand. Refusing to guess.';
  end if;

  /* One row per tag inside the CTE that reads metrc_packages. ORDER BY may reference
     columns of the underlying table even though the CTE does not select them. */
  d := replace(d, 'SELECT p_1.license,', 'SELECT DISTINCT ON (p_1.tag) p_1.license,');
  d := replace(d,
    'WHERE COALESCE(p_1.quantity, 0::numeric) > 0::numeric AND COALESCE((p_1.raw ->> ''IsFinished''::text)::boolean, false) = false',
    'WHERE COALESCE(p_1.quantity, 0::numeric) > 0::numeric AND COALESCE((p_1.raw ->> ''IsFinished''::text)::boolean, false) = false'
    || E'\n                  ORDER BY p_1.tag, (p_1.source_state = ''active''::text) DESC NULLS LAST, p_1.synced_at DESC NULLS LAST');

  execute format('create or replace view public.v_stock_on_hand as %s', d);

  select sum(packages) into n_after from public.v_stock_on_hand;
  raise notice 'v_stock_on_hand packages: % -> %', n_before, n_after;

  if n_after >= n_before then
    raise exception 'v_stock_on_hand did not de-duplicate (% -> %). Rolling back.', n_before, n_after;
  end if;
end $$;

comment on view public.v_stock_on_hand is
  'Stock on hand grouped by origin, stream, licence, lab state and location. ONE ROW PER '
  'TAG inside since 18 Aug 2026: eleven packages appeared twice because a transfer between '
  'our own MC and MP licences is recorded by Metrc on both sides at once, with the same '
  'quantity on each. The accepted row wins, then the freshest. 118 objects read this view '
  'and all of them were double counting those eleven. pounds is weight AS HELD; use '
  'pounds_dry_equivalent for anything calling itself dry.';;
