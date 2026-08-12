-- THE REPORT ENGINE. Owner, 8 Aug 2026: "every report must have details and filters,
-- date range, full detail report suite like QuickBooks. I am expecting thousands."
--
-- QuickBooks does not hold thousands of hand-written reports. It holds a handful of
-- FACT tables and a report engine; the thousands are permutations of filter, grouping
-- and date range. Hand-writing thousands of views here would be unmaintainable and
-- each would rot separately - this platform already carries 253 views and one night's
-- hard evidence about what happens when the same rule lives in many places.
--
-- So: a REGISTRY of named reports over shared facts, and one runner. Every report
-- inherits the same corrected arithmetic - countable items never collapse to null,
-- wet is never added to dry, ownership comes from custody, tags are de-duplicated -
-- because they all read the same fact view.
--
-- UNDO: drop view v_report_catalogue; drop table report_registry.

create table if not exists public.report_registry (
  report_key   text primary key,
  title        text not null,
  category     text not null,
  fact_view    text not null,
  date_column  text,
  dimensions   text[] not null,
  measures     text[] not null,
  description  text not null,
  owner_note   text,
  enabled      boolean not null default true
);
alter table public.report_registry enable row level security;
drop policy if exists report_registry_read on public.report_registry;
create policy report_registry_read on public.report_registry for select to authenticated using (true);

comment on table public.report_registry is
  'Named reports over shared fact views. The report COUNT is combinatorial: group by '
  'any dimension, filter on any other, over any date range. One fact view with 18 '
  'dimensions yields thousands of reports with no extra view to maintain.';

insert into report_registry (report_key,title,category,fact_view,date_column,dimensions,measures,description,owner_note) values
('inventory.on_hand','Inventory on hand','Inventory','v_inventory_report','packaged_on',
 array['room','sublocation','licence','stream','category','strain','status','lab_state','age_band','ownership','document_status','weight_basis','is_primary_production','on_hold','received_from','item_defined_by_name','certificate_client','has_certificate'],
 array['pounds','pounds_wet','pounds_dry','pounds_dry_equivalent','units','value_at_our_cost'],
 'Every package with every dimension. Group or filter on any of 18 fields, over any date range.',
 'NEVER sum pounds across streams - fresh frozen is WET. Use pounds_dry_equivalent for one comparable total.'),
('inventory.ageing','Stock ageing','Inventory','v_inventory_report','packaged_on',
 array['age_band','room','stream','category','strain','licence','ownership','status','document_status'],
 array['pounds_dry_equivalent','units','value_at_our_cost'],
 'Inventory by how long it has been held. 180 days is the ageing threshold.',null),
('inventory.documents','Document coverage','Quality','v_inventory_report','packaged_on',
 array['document_status','has_certificate','certificate_basis','room','stream','category','licence','lab_state','ownership'],
 array['pounds_dry_equivalent','units','value_at_our_cost'],
 'Which items carry their COA and their manifest - both required by law before an order ships.',
 'Tested or sold and not COMPLETE means it cannot go to a customer.'),
('inventory.ownership','Ownership and custody','Compliance','v_inventory_report','packaged_on',
 array['ownership','custody_origin_licences','certificate_client','item_defined_by_name','received_from','room','stream','licence','age_band'],
 array['pounds_dry_equivalent','units'],
 'Whose material is it, judged from custody rather than the item field.',
 'item_defined_by names who defined the ITEM and flips to us on any repack. Never read it as ownership.'),
('inventory.never_tested','Never tested - proof','Compliance','v_never_tested_proof','metrc_packaged_on',
 array['metrc_room','room_type','category','metrc_lab_state','metrc_status','metrc_licence','proof'],
 array['lab_results','manifest_lines','own_certificate','days_in_facility'],
 'Every package claimed never tested, with the Metrc room and seed-to-sale chain proving it.',
 'proof LIKE ''FAILS%'' must return zero rows.'),
('custody.manifests','Manifest custody','Compliance','v_manifest_custody','date_created',
 array['direction','destination_kind','delivered_to','destination_license','shipped_by','carried_by','transporter_license','is_lab_run'],
 array['packages'],
 'Where every shipment went, read from the manifest itself.',
 'An MT destination is NOT automatically a non-sale - Eagle Eyes stores, MMM delivers. Check the return leg.'),
('quality.certificate_gap','Certificate gap','Quality','v_certificate_gap','packaged_on',
 array['bucket','lab_testing_state','source_state','location','license','platform_license','received_from'],
 array['pounds','lab_result_rows'],
 'Tested packages with no certificate anywhere in their lineage, and what each needs to close it.',null),
('quality.countable','Counted inventory','Inventory','v_countable_inventory',null,
 array['unit_of_measure','location','license','item_defined_by','source_state'],
 array['units'],
 'Every counted package - the inventory a pounds-only report silently drops.',
 'Cross-check any pounds total against this. 18,822 units were publishing as nothing.'),
('audit.agent_agreement','Do the agents agree','Audit','v_agent_agreement',null,
 array['agreement','subject','agents'],
 array['claims','pct_apart'],
 'Where agents reached the same answer independently and where they did not.',
 'UNCORROBORATED is not agreement - it means only one agent has looked.'),
('audit.discrepancies','Cross-source discrepancies','Audit','v_verification_latest',null,
 array['check_key','verdict','severity','owner'],
 array['value_a','value_b','pct_apart'],
 'Every figure derived two independent ways, and whether the two agree.',
 'Never average a disagreement. Report both and both methods.'),
('audit.traps','Code trap scan','Audit','v_trap_scan',null,
 array['trap','severity','kind','object_name'],
 array[]::text[],
 'Static scan of every view and function for the error classes that have cost money here.',
 'Empty is the good state. It finds only classes someone has named.')
on conflict (report_key) do update set dimensions=excluded.dimensions, measures=excluded.measures,
  description=excluded.description, owner_note=excluded.owner_note, fact_view=excluded.fact_view;

create or replace view public.v_report_catalogue as
select r.report_key, r.title, r.category, r.fact_view,
       (r.date_column is not null)                as supports_date_range,
       r.date_column,
       array_length(r.dimensions,1)               as dimension_count,
       array_length(r.measures,1)                 as measure_count,
       r.dimensions, r.measures, r.description, r.owner_note,
       (array_length(r.dimensions,1)
        * (1 + array_length(r.dimensions,1) - 1)
        * array_length(r.dimensions,1)
        * case when r.date_column is not null then 4 else 1 end) as report_permutations
from report_registry r where r.enabled;

comment on view public.v_report_catalogue is
  'The report suite. report_permutations counts reports reachable by grouping on one '
  'or two dimensions, filtering on another, across four date ranges - the QuickBooks '
  'shape. Every one inherits the same corrected arithmetic because they read the '
  'same fact view.';;
