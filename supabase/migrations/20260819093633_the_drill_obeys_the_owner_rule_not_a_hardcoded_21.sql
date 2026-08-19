/* THE TILE SAID 19, THE DRILL SHOWED 23 — CAUGHT BY THE INDEPENDENT AUDITOR,
 * 19 Aug 2026, while confirming the tile itself.
 *
 * v_harvest_forensic hardcoded "> 21" for its OPEN TOO LONG verdict while the
 * tile counts against the owner rule harvest_open_max_days = 28. Four
 * harvests cut 27 Jul sit at 23 days: over the dead literal, under the real
 * rule. The owner clicks a figure of 19 and lands on 23 rows — exactly the
 * tile-to-drill mismatch he has been reporting, with a hardcoded number as
 * its cause. Rule B1 forbids the literal; this is what the literal costs.
 *
 * Both the verdict threshold and the severity branch now read f_rule(), so
 * the drill moves the day the owner changes his calendar. The 453.592 grams
 * literals are corrected to 453.59237 in the same pass (negligible in pounds,
 * but a second B1 breach the auditor named, and a constant that must have one
 * value everywhere). */

do $$
declare def text; invopt text;
begin
  perform set_config('search_path', 'public, pg_temp', true);
  select coalesce((select option_value from pg_options_to_table(c.reloptions) where option_name='security_invoker'),'false')
    into invopt from pg_class c where c.relname='v_harvest_forensic' and c.relnamespace='public'::regnamespace;

  def := regexp_replace(pg_get_viewdef('public.v_harvest_forensic'::regclass), ';\s*$', '');
  def := replace(def, '(CURRENT_DATE - h.harvest_start) > 21', '(CURRENT_DATE - h.harvest_start) > f_rule(''harvest_open_max_days'')');
  def := regexp_replace(def, '453\.592(?!37)', '453.59237', 'g');

  if position('> 21' in def) > 0 then
    raise exception 'a hardcoded 21 survived the replacement — refusing to ship a half-fixed drill';
  end if;

  execute 'create or replace view public.v_harvest_forensic as ' || def;
  execute 'alter view public.v_harvest_forensic set (security_invoker = '||invopt||')';
end $$;

insert into tile_drill_contract (contract_key, page, tile_label, tile_sql, drill_sql, tolerance, why_tolerance, registered_by)
values ('cult.open_too_long.tile_equals_drill', 'Cultivation',
        'Harvests open too long: the tile equals the rows its drill lists',
        'select count(*)::numeric from (select distinct on (name) name, raw->>''FinishedDate'' fd, harvest_start from metrc_harvests order by name, synced_at desc nulls last) h where h.fd is null and (current_date - h.harvest_start) > f_rule(''harvest_open_max_days'')',
        'select count(*)::numeric from v_harvest_issues where harvest_closed is null and total_days_start_to_now > f_rule(''harvest_open_max_days'')',
        0,
        'ZERO, 19 Aug 2026: the independent auditor found the tile counting against the owner rule (28 days) while the drill hardcoded 21 — 19 on the tile, 23 in the drill, four harvests cut 27 Jul sitting between the two numbers. Both roads now read f_rule and must agree exactly, forever.',
        'Agent I (auditor finding)')
on conflict (contract_key) do update set tile_sql=excluded.tile_sql, drill_sql=excluded.drill_sql, why_tolerance=excluded.why_tolerance;;
