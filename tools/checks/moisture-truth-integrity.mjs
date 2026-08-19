#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const read = (path) => readFileSync(resolve(root, path), "utf8");
const migration = read("supabase/migrations/20260819195000_moisture_basis_is_explicit_and_goal_is_editable.sql");
const register = read("app/web/src/cult-moisture-register.jsx");
const editor = read("app/web/src/business-rule-editor.jsx");
const app = read("app/web/src/App.jsx");

const failures = [];
const requireText = (body, text, why) => {
  if (!body.includes(text)) failures.push(why);
};

requireText(migration, "f_harvest_weight_basis", "database has no single explicit weight-basis resolver");
requireText(migration, "business_rule_surface", "moisture rule membership is not data-owned");
requireText(migration, "v_moisture_business_rules", "moisture register has no database-owned rule surface");
requireText(migration, "coalesce(p_room, '') ilike '%freezer%'", "freezer evidence no longer identifies wet-basis fresh frozen");
requireText(migration, "else 'unknown'", "unproven weight basis is no longer refused as unknown");
requireText(migration, "value = 74.9", "evidenced 74.9 percent dried-harvest goal is missing");
requireText(migration, "f_rule('moisture_loss_goal_pct')", "moisture consumers stopped reading the editable company goal");
requireText(migration, "f_rule('fresh_frozen_wet_to_dry')", "fresh-frozen dry-equivalent stopped reading the editable ratio");
requireText(migration, "null::numeric as evaporated_lb", "legacy evaporation total is no longer quarantined");
requireText(migration, "DERIVED RESIDUAL", "database stopped disclosing that moisture is derived rather than sensed");

if (/coalesce\s*\(\s*m\.moisture_loss_lb\s*,\s*0\s*\)\s*=\s*0[\s\S]{0,100}fresh frozen/i.test(migration)) {
  failures.push("zero residual again classifies fresh frozen; six live freezer/FF rows disprove that rule");
}
if (/453\.592(?!37)/.test(migration) || />=\s*70\.6|>=\s*50|>=\s*25/.test(migration)) {
  failures.push("migration reintroduced literal unit or yield rules instead of f_rule()");
}

requireText(register, "useDefaultRange(session, VIEW_KEY, setRange)", "moisture register no longer opens on the governed date default");
requireText(register, "<DateRangeSelect", "moisture register lost its custom date control");
requireText(register, "<BusinessRuleEditor", "users must leave the moisture section to edit its rules");
requireText(register, "source=\"v_moisture_business_rules\"", "moisture rule list is not read from its database surface");
requireText(register, "classification_basis", "moisture rows no longer show why their basis was assigned");
requireText(register, "It is not measured water", "estimated residual is again presented as measured water");

requireText(editor, "new Set([\"owner\", \"executive\"])", "rule editor roles disagree with conversion_factors RLS");
requireText(editor, ".select(\"key,value,unit,set_by,updated_at\")", "rule save does not require a returned database row");
requireText(editor, ".maybeSingle()", "empty RLS update can again masquerade as a successful save");
if (/planner|dept_head/.test(editor)) failures.push("rule editor again claims a role that conversion_factors RLS rejects");
requireText(app, "return <BusinessRuleEditor session={session} />", "Business Rules route bypasses the receipt-aware shared editor");

if (failures.length) {
  console.error("moisture-truth-integrity: FAIL");
  failures.forEach((f) => console.error(`  - ${f}`));
  process.exit(1);
}

console.log("moisture-truth-integrity: PASS — basis is explicit, residual is disclosed, rules are editable with a returned row, and dates are governed.");
