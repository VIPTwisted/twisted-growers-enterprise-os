-- Emergency Contacts backend (HR brain: zsmdejhgdyyaakqsjhmk) — idempotent.
-- Access is via SECURITY DEFINER RPCs only (no anon table policies).
-- NOTE: get_emergency_contact_roster assumes people(id, full_name, node_id).
-- If a person's location lives on assignments instead of people.node_id,
-- adjust the `ppl` CTE accordingly before/after applying.

create table if not exists public.emergency_contacts (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid,
  node_id         uuid,
  person_id       uuid not null,
  contact_name    text not null,
  relationship    text,
  phone_primary   text not null,
  phone_alternate text,
  address         text,
  priority        text default '1st Contact',
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

create index if not exists idx_emergency_contacts_person on public.emergency_contacts(person_id);
create index if not exists idx_emergency_contacts_node   on public.emergency_contacts(node_id);

alter table public.emergency_contacts enable row level security;

-- ── Reads: contacts for one employee ────────────────────────────────────────
create or replace function public.get_my_emergency_contacts(p_person_id uuid)
returns jsonb language sql security definer set search_path=public as $$
  select coalesce(jsonb_agg(to_jsonb(ec) order by ec.priority, ec.created_at), '[]'::jsonb)
  from public.emergency_contacts ec
  where ec.person_id = p_person_id;
$$;

-- ── Write: upsert (insert when p_id is null, else update owner's row) ────────
create or replace function public.save_emergency_contact(
  p_id uuid, p_person_id uuid, p_node_id uuid,
  p_contact_name text, p_relationship text, p_phone_primary text,
  p_phone_alternate text, p_address text, p_priority text
) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_id uuid;
begin
  if p_person_id is null then
    return jsonb_build_object('ok',false,'error','missing person');
  end if;
  if coalesce(btrim(p_contact_name),'')='' or coalesce(btrim(p_phone_primary),'')='' then
    return jsonb_build_object('ok',false,'error','name and primary phone required');
  end if;

  if p_id is null then
    insert into public.emergency_contacts
      (person_id, node_id, contact_name, relationship, phone_primary, phone_alternate, address, priority)
    values
      (p_person_id, p_node_id, p_contact_name, p_relationship, p_phone_primary,
       p_phone_alternate, p_address, coalesce(p_priority,'1st Contact'))
    returning id into v_id;
  else
    update public.emergency_contacts
       set contact_name    = p_contact_name,
           relationship    = p_relationship,
           phone_primary   = p_phone_primary,
           phone_alternate = p_phone_alternate,
           address         = p_address,
           priority        = coalesce(p_priority,'1st Contact'),
           node_id         = coalesce(p_node_id, node_id),
           updated_at      = now()
     where id = p_id and person_id = p_person_id
    returning id into v_id;
    if v_id is null then
      return jsonb_build_object('ok',false,'error','not found');
    end if;
  end if;

  return jsonb_build_object('ok',true,'id',v_id);
end;
$$;

-- ── Write: delete (owner-scoped) ────────────────────────────────────────────
create or replace function public.delete_emergency_contact(p_id uuid, p_person_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_cnt int;
begin
  delete from public.emergency_contacts where id = p_id and person_id = p_person_id;
  get diagnostics v_cnt = row_count;
  return jsonb_build_object('ok', v_cnt > 0, 'deleted', v_cnt);
end;
$$;

-- ── Manager roster: one row per employee in scope + primary contact + status ─
create or replace function public.get_emergency_contact_roster(p_node_ids uuid[])
returns jsonb language sql security definer set search_path=public as $$
  with ppl as (
    select p.id, p.full_name, p.node_id
    from public.people p
    where p_node_ids is null or p.node_id = any(p_node_ids)
  ),
  primary_c as (
    select distinct on (ec.person_id)
      ec.person_id, ec.contact_name, ec.phone_primary, ec.relationship, ec.updated_at
    from public.emergency_contacts ec
    order by ec.person_id, ec.priority, ec.updated_at desc
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'person_id',    ppl.id,
    'name',         ppl.full_name,
    'node_id',      ppl.node_id,
    'contact_name', pc.contact_name,
    'phone',        pc.phone_primary,
    'relationship', pc.relationship,
    'last_updated', pc.updated_at,
    'status', case
        when pc.person_id is null then 'MISSING'
        when pc.updated_at < now() - interval '365 days' then 'OUTDATED'
        else 'ON FILE' end
  ) order by ppl.full_name), '[]'::jsonb)
  from ppl left join primary_c pc on pc.person_id = ppl.id;
$$;

grant execute on function public.get_my_emergency_contacts(uuid)                                             to anon, authenticated;
grant execute on function public.save_emergency_contact(uuid,uuid,uuid,text,text,text,text,text,text)         to anon, authenticated;
grant execute on function public.delete_emergency_contact(uuid,uuid)                                          to anon, authenticated;
grant execute on function public.get_emergency_contact_roster(uuid[])                                         to anon, authenticated;
