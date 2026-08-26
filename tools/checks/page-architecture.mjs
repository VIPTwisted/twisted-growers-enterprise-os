#!/usr/bin/env node
/* PAGE ARCHITECTURE — the owner's ruling, turned into something that can fail a build.
 *
 * THE RULING, 8 August 2026, stated twice in capitals:
 *   "DO NOT EVER USE ONE TEMPLATE FOR EVERY PAGE."
 *   "NO DASHBOARD OR PAGE SHOULD HAVE SAME TEMPLATE."
 *
 * WHAT WENT WRONG. 522 enabled report pages were all rendered by ONE component,
 * ReportScreen at App.jsx:1952. It receives a table name and draws a grid, so it
 * cannot know that Employee Notes is not a harvest report -- which is exactly why
 * Employee Notes was given a harvest date filter. The template always won because
 * the database never told the interface what kind of page it was.
 *
 * Share primitives. Never share layouts.
 *   SHARED:     table, chip, filter, date range, drawer, empty state, export,
 *               money cell, weight cell, assign-from-tile
 *   NEVER:      page layout, column choice, what is above the fold, what actions
 *               exist, what the empty state says
 *
 * WHY A RATCHET RATHER THAN A HARD FAIL. 220 pages have no archetype yet and 251
 * are data dumps. A gate that fails on day one gets switched off, and a gate that
 * is switched off is worse than none. So it fails only when things get WORSE --
 * the same pattern no-hardcoded-numbers.mjs uses. The baselines below are meant to
 * come DOWN and are the honest record of the debt.
 *
 *   node tools/checks/page-architecture.mjs
 */
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { openClient, refuse } from "../lib/db.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SRC = join(ROOT, "app", "web", "src");

/* ── BASELINES. Lower these as the work lands; never raise them. ────────────── */
const BASELINE = {
  // ReportScreen appears once as a definition and once as a use site in App.jsx.
  // When the Data Browser is extracted this becomes 0 in App.jsx entirely.
  reportScreenSites: 2,
  // Pages OLDER THAN 24 HOURS with no archetype. A grace period, not an absolute count:
  // an absolute count thrashes because other agents add pages continuously -- it was set to
  // 138 and three more arrived in the seconds before the gate ran. Judging only pages that
  // have had a full day to be declared catches real neglect and ignores work in progress.
  // 129 legacy pages carry NO created_at and are undeclared: recorded debt, may only fall.
  // A NEW page gets 24h grace, then pushes this to 130 and fails. That is the ratchet, and
  // it is immune to other agents adding pages while this runs.
  pagesUndeclaredAfterADay: 129,
};

let failed = false;
const fail = (msg, ...detail) => {
  failed = true;
  console.error(`page-architecture: FAIL - ${msg}`);
  detail.forEach((d) => console.error(`    ${d}`));
};
const ok = (msg) => console.log(`page-architecture: ok      - ${msg}`);

/* ── 1 · The template may not spread ───────────────────────────────────────────
 * ReportScreen is legitimate in exactly ONE place: the admin Data Browser, which
 * serves the 251 auto-generated table pages. Anywhere else it is the defect. */
function checkTemplateContainment() {
  const app = join(SRC, "App.jsx");
  if (!existsSync(app)) return fail("app/web/src/App.jsx not found.");

  const text = readFileSync(app, "utf8");
  const sites = (text.match(/ReportScreen/g) || []).length;

  if (sites > BASELINE.reportScreenSites) {
    return fail(
      `ReportScreen is referenced ${sites} times in App.jsx (baseline ${BASELINE.reportScreenSites}).`,
      "The generic renderer is SPREADING, which is the thing the owner forbade.",
      "A roster is not a ledger is not a punch history. Build the archetype instead,",
      "in its own module file under app/web/src/modules/<department>/.",
    );
  }
  ok(`ReportScreen contained: ${sites} reference(s) in App.jsx, baseline ${BASELINE.reportScreenSites}`);

  // Once modules exist, none of them may reach for the generic renderer.
  const modules = join(SRC, "modules");
  if (existsSync(modules)) {
    const offenders = [];
    for (const f of walk(modules)) {
      if (!/\.(jsx?|tsx?)$/.test(f)) continue;
      if (readFileSync(f, "utf8").includes("ReportScreen")) offenders.push(relative(ROOT, f));
    }
    if (offenders.length) {
      return fail(
        `${offenders.length} module file(s) import the generic ReportScreen:`,
        ...offenders,
        "Modules hand-build their pages. Only app/web/src/admin/DataBrowser.jsx may use it.",
      );
    }
    ok("no module reaches for the generic renderer");
  }
}

/* ── 2 · Modules may not import each other ─────────────────────────────────────
 * This is what lets twelve agents work in parallel without collision, and it is
 * how Google and Microsoft enforce ownership -- a cross-boundary import fails the
 * build rather than earning a review comment. Cross-department data comes from
 * database views, never from another module's components. */
function checkModuleBoundaries() {
  const modules = join(SRC, "modules");
  if (!existsSync(modules)) {
    console.log("page-architecture: pending - app/web/src/modules/ does not exist yet.");
    return;
  }
  const names = readdirSync(modules).filter((d) => statSync(join(modules, d)).isDirectory());
  const breaches = [];

  for (const mine of names) {
    for (const f of walk(join(modules, mine))) {
      if (!/\.(jsx?|tsx?)$/.test(f)) continue;
      const text = readFileSync(f, "utf8");
      for (const theirs of names) {
        if (theirs === mine) continue;
        const pattern = new RegExp(`from\\s+["'][^"']*modules/${theirs}/`, "g");
        if (pattern.test(text)) {
          breaches.push(`${relative(ROOT, f)} imports from modules/${theirs}/`);
        }
      }
    }
  }
  if (breaches.length) {
    return fail(
      `${breaches.length} cross-module import(s):`,
      ...breaches,
      "A module may not import another module. Share through app/web/src/ui/ primitives,",
      "or through a database view. Anything else drifts and blocks parallel work.",
    );
  }
  ok(`${names.length} module(s), no cross-module imports`);
}

/* ── 3 · ui/ holds primitives, never layouts ───────────────────────────────────
 * The moment a page layout lands in the shared folder, every page that uses it
 * looks the same again -- which is how we got here. */
function checkSharedFolderHoldsNoLayouts() {
  const ui = join(SRC, "ui");
  if (!existsSync(ui)) {
    console.log("page-architecture: pending - app/web/src/ui/ does not exist yet.");
    return;
  }
  const offenders = readdirSync(ui).filter((f) =>
    /(Page|Screen|Layout|Dashboard)\.(jsx?|tsx?)$/.test(f),
  );
  if (offenders.length) {
    return fail(
      `app/web/src/ui/ contains ${offenders.length} layout-shaped file(s):`,
      ...offenders,
      "ui/ is for primitives only: table, chip, filter, drawer, empty state, export,",
      "money cell, weight cell. A shared LAYOUT is a shared template by another name.",
    );
  }
  ok("ui/ holds primitives only, no page layouts");
}

/* ── 4 · Every page must declare what it is ────────────────────────────────────
 * Needs the database. Strict when a connection exists, and honest about it when
 * one does not -- a check whose limits are invisible is how a vacuous gate
 * survives (see schema-baseline-fresh.mjs, which was a clock for a day). */
async function checkEveryPageDeclaresItself() {
  /* NO DATABASE, NO VERDICT — see tools/lib/db.mjs. Rule 4 is the whole reason this gate
     exists: 522 pages once shared one layout because nothing made a page declare its kind,
     and nav_registry is the only place that fact lives. Returning early on a missing
     connection meant the front-end rules ran and the rule that mattered did not. */
  const client = await openClient("page-architecture", ROOT);
  try {
    const { rows: [r] } = await client.query(`
      /* coalesce, because NULL created_at fell into NEITHER bucket and the check reported
         "0 overdue" while 142 pages were undeclared -- 129 of them with no creation date at
         all. Third vacuous pass of the day from the same author: the baseline gate read a
         clock, the freshness check hid a stale licence behind max(), and this one hid 129
         pages behind a null. A row with no creation date has certainly existed long enough,
         so null is treated as ancient: fail-safe, never fail-open. */
      select count(*) filter (where archetype is null
                             and coalesce(created_at, 'epoch'::timestamptz)
                                 < now() - interval '24 hours')::int as undecided,
             count(*) filter (where archetype is null
                             and coalesce(created_at, 'epoch'::timestamptz)
                                 >= now() - interval '24 hours')::int as in_grace,
             count(*) filter (where archetype = 'data_browser')::int      as dumps,
             count(*) filter (where archetype is not null
                              and archetype <> 'data_browser')::int       as assigned,
             count(*) filter (where module is null)::int                  as no_module,
             count(*)::int                                                as total
        from nav_registry where enabled`);

    if (r.no_module > 0) {
      fail(`${r.no_module} enabled page(s) belong to no module.`,
           "Every page belongs to exactly one department module, which has exactly one owner.");
    } else {
      ok(`all ${r.total} enabled pages belong to a module`);
    }

    if (r.undecided > BASELINE.pagesUndeclaredAfterADay) {
      fail(
        `${r.undecided} page(s) have had over 24 hours and still declare no archetype `
          + `(limit ${BASELINE.pagesUndeclaredAfterADay}).`,
        "A page whose kind was never decided gets whatever the renderer does by default,",
        "which is how 522 pages ended up sharing one. Set nav_registry.archetype, or add",
        "a genuinely new kind to page_archetype first.",
        "The 24h grace period exists so work in progress is not punished — anything older",
        "than that is neglect, not progress.",
      );
    } else {
      ok(`${r.undecided} page(s) overdue past the 24h grace period `
         + `(limit ${BASELINE.pagesUndeclaredAfterADay}); ${r.in_grace} still inside it`);
    }

    console.log(`page-architecture: ${r.assigned} assigned - ${r.dumps} data-browser - `
      + `${r.undecided} overdue - ${r.in_grace} in grace`);
  } catch (err) {
    refuse("page-architecture", `nav_registry could not be read: ${err.message.trim()}`);
  } finally {
    await client.end().catch(() => {});
  }
}

function* walk(dir) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) yield* walk(p);
    else yield p;
  }
}

checkTemplateContainment();
checkModuleBoundaries();
checkSharedFolderHoldsNoLayouts();
await checkEveryPageDeclaresItself();

if (failed) {
  console.error("page-architecture: FAIL");
  process.exit(1);
}
console.log("page-architecture: PASS - primitives are shared, layouts are not.");
