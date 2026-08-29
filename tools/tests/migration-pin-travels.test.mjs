import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const src = readFileSync(resolve(root, "tools/checks/migration-pin-travels.mjs"), "utf8");
const pkg = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
const ci = readFileSync(resolve(root, ".github/workflows/ci.yml"), "utf8");

test("the pin-travels gate refuses a tree change without money-grain.mjs", () => {
  assert.match(src, /money-grain\.mjs/);
  assert.match(src, /supabase\\\/migrations/);
  assert.match(src, /No follow-up/);
});

test("the pin-travels gate is in the Netlify check chain and in Actions", () => {
  assert.match(String(pkg.scripts.check), /check:migration-pin/);
  assert.equal(pkg.scripts["check:migration-pin"], "node tools/checks/migration-pin-travels.mjs");
  assert.match(ci, /tools\/checks\/migration-pin-travels\.mjs/);
});
