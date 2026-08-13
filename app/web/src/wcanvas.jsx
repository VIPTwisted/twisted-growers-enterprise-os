/* ═══════════════════════════════════════════════════════════════════════════
   WCANVAS — a movable, resizable, per-user dashboard canvas.
   Agent B, 12 Aug 2026, for Agent I (Database COO).

   THE OWNER'S WORDS THIS IS BUILT FROM
     "WHAT ABOUT WIDGET SETTING UP SETTINGS AS WIDGETS AS i ASKED EARLIER"
     "SIMILAR TO TRADING PLATFORM i CAN MOVE AND RESIZE EACH AS I WANT"
     "SO CAN WE DRAG AND DROP; AND RESIZE ANYWAY WE WANT"
     "IF IT IS YEAR END I MAY WANT TO SET UP DASH MORE FOR FINANCE… OR
      CULTIVATION, OR PACKAGING, OR HR. VERY VERY FLEXIBLE."
     "once drill down data is not needed by user and they finish reviewing they
      should be able to close it to see the normal dash again."

   HOW TO MOUNT IT — the whole interface

     import { WidgetCanvas } from "./wcanvas.jsx";

     <WidgetCanvas />                          // the user's own dashboards, with the switcher
     <WidgetCanvas page="command" />           // pinned to one dashboard_key, switcher hidden
     <WidgetCanvas go={go} />                  // `go(drillKey)` opens the platform's own page

     props
       page?    string   pin to one dashboard_key. Omit for the switcher.
       go?      (key)=>void  the host's router. Omitted is fine: every drill still
                             opens IN PLACE; `go` only adds "open the full page".
       heading? string   optional heading. Omitted renders no heading, so the
                         host page keeps control of its own chrome.

   IT BRINGS ITS OWN SCOPE. The root element carries .tgwc and wcanvas.css takes
   its tokens from the platform's global :root palette, so this renders correctly
   wherever it is mounted. It does not require .ccpage and imports no other
   page's stylesheet.

   IT TOUCHES NOTHING ELSE. Its own files only: wcanvas.jsx, wcanvas-kinds.jsx,
   wcanvas-live.jsx, wcanvas-data.js, wcanvas.css. No existing component, page or
   stylesheet is modified, and nothing here is imported from App.jsx,
   commandcenter.jsx or dashkit.jsx.

   THE THREE "NOTHING HERE YET" CASES, AND WHY NONE OF THEM IS AN ERROR
     v_my_dashboards → 0 rows   the user has never made a dashboard.
                                Offer the template picker. The six house
                                starters ARE the house default.
     v_my_layout     → 0 rows   the dashboard exists and holds no panels.
                                Offer the widget picker and the templates.
     a widget's own source empty  the figure is not nought, the table has never
                                been fed. Said in those words, on the panel.
   ═══════════════════════════════════════════════════════════════════════════ */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  GRID_COLS, MAX_H, clampItem, resolve, firstFreeSlot, uidOf, resolveConfig, normaliseOptions,
  loadDashboards, loadTemplates, loadCatalogue, loadComputeSpecs, loadLayout, loadTargets,
  loadTrend, loadRoomDirectory, loadColumnSemantics, makeSaver, resetLayout, createDashboard, renameDashboard,
  deleteDashboard, setDefaultDashboard, forgetSourceTotals,
} from "./wcanvas-data.js";
import { RecordDrill, WcEmpty, WcErr } from "./wcanvas-kinds.jsx";
/* The dispatcher moved to wcanvas-live.jsx on 13 Aug 2026 with the four kinds it
   now has to know about. There is still exactly one of it. */
import { WidgetBody } from "./wcanvas-live.jsx";
import "./wcanvas.css";

/* An icon column that carries two vocabularies: 45 metric widgets name an icon
   from App.jsx's private set ("alert", "scale", "box"), the five interactive
   ones carry a glyph. This canvas cannot reach App.jsx's set — it is a module
   private, not an export, and reaching into that file is outside this lane. So
   a glyph is shown and a name is not, rather than the word "alert" printed on a
   tile as though it were an icon. Raised with Agent I. */
const glyphOf = (icon) => (icon && !/^[a-z0-9_-]+$/i.test(icon) ? icon : null);

/* THE SIZE A PANEL ARRIVES AT, decided by what it has to show.
   Every panel used to arrive 3 columns by 2 rows — 110px tall. That is right for a
   figure and a rail and unusable for anything that draws. Placed on the live site
   on 13 Aug 2026, a chart at 3x2 had no room for the chart at all, and a channel
   showed one line of one message. A panel the user must resize before it shows
   anything is not finished.
   Every one is still freely movable and resizable; this is only where it lands. */
const ARRIVES_AT = {
  chart:     { w: 6, h: 4 },   // an axis, a line and two date labels need the width
  list:      { w: 6, h: 4 },   // rows carrying a certificate and a manifest
  feed:      { w: 6, h: 4 },   // a timestamp, the entry and who, on one line
  messaging: { w: 4, h: 4 },   // messages, plus somewhere to type
  calendar:  { w: 4, h: 3 },
  schedule:  { w: 4, h: 3 },
  alerts:    { w: 4, h: 3 },
  tasks:     { w: 4, h: 3 },
  lookup:    { w: 4, h: 3 },
};

/* ═══════════════════════════════════════════════════════════════════════════
   SETTINGS RENDERED FROM options_schema — never a hardcoded dropdown.
   The choices are data precisely so a new calendar is a database row and not a
   deploy. A field type this renderer does not know is NAMED on screen, because
   a setting that silently fails to appear is a setting the user cannot find.
   ═══════════════════════════════════════════════════════════════════════════ */
function SchemaField({ id, name, def, value, onChange, onCommit }) {
  const label = def?.label ?? name.replace(/_/g, " ");
  const shown = value === undefined || value === null ? "" : value;

  /* A tick or a choice is one finished gesture, so it writes at once. Typing is
     not — a text or number field writes when it is LEFT, which is what keeps
     "one save per gesture" true of a field with eight characters in it. */
  if (def?.type === "boolean") {
    return (
      <div className="tgwc-field check">
        <input id={id} type="checkbox" checked={value === true}
          onChange={(e) => { onChange(e.target.checked); onCommit(); }} />
        <label htmlFor={id}>{label}</label>
      </div>
    );
  }
  if (def?.type === "select") {
    const opts = normaliseOptions(def.options);
    const chosen = opts.find((o) => String(o.value) === String(value));
    return (
      <div className="tgwc-field">
        <label htmlFor={id}>{label}</label>
        <select id={id} className="tgwc-sel" value={String(shown)}
          onChange={(e) => { onChange(e.target.value); onCommit(); }}>
          {opts.map((o) => <option key={String(o.value)} value={String(o.value)}>{o.label}</option>)}
        </select>
        {chosen?.note && <span className="tgwc-say">{chosen.note}</span>}
      </div>
    );
  }
  /* A choice whose list is ROWS, not a schema: which channel, which figure has
     readings. It cannot be drawn from the schema because the schema does not know
     what exists today, so it is drawn on the panel face where the list is read.
     Said here rather than left out — a setting that silently does not appear in
     the place a user goes looking for settings is a setting they cannot find. */
  if (def?.type === "live_select") {
    return (
      <div className="tgwc-field">
        <span className="tgwc-fieldlabel">{label}</span>
        <span className="tgwc-say">
          Chosen from the dropdown on the panel itself, because the choices are live records
          rather than a fixed list. It is currently set to{" "}
          <b>{shown === "" ? "nothing — the panel says which it is standing in for" : String(shown)}</b>.
        </span>
      </div>
    );
  }
  if (def?.type === "number") {
    return (
      <div className="tgwc-field">
        <label htmlFor={id}>{label}{def.min != null && def.max != null ? ` (${def.min} to ${def.max})` : ""}</label>
        <input id={id} className="tgwc-in" type="number" min={def.min} max={def.max} value={shown}
          onBlur={onCommit}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (!Number.isFinite(n)) { onChange(e.target.value); return; }
            const lo = def.min == null ? n : Math.max(def.min, n);
            onChange(def.max == null ? lo : Math.min(def.max, lo));
          }} />
      </div>
    );
  }
  if (def?.type === "text") {
    return (
      <div className="tgwc-field">
        <label htmlFor={id}>{label}</label>
        <input id={id} className="tgwc-in" type="text" value={shown} onBlur={onCommit}
          onChange={(e) => onChange(e.target.value)} />
      </div>
    );
  }
  return (
    <div className="tgwc-field">
      <span className="tgwc-say">
        The setting <b>{name}</b> declares type &quot;{String(def?.type)}&quot;, which this canvas cannot draw a
        control for. It keeps whatever value it already has and is shown here so it is not invisible.
      </span>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   ONE PANEL
   ═══════════════════════════════════════════════════════════════════════════ */
function Panel({
  item, spec, target, trend, targets, trends, roomMap, options, go, canRemove,
  onPointerGesture, onKeyGesture, onPatch, onPatchLocal, onSaveNow, onRemove, onDrill,
  held, settingsOpen, onToggleSettings,
}) {
  const cfg = useMemo(() => resolveConfig(item.options_schema, item.config), [item.options_schema, item.config]);
  const glyph = glyphOf(item.icon);
  const idBase = `tgwc-${item.uid.replace(/[^a-z0-9]/gi, "-")}`;

  /* CHANGING A DROPDOWN ON THE PANEL FACE IS ONE FINISHED GESTURE, so it writes at
     once — the same path the settings pop-out takes, not a second one. The owner
     asked for the calendar, the schedule, the tasks and the alerts to be switchable
     without leaving the board; the write behaviour must not differ depending on
     which of the two places he changed it from. */
  const setCfg = useCallback(
    (name, value) => onPatch(item.uid, { config: { ...cfg, [name]: value } }),
    [onPatch, item.uid, cfg],
  );

  /* Every widget body may hand back its OWN source and filters, because the
     panel's source is not always the catalogue's: a Calendar set to
     "Deliveries and pickups" reads metrc_transfers while the catalogue names
     harvest_schedule. The guard on `over` matters — several of these buttons
     are wired straight to onClick, which would otherwise spread a React event
     into the drill descriptor. */
  const drill = (over) => {
    const extra = over && typeof over === "object" && !over.nativeEvent ? over : null;
    onDrill({
      title: item.label,
      basis: `Every record behind this panel, read from ${item.source} with the same filters the figure used. Nothing is summarised and nothing is sampled.`,
      source: item.source,
      filters: spec ? spec.filters : [],
      drill: item.drill,
      ...extra,
    });
  };

  return (
    <section
      className={`tgwc-panel${held ? " moving" : ""}`}
      style={{ gridColumn: `${item.x + 1} / span ${item.w}`, gridRow: `${item.y + 1} / span ${item.h}` }}
      aria-label={item.label}
    >
      <div className="tgwc-phead">
        <button
          type="button"
          className={`tgwc-grip${held ? " held" : ""}`}
          aria-label={`Move ${item.label}. Column ${item.x + 1}, row ${item.y + 1}, ${item.w} wide by ${item.h} tall. Use the arrow keys to move it, hold Shift and use the arrow keys to resize it, or drag it with the mouse.`}
          onPointerDown={(e) => onPointerGesture(e, item, "move")}
          onKeyDown={(e) => onKeyGesture(e, item)}
          title="Drag to move. With the keyboard: arrow keys move, Shift and arrow keys resize."
        >
          ⠿
        </button>
        {glyph && <span className="tgwc-picon" aria-hidden="true">{glyph}</span>}
        <span className="tgwc-ptitle" title={item.label}>{item.label}</span>
        {item.hot && <span className="tgwc-chip crit" title="The catalogue flags this figure as one to watch.">watch</span>}
        <button type="button" className={`tgwc-btn${settingsOpen ? " on" : ""}`}
          aria-expanded={settingsOpen} onClick={onToggleSettings}
          title="Rename this panel, change what it shows, set its exact position and size, or take it off the dashboard.">
          settings
        </button>
      </div>

      <div className="tgwc-pbody">
        {settingsOpen ? (
          <div className="tgwc-pop">
            <div className="tgwc-field">
              <label htmlFor={`${idBase}-name`}>Name this panel</label>
              <input id={`${idBase}-name`} className="tgwc-in" type="text"
                value={item.title_override === null || item.title_override === undefined ? "" : item.title_override}
                placeholder={item.catalogue_label}
                onBlur={onSaveNow}
                onChange={(e) => onPatchLocal(item.uid, {
                  title_override: e.target.value === "" ? null : e.target.value,
                  label: e.target.value === "" ? item.catalogue_label : e.target.value,
                })} />
              <span className="tgwc-say">
                Two of the same widget side by side both read &quot;{item.catalogue_label}&quot; until you name them.
              </span>
            </div>

            {item.options_schema && Object.keys(item.options_schema).length > 0 ? (
              <div className="tgwc-fields">
                {Object.entries(item.options_schema).map(([name, def]) => (
                  <SchemaField
                    key={name}
                    id={`${idBase}-${name}`}
                    name={name}
                    def={def}
                    value={cfg[name]}
                    onChange={(v) => onPatchLocal(item.uid, { config: { ...cfg, [name]: v } })}
                    onCommit={onSaveNow}
                  />
                ))}
              </div>
            ) : (
              <span className="tgwc-say">This widget declares no settings of its own, so there is nothing here to change.</span>
            )}

            <div className="tgwc-fields">
              <div className="tgwc-field">
                <label htmlFor={`${idBase}-x`}>Column (1 to {GRID_COLS})</label>
                <input id={`${idBase}-x`} className="tgwc-in" type="number" min={1} max={GRID_COLS} value={item.x + 1}
                  onBlur={onSaveNow} onChange={(e) => onPatchLocal(item.uid, { x: Number(e.target.value) - 1 })} />
              </div>
              <div className="tgwc-field">
                <label htmlFor={`${idBase}-y`}>Row</label>
                <input id={`${idBase}-y`} className="tgwc-in" type="number" min={1} value={item.y + 1}
                  onBlur={onSaveNow} onChange={(e) => onPatchLocal(item.uid, { y: Number(e.target.value) - 1 })} />
              </div>
              <div className="tgwc-field">
                <label htmlFor={`${idBase}-w`}>Width in columns</label>
                <input id={`${idBase}-w`} className="tgwc-in" type="number" min={1} max={GRID_COLS} value={item.w}
                  onBlur={onSaveNow} onChange={(e) => onPatchLocal(item.uid, { w: Number(e.target.value) })} />
              </div>
              <div className="tgwc-field">
                <label htmlFor={`${idBase}-h`}>Height in rows</label>
                <input id={`${idBase}-h`} className="tgwc-in" type="number" min={1} max={MAX_H} value={item.h}
                  onBlur={onSaveNow} onChange={(e) => onPatchLocal(item.uid, { h: Number(e.target.value) })} />
              </div>
            </div>

            <div className="tgwc-fields">
              <button type="button" className="tgwc-btn" onClick={() => onPatch(item.uid, { visible: false })}>
                Hide this panel
              </button>
              <button type="button" className="tgwc-btn danger" disabled={!canRemove} onClick={() => onRemove(item.uid)}>
                Take it off this dashboard
              </button>
              <button type="button" className="tgwc-btn on" onClick={onToggleSettings}>Done</button>
            </div>
          </div>
        ) : (
          <WidgetBody
            item={item}
            spec={spec}
            target={target}
            trend={trend}
            targets={targets}
            trends={trends}
            roomMap={roomMap}
            cfg={cfg}
            setCfg={setCfg}
            options={options}
            go={go}
            onDrill={drill}
          />
        )}
      </div>

      {/* Resize grips. Each is a real button so the mouse has an affordance and
          the keyboard is not left out — Shift and the arrow keys on the move
          handle do the same job. */}
      <button type="button" className="tgwc-grip-e" aria-label={`Make ${item.label} wider or narrower`}
        onPointerDown={(e) => onPointerGesture(e, item, "e")} tabIndex={-1} />
      <button type="button" className="tgwc-grip-s" aria-label={`Make ${item.label} taller or shorter`}
        onPointerDown={(e) => onPointerGesture(e, item, "s")} tabIndex={-1} />
      <button type="button" className="tgwc-grip-se" aria-label={`Resize ${item.label}`}
        onPointerDown={(e) => onPointerGesture(e, item, "se")} tabIndex={-1} />
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   THE CANVAS
   ═══════════════════════════════════════════════════════════════════════════ */
export function WidgetCanvas({ page, go, heading }) {
  const [boot, setBoot] = useState(null);
  const [bootNonce, setBootNonce] = useState(0);
  const [active, setActive] = useState(page ?? null);
  const [items, setItems] = useState(null);          // null = still reading
  const [layoutErr, setLayoutErr] = useState(null);
  const [saveErr, setSaveErr] = useState(null);
  const [drill, setDrill] = useState(null);
  const [picker, setPicker] = useState(false);
  const [settingsFor, setSettingsFor] = useState(null);
  const [held, setHeld] = useState(null);
  const [announce, setAnnounce] = useState("");
  const [busy, setBusy] = useState(null);
  /* null, or { kind: "new" | "rename" | "reset" | "delete", name, template } */
  const [dialog, setDialog] = useState(null);
  const gridRef = useRef(null);
  const dragRef = useRef(null);
  const itemsRef = useRef(null);
  itemsRef.current = items;

  const saver = useMemo(() => makeSaver(setSaveErr), []);

  /* ── boot ─────────────────────────────────────────────────────────────── */
  useEffect(() => {
    let live = true;
    forgetSourceTotals();
    Promise.all([
      loadDashboards(), loadTemplates(), loadCatalogue(),
      loadComputeSpecs(), loadTargets(), loadTrend(), loadRoomDirectory(),
      /* The column dictionary must be in memory BEFORE the first record table renders, or a tag
         would draw as plain text on the first paint and silently gain its drill link a moment
         later. Loaded in the same Promise.all as everything else, so it cannot be forgotten. */
      loadColumnSemantics(),
    ]).then(([dash, tpl, cat, specs, targets, trend, rooms]) => {
      if (live) setBoot({ dash, tpl, cat, specs, targets, trend, rooms });
    });
    return () => { live = false; };
  }, [bootNonce]);

  /* ── which dashboard ──────────────────────────────────────────────────── */
  useEffect(() => {
    if (page) { setActive(page); return; }
    if (!boot || !boot.dash.rows) return;
    setActive((cur) => {
      if (cur && boot.dash.rows.some((d) => d.dashboard_key === cur)) return cur;
      const def = boot.dash.rows.find((d) => d.is_default);
      return def ? def.dashboard_key : boot.dash.rows.length ? boot.dash.rows[0].dashboard_key : null;
    });
  }, [boot, page]);

  /* ── the arrangement ──────────────────────────────────────────────────── */
  const readLayout = useCallback((key) => {
    if (!key) { setItems(null); return; }
    setItems(null);
    setLayoutErr(null);
    loadLayout(key).then((r) => {
      if (r.err) { setLayoutErr(r.err); setItems(null); return; }
      const mapped = r.rows.map((row) => clampItem({
        uid: uidOf(row.widget_key, row.instance_id),
        widget_key: row.widget_key,
        instance_id: row.instance_id ?? 1,
        x: row.x, y: row.y, w: row.w, h: row.h,
        visible: row.visible !== false,
        config: row.config && typeof row.config === "object" ? row.config : {},
        title_override: row.label === row.catalogue_label ? null : row.label,
        label: row.label,
        catalogue_label: row.catalogue_label,
        category: row.category,
        icon: row.icon,
        source: row.source,
        drill: row.drill,
        format: row.format,
        hot: row.hot,
        widget_kind: row.widget_kind,
        multi_instance: row.multi_instance,
        options_schema: row.options_schema,
      }));
      const vis = mapped.filter((i) => i.visible);
      const hid = mapped.filter((i) => !i.visible);
      setItems([...resolve(vis, null), ...hid]);
    });
  }, []);

  useEffect(() => { readLayout(active); }, [active, readLayout]);

  /* ── writing ──────────────────────────────────────────────────────────── */
  const arrange = useCallback((list, heldUid) => {
    const vis = list.filter((i) => i.visible !== false);
    const hid = list.filter((i) => i.visible === false);
    return [...resolve(vis, heldUid), ...hid];
  }, []);

  /* Preview moves the panels on screen and writes nothing. */
  const preview = useCallback((list, heldUid) => setItems(arrange(list, heldUid)), [arrange]);

  /* Commit is ONE write, at the end of the gesture. The saver coalesces and is
     single-flight, so a drag across the whole board posts once, not forty
     times. */
  const commit = useCallback((list, heldUid) => {
    const next = arrange(list, heldUid);
    setItems(next);
    if (active) saver.save(active, next);
  }, [active, arrange, saver]);

  const applyTo = useCallback((uid, fields) =>
    (itemsRef.current ? itemsRef.current : []).map((i) => (i.uid === uid ? clampItem({ ...i, ...fields }) : i)), []);

  /* Change and write — one finished gesture. */
  const patch = useCallback((uid, fields) => commit(applyTo(uid, fields), uid), [applyTo, commit]);

  /* Change and DO NOT write. What a field being typed into uses; the write
     follows on blur through saveNow. */
  const patchLocal = useCallback((uid, fields) => setItems(arrange(applyTo(uid, fields), uid)), [applyTo, arrange]);

  const saveNow = useCallback(() => {
    if (active && itemsRef.current) saver.save(active, itemsRef.current);
  }, [active, saver]);

  const removePanel = useCallback((uid) => {
    const list = (itemsRef.current ? itemsRef.current : []).filter((i) => i.uid !== uid);
    setSettingsFor(null);
    commit(list, null);
  }, [commit]);

  /* ── pointer drag and resize ──────────────────────────────────────────── */
  const onPointerGesture = useCallback((e, item, mode) => {
    if (e.button !== undefined && e.button !== 0) return;
    const grid = gridRef.current;
    if (!grid) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const cs = getComputedStyle(grid);
    const gap = parseFloat(cs.columnGap) || 6;
    const rowH = parseFloat(cs.gridAutoRows) || 52;
    const colW = (grid.getBoundingClientRect().width - gap * (GRID_COLS - 1)) / GRID_COLS;
    /* A grid with no measurable width would make every pointer movement an
       infinite number of columns. Under 900px the panels are one per row
       anyway and the grips are not shown, so there is nothing to do here. */
    if (!(colW > 0) || !(rowH > 0)) return;
    dragRef.current = {
      mode, uid: item.uid, startX: e.clientX, startY: e.clientY,
      base: { x: item.x, y: item.y, w: item.w, h: item.h },
      colW: colW + gap, rowH: rowH + gap,
      node: e.currentTarget, pointerId: e.pointerId, moved: false,
    };
    setHeld(item.uid);
  }, []);

  useEffect(() => {
    const move = (e) => {
      const d = dragRef.current;
      if (!d) return;
      const dx = Math.round((e.clientX - d.startX) / d.colW);
      const dy = Math.round((e.clientY - d.startY) / d.rowH);
      if (dx === 0 && dy === 0 && !d.moved) return;
      d.moved = true;
      const list = (itemsRef.current ? itemsRef.current : []).map((i) => {
        if (i.uid !== d.uid) return i;
        if (d.mode === "move") return clampItem({ ...i, x: d.base.x + dx, y: d.base.y + dy });
        const w = d.mode === "s" ? i.w : d.base.w + dx;
        const h = d.mode === "e" ? i.h : d.base.h + dy;
        return clampItem({ ...i, w, h });
      });
      preview(list, d.uid);
    };
    const up = () => {
      const d = dragRef.current;
      dragRef.current = null;
      setHeld(null);
      if (!d) return;
      d.node?.releasePointerCapture?.(d.pointerId);
      if (d.moved) commit(itemsRef.current ? itemsRef.current : [], d.uid);   // ← the single write
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }, [preview, commit]);

  /* ── keyboard move and resize ─────────────────────────────────────────── */
  const onKeyGesture = useCallback((e, item) => {
    const D = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    const d = D[e.key];
    if (!d) return;
    e.preventDefault();
    const [dx, dy] = d;
    const list = (itemsRef.current ? itemsRef.current : []).map((i) => {
      if (i.uid !== item.uid) return i;
      return e.shiftKey
        ? clampItem({ ...i, w: i.w + dx, h: i.h + dy })
        : clampItem({ ...i, x: i.x + dx, y: i.y + dy });
    });
    commit(list, item.uid);
    const after = list.find((i) => i.uid === item.uid);
    setAnnounce(e.shiftKey
      ? `${item.label} is now ${after.w} columns wide and ${after.h} rows tall.`
      : `${item.label} moved to column ${after.x + 1}, row ${after.y + 1}.`);
  }, [commit]);

  /* ── adding a widget ──────────────────────────────────────────────────── */
  const addWidget = useCallback((cat) => {
    const list = itemsRef.current ? itemsRef.current : [];
    const existing = list.filter((i) => i.widget_key === cat.key);
    if (existing.length && !cat.multi_instance) return;
    const instance_id = existing.reduce((m, i) => Math.max(m, i.instance_id), 0) + 1;
    const size = ARRIVES_AT[cat.widget_kind] ? ARRIVES_AT[cat.widget_kind] : { w: 3, h: 2 };
    const slot = firstFreeSlot(list.filter((i) => i.visible !== false), size.w, size.h);
    const item = clampItem({
      uid: uidOf(cat.key, instance_id),
      widget_key: cat.key, instance_id,
      x: slot.x, y: slot.y, w: size.w, h: size.h, visible: true,
      config: {}, title_override: null,
      label: cat.label, catalogue_label: cat.label, category: cat.category,
      icon: cat.icon, source: cat.source, drill: cat.drill, format: cat.format, hot: cat.hot,
      widget_kind: cat.widget_kind, multi_instance: cat.multi_instance, options_schema: cat.options_schema,
    });
    commit([...list, item], item.uid);
    setPicker(false);
    setAnnounce(`${cat.label} added at column ${item.x + 1}, row ${item.y + 1}.`);
  }, [commit]);

  /* ── dashboard-level actions ──────────────────────────────────────────── */
  const runAction = useCallback(async (label, fn) => {
    setBusy(label);
    const { err } = await fn();
    setBusy(null);
    if (err) { setSaveErr(err); return false; }
    setSaveErr(null);
    setBootNonce((n) => n + 1);
    return true;
  }, []);

  /* Naming, renaming and confirming happen IN THE PAGE, not in a browser
     prompt. A prompt cannot be styled, cannot be read by the page's own live
     region, and is suppressed outright in some embedded contexts — which would
     make "new dashboard" a button that silently does nothing. */
  const createFromDialog = useCallback(async (name, templateKey) => {
    setBusy("creating");
    const { value, err } = await createDashboard(name, templateKey, page ? page : null);
    setBusy(null);
    if (err) { setSaveErr(err); return; }
    setSaveErr(null);
    setDialog(null);
    setActive(value);
    setBootNonce((n) => n + 1);
  }, [page]);

  /* ═══════════ render ═══════════ */

  if (!boot) return <div className="tgwc"><p className="tgwc-say">Reading your dashboards…</p></div>;

  const fatal = [
    ["Your dashboards", boot.dash.err],
    ["The widget catalogue", boot.cat.err],
    ["The widget compute rules", boot.specs.err],
  ].filter(([, e]) => e);

  if (fatal.length) {
    return (
      <div className="tgwc">
        {fatal.map(([what, err]) => <WcErr key={what} what={what} err={err} />)}
        <button type="button" className="tgwc-btn" onClick={() => setBootNonce((n) => n + 1)}>Try again</button>
      </div>
    );
  }

  const dashboards = boot.dash.rows;
  const catalogue = boot.cat.rows;
  const specByKey = new Map(boot.specs.rows.map((s) => [s.key, s]));
  const targetByKey = new Map((boot.targets.rows ? boot.targets.rows : []).map((t) => [`${String(t.department).toLowerCase()}|${String(t.kpi).toLowerCase()}`, t]));
  const trendByKey = new Map((boot.trend.rows ? boot.trend.rows : []).map((t) => [`${String(t.department).toLowerCase()}|${String(t.kpi).toLowerCase()}`, t]));
  const roomMap = boot.rooms.map;
  const noDrill = catalogue.filter((c) => c.has_no_drill);
  /* Moved above the no-dashboards branch on 13 Aug 2026 so the confirm dialog,
     which needs it, can be defined once and rendered in both branches. Undefined
     when there are no dashboards, which is exactly what it meant before. */
  const current = dashboards.find((d) => d.dashboard_key === active);

  const templatePicker = (
    <div className="tgwc-pop">
      <span className="tgwc-bar-title">Start from a house template, or from nothing</span>
      <p className="tgwc-say tight">
        Each one places the widgets for its areas and you can move, resize, rename or remove every one
        of them afterwards. The counts are live — they are what the template would actually place today.
      </p>
      {boot.tpl.err
        ? <WcErr what="The templates" err={boot.tpl.err} />
        : (
          <div className="tgwc-tpl">
            {boot.tpl.rows.map((t) => (
              <button type="button" className="tgwc-tplcard" key={t.template_key}
                onClick={() => setDialog({ kind: "new", name: t.name, template: t.template_key })}>
                <span className="n">{t.name}</span>
                <span className="p">{t.purpose}</span>
                <span className="c">{t.widgets_it_would_add} widgets · {t.covers}</span>
              </button>
            ))}
            <button type="button" className="tgwc-tplcard"
              onClick={() => setDialog({ kind: "new", name: "My dashboard", template: null })}>
              <span className="n">Empty</span>
              <span className="p">Start with nothing and add exactly the panels you want.</span>
              <span className="c">0 widgets</span>
            </button>
          </div>
        )}
    </div>
  );

  /* NAMING AND CONFIRMING, IN THE PAGE — defined ONCE, above the branch, because
     it is needed on both sides of it. It was written inside the main return only,
     and the no-dashboards branch below never rendered it. The effect, measured on
     the live site on 13 Aug 2026: a brand-new user clicked a template card, the
     dialog state was set, nothing appeared, and there was NO WAY AT ALL to create
     a first dashboard. Six buttons that set state and show nothing. Repaired by
     rendering the same dialog in both branches — one definition, two places, no
     second copy. */
  const confirmDialog = dialog && (
    <div className="tgwc-pop" role="group" aria-label="Confirm">
      {(dialog.kind === "new" || dialog.kind === "rename") && (
        <>
          <div className="tgwc-field" style={{ minWidth: 260 }}>
            <label htmlFor="tgwc-dialog-name">
              {dialog.kind === "new"
                ? `Name this dashboard${dialog.template ? " (from the template you picked)" : ""}`
                : "Rename this dashboard"}
            </label>
            <input id="tgwc-dialog-name" className="tgwc-in" type="text" value={dialog.name}
              onChange={(e) => setDialog((d) => ({ ...d, name: e.target.value }))} />
          </div>
          <p className="tgwc-say tight">You pick it from a list, so give it a name you will recognise later.</p>
          <div className="tgwc-fields">
            <button type="button" className="tgwc-btn on" disabled={!!busy || !dialog.name.trim()}
              onClick={() => dialog.kind === "new"
                ? createFromDialog(dialog.name.trim(), dialog.template)
                : runAction("rename", () => renameDashboard(active, dialog.name.trim())).then((done) => { if (done) setDialog(null); })}>
              {dialog.kind === "new" ? "Create it" : "Rename it"}
            </button>
            <button type="button" className="tgwc-btn" onClick={() => setDialog(null)}>Cancel</button>
          </div>
        </>
      )}
      {dialog.kind === "reset" && (
        <>
          <span className="tgwc-bar-title">Put &quot;{dialog.name}&quot; back to nothing?</span>
          <p className="tgwc-say tight">
            Every panel you placed on it is removed and you choose again from the templates. Only your own
            view changes — nobody else&apos;s dashboard is touched.
          </p>
          <div className="tgwc-fields">
            <button type="button" className="tgwc-btn danger" disabled={!!busy} onClick={async () => {
              const done = await runAction("reset", () => resetLayout(active));
              setDialog(null);
              if (done) readLayout(active);
            }}>Yes, reset it</button>
            <button type="button" className="tgwc-btn" onClick={() => setDialog(null)}>Keep it as it is</button>
          </div>
        </>
      )}
      {dialog.kind === "delete" && (
        <>
          <span className="tgwc-bar-title">Delete &quot;{dialog.name}&quot;?</span>
          <p className="tgwc-say tight">
            Its panels go with it. Your other dashboards are untouched, and if this was the one that opens
            first another takes over so you are never left with dashboards and no default.
          </p>
          <div className="tgwc-fields">
            <button type="button" className="tgwc-btn danger" disabled={!!busy} onClick={async () => {
              const key = current ? current.dashboard_key : active;
              setDialog(null);
              setActive(null);
              await runAction("delete", () => deleteDashboard(key));
            }}>Yes, delete it</button>
            <button type="button" className="tgwc-btn" onClick={() => setDialog(null)}>Keep it</button>
          </div>
        </>
      )}
    </div>
  );

  /* No dashboards at all. Not an error and not an empty screen — the house
     starters ARE the default, so they are what gets offered. */
  if (!page && dashboards.length === 0) {
    return (
      <div className="tgwc">
        {heading && <div className="tgwc-bar"><span className="tgwc-bar-title">{heading}</span></div>}
        <WcEmpty
          why="You have not set up a dashboard yet."
          fills="Nothing has gone wrong: dashboards are personal, and yours is empty because you have never arranged one. Pick a starting point below and you can move, resize and rename every panel afterwards. Nobody else's view changes."
        />
        {templatePicker}
        {confirmDialog}
        {saveErr && <WcErr what="That could not be saved" err={saveErr} />}
      </div>
    );
  }

  const visible = items ? items.filter((i) => i.visible !== false) : [];
  const hidden = items ? items.filter((i) => i.visible === false) : [];

  return (
    <div className={`tgwc${drill ? " drilling" : ""}`}>
      <span className="tgwc-live" role="status" aria-live="polite">{announce}</span>

      {/* ── the switcher and the action bar ── */}
      <div className="tgwc-bar">
        {heading && <span className="tgwc-bar-title">{heading}</span>}

        {!page && (
          <>
            <label className="tgwc-fieldlabel" htmlFor="tgwc-which">Dashboard</label>
            <select id="tgwc-which" className="tgwc-sel" value={active === null ? "" : active}
              onChange={(e) => { setDrill(null); setSettingsFor(null); setActive(e.target.value); }}>
              {dashboards.map((d) => (
                <option key={d.dashboard_key} value={d.dashboard_key}>
                  {d.name}{d.is_default ? " (opens first)" : ""} — {d.widgets} panels
                </option>
              ))}
            </select>
            <button type="button" className="tgwc-btn" disabled={!!busy}
              onClick={() => setDialog({ kind: "new", name: "My dashboard", template: null })}>
              + new dashboard
            </button>
          </>
        )}

        <button type="button" className={`tgwc-btn${picker ? " on" : ""}`} aria-expanded={picker}
          onClick={() => setPicker((v) => !v)}>
          {picker ? "done adding" : "+ add a panel"}
        </button>

        <span className="spacer" />

        {current && !current.is_default && !page && (
          <button type="button" className="tgwc-btn" disabled={!!busy}
            onClick={() => runAction("default", () => setDefaultDashboard(active))}
            title="Open this dashboard first from now on.">
            open this one first
          </button>
        )}
        {current && !page && (
          <button type="button" className="tgwc-btn" disabled={!!busy}
            onClick={() => setDialog({ kind: "rename", name: current.name, template: null })}>rename</button>
        )}
        <button type="button" className="tgwc-btn" disabled={!!busy || !active}
          onClick={() => setDialog({ kind: "reset", name: current ? current.name : active, template: null })}
          title="Remove every panel from this dashboard and start again.">
          reset to default
        </button>
        {current && !page && (
          <button type="button" className="tgwc-btn danger" disabled={!!busy}
            onClick={() => setDialog({ kind: "delete", name: current.name, template: null })}>delete</button>
        )}
      </div>

      {confirmDialog}

      {saveErr && <WcErr what="Your arrangement" err={saveErr} />}
      {boot.targets.err && <WcErr what="The owner-set targets" err={boot.targets.err} />}
      {boot.trend.err && <WcErr what="The daily snapshots" err={boot.trend.err} />}
      {boot.rooms.err && <WcErr what="The room directory" err={boot.rooms.err} />}
      {noDrill.length > 0 && (
        <div className="tgwc-err">
          <b>{noDrill.length} widget(s) in the catalogue have no drill target:</b>{" "}
          {noDrill.map((c) => c.label).join(", ")}. A figure that cannot be opened to the records behind
          it is not finished (rule C1). Reported here rather than hidden.
        </div>
      )}

      {/* ── the picker ── */}
      {picker && (
        <div className="tgwc-pop">
          <span className="tgwc-bar-title">Add a panel</span>
          <p className="tgwc-say tight">
            {catalogue.length} widgets across {new Set(catalogue.map((c) => c.category)).size} areas. A widget already
            on this dashboard is greyed out unless it is one you are allowed more than one of.
          </p>
          <div className="tgwc-cats">
            {[...new Set(catalogue.map((c) => c.category))].map((cat) => (
              <div key={cat}>
                <div className="tgwc-cat-h">{cat}</div>
                <div className="tgwc-cat-g">
                  {catalogue.filter((c) => c.category === cat).map((c) => {
                    /* Counted across HIDDEN panels too. Counting only the
                       visible ones made a hidden singleton look addable, and
                       the click then did nothing at all — a dead control. */
                    const on = (items ? items : []).filter((i) => i.widget_key === c.key).length;
                    const blocked = on > 0 && !c.multi_instance;
                    return (
                      <button type="button" key={c.key} className="tgwc-btn wide" disabled={blocked}
                        onClick={() => addWidget(c)}
                        title={blocked
                          ? "Already on this dashboard — it may only be placed once. If you cannot see it, it is in the hidden panels below."
                          : c.multi_instance
                            ? "You may place more than one of these — a second copy can be set to show something different."
                            : "Add this panel to your dashboard."}>
                        {c.label}{on > 0 ? ` · ${on} placed` : ""}{c.multi_instance ? " · copies allowed" : ""}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── the drill, in place, above the board so it is where the eye is ── */}
      {drill && (
        <RecordDrill
          title={drill.title}
          basis={drill.basis}
          source={drill.source}
          filters={drill.filters}
          roomMap={roomMap}
          drill={drill.drill}
          go={go}
          onClose={() => setDrill(null)}
        />
      )}

      {/* ── the board ── */}
      {layoutErr && <WcErr what="Your arrangement" err={layoutErr} />}
      {items === null && !layoutErr && <p className="tgwc-say">Reading your arrangement…</p>}

      {items !== null && visible.length === 0 && (
        <>
          <WcEmpty
            why="This dashboard has no panels on it."
            fills="It exists and it is yours; there is simply nothing placed on it yet. Add panels one at a time, or start it again from a template."
            action={<button type="button" className="tgwc-btn" onClick={() => setPicker(true)}>Add the first panel</button>}
          />
          {!page && templatePicker}
        </>
      )}

      {items !== null && visible.length > 0 && (
        <div className="tgwc-grid" ref={gridRef}>
          {visible.map((item) => {
            const catKey = `${String(item.category).toLowerCase()}|${String(item.catalogue_label).toLowerCase()}`;
            /* A metric tile gets the ONE target and the ONE trend matching its own
               catalogue label. A chart is different: the figure it draws is chosen on
               the panel itself, so it is handed the whole set to choose from. The same
               two maps, built once at boot — not a second read. */
            return (
              <Panel
                key={item.uid}
                item={item}
                spec={specByKey.get(item.widget_key)}
                target={targetByKey.get(catKey)}
                trend={trendByKey.get(catKey)}
                targets={targetByKey}
                trends={trendByKey}
                roomMap={roomMap}
                options={{ which_schedule: normaliseOptions(item.options_schema?.which_schedule?.options) }}
                go={go}
                canRemove
                held={held === item.uid}
                settingsOpen={settingsFor === item.uid}
                onToggleSettings={() => setSettingsFor((c) => (c === item.uid ? null : item.uid))}
                onPointerGesture={onPointerGesture}
                onKeyGesture={onKeyGesture}
                onPatch={patch}
                onPatchLocal={patchLocal}
                onSaveNow={saveNow}
                onRemove={removePanel}
                onDrill={setDrill}
              />
            );
          })}
        </div>
      )}

      {/* ── hidden panels are findable, never lost ── */}
      {hidden.length > 0 && (
        <div className="tgwc-pop">
          <span className="tgwc-bar-title">{hidden.length} panel(s) you have hidden</span>
          <p className="tgwc-say tight">Hidden only for you. They keep their settings and come back where there is room.</p>
          <div className="tgwc-cat-g">
            {hidden.map((i) => (
              <button type="button" key={i.uid} className="tgwc-btn wide"
                onClick={() => patch(i.uid, { visible: true }, true)}>
                show &quot;{i.label}&quot; again
              </button>
            ))}
          </div>
        </div>
      )}

      <p className="tgwc-say">
        Drag a panel by its handle to move it, drag an edge or the bottom-right corner to resize it, or focus the
        handle and use the arrow keys — hold Shift to resize. Everything is saved to your own account the moment you
        let go; nobody else&apos;s dashboard changes.
      </p>
    </div>
  );
}

export default WidgetCanvas;
