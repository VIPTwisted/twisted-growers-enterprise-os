-- Owner ruling 14 Sep 2026: bought-in material is tracked site-wide. The Control Tower carries the three figures
-- the Inventory tiles carry — one derivation (v_bought_in_register), appended to the tower's metric union.
set search_path = public;
do $$ begin
  execute 'create or replace view public.v_control_tower as ' || rtrim(pg_get_viewdef('public.v_control_tower'::regclass), E'; \n')
       || ' union all select ''bought_in_on_hand_lb''::text as metric, coalesce(round(sum(pounds_now), 1), 0)::numeric as value from public.v_bought_in_register where state <> ''turned'''
       || ' union all select ''bought_in_overdue''::text, count(*)::numeric from public.v_bought_in_register where state <> ''turned'' and verdict = ''overdue'''
       || ' union all select ''bought_in_due''::text, count(*)::numeric from public.v_bought_in_register where state <> ''turned'' and verdict like ''due%'''
       || ' union all select ''bought_in_no_purchase_price''::text, count(*)::numeric from public.v_bought_in_register where state <> ''turned'' and not purchase_on_file';
end $$;
notify pgrst, 'reload schema';;
