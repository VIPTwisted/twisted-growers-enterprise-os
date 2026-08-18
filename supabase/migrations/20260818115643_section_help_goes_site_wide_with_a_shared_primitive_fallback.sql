/* The ⓘ help goes site-wide: every dashboard explained, one fallback convention.
 *
 * Owner, 18 Aug 2026: "ⓘ help explaining what they mean SITE WIDE FOR USERS — ADD THIS
 * SITE." Command already had seven entries; the other dashboards had none.
 *
 * THE FALLBACK CONVENTION, so shared primitives need ONE row, not eleven copies:
 * the front end resolves (page, section_key) exactly first, then ('*', section_key).
 * Page-specific entries exist only where the meaning genuinely differs — the same rule
 * as share primitives, never layouts. Eleven near-identical copies of "what is a KPI
 * strip" would drift into eleven different explanations.
 */

comment on table public.section_help is
  'One row per dashboard section, holding the ⓘ text. RESOLUTION ORDER for the front '
  'end: exact (page, section_key) first, then the wildcard (''*'', section_key) for '
  'shared primitives — one definition, no copies to drift. how_to_read must be at least '
  '40 characters; common_misreading is the field that earns the question mark. Owner '
  'request 17-18 Aug 2026. Agent I.';

insert into public.section_help
  (page, section_key, title, what_it_shows, how_to_read, common_misreading, source_note) values

/* ── shared primitives, one definition each ─────────────────────────────────── */
('*','kpi_strip','The key-figure strip',
 'The department''s headline figures, each against the target upper management set.',
 'Every figure here is a POSITION — what is true right now, stamped with the age of the '
 || 'data top right. Green meets its target, red breaches it. Click any tile to open the '
 || 'exact records behind the number; the tile and its drilldown are checked against each '
 || 'other by a standing guard, so if they ever disagree the platform flags itself.',
 'Expecting these to change with the date range. A position cannot be ranged — "on hand '
 || 'between January and August" is not a number. The range governs the flow sections.',
 'mv_department_dashboard, refreshed every 10 minutes with a self-healing watcher.'),
('*','findings_panel','Open findings',
 'Everything the platform''s checks have flagged for this department and not yet had a '
 || 'decision recorded against.',
 'A finding stays open until someone records fix, leave, ignore or reset — with a written '
 || 'reason. Ignoring is a decision, not a deletion. Findings are retired by fixing '
 || 'CAUSES: a handful of causes usually carry most of the queue.',
 'Reading a rising count as things getting worse. Every disagreement becomes a named '
 || 'finding within the hour, so more found often means better watched, not more broken.',
 'watchdog_findings, agent_findings and the item-flag pipeline, routed by finding_lane_owner.'),
('*','drill_table','The records behind a number',
 'The exact rows a tile or figure was computed from — never a re-estimate, the same data.',
 'Every tag in these tables opens its full seed-to-sale dossier: six dated stages, the '
 || 'COA document, the manifest document, the Apex invoice where one exists, and the room '
 || 'in the facility where it can be physically audited.',
 'Assuming a drill total can differ from the tile for a good reason. It cannot — tile and '
 || 'drill are contract-checked; any gap beyond recorded rounding is a defect the platform '
 || 'reports on itself.',
 'v_tag_lifecycle is the terminal record for every tag.'),
('*','data_age','The data-age stamp',
 'How old the computed figures on this page are.',
 'This is the age of the DATA, not the page load. Refreshing the browser does not change '
 || 'it; the scheduled recompute does, every 10 minutes, healed within 45 if it fails.',
 'Refreshing the page to make the number current.',
 'computed_at on the backing view, watched by v_matview_health.'),
('*','date_range','The date chips',
 'The window every flow section on the page reports over.',
 'Changing the range re-queries the whole page. Flow figures — harvested, packaged, sold, '
 || 'invoiced, samples, findings — move with the window. Position figures show as-of now '
 || 'and say so.',
 'Expecting stock-on-hand to change with the range; positions are as-of, flows are ranged.',
 'tg_command_range and tg_period_narrative, both live.'),

/* ── the pages, where meaning is page-specific ──────────────────────────────── */
('cultivation','page','The Cultivation dashboard',
 'Rooms, cycles and harvests against the rules upper management set: 2 pulls a month, '
 || '180 lb required per pull, tables maximized, 56-day room cycle.',
 'Every room is measured live from Metrc against the rule — cycle length, plants '
 || 'standing, next pull due. An open harvest is one BATCH PER STRAIN, open until every '
 || 'gram is packaged out; one takedown of a six-strain room creates six of them.',
 'Reading "open harvests" as takedowns in progress. 28 open batches came from 11 pulls; '
 || 'what is open is usually the RECORD, not the crop — the room has been replanted.',
 'metrc_harvests and v_harvest_cycle_compliance; rules from conversion_factors, live.'),
('inventory','page','The Inventory dashboard',
 'Everything held, split by stream — dried flower, fresh frozen, shake and trim, '
 || 'concentrate, pre-rolls, vape — with weight-based and each-based items kept apart.',
 'One row per physical package everywhere: a package moving between our own licences is '
 || 'counted once. Fresh frozen is held at WET weight; dry-equivalent figures divide it by '
 || 'the configured ratio (4.5, changeable in Business Rules). Ageing is judged per '
 || 'package against its category policy — seeds and concentrate do not age, and material '
 || 'in Quarantine or the freezer is held on purpose.',
 'Adding wet fresh frozen to dry flower. They never sum: 418.3 lb wet is 92.9 lb dry.',
 'v_stock_on_hand, v_stock_ageing, stock_ageing_policy, holding_room.'),
('quality','page','The Quality dashboard',
 'Testing state of everything held: certificates, missing results, failed material.',
 'Potency comes from a COA, never from the strain registration (those 25/30 figures are '
 || 'Metrc registration defaults). Flower samples were 7 g until Q2 2025 and 12 g since — '
 || 'the size changed with the laboratory, both are correct for their period. A sample '
 || 'with no result on record is a question for the lab, not proof of a compliance gap.',
 'Treating an inherited certificate as a contradiction. Untested intermediate product '
 || 'made from tested material inherits its evidence — that is expected, not a finding.',
 'v_tag_evidence, v_lab_samples_out, v_never_tested_reconciliation.'),
('sales','page','The Sales & Cash dashboard',
 'Orders, shipments and money — Apex is the record for sales and invoices, Metrc for the '
 || 'manifests that moved the goods.',
 'LEAVING IS NOT SELLING: internal moves between our own licences, laboratory samples '
 || 'and transport legs are excluded from every revenue figure. Each shipped tag shows its '
 || 'manifest, its Apex invoice where one exists, and a worded reason where one does not. '
 || 'The Metrc-Apex reconciliation gives every outbound tag a verdict, watched daily with '
 || 'a ratchet that only tightens.',
 'Reading "pounds shipped" as revenue. Of 22,795.7 lb that left, 11,595.4 lb was sold; '
 || 'the rest is internal moves, samples and haulage.',
 'v_forensic_sold_by_tag (counts_as_sale), v_metrc_apex_tag_reconciliation, v_outbound_balance.'),
('metrc','page','The Metrc dashboard',
 'The health of our mirror of the state''s record: syncs, report imports, and every '
 || 'difference between what Metrc holds and what this platform shows.',
 'Metrc is the record of fact and this platform NEVER writes to it — corrections are '
 || 'made in Metrc by a person following step-by-step instructions, then synced back. '
 || 'Every sync run is logged with its outcome; failures email hourly 07:00-18:00. A '
 || 'report import records every rejected row with its reason.',
 'Treating a mirror difference as Metrc being wrong. Metrc wins by definition; a '
 || 'difference is our sync or our reading, and the reconciliation views say which.',
 'v_all_sync_runs, metrc_report_catalog, metrc_report_field_map, v_cross_source_reconciliation.'),
('mfg','page','The Manufacturing dashboard',
 'Concentrates, conversions and material held at the MP licence.',
 'Bulk concentrate is shelf-stable and does not age; what matters is remnants — grams '
 || 'left on worked-down tags that should be finished out — and the wet-to-dry conversion '
 || 'at the configured ratio wherever fresh frozen enters a run.',
 'Counting material in transit from MC as already here. In-transit is ours until the '
 || 'destination accepts, and one row per tag means it is never counted on both sides.',
 'v_stock_on_hand, conversion_factors, v_onhand_by_room_stage.'),
('preroll','page','The Infused Pre-Rolls & Flower dashboard',
 'Pre-roll production: shake and trim available, units made, infusion runs.',
 'Pre-rolls are FINISHED FLOWER and age like it — 180 days. Units and pounds never mix: '
 || 'a pre-roll is counted by the each, its input by weight.',
 'Summing pre-roll units with flower pounds. They are different measures and every view '
 || 'keeps them apart.',
 'v_stock_on_hand streams Pre-rolls and Shake and trim.'),
('finance','page','The Finance dashboard',
 'Cash position, invoice status and the money side of every shipment.',
 'Money figures come from Apex — the invoice, not the Metrc declared transfer price, '
 || 'which is a regulatory filing that legitimately differs from what was sold. The '
 || 'reconciliation explains every difference or holds it open as an exception.',
 'Treating Metrc''s declared value as revenue. It is a filing; the invoice is the money.',
 'mv_forensic_sales, v_manifest_reconciliation, reconciliation_exception.'),
('hr','page','The Human Resources dashboard',
 'People, roles and what each seat may see and do.',
 'Access is enforced in the database itself — a role without a policy sees nothing, and '
 || 'that blankness is the honest answer, fixed by granting the role, never by opening '
 || 'the data.',
 'Reading a blank page as a bug. It is usually a permission working as designed.',
 'app_users, role policies, v_role_menu_matrix.'),
('workspace','page','The Workspace dashboard',
 'Tasks, notes and the working surface shared across the team.',
 'Anything here can reference a tag, a manifest or a finding, and those references open '
 || 'the same forensic dossiers as everywhere else — one definition of every record.',
 'Treating workspace notes as a second record of fact. They annotate the record; Metrc '
 || 'and Apex remain the sources.',
 'tasks, entity notes, location_note.'),
('settings','page','The Settings dashboard',
 'Business rules, keys, integrations and who may change what.',
 'Every rule here — pull weights, cycle days, ratios, targets, sample sizes — takes '
 || 'effect across the ENTIRE OS the moment it is saved, like any setting in QuickBooks: '
 || 'every consumer reads the rule live and there is no copy anywhere to go stale. Keys '
 || 'are stored server-side and can never be read back into a browser.',
 'Expecting a rule change to need a deploy or a refresh elsewhere. It does not; the next '
 || 'render everywhere carries the new value.',
 'conversion_factors via f_rule(), kpi_targets, app_secrets — all read live.')
on conflict (page, section_key) do update
  set title = excluded.title, what_it_shows = excluded.what_it_shows,
      how_to_read = excluded.how_to_read, common_misreading = excluded.common_misreading,
      source_note = excluded.source_note, updated_at = now();;
