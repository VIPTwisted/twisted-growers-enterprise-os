#!/usr/bin/env node
/* PreToolUse hook on Edit / Write / MultiEdit / NotebookEdit.
 *
 * Refuses to WRITE a credential to disk. The CI scanner (tools/checks/secret-scan.mjs)
 * catches one that is already there; this stops it arriving.
 *
 * WHY BOTH: on 8 Aug 2026, 23 permission entries carrying live admin keys, JWTs, Netlify
 * tokens and signed storage URLs were found in the OneDrive-synced Desktop config. They
 * had accumulated over several days. Nothing was watching, because the only scanner in
 * the build looked at COMMITS — and that file was never committed. A credential is
 * exposed the moment it is written to a synced folder, not the moment it is pushed.
 *
 * The patterns are IMPORTED, never copied. One definition, two enforcement points, and
 * tools/checks/guard-fixtures.mjs proves they agree — because on the same day the SQL
 * rule existed in two places with the same bug in both, and fixing one would not have
 * fixed the other.
 *
 * Contract: tool call as JSON on stdin. Exit 2 BLOCKS and shows stderr to the agent.
 * Exit 0 allows. On ANY unexpected error, exit 0 — a broken guard must never be able to
 * freeze all work. It fails closed on real violations and open on its own bugs.
 */
import { SECRET_PATTERNS } from "../checks/secret-scan.mjs";

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

/* Files whose whole purpose is to hold a credential, or to describe one. Writing to
   these is allowed; secret-scan.mjs still tracks them in its baseline, so they stay
   visible rather than becoming invisible. */
const ALLOWED = [
  { re: /(^|[\/\\])\.mcp\.json$/, why: ".mcp.json is the intended home for the local connection string and is gitignored." },
  { re: /(^|[\/\\])\.env(\..+)?$/, why: ".env files are gitignored by design." },
  { re: /(^|[\/\\])token\.txt$/, why: "bridge/token.txt is a credential file by design and is gitignored." },
  { re: /tools[\/\\]checks[\/\\]secret-scan\.(mjs|baseline\.json)$/, why: "the scanner and its baseline." },
  { re: /tools[\/\\]hooks[\/\\]guard-secrets\.mjs$/, why: "this hook." },
  { re: /tools[\/\\]checks[\/\\]guard-fixtures\.mjs$/, why: "fixtures deliberately carry example-shaped strings." },
];

/* Collect every string in the tool input — content arrives under different keys for
   Write, Edit and MultiEdit, and a new tool shape must not silently bypass this. */
function strings(node, out = []) {
  if (typeof node === "string") out.push(node);
  else if (Array.isArray(node)) node.forEach((n) => strings(n, out));
  else if (node && typeof node === "object") Object.values(node).forEach((n) => strings(n, out));
  return out;
}

function check(payload) {
  const name = payload.tool_name || "";
  if (!/^(Edit|Write|MultiEdit|NotebookEdit)$/.test(name)) process.exit(0);

  const input = payload.tool_input || {};
  const target = String(input.file_path || input.notebook_path || "");

  const allowed = ALLOWED.find((a) => a.re.test(target));
  if (allowed) process.exit(0);

  /* The path itself is excluded from the scan: a filename cannot be a secret, and
     scanning it would flag any write to a file whose NAME resembles one. */
  const body = strings(input).filter((s) => s !== target);

  for (const s of body) {
    for (const p of SECRET_PATTERNS) {
      const m = s.match(p.re);
      if (!m) continue;
      if (p.ignore && p.ignore(m)) continue;

      process.stderr.write(
        "BLOCKED — a credential must not be written to disk.\n" +
        "  Kind:    " + p.name + "\n" +
        "  File:    " + (target || "(unnamed)") + "\n" +
        "  Why:     A credential is exposed the moment it lands in a synced or shared\n" +
        "           folder — not when it is pushed. On 8 Aug 2026, 23 live credentials\n" +
        "           were found sitting in a OneDrive-synced config with nothing watching,\n" +
        "           because the only scanner in the build looked at commits.\n" +
        "           Once committed the exposure is RETROACTIVE: deleting the line later\n" +
        "           does not undo it, because the history keeps it. Only rotation does.\n" +
        "  Instead: " + p.fix + "\n" +
        "  The value is deliberately not echoed here.\n" +
        "  If you believe this is a false positive, tell the owner rather than working around it.\n"
      );
      process.exit(2);
    }
  }
  process.exit(0);
}
