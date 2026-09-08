/* Grok jump strip — sits on Command / Cultivation / Manufacturing dashboards.
   Does not restyle locked Command Center tiles. Tokens only. */
import React from "react";
import "./os-desk.css";

export default function GrokJump({ go }) {
  return (
    <div className="osdesk-jump" role="navigation" aria-label="Grok pages">
      <span className="osdesk-jump-k">GROK</span>
      <button type="button" className="osdesk-jump-primary" onClick={() => go && go("ops_cm")}>
        Dutchie C&M — open now
      </button>
      <button type="button" onClick={() => go && go("ops_spine")}>Harvest spine</button>
      <button type="button" onClick={() => go && go("os_staff")}>Bots</button>
      <button type="button" onClick={() => go && go("os_users")}>Users</button>
      <button type="button" onClick={() => go && go("permissions")}>Permissions</button>
      <button type="button" onClick={() => go && go("help")}>Help</button>
      <button type="button" onClick={() => go && go("report_center")}>Report Center</button>
      <button type="button" onClick={() => go && go("report_vault")}>Report Vault</button>
    </div>
  );
}
