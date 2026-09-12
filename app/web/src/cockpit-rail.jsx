/* Facility Map is first. Command Center is the OS — open it from the map's Home.
   Top bar Finance/Tax/HR frozen. Children are daily tools, not All Data.
   Every child view_key already exists — nothing invented, nothing omitted.
   Icons are the same lucide strokes as the facility map; colour is currentColor
   so the OS neon green still paints the selected row. */
import React, { useEffect, useState } from "react";
import {
  Archive,
  Ban,
  Banknote,
  Bell,
  BookOpen,
  Bot,
  Briefcase,
  Building2,
  Calculator,
  Calendar,
  CalendarClock,
  CheckSquare,
  CircleDollarSign,
  CircleHelp,
  ClipboardList,
  Clock,
  Cog,
  Factory,
  FileText,
  FlaskConical,
  Flower2,
  Gauge,
  GitBranch,
  Handshake,
  History,
  KeyRound,
  Landmark,
  Layers,
  LayoutDashboard,
  Leaf,
  ListTodo,
  Lock,
  Map,
  Package,
  PenLine,
  Plug,
  RadioTower,
  Receipt,
  RefreshCw,
  Scale,
  Scissors,
  Settings,
  Shield,
  ShieldCheck,
  ShoppingCart,
  Sprout,
  Timer,
  Trash2,
  TrendingDown,
  TrendingUp,
  Truck,
  UserCog,
  Users,
  Warehouse,
  Wrench,
} from "lucide-react";

const ICO = {
  archive: Archive,
  ban: Ban,
  banknote: Banknote,
  bell: Bell,
  book: BookOpen,
  bot: Bot,
  briefcase: Briefcase,
  building: Building2,
  calculator: Calculator,
  calendar: Calendar,
  calendarClock: CalendarClock,
  check: CheckSquare,
  dollar: CircleDollarSign,
  help: CircleHelp,
  clipboard: ClipboardList,
  clock: Clock,
  cog: Cog,
  factory: Factory,
  file: FileText,
  flask: FlaskConical,
  flower: Flower2,
  gauge: Gauge,
  branch: GitBranch,
  handshake: Handshake,
  history: History,
  key: KeyRound,
  landmark: Landmark,
  layers: Layers,
  dash: LayoutDashboard,
  leaf: Leaf,
  list: ListTodo,
  lock: Lock,
  map: Map,
  package: Package,
  pen: PenLine,
  plug: Plug,
  tower: RadioTower,
  receipt: Receipt,
  refresh: RefreshCw,
  scale: Scale,
  scissors: Scissors,
  settings: Settings,
  shield: Shield,
  shieldCheck: ShieldCheck,
  cart: ShoppingCart,
  sprout: Sprout,
  timer: Timer,
  trash: Trash2,
  down: TrendingDown,
  up: TrendingUp,
  truck: Truck,
  userCog: UserCog,
  users: Users,
  warehouse: Warehouse,
  wrench: Wrench,
};

function RailIco({ name, size }) {
  const Cmp = ICO[name] || Building2;
  return <Cmp className="cockpit-ico" size={size || 16} strokeWidth={2} aria-hidden="true" />;
}

export const COCKPITS = [
  {
    view_key: "facility_twin",
    label: "Facility Map",
    short: "Map",
    ico: "map",
    children: [],
  },
  {
    view_key: "dept_dash_command",
    label: "Command Center",
    short: "Command",
    ico: "gauge",
    children: [
      { view_key: "inventory_alerts", label: "Alerts", ico: "bell" },
      { view_key: "open_issues", label: "Decisions", ico: "scale" },
      { view_key: "dashboard_tasks", label: "Tasks", ico: "check" },
      { view_key: "real_loss_v2", label: "Loss", ico: "down" },
      { view_key: "stock_summary", label: "Inventory", ico: "package" },
      { view_key: "tower", label: "Control Tower", ico: "tower" },
    ],
  },
  {
    view_key: "tower",
    label: "Control Tower",
    short: "Tower",
    ico: "tower",
    children: [
      { view_key: "inventory_alerts", label: "Alerts", ico: "bell" },
      { view_key: "dashboard_tasks", label: "Tasks", ico: "check" },
    ],
  },
  {
    view_key: "os_staff",
    label: "Top G",
    short: "Top G",
    ico: "bot",
    children: [
      { view_key: "os_staff", label: "Bots desk", ico: "bot" },
      { view_key: "brand_locker", label: "Brand locker", ico: "archive" },
    ],
  },
  {
    view_key: "ops_cm",
    label: "Twisted C&M",
    short: "C&M",
    ico: "layers",
    children: [
      { view_key: "ops_cm", label: "Overview", ico: "dash" },
      { view_key: "rpt-plants-flowering", label: "Flowering", ico: "flower" },
      { view_key: "rpt-plants-vegetative", label: "Vegetative", ico: "sprout" },
      { view_key: "rpt-harvests", label: "Harvests", ico: "scissors" },
      { view_key: "rpt-packages-inventory", label: "Packages", ico: "package" },
      { view_key: "grow_rooms", label: "Rooms", ico: "building" },
      { view_key: "rpt-plant-waste", label: "Waste", ico: "trash" },
      { view_key: "ops_spine", label: "Harvest spine", ico: "branch" },
    ],
  },
  {
    view_key: "dept_dash_cfo",
    label: "Finance",
    short: "Finance",
    ico: "dollar",
    children: [
      { view_key: "invoices", label: "Invoices", ico: "receipt" },
      { view_key: "customers", label: "Customers", ico: "users" },
      { view_key: "actual_cost_per_pound", label: "Cost per pound", ico: "scale" },
      { view_key: "cash", label: "Cash", ico: "banknote" },
    ],
  },
  {
    view_key: "dept_dash_cultivation",
    label: "Cultivation",
    short: "Cult",
    ico: "leaf",
    children: [
      { view_key: "dutchie_cult", label: "Twisted C&M", ico: "layers" },
      { view_key: "room_board", label: "Rooms & plants", ico: "leaf" },
      { view_key: "harvests", label: "Harvests", ico: "scissors" },
      { view_key: "harvest_schedule", label: "Schedule", ico: "calendar" },
      { view_key: "harvest_water_yield", label: "Yield", ico: "up" },
    ],
  },
  {
    view_key: "dept_dash_mfg",
    label: "Manufacturing",
    short: "Mfg",
    ico: "factory",
    children: [
      { view_key: "dutchie_mfg", label: "Twisted C&M", ico: "layers" },
      { view_key: "flow", label: "Production", ico: "cog" },
      { view_key: "turnaround_watch", label: "Turnaround", ico: "timer" },
      { view_key: "production_calculator", label: "Costing", ico: "calculator" },
    ],
  },
  {
    view_key: "dept_dash_inventory",
    label: "Inventory",
    short: "Inv",
    ico: "package",
    children: [
      { view_key: "inventory_locator", label: "Stock & location", ico: "warehouse" },
      { view_key: "custody_compliance", label: "Custody", ico: "lock" },
      { view_key: "inv_value", label: "Value", ico: "landmark" },
      { view_key: "purchasing", label: "Purchasing", ico: "cart" },
    ],
  },
  {
    view_key: "dept_dash_quality",
    label: "Quality",
    short: "Quality",
    ico: "flask",
    children: [
      { view_key: "testing", label: "Testing", ico: "flask" },
      { view_key: "licenses", label: "Compliance", ico: "shieldCheck" },
    ],
  },
  {
    view_key: "dept_dash_sales",
    label: "Sales & Cash",
    short: "Sales",
    ico: "handshake",
    children: [
      { view_key: "orders", label: "Orders", ico: "clipboard" },
      { view_key: "shipping", label: "Shipping", ico: "truck" },
      { view_key: "customer_manifests", label: "Manifests", ico: "file" },
    ],
  },
  {
    view_key: "dept_dash_metrc",
    label: "Metrc",
    short: "Metrc",
    ico: "shield",
    children: [
      { view_key: "report_vault", label: "Report Vault", ico: "archive" },
      { view_key: "metrc_mirror", label: "Live mirror", ico: "refresh" },
      { view_key: "rpt-plants-flowering", label: "Flowering", ico: "flower" },
      { view_key: "metrc_rpt_plants", label: "Plant census", ico: "leaf" },
      { view_key: "plant_history", label: "Planting history", ico: "history" },
      { view_key: "rpt-plant-waste", label: "Waste", ico: "trash" },
      { view_key: "rpt-plants-destroyed", label: "Destroyed", ico: "ban" },
    ],
  },
  {
    view_key: "dept_dash_hr",
    label: "Human Resources",
    short: "HR",
    ico: "users",
    children: [
      { view_key: "people", label: "Employees", ico: "users" },
      { view_key: "employee-work-schedules", label: "Schedule", ico: "calendarClock" },
      { view_key: "timesheets", label: "Timesheets", ico: "clock" },
      { view_key: "payroll", label: "Payroll", ico: "banknote" },
    ],
  },
  {
    view_key: "dept_dash_workspace",
    label: "Workspace",
    short: "Desk",
    ico: "briefcase",
    children: [
      { view_key: "tasks", label: "Assignments", ico: "list" },
      { view_key: "whiteboards", label: "Whiteboards", ico: "pen" },
    ],
  },
  {
    view_key: "dept_dash_preroll",
    label: "Pre-Rolls & Flower",
    short: "Pre-Roll",
    ico: "flower",
    children: [
      { view_key: "preroll_schedule", label: "Production", ico: "cog" },
      { view_key: "machines", label: "Equipment", ico: "wrench" },
    ],
  },
  {
    view_key: "dept_dash_settings",
    label: "Settings",
    short: "Settings",
    ico: "settings",
    children: [
      { view_key: "os_users", label: "Users", ico: "userCog" },
      { view_key: "permissions", label: "Permissions", ico: "key" },
      { view_key: "help", label: "Help", ico: "help" },
      { view_key: "business_rules", label: "Rules", ico: "book" },
      { view_key: "integrations", label: "Connections", ico: "plug" },
    ],
  },
];

export function cockpitViewForCategory(cat) {
  if (cat === "Facility Map") return "facility_twin";
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
            <span className="rcicon"><RailIco name={c.ico} size={19} /></span>
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
                <RailIco name={c.ico} size={16} />
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
                    <RailIco name={ch.ico} size={14} />
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
