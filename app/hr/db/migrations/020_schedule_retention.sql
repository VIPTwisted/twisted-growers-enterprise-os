-- 020_schedule_retention.sql
-- PLAN A: original-vs-revised schedule storage + legal retention.
-- 100% ADDITIVE — creates a new table, new reference rows, and new functions.
-- Nothing existing is altered or dropped. Safe to re-run (idempotent).
--
-- What this gives you:
--   * Every POSTED schedule is frozen as an immutable snapshot (version 1).
--   * Every REVISION after posting is frozen as a new version (2,3,...).
--   * Each snapshot carries retain_until = now + required retention years.
--   * Names are frozen at snapshot time (person can be renamed/deleted later;
--     the legal record still shows who was actually scheduled).
--   * Retention is state-aware (US/FLSA 3-yr floor; per-state override).

-- ───────────────────────────────────────────────────────────────────────────
-- 1. RETENTION REFERENCE RULES (federal floor + Connecticut)
-- ───────────────────────────────────────────────────────────────────────────
insert into public.compliance_rules(state_code,domain,rule_key,rule_value,applies_business_types,citation,effective_from)
select 'US','scheduling','schedule_retention_years','3', null,
       'FLSA 29 CFR 516.5 — payroll records retained 3 years; schedules retained with payroll records', current_date
where not exists (select 1 from public.compliance_rules
                  where state_code='US' and domain='scheduling' and rule_key='schedule_retention_years');

insert into public.compliance_rules(state_code,domain,rule_key,rule_value,applies_business_types,citation,effective_from)
select 'CT','scheduling','schedule_retention_years','3', null,
       'CT Gen. Stat. §31-66 wage & hour records; FLSA 3-year floor', current_date
where not exists (select 1 from public.compliance_rules
                  where state_code='CT' and domain='scheduling' and rule_key='schedule_retention_years');

-- ───────────────────────────────────────────────────────────────────────────
-- 2. SNAPSHOT TABLE (immutable; RLS on, reached only via security-definer fns)
-- ───────────────────────────────────────────────────────────────────────────
create table if not exists public.schedule_snapshots (
  id            uuid primary key default gen_random_uuid(),
  schedule_id   uuid not null references public.schedules(id) on delete cascade,
  node_id       uuid not null references public.org_nodes(id),
  tenant_id     uuid,
  week_start    date not null,
  snapshot_type text not null check (snapshot_type in ('original_posted','revision')),
  version_no    int  not null,
  snapshot_data jsonb not null,            -- frozen shift rows (with names)
  reason        text,
  created_by    uuid,
  created_at    timestamptz not null default now(),
  retain_until  date not null
);
create index if not exists idx_sched_snap_schedule  on public.schedule_snapshots(schedule_id, version_no);
create index if not exists idx_sched_snap_node_week  on public.schedule_snapshots(node_id, week_start);
alter table public.schedule_snapshots enable row level security;
-- No permissive policies: only SECURITY DEFINER functions (table owner) read/write it.

-- ───────────────────────────────────────────────────────────────────────────
-- 3. RETENTION ADVISORY (state-aware) — used at location setup + on snapshots
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.schedule_retention_years(p_node_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_state text; v_fed int; v_state_years int; v_years int; v_citation text;
begin
  select state_code into v_state from org_nodes where id = p_node_id;
  select rule_value::int into v_fed from compliance_rules
    where state_code='US' and domain='scheduling' and rule_key='schedule_retention_years' limit 1;
  if v_state is not null then
    select rule_value::int into v_state_years from compliance_rules
      where state_code=v_state and domain='scheduling' and rule_key='schedule_retention_years' limit 1;
  end if;
  v_fed   := coalesce(v_fed, 3);
  v_years := greatest(v_fed, coalesce(v_state_years, 0));
  select string_agg(citation, ' | ') into v_citation from compliance_rules
    where domain='scheduling' and rule_key='schedule_retention_years'
      and state_code in ('US', coalesce(v_state,'US'));
  return jsonb_build_object(
    'ok', true, 'years', v_years, 'state', v_state,
    'federal_years', v_fed, 'state_years', v_state_years, 'citation', v_citation,
    'advisory', 'Posted and revised schedules for '||coalesce(v_state,'this location')||
                ' must be retained for at least '||v_years||' years. This is enforced automatically '||
                '(retain_until on every snapshot). Confirm the exact period with counsel — it is configurable per state.');
end $$;

-- ───────────────────────────────────────────────────────────────────────────
-- 4. CAPTURE A SNAPSHOT (original_posted on publish; revision on later change)
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.snapshot_schedule(
  p_actor uuid, p_schedule_id uuid, p_snapshot_type text default 'revision', p_reason text default null
) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_sched record; v_tenant uuid; v_years int; v_version int; v_data jsonb; v_snap_id uuid;
begin
  select * into v_sched from schedules where id = p_schedule_id;
  if not found then return jsonb_build_object('ok',false,'error','schedule not found'); end if;
  if p_snapshot_type not in ('original_posted','revision') then p_snapshot_type := 'revision'; end if;

  -- schedules has no tenant_id column; resolve it from the node
  select tenant_id into v_tenant from org_nodes where id = v_sched.node_id;
  v_years := coalesce((schedule_retention_years(v_sched.node_id)->>'years')::int, 3);
  select coalesce(max(version_no),0)+1 into v_version from schedule_snapshots where schedule_id = p_schedule_id;

  select coalesce(jsonb_agg(jsonb_build_object(
            'shift_id', s.id, 'person_id', s.person_id,
            'full_name', coalesce(pe.full_name, pe.display_name, 'Unknown'),
            'shift_date', s.shift_date, 'start_time', s.start_time, 'end_time', s.end_time,
            'slot', case when s.start_time is null then null
                         when extract(hour from (s.start_time::time)) < 13 then 'AM' else 'PM' end,
            'zone', s.zone, 'requires_key', s.requires_key, 'shift_type', s.shift_type, 'status', s.status
          ) order by s.shift_date, s.start_time), '[]'::jsonb)
    into v_data
  from shifts s left join people pe on pe.id = s.person_id
  where s.schedule_id = p_schedule_id;

  insert into schedule_snapshots(schedule_id,node_id,tenant_id,week_start,snapshot_type,version_no,snapshot_data,reason,created_by,retain_until)
  values (p_schedule_id, v_sched.node_id, v_tenant, v_sched.week_start, p_snapshot_type, v_version, v_data, p_reason, p_actor,
          (now() + (v_years || ' years')::interval)::date)
  returning id into v_snap_id;

  begin
    insert into audit_log(actor_person,node_id,action,entity_type,entity_id,detail,created_at)
    values (p_actor, v_sched.node_id, 'schedule_snapshot_'||p_snapshot_type, 'schedule_snapshot', v_snap_id,
            jsonb_build_object('schedule_id',p_schedule_id,'version',v_version,'retain_years',v_years,'reason',p_reason), now());
  exception when others then null; -- audit is best-effort, never block the snapshot
  end;

  return jsonb_build_object('ok',true,'snapshot_id',v_snap_id,'version',v_version,'type',p_snapshot_type,
                            'shifts',jsonb_array_length(v_data),'retain_years',v_years,
                            'retain_until',(now() + (v_years || ' years')::interval)::date);
end $$;

-- ───────────────────────────────────────────────────────────────────────────
-- 5. LIST VERSIONS (for the print / audit screen)
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.get_schedule_versions(p_node_ids uuid[], p_week_start date default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object(
    'snapshot_id',ss.id,'schedule_id',ss.schedule_id,'node_id',ss.node_id,'node_name',n.name,
    'week_start',ss.week_start,'type',ss.snapshot_type,'version',ss.version_no,
    'created_at',ss.created_at,'created_by',ss.created_by,'reason',ss.reason,
    'retain_until',ss.retain_until,'shift_count',jsonb_array_length(ss.snapshot_data),
    'snapshot_data',ss.snapshot_data
  ) order by ss.node_id, ss.version_no), '[]'::jsonb) into v
  from schedule_snapshots ss join org_nodes n on n.id = ss.node_id
  where ss.node_id = any(p_node_ids) and (p_week_start is null or ss.week_start = p_week_start);
  return jsonb_build_object('ok',true,'versions',v);
end $$;

-- ───────────────────────────────────────────────────────────────────────────
-- 6. DIFF TWO VERSIONS (change log: what changed from posted → revised)
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.get_schedule_diff(p_from uuid, p_to uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare a jsonb; b jsonb; added jsonb; removed jsonb;
begin
  select snapshot_data into a from schedule_snapshots where id = p_from;
  select snapshot_data into b from schedule_snapshots where id = p_to;
  if a is null or b is null then return jsonb_build_object('ok',false,'error','snapshot not found'); end if;

  with ax as (select (e->>'shift_date')||'|'||coalesce(e->>'slot','')||'|'||coalesce(e->>'full_name','') k, e from jsonb_array_elements(a) e),
       bx as (select (e->>'shift_date')||'|'||coalesce(e->>'slot','')||'|'||coalesce(e->>'full_name','') k, e from jsonb_array_elements(b) e)
  select coalesce(jsonb_agg(bx.e),'[]'::jsonb) into added   from bx where bx.k not in (select k from ax);

  with ax as (select (e->>'shift_date')||'|'||coalesce(e->>'slot','')||'|'||coalesce(e->>'full_name','') k, e from jsonb_array_elements(a) e),
       bx as (select (e->>'shift_date')||'|'||coalesce(e->>'slot','')||'|'||coalesce(e->>'full_name','') k, e from jsonb_array_elements(b) e)
  select coalesce(jsonb_agg(ax.e),'[]'::jsonb) into removed from ax where ax.k not in (select k from bx);

  return jsonb_build_object('ok',true,'added',added,'removed',removed,
    'added_count',jsonb_array_length(added),'removed_count',jsonb_array_length(removed));
end $$;

-- ───────────────────────────────────────────────────────────────────────────
-- 7. GRANTS (functions only; the table stays locked behind them)
-- ───────────────────────────────────────────────────────────────────────────
grant execute on function public.schedule_retention_years(uuid)        to anon, authenticated;
grant execute on function public.snapshot_schedule(uuid,uuid,text,text) to anon, authenticated;
grant execute on function public.get_schedule_versions(uuid[],date)    to anon, authenticated;
grant execute on function public.get_schedule_diff(uuid,uuid)          to anon, authenticated;
