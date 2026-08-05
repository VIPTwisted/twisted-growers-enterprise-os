import React, { useEffect, useState, useCallback } from "react";
import jsQR from "jsqr";
import { supabase, FUNCTIONS_URL } from "./lib/supabase.js";

// Laws: every number live (2) · no fake data (3) · nothing hardwired (4) — theme included.

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

/* ---------- Icons (inline, no external assets) ---------- */
const I = {
  leaf: (
    <svg viewBox="0 0 24 24" fill="none" stroke="#04130a" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 21c-4.5-1.5-7-5-7-9.5C5 7 8 4 12 3c4 1 7 4 7 8.5 0 4.5-2.5 8-7 9.5Z" fill="#04130a" fillOpacity="0.15" />
      <path d="M12 21V9m0 4 3.5-2.5M12 16l-3.5-2.5" />
    </svg>
  ),
  gauge: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 15l4-6" /><path d="M20.6 13.5A8.6 8.6 0 1 0 3.4 13.5" /><circle cx="12" cy="15" r="1.6" fill="currentColor" />
    </svg>
  ),
  users: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9" cy="8" r="3.4" /><path d="M2.8 20c.8-3.2 3.3-5 6.2-5s5.4 1.8 6.2 5" /><circle cx="17" cy="9" r="2.6" /><path d="M15.4 14.6c2.6.2 4.6 1.8 5.4 4.4" />
    </svg>
  ),
  plug: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 7V3M15 7V3" /><path d="M6 7h12v4a6 6 0 0 1-12 0V7Z" /><path d="M12 17v4" />
    </svg>
  ),
  check: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 12.5 9.5 18 20 6.5" />
    </svg>
  ),
  sun: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="4.2" /><path d="M12 2.5v2.4M12 19.1v2.4M2.5 12h2.4M19.1 12h2.4M5 5l1.7 1.7M17.3 17.3 19 19M19 5l-1.7 1.7M6.7 17.3 5 19" />
    </svg>
  ),
  moon: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5Z" />
    </svg>
  ),
  out: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2v-2" /><path d="M9 12h11m0 0-3-3m3 3-3 3" />
    </svg>
  ),
  qr: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><path d="M14 14h3v3h-3zM20 14h1M14 20h1M20 20h1M17 20v1" />
    </svg>
  ),
  shield: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3 5 6v5c0 4.5 3 8 7 10 4-2 7-5.5 7-10V6l-7-3Z" /><path d="m9 12 2 2 4-4.5" />
    </svg>
  ),
  box: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3.5 8 12 4l8.5 4v8L12 20l-8.5-4V8Z" /><path d="M3.5 8 12 12m0 0 8.5-4M12 12v8" />
    </svg>
  ),
};

/* ---------- Theme ---------- */
function useTheme() {
  const [theme, setTheme] = useState(() => localStorage.getItem("tg-theme") || "dark");
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("tg-theme", theme);
  }, [theme]);
  return [theme, setTheme];
}

function useSession() {
  const [session, setSession] = useState(undefined);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);
  return session;
}

/* ---------- Auth ---------- */
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
    else if (mode === "signup") setMsg({ kind: "ok", text: "Account created. If email confirmation is on, check your inbox — then sign in." });
    setBusy(false);
  }

  return (
    <div className="auth-wrap">
      <div className="auth-brand">
        <div className="mark">{I.leaf}</div>
        <h2>Twisted Growers <em>Enterprise OS</em></h2>
        <div className="tag">One system for the entire operation — cultivation to cash, Metrc-verified, nothing hidden, nothing hardwired.</div>
        <div className="laws">
          <div className="law"><span className="tick">{I.check}</span> One system runs the whole company</div>
          <div className="law"><span className="tick">{I.check}</span> Every number computed live — never typed</div>
          <div className="law"><span className="tick">{I.check}</span> Real records only — no sample data, ever</div>
          <div className="law"><span className="tick">{I.check}</span> Fully configurable — zero code to operate</div>
        </div>
      </div>
      <div className="auth-form">
        <form className="panel" onSubmit={submit}>
          <h3>{mode === "signin" ? "Sign in" : "Create account"}</h3>
          <div className="hint">{mode === "signin" ? "Welcome back to the command center." : "The first account ever created becomes the owner."}</div>
          <label>Email</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
          <label>Password</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} autoComplete="current-password" />
          <button className="btn" disabled={busy}>{mode === "signin" ? "Sign in" : "Create account"}</button>
          <button type="button" className="btn ghost" style={{ marginLeft: 10 }}
            onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setMsg(null); }}>
            {mode === "signin" ? "First time? Create account" : "Have an account? Sign in"}
          </button>
          {msg && <div className={`msg ${msg.kind}`}>{msg.text}</div>}
          <div className="note">Accounts after the first start read-only until an owner assigns a role.</div>
        </form>
      </div>
    </div>
  );
}

/* ---------- Control Tower ---------- */
function ControlTower() {
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState(null);
  useEffect(() => {
    supabase.from("v_control_tower").select("*").then(({ data, error }) => {
      if (error) setErr(error.message); else setRows(data);
    });
  }, []);
  return (
    <>
      <div className="topbar">
        <div>
          <h1>Executive Control Tower</h1>
          <div className="sub">Every number is computed from live records at read time. Nothing on this board can be typed.</div>
        </div>
        <span className="live-dot">LIVE</span>
      </div>
      {err && <div className="empty"><div className="eicon">{I.shield}</div><b>Control Tower unavailable</b>{err}</div>}
      {!err && !rows && <div className="empty"><div className="eicon">{I.gauge}</div>Loading live metrics…</div>}
      {rows && (
        <div className="grid">
          {rows.map((r) => {
            const v = Number(r.value ?? 0);
            const isCash = r.metric === "days_since_cash_update";
            const hot = isCash ? v >= 7 : v > 0;
            return (
              <div key={r.metric} className={`card ${v === 0 && !isCash ? "ok zero" : hot ? "hot" : "ok"}`}>
                <div className="chip">{hot ? I.shield : I.gauge}</div>
                <div className="body">
                  <div className="metric">{METRIC_LABELS[r.metric] ?? r.metric}</div>
                  <div className="value">{isCash && v >= 999 ? "never" : v.toLocaleString()}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
      <div className="note" style={{ marginTop: 18 }}>
        Zeros before operating data is connected mean “no records yet”, not “all clear”. Connect Metrc and load operations to make this board speak.
      </div>
    </>
  );
}

/* ---------- QR decoder ---------- */
function QrDecode({ onDecoded }) {
  const [msg, setMsg] = useState(null);

  const decode = useCallback(async (blob) => {
    try {
      const bmp = await createImageBitmap(blob);
      const c = document.createElement("canvas");
      c.width = bmp.width; c.height = bmp.height;
      const x = c.getContext("2d");
      x.drawImage(bmp, 0, 0);
      const d = x.getImageData(0, 0, c.width, c.height);
      const hit = jsQR(d.data, d.width, d.height);
      if (hit && hit.data) {
        onDecoded(hit.data.trim());
        setMsg({ kind: "ok", text: "Square decoded — its hidden text is now in the vendor key field below. Review, then Store securely." });
      } else {
        setMsg({ kind: "err", text: "No readable square found. Snip tighter — include all four corners — and paste again." });
      }
    } catch {
      setMsg({ kind: "err", text: "That didn't look like an image. Snip with Win+Shift+S, then press Ctrl+V on this screen." });
    }
  }, [onDecoded]);

  useEffect(() => {
    const onPaste = (e) => {
      const item = [...(e.clipboardData?.items ?? [])].find((i) => i.type.startsWith("image/"));
      if (item) { e.preventDefault(); decode(item.getAsFile()); }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [decode]);

  return (
    <div className="panel feature" style={{ marginBottom: 16 }}>
      <div className="ptitle"><span className="pchip">{I.qr}</span> Square-code (QR) decoder</div>
      <div className="note" style={{ marginTop: 4 }}>
        Snip a QR square with <b>Win + Shift + S</b>, come back here, press <b>Ctrl + V</b>. Decoding happens
        entirely inside your browser — the image and its contents go nowhere else. Or{" "}
        <label style={{ display: "inline", color: "var(--neon)", cursor: "pointer", textDecoration: "underline", margin: 0, fontSize: "12.5px" }}>
          choose an image file
          <input type="file" accept="image/*" style={{ display: "none" }}
            onChange={(e) => e.target.files?.[0] && decode(e.target.files[0])} />
        </label>.
      </div>
      {msg && <div className={`msg ${msg.kind}`}>{msg.text}</div>}
    </div>
  );
}

/* ---------- Integrations ---------- */
function Integrations({ session }) {
  const [status, setStatus] = useState(null);
  const [form, setForm] = useState({ METRC_LICENSES: "", METRC_VENDOR_KEYS: "", METRC_USER_KEY: "", METRC_STATE: "" });
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
    setBusy(true); setMsg({ kind: "ok", text: "Sync started — pulling from Metrc, politely. First full pull can take several minutes." });
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
  const setPill = (name) => isSet(name) && <span className="pill ok" style={{ marginLeft: 8 }}>set ✓</span>;

  return (
    <>
      <div className="topbar">
        <div>
          <h1>Integrations</h1>
          <div className="sub">Credentials are configuration — stored server-side in your own database, write-only from here, rotatable anytime. Values are never shown back.</div>
        </div>
      </div>
      <QrDecode onDecoded={(v) => setForm((f) => ({ ...f, METRC_VENDOR_KEYS: v }))} />
      <form className="panel" onSubmit={save}>
        <div className="ptitle"><span className="pchip" style={{ background: "var(--neon-soft)", color: "var(--neon)" }}>{I.shield}</span> Metrc — Massachusetts</div>
        <label>Licenses (comma-separated, cultivation first) {setPill("METRC_LICENSES")}</label>
        <input value={form.METRC_LICENSES} onChange={(e) => setForm({ ...form, METRC_LICENSES: e.target.value })} placeholder={isSet("METRC_LICENSES") ? "•••••• stored — paste to replace" : "MC…, MP…"} />
        <label>Vendor / software key(s) {setPill("METRC_VENDOR_KEYS")}</label>
        <input value={form.METRC_VENDOR_KEYS} onChange={(e) => setForm({ ...form, METRC_VENDOR_KEYS: e.target.value })} placeholder={isSet("METRC_VENDOR_KEYS") ? "•••••• stored — paste to replace" : "from the Metrc Connect portal"} />
        <label>User key {setPill("METRC_USER_KEY")}</label>
        <input value={form.METRC_USER_KEY} onChange={(e) => setForm({ ...form, METRC_USER_KEY: e.target.value })} placeholder={isSet("METRC_USER_KEY") ? "•••••• stored — paste to replace" : "metrc.com → profile → API Keys"} />
        <label>State {setPill("METRC_STATE")}</label>
        <input value={form.METRC_STATE} onChange={(e) => setForm({ ...form, METRC_STATE: e.target.value })} placeholder="ma" />
        <button className="btn" disabled={busy}>Store securely</button>
        <button type="button" className="btn ghost" style={{ marginLeft: 10 }} disabled={busy} onClick={runSync}>
          Run Metrc sync now
        </button>
        {msg && <div className={`msg ${msg.kind}`}>{msg.text}</div>}
      </form>

      <div className="topbar" style={{ marginTop: 30, marginBottom: 8 }}><div><h1 style={{ fontSize: 17 }}>Recent sync runs</h1></div></div>
      {runs === null ? <div className="empty"><div className="eicon">{I.gauge}</div>Loading…</div> : runs.length === 0 ? (
        <div className="empty"><div className="eicon">{I.plug}</div><b>No sync runs yet</b>Store your Metrc credentials above, then run the first sync.</div>
      ) : (
        <div className="tablewrap">
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
                  <td style={{ color: "var(--red)", maxWidth: 320, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.error ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

/* ---------- People ---------- */
function People() {
  const [rows, setRows] = useState(null);
  useEffect(() => {
    supabase.from("employees").select("employee_code, full_name, status, tier").order("full_name")
      .then(({ data }) => setRows(data ?? []));
  }, []);
  return (
    <>
      <div className="topbar">
        <div>
          <h1>People</h1>
          <div className="sub">Roles, tiers, departments, and rates are assigned here — effective-dated and audited. Full editing lands next milestone.</div>
        </div>
      </div>
      {rows === null ? <div className="empty"><div className="eicon">{I.users}</div>Loading…</div> : rows.length === 0 ? (
        <div className="empty"><div className="eicon">{I.users}</div><b>No employees connected yet</b>The real roster loads from the v5 planner in milestone M2 — no sample people will ever appear here.</div>
      ) : (
        <div className="tablewrap">
          <table>
            <thead><tr><th>Code</th><th>Name</th><th>Status</th><th>Tier</th></tr></thead>
            <tbody>{rows.map((r) => (
              <tr key={r.employee_code}>
                <td>{r.employee_code}</td><td>{r.full_name}</td>
                <td><span className={`pill ${r.status === "active" ? "ok" : "dim"}`}>{r.status}</span></td>
                <td>{r.tier}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </>
  );
}

/* ---------- App shell ---------- */
export default function App() {
  const session = useSession();
  const [view, setView] = useState("tower");
  const [theme, setTheme] = useTheme();
  if (session === undefined) return null;
  if (!session) return <Auth />;
  const views = { tower: <ControlTower />, integrations: <Integrations session={session} />, people: <People /> };
  const email = session.user.email ?? "";
  return (
    <div className="shell">
      <nav className="nav">
        <div className="brand">
          <div className="mark">{I.leaf}</div>
          <div className="word">Twisted Growers<small>Enterprise OS</small></div>
        </div>
        <div className="section">Operations</div>
        <button className={`item ${view === "tower" ? "on" : ""}`} onClick={() => setView("tower")}>{I.gauge}<span className="lbl">Control Tower</span></button>
        <button className={`item ${view === "people" ? "on" : ""}`} onClick={() => setView("people")}>{I.users}<span className="lbl">People</span></button>
        <div className="section">System</div>
        <button className={`item ${view === "integrations" ? "on" : ""}`} onClick={() => setView("integrations")}>{I.plug}<span className="lbl">Integrations</span></button>
        <div className="foot">
          <div className="row">
            <div className="avatar">{(email[0] ?? "T").toUpperCase()}</div>
            <div className="who"><div className="em">{email}</div><div className="role">Signed in</div></div>
          </div>
          <div className="row">
            <button className="mini" onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
              {theme === "dark" ? I.sun : I.moon}<span className="lbl">{theme === "dark" ? "Light" : "Dark"}</span>
            </button>
            <button className="mini" onClick={() => supabase.auth.signOut()}>{I.out}<span className="lbl">Sign out</span></button>
          </div>
        </div>
      </nav>
      <main className="main">{views[view]}</main>
    </div>
  );
}
