#!/usr/bin/env node
/* PreToolUse hook on Edit / Write / NotebookEdit.
 *
 * Turns two owner rules from things people are asked to remember into things the tooling
 * refuses:
 *   - THE THEME IS LOCKED (CLAUDE.md rules 9 and I1). styles.css and rules.css are
 *     write-protected. The owner restated this on 7 Aug 2026 as a hard rule.
 *   - LANE OWNERSHIP. Three parties work on one repo. Topic-based ownership already failed;
 *     artefact ownership is enforced here, but only when TG_AGENT says who is asking.
 *
 * Contract: read the tool call as JSON on stdin. Exit 2 to BLOCK (stderr is shown to the
 * agent). Exit 0 to allow. On ANY unexpected error, exit 0 — a broken guard must not be able
 * to freeze all work. It fails closed on real violations and open on its own bugs.
 */
let raw = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (c) => (raw += c));
process.stdin.on("end", () => {
  try {
    check(JSON.parse(raw || "{}"));
  } catch {
    process.exit(0); // unparseable input is our problem, not the agent's
  }
});

/* Files nobody may write without an explicit, deliberate override. */
const THEME_FILES = [/app[\/\\]web[\/\\]src[\/\\]styles\.css$/i, /app[\/\\]web[\/\\]src[\/\\]rules\.css$/i];

/* Lane map, used only when TG_AGENT is set. Watchdog is read-only over other lanes. */
const LANES = {
  b: { allow: [/app[\/\\]web[\/\\]/i], label: "Agent B (front end)" },
  a: { allow: [/supabase[\/\\]/i, /app[\/\\]supabase[\/\\]/i, /docs[\/\\]/i, /tools[\/\\]/i],
       label: "Agent A (imports and database)" },
  watchdog: { allow: [/^\.claude[\/\\]/i, /^\.github[\/\\]/i, /tools[\/\\]/i, /docs[\/\\]/i,
                      /supabase[\/\\]checks[\/\\]/i, /^package\.json$/i, /^eslint\.config\.mjs$/i,
                      /^\.gitleaks\.toml$/i],
              label: "Watchdog (config, CI, checks, docs)" },
};

function block(message) {
  process.stderr.write(message + "\n");
  process.exit(2);
}

function check(payload) {
  const name = payload.tool_name || "";
  if (!/^(Edit|Write|NotebookEdit|MultiEdit)$/.test(name)) process.exit(0);

  const input = payload.tool_input || {};
  const target = input.file_path || input.notebook_path || "";
  if (!target) process.exit(0);

  const rel = String(target).replace(/\\/g, "/").replace(/^.*Claude_Twisted Growers\//, "");

  if (THEME_FILES.some((re) => re.test(rel))) {
    if (process.env.TG_THEME_UNLOCK === "owner-approved") {
      process.stderr.write(
        "THEME FILE UNLOCKED by TG_THEME_UNLOCK. The owner must have approved this explicitly.\n"
      );
      process.exit(0);
    }
    block(
      "BLOCKED — THE THEME IS LOCKED.\n" +
      "  File:  " + rel + "\n" +
      "  Rule:  CLAUDE.md 9 and I1. Neon green is the brand. No colour or theme change\n" +
      "         without explicit owner approval. Restated by the owner as a hard rule on\n" +
      "         7 August 2026.\n" +
      "  Do:    If your task seems to require a theme change, STOP and ask the owner.\n" +
      "         New components must consume EXISTING tokens rather than add colours.\n" +
      "  Override (owner direction only): set TG_THEME_UNLOCK=owner-approved"
    );
  }

  const who = String(process.env.TG_AGENT || "").trim().toLowerCase();
  if (who && LANES[who]) {
    const lane = LANES[who];
    if (!lane.allow.some((re) => re.test(rel))) {
      block(
        "BLOCKED — outside your lane.\n" +
        "  You are: " + lane.label + "\n" +
        "  File:    " + rel + "\n" +
        "  Rule:    docs/AGENT_WORK_DIVISION_AND_WATCHDOG.md section 1. Three parties share\n" +
        "           this repo. Agent B owns app/web/**; Agent A owns the import and database\n" +
        "           surface; Watchdog owns .claude/**, CI and checks. Editing another\n" +
        "           party's artefacts causes duplicate work and merge conflicts — it already\n" +
        "           happened once on 7 August 2026.\n" +
        "  Do:      Ask the owning agent to make the change, or hand them a commit to take."
      );
    }
  }
  process.exit(0);
}
