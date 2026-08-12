-- CAUGHT BEFORE IT WAS REPORTED, AND IT IS THE SAME MISTAKE AS THIS MORNING.
--
-- The first version called a policy FAILING if it had EVER recorded a failure. So E6 showed
-- 99 failures of 99 verdicts although the anon surface was revoked days ago, and D1 showed 162
-- — every historical row, forever, with no way for a fixed rule to ever look fixed. A state
-- that can never improve is the mirror image of a metric that can only fall, and I shipped
-- one of each in the same day: "12 of 17 checks disagree" was this exact defect counting any
-- disagreement in 30 days, where the latest run per check said 10 agree.
--
-- The state now reads the LATEST verdict per policy. History is kept, but in columns that say
-- they are history: a rule fixed this morning must not still read as failing tonight, and a
-- rule that failed once in July must not outvote tonight's pass.
create or replace view public.v_policy_conformance as
with claimed as (
  select distinct unnest(c.policy_keys) as policy_key
    from checker_registry c
   where c.enabled
),
latest as (
  /* One row per policy: the most recent verdict, and what it said. */
  select distinct on (l.policy_key)
         l.policy_key, l.verdict as latest_verdict, l.ran_at as last_verdict_at
    from conformance_ledger l
   where l.policy_key is not null
   order by l.policy_key, l.ran_at desc, l.id desc
),
history as (
  select l.policy_key,
         count(*)                                                  as verdicts,
         count(*) filter (where l.verdict in ('FAIL','DISAGREE'))   as failures
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
       h.verdicts,
       lt.last_verdict_at,
       h.failures,
       case
         when lt.latest_verdict in ('FAIL','DISAGREE') then 'FAILING NOW'
         when lt.policy_key is not null                then 'PASSING'
         when cl.policy_key is not null                then 'CLAIMED BUT SILENT'
         when p.enforced                               then 'ENFORCED IN REPO, NOT REPORTING'
         else                                              'MEMORY ONLY'
       end                                           as state,
       case
         when lt.policy_key is not null then null
         when cl.policy_key is not null then
           'A checker names this policy but has never written a verdict for it. The check may '
           || 'run and report nowhere, which looks identical to not running.'
         when p.enforced then
           'The repository enforces this at build or hook time, so it is not unguarded -- but '
           || 'nothing in the database can confirm it, and CI verdicts are not recorded here.'
         else
           'No gate, no hook, no cron. This rule holds only while somebody remembers it.'
       end                                           as read_this_first,
       /* Appended, because create or replace cannot reorder: the verdict the state is based on,
          and whether this rule has a history worth reading past tonight's answer. */
       lt.latest_verdict,
       (h.failures > 0 and lt.latest_verdict not in ('FAIL','DISAGREE')) as failed_before_now_passing
  from policy_registry p
  left join claimed cl on cl.policy_key = p.policy_key
  left join latest  lt on lt.policy_key = p.policy_key
  left join history h  on h.policy_key  = p.policy_key
 where p.active;

comment on view public.v_policy_conformance is
  'Conformance against the 51 owner rules rather than every relation in the schema, which is '
  'what made the old figure 0.6% and falling. State reads the LATEST verdict per policy: the '
  'first version called a rule FAILING for any historical failure, so a fixed rule could never '
  'look fixed. History is kept in columns that admit they are history.';;
