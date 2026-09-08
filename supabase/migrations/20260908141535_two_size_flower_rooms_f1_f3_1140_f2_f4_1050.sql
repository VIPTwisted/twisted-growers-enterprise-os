-- GROK-WHY: Owner 8 Sep 2026: WE HAVE TWO SIZE ROOMS.
-- conversion_factors.room_capacity_f1..f4 already MATCHED standing orders
-- (F1/F3 1140 LARGE, F2/F4 1050 SMALL, owner confirmed 7 Aug 2026).
-- grow_rooms.plant_capacity was 1150 on all four — Labor Calculator B2 crew-sizing, not cap.
-- cult_cycle_policy.target_plants was NULL so v_xq_room_short could not fire.
-- Applied in prod as two_size_flower_rooms_f1_f3_1140_f2_f4_1050.
-- Does not change f_rule('room_cycle_days')=56. Does not rewrite ledger rows.
-- Calendar original-rows F3=950 is a named stale exception; live F3 flowering 1140 MATCHES LARGE.

UPDATE grow_rooms SET
  plant_capacity = CASE code
    WHEN 'F1' THEN 1140
    WHEN 'F2' THEN 1050
    WHEN 'F3' THEN 1140
    WHEN 'F4' THEN 1050
  END,
  plants_per_table = CASE code
    WHEN 'F1' THEN 285
    WHEN 'F2' THEN 262.5
    WHEN 'F3' THEN 285
    WHEN 'F4' THEN 262.5
  END,
  notes = CASE code
    WHEN 'F1' THEN 'LARGE. 1,140 plants · 4 tables × 285. Owner 8 Sep 2026 two-size rooms. 1,150 is labor calculator, not cap. MATCH conversion_factors.room_capacity_f1.'
    WHEN 'F2' THEN 'SMALL. 1,050 plants · 4 tables × 262.5. Owner 8 Sep 2026 two-size rooms. 1,150 is labor calculator, not cap. MATCH conversion_factors.room_capacity_f2.'
    WHEN 'F3' THEN 'LARGE. 1,140 plants · 4 tables × 285. Owner 8 Sep 2026 two-size rooms. Calendar original-rows 950 is stale. Live flowering 1,140 MATCHES LARGE. MATCH conversion_factors.room_capacity_f3.'
    WHEN 'F4' THEN 'SMALL. 1,050 plants · 4 tables × 262.5. Owner 8 Sep 2026 two-size rooms. 1,150 is labor calculator, not cap. MATCH conversion_factors.room_capacity_f4.'
  END,
  updated_at = now()
WHERE code IN ('F1','F2','F3','F4');

UPDATE cult_cycle_policy SET
  target_plants = CASE room_key
    WHEN 'F1' THEN 1140
    WHEN 'F2' THEN 1050
    WHEN 'F3' THEN 1140
    WHEN 'F4' THEN 1050
  END,
  max_plants = CASE room_key
    WHEN 'F1' THEN 1140
    WHEN 'F2' THEN 1050
    WHEN 'F3' THEN 1140
    WHEN 'F4' THEN 1050
  END,
  tables_in_room = 4,
  plants_per_table = CASE room_key
    WHEN 'F1' THEN 285
    WHEN 'F2' THEN 262.5
    WHEN 'F3' THEN 285
    WHEN 'F4' THEN 262.5
  END,
  note = CASE room_key
    WHEN 'F1' THEN 'LARGE 1140. Owner 8 Sep 2026 two-size rooms. Short queue can fire. MATCH conversion_factors.room_capacity_f1.'
    WHEN 'F2' THEN 'SMALL 1050. Owner 8 Sep 2026 two-size rooms. Short queue can fire. MATCH conversion_factors.room_capacity_f2.'
    WHEN 'F3' THEN 'LARGE 1140. Owner 8 Sep 2026 two-size rooms. Calendar 950 is stale. MATCH conversion_factors.room_capacity_f3.'
    WHEN 'F4' THEN 'SMALL 1050. Owner 8 Sep 2026 two-size rooms. Short queue can fire. MATCH conversion_factors.room_capacity_f4.'
  END,
  updated_at = now(),
  updated_by = 'owner-2026-09-08-two-size-rooms'
WHERE room_key IN ('F1','F2','F3','F4');
