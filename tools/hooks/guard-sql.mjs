#!/usr/bin/env node
/* PreToolUse hook on anything that can reach the database.
 *
 * Three owner rules, each earned the hard way, enforced mechanically:
 *   E1  Never `drop view ... cascade`. It destroyed mv_department_dashboard THREE times and
 *       blanked every dashboard with no error, because App.jsx swallows the failure.
 *   E6  Never `grant ... to anon`. 36 views once leaked package tags, suppliers and dollar
 *       figures to anyone holding the publishable key.
 *   H2  Forensic tables are append-only and cannot be deleted. On 7 Aug 2026
 *       watchdog_findings silently lost 57 rows with no recorded decision.
 *
 * Scans every string in the tool input, so it covers MCP execute_sql / apply_migration and a
 * psql command typed into Bash alike.
 *
 * Exit 2 blocks and shows stderr to the agent. Exit 0 allows. Any internal error exits 0 —
 * a broken guard must never be able to freeze all work.
 */
let raw = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (c) => (raw += c));
process.stdin.on("end", () => {
  try {
    check(JSON.parse(raw || "{}"));
  } catch {
    process.exit(0);
  }
});

const IMMUTABLE = [
  "watchdog_findings",
  "issue_decisions",
  "cost_input_history",
  "metrc_corrections",
  "moisture_loss_entries",
  "conversion_factor_history",
  "audit_events",
];

/* Collect every string value anywhere in the tool input. */
function strings(node, out = []) {
  if (typeof node === "string") out.push(node);
  else if (Array.isArray(node)) node.forEach((n) => strings(n, out));
  else if (node && typeof node === "object") Object.values(node).forEach((n) => strings(n, out));
  return out;
}

function block(rule, what, why, instead) {
  process.stderr.write(
    "BLOCKED — " + rule + "\n" +
    "  Found:   " + what + "\n" +
    "  Why:     " + why + "\n" +
    "  Instead: " + instead + "\n" +
    "  If you believe this is a false positive, tell the owner rather than working around it.\n"
  );
  process.exit(2);
}

function check(payload) {
  const name = payload.tool_name || "";
  /* Bash, and any MCP tool that runs SQL or applies a migration. */
  const relevant = /^Bash$/.test(name) || /execute_sql|apply_migration|postgres|query/i.test(name);
  if (!relevant) process.exit(0);

  for (const s of strings(payload.tool_input || {})) {
    /* Normalise whitespace so line breaks between keywords cannot slip past. */
    const sql = s.replace(/\s+/g, " ").toLowerCase();

    if (/\bdrop\s+(materialized\s+)?view\b[^;]*\bcascade\b/.test(sql)) {
      block(
        "RULE E1: never `drop view ... cascade`",
        "a DROP VIEW ... CASCADE statement",
        "It destroyed mv_department_dashboard three times and blanked every dashboard with " +
          "no visible error, because the front end swallows the failure with `?? []`. It also " +
          "silently reverted v_money_position to a wet-weight figure.",
        "Use CREATE OR REPLACE VIEW. Columns may be appended at the end. Re-query pg_matviews " +
          "afterwards to confirm nothing was lost."
      );
    }

    /* TIGHTENED 8 Aug 2026 — owner-approved after a false positive that locked a function.
     *
     * This previously read /\bgrant\b[^;]*\bto\b[^;]*\banon\b/, which matched the WORDS
     * "grant ... to ... anon" anywhere in any string — including English prose. The finding
     * text inside tg_nightly_platform_check() reads "...holds the grant. Then run
     * supabase/checks/anon_exposure.sql to confirm zero" followed by "anon relations", so
     * every attempt to edit that function was blocked, permanently, with no GRANT in sight.
     *
     * The fix requires `grant` to be followed by an actual privilege keyword, which is true
     * of every real GRANT statement and false of prose. It is deliberately NOT anchored to
     * the start of a statement, so a GRANT buried inside a plpgsql body is still caught. */
    if (/\bgrant\s+(all|select|insert|update|delete|truncate|references|trigger|usage|execute|create|connect|temporary|temp)\b[^;]*\bto\b[^;]*\banon\b/.test(sql)) {
      block(
        "RULE E6: never `grant ... to anon`",
        "a GRANT to the anon role",
        "anon is every anonymous visitor — the publishable key ships inside the JavaScript " +
          "bundle. 36 views once leaked package tags, suppliers and dollar figures this way, " +
          "and 30 relations were still exposed as of 7 August 2026.",
        "Grant to `authenticated` and let row-level security decide. All GRANT/REVOKE work is " +
          "owned by the watchdog — ask rather than issuing it yourself."
      );
    }

    for (const t of IMMUTABLE) {
      const del = new RegExp("\\b(delete\\s+from|truncate)\\s+(public\\.)?" + t + "\\b");
      if (del.test(sql)) {
        block(
          "RULE H2: forensic records are immutable",
          "a DELETE or TRUNCATE against " + t,
          "That table is an append-only forensic log. It is evidence, and 'cleaning it up' " +
            "destroys the record of what the business knew and when. On 7 August 2026 " +
            "watchdog_findings lost 57 rows with no recorded reason.",
          "Append a reversing row instead. If a uniqueness constraint genuinely requires " +
            "removing duplicates, record the decision in issue_decisions FIRST — who, when " +
            "and why — then proceed with the owner's agreement."
        );
      }
    }
  }
  process.exit(0);
}
