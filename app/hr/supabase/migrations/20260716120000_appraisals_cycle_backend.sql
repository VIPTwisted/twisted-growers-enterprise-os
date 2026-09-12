-- Appraisals (two-sided cycle) backend — HR brain (zsmdejhgdyyaakqsjhmk)
-- Replaces the localStorage/syncStore persistence in src/screens/Appraisals.jsx
-- with real relational tables + security-definer RPCs. Idempotent.
--
-- Model:
--   appraisal_cycles   — one row per launched cycle (period/audience/status)
--   appraisal_records  — one row per person per cycle, holding BOTH the employee
--                        self-assessment and the manager assessment + finalize.
-- Access is RPC-only (RLS enabled, no anon policies).

-- ── tables ──────────────────────────────────────────────────────────────────
create table if not exists public.appraisal_cycles (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid,
  name              text not null,
  period            text,
  due               date,
  audience          jsonb not null default '{}'::jsonb,   -- { roles:[], locations:[] }
  status            text not null default 'open',         -- open | closed
  created_by        text,
  created_by_person uuid,
  created_at        timestamptz not null default now()
);

create table if not exists public.appraisal_records (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid,
  cycle_id         uuid not null references public.appraisal_cycles(id) on delete cascade,
  person_id        uuid,
  person_name      text,
  person_role      text,
  node_id          uuid,
  -- employee self-assessment
  self_scores      jsonb,
  accomplishments  text,
  goals            text,
  support          text,
  self_submitted_at timestamptz,
  -- manager assessment
  manager_scores   jsonb,
  manager_summary  text,
  manager_raise    text,
  manager_by       text,
  manager_at       timestamptz,
  finalized_at     timestamptz,
  status           text not null default 'not_started',   -- not_started | self_done | in_review | finalized
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (cycle_id, person_id)
);

create index if not exists idx_appraisal_records_cycle on public.appraisal_records(cycle_id);
create index if not exists idx_appraisal_records_person on public.appraisal_records(person_id);

alter table public.appraisal_cycles  enable row level security;
alter table public.appraisal_records enable row level security;

-- ── record → client json (matches the shape the UI expects) ─────────────────
create or replace function public._appraisal_record_json(r public.appraisal_records)
returns jsonb language sql stable set search_path = public as $$
  select jsonb_build_object(
    'id',               r.id,
    'cycle_id',         r.cycle_id,
    'person_id',        r.person_id,
    'person_name',      r.person_name,
    'role',             r.person_role,
    'node_id',          r.node_id,
    'scores',           coalesce(r.self_scores, '{}'::jsonb),
    'accomplishments',  r.accomplishments,
    'goals',            r.goals,
    'support',          r.support,
    'self_submitted_at',r.self_submitted_at,
    'manager',          case when r.manager_scores is not null or r.manager_summary is not null
                          then jsonb_build_object('scores', coalesce(r.manager_scores,'{}'::jsonb),
                                                  'summary', r.manager_summary,
                                                  'raise',   coalesce(r.manager_raise,'none'))
                          else null end,
    'manager_by',       r.manager_by,
    'manager_at',       r.manager_at,
    'finalized_at',     r.finalized_at,
    'status',           r.status
  );
$$;

-- ── reads ───────────────────────────────────────────────────────────────────
-- Employee view: open cycles, each with this person's record (or null).
create or replace function public.get_my_appraisals(p_person_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(
           jsonb_build_object(
             'cycle', to_jsonb(c),
             'rec',   (select public._appraisal_record_json(r)
                         from public.appraisal_records r
                        where r.cycle_id = c.id and r.person_id = p_person_id)
           ) order by c.created_at desc), '[]'::jsonb)
  from public.appraisal_cycles c
  where c.status = 'open';
$$;

-- HR/manage view: every cycle with its records + rollup counts.
create or replace function public.get_appraisal_cycles_admin()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(
           to_jsonb(c) || jsonb_build_object(
             'records', coalesce((select jsonb_agg(public._appraisal_record_json(r) order by r.person_name)
                                    from public.appraisal_records r where r.cycle_id = c.id), '[]'::jsonb)
           ) order by c.created_at desc), '[]'::jsonb)
  from public.appraisal_cycles c;
$$;

-- ── writes ──────────────────────────────────────────────────────────────────
create or replace function public.create_appraisal_cycle(
  p_name text, p_period text, p_due text, p_audience jsonb,
  p_created_by text, p_created_by_person uuid, p_node_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_tenant uuid; v_row public.appraisal_cycles;
begin
  select tenant_id into v_tenant from public.org_nodes where id = p_node_id;
  insert into public.appraisal_cycles(tenant_id, name, period, due, audience, status, created_by, created_by_person)
  values (v_tenant, p_name, nullif(p_period,''), nullif(p_due,'')::date,
          coalesce(p_audience,'{}'::jsonb), 'open', p_created_by, p_created_by_person)
  returning * into v_row;
  return jsonb_build_object('ok', true, 'cycle', to_jsonb(v_row));
end;$$;

create or replace function public.set_appraisal_cycle_status(p_cycle_id uuid, p_status text)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  update public.appraisal_cycles
     set status = case when p_status in ('open','closed') then p_status else status end
   where id = p_cycle_id;
  return jsonb_build_object('ok', found);
end;$$;

create or replace function public.submit_self_appraisal(
  p_cycle_id uuid, p_person_id uuid, p_person_name text, p_person_role text,
  p_node_id uuid, p_scores jsonb, p_accomplishments text, p_goals text, p_support text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_tenant uuid; v_row public.appraisal_records;
begin
  select tenant_id into v_tenant from public.org_nodes where id = p_node_id;
  insert into public.appraisal_records(
      tenant_id, cycle_id, person_id, person_name, person_role, node_id,
      self_scores, accomplishments, goals, support, self_submitted_at, status)
  values (v_tenant, p_cycle_id, p_person_id, p_person_name, p_person_role, p_node_id,
      coalesce(p_scores,'{}'::jsonb), p_accomplishments, p_goals, p_support, now(), 'self_done')
  on conflict (cycle_id, person_id) do update
     set self_scores      = coalesce(p_scores,'{}'::jsonb),
         accomplishments  = p_accomplishments,
         goals            = p_goals,
         support          = p_support,
         person_name      = p_person_name,
         person_role      = p_person_role,
         node_id          = coalesce(p_node_id, appraisal_records.node_id),
         self_submitted_at= now(),
         status           = case when appraisal_records.status = 'finalized'
                                 then 'finalized' else 'self_done' end,
         updated_at       = now()
  returning * into v_row;
  return jsonb_build_object('ok', true, 'record', public._appraisal_record_json(v_row));
end;$$;

create or replace function public.save_manager_review(
  p_record_id uuid, p_scores jsonb, p_summary text, p_raise text,
  p_manager_by text, p_finalize boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_row public.appraisal_records;
begin
  update public.appraisal_records
     set manager_scores  = coalesce(p_scores,'{}'::jsonb),
         manager_summary = p_summary,
         manager_raise   = coalesce(p_raise,'none'),
         manager_by      = p_manager_by,
         manager_at      = now(),
         status          = case when p_finalize then 'finalized' else 'in_review' end,
         finalized_at    = case when p_finalize then now() else finalized_at end,
         updated_at      = now()
   where id = p_record_id
  returning * into v_row;
  if v_row.id is null then return jsonb_build_object('ok', false, 'error', 'record not found'); end if;
  return jsonb_build_object('ok', true, 'record', public._appraisal_record_json(v_row));
end;$$;

-- ── grants (RPC-only surface) ───────────────────────────────────────────────
grant execute on function public.get_my_appraisals(uuid)                                   to anon, authenticated;
grant execute on function public.get_appraisal_cycles_admin()                              to anon, authenticated;
grant execute on function public.create_appraisal_cycle(text,text,text,jsonb,text,uuid,uuid) to anon, authenticated;
grant execute on function public.set_appraisal_cycle_status(uuid,text)                     to anon, authenticated;
grant execute on function public.submit_self_appraisal(uuid,uuid,text,text,uuid,jsonb,text,text,text) to anon, authenticated;
grant execute on function public.save_manager_review(uuid,jsonb,text,text,text,boolean)    to anon, authenticated;
