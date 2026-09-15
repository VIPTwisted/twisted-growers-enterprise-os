-- BP-13: f_finding_family strips ": Capitalised tail" from a headline, so the eight onboarding blockers collapsed into
-- ONE Today family "Onboarding blocker" — one decision for eight different steps owned by different people. The
-- headline is now the step itself with the progress in brackets ("Every active employee has a kiosk PIN (onboarding
-- step, 0 of 27)"), one family per step. The eight findings filed under the old headline are closed with the reason
-- and re-filed by the watch in the same migration.
set search_path = public;
create or replace function public.f_onboarding_watch()
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_new int := 0; v_cleared int := 0; r record;
begin
  for r in select * from public.v_onboarding_pack where kind = 'blocker' and status <> 'done' loop
    insert into public.agent_findings (detected_at, agent, severity, headline, detail, metric, units, scope, action, drill_to, fingerprint, agent_key)
    select now(), 'Onboarding', 'critical', r.item || ' (onboarding step, ' || r.progress || ')',
           r.why_it_matters || ' Measured now: ' || r.evidence || '. Unlocks: ' || coalesce(nullif(r.unlocks, ''), '—') || '.',
           r.done_count, 'of ' || r.needed_count, 'BP-13:onboarding:' || r.id, r.what_to_do || ' (' || r.owner_role || ')', coalesce(r.drill_to, 'onboarding_pack'),
           'onboarding|' || r.id, 'watch:onboarding'
    where not exists (select 1 from public.agent_findings f where f.fingerprint = 'onboarding|' || r.id and f.resolved_at is null);
    v_new := v_new + (case when found then 1 else 0 end);
  end loop;
  update public.agent_findings f set resolved_at = now(), resolution = 'cleared by the onboarding watch: the step measured done at ' || now()::text
   where f.agent_key = 'watch:onboarding' and f.resolved_at is null
     and not exists (select 1 from public.v_onboarding_pack p where 'onboarding|' || p.id = f.fingerprint and p.kind = 'blocker' and p.status <> 'done');
  get diagnostics v_cleared = row_count;
  return jsonb_build_object('new', v_new, 'cleared', v_cleared, 'open', (select count(*) from public.v_onboarding_pack where status <> 'done'), 'at', now());
end $$;
update public.agent_findings set resolved_at = now(), resolution = 'superseded 15 Sep 2026: re-filed under a headline that is one Today family per step (the old "Onboarding blocker: …" headlines collapsed into one family)'
 where agent_key = 'watch:onboarding' and resolved_at is null and headline like 'Onboarding blocker: %';
select public.f_onboarding_watch();;
