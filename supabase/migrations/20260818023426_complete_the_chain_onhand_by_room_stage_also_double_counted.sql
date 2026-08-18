/* Complete the chain: v_onhand_by_room_stage also double counted.
 *
 * v_room_board_complete reports tags_held by summing v_onhand_by_room_stage, which
 * aggregates metrc_packages directly with GROUP BY and count(*). The eleven cross-licence
 * tags are counted once on each side, so the room board reported 1,308 while
 * v_stock_packages, v_stock_proof and v_stock_on_hand had all been corrected to 1,297.
 *
 * Because this view aggregates, DISTINCT ON cannot sit at the top as it did in the others
 * — it has to de-duplicate the SOURCE before the grouping happens. Same rule: the accepted
 * row wins, then the freshest, per the owner ruling that in-transit is ours until the
 * destination accepts.
 *
 * The outer WHERE is left in place. It is already satisfied by the subquery and removing
 * it would be an unnecessary edit to a view with 23 dependents.
 *
 * THE PATTERN, now visible across four views: any view reading metrc_packages for on-hand
 * stock must de-duplicate by tag, because Metrc legitimately records both ends of an
 * internal transfer at once. Three did not. A sweep for any remaining offender follows
 * this migration rather than being assumed complete.
 */

do $$
declare d text; n_before numeric; n_after numeric;
begin
  select sum(tags) into n_before from public.v_onhand_by_room_stage;

  d := pg_get_viewdef('public.v_onhand_by_room_stage'::regclass, true);

  if position('DISTINCT ON (tag)' in d) > 0 then
    raise exception 'v_onhand_by_room_stage already de-duplicates. Refusing to double-apply.';
  end if;
  if position('FROM metrc_packages p' in d) = 0 then
    raise exception 'Expected source not found in v_onhand_by_room_stage. Refusing to guess.';
  end if;

  d := replace(d,
    'FROM metrc_packages p',
    'FROM ( SELECT DISTINCT ON (mp.tag) mp.*
              FROM metrc_packages mp
             WHERE COALESCE((mp.raw ->> ''Quantity''::text)::numeric, 0::numeric) > 0::numeric
               AND COALESCE((mp.raw ->> ''IsFinished''::text)::boolean, false) = false
             ORDER BY mp.tag, (mp.source_state = ''active''::text) DESC NULLS LAST,
                      mp.synced_at DESC NULLS LAST) p');

  execute format('create or replace view public.v_onhand_by_room_stage as %s', d);

  select sum(tags) into n_after from public.v_onhand_by_room_stage;
  raise notice 'v_onhand_by_room_stage tags: % -> %', n_before, n_after;

  if n_after >= n_before then
    raise exception 'Did not de-duplicate (% -> %). Rolling back.', n_before, n_after;
  end if;
end $$;

comment on view public.v_onhand_by_room_stage is
  'On-hand stock by room and stage. Source de-duplicated to ONE ROW PER TAG since '
  '18 Aug 2026 — eleven packages appear under both MC281714 and MP281909 while a transfer '
  'between our own licences is in flight, and count(*) was counting each of them twice. '
  'Feeds v_room_board_complete, which reported 1,308 tags against 1,297 everywhere else. '
  '23 objects read this view.';;
