-- ============================================================================
-- Skills & Certification Matrix — real backend
-- ----------------------------------------------------------------------------
-- The SkillsMatrix screen previously rendered a seeded mock (EMPLOYEES/SKILLS/
-- buildMatrix). This migration wires it to the REAL competency tables that
-- already exist in this project:
--   competencies       (id, key, label, sort_order, tenant_id)
--   competency_status  (id, person_id, competency_key, status, node_id,
--                       trained_at, updated_at)   status in
--                       ('trained','in_training','not_trained')
--   assignments        (id, person_id, node_id, role_id, effective_from,
--                       effective_to)
--   people (id, full_name, display_name, is_active) · org_nodes (id, name) ·
--   roles (id, name)
--
-- get_training_matrix() already returns the per-person competency map but has
-- no location/role and no write path, so this adds:
--   get_skills_matrix(p_node_ids)      — matrix + location + role (READ)
--   get_competency_defs()              — competency labels/order   (READ)
--   set_competency_status(...)         — mark a person's competency (WRITE)
--
-- No tables are created here (they already exist); functions only. Idempotent.
-- ============================================================================

-- ── READ: per-person competency matrix, scoped to node(s) ───────────────────
create or replace function public.get_skills_matrix(p_node_ids uuid[] default null)
returns table (
  person_id    uuid,
  full_name    text,
  node_id      uuid,
  node_name    text,
  role_name    text,
  competencies jsonb
)
language sql
security definer
set search_path = public
as $$
  with cur as (
    -- most-current assignment per person within scope
    select distinct on (a.person_id)
      a.person_id, a.node_id, a.role_id
    from assignments a
    where (p_node_ids is null or a.node_id = any(p_node_ids))
      and (a.effective_from is null or a.effective_from <= now())
      and (a.effective_to   is null or a.effective_to   >= now())
    order by a.person_id, (a.effective_to is null) desc, a.effective_from desc nulls last
  )
  select
    p.id                                        as person_id,
    coalesce(p.display_name, p.full_name)       as full_name,
    c.node_id                                   as node_id,
    n.name                                      as node_name,
    r.name                                      as role_name,
    coalesce(
      (select jsonb_object_agg(cs.competency_key, cs.status)
         from competency_status cs
        where cs.person_id = p.id),
      '{}'::jsonb
    )                                           as competencies
  from cur c
  join people    p on p.id = c.person_id
  left join org_nodes n on n.id = c.node_id
  left join roles     r on r.id = c.role_id
  where coalesce(p.is_active, true) = true
  order by n.name nulls last, coalesce(p.display_name, p.full_name);
$$;

-- ── READ: competency definitions (labels + ordering) ────────────────────────
create or replace function public.get_competency_defs()
returns table (
  id         uuid,
  key        text,
  label      text,
  sort_order int
)
language sql
security definer
set search_path = public
as $$
  select id, key, label, sort_order::int
  from competencies
  order by sort_order::int nulls last, label;
$$;

-- ── WRITE: set a person's competency status (upsert) ────────────────────────
create or replace function public.set_competency_status(
  p_person_id      uuid,
  p_competency_key text,
  p_status         text,
  p_node_id        uuid default null,
  p_actor          uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if p_person_id is null or p_competency_key is null then
    raise exception 'person_id and competency_key are required';
  end if;
  if p_status not in ('trained','in_training','not_trained') then
    raise exception 'invalid status: %', p_status;
  end if;

  update competency_status
     set status     = p_status,
         node_id    = coalesce(p_node_id, node_id),
         trained_at = case when p_status = 'trained'
                           then coalesce(trained_at, now())
                           else trained_at end,
         updated_at = now()
   where person_id = p_person_id
     and competency_key = p_competency_key
   returning id into v_id;

  if v_id is null then
    insert into competency_status
      (person_id, competency_key, status, node_id, trained_at, updated_at)
    values
      (p_person_id, p_competency_key, p_status, p_node_id,
       case when p_status = 'trained' then now() else null end, now())
    returning id into v_id;
  end if;

  return jsonb_build_object('ok', true, 'id', v_id, 'status', p_status);
end;
$$;

grant execute on function public.get_skills_matrix(uuid[])                       to anon, authenticated;
grant execute on function public.get_competency_defs()                          to anon, authenticated;
grant execute on function public.set_competency_status(uuid, text, text, uuid, uuid) to anon, authenticated;
