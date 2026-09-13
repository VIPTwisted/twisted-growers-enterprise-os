/* ---------------------------------------------------------------------------
   SYNC & CONNECTIONS — the one page for every sync and every secret in the OS.
   Owner, 13 Sep 2026: "all syncs, tokens, secrets kept on one page, fully mapped
   and wired for the entire OS, from the Sync button on the side menu" — and, an
   hour later, "this is not dynamic: how do I add, edit, modify, see status —
   each, all the details … add all AI and bot tokens, keys and secrets on this
   page so admin can add whatever they need to."

   One definition of a sync: public.sync_registry (job level). The page reads
   f_sync_status() and writes through f_sync_upsert / f_sync_set_enabled /
   f_sync_set_schedule (the last one really moves the cron job). Every row opens
   to its full detail: every field, the secrets it needs, its last 20 runs, and
   Run now with the real answer (f_sync_run → f_sync_run_result).

   One definition of a secret: f_secret_inventory() lists every secret in both
   stores (integration_secrets for the edge functions, app_secrets for the rest —
   AI, bots, e-mail, anything an admin adds), present / missing, last four, which
   syncs need it. tg_secret_put writes to whichever store the reader uses;
   tg_secret_remove takes one out (never the two the machine path runs on).
   Values never come back to the browser.

   Nothing on this page is a silent fallback: a read that fails says so.
--------------------------------------------------------------------------- */
import React, { useCallback, useEffect, useMemo, useState, lazy, Suspense } from "react";
import { supabase } from "./lib/supabase.js";
import { useRole, QrDecode } from "./App.jsx";

const SyncItems = lazy(() => import("./syncitems.jsx"));
/* One shared empty list for the not-yet-loaded state — stable identity, no silent fallbacks. */
const NO_ROWS = Object.freeze([]);

const ago = (ts) => {
  if (!ts) return "never";
  const s = Math.max(0, (Date.now() - new Date(ts).getTime()) / 1000);
  if (s < 90) return `${Math.round(s)}s ago`;
  if (s < 5400) return `${Math.round(s / 60)} min ago`;
  if (s < 172800) return `${(s / 3600).toFixed(1)} h ago`;
  return `${Math.round(s / 86400)} d ago`;
};
const when = (ts) => (ts ? new Date(ts).toLocaleString() : "—");
const HEALTH_TONE = { ok: "ok", failing: "err", "missing secret": "err", stale: "run", "never ran": "run", off: "muted", partial: "run", running: "run" };
const cronWords = (s) => {
  if (!s) return "—";
  if (s === "manual") return "manual";
  if (s.startsWith("on change")) return s;
  const m = s.match(/^(\S+) (\S+) \* \* \*$/);
  if (!m) return s;
  const [, mi, hr] = m;
  if (mi === "*" && hr === "*") return "every minute";
  if (mi.startsWith("*/") && hr === "*") return `every ${mi.slice(2)} min`;
  if (/^\d+$/.test(mi) && hr === "*") return `hourly at :${mi.padStart(2, "0")}`;
  if (/^\d+$/.test(mi) && /^\d+$/.test(hr)) return `daily ${hr.padStart(2, "0")}:${mi.padStart(2, "0")} UTC`;
  return s;
};
const KINDS = [
  ["edge_function", "Edge function — runner is the function path, e.g. metrc-sync or metrc-documents?mode=urls"],
  ["cron", "Cron job — runner is the SQL function the job calls; pick the job below"],
  ["rpc", "Database function — runner is its name, e.g. tg_refresh_reports"],
  ["bridge", "Bridge — runs on change by trigger; runner is the function a Run now calls"],
];
/* Names an admin is likely to want. Any UPPER_SNAKE_CASE name is accepted; these are shortcuts. */
const SECRET_SUGGESTIONS = [
  "ANTHROPIC_API_KEY", "OPENAI_API_KEY", "XAI_API_KEY", "GOOGLE_AI_API_KEY",
  "BOTS_BRIDGE_TOKEN", "ALERT_EMAIL_API_KEY", "TWILIO_AUTH_TOKEN",
  "QBO_CLIENT_ID", "QBO_CLIENT_SECRET", "MONDAY_TOKEN", "APEX_API_BASE", "APEX_COMPANY_ID", "METRC_USER_KEYS",
];
const PROTECTED = ["TG_ADMIN_KEY", "SUPABASE_ANON_KEY"];

/* Turn an edge function's JSON answer into one readable line, never a wall. */
function summarise(body) {
  try {
    const j = JSON.parse(body);
    if (j.error) return String(j.error);
    if (j.results) return Object.entries(j.results).filter(([k]) => !k.startsWith("_")).map(([k, v]) => `${k}: ${v}`).join(" · ");
    if (typeof j.total === "number") return `${j.total} rows`;
    return body.slice(0, 300);
  } catch { return (body || "").slice(0, 300); }
}

const EMPTY_ROW = { key: "", system: "OS", label: "", what: "", kind: "cron", runner: "", cron_jobname: "", schedule: "", secrets: [], lane: "", note: "", sort: 100, enabled: true, health: "new" };
const toForm = (r) => ({ key: r.key, system: r.system, label: r.label, what: r.what, kind: r.kind, runner: r.runner, cron_jobname: r.cron_jobname || "", schedule: r.schedule || "", secrets: (r.secrets || []).join(", "), lane: r.lane || "", note: r.note || "", sort: r.sort, enabled: r.enabled });
const pillFor = (status) => (status === "ok" ? "ok" : status === "error" ? "err" : "run");

/* ── one sync, opened: every field, editable; its runs; Run now ─────────── */
function SyncDetail({ row, cronJobs, canEdit, canRun, run, runState, onSaved, onClose, startEditing }) {
  const [form, setForm] = useState(() => toForm(row));
  const [editing, setEditing] = useState(!!startEditing);
  const [runs, setRuns] = useState(null);
  const [runsErr, setRunsErr] = useState(null);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const [sched, setSched] = useState(row.schedule || "");
  useEffect(() => { setForm(toForm(row)); setSched(row.schedule || ""); }, [row]);
  useEffect(() => {
    if (!row.key) { setRuns(NO_ROWS); return undefined; }
    let live = true;
    supabase.rpc("f_sync_runs", { p_key: row.key, p_limit: 20 }).then(({ data, error }) => {
      if (!live) return;
      if (error) setRunsErr(error.message);
      else if (Array.isArray(data)) setRuns(data);
      else setRunsErr("No run history came back.");
    });
    return () => { live = false; };
  }, [row.key, runState?.state]);

  const save = async () => {
    setBusy(true); setMsg(null);
    const payload = { ...form, secrets: form.secrets.split(",").map((s) => s.trim()).filter(Boolean), sort: Number(form.sort) || 100 };
    const { data, error } = await supabase.rpc("f_sync_upsert", { p: payload });
    setBusy(false);
    if (error || !data?.ok) { setMsg({ kind: "err", text: error?.message || "Not saved." }); return; }
    setMsg({ kind: "ok", text: "Saved." }); setEditing(false); onSaved(data.key);
  };
  const toggle = async () => {
    setBusy(true); setMsg(null);
    const { data, error } = await supabase.rpc("f_sync_set_enabled", { p_key: row.key, p_enabled: !row.enabled });
    setBusy(false);
    if (error) { setMsg({ kind: "err", text: error.message }); return; }
    setMsg({ kind: "ok", text: `${row.enabled ? "Switched off" : "Switched on"}${data?.cron_job ? ` — cron job ${data.cron_job} ${row.enabled ? "paused" : "resumed"}` : ""}.` });
    onSaved(row.key);
  };
  const saveSchedule = async () => {
    setBusy(true); setMsg(null);
    const { error } = await supabase.rpc("f_sync_set_schedule", { p_key: row.key, p_schedule: sched.trim() });
    setBusy(false);
    if (error) { setMsg({ kind: "err", text: error.message }); return; }
    setMsg({ kind: "ok", text: `Schedule is now "${sched.trim()}" — the cron job was changed.` }); onSaved(row.key);
  };

  return (
    <div className="panel synccard" style={{ maxWidth: "none", margin: "0 0 10px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <div className="ptitle" style={{ margin: 0 }}>{row.key ? row.label : "New sync"} {row.key && <span className="note" style={{ fontWeight: 400 }}>· {row.system} · <code>{row.key}</code></span>}</div>
        {row.key && <span className={`pill ${row.enabled ? (HEALTH_TONE[row.health] || "run") : "muted"}`}>{row.enabled ? row.health : "off"}</span>}
        <span style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
          {row.key && canRun && <button type="button" className="btn small" disabled={runState?.state === "running" || !row.enabled} onClick={() => run(row.key)}>{runState?.state === "running" ? "Running…" : "Run now"}</button>}
          {row.key && canEdit && <button type="button" className="btn ghost small" disabled={busy} onClick={toggle}>{row.enabled ? "Switch off" : "Switch on"}</button>}
          {row.key && canEdit && <button type="button" className="btn ghost small" onClick={() => setEditing((v) => !v)}>{editing ? "Cancel" : "Edit"}</button>}
          <button type="button" className="btn ghost small" onClick={onClose}>Close</button>
        </span>
      </div>
      {runState && <div className={`msg ${runState.state === "error" ? "err" : runState.state === "done" ? "ok" : ""}`} style={{ marginTop: 8 }}>{runState.text}</div>}
      {msg && <div className={`msg ${msg.kind}`} style={{ marginTop: 8 }}>{msg.text}</div>}

      {!editing ? (
        <div className="cols2" style={{ marginTop: 10 }}>
          <table><tbody>
            <tr><td className="note">What it does</td><td className="wrap">{row.what}</td></tr>
            <tr><td className="note">Kind</td><td>{row.kind}</td></tr>
            <tr><td className="note">Runner</td><td><code>{row.runner}</code></td></tr>
            <tr><td className="note">Cron job</td><td>{row.cron_jobname ? <code>{row.cron_jobname}</code> : "— (manual / on change)"}</td></tr>
            <tr><td className="note">Schedule</td><td>
              {row.cron_jobname && canRun
                ? <span style={{ display: "inline-flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}><input aria-label="Cron schedule" value={sched} onChange={(e) => setSched(e.target.value)} style={{ width: 150 }} /><button type="button" className="btn small ghost" disabled={busy || sched.trim() === (row.schedule || "")} onClick={saveSchedule}>Change</button><span className="note">{cronWords(row.schedule)}</span></span>
                : <>{row.schedule} <span className="note">{cronWords(row.schedule)}</span></>}
            </td></tr>
            <tr><td className="note">Secrets it needs</td><td className="wrap">{row.secrets?.length ? row.secrets.map((s) => <code key={s} style={{ marginRight: 6, color: row.secrets_missing?.includes(s) ? "var(--red)" : undefined }}>{s}</code>) : "none"}</td></tr>
            <tr><td className="note">Lane</td><td>{row.lane || "—"}</td></tr>
            <tr><td className="note">Note</td><td className="wrap">{row.note || "—"}</td></tr>
            <tr><td className="note">Enabled</td><td>{row.enabled ? "yes" : "no — switched off"}</td></tr>
          </tbody></table>
          <table><tbody>
            <tr><td className="note">Last run</td><td>{when(row.last_started)} <span className="note">({ago(row.last_started)})</span></td></tr>
            <tr><td className="note">Finished</td><td>{when(row.last_finished)}</td></tr>
            <tr><td className="note">Result</td><td>{row.last_status ? <span className={`pill ${pillFor(row.last_status)}`}>{row.last_status}</span> : "—"} {row.last_records != null && <span className="note">{Number(row.last_records).toLocaleString()} rows</span>}</td></tr>
            <tr><td className="note">Last error</td><td className="wrap" style={{ color: row.last_error ? "var(--red)" : undefined }}>{row.last_error || "none"}</td></tr>
            <tr><td className="note">Last 24 h</td><td>{row.runs_24h} runs{row.failed_24h > 0 && <span style={{ color: "var(--red)" }}> · {row.failed_24h} failed</span>}</td></tr>
          </tbody></table>
        </div>
      ) : (
        <div className="cols2" style={{ marginTop: 10 }}>
          <div>
            <label>Key <span className="note">(a–z, 0–9, underscore; new syncs only)</span></label>
            <input aria-label="Key" value={form.key} disabled={!!row.key} onChange={(e) => setForm({ ...form, key: e.target.value })} />
            <label>Name</label><input aria-label="Name" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} />
            <label>System</label><input aria-label="System" value={form.system} onChange={(e) => setForm({ ...form, system: e.target.value })} placeholder="Metrc · Apex · Google Sheets · OS …" />
            <label>What it does</label><textarea aria-label="What it does" value={form.what} onChange={(e) => setForm({ ...form, what: e.target.value })} rows={3} style={{ width: "100%" }} />
            <label>Lane</label><input aria-label="Lane" value={form.lane} onChange={(e) => setForm({ ...form, lane: e.target.value })} placeholder="Claude · GPT · Grok · Watchdog" />
            <label>Note</label><input aria-label="Note" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
          </div>
          <div>
            <label>Kind</label>
            <select aria-label="Kind" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>{KINDS.map(([k]) => <option key={k} value={k}>{k}</option>)}</select>
            <div className="note" style={{ marginBottom: 8 }}>{KINDS.find(([k]) => k === form.kind)?.[1]}</div>
            <label>Runner</label><input aria-label="Runner" value={form.runner} onChange={(e) => setForm({ ...form, runner: e.target.value })} />
            <label>Cron job <span className="note">(blank = manual)</span></label>
            <select aria-label="Cron job" value={form.cron_jobname} onChange={(e) => setForm({ ...form, cron_jobname: e.target.value })}>
              <option value="">— none —</option>
              {cronJobs.map((j) => <option key={j.jobname} value={j.jobname}>{j.jobname} [{j.schedule}]{j.active ? "" : " (paused)"}</option>)}
            </select>
            <label>Secrets it needs <span className="note">(comma-separated names)</span></label>
            <input aria-label="Secrets" value={form.secrets} onChange={(e) => setForm({ ...form, secrets: e.target.value })} placeholder="METRC_USER_KEY, TG_ADMIN_KEY" />
            <label>Sort</label><input aria-label="Sort" type="number" value={form.sort} onChange={(e) => setForm({ ...form, sort: e.target.value })} style={{ width: 100 }} />
            <div style={{ marginTop: 12 }}><button type="button" className="btn" disabled={busy} onClick={save}>Save</button></div>
          </div>
        </div>
      )}

      {row.key && (
        <>
          <div className="mtitle" style={{ marginTop: 14 }}><span className="sq" /><h2>Last 20 runs</h2><span className="rule" /></div>
          {runsErr && <div className="msg err">{runsErr}</div>}
          {runs === null && !runsErr && <div className="note">Loading…</div>}
          {runs !== null && runs.length === 0 && <div className="note">No runs recorded for this sync yet.</div>}
          {runs !== null && runs.length > 0 && (
            <table className="syncgrid">
              <thead><tr><th>Started</th><th>Finished</th><th>Status</th><th>Rows</th><th>Source</th><th>Detail</th></tr></thead>
              <tbody>{runs.map((r, i) => (
                <tr key={i}><td title={r.started_at}>{when(r.started_at)}</td><td>{r.finished_at ? when(r.finished_at) : "—"}</td>
                  <td><span className={`pill ${pillFor(r.status)}`}>{r.status}</span></td>
                  <td>{r.records ?? "—"}</td><td className="note">{r.source}</td><td className="note wrap">{r.detail}</td></tr>
              ))}</tbody>
            </table>
          )}
        </>
      )}
    </div>
  );
}

export default function SyncCenter({ session }) {
  const { role } = useRole(session);
  const canRun = ["owner", "executive"].includes(role);
  const canEdit = ["owner", "executive", "admin"].includes(role);
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState(null);
  const [runs, setRuns] = useState({});
  const [secrets, setSecrets] = useState(null);
  const [secretDraft, setSecretDraft] = useState({});
  const [secretMsg, setSecretMsg] = useState(null);
  const [newSecret, setNewSecret] = useState({ name: "", value: "" });
  const [heartbeat, setHeartbeat] = useState(null);
  const [recent, setRecent] = useState(NO_ROWS);
  const [cronJobs, setCronJobs] = useState(NO_ROWS);
  const [filter, setFilter] = useState("all");
  const [healthFilter, setHealthFilter] = useState("all");
  const [openKey, setOpenKey] = useState(null);
  const [adding, setAdding] = useState(false);
  const [q, setQ] = useState("");

  const load = useCallback(async () => {
    const [s, sec, hb, rr, cj] = await Promise.all([
      supabase.rpc("f_sync_status"),
      supabase.rpc("f_secret_inventory"),
      supabase.from("ai_bridge_heartbeat").select("machine, last_seen, version, operator").order("last_seen", { ascending: false }).limit(1),
      supabase.from("v_all_sync_runs").select("system, endpoint, license, status, records, started_at, error").order("started_at", { ascending: false }).limit(25),
      supabase.rpc("f_cron_jobs"),
    ]);
    if (s.error) setErr(s.error.message);
    else if (!Array.isArray(s.data)) setErr("f_sync_status returned no rows — the registry could not be read.");
    else { setRows(s.data); setErr(null); }
    if (sec.error) setSecretMsg({ kind: "err", text: `Secrets could not be listed: ${sec.error.message}` });
    else if (Array.isArray(sec.data)) setSecrets(sec.data);
    if (!hb.error && Array.isArray(hb.data)) setHeartbeat(hb.data[0] || null);
    if (rr.error) setErr((e) => e || `Recent runs could not be read: ${rr.error.message}`);
    else if (Array.isArray(rr.data)) setRecent(rr.data);
    if (!cj.error && Array.isArray(cj.data)) setCronJobs(cj.data);
  }, []);
  useEffect(() => { load(); const id = setInterval(load, 20000); return () => clearInterval(id); }, [load]);

  const run = async (key) => {
    setRuns((r) => ({ ...r, [key]: { state: "running", text: "Starting…" } }));
    const { data, error } = await supabase.rpc("f_sync_run", { p_key: key });
    if (error || !data?.ok) { setRuns((r) => ({ ...r, [key]: { state: "error", text: error?.message || data?.error || "Refused" } })); return; }
    if (data.method === "edge_function") {
      const started = Date.now();
      const poll = async () => {
        const { data: res } = await supabase.rpc("f_sync_run_result", { p_run_id: data.run_id });
        if (res?.http_status) {
          const okish = res.http_status < 300;
          setRuns((r) => ({ ...r, [key]: { state: okish ? "done" : "error", text: `HTTP ${res.http_status} · ${summarise(res.body) || "no body"}` } }));
          load(); return;
        }
        if (Date.now() - started > 180000) { setRuns((r) => ({ ...r, [key]: { state: "error", text: "No answer after 3 minutes. The run may still be going — see its runs." } })); load(); return; }
        setTimeout(poll, 3000);
      };
      setRuns((r) => ({ ...r, [key]: { state: "running", text: "Dispatched — waiting for the function to answer…" } }));
      setTimeout(poll, 3000);
    } else {
      setRuns((r) => ({ ...r, [key]: { state: "done", text: data.result ? `Done · ${String(data.result).slice(0, 200)}` : `Done (${data.method})` } }));
      load();
    }
  };

  const putSecret = async (name, value) => {
    const v = (value || "").trim(); const n = (name || "").trim().toUpperCase();
    if (!v || !n) return;
    setSecretMsg(null);
    const { error } = await supabase.rpc("tg_secret_put", { p_name: n, p_value: v });
    if (error) { setSecretMsg({ kind: "err", text: `${n}: ${error.message}` }); return; }
    setSecretDraft((d) => ({ ...d, [n]: "" })); setNewSecret({ name: "", value: "" });
    setSecretMsg({ kind: "ok", text: `${n} stored. Values are never shown back; the last four characters confirm which one is live.` });
    load();
  };
  const removeSecret = async (name) => {
    if (!window.confirm(`Remove ${name}? Any sync that needs it will show "missing secret" until a new value is pasted.`)) return;
    const { error } = await supabase.rpc("tg_secret_remove", { p_name: name });
    if (error) { setSecretMsg({ kind: "err", text: error.message }); return; }
    setSecretMsg({ kind: "ok", text: `${name} removed.` }); load();
  };

  const list = rows === null ? NO_ROWS : rows;
  const systems = useMemo(() => Array.from(new Set(list.map((r) => r.system))), [list]);
  const counts = useMemo(() => {
    const c = { total: list.length, ok: 0, failing: 0, stale: 0, missing: 0, off: 0 };
    for (const r of list) {
      if (!r.enabled) c.off++;
      else if (r.health === "failing") c.failing++;
      else if (r.health === "stale" || r.health === "never ran") c.stale++;
      else if (r.health === "missing secret") c.missing++;
      else if (r.health === "ok") c.ok++;
    }
    return c;
  }, [list]);
  const shown = useMemo(() => list.filter((r) => {
    if (filter !== "all" && r.system !== filter) return false;
    if (healthFilter === "ok" && !(r.enabled && r.health === "ok")) return false;
    if (healthFilter === "failing" && r.health !== "failing") return false;
    if (healthFilter === "stale" && !(r.health === "stale" || r.health === "never ran")) return false;
    if (healthFilter === "missing" && r.health !== "missing secret") return false;
    if (healthFilter === "off" && r.enabled) return false;
    if (q && !(`${r.label} ${r.what} ${r.runner} ${r.key} ${r.system}`.toLowerCase().includes(q.toLowerCase()))) return false;
    return true;
  }), [list, filter, healthFilter, q]);
  const secretList = secrets === null ? NO_ROWS : secrets;
  const missingSecrets = secretList.filter((s) => !s.present);
  const aiKeys = secretList.filter((s) => s.present && /^(ANTHROPIC|OPENAI|XAI|GOOGLE_AI|BOTS)/.test(s.name)).map((s) => s.name);
  const extAlive = !!heartbeat && (Date.now() - new Date(heartbeat.last_seen).getTime()) < 15 * 60 * 1000;
  const openRow = openKey ? list.find((r) => r.key === openKey) : null;
  const afterSave = (key) => { setAdding(false); if (key) setOpenKey(key); load(); };

  const stat = (id, n, label, hot) => (
    <button type="button" key={id} className={`syncstat${healthFilter === id ? " on" : ""}${hot ? " hot" : ""}`} onClick={() => setHealthFilter(healthFilter === id ? "all" : id)} title={`Show: ${label}`}>
      <b>{n}</b><span>{label}</span>
    </button>
  );

  return (
    <>
      <div className="pagehead">
        <div>
          <h1>Sync &amp; Connections</h1>
          <div className="sub">Every sync in the OS, every token and secret it needs, on one page. Click a number to filter, a row to open it, Edit to change it, Add to register a new one.</div>
        </div>
        {canEdit && <button type="button" className="btn" onClick={() => { setAdding(true); setOpenKey(null); }}>+ Add a sync</button>}
      </div>

      {/* dynamic summary: every number is a filter */}
      <div className="sbtotals syncstats" style={{ marginBottom: 14 }}>
        {stat("all", counts.total, "syncs registered", false)}
        {stat("ok", counts.ok, "healthy", false)}
        {stat("failing", counts.failing, "failing", counts.failing > 0)}
        {stat("stale", counts.stale, "stale / never ran", counts.stale > 0)}
        {stat("missing", counts.missing, "missing a secret", counts.missing > 0)}
        {stat("off", counts.off, "switched off", false)}
        <div className={missingSecrets.length ? "hot" : ""}><b>{missingSecrets.length}</b><span>secrets missing</span></div>
        <div><b>{extAlive ? "on" : "off"}</b><span>AI extension {heartbeat ? `v${heartbeat.version}` : ""}</span></div>
      </div>
      {err && <div className="msg err">{err}</div>}

      {adding && canEdit && (
        <SyncDetail row={EMPTY_ROW} cronJobs={cronJobs} canEdit canRun={false} run={() => {}} runState={null} startEditing
          onSaved={afterSave} onClose={() => setAdding(false)} />
      )}

      {/* 1. every sync */}
      <div className="mtitle"><span className="sq" /><h2>Syncs</h2><span className="rule" /></div>
      <div className="sbtools" style={{ marginBottom: 10 }}>
        <span className="sblab">System</span>
        <button type="button" className={`sbchip ${filter === "all" ? "on" : ""}`} onClick={() => setFilter("all")}>All<i>{list.length}</i></button>
        {systems.map((s) => (
          <button key={s} type="button" className={`sbchip ${filter === s ? "on" : ""}`} onClick={() => setFilter(s)}>{s}<i>{list.filter((r) => r.system === s).length}</i></button>
        ))}
        <input aria-label="Search syncs" value={q} onChange={(e) => setQ(e.target.value)} placeholder="search name, runner, key…" style={{ marginLeft: "auto", minWidth: 220 }} />
      </div>
      {openRow && !adding && (
        <SyncDetail row={openRow} cronJobs={cronJobs} canEdit={canEdit} canRun={canRun} run={run} runState={runs[openRow.key]} onSaved={afterSave} onClose={() => setOpenKey(null)} />
      )}
      <div className="panel" style={{ maxWidth: "none", padding: 0, overflowX: "auto" }}>
        <table className="syncgrid">
          <thead><tr><th>System</th><th>Sync</th><th>Schedule</th><th>Last run</th><th>Result</th><th>24 h</th><th>Health</th><th style={{ textAlign: "right" }}>Run</th></tr></thead>
          <tbody>
            {rows === null && !err && <tr><td colSpan={8} className="note">Loading…</td></tr>}
            {rows !== null && shown.length === 0 && <tr><td colSpan={8} className="note">Nothing matches this filter.</td></tr>}
            {shown.map((r) => {
              const st = runs[r.key];
              const isOpen = openKey === r.key;
              const toggleOpen = () => { setAdding(false); setOpenKey(isOpen ? null : r.key); };
              return (
                <tr key={r.key} className={`syncrow${isOpen ? " on" : ""}${r.enabled ? "" : " off"}`} onClick={toggleOpen} role="button" tabIndex={0}
                    onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); toggleOpen(); } }}>
                  <td>{r.system}</td>
                  <td className="wrap"><b>{r.label}</b><div className="note">{r.what}</div></td>
                  <td title={r.schedule}>{cronWords(r.schedule)}</td>
                  <td title={r.last_started || ""}>{ago(r.last_started)}</td>
                  <td>{r.last_status ? <span className={`pill ${pillFor(r.last_status)}`}>{r.last_status}</span> : <span className="note">—</span>}{r.last_records != null && <span className="note" style={{ marginLeft: 6 }}>{Number(r.last_records).toLocaleString()}</span>}</td>
                  <td>{r.runs_24h}{r.failed_24h > 0 && <span style={{ color: "var(--red)" }}> · {r.failed_24h} failed</span>}</td>
                  <td><span className={`pill ${r.enabled ? (HEALTH_TONE[r.health] || "run") : "muted"}`}>{r.enabled ? r.health : "off"}</span>{st && <div className="note wrap" style={{ maxWidth: 260, color: st.state === "error" ? "var(--red)" : undefined }}>{st.text.slice(0, 120)}</div>}</td>
                  <td style={{ textAlign: "right" }}>
                    {canRun ? <button type="button" className="btn ghost small" disabled={st?.state === "running" || !r.enabled} onClick={(e) => { e.stopPropagation(); run(r.key); }} title={`${r.kind}: ${r.runner}`}>{st?.state === "running" ? "…" : "Run"}</button> : <span className="note">—</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {role !== null && !canRun && <div className="msg" style={{ marginTop: 10 }}>Running a sync or changing a schedule is limited to owner and executive. Your role is <b>{role}</b>.</div>}

      {/* 2. tokens, keys & secrets — everything, and anything an admin adds */}
      <div className="mtitle" style={{ marginTop: 22 }}><span className="sq" /><h2>Tokens, keys &amp; secrets</h2><span className="rule" /></div>
      <div className="cols2">
        <div className="panel" style={{ maxWidth: "none" }}>
          <div className="sub" style={{ marginBottom: 10 }}>Every secret in both stores — Metrc, Apex, Sheets, e-mail, AI and bot keys, anything added below. Write-only: paste to set or rotate; the last four characters confirm which value is live. Values never come back to this screen.</div>
          {!canEdit && <div className="msg">Owner, executive or admin only. Your role is <b>{role ?? "…"}</b>.</div>}
          {canEdit && secrets === null && !secretMsg && <div className="note">Loading…</div>}
          {canEdit && secrets !== null && (
            <table className="syncgrid">
              <thead><tr><th>Secret</th><th>Status</th><th>Used by</th><th>Set / rotate</th><th /></tr></thead>
              <tbody>
                {secretList.map((s) => (
                  <tr key={s.name}>
                    <td><code>{s.name}</code><div className="note">{s.label || s.store}{s.help ? ` — ${s.help}` : ""}</div></td>
                    <td>{s.present ? <><span className="pill ok">set</span> <span className="note">{s.masked}</span>{s.updated_at && <div className="note">{ago(s.updated_at)}</div>}</> : <span className="pill err">missing</span>}</td>
                    <td className="note wrap">{s.used_by?.length ? s.used_by.join(", ") : "—"}</td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      <input type="password" autoComplete="off" aria-label={`New value for ${s.name}`} value={secretDraft[s.name] || ""} onChange={(e) => setSecretDraft((d) => ({ ...d, [s.name]: e.target.value }))} placeholder={s.present ? "paste to replace" : "paste value"} style={{ width: 200, marginRight: 6 }} />
                      <button type="button" className="btn small" disabled={!(secretDraft[s.name] || "").trim()} onClick={() => putSecret(s.name, secretDraft[s.name])}>Store</button>
                    </td>
                    <td style={{ textAlign: "right" }}>{s.present && !PROTECTED.includes(s.name) && <button type="button" className="btn ghost small" onClick={() => removeSecret(s.name)} title="Remove this secret">Remove</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {canEdit && (
            <div style={{ marginTop: 14, borderTop: "1px solid var(--line)", paddingTop: 12 }}>
              <div className="ptitle" style={{ fontSize: 13 }}>Add a secret</div>
              <div className="note" style={{ marginBottom: 8 }}>Any name in UPPER_SNAKE_CASE. AI and bot keys go here too — they are used only when a sync or the Bots desk names them; your AI runs tokenless until then.</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                <input aria-label="New secret name" list="secret-names" value={newSecret.name} onChange={(e) => setNewSecret({ ...newSecret, name: e.target.value.toUpperCase() })} placeholder="NAME_OF_THE_KEY" style={{ width: 240 }} />
                <datalist id="secret-names">{SECRET_SUGGESTIONS.filter((n) => !secretList.some((s) => s.name === n)).map((n) => <option key={n} value={n} />)}</datalist>
                <input type="password" autoComplete="off" aria-label="New secret value" value={newSecret.value} onChange={(e) => setNewSecret({ ...newSecret, value: e.target.value })} placeholder="paste the value" style={{ width: 260 }} />
                <button type="button" className="btn small" disabled={!newSecret.name.trim() || !newSecret.value.trim()} onClick={() => putSecret(newSecret.name, newSecret.value)}>Store</button>
              </div>
            </div>
          )}
          {secretMsg && <div className={`msg ${secretMsg.kind}`} style={{ marginTop: 10 }}>{secretMsg.text}</div>}
        </div>
        <div>
          {canEdit && <QrDecode onDecoded={(v) => setSecretDraft((d) => ({ ...d, METRC_VENDOR_KEYS: v }))} />}
          <div className="panel" style={{ maxWidth: "none" }}>
            <div className="ptitle">AI &amp; bots</div>
            <div className="sub">AI runs on the owner&rsquo;s subscription through the TG bots browser extension — tokenless. Keys stored on the left are used only when a sync or the Bots desk names them.</div>
            <table style={{ marginTop: 8 }}>
              <tbody>
                <tr><td className="note">Extension</td><td>{heartbeat ? `${heartbeat.machine} · v${heartbeat.version}` : "no heartbeat yet"}</td></tr>
                <tr><td className="note">Last seen</td><td>{heartbeat ? <>{ago(heartbeat.last_seen)} <span className={`pill ${extAlive ? "ok" : "run"}`}>{extAlive ? "connected" : "not seen in 15 min"}</span></> : "—"}</td></tr>
                <tr><td className="note">AI keys stored</td><td>{aiKeys.length ? aiKeys.join(", ") : "none — tokenless"}</td></tr>
                <tr><td className="note">Settings</td><td className="note">Bots desk (side menu) — model, who may use AI, spending caps.</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* 3. per-endpoint detail (Metrc endpoints, sheet tabs) */}
      <div className="mtitle" style={{ marginTop: 22 }}><span className="sq" /><h2>Per-endpoint detail</h2><span className="rule" /></div>
      <Suspense fallback={<div className="note">Loading…</div>}>
        <SyncItems session={session} licences={NO_ROWS} />
      </Suspense>

      {/* 4. recent runs, every source */}
      <div className="mtitle" style={{ marginTop: 22 }}><span className="sq" /><h2>Recent runs</h2><span className="rule" /></div>
      <div className="panel" style={{ maxWidth: "none", padding: 0, overflowX: "auto" }}>
        <table className="syncgrid">
          <thead><tr><th>When</th><th>System</th><th>Endpoint</th><th>Licence</th><th>Status</th><th>Rows</th><th>Error</th></tr></thead>
          <tbody>
            {recent.length === 0 && <tr><td colSpan={7} className="note">No runs recorded.</td></tr>}
            {recent.map((r, i) => (
              <tr key={i}>
                <td title={r.started_at}>{ago(r.started_at)}</td><td>{r.system}</td><td>{r.endpoint}</td><td>{r.license}</td>
                <td><span className={`pill ${pillFor(r.status)}`}>{r.status}</span></td>
                <td>{r.records ?? "—"}</td><td className="note wrap">{r.error}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
