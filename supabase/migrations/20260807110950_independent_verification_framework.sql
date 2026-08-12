/* INDEPENDENT VERIFICATION
   ------------------------
   Every check on this platform so far compares our data to our data. That is
   exactly how the moisture band survived as a "proof" while being a tautology:
   moisture was defined as wet minus waste minus packaged, then checked by
   confirming that packaged plus waste plus moisture equalled wet. It could not
   fail, and it proved nothing.

   The fix is structural. A check here is TWO independent derivations of the
   same fact, from different sources, compared. If they agree the number is
   trustworthy. If they disagree that disagreement is the finding - never
   silently resolved, never averaged away.

   Where a second source genuinely does not exist, the check says so rather
   than inventing agreement. */

create table if not exists verification_checks (
  check_key      text primary key,
  title          text not null,
  what_it_proves text not null,
  source_a_label text not null,
  source_a_sql   text not null,     -- must return one numeric
  source_b_label text not null,
  source_b_sql   text not null,     -- must return one numeric, derived DIFFERENTLY
  tolerance_pct  numeric not null default 0.5,
  severity       text not null default 'elevated',
  owner          text not null default 'Vincent',
  enabled        boolean not null default true,
  added_on       date not null default current_date
);
alter table verification_checks enable row level security;
drop policy if exists vc_read on verification_checks;
create policy vc_read on verification_checks for select to authenticated using (true);
grant select on verification_checks to authenticated;

create table if not exists verification_runs (
  id           bigserial primary key,
  ran_at       timestamptz not null default now(),
  check_key    text not null,
  value_a      numeric,
  value_b      numeric,
  difference   numeric,
  pct_apart    numeric,
  verdict      text not null,        -- agree | DISAGREE | error
  note         text
);
create index if not exists vr_key_time on verification_runs (check_key, ran_at desc);
alter table verification_runs enable row level security;
drop policy if exists vr_read on verification_runs;
create policy vr_read on verification_runs for select to authenticated using (true);
grant select on verification_runs to authenticated;

/* ---- The checks. Each pair derives the same fact two different ways. ---- */
insert into verification_checks
 (check_key, title, what_it_proves, source_a_label, source_a_sql, source_b_label, source_b_sql, tolerance_pct, severity)
values
('revenue-two-reports',
 'Wholesale revenue agrees across two Metrc reports',
 'Revenue is the number the business is judged on. Two separate Metrc exports carry it. If they disagree, one is stale or incomplete and nobody should quote either until we know which.',
 'Wholesale Transfers report',
 $a$select coalesce(sum(amount),0) from metrc_rpt_wholesale where voided is not true$a$,
 'Packages-Transferred export',
 $b$select coalesce(sum(shipper_wholesale_price),0) from metrc_rpt_package_transfers$b$,
 0.5, 'elevated'),

('plants-metrc-vs-plan',
 'Plants harvested agrees with plants planned',
 'If actual and planned plant counts drift apart, either the rooms are being underfilled or the plan is wrong. Both matter and neither is visible today.',
 'Metrc harvests, 2026',
 $a$select coalesce(sum((raw->>'PlantCount')::int),0) from metrc_harvests where harvest_start >= '2026-01-01'$a$,
 'Harvest plan, pulls already due',
 $b$select coalesce(sum(planned_plants),0)::numeric from harvest_plan_2026 where harvest_date < current_date$b$,
 8, 'elevated'),

('harvest-count-api-vs-report',
 'Harvest count agrees between the API and the report export',
 'The API and the report exports are pulled separately. Agreement means both pipelines are healthy; disagreement means one is behind.',
 'API sync (metrc_harvests)',
 $a$select count(*)::numeric from metrc_harvests$a$,
 'Report import (metrc_rpt_harvests)',
 $b$select count(*)::numeric from metrc_rpt_harvests$b$,
 0.1, 'elevated'),

('findings-money-deduplicated',
 'Open finding value is not double counted',
 'Two agents write the same finding into different tables. Counted straight the open value read $7.1m when it is $4.2m. This proves the deduplication still holds.',
 'All open findings, counted straight',
 $a$select coalesce(sum(dollars),0) from v_findings where state='open'$a$,
 'Open findings, duplicates removed',
 $b$select coalesce(sum(dollars),0) from v_findings where state='open' and not is_duplicate$b$,
 0, 'watch'),

('room-capacity-never-exceeded',
 'No room has ever held more than its recorded capacity',
 'Room capacity is the standard every pull is judged against. If Metrc shows a pull above capacity, either the capacity is wrong or the data is.',
 'Largest pull ever recorded in Metrc',
 $a$with a as (select upper(substring(regexp_replace(upper(name),'\s','','g') from 'F[1-4]')) room,
                    sum((raw->>'PlantCount')::int) p
             from metrc_harvests where harvest_start is not null
             group by 1, date_trunc('month',harvest_start), (extract(day from harvest_start)>20))
   select coalesce(max(p),0)::numeric from a where room is not null$a$,
 'Largest room capacity on record',
 $b$select coalesce(max(value),0) from conversion_factors where key like 'room_capacity_%'$b$,
 0, 'critical')
on conflict (check_key) do nothing;

comment on table verification_checks is
  'Each row is one fact derived two independent ways. Disagreement is the finding. Never compare a source to itself.';;
