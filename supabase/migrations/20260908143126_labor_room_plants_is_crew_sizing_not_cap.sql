-- GROK-WHY: Owner 8 Sep 2026 two-size rooms. 1150 is Labor Calculator B2 crew-sizing, not plant cap.
-- conversion_factors.room_capacity_f* already confirmed. Append-only keys.
-- Does not change f_rule('room_cycle_days')=56.

insert into conversion_factors (key, value, unit, label, what_it_means, where_it_came_from, set_by, evidence_status, evidence_note, note, updated_at)
values
('labor_room_plants', '1150', 'plants', 'Labor Calculator B2 — crew-sizing, NOT room cap',
 '1,150 is how many plants the crew is sized for. It is not F1/F3/F2/F4 plant capacity. Two sizes: LARGE 1140 (F1,F3) SMALL 1050 (F2,F4).',
 'Labor Calculator B2. Owner 8 Sep 2026 two-size rooms.',
 'owner-2026-09-08-two-size-rooms', 'confirmed',
 'Owner: WE HAVE TWO SIZE ROOMS. 1150 is crew-sizing.',
 'Do not overwrite room_capacity_f1..f4 with 1150.', now()),
('plants_per_table_large', '285', 'plants', 'Plants per table · LARGE rooms F1 F3',
 '1140 / 4 tables = 285. Not 287.5.',
 'Owner 8 Sep 2026 two-size rooms.',
 'owner-2026-09-08-two-size-rooms', 'confirmed', 'LARGE = F1 and F3.', '1140/4', now()),
('plants_per_table_small', '262.5', 'plants', 'Plants per table · SMALL rooms F2 F4',
 '1050 / 4 tables = 262.5. Integer policy grain on cult_cycle_policy rounds to 263.',
 'Owner 8 Sep 2026 two-size rooms.',
 'owner-2026-09-08-two-size-rooms', 'confirmed', 'SMALL = F2 and F4.', '1050/4', now())
on conflict (key) do update set
  value = excluded.value,
  note = excluded.note,
  updated_at = now();
