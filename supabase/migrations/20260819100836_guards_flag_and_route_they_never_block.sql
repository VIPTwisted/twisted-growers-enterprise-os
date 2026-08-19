/* GUARDS DO NOT BLOCK — owner ruling, 19 Aug 2026, binding:
 *
 *   "THEY DO NOT BLOCK. THEY PUT IN AND FLAG, ISSUE ALERTS, AND THEN AGENTS,
 *    REVIEWERS, WATCHERS AND GUARDS FIX AND ALSO BRING TO MANAGEMENT
 *    ATTENTION."
 *
 * This corrects my implementation, and it is the better model. A block is an
 * automatic action, which collides with his older standing rule that nothing
 * is ever automatic; worse, a blocked write means the fact never gets recorded
 * at all, so the OS ends up knowing LESS about the very thing it was guarding.
 * Record everything, flag what is wrong, route it to a named human, escalate
 * if it sits. Nothing is ever refused, hidden or silently dropped.
 *
 * WHAT THIS ADDS: the routing layer his sentence describes. Every gap type is
 * owned by a role; every alert ages; anything unresolved past its role's
 * patience escalates to management through the alert pipeline that already
 * delivers to the inbox. Language that said REFUSED or BLOCKED is corrected
 * wherever I wrote it. */

create table if not exists public.gap_routing (
  gap_type          text primary key references public.gap_rule(gap_type) on update cascade,
  owner_role        text not null,
  fixer             text not null,
  escalate_after_days integer not null default 7,
  escalate_to       text not null default 'management',
  why_this_owner    text not null
);

comment on table public.gap_routing is
  'Owner ruling 19 Aug 2026: guards flag and route, they never block. Every gap type has a named '
  'owning role, a fixer, and the number of days before it escalates to management. A gap with no '
  'owner is a gap nobody fixes — the 690-finding allotment backlog and the 238 Sales findings that '
  'sat under NOBODY OWNS THESE are what that looks like. Agent I.';

alter table public.gap_routing enable row level security;
create policy grt_read on public.gap_routing for select to authenticated using (true);

insert into public.gap_routing (gap_type, owner_role, fixer, escalate_after_days, escalate_to, why_this_owner)
select r.gap_type,
       case r.family
         when 'document'    then 'compliance'
         when 'chain'       then 'compliance'
         when 'lifecycle'   then 'cultivation'
         when 'inventory'   then 'inventory'
         when 'cultivation' then 'cultivation'
         when 'sales'       then 'sales'
         when 'transfer'    then 'compliance'
         when 'tag_package' then 'inventory'
         when 'system'      then 'database'
         else 'operations' end,
       case r.family
         when 'document'    then 'Compliance clears the document or records why none exists'
         when 'chain'       then 'Compliance reconciles the tag against Metrc'
         when 'lifecycle'   then 'Cultivation records the movement or the timestamp'
         when 'inventory'   then 'Inventory counts the shelf and corrects the record'
         when 'cultivation' then 'Cultivation answers for the grow decision'
         when 'sales'       then 'Sales locates the invoice or explains the shipment'
         when 'transfer'    then 'Compliance locates the manifest'
         when 'tag_package' then 'Inventory walks to the room and inspects the tag'
         when 'system'      then 'Agent I builds the missing piece'
         else 'Operations triages' end,
       case r.severity when 'critical' then 3 when 'warning' then 7 else 14 end,
       'management',
       'Routed by family on the ledger build, 19 Aug 2026. Change the owner here, never in a view.'
from public.gap_rule r
on conflict (gap_type) do nothing;

alter table public.gap_alert
  add column if not exists owner_role       text,
  add column if not exists assigned_to      text,
  add column if not exists escalated_at     timestamptz,
  add column if not exists escalation_level integer not null default 0,
  add column if not exists brought_to_management_at timestamptz;

/* The routing pass: stamp the owner, age the alert, escalate what sits, and
   put critical escalations into the alert pipeline that already reaches the
   inbox. It NEVER blocks anything and never closes anything on its own. */
create or replace function public.f_route_gap_alerts(p_by text default 'loop')
returns table (routed int, escalated int, sent_to_management int)
language plpgsql security definer
set search_path to 'public','pg_temp'
as $$
declare v_routed int := 0; v_esc int := 0; v_mgmt int := 0; r record; v_id bigint;
begin
  update gap_alert a
     set owner_role = g.owner_role
    from gap_routing g
   where g.gap_type = a.gap_type
     and a.status <> 'resolved'
     and a.owner_role is distinct from g.owner_role;
  get diagnostics v_routed = row_count;

  update gap_alert a
     set escalation_level = 1, escalated_at = now()
    from gap_routing g
   where g.gap_type = a.gap_type
     and a.status <> 'resolved'
     and a.escalation_level = 0
     and a.created_timestamp < now() - (g.escalate_after_days || ' days')::interval;
  get diagnostics v_esc = row_count;

  /* Management is told ONCE per gap type per day, with the count and the
     pounds behind it — not once per alert. 4,823 separate emails is not an
     escalation, it is a denial of service on the person who has to read it. */
  for r in
    select a.gap_type, a.severity, count(*) as n,
           round(sum(coalesce(a.lb_at_stake,0)),1) as lb,
           min(a.created_timestamp)::date as oldest,
           max(g.owner_role) as owner_role
    from gap_alert a join gap_routing g on g.gap_type = a.gap_type
    where a.status <> 'resolved' and a.escalation_level >= 1
      and (a.brought_to_management_at is null or a.brought_to_management_at < now() - interval '24 hours')
      and a.severity = 'critical'
    group by a.gap_type, a.severity
  loop
    insert into watchdog_findings
      (fingerprint, severity, what, where_it_is, who_is_accountable, when_it_started,
       why_it_matters, how_it_was_detected, what_to_do, drill, search_text,
       record_count, pounds, solutions, guard_recommendation)
    values
      ('gap-escalation:' || r.gap_type, 'critical',
       r.n || ' unresolved ' || replace(r.gap_type,'_',' ') || ' gaps, oldest opened ' || r.oldest,
       'Gap dashboard, filtered to ' || r.gap_type,
       coalesce(r.owner_role,'operations') || ' owns the fix; management is being told because it has sat past its escalation window',
       'Oldest of these opened ' || r.oldest,
       'A flagged gap that nobody has worked is the same as an undetected one. ' ||
         case when r.lb > 0 then r.lb || ' lb of material sits behind these.' else '' end,
       'f_route_gap_alerts() — the routing pass on the gap ledger. Guards flag and route; they never block (owner ruling 19 Aug 2026).',
       'Open the gap dashboard filtered to ' || r.gap_type || ', work the largest by pounds first, and record a resolution note on each.',
       'agent_findings',
       'gap escalation ' || r.gap_type,
       r.n, nullif(r.lb,0),
       array['Work the top items by pounds at stake — they usually cover most of the exposure.',
             'Where a whole class shares one cause, fix the cause and the alerts auto-resolve on the next loop.',
             'If an item is not really a gap, resolve it with the reason written down so the detector can be corrected.'],
       'Route to ' || coalesce(r.owner_role,'operations') || ' with a date. These do not clear themselves.')
    on conflict do nothing
    returning id into v_id;

    if v_id is not null then
      perform f_alert_all_admins(v_id);
      v_mgmt := v_mgmt + 1;
    end if;

    update gap_alert set brought_to_management_at = now(), escalation_level = greatest(escalation_level, 2)
     where gap_type = r.gap_type and status <> 'resolved' and escalation_level >= 1;
  end loop;

  return query select v_routed, v_esc, v_mgmt;
end $$;

comment on function public.f_route_gap_alerts(text) is
  'The routing and escalation pass (owner ruling 19 Aug 2026: guards flag and route, never block). '
  'Stamps each alert with its owning role, ages it, escalates what sits past its window, and '
  'brings critical classes to management through the existing alert pipeline — ONCE per gap type '
  'per day with the count and pounds, never once per alert. Blocks nothing, closes nothing. Agent I.';

grant execute on function public.f_route_gap_alerts(text) to authenticated;
grant select on public.gap_routing to authenticated;

select cron.schedule('gap-route-escalate', '20 * * * *',
  $$set statement_timeout = '5min'; select public.f_route_gap_alerts('loop')$$);

/* LANGUAGE CORRECTION. I wrote REFUSED into the intake verdict; the owner's
   model has no refusal in it. The evidence is stated, the gap is flagged, and
   a named executive decides — the OS never turns anything away. */
create or replace view public.v_genetics_intake_review as
select i.intake_id, i.strain_name, i.source_type, i.supplier, i.quantity,
       i.proposed_by, i.proposed_on, i.intended_room, i.status,
       s.approval_status                        as strain_standing,
       s.min_allowed_thc_percent                as sourcing_floor,
       s.target_yield_per_plant_lb              as yield_target,
       g.avg_thc                                as our_measured_thc,
       g.coas                                   as our_flower_coas,
       g.avg_lb_per_plant                       as our_measured_lb_per_plant,
       r.best_reported_thc, r.best_indoor_yield_g, r.sources_researched, r.awards_found,
       case
         when s.name is null
           then 'UNKNOWN STRAIN — not on the strain list. Research it and add it before the decision.'
         when r.sources_researched is null
           then 'NO RESEARCH ON FILE — no yield, award or potency evidence gathered for this strain yet.'
         when g.avg_thc is not null and g.avg_thc < s.min_allowed_thc_percent
           then 'FLAGGED — our own flower averages ' || g.avg_thc || ' % against the '
                || s.min_allowed_thc_percent || ' % sourcing target. Executive decision required.'
         when coalesce(r.best_reported_thc, 0) < s.min_allowed_thc_percent
           then 'FLAGGED — research reports a ceiling of ' || coalesce(r.best_reported_thc,0)
                || ' % against the ' || s.min_allowed_thc_percent || ' % sourcing target. Executive decision required.'
         when i.exception_granted
           then 'EXCEPTION RECORDED — ' || coalesce(i.exception_reason,'no reason written, which is itself a defect')
         else 'MEETS THE SOURCING TARGET on the evidence held'
       end                                      as intake_verdict,
       'The OS flags and routes; it never refuses. A named executive decides. This governs PLANTING only — the owner ruled 19 Aug 2026 that there is no potency rule on selling.'::text as scope_note
from genetics_intake i
left join strain s on s.name = i.strain_name
left join v_strain_gate g on g.strain = i.strain_name
left join (
  select strain_name,
         max(reported_thc_high)          as best_reported_thc,
         max(indoor_yield_g_per_plant)   as best_indoor_yield_g,
         count(*)                        as sources_researched,
         string_agg(distinct nullif(awards,''), ' · ') as awards_found
  from strain_research group by strain_name
) r on r.strain_name = i.strain_name;

comment on table public.genetics_intake is
  'THE FLAG POINT for genetics. Owner rulings 19 Aug 2026: the potency and yield rules govern '
  '"what clones and seeds the cultivator can bring in", never sales — AND guards do not block, '
  'they flag and route. An intake below the sourcing target is FLAGGED for executive decision '
  'with the evidence beside it; the OS never refuses one. Agent I.';;
