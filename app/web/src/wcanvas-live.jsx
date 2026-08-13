/* ═══════════════════════════════════════════════════════════════════════════
   WCANVAS LIVE — the four kinds that were declared and unbuilt, plus the ONE
   dispatcher and the ONE dropdown the whole canvas uses.
   Agent B, 13 Aug 2026, for Agent I (Database COO).

   WHAT LANDED HERE AND WHY

   widget_catalog.widget_kind declares ten kinds. Six shipped on 12 Aug. Four —
   chart · list · feed · messaging — were declared, placeable, and rendered a card
   naming themselves. They are built here.

   And the owner asked for something on top of them, in his own words:
     "CALANDARS AND CAN SELECT CALANDAR FROM DROPDOWN, SCHDULES AND CAN SELECT
      SCHEDULES FROM DROP DOWN, TEAM MESSAGING, TASK, ALERTS TO BE SEEN WHILE
      WORKING"
   Every one of those choices already existed — buried in the panel's settings
   pop-out, three clicks from the figure. A setting you have to go looking for is
   not a setting he asked for. So every SELECT a widget declares now renders on
   the widget's own face, above its content, and switching it writes once.

   ONE DEFINITION OF EACH THING — the countable test, not the aesthetic one
     ONE dispatcher on widget_kind        WidgetBody, below. The switch that used
                                          to live in wcanvas-kinds.jsx was MOVED,
                                          not copied.
     ONE dropdown control                 WcPick. Static choices from
                                          options_schema and live choices read from
                                          the database go through the same control.
     ONE date and ONE timestamp format    dateText / stampText, in wcanvas-data.js.
     ONE empty state                      WcEmpty, and every use here passes the
                                          `action` prop. DkEmpty accepted an action
                                          and was used zero times; that is the
                                          mistake this file is not repeating.
     ONE error surface                    WcErr. No read here falls back to an
                                          empty array.
     ONE row shape                        .tgwc-row, shared with calendar,
                                          schedule, alerts and tasks.

   NOTHING HERE INVENTS A FIGURE
     A line needs two real readings. Under two, this file draws NOTHING and says
     which absence it is — no reading at all, or exactly one and the day it was
     taken. Measured 13 Aug 2026: 84 series exist, 43 carry two or more readings,
     41 do not. The honest path is not the edge case; it is half the catalogue.

   RLS FILTERS, IT DOES NOT ERROR — the trap this file is built around
     audit_events is readable only by executives, dashboard_snapshots only by
     administrators. A reader without the right sees ZERO ROWS AND NO MESSAGE,
     which on screen is identical to "nothing has ever happened". Both surfaces
     here ask who is asking, and say "you cannot see this" rather than showing an
     empty box that reads as calm.
   ═══════════════════════════════════════════════════════════════════════════ */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "./lib/supabase.js";
import {
  read, callRpc, loadEvidence, qualifyRoom, tagColumnIn, dateText, stampText,
  loadChannels, loadMyIdentity, callerIsExecutive, sendChannelMessage,
  movementShort, movementInWords, formatFigure, normaliseOptions,
} from "./wcanvas-data.js";
import {
  WcEmpty, WcErr, EvidenceCell,
  MetricBody, CalendarBody, ScheduleBody, AlertsBody, TasksBody, LookupBody,
} from "./wcanvas-kinds.jsx";

/* ═══════════════════════════════════════════════════════════════════════════
   THE DROPDOWN ON THE WIDGET FACE
   ═══════════════════════════════════════════════════════════════════════════ */

/* THE canvas dropdown. One control, one size, one place the label sits.
   `note` is the catalogue's own honest warning about a choice — "UNFED —
   work_orders is empty" — and it reaches the screen rather than being dropped. */
export function WcPick({ id, label, value, options, onChange, busy }) {
  const chosen = options.find((o) => String(o.value) === String(value));
  return (
    <span className="tgwc-pick">
      <label className="tgwc-fieldlabel" htmlFor={id}>{label}</label>
      <select
        id={id}
        className="tgwc-sel"
        value={chosen ? String(chosen.value) : ""}
        disabled={busy || !options.length}
        onChange={(e) => onChange(e.target.value)}
      >
        {!chosen && <option value="">{busy ? "reading the choices…" : "choose one"}</option>}
        {options.map((o) => <option key={String(o.value)} value={String(o.value)}>{o.label}</option>)}
      </select>
    </span>
  );
}

/* Choices that cannot be a static schema because they are rows: the channels
   people talk in, the figures that actually have daily readings. The schema
   declares WHERE they come from (`{"type":"live_select","source":"channels"}`)
   and this resolves it — so a new live list is a database row, not a deploy.

   A source this map does not know is NAMED on the panel. Falling back to an empty
   dropdown would look like "there is nothing to choose", which is a different and
   wrong statement. */
const LIVE_SOURCES = {
  channels: async () => {
    const r = await loadChannels();
    if (r.err) return { options: null, err: r.err };
    return {
      options: r.rows.map((c) => ({ value: c.id, label: c.name, note: c.description })),
      err: null,
    };
  },
  v_dashboard_trend: async () => {
    const r = await read(supabase.from("v_dashboard_trend").select("department, kpi, points")
      .order("department", { ascending: true }).order("kpi", { ascending: true }));
    if (r.err) return { options: null, err: r.err };
    return {
      options: r.rows.map((t) => ({
        value: `${t.department}|${t.kpi}`,
        label: `${t.department} — ${t.kpi}`,
        /* The count of readings is on the choice itself, so a figure that cannot
           be drawn is visible BEFORE it is picked rather than after. */
        note: Number(t.points) >= 2
          ? `${t.points} daily readings`
          : Number(t.points) === 1 ? "one reading — cannot draw a line yet" : "no readings",
      })),
      err: null,
    };
  },
};

function useLiveOptions(schema) {
  const wanted = useMemo(() => {
    const s = schema && typeof schema === "object" ? schema : {};
    return Object.entries(s)
      .filter(([, d]) => d && d.type === "live_select")
      .map(([name, d]) => ({ name, source: d.source }));
  }, [schema]);
  const signature = wanted.map((w) => `${w.name}:${w.source}`).join(",");
  const [state, setState] = useState({});

  useEffect(() => {
    let live = true;
    if (!signature) { setState({}); return undefined; }
    const list = signature.split(",").map((pair) => {
      const at = pair.indexOf(":");
      return { name: pair.slice(0, at), source: pair.slice(at + 1) };
    });
    setState(Object.fromEntries(list.map((w) => [w.name, { options: [], err: null, loading: true }])));
    Promise.all(list.map(async (w) => {
      const fn = LIVE_SOURCES[w.source];
      if (!fn) {
        return [w.name, {
          options: [], loading: false,
          err: `This choice reads its list from "${w.source}", which the canvas has no reader for. The dropdown is empty because nothing was fetched — not because there is nothing to choose.`,
        }];
      }
      const got = await fn();
      return [w.name, { options: got.options === null ? [] : got.options, err: got.err, loading: false }];
    })).then((pairs) => { if (live) setState(Object.fromEntries(pairs)); });
    return () => { live = false; };
  }, [signature]);

  return state;
}

/* The bar itself. Every select the widget declares, on the widget's face.
   Numbers, tick boxes and free text stay in the settings pop-out: the owner asked
   for dropdowns, and putting eight controls on a panel two rows tall would bury
   the thing the panel is for. */
function PickerBar({ item, cfg, setCfg, live }) {
  const schema = item.options_schema && typeof item.options_schema === "object" ? item.options_schema : {};
  const picks = Object.entries(schema).filter(([, d]) => d && (d.type === "select" || d.type === "live_select"));
  if (!picks.length) return null;
  const idBase = `tgwc-pick-${item.uid.replace(/[^a-z0-9]/gi, "-")}`;

  /* The catalogue's own note about the CHOSEN option — "UNFED — work_orders is
     empty" — and any failure to read a live list. Both go on their OWN line under
     the controls, never inline beside them: at three columns wide an inline note
     wrapped to four lines and pushed the panel's actual content off the bottom.
     The warning still has to be readable, so it wraps rather than being clipped. */
  const notes = [];
  const bar = picks.map(([name, def]) => {
    const isLive = def.type === "live_select";
    const feed = isLive ? live[name] : null;
    const options = isLive
      ? (feed && feed.options ? feed.options : [])
      : normaliseOptions(def.options);
    const value = cfg[name] === undefined || cfg[name] === null ? "" : cfg[name];
    const chosen = options.find((o) => String(o.value) === String(value));
    if (feed && feed.err) notes.push({ key: name, text: feed.err, attn: true });
    else if (chosen && chosen.note) notes.push({ key: name, text: chosen.note, attn: false });
    return (
      <WcPick
        key={name}
        id={`${idBase}-${name}`}
        label={def.label ? def.label : name.replace(/_/g, " ")}
        value={value}
        options={options}
        busy={!!(feed && feed.loading)}
        onChange={(v) => setCfg(name, v)}
      />
    );
  });

  return (
    <div className="tgwc-pickbar">
      <div className="tgwc-pickrow">{bar}</div>
      {notes.map((n) => (
        <span key={n.key} className={`tgwc-evwhy${n.attn ? " attn" : ""}`}>{n.text}</span>
      ))}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   SHARED SMALL PARTS
   ═══════════════════════════════════════════════════════════════════════════ */

/* THE DIAGNOSTIC FOOTER, and it carries DATA age, never computation age.
   "Command Center numbers did not change for six days while the header said
   'Live from the records'" is in the root-cause ledger because a header reported
   how recently it had RUN. This reports the newest row it actually found. */
function DataAge({ newest, what, scope, loaded, total }) {
  const where = scope ? scope : "in this source";
  return (
    <p className="tgwc-say tight tgwc-age">
      {loaded != null && total != null && (
        <>{loaded.toLocaleString()} of {total.toLocaleString()} shown · </>
      )}
      {newest
        ? <>newest {what} {where} is <b>{stampText(newest)}</b> — the age of the DATA, not of this reading of it.</>
        : <>no {what} is recorded {where}, so no age can be stated rather than one being assumed.</>}
    </p>
  );
}

/* Real pixels, measured. A chart drawn into a stretched viewBox distorts its own
   dots and its own text; this measures the box it is in and draws one to one, so
   a 1px hairline is 1px and a 10px label is 10px at every panel size. */
function useBox() {
  const ref = useRef(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) {
        const r = e.contentRect;
        setBox((b) => (Math.abs(b.w - r.width) < 1 && Math.abs(b.h - r.height) < 1
          ? b
          : { w: r.width, h: r.height }));
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, box];
}

/* One reader for every panel in this file: bind the error, count the total, never
   confuse "the read failed" with "there is nothing".

   THE ANSWER IS STAMPED WITH THE QUESTION IT ANSWERS, and this is not tidiness.
   The first version set `loading` inside the effect, and an effect runs AFTER the
   render that scheduled it. So on the one render where the question changed —
   a channel chosen, a list switched — the component saw the PREVIOUS answer with
   `loading` already false. For the messaging panel the previous answer was "no
   question asked", rows null, and `st.rows.length` threw
   `TypeError: Cannot read properties of null (reading 'length')` the instant a
   channel was picked. Caught by the error boundary on the live site, 13 Aug 2026;
   the panel became a red box.

   Deriving `loading` from whether the stored answer matches the CURRENT question
   closes the whole class rather than that one instance: a stale answer can never
   be read as a fresh one, and `loading === false && err === null` now guarantees
   `rows` is an array. */
function useRows(build, deps, enabled = true) {
  const sig = JSON.stringify([deps, enabled]);
  const [st, setSt] = useState({ sig: null, rows: null, err: null, total: null });

  useEffect(() => {
    let live = true;
    /* Disabled means no question has been asked, so no answer is stored and
       `loading` stays true. Every caller returns before it could render that. */
    if (!enabled) return undefined;
    read(build()).then((r) => { if (live) setSt({ sig, rows: r.rows, err: r.err, total: r.count }); });
    return () => { live = false; };
    /* `build` is rebuilt from these deps by the caller, so `sig` already covers
       every input; depending on `build` itself would re-read on every render. */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);

  const fresh = st.sig === sig;
  return {
    loading: !fresh,
    rows: fresh ? st.rows : null,
    err: fresh ? st.err : null,
    total: fresh ? st.total : null,
  };
}

/* ═══════════════════════════════════════════════════════════════════════════
   CHART — a figure over time, drawn only from readings that exist
   ═══════════════════════════════════════════════════════════════════════════ */

function TrendPlot({ w, h, days, values, target, direction, shape, breach }) {
  const PAD = { l: 42, r: 10, t: 10, b: 18 };
  const iw = Math.max(20, w - PAD.l - PAD.r);
  const ih = Math.max(20, h - PAD.t - PAD.b);
  const n = values.length;

  const seen = target == null ? values : [...values, Number(target)];
  const lo = Math.min(...seen);
  const hi = Math.max(...seen);
  const flat = hi === lo;

  /* A flat run is drawn flat, in the middle, and the axis says the same number at
     both ends. Stretching an invented band around it would draw movement that did
     not happen. */
  const y = (v) => (flat ? PAD.t + ih / 2 : PAD.t + ih - ((Number(v) - lo) / (hi - lo)) * ih);
  const x = (i) => PAD.l + (n === 1 ? iw / 2 : (i / (n - 1)) * iw);

  const tone = breach === true ? "bad" : breach === false ? "good" : "";
  const num = (v) => Number(v).toLocaleString(undefined, { maximumFractionDigits: 1 });

  return (
    <svg className={`tgwc-chart ${tone}`} width={w} height={h} role="img"
      aria-label={`${n} readings between ${dateText(days[0]) ? dateText(days[0]) : "an unrecorded date"} and ${dateText(days[n - 1]) ? dateText(days[n - 1]) : "an unrecorded date"}, running from ${num(values[0])} to ${num(values[n - 1])}.`}>
      {/* the band the readings sit in, labelled at both ends */}
      <line className="ax" x1={PAD.l} y1={PAD.t} x2={PAD.l} y2={PAD.t + ih} />
      <line className="ax" x1={PAD.l} y1={PAD.t + ih} x2={PAD.l + iw} y2={PAD.t + ih} />
      <text className="tick" x={PAD.l - 4} y={PAD.t + 4} textAnchor="end">{num(hi)}</text>
      <text className="tick" x={PAD.l - 4} y={PAD.t + ih} textAnchor="end">{num(lo)}</text>

      {target != null && (
        <>
          <line className="target" x1={PAD.l} y1={y(target)} x2={PAD.l + iw} y2={y(target)} />
          <text className="tick target-t" x={PAD.l + iw} y={y(target) - 3} textAnchor="end">
            {direction === "at_most" ? "no more than" : "at least"} {num(target)}
          </text>
        </>
      )}

      {shape === "bars"
        ? values.map((v, i) => {
          const bw = Math.max(2, (iw / n) * 0.66);
          const top = y(v);
          const base = PAD.t + ih;
          return <rect key={i} className="bar" x={x(i) - bw / 2} y={Math.min(top, base - 1)} width={bw} height={Math.max(1, base - top)} />;
        })
        : <path className="line" d={values.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ")} />}

      {shape !== "bars" && n <= 40 && values.map((v, i) => (
        <circle key={i} className={i === n - 1 ? "dot last" : "dot"} cx={x(i)} cy={y(v)} r={i === n - 1 ? 2.6 : 1.6} />
      ))}

      <text className="tick" x={PAD.l} y={h - 4}>{dateText(days[0]) ? dateText(days[0]) : "date not recorded"}</text>
      <text className="tick" x={PAD.l + iw} y={h - 4} textAnchor="end">{dateText(days[n - 1]) ? dateText(days[n - 1]) : "date not recorded"}</text>
    </svg>
  );
}

export function ChartBody({ item, cfg, targets, trends, setCfg, onDrill }) {
  const [ref, box] = useBox();
  const [readings, setReadings] = useState(false);
  const [admin, setAdmin] = useState({ value: null, err: null });

  useEffect(() => {
    let live = true;
    callRpc("f_caller_is_admin").then((r) => { if (live) setAdmin({ value: r.value === true, err: r.err }); });
    return () => { live = false; };
  }, []);

  const all = useMemo(() => (trends instanceof Map ? [...trends.values()] : []), [trends]);
  const withHistory = all.filter((t) => Number(t.points) >= 2).length;

  /* NOTHING IS DRAWN UNTIL A FIGURE IS CHOSEN, and the dropdown above says the
     same thing. A first draft picked one to stand in for the unchosen state; on
     the live site the dropdown then read "choose one" while the panel drew a
     figure, so the control and the content disagreed about what was on screen.
     One state, said once, in both places. */
  const chosenKey = cfg.which_series ? String(cfg.which_series).toLowerCase() : null;
  const series = chosenKey && trends instanceof Map ? trends.get(chosenKey) : null;

  const key = series ? `${series.department}|${series.kpi}` : null;
  const target = key && targets instanceof Map ? targets.get(key.toLowerCase()) : null;

  /* THE PERMISSION SENTENCE IS ON THE DRILL, NOT DISCOVERED INSIDE IT.
     dashboard_snapshots is restricted to administrators and row-level security
     filters silently, so a non-administrator would open this and read "no records
     match this figure" — which would be a lie told by an empty box. */
  const openRecords = useCallback(() => {
    const restricted = admin.value === false
      ? " Your account is not an administrator and dashboard_snapshots is restricted to administrators, so this list will come back empty. That is a permission boundary, not an absence of readings — the readings themselves are listed on the panel, from the trend view your account can read."
      : "";
    if (!series) {
      onDrill({
        title: `${item.label} — every daily reading, every figure`,
        basis: `Every row in dashboard_snapshots, for every figure and every day.${restricted}`,
        source: "dashboard_snapshots",
        filters: [],
      });
      return;
    }
    onDrill({
      title: `${series.department} — ${series.kpi}`,
      basis: `Every daily reading recorded for this figure in dashboard_snapshots. The panel above covers the last thirty days; this list is all of them, unfiltered by date.${restricted}`,
      source: "dashboard_snapshots",
      filters: [
        { op: "eq", col: "department", val: series.department },
        { op: "eq", col: "kpi", val: series.kpi },
      ],
    });
  }, [series, item.label, onDrill, admin.value]);

  if (!all.length) {
    return (
      <WcEmpty gap
        why="No daily readings exist anywhere yet, so there is nothing any chart could draw."
        fills="A chart is drawn from dashboard_snapshots, which takes one reading of every figure once a day. The view v_dashboard_trend returned no rows at all, so either the snapshot job has never run or its last thirty days are empty."
        action={<button type="button" className="tgwc-btn" onClick={openRecords}>Open the snapshot records and see for yourself</button>}
      />
    );
  }

  if (!series) {
    const first = all.find((s) => Number(s.points) >= 2);
    return (
      <WcEmpty
        why={chosenKey
          ? `The figure this panel is set to (${cfg.which_series}) is not among the figures being recorded.`
          : "No figure is chosen yet, so nothing is drawn."}
        fills={`${all.length} figures are recorded daily and ${withHistory} of them carry the two readings a line needs. Choose one from the dropdown above this panel — the choices say how many readings each has, so a figure that cannot be drawn is visible before you pick it, not after.`}
        action={first
          ? <button type="button" className="tgwc-btn"
              onClick={() => setCfg("which_series", `${first.department}|${first.kpi}`)}>
              Show {first.department} — {first.kpi} ({first.points} readings)
            </button>
          : <button type="button" className="tgwc-btn" onClick={openRecords}>Open every daily reading and see what is recorded</button>}
      />
    );
  }

  /* Value and day are kept together. Filtering the values on their own and then
     indexing the days by position is how a reading ends up drawn under the wrong
     date — the two arrays come back the same length and any drop desynchronises
     them silently. A reading whose value will not parse is DISCARDED WITH ITS DAY
     and counted, so the panel can say how many were dropped rather than quietly
     drawing fewer points than it claims. */
  const rawValues = Array.isArray(series.series) ? series.series : [];
  const rawDays = Array.isArray(series.days) ? series.days : [];
  const pairs = rawValues
    .map((v, i) => ({ v: Number(v), d: rawDays[i] === undefined ? null : rawDays[i] }))
    .filter((p) => Number.isFinite(p.v));
  const dropped = rawValues.length - pairs.length;
  const values = pairs.map((p) => p.v);
  const days = pairs.map((p) => p.d);
  const points = values.length;

  const breach = target
    ? (target.direction === "at_most" ? Number(series.latest) > Number(target.target)
      : target.direction === "at_least" ? Number(series.latest) < Number(target.target)
        : null)
    : null;
  const tone = breach === true ? "crit" : breach === false ? "ok" : "";
  const moved = points >= 2 ? movementShort(series.latest, series.previous) : null;

  return (
    <>
      <div className="tgwc-kpirow">
        <span className={`tgwc-kpi ${tone}`}>{formatFigure(series.latest, item.format)}</span>
        <span className="tgwc-chip">{series.kpi}</span>
      </div>
      <span className={`tgwc-rail ${tone}`} aria-hidden="true" />

      <div className="tgwc-facts">
        {target
          ? <span className={`tgwc-chip ${tone}`}>{target.direction === "at_most" ? "no more than" : "at least"} {target.target}</span>
          : <span className="tgwc-chip">no target set</span>}
        <span className="tgwc-chip">{points} reading{points === 1 ? "" : "s"}</span>
        {moved && <span className="tgwc-chip">{moved} since the day before</span>}
        {dropped > 0 && <span className="tgwc-chip crit">{dropped} unreadable</span>}
        <span className="tgwc-chip">{series.department}</span>
      </div>

      {points >= 2 ? (
        <div className="tgwc-plotbox" ref={ref}>
          {box.w > 60 && box.h > 40 && (
            <TrendPlot
              w={Math.floor(box.w)} h={Math.floor(box.h)}
              days={days} values={values}
              target={target ? Number(target.target) : null}
              direction={target ? target.direction : null}
              shape={cfg.shape === "bars" ? "bars" : "line"}
              breach={breach}
            />
          )}
          {box.w > 0 && box.w <= 60 && (
            <span className="tgwc-evwhy">This panel is too narrow to draw a readable chart. Make it wider and the line appears.</span>
          )}
        </div>
      ) : (
        /* UNDER TWO READINGS, NOTHING IS DRAWN. Not a flat line, not a single dot
           joined to nothing, not a shape suggesting a trend. */
        <WcEmpty
          why={points === 1
            ? `One reading only, taken on ${dateText(days[0])}. Nothing is drawn.`
            : "No readings at all. Nothing is drawn."}
          fills={points === 1
            ? "A line between one reading and nothing is invented. The daily snapshot writes one row per figure per day, so a second reading — and the first real line — appears the next time it runs."
            : "This figure is named in the snapshot table but carries no values in the last thirty days. Either the job has not recorded it yet, or its readings are older than the thirty-day window the trend view covers."}
          action={<button type="button" className="tgwc-btn" onClick={openRecords}>Open every reading ever recorded for this figure</button>}
        />
      )}

      {points >= 1 && (
        <>
          <button type="button" className="tgwc-btn" aria-expanded={readings} onClick={() => setReadings((v) => !v)}>
            {readings ? "hide the readings" : `every reading, in numbers (${points})`}
          </button>
          {readings && (
            <div className="tgwc-rows">
              {days.map((d, i) => (
                <div className="tgwc-row" key={`${d}-${i}`}>
                  <span className="when">{dateText(d)}</span>
                  <span className="what">{formatFigure(values[i], item.format)}</span>
                  <span className="side">
                    {i === 0 ? "first" : movementShort(values[i], values[i - 1])}
                  </span>
                </div>
              ))}
            </div>
          )}
          <p className="tgwc-say tight">
            {points >= 2
              ? <>{movementInWords(series.latest, series.previous)}. Drawn from {points} daily readings of <b>{series.kpi}</b> in <b>{series.department}</b>, taken from dashboard_snapshots — no value on this chart was computed here.</>
              : <>Read from dashboard_snapshots by way of v_dashboard_trend, which covers the last thirty days.</>}
            {target
              ? <> The line marked {target.direction === "at_most" ? "no more than" : "at least"} {target.target} is the owner-set target{target.set_by ? ` (${target.set_by})` : ""}.</>
              : <> No owner-set target exists for this figure, so no line is marked and no colour is claimed. A target is a row in kpi_targets keyed to department and figure.</>}
            {dropped > 0 && <> {dropped} recorded reading{dropped === 1 ? "" : "s"} could not be read as a number and {dropped === 1 ? "is" : "are"} not on the chart. That is a defect in the snapshot rows, shown rather than skipped.</>}
          </p>
          <DataAge newest={days.length ? days[days.length - 1] : null} what="reading" scope="for this figure" />
          {admin.err && <WcErr what="Whether your account may open the snapshot records" err={admin.err} />}
          <button type="button" className="tgwc-btn wide" onClick={openRecords}>Open the records behind this line</button>
        </>
      )}
    </>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   LIST — a compact record list, every row opening the record itself
   ═══════════════════════════════════════════════════════════════════════════ */

/* Each list names its source, the column that identifies a row, and how a row
   reads. The CHOICES are declared in widget_catalog.options_schema, which is data;
   how each one is drawn is code, because a roster is not a ledger is not a punch
   log and no amount of configuration makes one draw the other.

   `room` is passed through qualifyRoom, always. A bare room name is wrong two
   thirds of the time here — eleven names exist in both Cultivation and
   Manufacturing. */
const join = (...parts) => parts.filter((p) => p !== null && p !== undefined && p !== "").join(" · ");

/* Quantities are rendered in the unit the column is IN and never added to another.
   `lb` stays pounds, `units` stays a count, and the two never meet in one figure —
   a case when f_is_weight() that nulled the row once published 18,822 units as
   nothing, and adding them would be the same error with the opposite sign. */
const lbText = (v) => (v == null ? null : `${Number(v).toLocaleString(undefined, { maximumFractionDigits: 1 })} lb`);
const unitText = (v) => (v == null ? null : `${Number(v).toLocaleString()} units`);

const LISTS = {
  coa_status: {
    source: "v_rpt_coa_compliance", keyCol: "package_tag",
    orderCol: "packaged_on", ascending: false, ageCol: "packaged_on", ageWhat: "packaging date",
    when: (r) => dateText(r.packaged_on),
    what: (r) => join(r.item, r.strain, r.ownership_label),
    side: (r) => join(r.verdict, lbText(r.lb)),
    room: (r) => r.room,
    crit: (r) => r.on_hold === true,
  },
  finished_goods: {
    source: "product_inventory", keyCol: "id",
    orderCol: "expiration_date", ascending: true, ageCol: "synced_at", ageWhat: "sheet sync",
    when: (r) => dateText(r.expiration_date),
    what: (r) => join(r.product_description, r.strain_flavor, r.category),
    side: (r) => unitText(r.total_units),
    room: () => null,
    crit: (r) => r.expiry_flag === true || r.low_stock_flag === true,
  },
  third_party: {
    source: "third_party_material", keyCol: "id",
    orderCol: "company", ascending: true, ageCol: "synced_at", ageWhat: "sheet sync",
    when: (r) => (r.licence ? r.licence : "no licence"),
    what: (r) => join(r.company_name ? r.company_name : r.company, r.product, r.strain),
    side: (r) => lbText(r.weight_lbs),
    room: (r) => r.location,
    crit: () => false,
  },
  open_actions: {
    source: "actions_register", keyCol: "id",
    orderCol: "due_on", ascending: true, ageCol: "created_at", ageWhat: "action raised",
    when: (r) => dateText(r.due_on),
    what: (r) => r.title,
    side: (r) => join(r.priority, r.status),
    room: () => null,
    crit: (r) => r.needs_owner === true,
  },
  flagged_items: {
    source: "v_item_flags", keyCol: "source_ref",
    orderCol: "raised_on", ascending: false, ageCol: "raised_on", ageWhat: "flag raised",
    when: (r) => dateText(r.raised_on),
    what: (r) => r.headline,
    side: (r) => join(r.severity, r.days_open == null ? null : `${r.days_open} days open`),
    room: () => null,
    crit: (r) => r.severity === "critical",
  },
};

/* The newest value of a column ACROSS THE ROWS THAT ARE ON SCREEN. Said in exactly
   those words on the panel, because "newest in the source" would be a different
   claim and this page is not making it. */
const newestIn = (rows, col) => {
  let best = null;
  for (const r of rows) {
    const v = r[col];
    if (v && (best === null || String(v) > String(best))) best = v;
  }
  return best;
};

export function ListBody({ item, cfg, roomMap, onDrill }) {
  const which = cfg.which_list;
  const plan = LISTS[which] ? LISTS[which] : null;
  const rowCap = Math.min(200, Math.max(5, Number(cfg.how_many) || 25));
  const [ev, setEv] = useState({ map: null, err: null });

  const st = useRows(
    () => supabase.from(plan.source).select("*", { count: "exact" })
      .order(plan.orderCol, { ascending: plan.ascending, nullsFirst: false })
      .limit(rowCap),
    [which, rowCap],
    !!plan,
  );

  /* Certificate and manifest per row (C3a), fetched once for the page rather than
     once per row. Which column holds a tag comes from the column dictionary, not
     from a literal here. */
  const tagCol = st.rows && st.rows.length ? tagColumnIn(Object.keys(st.rows[0])) : null;
  useEffect(() => {
    let live = true;
    if (!tagCol || !st.rows || !st.rows.length) { setEv({ map: new Map(), err: null }); return undefined; }
    loadEvidence(st.rows.map((r) => r[tagCol])).then((r) => { if (live) setEv(r); });
    return () => { live = false; };
  }, [st.rows, tagCol]);

  const openAll = useCallback(() => {
    if (!plan) return;
    onDrill({
      title: `${item.label} — every record`,
      basis: `Every row in ${plan.source}, unlimited and unsummarised. The panel above shows the first ${rowCap} in ${plan.orderCol} order; this is all of them.`,
      source: plan.source,
      filters: [],
    });
  }, [plan, item.label, rowCap, onDrill]);

  const openOne = (row) => onDrill({
    title: `${item.label} — one record`,
    basis: `The single row in ${plan.source} whose ${plan.keyCol} is ${row[plan.keyCol]}. Every column it carries is below, nothing hidden and nothing shortened.`,
    source: plan.source,
    filters: [{ op: "eq", col: plan.keyCol, val: row[plan.keyCol] }],
  });

  if (!plan) {
    return (
      <WcEmpty gap
        why={`This list is set to "${which}", which the canvas has no reader for.`}
        fills="The choices come from widget_catalog.options_schema. A new choice needs a source, an identifying column and a row shape registered with it before it can be drawn — a list of unknown records would be a table with no meaning."
        action={<button type="button" className="tgwc-btn" onClick={() => onDrill({
          title: `${item.label} — the catalogue entry behind this panel`,
          basis: "The widget catalogue row that declares this panel, including the choices it offers.",
          source: "widget_catalog",
          filters: [{ op: "eq", col: "key", val: item.widget_key }],
        })}>Open the catalogue entry that declares this panel</button>}
      />
    );
  }
  if (st.err) return <WcErr what={item.label} err={st.err} />;
  if (st.loading) return <p className="tgwc-say tight">Reading the records…</p>;
  if (!st.rows.length) {
    return (
      <WcEmpty gap
        why={`${plan.source} holds no rows.`}
        fills="This is not a count of nought: the source has never been fed. Rows appear here the moment it is, with no change to this panel."
        action={<button type="button" className="tgwc-btn" onClick={openAll}>Open the source and see for yourself</button>}
      />
    );
  }

  return (
    <>
      <div className="tgwc-rows">
        {st.rows.map((r, i) => {
          const q = plan.room(r) ? qualifyRoom(roomMap, plan.room(r)) : null;
          return (
            <div className={`tgwc-row ${plan.crit(r) ? "crit" : ""}`} key={`${r[plan.keyCol]}-${i}`}>
              <span className="when">{plan.when(r) ? plan.when(r) : "not recorded"}</span>
              <span className="what">
                <button type="button" className="tgwc-rowopen" onClick={() => openOne(r)}
                  title={`Open the whole record: ${plan.source} where ${plan.keyCol} is ${r[plan.keyCol]}`}>
                  {plan.what(r) ? plan.what(r) : "no description recorded on this record"}
                </button>
                {q && <> — {q.text}{q.note && <span className="tgwc-evwhy attn"> ({q.note})</span>}</>}
                {tagCol && <><br /><EvidenceCell tag={r[tagCol]} map={ev.map} err={ev.err} /></>}
              </span>
              {plan.side(r) && <span className="side">{plan.side(r)}</span>}
            </div>
          );
        })}
      </div>
      <p className="tgwc-say tight">
        Every row above opens the record itself. {tagCol
          ? <>Each carries its certificate and its manifest, taken from the tag in <b>{tagCol}</b>; where one is missing the row states which absence it is.</>
          : <>These rows carry no Metrc tag, so no certificate or manifest attaches to them — they are not item rows, and a blank there would be misread as a missing document.</>}
      </p>
      <DataAge newest={newestIn(st.rows, plan.ageCol)} what={plan.ageWhat}
        scope="among the rows shown" loaded={st.rows.length} total={st.total} />
      <button type="button" className="tgwc-btn wide" onClick={openAll}>Open every record in this list</button>
    </>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   FEED — what has actually happened, newest first
   ═══════════════════════════════════════════════════════════════════════════ */

const FEEDS = {
  platform: {
    source: "audit_events", keyCol: "id", timeCol: "at",
    what: (r) => `${r.action} on ${r.entity}`,
    side: (r) => r.actor_name,
    detail: (r) => r.reason,
    crit: () => false,
    /* Policy exec_all on audit_events is USING is_executive(). A reader who is not
       an executive sees zero rows and no error. */
    restrictedTo: "executive",
  },
  watchdog: {
    source: "watchdog_findings", keyCol: "id", timeCol: "observed_at",
    what: (r) => r.what,
    side: (r) => r.severity,
    detail: (r) => r.where_it_is,
    crit: (r) => r.severity === "critical",
    openOnly: { col: "cleared_at" },
  },
  task_activity: {
    source: "task_activity", keyCol: "id", timeCol: "at",
    what: (r) => (r.field ? `${r.what} — ${r.field} changed from ${r.old_value} to ${r.new_value}` : r.what),
    side: (r) => r.actor,
    detail: () => null,
    crit: () => false,
  },
  task_comment: {
    source: "task_comment", keyCol: "id", timeCol: "created_at",
    what: (r) => r.body,
    side: (r) => r.author,
    detail: (r) => (r.edited_at ? `edited ${stampText(r.edited_at)}` : null),
    crit: () => false,
  },
};

export function FeedBody({ item, cfg, onDrill }) {
  const which = cfg.which_feed;
  const plan = FEEDS[which] ? FEEDS[which] : null;
  const rowCap = Math.min(200, Math.max(5, Number(cfg.how_many) || 30));
  const openOnly = cfg.open_only !== false;
  const [exec, setExec] = useState({ value: null, err: null, asked: false });

  const st = useRows(
    () => {
      let q = supabase.from(plan.source).select("*", { count: "exact" })
        .order(plan.timeCol, { ascending: false, nullsFirst: false }).limit(rowCap);
      if (plan.openOnly && openOnly) q = q.is(plan.openOnly.col, null);
      return q;
    },
    [which, rowCap, openOnly],
    !!plan,
  );

  /* Asked ONLY when the answer changes what the screen says: an empty restricted
     feed. An empty box and a box you are not allowed to see look identical, and
     the second one must not read as the first. */
  const needAsk = !!plan && plan.restrictedTo === "executive" && !!st.rows && st.rows.length === 0;
  useEffect(() => {
    let live = true;
    if (!needAsk) return undefined;
    callerIsExecutive().then((r) => { if (live) setExec({ value: r.value === true, err: r.err, asked: true }); });
    return () => { live = false; };
  }, [needAsk]);

  const openAll = useCallback(() => {
    if (!plan) return;
    onDrill({
      title: `${item.label} — everything recorded`,
      basis: `Every row in ${plan.source}${plan.openOnly && openOnly ? `, still open (${plan.openOnly.col} not yet set)` : ""}, newest first. The panel shows ${rowCap}; this is all of them.`,
      source: plan.source,
      filters: plan.openOnly && openOnly ? [{ op: "is_null", col: plan.openOnly.col }] : [],
    });
  }, [plan, item.label, rowCap, openOnly, onDrill]);

  const openOne = (row) => onDrill({
    title: `${item.label} — one entry`,
    basis: `The single row in ${plan.source} whose ${plan.keyCol} is ${row[plan.keyCol]}, with every column it carries.`,
    source: plan.source,
    filters: [{ op: "eq", col: plan.keyCol, val: row[plan.keyCol] }],
  });

  if (!plan) {
    return (
      <WcEmpty gap
        why={`This feed is set to "${which}", which the canvas has no reader for.`}
        fills="The choices come from widget_catalog.options_schema, and each needs a source and a time column registered with it. An activity feed with no idea which column is the clock would list rows in an arbitrary order and call it recent."
        action={<button type="button" className="tgwc-btn" onClick={() => onDrill({
          title: `${item.label} — the catalogue entry behind this panel`,
          basis: "The widget catalogue row that declares this panel, including the choices it offers.",
          source: "widget_catalog",
          filters: [{ op: "eq", col: "key", val: item.widget_key }],
        })}>Open the catalogue entry that declares this panel</button>}
      />
    );
  }
  if (st.err) return <WcErr what={item.label} err={st.err} />;
  if (st.loading) return <p className="tgwc-say tight">Reading the activity…</p>;

  if (!st.rows.length) {
    if (plan.restrictedTo === "executive" && exec.asked && exec.value === false) {
      return (
        <WcEmpty gap
          why="You are not allowed to see this stream, and that is why it is empty."
          fills={`${plan.source} is restricted to executives by its own access policy. Row-level security FILTERS rather than errors, so without this message an empty panel would read as "nothing has happened" — which would be false. Ask an administrator to grant the executive role, or choose a different stream from the list above.`}
          action={<button type="button" className="tgwc-btn" onClick={openAll}>Try opening the records anyway</button>}
        />
      );
    }
    return (
      <WcEmpty gap
        why={plan.openOnly && openOnly ? `Nothing open in ${plan.source}.` : `${plan.source} holds no rows.`}
        fills={plan.openOnly && openOnly
          ? "Entries exist but every one of them has been cleared. Turn off “open only” in this panel’s settings to see the cleared ones too."
          : `Nothing has ever been recorded here. This is an absent capability rather than a quiet period: the table exists, nothing writes to it yet, and the first entry will appear on this panel with no change to it.${exec.err ? ` (Whether your account may read it could not be checked: ${exec.err})` : ""}`}
        action={<button type="button" className="tgwc-btn" onClick={openAll}>Open the source and see for yourself</button>}
      />
    );
  }

  return (
    <>
      <div className="tgwc-rows">
        {st.rows.map((r, i) => (
          <div className={`tgwc-row ${plan.crit(r) ? "crit" : ""}`} key={`${r[plan.keyCol]}-${i}`}>
            <span className="when" style={{ minWidth: 82 }}>{stampText(r[plan.timeCol]) ? stampText(r[plan.timeCol]) : "no time recorded"}</span>
            <span className="what">
              <button type="button" className="tgwc-rowopen" onClick={() => openOne(r)}
                title={`Open the whole entry: ${plan.source} where ${plan.keyCol} is ${r[plan.keyCol]}`}>
                {plan.what(r) ? plan.what(r) : "no description recorded on this entry"}
              </button>
              {plan.detail(r) && <><br /><span className="tgwc-evwhy">{plan.detail(r)}</span></>}
            </span>
            {plan.side(r) && <span className="side">{plan.side(r)}</span>}
          </div>
        ))}
      </div>
      <DataAge newest={st.rows[0][plan.timeCol]} what="entry" scope={`in ${plan.source}`}
        loaded={st.rows.length} total={st.total} />
      <button type="button" className="tgwc-btn wide" onClick={openAll}>Open every entry in this feed</button>
    </>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   MESSAGING — the team channel, readable and writable from the panel
   ═══════════════════════════════════════════════════════════════════════════ */

export function MessagingBody({ item, cfg, onDrill }) {
  const channelId = cfg.which_channel ? String(cfg.which_channel) : null;
  const rowCap = Math.min(200, Math.max(5, Number(cfg.how_many) || 30));
  const [me, setMe] = useState(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sendErr, setSendErr] = useState(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let live = true;
    loadMyIdentity().then((r) => { if (live) setMe(r); });
    return () => { live = false; };
  }, []);

  const st = useRows(
    () => supabase.from("messages").select("*", { count: "exact" })
      .eq("channel_id", channelId)
      .order("created_at", { ascending: false }).limit(rowCap),
    [channelId, rowCap, nonce],
    !!channelId,
  );

  /* How many messages exist ANYWHERE. Without it, an empty channel and an empty
     platform read the same, and the sentence a person needs is which of the two
     it is. */
  const everywhere = useRows(
    () => supabase.from("messages").select("id", { count: "exact", head: true }),
    [nonce],
    !!channelId,
  );

  const openAll = useCallback(() => onDrill({
    title: `${item.label} — every message in this channel`,
    basis: "Every row in messages for this channel, oldest to newest, with the account that posted each one. The panel shows the most recent few; this is all of them.",
    source: "messages",
    filters: channelId ? [{ op: "eq", col: "channel_id", val: channelId }] : [],
  }), [item.label, channelId, onDrill]);

  const send = async () => {
    const body = draft.trim();
    if (!body || !channelId || !me || !me.uid) return;
    setSending(true);
    setSendErr(null);
    const author = me.name ? me.name : me.email ? me.email : me.uid;
    const { err } = await sendChannelMessage(channelId, me.uid, author, body);
    setSending(false);
    if (err) { setSendErr(err); return; }
    setDraft("");
    setNonce((n) => n + 1);
  };

  if (!channelId) {
    return (
      <WcEmpty
        why="No channel is chosen yet."
        fills="Pick one from the list above this panel and its messages appear here. Channels are shared; picking one changes only your own panel, not anybody else's."
        action={<button type="button" className="tgwc-btn" onClick={() => onDrill({
          title: `${item.label} — every channel`,
          basis: "Every channel in the channels table, with what each one is for.",
          source: "channels",
          filters: [],
        })}>See what channels exist</button>}
      />
    );
  }
  if (st.err) return <WcErr what={item.label} err={st.err} />;
  if (me && me.state === "error") return <WcErr what="Your own account" err={me.err} />;

  const canSend = !!me && !!me.uid;
  const fieldId = `tgwc-msg-${item.uid.replace(/[^a-z0-9]/gi, "-")}`;
  const composer = (
    <div className="tgwc-compose">
      <label className="tgwc-fieldlabel" htmlFor={fieldId}>Say something</label>
      <textarea
        id={fieldId}
        className="tgwc-ta"
        rows={2}
        value={draft}
        disabled={!canSend || sending}
        placeholder={canSend ? "Type a message. Control and Enter sends it." : ""}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); send(); } }}
      />
      <div className="tgwc-fields">
        <button type="button" className="tgwc-btn on" disabled={!canSend || sending || !draft.trim()} onClick={send}>
          {sending ? "sending…" : "Send"}
        </button>
        {me && me.state === "anonymous" && (
          <span className="tgwc-evwhy attn">You are not signed in, so nothing can be posted from here.</span>
        )}
        {me && me.state === "unnamed" && (
          <span className="tgwc-evwhy attn">
            Your account carries no name in app_users or employees, so a message would be signed
            {me.email ? ` with your sign-in address, ${me.email}` : " with your account identifier"} rather than a name. Nothing is made up.
          </span>
        )}
        {me && me.state === "ready" && (
          <span className="tgwc-evwhy">Posted as {me.name}.</span>
        )}
      </div>
      {sendErr && <WcErr what="That message" err={sendErr} />}
    </div>
  );

  if (st.loading) return <p className="tgwc-say tight">Reading the channel…</p>;

  if (!st.rows.length) {
    const total = everywhere.total;
    return (
      <>
        <WcEmpty
          why="Nothing has been said in this channel."
          fills={everywhere.loading
            ? "Checking whether any message exists in any channel, so this can tell you which of the two it is."
            : total === 0
              ? "The messages table holds no rows at all, across every channel. The channels were created and nobody has posted yet — so this is an empty room, not a failed read. Yours can be the first message."
              : total === null
                ? "How many messages exist elsewhere could not be counted, so whether this is an unused channel or an unused platform cannot be stated here."
                : `${total.toLocaleString()} message(s) exist in other channels, so the reading works — this particular channel is the one nobody has used.`}
          action={<button type="button" className="tgwc-btn" onClick={openAll}>Open every message in this channel</button>}
        />
        {everywhere.err && <WcErr what="The count of messages across all channels" err={everywhere.err} />}
        {composer}
      </>
    );
  }

  return (
    <>
      <div className="tgwc-rows">
        {st.rows.map((m) => (
          <div className="tgwc-row msg" key={m.id}>
            <span className="when" style={{ minWidth: 82 }}>{stampText(m.created_at)}</span>
            <span className="what">
              <b>{m.author ? m.author : "no author recorded"}</b>
              <br />{m.body}
            </span>
          </div>
        ))}
      </div>
      <DataAge newest={st.rows[0].created_at} what="message" scope="in this channel"
        loaded={st.rows.length} total={st.total} />
      <button type="button" className="tgwc-btn wide" onClick={openAll}>Open every message in this channel</button>
      {composer}
    </>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   THE DISPATCHER — the only switch on widget_kind in this canvas
   ═══════════════════════════════════════════════════════════════════════════ */

export function WidgetBody(props) {
  const { item, cfg, setCfg } = props;
  const live = useLiveOptions(item.options_schema);

  const body = (() => {
    switch (item.widget_kind) {
      case "metric":    return <MetricBody {...props} />;
      case "calendar":  return <CalendarBody {...props} />;
      case "schedule":  return <ScheduleBody {...props} />;
      case "alerts":    return <AlertsBody {...props} />;
      case "tasks":     return <TasksBody {...props} />;
      case "lookup":    return <LookupBody {...props} />;
      case "chart":     return <ChartBody {...props} />;
      case "list":      return <ListBody {...props} />;
      case "feed":      return <FeedBody {...props} />;
      case "messaging": return <MessagingBody {...props} />;
      default:
        /* A kind the catalogue declares and this file does not draw. Named, so it
           is a known gap and not a panel that mysteriously renders nothing.
           Ten kinds are declared and ten are drawn as of 13 Aug 2026; this branch
           is what an eleventh would land in. */
        return (
          <WcEmpty gap
            why={`"${item.catalogue_label ? item.catalogue_label : item.label}" is registered as a ${item.widget_kind} widget, and this canvas cannot draw that kind yet.`}
            fills="The panel keeps its place and its settings; it will render the moment the kind is built. Nothing about the underlying data is being hidden — there is simply no drawing for it here."
            action={props.onDrill ? <button type="button" className="tgwc-btn" onClick={props.onDrill}>Open the records behind it</button> : null}
          />
        );
    }
  })();

  return (
    <>
      <PickerBar item={item} cfg={cfg} setCfg={setCfg} live={live} />
      {body}
    </>
  );
}
