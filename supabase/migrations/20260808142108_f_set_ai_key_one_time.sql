/* SET THE KEY ONCE, FOR THE WHOLE COMPANY. Owner, 8 August 2026: "fix for all
   ai entire OS", "should be one time setup", "not everytime user logs in or
   resets".

   It already IS one row for the whole platform - app_secrets, read by budz-chat
   for every question from the assistant page, Brain and the pet alike. Nothing
   about it is per user and nothing resets it on sign-in. What was missing was
   any way to SET it: the settings page told him to paste a key under "Settings,
   Keys and Connections", and no such screen exists. An instruction pointing at a
   page that was never built is the same failure as the assistant claiming it can
   answer anything while its web tools were fenced off.

   OWNER OR EXECUTIVE ONLY, enforced here rather than in the browser, because a
   check that lives only in the interface is not a check. The value is written
   and never returned - no screen ever needs to read it back, and f_ai_key_present
   answers the only question a screen has, which is whether one exists. */
create or replace function f_set_ai_key(p_key text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_role text;
begin
  select role::text into v_role from app_users where user_id = auth.uid();
  if v_role is null or v_role not in ('owner','executive') then
    return jsonb_build_object('ok', false,
      'message', 'Only an owner or an executive can set the company key.');
  end if;

  if p_key is null or btrim(p_key) = '' then
    return jsonb_build_object('ok', false,
      'message', 'That was empty. To remove the key deliberately, use the Remove button.');
  end if;

  /* A pasted key routinely arrives with a trailing space or a newline from the
     clipboard, and an invisible character is a very expensive thing to debug at
     the far end of an HTTP call. */
  insert into app_secrets (key, value)
  values ('ANTHROPIC_API_KEY', btrim(p_key))
  on conflict (key) do update set value = excluded.value;

  return jsonb_build_object('ok', true,
    'message', 'Saved for the whole company. Every assistant on the platform uses it from the next question - nobody sets this again, and signing out does not clear it.');
end $$;

comment on function f_set_ai_key is
  'One-time company-wide setup. Owner or executive only. Writes app_secrets.ANTHROPIC_API_KEY and never returns it. Not per user, not cleared by sign-out.';

create or replace function f_clear_ai_key()
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_role text;
begin
  select role::text into v_role from app_users where user_id = auth.uid();
  if v_role is null or v_role not in ('owner','executive') then
    return jsonb_build_object('ok', false, 'message', 'Only an owner or an executive can remove the company key.');
  end if;
  update app_secrets set value = '' where key = 'ANTHROPIC_API_KEY';
  return jsonb_build_object('ok', true,
    'message', 'Removed. Questions fall back to the desktop bridge, which is free and slower.');
end $$;

revoke all on function f_set_ai_key(text) from public;
revoke all on function f_clear_ai_key() from public;
grant execute on function f_set_ai_key(text) to authenticated;
grant execute on function f_clear_ai_key() to authenticated;;
