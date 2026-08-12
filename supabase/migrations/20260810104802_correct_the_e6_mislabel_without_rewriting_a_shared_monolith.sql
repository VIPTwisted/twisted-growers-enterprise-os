-- CORRECTION. tg_auditor_pass() stamps policy_key = 'E6' on three checks that have nothing to do
-- with rule E6:
--
--   views_enforcing_rls             -- views running as owner
--   matviews_not_readable_by_staff  -- matviews readable by signed-in staff
--   tables_rls_with_policy          -- tables with RLS and no policy
--
-- E6 says "never grant to anon". anon is clean: 214 REFERENCES and 214 TRIGGER grants, zero
-- SELECT, zero write. So the policy register reports E6 as FAILING NOW on evidence that does not
-- concern it, while the real breaches carry a label that sends the reader to the wrong rule. A
-- wrong label costs more than no label — that is charter rule 3, and this is it happening inside
-- the compliance register itself.
--
-- TWO OF THE THREE ARE ALSO NOW PERMANENTLY FALSE, which is worse than mislabelled:
--   * matviews_not_readable_by_staff counts every matview readable by staff as exposed, so it
--     reports 11 of 11 FAIL every hour. All 11 were declared intended staff_read today, with
--     reasons, after measuring that they hold no pay and no personal data and that anon cannot
--     reach any of them.
--   * tables_rls_with_policy counts 3 remaining naked tables as a fault. All 3 are sealed on
--     purpose — integration_secrets, security_anon_allowlist, security_grant_snapshot.
-- Left alone, the auditor fails hourly, forever, on states we deliberately chose. That is how a
-- register stops being read.
--
-- WHY A CORRECTION LAYER RATHER THAN EDITING THE PRODUCER. tg_auditor_pass() is 9,839 characters
-- holding ten inline checks, and other agents are committing right now. Rewriting it to fix three
-- of the ten means transcribing the other seven by hand, in a shared function, with no test
-- around them — a transcription slip would break checks that are currently correct. The label is
-- data, so it is corrected as data, with a reason and a date, and the root cause is recorded as
-- work rather than pretended away.
--
-- THE ROOT CAUSE IS THE SHAPE, NOT THE LABELS. Ten checks in one function is the same anti-pattern
-- the owner already ruled against in the front end, where 522 pages through one ReportScreen was
-- the CAUSE of the bugs rather than a symptom. One check cannot be fixed without risking ten, and
-- none of the ten can be individually proven to fail. Decomposition is queued, not skipped.

create table if not exists public.ledger_label_correction (
  checker_key      text not null,
  subject_ref      text not null,
  wrong_policy_key text not null,
  right_policy_key text,
  reason           text not null,
  corrected_on     date not null default current_date,
  primary key (checker_key, subject_ref, wrong_policy_key)
);
alter table public.ledger_label_correction enable row level security;
create policy ledger_label_correction_staff_read on public.ledger_label_correction
  for select to authenticated using (true);

comment on table public.ledger_label_correction is
  'Corrects policy labels a checker stamped wrongly, when editing the checker is riskier than '
  'correcting the data. right_policy_key NULL means no owner rule covers this evidence at all — '
  'which is itself the finding, not an omission. Every row carries its reason and its date so the '
  'correction is auditable rather than invisible.';

insert into public.ledger_label_correction
  (checker_key, subject_ref, wrong_policy_key, right_policy_key, reason) values
  ('detect.security_posture', 'views_enforcing_rls', 'E6', null,
   'Views running as their owner is not rule E6, which concerns grants to anon. NO owner rule covers access control on views — that gap is why 305 leaking views went days without being treated as a breach: they breached nothing written down. Left NULL deliberately until the owner writes the rule. Superseded operationally by detect.view_rls_ratchet, which honours registered exemptions.'),
  ('detect.security_posture', 'matviews_not_readable_by_staff', 'E6', null,
   'Not rule E6, and the check itself is now stale: all 11 matviews were declared intended staff_read on 10 Aug after measuring that they hold no compensation and no personal data, and that anon can read none of them. The check does not consult rls_intent, so it fails hourly on a state we chose. Needs the threshold fixed at source, not just the label.'),
  ('detect.security_posture', 'tables_rls_with_policy', 'E6', null,
   'Not rule E6. The 3 remaining tables with RLS and no policy are sealed on purpose — integration_secrets, security_anon_allowlist, security_grant_snapshot. Deny-by-default is the intended terminal state for credentials and security controls. The check does not consult rls_intent, so it reports a correct posture as a fault.')
on conflict (checker_key, subject_ref, wrong_policy_key) do update set
  right_policy_key = excluded.right_policy_key, reason = excluded.reason;

-- The register now reads corrected labels. Column list and order preserved exactly.
create or replace view public.v_policy_conformance as
with corrected as (
  /* Apply the correction before anything is grouped or judged. */
  select l.*,
         case when c.checker_key is not null then c.right_policy_key else l.policy_key end
           as effective_policy_key
    from conformance_ledger l
    left join ledger_label_correction c
           on c.checker_key = l.checker_key
          and c.subject_ref = l.subject_ref
          and c.wrong_policy_key = l.policy_key
),
claimed as (
  select distinct unnest(c.policy_keys) as policy_key from checker_registry c where c.enabled
),
latest as (
  select distinct on (effective_policy_key)
         effective_policy_key as policy_key, verdict as latest_verdict, ran_at as last_verdict_at
    from corrected
   where effective_policy_key is not null
   order by effective_policy_key, ran_at desc, id desc
),
history as (
  select effective_policy_key as policy_key,
         count(*)                                                as verdicts,
         count(*) filter (where verdict in ('FAIL','DISAGREE'))    as failures
    from corrected
   where effective_policy_key is not null
   group by effective_policy_key
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
       lt.latest_verdict,
       (h.failures > 0 and lt.latest_verdict not in ('FAIL','DISAGREE')) as failed_before_now_passing
  from policy_registry p
  left join claimed cl on cl.policy_key = p.policy_key
  left join latest  lt on lt.policy_key = p.policy_key
  left join history h  on h.policy_key  = p.policy_key
 where p.active;;
