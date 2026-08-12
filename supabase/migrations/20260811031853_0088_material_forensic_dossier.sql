-- ---------------------------------------------------------------------------
-- 0088 — THE FORENSIC DOSSIER: one row per tag, the complete trail from
-- acquisition to destruction, with the evidence attached.
--
-- Built because the Paper City write-off could only be explained by pulling six
-- tables by hand. That must never be necessary again: the OS has to state the whole
-- story of any tag on one line.
--
-- What that investigation established, and what this view now surfaces for every tag:
--   * the acquisition may have NO MANIFEST -- our transfer data starts 2024-01-18,
--     so anything received earlier has no documented purchase leg
--   * a tag can be destroyed with NO FAILING LAB RESULT on record
--   * "tested" is not one thing: 9 pesticide-panel tests is not the same as a full
--     40-test panel, and reporting either as simply "tested" hides the difference
-- ---------------------------------------------------------------------------
create or replace view v_material_forensic_dossier as
with pk as (
  select distinct on (upper(btrim(p.raw->>'Label'))) upper(btrim(p.raw->>'Label')) tag, p.raw, p.license
  from metrc_packages p order by 1, (p.raw->>'LastModified') desc nulls last),
inb as (
  select upper(btrim(package_tag)) tag,
         string_agg(distinct manifest_number, ', ') manifests,
         min(received_on) received_on,
         string_agg(distinct coalesce(origin_facility, origin_licence), ', ') from_whom,
         round(sum(pounds)::numeric,3) lb
  from v_transfer_line where direction in ('INBOUND','INTERNAL') and voided<>'True' group by 1),
outb as (
  select upper(btrim(package_tag)) tag,
         string_agg(distinct manifest_number, ', ') manifests,
         max(received_on) shipped_on,
         string_agg(distinct coalesce(dest_facility, dest_licence), ', ') to_whom,
         round(sum(pounds)::numeric,3) lb
  from v_transfer_line where direction in ('OUTBOUND','INTERNAL') and voided<>'True' group by 1),
lab as (
  select upper(btrim(package_tag)) tag,
         count(*) tests, count(*) filter (where passed is false) failures,
         min(result_date) first_tested, max(result_date) last_tested,
         string_agg(distinct lab_facility, ', ') labs,
         max(result) filter (where test_name ilike 'Total THC (%%)%%')       total_thc_pct,
         max(result) filter (where test_name ilike 'Moisture Content%%')     moisture_pct,
         max(result) filter (where test_name ilike 'Total Yeast and Mold%%') yeast_mold,
         max(result) filter (where test_name ilike 'Water Activity%%')       water_activity
  from metrc_lab_results where package_tag is not null group by 1),
adj as (
  select upper(btrim(package_tag)) tag,
         round(sum(f_to_pounds(quantity,uom))::numeric,3) lb,
         string_agg(distinct reason, ', ') reasons,
         string_agg(distinct source_row->>'Note', ' | ') notes,
         string_agg(distinct source_row->>'User', ', ') adjusted_by,
         min(adjusted_on) first_adj, max(adjusted_on) last_adj
  from metrc_rpt_adjustments where quantity is not null and f_is_weight(uom) group by 1),
kids as (
  select btrim(pt.tag) tag, count(*) children,
         string_agg(distinct coalesce(c.raw->'Item'->>'ProductCategoryName','?'), ', ') child_categories,
         string_agg(distinct c.raw->'Item'->>'Name', ' | ') child_items,
         round(sum(f_to_pounds(coalesce((c.raw->>'CreatedQuantity')::numeric,0),
             coalesce(nullif(c.raw->>'UnitOfMeasureName',''),'Grams'))
             / greatest(array_length(string_to_array(c.raw->>'SourcePackageLabels',', '),1),1))::numeric,3) produced_lb
  from metrc_packages c
  join lateral unnest(string_to_array(c.raw->>'SourcePackageLabels', ', ')) pt(tag) on true
  where nullif(c.raw->>'SourcePackageLabels','') is not null group by 1)
select pk.tag,
       pk.raw->'Item'->>'Name'                                        as item,
       coalesce(pk.raw->'Item'->>'ProductCategoryName','(unknown)')    as category,
       coalesce(nullif(pk.raw->'Item'->>'StrainName',''),
                f_strain_from_item(pk.raw->'Item'->>'Name'))           as strain,
       coalesce(nullif(pk.raw->>'ItemFromFacilityName',''),'(unknown)') as material_from,
       case when f_is_ours(coalesce(nullif(pk.raw->>'ItemFromFacilityLicenseNumber',''),''))
            then 'OURS' else 'THIRD PARTY' end                        as ownership,
       pk.license                                                     as held_under_licence,
       -- ACQUIRED
       (pk.raw->>'PackagedDate')::date                                as packaged_on,
       inb.received_on, inb.manifests as inbound_manifests, inb.from_whom,
       round(f_to_pounds(coalesce((pk.raw->>'CreatedQuantity')::numeric,0),
             coalesce(nullif(pk.raw->>'UnitOfMeasureName',''),'Grams'))::numeric,3) as acquired_lb,
       case when inb.manifests is null
            then 'NO INBOUND MANIFEST — received before our transfer data begins (2024-01-18)'
            else 'documented on manifest ' || inb.manifests end        as acquisition_evidence,
       -- TESTED
       lab.first_tested, lab.last_tested, lab.tests as lab_tests, lab.failures as lab_failures,
       lab.total_thc_pct, lab.moisture_pct, lab.yeast_mold, lab.water_activity, lab.labs,
       case when lab.tag is null                then 'NEVER TESTED in our data'
            when lab.failures > 0               then 'FAILED — ' || lab.failures || ' failing result(s)'
            when lab.tests < 20                 then 'PASSED, but a PARTIAL panel only (' || lab.tests || ' tests)'
            else 'PASSED a full panel (' || lab.tests || ' tests)' end  as lab_verdict,
       -- PRODUCED
       kids.children, kids.child_categories, kids.child_items, kids.produced_lb,
       case when kids.tag is null then null
            else round((100.0*kids.produced_lb
                 / nullif(f_to_pounds(coalesce((pk.raw->>'CreatedQuantity')::numeric,0),
                   coalesce(nullif(pk.raw->>'UnitOfMeasureName',''),'Grams')),0))::numeric,2) end as yield_pct,
       -- SHIPPED
       outb.shipped_on, outb.manifests as outbound_manifests, outb.to_whom, outb.lb as shipped_lb,
       -- DESTROYED
       adj.lb as adjusted_lb, adj.reasons as adjustment_reasons,
       adj.notes as adjustment_notes, adj.adjusted_by, adj.first_adj, adj.last_adj,
       -- CLOSED
       coalesce((pk.raw->>'IsFinished')::boolean,false)                as finished,
       (pk.raw->>'FinishedDate')::date                                 as finished_on,
       coalesce(nullif(pk.raw->>'LocationName',''),'(no room)')        as room,
       round(f_to_pounds(coalesce((pk.raw->>'Quantity')::numeric,0),
             coalesce(nullif(pk.raw->>'UnitOfMeasureName',''),'Grams'))::numeric,3) as on_hand_lb,
       case when (pk.raw->>'PackagedDate')::date is not null and (pk.raw->>'FinishedDate')::date is not null
            then ((pk.raw->>'FinishedDate')::date - (pk.raw->>'PackagedDate')::date) end as days_held,
       -- THE VERDICT
       case
         when adj.lb < -1 and coalesce(lab.failures,0) = 0
              then 'DESTROYED WITH NO FAILING LAB RESULT — ' || coalesce(adj.notes,'no note given')
         when adj.lb < -1 then 'DESTROYED — ' || coalesce(adj.notes,'no note given')
         when kids.tag is not null and outb.tag is not null then 'PROCESSED AND SHIPPED'
         when kids.tag is not null then 'PROCESSED INTO PRODUCT'
         when outb.tag is not null then 'SHIPPED OUT'
         when coalesce((pk.raw->>'Quantity')::numeric,0) > 0 then 'ON HAND'
         else 'CLOSED — no recorded outcome' end                       as outcome
from pk
left join inb  on inb.tag  = pk.tag
left join outb on outb.tag = pk.tag
left join lab  on lab.tag  = pk.tag
left join adj  on adj.tag  = pk.tag
left join kids on kids.tag = pk.tag;

comment on view v_material_forensic_dossier is
  'The complete trail for every tag on one line: acquired (with or without a '
  'manifest), tested (and whether that was a FULL panel or a partial one), processed '
  'into what and at what yield, shipped to whom, destroyed by whom with their own '
  'note, and how many days it was held. The outcome column flags DESTROYED WITH NO '
  'FAILING LAB RESULT, which is how the Paper City write-off was found: 540 lb '
  'written off as "unusable for extraction" with zero failing results on record.';

grant select on v_material_forensic_dossier to authenticated;

insert into nav_registry (category, label, view_key, table_ref, surface, page_kind,
                          archetype, report_group, module, icon, description,
                          date_policy, default_range, range_kind, enabled, item_order)
values ('Reports','Material Forensic Dossier','material_dossier','v_material_forensic_dossier',
  'reports','report','custody_chain','Inventory & Audit','reports','box',
  'The complete trail for every tag on one line: acquired, tested, processed, shipped, '
  'destroyed — with the manifest, the lab verdict, the yield, the days held, and who '
  'adjusted it out in their own words. Flags any tag destroyed with no failing lab result.',
  'auto','this_year','activity',true,24)
on conflict (view_key) do update set
  label=excluded.label, table_ref=excluded.table_ref, description=excluded.description, enabled=true;

insert into report_registry (report_key, title, category, fact_view, date_column,
                             dimensions, measures, description, enabled)
values ('inventory.material_dossier','Material Forensic Dossier','Inventory',
  'v_material_forensic_dossier','packaged_on',
  array['outcome','lab_verdict','ownership','material_from','category','strain','room',
        'held_under_licence','adjustment_reasons','adjusted_by','acquisition_evidence'],
  array['acquired_lb','produced_lb','shipped_lb','adjusted_lb','on_hand_lb','days_held'],
  'Complete per-tag trail from acquisition to disposal, with evidence.', true)
on conflict (report_key) do update set
  fact_view=excluded.fact_view, date_column=excluded.date_column,
  dimensions=excluded.dimensions, measures=excluded.measures, enabled=true;
;
