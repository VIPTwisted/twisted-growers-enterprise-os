-- Added after a real case on 9 Aug 2026: Agent A proposed a closure whose proof_sql
-- referenced a view that does not exist and whose comparison used the wrong pair of
-- sources. There was no honest way to retract it - only to let a checker refuse it,
-- which would have recorded a disagreement that never happened. A proposer must be
-- able to withdraw its own work, and the withdrawal must stay on the record.
alter table finding_closure drop constraint if exists finding_closure_verdict_check;
alter table finding_closure add constraint finding_closure_verdict_check
  check (verdict in ('pending','agrees','disagrees','insufficient','withdrawn'));

alter table finding_closure drop constraint if exists refusal_needs_a_reason;
alter table finding_closure add constraint refusal_needs_a_reason
  check (verdict not in ('disagrees','insufficient','withdrawn')
         or length(btrim(coalesce(verdict_note,''))) >= 15);;
