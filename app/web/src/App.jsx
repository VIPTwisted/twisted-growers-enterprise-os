import React, { useEffect, useState, useCallback } from "react";
import jsQR from "jsqr";
import { supabase, FUNCTIONS_URL } from "./lib/supabase.js";

// Laws: live numbers (2) · no fake data (3) · nothing hardwired (4) — navigation itself is DB rows.

/* ---------- Brand mark: hex TG ---------- */
const HexLogo = ({ size = 34 }) => (
  <svg className="hex" width={size} height={size} viewBox="0 0 100 100">
    <defs>
      <linearGradient id="hexg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#5cff92" /><stop offset="100%" stopColor="#0f9c48" />
      </linearGradient>
    </defs>
    <polygon points="50,4 90,27 90,73 50,96 10,73 10,27" fill="none" stroke="url(#hexg)" strokeWidth="7" strokeLinejoin="round" />
    <text x="50" y="63" textAnchor="middle" fontFamily="Space Grotesk, sans-serif" fontWeight="700" fontSize="38" fill="url(#hexg)" letterSpacing="-2">TG</text>
  </svg>
);

/* ---------- Icons ---------- */
const I = {
  gauge: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 15l4-6" /><path d="M20.6 13.5A8.6 8.6 0 1 0 3.4 13.5" /><circle cx="12" cy="15" r="1.6" fill="currentColor" /></svg>),
  users: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="8" r="3.4" /><path d="M2.8 20c.8-3.2 3.3-5 6.2-5s5.4 1.8 6.2 5" /><circle cx="17" cy="9" r="2.6" /><path d="M15.4 14.6c2.6.2 4.6 1.8 5.4 4.4" /></svg>),
  plug: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 7V3M15 7V3" /><path d="M6 7h12v4a6 6 0 0 1-12 0V7Z" /><path d="M12 17v4" /></svg>),
  check: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12.5 9.5 18 20 6.5" /></svg>),
  out: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2v-2" /><path d="M9 12h11m0 0-3-3m3 3-3 3" /></svg>),
  qr: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><path d="M14 14h3v3h-3zM20 14h1M14 20h1M20 20h1M17 20v1" /></svg>),
  shield: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3 5 6v5c0 4.5 3 8 7 10 4-2 7-5.5 7-10V6l-7-3Z" /><path d="m9 12 2 2 4-4.5" /></svg>),
  box: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3.5 8 12 4l8.5 4v8L12 20l-8.5-4V8Z" /><path d="M3.5 8 12 12m0 0 8.5-4M12 12v8" /></svg>),
  truck: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 7h11v9H2zM13 10h4l3 3v3h-7" /><circle cx="6.5" cy="17.5" r="1.8" /><circle cx="16.5" cy="17.5" r="1.8" /></svg>),
  clip: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="6" y="4" width="12" height="17" rx="1" /><path d="M9 4a3 3 0 0 1 6 0M9.5 10.5h5M9.5 14h5M9.5 17.5h3" /></svg>),
  flask: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 3h4M11 3v6l-5.5 9a2 2 0 0 0 1.7 3h9.6a2 2 0 0 0 1.7-3L13 9V3" /><path d="M8.5 15h7" /></svg>),
  clock: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></svg>),
  dollar: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v18M16.5 7.5c0-1.7-2-3-4.5-3s-4.5 1.3-4.5 3 1.6 2.6 4.5 3.2c2.9.6 4.5 1.6 4.5 3.3 0 1.7-2 3-4.5 3s-4.5-1.3-4.5-3" /></svg>),
  gear: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3.2" /><path d="M12 2.8v2.6M12 18.6v2.6M2.8 12h2.6M18.6 12h2.6M5 5l1.8 1.8M17.2 17.2 19 19M19 5l-1.8 1.8M6.8 17.2 5 19" /></svg>),
  sun: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="4.2" /><path d="M12 2.5v2.4M12 19.1v2.4M2.5 12h2.4M19.1 12h2.4M5 5l1.7 1.7M17.3 17.3 19 19M19 5l-1.7 1.7M6.7 17.3 5 19" /></svg>),
  moon: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 14.5A8.5 8.5 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5Z" /></svg>),
  leafline: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 21c-4.5-1.5-7-5-7-9.5C5 7 8 4 12 3c4 1 7 4 7 8.5 0 4.5-2.5 8-7 9.5Z" /><path d="M12 21V9" /></svg>),
  scale: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v18M4 21h16M7 6h10M5 6 3 12a3.5 3.5 0 0 0 7 0L8 6M19 6l-2 6a3.5 3.5 0 0 0 7 0l-2-6" transform="scale(0.85) translate(2 1)" /></svg>),
  dna: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 3c0 6 12 6 12 12M18 3c0 6-12 6-12 12M6 15c0 3 2 6 6 6M18 15c0 3-2 6-6 6M8 7h8M8 11h8" /></svg>),
  help: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="8.5" /><path d="M9.5 9.2a2.6 2.6 0 0 1 5.1.7c0 1.7-2.4 2.2-2.4 3.6" /><circle cx="12" cy="17" r="0.4" fill="currentColor" /></svg>),
  burger: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 7h16M4 12h16M4 17h16" /></svg>),
  bell: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 9a6 6 0 1 0-12 0c0 6-2.5 7-2.5 7h17S18 15 18 9" /><path d="M10 20a2.2 2.2 0 0 0 4 0" /></svg>),
  mail: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="14" rx="1.5" /><path d="m3.5 7 8.5 6 8.5-6" /></svg>),
  caret: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="m9 6 6 6-6 6" /></svg>),
};
const iconByName = (n) => I[n] ?? I.gauge;

/* ---------- Control Tower metadata: compliance first, drill targets ---------- */
const METRIC_GROUPS = [
  {
    title: "Compliance & Testing",
    items: {
      testing_overdue: { label: "Testing Overdue", icon: I.flask, drill: "testing" },
      lots_rts_missing_coa: { label: "RTS Lots Missing COA", icon: I.shield, drill: "lots" },
      licenses_expiring_60d: { label: "Licenses Expiring ≤60d", icon: I.clock, drill: "licenses" },
      metrc_reconciliation_open: { label: "Open Metrc Exceptions", icon: I.plug, drill: "metrc_mirror" },
    },
  },
  {
    title: "Materials & Production",
    items: {
      harvest_mass_balance_exceptions: { label: "Mass-Balance Exceptions", icon: I.scale, drill: "harvests" },
      lots_expired_sellable: { label: "Expired Lots in Sellable Status", icon: I.box, drill: "lots" },
      pending_allocations: { label: "Pending Allocations", icon: I.users, drill: "allocations" },
      blocked_work_orders: { label: "Blocked Work Orders", icon: I.gauge, drill: "work_orders" },
    },
  },
  {
    title: "Cash & Finance",
    items: {
      days_since_cash_update: { label: "Days Since Cash Update", icon: I.dollar, cash: true, drill: "cash" },
    },
  },
  {
    title: "Commitments & Service",
    items: {
      late_or_at_risk_orders: { label: "Late / At-Risk Orders", icon: I.truck, drill: "orders" },
      unconfirmed_open_orders: { label: "Unconfirmed Open Orders", icon: I.clip, drill: "orders" },
      open_p0_actions: { label: "Open P0 Actions", icon: I.shield, drill: "audit" },
    },
  },
];

/* ---------- Hooks ---------- */
function useSession() {
  const [session, setSession] = useState(undefined);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);
  return session;
}

function usePrefs(session) {
  const [theme, setThemeState] = useState(() => localStorage.getItem("tg-theme") || "dark");
  const [collapsed, setCollapsedState] = useState(() => localStorage.getItem("tg-nav") === "1");
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("tg-theme", theme);
  }, [theme]);
  useEffect(() => { localStorage.setItem("tg-nav", collapsed ? "1" : "0"); }, [collapsed]);
  useEffect(() => {
    if (!session) return;
    supabase.from("user_settings").select("theme, sidebar_collapsed").eq("user_id", session.user.id).maybeSingle()
      .then(({ data }) => {
        if (data?.theme) setThemeState(data.theme);
        if (typeof data?.sidebar_collapsed === "boolean") setCollapsedState(data.sidebar_collapsed);
      });
  }, [session]);
  const persist = useCallback((patch) => {
    if (session) supabase.from("user_settings").upsert({ user_id: session.user.id, ...patch, updated_at: new Date().toISOString() }).then(() => {});
  }, [session]);
  const setTheme = useCallback((t) => { setThemeState(t); persist({ theme: t }); }, [persist]);
  const setCollapsed = useCallback((c) => { setCollapsedState(c); persist({ sidebar_collapsed: c }); }, [persist]);
  const [navWidth, setNavWidthState] = useState(() => Number(localStorage.getItem("tg-navw")) || 246);
  useEffect(() => { localStorage.setItem("tg-navw", String(navWidth)); }, [navWidth]);
  useEffect(() => {
    if (!session) return;
    supabase.from("user_settings").select("sidebar_width").eq("user_id", session.user.id).maybeSingle()
      .then(({ data }) => { if (data?.sidebar_width) setNavWidthState(data.sidebar_width); });
  }, [session]);
  const setNavWidthLive = useCallback((w) => setNavWidthState(Math.min(380, Math.max(170, w))), []);
  const commitNavWidth = useCallback((w) => persist({ sidebar_width: Math.min(380, Math.max(170, Math.round(w))) }), [persist]);
  return { theme, setTheme, collapsed, setCollapsed, navWidth, setNavWidthLive, commitNavWidth };
}

function useNav(version) {
  const [nav, setNav] = useState(null);
  useEffect(() => {
    supabase.from("nav_registry").select("*").eq("enabled", true)
      .order("category_order").order("item_order")
      .then(({ data }) => setNav(data ?? []));
  }, [version]);
  return nav;
}

/* ---------- Menu Manager: admin shows/hides any item for all users, instantly ---------- */
function MenuManager({ onChanged }) {
  const [rows, setRows] = useState(null);
  const [msg, setMsg] = useState(null);
  const load = useCallback(() => {
    supabase.from("nav_registry").select("*")
      .order("category_order").order("item_order")
      .then(({ data }) => setRows(data ?? []));
  }, []);
  useEffect(() => { load(); }, [load]);
  async function toggle(row) {
    const { error } = await supabase.from("nav_registry")
      .update({ enabled: !row.enabled }).eq("id", row.id);
    if (error) setMsg({ kind: "err", text: `Not permitted: ${error.message}` });
    else { setMsg({ kind: "ok", text: `“${row.label}” is now ${row.enabled ? "hidden from" : "visible to"} all users.` }); load(); onChanged(); }
  }
  const cats = [];
  for (const e of rows ?? []) {
    let c = cats.find((x) => x.name === e.category);
    if (!c) { c = { name: e.category, items: [] }; cats.push(c); }
    c.items.push(e);
  }
  return (
    <>
      <div className="pagehead">
        <div>
          <h1>Menu Manager</h1>
          <div className="sub">Show, hide, or deactivate any menu item for every user — instantly, no code. Admin-only: the database refuses changes from non-executives.</div>
        </div>
      </div>
      {msg && <div className={`msg ${msg.kind}`} style={{ maxWidth: 640 }}>{msg.text}</div>}
      {rows === null ? <div className="empty"><div className="eicon">{I.gear}</div>Loading…</div> : (
        <div className="cols2">
          {cats.map((c) => (
            <div key={c.name} className="msection" style={{ marginTop: 0 }}>
              <div className="mtitle"><span className="catdot" style={{ background: c.items[0]?.color }} /><h2>{c.name}</h2><span className="rule" /></div>
              <div className="tablewrap" style={{ marginTop: 0 }}>
                <table>
                  <tbody>
                    {c.items.map((r) => (
                      <tr key={r.id}>
                        <td style={{ width: "60%" }}>{r.label}</td>
                        <td><span className={`pill ${r.enabled ? "ok" : "dim"}`}>{r.enabled ? "visible" : "hidden"}</span></td>
                        <td style={{ textAlign: "right" }}>
                          <button className="btn ghost" style={{ margin: 0, padding: "5px 12px", fontSize: 12 }} onClick={() => toggle(r)}>
                            {r.enabled ? "Hide" : "Show"}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function useSyncSummary() {
  const [sum, setSum] = useState(null);
  useEffect(() => {
    supabase.from("metrc_sync_runs")
      .select("status, records, finished_at")
      .order("id", { ascending: false }).limit(80)
      .then(({ data }) => {
        const runs = data ?? [];
        const lastOk = runs.find((r) => r.status === "ok" && r.finished_at);
        const totalRecords = runs.filter((r) => r.status === "ok").reduce((a, r) => a + (r.records ?? 0), 0);
        setSum({ connected: !!lastOk, lastOkAt: lastOk?.finished_at ?? null, totalRecords });
      });
  }, []);
  return sum;
}

const timeAgo = (iso) => {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 90) return "just now";
  if (s < 5400) return `${Math.round(s / 60)}m ago`;
  if (s < 129600) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
};

/* ---------- Error boundary: one module fails, the OS keeps breathing ---------- */
class Boundary extends React.Component {
  constructor(p) { super(p); this.state = { err: null }; }
  static getDerivedStateFromError(err) { return { err }; }
  componentDidUpdate(prev) { if (prev.resetKey !== this.props.resetKey && this.state.err) this.setState({ err: null }); }
  render() {
    if (this.state.err) {
      return (
        <div className="boundary">
          <b>This section hit an error — the rest of the OS is unaffected.</b>
          <div className="note">{String(this.state.err)}</div>
          <button className="btn ghost" style={{ marginTop: 12 }} onClick={() => this.setState({ err: null })}>Retry section</button>
        </div>
      );
    }
    return this.props.children;
  }
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
        <img src="/tg-logo.png" alt="Twisted Growers" style={{ width: 150, marginBottom: 26 }} />
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
          <button type="button" className="btn ghost" style={{ marginLeft: 10 }} onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setMsg(null); }}>
            {mode === "signin" ? "First time? Create account" : "Have an account? Sign in"}
          </button>
          {msg && <div className={`msg ${msg.kind}`}>{msg.text}</div>}
          <div className="note">Accounts after the first start read-only until an owner assigns a role.</div>
        </form>
      </div>
    </div>
  );
}

/* ---------- Raw record inspector (microscopic drill-down) ---------- */
function RawRow({ row, cols }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <tr onClick={() => setOpen(!open)} style={{ cursor: "pointer" }}>
        {cols.map((c) => <td key={c}>{formatCell(row[c])}</td>)}
      </tr>
      {open && (
        <tr>
          <td colSpan={cols.length} style={{ whiteSpace: "pre-wrap", fontFamily: "ui-monospace, monospace", fontSize: 11.5, background: "var(--surface-2)", maxWidth: 0 }}>
            {JSON.stringify(row, null, 2)}
          </td>
        </tr>
      )}
    </>
  );
}
const formatCell = (v) => {
  if (v == null || v === "") return "—";
  if (typeof v === "object") return "{…}";
  const s = String(v);
  return s.length > 42 ? s.slice(0, 42) + "…" : s;
};

/* ---------- Generic dynamic module (registry-driven, drill-down built in) ---------- */
function ModuleScreen({ entry }) {
  const [count, setCount] = useState(null);
  const [rows, setRows] = useState(null);
  useEffect(() => {
    setCount(null); setRows(null);
    if (!entry.table_ref) return;
    supabase.from(entry.table_ref).select("*", { count: "exact", head: true })
      .then(({ count: c }) => setCount(c ?? 0));
    supabase.from(entry.table_ref).select("*").limit(20)
      .then(({ data }) => setRows(data ?? []));
  }, [entry.view_key, entry.table_ref]);

  const cols = rows?.length
    ? Object.keys(rows[0]).filter((k) => k !== "raw" && typeof rows[0][k] !== "object").slice(0, 8)
    : [];

  return (
    <>
      <div className="pagehead">
        <div>
          <h1>{entry.label}</h1>
          <div className="sub">{entry.description}</div>
        </div>
        {entry.milestone && <span className="pill gold">data loads {entry.milestone}</span>}
      </div>
      <div className="modhead">
        <div className="mchip">{iconByName(entry.icon)}</div>
        <div>
          <div className="mt">{entry.label}</div>
          <div className="md">Live table: {entry.table_ref ?? "—"} · click any row for the complete raw record</div>
        </div>
        <div className="mcount">
          <div className="n">{count === null ? "…" : count.toLocaleString()}</div>
          <div className="l">records</div>
        </div>
      </div>
      {rows === null ? (
        <div className="empty"><div className="eicon">{I.gauge}</div>Loading…</div>
      ) : rows.length === 0 ? (
        <div className="empty">
          <div className="eicon">{iconByName(entry.icon)}</div>
          <b>No records connected yet</b>
          {entry.milestone ? `The structure is live and waiting — real data loads in ${entry.milestone}. No samples will ever appear here.` : "Records appear here the moment they exist."}
        </div>
      ) : (
        <div className="tablewrap">
          <table>
            <thead><tr>{cols.map((c) => <th key={c}>{c.replaceAll("_", " ")}</th>)}</tr></thead>
            <tbody>{rows.map((r, i) => <RawRow key={i} row={r} cols={cols} />)}</tbody>
          </table>
        </div>
      )}
    </>
  );
}

/* ---------- Metrc Mirror: the full state picture, fully wired ---------- */
const MIRROR_SETS = [
  { key: "metrc_packages", label: "Packages" },
  { key: "metrc_plants", label: "Plants" },
  { key: "metrc_harvests", label: "Harvests" },
  { key: "metrc_plant_batches", label: "Plant Batches" },
  { key: "metrc_transfers", label: "Transfers" },
  { key: "metrc_items", label: "Items" },
  { key: "metrc_strains", label: "Strains" },
  { key: "metrc_locations", label: "Locations" },
  { key: "metrc_sales", label: "Sales" },
];
function MetrcMirror() {
  const [counts, setCounts] = useState({});
  const [tab, setTab] = useState(MIRROR_SETS[0].key);
  const [rows, setRows] = useState(null);
  useEffect(() => {
    MIRROR_SETS.forEach((s) => {
      supabase.from(s.key).select("*", { count: "exact", head: true })
        .then(({ count }) => setCounts((c) => ({ ...c, [s.key]: count ?? 0 })));
    });
  }, []);
  useEffect(() => {
    setRows(null);
    supabase.from(tab).select("*").order("id", { ascending: false }).limit(25)
      .then(({ data }) => setRows(data ?? []));
  }, [tab]);
  const cols = rows?.length
    ? Object.keys(rows[0]).filter((k) => k !== "raw" && typeof rows[0][k] !== "object").slice(0, 8)
    : [];
  return (
    <>
      <div className="pagehead">
        <div>
          <h1>Metrc Mirror</h1>
          <div className="sub">Your complete state-system picture, synced into your own database. Every row expands to the full raw Metrc payload — microscopic auditing, one click deep.</div>
        </div>
      </div>
      <div className="tabs">
        {MIRROR_SETS.map((s) => (
          <button key={s.key} className={tab === s.key ? "on" : ""} onClick={() => setTab(s.key)}>
            {s.label}<span className="cnt">{counts[s.key] ?? "…"}</span>
          </button>
        ))}
      </div>
      {rows === null ? (
        <div className="empty"><div className="eicon">{I.plug}</div>Loading…</div>
      ) : rows.length === 0 ? (
        <div className="empty"><div className="eicon">{I.plug}</div><b>Nothing synced into this set yet</b>Run the Metrc sync on the Integrations screen — records land here the moment Metrc answers.</div>
      ) : (
        <div className="tablewrap">
          <table>
            <thead><tr>{cols.map((c) => <th key={c}>{c.replaceAll("_", " ")}</th>)}</tr></thead>
            <tbody>{rows.map((r, i) => <RawRow key={i} row={r} cols={cols} />)}</tbody>
          </table>
        </div>
      )}
    </>
  );
}

/* ---------- Live data KPIs (real counts only) ---------- */
const KPI_TABLES = [
  ["metrc_packages", "Metrc Packages", "#00d4ff"],
  ["metrc_plants", "Metrc Plants", "#5cff92"],
  ["metrc_harvests", "Metrc Harvests", "#b366ff"],
  ["metrc_transfers", "Transfers", "#ffea00"],
  ["lots", "Lots", "#ff8a00"],
  ["employees", "Employees", "#ff2e9e"],
];
function useLiveCounts() {
  const [c, setC] = useState(null);
  useEffect(() => {
    Promise.all(KPI_TABLES.map(([t]) =>
      supabase.from(t).select("*", { count: "exact", head: true }).then(({ count }) => count ?? 0)
    )).then((counts) => setC(KPI_TABLES.map(([t, l, col], i) => ({ t, l, col, n: counts[i] }))));
  }, []);
  return c;
}

/* ---------- Control Tower ---------- */
function ControlTower({ go }) {
  const kpis = useLiveCounts();
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState(null);
  const sync = useSyncSummary();
  useEffect(() => {
    supabase.from("v_control_tower").select("*").then(({ data, error }) => {
      if (error) setErr(error.message); else setRows(data);
    });
  }, []);
  const byMetric = Object.fromEntries((rows ?? []).map((r) => [r.metric, Number(r.value ?? 0)]));
  const cashDays = byMetric.days_since_cash_update ?? 999;
  const alertCount = (rows ?? []).reduce((n, r) => {
    const v = Number(r.value ?? 0);
    if (r.metric === "days_since_cash_update") return n + (v >= 7 ? 1 : 0);
    return n + (v > 0 ? 1 : 0);
  }, 0);
  const calm = alertCount === 0;
  return (
    <>
      <div className="pagehead">
        <div>
          <h1>Executive Control Tower</h1>
          <div className="sub">Every number is computed from live records at read time — and every card drills straight into its source module.</div>
        </div>
      </div>
      {rows && (
        <div className="hero">
          <div className="pulse">
            <div className={`ring ${calm ? "calm" : "alert"}`}>{calm ? I.check : I.shield}</div>
            <div>
              <div className="pt">Operational status</div>
              <div className={`pv ${calm ? "calm" : "alert"}`}>{calm ? "ALL CLEAR" : `${alertCount} ALERT${alertCount > 1 ? "S" : ""}`}</div>
            </div>
          </div>
          <div className="stats">
            <div className="stat"><div className="sl">Metrc link</div><div className="sv">{sync == null ? "…" : sync.connected ? <span className="u">CONNECTED</span> : <small>not connected</small>}</div></div>
            <div className="stat"><div className="sl">Last sync</div><div className="sv">{sync == null ? "…" : sync.lastOkAt ? timeAgo(sync.lastOkAt) : <small>never</small>}</div></div>
            <div className="stat"><div className="sl">Records synced</div><div className="sv">{sync == null ? "…" : sync.totalRecords.toLocaleString()}</div></div>
            <div className="stat"><div className="sl">Cash data age</div><div className="sv">{cashDays >= 999 ? <small>never updated</small> : `${cashDays}d`}</div></div>
          </div>
        </div>
      )}
      {kpis && (
        <div className="msection" style={{ marginTop: 0 }}>
          <div className="mtitle"><span className="sq" /><h2>Live Data KPIs</h2><span className="rule" /></div>
          <div className="grid">
            {kpis.map((k) => (
              <div key={k.t} className="card ok" style={{ borderLeftColor: k.col }}>
                <div className="chip" style={{ background: `${k.col}22`, color: k.col }}>{I.gauge}</div>
                <div className="body">
                  <div className="metric">{k.l}</div>
                  <div className="vrow"><div className="value">{k.n.toLocaleString()}</div><div className="state" style={{ color: k.col }}>records</div></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {err && <div className="empty"><div className="eicon">{I.shield}</div><b>Control Tower unavailable</b>{err}</div>}
      {!err && !rows && <div className="empty"><div className="eicon">{I.gauge}</div>Loading live metrics…</div>}
      {rows && METRIC_GROUPS.map((g) => (
        <div className="msection" key={g.title}>
          <div className="mtitle"><span className="sq" /><h2>{g.title}</h2><span className="rule" /></div>
          <div className="grid">
            {Object.entries(g.items).map(([key, meta]) => {
              const v = byMetric[key] ?? 0;
              const isCash = !!meta.cash;
              const hot = isCash ? v >= 7 : v > 0;
              const zero = !hot && v === 0 && !isCash;
              return (
                <div key={key} className={`card ${hot ? "hot" : zero ? "ok zero" : "ok"}`}
                  onClick={() => meta.drill && go(meta.drill)} style={{ cursor: meta.drill ? "pointer" : "default" }}
                  title={meta.drill ? "Open source module" : undefined}>
                  <div className="chip">{meta.icon}</div>
                  <div className="body">
                    <div className="metric">{meta.label}</div>
                    <div className="vrow">
                      <div className="value">{isCash && v >= 999 ? "—" : v.toLocaleString()}</div>
                      <div className="state">{hot ? "action" : "clear"}</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
      {rows && <div className="note" style={{ marginTop: 18 }}>Zeros before operating data is connected mean “no records yet”, not “all clear”. Connect Metrc and load operations to make this board speak.</div>}
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
      <div className="ptitle"><span className="pchip" style={{ background: "var(--violet-soft)", color: "var(--violet)" }}>{I.qr}</span> Square-code (QR) decoder</div>
      <div className="note" style={{ marginTop: 4 }}>
        Snip a QR square with <b>Win + Shift + S</b>, come back here, press <b>Ctrl + V</b>. Decoding happens entirely inside your browser. Or{" "}
        <label style={{ display: "inline", color: "var(--neon)", cursor: "pointer", textDecoration: "underline", margin: 0, fontSize: "12px" }}>
          choose an image file
          <input type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => e.target.files?.[0] && decode(e.target.files[0])} />
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
      .order("id", { ascending: false }).limit(14);
    setRuns(data ?? []);
  }, []);
  useEffect(() => { loadStatus(); loadRuns(); }, [loadStatus, loadRuns]);
  async function save(e) {
    e.preventDefault();
    setBusy(true); setMsg(null);
    const secrets = Object.fromEntries(Object.entries(form).filter(([, v]) => v.trim() !== ""));
    const r = await fetch(`${FUNCTIONS_URL}/integration-settings`, { method: "POST", headers: authHeaders(), body: JSON.stringify({ secrets }) });
    const j = await r.json();
    if (j.ok) {
      setMsg({ kind: "ok", text: `Stored securely: ${j.stored.join(", ")}. Values never display again — re-paste to rotate.` });
      setForm({ METRC_LICENSES: "", METRC_VENDOR_KEYS: "", METRC_USER_KEY: "", METRC_STATE: "" });
      loadStatus();
    } else setMsg({ kind: "err", text: j.error ?? "Save failed." });
    setBusy(false);
  }
  async function runSync() {
    setBusy(true); setMsg({ kind: "ok", text: "Sync started — pulling the full Metrc catalog, politely. First full pull can take several minutes." });
    try {
      const r = await fetch(`${FUNCTIONS_URL}/metrc-sync`, { method: "POST", headers: authHeaders() });
      const j = await r.json();
      setMsg(j.ok
        ? { kind: "ok", text: `Sync finished: ${Object.entries(j.results).map(([k, v]) => `${k} → ${v}`).join(" · ")}` }
        : { kind: "err", text: j.error ?? "Sync failed." });
    } catch (e) { setMsg({ kind: "err", text: String(e) }); }
    loadRuns();
    setBusy(false);
  }
  const isSet = (name) => status?.some((s) => s.name === name);
  const setPill = (name) => isSet(name) && <span className="pill ok" style={{ marginLeft: 8 }}>set ✓</span>;
  return (
    <>
      <div className="pagehead">
        <div>
          <h1>Integrations</h1>
          <div className="sub">Credentials are configuration — stored server-side in your own database, write-only from here, rotatable anytime. Values are never shown back.</div>
        </div>
      </div>
      <div className="cols2">
        <div>
          <QrDecode onDecoded={(v) => setForm((f) => ({ ...f, METRC_VENDOR_KEYS: v }))} />
          <form className="panel" onSubmit={save} style={{ maxWidth: "none" }}>
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
            <button type="button" className="btn ghost" style={{ marginLeft: 10 }} disabled={busy} onClick={runSync}>Run Metrc sync now</button>
            {msg && <div className={`msg ${msg.kind}`}>{msg.text}</div>}
          </form>
        </div>
        <div>
          <div className="msection" style={{ marginTop: 0 }}>
            <div className="mtitle"><span className="sq" /><h2>Recent sync runs</h2><span className="rule" /></div>
            {runs === null ? <div className="empty"><div className="eicon">{I.gauge}</div>Loading…</div> : runs.length === 0 ? (
              <div className="empty"><div className="eicon">{I.plug}</div><b>No sync runs yet</b>Store your Metrc credentials, then run the first sync.</div>
            ) : (
              <div className="tablewrap" style={{ marginTop: 0 }}>
                <table>
                  <thead><tr><th>Started</th><th>License</th><th>Endpoint</th><th>Status</th><th>Records</th></tr></thead>
                  <tbody>
                    {runs.map((r, i) => (
                      <tr key={i} title={r.error ?? ""}>
                        <td>{new Date(r.started_at).toLocaleTimeString()}</td>
                        <td>{r.license}</td>
                        <td>{r.endpoint}</td>
                        <td><span className={`pill ${r.status === "ok" ? "ok" : r.status === "error" ? "err" : "run"}`}>{r.status}</span></td>
                        <td>{r.records ?? ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

/* ---------- Settings ---------- */
function Settings({ session, prefs }) {
  const { theme, setTheme } = prefs;
  return (
    <>
      <div className="pagehead">
        <div>
          <h1>Settings</h1>
          <div className="sub">Your personal preferences — saved to your account, applied on every device you sign into.</div>
        </div>
      </div>
      <div className="cols2">
        <div className="msection" style={{ marginTop: 0 }}>
          <div className="mtitle"><span className="sq" /><h2>Appearance</h2><span className="rule" /></div>
          <div className="panel" style={{ maxWidth: "none" }}>
            <div className="themegrid">
              <button type="button" className={`themeopt ${theme === "dark" ? "on" : ""}`} onClick={() => setTheme("dark")}>
                <div className="swatch dark"><span className="sw-dot" /><span className="sw-bar" /><span className="sw-bar short" /></div>
                <div className="tlabel">{I.moon} Dark <span className="tsub">Brand default</span></div>
                {theme === "dark" && <span className="pill ok">active</span>}
              </button>
              <button type="button" className={`themeopt ${theme === "light" ? "on" : ""}`} onClick={() => setTheme("light")}>
                <div className="swatch light"><span className="sw-dot" /><span className="sw-bar" /><span className="sw-bar short" /></div>
                <div className="tlabel">{I.sun} Light <span className="tsub">High-key workspace</span></div>
                {theme === "light" && <span className="pill ok">active</span>}
              </button>
            </div>
            <div className="note">Saved to your account instantly. The rail and top bar stay black in both — that's the brand.</div>
          </div>
        </div>
        <div className="msection" style={{ marginTop: 0 }}>
          <div className="mtitle"><span className="sq" /><h2>Account</h2><span className="rule" /></div>
          <div className="panel" style={{ maxWidth: "none" }}>
            <div className="ptitle"><span className="pchip" style={{ background: "var(--gold-soft)", color: "var(--gold)" }}>{I.users}</span> {session.user.email}</div>
            <div className="note">Role management (owner-assigned), per-employee links, and security options arrive with the People milestone.</div>
            <button className="btn ghost" onClick={() => supabase.auth.signOut()} style={{ marginTop: 12 }}>Sign out</button>
          </div>
        </div>
      </div>
    </>
  );
}

/* ---------- Help & Support ---------- */
const HELP = [
  ["Signing in & accounts", "The first account ever created is the owner. Everyone after starts read-only until the owner assigns a role (role screens arrive with the People milestone). Email confirmation may land on a plain white page — the confirmation still works; just return to the site and sign in."],
  ["Storing Metrc credentials", "Integrations → paste licenses, the software key (from the Metrc Connect portal), and your user key (metrc.com → profile icon → API Keys). Values are write-only: stored server-side, never displayed again. Re-paste any field to rotate it."],
  ["Running a Metrc sync", "Integrations → Run Metrc sync now. The worker authenticates, verifies which licenses your key can see, and pulls the full catalog politely (Massachusetts caps pages at 20 records). First pull is big; after that only changes sync. Results appear in the run log and in the Metrc Mirror."],
  ["Reading the Control Tower", "Every card is computed live from the database — nothing can be typed into it. Red means action required; dim zero means no records connected yet. Click any card to drill into its source module."],
  ["Drilling into records", "In the Metrc Mirror and every module screen, click any row to expand the complete raw record — including the full payload exactly as Metrc holds it."],
  ["Dark / light mode", "Settings → Appearance. Your choice saves to your account and follows you across devices."],
  ["The QR decoder", "Integrations → snip any QR square with Win+Shift+S, then press Ctrl+V on that screen. Decoding happens entirely in your browser; nothing is uploaded."],
  ["Something looks broken", "Each section runs isolated — if one errors, the rest keeps working. Use Retry section, refresh the page, and report what you saw. The audit log records every material change for reconstruction."],
];
function Help() {
  const [open, setOpen] = useState(0);
  return (
    <>
      <div className="pagehead">
        <div>
          <h1>Help &amp; Support</h1>
          <div className="sub">How everything that's live today actually works. This guide grows with every milestone.</div>
        </div>
      </div>
      <div className="cols2">
        {HELP.map(([q, a], i) => (
          <div key={i} className="panel" style={{ maxWidth: "none", cursor: "pointer" }} onClick={() => setOpen(open === i ? -1 : i)}>
            <div className="ptitle"><span className="pchip" style={{ background: "var(--blue-soft)", color: "var(--blue)" }}>{I.help}</span> {q}</div>
            {open === i && <div className="note" style={{ marginTop: 8 }}>{a}</div>}
          </div>
        ))}
      </div>
    </>
  );
}

/* ---------- People (custom module) ---------- */
function People() {
  const [rows, setRows] = useState(null);
  useEffect(() => {
    supabase.from("employees").select("employee_code, full_name, status, tier").order("full_name")
      .then(({ data }) => setRows(data ?? []));
  }, []);
  return (
    <>
      <div className="pagehead">
        <div>
          <h1>Employees</h1>
          <div className="sub">Roster, roles, tiers, departments, and per-employee rates — effective-dated and audited. Full editing lands next milestone.</div>
        </div>
        <span className="pill gold">data loads M2</span>
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

/* ---------- Rail widget ---------- */
function RailMetrc() {
  const sync = useSyncSummary();
  if (sync == null) return null;
  return (
    <div className="railwidget">
      <div className="rw-title"><span className={`dot ${sync.connected ? "on" : "off"}`} /> Metrc Link</div>
      <div className="rw-main">{sync.connected ? "Connected" : "Not connected"}</div>
      <div className="rw-sub">{sync.lastOkAt ? `Last pull ${timeAgo(sync.lastOkAt)} · ${sync.totalRecords.toLocaleString()} records` : "No successful pull yet"}</div>
    </div>
  );
}

/* ---------- App shell ---------- */
export default function App() {
  const session = useSession();
  const prefs = usePrefs(session ?? null);
  const [navVersion, setNavVersion] = useState(0);
  const nav = useNav(navVersion);
  const [view, setView] = useState("tower");
  const [openCats, setOpenCats] = useState({});
  const [dragging, setDragging] = useState(false);
  useEffect(() => {
    if (!dragging) return;
    const move = (e) => prefs.setNavWidthLive(e.clientX);
    const up = (e) => { setDragging(false); prefs.commitNavWidth(e.clientX); };
    document.addEventListener("mousemove", move);
    document.addEventListener("mouseup", up);
    return () => { document.removeEventListener("mousemove", move); document.removeEventListener("mouseup", up); };
  }, [dragging, prefs]);
  if (session === undefined) return null;
  if (!session) return <Auth />;

  const entries = nav ?? [];
  const cats = [];
  for (const e of entries) {
    let c = cats.find((x) => x.name === e.category);
    if (!c) { c = { name: e.category, items: [] }; cats.push(c); }
    c.items.push(e);
  }
  const current = entries.find((e) => e.view_key === view);
  const email = session.user.email ?? "";
  const isOpen = (name) => openCats[name] !== false;

  const special = {
    tower: <ControlTower go={setView} />,
    people: <People />,
    integrations: <Integrations session={session} />,
    settings: <Settings session={session} prefs={prefs} />,
    help: <Help />,
    metrc_mirror: <MetrcMirror />,
    menu_manager: <MenuManager onChanged={() => setNavVersion((v) => v + 1)} />,
  };
  const body = special[view] ?? (current ? <ModuleScreen entry={current} /> : <ControlTower go={setView} />);

  return (
    <div className="frame">
      <header className="topnav">
        <div className="tlogo"><img src="/tg-mark.png" alt="Twisted Growers" style={{ width: 34, height: 34, borderRadius: "50%" }} /><span className="tword">Twisted <b>Growers</b></span></div>
        <div className="tdivider" />
        <div className="tcrumb">{current ? `${current.category} / ${current.label}` : "Command / Control Tower"}</div>
        <div className="tspacer" />
        <span className="tpill"><span className="d" /> LIVE</span>
        <div className="tuser">
          <button className="tibtn" title="Alerts & Reminders" onClick={() => setView("alerts")}>{I.bell}</button>
          <button className="tibtn" title="Messages" onClick={() => setView("messages")}>{I.mail}</button>
          <button className="tibtn" title="Help & Support" onClick={() => setView("help")}>{I.help}</button>
          <button className="avatar" title={`${email} — Settings`} onClick={() => setView("settings")}>{(email[0] ?? "T").toUpperCase()}</button>
        </div>
      </header>
      <div className="below">
        <nav className={`nav ${prefs.collapsed ? "closed" : ""} ${dragging ? "dragging" : ""}`}
          style={prefs.collapsed ? undefined : { width: prefs.navWidth }}>
          <div className="navtools">
            <button onClick={() => setOpenCats(Object.fromEntries(cats.map((c) => [c.name, true])))}>Expand all</button>
            <button onClick={() => setOpenCats(Object.fromEntries(cats.map((c) => [c.name, false])))}>Collapse all</button>
          </div>
          {cats.map((c) => (
            <div className="cat" key={c.name}>
              <button className="cathead" onClick={() => setOpenCats({ ...openCats, [c.name]: !isOpen(c.name) })}>
                <span className="catdot" style={{ background: c.items[0]?.color ?? "var(--neon)" }} />
                <span className="ctext">{c.name}</span>
                <span className={`caret ${isOpen(c.name) ? "open" : ""}`}>{I.caret}</span>
              </button>
              <div className="items" style={{ display: isOpen(c.name) || prefs.collapsed ? "block" : "none" }}>
                {c.items.map((e) => (
                  <button key={e.view_key} className={`item ${view === e.view_key ? "on" : ""}`}
                    onClick={() => setView(e.view_key)} title={e.label}>
                    {iconByName(e.icon)}<span className="lbl">{e.label}</span>
                    {e.milestone && <span className="mtag">SOON</span>}
                  </button>
                ))}
              </div>
            </div>
          ))}
          <button className="burger navburger" onClick={() => prefs.setCollapsed(!prefs.collapsed)} title="Collapse / expand menu">{I.burger}</button>
          <div className="railfoot"><RailMetrc /></div>
          {!prefs.collapsed && (
            <div className="dragbar" onMouseDown={(e) => { e.preventDefault(); setDragging(true); }} title="Drag to resize" />
          )}
        </nav>
        <main className="main">
          <Boundary resetKey={view}>{body}</Boundary>
        </main>
      </div>
    </div>
  );
}
