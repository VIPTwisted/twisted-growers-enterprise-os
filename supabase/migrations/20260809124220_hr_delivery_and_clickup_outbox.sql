/* DELIVERY. An approved message that never leaves the table is not a message.

   hr_message was an outbox with nothing draining it. The platform already has an
   inbox - `messages`, which f_my_notifications counts and the pet reports as
   "Messages addressed to you" - so this routes into that rather than inventing a
   second one. Two inboxes is two places to miss something.

   WHY THIS IS NOT "AUTOMATIC" UNDER THE OWNER'S RULE. It sends only what a
   PERSON has already approved: approved_by must be set, and the agent cannot set
   it. Carrying out a decision somebody made is not making one. Nothing here
   selects a recipient, writes a word, or decides that a message should exist. */
create or replace function f_hr_deliver_approved(p_limit int default 200)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_sent int := 0; v_skipped int := 0;
begin
  with ready as (
    select m.id, m.employee_id, m.subject, m.body
    from hr_message m
    where m.approved_by is not null
      and m.approved_at is not null
      and m.sent_at is null
      and m.cancelled_at is null
      and m.employee_id is not null      -- audience sends are not built yet
    order by m.approved_at
    limit greatest(p_limit, 0)
  ), put as (
    insert into messages (user_id, author, body)
    select r.employee_id, 'Human Resources',
           r.subject || E'\n\n' || r.body
    from ready r
    returning 1
  ), done as (
    update hr_message m set sent_at = now()
    where m.id in (select id from ready)
    returning 1
  )
  select count(*) into v_sent from done;

  /* Said out loud rather than silently left behind. An approved message to a
     whole department cannot be delivered yet, and a count that quietly excluded
     them would read as "everything sent". */
  select count(*) into v_skipped
  from hr_message
  where approved_by is not null and sent_at is null and cancelled_at is null
    and employee_id is null;

  return jsonb_build_object(
    'sent', v_sent,
    'waiting_on_audience_delivery', v_skipped,
    'note', case when v_skipped > 0
      then 'Approved messages addressed to a department or role are NOT sent - audience delivery is not built. They are approved and waiting, not lost.'
      else 'Nothing outstanding.' end,
    'at', now());
end $$;

comment on function f_hr_deliver_approved is
  'Delivers Human Resources messages a PERSON has approved into the platform inbox. Never decides that a message should exist, who it goes to, or what it says - it carries out an approval that already happened. Messages to a whole department are reported as waiting rather than counted as sent.';

revoke all on function f_hr_deliver_approved(int) from public;
grant execute on function f_hr_deliver_approved(int) to authenticated;

/* ---- CLICKUP -----------------------------------------------------------
   Owner, 9 August 2026: "we will put into our clickup", "workspace some items
   need to wire there too".

   clickup_tasks is a MIRROR - it has synced_at and payload and is written by the
   sync, pulling FROM ClickUp. Writing a row into it would create a task that
   exists only in our copy and vanishes on the next sync, looking for all the
   world like ClickUp deleted it.

   So: an outbox. A row here is a REQUEST to create a task, drained by whatever
   holds the ClickUp credential. Same shape as the bridge queue, and for the same
   reason - the thing that can reach the outside world comes and gets the work,
   rather than the database reaching out.

   ClickUp is an external system, so under ai_write_policy it is a write that
   needs a person's approval. A row only lands here once a human has approved the
   queue item it came from. */
create table if not exists hr_external_task (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  queue_id      uuid references hr_review_queue(id),
  writeup_id    bigint,
  target        text not null default 'clickup',
  list_hint     text,
  title         text not null,
  body          text,
  due_on        date,
  assignee_hint text,

  approved_by   uuid not null,
  status        text not null default 'pending'
                check (status in ('pending','pushed','failed','cancelled')),
  external_id   text,
  external_url  text,
  pushed_at     timestamptz,
  error         text,
  attempts      int not null default 0
);
comment on table hr_external_task is
  'Requests to create a task in ClickUp or another workspace. Deliberately NOT written into clickup_tasks: that table is a mirror pulled from ClickUp, so a row inserted there would exist only in our copy and disappear on the next sync, looking exactly as though ClickUp had deleted it. approved_by is NOT NULL - nothing reaches an outside system without a person, per the write policy.';
comment on column hr_external_task.attempts is
  'A push that keeps failing is a poison message. Whatever drains this must cap retries and say so, rather than retrying for ever and looking busy.';

create index if not exists hr_external_task_pending on hr_external_task (created_at)
  where status = 'pending';

alter table hr_external_task enable row level security;
drop policy if exists hret_manage on hr_external_task;
create policy hret_manage on hr_external_task for all to authenticated
  using (exists (select 1 from app_users u where u.user_id = (select auth.uid())
                 and u.role in ('owner','executive','hr')))
  with check (exists (select 1 from app_users u where u.user_id = (select auth.uid())
                      and u.role in ('owner','executive','hr')));

/* What is approved and still has not gone anywhere. The gap between "a person
   said yes" and "it actually happened" is where work is lost silently, and this
   is the only view that shows it. */
create or replace view v_hr_delivery_backlog as
select 'message'::text as what, m.id::text as id, m.subject as title,
       m.approved_at, null::text as error,
       case when m.employee_id is null then 'waiting: audience delivery not built'
            else 'waiting to send' end as standing
from hr_message m
where m.approved_at is not null and m.sent_at is null and m.cancelled_at is null
union all
select 'workspace task', t.id::text, t.title, t.created_at, t.error,
       case t.status when 'failed' then 'failed - ' || coalesce(t.error,'no reason recorded')
                     else 'waiting to push' end
from hr_external_task t
where t.status in ('pending','failed')
order by approved_at;

comment on view v_hr_delivery_backlog is
  'Approved and not yet delivered. The gap between a person saying yes and the thing actually happening is where work disappears without anybody noticing - this is the only place that gap is visible.';

grant select on v_hr_delivery_backlog to authenticated;

select 'delivery + workspace outbox built' as done;;
