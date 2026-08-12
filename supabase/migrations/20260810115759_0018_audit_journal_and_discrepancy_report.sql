-- ---------------------------------------------------------------------------
-- 0018 — The audit journal, and the discrepancy report the team pulls.
--
-- Owner ruling, 10 Aug 2026: "YOU WILL ADD ADJUSTMENTS AS JOURNAL ENTRIES AND
-- EXPLAIN THESE AS WILL ALL OTHER AGENTS BE REQUIRED TO". So every adjustment,
-- correction or withdrawn finding becomes a numbered entry carrying WHY, WHAT
-- PROVES IT, and WHO APPROVED IT. No agent may change a reported figure without
-- one.
--
-- NOTHING IS AUTOMATIC. An entry is raised as 'proposed'. A named person moves it
-- to 'approved'. That is the standing rule and it applies to agents above all,
-- because an agent can raise a hundred of these in an afternoon.
-- ---------------------------------------------------------------------------

create table if not exists audit_journal (
  entry_no        bigserial primary key,
  entered_on      timestamptz not null default now(),
  period          text        not null,
  entry_type      text        not null
                  check (entry_type in ('correction','reclassification','withdrawal',
                                        'accrual','write_off','disclosure','note')),
  subject         text        not null,
  reference       text,
  description     text        not null,
  reason          text        not null,
  basis           text        not null,
  evidence_sql    text,
  adjustment_lb   numeric,
  adjustment_usd  numeric,
  affects_report  text,
  raised_by       text        not null,
  status          text        not null default 'proposed'
                  check (status in ('proposed','approved','rejected','superseded')),
  approved_by     text,
  approved_at     timestamptz,
  rejected_why    text,

  /* An approved entry must name who approved it. An agent cannot approve its own
     work by leaving the field blank -- the constraint is the control, not the
     convention. */
  constraint approved_needs_an_approver
    check (status <> 'approved' or (approved_by is not null and approved_at is not null)),
  constraint rejected_needs_a_reason
    check (status <> 'rejected' or nullif(btrim(coalesce(rejected_why,'')),'') is not null),
  /* Reason and basis are the whole point. A journal of bare numbers is a ledger
     nobody can audit. */
  constraint reason_is_substantive  check (length(btrim(reason)) >= 30),
  constraint basis_is_substantive   check (length(btrim(basis))  >= 20)
);

comment on table audit_journal is
  'Every adjustment, correction and withdrawn finding, with WHY and WHAT PROVES IT. '
  'Owner ruling 10 Aug 2026: all agents must journal their adjustments. Raised as '
  'proposed; a named person approves. adjustment_lb / adjustment_usd are NULL when '
  'the entry changes an interpretation rather than a number.';

alter table audit_journal enable row level security;
drop policy if exists audit_journal_read on audit_journal;
create policy audit_journal_read on audit_journal for select to authenticated using (true);

create index if not exists audit_journal_period_idx on audit_journal (period, status);


-- The report the team pulls: everything open, everything withdrawn, one place.
create or replace view v_rpt_discrepancies as
select 'OPEN — discrepancy register'::text                as bucket,
       d.discrepancy_key                                  as key,
       d.class,
       d.subject,
       d.source_a || ' says: ' || d.source_a_says         as source_a,
       d.source_b || ' says: ' || d.source_b_says         as source_b,
       d.resolved_by_doc                                  as resolves_with,
       d.first_seen::date                                 as first_seen,
       (current_date - d.first_seen::date)                as days_open,
       case when current_date - d.first_seen::date > 7
            then 'BREACH — the owner''s rule is nothing older than a week'
            else 'inside the one-week rule' end           as clock,
       null::text                                         as outcome
from discrepancy_register d
where d.resolved_at is null

union all

select 'RESOLVED — discrepancy register',
       d.discrepancy_key, d.class, d.subject,
       d.source_a || ' says: ' || d.source_a_says,
       d.source_b || ' says: ' || d.source_b_says,
       d.resolved_by_doc, d.first_seen::date,
       (d.resolved_at::date - d.first_seen::date),
       'closed ' || d.resolved_at::date,
       d.resolution_note
from discrepancy_register d
where d.resolved_at is not null

union all

/* A finding raised in error is WITHDRAWN ON THE RECORD, never deleted. The team
   must be able to see what was claimed as readily as what was true - otherwise the
   same false alarm gets re-raised by the next agent. */
select 'WITHDRAWN — was never a real discrepancy',
       c.finding_key, c.defect_kind, c.check_key,
       'CLAIMED: ' || c.claimed,
       'ACTUALLY: ' || c.actually,
       c.evidence_sql, c.found_at::date,
       (coalesce(c.fixed_at, now())::date - c.found_at::date),
       c.impact,
       c.fix_note
from check_defect c

union all

select 'JOURNAL — ' || j.status,
       'entry ' || j.entry_no::text, j.entry_type, j.subject,
       j.description, j.reason, j.basis, j.entered_on::date,
       (current_date - j.entered_on::date),
       coalesce(j.approved_by, 'awaiting approval'),
       j.affects_report
from audit_journal j;

comment on view v_rpt_discrepancies is
  'THE report the team pulls. Open discrepancies with the one-week clock, resolved '
  'ones, findings WITHDRAWN as false alarms, and every audit journal entry. A '
  'withdrawn finding stays visible so the next agent does not re-raise it.';

grant select on v_rpt_discrepancies to authenticated;
grant select on audit_journal to authenticated;
;
