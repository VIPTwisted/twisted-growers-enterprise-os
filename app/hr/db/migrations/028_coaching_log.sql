-- 028_coaching_log.sql
-- Coaching Moments Log — dedicated table + SECURITY DEFINER RPCs.
--
-- Coaching moments are the pre-disciplinary paper trail ("good-faith effort to
-- correct behavior before formal discipline"). They are kept in their OWN table
-- (not disciplinary_records) so the Coaching screen and the Disciplinary screen
-- stay cleanly separated. Access is RPC-only, exactly like every other HR RPC:
-- the HR app authenticates via pin_login and calls under the anon role, so the
-- functions are SECURITY DEFINER and EXECUTE is granted to anon + authenticated.
-- Idempotent: safe to re-run.

create table if not exists public.coaching_log (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null,
  node_id            uuid,
  person_id          uuid,
  employee_name      text,
  location_name      text,
  coaching_type      text not null default 'verbal',
  occurred_on        date not null default current_date,
  occurred_time      text,
  description        text not null,
  discussed          text,
  employee_response  text,
  follow_up_required boolean not null default false,
  follow_up_date     date,
  witnessed_by       text,
  managed_by         text,
  managed_by_id      uuid,
  status             text not null default 'open',
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

alter table public.coaching_log enable row level security;

create index if not exists coaching_log_node_idx   on public.coaching_log(node_id);
create index if not exists coaching_log_person_idx on public.coaching_log(person_id);
create index if not exists coaching_log_tenant_idx on public.coaching_log(tenant_id);

-- ── READ: list entries for the given nodes, newest first ────────────────────
-- Named get_* so the client-side rpc wrapper treats a not-yet-applied call as a
-- silent read (no false "not saved" toast) rather than a write failure.
create or replace function public.get_coaching_log(p_node_ids uuid[])
returns jsonb
language sql
security definer
set search_path = public
as $$
  select coalesce(
    jsonb_agg(row_to_json(t)::jsonb order by t.occurred_on desc, t.created_at desc),
    '[]'::jsonb
  )
  from (
    select c.id,
           c.person_id,
           c.node_id,
           c.employee_name,
           c.location_name,
           c.coaching_type,
           c.occurred_on,
           c.occurred_time,
           c.description,
           c.discussed,
           c.employee_response,
           c.follow_up_required,
           c.follow_up_date,
           c.witnessed_by,
           c.managed_by,
           c.managed_by_id,
           c.status,
           c.created_at
    from public.coaching_log c
    where p_node_ids is null or c.node_id = any(p_node_ids)
  ) t;
$$;
grant execute on function public.get_coaching_log(uuid[]) to anon, authenticated;

-- ── WRITE: create a coaching moment ─────────────────────────────────────────
create or replace function public.coaching_log_create(
  p_node_id            uuid,
  p_person_id          uuid,
  p_employee_name      text,
  p_location_name      text,
  p_coaching_type      text,
  p_occurred_on        date,
  p_occurred_time      text,
  p_description        text,
  p_discussed          text,
  p_employee_response  text,
  p_follow_up_required boolean,
  p_follow_up_date     date,
  p_witnessed_by       text,
  p_managed_by         text,
  p_managed_by_id      uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid;
  v_id     uuid;
begin
  if coalesce(btrim(p_description), '') = '' then
    raise exception 'Description is required';
  end if;

  select tenant_id into v_tenant from public.org_nodes where id = p_node_id limit 1;
  if v_tenant is null then
    raise exception 'Unknown node %', p_node_id;
  end if;

  insert into public.coaching_log(
    tenant_id, node_id, person_id, employee_name, location_name,
    coaching_type, occurred_on, occurred_time, description, discussed,
    employee_response, follow_up_required, follow_up_date, witnessed_by,
    managed_by, managed_by_id, status
  ) values (
    v_tenant, p_node_id, p_person_id, p_employee_name, p_location_name,
    coalesce(nullif(p_coaching_type, ''), 'verbal'),
    coalesce(p_occurred_on, current_date), p_occurred_time, p_description, p_discussed,
    p_employee_response, coalesce(p_follow_up_required, false), p_follow_up_date, p_witnessed_by,
    p_managed_by, p_managed_by_id, 'open'
  )
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;
grant execute on function public.coaching_log_create(
  uuid, uuid, text, text, text, date, text, text, text, text, boolean, date, text, text, uuid
) to anon, authenticated;

-- ── WRITE: change status (resolved / escalated / open) ──────────────────────
create or replace function public.coaching_log_set_status(
  p_id     uuid,
  p_status text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if p_status not in ('open', 'resolved', 'escalated') then
    raise exception 'Invalid status %', p_status;
  end if;

  update public.coaching_log
     set status     = p_status,
         updated_at = now()
   where id = p_id
   returning id into v_id;

  if v_id is null then
    raise exception 'Coaching entry % not found', p_id;
  end if;

  return jsonb_build_object('ok', true, 'id', v_id, 'status', p_status);
end;
$$;
grant execute on function public.coaching_log_set_status(uuid, text) to anon, authenticated;
