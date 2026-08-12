/* MY ERROR, FIXED.
   ----------------
   Every object I created tonight was readable by anon - the role every
   anonymous visitor to the site holds. Supabase grants SELECT to anon by
   default on new objects in public, so "grant select to authenticated" ADDED a
   grant rather than restricting one. I assumed it was the gate. It is not.

   Nineteen objects, including v_findings (862 findings with dollar figures),
   v_sync_report (2,385 rows of infrastructure detail), v_harvest_report (380
   harvests) and v_strain_performance (which strains yield best - competitively
   sensitive).

   Revoked here. The wider exposure the senior review found - 30 relations and
   131 anon-executable functions - is a bigger sweep and is not mine to make
   unilaterally, but everything below is. */

revoke all on
  v_findings, v_findings_live, v_findings_rolled,
  v_sync_report, v_sync_digest, v_agent_health, v_exposure,
  v_harvest_report, v_strain_performance, v_overrides_active,
  v_standard_history,
  mv_tower_inventory,
  agent_registry, verification_checks, verification_runs,
  conversion_factor_history, strain_scorecard, finding_owners,
  finding_state, finding_state_history, canary_runs, tg_overrides,
  schedule_proposals, schedule_proposal_lines
from anon;

/* Functions I created are equally exposed by default. None of them should be
   callable by a stranger - two of them WRITE. */
revoke all on function tg_canary()                                     from anon, public;
revoke all on function tg_canary_record()                              from anon, public;
revoke all on function tg_sync_review()                                from anon, public;
revoke all on function tg_verify()                                     from anon, public;
revoke all on function tg_propose_schedule(date,date,integer,integer,text) from anon, public;
revoke all on function f_rule_at(text, timestamptz)                    from anon, public;
revoke all on function f_override(text,text,text,text)                 from anon, public;
revoke all on function f_override_num(text,text,text,numeric)          from anon, public;
revoke all on function f_price_per_lb(text)                            from anon, public;

/* Re-grant to signed-in users only - the app never calls these as anon. */
grant select on
  v_findings, v_findings_live, v_findings_rolled,
  v_sync_report, v_sync_digest, v_agent_health, v_exposure,
  v_harvest_report, v_strain_performance, v_overrides_active,
  v_standard_history, mv_tower_inventory,
  agent_registry, verification_checks, verification_runs,
  conversion_factor_history, strain_scorecard, finding_owners,
  finding_state, finding_state_history, canary_runs, tg_overrides,
  schedule_proposals, schedule_proposal_lines
to authenticated;

grant insert, update, delete on
  strain_scorecard, finding_owners, finding_state, tg_overrides,
  agent_registry, schedule_proposals, schedule_proposal_lines
to authenticated;

grant execute on function f_rule_at(text, timestamptz)                 to authenticated;
grant execute on function f_override(text,text,text,text)              to authenticated;
grant execute on function f_override_num(text,text,text,numeric)       to authenticated;
grant execute on function f_price_per_lb(text)                         to authenticated;
grant execute on function tg_canary()                                  to authenticated;
grant execute on function tg_propose_schedule(date,date,integer,integer,text) to authenticated;;
