update public.brain_fact
set retired_at = now(),
    retired_why = 'Owner 4 Sep 2026: NO what do you mean delete we dont want to strip this down and delete every tile kpi is critical. First wording could be read as omit surfaces. That is forbidden.'
where fact_key = 'nuclear-hard-rule-elon-algorithm'
  and retired_at is null;

insert into public.brain_fact (fact_key, fact, because, source_sql, learned_from)
select
  'nuclear-hard-rule-omit-nothing',
  'NUCLEAR HARD RULE, CORRECTED (owner 4 Sep 2026). Elon algorithm still binds: (1) requirements less dumb (2) delete the LIE / the stupid PROCESS (3) simplify (4) accelerate (5) automate last. IT DOES NOT MEAN DELETE TILES, KPIs, PAGES, BUTTONS, OR DASHBOARDS. OMIT NOTHING. Every tile, KPI, menu item, drill, and button is critical and stays. Condense and organize without omitting. What gets deleted is the defect behind the tile: a second clock, a green zero that means empty not clear, an OS overwrite of Metrc, a silent 1000-row cap, averaging a gap, a zombie agent that never runs, a sync row that is not a job. The tile remains; it must tell the truth. Named exceptions stay on the page as exceptions, never blended, never removed. Salvage the factory. Do not strip it.',
  'Owner correction 4 Sep 2026 after first nuclear wording. Standing owner law: we will not omit a single item or dashboard, not even a button or tile. KPI-critical.',
  $sql$select count(*) as enabled_nav from nav_registry where enabled$sql$,
  'grok-ceo'
where not exists (
  select 1 from public.brain_fact
  where fact_key = 'nuclear-hard-rule-omit-nothing' and retired_at is null
);
