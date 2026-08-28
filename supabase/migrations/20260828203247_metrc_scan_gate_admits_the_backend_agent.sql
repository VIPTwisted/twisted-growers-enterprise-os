-- THE ON-DEMAND METRC SCAN ADMITS THE BACKEND AGENT, AND SAYS SO IN THE LOG.
-- Owner ruling, 28 Aug 2026: "agent may run the sanctioned Metrc worker. Do not
-- forge auth.uid() or JWT claims."
--
-- NOT APPLIED. Held for the owner's APPLY, and no scan runs until then.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- WHAT WAS BLOCKING, MEASURED RATHER THAN ASSUMED.
--
-- tg_metrc_scan_now gates on auth.uid() -> app_users.role in (owner, executive).
-- An agent session on this platform connects as the database role `postgres`
-- with auth.uid() NULL, no JWT claims and no app_users row, so it was refused:
--
--   {"ok": false, "error": "Administrator access required. Scanning Metrc on
--    demand is limited to owner and executive accounts."}
--
-- The refusal was correct and is left standing for browsers. What changes is
-- that a BACKEND session is now a recognised third caller, instead of the agent
-- having to pretend to be the owner to get past a control written for people.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- HOW THE BACKEND IS RECOGNISED, AND WHY IT CANNOT BE SPOOFED FROM A BROWSER.
--
-- Three conditions, all required:
--
--   session_user in ('postgres','supabase_admin','service_role')
--     SESSION_USER, not current_user. Inside a SECURITY DEFINER function
--     current_user is rewritten to the function OWNER, so it reads 'postgres'
--     for every caller and would admit the world — this platform has already
--     shipped that exact bug once, in f_xq_reader on 28 Aug, where a simulated
--     staff session passed a gate and read 210 rows it should not have.
--     session_user is NOT rewritten, and under PostgREST it is 'authenticator'
--     for every web caller.
--
--   auth.uid() is null
--     A signed-in person always has one. A backend connection never does.
--
--   current_setting('request.jwt.claims', true) is null
--     PostgREST always sets this. Its absence means there is no HTTP request
--     behind this call at all, so no browser can reach this branch whatever role
--     it manages to set.
--
-- SET ROLE cannot manufacture this: it changes current_user and leaves
-- session_user alone, which is the whole reason session_user is the test.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- THE ACTOR IS LOGGED AS THE AGENT, NOT AS THE OWNER.
--
-- metrc_scan_log.triggered_by is a uuid and the agent has none. It stays NULL
-- rather than borrowing a person's id — writing the owner's uuid against a scan
-- he did not start is exactly the forgery the ruling forbids, and it would
-- survive in the log long after anyone remembers why.
--
-- trigger_type carries the truth instead. Its CHECK allowed only 'scheduled' and
-- 'manual', so 'agent' is added: three ways a scan can start, three words for
-- them, and a reader can tell which without inferring it from a null.
--
-- NO CREDENTIAL IS COPIED. This function still calls tg_metrc_fire, which reads
-- TG_ADMIN_KEY and SUPABASE_ANON_KEY out of integration_secrets itself and posts
-- to the same vendor URL. Nothing about the Metrc path, the endpoints, or the
-- keys changes here, and no key is ever returned to a caller.
alter table public.metrc_scan_log
  drop constraint if exists metrc_scan_log_trigger_type_check;

alter table public.metrc_scan_log
  add constraint metrc_scan_log_trigger_type_check
  check (trigger_type = any (array['scheduled'::text, 'manual'::text, 'agent'::text]));

create or replace function public.tg_metrc_scan_now(p_job_name text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  r            metrc_scan_schedule;
  v_role       app_role;
  v_is_backend boolean;
  v_trigger    text;
  mins         numeric;
  failed       boolean;
begin
  /* Who is calling. A person is identified by auth.uid(); the backend by the
     absence of any request context at all. The two are mutually exclusive. */
  select role into v_role from app_users where user_id = auth.uid();

  v_is_backend := (
        auth.uid() is null
    and current_setting('request.jwt.claims', true) is null
    and session_user in ('postgres', 'supabase_admin', 'service_role')
  );

  if v_is_backend then
    v_trigger := 'agent';
  elsif v_role is not null and v_role = any (array['owner'::app_role, 'executive'::app_role]) then
    v_trigger := 'manual';
  else
    return jsonb_build_object('ok', false,
      'error', 'Administrator access required. Scanning Metrc on demand is limited to owner and executive accounts, or to a backend agent session.');
  end if;

  select * into r from metrc_scan_schedule where job_name = p_job_name;
  if not found then
    return jsonb_build_object('ok', false, 'error', format('No scan group named %L.', p_job_name));
  end if;
  if not r.enabled then
    return jsonb_build_object('ok', false,
      'error', format('The %s scan is switched off. Reason on record: %s', r.job_name, coalesce(r.description,'none given')));
  end if;

  -- did the previous run fail? a failure is always retryable
  select exists (select 1 from metrc_sync_runs s
                  where s.status <> 'ok' and s.started_at >= coalesce(r.last_run_at, now()-interval '1 day'))
    into failed;

  /* THE THROTTLE APPLIES TO THE AGENT TOO, DELIBERATELY. An agent can call this
     in a loop far faster than a person can click it, so the one guard against
     hammering a state regulator's API is the last guard that should be relaxed
     for automation. */
  mins := extract(epoch from (now() - coalesce(r.last_run_at, now()-interval '999 days')))/60;
  if mins < r.min_gap_minutes and not failed then
    return jsonb_build_object('ok', false, 'throttled', true,
      'error', format('%s was pulled %s minutes ago. Metrc is not scanned again within %s minutes unless the last attempt failed.',
                      initcap(r.job_name), round(mins), r.min_gap_minutes),
      'last_pulled', r.last_run_at,
      'next_allowed', r.last_run_at + make_interval(mins => r.min_gap_minutes));
  end if;

  /* triggered_by stays auth.uid(): the owner's id when a person clicked, and
     NULL when the agent called. The word in trigger_type is what says which. */
  perform tg_metrc_fire(r, v_trigger, auth.uid());

  return jsonb_build_object('ok', true,
    'actor', v_trigger,
    'message', format('%s scan started by %s%s.', initcap(r.job_name),
                      case when v_trigger = 'agent' then 'the backend agent' else 'an administrator' end,
                      case when failed then ' (previous attempt failed, so the wait was waived)' else '' end));
end $function$;

comment on function public.tg_metrc_scan_now(text) is
'Starts one Metrc scan group on demand. Callable by an owner or executive account, or by a backend agent session - recognised as session_user in (postgres, supabase_admin, service_role) with no auth.uid() and no PostgREST request context, so no browser can reach that branch whatever role it sets. An agent call is logged with trigger_type = agent and triggered_by NULL: the agent never borrows a person''s identity. The min_gap_minutes throttle applies to the agent as well, because automation can hammer a regulator''s API faster than a person can. Credentials are untouched - tg_metrc_fire still reads them from integration_secrets and no key is returned to any caller.';
