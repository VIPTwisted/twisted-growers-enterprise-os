/* Command → Assistant → Staff. Live AI — same engine as Budz (desktop Claude,
   then metered API). Each desk answers as itself. Buddy on Grok stays boss.
   METRC is read-only. No certified number is invented here. */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { askBudzFull } from "./budz.jsx";
import { connectTopG, pingTgBots, TG_BOTS_ZIP, topGConnected } from "./lib/topg-connect.js";
import "./os-staff.css";

const STAFF = [
  { id: "topg", name: "Top G", role: "Chief of Staff", pin: true, open: "tower",
    job: "Route work, audit managers, own the approval tray, wake/sleep desks, write briefs." },
  { id: "hq", name: "HQ", role: "Leadership room", pin: true, open: "dept_dash_command",
    job: "Leadership only. CoS, Command, CFO, Engineer. Not a company C-suite." },
  { id: "engineer", name: "Engineer", role: "Integrations", pin: true, open: "app_secrets",
    job: "Shared shop. Integrations, secrets, what is wired. Nothing irreversible without owner yes." },
  { id: "cfo", name: "CFO", role: "Finance", pin: true, open: "dept_dash_sales",
    job: "Money. Apex invoice is source of record. Do not blend a Metrc pound into an invoice." },
  { id: "command", name: "Command", role: "COO", open: "dept_dash_command",
    job: "Calendar, exceptions, operations. Auditor of desks under you." },
  { id: "admin", name: "Admin", role: "Users & permissions", open: "settings",
    job: "People, roles, who can open which page." },
  { id: "guard", name: "Guard", role: "Hard gate", open: "xq_metrc_exceptions",
    job: "Hard gate. External email, bid, contract, publish stay draft until the owner says yes." },
  { id: "apex", name: "Apex", role: "Orders, ship, receive", open: "orders",
    job: "Inventory, orders, shipping, receiving. Invoice money lives in Apex." },
  { id: "cultivation", name: "Cultivation", role: "Grow & harvest", open: "dept_dash_cultivation",
    job: "Cultivation including harvest schedules. Room-turn rule is not changed from chat." },
  { id: "metrc", name: "Metrc", role: "Custody & tags", open: "dept_dash_metrc",
    job: "Custody and tags. Read only. Write instructions for the person to do in Metrc." },
  { id: "quality", name: "Quality", role: "COA & labs", open: "dept_dash_quality",
    job: "COA, labs, test status. Attach when available." },
  { id: "manufacturing", name: "Manufacturing", role: "Finished line", open: "dept_dash_mfg",
    job: "Finished goods line. Room stage is a ruling, not a Metrc write." },
  { id: "inventory", name: "Inventory", role: "On-hand", open: "dept_dash_inventory",
    job: "Pre-rolls, vapes, concentrates, bulk, packaged flower, third party. Today on-hand is live active packages — not a PIT freeze." },
  { id: "reports", name: "Reports", role: "As-of freeze reports", open: "dept_dash_command",
    job: "Snapshot pages declare as-of. Period bus is one page at a time." },
  { id: "settings", name: "Settings", role: "Integrations desk", open: "settings",
    job: "Keys, connections, who the assistant is allowed to answer." },
  { id: "workspace", name: "Workspace", role: "Clipboard", open: "tg_workspace",
    job: "TG clipboard. Custody stays in Metrc." },
  { id: "hr", name: "HR", role: "Roster & schedules", open: "dept_dash_hr",
    job: "Scheduling and zones. Production schedules. Harvest schedule is Cultivation." },
];

function threadKey(id) {
  return "tg-os-staff-" + id;
}
function loadThread(id) {
  try {
    const raw = localStorage.getItem(threadKey(id));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export default function OsStaff({ go }) {
  const [sel, setSel] = useState("topg");
  const [q, setQ] = useState("");
  const [text, setText] = useState("");
  const [thread, setThread] = useState(() => loadThread("topg"));
  const [busy, setBusy] = useState(false);
  const [topg, setTopg] = useState(() => topGConnected());
  const [extOn, setExtOn] = useState(false);
  const ready = useRef(false);
  const bot = STAFF.find((s) => s.id === sel) || STAFF[0];
  const needle = q.trim().toLowerCase();
  const listed = useMemo(
    () => STAFF.filter((s) => !needle || (s.name + s.role).toLowerCase().includes(needle)),
    [needle],
  );
  const pins = STAFF.filter((s) => s.pin);

  useEffect(() => {
    pingTgBots().then((r) => setExtOn(!!r.installed));
    const n = () => setTopg(topGConnected());
    window.addEventListener("tg-topg", n);
    return () => window.removeEventListener("tg-topg", n);
  }, []);
  useEffect(() => {
    ready.current = false;
    setThread(loadThread(sel));
    ready.current = true;
  }, [sel]);
  useEffect(() => {
    if (!ready.current) return;
    try { localStorage.setItem(threadKey(sel), JSON.stringify(thread.slice(-80))); } catch { /* private mode */ }
  }, [sel, thread]);

  async function send(raw) {
    const value = (raw ?? text).trim();
    if (!value || busy) return;
    setText("");
    setThread((m) => [...m, { role: "user", text: value }]);
    setBusy(true);
    const history = thread
      .filter((m) => m.text && !m.thinking)
      .slice(-8)
      .map((m) => ({ who: m.role === "user" ? "me" : "bot", text: m.text }));
    try {
      const out = await askBudzFull(value, history, {
        surface: "staff-" + bot.id,
        desk: bot,
      });
      const body = out.composed
        || out.askErr
        || out.headline
        || `${bot.name} could not reach the live assistant. Open Budz and confirm the desktop bridge is running, or set the company AI key.`;
      setThread((m) => [...m, {
        role: "agent",
        text: body,
        via: out.via || null,
        headline: out.composed && out.headline ? out.headline : null,
        open: bot.open,
      }]);
    } catch (e) {
      setThread((m) => [...m, {
        role: "agent",
        text: `${bot.name} could not answer: ${String(e?.message ?? e).slice(0, 180)}`,
        open: bot.open,
      }]);
    }
    setBusy(false);
  }

  return (
    <div className="osstaff">
      <aside className="osstaff-rail">
        <label className="osstaff-search">
          <span className="sr-only">Search staff</span>
          <input aria-label="Search staff" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" />
        </label>
        <div className="osstaff-pins">
          {pins.map((s) => (
            <button key={s.id} type="button" className={sel === s.id ? "on" : ""} onClick={() => setSel(s.id)}>
              <span className="osstaff-face" aria-hidden="true">{s.name.slice(0, 1)}</span>
              <span>{s.name}</span>
            </button>
          ))}
        </div>
        <p className="osstaff-k">Company</p>
        <ul>
          {listed.filter((s) => !s.pin).map((s) => (
            <li key={s.id}>
              <button type="button" className={sel === s.id ? "on" : ""} onClick={() => setSel(s.id)}>
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
            <p className="osstaff-k">Live staff · Buddy on Grok is boss</p>
            <h1>{bot.name}</h1>
            <p>{bot.job} Talk here. Same AI as Budz. Nothing here writes to Metrc or Apex.</p>
          </div>
          <div className="osstaff-actions">
            <button type="button" className="osstaff-go" onClick={async () => {
              const r = await connectTopG("grok");
              setTopg(true);
              setExtOn(!!r.installed);
            }}>{topg ? "Top G on" : "Connect Top G"}</button>
            {bot.open && go ? (
              <button type="button" className="osstaff-go" onClick={() => go(bot.open)}>Open desk</button>
            ) : null}
          </div>
        </header>
        {!extOn && (
          <p className="osstaff-note">
            TG Bots add-on is not on this computer yet.{" "}
            <a href={TG_BOTS_ZIP} download="tg-ai-ext.zip">Download TG Bots</a>
            {" "}then Chrome → extensions → Developer mode → Load unpacked. Toggle Grok, Claude, GPT, or Grok Bots. Token stays on this machine.
          </p>
        )}
        <div className="osstaff-thread">
          {thread.length === 0 ? (
            <div className="osstaff-empty">
              <p>Message {bot.name}</p>
              <p>Live AI. Reads OS records. Buddy on Grok stays the ultimate boss. Top G is Chief of Staff here.</p>
            </div>
          ) : (
            thread.map((m, i) => (
              <div key={i} className={m.role === "user" ? "osstaff-bubble me" : "osstaff-bubble"}>
                {m.headline ? <p className="osstaff-k">{m.headline}</p> : null}
                <p>{m.text}</p>
                {m.via ? <p className="osstaff-k">{m.via}</p> : null}
                {m.open && go ? (
                  <button type="button" onClick={() => go(m.open)}>Open in OS</button>
                ) : null}
              </div>
            ))
          )}
          {busy ? (
            <div className="osstaff-bubble">
              <p>{bot.name} is reading live records…</p>
            </div>
          ) : null}
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
            aria-label={`Message ${bot.name}`}
            placeholder={`Message ${bot.name}`}
            disabled={busy}
          />
          <button type="submit" disabled={busy}>Send</button>
        </form>
      </section>
    </div>
  );
}
