/* TWO MORE OWNER RULINGS, 8 August 2026.

   "never automatic hard rule" - nothing the assistant does is ever automatic.
   Enforced structurally, not by instruction: an action needs a REAL SIGNED-IN
   PERSON who granted it. A cron job, a scheduled scan or a proactive watchdog
   has no p_user, so f_ai_may returns refused and there is no code path that can
   perform a write on a timer. Background work may PROPOSE - it can never act.

   "user must toggle this feature on or off and admin can shut off for all users
   and not allow phone and camera" - two levels, and the company level wins. A
   user turning the camera on cannot override an admin who turned it off for
   everyone. */
alter table ai_write_policy
  add column if not exists company_enabled boolean not null default true;

comment on column ai_write_policy.company_enabled is
  'Admin kill switch for the whole company. False means no user may use this, whatever they have turned on for themselves. Owner ruling 8 Aug 2026: "admin can shut off for all users and not allow phone and camera".';

create or replace function f_ai_may(p_user uuid, p_system text, p_action text default null)
returns jsonb language sql stable as $$
  with pol as (select * from ai_write_policy where system = lower(p_system)),
       grant_row as (
         select * from ai_write_approval
         where user_id = p_user and system = lower(p_system)
           and revoked_at is null and expires_at > now()
           and (action is null or action = p_action)
         order by expires_at desc limit 1
       )
  select case
    /* NEVER AUTOMATIC. No signed-in person, no action - this is the branch that
       makes the hard rule real rather than written down. */
    when p_user is null then jsonb_build_object(
      'verdict', 'refused',
      'why', 'Owner hard rule, 8 Aug 2026: nothing is ever automatic. This was reached with no signed-in person - a schedule, a background scan or a cron job. Background work may propose an action and must never perform one.',
      'system', lower(p_system), 'action', p_action, 'automatic', true)
    when not exists (select 1 from pol) then jsonb_build_object(
      'verdict', 'ask',
      'why', 'This system is not registered in ai_write_policy. Nothing unregistered is written to without the person saying so first.',
      'system', lower(p_system), 'action', p_action, 'registered', false)
    /* The company switch outranks anything the user has turned on. */
    when not (select company_enabled from pol) then jsonb_build_object(
      'verdict', 'refused',
      'why', 'An administrator has turned ' || (select label from pol) || ' off for the whole company. A personal setting cannot override it.',
      'system', lower(p_system), 'action', p_action, 'blocked_by', 'company')
    when (select manual_only from pol) then jsonb_build_object(
      'verdict', 'manual_only',
      'why', (select why from pol),
      'instruction', 'Do NOT perform this. Write out the exact steps the person takes in ' ||
                     (select label from pol) || ', in order, with the values to enter, and explain what each step does and what it will look like when it worked.',
      'system', lower(p_system), 'action', p_action, 'registered', true)
    when not (select writes_allowed from pol) and (select kind from pol) = 'device' then jsonb_build_object(
      'verdict', 'ask',
      'why', (select why from pol),
      'system', lower(p_system), 'action', p_action, 'registered', true, 'device', true)
    when not (select writes_allowed from pol) then jsonb_build_object(
      'verdict', 'refused',
      'why', (select why from pol),
      'system', lower(p_system), 'action', p_action, 'registered', true)
    when exists (select 1 from grant_row) then jsonb_build_object(
      'verdict', 'allowed',
      'why', 'Approved for this session until ' || (select to_char(expires_at,'HH24:MI') from grant_row) || '.',
      'system', lower(p_system), 'action', p_action, 'registered', true)
    else jsonb_build_object(
      'verdict', 'ask',
      'why', (select why from pol),
      'ask', 'Show exactly what will change, then offer: allow once, allow for this session, or no.',
      'system', lower(p_system), 'action', p_action, 'registered', true)
  end;
$$;

comment on function f_ai_may(uuid, text, text) is
  'The single authority on what the assistant may do. allowed | ask | manual_only | refused. Metrc is always manual_only. A null user is always refused - nothing is automatic. The company kill switch outranks every personal setting.';;
