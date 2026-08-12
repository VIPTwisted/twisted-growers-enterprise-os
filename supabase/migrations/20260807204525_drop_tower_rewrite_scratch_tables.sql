-- Scratch tables from proving the v_tower_inventory rewrite output-identical.
-- They held a frozen copy of v_stock_on_hand and the pre-change tower figures.
-- Both have served their purpose; a stale copy of live stock left lying around is
-- exactly the kind of thing someone later mistakes for current. Neither is
-- forensic, neither is referenced by anything, both were created in this session.
drop table if exists tg_soh_frozen;
drop table if exists tg_tower_rewrite_proof;;
