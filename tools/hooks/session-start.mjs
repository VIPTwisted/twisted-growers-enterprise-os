#!/usr/bin/env node
/* SessionStart hook — force-feeds the rules into every agent, whatever folder it opened.
 *
 * Why this exists: CLAUDE.md only auto-loads when the project folder itself is opened. An
 * agent launched from the Desktop redirect stub starts with NO rules at all — that happened
 * on 7 Aug 2026 and it is exactly how the rules quietly stop being followed. The harness runs
 * this hook, not the model, so an agent cannot skip it.
 *
 * Prints to stdout; Claude Code adds stdout to the session context.
 * ALWAYS exits 0. A session-start hook must never be able to block a session.
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => (existsSync(join(ROOT, p)) ? readFileSync(join(ROOT, p), "utf8") : null);

try {
  const out = [];
  out.push("=".repeat(78));
  out.push("TWISTED GROWERS ENTERPRISE OS — MANDATORY RULES, INJECTED BY HOOK");
  out.push("You are working on a system that runs a licensed Massachusetts cannabis company.");
  out.push("Metrc is the legal record. This platform is a READ-ONLY MIRROR of it.");
  out.push("=".repeat(78));

  const claude = read("CLAUDE.md");
  if (claude) {
    out.push("");
    out.push("### CLAUDE.md — the single source of truth for RULES (full text follows)");
    out.push(claude.trim());
  } else {
    out.push("");
    out.push("!! CLAUDE.md COULD NOT BE READ. Stop and tell the user before changing anything.");
  }

  /* Deliberately NOT the whole of HANDOFF.md: it is long, and parts of it are known to be
     wrong. Point at it, and correct the claims that would mislead an agent on day one. */
  out.push("");
  out.push("### STATE — read HANDOFF.md for detail, but these corrections override it");
  out.push("Verified against the live system on 7 August 2026:");
  out.push("");
  out.push("- HANDOFF.md section 6 claims 'Anon access: 0 views readable'. That WAS false —");
  out.push("  30 relations were readable by anon, including customers, manifests and wholesale");
  out.push("  money. A mass revoke has since cut anon reads to 2 (nav_registry,");
  out.push("  nav_role_visibility) and anon-executable writing functions from 33 to 2.");
  out.push("- HANDOFF.md defect D4 says the front end is NOT deployed. It IS deployed.");
  out.push("- HANDOFF.md defect D5 says Lab Results were never imported. They HAVE been, and");
  out.push("  POTENCY IS LIVE (corrected 7 Aug, this line previously understated it):");
  out.push("  metrc_lab_results holds 101,608 rows across 2,642 packages, and v_lab_results");
  out.push("  reads it DIRECTLY - returning total_thc, total_terpenes, coa_expires and");
  out.push("  total_thc_source ('Metrc' or 'COA - Metrc holds no result') on every row.");
  out.push("  lab_result_values and coa_documents stay EMPTY BY DECISION - one home per");
  out.push("  figure. Do not populate them. 983 COAs and 2,690 manifests are stored with");
  out.push("  signed links; f_package_documents(tag) serves both.");
  out.push("- HANDOFF.md counts are stale. Do not trust a number in it without re-measuring.");
  out.push("- The desktop bridge is currently BROKEN: it authenticates with the publishable");
  out.push("  anon key and lost its grants in the revoke. Do NOT re-grant anon to fix it.");
  out.push("");
  out.push("Full analysis: docs/AUDIT_2026-08-07_SENIOR_REVIEW.md");
  out.push("Lane ownership:  docs/AGENT_WORK_DIVISION_AND_WATCHDOG.md");

  out.push("");
  out.push("### LANES — do not edit another party's artefacts");
  out.push("- Agent B owns app/web/src/**  (every front-end file)");
  out.push("- Agent A owns metrc_rpt_*, tg_import_*, tg_map_*, tg_agentmapper_*, sheet_*,");
  out.push("  coa_*, lab_result*");
  out.push("- Watchdog owns .claude/**, CI config, the test harness, and ALL GRANT/REVOKE/RLS");
  out.push("Announce before touching: watchdog_findings, conversion_factors, matviews, cron.");

  out.push("");
  out.push("### THE FIVE THAT HAVE ACTUALLY BROKEN THIS SYSTEM BEFORE");
  out.push("1. `drop view ... cascade` blanked every dashboard three times. Use CREATE OR REPLACE.");
  out.push("2. Anchoring a scripted edit on a common line (`const [busy, setBusy]`) put state in");
  out.push("   the wrong component three times. Anchor on the function signature.");
  out.push("3. Comparing figures without checking units gave an answer wrong by a factor of six.");
  out.push("4. Presenting an unsourced benchmark as fact. Everything carries provenance.");
  out.push("5. `count(*)` on an aggregate view returns group count, not packages. Use sum().");
  out.push("");
  out.push("### RULE ZERO (owner, 7 Aug 2026) — outranks everything, including 'move fast'");
  out.push("NEVER DO ANYTHING THAT CAN BREAK SYSTEM. Measure before you change. Verify after.");
  out.push("If a change cannot be undone, it needs the owner. Slow is fine. Broken is not.");

  out.push("");
  out.push("### THE META-TRAP — the one that has cost most");
  out.push("A DECISION RECORDED IS NOT A DECISION IMPLEMENTED. Sales endpoints were");
  out.push("'permanently disabled' on 6 Aug and were still firing 401s a day later. Nine sync");
  out.push("rules were drafted and never merged. An agent row read 'disabled' in its own");
  out.push("description while enabled stayed true. A finding is NOT CLOSED until something in");
  out.push("code, config or a check enforces it. When you close one, NAME THE GUARD. If there");
  out.push("is no guard, say so plainly in the finding - an unguarded fix expires.");

  out.push("");
  out.push("### BEFORE YOU TOUCH DATA — read brain/DATA_TRAPS_REGISTER.md");
  out.push("Every trap in it has already cost real money. The five that bite most often:");
  out.push("- A summary/footer row is not a transaction. One added $1,692,460 of fabricated");
  out.push("  revenue and was quoted to the owner before anyone checked.");
  out.push("- $0.01 placeholder prices: in metrc_rpt_wholesale they aggregate to $0.02/$0.03,");
  out.push("  so filter >= 1.00, NEVER > 0.01. ~319 lines dragged a price from $807 to $363.");
  out.push("- Repackaged material keeps the original harvest name. Counting it inflates");
  out.push("  production up to 142%. Primary production = SourcePackageCount = 0.");
  out.push("- Catalogue row counts are ESTIMATES. reltuples reads 0 on small tables. ALWAYS");
  out.push("  select count(*). Five populated tables were reported empty this way on 7 Aug.");
  out.push("- A custody movement is not a sale. Storage/transporter destinations booked");
  out.push("  $901,430 as revenue. A transporter (MT) licence destination is NEVER a sale.");

  out.push("");
  out.push("### HOW TO FIX — the protocol, every time");
  out.push("1 Measure first, record the number. 2 ONE change, not three. 3 Measure again with");
  out.push("the same query and report BOTH numbers. 4 Know the undo before you start and state");
  out.push("it. 5 Verify the thing you did NOT touch - 129 read sites swallow errors as ?? [],");
  out.push("so a blank dashboard is the classic silent failure. 6 Stay in your lane; out-of-lane");
  out.push("findings go to actions_register or a work order, never a quiet fix. 7 If you cannot");
  out.push("verify it, DO NOT DO IT - report instead.");

  out.push("");
  out.push("### WHEN IT BREAKS — brain/RUNBOOK_RECOVERY.md");
  out.push("Symptom-by-symptom recovery: blank dashboards, bad deploy, bad import (tg_import_undo");
  out.push("is proven), sync stopped, wrong number, schema change. FIRST TEST ALWAYS: is it broken");
  out.push("or is it EMPTY? 43 of 236 pages are legitimately empty. Check canary_runs, not the page.");

  out.push("");
  out.push("### THE PLAN — brain/PROJECT_PLAN.md");
  out.push("Five phases with exit tests. Phase 0 (make it safe to change: staging, wire the guards");
  out.push("already written, attribution) is NOT STARTED and blocks the rest. Phase 2 (the platform");
  out.push("is 100% READ-ONLY - not one order, weight or approval can be created) is the unlock.");
  out.push("brain/INDEX.md maps everything the platform has learned. Read it before investigating.");

  out.push("");
  out.push("A tile without a drill-down is not finished. A number without provenance is a guess.");
  out.push("THE THEME IS LOCKED: neon green, zero purple. styles.css and rules.css are");
  out.push("write-protected by a hook. If your task seems to need a theme change, STOP and ask.");
  out.push("=".repeat(78));

  process.stdout.write(out.join("\n") + "\n");
} catch (err) {
  /* Never block a session because the reminder failed. Say so and carry on. */
  process.stdout.write(
    "SessionStart hook could not read the rule files (" + err.message + "). " +
    "Read CLAUDE.md and HANDOFF.md manually before changing anything.\n"
  );
}
process.exit(0);
