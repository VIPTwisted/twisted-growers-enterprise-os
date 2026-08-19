/* THE GUARD'S REPAIR PASS MUST BE IDEMPOTENT — caught on its first run by the
 * tag_event dedupe constraint, 19 Aug 2026.
 *
 * The first version assumed its own not-exists check was enough. It is not:
 * within one statement the check evaluates against the pre-statement snapshot,
 * so two source rows resolving to the same (tag, timestamp, type) both pass
 * the check and collide at the index. The constraint caught it and the whole
 * pass rolled back — which is the correct outcome and exactly why that index
 * exists.
 *
 * Both inserts now carry ON CONFLICT DO NOTHING and the source set is
 * de-duplicated explicitly. RETURNING still yields only rows actually written,
 * so guard_repair_log stays an honest record of what the machine touched — it
 * must never claim a repair it did not make. Running hourly, this now
 * converges: it repairs what it can, logs it, and does nothing on the next
 * pass. */

create or replace function public.f_guard_autofix(p_by text default 'guard')
returns table (gap_type text, repaired int, left_for_humans int)
language plpgsql security definer
set search_path to 'public','pg_temp'
as $$
declare v_orphan int := 0; v_loc int := 0;
begin
  with fixable as (
    select distinct on (p.tag) p.tag, p.packaged_on, p.location, p.quantity, p.uom, p.license
    from (select distinct on (d.tag) d.* from metrc_packages d
          order by d.tag, (coalesce(d.quantity,0) > 0 and not coalesce((d.raw->>'IsFinished')::boolean,false)) desc,
                   (d.source_state = 'active') desc nulls last, d.synced_at desc nulls last) p
    where p.packaged_on is not null
      and not exists (select 1 from tag_event e where e.tag = p.tag and e.event_type = 'packaged')
    order by p.tag
  ),
  ins as (
    insert into tag_event (tag, event_at, event_type, stage, location, qty, uom, source, source_row)
    select f.tag, f.packaged_on::timestamptz, 'packaged', 'Packaged', f.location, f.quantity, f.uom,
           'guard:autofix',
           jsonb_build_object('why','Creation event written by the guard from the package mirror',
                              'source','metrc_packages.PackagedDate',
                              'packaged_on', f.packaged_on, 'licence', f.license)
    from fixable f
    on conflict do nothing
    returning tag
  )
  insert into guard_repair_log (gap_type, subject, what_it_did, source_cited, by_guard)
  select 'orphan_tag', tag,
         'Wrote the missing packaged event into tag_event for this tag',
         'metrc_packages.PackagedDate', p_by
  from ins;
  get diagnostics v_orphan = row_count;

  with fixable as (
    select distinct on (p.tag, p.location) p.tag, p.location, p.packaged_on, p.quantity, p.uom
    from (select distinct on (d.tag) d.* from metrc_packages d
          order by d.tag, (coalesce(d.quantity,0) > 0 and not coalesce((d.raw->>'IsFinished')::boolean,false)) desc,
                   (d.source_state = 'active') desc nulls last, d.synced_at desc nulls last) p
    where coalesce(p.location,'') <> ''
      and p.packaged_on is not null
      and coalesce(p.quantity,0) > 0 and coalesce(p.finished,false) = false
      and not exists (select 1 from tag_event e where e.tag = p.tag and e.location = p.location)
    order by p.tag, p.location
  ),
  ins as (
    insert into tag_event (tag, event_at, event_type, stage, location, qty, uom, source, source_row)
    select f.tag, f.packaged_on::timestamptz, 'location_change', 'In inventory', f.location, f.quantity, f.uom,
           'guard:autofix',
           jsonb_build_object('why','Arrival event written by the guard for the room the mirror records',
                              'source','metrc_packages.LocationName',
                              'stamped_at','the package''s own packaged date — a guard does not invent a time')
    from fixable f
    on conflict do nothing
    returning tag, location
  )
  insert into guard_repair_log (gap_type, subject, what_it_did, source_cited, by_guard)
  select 'location_gap', tag,
         'Wrote the missing arrival event for room ' || location,
         'metrc_packages.LocationName', p_by
  from ins;
  get diagnostics v_loc = row_count;

  return query
    select 'orphan_tag'::text, v_orphan,
           (select count(*)::int from v_tag_gap where rule_code='D')
    union all
    select 'location_gap', v_loc,
           (select count(*)::int from v_tag_gap where rule_code='E');
end $$;;
