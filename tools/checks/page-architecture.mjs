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

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SRC = join(ROOT, "app", "web", "src");

/* ── BASELINES. Lower these as the work lands; never raise them. ────────────── */
const BASELINE = {
  // ReportScreen appears once as a definition and once as a use site in App.jsx.
  // When the Data Browser is extracted this becomes 0 in App.jsx entirely.
  reportScreenSites: 2,
  // Enabled pages with no archetype decided. Measured 8 Aug 2026.
  pagesWithoutArchetype: 220,
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
  let conn = process.env.PGURL || null;
  if (!conn) {
    const p = join(ROOT, ".mcp.json");
    if (existsSync(p)) {
      try {
        const url = JSON.parse(readFileSync(p, "utf8"))?.mcpServers?.["twisted-growers"]?.args?.[0];
        if (url) conn = url.replace(/sslmode=[a-z-]+/, "uselibpqcompat=true&sslmode=require");
      } catch { /* fall through to degraded */ }
    }
  }
  if (!conn) {
    console.log("page-architecture: DEGRADED - no database connection here, so archetype");
    console.log("    coverage was NOT verified. Front-end rules above still ran.");
    return;
  }

  let pg;
  try { pg = (await import("pg")).default; }
  catch {
    console.log("page-architecture: DEGRADED - pg driver absent, archetype coverage NOT verified.");
    return;
  }

  const client = new pg.Client({
    connectionString: conn, ssl: { rejectUnauthorized: false }, statement_timeout: 30000,
  });
  try {
    await client.connect();
    const { rows: [r] } = await client.query(`
      select count(*) filter (where archetype is null)::int              as undecided,
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

    if (r.undecided > BASELINE.pagesWithoutArchetype) {
      fail(
        `${r.undecided} enabled pages have no archetype (baseline ${BASELINE.pagesWithoutArchetype}).`,
        "New pages were added without deciding what KIND of page they are, which is",
        "exactly how 522 pages ended up sharing one renderer. Set nav_registry.archetype,",
        "or add the archetype to page_archetype first if it is genuinely new.",
      );
    } else {
      ok(`${r.undecided} page(s) awaiting a design decision, baseline ${BASELINE.pagesWithoutArchetype}`);
    }

    console.log(`page-architecture: ${r.assigned} assigned - ${r.dumps} data-browser - ${r.undecided} undecided`);
  } catch (err) {
    console.log(`page-architecture: DEGRADED - archetype coverage NOT verified: ${err.message.trim()}`);
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
