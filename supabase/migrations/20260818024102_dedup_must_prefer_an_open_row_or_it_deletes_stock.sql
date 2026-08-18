/* De-duplication must prefer an OPEN row, or it deletes stock.
 *
 * My previous migration wrapped metrc_packages in SELECT DISTINCT ON (tag) with NO filter
 * and left the view's own WHERE to run afterwards. For a tag holding both an open row and
 * a closed one, DISTINCT ON could pick the CLOSED row on the strength of its source_state
 * or sync time, and the outer WHERE then discarded the tag entirely.
 *
 * Dried flower fell to 954.0 against 969.3 everywhere else. 15.3 lb of real stock deleted
 * by my own fix. Caught by comparing against v_stock_summary in the very next query, which
 * is the only reason it did not stand.
 *
 * THE RULE: when de-duplicating AHEAD of a filter, the ordering must prefer a row that
 * will survive that filter. Otherwise de-duplication and filtering fight and quietly drop
 * records. The other three views were safe because their filter and their DISTINCT ON sit
 * at the same query level, so the filter runs first. Only this one wrapped an unfiltered
 * subquery.
 *
 * Order is now: prefer an OPEN package, then the accepted side of an internal transfer,
 * then the freshest sync. Guarded by an assertion on the resulting figure, so a wrong
 * answer rolls the migration back instead of shipping.
 */

do $$
declare d text; v numeric;
begin
  d := pg_get_viewdef('public.v_stock_headline'::regclass, true);

  if position('ORDER BY mp.tag, (mp.source_state' in d) = 0 then
    raise exception 'Expected ordering not found — it may already be corrected. Refusing to guess.';
  end if;

  d := replace(d,
    'ORDER BY mp.tag, (mp.source_state = ''active''::text)',
    'ORDER BY mp.tag,
                      (COALESCE(mp.quantity, 0::numeric) > 0::numeric
                       AND NOT COALESCE((mp.raw ->> ''IsFinished''::text)::boolean, false)) DESC,
                      (mp.source_state = ''active''::text)');

  execute format('create or replace view public.v_stock_headline as %s', d);

  select round(dried_lb,1) into v from public.v_stock_headline;
  raise notice 'v_stock_headline dried_lb now %', v;

  if v is null or v < 965 or v > 973 then
    raise exception 'dried_lb is % — expected about 969.3 to match v_stock_summary. Rolling back.', v;
  end if;
end $$;

comment on view public.v_stock_headline is
  'The split-stock headline. Source de-duplicated to ONE ROW PER TAG since 18 Aug 2026, '
  'preferring an OPEN package so de-duplication cannot fight the view''s own filter and '
  'drop stock — the first attempt did exactly that and lost 15.3 lb of dried flower. '
  'Eleven tags appear under both MC281714 and MP281909 while a transfer between our own '
  'licences is in flight; the accepted side wins, then the freshest sync.';;
