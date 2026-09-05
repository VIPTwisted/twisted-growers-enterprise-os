insert into public.brain_fact (fact_key, fact, because, source_sql, learned_from)
select
  'nuclear-hard-rule-elon-algorithm',
  'NUCLEAR HARD RULE (owner 4 Sep 2026). This company runs Elon''s algorithm. In order, never skipped: (1) Make the requirement less dumb. (2) DELETE the part or process. (3) Simplify. (4) Accelerate cycle time. (5) Automate LAST. If you are not adding back 10% of what you deleted, you did not delete enough. Best part is no part. Best process is no process. One source of truth per domain — Metrc is legal/custody, Apex is invoice/money, OS is operations/accountability and MUST NOT mint a third number. A page with a second clock is a defect. A green tile on empty data is a defect. A silent catch is a defect. An agent that is OVERDUE is disabled or it is a ship-block, never a decoration. Delete zombie sync rows, duplicate nav, unread finding piles, OS overrides of Metrc columns, and every dashboard that averages a gap. Named exceptions stay named. Two-way Metrc/Apex is phase 2. Salvage the factory — do not rebuild 522 pages. Delete the stupid stations.',
  'Owner: resume and what is nuclear fix and solution as Elon musk would have for his companies that is our hard rule. Measured same day: Apex sync dead 6d, $1.28M Apex-only, Tower 0 exceptions vs Command Center 13 harvests open, 2559 unread findings, 98 nav rows with no date default, mesh unsigned 388-680h, OS override of metrc_harvests.wet_weight 120 vs Metrc 100.',
  $sql$select public.f_mesh_is_closed() as mesh_closed$sql$,
  'grok-ceo'
where not exists (
  select 1 from public.brain_fact
  where fact_key = 'nuclear-hard-rule-elon-algorithm' and retired_at is null
);
