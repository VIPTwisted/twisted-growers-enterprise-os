/* v_stock_on_hand joins the canon exactly.
 *
 * Two residual defects found by chasing a 1.3-GRAM disagreement the
 * zero-tolerance sellable contract refused to let go of:
 *   - grams was round(sum(...)) per group — integer grams, 73 groups, enough
 *     accumulated hair to park a sum on a rounding boundary. grams is a
 *     machine column (pages display pounds), so it is now exact.
 *   - the inner dedup ordered by active-first/freshest only, missing the
 *     canonical liveness-first key — a tag with a dead newer row could pick a
 *     different survivor than every other stock surface. Now canonical. */
do $$
declare def text;
begin
  perform set_config('search_path', 'public, pg_temp', true);
  def := regexp_replace(pg_get_viewdef('public.v_stock_on_hand'::regclass), ';\s*$', '');
  def := regexp_replace(def,
    'round\((sum\(p\.quantity\) FILTER \(WHERE \(lower\(p\.uom\) = ANY \(ARRAY\[''g''::text, ''grams''::text\]\)\)\)\))\)',
    '\1');
  def := replace(def,
    'ORDER BY p_1.tag, (p_1.source_state = ''active''::text) DESC NULLS LAST, p_1.synced_at DESC NULLS LAST',
    'ORDER BY p_1.tag, (COALESCE(p_1.quantity, (0)::numeric) > (0)::numeric AND NOT COALESCE(((p_1.raw ->> ''IsFinished''::text))::boolean, false)) DESC, (p_1.source_state = ''active''::text) DESC NULLS LAST, p_1.synced_at DESC NULLS LAST');
  execute 'create or replace view public.v_stock_on_hand as ' || def;
end $$;;
