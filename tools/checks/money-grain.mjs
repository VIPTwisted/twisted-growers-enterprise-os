#!/usr/bin/env node
/* The published tag-line report must never regain additive invoice money. */
import { readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const migrationDir = join(root, "supabase/migrations");

export function stripSqlComments(sql) {
  let out = "";
  let quote = null;
  for (let i = 0; i < sql.length;) {
    const c = sql[i], n = sql[i + 1];
    if (quote) {
      out += c;
      if (c === quote) {
        if (n === quote) { out += n; i += 2; continue; }
        quote = null;
      }
      i++; continue;
    }
    if (c === "'" || c === '"') { quote = c; out += c; i++; continue; }
    if (c === "-" && n === "-") {
      const end = sql.indexOf("\n", i);
      out += " ".repeat((end === -1 ? sql.length : end) - i);
      i = end === -1 ? sql.length : end;
      continue;
    }
    if (c === "/" && n === "*") {
      const end = sql.indexOf("*/", i + 2);
      const stop = end === -1 ? sql.length : end + 2;
      out += sql.slice(i, stop).replace(/[^\n]/g, " ");
      i = stop;
      continue;
    }
    out += c; i++;
  }
  return out;
}

export function normalizedSqlDigest(sql) {
  return createHash("sha256").update(sql.replace(/\r\n/g, "\n")).digest("hex");
}

export function migrationTreeDigest(entries) {
  const manifest = [...entries]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(({ name, sql }) => `${name}\0${normalizedSqlDigest(sql)}`)
    .join("\n");
  return createHash("sha256").update(manifest).digest("hex");
}

export function inspectMoneyContract(sql) {
  const code = stripSqlComments(sql);
  const findings = [];
  const need = (test, message) => { if (!test) findings.push(message); };
  need(/create or replace view public\.v_apex_invoice_truth/i.test(code), "missing invoice-grain Apex truth view");
  need(/recognized_total_usd/i.test(code), "missing additive non-cancelled Apex measure");
  need(/create or replace view public\.v_metrc_manifest_invoice_truth/i.test(code), "missing manifest-grain reconciliation view");
  need(/create or replace view public\.v_forensic_sold_by_tag_safe/i.test(code), "missing safe tag-line wrapper");
  need(/null::numeric as total_usd/i.test(code), "tag-line total_usd is not refused");
  need(/null::numeric as apex_invoice_usd/i.test(code), "tag-line apex_invoice_usd is not refused");
  need(/fact_view\s*=\s*'v_forensic_sold_by_tag_safe'/i.test(code), "published report is not repointed to the safe view");
  need(/update\s+public\.nav_registry\s+set\s+table_ref\s*=\s*'v_forensic_sold_by_tag_safe'\s+where\s+view_key\s*=\s*'forensic_sold_by_tag'\s+and\s+enabled\s+and\s+table_ref\s*=\s*'v_forensic_sold_by_tag'\s*;/i.test(code), "published menu road is not atomically repointed from the unsafe view to the safe view");
  need(/if\s+not\s+exists\s*\(\s*select\s+1\s+from\s+public\.nav_registry\s+where\s+view_key\s*=\s*'forensic_sold_by_tag'\s+and\s+enabled\s+and\s+table_ref\s*=\s*'v_forensic_sold_by_tag_safe'\s*\)\s+then\s+raise\s+exception\s+'MONEY_NAV_CONTRACT:[^']+'\s*;/i.test(code), "published menu road has no executable safe-view postcondition");
  need(/measures\s*=\s*array\['pounds'\]/i.test(code), "published tag report still registers money as a measure");
  need(/v_truth\s*<>\s*v_control/i.test(code), "migration has no executable invoice-grain control total");
  return findings;
}

const good = `
create or replace view public.v_apex_invoice_truth as select recognized_total_usd;
create or replace view public.v_metrc_manifest_invoice_truth as select 1;
create or replace view public.v_forensic_sold_by_tag_safe as
select null::numeric as total_usd, null::numeric as apex_invoice_usd;
update report_registry set fact_view = 'v_forensic_sold_by_tag_safe', measures = array['pounds'];
update public.nav_registry set table_ref = 'v_forensic_sold_by_tag_safe'
where view_key = 'forensic_sold_by_tag' and enabled and table_ref = 'v_forensic_sold_by_tag';
if not exists (select 1 from public.nav_registry where view_key = 'forensic_sold_by_tag'
and enabled and table_ref = 'v_forensic_sold_by_tag_safe') then
raise exception 'MONEY_NAV_CONTRACT: route is unsafe'; end if;
if v_truth <> v_control then raise exception 'bad'; end if;`;
const bad = good.replace("null::numeric as total_usd", "invoice_total as total_usd");
const badNav = good.replace("where view_key = 'forensic_sold_by_tag' and enabled and table_ref = 'v_forensic_sold_by_tag';", "where view_key = 'some_other_route' and enabled and table_ref = 'v_forensic_sold_by_tag';")
  + "\nselect 1 from public.nav_registry where view_key = 'forensic_sold_by_tag';";
const badComment = good.replace(/update public\.nav_registry[\s\S]*?table_ref = 'v_forensic_sold_by_tag';/, "update public.nav_registry set table_ref = 'v_forensic_sold_by_tag_safe' where view_key = 'some_other_route' and enabled and table_ref = 'v_forensic_sold_by_tag';")
  + "\n-- update public.nav_registry set table_ref = 'v_forensic_sold_by_tag_safe' where view_key = 'forensic_sold_by_tag' and enabled and table_ref = 'v_forensic_sold_by_tag';";
const badTarget = good.replace("set table_ref = 'v_forensic_sold_by_tag_safe'", "set table_ref = 'v_forensic_sold_by_tag'");
const badBroad = good.replace("where view_key = 'forensic_sold_by_tag' and enabled and table_ref = 'v_forensic_sold_by_tag';", "where enabled;");
const badCurrentGuard = good.replace(" and table_ref = 'v_forensic_sold_by_tag';", ";");
const badAssertion = good.replace(/if not exists \(select 1 from public\.nav_registry[\s\S]*?end if;/, "");
const reviewedFixtureSql = "select 'independently reviewed migration';";
const reviewedFixtureEntries = [{ name: "later.sql", sql: reviewedFixtureSql }];
const reviewedFixtureDigest = migrationTreeDigest(reviewedFixtureEntries);
if (inspectMoneyContract(good).length
    || !inspectMoneyContract(bad).some((x) => x.includes("total_usd"))
    || !inspectMoneyContract(badNav).some((x) => x.includes("atomically"))
    || !inspectMoneyContract(badComment).some((x) => x.includes("atomically"))
    || !inspectMoneyContract(badTarget).some((x) => x.includes("atomically"))
    || !inspectMoneyContract(badBroad).some((x) => x.includes("atomically"))
    || !inspectMoneyContract(badCurrentGuard).some((x) => x.includes("atomically"))
    || !inspectMoneyContract(badAssertion).some((x) => x.includes("postcondition"))
    || migrationTreeDigest(reviewedFixtureEntries) !== reviewedFixtureDigest
    || migrationTreeDigest([{ name: "renamed.sql", sql: reviewedFixtureSql }]) === reviewedFixtureDigest
    || migrationTreeDigest([{ name: "backdated.sql", sql: "select 1;" }, ...reviewedFixtureEntries]) === reviewedFixtureDigest
    || migrationTreeDigest([{ name: "later.sql", sql: `${reviewedFixtureSql} -- changed` }]) === reviewedFixtureDigest) {
  throw new Error("money-grain detector self-test failed");
}

const files = readdirSync(migrationDir).filter((name) => name.endsWith(".sql")).sort();
const grainFile = "20260819184318_money_grain_is_a_contract_not_a_format.sql";
const navFile = "20260819203618_every_published_sold_by_tag_road_refuses_line_grain_money.sql";

if (!files.includes(grainFile)) {
  console.error(`money-grain: FAIL — reviewed contract file is missing: ${grainFile}`);
  process.exit(1);
}
if (!files.includes(navFile)) {
  console.error(`money-grain: FAIL — reviewed navigation hotfix file is missing: ${navFile}`);
  process.exit(1);
}
const navSql = readFileSync(join(migrationDir, navFile), "utf8").replace(/\r\n/g, "\n");
/* Temporary immutable-hotfix seal. Regex fixtures explain a detector, but they
   cannot prove PL/pgSQL reachability. This reviewed digest locks the complete
   normalized migration: moving the UPDATE into a string/IF false, weakening its
   predicate, or changing its postcondition changes the digest and stops release.
   Replace this one-file seal only when an execution-backed migration harness owns
   the rule. Post-deploy, the live registry assertion below the migration is also
   re-run through the database connector before the finding can close. */
const expectedNavDigest = "3459baa899ab90c8b3cab07aed5fac4724e6460af017447522d87bfaeff76203";
const navDigest = normalizedSqlDigest(navSql);
if (navDigest !== expectedNavDigest) {
  console.error(`money-grain: FAIL — ${navFile} differs from the independently reviewed hotfix (${navDigest}).`);
  process.exit(1);
}
/* Fail closed on the complete migration tree, including filenames and backdated
   additions. A tail boundary can be moved by renaming the seal or inserting an
   older-sorting file. The one reviewed tree digest makes both acts fail. Every
   future migration requires a newly reviewed tree digest; arbitrary PostgreSQL
   is never classified by regex. */
const migrationEntries = files.map((name) => ({
  name,
  sql: readFileSync(join(migrationDir, name), "utf8"),
}));
const expectedMigrationTreeDigest = "3c507500d48bd5d8be413651280f2644d1c0f010d2cfd034a46b34675bb369af";
const actualMigrationTreeDigest = migrationTreeDigest(migrationEntries);
if (actualMigrationTreeDigest !== expectedMigrationTreeDigest) {
  console.error(`money-grain: FAIL — migration tree differs from the independently reviewed 929-file manifest (${actualMigrationTreeDigest}).`);
  process.exit(1);
}
const contractSql = `${readFileSync(join(migrationDir, grainFile), "utf8")}\n${navSql}`;
const findings = inspectMoneyContract(contractSql);
if (findings.length) {
  console.error("money-grain: FAIL");
  findings.forEach((finding) => console.error(`  - ${finding}`));
  process.exit(1);
}
console.log(`money-grain: PASS — ${grainFile} and ${navFile} refuse line-grain dollars on both publication roads and prove the invoice control total.`);

