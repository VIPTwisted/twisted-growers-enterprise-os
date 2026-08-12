-- Agent I (Database COO), 11 Aug 2026. Filed for review as DBI-015 (reviewers V, X, W).
-- Owner: "fixes require finding root issue; correcting, documenting, so in future it is
-- automatically correct and our brain gets smarter and smarter."
--
-- WHY A LEDGER AND NOT A HABIT. Every fix on this platform produces three things and only the
-- first survives by default:
--     1. the correction        - lands in the database immediately
--     2. the guard             - written only if somebody remembers
--     3. the written knowledge - written only if somebody remembers, and forgotten first
-- Two out of three depend on memory, so the same class of defect returns wearing a new tag. The
-- evidence is in the queue: a lineage break open 966 days, a transfer-not-received cause open 216
-- days, and 1,261 of 1,570 findings with nobody's name on them.
--
-- THE TEETH. A root cause CANNOT be marked resolved unless it names the guard that prevents
-- recurrence AND where the knowledge is written down. That is enforced by trigger, not by
-- convention, because convention is what failed. The constraint is the entire point of the table:
-- closing something without a guard is not a fix, it is a pause.
--
-- SYMPTOM VERSUS CAUSE. the_symptom is what the finding said. the_root_cause must be different
-- text - a cause that restates its symptom is not a cause. Tonight's examples, all real:
--     symptom "dashboard numbers frozen a week" -> cause "the tile shows computation age, never
--             data age, so a dead pipeline renders as healthy"
--     symptom "374,346 USD of phantom third-party spend" -> cause "counterparty_role had zero
--             readers; an owner ruling was recorded and wired to nothing"
--     symptom "four findings open after being fixed" -> cause "v_findings hardcoded resolved_at
--             to NULL for the whole watchdog branch"
-- In all three the symptom was in a different department from the cause. That is normal, and it
-- is why fixing findings one at a time never empties the queue.
--
-- HOW THE BRAIN GETS SMARTER. documented_where must point at something an agent reads at RUNTIME
-- - a brain file, a table or column comment, a conversion_factors row, a tax_280e_doctrine rule,
-- an examination_standard test. A fix documented only in a commit message teaches nobody. Prose
-- in a document nobody opens is the meta-trap Agent D correctly named today and then walked into.
--
-- UNDO: drop trigger trg_root_cause_needs_a_guard on root_cause_ledger;
--       drop function tg_root_cause_needs_a_guard(); drop table root_cause_ledger;

create table if not exists root_cause_ledger (
  id                 bigserial primary key,
  pattern_key        text,
  the_symptom        text not null,
  the_root_cause     text not null,
  why_it_happened    text not null,
  the_fix_applied    text,
  guard_that_prevents_recurrence text,
  guard_kind         text check (guard_kind in
                       ('verification_check','checker_registry','database_trigger','constraint',
                        'ci_gate','hook','none_possible')),
  documented_where   text,
  findings_retired   integer,
  status             text not null default 'open'
                     check (status in ('open','fix_applied','resolved','accepted_no_fix')),
  owned_by           text,
  found_on           date not null default current_date,
  resolved_on        date,
  accepted_reason    text,
  constraint cause_must_differ_from_symptom check (btrim(lower(the_root_cause)) <> btrim(lower(the_symptom)))
);

alter table root_cause_ledger enable row level security;

comment on table root_cause_ledger is
 'One row per ROOT CAUSE, not per finding. Work v_finding_causes to find them and record them '
 'here. A row cannot reach status resolved without naming the guard that prevents recurrence and '
 'where the knowledge was written down - enforced by trigger, because convention is exactly what '
 'failed. Closing without a guard is not a fix, it is a pause.';

comment on column root_cause_ledger.the_root_cause is
 'Must differ from the_symptom - enforced. A cause that restates its symptom is not a cause. '
 '"Numbers were frozen" is a symptom; "the tile reports computation age, never data age" is a '
 'cause.';

comment on column root_cause_ledger.documented_where is
 'Must point at something an agent reads AT RUNTIME: a brain file, a table or column comment, a '
 'conversion_factors row, a tax_280e_doctrine rule, an examination_standard test. A fix recorded '
 'only in a commit message teaches nobody and the defect returns wearing a new tag.';

comment on column root_cause_ledger.guard_kind is
 'none_possible is a legitimate answer and requires accepted_reason. Claiming a guard exists when '
 'it does not is far worse than admitting one cannot.';

create or replace function public.tg_root_cause_needs_a_guard()
returns trigger language plpgsql as $fn$
begin
  if new.status = 'resolved' then
    if coalesce(btrim(new.guard_that_prevents_recurrence), '') = '' or new.guard_kind is null then
      raise exception
        'Cannot resolve root cause %: no guard named. A fix without a guard is a pause - the same '
        'defect returns wearing a new tag. Name the verification check, checker, trigger, '
        'constraint, CI gate or hook that now prevents it, or set guard_kind = none_possible with '
        'an accepted_reason.', coalesce(new.pattern_key, new.id::text);
    end if;
    if coalesce(btrim(new.documented_where), '') = '' then
      raise exception
        'Cannot resolve root cause %: no documentation named. Point at something an agent reads at '
        'runtime - a brain file, a table or column comment, a conversion_factors row, a doctrine '
        'rule. Undocumented knowledge is relearned the expensive way.',
        coalesce(new.pattern_key, new.id::text);
    end if;
    if new.guard_kind = 'none_possible' and coalesce(btrim(new.accepted_reason), '') = '' then
      raise exception
        'Cannot resolve root cause %: guard_kind is none_possible with no accepted_reason. If '
        'nothing can prevent this, say why in writing so the next person does not assume it was '
        'an oversight.', coalesce(new.pattern_key, new.id::text);
    end if;
    if new.resolved_on is null then new.resolved_on := current_date; end if;
  end if;
  if new.status = 'accepted_no_fix' and coalesce(btrim(new.accepted_reason), '') = '' then
    raise exception 'Cannot accept root cause % without an accepted_reason.',
      coalesce(new.pattern_key, new.id::text);
  end if;
  return new;
end $fn$;

create trigger trg_root_cause_needs_a_guard
  before insert or update on root_cause_ledger
  for each row execute function tg_root_cause_needs_a_guard();

-- Seed with tonight's three, all real, all already carrying their guard and their documentation.
insert into root_cause_ledger
 (pattern_key, the_symptom, the_root_cause, why_it_happened, the_fix_applied,
  guard_that_prevents_recurrence, guard_kind, documented_where, findings_retired, status, owned_by)
values
 (null,
  'Command Center numbers did not change for six days while the header said "Live from the records".',
  'Every dashboard header reports the age of the COMPUTATION, never the age of the DATA. A dead pipeline therefore renders as a healthy tile.',
  'The refresh job was monitored and the values were not. The job succeeded 144 times a day throughout, so every alarm we had was green. I made the same mistake in my own verification: I confirmed the job stopped erroring and reported the dashboard fixed.',
  'Built v_kpi_staleness, which judges each KPI on whether its VALUE moves, and kpi_freshness_policy, which declares per KPI how long stillness is acceptable or why it is exempt.',
  'dashboard-values-actually-move', 'verification_check',
  'v_kpi_staleness and kpi_freshness_policy table comments; migration kpi_staleness_and_null_guard',
  null, 'resolved', 'Agent I'),
 (null,
  'The Command tile reported 1,276,288 USD of third-party spend, of which 374,346 USD was our own material returning from a 3PL warehouse.',
  'counterparty_role had ZERO dependent objects. The owner ruling that Eagle Eyes is a warehouse, not a supplier, was recorded in a table nothing read.',
  'A ruling was captured as data without anything being wired to consume it. Nobody checks whether a decision table has readers, so an inert control looks identical to a working one.',
  'Bound counterparty_role into v_dept_dash_third_party so counts_as_purchase = false excludes the custody legs. Spend restated to 901,941 USD and the mixed-basis 379/lb corrected to 301/lb.',
  'third-party-received-has-manifest plus check_defect rows CD-1 to CD-3', 'verification_check',
  'v_dept_dash_third_party comment; tax_280e_doctrine rule custody-is-not-purchase; check_defect CD-3',
  null, 'resolved', 'Agent I'),
 (null,
  'Four findings stayed open for up to four days after the problems behind them had been fixed.',
  'v_findings hardcoded resolved_at to NULL for the entire watchdog branch, so no watchdog finding could ever be represented as resolved.',
  'watchdog_findings had no resolution column at all, so the spine had nothing to read. Detection was built with real care and closure was never designed, which is why the queue reached 1,584.',
  'Added watchdog_findings.cleared_at, taught v_findings to read it, and built tg_verification_escalate() to raise and clear findings automatically from the verification suite.',
  'findings-spine-can-resolve', 'verification_check',
  'watchdog_findings.cleared_at comment; v_findings comment; migration v_findings_watchdog_branch_can_resolve',
  4, 'resolved', 'Agent I');;
