import React, { useEffect, useState, useCallback } from "react";
import { supabase, FUNCTIONS_URL } from "./lib/supabase.js";

// Law #2: every number computed from live records. Law #3: no fake data — honest
// empty states only. Law #4: nothing hardwired — configuration lives in the database.

const METRIC_LABELS = {
  late_or_at_risk_orders: "Late / At-Risk Orders",
  unconfirmed_open_orders: "Unconfirmed Open Orders",
  testing_overdue: "Testing Overdue",
  lots_rts_missing_coa: "RTS Lots Missing COA",
  lots_expired_sellable: "Expired Lots in Sellable Status",
  pending_allocations: "Pending Allocations (Vincent)",
  blocked_work_orders: "Blocked Work Orders",
  harvest_mass_balance_exceptions: "Mass-Balance Exceptions",
  licenses_expiring_60d: "Licenses Expiring ≤60d",
  open_p0_actions: "Open P0 Actions",
  metrc_reconciliation_open: "Open Metrc Exceptions",
  days_since_cash_update: "Days Since Cash Update",
};

function useSession() {
  const [session, setSession] = useState(undefined);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);
  return session;
}

function Auth() {
  const [mode, setMode] = useState("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setMsg(null);
    const fn = mode === "signin"
      ? supabase.auth.signInWithPassword({ email, password })
      : supabase.auth.signUp({ email, password });
    const { error } = await fn;
    if (error) setMsg({ kind: "err", text: error.message });
    else if (mode === "signup") setMsg({ kind: "ok", text: "Account created. If email confirmation is on, check your inbox — otherwise sign in." });
    setBusy(false);
  }

  return (
    <div className="auth-wrap">
      <form className="panel" onSubmit={submit}>
        <div className="brand">Twisted Growers<small>Enterprise OS</small></div>
        <label>Email</label>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
        <label>Password</label>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} autoComplete="current-password" />
        <button className="btn" disabled={busy}>{mode === "signin" ? "Sign in" : "Create account"}</button>
        <button type="button" className="btn ghost" style={{ marginLeft: 10 }}
          onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setMsg(null); }}>
          {mode === "signin" ? "First account? Create it" : "Have an account? Sign in"}
        </button>
        {msg && <div className={`msg ${msg.kind}`}>{msg.text}</div>}
        <div className="note">The first account ever created becomes the owner. Every account after starts read-only until an owner assigns a role.</div>
      </form>
    </div>
  );
}

function ControlTower() {
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState(null);
  useEffect(() => {
    supabase.from("v_control_tower").select("*").then(({ data, error }) => {
      if (error) setErr(error.message); else setRows(data);
    });
  }, []);
  if (err) return <div className="empty"><b>Control Tower unavailable</b>{err}</div>;
  if (!rows) return <div className="empty">Loading live metrics…</div>;
  return (
    <>
      <h1>Executive Control Tower</h1>
      <div className="sub">Every number is computed from live records at read time. Nothing here can be typed.</div>
      <div className="grid">
        {rows.map((r) => {
          const v = Number(r.value ?? 0);
          const hot = v > 0 && r.metric !== "days_since_cash_update" ? v > 0 : v >= 7;
          return (
            <div key={r.metric} className={`card ${v === 0 ? "zero" : hot ? "hot" : ""}`}>
              <div className="metric">{METRIC_LABELS[r.metric] ?? r.metric}</div>
              <div className="value">{r.metric === "days_since_cash_update" && v >= 999 ? "never" : v.toLocaleString()}</div>
            </div>
          );
        })}
      </div>
      <div className="note" style={{ marginTop: 18 }}>
        Zeros with no operational records connected mean "no records yet", not "all clear" —
        connect Metrc and load operating data to make this board mean something.
      </div>
    </>
  );
}

function Integrations({ session }) {
  const [status, setStatus] = useState(null);
  const [form, setForm] = useState({ METRC_LICENSES: "", METRC_VENDOR_KEYS: "", METRC_USER_KEY: "", METRC_STATE: "ma" });
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const [runs, setRuns] = useState(null);

  const authHeaders = useCallback(() => ({
    "Content-Type": "application/json",
    Authorization: `Bearer ${session.access_token}`,
  }), [session]);

  const loadStatus = useCallback(async () => {
    const r = await fetch(`${FUNCTIONS_URL}/integration-settings`, { headers: authHeaders() });
    const j = await r.json();
    if (j.ok) setStatus(j.secrets);
    else setMsg({ kind: "err", text: j.error ?? "Could not load settings." });
  }, [authHeaders]);

  const loadRuns = useCallback(async () => {
    const { data } = await supabase.from("metrc_sync_runs")
      .select("endpoint, license, status, records, started_at, error")
      .order("id", { ascending: false }).limit(12);
    setRuns(data ?? []);
  }, []);

  useEffect(() => { loadStatus(); loadRuns(); }, [loadStatus, loadRuns]);

  async function save(e) {
    e.preventDefault();
    setBusy(true); setMsg(null);
    const secrets = Object.fromEntries(Object.entries(form).filter(([, v]) => v.trim() !== ""));
    const r = await fetch(`${FUNCTIONS_URL}/integration-settings`, {
      method: "POST", headers: authHeaders(), body: JSON.stringify({ secrets }),
    });
    const j = await r.json();
    if (j.ok) {
      setMsg({ kind: "ok", text: `Stored securely: ${j.stored.join(", ")}. Values never display again — re-paste to rotate.` });
      setForm({ METRC_LICENSES: "", METRC_VENDOR_KEYS: "", METRC_USER_KEY: "", METRC_STATE: "" });
      loadStatus();
    } else setMsg({ kind: "err", text: j.error ?? "Save failed." });
    setBusy(false);
  }

  async function runSync() {
    setBusy(true); setMsg({ kind: "ok", text: "Sync started — pulling from Metrc. This can take a few minutes on the first run." });
    try {
      const r = await fetch(`${FUNCTIONS_URL}/metrc-sync`, { method: "POST", headers: authHeaders() });
      const j = await r.json();
      setMsg(j.ok
        ? { kind: "ok", text: `Sync finished: ${Object.entries(j.results).map(([k, v]) => `${k} → ${v}`).join(" · ")}` }
        : { kind: "err", text: j.error ?? "Sync failed." });
    } catch (e) {
      setMsg({ kind: "err", text: String(e) });
    }
    loadRuns();
    setBusy(false);
  }

  const isSet = (name) => status?.some((s) => s.name === name);

  return (
    <>
      <h1>Integrations</h1>
      <div className="sub">Credentials are configuration — stored server-side in your own database, write-only from here, rotatable anytime. Values are never shown back.</div>
      <form className="panel" onSubmit={save}>
        <label>Metrc licenses (comma-separated, cultivation first) {isSet("METRC_LICENSES") && <span className="pill ok">set</span>}</label>
        <input value={form.METRC_LICENSES} onChange={(e) => setForm({ ...form, METRC_LICENSES: e.target.value })} placeholder={isSet("METRC_LICENSES") ? "•••••• (stored — paste to replace)" : "e.g. MC…, MP…"} />
        <label>Metrc vendor/software key(s) — same order as licenses {isSet("METRC_VENDOR_KEYS") && <span className="pill ok">set</span>}</label>
        <input value={form.METRC_VENDOR_KEYS} onChange={(e) => setForm({ ...form, METRC_VENDOR_KEYS: e.target.value })} placeholder={isSet("METRC_VENDOR_KEYS") ? "•••••• (stored — paste to replace)" : "one key, or two comma-separated"} />
        <label>Metrc user key (from your metrc.com profile → API Keys) {isSet("METRC_USER_KEY") && <span className="pill ok">set</span>}</label>
        <input value={form.METRC_USER_KEY} onChange={(e) => setForm({ ...form, METRC_USER_KEY: e.target.value })} placeholder={isSet("METRC_USER_KEY") ? "•••••• (stored — paste to replace)" : "generated in 60 seconds"} />
        <label>State {isSet("METRC_STATE") && <span className="pill ok">set</span>}</label>
        <input value={form.METRC_STATE} onChange={(e) => setForm({ ...form, METRC_STATE: e.target.value })} placeholder="ma" />
        <button className="btn" disabled={busy}>Store securely</button>
        <button type="button" className="btn ghost" style={{ marginLeft: 10 }} disabled={busy} onClick={runSync}>
          Run Metrc sync now
        </button>
        {msg && <div className={`msg ${msg.kind}`}>{msg.text}</div>}
      </form>

      <div className="section-title">Recent sync runs</div>
      {runs === null ? <div className="empty">Loading…</div> : runs.length === 0 ? (
        <div className="empty"><b>No sync runs yet</b>Store your Metrc credentials above, then run the first sync.</div>
      ) : (
        <table>
          <thead><tr><th>Started</th><th>License</th><th>Endpoint</th><th>Status</th><th>Records</th><th>Error</th></tr></thead>
          <tbody>
            {runs.map((r, i) => (
              <tr key={i}>
                <td>{new Date(r.started_at).toLocaleString()}</td>
                <td>{r.license}</td>
                <td>{r.endpoint}</td>
                <td><span className={`pill ${r.status === "ok" ? "ok" : r.status === "error" ? "err" : "run"}`}>{r.status}</span></td>
                <td>{r.records ?? ""}</td>
                <td style={{ color: "var(--crit)", maxWidth: 320, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.error ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}

function People() {
  const [rows, setRows] = useState(null);
  useEffect(() => {
    supabase.from("employees").select("employee_code, full_name, status, tier").order("full_name")
      .then(({ data }) => setRows(data ?? []));
  }, []);
  return (
    <>
      <h1>People</h1>
      <div className="sub">Roles, tiers, departments, and rates are assigned here — effective-dated and audited. Full editing lands in the next milestone.</div>
      {rows === null ? <div className="empty">Loading…</div> : rows.length === 0 ? (
        <div className="empty"><b>No employees connected yet</b>The roster loads from the v5 planner in milestone M2 — no sample people will ever appear here.</div>
      ) : (
        <table>
          <thead><tr><th>Code</th><th>Name</th><th>Status</th><th>Tier</th></tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.employee_code}><td>{r.employee_code}</td><td>{r.full_name}</td><td>{r.status}</td><td>{r.tier}</td></tr>
          ))}</tbody>
        </table>
      )}
    </>
  );
}

export default function App() {
  const session = useSession();
  const [view, setView] = useState("tower");
  if (session === undefined) return null;
  if (!session) return <Auth />;
  const views = { tower: <ControlTower />, integrations: <Integrations session={session} />, people: <People /> };
  return (
    <div className="shell">
      <nav className="nav">
        <div className="brand">Twisted Growers<small>Enterprise OS</small></div>
        <button className={view === "tower" ? "on" : ""} onClick={() => setView("tower")}>Control Tower</button>
        <button className={view === "people" ? "on" : ""} onClick={() => setView("people")}>People</button>
        <button className={view === "integrations" ? "on" : ""} onClick={() => setView("integrations")}>Integrations</button>
        <div className="foot">
          <div style={{ marginBottom: 6, overflow: "hidden", textOverflow: "ellipsis" }}>{session.user.email}</div>
          <button onClick={() => supabase.auth.signOut()}>Sign out</button>
        </div>
      </nav>
      <main className="main">{views[view]}</main>
    </div>
  );
}
