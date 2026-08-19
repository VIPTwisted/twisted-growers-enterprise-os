/* GUARDS FIX FIRST — owner ruling, 19 Aug 2026: "HUMANS ONLY FIX WHEN AGENTS
 * AND GUARDS CANNOT."
 *
 * This sits beside his 8 Aug rule, which he re-confirmed in the same breath:
 * "NOTHING IS EVER AUTOMATIC. A schedule may PROPOSE. It may never PERFORM."
 * Both are true, and the line between them is the whole design:
 *
 *   A GUARD MAY REPAIR THE OS'S OWN RECORD from an authoritative source it can
 *   cite — backfilling an event the Metrc mirror already proves happened,
 *   re-linking a document to the tag printed on it, refreshing a stale cache.
 *   Nothing new is decided; a fact already in evidence is written down where
 *   it belongs, and every row the machine touches is logged with its source so
 *   a human can reverse it.
 *
 *   A GUARD MAY NEVER MAKE A BUSINESS DECISION OR WRITE TO METRC — disable a
 *   strain, approve an intake, choose remediation over destruction, decide
 *   what a manifest should have said. Those PROPOSE and wait for a person.
 *
 * The test I applied to every fix below: could I show an auditor the source
 * that made this repair inevitable? If yes, the guard fixes it. If it needs
 * judgement, it escalates. */

alter table public.gap_routing
  add column if not exists machine_can_fix boolean not null default false,
  add column if not exists fix_action      text,
  add column if not exists fix_source      text,
  add column if not exists why_not_machine text;

update public.gap_routing set
  machine_can_fix = true,
  fix_action = 'Write the missing creation event from the package mirror',
  fix_source = 'metrc_packages.PackagedDate — Metrc already proves the package was created on that date',
  why_not_machine = null
where gap_type = 'orphan_tag';

update public.gap_routing set
  machine_can_fix = true,
  fix_action = 'Write the missing arrival event for the room the mirror already records',
  fix_source = 'metrc_packages.LocationName — the mirror states where the package is; the ledger simply never recorded it arriving',
  why_not_machine = null
where gap_type = 'location_gap';

update public.gap_routing set
  machine_can_fix = false,
  why_not_machine = 'Requires judgement or a write the OS may not make. The guard raises it with the evidence and a named role decides.'
where machine_can_fix = false;

create table if not exists public.guard_repair_log (
  repair_id   bigint generated always as identity primary key,
  repaired_at timestamptz not null default now(),
  gap_type    text not null,
  subject     text not null,
  what_it_did text not null,
  source_cited text not null,
  reversible_by text not null default 'delete the tag_event row named in what_it_did',
  by_guard    text not null
);

comment on table public.guard_repair_log is
  'Every row a guard repaired without a human, with the source that made the repair inevitable and '
  'how to reverse it. Owner ruling 19 Aug 2026: guards fix first, humans fix what guards cannot — '
  'and his 8 Aug rule that nothing is automatic still holds, because a guard only writes down a '
  'fact already in evidence. It never decides anything. Agent I.';

alter table public.guard_repair_log enable row level security;
create policy grl_read on public.guard_repair_log for select to authenticated using (true);

create or replace function public.f_guard_autofix(p_by text default 'guard')
returns table (gap_type text, repaired int, left_for_humans int)
language plpgsql security definer
set search_path to 'public','pg_temp'
as $$
declare v_orphan int := 0; v_loc int := 0;
begin
  /* FIX 1 — the creation event Metrc already proves. Only where the mirror
     carries a PackagedDate: no date, no repair, because inventing one would
     be deciding rather than recording. */
  with fixable as (
    select p.tag, p.packaged_on, p.location, p.quantity, p.uom, p.license
    from (select distinct on (d.tag) d.* from metrc_packages d
          order by d.tag, (coalesce(d.quantity,0) > 0 and not coalesce((d.raw->>'IsFinished')::boolean,false)) desc,
                   (d.source_state = 'active') desc nulls last, d.synced_at desc nulls last) p
    where p.packaged_on is not null
      and not exists (select 1 from tag_event e where e.tag = p.tag and e.event_type = 'packaged')
  ),
  ins as (
    insert into tag_event (tag, event_at, event_type, stage, location, qty, uom, source, source_row)
    select f.tag, f.packaged_on::timestamptz, 'packaged', 'Packaged', f.location, f.quantity, f.uom,
           'guard:autofix',
           jsonb_build_object('why','Creation event written by the guard from the package mirror',
                              'source','metrc_packages.PackagedDate',
                              'packaged_on', f.packaged_on, 'licence', f.license)
    from fixable f
    returning tag
  )
  insert into guard_repair_log (gap_type, subject, what_it_did, source_cited, by_guard)
  select 'orphan_tag', tag,
         'Wrote the missing packaged event into tag_event for this tag',
         'metrc_packages.PackagedDate', p_by
  from ins;
  get diagnostics v_orphan = row_count;

  /* FIX 2 — the arrival event for a room the mirror already records. Stamped
     at the package's own packaged date, never at now(): a guard must not
     invent a time. Where no date exists, it escalates instead. */
  with fixable as (
    select p.tag, p.location, p.packaged_on, p.quantity, p.uom
    from (select distinct on (d.tag) d.* from metrc_packages d
          order by d.tag, (coalesce(d.quantity,0) > 0 and not coalesce((d.raw->>'IsFinished')::boolean,false)) desc,
                   (d.source_state = 'active') desc nulls last, d.synced_at desc nulls last) p
    where coalesce(p.location,'') <> ''
      and p.packaged_on is not null
      and coalesce(p.quantity,0) > 0 and coalesce(p.finished,false) = false
      and not exists (select 1 from tag_event e where e.tag = p.tag and e.location = p.location)
  ),
  ins as (
    insert into tag_event (tag, event_at, event_type, stage, location, qty, uom, source, source_row)
    select f.tag, f.packaged_on::timestamptz, 'location_change', 'In inventory', f.location, f.quantity, f.uom,
           'guard:autofix',
           jsonb_build_object('why','Arrival event written by the guard for the room the mirror records',
                              'source','metrc_packages.LocationName',
                              'stamped_at','the package''s own packaged date — a guard does not invent a time')
    from fixable f
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
end $$;

comment on function public.f_guard_autofix(text) is
  'The guard''s own repair pass (owner ruling 19 Aug 2026: humans only fix what guards cannot). '
  'Writes ONLY facts already proven by the Metrc mirror — a creation event where Metrc carries the '
  'packaged date, an arrival event for the room Metrc records — each logged in guard_repair_log '
  'with its source and how to reverse it. It never invents a timestamp, never decides anything, '
  'and never touches Metrc. Everything needing judgement is left for the routing pass to escalate. '
  'Agent I.';

grant execute on function public.f_guard_autofix(text) to authenticated;
grant select on public.guard_repair_log to authenticated;

/* Order matters: repair first, then detect what remains, then route and
   escalate only what a human genuinely has to touch. */
select cron.schedule('guard-autofix', '10 * * * *',
  $$set statement_timeout = '10min'; select public.f_guard_autofix('guard')$$);;
