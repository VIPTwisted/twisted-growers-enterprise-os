-- Agent I (Database COO), 11 Aug 2026. Filed for review as DBI-014 (reviewers V, X, W).
-- Owner: "how do we address all flagged issues regularly, keep this list clean and fix all
-- issues" and "all discrepancies must be flagged and a human must address and handle them on
-- the OS".
--
-- THE PROBLEM WITH THE QUEUE AS IT STANDS. 1,584 open findings. Nobody works a list of 1,584.
-- It is not a work list, it is a wall, and a wall gets ignored - which is how 108 custody
-- findings reached a week old with nobody touching them.
--
-- THE MEASUREMENT THAT CHANGES THE PICTURE. Those findings come from 70 distinct patterns -
-- 22.6 instances per cause - and the concentration is extreme:
--     agent / elevated ....... 926 findings from   5 causes
--     custody / elevated ..... 291 findings from   1 cause    (108 already over a week old)
--     agent / critical ....... 102 findings from   6 causes
--     watchdog / all ......... 174 findings from  58 causes   (the genuinely distinct ones)
-- Six causes carry 1,319 of 1,584 - 83% of the queue. The list is not cleaned by working
-- findings top-down; it is cleaned by fixing causes, and each fix retires dozens of rows at once.
--
-- WHAT THIS VIEW IS FOR. It turns the wall into roughly 70 rows a person can sit down with, each
-- showing how many findings die when it is fixed. That is the difference between a queue somebody
-- works and a queue everybody avoids.
--
-- DUPLICATES ARE EXCLUDED. v_findings already carries is_duplicate and canonical_key, and
-- tg_route_findings() already respects them. This view uses the same filter, so the counts here
-- agree with what the router actually assigns rather than telling a second story.
--
-- THE MONEY COLUMN CARRIES A WARNING, DELIBERATELY. Even after dropping duplicates, the check
-- findings-money-deduplicated is DISAGREEING right now - the same dollars still appear in more
-- than one finding. Summing money across instances is exactly how an enormous headline gets
-- manufactured from a much smaller real exposure. The column is exposed because hiding it would
-- invite someone to total it by hand; the name says not to trust it yet.
--
-- UNDO: drop view v_finding_causes;

create or replace view v_finding_causes as
select
  f.pattern_key,
  f.source,
  count(*)                                                     as findings_that_clear_if_fixed,
  count(*) filter (where f.severity = 'critical')              as critical_instances,
  max(f.severity_rank)                                         as worst_severity_rank,
  (array_agg(f.severity order by f.severity_rank desc))[1]     as worst_severity,
  min(f.first_raised)                                          as oldest_instance,
  max(f.last_seen)                                             as newest_instance,
  (current_date - min(f.first_raised)::date)                   as days_open,
  count(*) filter (where f.first_raised < now() - interval '7 days') as instances_over_a_week,
  round(sum(f.pounds) filter (where f.pounds > 0), 1)          as pounds_untrusted,
  round(sum(f.dollars) filter (where f.dollars > 0))           as dollars_untrusted,
  (array_agg(f.who_is_accountable order by f.first_raised)
     filter (where f.who_is_accountable is not null))[1]       as accountable,
  (array_agg(f.department order by f.first_raised)
     filter (where f.department is not null))[1]               as department,
  (array_agg(f.what order by f.first_raised))[1]               as example_finding,
  (array_agg(f.what_to_do order by f.first_raised)
     filter (where f.what_to_do is not null))[1]               as what_to_do
from v_findings f
where f.resolved_at is null
  and not coalesce(f.is_duplicate, false)
group by f.pattern_key, f.source
order by max(f.severity_rank) desc, count(*) desc;

comment on view v_finding_causes is
 'The findings queue as CAUSES rather than instances - roughly 70 rows instead of 1,584. '
 'findings_that_clear_if_fixed is the whole point: fixing one row here retires that many findings '
 'at once, and six causes currently carry 83% of the queue. Work this view, never the raw list. '
 'A list of 1,584 is a wall and gets ignored, which is how 108 custody findings reached a week old '
 'untouched. Duplicates are excluded on the same basis tg_route_findings() uses, so the counts '
 'here match what actually gets assigned. '
 'THE MONEY COLUMNS ARE NAMED _untrusted ON PURPOSE: findings-money-deduplicated is DISAGREEING, '
 'so the same dollars still appear in more than one finding and any total is overstated by an '
 'unknown amount. Do not quote them until that check is green.';;
