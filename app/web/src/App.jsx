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
      open_p0_actions: { label: "Open P0 Actions", icon: I.shield, drill: "action_register" },
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
function useRole(session) {
  const [role, setRole] = useState(null);
  useEffect(() => {
    if (!session?.user?.id) { setRole(null); return; }
    supabase.from("app_users").select("role").eq("user_id", session.user.id).single()
      .then(({ data }) => setRole(data?.role ?? "member"));
  }, [session?.user?.id]);
  return role;
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
const fieldLabel = (k) =>
  String(k).replace(/_/g, " ").replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/\b\w/g, (c) => c.toUpperCase());
function DetailGrid({ obj, depth = 0 }) {
  const scalars = [], nested = [];
  Object.entries(obj ?? {}).forEach(([k, v]) => {
    if (v === null || v === undefined || v === "") return;
    if (Array.isArray(v)) {
      if (!v.length) return;
      if (typeof v[0] === "object") nested.push([k, null, v]);
      else scalars.push([k, v.join(", ")]);
      return;
    }
    if (typeof v === "object") { nested.push([k, v, null]); return; }
    scalars.push([k, typeof v === "boolean" ? (v ? "Yes" : "No") : String(v)]);
  });
  return (
    <div>
      {scalars.length > 0 && (
        <div className="dgrid">
          {scalars.map(([k, v]) => (
            <div key={k} className="df"><div className="dk">{fieldLabel(k)}</div><div className="dv">{v}</div></div>
          ))}
        </div>
      )}
      {depth < 2 && nested.map(([k, o, arr]) => (
        <div key={k} className="dsub">
          <div className="dst">{fieldLabel(k)}</div>
          {o ? <DetailGrid obj={o} depth={depth + 1} />
            : arr.slice(0, 6).map((it, i) => <div key={i} className="ditem"><DetailGrid obj={it} depth={depth + 1} /></div>)}
          {arr && arr.length > 6 && <div className="dmore">+ {arr.length - 6} more in raw payload</div>}
        </div>
      ))}
    </div>
  );
}
function RawRow({ row, cols }) {
  const [open, setOpen] = useState(false);
  const [showRaw, setShowRaw] = useState(false);
  return (
    <>
      <tr onClick={() => setOpen(!open)} style={{ cursor: "pointer" }}>
        {cols.map((c) => <td key={c}>{formatCell(row[c])}</td>)}
      </tr>
      {open && (
        <tr>
          <td colSpan={cols.length} className="detailcell">
            <div className="dhead">
              <span className="dtitle">Full record — every field, microscopic</span>
              <button className="dtoggle" onClick={(e) => { e.stopPropagation(); setShowRaw(!showRaw); }}>
                {showRaw ? "Readable view" : "Raw payload (audit)"}
              </button>
            </div>
            {showRaw
              ? <pre className="drawjson">{JSON.stringify(row, null, 2)}</pre>
              : <DetailGrid obj={row} />}
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
const STATUS_COLS = ["status", "state", "source_state", "approval", "release", "exception_code", "room_cycle_flag"];
const chipTone = (v) => {
  const s = String(v).toLowerCase();
  if (/(fail|block|overdue|reject|called_out|no_show|violation|expired|void)/.test(s)) return "bad";
  if (/(pend|hold|submit|due|risk|late|await|review|quarant)/.test(s)) return "warn";
  if (/(active|released|passed|complete|done|ok|connected|approved|worked|scheduled|finished|rts|paid)/.test(s)) return "good";
  return "info";
};
function ModuleScreen({ entry }) {
  const [count, setCount] = useState(null);
  const [rows, setRows] = useState(null);
  const [brk, setBrk] = useState(null);
  const [sample, setSample] = useState(null);
  const [qLive, setQLive] = useState("");
  const [q, setQ] = useState("");
  const [statusSel, setStatusSel] = useState(null);
  const [dFrom, setDFrom] = useState("");
  const [dTo, setDTo] = useState("");
  const [sort, setSort] = useState(null);

  useEffect(() => {
    setCount(null); setRows(null); setBrk(null); setSample(null);
    setQ(""); setQLive(""); setStatusSel(null); setDFrom(""); setDTo(""); setSort(null);
    if (!entry.table_ref) { setCount(0); setRows([]); return; }
    supabase.from(entry.table_ref).select("*").limit(1)
      .then(({ data }) => setSample(data?.[0] ?? {}));
  }, [entry.view_key, entry.table_ref]);

  const textCols = sample ? Object.keys(sample).filter((k) => typeof sample[k] === "string" && k !== "raw").slice(0, 8) : [];
  const dateCol = sample ? Object.keys(sample).find((k) => /(_date|_on|_at$|^date)/.test(k)) : null;
  const statusCol = sample ? STATUS_COLS.find((k) => k in sample) : null;
  const filtered = !!(q || statusSel || dFrom || dTo);

  useEffect(() => {
    if (!entry.table_ref || sample === null) return;
    setRows(null);
    let qy = supabase.from(entry.table_ref).select("*", { count: "exact" });
    const term = q.replace(/[%,()]/g, " ").trim();
    if (term && textCols.length) qy = qy.or(textCols.map((c) => `${c}.ilike.%${term}%`).join(","));
    if (statusSel && statusCol) qy = qy.eq(statusCol, statusSel);
    if (dateCol && dFrom) qy = qy.gte(dateCol, dFrom);
    if (dateCol && dTo) qy = qy.lte(dateCol, dTo);
    if (sort) qy = qy.order(sort.col, { ascending: sort.asc });
    qy.limit(100).then(({ data, count: c }) => { setRows(data ?? []); setCount(c ?? 0); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry.table_ref, sample, q, statusSel, dFrom, dTo, sort]);

  useEffect(() => {
    if (!entry.table_ref || !sample || !statusCol) return;
    supabase.from(entry.table_ref).select(statusCol).limit(1000).then(({ data }) => {
      if (!data?.length) return;
      const m = {};
      data.forEach((r) => { const v = r[statusCol] ?? "—"; m[v] = (m[v] || 0) + 1; });
      setBrk({ col: statusCol, parts: Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 6) });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry.table_ref, sample, statusCol]);

  const cols = rows?.length
    ? Object.keys(rows[0]).filter((k) =>
        k !== "raw" && k !== "id" && !k.endsWith("_id") && typeof rows[0][k] !== "object").slice(0, 9)
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
      {entry.table_ref && sample !== null && (
        <div className="filterbar">
          <input className="fsearch" placeholder="Search anything — name, batch, tag…" value={qLive}
            onChange={(e) => setQLive(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") setQ(qLive); }} />
          <button className="btn small" onClick={() => setQ(qLive)}>Find</button>
          {dateCol && (
            <>
              <span className="flab">{dateCol.replaceAll("_", " ")}</span>
              <input type="date" className="fdate" value={dFrom} onChange={(e) => setDFrom(e.target.value)} />
              <span className="flab">to</span>
              <input type="date" className="fdate" value={dTo} onChange={(e) => setDTo(e.target.value)} />
            </>
          )}
          {(filtered || sort) && (
            <button className="btn small ghost" onClick={() => { setQ(""); setQLive(""); setStatusSel(null); setDFrom(""); setDTo(""); setSort(null); }}>Clear</button>
          )}
        </div>
      )}
      {brk && (
        <div className="statchips">
          {brk.parts.map(([v, n]) => (
            <button key={v} className={`schip ${chipTone(v)} ${statusSel === v ? "sel" : ""}`}
              onClick={() => setStatusSel(statusSel === v ? null : v)} title="Click to filter">
              <b>{n.toLocaleString()}</b> {String(v).replaceAll("_", " ")}
            </button>
          ))}
          <span className="schl">live breakdown by {brk.col.replaceAll("_", " ")} — click to filter</span>
        </div>
      )}
      {rows === null ? (
        <div className="empty"><div className="eicon">{I.gauge}</div>Loading…</div>
      ) : rows.length === 0 ? (
        <div className="empty">
          <div className="eicon">{iconByName(entry.icon)}</div>
          <b>{filtered ? "No records match these filters" : "No records connected yet"}</b>
          {filtered ? "Adjust the search, dates, or status chips — or hit Clear."
            : entry.milestone ? `The structure is live and waiting — real data loads in ${entry.milestone}. No samples will ever appear here.` : "Records appear here the moment they exist."}
        </div>
      ) : (
        <div className="tablewrap">
          <table>
            <thead><tr>{cols.map((c) => (
              <th key={c} style={{ cursor: "pointer" }} title="Sort"
                onClick={() => setSort((s) => s?.col === c ? { col: c, asc: !s.asc } : { col: c, asc: true })}>
                {c.replaceAll("_", " ")}{sort?.col === c ? (sort.asc ? " ↑" : " ↓") : ""}
              </th>
            ))}</tr></thead>
            <tbody>{rows.map((r, i) => <RawRow key={r.id ?? i} row={r} cols={cols} />)}</tbody>
          </table>
        </div>
      )}
    </>
  );
}

/* ---------- Metrc: the entire seed-to-sale platform, synced and drillable ---------- */
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
    ? Object.keys(rows[0]).filter((k) =>
        k !== "raw" && k !== "id" && !k.endsWith("_id") && typeof rows[0][k] !== "object").slice(0, 9)
    : [];
  return (
    <>
      <div className="pagehead">
        <div>
          <h1>Metrc</h1>
          <div className="sub">The entire seed-to-sale platform, synced into your own database — every dataset the state API allows, full history. Every row expands to the complete raw Metrc payload: microscopic auditing, one click deep.</div>
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
  ["metrc_packages", "Metrc Packages", "#00d4ff", "metrc_mirror"],
  ["metrc_plants", "Metrc Plants", "#5cff92", "metrc_mirror"],
  ["metrc_harvests", "Metrc Harvests", "#b366ff", "metrc_mirror"],
  ["metrc_transfers", "Transfers", "#ffea00", "metrc_mirror"],
  ["harvest_schedule", "Harvest Events", "#2df26a", "harvest_schedule"],
  ["lots", "Lots", "#ff8a00", "lots"],
  ["employees", "Employees", "#ff2e9e", "people"],
];
function useLiveCounts() {
  const [c, setC] = useState(null);
  useEffect(() => {
    Promise.all(KPI_TABLES.map(([t]) =>
      supabase.from(t).select("*", { count: "exact", head: true }).then(({ count }) => count ?? 0)
    )).then((counts) => setC(KPI_TABLES.map(([t, l, col, drill], i) => ({ t, l, col, drill, n: counts[i] }))));
  }, []);
  return c;
}

/* ---------- Today's Operations: the daily run-the-company board (live tables only) ---------- */
const todayISO = () => new Date().toISOString().slice(0, 10);
const TODAY_BOARDS = [
  { key: "harvest", title: "Harvest Schedule", drill: "harvest_schedule", color: "#5cff92", icon: "leafline",
    load: async () => {
      const { data, count } = await supabase.from("harvest_schedule")
        .select("harvest_date,flower_room,cultivar,projected_weight_lbs", { count: "exact" })
        .gte("harvest_date", todayISO()).order("harvest_date").limit(4);
      return { n: count ?? 0, unit: "upcoming harvest events", lines: (data ?? []).map((r) => [`${r.harvest_date} · ${r.flower_room ?? "—"}`, `${r.cultivar ?? ""} · ${r.projected_weight_lbs ?? 0} lbs`]) };
    } },
  { key: "cadence", title: "Cadence & Deadlines", drill: "harvest_schedule", color: "#ff8a00", icon: "clock",
    load: async () => {
      const t = todayISO();
      const in14 = new Date(Date.now() + 14 * 864e5).toISOString().slice(0, 10);
      const [due, past, actual] = await Promise.all([
        supabase.from("harvest_schedule").select("id", { count: "exact", head: true }).gte("harvest_date", t).lte("harvest_date", in14),
        supabase.from("harvest_schedule").select("id", { count: "exact", head: true }).lt("harvest_date", t),
        supabase.from("harvests").select("id", { count: "exact", head: true }),
      ]);
      const gap = Math.max(0, (past.count ?? 0) - (actual.count ?? 0));
      return { n: due.count ?? 0, unit: "harvest events due in 14 days", lines: [
        ["Past planner events", String(past.count ?? 0)],
        ["Actual harvests recorded", String(actual.count ?? 0)],
        ["Weights / records outstanding", String(gap)],
      ] };
    } },
  { key: "testing", title: "Testing Schedule", drill: "testing", color: "#ff8a00", icon: "flask",
    load: async () => {
      const { data, count } = await supabase.from("coas")
        .select("coa_number,status,submitted_on", { count: "exact" })
        .order("submitted_on", { ascending: false, nullsFirst: false }).limit(4);
      return { n: count ?? 0, unit: "COAs tracked", lines: (data ?? []).map((r) => [r.coa_number ?? "COA", `${r.status ?? "—"}${r.submitted_on ? ` · ${r.submitted_on}` : ""}`]) };
    } },
  { key: "alloc", title: "Material Allocations", drill: "allocations", color: "#00d4ff", icon: "scale",
    load: async () => {
      const { data, count } = await supabase.from("allocations")
        .select("approval,release", { count: "exact" }).limit(1000);
      const pending = (data ?? []).filter((r) => r.approval !== "approved" || !r.release).length;
      return { n: count ?? 0, unit: "allocations on record", lines: count ? [["Awaiting approval or release", String(pending)]] : [] };
    } },
  { key: "mfg", title: "Manufacturing Schedule", drill: "work_orders", color: "#ffea00", icon: "gauge",
    load: async () => {
      const { data, count } = await supabase.from("work_orders")
        .select("wo_code,status,planned_start", { count: "exact" })
        .order("planned_start", { ascending: true, nullsFirst: false }).limit(4);
      return { n: count ?? 0, unit: "work orders", lines: (data ?? []).map((r) => [r.wo_code ?? "WO", `${r.status ?? "—"}${r.planned_start ? ` · starts ${r.planned_start}` : ""}`]) };
    } },
  { key: "live", title: "Products Live Today", drill: "lots", color: "#2df26a", icon: "box",
    load: async () => {
      const { data, count } = await supabase.from("lots")
        .select("lot_code,quantity,uom,status", { count: "exact" }).eq("created_on", todayISO()).limit(4);
      return { n: count ?? 0, unit: "lots created today", lines: (data ?? []).map((r) => [r.lot_code ?? "lot", `${r.quantity ?? 0} ${r.uom ?? ""} · ${r.status ?? ""}`]) };
    } },
  { key: "ship", title: "Shipments & Pickups", drill: "shipping", color: "#e2bd63", icon: "truck",
    load: async () => {
      const { data, count } = await supabase.from("shipments")
        .select("shipment_code,scheduled_ship_on,status", { count: "exact" })
        .gte("scheduled_ship_on", todayISO()).order("scheduled_ship_on").limit(4);
      return { n: count ?? 0, unit: "scheduled from today", lines: (data ?? []).map((r) => [r.shipment_code ?? "shipment", `${r.scheduled_ship_on ?? ""} · ${r.status ?? "—"}`]) };
    } },
  { key: "sched", title: "Employee Schedule Today", drill: "emp_schedule", color: "#b026ff", icon: "users",
    load: async () => {
      const { data, count } = await supabase.from("employee_schedules")
        .select("zone,status,employees(full_name)", { count: "exact" }).eq("work_date", todayISO()).limit(4);
      return { n: count ?? 0, unit: "scheduled today", lines: (data ?? []).map((r) => [r.employees?.full_name ?? "employee", `${r.zone ?? "—"} · ${r.status}`]) };
    } },
  { key: "attend", title: "Call-outs & Lates Today", drill: "time", color: "#ff2e5f", icon: "clock",
    load: async () => {
      const { data, count } = await supabase.from("time_entries")
        .select("exception_code,employees(full_name)", { count: "exact" })
        .eq("work_date", todayISO()).not("exception_code", "is", null).limit(4);
      return { n: count ?? 0, unit: "attendance exceptions today", lines: (data ?? []).map((r) => [r.employees?.full_name ?? "employee", String(r.exception_code).replaceAll("_", " ")]) };
    } },
];
function TodayBoard({ go }) {
  const [data, setData] = useState({});
  useEffect(() => {
    let on = true;
    TODAY_BOARDS.forEach((b) => {
      b.load().then((res) => { if (on) setData((d) => ({ ...d, [b.key]: res })); })
        .catch(() => { if (on) setData((d) => ({ ...d, [b.key]: { n: 0, unit: "unavailable", lines: [] } })); });
    });
    return () => { on = false; };
  }, []);
  return (
    <div className="msection">
      <div className="mtitle"><span className="sq" /><h2>Today’s Operations</h2><span className="rule" /></div>
      <div className="todaygrid">
        {TODAY_BOARDS.map((b) => {
          const d = data[b.key];
          return (
            <button key={b.key} className="ttile" onClick={() => go(b.drill)} style={{ borderTopColor: b.color }} title="Open source module for full detail">
              <div className="th">
                <span className="ti" style={{ color: b.color }}>{iconByName(b.icon)}</span>
                <span className="tt">{b.title}</span>
                <span className="tn" style={{ color: b.color }}>{d ? d.n.toLocaleString() : "…"}</span>
              </div>
              <div className="tu">{d ? d.unit : "loading"}</div>
              {d && d.lines.length > 0
                ? d.lines.map((l, i) => <div key={i} className="tl"><span>{l[0]}</span><span>{l[1]}</span></div>)
                : d ? <div className="tempty">No records yet — this tile speaks the moment its table has rows.</div> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ---------- Sync Center: one button, every connected source (Control Tower) ---------- */
const SYNC_SOURCES = [
  { key: "metrc", label: "Metrc (state system)", fn: "metrc-sync", live: true,
    desc: "Packages, plants, harvests, batches, transfers, items, strains, locations — full history." },
  { key: "sheet_fg", label: "Finished-Goods Google Sheet", fn: "sheet-sync", live: true,
    desc: "All nine product tabs + 3rd-party material, exactly as the team keeps them." },
  { key: "quickbooks", label: "QuickBooks Online", fn: null, live: false,
    desc: "Invoices, payments, expenses, customers — connects once Intuit app keys are stored." },
];
function SyncCenter({ session }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(null);
  const [out, setOut] = useState({});
  const run = async (src) => {
    if (!src.fn) return;
    setBusy(src.key);
    setOut((o) => ({ ...o, [src.key]: "Running…" }));
    try {
      const r = await fetch(`${FUNCTIONS_URL}/${src.fn}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      });
      const j = await r.json();
      setOut((o) => ({ ...o, [src.key]: j.ok
        ? `Done — ${j.total ?? Object.entries(j.results ?? {}).map(([k, v]) => `${k}: ${v}`).join(", ")}${j.total ? " records" : ""}`
        : `Failed: ${j.error ?? "unknown error"}` }));
    } catch (e) {
      setOut((o) => ({ ...o, [src.key]: `Failed: ${String(e)}` }));
    }
    setBusy(null);
  };
  const runAll = async () => { for (const s of SYNC_SOURCES.filter((x) => x.live)) await run(s); };
  return (
    <div className="syncwrap">
      <button className="btn syncbtn" onClick={() => setOpen((v) => !v)}>{I.plug} Sync</button>
      {open && (
        <div className="syncpanel">
          <div className="sphead">
            <span>Sync Center</span>
            <span style={{ display: "flex", gap: 8 }}>
              <button className="btn small" disabled={busy !== null} onClick={runAll}>Sync all</button>
              <button className="btn small ghost" onClick={() => setOpen(false)} title="Close">✕</button>
            </span>
          </div>
          {SYNC_SOURCES.map((s) => (
            <div key={s.key} className="sprow">
              <div className="spmain">
                <div className="spname">{s.label}{!s.live && <span className="mtag">SOON</span>}</div>
                <div className="spdesc">{out[s.key] ?? s.desc}</div>
              </div>
              <button className="btn small" disabled={!s.live || busy !== null} onClick={() => run(s)}>
                {busy === s.key ? "…" : "Sync"}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------- Control Tower ---------- */
function ControlTower({ go, session }) {
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
        {session && <SyncCenter session={session} />}
      </div>
      {rows && (
        <div className="hero">
          <button className="pulse" onClick={() => go("alerts")} title="Open the Action Register">
            <div className={`ring ${calm ? "calm" : "alert"}`}>{calm ? I.check : I.shield}</div>
            <div>
              <div className="pt">Operational status</div>
              <div className={`pv ${calm ? "calm" : "alert"}`}>{calm ? "ALL CLEAR" : `${alertCount} ALERT${alertCount > 1 ? "S" : ""}`}</div>
            </div>
          </button>
          <div className="stats">
            <button className="stat" onClick={() => go("integrations")} title="Open Integrations"><div className="sl">Metrc link</div><div className="sv">{sync == null ? "…" : sync.connected ? <span className="u">CONNECTED</span> : <small>not connected</small>}</div></button>
            <button className="stat" onClick={() => go("integrations")} title="Open Integrations"><div className="sl">Last sync</div><div className="sv">{sync == null ? "…" : sync.lastOkAt ? timeAgo(sync.lastOkAt) : <small>never</small>}</div></button>
            <button className="stat" onClick={() => go("metrc_mirror")} title="Open Metrc"><div className="sl">Records synced</div><div className="sv">{sync == null ? "…" : sync.totalRecords.toLocaleString()}</div></button>
            <button className="stat" onClick={() => go("cash")} title="Open Cash & Overhead"><div className="sl">Cash data age</div><div className="sv">{cashDays >= 999 ? <small>never updated</small> : `${cashDays}d`}</div></button>
          </div>
        </div>
      )}
      {kpis && (
        <div className="msection" style={{ marginTop: 0 }}>
          <div className="mtitle"><span className="sq" /><h2>Live Data KPIs</h2><span className="rule" /></div>
          <div className="grid">
            {kpis.map((k) => (
              <div key={k.t} className="card ok" style={{ borderLeftColor: k.col, cursor: "pointer" }}
                onClick={() => go(k.drill)} title="Open source module for full detail">
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
      <TodayBoard go={go} />
      {err && <div className="empty"><div className="eicon">{I.shield}</div><b>Control Tower unavailable</b>{err}</div>}
      {!err && !rows && <div className="empty"><div className="eicon">{I.gauge}</div>Loading live metrics…</div>}
      {rows && METRIC_GROUPS.map((g) => (
        <div className="msection" key={g.title}>
          <div className="mtitle"><span className="sq" /><h2>{g.title}</h2><span className="rule" /></div>
          <div className="grid">
            {Object.entries(g.items).map(([key, meta]) => {
              const v = byMetric[key] ?? 0;
              const isCash = !!meta.cash;
              let cls = "ok", stateWord = "clear";
              if (isCash) {
                const lvl = v >= 30 ? 3 : v >= 14 ? 2 : v >= 7 ? 1 : 0;
                cls = lvl === 3 ? "hot" : lvl === 2 ? "hot2" : lvl === 1 ? "hot1" : "ok";
                stateWord = lvl === 3 ? "critical" : lvl === 2 ? "elevated" : lvl === 1 ? "watch" : "clear";
              } else {
                cls = v > 0 ? "hot" : "ok zero";
                stateWord = v > 0 ? "action" : "clear";
              }
              return (
                <div key={key} className={`card ${cls}`}
                  onClick={() => meta.drill && go(meta.drill)} style={{ cursor: meta.drill ? "pointer" : "default" }}
                  title={meta.drill ? "Open source module" : undefined}>
                  <div className="chip">{meta.icon}</div>
                  <div className="body">
                    <div className="metric">{meta.label}</div>
                    <div className="vrow">
                      <div className="value">{isCash && v >= 999 ? "—" : v.toLocaleString()}</div>
                      <div className="state">{stateWord}</div>
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

/* ---------- Alerts & Reminders: computed live from operating records, never manual ---------- */
const METRIC_META = Object.assign({}, ...METRIC_GROUPS.map((g) => g.items));
function AlertsScreen({ go }) {
  const [alerts, setAlerts] = useState(null);
  useEffect(() => {
    (async () => {
      const list = [];
      const { data: tower } = await supabase.from("v_control_tower").select("*");
      (tower ?? []).forEach((r) => {
        const v = Number(r.value ?? 0);
        if (r.metric === "days_since_cash_update") {
          const lvl = v >= 30 ? "critical" : v >= 14 ? "elevated" : v >= 7 ? "watch" : null;
          if (lvl) list.push({ level: lvl, text: `Cash data ${v >= 999 ? "has never been updated" : `is ${v} days old`}`, drill: "cash" });
        } else if (v > 0) {
          const meta = METRIC_META[r.metric];
          list.push({ level: "critical", text: `${meta?.label ?? r.metric.replaceAll("_", " ")}: ${v}`, drill: meta?.drill });
        }
      });
      const t = new Date().toISOString().slice(0, 10);
      const in7 = new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10);
      const checks = await Promise.all([
        supabase.from("harvest_schedule").select("id", { count: "exact", head: true }).gte("harvest_date", t).lte("harvest_date", in7),
        supabase.from("time_entries").select("id", { count: "exact", head: true }).eq("work_date", t).not("exception_code", "is", null),
        supabase.from("v_material_aging").select("lot_code", { count: "exact", head: true }).eq("aging_alert", "CAPITAL TIED UP"),
        supabase.from("v_fg_metrc_check").select("sheet_tag", { count: "exact", head: true }).eq("check_result", "TAG NOT IN SYNCED METRC"),
        supabase.from("issue_reports").select("id", { count: "exact", head: true }).eq("status", "open"),
        supabase.from("product_inventory").select("id", { count: "exact", head: true }).lt("expiration_date", in7 === t ? t : new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10)),
      ]);
      const [due, exc, tied, mism, issues, expiring] = checks.map((c) => c.count ?? 0);
      if (due) list.push({ level: "watch", text: `${due} harvest event${due > 1 ? "s" : ""} due in the next 7 days`, drill: "harvest_schedule" });
      if (exc) list.push({ level: "elevated", text: `${exc} attendance exception${exc > 1 ? "s" : ""} today (late / called out)`, drill: "time" });
      if (tied) list.push({ level: "elevated", text: `${tied} purchased material lot${tied > 1 ? "s" : ""} flagged CAPITAL TIED UP`, drill: "materials" });
      if (mism) list.push({ level: "watch", text: `${mism} finished-goods sheet row${mism > 1 ? "s" : ""} with a tag not found in synced Metrc`, drill: "fg_metrc_check" });
      if (issues) list.push({ level: "elevated", text: `${issues} open staff issue report${issues > 1 ? "s" : ""}`, drill: "issues" });
      if (expiring) list.push({ level: "watch", text: `${expiring} finished-goods lot${expiring > 1 ? "s" : ""} expiring within 30 days`, drill: "inv_summary" });
      setAlerts(list);
    })();
  }, []);
  return (
    <>
      <div className="pagehead">
        <div>
          <h1>Alerts & Reminders</h1>
          <div className="sub">Every alert below is computed live from operating records the moment you open this page — tiered yellow → orange → red, each one clicks through to its source. Nothing manual, nothing fake.</div>
        </div>
      </div>
      {alerts === null ? (
        <div className="empty"><div className="eicon">{I.bell}</div>Checking every board…</div>
      ) : alerts.length === 0 ? (
        <div className="empty"><div className="eicon">{I.check}</div><b>All clear</b>No live alerts across cash, compliance, cadence, attendance, materials, or inventory.</div>
      ) : (
        <div className="alertlist">
          {alerts.map((a, i) => (
            <button key={i} className={`alertrow ${a.level}`} onClick={() => a.drill && go(a.drill)} title="Open source module">
              <span className="allvl">{a.level}</span>
              <span className="altxt">{a.text}</span>
              <span className="alarrow">{I.caret}</span>
            </button>
          ))}
        </div>
      )}
    </>
  );
}

/* ---------- Finished Goods: the team's live sheet, tab for tab ---------- */
const FG_TABS = [
  { key: "solventless", label: "Solventless", cols: ["current_status","bulk_metrc_tag","prefill_metrc_tag","final_metrc_tag","production_batch","strain_flavor","size_g","total_bulk","total_filled","total_packaged","cases_available","creation_date","expiration_date","tac_pct"] },
  { key: "hydrocarbon", label: "Hydrocarbon", cols: ["current_status","bulk_metrc_tag","prefill_metrc_tag","final_metrc_tag","production_batch","strain_flavor","product_description","size_g","total_bulk","total_filled","total_packaged","cases_available","creation_date","expiration_date"] },
  { key: "infused_preroll", label: "Infused PreRolls", cols: ["current_status","bulk_metrc_tag","final_metrc_tag","production_batch","strain_flavor","total_bulk","total_filled","total_packaged","case_size","cases_available","creation_date","expiration_date","tac_pct"] },
  { key: "raw_preroll_1g", label: "1.0g Raw", cols: ["current_status","projected_avail","bulk_metrc_tag","final_metrc_tag","production_batch","strain_flavor","total_bulk","total_filled","total_packaged","case_size","cases_available","expiration_date","tac_pct","terpene_pct"] },
  { key: "raw_preroll_05g", label: "0.5g Raw", cols: ["current_status","bulk_metrc_tag","final_metrc_tag","production_batch","strain_flavor","total_bulk","total_filled","total_units","total_gram_equivalent","cases_available","expiration_date","tac_pct","thca_pct"] },
  { key: "economy_raw_1g", label: "1.0g Economy", cols: ["current_status","projected_avail","bulk_metrc_tag","final_metrc_tag","production_batch","strain_flavor","size_g","total_bulk","total_filled","total_packaged","case_size","cases_available","expiration_date","tac_pct"] },
  { key: "economy_infused", label: "Economy Infused", cols: ["current_status","bulk_metrc_tag","final_metrc_tag","production_batch","strain_flavor","size_g","total_bulk","total_filled","total_gram_equivalent","total_packaged","case_size","cases_available","expiration_date","tac_pct"] },
  { key: "economy_raw_05g", label: "0.5g Economy", cols: ["current_status","bulk_metrc_tag","final_metrc_tag","production_batch","strain_flavor","size_g","total_gram_equivalent","total_packaged","case_size","cases_available","expiration_date","tac_pct"] },
  { key: "vaporizer", label: "Vaporizers", cols: ["current_status","bulk_metrc_tag","final_metrc_tag","production_batch","strain_flavor","size_g","total_packaged","case_size","cases_available","creation_date","expiration_date","tac_pct"] },
];
function FinishedGoods({ session }) {
  const [tab, setTab] = useState(FG_TABS[0].key);
  const [counts, setCounts] = useState({});
  const [rows, setRows] = useState(null);
  const [ver, setVer] = useState(0);
  useEffect(() => {
    FG_TABS.forEach((t) => {
      supabase.from("product_inventory").select("*", { count: "exact", head: true }).eq("category", t.key)
        .then(({ count }) => setCounts((c) => ({ ...c, [t.key]: count ?? 0 })));
    });
  }, [ver]);
  useEffect(() => {
    setRows(null);
    supabase.from("product_inventory").select("*").eq("category", tab).order("source_row")
      .then(({ data }) => setRows(data ?? []));
  }, [tab, ver]);
  const spec = FG_TABS.find((t) => t.key === tab);
  return (
    <>
      <div className="pagehead">
        <div>
          <h1>Finished Goods</h1>
          <div className="sub">The team's live inventory sheet, mirrored tab for tab. Crews keep working in Google Sheets — one press of Sync updates the whole platform for everyone.</div>
        </div>
        {session && <SyncCenter session={session} />}
      </div>
      <div className="tabs">
        {FG_TABS.map((t) => (
          <button key={t.key} className={tab === t.key ? "on" : ""} onClick={() => setTab(t.key)}>
            {t.label}<span className="cnt">{counts[t.key] ?? "…"}</span>
          </button>
        ))}
      </div>
      {rows === null ? (
        <div className="empty"><div className="eicon">{I.box}</div>Loading…</div>
      ) : rows.length === 0 ? (
        <div className="empty"><div className="eicon">{I.box}</div><b>No rows in this product line yet</b>Press Sync to pull the latest from the team's sheet.</div>
      ) : (
        <div className="tablewrap">
          <table>
            <thead><tr>{spec.cols.map((c) => <th key={c}>{c.replaceAll("_", " ")}</th>)}</tr></thead>
            <tbody>
              {rows.map((r) => (
                <RawRow key={r.id} row={r} cols={spec.cols} />
              ))}
            </tbody>
          </table>
        </div>
      )}
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
  ["Running a Metrc sync", "Integrations → Run Metrc sync now. The worker authenticates, verifies which licenses your key can see, and pulls the full catalog politely (Massachusetts caps pages at 20 records). First pull is big; after that only changes sync. Results appear in the run log and in the Metrc section."],
  ["Reading the Control Tower", "Every card is computed live from the database — nothing can be typed into it. Red means action required; dim zero means no records connected yet. Click any card to drill into its source module."],
  ["Drilling into records", "In the Metrc section and every module screen, click any row to expand the complete raw record — including the full payload exactly as Metrc holds it."],
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
  const [lookups, setLookups] = useState(null);
  useEffect(() => {
    Promise.all([
      supabase.from("employees").select("*").order("full_name"),
      supabase.from("roles_catalog").select("id, name"),
      supabase.from("departments").select("id, name"),
    ]).then(([e, r, d]) => {
      setLookups({
        roles: Object.fromEntries((r.data ?? []).map((x) => [x.id, x.name])),
        depts: Object.fromEntries((d.data ?? []).map((x) => [x.id, x.name])),
      });
      setRows(e.data ?? []);
    });
  }, []);
  const roleOf = (id) => lookups?.roles[id] ?? "—";
  const deptOf = (id) => lookups?.depts[id] ?? "—";
  const cols = ["employee_code", "full_name", "position", "departments", "status"];
  return (
    <>
      <div className="pagehead">
        <div>
          <h1>Employees</h1>
          <div className="sub">Roster with real positions and departments, per-employee effective-dated rates behind every row. Click a person for the complete record — full in-app editing is the next build.</div>
        </div>
      </div>
      {rows === null ? <div className="empty"><div className="eicon">{I.users}</div>Loading…</div> : rows.length === 0 ? (
        <div className="empty"><div className="eicon">{I.users}</div><b>No employees connected yet</b>The real roster loads from the v5 planner — no sample people will ever appear here.</div>
      ) : (
        <div className="tablewrap">
          <table>
            <thead><tr><th>Code</th><th>Name</th><th>Position</th><th>Departments</th><th>Status</th></tr></thead>
            <tbody>{rows.map((r) => {
              const view = {
                employee_code: r.employee_code,
                full_name: r.full_name,
                position: roleOf(r.primary_role_id),
                departments: [deptOf(r.primary_department_id), r.secondary_department_id ? deptOf(r.secondary_department_id) : null].filter((x) => x && x !== "—").join(" + ") || "—",
                status: r.status,
                ...r,
              };
              return <RawRow key={r.id} row={view} cols={cols} />;
            })}</tbody>
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
  const role = useRole(session ?? null);
  const [view, setView] = useState("tower");
  const [openCats, setOpenCats] = useState({});
  const [dragging, setDragging] = useState(false);
  const [userMenu, setUserMenu] = useState(false);
  const [alertN, setAlertN] = useState(0);
  useEffect(() => {
    if (!session) return;
    supabase.from("v_control_tower").select("*").then(({ data }) => {
      const n = (data ?? []).reduce((a, r) => {
        const v = Number(r.value ?? 0);
        if (r.metric === "days_since_cash_update") return a + (v >= 7 ? 1 : 0);
        return a + (v > 0 ? 1 : 0);
      }, 0);
      setAlertN(n);
    });
  }, [session, view]);
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

  const isExec = role === "owner" || role === "executive";
  const entries = (nav ?? []).filter((e) => !e.admin_only || isExec);
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
    tower: <ControlTower go={setView} session={session} />,
    fg_inventory: <FinishedGoods session={session} />,
    alerts: <AlertsScreen go={setView} />,
    people: <People />,
    integrations: <Integrations session={session} />,
    settings: <Settings session={session} prefs={prefs} />,
    help: <Help />,
    metrc_mirror: <MetrcMirror />,
    menu_manager: isExec
      ? <MenuManager onChanged={() => setNavVersion((v) => v + 1)} />
      : <div className="empty"><div className="eicon">{I.shield}</div><b>Admin area</b>Menu Manager is restricted to executives. Ask an owner if a menu change is needed.</div>,
  };
  const body = special[view] ?? (current ? <ModuleScreen entry={current} /> : <ControlTower go={setView} />);

  return (
    <div className="frame">
      <header className="topnav">
        <div className="tlogo"><img src="/tg-mark.png" alt="Twisted Growers" style={{ width: 34, height: 34, borderRadius: "50%" }} /><span className="tword">Twisted <b>Growers</b></span></div>
        <div className="tdivider" />
        <div className="tcrumb">{current ? `${current.category} / ${current.label}` : view === "alerts" ? "Command / Alerts & Reminders" : "Command / Control Tower"}</div>
        <div className="tspacer" />
        <span className="tpill"><span className="d" /> LIVE</span>
        <div className="tuser">
          <button className="tibtn" title="Control Tower" onClick={() => setView("tower")}>{I.gauge}</button>
          <button className="tibtn" title="Alerts & Reminders" onClick={() => setView("alerts")}>
            {I.bell}{alertN > 0 && <span className="tbadge">{alertN}</span>}
          </button>
          <button className="tibtn" title="Messages" onClick={() => setView("messages")}>{I.mail}</button>
          <button className="tibtn" title="Help & Support" onClick={() => setView("help")}>{I.help}</button>
          <div className="uwrap">
            <button className="avatar" title={email} onClick={() => setUserMenu((v) => !v)}>{(email[0] ?? "T").toUpperCase()}</button>
            {userMenu && (
              <div className="umenu" onMouseLeave={() => setUserMenu(false)}>
                <div className="uhead">
                  <div className="uav">{(email[0] ?? "T").toUpperCase()}</div>
                  <div><div className="uname">Signed in</div><div className="umail">{email}</div></div>
                </div>
                <div className="usep" />
                <div className="ulabel">Theme</div>
                <div className="uthemes">
                  <button className={prefs.theme === "dark" ? "on" : ""} onClick={() => prefs.setTheme("dark")}>{I.moon} Dark</button>
                  <button className={prefs.theme === "light" ? "on" : ""} onClick={() => prefs.setTheme("light")}>{I.sun} Light</button>
                </div>
                <div className="usep" />
                <button className="uitem" onClick={() => { setUserMenu(false); setView("people"); }}>{I.users} Employee directory</button>
                <button className="uitem" onClick={() => { setUserMenu(false); setView("settings"); }}>{I.gear} Settings</button>
                {isExec && <button className="uitem" onClick={() => { setUserMenu(false); setView("menu_manager"); }}>{I.burger} Menu Manager</button>}
                <div className="usep" />
                <button className="uitem uout" onClick={() => supabase.auth.signOut()}>{I.out} Sign out</button>
              </div>
            )}
          </div>
        </div>
      </header>
      <div className="below">
        <nav className={`nav ${prefs.collapsed ? "closed" : ""} ${dragging ? "dragging" : ""}`}
          style={prefs.collapsed ? undefined : { width: prefs.navWidth }}>
          <div className="navtools">
            <button onClick={() => setOpenCats(Object.fromEntries(cats.map((c) => [c.name, true])))}>Expand all</button>
            <button onClick={() => setOpenCats(Object.fromEntries(cats.map((c) => [c.name, false])))}>Collapse all</button>
          </div>
          {prefs.collapsed ? (
            <div className="railcats">
              {cats.map((c) => {
                const col = c.items[0]?.color ?? "";
                const flat = col && !col.includes("gradient") && !col.startsWith("var") ? col : undefined;
                const active = c.items.some((e) => e.view_key === view);
                return (
                  <button key={c.name} className={`railcat ${active ? "on" : ""}`} title={c.name}
                    onClick={() => { prefs.setCollapsed(false); setOpenCats({ ...openCats, [c.name]: true }); }}>
                    <span className="rcicon" style={flat ? { color: flat } : undefined}>{iconByName(c.items[0]?.icon)}</span>
                    <span className="rclabel">{c.name}</span>
                  </button>
                );
              })}
            </div>
          ) : (
            cats.map((c) => (
              <div className="cat" key={c.name}>
                <button className="cathead" onClick={() => setOpenCats({ ...openCats, [c.name]: !isOpen(c.name) })}>
                  <span className="catdot" style={{ background: c.items[0]?.color ?? "var(--neon)" }} />
                  <span className="ctext">{c.name}</span>
                  <span className={`caret ${isOpen(c.name) ? "open" : ""}`}>{I.caret}</span>
                </button>
                <div className="items" style={{ display: isOpen(c.name) ? "block" : "none" }}>
                  {c.items.map((e) => (
                    <button key={e.view_key} className={`item ${view === e.view_key ? "on" : ""}`}
                      onClick={() => setView(e.view_key)} title={e.label}>
                      {iconByName(e.icon)}<span className="lbl">{e.label}</span>
                      {e.milestone && <span className="mtag">SOON</span>}
                    </button>
                  ))}
                </div>
              </div>
            ))
          )}
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
