/* 14-stop OS rail with locked children. Owner GO 8 Sep 2026:
   top bar Finance/Tax/HR frozen. Children are daily tools, not All Data.
   Every child view_key already exists — nothing invented, nothing omitted
   from the OS; the rest stay inside the cockpit as More tools. */
import React, { useEffect, useState } from "react";

export const COCKPITS = [
  {
    view_key: "tower",
    label: "Control Tower",
    short: "Tower",
    children: [
      { view_key: "inventory_alerts", label: "Alerts" },
      { view_key: "dashboard_tasks", label: "Tasks" },
    ],
  },
  {
    view_key: "os_staff",
    label: "Top G",
    short: "Top G",
    children: [
      { view_key: "os_staff", label: "Bots desk" },
    ],
  },
  {
    view_key: "ops_cm",
    label: "Twisted C&M",
    short: "C&M",
    children: [
      { view_key: "ops_cm", label: "Overview" },
      { view_key: "rpt-plants-flowering", label: "Flowering" },
      { view_key: "rpt-plants-vegetative", label: "Vegetative" },
      { view_key: "rpt-harvests", label: "Harvests" },
      { view_key: "rpt-packages-inventory", label: "Packages" },
      { view_key: "grow_rooms", label: "Rooms" },
      { view_key: "rpt-plant-waste", label: "Waste" },
      { view_key: "ops_spine", label: "Harvest spine" },
    ],
  },
  {
    view_key: "dept_dash_command",
    label: "Command",
    short: "Command",
    children: [
      { view_key: "open_issues", label: "Decisions waiting" },
      { view_key: "real_loss_v2", label: "Loss" },
      { view_key: "stock_summary", label: "Inventory position" },
      { view_key: "inventory_alerts", label: "Alerts" },
    ],
  },
  {
    view_key: "dept_dash_cfo",
    label: "Finance",
    short: "Finance",
    children: [
      { view_key: "invoices", label: "Invoices" },
      { view_key: "customers", label: "Customers" },
      { view_key: "actual_cost_per_pound", label: "Cost per pound" },
      { view_key: "cash", label: "Cash" },
    ],
  },
  {
    view_key: "dept_dash_cultivation",
    label: "Cultivation",
    short: "Cult",
    children: [
      { view_key: "dutchie_cult", label: "Twisted C&M" },
      { view_key: "room_board", label: "Rooms & plants" },
      { view_key: "harvests", label: "Harvests" },
      { view_key: "harvest_schedule", label: "Schedule" },
      { view_key: "harvest_water_yield", label: "Yield" },
    ],
  },
  {
    view_key: "dept_dash_mfg",
    label: "Manufacturing",
    short: "Mfg",
    children: [
      { view_key: "dutchie_mfg", label: "Twisted C&M" },
      { view_key: "flow", label: "Production" },
      { view_key: "turnaround_watch", label: "Turnaround" },
      { view_key: "production_calculator", label: "Costing" },
    ],
  },
  {
    view_key: "dept_dash_inventory",
    label: "Inventory",
    short: "Inv",
    children: [
      { view_key: "inventory_locator", label: "Stock & location" },
      { view_key: "custody_compliance", label: "Custody" },
      { view_key: "inv_value", label: "Value" },
      { view_key: "purchasing", label: "Purchasing" },
    ],
  },
  {
    view_key: "dept_dash_quality",
    label: "Quality",
    short: "Quality",
    children: [
      { view_key: "testing", label: "Testing" },
      { view_key: "licenses", label: "Compliance" },
    ],
  },
  {
    view_key: "dept_dash_sales",
    label: "Sales & Cash",
    short: "Sales",
    children: [
      { view_key: "orders", label: "Orders" },
      { view_key: "shipping", label: "Shipping" },
      { view_key: "customer_manifests", label: "Manifests" },
    ],
  },
  {
    view_key: "dept_dash_metrc",
    label: "Metrc",
    short: "Metrc",
    children: [
      { view_key: "report_vault", label: "Report Vault" },
      { view_key: "metrc_mirror", label: "Live mirror" },
      { view_key: "rpt-plants-flowering", label: "Flowering" },
      { view_key: "metrc_rpt_plants", label: "Plant census" },
      { view_key: "plant_history", label: "Planting history" },
      { view_key: "rpt-plant-waste", label: "Waste" },
      { view_key: "rpt-plants-destroyed", label: "Destroyed" },
    ],
  },
  {
    view_key: "dept_dash_hr",
    label: "Human Resources",
    short: "HR",
    children: [
      { view_key: "people", label: "Employees" },
      { view_key: "employee-work-schedules", label: "Schedule" },
      { view_key: "timesheets", label: "Timesheets" },
      { view_key: "payroll", label: "Payroll" },
    ],
  },
  {
    view_key: "dept_dash_workspace",
    label: "Workspace",
    short: "Desk",
    children: [
      { view_key: "tasks", label: "Assignments" },
      { view_key: "whiteboards", label: "Whiteboards" },
    ],
  },
  {
    view_key: "dept_dash_preroll",
    label: "Pre-Rolls & Flower",
    short: "Pre-Roll",
    children: [
      { view_key: "preroll_schedule", label: "Production" },
      { view_key: "machines", label: "Equipment" },
    ],
  },
  {
    view_key: "dept_dash_settings",
    label: "Settings",
    short: "Settings",
    children: [
      { view_key: "os_users", label: "Users" },
      { view_key: "permissions", label: "Permissions" },
      { view_key: "help", label: "Help" },
      { view_key: "business_rules", label: "Rules" },
      { view_key: "integrations", label: "Connections" },
    ],
  },
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

function ownsView(c, view) {
  if (view === c.view_key) return true;
  if (c.view_key === "ops_cm" && (view === "dutchie_cult" || view === "dutchie_mfg")) return true;
  const kids = c.children || [];
  for (let i = 0; i < kids.length; i += 1) {
    if (kids[i].view_key === view) return true;
  }
  return false;
}

export default function CockpitRail({ view, go, collapsed, category, expandAll }) {
  const [open, setOpen] = useState({});
  const fromCat = cockpitViewForCategory(category);

  useEffect(() => {
    const next = {};
    for (let i = 0; i < COCKPITS.length; i += 1) {
      const c = COCKPITS[i];
      if (ownsView(c, view) || c.view_key === fromCat) next[c.view_key] = true;
    }
    if (Object.keys(next).length) {
      setOpen((prev) => {
        const merged = { ...prev, ...next };
        return merged;
      });
    }
  }, [view, fromCat]);

  useEffect(() => {
    if (expandAll == null) return undefined;
    if (expandAll.open) {
      setOpen(Object.fromEntries(COCKPITS.map((c) => [c.view_key, true])));
    } else {
      setOpen({});
    }
    return undefined;
  }, [expandAll]);

  if (collapsed) {
    return (
      <div className="railcats">
        {COCKPITS.map((c) => (
          <button
            key={c.view_key}
            type="button"
            className={`railcat${ownsView(c, view) || c.view_key === fromCat ? " on" : ""}`}
            title={c.label}
            onClick={() => go(c.view_key)}
          >
            <span className="rclabel">{c.short || c.label}</span>
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className="cockpit-list">
      {COCKPITS.map((c) => {
        const kids = c.children || [];
        const isOn = ownsView(c, view) || c.view_key === fromCat;
        const isOpen = Boolean(open[c.view_key]);
        return (
          <div key={c.view_key} className={`cockpit-block${isOn ? " on" : ""}`}>
            <div className="cockpit-row">
              <button
                type="button"
                className={`cockpit-item${view === c.view_key ? " on" : ""}`}
                title={c.label}
                onClick={() => {
                  setOpen((p) => ({ ...p, [c.view_key]: true }));
                  go(c.view_key);
                }}
              >
                <span className="cockpit-lbl">{c.label}</span>
              </button>
              {kids.length > 0 && (
                <button
                  type="button"
                  className={`cockpit-caret${isOpen ? " open" : ""}`}
                  aria-expanded={isOpen}
                  aria-label={isOpen ? `Collapse ${c.label}` : `Expand ${c.label}`}
                  title={isOpen ? "Hide tools" : "Show daily tools"}
                  onClick={() => setOpen((p) => ({ ...p, [c.view_key]: !p[c.view_key] }))}
                >
                  {isOpen ? "−" : "+"}
                </button>
              )}
            </div>
            {isOpen && kids.length > 0 && (
              <div className="cockpit-kids">
                {kids.map((ch) => (
                  <button
                    key={c.view_key + ":" + ch.view_key + ":" + ch.label}
                    type="button"
                    className={`cockpit-child${view === ch.view_key ? " on" : ""}`}
                    title={ch.label}
                    onClick={() => go(ch.view_key)}
                  >
                    {ch.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
