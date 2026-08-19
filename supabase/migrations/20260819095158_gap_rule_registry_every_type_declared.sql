/* THE GAP RULE REGISTRY — every gap type the owner named, declared in one
 * place, 19 Aug 2026. "Nothing is optional. Nothing is temporary. Nothing is
 * removed. Nothing is ignored. Nothing is left out."
 *
 * A gap type that is not yet detectable is DECLARED here with the reason,
 * never quietly omitted — his rule: "never remove, bypass or temporarily
 * disable any alert or gate without explicit approval and a logged reason."
 * This table IS that log, and it is the extension point: a new gap type is a
 * new row plus its detector, never a rewrite.
 *
 * NAMES MATCH THE CURRENT BUILD. Owner instruction the same day: "use all
 * names, titles and fields to match Metrc/Apex etc as you have in our current
 * build." So the spine keeps its Metrc-native names — metrc_packages,
 * tag_event, coa_extract, manifest_extract, apex_raw — and `settings` is
 * exposed as a VIEW over conversion_factors rather than a second copy of the
 * same rules under a different name. Two tables holding one truth is the
 * defect this house counts. */

create or replace view public.settings as
  select key            as setting_key,
         value          as setting_value,
         unit,
         label          as title,
         what_it_means,
         where_it_came_from,
         set_by,
         updated_at
  from public.conversion_factors;

comment on view public.settings is
  'The owner-named settings table (master build §1), exposed over conversion_factors — the rules '
  'registry this build already had. One truth, two names: a second physical table would be a '
  'second place for the 26 % floor and the 180 lb minimum to disagree. Read f_rule(key) in SQL. '
  'Agent I, 19 Aug 2026.';

create table if not exists public.gap_rule (
  gap_type        text primary key,
  family          text not null,
  severity        text not null check (severity in ('info','warning','critical')),
  detects         boolean not null default false,
  detector        text,
  threshold_key   text,
  what_it_catches text not null,
  why_not_yet     text,
  declared_on     date not null default current_date
);

comment on table public.gap_rule is
  'Every gap type the owner declared (master build §11), whether or not it detects yet. A type '
  'that cannot detect carries why_not_yet — declared and logged, never silently dropped, which is '
  'his standing rule. Adding a gap type = one row here plus its detector; the architecture never '
  'gets rewritten for a new rule. Agent I, 19 Aug 2026.';

alter table public.gap_rule enable row level security;
create policy gr_read on public.gap_rule for select to authenticated using (true);

insert into public.gap_rule (gap_type, family, severity, detects, detector, threshold_key, what_it_catches, why_not_yet) values
-- DOCUMENT
('missing_coa','document','critical',true,'v_tag_gap rule A',null,'A live package with no certificate anywhere in its lineage.',null),
('missing_manifest','document','critical',true,'v_tag_gap rule B',null,'A tag that left the facility with no manifest recorded.',null),
('missing_invoice','document','warning',true,'v_tag_gap rule C',null,'A real outbound sale with no Apex invoice matched.',null),
('stale_coa','document','warning',false,null,'coa_valid_days','A certificate older than the allowed window on material still held.','Needs an owner ruling on how long a COA stays valid for sale. No guessed default — the OS will not invent a compliance window.'),
('stale_manifest','document','warning',false,null,'transfer_settle_hours','A transfer that never completed inside its settling window.','The settling window is owner-set and must not be inferred from how long the stuck ones have sat (recorded on the on-a-truck contract).'),
('stale_invoice','sales','warning',false,null,'invoice_due_hours','A shipped sale still uninvoiced after X hours.','Needs the owner hour threshold. Today every uninvoiced sale is caught by missing_invoice regardless of age.'),
-- CHAIN
('metrc_chain_mismatch','chain','critical',true,'v_tag_gap rule G',null,'Certificate and lineage disagree on whose material a tag is.',null),
('orphan_tag','chain','critical',true,'v_tag_gap rule D',null,'A package in the mirror with no event history at all.',null),
('orphan_event','chain','warning',true,'v_tag_gap rule N',null,'An event whose tag exists in no mirror we hold.',null),
('orphan_document','chain','warning',true,'v_tag_gap rule O',null,'A certificate or manifest that links to no tag we hold.',null),
-- LIFECYCLE
('location_gap','lifecycle','warning',true,'v_tag_gap rule E',null,'A package sitting in a room no movement event records it entering.',null),
('timestamp_gap','lifecycle','warning',true,'v_tag_gap rule F',null,'A stay that ends before it begins, or a closed stay of zero hours.',null),
('overlapping_lifecycle','lifecycle','critical',true,'v_tag_gap rule P',null,'One tag recorded in two rooms at the same moment.',null),
('missing_room_assignment','lifecycle','warning',true,'v_tag_gap rule Q',null,'Live material with no room recorded — it cannot be walked to.',null),
('missing_lifecycle_start','lifecycle','warning',false,null,null,'A stage entered with no start timestamp.','Stays are derived from events, so a stay cannot exist without its start event. Structurally impossible today; kept declared in case the ledger ever takes direct writes.'),
('missing_lifecycle_end','lifecycle','info',false,null,null,'A stage left with no end timestamp.','The open stay IS the current location by design — an absent end is the normal state, not a gap.'),
-- INVENTORY
('negative_inventory','inventory','critical',true,'v_tag_gap rule R',null,'Computed quantity below zero — impossible physically.',null),
('unit_mismatch','inventory','warning',true,'v_tag_gap rule S',null,'One tag carrying two different units of measure across its events.',null),
('duplicate_tag','inventory','warning',true,'v_tag_gap rule T',null,'The same tag mirrored under two licences — the cross-licence twin.',null),
('duplicate_package','inventory','warning',false,null,null,'The same package recorded twice under different ids.','A package IS its tag here, so duplicate_tag covers it. Declared separately because the owner named it; it will fire if the two ever diverge.'),
('duplicate_lot','inventory','warning',false,null,null,'The same lot recorded twice.','Lot is not yet a first-class object in this build (master build §6 PARTIAL).'),
('inventory_mismatch_os_metrc','inventory','critical',false,null,null,'OS quantity against Metrc quantity per tag.','The OS quantity IS the Metrc mirror today — one road, so the check cannot fail. It becomes real the moment the OS holds its own computed position from events.'),
('inventory_mismatch_os_apex','inventory','critical',false,null,null,'OS position against Apex inventory.','Apex inventory endpoints are not yet synced; only sales are.'),
('inventory_mismatch_os_quickbooks','inventory','critical',false,null,null,'OS revenue against QuickBooks revenue.','QuickBooks is not yet connected.'),
('stale_inventory','inventory','warning',false,null,'reconciliation_due_hours','No reconciliation run inside the expected window.','Covered today by the matview freshness watcher; will be raised here when the reconciliation log lands.'),
-- CULTIVATION
('potency_gap','cultivation','critical',true,'v_strain_gate → f_raise_gap_alerts','strain_min_thc_percent','A strain whose FLOWER certificates average below the owner floor.',null),
('yield_gap','cultivation','warning',true,'v_tag_gap rule U',null,'A strain averaging below its owner-set minimum yield per plant.',null),
('harvest_under_target','cultivation','warning',true,'f_raise_gap_alerts','required_lb_per_pull','A closed harvest that packaged less than the minimum per pull.',null),
('harvest_over_cycle','cultivation','warning',true,'f_raise_gap_alerts','flower_cycle_days','A harvest still open past the cycle length.',null),
('harvest_schedule_drift','cultivation','info',false,null,null,'Planned harvest date against actual, beyond tolerance.','Needs the auto-generated harvest plan (master build §9 NOT BUILT) to have a planned date to drift from.'),
('missing_strain_config','cultivation','info',true,'v_tag_gap rule V',null,'A strain being grown with no owner yield target set.',null),
('stale_strain','cultivation','info',false,null,null,'A strain with no harvest inside its expected cycle.','Needs the room rotation declared so "expected" has a meaning.'),
('stale_room','cultivation','warning',false,null,null,'A room with no harvest inside its expected cycle.','Same dependency: the 4-room rotation is a rule now but rooms are not yet assigned to it.'),
-- SALES / TRANSFER
('sale_without_package','sales','critical',false,null,null,'A sale line naming no package.','Every sale line in this build is derived FROM a package tag, so it cannot exist without one. Declared for the day sales arrive from Apex independently.'),
('transfer_without_manifest','transfer','critical',true,'v_tag_gap rule B',null,'Same detector as missing_manifest, kept under the owner name.',null),
('transfer_qty_mismatch','transfer','critical',false,null,null,'Manifest quantity against package quantity.','Manifest line quantities are parsed for some manifests only; running it on partial coverage would report absence as mismatch.'),
('stale_tag','lifecycle','info',true,'v_tag_gap rule W','stale_tag_days','Live material with no event of any kind for a long time.',null),
('stale_package','lifecycle','info',false,null,null,'A package with no movement in X days.','Same population as stale_tag in this build; kept declared so it can diverge when plants and packages separate.'),
('stale_lot','document','info',false,null,null,'A lot with no COA in X days.','Lot is not yet a first-class object.'),
('stale_document','document','info',false,null,null,'A document not linked to a tag within X hours of arriving.','Needs the document ingestion timestamp (arrival) which coa_extract does not record separately from report_date.'),
('stale_transfer','transfer','warning',false,null,null,'A transfer open past its settling window.','Duplicate of stale_manifest; same missing owner threshold.'),
('stale_sale','sales','warning',false,null,null,'A sale not invoiced after X hours.','Duplicate of stale_invoice; same missing owner threshold.')
on conflict (gap_type) do update set
  family=excluded.family, severity=excluded.severity, detects=excluded.detects,
  detector=excluded.detector, threshold_key=excluded.threshold_key,
  what_it_catches=excluded.what_it_catches, why_not_yet=excluded.why_not_yet;

insert into public.conversion_factors (key, value, unit, label, what_it_means, where_it_came_from, set_by)
values ('stale_tag_days', 180, 'days', 'Silent tag alert',
        'How long live material may sit with no event of any kind before the OS raises it. Not the same as ageing stock: this is about the RECORD going quiet, not the product getting old.',
        'Agent I default during the gap registry build, 19 Aug 2026 — owner-changeable.', 'Agent I')
on conflict (key) do nothing;

grant select on public.settings, public.gap_rule to authenticated;;
