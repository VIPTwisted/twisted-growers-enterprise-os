-- Training & Compliance backend (HR brain, project zsmdejhgdyyaakqsjhmk).
-- Backs src/screens/Training.jsx. Reuses the EXISTING (empty) training_modules
-- and training_records tables — extends them with the columns the course-
-- compliance UI needs — and adds three SECURITY DEFINER RPCs. Idempotent:
-- safe to re-run. RLS on; all access is via the definer RPCs (which bypass RLS).
--
-- Confirmed real columns reused (probed live 2026-07-17):
--   training_modules(id, name, category, description, duration_minutes,
--                    is_required, expires_in_days, is_active, sort_order,
--                    tenant_id, created_at, updated_at)
--   training_records(id, person_id, module, status, score, completed_at,
--                    expires_at, assigned_by, node_id, tenant_id, created_at)
--   people(id, full_name, display_name, is_active, created_at)
--   assignments(person_id, node_id, role_id, effective_from)
--   org_nodes(id, name, tenant_id)   roles(id, name)
--
-- The module catalog seeded below is genuine VIP curriculum CONFIG (the real
-- compliance course set the screen shipped). It carries NO fabricated
-- engagement metrics — every completion / score / attempt is a real
-- training_records row, and those start empty (honest zero). No fake employees,
-- no seeded progress.

create extension if not exists pgcrypto;

-- ── Extend the existing tables (idempotent) ──────────────────────────────────
alter table public.training_modules add column if not exists passing_score integer not null default 80;
alter table public.training_modules add column if not exists version       text    not null default '1.0';
alter table public.training_modules add column if not exists objectives    text    not null default '';

alter table public.training_records add column if not exists module_id    uuid references public.training_modules(id) on delete cascade;
alter table public.training_records add column if not exists progress_pct integer not null default 0;
alter table public.training_records add column if not exists attempts     integer not null default 0;
alter table public.training_records add column if not exists started_at   timestamptz;

create unique index if not exists uq_training_records_person_module
  on public.training_records(person_id, module_id);
create index if not exists idx_training_records_person on public.training_records(person_id);
create index if not exists idx_training_records_module on public.training_records(module_id);
create index if not exists idx_training_modules_active on public.training_modules(is_active);

alter table public.training_modules enable row level security;
alter table public.training_records enable row level security;

-- ── Seed the real compliance curriculum (CONFIG; keeps HR edits) ─────────────
insert into public.training_modules
  (id, name, category, description, duration_minutes, is_required, expires_in_days, passing_score, version, objectives, is_active, sort_order)
values
  ('2a000000-0000-4000-a000-000000000001','VIP Employee Handbook','Policy','Company policies, code of conduct, and workplace expectations.',45,true,365,80,'2.1','',true,1),
  ('2a000000-0000-4000-a000-000000000002','Sexual Harassment Prevention (CT Required)','Compliance','Connecticut-mandated harassment prevention and reporting training.',60,true,365,85,'3.0','',true,2),
  ('2a000000-0000-4000-a000-000000000003','Loss Prevention & Shrink Awareness','Operations','Identifying, deterring, and reporting shrink and theft.',30,true,null,75,'1.4','',true,3),
  ('2a000000-0000-4000-a000-000000000004','Register Operations & Cash Handling','Operations','POS operation, cash drawer control, and end-of-day balancing.',40,true,null,80,'2.0','',true,4),
  ('2a000000-0000-4000-a000-000000000005','Product Knowledge (Retail)','Product','Core product categories, fit, and recommendation basics.',50,true,null,70,'1.2','',true,5),
  ('2a000000-0000-4000-a000-000000000006','Customer Service Excellence','Service','Service standards, de-escalation, and the VIP guest experience.',35,true,null,75,'1.8','',true,6),
  ('2a000000-0000-4000-a000-000000000007','Shift Leader Leadership Skills','Leadership','Coaching, delegation, and shift-lead responsibilities.',55,false,null,75,'1.0','',true,7),
  ('2a000000-0000-4000-a000-000000000008','Emergency & Safety Procedures','Safety','Emergency response, evacuation, and workplace safety.',25,true,365,90,'2.3','',true,8),
  ('2a000000-0000-4000-a000-000000000009','HIPAA & Privacy Compliance','Compliance','Handling private information and privacy obligations.',45,false,365,85,'1.1','',true,9),
  ('2a000000-0000-4000-a000-00000000000a','Alcohol / Age Verification','Compliance','Legal age verification and restricted-sale procedures.',20,true,365,95,'1.5','',true,10)
on conflict (id) do nothing;

-- ── Read: full catalog + per-employee compliance matrix (scoped) ─────────────
create or replace function public.hr_training_overview(p_node_ids uuid[])
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_all     boolean := (p_node_ids is null or array_length(p_node_ids, 1) is null);
  v_modules jsonb;
  v_emps    jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object(
      'id',              m.id,
      'name',            m.name,
      'category',        coalesce(nullif(btrim(m.category), ''), 'General'),
      'description',     coalesce(m.description, ''),
      'required',        coalesce(m.is_required, false),
      'duration',        coalesce(m.duration_minutes, 0),
      'passing_score',   coalesce(m.passing_score, 80),
      'version',         coalesce(nullif(btrim(m.version), ''), '1.0'),
      'expires_in_days', m.expires_in_days,
      'objectives',      coalesce(m.objectives, '')
    ) order by m.sort_order, m.name), '[]'::jsonb)
    into v_modules
  from training_modules m
  where coalesce(m.is_active, true);

  select coalesce(jsonb_agg(x order by x->>'name'), '[]'::jsonb) into v_emps
  from (
    select jsonb_build_object(
      'id',        p.id,
      'name',      coalesce(nullif(btrim(p.full_name), ''), p.display_name, '—'),
      'node_id',   la.node_id,
      'location',  coalesce(o.name, '—'),
      'role',      coalesce(r.name, '—'),
      'hire_date', p.created_at,
      'records', coalesce((
        select jsonb_agg(jsonb_build_object(
            'module_id',       m.id,
            'status',          coalesce(tr.status, 'not-started'),
            'progress_pct',    coalesce(tr.progress_pct, case when tr.status = 'complete' then 100 else 0 end),
            'score',           tr.score,
            'attempts',        coalesce(tr.attempts, 0),
            'start_date',      coalesce(tr.started_at, tr.created_at),
            'completion_date', tr.completed_at,
            'expires_at',      tr.expires_at
          ) order by m.sort_order, m.name)
        from training_modules m
        left join training_records tr on tr.module_id = m.id and tr.person_id = p.id
        where coalesce(m.is_active, true)
      ), '[]'::jsonb)
    ) as x
    from people p
    left join lateral (
      select a.node_id, a.role_id
      from assignments a
      where a.person_id = p.id
      order by a.effective_from desc nulls last
      limit 1
    ) la on true
    left join org_nodes o on o.id = la.node_id
    left join roles r on r.id = la.role_id
    where coalesce(p.is_active, true)
      and (v_all or la.node_id = any(p_node_ids))
  ) q;

  return jsonb_build_object('ok', true, 'modules', v_modules, 'employees', v_emps);
end; $$;

-- ── Write: HR create / edit a training module ────────────────────────────────
create or replace function public.hr_training_upsert_module(
  p_name             text,
  p_category         text    default null,
  p_description      text    default null,
  p_duration_minutes integer default null,
  p_is_required      boolean default true,
  p_expires_in_days  integer default null,
  p_passing_score    integer default 80,
  p_version          text    default '1.0',
  p_objectives       text    default null,
  p_id               uuid    default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_tenant uuid; v_pos int;
begin
  if p_name is null or length(btrim(p_name)) = 0 then
    return jsonb_build_object('ok', false, 'error', 'Course name is required.');
  end if;

  if p_id is not null then
    update training_modules set
      name             = btrim(p_name),
      category         = coalesce(nullif(btrim(coalesce(p_category, '')), ''), 'General'),
      description      = coalesce(p_description, description),
      duration_minutes = coalesce(p_duration_minutes, duration_minutes),
      is_required      = coalesce(p_is_required, is_required),
      expires_in_days  = p_expires_in_days,
      passing_score    = coalesce(p_passing_score, passing_score),
      version          = coalesce(nullif(btrim(coalesce(p_version, '')), ''), version),
      objectives       = coalesce(p_objectives, objectives),
      is_active        = true,
      updated_at       = now()
    where id = p_id
    returning id into v_id;
    if v_id is null then
      return jsonb_build_object('ok', false, 'error', 'Course not found.');
    end if;
  else
    select tenant_id into v_tenant from org_nodes where tenant_id is not null limit 1;
    select coalesce(max(sort_order), 0) + 1 into v_pos from training_modules;
    insert into training_modules (tenant_id, name, category, description, duration_minutes,
        is_required, expires_in_days, passing_score, version, objectives, is_active, sort_order)
    values (v_tenant, btrim(p_name),
        coalesce(nullif(btrim(coalesce(p_category, '')), ''), 'General'),
        p_description, coalesce(p_duration_minutes, 30),
        coalesce(p_is_required, true), p_expires_in_days,
        coalesce(p_passing_score, 80),
        coalesce(nullif(btrim(coalesce(p_version, '')), ''), '1.0'),
        coalesce(p_objectives, ''), true, v_pos)
    returning id into v_id;
  end if;

  return jsonb_build_object('ok', true, 'id', v_id);
end; $$;

-- ── Write: employee sets progress on a module (idempotent upsert) ────────────
create or replace function public.hr_training_set_progress(
  p_person_id uuid,
  p_module_id uuid,
  p_status    text,
  p_score     integer default null,
  p_progress  integer default null,
  p_node_id   uuid    default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_existing     training_records%rowtype;
  v_node         uuid := p_node_id;
  v_tenant       uuid;
  v_mname        text;
  v_expires_days integer;
  v_status       text := coalesce(nullif(btrim(p_status), ''), 'in-progress');
  v_progress     integer;
  v_attempts     integer;
  v_completed    timestamptz;
  v_started      timestamptz;
  v_expires      timestamptz;
begin
  if p_person_id is null or p_module_id is null then
    return jsonb_build_object('ok', false, 'error', 'missing_params');
  end if;
  select name, expires_in_days into v_mname, v_expires_days
    from training_modules where id = p_module_id;
  if v_mname is null then
    return jsonb_build_object('ok', false, 'error', 'unknown_module');
  end if;

  select * into v_existing from training_records
    where person_id = p_person_id and module_id = p_module_id;

  if v_node is null then
    select a.node_id into v_node from assignments a
      where a.person_id = p_person_id
      order by a.effective_from desc nulls last limit 1;
  end if;
  if v_node is not null then
    select tenant_id into v_tenant from org_nodes where id = v_node;
  end if;

  v_progress := case
    when v_status = 'complete'                then 100
    when p_progress is not null               then greatest(0, least(100, p_progress))
    when v_status in ('not-started','needs-retake') then 0
    else greatest(coalesce(v_existing.progress_pct, 0), 10)
  end;

  v_attempts := coalesce(v_existing.attempts, 0);
  if v_existing.person_id is null then
    v_attempts := case when v_status = 'not-started' then 0 else 1 end;
  elsif v_status in ('in-progress', 'needs-retake')
        and coalesce(v_existing.status, 'not-started') in ('not-started', 'complete', 'needs-retake') then
    v_attempts := v_attempts + 1;
  end if;

  v_completed := case when v_status = 'complete' then coalesce(v_existing.completed_at, now()) else null end;
  v_started   := case when v_status = 'not-started' then null else coalesce(v_existing.started_at, now()) end;
  v_expires   := case
    when v_status = 'complete' and v_expires_days is not null
      then coalesce(v_existing.completed_at, now()) + make_interval(days => v_expires_days)
    else v_existing.expires_at
  end;

  insert into training_records (person_id, module_id, module, status, score, progress_pct,
      attempts, started_at, completed_at, expires_at, node_id, tenant_id)
  values (p_person_id, p_module_id, v_mname, v_status, p_score, v_progress,
      v_attempts, v_started, v_completed, v_expires, v_node, v_tenant)
  on conflict (person_id, module_id) do update set
    module       = excluded.module,
    status       = excluded.status,
    score        = coalesce(excluded.score, training_records.score),
    progress_pct = excluded.progress_pct,
    attempts     = excluded.attempts,
    started_at   = excluded.started_at,
    completed_at = excluded.completed_at,
    expires_at   = excluded.expires_at,
    node_id      = coalesce(excluded.node_id, training_records.node_id);

  return jsonb_build_object('ok', true);
end; $$;

-- ── Grants (access via definer RPCs only) ────────────────────────────────────
revoke all on function public.hr_training_overview(uuid[]) from public;
revoke all on function public.hr_training_upsert_module(text, text, text, integer, boolean, integer, integer, text, text, uuid) from public;
revoke all on function public.hr_training_set_progress(uuid, uuid, text, integer, integer, uuid) from public;

grant execute on function public.hr_training_overview(uuid[]) to anon, authenticated;
grant execute on function public.hr_training_upsert_module(text, text, text, integer, boolean, integer, integer, text, text, uuid) to anon, authenticated;
grant execute on function public.hr_training_set_progress(uuid, uuid, text, integer, integer, uuid) to anon, authenticated;

-- Verify:
-- select proname from pg_proc where proname like 'hr_training_%';
-- select count(*) from training_modules;   -- 10 (config)
-- select count(*) from training_records;   -- 0  (honest zero)
