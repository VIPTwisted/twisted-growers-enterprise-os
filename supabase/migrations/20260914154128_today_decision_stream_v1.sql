-- BP-8 Today — the decision stream v1, a child of Command Center (BP-7). Owner, 14 Sep 2026.
-- A decision is the CLASS, not the row: 3,662 open findings are 121 decisions (one family of
-- headline per severity), 327 watchdog issues are ~60 (one class of fingerprint per severity),
-- plus 50 open questions, 16 page enhancements, 43 correction proposals and the qa: enhancement
-- reports (BP-17-5). Ranked severity × money × age, capped at 25 for the person signed in
-- (BP-8 acceptance: an owner's routine day ≤ 25). One tap executes the effect through the
-- mechanism that already exists (f_finding_resolve's rule, issue_decisions, open_questions,
-- tg_decide_issue, tg_task_from_dashboard) and records a decisions row with the figure as it
-- stood, the option taken, the effect with ids, who and when — reversible with a reason.
-- Nothing is invented: a group's recommendation is the newest member's own action text.
--
-- Also here, measured while building: tg_task_from_dashboard (dashboard rule 2 — assign a task
-- from any tile) has NEVER worked in production: p_assignee bigint into a uuid column, returns
-- bigint from a uuid id. Zero tasks were ever raised from a tile. Fixed by signature.
set search_path = public;

-- ── one definition of "which rows are one decision" ───────────────────────────────────────
create or replace function public.f_finding_family(p text) returns text
language sql immutable parallel safe as $$
  select coalesce(nullif(btrim(regexp_replace(regexp_replace(coalesce(p, ''),
           '\s*(-|—|:)\s*(M0000\d{7}|1A4[0-9A-F]+).*$', ''),
           '\s*(-|—|:)\s+[A-Z][^:]*$', '')), ''), left(coalesce(p, ''), 120))
$$;
comment on function public.f_finding_family(text) is 'BP-8: the headline with its tag / name suffix removed — every open finding of one family and one severity is ONE decision on Today. Used by f_today_feed and f_decide alike so the two never disagree.';

-- ── the decision object (BP-8) ────────────────────────────────────────────────────────────
create table if not exists public.decisions (
  id uuid primary key default gen_random_uuid(),
  key text not null,
  source text not null check (source in ('finding_group','issue_group','question','enhancement','correction','qa_enhancement')),
  what text not null,
  why text,
  figure jsonb not null default '{}'::jsonb,
  cash_impact numeric,
  options jsonb not null default '[]'::jsonb,
  recommendation text,
  may_take text[] not null default '{}',
  due_by date,
  outcome text not null,
  outcome_note text,
  effect jsonb not null default '{}'::jsonb,
  decided_role text not null,
  decided_by uuid,
  decided_at timestamptz not null default now(),
  reversed_at timestamptz,
  reversed_by uuid,
  reversal_reason text
);
comment on table public.decisions is 'BP-8 the decision object: what · why · the number captured as it stood (figure) · cash impact · options with recommendation · who may take it · due-by · outcome · reversal. Written only by f_decide / f_reverse_decision.';
alter table public.decisions enable row level security;
drop policy if exists decisions_read on public.decisions;
create policy decisions_read on public.decisions for select to authenticated using (true);
grant select on public.decisions to authenticated;
create index if not exists decisions_key_idx on public.decisions (key, decided_at desc);
create index if not exists decisions_decided_at_idx on public.decisions (decided_at desc);

-- the owner's page-by-page marks (BP-12b register; BP-17-5 enhancement marks flow here)
alter table public.nav_registry add column if not exists upgrade_decision text;
alter table public.nav_registry add column if not exists upgrade_decided_at timestamptz;
alter table public.nav_registry add column if not exists upgrade_decided_by text;

-- ── the feed: every open decision, ranked, for the person signed in ───────────────────────
create or replace function public.f_today_feed(p_limit int default 25) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare r text := public.current_app_role()::text; v_all boolean; v_out jsonb;
begin
  if r is null then raise exception 'Sign in to read Today.' using errcode = '42501'; end if;
  v_all := r in ('owner', 'executive', 'admin');
  with fg as (
    select 'fg|' || f.severity || '|' || public.f_finding_family(f.headline) as key, 'finding_group' as source, f.severity,
           public.f_finding_family(f.headline) as what,
           string_agg(distinct coalesce(f.agent_key, f.agent), ', ') as why,
           count(*)::int as n, sum(coalesce(f.dollars, 0)) as dollars, sum(coalesce(f.pounds, 0)) as pounds,
           min(f.detected_at) as oldest, max(f.detected_at) as newest,
           (array_agg(f.action order by f.detected_at desc))[1] as recommendation,
           (array_agg(f.drill_to order by f.detected_at desc) filter (where f.drill_to is not null))[1] as drill_to,
           null::text as who
    from public.agent_findings f
    where f.resolved_at is null and f.severity in ('critical', 'elevated', 'watch')
      and not (f.scope like 'qa:%' and f.headline like 'Enhancement for %')
    group by f.severity, public.f_finding_family(f.headline)
  ), ig as (
    select 'ig|' || i.severity || '|' || regexp_replace(i.issue_key, '[:|].*$', '') as key, 'issue_group', i.severity,
           case when count(*) = 1 then min(i.issue)
                else count(*) || ' issues of kind "' || regexp_replace(min(i.issue_key), '[:|].*$', '') || '" — e.g. ' || min(i.issue) end,
           'forensic watchdog', count(*)::int, sum(coalesce(i.dollars, 0)), sum(coalesce(i.pounds, 0)),
           min(i.first_seen_on)::timestamptz, max(i.last_seen_on)::timestamptz,
           (array_agg(i.what_to_do order by i.last_seen_on desc))[1],
           (array_agg(i.drill order by i.last_seen_on desc) filter (where i.drill is not null))[1],
           string_agg(distinct i.who_is_accountable, '; ')
    from public.v_open_issues i where i.needs_a_decision
    group by i.severity, regexp_replace(i.issue_key, '[:|].*$', '')
  ), q as (
    select 'q|' || o.id, 'question', 'elevated', o.question, coalesce(o.area, 'open question'), 1, 0::numeric, coalesce(o.exposure_lb, 0),
           o.first_seen, o.last_seen, coalesce(o.what_is_blocked, o.why_it_matters), null::text, null::text
    from public.open_questions o where o.status = 'open'
  ), pe as (
    select 'pe|' || e.id, 'enhancement', 'watch', coalesce(e.page, '?') || ': ' || coalesce(e.recommendation, e.observation), coalesce(e.raised_by, 'page review'), 1, 0::numeric, 0::numeric,
           e.raised_at, e.raised_at, coalesce(e.why_it_matters, '') || case when e.impact is not null then ' · impact ' || e.impact else '' end || case when e.effort is not null then ' · effort ' || e.effort else '' end,
           e.page, null::text
    from public.page_enhancement e where e.status = 'proposed'
  ), cp as (
    select 'cp|' || c.id, 'correction', coalesce(c.severity, 'elevated'), c.the_issue, coalesce(c.raised_by, 'correction proposal'), coalesce(c.rows_affected, 1)::int, coalesce(c.dollars_affected, 0), coalesce(c.pounds_affected, 0),
           c.raised_at, c.raised_at, c.the_proposal, c.target_object, null::text
    from public.correction_proposal c where c.status = 'proposed'
  ), qe as (
    select 'qe|' || f.id, 'qa_enhancement', 'watch', f.headline, f.agent, 1, 0::numeric, 0::numeric, f.detected_at, f.detected_at, f.detail, f.drill_to, null::text
    from public.agent_findings f where f.resolved_at is null and f.scope like 'qa:%' and f.headline like 'Enhancement for %'
  ), u as (
    select * from fg union all select * from ig union all select * from q union all select * from pe union all select * from cp union all select * from qe
  ), deferred as (
    select distinct on (d.key) d.key, d.due_by from public.decisions d
    where d.outcome = 'defer' and d.reversed_at is null and d.due_by >= current_date order by d.key, d.decided_at desc
  ), scored as (
    select u.*, extract(day from now() - u.oldest)::int as age_days,
      (case u.severity when 'critical' then 4 when 'elevated' then 2 else 1 end)
        * (1 + ln(1 + u.dollars / 1000.0))
        * (1 + ln(1 + greatest(extract(day from now() - u.oldest), 0)) / 3.0) as score,
      case u.source
        when 'finding_group' then array['owner','executive','admin','manager','dept_head','cfo','hr']
        when 'question' then array['owner','executive','admin','manager','dept_head','cfo','hr']
        else array['owner','executive','cfo','admin'] end as may_take,
      case u.source
        when 'finding_group' then '["resolve","assign","defer"]'::jsonb
        when 'issue_group' then '["fix","leave","ignore","assign","defer"]'::jsonb
        when 'question' then '["answer","assign","defer"]'::jsonb
        when 'qa_enhancement' then '["build_now","build_later","no"]'::jsonb
        else '["approved","rejected","deferred"]'::jsonb end as options,
      dd.due_by as deferred_until
    from u left join deferred dd on dd.key = u.key
  ), mine as (
    select * from scored where deferred_until is null and (v_all or r = any(may_take))
  ), ranked as (
    select m.*, row_number() over (order by m.score desc, m.oldest) as rn from mine m
  )
  select jsonb_build_object(
    'as_of', now(), 'role', r, 'sees_all', v_all, 'limit', p_limit,
    'items', coalesce((select jsonb_agg(jsonb_build_object(
        'key', rk.key, 'source', rk.source, 'severity', rk.severity, 'what', rk.what, 'why', rk.why, 'who', rk.who,
        'n', rk.n, 'dollars', rk.dollars, 'pounds', rk.pounds, 'oldest', rk.oldest, 'newest', rk.newest, 'age_days', rk.age_days,
        'score', round(rk.score::numeric, 2), 'recommendation', rk.recommendation, 'drill_to', rk.drill_to,
        'options', rk.options, 'may_take', to_jsonb(rk.may_take), 'rank', rk.rn,
        'members', case rk.source
          when 'finding_group' then (select jsonb_agg(jsonb_build_object('id', s.id, 'headline', s.headline, 'dollars', s.dollars, 'at', s.detected_at, 'drill_to', s.drill_to)) from (
              select f.id, f.headline, f.dollars, f.detected_at, f.drill_to from public.agent_findings f
              where f.resolved_at is null and f.severity = rk.severity and public.f_finding_family(f.headline) = rk.what
              order by coalesce(f.dollars, 0) desc, f.detected_at desc limit 5) s)
          when 'issue_group' then (select jsonb_agg(jsonb_build_object('issue_key', s.issue_key, 'headline', s.issue, 'dollars', s.dollars, 'at', s.last_seen_on, 'drill_to', s.drill)) from (
              select i.issue_key, i.issue, i.dollars, i.last_seen_on, i.drill from public.v_open_issues i
              where i.needs_a_decision and i.severity = rk.severity and regexp_replace(i.issue_key, '[:|].*$', '') = split_part(rk.key, '|', 3)
              order by coalesce(i.dollars, 0) desc, i.last_seen_on desc limit 5) s)
          else '[]'::jsonb end
      ) order by rk.rn) from ranked rk where rk.rn <= p_limit), '[]'::jsonb),
    'behind', (select jsonb_build_object('total', count(*), 'shown', least(count(*), p_limit),
                 'by_source', (select jsonb_object_agg(source, n) from (select source, count(*) n from mine group by source) b),
                 'dollars_total', sum(dollars), 'rows_total', sum(n)) from mine),
    'deferred', (select count(*) from scored where deferred_until is not null and (v_all or r = any(may_take))),
    'not_mine', (select count(*) from scored where deferred_until is null and not (v_all or r = any(may_take))),
    'decided_today', coalesce((select jsonb_agg(jsonb_build_object('id', d.id, 'key', d.key, 'source', d.source, 'what', d.what, 'outcome', d.outcome,
                 'outcome_note', d.outcome_note, 'effect', d.effect, 'decided_role', d.decided_role, 'decided_at', d.decided_at,
                 'reversed_at', d.reversed_at, 'reversal_reason', d.reversal_reason, 'figure', d.figure, 'due_by', d.due_by) order by d.decided_at desc)
                 from public.decisions d where d.decided_at >= (now() at time zone 'America/New_York')::date::timestamp at time zone 'America/New_York'), '[]'::jsonb),
    'push', jsonb_build_object('recipients', (select count(*) from public.alert_recipient where active),
                 'last_sent', (select max(created_at) from public.alert_outbox where source = 'today')))
  into v_out;
  return v_out;
end $$;
revoke all on function public.f_today_feed(int) from public, anon;
grant execute on function public.f_today_feed(int) to authenticated;

-- ── one tap: the effect, through the mechanism that already exists, with provenance ────────
create or replace function public.f_decide(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
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
                when 'pe' then 'enhancement' when 'cp' then 'correction' when 'qe' then 'qa_enhancement' end;
  if v_src is null then raise exception 'Unknown decision key %.', v_key; end if;
  v_may := case v_src when 'finding_group' then array['owner','executive','admin','manager','dept_head','cfo','hr']
                      when 'question' then array['owner','executive','admin','manager','dept_head','cfo','hr']
                      else array['owner','executive','cfo','admin'] end;
  if not (r = any(v_may)) then raise exception 'The % role may not take this decision (it needs one of %).', r, array_to_string(v_may, ', ') using errcode = '42501'; end if;
  v_opts := case v_src when 'finding_group' then '["resolve","assign","defer"]'::jsonb when 'issue_group' then '["fix","leave","ignore","assign","defer"]'::jsonb
                       when 'question' then '["answer","assign","defer"]'::jsonb when 'qa_enhancement' then '["build_now","build_later","no"]'::jsonb
                       else '["approved","rejected","deferred"]'::jsonb end;
  if not (v_opts ? v_opt) then raise exception 'Option % is not one of % for this decision.', v_opt, v_opts::text; end if;
  if v_opt = 'defer' and v_due is null then raise exception 'Deferring needs a date to come back on.'; end if;
  if v_opt = 'assign' and v_task is null then raise exception 'Assigning records the task it raised — none was given.'; end if;
  if v_opt in ('resolve', 'leave', 'ignore', 'answer', 'rejected', 'deferred', 'no') and length(v_note) < 15 then
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
end $$;
revoke all on function public.f_decide(jsonb) from public, anon;
grant execute on function public.f_decide(jsonb) to authenticated;

create or replace function public.f_reverse_decision(p_id uuid, p_reason text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r text := public.current_app_role()::text; v_uid uuid := auth.uid(); d public.decisions%rowtype; v_n int := 0; v_ids uuid[]; v_bid bigint;
begin
  if r is null or r not in ('owner', 'executive', 'admin', 'cfo') then raise exception 'The % role may not reverse a decision.', coalesce(r, 'signed-out') using errcode = '42501'; end if;
  if length(btrim(coalesce(p_reason, ''))) < 15 then raise exception 'A reversal needs a written reason of at least fifteen characters.'; end if;
  select * into d from public.decisions where id = p_id;
  if d.id is null then raise exception 'No decision with that id.'; end if;
  if d.reversed_at is not null then raise exception 'That decision was already reversed at %.', d.reversed_at; end if;
  if d.source = 'finding_group' and d.outcome = 'resolve' then
    update public.agent_findings set resolved_at = null, resolution = resolution || ' — REVERSED ' || to_char(now(), 'YYYY-MM-DD HH24:MI') || ' UTC by ' || r || ': ' || btrim(p_reason)
     where resolution like '%[decision ' || p_id || ']%' and resolved_at is not null;
    get diagnostics v_n = row_count;
  elsif d.source = 'issue_group' and d.outcome in ('fix', 'leave', 'ignore') then
    select array_agg(x::uuid) into v_ids from jsonb_array_elements_text(coalesce(d.effect->'ids', '[]'::jsonb)) x;
    update public.issue_decisions set superseded = true where id = any(coalesce(v_ids, '{}'::uuid[])) and not coalesce(superseded, false);
    get diagnostics v_n = row_count;
  elsif d.source = 'question' and d.outcome = 'answer' then
    v_bid := (d.effect->>'question_id')::bigint;
    update public.open_questions set status = 'open', answered_at = null, answer = coalesce(answer, '') || ' — REVERSED: ' || btrim(p_reason) where id = v_bid;
    get diagnostics v_n = row_count;
  elsif d.source = 'enhancement' then
    v_bid := (d.effect->>'proposal_id')::bigint;
    update public.page_enhancement set status = 'proposed', decided_at = null, owner_note = coalesce(owner_note, '') || ' — REVERSED: ' || btrim(p_reason) where id = v_bid;
    get diagnostics v_n = row_count;
  elsif d.source = 'correction' then
    v_bid := (d.effect->>'proposal_id')::bigint;
    if exists (select 1 from public.correction_proposal where id = v_bid and applied_at is not null) then raise exception 'That correction was already applied (migration %) — reversing the decision would not undo the data. Raise a new correction instead.', (select applied_migration from public.correction_proposal where id = v_bid); end if;
    update public.correction_proposal set status = 'proposed', decided_at = null, owner_note = coalesce(owner_note, '') || ' — REVERSED: ' || btrim(p_reason) where id = v_bid;
    get diagnostics v_n = row_count;
  elsif d.source = 'qa_enhancement' then
    update public.agent_findings set resolved_at = null, resolution = resolution || ' — REVERSED: ' || btrim(p_reason) where id = (d.effect->>'finding_id')::uuid;
    get diagnostics v_n = row_count;
    update public.nav_registry set upgrade_decision = nullif(d.effect->>'previous_mark', ''), upgrade_decided_at = now(), upgrade_decided_by = r || ' ' || coalesce(v_uid::text, '') || ' (reversal)'
     where view_key = d.effect->>'view_key' and upgrade_decision = d.effect->>'mark';
  end if;
  -- assign / defer reverse by record alone: the task stays (it is its own object); the deferral simply stops hiding
  update public.decisions set reversed_at = now(), reversed_by = v_uid, reversal_reason = btrim(p_reason) where id = p_id;
  return jsonb_build_object('ok', true, 'id', p_id, 'rows_restored', v_n, 'source', d.source, 'outcome', d.outcome);
end $$;
revoke all on function public.f_reverse_decision(uuid, text) from public, anon;
grant execute on function public.f_reverse_decision(uuid, text) to authenticated;

-- ── push to phone: recipients are rows (alert_recipient); one digest a day through the outbox ──
create or replace function public.f_today_push() returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_lines text; v_sent int := 0; v_total int; v_usd numeric;
begin
  -- the digest is the owner's view of the feed (definer context has no auth.uid → current_app_role = readonly), so build it directly
  with fg as (
    select f.severity, public.f_finding_family(f.headline) fam, count(*) n, sum(coalesce(f.dollars, 0)) usd, min(f.detected_at) oldest
    from public.agent_findings f where f.resolved_at is null and f.severity in ('critical', 'elevated', 'watch') and not (f.scope like 'qa:%' and f.headline like 'Enhancement for %')
    group by 1, 2
  ), ig as (
    select i.severity, regexp_replace(i.issue_key, '[:|].*$', '') fam, count(*) n, sum(coalesce(i.dollars, 0)) usd, min(i.first_seen_on)::timestamptz oldest
    from public.v_open_issues i where i.needs_a_decision group by 1, 2
  ), u as (select * from fg union all select * from ig), s as (
    select u.*, (case severity when 'critical' then 4 when 'elevated' then 2 else 1 end) * (1 + ln(1 + usd / 1000.0)) * (1 + ln(1 + greatest(extract(day from now() - oldest), 0)) / 3.0) score from u
  )
  select count(*), sum(usd), string_agg(format('%s. [%s] %s — %s rows, $%s, %s d old', rn, severity, fam, n, to_char(usd, 'FM999,999,999'), extract(day from now() - oldest)::int), E'\n' order by rn)
    into v_total, v_usd, v_lines
    from (select s.*, row_number() over (order by score desc) rn from s) t where rn <= 5;
  if coalesce(v_total, 0) = 0 then return jsonb_build_object('sent', 0, 'why', 'nothing waiting'); end if;
  if exists (select 1 from public.alert_outbox where source = 'today' and source_ref = 'today:' || current_date) then return jsonb_build_object('sent', 0, 'why', 'already sent today'); end if;
  insert into public.alert_outbox (entity_type, entity_key, source, source_ref, severity, role, channel, subject, body, raised_on, days_open)
  select 'today', 'today', 'today', 'today:' || current_date, 'elevated', a.role, 'email',
         'TODAY — decisions waiting, $' || to_char(coalesce(v_usd, 0), 'FM999,999,999') || ' at stake in the top five',
         'The five decisions ranked highest this morning (severity × money × age):' || E'\n' || v_lines || E'\n\nOpen Today: #today — one tap takes the decision with the figure as it stands.',
         current_date, 0
    from public.alert_recipient a where a.active;
  get diagnostics v_sent = row_count;
  return jsonb_build_object('sent', v_sent, 'top', v_total, 'dollars', v_usd);
end $$;
revoke all on function public.f_today_push() from public, anon;
select cron.unschedule(jobid) from cron.job where jobname = 'today-push';
select cron.schedule('today-push', '0 11 * * *', $cron$ select public.f_today_push(); $cron$);

-- ── the door: a child of Command Center (BP-7 — one child entry, nothing else moves) ────────
insert into public.page_archetype (archetype, title, what_it_answers, never_share, component_path, built, added_on)
values ('decision_stream', 'Decision stream', 'What do I decide today, ranked, and what happens the moment I tap', 'Ranked per person (severity × money × age), the figure captured as it stood, one tap with provenance, reversal with a reason', 'app/web/src/today.jsx', true, current_date)
on conflict (archetype) do update set title = excluded.title, what_it_answers = excluded.what_it_answers, never_share = excluded.never_share, component_path = excluded.component_path, built = true;
insert into public.nav_registry (category, category_order, label, item_order, icon, view_key, table_ref, description, enabled, admin_only, surface, page_kind, subcategory, module, archetype)
values ('Command Center', 0, 'Today', -6, 'check-square', 'today', null,
        'Your decisions, ranked — severity × money × age — with the number as it stands. One tap takes the decision through the platform''s own mechanism and records who, when, what changed; reversible with a reason. (Bible §8, the decision stream.)',
        true, false, 'side', 'application', 'Overview', 'command', 'decision_stream')
on conflict (view_key) do update set label = excluded.label, description = excluded.description, enabled = true, surface = 'side', page_kind = 'application', subcategory = 'Overview', module = 'command', archetype = 'decision_stream', category = 'Command Center', item_order = -6;

-- ── dashboard rule 2 has never worked: assign from a tile inserted a bigint into a uuid, a status
--    ('open') and a priority ('normal') the table's own CHECK constraints refuse (todo/in_progress/
--    done/blocked; P0–P3), and no space — the Workspace's own createTask (tgworkspace.jsx) documents
--    the same. Zero tasks were ever raised from a tile. The task now lands in the department's space
--    (Company when no space carries the department's name) with its activity line, like any other.
drop function if exists public.tg_task_from_dashboard(text, text, text, text, numeric, text, text, bigint, date, text);
create or replace function public.tg_task_from_dashboard(p_title text, p_description text, p_department text, p_kpi text, p_value numeric, p_unit text, p_drill text, p_assignee uuid, p_due date, p_priority text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_space uuid; v_pri text;
begin
  if coalesce(length(trim(p_title)), 0) < 5 then raise exception 'A task needs a title of at least five characters.'; end if;
  if p_assignee is not null and not exists (select 1 from public.employees where id = p_assignee) then raise exception 'No employee with that id.'; end if;
  v_pri := case lower(coalesce(p_priority, 'normal')) when 'urgent' then 'P0' when 'high' then 'P1' when 'low' then 'P3' when 'p0' then 'P0' when 'p1' then 'P1' when 'p3' then 'P3' else 'P2' end;
  select id into v_space from public.spaces where lower(name) = lower(coalesce(p_department, '')) or lower(name) like lower(coalesce(p_department, '~')) || '%' order by (lower(name) = lower(coalesce(p_department, ''))) desc limit 1;
  if v_space is null then select id into v_space from public.spaces where name = 'Company' limit 1; end if;
  insert into public.tasks (title, description, status, priority, assignee_employee_id, due_on, department, space_id, source_view, source_kpi, source_value, source_unit, source_snapshot, created_by)
  values (p_title, p_description, 'todo', v_pri, p_assignee, p_due, p_department, v_space, p_drill, p_kpi, p_value, p_unit,
          jsonb_build_object('kpi', p_kpi, 'value', p_value, 'unit', p_unit, 'department', p_department, 'captured_at', now(), 'drill', p_drill), auth.uid())
  returning id into v_id;
  insert into public.task_activity (task_id, actor, what, new_value) values (v_id, auth.uid(), 'created', left(p_title, 200));
  return v_id;
end $$;
revoke all on function public.tg_task_from_dashboard(text, text, text, text, numeric, text, text, uuid, date, text) from public, anon;
grant execute on function public.tg_task_from_dashboard(text, text, text, text, numeric, text, text, uuid, date, text) to authenticated;

notify pgrst, 'reload schema';;
