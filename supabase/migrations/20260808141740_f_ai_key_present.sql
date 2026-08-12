/* IS THERE A KEY - not what it is. Owner, 8 Aug 2026: "ai still an issue",
   "speed is critical".

   app_secrets.ANTHROPIC_API_KEY is empty, so budz-chat answers every question
   with "No artificial intelligence key has been set yet" and everything falls
   through to the desktop bridge: free, and 39 to 250 seconds. The company
   setting said "Fall back to the metered API: ON" the entire time, which is a
   switch that reports enabled while the thing it enables cannot run - the same
   shape as a check that cannot fail.

   Returns a BOOLEAN. The key value itself never leaves the database, and no
   screen ever needs it - a screen needs to know whether to warn. */
create or replace function f_ai_key_present()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from app_secrets
    where key = 'ANTHROPIC_API_KEY' and coalesce(btrim(value), '') <> ''
  );
$$;

comment on function f_ai_key_present is
  'True when an Anthropic key is set. Returns whether, never what - the value never leaves the database. Used by the assistant settings page to warn that the fast answering path cannot run.';

revoke all on function f_ai_key_present() from public;
grant execute on function f_ai_key_present() to authenticated;;
