/* 14-stop OS rail. Owner GO 8 Sep 2026: top bar Finance/Tax/HR frozen.
   Reports stays chrome. Thin pages live inside cockpits as deep links. */
import React from "react";

export const COCKPITS = [
  { view_key: "tower", label: "Control Tower" },
  { view_key: "os_staff", label: "Top G" },
  { view_key: "dept_dash_command", label: "Command" },
  { view_key: "dept_dash_cfo", label: "Finance" },
  { view_key: "dept_dash_cultivation", label: "Cultivation" },
  { view_key: "dept_dash_mfg", label: "Manufacturing" },
  { view_key: "dept_dash_inventory", label: "Inventory" },
  { view_key: "dept_dash_quality", label: "Quality" },
  { view_key: "dept_dash_sales", label: "Sales & Cash" },
  { view_key: "dept_dash_metrc", label: "Metrc" },
  { view_key: "dept_dash_hr", label: "Human Resources" },
  { view_key: "dept_dash_workspace", label: "Workspace" },
  { view_key: "dept_dash_preroll", label: "Pre-Rolls & Flower" },
  { view_key: "dept_dash_settings", label: "Settings" },
];

export function cockpitViewForCategory(cat) {
  if (cat === "Command Center") return "dept_dash_command";
  if (cat === "Cultivation") return "dept_dash_cultivation";
  if (cat === "Manufacturing") return "dept_dash_mfg";
  if (cat === "Inventory") return "dept_dash_inventory";
  if (cat === "Quality") return "dept_dash_quality";
  if (cat === "Finance") return "dept_dash_cfo";
  if (cat === "Sales & Cash") return "dept_dash_sales";
  if (cat === "Metrc") return "dept_dash_metrc";
  if (cat === "Human Resources") return "dept_dash_hr";
  if (cat === "Workspace") return "dept_dash_workspace";
  if (cat === "Infused Pre-Rolls & Flower") return "dept_dash_preroll";
  if (cat === "Settings") return "dept_dash_settings";
  if (cat === "Reports") return "report_center";
  return null;
}

export default function CockpitRail({ view, go, collapsed }) {
  return (
    <div className={collapsed ? "railcats" : "cockpit-list"}>
      {COCKPITS.map((c) => (
        <button
          key={c.view_key}
          type="button"
          className={`${collapsed ? "railcat" : "cockpit-item"}${view === c.view_key ? " on" : ""}`}
          title={c.label}
          onClick={() => go(c.view_key)}
        >
          <span className={collapsed ? "rclabel" : "cockpit-lbl"}>{c.label}</span>
        </button>
      ))}
    </div>
  );
}
