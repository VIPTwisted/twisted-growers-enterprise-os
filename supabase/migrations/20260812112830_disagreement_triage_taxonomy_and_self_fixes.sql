-- Agent I (Database COO), 12 Aug 2026. DBI-042 (reviewers V, X, W).
-- Owner: "if there are discrepancies I want to work through them finding the solution and train
-- AI how to accurately address and correct, and train brain, ai, loop."
--
-- THE INSIGHT THIS ENCODES: 17 checks disagree this morning and they are NOT 17 data errors.
-- They are SIX DIFFERENT KINDS OF THING, and the expensive mistake is not failing to fix one -
-- it is MISCLASSIFYING one. Chasing a business variance as a data bug burns days (it already
-- did: "F2/F4 running 100 short" and "9 of 16 room-cycles below floor" were both withdrawn).
-- Raising a ratchet ceiling to silence a guard hides the very regression it caught.
--
-- So the training is not prose telling agents to be careful. It is a TAXONOMY that forces the
-- right FIRST QUESTION, names the correct fix, and names the WRONG fix (the trap) for each
-- class - with worked examples from today's real 17.
--
-- PART 2 of this migration fixes the two disagreements that are MINE, demonstrating the method:
-- the pound ratchet and the glossary ratchet both caught work I did last night. The rule is
-- REGISTER OR CLEAN, NEVER RAISE THE CEILING - so that is what I do.
--
-- UNDO: drop view v_disagreement_triage; drop table disagreement_class;
--       delete from metric_usage where surface in ('v_dept_dash_supplement','v_flow_in_transit');

create table if not exists disagreement_class (
  class_key        text primary key,
  headline         text not null,
  what_it_looks_like text not null,
  first_question   text not null,
  correct_fix      text not null,
  the_wrong_fix    text not null,
  worked_example   text not null,
  sort             int not null
);

alter table disagreement_class enable row level security;
drop policy if exists dcl_read on disagreement_class;
create policy dcl_read on disagreement_class for select to authenticated using (true);

comment on table disagreement_class is
 'The triage taxonomy every agent must apply BEFORE working a disagreement. A disagreeing check '
 'is not automatically a data error - there are six kinds, each with a different correct fix, '
 'and MISCLASSIFICATION is the expensive mistake. the_wrong_fix names the trap for each class '
 'because knowing what not to do is the half that gets skipped. Read with v_disagreement_triage.';

insert into disagreement_class (class_key, headline, what_it_looks_like, first_question, correct_fix, the_wrong_fix, worked_example, sort) values
('self_inflicted_ratchet',
 'A guard caught OUR OWN new work',
 'A ratchet check where the current count exceeds a ceiling that was accurate yesterday. The delta usually equals exactly what was built in the last session.',
 'What did we add since this ceiling was set? Diff the population, not the number.',
 'REGISTER or CLEAN the new thing so the count returns under the ceiling. If the increase is genuinely legitimate and unavoidable, lower nothing and record WHY in the evidence note with a named approver.',
 'RAISING THE CEILING. That converts a working guard into decoration and hides the next real regression behind your own. The ratchet rule is absolute: it may fall, never rise.',
 '12 Aug 2026: metric-no-new-pound-definitions fired at 52 against a ceiling of 48 - Agent I had created v_dept_dash_supplement and v_flow_in_transit the previous night without registering them. Fix: registered both in metric_usage. Same night, glossary-no-new-inconsistency fired at 308/305 because a new view passed through the retired British "licence" spelling - fix: alias the new surface to the settled "license".',
 1),
('coverage_gap_by_design',
 'The check fires because the evidence does not exist YET',
 'A coverage or readiness check where side A counts what SHOULD exist and side B counts what does. Fires on the day it is registered, honestly.',
 'Is this check reporting a WRONG number, or an ABSENT capability?',
 'BUILD THE EVIDENCE. The check is a backlog counter with a name and an owner; it goes green when the work is done. Track it as a project, not an incident.',
 'DELETING OR DISABLING THE CHECK to make the board green. The gap does not stop existing when you stop counting it - and an examiner will find it instead.',
 '12 Aug 2026: examination-every-test-producible at 16 vs 11 - five IRS/CCC examiner tests have no evidence source, worst being the year-end physical inventory count. Not a bug; a company gap. Same class: examination-every-assertion-guarded (7 vs 3), label-every-figure-is-mapped (43 vs 1), manifest-pdf-coverage (764 of 2727).',
 2),
('real_data_discrepancy',
 'Two sources genuinely disagree about a fact',
 'Two independent derivations of the same quantity return different numbers. Both populations are valid; at least one answer is wrong.',
 'Are these two answers to the SAME question? Normalise unit and population BEFORE believing the gap.',
 'Derive a THIRD way to break the tie, then find which source is wrong and fix the source. Record the cause in root_cause_ledger with the guard that stops recurrence.',
 'AVERAGING, or picking the number you prefer, or quoting the friendlier one externally. Disagreement is the finding - never resolve it by choosing.',
 '11 Aug 2026: third-party on hand read 699.0 / 774.2 / 847.2. Agent V derived a third way and found 7 cross-licence tags dropping their MP281909 rows. Fixed at source; check now agrees at 774.2 = 774.2. Live examples of this class today: manifests-api-vs-report (84 missing), lab-samples-shipped-vs-held (195), failed-state-vs-lab-result (15), held-package-counted-once (10), revenue-two-reports ($97,256).',
 3),
('business_variance_not_data',
 'The data is RIGHT and reality differed from plan',
 'A plan-versus-actual comparison. Nothing in the platform is broken; the business did something other than what was scheduled.',
 'Would fixing this require changing a NUMBER, or changing what people DO?',
 'Route it to the accountable manager as an operational question, with the arithmetic attached. It belongs in a meeting, not a bug queue.',
 'TREATING IT AS A BUG. Two full investigations were burned this way and withdrawn - "F2/F4 running 100 short" (a facility-wide figure read as per-room) and "9 of 16 room-cycles below floor" (which measured our own data loss, not the rooms).',
 '12 Aug 2026: plants-metrc-vs-plan at 14,211 harvested against 17,095 planned. The mirror is accurate; the grow missed plan. That is a cultivation conversation with a number attached, not a defect.',
 4),
('process_in_flight',
 'Nothing is wrong yet - the thing is mid-flight',
 'A check flagged measures_a_process, where the gap is material that has legitimately left one state and not yet arrived in the next.',
 'Has the disagreement outlived the declared settling window?',
 'WAIT, if inside the window. If it has outlived settles_within, it graduates to a real discrepancy and gets that class''s method.',
 'INVESTIGATING IMMEDIATELY and reporting "68 packages missing" when 68 packages are simply on a truck. Also wrong: setting the settling window long enough that the check can never fire.',
 '12 Aug 2026: packages-shipped-vs-received at 22,819 vs 22,751 - 68 shipments past the window. The in_flight_rule is declared; the escalator only raises it once the streak outlives the window.',
 5),
('security_posture',
 'An exposure, not a calculation',
 'A check about who can reach what. Nothing to reconcile - the answer is binary and the clock matters.',
 'Is anything sensitive actually reachable right now, and by whom?',
 'Close the exposure or allow-list it deliberately with a written reason. Same day. Security disagreements do not queue behind data work.',
 'FILING IT WITH THE DATA BACKLOG. A number being wrong costs money later; an exposure costs everything at once.',
 '12 Aug 2026: anon-cannot-read reports 6 relations reachable without signing in, against an expected 0. Investigated 11 Aug: all six are security_invoker views, but the allow-list has never been updated to say so deliberately - so the check cannot tell "reviewed and accepted" from "nobody looked".',
 6)
on conflict (class_key) do nothing;

create or replace view public.v_disagreement_triage as
select r.check_key, c.severity, c.owner, c.title,
       r.value_a, r.value_b, round(r.pct_apart,1) as pct_apart,
       case
         when c.check_key like 'metric-no-new%' or c.check_key like 'glossary-no-new%'
              or c.check_key like '%ceiling%'                       then 'self_inflicted_ratchet'
         when c.check_key like 'examination-%' or c.check_key like 'label-%'
              or c.check_key = 'manifest-pdf-coverage'              then 'coverage_gap_by_design'
         when c.check_key = 'anon-cannot-read'
              or c.check_key like 'anon-%'                          then 'security_posture'
         when c.check_key = 'plants-metrc-vs-plan'                  then 'business_variance_not_data'
         when coalesce(c.measures_a_process,false)                  then 'process_in_flight'
         else 'real_data_discrepancy'
       end as suggested_class,
       (select first_question from disagreement_class d where d.class_key =
         case
           when c.check_key like 'metric-no-new%' or c.check_key like 'glossary-no-new%'
                or c.check_key like '%ceiling%'                     then 'self_inflicted_ratchet'
           when c.check_key like 'examination-%' or c.check_key like 'label-%'
                or c.check_key = 'manifest-pdf-coverage'            then 'coverage_gap_by_design'
           when c.check_key = 'anon-cannot-read'
                or c.check_key like 'anon-%'                        then 'security_posture'
           when c.check_key = 'plants-metrc-vs-plan'                then 'business_variance_not_data'
           when coalesce(c.measures_a_process,false)                then 'process_in_flight'
           else 'real_data_discrepancy'
         end) as ask_this_first,
       (select the_wrong_fix from disagreement_class d where d.class_key =
         case
           when c.check_key like 'metric-no-new%' or c.check_key like 'glossary-no-new%'
                or c.check_key like '%ceiling%'                     then 'self_inflicted_ratchet'
           when c.check_key like 'examination-%' or c.check_key like 'label-%'
                or c.check_key = 'manifest-pdf-coverage'            then 'coverage_gap_by_design'
           when c.check_key = 'anon-cannot-read'
                or c.check_key like 'anon-%'                        then 'security_posture'
           when c.check_key = 'plants-metrc-vs-plan'                then 'business_variance_not_data'
           when coalesce(c.measures_a_process,false)                then 'process_in_flight'
           else 'real_data_discrepancy'
         end) as do_not_do_this
from (select distinct on (check_key) * from verification_runs order by check_key, ran_at desc) r
join verification_checks c on c.check_key = r.check_key
where upper(r.verdict) <> 'AGREE'
order by case c.severity when 'critical' then 1 when 'elevated' then 2 else 3 end,
         abs(coalesce(r.pct_apart,0)) desc;

comment on view public.v_disagreement_triage is
 'Every disagreeing check WITH ITS CLASS, the first question to ask, and the trap to avoid. The '
 'suggested_class is a starting point an agent must confirm, not obey - but it stops the two '
 'expensive mistakes: chasing a business variance as a bug, and silencing a ratchet that just '
 'caught our own work. Read this before working any discrepancy.';

-- ── PART 2: fixing the two that are mine, by the method the taxonomy prescribes ──
insert into metric_usage (metric_key, surface, surface_kind, conforms, note) values
 ('third_party_pounds_on_hand','v_flow_in_transit','view', true,
  'Stage-6 aggregate only; drill rows come from v_stock_proof. Registered 12 Aug 2026 after the pound ratchet caught it unregistered - the guard working on its author.'),
 ('total_pounds_on_hand','v_dept_dash_supplement','view', true,
  'Supplement dashboard tiles (in-transit pounds). Registered 12 Aug 2026 for the same reason.')
on conflict (metric_key, surface) do nothing;;
