/* Which staff desk owns a live OS page.
   Owner, 11 Sep 2026: wire all AI for the entire OS. The Bots desk already
   speaks as Top G / Cultivation / Metrc / …  Every other page was mute unless
   you left it and opened Bots. The Ask bar and the pet now use this map so a
   question typed on Harvests is Cultivation, a question on invoices is CFO,
   and a question on a page we have not named yet is Top G — never a blank
   desk, never a guessed number.

   Keep this list next to os-staff.jsx STAFF. A desk that exists only here
   cannot open its live page; a view that maps nowhere still gets Top G. */
export const OS_DESKS = {
  topg: { id: "topg", name: "Top G", role: "Chief of Staff", open: "tower",
    job: "You talk to me for ordinary work. Buddy on Grok is the ultimate boss — I work with him." },
  hq: { id: "hq", name: "HQ", role: "Leadership room", open: "dept_dash_command",
    job: "Leadership only. Top G, Command, CFO, Engineer. Not a company C-suite." },
  engineer: { id: "engineer", name: "Engineer", role: "Engineering shop", open: "app_secrets",
    job: "Shared shop. Integrations, secrets. Nothing irreversible without owner yes." },
  cfo: { id: "cfo", name: "CFO", role: "Finance shop", open: "dept_dash_sales",
    job: "Money. Apex invoice is source of record. Do not blend a Metrc pound into an invoice." },
  command: { id: "command", name: "Command", role: "COO", open: "dept_dash_command",
    job: "Calendar, exceptions, operations. Auditor of desks under you." },
  admin: { id: "admin", name: "Admin", role: "Users & permissions", open: "permissions",
    job: "People, roles, who can open which page." },
  guard: { id: "guard", name: "Guard", role: "Hard gate", open: "xq_metrc_exceptions",
    job: "External email, bid, contract, publish stay draft until the owner says yes." },
  apex: { id: "apex", name: "Apex", role: "Orders, ship, receive", open: "orders",
    job: "Inventory, orders, shipping, receiving. Invoice money lives in Apex." },
  cultivation: { id: "cultivation", name: "Cultivation", role: "Grow & harvest", open: "ops_cm",
    job: "Cultivation including harvest schedules. Room-turn rule is not changed from chat. METRC IS READ ONLY." },
  metrc: { id: "metrc", name: "Metrc", role: "Custody & tags", open: "dept_dash_metrc",
    job: "Custody and tags. Read only. Write instructions for the person to do in Metrc." },
  quality: { id: "quality", name: "Quality", role: "COA & labs", open: "dept_dash_quality",
    job: "COA, labs, test status. Attach when available." },
  manufacturing: { id: "manufacturing", name: "Manufacturing", role: "Finished line", open: "dept_dash_mfg",
    job: "Finished goods line. Room stage is a ruling, not a Metrc write." },
  inventory: { id: "inventory", name: "Inventory", role: "On-hand", open: "dept_dash_inventory",
    job: "Pre-rolls, vapes, concentrates, bulk, packaged flower, third party." },
  reports: { id: "reports", name: "Reports", role: "As-of freeze", open: "report_center",
    job: "Snapshot pages declare as-of. Period bus is one page at a time. Waste only via v_waste_qty_truth." },
  settings: { id: "settings", name: "Settings", role: "Integrations desk", open: "settings",
    job: "Keys, connections, who the assistant is allowed to answer." },
  workspace: { id: "workspace", name: "Workspace", role: "Clipboard", open: "tg_workspace",
    job: "TG clipboard. Custody stays in Metrc." },
  brand: { id: "brand", name: "Brand", role: "Marketing locker", open: "brand_locker",
    job: "Company logos, ads, packaging, photos, video. Any file. Not Metrc." },
  hr: { id: "hr", name: "HR", role: "Roster & schedules", open: "dept_dash_hr",
    job: "Scheduling and zones. Production schedules. Harvest schedule is Cultivation." },
};

const RULES = [
  [/metrc|xq_metrc|scan_settings/, "metrc"],
  [/harvest|cultiv|ops_cm|dutchie_cult|genetics|room_turn|moisture|grading|plants|veg|flower_room/, "cultivation"],
  [/mfg|manufactur|dutchie_mfg|pre.?roll|infused|finished/, "manufacturing"],
  [/invoice|order|apex|sales|cash|cfo|finance|tax|ar_|ap_/, "cfo"],
  [/inventory|fg_|stock|package|locator/, "inventory"],
  [/quality|coa|lab/, "quality"],
  [/hr|people|roster|timesheet|pay_|employee|schedule|onboard|callout|timeoff|incident|availability/, "hr"],
  [/report/, "reports"],
  [/secret|integrat|app_secrets/, "engineer"],
  [/permission|os_users|menu_manager/, "admin"],
  [/workspace|tg_workspace|tasks|whiteboards|planner/, "workspace"],
  [/brand|marketing|logo|packaging/, "brand"],
  [/alert|decision|tower|ceo|facility|command|dept_dash_command/, "command"],
  [/guard|hard.?gate|xq_/, "guard"],
  [/assistant|budz|brain|os_staff/, "topg"],
];

export function deskForView(view) {
  const key = String(view || "");
  for (const [re, id] of RULES) {
    if (re.test(key)) return OS_DESKS[id];
  }
  return OS_DESKS.topg;
}

export const CHAT_VIEWS = new Set(["os_staff", "budz", "brain", "assistant_settings"]);
