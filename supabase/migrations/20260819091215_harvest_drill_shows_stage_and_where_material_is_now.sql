/* THE HARVEST DRILL SAYS WHAT PROCESS IT IS IN AND WHERE THE MATERIAL IS —
 * owner, 19 Aug 2026, at full volume: "THESE ARE NOT DRYING!!! NEED TO SHOW
 * WHERE AND WHAT PROCESS IN." He is right: the drill's drying_room column is
 * Metrc's DryingLocation — where the harvest DRIED — while a 100-day-open
 * harvest's material moved on to trim, cure and packaging long ago. Reading
 * that column as "where it is" is exactly the trap the room-identity rules
 * warn about.
 *
 * Three columns append (rule E1) to v_harvest_issues:
 *   stage_now        — the live stage from v_harvest_stage_map (Drying day N,
 *                      Curing / Trim, Packaging, Finished);
 *   material_now_in  — the rooms its LIVE packages actually sit in today,
 *                      with pounds, from the canonical package ledger;
 *   process_note     — one sentence a floor lead can act on.
 * The drying_room column keeps its name (E1 forbids renames) — the new
 * columns beside it carry the truth. */

do $$
declare def text; invopt text;
begin
  perform set_config('search_path', 'public, pg_temp', true);
  select coalesce((select option_value from pg_options_to_table(c.reloptions) where option_name='security_invoker'),'false')
    into invopt from pg_class c where c.relname='v_harvest_issues' and c.relnamespace='public'::regnamespace;
  def := regexp_replace(pg_get_viewdef('public.v_harvest_issues'::regclass), ';\s*$', '');
  if def like '%stage_now%' then return; end if;
  execute 'create or replace view public.v_harvest_issues as
    select v.*,
           sm.stage as stage_now,
           mat.rooms as material_now_in,
           case
             when sm.stage ilike ''Drying%'' then ''Genuinely drying: '' || sm.stage || ''.''
             when sm.stage is not null then ''NOT DRYING — this harvest is in '' || sm.stage
                  || ''. The drying_room column is only where it DRIED.''
             else ''No live stage recorded — check whether this harvest should be closed in Metrc.''
           end as process_note
    from ( ' || def || ' ) v
    left join v_harvest_stage_map sm on sm.harvest = v.harvest_name
    left join lateral (
      select string_agg(x.location || '' ('' || x.lb || '' lb)'', '' · '' order by x.lb desc) as rooms
      from (
        select p.location, round(sum(f_to_pounds(p.quantity, p.uom)),1) as lb
        from (select distinct on (d.tag) d.* from metrc_packages d
              order by d.tag, (coalesce(d.quantity,0) > 0 and not coalesce((d.raw->>''IsFinished'')::boolean,false)) desc,
                       (d.source_state = ''active'') desc nulls last, d.synced_at desc nulls last) p
        where p.raw->>''SourceHarvestNames'' ilike ''%''||v.harvest_name||''%''
          and coalesce(p.quantity,0) > 0 and coalesce(p.finished,false) = false
        group by p.location order by 2 desc limit 4
      ) x
    ) mat on true';
  execute 'alter view public.v_harvest_issues set (security_invoker = '||invopt||')';
end $$;;
