-- BP-5-5 People v1 × BP-8: f_decide takes the schedule_draft decision — post → f_post_schedule (the sign-off role
-- check stands; the posted lines reach hr.shifts through the bridge), discard → hr.tg_discard_draft with the written
-- reason (≥ 15 characters), assign / defer as for every other source. The first agent draft is created at the end.
set search_path = public;
CREATE OR REPLACE FUNCTION public.f_decide(p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'hr'
AS $function$
declare r text := public.current_app_role()::text; v_uid uuid := auth.uid();
        v_key text := coalesce(p->>'key', ''); v_opt text := lower(coalesce(p->>'option', '')); v_note text := left(btrim(coalesce(p->>'note', '')), 2000);
        v_due date := nullif(p->>'due_on', '')::date; v_task uuid := nullif(p->>'task_id', '')::uuid;
        v_src text; v_sev text; v_fam text; v_id uuid; v_fig jsonb; v_eff jsonb := '{}'::jsonb; v_what text; v_why text; v_rec text; v_cash numeric;
        v_n int; v_ids uuid[]; v_dec uuid; v_bid bigint; v_view text; v_mark text; v_prev text; v_txt text;
        v_may text[]; v_opts jsonb;
begin
  if r is null then raise exception 'Sign in to decide.' using errcode = '42501'; end if;
  if v_key = '' or v_opt = '' then raise exception 'A decision needs a key and an option.'; end if;
  v_src := case split_part(v_key, '|', 1) when 'fg' then 'finding_group' when 'ig' then 'issue_group' when 'q' then 'question'
                when 'pe' then 'enhancement' when 'cp' then 'correction' when 'qe' then 'qa_enhancement' when 'sd' then 'schedule_draft' end;
  if v_src is null then raise exception 'Unknown decision key %.', v_key; end if;
  v_may := case v_src when 'finding_group' then array['owner','executive','admin','manager','dept_head','cfo','hr']
                      when 'question' then array['owner','executive','admin','manager','dept_head','cfo','hr']
                      when 'schedule_draft' then (select array_agg(distinct x) from unnest(coalesce((select signoff_roles from public.scheduling_policy limit 1), '{owner}'::text[]) || array['admin']) x)
                      else array['owner','executive','cfo','admin'] end;
  if not (r = any(v_may)) then raise exception 'The % role may not take this decision (it needs one of %).', r, array_to_string(v_may, ', ') using errcode = '42501'; end if;
  v_opts := case v_src when 'finding_group' then '["resolve","assign","defer"]'::jsonb when 'issue_group' then '["fix","leave","ignore","assign","defer"]'::jsonb
                       when 'question' then '["answer","assign","defer"]'::jsonb when 'qa_enhancement' then '["build_now","build_later","no"]'::jsonb
                       when 'schedule_draft' then '["post","discard","assign","defer"]'::jsonb
                       else '["approved","rejected","deferred"]'::jsonb end;
  if not (v_opts ? v_opt) then raise exception 'Option % is not one of % for this decision.', v_opt, v_opts::text; end if;
  if v_opt = 'defer' and v_due is null then raise exception 'Deferring needs a date to come back on.'; end if;
  if v_opt = 'assign' and v_task is null then raise exception 'Assigning records the task it raised — none was given.'; end if;
  if v_opt in ('resolve', 'leave', 'ignore', 'answer', 'rejected', 'deferred', 'no', 'discard') and length(v_note) < 15 then
    raise exception 'That decision needs a written reason of at least fifteen characters, so it is defensible later.';
  end if;
  v_dec := gen_random_uuid();

  if v_src = 'finding_group' then
    v_sev := split_part(v_key, '|', 2); v_fam := substr(v_key, length('fg|' || v_sev || '|') + 1);
    select count(*), coalesce(sum(coalesce(dollars, 0)), 0), min(detected_at)::text, string_agg(distinct coalesce(agent_key, agent), ', '), (array_agg(action order by detected_at desc))[1]
      into v_n, v_cash, v_txt, v_why, v_rec
      from public.agent_findings where resolved_at is null and severity = v_sev and public.f_finding_family(headline) = v_fam
       and not (scope like 'qa:%' and headline like 'Enhancement for %');
    if v_n = 0 then raise exception 'Nothing open in that family any more — it may already be decided.'; end if;
    v_what := v_fam;
    v_fig := jsonb_build_object('members', v_n, 'dollars', v_cash, 'oldest', v_txt, 'severity', v_sev, 'as_of', now());
    if v_opt = 'resolve' then
      update public.agent_findings
         set resolved_at = now(), resolution = v_note || ' — decided on Today by ' || r || ' (' || coalesce(v_uid::text, '—') || ') at ' || to_char(now(), 'YYYY-MM-DD HH24:MI') || ' UTC [decision ' || v_dec || ']'
       where resolved_at is null and severity = v_sev and public.f_finding_family(headline) = v_fam
         and not (scope like 'qa:%' and headline like 'Enhancement for %');
      get diagnostics v_n = row_count;
      v_eff := jsonb_build_object('resolved_findings', v_n, 'marker', '[decision ' || v_dec || ']');
    elsif v_opt = 'assign' then v_eff := jsonb_build_object('task_id', v_task, 'findings_left_open', v_n);
    else v_eff := jsonb_build_object('hidden_until', v_due, 'findings_left_open', v_n); end if;

  elsif v_src = 'issue_group' then
    v_sev := split_part(v_key, '|', 2); v_fam := split_part(v_key, '|', 3);
    select count(*), coalesce(sum(coalesce(dollars, 0)), 0), min(first_seen_on)::text, string_agg(distinct who_is_accountable, '; '), (array_agg(what_to_do order by last_seen_on desc))[1],
           case when count(*) = 1 then min(issue) else count(*) || ' issues of kind "' || v_fam || '"' end
      into v_n, v_cash, v_txt, v_why, v_rec, v_what
      from public.v_open_issues where needs_a_decision and severity = v_sev and regexp_replace(issue_key, '[:|].*$', '') = v_fam;
    if v_n = 0 then raise exception 'No open issue of that kind any more — it may already be decided.'; end if;
    v_fig := jsonb_build_object('members', v_n, 'dollars', v_cash, 'oldest', v_txt, 'severity', v_sev, 'as_of', now());
    if v_opt in ('fix', 'leave', 'ignore') then
      if not public.f_caller_is_admin() then raise exception 'Only the owner decides an issue.' using errcode = '42501'; end if;
      with ins as (
        insert into public.issue_decisions (issue_key, issue_title, decision, reason, decided_by, decided_at, outstanding_when_decided, detail_when_decided, review_on, superseded)
        select i.issue_key, left(i.issue, 200), v_opt, v_note || ' [decision ' || v_dec || ']', r || ' ' || coalesce(v_uid::text, ''), now(), i.record_count,
               left(coalesce(i.the_arithmetic, i.why_it_matters, ''), 1000), v_due, false
          from public.v_open_issues i where i.needs_a_decision and i.severity = v_sev and regexp_replace(i.issue_key, '[:|].*$', '') = v_fam
        returning id)
      select count(*), array_agg(id) into v_n, v_ids from ins;
      v_eff := jsonb_build_object('issue_decisions', v_n, 'ids', to_jsonb(v_ids), 'decision', v_opt);
    elsif v_opt = 'assign' then v_eff := jsonb_build_object('task_id', v_task, 'issues_left_open', v_n);
    else v_eff := jsonb_build_object('hidden_until', v_due, 'issues_left_open', v_n); end if;

  elsif v_src = 'question' then
    v_bid := split_part(v_key, '|', 2)::bigint;
    select question, coalesce(area, 'open question'), coalesce(what_is_blocked, why_it_matters), jsonb_build_object('exposure_lb', exposure_lb, 'first_seen', first_seen, 'as_of', now())
      into v_what, v_why, v_rec, v_fig from public.open_questions where id = v_bid and status = 'open';
    if v_what is null then raise exception 'That question is not open any more.'; end if;
    v_cash := 0;
    if v_opt = 'answer' then
      update public.open_questions set answer = v_note || ' [decision ' || v_dec || ']', answered_by = r || ' ' || coalesce(v_uid::text, ''), answered_at = now(), status = 'answered' where id = v_bid;
      v_eff := jsonb_build_object('question_id', v_bid, 'answered', true);
    elsif v_opt = 'assign' then v_eff := jsonb_build_object('task_id', v_task, 'question_id', v_bid);
    else v_eff := jsonb_build_object('hidden_until', v_due, 'question_id', v_bid); end if;

  elsif v_src in ('enhancement', 'correction') then
    v_bid := split_part(v_key, '|', 2)::bigint;
    if v_src = 'enhancement' then
      select coalesce(page, '?') || ': ' || coalesce(recommendation, observation), coalesce(raised_by, 'page review'), why_it_matters, jsonb_build_object('impact', impact, 'effort', effort, 'as_of', now()), 0
        into v_what, v_why, v_rec, v_fig, v_cash from public.page_enhancement where id = v_bid and status = 'proposed';
    else
      select the_issue, coalesce(raised_by, 'correction proposal'), the_proposal, jsonb_build_object('rows', rows_affected, 'pounds', pounds_affected, 'dollars', dollars_affected, 'reversible', reversible, 'as_of', now()), coalesce(dollars_affected, 0)
        into v_what, v_why, v_rec, v_fig, v_cash from public.correction_proposal where id = v_bid and status = 'proposed';
    end if;
    if v_what is null then raise exception 'That proposal is not waiting any more.'; end if;
    v_txt := public.tg_decide_issue(v_src, v_bid, v_opt, nullif(v_note, '') || ' [decision ' || v_dec || ']');
    v_eff := jsonb_build_object('proposal_id', v_bid, 'status', v_opt, 'said', v_txt);

  elsif v_src = 'schedule_draft' then -- BP-5-5 People v1: a drafted week, signed by a person
    v_id := split_part(v_key, '|', 2)::uuid;
    select v.title || ' — ' || v.placed || ' shifts placed, ' || v.open_shifts || ' open, ' || v.conflicts || ' conflict(s), ' || v.people || ' people',
           'People v1 (' || v.drafted_by_kind || coalesce(' · ' || v.agent_name, '') || ')', v.rationale, coalesce(v.projected_cost_loaded, 0),
           jsonb_build_object('lines', v.lines, 'placed', v.placed, 'open_shifts', v.open_shifts, 'conflicts', v.conflicts, 'people', v.people, 'projected_hours', v.projected_hours,
                              'covers_from', v.covers_from, 'covers_to', v.covers_to, 'as_of', now())
      into v_what, v_why, v_rec, v_cash, v_fig from public.v_schedule_draft_decisions v where v.id = v_id;
    if v_what is null then raise exception 'That draft is not waiting any more — it was posted or discarded.'; end if;
    if v_opt = 'post' then
      v_eff := public.f_post_schedule(v_id) || jsonb_build_object('draft_id', v_id, 'marker', '[decision ' || v_dec || ']');
    elsif v_opt = 'discard' then
      v_eff := hr.tg_discard_draft(v_id, v_note || ' [decision ' || v_dec || ']') || jsonb_build_object('draft_id', v_id);
      if coalesce((v_eff->>'ok')::boolean, true) is false then raise exception 'Discard refused: %', coalesce(v_eff->>'error', '?'); end if;
    elsif v_opt = 'assign' then v_eff := jsonb_build_object('task_id', v_task, 'draft_id', v_id);
    else v_eff := jsonb_build_object('hidden_until', v_due, 'draft_id', v_id); end if;

  else -- qa_enhancement: a person's or bot's "would be better" on a page (BP-17-5)
    v_id := split_part(v_key, '|', 2)::uuid;
    select headline, agent, detail, scope, jsonb_build_object('as_of', now(), 'detected_at', detected_at) into v_what, v_why, v_rec, v_view, v_fig
      from public.agent_findings where id = v_id and resolved_at is null;
    if v_what is null then raise exception 'That enhancement report is not open any more.'; end if;
    v_cash := 0; v_view := substr(v_view, 4);
    v_mark := case v_opt when 'build_now' then 'upgrade now' when 'build_later' then 'upgrade later' else 'leave' end;
    update public.agent_findings set resolved_at = now(), resolution = 'Owner mark: ' || v_mark || case when v_note <> '' then ' — ' || v_note else '' end || ' — by ' || r || ' at ' || to_char(now(), 'YYYY-MM-DD HH24:MI') || ' UTC [decision ' || v_dec || ']'
     where id = v_id;
    select upgrade_decision into v_prev from public.nav_registry where view_key = v_view;
    update public.nav_registry set upgrade_decision = v_mark, upgrade_decided_at = now(), upgrade_decided_by = r || ' ' || coalesce(v_uid::text, '') where view_key = v_view;
    get diagnostics v_n = row_count;
    v_eff := jsonb_build_object('finding_id', v_id, 'mark', v_mark, 'view_key', v_view, 'registry_rows_marked', v_n, 'previous_mark', v_prev);
  end if;

  insert into public.decisions (id, key, source, what, why, figure, cash_impact, options, recommendation, may_take, due_by, outcome, outcome_note, effect, decided_role, decided_by)
  values (v_dec, v_key, v_src, left(v_what, 400), v_why, coalesce(v_fig, '{}'::jsonb), v_cash, v_opts, v_rec, v_may, v_due, v_opt, nullif(v_note, ''), v_eff, r, v_uid);
  return jsonb_build_object('ok', true, 'id', v_dec, 'source', v_src, 'outcome', v_opt, 'effect', v_eff, 'figure', v_fig);
end $function$;
select public.f_people_agent_v1();
notify pgrst, 'reload schema';;
