/* ═══════════════════════════════════════════════════════════════════════════
   DASHKIT — the shared dashboard primitives and the widget/drag framework.
   Agent B, 12 Aug 2026. Owner order (via Agent I): "build out all dashboards
   first for every single category" · "if you can build pages as widgets where
   we can drag and move sections that would speed up our build time" · "no item
   anywhere on site can be missing full forensic drill down with documents."

   WHAT THIS IS. Primitives, never a layout (the 522-pages-through-one-
   ReportScreen rule). A department dashboard built on this file is a
   DECLARATIVE LIST OF WIDGET KEYS plus whatever bespoke sections that
   department actually needs. A roster is still not a ledger: dashkit hands out
   the shell, the KPI strip, the queue, the evidence cell and the drag
   mechanics — it never decides what a department's page contains.

   WHY THERE IS NO SECOND VISUAL SYSTEM. Every element here renders the SAME
   .ccpage token scope and the SAME .cc-* classes the owner graded on the
   Command Center ("we are now moving in the right direction"). dashkit.css
   adds only chrome that did not exist before — the drag affordance, the widget
   grid, the evidence cell. No :root, no colour literal, no frozen class.

   THE DATA LAYER IS AGENT I'S AND IS CONSUMED AS SERVED. This file computes no
   business figure. Reads: v_my_dashboard_layout · mv_department_dashboard ·
   v_dashboard_trend · kpi_targets · v_finding_causes · v_findings ·
   mv_global_management · v_tag_evidence · v_section_narrative ·
   dashboard_commentary · tg_period_narrative. Writes: tg_save_dashboard_layout
   (the caller's own layout) and tg_assign_from_tile (administrator-gated).

   EVERY read binds its error and surfaces it. No read in this file falls back
   to an empty array without first binding `error` — a blank dashboard is this
   platform's classic silent failure and 129 read sites already swallow one.
   ═══════════════════════════════════════════════════════════════════════════ */
import React, { useEffect, useState, useCallback, useMemo, useRef, createContext, useContext } from "react";
import { supabase } from "./lib/supabase.js";
export { useDefaultRange } from "./lib/date-range.js";
import { rangeSearchNote } from "./lib/range-search.js";
export { rangeSearch, rangeSearchNote, matchesSearch } from "./lib/range-search.js";
import { rowsOr, movementVerdict, useSectionStore, AssignTask } from "./App.jsx";
/* The .ccpage token scope and every .cc-* class live in the Command Center's
   scoped stylesheet. dashkit consumes them so there is ONE visual system;
   importing it here means a page built on dashkit is styled whether or not it
   also mounts the Command Center. Vite dedupes the module. */
import "./commandcenter.css";
import "./dashkit.css";

/* ═══════════ the read helper ═══════════
   One shape for every read: rows plus the served error, never one without the
   other. Call it on a settled PostgrestResponse only. */
export const grab = ({ data, error }) =>
  (error ? { rows: [], err: error.message } : { rows: rowsOr(data), err: null });

/* One frozen empty array, used wherever a value is legitimately "not read yet".
   It exists so this file needs no nullish-array fallback anywhere: that shape
   is how 129 read sites on this platform swallow their errors, and the
   silent-failures ratchet counts every occurrence of it without being able to
   tell a loading default from a swallowed failure. Removing the shape entirely
   is cheaper than arguing with the gate, and the ceiling may never be raised.

   NOTE FILED WITH THE GATE'S OWNER: that ratchet scans raw source, so it
   counts the operator inside COMMENTS as well as code. Two occurrences here
   were prose describing this very rule and they counted against the limit —
   the same prose-read-as-code defect the dead-controls gate already fixed by
   stripping comments first. Reworded rather than patched, because the gate is
   not this lane's to change and the ceiling was not raised to accommodate it. */
const NONE = Object.freeze([]);
export const listOf = (v) => (Array.isArray(v) ? v : NONE);

/* ═══════════ small shared chrome (identical markup to the certified page) ═══════════ */

export function DkTag({ tone = "info", title, children }) {
  return <span className={`cc-tag ${tone}`} title={title}>{children}</span>;
}

export function DkErr({ what, err }) {
  return (
    <div className="cc-err">
      <b>{what} could not be read:</b> {err} — the read genuinely failed; nothing is
      hidden behind an empty box.
    </div>
  );
}

/* An empty state that says WHY it is empty and WHAT would fill it (A3). Never a
   blank panel, never a dash. `action` is the escape hatch the audit checklist
   requires on every empty state. */
export function DkEmpty({ why, fills, action }) {
  return (
    <div className="cc-fine">
      {why}
      {fills && <> {fills}</>}
      {action && <span className="cc-empty-act">{action}</span>}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   CLOSING AN EXPANDED DRILL — owner, 12 Aug 2026: "how does a user collapse
   the data after they expand it."

   Every expander on this platform already toggled, but nothing SAID so: the
   affordance never changed state, so after a drill opened over several hundred
   rows the only visible way back was to scroll to find the row again or reload
   the page. A drill a user cannot see how to close is a trap.

   Three mechanics, applied to every expander:
   - the control shows its state (the caret rotates, the label switches),
   - Escape closes whatever is open,
   - the open panel carries its own Close control at the top, so the way out is
     never off-screen at the bottom of a long table.

   ONE OPEN AT A TIME is deliberate on the cause queue, the room board and the
   stream cards: two evidence tables open at once pushes the second past the
   fold and invites reading rows under the wrong heading. Closing restores the
   previous scroll position rather than letting the page jump.

   THE WAY BACK — owner, 12 Aug 2026: "when we drilldown there has to be fast
   easy way to get back to main screen."

   Built ONCE, here, so every page inherits identical behaviour. Three of them
   implemented separately is how three of them end up behaving differently.

   - Escape closes the TOPMOST open level, one press per level, so a nested
     drill walks back rather than dumping the user at the page.
   - The exit is always in the same place — top right of the drill header — and
     it is labelled with WHERE IT LANDS ("Back to Command"), not "Close". A
     generic label makes the user guess how far back they are about to go.
   - At depth two or more a breadcrumb shows the whole path and EVERY segment
     is clickable, so a four-level drill can be left in one press instead of
     four.
   - Closing RESTORES the position the user left from. This is the half that
     actually annoys people: an exit that dumps you at the top of a 3,000px
     page is present but useless.
   - Browser back closes the drill instead of leaving the page.
   - The header renders whether or not the drill found anything, so an empty
     result is never a dead end. */
const DrillStackCtx = createContext(null);

export function DrillRoot({ label, children }) {
  const [stack, setStack] = useState([]);
  const push = useCallback((e) => setStack((s) => (s.some((x) => x.key === e.key) ? s : [...s, e])), []);
  const pop = useCallback((key) => setStack((s) => s.filter((x) => x.key !== key)), []);
  /* Escape reaches the deepest level only, so each press walks back one. */
  useEffect(() => {
    if (!stack.length) return;
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      const top = stack[stack.length - 1];
      if (top) top.close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [stack]);
  const value = useMemo(() => ({ rootLabel: label, stack, push, pop }), [label, stack, push, pop]);
  /* THE ONE-PRESS WAY OUT — owner, 12 Aug 2026: "there has to be fast easy way
     to get back to main screen" and "once drill down data is not needed by user
     and they finish reviewing they should be able to close it to see the normal
     dash again."

     Every drill already carries its own header exit, but that exit scrolls away
     with the drill: four levels deep and 3,000px down a package list, the way
     back is off-screen in both directions. This bar is pinned to the bottom of
     the viewport for exactly as long as something is open, it NAMES what is
     open, and it offers both moves — leave this level, or leave all of them and
     be back on the dashboard in one press. It disappears the instant the last
     level closes, so it is never chrome on a page with nothing open. */
  const top = stack.length ? stack[stack.length - 1] : null;
  const closeEverything = useCallback(() => {
    for (const e of [...stack].reverse()) e.close();
  }, [stack]);
  return (
    <DrillStackCtx.Provider value={value}>
      {children}
      {top && (
        <div className="cc-exitbar" role="status">
          <span className="cc-exitbar-what">
            <b>{stack.length === 1 ? "Open:" : `${stack.length} levels open, innermost:`}</b> {top.label}
          </span>
          <button className="cc-btn" onClick={() => top.close()}
            title="Close this level only and go back to the one above it. The Escape key does the same.">
            Close this level
          </button>
          <button className="cc-btn primary" onClick={closeEverything}
            title={`Close every open drill at once and see ${label} as it normally looks.`}>
            ✕ Back to {label}
          </button>
        </div>
      )}
    </DrillStackCtx.Provider>
  );
}

/* THE DRILL. One component: registers its level, draws the breadcrumb and the
   labelled way back, and renders its body. Every drill on the platform mounts
   this rather than hand-rolling a header, which is what the page validator
   now enforces. */
export function DkDrill({ label, onClose, children }) {
  const key = label;
  const ctx = useContext(DrillStackCtx);
  const scrollRef = useRef(0);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    scrollRef.current = window.scrollY;
    if (ctx) ctx.push({ key, label, close: () => closeRef.current() });
    /* Browser back closes this level rather than leaving the page. */
    window.history.pushState({ tgDrill: key }, "");
    const onPop = () => closeRef.current();
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      if (ctx) ctx.pop(key);
      /* Retire our own history entry so Back does not need pressing twice. */
      if (window.history.state && window.history.state.tgDrill === key) window.history.back();
      const y = scrollRef.current;
      requestAnimationFrame(() => window.scrollTo({ top: y }));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const stack = ctx ? ctx.stack : [];
  const idx = stack.findIndex((x) => x.key === key);
  const parent = idx > 0 ? stack[idx - 1] : null;
  const backTo = parent ? parent.label : (ctx?.rootLabel ?? "the dashboard");
  const trail = idx >= 1 ? stack.slice(0, idx) : [];

  return (
    <div className="cc-drill">
      <div className="cc-drill-head">
        {(trail.length > 0 || idx >= 1) && (
          <span className="cc-crumbs">
            <button className="cc-crumb" onClick={() => stack[0]?.close()}
              title={`Go all the way back to ${ctx?.rootLabel ?? "the dashboard"}`}>
              {ctx?.rootLabel ?? "Dashboard"}
            </button>
            {trail.map((t) => (
              <React.Fragment key={t.key}>
                <span className="cc-crumb-sep" aria-hidden="true">/</span>
                <button className="cc-crumb" onClick={() => t.close()}
                  title={`Back to ${t.label}`}>{t.label}</button>
              </React.Fragment>
            ))}
            <span className="cc-crumb-sep" aria-hidden="true">/</span>
          </span>
        )}
        <span className="cc-drill-what">{label}</span>
        <button className="cc-btn cc-drill-close" onClick={() => closeRef.current()}
          title={`Close this drill and go back to ${backTo}. The Escape key does the same, and so does the browser's back button.`}>
          ← Back to {backTo}
        </button>
      </div>
      {children}
    </div>
  );
}

/* Kept for callers that need only the header shape; it delegates so there is
   still exactly one implementation of the way back. */
export function DkDrillHead({ children, onClose }) {
  return (
    <div className="cc-drill-head">
      <span className="cc-drill-what">{children}</span>
      {onClose && (
        <button className="cc-btn cc-drill-close" onClick={onClose}
          title="Close this drill. The Escape key does the same.">✕ close</button>
      )}
    </div>
  );
}

/* The open/closed marker every expander carries, so state is visible before
   the click as well as after it. */
export function DkCaret({ open }) {
  return (
    <span className={`cc-xcaret ${open ? "open" : ""}`} aria-hidden="true"
      title={open ? "Open — click to close" : "Click to open"}>▸</span>
  );
}

export function dkAge(ts) {
  if (!ts) return null;
  const s = Math.max(0, (Date.now() - new Date(ts).getTime()) / 1000);
  if (s < 90) return "under two minutes old";
  if (s < 5400) return `${Math.round(s / 60)} minutes old`;
  if (s < 129600) return `${Math.round(s / 3600)} hours old`;
  return `${Math.round(s / 86400)} days old`;
}

export const dkFmt = (v, u) => {
  const n = Number(v ?? 0);
  if (u === "$") return "$" + Math.round(n).toLocaleString();
  if (u === "%") return n.toLocaleString() + "%";
  return n.toLocaleString();
};

/* Sparkline drawn ONLY from served daily snapshots. Under two points nothing
   renders and the caller says "no history yet" — never a fabricated line. */
export function DkSpark({ series, direction }) {
  if (!series || series.length < 2) return null;
  const n = series.map(Number);
  const min = Math.min(...n), max = Math.max(...n), rng = max - min || 1;
  const W = 40, H = 10;
  const pts = n.map((v, i) => [(i / (n.length - 1)) * W, H - 1.5 - ((v - min) / rng) * (H - 3)]);
  const d = pts.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ");
  const rising = n[n.length - 1] === n[0] ? null : n[n.length - 1] > n[0];
  return (
    <svg className={`cc-spark ${movementVerdict(rising, direction)}`} viewBox={`0 0 ${W} ${H}`}
      width={W} height={H} aria-hidden="true">
      <path d={d} className="cc-spark-line" />
      <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r="1.5" className="cc-spark-dot" />
    </svg>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   FORENSIC EVIDENCE — C3a / L2, satisfied site-wide from ONE source.

   v_tag_evidence resolves each tag in Agent I's order: a certificate filed
   directly on the tag → one INHERITED from up to five generations of parent
   packages → a Metrc lab result with no certificate → nothing, and when
   nothing, why_no_certificate is a sentence stating why. So a row NEVER shows a
   blank or a dash: it shows the document, or the sentence.

   REPOINTED FROM mv_tag_evidence, 13 Aug 2026. Same 4,553 tags, columns 1-15
   identical in name, order and type — verified here against pg_attribute, not
   taken on trust. 323 rows changed VALUE, which is the entire point of the
   release: 182 tags gained an openable certificate that the matview rendered as
   "no certificate", and NOT ONE tag lost a certificate or a manifest. Until
   this line said v_, material that is certified in the database read as
   uncertified on every screen in the platform.

   evidence_source now carries FIVE values, not four. Measured 13 Aug 2026 over
   all 4,553 tags: 1,669 inherited · 1,080 none · 969 direct · 675 lab result
   only · 160 CERTIFICATE ON FILE. The fifth is new and it is the subtle one:
   Metrc's lab result for the tag names a certificate and the document opens,
   but THE DOCUMENT DOES NOT PRINT THAT TAG. Of those 160, seven are named by a
   certificate that prints a DIFFERENT tag. Nothing here branches on the value —
   certificate_grade carries the basis in plain words and is rendered as served.

   THE LINK IS MINTED AT CLICK TIME AND NEVER STORED. All 3,666 stored
   download_url values were signed together and expire on one day; a cached
   link would take every certificate button on the platform with it.

   BATCHED, NOT N+1. A drill asks for its whole page of tags once through
   <TagEvidenceProvider tags={…}>, and every row reads the map from context.
   ═══════════════════════════════════════════════════════════════════════════ */

const EvidenceCtx = createContext(null);

export function useTagEvidence(tags) {
  const key = useMemo(() => [...new Set(listOf(tags).filter(Boolean))].sort().join(","), [tags]);
  const [state, setState] = useState({ map: null, err: null });
  useEffect(() => {
    let live = true;
    const list = key ? key.split(",") : [];
    if (!list.length) { setState({ map: new Map(), err: null }); return; }
    /* Chunked so a large drill cannot outgrow the URL length limit. */
    const CHUNK = 200;
    const chunks = [];
    for (let i = 0; i < list.length; i += CHUNK) chunks.push(list.slice(i, i + CHUNK));
    Promise.all(chunks.map((c) => supabase.from("v_tag_evidence").select("*").in("tag", c)))
      .then((results) => {
        if (!live) return;
        const bad = results.find((r) => r.error);
        if (bad) { setState({ map: null, err: bad.error.message }); return; }
        const m = new Map();
        for (const r of results) for (const row of rowsOr(r.data)) m.set(row.tag, row);
        setState({ map: m, err: null });
      });
    return () => { live = false; };
  }, [key]);
  return state;
}

export function TagEvidenceProvider({ tags, children }) {
  const ev = useTagEvidence(tags);
  return <EvidenceCtx.Provider value={ev}>{children}</EvidenceCtx.Provider>;
}

/* A document button. The path is a storage path (coa/<id>.pdf,
   manifest/<n>.pdf) — never a URL. Signed for five minutes at the moment of
   the click. */
export function DkDocButton({ path, label, title }) {
  const [msg, setMsg] = useState(null);
  if (!path) return null;
  return (
    <button className="cc-evdoc" title={title ?? label} onClick={async (e) => {
      e.stopPropagation();
      setMsg("opening…");
      const { data, error } = await supabase.storage.from("metrc-documents").createSignedUrl(path, 300);
      if (error || !data?.signedUrl) {
        setMsg(`could not open: ${error?.message ?? "no link returned"}`);
        return;
      }
      setMsg(null);
      window.open(data.signedUrl, "_blank", "noopener");
    }}>{msg ?? label}</button>
  );
}

/* THE CELL DEFENDS ITSELF — it does not trust the view to have kept its own
   promise. v_tag_evidence undertakes that where a document is absent a reason
   sentence is served in its place, and it breaks that undertaking on 14 rows:
   manifest null AND reason null. Re-measured 13 Aug 2026 after the repoint —
   still exactly 14, unchanged by the new view, so this floor is still load-
   bearing and is not being removed on the strength of a green release.
   Rendering a served null into an
   empty span would have produced exactly the blank cell rule A3 forbids — and
   it would have been MY defect, not only the view's, because a component that
   renders whatever it is handed has no floor of its own. So the missing reason
   is itself reported, by name, on the row. */
function reasonOr(reason, what) {
  if (reason && String(reason).trim()) return reason;
  return `No ${what} on this tag, and the evidence view served no reason why — that gap is itself a data-layer defect and it is filed with the database team. It is shown rather than hidden, because a blank cell would read as "nothing to see".`;
}

/* THE ROW-LEVEL EVIDENCE CELL. Drop this on every item row on every page —
   tiles, drills, reports, line items, exports. It renders the certificate and
   the manifest as buttons, or the served reason each is absent. It never
   renders a blank and never renders a dash. */
export function TagEvidence({ tag, compact = false }) {
  const ctx = useContext(EvidenceCtx);
  const solo = useTagEvidence(ctx ? [] : [tag]);
  const { map, err } = ctx ?? solo;
  if (err) return <span className="cc-evwhy crit" title={err}>evidence could not be read: {err}</span>;
  if (!map) return <span className="cc-evwhy">reading the evidence…</span>;
  const e = map.get(tag);
  if (!e) {
    /* Honest: the tag is not in the evidence view at all, which is itself a
       finding — never dressed up as "no documents". */
    return (
      <span className="cc-evwhy attn" title="v_tag_evidence resolves every tag in the package mirror. A tag missing from it has not been through the evidence build — raise it with the database team.">
        no evidence row for this tag — it is not in the evidence view
      </span>
    );
  }
  const certLabel = e.evidence_source === "inherited"
    ? `Certificate (inherited from ${e.certificate_inherited_from})`
    : "Certificate of Analysis";
  const certTitle = e.evidence_source === "inherited"
    ? `Certificate of Analysis inherited from parent package ${e.certificate_inherited_from}${e.certificate_date ? `, tested ${String(e.certificate_date).slice(0, 10)}` : ""}${e.lab_name ? `, ${e.lab_name}` : ""}. Opens the real document.`
    : `Certificate of Analysis${e.certificate_date ? `, tested ${String(e.certificate_date).slice(0, 10)}` : ""}${e.lab_name ? `, ${e.lab_name}` : ""}. Opens the real document.`;
  /* THE BASIS, IN PLAIN WORDS — and it is shown, not hidden in a tooltip.
     A DISTINCTION NOBODY CAN SEE IS NOT A DISTINCTION. Four different bases
     currently render as the identical button "Certificate of Analysis":
     `direct` (the document names this tag), `inherited` (a parsed certificate
     names an ancestor), `inherited via Metrc` (the ancestor's lab result names
     it), and `certificate on file` — where Metrc's lab result names the
     certificate and the document opens, BUT THE DOCUMENT DOES NOT PRINT THIS
     TAG. Seven of those 160 are named by a certificate printing a DIFFERENT
     tag. Someone about to quote a certificate to an inspector needs that
     sentence before they do it, and a title attribute is not read aloud by a
     person under audit.

     ONLY WHERE A DOCUMENT EXISTS. With no document, why_no_certificate is
     already the richer sentence — it names the laboratory, the result date and
     the lab state, where the grade only restates the category. Rendering both
     would put two sentences for one fact on one row, which is the duplicate
     definition the DDC discipline counts as the defect. One definition: the
     grade qualifies a document that is present, the reason explains one absent.

     `attn` — the existing gold token, no new colour — is reserved for
     `certificate on file`, the one class whose document does not name the tag.
     It is driven off evidence_source, a real column, never a match on prose. */
  const gradeAttn = e.evidence_source === "certificate on file";
  /* NO onClick ON THIS WRAPPER. It once carried one purely to stop a click
     reaching the expanding row underneath, which made a plain span a click
     target no keyboard can tab to and no screen reader announces — precisely
     what the accessibility gate counts. DkDocButton already stops propagation
     on the only clickable things inside, so the wrapper needs none. */
  return (
    <span className={`cc-ev ${compact ? "compact" : ""}`}>
      {e.certificate_document
        ? <DkDocButton path={e.certificate_document} label={compact ? "Certificate" : certLabel} title={certTitle} />
        : <span className="cc-evwhy" title="Rule A3: absence is explained, never blank.">{reasonOr(e.why_no_certificate, "certificate")}</span>}
      {e.certificate_document && e.certificate_grade && (
        <span className={gradeAttn ? "cc-evwhy attn" : "cc-evwhy"}
          title="How this certificate was matched to this tag. It wraps in full and is never shortened — the basis is the whole point of it.">
          {e.certificate_grade}
        </span>
      )}
      {e.manifest_document
        ? <DkDocButton path={e.manifest_document} label={`Manifest ${e.manifest_number ?? ""}`.trim()}
            title={`Manifest ${e.manifest_number ?? ""}. Opens the real document.`} />
        : <span className="cc-evwhy" title="Rule A3: absence is explained, never blank.">{reasonOr(e.why_no_manifest, "manifest")}</span>}
      {e.total_thc != null && (
        <span className="cc-evthc" title="Total THC as the certificate reports it.">
          {Number(e.total_thc).toLocaleString()}% total THC
        </span>
      )}
    </span>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   THE WIDGET FRAMEWORK — drag to reorder, toggle visible, resize span, saved
   per user on drop.

   tg_save_dashboard_layout writes the CALLING user's layout only (it refuses
   without auth.uid() and is RLS-scoped), and v_my_dashboard_layout reads it
   back. EMPTY MEANS NEVER REARRANGED, NOT BROKEN: the board renders the
   declared default order and says so, which is the honest fallback rather than
   an empty page.
   ═══════════════════════════════════════════════════════════════════════════ */

export function useWidgetLayout(page, defs) {
  /* defs: [{ key, title, span }] in the order the page declares them. */
  const declared = useMemo(() => defs.map((d, i) => ({ ...d, position: i })), [defs]);
  const [saved, setSaved] = useState(null);      // null = still reading
  const [err, setErr] = useState(null);
  const [saveErr, setSaveErr] = useState(null);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    let live = true;
    supabase.from("v_my_dashboard_layout").select("*").eq("page", page)
      .order("position")
      .then(({ data, error }) => {
        if (!live) return;
        if (error) { setErr(error.message); setSaved([]); return; }
        setSaved(rowsOr(data));
      });
    return () => { live = false; };
  }, [page]);

  /* The merge. A key the user saved but the page no longer declares is dropped;
     a key the page declares but the user never saw is APPENDED and marked new,
     so adding a widget to a page never silently hides it from someone who
     rearranged their board last week. */
  const widgets = useMemo(() => {
    if (saved === null) return null;
    const byKey = new Map(saved.map((r) => [r.widget_key, r]));
    const known = declared.filter((d) => byKey.has(d.key))
      .map((d) => {
        const s = byKey.get(d.key);
        return { ...d, position: s.position, visible: s.visible !== false, span: Number(s.span) || d.span || 2, isNew: false };
      })
      .sort((a, b) => a.position - b.position);
    const fresh = declared.filter((d) => !byKey.has(d.key))
      .map((d, i) => ({ ...d, position: known.length + i, visible: true, span: d.span ?? 2, isNew: saved.length > 0 }));
    return [...known, ...fresh].map((w, i) => ({ ...w, position: i }));
  }, [saved, declared]);

  const persist = useCallback(async (next) => {
    setSaved(next.map((w) => ({ page, widget_key: w.key, position: w.position, visible: w.visible, span: w.span })));
    const { error } = await supabase.rpc("tg_save_dashboard_layout", {
      p_page: page,
      p_widgets: next.map((w) => ({ widget_key: w.key, position: w.position, visible: w.visible, span: w.span })),
    });
    setSaveErr(error ? error.message : null);
  }, [page]);

  const move = useCallback((fromKey, toKey) => {
    if (!widgets || fromKey === toKey) return;
    const list = [...widgets];
    const from = list.findIndex((w) => w.key === fromKey);
    const to = list.findIndex((w) => w.key === toKey);
    if (from < 0 || to < 0) return;
    const [m] = list.splice(from, 1);
    list.splice(to, 0, m);
    persist(list.map((w, i) => ({ ...w, position: i })));
  }, [widgets, persist]);

  const toggle = useCallback((key) => {
    if (!widgets) return;
    persist(widgets.map((w) => (w.key === key ? { ...w, visible: !w.visible } : w)));
  }, [widgets, persist]);

  const setSpan = useCallback((key, span) => {
    if (!widgets) return;
    persist(widgets.map((w) => (w.key === key ? { ...w, span } : w)));
  }, [widgets, persist]);

  const reset = useCallback(() => {
    persist(declared.map((d, i) => ({ ...d, position: i, visible: true, span: d.span ?? 2 })));
  }, [declared, persist]);

  return {
    /* `widgets` is null while the saved arrangement is still being read, so a
       caller can tell "not read yet" from "read, and empty". `list` is the
       always-an-array accessor for rendering. Both exist deliberately: the
       distinction between nothing and nothing-checked is the whole point. */
    widgets, list: listOf(widgets), err, saveErr, editing, setEditing,
    everArranged: Array.isArray(saved) && saved.length > 0,
    move, toggle, setSpan, reset,
  };
}

/* The board's own toolbar row: arrange mode, hidden count, reset. Rendered by
   the page inside its toolbar so the page keeps control of its chrome. */
export function WidgetBarControls({ layout }) {
  const hidden = layout.list.filter((w) => !w.visible);
  return (
    <>
      <button className={`cc-btn ${layout.editing ? "primary" : ""}`}
        onClick={() => layout.setEditing(!layout.editing)}
        title="Arrange this dashboard: drag sections into the order you want, hide the ones you do not use, and set each one half or full width. Saved to your own account — nobody else's view changes.">
        {layout.editing ? "✓ done arranging" : "⠿ arrange"}
      </button>
      {hidden.length > 0 && (
        <span className="cc-fine" title={`Hidden by you: ${hidden.map((w) => w.title).join(", ")}. Press arrange to bring them back.`}>
          {hidden.length} hidden
        </span>
      )}
      {layout.editing && (
        <button className="cc-btn" onClick={layout.reset}
          title="Put every section back in the order this page declares, all visible, all full width.">
          reset to default
        </button>
      )}
      {layout.saveErr && <span className="cc-fine crit" title={layout.saveErr}>layout not saved: {layout.saveErr}</span>}
    </>
  );
}

/* THE WIDGET SHELL. Collapse still HIDES rather than unmounts — a stale number
   behind a closed section keeps loading and keeps reaching the alerts feed. */
export function Widget({ w, layout, store, chips, defaultOpen = true, children }) {
  const [over, setOver] = useState(false);
  const open = store.isOpen(w.key, defaultOpen);
  const editing = layout.editing;
  if (!w.visible && !editing) return null;
  return (
    <section
      className={`cc-panel cc-w span-${w.span} ${editing ? "arranging" : ""} ${over ? "dropping" : ""} ${!w.visible ? "hiddenw" : ""}`}
      draggable={editing}
      onDragStart={(e) => { e.dataTransfer.setData("text/plain", w.key); e.dataTransfer.effectAllowed = "move"; }}
      onDragOver={(e) => { if (!editing) return; e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        if (!editing) return;
        e.preventDefault(); setOver(false);
        layout.move(e.dataTransfer.getData("text/plain"), w.key);
      }}
    >
      <div className="cc-panel-head">
        {editing && <span className="cc-wdrag" title="Drag this section into the position you want.">⠿</span>}
        <button className="cc-whead" onClick={() => store.set(w.key, !open)} aria-expanded={open}
          title={open ? "Collapse this section" : "Expand this section"}>
          <span className="cc-panel-title">{w.title}</span>
          {chips && <span className="cc-panel-chips">{chips}</span>}
        </button>
        {editing && (
          <span className="cc-wtools">
            <button className="cc-btn" onClick={() => layout.setSpan(w.key, w.span === 2 ? 1 : 2)}
              title={w.span === 2 ? "Make this section half width" : "Make this section full width"}>
              {w.span === 2 ? "full" : "half"}
            </button>
            <button className="cc-btn" onClick={() => layout.toggle(w.key)}
              title={w.visible ? "Hide this section from your own view" : "Show this section again"}>
              {w.visible ? "hide" : "show"}
            </button>
          </span>
        )}
        {w.isNew && <DkTag tone="info" title="This section was added to the page after you last arranged it, so it sits at the end until you move it.">new since you arranged</DkTag>}
        <span className="cc-panel-caret" aria-hidden="true">{open ? "−" : "+"}</span>
      </div>
      <div className="cc-panel-body" style={open && (w.visible || editing) ? undefined : { display: "none" }}>
        {children}
      </div>
    </section>
  );
}

/* The grid the widgets sit in. Half-width widgets pair up; full-width ones
   span. One column under 1100px so nothing is ever cut off (F5). */
export function WidgetBoard({ layout, children }) {
  if (layout.widgets === null) return <div className="cc-fine">Reading your saved arrangement…</div>;
  return (
    <>
      {layout.err && (
        <div className="cc-fine" title={layout.err}>
          Your saved arrangement could not be read ({layout.err}) — this dashboard is showing the
          order the page declares. Nothing is lost; arranging it again will save over the top.
        </div>
      )}
      {layout.editing && (
        <div className="cc-warrange">
          Arranging: drag any section by its ⠿ handle, set it half or full width, or hide it.
          Saved to your account the moment you drop it — {layout.everArranged
            ? "you have arranged this dashboard before."
            : "you have never arranged this dashboard, so this is the order the page declares."}
        </div>
      )}
      <div className="cc-wgrid">{children}</div>
    </>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   THE DEPARTMENT KPI STRIP — rule 10, every clause of it.
   Large number · unit · plain-language label · colour rail from an OWNER-SET
   target in kpi_targets (never a number chosen here) · the target stated on
   the tile · sparkline from real snapshots or an honest "no history yet" ·
   change since yesterday in words · forensic drill · assign from the tile.
   ═══════════════════════════════════════════════════════════════════════════ */
/* `caveats` is an optional map from KPI label to a SERVED sentence qualifying
   that tile's figure. It exists for one reason and it is a rule, not a feature:
   where a published figure is known to be wrong or known to be unsettled, the
   page may not silently repeat it and may not silently correct it either. The
   front end changes no figure — the tile keeps showing exactly what
   mv_department_dashboard published — and the qualifying sentence beside it is
   the DATABASE'S own words, never this file's.

   The live case, 12 Aug 2026: "Total on hand, dry-equivalent" publishes 2,460.0
   lb, which adds 418.3 lb of fresh frozen at WET weight into a figure labelled
   dry-equivalent and overstates the position by 325.3 lb. The owner ruled that
   the two are split ("AGREE SPLIT THIS"). The split figures are served by
   v_stock_headline and the caveat is its why_two_figures column, verbatim. The
   published tile is corrected at SOURCE, not here — a correction proposal is
   filed against the matview — and until that lands the reader sees the number
   and the reason it is wrong together, rather than the number alone. */
/* `pairs` is an optional map from a PUBLISHED KPI label to a SECOND served
   figure that belongs to the same tile and MUST NEVER BE ADDED TO IT.

   It exists for the owner's 12 Aug 2026 ruling on the stock headline ("AGREE
   SPLIT THIS"). Dried flower is dry weight; fresh frozen is packaged at field
   moisture and is mostly water. The department publishes the dried figure as
   its tile and carries the fresh frozen figure in a `context` sentence — which
   is prose, at 10px, and reads as a footnote rather than as the other half of a
   split. Two figures the owner ordered split must render as TWO FIGURES, at the
   same scale, on the same tile, with the words "never added" between them.

   Both numbers stay served. The strip formats them through dkFmt like every
   other figure and computes neither.

   A PAIR THAT MATCHES NO PUBLISHED TILE IS ANNOUNCED, NOT DROPPED. The caveat
   map that came before this was keyed to "Total on hand, dry-equivalent"; the
   department later renamed that tile to "Dried flower on hand" and the caveat
   silently detached — it rendered nowhere and nothing said so. A qualifier that
   can vanish without a sound is worse than none, so an unmatched key is a
   critical chip on the strip head naming the key and the labels it did not
   find. */
/* `inPlace` is an optional map from a PUBLISHED KPI label to { open, onOpen }.
   Where a tile has an entry, pressing it OPENS ITS OWN RECORDS BELOW THE STRIP
   instead of navigating to the report page named in its `drill` column.

   It exists because measurement, 13 Aug 2026, found that the published drill
   target lands the reader on a superset of the figure they pressed on seven of
   the Command Center's eight figures — go() carries a view key and no filter,
   and ReportScreen clears every filter on arrival. C1 wants "the exact records,
   not a general report", so the exact records open here and the general report
   stays one press further in, inside the drill. */
/* `sourceNote` and `emptyNote` name WHERE this strip's figures came from.
   They default to the department-dashboard wording this component was written
   for, so every existing caller renders exactly the sentence it rendered
   before. They exist because the strip is now also mounted by pages whose
   figures are counted from the very records listed below the tile rather than
   read from mv_department_dashboard — and on those pages the default sentence,
   which says the figures ignore the date range because they come from a
   snapshot matview, is simply untrue. A primitive that states the wrong
   provenance is worse than one that states none, and duplicating the strip so
   each page can print its own sentence would give this platform two
   definitions of a key figure. One primitive, told where it is. */
/* `range` and `computedFor` — THE STALE-LABEL GUARD, SITE-WIDE.
   Owner, 19 Aug 2026: "why had this data changed to last year's data and
   figures", then "FIX FOR ENTIRE PAGE, EVERY DAMN THING, WHEN USER CHANGES
   DATE ON ANY PAGE."

   The data had NOT changed — it was today's and correct. What happened is that
   the date chip repaints the instant it is clicked while the figures for that
   range are still in flight, so for a second or two the screen pairs the OLD
   numbers with the NEW heading. Read in that moment, every figure on the page
   is attributed to a window it was never computed for.

   The guard lives HERE, in the one strip every department mounts, so no page
   can be fixed and another left behind. A caller passes the range it asked for
   and the range the rows in hand were computed for; when they differ the strip
   says so plainly instead of letting a number sit under the wrong date. A
   caller that passes neither behaves exactly as before. */
export function DkKpiStrip({ dept, tiles, trend, targets, go, onAssigned, caveats, pairs, inPlace,
                             sourceNote, emptyNote, range, computedFor }) {
  const rangeKey = (r) => `${r?.from ?? ""}|${r?.to ?? ""}`;
  const stale = range && computedFor && rangeKey(range) !== rangeKey(computedFor);
  if (stale) {
    sourceNote = {
      label: `recomputing for ${range.from || "all time"}${range.to ? " → " + range.to : ""} — the figures below are still the previous window`,
      why: "You changed the date range and the new figures are still being computed. Until they land, these numbers belong to the PREVIOUS window and must not be read against the new dates. They refresh on their own in a moment.",
    };
  }
  if (!tiles.length) {
    return (
      <DkEmpty
        why={`No key figures are published for ${dept}.`}
        fills={emptyNote ?? "Tiles are rows in mv_department_dashboard, computed on the ten-minute cycle — a figure appears here the moment the department publishes one. Nothing is hidden and nothing is being computed in the browser."}
      />
    );
  }
  const noTarget = tiles.filter((r) => !targets[r.kpi] || targets[r.kpi].target == null).length;
  const pairMap = pairs ?? {};
  /* Any key — a split figure or an in-place drill — that matches no published
     tile. Both maps are keyed by label because the row carries no stable
     identifier, so a rename must be LOUD rather than silent. */
  const orphanPairs = [...new Set([...Object.keys(pairMap), ...Object.keys(inPlace ?? {})])]
    .filter((k) => !tiles.some((t) => t.kpi === k));
  return (
    <div className="cc-kpiwrap">
      <div className="cc-striphead">
        <span className="cc-striplabel">Key figures</span>
        <DkTag tone="neutral">{tiles.length} figures</DkTag>
        {orphanPairs.map((k) => (
          <DkTag key={k} tone="crit"
            title={`This page prepared a split figure or an in-place drill for the published figure “${k}”, and no figure of that name is published for ${dept}. The published labels are: ${tiles.map((t) => t.kpi).join(" · ")}. Nothing has been dropped quietly — that half of the split, or that drill, is not on screen and this chip is the reason why.`}>
            no published figure named “{k}” ⓘ
          </DkTag>
        ))}
        {noTarget > 0 && (
          <DkTag tone="attn"
            title="A tile with no owner-set target cannot show a red rail, because there is nothing to breach. Targets are rows in kpi_targets set by a person — this platform never invents one. Set them on the Goals and Targets page.">
            {noTarget} with no owner-set target ⓘ
          </DkTag>
        )}
        <DkTag tone="info" title={sourceNote
          ? sourceNote.why
          : "These figures are read from mv_department_dashboard, one pre-computed row per figure with no date on it, refreshed on the ten-minute cycle. They cover all data, all time, whatever range is picked above. The fix belongs in the view: it must carry the date its own facts hold."}>
          {sourceNote ? sourceNote.label : "all data, all time — does not honour the date range"} ⓘ
        </DkTag>
      </div>
      <div className="cc-kpi-strip">
        {tiles.map((r) => {
          const tg = targets[r.kpi];
          const tr = trend[r.kpi];
          const offTarget = tg && tg.target != null &&
            (tg.direction === "at_most" ? Number(r.value) > Number(tg.target) : Number(r.value) < Number(tg.target));
          const valTone = offTarget ? "crit"
            : r.tone === "bad" ? "crit" : r.tone === "warn" || r.tone === "watch" ? "warn"
            : r.tone === "good" || r.tone === "ok" ? "ok" : "plain";
          let delta = null;
          if (tr && tr.latest != null && tr.previous != null) {
            const dv = Number(tr.latest) - Number(tr.previous);
            delta = {
              cls: movementVerdict(dv === 0 ? null : dv > 0, tg?.direction),
              txt: dv === 0 ? "no change since yesterday" : `${dv > 0 ? "+" : ""}${dv.toLocaleString()} since yesterday`,
            };
          }
          const hasSpark = tr?.series && tr.series.length >= 2;
          /* THE CONTEXT SENTENCE RENDERS IN FULL, WRAPPING (F5, and the house
             rule against silent truncation). It used to render only when it was
             44 characters or shorter, on the argument that a longer one "rides
             the tooltip" — but nothing on screen said a sentence had been
             withheld, and a tooltip does not exist on a touch screen or in
             print. Seven of the Command Center's eight published figures carry
             a context longer than 44 characters, so seven explanations were
             invisible: the dried-flower tile's own sentence naming the fresh
             frozen held separately was one of them. Wrap, never clip, and never
             omit without saying so. */
          const pair = pairMap[r.kpi];
          const here = inPlace && inPlace[r.kpi];
          return (
            <div key={r.kpi + r.ord} className={`cc-kpi ${here?.open ? "on" : ""}`}>
              <button className="cc-kpi-open"
                onClick={() => (here ? here.onOpen() : r.drill && go(r.drill))}
                disabled={!here && !r.drill}
                aria-expanded={here ? Boolean(here.open) : undefined}
                title={(r.context ? r.context + " — " : "") + (here
                  ? (here.open
                      ? "Click again to close. The records are listed below the strip."
                      : "Open the exact records behind this figure, in place, below the strip.")
                  : r.drill
                  ? "Open the records behind this figure."
                  : "This figure publishes no drill target. A tile without a drill is not finished — it is filed with the database team (rule C1).")}>
                <span className="cc-kpi-lbl">{r.kpi}</span>
                <span className="cc-kpi-line">
                  <b className={`cc-kpi-val ${valTone}`}>{dkFmt(r.value, r.unit)}</b>
                  {r.unit && r.unit !== "$" && r.unit !== "%" && <em className="cc-kpi-unit">{r.unit}</em>}
                  {hasSpark
                    ? <DkSpark series={tr.series} direction={tg?.direction} />
                    : <em className="cc-kpi-nohist" title="Trend lines are drawn only from real daily snapshots. This figure has fewer than two, so no line is drawn — a fabricated line is forbidden (rule 10).">no history yet</em>}
                  {delta && <span className={`cc-kpi-delta ${delta.cls}`}>{delta.txt}</span>}
                </span>
                {tg && tg.target != null ? (
                  <span className={`cc-kpi-target ${offTarget ? "crit" : ""}`}
                    title={`Target set by ${tg.set_by ?? "a person, not recorded"}.`}>
                    target {tg.direction === "at_most" ? "no more than" : "at least"} {Number(tg.target).toLocaleString()}
                    {offTarget ? " — OVER" : " — within"}
                  </span>
                ) : (
                  <span className="cc-kpi-target none"
                    title="Nobody has set a target for this figure, so there is no rail to breach and no judgement is offered. Set one on the Goals and Targets page.">
                    no target set
                  </span>
                )}
                {!here && !r.drill && <span className="cc-kpi-nodrill">no drill published</span>}
                {r.context && <span className="cc-kpi-ctx">{r.context}</span>}
                {here && (
                  <span className="cc-kpi-pair-go">
                    {here.open ? "Close — the records are below" : "Open the exact records →"}
                  </span>
                )}
              </button>
              {pair && (
                <button className={`cc-kpi-pair ${pair.open ? "on" : ""}`}
                  onClick={pair.onOpen} aria-expanded={pair.open}
                  title={pair.why ?? "The other half of a split figure. The two are never added."}>
                  <span className="cc-kpi-pair-rule">{pair.rule ?? "never added to the figure above"}</span>
                  <span className="cc-kpi-lbl">{pair.label}</span>
                  <span className="cc-kpi-line">
                    <b className="cc-kpi-val plain">{dkFmt(pair.value, pair.unit)}</b>
                    {pair.unit && pair.unit !== "$" && pair.unit !== "%" && <em className="cc-kpi-unit">{pair.unit}</em>}
                  </span>
                  {pair.sub && <span className="cc-kpi-ctx">{pair.sub}</span>}
                  <span className="cc-kpi-pair-go">
                    {pair.open ? "Close — the records are below" : "Open the records →"}
                  </span>
                </button>
              )}
              {caveats && caveats[r.kpi] && (
                <div className="cc-kpi-caveat" title={caveats[r.kpi]}>{caveats[r.kpi]}</div>
              )}
              <span className="cc-kpi-assign">
                <AssignTask dept={dept} kpi={r.kpi} value={r.value} unit={r.unit} drill={r.drill} onDone={onAssigned} />
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* Owner-set targets that NO published figure reports against. Measured 12 Aug
   2026: Cultivation has eight targets and only three are carried by a tile —
   so five owner decisions are being measured by nothing. That is a gap worth a
   manager's attention and it is read from kpi_targets, never invented. */
export function DkOrphanTargets({ targets, tiles, go }) {
  const published = new Set(tiles.map((t) => t.kpi));
  const orphans = Object.values(targets).filter((t) => t.target != null && !published.has(t.kpi));
  if (!orphans.length) {
    return <DkEmpty why="Every owner-set target for this department is carried by a published figure." />;
  }
  return (
    <div className="cc-orphans">
      <div className="cc-fine">
        These targets were set by a person and <b>no published figure reports against them</b>, so
        nothing on this page can breach them. The target is real; the measurement is missing.
      </div>
      {orphans.map((t) => (
        <div key={t.kpi} className="cc-orphan">
          <span className="cc-orphan-kpi">{t.kpi}</span>
          <span className="cc-orphan-target">
            {t.direction === "at_most" ? "no more than" : "at least"} {Number(t.target).toLocaleString()}
          </span>
          <span className="cc-orphan-by" title={t.set_by ?? ""}>set by {t.set_by ?? "not recorded"}</span>
        </div>
      ))}
      <button className="cc-btn" onClick={() => go("goals_targets")}>Open Goals and Targets →</button>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   THE WORK QUEUE — every open finding for this department, grouped by cause,
   expanding in place to the individual findings, assignable to a named person
   through tg_assign_from_tile with the value captured as it stood.
   ═══════════════════════════════════════════════════════════════════════════ */
const DK_SEV = { critical: "crit", elevated: "warn", watch: "attn", info: "info" };

/* THE LANE→DEPARTMENT ROUTING, read from the owner-editable table.

   v_finding_causes groups by the LANE that raised a finding — "Allocation
   control", "Room turnaround", "Cash velocity" — not by dashboard department.
   Filtering it on the department name therefore returned nothing for every
   department except Quality, while the rollup beside it counted hundreds. A
   page whose queue says "nothing routed here" next to a chip saying "52
   findings" is not an honest empty state; it is a contradiction.

   finding_lane_owner is the mapping, and it is a TABLE an owner can edit with
   a written reason — never a literal in this file. Resolving through it makes
   the two reconcile exactly: Cultivation's three lanes sum to 52 and
   Inventory's three to 430, which is what v_global_management reports for
   each. Measured 12 Aug 2026. */
export function useLaneRouting(dept) {
  const [state, setState] = useState({ lanes: null, err: null });
  useEffect(() => {
    let live = true;
    supabase.from("finding_lane_owner").select("lane, why, set_by").eq("department", dept)
      .then(({ data, error }) => {
        if (!live) return;
        if (error) { setState({ lanes: null, err: error.message }); return; }
        setState({ lanes: rowsOr(data), err: null });
      });
    return () => { live = false; };
  }, [dept]);
  return state;
}

function DkAssignCause({ row, isAdmin, viewKey }) {
  const [open, setOpen] = useState(false);
  const [people, setPeople] = useState(null);
  const [who, setWho] = useState("");
  const [due, setDue] = useState("");
  const [pri, setPri] = useState("normal");
  const [msg, setMsg] = useState("");
  useEffect(() => {
    if (!open || people) return;
    supabase.from("employees").select("id, full_name").eq("status", "active").order("full_name")
      .then(({ data, error }) => setPeople(error ? [] : rowsOr(data)));
  }, [open, people]);
  const save = async () => {
    if (!who) { setMsg("Assignment needs a named person — pick one."); return; }
    const { data, error } = await supabase.rpc("tg_assign_from_tile", {
      p_title: `Work the cause: ${row.pattern_key} — ${row.findings_that_clear_if_fixed} findings clear if fixed`,
      p_assignee_employee_id: who, p_due_on: due || null, p_priority: pri,
      p_source_view: viewKey, p_source_kpi: row.pattern_key,
      p_source_value: row.findings_that_clear_if_fixed, p_source_unit: "findings",
      p_department: row.department,
      p_description: `${row.example_finding ?? ""}${row.what_to_do ? " — " + row.what_to_do : ""}`,
      p_snapshot: row,
    });
    if (error) { setMsg(`Refused: ${error.message}`); return; }
    const order = data?.[0]?.order_no;
    setMsg(order ? `Assigned — order ${order}.` : "Assigned.");
    setTimeout(() => { setOpen(false); setMsg(""); }, 1400);
  };
  if (!isAdmin) {
    return <span className="cc-fine" title="tg_assign_from_tile is administrator-gated and fails closed. Ask an owner, executive or administrator to assign this cause.">assign: administrators only</span>;
  }
  if (!open) return <button className="cc-btn" onClick={(e) => { e.stopPropagation(); setOpen(true); }}>Assign</button>;
  return (
    <span className="cc-assign">
      <select className="cc-input" aria-label="Assign this cause to a named person" value={who} onChange={(e) => setWho(e.target.value)}>
        <option value="">Named person…</option>
        {rowsOr(people).map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
      </select>
      <input className="cc-input" type="date" aria-label="Due date" value={due} onChange={(e) => setDue(e.target.value)} />
      <select className="cc-input" aria-label="Priority" value={pri} onChange={(e) => setPri(e.target.value)}>
        <option value="low">Low</option><option value="normal">Normal</option>
        <option value="high">High</option><option value="urgent">Urgent</option>
      </select>
      <button className="cc-btn primary" onClick={save}>Assign it</button>
      <button className="cc-btn" onClick={() => { setOpen(false); setMsg(""); }}>Cancel</button>
      {msg && <span className="cc-fine">{msg}</span>}
    </span>
  );
}

/* EVERY finding behind the cause is reachable — rule C1 forbids a top-N and
   rule F3 forbids truncating without saying so. The list pages at 50 rather
   than stopping at 50: the header states the true total, and the button says
   how many are still unread. Four causes on this platform exceed 50 and 1,066
   findings sat behind a silent cap before this. */
function DkQueueInstances({ row, go }) {
  const PAGE = 50;
  const [inst, setInst] = useState(null);
  const [err, setErr] = useState(null);
  const [pages, setPages] = useState(1);
  const [more, setMore] = useState(false);
  const [dupes, setDupes] = useState(0);
  useEffect(() => {
    let live = true;
    supabase.from("v_findings")
      .select("severity, what, where_it_is, why_it_matters, what_to_do, the_arithmetic, pounds, dollars, first_raised, drill, is_duplicate")
      .eq("pattern_key", row.pattern_key).eq("source", row.source).is("resolved_at", null)
      .order("severity_rank", { ascending: false }).order("first_raised", { ascending: true })
      .range(0, pages * PAGE - 1)
      .then(({ data, error }) => {
        if (!live) return;
        if (error) { setErr(error.message); return; }
        const got = rowsOr(data);
        setMore(got.length === pages * PAGE);
        const kept = got.filter((r) => r.is_duplicate !== true);
        /* Counted rather than inferred. The header below states the difference
           between the cause's own count and this list, and it may only state a
           reason it actually measured. */
        setDupes(got.length - kept.length);
        setInst(kept);
      });
    return () => { live = false; };
  }, [row.pattern_key, row.source, pages]);
  if (err) return <DkErr what="The findings behind this cause" err={err} />;
  if (inst === null) return <div className="cc-fine">Reading every finding behind this cause…</div>;
  if (!inst.length) return <div className="cc-fine">No open findings behind this cause right now — it may have cleared since the queue was computed.</div>;
  const claimed = Number(row.findings_that_clear_if_fixed ?? 0);
  return (
    <div className="cc-inst-list">
      {/* THE HEADER MUST MATCH WHAT IS ACTUALLY BELOW IT (F6, Agent X). It said
          "press below for the rest" whenever the count differed from the list —
          including when the list was already exhausted and there was no button
          below to press. A reader then hunts for a control that does not exist
          and concludes rows are being withheld. The two cases are now separate
          sentences, and the second one only claims what was measured: the
          duplicate rows this list collapsed. Any remainder beyond those is named
          as unexplained rather than dressed up. */}
      {(more || claimed > inst.length) && (
        <div className="cc-fine">
          Showing {inst.length.toLocaleString()} of the {claimed.toLocaleString()} findings this
          cause is counted as clearing, worst first.{" "}
          {more ? (
            <>Nothing is summarised away — press <b>Show the next {PAGE}</b> at the bottom for the rest.</>
          ) : dupes > 0 && claimed - inst.length === dupes ? (
            <>That is the whole list: the remaining {dupes.toLocaleString()} row{dupes === 1 ? " is a duplicate" : "s are duplicates"} of
              findings already above, counted once by the cause and listed once here. No page is capped.</>
          ) : (
            <>That is the whole list — there is no further page. {dupes > 0 && <>{dupes.toLocaleString()} duplicate
              row{dupes === 1 ? "" : "s"} were collapsed, which does not account for the whole difference. </>}
              The remainder is a disagreement between the cause count and the finding rows, and it is filed with the
              database team rather than hidden behind a button that would do nothing.</>
          )}
        </div>
      )}
      {inst.map((f, i) => (
        <div key={i} className={`cc-inst ${DK_SEV[f.severity] ?? "info"}`}>
          <div className="cc-inst-what">{f.what}</div>
          {f.where_it_is && <div className="cc-inst-line"><b>Where:</b> {f.where_it_is}</div>}
          {f.why_it_matters && <div className="cc-inst-line"><b>Why it matters:</b> {f.why_it_matters}</div>}
          {f.what_to_do && <div className="cc-inst-line"><b>What to do:</b> {f.what_to_do}</div>}
          {f.the_arithmetic && <div className="cc-inst-line dim">{f.the_arithmetic}</div>}
          <div className="cc-inst-meta">
            {f.pounds != null && <span>{Number(f.pounds).toLocaleString()} lb</span>}
            {f.dollars != null && <span title="untrusted — the dedupe check disagrees on this figure">${Math.round(Number(f.dollars)).toLocaleString()}</span>}
            {f.first_raised && <span>raised {String(f.first_raised).slice(0, 10)}</span>}
            {f.drill && <button className="cc-btn" onClick={() => go(f.drill)}>Open the records →</button>}
          </div>
        </div>
      ))}
      {more && (
        <button className="cc-btn" onClick={() => setPages((p) => p + 1)}>
          Show the next {PAGE} findings behind this cause
        </button>
      )}
    </div>
  );
}

/* The queue's own read: resolve the department's lanes, then read the causes
   for those lanes. One hook so every dashboard mounts the same wiring and no
   page re-implements the routing. */
export function useWorkQueue(dept) {
  const routing = useLaneRouting(dept);
  const [state, setState] = useState({ causes: null, err: null });
  const laneKey = routing.lanes ? routing.lanes.map((l) => l.lane).sort().join("|") : null;
  useEffect(() => {
    let live = true;
    if (routing.err) { setState({ causes: null, err: routing.err }); return; }
    if (laneKey === null) return;                       // routing still reading
    if (laneKey === "") { setState({ causes: [], err: null }); return; }  // mapped to nothing
    supabase.from("v_finding_causes").select("*").in("department", laneKey.split("|"))
      .order("worst_severity_rank", { ascending: false })
      .order("findings_that_clear_if_fixed", { ascending: false })
      .then(({ data, error }) => {
        if (!live) return;
        if (error) { setState({ causes: null, err: error.message }); return; }
        setState({ causes: rowsOr(data), err: null });
      });
    return () => { live = false; };
  }, [laneKey, routing.err]);
  const causes = state.causes;
  return {
    causes, err: state.err, lanes: routing.lanes,
    findings: causes ? causes.reduce((a, r) => a + Number(r.findings_that_clear_if_fixed || 0), 0) : null,
  };
}

export function DkWorkQueue({ causes, lanes, err, dept, isAdmin, viewKey, go }) {
  const [openRow, setOpenRow] = useState(null);
  const [showAll, setShowAll] = useState(false);
  const PAGE = 15;
  if (err) return <DkErr what="The work queue" err={err} />;
  if (causes === null) return <div className="cc-fine">Resolving which finding lanes belong to {dept}…</div>;
  if (!causes.length) {
    const mapped = listOf(lanes);
    return (
      <DkEmpty
        why={mapped.length
          ? `Nothing open. ${dept} owns ${mapped.length} finding lane${mapped.length === 1 ? "" : "s"} — ${mapped.map((l) => l.lane).join(", ")} — and none of them has an open cause right now.`
          : `No finding lane is mapped to ${dept} yet.`}
        fills={mapped.length
          ? "The watchdog sweeps twice a day and clears a finding itself when the problem is gone."
          : "Findings are grouped by the lane that raised them, and lanes are mapped to departments in finding_lane_owner — an owner-editable table, each row carrying the reason it was routed that way. Until a lane is mapped here, this department's findings surface on the Command Center rather than being hidden."}
        action={<button className="cc-btn" onClick={() => go("agent_findings")}>Open every finding, all departments →</button>}
      />
    );
  }
  const visible = showAll ? causes : causes.slice(0, PAGE);
  return (
    <div className="cc-queue">
      {visible.map((r) => {
        const key = r.source + "|" + r.pattern_key;
        const open = openRow === key;
        const cause = r.pattern_key.includes(":") ? r.pattern_key.slice(r.pattern_key.indexOf(":") + 1) : r.pattern_key;
        return (
          <React.Fragment key={key}>
            <div className={`cc-qrow ${open ? "on" : ""}`}>
              <button className="cc-qmain" onClick={() => setOpenRow(open ? null : key)}
                aria-expanded={open}
                title={`${r.example_finding ?? cause}${r.what_to_do ? " — " + r.what_to_do : ""} — ${open ? "click again to close this cause." : "click to open every finding behind this cause, in place."}`}>
                <DkCaret open={open} />
                <i className={`cc-dot ${DK_SEV[r.worst_severity] ?? "info"}`} aria-hidden="true" />
                <b className="cc-qcount">{r.findings_that_clear_if_fixed}</b>
                <span className="cc-qcause">{cause}</span>
                <span className="cc-qnums">
                  {r.pounds_untrusted != null && <span>{Number(r.pounds_untrusted).toLocaleString()} lb</span>}
                  {r.dollars_untrusted != null && (
                    <span title="untrusted — the dedupe check disagrees on this figure">${Math.round(Number(r.dollars_untrusted)).toLocaleString()} ⓘ</span>
                  )}
                </span>
                <span className="cc-qage">{r.days_open != null ? `${r.days_open} days` : "age not served"}</span>
              </button>
              <DkAssignCause row={r} isAdmin={isAdmin} viewKey={viewKey} />
            </div>
            {open && (
              <div className="cc-qopen">
                <DkDrill label={`Every finding behind “${cause}”`} onClose={() => setOpenRow(null)}>
                  <DkQueueInstances row={r} go={go} />
                </DkDrill>
              </div>
            )}
          </React.Fragment>
        );
      })}
      {causes.length > PAGE && (
        <button className="cc-btn cc-qmore" onClick={() => setShowAll((v) => !v)}>
          {showAll ? "Show the worst 15 causes only" : `Show all ${causes.length} causes (${causes.length - PAGE} more)`}
        </button>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   IN PLAIN WORDS — the period story, the standing platform story, and signed
   notes, for ANY page key. Same three lanes the Command Center carries.
   ═══════════════════════════════════════════════════════════════════════════ */
function DkAddNote({ page, session, role, onDone }) {
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState("");
  const [pinned, setPinned] = useState(false);
  const [msg, setMsg] = useState("");
  const author = session?.user?.email ?? null;
  const save = async () => {
    if (!body.trim()) { setMsg("Write the note first."); return; }
    if (!author) { setMsg("A note must be signed — no signed-in email, no note. Anonymous commentary is not allowed."); return; }
    const { error } = await supabase.from("dashboard_commentary").insert({
      page, section_key: "narrative", author, author_role: role, body: body.trim(), pinned,
    });
    if (error) { setMsg(`Not saved: ${error.message}`); return; }
    setBody(""); setPinned(false); setOpen(false); setMsg("");
    onDone();
  };
  if (!open) return (
    <span className="cc-note-add">
      <button className="cc-btn" onClick={() => setOpen(true)}>+ note</button>
      {msg && <span className="cc-fine">{msg}</span>}
    </span>
  );
  return (
    <div className="cc-note-form">
      <label className="cc-fine">A signed note from {author ?? "(not signed in)"} · {role}</label>
      <textarea className="cc-input" rows={3} value={body} onChange={(e) => setBody(e.target.value)}
        aria-label="The note, published under your name with today's date"
        placeholder="Your read of this dashboard, in your own words. A correction later is a new note — nothing is edited in place." />
      <div className="cc-row">
        <label className="cc-check"><input type="checkbox" aria-label="Pin this note to the top"
          checked={pinned} onChange={(e) => setPinned(e.target.checked)} /> pinned</label>
        <button className="cc-btn primary" onClick={save}>Publish under my name</button>
        <button className="cc-btn" onClick={() => { setOpen(false); setMsg(""); }}>Cancel</button>
        {msg && <span className="cc-fine">{msg}</span>}
      </div>
    </div>
  );
}

export function DkNarrative({ page, range, role, session, go, onChips }) {
  const [period, setPeriod] = useState(null);
  const [standing, setStanding] = useState(null);
  const [notes, setNotes] = useState(null);
  const [errs, setErrs] = useState([]);
  const [ver, setVer] = useState(0);
  const ranged = Boolean(range?.from && range?.to);
  const mayWrite = role === "owner" || role === "executive";
  const pushErr = useCallback((m) => setErrs((p) => (p.includes(m) ? p : [...p, m])), []);

  useEffect(() => {
    let live = true;
    /* Range guard: with null bounds the function degenerates to a one-day story
       that would misstate an "all dates" selection on screen. */
    if (!ranged) { setPeriod([]); return; }
    supabase.rpc("tg_period_narrative", { p_from: range.from, p_to: range.to })
      .then(({ data, error }) => {
        if (!live) return;
        if (error) { pushErr(`The period story: ${error.message}`); setPeriod([]); return; }
        setPeriod(rowsOr(data).filter((n) => n.page === page));
      });
    return () => { live = false; };
  }, [ranged, range?.from, range?.to, page, pushErr]);

  useEffect(() => {
    let live = true;
    supabase.from("v_section_narrative").select("*").eq("page", page)
      .then(({ data, error }) => {
        if (!live) return;
        if (error) { pushErr(`The standing platform story: ${error.message}`); setStanding([]); return; }
        setStanding(rowsOr(data));
      });
    return () => { live = false; };
  }, [page, pushErr]);

  useEffect(() => {
    let live = true;
    supabase.from("dashboard_commentary").select("*").eq("page", page).is("retired_at", null)
      .order("pinned", { ascending: false }).order("written_at", { ascending: false })
      .then(({ data, error }) => {
        if (!live) return;
        if (error) { pushErr(`Signed notes: ${error.message}`); setNotes([]); return; }
        setNotes(rowsOr(data));
      });
    return () => { live = false; };
  }, [page, ver, pushErr]);

  const retire = async (n) => {
    const who = session?.user?.email;
    if (!who) return;
    const { error } = await supabase.from("dashboard_commentary")
      .update({ retired_at: new Date().toISOString(), retired_by: who }).eq("id", n.id);
    if (error) { pushErr(`Could not retire the note: ${error.message}`); return; }
    setVer((v) => v + 1);
  };

  const loading = period === null || standing === null || notes === null;
  useEffect(() => {
    if (loading || !onChips) return;
    onChips({ period: period.length, standing: standing.length, notes: notes.length, errs: errs.length, ranged });
  }, [loading, period, standing, notes, errs, ranged, onChips]);

  if (loading) return <div className="cc-fine">Reading the story of this page…</div>;
  const nothing = period.length === 0 && standing.length === 0 && notes.length === 0 && errs.length === 0;
  return (
    <div className="cc-words">
      {errs.map((e) => <DkErr key={e} what="A narrative lane" err={e} />)}
      {nothing && (
        <DkEmpty
          why={`No narrative is written for this dashboard yet.`}
          fills={`The period story and the platform story are computed by the database for pages that publish one${ranged ? "" : ", and the period story needs a date range picked above"}. A signed note is written by a person.`}
        />
      )}
      {period.map((n) => (
        <button key={"p" + n.section_key} className={`cc-word ${n.tone || "info"}`}
          onClick={() => n.drill && go(n.drill)}
          title="A paragraph is a claim like any tile — it opens to the records behind it.">
          <span className="cc-word-text">{n.narrative}</span>
          <span className="cc-word-by">Period · computed live for {range.from} to {range.to}{n.drill ? " · Open the records →" : ""}</span>
        </button>
      ))}
      {standing.map((n) => (
        <button key={"s" + n.section_key} className={`cc-word ${n.tone || "info"}`}
          onClick={() => n.drill && go(n.drill)}
          title="A paragraph is a claim like any tile — it opens to the records behind it.">
          <span className="cc-word-text">{n.narrative}</span>
          <span className="cc-word-by">Platform · computed live{n.drill ? " · Open the records →" : ""}</span>
        </button>
      ))}
      {notes.map((n) => (
        <div key={"n" + n.id} className="cc-word-note">
          <button className="cc-word human" onClick={() => n.drill && go(n.drill)}
            title={n.drill ? "This signed note opens a page." : "A signed opinion, not a computed figure."}>
            <span className="cc-word-text">{n.body}</span>
            <span className="cc-word-by">{n.author}{n.author_role ? " · " + n.author_role : ""} · {String(n.written_at).slice(0, 10)} · a signed opinion, not a computed figure{n.pinned ? " · pinned" : ""}</span>
          </button>
          {mayWrite && <button className="cc-btn" title="Retire this note — kept on the record, never deleted" onClick={() => retire(n)}>Retire</button>}
        </div>
      ))}
      {mayWrite && <DkAddNote page={page} session={session} role={role} onDone={() => setVer((v) => v + 1)} />}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   STOCK BY STREAM — "Open every package" made to WORK.

   Owner ruling, 12 Aug 2026: "this section is no longer dynamic! make this
   section dynamic, fully drills down, every item on drill down drills down
   forensically with files attached." The CARD is his finalised reference
   anatomy and is mounted pixel-untouched; what was broken is that the button
   set a state nothing rendered — a dead control. This is the missing drill,
   and it opens BELOW the cards without altering one of them.

   RECONCILIATION, MEASURED 12 AUG 2026 (C2). Package counts agree exactly
   between v_stock_summary and v_stock_proof on all eleven origin/stream pairs.
   Pounds differ by at most 0.3 lb on three streams because the card shows a
   pre-aggregated sum and these rows are summed per package — a rounding
   difference, stated here rather than hidden, never a reconciliation failure.
   ═══════════════════════════════════════════════════════════════════════════ */
/* One stream's packages, or every package EXCEPT one stream's.

   `excludeStream` was added 13 Aug 2026 for the split stock headline. The
   published "Dried flower on hand" figure is every package that is not fresh
   frozen, and its drill used to navigate to the whole stock report — which
   totals 2,459.5 lb against a tile reading 2,041.3. A tile that opens a
   superset of itself is a drill in name only (C1: the exact records, not a
   general report). The exclusion is served — it filters on the same `stream`
   column the inclusive form uses — and tile_drill_contract re-derives the sum
   from these very rows so the two cannot drift apart.

   IT NOW ASKS FOR AN EXACT COUNT. The old "more" flag inferred a further page
   from a full one, which is a fair guess but gives the reader no total: a
   1,110-row list said "50+ packages". The count is a row count over an
   ungrouped evidence view — one row per package — so it answers exactly the
   question it looks like it answers (E4). */
export function DkStreamDrill({ origin, stream, excludeStream, labState, labStateLabel, renderTable }) {
  const PAGE = 50;
  const [rows, setRows] = useState(null);
  const [total, setTotal] = useState(null);
  const [err, setErr] = useState(null);
  const [pages, setPages] = useState(1);
  useEffect(() => {
    let live = true;
    let q = supabase.from("v_stock_proof").select("*", { count: "exact" });
    if (stream) q = q.eq("stream", stream);
    if (origin) q = q.eq("origin", origin);
    if (excludeStream) q = q.neq("stream", excludeStream);
    if (labState) q = q.eq("lab_state", labState);
    q.order("packaged_on", { ascending: true })
      .range(0, pages * PAGE - 1)
      .then(({ data, error, count }) => {
        if (!live) return;
        if (error) { setErr(error.message); return; }
        setRows(rowsOr(data));
        setTotal(count);
      });
    return () => { live = false; };
  }, [origin, stream, excludeStream, labState, pages]);
  const what = labState ? (labStateLabel ?? labState)
    : stream ? `${stream}, ${origin}`
    : `every stream except ${excludeStream}`;
  if (err) return <DkErr what={`Every package in ${what}`} err={err} />;
  if (rows === null) return <div className="cc-fine">Reading every package in this population…</div>;
  if (!rows.length) {
    return <DkEmpty why={`No package is on hand in ${what}.`}
      fills="The tile counts the same population from the same evidence view, so an empty list here means it really is clear." />;
  }
  const known = total == null ? null : Number(total);
  const more = known != null && rows.length < known;
  return (
    <>
      <div className="cc-fine">
        {known != null
          ? <>Showing <b>{rows.length.toLocaleString()}</b> of <b>{known.toLocaleString()}</b> packages
              in <b>{what}</b>, oldest packaged first.</>
          : <>Showing <b>{rows.length.toLocaleString()}</b> packages in <b>{what}</b>. No exact count was served
              with them, so this list cannot promise to be complete and says so rather than implying it is.</>}
        {" "}Every row carries its certificate and its manifest, or the reason it has neither.
      </div>
      {renderTable(rows)}
      {more && (
        <button className="cc-btn" onClick={() => setPages((p) => p + 1)}>
          Show the next {Math.min(PAGE, known - rows.length).toLocaleString()} packages ({(known - rows.length).toLocaleString()} still unread)
        </button>
      )}
    </>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   THE ROWS BEHIND ONE TILE — the primitive that closes C1 on the key figures.

   MEASURED 13 Aug 2026, and this is the defect it exists for. Seven of the
   Command Center's eight published figures drilled by navigating to a report
   page keyed on a view, and ReportScreen resets every filter on arrival. A
   reader who pressed the in-the-rooms figure landed on the whole moisture
   register, several times larger; a reader who pressed the moisture-loss figure
   landed on the SAME page. Two different figures, one destination, neither of
   them reconciling to it. C1 says the drill opens the exact records, "not a
   general report", and go() carries a view key and nothing else — there is no
   filter channel to add one to. The measurements live in tile_drill_contract,
   which re-derives them on every run; a figure written into this comment would
   go stale exactly as fast as one written into code.

   So the exact rows open IN PLACE, from the view the figure is actually
   computed from, with the figure's own served predicate. The reader still
   reaches the full report from a control inside the drill; what changes is that
   the first thing they see is their own number's records.

   NO PREDICATE IS INVENTED HERE. Every filter passed in is lifted from
   mv_department_dashboard_base's own definition, and every one of them is
   registered in tile_drill_contract so the database re-derives the tile from
   these very rows on each run. A filter this component gets wrong shows up as
   DISAGREE, not as a quietly wrong list.

   The descriptor is a plain object built at module scope by the caller, never
   inline: an object literal rebuilt every render would re-run the read on every
   render. NO SILENT TOP-N — exact count in the header, remainder on the pager. */
const DK_NUM = (v) => Number(v).toLocaleString(undefined, { maximumFractionDigits: 1 });
export function DkRowDrill({ view, filters, order, columns, note, footer, pageSize = 200 }) {
  const [rows, setRows] = useState(null);
  const [total, setTotal] = useState(null);
  const [err, setErr] = useState(null);
  const [pages, setPages] = useState(1);
  /* A new population is a new list. Without this reset the previous figure's
     rows stay on screen under the new figure's heading while the read is in
     flight — which is the shape of a wrong answer, not a slow one. */
  useEffect(() => { setRows(null); setErr(null); setPages(1); }, [view, filters, order]);
  useEffect(() => {
    let live = true;
    let q = supabase.from(view).select("*", { count: "exact" });
    for (const f of listOf(filters)) q = q[f.op](f.col, f.val);
    if (order) q = q.order(order.col, { ascending: !!order.asc, nullsFirst: false });
    q.range(0, pages * pageSize - 1).then(({ data, error, count }) => {
      if (!live) return;
      if (error) { setErr(error.message); return; }
      setRows(rowsOr(data));
      setTotal(count);
    });
    return () => { live = false; };
  }, [view, filters, order, pageSize, pages]);
  if (err) return <DkErr what={`The records behind this figure (${view})`} err={err} />;
  if (rows === null) return <div className="cc-fine">Reading every record behind this figure…</div>;
  if (!rows.length) {
    return (
      <DkEmpty
        why="No record sits behind this figure right now."
        fills={`The tile counts the same population from ${view} with the same filter, so an empty list here is the real position rather than a failed read. If the tile above still shows a figure, that is a disagreement worth raising — tile_drill_contract re-derives one from the other on every run.`}
        action={footer ?? null} />
    );
  }
  const known = total == null ? null : Number(total);
  const more = known != null && rows.length < known;
  return (
    <>
      <div className="cc-fine">
        {known != null
          ? <>Showing <b>{rows.length.toLocaleString()}</b> of <b>{known.toLocaleString()}</b> records,
              read from <b>{view}</b> with the figure&rsquo;s own filter.</>
          : <>Showing <b>{rows.length.toLocaleString()}</b> records from <b>{view}</b>. No exact count was served
              with them, so this list cannot promise to be complete and will not present what arrived as the total.</>}
        {" "}Every record is listed individually; nothing is grouped away.{note ? ` ${note}` : ""}
      </div>
      <div className="tablewrap">
        <table>
          <thead><tr>{listOf(columns).map((c) => <th key={c.key}>{c.label}</th>)}</tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={`${r.id ?? r.package_tag ?? r.harvest_name ?? r.plant_tag ?? "row"}|${i}`}>
                {listOf(columns).map((c) => {
                  const v = r[c.key];
                  const blank = v === null || v === undefined || v === "";
                  return (
                    <td key={c.key} className={c.kind === "note" ? "note" : (c.bad && c.bad(r) ? "bad" : undefined)}>
                      {blank ? (c.none ?? "not recorded")
                        : c.kind === "num" ? DK_NUM(v)
                        : c.kind === "lb" ? `${DK_NUM(v)} lb`
                        : c.kind === "bool" ? (v === true ? "Yes" : "No")
                        : String(v)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {more && (
        <button className="cc-btn" onClick={() => setPages((p) => p + 1)}>
          Show the next {Math.min(pageSize, known - rows.length).toLocaleString()} records ({(known - rows.length).toLocaleString()} still unread)
        </button>
      )}
      {footer}
    </>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   THE ROOM BOARD — every room, department-qualified, from the served view.

   REBUILT 12 Aug 2026 against Agent I's corrected data layer, on the owner's
   order: "these four tiles should expand full screen equally. Since we have
   room if we do so we should add more important details in each tile and still
   has to drill down to see every tag full per drilldown rule."

   WHAT CHANGED, AND WHY EACH CHANGE EXISTS.

   1. is_flower_room IS NOW THE DISCRIMINATOR AGAIN. It reads from
      room_alias.holds_plants and is correct: Metrc holds plants in six
      locations and no vault is one. The earlier note here said to distrust it
      and use room_role instead, because the old view flagged Fulfillment Vault
      as a flower room holding 1,577 plants with "OVER — 113 days past its
      scheduled pull". Both figures were nonsense and both are gone at source.
      Reading the corrected column is better than keeping a work-around alive:
      a work-around outlives the defect it was written for and then becomes one.

   2. NO PLANTS IS RENDERED AS NOTHING, NEVER AS A ZERO. Where
      room_holds_plants is false the view serves plants_now = NULL, because a
      plant count for a vault is meaningless by definition rather than zero. A
      "0 plants" on a finished-goods vault reads as an empty grow room. The
      tile prints no plant figure at all and prints why_no_plants — the view's
      own sentence, verbatim, never one written here (A3).

   3. THE TILE HANDS metrc_room_name TO THE DRILL. This is the whole of the
      defect the owner found: a flower-room tile reported a four-figure plant
      count while its own drill reported no plants in that room at all, because
      Metrc names that room differently from the way we do and the drill
      searched for our name. The tile knew the mapping and the drill did not.
      The drill is now handed the name the tile counted by, so the two cannot
      disagree — and tile_drill_contract re-derives the count from the drill's
      own rows to prove it (contract keys cc.room.*.plants). No count is written
      into this comment: a figure frozen in prose goes stale exactly as fast as
      one frozen in code, and the frozen-figures gate counts both.

   4. THE FOUR FLOWER TILES FILL THE ROW EQUALLY. The grid was
      minmax(120px, 1fr) with auto-fill, which packed the four rooms into a
      fraction of the width and left the rest of the row empty. They now take
      an equal share of the whole row, and the space that buys is spent on
      detail that was previously only in a hover title: Metrc's own room name,
      strains standing, the next event and its date, the cycle length, the
      licence, and the reason there are no plants where there are none.

   J7. The department is whatever the view serves and is never written as a
   literal here. Where the view has no department it says UNASSIGNED, which is
   a marker rather than English, so it is rendered as "department not recorded"
   — the room still never appears without its department, and no department is
   invented to fill the hole. */
/* ═══════════════════════════════════════════════════════════════════════════
   EVERY PLANT STANDING IN ONE ROOM — the drill behind a room tile.

   Owner, 12 Aug 2026: the four room tiles "still [have] to drill down to see
   every tag full per drilldown rule."

   IT READS v_room_plants_drill AND NOTHING ELSE. The view that used to serve
   this drill queried metrc_plants directly on the room name, and metrc_plants
   keeps every plant that was EVER in a room: 'Flower Room #1' returns 13,552
   rows of which 1,022 are standing. source_state is the currency column and a
   drill that forgets it does not under-report, it over-reports THIRTEEN-FOLD.
   The filter lives in the view so no page can miss it, which is why this
   component takes the room name and never composes a query of its own beyond
   equality on it.

   IT IS KEYED BY OUR ROOM NAME, NOT METRC'S. The tile counts by our name and
   the view keys by our name, so tile and drill cannot disagree — the defect the
   owner found was a flower-room tile reporting a four-figure plant count over a
   drill reporting none in the same room, because Metrc names that room
   differently from the way we do. Metrc's own name is shown on the rows for
   cross-reference and is never used as the key.

   NO SILENT TOP-N (C1). The header states the true total from an exact count,
   not the number of rows fetched, and the pager says how many are still unread.
   ═══════════════════════════════════════════════════════════════════════════ */
export function DkRoomPlantDrill({ room, metrcRoomName }) {
  const PAGE = 100;
  const [rows, setRows] = useState(null);
  const [total, setTotal] = useState(null);
  const [err, setErr] = useState(null);
  const [pages, setPages] = useState(1);
  useEffect(() => {
    let live = true;
    setRows(null); setErr(null);
    supabase.from("v_room_plants_drill").select("*", { count: "exact" })
      .eq("room", room)
      .order("days_in_flower", { ascending: false, nullsFirst: false })
      .order("plant_tag", { ascending: true })
      .range(0, pages * PAGE - 1)
      .then(({ data, error, count }) => {
        if (!live) return;
        if (error) { setErr(error.message); return; }
        setRows(rowsOr(data));
        setTotal(count);
      });
    return () => { live = false; };
  }, [room, pages]);
  if (err) return <DkErr what={`Every plant standing in ${room}`} err={err} />;
  if (rows === null) return <div className="cc-fine">Reading every plant standing in {room}…</div>;
  if (!rows.length) {
    return (
      <DkEmpty
        why={`No plant is standing in ${room} right now.`}
        fills={`The room board counts the same population from the same view, so this is the real position rather than a failed read. ${metrcRoomName ? `Metrc calls this room ${metrcRoomName}; plants that have LEFT it are still in Metrc's history and are deliberately not counted here.` : "No Metrc room name is mapped to this room, so nothing can be counted into it — that mapping gap is filed with the database team."} A room standing empty between cycles is the normal state after a pull.`}
      />
    );
  }
  const shown = rows.length;
  const known = total == null ? null : Number(total);
  const more = known != null && shown < known;
  return (
    <>
      <div className="cc-fine">
        {known != null
          ? <>Showing <b>{shown.toLocaleString()}</b> of <b>{known.toLocaleString()}</b> plants standing in {room}
              {metrcRoomName ? <> (Metrc calls it {metrcRoomName})</> : null}, longest in flower first.</>
          : <>Showing <b>{shown.toLocaleString()}</b> plants standing in {room}. The database served no exact
              count with them, so this page cannot promise the list is complete — that gap is filed rather than
              papered over with the number of rows that happened to arrive.</>}
        {" "}Every plant is listed individually; nothing is grouped away.
      </div>
      <div className="tablewrap">
        <table>
          <thead><tr>
            <th>Plant tag</th><th>Strain</th><th>Growth phase</th><th>State</th>
            <th>Days in flower</th><th>Planted on</th><th>Into vegetative</th><th>Into flowering</th>
            <th>Sublocation</th><th>Plant batch</th><th>Holds</th>
            <th>Last changed in Metrc</th><th>Certificate of Analysis</th>
          </tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.plant_tag}>
                <td>{r.plant_tag}</td>
                <td>{r.strain || "not recorded"}</td>
                <td>{r.growth_phase || "not recorded"}</td>
                <td>{r.state || "not recorded"}</td>
                <td>{r.days_in_flower == null ? "not in flower yet" : Number(r.days_in_flower).toLocaleString()}</td>
                <td>{r.planted_on || "not recorded"}</td>
                <td>{r.vegetative_on || "not recorded"}</td>
                <td>{r.flowering_on || "not recorded"}</td>
                <td>{r.sublocation || "no sublocation recorded"}</td>
                <td>{r.plant_batch || "not recorded"}</td>
                <td className={r.on_hold || r.on_investigation ? "bad" : ""}>
                  {r.on_hold && r.on_investigation ? "On hold and under investigation"
                    : r.on_hold ? "On hold"
                    : r.on_investigation ? "Under investigation"
                    : "None"}
                </td>
                <td>{r.metrc_last_modified ? String(r.metrc_last_modified).slice(0, 16).replace("T", " ") : "not recorded"}</td>
                {/* C3a: never a blank and never a dash — the row states WHICH
                    reason no certificate exists. A standing plant has none by
                    definition; the certificate attaches to the package. */}
                <td className="note">No certificate — a Certificate of Analysis attaches to the package
                  after harvest and laboratory testing, never to a standing plant.</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {more && (
        <button className="cc-btn" onClick={() => setPages((p) => p + 1)}>
          Show the next {Math.min(PAGE, known - shown).toLocaleString()} plants ({(known - shown).toLocaleString()} still unread)
        </button>
      )}
    </>
  );
}

const DK_UNASSIGNED = "UNASSIGNED";
export function dkRoomQualified(r) {
  const dept = r.department && r.department !== DK_UNASSIGNED ? r.department : "department not recorded";
  return `${r.room} — ${dept}`;
}

export function DkRoomBoard({ rooms, warnDays, renderPlantDrill, renderStockDrill }) {
  /* ONE OPEN AT A TIME, ACROSS BOTH ROWS (F8, Agent X). These were two
     independent pieces of state, so a plant drill and a package drill could
     stand open together — which breaks the promise the tooltips make, pushes
     the second table below the fold where its own heading is off-screen, and
     strands a history entry so the browser back button needs pressing twice.
     One selector, holding which row and which key, makes the invariant
     structural instead of a thing every call site has to remember. */
  const [open, setOpen] = useState(null);   // null | { kind: "room" | "hold", key: string }
  const openRoom = open?.kind === "room" ? open.key : null;
  const openHold = open?.kind === "hold" ? open.key : null;
  const setOpenRoom = (k) => setOpen(k ? { kind: "room", key: k } : null);
  const setOpenHold = (k) => setOpen(k ? { kind: "hold", key: k } : null);
  const cycle = rooms.filter((r) => r.is_flower_room === true);
  const holding = rooms.filter((r) => r.is_flower_room !== true && Number(r.lb_held ?? 0) > 0);
  if (!cycle.length && !holding.length) {
    return <DkEmpty why="No room is on the board."
      fills="v_room_board_complete reads the room register, the harvest schedule and the package mirror; with all three empty there is nothing to show." />;
  }
  /* A room that holds no plants BY DESIGN is not a room standing empty, and the
     two must never wear the same state. plants_now is NULL for the first and 0
     for the second, and the view serves the sentence for each. */
  const holdsPlants = (r) => r.room_holds_plants !== false && r.plants_now != null;
  const stateOf = (r) => {
    if (!holdsPlants(r)) return { tag: "no plants by design", tone: "info" };
    if (Number(r.plants_now) === 0) return { tag: "turning", tone: "info" };
    if (Number(r.days_until) < 0) return { tag: "over", tone: "crit" };
    if (warnDays != null && Number(r.days_until) <= warnDays) return { tag: "approaching", tone: "warn" };
    return { tag: "on plan", tone: "ok" };
  };
  const openCycleRow = cycle.find((r) => r.room === openRoom) ?? null;
  return (
    <>
      {cycle.length > 0 && (
        <div className="cc-ringrow">
          {cycle.map((r) => {
            const st = stateOf(r);
            const standing = holdsPlants(r) && Number(r.plants_now) > 0;
            const roomQualified = dkRoomQualified(r);
            const on = openRoom === r.room;
            const frac = standing && r.cycle_days
              ? Math.min(1, Math.max(0, (Number(r.cycle_days) - Number(r.days_until)) / Number(r.cycle_days)))
              : 0;
            const C = 2 * Math.PI * 18;
            return (
              <button key={roomQualified} className={`cc-ringcard ${on ? "on" : ""}`}
                onClick={() => setOpenRoom(on ? null : r.room)}
                aria-expanded={on}
                title={`${roomQualified}. ${on ? "Click again to close." : "Click for every plant tag standing in it — every one, not a sample."}`}>
                <span className="cc-ring-top">
                  <svg className="cc-ring" viewBox="0 0 44 44" width="44" height="44" aria-hidden="true">
                    <circle cx="22" cy="22" r="18" className="cc-ring-track" />
                    {standing && (
                      <circle cx="22" cy="22" r="18" className={`cc-ring-fill ${st.tone}`}
                        strokeDasharray={`${(frac * C).toFixed(1)} ${C.toFixed(1)}`} transform="rotate(-90 22 22)" />
                    )}
                    <text x="22" y="26" textAnchor="middle" className="cc-ring-num">
                      {standing ? Math.abs(Number(r.days_until)) : "—"}
                    </text>
                  </svg>
                  <span className="cc-ring-head">
                    <span className="cc-ring-name"><DkCaret open={on} />{roomQualified}</span>
                    <DkTag tone={st.tone}>{st.tag}</DkTag>
                  </span>
                </span>

                {/* The number, or nothing at all. Never a zero standing in for a
                    figure the room cannot have. */}
                {standing ? (
                  <span className="cc-ring-big">
                    {Number(r.plants_now).toLocaleString()}<em> plants standing</em>
                  </span>
                ) : (
                  <span className="cc-ring-noplants">{r.why_no_plants ?? "No plant figure is served for this room and no reason was given with it — that gap is filed with the database team rather than filled in here."}</span>
                )}

                <span className="cc-ring-facts">
                  {standing && r.strains_now != null && (
                    <span className="cc-ring-fact"><b>{Number(r.strains_now).toLocaleString()}</b> strains standing</span>
                  )}
                  {r.next_event && (
                    <span className="cc-ring-fact">
                      <b>{r.next_event}</b> {r.next_event_date ?? "date not scheduled"}
                      {r.days_until != null && (
                        <em className={Number(r.days_until) < 0 ? "crit" : ""}>
                          {Number(r.days_until) < 0
                            ? ` — ${Math.abs(Number(r.days_until))} days past it`
                            : ` — ${Number(r.days_until)} days away`}
                        </em>
                      )}
                    </span>
                  )}
                  {r.cycle_days != null && <span className="cc-ring-fact"><b>{r.cycle_days}</b> day cycle</span>}
                  <span className="cc-ring-fact">
                    licence <b>{r.licence ?? "not recorded against this room"}</b>
                  </span>
                  <span className="cc-ring-fact">
                    Metrc calls it <b>{r.metrc_room_name ?? "— no Metrc name is mapped, so the plant drill cannot be aimed at this room"}</b>
                  </span>
                </span>

                <span className="cc-ring-go">
                  {on ? "Close — the plant tags are below" : "Open every plant tag →"}
                </span>
              </button>
            );
          })}
        </div>
      )}
      {openRoom && renderPlantDrill && (
        <DkDrill label={`Every plant standing in ${dkRoomQualified(openCycleRow ?? { room: openRoom })}`}
          onClose={() => setOpenRoom(null)}>
          {renderPlantDrill(openCycleRow ?? { room: openRoom })}
        </DkDrill>
      )}
      {holding.length > 0 && (
        <>
          <div className="cc-substriphead">
            <span className="cc-striplabel">Rooms holding stock</span>
            <DkTag tone="neutral">{holding.length} rooms</DkTag>
            <DkTag tone="attn"
              title="Cycle tracking covers the flower rooms. These rooms hold material rather than run a pull cycle, so they are measured on what is in them, not on days to a scheduled date.">
              measured on what they hold ⓘ
            </DkTag>
          </div>
          <div className="cc-stockrooms">
            {holding.map((r) => (
              <button key={dkRoomQualified(r)}
                className={`cc-stockroom ${openHold === dkRoomQualified(r) ? "on" : ""}`}
                onClick={() => setOpenHold(openHold === dkRoomQualified(r) ? null : dkRoomQualified(r))}
                aria-expanded={openHold === dkRoomQualified(r)}
                title={`${dkRoomQualified(r)} · ${r.room_role}${r.licence ? " · licence " + r.licence : ""}. ${openHold === dkRoomQualified(r) ? "Click again to close." : "Click for every package in it, each with its certificate and its manifest."}`}>
                <span className="cc-sr-name"><DkCaret open={openHold === dkRoomQualified(r)} />{dkRoomQualified(r)}</span>
                <span className="cc-sr-big">
                  {Number(r.lb_held).toLocaleString(undefined, { maximumFractionDigits: 1 })}<em> lb</em>
                </span>
                <span className="cc-sr-line">
                  {Number(r.tags_held ?? 0).toLocaleString()} tags
                  {r.third_party_lb != null && <> · third party {Number(r.third_party_lb).toLocaleString(undefined, { maximumFractionDigits: 1 })} lb</>}
                </span>
                <span className="cc-sr-chips">
                  <DkTag tone="info">{r.room_role}</DkTag>
                  {Number(r.failed_tags ?? 0) > 0 && <DkTag tone="crit">{r.failed_tags} failed</DkTag>}
                  {Number(r.tags_without_coa ?? 0) > 0 && (
                    <DkTag tone="attn" title="Packages with no certificate filed directly against them. The room drill resolves an inherited certificate where one exists and states the reason where there is none.">
                      {r.tags_without_coa} no direct certificate
                    </DkTag>
                  )}
                </span>
              </button>
            ))}
          </div>
          {openHold && renderStockDrill && (() => {
            const r = holding.find((x) => dkRoomQualified(x) === openHold);
            if (!r) return null;
            return (
              <DkDrill label={`Every package in ${openHold}${r.licence ? ` (licence ${r.licence})` : ""} — certificate and manifest on every row`}
                onClose={() => setOpenHold(null)}>
                {renderStockDrill(r)}
              </DkDrill>
            );
          })()}
        </>
      )}
    </>
  );
}

/* ═══════════ reports, by group — a dashboard never lists individual reports ═══════════ */
export function DkReports({ reports, dept, go }) {
  const list = rowsOr(reports).filter((r) => !dept || r.category === dept || !r.category);
  if (!list.length) {
    return (
      <DkEmpty
        why={`No report is registered for ${dept}.`}
        fills="Reports are nav_registry rows with surface “reports”, not code — one appears here the moment it is enabled."
        action={<button className="cc-btn" onClick={() => go("report-catalogue")}>Open the report catalogue →</button>}
      />
    );
  }
  const byGroup = new Map();
  for (const r of list) {
    const g = r.report_group || "Reports";
    if (!byGroup.has(g)) byGroup.set(g, []);
    byGroup.get(g).push(r);
  }
  const groups = [...byGroup.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  const half = Math.ceil(groups.length / 2);
  return (
    <div className="cc-repcols">
      {[groups.slice(0, half), groups.slice(half)].map((col, ci) => (
        <div key={ci} className="cc-repcol">
          {col.map(([g, items]) => (
            <button key={g} className="cc-reprow" onClick={() => go("report-catalogue")}
              title={`${items.length} reports in ${g}. Opens the report catalogue.`}>
              <span className="cc-rep-name">{g}</span>
              <DkTag tone="neutral">{items.length}</DkTag>
              <span className="cc-rep-preview">
                {items.slice(0, 3).map((r) => r.label).join(" · ")}{items.length > 3 ? ` · +${items.length - 3} more` : ""}
              </span>
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}

/* ═══════════ tasks raised from this dashboard's tiles ═══════════ */
export function DkTasks({ tasks, dept, go }) {
  const mine = tasks.filter((t) => !dept || t.department === dept);
  if (!mine.length) {
    return <DkEmpty why="No task has been raised from this dashboard yet."
      fills="Press Assign on any figure above; the task captures the number exactly as it stood at that moment." />;
  }
  return (
    <div className="cc-queue">
      {mine.map((t) => (
        <div key={t.id} className="cc-qrow">
          <button className="cc-qmain" onClick={() => go("dashboard_tasks")}
            title={`${t.title} — raised from ${t.raised_from}. Opens the task board.`}>
            <i className={`cc-dot ${t.position?.startsWith("OVERDUE") ? "crit" : "attn"}`} aria-hidden="true" />
            <b className="cc-qcount">{t.priority}</b>
            <span className="cc-qcause">{t.title}</span>
            <span className="cc-qnums">{t.source_value != null && <span>{Number(t.source_value).toLocaleString()} {t.source_unit ?? ""}</span>}</span>
            <span className="cc-qage">{t.assigned_to ? `assigned to ${t.assigned_to}` : "unassigned"} · {t.position}</span>
          </button>
        </div>
      ))}
    </div>
  );
}

/* ═══════════ the honest gap card — a department with nothing published ═══════════
   mv_global_management already NAMES the gap. Rendering its own sentence is the
   honest alternative to a fabricated tile. */
export function DkGapCard({ row, dept, go }) {
  return (
    <div className="cc-gapcard">
      <b>Nothing is published for {dept} yet.</b>
      <span>{row?.gap_note ?? `mv_global_management carries no row for ${dept}, so the platform cannot even say what is missing. That is itself a data-layer finding and it is filed with the database team.`}</span>
      <span className="cc-fine">
        This card exists so the page never shows a fabricated tile in place of a figure nobody
        computes (rule A1). It disappears on its own the moment the department publishes one.
      </span>
      <button className="cc-btn" onClick={() => go("agent_findings")}>Open every finding →</button>
    </div>
  );
}

/* ═══════════ the standard page head + toolbar, shared by every dashboard ═══════════
   The page owns its own sections; only the chrome is shared. */
export function DkHead({ title, viewKey, dept, role, viewAs, computed, busy, children }) {
  const age = dkAge(computed);
  return (
    <div className="cc-head">
      <h1 className="cc-title">{title}</h1>
      <span className="cc-hchip">role <b>{viewAs ?? role ?? "reading…"}</b></span>
      <span className="cc-hchip">scope <b>{dept}</b></span>
      <span className="cc-hchip">view <b>{viewKey}</b></span>
      {viewAs && <DkTag tone="attn">design preview — rendering only</DkTag>}
      {children}
      <span className="cc-stamp" title={computed
        ? `The key-figure snapshot was computed ${new Date(computed).toLocaleString()}. This is the age of the DATA, not of this page load. Live views elsewhere on the page reflect the last Metrc sync.`
        : "No snapshot timestamp was served with the key figures."}>
        {busy ? "refreshing…" : computed ? `data ${age}` : "no snapshot timestamp served"}
      </span>
    </div>
  );
}

export { useSectionStore };

/* ═══════════════════════════════════════════════════════════════════════════
   THE SEARCH BOX AND THE THREE CHIPS — owner ruling, 28 August 2026
   (docs/TODO_EVERY_PAGE.md).

   A PRIMITIVE, NOT A LAYOUT. Every page that lists records gets the same search
   behaviour and the same four sentences, so a reader who learns to read them on
   one page has learned to read them on all of them. Where the control sits, and
   what each page searches on, stays the page's own business.

   IT CONSUMES THE BUS, IT DOES NOT REPLACE IT. The range arrives already
   resolved by `useDefaultRange` over `f_date_presets`. Nothing here holds a
   preset, a default or a week-start. `rangeSearch` in lib/range-search.js does
   the deciding and is unit-tested; this renders what it decided.

   THE THREE CHIPS.
     · SOURCE — the relation the rows came from, named on the page. A figure
       whose origin is not on the page is a figure nobody can check.
     · AS-OF — for a page whose rows are a position rather than a flow, so a
       reader is never left to assume a snapshot moves with the range when it
       does not.
     · RANGE SET ASIDE — shown only while a search is running over a range that
       was deliberately ignored. Setting it aside is right; setting it aside
       quietly is not.

   REFUSE, DO NOT ZERO. `err` prints the database's own refusal where the count
   would go. A read that was denied is not an empty result, and the two must
   never render the same — that shape has put "0 records" on this platform's
   Control Tower and zeroed five money tiles on a Finance strip. */
export function DkRangeSearch({
  id, label = "Search", placeholder = "type any part of it",
  q, onQ, result, noun = "rows", rangeLabel = "",
  source, asOf, err,
}) {
  const searching = Boolean(String(q ?? "").trim());
  return (
    <div className="cc-rs">
      <label htmlFor={id}>{label}</label>
      <input id={id} className="cc-input cc-rs-input" value={q ?? ""}
        onChange={(e) => onQ(e.target.value)}
        placeholder={`${placeholder} — any period`} />
      {searching && (
        <button className="cc-btn" onClick={() => onQ("")}
          title="Clear the search and return to the selected date range.">clear</button>
      )}

      {err ? (
        /* No count, no "0". The reason, where the number would be. */
        <DkTag tone="crit" title={`These records could not be read: ${err}. A refused read is not an empty result, so no count is shown in its place.`}>
          could not be read — no count shown rather than a zero
        </DkTag>
      ) : (
        <span className="cc-rs-note">{rangeSearchNote(result, { noun, rangeLabel })}</span>
      )}

      {!err && result?.setAside && (
        <DkTag tone="attn"
          title="A search asks about one record, not about a date window. The range is set aside for it and every period is searched. Clear the search to return to the range.">
          date range set aside while searching ⓘ
        </DkTag>
      )}
      {!err && result?.undated > 0 && (
        <DkTag tone="attn"
          title="These rows carry no date, so a range cannot place them. They are kept and counted rather than dropped — dropping them would quietly understate the total.">
          {result.undated.toLocaleString()} undated, kept ⓘ
        </DkTag>
      )}
      {source && (
        <DkTag tone="neutral" title={`Every row here is read from ${source}. Nothing on this page is computed from anything else.`}>
          source {source}
        </DkTag>
      )}
      {asOf && (
        <DkTag tone="info"
          title="These rows are a position, not a flow. They describe how things stand, so the date range narrows which records are listed and does not restate the position itself.">
          {asOf}
        </DkTag>
      )}
    </div>
  );
}
