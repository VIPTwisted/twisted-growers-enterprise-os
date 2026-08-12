-- Agent I (Database COO), 12 Aug 2026. DBI-051 v2 (reviewers V, X, W).
-- v2: nav_registry.surface is constrained to side|launcher|reports|deep|finance|tax|hr. I wrote
-- 'page', which the schema has never used. Checked the constraint instead of assuming - the same
-- correction I have had to make three times today, and the reason the constraint exists.
-- 'side' is right: this is a Command Center page the owner opens from the menu, not a report.
--
-- Owner: "we should have a page for agents to flag issues by date found and tracked when
-- resolved with details so we can work together and take each one by one as I have time."
--
-- WHY IT IS NEEDED. Agents now write to three registers - correction_proposal (data changes
-- needing his approval), page_enhancement (improvements that block nothing), watchdog_findings
-- (defects the platform detects and often clears itself). Each is right on its own; together
-- they are unworkable, because a queue a person has to assemble across three tables in their
-- head is a queue that does not get worked. That is exactly how 108 custody findings reached a
-- week old untouched.
--
-- THE THREE LIFECYCLES STAY SEPARATE UNDERNEATH, deliberately: a defect clears when its
-- condition ends, an enhancement waits forever without blocking, a correction cannot be applied
-- until he approves. Collapsing them into one table would destroy the gate that makes the
-- correction register worth having. One VIEW over three tables keeps both truths.
--
-- UNDO: drop function tg_decide_issue(text, bigint, text, text); drop view v_owner_issue_queue;
--       delete from nav_registry where view_key = 'v_owner_issue_queue';

create or replace view public.v_owner_issue_queue as
select 'correction'::text                             as source,
       cp.id                                          as item_id,
       cp.raised_at::date                             as date_found,
       cp.raised_by, cp.severity, cp.domain,
       cp.target_object                               as where_it_is,
       cp.the_issue                                   as what_is_wrong,
       cp.the_proposal                                as what_is_proposed,
       cp.why_this_is_the_fix                         as why_it_works,
       cp.how_it_never_repeats                        as how_it_stays_fixed,
       cp.risk_if_wrong,
       cp.rows_affected, cp.pounds_affected, cp.dollars_affected,
       cp.status,
       (cp.status = 'proposed')                       as needs_your_decision,
       cp.decided_at::date                            as date_decided,
       coalesce(cp.verified_at, cp.applied_at)::date  as date_resolved,
       cp.owner_note
from correction_proposal cp
union all
select 'enhancement', pe.id, pe.raised_at::date, pe.raised_by,
       case pe.impact when 'high' then 'elevated' else 'watch' end,
       pe.page, pe.page || ' — ' || pe.section,
       pe.observation, pe.recommendation, pe.why_it_matters,
       'Enhancement, not a defect — nothing breaks if this is never done. Effort: ' || pe.effort,
       'None. This improves something that already works.',
       null, null, null,
       pe.status, (pe.status = 'proposed'),
       pe.decided_at::date, null, pe.owner_note
from page_enhancement pe
union all
select 'defect', wf.id, wf.observed_at::date, coalesce(wf.who_is_accountable,'platform'),
       wf.severity, coalesce(wf.where_it_is,'—'), coalesce(wf.where_it_is,'—'),
       wf.what, coalesce(wf.what_to_do,'—'), coalesce(wf.why_it_matters,'—'),
       coalesce(wf.guard_recommendation,
                'No guard proposed yet — ask for one before closing this, or it recurs.'),
       null, wf.record_count, wf.pounds, wf.dollars,
       case when wf.cleared_at is not null then 'resolved' else 'open' end,
       false, null, wf.cleared_at::date, wf.challenge_notes
from watchdog_findings wf
where wf.cleared_at is null or wf.cleared_at > now() - interval '30 days';

comment on view public.v_owner_issue_queue is
 'THE owner''s working queue: every agent-flagged item from all three registers in one list with '
 'the date found, current status and date resolved. correction = a data change awaiting his '
 'approval, nothing applied until he says so. enhancement = an improvement that blocks nothing. '
 'defect = something the platform detected and, where it can, clears itself. Built because a '
 'queue assembled across three tables in a person''s head does not get worked.';

create or replace function public.tg_decide_issue(
  p_source text, p_item_id bigint, p_decision text, p_note text default null)
returns text
language plpgsql security definer set search_path to 'public'
as $fn$
begin
  if not f_caller_is_admin() then
    raise exception 'Only the owner decides. An agent recording its own approval is not an approval.';
  end if;
  if p_decision not in ('approved','rejected','deferred') then
    raise exception 'Decision must be approved, rejected or deferred - got %.', p_decision;
  end if;
  if p_decision in ('rejected','deferred') and coalesce(btrim(p_note),'') = '' then
    raise exception 'A rejection or deferral needs a reason, or the same item returns next week.';
  end if;

  if p_source = 'correction' then
    if p_decision = 'deferred' then
      raise exception 'A correction proposal is approved or rejected, never deferred - a data defect left in limbo gets applied by accident later.';
    end if;
    update correction_proposal
       set status = p_decision, owner_note = p_note, decided_at = now()
     where id = p_item_id and status = 'proposed';
  elsif p_source = 'enhancement' then
    update page_enhancement
       set status = p_decision, owner_note = p_note, decided_at = now()
     where id = p_item_id and status = 'proposed';
  else
    raise exception 'Defects are not decided - they clear when the condition that raised them ends. Fix the cause, or challenge the finding.';
  end if;

  if not found then
    return 'Nothing to decide - item ' || p_item_id || ' was already decided or does not exist.';
  end if;
  return p_decision || ' — recorded ' || to_char(now(),'DD Mon YYYY HH24:MI');
end $fn$;

comment on function public.tg_decide_issue(text, bigint, text, text) is
 'The one door for deciding a flagged item: approved, rejected or deferred, admin-gated, always '
 'dated and noted. A rejection needs a reason so the same proposal is not raised again next '
 'week. Corrections cannot be deferred. Defects cannot be decided at all - they clear when the '
 'condition ends, which is the difference between fixing something and agreeing to stop looking.';

insert into nav_registry (category, category_order, label, item_order, view_key, page_kind,
                          description, enabled, surface, module, date_policy, default_range)
select 'Command Center', 1, 'Issues Flagged by Agents', 6, 'v_owner_issue_queue', 'report',
       'Every issue agents have flagged, by date found, with what they propose and why - and nothing applied until the owner approves it.',
       true, 'side', 'command', 'optional', 'all'
where not exists (select 1 from nav_registry where view_key = 'v_owner_issue_queue');;
