/* Grok jump strip — sits on Command / Cultivation / Manufacturing dashboards.
   Does not restyle locked Command Center tiles. Tokens only. */
import React from "react";
import "./os-desk.css";

const JUMP = [
  ["ops_cm", "Dutchie C&M"],
  ["ops_spine", "Harvest spine"],
  ["os_staff", "Bots"],
  ["os_users", "Users"],
  ["permissions", "Permissions"],
  ["help", "Help"],
  ["report_center", "Report Center"],
  ["report_vault", "Report Vault"],
];

export default function GrokJump({ go }) {
  return (
    <div className="osdesk-jump" role="navigation" aria-label="Grok pages">
      <span className="osdesk-jump-k">GROK</span>
      {JUMP.map(([key, label]) => (
        <button key={key} type="button" onClick={() => go && go(key)}>
          {label}
        </button>
      ))}
    </div>
  );
}
