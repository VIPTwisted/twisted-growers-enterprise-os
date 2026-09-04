insert into public.brain_fact (fact_key, fact, because, source_sql, learned_from)
select
  'condense-ok-detail-somewhere',
  'CONDENSE ≠ OMIT (owner 4 Sep 2026). Duplicate presentations of the same number may be condensed onto one home tile plus a drill. Moisture, harvest weight, and every other KPI remain visible. Full grain (every harvest, every pound, every test, every tag) must still be reachable somewhere — a drill, a queue, a report — never dropped. If two tiles say "moisture" and one is a lie, keep the true one and the full harvest-level detail; do not keep a second clock. Do not hide moisture or harvest weight behind a menu the floor cannot find.',
  'Owner: but I need to see moisture, harvest weight, so long as i still see every detail somewhere that is ok.',
  $sql$select count(*) from v_xq_harvest_moisture$sql$,
  'grok-ceo'
where not exists (
  select 1 from public.brain_fact
  where fact_key = 'condense-ok-detail-somewhere' and retired_at is null
);
