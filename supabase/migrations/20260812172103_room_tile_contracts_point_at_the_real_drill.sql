-- Agent I, 12 Aug 2026. DBI-066.
-- The first room contracts compared the tile to metrc_plants. Correct, but not what the USER
-- opens. These compare the tile to v_room_plants_drill - the exact rows the drill renders - so
-- the contract fails if the drill drifts from the tile for ANY reason, including a filter change
-- in the drill itself. Plus the two rooms that were missing from the board entirely: Mother
-- (33 standing plants, shown nowhere) and Veg A.

insert into tile_drill_contract (contract_key, page, tile_label, tile_sql, drill_sql, tolerance) values
('cc.room.F1.plants','Command Center','F1 — plants standing',
 'select plants_now from v_room_board_complete where room=''F1''',
 'select count(*)::numeric from v_room_plants_drill where room=''F1''',0),
('cc.room.F2.plants','Command Center','F2 — plants standing',
 'select plants_now from v_room_board_complete where room=''F2''',
 'select count(*)::numeric from v_room_plants_drill where room=''F2''',0),
('cc.room.F3.plants','Command Center','F3 — plants standing',
 'select plants_now from v_room_board_complete where room=''F3''',
 'select count(*)::numeric from v_room_plants_drill where room=''F3''',0),
('cc.room.F4.plants','Command Center','F4 — plants standing',
 'select plants_now from v_room_board_complete where room=''F4''',
 'select count(*)::numeric from v_room_plants_drill where room=''F4''',0),
('cc.room.Mother.plants','Command Center','Mother — plants standing',
 'select plants_now from v_room_board_complete where room=''Mother''',
 'select count(*)::numeric from v_room_plants_drill where room=''Mother''',0),
('cc.room.VegA.plants','Command Center','Veg A — plants standing',
 'select plants_now from v_room_board_complete where room=''Veg A''',
 'select count(*)::numeric from v_room_plants_drill where room=''Veg A''',0),
('cc.room.all.plants','Command Center','All rooms — total plants standing',
 'select sum(plants_now) from v_room_board_complete',
 'select count(*)::numeric from v_room_plants_drill',0)
on conflict (contract_key) do update set
  tile_sql=excluded.tile_sql, drill_sql=excluded.drill_sql,
  tolerance=excluded.tolerance, registered_at=now();;
