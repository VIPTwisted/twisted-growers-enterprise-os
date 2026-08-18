/* v_stock_headline — the last view still double counting.
 *
 * The chain, followed one level at a time rather than guessed:
 *   v_stock_packages       1,308 -> 1,297   fixed
 *   v_stock_on_hand        1,308 -> 1,297   fixed
 *   v_onhand_by_room_stage 1,308 -> 1,297   fixed  (feeds v_room_board_complete)
 *   v_stock_summary                 969.3   correct, reads v_stock_on_hand
 *   mv_department_dashboard         971.8   still wrong after a refresh
 *   v_stock_headline                971.8   READS metrc_packages DIRECTLY, no de-dup
 *
 * The matview was refreshing correctly the whole time; it was faithfully reproducing a
 * source that was still wrong. Refreshing a cache over a bad number gives you a fresh bad
 * number, which is why the tile stayed at 971.8 through three refreshes.
 *
 * Same eleven tags, same rule, same reason: Metrc records both ends of a transfer between
 * our own MC and MP licences while it is in flight, with the same quantity on each side.
 * The accepted row wins, then the freshest.
 *
 * 2.5 lb of dried flower, and 9.5 lb across all streams.
 */

do $$
declare d text; v_before numeric; v_after numeric;
begin
  select round(dried_lb,1) into v_before from public.v_stock_headline;

  d := pg_get_viewdef('public.v_stock_headline'::regclass, true);

  if position('DISTINCT ON' in d) > 0 then
    raise exception 'v_stock_headline already de-duplicates. Refusing to double-apply.';
  end if;
  if position('FROM metrc_packages' in d) = 0 then
    raise exception 'Expected source not found in v_stock_headline. Refusing to guess.';
  end if;

  d := replace(d,
    'FROM metrc_packages',
    'FROM ( SELECT DISTINCT ON (mp.tag) mp.*
              FROM metrc_packages mp
             ORDER BY mp.tag, (mp.source_state = ''active''::text) DESC NULLS LAST,
                      mp.synced_at DESC NULLS LAST) metrc_packages');

  execute format('create or replace view public.v_stock_headline as %s', d);

  select round(dried_lb,1) into v_after from public.v_stock_headline;
  raise notice 'v_stock_headline dried_lb: % -> %', v_before, v_after;

  if v_after >= v_before then
    raise exception 'Did not de-duplicate (% -> %). Rolling back.', v_before, v_after;
  end if;
end $$;

comment on view public.v_stock_headline is
  'The split-stock headline. Source de-duplicated to ONE ROW PER TAG since 18 Aug 2026 — '
  'it read metrc_packages directly and counted the eleven cross-licence in-flight packages '
  'twice, which is why mv_department_dashboard kept reporting 971.8 dried flower through '
  'three refreshes while every other stock view had been corrected to 969.3. A refresh over '
  'a wrong source produces a fresh wrong number.';;
