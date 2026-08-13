-- Agent B, 13 Aug 2026. Command Center tiles that carried no contract.
--
-- Owner gating order: the Command Center is not finished until every tile
-- reconciles to the rows its own drill opens. These five tiles were on screen
-- with nothing comparing them to their drill.
--
-- Nothing here changes a figure. Each row records what the tile CLAIMS and an
-- INDEPENDENT derivation of the same population, so tg_check_tile_drill can
-- prove or refute the claim on every run.

insert into tile_drill_contract
  (contract_key, page, tile_label, tile_sql, drill_sql, tolerance, why_tolerance, registered_by)
values

-- 1. The split headline, dried half. Owner ruling 12 Aug 2026 "AGREE SPLIT
--    THIS". The published tile is now dried-only; the drill the reader reaches
--    is the stock-by-stream evidence. Derived from a DIFFERENT view with a
--    different grouping (stream, not Metrc product category) so the two are
--    genuinely independent.
('cc.stock.dried_lb', 'Command Center',
 'Key figure — dried flower on hand',
 $$select value from mv_department_dashboard where department='Command' and kpi='Dried flower on hand'$$,
 $$select round(sum(total_lb),1) from v_stock_summary where stream <> 'Fresh frozen'$$,
 0.2,
 'Two independent roundings compose: v_stock_headline rounds one sum, v_stock_summary rounds per stream and this adds the rounded parts. 0.2 lb absorbs that and nothing else. Measured 13 Aug 2026: 2041.3 against 2041.4.',
 'Agent B'),

-- 2. The split headline, fresh frozen half. This is the figure the owner asked
--    to see beside the dried one and it now renders on the same tile, with its
--    own drill: two figures that are never added must not reconcile to one set
--    of rows. The drill lists v_stock_proof rows for the stream, so the drill
--    SQL is literally the sum of what the reader sees.
('cc.stock.fresh_frozen_lb', 'Command Center',
 'Key figure — fresh frozen on hand, wet weight',
 $$select fresh_frozen_wet_lb from v_stock_headline$$,
 $$select round(sum(pounds),1) from v_stock_proof where stream = 'Fresh frozen'$$,
 0.2,
 'v_stock_headline selects fresh frozen by Metrc product category; the drill selects it by stream. The page matches the two by stream name, and this contract is what proves that match rather than assuming it. If the stream is ever renamed the drill empties and the verdict says ONE SIDE EMPTY.',
 'Agent B'),

-- 3. People band, zones below their required headcount.
('cc.people.zones_below_requirement', 'Command Center',
 'People — zones below their required headcount',
 $$select count(*)::numeric from v_zone_now where coalesce(variance,0) < 0$$,
 $$select count(distinct zone_id)::numeric from v_zone_staffing where coalesce(sched_vs_required,0) < 0$$,
 0,
 'Both sides read zero today because the zones register is empty, and the tile says that in words rather than printing a reassuring zero. The contract is registered now so the day a zone and a requirement exist, the tile and the staffing detail it opens are already under test.',
 'Agent B'),

-- 4. THE ONE FIXED SENTENCE ON THE PAGE. The People band prints "none posted"
--    as prose, not as a served count, because both registers behind a posted
--    shift are empty. The moment anybody posts a shift that sentence becomes
--    false and nothing on the page would notice. This contract is the only
--    thing that would.
('cc.people.shifts_posted_claim', 'Command Center',
 'People — the band''s fixed claim that no shift is posted for today',
 $$select 0::numeric$$,
 $$select ((select count(*) from schedule_assignments) + (select count(*) from employee_schedules))::numeric$$,
 0,
 'NOT a tolerance question. The tile side is the literal claim the page makes in prose; the drill side is the live count of the two registers behind it. They agree only while both registers are empty. First row posted, this fires and the sentence gets replaced by a served figure.',
 'Agent B'),

-- 5. EXPLAINS THE STANDING cc.stock.tags DISAGREEMENT rather than widening it.
--    Measured 13 Aug 2026: v_stock_packages holds 1,118 rows over 1,109
--    distinct tags. Exactly 9 tags appear under TWO licence/room combinations
--    — the cross-licence tag the house rules already document. The ratchet may
--    fall, never rise, so cc.stock.tags keeps its zero tolerance and keeps
--    reading DISAGREE; this contract proves the whole of the gap is that
--    duplication and nothing else is hiding inside it.
('cc.stock.tags_gap_is_cross_licence', 'Command Center',
 'CROSS-CHECK — is the whole tags-on-hand gap the cross-licence duplication, and nothing else',
 $$select (select sum(tags_held)::numeric from v_room_board_complete)
        - (select count(distinct package_tag)::numeric from v_stock_packages)$$,
 $$select coalesce(sum(n-1),0)::numeric from (select package_tag, count(*) n from v_stock_packages group by 1 having count(*) > 1) x$$,
 0,
 'AGREE here means the 9-tag gap on cc.stock.tags is fully accounted for by tags carried under both licences, which is a known Metrc condition and not a counting error. DISAGREE here would mean something else is also being counted twice, and that would be a new finding.',
 'Agent B')

on conflict (contract_key) do update set
  page = excluded.page,
  tile_label = excluded.tile_label,
  tile_sql = excluded.tile_sql,
  drill_sql = excluded.drill_sql,
  tolerance = excluded.tolerance,
  why_tolerance = excluded.why_tolerance,
  registered_by = excluded.registered_by;
