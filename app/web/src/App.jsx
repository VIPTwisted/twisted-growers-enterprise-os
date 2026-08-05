import React, { useEffect, useState, useCallback } from "react";
import jsQR from "jsqr";
import { supabase, FUNCTIONS_URL } from "./lib/supabase.js";
import { BudzScreen, CeoDashboard } from "./budz.jsx";

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
  useEffect(() => {
    const h = () => setOpen(true);
    window.addEventListener("tg-open-timetools", h);
    return () => window.removeEventListener("tg-open-timetools", h);
  }, []);
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
      lots_rts_missing_coa: { label: "Ready-To-Ship Lots Missing Certificate of Analysis", icon: I.shield, drill: "lots" },
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
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth?.user?.id;
      const [{ data: rows }, { data: me }] = await Promise.all([
        supabase.from("nav_registry").select("*").eq("enabled", true).order("category_order").order("item_order"),
        uid ? supabase.from("app_users").select("role").eq("user_id", uid).maybeSingle() : Promise.resolve({ data: null }),
      ]);
      const role = me?.role ?? "guest";
      const { data: vis } = await supabase.from("nav_role_visibility").select("view_key, visible").eq("role", role);
      const hidden = new Set((vis ?? []).filter((v) => !v.visible).map((v) => v.view_key));
      setNav((rows ?? []).filter((r) => !hidden.has(r.view_key)));
    })();
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
/* Forensic seed-to-sale trace — available from every row on every page. */
const TRACE_KEYS = ["tag", "package_tag", "harvest", "harvest_name", "manifest_number", "identifier",
  "record", "subject", "name", "strain", "cultivar", "cultivars", "item", "item_name", "material_name",
  "product_route", "customer", "scope", "source_ref", "detail", "room", "location", "flower_room"];
/* Seed-to-sale summary strip shown inside every drill-down we can identify. */
function SeedToSaleSummary({ term }) {
  const [d, setD] = useState(undefined);
  useEffect(() => {
    let live = true;
    (async () => {
      const [{ data: life }, { data: grade }, { data: alloc }, { data: locs }] = await Promise.all([
        supabase.from("v_harvest_lifecycle").select("*").ilike("harvest", `%${term}%`).limit(1),
        supabase.from("harvest_weights").select("*").ilike("metrc_harvest_batch", `%${term}%`).limit(1),
        supabase.from("v_allocation_queue").select("*").or(`material_name.ilike.%${term}%,source_ref.ilike.%${term}%`).limit(4),
        supabase.from("v_inventory_locator").select("location,stage,quantity,uom,days_here,category")
          .or(`item.ilike.%${term}%,identifier.ilike.%${term}%,source_lineage.ilike.%${term}%`).limit(6),
      ]);
      if (live) setD({ life: life?.[0] ?? null, grade: grade?.[0] ?? null, alloc: alloc ?? [], locs: locs ?? [] });
    })();
    return () => { live = false; };
  }, [term]);
  if (d === undefined) return <div className="note" style={{ margin: "10px 0" }}>Loading the seed to sale picture…</div>;
  const L = d.life, G = d.grade;
  const money = (v, u) => (v == null ? "not recorded" : `${Number(v).toLocaleString()} ${u ?? ""}`);
  return (
    <div className="stsbox">
      <div className="stshead">Seed to sale — {term}</div>
      <div className="stsgrid">
        <div><label>Total wet weight</label><b>{money(L?.wet_lbs, "lb")}</b></div>
        <div><label>Waste</label><b className={L?.waste_pct > 10 ? "hotv" : ""}>{money(L?.waste_lbs, "lb")}{L?.waste_pct != null ? ` (${L.waste_pct}%)` : ""}</b></div>
        <div><label>Packaged / yield</label><b>{money(L?.packaged_lbs, "lb")}{L?.yield_pct != null ? ` (${L.yield_pct}%)` : ""}</b></div>
        <div><label>Versus plan</label><b className={L?.lbs_vs_plan < 0 ? "hotv" : ""}>{L?.lbs_vs_plan != null ? `${L.lbs_vs_plan > 0 ? "+" : ""}${L.lbs_vs_plan} lb` : "no plan matched"}</b></div>
        <div><label>Grade A buds</label><b>{money(G?.grade_a_lb, "lb")}</b></div>
        <div><label>Grade B buds</label><b>{money(G?.grade_b_lb, "lb")}</b></div>
        <div><label>Grade C / smalls</label><b>{money(G?.grade_c_smalls_lb, "lb")}</b></div>
        <div><label>Trim</label><b>{money(G?.trim_lb, "lb")}</b></div>
        <div><label>Stage now</label><b>{L?.drying_status ?? "—"}</b></div>
        <div><label>Weights</label><b className={String(L?.weights_status ?? "").includes("NOT") ? "hotv" : ""}>{L?.weights_status ?? "—"}</b></div>
        <div><label>Packages made</label><b>{L?.packages_made ?? 0}</b></div>
        <div><label>Shipped out</label><b>{L?.packages_shipped ?? 0}</b></div>
      </div>
      <div className="stsrow">
        <label>Where it sits in the facility</label>
        {d.locs.length === 0 ? <span className="note">Nothing currently located under this name.</span>
          : d.locs.map((l, i) => (
            <span key={i} className="schip info">{l.location} · {Number(l.quantity).toLocaleString()} {l.uom} · {l.stage}{l.days_here != null ? ` · ${l.days_here}d` : ""}</span>
          ))}
      </div>
      <div className="stsrow">
        <label>Allocation</label>
        {d.alloc.length === 0
          ? <span className="note">No allocation request recorded for this material yet.</span>
          : d.alloc.map((a) => (
            <span key={a.request_no} className={`schip ${chipTone(a.status)}`}>
              #{a.request_no} {a.quantity}{a.uom} → {a.destination} · {a.requester_name ?? "requester"} → {a.decider_name ?? "awaiting decision"} ({a.status})
            </span>
          ))}
      </div>
      {L?.verdict && <div className="stsrow"><label>Verdict</label><span className={`schip ${chipTone(L.verdict)}`}>{L.verdict}</span></div>}
      {(G == null) && <div className="note" style={{ marginTop: 6 }}>Grade A, B, C and trim weights come from Weights and Grading — record them there and they appear here automatically.</div>}
    </div>
  );
}
function TraceDrawer({ term, onClose }) {
  const [rows, setRows] = useState(null);
  useEffect(() => {
    supabase.rpc("tg_trace", { p_term: term }).then(({ data, error }) => setRows(error ? [] : (data ?? [])));
  }, [term]);
  const phases = rows ? [...new Set(rows.map((r) => r.phase))].sort() : [];
  return (
    <div className="vedrawerwrap" onClick={onClose}>
      <div className="vedrawer" style={{ width: "min(760px, 96vw)" }} onClick={(e) => e.stopPropagation()}>
        <div className="srhead">
          <span className="srtitle">Seed to sale history — {term}</span>
          <button className="btn small ghost" onClick={onClose}>✕</button>
        </div>
        {rows === null ? <div className="note" style={{ padding: 14 }}>Tracing every record…</div>
          : rows.length === 0 ? <div className="empty"><div className="eicon">{I.dna}</div><b>Nothing traced</b>No linked records found for this term.</div>
          : (
            <>
              <div className="statchips" style={{ margin: "8px 0 12px" }}>
                {phases.map((ph) => <span key={ph} className="schip info"><b>{rows.filter((r) => r.phase === ph).length}</b> {ph.replace(/^\d\s/, "")}</span>)}
                <span className="schl">{rows.length} events in the chain</span>
              </div>
              <div className="tablewrap"><table>
                <thead><tr><th>Date</th><th>Stage</th><th>Event</th><th>Quantity</th><th>Location</th><th>Status</th><th>Document</th></tr></thead>
                <tbody>{rows.map((r, i) => (
                  <tr key={i}>
                    <td style={{ whiteSpace: "nowrap" }}>{r.event_date ?? "—"}</td>
                    <td><span className="schip info">{String(r.phase).replace(/^\d\s/, "")}</span></td>
                    <td>{r.event}{r.subject ? <div className="note">{r.subject}</div> : null}</td>
                    <td style={{ fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
                      {r.quantity != null ? `${Number(r.quantity).toLocaleString()} ${r.uom ?? ""}` : "—"}</td>
                    <td className="note">{r.location ?? "—"}</td>
                    <td>{r.status ? <span className={`schip ${chipTone(r.status)}`}>{r.status}</span> : "—"}</td>
                    <td>{r.document_link
                      ? <a className="btn small ghost" href={r.document_link} target="_blank" rel="noreferrer">Open</a>
                      : "—"}</td>
                  </tr>
                ))}</tbody>
              </table></div>
            </>
          )}
      </div>
    </div>
  );
}
function RawRow({ row, cols }) {
  const [open, setOpen] = useState(false);
  const [showRaw, setShowRaw] = useState(false);
  const [trace, setTrace] = useState(null);
  const traceTerm = TRACE_KEYS.map((k) => row[k]).find((v) => typeof v === "string" && v.trim().length > 2);
  return (
    <>
      {trace && <TraceDrawer term={trace} onClose={() => setTrace(null)} />}
      <tr onClick={() => setOpen(!open)} style={{ cursor: "pointer" }}>
        {cols.map((c) => <td key={c}>{cellView(c, row[c])}</td>)}
      </tr>
      {open && (
        <tr>
          <td colSpan={cols.length} className="detailcell">
            <div className="dhead">
              <span className="dtitle">Full record — every field, microscopic</span>
              {traceTerm && (
                <button className="dtoggle" style={{ borderColor: "var(--neon-line)", color: "var(--neon)" }}
                  onClick={(e) => { e.stopPropagation(); setTrace(traceTerm); }}>
                  Seed to sale history
                </button>
              )}
              <button className="dtoggle" onClick={(e) => { e.stopPropagation(); setShowRaw(!showRaw); }}>
                {showRaw ? "Readable view" : "Raw payload (audit)"}
              </button>
            </div>
            {showRaw
              ? <pre className="drawjson">{JSON.stringify(row, null, 2)}</pre>
              : <>
                  {traceTerm && <SeedToSaleSummary term={traceTerm} />}
                  <DetailGrid obj={row} />
                </>}
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
const STATUS_COLS = ["status", "state", "source_state", "approval", "release", "exception_code", "room_cycle_flag",
  "loss_type", "reason_code", "verdict", "stage", "current_stage", "severity", "delivery_status", "phase",
  "accountability_status", "coa_status", "compliance_status", "reconciliation_status", "lab_state",
  "lab_testing_state", "flag", "alert", "takedown_status", "drying_status", "weights_status", "timing",
  "next_event", "room_type", "policy_scope", "coa_status", "shipment_type", "direction"];
/* SITEWIDE STATUS COLOUR CODE - one classifier every page shares.
   red = loss or exposure · orange = needs attention · yellow = waiting
   green = good and sellable · blue = money in or moving · gold = free goods */
const chipTone = (v) => {
  const s = String(v).toLowerCase();
  if (/(destroy|waste|wasted|missing|lost|unaccounted|shrink|theft|stolen|discrepan|shortage|fail|recall|investigat|violation|critical|denied|reject|void|blocked|expired|do not sell)/.test(s)) return "bad";
  if (/(hold|onhold|on hold|overdue|late|elevated|at risk|unconfirmed|not confirmed|aging|remediat|quarant|no_show|called_out)/.test(s)) return "hot";
  if (/(pend|submit|await|testing|review|watch|due|in progress|in_progress|drying|curing|planned|scheduled|open|requested|propagation)/.test(s)) return "warn";
  if (/(sold|shipped|in transit|intransit|delivered|received|closed|invoiced|paid|leaving)/.test(s)) return "info";
  if (/(free|freebie|sample|promo|donation|comp)/.test(s)) return "gold";
  if (/(active|in stock|sellable|passed|testpassed|retestpassed|released|complete|done|finished|approved|reconciled|ok|clear|connected|full custody|on plan|worked|rts|growing|flowering|vegetative)/.test(s)) return "good";
  if (/(inactive|retired|harvested|archived|not submitted|notsubmitted)/.test(s)) return "neutral";
  return "info";
};
/* Sitewide color code inside every table: red = issue, green = good, amber = watch, blue = neutral info */
const ISSUE_COL = /(violation|overdue|blocked|late|missing|error|exception|flag|alert|expired|discrepan)/;
const cellView = (col, v) => {
  if (v === true || v === false) {
    if (ISSUE_COL.test(col)) return <span className={`schip ${v ? "bad" : "good"}`}>{v ? "ISSUE" : "OK"}</span>;
    return v ? "yes" : "no";
  }
  if (v != null && v !== "" && typeof v === "string" && (STATUS_COLS.includes(col) || ISSUE_COL.test(col))) {
    return <span className={`schip ${chipTone(v)}`}>{formatCell(v)}</span>;
  }
  return formatCell(v);
};
/* QuickBooks-style date ranges — one dropdown, every date filter in the OS */
const DATE_PRESETS = [
  ["all", "All dates"], ["today", "Today"], ["yesterday", "Yesterday"],
  ["this_week", "This week"], ["this_month", "This month"], ["this_quarter", "This quarter"], ["this_year", "This year"],
  ["last_week", "Last week"], ["last_month", "Last month"], ["last_quarter", "Last quarter"], ["last_year", "Last year"],
  ["last_30", "Last 30 days"], ["last_90", "Last 90 days"], ["ytd", "Year to date"], ["custom", "Custom range…"],
];
function presetRange(key) {
  const d = new Date(); const y = d.getFullYear(), m = d.getMonth(), dt = d.getDate(), dow = d.getDay();
  const q = Math.floor(m / 3);
  const iso = (x) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
  switch (key) {
    case "today": return [iso(d), iso(d)];
    case "yesterday": { const t = new Date(y, m, dt - 1); return [iso(t), iso(t)]; }
    case "this_week": return [iso(new Date(y, m, dt - dow)), iso(new Date(y, m, dt - dow + 6))];
    case "this_month": return [iso(new Date(y, m, 1)), iso(new Date(y, m + 1, 0))];
    case "this_quarter": return [iso(new Date(y, q * 3, 1)), iso(new Date(y, q * 3 + 3, 0))];
    case "this_year": return [iso(new Date(y, 0, 1)), iso(new Date(y, 11, 31))];
    case "last_week": return [iso(new Date(y, m, dt - dow - 7)), iso(new Date(y, m, dt - dow - 1))];
    case "last_month": return [iso(new Date(y, m - 1, 1)), iso(new Date(y, m, 0))];
    case "last_quarter": return [iso(new Date(y, (q - 1) * 3, 1)), iso(new Date(y, q * 3, 0))];
    case "last_year": return [iso(new Date(y - 1, 0, 1)), iso(new Date(y - 1, 11, 31))];
    case "last_30": return [iso(new Date(y, m, dt - 30)), iso(d)];
    case "last_90": return [iso(new Date(y, m, dt - 90)), iso(d)];
    case "ytd": return [iso(new Date(y, 0, 1)), iso(d)];
    default: return ["", ""];
  }
}
function DateRangeSelect({ label, from, to, onFrom, onTo }) {
  const [preset, setPreset] = useState("all");
  const shown = !from && !to ? "all" : preset;
  const pick = (k) => {
    setPreset(k);
    if (k === "custom") return;
    const [f, t] = presetRange(k);
    onFrom(f); onTo(t);
  };
  return (
    <>
      <span className="flab">{label}</span>
      <select className="fdate" value={shown} onChange={(e) => pick(e.target.value)}>
        {DATE_PRESETS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
      </select>
      <input type="date" className="fdate" value={from} onChange={(e) => { setPreset("custom"); onFrom(e.target.value); }} />
      <span className="flab">to</span>
      <input type="date" className="fdate" value={to} onChange={(e) => { setPreset("custom"); onTo(e.target.value); }} />
    </>
  );
}
function ModuleScreen({ entry, actions }) {
  const [count, setCount] = useState(null);
  const [rows, setRows] = useState(null);
  const [brk, setBrk] = useState(null);
  const [sample, setSample] = useState(null);
  const [qLive, setQLive] = useState("");
  const [q, setQ] = useState("");
  const [statusSel, setStatusSel] = useState(null);
  const [dimSel, setDimSel] = useState({});
  const [dims, setDims] = useState({});
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
  const dateCol = sample ? Object.keys(sample).find((k) => /(_date|_on$|_on_|_at$|^date|^month|period)/.test(k)) : null;
  const statusCol = sample ? STATUS_COLS.find((k) => k in sample) : null;
  const filtered = !!(q || statusSel || dFrom || dTo || Object.values(dimSel).some(Boolean));

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
        {actions}
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
            <DateRangeSelect label={dateCol.replaceAll("_", " ")} from={dFrom} to={dTo} onFrom={setDFrom} onTo={setDTo} />
          )}
          {(filtered || sort) && (
            <button className="btn small ghost" onClick={() => { setQ(""); setQLive(""); setStatusSel(null); setDFrom(""); setDTo(""); setSort(null); }}>Clear</button>
          )}
          <span style={{ flex: 1 }} />
          <button className="btn small ghost" onClick={async () => {
            let qy = supabase.from(entry.table_ref).select("*");
            const term = q.replace(/[%,()]/g, " ").trim();
            if (term && textCols.length) qy = qy.or(textCols.map((c) => `${c}.ilike.%${term}%`).join(","));
            if (statusSel && statusCol) qy = qy.eq(statusCol, statusSel);
            if (dateCol && dFrom) qy = qy.gte(dateCol, dFrom);
            if (dateCol && dTo) qy = qy.lte(dateCol, dTo);
            if (sort) qy = qy.order(sort.col, { ascending: sort.asc });
            const { data } = await qy.limit(1000);
            const rowsX = data ?? [];
            if (!rowsX.length) return;
            const keys = Object.keys(rowsX[0]).filter((k) => k !== "raw" && typeof rowsX[0][k] !== "object");
            const esc = (v) => v == null ? "" : /[",\n]/.test(String(v)) ? '"' + String(v).replaceAll('"', '""') + '"' : String(v);
            const csv = [keys.join(","), ...rowsX.map((r) => keys.map((k) => esc(r[k])).join(","))].join("\n");
            const a = document.createElement("a");
            a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
            a.download = `${entry.view_key}-${new Date().toISOString().slice(0, 10)}.csv`;
            a.click();
            URL.revokeObjectURL(a.href);
          }}>Export CSV</button>
          <button className="btn small ghost" onClick={() => window.print()}>Print</button>
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
function MetrcMirror({ license }) {
  const [counts, setCounts] = useState({});
  const [tab, setTab] = useState(MIRROR_SETS[0].key);
  const [rows, setRows] = useState(null);
  useEffect(() => {
    setCounts({});
    MIRROR_SETS.forEach((s) => {
      let q = supabase.from(s.key).select("*", { count: "exact", head: true });
      if (license) q = q.eq("license", license);
      q.then(({ count }) => setCounts((c) => ({ ...c, [s.key]: count ?? 0 })));
    });
  }, [license]);
  useEffect(() => {
    setRows(null);
    let q = supabase.from(tab).select("*").order("id", { ascending: false }).limit(25);
    if (license) q = q.eq("license", license);
    q.then(({ data }) => setRows(data ?? []));
  }, [tab, license]);
  const cols = rows?.length
    ? Object.keys(rows[0]).filter((k) =>
        k !== "raw" && k !== "id" && !k.endsWith("_id") && typeof rows[0][k] !== "object").slice(0, 9)
    : [];
  return (
    <>
      <div className="pagehead">
        <div>
          <h1>{license ? `Metrc — ${license}` : "Metrc"}</h1>
          <div className="sub">{license
            ? `${license === "MC281714" ? "Cultivation" : "Manufacturing"} license only — every synced dataset filtered to ${license}. Every row expands to the complete raw payload.`
            : "The entire seed-to-sale platform, synced into your own database — every dataset the state API allows, full history. Every row expands to the complete raw Metrc payload: microscopic auditing, one click deep."}</div>
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
  ["metrc_packages", "Metrc Packages", "#00d4ff", "metrc_mirror", "box"],
  ["metrc_plants", "Metrc Plants", "#5cff92", "metrc_mirror", "leafline"],
  ["metrc_harvests", "Metrc Harvests", "#00e676", "metrc_mirror", "scale"],
  ["metrc_transfers", "Transfers", "#ffea00", "metrc_mirror", "truck"],
  ["harvest_schedule", "Harvest Events", "#2df26a", "harvest_schedule", "clock"],
  ["lots", "Lots", "#ff8a00", "lots", "flask"],
  ["employees", "Employees", "#ff2e9e", "people", "users"],
];
function useLiveCounts() {
  const [c, setC] = useState(null);
  useEffect(() => {
    Promise.all(KPI_TABLES.map(([t]) =>
      supabase.from(t).select("*", { count: "exact", head: true }).then(({ count }) => count ?? 0)
    )).then((counts) => setC(KPI_TABLES.map(([t, l, col, drill, icon], i) => ({ t, l, col, drill, icon, n: counts[i] }))));
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
      return { n: count ?? 0, unit: "Certificates of Analysis tracked", lines: (data ?? []).map((r) => [r.coa_number ?? "COA", `${r.status ?? "—"}${r.submitted_on ? ` · ${r.submitted_on}` : ""}`]) };
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
  { key: "sched", title: "Employee Schedule Today", drill: "emp_schedule", color: "#57a9ff", icon: "users",
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
  { key: "harvest_cal", label: "8-Week Harvest Calendar", fn: null, live: false,
    desc: "Loaded from the .xlsm on Aug 5 (26 pulls, 141 cultivar rows, 2-day SOP, labor calc). Share the workbook as a Google Sheet to turn on one-button re-sync." },
  { key: "quickbooks", label: "QuickBooks Online", fn: null, live: false,
    desc: "Invoices, payments, expenses, customers — connects once Intuit app keys are stored." },
  { key: "monday", label: "Monday.com", fn: null, live: false,
    desc: "One-way board sync (idempotent upserts, conflict queue) — connects once workspace/board IDs are stored." },
  { key: "clickup", label: "ClickUp", fn: "clickup-sync", live: true,
    desc: "Pulls every space, list, and task (open + closed, subtasks, custom fields) from your ClickUp workspace. Needs the API token stored in Integrations." },
];
function parseSyncResponse(src, j) {
  const item = { label: src.label, ok: !!j.ok, total: 0, details: [], skipped: [], errors: [] };
  if (!j.ok) { item.errors.push(j.error ?? "Unknown error"); return item; }
  if (typeof j.total === "number") item.total = j.total;
  for (const [k, v] of Object.entries(j.results ?? {})) {
    if (k.startsWith("_")) continue;
    const s = Array.isArray(v) ? v.join("; ") : String(v);
    if (/^ERROR/i.test(s)) { item.errors.push(`${k}: ${s.slice(0, 160)}`); continue; }
    if (/skipped/i.test(s)) { item.skipped.push(`${k}: ${s.slice(0, 160)}`); continue; }
    if (/sub-state errors/i.test(s)) item.skipped.push(`${k}: ${s.slice(0, 160)}`);
    const m = s.match(/^(\d+)/);
    if (m) item.total += Number(m[1]);
    else if (typeof v === "number") item.total += v;
    item.details.push(`${k}: ${s.slice(0, 160)}`);
  }
  if (item.errors.length && !item.details.length) item.ok = false;
  return item;
}
function SyncCenter({ session }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(null);
  const [report, setReport] = useState(null);
  const runOne = async (src) => {
    try {
      const r = await fetch(`${FUNCTIONS_URL}/${src.fn}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      });
      return parseSyncResponse(src, await r.json());
    } catch (e) {
      return { label: src.label, ok: false, total: 0, details: [], skipped: [], errors: [String(e).slice(0, 160)] };
    }
  };
  const run = async (sources) => {
    setBusy(true);
    const items = [];
    for (const s of sources) items.push(await runOne(s));
    setBusy(false);
    setOpen(false);
    setReport({ when: new Date().toLocaleTimeString(), items });
  };
  return (
    <div className="syncwrap">
      <button className="btn syncbtn" onClick={() => setOpen((v) => !v)}>{I.plug} Sync</button>
      {open && (
        <div className="syncpanel">
          <div className="sphead">
            <span>Sync Center</span>
            <span style={{ display: "flex", gap: 8 }}>
              <button className="btn small" disabled={busy} onClick={() => run(SYNC_SOURCES.filter((x) => x.live))}>
                {busy ? "Syncing…" : "Sync all"}
              </button>
              <button className="btn small ghost" onClick={() => setOpen(false)} title="Close">✕</button>
            </span>
          </div>
          {SYNC_SOURCES.map((s) => (
            <div key={s.key} className="sprow">
              <div className="spmain">
                <div className="spname">{s.label}{!s.live && <span className="mtag">SOON</span>}</div>
                <div className="spdesc">{busy && s.live ? "Syncing — results will open when finished…" : s.desc}</div>
              </div>
              <button className="btn small" disabled={!s.live || busy} onClick={() => run([s])}>
                {busy ? "…" : "Sync"}
              </button>
            </div>
          ))}
        </div>
      )}
      {report && (
        <div className="syncreport" onClick={() => setReport(null)}>
          <div className="srcard" onClick={(e) => e.stopPropagation()}>
            <div className="srhead">
              <span className="srtitle">Sync results · {report.when}</span>
              <button className="btn small ghost" onClick={() => setReport(null)}>✕</button>
            </div>
            {report.items.map((it) => (
              <div key={it.label} className="srsource">
                <div className={`srverdict ${it.ok ? "ok" : "bad"}`}>
                  {it.ok ? I.check : I.shield}
                  <b>{it.label}</b>
                  <span>{it.ok ? "Sync successful" : "Sync failed"}</span>
                  <em>{it.total.toLocaleString()} item{it.total === 1 ? "" : "s"} synced</em>
                </div>
                {it.details.length > 0 && (
                  <div className="srlist">
                    {it.details.map((d, i) => <div key={i} className="srline">{d}</div>)}
                  </div>
                )}
                {it.skipped.length > 0 && (
                  <div className="srlist warn">
                    <div className="srlabel">Skipped / partial</div>
                    {it.skipped.map((d, i) => <div key={i} className="srline">{d}</div>)}
                  </div>
                )}
                {it.errors.length > 0 && (
                  <div className="srlist bad">
                    <div className="srlabel">Errors</div>
                    {it.errors.map((d, i) => <div key={i} className="srline">{d}</div>)}
                  </div>
                )}
              </div>
            ))}
            <button className="btn" style={{ marginTop: 12 }} onClick={() => setReport(null)}>Done</button>
          </div>
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
                <div className="chip" style={{ background: k.col, color: "#07130b" }}>{iconByName(k.icon)}</div>
                <div className="body">
                  <div className="metric">{k.l}</div>
                  <div className="vrow"><div className="value">{k.n.toLocaleString()}</div><div className="state">records</div></div>
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
          )}
        </div>
      ))}
      {rows && <div className="note" style={{ marginTop: 18 }}>Zeros before operating data is connected mean “no records yet”, not “all clear”. Connect Metrc and load operations to make this board speak.</div>}
    </>
  );
}

/* ---------- TG Brain: the company's mind — intro, role personalization; engine lands M5 ---------- */
const BRAIN_ROLES = ["Owner / CEO", "COO / Operations", "CFO / Finance", "Cultivation", "Manufacturing", "Sales", "Human Resources", "Compliance / Quality Assurance"];
const BRAIN_ORBIT = [
  { icon: "leafline", label: "Cultivation" }, { icon: "box", label: "Inventory" },
  { icon: "flask", label: "Testing" }, { icon: "truck", label: "Transfers" },
  { icon: "dollar", label: "Cash" }, { icon: "users", label: "Human Resources" },
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
  { key: "people", label: "Human Resources", drill: "people",
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
/* ---------- Views engine: the OS working like ClickUp — tabbed saved views over tasks ---------- */
const TASK_STATUSES = [["todo", "TO DO"], ["in_progress", "IN PROGRESS"], ["blocked", "BLOCKED"], ["done", "DONE"]];
const VE_STATUS_COLOR = { todo: "#8d9a93", in_progress: "#57a9ff", blocked: "#f5222d", done: "#2df26a" };
const VE_FIELDS = [
  ["status", "Status"], ["assignee", "Owner"], ["priority", "Priority"], ["start_on", "Start"],
  ["due_on", "Due date"], ["tags", "Tags"], ["budget", "Budget"], ["updated_at", "Last updated"], ["description", "Notes"],
];
const VE_GROUPS = [["status", "Status"], ["priority", "Priority"], ["assignee", "Owner"], ["none", "No grouping"]];
const VE_TYPES = [["list", "List"], ["board", "Board"], ["table", "Table"], ["calendar", "Calendar"]];
function TasksScreen({ session }) {
  const uid = session.user.id;
  const [views, setViews] = useState(null);
  const [active, setActive] = useState(null);
  const [tasks, setTasks] = useState(null);
  const [emps, setEmps] = useState([]);
  const [ver, setVer] = useState(0);
  const [fieldsOpen, setFieldsOpen] = useState(false);
  const [newView, setNewView] = useState(null);
  const [q, setQ] = useState("");
  const [showClosed, setShowClosed] = useState(true);
  const [collapsed, setCollapsed] = useState({});
  const [drawer, setDrawer] = useState(null);
  const [quickAdd, setQuickAdd] = useState({});
  const [calYm, setCalYm] = useState(() => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() }; });
  useEffect(() => {
    supabase.from("saved_views").select("*").eq("collection", "tasks").order("position")
      .then(({ data }) => { setViews(data ?? []); setActive((a) => a ?? (data ?? [])[0] ?? null); });
  }, []);
  useEffect(() => {
    Promise.all([
      supabase.from("tasks").select("*").order("created_at", { ascending: false }),
      supabase.from("employees").select("id, full_name").is("terminated_on", null).order("full_name"),
    ]).then(([t, e]) => { setTasks(t.data ?? []); setEmps(e.data ?? []); });
  }, [ver]);
  const empName = (id) => emps.find((e) => e.id === id)?.full_name ?? null;
  const today = new Date().toISOString().slice(0, 10);
  const shown = active?.shown_fields ?? ["status", "assignee", "priority", "due_on", "tags"];
  const groupBy = active?.group_by ?? "status";
  const mineView = active && active.owner === uid;
  const persistView = async (patch) => {
    if (!active) return;
    const next = { ...active, ...patch };
    setActive(next);
    setViews((s) => s.map((v) => (v.id === next.id ? next : v)));
    if (mineView) await supabase.from("saved_views").update(patch).eq("id", active.id);
  };
  const createView = async (type) => {
    const name = (newView?.name ?? "").trim() || VE_TYPES.find(([k]) => k === type)?.[1] || "View";
    const { data } = await supabase.from("saved_views").insert({
      collection: "tasks", name, view_type: type, owner: uid, is_private: true,
      group_by: type === "board" ? "status" : type === "table" || type === "calendar" ? "none" : "status",
      position: 200,
    }).select().single();
    if (data) { setViews((s) => [...s, data]); setActive(data); }
    setNewView(null);
  };
  const deleteView = async (v) => {
    if (!window.confirm(`Delete view "${v.name}"?`)) return;
    await supabase.from("saved_views").delete().eq("id", v.id);
    setViews((s) => s.filter((x) => x.id !== v.id));
    if (active?.id === v.id) setActive(views.find((x) => x.id !== v.id) ?? null);
  };
  const saveTask = async (id, patch) => {
    await supabase.from("tasks").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id);
    setVer((v) => v + 1);
  };
  const advance = (t) => {
    const order = ["todo", "in_progress", "blocked", "done"];
    const next = order[(order.indexOf(t.status) + 1) % order.length];
    saveTask(t.id, { status: next, completed_at: next === "done" ? new Date().toISOString() : null });
  };
  const addTask = async (groupKey, groupVal) => {
    const title = (quickAdd[groupKey] ?? "").trim();
    if (!title) return;
    const row = { title, created_by: uid, status: "todo", priority: "P2" };
    if (groupBy === "status" && groupVal) row.status = groupVal;
    if (groupBy === "priority" && groupVal) row.priority = groupVal;
    if (groupBy === "assignee" && groupVal && groupVal !== "unassigned") row.assignee_employee_id = groupVal;
    await supabase.from("tasks").insert(row);
    setQuickAdd((s) => ({ ...s, [groupKey]: "" }));
    setVer((v) => v + 1);
  };
  if (views === null || tasks === null) return <div className="empty"><div className="eicon">{I.check}</div>Loading…</div>;
  const vf = active?.filters ?? {};
  const filtered = tasks.filter((t) =>
    (showClosed || t.status !== "done") &&
    (!vf.statuses?.length || vf.statuses.includes(t.status)) &&
    (!vf.priorities?.length || vf.priorities.includes(t.priority ?? "P2")) &&
    (!vf.needs_attention || t.status === "blocked" || ((t.priority === "P0" || t.priority === "P1") && t.status !== "done") || (t.due_on && t.due_on < today && t.status !== "done")) &&
    (!q || (t.title + " " + (t.tags ?? []).join(" ") + " " + (empName(t.assignee_employee_id) ?? "")).toLowerCase().includes(q.toLowerCase())));
  const groups = (() => {
    if (groupBy === "none") return [["all", "All tasks", null, filtered]];
    if (groupBy === "priority") {
      return ["P0", "P1", "P2", "P3"].map((p) => [p, p, p === "P0" ? "#f5222d" : p === "P1" ? "#ffea00" : "#57a9ff", filtered.filter((t) => (t.priority ?? "P2") === p)]);
    }
    if (groupBy === "assignee") {
      const ids = [...new Set(filtered.map((t) => t.assignee_employee_id ?? "unassigned"))];
      return ids.map((id) => [id, id === "unassigned" ? "Unassigned" : empName(id) ?? "Unknown", "#57a9ff", filtered.filter((t) => (t.assignee_employee_id ?? "unassigned") === id)]);
    }
    return TASK_STATUSES.map(([k, label]) => [k, label, VE_STATUS_COLOR[k], filtered.filter((t) => t.status === k)]);
  })();
  const cell = (t, f) => {
    switch (f) {
      case "status": return <button key={f} className="vest" style={{ background: VE_STATUS_COLOR[t.status], color: t.status === "todo" ? "#0a0c0b" : "#07130b" }} onClick={(e) => { e.stopPropagation(); advance(t); }}>{TASK_STATUSES.find(([k]) => k === t.status)?.[1] ?? t.status}</button>;
      case "assignee": { const n = empName(t.assignee_employee_id); return n ? <span key={f} className="tkass"><span className="tcavatar">{n[0]}</span>{n}</span> : <span key={f} className="note">—</span>; }
      case "priority": return <span key={f} className={`schip ${t.priority === "P0" ? "bad" : t.priority === "P1" ? "warn" : "info"}`}>{t.priority ?? "P2"}</span>;
      case "start_on": return <span key={f} className="note">{t.start_on ?? "—"}</span>;
      case "due_on": return <span key={f} className={`tkdue ${t.due_on && t.due_on < today && t.status !== "done" ? "over" : ""}`}>{t.due_on ?? "—"}</span>;
      case "tags": return <span key={f}>{(t.tags ?? []).map((tag) => <span key={tag} className="tktag">#{tag}</span>)}</span>;
      case "budget": return <span key={f} className="note">{t.budget != null ? "$" + Number(t.budget).toLocaleString() : "—"}</span>;
      case "updated_at": return <span key={f} className="note">{t.updated_at ? new Date(t.updated_at).toLocaleDateString() : "—"}</span>;
      case "description": return <span key={f} className="note" style={{ maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.description ?? "—"}</span>;
      default: return null;
    }
  };
  const iso = (d) => `${calYm.y}-${String(calYm.m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  return (
    <>
      <div className="pagehead">
        <div><h1>Tasks & Boards</h1><div className="sub">Your work, your views — list, board, table, calendar. Views are private by default; share one and the whole team sees it.</div></div>
      </div>
      <div className="vetabs">
        {views.map((v) => (
          <button key={v.id} className={`vetab ${active?.id === v.id ? "on" : ""}`} onClick={() => setActive(v)}>
            {v.name}{v.is_private && v.owner === uid ? <span className="mtag">PRIVATE</span> : null}
            {v.owner === uid && active?.id === v.id && <span className="vex" onClick={(e) => { e.stopPropagation(); deleteView(v); }}>×</span>}
          </button>
        ))}
        {newView === null
          ? <button className="vetab add" onClick={() => setNewView({ name: "" })}>+ View</button>
          : (
            <span className="veadd">
              <input autoFocus placeholder="View name…" value={newView.name} onChange={(e) => setNewView({ name: e.target.value })} />
              {VE_TYPES.map(([k, l]) => <button key={k} className="btn small ghost" onClick={() => createView(k)}>{l}</button>)}
              <button className="btn small ghost" onClick={() => setNewView(null)}>✕</button>
            </span>
          )}
      </div>
      <div className="filterbar">
        <span className="flab">Group by</span>
        <select className="fdate" value={groupBy} onChange={(e) => persistView({ group_by: e.target.value })}>
          {VE_GROUPS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <input className="fsearch" style={{ maxWidth: 260 }} placeholder="Search tasks, tags, owners…" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className={`btn small ${showClosed ? "ghost" : ""}`} onClick={() => setShowClosed(!showClosed)}>{showClosed ? "Hide closed" : "Show closed"}</button>
        <button className="btn small ghost" onClick={() => setFieldsOpen(!fieldsOpen)}>Fields</button>
        {mineView && <button className="btn small ghost" onClick={() => persistView({ is_private: !active.is_private })}>{active.is_private ? "Share view" : "Make private"}</button>}
        <span style={{ flex: 1 }} />
        <span className="note">{filtered.length} task{filtered.length === 1 ? "" : "s"}</span>
      </div>
      {fieldsOpen && (
        <div className="panel" style={{ maxWidth: "none", marginBottom: 12 }}>
          <div className="note" style={{ marginBottom: 6 }}>Shown fields{mineView ? " — saved to this view" : " — session only (shared view)"}</div>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            {VE_FIELDS.map(([k, l]) => (
              <label key={k} className="note" style={{ display: "flex", gap: 5, alignItems: "center", cursor: "pointer" }}>
                <input type="checkbox" checked={shown.includes(k)}
                  onChange={() => persistView({ shown_fields: shown.includes(k) ? shown.filter((x) => x !== k) : [...shown, k] })} /> {l}
              </label>
            ))}
          </div>
        </div>
      )}
      {active?.view_type === "board" ? (
        <div className="vecols">
          {groups.map(([gk, glabel, gcolor, list]) => (
            <div key={gk} className="vecol">
              <div className="vecolhead" style={{ background: gcolor ?? "var(--surface-2)", color: "#07130b" }}>{glabel} <b>{list.length}</b></div>
              {list.map((t) => (
                <button key={t.id} className="vecard" onClick={() => setDrawer(t)}>
                  <span className="vct">{t.title}</span>
                  <span className="vcm">{shown.filter((f) => f !== "status").map((f) => cell(t, f))}</span>
                </button>
              ))}
              <input className="veqa" placeholder="+ Add task" value={quickAdd[gk] ?? ""}
                onChange={(e) => setQuickAdd((s) => ({ ...s, [gk]: e.target.value }))}
                onKeyDown={(e) => { if (e.key === "Enter") addTask(gk, gk); }} />
            </div>
          ))}
        </div>
      ) : active?.view_type === "table" ? (
        <div className="tablewrap">
          <table>
            <thead><tr><th>Task</th>{shown.map((f) => <th key={f}>{VE_FIELDS.find(([k]) => k === f)?.[1] ?? f}</th>)}</tr></thead>
            <tbody>
              {filtered.map((t) => (
                <tr key={t.id} onClick={() => setDrawer(t)} style={{ cursor: "pointer" }}>
                  <td>{t.title}</td>
                  {shown.map((f) => <td key={f}>{cell(t, f)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : active?.view_type === "calendar" ? (
        <>
          <div className="calnav" style={{ marginBottom: 10 }}>
            <button className="btn small ghost" onClick={() => setCalYm(({ y, m }) => { const d = new Date(y, m - 1, 1); return { y: d.getFullYear(), m: d.getMonth() }; })}>‹</button>
            <span className="calmonth">{new Date(calYm.y, calYm.m, 1).toLocaleString("en-US", { month: "long", year: "numeric" })}</span>
            <button className="btn small ghost" onClick={() => setCalYm(({ y, m }) => { const d = new Date(y, m + 1, 1); return { y: d.getFullYear(), m: d.getMonth() }; })}>›</button>
          </div>
          <div className="calgrid">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => <div key={d} className="caldow">{d}</div>)}
            {[...Array(new Date(calYm.y, calYm.m, 1).getDay()).fill(null), ...Array.from({ length: new Date(calYm.y, calYm.m + 1, 0).getDate() }, (_, i) => i + 1)].map((d, i) => {
              if (d === null) return <div key={`b${i}`} className="calcell blank" />;
              const k = iso(d);
              const list = filtered.filter((t) => t.due_on === k);
              return (
                <div key={k} className={`calcell ${k === today ? "today" : ""}`}>
                  <span className="caldate">{d}</span>
                  {list.slice(0, 4).map((t) => (
                    <span key={t.id} className="calev" style={{ borderLeftColor: VE_STATUS_COLOR[t.status], cursor: "pointer" }} onClick={() => setDrawer(t)}>{t.title}</span>
                  ))}
                  {list.length > 4 && <span className="calmore">+{list.length - 4} more</span>}
                </div>
              );
            })}
          </div>
        </>
      ) : (
        groups.map(([gk, glabel, gcolor, list]) => (
          <div className="msection vegroup" key={gk}>
            <button className="vegrouphead" onClick={() => setCollapsed((s) => ({ ...s, [gk]: !s[gk] }))}>
              <span className="vegchip" style={{ background: gcolor ?? "var(--surface-2)", color: "#07130b" }}>{glabel}</span>
              <span className="note">{list.length}</span>
              <span className="note" style={{ marginLeft: "auto" }}>{collapsed[gk] ? "▸" : "▾"}</span>
            </button>
            {!collapsed[gk] && (
              <>
                {list.map((t) => (
                  <div key={t.id} className="tkrow" onClick={() => setDrawer(t)} style={{ cursor: "pointer" }}>
                    <span className={`tktitle ${t.status === "done" ? "donetxt" : ""}`}>{t.title}</span>
                    {shown.map((f) => cell(t, f))}
                  </div>
                ))}
                <input className="veqa" placeholder="+ Add task" value={quickAdd[gk] ?? ""}
                  onChange={(e) => setQuickAdd((s) => ({ ...s, [gk]: e.target.value }))}
                  onKeyDown={(e) => { if (e.key === "Enter") addTask(gk, gk); }} />
              </>
            )}
          </div>
        ))
      )}
      {drawer && (
        <div className="vedrawerwrap" onClick={() => setDrawer(null)}>
          <div className="vedrawer" onClick={(e) => e.stopPropagation()}>
            <div className="srhead"><span className="srtitle">Task detail</span><button className="btn small ghost" onClick={() => setDrawer(null)}>✕</button></div>
            <label>Name</label>
            <input defaultValue={drawer.title} onBlur={(e) => e.target.value.trim() && e.target.value !== drawer.title && saveTask(drawer.id, { title: e.target.value.trim() })} />
            <label>Status</label>
            <select defaultValue={drawer.status} onChange={(e) => saveTask(drawer.id, { status: e.target.value, completed_at: e.target.value === "done" ? new Date().toISOString() : null })}>
              {TASK_STATUSES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
            <label>Owner</label>
            <select defaultValue={drawer.assignee_employee_id ?? ""} onChange={(e) => saveTask(drawer.id, { assignee_employee_id: e.target.value || null })}>
              <option value="">Unassigned</option>
              {emps.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
            </select>
            <label>Priority</label>
            <select defaultValue={drawer.priority ?? "P2"} onChange={(e) => saveTask(drawer.id, { priority: e.target.value })}>
              {["P0", "P1", "P2", "P3"].map((p) => <option key={p}>{p}</option>)}
            </select>
            <div style={{ display: "flex", gap: 10 }}>
              <span style={{ flex: 1 }}><label>Start</label>
                <input type="date" defaultValue={drawer.start_on ?? ""} onChange={(e) => saveTask(drawer.id, { start_on: e.target.value || null })} /></span>
              <span style={{ flex: 1 }}><label>Due</label>
                <input type="date" defaultValue={drawer.due_on ?? ""} onChange={(e) => saveTask(drawer.id, { due_on: e.target.value || null })} /></span>
            </div>
            <label>Budget ($)</label>
            <input type="number" defaultValue={drawer.budget ?? ""} onBlur={(e) => saveTask(drawer.id, { budget: e.target.value === "" ? null : Number(e.target.value) })} />
            <label>Tags (comma separated)</label>
            <input defaultValue={(drawer.tags ?? []).join(", ")} onBlur={(e) => saveTask(drawer.id, { tags: e.target.value.split(",").map((x) => x.trim()).filter(Boolean) })} />
            <label>Notes</label>
            <textarea rows={5} defaultValue={drawer.description ?? ""} onBlur={(e) => saveTask(drawer.id, { description: e.target.value || null })} />
            <div className="note" style={{ marginTop: 8 }}>Changes save as you leave each field. Last updated {drawer.updated_at ? new Date(drawer.updated_at).toLocaleString() : "—"}.</div>
          </div>
        </div>
      )}
    </>
  );
}

/* ---------- Where Is Everything: item-level seed-to-sale locator with unit conversion ---------- */
const G_PER = { g: 1, oz: 28.3495, lb: 453.592, kg: 1000 };
const COUNT_UOMS = new Set(["ea", "plants", "each", "units", "count"]);
function convertWeight(qty, uom, target) {
  const n = Number(qty ?? 0);
  if (!uom || COUNT_UOMS.has(String(uom).toLowerCase())) return { n, u: uom ?? "" };
  const grams = n * (G_PER[String(uom).toLowerCase()] ?? 1);
  if (target === "auto") {
    if (grams >= 453592) return { n: grams / 453592, u: "tons" };
    if (grams >= 4535.92) return { n: grams / 453.592, u: "lb" };
    if (grams >= 283.495) return { n: grams / 28.3495, u: "oz" };
    return { n: grams, u: "g" };
  }
  return { n: grams / G_PER[target], u: target };
}
const fmtQty = (v) => (v >= 1000 ? Math.round(v).toLocaleString() : v >= 10 ? v.toFixed(1) : v.toFixed(2));
function InventoryLocator({ go }) {
  const [rows, setRows] = useState(null);
  const [aging, setAging] = useState([]);
  const [unit, setUnit] = useState("auto");
  const [cat, setCat] = useState("");
  const [loc, setLoc] = useState("");
  const [q, setQ] = useState("");
  const [group, setGroup] = useState("location");
  const [open, setOpen] = useState({});
  useEffect(() => {
    supabase.from("v_inventory_locator").select("*").limit(5000).then(({ data }) => setRows(data ?? []));
    supabase.from("v_inventory_aging").select("*").not("severity", "is", null).limit(2000).then(({ data }) => setAging(data ?? []));
  }, []);
  if (rows === null) return <div className="empty"><div className="eicon">{I.box}</div>Loading the facility…</div>;
  const sevOf = (r) => aging.find((a) => a.identifier === r.identifier && a.location === r.location)?.severity ?? null;
  const actOf = (r) => aging.find((a) => a.identifier === r.identifier && a.location === r.location)?.action ?? null;
  const cats = [...new Set(rows.map((r) => r.category))];
  const locs = [...new Set(rows.map((r) => r.location))].sort();
  const filtered = rows.filter((r) =>
    (!cat || r.category === cat) && (!loc || r.location === loc) &&
    (!q || `${r.item} ${r.identifier} ${r.location} ${r.stage} ${r.detail ?? ""} ${r.source_lineage ?? ""}`.toLowerCase().includes(q.toLowerCase())));
  const weightOf = (list) => list.filter((r) => !COUNT_UOMS.has(String(r.uom).toLowerCase()))
    .reduce((a, r) => a + Number(r.quantity ?? 0) * (G_PER[String(r.uom).toLowerCase()] ?? 1), 0);
  const countOf = (list) => list.filter((r) => COUNT_UOMS.has(String(r.uom).toLowerCase())).reduce((a, r) => a + Number(r.quantity ?? 0), 0);
  const showW = (grams) => { const c = convertWeight(grams, "g", unit); return `${fmtQty(c.n)} ${c.u}`; };
  const crit = aging.filter((a) => a.severity === "critical");
  const elev = aging.filter((a) => a.severity === "elevated");
  const groups = {};
  for (const r of filtered) {
    const k = group === "location" ? r.location : group === "category" ? r.category : r.stage;
    (groups[k] = groups[k] ?? []).push(r);
  }
  const orderedGroups = Object.entries(groups).sort((a, b) => weightOf(b[1]) - weightOf(a[1]));
  const kpis = [
    { t: "Live plants", v: countOf(filtered.filter((r) => r.category === "Plants" || r.category === "Plant batches")).toLocaleString(), s: "in rooms and propagation" },
    { t: "Drying & curing", v: showW(weightOf(filtered.filter((r) => r.category === "Harvest lots"))), s: `${filtered.filter((r) => r.category === "Harvest lots").length} harvest lots` },
    { t: "Packaged on hand", v: showW(weightOf(filtered.filter((r) => r.category === "Packages"))), s: `${filtered.filter((r) => r.category === "Packages").length} packages` },
    { t: "In transit", v: showW(weightOf(filtered.filter((r) => r.category === "In transit"))), s: `${filtered.filter((r) => r.category === "In transit").length} leaving` },
    { t: "Needs action now", v: crit.length, s: "critical aging items", hot: crit.length > 0 },
    { t: "Watch list", v: elev.length, s: "elevated aging items", hot: elev.length > 0 },
  ];
  return (
    <>
      <div className="pagehead">
        <div><h1>Where Is Everything</h1>
          <div className="sub">Seed to sale, item by item — every plant, harvest lot, package, and outbound manifest, exactly where it sits in the facility right now, with how long it has been there.</div></div>
      </div>
      <div className="qcards dashgrid" style={{ marginTop: 0 }}>
        {kpis.map((k) => (
          <div key={k.t} className="qcard dwc">
            <span className="dwbody" style={{ cursor: "default" }}>
              <span className="qt">{k.t}</span>
              <span className={`qn ${k.hot ? "hot" : ""}`}>{k.v}</span>
              <span className="note">{k.s}</span>
            </span>
          </div>
        ))}
      </div>
      <div className="filterbar" style={{ marginTop: 14 }}>
        <input className="fsearch" placeholder="Search item, tag, room, strain, source harvest…" value={q} onChange={(e) => setQ(e.target.value)} />
        <span className="flab">Show weights in</span>
        <select className="fdate" value={unit} onChange={(e) => setUnit(e.target.value)}>
          <option value="auto">Best fit</option><option value="g">Grams</option><option value="oz">Ounces</option>
          <option value="lb">Pounds</option><option value="kg">Kilograms</option>
        </select>
        <span className="flab">Group by</span>
        <select className="fdate" value={group} onChange={(e) => setGroup(e.target.value)}>
          <option value="location">Location</option><option value="category">Type</option><option value="stage">Stage</option>
        </select>
        <select className="fdate" value={cat} onChange={(e) => setCat(e.target.value)}>
          <option value="">All types</option>{cats.map((c) => <option key={c}>{c}</option>)}
        </select>
        <select className="fdate" value={loc} onChange={(e) => setLoc(e.target.value)}>
          <option value="">All locations</option>{locs.map((l) => <option key={l}>{l}</option>)}
        </select>
        {(q || cat || loc) && <button className="btn small ghost" onClick={() => { setQ(""); setCat(""); setLoc(""); }}>Clear</button>}
        <span style={{ flex: 1 }} />
        <span className="note">{filtered.length} items</span>
      </div>
      {orderedGroups.map(([name, list]) => {
        const w = weightOf(list), c = countOf(list);
        const worst = list.map(sevOf).find((s) => s === "critical") ?? list.map(sevOf).find((s) => s === "elevated");
        const isOpen = open[name] !== false;
        return (
          <div key={name} className="msection vegroup">
            <button className="vegrouphead" onClick={() => setOpen((s) => ({ ...s, [name]: !isOpen }))}>
              <span className="vegchip" style={{ background: worst === "critical" ? "var(--red)" : worst === "elevated" ? "var(--alert-elevated)" : "var(--neon)", color: worst ? "#fff" : "var(--neon-ink)" }}>{name}</span>
              <span className="note">{list.length} item{list.length === 1 ? "" : "s"}{w > 0 ? ` · ${showW(w)}` : ""}{c > 0 ? ` · ${c.toLocaleString()} plants` : ""}</span>
              <span className="note" style={{ marginLeft: "auto" }}>{isOpen ? "▾" : "▸"}</span>
            </button>
            {isOpen && (
              <div className="tablewrap">
                <table>
                  <thead><tr><th>Item</th><th>Identifier</th><th>Type</th><th>Stage</th><th>Quantity</th><th>Days here</th><th>Laboratory</th><th>Source</th><th>Action</th></tr></thead>
                  <tbody>{list.sort((a, b) => (b.days_here ?? 0) - (a.days_here ?? 0)).map((r, i) => {
                    const sev = sevOf(r); const act = actOf(r);
                    const cv = convertWeight(r.quantity, r.uom, unit);
                    return (
                      <tr key={`${r.identifier}-${i}`}>
                        <td>{r.item}</td>
                        <td className="note">{String(r.identifier ?? "").length > 24 ? `…${String(r.identifier).slice(-12)}` : r.identifier}</td>
                        <td>{r.category}</td>
                        <td><span className="schip good" style={{ background: "transparent", borderColor: "var(--line)", color: "var(--ink-2)" }}>{r.stage}</span></td>
                        <td style={{ fontVariantNumeric: "tabular-nums" }}>{fmtQty(cv.n)} {cv.u}</td>
                        <td style={{ color: sev === "critical" ? "var(--red)" : sev === "elevated" ? "var(--alert-elevated)" : undefined }}>{r.days_here ?? "—"}</td>
                        <td className="note">{r.lab_state ?? "—"}</td>
                        <td className="note">{r.source_lineage ? String(r.source_lineage).slice(0, 28) : "—"}</td>
                        <td className="note" style={{ color: sev === "critical" ? "var(--red)" : undefined }}>{act ?? "—"}</td>
                      </tr>
                    );
                  })}</tbody>
                </table>
              </div>
            )}
          </div>
        );
      })}
      {filtered.length === 0 && <div className="empty"><div className="eicon">{I.box}</div><b>Nothing matches</b>Clear a filter to see the whole facility.</div>}
    </>
  );
}

/* ---------- Allocation Requests: staff request, an approver decides ---------- */
function AllocationRequests({ session, isExec }) {
  const [rows, setRows] = useState(null);
  const [me, setMe] = useState(null);
  const [tab, setTab] = useState("pending");
  const [form, setForm] = useState(null);
  const [decide, setDecide] = useState(null);
  const [reason, setReason] = useState("");
  const [qty, setQty] = useState("");
  const [msg, setMsg] = useState(null);
  const [ver, setVer] = useState(0);
  useEffect(() => {
    supabase.from("v_allocation_queue").select("*").then(({ data }) => setRows(data ?? []));
    supabase.from("app_users").select("role, employee_id").eq("user_id", session.user.id).maybeSingle()
      .then(async ({ data }) => {
        let name = session.user.email;
        let dept = null;
        if (data?.employee_id) {
          const { data: emp } = await supabase.from("employees").select("full_name, primary_department_id").eq("id", data.employee_id).maybeSingle();
          if (emp) {
            name = emp.full_name;
            const { data: d } = await supabase.from("departments").select("name").eq("id", emp.primary_department_id).maybeSingle();
            dept = d?.name ?? null;
          }
        }
        setMe({ name, dept, role: data?.role });
      });
  }, [ver, session.user.id]);
  const canDecide = isExec || me?.role === "manager";
  const submit = async () => {
    if (!form?.material_name?.trim() || !form?.quantity || !form?.destination?.trim()) {
      setMsg("Material, quantity, and destination are required."); return;
    }
    const { error } = await supabase.from("allocation_requests").insert({
      requested_by: session.user.id, requester_name: me?.name ?? session.user.email,
      requester_department: me?.dept ?? null,
      source_kind: form.source_kind ?? "harvest", source_ref: form.source_ref || null,
      material_name: form.material_name.trim(), strain: form.strain || null,
      quantity: Number(form.quantity), uom: form.uom || "g",
      destination: form.destination.trim(), purpose: form.purpose || null,
      needed_by: form.needed_by || null, priority: form.priority ?? "P2",
    });
    if (error) { setMsg(`Could not submit: ${error.message}`); return; }
    setForm(null); setMsg("Request submitted — it is now in the approver's queue."); setVer((v) => v + 1);
  };
  const decideNow = async (status) => {
    const patch = { status, decision_reason: reason.trim() || null, decider_name: me?.name ?? session.user.email };
    if (status === "approved") patch.approved_quantity = qty ? Number(qty) : decide.quantity;
    const { error } = await supabase.from("allocation_requests").update(patch).eq("id", decide.id);
    if (error) { setMsg(error.message); return; }
    setDecide(null); setReason(""); setQty(""); setMsg(`Request #${decide.request_no} ${status}.`); setVer((v) => v + 1);
  };
  if (rows === null) return <div className="empty"><div className="eicon">{I.scale}</div>Loading…</div>;
  const tabs = [["pending", "Awaiting decision"], ["approved", "Approved"], ["denied", "Denied"], ["all", "All requests"]];
  const list = rows.filter((r) => tab === "all" || r.status === tab);
  return (
    <>
      <div className="pagehead">
        <div><h1>Allocation Requests</h1>
          <div className="sub">Cultivation and production request material; an approver approves or denies with a written reason. Every decision is on the record, with who and when.</div></div>
        <button className="btn" onClick={() => { setForm(form ? null : { source_kind: "harvest", uom: "g", priority: "P2" }); setMsg(null); }}>
          {form ? "Cancel" : "+ Request material"}
        </button>
      </div>
      {msg && <div className="note" style={{ marginBottom: 10 }}>{msg}</div>}
      {form && (
        <div className="panel" style={{ maxWidth: "none", marginBottom: 14 }}>
          <div className="ptitle">New material request — submitted as {me?.name ?? session.user.email}{me?.dept ? ` · ${me.dept}` : ""}</div>
          <div className="argrid">
            <label>Material<input placeholder="e.g. TG Gush Mintz flower" value={form.material_name ?? ""} onChange={(e) => setForm({ ...form, material_name: e.target.value })} /></label>
            <label>Strain<input placeholder="optional" value={form.strain ?? ""} onChange={(e) => setForm({ ...form, strain: e.target.value })} /></label>
            <label>Source<select value={form.source_kind} onChange={(e) => setForm({ ...form, source_kind: e.target.value })}>
              {["harvest", "package", "lot", "purchased", "other"].map((k) => <option key={k} value={k}>{k}</option>)}</select></label>
            <label>Source reference<input placeholder="harvest name or package tag" value={form.source_ref ?? ""} onChange={(e) => setForm({ ...form, source_ref: e.target.value })} /></label>
            <label>Quantity<input type="number" value={form.quantity ?? ""} onChange={(e) => setForm({ ...form, quantity: e.target.value })} /></label>
            <label>Unit<select value={form.uom} onChange={(e) => setForm({ ...form, uom: e.target.value })}>
              {["g", "kg", "lb", "oz", "ea", "cases"].map((u) => <option key={u}>{u}</option>)}</select></label>
            <label>Destination<input placeholder="e.g. Infused Pre-Roll line" value={form.destination ?? ""} onChange={(e) => setForm({ ...form, destination: e.target.value })} /></label>
            <label>Needed by<input type="date" value={form.needed_by ?? ""} onChange={(e) => setForm({ ...form, needed_by: e.target.value })} /></label>
            <label>Priority<select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
              {["P0", "P1", "P2", "P3"].map((p) => <option key={p}>{p}</option>)}</select></label>
            <label style={{ gridColumn: "1 / -1" }}>Purpose<input placeholder="what it is for" value={form.purpose ?? ""} onChange={(e) => setForm({ ...form, purpose: e.target.value })} /></label>
          </div>
          <button className="btn" style={{ marginTop: 10 }} onClick={submit}>Submit request</button>
        </div>
      )}
      <div className="vetabs">
        {tabs.map(([k, l]) => (
          <button key={k} className={`vetab ${tab === k ? "on" : ""}`} onClick={() => setTab(k)}>
            {l} <b style={{ marginLeft: 4 }}>{k === "all" ? rows.length : rows.filter((r) => r.status === k).length}</b>
          </button>
        ))}
      </div>
      {list.length === 0 ? (
        <div className="empty"><div className="eicon">{I.scale}</div><b>Nothing here</b>Requests appear the moment someone submits one.</div>
      ) : (
        <div className="glist">
          {list.map((r) => (
            <div key={r.id} className="glrow">
              <span className={`glstatus ${r.status === "approved" ? "done" : r.status === "denied" ? "blocked" : "open"}`}>{r.status}</span>
              <span className={`glprio ${r.priority}`}>{r.priority}</span>
              <div className="glmain">
                <div className="gltitle">
                  #{r.request_no} · {r.quantity} {r.uom} {r.material_name}{r.strain ? ` (${r.strain})` : ""} → {r.destination}
                  {r.overdue && <span className="glowner" style={{ background: "var(--red)", color: "#fff" }}>PAST NEEDED BY</span>}
                </div>
                <div className="gldetail">
                  Requested by {r.requester_name ?? "—"}{r.requester_department ? ` · ${r.requester_department}` : ""} on {r.requested_on}
                  {r.needed_by ? ` · needed by ${r.needed_by}` : ""}
                  {r.status === "pending" && r.days_waiting != null ? ` · waiting ${r.days_waiting} day${r.days_waiting === 1 ? "" : "s"}` : ""}
                  {r.purpose ? ` · ${r.purpose}` : ""}
                  {r.status !== "pending" && r.decider_name ? ` — ${r.status} by ${r.decider_name} on ${r.decided_on}${r.decision_reason ? `: ${r.decision_reason}` : ""}` : ""}
                  {r.status === "approved" && r.approved_quantity != null && Number(r.approved_quantity) !== Number(r.quantity) ? ` · approved quantity ${r.approved_quantity} ${r.uom}` : ""}
                </div>
              </div>
              {r.status === "pending" && canDecide && (
                <button className="btn small" onClick={() => { setDecide(r); setQty(String(r.quantity)); setReason(""); }}>Decide</button>
              )}
            </div>
          ))}
        </div>
      )}
      {decide && (
        <div className="vedrawerwrap" onClick={() => setDecide(null)}>
          <div className="vedrawer" onClick={(e) => e.stopPropagation()}>
            <div className="srhead"><span className="srtitle">Decide request #{decide.request_no}</span><button className="btn small ghost" onClick={() => setDecide(null)}>✕</button></div>
            <div className="regtext" style={{ marginTop: 8 }}>
              {decide.requester_name} requests <b>{decide.quantity} {decide.uom}</b> of {decide.material_name}
              {decide.strain ? ` (${decide.strain})` : ""} for {decide.destination}.
              {decide.purpose ? ` Purpose: ${decide.purpose}.` : ""}
              {decide.needed_by ? ` Needed by ${decide.needed_by}.` : ""}
              {decide.source_ref ? ` Source: ${decide.source_kind} ${decide.source_ref}.` : ""}
            </div>
            <label>Approved quantity (edit to approve a partial amount)</label>
            <input type="number" value={qty} onChange={(e) => setQty(e.target.value)} />
            <label>Reason / note — required to deny (15 characters or more)</label>
            <textarea rows={4} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why this is approved or denied…" />
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <button className="btn" onClick={() => decideNow("approved")}>Approve</button>
              <button className="btn ghost" onClick={() => decideNow("denied")}>Deny</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/* ---------- Action Register: full briefs — what, why, how, recommendation ---------- */
function RegisterScreen({ isExec }) {
  const [rows, setRows] = useState(null);
  const [q, setQ] = useState("");
  const [statusSel, setStatusSel] = useState("open");
  const [prioSel, setPrioSel] = useState(null);
  const [drawer, setDrawer] = useState(null);
  const [ver, setVer] = useState(0);
  useEffect(() => {
    supabase.from("actions_register").select("*").order("priority").order("created_at", { ascending: false }).limit(1000)
      .then(({ data }) => setRows(data ?? []));
  }, [ver]);
  if (rows === null) return <div className="empty"><div className="eicon">{I.board}</div>Loading…</div>;
  const statuses = [...new Set(rows.map((r) => r.status ?? "open"))];
  const filtered = rows.filter((r) =>
    (!statusSel || (r.status ?? "open") === statusSel) &&
    (!prioSel || r.priority === prioSel) &&
    (!q || `${r.title} ${r.note ?? ""} ${r.source ?? ""}`.toLowerCase().includes(q.toLowerCase())));
  const advance = async (r) => {
    if (!isExec) return;
    const next = r.status === "open" ? "in_progress" : r.status === "in_progress" ? "done" : "open";
    setRows((s) => s.map((x) => (x.id === r.id ? { ...x, status: next } : x)));
    if (drawer?.id === r.id) setDrawer({ ...r, status: next });
    await supabase.from("actions_register").update({ status: next }).eq("id", r.id);
  };
  const Sect = ({ label, text, fallback }) => (
    <>
      <label>{label}</label>
      <div className="regtext">{text ?? <span className="note">{fallback}</span>}</div>
    </>
  );
  return (
    <>
      <div className="pagehead">
        <div><h1>Action Register</h1>
          <div className="sub">Every directive, audit finding, and spreadsheet gap — each with what to do, why it matters, how to execute, and my recommendation. Click any item for the full brief.</div></div>
      </div>
      <div className="filterbar">
        <input className="fsearch" placeholder="Search title, note, source…" value={q} onChange={(e) => setQ(e.target.value)} />
        <span className="flab">Priority</span>
        <select className="fdate" value={prioSel ?? ""} onChange={(e) => setPrioSel(e.target.value || null)}>
          <option value="">All</option>
          {["P0", "P1", "P2"].map((p) => <option key={p}>{p}</option>)}
        </select>
        <span style={{ flex: 1 }} />
        <span className="note">{filtered.length} of {rows.length}</span>
      </div>
      <div className="statchips">
        {statuses.map((s) => (
          <button key={s} className={`schip ${s === "done" ? "good" : s === "in_progress" ? "info" : "warn"} ${statusSel === s ? "sel" : ""}`}
            onClick={() => setStatusSel(statusSel === s ? null : s)}>
            <b>{rows.filter((r) => (r.status ?? "open") === s).length}</b> {s.replace("_", " ")}
          </button>
        ))}
        <span className="schl">Live breakdown by status — click to filter</span>
      </div>
      <div className="glist">
        {filtered.map((r) => (
          <div key={r.id} className="glrow" style={{ cursor: "pointer" }} onClick={() => setDrawer(r)}>
            <button className={`glstatus ${r.status === "done" ? "done" : r.status === "in_progress" ? "in_progress" : "open"}`}
              onClick={(e) => { e.stopPropagation(); advance(r); }} disabled={!isExec}>{(r.status ?? "open").replace("_", " ")}</button>
            <span className={`glprio ${r.priority}`}>{r.priority}</span>
            <div className="glmain">
              <div className="gltitle">{r.title}{r.needs_owner && <span className="glowner">OWNER</span>}</div>
              <div className="gldetail">{r.source} · {String(r.note ?? "").slice(0, 140)}{String(r.note ?? "").length > 140 ? "…" : ""}</div>
            </div>
          </div>
        ))}
        {filtered.length === 0 && <div className="empty"><div className="eicon">{I.check}</div><b>Nothing matches</b>Clear a filter to see more.</div>}
      </div>
      {drawer && (
        <div className="vedrawerwrap" onClick={() => setDrawer(null)}>
          <div className="vedrawer" onClick={(e) => e.stopPropagation()}>
            <div className="srhead"><span className="srtitle">Action brief</span><button className="btn small ghost" onClick={() => setDrawer(null)}>✕</button></div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", margin: "6px 0 4px" }}>
              <span className={`glprio ${drawer.priority}`}>{drawer.priority}</span>
              <button className={`glstatus ${drawer.status === "done" ? "done" : drawer.status === "in_progress" ? "in_progress" : "open"}`}
                onClick={() => advance(drawer)} disabled={!isExec}>{(drawer.status ?? "open").replace("_", " ")}</button>
              <span className="note">{drawer.source} · {new Date(drawer.created_at).toLocaleDateString()}</span>
              {drawer.needs_owner && <span className="glowner">NEEDS OWNER</span>}
            </div>
            <div style={{ fontFamily: '"Figtree", sans-serif', fontSize: 17, fontWeight: 700, margin: "6px 0 2px" }}>{drawer.title}</div>
            <Sect label="What to do" text={drawer.what_to_do} fallback="Brief being authored by the register department — the source note below carries the context meanwhile." />
            <Sect label="Why it matters" text={drawer.why_it_matters} fallback="—" />
            <Sect label="How to execute" text={drawer.how_to_execute} fallback="—" />
            <Sect label="My recommendation" text={drawer.recommendation} fallback="—" />
            <Sect label="Source note (full)" text={drawer.note} fallback="No note recorded." />
          </div>
        </div>
      )}
    </>
  );
}

/* ---------- Metrc Report Import: pull data straight from Metrc's reports ---------- */
function parseCSV(text) {
  const rows = [];
  let cur = [""], inQ = false, row = cur;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') { if (text[i + 1] === '"') { row[row.length - 1] += '"'; i++; } else inQ = false; }
      else row[row.length - 1] += c;
    } else if (c === '"') inQ = true;
    else if (c === ",") row.push("");
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [""]; if (rows.length > 25000) break;
    } else row[row.length - 1] += c;
  }
  if (row.length > 1 || row[0] !== "") rows.push(row);
  if (!rows.length) return [];
  const headers = rows[0].map((h, i) => (h || `col${i}`).trim());
  return rows.slice(1).map((r) => Object.fromEntries(headers.map((h, i) => [h, r[i] ?? ""])));
}
const REPORT_TYPES = [
  ["items", "Items (Admin grid export) — fills Metrc Items"],
  ["strains", "Strains (Admin grid export) — fills Metrc Strains"],
  ["locations", "Locations (Admin grid export) — fills Metrc Locations"],
  ["harvests", "Harvests report"], ["inventory", "Inventory Point-in-Time report"],
  ["lab_results", "Lab Results report"], ["plants_inventory", "Monthly Plants Inventory report"],
  ["packages", "Packages report/grid"], ["transfers", "Transfers report/grid"], ["other", "Other Metrc report"],
];
function MetrcReportImport({ session }) {
  const [license, setLicense] = useState("MC281714");
  const [rtype, setRtype] = useState("items");
  const [parsed, setParsed] = useState(null);
  const [fileName, setFileName] = useState(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [history, setHistory] = useState(null);
  const fRef = React.useRef(null);
  const loadHistory = () => supabase.from("metrc_report_imports").select("*").order("imported_at", { ascending: false }).limit(20)
    .then(({ data }) => setHistory(data ?? []));
  useEffect(() => { loadHistory(); }, []);
  const onFile = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFileName(f.name); setResult(null);
    const text = await f.text();
    setParsed(parseCSV(text));
  };
  const runImport = async () => {
    if (!parsed?.length) return;
    setBusy(true); setResult(null);
    try {
      const r = await fetch(`${FUNCTIONS_URL}/metrc-report-import`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ report_type: rtype, license, file_name: fileName, rows: parsed }),
      });
      const j = await r.json();
      setResult(j.ok ? `Imported: ${j.results.stored}; ${j.results.mapped}${j.results.map_errors?.length ? `; errors: ${j.results.map_errors.join(" · ")}` : ""}` : `Failed: ${j.error}`);
      if (j.ok) { setParsed(null); setFileName(null); if (fRef.current) fRef.current.value = ""; loadHistory(); }
    } catch (e) { setResult(`Failed: ${String(e)}`); }
    setBusy(false);
  };
  return (
    <>
      <div className="pagehead">
        <div><h1>Metrc Report Import</h1>
          <div className="sub">The confirmed data path: in Metrc, open Reports (or any Admin grid), export CSV, drop it here. Items, Strains, and Locations map straight into their live tables — everything else is stored row-for-row, nothing lost.</div></div>
      </div>
      <div className="panel" style={{ maxWidth: "none" }}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <span className="flab">License</span>
          <select className="fdate" value={license} onChange={(e) => setLicense(e.target.value)}>
            <option value="MC281714">MC281714 — Cultivation</option>
            <option value="MP281909">MP281909 — Manufacturing</option>
          </select>
          <span className="flab">Report</span>
          <select className="fdate" style={{ minWidth: 280 }} value={rtype} onChange={(e) => setRtype(e.target.value)}>
            {REPORT_TYPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
          <input ref={fRef} type="file" accept=".csv,text/csv" onChange={onFile} />
        </div>
        {parsed && (
          <div style={{ marginTop: 12 }}>
            <div className="note">{fileName}: <b>{parsed.length.toLocaleString()} rows</b> parsed · columns: {Object.keys(parsed[0] ?? {}).slice(0, 8).join(", ")}{Object.keys(parsed[0] ?? {}).length > 8 ? "…" : ""}</div>
            <button className="btn" style={{ marginTop: 10 }} disabled={busy} onClick={runImport}>{busy ? "Importing…" : `Import ${parsed.length.toLocaleString()} rows`}</button>
          </div>
        )}
        {result && <div className="note" style={{ marginTop: 10 }}>{result}</div>}
      </div>
      <div className="msection">
        <div className="mtitle"><span className="sq" /><h2>Import history</h2><span className="rule" /></div>
        {history === null ? <div className="empty"><div className="eicon">{I.plug}</div>Loading…</div> : history.length === 0 ? (
          <div className="empty"><div className="eicon">{I.plug}</div><b>No reports imported yet</b>Your first Metrc report lands here the moment you import it.</div>
        ) : (
          <div className="tablewrap"><table>
            <thead><tr><th>When</th><th>Report</th><th>License</th><th>File</th><th>Rows</th><th>Mapped to</th><th>By</th></tr></thead>
            <tbody>{history.map((h) => (
              <tr key={h.id}><td>{new Date(h.imported_at).toLocaleString()}</td><td>{h.report_type}</td><td>{h.license ?? "—"}</td>
                <td>{h.file_name ?? "—"}</td><td>{h.row_count}</td><td>{h.mapped_to ?? "generic"}</td><td>{h.imported_by}</td></tr>
            ))}</tbody>
          </table></div>
        )}
      </div>
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
const DASH_STARTERS = [
  { name: "Executive Overview", keys: ["p0_actions", "golive_open", "metrc_pkgs", "metrc_plants", "fg_lots", "fg_expiring", "pulls_ahead", "payroll_wk"] },
  { name: "Cultivation", keys: ["metrc_plants", "metrc_harvests", "pulls_ahead", "pulls_overdue", "cycle_viol", "cadence_viol", "sched_events"] },
  { name: "Inventory & Sales", keys: ["fg_lots", "fg_rts", "fg_expiring", "tp_lots", "metrc_transfers", "cap_tied", "supply_types"] },
  { name: "Human Resources & Labor", keys: ["emp_active", "emp_today", "time_exc", "payroll_wk"] },
];
async function runWidget(w) {
  const sub = (v) => (v === "$today" ? todayISO() : v === "$in30" ? in30() : v);
  let q = supabase.from(w.table_ref);
  q = w.agg === "sum" ? q.select(w.value_col) : q.select("*", { count: "exact", head: true });
  for (const f of w.filters ?? []) {
    if (f.op === "eq") q = q.eq(f.col, sub(f.val));
    else if (f.op === "neq") q = q.neq(f.col, sub(f.val));
    else if (f.op === "lt") q = q.lt(f.col, sub(f.val));
    else if (f.op === "lte") q = q.lte(f.col, sub(f.val));
    else if (f.op === "gte") q = q.gte(f.col, sub(f.val));
    else if (f.op === "like") q = q.like(f.col, f.val);
    else if (f.op === "is_null") q = q.is(f.col, null);
    else if (f.op === "not_null") q = q.not(f.col, "is", null);
  }
  if (w.agg === "sum") {
    const { data, error } = await q;
    if (error) return "—";
    const s = (data ?? []).reduce((a, r) => a + Number(r[w.value_col] ?? 0), 0);
    return w.format === "usd" ? "$" + Math.round(s).toLocaleString() : Math.round(s).toLocaleString();
  }
  const { count, error } = await q;
  return error ? "—" : count ?? 0;
}
function DashboardsScreen({ session, go }) {
  const [boards, setBoards] = useState(null);
  const [catalog, setCatalog] = useState([]);
  const [active, setActive] = useState(null);
  const [widgets, setWidgets] = useState([]);
  const [vals, setVals] = useState({});
  const [adding, setAdding] = useState(false);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [priv, setPriv] = useState(true);
  const uid = session.user.id;
  const loadBoards = () => supabase.from("dashboards").select("*").order("created_at").then(({ data }) => setBoards(data ?? []));
  useEffect(() => {
    loadBoards();
    supabase.from("widget_catalog").select("*").eq("enabled", true).order("category").then(({ data }) => setCatalog(data ?? []));
  }, []);
  const openBoard = async (b) => {
    setActive(b); setVals({}); setAdding(false);
    const { data } = await supabase.from("dashboard_widgets").select("*").eq("dashboard_id", b.id).order("position");
    setWidgets(data ?? []);
  };
  useEffect(() => {
    if (!active) return;
    for (const dw of widgets) {
      const w = catalog.find((c) => c.key === dw.widget_key);
      if (w) runWidget(w).then((v) => setVals((s) => ({ ...s, [dw.id]: v })));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [widgets, catalog, active?.id]);
  const create = async (starter) => {
    const { data, error } = await supabase.from("dashboards")
      .insert({ name: starter ? starter.name : name.trim() || "My dashboard", is_private: priv, owner: uid })
      .select().single();
    if (error || !data) return;
    if (starter) await supabase.from("dashboard_widgets").insert(starter.keys.map((k, i) => ({ dashboard_id: data.id, widget_key: k, position: i })));
    setCreating(false); setName("");
    await loadBoards();
    openBoard(data);
  };
  const addWidget = async (key) => {
    const { data } = await supabase.from("dashboard_widgets")
      .insert({ dashboard_id: active.id, widget_key: key, position: widgets.length }).select().single();
    if (data) setWidgets((s) => [...s, data]);
  };
  const removeWidget = async (dw) => {
    setWidgets((s) => s.filter((x) => x.id !== dw.id));
    await supabase.from("dashboard_widgets").delete().eq("id", dw.id);
  };
  const removeBoard = async () => {
    if (!window.confirm(`Delete dashboard "${active.name}"? Its widgets go with it.`)) return;
    await supabase.from("dashboards").delete().eq("id", active.id);
    setActive(null); loadBoards();
  };
  if (boards === null) return <div className="empty"><div className="eicon">{I.gauge}</div>Loading…</div>;
  if (!active) return (
    <>
      <div className="pagehead">
        <div><h1>Dashboards</h1>
          <div className="sub">Private by default — share one and the whole company sees the same live numbers. Every widget computes this second and drills to its source.</div></div>
        <button className="btn" onClick={() => setCreating((v) => !v)}>+ New dashboard</button>
      </div>
      {creating && (
        <div className="panel" style={{ maxWidth: "none", marginBottom: 14 }}>
          <div className="ptitle">Start a dashboard</div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", margin: "10px 0" }}>
            <input className="in" placeholder="Name it…" value={name} onChange={(e) => setName(e.target.value)} />
            <label className="note" style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
              <input type="checkbox" checked={!priv} onChange={(e) => setPriv(!e.target.checked)} /> Share with everyone (private by default)
            </label>
            <button className="btn small" onClick={() => create(null)}>Create blank</button>
          </div>
          <div className="note">Or one click builds a company preset from live records:</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
            {DASH_STARTERS.map((s) => (
              <button key={s.name} className="btn small ghost" onClick={() => create(s)}>{s.name} · {s.keys.length} widgets</button>
            ))}
          </div>
        </div>
      )}
      {boards.length === 0 && !creating ? (
        <div className="empty"><div className="eicon">{I.gauge}</div><b>No dashboards yet</b>Create one — presets build themselves from your live records in one click.</div>
      ) : (
        <div className="teamgrid">
          {boards.map((b) => (
            <button key={b.id} className="teamcard tplcard" onClick={() => openBoard(b)}>
              <span className="tcname">{b.name} {b.owner !== uid ? <span className="mtag">SHARED</span> : b.is_private ? <span className="mtag">PRIVATE</span> : <span className="mtag">SHARED BY YOU</span>}</span>
              <span className="tpldesc">{b.owner === uid ? "Yours — open to view, edit widgets, or share." : "Shared company board — live view."}</span>
            </button>
          ))}
        </div>
      )}
    </>
  );
  const mine = active.owner === uid;
  return (
    <>
      <div className="pagehead">
        <div><h1>{active.name}</h1>
          <div className="sub">Every number live at this moment — click a widget to drill to its source. {active.is_private ? "Private to you." : "Shared with everyone."}</div></div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {mine && (
            <button className="btn small ghost" onClick={async () => {
              const v = !active.is_private;
              await supabase.from("dashboards").update({ is_private: v }).eq("id", active.id);
              setActive({ ...active, is_private: v });
            }}>{active.is_private ? "Share with everyone" : "Make private"}</button>
          )}
          {mine && <button className="btn small ghost" onClick={() => setAdding((v) => !v)}>{adding ? "Done adding" : "Add widget"}</button>}
          {mine && <button className="btn small ghost" onClick={removeBoard}>Delete</button>}
          <button className="btn small ghost" onClick={() => setActive(null)}>All dashboards</button>
        </div>
      </div>
      {adding && (
        <div className="panel" style={{ maxWidth: "none", marginBottom: 14 }}>
          {[...new Set(catalog.map((c) => c.category))].map((cat) => (
            <div key={cat} style={{ marginBottom: 10 }}>
              <div className="note" style={{ marginBottom: 4 }}>{cat}</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {catalog.filter((c) => c.category === cat).map((c) => (
                  <button key={c.key} className="btn small ghost" disabled={widgets.some((w) => w.widget_key === c.key)} onClick={() => addWidget(c.key)}>{c.label}</button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="qcards dashgrid">
        {widgets.map((dw) => {
          const w = catalog.find((c) => c.key === dw.widget_key);
          if (!w) return null;
          const v = vals[dw.id];
          return (
            <div key={dw.id} className="qcard dwc">
              {mine && <button className="dwx" title="Remove widget" onClick={() => removeWidget(dw)}>×</button>}
              <button className="dwbody" onClick={() => w.drill && go(w.drill)}>
                <span className="qi">{iconByName(w.icon)}</span>
                <span className="qt">{w.label}</span>
                <span className={`qn ${w.hot && typeof v === "number" && v > 0 ? "hot" : ""}`}>{v ?? "…"}</span>
              </button>
            </div>
          );
        })}
        {widgets.length === 0 && (
          <div className="empty" style={{ gridColumn: "1 / -1" }}><div className="eicon">{I.gauge}</div><b>Empty dashboard</b>Add widgets — every one is a live number from your own records, never a mock.</div>
        )}
      </div>
    </>
  );
}
/* ---------- Go-Live Tracker: the living readiness list ---------- */
function GoLiveScreen({ isExec, go }) {
  const [items, setItems] = useState(null);
  const [backlog, setBacklog] = useState(null);
  useEffect(() => {
    supabase.from("golive_items").select("*").order("phase").order("sort")
      .then(({ data }) => setItems(data ?? []));
    supabase.from("actions_register").select("source").eq("status", "open").limit(2000)
      .then(({ data }) => {
        const by = {};
        for (const r of data ?? []) by[r.source ?? "unsourced"] = (by[r.source ?? "unsourced"] ?? 0) + 1;
        setBacklog(Object.entries(by).sort((a, b) => b[1] - a[1]));
      });
  }, []);
  if (items === null) return <div className="empty"><div className="eicon">{I.check}</div>Loading…</div>;
  if (items.length === 0) return <div className="empty"><div className="eicon">{I.check}</div><b>Nothing tracked yet</b>Go-live items appear here the moment they are registered.</div>;
  const done = items.filter((i) => i.status === "done").length;
  const pct = Math.round((done / items.length) * 100);
  const phases = [...new Map(items.map((i) => [i.phase, i.phase_name]))].sort((a, b) => a[0] - b[0]);
  const NEXT = { open: "in_progress", in_progress: "done", blocked: "in_progress", done: "open" };
  const advance = async (it) => {
    if (!isExec) return;
    const status = NEXT[it.status];
    setItems((s) => s.map((x) => (x.id === it.id ? { ...x, status } : x)));
    await supabase.from("golive_items").update({ status, updated_at: new Date().toISOString() }).eq("id", it.id);
  };
  return (
    <>
      <div className="pagehead">
        <div><h1>Go-Live Tracker</h1>
          <div className="sub">The living readiness list — parsed from every directive, spreadsheet, and audit. {items.length - done} item{items.length - done === 1 ? "" : "s"} stand between here and testing deploy. {isExec ? "Click a status to advance it." : "Statuses advance by executives."}</div></div>
        <div className="glmeter">
          <span className="glpct">{pct}%</span>
          <span className="glbarw"><span className="glbar" style={{ width: `${pct}%` }} /></span>
          <span className="note">{done}/{items.length} done</span>
        </div>
      </div>
      {backlog && backlog.length > 0 && (
        <div className="panel" style={{ maxWidth: "none", marginBottom: 14 }}>
          <div className="ptitle">Register backlog also gates go-live — {backlog.reduce((a, [, n]) => a + n, 0)} open items</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
            {backlog.map(([src, n]) => (
              <button key={src} className="btn small ghost" onClick={() => go && go("action_register")}>{src} · {n}</button>
            ))}
          </div>
          <div className="note" style={{ marginTop: 8 }}>Every one of these is a captured directive, audit finding, or spreadsheet feature — click through to work the list. Nothing goes live while a P0 stands.</div>
        </div>
      )}
      {phases.map(([ph, phname]) => {
        const list = items.filter((i) => i.phase === ph);
        const pdone = list.filter((i) => i.status === "done").length;
        return (
          <div key={ph} className="msection">
            <div className="mtitle"><span className="sq" /><h2>Phase {ph} — {phname}</h2><span className="rule" /><span className="note">{pdone}/{list.length} done</span></div>
            <div className="glist">
              {list.map((it) => (
                <div key={it.id} className={`glrow ${it.status}`}>
                  <button className={`glstatus ${it.status}`} disabled={!isExec} onClick={() => advance(it)}>{it.status.replace("_", " ")}</button>
                  <span className={`glprio ${it.priority}`}>{it.priority}</span>
                  <div className="glmain">
                    <div className="gltitle">{it.title}{it.owner_action && <span className="glowner">OWNER</span>}</div>
                    {it.detail && <div className="gldetail">{it.detail}</div>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </>
  );
}

/* ---------- Planner: the operations calendar, already full of live events ---------- */
const PLANNER_SPANS = [["day","Day"],["week","Week"],["month","Month"],["quarter","Quarter"],["half","Semi-annual"],["year","Annual"]];
const isoD = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
function spanWindow(span, anchor) {
  const y = anchor.getFullYear(), m = anchor.getMonth(), d = anchor.getDate(), dow = anchor.getDay();
  const q = Math.floor(m / 3);
  switch (span) {
    case "day": return { start: isoD(anchor), end: isoD(anchor) };
    case "week": return { start: isoD(new Date(y, m, d - dow)), end: isoD(new Date(y, m, d - dow + 6)) };
    case "quarter": return { start: isoD(new Date(y, q*3, 1)), end: isoD(new Date(y, q*3+3, 0)) };
    case "half": return m < 6 ? { start: isoD(new Date(y,0,1)), end: isoD(new Date(y,5,30)) }
                              : { start: isoD(new Date(y,6,1)), end: isoD(new Date(y,11,31)) };
    case "year": return { start: isoD(new Date(y,0,1)), end: isoD(new Date(y,11,31)) };
    default: return { start: isoD(new Date(y, m, 1)), end: isoD(new Date(y, m+1, 0)) };
  }
}
function spanShift(span, anchor, dir) {
  const y = anchor.getFullYear(), m = anchor.getMonth(), d = anchor.getDate();
  switch (span) {
    case "day": return new Date(y, m, d + dir);
    case "week": return new Date(y, m, d + 7*dir);
    case "quarter": return new Date(y, m + 3*dir, 1);
    case "half": return new Date(y, m + 6*dir, 1);
    case "year": return new Date(y + dir, m, 1);
    default: return new Date(y, m + dir, 1);
  }
}
function spanLabel(span, anchor) {
  const { start, end } = spanWindow(span, anchor);
  const f = (x) => new Date(x + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  if (span === "day") return f(start);
  if (span === "month") return anchor.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  if (span === "year") return String(anchor.getFullYear());
  return `${f(start)} — ${f(end)}`;
}
const PLANNER_LEGEND = [
  ["Harvest", "#5cff92"], ["Inventory to sheet", "#00e5ff"], ["On plan", "#2df26a"], ["Late / deadline blown", "#ff4245"],
  ["Due or at risk", "#ff8a00"], ["Complete", "#57a9ff"],
  ["Shipment", "#e2bd63"], ["Work order", "#ffea00"], ["Expiry", "#ff8a00"], ["Shift", "#57a9ff"],
];
function PlannerScreen({ go, session }) {
  const [ym, setYm] = useState(() => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() }; });
  const [events, setEvents] = useState(null);
  const [sel, setSel] = useState(null);
  const [rangeEnd, setRangeEnd] = useState(null);
  const [detail, setDetail] = useState(null);
  const [span, setSpan] = useState("month");
  const [layout, setLayout] = useState("calendar");
  const [anchor, setAnchor] = useState(() => new Date());
  const [planners, setPlanners] = useState([]);
  const [plan, setPlan] = useState(null);
  const [pform, setPform] = useState({ name: "", srcs: ["harvest", "shipment", "work_order", "expiry", "shift"], creating: false });
  const [pver, setPver] = useState(0);
  useEffect(() => {
    supabase.from("planners").select("*").order("created_at").then(({ data }) => {
      setPlanners(data ?? []);
      setPlan((p) => p ?? (data ?? [])[0] ?? null);
    });
  }, [pver]);
  const allowed = (src) => !plan || (plan.sources ?? []).includes(src);
  const createPlanner = async () => {
    if (!pform.name.trim() || !pform.srcs.length) return;
    const { data } = await supabase.from("planners")
      .insert({ name: pform.name.trim(), sources: pform.srcs, is_private: true, created_by: session?.user?.id })
      .select("*").single();
    setPform({ name: "", srcs: ["harvest", "shipment", "work_order", "expiry", "shift"], creating: false });
    setPver((v) => v + 1);
    if (data) setPlan(data);
  };
  useEffect(() => {
    setEvents(null); setSel(null);
    const { start, end } = spanWindow(span, anchor);
    const none = Promise.resolve({ data: [] });
    Promise.all([
      allowed("harvest") ? supabase.from("harvest_schedule").select("harvest_date,cultivar,flower_room").gte("harvest_date", start).lte("harvest_date", end) : none,
      allowed("harvest") ? supabase.from("harvest_pulls").select("harvest_date,flower_room,pull_no,cultivars").gte("harvest_date", start).lte("harvest_date", end) : none,
      allowed("harvest") ? supabase.from("v_harvest_lifecycle").select("*").limit(600) : none,
      allowed("shipment") ? supabase.from("shipments").select("scheduled_ship_on,shipment_code,status").gte("scheduled_ship_on", start).lte("scheduled_ship_on", end) : none,
      allowed("work_order") ? supabase.from("work_orders").select("planned_start,wo_code,status").gte("planned_start", start).lte("planned_start", end) : none,
      allowed("expiry") ? supabase.from("product_inventory").select("expiration_date,strain_flavor,production_batch").gte("expiration_date", start).lte("expiration_date", end) : none,
      allowed("shift") ? supabase.from("employee_schedules")
        .select("work_date,zone,status,employee_id,employees(full_name,primary_department_id,secondary_department_id)")
        .gte("work_date", start).lte("work_date", end) : none,
      supabase.from("departments").select("id,name"),
      allowed("inventory") ? supabase.from("product_inventory")
        .select("creation_date,strain_flavor,product_description,category,current_status,production_batch,total_units,total_gram_equivalent,case_size,cases_available,final_metrc_tag,bulk_metrc_tag,expiration_date,source_sheet,tac_pct,thca_pct")
        .gte("creation_date", start).lte("creation_date", end).limit(400) : none,
    ]).then(([h, hp, lc, s, w, x, es, dp, inv]) => {
      const deptName = Object.fromEntries((dp?.data ?? []).map((d) => [d.id, d.name]));
      const ev = {};
      const add = (date, type, label, drill, color, row) => { if (!date) return; (ev[date] = ev[date] ?? []).push({ type, label, drill, color, row }); };
      (h.data ?? []).forEach((r) => add(r.harvest_date, "Harvest", `${r.cultivar ?? "Harvest"} · ${r.flower_room ?? "room TBD"}`, "harvest_schedule", "#5cff92", r));
      (hp.data ?? []).forEach((r) => add(r.harvest_date, "Harvest", `Pull #${r.pull_no} · ${r.flower_room} — ${r.cultivars ?? ""}`, "harvest_pulls", "#5cff92", r));
      (s.data ?? []).forEach((r) => add(r.scheduled_ship_on, "Shipment", `${r.shipment_code ?? ""} · ${r.status ?? ""}`, "shipping", "#e2bd63", r));
      (w.data ?? []).forEach((r) => add(r.planned_start, "Work order", `${r.wo_code ?? ""} · ${r.status ?? ""}`, "work_orders", "#ffea00", r));
      (x.data ?? []).forEach((r) => add(r.expiration_date, "Expiry", r.strain_flavor ?? r.production_batch ?? "lot", "inv_summary", "#ff8a00", r));
      (inv?.data ?? []).forEach((r) => add(r.creation_date, "Inventory",
        `${r.strain_flavor ?? r.product_description ?? "lot"} · ${r.category ?? ""} · ${r.total_units ?? 0} units${r.current_status ? ` · ${r.current_status}` : ""}`,
        "fg_inventory", "#00e5ff", r));
      (es.data ?? []).forEach((r) => {
        const emp = r.employees ?? {};
        const dept = deptName[emp.primary_department_id] ?? deptName[emp.secondary_department_id] ?? "no department";
        add(r.work_date, "Shift",
          `${emp.full_name ?? "unassigned"} · ${dept}${r.zone ? ` · zone ${r.zone}` : ""} · ${r.status}`,
          "emp_schedule", "#57a9ff", { ...r, employee: emp.full_name, department: dept });
      });
      // Takedowns and dry-room deadlines, coloured by whether we held the schedule
      const ON = "#2df26a", LATE = "#ff4245", RISK = "#ff8a00", DONE = "#57a9ff";
      (lc.data ?? []).forEach((r) => {
        if (r.takedown_actual && r.takedown_actual >= start && r.takedown_actual <= end) {
          const late = String(r.takedown_status ?? "").startsWith("LATE");
          add(r.takedown_actual, late ? "Takedown LATE" : "Takedown", 
            `${r.strain ?? r.harvest} · ${r.room}${late ? ` — ${r.takedown_status}` : " — on plan"}`,
            "harvest_lifecycle", late ? LATE : ON, r);
        }
        if (r.dry_deadline_date && r.dry_deadline_date >= start && r.dry_deadline_date <= end) {
          const blown = String(r.drying_status ?? "").includes("BLOWN");
          const done = String(r.drying_status ?? "").startsWith("Dry complete");
          add(r.dry_deadline_date, done ? "Dry complete" : blown ? "DRY DEADLINE BLOWN" : "Dry out due",
            `${r.strain ?? r.harvest} · ${r.room} — ${r.drying_status}`,
            "harvest_lifecycle", done ? DONE : blown ? LATE : RISK, r);
        }
        if (r.dry_target_date && r.dry_target_date >= start && r.dry_target_date <= end
            && !String(r.drying_status ?? "").startsWith("Dry complete")) {
          add(r.dry_target_date, "Dry target (day 10)", `${r.strain ?? r.harvest} · ${r.room}`,
            "harvest_lifecycle", RISK, r);
        }
      });
      setEvents(ev);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [span, anchor, plan?.id]);
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
          <button className="btn small ghost" onClick={() => setAnchor((a) => spanShift(span, a, -1))}>‹</button>
          <span className="calmonth">{spanLabel(span, anchor)}</span>
          <button className="btn small ghost" onClick={() => setAnchor((a) => spanShift(span, a, 1))}>›</button>
          <button className="btn small" onClick={() => setAnchor(new Date())}>Today</button>
        </div>
      </div>
      <div className="filterbar">
        <span className="flab">Planner</span>
        <select className="fdate" style={{ width: 230 }} value={plan?.id ?? ""} onChange={(e) => setPlan(planners.find((p) => p.id === e.target.value) ?? null)}>
          {planners.map((p) => <option key={p.id} value={p.id}>{p.name}{p.is_private ? " (private)" : ""}</option>)}
        </select>
        {!pform.creating ? (
          <button className="btn small ghost" onClick={() => setPform({ ...pform, creating: true })}>+ New planner</button>
        ) : (
          <>
            <input className="fsearch" style={{ maxWidth: 220 }} placeholder="Planner name…" value={pform.name}
              onChange={(e) => setPform({ ...pform, name: e.target.value })} />
            {PLANNER_LEGEND.map(([label], i) => {
              const key = ["harvest", "shipment", "work_order", "expiry", "shift"][i];
              const on = pform.srcs.includes(key);
              return (
                <button key={key} className={`schip ${on ? "good sel" : "info"}`}
                  onClick={() => setPform({ ...pform, srcs: on ? pform.srcs.filter((s) => s !== key) : [...pform.srcs, key] })}>
                  {label}
                </button>
              );
            })}
            <button className="btn small" onClick={createPlanner}>Create</button>
            <button className="btn small ghost" onClick={() => setPform({ ...pform, creating: false })}>✕</button>
          </>
        )}
      </div>
      <div className="filterbar">
        <span className="flab">View</span>
        <select className="fdate" value={span} onChange={(e) => setSpan(e.target.value)}>
          {PLANNER_SPANS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <span className="flab">Layout</span>
        <span className="vetabs" style={{ border: "none", margin: 0 }}>
          <button className={`vetab ${layout === "calendar" ? "on" : ""}`} onClick={() => setLayout("calendar")}>Calendar</button>
          <button className={`vetab ${layout === "list" ? "on" : ""}`} onClick={() => setLayout("list")}>List</button>
        </span>
        <span className="flab">Jump to</span>
        <input type="date" className="fdate" value={isoD(anchor)}
          onChange={(e) => e.target.value && setAnchor(new Date(e.target.value + "T12:00:00"))} />
        <span style={{ flex: 1 }} />
        <span className="note">{events ? Object.values(events).reduce((a, v) => a + v.length, 0) : 0} events in view</span>
      </div>
      <div className="callegend">
        {PLANNER_LEGEND.map(([l, c], i) => {
          const key = ["harvest", "inventory", "harvest", "harvest", "harvest", "shipment", "work_order", "expiry", "shift"][i];
          return allowed(key) ? <span key={l} className="cl"><i style={{ background: c }} />{l}</span> : null;
        })}
      </div>
      {events === null ? <div className="empty"><div className="eicon">{I.clock}</div>Loading the month…</div> : (
        <>
          {layout === "list" ? (
            <div className="glist">
              {Object.keys(events).sort().map((day) => (
                <div key={day} className="msection" style={{ marginTop: 8 }}>
                  <div className="mtitle"><span className="sq" />
                    <h2>{new Date(day + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}</h2>
                    <span className="rule" /><span className="note">{events[day].length}</span>
                  </div>
                  {events[day].map((e, i) => (
                    <button key={i} className="bres" onClick={() => setDetail({ ...e, date: day })}>
                      <span className="brl" style={{ color: e.color }}>{e.type}</span>
                      <span className="brs">{e.label}</span><span className="bra">{I.caret}</span>
                    </button>
                  ))}
                </div>
              ))}
              {Object.keys(events).length === 0 && (
                <div className="empty"><div className="eicon">{I.clock}</div><b>Nothing scheduled in this range</b>Widen the view or move the date.</div>
              )}
            </div>
          ) : (
          <div className="calgrid">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => <div key={d} className="caldow">{d}</div>)}
            {cells.map((d, i) => {
              if (d === null) return <div key={`b${i}`} className="calcell blank" />;
              const k = iso(d);
              const list = events[k] ?? [];
              return (
                <button key={k} className={`calcell ${k === todayIso ? "today" : ""} ${(sel === k || (rangeEnd && k >= (sel ?? "") && k <= rangeEnd)) ? "sel" : ""}`}
                  onClick={(ev) => {
                    if (ev.shiftKey && sel && k > sel) { setRangeEnd(k); return; }
                    setRangeEnd(null); setSel(sel === k && !rangeEnd ? null : k);
                  }}>
                  <span className="caldate">{d}</span>
                  {list.slice(0, 3).map((e, j) => (
                    <span key={j} className="calev clickable" style={{ borderLeftColor: e.color }}
                      title={`${e.type}: ${e.label} — click for the complete record`}
                      onClick={(ce) => { ce.stopPropagation(); setDetail({ ...e, date: k }); }}>{e.label}</span>
                  ))}
                  {list.length > 3 && <span className="calmore">+{list.length - 3} more</span>}
                </button>
              );
            })}
          </div>
          )}
          )}
          {detail && (
            <div className="vedrawerwrap" onClick={() => setDetail(null)}>
              <div className="vedrawer" onClick={(e) => e.stopPropagation()}>
                <div className="srhead">
                  <span className="srtitle">{detail.type} detail</span>
                  <button className="btn small ghost" onClick={() => setDetail(null)}>✕</button>
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", margin: "6px 0" }}>
                  <span className="vegchip" style={{ background: detail.color, color: "#07130b" }}>{detail.type}</span>
                  <span className="note">{new Date(detail.date + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}</span>
                </div>
                <div style={{ fontFamily: '"Figtree", sans-serif', fontSize: 16, fontWeight: 700, margin: "4px 0 10px" }}>{detail.label}</div>
                {detail.row && (
                  <div className="tablewrap"><table><tbody>
                    {Object.entries(detail.row)
                      .filter(([k, v]) => v !== null && v !== "" && k !== "id" && !k.endsWith("_id"))
                      .map(([k, v]) => (
                        <tr key={k}>
                          <td className="note" style={{ textTransform: "capitalize", whiteSpace: "nowrap" }}>{k.replaceAll("_", " ")}</td>
                          <td>{typeof v === "object" ? JSON.stringify(v) : String(v)}</td>
                        </tr>
                      ))}
                  </tbody></table></div>
                )}
                <button className="btn" style={{ marginTop: 12 }} onClick={() => { const d = detail.drill; setDetail(null); go(d); }}>
                  Open the full {detail.type.toLowerCase()} page
                </button>
              </div>
            </div>
          )}
          {sel && (() => {
            const days = Object.keys(events).filter((d) => (rangeEnd ? d >= sel && d <= rangeEnd : d === sel)).sort();
            const total = days.reduce((a, d) => a + (events[d] ?? []).length, 0);
            const byType = {};
            for (const d of days) for (const e of events[d] ?? []) byType[e.type] = (byType[e.type] ?? 0) + 1;
            return (
              <div className="msection">
                <div className="mtitle"><span className="sq" />
                  <h2>{rangeEnd ? `${sel} → ${rangeEnd}` : new Date(sel + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}</h2>
                  <span className="rule" />
                  <span className="note">{total} item{total === 1 ? "" : "s"}</span>
                  <button className="btn small ghost" onClick={() => { setSel(null); setRangeEnd(null); }}>Clear</button>
                </div>
                <div className="statchips" style={{ marginBottom: 10 }}>
                  {Object.entries(byType).map(([t, n]) => <span key={t} className="schip good"><b>{n}</b> {t}</span>)}
                  <span className="schl">{rangeEnd ? "Range selected" : "Shift-click another day to select a range"}</span>
                </div>
                {total === 0 ? <p className="bnote">Nothing scheduled from live records for this {rangeEnd ? "range" : "day"}.</p> : days.map((d) => (
                  <div key={d}>
                    {rangeEnd && <div className="note" style={{ margin: "10px 0 4px", fontWeight: 700 }}>{new Date(d + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}</div>}
                    {(events[d] ?? []).map((e, i) => (
                      <button key={i} className="bres" onClick={() => setDetail({ ...e, date: d })} title="Open the complete record">
                        <span className="brl" style={{ color: e.color }}>{e.type}</span>
                        <span className="brs">{e.label}</span><span className="bra">{I.caret}</span>
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            );
          })()}
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
      <div className="ptitle"><span className="pchip" style={{ background: "var(--violet)", color: "#07130b" }}>{I.qr}</span> Square-code (QR) decoder</div>
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
  const [form, setForm] = useState({ METRC_LICENSES: "", METRC_VENDOR_KEYS: "", METRC_USER_KEY: "", METRC_STATE: "", CLICKUP_TOKEN: "" });
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
            <div className="ptitle"><span className="pchip" style={{ background: "var(--neon)", color: "var(--neon-ink)" }}>{I.shield}</span> Metrc — Massachusetts</div>
            <label>Licenses (comma-separated, cultivation first) {setPill("METRC_LICENSES")}</label>
            <input value={form.METRC_LICENSES} onChange={(e) => setForm({ ...form, METRC_LICENSES: e.target.value })} placeholder={isSet("METRC_LICENSES") ? "•••••• stored — paste to replace" : "MC…, MP…"} />
            <label>Vendor / software key(s) {setPill("METRC_VENDOR_KEYS")}</label>
            <input value={form.METRC_VENDOR_KEYS} onChange={(e) => setForm({ ...form, METRC_VENDOR_KEYS: e.target.value })} placeholder={isSet("METRC_VENDOR_KEYS") ? "•••••• stored — paste to replace" : "from the Metrc Connect portal"} />
            <label>User key {setPill("METRC_USER_KEY")}</label>
            <input value={form.METRC_USER_KEY} onChange={(e) => setForm({ ...form, METRC_USER_KEY: e.target.value })} placeholder={isSet("METRC_USER_KEY") ? "•••••• stored — paste to replace" : "metrc.com → profile → API Keys"} />
            <label>State {setPill("METRC_STATE")}</label>
            <input value={form.METRC_STATE} onChange={(e) => setForm({ ...form, METRC_STATE: e.target.value })} placeholder="ma" />
            <div className="ptitle" style={{ marginTop: 18 }}><span className="pchip" style={{ background: "var(--neon)", color: "var(--neon-ink)" }}>{I.board}</span> ClickUp</div>
            <label>API token — write-only, never displayed {setPill("CLICKUP_TOKEN")}</label>
            <input value={form.CLICKUP_TOKEN} onChange={(e) => setForm({ ...form, CLICKUP_TOKEN: e.target.value })} placeholder={isSet("CLICKUP_TOKEN") ? "•••••• stored — paste to replace" : "ClickUp → avatar → Settings → Apps → API Token (starts pk_)"} />
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
const CANVAS_DEF = { dark: { c1: "#39ff14", c2: "#fff000", c3: "#00e5ff" }, light: { c1: "#39ff14", c2: "#faff00", c3: "#00e5ff" } };
const CANVAS_PRESETS = [
  { name: "TG Neon", c: ["#39ff14", "#fff000", "#00e5ff"] },
  { name: "Citrus Punch", c: ["#c6ff00", "#ffea00", "#ff9100"] },
  { name: "Beach Day", c: ["#18ffff", "#ffff00", "#00e676"] },
  { name: "Island Heat", c: ["#00e676", "#ffea00", "#ff6d00"] },
  { name: "Miami Surf", c: ["#00e676", "#1de9b6", "#00b0ff"] },
  { name: "Sunset Pop", c: ["#ffea00", "#ff9100", "#ff3d81"] },
  { name: "Tropical Lagoon", c: ["#00e5ff", "#00e676", "#ffea00"] },
  { name: "Tropical Punch", c: ["#ff3d81", "#ff9100", "#00e676"] },
  { name: "Mango Tango", c: ["#ffea00", "#ff9100", "#ff5252"] },
  { name: "Palm Paradise", c: ["#00e676", "#76ff03", "#00b0ff"] },
];
const GLOW_LEVELS = { off: "0", soft: "0.45", standard: "0.75", bold: "1" };
const GLOW_REACH = { short: "0.7", standard: "1", deep: "1.6", full: "2.4" };
function applyCanvasTheme(ct) {
  const r = document.documentElement.style;
  const set = (k, v) => (v ? r.setProperty(k, v) : r.removeProperty(k));
  set("--mesh-d1", ct?.dark?.c1); set("--mesh-d2", ct?.dark?.c2); set("--mesh-d3", ct?.dark?.c3);
  set("--mesh-l1", ct?.light?.c1); set("--mesh-l2", ct?.light?.c2); set("--mesh-l3", ct?.light?.c3);
  set("--glow-i", GLOW_LEVELS[ct?.intensity] ?? null);
  set("--glow-reach", GLOW_REACH[ct?.reach] ?? null);
}
function Settings({ session, prefs }) {
  const { theme, setTheme } = prefs;
  const [avatarUrl, setAvatarUrl] = useState(null);
  const [avMsg, setAvMsg] = useState(null);
  const [ct, setCt] = useState(null);
  const avRef = React.useRef(null);
  useEffect(() => {
    supabase.from("user_settings").select("avatar_url, canvas_theme").eq("user_id", session.user.id).maybeSingle()
      .then(({ data }) => { setAvatarUrl(data?.avatar_url ?? null); setCt(data?.canvas_theme ?? null); });
  }, [session.user.id]);
  const saveCt = async (next) => {
    setCt(next); applyCanvasTheme(next);
    await supabase.from("user_settings").upsert({ user_id: session.user.id, canvas_theme: next }, { onConflict: "user_id" });
  };
  const choosePreset = (p) => saveCt({ preset: p.name, dark: { c1: p.c[0], c2: p.c[1], c3: p.c[2] }, light: { c1: p.c[0], c2: p.c[1], c3: p.c[2] } });
  const setColor = (mode, k, v) => {
    const base = ct ?? { preset: "custom", ...CANVAS_DEF };
    saveCt({ ...base, preset: "custom", [mode]: { ...(base[mode] ?? CANVAS_DEF[mode]), [k]: v } });
  };
  const [avEdit, setAvEdit] = useState(null);
  const avImgRef = React.useRef(null);
  const uploadAvatar = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setAvMsg(null);
    setAvEdit({ src: URL.createObjectURL(f), zoom: 1 });
  };
  const saveAvatar = async () => {
    const img = avImgRef.current;
    if (!img || !avEdit) return;
    setAvMsg("Resizing and uploading…");
    const S = 512;
    const c = document.createElement("canvas");
    c.width = S; c.height = S;
    const ctx = c.getContext("2d");
    const base = Math.max(S / img.naturalWidth, S / img.naturalHeight) * avEdit.zoom;
    const dw = img.naturalWidth * base, dh = img.naturalHeight * base;
    ctx.fillStyle = "#0a0c0b"; ctx.fillRect(0, 0, S, S);
    ctx.drawImage(img, (S - dw) / 2, (S - dh) / 2, dw, dh);
    const blob = await new Promise((res) => c.toBlob(res, "image/jpeg", 0.88));
    const path = `${session.user.id}-${Date.now()}.jpg`;
    const { error } = await supabase.storage.from("avatars").upload(path, blob, { upsert: true, contentType: "image/jpeg" });
    if (error) { setAvMsg(`Upload failed: ${error.message}`); return; }
    const { data } = supabase.storage.from("avatars").getPublicUrl(path);
    await supabase.from("user_settings").upsert({ user_id: session.user.id, avatar_url: data.publicUrl }, { onConflict: "user_id" });
    setAvatarUrl(data.publicUrl);
    setAvEdit(null);
    setAvMsg("Saved — your photo now shows on the top bar.");
    window.dispatchEvent(new CustomEvent("tg-avatar-updated", { detail: data.publicUrl }));
  };
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
          <div className="mtitle"><span className="sq" /><h2>Profile photo</h2><span className="rule" /></div>
          <div className="panel" style={{ maxWidth: "none" }}>
            {avEdit ? (
              <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
                <span className="uav big" style={{ width: 128, height: 128 }}>
                  <img ref={avImgRef} src={avEdit.src} alt="Preview" style={{ transform: `scale(${avEdit.zoom})`, transformOrigin: "center" }} />
                </span>
                <div style={{ flex: 1, minWidth: 220 }}>
                  <div className="note">Zoom to fit — drag the slider until it looks right in the circle:</div>
                  <input type="range" min="1" max="3" step="0.01" value={avEdit.zoom} style={{ width: "100%", margin: "8px 0" }}
                    onChange={(e) => setAvEdit({ ...avEdit, zoom: Number(e.target.value) })} />
                  <div style={{ display: "flex", gap: 8 }}>
                    <button className="btn small" onClick={saveAvatar}>Save photo</button>
                    <button className="btn small ghost" onClick={() => setAvEdit(null)}>Cancel</button>
                  </div>
                  <div className="note" style={{ marginTop: 6 }}>{avMsg ?? "Any image works — we resize it to 512 × 512 pixels automatically. No need to prepare anything."}</div>
                </div>
              </div>
            ) : (
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <span className="uav big">{avatarUrl ? <img src={avatarUrl} alt="Your profile" /> : I.users}</span>
                <div>
                  <button className="btn small" onClick={() => avRef.current?.click()}>{avatarUrl ? "Change photo" : "Upload photo"}</button>
                  <input ref={avRef} type="file" accept="image/*" style={{ display: "none" }} onChange={uploadAvatar} />
                  <div className="note" style={{ marginTop: 6 }}>{avMsg ?? "Any image works — automatically resized to 512 × 512 pixels with a zoom control, so you never have to fight file sizes."}</div>
                </div>
              </div>
            )}
          </div>
        </div>
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
          <div className="mtitle"><span className="sq" /><h2>Canvas gradient</h2><span className="rule" /></div>
          <div className="panel" style={{ maxWidth: "none" }}>
            <div className="note" style={{ marginBottom: 8 }}>Summer presets — one click sets both modes. Then fine-tune each color per mode; everything saves to your account and applies instantly.</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {CANVAS_PRESETS.map((p) => (
                <button key={p.name} className={`cppre ${ct?.preset === p.name ? "on" : ""}`} onClick={() => choosePreset(p)}
                  title={`${p.name} — top strip is dark mode, bottom is light mode. One click sets both.`}>
                  <span className="cpd" style={{ background: `linear-gradient(180deg, rgba(10,12,11,0.05) 0%, rgba(10,12,11,0.88) 100%), linear-gradient(100deg, ${p.c[0]}, ${p.c[1]}, ${p.c[2]})` }} />
                  <span className="cpl" style={{ background: `linear-gradient(180deg, rgba(253,254,253,0.15) 0%, rgba(253,254,253,0.92) 100%), linear-gradient(100deg, ${p.c[0]}, ${p.c[1]}, ${p.c[2]})` }} />
                  <span className="cpn">{p.name}{ct?.preset === p.name ? " ✓" : ""}</span>
                </button>
              ))}
            </div>
            {["dark", "light"].map((mode) => (
              <div key={mode} style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 12 }}>
                <span className="note" style={{ width: 96, textTransform: "capitalize" }}>{mode} colors</span>
                {["c1", "c2", "c3"].map((k) => (
                  <input key={k} type="color" value={ct?.[mode]?.[k] ?? CANVAS_DEF[mode][k]}
                    onChange={(e) => setColor(mode, k, e.target.value)}
                    style={{ width: 44, height: 30, padding: 0, border: "1px solid var(--line)", borderRadius: 4, background: "none", cursor: "pointer" }} />
                ))}
                <span className="note">left · middle · right of the mesh</span>
              </div>
            ))}
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 12 }}>
              <span className="note" style={{ width: 96 }}>Glow strength</span>
              {[["off", "Off"], ["soft", "Soft"], ["standard", "Standard"], ["bold", "Bold"]].map(([k, l]) => (
                <button key={k} className={`btn small ghost ${(ct?.intensity ?? "standard") === k ? "sel" : ""}`}
                  onClick={() => saveCt({ ...(ct ?? { ...CANVAS_DEF }), intensity: k })}>{l}{(ct?.intensity ?? "standard") === k ? " ✓" : ""}</button>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 10 }}>
              <span className="note" style={{ width: 96 }}>Glow reach</span>
              {[["short", "Short"], ["standard", "Standard"], ["deep", "Deep"], ["full", "Full page"]].map(([k, l]) => (
                <button key={k} className={`btn small ghost ${(ct?.reach ?? "standard") === k ? "sel" : ""}`}
                  onClick={() => saveCt({ ...(ct ?? { ...CANVAS_DEF }), reach: k })}>{l}{(ct?.reach ?? "standard") === k ? " ✓" : ""}</button>
              ))}
            </div>
            {ct && <button className="btn small ghost" style={{ marginTop: 12 }} onClick={() => saveCt(null) || applyCanvasTheme(null)}>Reset to brand default</button>}
          </div>
        </div>
        <div className="msection" style={{ marginTop: 0 }}>
          <div className="mtitle"><span className="sq" /><h2>Account</h2><span className="rule" /></div>
          <div className="panel" style={{ maxWidth: "none" }}>
            <div className="ptitle"><span className="pchip" style={{ background: "#f5c542", color: "#3a2b00" }}>{I.users}</span> {session.user.email}</div>
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
  ["Signing in & accounts", "The first account ever created is the owner. Everyone after starts read-only until the owner assigns a role (role screens arrive with the Human Resources milestone). Email confirmation may land on a plain white page — the confirmation still works; just return to the site and sign in."],
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
            <div className="ptitle"><span className="pchip" style={{ background: "var(--blue)", color: "#06121f" }}>{I.help}</span> {q}</div>
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
  const [q, setQ] = useState("");
  const [statusSel, setStatusSel] = useState(null);
  const [deptSel, setDeptSel] = useState("");
  const [sort, setSort] = useState({ col: "full_name", dir: 1 });
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
  const enriched = (rows ?? []).map((r) => ({
    employee_code: r.employee_code,
    full_name: r.full_name,
    position: roleOf(r.primary_role_id),
    departments: [deptOf(r.primary_department_id), r.secondary_department_id ? deptOf(r.secondary_department_id) : null].filter((x) => x && x !== "—").join(" + ") || "—",
    status: r.status,
    ...r,
  }));
  const statuses = [...new Set(enriched.map((r) => r.status ?? "—"))];
  const deptNames = [...new Set(enriched.flatMap((r) => r.departments.split(" + ")).filter((x) => x !== "—"))].sort();
  const filtered = enriched
    .filter((r) =>
      (!q || `${r.employee_code} ${r.full_name} ${r.position} ${r.departments}`.toLowerCase().includes(q.toLowerCase())) &&
      (!statusSel || (r.status ?? "—") === statusSel) &&
      (!deptSel || r.departments.includes(deptSel)))
    .sort((a, b) => sort.dir * String(a[sort.col] ?? "").localeCompare(String(b[sort.col] ?? "")));
  const clickSort = (col) => setSort((s) => (s.col === col ? { col, dir: -s.dir } : { col, dir: 1 }));
  const arrow = (col) => (sort.col === col ? (sort.dir === 1 ? " ▲" : " ▼") : "");
  const exportCSV = () => {
    const head = ["Code", "Name", "Position", "Departments", "Status"];
    const lines = [head.join(","), ...filtered.map((r) =>
      cols.map((c) => `"${String(r[c] ?? "").replaceAll('"', '""')}"`).join(","))];
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/csv" }));
    a.download = "employees.csv"; a.click();
  };
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
        <>
          <div className="filterbar">
            <input className="fsearch" placeholder="Search name, code, position, department…" value={q} onChange={(e) => setQ(e.target.value)} />
            <span className="flab">Department</span>
            <select className="fdate" value={deptSel} onChange={(e) => setDeptSel(e.target.value)}>
              <option value="">All</option>
              {deptNames.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
            {(q || statusSel || deptSel) && (
              <button className="btn small ghost" onClick={() => { setQ(""); setStatusSel(null); setDeptSel(""); }}>Clear</button>
            )}
            <span style={{ flex: 1 }} />
            <span className="note">{filtered.length} of {enriched.length}</span>
            <button className="btn small ghost" onClick={exportCSV}>Export CSV</button>
            <button className="btn small ghost" onClick={() => window.print()}>Print</button>
          </div>
          <div className="statchips">
            {statuses.map((s) => (
              <button key={s} className={`schip ${s === "active" ? "good" : "warn"} ${statusSel === s ? "sel" : ""}`}
                onClick={() => setStatusSel(statusSel === s ? null : s)}>
                <b>{enriched.filter((r) => (r.status ?? "—") === s).length}</b> {s}
              </button>
            ))}
            <span className="schl">Live breakdown by status — click to filter</span>
          </div>
          <div className="tablewrap">
            <table>
              <thead><tr>
                <th style={{ cursor: "pointer" }} onClick={() => clickSort("employee_code")}>Code{arrow("employee_code")}</th>
                <th style={{ cursor: "pointer" }} onClick={() => clickSort("full_name")}>Name{arrow("full_name")}</th>
                <th style={{ cursor: "pointer" }} onClick={() => clickSort("position")}>Position{arrow("position")}</th>
                <th style={{ cursor: "pointer" }} onClick={() => clickSort("departments")}>Departments{arrow("departments")}</th>
                <th style={{ cursor: "pointer" }} onClick={() => clickSort("status")}>Status{arrow("status")}</th>
              </tr></thead>
              <tbody>{filtered.map((r) => <RawRow key={r.id} row={r} cols={cols} />)}</tbody>
            </table>
          </div>
        </>
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
  const [view, setView] = useState(() => window.location.hash.slice(1) || "tower");
  useEffect(() => {
    if (window.location.hash.slice(1) !== view) window.history.pushState(null, "", `#${view}`);
  }, [view]);
  useEffect(() => {
    const onPop = () => setView(window.location.hash.slice(1) || "tower");
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  const [openCats, setOpenCats] = useState({});
  const [dragging, setDragging] = useState(false);
  const [userMenu, setUserMenu] = useState(false);
  const [launcher, setLauncher] = useState(false);
  useEffect(() => {
    // Owner order 2026-08-05: no realm recoloring — neon green sitewide, always.
    delete document.documentElement.dataset.realm;
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
  const [avatarUrl, setAvatarUrl] = useState(null);
  const fileRef = React.useRef(null);
  useEffect(() => {
    if (!session?.user?.id) return;
    supabase.from("user_settings").select("avatar_url, canvas_theme").eq("user_id", session.user.id).maybeSingle()
      .then(({ data }) => { setAvatarUrl(data?.avatar_url ?? null); applyCanvasTheme(data?.canvas_theme ?? null); });
  }, [session?.user?.id]);
  useEffect(() => {
    const h = (e) => setAvatarUrl(e.detail);
    window.addEventListener("tg-avatar-updated", h);
    return () => window.removeEventListener("tg-avatar-updated", h);
  }, []);
  const uploadAvatar = async (e) => {
    const f = e.target.files?.[0];
    if (!f || !session) return;
    const path = `${session.user.id}-${Date.now()}.${(f.name.split(".").pop() || "png").toLowerCase()}`;
    const { error } = await supabase.storage.from("avatars").upload(path, f, { upsert: true });
    if (error) return;
    const { data } = supabase.storage.from("avatars").getPublicUrl(path);
    await supabase.from("user_settings").upsert({ user_id: session.user.id, avatar_url: data.publicUrl }, { onConflict: "user_id" });
    setAvatarUrl(data.publicUrl);
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
    planner: <PlannerScreen go={setView} session={session} />,
    dashboards: <DashboardsScreen session={session} go={setView} />,
    whiteboards: <WhiteboardsScreen session={session} />,
    tasks: <TasksScreen session={session} />,
    messages: <ChatScreen session={session} />,
    people: <People />,
    integrations: <Integrations session={session} />,
    settings: <Settings session={session} prefs={prefs} />,
    help: <Help />,
    metrc_mirror: <MetrcMirror />,
    metrc_mc: <MetrcMirror license="MC281714" />,
    metrc_mp: <MetrcMirror license="MP281909" />,
    golive: <GoLiveScreen isExec={isExec} go={setView} />,
    metrc_report_import: <MetrcReportImport session={session} />,
    action_register: <RegisterScreen isExec={isExec} />,
    allocation_requests: <AllocationRequests session={session} isExec={isExec} />,
    ceo_dashboard: <CeoDashboard go={setView} />,
    budz: <BudzScreen go={setView} />,
    inventory_locator: <InventoryLocator go={setView} />,
    menu_manager: isExec
      ? <MenuManager onChanged={() => setNavVersion((v) => v + 1)} />
      : <div className="empty"><div className="eicon">{I.shield}</div><b>Admin area</b>Menu Manager is restricted to executives. Ask an owner if a menu change is needed.</div>,
  };
  const body = special[view] ?? (current
    ? <ModuleScreen entry={current} actions={current.sync_enabled ? <SyncCenter session={session} /> : undefined} />
    : <ControlTower go={setView} />);

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
            <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={uploadAvatar} />
            <button className="avatar" title={email} onClick={() => setUserMenu((v) => !v)}>
              {avatarUrl ? <img src={avatarUrl} alt="" /> : (email[0] ?? "T").toUpperCase()}
            </button>
            {userMenu && (
              <div className="umenu" onMouseLeave={() => setUserMenu(false)}>
                <div className="uhead">
                  <button className="uav" title="Change profile photo" onClick={() => fileRef.current?.click()}>
                    {avatarUrl ? <img src={avatarUrl} alt="" /> : (email[0] ?? "T").toUpperCase()}
                  </button>
                  <div><div className="uname">Signed in</div><div className="umail">{email}</div>
                    <button className="uphoto" onClick={() => fileRef.current?.click()}>Upload photo</button></div>
                </div>
                <div className="usep" />
                <div className="ulabel">Theme</div>
                <div className="uthemes">
                  <button className={prefs.theme === "dark" ? "on" : ""} onClick={() => prefs.setTheme("dark")}>{I.moon} Dark</button>
                  <button className={prefs.theme === "light" ? "on" : ""} onClick={() => prefs.setTheme("light")}>{I.sun} Light</button>
                </div>
                <div className="usep" />
                <button className="uitem dim" disabled title="Presence status arrives with the notifications engine">{I.users} Set status <span className="mtag">SOON</span></button>
                <button className="uitem dim" disabled title="Per-user notification preferences arrive with the inbox">{I.bell} Mute notifications <span className="mtag">SOON</span></button>
                <div className="usep" />
                <button className="uitem" onClick={() => { setUserMenu(false); setView("settings"); }}>{I.gear} Settings</button>
                <button className="uitem" onClick={() => { setUserMenu(false); setView("alerts"); }}>{I.bell} Notifications</button>
                <button className="uitem dim" disabled title="Cheat-sheet of shortcuts ships with the views engine">{I.clip} Keyboard shortcuts <span className="mtag">SOON</span></button>
                <button className="uitem dim" disabled title="Installable mobile app (PWA) is registered">{I.out} Get the app <span className="mtag">SOON</span></button>
                <button className="uitem" onClick={() => { setUserMenu(false); setView("help"); }}>{I.help} Help & Support</button>
                <div className="usep" />
                <div className="ulabel">Personal tools</div>
                <button className="uitem" onClick={() => { setUserMenu(false); setView("tasks"); }}>{I.check} Create task</button>
                <button className="uitem dim" disabled title="Personal My Work home is a registered P0">{I.box} My Work <span className="mtag">SOON</span></button>
                <button className="uitem" onClick={() => { setUserMenu(false); window.dispatchEvent(new CustomEvent("tg-open-timetools")); }}>{I.stopwatch} Track time</button>
                <button className="uitem dim" disabled title="Notepad rides the docs engine">{I.clip} Notepad <span className="mtag">SOON</span></button>
                <button className="uitem dim" disabled title="Screen + voice clips are registered">{I.board} Record a clip <span className="mtag">SOON</span></button>
                <button className="uitem" onClick={() => { setUserMenu(false); startMic(); }}>{I.mic} Talk to text</button>
                <button className="uitem dim" disabled title="Personal reminders ride the notifications engine">{I.clock} Create reminder <span className="mtag">SOON</span></button>
                <button className="uitem dim" disabled title="Docs engine is registered (CODE-016)">{I.clip} Create doc <span className="mtag">SOON</span></button>
                <button className="uitem" onClick={() => { setUserMenu(false); setView("whiteboards"); }}>{I.board} Create whiteboard</button>
                <button className="uitem" onClick={() => { setUserMenu(false); setView("people"); }}>{I.users} Human Resources</button>
                <button className="uitem" onClick={() => { setUserMenu(false); setView("dashboards"); }}>{I.grid} Create dashboard</button>
                <button className="uitem" onClick={() => { setUserMenu(false); setView("planner"); }}>{I.clock} Planner</button>
                <button className="uitem" onClick={() => { setUserMenu(false); setView("brain"); }}>{I.dna} Ask Brain</button>
                <button className="uitem dim" disabled title="AI notetaker arrives with Meetings + M5 Brain">{I.dna} AI Notetaker <span className="mtag">M5</span></button>
                <div className="usep" />
                {isExec && <button className="uitem" onClick={() => { setUserMenu(false); setView("menu_manager"); }}>{I.burger} Menu Manager</button>}
                {isExec && <button className="uitem dim" disabled title="Soft-delete Trash with restore window is in the Admin Console build">{I.out} Trash <span className="mtag">SOON</span></button>}
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
