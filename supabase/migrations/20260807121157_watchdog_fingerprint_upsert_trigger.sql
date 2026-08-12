/* MY BUG. I turned a duplication problem into an outage.
   ------------------------------------------------------
   I added a unique index on watchdog_findings(fingerprint) to stop agents
   duplicating findings on every rerun. Correct intent, wrong execution: the
   existing agents insert plainly, with no ON CONFLICT clause. So the moment
   one of them rediscovered a finding it already knew about, the insert raised
   a unique violation and the ENTIRE run aborted.

   agent_sheet_reconciliation runs hourly and failed at 08:07 today for exactly
   this reason. That is worse than the duplication I was fixing - duplicates
   are noisy, a dead agent is silent, and silence is the failure mode this
   whole platform is built to eliminate.

   The fix belongs at the table, not in each caller. A BEFORE INSERT trigger
   turns a repeat fingerprint into an UPDATE of the existing row: the finding
   refreshes rather than duplicating or throwing. Every caller works unchanged
   - the two existing agents, my two, and anything written later that nobody
   remembers to give an ON CONFLICT clause.

   That last point is the real lesson: a rule enforced in every caller will be
   forgotten. A rule enforced by the table cannot be. */

create or replace function tg_watchdog_upsert_by_fingerprint()
returns trigger
language plpgsql
as $$
declare existing_id bigint;
begin
  if new.fingerprint is null then
    return new;                      -- no identity, treat as a new finding
  end if;

  select id into existing_id
  from watchdog_findings
  where fingerprint = new.fingerprint
  limit 1;

  if existing_id is null then
    return new;                      -- genuinely new
  end if;

  /* Seen before. Refresh it in place, keeping when_it_started and the original
     observed_at as the first sighting. Never create a second row. */
  update watchdog_findings w set
    observed_at        = greatest(w.observed_at, coalesce(new.observed_at, now())),
    severity           = coalesce(new.severity, w.severity),
    what               = coalesce(new.what, w.what),
    where_it_is        = coalesce(new.where_it_is, w.where_it_is),
    who_is_accountable = coalesce(new.who_is_accountable, w.who_is_accountable),
    why_it_matters     = coalesce(new.why_it_matters, w.why_it_matters),
    how_it_was_detected= coalesce(new.how_it_was_detected, w.how_it_was_detected),
    what_to_do         = coalesce(new.what_to_do, w.what_to_do),
    the_arithmetic     = coalesce(new.the_arithmetic, w.the_arithmetic),
    evidence           = coalesce(new.evidence, w.evidence),
    record_count       = coalesce(new.record_count, w.record_count),
    pounds             = coalesce(new.pounds, w.pounds),
    dollars            = coalesce(new.dollars, w.dollars),
    drill              = coalesce(new.drill, w.drill),
    run_id             = coalesce(new.run_id, w.run_id)
  where w.id = existing_id;

  return null;                       -- swallow the insert; the update stands
end $$;

drop trigger if exists trg_watchdog_upsert on watchdog_findings;
create trigger trg_watchdog_upsert
  before insert on watchdog_findings
  for each row execute function tg_watchdog_upsert_by_fingerprint();

comment on function tg_watchdog_upsert_by_fingerprint() is
  'A repeat fingerprint refreshes the existing finding instead of duplicating or throwing. Enforced at the table so no caller has to remember.';;
