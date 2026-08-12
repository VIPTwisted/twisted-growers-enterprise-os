-- Agent I, 12 Aug 2026. DBI-068. Two owner rulings, both HARD, recorded as rules so they reach
-- every agent through v_house_rules at session start.

insert into conversion_factors (key, value, unit, label, what_it_means, where_it_came_from, set_by, evidence_status)
values

('spreadsheets_are_view_only_forever','1','rule',
 'VIEW ONLY FOR ALL OUR SPREADSHEETS — never changed, never edited, by anything we build',

 'The company''s spreadsheets are a SYSTEM OF RECORD maintained by people in the building. The '
 'platform, every agent and every automation reads them and NEVER writes to them — no cell '
 'update, no appended row, no new tab, no formatting change, not even a correction to something '
 'we can prove is wrong. If a sheet contains an error, FILE IT through correction_proposal and '
 'let a person fix it in the sheet. Writing back would make the platform and the sheet two '
 'authorities on one figure, which is exactly the drift every other rule here exists to prevent. '
 'The owner may safely restrict our Drive access to Viewer: read-only is all any sync needs, and '
 'if a credential ever gains edit rights it must be reduced, not used. His own team keep their '
 'edit rights — the restriction is on US, not on them. See sheet_source for the registry of which '
 'sheets these are and the parse traps in each.',

 'Owner ruling 12 Aug 2026, three statements in one minute: "THESE MUST SYNC EFFECTIVE TODAY", '
 '"HARD RULE NOT TO BE EVER CHANGED; OR EDITED. CAN I RESTRICT AFTER YOU SYNC", and "HARD RULE '
 'IS: VIEW ONLY FOR ALL OUR SPREADSHEETS". Consistent with his standing inventory rule from 7 Aug '
 '2026: "no manual edits allowed from OS must be made only on spreadsheet this is for reporting '
 'and planning."',
 'Owner (Vinny)', 'owner_set'),

('build_to_the_sophistication_of_the_sheets','1','rule',
 'The sheets are the standard to build to, and the material to learn from',

 'The owner''s three spreadsheets are more sophisticated than most of what the platform has '
 'shipped: the manufacturing production worksheet computes a per-gram cost for every product '
 'form from run sizes, yields and labour, with moisture correction and named editable '
 'assumptions; the inventory sheets carry a three-tag Metrc chain per row, physical inventory '
 'checks signed with initials and a date, expiry flags, reorder thresholds and certificate links. '
 'ANY surface the platform builds over these domains must be at least as capable as the sheet it '
 'mirrors — never a thinner summary of a richer source. Before building in any of these areas, '
 'READ THE SHEET FIRST: it encodes how this company actually operates, including the batch sizes '
 '(6,810 g = 15 lb standard, 27,240 g = 60 lb fresh frozen), the cost structure, and the '
 'operational vocabulary. Where a sheet and the platform disagree on a method, the sheet is the '
 'better teacher until the owner rules otherwise.',

 'Owner ruling 12 Aug 2026, verbatim: "ALL OF THESE MUST BE BUILT AS SOPHISTICATED AS THESE '
 'SHEETS ARE. ALL AGENTS MUST TRAIN AND LEARN OFF THEM HARD RULE." Given alongside "I WANT THE '
 'MOST ADVANCE TRICKOUT BUILD FOR INVNETOY THAT IS FINISHED FOR OUR SALES TEAM."',
 'Owner (Vinny)', 'owner_set')

on conflict (key) do update set
  label = excluded.label, what_it_means = excluded.what_it_means,
  where_it_came_from = excluded.where_it_came_from, set_by = excluded.set_by,
  evidence_status = excluded.evidence_status, updated_at = now();;
