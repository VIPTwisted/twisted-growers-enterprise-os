/* THE CLEANUP PASS THE WATCHER ORDERED — three misses from closed-is-closed.
 *
 * 1. TWO POUND CONSTANTS. f_to_pounds divided grams by 453.592 while the tile
 *    arithmetic divides by the exact avoirdupois 453.59237. A hair per package
 *    — but across 965,000 sellable grams it parked the sum on a rounding
 *    boundary and the zero-tolerance sellable contract flipped: 2126.9 vs
 *    2126.8. One constant now, the exact one, in the ONE conversion function.
 *
 * 2. THE LOCATOR EDIT MISSED (literal whitespace). Now regexp-applied to all
 *    three package branches: every branch requires no closure marker, so the
 *    State conflict category empties of archived residue and stands watch for
 *    genuine anomalies only.
 *
 * 3. THE AGEING DRILL spells its liveness filter `not coalesce(...)` and the
 *    text update missed it; it now carries the same state guard as its tile —
 *    which correctly dropped to 18.1 lb when 2.7 lb of the stale set turned
 *    out to be archived residue. */

create or replace function public.f_to_pounds(qty numeric, uom text)
returns numeric
language sql immutable parallel safe
set search_path to 'public', 'pg_temp'
as $$
  select case lower(coalesce(uom,''))
    when 'g' then qty / 453.59237
    when 'grams' then qty / 453.59237
    when 'kg' then qty * 2.2046226218
    when 'kilograms' then qty * 2.2046226218
    when 'mg' then qty / 453592.37
    when 'oz' then qty / 16.0
    when 'ounces' then qty / 16.0
    when 'lb' then qty
    when 'lbs' then qty
    when 'pounds' then qty
    else null            -- 'ea', 'each', anything countable: NOT a weight
  end $$;

comment on function public.f_to_pounds(numeric, text) is
  'THE unit conversion — the only pound constant in the house, 453.59237 exact. Was 453.592 '
  'until 18 Aug 2026, when the zero-tolerance sellable contract caught the two constants '
  'straddling a rounding boundary. Countables return null by design.';

do $$
declare def text;
begin
  perform set_config('search_path', 'public, pg_temp', true);
  def := regexp_replace(pg_get_viewdef('public.v_inventory_locator'::regclass), ';\s*$', '');
  def := regexp_replace(def,
    'AND \(COALESCE\(p\.finished, false\) = false\)\)',
    'AND (COALESCE(p.finished, false) = false) AND ((p.raw ->> ''ArchivedDate''::text) IS NULL) AND ((p.raw ->> ''FinishedDate''::text) IS NULL))',
    'g');
  execute 'create or replace view public.v_inventory_locator as ' || def;
end $$;

update tile_drill_contract
   set drill_sql = replace(drill_sql,
       'and not coalesce(mp.finished,false)',
       'and not coalesce(mp.finished,false) and mp.source_state in (''active'',''onhold'',''intransit'')')
 where drill_sql like '%and not coalesce(mp.finished,false)%'
   and drill_sql not like '%mp.source_state in (''active'',''onhold'',''intransit'')%';;
