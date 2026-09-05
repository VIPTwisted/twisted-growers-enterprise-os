/* Command → Assistant → Staff. Grok-style inbox inside the live OS.
   Phase 1: no Metrc/Apex write. Numbers come from live pages, never from this file. */
import React, { useMemo, useState } from "react";
import "./os-staff.css";

const STAFF = [
  { id: "topg", name: "Top G", role: "Chief of Staff", pin: true, open: "tower" },
  { id: "hq", name: "HQ", role: "Leadership room", pin: true, open: "dept_dash_command" },
  { id: "engineer", name: "Engineer", role: "Integrations", pin: true, open: "app_secrets" },
  { id: "cfo", name: "CFO", role: "Finance", pin: true, open: "dept_dash_sales" },
  { id: "command", name: "Command", role: "COO", open: "dept_dash_command" },
  { id: "admin", name: "Admin", role: "Users & permissions", open: "settings" },
  { id: "guard", name: "Guard", role: "Hard gate", open: "xq_metrc_exceptions" },
  { id: "apex", name: "Apex", role: "Orders, ship, receive", open: "orders" },
  { id: "cultivation", name: "Cultivation", role: "Grow & harvest", open: "dept_dash_cultivation" },
  { id: "metrc", name: "Metrc", role: "Custody & tags", open: "dept_dash_metrc" },
  { id: "quality", name: "Quality", role: "COA & labs", open: "dept_dash_quality" },
  { id: "manufacturing", name: "Manufacturing", role: "Finished line", open: "dept_dash_mfg" },
  { id: "inventory", name: "Inventory", role: "On-hand", open: "dept_dash_inventory" },
  { id: "reports", name: "Reports", role: "As-of freeze reports", open: "dept_dash_command" },
  { id: "settings", name: "Settings", role: "Integrations desk", open: "settings" },
  { id: "workspace", name: "Workspace", role: "Clipboard", open: "tg_workspace" },
  { id: "hr", name: "HR", role: "Roster & schedules", open: "dept_dash_hr" },
];

function reply(bot, text) {
  const q = text.toLowerCase();
  if (q.includes("help")) {
    return { text: `${bot.name}: Open Help for the pictured walkthroughs. Nothing here writes to Metrc or Apex.`, open: "os_help" };
  }
  if (q.includes("exception") || q.includes("queue") || q.includes("fire") || q.includes("moisture")) {
    return { text: `${bot.name}: Exception queues live on Metrc. I will open that page. Fix in Metrc — this OS does not write back.`, open: "xq_metrc_exceptions" };
  }
  if (q.includes("order") || q.includes("invoice") || q.includes("apex")) {
    return { text: `${bot.name}: Invoice money is Apex. I will open Finance → Orders. Do not blend a Metrc pound into an invoice.`, open: "orders" };
  }
  if (q.includes("harvest") || q.includes("cultiv") || q.includes("room")) {
    return { text: `${bot.name}: Cultivation owns grow and harvest. Room-turn rule is not changed from this chat.`, open: "dept_dash_cultivation" };
  }
  if (q.includes("stock") || q.includes("on-hand") || q.includes("on hand") || q.includes("inventory")) {
    return { text: `${bot.name}: Today on-hand is live active packages. Point-in-time is a different freeze. Opening Inventory.`, open: "dept_dash_inventory" };
  }
  if (q.includes("schedule") || q.includes("roster") || q.includes("clock")) {
    return { text: `${bot.name}: HR owns roster and production schedules. Harvest schedule is Cultivation.`, open: "dept_dash_hr" };
  }
  if (q.includes("workspace") || q.includes("task") || q.includes("clickup")) {
    return { text: `${bot.name}: Workspace is the TG clipboard. Custody stays in Metrc.`, open: "tg_workspace" };
  }
  if (bot.open) {
    return { text: `${bot.name}: I work inside this OS. Buddy on Grok is the ultimate boss — I never outrank him. Opening my desk.`, open: bot.open };
  }
  return { text: `${bot.name}: Ask me to open Help, Orders, Inventory, Cultivation, Metrc exceptions, HR, or Workspace. I will not write Metrc or Apex from chat.` };
}

export default function OsStaff({ go }) {
  const [sel, setSel] = useState("topg");
  const [q, setQ] = useState("");
  const [text, setText] = useState("");
  const [thread, setThread] = useState([]);
  const bot = STAFF.find((s) => s.id === sel) || STAFF[0];
  const needle = q.trim().toLowerCase();
  const listed = useMemo(
    () => STAFF.filter((s) => !needle || (s.name + s.role).toLowerCase().includes(needle)),
    [needle],
  );
  const pins = STAFF.filter((s) => s.pin);

  function send(raw) {
    const value = (raw ?? text).trim();
    if (!value) return;
    const botMsg = reply(bot, value);
    setThread((m) => [...m, { role: "user", text: value }, { role: "agent", ...botMsg }]);
    setText("");
  }

  return (
    <div className="osstaff">
      <aside className="osstaff-rail">
        <label className="osstaff-search">
          <span className="sr-only">Search staff</span>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" />
        </label>
        <div className="osstaff-pins">
          {pins.map((s) => (
            <button key={s.id} type="button" className={sel === s.id ? "on" : ""} onClick={() => { setSel(s.id); setThread([]); }}>
              <span className="osstaff-face" aria-hidden="true">{s.name.slice(0, 1)}</span>
              <span>{s.name}</span>
            </button>
          ))}
        </div>
        <p className="osstaff-k">Company</p>
        <ul>
          {listed.filter((s) => !s.pin).map((s) => (
            <li key={s.id}>
              <button type="button" className={sel === s.id ? "on" : ""} onClick={() => { setSel(s.id); setThread([]); }}>
                <span className="osstaff-face sm" aria-hidden="true">{s.name.slice(0, 1)}</span>
                <span>
                  <b>{s.name}</b>
                  <i>{s.role}</i>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </aside>
      <section className="osstaff-main">
        <header>
          <div>
            <p className="osstaff-k">Staff · Buddy on Grok is boss</p>
            <h1>{bot.name}</h1>
            <p>{bot.role}. Talk here, then open the live desk. Nothing here writes to Metrc or Apex.</p>
          </div>
          {bot.open && go ? (
            <button type="button" className="osstaff-go" onClick={() => go(bot.open)}>Open desk</button>
          ) : null}
        </header>
        <div className="osstaff-thread">
          {thread.length === 0 ? (
            <div className="osstaff-empty">
              <p>Message {bot.name}</p>
              <p>Top G is Chief of Staff in this OS. Buddy stays the ultimate boss on Grok.</p>
            </div>
          ) : (
            thread.map((m, i) => (
              <div key={i} className={m.role === "user" ? "osstaff-bubble me" : "osstaff-bubble"}>
                <p>{m.text}</p>
                {m.open && go ? (
                  <button type="button" onClick={() => go(m.open)}>Open in OS</button>
                ) : null}
              </div>
            ))
          )}
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
        >
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={`Message ${bot.name}`}
          />
          <button type="submit">Send</button>
        </form>
      </section>
    </div>
  );
}
