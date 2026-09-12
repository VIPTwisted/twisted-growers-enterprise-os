-- 021_schedule_auto_snapshot.sql
-- PLAN A #1: auto-capture snapshots at the DATABASE level so the legal record
-- is guaranteed regardless of which code path publishes or edits a schedule.
-- ADDITIVE + defensive: all trigger work is wrapped in exception handlers, so a
-- snapshot failure can NEVER block a shift/schedule write.
--
--   * status -> 'published'/'locked'  => one 'original_posted' snapshot (v1)
--   * any shift change to a posted schedule => a 'revision' snapshot
--   * no-op changes are de-duped (identical state is not re-snapshotted)
--   * existing published schedules are backfilled with an original snapshot

-- ── 1. Add a no-op dedup guard to snapshot_schedule (revisions only) ─────────
create or replace function public.snapshot_schedule(
  p_actor uuid, p_schedule_id uuid, p_snapshot_type text default 'revision', p_reason text default null
) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_sched record; v_tenant uuid; v_years int; v_version int; v_data jsonb; v_last jsonb; v_snap_id uuid;
begin
  select * into v_sched from schedules where id = p_schedule_id;
  if not found then return jsonb_build_object('ok',false,'error','schedule not found'); end if;
  if p_snapshot_type not in ('original_posted','revision') then p_snapshot_type := 'revision'; end if;
  select tenant_id into v_tenant from org_nodes where id = v_sched.node_id;
  v_years := coalesce((schedule_retention_years(v_sched.node_id)->>'years')::int, 3);

  select coalesce(jsonb_agg(jsonb_build_object(
            'shift_id', s.id, 'person_id', s.person_id,
            'full_name', coalesce(pe.full_name, pe.display_name, 'Unknown'),
            'shift_date', s.shift_date, 'start_time', s.start_time, 'end_time', s.end_time,
            'slot', case when s.start_time is null then null when extract(hour from (s.start_time::time)) < 13 then 'AM' else 'PM' end,
            'zone', s.zone, 'requires_key', s.requires_key, 'shift_type', s.shift_type, 'status', s.status
          ) order by s.shift_date, s.start_time), '[]'::jsonb)
    into v_data
  from shifts s left join people pe on pe.id = s.person_id
  where s.schedule_id = p_schedule_id;

  -- de-dup: never store a revision identical to the latest stored version
  if p_snapshot_type = 'revision' then
    select snapshot_data into v_last from schedule_snapshots
      where schedule_id = p_schedule_id order by version_no desc limit 1;
    if v_last is not null and v_last = v_data then
      return jsonb_build_object('ok',true,'skipped',true,'reason','no change since last snapshot');
    end if;
  end if;

  select coalesce(max(version_no),0)+1 into v_version from schedule_snapshots where schedule_id = p_schedule_id;

  insert into schedule_snapshots(schedule_id,node_id,tenant_id,week_start,snapshot_type,version_no,snapshot_data,reason,created_by,retain_until)
  values (p_schedule_id, v_sched.node_id, v_tenant, v_sched.week_start, p_snapshot_type, v_version, v_data, p_reason, p_actor,
          (now() + (v_years || ' years')::interval)::date)
  returning id into v_snap_id;

  begin
    insert into audit_log(actor_person,node_id,action,entity_type,entity_id,detail,created_at)
    values (p_actor, v_sched.node_id, 'schedule_snapshot_'||p_snapshot_type, 'schedule_snapshot', v_snap_id,
            jsonb_build_object('schedule_id',p_schedule_id,'version',v_version,'retain_years',v_years,'reason',p_reason), now());
  exception when others then null;
  end;

  return jsonb_build_object('ok',true,'snapshot_id',v_snap_id,'version',v_version,'type',p_snapshot_type,
    'shifts',jsonb_array_length(v_data),'retain_years',v_years,'retain_until',(now() + (v_years || ' years')::interval)::date);
end $$;

-- ── 2. ORIGINAL snapshot when a schedule is published ───────────────────────
create or replace function public.trg_schedule_publish_snapshot() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  begin
    if new.status in ('published','locked')
       and (tg_op = 'INSERT' or old.status is distinct from new.status)
       and not exists (select 1 from schedule_snapshots where schedule_id = new.id and snapshot_type='original_posted') then
      perform snapshot_schedule(new.published_by, new.id, 'original_posted', 'Auto: schedule published');
    end if;
  exception when others then null; -- never block the publish
  end;
  return new;
end $$;
drop trigger if exists schedule_publish_snapshot on public.schedules;
create trigger schedule_publish_snapshot
  after insert or update on public.schedules
  for each row execute function public.trg_schedule_publish_snapshot();

-- ── 3. REVISION snapshot on any shift change to a posted schedule ───────────
create or replace function public.trg_shifts_revision_snapshot() returns trigger
language plpgsql security definer set search_path=public as $$
declare r record;
begin
  begin
    for r in
      select distinct sch.id as sid, sch.published_by as pub
      from changed c
      join schedules sch on sch.id = c.schedule_id
      where sch.status in ('published','locked')
        and exists (select 1 from schedule_snapshots ss where ss.schedule_id = sch.id and ss.snapshot_type='original_posted')
    loop
      perform snapshot_schedule(r.pub, r.sid, 'revision', 'Auto: schedule changed after posting');
    end loop;
  exception when others then null; -- never block the shift write
  end;
  return null;
end $$;
drop trigger if exists shifts_revision_ins on public.shifts;
create trigger shifts_revision_ins after insert on public.shifts
  referencing new table as changed for each statement execute function public.trg_shifts_revision_snapshot();
drop trigger if exists shifts_revision_upd on public.shifts;
create trigger shifts_revision_upd after update on public.shifts
  referencing new table as changed for each statement execute function public.trg_shifts_revision_snapshot();
drop trigger if exists shifts_revision_del on public.shifts;
create trigger shifts_revision_del after delete on public.shifts
  referencing old table as changed for each statement execute function public.trg_shifts_revision_snapshot();

-- ── 4. Backfill existing published schedules with an original snapshot ──────
do $$
declare s record;
begin
  for s in select id, published_by from schedules sc
           where status in ('published','locked')
             and not exists (select 1 from schedule_snapshots ss where ss.schedule_id = sc.id and ss.snapshot_type='original_posted')
  loop
    perform snapshot_schedule(s.published_by, s.id, 'original_posted', 'Backfill: existing published schedule');
  end loop;
end $$;
