// Reads FAC_ROOMS and FAC_DEPTS out of app/web/src/facility/data/facility.ts (the A1.1 blueprint
// as the OS draws it) and prints them as JSON. The facility_room seed migration was generated from
// this output, and tools/tests/facility-rooms-match-blueprint.test.mjs re-runs it to prove the
// committed snapshot still equals the blueprint. No database access here.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(resolve(here, "../../app/web/src/facility/data/facility.ts"), "utf8");

function block(name) {
  const start = src.indexOf(`export const ${name}`);
  if (start < 0) throw new Error(`${name} not found in facility.ts`);
  // The type annotation (`FacRoom[]`) carries its own brackets — the literal starts after the "=".
  const open = src.indexOf("[", src.indexOf("=", start));
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === "[") depth++;
    else if (src[i] === "]") { depth--; if (depth === 0) return src.slice(open, i + 1); }
  }
  throw new Error(`${name} never closes`);
}

// The literals are plain data (strings, numbers, booleans, nested arrays/objects) — quote the keys
// and let JSON.parse do the rest, so a stray expression fails loudly instead of being guessed at.
function parseLiteral(text) {
  const quoted = text
    .replace(/([{,]\s*)([A-Za-z_][A-Za-z0-9_]*)\s*:/g, '$1"$2":')
    .replace(/,(\s*[}\]])/g, "$1");
  return JSON.parse(quoted);
}

export function rooms() {
  return parseLiteral(block("FAC_ROOMS"));
}
export function depts() {
  return parseLiteral(block("FAC_DEPTS"));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const out = { rooms: rooms(), depts: depts() };
  process.stdout.write(JSON.stringify(out, null, 2) + "\n");
}
