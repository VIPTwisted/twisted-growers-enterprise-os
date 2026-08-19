/*
 * MOISTURE IS A MASS-BALANCE RESIDUAL, NOT A WATER SENSOR
 * -------------------------------------------------------
 * Forensic read, 19 Aug 2026:
 *   - 350 rows in Metrc Harvests-Inactive, as of 4 Aug 2026.
 *   - The reported moisture field is exactly wet - waste - packaged.
 *   - Freezer location / an explicit FF harvest name identifies 83 fresh-frozen
 *     harvests. Six of those carry a small non-zero residual, so the former
 *     "zero residual means fresh frozen" rule misclassified them as dried.
 *   - Two tiny rows have a negative residual and no fresh-frozen evidence. They
 *     are UNKNOWN, not silently dried.
 *   - The correctly separated dried population is 265 harvests and has a
 *     wet-weighted residual of 74.91 percent.
 *
 * Existing columns stay in place for dependent views. New truth columns append
 * the basis, evidence, residual and dry-equivalent explicitly. Misleading legacy
 * names are documented as compatibility aliases and the UI reads the new names.
 */

insert into public.conversion_factors
  (key, value, unit, label, what_it_means, where_it_came_from, set_by, updated_at,
   evidence_status, evidence_note, note)
values
  ('harvest_mass_balance_tolerance_lb', 0.5, 'lb',
   'Harvest mass-balance rounding tolerance',
   'The largest absolute rounding difference that may still be labelled arithmetically balanced. It does not prove the source weights are physically correct.',
   'Preserves the existing half-pound report tolerance as a named, editable rule instead of a literal hidden in SQL.',
   'GPT-CEO forensic correction, 19 Aug 2026', now(),
   'declared technical tolerance',
   'This controls only the rounding verdict. It never converts a residual into measured water.',
   'Owner and executive users may change it in Business Rules; every consumer reads it through f_rule().')
on conflict (key) do nothing;

update public.conversion_factors
set value = 74.9,
    unit = '%',
    label = 'Wet-weight residual goal for dried harvests',
    what_it_means = 'Target share of a dried harvest wet weight that does not become packaged product or recorded waste. It is a residual: mostly evaporation, but also any unrecorded loss or weighing error.',
    where_it_came_from = 'Metrc Harvests-Inactive report as of 4 Aug 2026. Explicit freezer/FF evidence separates 83 fresh-frozen harvests; two negative unexplained rows remain unknown. The remaining 265 dried harvests total 33,051.11 lb wet and 24,760.11 lb residual, a wet-weighted 74.91 percent.',
    set_by = 'GPT-CEO forensic correction from Metrc evidence, 19 Aug 2026',
    updated_at = now(),
    evidence_status = 'REPRODUCIBLE - derived residual, not direct water measurement',
    evidence_note = 'Do not classify fresh frozen from zero residual. Six freezer/FF harvests have non-zero residuals and were formerly counted as dried, depressing the result to 73.5 percent. Reproduce from metrc_rpt_harvest_moisture using freezer location or an explicit FF token as wet-basis evidence.',
    note = 'Editable company goal. The 70-77 percent rules remain the management target band. Outside that band means investigate the mass balance; it does not by itself diagnose theft, over-drying, or bad cultivation.'
where key = 'moisture_loss_goal_pct';

create table if not exists public.business_rule_surface (
  surface_key text not null,
  rule_key text not null references public.conversion_factors(key) on update cascade on delete restrict,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  primary key (surface_key, rule_key)
);

comment on table public.business_rule_surface is
  'Data-owned mapping from a page/section to the business rules it exposes. Adding a rule to a surface is a row change, never a JSX deployment.';

insert into public.business_rule_surface (surface_key,rule_key,sort_order)
values
  ('moisture_loss_register','moisture_loss_goal_pct',10),
  ('moisture_loss_register','expected_moisture_pct_min',20),
  ('moisture_loss_register','expected_moisture_pct_max',30),
  ('moisture_loss_register','fresh_frozen_wet_to_dry',40),
  ('moisture_loss_register','harvest_mass_balance_tolerance_lb',50)
on conflict (surface_key,rule_key) do update set sort_order=excluded.sort_order;

alter table public.business_rule_surface enable row level security;

drop policy if exists business_rule_surface_read on public.business_rule_surface;
create policy business_rule_surface_read on public.business_rule_surface
  for select to authenticated using (true);

create or replace view public.v_moisture_business_rules as
select r.*
from public.v_business_rules r
join public.business_rule_surface s on s.rule_key=r.key
where s.surface_key='moisture_loss_register'
order by s.sort_order,r.label;

comment on view public.v_moisture_business_rules is
  'Business rules exposed inside the moisture register, selected by business_rule_surface data rather than a frontend key list.';

create or replace function public.f_harvest_weight_basis(
  p_harvest_name text,
  p_room text,
  p_moisture_residual_lb numeric default null
)
returns text
language sql
immutable
parallel safe
set search_path = public, pg_temp
as $function$
  select case
    when public.f_harvest_is_fresh_frozen(p_harvest_name)
      or coalesce(p_room, '') ilike '%freezer%'
      then 'wet'
    when p_moisture_residual_lb > 0 then 'dry'
    else 'unknown'
  end
$function$;

comment on function public.f_harvest_weight_basis(text,text,numeric) is
  'Returns packaged weight basis from explicit operational evidence. FF harvest token or freezer location = wet. A positive residual with neither marker = dry. Zero/negative/no residual without a marker = unknown, never guessed.';

create or replace view public.v_harvest_water_and_yield as
with closed as (
  select m.*,
         public.f_harvest_weight_basis(m.harvest_batch, m.room, m.moisture_loss_lb) as weight_basis,
         case
           when public.f_harvest_is_fresh_frozen(m.harvest_batch)
                and coalesce(m.room,'') ilike '%freezer%' then 'harvest name carries FF and room is freezer'
           when public.f_harvest_is_fresh_frozen(m.harvest_batch) then 'harvest name carries explicit FF token'
           when coalesce(m.room,'') ilike '%freezer%' then 'Metrc room is freezer/biomass storage'
           when m.moisture_loss_lb > 0 then 'positive Metrc mass-balance residual; no wet-basis marker'
           else 'no reliable wet/dry evidence'
         end as classification_basis
  from public.metrc_rpt_harvest_moisture m
)
select
  m.harvest_batch as harvest,
  m.strain,
  m.room,
  m.finished_on,
  m.licence,
  m.plants,
  round(m.wet_lb, 1) as wet_in_lb,
  round(m.waste_lb, 1) as waste_lb,
  round(m.moisture_loss_lb, 1) as water_lost_lb,
  case when m.weight_basis = 'dry' then round(m.packaged_lb, 1) end as dry_yield_lb,
  round(m.moisture_pct, 1) as water_pct,
  round(m.wet_lb - coalesce(m.waste_lb,0) - coalesce(m.moisture_loss_lb,0)
        - coalesce(m.packaged_lb,0), 2) as balance_lb,
  case
    when abs(m.wet_lb - coalesce(m.waste_lb,0) - coalesce(m.moisture_loss_lb,0)
             - coalesce(m.packaged_lb,0)) <= public.f_rule('harvest_mass_balance_tolerance_lb')
      then 'arithmetic closes within the declared tolerance; source accuracy is not proven'
    else 'DOES NOT ARITHMETICALLY BALANCE'
  end as balance_check,
  case when m.weight_basis = 'dry' and coalesce(m.plants,0) > 0
       then round(m.packaged_lb * public.f_rule('grams_per_pound') / m.plants, 1) end as dry_g_per_plant,
  case
    when m.weight_basis = 'wet' then 'fresh frozen is packaged wet; use the dry-equivalent column, never dry yield'
    when m.weight_basis = 'unknown' then 'weight basis unresolved; yield judgement refused'
    when coalesce(m.plants,0) = 0 then 'no plant count; yield cannot be judged'
    when m.packaged_lb * public.f_rule('grams_per_pound') / m.plants >= public.f_rule('target_grams_per_plant')
      then 'at or above the owner-set grams-per-plant target'
    else 'below the owner-set grams-per-plant target'
  end as yield_verdict,
  case m.weight_basis
    when 'wet' then 'fresh frozen - packaged wet; excluded from dried-harvest residual goal'
    when 'dry' then 'dried'
    else 'UNKNOWN - wet/dry basis is not proven'
  end as drying_kind,
  m.harvest_batch || ': ' || round(m.wet_lb,1) || ' lb wet in; '
    || round(coalesce(m.waste_lb,0),1) || ' lb recorded waste; '
    || round(coalesce(m.packaged_lb,0),1) || ' lb packaged (' || m.weight_basis || ' basis); '
    || round(coalesce(m.moisture_loss_lb,0),1) || ' lb residual. '
    || case when m.weight_basis = 'dry'
            then 'The residual is mostly evaporation but can include unrecorded loss or weighing error.'
            when m.weight_basis = 'wet'
            then 'Fresh frozen is not judged against the dried-harvest residual goal.'
            else 'No yield or water diagnosis is allowed until the basis is resolved.' end
    as in_plain_english,
  'CLOSED'::text as harvest_state,
  null::numeric as still_on_harvest_lb,
  'Metrc Harvests-Inactive report; residual is derived, not directly measured water'::text as measured_from,
  m.weight_basis as packaged_weight_basis,
  m.classification_basis,
  round(m.moisture_loss_lb,1) as moisture_residual_lb,
  round(m.moisture_pct,1) as moisture_residual_pct,
  round(m.packaged_lb,1) as packaged_weight_lb,
  case m.weight_basis
    when 'dry' then round(m.packaged_lb,1)
    when 'wet' then round(m.packaged_lb / nullif(public.f_rule('fresh_frozen_wet_to_dry'),0),1)
    else null
  end as pounds_dry_equivalent,
  public.f_rule('moisture_loss_goal_pct') as residual_goal_pct,
  public.f_rule('expected_moisture_pct_min') as residual_target_min_pct,
  public.f_rule('expected_moisture_pct_max') as residual_target_max_pct,
  m.as_of_date as source_as_of,
  m.imported_at as source_imported_at,
  'DERIVED RESIDUAL: wet minus recorded waste minus packaged weight. It is not a direct water measurement.'::text as measurement_status
from closed m

union all

select
  h.name,
  nullif(h.raw->>'SourceStrainNames',''),
  h.raw->>'DryingLocationName',
  null::date,
  h.license,
  (h.raw->>'PlantCount')::numeric,
  round((h.raw->>'TotalWetWeight')::numeric / public.f_rule('grams_per_pound'), 1),
  round((h.raw->>'TotalWasteWeight')::numeric / public.f_rule('grams_per_pound'), 1),
  null::numeric,
  null::numeric,
  null::numeric,
  null::numeric,
  'still open; mass balance is not final',
  null::numeric,
  'still open; final yield judgement refused',
  case public.f_harvest_weight_basis(h.name,h.raw->>'DryingLocationName',null)
    when 'wet' then 'fresh frozen - wet basis; harvest still open'
    else 'still open - basis remains unknown until the harvest is finished'
  end,
  h.name || ': harvest is still open. Packaged and remaining weights are interim; '
    || 'the Metrc Harvests-Inactive residual does not exist yet, so no water-loss conclusion is published.',
  'OPEN',
  round((h.raw->>'CurrentWeight')::numeric / public.f_rule('grams_per_pound'), 1),
  'Metrc API; open harvest, no final moisture residual'::text,
  public.f_harvest_weight_basis(h.name,h.raw->>'DryingLocationName',null),
  case
    when public.f_harvest_is_fresh_frozen(h.name)
         and coalesce(h.raw->>'DryingLocationName','') ilike '%freezer%' then 'harvest name carries FF and room is freezer'
    when public.f_harvest_is_fresh_frozen(h.name) then 'harvest name carries explicit FF token'
    when coalesce(h.raw->>'DryingLocationName','') ilike '%freezer%' then 'Metrc room is freezer/biomass storage'
    else 'open harvest; final basis is not proven'
  end,
  null::numeric,
  null::numeric,
  round((h.raw->>'TotalPackagedWeight')::numeric / public.f_rule('grams_per_pound'), 1),
  case when public.f_harvest_weight_basis(h.name,h.raw->>'DryingLocationName',null) = 'wet'
       then round(((h.raw->>'TotalPackagedWeight')::numeric / public.f_rule('grams_per_pound'))
                  / nullif(public.f_rule('fresh_frozen_wet_to_dry'),0),1) end,
  public.f_rule('moisture_loss_goal_pct'),
  public.f_rule('expected_moisture_pct_min'),
  public.f_rule('expected_moisture_pct_max'),
  h.synced_at::date,
  h.synced_at,
  'NOT YET AVAILABLE: open harvest; final residual is not present in Metrc.'::text
from public.metrc_harvests h
where not exists (
  select 1 from public.metrc_rpt_harvest_moisture m2 where m2.harvest_batch = h.name
);

comment on view public.v_harvest_water_and_yield is
  'Every Metrc harvest, with explicit wet/dry/unknown packaged-weight basis. Legacy water_lost_lb and water_pct columns retain the Metrc residual for compatibility; they are not direct water measurements. Use moisture_residual_lb/pct, packaged_weight_basis and pounds_dry_equivalent. Fresh frozen is identified by FF token or freezer location, not by a zero residual.';

create or replace view public.v_moisture_accounting as
select
  w.harvest,
  w.strain,
  w.room,
  h.harvest_start,
  w.finished_on as finished,
  w.plants::integer as plants,
  case w.packaged_weight_basis when 'wet' then 'Fresh frozen'
       when 'dry' then 'Dried flower' else 'Unknown basis' end as stream,
  w.wet_in_lb as wet_lb,
  w.packaged_weight_lb as packaged_lb,
  w.waste_lb as recorded_waste_lb,
  w.moisture_residual_lb as moisture_lb,
  w.still_on_harvest_lb as metrc_current_weight_lb,
  w.balance_lb as reconciliation_gap_lb,
  w.moisture_residual_pct as moisture_pct_of_wet,
  case when coalesce(w.wet_in_lb,0) > 0
       then round(100 * w.packaged_weight_lb / w.wet_in_lb,1) end as conversion_pct,
  w.in_plain_english as the_arithmetic,
  case
    when w.harvest_state = 'OPEN' then 'OPEN - no final moisture residual exists yet'
    when w.packaged_weight_basis = 'wet' then 'FRESH FROZEN - wet basis; excluded from the dried-harvest residual target'
    when w.packaged_weight_basis = 'unknown' then 'UNKNOWN BASIS - no drying or loss diagnosis is allowed'
    when w.moisture_residual_pct between w.residual_target_min_pct and w.residual_target_max_pct
      then 'INSIDE THE OWNER-SET DRIED-HARVEST RESIDUAL TARGET BAND'
    when w.moisture_residual_pct > w.residual_target_max_pct
      then 'ABOVE THE OWNER-SET RESIDUAL BAND - investigate records and process; cause is not diagnosed'
    else 'BELOW THE OWNER-SET RESIDUAL BAND - investigate records and process; cause is not diagnosed'
  end as verdict,
  h.harvest_start as harvest_start_date,
  w.packaged_weight_basis as weight_basis,
  w.classification_basis,
  w.pounds_dry_equivalent,
  w.source_as_of,
  w.source_imported_at,
  w.residual_goal_pct,
  w.residual_target_min_pct,
  w.residual_target_max_pct,
  w.measurement_status
from public.v_harvest_water_and_yield w
left join lateral (
  select mh.harvest_start
  from public.metrc_harvests mh
  where mh.name = w.harvest
  order by mh.synced_at desc nulls last
  limit 1
) h on true;

comment on view public.v_moisture_accounting is
  'Mass accounting with explicit packaged-weight basis and source date. moisture_lb is the Metrc-derived residual for compatibility, not a direct evaporation measurement. Use weight_basis, measurement_status and pounds_dry_equivalent before comparing or adding weights.';

create or replace view public.v_moisture_summary as
select
  stream,
  count(*) as harvests,
  round(sum(wet_lb),1) as wet_lb,
  round(sum(packaged_lb),1) as packaged_lb,
  round(sum(recorded_waste_lb),1) as waste_lb,
  null::numeric as evaporated_lb,
  round(sum(metrc_current_weight_lb),1) as metrc_says_lb,
  round(sum(reconciliation_gap_lb),1) as gap_lb,
  round(100 * sum(moisture_lb) / nullif(sum(wet_lb),0),1) as moisture_pct,
  round(100 * sum(packaged_lb) / nullif(sum(wet_lb),0),1) as conversion_pct,
  'The mass-balance residual closes the arithmetic by definition. It does not prove how much was evaporation versus unrecorded loss. The legacy evaporated_lb measure is quarantined as null; use residual_lb.'::text as what_this_proves,
  round(sum(moisture_lb),1) as residual_lb,
  max(residual_goal_pct) as residual_goal_pct,
  max(residual_target_min_pct) as residual_target_min_pct,
  max(residual_target_max_pct) as residual_target_max_pct,
  max(source_as_of) as source_as_of,
  'DERIVED RESIDUAL - not a direct water measurement'::text as measurement_status
from public.v_moisture_accounting
where finished is not null
group by stream;

comment on view public.v_moisture_summary is
  'Closed harvest mass summary by explicit weight basis. evaporated_lb is deliberately null because Metrc supplies a residual, not a water sensor measurement. residual_lb is additive only within a disclosed basis.';

/* The operational register keeps its established columns, but uses the actual
 * goal rule and carries the basis/evidence beside every action. */
create or replace view public.v_moisture_loss_register as
with r as (
  select public.f_rule('moisture_loss_goal_pct') / 100.0 as loss
)
select
  h.harvest_name,
  h.harvest_started,
  h.harvest_closed,
  h.drying_room,
  h.strain,
  round(h.wet_lb,1) as wet_lb,
  round(h.packaged_lb,1) as packaged_lb,
  round(h.waste_lb,1) as waste_lb,
  round(h.still_in_room_lb,1) as metrc_shows_remaining_lb,
  case when b.weight_basis = 'dry' then round(h.wet_lb * r.loss,1) end as expected_moisture_loss_lb,
  case when b.weight_basis = 'dry'
       then greatest(round(h.wet_lb * (1-r.loss) - h.packaged_lb,1),0) end as really_left_lb,
  case
    when b.weight_basis <> 'dry' then null
    when mx.moisture_loss_lb is not null then 0
    else greatest(round(h.still_in_room_lb
         - greatest(h.wet_lb * (1-r.loss) - h.packaged_lb,0),1),0)
  end as phantom_lb,
  case when h.harvest_closed is not null then 'CLOSED' else 'OPEN' end as harvest_state,
  coalesce(mx.moisture_loss_lb,e.moisture_loss_lb) as recorded_loss_lb,
  coalesce(e.method,case when mx.moisture_loss_lb is not null then 'Metrc Harvests-Inactive report' end) as recorded_method,
  coalesce(e.entered_by,case when mx.moisture_loss_lb is not null then 'recorded in Metrc' end) as entered_by,
  coalesce(e.entered_at::date,mx.finished_on) as recorded_on,
  coalesce(e.recorded_in_metrc,mx.moisture_loss_lb is not null) as recorded_in_metrc,
  e.metrc_adjustment_ref,
  e.note as recorded_note,
  e.id is null and mx.moisture_loss_lb is null and h.harvest_closed is not null
    and b.weight_basis <> 'wet' as needs_recording,
  case
    when mx.moisture_loss_lb is not null and b.weight_basis = 'wet'
      then 'METRC RESIDUAL RECORDED, WET BASIS - fresh frozen is excluded from the dried-harvest goal.'
    when mx.moisture_loss_lb is not null
      then 'METRC RESIDUAL RECORDED - derived from wet minus waste minus packaged; it is not direct measured water.'
    when b.weight_basis = 'wet'
      then 'FRESH FROZEN - packaged wet; no dried-harvest residual record is expected.'
    when b.weight_basis = 'unknown' and h.harvest_closed is not null
      then 'UNKNOWN BASIS - resolve wet/dry evidence before recording or diagnosing a loss.'
    when e.id is null and h.harvest_closed is not null
      then 'CLOSED HARVEST - no Metrc residual row is available; verify the source report before any adjustment.'
    when e.id is null then 'OPEN HARVEST - final residual does not exist yet.'
    when not e.recorded_in_metrc then 'RECORDED HERE, NOT YET VERIFIED IN METRC.'
    else 'DONE - local evidence and Metrc reference are recorded.'
  end as status,
  b.weight_basis,
  b.classification_basis,
  public.f_rule('moisture_loss_goal_pct') as residual_goal_pct,
  public.f_rule('expected_moisture_pct_min') as residual_target_min_pct,
  public.f_rule('expected_moisture_pct_max') as residual_target_max_pct,
  mx.as_of_date as source_as_of,
  'Residual is derived, not direct measured water. Never diagnose cause from this field alone.'::text as measurement_status
from public.v_harvest_forensic h
cross join r
left join lateral (
  select m.harvest_batch,m.moisture_loss_lb,m.moisture_pct,m.finished_on,m.as_of_date,m.room
  from public.metrc_rpt_harvest_moisture m
  where m.harvest_batch = h.harvest_name
  order by m.imported_at desc
  limit 1
) mx on true
cross join lateral (
  select public.f_harvest_weight_basis(h.harvest_name,coalesce(mx.room,h.drying_room),mx.moisture_loss_lb) as weight_basis,
         case
           when public.f_harvest_is_fresh_frozen(h.harvest_name)
                and coalesce(mx.room,h.drying_room,'') ilike '%freezer%' then 'harvest name carries FF and room is freezer'
           when public.f_harvest_is_fresh_frozen(h.harvest_name) then 'harvest name carries explicit FF token'
           when coalesce(mx.room,h.drying_room,'') ilike '%freezer%' then 'Metrc room is freezer/biomass storage'
           when mx.moisture_loss_lb > 0 then 'positive Metrc residual; no wet-basis marker'
           else 'no reliable wet/dry evidence'
         end as classification_basis
) b
left join lateral (
  select m.* from public.moisture_loss_entries m
  where m.harvest_name = h.harvest_name
  order by m.entered_at desc
  limit 1
) e on true
where h.still_in_room_lb > 0 and h.wet_lb > 0
order by case when h.harvest_closed is not null then 0 else 1 end,
         (e.id is null) desc,
         h.still_in_room_lb desc;

comment on view public.v_moisture_loss_register is
  'Operational residual register. The target comes from moisture_loss_goal_pct. Each row carries wet/dry/unknown basis and evidence. A residual is not labelled direct water, and fresh frozen is excluded from dried-harvest expectations.';

grant execute on function public.f_harvest_weight_basis(text,text,numeric) to authenticated;
grant select on public.v_harvest_water_and_yield, public.v_moisture_accounting,
  public.v_moisture_summary, public.v_moisture_loss_register,
  public.v_moisture_business_rules to authenticated;
grant select on public.business_rule_surface to authenticated;
