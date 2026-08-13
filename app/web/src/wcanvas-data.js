/* ═══════════════════════════════════════════════════════════════════════════
   WCANVAS DATA — every read, every write, and the grid arithmetic.
   Agent B, 12 Aug 2026, for Agent I. No JSX in this file on purpose: the grid
   algorithm is the part most likely to be wrong, and it is easier to reason
   about when it is not tangled with rendering.

   THE DATA LAYER IS AGENT I'S AND IS CONSUMED AS SERVED. This file computes no
   business figure of its own. It reads:

     v_my_dashboards            the caller's dashboards      (0 rows = new user)
     v_dashboard_templates      the six house starters
     v_my_layout                the caller's arrangement     (0 rows = not set up)
     v_widget_catalog_available the picker, incl. has_no_drill
     widget_catalog             the COMPUTE spec: agg, value_col, filters
     kpi_targets                owner-set targets            (never a number we chose)
     v_dashboard_trend          real daily snapshots         (never a drawn line without them)
     v_room_board_complete      room → department, so no room is shown bare (J7)
     v_tag_evidence             certificate and manifest per tag (C3a)
     <widget.table_ref>         the figure and the records behind it

   and it writes only through the functions Agent I built:
     tg_save_layout · tg_reset_layout · tg_create_dashboard ·
     tg_rename_dashboard · tg_delete_dashboard · tg_set_default_dashboard

   EVERY READ BINDS ITS ERROR. No read here falls back to an empty array and none
   ever will: `rows` is null when the read FAILED and an array when it succeeded,
   so a caller cannot mistake a failure for an empty result. That distinction is
   the whole reason a blank dashboard is this platform's classic silent failure.
   ═══════════════════════════════════════════════════════════════════════════ */
import { supabase } from "./lib/supabase.js";

/* ═══════════ the read shape ═══════════
   rows === null  →  the read failed and `err` says how.
   rows === []    →  the read succeeded and there is genuinely nothing.
   Nothing else. */
export async function read(query) {
  const { data, error, count } = await query;
  if (error) return { rows: null, err: error.message, count: null };
  return { rows: Array.isArray(data) ? data : data == null ? [] : [data], err: null, count: count ?? null };
}

export async function callRpc(fn, args) {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) return { value: null, err: error.message };
  return { value: data, err: null };
}

/* ═══════════ the grid ═══════════
   Twelve columns, mirroring the database exactly:
     x >= 0 and x < 12 · w between 1 and 12 · h between 1 and 12 · y >= 0
     and the constraint named `fits_the_grid`: x + w <= 12.
   The canvas clamps to the same bounds BEFORE saving so a legal gesture is
   never rejected — and the save path still surfaces the database's own message
   if one ever gets through, because a guard you have also implemented in the
   client is still the authority. */
export const GRID_COLS = 12;
export const MAX_H = 12;

/* `Number(v) || dflt` is wrong here and the fixture caught it: it treats a
   legitimate ZERO as a missing value. A resize dragged down through zero height
   then jumped to the default of two rows instead of stopping at one — the panel
   grew while the user was shrinking it. Absent and nought are different values,
   which is the same distinction this whole platform turns on. */
const num = (v, dflt) => {
  if (v === null || v === undefined || v === "") return dflt;
  const n = Number(v);
  return Number.isFinite(n) ? n : dflt;
};

export const clampItem = (it) => {
  const w = Math.min(GRID_COLS, Math.max(1, Math.round(num(it.w, 3))));
  const h = Math.min(MAX_H, Math.max(1, Math.round(num(it.h, 2))));
  const x = Math.min(GRID_COLS - w, Math.max(0, Math.round(num(it.x, 0))));
  const y = Math.max(0, Math.round(num(it.y, 0)));
  return { ...it, x, y, w, h };
};

const overlaps = (a, b) =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

/* Pull everything up into the space above it. Processing in reading order means
   a panel can never rise past one that was already settled, so this cannot
   introduce an overlap. */
export function compact(items) {
  const order = [...items].sort((a, b) => a.y - b.y || a.x - b.x);
  const out = [];
  for (const raw of order) {
    const it = { ...raw };
    while (it.y > 0 && !out.some((p) => overlaps(p, { ...it, y: it.y - 1 }))) it.y -= 1;
    out.push(it);
  }
  return out;
}

/* Resolve overlaps by pushing the displaced panel DOWN, never the one the user
   is holding. The half-row bias is what makes the held panel sort first and so
   win its position — without it, dragging onto an occupied cell bounces the
   held panel away from where the user dropped it. */
export function resolve(items, heldUid) {
  const bias = (it) => (it.uid === heldUid ? it.y - 0.5 : it.y);
  const order = [...items].sort((a, b) => bias(a) - bias(b) || a.x - b.x);
  const placed = [];
  for (const raw of order) {
    const it = clampItem({ ...raw });
    while (placed.some((p) => overlaps(p, it))) it.y += 1;
    placed.push(it);
  }
  return compact(placed);
}

/* First hole big enough, scanning left to right and top to bottom, so a new
   panel fills a gap rather than always landing at the bottom of a long board. */
export function firstFreeSlot(items, w, h) {
  const ww = Math.min(GRID_COLS, Math.max(1, w));
  const hh = Math.min(MAX_H, Math.max(1, h));
  const bottom = items.reduce((m, i) => Math.max(m, i.y + i.h), 0);
  for (let y = 0; y <= bottom; y++) {
    for (let x = 0; x + ww <= GRID_COLS; x++) {
      const probe = { x, y, w: ww, h: hh };
      if (!items.some((i) => overlaps(i, probe))) return { x, y };
    }
  }
  return { x: 0, y: bottom };
}

/* ═══════════ filters, exactly as the catalogue declares them ═══════════
   The catalogue's own operators, measured 12 Aug 2026 across the 45 metric
   widgets: eq · neq · gt · gte · lt · lte · like · is_null · not_null.

   AN OPERATOR THIS FUNCTION DOES NOT KNOW IS AN ERROR, NEVER A SKIP. Skipping
   one silently returns a number computed WITHOUT that filter — larger than the
   truth and indistinguishable from it on screen. That is not hypothetical here:
   App.jsx's own runWidget has no `gt` branch, so on the older Dashboards screen
   `recon_unexplained` (unexplained > 0) and `flags_stale` (days_open > 7) count
   every row in their source. Reported to Agent I; not fixed from this file. */
const OPS = {
  eq: (q, c, v) => q.eq(c, v),
  neq: (q, c, v) => q.neq(c, v),
  /* `in` is not in the catalogue's own vocabulary. It exists because the
     interactive widgets build their OWN filter list from their settings — an
     alerts panel set to "elevated or higher" is severity in (critical,
     elevated) — and those filters must travel to the drill unchanged, or the
     button that says "open every matching alert" opens something else. */
  in: (q, c, v) => q.in(c, Array.isArray(v) ? v : [v]),
  gt: (q, c, v) => q.gt(c, v),
  gte: (q, c, v) => q.gte(c, v),
  lt: (q, c, v) => q.lt(c, v),
  lte: (q, c, v) => q.lte(c, v),
  like: (q, c, v) => q.like(c, v),
  is_null: (q, c) => q.is(c, null),
  not_null: (q, c) => q.not(c, "is", null),
};

const todayISO = () => new Date().toISOString().slice(0, 10);
const daysFromNowISO = (d) => new Date(Date.now() + d * 86400000).toISOString().slice(0, 10);

/* The catalogue uses $today and $in30 as late-bound dates. Anything else with a
   leading $ is a token this canvas has not been taught, and a token rendered
   literally would filter on the string "$next_week" and quietly match nothing. */
function substitute(v) {
  if (v === "$today") return { value: todayISO() };
  if (v === "$in30") return { value: daysFromNowISO(30) };
  if (typeof v === "string" && v.startsWith("$")) {
    return { err: `The filter uses the token "${v}", which this canvas does not understand. The figure is not shown, because a number computed with a filter that did not apply would read as real.` };
  }
  return { value: v };
}

export function applyFilters(query, filters) {
  let q = query;
  for (const f of Array.isArray(filters) ? filters : []) {
    const op = OPS[f.op];
    if (!op) {
      return { q: null, err: `The filter operator "${f.op}" is not one this canvas understands, so the figure is not shown. Ignoring it would produce a number computed without that filter — larger than the truth and impossible to spot on screen.` };
    }
    const sub = substitute(f.val);
    if (sub.err) return { q: null, err: sub.err };
    q = op(q, f.col, sub.value);
  }
  return { q, err: null };
}

/* ═══════════ is this source empty, or did nothing match? ═══════════
   K1 question 5: silence must be distinguishable from success. A count of zero
   from a filtered read means one of two completely different things, and the
   difference is the difference between "nobody is scheduled today" and "the
   schedule table has never had a row written to it". Measured 12 Aug 2026:
   employee_schedules 0 · time_entries 0 · tasks 0 · work_orders 0, while
   employees holds 32 and v_payroll_forecast holds 21. */
const sourceTotals = new Map();
export async function sourceRowCount(source) {
  if (sourceTotals.has(source)) return sourceTotals.get(source);
  const r = await read(supabase.from(source).select("*", { count: "exact", head: true }));
  const out = r.err ? { total: null, err: r.err } : { total: r.count ?? 0, err: null };
  sourceTotals.set(source, out);
  return out;
}
export const forgetSourceTotals = () => sourceTotals.clear();

/* ═══════════ a metric widget's figure ═══════════
   Returns exactly one of: a value, or an error, or a stated reason there is no
   figure. Never a dash, never a zero standing in for "not measured". */
const PAGE = 1000;
const SUM_SCAN_CAP = 20000;

export async function runMetric(spec) {
  const base = () => supabase.from(spec.table_ref);

  if (spec.agg === "sum") {
    if (!spec.value_col) {
      return { err: `${spec.key} is declared as a total but names no column to total. That is a catalogue defect, not a missing number.` };
    }
    let scanned = 0, total = 0, exact = null, from = 0;
    for (;;) {
      const built = applyFilters(base().select(spec.value_col, { count: "exact" }), spec.filters);
      if (built.err) return { err: built.err };
      const r = await read(built.q.range(from, from + PAGE - 1));
      if (r.err) return { err: r.err };
      exact = r.count ?? exact;
      for (const row of r.rows) total += Number(row[spec.value_col] ?? 0);
      scanned += r.rows.length;
      if (r.rows.length < PAGE) break;
      if (scanned >= SUM_SCAN_CAP) {
        /* A partial total is a wrong total. Say so rather than show it. */
        return { err: `This total covers ${scanned.toLocaleString()} rows and the source holds ${(exact ?? 0).toLocaleString()}. A total of part of the rows would read as the whole, so no figure is shown. Open the records to work the full set.` };
      }
      from += PAGE;
    }
    const empty = scanned === 0 ? await sourceRowCount(spec.table_ref) : null;
    return { value: total, rows: exact ?? scanned, emptySource: empty && empty.total === 0 };
  }

  const built = applyFilters(base().select("*", { count: "exact", head: true }), spec.filters);
  if (built.err) return { err: built.err };
  const r = await read(built.q);
  if (r.err) return { err: r.err };
  const n = r.count ?? 0;
  const empty = n === 0 ? await sourceRowCount(spec.table_ref) : null;
  return { value: n, rows: n, emptySource: empty ? empty.total === 0 : false };
}

/* ═══════════ the records behind the figure ═══════════
   C1: one click into the exact records, no summarising, no sampling, no top-N.
   Loaded in pages so a 19,000-row source does not lock the browser, with the
   count of what is loaded against the count of what exists stated on the panel
   at all times — a drill that shows 200 of 24,000 without saying so IS
   sampling, whatever it is called.

   ORDERED, because an unordered range is not a stable page: PostgREST would be
   free to return the same row twice across two pages and neither one would look
   wrong. The column used is named on the panel. */
export async function probeColumns(source) {
  const r = await read(supabase.from(source).select("*").limit(1));
  if (r.err) return { cols: null, err: r.err };
  return { cols: r.rows.length ? Object.keys(r.rows[0]) : [], err: null };
}

export const orderColumnFor = (cols) => {
  if (!cols || !cols.length) return null;
  for (const c of ["id", "tag", "package_tag", "key", "created_at"]) if (cols.includes(c)) return c;
  return cols[0];
};

export async function fetchDrillPage(source, filters, orderCol, from, size) {
  let sel = supabase.from(source).select("*", { count: "exact" });
  const built = applyFilters(sel, filters);
  if (built.err) return { rows: null, err: built.err, count: null };
  let q = built.q;
  if (orderCol) q = q.order(orderCol, { ascending: true, nullsFirst: false });
  return read(q.range(from, from + size - 1));
}

/* ═══════════ rooms — a room is NEVER shown without its department (J7) ═══════
   Eleven names exist in both Cultivation and Manufacturing and 65% of held
   packages sit in a shared name, so a bare room name shows the wrong room two
   thirds of the time. v_room_board_complete carries room, department, licence
   and room_qualified, so the qualified name is READ, never assembled here.

   Where one bare name resolves to two rooms the canvas says so and names both.
   It does not choose — choosing is how a total ends up spanning two buildings. */
/* WHICH COLUMN MEANS WHAT — read, never hardcoded (§7: filters are DATA, never JSX).
 *
 * This file previously carried TAG_COLS and ROOM_COLS as literal arrays in wcanvas-kinds.jsx,
 * and App.jsx still carries nine more copies of the same idea. Eleven definitions of "which
 * column holds a package tag": rename one column in Metrc and ten of them go quietly wrong.
 * column_semantics is the one definition; this reads it.
 *
 * It DEGRADES LOUDLY, not silently. If the read fails, meansFor() returns an empty list and
 * every caller is told why, rather than a tag quietly rendering as plain text and nobody
 * knowing the drill link vanished. */
let COLUMN_MEANS = null;
let COLUMN_MEANS_ERR = null;

export async function loadColumnSemantics() {
  const r = await read(supabase.from("v_column_semantics").select("means, column_names"));
  if (r.err) {
    COLUMN_MEANS_ERR = r.err;
    return { err: r.err };
  }
  /* No `?? []` on either line below, deliberately. A meaning that arrives with no column names
     is a broken dictionary row, and defaulting it to an empty list would hide that behind tags
     quietly rendering as plain text. It is dropped and named instead. */
  const empty = r.rows.filter((row) => !Array.isArray(row.column_names) || row.column_names.length === 0);
  COLUMN_MEANS = new Map(
    r.rows.filter((row) => Array.isArray(row.column_names) && row.column_names.length > 0)
          .map((row) => [row.means, row.column_names]));
  COLUMN_MEANS_ERR = empty.length
    ? `${empty.map((e) => e.means).join(", ")} carry no column names in column_semantics`
    : null;
  return { err: null };
}

const meansFor = (kind) => {
  if (!COLUMN_MEANS) return EMPTY;
  const hit = COLUMN_MEANS.get(kind);
  return hit === undefined ? EMPTY : hit;
};
const EMPTY = Object.freeze([]);

/* Null when nothing in this record set is a package tag — which is a real answer, not a failure. */
export const tagColumnIn = (cols) => meansFor("package_tag").find((c) => cols.includes(c)) ?? null;
export const isRoomColumn = (col) => meansFor("room").includes(col);

/* So a surface can say WHY a tag stopped linking, instead of the link just not being there. */
export const columnSemanticsProblem = () =>
  COLUMN_MEANS_ERR
    ? `The column dictionary could not be read (${COLUMN_MEANS_ERR}), so tags are shown as plain text and rooms are not department-qualified.`
    : null;

export async function loadRoomDirectory() {
  const r = await read(supabase.from("v_room_board_complete").select("room, department, room_qualified"));
  if (r.err) return { map: null, err: r.err };
  const map = new Map();
  for (const row of r.rows) {
    const k = String(row.room ?? "").trim().toLowerCase();
    if (!k) continue;
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(row);
  }
  return { map, err: null };
}

export function qualifyRoom(map, value) {
  const raw = value == null ? "" : String(value).trim();
  if (!raw) return { text: "", note: null };
  if (!map) return { text: raw, note: "the room directory could not be read, so the department behind this name is not shown" };
  const hits = map.get(raw.toLowerCase());
  if (!hits || !hits.length) {
    return { text: raw, note: "this name is not in the room directory, so its department is not recorded" };
  }
  if (hits.length === 1) return { text: hits[0].room_qualified ?? raw, note: null };
  return {
    text: raw,
    note: `two rooms share this name — ${hits.map((h) => h.room_qualified).join(" and ")} — so the department cannot be told from the name alone`,
  };
}

/* ═══════════ certificate and manifest, per row (C3a) ═══════════
   v_tag_evidence resolves the certificate directly, then by inheritance from a
   parent package, then a lab result with no certificate, then nothing — and
   when nothing, it serves the sentence saying why. The signed link is minted at
   click time and never stored: all 3,666 stored URLs were signed together and
   expire on one day.

   REPOINTED FROM mv_tag_evidence, 13 Aug 2026, in the same commit as
   dashkit.jsx so the two evidence readers can never disagree about which view
   is authoritative. Same 4,553 tags; columns 1-15 identical in name, order and
   type; 182 tags gain an openable certificate the matview served as absent and
   none loses one. Until both readers said v_, certified material read as
   uncertified on every screen.

   `select("*")` means the four appended columns arrive here with no further
   change: certificate_grade, certificate_hops, certificate_client and
   certificate_client_license. evidence_source carries a FIFTH value,
   `certificate on file` — Metrc's lab result names the certificate and the
   document opens, but the document does not print that tag. Nothing in this
   module branches on evidence_source, so the new value passes through
   untouched; EvidenceCell in wcanvas-kinds.jsx tests only for `inherited` and
   therefore renders it as a working Certificate of Analysis button. That file
   does NOT yet show certificate_grade — it is owned by another session and is
   deliberately left alone here rather than edited behind its back. */
export async function loadEvidence(tags) {
  const list = [...new Set(tags.filter(Boolean).map(String))];
  if (!list.length) return { map: new Map(), err: null };
  const CHUNK = 200;
  const map = new Map();
  for (let i = 0; i < list.length; i += CHUNK) {
    const r = await read(supabase.from("v_tag_evidence").select("*").in("tag", list.slice(i, i + CHUNK)));
    if (r.err) return { map: null, err: r.err };
    for (const row of r.rows) map.set(row.tag, row);
  }
  return { map, err: null };
}

export async function signDocument(path) {
  const { data, error } = await supabase.storage.from("metrc-documents").createSignedUrl(path, 300);
  if (error || !data?.signedUrl) return { url: null, err: error?.message ?? "no link was returned" };
  return { url: data.signedUrl, err: null };
}

/* ═══════════ the canvas's own reads ═══════════ */

/* ═══════════ who is asking, and what they are allowed to see ═══════════
   Resolved through app_users, which is the auth-to-employee link this platform
   already has. There is no second identity path and none is invented here. */
export async function loadMyIdentity() {
  const { data: sess } = await supabase.auth.getSession();
  const uid = sess && sess.session && sess.session.user ? sess.session.user.id : null;
  const email = sess && sess.session && sess.session.user ? sess.session.user.email : null;
  if (!uid) return { state: "anonymous", uid: null, email: null, name: null, err: null };
  const link = await read(supabase.from("app_users").select("display_name, employee_id").eq("user_id", uid).limit(1));
  if (link.err) return { state: "error", uid, email, name: null, err: link.err };
  const row = link.rows.length ? link.rows[0] : null;
  if (row && row.display_name) return { state: "ready", uid, email, name: row.display_name, err: null };
  if (row && row.employee_id) {
    const emp = await read(supabase.from("employees").select("full_name").eq("id", row.employee_id).limit(1));
    if (emp.err) return { state: "error", uid, email, name: null, err: emp.err };
    if (emp.rows.length && emp.rows[0].full_name) {
      return { state: "ready", uid, email, name: emp.rows[0].full_name, err: null };
    }
  }
  /* Signed in, but this account carries no name anywhere. Said plainly rather
     than invented, because a message signed with a made-up name is a forged
     record in a table people will later read as evidence of who said what. */
  return { state: "unnamed", uid, email, name: null, err: null };
}

/* audit_events is readable only by executives (policy exec_all, USING is_executive()).
   RLS FILTERS, IT DOES NOT ERROR — a non-executive gets zero rows and no message, which
   is indistinguishable on screen from "nothing has happened". This is how the surface
   tells those two apart instead of guessing. */
export const callerIsExecutive = () => callRpc("is_executive");

export const loadChannels = () =>
  read(supabase.from("channels").select("id, name, description").order("name", { ascending: true }));

/* The one write this canvas makes that is not a layout. The insert binds its error and
   returns it; nothing here retries, and nothing here pretends a failed send succeeded. */
export async function sendChannelMessage(channel_id, user_id, author, body) {
  const { error } = await supabase.from("messages").insert({ channel_id, user_id, author, body });
  return { err: error ? error.message : null };
}

export const loadDashboards = () => read(supabase.from("v_my_dashboards").select("*"));
export const loadTemplates = () => read(supabase.from("v_dashboard_templates").select("*"));
export const loadCatalogue = () => read(supabase.from("v_widget_catalog_available").select("*"));

/* The compute spec lives on the base table: v_my_layout and
   v_widget_catalog_available both omit agg, value_col and filters, so a metric
   cannot be computed from the views alone. Raised with Agent I. */
export const loadComputeSpecs = () =>
  read(supabase.from("widget_catalog").select("key, table_ref, agg, value_col, filters, format, widget_kind").eq("enabled", true));

export const loadLayout = (page) => read(supabase.from("v_my_layout").select("*").eq("page", page));
export const loadTargets = () => read(supabase.from("kpi_targets").select("*"));
export const loadTrend = () => read(supabase.from("v_dashboard_trend").select("*"));

/* ═══════════ the canvas's own writes ═══════════
   ONE WRITE PER GESTURE. Coalesced and single-flight: while a save is in the
   air the next arrangement waits, and only the LATEST waiting arrangement is
   sent when the line clears. Dragging a panel across the board must not post
   forty rows of history. */
export function makeSaver(onError) {
  let inFlight = null;
  let queued = null;
  const flush = async () => {
    if (inFlight || !queued) return;
    const job = queued;
    queued = null;
    inFlight = callRpc("tg_save_layout", { p_page: job.page, p_widgets: job.widgets });
    const { err } = await inFlight;
    inFlight = null;
    onError(err);              // null clears a previous failure; a string shows it
    if (queued) flush();
  };
  return {
    save(page, items) {
      queued = {
        page,
        widgets: items.map((i) => ({
          widget_key: i.widget_key,
          instance_id: i.instance_id,
          x: i.x, y: i.y, w: i.w, h: i.h,
          visible: i.visible !== false,
          config: i.config ?? {},
          title_override: i.title_override ?? null,
        })),
      };
      flush();
    },
  };
}

export const resetLayout = (page) => callRpc("tg_reset_layout", { p_page: page });
export const createDashboard = (name, template, key) =>
  callRpc("tg_create_dashboard", { p_name: name, p_template: template ?? null, p_key: key ?? null });
export const renameDashboard = (key, name) => callRpc("tg_rename_dashboard", { p_key: key, p_name: name });
export const deleteDashboard = (key) => callRpc("tg_delete_dashboard", { p_key: key });
export const setDefaultDashboard = (key) => callRpc("tg_set_default_dashboard", { p_key: key });

/* ═══════════ small shared helpers ═══════════ */

export const uidOf = (widget_key, instance_id) => `${widget_key}#${instance_id ?? 1}`;

/* ONE DATE PATTERN ON THIS CANVAS, and one timestamp pattern. Both live here, beside
   formatFigure, because a second definition of "how a date looks" is the DDC defect the
   owner counted: two formats on one page and nobody can tell whether they mean the same
   thing. dateText was defined inside wcanvas-kinds.jsx until 13 Aug 2026; it moved here
   rather than being copied, so the count of definitions went from one to one.

   These take the leading characters of an ISO timestamp deliberately: 2026-08-13T01:53:48Z
   is already in the order a person reads, so nothing is reordered, nothing is localised
   away, and nothing is rounded. The seconds are dropped from stampText and NOTHING ELSE
   is — a feed row states its minute, and the full value is in the drill. */
export const dateText = (v) => (v ? String(v).slice(0, 10) : null);

export function stampText(v) {
  if (!v) return null;
  const s = String(v);
  const day = s.slice(0, 10);
  const minute = s.slice(11, 16);
  return /^\d{2}:\d{2}$/.test(minute) ? `${day} ${minute}` : day;
}

export function formatFigure(value, format) {
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value);
  if (format === "usd") return "$" + Math.round(n).toLocaleString();
  if (format === "lb") return n.toLocaleString(undefined, { maximumFractionDigits: 1 }) + " lb";
  if (format === "pct") return n.toLocaleString(undefined, { maximumFractionDigits: 1 }) + "%";
  return n.toLocaleString(undefined, { maximumFractionDigits: 1 });
}

/* THE SHORT FORM GOES ON THE TILE. Three words at most.
   A KPI tile that needs a paragraph to be honest is the wrong figure — the
   sentence belongs behind the question mark or in the drill, never on the face.
   Learned the hard way on 12 Aug 2026, when a caveat paragraph was rendered
   under a tile and the owner saw a wall of red text. */
export function movementShort(latest, previous) {
  if (latest == null || previous == null) return null;
  const d = Number(latest) - Number(previous);
  if (!Number.isFinite(d)) return null;
  if (d === 0) return "unchanged";
  return `${d > 0 ? "up" : "down"} ${Math.abs(d).toLocaleString(undefined, { maximumFractionDigits: 1 })}`;
}

/* The long form, for the explanation behind the question mark. */
export function movementInWords(latest, previous) {
  if (latest == null || previous == null) return null;
  const d = Number(latest) - Number(previous);
  if (!Number.isFinite(d)) return null;
  if (d === 0) return "unchanged since the previous daily reading";
  const m = Math.abs(d).toLocaleString(undefined, { maximumFractionDigits: 1 });
  return `${d > 0 ? "up" : "down"} ${m} since the previous daily reading`;
}

/* Resolve the settings an instance is actually running with: what the user
   saved, falling back to the schema's own declared default. Never a default
   chosen here — the schema is data precisely so a new option is a database row
   and not a deploy. */
export function resolveConfig(optionsSchema, config) {
  const out = {};
  const schema = optionsSchema && typeof optionsSchema === "object" ? optionsSchema : {};
  for (const [key, def] of Object.entries(schema)) {
    const saved = config && Object.prototype.hasOwnProperty.call(config, key) ? config[key] : undefined;
    out[key] = saved === undefined ? def?.default : saved;
  }
  return out;
}

/* An options_schema select carries either bare strings or objects with a label,
   a value, and often a `note` recording what the option is actually fed by —
   "137 scheduled pulls, real data", "UNFED - work_orders is empty". That note
   is the honest warning and it must reach the screen, so it is normalised here
   rather than dropped. */
export function normaliseOptions(options) {
  return (Array.isArray(options) ? options : []).map((o) =>
    o && typeof o === "object"
      ? { value: o.value, label: o.label ?? String(o.value), note: o.note ?? null, source: o.source ?? null }
      : { value: o, label: String(o), note: null, source: null },
  );
}
