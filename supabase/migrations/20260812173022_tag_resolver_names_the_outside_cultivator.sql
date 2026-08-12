-- Agent: M
-- Refinement, additive: two columns appended at the END, no existing column
-- renamed, reordered or retyped.
--
-- Measured 12 Aug 2026: all 78 tags the first cut of the resolver left as
-- LINEAGE ONLY have a child in our mirror whose ItemFromFacilityLicenseNumber
-- names an OUTSIDE cultivator - Coastal Healing MC282761 (24), Solar
-- Therapeutics MC281592 (13), Flower Power Growers MC283122 (11), 27 Broom
-- Street MC281723 (10) and eight more. Not one names us. So "we do not know"
-- was wrong: we know whose package it is, and the actual gap is the inbound
-- transfer report that has never been imported. Trap 11 cuts this way safely -
-- that field flips TO us on a repack, never away, so an outside licence in it
-- is evidence, not noise.

create or replace view public.v_tag_resolver as
with universe as (
  select tag from (
    select distinct upper(btrim(raw->>'Label')) as tag from metrc_packages
    union select distinct upper(btrim(package_tag)) from metrc_rpt_package_transfers
    union select distinct upper(btrim(source_package)) from metrc_rpt_package_transfers
           where nullif(btrim(source_package),'') is not null
    union select distinct upper(btrim(tag)) from metrc_rpt_point_in_time where record_type = 'Package'
    union select distinct upper(btrim(package_tag)) from metrc_rpt_packages_inventory
    union select distinct upper(btrim(package_tag)) from metrc_rpt_lab_results  where package_tag is not null
    union select distinct upper(btrim(package_tag)) from metrc_rpt_adjustments  where package_tag is not null
    union select distinct upper(btrim(package_tag)) from metrc_rpt_test_batches where package_tag is not null
    union select distinct upper(btrim(s)) from metrc_packages p,
           lateral unnest(string_to_array(coalesce(p.raw->>'SourcePackageLabels',''), ',')) s
           where btrim(s) <> ''
  ) z where tag is not null and tag <> ''
),
mirror as (
  select distinct on (upper(btrim(raw->>'Label')))
         upper(btrim(raw->>'Label')) as tag, license, source_state, raw
  from metrc_packages
  order by upper(btrim(raw->>'Label')), (raw->>'LastModified') desc nulls last
),
mirror_lic as (
  select upper(btrim(raw->>'Label')) as tag,
         string_agg(distinct license, ' + ' order by license) as licences
  from metrc_packages group by 1
),
legs as (
  select upper(btrim(package_tag)) as tag,
         count(*)                                             as legs_total,
         count(*) filter (where voided = 'True')              as legs_voided,
         bool_or(direction = 'OUTBOUND' and voided <> 'True') as any_out,
         bool_or(direction = 'INBOUND'  and voided <> 'True') as any_in,
         bool_or(direction = 'INTERNAL' and voided <> 'True') as any_internal,
         min(received_on)                                     as first_moved,
         max(received_on)                                     as last_moved,
         string_agg(distinct manifest_number, ', ')           as manifests_all,
         round(sum(pounds) filter (where direction = 'OUTBOUND' and voided <> 'True'), 3)              as lb_out,
         round(sum(pounds) filter (where direction in ('INBOUND','INTERNAL') and voided <> 'True'), 3) as lb_in
  from v_transfer_line group by 1
),
last_leg as (
  select distinct on (upper(btrim(package_tag)))
         upper(btrim(package_tag)) as tag,
         manifest_number, direction, received_on, pounds, weight_source, voided, status,
         origin_licence, origin_facility, dest_licence, dest_facility, item, category, strain
  from v_transfer_line
  order by upper(btrim(package_tag)), (voided = 'True'), received_on desc nulls last, manifest_number desc
),
consumed as (
  select upper(btrim(source_package)) as tag,
         count(distinct manifest_number)           as n_manifests,
         min(manifest_number)                      as a_manifest,
         count(distinct upper(btrim(package_tag))) as n_children,
         min(upper(btrim(package_tag)))            as a_child,
         min(received_on)                          as first_seen,
         max(received_on)                          as last_seen
  from metrc_rpt_package_transfers
  where nullif(btrim(source_package),'') is not null
  group by 1
),
lineage as (
  select distinct upper(btrim(s)) as anc_tag, upper(btrim(p.raw->>'Label')) as child_tag
  from metrc_packages p,
       lateral unnest(string_to_array(coalesce(p.raw->>'SourcePackageLabels',''), ',')) s
  where btrim(s) <> ''
),
lineage_any as (
  select anc_tag, count(*) as n_children, min(child_tag) as a_child from lineage group by 1
),
child_inbound as (
  select l.anc_tag,
         count(distinct li.manifest_number)                   as n_manifests,
         min(li.manifest_number)                              as a_manifest,
         min(coalesce(li.origin_facility, li.origin_licence)) as a_sender,
         min(li.received_on)                                  as first_received,
         min(l.child_tag)                                     as a_child
  from lineage l
  join v_transfer_line li
    on upper(btrim(li.package_tag)) = l.child_tag
   and li.direction in ('INBOUND','INTERNAL')
   and li.voided <> 'True'
  group by 1
),
-- Who Metrc says defined the ITEM on the child we hold. Trap 11: this field
-- flips TO us when we repack, never away from us, so an OUTSIDE licence here
-- is evidence of outside origin and is safe to read in that direction only.
child_origin as (
  select l.anc_tag,
         min(nullif(p.raw->>'ItemFromFacilityLicenseNumber','')) as licence,
         min(nullif(p.raw->>'ItemFromFacilityName',''))          as name,
         bool_or(f_is_ours(nullif(p.raw->>'ItemFromFacilityLicenseNumber',''))) as any_ours
  from lineage l
  join metrc_packages p on upper(btrim(p.raw->>'Label')) = l.child_tag
  group by 1
),
seen as (
  select tag, string_agg(src, ' + ' order by src) as also_seen_in
  from (
    select distinct upper(btrim(tag)) as tag, 'point-in-time snapshot' as src
      from metrc_rpt_point_in_time where record_type = 'Package'
    union select distinct upper(btrim(package_tag)), 'packages-inventory report' from metrc_rpt_packages_inventory
    union select distinct upper(btrim(package_tag)), 'Metrc lab results'         from metrc_rpt_lab_results  where package_tag is not null
    union select distinct upper(btrim(package_tag)), 'adjustments report'        from metrc_rpt_adjustments  where package_tag is not null
    union select distinct upper(btrim(package_tag)), 'test-batches report'       from metrc_rpt_test_batches where package_tag is not null
  ) z group by tag
),
core as (
  select
    u.tag,
    (m.tag is not null) as in_mirror,
    case
      when m.tag is not null         then 'HELD'
      when ll.direction = 'OUTBOUND' then 'SHIPPED OUT'
      when ll.direction = 'INBOUND'  then 'RECEIVED'
      when ll.direction = 'INTERNAL' then 'MOVED BETWEEN OUR LICENCES'
      when ll.direction is not null  then 'THIRD PARTY BOTH ENDS'
      when cs.tag is not null        then 'CONSUMED HERE'
      when ci.anc_tag is not null    then 'UPSTREAM AT THE SENDER'
      when la.anc_tag is not null and co.licence is not null and not co.any_ours
                                     then 'UPSTREAM AT AN OUTSIDE CULTIVATOR'
      when la.anc_tag is not null    then 'LINEAGE ONLY'
      when sn.tag is not null        then 'REPORT SIGHTING ONLY'
      else                                'NOT RESOLVED'
    end as resolution,
    m.license      as mirror_licence,
    ml.licences    as mirror_licences_all,
    m.source_state as mirror_state,
    nullif(m.raw->>'LocationName','') as mirror_room,
    case when m.tag is not null
         then f_quantity_text(coalesce((m.raw->>'Quantity')::numeric, 0),
                              coalesce(nullif(m.raw->>'UnitOfMeasureName',''), 'Grams'))
    end as mirror_quantity,
    ll.manifest_number, ll.direction, ll.received_on as moved_on, ll.pounds,
    ll.weight_source, ll.status as manifest_status, ll.voided as manifest_voided,
    ll.origin_licence, ll.origin_facility, ll.dest_licence, ll.dest_facility,
    coalesce(nullif(m.raw#>>'{Item,Name}',''), ll.item) as item,
    coalesce(nullif(m.raw#>>'{Item,ProductCategoryName}',''), ll.category) as category,
    g.legs_total, g.legs_voided, g.any_out, g.any_in, g.any_internal,
    g.first_moved, g.last_moved, g.manifests_all, g.lb_out, g.lb_in,
    cs.n_manifests as consumed_manifests, cs.a_manifest as consumed_a_manifest,
    cs.n_children  as consumed_children,  cs.a_child    as consumed_a_child,
    ci.n_manifests as child_manifests,    ci.a_manifest as child_a_manifest,
    ci.a_sender    as child_sender,       ci.first_received as child_received,
    ci.a_child     as child_tag,
    la.n_children  as lineage_children,   la.a_child    as lineage_a_child,
    sn.also_seen_in
  from universe u
  left join mirror        m  on m.tag      = u.tag
  left join mirror_lic    ml on ml.tag     = u.tag
  left join legs          g  on g.tag      = u.tag
  left join last_leg      ll on ll.tag     = u.tag
  left join consumed      cs on cs.tag     = u.tag
  left join child_inbound ci on ci.anc_tag = u.tag
  left join lineage_any   la on la.anc_tag = u.tag
  left join child_origin  co on co.anc_tag = u.tag
  left join seen          sn on sn.tag     = u.tag
),
outside as (
  select l.anc_tag,
         min(nullif(p.raw->>'ItemFromFacilityLicenseNumber','')) as licence,
         min(nullif(p.raw->>'ItemFromFacilityName',''))          as name
  from lineage l
  join metrc_packages p on upper(btrim(p.raw->>'Label')) = l.child_tag
  group by 1
)
select
  c.*,
  (c.resolution <> 'NOT RESOLVED') as resolved,
  (c.resolution in ('HELD','SHIPPED OUT','RECEIVED','MOVED BETWEEN OUR LICENCES',
                    'THIRD PARTY BOTH ENDS','CONSUMED HERE','UPSTREAM AT THE SENDER'))
    as resolves_to_package_or_manifest,
  (c.resolution in ('NOT RESOLVED','LINEAGE ONLY','UPSTREAM AT AN OUTSIDE CULTIVATOR'))
    as needs_a_person,
  (c.resolution in ('SHIPPED OUT','RECEIVED','MOVED BETWEEN OUR LICENCES',
                    'THIRD PARTY BOTH ENDS','CONSUMED HERE','UPSTREAM AT THE SENDER'))
    as absence_is_expected,
  case c.resolution
    when 'HELD' then
      'We hold this package. It is in the Metrc mirror under '||coalesce(c.mirror_licences_all,'(no licence)')
      ||', state '||coalesce(c.mirror_state,'(unknown)')||', room '||coalesce(c.mirror_room,'(no room)')
      ||', quantity '||coalesce(c.mirror_quantity,'(no quantity recorded)')||'.'
    when 'SHIPPED OUT' then
      'It LEFT us. Manifest '||coalesce(c.manifest_number,'(unnumbered)')||' carried it from '
      ||coalesce(c.origin_facility, c.origin_licence, 'our facility')||' to '
      ||coalesce(c.dest_facility, c.dest_licence, '(destination not named)')
      ||coalesce(' ('||c.dest_licence||')','')||' on '||coalesce(c.moved_on::text,'(no date)')
      ||', '||coalesce(c.pounds::text,'?')||' lb by '||coalesce(c.weight_source,'unknown basis')||'.'
      ||case when c.manifest_voided = 'True' then ' THAT MANIFEST IS VOIDED.' else '' end
    when 'RECEIVED' then
      'It CAME to us. Manifest '||coalesce(c.manifest_number,'(unnumbered)')||' from '
      ||coalesce(c.origin_facility, c.origin_licence, '(sender not named)')
      ||coalesce(' ('||c.origin_licence||')','')||' on '||coalesce(c.moved_on::text,'(no date)')
      ||', '||coalesce(c.pounds::text,'?')||' lb by '||coalesce(c.weight_source,'unknown basis')||'.'
    when 'MOVED BETWEEN OUR LICENCES' then
      'It moved between our own two licences on manifest '||coalesce(c.manifest_number,'(unnumbered)')
      ||' ('||coalesce(c.origin_licence,'?')||' to '||coalesce(c.dest_licence,'?')||') on '
      ||coalesce(c.moved_on::text,'(no date)')||'. Not a sale.'
    when 'THIRD PARTY BOTH ENDS' then
      'A third-party package. Manifest '||coalesce(c.manifest_number,'(unnumbered)')||' runs from '
      ||coalesce(c.origin_facility, c.origin_licence,'?')||' to '
      ||coalesce(c.dest_facility, c.dest_licence,'?')||' and NEITHER end is one of our licences.'
    when 'CONSUMED HERE' then
      'It was used up here. Metrc names it as the SOURCE PACKAGE of '||coalesce(c.consumed_children,0)
      ||' package(s) that then travelled — for example '||coalesce(c.consumed_a_child,'?')
      ||' on manifest '||coalesce(c.consumed_a_manifest,'?')||'. The child moved; this parent never did.'
    when 'UPSTREAM AT THE SENDER' then
      'It is the SENDER''S OWN upstream package, not ours. What arrived here was its child '
      ||coalesce(c.child_tag,'?')||', on manifest '||coalesce(c.child_a_manifest,'?')||' from '
      ||coalesce(c.child_sender,'(sender not named)')||' on '||coalesce(c.child_received::text,'(no date)')||'.'
    when 'UPSTREAM AT AN OUTSIDE CULTIVATOR' then
      'THIRD PARTY, and we know whose. Metrc names it as the source of '||coalesce(c.lineage_children,0)
      ||' package(s) we hold — for example '||coalesce(c.lineage_a_child,'?')||' — and that package''s item was defined by '
      ||coalesce(o.name,'an outside licensee')||' ('||coalesce(o.licence,'licence not named')
      ||'), not by us. We never held the parent, so it can never be in our mirror. What IS missing is the inbound manifest that brought the child here: it is in no transfer report we have imported.'
    when 'LINEAGE ONLY' then
      'Metrc names it as the source of '||coalesce(c.lineage_children,0)||' package(s) we hold — for example '
      ||coalesce(c.lineage_a_child,'?')||' — but neither it nor that child appears on any manifest we have imported, '
      ||'and the child names no outside licensee either.'
    when 'REPORT SIGHTING ONLY' then
      'It appears in '||coalesce(c.also_seen_in,'a Metrc report')
      ||' and nowhere else. No manifest line, no mirror row, no lineage.'
    else
      'Nothing found. Not in the package mirror, on no manifest line, named as no source package, '
      ||'in no lineage and in no Metrc report we have imported.'
  end as resolution_detail,
  case c.resolution
    when 'HELD' then 'Not applicable — it IS in the mirror.'
    when 'SHIPPED OUT' then 'EXPECTED, and it will never change. Metrc stops returning a package to the shipping facility once the receiver has accepted it. The mirror holds what we possess, not what we once possessed. This is correct behaviour, not a defect.'
    when 'RECEIVED' then 'The manifest shows it arriving, but the Metrc packages endpoint returns no row for it — normally because it has since been repackaged or finished. Follow the child tags before calling it a gap.'
    when 'MOVED BETWEEN OUR LICENCES' then 'EXPECTED while a transfer is in flight, or after the receiving licence repackaged it under a new tag.'
    when 'THIRD PARTY BOTH ENDS' then 'EXPECTED. We do not mirror other facilities'' packages and never will. The line is visible only because the manifest passed through a report we import.'
    when 'CONSUMED HERE' then 'EXPECTED. A parent package stops existing once it is fully packaged out. Metrc keeps the reference on the child, not a standing package row.'
    when 'UPSTREAM AT THE SENDER' then 'EXPECTED. Metrc carries the sender''s own source labels through onto the package they ship us. We never held that parent, so it can never be in our mirror.'
    when 'UPSTREAM AT AN OUTSIDE CULTIVATOR' then 'The parent being absent is EXPECTED — it is another licensee''s package. The missing piece is OURS to fix: import the inbound transfer report covering the date the child arrived, and this tag resolves to a manifest like every other. Until then it stays a named third-party parent with no custody line behind it.'
    when 'LINEAGE ONLY' then 'NOT expected. Either the transfer report covering the child has not been imported, or the parent is one of our own older packages the mirror no longer returns. Import the missing report, or pull the package by tag from Metrc.'
    when 'REPORT SIGHTING ONLY' then 'NOT expected. A tag in a report but on no manifest means the transfer report covering its dates has not been imported. Import that report.'
    else 'A tag with no evidence anywhere is either a mistyped tag in a source file or a report we have never imported. Find the report that names it, then import it. Per the owner ruling of 12 Aug 2026 there is a tag for every item and a manifest for every tag, so this state should be empty.'
  end as what_would_change_it,
  o.licence as outside_cultivator_licence,
  o.name    as outside_cultivator_name
from core c
left join outside o on o.anc_tag = c.tag;

comment on view public.v_tag_resolver is
'THE TAG RESOLVER. Owner ruling 12 Aug 2026 (conversion_factors key tag_missing_means_go_find_the_manifest): a tag absent from metrc_packages is never unknown - it means nobody looked in the transfer records. One row per tag across the whole known universe (package mirror, package transfers and their source packages, point-in-time, packages inventory, lab results, adjustments, test batches, and every SourcePackageLabels ancestor). For any tag it answers WHICH MANIFEST carried it, IN WHICH DIRECTION, TO OR FROM WHOM, ON WHAT DATE, AT WHAT WEIGHT AND ON WHAT WEIGHT BASIS, and therefore WHY it is legitimately not in our mirror - in words, in resolution_detail and what_would_change_it. THIRD PARTY AND SHIPPED OUT ARE NORMAL, EXPECTED STATES, NOT DEFECTS: absence_is_expected marks them true. Only needs_a_person is a question for a human, and UPSTREAM AT AN OUTSIDE CULTIVATOR is not a mystery either - it names the licensee and says the missing piece is an inbound transfer report we have not imported. resolves_to_package_or_manifest is the owner''s assertion in one boolean and is what tile_drill_contract adjustments.every_tag_resolves and verification check tag-resolver-every-adjustment-tag-resolves both read. Weight is Metrc Weight Ship''d where the export carries it and derived from the item catalogue UoM where it does not - weight_source says which on every row, never silently. The COA side of the same question is Agent P''s lane: mv_tag_evidence.';
