/* EVERY HUMAN RESOURCES ACTION REQUIRES A PERSON. Owner, 9 August 2026:
   "YES ALL HR REQUIRES HUMAN."

   I had proposed a tiered boundary - reminders and flags acting directly,
   consequential items queued - and argued that approving two hundred routine
   items a week turns approval into a rubber stamp. The owner heard that and
   ruled the other way. His call, and it is recorded here as his, not mine, so
   nobody re-argues it later from the code.

   NO STANDING RULES. The pre-approval mechanism I was going to build is not
   built, deliberately: a standing rule is precisely the thing that lets an agent
   act without a person, and that is now forbidden in this department. Anything
   the agent wants to do goes to hr_review_queue and waits.

   THE RISK THAT COMES WITH THIS RULING, written down rather than argued again:
   a queue nobody can keep up with gets approved in bulk without reading, which
   is worse than no queue because it manufactures a record of review that did not
   happen. The defence is not autonomy - it is that ROUTINE AND CONSEQUENTIAL
   MUST NOT LOOK ALIKE in the queue. A card-expiry reminder and a disciplinary
   write-up must never arrive as two identical rows, or the write-up gets waved
   through with the reminders. severity and agent_confidence exist for that. */
insert into ai_write_policy
  (system, label, kind, writes_allowed, requires_approval, manual_only, company_enabled, why)
values
  ('human_resources', 'Human Resources', 'write_target', true, true, false, true,
   'Owner ruling 9 Aug 2026: "ALL HR REQUIRES HUMAN." Every action - including reminders, flags and anything that looks routine - is proposed to hr_review_queue and waits for a person. There are no standing approvals and no pre-authorised actions in this department. The agent drafts, assembles evidence and cites the policy clause; a person decides, every time.')
on conflict (system) do update
  set writes_allowed = excluded.writes_allowed,
      requires_approval = excluded.requires_approval,
      manual_only = excluded.manual_only,
      why = excluded.why, updated_at = now();

/* The two columns promised to the agent building this, and no more - the rest
   of the Human Resources schema is theirs. */
alter table hr_review_queue add column if not exists policy_basis text;
alter table hr_review_queue add column if not exists agent_confidence text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'hr_review_queue_confidence_ck') then
    alter table hr_review_queue add constraint hr_review_queue_confidence_ck
      check (agent_confidence is null or agent_confidence in ('certain','likely','unsure'));
  end if;
end $$;

comment on column hr_review_queue.policy_basis is
  'The clause of the company''s OWN written policy this rests on - hr_documents, section and version. An item with no basis is an opinion, and an opinion about somebody''s employment is not actionable. The agent is not an authority on Massachusetts employment law or CCC regulation and must never present itself as one: a wrongful-termination claim turns on whether written process was followed.';

comment on column hr_review_queue.agent_confidence is
  'certain | likely | unsure. The agent states how sure it is, and "unsure" is a valid and useful answer. A confident wrong answer about a person''s employment is the failure this whole design exists to prevent - on 8 Aug 2026 the assistant reported a table as empty when it held 3,675 rows, with no hesitation at all.';

/* Anything a person has not decided yet, worst first, so a write-up never sits
   below a stack of reminders. */
create or replace view v_hr_waiting_on_a_person as
select q.id, q.created_at, q.agent, q.kind, q.severity, q.agent_confidence,
       q.employee_id, q.headline, q.policy_basis,
       (q.draft_body is not null) as has_a_draft,
       q.defer_until,
       case
         when q.severity = 'urgent' then 'Decide today'
         when q.kind ilike '%write%up%' or q.kind ilike '%discipl%' then 'Read every line - this becomes part of an employment record'
         when q.agent_confidence = 'unsure' then 'The agent is not sure. Check it before approving.'
         else 'Routine - but still a decision'
       end as how_to_treat_it
from hr_review_queue q
where q.status = 'waiting'
  and (q.defer_until is null or q.defer_until <= now())
order by
  case q.severity when 'urgent' then 0 when 'elevated' then 1 else 2 end,
  case when q.agent_confidence = 'unsure' then 0 else 1 end,
  q.created_at;

comment on view v_hr_waiting_on_a_person is
  'The Human Resources decision list. Owner ruling 9 Aug 2026: every action in this department needs a person, with no standing approvals. Ordered so a disciplinary write-up never sits underneath a stack of card-expiry reminders - routine and consequential arriving as identical rows is how a queue becomes a rubber stamp.';

grant select on v_hr_waiting_on_a_person to authenticated;;
