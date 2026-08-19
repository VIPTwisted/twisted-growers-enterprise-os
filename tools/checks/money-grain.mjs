#!/usr/bin/env node
/* The published tag-line report must never regain additive invoice money. */
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const migrationDir = join(root, "supabase/migrations");

export function inspectMoneyContract(sql) {
  const findings = [];
  const need = (test, message) => { if (!test) findings.push(message); };
  need(/create or replace view public\.v_apex_invoice_truth/i.test(sql), "missing invoice-grain Apex truth view");
  need(/recognized_total_usd/i.test(sql), "missing additive non-cancelled Apex measure");
  need(/create or replace view public\.v_metrc_manifest_invoice_truth/i.test(sql), "missing manifest-grain reconciliation view");
  need(/create or replace view public\.v_forensic_sold_by_tag_safe/i.test(sql), "missing safe tag-line wrapper");
  need(/null::numeric as total_usd/i.test(sql), "tag-line total_usd is not refused");
  need(/null::numeric as apex_invoice_usd/i.test(sql), "tag-line apex_invoice_usd is not refused");
  need(/fact_view\s*=\s*'v_forensic_sold_by_tag_safe'/i.test(sql), "published report is not repointed to the safe view");
  need(/measures\s*=\s*array\['pounds'\]/i.test(sql), "published tag report still registers money as a measure");
  need(/v_truth\s*<>\s*v_control/i.test(sql), "migration has no executable invoice-grain control total");
  return findings;
}

const good = `
create or replace view public.v_apex_invoice_truth as select recognized_total_usd;
create or replace view public.v_metrc_manifest_invoice_truth as select 1;
create or replace view public.v_forensic_sold_by_tag_safe as
select null::numeric as total_usd, null::numeric as apex_invoice_usd;
update report_registry set fact_view = 'v_forensic_sold_by_tag_safe', measures = array['pounds'];
if v_truth <> v_control then raise exception 'bad'; end if;`;
const bad = good.replace("null::numeric as total_usd", "invoice_total as total_usd");
if (inspectMoneyContract(good).length || !inspectMoneyContract(bad).some((x) => x.includes("total_usd"))) {
  throw new Error("money-grain detector self-test failed");
}

const file = readdirSync(migrationDir)
  .filter((name) => name.endsWith(".sql"))
  .sort()
  .reverse()
  .find((name) => readFileSync(join(migrationDir, name), "utf8").includes("MONEY_GRAIN_CONTRACT"));

if (!file) {
  console.error("money-grain: FAIL — no MONEY_GRAIN_CONTRACT migration found");
  process.exit(1);
}
const findings = inspectMoneyContract(readFileSync(join(migrationDir, file), "utf8"));
if (findings.length) {
  console.error("money-grain: FAIL");
  findings.forEach((finding) => console.error(`  - ${finding}`));
  process.exit(1);
}
console.log(`money-grain: PASS — ${file} refuses line-grain dollars and proves the invoice control total.`);

