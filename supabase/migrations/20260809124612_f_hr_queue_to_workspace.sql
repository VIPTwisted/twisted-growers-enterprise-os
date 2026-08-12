/* THE BRIDGE FROM A DECISION TO A TASK. Owner, 9 August 2026: "we will put into
   our clickup", "workspace some items need to wire there too".

   A person approves something in hr_review_queue. That approval is a decision,
   and a decision with no task attached is a decision nobody acts on - which is
   how an approved write-up sits unissued for three weeks and the pattern of
   behaviour it described continues in the meantime.

   This turns an APPROVED queue item into a workspace task request. It refuses an
   item that is not approved: ClickUp is a shared workspace, a task there is
   visible to the whole company, and that is a publication rather than a note to
   self. Under ai_write_policy an external write needs a person, and Human
   Resources needs one for everything.

   THE LIST IS NAMED, NEVER GUESSED. An unresolvable list fails loudly at push
   time rather than landing an employment matter in whichever list had a similar
   name. */
create or replace function f_hr_queue_to_workspace(
  p_queue_id uuid,
  p_list_name text,
  p_due_on date default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare q record; v_role text; v_id uuid;
begin
  select role::text into v_role from app_users where user_id = auth.uid();
  if v_role is null or v_role not in ('owner','executive','hr') then
    return jsonb_build_object('ok', false,
      'message', 'Only an owner, an executive or Human Resources can put an item into the workspace.');
  end if;

  select * into q from hr_review_queue where id = p_queue_id;
  if not found then
    return jsonb_build_object('ok', false, 'message', 'No such queue item.');
  end if;

  if q.status <> 'approved' or q.decided_by is null then
    return jsonb_build_object('ok', false,
      'message', 'That item has not been approved by a person. ClickUp is a shared workspace - a task there is visible to everyone, so it is a publication, not a note. Approve it first.',
      'status', q.status);
  end if;

  if exists (select 1 from hr_external_task t
             where t.queue_id = p_queue_id and t.status in ('pending','pushed')) then
    return jsonb_build_object('ok', false,
      'message', 'A task has already been raised for this item. Raising a second one splits the trail: two tasks, two comment threads, and no single place that says what was done.');
  end if;

  insert into hr_external_task (queue_id, target, list_hint, title, body, due_on, approved_by)
  values (p_queue_id, 'clickup', p_list_name,
          coalesce(q.headline, 'Human Resources item'),
          coalesce(q.edited_body, q.draft_body, q.rationale, ''),
          coalesce(p_due_on, q.defer_until::date),
          q.decided_by)
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id,
    'message', 'Queued for the workspace. It is pushed by hr-clickup-push, and until it succeeds it is visible in v_hr_delivery_backlog rather than silently pending.');
end $$;

comment on function f_hr_queue_to_workspace is
  'Turns an APPROVED Human Resources queue item into a ClickUp task request. Refuses unapproved items - a task in a shared workspace is visible company-wide, which is a publication and not a note. Refuses a duplicate, because two tasks for one decision means two comment threads and no single record of what was done. Uses the body a person edited in preference to the agent draft.';

revoke all on function f_hr_queue_to_workspace(uuid, text, date) from public;
grant execute on function f_hr_queue_to_workspace(uuid, text, date) to authenticated;;
