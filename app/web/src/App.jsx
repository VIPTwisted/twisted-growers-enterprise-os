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
  grid: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3.5" y="3.5" width="7" height="7" rx="1.5" /><rect x="13.5" y="3.5" width="7" height="7" rx="1.5" /><rect x="3.5" y="13.5" width="7" height="7" rx="1.5" /><rect x="13.5" y="13.5" width="7" height="7" rx="1.5" /></svg>),
  board: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="14" rx="1.5" /><path d="M7 14c2-3 4 1 6-2s3-1 4-2" /><path d="M9 21h6" /></svg>),
  mic: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>),
  stopwatch: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="13.5" r="7.5" /><path d="M12 13.5V9.5M10 2.5h4M17.5 6.5l1.5-1.5" /></svg>),
  apps: (<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="5" r="2" /><circle cx="12" cy="5" r="2" /><circle cx="19" cy="5" r="2" /><circle cx="5" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="19" cy="12" r="2" /><circle cx="5" cy="19" r="2" /><circle cx="12" cy="19" r="2" /><circle cx="19" cy="19" r="2" /></svg>),
};
/* ---------- Workspace launcher: the work platform inside the OS ---------- */
const LAUNCHER_APPS = [
  { view: "brain", icon: "dna", name: "TG Brain", desc: "Ask the whole operation" },
  { view: "tasks", icon: "check", name: "Tasks", desc: "Who's doing what, by when" },
  { view: "teams", icon: "users", name: "Teams", desc: "Departments + custom crews" },
  { view: "planner", icon: "clock", name: "Planner", desc: "The ops calendar, live" },
  { view: "dashboards", icon: "grid", name: "Dashboards", desc: "Live boards by template" },
  { view: "whiteboards", icon: "board", name: "Whiteboards", desc: "Sketch and pin notes" },
  { view: "templates", icon: "clip", name: "Template Center", desc: "Industry-native, ready to run" },
  { view: "spaces", icon: "box", name: "Spaces", desc: "Work containers per department" },
  { view: "alerts", icon: "bell", name: "Alerts", desc: "Everything that needs eyes" },
  { view: "tower", icon: "gauge", name: "Control Tower", desc: "Back to the executive board" },
];
function Launcher({ onGo, onClose }) {
  return (
    <div className="launcher" onClick={onClose}>
      <div className="lwrap" onClick={(e) => e.stopPropagation()}>
        <div className="lhead">
          <img src="/tg-mark.png" alt="" />
          <div>
            <div className="lt">TG Workspace</div>
            <div className="ls">The work platform inside the OS — pre-configured for this company. Nothing to set up.</div>
          </div>
          <button className="btn small ghost" onClick={onClose}>✕</button>
        </div>
        <div className="lgrid">
          {LAUNCHER_APPS.map((a, i) => (
            <button key={a.view} className="lapp" style={{ "--d": `${i * 40}ms` }} onClick={() => { onGo(a.view); onClose(); }}>
              <span className="li">{iconByName(a.icon)}</span>
              <span className="ln">{a.name}</span>
              <span className="ld">{a.desc}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
const fmtHMS = (s) => {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(x).padStart(2, "0")}`;
};
function beep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [0, 0.35, 0.7].forEach((t) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      o.frequency.value = 880; g.gain.setValueAtTime(0.25, ctx.currentTime + t);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + 0.28);
      o.start(ctx.currentTime + t); o.stop(ctx.currentTime + t + 0.3);
    });
  } catch { /* audio unavailable */ }
}
function TimeTools({ session }) {
  const [open, setOpen] = useState(false);
  const [track, setTrack] = useState(null);
  const [note, setNote] = useState("");
  const [timerEnd, setTimerEnd] = useState(null);
  const [timerMin, setTimerMin] = useState("15");
  const [rang, setRang] = useState(false);
  const [, setTick] = useState(0);
  const [todaySec, setTodaySec] = useState(0);
  useEffect(() => {
    if (!track && !timerEnd) return;
    const id = setInterval(() => {
      setTick((t) => t + 1);
      if (timerEnd && Date.now() >= timerEnd) {
        setTimerEnd(null); setRang(true); beep();
        if ("Notification" in window && Notification.permission === "granted") {
          new Notification("TG Timer", { body: "Time's up." });
        }
      }
    }, 1000);
    return () => clearInterval(id);
  }, [track, timerEnd]);
  useEffect(() => {
    const start = new Date(); start.setHours(0, 0, 0, 0);
    supabase.from("time_tracks").select("seconds").eq("user_id", session.user.id).gte("started_at", start.toISOString())
      .then(({ data }) => setTodaySec((data ?? []).reduce((a, r) => a + r.seconds, 0)));
  }, [session.user.id, track]);
  const stopTrack = async () => {
    const seconds = Math.round((Date.now() - track) / 1000);
    await supabase.from("time_tracks").insert({
      user_id: session.user.id, started_at: new Date(track).toISOString(),
      ended_at: new Date().toISOString(), seconds, note: note.trim() || null,
    });
    setTrack(null); setNote("");
  };
  const startTimer = () => {
    const mins = parseFloat(timerMin);
    if (!Number.isFinite(mins) || mins <= 0) return;
    if ("Notification" in window && Notification.permission === "default") Notification.requestPermission();
    setRang(false); setTimerEnd(Date.now() + mins * 60000);
  };
  const live = track ? fmtHMS(Math.round((Date.now() - track) / 1000))
    : timerEnd ? fmtHMS(Math.max(0, Math.round((timerEnd - Date.now()) / 1000))) : null;
  return (
    <div className="uwrap">
      <button className={`tibtn ${rang ? "ringing" : ""}`} title="Track time & timer" onClick={() => { setOpen((v) => !v); setRang(false); }}>
        {I.stopwatch}
      </button>
      {live && <button className={`timepill ${timerEnd ? "cd" : ""}`} onClick={() => setOpen(true)}>{live}</button>}
      {open && (
        <div className="umenu timepanel" onMouseLeave={() => setOpen(false)}>
          <div className="ulabel">Track time</div>
          <div className="ttrow">
            <span className="ttbig">{track ? fmtHMS(Math.round((Date.now() - track) / 1000)) : "0:00:00"}</span>
            {track
              ? <button className="btn small" onClick={stopTrack}>Stop & save</button>
              : <button className="btn small" onClick={() => setTrack(Date.now())}>Start</button>}
          </div>
          <input className="ttnote" placeholder="What are you working on? (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
          <div className="ttsub">Tracked today: {fmtHMS(todaySec)} — saved to your account; payroll timesheets wire in with the Work Layer.</div>
          <div className="usep" />
          <div className="ulabel">Timer</div>
          <div className="ttrow">
            <input className="ttmin" type="number" min="1" value={timerMin} onChange={(e) => setTimerMin(e.target.value)} />
            <span className="ttsub" style={{ margin: 0 }}>minutes</span>
            {timerEnd
              ? <button className="btn small ghost" onClick={() => setTimerEnd(null)}>Cancel</button>
              : <button className="btn small" onClick={startTimer}>Start timer</button>}
          </div>
          <div className="ttsub">Beeps and sends a browser notification when it hits zero.</div>
        </div>
      )}
    </div>
  );
}
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

/* ---------- TG Brain: the company's mind — intro, role personalization; engine lands M5 ---------- */
const BRAIN_ROLES = ["Owner / CEO", "COO / Operations", "CFO / Finance", "Cultivation", "Manufacturing", "Sales", "Human Resources", "Compliance / QA"];
const BRAIN_ORBIT = [
  { icon: "leafline", label: "Cultivation" }, { icon: "box", label: "Inventory" },
  { icon: "flask", label: "Testing" }, { icon: "truck", label: "Transfers" },
  { icon: "dollar", label: "Cash" }, { icon: "users", label: "People" },
  { icon: "shield", label: "Compliance" }, { icon: "clock", label: "Schedules" },
];
/* eslint-disable react-hooks/exhaustive-deps */
const BRAIN_FINDERS = [
  { key: "packages", label: "Metrc packages", drill: "metrc_mirror",
    run: (q) => supabase.from("metrc_packages").select("tag,item_name,quantity,uom").or(`tag.ilike.%${q}%,item_name.ilike.%${q}%`).limit(5),
    line: (r) => [`…${String(r.tag).slice(-8)}`, `${r.item_name ?? ""} · ${r.quantity ?? ""} ${r.uom ?? ""}`] },
  { key: "fg", label: "Finished goods", drill: "fg_inventory",
    run: (q) => supabase.from("product_inventory").select("strain_flavor,production_batch,current_status").or(`strain_flavor.ilike.%${q}%,production_batch.ilike.%${q}%`).limit(5),
    line: (r) => [r.strain_flavor ?? r.production_batch, `${r.production_batch ?? ""} · ${r.current_status ?? ""}`] },
  { key: "harvest", label: "Harvest calendar", drill: "harvest_schedule",
    run: (q) => supabase.from("harvest_schedule").select("cultivar,flower_room,harvest_date").ilike("cultivar", `%${q}%`).limit(5),
    line: (r) => [r.cultivar, `${r.flower_room ?? ""} · ${r.harvest_date}`] },
  { key: "people", label: "People", drill: "people",
    run: (q) => supabase.from("employees").select("full_name,employee_code").ilike("full_name", `%${q}%`).limit(5),
    line: (r) => [r.full_name, r.employee_code] },
  { key: "plants", label: "Metrc plants", drill: "metrc_mirror",
    run: (q) => supabase.from("metrc_plants").select("tag,strain,room").or(`strain.ilike.%${q}%,tag.ilike.%${q}%`).limit(5),
    line: (r) => [r.strain ?? `…${String(r.tag).slice(-8)}`, `${r.room ?? ""}`] },
];
function BrainScreen({ session, go, isExec, dictation }) {
  const [roleSel, setRoleSel] = useState(null);
  const [saved, setSaved] = useState(false);
  const [q, setQ] = useState("");
  const [results, setResults] = useState(null);
  const [searching, setSearching] = useState(false);
  const [quick, setQuick] = useState({});
  const [mem, setMem] = useState("");
  const [memSaved, setMemSaved] = useState(false);
  useEffect(() => {
    supabase.from("user_settings").select("brain_role").eq("user_id", session.user.id).maybeSingle()
      .then(({ data }) => { if (data?.brain_role) { setRoleSel(data.brain_role); setSaved(true); } });
    const in30 = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10);
    Promise.all([
      supabase.from("actions_register").select("id", { count: "exact", head: true }).eq("status", "open").eq("priority", "P0"),
      supabase.from("product_inventory").select("id", { count: "exact", head: true }).lt("expiration_date", in30),
      supabase.from("harvest_schedule").select("id", { count: "exact", head: true }).like("room_cycle_flag", "%VIOLATION%"),
      supabase.from("v_material_aging").select("lot_code", { count: "exact", head: true }).eq("aging_alert", "CAPITAL TIED UP"),
    ]).then(([a, b, c, d]) => setQuick({ p0: a.count ?? 0, exp: b.count ?? 0, cad: c.count ?? 0, tied: d.count ?? 0 }));
  }, [session.user.id]);
  const ask = async (termArg) => {
    const term = String(termArg ?? q).replace(/[%,()]/g, " ").trim();
    if (!term) return;
    setSearching(true); setResults(null);
    const found = await Promise.all(BRAIN_FINDERS.map(async (f) => {
      try { const { data } = await f.run(term); return { f, rows: data ?? [] }; }
      catch { return { f, rows: [] }; }
    }));
    setResults(found.filter((x) => x.rows.length));
    setSearching(false);
  };
  const pick = async (r) => {
    setRoleSel(r); setSaved(false);
    await supabase.from("user_settings").upsert({ user_id: session.user.id, brain_role: r }, { onConflict: "user_id" });
    setSaved(true);
  };
  const saveMem = async () => {
    if (!mem.trim()) return;
    await supabase.from("configurations").upsert({
      key: "brain_memory",
      value: { text: mem.trim().slice(0, 8000), saved_by: session.user.email, saved_at: new Date().toISOString() },
    }, { onConflict: "key" });
    setMemSaved(true);
  };
  useEffect(() => {
    if (dictation && dictation !== "__unsupported__") { setQ(dictation); ask(dictation); }
  }, [dictation]);
  const QUICK = [
    { icon: "shield", title: "Open P0 actions", n: quick.p0, drill: "action_register" },
    { icon: "clock", title: "Lots expiring 30d", n: quick.exp, drill: "inv_summary" },
    { icon: "leafline", title: "Cadence violations", n: quick.cad, drill: "harvest_schedule" },
    { icon: "dollar", title: "Capital tied up", n: quick.tied, drill: "materials" },
  ];
  return (
    <>
      <div className="brainhero">
        <div className="orbitfield">
          {BRAIN_ORBIT.map((o, i) => (
            <span key={o.label} className="orbchip" style={{ "--i": i }}>{iconByName(o.icon)}<em>{o.label}</em></span>
          ))}
          <div className="braincore"><img src="/tg-mark.png" alt="" /></div>
        </div>
        <h1>TG <b>Brain</b></h1>
        <p className="bsub">Every record this company generates — Metrc, the rooms, the floor, the sheets, the money — one mind. It answers from live data only, never from guesses.</p>
        <div className="askwrap">
          <div className="asktabs">
            <button className="on">{I.dna} Ask / Find</button>
            <button disabled title="Loop agents arrive in M5">{I.gear} Agents <span className="mtag">M5</span></button>
          </div>
          <div className="askbar">
            <input value={q} placeholder="Search the whole operation — a tag, a strain, a batch, a person…"
              onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") ask(); }} />
            <button className="btn" onClick={() => ask()}>{searching ? "…" : "Ask"}</button>
          </div>
        </div>
        <div className="qcards">
          {QUICK.map((c) => (
            <button key={c.title} className="qcard" onClick={() => go(c.drill)}>
              <span className="qi">{iconByName(c.icon)}</span>
              <span className="qt">{c.title}</span>
              <span className={`qn ${Number(c.n) > 0 ? "hot" : ""}`}>{c.n ?? "…"}</span>
            </button>
          ))}
        </div>
      </div>
      {results !== null && (
        <div className="msection">
          <div className="mtitle"><span className="sq" /><h2>Found in the operation</h2><span className="rule" /></div>
          {results.length === 0 ? (
            <div className="empty"><div className="eicon">{I.dna}</div><b>No live records match</b>Brain only answers from real data — try a tag, strain, batch code, or name.</div>
          ) : results.map(({ f, rows }) => (
            <div key={f.key} className="bresgroup">
              <div className="brh">{f.label}</div>
              {rows.map((r, i) => {
                const [l, s] = f.line(r);
                return (
                  <button key={i} className="bres" onClick={() => go(f.drill)}>
                    <span className="brl">{l}</span><span className="brs">{s}</span><span className="bra">{I.caret}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}
      <div className="msection">
        <div className="mtitle"><span className="sq" /><h2>What do you run?</h2><span className="rule" /></div>
        <p className="bnote">Brain tailors briefings, alerts, and your Control Tower to your seat. Saved to your account as data — change it any time.</p>
        <div className="rolegrid">
          {BRAIN_ROLES.map((r) => (
            <button key={r} className={`rolechip ${roleSel === r ? "on" : ""}`} onClick={() => pick(r)}>{r}</button>
          ))}
        </div>
        {saved && roleSel && <div className="bsaved">{I.check} Tailored for <b>{roleSel}</b> — your boards and briefings will lead with what you run.</div>}
      </div>
      <div className="msection">
        <div className="mtitle"><span className="sq" /><h2>Connected sources</h2><span className="rule" /></div>
        <p className="bnote">What Brain can read. Connections are controlled by admin settings and user permissions.</p>
        <div className="connrows">
          <div className="connrow"><span className="cn">Metrc (state system)</span><span className="cs on">CONNECTED</span></div>
          <div className="connrow"><span className="cn">Finished-Goods Google Sheet</span><span className="cs on">CONNECTED</span></div>
          <div className="connrow"><span className="cn">QuickBooks Online</span>
            {isExec ? <button className="btn small" onClick={() => go("integrations")}>Set up</button> : <span className="cs">ADMIN CONTROLLED</span>}</div>
          <div className="connrow"><span className="cn">Monday.com</span>
            {isExec ? <button className="btn small" onClick={() => go("integrations")}>Set up</button> : <span className="cs">ADMIN CONTROLLED</span>}</div>
        </div>
      </div>
      {isExec && (
        <div className="msection">
          <div className="mtitle"><span className="sq" /><h2>Import memory</h2><span className="rule" /></div>
          <p className="bnote">Admin only. Paste standing context — how the company runs, preferences, priorities. Stored as data and fed to the M5 reasoning engine so Brain is personal from day one.</p>
          <textarea className="memta" rows={5} value={mem} onChange={(e) => { setMem(e.target.value); setMemSaved(false); }}
            placeholder="Paste company context, preferences, standing priorities…" />
          <div style={{ marginTop: 10, display: "flex", gap: 10, alignItems: "center" }}>
            <button className="btn" onClick={saveMem}>Import memory</button>
            {memSaved && <span className="bsaved">{I.check} Stored — audited, admin-only.</span>}
          </div>
        </div>
      )}
    </>
  );
}

/* ---------- Tasks v1: the Work Layer's first live slice ---------- */
const TASK_STATUSES = [["todo", "TO DO"], ["in_progress", "IN PROGRESS"], ["blocked", "BLOCKED"], ["done", "DONE"]];
function TasksScreen({ session }) {
  const [tasks, setTasks] = useState(null);
  const [emps, setEmps] = useState([]);
  const [form, setForm] = useState({ title: "", assignee: "", due: "", priority: "P2", tags: "" });
  const [ver, setVer] = useState(0);
  useEffect(() => {
    Promise.all([
      supabase.from("tasks").select("*").order("created_at", { ascending: false }),
      supabase.from("employees").select("id, full_name").is("terminated_on", null).order("full_name"),
    ]).then(([t, e]) => { setTasks(t.data ?? []); setEmps(e.data ?? []); });
  }, [ver]);
  const empName = (id) => emps.find((e) => e.id === id)?.full_name ?? null;
  const create = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) return;
    await supabase.from("tasks").insert({
      title: form.title.trim(), created_by: session.user.id,
      assignee_employee_id: form.assignee || null, due_on: form.due || null,
      priority: form.priority,
      tags: form.tags.split(",").map((t) => t.trim()).filter(Boolean),
    });
    setForm({ title: "", assignee: "", due: "", priority: "P2", tags: "" }); setVer((v) => v + 1);
  };
  const advance = async (t) => {
    const next = t.status === "todo" ? "in_progress" : t.status === "in_progress" ? "done" : "todo";
    await supabase.from("tasks").update({ status: next, completed_at: next === "done" ? new Date().toISOString() : null }).eq("id", t.id);
    setVer((v) => v + 1);
  };
  const today = new Date().toISOString().slice(0, 10);
  return (
    <>
      <div className="pagehead">
        <div><h1>Tasks & Boards</h1><div className="sub">Live tasks with real assignees from the roster. Click the status chip to advance a task. Board, calendar, subtasks, and automations grow in with the Work Layer.</div></div>
      </div>
      <form className="teamform taskform" onSubmit={create}>
        <input style={{ flex: 2 }} placeholder="Task name…" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        <select value={form.assignee} onChange={(e) => setForm({ ...form, assignee: e.target.value })}>
          <option value="">Assignee…</option>
          {emps.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
        </select>
        <input type="date" value={form.due} onChange={(e) => setForm({ ...form, due: e.target.value })} />
        <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
          {["P0", "P1", "P2", "P3"].map((p) => <option key={p}>{p}</option>)}
        </select>
        <input placeholder="tags, comma, separated" value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} />
        <button className="btn" type="submit">Create task</button>
      </form>
      {tasks === null ? <div className="empty"><div className="eicon">{I.check}</div>Loading…</div> : (
        TASK_STATUSES.map(([key, label]) => {
          const list = tasks.filter((t) => t.status === key);
          if (!list.length && key === "blocked") return null;
          return (
            <div className="msection" key={key}>
              <div className="mtitle"><span className="sq" /><h2>{label} — {list.length}</h2><span className="rule" /></div>
              {list.length === 0 ? <p className="bnote">Nothing here.</p> : list.map((t) => (
                <div key={t.id} className="tkrow">
                  <button className={`tkstatus ${t.status}`} onClick={() => advance(t)} title="Click to advance">
                    {t.status === "done" ? I.check : t.status === "in_progress" ? "▶" : t.status === "blocked" ? "■" : "○"}
                  </button>
                  <span className={`tktitle ${t.status === "done" ? "donetxt" : ""}`}>{t.title}</span>
                  <span className={`schip ${t.priority === "P0" ? "bad" : t.priority === "P1" ? "warn" : "info"}`}>{t.priority}</span>
                  {empName(t.assignee_employee_id) && <span className="tkass"><span className="tcavatar">{empName(t.assignee_employee_id)[0]}</span>{empName(t.assignee_employee_id)}</span>}
                  {t.due_on && <span className={`tkdue ${t.due_on < today && t.status !== "done" ? "over" : ""}`}>{t.due_on}</span>}
                  {t.tags?.map((tag) => <span key={tag} className="tktag">#{tag}</span>)}
                </div>
              ))}
            </div>
          );
        })
      )}
    </>
  );
}

/* ---------- Whiteboards: real pen + sticky notes, persisted ---------- */
const WB_COLORS = ["#2df26a", "#ffea00", "#57a9ff", "#ff2e5f", "#ffffff"];
function WhiteboardEditor({ board, onBack }) {
  const [strokes, setStrokes] = useState(board.content?.strokes ?? []);
  const [notes, setNotes] = useState(board.content?.notes ?? []);
  const [color, setColor] = useState(WB_COLORS[0]);
  const [cur, setCur] = useState(null);
  const [savedAt, setSavedAt] = useState(null);
  const dragRef = React.useRef(null);
  const wrapRef = React.useRef(null);
  const pos = (e) => {
    const r = wrapRef.current.getBoundingClientRect();
    return [Math.round(e.clientX - r.left), Math.round(e.clientY - r.top)];
  };
  const down = (e) => { if (e.target.closest(".wbnote")) return; setCur({ color, pts: [pos(e)] }); };
  const move = (e) => {
    if (dragRef.current !== null) {
      const [x, y] = pos(e);
      const { i, dx, dy } = dragRef.current;
      setNotes((n) => n.map((nt, j) => j === i ? { ...nt, x: x - dx, y: y - dy } : nt));
      return;
    }
    if (!cur) return;
    const [x, y] = pos(e);
    const last = cur.pts[cur.pts.length - 1];
    if (Math.abs(x - last[0]) + Math.abs(y - last[1]) < 3) return;
    setCur((c) => ({ ...c, pts: [...c.pts, [x, y]] }));
  };
  const up = () => {
    if (cur && cur.pts.length > 1) setStrokes((s) => [...s, cur]);
    setCur(null); dragRef.current = null;
  };
  const save = async () => {
    await supabase.from("whiteboards").update({ content: { strokes, notes }, updated_at: new Date().toISOString() }).eq("id", board.id);
    setSavedAt(new Date().toLocaleTimeString());
  };
  return (
    <>
      <div className="pagehead">
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <button className="btn small ghost" onClick={onBack}>‹ Boards</button>
          <h1 style={{ fontSize: 26 }}>{board.name}</h1>
        </div>
        <div className="wbtools">
          {WB_COLORS.map((c) => (
            <button key={c} className={`wbswatch ${color === c ? "on" : ""}`} style={{ background: c }} onClick={() => setColor(c)} title="Pen color" />
          ))}
          <button className="btn small ghost" onClick={() => setNotes((n) => [...n, { x: 60 + n.length * 26, y: 60 + n.length * 20, text: "", color: "#ffea00" }])}>+ Note</button>
          <button className="btn small ghost" onClick={() => setStrokes((s) => s.slice(0, -1))}>Undo</button>
          <button className="btn small" onClick={save}>Save</button>
          {savedAt && <span className="bnote" style={{ margin: 0 }}>saved {savedAt}</span>}
        </div>
      </div>
      <div ref={wrapRef} className="wbwrap" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerLeave={up}>
        <svg className="wbcanvas">
          {[...strokes, ...(cur ? [cur] : [])].map((s, i) => (
            <polyline key={i} points={s.pts.map((p) => p.join(",")).join(" ")} fill="none" stroke={s.color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          ))}
        </svg>
        {notes.map((n, i) => (
          <div key={i} className="wbnote" style={{ left: n.x, top: n.y, background: n.color }}>
            <div className="wbnh" onPointerDown={(e) => { const [x, y] = pos(e); dragRef.current = { i, dx: x - n.x, dy: y - n.y }; }}>
              ⣿ <button onClick={() => setNotes((s) => s.filter((_, j) => j !== i))}>✕</button>
            </div>
            <textarea value={n.text} placeholder="Note…" onChange={(e) => setNotes((s) => s.map((nt, j) => j === i ? { ...nt, text: e.target.value } : nt))} />
          </div>
        ))}
      </div>
    </>
  );
}
function WhiteboardsScreen({ session }) {
  const [boards, setBoards] = useState(null);
  const [open, setOpen] = useState(null);
  const [form, setForm] = useState({ name: "", priv: true });
  const [ver, setVer] = useState(0);
  useEffect(() => {
    supabase.from("whiteboards").select("*").order("updated_at", { ascending: false })
      .then(({ data }) => setBoards(data ?? []));
  }, [ver]);
  const create = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    const { data } = await supabase.from("whiteboards")
      .insert({ name: form.name.trim(), is_private: form.priv, created_by: session.user.id }).select("*").single();
    setForm({ name: "", priv: true }); setVer((v) => v + 1);
    if (data) setOpen(data);
  };
  if (open) return <WhiteboardEditor board={open} onBack={() => { setOpen(null); setVer((v) => v + 1); }} />;
  return (
    <>
      <div className="pagehead">
        <div><h1>Whiteboards</h1><div className="sub">Sketch, plan, and pin notes — saved to the database, private or shared. Live multi-user cursors arrive with the Work Layer.</div></div>
      </div>
      <form className="teamform" onSubmit={create}>
        <input placeholder="Name this whiteboard…" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <label className="wbpriv"><input type="checkbox" checked={!form.priv} onChange={(e) => setForm({ ...form, priv: !e.target.checked })} /> Share with everyone (private by default)</label>
        <button className="btn" type="submit">Create whiteboard</button>
      </form>
      {boards === null ? <div className="empty"><div className="eicon">{I.board}</div>Loading…</div> : boards.length === 0 ? (
        <div className="empty"><div className="eicon">{I.board}</div><b>No whiteboards yet</b>Create one above — draw with the pen, drop sticky notes, hit Save.</div>
      ) : (
        <div className="teamgrid">
          {boards.map((b) => (
            <button key={b.id} className="teamcard tplcard" onClick={() => setOpen(b)}>
              <span className="tcname">{b.name}{b.is_private && <span className="mtag">PRIVATE</span>}</span>
              <span className="tpldesc">{(b.content?.strokes?.length ?? 0)} strokes · {(b.content?.notes?.length ?? 0)} notes</span>
              <span className="tccount">updated {new Date(b.updated_at).toLocaleDateString()}</span>
            </button>
          ))}
        </div>
      )}
    </>
  );
}

/* ---------- Dashboards: template gallery, every widget live ---------- */
const count = (t, mod) => async () => {
  let q = supabase.from(t).select("*", { count: "exact", head: true });
  if (mod) q = mod(q);
  const { count: c } = await q;
  return c ?? 0;
};
const in30 = () => new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10);
const DASH_TEMPLATES = [
  { key: "exec", title: "Executive Overview", desc: "Compliance, cash, and the whole operation at a glance", widgets: [
    { t: "Open P0 actions", drill: "action_register", icon: "shield", load: count("actions_register", (q) => q.eq("status", "open").eq("priority", "P0")) },
    { t: "Metrc packages", drill: "metrc_mirror", icon: "box", load: count("metrc_packages") },
    { t: "Plants in the rooms", drill: "metrc_mirror", icon: "leafline", load: count("metrc_plants") },
    { t: "Finished-goods lots", drill: "fg_inventory", icon: "box", load: count("product_inventory") },
    { t: "Expiring within 30d", drill: "inv_summary", icon: "clock", load: count("product_inventory", (q) => q.lt("expiration_date", in30())) },
    { t: "Harvest events next 30d", drill: "harvest_schedule", icon: "leafline", load: count("harvest_schedule", (q) => q.gte("harvest_date", todayISO()).lte("harvest_date", in30())) },
  ] },
  { key: "cultivation", title: "Cultivation", desc: "Rooms, plants, cadence, and plan vs actual", widgets: [
    { t: "Plants (Metrc)", drill: "metrc_mirror", icon: "leafline", load: count("metrc_plants") },
    { t: "Harvests recorded", drill: "harvest_recon", icon: "scale", load: count("metrc_harvests") },
    { t: "Calendar events ahead", drill: "harvest_schedule", icon: "clock", load: count("harvest_schedule", (q) => q.gte("harvest_date", todayISO())) },
    { t: "Cadence violations", drill: "harvest_schedule", icon: "shield", load: count("harvest_schedule", (q) => q.like("room_cycle_flag", "%VIOLATION%")) },
    { t: "Missing in Metrc", drill: "harvest_recon", icon: "shield", load: count("v_harvest_reconciliation", (q) => q.eq("reconciliation", "MISSING IN METRC")) },
  ] },
  { key: "inv_sales", title: "Inventory & Sales", desc: "What's sellable, aging, and moving", widgets: [
    { t: "Finished-goods lots", drill: "fg_inventory", icon: "box", load: count("product_inventory") },
    { t: "Ready To Ship", drill: "fg_inventory", icon: "check", load: count("product_inventory", (q) => q.eq("current_status", "Ready To Ship")) },
    { t: "Expiring within 30d", drill: "inv_summary", icon: "clock", load: count("product_inventory", (q) => q.lt("expiration_date", in30())) },
    { t: "3rd-party lots on site", drill: "third_party", icon: "truck", load: count("third_party_material") },
    { t: "Transfer manifests", drill: "metrc_mirror", icon: "truck", load: count("metrc_transfers") },
    { t: "Capital tied up", drill: "materials", icon: "dollar", load: count("v_material_aging", (q) => q.eq("aging_alert", "CAPITAL TIED UP")) },
  ] },
  { key: "hr", title: "HR & Labor", desc: "Headcount, schedules, exceptions, cost", widgets: [
    { t: "Active employees", drill: "people", icon: "users", load: count("employees", (q) => q.is("terminated_on", null)) },
    { t: "Scheduled today", drill: "emp_schedule", icon: "clock", load: count("employee_schedules", (q) => q.eq("work_date", todayISO())) },
    { t: "Exceptions today", drill: "time", icon: "bell", load: count("time_entries", (q) => q.eq("work_date", todayISO()).not("exception_code", "is", null)) },
    { t: "Weekly loaded payroll", drill: "plan_payroll", icon: "dollar", load: async () => {
      const { data } = await supabase.from("v_payroll_forecast").select("loaded_weekly_cost");
      return "$" + Math.round((data ?? []).reduce((a, r) => a + Number(r.loaded_weekly_cost ?? 0), 0)).toLocaleString();
    } },
  ] },
];
function DashboardsScreen({ session, go }) {
  const [tpl, setTpl] = useState(undefined);
  const [vals, setVals] = useState({});
  useEffect(() => {
    supabase.from("user_settings").select("dashboard_template").eq("user_id", session.user.id).maybeSingle()
      .then(({ data }) => setTpl(data?.dashboard_template ?? null));
  }, [session.user.id]);
  const active = DASH_TEMPLATES.find((d) => d.key === tpl);
  useEffect(() => {
    if (!active) return;
    setVals({});
    active.widgets.forEach((w) => w.load().then((v) => setVals((s) => ({ ...s, [w.t]: v }))));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tpl]);
  const choose = async (k) => {
    setTpl(k);
    await supabase.from("user_settings").upsert({ user_id: session.user.id, dashboard_template: k }, { onConflict: "user_id" });
  };
  if (tpl === undefined) return <div className="empty"><div className="eicon">{I.gauge}</div>Loading…</div>;
  if (!active) return (
    <>
      <div className="pagehead"><div><h1>Choose a Dashboard</h1>
        <div className="sub">Pick a template and it builds itself from live records this second — or wait for the custom drag-drop builder in M4. Your choice saves to your account.</div></div></div>
      <div className="teamgrid">
        {DASH_TEMPLATES.map((d) => (
          <button key={d.key} className="teamcard tplcard" onClick={() => choose(d.key)}>
            <span className="tcname">{d.title}</span>
            <span className="tpldesc">{d.desc}</span>
            <span className="tccount">{d.widgets.length} live widgets</span>
          </button>
        ))}
        <div className="teamcard tplcard dim">
          <span className="tcname">Start from scratch <span className="mtag">M4</span></span>
          <span className="tpldesc">Drag, drop, and resize your own widgets — arrives with dashboard layouts.</span>
        </div>
      </div>
    </>
  );
  return (
    <>
      <div className="pagehead">
        <div><h1>{active.title}</h1><div className="sub">{active.desc} — every number live at this moment. Click any widget for full detail.</div></div>
        <button className="btn small ghost" onClick={() => choose(null) || setTpl(null)}>Change template</button>
      </div>
      <div className="qcards dashgrid">
        {active.widgets.map((w) => (
          <button key={w.t} className="qcard" onClick={() => go(w.drill)}>
            <span className="qi">{iconByName(w.icon)}</span>
            <span className="qt">{w.t}</span>
            <span className={`qn ${typeof vals[w.t] === "number" && vals[w.t] > 0 && /P0|violation|Missing|Exception|tied|Expir/i.test(w.t) ? "hot" : ""}`}>{vals[w.t] ?? "…"}</span>
          </button>
        ))}
      </div>
    </>
  );
}

/* ---------- Planner: the operations calendar, already full of live events ---------- */
const PLANNER_LEGEND = [
  ["Harvest", "#5cff92"], ["Shipment", "#e2bd63"], ["Work order", "#ffea00"], ["Expiry", "#ff8a00"], ["Shift", "#b026ff"],
];
function PlannerScreen({ go }) {
  const [ym, setYm] = useState(() => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() }; });
  const [events, setEvents] = useState(null);
  const [sel, setSel] = useState(null);
  useEffect(() => {
    setEvents(null); setSel(null);
    const start = `${ym.y}-${String(ym.m + 1).padStart(2, "0")}-01`;
    const endD = new Date(ym.y, ym.m + 1, 0).getDate();
    const end = `${ym.y}-${String(ym.m + 1).padStart(2, "0")}-${String(endD).padStart(2, "0")}`;
    Promise.all([
      supabase.from("harvest_schedule").select("harvest_date,cultivar,flower_room").gte("harvest_date", start).lte("harvest_date", end),
      supabase.from("shipments").select("scheduled_ship_on,shipment_code,status").gte("scheduled_ship_on", start).lte("scheduled_ship_on", end),
      supabase.from("work_orders").select("planned_start,wo_code,status").gte("planned_start", start).lte("planned_start", end),
      supabase.from("product_inventory").select("expiration_date,strain_flavor,production_batch").gte("expiration_date", start).lte("expiration_date", end),
      supabase.from("employee_schedules").select("work_date,zone,status").gte("work_date", start).lte("work_date", end),
    ]).then(([h, s, w, x, es]) => {
      const ev = {};
      const add = (date, type, label, drill, color) => { if (!date) return; (ev[date] = ev[date] ?? []).push({ type, label, drill, color }); };
      (h.data ?? []).forEach((r) => add(r.harvest_date, "Harvest", `${r.cultivar ?? ""} · ${r.flower_room ?? ""}`, "harvest_schedule", "#5cff92"));
      (s.data ?? []).forEach((r) => add(r.scheduled_ship_on, "Shipment", `${r.shipment_code ?? ""} · ${r.status ?? ""}`, "shipping", "#e2bd63"));
      (w.data ?? []).forEach((r) => add(r.planned_start, "Work order", `${r.wo_code ?? ""} · ${r.status ?? ""}`, "work_orders", "#ffea00"));
      (x.data ?? []).forEach((r) => add(r.expiration_date, "Expiry", r.strain_flavor ?? r.production_batch ?? "lot", "inv_summary", "#ff8a00"));
      (es.data ?? []).forEach((r) => add(r.work_date, "Shift", `${r.zone ?? "—"} · ${r.status}`, "emp_schedule", "#b026ff"));
      setEvents(ev);
    });
  }, [ym.y, ym.m]);
  const first = new Date(ym.y, ym.m, 1);
  const cells = [...Array(first.getDay()).fill(null),
    ...Array.from({ length: new Date(ym.y, ym.m + 1, 0).getDate() }, (_, i) => i + 1)];
  const iso = (d) => `${ym.y}-${String(ym.m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const todayIso = new Date().toISOString().slice(0, 10);
  const shift = (n) => setYm(({ y, m }) => { const d = new Date(y, m + n, 1); return { y: d.getFullYear(), m: d.getMonth() }; });
  return (
    <>
      <div className="pagehead">
        <div>
          <h1>Planner</h1>
          <div className="sub">The whole operation on one calendar, straight from live records — nothing here is typed in twice. Connect Google or Outlook calendars from Integrations when the keys are in.</div>
        </div>
        <div className="calnav">
          <button className="btn small ghost" onClick={() => shift(-1)}>‹</button>
          <span className="calmonth">{first.toLocaleString("en-US", { month: "long", year: "numeric" })}</span>
          <button className="btn small ghost" onClick={() => shift(1)}>›</button>
          <button className="btn small" onClick={() => { const d = new Date(); setYm({ y: d.getFullYear(), m: d.getMonth() }); }}>Today</button>
        </div>
      </div>
      <div className="callegend">
        {PLANNER_LEGEND.map(([l, c]) => <span key={l} className="cl"><i style={{ background: c }} />{l}</span>)}
      </div>
      {events === null ? <div className="empty"><div className="eicon">{I.clock}</div>Loading the month…</div> : (
        <>
          <div className="calgrid">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => <div key={d} className="caldow">{d}</div>)}
            {cells.map((d, i) => {
              if (d === null) return <div key={`b${i}`} className="calcell blank" />;
              const k = iso(d);
              const list = events[k] ?? [];
              return (
                <button key={k} className={`calcell ${k === todayIso ? "today" : ""} ${sel === k ? "sel" : ""}`} onClick={() => setSel(sel === k ? null : k)}>
                  <span className="caldate">{d}</span>
                  {list.slice(0, 3).map((e, j) => (
                    <span key={j} className="calev" style={{ borderLeftColor: e.color }}>{e.label}</span>
                  ))}
                  {list.length > 3 && <span className="calmore">+{list.length - 3} more</span>}
                </button>
              );
            })}
          </div>
          {sel && (
            <div className="msection">
              <div className="mtitle"><span className="sq" /><h2>{sel}</h2><span className="rule" /></div>
              {(events[sel] ?? []).length === 0 ? <p className="bnote">Nothing scheduled from live records this day.</p> :
                (events[sel] ?? []).map((e, i) => (
                  <button key={i} className="bres" onClick={() => go(e.drill)}>
                    <span className="brl" style={{ color: e.color }}>{e.type}</span>
                    <span className="brs">{e.label}</span><span className="bra">{I.caret}</span>
                  </button>
                ))}
            </div>
          )}
        </>
      )}
    </>
  );
}

/* ---------- Teams Hub: departments are living teams; custom teams staffed in-app ---------- */
function TeamsScreen({ session, isExec }) {
  const [depts, setDepts] = useState(null);
  const [emps, setEmps] = useState([]);
  const [teams, setTeams] = useState([]);
  const [members, setMembers] = useState({});
  const [open, setOpen] = useState(null);
  const [form, setForm] = useState({ name: "", description: "" });
  const [ver, setVer] = useState(0);
  useEffect(() => {
    Promise.all([
      supabase.from("departments").select("id, name, color").order("name"),
      supabase.from("employees").select("id, full_name, status, primary_department_id, secondary_department_id").order("full_name"),
      supabase.from("teams").select("*").order("created_at"),
      supabase.from("team_members").select("team_id, employee_id"),
    ]).then(([d, e, t, m]) => {
      setDepts(d.data ?? []); setEmps(e.data ?? []); setTeams(t.data ?? []);
      const map = {};
      (m.data ?? []).forEach((r) => { (map[r.team_id] = map[r.team_id] ?? new Set()).add(r.employee_id); });
      setMembers(map);
    });
  }, [ver]);
  const deptMembers = (id) => emps.filter((e) => e.primary_department_id === id || e.secondary_department_id === id);
  const createTeam = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    await supabase.from("teams").insert({ name: form.name.trim(), description: form.description.trim() || null, created_by: session.user.id });
    setForm({ name: "", description: "" }); setVer((v) => v + 1);
  };
  const toggleMember = async (teamId, empId) => {
    if (members[teamId]?.has(empId)) await supabase.from("team_members").delete().eq("team_id", teamId).eq("employee_id", empId);
    else await supabase.from("team_members").insert({ team_id: teamId, employee_id: empId });
    setVer((v) => v + 1);
  };
  if (depts === null) return <div className="empty"><div className="eicon">{I.users}</div>Loading teams…</div>;
  return (
    <>
      <div className="pagehead">
        <div>
          <h1>Teams</h1>
          <div className="sub">Align the crews and see their work. Departments are living teams fed by the roster; custom teams cross department lines. Task assignment, mentions, and workload views arrive with the Work Layer.</div>
        </div>
      </div>
      <div className="msection" style={{ marginTop: 0 }}>
        <div className="mtitle"><span className="sq" /><h2>Departments — built-in teams</h2><span className="rule" /></div>
        <div className="teamgrid">
          {depts.map((d) => {
            const list = deptMembers(d.id);
            const isOpen = open === `d:${d.id}`;
            return (
              <div key={d.id} className={`teamcard ${isOpen ? "open" : ""}`} style={{ borderTopColor: d.color ?? "var(--neon)" }}>
                <button className="tchead" onClick={() => setOpen(isOpen ? null : `d:${d.id}`)}>
                  <span className="tcname">{d.name}</span>
                  <span className="tccount">{list.length} member{list.length === 1 ? "" : "s"}</span>
                </button>
                {isOpen && (
                  <div className="tcmembers">
                    {list.length === 0 ? <div className="tcnone">No one assigned to this department yet.</div>
                      : list.map((e) => <div key={e.id} className="tcm"><span className="tcavatar">{e.full_name[0]}</span>{e.full_name}{e.status !== "active" && <em>({e.status})</em>}</div>)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
      <div className="msection">
        <div className="mtitle"><span className="sq" /><h2>Custom teams</h2><span className="rule" /></div>
        {isExec && (
          <form className="teamform" onSubmit={createTeam}>
            <input placeholder="Team name…" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <input placeholder="Description (optional)" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            <button className="btn" type="submit">Create team</button>
          </form>
        )}
        {teams.length === 0 ? (
          <div className="empty"><div className="eicon">{I.users}</div><b>No custom teams yet</b>{isExec ? "Create one above — then staff it from the roster with one click each." : "An executive can create cross-department teams here."}</div>
        ) : (
          <div className="teamgrid">
            {teams.map((t) => {
              const set = members[t.id] ?? new Set();
              const isOpen = open === `t:${t.id}`;
              return (
                <div key={t.id} className={`teamcard ${isOpen ? "open" : ""}`} style={{ borderTopColor: t.color }}>
                  <button className="tchead" onClick={() => setOpen(isOpen ? null : `t:${t.id}`)}>
                    <span className="tcname">{t.name}</span>
                    <span className="tccount">{set.size} member{set.size === 1 ? "" : "s"}</span>
                  </button>
                  {isOpen && (
                    <div className="tcmembers">
                      {t.description && <div className="tcdesc">{t.description}</div>}
                      {emps.map((e) => (
                        <button key={e.id} className={`tcm pick ${set.has(e.id) ? "in" : ""}`}
                          disabled={!isExec} onClick={() => toggleMember(t.id, e.id)}
                          title={isExec ? (set.has(e.id) ? "Remove from team" : "Add to team") : "Admin controlled"}>
                          <span className="tcavatar">{e.full_name[0]}</span>{e.full_name}
                          <span className="tcmark">{set.has(e.id) ? I.check : "+"}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}

/* ---------- Chat v1: real channels, real messages ---------- */
function ChatScreen({ session }) {
  const [channels, setChannels] = useState(null);
  const [chan, setChan] = useState(null);
  const [msgs, setMsgs] = useState(null);
  const [draft, setDraft] = useState("");
  const endRef = React.useRef(null);
  useEffect(() => {
    supabase.from("channels").select("*").order("name").then(({ data }) => {
      setChannels(data ?? []);
      setChan((c) => c ?? (data ?? []).find((x) => x.name === "general") ?? (data ?? [])[0] ?? null);
    });
  }, []);
  useEffect(() => {
    if (!chan) return;
    let on = true;
    const load = () =>
      supabase.from("messages").select("*").eq("channel_id", chan.id)
        .order("created_at", { ascending: false }).limit(100)
        .then(({ data }) => { if (on) setMsgs((data ?? []).reverse()); });
    load();
    const id = setInterval(load, 5000);
    return () => { on = false; clearInterval(id); };
  }, [chan?.id]);
  useEffect(() => { endRef.current?.scrollIntoView({ block: "end" }); }, [msgs?.length, chan?.id]);
  const send = async () => {
    const body = draft.trim();
    if (!body || !chan) return;
    setDraft("");
    await supabase.from("messages").insert({
      channel_id: chan.id, user_id: session.user.id,
      author: (session.user.email ?? "user").split("@")[0], body,
    });
    const { data } = await supabase.from("messages").select("*").eq("channel_id", chan.id)
      .order("created_at", { ascending: false }).limit(100);
    setMsgs((data ?? []).reverse());
  };
  return (
    <>
      <div className="pagehead">
        <div><h1>Messages</h1><div className="sub">Company chat, one channel per department. Append-only history, executive-only deletion. Threads, reactions, attachments, and DMs grow in with the Work Layer.</div></div>
      </div>
      <div className="chatwrap">
        <div className="chanrail">
          {(channels ?? []).map((c) => (
            <button key={c.id} className={`chanbtn ${chan?.id === c.id ? "on" : ""}`} onClick={() => { setMsgs(null); setChan(c); }}>
              <span className="chh">#</span>{c.name}
            </button>
          ))}
        </div>
        <div className="chatmain">
          <div className="chatfeed">
            {msgs === null ? <div className="bnote">Loading #{chan?.name}…</div>
              : msgs.length === 0 ? <div className="bnote">Nothing in #{chan?.name} yet — say the first word.</div>
              : msgs.map((m) => (
                <div key={m.id} className="chatmsg">
                  <span className="tcavatar">{m.author[0]?.toUpperCase()}</span>
                  <div>
                    <div className="cmh"><b>{m.author}</b><em>{new Date(m.created_at).toLocaleString()}</em></div>
                    <div className="cmb">{m.body}</div>
                  </div>
                </div>
              ))}
            <div ref={endRef} />
          </div>
          <div className="chatbox">
            <input value={draft} placeholder={chan ? `Message #${chan.name}…` : "Pick a channel"}
              onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") send(); }} />
            <button className="btn" onClick={send}>Send</button>
          </div>
        </div>
      </div>
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
  const [launcher, setLauncher] = useState(false);
  useEffect(() => {
    const WORK = new Set(["brain", "tasks", "teams", "planner", "dashboards", "whiteboards", "templates", "spaces"]);
    document.documentElement.dataset.realm = WORK.has(view) ? "work" : "ops";
  }, [view]);
  const [listening, setListening] = useState(false);
  const [dictation, setDictation] = useState(null);
  const startMic = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { setDictation("__unsupported__"); setView("brain"); return; }
    try {
      const r = new SR();
      r.lang = "en-US"; r.interimResults = false;
      r.onresult = (ev) => { setDictation(ev.results[0][0].transcript); setView("brain"); };
      r.onend = () => setListening(false);
      r.onerror = () => setListening(false);
      setListening(true); r.start();
    } catch { setListening(false); }
  };
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
    brain: <BrainScreen session={session} go={setView} isExec={isExec} dictation={dictation} />,
    teams: <TeamsScreen session={session} isExec={isExec} />,
    planner: <PlannerScreen go={setView} />,
    dashboards: <DashboardsScreen session={session} go={setView} />,
    whiteboards: <WhiteboardsScreen session={session} />,
    tasks: <TasksScreen session={session} />,
    messages: <ChatScreen session={session} />,
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
      {launcher && <Launcher onGo={setView} onClose={() => setLauncher(false)} />}
      <header className="topnav">
        <div className="tlogo"><img src="/tg-mark.png" alt="Twisted Growers" style={{ width: 34, height: 34, borderRadius: "50%" }} /><span className="tword">Twisted <b>Growers</b></span></div>
        <button className="tibtn launchbtn" title="Open TG Workspace" onClick={() => setLauncher(true)}>{I.apps}</button>
        <div className="tdivider" />
        <div className="tcrumb">{current ? `${current.category} / ${current.label}` : view === "alerts" ? "Command / Alerts & Reminders" : "Command / Control Tower"}</div>
        <div className="tspacer" />
        <span className="tpill"><span className="d" /> LIVE</span>
        <div className="tuser">
          <button className="tibtn" title="Control Tower" onClick={() => setView("tower")}>{I.gauge}</button>
          <button className="tibtn" title="Tasks" onClick={() => setView("tasks")}>{I.check}</button>
          <button className="tibtn" title="Dashboards" onClick={() => setView("dashboards")}>{I.grid}</button>
          <button className="tibtn" title="Whiteboards" onClick={() => setView("whiteboards")}>{I.board}</button>
          <button className={`tibtn ${listening ? "listening" : ""}`} title="Talk to type — dictates into Brain" onClick={startMic}>{I.mic}</button>
          <TimeTools session={session} />
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
                <div className="ulabel">Personal tools</div>
                <button className="uitem" onClick={() => { setUserMenu(false); setView("tasks"); }}>{I.check} Create task</button>
                <button className="uitem" onClick={() => { setUserMenu(false); setView("whiteboards"); }}>{I.board} Create whiteboard</button>
                <button className="uitem" onClick={() => { setUserMenu(false); setView("dashboards"); }}>{I.grid} My dashboard</button>
                <button className="uitem" onClick={() => { setUserMenu(false); setView("planner"); }}>{I.clock} Planner</button>
                <button className="uitem" onClick={() => { setUserMenu(false); startMic(); }}>{I.mic} Talk to text</button>
                <button className="uitem" onClick={() => { setUserMenu(false); setView("brain"); }}>{I.dna} Ask Brain</button>
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
