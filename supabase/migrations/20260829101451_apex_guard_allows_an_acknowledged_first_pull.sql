-- THE APEX DISPATCHER ANSWERS TO TWO ENTITIES, AND A FIRST PULL MUST BE ASKED FOR.
--
-- Owner instruction, 29 Aug 2026: "Dispatcher answers to shipping-orders AND
-- receiving-orders only. Keep never succeeded blocked for automation. Allow a first
-- pull only when the entity is named AND the caller passes acknowledge_first_pull =
-- true. Do not add buyers, products, or any third entity."
--
-- APPLIED to production 2026-08-29 10:14:51 UTC as migration 20260829101451.
-- This header said NOT APPLIED until then, and the file was named 20260829010000 —
-- a version nobody assigned. apply_migration picks its own version and does not
-- write a file, so the name here and the name in the ledger disagreed, and
-- migration-drift correctly reported one migration as both missing from the repo
-- and unapplied in production. Renamed onto the ledger's version, 29 Aug 2026.
-- The SQL below is unchanged and was verified character-for-character against
-- schema_migrations.statements before the rename.
--
-- Nothing here pulls anything, and applying it pulled nothing either - it installs
-- a gate, and the gate still has to be called.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- THE GUARD WAS KEYED ON THE WRONG COLUMN, AND THE OWNER'S FOURTH RULE IS WHAT
-- EXPOSED IT.
--
-- The rule: "Zero-row success must HOLD the cursor at the seed and record
-- last_success_at. Never advance a green zero over history again."
--
-- apex-sync ALREADY does exactly that, and has since v4. Verified in the deployed
-- source rather than assumed:
--
--     const provenNonEmpty = rows.length > 0 || await entityHasEverReturnedRows(...)
--     const holdCursor     = e.supports_delta && !provenNonEmpty;
--     const nextCursor     = holdCursor ? (watermarkBefore ?? seed) : started;
--     ... upsert({ updated_at_from: nextCursor, last_success_at: now, ... })
--
-- So no worker change is needed and none is made here. But follow it through: a
-- zero-row first pull of receiving-orders will SET last_success_at while the entity
-- has still never returned a row. My guard tested `last_success_at is null`, so that
-- single empty pull would have quietly re-opened the entity to unattended automation -
-- a green zero unlocking the door, which is the same class of mistake the rule is
-- there to prevent, one level up.
--
-- The guard is therefore re-keyed to the fact it was always trying to express: HAS
-- THIS ENTITY EVER RETURNED A ROW. That is `exists (select 1 from apex_raw where
-- entity = ...)`, which is the same question apex-sync's entityHasEverReturnedRows()
-- asks. One definition of the primitive, in two places that must agree, rather than
-- two different definitions that drift.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- WHY THE SIGNATURE IS DROPPED AND REBUILT RATHER THAN OVERLOADED.
--
-- Adding `p_acknowledge_first_pull boolean default false` alongside the existing
-- one-argument function would leave BOTH resolvable for a one-argument call, and
-- Postgres refuses that at call time: "function tg_apex_sync_now(unknown) is not
-- unique". The old signature is dropped explicitly so there is exactly one.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- WHAT RECEIVING-ORDERS ACTUALLY IS, MEASURED BEFORE WRITING THIS.
--
--   apex_entity          receiving-orders, "Purchase orders (inbound)", /receiving-orders
--                        kind money, delta required, root key orders,
--                        nesting {} - NO line items, so far cheaper than sales
--                        min_interval_minutes 720 against sales' 120
--   apex_raw             0 rows. Not a small number. None.
--   apex_watermark       cursor 2023-11-30 17:52 (the seed), last_success_at NULL
--   apex_sync_run        two runs, ever:
--                          09 Aug 22:21  HTTP 422  updated_at_from required
--                          10 Aug 00:03  HTTP 200  ok, 0 rows
--
-- The watermark was deliberately reset to the seed with last_success_at cleared,
-- because that zero-row "ok" had advanced the cursor and put the history behind a
-- green status. The key does hold view:receiving-orders - confirmed in the scope list
-- Apex returned from /welcome - so a 403 is not what is happening here.
--
-- Nothing in this file decides whether Apex is empty. It makes ONE careful first ask
-- possible, and the owner's own reading stands: if Apex returns 0, that is "not
-- booked in Apex", NOT "no purchases exist". No platform record is invented from a
-- zero.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- WHAT IS STILL REFUSED.
--
--   · every entity except shipping-orders and receiving-orders, by name. No buyers,
--     no products, no catalogue, no third entity. 46 entities are registered and 44
--     of them are unreachable from here.
--   · an entity that has never returned a row, unless the caller names it AND passes
--     acknowledge_first_pull. A schedule cannot pass that flag by accident: it is
--     false by default and has to be written by whoever calls.
--   · anything inside its refresh window - 720 minutes for receiving-orders, 120 for
--     sales - measured from the later of the last dispatch and the last worker attempt.
--   · anyone who is not an owner, an executive, or the backend agent.
drop function if exists public.tg_apex_sync_now(text);

create or replace function public.tg_apex_sync_now(
  p_entity                 text,
  p_acknowledge_first_pull boolean default false)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  e              apex_entity;
  v_role         app_role;
  v_is_backend   boolean;
  v_trigger      text;
  v_ever_rows    boolean;
  v_last         timestamptz;
  mins           numeric;
  req            bigint;
  k_allowed      constant text[] := array['shipping-orders','receiving-orders'];
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

  /* TWO ENTITIES, BY NAME. Every Apex entity is billed per call, so widening this is a
     reviewed change and never a config toggle. 46 are registered; 44 are unreachable
     from here on purpose. */
  if not (p_entity = any (k_allowed)) then
    return jsonb_build_object('ok', false,
      'error', format('This dispatcher answers to %s only, not %L. Adding another entity is a reviewed change, because every Apex entity is billed per call.',
                      array_to_string(k_allowed, ' and '), p_entity));
  end if;

  select * into e from apex_entity where entity = p_entity;
  if not found then
    return jsonb_build_object('ok', false,
      'error', format('No Apex entity named %L is registered in apex_entity.', p_entity));
  end if;

  /* HAS IT EVER RETURNED A ROW - not "has it ever reported success". A zero-row pull
     is recorded as a success by design and sets last_success_at while the entity has
     still produced nothing, so testing success would let one empty answer re-open the
     entity to automation. apex_raw is the same question apex-sync asks itself. */
  select exists (select 1 from apex_raw where entity = p_entity) into v_ever_rows;

  if not v_ever_rows and not coalesce(p_acknowledge_first_pull, false) then
    return jsonb_build_object('ok', false, 'first_pull_required', true,
      'error', format('%L has never returned a row, so it is not pulled unattended. This is a FIRST PULL: call it again with acknowledge_first_pull => true, by a person deciding to spend the credits. If Apex answers zero, that means the records are not booked in Apex - it does not mean they do not exist, and nothing may be invented from it.', p_entity));
  end if;

  /* Throttle on the later of the last dispatch and the last worker attempt. The worker
     column alone is useless when a dispatch never reaches the worker, and Apex bills
     per call, so the dispatch log is what makes the floor real. */
  select greatest(
           coalesce((select last_success_at from apex_watermark where entity = p_entity), '-infinity'::timestamptz),
           coalesce((select last_attempt_at from apex_watermark where entity = p_entity), '-infinity'::timestamptz),
           coalesce((select max(triggered_at) from apex_scan_log where entity = p_entity), '-infinity'::timestamptz))
    into v_last;

  mins := extract(epoch from (now() - v_last)) / 60;
  if mins < coalesce(e.min_interval_minutes, 120) then
    return jsonb_build_object('ok', false, 'throttled', true,
      'error', format('%s was last asked for %s minutes ago. Apex is not called again within %s minutes: every entity is billed per call.',
                      coalesce(e.label, e.entity), round(mins), coalesce(e.min_interval_minutes, 120)),
      'last_asked', v_last,
      'next_allowed', v_last + make_interval(mins => coalesce(e.min_interval_minutes, 120)));
  end if;

  req := tg_apex_fire(e.entity, v_trigger, auth.uid());

  /* An acknowledged first pull is written into the audit row, because "somebody
     deliberately unlocked this once" is exactly the thing a log should not lose. */
  if not v_ever_rows then
    update apex_scan_log
       set outcome = outcome || ' — FIRST PULL, acknowledge_first_pull was passed; this entity had never returned a row'
     where request_id = req;
  end if;

  return jsonb_build_object('ok', true,
    'actor', v_trigger,
    'entity', e.entity,
    'first_pull', not v_ever_rows,
    'request_id', req,
    'message', format('%s dispatched to apex-sync by %s%s. This is a REQUEST, not a result: read net._http_response on request_id %s for the status, and apex_sync_run for what was actually pulled.',
                      coalesce(e.label, e.entity),
                      case when v_trigger = 'agent' then 'the backend agent' else 'an administrator' end,
                      case when not v_ever_rows then ' as an acknowledged FIRST PULL' else '' end,
                      req));
end $function$;

comment on function public.tg_apex_sync_now(text, boolean) is
'Asks apex-sync for ONE Apex entity on demand. Scoped to shipping-orders (Sales orders, outbound) and receiving-orders (Purchase orders, inbound) and refuses all 44 other registered entities by name, because each is billed per call. Callable by an owner or executive account, or by a backend agent session recognised the way tg_metrc_scan_now recognises one; an agent call is logged as trigger_type agent with triggered_by NULL and never borrows a person''s id. An entity that has NEVER RETURNED A ROW - tested against apex_raw, the same question apex-sync''s entityHasEverReturnedRows asks, and deliberately not against last_success_at, which a zero-row success sets - is refused unless the caller names it and passes acknowledge_first_pull, which a schedule cannot do by accident. Throttles on the later of the last dispatch and the last worker attempt against apex_entity.min_interval_minutes. Returns the pg_net request id, because a dispatch is a request and not a result. A zero-row answer means the records are not booked in Apex; it is not evidence they do not exist, and nothing may be created from it.';

/* The dispatcher must reach these two and nothing else. If a later edit widens it, this
   fails the migration rather than letting a third entity through quietly. */
do $$
declare bad text;
begin
  select string_agg(x, ', ') into bad
  from unnest(array['buyers','products','catalogue','transporter-orders','deal-docs','company']) x
  where (public.tg_apex_sync_now(x)->>'ok')::boolean is not false;

  if bad is not null then
    raise exception 'tg_apex_sync_now accepted an entity it must refuse: %', bad;
  end if;
end $$;
