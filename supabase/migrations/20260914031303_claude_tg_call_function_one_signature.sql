-- REGRESSION, MINE, FOUND BY THE NEW SYNC WATCH (14 Sep 03:12 UTC). On 13 Sep 13:31 I added
-- tg_call_function(p_path text, p_body jsonb default '{}', p_timeout_ms integer default 5000) beside the existing
-- tg_call_function(p_path text, p_body jsonb default '{}'). Any call with one or two arguments became ambiguous
-- ("function tg_call_function(text) is not unique"), so every cron job that calls an edge function that way —
-- alerts_send, docs_parse_backfill among them — has failed on every run since. One signature from now on: the
-- three-argument one, whose defaults cover one-, two- and three-argument calls.
drop function if exists public.tg_call_function(text, jsonb);
-- prove the three call shapes resolve
do $$ begin
  perform pg_get_function_identity_arguments('public.tg_call_function(text, jsonb, integer)'::regprocedure);
  if (select count(*) from pg_proc where proname = 'tg_call_function' and pronamespace = 'public'::regnamespace) <> 1 then
    raise exception 'tg_call_function must have exactly one signature';
  end if;
end $$;;
