/* COUNTED ITEMS STOP VANISHING ON TRUCKS — page 5 of the Inventory build.
 *
 * v_countable_inventory listed 131 of the 243 live countable packages: its
 * filter stopped at active/onhold, so the 112 countable packages currently ON
 * TRANSFERS (6,728 units) appeared nowhere — the auditor's exact trap-6
 * warning ("a counted item publishing as nothing"). Its dedup also ordered by
 * licence — arbitrary — instead of the canonical survivor rule.
 *
 * Now: canonical dedup, all three live states covered (the state column was
 * already exposed so the page can show what is on a truck), and a
 * zero-tolerance contract holds the view's unit total to the package
 * primitive's unit total — two roads, every live unit, forever.
 *
 * v_third_party_stock gains an exact grams column (appended, rule E1) so page
 * totals can be built from exact mass instead of summing per-group rounded
 * pounds — the 799.2-vs-799.1 hair between the page and the Bought-in tile. */

create or replace view public.v_countable_inventory as
 SELECT tag AS package_tag,
    "left"(item_name, 55) AS item_name,
    license,
    uom AS unit_of_measure,
    quantity AS units,
    f_quantity_text(quantity, uom) AS how_much,
    source_state,
    (raw ->> 'LocationName'::text) AS location,
    (raw ->> 'ItemFromFacilityName'::text) AS item_defined_by,
    f_is_weight(uom) AS is_weight_based,
    'THE ISSUE: this item is counted, not weighed. Any figure built on pounds alone excludes it entirely and the total will be wrong without saying so.'::text AS what_is_wrong,
    'Report units and pounds SEPARATELY, or use f_quantity_text(). Never publish a row with no quantity on it, and never add units to pounds.'::text AS what_to_do
   FROM ( SELECT DISTINCT ON (d.tag) d.tag,
            d.item_name,
            d.license,
            d.uom,
            d.quantity,
            d.source_state,
            d.raw
           FROM metrc_packages d
          ORDER BY d.tag, (COALESCE(d.quantity,0) > 0 AND NOT COALESCE((d.raw->>'IsFinished')::boolean,false)) DESC,
                   (d.source_state = 'active') DESC NULLS LAST, d.synced_at DESC NULLS LAST) p
  WHERE ((NOT f_is_weight(uom)) AND (source_state = ANY (ARRAY['active'::text, 'onhold'::text, 'intransit'::text])) AND (COALESCE(quantity, (0)::numeric) > (0)::numeric));

do $$
declare def text;
begin
  perform set_config('search_path', 'public, pg_temp', true);
  if not exists (select 1 from information_schema.columns where table_name='v_third_party_stock' and column_name='grams') then
    def := regexp_replace(pg_get_viewdef('public.v_third_party_stock'::regclass), ';\s*$', '');
    def := replace(def, 'oldest_packaged AS oldest_packaged_date',
                        'oldest_packaged AS oldest_packaged_date,
    grams');
    def := replace(def, 'v_stock_on_hand.oldest_days,',
                        'v_stock_on_hand.oldest_days,
            v_stock_on_hand.grams,');
    execute 'create or replace view public.v_third_party_stock as ' || def;
  end if;
end $$;

insert into tile_drill_contract (contract_key, page, tile_label, tile_sql, drill_sql, tolerance, why_tolerance, registered_by)
values ('inv.countables.covers_every_live_unit', 'Inventory',
        'Every live counted unit appears on the countables page',
        'select coalesce(sum(units),0) from v_countable_inventory',
        'select coalesce(sum(units),0) from v_stock_packages where not sold_by_weight',
        0,
        'ZERO, 18 Aug 2026: the countables page must carry every live counted unit, including material on transfers — it silently dropped the 112 countable packages (6,728 units) in transit until today, the exact trap the auditor flagged: a counted item publishing as nothing. Two roads: the page''s own dedup of the raw mirror vs the package primitive.',
        'Agent I')
on conflict (contract_key) do update set tile_sql=excluded.tile_sql, drill_sql=excluded.drill_sql, tolerance=excluded.tolerance, why_tolerance=excluded.why_tolerance;;
