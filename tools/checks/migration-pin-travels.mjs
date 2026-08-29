#!/usr/bin/env node
/* A migration that lands without its tree seal turns main red.
 * That happened on 29 Aug: #92 filed two files, money-grain still hashed
 * the old tree, Gates 446 failed, #93 was a pin-only apology.
 *
 * This gate does not compute the digest. money-grain.mjs still does.
 * This gate only asks: if the tree moved, did the seal file move too.
 */
import { execFileSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

function git(args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

function resolveBase() {
  if (process.env.MIGRATION_PIN_BASE) return process.env.MIGRATION_PIN_BASE;
  const prBase = process.env.GITHUB_BASE_REF;
  if (prBase) {
    try {
      git(["rev-parse", "--verify", `origin/${prBase}`]);
      return `origin/${prBase}`;
    } catch {
      /* fall through */
    }
  }
  try {
    git(["rev-parse", "--verify", "origin/main"]);
    return "origin/main";
  } catch {
    try {
      return git(["rev-parse", "HEAD^"]);
    } catch {
      return null;
    }
  }
}

function changedNames(base) {
  if (!base) return git(["ls-files"]).split("\n").filter(Boolean);
  try {
    return git(["diff", "--name-only", `${base}...HEAD`]).split("\n").filter(Boolean);
  } catch {
    return git(["diff", "--name-only", "HEAD"]).split("\n").filter(Boolean);
  }
}

function addedNames(base) {
  if (!base) return [];
  try {
    return git(["diff", "--name-only", "--diff-filter=A", `${base}...HEAD`])
      .split("\n")
      .filter(Boolean);
  } catch {
    return [];
  }
}

const base = resolveBase();
const files = changedNames(base);
const migrations = files.filter((f) => /^supabase\/migrations\/[^/]+\.sql$/.test(f));
const pinTouched = files.includes("tools/checks/money-grain.mjs");
const placeholders = addedNames(base).filter(
  (f) =>
    /^supabase\/migrations\/[^/]+\.sql$/.test(f) &&
    /pending|_draft_|not.applied/i.test(f),
);

if (placeholders.length) {
  console.error("migration-pin-travels: FAIL — placeholder migration filename.");
  placeholders.forEach((f) => console.error(`  ${f}`));
  console.error("Stamp the file to schema_migrations.version before the PR.");
  process.exit(1);
}

if (migrations.length && !pinTouched) {
  console.error(
    `migration-pin-travels: FAIL — ${migrations.length} migration file(s) changed and tools/checks/money-grain.mjs did not.`,
  );
  migrations.forEach((f) => console.error(`  ${f}`));
  console.error("money-grain hashes the tree. File-only PRs turn main red.");
  console.error("Pin expectedMigrationTreeDigest in THIS PR. No follow-up.");
  process.exit(1);
}

console.log(
  `migration-pin-travels: PASS — migrations ${migrations.length}, pin ${pinTouched ? "in diff" : "not required"}, base ${base ?? "none"}.`,
);
