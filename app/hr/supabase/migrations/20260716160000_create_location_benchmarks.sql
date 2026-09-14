-- Location Benchmarking backend (HR brain, project zsmdejhgdyyaakqsjhmk).
-- Self-contained: one new table + 3 SECURITY DEFINER RPCs. References only
-- confirmed real columns (org_nodes.id/name/tenant_id, assignments.node_id/status).
-- Idempotent — safe to re-run. RLS on; no anon policies (access via definer RPCs).

create extension if not exists pgcrypto;

create table if not exists public.hr_location_benchmarks (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid,
  node_id      uuid not null references public.org_nodes(id) on delete cascade,
  metric_key   text not null,
  metric_value numeric,
  period       text not null default '',   -- '' = current/untimed, or 'YYYY-MM'
  note         text,
  updated_by   uuid,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (node_id, metric_key, period)
);

alter table public.hr_location_benchmarks enable row level security;

-- ── Read: per-location overview (real headcount + stored metric values) ───────
create or replace function public.hr_benchmarks_overview(p_node_ids uuid[], p_period text default '')
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_rows jsonb;
begin
  if p_node_ids is null or array_length(p_node_ids, 1) is null then
    return jsonb_build_object('ok', true, 'period', coalesce(p_period, ''), 'locations', '[]'::jsonb);
  end if;
  select coalesce(jsonb_agg(x order by x->>'name'), '[]'::jsonb) into v_rows from (
    select jsonb_build_object(
      'node_id',   n.id,
      'name',      n.name,
      'headcount', (select count(*) from assignments a where a.node_id = n.id and a.status = 'active'),
      'metrics',   coalesce((
                     select jsonb_object_agg(b.metric_key, b.metric_value)
                     from hr_location_benchmarks b
                     where b.node_id = n.id and b.period = coalesce(p_period, '')
                   ), '{}'::jsonb)
    ) as x
    from org_nodes n
    where n.id = any(p_node_ids)
  ) t;
  return jsonb_build_object('ok', true, 'period', coalesce(p_period, ''), 'locations', v_rows);
end; $$;

-- ── Write: upsert a single metric value for a location/period ─────────────────
create or replace function public.hr_benchmark_set(
  p_node_id uuid, p_metric_key text, p_metric_value numeric,
  p_period text default '', p_note text default null, p_actor uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_tenant uuid; v_id uuid;
begin
  if p_node_id is null or p_metric_key is null or length(btrim(p_metric_key)) = 0 then
    return jsonb_build_object('ok', false, 'error', 'missing_params');
  end if;
  select tenant_id into v_tenant from org_nodes where id = p_node_id;
  if v_tenant is null and not exists (select 1 from org_nodes where id = p_node_id) then
    return jsonb_build_object('ok', false, 'error', 'unknown_node');
  end if;
  insert into hr_location_benchmarks (tenant_id, node_id, metric_key, metric_value, period, note, updated_by, updated_at)
  values (v_tenant, p_node_id, p_metric_key, p_metric_value, coalesce(p_period, ''), p_note, p_actor, now())
  on conflict (node_id, metric_key, period) do update
    set metric_value = excluded.metric_value,
        note         = excluded.note,
        updated_by   = excluded.updated_by,
        updated_at   = now()
  returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id);
end; $$;

-- ── Delete: clear a single metric value ───────────────────────────────────────
create or replace function public.hr_benchmark_delete(p_node_id uuid, p_metric_key text, p_period text default '')
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  delete from hr_location_benchmarks
  where node_id = p_node_id and metric_key = p_metric_key and period = coalesce(p_period, '');
  return jsonb_build_object('ok', true);
end; $$;

revoke all on function public.hr_benchmarks_overview(uuid[], text) from public;
revoke all on function public.hr_benchmark_set(uuid, text, numeric, text, text, uuid) from public;
revoke all on function public.hr_benchmark_delete(uuid, text, text) from public;
grant execute on function public.hr_benchmarks_overview(uuid[], text) to anon, authenticated;
grant execute on function public.hr_benchmark_set(uuid, text, numeric, text, text, uuid) to anon, authenticated;
grant execute on function public.hr_benchmark_delete(uuid, text, text) to anon, authenticated;

-- Verify:
-- select proname from pg_proc where proname in
--   ('hr_benchmarks_overview','hr_benchmark_set','hr_benchmark_delete');
