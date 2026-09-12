/* Grok Bots clone roster. Buddy (Grok Bots) is boss. Top G is chief of staff.
   Core seats are locked. Custom bots the owner adds live in this browser. */
export const BUDDY = {
  id: "buddy",
  name: "Buddy",
  role: "Ultimate boss",
  locked: true,
  external: true,
  job: "Buddy on Grok Bots is the ultimate boss. Not a chat seat in this OS.",
};

export const CORE_BOTS = [
  { id: "topg", name: "Top G", role: "Chief of Staff", pin: true, face: "/bots/topg.gif", motion: "ring",
    open: "tower", reportsTo: "buddy",
    prompts: ["What is on fire this week?", "Research the board", "Open Command Center"],
    job: "You talk to me for ordinary work. Buddy on Grok is the ultimate boss — I work with him." },
  { id: "hq", name: "HQ", role: "Leadership room", pin: true, face: "/bots/command.jpg",
    open: "dept_dash_command", reportsTo: "topg",
    prompts: ["Who is seated in HQ?", "Open Command Center"],
    job: "Leadership only. Top G, Command, CFO, Engineer. Not a company C-suite." },
  { id: "engineer", name: "Engineer", role: "Engineering shop", pin: true, face: "/bots/engineer.gif",
    open: "app_secrets", reportsTo: "topg",
    prompts: ["What is wired?", "Open secrets"],
    job: "Shared shop. Integrations, secrets. Nothing irreversible without owner yes." },
  { id: "cfo", name: "CFO", role: "Finance shop", pin: true, face: "/bots/cfo.jpg",
    open: "dept_dash_sales", reportsTo: "topg",
    prompts: ["Open the Apex book", "VALUE DIFFERS"],
    job: "Money. Apex invoice is source of record. Do not blend a Metrc pound into an invoice." },
  { id: "command", name: "Command", role: "COO", face: "/bots/command.jpg",
    open: "dept_dash_command", reportsTo: "topg",
    prompts: ["Need-action-now", "Quiet if clean?"],
    job: "Calendar, exceptions, operations. Auditor of desks under you." },
  { id: "admin", name: "Admin", role: "Users & permissions", face: "/bots/admin.jpg", live: true, motion: "admin",
    open: "permissions", reportsTo: "topg",
    prompts: ["Who can see Metrc queues?", "Open permissions"],
    job: "People, roles, who can open which page." },
  { id: "guard", name: "Guard", role: "Hard gate", face: "/bots/guard.jpg", live: true, motion: "ring",
    open: "xq_metrc_exceptions", reportsTo: "topg",
    prompts: ["What is blocked on the tray?"],
    job: "External email, bid, contract, publish stay draft until the owner says yes." },
  { id: "apex", name: "Apex", role: "Orders, ship, receive", face: "/bots/apex.jpg", live: true, motion: "box",
    open: "orders", reportsTo: "command",
    prompts: ["Open the orders book", "What is in receiving?"],
    job: "Inventory, orders, shipping, receiving. Invoice money lives in Apex." },
  { id: "cultivation", name: "Cultivation", role: "Grow & harvest", face: "/bots/cultivation.jpg", live: true, motion: "guy",
    open: "ops_cm", reportsTo: "command",
    prompts: ["Harvest schedule this week", "Open C and M overlay"],
    job: "Cultivation including harvest schedules. Room-turn rule is not changed from chat." },
  { id: "metrc", name: "Metrc", role: "Custody & tags", face: "/bots/metrc.jpg",
    open: "dept_dash_metrc", reportsTo: "command",
    prompts: ["Open exception queues"],
    job: "Custody and tags. Read only. Write instructions for the person to do in Metrc." },
  { id: "quality", name: "Quality", role: "COA & labs",
    open: "dept_dash_quality", reportsTo: "command",
    prompts: ["Failed with no disposition", "COA gaps"],
    job: "COA, labs, test status. Attach when available." },
  { id: "manufacturing", name: "Manufacturing", role: "Finished line", face: "/bots/manufacturing.jpg", live: true, motion: "ring",
    open: "dept_dash_mfg", reportsTo: "command",
    prompts: ["Units this shift", "Pre-roll vs vape vs concentrate"],
    job: "Finished goods line. Room stage is a ruling, not a Metrc write." },
  { id: "inventory", name: "Inventory", role: "On-hand", face: "/bots/inventory.jpg", live: true, motion: "box",
    open: "dept_dash_inventory", reportsTo: "command",
    prompts: ["Pre-rolls on hand", "3rd party vs ours"],
    job: "Pre-rolls, vapes, concentrates, bulk, packaged flower, third party." },
  { id: "reports", name: "Reports", role: "As-of freeze", face: "/bots/reports.jpg", live: true, motion: "box",
    open: "report_center", reportsTo: "cfo",
    prompts: ["Open plant waste as-of", "Run every cloned report"],
    job: "Snapshot pages declare as-of. Period bus is one page at a time. Waste only via v_waste_qty_truth." },
  { id: "settings", name: "Settings", role: "Integrations desk", face: "/bots/settings.jpg", live: true, motion: "ring",
    open: "settings", reportsTo: "engineer",
    prompts: ["What keys are live?", "Date defaults"],
    job: "Keys, connections, who the assistant is allowed to answer." },
  { id: "workspace", name: "Workspace", role: "Clipboard", face: "/bots/workspace.jpg", live: true, motion: "box",
    open: "tg_workspace", reportsTo: "topg",
    prompts: ["What is on the clipboard?", "Open my tasks"],
    job: "TG clipboard. Custody stays in Metrc." },
  { id: "hr", name: "HR", role: "Roster & schedules", face: "/bots/hr.jpg",
    open: "dept_dash_hr", reportsTo: "command",
    prompts: ["Who is on the clock?", "Production schedule this week"],
    job: "Scheduling and zones. Production schedules. Harvest schedule is Cultivation." },
];

const CUSTOM_KEY = "tg-os-custom-bots";

function slug(name) {
  const s = String(name || "bot").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 24);
  return s || "bot";
}

export function loadCustomBots() {
  try {
    const parsed = JSON.parse(localStorage.getItem(CUSTOM_KEY) || "[]");
    return Array.isArray(parsed) ? parsed.filter((b) => b && b.id && b.name) : [];
  } catch { return []; }
}

export function saveCustomBots(list) {
  try { localStorage.setItem(CUSTOM_KEY, JSON.stringify(list)); } catch { /* private */ }
}

export function allBots() {
  const custom = loadCustomBots();
  const taken = new Set(CORE_BOTS.map((b) => b.id));
  return [...CORE_BOTS, ...custom.filter((b) => !taken.has(b.id))];
}

export function addCustomBot({ name, role, job, reportsTo }) {
  const n = String(name || "").trim();
  if (!n) return { ok: false, error: "Name the bot." };
  const roster = allBots();
  let id = slug(n);
  if (roster.some((b) => b.id === id) || id === "buddy") id = id + "_" + Date.now().toString(36).slice(-4);
  const boss = roster.some((b) => b.id === reportsTo) ? reportsTo : "topg";
  const bot = {
    id,
    name: n.slice(0, 40),
    role: String(role || "Specialist").trim().slice(0, 60),
    job: String(job || "Help with this desk. Metrc is read-only. Buddy is boss.").trim().slice(0, 400),
    reportsTo: boss,
    custom: true,
    prompts: ["What should I handle first?"],
  };
  saveCustomBots([...loadCustomBots(), bot]);
  return { ok: true, bot };
}

export function removeCustomBot(id) {
  saveCustomBots(loadCustomBots().filter((b) => b.id !== id));
}

export function chainOf(bot, roster = allBots()) {
  const byId = new Map([[BUDDY.id, BUDDY], ...roster.map((b) => [b.id, b])]);
  const out = [];
  let cur = bot;
  const seen = new Set();
  while (cur && !seen.has(cur.id)) {
    out.push(cur);
    seen.add(cur.id);
    cur = byId.get(cur.reportsTo);
  }
  if (!out.some((b) => b.id === "buddy")) out.push(BUDDY);
  return out.reverse();
}
