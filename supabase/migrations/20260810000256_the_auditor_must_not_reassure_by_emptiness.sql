-- ============================================================================
-- THE AUDITOR WAS REASSURING BY EMPTINESS. Two defects, both mine, both the exact
-- failure LAW 3 exists to prevent: a zero meaning NOT MEASURED, presented
-- identically to a zero meaning ALL CLEAR.
--
-- DEFECT 1 · v_auditor_verdict read policies_on_memory_only: 0, findings_open: 0,
-- findings_critical: 0. All three were 0 because policy_registry and
-- finding_remediation have NO ROWS — I built both tables this session and populated
-- neither. An owner glancing at that row would conclude every rule is enforced and
-- nothing is outstanding. They are now NULL when the register is empty, and a
-- read_this_first column states in words which kind of zero is in play.
--
-- DEFECT 2 · v_auditor_heartbeat called 42 checkers "NEVER RUN", including
-- page-canary and watchdog-am, which ran today — canary_runs has rows from twenty
-- minutes ago. The view only sees conformance_ledger writes, and just three checkers
-- write there. "NEVER RUN" was the wrong word for "never reported here", and the
-- wrong word turned a reporting gap into a false alarm about working machinery.
--
-- Column names and order are preserved deliberately: create-or-replace cannot drop or
-- rename a column, and rule E1 forbids dropping the view to get around that. So
-- checkers_dark keeps its name while its definition widens to NEVER REPORTED + DARK.
-- ============================================================================

create or replace view public.v_auditor_verdict as
with cov as (
  select count(*) filter (where coverage = 'NEVER CHECKED') as never_checked,
         count(*)                                            as total
  from v_conformance_coverage
),
reg as (
  select (select count(*) from policy_registry)     as policies_recorded,
         (select count(*) from finding_remediation) as findings_recorded
)
select
  cov.never_checked                                                      as subjects_never_checked,
  cov.total                                                              as subjects_total,
  round(100.0 * (cov.total - cov.never_checked) / nullif(cov.total,0), 1) as coverage_pct,

  /* Name kept; meaning widened. NEVER REPORTED and DARK both leave the map blind. */
  (select count(*) from v_auditor_heartbeat
    where heartbeat in ('NEVER REPORTED','DARK'))                        as checkers_dark,
  (select count(*) from v_auditor_heartbeat
    where not fixture_proves_it_fails and enabled)                       as checkers_unproven,

  /* NULL, not 0, when the register behind the number is empty. */
  case when reg.policies_recorded = 0 then null
       else (select count(*) from policy_registry where active and not enforced) end
                                                                         as policies_on_memory_only,
  case when reg.findings_recorded = 0 then null
       else (select count(*) from finding_remediation
              where state not in ('closed','accepted_risk')) end          as findings_open,
  case when reg.findings_recorded = 0 then null
       else (select count(*) from finding_remediation
              where state not in ('closed','accepted_risk')
                and due_by < now()) end                                   as findings_overdue,
  case when reg.findings_recorded = 0 then null
       else (select count(*) from finding_remediation
              where state not in ('closed','accepted_risk')
                and severity = 'critical') end                            as findings_critical,

  (select round(sum(pounds)::numeric,1) from conformance_ledger
    where verdict in ('FAIL','DISAGREE') and ran_at > now() - interval '24 hours')
                                                                          as pounds_in_question_24h,
  (select round(sum(dollars)::numeric,2) from conformance_ledger
    where verdict in ('FAIL','DISAGREE') and ran_at > now() - interval '24 hours')
                                                                          as dollars_in_question_24h,

  /* Appended, because a NULL on its own can still be misread as "nothing to see". */
  concat_ws(' · ',
    case when reg.policies_recorded = 0
         then 'POLICY REGISTER EMPTY — rule enforcement is UNMEASURED, not clean'
         else reg.policies_recorded || ' rules recorded' end,
    case when reg.findings_recorded = 0
         then 'REMEDIATION REGISTER EMPTY — open findings are UNCOUNTED, not zero'
         else reg.findings_recorded || ' findings tracked' end,
    round(100.0 * (cov.total - cov.never_checked) / nullif(cov.total,0), 1)
      || '% of ' || cov.total || ' subjects ever checked'
  )                                                                       as read_this_first
from cov, reg;

comment on view public.v_auditor_verdict is
'The one row the owner reads. policies_on_memory_only, findings_open, findings_overdue and findings_critical are NULL -- not 0 -- when their register is empty, because a zero from an empty table is indistinguishable from a clean result and reads as good news. read_this_first says in words which kind of zero is in play. coverage_pct is first on purpose: a platform running green checks over a fraction of itself is more dangerous than one that admits its blind spots.';

create or replace view public.v_auditor_heartbeat as
select c.checker_key, c.title, c.tier, c.runs_where, c.expected_interval,
       c.enabled, l.last_run,
       case when l.last_run is null then null else now() - l.last_run end as since_last_run,
       c.fixture_proves_it_fails,
       case
         when not c.enabled                          then 'DISABLED'
         when l.last_run is null                     then 'NEVER REPORTED'
         when c.expected_interval is null            then 'ON DEMAND'
         when now() - l.last_run
              > c.expected_interval * 2              then 'DARK'
         when now() - l.last_run
              > c.expected_interval                  then 'LATE'
         else 'ALIVE'
       end as heartbeat,
       case
         when l.last_run is null and c.enabled then
           'Registered and enabled, but has never written a verdict to conformance_ledger. '
           || 'That may mean it never ran, OR that it runs and reports elsewhere — page-canary '
           || 'writes to canary_runs, the watchdog to watchdog_findings, and both ran today. '
           || 'Either way its result is invisible to the coverage map, so a green platform '
           || 'cannot be told apart from an unwatched one.'
         when not c.fixture_proves_it_fails then
           'Has reported, but nobody has ever seen it FAIL on a deliberate fixture. Unproven '
           || 'checks can be vacuous — the schema baseline gate printed PASS for a day while '
           || 'production drifted 16 tables, because it only read a clock.'
         else null
       end as why_it_matters
from checker_registry c
left join (select checker_key, max(ran_at) as last_run
             from conformance_ledger group by checker_key) l
       on l.checker_key = c.checker_key;

comment on view public.v_auditor_heartbeat is
'LAW 4: silence alarms louder than failure. NEVER REPORTED means no verdict has reached conformance_ledger -- which may be a checker that never ran, or one that reports to its own table instead. Both blind the coverage map, but they are different problems and the label must not conflate them.';;
