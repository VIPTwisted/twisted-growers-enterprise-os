-- THE APEX DISPATCHER. SAME VAULT PATTERN AS METRC. SALES ORDERS ONLY.
--
-- Owner instruction, 28 Aug 2026: "Write the Apex dispatcher. Vault only. First
-- object: Sales orders. PR. Do not APPLY until I send APPLY."
--
-- NOT APPLIED. Written and reviewed against production read-only; held for APPLY.
-- No Apex call is made by this file. Nothing here pulls anything.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- READ THIS BEFORE APPLYING: THIS DISPATCHER CANNOT SUCCEED ON ITS OWN YET.
--
-- apex-sync authenticates callers like this, and only like this:
--
--     async function callerIsExecutive(req) {
--       const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
--       if (!token) return false;
--       const { data } = await supa.auth.getUser(token);       <- needs a PERSON
--       ...  role === "owner" || role === "executive"
--     }
--
-- There is NO x-admin-key branch. metrc-sync grew one in v20 precisely so the
-- database could drive it; apex-sync never did, because it has only ever been
-- clicked by a signed-in human. Measured: no function in this database mentions
-- apex-sync, and nothing schedules it.
--
-- A dispatch from Postgres carries the ANON key as its bearer. That satisfies the
-- Supabase gateway and then fails inside the function, because supa.auth.getUser()
-- on an anon key resolves to no user. Every call this dispatcher makes will return
-- 403 "Executive access required." until apex-sync is given the same admin-key
-- branch metrc-sync already has. That is an edge-function change - deploy plus a
-- manifest re-pin - and it is deliberately NOT in this PR, which is SQL only.
--
-- This file is therefore stage one of two, and it says so rather than shipping a
-- dispatcher that looks installed and quietly 403s. Stage two is ~8 lines in
-- apex-sync/index.ts, copied from metrc-sync's callerIsExecutive.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- WHY THE DISPATCH RECORDS ITS REQUEST ID, WHICH THE METRC ONE DOES NOT.
--
-- net.http_post is fire-and-forget: it returns a request id and never a status.
-- tg_metrc_fire discards that id with `perform`, so metrc_scan_schedule.last_result
-- reads 'dispatched' whether the call was accepted or rejected. That exact blindness
-- cost this platform five hours of dead sync on 7 Aug 2026, when metrc-sync was
-- redeployed with verify_jwt=true and every dispatch returned 401 while the schedule
-- still said 'dispatched'. The note in tg_metrc_fire records it: "no check noticed,
-- because nothing compares metrc_scan_log against metrc_sync_runs."
--
-- Since this dispatcher is GUARANTEED to 403 until stage two lands, shipping it with
-- the same blindness would be indefensible. The request id is captured, returned to
-- the caller and stored, so the real HTTP status is one query away:
--
--     select r.status_code, left(r.content, 300)
--       from net._http_response r
--       join apex_scan_log l on l.request_id = r.id
--      order by l.triggered_at desc limit 1;
--
-- ═══════════════════════════════════════════════════════════════════════════
-- APEX CALLS COST REAL MONEY, WHICH METRC CALLS DO NOT.
--
-- apex-sync reads /v1/usage and tracks credits_used against monthly_credit_limit;
-- entities are billed per call and nesting is billable per nested resource.
-- shipping-orders is pulled with {"with_items": "true"}, so every page bills for the
-- lines too. Two consequences, both built in below:
--
--   · The throttle is the later of the last DISPATCH and the last worker attempt.
--     Throttling on apex_watermark.last_attempt_at alone would be useless while the
--     403 persists - the worker never runs, so that column never moves, and a retry
--     loop could bill the account with nothing to show. The dispatch log is what
--     makes the throttle real before stage two exists.
--
--   · The floor comes from apex_entity.min_interval_minutes (120 for shipping-orders),
--     owner-set data rather than a number hardcoded here.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- WHAT IT WILL NOT DO.
--
--   · It will not touch Metrc. Nothing in this file reads or writes a metrc_ object.
--   · It will not run the 53 items that have never succeeded. An entity with no
--     apex_watermark.last_success_at is refused by name, because "never returned a
--     row" and "returned no rows" are different facts and only the second is safe to
--     retry unattended.
--   · It will not run buyers, catalogue, receiving-orders or transporter-orders.
--     This release answers to ONE entity - shipping-orders - and refuses every other
--     name outright. Widening it is a reviewed one-line change, not a config toggle,
--     because each new entity spends credits.
--   · It will not schedule itself. No cron, no run_times, no automatic traffic.
--     It fires when something calls it by name.
--   · It will not advance or touch a watermark. apex-sync owns apex_watermark and
--     its cursor discipline; a dispatcher that also moved cursors would be a second
--     definition of the same primitive.

/* ── the actor log ─────────────────────────────────────────────────────────────
   Mirrors metrc_scan_log, plus request_id. Nothing currently records WHO asked for
   an Apex pull or whether the ask was accepted. */
create table if not exists public.apex_scan_log (
  id            bigserial primary key,
  entity        text        not null,
  trigger_type  text        not null
                  check (trigger_type = any (array['scheduled','manual','agent'])),
  triggered_by  uuid,
  triggered_at  timestamptz not null default now(),
  request_id    bigint,
  outcome       text        not null
);

comment on table public.apex_scan_log is
'Who asked Apex for a pull, when, and what pg_net request id carried it. trigger_type says which of the three callers it was - scheduled, a person (manual), or the backend agent - and triggered_by holds a uuid only for a person, never a borrowed one for the agent. request_id joins to net._http_response so a dispatch can be checked against the status Apex actually returned, instead of being assumed successful the way the 7 Aug 2026 Metrc outage was for five hours.';

create index if not exists apex_scan_log_entity_time_idx
  on public.apex_scan_log (entity, triggered_at desc);

alter table public.apex_scan_log enable row level security;

/* Readable by anyone who can already see sync state; writable only through the
   SECURITY DEFINER function below. No client writes its own audit row, so there is
   deliberately no insert, update or delete policy: with RLS on and none granted, the
   only way a row appears is tg_apex_fire. */
drop policy if exists apex_scan_log_read on public.apex_scan_log;
create policy apex_scan_log_read on public.apex_scan_log
  for select to authenticated using (true);

/* ── the dispatch ──────────────────────────────────────────────────────────────
   Vault only: both secrets are read from integration_secrets at call time, exactly
   as tg_metrc_fire does. No key is written into this function, none is returned to
   a caller, and rotating either one is a row edit with no redeploy. */
create or replace function public.tg_apex_fire(p_entity text, p_trigger text, p_actor uuid)
returns bigint
language plpgsql
security definer
set search_path to 'public'
as $function$
declare anon text; admin text; hdr jsonb; req bigint;
begin
  select value into anon  from integration_secrets where name = 'SUPABASE_ANON_KEY';
  select value into admin from integration_secrets where name = 'TG_ADMIN_KEY';

  /* Fail CLOSED and say which secret is missing. A dispatch sent without the bearer
     is the 7 Aug 2026 outage exactly: the gateway rejects it before the function's
     own key is ever read, and the log still says 'dispatched'. */
  if anon is null or anon = '' then
    raise exception 'SUPABASE_ANON_KEY is not in integration_secrets. The Supabase gateway '
      'checks a bearer token before apex-sync sees any header of its own.';
  end if;
  if admin is null or admin = '' then
    raise exception 'TG_ADMIN_KEY is not in integration_secrets. Dispatching without it would '
      'reach apex-sync as an anonymous caller and be refused.';
  end if;

  /* The entity name is concatenated into a URL, so it is checked against the shape
     Apex actually uses rather than trusted. Every row in apex_entity matches this;
     anything that does not is a caller error or an injection attempt, and either way
     it must not reach net.http_post. There is no url-encode function in this database
     and this guard is why one is not needed. */
  if p_entity !~ '^[a-z0-9][a-z0-9-]*$' then
    raise exception 'Refusing to dispatch %L: an Apex entity name is lower-case letters, digits and hyphens.', p_entity;
  end if;

  hdr := jsonb_build_object(
           'x-admin-key',   admin,
           'Authorization', 'Bearer ' || anon,
           'Content-Type',  'application/json');

  select net.http_post(
           url := 'https://fxetuqjryttnypgepsru.supabase.co/functions/v1/apex-sync?entity='
                  || p_entity,
           headers := hdr,
           body := '{}'::jsonb,
           timeout_milliseconds := 300000)
    into req;

  insert into public.apex_scan_log (entity, trigger_type, triggered_by, request_id, outcome)
  values (p_entity, p_trigger, p_actor, req,
          'dispatched — status not yet known, join net._http_response on request_id');

  return req;
end $function$;

comment on function public.tg_apex_fire(text, text, uuid) is
'Posts one entity to apex-sync using the vault pattern: SUPABASE_ANON_KEY as the gateway bearer and TG_ADMIN_KEY as the function''s own header, both read from integration_secrets at call time so neither is baked in and either can be rotated without a redeploy. Fails closed and names the missing secret. Returns the pg_net request id and stores it on apex_scan_log, so the dispatch can be reconciled against net._http_response rather than assumed to have worked - the check that was missing when Metrc sync sat dead for five hours on 7 Aug 2026 with its schedule still reading "dispatched". Call it through tg_apex_sync_now, which holds the gate and the throttle.';

/* ── the gate ──────────────────────────────────────────────────────────────────
   Same three-way discriminator as tg_metrc_scan_now, for the same reasons, and the
   comments there apply verbatim: session_user rather than current_user because
   current_user is rewritten to the function owner inside SECURITY DEFINER and would
   admit everyone; auth.uid() null and no PostgREST request context because a browser
   always has both and a backend session never does; SET ROLE cannot manufacture any
   of it. */
create or replace function public.tg_apex_sync_now(p_entity text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  e            apex_entity;
  v_role       app_role;
  v_is_backend boolean;
  v_trigger    text;
  v_success    timestamptz;
  v_last       timestamptz;
  mins         numeric;
  req          bigint;
begin
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
      'error', 'Administrator access required. Pulling Apex on demand is limited to owner and executive accounts, or to a backend agent session.');
  end if;

  /* ONE ENTITY, BY NAME. The owner scoped this release to Sales orders and every
     Apex call is billed, so anything else is refused here rather than being left to
     a config row someone can widen without review. shipping-orders is Apex's name
     for it - apex_entity.label reads "Sales orders (outbound)". */
  if p_entity is distinct from 'shipping-orders' then
    return jsonb_build_object('ok', false,
      'error', format('This dispatcher answers to shipping-orders only, not %L. Sales orders is the first and currently the only object it is scoped to; adding another is a reviewed change, because every Apex entity is billed per call.', p_entity));
  end if;

  select * into e from apex_entity where entity = p_entity;
  if not found then
    return jsonb_build_object('ok', false,
      'error', format('No Apex entity named %L is registered in apex_entity.', p_entity));
  end if;

  /* NEVER THE ITEMS THAT HAVE NEVER WORKED. "Returned no rows" and "has never once
     returned a row" are different facts, and only the first is safe to retry
     unattended - the second usually means a scope the key does not hold, which bills
     for a 403. 53 of the 66 registered items are in that state. */
  select last_success_at into v_success from apex_watermark where entity = p_entity;
  if v_success is null then
    return jsonb_build_object('ok', false,
      'error', format('%L has never completed a successful pull, so it is not dispatched unattended. Run it once by hand and confirm what Apex returns before automating it.', p_entity));
  end if;

  /* THE THROTTLE IS THE LATER OF THE LAST DISPATCH AND THE LAST WORKER ATTEMPT.
     Throttling on apex_watermark.last_attempt_at alone is useless while apex-sync
     still refuses backend callers: the worker never runs, that column never moves,
     and a retry loop would bill the account for a stream of 403s. The dispatch log
     is what makes the floor real before stage two lands. */
  select greatest(
           coalesce(v_success, '-infinity'::timestamptz),
           coalesce((select last_attempt_at from apex_watermark where entity = p_entity), '-infinity'::timestamptz),
           coalesce((select max(triggered_at) from apex_scan_log where entity = p_entity), '-infinity'::timestamptz))
    into v_last;

  mins := extract(epoch from (now() - v_last)) / 60;
  if mins < coalesce(e.min_interval_minutes, 120) then
    return jsonb_build_object('ok', false, 'throttled', true,
      'error', format('%s was last asked for %s minutes ago. Apex is not called again within %s minutes: every entity is billed per call and this one is pulled with its line items.',
                      coalesce(e.label, e.entity), round(mins), coalesce(e.min_interval_minutes, 120)),
      'last_asked', v_last,
      'next_allowed', v_last + make_interval(mins => coalesce(e.min_interval_minutes, 120)));
  end if;

  /* triggered_by stays auth.uid(): a person's id when a person asked, NULL when the
     agent did. The agent never borrows an identity; trigger_type carries the truth. */
  req := tg_apex_fire(e.entity, v_trigger, auth.uid());

  return jsonb_build_object('ok', true,
    'actor', v_trigger,
    'entity', e.entity,
    'request_id', req,
    'message', format('%s dispatched to apex-sync by %s. This is a REQUEST, not a result: read net._http_response on request_id %s for the status, and apex_sync_run for what was actually pulled.',
                      coalesce(e.label, e.entity),
                      case when v_trigger = 'agent' then 'the backend agent' else 'an administrator' end,
                      req));
end $function$;

comment on function public.tg_apex_sync_now(text) is
'Asks apex-sync for ONE Apex entity on demand. Scoped to shipping-orders - Sales orders (outbound) - and refuses every other name, because each Apex entity is billed per call and widening this is a reviewed change rather than a toggle. Callable by an owner or executive account, or by a backend agent session recognised the same way tg_metrc_scan_now recognises one; an agent call is logged as trigger_type agent with triggered_by NULL and never borrows a person''s id. Refuses any entity that has never completed a successful pull, throttles on the later of the last dispatch and the last worker attempt against apex_entity.min_interval_minutes, and returns the pg_net request id because a dispatch is a request and not a result. NOTE: until apex-sync is given the x-admin-key branch that metrc-sync has had since v20, every dispatch from here returns 403 - the anon bearer satisfies the gateway and then resolves to no user inside the function.';
