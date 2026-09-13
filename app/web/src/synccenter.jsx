/* ---------------------------------------------------------------------------
   SYNC & CONNECTIONS — the one page for every sync and every secret in the OS.
   Owner, 13 Sep 2026: "all syncs, tokens, secrets kept on one page, fully mapped
   and wired for the entire OS, from the Sync button on the side menu" — then
   "this is not dynamic: how do I add, edit, modify, see status — each, all the
   details … add all AI and bot tokens, keys and secrets so admin can add
   whatever they need to" — then "buttons not working, not fully dynamic, not
   like a professional page at all."

   What that last one was (measured in the browser, 13 Sep 22:55 UTC): a row's
   detail opened ABOVE the table, so clicking row 20 looked like nothing
   happened; the edit form was reset by the 20-second refresh while you typed;
   and f_sync_status does not return cron_jobname / run_source, so a saved edit
   would have blanked the sync's link to its cron job and its run history.

   Now: a row expands in place, directly under itself. The form is keyed on the
   sync, not on the refresh. The full registry row is merged in (sync_registry
   is readable by every signed-in user; writes go through the admin-gated RPCs).

   One definition of a sync: public.sync_registry. Reads: f_sync_status,
   f_sync_runs, f_cron_jobs. Writes: f_sync_upsert, f_sync_set_enabled,
   f_sync_set_schedule (moves the cron job), f_sync_run → f_sync_run_result.
   One definition of a secret: f_secret_inventory over both stores; tg_secret_put
   / tg_secret_remove. Values never come back to the browser.
   Nothing here is a silent fallback: a read that fails says so on the page.
--------------------------------------------------------------------------- */
import React, { useCallback, useEffect, useMemo, useRef, useState, lazy, Suspense } from "react";
import { supabase } from "./lib/supabase.js";
import { useRole, QrDecode } from "./App.jsx";

const SyncItems = lazy(() => import("./syncitems.jsx"));
/* One shared empty list for the not-yet-loaded state — stable identity, no silent fallbacks. */
const NO_ROWS = Object.freeze([]);
const REFRESH_MS = 20000;

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
const pillFor = (status) => (status === "ok" || status === "succeeded" ? "ok" : status === "error" || status === "failed" ? "err" : "run");
const cronWords = (s) => {
  if (!s) return "—";
  if (s === "manual") return "manual";
  if (s.startsWith("on change")) return s;
  const m = s.match(/^(\S+) (\S+) \* \* \*$/);
  if (!m) return s;
  const [, mi, hr] = m;
  if (mi === "*" && hr === "*") return "every minute";
  if (mi.startsWith("*/") && hr === "*") return `every ${mi.slice(2)} min`;
  const span = mi.match(/^(\d+)-\d+\/(\d+)$/);
  if (span && hr === "*") return `every ${span[2]} min from :${span[1].padStart(2, "0")}`;
  if (/^\d+$/.test(mi) && hr === "*") return `hourly at :${mi.padStart(2, "0")}`;
  if (/^\d+$/.test(mi) && /^\d+$/.test(hr)) return `daily ${hr.padStart(2, "0")}:${mi.padStart(2, "0")} UTC`;
  return s;
};
const KINDS = [
  ["edge_function", "Edge function — the runner is the function path, e.g. metrc-sync or metrc-documents?mode=urls"],
  ["cron", "Cron job — the runner is the SQL the job calls; pick the job below"],
  ["rpc", "Database function — the runner is its name, e.g. tg_refresh_reports"],
  ["bridge", "Bridge — runs on change by trigger; the runner is what a Run now calls"],
];
const RUN_SOURCES = [
  ["none", "Run now only (sync_registry_run)"],
  ["cron", "The cron job's own run log"],
  ["apex", "Apex sync runs (apex_sync_run)"],
  ["metrc", "Metrc sync runs, filtered by endpoint (metrc_sync_runs)"],
];
/* Names an admin is likely to want. Any UPPER_SNAKE_CASE name is accepted; these are shortcuts. */
const SECRET_SUGGESTIONS = [
  "ANTHROPIC_API_KEY", "OPENAI_API_KEY", "XAI_API_KEY", "GOOGLE_AI_API_KEY",
  "BOTS_BRIDGE_TOKEN", "ALERT_EMAIL_API_KEY", "TWILIO_AUTH_TOKEN",
  "QBO_CLIENT_ID", "QBO_CLIENT_SECRET", "MONDAY_TOKEN", "APEX_API_BASE", "APEX_COMPANY_ID", "METRC_USER_KEYS",
];
const PROTECTED = ["TG_ADMIN_KEY", "SUPABASE_ANON_KEY"];
/* Postgres speaks in its own words; the page answers in ours. */
const plain = (e) => {
  const m = String(e?.message || e || "");
  if (/statement timeout/i.test(m)) return "The database did not answer in time. If a run of this sync is still going, wait for it to finish and try again.";
  if (/42501|permission denied|only/i.test(m) && /owner|executive|admin/i.test(m)) return m;
  if (/JWT|not authenticated/i.test(m)) return "Your sign-in has expired — sign in again.";
  return m || "No answer came back.";
};

/* Turn a function's JSON answer into one readable line, never a wall. */
function summarise(body) {
  try {
    const j = JSON.parse(body);
    if (j.error) return String(j.error);
    if (j.results) return Object.entries(j.results).filter(([k]) => !k.startsWith("_")).map(([k, v]) => `${k}: ${v}`).join(" · ");
    if (typeof j.total === "number") return `${j.total} rows`;
    return body.slice(0, 300);
  } catch { return (body || "").slice(0, 300); }
}
/* A run's detail column: cursor commits and other JSON receipts become words. */
function runDetail(text) {
  if (!text) return "";
  const t = String(text).trim();
  if (!t.startsWith("{")) return t;
  try {
    const j = JSON.parse(t);
    if (j.kind === "metrc_cursor_commit_v1") return `cursor ${j.outcome || "?"} · ${j.records ?? 0} records · ${j.cursor_key || ""}${j.window_end ? ` · to ${when(j.window_end)}` : ""}`;
    const parts = Object.entries(j).filter(([, v]) => v !== null && typeof v !== "object").slice(0, 5).map(([k, v]) => `${k}: ${v}`);
    return parts.join(" · ") || t.slice(0, 160);
  } catch { return t.slice(0, 200); }
}

const EMPTY_ROW = { key: "", system: "OS", label: "", what: "", kind: "cron", runner: "", cron_jobname: "", schedule: "", secrets: [], secrets_missing: [], lane: "", note: "", sort: 100, enabled: true, health: "new", run_source: "none" };
const toForm = (r) => {
  const src = r.run_source || "none";
  const [srcKind, srcPat = ""] = src.split(":");
  return { key: r.key, system: r.system, label: r.label, what: r.what, kind: r.kind, runner: r.runner, cron_jobname: r.cron_jobname || "", schedule: r.schedule || "", secrets: (r.secrets || []).join(", "), lane: r.lane || "", note: r.note || "", sort: r.sort, enabled: r.enabled, srcKind: RUN_SOURCES.some(([k]) => k === srcKind) ? srcKind : "none", srcPat };
};

/* ── the edit / add form ─────────────────────────────────────────────────── */
function SyncForm({ row, cronJobs, onSaved, onCancel }) {
  const [form, setForm] = useState(() => toForm(row));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const job = cronJobs.find((j) => j.jobname === form.cron_jobname);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const save = async () => {
    setBusy(true); setMsg(null);
    const payload = {
      key: form.key, system: form.system, label: form.label, what: form.what, kind: form.kind, runner: form.runner,
      cron_jobname: form.cron_jobname, schedule: form.schedule, lane: form.lane, note: form.note, enabled: form.enabled,
      secrets: form.secrets.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean), sort: Number(form.sort) || 100,
      run_source: form.srcKind === "metrc" ? `metrc:${form.srcPat.trim()}` : form.srcKind,
    };
    const { data, error } = await supabase.rpc("f_sync_upsert", { p: payload });
    setBusy(false);
    if (error || !data?.ok) { setMsg(error ? plain(error) : "Not saved."); return; }
    onSaved(data.key);
  };
  return (
    <div className="syncform">
      <div className="cols2">
        <div>
          <label htmlFor="sf-key">Key <span className="note">(a–z, 0–9, underscore · fixed once saved)</span></label>
          <input id="sf-key" value={form.key} disabled={!!row.key} onChange={set("key")} placeholder="apex_orders" />
          <label htmlFor="sf-label">Name</label><input id="sf-label" value={form.label} onChange={set("label")} placeholder="Apex orders" />
          <label htmlFor="sf-system">System</label><input id="sf-system" value={form.system} onChange={set("system")} placeholder="Metrc · Apex · Google Sheets · OS …" />
          <label htmlFor="sf-what">What it does</label><textarea id="sf-what" value={form.what} onChange={set("what")} rows={3} />
          <label htmlFor="sf-lane">Lane</label><input id="sf-lane" value={form.lane} onChange={set("lane")} placeholder="Claude · GPT · Grok · Watchdog" />
          <label htmlFor="sf-note">Note</label><input id="sf-note" value={form.note} onChange={set("note")} />
        </div>
        <div>
          <label htmlFor="sf-kind">Kind</label>
          <select id="sf-kind" value={form.kind} onChange={set("kind")}>{KINDS.map(([k]) => <option key={k} value={k}>{k}</option>)}</select>
          <div className="note">{KINDS.find(([k]) => k === form.kind)?.[1]}</div>
          <label htmlFor="sf-runner">Runner</label><input id="sf-runner" value={form.runner} onChange={set("runner")} placeholder="metrc-sync · apex-sync?entity=orders · tg_refresh_reports" />
          <label htmlFor="sf-job">Cron job <span className="note">(blank = manual or dispatcher-driven)</span></label>
          <select id="sf-job" value={form.cron_jobname} onChange={set("cron_jobname")}>
            <option value="">— none —</option>
            {cronJobs.map((j) => <option key={j.jobname} value={j.jobname}>{j.jobname} · {j.schedule}{j.active ? "" : " (paused)"}</option>)}
          </select>
          <label htmlFor="sf-sched">Schedule</label>
          {job
            ? <input id="sf-sched" value={job.schedule} disabled title="Taken from the cron job. Change it from the sync's overview — that moves the job." />
            : <input id="sf-sched" value={form.schedule} onChange={set("schedule")} placeholder="*/5 * * * *  ·  manual  ·  on change (trigger)" />}
          {job && <div className="note">Comes from the cron job. To move it, close this form and use Change schedule on the overview.</div>}
          <label htmlFor="sf-src">Run history comes from</label>
          <select id="sf-src" value={form.srcKind} onChange={set("srcKind")}>{RUN_SOURCES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
          {form.srcKind === "metrc" && <input aria-label="Metrc endpoint pattern" value={form.srcPat} onChange={set("srcPat")} placeholder="endpoint pattern, e.g. delta or documents" />}
          <label htmlFor="sf-secrets">Secrets it needs <span className="note">(comma-separated names)</span></label>
          <input id="sf-secrets" value={form.secrets} onChange={set("secrets")} placeholder="METRC_USER_KEY, TG_ADMIN_KEY" />
          <div className="syncform-row">
            <div><label htmlFor="sf-sort">Sort</label><input id="sf-sort" type="number" value={form.sort} onChange={set("sort")} /></div>
            <div><label htmlFor="sf-enabled">Enabled</label><select id="sf-enabled" value={form.enabled ? "yes" : "no"} onChange={(e) => setForm((f) => ({ ...f, enabled: e.target.value === "yes" }))}><option value="yes">yes</option><option value="no">no — switched off</option></select></div>
          </div>
        </div>
      </div>
      {msg && <div className="msg err">{msg}</div>}
      <div className="syncform-acts">
        <button type="button" className="btn" disabled={busy} onClick={save}>{busy ? "Saving…" : row.key ? "Save changes" : "Register this sync"}</button>
        <button type="button" className="btn ghost" disabled={busy} onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

/* ── one sync, opened in place: overview · edit · runs ──────────────────── */
function SyncDetail({ row, cronJobs, canEdit, canRun, run, runState, onChanged, onRemoved, onClose }) {
  const [tab, setTab] = useState("overview");
  const [runs, setRuns] = useState(null);
  const [runsErr, setRunsErr] = useState(null);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const [sched, setSched] = useState(row.schedule || "");
  const [schedOpen, setSchedOpen] = useState(false);
  const box = useRef(null);
  /* The parent mounts this with key={row.key}, so state is per sync and the 20-second refresh never resets a form or a draft. */
  useEffect(() => { box.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }); }, []);
  useEffect(() => {
    let live = true;
    supabase.rpc("f_sync_runs", { p_key: row.key, p_limit: 20 }).then(({ data, error }) => {
      if (!live) return;
      if (error) setRunsErr(error.message);
      else if (Array.isArray(data)) { setRuns(data); setRunsErr(null); }
      else setRunsErr("No run history came back.");
    });
    return () => { live = false; };
  }, [row.key, runState?.state, row.last_started]);

  const toggle = async () => {
    setBusy(true); setMsg(null);
    const { data, error } = await supabase.rpc("f_sync_set_enabled", { p_key: row.key, p_enabled: !row.enabled });
    setBusy(false);
    if (error) { setMsg({ kind: "err", text: plain(error) }); return; }
    setMsg({ kind: "ok", text: `${row.enabled ? "Switched off" : "Switched on"}${data?.cron_job ? ` — cron job ${data.cron_job} ${row.enabled ? "paused" : "resumed"}` : ""}.` });
    onChanged(row.key);
  };
  const saveSchedule = async () => {
    setBusy(true); setMsg(null);
    const { error } = await supabase.rpc("f_sync_set_schedule", { p_key: row.key, p_schedule: sched.trim() });
    setBusy(false);
    if (error) { setMsg({ kind: "err", text: plain(error) }); return; }
    setMsg({ kind: "ok", text: `Schedule is now "${sched.trim()}" — the cron job ${row.cron_jobname} was changed.` }); setSchedOpen(false); onChanged(row.key);
  };
  const remove = async () => {
    if (!window.confirm(`Remove "${row.label}" from the registry?

Only the registry row goes: the cron job${row.cron_jobname ? ` ${row.cron_jobname}` : ""}, the function and the run history stay where they are.`)) return;
    setBusy(true); setMsg(null);
    const { error } = await supabase.rpc("f_sync_remove", { p_key: row.key });
    setBusy(false);
    if (error) { setMsg({ kind: "err", text: plain(error) }); return; }
    onRemoved(row.key);
  };
  const job = cronJobs.find((j) => j.jobname === row.cron_jobname);
  const tone = row.enabled ? (HEALTH_TONE[row.health] || "run") : "muted";

  return (
    <div className="syncdetail" ref={box}>
      <div className="syncdetail-head">
        <div>
          <div className="ptitle" style={{ margin: 0 }}>{row.label}</div>
          <div className="note">{row.system} · <code>{row.key}</code> · {row.kind} · runner <code>{row.runner}</code></div>
        </div>
        <span className={`pill ${tone}`}>{row.enabled ? row.health : "off"}</span>
        <div className="syncdetail-acts">
          {canRun && <button type="button" className="btn small" disabled={runState?.state === "running" || !row.enabled} onClick={() => run(row.key)}>{runState?.state === "running" ? "Running…" : "Run now"}</button>}
          {canEdit && <button type="button" className="btn ghost small" disabled={busy} onClick={toggle}>{row.enabled ? "Switch off" : "Switch on"}</button>}
          {canEdit && <button type="button" className="btn ghost small syncdanger" disabled={busy || runState?.state === "running"} onClick={remove} title={runState?.state === "running" ? "Wait for the run to finish" : "Take this sync off the registry"}>Remove</button>}
          <button type="button" className="btn ghost small" onClick={onClose}>Close</button>
        </div>
      </div>
      <div className="synctabs" role="tablist">
        {[["overview", "Overview"], canEdit && ["edit", "Edit"], ["runs", `Runs${runs ? ` (${runs.length})` : ""}`]].filter(Boolean).map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} className={`synctab${tab === id ? " on" : ""}`} onClick={() => setTab(id)}>{label}</button>
        ))}
      </div>
      {runState && <div className={`msg ${runState.state === "error" ? "err" : runState.state === "done" ? "ok" : ""}`}>{runState.text}</div>}
      {msg && <div className={`msg ${msg.kind}`}>{msg.text}</div>}

      {tab === "overview" && (
        <div className="cols2 syncfacts">
          <table><tbody>
            <tr><td className="note">What it does</td><td className="wrap">{row.what}</td></tr>
            <tr><td className="note">Cron job</td><td>{row.cron_jobname ? <><code>{row.cron_jobname}</code> {job && <span className={`pill ${job.active ? "ok" : "muted"}`}>{job.active ? "active" : "paused"}</span>}</> : row.schedule && row.schedule !== "manual" && !row.schedule.startsWith("on change") ? <span className="note">none of its own — the dispatcher runs it on the schedule below</span> : <span className="note">none — {row.schedule || "manual"}</span>}</td></tr>
            <tr><td className="note">Schedule</td><td>
              <code>{row.schedule || "—"}</code> <span className="note">{cronWords(row.schedule)}</span>
              {row.cron_jobname && canRun && !schedOpen && <button type="button" className="btn ghost small" style={{ marginLeft: 8 }} onClick={() => setSchedOpen(true)}>Change schedule</button>}
              {schedOpen && (
                <div className="syncform-row" style={{ marginTop: 6 }}>
                  <input aria-label="New cron schedule" value={sched} onChange={(e) => setSched(e.target.value)} placeholder="*/15 * * * *" />
                  <button type="button" className="btn small" disabled={busy || sched.trim() === (row.schedule || "")} onClick={saveSchedule}>Move the job</button>
                  <button type="button" className="btn ghost small" onClick={() => { setSchedOpen(false); setSched(row.schedule || ""); }}>Cancel</button>
                </div>
              )}
            </td></tr>
            <tr><td className="note">Secrets it needs</td><td className="wrap">{row.secrets?.length ? row.secrets.map((s) => <span key={s} className={`syncchip${row.secrets_missing?.includes(s) ? " missing" : ""}`}>{s}{row.secrets_missing?.includes(s) ? " · missing" : ""}</span>) : <span className="note">none</span>}</td></tr>
            <tr><td className="note">Run history from</td><td><code>{row.run_source || "none"}</code></td></tr>
            <tr><td className="note">Lane</td><td>{row.lane || "—"}</td></tr>
            <tr><td className="note">Note</td><td className="wrap">{row.note || "—"}</td></tr>
            <tr><td className="note">Registered</td><td>{when(row.created_at)} <span className="note">· updated {ago(row.updated_at)}</span></td></tr>
          </tbody></table>
          <table><tbody>
            <tr><td className="note">Enabled</td><td>{row.enabled ? <span className="pill ok">on</span> : <span className="pill muted">off</span>}</td></tr>
            <tr><td className="note">Last run</td><td>{when(row.last_started)} <span className="note">({ago(row.last_started)})</span></td></tr>
            <tr><td className="note">Finished</td><td>{when(row.last_finished)}</td></tr>
            <tr><td className="note">Result</td><td>{row.last_status ? <span className={`pill ${pillFor(row.last_status)}`}>{row.last_status}</span> : "—"} {row.last_records != null && <span className="note">{Number(row.last_records).toLocaleString()} rows</span>}</td></tr>
            <tr><td className="note">Last error</td><td className={`wrap${row.last_error ? " syncdanger" : ""}`}>{row.last_error || "none"}</td></tr>
            <tr><td className="note">Last 24 h</td><td>{row.runs_24h} runs{row.failed_24h > 0 && <span className="syncdanger"> · {row.failed_24h} failed</span>}</td></tr>
            <tr><td className="note">Health</td><td><span className={`pill ${tone}`}>{row.enabled ? row.health : "off"}</span></td></tr>
          </tbody></table>
        </div>
      )}

      {tab === "edit" && canEdit && (
        <SyncForm key={row.key} row={row} cronJobs={cronJobs} onCancel={() => setTab("overview")}
          onSaved={(k) => { setMsg({ kind: "ok", text: "Saved." }); setTab("overview"); onChanged(k); }} />
      )}

      {tab === "runs" && (
        <>
          {runsErr && <div className="msg err">{runsErr}</div>}
          {runs === null && !runsErr && <div className="note">Loading…</div>}
          {runs !== null && runs.length === 0 && <div className="note">No runs recorded for this sync yet.</div>}
          {runs !== null && runs.length > 0 && (
            <div className="tablewrap">
              <table className="syncgrid">
                <thead><tr><th>Started</th><th>Finished</th><th>Status</th><th>Rows</th><th>Source</th><th>Detail</th></tr></thead>
                <tbody>{runs.map((r, i) => (
                  <tr key={i}><td title={r.started_at}>{when(r.started_at)}</td><td>{r.finished_at ? when(r.finished_at) : "—"}</td>
                    <td><span className={`pill ${pillFor(r.status)}`}>{r.status}</span></td>
                    <td>{r.records ?? "—"}</td><td className="note">{r.source}</td><td className="note wrap">{runDetail(r.detail)}</td></tr>
                ))}</tbody>
              </table>
            </div>
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
  const [secretQ, setSecretQ] = useState("");
  const [helpOpen, setHelpOpen] = useState({});
  const [newSecret, setNewSecret] = useState({ name: "", value: "" });
  const [heartbeat, setHeartbeat] = useState(null);
  const [recent, setRecent] = useState(NO_ROWS);
  const [cronJobs, setCronJobs] = useState(NO_ROWS);
  const [filter, setFilter] = useState("all");
  const [healthFilter, setHealthFilter] = useState("all");
  const [openKey, setOpenKey] = useState(null);
  const [adding, setAdding] = useState(false);
  const [q, setQ] = useState("");
  const [readAt, setReadAt] = useState(null);
  const [notice, setNotice] = useState(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [s, reg, sec, hb, rr, cj] = await Promise.all([
      supabase.rpc("f_sync_status"),
      supabase.from("sync_registry").select("key, cron_jobname, run_source, created_at, updated_at"),
      supabase.rpc("f_secret_inventory"),
      supabase.from("ai_bridge_heartbeat").select("machine, last_seen, version, operator").order("last_seen", { ascending: false }).limit(1),
      supabase.from("v_all_sync_runs").select("system, endpoint, license, status, records, started_at, error").order("started_at", { ascending: false }).limit(25),
      supabase.rpc("f_cron_jobs"),
    ]);
    setLoading(false);
    if (s.error) setErr(s.error.message);
    else if (!Array.isArray(s.data)) setErr("f_sync_status returned no rows — the registry could not be read.");
    else {
      const extra = new Map(Array.isArray(reg.data) ? reg.data.map((r) => [r.key, r]) : []);
      setRows(s.data.map((r) => ({ ...r, ...(extra.get(r.key) || {}) })));
      setErr(reg.error ? `Registry detail could not be read: ${reg.error.message}` : null);
    }
    if (sec.error) setSecretMsg({ kind: "err", text: `Secrets could not be listed: ${sec.error.message}` });
    else if (Array.isArray(sec.data)) setSecrets(sec.data);
    if (!hb.error && Array.isArray(hb.data)) setHeartbeat(hb.data[0] || null);
    if (rr.error) setErr((e) => e || `Recent runs could not be read: ${rr.error.message}`);
    else if (Array.isArray(rr.data)) setRecent(rr.data);
    if (!cj.error && Array.isArray(cj.data)) setCronJobs(cj.data);
    setReadAt(new Date());
  }, []);
  useEffect(() => { load(); const id = setInterval(load, REFRESH_MS); return () => clearInterval(id); }, [load]);

  const run = async (key) => {
    const row = (rows || NO_ROWS).find((x) => x.key === key);
    const inDb = row && row.kind !== "edge_function";
    setRuns((r) => ({ ...r, [key]: { state: "running", text: inDb ? "Running inside the database now — a heavy job (matview refresh, full recompute) can take a minute or two. The answer lands here when it finishes." : "Starting…" } }));
    const { data, error } = await supabase.rpc("f_sync_run", { p_key: key });
    if (error || !data?.ok) { setRuns((r) => ({ ...r, [key]: { state: "error", text: error ? plain(error) : data?.error || "Refused" } })); return; }
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
  const toggleRow = async (r) => {
    const { error } = await supabase.rpc("f_sync_set_enabled", { p_key: r.key, p_enabled: !r.enabled });
    if (error) { setErr(plain(error)); return; }
    load();
  };

  const putSecret = async (name, value) => {
    const v = (value || "").trim(); const n = (name || "").trim().toUpperCase();
    if (!v || !n) return;
    setSecretMsg(null);
    const { error } = await supabase.rpc("tg_secret_put", { p_name: n, p_value: v });
    if (error) { setSecretMsg({ kind: "err", text: `${n}: ${plain(error)}` }); return; }
    setSecretDraft((d) => ({ ...d, [n]: "" })); setNewSecret({ name: "", value: "" });
    setSecretMsg({ kind: "ok", text: `${n} stored. Values are never shown back; the last four characters confirm which one is live.` });
    load();
  };
  const removeSecret = async (name) => {
    if (!window.confirm(`Remove ${name}? Any sync that needs it will show "missing secret" until a new value is pasted.`)) return;
    const { error } = await supabase.rpc("tg_secret_remove", { p_name: name });
    if (error) { setSecretMsg({ kind: "err", text: plain(error) }); return; }
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
  const secretsShown = secretList.filter((s) => !secretQ || `${s.name} ${s.label || ""} ${s.store || ""}`.toLowerCase().includes(secretQ.toLowerCase()));
  const missingSecrets = secretList.filter((s) => !s.present);
  const aiKeys = secretList.filter((s) => s.present && /^(ANTHROPIC|OPENAI|XAI|GOOGLE_AI|BOTS)/.test(s.name)).map((s) => s.name);
  const extAlive = !!heartbeat && (Date.now() - new Date(heartbeat.last_seen).getTime()) < 15 * 60 * 1000;
  const afterChange = (key) => { setAdding(false); if (key) setOpenKey(key); load(); };
  const FILTER_LABEL = { ok: "healthy", failing: "failing", stale: "stale or never ran", missing: "missing a secret", off: "switched off" };

  const stat = (id, n, label, hot) => (
    <button type="button" key={id} className={`syncstat${healthFilter === id ? " on" : ""}${hot ? " hot" : ""}`} onClick={() => setHealthFilter(healthFilter === id ? "all" : id)} title={healthFilter === id ? "Clear this filter" : `Show only: ${label}`}>
      <b>{n}</b><span>{label}</span>
    </button>
  );

  return (
    <>
      <div className="pagehead synchead">
        <div>
          <h1>Sync &amp; Connections</h1>
          <div className="sub">Every sync in the OS and every token, key and secret it needs — on one page. Click a number to filter, a row to open it, Edit to change it, Add to register a new one.</div>
        </div>
        <div className="synchead-acts">
          <span className="note">{readAt ? `read ${ago(readAt)}` : "reading…"}{loading ? " · refreshing" : ""}</span>
          <button type="button" className="btn ghost small" onClick={load} disabled={loading}>Refresh</button>
          {canEdit && <button type="button" className="btn small" onClick={() => { setAdding(true); setOpenKey(null); }}>+ Add a sync</button>}
        </div>
      </div>

      {/* dynamic summary: every number is a filter */}
      <div className="sbtotals syncstats">
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
      {notice && <div className="msg ok">{notice} <button type="button" className="synclink" onClick={() => setNotice(null)}>dismiss</button></div>}

      {adding && canEdit && (
        <div className="syncdetail" style={{ marginTop: 14 }}>
          <div className="syncdetail-head"><div className="ptitle" style={{ margin: 0 }}>Register a new sync</div><div className="syncdetail-acts"><button type="button" className="btn ghost small" onClick={() => setAdding(false)}>Close</button></div></div>
          <SyncForm row={EMPTY_ROW} cronJobs={cronJobs} onSaved={afterChange} onCancel={() => setAdding(false)} />
        </div>
      )}

      {/* 1. every sync */}
      <div className="mtitle" style={{ marginTop: 18 }}><span className="sq" /><h2>Syncs</h2><span className="rule" /></div>
      <div className="sbtools" style={{ marginBottom: 10 }}>
        <span className="sblab">System</span>
        <button type="button" className={`sbchip ${filter === "all" ? "on" : ""}`} onClick={() => setFilter("all")}>All<i>{list.length}</i></button>
        {systems.map((s) => (
          <button key={s} type="button" className={`sbchip ${filter === s ? "on" : ""}`} onClick={() => setFilter(s)}>{s}<i>{list.filter((r) => r.system === s).length}</i></button>
        ))}
        {healthFilter !== "all" && <button type="button" className="sbchip on" onClick={() => setHealthFilter("all")} title="Clear">{FILTER_LABEL[healthFilter] || healthFilter}<i>×</i></button>}
        <input aria-label="Search syncs" value={q} onChange={(e) => setQ(e.target.value)} placeholder="search name, runner, key…" className="syncsearch" />
      </div>
      <div className="panel tablewrap" style={{ maxWidth: "none", padding: 0 }}>
        <table className="syncgrid">
          <thead><tr><th>System</th><th>Sync</th><th>Schedule</th><th>Last run</th><th>Result</th><th>24 h</th><th>Health</th><th style={{ textAlign: "right" }}>Actions</th></tr></thead>
          <tbody>
            {rows === null && !err && <tr><td colSpan={8} className="note">Loading…</td></tr>}
            {rows !== null && shown.length === 0 && <tr><td colSpan={8} className="note">Nothing matches this filter.</td></tr>}
            {shown.map((r) => {
              const st = runs[r.key];
              const isOpen = openKey === r.key;
              const toggleOpen = () => { setAdding(false); setOpenKey(isOpen ? null : r.key); };
              return (
                <React.Fragment key={r.key}>
                  <tr className={`syncrow${isOpen ? " on" : ""}${r.enabled ? "" : " off"}`} onClick={toggleOpen} role="button" tabIndex={0} aria-expanded={isOpen}
                      onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); toggleOpen(); } }}>
                    <td>{r.system}</td>
                    <td className="wrap"><b>{r.label}</b><div className="note">{r.what}</div></td>
                    <td title={r.schedule}>{cronWords(r.schedule)}</td>
                    <td title={r.last_started || ""}>{ago(r.last_started)}</td>
                    <td>{r.last_status ? <span className={`pill ${pillFor(r.last_status)}`}>{r.last_status}</span> : <span className="note">—</span>}{r.last_records != null && <span className="note" style={{ marginLeft: 6 }}>{Number(r.last_records).toLocaleString()}</span>}</td>
                    <td>{r.runs_24h}{r.failed_24h > 0 && <span className="syncdanger"> · {r.failed_24h} failed</span>}</td>
                    <td><span className={`pill ${r.enabled ? (HEALTH_TONE[r.health] || "run") : "muted"}`}>{r.enabled ? r.health : "off"}</span>{st && <div className={`note wrap${st.state === "error" ? " syncdanger" : ""}`} style={{ maxWidth: 240 }}>{st.text.slice(0, 120)}</div>}</td>
                    <td className="syncacts">
                      {canEdit && <button type="button" className={`btn ghost small${r.enabled ? "" : " off"}`} onClick={(e) => { e.stopPropagation(); toggleRow(r); }} title={r.enabled ? "Switch this sync off" : "Switch this sync on"}>{r.enabled ? "On" : "Off"}</button>}
                      {canRun && <button type="button" className="btn ghost small" disabled={st?.state === "running" || !r.enabled} onClick={(e) => { e.stopPropagation(); run(r.key); }} title={`${r.kind}: ${r.runner}`}>{st?.state === "running" ? "…" : "Run"}</button>}
                      <button type="button" className="btn ghost small" onClick={(e) => { e.stopPropagation(); toggleOpen(); }} aria-label={isOpen ? `Close ${r.label}` : `Open ${r.label}`}>{isOpen ? "▴" : "▾"}</button>
                    </td>
                  </tr>
                  {isOpen && (
                    <tr className="syncexpand"><td colSpan={8}>
                      <SyncDetail key={r.key} row={r} cronJobs={cronJobs} canEdit={canEdit} canRun={canRun} run={run} runState={st} onChanged={afterChange} onRemoved={(k) => { setOpenKey(null); setErr(null); setNotice(`Removed ${k} from the registry.`); load(); }} onClose={() => setOpenKey(null)} />
                    </td></tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      {role !== null && !canRun && <div className="msg" style={{ marginTop: 10 }}>Running a sync or changing a schedule is limited to owner and executive. Your role is <b>{role}</b>.</div>}

      {/* 2. tokens, keys & secrets — everything, and anything an admin adds */}
      <div className="mtitle" style={{ marginTop: 22 }}><span className="sq" /><h2>Tokens, keys &amp; secrets</h2><span className="rule" /></div>
      <div className="cols2 synccols">
        <div className="panel" style={{ maxWidth: "none" }}>
          <div className="sub">Every secret in both stores — Metrc, Apex, Sheets, e-mail, AI and bot keys, anything added below. Paste to set or rotate; the last four characters confirm which value is live. Values never come back to this screen.</div>
          {!canEdit && <div className="msg">Owner, executive or admin only. Your role is <b>{role ?? "…"}</b>.</div>}
          {canEdit && (
            <div className="sbtools" style={{ margin: "10px 0" }}>
              <span className="sblab">{secretList.length} secrets · {secretList.length - missingSecrets.length} set · {missingSecrets.length} missing</span>
              <input aria-label="Search secrets" value={secretQ} onChange={(e) => setSecretQ(e.target.value)} placeholder="search…" className="syncsearch" />
            </div>
          )}
          {canEdit && secrets === null && !secretMsg && <div className="note">Loading…</div>}
          {canEdit && secrets !== null && (
            <div className="tablewrap">
              <table className="syncgrid secrets">
                <thead><tr><th>Secret</th><th>Status</th><th>Used by</th><th>Set / rotate</th><th /></tr></thead>
                <tbody>
                  {secretsShown.length === 0 && <tr><td colSpan={5} className="note">Nothing matches.</td></tr>}
                  {secretsShown.map((s) => (
                    <tr key={s.name} className={s.present ? "" : "off"}>
                      <td className="wrap">
                        <code>{s.name}</code>
                        <div className="note">{s.label || s.store}{s.help && <button type="button" className="synclink" onClick={() => setHelpOpen((h) => ({ ...h, [s.name]: !h[s.name] }))} aria-expanded={!!helpOpen[s.name]}>{helpOpen[s.name] ? " hide" : " what is this?"}</button>}</div>
                        {helpOpen[s.name] && <div className="note synchelp">{s.help}</div>}
                      </td>
                      <td>{s.present ? <><span className="pill ok">set</span> <code className="note">{s.masked}</code>{s.updated_at && <div className="note">{ago(s.updated_at)}</div>}</> : <span className="pill err">missing</span>}</td>
                      <td className="note wrap">{s.used_by?.length ? s.used_by.join(", ") : "—"}</td>
                      <td>
                        <div className="syncform-row">
                          <input type="password" autoComplete="off" aria-label={`New value for ${s.name}`} value={secretDraft[s.name] || ""} onChange={(e) => setSecretDraft((d) => ({ ...d, [s.name]: e.target.value }))} placeholder={s.present ? "paste to replace" : "paste value"} />
                          <button type="button" className="btn small" disabled={!(secretDraft[s.name] || "").trim()} onClick={() => putSecret(s.name, secretDraft[s.name])}>Store</button>
                        </div>
                      </td>
                      <td className="syncacts">{s.present && !PROTECTED.includes(s.name) && <button type="button" className="btn ghost small" onClick={() => removeSecret(s.name)} title="Remove this secret">Remove</button>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {canEdit && (
            <div className="syncadd">
              <div className="ptitle" style={{ fontSize: 13, margin: "0 0 4px" }}>Add a secret</div>
              <div className="note" style={{ marginBottom: 8 }}>Any name in UPPER_SNAKE_CASE. AI and bot keys go here too — they are used only when a sync or the Bots desk names them; your AI runs tokenless until then.</div>
              <div className="syncform-row">
                <input aria-label="New secret name" list="secret-names" value={newSecret.name} onChange={(e) => setNewSecret({ ...newSecret, name: e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, "_") })} placeholder="NAME_OF_THE_KEY" />
                <datalist id="secret-names">{SECRET_SUGGESTIONS.filter((n) => !secretList.some((s) => s.name === n)).map((n) => <option key={n} value={n} />)}</datalist>
                <input type="password" autoComplete="off" aria-label="New secret value" value={newSecret.value} onChange={(e) => setNewSecret({ ...newSecret, value: e.target.value })} placeholder="paste the value" />
                <button type="button" className="btn small" disabled={!newSecret.name.trim() || !newSecret.value.trim()} onClick={() => putSecret(newSecret.name, newSecret.value)}>Store</button>
              </div>
            </div>
          )}
          {secretMsg && <div className={`msg ${secretMsg.kind}`}>{secretMsg.text}</div>}
        </div>
        <div>
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
          {canEdit && <QrDecode onDecoded={(v) => setSecretDraft((d) => ({ ...d, METRC_VENDOR_KEYS: v }))} />}
        </div>
      </div>

      {/* 3. per-endpoint detail (Metrc endpoints, sheet tabs, Apex entities) */}
      <div className="mtitle" style={{ marginTop: 22 }}><span className="sq" /><h2>Per-endpoint detail</h2><span className="rule" /></div>
      <Suspense fallback={<div className="note">Loading…</div>}>
        <SyncItems session={session} licences={NO_ROWS} />
      </Suspense>

      {/* 4. recent runs, every source */}
      <div className="mtitle" style={{ marginTop: 22 }}><span className="sq" /><h2>Recent runs</h2><span className="rule" /></div>
      <div className="panel tablewrap" style={{ maxWidth: "none", padding: 0 }}>
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
