/* LEAST PRIVILEGE ON THE PHONE. Owner, 8 August 2026: "no location is
   permitted", "no access to anything on phone other than what is needed".

   The deny list is written out row by row rather than left implicit, for two
   reasons. It is VISIBLE - the owner can open the console and see that location
   is refused, instead of trusting that nobody added it. And it is REFUSED, not
   merely absent: a capability nobody registered would otherwise fall through to
   "ask", which is how a permission prompt for something never agreed to ends up
   in front of a member of staff who taps yes.

   What is needed: a camera to read a tag, a label, a COA or a manifest, and a
   microphone to speak a question with gloves on. That is the entire list. */
alter table ai_write_policy
  add column if not exists never_allowed boolean not null default false;

comment on column ai_write_policy.never_allowed is
  'Refused outright. Not a default, not a setting - no user and no administrator can turn it on, and the only way to change it is a migration somebody has to write and explain. Owner ruling 8 Aug 2026.';

insert into ai_write_policy (system, label, kind, writes_allowed, requires_approval, manual_only, never_allowed, company_enabled, why) values
  ('location', 'Location / GPS', 'device', false, true, false, true, false,
   'Owner ruling 8 Aug 2026: "no location is permitted". Never asked for, never used. Tracking where staff are is not something this assistant does, and a licensed operator has no reason to hold it.'),
  ('contacts', 'Contacts', 'device', false, true, false, true, false,
   'Owner ruling 8 Aug 2026: no access to anything on the phone beyond what the job needs.'),
  ('photo_library', 'Photo library', 'device', false, true, false, true, false,
   'Owner ruling 8 Aug 2026: no access beyond what is needed. Reading a tag needs the CAMERA, one picture at a time, taken deliberately - not the roll.'),
  ('files', 'Files on the device', 'device', false, true, false, true, false,
   'Owner ruling 8 Aug 2026: no access beyond what is needed. Documents come from the platform, not from the phone.'),
  ('calendar', 'Calendar', 'device', false, true, false, true, false,
   'Owner ruling 8 Aug 2026: no access beyond what is needed.'),
  ('messages', 'Messages and call history', 'device', false, true, false, true, false,
   'Owner ruling 8 Aug 2026: no access beyond what is needed.'),
  ('bluetooth', 'Bluetooth and nearby devices', 'device', false, true, false, true, false,
   'Owner ruling 8 Aug 2026: no access beyond what is needed.')
on conflict (system) do update
  set label = excluded.label, kind = excluded.kind, never_allowed = excluded.never_allowed,
      company_enabled = excluded.company_enabled, why = excluded.why, updated_at = now();

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
    /* NEVER AUTOMATIC. No signed-in person, no action. */
    when p_user is null then jsonb_build_object(
      'verdict', 'refused',
      'why', 'Owner hard rule, 8 Aug 2026: nothing is ever automatic. This was reached with no signed-in person - a schedule, a background scan or a cron job. Background work may propose an action and must never perform one.',
      'system', lower(p_system), 'action', p_action, 'automatic', true)
    /* Refused outright, above every setting and every grant. */
    when (select never_allowed from pol) then jsonb_build_object(
      'verdict', 'refused',
      'why', (select why from pol),
      'permanent', true,
      'system', lower(p_system), 'action', p_action)
    when not exists (select 1 from pol) then jsonb_build_object(
      'verdict', 'ask',
      'why', 'This system is not registered in ai_write_policy. Nothing unregistered is written to without the person saying so first. If this is a capability on someone''s phone or computer, the answer is no: only the camera and the microphone are ever used, and only when switched on.',
      'system', lower(p_system), 'action', p_action, 'registered', false)
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
$$;;
