/* Dutchie C&M overlay — live Metrc/Apex READ. Metrc write NEVER.
   Owner 8 Sep 2026: this must be on Netlify, not only in a Grok preview. */
import React, { useCallback, useEffect, useState } from "react";
import { supabase, FUNCTIONS_URL } from "./lib/supabase.js";

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

function n(v) {
  if (v == null) return "—";
  const x = Number(v);
  return Number.isFinite(x) ? x.toLocaleString() : "—";
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
      supabase.from("v_canopy_two_size").select("room,size_class,plant_count,as_of"),
    ]);
    const errs = [flower, veg, batches, harvests, pkgs, canopy].map((x) => x.error?.message).filter(Boolean);
    setK({
      flower: flower.count, veg: veg.count, batches: batches.count,
      harvests: harvests.count, pkgs: pkgs.count,
      canopy: Array.isArray(canopy.data) ? canopy.data : [],
      err: errs.length ? errs.join(" · ") : null,
    });
  }, []);
  useEffect(() => { load(); }, [load]);

  async function pull(fn) {
    setBusy(fn); setNote(null); setErr(null);
    try {
      const r = await fetch(`${FUNCTIONS_URL}/${fn}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
      });
      const j = await r.json();
      setNote(j.ok ? `${fn} pulled. ${j.total ?? ""}`.trim() : (j.error || "Pull failed"));
      await load();
    } catch (e) {
      setErr(String(e.message ?? e));
    }
    setBusy(null);
  }

  return (
    <div className="pagehead-wrap">
      <div className="pagehead">
        <div>
          <h1>Cultivation & Manufacturing — Dutchie overlay</h1>
          <div className="sub">
            Better than Dutchie for TG because Metrc stays custody of record and Apex stays the invoice.
            Phase 1: see everything, write nothing to Metrc. Run pulls live from Metrc or Apex.
          </div>
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "8px 0 16px" }}>
        <button className="btn primary" disabled={!!busy} onClick={() => pull("metrc-sync")}>
          {busy === "metrc-sync" ? "Pulling Metrc…" : "Run — pull live from Metrc"}
        </button>
        <button className="btn" disabled={!!busy} onClick={() => pull("apex-sync")}>
          {busy === "apex-sync" ? "Pulling Apex…" : "Run — pull live from Apex"}
        </button>
        <button className="btn" onClick={() => go && go("report_center")}>Report Center</button>
        <button className="btn" onClick={() => go && go("report_vault")}>Report Vault</button>
      </div>
      {note ? <div className="schip good">{note}</div> : null}
      {err || k?.err ? <div className="schip bad">{err || k.err}</div> : null}

      <div className="todaygrid" style={{ marginTop: 12 }}>
        {[
          ["Flowering plants", k ? n(k.flower) : "…", "rpt-plants-flowering"],
          ["Vegetative plants", k ? n(k.veg) : "…", "rpt-plants-vegetative"],
          ["Plant batches", k ? n(k.batches) : "…", "rpt-plantings"],
          ["Harvests", k ? n(k.harvests) : "…", "rpt-harvests"],
          ["Packages", k ? n(k.pkgs) : "…", "rpt-packages-inventory"],
        ].map(([label, val, drill]) => (
          <button key={label} className="ttile" onClick={() => go && go(drill)}>
            <div className="th"><span className="tt">{label}</span><span className="tn">{val}</span></div>
            <div className="tu">Click to open the cloned report · Run pulls live</div>
          </button>
        ))}
      </div>

      <h2 style={{ marginTop: 22, fontSize: 16 }}>Two-size rooms (as-of)</h2>
      <div className="scroll" style={{ marginTop: 8 }}>
        <table>
          <thead><tr><th>Room</th><th>Size</th><th>Plants</th><th>As-of</th></tr></thead>
          <tbody>
            {Array.isArray(k?.canopy) && k.canopy.length ? k.canopy.map((r) => (
              <tr key={r.room}><td>{r.room}</td><td>{r.size_class}</td><td>{n(r.plant_count)}</td><td>{r.as_of || "—"}</td></tr>
            )) : <tr><td colSpan={4}>No canopy rows yet.</td></tr>}
          </tbody>
        </table>
      </div>

      <h2 style={{ marginTop: 22, fontSize: 16 }}>Dutchie map — what lives where</h2>
      <div className="req" style={{ marginTop: 8 }}>
        {FEATURES.map(([name, why, where, st]) => (
          <div key={name} className="r" style={{ display: "grid", gridTemplateColumns: "160px 1fr 90px 80px", gap: 10, padding: "10px 12px", border: "1px solid var(--line, #242a26)", borderRadius: 10, marginBottom: 6 }}>
            <b>{name}</b>
            <span>{why}</span>
            <span className="pill">{where}</span>
            <span className={`pill ${st === "LIVE" ? "on" : st === "NEVER" ? "no" : ""}`}>{st}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
