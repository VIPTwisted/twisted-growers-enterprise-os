/* apex_guard_allows_an_acknowledged_first_pull — applied to production
   2026-08-29 10:14:51 UTC as migration 20260829101451, by the Apex lane.

   FILED AFTER THE FACT, AND THAT IS THE DEFECT THIS RECORDS. `apply_migration`
   writes Supabase's own history and does NOT write a file here, so this ran in
   production with nothing in the repository to say what it was. Standard rule 6:
   what runs in production is in the repository. Every production build since
   28 Aug 18:45 UTC failed on migration-drift because of this row and four
   others, and the site sat 79 commits behind while it did.

   THE SQL BELOW IS THE LEDGER'S OWN, read back from
   supabase_migrations.schema_migrations.statements — not a reconstruction. The
   reasoning is the Apex lane's to write; what is preserved here is exactly what
   ran, so the repository and production agree again.
*/
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

  select exists (select 1 from apex_raw where entity = p_entity) into v_ever_rows;

  if not v_ever_rows and not coalesce(p_acknowledge_first_pull, false) then
    return jsonb_build_object('ok', false, 'first_pull_required', true,
      'error', format('%L has never returned a row, so it is not pulled unattended. This is a FIRST PULL: call it again with acknowledge_first_pull => true, by a person deciding to spend the credits. If Apex answers zero, that means the records are not booked in Apex - it does not mean they do not exist, and nothing may be invented from it.', p_entity));
  end if;

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