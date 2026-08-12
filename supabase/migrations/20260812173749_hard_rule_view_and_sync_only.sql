-- Agent I, 12 Aug 2026. DBI-069.
-- OWNER: "PUT HARD RULE IN OUR SYSTEM VIEW AND SYNC ONLY".
-- Restating in his exact words and naming the two permitted verbs explicitly, so no agent can
-- reason its way to a third one. Backed by a PreToolUse guard hook (guard-sheets-readonly.mjs)
-- that blocks the write before it happens - a rule with no guard is a suggestion.

update conversion_factors set
  label = 'VIEW AND SYNC ONLY — the two things we may do to a company spreadsheet, and the only two',
  what_it_means =
 'TWO VERBS ARE PERMITTED AND NO OTHERS. VIEW: read a sheet to answer a question. SYNC: copy it '
 'into the database so the platform mirrors it. Everything else is forbidden — no cell update, no '
 'appended row, no new tab, no formatting change, no formula edit, no "fixing" a value we can '
 'prove is wrong, no writing back a corrected figure after a reconciliation, no creating a new '
 'sheet in the company Drive. If a sheet contains an error, FILE IT through correction_proposal '
 'and a person fixes it in the sheet. Writing back would make the platform and the sheet two '
 'authorities on one number, which is the drift every rule here exists to prevent. The owner may '
 'reduce our Drive access to Viewer at any time and nothing will break: read-only is all a sync '
 'needs. If a credential ever carries edit rights, that is a defect to report, not a capability '
 'to use. His own team keep their edit rights — this binds US, not them. sheet_source is the '
 'registry: file ids, contents and the measured parse traps for each sheet. Never guess a file id.',
  where_it_came_from =
 'Owner rulings 12 Aug 2026, in sequence: "THESE MUST SYNC EFFECTIVE TODAY"; "HARD RULE NOT TO BE '
 'EVER CHANGED; OR EDITED. CAN I RESTRICT AFTER YOU SYNC"; "HARD RULE IS: VIEW ONLY FOR ALL OUR '
 'SPREADSHEETS"; and finally "PUT HARD RULE IN OUR SYSTEM VIEW AND SYNC ONLY". Consistent with '
 'his standing inventory rule of 7 Aug 2026: "no manual edits allowed from OS must be made only '
 'on spreadsheet this is for reporting and planning." ENFORCED, not merely documented: '
 'tools/hooks/guard-sheets-readonly.mjs blocks a write to any registered sheet at the tool call.',
  updated_at = now()
where key = 'spreadsheets_are_view_only_forever';;
