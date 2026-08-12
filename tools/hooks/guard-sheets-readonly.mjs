#!/usr/bin/env node
// tools/hooks/guard-sheets-readonly.mjs — Agent I, 12 Aug 2026.
//
// OWNER HARD RULE, verbatim, given four times in one minute:
//   "THESE MUST SYNC EFFECTIVE TODAY"
//   "HARD RULE NOT TO BE EVER CHANGED; OR EDITED. CAN I RESTRICT AFTER YOU SYNC"
//   "HARD RULE IS: VIEW ONLY FOR ALL OUR SPREADSHEETS"
//   "PUT HARD RULE IN OUR SYSTEM VIEW AND SYNC ONLY"
//
// TWO VERBS ARE PERMITTED. **VIEW** a sheet to answer a question. **SYNC** it into the database
// so the platform mirrors it. There is no third verb. This hook blocks the third verb at the tool
// call, before it reaches Google.
//
// WHY A HOOK AND NOT A NOTE. The rule already lives in v_house_rules and is printed to every agent
// before its first token. That stops an agent that reads. It does not stop an agent that is
// three hours into a task, holds an edit-capable credential, has just proved a cell is wrong, and
// reasons that correcting it is helpful. That agent is the realistic threat, and only a guard
// stops it. A rule with no guard is a suggestion.
//
// WHY IT MATTERS MORE THAN IT LOOKS. These sheets are maintained by people in the building and
// they are the system of record for finished goods, cultivation inventory and the entire cost
// model. If the platform writes back a "corrected" figure, the sheet and the database become two
// authorities on one number and neither can be trusted again — the exact drift the owner has
// spent the day stamping out. A wrong cell is fixed by a person, after a correction_proposal.
//
// SCOPE. Blocks Drive/Sheets WRITE tools outright, and blocks any command that pushes to a Google
// Sheets endpoint. Read tools are untouched: get_file_metadata, read_file_content, search_files
// and list_recent_files all pass, because VIEW and SYNC both need them.
//
// FAILS OPEN ON ITS OWN ERRORS, CLOSED ON A MATCH. If the hook cannot parse its input it allows
// the call and says so — a guard that blocks work because it broke is worse than the risk. But a
// positive match is always a block.
//
// EXIT CODES. 0 = allow. 2 = block, with the reason on stderr for the agent to read.

import { readFileSync } from 'node:fs';

let payload = '';
try {
  payload = readFileSync(0, 'utf8');
} catch {
  process.exit(0); // no stdin — nothing to judge
}

let hook;
try {
  hook = JSON.parse(payload);
} catch {
  process.stderr.write('guard-sheets-readonly: could not parse hook input; allowing.\n');
  process.exit(0);
}

const toolName = String(hook.tool_name ?? hook.toolName ?? '');
const input = hook.tool_input ?? hook.toolInput ?? {};
const blob = JSON.stringify(input ?? {}).toLowerCase();

// Drive / Sheets mutation verbs. Matched on the tool NAME, which no prompt can disguise.
const WRITE_VERBS = [
  'create_file', 'create_new_file', 'copy_file', 'move_file', 'delete_file',
  'update_file', 'write_file', 'append', 'batchupdate', 'batch_update',
  'upload', 'set_file', 'edit_file', 'add_sheet', 'update_values', 'clear_values',
];
const isDriveTool = /drive|sheet|spreadsheet|gdrive|google/i.test(toolName);
const isWriteVerb = WRITE_VERBS.some((v) => toolName.toLowerCase().includes(v));

// A shell command that pushes at the Sheets or Drive write API.
const SHELL_TOOL = /^(bash|powershell|shell|run_command|start_process|execute_command)$/i;
const pushesAtGoogle =
  SHELL_TOOL.test(toolName) &&
  /(sheets|drive)\.googleapis\.com/.test(blob) &&
  /(-x\s*(post|put|patch|delete)|--request\s*(post|put|patch|delete)|:batchupdate|values\/[^"']*:(append|update|clear))/i.test(blob);

function block(what) {
  process.stderr.write(
    '\n' + '='.repeat(78) +
    '\nBLOCKED — VIEW AND SYNC ONLY. Owner hard rule, 12 Aug 2026.\n' +
    '='.repeat(78) +
    `\n\nAttempted: ${what}\n\n` +
    'Two verbs are permitted on a company spreadsheet and no others:\n' +
    '  VIEW — read it to answer a question.\n' +
    '  SYNC — copy it into the database so the platform mirrors it.\n\n' +
    'There is no third verb. No cell update, no appended row, no new tab, no formatting\n' +
    'change, no writing back a corrected figure — not even one you can PROVE is wrong.\n\n' +
    'These sheets are the system of record and people in the building maintain them. If the\n' +
    'platform writes back, the sheet and the database become two authorities on one number\n' +
    'and neither can be trusted again.\n\n' +
    'WHAT TO DO INSTEAD: file it through correction_proposal — the issue, the evidence, what\n' +
    'needs fixing, what you propose, why it is the fix, and how it never repeats. A person\n' +
    'then corrects the sheet. The owner decides, not you.\n\n' +
    'Registry of these sheets, with their parse traps: select * from sheet_source;\n' +
    'The rule in full: select * from v_house_rules where rule_key like \'%view%\';\n' +
    '='.repeat(78) + '\n'
  );
  process.exit(2);
}

if (isDriveTool && isWriteVerb) block(`${toolName} — a Drive/Sheets write tool`);
if (pushesAtGoogle) block(`${toolName} — a shell call posting to the Google Sheets/Drive write API`);

process.exit(0);
