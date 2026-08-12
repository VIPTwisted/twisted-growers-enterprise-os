-- WHY THIS EXISTS: the headline coverage number was 0.6% and it was an artifact.
--
-- v_conformance_coverage builds its denominator from every table and view in public, then
-- calls a subject "covered" only if a ledger row names that exact relname. Measured today:
-- the ledger holds 541 rows over 22 distinct subject_refs in three vocabularies, and only 4
-- of them are strings that match a relation name. 289 metric rows match none of the 43
-- registered metrics. 248 mirror rows -- the most active checker in the system -- cannot
-- match at all, because 'mirror' is not one of the subject kinds the view unions, and
-- "metrc_items / MC281714" is a composite label rather than a relation.
--
-- So 4 / 673 = 0.6%. The number measured the overlap between two vocabularies, not how well
-- the platform is watched. Worse, it can only ever FALL: every table any agent adds enlarges
-- the denominator and can never be in the numerator. A metric that declines regardless of the
-- work done is not a metric, and this one was being read as a verdict on the whole system.
--
-- This view anchors on POLICY instead. The owner's rules are the thing compliance is measured
-- against, they are now all 51 registered, and their count does not move when someone adds a
-- staging table. It is a number that can rise as checkers get wired, which is the property the
-- old one lacked.
--
-- ADDED, NOT SUBSTITUTED. v_conformance_coverage keeps its shape because v_auditor_verdict and
-- tg_auditor_pass() read it; replacing its meaning underneath them is how a dashboard blanks.
create or replace view public.v_policy_conformance as
with claimed as (
  /* Which policies does any registered checker actually claim to enforce? */
  select distinct unnest(c.policy_keys) as policy_key
    from checker_registry c
   where c.enabled
),
tested as (
  /* Which policies has the ledger ever recorded a verdict against, and how recently?
     policy_key on the ledger is nullable, so this is honest about what was named. */
  select l.policy_key,
         max(l.ran_at)                                                        as last_verdict_at,
         count(*)                                                             as verdicts,
         count(*) filter (where l.verdict in ('FAIL','DISAGREE'))             as failures
    from conformance_ledger l
   where l.policy_key is not null
   group by l.policy_key
)
select p.policy_key,
       p.section,
       p.title,
       p.severity,
       p.enforced                                    as repo_has_an_enforcer,
       (cl.policy_key is not null)                   as a_checker_claims_it,
       t.verdicts,
       t.last_verdict_at,
       t.failures,
       /* THE FOUR STATES, and they are deliberately not collapsed into a percentage.
          "Nothing mechanical behind it" and "watched and passing" are different kinds of
          fact, and a single ratio hides which one you are looking at -- the same mistake as
          reporting 0 for an empty register. */
       case
         when t.policy_key is not null and t.failures > 0 then 'FAILING'
         when t.policy_key is not null                    then 'WATCHED'
         when cl.policy_key is not null                   then 'CLAIMED BUT SILENT'
         when p.enforced                                  then 'ENFORCED IN REPO, NOT REPORTING'
         else                                                  'MEMORY ONLY'
       end                                           as state,
       case
         when t.policy_key is not null then null
         when cl.policy_key is not null then
           'A checker names this policy but has never written a verdict for it. The check may '
           || 'run and report nowhere, which looks identical to not running.'
         when p.enforced then
           'The repository enforces this at build or hook time, so it is not unguarded -- but '
           || 'nothing in the database can confirm it, and CI verdicts are not recorded here.'
         else
           'No gate, no hook, no cron. This rule holds only while somebody remembers it.'
       end                                           as read_this_first
  from policy_registry p
  left join claimed cl on cl.policy_key = p.policy_key
  left join tested  t  on t.policy_key  = p.policy_key
 where p.active;

comment on view public.v_policy_conformance is
  'Conformance measured against the 51 owner rules rather than against every relation in the '
  'schema. Replaces the 0.6% figure from v_conformance_coverage, which measured the overlap '
  'between two subject vocabularies and could only fall as agents added tables. Four states, '
  'never one ratio, because MEMORY ONLY and WATCHED are different kinds of fact.';;
