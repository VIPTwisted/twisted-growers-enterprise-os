/* The grams unround, exact-string edition — the earlier regexp guessed the
 * paren count wrong and matched nothing. grams is a machine column; the last
 * 1.3 g of per-group integer rounding dies here. */
do $$
declare def text;
begin
  perform set_config('search_path', 'public, pg_temp', true);
  def := regexp_replace(pg_get_viewdef('public.v_stock_on_hand'::regclass), ';\s*$', '');
  def := replace(def,
    'round(sum(p.quantity) FILTER (WHERE (lower(p.uom) = ANY (ARRAY[''g''::text, ''grams''::text])))) AS grams',
    'sum(p.quantity) FILTER (WHERE (lower(p.uom) = ANY (ARRAY[''g''::text, ''grams''::text]))) AS grams');
  execute 'create or replace view public.v_stock_on_hand as ' || def;
end $$;;
