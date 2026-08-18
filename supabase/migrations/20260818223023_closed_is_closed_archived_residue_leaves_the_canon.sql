/* CLOSED IS CLOSED — 61.9 lb of archived bookkeeping residue leaves live stock.
 *
 * The owner asked the right question: why ask HIM about the 26 state-conflict
 * packages instead of pulling the record? Pulling the record answered it:
 * every one of the 26 carries a Metrc ArchivedDate (Apr 2024 - Jul 2026), none
 * ever shipped, none was ever sold. They are packages STAFF CLOSED IN METRC
 * with a residual quantity frozen on them at closure — history, not shelf
 * stock. And the proof the marker cuts cleanly: ZERO closure markers on all
 * 571 active and 798 in-transit live packages.
 *
 * The defect was OURS: every liveness filter in the stock family tested
 * quantity and IsFinished but never the archive marker, because the typed
 * `finished` flag stays false on archived packages. Liveness now also requires
 * the surviving row to be in Metrc's own live lists (active/onhold/intransit)
 * — Metrc's partition, not an invented one. Applied to v_stock_packages,
 * v_stock_on_hand, v_stock_headline, v_stock_ageing, the locator, and every
 * contract drill, so tile and drill move together and the ratchet of
 * zero-tolerance contracts re-proves the new canon immediately.
 *
 * The locator's State conflict category now catches only GENUINE anomalies
 * (live quantity, no live state, no closure marker) — empty today, standing
 * watch for tomorrow. No Metrc entry is needed from anyone: archived packages
 * are already closed in the regulator's record. */

do $$
declare def text; v text;
begin
  perform set_config('search_path', 'public, pg_temp', true);

  foreach v in array array['v_stock_packages','v_stock_on_hand'] loop
    def := regexp_replace(pg_get_viewdef(('public.' || v)::regclass), ';\s*$', '');
    def := regexp_replace(def,
      '> \(0\)::numeric\) AND \(COALESCE\(\(\((\w+)\.raw ->> ''IsFinished''::text\)\)::boolean, false\) = false\)\)',
      '> (0)::numeric) AND (COALESCE(((\1.raw ->> ''IsFinished''::text))::boolean, false) = false) AND (\1.source_state = ANY (ARRAY[''active''::text, ''onhold''::text, ''intransit''::text])))',
      'g');
    execute 'create or replace view public.' || v || ' as ' || def;
  end loop;

  def := regexp_replace(pg_get_viewdef('public.v_stock_headline'::regclass), ';\s*$', '');
  def := regexp_replace(def,
    'WHERE \(\(NOT COALESCE\(\(\((\w+)\.raw ->> ''IsFinished''::text\)\)::boolean, false\)\) AND ',
    'WHERE ((\1.source_state = ANY (ARRAY[''active''::text, ''onhold''::text, ''intransit''::text])) AND (NOT COALESCE(((\1.raw ->> ''IsFinished''::text))::boolean, false)) AND ',
    'g');
  execute 'create or replace view public.v_stock_headline as ' || def;

  def := regexp_replace(pg_get_viewdef('public.v_stock_ageing'::regclass), ';\s*$', '');
  def := regexp_replace(def,
    'AND \(COALESCE\(p\.finished, false\) = false\)\)',
    'AND (COALESCE(p.finished, false) = false) AND (p.source_state = ANY (ARRAY[''active''::text, ''onhold''::text, ''intransit''::text])))',
    'g');
  execute 'create or replace view public.v_stock_ageing as ' || def;

  /* Locator: the State conflict branch keeps watching, but archived-with-residue
     is closed history, not a conflict. */
  def := regexp_replace(pg_get_viewdef('public.v_inventory_locator'::regclass), ';\s*$', '');
  def := replace(def,
    '(p.source_state <> ALL (ARRAY[''active''::text, ''onhold''::text, ''intransit''::text]))
         AND (COALESCE(p.quantity, (0)::numeric) > (0)::numeric)
         AND (COALESCE(p.finished, false) = false)',
    '(p.source_state <> ALL (ARRAY[''active''::text, ''onhold''::text, ''intransit''::text]))
         AND (COALESCE(p.quantity, (0)::numeric) > (0)::numeric)
         AND (COALESCE(p.finished, false) = false)
         AND ((p.raw ->> ''ArchivedDate'') IS NULL) AND ((p.raw ->> ''FinishedDate'') IS NULL)');
  execute 'create or replace view public.v_inventory_locator as ' || def;
end $$;

update tile_drill_contract
   set drill_sql = replace(drill_sql,
       'coalesce(mp.finished,false)=false',
       'coalesce(mp.finished,false)=false and mp.source_state in (''active'',''onhold'',''intransit'')')
 where drill_sql like '%coalesce(mp.finished,false)=false%';

refresh materialized view mv_dept_dash_supplement;;
