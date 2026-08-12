/* THREE RULINGS THAT NARROW THE RESTRICTION TO ONE THING. Owner, 8 August 2026:

   "computer use and in os or desktop user can use camara and session remains
   full time no shutoff or strict settings unless user sets."
   "so long as user is logged onto the OS pet and assistant is working fully."
   "phone must be strict due to security."
   "only restriction is writing to metrc."

   I had shut the camera off company-wide an hour earlier off the back of "shut
   phone and camera features off by default now... can only work on computer".
   That was the phone half of the sentence. On a COMPUTER, signed into the OS,
   the camera is available and the assistant runs fully - the single restriction
   is writing to Metrc. The phone stays strict.

   "no shutoff or strict settings unless user sets" also kills the timed grant.
   An hour-long approval that re-prompts mid-shift IS a strict setting. A grant
   now lasts as long as the person is signed in; signing out revokes it, which
   is what a session actually means. */
update ai_write_policy
set company_enabled = true,
    why = 'Available on a computer while signed into the OS. Owner, 8 Aug 2026: "in os or desktop user can use camara and session remains full time". Used to read a package tag, a label, a COA or a manifest. Off until the person turns it on, and it then stays on for their session.',
    updated_at = now()
where system = 'camera';

update ai_write_policy
set company_enabled = false,
    why = 'Owner ruling 8 Aug 2026: "phone must be strict due to security". The assistant runs on company computers signed into the OS. A phone is a personal device on an untrusted network, and a licensed operator''s Metrc and customer data does not travel onto one until there is a reason and a decision.',
    updated_at = now()
where system = 'phone';

/* A session, not a timer. */
alter table ai_write_approval alter column expires_at drop not null;
comment on column ai_write_approval.expires_at is
  'Null means it lasts the whole sign-in session and is revoked on sign-out. Owner, 8 Aug 2026: "session remains full time no shutoff or strict settings unless user sets" - a re-prompt mid-shift is a strict setting.';

create or replace function f_ai_may(p_user uuid, p_system text, p_action text default null)
returns jsonb language sql stable as $$
  with pol as (select * from ai_write_policy where system = lower(p_system)),
       grant_row as (
         select * from ai_write_approval
         where user_id = p_user and system = lower(p_system)
           and revoked_at is null
           and (expires_at is null or expires_at > now())
           and (action is null or action = p_action)
         order by granted_at desc limit 1
       )
  select case
    when p_user is null then jsonb_build_object(
      'verdict', 'refused',
      'why', 'Owner hard rule, 8 Aug 2026: nothing is ever automatic. This was reached with no signed-in person - a schedule, a background scan or a cron job. Background work may propose an action and must never perform one.',
      'system', lower(p_system), 'action', p_action, 'automatic', true)
    when (select never_allowed from pol) then jsonb_build_object(
      'verdict', 'refused', 'why', (select why from pol), 'permanent', true,
      'system', lower(p_system), 'action', p_action)
    when not exists (select 1 from pol) then jsonb_build_object(
      'verdict', 'ask',
      'why', 'This system is not registered in ai_write_policy. Nothing unregistered is written to without the person saying so first. If this is a capability on someone''s device, the answer is no: only the camera and the microphone are ever used, on a computer, and only when switched on.',
      'system', lower(p_system), 'action', p_action, 'registered', false)
    when not (select company_enabled from pol) then jsonb_build_object(
      'verdict', 'refused',
      'why', (select why from pol),
      'system', lower(p_system), 'action', p_action, 'blocked_by', 'company')
    when (select manual_only from pol) then jsonb_build_object(
      'verdict', 'manual_only',
      'why', (select why from pol),
      'instruction', 'Do NOT perform this. Write out the exact steps the person takes in ' ||
                     (select label from pol) || ', in order, with the values to enter, and explain what each step does and what it will look like when it worked.',
      'system', lower(p_system), 'action', p_action, 'registered', true)
    when exists (select 1 from grant_row) then jsonb_build_object(
      'verdict', 'allowed',
      'why', coalesce((select 'Approved until ' || to_char(expires_at,'HH24:MI') || '.' from grant_row),
                      'Approved for this sign-in session. It ends when they sign out, not on a timer.'),
      'system', lower(p_system), 'action', p_action, 'registered', true)
    when not (select writes_allowed from pol) and (select kind from pol) = 'device' then jsonb_build_object(
      'verdict', 'ask', 'why', (select why from pol),
      'system', lower(p_system), 'action', p_action, 'registered', true, 'device', true)
    when not (select writes_allowed from pol) then jsonb_build_object(
      'verdict', 'refused', 'why', (select why from pol),
      'system', lower(p_system), 'action', p_action, 'registered', true)
    else jsonb_build_object(
      'verdict', 'ask', 'why', (select why from pol),
      'ask', 'Show exactly what will change, then offer: allow once, allow for this session, or no.',
      'system', lower(p_system), 'action', p_action, 'registered', true)
  end;
$$;

/* Sign-out ends the session, which is the whole meaning of a session grant. */
create or replace function f_ai_end_session(p_user uuid default auth.uid())
returns integer language sql volatile as $$
  with done as (
    update ai_write_approval set revoked_at = now()
    where user_id = p_user and revoked_at is null and expires_at is null
    returning 1)
  select count(*)::int from done;
$$;;
