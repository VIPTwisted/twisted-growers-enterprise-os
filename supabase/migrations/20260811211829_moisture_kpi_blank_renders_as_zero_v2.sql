-- Agent I, 11 Aug 2026. Filed for review as DBI-011 (reviewers V, X, W).
--
-- SECOND ATTEMPT. My first was BLOCKED by guard-sql.mjs rule E1, which forbids
-- `drop view ... cascade`. Its stated reason: that pattern "destroyed mv_department_dashboard
-- three times and blanked every dashboard with no visible error, because the front end swallows
-- the failure with ?? []". I had planned to drop and rebuild the base matview with cascade in
-- order to fix a single blank tile - which would have blanked every tile on every dashboard, at
-- night, silently. The guard stopped me from causing the exact class of outage I was sent to fix.
-- Recording that plainly because a guard that catches the COO is the only proof it catches
-- anybody.
--
-- THE DEFECT. The Command and Cultivation tile "Moisture loss not recorded" renders BLANK. The
-- value comes from a scalar subquery over CTE `phantom`:
--     select count(*) as n, round(sum(phantom_lb),1) as lb
--     from v_moisture_loss_register
--     where harvest_state = 'CLOSED' and needs_recording and phantom_lb > 0
-- The aggregate has no GROUP BY so it always returns one row - but sum() over ZERO matching rows
-- is NULL, and round(NULL) is NULL.
--
-- WHY THAT IS NOT COSMETIC. Blank and zero mean opposite things. Zero says "we looked and there
-- is none". Blank says nothing, and the reader supplies the friendlier meaning. This metric read
-- 21,935.4 lb four days ago. Going quietly blank is the worst possible way for a number like
-- that to change.
--
-- FIXED AT THE CONSUMING VIEW, NOT THE BASE. mv_department_dashboard is a plain passthrough over
-- the base matview, so CREATE OR REPLACE VIEW changes the rendering with no drop, no cascade and
-- no window in which a dashboard is empty. The base matview is untouched.
--
-- COALESCE IS CORRECT HERE AND IS NOT A PAPER-OVER. The sum of an empty set of pounds is
-- genuinely nought and the CTE cannot fail to return its row. This is NOT the platform's
-- "UNCHECKED is a verdict, not an absence" case - we checked, and the answer is none. It is
-- scoped to this one KPI deliberately: blanket-coalescing every NULL would convert a future
-- genuine cannot-compute into a confident zero, which is the very failure this migration exists
-- to remove.
--
-- THE BIGGER HALF, WHICH THIS DOES NOT FIX. The tile counts CLOSED harvests only, by design.
-- Measured tonight from v_moisture_loss_register:
--     needing moisture recorded with phantom_lb > 0 ...... 30 harvests
--     of those CLOSED ..................................... 0
--     of those OPEN ...................................... 30, totalling 3,681.6 lb
--                                                          largest single harvest 288.3 lb
-- So 3,681.6 lb of unrecorded moisture exists right now and NO tile shows it, because every
-- affected harvest is open and the tile only looks at closed ones. Zero is honest for the tile's
-- own definition and misleading about the operation. An open-harvest counterpart tile is a
-- dashboard change and is the owner's call, so it is RECOMMENDED, not done.
--
-- UNDO: create or replace view public.mv_department_dashboard as
--         select department, ord, kpi, value, unit, tone, context, drill, computed_at
--         from mv_department_dashboard_base;

create or replace view public.mv_department_dashboard as
select department,
       ord,
       kpi,
       case when kpi = 'Moisture loss not recorded' then coalesce(value, 0) else value end as value,
       unit,
       tone,
       context,
       drill,
       computed_at
from mv_department_dashboard_base;

comment on view public.mv_department_dashboard is
 'Every category dashboard tile. Passthrough over mv_department_dashboard_base with ONE '
 'exception: "Moisture loss not recorded" coalesces to 0, because its source aggregates sum() '
 'over a possibly-empty set and NULL rendered as a blank tile. Blank and zero mean opposite '
 'things to a reader. The coalesce is deliberately scoped to that single KPI - blanket-'
 'coalescing NULLs would turn a real cannot-compute into a confident nought. '
 'CAUTION: never DROP this view with CASCADE. Rule E1 exists because doing so blanked every '
 'dashboard three times with no visible error.';;
