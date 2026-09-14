-- BP-17-1 Report an issue — on every page (Bible §17). Owner, 14 Sep 2026: "my bots on the platform now to work
-- too, with us as humans, testing and calling out what needs to be fixed, enhanced, and reporting issues."
-- One RPC for humans and bots: the page, the role, what is wrong or what would be better, and the figures on the
-- screen captured as they stood → agent_findings (scope qa:<view_key>), so it lands on the Findings queue and,
-- when Today exists, in the feed. Two registered reporters: qa:human and qa:bot (agent_findings requires one).
insert into public.agent_registry (agent_key, display_name, kind, what_it_watches, why_it_matters, owner, expected_every_mins, evidence_table, verified_by, enabled, added_on)
values
 ('qa:human', 'Report an issue (people)', 'review', 'Whatever a signed-in person calls out on any page: a defect or an enhancement, with the page, the role and the figures on screen.', 'Bible §17 (owner, 14 Sep 2026): humans and bots test together and report; a call-out cites the page and the figure or it is not filed.', 'Agent I', 1440, 'agent_findings', 'select count(*) from agent_findings where agent_key = ''qa:human'' and resolved_at is null;', true, current_date),
 ('qa:bot', 'Bot page-walk and call-outs', 'review', 'Every enabled page opened by the bots after each deploy: load time, console errors, error boundaries, unexplained empties, figures without provenance, dead controls, tiles without a drill.', 'Bible §17 (owner, 14 Sep 2026): a broken page is a finding before a human sees it.', 'Grok', 120, 'agent_findings', 'select max(detected_at) from agent_findings where agent_key = ''qa:bot'';', true, current_date)
on conflict (agent_key) do update set display_name = excluded.display_name, what_it_watches = excluded.what_it_watches, why_it_matters = excluded.why_it_matters, enabled = true;

create or replace function public.f_report_issue(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r text := public.current_app_role()::text; v_kind text; v_view text; v_what text; v_better text; v_id uuid; v_fp text; v_sev text; v_reporter text;
begin
  if r is null then raise exception 'Sign in to report an issue.' using errcode = '42501'; end if;
  v_kind := case when lower(coalesce(p->>'kind','')) in ('enhancement','idea','improve') then 'enhancement' else 'defect' end;
  v_view := left(coalesce(nullif(btrim(p->>'view_key'),''), 'unknown'), 120);
  v_what := left(btrim(coalesce(p->>'what', '')), 2000);
  v_better := left(btrim(coalesce(p->>'better', '')), 2000);
  if v_what = '' and v_better = '' then raise exception 'Say what is wrong or what would be better.'; end if;
  v_reporter := case when coalesce(p->>'reporter','') = 'bot' then 'qa:bot' else 'qa:human' end;
  v_sev := case when v_kind = 'defect' then coalesce(nullif(p->>'severity',''), 'elevated') else 'watch' end;
  v_fp := 'qa|' || v_view || '|' || md5(lower(v_what || '|' || v_better));
  insert into public.agent_findings (detected_at, agent, severity, headline, detail, scope, action, drill_to, fingerprint, agent_key)
  values (now(), case when v_reporter = 'qa:bot' then 'bot page-walk' else 'reported by ' || r end, v_sev,
          left(case when v_kind = 'defect' then 'Defect on ' else 'Enhancement for ' end || v_view || ': ' || coalesce(nullif(v_what,''), v_better), 200),
          'WHAT IS WRONG: ' || coalesce(nullif(v_what,''), '—') || E'\nWHAT WOULD BE BETTER: ' || coalesce(nullif(v_better,''), '—')
          || E'\nPAGE: ' || v_view || ' · ROLE: ' || r || ' · ADDRESS: ' || coalesce(p->>'href','') || ' · VIEWPORT: ' || coalesce(p->>'viewport','')
          || E'\nFIGURES ON SCREEN (captured as they stood): ' || coalesce(left(p->>'figures', 1500), 'none captured')
          || E'\nREPORTED BY: ' || v_reporter || ' · ' || coalesce(auth.uid()::text, '—'),
          'qa:' || v_view, case when v_kind = 'defect' then 'fix on the page named; re-test; the reporter sees the fix on the page' else 'owner marks build now / later / no on Today' end,
          v_view, v_fp, v_reporter)
  returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id, 'kind', v_kind, 'scope', 'qa:' || v_view);
end $$;
grant execute on function public.f_report_issue(jsonb) to authenticated;;
