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
  out.push("- HANDOFF.md defect D5 says Lab Results were never imported. They HAVE been:");
  out.push("  metrc_rpt_lab_results holds ~39,500 staged rows. But lab_result_values and");
  out.push("  coa_documents are both EMPTY, so the gap is staging -> canonical, not the import.");
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
