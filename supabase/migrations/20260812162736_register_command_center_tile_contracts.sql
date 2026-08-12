-- Agent I, 12 Aug 2026. DBI-055. Register Command Center's tiles with the new watcher so it has
-- something to hold. Each contract re-derives the tile's figure from the DRILL side independently
-- - not by reading the same view twice, which would prove nothing.

insert into tile_drill_contract (contract_key, page, tile_label, tile_sql, drill_sql, tolerance, why_tolerance) values

('cc.room.F1.plants','Command Center','F1 — plants standing',
 'select plants_now from v_room_board_complete where room = ''F1''',
 'select count(*)::numeric from metrc_plants where raw->>''LocationName'' = ''Flower Room #1'' and source_state in (''vegetative'',''flowering'')',
 0, null),

('cc.room.F2.plants','Command Center','F2 — plants standing',
 'select plants_now from v_room_board_complete where room = ''F2''',
 'select count(*)::numeric from metrc_plants where raw->>''LocationName'' = ''Flower Room #2'' and source_state in (''vegetative'',''flowering'')',
 0, null),

('cc.room.F3.plants','Command Center','F3 — plants standing',
 'select plants_now from v_room_board_complete where room = ''F3''',
 'select count(*)::numeric from metrc_plants where raw->>''LocationName'' = ''Flower Room #3'' and source_state in (''vegetative'',''flowering'')',
 0, null),

('cc.room.F4.plants','Command Center','F4 — plants standing',
 'select plants_now from v_room_board_complete where room = ''F4''',
 'select count(*)::numeric from metrc_plants where raw->>''LocationName'' = ''Flower Room #4'' and source_state in (''vegetative'',''flowering'')',
 0, null),

('cc.stock.total_lb','Command Center','Total weight on hand',
 'select round(sum(lb_held),1) from v_room_board_complete',
 'select round(sum(lb),1) from v_onhand_by_room_stage',
 0.2, 'Two roundings compose; 0.2 lb absorbs the rounding, nothing more.'),

('cc.stock.tags','Command Center','Tags on hand',
 'select sum(tags_held)::numeric from v_room_board_complete',
 'select count(distinct package_tag)::numeric from v_stock_packages',
 0, null),

('cc.stock.packages_lb','Command Center','Stock detail — total weight',
 'select round(sum(lb),1) from v_stock_packages',
 'select round(sum(lb),1) from v_onhand_by_room_stage',
 0.2, 'Rounding only.')

on conflict (contract_key) do update set
  tile_sql = excluded.tile_sql, drill_sql = excluded.drill_sql,
  tolerance = excluded.tolerance, registered_at = now();;
