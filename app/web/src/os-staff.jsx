/* Command → Assistant → Staff. Grok Bots clone on the live OS.
   Live AI — same engine as Budz. Buddy on Grok stays boss. Metrc read-only. */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { askBudzFull } from "./budz.jsx";
import { connectTopG, pingTgBots, TG_BOTS_ZIP, topGConnected } from "./lib/topg-connect.js";
import "./os-staff.css";

const STAFF = [
  { id: "topg", name: "Top G", role: "Chief of Staff", pin: true, face: "/bots/topg.gif", motion: "ring",
    open: "tower", prompts: ["What is on fire this week?", "Research the board", "Open Command Center"],
    job: "You talk to me for ordinary work. Buddy on Grok is the ultimate boss — I work with him." },
  { id: "hq", name: "HQ", role: "Leadership room", pin: true, face: "/bots/command.jpg",
    open: "dept_dash_command", prompts: ["Who is seated in HQ?", "Open Command Center"],
    job: "Leadership only. Top G, Command, CFO, Engineer. Not a company C-suite." },
  { id: "engineer", name: "Engineer", role: "Engineering shop", pin: true, face: "/bots/engineer.gif",
    open: "app_secrets", prompts: ["What is wired?", "Open secrets"],
    job: "Shared shop. Integrations, secrets. Nothing irreversible without owner yes." },
  { id: "cfo", name: "CFO", role: "Finance shop", pin: true, face: "/bots/cfo.jpg",
    open: "dept_dash_sales", prompts: ["Open the Apex book", "VALUE DIFFERS"],
    job: "Money. Apex invoice is source of record. Do not blend a Metrc pound into an invoice." },
  { id: "command", name: "Command", role: "COO", face: "/bots/command.jpg",
    open: "dept_dash_command", prompts: ["Need-action-now", "Quiet if clean?"],
    job: "Calendar, exceptions, operations. Auditor of desks under you." },
  { id: "admin", name: "Admin", role: "Users & permissions", face: "/bots/admin.jpg", live: true, motion: "admin",
    open: "settings", prompts: ["Who can see Metrc queues?", "Open permissions"],
    job: "People, roles, who can open which page." },
  { id: "guard", name: "Guard", role: "Hard gate", face: "/bots/guard.jpg", live: true, motion: "ring",
    open: "xq_metrc_exceptions", prompts: ["What is blocked on the tray?"],
    job: "External email, bid, contract, publish stay draft until the owner says yes." },
  { id: "apex", name: "Apex", role: "Orders, ship, receive", face: "/bots/apex.jpg", live: true, motion: "box",
    open: "orders", prompts: ["Open the orders book", "What is in receiving?"],
    job: "Inventory, orders, shipping, receiving. Invoice money lives in Apex." },
  { id: "cultivation", name: "Cultivation", role: "Grow & harvest", face: "/bots/cultivation.jpg", live: true, motion: "guy",
    open: "dept_dash_cultivation", prompts: ["Harvest schedule this week", "Moisture queue"],
    job: "Cultivation including harvest schedules. Room-turn rule is not changed from chat." },
  { id: "metrc", name: "Metrc", role: "Custody & tags", face: "/bots/metrc.jpg",
    open: "dept_dash_metrc", prompts: ["Open exception queues"],
    job: "Custody and tags. Read only. Write instructions for the person to do in Metrc." },
  { id: "quality", name: "Quality", role: "COA & labs",
    open: "dept_dash_quality", prompts: ["Failed with no disposition", "COA gaps"],
    job: "COA, labs, test status. Attach when available." },
  { id: "manufacturing", name: "Manufacturing", role: "Finished line", face: "/bots/manufacturing.jpg", live: true, motion: "ring",
    open: "dept_dash_mfg", prompts: ["Units this shift", "Pre-roll vs vape vs concentrate"],
    job: "Finished goods line. Room stage is a ruling, not a Metrc write." },
  { id: "inventory", name: "Inventory", role: "On-hand", face: "/bots/inventory.jpg", live: true, motion: "box",
    open: "dept_dash_inventory", prompts: ["Pre-rolls on hand", "3rd party vs ours"],
    job: "Pre-rolls, vapes, concentrates, bulk, packaged flower, third party." },
  { id: "reports", name: "Reports", role: "As-of freeze", face: "/bots/reports.jpg", live: true, motion: "box",
    open: "dept_dash_command", prompts: ["Open plant waste as-of", "What is still this-month by mistake?"],
    job: "Snapshot pages declare as-of. Period bus is one page at a time. Waste only via v_waste_qty_truth." },
  { id: "settings", name: "Settings", role: "Integrations desk", face: "/bots/settings.jpg", live: true, motion: "ring",
    open: "settings", prompts: ["What keys are live?", "Date defaults"],
    job: "Keys, connections, who the assistant is allowed to answer." },
  { id: "workspace", name: "Workspace", role: "Clipboard", face: "/bots/workspace.jpg", live: true, motion: "box",
    open: "tg_workspace", prompts: ["What is on the clipboard?", "Open my tasks"],
    job: "TG clipboard. Custody stays in Metrc." },
  { id: "hr", name: "HR", role: "Roster & schedules", face: "/bots/hr.jpg",
    open: "dept_dash_hr", prompts: ["Who is on the clock?", "Production schedule this week"],
    job: "Scheduling and zones. Production schedules. Harvest schedule is Cultivation." },
];

const WHEN_PRESETS = [
  "Weekdays at 8:00 AM",
  "Every day at 9:00 AM",
  "Weekdays at 7:00 AM",
  "Weekdays at 7:30 AM",
  "Weekdays at 10:00 AM and 4:00 PM",
  "Every day at 6:00 PM",
  "After every dry",
];

const DEFAULT_ROUTINES = [
  { id: "r-brief", name: "CEO Daily Brief", botId: "topg", when: "Weekdays at 8:00 AM", intent: "Check X. Quiet if empty.", quiet: true, enabled: true },
  { id: "r-shift", name: "Shift start 09:00", botId: "hr", when: "Every day at 9:00 AM", intent: "Who missed 09:00. Quiet if empty.", quiet: true, enabled: true },
  { id: "r-prod", name: "Production schedule", botId: "hr", when: "Weekdays at 7:00 AM", intent: "Production schedule this week. Quiet if empty.", quiet: true, enabled: true },
  { id: "r-harvest", name: "Harvest schedule", botId: "cultivation", when: "Weekdays at 7:30 AM", intent: "Harvest schedule this week. Quiet if empty.", quiet: true, enabled: true },
  { id: "r-apex", name: "Apex receiving / shipping", botId: "apex", when: "Weekdays at 10:00 AM and 4:00 PM", intent: "Receiving and shipping. Quiet if empty.", quiet: true, enabled: true },
  { id: "r-metrc", name: "Metrc queue sweep", botId: "metrc", when: "Weekdays at 7:15 AM and 3:00 PM", intent: "Need-action-now queues. Quiet if empty.", quiet: true, enabled: true },
  { id: "r-eod", name: "End of Day Brief", botId: "topg", when: "Every day at 6:00 PM", intent: "EOD brief. Quiet if empty.", quiet: true, enabled: true },
];

function threadKey(id) { return "tg-os-staff-" + id; }
function loadThread(id) {
  try {
    const parsed = JSON.parse(localStorage.getItem(threadKey(id)) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}
function loadRoutines() {
  try {
    const parsed = JSON.parse(localStorage.getItem("tg-os-routines") || "null");
    return Array.isArray(parsed) && parsed.length ? parsed : DEFAULT_ROUTINES;
  } catch { return DEFAULT_ROUTINES; }
}

function Face({ src, name, live, motion, size }) {
  const kind = motion || "box";
  return (
    <span className={`osstaff-face ${size || ""} ${live ? `live-${kind}-ring` : ""}`}>
      {src ? (
        <img src={src} alt="" className={live && kind !== "face" ? `live-${kind}` : ""} />
      ) : (
        <span className="osstaff-initial">{name.slice(0, 1)}</span>
      )}
    </span>
  );
}

export default function OsStaff({ go }) {
  const [sel, setSel] = useState("topg");
  const [q, setQ] = useState("");
  const [text, setText] = useState("");
  const [thread, setThread] = useState(() => loadThread("topg"));
  const [busy, setBusy] = useState(false);
  const [topg, setTopg] = useState(() => topGConnected());
  const [extOn, setExtOn] = useState(false);
  const [routines, setRoutines] = useState(() => loadRoutines());
  const [newRoutine, setNewRoutine] = useState(false);
  const [form, setForm] = useState({ botId: "topg", name: "", when: WHEN_PRESETS[0], intent: "Check X. Quiet if empty." });
  const ready = useRef(false);
  const end = useRef(null);
  const bot = STAFF.find((s) => s.id === sel) || STAFF[0];
  const needle = q.trim().toLowerCase();
  const listed = useMemo(
    () => STAFF.filter((s) => !needle || (s.name + s.role).toLowerCase().includes(needle)),
    [needle],
  );
  const pins = STAFF.filter((s) => s.pin);
  const company = listed.filter((s) => !s.pin);

  useEffect(() => {
    pingTgBots().then((r) => setExtOn(!!r.installed));
    const n = () => setTopg(topGConnected());
    window.addEventListener("tg-topg", n);
    return () => window.removeEventListener("tg-topg", n);
  }, []);
  useEffect(() => {
    ready.current = false;
    setThread(loadThread(sel));
    setText("");
    ready.current = true;
  }, [sel]);
  useEffect(() => {
    if (!ready.current) return;
    try { localStorage.setItem(threadKey(sel), JSON.stringify(thread.slice(-80))); } catch { /* private */ }
  }, [sel, thread]);
  useEffect(() => {
    end.current?.scrollIntoView({ behavior: "smooth" });
  }, [thread, busy]);

  function persistRoutines(next) {
    setRoutines(next);
    try { localStorage.setItem("tg-os-routines", JSON.stringify(next)); } catch { /* private */ }
  }

  function targetBot(raw) {
    const m = String(raw).match(/^@([a-z0-9_]+)/i);
    if (!m) return bot;
    const needle = m[1].toLowerCase();
    return STAFF.find((s) => s.id === needle || s.name.toLowerCase() === needle) || bot;
  }

  async function send(raw) {
    const value = (raw ?? text).trim();
    if (!value || busy) return;
    const desk = targetBot(value);
    if (desk.id !== bot.id) setSel(desk.id);
    setText("");
    setThread((m) => [...m, { role: "user", text: value }]);
    setBusy(true);
    const history = thread
      .filter((m) => m.text && !m.thinking)
      .slice(-8)
      .map((m) => ({ who: m.role === "user" ? "me" : "bot", text: m.text }));
    try {
      const out = await askBudzFull(value, history, { surface: "staff-" + desk.id, desk });
      const body = out.composed
        || out.askErr
        || out.headline
        || `${desk.name} could not reach the live assistant. Confirm the TG Bots add-on or the desktop bridge.`;
      setThread((m) => [...m, {
        role: "agent",
        text: body,
        via: out.via || null,
        headline: out.composed && out.headline ? out.headline : null,
        open: desk.open,
      }]);
    } catch (e) {
      setThread((m) => [...m, {
        role: "agent",
        text: `${desk.name} could not answer: ${String(e?.message ?? e).slice(0, 180)}`,
        open: desk.open,
      }]);
    }
    setBusy(false);
  }

  function addRoutine() {
    const name = form.name.trim();
    if (!name) return;
    persistRoutines([{
      id: "r-" + Date.now(),
      name,
      botId: form.botId,
      when: form.when,
      intent: form.intent.trim() || "Check X. Quiet if empty.",
      quiet: true,
      enabled: true,
    }, ...routines]);
    setForm({ ...form, name: "" });
    setNewRoutine(false);
  }

  return (
    <div className="osstaff">
      <aside className="osstaff-rail">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const hit = STAFF.find((s) => (s.name + s.role).toLowerCase().includes(needle));
            if (hit) setSel(hit.id);
          }}
        >
          <label className="osstaff-search">
            <span className="sr-only">Search staff</span>
            <input aria-label="Search staff" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" />
          </label>
        </form>
        <div className="osstaff-pins">
          {pins.map((s) => (
            <button key={s.id} type="button" className={sel === s.id ? "on" : ""} onClick={() => setSel(s.id)}>
              <Face src={s.face} name={s.name} live={s.live} motion={s.motion} />
              <span>{s.name}</span>
              <em>{s.role}</em>
            </button>
          ))}
        </div>
        <p className="osstaff-k">Twisted Growers</p>
        <ul>
          {company.map((s) => (
            <li key={s.id}>
              <button type="button" className={sel === s.id ? "on" : ""} onClick={() => setSel(s.id)}>
                <Face src={s.face} name={s.name} live={s.live} motion={s.motion} size="sm" />
                <span>
                  <b>{s.name}</b>
                  <i>{s.role}</i>
                </span>
              </button>
            </li>
          ))}
        </ul>
        <div className="osstaff-foot">
          <button type="button" className="osstaff-go" onClick={async () => {
            const r = await connectTopG("grok");
            setTopg(true);
            setExtOn(!!r.installed);
          }}>{topg ? "Top G on" : "Connect Top G"}</button>
        </div>
      </aside>

      <section className="osstaff-main">
        <header>
          <Face src={bot.face} name={bot.name} live={bot.live} motion={bot.motion} size="sm" />
          <div>
            <h1>{bot.name}</h1>
            <p>{bot.role} · Twisted Growers</p>
          </div>
          {bot.open && go ? (
            <button type="button" className="osstaff-go" onClick={() => go(bot.open)}>Open desk</button>
          ) : null}
        </header>
        {!extOn && (
          <p className="osstaff-note">
            TG Bots add-on is not on this computer yet.{" "}
            <a href={TG_BOTS_ZIP} download="tg-ai-ext.zip">Download TG Bots</a>
            {" "}then Chrome → extensions → Developer mode → Load unpacked.
          </p>
        )}
        <div className="osstaff-thread">
          {thread.length === 0 ? (
            <div className="osstaff-empty">
              <Face src={bot.face} name={bot.name} live={bot.live} motion={bot.motion} size="lg" />
              <p className="osstaff-hello">Message {bot.name}</p>
              <p>{bot.job} Live AI. Reads OS records. Buddy on Grok stays the ultimate boss. Nothing here writes to Metrc or Apex.</p>
              <div className="osstaff-prompts">
                {(bot.prompts || []).map((p) => (
                  <button key={p} type="button" onClick={() => send(p)}>{p}</button>
                ))}
              </div>
            </div>
          ) : (
            thread.map((m, i) => (
              <div key={i} className={m.role === "user" ? "osstaff-bubble me" : "osstaff-bubble"}>
                {m.headline ? <p className="osstaff-k">{m.headline}</p> : null}
                {String(m.text || "").split("\n").map((line, li) => <p key={li}>{line}</p>)}
                {m.via ? <p className="osstaff-k">{m.via}</p> : null}
                {m.open && go ? (
                  <button type="button" onClick={() => go(m.open)}>Open in OS</button>
                ) : null}
              </div>
            ))
          )}
          {busy ? <div className="osstaff-bubble"><p>{bot.name} is reading live records…</p></div> : null}
          <div ref={end} />
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
        >
          <label className="sr-only" htmlFor="osstaff-ask">Message {bot.name}</label>
          <input
            id="osstaff-ask"
            value={text}
            onChange={(e) => setText(e.target.value)}
            aria-label={`Message ${bot.name}`}
            placeholder={`Message ${bot.name}`}
            disabled={busy}
          />
          <button type="submit" disabled={busy}>Send</button>
        </form>
      </section>

      <aside className="osstaff-side">
        <p className="osstaff-k">{bot.name}&rsquo;s screen</p>
        <div className="osstaff-screen">
          <div className="osstaff-dots" aria-hidden="true"><i /><i /><i /></div>
          <p>Live OS desk. Click Open desk to work the real page. Chat stays on this clone.</p>
          {bot.open && go ? (
            <button type="button" className="osstaff-go" onClick={() => go(bot.open)}>Open {bot.name} in OS</button>
          ) : null}
        </div>
        <div className="osstaff-routines">
          <div className="osstaff-rtitle">
            <p>Routines</p>
            <button type="button" onClick={() => setNewRoutine((v) => !v)} aria-label="Create routine">+</button>
          </div>
          <p className="osstaff-k">Any bot. Intent, not a frozen script. Quiet if empty.</p>
          {newRoutine ? (
            <form className="osstaff-rform" onSubmit={(e) => { e.preventDefault(); addRoutine(); }}>
              <label>Bot
                <select aria-label="Routine bot" value={form.botId} onChange={(e) => setForm({ ...form, botId: e.target.value })}>
                  {STAFF.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </label>
              <label>Name
                <input aria-label="Routine name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
              </label>
              <label>When
                <select aria-label="Routine when" value={form.when} onChange={(e) => setForm({ ...form, when: e.target.value })}>
                  {WHEN_PRESETS.map((w) => <option key={w}>{w}</option>)}
                </select>
              </label>
              <label>Intent
                <input aria-label="Routine intent" value={form.intent} onChange={(e) => setForm({ ...form, intent: e.target.value })} />
              </label>
              <button type="submit">Save routine</button>
            </form>
          ) : null}
          <ul>
            {routines.map((r) => {
              const owner = STAFF.find((s) => s.id === r.botId);
              return (
                <li key={r.id}>
                  <button type="button" className="osstaff-rbot" onClick={() => setSel(r.botId)}>
                    <Face src={owner?.face} name={owner?.name || r.botId} size="sm" />
                  </button>
                  <span>
                    <b>{r.name}</b>
                    <i>{r.when} · {owner?.name || r.botId}{r.enabled ? "" : " · off"}</i>
                  </span>
                  <button type="button" onClick={() => persistRoutines(routines.map((x) => x.id === r.id ? { ...x, enabled: !x.enabled } : x))}>
                    {r.enabled ? "On" : "Off"}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </aside>
    </div>
  );
}
