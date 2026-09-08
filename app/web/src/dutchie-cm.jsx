/* Twisted C&M — live canopy HUD. Metrc custody SoR. Apex invoice SoR. Write NEVER. Cycle 56. */
import React, { useCallback, useEffect, useState } from "react";
import { supabase, FUNCTIONS_URL } from "./lib/supabase.js";
import "./os-desk.css";

const FEATURES = [
  ["Canopy", "Clones → plants → phases → harvest → package", "METRC", "LIVE"],
  ["Harvest a batch", "Room, start, wet weight. Harvest IN Metrc, watch it here.", "METRC", "LIVE"],
  ["Waste / destroy", "v_waste_qty_truth only. Never sum mixed units.", "METRC", "LIVE"],
  ["Rooms", "F1–F4 two-size (1140 / 1050). Cycle 56 locked.", "METRC", "LIVE"],
  ["BOM / run cards", "Plan here. Convert in Metrc. No Complete button.", "OS", "PLAN"],
  ["Inventory / packages", "Move/convert/manifest in Metrc. Board shows custody.", "METRC", "LIVE"],
  ["Lab / COA", "Attaches as each exists. Not invented.", "METRC", "PARTIAL"],
  ["Wholesale", "Apex is the order book. Phase 1 read. Phase 2 Apex write later.", "APEX", "LIVE"],
  ["Vendor bills / POS", "Not this phase.", "OS", "NEVER"],
  ["Write to Metrc", "Never. Not phase 2 either.", "OS", "NEVER"],
];

const RAIL = [
  ["ops_cm", "Overview"],
  ["rpt-plants-flowering", "Flowering plants"],
  ["rpt-plants-vegetative", "Vegetative plants"],
  ["rpt-harvests", "Harvests"],
  ["rpt-packages-inventory", "Packages"],
  ["grow_rooms", "Rooms"],
  ["rpt-plant-waste", "Waste"],
  ["ops_spine", "Harvest spine"],
  ["report_center", "Report Center"],
  ["report_vault", "Report Vault"],
];

function n(v) {
  if (v == null) return "—";
  const x = Number(v);
  return Number.isFinite(x) ? x.toLocaleString() : "—";
}

function fillPct(plants, cap) {
  const p = Number(plants);
  const c = Number(cap);
  if (!Number.isFinite(p) || !Number.isFinite(c) || c <= 0) return 0;
  const x = (p / c) * 100;
  if (x > 100) return 100;
  if (x < 0) return 0;
  return x;
}

export default function DutchieCm({ go, session }) {
  const [k, setK] = useState(null);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(null);
  const [note, setNote] = useState(null);

  const load = useCallback(async () => {
    const [flower, veg, batches, harvests, pkgs, canopy] = await Promise.all([
      supabase.from("metrc_plants").select("id", { count: "exact", head: true }).ilike("phase", "%flower%"),
      supabase.from("metrc_plants").select("id", { count: "exact", head: true }).ilike("phase", "%veg%"),
      supabase.from("metrc_plant_batches").select("id", { count: "exact", head: true }),
      supabase.from("metrc_harvests").select("id", { count: "exact", head: true }),
      supabase.from("metrc_packages").select("id", { count: "exact", head: true }),
      supabase.from("v_canopy_two_size").select("room,size,cap,plants_now,as_of,verdict"),
    ]);
    const errs = [flower, veg, batches, harvests, pkgs, canopy].map((x) => x.error && x.error.message).filter(Boolean);
    setErr(errs.length ? errs.join(" · ") : null);
    setK({
      flower: flower.count,
      veg: veg.count,
      batches: batches.count,
      harvests: harvests.count,
      pkgs: pkgs.count,
      canopy: Array.isArray(canopy.data) ? canopy.data : [],
    });
  }, []);
  useEffect(() => { load(); }, [load]);

  async function pull(fn) {
    setBusy(fn); setNote(null); setErr(null);
    try {
      const r = await fetch(`${FUNCTIONS_URL}/${fn}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session && session.access_token}` },
      });
      const j = await r.json();
      setNote(j.ok ? `${fn} pulled. ${j.total || ""}`.trim() : (j.error || "Pull failed"));
      await load();
    } catch (e) {
      setErr(String(e.message || e));
    }
    setBusy(null);
  }

  const tiles = [
    ["Flowering", k ? n(k.flower) : "…", "rpt-plants-flowering", "plants"],
    ["Vegetative", k ? n(k.veg) : "…", "rpt-plants-vegetative", "plants"],
    ["Batches", k ? n(k.batches) : "…", "rpt-plantings", "lots"],
    ["Harvests", k ? n(k.harvests) : "…", "rpt-harvests", "since day one"],
    ["Packages", k ? n(k.pkgs) : "…", "rpt-packages-inventory", "tags"],
  ];

  const asOf = Array.isArray(k && k.canopy) && k.canopy.length && k.canopy[0].as_of ? k.canopy[0].as_of : "live";
  const rooms = Array.isArray(k && k.canopy) ? k.canopy : [];

  return (
    <div className="osdesk osdesk-cm">
      <header className="osdesk-hud">
        <div>
          <p className="osdesk-kicker">Cultivation & Manufacturing</p>
          <h1 className="osdesk-title">Twisted C&M</h1>
          <p className="osdesk-lede">
            Live canopy. Metrc is custody of record. Apex is the invoice. We watch here — we write nothing to Metrc.
            Click a number. Forensic drill. Cycle 56 locked.
          </p>
        </div>
        <div className="osdesk-hud-meta">
          <span className="osdesk-live"><i className="osdesk-pulse" /> LIVE</span>
          <span className="osdesk-asof">as-of {asOf}</span>
        </div>
      </header>

      <div className="osdesk-chips">
        <span className="osdesk-chip">METRC custody</span>
        <span className="osdesk-chip">APEX invoice</span>
        <span className="osdesk-chip osdesk-chip-warn">WRITE NEVER</span>
        <span className="osdesk-chip">CYCLE 56</span>
        <span className="osdesk-chip">UNCERTIFIED until dual MATCH</span>
      </div>

      <div className="osdesk-actions">
        <button type="button" className="osdesk-save" disabled={!!busy} onClick={() => pull("metrc-sync")}>
          {busy === "metrc-sync" ? "Pulling Metrc…" : "Pull Metrc"}
        </button>
        <button type="button" className="osdesk-add" disabled={!!busy} onClick={() => pull("apex-sync")}>
          {busy === "apex-sync" ? "Pulling Apex…" : "Pull Apex"}
        </button>
        <button type="button" className="osdesk-add" onClick={() => go && go("report_center")}>Report Center</button>
        <button type="button" className="osdesk-add" onClick={() => go && go("report_vault")}>Report Vault</button>
        <button type="button" className="osdesk-add" onClick={() => go && go("ops_spine")}>Harvest spine</button>
      </div>
      {note ? <p className="osdesk-note">{note}</p> : null}
      {err ? <p className="osdesk-err">{err}</p> : null}

      <div className="osdesk-shell">
        <div className="osdesk-split">
          <aside className="osdesk-rail">
            <div className="osdesk-rail-h">
              <b>Twisted board</b>
              <span className="osdesk-online"><i /> Read only</span>
            </div>
            {RAIL.map(([key, label]) => (
              <button
                key={key}
                type="button"
                className={key === "ops_cm" ? "on" : ""}
                onClick={() => go && go(key)}
              >
                {label}
              </button>
            ))}
          </aside>
          <div className="osdesk-main">
            <div className="osdesk-kpis">
              {tiles.map(([label, val, drill, unit]) => (
                <button key={label} type="button" className="osdesk-kpi" onClick={() => go && go(drill)}>
                  <span className="osdesk-kicker">{label}</span>
                  <b>{val}</b>
                  <span className="osdesk-open">{unit} → drill</span>
                </button>
              ))}
            </div>

            <div className="osdesk-head" style={{ marginTop: 22 }}>
              <div>
                <h2>Two-size rooms</h2>
                <p>F1 / F3 cap 1,140. F2 / F4 cap 1,050. 1,150 is labor, not cap. Click a room.</p>
              </div>
            </div>

            <div className="osdesk-rooms">
              {rooms.length ? rooms.map((r) => {
                const pct = fillPct(r.plants_now, r.cap);
                return (
                  <button key={r.room} type="button" className="osdesk-room" onClick={() => go && go("grow_rooms")}>
                    <div className="osdesk-room-top">
                      <b>{`${r.room} — cultivation department`}</b>
                      <span className="osdesk-tag">{r.size || "—"}</span>
                    </div>
                    <div className="osdesk-room-nums">
                      <span><strong>{n(r.plants_now)}</strong> now</span>
                      <span>cap {n(r.cap)}</span>
                    </div>
                    <div className="osdesk-meter" aria-hidden="true">
                      <i className="osdesk-meter-fill" style={{ width: `${pct}%` }} />
                    </div>
                    <div className="osdesk-foot">
                      <span>{r.verdict || "—"}</span>
                      <span className="osdesk-open">{Math.round(pct)}%</span>
                    </div>
                  </button>
                );
              }) : (
                <p className="osdesk-lede">{k ? "No canopy rows yet." : "Reading live canopy…"}</p>
              )}
            </div>

            <h2 style={{ marginTop: 22, fontSize: 16 }}>Where work lives</h2>
            <div className="osdesk-map">
              {FEATURES.map(([name, why, where, st]) => (
                <div key={name} className="osdesk-map-row">
                  <b>{name}</b>
                  <span className="osdesk-screens">{why}</span>
                  <span className="osdesk-tag">{where}</span>
                  <span className={st === "LIVE" ? "osdesk-yes" : st === "NEVER" ? "osdesk-no" : "osdesk-tag"}>{st}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
