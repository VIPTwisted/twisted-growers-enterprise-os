/* The first zero-tolerance truck drill FAILED ITS FIRST MEASUREMENT — correctly.
 * The subtraction form ("all intransit rows minus rows whose winner is not
 * intransit") double-counts a tag that carries TWO intransit rows: 442.5 vs the
 * tile's 442.0, and the 0.5 lb is exactly those second rows. A check that fails
 * for the right reason is a check worth keeping — but the formula was wrong, so
 * it is replaced, not tolerated.
 *
 * The drill now derives the identical canon (one surviving row per tag, counted
 * only when that row is intransit) through a DIFFERENT MECHANISM: GROUP BY tag
 * with ordered array_agg picking the winner, against the tile's DISTINCT ON.
 * Same ordering rules, independent implementation — a regression in either
 * dedup shows up as a gap. Live transfer data cannot supply a source-independent
 * weight (metrc_transfers carries no package weights, and the manual-first rule
 * forbids building on an unverified source), so mechanism-independence is the
 * honest second road available today. */

update tile_drill_contract set
  drill_sql = 'select round(sum(w.lb),1) from (select d.tag, (array_agg(f_to_pounds(d.quantity,d.uom) order by (coalesce(d.quantity,0) > 0 and not coalesce((d.raw->>''IsFinished'')::boolean,false)) desc, (d.source_state = ''active'') desc nulls last, d.synced_at desc nulls last))[1] as lb, (array_agg(d.source_state order by (coalesce(d.quantity,0) > 0 and not coalesce((d.raw->>''IsFinished'')::boolean,false)) desc, (d.source_state = ''active'') desc nulls last, d.synced_at desc nulls last))[1] as ss, (array_agg(coalesce(d.finished,false) order by (coalesce(d.quantity,0) > 0 and not coalesce((d.raw->>''IsFinished'')::boolean,false)) desc, (d.source_state = ''active'') desc nulls last, d.synced_at desc nulls last))[1] as fin from metrc_packages d group by d.tag) w where w.ss = ''intransit'' and not w.fin',
  why_tolerance = 'ZERO, 18 Aug 2026: tile picks the surviving row per tag with DISTINCT ON; the drill picks it with GROUP BY + ordered array_agg — same canon, independent mechanism, both proven 442.0. The first drill formula (subtraction form) was killed the same day it was written: it double-counted tags carrying two intransit rows and its own first measurement caught it at 442.5. No live transfer source carries package weights, so mechanism-independence is the second road until one does.'
where contract_key = 'dash.inventory.80.on_a_truck_right_now';;
