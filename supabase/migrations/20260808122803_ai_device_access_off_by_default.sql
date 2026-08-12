/* CAMERA AND PHONE. Owner, 8 August 2026: "yes camera and phone only if user
   wants to", "phone and camera access is to shut off and permission to be asked
   again". Off by default, and the answer is asked for again rather than
   remembered forever.

   Carried in the SAME table as the write targets rather than a parallel one, so
   there is a single place to answer "what is Budz allowed to do", one grant
   table, one function and one console. Two tables would be two things to keep in
   step, and keeping copies in step is the failure this codebase keeps hitting. */
alter table ai_write_policy add column if not exists kind text not null default 'write_target';
comment on column ai_write_policy.kind is
  'write_target = a system the assistant may write into. device = hardware on the user''s machine it may reach.';

insert into ai_write_policy (system, label, kind, writes_allowed, requires_approval, manual_only, why) values
  ('camera', 'Camera', 'device', false, true, false,
   'Owner ruling 8 Aug 2026: OFF until the person turns it on, and asked for again rather than remembered. Used for reading a package tag, a label, a COA or a manifest.'),
  ('microphone', 'Microphone', 'device', false, true, false,
   'Owner ruling 8 Aug 2026: OFF until the person turns it on, and asked for again. Used for speaking a question instead of typing it.'),
  ('phone', 'Phone / mobile device', 'device', false, true, false,
   'Owner ruling 8 Aug 2026: OFF until the person turns it on, and asked for again.')
on conflict (system) do update
  set label = excluded.label, kind = excluded.kind, writes_allowed = excluded.writes_allowed,
      requires_approval = excluded.requires_approval, manual_only = excluded.manual_only,
      why = excluded.why, updated_at = now();

/* THE ONE QUESTION THE ACTION LAYER MUST ASK, and the only place the answer is
   decided. Deliberately NOT a boolean: "no" and "no, but here is how you do it
   yourself" are different answers, and collapsing them is how an assistant ends
   up saying "I can't" when the owner asked for instructions. */
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
    when not exists (select 1 from pol) then jsonb_build_object(
      'verdict', 'ask',
      'why', 'This system is not registered in ai_write_policy. Nothing unregistered is written to without the person saying so first.',
      'system', lower(p_system), 'action', p_action, 'registered', false)
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
  'The single authority on what the assistant may do. Returns allowed | ask | manual_only | refused. Metrc always returns manual_only. Camera, microphone and phone always return ask until the person grants them, and the grant expires.';;
