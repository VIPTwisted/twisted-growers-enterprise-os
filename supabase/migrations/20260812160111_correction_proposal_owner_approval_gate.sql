-- Agent I (Database COO), 12 Aug 2026. DBI-049 (reviewers V, X, W).
-- OWNER RULING, and it outranks every convenience: audit agents FLAG, they do not FIX. Nothing
-- touching data changes without his approval. His stated reason - "I don't feel they are smart
-- enough or have been trained as to what each must do and how we operate" - is evidenced: today
-- alone an agent regenerated a schema baseline inside a front-end delivery, and I raised a
-- ratchet ceiling twenty minutes after codifying that raising ceilings is forbidden.
--
-- WHY A SEPARATE REGISTER. watchdog_findings answers "what is wrong". This answers "what should
-- change, why that would fix it, and how it never happens again" - and it carries an APPROVAL
-- GATE the owner alone opens. Mixing an approval workflow into the auto-populated findings table
-- would let a machine-written row look like an approved instruction.
--
-- THE SIX QUESTIONS EVERY PROPOSAL MUST ANSWER, enforced by length constraints rather than
-- etiquette, because a vague proposal is how a bad change gets waved through:
--   1 the_issue              what is wrong, with the measurement
--   2 the_evidence           the SQL and the numbers that prove it - re-runnable by him
--   3 what_needs_fixing      the specific object and rows
--   4 the_proposal           exactly what would be done
--   5 why_this_is_the_fix    the MECHANISM - why this corrects the cause, not the symptom
--   6 how_it_never_repeats   the guard, mapping or code change that prevents recurrence
-- Number 6 is the one the owner asked for by name and the one agents skip: a correction with no
-- guard is a correction that gets made again next quarter.
--
-- THE GATE IS A TRIGGER, NOT A CONVENTION. status cannot reach 'applied' unless it passed
-- through 'approved' with an approver and a date. A rejection needs a reason. An applied
-- proposal needs the migration that carried it.
--
-- UNDO: drop trigger trg_proposal_gate on correction_proposal;
--       drop function tg_proposal_gate(); drop view v_proposals_for_owner;
--       drop table correction_proposal.

create table if not exists correction_proposal (
  id                  bigserial primary key,
  raised_by           text not null,
  raised_at           timestamptz not null default now(),
  domain              text not null,
  target_object       text not null,
  severity            text not null check (severity in ('critical','elevated','watch')),
  the_issue           text not null check (length(btrim(the_issue)) >= 40),
  the_evidence        text not null check (length(btrim(the_evidence)) >= 30),
  what_needs_fixing   text not null check (length(btrim(what_needs_fixing)) >= 20),
  the_proposal        text not null check (length(btrim(the_proposal)) >= 40),
  why_this_is_the_fix text not null check (length(btrim(why_this_is_the_fix)) >= 40),
  how_it_never_repeats text not null check (length(btrim(how_it_never_repeats)) >= 40),
  rows_affected       bigint,
  pounds_affected     numeric,
  dollars_affected    numeric,
  risk_if_wrong       text not null check (length(btrim(risk_if_wrong)) >= 20),
  reversible          boolean not null default true,
  status              text not null default 'proposed'
                      check (status in ('proposed','approved','rejected','applied','verified')),
  owner_note          text,
  decided_at          timestamptz,
  applied_migration   text,
  applied_at          timestamptz,
  verified_by         text,
  verified_at         timestamptz,
  linked_fingerprint  text
);

alter table correction_proposal enable row level security;
drop policy if exists cp_read    on correction_proposal;
drop policy if exists cp_insert  on correction_proposal;
drop policy if exists cp_decide  on correction_proposal;
create policy cp_read   on correction_proposal for select to authenticated using (true);
create policy cp_insert on correction_proposal for insert to authenticated
  with check (status = 'proposed' and length(btrim(raised_by)) > 0);
create policy cp_decide on correction_proposal for update to authenticated
  using (f_caller_is_admin()) with check (f_caller_is_admin());

comment on table correction_proposal is
 'OWNER RULING 12 Aug 2026: audit agents FLAG, they do not FIX. Every proposed data correction '
 'lands here answering six questions - the issue, the evidence, what needs fixing, the proposal, '
 'WHY IT IS THE FIX, and HOW IT NEVER REPEATS - and nothing may be applied until the owner '
 'approves it. Insert is open to any agent but only with status = proposed; deciding is '
 'admin-only; reaching applied without passing through approved is refused by trigger. A '
 'correction with no recurrence guard is a correction that gets made again next quarter, which '
 'is why how_it_never_repeats is mandatory rather than encouraged.';

comment on column correction_proposal.why_this_is_the_fix is
 'The MECHANISM. Not "this will fix it" - WHY. Which cause does it remove, and how do we know '
 'that cause is the real one rather than a symptom that correlates.';

comment on column correction_proposal.how_it_never_repeats is
 'The named guard, mapping or code change that prevents recurrence: a verification check, a '
 'trigger, a constraint, a registry row, a validator. "Be careful next time" is not an answer.';

create or replace function public.tg_proposal_gate()
returns trigger language plpgsql as $fn$
begin
  if new.status = 'applied' and old.status not in ('approved','applied') then
    raise exception
      'Proposal % cannot go straight to applied from %. The owner approves first - that is the '
      'whole point of this register. Set status = approved with owner_note, then apply.',
      new.id, old.status;
  end if;
  if new.status in ('approved','rejected') and old.status = 'proposed' then
    if not f_caller_is_admin() then
      raise exception 'Only the owner decides a correction proposal. Agent decisions are not decisions.';
    end if;
    new.decided_at := coalesce(new.decided_at, now());
  end if;
  if new.status = 'rejected' and coalesce(btrim(new.owner_note),'') = '' then
    raise exception 'A rejection needs a reason - the next agent must know why, or it will be proposed again.';
  end if;
  if new.status = 'applied' and coalesce(btrim(new.applied_migration),'') = '' then
    raise exception 'An applied proposal must name the migration that carried it. No unsourced changes.';
  end if;
  if new.status = 'applied' then new.applied_at := coalesce(new.applied_at, now()); end if;
  return new;
end $fn$;

create trigger trg_proposal_gate
  before update on correction_proposal
  for each row execute function tg_proposal_gate();

create or replace view public.v_proposals_for_owner as
select id, raised_by, raised_at, domain, target_object, severity,
       the_issue, the_evidence, what_needs_fixing, the_proposal,
       why_this_is_the_fix, how_it_never_repeats,
       rows_affected, pounds_affected, dollars_affected, risk_if_wrong, reversible,
       case severity when 'critical' then 1 when 'elevated' then 2 else 3 end as rank
from correction_proposal
where status = 'proposed'
order by rank, coalesce(dollars_affected,0) desc, coalesce(pounds_affected,0) desc, raised_at;

comment on view public.v_proposals_for_owner is
 'The owner''s decision queue: every flagged data correction awaiting his yes or no, worst first, '
 'each carrying its evidence, its mechanism and its recurrence guard. Nothing in this view has '
 'been applied to anything.';;
