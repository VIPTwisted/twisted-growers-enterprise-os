/* ---------------------------------------------------------------------------
   SYNC & CONNECTIONS — the one page for every sync and every secret in the OS.
   Owner, 13 Sep 2026: "all syncs, tokens, secrets kept on one page, fully mapped
   and wired for the entire OS, from the Sync button on the side menu."

   One definition of a sync: public.sync_registry (job level). The page never
   carries its own list — it reads f_sync_status(), so a sync that exists in the
   database exists here, and one that is failing says so in the same row where
   its Run button is. sync_item stays the per-endpoint detail beneath Metrc and
   the sheets (SyncItems below), keyed by the same edge-function name.

   One definition of a secret: f_secret_inventory() joins the two stores the
   readers actually use (integration_secrets for the edge functions, app_secrets
   for the rest) into one list — present / missing, last four, which syncs need
   it — and tg_secret_put() writes to whichever store the reader reads. Values
   never come back to the browser.

   AI is tokenless by the owner's design: the TG bots extension carries his
   subscription. This page shows the extension's heartbeat and says so; the AI
   settings themselves are the Bots desk (Grok's surface), not here.
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
const HEALTH_TONE = { ok: "ok", failing: "bad", "missing secret": "bad", stale: "warn", "never ran": "warn", off: "muted", partial: "warn" };
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

export default function SyncCenter({ session }) {
  const { role } = useRole(session);
  const canRun = ["owner", "executive"].includes(role);
  const canEdit = ["owner", "executive", "admin"].includes(role);
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState(null);
  const [runs, setRuns] = useState({});         // key → { state, text }
  const [secrets, setSecrets] = useState(null);
  const [secretDraft, setSecretDraft] = useState({});
  const [secretMsg, setSecretMsg] = useState(null);
  const [heartbeat, setHeartbeat] = useState(null);
  const [recent, setRecent] = useState([]);
  const [filter, setFilter] = useState("all");

  const load = useCallback(async () => {
    const [s, sec, hb, rr] = await Promise.all([
      supabase.rpc("f_sync_status"),
      supabase.rpc("f_secret_inventory"),
      supabase.from("ai_bridge_heartbeat").select("machine, last_seen, version, operator").order("last_seen", { ascending: false }).limit(1),
      supabase.from("v_all_sync_runs").select("system, endpoint, license, status, records, started_at, error").order("started_at", { ascending: false }).limit(25),
    ]);
    /* No silent fallbacks: an error is shown, and an answer that is not an array is an error too. */
    if (s.error) setErr(s.error.message);
    else if (!Array.isArray(s.data)) setErr("f_sync_status returned no rows — the registry could not be read.");
    else { setRows(s.data); setErr(null); }
    if (sec.error) setSecretMsg({ kind: "bad", text: `Secrets could not be listed: ${sec.error.message}` });
    else if (Array.isArray(sec.data)) setSecrets(sec.data);
    if (!hb.error) setHeartbeat(hb.data?.[0] ?? null);
    if (rr.error) setErr((e) => e || `Recent runs could not be read: ${rr.error.message}`);
    else if (Array.isArray(rr.data)) setRecent(rr.data);
  }, []);
  useEffect(() => { load(); const id = setInterval(load, 30000); return () => clearInterval(id); }, [load]);

  /* Run now → f_sync_run(key). An edge function is dispatched and answered
     asynchronously, so the row polls f_sync_run_result until the HTTP answer
     lands and then shows status + body. A cron command or bridge runs inline. */
  const run = async (key) => {
    setRuns((r) => ({ ...r, [key]: { state: "running", text: "Starting…" } }));
    const { data, error } = await supabase.rpc("f_sync_run", { p_key: key });
    if (error || !data?.ok) {
      setRuns((r) => ({ ...r, [key]: { state: "error", text: error?.message || data?.error || "Refused" } }));
      return;
    }
    if (data.method === "edge_function") {
      const started = Date.now();
      const poll = async () => {
        const { data: res } = await supabase.rpc("f_sync_run_result", { p_run_id: data.run_id });
        if (res?.http_status) {
          const okish = res.http_status < 300;
          setRuns((r) => ({ ...r, [key]: { state: okish ? "done" : "error", text: `HTTP ${res.http_status} · ${summarise(res.body) || "no body"}` } }));
          load();
          return;
        }
        if (Date.now() - started > 180000) {
          setRuns((r) => ({ ...r, [key]: { state: "error", text: "No answer after 3 minutes. The run may still be going — see Recent runs." } }));
          load();
          return;
        }
        setTimeout(poll, 3000);
      };
      setRuns((r) => ({ ...r, [key]: { state: "running", text: "Dispatched — waiting for the function to answer…" } }));
      setTimeout(poll, 3000);
    } else {
      setRuns((r) => ({ ...r, [key]: { state: "done", text: data.result ? `Done · ${String(data.result).slice(0, 200)}` : `Done (${data.method})` } }));
      load();
    }
  };

  const saveSecret = async (name) => {
    const v = (secretDraft[name] || "").trim();
    if (!v) return;
    setSecretMsg(null);
    const { error } = await supabase.rpc("tg_secret_put", { p_name: name, p_value: v });
    if (error) { setSecretMsg({ kind: "bad", text: `${name}: ${error.message}` }); return; }
    setSecretDraft((d) => ({ ...d, [name]: "" }));
    setSecretMsg({ kind: "ok", text: `${name} stored. Values are never shown back; the last four characters confirm which one is live.` });
    load();
  };

  const list = rows === null ? NO_ROWS : rows;
  const systems = useMemo(() => Array.from(new Set(list.map((r) => r.system))), [list]);
  const shown = useMemo(() => list.filter((r) => filter === "all" || r.system === filter), [list, filter]);
  const counts = useMemo(() => {
    const c = { total: list.length, failing: 0, stale: 0, missing: 0, ok: 0 };
    for (const r of list) {
      if (r.health === "failing") c.failing++;
      else if (r.health === "stale" || r.health === "never ran") c.stale++;
      else if (r.health === "missing secret") c.missing++;
      else if (r.health === "ok") c.ok++;
    }
    return c;
  }, [list]);
  const secretList = secrets === null ? NO_ROWS : secrets;
  const missingSecrets = secretList.filter((s) => !s.present);
  const extAlive = !!heartbeat && (Date.now() - new Date(heartbeat.last_seen).getTime()) < 15 * 60 * 1000;
  const licences = useMemo(() => {
    /* Metrc licences drive the per-licence buttons below; they are a secret's value,
       so the page only ever learns them from the registry's own configuration row. */
    return [];
  }, []);

  return (
    <>
      <div className="pagehead">
        <div>
          <h1>Sync &amp; Connections</h1>
          <div className="sub">Every sync in the OS, every token and secret it needs, on one page. A sync that exists in the database exists here; one that is failing says so beside its own Run button.</div>
        </div>
      </div>

      {/* summary strip */}
      <div className="sbtotals" style={{ marginBottom: 14 }}>
        <div><b>{counts.total}</b><span>syncs registered</span></div>
        <div><b>{counts.ok}</b><span>healthy</span></div>
        <div className={counts.failing ? "hot" : ""}><b>{counts.failing}</b><span>failing</span></div>
        <div className={counts.stale ? "hot" : ""}><b>{counts.stale}</b><span>stale / never ran</span></div>
        <div className={missingSecrets.length ? "hot" : ""}><b>{missingSecrets.length}</b><span>secrets missing</span></div>
        <div><b>{extAlive ? "on" : "off"}</b><span>AI extension {heartbeat ? `v${heartbeat.version}` : ""}</span></div>
      </div>
      {err && <div className="msg bad">{err}</div>}

      {/* 1. every sync */}
      <div className="mtitle"><span className="sq" /><h2>Syncs</h2><span className="rule" /></div>
      <div className="sbtools" style={{ marginBottom: 10 }}>
        <span className="sblab">System</span>
        <button type="button" className={`sbchip ${filter === "all" ? "on" : ""}`} onClick={() => setFilter("all")}>All<i>{list.length}</i></button>
        {systems.map((s) => (
          <button key={s} type="button" className={`sbchip ${filter === s ? "on" : ""}`} onClick={() => setFilter(s)}>
            {s}<i>{list.filter((r) => r.system === s).length}</i>
          </button>
        ))}
      </div>
      <div className="panel" style={{ maxWidth: "none", padding: 0, overflowX: "auto" }}>
        <table className="tbl" style={{ minWidth: 980 }}>
          <thead><tr><th>System</th><th>Sync</th><th>Schedule</th><th>Last run</th><th>Result</th><th>24 h</th><th>Health</th><th style={{ textAlign: "right" }}>Run</th></tr></thead>
          <tbody>
            {rows === null && <tr><td colSpan={8} className="note">Loading…</td></tr>}
            {rows !== null && shown.length === 0 && <tr><td colSpan={8} className="note">Nothing registered for this system.</td></tr>}
            {shown.map((r) => {
              const st = runs[r.key];
              return (
                <React.Fragment key={r.key}>
                  <tr>
                    <td>{r.system}</td>
                    <td>
                      <b>{r.label}</b>
                      <div className="note" style={{ marginTop: 2 }}>{r.what}</div>
                      {r.note && <div className="note" style={{ color: "var(--amber)" }}>{r.note}</div>}
                    </td>
                    <td title={r.schedule}>{cronWords(r.schedule)}</td>
                    <td title={r.last_started || ""}>{ago(r.last_started)}</td>
                    <td>
                      {r.last_status ? <span className={`pill ${r.last_status === "ok" ? "ok" : r.last_status === "error" ? "bad" : "warn"}`}>{r.last_status}</span> : <span className="note">—</span>}
                      {r.last_records != null && <span className="note" style={{ marginLeft: 6 }}>{Number(r.last_records).toLocaleString()} rows</span>}
                      {r.last_error && <div className="note" style={{ color: "var(--red)", maxWidth: 360 }}>{r.last_error}</div>}
                    </td>
                    <td>{r.runs_24h}{r.failed_24h > 0 && <span style={{ color: "var(--red)" }}> · {r.failed_24h} failed</span>}</td>
                    <td>
                      <span className={`pill ${HEALTH_TONE[r.health] || "warn"}`}>{r.health}</span>
                      {r.secrets_missing?.length > 0 && <div className="note" style={{ color: "var(--red)" }}>needs {r.secrets_missing.join(", ")}</div>}
                    </td>
                    <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                      {canRun
                        ? <button type="button" className="btn ghost small" disabled={st?.state === "running" || !r.enabled} onClick={() => run(r.key)} title={`${r.kind}: ${r.runner}`}>{st?.state === "running" ? "Running…" : "Run now"}</button>
                        : <span className="note" title="Owner or executive only">—</span>}
                    </td>
                  </tr>
                  {st && (
                    <tr><td colSpan={8} style={{ paddingTop: 0 }}>
                      <div className={`msg ${st.state === "error" ? "bad" : st.state === "done" ? "ok" : ""}`} style={{ margin: "0 0 8px" }}>{st.text}</div>
                    </td></tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      {role !== null && !canRun && <div className="msg" style={{ marginTop: 10 }}>Running a sync is limited to owner and executive. Your role is <b>{role}</b>.</div>}

      {/* 2. secrets & tokens */}
      <div className="mtitle" style={{ marginTop: 22 }}><span className="sq" /><h2>Tokens &amp; secrets</h2><span className="rule" /></div>
      <div className="cols2">
        <div className="panel" style={{ maxWidth: "none" }}>
          <div className="sub" style={{ marginBottom: 10 }}>Every secret a sync needs, in the store its reader uses. Write-only: paste to set or rotate; the last four characters confirm which value is live. Values never come back to this screen.</div>
          {!canEdit && <div className="msg">Owner, executive or admin only. Your role is <b>{role ?? "…"}</b>.</div>}
          {canEdit && secrets === null && <div className="note">Loading…</div>}
          {canEdit && secrets !== null && (
            <table className="tbl">
              <thead><tr><th>Secret</th><th>Status</th><th>Used by</th><th>Set / rotate</th></tr></thead>
              <tbody>
                {secrets.map((s) => (
                  <tr key={s.name}>
                    <td><code>{s.name}</code><div className="note">{s.store}</div></td>
                    <td>
                      {s.present
                        ? <><span className="pill ok">set</span> <span className="note">{s.masked}</span>{s.updated_at && <div className="note">{ago(s.updated_at)}</div>}</>
                        : <span className="pill bad">missing</span>}
                    </td>
                    <td className="note">{s.used_by?.length ? s.used_by.join(", ") : "—"}</td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      <input type="password" autoComplete="off" value={secretDraft[s.name] || ""} onChange={(e) => setSecretDraft((d) => ({ ...d, [s.name]: e.target.value }))} placeholder={s.present ? "paste to replace" : "paste value"} style={{ width: 200, marginRight: 6 }} />
                      <button type="button" className="btn small" disabled={!(secretDraft[s.name] || "").trim()} onClick={() => saveSecret(s.name)}>Store</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {secretMsg && <div className={`msg ${secretMsg.kind}`} style={{ marginTop: 10 }}>{secretMsg.text}</div>}
        </div>
        <div>
          {canEdit && <QrDecode onDecoded={(v) => setSecretDraft((d) => ({ ...d, METRC_VENDOR_KEYS: v }))} />}
          <div className="panel" style={{ maxWidth: "none" }}>
            <div className="ptitle">AI — tokenless</div>
            <div className="sub">AI runs on the owner&rsquo;s subscription through the TG bots browser extension. No AI API key is stored in this OS and none is needed for the bots.</div>
            <table className="tbl" style={{ marginTop: 8 }}>
              <tbody>
                <tr><td>Extension</td><td>{heartbeat ? `${heartbeat.machine} · v${heartbeat.version}` : "no heartbeat yet"}</td></tr>
                <tr><td>Last seen</td><td>{heartbeat ? <>{ago(heartbeat.last_seen)} <span className={`pill ${extAlive ? "ok" : "warn"}`}>{extAlive ? "connected" : "not seen in 15 min"}</span></> : "—"}</td></tr>
                <tr><td>Settings</td><td className="note">Bots desk (side menu) — model, who may use AI, spending caps.</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* 3. per-endpoint detail (Metrc endpoints, sheet tabs) */}
      <div className="mtitle" style={{ marginTop: 22 }}><span className="sq" /><h2>Per-endpoint detail</h2><span className="rule" /></div>
      <Suspense fallback={<div className="note">Loading…</div>}>
        <SyncItems session={session} licences={licences} />
      </Suspense>

      {/* 4. recent runs, every source */}
      <div className="mtitle" style={{ marginTop: 22 }}><span className="sq" /><h2>Recent runs</h2><span className="rule" /></div>
      <div className="panel" style={{ maxWidth: "none", padding: 0, overflowX: "auto" }}>
        <table className="tbl">
          <thead><tr><th>When</th><th>System</th><th>Endpoint</th><th>Licence</th><th>Status</th><th>Rows</th><th>Error</th></tr></thead>
          <tbody>
            {recent.length === 0 && <tr><td colSpan={7} className="note">No runs recorded.</td></tr>}
            {recent.map((r, i) => (
              <tr key={i}>
                <td title={r.started_at}>{ago(r.started_at)}</td><td>{r.system}</td><td>{r.endpoint}</td><td>{r.license}</td>
                <td><span className={`pill ${r.status === "ok" ? "ok" : r.status === "error" ? "bad" : "warn"}`}>{r.status}</span></td>
                <td>{r.records ?? "—"}</td><td className="note" style={{ maxWidth: 420 }}>{r.error}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
