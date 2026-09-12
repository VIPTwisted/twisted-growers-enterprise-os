/* Command → Assistant → Staff. Grok Bots clone on the live OS.
   Live AI — same engine as Budz. Buddy on Grok stays boss. Metrc read-only. */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { askBudzFull } from "./budz.jsx";
import TgBotsPanel from "./lib/tg-bots-panel.jsx";
import { topGConnected } from "./lib/topg-connect.js";
import { allBots, addCustomBot, removeCustomBot, chainOf, BUDDY } from "./lib/os-bots.js";
import { skillsFor, dueThisMinute, dayKey, loadRuns, recordRun } from "./lib/os-bot-runtime.js";
import "./os-staff.css";

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
  const [routines, setRoutines] = useState(() => loadRoutines());
  const [newRoutine, setNewRoutine] = useState(false);
  const [newBot, setNewBot] = useState(false);
  const [bots, setBots] = useState(() => allBots());
  const [botForm, setBotForm] = useState({ name: "", role: "", job: "", reportsTo: "topg" });
  const [form, setForm] = useState({ botId: "topg", name: "", when: WHEN_PRESETS[0], intent: "Check X. Quiet if empty." });
  const [runs, setRuns] = useState(() => loadRuns());
  const ready = useRef(false);
  const end = useRef(null);
  const busyRef = useRef(false);
  const sendRef = useRef(null);
  const bot = bots.find((s) => s.id === sel) || bots[0];
  const line = chainOf(bot, bots);
  const needle = q.trim().toLowerCase();
  const listed = useMemo(
    () => bots.filter((s) => !needle || (s.name + s.role).toLowerCase().includes(needle)),
    [needle, bots],
  );
  const pins = bots.filter((s) => s.pin);
  const company = listed.filter((s) => !s.pin);

  useEffect(() => {
    const n = () => setTopg(topGConnected());
    window.addEventListener("tg-topg", n);
    const fresh = () => {
      setThread([]);
      try { localStorage.removeItem(threadKey(sel)); } catch { /* private */ }
    };
    window.addEventListener("tg-bots-new-chat", fresh);
    return () => {
      window.removeEventListener("tg-topg", n);
      window.removeEventListener("tg-bots-new-chat", fresh);
    };
  }, [sel]);
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
    return bots.find((s) => s.id === needle || s.name.toLowerCase() === needle) || bot;
  }

  async function send(raw, asDesk) {
    const value = (raw ?? text).trim();
    if (!value || busy) return;
    const desk = asDesk || targetBot(value);
    if (desk.id !== bot.id) setSel(desk.id);
    setText("");
    setThread((m) => [...m, { role: "user", text: value }]);
    setBusy(true);
    busyRef.current = true;
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
    busyRef.current = false;
  }

  sendRef.current = send;

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

  function addBot() {
    const r = addCustomBot(botForm);
    if (!r.ok) return;
    setBots(allBots());
    setBotForm({ name: "", role: "", job: "", reportsTo: "topg" });
    setNewBot(false);
    setSel(r.bot.id);
  }

  function dropBot(id) {
    removeCustomBot(id);
    setBots(allBots());
    if (sel === id) setSel("topg");
  }

  function runRoutine(r) {
    const owner = bots.find((s) => s.id === r.botId);
    if (!owner || !r.enabled) return;
    setSel(owner.id);
    send(r.intent, owner);
    setRuns(recordRun({ at: new Date().toISOString(), name: r.name, botId: r.botId, how: "run" }));
  }

  useEffect(() => {
    const tick = () => {
      if (busyRef.current) return;
      const now = new Date();
      const key = dayKey(now);
      let changed = false;
      let fired = false;
      const next = routines.map((r) => {
        if (fired || !r.enabled || r.lastRunDay === key) return r;
        if (!dueThisMinute(r.when, now)) return r;
        const owner = bots.find((s) => s.id === r.botId);
        if (owner) sendRef.current?.(r.intent, owner);
        recordRun({ at: now.toISOString(), name: r.name, botId: r.botId, how: "clock" });
        changed = true;
        fired = true;
        return { ...r, lastRunDay: key };
      });
      if (changed) {
        persistRoutines(next);
        setRuns(loadRuns());
      }
    };
    const id = setInterval(tick, 30000);
    tick();
    return () => clearInterval(id);
  }, [routines, bots]);

  return (
    <div className="osstaff">
      <aside className="osstaff-rail">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const hit = bots.find((s) => (s.name + s.role).toLowerCase().includes(needle));
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
        <p className="osstaff-k">Buddy · Grok Bots</p>
        <p className="osstaff-chain">{BUDDY.name} → Top G → desks. Add a specialist when the job has a long-lived owner.</p>
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
              {s.custom ? (
                <button type="button" className="osstaff-drop" aria-label={`Remove ${s.name}`} onClick={() => dropBot(s.id)}>×</button>
              ) : null}
            </li>
          ))}
        </ul>
        <div className="osstaff-add">
          <button type="button" onClick={() => setNewBot((v) => !v)}>{newBot ? "Cancel" : "Add bot"}</button>
          {newBot ? (
            <form className="osstaff-rform" onSubmit={(e) => { e.preventDefault(); addBot(); }}>
              <label>Name
                <input aria-label="Bot name" value={botForm.name} onChange={(e) => setBotForm({ ...botForm, name: e.target.value })} required />
              </label>
              <label>Title
                <input aria-label="Bot title" value={botForm.role} onChange={(e) => setBotForm({ ...botForm, role: e.target.value })} placeholder="Specialist" />
              </label>
              <label>Reports to
                <select aria-label="Reports to" value={botForm.reportsTo} onChange={(e) => setBotForm({ ...botForm, reportsTo: e.target.value })}>
                  {bots.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </label>
              <label>Job
                <input aria-label="Bot job" value={botForm.job} onChange={(e) => setBotForm({ ...botForm, job: e.target.value })} placeholder="What this bot owns" />
              </label>
              <button type="submit">Save bot</button>
            </form>
          ) : null}
        </div>
        <div className="osstaff-foot">
          <p className="osstaff-k">{topg ? "Bots live on this computer" : "Tap Grok, Claude, or ChatGPT above the chat"}</p>
        </div>
      </aside>

      <section className="osstaff-main">
        <header>
          <Face src={bot.face} name={bot.name} live={bot.live} motion={bot.motion} size="sm" />
          <div>
            <h1>{bot.name}</h1>
            <p>{bot.role} · {line.map((n) => n.name).join(" → ")}</p>
          </div>
          {bot.open && go ? (
            <button type="button" className="osstaff-go" onClick={() => go(bot.open)}>Open desk</button>
          ) : null}
        </header>
        <TgBotsPanel compact onReady={() => setTopg(true)} />
        {skillsFor(bot.id).length ? (
          <div className="osstaff-skills" role="group" aria-label="Skills">
            {skillsFor(bot.id).map((s) => (
              <button key={s.id} type="button" onClick={() => send(s.ask, bot)}>{s.name}</button>
            ))}
          </div>
        ) : null}
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
          {busy ? <div className="osstaff-bubble"><p>Asking Grok…</p></div> : null}
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
        <p className="osstaff-k">Fleet</p>
        <p className="osstaff-fleet">
          {topg ? "Grok on" : "Grok idle"} · {bots.length} bots · {routines.filter((r) => r.enabled).length} routines armed
          {runs[0] ? ` · last ${runs[0].name}` : ""}
        </p>
        <p className="osstaff-chain">Always-on while this OS tab is open. Not a rented cloud box. Buddy stays boss. Metrc read-only.</p>
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
          <p className="osstaff-k">Any bot. Intent, not a frozen script. Quiet if empty. Runs on the clock while this tab is open.</p>
          {newRoutine ? (
            <form className="osstaff-rform" onSubmit={(e) => { e.preventDefault(); addRoutine(); }}>
              <label>Bot
                <select aria-label="Routine bot" value={form.botId} onChange={(e) => setForm({ ...form, botId: e.target.value })}>
                  {bots.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
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
              const owner = bots.find((s) => s.id === r.botId);
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
                  <button type="button" onClick={() => runRoutine(r)}>Run</button>
                </li>
              );
            })}
          </ul>
          {runs.length ? (
            <div className="osstaff-runs">
              <p className="osstaff-k">Recent runs</p>
              <ul>
                {runs.slice(0, 6).map((x, i) => (
                  <li key={x.at + i}><span>{x.name} · {x.how === "clock" ? "clock" : "run"}</span></li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </aside>
    </div>
  );
}
