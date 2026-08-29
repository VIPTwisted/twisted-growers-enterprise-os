import test from "node:test";
import assert from "node:assert/strict";

import { rangeSearch, rangeSearchNote, matchesSearch, rangePlan } from "../../app/web/src/lib/range-search.js";

const ROWS = [
  { name: "Gelato F3",    closed_on: "2026-08-19", room: "F3" },
  { name: "Wedding Cake", closed_on: "2026-08-25", room: "F1" },
  { name: "Blue Dream",   closed_on: "2025-05-18", room: "F2" },   // old — outside a August-2026 range
  { name: "Runtz",        closed_on: null,         room: "F4" },   // undated
];
const FIELDS = ["name", "room"];
const AUG = { from: "2026-08-17", to: "2026-08-23" };

test("a range keeps what falls inside it and counts what falls outside", () => {
  const r = rangeSearch(ROWS, { ...AUG, dateField: "closed_on", fields: FIELDS });
  assert.equal(r.kept, 2, "Gelato (in range) plus Runtz (undated)");
  assert.equal(r.outOfRange, 2, "Wedding Cake and Blue Dream are outside");
  assert.equal(r.total, 4);
  assert.equal(r.searching, false);
  assert.equal(r.setAside, false);
});

test("RULE 2 — an undated row is never dropped by a range, and is counted", () => {
  const r = rangeSearch(ROWS, { ...AUG, dateField: "closed_on", fields: FIELDS });
  assert.ok(r.rows.some((x) => x.name === "Runtz"), "the undated row survives the range");
  assert.equal(r.undated, 1, "and the page is told there was one");
});

test("RULE 1 — a search finds a row the range excludes, and says the range was set aside", () => {
  /* Blue Dream closed in May 2025 and the range is one week of August 2026.
     This is the Orders defect in miniature: without rule 1 the answer is "no
     results" and the reader concludes the harvest does not exist. */
  const r = rangeSearch(ROWS, { ...AUG, dateField: "closed_on", q: "blue", fields: FIELDS });
  assert.equal(r.kept, 1);
  assert.equal(r.rows[0].name, "Blue Dream");
  assert.equal(r.searching, true);
  assert.equal(r.setAside, true, "there was a range and it was deliberately ignored");
});

test("searching with no range set does not claim a range was set aside", () => {
  const r = rangeSearch(ROWS, { dateField: "closed_on", q: "blue", fields: FIELDS });
  assert.equal(r.searching, true);
  assert.equal(r.setAside, false);
});

test("a search reads every named field, not just the first", () => {
  const byRoom = rangeSearch(ROWS, { ...AUG, dateField: "closed_on", q: "f2", fields: FIELDS });
  assert.equal(byRoom.kept, 1);
  assert.equal(byRoom.rows[0].name, "Blue Dream");
});

test("no range and no search returns everything, and still counts the undated", () => {
  const r = rangeSearch(ROWS, { dateField: "closed_on", fields: FIELDS });
  assert.equal(r.kept, 4);
  assert.equal(r.outOfRange, 0);
  assert.equal(r.undated, 1);
});

test("an open-ended range is unbounded at that end, not today", () => {
  const fromOnly = rangeSearch(ROWS, { from: "2026-01-01", dateField: "closed_on", fields: FIELDS });
  assert.equal(fromOnly.kept, 3, "both August rows plus the undated one; only 2025 falls out");
  const toOnly = rangeSearch(ROWS, { to: "2025-12-31", dateField: "closed_on", fields: FIELDS });
  assert.equal(toOnly.kept, 2, "Blue Dream plus the undated one");
});

test("a timestamp late on the To-day is inside the range, not outside it", () => {
  const rows = [{ name: "late", at: "2026-08-23T23:45:00Z" }];
  const r = rangeSearch(rows, { from: "2026-08-17", to: "2026-08-23", dateField: "at", fields: ["name"] });
  assert.equal(r.kept, 1, "compared on the calendar day, not the instant");
});

test("a bad or empty date is treated as undated, never as 1970", () => {
  const rows = [{ name: "junk", d: "not a date" }, { name: "blank", d: "" }];
  const r = rangeSearch(rows, { from: "2026-08-17", to: "2026-08-23", dateField: "d", fields: ["name"] });
  assert.equal(r.undated, 2);
  assert.equal(r.kept, 2, "kept rather than silently dropped into the epoch");
});

test("the note tells the reader what was filtered and what was kept anyway", () => {
  const ranged = rangeSearch(ROWS, { ...AUG, dateField: "closed_on", fields: FIELDS });
  const note = rangeSearchNote(ranged, { noun: "harvests", rangeLabel: "this range" });
  assert.match(note, /2 of 4 harvests in this range/);
  assert.match(note, /2 outside it/);
  assert.match(note, /1 carry no date and are kept rather than dropped/);

  const searched = rangeSearch(ROWS, { ...AUG, dateField: "closed_on", q: "blue", fields: FIELDS });
  assert.match(rangeSearchNote(searched, { noun: "harvests" }), /set aside while you search/);
});

test("matchesSearch is case-insensitive and tolerates absent fields", () => {
  assert.equal(matchesSearch({ a: "GELATO" }, ["a", "missing"], "gel"), true);
  assert.equal(matchesSearch({ a: null }, ["a"], "gel"), false);
  assert.equal(matchesSearch({ a: "x" }, ["a"], ""), true, "an empty needle matches everything");
});

test("a non-array input is handled rather than thrown on", () => {
  for (const bad of [null, undefined, {}]) {
    const r = rangeSearch(bad, { ...AUG, dateField: "closed_on", fields: FIELDS });
    assert.equal(r.total, 0);
    assert.equal(r.kept, 0);
  }
});

/* ═══════════════════════════════════════════════════════════════════════════
   rangePlan — the policy the SERVER-side caller asks.

   ReportScreen cannot pull ~619 registered reports into the browser to filter
   them, so it builds a PostgREST query instead. It must reach the same verdict
   as the client filter above, or the two roads answer differently and the rule
   is only half kept. These tests pin the verdict itself, independent of either
   mechanism.
   ═══════════════════════════════════════════════════════════════════════════ */

test("rangePlan — RULE 1: a search suppresses the range, and reports that it did", () => {
  const p = rangePlan({ from: "2026-08-01", to: "2026-08-28", dateField: "closed_on", q: "Twiste-303" });
  assert.equal(p.searching, true);
  assert.equal(p.applyRange, false, "the range must not go on the wire while searching");
  assert.equal(p.setAside, true, "and the page must be told, so it can say so");
});

test("rangePlan — no search means the range applies normally", () => {
  const p = rangePlan({ from: "2026-08-01", to: "2026-08-28", dateField: "closed_on", q: "" });
  assert.equal(p.searching, false);
  assert.equal(p.applyRange, true);
  assert.equal(p.setAside, false);
});

test("rangePlan — searching with NO range set aside nothing, so the page must not claim it did", () => {
  const p = rangePlan({ from: "", to: "", dateField: "closed_on", q: "Runtz" });
  assert.equal(p.searching, true);
  assert.equal(p.applyRange, false);
  assert.equal(p.setAside, false, "there was no range to set aside");
});

test("rangePlan — a range with no date column cannot be applied", () => {
  const p = rangePlan({ from: "2026-08-01", to: "2026-08-28", dateField: null, q: "" });
  assert.equal(p.hasRange, true);
  assert.equal(p.applyRange, false, "nothing to filter on");
});

test("rangePlan — whitespace is not a search", () => {
  const p = rangePlan({ from: "2026-08-01", to: "", dateField: "closed_on", q: "   " });
  assert.equal(p.searching, false);
  assert.equal(p.applyRange, true, "a space must not silently disable the range");
});

test("rangePlan and rangeSearch agree on whether a search is happening", () => {
  for (const q of ["", "   ", "blue", "BLUE", " Runtz "]) {
    const plan = rangePlan({ ...AUG, dateField: "closed_on", q });
    const filtered = rangeSearch(ROWS, { ...AUG, dateField: "closed_on", q, fields: FIELDS });
    assert.equal(plan.searching, filtered.searching, `disagreed on q=${JSON.stringify(q)}`);
    assert.equal(plan.setAside, filtered.setAside, `disagreed on setAside for q=${JSON.stringify(q)}`);
  }
});

/* ─── MONTH GRAIN ───────────────────────────────────────────────────────────
   Several served views ARE monthly and carry `month` as the text "2026-08":
   v_dry_time_discipline (28 months, May 2024 to Aug 2026, measured 29 Aug 2026),
   v_production_forecast, v_goal_status. Asking whether such a row falls inside a
   DAY range is the wrong question — a month is a span, and the right question is
   whether it overlaps. */
const MONTHS = [
  { month: "2026-08", label: "August" },
  { month: "2026-07", label: "July" },
  { month: "2024-05", label: "the oldest scored month" },
  { month: null, label: "unscored" },
];

test("month grain — a partial month at the start of the range is IN range", () => {
  /* this_month_td on 29 August: the range covers 1–29 August, not all 31 days.
     A day comparison would put "2026-08" before "2026-08-01" and drop the very
     month the reader is looking at. */
  const r = rangeSearch(MONTHS, {
    from: "2026-08-01", to: "2026-08-29", dateField: "month", grain: "month", fields: ["label"],
  });
  assert.ok(r.rows.some((x) => x.month === "2026-08"), "August survives its own to-date range");
  assert.equal(r.outOfRange, 2, "July and May 2024 fall outside");
  assert.equal(r.undated, 1, "the unscored month is kept and counted, never dropped");
});

test("month grain — a month is never parsed through Date", () => {
  /* new Date("2026-08") is midnight UTC on the 1st, which west of Greenwich
     reads back as 31 July — the row would leave a range starting on its own
     first day. Comparing YYYY-MM as text has no timezone in it at all. */
  const r = rangeSearch([{ month: "2026-08" }], {
    from: "2026-08-01", to: "2026-08-31", dateField: "month", grain: "month",
  });
  assert.equal(r.kept, 1);
  assert.equal(r.outOfRange, 0);
});

test("month grain — a full YYYY-MM-DD date is cut to its month, not rejected", () => {
  const r = rangeSearch([{ month: "2026-07-14" }], {
    from: "2026-07-01", to: "2026-07-31", dateField: "month", grain: "month",
  });
  assert.equal(r.kept, 1, "a date-shaped value still places into its month");
  assert.equal(r.undated, 0);
});

test("day grain is unchanged by the month option existing", () => {
  const r = rangeSearch(ROWS, { ...AUG, dateField: "closed_on", fields: FIELDS });
  assert.equal(r.kept, 2);
  assert.equal(r.outOfRange, 2);
  assert.equal(r.undated, 1);
});
