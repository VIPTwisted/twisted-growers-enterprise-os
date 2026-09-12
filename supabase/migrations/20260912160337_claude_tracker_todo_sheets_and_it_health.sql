-- GROK-WHY: Already applied in production as 20260912160337 claude_tracker_todo_sheets_and_it_health.
-- Another desk ran this. Filed here so migration-drift can pass and Top G chrome can ship.
-- Exact SQL from supabase_migrations.schema_migrations.statements. No ledger rewrite. Metrc read-only.

-- Owner, 12 Sep 2026: "put on to do list deployment tracker these items".
-- The spreadsheet certification programme and the IT health page, as pending rows on
-- the board so they age, block, and cannot be forgotten. Section 16 is new. Lane is
-- named in `why` on every row; nothing here is done, nothing here is auto-measured yet.
insert into deployment_check (check_key, section, title, why, kind, severity, expected, status, active, sort_order) values
('sheets.metrc_override', '16 Sheets - to do', 'Metrc''s figure overrides the spreadsheet''s wherever a row resolves to a tag',
 'Owner ruling 12 Sep 2026: on any sheet-vs-Metrc discrepancy Metrc is the record of truth. The figure the OS uses becomes Metrc''s quantity/unit/state; the sheet''s value is kept beside it as a note. A row with no resolvable tag is unresolved, never guessed. Lane: Claude (database).',
 'manual', 'NO-GO', 'tiles use Metrc; sheet value kept as note', 'PENDING', true, 120),
('sheets.discrepancy_rows', '16 Sheets - to do', 'Every sheet-vs-Metrc difference is a logged discrepancy with the details that explain it',
 'One discrepancy_register row per difference (class sheet_vs_metrc): tab, row, tag, sheet value, Metrc value, delta, unit, when each side was read, package state, lab state, pre-fill vs final tag, LastModified, adjustments, transfers. Re-checked hourly; closes itself when the two agree and says so. Lane: Claude.',
 'manual', 'NO-GO', 'every difference logged with evidence', 'PENDING', true, 121),
('sheets.weekly_review', '16 Sheets - to do', 'Sheet discrepancies are reviewed weekly by a team member or Top G, with outcome recorded',
 'A review_due clock (7 days from first seen), reviewer = named team member or Top G, outcome = explained / fixed in sheet / fixed in Metrc / still open, with who and when. Metrc is never edited by the OS to close one. Overdue review is a red row. Lane: Claude (clock, view, board row); Grok (page).',
 'manual', 'NO-GO', 'no discrepancy older than 7 days unreviewed', 'PENDING', true, 122),
('sheets.neon_yellow_highlight', '16 Sheets - to do', 'Discrepant rows and tiles are highlighted neon yellow with the note visible',
 'Owner-approved exception to the locked neon-green theme, for discrepancies only: the row, the tile and the note in neon yellow, with sheet value, Metrc value and the explanation on the row. Lane: Grok (front end), after Bots.',
 'manual', 'WATCH', 'highlight + note on every discrepant row', 'PENDING', true, 123),
('sheets.receipts_and_header_lock', '16 Sheets - to do', 'Every sheet tab has a per-run receipt, a locked header fingerprint and an hourly certificate',
 'Stage 1. sheet_sync_receipt: one row per tab per run (header fingerprint, rows fetched, rows kept, digest, HTTP status, seconds, verdict). Expected header fingerprint stored per tab; a changed header is refused and alerted. Digest at fetch second vs stored, hourly, on the board. v5 of sheet-sync (12 Sep) already refuses a headerless tab and logs per-tab counts; this row is the rest. Lane: Claude.',
 'manual', 'NO-GO', 'receipt + fingerprint + certificate per tab', 'PENDING', true, 124),
('sheets.health_5min_alerts', '16 Sheets - to do', 'Sheet health is checked every 5 minutes and alerts reach owner-configured recipients',
 'Stage 2. A sheet-health job every 5 minutes (headers + row counts vs receipts; full sync every 15 minutes, the owner''s freshness standard). Alerts through alert_outbox to a recipient list the owner edits in the app - never hardwired (owner rule 12 Sep) - re-sent every 5 minutes while open, naming tab, row, header and value. Precondition: alerts.recipients is WARN with one active recipient. Lane: Claude.',
 'manual', 'NO-GO', '5-min check; alerts to configured recipients', 'PENDING', true, 125),
('sheets.bot_action_log', '16 Sheets - to do', 'Every automatic fix and every human decision on a sheet issue sits in one audit trail',
 'Stage 3. it_action_log: what the bot saw, what it did, before/after, evidence; what a human decided, who, why. Auto-fix only where provable (header moved -> re-detect and re-run; shrink -> hold and alert); sharing revoked or Google sign-in needed -> cannot be auto-fixed, alert names who must do what. CEO/CFO/Admin are told every step. Lane: Claude (log); Grok (page).',
 'manual', 'WATCH', 'one trail, bot and human', 'PENDING', true, 126),
('sheets.cultivation_inventory_never_synced', '16 Sheets - to do', 'Cultivation_Inventory_Sheet delivers rows on its twice-daily contract',
 'Registered 11-12 Aug 2026 (tabs Packaged Flower (3.5g), Bulk Flower (SMALLS)); contract twice a day plus on-demand; last_pushed_at NULL - never delivered a row in 32 days, failures 0 because nothing ever ran. The poll path needs a Google sign-in that was never done. Until it delivers, it is a standing alert, not a NULL. Lane: Claude (path + alert); owner (sign-in).',
 'manual', 'NO-GO', 'rows delivered twice daily', 'PENDING', true, 127),
('sheets.cost_calculator_refresh', '16 Sheets - to do', 'The manufacturing Production worksheet (cost calculator) refreshes on a schedule',
 'Loaded once on 12 Aug 2026 into manufacturing_cost_figure; no schedule; never refreshed. Every cost-per-gram figure in the OS is a month old until this runs on the same cadence and receipts as the other tabs. Lane: Claude.',
 'manual', 'WATCH', 'scheduled, receipted', 'PENDING', true, 128),
('sheets.unit_semantics_audit', '16 Sheets - to do', 'Each tab''s unit rule is written down and applied (units x size = grams) before Metrc grams override sheet units',
 'Solventless carries no Total Units column; on-hand is Total Packaged (1.0 g units) so units = grams today. Flower 3.5 g and multi-gram carts will not be equal; the override needs the per-tab rule derived from the Size column, with the arithmetic shown on the row. Needs the owner to confirm any line with a different convention. Lane: Claude; owner confirms.',
 'manual', 'NO-GO', 'per-tab unit rule, shown on the row', 'PENDING', true, 129),
('it.health_page', '16 Sheets - to do', 'One IT health page on the side menu: every sync, AI/bots/extensions, data certification, wiring & mapping, staleness - with an alert-count badge and a full audit trail',
 'Owner, 12 Sep 2026. Database side: v_it_health (one row per subsystem: status, last verified, open issues), v_it_alert_badge (the number on the button), it_action_log (bot + human, one trail) - Claude. Page and badge on the side menu - Grok, after Bots. Reads deployment_check, watchdog findings, data_assertion, freshness policies, v_agent_writes, alert_outbox, the certificates.',
 'manual', 'NO-GO', 'page + badge + trail', 'PENDING', true, 130),
('owner.sheet_review_day', '16 Sheets - to do', 'Owner names the weekly sheet-discrepancy review day',
 'The review clock needs a day. Proposed: Monday 09:00 ET, overdue Tuesday. Owner ruling required.',
 'owner', 'OWNER', 'a named day', 'PENDING', true, 131),
('owner.sheet_unit_conventions', '16 Sheets - to do', 'Owner confirms any product line whose sheet units do not equal units x size in grams',
 'Default rule: sheet units x size (g) = Metrc grams. Any line with a different convention must be named before the override goes live, or its rows stay unresolved. Owner ruling required.',
 'owner', 'OWNER', 'confirmed or named exceptions', 'PENDING', true, 132)
on conflict (check_key) do update set section = excluded.section, title = excluded.title, why = excluded.why, expected = excluded.expected, active = true;

select count(*) filter (where section = '16 Sheets - to do') as todo_rows, count(*) as total_rows from deployment_check where active;
