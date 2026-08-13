/* ═══════════════════════════════════════════════════════════════════════════
   WCANVAS KINDS — what goes INSIDE a panel, dispatched on widget_kind.
   Agent B, 12 Aug 2026, for Agent I.

   widget_catalog.widget_kind declares ten kinds. Six are registered and real
   today (metric · calendar · schedule · alerts · tasks · lookup); four are
   declared and unfed (list · feed · messaging · chart). A kind this file does
   not render gets a card that NAMES the kind and says the canvas cannot draw it
   yet — never a blank panel, and never a crash. A dispatcher that falls through
   to nothing is the same silent failure as a read that swallows its error.

   NOTHING IN THIS FILE INVENTS A FIGURE. Every number is served, every absence
   states which absence it is, and where there are fewer than two real snapshots
   no line is drawn and the tile says why.
   ═══════════════════════════════════════════════════════════════════════════ */
import React, { useEffect, useRef, useState } from "react";
import { supabase } from "./lib/supabase.js";
import {
  read, runMetric, probeColumns, orderColumnFor, fetchDrillPage, loadEvidence,
  signDocument, qualifyRoom, formatFigure, movementInWords, movementShort,
  tagColumnIn, isRoomColumn,
} from "./wcanvas-data.js";

/* ═══════════ shared small chrome ═══════════ */

export function WcErr({ what, err }) {
  return (
    <div className="tgwc-err">
      <b>{what} could not be read:</b> {err} — the read genuinely failed. Nothing
      is hidden behind an empty box.
    </div>
  );
}

/* An empty state says WHY it is empty, WHAT would fill it, and offers a way
   onward. The action is not decoration: a dead end with an explanation is still
   a dead end. */
export function WcEmpty({ why, fills, action, gap = false }) {
  return (
    <div className={`tgwc-empty${gap ? " gap" : ""}`}>
      <span className="why">{why}</span>
      {fills && <span>{fills}</span>}
      {action}
    </div>
  );
}

const dateText = (v) => (v ? String(v).slice(0, 10) : null);

/* ═══════════ certificate and manifest on the row (C3a) ═══════════ */

function DocButton({ path, label, title }) {
  const [msg, setMsg] = useState(null);
  if (!path) return null;
  return (
    <button
      type="button"
      className="tgwc-evdoc"
      title={title ?? label}
      onClick={async (e) => {
        e.stopPropagation();
        setMsg("opening…");
        const { url, err } = await signDocument(path);
        if (err) { setMsg(`could not open: ${err}`); return; }
        setMsg(null);
        window.open(url, "_blank", "noopener");
      }}
    >
      {msg ?? label}
    </button>
  );
}

const reasonOr = (reason, what) =>
  reason && String(reason).trim()
    ? reason
    : `No ${what} on this tag, and the evidence view served no reason why. That gap is itself a data-layer defect and is shown rather than hidden, because a blank cell reads as "nothing to see".`;

export function EvidenceCell({ tag, map, err }) {
  if (err) return <span className="tgwc-evwhy attn">evidence could not be read: {err}</span>;
  if (!map) return <span className="tgwc-evwhy">reading the evidence…</span>;
  const e = map.get(tag);
  if (!e) {
    return (
      <span className="tgwc-evwhy attn" title="mv_tag_evidence resolves every tag in the package mirror. A tag missing from it has not been through the evidence build.">
        no evidence row for this tag — it is not in the evidence view
      </span>
    );
  }
  const inherited = e.evidence_source === "inherited";
  return (
    <span className="tgwc-ev">
      {e.certificate_document
        ? <DocButton
            path={e.certificate_document}
            label={inherited ? `Certificate (inherited from ${e.certificate_inherited_from})` : "Certificate of Analysis"}
            title={`Certificate of Analysis${inherited ? ` inherited from parent package ${e.certificate_inherited_from}` : ""}${e.certificate_date ? `, tested ${dateText(e.certificate_date)}` : ""}${e.lab_name ? `, ${e.lab_name}` : ""}. Opens the real document.`}
          />
        : <span className="tgwc-evwhy">{reasonOr(e.why_no_certificate, "certificate")}</span>}
      {e.manifest_document
        ? <DocButton path={e.manifest_document} label={`Manifest ${e.manifest_number ?? ""}`.trim()} title={`Manifest ${e.manifest_number ?? ""}. Opens the real document.`} />
        : <span className="tgwc-evwhy">{reasonOr(e.why_no_manifest, "manifest")}</span>}
    </span>
  );
}

/* ═══════════ the generic record table used by every drill ═══════════ */

/* WHICH COLUMN IS A TAG, WHICH IS A ROOM — read from column_semantics, not frozen here.
   These were two literal arrays. App.jsx still carries nine more copies of the same idea, which
   is why the report-contract ratchet stood at 17 before this file existed. Rename a column in
   Metrc and every copy but one goes quietly wrong. tagColumnIn and isRoomColumn now come from
   wcanvas-data.js, which reads v_column_semantics once at mount. (§7: filters are DATA.) */

function Cell({ column, value, roomMap }) {
  if (value === null || value === undefined || value === "") {
    /* Never a blank and never a dash (A3). Short, because a paragraph in every
       empty cell of a forty-column table is unreadable — but explicit. */
    return <span className="tgwc-evwhy" title={`${column} carries no value on this record.`}>not recorded</span>;
  }
  if (isRoomColumn(column)) {
    const q = qualifyRoom(roomMap, value);
    return (
      <span>
        {q.text}
        {q.note && <><br /><span className="tgwc-evwhy attn">{q.note}</span></>}
      </span>
    );
  }
  if (typeof value === "boolean") return <span>{value ? "yes" : "no"}</span>;
  if (typeof value === "number") return <span>{value.toLocaleString(undefined, { maximumFractionDigits: 3 })}</span>;
  if (typeof value === "object") {
    /* Nothing is clipped and nothing is sliced away (F3). The whole value is
       here; it is folded so one wide record does not bury the rest. */
    const text = JSON.stringify(value, null, 1);
    return (
      <details className="tgwc-blob">
        <summary>{Array.isArray(value) ? `${value.length} value(s) — open` : "structured value — open"}</summary>
        <pre>{text}</pre>
      </details>
    );
  }
  return <span>{String(value)}</span>;
}

const DRILL_PAGE = 200;

/* THE DRILL. It opens in place, over the records themselves, and it closes in
   place: a Close control that is always visible at the top of the panel, and
   Escape. The owner's words, 12 Aug 2026: "once drill down data is not needed
   by user and they finish reviewing they should be able to close it to see the
   normal dash again."

   NO SAMPLING. The panel always states how many records are loaded against how
   many exist. A drill showing two hundred of twenty-four thousand without
   saying so is a sample, whatever it is called (C1). */
export function RecordDrill({ title, basis, source, filters, roomMap, drill, go, onClose }) {
  const [state, setState] = useState({ cols: null, orderCol: null, rows: [], total: null, err: null, loading: true });
  const [ev, setEv] = useState({ map: null, err: null });
  const closeRef = useRef(null);

  useEffect(() => { closeRef.current?.focus(); }, []);

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  useEffect(() => {
    let live = true;
    (async () => {
      const probe = await probeColumns(source);
      if (!live) return;
      if (probe.err) { setState((s) => ({ ...s, err: probe.err, loading: false })); return; }
      const orderCol = orderColumnFor(probe.cols);
      const page = await fetchDrillPage(source, filters, orderCol, 0, DRILL_PAGE);
      if (!live) return;
      if (page.err) { setState((s) => ({ ...s, err: page.err, loading: false, orderCol })); return; }
      setState({ cols: page.rows.length ? Object.keys(page.rows[0]) : probe.cols, orderCol, rows: page.rows, total: page.count, err: null, loading: false });
    })();
    return () => { live = false; };
  }, [source, filters]);

  /* Evidence is fetched for the loaded page in one batched read, never one
     request per row. */
  useEffect(() => {
    let live = true;
    const col = state.cols ? tagColumnIn(state.cols) : null;
    if (!col || !state.rows.length) { setEv({ map: new Map(), err: null }); return; }
    loadEvidence(state.rows.map((r) => r[col])).then((r) => { if (live) setEv(r); });
    return () => { live = false; };
  }, [state.rows, state.cols]);

  const loadMore = async () => {
    setState((s) => ({ ...s, loading: true }));
    const page = await fetchDrillPage(source, filters, state.orderCol, state.rows.length, DRILL_PAGE);
    setState((s) => page.err
      ? { ...s, err: page.err, loading: false }
      : { ...s, rows: [...s.rows, ...page.rows], total: page.count ?? s.total, loading: false });
  };

  const tagCol = state.cols ? tagColumnIn(state.cols) : null;
  const loaded = state.rows.length;
  const total = state.total;
  const complete = total != null && loaded >= total;

  return (
    <section className="tgwc-drill" aria-label={`Records behind ${title}`}>
      <div className="tgwc-drill-h">
        <span className="t">{title} — every record behind the figure</span>
        {total != null && (
          <span className={`tgwc-chip ${complete ? "ok" : "attn"}`}>
            {complete
              ? `all ${total.toLocaleString()} loaded`
              : `${loaded.toLocaleString()} of ${total.toLocaleString()} loaded`}
          </span>
        )}
        <span className="spacer" style={{ flex: 1 }} />
        {drill && go && (
          <button type="button" className="tgwc-btn" onClick={() => go(drill)}>
            Open the full records page
          </button>
        )}
        <button type="button" className="tgwc-btn on" ref={closeRef} onClick={onClose}>
          Close (Escape)
        </button>
      </div>
      <div className="tgwc-drill-b">
        <p className="tgwc-say tight">{basis}</p>
        {state.err && <WcErr what="These records" err={state.err} />}
        {!state.err && state.loading && !loaded && <p className="tgwc-say tight">Reading the records…</p>}
        {!state.err && !state.loading && !loaded && (
          <WcEmpty
            why="No records match this figure right now."
            fills={`The figure and these records come from the same read of ${source} with the same filters, so an empty list here means the count is genuinely nought — not that the drill failed.`}
            action={<button type="button" className="tgwc-btn" onClick={onClose}>Back to the dashboard</button>}
          />
        )}
        {!!loaded && state.cols && (
          <>
            <div className="tgwc-tablewrap">
              <table className="tgwc-table">
                <thead>
                  <tr>
                    {tagCol && <th scope="col">Certificate and manifest</th>}
                    {state.cols.map((c) => <th key={c} scope="col">{c.replace(/_/g, " ")}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {state.rows.map((r, i) => (
                    <tr key={`${i}-${tagCol ? r[tagCol] : i}`}>
                      {tagCol && <td><EvidenceCell tag={r[tagCol]} map={ev.map} err={ev.err} /></td>}
                      {state.cols.map((c) => (
                        <td key={c} className={typeof r[c] === "number" ? "num" : undefined}>
                          <Cell column={c} value={r[c]} roomMap={roomMap} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="tgwc-say tight">
              Loaded in pages of {DRILL_PAGE}, ordered by <b>{state.orderCol ?? "the source's own order"}</b> so a
              page cannot repeat or skip a record.
              {!tagCol && " This source carries no Metrc tag column, so no certificate or manifest can be attached to these rows — they are not item rows."}
            </p>
            {!complete && (
              <button type="button" className="tgwc-btn" disabled={state.loading} onClick={loadMore}>
                {state.loading ? "loading…" : `Load the next ${DRILL_PAGE} — ${(total - loaded).toLocaleString()} still to come`}
              </button>
            )}
          </>
        )}
      </div>
    </section>
  );
}

/* ═══════════ metric ═══════════ */

/* Drawn only from served daily snapshots. Under two points nothing is drawn and
   the tile says so — never a fabricated line. */
function Spark({ series, good }) {
  if (!Array.isArray(series) || series.length < 2) return null;
  const n = series.map(Number).filter(Number.isFinite);
  if (n.length < 2) return null;
  const min = Math.min(...n), max = Math.max(...n), rng = max - min || 1;
  const W = 44, H = 12;
  const pts = n.map((v, i) => [(i / (n.length - 1)) * W, H - 1.5 - ((v - min) / rng) * (H - 3)]);
  const d = pts.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ");
  return (
    <svg className={`tgwc-spark ${good === true ? "good" : good === false ? "bad" : ""}`}
      viewBox={`0 0 ${W} ${H}`} width={W} height={H} aria-hidden="true">
      <path d={d} />
      <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r="1.4" />
    </svg>
  );
}

/* THE TILE FACE CARRIES NO PROSE. A figure, a rail, and chips of three words
   or fewer. Everything that has to be said in a sentence — what it counts, why
   there is no target, why there is no line, why the source is empty — sits
   behind the question mark, one click away and never hidden.

   This is a rule earned on 12 Aug 2026: a caveat paragraph rendered under a
   KPI tile read as a wall of red text and the owner's reaction was immediate.
   Measured against this catalogue the risk was certain, not theoretical — 0 of
   45 metric widgets have an owner-set target and 44 of 45 have no daily
   history, so EVERY tile would have carried two explanatory paragraphs. */
export function MetricBody({ item, spec, target, trend, onDrill }) {
  const [res, setRes] = useState(null);
  const [why, setWhy] = useState(false);

  useEffect(() => {
    let live = true;
    setRes(null);
    if (!spec) return undefined;
    runMetric({ ...spec, key: item.widget_key }).then((r) => { if (live) setRes(r); });
    return () => { live = false; };
  }, [spec, item.widget_key]);

  if (!spec) {
    return (
      <WcEmpty
        gap
        why={`No compute rule is registered for "${item.widget_key}".`}
        fills="The panel is placed but widget_catalog carries no source, aggregation or filters for it, so there is nothing to count. This is a catalogue gap, not a figure of nought."
      />
    );
  }
  if (!res) return <p className="tgwc-say tight">Counting…</p>;
  if (res.err) return <WcErr what={item.label} err={res.err} />;

  const breach = target
    ? (target.direction === "at_most" ? Number(res.value) > Number(target.target)
      : target.direction === "at_least" ? Number(res.value) < Number(target.target)
        : false)
    : null;

  const points = trend && trend.points ? Number(trend.points) : 0;
  const tone = breach === true ? "crit" : breach === false ? "ok" : "";
  const moved = points >= 2 ? movementShort(trend.latest, trend.previous) : null;
  const counts = spec.agg === "sum" ? `the total of ${spec.value_col}` : "rows";
  const filterText = Array.isArray(spec.filters) && spec.filters.length
    ? spec.filters.map((f) => `${f.col} ${f.op.replace(/_/g, " ")}${f.val === undefined ? "" : ` ${f.val}`}`).join(", and ")
    : null;

  return (
    <>
      <div className="tgwc-kpirow">
        <span className={`tgwc-kpi ${tone}`}>{formatFigure(res.value, item.format ? item.format : spec.format)}</span>
        {points >= 2 && <Spark series={trend.series} good={breach === false ? true : breach === true ? false : null} />}
        <button type="button" className="tgwc-why" aria-expanded={why} onClick={() => setWhy((v) => !v)}
          title="What this counts, what its target is, and what it cannot tell you.">?</button>
      </div>
      <span className={`tgwc-rail ${tone}`} aria-hidden="true" />

      {/* Chips. Three words at most, each one either a served fact or a stated
          absence — never a sentence. */}
      <div className="tgwc-facts">
        {target
          ? <span className={`tgwc-chip ${tone}`}>{target.direction === "at_most" ? "no more than" : "at least"} {target.target}</span>
          : <span className="tgwc-chip">no target set</span>}
        {moved
          ? <span className="tgwc-chip">{moved} since yesterday</span>
          : <span className="tgwc-chip">no history yet</span>}
        {res.emptySource && <span className="tgwc-chip attn">never recorded</span>}
      </div>

      {why && (
        <div className="tgwc-whybox">
          <p className="tgwc-say tight">
            Counts <b>{counts}</b> in <b>{spec.table_ref}</b>{filterText ? <> where {filterText}</> : <> with no filter</>}.
          </p>
          <p className="tgwc-say tight">
            {target
              ? <>Target {target.direction === "at_most" ? "no more than" : "at least"} {target.target}{target.set_by ? `, set by ${target.set_by}` : ""}.</>
              : <>No owner-set target, so no red line to breach. A target is a row in kpi_targets keyed to department and name; the moment one exists this tile colours itself.</>}
          </p>
          <p className="tgwc-say tight">
            {points >= 2
              ? <>{movementInWords(trend.latest, trend.previous)}, drawn from {points} daily snapshots.</>
              : <>{points === 1 ? "Only one daily snapshot exists" : "No daily snapshot exists"} for this figure, so no line is drawn — a line through fewer than two readings would be invented.</>}
          </p>
          {res.emptySource && (
            <p className="tgwc-say tight">
              Nothing has ever been recorded in <b>{spec.table_ref}</b>. This is not a measurement of nought: the
              source holds no rows at all, and a figure appears the moment it is fed.
            </p>
          )}
        </div>
      )}

      <button type="button" className="tgwc-btn wide" onClick={onDrill}>Open the records behind this</button>
    </>
  );
}

/* ═══════════ calendar ═══════════ */

const CALENDARS = {
  harvest_pulls: {
    source: "harvest_schedule", dateCol: "harvest_date",
    what: (r) => [r.cultivar, r.plants ? `${Number(r.plants).toLocaleString()} plants` : null].filter(Boolean).join(" · "),
    room: (r) => r.flower_room,
    side: (r) => (r.projected_weight_lbs != null ? `${Number(r.projected_weight_lbs).toLocaleString(undefined, { maximumFractionDigits: 0 })} lb projected` : null),
  },
  outgoing: {
    source: "metrc_transfers", dateCol: "created_on", filters: [{ op: "eq", col: "direction", val: "outgoing" }],
    what: (r) => [r.recipient, r.manifest_number ? `manifest ${r.manifest_number}` : null].filter(Boolean).join(" · "),
    room: () => null,
    side: (r) => r.license ?? null,
  },
  expiring: {
    source: "product_inventory", dateCol: "expiration_date",
    what: (r) => [r.product_description, r.strain_flavor].filter(Boolean).join(" · "),
    room: (r) => r.location,
    side: (r) => (r.total_units != null ? `${Number(r.total_units).toLocaleString()} units` : null),
  },
};

function useWindowRows(plan, days) {
  const [state, setState] = useState({ rows: null, err: null, loading: true, latest: null });
  useEffect(() => {
    let live = true;
    if (!plan) { setState({ rows: null, err: null, loading: false, latest: null }); return undefined; }
    (async () => {
      const from = new Date().toISOString().slice(0, 10);
      const to = new Date(Date.now() + Math.max(1, days) * 86400000).toISOString().slice(0, 10);
      let q = supabase.from(plan.source).select("*").gte(plan.dateCol, from).lte(plan.dateCol, to)
        .order(plan.dateCol, { ascending: true }).limit(400);
      for (const f of (plan.filters ? plan.filters : [])) q = q.eq(f.col, f.val);
      const r = await read(q);
      if (!live) return;
      if (r.err) { setState({ rows: null, err: r.err, loading: false, latest: null }); return; }
      if (r.rows.length) { setState({ rows: r.rows, err: null, loading: false, latest: null }); return; }
      /* Nothing in the window. Say what the source DOES hold, so an empty
         forward window reads as "the dates are behind us", not as a broken
         panel. */
      const back = await read(supabase.from(plan.source).select(plan.dateCol)
        .not(plan.dateCol, "is", null).order(plan.dateCol, { ascending: false }).limit(1));
      if (!live) return;
      setState({ rows: [], err: null, loading: false, latest: back.err ? null : (back.rows[0]?.[plan.dateCol] ?? null) });
    })();
    return () => { live = false; };
  }, [plan, days]);
  return state;
}

export function CalendarBody({ item, cfg, roomMap, onDrill }) {
  const which = cfg.which_calendar;
  const plan = CALENDARS[which] ?? null;
  const days = Math.max(1, Number(cfg.days_ahead) || 30);
  const st = useWindowRows(plan, days);

  /* The drill must open THE SAME SET the panel is showing, from the same source
     with the same filters. The panel's source is whichever calendar is chosen,
     which is NOT always the widget's catalogue table_ref — a Calendar set to
     "Deliveries and pickups" reads metrc_transfers while the catalogue names
     harvest_schedule. Sending the catalogue's source to the drill would open a
     different table under a button that promises these records. */
  const drillHere = () => {
    if (!plan) return;
    const from = new Date().toISOString().slice(0, 10);
    const to = new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
    onDrill({
      title: `${item.label} — the next ${days} days`,
      basis: `Every record in ${plan.source} dated between ${from} and ${to} on ${plan.dateCol} — the same window, the same filters and the same source the panel above is reading.`,
      source: plan.source,
      filters: [
        ...(plan.filters ? plan.filters : []),
        { op: "gte", col: plan.dateCol, val: from },
        { op: "lte", col: plan.dateCol, val: to },
      ],
    });
  };

  if (!plan) {
    return (
      <WcEmpty gap
        why={`This calendar is set to "${which}", which the canvas does not know how to draw.`}
        fills="The choices come from widget_catalog.options_schema. A new choice needs a source and a date column registered with it before it can be shown."
      />
    );
  }
  if (st.err) return <WcErr what={item.label} err={st.err} />;
  if (st.loading) return <p className="tgwc-say tight">Reading the next {days} days…</p>;
  if (!st.rows.length) {
    return (
      <WcEmpty
        why={`Nothing dated in the next ${days} days.`}
        fills={st.latest
          ? `The most recent date ${plan.source} carries is ${dateText(st.latest)}, so this calendar is looking past the end of the data rather than at an empty diary.`
          : `${plan.source} carries no dates at all on ${plan.dateCol}, so there is nothing yet to place on a calendar.`}
        action={
          <button type="button" className="tgwc-btn" onClick={() => onDrill({
            title: `${item.label} — everything in ${plan.source}`,
            basis: `Every record in ${plan.source}, with no date window at all, so you can see what the source actually holds.`,
            source: plan.source,
            filters: plan.filters ? plan.filters : [],
          })}>Open every record in this source, without the date window</button>
        }
      />
    );
  }

  let lastDay = null;
  return (
    <>
      <div className="tgwc-rows">
        {st.rows.map((r, i) => {
          const day = dateText(r[plan.dateCol]);
          const head = day !== lastDay ? day : null;
          lastDay = day;
          const roomRaw = plan.room(r);
          const q = roomRaw ? qualifyRoom(roomMap, roomRaw) : null;
          return (
            <React.Fragment key={i}>
              {head && <div className="tgwc-daygroup">{head}</div>}
              <div className="tgwc-row">
                <span className="when">{day}</span>
                <span className="what">
                  {plan.what(r) || "no description recorded on this record"}
                  {q && <> — {q.text}{q.note && <span className="tgwc-evwhy attn"> ({q.note})</span>}</>}
                </span>
                {plan.side(r) && <span className="side">{plan.side(r)}</span>}
              </div>
            </React.Fragment>
          );
        })}
      </div>
      <p className="tgwc-say tight">
        {st.rows.length} dated record{st.rows.length === 1 ? "" : "s"} from <b>{plan.source}</b> on <b>{plan.dateCol}</b>,
        today to {days} days ahead.
      </p>
      <button type="button" className="tgwc-btn wide" onClick={drillHere}>Open every record in this window</button>
    </>
  );
}

/* ═══════════ schedule ═══════════ */

const isoWeek = (d) => {
  const t = new Date(d);
  if (Number.isNaN(t.getTime())) return "date not recorded";
  const day = (t.getUTCDay() + 6) % 7;
  t.setUTCDate(t.getUTCDate() - day + 3);
  const first = new Date(Date.UTC(t.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((t - first) / 86400000 - 3 + ((first.getUTCDay() + 6) % 7)) / 7);
  return `${t.getUTCFullYear()} week ${week}`;
};

export function ScheduleBody({ item, cfg, options, roomMap, onDrill }) {
  const which = cfg.which_schedule;
  const declared = options && Array.isArray(options.which_schedule) ? options.which_schedule : [];
  const chosen = declared.find((o) => o.value === which) || null;
  const [st, setSt] = useState({ rows: null, err: null, loading: true });

  const source = which === "manufacturing" ? "work_orders" : "harvest_schedule";
  const dateCol = which === "manufacturing" ? "planned_start" : "harvest_date";

  /* Same rule as the calendar: the drill opens the schedule the panel is
     actually reading, which is not the catalogue's table_ref when the user has
     chosen the manufacturing schedule. */
  const drillHere = () => onDrill({
    title: `${item.label} — ${chosen ? chosen.label : which}`,
    basis: `Every record in ${source}, the same source the panel above is reading. Nothing is grouped away and nothing is summarised.`,
    source,
    filters: [],
  });

  useEffect(() => {
    let live = true;
    setSt({ rows: null, err: null, loading: true });
    read(supabase.from(source).select("*").order(dateCol, { ascending: true, nullsFirst: false }).limit(300))
      .then((r) => { if (live) setSt({ rows: r.rows, err: r.err, loading: false }); });
    return () => { live = false; };
  }, [source, dateCol]);

  if (st.err) return <WcErr what={item.label} err={st.err} />;
  if (st.loading) return <p className="tgwc-say tight">Reading the schedule…</p>;

  if (!st.rows.length) {
    return (
      <WcEmpty gap
        why={`${source} holds no rows, so there is no ${chosen?.label ?? which} schedule to show.`}
        fills={chosen?.note
          ? `The catalogue records why: "${chosen.note}". This is an absent capability, not a schedule with nothing in it.`
          : "The source exists but has never been fed. This is an absent capability, not a schedule with nothing in it."}
        action={<button type="button" className="tgwc-btn" onClick={drillHere}>Open the source and see for yourself</button>}
      />
    );
  }

  const keyOf = (r) => {
    if (cfg.group_by === "week") return isoWeek(r[dateCol]);
    if (cfg.group_by === "cultivar") return r.cultivar ?? r.wo_code ?? "not recorded";
    const raw = r.flower_room ?? r.room ?? null;
    if (!raw) return "room not recorded on this record";
    const q = qualifyRoom(roomMap, raw);
    return q.note ? `${q.text} — ${q.note}` : q.text;
  };

  const groups = new Map();
  for (const r of st.rows) {
    const k = keyOf(r);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(r);
  }

  return (
    <>
      <div className="tgwc-rows">
        {[...groups.entries()].map(([k, rows]) => (
          <React.Fragment key={k}>
            <div className="tgwc-daygroup">{k} · {rows.length}</div>
            {rows.slice(0, 6).map((r, i) => (
              <div className="tgwc-row" key={i}>
                <span className="when">{dateText(r[dateCol]) ?? "no date"}</span>
                <span className="what">{r.cultivar ?? r.wo_code ?? "not recorded"}</span>
                <span className="side">
                  {r.projected_weight_lbs != null
                    ? `${Number(r.projected_weight_lbs).toLocaleString(undefined, { maximumFractionDigits: 0 })} lb projected`
                    : r.planned_qty != null ? `${Number(r.planned_qty).toLocaleString()} planned` : ""}
                </span>
              </div>
            ))}
            {rows.length > 6 && (
              <div className="tgwc-row">
                <span className="what tgwc-evwhy">
                  {rows.length - 6} more in this group are not listed on the panel — the drill below opens all of them.
                </span>
              </div>
            )}
          </React.Fragment>
        ))}
      </div>
      <p className="tgwc-say tight">
        {st.rows.length} scheduled record{st.rows.length === 1 ? "" : "s"} from <b>{source}</b>, grouped by <b>{cfg.group_by}</b>.
      </p>
      <button type="button" className="tgwc-btn wide" onClick={drillHere}>Open every record in this schedule</button>
    </>
  );
}

/* ═══════════ alerts ═══════════ */

const SEVERITY_AT_LEAST = {
  critical: ["critical"],
  elevated: ["critical", "elevated"],
  watch: ["critical", "elevated", "watch"],
  everything: null,
};

export function AlertsBody({ item, cfg, onDrill }) {
  const [st, setSt] = useState({ rows: null, err: null, loading: true, total: null });
  const wanted = SEVERITY_AT_LEAST[cfg.severity_at_least] ?? null;
  const unreadOnly = cfg.unread_only !== false;

  /* The button says "every matching alert", so the drill carries the panel's
     own settings. A drill that quietly widened to every alert would make the
     count on the panel and the rows behind it two different populations. */
  const drillHere = () => onDrill({
    title: `${item.label} — ${wanted ? wanted.join(" or ") : "every severity"}${unreadOnly ? ", unread" : ""}`,
    basis: "Every alert matching this panel's settings, from alert_outbox. The panel lists the most recent sixty; this is all of them.",
    source: "alert_outbox",
    filters: [
      ...(wanted ? [{ op: "in", col: "severity", val: wanted }] : []),
      ...(unreadOnly ? [{ op: "is_null", col: "read_at" }] : []),
    ],
  });

  useEffect(() => {
    let live = true;
    setSt({ rows: null, err: null, loading: true, total: null });
    let q = supabase.from("alert_outbox").select("*", { count: "exact" })
      .order("raised_on", { ascending: false, nullsFirst: false }).limit(60);
    if (wanted) q = q.in("severity", wanted);
    if (unreadOnly) q = q.is("read_at", null);
    read(q).then((r) => { if (live) setSt({ rows: r.rows, err: r.err, loading: false, total: r.count }); });
    return () => { live = false; };
  }, [cfg.severity_at_least, cfg.unread_only]);

  if (st.err) return <WcErr what={item.label} err={st.err} />;
  if (st.loading) return <p className="tgwc-say tight">Reading the alerts…</p>;
  if (!st.rows.length) {
    return (
      <WcEmpty
        why="Nothing open at this level."
        fills={`No alert in alert_outbox matches ${wanted ? `severity ${wanted.join(" or ")}` : "any severity"}${unreadOnly ? ", unread" : ""}. Widen the setting on this panel to see more.`}
        action={<button type="button" className="tgwc-btn" onClick={drillHere}>Open every alert</button>}
      />
    );
  }

  return (
    <>
      <div className="tgwc-rows">
        {st.rows.map((a) => (
          <div className={`tgwc-row ${a.severity === "critical" ? "crit" : ""}`} key={a.id}>
            <span className="when">{dateText(a.raised_on) ?? "no date"}</span>
            <span className="what">
              {a.subject || "no subject recorded on this alert"}
              {a.resolved_at && <span className="tgwc-chip ok" style={{ marginLeft: 4 }}>resolved {dateText(a.resolved_at)}</span>}
            </span>
            <span className="side">{a.severity}{a.days_open != null ? ` · ${a.days_open}d open` : ""}</span>
          </div>
        ))}
      </div>
      <p className="tgwc-say tight">
        Showing the {st.rows.length} most recent of <b>{(st.total ?? st.rows.length).toLocaleString()}</b> matching
        {wanted ? <> severity {wanted.join(" or ")}</> : <> any severity</>}{unreadOnly ? ", unread only" : ", read and unread"}.
      </p>
      <button type="button" className="tgwc-btn wide" onClick={drillHere}>Open every matching alert</button>
    </>
  );
}

/* ═══════════ tasks ═══════════ */

/* Who am I, for "assigned to me" and "my department". Resolved through
   app_users, which is the auth-to-employee link this platform already has;
   there is no second identity path and none is invented here. */
function useMe() {
  const [me, setMe] = useState({ state: "reading", employeeId: null, department: null, err: null });
  useEffect(() => {
    let live = true;
    (async () => {
      const { data: sess } = await supabase.auth.getSession();
      const uid = sess?.session?.user?.id ?? null;
      if (!uid) { if (live) setMe({ state: "anonymous", employeeId: null, department: null, err: null }); return; }
      const link = await read(supabase.from("app_users").select("employee_id").eq("user_id", uid).limit(1));
      if (!live) return;
      if (link.err) { setMe({ state: "error", employeeId: null, department: null, err: link.err }); return; }
      const employeeId = link.rows[0]?.employee_id ?? null;
      if (!employeeId) { setMe({ state: "unlinked", employeeId: null, department: null, err: null }); return; }
      const emp = await read(supabase.from("employees").select("primary_department_id").eq("id", employeeId).limit(1));
      if (!live) return;
      const deptId = emp.err ? null : emp.rows[0]?.primary_department_id ?? null;
      if (!deptId) { setMe({ state: "ready", employeeId, department: null, err: emp.err }); return; }
      const d = await read(supabase.from("departments").select("name").eq("id", deptId).limit(1));
      if (!live) return;
      setMe({ state: "ready", employeeId, department: d.err ? null : d.rows[0]?.name ?? null, err: d.err });
    })();
    return () => { live = false; };
  }, []);
  return me;
}

export function TasksBody({ item, cfg, onDrill }) {
  const me = useMe();
  const [st, setSt] = useState({ rows: null, err: null, loading: true, total: null, blocked: null });

  /* Two drills, deliberately different. drillHere carries the panel's settings
     so "every matching task" means exactly that; drillAll is the escape hatch
     offered when a setting cannot be resolved, and it says so on the button. */
  const drillAll = () => onDrill({
    title: `${item.label} — every task`,
    basis: "Every row in the tasks table, with no filter at all.",
    source: "tasks",
    filters: [],
  });
  const drillHere = () => onDrill({
    title: `${item.label} — ${cfg.whose === "mine" ? "assigned to you" : cfg.whose === "team" ? `in ${me.department}` : "everyone"}`,
    basis: "Every task matching this panel's settings. The panel lists sixty; this is all of them.",
    source: "tasks",
    filters: [
      ...(cfg.whose === "mine" && me.employeeId ? [{ op: "eq", col: "assignee_employee_id", val: me.employeeId }] : []),
      ...(cfg.whose === "team" && me.department ? [{ op: "eq", col: "department", val: me.department }] : []),
      ...(cfg.include_done === true ? [] : [{ op: "neq", col: "status", val: "done" }]),
    ],
  });

  useEffect(() => {
    let live = true;
    if (me.state === "reading") return undefined;
    setSt({ rows: null, err: null, loading: true, total: null, blocked: null });

    /* A setting the canvas cannot honour is stated, never quietly widened.
       Showing everyone's tasks to somebody who asked for their own is exactly
       the kind of wrong answer nobody spots. */
    if (cfg.whose === "mine" && !me.employeeId) {
      setSt({ rows: [], err: null, loading: false, total: 0, blocked: "This panel is set to your own tasks, but your sign-in is not linked to an employee record in app_users, so 'mine' cannot be resolved. Nothing is shown rather than everybody's tasks." });
      return undefined;
    }
    if (cfg.whose === "team" && !me.department) {
      setSt({ rows: [], err: null, loading: false, total: 0, blocked: "This panel is set to your department, but no department is recorded against your employee record, so 'my department' cannot be resolved. Nothing is shown rather than everybody's tasks." });
      return undefined;
    }

    let q = supabase.from("tasks").select("*", { count: "exact" }).limit(60);
    if (cfg.whose === "mine") q = q.eq("assignee_employee_id", me.employeeId);
    if (cfg.whose === "team") q = q.eq("department", me.department);
    if (cfg.include_done !== true) q = q.neq("status", "done");
    q = cfg.overdue_first !== false
      ? q.order("due_on", { ascending: true, nullsFirst: false })
      : q.order("created_at", { ascending: false });
    read(q).then((r) => { if (live) setSt({ rows: r.rows, err: r.err, loading: false, total: r.count, blocked: null }); });
    return () => { live = false; };
  }, [cfg.whose, cfg.include_done, cfg.overdue_first, me.state, me.employeeId, me.department]);

  const [everAny, setEverAny] = useState(null);
  useEffect(() => {
    let live = true;
    if (st.rows && st.rows.length === 0 && !st.blocked) {
      read(supabase.from("tasks").select("*", { count: "exact", head: true }))
        .then((r) => { if (live) setEverAny(r.err ? null : r.count ?? 0); });
    }
    return () => { live = false; };
  }, [st.rows, st.blocked]);

  if (me.state === "reading" || st.loading) return <p className="tgwc-say tight">Reading the tasks…</p>;
  if (me.err) return <WcErr what="Your employee record" err={me.err} />;
  if (st.err) return <WcErr what={item.label} err={st.err} />;
  if (st.blocked) {
    return <WcEmpty gap why="This setting cannot be resolved for you." fills={st.blocked}
      action={<button type="button" className="tgwc-btn" onClick={drillAll}>Open every task instead</button>} />;
  }
  if (!st.rows.length) {
    return (
      <WcEmpty
        gap={everAny === 0}
        why={everAny === 0 ? "Nothing has ever been recorded in tasks." : "Nothing open for this setting."}
        fills={everAny === 0
          ? "The tasks table holds no rows at all, so this is not a measurement of nought — the work queue has never been written to. It will fill the moment tasks are raised."
          : "Tasks exist, but none match this panel's setting. Change whose tasks it shows, or include completed ones."}
        action={<button type="button" className="tgwc-btn" onClick={drillAll}>Open every task</button>}
      />
    );
  }

  const today = new Date().toISOString().slice(0, 10);
  return (
    <>
      <div className="tgwc-rows">
        {st.rows.map((t) => (
          <div className={`tgwc-row ${t.due_on && t.due_on < today && t.status !== "done" ? "crit" : ""}`} key={t.id}>
            <span className="when">{dateText(t.due_on) ?? "no due date"}</span>
            <span className="what">{t.title || "no title recorded on this task"}</span>
            <span className="side">{t.priority ?? "no priority"} · {t.status ?? "no status"}</span>
          </div>
        ))}
      </div>
      <p className="tgwc-say tight">
        {st.rows.length} of <b>{(st.total ?? st.rows.length).toLocaleString()}</b> matching tasks
        ({cfg.whose === "mine" ? "assigned to you" : cfg.whose === "team" ? `in ${me.department}` : "everyone's"},
        {cfg.include_done === true ? " including completed" : " open only"}).
      </p>
      <button type="button" className="tgwc-btn wide" onClick={drillHere}>Open every matching task</button>
    </>
  );
}

/* ═══════════ lookup ═══════════ */

const LOOKUP_FIELDS = [
  ["resolution", "What it resolves to"],
  ["resolution_detail", "In plain words"],
  ["item", "Item"],
  ["category", "Category"],
  ["mirror_licence", "Licence holding it"],
  ["mirror_state", "Testing state"],
  ["mirror_quantity", "Quantity"],
  ["manifest_number", "Manifest"],
  ["direction", "Direction"],
  ["moved_on", "Moved on"],
  ["origin_facility", "From"],
  ["dest_facility", "To"],
  ["what_would_change_it", "What would change this answer"],
];

export function LookupBody({ item, cfg, roomMap, onDrill }) {
  const [text, setText] = useState("");
  const [st, setSt] = useState({ row: undefined, err: null, loading: false, asked: null });
  const [ev, setEv] = useState({ map: null, err: null });
  const fieldId = `tgwc-lookup-${item.uid.replace(/[^a-z0-9]/gi, "-")}`;

  const drillHere = () => onDrill({
    title: `${item.label} — the whole tag register`,
    basis: "Every tag in v_tag_resolver: what it resolves to, which licence holds it, which manifest moved it, and why an unresolved one is unresolved.",
    source: "v_tag_resolver",
    filters: [],
  });

  const find = async (e) => {
    e.preventDefault();
    const tag = text.trim();
    if (!tag) return;
    setSt({ row: undefined, err: null, loading: true, asked: tag });
    const r = await read(supabase.from("v_tag_resolver").select("*").eq("tag", tag).limit(1));
    if (r.err) { setSt({ row: undefined, err: r.err, loading: false, asked: tag }); return; }
    setSt({ row: r.rows[0] ?? null, err: null, loading: false, asked: tag });
    setEv(await loadEvidence([tag]));
  };

  const room = st.row ? qualifyRoom(roomMap, st.row.mirror_room) : null;

  return (
    <>
      <form onSubmit={find} style={{ display: "flex", gap: 4, alignItems: "center" }}>
        <label className="tgwc-fieldlabel" htmlFor={fieldId}>Metrc tag</label>
        <input id={fieldId} className="tgwc-in" style={{ flex: 1, minWidth: 120 }}
          value={text} onChange={(e) => setText(e.target.value)}
          placeholder={cfg.placeholder || "Paste any Metrc tag"} />
        <button type="submit" className="tgwc-btn" disabled={!text.trim() || st.loading}>
          {st.loading ? "looking…" : "Find"}
        </button>
      </form>

      {st.err && <WcErr what="That tag" err={st.err} />}

      {st.row === null && !st.err && (
        <WcEmpty
          why={`${st.asked} is not in the tag resolver.`}
          fills="v_tag_resolver covers every tag this platform has seen, in the mirror or on a manifest. A tag it does not hold is either mistyped or belongs to another licensee whose packages we do not mirror — which is expected, not a fault."
          action={<button type="button" className="tgwc-btn" onClick={drillHere}>Open the whole tag register</button>}
        />
      )}

      {st.row && (
        <>
          <div className="tgwc-rows">
            {LOOKUP_FIELDS.map(([k, label]) => (
              <div className="tgwc-row" key={k}>
                <span className="when" style={{ minWidth: 96 }}>{label}</span>
                <span className="what">
                  {st.row[k] === null || st.row[k] === undefined || st.row[k] === ""
                    ? <span className="tgwc-evwhy">not recorded on this tag</span>
                    : String(st.row[k])}
                </span>
              </div>
            ))}
            <div className="tgwc-row">
              <span className="when" style={{ minWidth: 96 }}>Room</span>
              <span className="what">
                {room && room.text
                  ? <>{room.text}{room.note && <span className="tgwc-evwhy attn"> ({room.note})</span>}</>
                  : <span className="tgwc-evwhy">no room recorded against this tag in the mirror</span>}
              </span>
            </div>
            <div className="tgwc-row">
              <span className="when" style={{ minWidth: 96 }}>Documents</span>
              <span className="what"><EvidenceCell tag={st.row.tag} map={ev.map} err={ev.err} /></span>
            </div>
          </div>
          <button type="button" className="tgwc-btn wide" onClick={drillHere}>Open the whole tag register</button>
        </>
      )}
    </>
  );
}

/* ═══════════ the dispatcher ═══════════ */

export function WidgetBody(props) {
  const { item } = props;
  switch (item.widget_kind) {
    case "metric":   return <MetricBody {...props} />;
    case "calendar": return <CalendarBody {...props} />;
    case "schedule": return <ScheduleBody {...props} />;
    case "alerts":   return <AlertsBody {...props} />;
    case "tasks":    return <TasksBody {...props} />;
    case "lookup":   return <LookupBody {...props} />;
    default:
      /* Declared in the catalogue, not yet drawn here. Named, so it is a known
         gap rather than a panel that mysteriously renders nothing. */
      return (
        <WcEmpty gap
          why={`"${item.catalogue_label ?? item.label}" is registered as a ${item.widget_kind} widget, and this canvas cannot draw that kind yet.`}
          fills="The panel keeps its place and its settings; it will render the moment the kind is built. Nothing about the underlying data is being hidden — there is simply no drawing for it here."
          action={props.onDrill ? <button type="button" className="tgwc-btn" onClick={props.onDrill}>Open the records behind it</button> : null}
        />
      );
  }
}
