/* POUNDS AND DOLLARS ON A FINDING ARE NOT ADDABLE
   -----------------------------------------------
   Once the agents started recording weight, the open total read 12,166.9 lb -
   more than three years of production. Two reasons, both fatal to a sum:

     - The same package appears in several findings. 405 findings name only
       201 distinct packages. Ageing, unallocated and failed-testing are three
       true statements about ONE physical package.
     - 10,706 lb sits on findings that name no package: waste aggregates
       covering years of harvests, not stock we are holding.

   So the figure on a finding answers "how big is THIS problem" - it ranks, it
   does not add. Anyone summing the column gets a number three to eighteen
   times reality.

   v_exposure gives the honest answer: each package counted once, at its
   largest finding, with historical aggregates kept separate. */

create or replace view v_exposure as
with tagged as (
  select f.finding_key, f.department, f.severity, f.severity_rank,
         f.pounds, f.dollars, f.what,
         substring(coalesce(f.what,'') from '(M[0-9]{8,})') as package_tag
  from v_findings f
  where f.state='open' and not f.is_duplicate and (f.pounds is not null or f.dollars is not null)
),
once_per_package as (
  select distinct on (package_tag) package_tag, department, severity, pounds, dollars, what
  from tagged where package_tag is not null
  order by package_tag, severity_rank, dollars desc nulls last
)
select 'Physical stock flagged'::text as measure,
       count(*)::numeric              as items,
       round(sum(pounds),1)           as pounds,
       round(sum(dollars),0)          as dollars,
       'Each package counted ONCE, at its most serious finding. This is real material we are holding.'::text as means
from once_per_package
union all
select 'Historical / aggregate findings',
       count(*), round(sum(pounds),1), round(sum(dollars),0),
       'Waste and loss aggregates covering many harvests. NOT stock on hand - never add these to the line above.'
from tagged where package_tag is null
union all
select 'Naive sum of every finding (WRONG)',
       count(*), round(sum(pounds),1), round(sum(dollars),0),
       'What you get by summing the column. Double counts packages and mixes history with stock. Shown so the error is visible, never to be quoted.'
from tagged;

grant select on v_exposure to authenticated;

comment on view v_exposure is
  'The honest exposure. Finding-level pounds and dollars RANK problems; they do not add up. Each package counted once here.';
comment on column agent_findings.pounds is
  'Weight this finding concerns. For ranking, NOT for summing - the same package appears in several findings.';

/* And a check so this can never quietly come back. */
insert into verification_checks
 (check_key, title, what_it_proves, source_a_label, source_a_sql, source_b_label, source_b_sql, tolerance_pct, severity)
values
('exposure-not-double-counted',
 'Flagged stock is not counted more than once',
 'The same package legitimately triggers several findings. Summing their weights counts the same material repeatedly. This proves the honest exposure figure still counts each package once.',
 'Distinct packages named in open findings',
 $a$select count(distinct substring(coalesce(what,'') from '(M[0-9]{8,})'))::numeric
      from v_findings where state='open' and not is_duplicate
        and substring(coalesce(what,'') from '(M[0-9]{8,})') is not null$a$,
 'Items counted in the physical stock exposure',
 $b$select coalesce(max(items),0) from v_exposure where measure='Physical stock flagged'$b$,
 0, 'elevated')
on conflict (check_key) do nothing;;
