-- Agent I (Database COO), 11 Aug 2026. Filed for review as DBI-018 (reviewers V, X, W).
-- Owner ruling 11 Aug 2026: "You cannot have the same card or report giving off different
-- totals." And: this is to be watched no less than six times a day, or hourly.
--
-- THIS IS NOW AN ENFORCED INVARIANT, NOT AN ASPIRATION. The same named figure, published on more
-- than one surface, must show the same value on every one of them. Measured tonight: seven KPIs
-- appear on two or three dashboards each and all seven agree. That is the state to defend, and
-- until now nothing was defending it - the agreement was luck of shared plumbing, not a rule.
--
-- WHY IT NEEDS A GUARD EVEN THOUGH IT PASSES. The seven agree because they come from one base
-- matview. The moment somebody publishes an eighth KPI from its own query - which is easy, and
-- 48 relations already define pounds their own way - the agreement breaks silently. Nobody
-- notices two cards disagreeing until a person happens to open both pages in one sitting and
-- reads carefully. That is not a control.
--
-- CADENCE RAISED TO HOURLY. The verification suite ran at 05:25 and 17:25 - twice a day, so a
-- broken figure could stand for eleven hours. It now runs every hour at :20 and the escalator at
-- :30, so every disagreement becomes a named, owned finding within the hour. Twenty-four passes
-- a day against the owner's floor of six.
--
-- COST: 34 checks an hour is trivial - they are ordinary SELECTs against views the dashboards
-- already read every ten minutes.
--
-- UNDO: select cron.unschedule('verification-suite'); select cron.unschedule('verification-escalate');
--       select cron.schedule('verification-suite','25 5,17 * * *','select count(*) from tg_verify()');
--       select cron.schedule('verification-escalate','35 5,17 * * *','select count(*) from tg_verification_escalate()');
--       drop view v_figure_disagreement;
--       delete from verification_checks where check_key = 'one-figure-one-value';

create or replace view v_figure_disagreement as
select kpi,
       count(*)                                   as published_on_surfaces,
       string_agg(department, ' | ' order by department) as where_it_appears,
       count(distinct value)                      as distinct_values,
       min(value)                                 as lowest,
       max(value)                                 as highest,
       round(max(value) - min(value), 3)          as spread,
       string_agg(distinct value::text, ' vs ')   as values_shown,
       case when count(distinct value) > 1
            then 'DISAGREES — the same card shows different totals on different pages'
            else 'agrees' end                     as verdict
from mv_department_dashboard
where value is not null
group by kpi
having count(*) > 1
order by count(distinct value) desc, count(*) desc;

comment on view v_figure_disagreement is
 'Owner ruling 11 Aug 2026: the same card or report may not give different totals. This is that '
 'rule as a query. Every KPI published on more than one dashboard, with every value it shows. '
 'Anything reading DISAGREES is a defect regardless of which value is correct - a reader cannot '
 'act on a number that changes depending on which page they opened.';

insert into verification_checks (
  check_key, title, what_it_proves, source_a_label, source_a_sql, source_b_label, source_b_sql,
  tolerance_pct, severity, owner, enabled, added_on, measures_a_process)
values (
 'one-figure-one-value',
 'The same figure shows the same total on every page that publishes it',
 'OWNER RULING, 11 Aug 2026: "you cannot have the same card or report giving off different '
 'totals." Seven KPIs are published on two or three dashboards each and all seven currently '
 'agree - but only because they share one base matview, which is luck of plumbing rather than a '
 'rule. The moment an eighth is published from its own query the agreement breaks and nobody '
 'notices until a person opens two pages in one sitting. If this fires, do NOT pick the figure '
 'you prefer: find which population each surface is actually using, because two different '
 'totals almost always means two different questions.',
 'Figures published on more than one page',
 'select count(*)::numeric from v_figure_disagreement',
 'Of those, how many show one consistent value everywhere',
 'select count(*)::numeric from v_figure_disagreement where distinct_values = 1',
 0, 'critical', 'Agent W', true, date '2026-08-11', false)
on conflict (check_key) do update set
  title = excluded.title, what_it_proves = excluded.what_it_proves,
  source_a_sql = excluded.source_a_sql, source_b_sql = excluded.source_b_sql,
  severity = excluded.severity, owner = excluded.owner, enabled = excluded.enabled;

-- Cadence: hourly, per the owner's floor of six times a day.
select cron.unschedule('verification-suite')  where exists (select 1 from cron.job where jobname='verification-suite');
select cron.unschedule('verification-escalate') where exists (select 1 from cron.job where jobname='verification-escalate');

select cron.schedule('verification-suite',    '20 * * * *', 'select count(*) from tg_verify()');
select cron.schedule('verification-escalate', '30 * * * *', 'select count(*) from tg_verification_escalate()');;
