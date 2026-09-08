/* Report Center — every cloned Metrc/Apex report. Run pulls live when an API exists. */
import React, { useCallback, useEffect, useState } from "react";
import { supabase, FUNCTIONS_URL } from "./lib/supabase.js";

const API = {
  "rpt-plants-flowering": "metrc-sync",
  "rpt-plants-vegetative": "metrc-sync",
  "rpt-plantings": "metrc-sync",
  "rpt-harvests": "metrc-sync",
  "rpt-packages-inventory": "metrc-sync",
  "rpt-adjustments": "metrc-sync",
  "rpt-plants-destroyed": "metrc-sync",
  "rpt-plant-waste": "metrc-sync",
};

export default function ReportCenter({ go, session }) {
  const [board, setBoard] = useState([]);
  const [nav, setNav] = useState([]);
  const [busy, setBusy] = useState(null);
  const [note, setNote] = useState(null);

  const load = useCallback(async () => {
    const [b, n] = await Promise.all([
      supabase.from("v_report_vault_board").select("*").order("priority"),
      supabase.from("nav_registry").select("view_key,label,table_ref,description,category")
        .eq("category", "Metrc").like("view_key", "rpt-%").eq("enabled", true).order("item_order"),
    ]);
    if (b.error) setNote(b.error.message);
    else setBoard(Array.isArray(b.data) ? b.data : []);
    if (n.error) setNote((x) => (x ? `${x} · ${n.error.message}` : n.error.message));
    else setNav(Array.isArray(n.data) ? n.data : []);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function run(viewKey) {
    const fn = API[viewKey] || null;
    if (!fn) {
      setNote("This Metrc grid has no API. Drop the export in Report Vault, then open the cloned report.");
      if (go) go("report_vault");
      return;
    }
    setBusy(viewKey); setNote(null);
    try {
      const r = await fetch(`${FUNCTIONS_URL}/${fn}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
      });
      const j = await r.json();
      setNote(j.ok ? `Pulled from ${fn === "metrc-sync" ? "Metrc" : "Apex"}. Opening the cloned report.` : (j.error || "Pull failed"));
      if (j.ok && go) go(viewKey);
    } catch (e) {
      setNote(String(e.message ?? e));
    }
    setBusy(null);
  }

  return (
    <div>
      <div className="pagehead">
        <div>
          <h1>Report Center — cloned Metrc & Apex reports</h1>
          <div className="sub">
            Every report you have been handing us in chat lives here as an OS report.
            Run pulls live from Metrc or Apex when they publish an API. Grid-only reports
            (moisture, transferred price, lab dump, point-in-time) load from the vault.
            Stored ≠ certified. CERTIFIED still needs dual MATCH.
          </div>
        </div>
      </div>
      {note ? <div className="schip" style={{ margin: "8px 0" }}>{note}</div> : null}

      <h2 style={{ fontSize: 16, marginTop: 18 }}>Cloned reports — tap Run, then open</h2>
      <div className="req" style={{ marginTop: 8 }}>
        {nav.map((r) => {
          const hasApi = !!API[r.view_key];
          return (
            <div key={r.view_key} className="r" style={{ display: "grid", gridTemplateColumns: "1fr 220px", gap: 10, padding: 12, border: "1px solid #242a26", borderRadius: 10, marginBottom: 8 }}>
              <div>
                <b>{r.label}</b>
                <p className="why" style={{ margin: "4px 0", color: "#9aa69f" }}>{r.description}</p>
                <p className="path" style={{ fontSize: 12, color: "#7d8a80" }}>{r.table_ref} · {hasApi ? "Run pulls Metrc API" : "No Metrc API — vault / last grid"}</p>
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center", justifyContent: "flex-end" }}>
                <button className="btn primary" disabled={!!busy} onClick={() => run(r.view_key)}>
                  {busy === r.view_key ? "Pulling…" : hasApi ? "Run from Metrc" : "Open vault"}
                </button>
                <button className="btn" onClick={() => go && go(r.view_key)}>Open</button>
              </div>
            </div>
          );
        })}
      </div>

      <h2 style={{ fontSize: 16, marginTop: 22 }}>Vault need list</h2>
      <p className="lede" style={{ color: "#9aa69f" }}>Grid reports Metrc will not serve over API. Drop the file once; it stays forever.</p>
      <div className="req">
        {board.map((r) => (
          <div key={r.need_key} className="r" style={{ padding: 12, border: "1px solid #242a26", borderRadius: 10, marginBottom: 6 }}>
            <b>{r.priority}. {r.title}</b>
            <p style={{ margin: "4px 0", color: "#c5d0c8" }}>{r.why}</p>
            <p style={{ fontSize: 12, color: "#7d8a80" }}>{r.how_to_export}</p>
            <span className={`pill ${String(r.vault_status || "").startsWith("IN VAULT") ? "on" : "no"}`}>{r.vault_status}</span>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 14 }}>
        <button className="btn primary" onClick={() => go && go("report_vault")}>Open Report Vault</button>
      </div>
    </div>
  );
}
