import React, { useEffect, useState, useCallback, useRef, useMemo, lazy, Suspense } from "react";
import { fetchDepartmentDashboard } from "./lib/dashboard-range.js";
import { rangePlan } from "./lib/range-search.js";
import {
  useDatePresetCatalog,
  useDefaultRange,
  saveDateDefault as persistDateDefault,
} from "./lib/date-range.js";
import {
  dateSelectionLabel,
  dateUpperExclusive,
  matchingDatePreset,
  normaliseDateRange,
} from "./lib/date-range-core.js";
import {
  certifiedPopulationVerdict,
  classifyReportMeasures,
  loadedGrainVerdict,
  loadedMeasureVerdict,
  selectReportContract,
} from "./lib/report-measure-contract.js";
import BusinessRuleEditor from "./business-rule-editor.jsx";
/* ═══════════════════════════════════════════════════════════════════════════
   ROUTE-LEVEL CODE SPLITTING — the owner's fifteen-second first paint.

   Measured 12 Aug 2026 before this change: the whole platform shipped as ONE
   1,294,080-byte JavaScript chunk. There was no React.lazy, no Suspense and no
   dynamic import anywhere in app/web/src, so signing in downloaded, parsed and
   evaluated every page in the product — the payroll runs, the document reader,
   the kiosk, three department dashboards — before the Control Tower could draw
   its first pixel.

   Every module below is a LEAF: it is imported by nothing except this file and
   it is mounted by exactly one route. Splitting a leaf is safe in a way that
   splitting a shared module is not, which is why dashkit, budz and the Command
   Center's own primitives stay static — this file imports live bindings back
   out of them at module scope, and a dynamic import cannot satisfy that.

   Suspense sits around the page body, so switching routes shows one honest line
   while the chunk arrives instead of a white screen. It never wraps the shell:
   the side menu and the top menu are not lazy and never blank.
   ═══════════════════════════════════════════════════════════════════════════ */
const Roster = lazy(() => import("./roster.jsx"));
const HrDashboard = lazy(() => import("./hrdash.jsx"));
const EmployeeFile = lazy(() => import("./empfile.jsx"));
const ScheduleBuilder = lazy(() => import("./schedbuild.jsx"));
const Timesheets = lazy(() => import("./timesheets.jsx"));
const HrQueue = lazy(() => import("./hrqueue.jsx"));
const Terminals = lazy(() => import("./terminals.jsx"));
const MyWeek = lazy(() => import("./myweek.jsx"));
const DocReader = lazy(() => import("./docreader.jsx"));
const Onboard = lazy(() => import("./onboard.jsx"));
const StaffForms = lazy(() => import("./staffforms.jsx"));
const PayRuns = lazy(() => import("./payruns.jsx"));
const MySchedule = lazy(() => import("./myschedule.jsx"));
const SyncItems = lazy(() => import("./syncitems.jsx"));
const KeysConnections = lazy(() => import("./keysconnections.jsx"));
const WidgetCanvas = lazy(() => import("./wcanvas.jsx").then((m) => ({ default: m.WidgetCanvas })));
const TgWorkspace = lazy(() => import("./tgworkspace.jsx"));
import jsQR from "jsqr";
import { supabase, FUNCTIONS_URL } from "./lib/supabase.js";
import { BudzScreen, CeoDashboard, AssistantSettings, BudzPet, useBudzPet, RedGreen,
         askBudzFull, useChatFiles, ChatFiles, Thinking,
         useVoice, VoiceButtons } from "./budz.jsx";
/* Clean-slate Command Center (owner pivot, 12 Aug 2026): a new tree in its own
   module, mounted at dept_dash_command below. It imports shared primitives and
   the frozen keep-list components back from this file — the import cycle is
   deliberate and safe because every binding is used at render time only. */
const CommandCenter = lazy(() => import("./commandcenter.jsx"));
/* dashkit — the shared dashboard primitives and the widget/drag framework the
   department dashboards are built from. The evidence cell is imported back
   here so the shared stock-proof drill carries certificate and manifest on
   every row, sitewide (owner hard rule, 12 Aug 2026). Same deliberate,
   render-time-only import cycle as the Command Center above. */
import { TagEvidence, TagEvidenceProvider, DkHarvestControlBanner } from "./dashkit.jsx";
const CultivationDashboard = lazy(() => import("./dash-cultivation.jsx"));
const InventoryDashboard = lazy(() => import("./dash-inventory.jsx"));
/* SCHEDULE ADHERENCE — written 13 Aug 2026 and, until now, mounted by nothing.
   Vite tree-shakes what no route imports, so dash-schedule.jsx and its stylesheet
   were excluded from every bundle we have shipped: 1,627 lines that passed every
   gate and reached no screen. Committed and not routed is the same as not built.
   Same prop contract as the Cultivation and Inventory dashboards above. */
const ScheduleAdherenceDashboard = lazy(() => import("./dash-schedule.jsx"));
/* THE NINE CULTIVATION REGISTERS, Agent B, 15 Aug 2026. Each of these view keys
   already had an ENABLED nav_registry row and no component, so every one of them
   fell through to the generic data browser and rendered as a flat grid: no key
   figure, no owner-set target, no drill, nothing assignable. Registered and
   rendering a grid is not the same as built.

   Each is its own module and its own layout, sharing only primitives from
   dashkit and cult-kit. That is the whole point of the ruling against one
   template: a take-down register reads by severity, a loss ledger reads down a
   date spine, a catalogue reads across a card grid, and a turn audit reads one
   column per room. Same import cycle as the dashboards above, and safe for the
   same reason: every binding is used at render time only. */
const HarvestsRegister = lazy(() => import("./cult-harvests.jsx"));
const HarvestLifecycle = lazy(() => import("./cult-harvest-lifecycle.jsx"));
const HarvestDetailPlan = lazy(() => import("./cult-harvest-detail.jsx"));
const LossLedger = lazy(() => import("./cult-loss-ledger.jsx"));
const LossAnalysis = lazy(() => import("./cult-loss-analysis.jsx"));
const Genetics = lazy(() => import("./cult-genetics.jsx"));
const RoomTurnAudit = lazy(() => import("./cult-room-turn-audit.jsx"));
const MoistureRegister = lazy(() => import("./cult-moisture-register.jsx"));
const Grading = lazy(() => import("./cult-grading.jsx"));
/* METRC EXCEPTION QUEUES — ticket C2, 26 Aug 2026. Four Metrc-driven queues on
   one page_archetype `issue_queue` surface: harvest moisture and residual,
   packages never submitted for testing, failed tests with no disposition, and
   harvests open past the 28-day limit. Same prop contract as every page above. */
const MetrcExceptions = lazy(() => import("./metrc-exceptions.jsx"));
/* PLANT CENSUS AND THE METRC MIRROR — 15 Aug 2026. The plant record was
   reconciled against both of Metrc's paths on 14-15 Aug and v_plant_census and
   v_plant_mirror_balance were named by no component in this tree, so none of it
   reached a screen. Same prop contract as the dashboards above. */
const PlantCensusDashboard = lazy(() => import("./dash-plants.jsx"));
/* THE WALL TERMINAL. nav_registry has carried an ENABLED row for view_key
   `kiosk` — "Wall Terminal", on the Human Resources menu — while App.jsx had no
   entry for it, so the click fell through to `current` and rendered the generic
   module screen over `time_entries`: a searchable table of other people's punches
   where a gloved hand at 6:52am expects a keypad. Terminals & Credentials has a
   button that goes to the same place. Both now reach the terminal itself. */
const Kiosk = lazy(() => import("./kiosk.jsx"));
/* THE FINANCE MONEY SURFACES — 15 Aug 2026. Four pages that nav_registry has
   carried enabled rows for since the menu was built, every one of them falling
   through to the generic module screen over its registered table. Three of those
   four registered objects are defective or empty and the grid could not say so:
   v_sales_history reads three Metrc fields at the wrong JSON depth,
   v_customer_manifests can no longer be read in full since metrc_packages
   quadrupled, and sales_orders holds nothing at all. Each page now reads a source
   that is correct, states its basis under every figure, and names the defect in
   its own registered object rather than rendering it silently.
   Four leaves, four routes, split like every other page here. */
const SalesHistoryPage = lazy(() => import("./fin-sales-history.jsx"));
const CustomersPage = lazy(() => import("./fin-customers.jsx"));
const CustomerManifestsPage = lazy(() => import("./fin-customer-manifests.jsx"));
const OrdersPage = lazy(() => import("./fin-orders.jsx"));

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
/* ---------- Workspace launcher: the work platform inside the OS ----------
   A hardcoded LAUNCHER_APPS array used to sit here: ten {view, icon, name, desc}
   objects, referenced by nothing since the launcher started reading nav_registry.
   Removed 19 Aug 2026. It was not merely dead — it was ACTIVELY MISLEADING. It
   carried `name` where live rows carry `label`, and two view keys (`templates`,
   `spaces`) that exist nowhere in the platform, so an outside review of this file
   reported the launcher's search as broken against a shape the launcher has not
   read in months. Dead code that mimics the live path manufactures findings.
   Law 4: nothing hardwired — the launcher's contents are DB rows. */
function Launcher({ onGo, onClose, apps }) {
  const [q, setQ] = useState("");
  const list = (apps ?? []).filter(
    (a) => !q || a.label.toLowerCase().includes(q.toLowerCase()) ||
           (a.category || "").toLowerCase().includes(q.toLowerCase()) ||
           (a.subcategory || "").toLowerCase().includes(q.toLowerCase())
  );
  const cats = [...new Set(list.map((a) => a.category))];
  return (
    <div className="launcher" onClick={onClose}>
      <div className="lwrap" onClick={(e) => e.stopPropagation()}>
        <div className="lhead">
          <img src="/tg-mark.png" alt="" />
          <div>
            <div className="lt">TG Workspace</div>
            <div className="ls">Work, People and Finance — everything that is not the production floor.</div>
          </div>
          <input aria-label="Search" className="lsearch" placeholder="Search…" value={q} autoFocus onChange={(e) => setQ(e.target.value)} />
          <button className="btn small ghost" onClick={onClose}>✕</button>
        </div>
        <div className="lcats">
          {cats.map((c) => (
            <div className="lcat" key={c}>
              <div className="lcname">{c}</div>
              {[...new Set(list.filter((a) => a.category === c).map((a) => a.subcategory || ""))].map((sub) => (
                <div className="lsub" key={c + sub}>
                  {sub && <div className="lsname">{sub}</div>}
                  <div className="lgrid">
                    {list.filter((a) => a.category === c && (a.subcategory || "") === sub).map((a) => (
                      <button key={a.view_key} className="lapp" onClick={() => { onGo(a.view_key); onClose(); }}
                        title={a.description || a.label}>
                        <span className="li">{iconByName(a.icon)}</span>
                        <span className="ln">{a.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ))}
          {list.length === 0 && <div className="lnone">Nothing matches that.</div>}
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
  const [trackError, setTrackError] = useState(null);
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
  /* "Stop & save" discarded the insert result, so a refused write cleared the
     running track and reset the panel to 0:00:00 — identical on screen to a
     save that worked. This is worked time that feeds payroll; losing it in
     silence is the worst shape a defect can take here. On failure the clock
     keeps running, nothing is cleared, and the reason is on screen: the person
     can retry, or write the hours down before they are lost. */
  const stopTrack = async () => {
    const seconds = Math.round((Date.now() - track) / 1000);
    setTrackError(null);
    const { error } = await supabase.from("time_tracks").insert({
      user_id: session.user.id, started_at: new Date(track).toISOString(),
      ended_at: new Date().toISOString(), seconds, note: note.trim() || null,
    });
    if (error) {
      setTrackError(`${fmtHMS(seconds)} was NOT saved — ${error.message || error.code || "the write was refused"}. Your clock is still running; nothing has been lost yet.`);
      return;
    }
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
          <input aria-label="What are you working on" className="ttnote" placeholder="What are you working on? (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
          {trackError && <div className="tterr" role="alert">{trackError}</div>}
          <div className="ttsub">Tracked today: {fmtHMS(todaySec)} — saved to your account; payroll timesheets wire in with the Work Layer.</div>
          <div className="usep" />
          <div className="ulabel">Timer</div>
          <div className="ttrow">
            <input aria-label="Timer length in minutes" className="ttmin" type="number" min="1" value={timerMin} onChange={(e) => setTimerMin(e.target.value)} />
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
  const [mustChange, setMustChange] = useState(false);
  const [showWelcome, setShowWelcome] = useState(false);
  useEffect(() => {
    if (!session?.user?.id) { setMustChange(false); return; }
    (async () => {
      const { data } = await supabase
        .from("app_users").select("must_change_password").eq("user_id", session.user.id).maybeSingle();
      setMustChange(!!data?.must_change_password);
    })();
  }, [session?.user?.id]);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);
  return { session, mustChange, setMustChange, showWelcome, setShowWelcome };
}

const preferenceErrorText = (error) => String(error?.message ?? error ?? "Unknown preference error");
function announcePreferenceFailure(area, error) {
  window.dispatchEvent(new CustomEvent("tg-preference-error", {
    detail: { area, message: preferenceErrorText(error) },
  }));
}

function usePrefs(session) {
  const [theme, setThemeState] = useState(() => localStorage.getItem("tg-theme") || "dark");
  const [collapsed, setCollapsedState] = useState(() => localStorage.getItem("tg-nav") === "1");
  const [saveState, setSaveState] = useState({ state: "idle", message: null });
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("tg-theme", theme);
  }, [theme]);
  useEffect(() => { localStorage.setItem("tg-nav", collapsed ? "1" : "0"); }, [collapsed]);
  /* ONE READ OF user_settings, NOT TWO (Agent X). The theme/collapse pair and
     the sidebar width were fetched by two separate effects against the same
     table, the same row and the same user, on every sign-in. They are read
     together and applied together; the width state is declared below and is set
     from this same response. */
  const [navWidth, setNavWidthState] = useState(() => Number(localStorage.getItem("tg-navw")) || 246);
  useEffect(() => {
    if (!session) return;
    supabase.from("user_settings").select("theme, sidebar_collapsed, sidebar_width")
      .eq("user_id", session.user.id).maybeSingle()
      .then(({ data, error }) => {
        if (error) {
          const message = `Account preferences could not be read: ${error.message}`;
          setSaveState({ state: "failed", message });
          announcePreferenceFailure("Account preferences", error);
          return;
        }
        if (data?.theme) setThemeState(data.theme);
        if (typeof data?.sidebar_collapsed === "boolean") setCollapsedState(data.sidebar_collapsed);
        if (data?.sidebar_width) setNavWidthState(data.sidebar_width);
      });
  }, [session]);
  const persist = useCallback(async (patch) => {
    if (!session) return { ok: false, error: "No signed-in account is available." };
    setSaveState({ state: "saving", message: "Saving to your account…" });
    try {
      const { error } = await supabase.from("user_settings")
        .upsert({ user_id: session.user.id, ...patch, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
      if (error) throw error;
      setSaveState({ state: "saved", message: "Saved to your account." });
      return { ok: true };
    } catch (error) {
      const message = `Saved on this device only; the account save failed: ${preferenceErrorText(error)}`;
      setSaveState({ state: "failed", message });
      announcePreferenceFailure("Account preferences", error);
      return { ok: false, error: preferenceErrorText(error) };
    }
  }, [session]);
  const setTheme = useCallback((t) => { setThemeState(t); persist({ theme: t }); }, [persist]);
  const setCollapsed = useCallback((c) => { setCollapsedState(c); persist({ sidebar_collapsed: c }); }, [persist]);
  useEffect(() => { localStorage.setItem("tg-navw", String(navWidth)); }, [navWidth]);
  const setNavWidthLive = useCallback((w) => setNavWidthState(Math.min(380, Math.max(170, w))), []);
  const commitNavWidth = useCallback((w) => persist({ sidebar_width: Math.min(380, Math.max(170, Math.round(w))) }), [persist]);
  return { theme, setTheme, collapsed, setCollapsed, navWidth, setNavWidthLive, commitNavWidth, saveState };
}

function useNav(version, session, viewAsRole) {
  const [nav, setNav] = useState(null);
  const [reports, setReports] = useState([]);
  const [apps, setApps] = useState([]);
  const [deep, setDeep] = useState([]);
  const [finance, setFinance] = useState([]);
  const [tax, setTax] = useState([]);
  const [hr, setHr] = useState([]);
  const [navError, setNavError] = useState(null);
  /* Reads the menu only once there is a signed-in session.

     This used to run while the visitor was still anonymous, so the whole
     navigation rail worked ONLY because 'anon' could read nav_registry — and
     because the effect depended on 'version' alone, it never re-read once the
     session arrived. Revoking anon access would have emptied every menu with no
     error. Depending on the session closes that, and also removes a race: the
     old code called auth.getUser() itself, which could resolve before
     useSession() had restored a persisted session on a hard refresh. */
  useEffect(() => {
    const uid = session?.user?.id;
    if (!uid) { setNav(null); setNavError(null); return; }
    (async () => {
      /* THE SAME DEFECT, THE SECOND READER OF THE SAME FACT — 19 Aug 2026.
         Below this hook sits a twenty-line postmortem about a role read whose
         error was discarded, so any failure became the lowest role in silence.
         That was repaired in useRole and NOT here, and this reader is the one
         that draws the menus. Two errors were discarded two lines apart and
         they failed in OPPOSITE directions: a refused app_users read resolved
         the owner to "guest" and removed 151 of 665 entries including his own
         Command Center, while a refused nav_role_visibility read emptied the
         hidden set and opened every page in the platform to whoever was
         looking. A menu that cannot be built correctly is not built at all. */
      const [{ data: rows, error: navErr }, { data: me, error: roleErr }] = await Promise.all([
        supabase.from("nav_registry").select("*").eq("enabled", true).order("category_order").order("item_order"),
        supabase.from("app_users").select("role").eq("user_id", uid).maybeSingle(),
      ]);
      const blank = () => { setNav([]); setReports([]); setApps([]); setDeep([]); setFinance([]); setTax([]); setHr([]); };
      if (navErr || roleErr) {
        const e = navErr ?? roleErr;
        setNavError(`${e.message || e.code || "the read was refused and returned no message"} — your menu is not being guessed at.`);
        blank(); return;
      }
      /* viewAsRole is the admin-only design-preview lens (owner request, 11 Aug
         2026). It substitutes WHICH visibility rows filter the menus — nothing
         else. The session, the queries and row-level security all remain the
         signed-in admin's own. */
      const role = viewAsRole ?? me?.role ?? null;
      if (!role) {
        setNavError("You are signed in, but no role is assigned to this account in app_users, so there is no menu to build.");
        blank(); return;
      }
      const { data: vis, error: visErr } = await supabase.from("nav_role_visibility").select("view_key, visible").eq("role", role);
      if (visErr) {
        setNavError(`${visErr.message || visErr.code || "the visibility read was refused"} — rather than show you every page, nothing is shown.`);
        blank(); return;
      }
      setNavError(null);
      const hidden = new Set((vis ?? []).filter((v) => !v.visible).map((v) => v.view_key));
      const shown = (rows ?? []).filter((r) => !hidden.has(r.view_key));
      setNav(shown.filter((r) => (r.surface ?? "side") === "side"));
      setReports(shown.filter((r) => (r.surface ?? "side") === "reports" || r.report_group));
      setApps(shown.filter((r) => (r.surface ?? "side") === "launcher"));
      /* 'deep' views are off the side rail to keep it short, but nothing is lost —
         each one appears on the face of its own category dashboard. */
      setDeep(shown.filter((r) => (r.surface ?? "side") === "deep"));
      setFinance(shown.filter((r) => r.surface === "finance"));
      setTax(shown.filter((r) => r.surface === "tax"));
      setHr(shown.filter((r) => r.surface === "hr"));
    })();
  }, [version, session?.user?.id, viewAsRole]);
  return { nav, reports, apps, deep, finance, tax, hr, navError };
}
/* A ROLE WE COULD NOT READ IS NOT A LOW ROLE.
 *
 * This was `.then(({ data }) => setRole(data?.role ?? "member"))`. The error was
 * discarded, so ANY failure of that read - RLS, network, an expired token, .single()
 * finding zero rows - silently became the string "member". "member" is
 * visible = false on dept_dash_command, so the owner was shown "This page is
 * restricted. The member role does not have view access." on his own Command Center,
 * while app_users said owner and nav_role_visibility said owner may see it.
 *
 * The giveaway was that the MENU still listed the page: useNav resolves the role its
 * own way and got it right, while this hook got it wrong. Two readers of one fact,
 * disagreeing, and the failing one guessing DOWNWARD in silence.
 *
 * Guessing downward looks like the safe direction. It is not. It locks the owner out
 * of his own platform and tells him the page does not exist, which is indistinguishable
 * from the page having been deleted - and that is exactly how it was reported.
 *
 * Unknown is now its own state. `false` means we asked and the answer was no role;
 * `null` means we have not finished asking; a string is a real answer. The error text
 * is kept so the screen can say WHY instead of inventing a role.
 */
function useRole(session) {
  const [role, setRole] = useState(null);
  const [roleError, setRoleError] = useState(null);
  useEffect(() => {
    let live = true;
    if (!session?.user?.id) { setRole(null); setRoleError(null); return; }
    supabase.from("app_users").select("role").eq("user_id", session.user.id).maybeSingle()
      .then(({ data, error }) => {
        if (!live) return;
        if (error) {
          /* Do NOT downgrade. Say what happened and let the caller decide. */
          setRoleError(error.message || `${error.code ?? "unknown"} — the role lookup was refused and returned no message`);
          setRole(null);
          return;
        }
        setRoleError(data?.role ? null : "You are signed in, but no role is assigned to this account in app_users.");
        setRole(data?.role ?? false);
      });
    return () => { live = false; };
  }, [session?.user?.id]);
  return { role, roleError };
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
/* Crashes reported this session, so a render loop cannot hammer the database.
   Module scope, not component state — a boundary that has just crashed is not
   a good place to keep a counter. */
const REPORTED_CRASHES = new Map();

/* A boundary must never make things worse. The reporter always resolves to an
   explicit receipt result; it never throws into an already-failing tree. The
   same crash shares one in-flight promise, and an explicit retry is the only
   path that creates a second write attempt. */
function reportCrash(view, err, info, retry = false) {
  try {
    const message = String(err?.message ?? err ?? "unknown error").slice(0, 300);
    const key = `${view}|${message}`;
    if (retry) REPORTED_CRASHES.delete(key);
    if (REPORTED_CRASHES.has(key)) return REPORTED_CRASHES.get(key);
    if (REPORTED_CRASHES.size >= 25) {
      return Promise.resolve({ ok: false, error: "The browser crash-report limit was reached; no durable incident receipt was created." });
    }
    const request = supabase.rpc("tg_log_client_error_receipt", {
      p_view: view ?? "unknown",
      p_message: message,
      p_stack: String(err?.stack ?? "").slice(0, 2000),
      p_component: String(info?.componentStack ?? "").slice(0, 2000),
    }).then(({ data, error }) => {
      if (error) return { ok: false, error: error.message };
      if (!data?.finding_id) return { ok: false, error: "The database returned no durable finding ID." };
      return { ok: true, findingId: data.finding_id, runId: data.run_id, recordedAt: data.recorded_at };
    }, (error) => ({ ok: false, error: String(error?.message ?? error) }));
    REPORTED_CRASHES.set(key, request);
    return request;
  } catch (error) {
    return Promise.resolve({ ok: false, error: String(error?.message ?? error) });
  }
}

function CrashReceipt({ receipt, onRetry }) {
  if (receipt?.state === "saved") {
    return <div className="note" role="status">Recorded as finding <b>#{receipt.findingId}</b>. This ID is the durable incident receipt.</div>;
  }
  if (receipt?.state === "failed") {
    return (
      <div className="boundary" role="alert" style={{ marginTop: 8 }}>
        <b>The incident was not recorded.</b>
        <div className="note">{receipt.error}</div>
        <button type="button" className="btn small ghost" style={{ marginTop: 8 }} onClick={onRetry}>Retry incident recording</button>
      </div>
    );
  }
  return <div className="note" role="status">Creating a durable incident record…</div>;
}

class Boundary extends React.Component {
  constructor(p) { super(p); this.state = { err: null, receipt: { state: "idle" } }; this.crashInfo = null; }
  static getDerivedStateFromError(err) { return { err }; }
  /* Turns a white screen into a ranked finding. Without this the only person
     who knows the page broke is the one person who cannot fix it. */
  componentDidCatch(err, info) { this.crashInfo = info; this.record(err, info); }
  record(err, info, retry = false) {
    this.setState({ receipt: { state: "pending" } });
    reportCrash(this.props.resetKey ?? this.props.name, err, info, retry).then((result) => {
      this.setState({ receipt: result.ok
        ? { state: "saved", findingId: result.findingId, runId: result.runId, recordedAt: result.recordedAt }
        : { state: "failed", error: result.error } });
    });
  }
  componentDidUpdate(prev) {
    if (prev.resetKey !== this.props.resetKey && this.state.err) this.setState({ err: null, receipt: { state: "idle" } });
  }
  render() {
    if (this.state.err) {
      return (
        <div className="boundary">
          <b>This section hit an error — the rest of the OS is unaffected.</b>
          <div className="note">{String(this.state.err)}</div>
          <CrashReceipt receipt={this.state.receipt}
            onRetry={() => this.record(this.state.err, this.crashInfo, true)} />
          <button className="btn ghost" style={{ marginTop: 12 }} onClick={() => this.setState({ err: null })}>Retry section</button>
        </div>
      );
    }
    return this.props.children;
  }
}

/* The last line of defence. The section boundary only helps if App itself is
   still standing; if the shell throws — the nav, the top bar, a hook order
   change in App — React unmounts everything and the user gets a white page
   with no way back. This keeps something on screen and still reports. */
export class RootBoundary extends React.Component {
  constructor(p) { super(p); this.state = { err: null, receipt: { state: "idle" } }; this.crashInfo = null; }
  static getDerivedStateFromError(err) { return { err }; }
  componentDidCatch(err, info) { this.crashInfo = info; this.record(err, info); }
  record(err, info, retry = false) {
    this.setState({ receipt: { state: "pending" } });
    reportCrash("app-shell", err, info, retry).then((result) => {
      this.setState({ receipt: result.ok
        ? { state: "saved", findingId: result.findingId, runId: result.runId, recordedAt: result.recordedAt }
        : { state: "failed", error: result.error } });
    });
  }
  render() {
    if (this.state.err) {
      return (
        <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
          <div style={{ maxWidth: 560, textAlign: "left", lineHeight: 1.6 }}>
            <h1 style={{ fontSize: 22, marginBottom: 10 }}>The platform hit an error it could not recover from.</h1>
            <p style={{ opacity: 0.85 }}>Reloading usually clears the screen. The incident status below is authoritative.</p>
            <CrashReceipt receipt={this.state.receipt}
              onRetry={() => this.record(this.state.err, this.crashInfo, true)} />
            <pre style={{ whiteSpace: "pre-wrap", fontSize: 12, opacity: 0.7, marginTop: 14 }}>
              {String(this.state.err)}
            </pre>
            <button className="btn primary" style={{ marginTop: 16 }}
              onClick={() => window.location.reload()}>Reload the platform</button>
          </div>
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
          <input aria-label="Email address" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
          <label>Password</label>
          <input aria-label="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} autoComplete="current-password" />
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
/* No abbreviations anywhere on this platform. Spell it out. */
const LABEL_WORDS = {
  uom: "Unit of measure", coa: "Certificate of Analysis", thc: "THC", cbd: "CBD",
  qty: "Quantity", lb: "Pounds", lbs: "Pounds", pct: "Percent", "%": "Percent",
  id: "Identifier", no: "Number", num: "Number", ref: "Reference", desc: "Description",
  mfg: "Manufacturing", dept: "Department", emp: "Employee", inv: "Inventory",
  wo: "Work order", po: "Purchase order", sku: "Stock keeping unit", ea: "Each",
  avg: "Average", min: "Minimum", max: "Maximum", pkg: "Package", pkgs: "Packages",
  src: "Source", dest: "Destination", fg: "Finished goods", ff: "Fresh frozen",
  usd: "Dollars", ytd: "Year to date", mtd: "Month to date", sop: "Sales and operations",
};
const fieldLabel = (k) => {
  const key = String(k).toLowerCase().trim();
  if (LABEL_WORDS[key]) return LABEL_WORDS[key];
  return String(k)
    .replace(/_/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(" ")
    .map((w) => LABEL_WORDS[w.toLowerCase()] || w)
    .join(" ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
};
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
/* Order matters: trace on a real identifier, never on a room or a location name.
   A location is where something sits, not what it is - tracing it finds nothing. */
const TRACE_KEYS = ["package_tag", "tag", "harvest_name", "harvest", "source_harvest", "manifest_number",
  "inbound_manifest", "identifier", "production_batch", "made_from_packages", "record", "subject",
  "item_name", "item", "material_name", "name", "strain", "cultivar", "cultivars",
  "product_route", "customer", "source_ref"];
const NEVER_TRACE = new Set(["Fulfillment Vault", "Cure Vault", "Freezer/Biomass Storage",
  "Pre Trim Storage Room", "Pre-Trim Storage", "Biomass Prep", "Dry Room #1", "Dry Room #2",
  "Packaging Room", "Production Room", "Quarantine", "Solventless", "Hydrocarbon", "Finish Vault",
  "(not recorded)", "not recorded", "—"]);
/* Seed-to-sale summary strip shown inside every drill-down we can identify. */

/* Product identity: the six things that must appear on every product, everywhere.
   Cultivator or manufacturer, THC, terpenes, certificate, manifest — and when one
   is missing, WHY it is missing and what makes it appear. Reads one view, so the
   moment a certificate or manifest exists it back-fills every past record. */
function ProductIdentity({ term, row }) {
  const [d, setD] = useState(undefined);
  useEffect(() => {
    let live = true;
    (async () => {
      const tag = [row?.package_tag, row?.tag, term].find(
        (v) => typeof v === "string" && /^[A-Z0-9]{20,}$/i.test(v.trim())
      );
      if (!tag) { if (live) setD(null); return; }
      const { data } = await supabase.from("v_product_identity").select("*").eq("package_tag", tag).maybeSingle();
      if (live) setD(data ?? null);
    })();
    return () => { live = false; };
  }, [term, row]);

  if (d === undefined) return null;
  if (!d)
    return (
      <div className="pidrow">
        <label>Product identity</label>
        <span className="pidwhy">
          This row is not a single package, so it has no certificate, manifest or test values of its own.
          <b> Why:</b> certificates and manifests attach to a package tag. Open an individual package from Stock Detail
          or the Metrc Packages list to see them.
        </span>
      </div>
    );

  const Fact = ({ label, value, why, tone, href, hrefLabel }) => (
    <div className={`pidfact ${tone || ""}`}>
      <label>{label}</label>
      {href ? (
        <a className="pidlink" href={href} target="_blank" rel="noreferrer">{hrefLabel || value}</a>
      ) : (
        <b>{value}</b>
      )}
      {why && <span className="pidwhy">{why}</span>}
    </div>
  );

  return (
    <div className="pidrow">
      <label>Product identity — required on every product, everywhere</label>
      <div className="pidgrid">
        <Fact label="Cultivator or manufacturer" value={d.cultivator_or_manufacturer}
          why={d.maker_note || `Licence ${d.maker_license || "not recorded"} · ${d.origin}`}
          tone={d.cultivator_or_manufacturer === "Not recorded" ? "warn" : "ok"} />
        {/* Metrc reports edible potency in milligrams per gram, not percent. Showing
            a "%" against a milligram figure is simply wrong, so the unit is carried
            with the number and never assumed. Where Metrc returned nothing, the
            figure is read off the certificate — and the panel says which it is. */}
        <Fact label="Total THC"
          value={d.thc_shown != null ? `${d.thc_shown} ${d.total_thc_unit ?? "%"}` : "Not recorded"}
          why={d.thc_shown != null ? d.thc_source : d.analyte_note}
          tone={d.thc_shown != null ? "ok" : "warn"} />
        <Fact label="Total terpenes"
          value={d.terpenes_shown != null ? `${d.terpenes_shown} ${d.total_terpenes_unit ?? "%"}` : "Not recorded"}
          why={d.terpenes_shown != null
            ? d.terpenes_source
            : (d.analyte_count > 0
                ? `${d.analyte_count} analytes on file, but no terpene panel was run on this product.`
                : d.analyte_note)}
          tone={d.terpenes_shown != null ? "ok" : "warn"} />
        <Fact label="Total CBD"
          value={d.cbd_shown != null ? `${d.cbd_shown} ${d.total_thc_unit ?? "%"}` : "Not recorded"}
          why={d.cbd_shown == null ? d.analyte_note : null}
          tone={d.cbd_shown != null ? "ok" : "warn"} />
        <Fact label="Certificate of Analysis"
          value={d.coa_url ? "Open the certificate" : d.lab_state || "Not recorded"}
          href={d.coa_url} hrefLabel="📄 Open the certificate"
          why={d.coa_status} tone={d.coa_url ? "ok" : "warn"} />
        <Fact label="Manifest"
          value={d.manifest_number ? "Manifest " + d.manifest_number : "None"}
          href={d.manifest_url} hrefLabel={"🚚 Manifest " + (d.manifest_number || "")}
          why={d.manifest_status} tone={d.manifest_number ? "ok" : "warn"} />
      </div>
      <div className="pidloc">
        <label>Where it is, with dates</label>
        <LocationHistory term={d.package_tag} tag={d.package_tag} />
      </div>
      {d.certificate_screens && (
        <div className="pidscreens">
          <label>Safety screens, read from the certificate</label>
          <div className="screenrow">
            {d.certificate_screens.split(" · ").map((s) => {
              const failed = /FAIL/i.test(s);
              return <span key={s} className={`screen ${failed ? "fail" : "pass"}`}>{s}</span>;
            })}
          </div>
        </div>
      )}
      {d.certificate_terpene_profile && (
        <div className="pidscreens">
          <label>Terpene profile, read from the certificate</label>
          <div className="screenrow">
            {Object.entries(d.certificate_terpene_profile)
              .sort((a, b) => b[1] - a[1])
              .map(([name, v]) => (
                <span key={name} className="screen terp">{name} <b>{v}%</b></span>
              ))}
          </div>
        </div>
      )}
      <div className="pidmeta">
        {d.strain && <span>Strain: <b>{d.strain}</b></span>}
        {d.category && <span>Category: <b>{d.category}</b></span>}
        <span>Quantity: <b>{Number(d.quantity).toLocaleString()} {d.unit_of_measure}</b></span>
        {d.laboratory && <span>Laboratory: <b>{d.laboratory}</b></span>}
        {d.result_on && <span>Result recorded: <b>{d.result_on}</b></span>}
        {d.coa_expires && <span>Certificate valid to: <b>{d.coa_expires}</b></span>}
      </div>
    </div>
  );
}

/* HARD RULE: a location is never shown without when it entered, how long it has
   been there, when it left and where it went. */
/* HARD RULE: whenever testing is shown, state the date it went out, the date it
   came back, and how many days it was out. Never a bare state. */
function TestingDates({ row }) {
  const out = row?.submitted_on || row?.submitted_for_testing_on || row?.lab_state_on;
  const back = row?.result_on || row?.result_recorded_on;
  const state = row?.result || row?.lab_state || row?.testing_state || row?.verdict;
  if (!state && !out && !back) return null;
  const days =
    row?.turnaround_days != null
      ? Number(row.turnaround_days)
      : out && back
      ? Math.round((new Date(back) - new Date(out)) / 86400000)
      : out
      ? Math.round((Date.now() - new Date(out)) / 86400000)
      : null;
  const stillOut = out && !back;
  return (
    <div className="testline">
      <span><em>Testing state</em><b className={state === "TestFailed" || state === "FAILED" ? "bad" : ""}>{state || "not recorded"}</b></span>
      <span><em>Went out for testing</em><b>{out || "never submitted"}</b></span>
      <span><em>Came back from testing</em><b>{back || (stillOut ? "still out" : "not applicable")}</b></span>
      <span>
        <em>Days out at the laboratory</em>
        <b className={days != null && days > 14 ? "slow" : ""}>
          {days == null ? "not applicable" : stillOut ? `${days} days and counting` : `${days} days`}
        </b>
      </span>
      {row?.coa_expires && <span><em>Certificate valid to</em><b>{row.coa_expires}</b></span>}
    </div>
  );
}

function ReadFailure({ what, error, onRetry }) {
  return (
    <div className="boundary" role="alert" style={{ margin: "10px 0" }}>
      <b>{what} could not be read.</b>
      <div className="note">No empty result or compliance conclusion has been substituted.</div>
      <div className="note" style={{ marginTop: 6 }}>{error?.message || String(error)}</div>
      {onRetry && <button type="button" className="btn small ghost" style={{ marginTop: 10 }} onClick={onRetry}>Retry read</button>}
    </div>
  );
}

function LocationHistory({ term, tag }) {
  const [read, setRead] = useState({ rows: null, error: null });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let live = true;
    setRead({ rows: null, error: null });
    (async () => {
      let q = supabase.from("v_location_history").select("*").limit(12);
      q = tag ? q.eq("package_tag", tag)
              : q.or(`package_tag.ilike.%${term}%,item_name.ilike.%${term}%,strain.ilike.%${term}%`);
      const { data, error } = await q;
      if (!live) return;
      if (error) { setRead({ rows: null, error }); return; }
      setRead({ rows: Array.isArray(data) ? data : [], error: null });
    })();
    return () => { live = false; };
  }, [term, tag, attempt]);
  if (read.error) return <ReadFailure what="The Metrc movement mirror" error={read.error} onRetry={() => setAttempt((n) => n + 1)} />;
  if (read.rows === null) return <span className="note">Reading the movement record…</span>;
  const rows = read.rows;
  if (!rows.length)
    return (
      <span className="lochnone">
        No matching movement row was returned by the OS mirror. <b>This is not proof Metrc has no record.</b>{" "}
        Search the exact package tag, or verify the Metrc sync before declaring a location or lineage gap.
      </span>
    );
  return (
    <div className="lochist">
      {rows.map((l) => (
        <div key={l.package_tag} className={`loch ${l.left_area_on ? "gone" : "here"}`}>
          <div className="lochtop">
            <span className="lochtag">{l.package_tag}</span>
            <span className="lochqty">{Number(l.quantity).toLocaleString()} {l.unit_of_measure}</span>
            <span className={`lochpos ${l.left_area_on ? "" : "on"}`}>{l.position}</span>
          </div>
          <div className="lochline">
            <span><em>Area</em><b>{l.area}</b></span>
            <span><em>Came from</em><b>{l.came_from_area || l.arrived_from || "not recorded"}</b></span>
            <span><em>Entered</em><b>{l.entered_area_on || "not recorded"}</b></span>
            <span><em>Days there</em><b>{l.days_in_this_area}</b></span>
            <span><em>Left</em><b>{l.left_area_on || "has not left"}</b></span>
            <span><em>Manifest in</em><b>{l.arrived_on_manifest || "none"}</b></span>
            <span><em>History last recorded</em><b>{l.last_recorded_on || "never"}{l.days_since_anything_was_recorded != null ? ` (${l.days_since_anything_was_recorded} days ago)` : ""}</b></span>
          </div>
        </div>
      ))}
    </div>
  );
}

function SeedToSaleSummary({ term }) {
  const [d, setD] = useState({ loading: true, error: null });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let live = true;
    setD({ loading: true, error: null });
    (async () => {
      const results = await Promise.all([
        supabase.from("v_harvest_lifecycle").select("*").ilike("harvest", `%${term}%`).limit(1),
        supabase.from("harvest_weights").select("*").ilike("metrc_harvest_batch", `%${term}%`).limit(1),
        supabase.from("v_allocation_queue").select("*").or(`material_name.ilike.%${term}%,source_ref.ilike.%${term}%`).limit(4),
        supabase.from("v_inventory_locator").select("location,stage,quantity,uom,days_here,category")
          .or(`item.ilike.%${term}%,identifier.ilike.%${term}%,source_lineage.ilike.%${term}%`).limit(6),
      ]);
      if (!live) return;
      const readErrors = results.map((result) => result.error).filter(Boolean);
      if (readErrors.length) {
        setD({ loading: false, error: new Error(readErrors.map((error) => error.message).join(" · ")) });
        return;
      }
      const [life, grade, alloc, locs] = results.map((result) => Array.isArray(result.data) ? result.data : []);
      setD({ loading: false, error: null, life: life[0] || null, grade: grade[0] || null, alloc, locs });
    })();
    return () => { live = false; };
  }, [term, attempt]);
  if (d.error) return <ReadFailure what="The seed-to-sale mirror" error={d.error} onRetry={() => setAttempt((n) => n + 1)} />;
  if (d.loading) return <div className="note" style={{ margin: "10px 0" }}>Loading the seed to sale picture…</div>;
  const L = d.life, G = d.grade;
  const nothing = !L && !G && d.alloc.length === 0 && d.locs.length === 0;
  if (nothing) {
    const isPlace = NEVER_TRACE.has(String(term).trim());
    return (
      <div className="stsbox stsnone">
        <div className="stshead">Seed to sale — {term}</div>
        <b className="stsnb">
          {isPlace
            ? `"${term}" is a place, not a product — a room cannot have a seed-to-sale history.`
            : `No matching seed-to-sale row was returned for ${term}.`}
        </b>
        <p>
          {isPlace
            ? "Open an individual package from Stock Detail and trace that instead. Every package carries its own Metrc tag, which is what the chain follows."
            : "This is not proof Metrc lacks the strain, package, manifest, or lineage. The OS mirror may be incomplete or stale. Search the exact tag or manifest and verify source freshness before opening a compliance finding."}
        </p>
        {!isPlace && (
          <ul>
            <li><b>Use an exact identifier.</b> Package tag, harvest name, or manifest number is stronger than an item or room label.</li>
            <li><b>Check mirror freshness.</b> A successful empty read says only that these OS views returned no match.</li>
            <li><b>Escalate only after source verification.</b> Metrc absence must be proved from the legal source, never inferred from an empty mirror result.</li>
          </ul>
        )}
      </div>
    );
  }
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
        <label>Where it is, with dates</label>
        <LocationHistory term={term} />
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
  const [read, setRead] = useState({ rows: null, error: null });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let live = true;
    setRead({ rows: null, error: null });
    supabase.rpc("tg_trace", { p_term: term }).then(({ data, error }) => {
      if (!live) return;
      if (error) { setRead({ rows: null, error }); return; }
      setRead({ rows: Array.isArray(data) ? data : [], error: null });
    });
    return () => { live = false; };
  }, [term, attempt]);
  const rows = read.rows;
  const phases = rows ? [...new Set(rows.map((r) => r.phase))].sort() : [];
  return (
    <div className="vedrawerwrap" onClick={onClose}>
      <div className="vedrawer" style={{ width: "min(760px, 96vw)" }} onClick={(e) => e.stopPropagation()}>
        <div className="srhead">
          <span className="srtitle">Seed to sale history — {term}</span>
          <button className="btn small ghost" onClick={onClose}>✕</button>
        </div>
        {read.error ? <ReadFailure what="The Metrc lineage RPC" error={read.error} onRetry={() => setAttempt((n) => n + 1)} />
          : rows === null ? <div className="note" style={{ padding: 14 }}>Tracing every record…</div>
          : rows.length === 0 ? (
            <div className="tracenone">
              <b>No matching chain was returned by the OS mirror for {term}</b>
              <p>This is not proof Metrc lacks the chain. Before opening a compliance finding:</p>
              <ul>
                <li><b>Search the exact package tag, harvest name, or manifest number.</b></li>
                <li><b>Verify the Metrc mirror is current and the required source export has loaded.</b></li>
                <li><b>Have an agent inspect the legal Metrc source and linked manifest before declaring absence.</b></li>
              </ul>
              <p className="tracehint">A failed read is an error. A successful empty mirror read is an unverified gap. Neither is a Metrc diagnosis.</p>
            </div>
          )
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
/* The forensic panel. Factored out of RawRow so a page with hand-built columns
   gets exactly the same drill-down without giving up its own layout — the owner's
   rule is that a user drills down wherever they are, not only on generic pages. */
const traceTermOf = (row) => TRACE_KEYS.map((k) => row?.[k]).find(
  (v) => typeof v === "string" && v.trim().length > 2 && !NEVER_TRACE.has(v.trim())
);
function ForensicPanel({ row }) {
  const [showRaw, setShowRaw] = useState(false);
  const [trace, setTrace] = useState(null);
  const traceTerm = traceTermOf(row);
  return (
    <>
      {trace && <TraceDrawer term={trace} onClose={() => setTrace(null)} />}
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
            <TestingDates row={row} />
            <ProductIdentity term={traceTerm} row={row} />
            <DetailGrid obj={row} />
          </>}
    </>
  );
}

/* Wrap a hand-built <tr> to make it drill down in place. The page keeps its own
   cells; the row gains the same forensic panel every generic page has. */
/* Owner, 12 Aug 2026: "how does a user collapse the data after they expand it."
   This row toggled all along, but nothing on screen said so — no caret, no
   state, and on a drill of several hundred packages the expanded panel buried
   the row you would have to find again to close it. It now shows its state and
   carries its own Close at the top of the panel, and Escape closes it. */
function DrillRow({ row, colCount, children }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
  return (
    <>
      <tr onClick={() => setOpen(!open)} style={{ cursor: "pointer" }} aria-expanded={open}
        title={open
          ? "Open — click the row again, press Escape, or use Close below."
          : "Open the complete record, its certificate and its manifest"}>
        {children}
      </tr>
      {open && (
        <tr>
          <td colSpan={colCount} className="detailcell">
            <div className="cc-drill-head">
              <span className="cc-drill-what">{row.package_tag ?? "The complete record"}</span>
              <button className="cc-btn cc-drill-close" onClick={() => setOpen(false)}
                title="Close this record. The Escape key does the same.">✕ close</button>
            </div>
            <ForensicPanel row={row} />
          </td>
        </tr>
      )}
    </>
  );
}

/* Certificate and manifest, reachable without expanding anything. The owner's
   rule: a button, not an instruction to copy a reference. */
function DocumentChips({ tag }) {
  const [d, setD] = useState(undefined);
  useEffect(() => {
    let live = true;
    if (!tag || !/^[A-Z0-9]{20,}$/i.test(String(tag).trim())) { setD(null); return; }
    supabase.rpc("f_package_documents", { p_tag: String(tag).trim() })
      .then(({ data }) => { if (live) setD(data ?? null); });
    return () => { live = false; };
  }, [tag]);
  if (!d) return <span className="note">—</span>;
  const coa = d.coa ?? [], man = d.manifests ?? [];
  if (!coa.length && !man.length) return <span className="note">none held</span>;
  return (
    <span className="docchips" onClick={(e) => e.stopPropagation()}>
      {coa.map((c) => (
        <a key={c.document_id} className="docchip coa" href={c.url} target="_blank" rel="noreferrer"
          title={`Certificate of Analysis${c.lab ? " — " + c.lab : ""}${c.tested_on ? ", tested " + String(c.tested_on).slice(0, 10) : ""}. Opens the real document: download, print or send.`}>
          Certificate
        </a>
      ))}
      {man.map((m) => (
        <a key={m.manifest_number} className="docchip man" href={m.url} target="_blank" rel="noreferrer"
          title={`Manifest ${m.manifest_number}. Opens the real document: download, print or send.`}>
          Manifest {m.manifest_number}
        </a>
      ))}
    </span>
  );
}

function RawRow({ row, cols }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <tr onClick={() => setOpen(!open)} style={{ cursor: "pointer" }}>
        {cols.map((c) => <td key={c}>{cellView(c, row[c])}</td>)}
      </tr>
      {open && (
        <tr>
          <td colSpan={cols.length} className="detailcell"><ForensicPanel row={row} /></td>
        </tr>
      )}
    </>
  );
}
const formatCell = (v) => {
  if (v == null || v === "") return "—";
  if (typeof v === "object") return "{…}";
  const s = String(v);
  return s;
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
  /* KNOWN DEFECT, left alone on purpose. "inactive" contains "active", so
     the test above matches it first and this line is unreachable — every
     inactive row on the platform renders green instead of grey. The fix is
     to move this line ABOVE the one before it.
     Not applied: the owner's hard rule of 8 Aug 2026 confines this agent to
     HR, and chipTone colours every table in the product. HR pages compute
     their own chips (see roster.jsx) and do not depend on this. */
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
/* `onPreset` is optional and additive: pages that want to remember WHICH preset
   the user chose (rather than only the two dates it produced) can receive it.
   Every existing caller keeps working unchanged.

   THE CHIP ROW — owner order, 11 Aug 2026, relayed by Agent I from his reference
   screenshot: the date selector bar is the one thing taken from that image, and it
   becomes A SHARED PRIMITIVE, CONSISTENT SITE-WIDE. This component already IS the
   one date control every page mounts, so the chips are added here, once, and every
   dashboard, report and alert page gets the identical bar with no call-site change.
   The dropdown stays for the long tail (yesterday, last month, last 365…) and the
   two date inputs stay for a custom range. The active chip is DERIVED by comparing
   the live from/to against what each chip would produce today — never a second
   copy of state that could disagree with the dates actually applied. */
/* ONE DATE MECHANISM — owner layout doctrine, 12 Aug 2026, point 1: the page
   showed three (chips, a dropdown, two always-visible calendar inputs). The
   chips are the mechanism. Custom expands an inline popover holding the full
   preset list and the two calendar inputs; the active chip itself carries the
   selection state, and the custom chip shows the exact dates when a custom
   range is applied. Nothing lost: every preset and exact-date capability is
   still here, one click deeper. */
export function DateRangeSelect({
  label, from, to, onFrom, onTo, onPreset, presetKey,
  session, viewKey, allowSave = false, autoDefault = true, onReady,
}) {
  const { rows: presets, error: catalogError } = useDatePresetCatalog();
  const [preset, setPreset] = useState(presetKey ?? null);
  const [openCustom, setOpenCustom] = useState(false);
  const [rangeError, setRangeError] = useState(null);
  const [saveStatus, setSaveStatus] = useState(null);
  useEffect(() => { if (presetKey) setPreset(presetKey); }, [presetKey]);

  const matched = presets ? matchingDatePreset(presets, from, to, presetKey ?? preset) : null;
  const selected = presets?.find((row) => row.preset_key === preset) ?? null;
  const selectedManual = selected?.manual_mode !== "none" ? selected : null;
  const activeKey = selectedManual?.preset_key ?? matched?.preset_key ?? (from || to ? "custom" : "all");
  const shown = presets?.some((row) => row.preset_key === activeKey) ? activeKey : "custom";
  const quick = presets ? presets.filter((row) => row.show_as_quick) : [];

  const pick = (k) => {
    const row = presets?.find((item) => item.preset_key === k);
    if (!row) return;
    setRangeError(null); setSaveStatus(null);
    setPreset(k);
    onPreset?.(k);
    if (row.manual_mode === "none") {
      onFrom(row.resolved_from ?? "");
      onTo(row.resolved_to ?? "");
      setOpenCustom(false);
      return;
    }
    if (row.manual_mode === "from") onTo("");
    if (row.manual_mode === "to") onFrom("");
    setOpenCustom(true);
  };
  const editDate = (side, value) => {
    const manualKey = selectedManual?.preset_key ?? "custom";
    setPreset(manualKey);
    onPreset?.(manualKey);
    setRangeError(null); setSaveStatus(null);
    if (side === "from") onFrom(value); else onTo(value);
  };
  const finish = () => {
    try {
      const range = normaliseDateRange(from, to);
      onFrom(range.from); onTo(range.to);
      setRangeError(null); setOpenCustom(false);
    } catch (error) { setRangeError(error.message); }
  };
  const save = async (everywhere) => {
    try {
      const range = await persistDateDefault(supabase, {
        userId: session?.user?.id, viewKey, presetKey: activeKey,
        from, to, everywhere,
      });
      onFrom(range.from); onTo(range.to);
      setRangeError(null);
      setSaveStatus(everywhere ? "Saved as your default on every page." : "Saved as your default on this page.");
    } catch (error) { setSaveStatus(`The date default was not saved: ${error.message}`); }
  };
  const customActive = !quick.some((row) => row.preset_key === activeKey);
  const customLabel = dateSelectionLabel(selected, customActive, from, to);
  const groups = presets ? [...new Set(presets.map((row) => row.group_label || "Other"))] : [];
  const seeded = useRef(false);
  useEffect(() => {
    if (!presets || seeded.current) return;
    seeded.current = true;
    if (autoDefault && !presetKey && !from && !to) {
      const monthly = presets.find((row) => row.preset_key === "this_month");
      if (monthly) {
        setPreset(monthly.preset_key);
        onPreset?.(monthly.preset_key);
        onFrom(monthly.resolved_from ?? "");
        onTo(monthly.resolved_to ?? "");
      }
    }
    onReady?.();
  }, [presets, autoDefault, presetKey, from, to, onFrom, onTo, onPreset, onReady]);
  return (
    <span className="datebar">
      <span className="flab">{label}</span>
      <span className="datechips" role="group" aria-label="Quick date ranges">
        {quick.map((row) => (
          <button key={row.preset_key} type="button" className={`dbchip ${activeKey === row.preset_key ? "on" : ""}`}
            aria-pressed={activeKey === row.preset_key} onClick={() => pick(row.preset_key)}>{row.quick_label}</button>
        ))}
        <button type="button" className={`dbchip ${customActive ? "on" : ""}`}
          aria-pressed={customActive} aria-expanded={openCustom}
          title="Every preset, and exact from and to dates"
          onClick={() => setOpenCustom((v) => !v)}>{customLabel}</button>
      </span>
      {!presets && !catalogError && <span className="flab" role="status">Loading date rules…</span>}
      {catalogError && <span className="note bad" role="alert">Date choices unavailable: {catalogError}</span>}
      {openCustom && (
        <span className="datecustom" role="dialog" aria-label="Choose and save a date range">
          <select aria-label="Date range preset" className="fdate" value={shown} onChange={(e) => pick(e.target.value)}>
            {groups.map((group) => (
              <optgroup key={group} label={group}>
                {presets.filter((row) => (row.group_label || "Other") === group)
                  .map((row) => <option key={row.preset_key} value={row.preset_key}>{row.label}</option>)}
              </optgroup>
            ))}
          </select>
          <input aria-label="From date" type="date" className="fdate" value={from} onChange={(e) => editDate("from", e.target.value)} />
          <span className="flab">to</span>
          <input aria-label="To date" type="date" className="fdate" value={to} onChange={(e) => editDate("to", e.target.value)} />
          <button type="button" className="btn small quiet" onClick={finish}>Apply</button>
          {allowSave && session?.user?.id && viewKey && (
            <>
              <button type="button" className="btn small quiet" onClick={() => save(false)}>Save this page</button>
              <button type="button" className="btn small quiet" onClick={() => save(true)}>Save all pages</button>
            </>
          )}
          {rangeError && <span className="note bad" role="alert">{rangeError}</span>}
          {saveStatus && <span className="note" role="status">{saveStatus}</span>}
        </span>
      )}
    </span>
  );
}
/* ==================================================================
   THE REPORT SUITE — ONE ENGINE, DRIVEN BY `report_registry`.

   Owner, 8 Aug 2026: a full report suite, a shit ton of filters, search
   and date on EVERY page, exportable, drilling to microscopic audit level.

   The rule that shapes all of it: a report is a ROW, never a code change.
   `report_registry` carries fact_view, date_column, dimensions, measures,
   description and owner_note. Nothing below hard-codes a report. A page not
   in the registry still gets the identical toolbar, derived from its own
   columns — so all 518 report pages behave the same way and a user who has
   learned one has learned all of them.

   `owner_note` is rendered on the face of the report, not tucked in a
   tooltip. It carries the trap warnings that stop a user publishing a wrong
   number, e.g. "NEVER sum pounds across streams - fresh frozen is WET".
   ================================================================== */

const RP_ROW_CEILING = 50000;   /* stated on screen whenever it is reached */
const RP_PAGE = 1000;           /* fetch batch size */

/* Re-verify the selected report contract on every table navigation. Errors are
   surfaced, never swallowed - a silent [] here would make a failed proof look
   like an unregistered report. */
function useReportRegistry(refreshKey) {
  const [registry, setRegistry] = useState(null);
  const [registryError, setRegistryError] = useState(null);
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision((value) => value + 1), []);
  useEffect(() => {
    const onFocus = () => refresh();
    const onVisibility = () => { if (document.visibilityState === "visible") refresh(); };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [refresh]);
  useEffect(() => {
    let live = true;
    setRegistry(null);
    setRegistryError(null);
    const factView = refreshKey.split(":", 1)[0];
    supabase.rpc("f_report_registry_runtime", { p_fact_view: factView })
      .then(({ data, error }) => {
        if (!live) return;
        if (error) { setRegistryError(error.message); return; }
        setRegistry(Array.isArray(data) ? data : []);
      });
    return () => { live = false; };
  }, [refreshKey, revision]);
  return { registry, registryError, refresh };
}

const rpLabel = (s) => String(s ?? "").replaceAll("_", " ").replace(/\bpct\b/g, "percent")
  .replace(/\buom\b/gi, "unit of measure").replace(/\bcoa\b/gi, "Certificate of Analysis");

const RP_DATE_NAME = /(_date$|_on$|_at$|^date|^month$|period|_until$|_from$|_to$)/;
const rpSanitise = (v) => String(v).replace(/[%,()*]/g, " ").trim();

/* Column typing from the rows actually returned. A column that is null on every
   row still gets a kind from its name, so a brand-new created_at with no data
   yet still offers a date filter rather than looking like free text. */
function rpDescribeColumns(rows) {
  const names = [];
  const seen = new Set();
  for (const r of rows ?? []) for (const k of Object.keys(r ?? {})) if (!seen.has(k)) { seen.add(k); names.push(k); }
  return names.map((name) => {
    let v;
    for (const r of rows ?? []) {
      const x = r?.[name];
      if (x !== null && x !== undefined && x !== "") { v = x; break; }
    }
    let kind = "text";
    if (typeof v === "boolean") kind = "boolean";
    else if (typeof v === "number") kind = "number";
    else if (v && typeof v === "object") kind = "json";
    else if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}([T ]|$)/.test(v)) kind = "date";
    else if (v === undefined && RP_DATE_NAME.test(name)) kind = "date";
    const allNull = v === undefined;
    return { name, kind, allNull };
  });
}

const RP_OPS = {
  text: [["contains", "contains"], ["not_contains", "does not contain"], ["equals", "is exactly"],
    ["not_equals", "is not"], ["starts", "starts with"], ["in", "is any of (comma separated)"],
    ["is_null", "is empty"], ["not_null", "is not empty"]],
  number: [["equals", "equals"], ["gte", "at least"], ["lte", "at most"], ["between", "between"],
    ["is_null", "is empty"], ["not_null", "is not empty"]],
  date: [["gte", "on or after"], ["lte", "on or before"], ["between", "between"],
    ["is_null", "not recorded"], ["not_null", "recorded"]],
  boolean: [["is_true", "yes"], ["is_false", "no"], ["is_null", "not recorded"]],
  json: [["not_null", "present"], ["is_null", "empty"]],
};
const rpOpLabel = (kind, op) => (RP_OPS[kind] ?? RP_OPS.text).find(([k]) => k === op)?.[1] ?? op;
const rpNeedsValue = (op) => !["is_null", "not_null", "is_true", "is_false"].includes(op);

/* Every filter is AND-ed, which is what a user means when they set two of them. */
function rpApplyFilters(qy, filters) {
  for (const f of filters ?? []) {
    if (!f.col || !f.op) continue;
    const v = f.value == null ? "" : String(f.value).trim();
    if (rpNeedsValue(f.op) && v === "") continue;
    switch (f.op) {
      case "contains": qy = qy.ilike(f.col, `%${rpSanitise(v)}%`); break;
      case "not_contains": qy = qy.not(f.col, "ilike", `%${rpSanitise(v)}%`); break;
      case "equals": qy = qy.eq(f.col, v); break;
      case "not_equals": qy = qy.neq(f.col, v); break;
      case "starts": qy = qy.ilike(f.col, `${rpSanitise(v)}%`); break;
      case "in": {
        const list = v.split(",").map((s) => s.trim()).filter(Boolean);
        if (list.length) qy = qy.in(f.col, list);
        break;
      }
      case "is_null": qy = qy.is(f.col, null); break;
      case "not_null": qy = qy.not(f.col, "is", null); break;
      case "is_true": qy = qy.is(f.col, true); break;
      case "is_false": qy = qy.is(f.col, false); break;
      case "gte": qy = qy.gte(f.col, v); break;
      case "lte": qy = qy.lte(f.col, v); break;
      case "between": {
        qy = qy.gte(f.col, v);
        const w = f.value2 == null ? "" : String(f.value2).trim();
        if (w !== "") qy = qy.lte(f.col, w);
        break;
      }
      default: break;
    }
  }
  return qy;
}

/* The provenance sentence. It goes in the header of EVERY export, because an
   exported figure with no filter statement is a number with no provenance. */
function rpFilterSentence({ search, searchCols, filters, dateCol, dFrom, dTo, cols }) {
  const kindOf = (c) => cols?.find((x) => x.name === c)?.kind ?? "text";
  const parts = [];
  if (search) parts.push(`text search "${search}" across ${searchCols?.length ?? 0} text columns (${(searchCols ?? []).map(rpLabel).join(", ")})`);
  /* THIS SENTENCE IS THE EXPORT'S PROVENANCE LINE — it goes onto the CSV, the
     workbook and the printed PDF. So it has to describe what the query ACTUALLY
     did, not what the controls are set to. When a search sets the range aside,
     saying "closed_on from 2026-08-01 to 2026-08-28" would put a filter on paper
     that was never applied, and a reader reconciling the export against the
     screen would be chasing a difference that does not exist. */
  const plan = rangePlan({ from: dFrom, to: dTo, dateField: dateCol, q: search });
  if (plan.setAside) {
    parts.push(`date range on ${rpLabel(dateCol)} SET ASIDE for the search - every period was looked at`);
  } else if (plan.applyRange) {
    parts.push(`${rpLabel(dateCol)} ${dFrom ? `from ${dFrom}` : "from the earliest record"} ${dTo ? `to ${dTo}` : "to the latest record"}, plus rows carrying no ${rpLabel(dateCol)} at all, which are kept rather than dropped`);
  }
  for (const f of filters ?? []) {
    if (!f.col || !f.op) continue;
    if (rpNeedsValue(f.op) && (f.value == null || String(f.value).trim() === "")) continue;
    const val = f.op === "between" ? `${f.value} and ${f.value2 ?? "(open)"}` : rpNeedsValue(f.op) ? String(f.value) : "";
    parts.push(`${rpLabel(f.col)} ${rpOpLabel(kindOf(f.col), f.op)}${val ? ` ${val}` : ""}`);
  }
  return parts.length ? parts.join("  AND  ") : "No filters applied - this export is the complete table.";
}

/* ---------- Exports. CSV, Excel, PDF and Google Sheets, all carrying the
     active filters, the date range, the row count and the generated timestamp.
     No new dependency: the workbook is written by hand as a stored ZIP. ---------- */

const rpCsvEsc = (v) => {
  if (v == null) return "";
  const s = typeof v === "object" ? JSON.stringify(v) : String(v);
  return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
};

function rpProvenanceLines(meta) {
  const lines = [
    ["Report", meta.title],
    ["Source", `${meta.table}${meta.reportKey ? ` (report_registry: ${meta.reportKey})` : " (not in report_registry - columns derived from the object itself)"}`],
    ["Filters applied", meta.sentence],
    ["Rows in this export", String(meta.rowCount)],
    ["Matching rows reported by source", meta.matchingRows == null ? "UNKNOWN — total certification refused" : String(meta.matchingRows)],
    ["Contract status", meta.contractStatus],
    ["Contract digest", meta.contractDigest ?? "NONE — total certification refused"],
    ["Contract observed at", meta.contractObservedAt ?? "NONE — total certification refused"],
    ["Numeric field verdicts", meta.measureVerdicts],
    ["Generated", meta.generated],
  ];
  if (meta.groupBy) lines.push(["Grouped by", rpLabel(meta.groupBy)]);
  if (meta.ownerNote) lines.push(["Owner note", meta.ownerNote]);
  if (meta.basisNote) lines.push(["Basis", meta.basisNote]);
  if (meta.truncated) lines.push(["WARNING", `Only the first ${RP_ROW_CEILING.toLocaleString()} rows were read. This export is INCOMPLETE.`]);
  return lines;
}

function rpDownload(blob, filename) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

function rpExportCsv(rows, cols, meta) {
  const head = rpProvenanceLines(meta).map(([k, v]) => `${rpCsvEsc(k)},${rpCsvEsc(v)}`);
  const body = [cols.map(rpCsvEsc).join(","), ...rows.map((r) => cols.map((c) => rpCsvEsc(r[c])).join(","))];
  const csv = [...head, "", ...body].join("\n");
  rpDownload(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }), `${meta.slug}.csv`);
}

/* Minimal store-only ZIP writer, so a genuine .xlsx is produced with no new
   package added to the front-end build. */
const RP_CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();
function rpCrc32(bytes) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i++) c = RP_CRC[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}
function rpZip(files) {
  const enc = new TextEncoder();
  const chunks = [], central = [];
  let offset = 0;
  for (const f of files) {
    const name = enc.encode(f.name);
    const data = enc.encode(f.data);
    const crc = rpCrc32(data);
    const local = new Uint8Array(30 + name.length);
    const dv = new DataView(local.buffer);
    dv.setUint32(0, 0x04034b50, true); dv.setUint16(4, 20, true);
    dv.setUint32(14, crc, true); dv.setUint32(18, data.length, true); dv.setUint32(22, data.length, true);
    dv.setUint16(26, name.length, true);
    local.set(name, 30);
    chunks.push(local, data);
    const cen = new Uint8Array(46 + name.length);
    const cv = new DataView(cen.buffer);
    cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, 20, true); cv.setUint16(6, 20, true);
    cv.setUint32(16, crc, true); cv.setUint32(20, data.length, true); cv.setUint32(24, data.length, true);
    cv.setUint16(28, name.length, true); cv.setUint32(42, offset, true);
    cen.set(name, 46);
    central.push(cen);
    offset += local.length + data.length;
  }
  const cenSize = central.reduce((a, c) => a + c.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, files.length, true); ev.setUint16(10, files.length, true);
  ev.setUint32(12, cenSize, true); ev.setUint32(16, offset, true);
  return new Blob([...chunks, ...central, end],
    { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}
const rpXmlEsc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;").replace(/\x00-\x08\x0B\x0C\x0E-\x1F/g, "");
const rpColRef = (i) => {
  let s = "", n = i + 1;
  while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
  return s;
};
function rpExportExcel(rows, cols, meta) {
  const matrix = [
    ...rpProvenanceLines(meta),
    [],
    cols.map(rpLabel),
    ...rows.map((r) => cols.map((c) => {
      const v = r[c];
      return v == null ? "" : typeof v === "object" ? JSON.stringify(v) : v;
    })),
  ];
  const sheetRows = matrix.map((row, ri) => {
    const cells = (row ?? []).map((v, ci) => {
      if (v == null || v === "") return "";
      const ref = `${rpColRef(ci)}${ri + 1}`;
      if (typeof v === "number" && Number.isFinite(v)) return `<c r="${ref}"><v>${v}</v></c>`;
      return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${rpXmlEsc(v)}</t></is></c>`;
    }).join("");
    return `<row r="${ri + 1}">${cells}</row>`;
  }).join("");
  const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
    + `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">`
    + `<sheetData>${sheetRows}</sheetData></worksheet>`;
  rpDownload(rpZip([
    { name: "[Content_Types].xml", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>` },
    { name: "_rels/.rels", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>` },
    { name: "xl/workbook.xml", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Report" sheetId="1" r:id="rId1"/></sheets></workbook>` },
    { name: "xl/_rels/workbook.xml.rels", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>` },
    { name: "xl/worksheets/sheet1.xml", data: sheet },
  ]), `${meta.slug}.xlsx`);
}

/* PDF is produced through the browser's own print pipeline (Destination:
   Save as PDF). This is a separate generated document, not the application
   theme - the locked neon-green theme is untouched. Paper is white because
   a printed audit pack has to be legible and photocopiable. */
function rpExportPdf(rows, cols, meta) {
  const w = window.open("", "_blank");
  if (!w) return "The browser blocked the print window. Allow pop-ups for this site and try again.";
  const prov = rpProvenanceLines(meta)
    .map(([k, v]) => `<tr><th>${rpXmlEsc(k)}</th><td>${rpXmlEsc(v)}</td></tr>`).join("");
  const head = cols.map((c) => `<th>${rpXmlEsc(rpLabel(c))}</th>`).join("");
  const body = rows.map((r) => `<tr>${cols.map((c) => {
    const v = r[c];
    return `<td>${rpXmlEsc(v == null || v === "" ? "—" : typeof v === "object" ? JSON.stringify(v) : v)}</td>`;
  }).join("")}</tr>`).join("");
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${rpXmlEsc(meta.slug)}</title>
  <style>
    @page { size: A4 landscape; margin: 12mm; }
    body { font-family: Figtree, system-ui, sans-serif; color:#111; margin:0; }
    h1 { font-size: 18px; margin: 0 0 2px; }
    .sub { font-size: 11px; color:#444; margin-bottom:10px; }
    .rule { height:3px; background:#2df26a; margin: 6px 0 10px; }
    table.prov { border-collapse:collapse; margin-bottom:12px; font-size:10px; width:100%; }
    table.prov th { text-align:left; width:150px; padding:2px 8px 2px 0; vertical-align:top; color:#000; }
    table.prov td { padding:2px 0; color:#222; }
    table.data { border-collapse:collapse; width:100%; font-size:9.5px; }
    table.data th { background:#e9fbf0; border:1px solid #b9d9c6; padding:4px 5px; text-align:left; }
    table.data td { border:1px solid #d7d7d7; padding:3px 5px; vertical-align:top; }
    table.data tr:nth-child(even) td { background:#fafafa; }
    thead { display: table-header-group; }
    tr { break-inside: avoid; }
    .note { font-size:10px; margin-top:10px; color:#444; }
  </style></head><body>
  <h1>${rpXmlEsc(meta.title)}</h1>
  <div class="sub">Twisted Growers Enterprise OS — Metrc is the legal record; this platform is a read-only mirror of it.</div>
  <div class="rule"></div>
  <table class="prov">${prov}</table>
  <table class="data"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>
  <div class="note">Every figure above is filtered exactly as stated in the header. Nothing has been sampled or summarised.</div>
  </body></html>`);
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 350);
  return null;
}

/* Google Sheets. There is no Google integration on this platform yet, so this
   does NOT silently upload anywhere - it puts the fully filtered report on the
   clipboard in the format Sheets pastes natively and opens a new blank sheet.
   Saying it "exports to Google Sheets" without saying that would be a lie. */
async function rpExportSheets(rows, cols, meta) {
  const tsvEsc = (v) => v == null ? "" : (typeof v === "object" ? JSON.stringify(v) : String(v)).replace(/[\t\n\r]/g, " ");
  const lines = [
    ...rpProvenanceLines(meta).map(([k, v]) => `${tsvEsc(k)}\t${tsvEsc(v)}`),
    "",
    cols.map(rpLabel).map(tsvEsc).join("\t"),
    ...rows.map((r) => cols.map((c) => tsvEsc(r[c])).join("\t")),
  ];
  try {
    await navigator.clipboard.writeText(lines.join("\n"));
  } catch {
    return "The browser refused clipboard access. Use the Excel or Comma Separated Values export and open that file in Google Sheets instead.";
  }
  window.open("https://sheets.new", "_blank");
  return `Copied ${meta.rowCount.toLocaleString()} rows with the filter statement. A blank Google Sheet has opened — paste into cell A1. Nothing was uploaded automatically; this platform has no Google connection yet.`;
}

/* ---------- The wet/dry trap, enforced in the user interface ----------
   Fresh frozen is packaged WET. Summing `pounds` across mixed bases is the
   error that is live on the Command tile (469.7 lb / 22.9% overstated). The
   engine REFUSES that total and says why, rather than printing a number that
   looks fine. Countable items are never added to weighed ones. */
const RP_WET_DRY = /^(pounds|pounds_wet|pounds_dry|weight_lb|net_lb|lb|total_pounds)$/;
/* THE SAME TRAP ON THE AXIS THE GUARD DID NOT COVER — 19 Aug 2026.
   The wet/dry refusal above has protected `pounds` since it was written, and
   `weight_basis` exists on exactly two registered objects. Meanwhile `quantity`
   sat unguarded next to `uom` on metrc_packages — both inside the default
   fourteen columns — so the report opened printing a green "totals are the sum
   of the rows shown" chip over 9,451,735.6 of NOTHING: 6.07M grams added to
   6,607 milligrams, 108,801 Each, 37 rows of pounds and kilograms, and 803 rows
   whose unit was never recorded at all. Same error, same page, different column.

   Spelling is normalised before the units are compared, because "Grams"/"g" and
   "Each"/"ea" are the same unit written twice and refusing those would be crying
   wolf. What survives normalisation is genuinely incompatible. */
const RP_QTY_COL = /^(quantity|qty|amount|net_quantity|package_quantity|unit_quantity|quantity_on_hand)$/i;
const RP_UOM_COL = /^(uom|unit_of_measure|unit|units|measure)$/i;
const RP_UOM_CANON = {
  g: "grams", gram: "grams", grams: "grams",
  mg: "milligrams", milligram: "milligrams", milligrams: "milligrams",
  kg: "kilograms", kilogram: "kilograms", kilograms: "kilograms",
  lb: "pounds", lbs: "pounds", pound: "pounds", pounds: "pounds",
  oz: "ounces", ounce: "ounces", ounces: "ounces",
  ea: "each", each: "each", unit: "each", units: "each", count: "each",
};
const rpCanonUom = (v) => {
  const s = String(v ?? "").trim().toLowerCase();
  if (!s) return "not recorded";
  return RP_UOM_CANON[s] ?? s;
};
function rpSubtotal(rowsIn, col, allCols, contract, populationVerdict) {
  const rows = rowsIn ?? [];
  if (!populationVerdict?.verified) {
    return { value: null, refused: true, why: `Refused: ${populationVerdict?.reason || "the matching population is not complete"}` };
  }
  const loadedGrain = loadedGrainVerdict(rows, contract);
  if (!loadedGrain.verified) {
    return { value: null, refused: true, why: `Refused: ${loadedGrain.reason}` };
  }
  const loadedMeasure = loadedMeasureVerdict(rows, contract, col);
  if (!loadedMeasure.verified) {
    return { value: null, refused: true, why: `Refused: ${loadedMeasure.reason}` };
  }
  const nums = rows.map((r) => r[col]).filter((v) => typeof v === "number" && Number.isFinite(v));
  if (RP_WET_DRY.test(col) && allCols.includes("weight_basis")) {
    const bases = new Set(rows.filter((r) => typeof r[col] === "number").map((r) => r.weight_basis ?? "not recorded"));
    if (bases.size > 1) {
      return {
        value: null, refused: true,
        why: `Refused: this group mixes ${[...bases].join(" and ")}. Fresh frozen is WET — adding it to dry weight overstates the total. Use the dry-equivalent column.`,
      };
    }
  }
  if (RP_QTY_COL.test(col)) {
    /* Deliberately unguarded: the wet/dry branch above already calls
       allCols.includes() on this same value, so a nullish allCols would have
       thrown before reaching here. A second nullish guard would add noise the
       silent-failure gate counts and would hide nothing. */
    const uomCol = allCols.find((c) => RP_UOM_COL.test(c));
    if (uomCol) {
      const counts = new Map();
      for (const r of rows) {
        if (typeof r[col] !== "number" || !Number.isFinite(r[col])) continue;
        const u = rpCanonUom(r[uomCol]);
        counts.set(u, (counts.get(u) ?? 0) + 1);
      }
      if (counts.size > 1) {
        const listed = [...counts.entries()].sort((a, b) => b[1] - a[1])
          .map(([u, n]) => `${u} (${n.toLocaleString()} rows)`).join(", ");
        return {
          value: null, refused: true,
          why: `Refused: this group mixes ${counts.size} units of measure — ${listed}. Adding them produces a number of nothing. Filter to one unit, or group by ${uomCol}.`,
        };
      }
    }
  }
  return { value: loadedMeasure.total, refused: false, count: loadedMeasure.valued, why: null };
}
const rpNum = (n) => n == null ? "—" : Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 });

/* ==================================================================
   THE EIGHT-LAYER AUDIT DRILL — owner, 8 Aug 2026:
   "ALL REPORTS MUST DRILL DOWN MICROSCOPIC AUDIT LEVEL."

   1 the figure · 2 every row behind it, reconciled · 3 the single record
   (v_package_dossier, 121 fields) · 4 the RAW Metrc JSON, the audit floor
   · 5 the documents themselves · 6 lineage both directions · 7 the change
   history · 8 the provenance of the figure itself.

   Nothing is sampled and nothing is topped-N on the way down. Where a layer
   cannot be built, it says which layer and why, rather than showing a
   shallower drill and looking complete.
   ================================================================== */

const rpTagOf = (row) => [row?.package_tag, row?.tag, row?.metrc_tag, row?.label]
  .find((v) => typeof v === "string" && /^[A-Z0-9]{20,}$/i.test(v.trim()))?.trim();

function RpLayer({ n, title, sub, children, open, onToggle }) {
  return (
    <div className="dsec" style={{ marginBottom: 10 }}>
      <button className="vegrouphead" style={{ width: "100%", textAlign: "left" }} onClick={onToggle}>
        <span className="vegchip" style={{ background: "var(--neon)", color: "var(--neon-ink)" }}>Layer {n}</span>
        <b style={{ marginLeft: 8 }}>{title}</b>
        {sub && <span className="note" style={{ marginLeft: 8 }}>{sub}</span>}
        <span style={{ float: "right" }}>{open ? "−" : "+"}</span>
      </button>
      {open && <div style={{ padding: "10px 4px" }}>{children}</div>}
    </div>
  );
}

/* Documents are minted at click time and NEVER cached. All 3,666 stored
   download_url values were signed together and die on the same day; a stored
   link would take every print and download button with it. */
function RpDocumentButton({ path, label }) {
  const [msg, setMsg] = useState(null);
  if (!path) return <span className="note">{label}: not held — nothing to open.</span>;
  return (
    <>
      <button className="btn small ghost" onClick={async () => {
        setMsg("Opening…");
        const { data, error } = await supabase.storage.from("metrc-documents").createSignedUrl(path, 300);
        if (error || !data?.signedUrl) { setMsg(`Could not open: ${error?.message ?? "no link returned"}`); return; }
        setMsg(null);
        window.open(data.signedUrl, "_blank", "noopener");
      }}>{label}</button>
      {msg && <span className="note" style={{ marginLeft: 8 }}>{msg}</span>}
    </>
  );
}

function RpAuditDrill({ row, context, onClose, onTag }) {
  const tag = rpTagOf(row);
  const [open, setOpen] = useState({ 3: true });
  const [dossier, setDossier] = useState(undefined);
  const [rawPkg, setRawPkg] = useState(undefined);
  const [became, setBecame] = useState(undefined);
  const [adjust, setAdjust] = useState(undefined);
  const [claims, setClaims] = useState(undefined);
  const toggle = (n) => setOpen((s) => ({ ...s, [n]: !s[n] }));

  useEffect(() => {
    let live = true;
    if (!tag) { setDossier(null); setRawPkg(null); setBecame(null); setAdjust(null); return; }
    (async () => {
      const [d, p, a] = await Promise.all([
        supabase.from("v_package_dossier").select("*").eq("package_tag", tag).maybeSingle(),
        supabase.from("metrc_packages").select("tag, license, raw, synced_at").eq("tag", tag),
        supabase.from("metrc_rpt_adjustments").select("*").eq("package_tag", tag).order("adjusted_on", { ascending: false }),
      ]);
      if (!live) return;
      setDossier(d.error ? { __error: d.error.message } : (d.data ?? null));
      setRawPkg(p.error ? { __error: p.error.message } : (p.data ?? []));
      setAdjust(a.error ? { __error: a.error.message } : (a.data ?? []));
      const b = await supabase.from("metrc_packages")
        .select("tag, item_name, quantity, uom, packaged_on, location")
        .filter("raw->>SourcePackageLabels", "ilike", `%${tag}%`).limit(500);
      if (live) setBecame(b.error ? { __error: b.error.message } : (b.data ?? []));
    })();
    return () => { live = false; };
  }, [tag]);

  useEffect(() => {
    let live = true;
    supabase.from("brain_claims").select("*").eq("covers_object", context.table)
      .then(({ data, error }) => { if (live) setClaims(error ? { __error: error.message } : (data ?? [])); });
    return () => { live = false; };
  }, [context.table]);

  const madeFrom = useMemo(() => {
    const src = dossier?.made_from_packages ?? rawPkg?.[0]?.raw?.SourcePackageLabels ?? "";
    return String(src || "").split(",").map((s) => s.trim()).filter(Boolean);
  }, [dossier, rawPkg]);
  const harvests = useMemo(() => {
    const src = dossier?.source_harvest ?? rawPkg?.[0]?.raw?.SourceHarvestNames ?? "";
    return String(src || "").split(",").map((s) => s.trim()).filter(Boolean);
  }, [dossier, rawPkg]);

  const Err = ({ o, what }) => o?.__error
    ? <div className="schip bad" style={{ display: "block", padding: 8 }}>Could not read {what}: {o.__error}</div> : null;

  return (
    <div className="vedrawerwrap" onClick={onClose}>
      <div className="vedrawer" style={{ width: "min(1180px, 97vw)" }} onClick={(e) => e.stopPropagation()}>
        <div className="srhead">
          <span className="srtitle">Audit drill — {tag ?? "this row"}</span>
          <button className="btn small ghost" onClick={onClose}>✕</button>
        </div>
        <div style={{ padding: 12, overflow: "auto" }}>
          {!tag && (
            <div className="empty" style={{ marginBottom: 12 }}>
              <b>This row is not a single tagged package</b>
              Layers 3 to 7 attach to a Metrc package tag — the dossier, the raw state record, the
              certificate, the manifest, the lineage and the quantity history all key on it. This row is an
              aggregate or a reference record, so it has none of its own. Every field it does have is below,
              and the provenance layer still applies.
            </div>
          )}

          <RpLayer n={1} title="The figure this row sits behind" open={open[1]} onToggle={() => toggle(1)}
            sub={context.figureLabel ?? "opened directly from the report"}>
            <div className="dgrid">
              <div className="df"><div className="dk">Report</div><div className="dv">{context.title}</div></div>
              <div className="df"><div className="dk">Source object</div><div className="dv">{context.table}</div></div>
              <div className="df"><div className="dk">Filters in force</div><div className="dv">{context.sentence}</div></div>
              <div className="df"><div className="dk">Rows loaded behind the figure</div><div className="dv">{context.loadedRows?.toLocaleString?.() ?? "—"}</div></div>
              <div className="df"><div className="dk">All matching rows</div><div className="dv">{context.matchingRows?.toLocaleString?.() ?? "UNKNOWN"}</div></div>
              <div className="df"><div className="dk">Total certification</div><div className="dv">{context.totalVerdict}</div></div>
              <div className="df"><div className="dk">Contract digest</div><div className="dv">{context.contractDigest ?? "NONE"}</div></div>
              <div className="df"><div className="dk">Contract observed</div><div className="dv">{context.contractObservedAt ?? "UNKNOWN"}</div></div>
              <div className="df"><div className="dk">Population snapshot</div><div className="dv">{context.snapshotId ?? "NONE — totals refused"}</div></div>
              <div className="df"><div className="dk">Numeric field verdicts</div><div className="dv">{context.measureVerdicts}</div></div>
              {context.figureLabel && <div className="df"><div className="dk">Figure</div><div className="dv">{context.figureLabel}</div></div>}
            </div>
          </RpLayer>

          <RpLayer n={2} title="Every row behind it" open={open[2]} onToggle={() => toggle(2)}
            sub={context.reconcileNote ?? "reconciliation is shown on the report itself"}>
            <div className="note">
              The report currently holds {context.loadedRows?.toLocaleString?.() ?? "—"} of {context.matchingRows?.toLocaleString?.() ?? "an unknown number of"} matching rows.
              {context.truncated ? " The read hit the row ceiling, so no total is certified." : ""}
              Close this drawer to inspect them. Exports re-read the population and stamp their own completeness and contract verdicts.
            </div>
            {context.reconcileNote && <div className="note" style={{ marginTop: 6 }}>{context.reconcileNote}</div>}
          </RpLayer>

          <RpLayer n={3} title="The single record" open={open[3]} onToggle={() => toggle(3)}
            sub={dossier && !dossier.__error ? "v_package_dossier — every field held" : "the row as the report returned it"}>
            <Err o={dossier} what="the package dossier" />
            {dossier && !dossier.__error && (
              <div className="statchips" style={{ marginBottom: 8 }}>
                {dossier.weight_basis && <span className="schip info">Weight basis: {dossier.weight_basis}</span>}
                {dossier.certificate_basis && <span className="schip info">Certificate: {dossier.certificate_basis}</span>}
                {dossier.cost_basis && <span className="schip info">Cost basis: {dossier.cost_basis}</span>}
                {dossier.ownership_verdict && <span className="schip warn">Ownership: {dossier.ownership_verdict}</span>}
                <span className="schl">every layer states its own basis — none of these is dropped on the way down</span>
              </div>
            )}
            <DetailGrid obj={dossier && !dossier.__error ? dossier : row} />
            {dossier === null && tag && <div className="note">No dossier row for this tag. The report row itself is shown above.</div>}
          </RpLayer>

          <RpLayer n={4} title="The raw Metrc record — the audit floor" open={open[4]} onToggle={() => toggle(4)}
            sub="untouched state JSON, nothing of ours in between">
            <Err o={rawPkg} what="the raw Metrc package" />
            {Array.isArray(rawPkg) && rawPkg.length === 0 && (
              <div className="note">No row in <b>metrc_packages</b> for this tag. Either it is not a package, or it has not synced.</div>
            )}
            {Array.isArray(rawPkg) && rawPkg.map((p, i) => (
              <div key={i} style={{ marginBottom: 10 }}>
                <div className="note">
                  metrc_packages · licence {p.license} · synced {p.synced_at ? String(p.synced_at).slice(0, 19).replace("T", " ") : "not recorded"}
                  {rawPkg.length > 1 ? " · this tag is visible in both of our facilities, which is legitimate Metrc behaviour" : ""}
                </div>
                <pre className="drawjson">{JSON.stringify(p.raw, null, 2)}</pre>
              </div>
            ))}
          </RpLayer>

          <RpLayer n={5} title="The documents themselves" open={open[5]} onToggle={() => toggle(5)}
            sub="signed at click time, never cached">
            {dossier && !dossier.__error ? (
              <div className="dgrid">
                <div className="df"><div className="dk">Certificate of Analysis</div><div className="dv">
                  <RpDocumentButton path={dossier.coa_storage_path} label="Open the Certificate of Analysis" />
                  {!dossier.coa_storage_path && <div className="note">{dossier.certificate_basis ?? "No certificate is filed against this package."}</div>}
                  {dossier.laboratory && <div className="note">{dossier.laboratory}{dossier.tested_on ? ` · tested ${String(dossier.tested_on).slice(0, 10)}` : ""}</div>}
                  {dossier.certificate_expired && <div className="schip bad">Certificate expired {String(dossier.coa_valid_until ?? "").slice(0, 10)} — product cannot be sold on it</div>}
                </div></div>
                <div className="df"><div className="dk">Manifest</div><div className="dv">
                  <RpDocumentButton path={dossier.manifest_storage_path} label="Open the manifest" />
                  <div className="note">{dossier.manifest_numbers ? `Manifest numbers: ${dossier.manifest_numbers}` : "No manifest — packaged here and never transferred, or not yet synced."}</div>
                </div></div>
              </div>
            ) : <div className="note">No dossier for this row, so no document paths to mint links from.</div>}
          </RpLayer>

          <RpLayer n={6} title="Lineage, both directions" open={open[6]} onToggle={() => toggle(6)}
            sub="what it was made from, and what it became — both clickable">
            <div className="cols2">
              <div>
                <b>Made from</b>
                {madeFrom.length === 0 && harvests.length === 0 && <div className="note">Nothing recorded. Primary production, or Metrc holds no source link.</div>}
                {harvests.map((h) => <div key={h} className="note">Harvest: {h}</div>)}
                {madeFrom.map((t) => (
                  <div key={t}><button className="btn small ghost" onClick={() => onTag(t)}>{t}</button></div>
                ))}
              </div>
              <div>
                <b>Became</b>
                <Err o={became} what="downstream packages" />
                {Array.isArray(became) && became.length === 0 && <div className="note">Nothing was made from this package.</div>}
                {Array.isArray(became) && became.map((b) => (
                  <div key={b.tag}>
                    <button className="btn small ghost" onClick={() => onTag(b.tag)}>{b.tag}</button>
                    <span className="note"> {b.item_name} · {b.quantity} {b.uom}</span>
                  </div>
                ))}
              </div>
            </div>
          </RpLayer>

          <RpLayer n={7} title="Change history" open={open[7]} onToggle={() => toggle(7)}
            sub="quantity changes after packaging">
            {dossier && !dossier.__error && (
              <div className="dgrid">
                <div className="df"><div className="dk">Created quantity</div><div className="dv">{rpNum(dossier.created_quantity)} {dossier.unit_of_measure ?? ""}</div></div>
                <div className="df"><div className="dk">Current quantity</div><div className="dv">{rpNum(dossier.quantity_raw ?? dossier.quantity)} {dossier.unit_of_measure ?? ""}</div></div>
                <div className="df"><div className="dk">Consumed since creation</div><div className="dv">{rpNum(dossier.consumed_since_creation)} {dossier.unit_of_measure ?? ""}</div></div>
                <div className="df"><div className="dk">Received quantity</div><div className="dv">{rpNum(dossier.received_quantity)}</div></div>
              </div>
            )}
            <Err o={adjust} what="the adjustments report" />
            {Array.isArray(adjust) && adjust.length === 0 && (
              <div className="note">No adjustment lines recorded against this tag in <b>metrc_rpt_adjustments</b>.
                That table is populated by the Metrc report import, not by the interface sync — an empty result
                means no adjustment was imported, not that none happened.</div>
            )}
            {Array.isArray(adjust) && adjust.length > 0 && (
              <div className="tablewrap"><table>
                <thead><tr><th>Adjusted on</th><th>Quantity</th><th>Unit of measure</th><th>Reason</th><th>Note</th><th>Adjusted by</th></tr></thead>
                <tbody>{adjust.map((a, i) => (
                  <tr key={i}><td>{a.adjusted_on ?? "not recorded"}</td><td>{rpNum(a.quantity)}</td><td>{a.uom ?? "—"}</td>
                    <td>{a.reason ?? "—"}</td><td>{a.note ?? "—"}</td><td>{a.adjusted_by ?? "—"}</td></tr>
                ))}</tbody>
              </table></div>
            )}
          </RpLayer>

          <RpLayer n={8} title="Provenance of the figure itself" open={open[8]} onToggle={() => toggle(8)}
            sub="which view produced it, and whether its cross-checks agree">
            <div className="dgrid">
              <div className="df"><div className="dk">Produced by</div><div className="dv">{context.table}</div></div>
              <div className="df"><div className="dk">Registered report</div><div className="dv">{context.reportKey ?? "Not in report_registry — this page renders its object directly."}</div></div>
              {context.ownerNote && <div className="df"><div className="dk">Owner note</div><div className="dv">{context.ownerNote}</div></div>}
            </div>
            <Err o={claims} what="the claim register" />
            {Array.isArray(claims) && claims.length === 0 && (
              <div className="note">No registered claim covers <b>{context.table}</b>, so no independent
                second derivation of this figure exists yet. That is a gap, not a pass — a figure with one
                derivation has not been cross-checked.</div>
            )}
            {Array.isArray(claims) && claims.length > 0 && (
              <div className="tablewrap"><table>
                <thead><tr><th>Claim</th><th>Written value</th><th>Live value</th><th>Agreement</th><th>Last checked</th></tr></thead>
                <tbody>{claims.map((c) => (
                  <tr key={c.claim_key}>
                    <td>{c.claim_text ?? c.claim_key}</td><td>{c.written_value ?? "—"}</td><td>{c.last_value ?? "—"}</td>
                    <td><span className={`schip ${c.drifted ? "bad" : "good"}`}>{c.drifted ? "IN DISAGREEMENT" : "agrees"}</span></td>
                    <td>{c.last_checked ? String(c.last_checked).slice(0, 19).replace("T", " ") : "never"}</td>
                  </tr>
                ))}</tbody>
              </table></div>
            )}
          </RpLayer>
        </div>
      </div>
    </div>
  );
}

/* ---------- The fields panel and the filters panel. One component each,
     used by every report, so the controls never drift apart per page. ---------- */

const RP_FIRST = 2000;

function RpFieldsPanel({ cols, shown, setShown, onClose }) {
  const move = (name, dir) => {
    const i = shown.indexOf(name);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= shown.length) return;
    const next = [...shown];
    next.splice(j, 0, next.splice(i, 1)[0]);
    setShown(next);
  };
  const toggle = (name) => setShown(shown.includes(name) ? shown.filter((c) => c !== name) : [...shown, name]);
  return (
    <div className="findpanel" style={{ padding: 12, maxHeight: 420, overflow: "auto" }}>
      <div className="dhead">
        <span className="dtitle">Columns — show, hide and reorder. Remembered for you.</span>
        <button className="btn small ghost" onClick={onClose}>Done</button>
      </div>
      <div className="statchips" style={{ margin: "6px 0" }}>
        <button className="btn small ghost" onClick={() => setShown(cols.filter((c) => c.kind !== "json").map((c) => c.name))}>Show every column</button>
        <button className="btn small ghost" onClick={() => setShown(shown.slice(0, 1))}>Hide all but the first</button>
        <span className="schl">{shown.length} of {cols.length} columns shown</span>
      </div>
      {shown.map((name) => (
        <div key={name} className="findrow" style={{ display: "flex", alignItems: "center", gap: 6, padding: "2px 0" }}>
          <input aria-label="Hide this column" type="checkbox" checked readOnly onClick={() => toggle(name)} />
          <span style={{ flex: 1 }}>{rpLabel(name)}</span>
          <span className="note">{cols.find((c) => c.name === name)?.kind}</span>
          <button className="btn small ghost" title="Move earlier" onClick={() => move(name, -1)}>↑</button>
          <button className="btn small ghost" title="Move later" onClick={() => move(name, 1)}>↓</button>
        </div>
      ))}
      {cols.filter((c) => !shown.includes(c.name)).length > 0 && (
        <div style={{ marginTop: 8 }}>
          <div className="note">Hidden — nothing is lost, tick to bring it back:</div>
          {cols.filter((c) => !shown.includes(c.name)).map((c) => (
            <div key={c.name} className="findrow" style={{ display: "flex", alignItems: "center", gap: 6, padding: "2px 0" }}>
              <input aria-label="Show this column" type="checkbox" checked={false} onChange={() => toggle(c.name)} />
              <span style={{ flex: 1 }}>{rpLabel(c.name)}</span>
              <span className="note">{c.kind}{c.allNull ? " · empty on every row read" : ""}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function RpFiltersPanel({ cols, filters, setFilters, onClose }) {
  const set = (i, patch) => setFilters(filters.map((f, n) => n === i ? { ...f, ...patch } : f));
  return (
    <div className="findpanel" style={{ padding: 12, maxHeight: 420, overflow: "auto" }}>
      <div className="dhead">
        <span className="dtitle">Column filters — every one you add must also be true (AND)</span>
        <button className="btn small ghost" onClick={onClose}>Done</button>
      </div>
      {filters.length === 0 && <div className="note">No column filters yet. Add one below — text, numbers, dates, yes/no and empty/not empty are all available.</div>}
      {filters.map((f, i) => {
        const kind = cols.find((c) => c.name === f.col)?.kind ?? "text";
        const ops = RP_OPS[kind] ?? RP_OPS.text;
        return (
          <div key={i} className="findrow" style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", padding: "4px 0" }}>
            <select aria-label="Filter column" className="fdate" value={f.col} onChange={(e) => set(i, { col: e.target.value, op: (RP_OPS[cols.find((c) => c.name === e.target.value)?.kind ?? "text"] ?? RP_OPS.text)[0][0], value: "", value2: "" })}>
              {cols.map((c) => <option key={c.name} value={c.name}>{rpLabel(c.name)}</option>)}
            </select>
            <select aria-label="Filter operator" className="fdate" value={f.op} onChange={(e) => set(i, { op: e.target.value })}>
              {ops.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
            {rpNeedsValue(f.op) && (
              <input aria-label="Filter value" className="fdate" type={kind === "date" ? "date" : kind === "number" ? "number" : "text"}
                placeholder={f.op === "in" ? "value one, value two, value three" : "value"}
                value={f.value ?? ""} onChange={(e) => set(i, { value: e.target.value })} />
            )}
            {f.op === "between" && (
              <input aria-label="Filter upper bound" className="fdate" type={kind === "date" ? "date" : "number"} placeholder="and"
                value={f.value2 ?? ""} onChange={(e) => set(i, { value2: e.target.value })} />
            )}
            <button className="btn small ghost" onClick={() => setFilters(filters.filter((_, n) => n !== i))}>Remove</button>
          </div>
        );
      })}
      <button className="btn small" style={{ marginTop: 8 }}
        /* "contains" was hard-coded here while the column-change handler twenty
           lines below derived the operator from the column's kind — the correct
           pattern was already in the file, one branch away. 91 of 592 registered
           objects open on a number, date or boolean first column, where
           "contains" is not in RP_OPS: the operator select held a value with no
           matching option, and one keystroke sent .ilike() at a bigint —
           "operator does not exist: bigint ~~* unknown". The engine then advised
           clearing and re-adding the filters, which reproduces it exactly. */
        onClick={() => setFilters([...filters, { col: cols[0]?.name, op: (RP_OPS[cols[0]?.kind ?? "text"] ?? RP_OPS.text)[0][0], value: "", value2: "" }])}>
        Add a column filter
      </button>
    </div>
  );
}

/* Saved views: tabbed, per user, stored in `saved_views` so a layout follows the
   person rather than the browser. `collection` namespaces them to the report. */
/* ══════════ THE HEADER EVERY REGISTERED REPORT PRINTS ══════════
 * Owner ruling, 28 Aug 2026: title, company, period from the bus, as-of, source.
 *
 * It is one component because it is one engine. A report is a ROW, never a code
 * change, so a header written per page would be 615 headers to keep honest and
 * 615 places for one of them to quietly stop saying which system it read.
 *
 * NOTHING HERE IS INVENTED WHEN IT IS NOT KNOWN. Each line either states a fact
 * or states that the fact is missing. A printed report is the artefact that
 * leaves the building and gets read by somebody who cannot ask the database a
 * follow-up question, so a blank where the source should be is worse than the
 * words that say the source could not be derived. */
/* App.jsx does not import dashkit's listOf, and reaching for it here would add a
   module edge for three lines. A null result and an error result must both render
   as "nothing", never throw inside a header. */
const rhArray = (v) => (Array.isArray(v) ? v : []);

function useCompanyIdentity() {
  const [state, setState] = useState({ rows: null, error: null });
  useEffect(() => {
    let live = true;
    supabase.from("company_licenses")
      .select("license,label,kind,active").eq("active", true).order("kind")
      .then(({ data, error }) => {
        if (!live) return;
        setState(error ? { rows: null, error: error.message } : { rows: data ?? [], error: null });
      });
    return () => { live = false; };
  }, []);
  return state;
}

/* Provenance is MEASURED, in v_report_provenance, by walking pg_depend to the
   bottom — see 20260828170000. Read here rather than guessed from the fact_view
   name, because every enabled report's fact_view begins with a bare `v_` and the
   name identifies nothing. */
function useReportProvenance(reportKey) {
  const [state, setState] = useState({ row: null, error: null });
  useEffect(() => {
    let live = true;
    setState({ row: null, error: null });
    if (!reportKey) return () => { live = false; };
    supabase.from("v_report_provenance")
      .select("sources,relations_read,deepest,truncated_at_depth")
      .eq("report_key", reportKey).maybeSingle()
      .then(({ data, error }) => {
        if (!live) return;
        setState(error ? { row: null, error: error.message } : { row: data ?? null, error: null });
      });
    return () => { live = false; };
  }, [reportKey]);
  return state;
}

function RpReportHeader({ title, reportKey, factView, dateCol, from, to, presetKey, readAt, total }) {
  const company = useCompanyIdentity();
  const prov = useReportProvenance(reportKey);
  /* The label comes from f_date_presets, the same catalogue the control uses, so the
     printed page and the dropdown can never disagree about what "this month" means.
     A raw key like this_month_td is not something to print at a reader. */
  const { rows: presetRows } = useDatePresetCatalog();
  const presetLabel = rhArray(presetRows).find((r) => r.preset_key === presetKey)?.label ?? null;

  const licences = rhArray(company.rows);
  const companyLine = company.error
    ? `Company could not be read: ${company.error}`
    : licences.length
      ? `Twisted Growers · ${licences.map((l) => `${l.license} ${l.kind}`).join(" · ")}`
      : company.rows === null ? "Reading the company licences…" : "No active licence is recorded in company_licenses.";

  /* A report with no date_column is not a report over a period, and saying
     "1 Aug to 28 Aug" over it would be a claim its own rows cannot support. */
  const periodLine = !dateCol
    ? "Every row, all dates — this report declares no date column, so no period was applied."
    : (from || to)
      ? `${dateCol} from ${from || "the earliest record"} to ${to || "the latest record"}${presetLabel ? ` · ${presetLabel}` : ""}`
      : `${dateCol} · every date${presetLabel ? ` · ${presetLabel}` : ""}`;

  const sourceLine = (() => {
    if (prov.error) {
      return /does not exist|schema cache|42P01/i.test(prov.error)
        ? "Source not derived — v_report_provenance is not in this database yet."
        : `Source could not be read: ${prov.error}`;
    }
    if (!reportKey) return "Not a registered report, so no source is recorded for it.";
    if (prov.row === null) return "Deriving the source…";
    const src = rhArray(prov.row.sources);
    if (!src.length) return "This report resolves to no base relation, so no source could be derived.";
    return `${src.join(" + ")} · ${prov.row.relations_read} relation${prov.row.relations_read === 1 ? "" : "s"}`
      + (prov.row.truncated_at_depth ? " · dependency walk hit its depth limit, so this list may be short" : "");
  })();

  /* THE RUNNING IDENTITY, ON EVERY PRINTED PAGE.
   *
   * The block below states the five facts once, at the top. That is enough for a
   * one-page report and not enough for anything else: a forty-page export of the
   * order book puts figures on page thirty with nothing on that sheet saying which
   * company, which window, or read when. A number photographed off page thirty and
   * pasted into an email is then a number with no period attached, which is the
   * whole failure the header exists to prevent.
   *
   * So the same facts repeat as a fixed one-line strip, which print engines paint
   * into the @page top margin on every sheet. It is aria-hidden: on screen it is
   * display:none, and a screen reader must not read the identity twice. */
  const printIdent = [
    title,
    licences.length ? `Twisted Growers ${licences.map((l) => l.license).join("/")}` : null,
    dateCol ? periodLine : "all dates",
    readAt ? `as of ${new Date(readAt).toLocaleString()}` : null,
    prov.row && rhArray(prov.row.sources).length ? rhArray(prov.row.sources).join(" + ") : null,
  ].filter(Boolean).join("  ·  ");

  return (
    <div className="rp-reporthead">
      <div className="rp-printident" aria-hidden="true">{printIdent}</div>
      <div className="rp-rh-title">{title}</div>
      <dl className="rp-rh-facts">
        <div><dt>Company</dt><dd>{companyLine}</dd></div>
        <div><dt>Period</dt><dd>{periodLine}</dd></div>
        <div><dt>As of</dt><dd>{readAt
          ? new Date(readAt).toLocaleString()
          : "not yet read"}{total != null ? ` · ${total.toLocaleString()} records` : ""}</dd></div>
        <div><dt>Source</dt><dd>{sourceLine}</dd></div>
        <div><dt>Report</dt><dd>{reportKey ? `${reportKey} · ${factView}` : factView}</dd></div>
      </dl>
    </div>
  );
}

function RpSavedViews({ viewKey, state, apply, session }) {
  const [views, setViews] = useState(null);
  const [err, setErr] = useState(null);
  const [active, setActive] = useState(null);
  const collection = `report:${viewKey}`;
  const load = useCallback(() => {
    supabase.from("saved_views").select("*").eq("collection", collection).order("position")
      .then(({ data, error }) => { if (error) setErr(error.message); else setViews(data ?? []); });
  }, [collection]);
  useEffect(() => { load(); }, [load]);
  const save = async () => {
    const name = window.prompt("Name this view — it will appear as a tab on this report.");
    if (!name) return;
    const { error } = await supabase.from("saved_views").insert({
      collection, name, view_type: "table", group_by: state.groupBy ?? null,
      shown_fields: state.shown, filters: state.filters, is_private: true,
      owner: session?.user?.id ?? null,
    });
    if (error) { setErr(error.message); return; }
    load();
  };
  if (err) return <div className="schip bad">Saved views unavailable: {err}</div>;
  return (
    <div className="vetabs">
      <button className={`vetab ${active === null ? "on" : ""}`} onClick={() => { setActive(null); apply(null); }}>All records</button>
      {(views ?? []).map((v) => (
        <button key={v.id} className={`vetab ${active === v.id ? "on" : ""}`}
          onClick={() => { setActive(v.id); apply(v); }}>{v.name}</button>
      ))}
      <span className="veadd"><button className="btn small ghost" onClick={save}>Save this view</button></span>
    </div>
  );
}

/* ---------- THE REPORT SCREEN. Every one of the 518 report pages is this. ---------- */
function ReportScreen({ entry, actions, session }) {
  const table = entry.table_ref;
  const { registry, registryError } = useReportRegistry(`${table}:${entry.view_key}`);
  const regSelection = useMemo(
    () => selectReportContract(registry, table, entry.view_key),
    [registry, table, entry.view_key]);
  const reg = regSelection.contract;

  const [probe, setProbe] = useState(null);
  const [probeError, setProbeError] = useState(null);
  const [rows, setRows] = useState(null);
  const [total, setTotal] = useState(null);
  /* The moment the rows in front of the reader were actually read. Not a render
     clock: a printed page that timestamps itself when the paper came out claims a
     freshness it does not have, and a report left open over lunch would print an
     as-of an hour newer than its own figures. */
  const [readAt, setReadAt] = useState(null);
  const [error, setError] = useState(null);
  const [truncated, setTruncated] = useState(false);
  const [rowsContractDigest, setRowsContractDigest] = useState(null);
  const [rowsContractError, setRowsContractError] = useState(null);
  const [loadAll, setLoadAll] = useState(false);
  const [busy, setBusy] = useState(false);

  const [search, setSearch] = useState("");
  const [searchLive, setSearchLive] = useState("");
  const [filters, setFilters] = useState([]);
  const [dateCol, setDateCol] = useState(null);
  const [dFrom, setDFrom] = useState("");
  const [dTo, setDTo] = useState("");
  const [sort, setSort] = useState(null);
  const [groupBy, setGroupBy] = useState("");
  const [shown, setShown] = useState([]);
  const [panel, setPanel] = useState(null);
  const [drill, setDrill] = useState(null);
  const [msg, setMsg] = useState(null);
  const [collapsed, setCollapsed] = useState({});
  const [preset, setPreset] = useState(null);
  const applyReportDefault = useCallback((range) => {
    setDFrom(range.from ?? "");
    setDTo(range.to ?? "");
  }, []);
  const dateDefault = useDefaultRange(session, entry.view_key, applyReportDefault);
  useEffect(() => {
    if (dateDefault.presetKey) setPreset(dateDefault.presetKey);
  }, [dateDefault.presetKey]);

  const saveDateDefault = async (scopeAll) => {
    if (!session?.user?.id) return;
    try {
      await persistDateDefault(supabase, {
        userId: session.user.id,
        viewKey: entry.view_key,
        presetKey: preset ?? "custom",
        from: dFrom,
        to: dTo,
        everywhere: scopeAll,
      });
      setMsg(scopeAll
        ? "Saved. Every page will use this range unless that page has its own saved range."
        : "Saved. This page will reopen on this range for you.");
      setPanel(null);
    } catch (error) {
      setMsg(`The default could not be saved: ${error.message}`);
    }
  };

  /* Probe: learn the shape from real rows, not from one row that may be all
     nulls. Errors are held and shown - never turned into an empty grid. */
  useEffect(() => {
    setProbe(null); setProbeError(null); setRows(null); setTotal(null); setError(null);
    setSearch(""); setSearchLive(""); setFilters([]); setDFrom(""); setDTo("");
    setSort(null); setGroupBy(""); setLoadAll(false); setTruncated(false); setMsg(null);
    setRowsContractDigest(null); setRowsContractError(null);
    /* Column choice and date column belong to the report, not to the session.
       Without these two the previous report's columns followed you to the next
       one and every cell read "—", which looks exactly like empty data. */
    setShown([]); setDateCol(null); setPanel(null); setDrill(null); setCollapsed({});
    if (!table) return;
    let live = true;
    supabase.from(table).select("*").limit(200).then(({ data, error: e }) => {
      if (!live) return;
      if (e) { setProbeError(e.message); return; }
      setProbe(data ?? []);
    });
    return () => { live = false; };
  }, [table]);

  const cols = useMemo(() => rpDescribeColumns(probe ?? []), [probe]);
  const dateCols = useMemo(() => cols.filter((c) => c.kind === "date").map((c) => c.name), [cols]);
  const textCols = useMemo(() => cols.filter((c) => c.kind === "text").map((c) => c.name).slice(0, 12), [cols]);
  const dimCols = useMemo(() => {
    const fromReg = (reg?.dimensions ?? []).filter((d) => cols.some((c) => c.name === d));
    if (fromReg.length) return fromReg;
    return cols.filter((c) => (c.kind === "text" || c.kind === "boolean") && !/tag$|_id$|^id$|note|description/.test(c.name)).map((c) => c.name);
  }, [reg, cols]);

  useEffect(() => {
    if (!cols.length) return;
    setDateCol((cur) => cur ?? (reg?.date_column && dateCols.includes(reg.date_column) ? reg.date_column : dateCols[0] ?? null));
    setShown((cur) => cur.length ? cur : cols.filter((c) => c.kind !== "json").map((c) => c.name).slice(0, 14));
  }, [cols, dateCols, reg]);

  const buildQuery = useCallback((sel, withCount) => {
    let qy = supabase.from(table).select(sel, withCount ? { count: "exact" } : undefined);
    const term = rpSanitise(search);
    if (term && textCols.length) qy = qy.or(textCols.map((c) => `${c}.ilike.%${term}%`).join(","));
    qy = rpApplyFilters(qy, filters);
    /* THE RANGE, UNDER THE TWO RULES IN lib/range-search.js — and both were
       broken here, on the one screen that serves ~619 registered reports.

       RULE 1, a search beats the range. The search above and the range below
       used to go onto the SAME PostgREST query, ANDed. So a reader typing a
       July work order number on a report opened at this-month-to-date got
       "no results" — and the report looked empty rather than filtered, which is
       the Orders defect wearing a new hat. rangePlan answers whether the range
       applies at all; when somebody is searching, it does not, and the page
       says so rather than setting it aside silently.

       RULE 2, an undated row is never dropped by a range. This filtered with
       .gte()/.lt(), and no NULL satisfies either. Every row whose date was never
       recorded disappeared from every ranged report — silently, and counted
       nowhere. A row with no date is not outside the window, it is unplaceable,
       so it is kept: the predicate is now "in the window OR has no date at all". */
    const plan = rangePlan({ from: dFrom, to: dTo, dateField: dateCol, q: term });
    if (plan.applyRange) {
      const bounds = [];
      if (dFrom) bounds.push(`${dateCol}.gte.${dFrom}`);
      if (dTo) bounds.push(`${dateCol}.lt.${dateUpperExclusive(dTo)}`);
      qy = qy.or(`${dateCol}.is.null,and(${bounds.join(",")})`);
    }
    /* nullsFirst false: rows created before a date was tracked read NULL and
       must sort LAST, never first, and never look like a real empty date. */
    if (sort) qy = qy.order(sort.col, { ascending: sort.asc, nullsFirst: false });
    for (const key of (Array.isArray(reg?.grain_keys) ? reg.grain_keys : [])) {
      if (!sort || sort.col !== key) qy = qy.order(key, { ascending: true, nullsFirst: false });
    }
    return qy;
  }, [table, search, textCols, filters, dateCol, dFrom, dTo, sort, reg]);

  const fetchRows = useCallback(async (all) => {
    const out = [];
    let from = 0, tot = null, hitCeiling = false;
    for (;;) {
      const size = all ? RP_PAGE : RP_FIRST;
      const { data, error: e, count } = await buildQuery("*", from === 0).range(from, from + size - 1);
      if (e) return { error: e.message };
      if (from === 0) tot = count ?? null;
      out.push(...(data ?? []));
      if (!all) break;
      if (!data || data.length < size) break;
      from += size;
      if (out.length >= RP_ROW_CEILING) { hitCeiling = true; break; }
    }
    const proof = await supabase.rpc("f_report_registry_runtime", { p_fact_view: table });
    return { rows: out, total: tot, truncated: hitCeiling,
      proofRows: Array.isArray(proof.data) ? proof.data : [], proofError: proof.error?.message ?? null };
  }, [buildQuery, table]);

  useEffect(() => {
    if (!table || probe === null || !dateDefault.ready) return;
    let live = true;
    setBusy(true); setError(null); setRowsContractDigest(null); setRowsContractError(null);
    fetchRows(loadAll || !!groupBy).then((r) => {
      if (!live) return;
      setBusy(false);
      if (r.error) { setError(r.error); setRows(null); return; }
      const proofSelection = selectReportContract(r.proofRows, table, entry.view_key);
      setRowsContractDigest(proofSelection.contract?.contract_digest ?? null);
      setRowsContractError(r.proofError || (proofSelection.ambiguous ? "The post-read contract is ambiguous." : null));
      setRows(r.rows); setTruncated(r.truncated);
      setTotal(r.total ?? null);
      setReadAt(new Date().toISOString());
    });
    return () => { live = false; };
  }, [table, entry.view_key, probe, fetchRows, loadAll, groupBy, dateDefault.ready]);

  const dirty = !!(search || dFrom || dTo || filters.length);
  const sentence = rpFilterSentence({ search, searchCols: textCols, filters, dateCol, dFrom, dTo, cols });
  const title = reg?.title ?? entry.label;
  const ownerNote = reg?.owner_note ?? null;
  const allNames = cols.map((c) => c.name);
  const basisNotes = [];
  if (reg?.row_grain && reg.grain_verified === true) {
    basisNotes.push(`Verified row grain: ${reg.row_grain}. Grain key${reg.grain_keys?.length === 1 ? "" : "s"}: ${(Array.isArray(reg.grain_keys) ? reg.grain_keys : []).join(", ")}.`);
  } else if (reg?.row_grain) {
    basisNotes.push(`Declared row grain not verified: ${reg.row_grain}. ${reg.grain_verification_reason || "No live verification receipt was returned."} No total is certified.`);
  } else {
    basisNotes.push("No verified row-grain contract governs this page. Numeric values are exported as row facts; no total is certified.");
  }
  if (allNames.includes("weight_basis")) {
    basisNotes.push("This report carries weight_basis on every row. Pounds are only added within a single basis; a mixed group is refused, never silently summed.");
  }
  const basisNote = basisNotes.join(" ");

  const groups = useMemo(() => {
    if (!groupBy || !rows) return null;
    const m = new Map();
    for (const r of rows) {
      const k = r[groupBy] == null || r[groupBy] === "" ? "(not recorded)" : String(r[groupBy]);
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(r);
    }
    return [...m.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [groupBy, rows]);

  const measureGovernance = useMemo(
    () => classifyReportMeasures(shown, cols, reg),
    [shown, cols, reg]);
  const measureCols = measureGovernance.summable.map((row) => row.name);
  const certifiedPopulation = certifiedPopulationVerdict({
    rows, total, truncated,
    contractDigest: reg?.contract_digest,
    rowsContractDigest,
    snapshotVerified: reg?.population_snapshot_verified,
    snapshotId: reg?.population_snapshot_id,
    snapshotReason: reg?.population_snapshot_reason,
  });
  const screenMeasureVerdicts = [
    ...measureGovernance.summable.map((row) => `${rpLabel(row.name)}: ${certifiedPopulation.verified ? "CERTIFIED SUM" : `REFUSED — ${certifiedPopulation.reason}`}`),
    ...measureGovernance.refused.map((row) => `${rpLabel(row.name)}: REFUSED — ${row.reason}`),
    ...measureGovernance.displayOnly.map((row) => `${rpLabel(row.name)}: DISPLAY ONLY`),
  ].join(" | ") || "No numeric field shown";

  /* AN EXPORT THAT IS 20% OF THE TABLE AND DOES NOT SAY SO — 19 Aug 2026.
     withFullRows already computed the truncation flag and handed it to the
     callback; every one of the four export buttons dropped it, and exportMeta
     fell back to the component's `truncated` STATE, which only the on-screen
     read ever writes. So exporting a 255,193-row object without first pressing
     "Load all" wrote a header saying "Rows in this export: 50000" with no
     warning line — the WARNING is gated on meta.truncated. Four registered
     objects exceed the ceiling today, and these files carry their own
     provenance into audits. `wasTruncated` is now a required argument: pass
     null only when the count is genuinely known to be complete. */
  const exportMeta = (result) => {
    const selection = selectReportContract(result.proofRows, table, entry.view_key);
    const exportContract = selection.contract;
    const exportPopulation = certifiedPopulationVerdict({
      rows: result.rows, total: result.total, truncated: result.truncated,
      contractDigest: exportContract?.contract_digest,
      rowsContractDigest: exportContract?.contract_digest,
      snapshotVerified: exportContract?.population_snapshot_verified,
      snapshotId: exportContract?.population_snapshot_id,
      snapshotReason: exportContract?.population_snapshot_reason,
    });
    const exportPolicies = classifyReportMeasures(shown, cols, exportContract);
    const verdicts = [
      ...exportPolicies.summable.map((policy) => {
        const grain = loadedGrainVerdict(result.rows, exportContract);
        const values = loadedMeasureVerdict(result.rows, exportContract, policy.name);
        const reason = [exportPopulation, grain, values].find((v) => !v.verified)?.reason;
        return `${policy.name}: ${reason ? `REFUSED — ${reason}` : "CERTIFIED SUM"}`;
      }),
      ...exportPolicies.refused.map((policy) => `${policy.name}: REFUSED — ${policy.reason}`),
      ...exportPolicies.displayOnly.map((policy) => `${policy.name}: DISPLAY ONLY — not a registered measure`),
    ];
    return {
      title, table, reportKey: exportContract?.report_key ?? null, sentence,
      rowCount: result.rows.length, matchingRows: result.total,
      generated: new Date().toString(), ownerNote, basisNote, groupBy: groupBy || null,
      truncated: result.truncated, contractDigest: exportContract?.contract_digest ?? null,
      contractObservedAt: exportContract?.contract_observed_at ?? null,
      contractStatus: result.proofError || (selection.ambiguous ? "REFUSED — ambiguous contract" : exportContract?.grain_verification_reason || "UNREGISTERED — no total certified"),
      measureVerdicts: verdicts.join(" | ") || "No numeric field shown",
      slug: `${(exportContract?.report_key ?? entry.view_key)}-${new Date().toISOString().slice(0, 10)}`,
    };
  };

  const withFullRows = async (fn) => {
    setMsg("Reading every row that matches these filters…");
    /* A forensic export is a new evidence event. Never reuse an older complete-
       looking browser population: the source row count or values may have
       changed since it was loaded. fetchRows obtains a fresh exact count and
       re-verifies the contract only after the final exported row is read. */
    const r = await fetchRows(true);
    if (r.error) { setMsg(`Export failed — the query errored: ${r.error}`); return; }
    setMsg(null);
    fn(r);
  };

  /* An application screen is not a report. It has no data object by design, so
     it must not be given a report toolbar - that would be a control that cannot
     work, which is worse than no control. */
  if (!table) {
    return (
      <>
        <div className="pagehead">
          <div><h1>{entry.label}</h1><div className="sub">{entry.description}</div></div>
          {actions}
        </div>
        <div className="empty">
          <div className="eicon">{iconByName(entry.icon)}</div>
          <b>This page has no data object registered against it</b>
          {entry.label} is registered in the menu but no table or view is named in <b>table_ref</b>, so there is
          nothing to filter, search, sort or export. That is a registration gap, not a failure of this page.
          {entry.milestone ? ` Data is expected in ${entry.milestone}.` : ""}
        </div>
      </>
    );
  }

  const shownCols = shown.filter((n) => allNames.includes(n));
  const hiddenCount = cols.length - shownCols.length;

  const Reconcile = ({ list }) => {
    const hasGovernanceMessage = measureGovernance.refused.length || measureGovernance.displayOnly.length || rowsContractError;
    if (!measureCols.length && !hasGovernanceMessage) return null;
    const displayNames = measureGovernance.displayOnly.map((row) => rpLabel(row.name));
    return (
      <div className="statchips" style={{ margin: "4px 0 8px" }}>
        {measureCols.map((mc) => {
          const s = rpSubtotal(list, mc, allNames, reg, certifiedPopulation);
          return s.refused
            ? <span key={mc} className="schip bad" title={s.why}>{rpLabel(mc)}: total refused — {s.why}</span>
             : <span key={mc} className="schip good">{rpLabel(mc)}: <b>{rpNum(s.value)}</b> across {s.count?.toLocaleString()} rows</span>;
        })}
        {measureGovernance.refused.map((row) => (
          <span key={row.name} className="schip bad" title={row.reason}>
            {rpLabel(row.name)}: total refused — {row.reason}
          </span>
        ))}
        {displayNames.length > 0 && (
          <span className={reg ? "schip" : "schip bad"}>
            {reg ? "Display-only numeric fields" : "Totals refused — no unique grain contract"}: {displayNames.join(", ")}
          </span>
        )}
        {rowsContractError && <span className="schip bad">Post-read contract verification failed: {rowsContractError}</span>}
        <span className="schl">only approved row-grain measures are totaled — raw rows and drills remain visible</span>
      </div>
    );
  };

  return (
    <>
      {drill && (
        <RpAuditDrill row={drill} onClose={() => setDrill(null)} onTag={(t) => setDrill({ package_tag: t })}
          context={{
            title, table, reportKey: reg?.report_key ?? null, sentence, ownerNote,
            loadedRows: rows?.length ?? 0, matchingRows: total, truncated,
            totalVerdict: certifiedPopulation.verified ? "CERTIFIED POPULATION" : `REFUSED — ${certifiedPopulation.reason}`,
            contractDigest: reg?.contract_digest, contractObservedAt: reg?.contract_observed_at,
            snapshotId: reg?.population_snapshot_id, measureVerdicts: screenMeasureVerdicts,
            reconcileNote: rows ? `${rows.length.toLocaleString()} rows are loaded on the report of ${total?.toLocaleString() ?? "an unknown"} matching these filters.` : null,
          }} />
      )}
      <div className="pagehead">
        <div>
          <h1>{title}</h1>
          <div className="sub">{reg?.description ?? entry.description}</div>
        </div>
        {entry.milestone && <span className="pill gold">data loads {entry.milestone}</span>}
        {actions}
      </div>

      {/* The owner note is on the face of the report. It is not decoration —
          it is what stops a user publishing a wrong number. */}
      {ownerNote && (
        <div className="statchips" style={{ margin: "0 0 10px" }}>
          <span className="schip hot" style={{ whiteSpace: "normal", lineHeight: 1.4 }}>
            <b>Read before you use this report — </b>{ownerNote}
          </span>
        </div>
      )}
      {registryError && <div className="schip bad">The live report-grain registry could not be verified: {registryError}. Rows below are derived from the object itself; every total is refused.</div>}
      {regSelection.ambiguous && (
        <div className="schip bad">
          Totals refused: {regSelection.matches} enabled report contracts point to {table}, but this page names no unique contract. The rows remain available; no contract was guessed.
        </div>
      )}

      <RpReportHeader
        title={title}
        reportKey={reg?.report_key ?? null}
        factView={table}
        dateCol={dateCol}
        from={dFrom}
        to={dTo}
        presetKey={preset}
        readAt={readAt}
        total={total} />

      <div className="modhead">
        <div className="mchip">{iconByName(entry.icon)}</div>
        <div>
          <div className="mt">{title}</div>
          <div className="md">
            Live {reg ? "registered report" : "object"}: {table}
            {reg ? ` · report_registry key ${reg.report_key}` : " · not in report_registry, so its filters are derived from its own columns"}
            {" · click any row for the full audit drill"}
          </div>
        </div>
        <div className="mcount">
          <div className="n">{total === null ? (busy ? "…" : "—") : total.toLocaleString()}</div>
          <div className="l">{dirty ? "records match" : "records"}</div>
        </div>
      </div>

      <RpSavedViews viewKey={entry.view_key} session={session}
        state={{ shown, filters: { search, dateCol, dFrom, dTo, columnFilters: filters }, groupBy }}
        apply={(v) => {
          if (!v) { setSearch(""); setSearchLive(""); setFilters([]); setDFrom(""); setDTo(""); setGroupBy(""); return; }
          const f = v.filters ?? {};
          setSearch(f.search ?? ""); setSearchLive(f.search ?? "");
          setDateCol(f.dateCol ?? dateCol); setDFrom(f.dFrom ?? ""); setDTo(f.dTo ?? "");
          setFilters(Array.isArray(f.columnFilters) ? f.columnFilters : []);
          setGroupBy(v.group_by ?? "");
          if (Array.isArray(v.shown_fields) && v.shown_fields.length) setShown(v.shown_fields);
        }} />

      {/* THE ONE TOOLBAR. Same order, same wording, same position, every report. */}
      <div className="filterbar">
        <input aria-label="Search every text column on this report" className="fsearch" placeholder="Search every text column on this report…" value={searchLive}
          onChange={(e) => setSearchLive(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") setSearch(searchLive); }} />
        <button className="btn small" onClick={() => setSearch(searchLive)}>Find</button>

        {/* Owner ruling 8 Aug 2026: OMIT the control where a date is meaningless.
            A dead control on a hundred pages teaches people to ignore controls.
            But "omit" must never hide a defect, so the two cases are read from
            `nav_registry.date_policy` rather than inferred from a missing column:
            not_applicable = omit in silence · auto/missing with no date = a DEFECT
            in the view, stated plainly here and never dressed up as a feature. */}
        {dateCols.length > 0 ? (
          <>
            <select aria-label="Date column to filter on" className="fdate" value={dateCol ?? ""} onChange={(e) => setDateCol(e.target.value)}
              title="Which date this range applies to">
              {dateCols.map((c) => <option key={c} value={c}>{rpLabel(c)}</option>)}
            </select>
            <DateRangeSelect label="range" from={dFrom} to={dTo} onFrom={setDFrom} onTo={setDTo}
              onPreset={setPreset} presetKey={preset} autoDefault={false} />
            <button className="btn small ghost" title="Save the range now showing as your default"
              onClick={() => setPanel(panel === "datedefault" ? null : "datedefault")}>
              Default{dateDefault.source ? ` · ${dateDefault.source}` : ""}
            </button>
          </>
        ) : entry.date_policy === "not_applicable" ? null
          /* THE CHIP THAT CRIED WOLF — 19 Aug 2026. `dateCols` is derived from the
             VALUES the 200-row probe returned, so it is empty in three completely
             different situations and this branch called all three a defect in the
             view. It fired while the probe was still in flight, so the red chip
             flashed on every `auto` page on every navigation; it fired on top of
             the permission panel when the object could not be read at all; and it
             fired on at least 97 registered objects that hold a real date column
             and simply have no rows yet. A defect chip that is usually wrong
             trains the company to ignore defect chips. Each state now says which
             one it is, and only the last of them is a defect. */
          : probe === null ? null
          : probeError ? null
          : probe.length === 0 ? (
            <span className="schip" style={{ whiteSpace: "normal" }}
              title="Not a defect. The object is readable and holds no rows yet.">
              No date range yet — {table} has no rows, so no date column could be read from it.
              This is not a defect: the control returns as soon as the object holds data.
            </span>
          ) : (
          <span className="schip bad" style={{ whiteSpace: "normal" }}
            title="Fix the view, do not omit the control.">
            <b>Defect — no date range possible. </b>
            {table} returns rows but no date column, and its source carries one. The control is not shown
            because it could not work; the fix belongs in the view, not on this page.
          </span>
        )}

        <button className={`btn small ${filters.length ? "" : "ghost"}`} onClick={() => setPanel(panel === "filters" ? null : "filters")}>
          Filters{filters.length ? ` (${filters.length})` : ""}
        </button>
        <select aria-label="Group rows by" className="fdate" value={groupBy} onChange={(e) => setGroupBy(e.target.value)} title="Group the rows and subtotal each group">
          <option value="">No grouping</option>
          {dimCols.map((d) => <option key={d} value={d}>Group by {rpLabel(d)}</option>)}
        </select>
        <button className="btn small ghost" onClick={() => setPanel(panel === "fields" ? null : "fields")}>
          Columns ({shownCols.length}/{cols.length})
        </button>
        {(dirty || sort || groupBy) && (
          <button className="btn small ghost" onClick={() => {
            setSearch(""); setSearchLive(""); setFilters([]); setDFrom(""); setDTo(""); setSort(null); setGroupBy("");
          }}>Clear</button>
        )}
        <span style={{ flex: 1 }} />
        <button className="btn small ghost" title="Comma Separated Values, carrying these filters"
          onClick={() => withFullRows((r) => rpExportCsv(r.rows, shownCols, exportMeta(r)))}>Comma Separated Values</button>
        <button className="btn small ghost" title="Microsoft Excel workbook, carrying these filters"
          onClick={() => withFullRows((r) => rpExportExcel(r.rows, shownCols, exportMeta(r)))}>Excel</button>
        <button className="btn small ghost" title="Opens the print dialogue — choose Save as PDF"
          onClick={() => withFullRows((r) => { const e2 = rpExportPdf(r.rows, shownCols, exportMeta(r)); if (e2) setMsg(e2); })}>PDF</button>
        <button className="btn small ghost" title="Copies the filtered report and opens a blank Google Sheet to paste into. Nothing is uploaded automatically."
          onClick={() => withFullRows(async (r) => setMsg(await rpExportSheets(r.rows, shownCols, exportMeta(r))))}>Google Sheets</button>
      </div>

      {dateDefault.error && <div className="empty" role="alert">{dateDefault.error} No report rows were queried without it.</div>}
      {msg && <div className="statchips"><span className="schip info" style={{ whiteSpace: "normal" }}>{msg}</span></div>}
      {panel === "datedefault" && (
        <div className="findpanel" style={{ padding: 12 }}>
          <div className="dhead">
            <span className="dtitle">Your default date range</span>
            <button className="btn small ghost" onClick={() => setPanel(null)}>Close</button>
          </div>
          <div className="note" style={{ marginBottom: 8 }}>
            This report opened on <b>{(dateDefault.presetKey ?? "not resolved").replaceAll("_", " ")}</b>, chosen by
            “<b>{dateDefault.source ?? "not resolved"}</b>”.
            The range showing now is <b>{preset ? preset.replaceAll("_", " ") : "custom"}</b>
            {dFrom || dTo ? ` (${dFrom || "earliest"} to ${dTo || "latest"})` : ""}.
          </div>
          <button className="btn small" onClick={() => saveDateDefault(false)}>Make this my default for this page</button>
          {" "}
          <button className="btn small ghost" onClick={() => saveDateDefault(true)}>Make this my default everywhere</button>
          <div className="note" style={{ marginTop: 8 }}>
            A page default beats an everywhere default, and both beat the page’s own. Nobody else is affected —
            these are yours alone.
          </div>
        </div>
      )}
      {panel === "fields" && <RpFieldsPanel cols={cols} shown={shownCols} setShown={setShown} onClose={() => setPanel(null)} />}
      {panel === "filters" && <RpFiltersPanel cols={cols} filters={filters} setFilters={setFilters} onClose={() => setPanel(null)} />}

      {dirty && (
        <div className="statchips">
          <span className="schip info" style={{ whiteSpace: "normal" }}><b>Filters in force: </b>{sentence}</span>
        </div>
      )}
      {hiddenCount > 0 && (
        <div className="note" style={{ margin: "4px 0" }}>
          {hiddenCount} further column{hiddenCount === 1 ? " is" : "s are"} held on this object and not shown — open Columns to add {hiddenCount === 1 ? "it" : "them"}. Nothing has been dropped.
        </div>
      )}

      {/* A failed query must never look like an empty table. */}
      {probeError && (
        <div className="empty">
          <div className="eicon">{I.shield}</div>
          <b>This report could not be opened</b>
          <div>The database refused the read on <b>{table}</b>: {probeError}</div>
          <div className="note" style={{ marginTop: 8 }}>
            This is a permission or definition problem on the object, not a filter you have set. Nothing is being hidden from you — there is simply no answer to show.
          </div>
        </div>
      )}
      {error && !probeError && (
        <div className="empty">
          <div className="eicon">{I.shield}</div>
          <b>The query failed</b>
          <div>{error}</div>
          <div className="note" style={{ marginTop: 8 }}>The filters you set produced a query the database rejected. Press Clear and add them back one at a time.</div>
        </div>
      )}

      {!probeError && !error && (
        rows === null ? <div className="empty"><div className="eicon">{I.gauge}</div>Reading {table}…</div>
        : rows.length === 0 ? (
          <div className="empty">
            <div className="eicon">{iconByName(entry.icon)}</div>
            <b>{dirty ? "No rows match these filters" : "No records on this object yet"}</b>
            {dirty
              ? <>The query succeeded and returned nothing. Filters in force: {sentence}. Adjust them or press Clear.</>
              : <>The object <b>{table}</b> is readable and returned zero rows. Records appear here the moment they exist — no sample data will ever be shown.</>}
          </div>
        ) : (
          <>
            {truncated && (
              <div className="statchips"><span className="schip bad" style={{ whiteSpace: "normal" }}>
                Only the first {RP_ROW_CEILING.toLocaleString()} rows were read. Totals and exports below are INCOMPLETE — narrow the filters or the date range.
              </span></div>
            )}
            {!loadAll && !groupBy && total != null && total > rows.length && (
              <div className="statchips">
                <span className="schip warn" style={{ whiteSpace: "normal" }}>
                  Showing the first {rows.length.toLocaleString()} of {total.toLocaleString()} matching rows. Nothing has been filtered out.
                </span>
                <button className="btn small" onClick={() => setLoadAll(true)}>Load all {total.toLocaleString()} rows</button>
              </div>
            )}
            <Reconcile list={rows} />

            {groups ? groups.map(([key, list]) => (
              <div key={key} style={{ marginBottom: 12 }}>
                <button className="vegrouphead" style={{ width: "100%", textAlign: "left" }}
                  onClick={() => setCollapsed((s) => ({ ...s, [key]: !s[key] }))}>
                  <span className="vegchip" style={{ background: "var(--neon)", color: "var(--neon-ink)" }}>{rpLabel(groupBy)}: {key}</span>
                  <b style={{ marginLeft: 8 }}>{list.length.toLocaleString()} rows</b>
                  <span style={{ float: "right" }}>{collapsed[key] ? "+" : "−"}</span>
                </button>
                <Reconcile list={list} />
                {!collapsed[key] && (
                  <div className="tablewrap"><table>
                    <thead><tr>{shownCols.map((c) => (
                      <th key={c} style={{ cursor: "pointer" }} title="Sort on this column"
                        onClick={() => setSort((s) => s?.col === c ? { col: c, asc: !s.asc } : { col: c, asc: true })}>
                        {rpLabel(c)}{sort?.col === c ? (sort.asc ? " ↑" : " ↓") : ""}
                      </th>
                    ))}</tr></thead>
                    <tbody>{list.map((r, i) => (
                      <tr key={i} style={{ cursor: "pointer" }} onClick={() => setDrill(r)} title="Open the full audit drill">
                        {shownCols.map((c) => <td key={c}>{cellView(c, r[c])}</td>)}
                      </tr>
                    ))}</tbody>
                  </table></div>
                )}
              </div>
            )) : (
              <div className="tablewrap"><table>
                <thead><tr>{shownCols.map((c) => (
                  <th key={c} style={{ cursor: "pointer" }} title="Sort on this column"
                    onClick={() => setSort((s) => s?.col === c ? { col: c, asc: !s.asc } : { col: c, asc: true })}>
                    {rpLabel(c)}{sort?.col === c ? (sort.asc ? " ↑" : " ↓") : ""}
                  </th>
                ))}</tr></thead>
                <tbody>{rows.map((r, i) => (
                  <tr key={i} style={{ cursor: "pointer" }} onClick={() => setDrill(r)} title="Open the full audit drill">
                    {shownCols.map((c) => <td key={c}>{cellView(c, r[c])}</td>)}
                  </tr>
                ))}</tbody>
              </table></div>
            )}
          </>
        )
      )}
    </>
  );
}

function ModuleScreen({ entry, actions, session }) {
  return <ReportScreen entry={entry} actions={actions} session={session} />;
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
/* ---------- Shared search / date-range / export toolbar ----------
   ModuleScreen builds this for every generic page, but the 35 hand-built pages in
   the `special` map had none — the Metrc Mirror had no search at all. Rather than
   patch each page separately and let them drift apart again, this is one component
   they all adopt. Same classes and the same DateRangeSelect as the generic bar, so
   it looks and behaves identically wherever it appears.

   Server-side by design: it filters the query, not a page of rows already
   fetched, so searching finds records beyond the current page. */
function useDataToolbar(table, { eq = {}, limit = 200, orderBy = null, ascending = false } = {}) {
  const eqKey = JSON.stringify(eq);
  const [rows, setRows] = useState(null);
  const [sample, setSample] = useState(null);
  const [total, setTotal] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [qLive, setQLive] = useState("");
  const [q, setQ] = useState("");
  const [dFrom, setDFrom] = useState("");
  const [dTo, setDTo] = useState("");
  const [dateReady, setDateReady] = useState(false);
  const [dims, setDims] = useState([]);
  const [dimSel, setDimSel] = useState({});

  /* one row, to learn the shape: which columns are searchable text and which
     column the date filter should use. Same rule the generic renderer applies. */
  useEffect(() => {
    setSample(null); setRows(null); setLoadError(null); setQ(""); setQLive(""); setDimSel({});
    if (!table) return;
    let s = supabase.from(table).select("*").limit(1);
    for (const [k, v] of Object.entries(JSON.parse(eqKey))) if (v != null) s = s.eq(k, v);
    s.then(({ data, error }) => {
      if (error) { setLoadError(error.message); setSample({}); return; }
      setSample(data?.[0] ?? {});
    });
  }, [table, eqKey]);

  const textCols = sample
    ? Object.keys(sample).filter((k) => typeof sample[k] === "string" && k !== "raw").slice(0, 8)
    : [];
  const dateCol = sample
    ? Object.keys(sample).find((k) => /(_date|_on$|_on_|_at$|^date|^month|period)/.test(k))
    : null;

  const build = (base) => {
    let x = base;
    for (const [k, v] of Object.entries(JSON.parse(eqKey))) if (v != null) x = x.eq(k, v);
    for (const [col, want] of Object.entries(dimSel)) if (want) x = x.eq(col, want);
    const term = q.replace(/[%,()]/g, " ").trim();
    if (term && textCols.length) x = x.or(textCols.map((c) => `${c}.ilike.%${term}%`).join(","));
    if (dateCol && dFrom) x = x.gte(dateCol, dFrom);
    if (dateCol && dTo) x = x.lt(dateCol, dateUpperExclusive(dTo));
    return x;
  };

  /* Distinct values for each dimension the dataset actually has, so the dropdowns
     offer real options rather than a guess. One small query per column. */
  useEffect(() => {
    if (!table || !sample) { setDims([]); return; }
    const cands = DIM_COLS.filter((c) => c in sample);
    if (!cands.length) { setDims([]); return; }
    let cancelled = false;
    Promise.all(cands.map(async (col) => {
      let s = supabase.from(table).select(col).not(col, "is", null).limit(1000);
      for (const [k, v] of Object.entries(JSON.parse(eqKey))) if (v != null) s = s.eq(k, v);
      const { data } = await s;
      const values = [...new Set((data ?? []).map((r) => r[col]).filter((v) => v !== ""))].map(String).sort();
      return { col, values };
    })).then((all) => {
      if (!cancelled) setDims(all.filter((d) => d.values.length > 1 && d.values.length <= 12));
    });
    return () => { cancelled = true; };
     
  }, [table, eqKey, sample]);

  useEffect(() => {
    if (!table || sample === null || (dateCol && !dateReady)) return;
    setRows(null);
    build(supabase.from(table).select("*", { count: "exact" }))
      .order(orderBy ?? (sample && "id" in sample ? "id" : (dateCol ?? textCols[0] ?? "")), { ascending })
      .limit(limit)
      .then(({ data, count, error }) => {
        if (error) { setLoadError(error.message); setRows(null); setTotal(null); return; }
        setLoadError(null); setRows(data ?? []); setTotal(count ?? null);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table, eqKey, sample, q, dFrom, dTo, dateReady, limit, orderBy, ascending, JSON.stringify(dimSel)]);

  const exportCsv = async () => {
    const { data } = await build(supabase.from(table).select("*")).limit(5000);
    const list = data ?? [];
    if (!list.length) return;
    const keys = Object.keys(list[0]).filter((k) => k !== "raw" && typeof list[0][k] !== "object");
    const esc = (v) => v == null ? "" : /[",\n]/.test(String(v)) ? '"' + String(v).replaceAll('"', '""') + '"' : String(v);
    const csv = [keys.join(","), ...list.map((r) => keys.map((k) => esc(r[k])).join(","))].join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `${table}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  };

  const dirty = !!(q || dFrom || dTo || Object.values(dimSel).some(Boolean));
  const toolbar = sample === null ? null : (
    <FilterBar qLive={qLive} setQLive={setQLive} onFind={() => setQ(qLive)}
      dateCol={dateCol} dFrom={dFrom} dTo={dTo} setDFrom={setDFrom} setDTo={setDTo}
      onDateReady={() => setDateReady(true)}
      dims={dims} dimSel={dimSel}
      onDim={(col, v) => setDimSel((x) => ({ ...x, [col]: v }))}
      dirty={dirty}
      onClear={() => { setQ(""); setQLive(""); setDFrom(""); setDTo(""); setDimSel({}); }}
      count={total} onExport={exportCsv} loadError={loadError} />
  );

  return { rows, toolbar, total, dateCol, searching: dirty };
}

/* Date-range predicate for pages that keep their own filtering. Compares the
   date part only, so a timestamp is not excluded by its time of day. */
function inRange(value, from, to) {
  if (!from && !to) return true;
  if (!value) return false;
  const d = String(value).slice(0, 10);
  if (from && d < from) return false;
  if (to && d > to) return false;
  return true;
}

/* The bar itself, so the server-side and client-side hooks render exactly the same
   control. Same classes and the same DateRangeSelect the generic pages use. */
/* Columns worth offering as a dropdown. Origin answers "ours or bought in",
   status and state answer "sold, on hand, or gone", verdict answers "passed or
   failed". These are the questions asked of almost every list here. */
const DIM_COLS = ["stock_status", "origin", "stream", "category", "status", "state",
  "source_state", "verdict", "severity", "direction", "lab_state", "lab_testing_state",
  "phase", "supplier", "room", "current_stage", "stage", "delivery_status", "decision",
  "priority", "license", "location", "doc_type", "testing_state", "origin_license",
  "strain", "cultivar", "item_name", "product", "trading_status", "decision_state",
  "manifest_direction", "coa_status", "origin_type", "unit_of_measure"];

function FilterBar({ qLive, setQLive, onFind, dateCol, dFrom, dTo, setDFrom, setDTo,
                     dirty, onClear, count, countLabel = "records", onExport,
                     dims = [], dimSel = {}, onDim, onDateReady, loadError }) {
  return (
    <div className="filterbar">
      <input aria-label="Search" className="fsearch" placeholder="Search anything — name, batch, tag…" value={qLive}
        onChange={(e) => setQLive(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") onFind(); }} />
      <button className="btn small" onClick={onFind}>Find</button>
      {dims.map(({ col, values }) => (
        <span key={col} style={{ display: "contents" }}>
          <span className="flab">{col.replaceAll("_", " ")}</span>
          <select aria-label="Filter value" className="fdate" value={dimSel[col] ?? ""}
            onChange={(e) => onDim(col, e.target.value || null)}>
            <option value="">All</option>
            {values.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
        </span>
      ))}
      {dateCol
        ? <DateRangeSelect label={dateCol.replaceAll("_", " ")} from={dFrom} to={dTo}
            onFrom={setDFrom} onTo={setDTo} onReady={onDateReady} />
        : <span className="flab" title="This dataset carries no date column, so there is nothing to filter by.">no date recorded on this dataset</span>}
      {dirty && <button className="btn small ghost" onClick={onClear}>Clear</button>}
      <span style={{ flex: 1 }} />
      {count != null && <span className="flab">{count.toLocaleString()} {countLabel}</span>}
      {onExport && <button className="btn small ghost" onClick={onExport}>Export CSV</button>}
      <button className="btn small ghost" onClick={() => window.print()}>Print</button>
      {loadError && <span className="note bad" role="alert">The filtered records could not be read: {loadError}</span>}
    </div>
  );
}

/* Client-side variant, for pages that already hold every row and group or total
   them — GoLiveScreen counts done against the whole list, so filtering server-side
   would quietly change what its progress bar means. This filters what is shown
   while the page keeps its own totals over the full set. */
function useClientToolbar(rows, { dateField = null, name = "rows" } = {}) {
  const [qLive, setQLive] = useState("");
  const [q, setQ] = useState("");
  const [dFrom, setDFrom] = useState("");
  const [dTo, setDTo] = useState("");
  const [dateReady, setDateReady] = useState(false);
  const [dimSel, setDimSel] = useState({});
  const list = rows ?? [];
  const dateCol = dateField ?? (list.length
    ? Object.keys(list[0]).find((k) => /(_date|_on$|_on_|_at$|^date|^month|period)/.test(k))
    : null);

  /* Offer a dropdown for any dimension column that actually varies. More than a
     dozen distinct values is a list, not a filter, so it is left out. */
  const dims = list.length
    ? DIM_COLS
        .filter((c) => c in list[0])
        .map((col) => ({
          col,
          values: [...new Set(list.map((r) => r[col]).filter((v) => v != null && v !== ""))]
                    .map(String).sort(),
        }))
        .filter((d) => d.values.length > 1 && d.values.length <= 12)
    : [];

  const term = q.trim().toLowerCase();
  const filtered = (dateCol && !dateReady ? [] : list).filter((r) => {
    if (term) {
      const hit = Object.entries(r).some(([k, v]) =>
        k !== "raw" && typeof v === "string" && v.toLowerCase().includes(term));
      if (!hit) return false;
    }
    for (const [col, want] of Object.entries(dimSel)) {
      if (want && String(r[col] ?? "") !== want) return false;
    }
    if (dateCol && (dFrom || dTo)) {
      const v = r[dateCol];
      if (!v) return false;
      const d = String(v).slice(0, 10);
      if (dFrom && d < dFrom) return false;
      if (dTo && d > dTo) return false;
    }
    return true;
  });

  const dirty = !!(q || dFrom || dTo || Object.values(dimSel).some(Boolean));
  const exportCsv = () => {
    if (!filtered.length) return;
    const keys = Object.keys(filtered[0]).filter((k) => k !== "raw" && typeof filtered[0][k] !== "object");
    const esc = (v) => v == null ? "" : /[",\n]/.test(String(v)) ? '"' + String(v).replaceAll('"', '""') + '"' : String(v);
    const csv = [keys.join(","), ...filtered.map((r) => keys.map((k) => esc(r[k])).join(","))].join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `${name}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  };

  const toolbar = (
    <FilterBar qLive={qLive} setQLive={setQLive} onFind={() => setQ(qLive)}
      dateCol={dateCol} dFrom={dFrom} dTo={dTo} setDFrom={setDFrom} setDTo={setDTo}
      onDateReady={() => setDateReady(true)}
      dims={dims} dimSel={dimSel}
      onDim={(col, v) => setDimSel((s) => ({ ...s, [col]: v }))}
      dirty={dirty}
      onClear={() => { setQ(""); setQLive(""); setDFrom(""); setDTo(""); setDimSel({}); }}
      count={dirty ? filtered.length : null} countLabel={"of " + list.length + " shown"}
      onExport={exportCsv} />
  );

  return { filtered, toolbar, filtering: dirty };
}

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
  /* rows now come from the shared toolbar, so this page gains search, a date
     range, record count, CSV export and print — and the search reaches the whole
     dataset, not just the rows already on screen. */
  const { rows: toolbarRows, toolbar } = useDataToolbar(tab, {
    eq: { license: license ?? null }, limit: 200,
  });
  useEffect(() => { setRows(toolbarRows); }, [toolbarRows]);
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
      {toolbar}
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
/* THE CONTROL TOWER'S OWN COUNT TILES, AND THE ZERO THEY USED TO INVENT.
 *
 * This read was `.then(({ count }) => count ?? 0)`. `error` was never bound, so
 * a permission denial, a dropped table and a statement timeout all arrived as
 * `count === null` and were published to the landing page as the number ZERO,
 * beside the word "records", on a card that drills into the table. Zero
 * packages. Zero plants. Zero employees. Indistinguishable from the truth, and
 * more alarming than it.
 *
 * IT IS WORSE WITH A HEAD REQUEST, WHICH IS WHAT THIS WAS. Measured in a live
 * browser on 15 Aug 2026 against v_plant_census with an unauthorised key:
 *
 *     select(..., { count: "exact", head: true })  ->  { count: null, error: { message: "" } }
 *     select(..., { count: "exact" }).limit(0)     ->  { count: null, error: { message:
 *                                                       "permission denied for view …", code: "42501" } }
 *
 * A HEAD response carries no body, so PostgREST has nowhere to put its message
 * and supabase-js hands back an error whose message is the EMPTY STRING. Any
 * branch testing the message reads it as no error at all. `limit(0)` moves no
 * rows either, still returns the exact count in the Content-Range header, and
 * on refusal returns the reason and its SQLSTATE.
 *
 * So each tile now carries either a count or the reason there is none, and the
 * card says which. Twenty more `head: true` count sites remain in this file and
 * in commandcenter.jsx, wcanvas-kinds.jsx and wcanvas-live.jsx; they are
 * reported rather than swept up here, because a sweeping edit across twenty
 * unrelated components is how an unrelated page breaks.
 */
function useLiveCounts() {
  const [c, setC] = useState(null);
  useEffect(() => {
    let live = true;
    Promise.all(KPI_TABLES.map(([t]) =>
      supabase.from(t).select("*", { count: "exact" }).limit(0).then(
        ({ count, error }) => (error
          ? { n: null, err: error.message || `refused with no message${error.code ? ` (${error.code})` : ""}` }
          : { n: count, err: null }),
        (thrown) => ({ n: null, err: String((thrown && thrown.message) || thrown) }),
      )
    )).then((results) => {
      if (!live) return;
      setC(KPI_TABLES.map(([t, l, col, drill, icon], i) =>
        ({ t, l, col, drill, icon, n: results[i].n, err: results[i].err })));
    });
    return () => { live = false; };
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
  { key: "apex", label: "Apex Trading (sales)", fn: "apex-sync", live: true,
    desc: "Orders, buyers, products, batches, deal flow, net terms, COAs — the sales source of record. Read-only. Skips any entity still inside its refresh window, because Apex bills by API credit." },
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
/* Intelligence Briefing. Every finding is a written investigation, not a count.
   Each one answers what, where, who, when, why, how it was found and what to do,
   shows the arithmetic behind the figure, then the evidence records themselves.
   A plain-English section restates it for anyone who is not an operator. */
const fmtWhen = (v) => {
  if (!v) return "not recorded";
  const d = new Date(v);
  if (isNaN(d)) return String(v);
  return d.toLocaleString(undefined, { year: "numeric", month: "short", day: "numeric",
    hour: "numeric", minute: "2-digit" });
};
const fmtDay = (v) => {
  if (!v) return "not recorded";
  const d = new Date(v);
  if (isNaN(d)) return String(v);
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
};

function BriefingReport({ f }) {
  const [tab, setTab] = useState("report");
  const ev = Array.isArray(f.evidence) ? f.evidence : [];
  const cols = ev.length ? Object.keys(ev[0]).slice(0, 8) : [];
  return (
    <div className="brreport">
      <div className="brtabs">
        <button className={tab === "report" ? "on" : ""} onClick={() => setTab("report")}>The investigation</button>
        <button className={tab === "plain" ? "on" : ""} onClick={() => setTab("plain")}>What this means in plain English</button>
        <button className={tab === "evidence" ? "on" : ""} onClick={() => setTab("evidence")}>
          The evidence{ev.length ? ` (${ev.length} records)` : ""}
        </button>
      </div>

      {tab === "report" && (
        <div className="brbody">
          <div className="brq"><label>What was found</label><p>{f.finding}</p></div>
          <div className="brq"><label>Where it is</label><p>{f.where_it_is || "not recorded"}</p></div>
          <div className="brq"><label>Who is accountable</label><p>{f.who_is_accountable || "unassigned — nobody owns this yet"}</p></div>
          <div className="brq"><label>When it started</label><p>{f.when_it_started || "not recorded"}</p></div>
          <div className="brq"><label>Why it matters</label><p>{f.why_it_matters}</p></div>
          <div className="brq"><label>How it was detected</label><p>{f.how_it_was_detected}</p></div>
          <div className="brq"><label>What to do about it</label><p className="brdo">{f.what_to_do}</p></div>
          <div className="brq wide"><label>Where the dollar figure comes from</label>
            <MoneyBasis stream={f.stream_hint} pounds={f.pounds} dollars={f.dollars} go={window.__tgGo} />
          </div>
          {f.the_arithmetic && (
            <div className="brq wide"><label>The arithmetic — how the figure was reached</label>
              <p className="brmath">{f.the_arithmetic}</p></div>
          )}
          <div className="brq wide"><label>Audit trail of this finding</label>
            <p>
              First raised {fmtDay(f.first_found_on)}. Confirmed again on {f.times_found} separate
              sweeps, most recently {fmtDay(f.found_on)}. It has been open {f.days_open} day{f.days_open === 1 ? "" : "s"}.
              {f.records_affected ? ` ${Number(f.records_affected).toLocaleString()} records are affected.` : ""}
              {f.dollars ? ` $${Number(f.dollars).toLocaleString()} is at stake.` : " No dollar figure — the value of this material has not been set."}
              {f.pounds ? ` ${Number(f.pounds).toLocaleString()} pounds involved.` : ""}
            </p>
          </div>
        </div>
      )}

      {tab === "plain" && (
        <div className="brplain">
          <p><b>In one sentence:</b> {f.finding}</p>
          <p><b>Where to look:</b> {f.where_it_is || "the record does not say where"}.</p>
          <p><b>Who needs to answer for it:</b> {f.who_is_accountable || "nobody has been assigned yet, so it is sitting with no owner"}.</p>
          <p><b>Why anyone should care:</b> {f.why_it_matters}</p>
          <p><b>How we know:</b> {f.how_it_was_detected}</p>
          <p><b>The fix:</b> {f.what_to_do}</p>
          <p><b>How long this has been true:</b> it was first spotted on {fmtDay(f.first_found_on)} and has
            come back on {f.times_found} sweeps since. That is {f.days_open} days with nothing changing.</p>
        </div>
      )}

      {tab === "evidence" && (
        ev.length === 0 ? (
          <div className="brnone">
            No individual records are attached to this finding. <b>Why:</b> this finding was
            computed from a total rather than a list, so there is no row-level evidence to show.
            The arithmetic on the investigation tab is the full derivation.
          </div>
        ) : (
          <div className="brevwrap">
            <table className="brev">
              <thead><tr>{cols.map((c) => <th key={c}>{fieldLabel(c)}</th>)}</tr></thead>
              <tbody>
                {ev.map((r, i) => (
                  <tr key={i}>{cols.map((c) => (
                    <td key={c}>{r[c] == null || r[c] === "" ? "not recorded" : String(r[c])}</td>
                  ))}</tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}
    </div>
  );
}

function IntelligenceBriefing({ go }) {
  const [rows, setRows] = useState(null);
  const [open, setOpen] = useState(null);
  const [sev, setSev] = useState("all");
  useEffect(() => {
    supabase.from("v_intelligence_briefing").select("*").then(({ data }) => setRows(data ?? []));
  }, []);
  /* search and date sit alongside the existing severity chips; the chip counts
     still read the full sweep so the totals do not appear to shrink when filtering.

     This MUST stay above the early return. useClientToolbar calls five useState
     hooks, so calling it after "if (!rows) return" changed the hook count between
     the loading render and the loaded one, and React threw "rendered more hooks
     than during the previous render" the moment the data arrived. With no error
     boundary that white-screened the page. It handles a null list itself
     (rows ?? []), so there is nothing to guard against here. */
  const { filtered: searched, toolbar } = useClientToolbar(rows, { name: "intelligence-briefing" });
  if (!rows) return <div className="loading">Reading the latest forensic sweep…</div>;
  const shown = sev === "all" ? searched : searched.filter((r) => r.severity === sev);
  const count = (x) => rows.filter((r) => r.severity === x).length;
  const dollars = rows.reduce((a, r) => a + Number(r.dollars || 0), 0);

  return (
    <div className="brief">
      <div className="pagehead">
        <h1>Intelligence Briefing</h1>
        <p className="dashsub">
          {rows.length} findings from the latest sweep. Every one opens a full written
          investigation — what, where, who, when, why, how it was detected, what to do,
          the arithmetic behind the figure and the records it rests on.
          {dollars > 0 && <> Total at stake: <b>${dollars.toLocaleString()}</b>.</>}
        </p>
      </div>

      {toolbar}
      <div className="brfilter">
        {["all", "critical", "elevated", "watch"].map((k) => (
          <button key={k} className={`brchip ${k} ${sev === k ? "on" : ""}`} onClick={() => setSev(k)}>
            {k === "all" ? `All ${rows.length}` : `${count(k)} ${k}`}
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <div className="brnone">Nothing at this severity in the latest sweep.</div>
      ) : shown.map((f, i) => {
        const id = f.finding + i;
        const isOpen = open === id;
        return (
          <div key={id} className={`brcard ${f.severity}`}>
            <button className="brhead" onClick={() => setOpen(isOpen ? null : id)}>
              <span className={`brsev ${f.severity}`}>{f.severity}</span>
              <span className="brtitle">{f.finding}</span>
              <span className="brnums">
                {f.dollars ? <em className="money">${Number(f.dollars).toLocaleString()}</em> : null}
                {f.pounds ? <em>{Number(f.pounds).toLocaleString()} lb</em> : null}
                {f.records_affected ? <em>{Number(f.records_affected).toLocaleString()} records</em> : null}
                <em className={f.days_open > 14 ? "warn" : ""}>{f.days_open}d open</em>
              </span>
              <span className="brtoggle">{isOpen ? "Close the report ▲" : "Open the full report ▼"}</span>
            </button>
            <div className="brline">
              <span><em>Where</em>{f.where_it_is || "not recorded"}</span>
              <span><em>Who</em>{f.who_is_accountable || "unassigned"}</span>
              <span><em>Since</em>{f.when_it_started || "not recorded"}</span>
              <span><em>Last confirmed</em>{fmtWhen(f.found_on)}</span>
            </div>
            {isOpen && <BriefingReport f={f} />}
          </div>
        );
      })}
    </div>
  );
}

/* Every dollar figure must be able to prove itself. This shows the pounds, the
   rate, where the rate came from, who set it and when — and says plainly when
   nobody has set it, because an unconfirmed rate makes the figure an estimate. */
function MoneyBasis({ stream, pounds, dollars, go }) {
  const [b, setB] = useState(undefined);
  useEffect(() => {
    if (!stream) { setB(null); return; }
    let live = true;
    supabase.from("v_valuation_basis").select("*").eq("stream", stream).maybeSingle()
      .then(({ data }) => { if (live) setB(data ?? null); });
    return () => { live = false; };
  }, [stream]);
  if (b === undefined) return null;
  if (!b)
    return (
      <div className="mbasis warn">
        <b>No rate on file for this stream.</b> The dollar figure could not be derived, so none is
        shown. Set a rate in Valuation Rates and it will appear here and back-fill every record.
      </div>
    );
  const lb = Number(pounds || 0);
  const rate = Number(b.dollars_per_pound);
  return (
    <div className={`mbasis ${b.confirmed ? "" : "warn"}`}>
      <div className="mbformula">
        {lb.toLocaleString()} lb × ${rate.toLocaleString()} per pound ={" "}
        <b>${Math.round(lb * rate).toLocaleString()}</b>
        {dollars != null && Math.abs(Math.round(lb * rate) - Number(dollars)) > 1 && (
          <em className="mbdiff">
            The stored figure is ${Number(dollars).toLocaleString()} — it was calculated before the
            current rate was set.
          </em>
        )}
      </div>
      <div className="mbwhere">{b.provenance}</div>
      {b.overrides_on_this_stream > 0 && (
        <div className="mbwhere">
          {b.overrides_on_this_stream} batch or package override
          {b.overrides_on_this_stream === 1 ? "" : "s"} apply to this stream and are used ahead of
          the flat rate.
        </div>
      )}
      <button className="mbedit" onClick={() => go && go("valuation_rates")}>
        {b.confirmed ? "Change this rate or add a batch override" : "Set the real rate for this stream"}
      </button>
    </div>
  );
}

function ValuationRates({ session }) {
  const [rates, setRates] = useState(null);
  const [ovr, setOvr] = useState([]);
  const [role, setRole] = useState(null);
  const [edit, setEdit] = useState(null);
  const [form, setForm] = useState({});
  const [msg, setMsg] = useState("");
  const [nv, setNv] = useState({ package_tag: "", harvest_name: "", stream: "", dollars_per_pound: "", reason: "" });
  const who = session?.user?.email ?? "unknown";

  const load = async () => {
    const [r, o, u] = await Promise.all([
      supabase.from("v_valuation_basis").select("*").order("stream"),
      supabase.from("valuation_overrides").select("*").order("set_at", { ascending: false }),
      supabase.from("app_users").select("role").eq("user_id", session.user.id).maybeSingle(),
    ]);
    setRates(r.data ?? []);
    setOvr(o.data ?? []);
    setRole(u.data?.role ?? null);
  };
  useEffect(() => { load(); }, []);
  const mayEdit = ["owner", "executive", "planner", "dept_head"].includes(role);

  const save = async (stream) => {
    const v = Number(form.dollars_per_pound);
    if (!v || v <= 0) { setMsg("Enter a rate greater than zero."); return; }
    if (!form.basis || form.basis.trim().length < 10) {
      setMsg("Write the basis — where this number comes from — in at least ten characters. A rate with no basis is the problem we are fixing.");
      return;
    }
    const { error } = await supabase.from("valuation_rates").upsert({
      stream, dollars_per_pound: v, basis: form.basis.trim(),
      source_note: form.source_note?.trim() || null, confirmed: true,
      set_by: who, set_at: new Date().toISOString(), effective_from: new Date().toISOString().slice(0, 10),
    }, { onConflict: "stream,effective_from" });
    setMsg(error ? error.message : `Rate for ${stream} set to $${v} per pound. Every figure using it has been recalculated.`);
    if (!error) { setEdit(null); setForm({}); load(); }
  };

  const addOverride = async () => {
    if (!nv.package_tag && !nv.harvest_name) { setMsg("Name the package tag or the harvest this override applies to."); return; }
    if (!Number(nv.dollars_per_pound)) { setMsg("Enter the rate for this batch."); return; }
    if (!nv.reason || nv.reason.trim().length < 10) { setMsg("Write why this batch is worth a different amount."); return; }
    const { error } = await supabase.from("valuation_overrides").insert({
      package_tag: nv.package_tag || null, harvest_name: nv.harvest_name || null,
      stream: nv.stream || null, dollars_per_pound: Number(nv.dollars_per_pound),
      reason: nv.reason.trim(), set_by: who,
    });
    setMsg(error ? error.message : "Override saved. It is used ahead of the flat rate for that material.");
    if (!error) { setNv({ package_tag: "", harvest_name: "", stream: "", dollars_per_pound: "", reason: "" }); load(); }
  };

  if (!rates) return <div className="loading">Reading the valuation rates…</div>;
  const unconfirmed = rates.filter((r) => !r.confirmed).length;

  return (
    <div className="vrates">
      <div className="pagehead">
        <h1>Valuation Rates — what a pound is worth</h1>
        <p className="dashsub">
          Every money figure on this platform is pounds × a rate from this page. Change a rate here
          and every figure that uses it changes, everywhere, including past records.
          {unconfirmed > 0 && (
            <> <b className="vrwarn">{unconfirmed} of {rates.length} streams still carry the inherited
            $1,100 default that nobody set. Figures using them are estimates.</b></>
          )}
        </p>
      </div>

      {msg && <div className="vrmsg">{msg}</div>}
      {!mayEdit && (
        <div className="vrmsg">
          You can see every rate and its basis, but changing one needs an owner, executive, planner
          or department head. Your role is {role || "not set"}.
        </div>
      )}

      <div className="vrgrid">
        {rates.map((r) => (
          <div key={r.stream} className={`vrcard ${r.confirmed ? "ok" : "warn"}`}>
            <div className="vrhead">
              <span className="vrname">{r.stream}</span>
              <span className={`vrpill ${r.confirmed ? "ok" : "warn"}`}>
                {r.confirmed ? "confirmed" : "nobody set this"}
              </span>
            </div>
            <div className="vrbig">${Number(r.dollars_per_pound).toLocaleString()}<em> per pound</em></div>
            <div className="vrline"><em>Basis</em><b>{r.basis}</b></div>
            <div className="vrline"><em>Set by</em><b>{r.set_by || "nobody"}</b></div>
            <div className="vrline"><em>Set on</em><b>{r.confirmed ? r.set_on : "never"}</b></div>
            <div className="vrline"><em>Batch overrides</em><b>{r.overrides_on_this_stream}</b></div>
            {r.source_note && <p className="vrnote">{r.source_note}</p>}
            {mayEdit && edit !== r.stream && (
              <button className="vrbtn" onClick={() => { setEdit(r.stream); setForm({ dollars_per_pound: r.dollars_per_pound, basis: r.confirmed ? r.basis : "" }); setMsg(""); }}>
                {r.confirmed ? "Change this rate" : "Set the real rate"}
              </button>
            )}
            {mayEdit && edit === r.stream && (
              <div className="vrform">
                <label>Dollars per pound
                  <input aria-label="Dollars per pound" type="number" step="0.01" value={form.dollars_per_pound ?? ""}
                    onChange={(e) => setForm({ ...form, dollars_per_pound: e.target.value })} />
                </label>
                <label>Basis — where this number comes from
                  <input aria-label="Basis for this rate" value={form.basis ?? ""} placeholder="e.g. average of the last six wholesale invoices"
                    onChange={(e) => setForm({ ...form, basis: e.target.value })} />
                </label>
                <label>Anything else worth recording
                  <input aria-label="Source note" value={form.source_note ?? ""} placeholder="optional"
                    onChange={(e) => setForm({ ...form, source_note: e.target.value })} />
                </label>
                <div className="vractions">
                  <button className="vrbtn primary" onClick={() => save(r.stream)}>Save the rate</button>
                  <button className="vrbtn" onClick={() => { setEdit(null); setMsg(""); }}>Cancel</button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {mayEdit && (
        <div className="vrsec">
          <h2>Override a single batch or package</h2>
          <p className="vrsub">
            Use this when one lot is genuinely worth more or less than the stream rate — remediated
            material, a discounted purchase, a premium run. The override is used ahead of the flat
            rate wherever that material appears.
          </p>
          <div className="vrovform">
            <label>Package tag<input aria-label="Package tag" value={nv.package_tag} onChange={(e) => setNv({ ...nv, package_tag: e.target.value })} placeholder="leave blank to use a harvest" /></label>
            <label>Harvest name<input aria-label="Harvest name" value={nv.harvest_name} onChange={(e) => setNv({ ...nv, harvest_name: e.target.value })} placeholder="leave blank to use a package tag" /></label>
            <label>Stream<input aria-label="Stream" value={nv.stream} onChange={(e) => setNv({ ...nv, stream: e.target.value })} placeholder="optional" /></label>
            <label>Dollars per pound<input aria-label="Dollars per pound" type="number" step="0.01" value={nv.dollars_per_pound} onChange={(e) => setNv({ ...nv, dollars_per_pound: e.target.value })} /></label>
            <label className="wide">Why this batch is different<input aria-label="Why this batch is different" value={nv.reason} onChange={(e) => setNv({ ...nv, reason: e.target.value })} placeholder="e.g. bought at a discount to remediate" /></label>
          </div>
          <button className="vrbtn primary" onClick={addOverride}>Save the override</button>
        </div>
      )}

      <div className="vrsec">
        <h2>Overrides on file <span className="vrcount">{ovr.length}</span></h2>
        {ovr.length === 0 ? (
          <p className="vrsub">None yet. Every stream is valued at its flat rate.</p>
        ) : (
          <div className="tablewrap">
            <table>
              <thead><tr><th>Package tag</th><th>Harvest</th><th>Stream</th><th>Dollars per pound</th><th>Why</th><th>Set by</th><th>Set on</th></tr></thead>
              <tbody>
                {ovr.map((o) => (
                  <tr key={o.id}>
                    <td>{o.package_tag || "—"}</td><td>{o.harvest_name || "—"}</td>
                    <td>{o.stream || "any"}</td><td>${Number(o.dollars_per_pound).toLocaleString()}</td>
                    <td>{o.reason}</td><td>{o.set_by}</td><td>{String(o.set_at).slice(0, 10)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

/* Production cost calculator. Every formula is the owner's own, taken from the
   manufacturing production worksheet, with the workbook cell it came from named
   on each line. Nothing is a constant in code — every input is a row anyone with
   permission can change, and every change is kept with who made it and when. */
const money = (n, d = 2) =>
  n == null || !isFinite(n) ? "—" : "$" + Number(n).toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d });
const num = (n, d = 2) =>
  n == null || !isFinite(n) ? "—" : Number(n).toLocaleString(undefined, { maximumFractionDigits: d });

function CalcLine({ label, formula, value, unit, tone }) {
  return (
    <div className={`cline ${tone || ""}`}>
      <span className="clabel">{label}</span>
      <span className="cformula">{formula}</span>
      <span className="cvalue">{value}{unit ? <em> {unit}</em> : null}</span>
    </div>
  );
}

function ProductionCalculator({ session }) {
  const [inp, setInp] = useState(null);
  const [role, setRole] = useState(null);
  const [hist, setHist] = useState([]);
  const [edit, setEdit] = useState(null);
  const [draft, setDraft] = useState("");
  const [msg, setMsg] = useState("");
  const who = session?.user?.email ?? "unknown";

  const load = async () => {
    const [i, u, h] = await Promise.all([
      supabase.from("cost_inputs").select("*").order("sort"),
      supabase.from("app_users").select("role").eq("user_id", session.user.id).maybeSingle(),
      supabase.from("cost_input_history").select("*").order("changed_at", { ascending: false }).limit(40),
    ]);
    setInp(i.data ?? []);
    setRole(u.data?.role ?? null);
    setHist(h.data ?? []);
  };
  useEffect(() => { load(); }, []);
  if (!inp) return <div className="loading">Reading the cost model…</div>;

  const mayEdit = ["owner", "executive", "planner", "dept_head"].includes(role);
  const v = Object.fromEntries(inp.map((r) => [r.key, Number(r.value)]));
  const byKey = Object.fromEntries(inp.map((r) => [r.key, r]));

  const save = async (key) => {
    const n = Number(draft);
    if (!isFinite(n)) { setMsg("Enter a number."); return; }
    const { error } = await supabase.from("cost_inputs")
      .update({ value: n, updated_by: who }).eq("key", key);
    setMsg(error ? error.message
      : `${byKey[key].label} changed from ${byKey[key].value} to ${n}. Every figure below recalculated, and the change is on the record.`);
    if (!error) { setEdit(null); load(); }
  };

  /* ── The owner's formulas, cell for cell ── */
  const trimPerG = v.trim_cost_per_lb / 454;                       // Summary!B7
  const batchCost = v.run_size_g * trimPerG;                       // Summary!B8
  const crudeG = v.crude_yield_pct * v.run_size_g;                 // Summary!B14
  const crudeCostG = (batchCost + v.extraction_labor + v.solvent_cost) / crudeG; // Summary!B15
  const diamondG = crudeG * v.diamond_yield_pct;                   // Summary!B17
  const diamondAlloc = diamondG * crudeCostG + v.proc_labor_diamonds; // Summary!B18
  const diamondPerG = diamondAlloc / diamondG;                     // Summary!B19
  const ldG = diamondG * v.liquid_diamond_factor;                  // Summary!B20
  const ldAlloc = diamondG * crudeCostG + v.proc_labor_diamonds + v.ld_extra_cost; // Summary!B21
  const ldPerG = ldAlloc / ldG;                                    // Summary!B22
  const remainingCrudeG = crudeG * (1 - v.diamond_yield_pct);      // Summary!B24
  const crudeAlloc = remainingCrudeG * crudeCostG + v.proc_labor_badder; // Summary!B25
  const crudePerG = crudeAlloc / remainingCrudeG;                  // Summary!B26

  const badder = (grams, fill) =>
    crudePerG * grams + v.badder_packaging + fill + v.badder_package + v.badder_rd_test + v.badder_compliance;
  const badder1 = badder(1, v.badder_fill_1g);                     // Summary!B35
  const badder35 = badder(3.5, v.badder_fill_35g);                 // Summary!C35

  const vape = (base, terp) =>
    base + terp + v.vape_hardware + v.vape_packaging + v.vape_fill + v.vape_package + v.vape_compliance;
  const vape05 = vape(ldPerG / 2, v.vape_terp_05);                 // Summary!G14
  const vape10 = vape(ldPerG, v.vape_terp_10);                     // Summary!H14

  const curedBase = crudeCostG / 0.877;                            // Summary!G24
  const cured10 = curedBase + v.cured_hardware + v.cured_packaging + v.vape_fill
    + v.cured_package_labor + v.cured_compliance_lot / v.cured_compliance_units; // Summary!G31

  const runsDay = (v.hours_workday - 2) / v.hours_per_run;         // Volatile!B9
  const workdaysYear = v.workdays_week * 52 - v.holidays_year;     // Volatile!B6
  const runsYear = runsDay * workdaysYear;                         // Volatile!B10
  const yieldPct = v.flower_thc * v.extraction_efficiency;         // Volatile!B13
  const biomassDay = v.luna_throughput * runsDay;                  // Volatile!B39
  const biomassWeek = biomassDay * v.workdays_week;                // Volatile!B40
  const oilLbDay = v.luna_throughput * runsDay * yieldPct;         // Volatile!B48
  const oilGDay = oilLbDay * 454;                                  // Volatile!B49
  const inputCostDay = v.operators * v.hours_workday * v.employee_salary
    + v.wholesale_biomass * biomassDay + v.solvent_loss * v.solvent_price; // Volatile!B42
  const costPerGram = inputCostDay / oilGDay;                      // Volatile!B43
  const revenueDay = oilGDay * v.wholesale_oil;                    // Volatile!B44
  const profitDay = revenueDay - inputCostDay;                     // Volatile!B45
  const margin = profitDay / revenueDay;                           // Volatile!B46
  const profitYear = profitDay * workdaysYear;                     // Volatile!D45

  const groups = inp.reduce((m, r) => {
    const k = r.model + " — " + r.section;
    (m[k] = m[k] || []).push(r);
    return m;
  }, {});

  return (
    <div className="calc">
      <div className="pagehead">
        <h1>Production Cost Calculator</h1>
        <p className="dashsub">
          Every formula here is taken from the manufacturing production worksheet, with the workbook
          cell named on each line. Change any input and everything below recalculates immediately.
          Nothing is hardcoded — {inp.length} inputs, all editable by anyone with permission.
        </p>
      </div>

      {msg && <div className="vrmsg">{msg}</div>}
      {!mayEdit && (
        <div className="vrmsg">
          You can see every input and every formula. Changing a cost needs an owner, executive,
          planner or department head. Your role is {role || "not set"}.
        </div>
      )}

      <Section title="What a unit costs to make" defaultOpen>
        <div className="cgrid">
          <div className="ccard">
            <div className="cchead">Cured badder</div>
            <div className="ccbig">{money(badder1)}<em> per 1.0 gram</em></div>
            <div className="ccbig sm">{money(badder35)}<em> per 3.5 gram</em></div>
            <div className="ccnote">Crude at {money(crudePerG, 4)} per gram, plus packaging, fill, packaging labour, research and compliance testing.</div>
          </div>
          <div className="ccard">
            <div className="cchead">Liquid diamond vaporiser</div>
            <div className="ccbig">{money(vape05)}<em> per 0.5 gram</em></div>
            <div className="ccbig sm">{money(vape10)}<em> per 1.0 gram</em></div>
            <div className="ccnote">Base oil at {money(ldPerG, 4)} per gram, plus terpenes, hardware, packaging and labour.</div>
          </div>
          <div className="ccard">
            <div className="cchead">Cured resin vaporiser</div>
            <div className="ccbig">{money(cured10)}<em> per 1.0 gram</em></div>
            <div className="ccnote">Base oil corrected for the 13 percent decarboxylation loss, plus landed hardware and pop top packaging.</div>
          </div>
          <div className="ccard">
            <div className="cchead">Daily line position</div>
            <div className="ccbig">{money(profitDay, 0)}<em> profit per day</em></div>
            <div className="ccbig sm">{num(margin * 100, 1)}%<em> margin</em></div>
            <div className="ccnote">{num(oilGDay, 0)} grams of oil a day from {num(biomassDay, 1)} pounds of biomass. {money(profitYear, 0)} a year over {num(workdaysYear, 0)} work days.</div>
          </div>
        </div>
      </Section>

      <Section title="Every step, with the formula and the workbook cell it came from">
        <div className="clines">
          <div className="cgroup">Hydrocarbon batch</div>
          <CalcLine label="Trim cost per gram" formula={`${money(v.trim_cost_per_lb, 2)} ÷ 454 grams  ·  Summary!B7`} value={money(trimPerG, 4)} />
          <CalcLine label="Batch cost" formula={`${num(v.run_size_g, 0)} g × ${money(trimPerG, 4)}  ·  Summary!B8`} value={money(batchCost)} />
          <CalcLine label="Crude oil yield" formula={`${num(v.crude_yield_pct * 100, 1)}% × ${num(v.run_size_g, 0)} g  ·  Summary!B14`} value={num(crudeG, 1)} unit="grams" />
          <CalcLine label="Crude cost per gram" formula={`(${money(batchCost)} + ${money(v.extraction_labor)} + ${money(v.solvent_cost)}) ÷ ${num(crudeG, 1)} g  ·  Summary!B15`} value={money(crudeCostG, 4)} tone="key" />
          <div className="cgroup">Diamonds</div>
          <CalcLine label="Diamond yield" formula={`${num(crudeG, 1)} g × ${num(v.diamond_yield_pct * 100, 1)}%  ·  Summary!B17`} value={num(diamondG, 1)} unit="grams" />
          <CalcLine label="Cost allocated to diamonds" formula={`${num(diamondG, 1)} g × ${money(crudeCostG, 4)} + ${money(v.proc_labor_diamonds)}  ·  Summary!B18`} value={money(diamondAlloc)} />
          <CalcLine label="Diamond cost per gram" formula={`${money(diamondAlloc)} ÷ ${num(diamondG, 1)} g  ·  Summary!B19`} value={money(diamondPerG, 4)} tone="key" />
          <CalcLine label="Liquid diamond yield" formula={`${num(diamondG, 1)} g × ${v.liquid_diamond_factor}  ·  Summary!B20`} value={num(ldG, 1)} unit="grams" />
          <CalcLine label="Liquid diamond cost per gram" formula={`${money(ldAlloc)} ÷ ${num(ldG, 1)} g  ·  Summary!B22`} value={money(ldPerG, 4)} tone="key" />
          <div className="cgroup">Remaining crude, which becomes badder</div>
          <CalcLine label="Remaining crude" formula={`${num(crudeG, 1)} g × (100% − ${num(v.diamond_yield_pct * 100, 1)}%)  ·  Summary!B24`} value={num(remainingCrudeG, 1)} unit="grams" />
          <CalcLine label="Cost allocated to crude" formula={`${num(remainingCrudeG, 1)} g × ${money(crudeCostG, 4)} + ${money(v.proc_labor_badder)}  ·  Summary!B25`} value={money(crudeAlloc)} />
          <CalcLine label="Crude cost per gram" formula={`${money(crudeAlloc)} ÷ ${num(remainingCrudeG, 1)} g  ·  Summary!B26`} value={money(crudePerG, 4)} tone="key" />
          <div className="cgroup">Line throughput and daily position</div>
          <CalcLine label="Runs per day" formula={`(${v.hours_workday} h − 2 h) ÷ ${v.hours_per_run} h  ·  Volatile!B9`} value={num(runsDay, 2)} unit="runs" />
          <CalcLine label="Work days per year" formula={`${v.workdays_week} × 52 − ${v.holidays_year}  ·  Volatile!B6`} value={num(workdaysYear, 0)} unit="days" />
          <CalcLine label="Runs per year" formula={`${num(runsDay, 2)} × ${num(workdaysYear, 0)}  ·  Volatile!B10`} value={num(runsYear, 0)} unit="runs" />
          <CalcLine label="Oil yield" formula={`${num(v.flower_thc * 100, 1)}% cannabinoids × ${num(v.extraction_efficiency * 100, 0)}% efficiency  ·  Volatile!B13`} value={num(yieldPct * 100, 2)} unit="%" />
          <CalcLine label="Biomass needed daily" formula={`${v.luna_throughput} lb per run × ${num(runsDay, 2)} runs  ·  Volatile!B39`} value={num(biomassDay, 1)} unit="pounds" />
          <CalcLine label="Biomass needed weekly" formula={`${num(biomassDay, 1)} lb × ${v.workdays_week} days  ·  Volatile!B40`} value={num(biomassWeek, 1)} unit="pounds" />
          <CalcLine label="Oil output daily" formula={`${num(biomassDay, 1)} lb × ${num(yieldPct * 100, 2)}% × 454  ·  Volatile!B49`} value={num(oilGDay, 0)} unit="grams" />
          <CalcLine label="Input cost daily" formula={`labour (${v.operators} × ${v.hours_workday} h × ${money(v.employee_salary)}) + biomass (${money(v.wholesale_biomass)} × ${num(biomassDay, 1)} lb) + solvent (${v.solvent_loss} lb × ${money(v.solvent_price)})  ·  Volatile!B42`} value={money(inputCostDay, 0)} />
          <CalcLine label="Cost per gram of oil" formula={`${money(inputCostDay, 0)} ÷ ${num(oilGDay, 0)} g  ·  Volatile!B43`} value={money(costPerGram, 4)} tone="key" />
          <CalcLine label="Revenue daily" formula={`${num(oilGDay, 0)} g × ${money(v.wholesale_oil)} per gram  ·  Volatile!B44`} value={money(revenueDay, 0)} />
          <CalcLine label="Profit daily" formula={`${money(revenueDay, 0)} − ${money(inputCostDay, 0)}  ·  Volatile!B45`} value={money(profitDay, 0)} tone={profitDay > 0 ? "good" : "bad"} />
          <CalcLine label="Margin" formula={`${money(profitDay, 0)} ÷ ${money(revenueDay, 0)}  ·  Volatile!B46`} value={num(margin * 100, 1)} unit="%" tone={margin > 0 ? "good" : "bad"} />
          <CalcLine label="Profit yearly" formula={`${money(profitDay, 0)} × ${num(workdaysYear, 0)} work days  ·  Volatile!D45`} value={money(profitYear, 0)} tone={profitYear > 0 ? "good" : "bad"} />
        </div>
      </Section>

      <Section title="The inputs — change any of these" count={inp.length} defaultOpen>
        {Object.entries(groups).map(([g, items]) => (
          <div key={g} className="cinpgrp">
            <label>{g}</label>
            <div className="cinps">
              {items.map((r) => (
                <div key={r.key} className="cinp">
                  <span className="cinpl">{r.label}</span>
                  {edit === r.key ? (
                    <span className="cinpe">
                      <input aria-label="Value" autoFocus type="number" step="any" value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") save(r.key); if (e.key === "Escape") setEdit(null); }} />
                      <button className="vrbtn primary" onClick={() => save(r.key)}>Save</button>
                      <button className="vrbtn" onClick={() => setEdit(null)}>Cancel</button>
                    </span>
                  ) : (
                    <button className="cinpv" disabled={!mayEdit}
                      onClick={() => { setEdit(r.key); setDraft(String(r.value)); setMsg(""); }}
                      title={mayEdit ? "Click to change" : "You do not have permission to change this"}>
                      {Number(r.value).toLocaleString(undefined, { maximumFractionDigits: 6 })}
                      <em> {r.unit}</em>
                    </button>
                  )}
                  <span className="cinps2">
                    {r.source_cell}
                    {r.updated_by ? ` · last changed by ${r.updated_by} on ${String(r.updated_at).slice(0, 10)}` : " · never changed"}
                  </span>
                  {r.note && <span className="cinpn">{r.note}</span>}
                </div>
              ))}
            </div>
          </div>
        ))}
      </Section>

      <Section title="Every change made to a cost" count={hist.length}>
        {hist.length === 0 ? (
          <p className="vrsub">No cost has been changed yet. Every future change is recorded here with who made it and when.</p>
        ) : (
          <div className="tablewrap">
            <table>
              <thead><tr><th>Input</th><th>From</th><th>To</th><th>Changed by</th><th>When</th></tr></thead>
              <tbody>
                {hist.map((h) => (
                  <tr key={h.id}>
                    <td>{byKey[h.key]?.label ?? h.key}</td>
                    <td>{h.old_value}</td><td>{h.new_value}</td>
                    <td>{h.changed_by}</td><td>{String(h.changed_at).slice(0, 16).replace("T", " ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  );
}

/* Harvest labour calculator. The owner's formulas from the harvest workbook, run
   against the live Metrc plant count for a real room instead of a fixed estimate.
   Every input and every pace scenario is editable by anyone with permission. */
function HarvestLaborCalculator({ session }) {
  const [inp, setInp] = useState(null);
  const [pace, setPace] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [role, setRole] = useState(null);
  const [room, setRoom] = useState("");
  const [edit, setEdit] = useState(null);
  const [draft, setDraft] = useState("");
  const [msg, setMsg] = useState("");
  const who = session?.user?.email ?? "unknown";

  const load = async () => {
    const [i, sc, r, u] = await Promise.all([
      supabase.from("harvest_labor_inputs").select("*").order("sort"),
      supabase.from("harvest_pace_scenarios").select("*").order("sort"),
      supabase.from("v_room_plant_counts").select("*"),
      supabase.from("app_users").select("role").eq("user_id", session.user.id).maybeSingle(),
    ]);
    setInp(i.data ?? []); setPace(sc.data ?? []); setRooms(r.data ?? []);
    setRole(u.data?.role ?? null);
  };
  useEffect(() => { load(); }, []);
  if (!inp) return <div className="loading">Reading the harvest labour model…</div>;

  const mayEdit = ["owner", "executive", "planner", "dept_head"].includes(role);
  const byKey = Object.fromEntries(inp.map((r) => [r.key, r]));
  const v = Object.fromEntries(inp.map((r) => [r.key, Number(r.value)]));
  const chosen = rooms.find((r) => r.room === room);
  const plants = chosen ? Number(chosen.plants) : v.plants;

  const save = async (key) => {
    const n = Number(draft);
    if (!isFinite(n) || n <= 0) { setMsg("Enter a number greater than zero."); return; }
    const { error } = await supabase.from("harvest_labor_inputs")
      .update({ value: n, updated_by: who, updated_at: new Date().toISOString() }).eq("key", key);
    setMsg(error ? error.message : `${byKey[key].label} changed to ${n}. Everything below recalculated.`);
    if (!error) { setEdit(null); load(); }
  };
  const savePace = async (id, field, val) => {
    const n = Number(val);
    if (!isFinite(n) || n <= 0) { setMsg("Enter a number greater than zero."); return; }
    const { error } = await supabase.from("harvest_pace_scenarios")
      .update({ [field]: n, updated_by: who, updated_at: new Date().toISOString() }).eq("id", id);
    setMsg(error ? error.message : "Pace scenario updated. The clock test re-ran.");
    if (!error) { setEdit(null); load(); }
  };

  /* ── The owner's formulas ── */
  const perTable = plants / v.tables;                       // B4
  const day1Min = v.core_staff * v.day1_hours * 60;         // B7
  const day2Min = v.core_staff * v.day2_hours * 60;         // B9
  const capacity = day1Min + day2Min;                       // B10
  const scored = pace.map((sc) => {
    const elapsed = plants / Number(sc.plants_per_min_per_person) / Number(sc.staff_on_task); // D
    const laborMin = elapsed * Number(sc.staff_on_task);    // E
    return { ...sc, elapsed, laborMin, fits: elapsed <= v.day1_clock };
  });
  const firstFit = scored.find((x) => x.fits);

  const Cell = ({ k }) => {
    const r = byKey[k];
    if (!r) return null;
    return edit === k ? (
      <span className="cinpe">
        <input aria-label="Value" autoFocus type="number" step="any" value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") save(k); if (e.key === "Escape") setEdit(null); }} />
        <button className="vrbtn primary" onClick={() => save(k)}>Save</button>
        <button className="vrbtn" onClick={() => setEdit(null)}>Cancel</button>
      </span>
    ) : (
      <button className="cinpv" disabled={!mayEdit}
        onClick={() => { setEdit(k); setDraft(String(r.value)); setMsg(""); }}
        title={mayEdit ? "Click to change" : "You do not have permission to change this"}>
        {Number(r.value).toLocaleString()}<em> {r.unit}</em>
      </button>
    );
  };

  return (
    <div className="calc">
      <div className="pagehead">
        <h1>Harvest Labour Calculator</h1>
        <p className="dashsub">
          The formulas from your harvest workbook, run against the live Metrc plant count for a real
          room rather than a fixed estimate. Every input and every pace scenario is editable.
        </p>
      </div>
      {msg && <div className="vrmsg">{msg}</div>}
      {!mayEdit && (
        <div className="vrmsg">You can see everything here. Changing an input needs an owner,
          executive, planner or department head. Your role is {role || "not set"}.</div>
      )}

      <Section title="Which room are you harvesting" defaultOpen>
        <div className="hrooms">
          <button className={`hroom ${room === "" ? "on" : ""}`} onClick={() => setRoom("")}>
            <span className="hrname">Use the workbook estimate</span>
            <span className="hrbig">{Number(v.plants).toLocaleString()}</span>
            <span className="hrsub">plants · Labor Calculator!B2</span>
          </button>
          {rooms.map((r) => (
            <button key={r.room + r.growth_phase} className={`hroom ${room === r.room ? "on" : ""}`}
              onClick={() => setRoom(r.room)}>
              <span className="hrname">{r.room}</span>
              <span className="hrbig">{Number(r.plants).toLocaleString()}</span>
              <span className="hrsub">
                plants standing in Metrc · {r.growth_phase} · {r.strains} cultivar{r.strains === 1 ? "" : "s"}
              </span>
              <span className="hrsub">planted {r.earliest_planted} to {r.latest_planted}</span>
            </button>
          ))}
        </div>
        {chosen && (
          <p className="hrnote">
            Using the live count of <b>{Number(chosen.plants).toLocaleString()}</b> plants still standing in
            {" "}{chosen.room}. Harvested and destroyed plants are excluded — they are not work still to be done.
            Cultivars in the room: {chosen.strain_list}.
          </p>
        )}
      </Section>

      <Section title="Can the crew finish Day 1 inside the clock" defaultOpen>
        <div className="hverdict">
          {firstFit ? (
            <div className="hv ok">
              <b>Yes, at {firstFit.scenario.toLowerCase()} or faster.</b>
              <span>
                {Number(plants).toLocaleString()} plants at {firstFit.plants_per_min_per_person} per minute per
                person with {firstFit.staff_on_task} on task takes {Math.round(firstFit.elapsed)} elapsed minutes,
                inside the {v.day1_clock} minute Day 1 clock. Anything slower does not finish.
              </span>
            </div>
          ) : (
            <div className="hv bad">
              <b>No. Not one pace scenario finishes Day 1 inside the clock.</b>
              <span>
                {Number(plants).toLocaleString()} plants cannot be taken down in {v.day1_clock} minutes with
                {" "}{v.core_staff} staff at any pace on file. Add staff, raise the pace, or split the room across
                two harvest days.
              </span>
            </div>
          )}
        </div>
        <div className="tablewrap">
          <table>
            <thead><tr>
              <th>Pace scenario</th><th>Plants per minute per person</th><th>Staff on task</th>
              <th>Elapsed minutes</th><th>Labour minutes</th>
              <th>Fits the {v.day1_clock} minute Day 1 clock</th><th>Notes</th>
            </tr></thead>
            <tbody>
              {scored.map((x) => (
                <tr key={x.id} className={x.fits ? "" : "rowbad"}>
                  <td>{x.scenario}</td>
                  <td>
                    {edit === x.id + "p" ? (
                      <span className="cinpe">
                        <input aria-label="Value" autoFocus type="number" step="any" value={draft}
                          onChange={(e) => setDraft(e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Enter") savePace(x.id, "plants_per_min_per_person", draft); if (e.key === "Escape") setEdit(null); }} />
                        <button className="vrbtn primary" onClick={() => savePace(x.id, "plants_per_min_per_person", draft)}>Save</button>
                      </span>
                    ) : (
                      <button className="cinpv" disabled={!mayEdit}
                        onClick={() => { setEdit(x.id + "p"); setDraft(String(x.plants_per_min_per_person)); }}>
                        {x.plants_per_min_per_person}
                      </button>
                    )}
                  </td>
                  <td>
                    {edit === x.id + "s" ? (
                      <span className="cinpe">
                        <input aria-label="Value" autoFocus type="number" step="any" value={draft}
                          onChange={(e) => setDraft(e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Enter") savePace(x.id, "staff_on_task", draft); if (e.key === "Escape") setEdit(null); }} />
                        <button className="vrbtn primary" onClick={() => savePace(x.id, "staff_on_task", draft)}>Save</button>
                      </span>
                    ) : (
                      <button className="cinpv" disabled={!mayEdit}
                        onClick={() => { setEdit(x.id + "s"); setDraft(String(x.staff_on_task)); }}>
                        {x.staff_on_task}
                      </button>
                    )}
                  </td>
                  <td>{Math.round(x.elapsed).toLocaleString()}</td>
                  <td>{Math.round(x.laborMin).toLocaleString()}</td>
                  <td><b className={x.fits ? "ok" : "bad"}>{x.fits ? "YES" : "NO"}</b></td>
                  <td>{x.notes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="vrsub">
          Elapsed minutes = plants ÷ pace ÷ staff on task · Labor Calculator!D13. Labour minutes = elapsed ×
          staff on task · E13. The clock test is Labor Calculator!F13.
        </p>
      </Section>

      <Section title="Every step, with the workbook cell it came from" defaultOpen>
        <div className="clines">
          <CalcLine label="Plants to take down"
            formula={chosen ? `Live Metrc count for ${chosen.room}, plants still standing` : "Workbook estimate · Labor Calculator!B2"}
            value={Number(plants).toLocaleString()} unit="plants" tone="key" />
          <CalcLine label="Plants per table"
            formula={`${Number(plants).toLocaleString()} ÷ ${v.tables} tables  ·  Labor Calculator!B4`}
            value={Math.round(perTable).toLocaleString()} unit="plants" />
          <CalcLine label="Day 1 labour capacity"
            formula={`${v.core_staff} staff × ${v.day1_hours} paid hours × 60  ·  Labor Calculator!B7`}
            value={day1Min.toLocaleString()} unit="minutes" />
          <CalcLine label="Day 2 labour capacity"
            formula={`${v.core_staff} staff × ${v.day2_hours} paid hours × 60  ·  Labor Calculator!B9`}
            value={day2Min.toLocaleString()} unit="minutes" />
          <CalcLine label="Two day labour capacity"
            formula={`${day1Min.toLocaleString()} + ${day2Min.toLocaleString()}  ·  Labor Calculator!B10`}
            value={capacity.toLocaleString()} unit="minutes" tone="key" />
        </div>
      </Section>

      <Section title="The inputs — change any of these" count={inp.length} defaultOpen>
        <div className="cinps">
          {inp.map((r) => (
            <div key={r.key} className="cinp">
              <span className="cinpl">{r.label}</span>
              <Cell k={r.key} />
              <span className="cinps2">
                {r.source_cell}
                {r.updated_by ? ` · last changed by ${r.updated_by} on ${String(r.updated_at).slice(0, 10)}` : " · never changed"}
              </span>
              {r.note && <span className="cinpn">{r.note}</span>}
            </div>
          ))}
        </div>
      </Section>

      <Section title="Day 1 required outcomes">
        <ul className="hout">
          <li><b>Fresh frozen completed, frozen and logged.</b> Around {v.fresh_frozen_target} pounds as a side
            lane — it must not become the full-day bottleneck.</li>
          <li><b>All plants down and material moved.</b> Nobody leaves Day 1 until Day 2 can start replanting.</li>
          <li><b>Waste removed and first-pass clean complete.</b> Critical, because Day 2 is replant first.</li>
        </ul>
      </Section>
    </div>
  );
}

/* Sheet Sync for a restricted sheet nobody is allowed to change.
   Scripts inside the sheet are blocked by policy and the sheet cannot be shared,
   so nothing reaches into it. Instead the data comes from this side: select the
   rows in the sheet, copy, paste here. It parses, compares against what arrived
   last time, and says exactly what changed. A file dropped from the sheet's own
   Download works the same way. */
function SheetSync({ session }) {
  const [rows, setRows] = useState(null);
  const [srcs, setSrcs] = useState([]);
  const [log, setLog] = useState([]);
  const [role, setRole] = useState(null);
  const [active, setActive] = useState(null);
  const [paste, setPaste] = useState("");
  const [parsed, setParsed] = useState(null);
  const [msg, setMsg] = useState("");
  const [preview, setPreview] = useState(null);
  const who = session?.user?.email ?? "unknown";

  const load = async () => {
    const [st, sc, l, u] = await Promise.all([
      supabase.from("v_sheet_sync_status").select("*"),
      supabase.from("sheet_sources").select("*").order("name"),
      supabase.from("sheet_push_log").select("*").order("received_at", { ascending: false }).limit(30),
      supabase.from("app_users").select("role").eq("user_id", session.user.id).maybeSingle(),
    ]);
    setRows(st.data ?? []); setSrcs(sc.data ?? []); setLog(l.data ?? []);
    setRole(u.data?.role ?? null);
  };
  useEffect(() => { load(); }, []);
  if (!rows) return <div className="loading">Reading the sheet sync status…</div>;
  const mayEdit = ["owner", "executive", "planner", "dept_head"].includes(role);

  /* Sheets copy as tab separated text. Handle commas too, for a downloaded file. */
  const parse = (text) => {
    const lines = String(text).replace(/\r/g, "").split("\n").filter((l) => l.trim() !== "");
    if (lines.length < 2) return { error: "Paste the headings row and at least one row of data." };
    const sep = lines[0].includes("\t") ? "\t" : ",";
    const heads = lines[0].split(sep).map((h) => h.trim());
    if (heads.filter(Boolean).length === 0) return { error: "The first row has no column headings." };
    const out = lines.slice(1).map((l) => {
      const cells = l.split(sep);
      const o = {};
      heads.forEach((h, i) => { if (h) o[h] = (cells[i] ?? "").trim(); });
      return o;
    });
    return { heads: heads.filter(Boolean), rows: out };
  };

  const doParse = (text) => {
    const r = parse(text);
    if (r.error) { setMsg(r.error); setParsed(null); return; }
    setMsg(""); setParsed(r);
  };

  const commit = async (src) => {
    if (!parsed?.rows?.length) { setMsg("Nothing parsed yet."); return; }
    const before = await supabase.from("sheet_rows").select("data").eq("source_id", src.id);
    const oldRows = (before.data ?? []).map((r) => JSON.stringify(r.data));
    const newRows = parsed.rows.map((r) => JSON.stringify(r));
    const added = newRows.filter((r) => !oldRows.includes(r)).length;
    const removed = oldRows.filter((r) => !newRows.includes(r)).length;

    await supabase.from("sheet_rows").delete().eq("source_id", src.id);
    const batch = parsed.rows.map((data, i) => ({ source_id: src.id, row_number: i + 1, data }));
    for (let i = 0; i < batch.length; i += 400) {
      const { error } = await supabase.from("sheet_rows").insert(batch.slice(i, i + 400));
      if (error) { setMsg(error.message); return; }
    }
    await supabase.from("sheet_sources")
      .update({ last_pushed_at: new Date().toISOString(), last_row_count: parsed.rows.length })
      .eq("id", src.id);
    await supabase.from("sheet_push_log").insert({
      source_id: src.id, rows_received: parsed.rows.length, ok: true,
      message: `${parsed.rows.length} rows brought in by ${who}. ${added} new or changed, ${removed} no longer present.`,
    });
    setMsg(`Brought in ${parsed.rows.length} rows. ${added} new or changed since last time, ${removed} no longer in the sheet.`);
    setPaste(""); setParsed(null); setActive(null); load();
  };

  const onFile = async (f) => {
    if (!f) return;
    const text = await f.text();
    setPaste(text.slice(0, 400000));
    doParse(text);
  };

  const showRows = async (id) => {
    const { data } = await supabase.from("sheet_rows").select("*").eq("source_id", id)
      .order("row_number").limit(60);
    setPreview({ id, rows: data ?? [] });
  };

  return (
    <div className="calc">
      <div className="pagehead">
        <h1>Sheet Sync</h1>
        <p className="dashsub">
          For a sheet you are only allowed to look at. Nothing here reaches into the sheet, nothing
          is installed in it, and nobody is given access to it — so no policy is touched. You copy
          the rows out of the sheet and paste them here, or drop the file the sheet&rsquo;s own Download
          gives you. It parses the columns, compares against last time and tells you what changed.
        </p>
      </div>
      {msg && <div className="vrmsg">{msg}</div>}
      {!mayEdit && (
        <div className="vrmsg">You can see what has arrived. Bringing data in needs an owner,
          executive, planner or department head. Your role is {role || "not set"}.</div>
      )}

      {rows.map((r) => {
        const src = srcs.find((x) => x.id === r.id);
        const stale = r.status.startsWith("OVERDUE") || !r.last_pushed_at;
        return (
          <div key={r.id} className={`sscard ${stale ? "bad" : "ok"}`}>
            <div className="sshead">
              <span className="ssname">{r.name}</span>
              <span className="sstab">tab: {r.sheet_tab}</span>
              <span className={`sspill ${stale ? "warn" : "ok"}`}>
                {!r.last_pushed_at ? "nothing brought in yet" : stale ? "out of date" : "up to date"}
              </span>
            </div>
            <div className="ssstat">{r.status}</div>
            <div className="ssline">
              <span><em>Rows held now</em><b>{Number(r.rows_held).toLocaleString()}</b></span>
              <span><em>Rows last time</em><b>{r.last_row_count ?? "none yet"}</b></span>
              <span><em>Expected every</em><b>{r.expected_every_minutes >= 1440
                ? `${Math.round(r.expected_every_minutes / 1440)} day${r.expected_every_minutes >= 2880 ? "s" : ""}`
                : `${r.expected_every_minutes} minutes`}</b></span>
            </div>
            <div className="ssactions">
              <button className="vrbtn" onClick={() => showRows(r.id)}>See what has arrived</button>
              {mayEdit && (
                <button className="vrbtn primary" onClick={() => { setActive(active === r.id ? null : r.id); setParsed(null); setPaste(""); setMsg(""); }}>
                  {active === r.id ? "Close" : "Bring today's data in"}
                </button>
              )}
            </div>

            {active === r.id && (
              <div className="sssetup">
                <ol className="sssteps">
                  <li>Open the sheet and go to the <b>{r.sheet_tab}</b> tab.</li>
                  <li>Click the corner box to select everything, or press <b>Ctrl</b> and <b>A</b>,
                    then <b>Ctrl</b> and <b>C</b> to copy. Include the row of headings.</li>
                  <li>Click in the box below and press <b>Ctrl</b> and <b>V</b>.</li>
                </ol>
                <p className="ssnote">
                  Or use <b>File → Download → Comma separated values</b> in the sheet and drop the
                  file here. Both do the same thing. Neither changes the sheet or its sharing.
                </p>
                <textarea aria-label="Paste the sheet here" className="sspaste" value={paste} placeholder="Paste the sheet here…"
                  onChange={(e) => { setPaste(e.target.value); doParse(e.target.value); }} />
                <input aria-label="Choose a file to upload" className="ssfile" type="file" accept=".csv,.tsv,.txt"
                  onChange={(e) => onFile(e.target.files?.[0])} />

                {parsed && (
                  <>
                    <div className="ssparsed">
                      Read <b>{parsed.rows.length}</b> rows across <b>{parsed.heads.length}</b> columns:{" "}
                      {parsed.heads.join(", ")}
                    </div>
                    <div className="tablewrap">
                      <table>
                        <thead><tr>{parsed.heads.map((h) => <th key={h}>{h}</th>)}</tr></thead>
                        <tbody>
                          {parsed.rows.slice(0, 8).map((pr, i) => (
                            <tr key={i}>{parsed.heads.map((h) => (
                              <td key={h}>{pr[h] === "" || pr[h] == null ? "—" : pr[h]}</td>
                            ))}</tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {parsed.rows.length > 8 && (
                      <p className="ssnote">Showing the first 8 of {parsed.rows.length}. All of them will be brought in.</p>
                    )}
                    <button className="vrbtn primary" onClick={() => commit(src)}>
                      Bring in all {parsed.rows.length} rows
                    </button>
                  </>
                )}
              </div>
            )}

            {preview?.id === r.id && (
              preview.rows.length === 0 ? (
                <div className="brnone">
                  Nothing has been brought in yet. <b>Why:</b> nobody has pasted or uploaded this
                  sheet since the source was created.
                </div>
              ) : (
                <div className="tablewrap">
                  <table>
                    <thead><tr><th>Row</th>
                      {Object.keys(preview.rows[0].data).map((c) => <th key={c}>{c}</th>)}
                    </tr></thead>
                    <tbody>
                      {preview.rows.map((pr) => (
                        <tr key={pr.id}><td>{pr.row_number}</td>
                          {Object.keys(preview.rows[0].data).map((c) => (
                            <td key={c}>{pr.data[c] == null || pr.data[c] === "" ? "—" : String(pr.data[c])}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            )}
          </div>
        );
      })}

      <Section title="Everything brought in, and by whom" count={log.length}>
        {log.length === 0 ? (
          <p className="vrsub">Nothing yet. Every import is recorded here with who did it and what changed.</p>
        ) : (
          <div className="tablewrap">
            <table>
              <thead><tr><th>When</th><th>Rows</th><th>Result</th><th>What happened</th></tr></thead>
              <tbody>
                {log.map((l) => (
                  <tr key={l.id} className={l.ok ? "" : "rowbad"}>
                    <td>{String(l.received_at).slice(0, 16).replace("T", " ")}</td>
                    <td>{l.rows_received}</td>
                    <td><b className={l.ok ? "ok" : "bad"}>{l.ok ? "accepted" : "refused"}</b></td>
                    <td>{l.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  );
}

/* Sitewide warning. No dollar figure anywhere should be read as fact while the
   rate behind it is an inherited default nobody has set. */
function RateWarning({ go }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    supabase.from("valuation_rates").select("stream", { count: "exact", head: true })
      .eq("confirmed", false).then(({ count }) => setN(count ?? 0));
  }, []);
  if (!n) return null;
  return (
    <button className="ratewarn" onClick={() => go("valuation_rates")}>
      <span className="rwtag">Money figures are estimates</span>
      <span className="rwbody">
        {n} of the stream rates behind every dollar figure on this platform have never been set by
        anyone — they are an inherited default. Treat every total as an estimate until they are set.
      </span>
      <span className="rwgo">Set the rates →</span>
    </button>
  );
}

/* Business Rules editor. Every threshold the platform judges the business by,
   changeable in place. Each shows how many places use it and whether it is still
   an unconfirmed default, because a number nobody chose should never look settled. */
function BusinessRules({ session }) {
  return <BusinessRuleEditor session={session} />;
}

/* Overhead. Nothing was recorded at all, so cost per pound was labour only and
   understated. Every line entered here raises the true cost immediately. */
const OVERHEAD_SUGGESTIONS = [
  ["Electricity", "Utilities"], ["Water and sewer", "Utilities"], ["Gas and heating", "Utilities"],
  ["Rent or mortgage", "Facility"], ["Property taxes", "Facility"], ["Building insurance", "Insurance"],
  ["Liability insurance", "Insurance"], ["Crop insurance", "Insurance"],
  ["Nutrients and additives", "Growing"], ["Growing media", "Growing"], ["Pest management", "Growing"],
  ["Packaging materials", "Production"], ["Laboratory testing", "Production"],
  ["Equipment maintenance", "Equipment"], ["Equipment leases", "Equipment"],
  ["Security and monitoring", "Compliance"], ["Licence fees", "Compliance"],
  ["Waste disposal", "Compliance"], ["Software and systems", "Administration"],
  ["Accounting and legal", "Administration"],
];

function OverheadInputs({ session }) {
  const [rows, setRows] = useState(null);
  const [role, setRole] = useState(null);
  const [add, setAdd] = useState({ description: "", category: "Utilities", monthly_amount: "", is_280e_cogs: true });
  const [edit, setEdit] = useState(null);
  const [draft, setDraft] = useState("");
  const [msg, setMsg] = useState("");
  const [cost, setCost] = useState(null);

  const load = async () => {
    const [r, u, c] = await Promise.all([
      supabase.from("overhead_items").select("*").order("category").order("description"),
      supabase.from("app_users").select("role").eq("user_id", session.user.id).maybeSingle(),
      supabase.from("v_actual_cost_per_pound").select("*").maybeSingle(),
    ]);
    setRows(r.data ?? []); setRole(u.data?.role ?? null); setCost(c.data ?? null);
  };
  useEffect(() => { load(); }, []);
  if (!rows) return <div className="loading">Reading the overhead…</div>;
  const mayEdit = ["owner", "executive", "planner", "dept_head"].includes(role);
  const total = rows.reduce((a, r) => a + Number(r.monthly_amount || 0), 0);
  const missing = OVERHEAD_SUGGESTIONS.filter(([d]) =>
    !rows.some((r) => r.description.toLowerCase() === d.toLowerCase()));

  const create = async (description, category) => {
    const amt = Number(add.monthly_amount);
    if (!description) { setMsg("Name the cost."); return; }
    if (!isFinite(amt) || amt <= 0) { setMsg("Enter the monthly amount for " + description + "."); return; }
    const { error } = await supabase.from("overhead_items").insert({
      description, category, monthly_amount: amt, is_280e_cogs: add.is_280e_cogs,
      effective_from: new Date().toISOString().slice(0, 10),
    });
    setMsg(error ? error.message : `${description} added at $${amt.toLocaleString()} a month. Cost per pound recalculated.`);
    if (!error) { setAdd({ description: "", category: "Utilities", monthly_amount: "", is_280e_cogs: true }); load(); }
  };
  const saveAmt = async (id, description) => {
    const amt = Number(draft);
    if (!isFinite(amt) || amt < 0) { setMsg("Enter an amount."); return; }
    const { error } = await supabase.from("overhead_items").update({ monthly_amount: amt }).eq("id", id);
    setMsg(error ? error.message : `${description} changed to $${amt.toLocaleString()} a month.`);
    if (!error) { setEdit(null); load(); }
  };
  const remove = async (id, description) => {
    const { error } = await supabase.from("overhead_items").delete().eq("id", id);
    setMsg(error ? error.message : `${description} removed.`);
    if (!error) load();
  };

  return (
    <div className="calc">
      <div className="pagehead">
        <h1>Overhead — what it costs to keep the doors open</h1>
        <p className="dashsub">
          Everything that is not payroll. Until these are entered, cost per pound counts wages only
          and understates the truth. Each line you add raises the real cost immediately.
        </p>
      </div>
      {msg && <div className="vrmsg">{msg}</div>}

      <div className="cgrid">
        <div className="ccard">
          <div className="cchead">Overhead recorded</div>
          <div className="ccbig">${Math.round(total).toLocaleString()}<em> per month</em></div>
          <div className="ccnote">{rows.length} line{rows.length === 1 ? "" : "s"} on file.</div>
        </div>
        {cost && (
          <>
            <div className="ccard">
              <div className="cchead">Cost per saleable pound</div>
              <div className="ccbig">${Number(cost.actual_cost_per_pound).toLocaleString()}</div>
              <div className="ccnote">{cost.the_arithmetic}</div>
            </div>
            <div className="ccard">
              <div className="cchead">Against the figure you set</div>
              <div className="ccbig">${Number(cost.assumed_cost_per_pound).toLocaleString()}</div>
              <div className="ccnote">
                Gap of ${Number(cost.gap_per_pound).toLocaleString()} a pound still unaccounted for.
              </div>
            </div>
          </>
        )}
      </div>
      {cost && <div className="vrmsg">{cost.what_is_missing}</div>}

      {mayEdit && missing.length > 0 && (
        <div className="vrsec">
          <h2>Not recorded yet</h2>
          <p className="vrsub">
            These are the usual lines and none of them is on file. Enter a monthly amount, then press
            the one you are entering. Nothing is assumed — a line only exists once you give it a figure.
          </p>
          <div className="vrovform">
            <label>Monthly amount
              <input type="number" step="any" value={add.monthly_amount}
                onChange={(e) => setAdd({ ...add, monthly_amount: e.target.value })} placeholder="e.g. 8400" />
            </label>
            <label>Counts toward cost of goods for tax
              <select value={add.is_280e_cogs ? "yes" : "no"}
                onChange={(e) => setAdd({ ...add, is_280e_cogs: e.target.value === "yes" })}>
                <option value="yes">Yes</option><option value="no">No</option>
              </select>
            </label>
          </div>
          <div className="ohsuggest">
            {missing.map(([d, c]) => (
              <button key={d} className="ohchip" onClick={() => create(d, c)}
                title={`Add ${d} at the amount entered above`}>+ {d}</button>
            ))}
          </div>
          <div className="vrovform" style={{ marginTop: 12 }}>
            <label>Something else — name it
              <input value={add.description} onChange={(e) => setAdd({ ...add, description: e.target.value })} />
            </label>
            <label>Category
              <input value={add.category} onChange={(e) => setAdd({ ...add, category: e.target.value })} />
            </label>
          </div>
          <button className="vrbtn primary" onClick={() => create(add.description, add.category)}>
            Add this cost
          </button>
        </div>
      )}

      <Section title="Overhead on file" count={rows.length} defaultOpen>
        {rows.length === 0 ? (
          <p className="vrsub">
            Nothing recorded. Cost per pound is therefore wages only, and understates the truth by
            whatever electricity, water, rent, insurance, taxes and materials actually cost.
          </p>
        ) : (
          <div className="tablewrap">
            <table>
              <thead><tr><th>Cost</th><th>Category</th><th>Monthly amount</th><th>Yearly</th>
                <th>Cost of goods for tax</th><th>From</th>{mayEdit && <th></th>}</tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td>{r.description}</td><td>{r.category}</td>
                    <td>
                      {edit === r.id ? (
                        <span className="cinpe">
                          <input autoFocus type="number" step="any" value={draft}
                            onChange={(e) => setDraft(e.target.value)}
                            onKeyDown={(e) => { if (e.key === "Enter") saveAmt(r.id, r.description); if (e.key === "Escape") setEdit(null); }} />
                          <button className="vrbtn primary" onClick={() => saveAmt(r.id, r.description)}>Save</button>
                        </span>
                      ) : (
                        <button className="cinpv" disabled={!mayEdit}
                          onClick={() => { setEdit(r.id); setDraft(String(r.monthly_amount)); }}>
                          ${Number(r.monthly_amount).toLocaleString()}
                        </button>
                      )}
                    </td>
                    <td>${Math.round(Number(r.monthly_amount) * 12).toLocaleString()}</td>
                    <td>{r.is_280e_cogs ? "Yes" : "No"}</td>
                    <td>{r.effective_from}</td>
                    {mayEdit && <td><button className="vrbtn" onClick={() => remove(r.id, r.description)}>Remove</button></td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  );
}

/* Finance, Tax and Human Resources sit on the top bar beside Reports. The grid
   launcher is for workspace tools only. */
function TopMenu({ label, items, go }) {
  const [open, setOpen] = useState(false);
  if (!items?.length) return null;
  const groups = [...new Set(items.map((r) => r.subcategory || "Other"))].sort();
  return (
    <div className="repwrap">
      <button className={`repbtn ${open ? "on" : ""}`} onClick={() => setOpen((v) => !v)}>
        {label} <span className="repcar">▾</span>
      </button>
      {open && (
        <div className="repmenu" onMouseLeave={() => setOpen(false)}>
          <div className="rephead">{label}</div>
          <div className="repcols">
            {groups.map((g) => (
              <div className="repcol" key={g}>
                <div className="repgrp">{g}</div>
                {items.filter((r) => (r.subcategory || "Other") === g)
                  .sort((a, b) => (a.item_order ?? 0) - (b.item_order ?? 0) || a.label.localeCompare(b.label))
                  .map((r) => (
                    <button key={r.view_key} className="repitem" title={r.description || ""}
                      onClick={() => { go(r.view_key); setOpen(false); }}>{r.label}</button>
                  ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* Administrator alerts. Computed from live state, so they cannot be dismissed or
   snoozed — each one disappears only when the underlying problem is actually fixed. */
function AdminAlerts({ go }) {
  const [rows, setRows] = useState(null);
  useEffect(() => {
    supabase.from("v_admin_alerts").select("*").then(({ data }) => setRows(data ?? []));
  }, []);
  if (!rows) return null;
  if (!rows.length)
    return (
      <div className="aaclear">
        Nothing outstanding. Every rate, rule and cost the platform depends on has been set by
        somebody, and the imported sheets are matched to Metrc.
      </div>
    );
  return (
    <div className="aalist">
      {rows.map((a, i) => (
        <div key={i} className={`aa ${a.severity}`}>
          <div className="aahead">
            <span className={`aasev ${a.severity}`}>{a.severity}</span>
            <span className="aawhat">{a.what}</span>
            <span className="aacount">{a.outstanding} outstanding</span>
          </div>
          <div className="aadetail">{a.detail}</div>
          <div className="aawhy">{a.why_it_matters}</div>
          <div className="aado">{a.what_to_do}</div>
          <button className="vrbtn primary" onClick={() => go(a.drill)}>Resolve this</button>
          <div className="aanote">
            This cannot be dismissed. It clears itself the moment the underlying setting exists.
          </div>
        </div>
      ))}
    </div>
  );
}

/* Every batch behind a tile or an alert. A number on a card is a claim; this is the
   evidence for it — each package with its harvest, its dates, where it is and where
   it came from. Nothing is summarised away. */
export function BatchList({ stream, origin, labState }) {
  const [rows, setRows] = useState(null);
  useEffect(() => {
    let live = true;
    (async () => {
      let q = supabase.from("v_stock_packages").select("*").order("packaged_on", { ascending: true });
      if (stream) q = q.eq("stream", stream);
      if (origin) q = q.eq("origin", origin);
      if (labState) q = q.eq("lab_state", labState);
      const { data } = await q;
      if (live) setRows(data ?? []);
    })();
    return () => { live = false; };
  }, [stream, origin, labState]);
  if (!rows) return <div className="note">Reading every package…</div>;
  if (!rows.length)
    return <div className="brnone">No packages match. <b>Why:</b> nothing in Metrc currently sits
      under this combination of stream, origin and testing state.</div>;
  const lb = rows.reduce((a, r) => a + Number(r.pounds || 0), 0);
  return (
    <>
      <p className="buildnote" style={{ color: "var(--muted)" }}>
        {rows.length} package{rows.length === 1 ? "" : "s"}, {lb.toLocaleString(undefined, { maximumFractionDigits: 1 })} lb.
        Every one listed — nothing rolled up.
      </p>
      <div className="tablewrap">
        <table>
          <thead><tr>
            <th>Package tag</th><th>Product</th><th>Cultivar</th><th>Source harvest</th>
            <th>Harvest cut on</th><th>Dried in</th><th>Packaged on</th><th>Days held</th>
            <th>Quantity</th><th>Quantity held</th><th>Testing state</th><th>Went out</th><th>Came back</th>
            <th>Certificate expires</th><th>Where it is</th><th>Made by</th><th>Shipped to us by</th>
            <th>Inbound manifest</th><th>Licence</th><th>Traceability</th><th>Documents</th>
          </tr></thead>
          <tbody>
            {rows.map((r) => {
              const out = r.submitted_on, back = r.result_on;
              const days = out && back
                ? Math.round((new Date(back) - new Date(out)) / 86400000)
                : out ? Math.round((Date.now() - new Date(out)) / 86400000) : null;
              return (
                <DrillRow key={r.package_tag} row={r} colCount={21}>
                  <td>{r.package_tag}</td>
                  <td>{r.item_name || "not recorded"}</td>
                  <td>{r.strain || "not recorded"}</td>
                  <td>{r.source_harvest || "not recorded"}</td>
                  <td>{r.harvest_cut_on || "not recorded"}</td>
                  <td>{r.dried_in || "not recorded"}</td>
                  <td>{r.packaged_on || "not recorded"}</td>
                  <td>{r.days_here ?? "—"}</td>
                  <td>{Number(r.quantity).toLocaleString()} {r.uom}</td>
                  <td>{r.quantity_shown ?? (r.pounds == null ? "not a weight"
                    : Number(r.pounds).toLocaleString(undefined, { maximumFractionDigits: 3 }))}</td>
                  <td className={r.lab_state === "TestFailed" ? "bad" : ""}>{r.lab_state}</td>
                  <td>{out || "never submitted"}</td>
                  <td>{back || (out ? `still out, ${days} days` : "not applicable")}</td>
                  <td>{r.coa_expires || "none"}</td>
                  <td>{r.location || "not recorded"}</td>
                  <td>{r.made_by || "not recorded"}</td>
                  <td>{r.shipped_to_us_by || "not applicable"}</td>
                  <td>{r.inbound_manifest || "none"}</td>
                  <td>{r.license || "not recorded"}</td>
                  <td>{r.traceability}</td>
                  <td><DocumentChips tag={r.package_tag} /></td>
                </DrillRow>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

/* Grow rooms. A room with no square footage is excluded from every yield per square
   foot figure, so half the canopy becomes invisible. This shows which, and lets a
   measurement be entered. The inferred figure is shown but never used. */
function GrowRooms({ session }) {
  const [rows, setRows] = useState(null);
  const [role, setRole] = useState(null);
  const [edit, setEdit] = useState(null);
  const [draft, setDraft] = useState("");
  const [how, setHow] = useState("");
  const [msg, setMsg] = useState("");

  const load = async () => {
    const [r, u] = await Promise.all([
      supabase.from("v_room_canopy_status").select("*"),
      supabase.from("app_users").select("role").eq("user_id", session.user.id).maybeSingle(),
    ]);
    setRows(r.data ?? []); setRole(u.data?.role ?? null);
  };
  useEffect(() => { load(); }, []);
  if (!rows) return <div className="loading">Reading the rooms…</div>;
  const mayEdit = ["owner", "executive", "planner", "dept_head"].includes(role);
  const unmeasured = rows.filter((r) => r.sqft == null);

  const save = async (code) => {
    const n = Number(draft);
    if (!isFinite(n) || n <= 0) { setMsg("Enter the square footage."); return; }
    if (!how || how.trim().length < 6) {
      setMsg("Say how it was measured. A number with no source is what put us here.");
      return;
    }
    const { error } = await supabase.from("grow_rooms")
      .update({ sqft: n, sqft_source: how.trim() }).eq("code", code);
    setMsg(error ? error.message
      : `${code} set to ${n.toLocaleString()} square feet. It now appears in every yield per square foot figure.`);
    if (!error) { setEdit(null); setHow(""); load(); }
  };

  return (
    <div className="calc">
      <div className="pagehead">
        <h1>Grow Rooms</h1>
        <p className="dashsub">
          Yield per square foot is the only fair way to compare one room against another. A room
          with no square footage on file is left out of that figure entirely.
          {unmeasured.length > 0 && <> <b className="vrwarn">{unmeasured.length} room
          {unmeasured.length === 1 ? " is" : "s are"} unmeasured, so{" "}
          {unmeasured.reduce((a, r) => a + Number(r.plant_capacity || 0), 0)} plants of canopy are
          invisible in the benchmark.</b></>}
        </p>
      </div>
      {msg && <div className="vrmsg">{msg}</div>}
      {!mayEdit && <div className="vrmsg">Entering a measurement needs an owner, executive,
        planner or department head. Your role is {role || "not set"}.</div>}

      <div className="vrgrid">
        {rows.map((r) => (
          <div key={r.code} className={`vrcard ${r.sqft == null ? "warn" : "ok"}`}>
            <div className="vrhead">
              <span className="vrname">{r.code} — {r.legacy_label}</span>
              <span className={`vrpill ${r.sqft == null ? "warn" : "ok"}`}>
                {r.sqft == null ? "never measured" : "measured"}
              </span>
            </div>
            <div className="vrbig">
              {r.sqft == null ? "—" : Number(r.sqft).toLocaleString()}<em> square feet</em>
            </div>
            <div className="vrline"><em>Plant capacity</em><b>{r.plant_capacity}</b></div>
            <div className="vrline"><em>Square feet per plant</em>
              <b>{r.sqft_per_plant ?? "cannot be worked out"}</b></div>
            <div className="vrline"><em>Cycle</em><b>{r.cycle_days} days</b></div>
            {r.sqft_source && <p className="vrnote">{r.sqft_source}</p>}
            <p className={r.sqft == null ? "cinpn" : "vrnote"}>{r.status}</p>
            {mayEdit && edit !== r.code && (
              <button className="vrbtn" onClick={() => { setEdit(r.code); setDraft(r.sqft ?? ""); setHow(""); setMsg(""); }}>
                {r.sqft == null ? "Enter the measurement" : "Change it"}
              </button>
            )}
            {mayEdit && edit === r.code && (
              <div className="vrform">
                <label>Square feet of canopy
                  <input autoFocus type="number" step="any" value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    placeholder={r.sqft_if_same_density ? `about ${r.sqft_if_same_density} at the same density` : ""} />
                </label>
                <label>How it was measured
                  <input value={how} placeholder="e.g. tape measured 2026-08-06, bench area only"
                    onChange={(e) => setHow(e.target.value)} />
                </label>
                <div className="vractions">
                  <button className="vrbtn primary" onClick={() => save(r.code)}>Save</button>
                  <button className="vrbtn" onClick={() => { setEdit(null); setMsg(""); }}>Cancel</button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function ControlTower({ go, session }) {
  const kpis = useLiveCounts();
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState(null);
  const sync = useSyncSummary();
  /* THE PERIOD BUS, MOUNTED — AND HONEST ABOUT WHAT IT CANNOT MOVE.
   *
   * Owner spec, docs/PERIOD_BUS_SPEC.md: "Mount the existing catalog + default hook",
   * and for pages whose figures are a position rather than a flow, "control still
   * visible; tiles that are position show As-of chip".
   *
   * This page is entirely the second kind, and that is a measured fact, not a guess:
   *
   *   v_control_tower   is (metric text, value numeric). No date column exists to
   *                     filter on, so every METRIC_GROUPS card is all-time.
   *   useLiveCounts()   is select("*", {count:"exact"}).limit(0) per KPI table — a
   *                     whole-table row count, with no date predicate available.
   *   useSyncSummary()  is the connector's state right now.
   *   TodayBoard        is fixed to today by its own definition.
   *
   * So the control inherits the governed default and can be changed, and `source`
   * makes RpDashboardDateRange state plainly that the tiles below do not follow it.
   * That prop already existed for exactly this case and had no caller until now.
   *
   * WHAT WAS DELIBERATELY NOT DONE. Wiring range.from/range.to into these queries
   * would mean inventing a date dimension the data does not have, and the spec
   * forbids it: "do not invent figures when the view has no date column — mark
   * as-of". Making the numbers move under a range they cannot honour is the exact
   * defect the disclosure exists to prevent. Ranging the Tower for real is a change
   * to v_control_tower — it must carry the date its own facts already hold — not a
   * change to this page. */
  const [, setRange] = useState({ from: "", to: "", ready: false });
  const onRange = React.useCallback((r) => setRange(r), []);
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
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <RpDashboardDateRange viewKey="tower" session={session}
            source="v_control_tower" onRange={onRange} />
          {session && <SyncCenter session={session} />}
        </div>
      </div>

      {/* THE HARVEST CONTROL BANNER — docs/HARVEST_CONTROL_LAW.md asks for it on
          Cultivation home AND here, for anything at severity 3 or above.

          THE SAME COMPONENT AND THE SAME VIEW, not a second copy. It reads
          v_harvest_control_banner, which holds the one definition of the four
          lines; Cultivation home mounts the identical component. Two pages, one
          source — they cannot drift, and a figure that moves on one moves on the
          other because it IS the other.

          Above the hero deliberately. A control line that waits for someone to
          scroll past the operational-status ring is not a control. */}
      <DkHarvestControlBanner go={go} />

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
                  {/* A refused count is not a zero. It says so on the card, in the
                      database's own words, rather than publishing the most alarming
                      number in the range as though it had been measured. */}
                  {k.err
                    ? <div className="vrow"><div className="value">not counted</div><div className="state">read failed</div></div>
                    : <div className="vrow"><div className="value">{Number(k.n ?? 0).toLocaleString()}</div><div className="state">records</div></div>}
                  {k.err && <div className="note">This count could not be read: {k.err}. The card still opens the module, and nothing here is a zero.</div>}
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

/* ── BRAIN RUNS REPORTS ────────────────────────────────────────────────────
   Owner, 8 Aug 2026: "the brain is called a brain for a reason it can run
   reports", "it must run and deliver reports".

   Matching is deliberately dumb and predictable: every word of the question
   must appear somewhere in the report's title, key, category or description.
   A cleverer matcher that guesses would hand somebody the wrong report, and a
   wrong report read as right is worse than no report at all. Ranked so a hit in
   the title beats a hit in the description. */
function brainMatchReports(term, all) {
  const words = term.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
  if (!words.length) return [];
  return all
    .map((r) => {
      const title = `${r.title ?? ""} ${r.report_key ?? ""}`.toLowerCase();
      const rest = `${r.category ?? ""} ${r.description ?? ""} ${r.owner_note ?? ""}`.toLowerCase();
      const hay = `${title} ${rest}`;
      if (!words.every((w) => hay.includes(w))) return null;
      return { r, score: words.filter((w) => title.includes(w)).length };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score)
    .slice(0, 6)
    .map((x) => x.r);
}

/* Delivered, not just displayed. Both formats come from the SAME rows the
   screen is showing, so a figure on the page and a figure in the file cannot
   differ - which is the whole reason to build the file here rather than
   re-query for it. */
function brainDownload(rows, name, kind) {
  if (!rows?.length) return;
  const cols = Object.keys(rows[0]);
  const cell = (v) => (v == null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v));
  let blob;
  let file;
  if (kind === "csv") {
    /* A leading =, + or - makes Excel treat a cell as a formula. Prefix with an
       apostrophe so a strain called "-Trim" stays text. */
    const safe = (v) => {
      const s = cell(v);
      const q = /^[=+\-@]/.test(s) ? "'" + s : s;
      return `"${q.replace(/"/g, '""')}"`;
    };
    blob = new Blob([[cols.join(","), ...rows.map((r) => cols.map((c) => safe(r[c])).join(","))].join("\n")],
      { type: "text/csv;charset=utf-8" });
    file = `${name}.csv`;
  } else {
    const esc = (v) => cell(v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    blob = new Blob([
      `<html xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="utf-8"></head><body><table border="1">`,
      `<tr>${cols.map((c) => `<th>${esc(c)}</th>`).join("")}</tr>`,
      rows.map((r) => `<tr>${cols.map((c) => `<td>${esc(r[c])}</td>`).join("")}</tr>`).join(""),
      `</table></body></html>`,
    ], { type: "application/vnd.ms-excel" });
    file = `${name}.xls`;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = file; a.click();
  /* Revoking immediately cancels the download in Safari and older Edge. */
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

function BrainReport({ rep, onClose }) {
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState(null);
  useEffect(() => {
    let live = true;
    (async () => {
      if (!rep.fact_view) { setErr("This report has no view recorded against it, so there is nothing to run."); return; }
      let sel = supabase.from(rep.fact_view).select("*");
      /* Newest first when the report knows which column carries its date. Not
         every one does - 111 of them drop a date their source carries, which is
         tracked separately and is not this component's job to hide. */
      if (rep.date_column) sel = sel.order(rep.date_column, { ascending: false, nullsFirst: false });
      const { data, error } = await sel.limit(500);
      if (!live) return;
      if (error) setErr(error.message); else setRows(data ?? []);
    })();
    return () => { live = false; };
  }, [rep.report_key, rep.fact_view, rep.date_column]);

  const cols = rows?.length ? Object.keys(rows[0]).slice(0, 12) : [];
  return (
    <div className="brainrep">
      <div className="brainrephead">
        <div>
          <b>{rep.title}</b>
          <span className="note" style={{ marginLeft: 8 }}>{rep.category} · {rep.fact_view}</span>
          {rep.owner_note && <div className="note">{rep.owner_note}</div>}
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <button className="btn small" disabled={!rows?.length}
            onClick={() => brainDownload(rows, rep.report_key, "csv")}>CSV</button>
          <button className="btn small" disabled={!rows?.length}
            onClick={() => brainDownload(rows, rep.report_key, "xls")}>Excel</button>
          <button className="btn small ghost" onClick={onClose}>Close</button>
        </div>
      </div>
      {err && <div className="msg err">{err}</div>}
      {!err && rows === null && <div className="note">Running it…</div>}
      {rows?.length === 0 && <div className="note">It ran and returned no rows. That is an answer, not a failure — nothing currently meets it.</div>}
      {rows?.length > 0 && (
        <>
          <div className="note">
            {rows.length === 500 ? "First 500 rows shown. The download carries the same 500 — say so before quoting a total." : `${rows.length} rows.`}
          </div>
          <div className="brainreptable">
            <table>
              <thead><tr>{cols.map((c) => <th key={c}>{c.replace(/_/g, " ")}</th>)}</tr></thead>
              <tbody>
                {rows.slice(0, 100).map((r, i) => (
                  <tr key={i}>{cols.map((c) => (
                    <td key={c}>{r[c] == null ? "" : typeof r[c] === "object" ? JSON.stringify(r[c]) : String(r[c])}</td>
                  ))}</tr>
                ))}
              </tbody>
            </table>
          </div>
          {rows.length > 100 && <div className="note">100 of {rows.length} shown. Download for all of them.</div>}
        </>
      )}
    </div>
  );
}


/* A section you set up once and then stop looking at. Owner, 8 Aug 2026: "no
   reason to see it all the time."

   Closed by default, remembered per person and per section. It is a real
   <button> with aria-expanded rather than a clickable div, so the keyboard and
   a screen reader get the same behaviour as the mouse - the same reason the
   red/green switch keeps a real checkbox underneath it. */
function BrainFold({ id, title, note, children, defaultOpen = false }) {
  const key = `tg.brain.fold.${id}`;
  const [open, setOpen] = useState(() => {
    try {
      const v = localStorage.getItem(key);
      return v === null ? defaultOpen : v === "1";
    } catch { return defaultOpen; }
  });
  const flip = () => {
    const next = !open;
    setOpen(next);
    try { localStorage.setItem(key, next ? "1" : "0"); } catch { /* private mode */ }
  };
  return (
    <div className="msection">
      <button className={`mtitle foldtitle${open ? " open" : ""}`} onClick={flip} aria-expanded={open}>
        <span className="sq" />
        <h2>{title}</h2>
        <span className="rule" />
        <span className="foldcaret" aria-hidden="true">{open ? "\u2013" : "+"}</span>
      </button>
      {open && (
        <>
          {note && <p className="bnote">{note}</p>}
          {children}
        </>
      )}
    </div>
  );
}

/* DOCUMENTS ONLY. Owner, 8 Aug 2026: "we also need one for only looking up
   files". When you want the manifest for a tag you want the manifest - not a
   paragraph about it, and not a 90-second wait while a model composes one.

   v_document_library already carries a search_text column built for this, over
   every COA and manifest on the platform. No model is involved and nothing is
   billed. Deliberately the plainest thing on the page. */
function BrainFiles() {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const find = async () => {
    const term = q.trim();
    if (!term) return;
    setBusy(true); setErr(null);
    /* document_search, NOT v_document_library. Owner, 8 Aug 2026: searching
       "orange cream" returned "canceling statement due to statement timeout".
       That view recomputes several joins on every query, and an ILIKE over a
       computed column cannot use an index - Postgres builds the whole thing,
       scans it, and hits the API limit. Same 3,675 documents, resolved once
       into a table with a trigram index, refreshed hourly. "orange cream" now
       returns 18 rows immediately. */
    const { data, error } = await supabase
      .from("document_search")
      .select("doc_type,package_tag,manifest_number,item_name,strain,shipper,customer,doc_date,license,download_url")
      .ilike("search_text", `%${term}%`)
      .limit(200);
    if (error) setErr(error.message); else setRows(data ?? []);
    setBusy(false);
  };
  return (
    <div className="agentspanel">
      <p className="bnote" style={{ margin: "0 0 10px" }}>
        Every COA and manifest on the platform. Search a package tag, a manifest number, a
        strain, a customer or a laboratory. No model, no waiting, nothing billed — and every
        result opens, downloads or prints.
      </p>
      <div className="askbar" style={{ marginBottom: 12 }}>
        <input value={q} placeholder="A tag, a manifest number, a strain, a customer, a lab…"
          onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") find(); }} />
        <button className="btn" onClick={find} disabled={busy}>{busy ? "…" : "Find"}</button>
      </div>
      {err && <div className="msg err">{err}</div>}
      {rows?.length === 0 && (
        <div className="note">
          Nothing matches that. It searches the text of the document record, so a partial tag or
          a partial manifest number works — this is not a report saying the document does not exist.
        </div>
      )}
      {rows?.length > 0 && (
        <>
          <div className="note">{rows.length}{rows.length === 200 ? "+ (first 200)" : ""} found.</div>
          <div className="brainreptable">
            <table>
              <thead>
                <tr><th>Type</th><th>Manifest</th><th>Package</th><th>Item</th>
                    <th>Strain</th><th>Customer</th><th>Licence</th><th>Open</th></tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i}>
                    <td>{r.doc_type}</td>
                    <td>{r.manifest_number}</td>
                    <td>{r.package_tag}</td>
                    <td>{r.item_name}</td>
                    <td>{r.strain}</td>
                    <td>{r.customer}</td>
                    <td>{r.license}</td>
                    <td>{r.download_url
                      ? <a href={r.download_url} target="_blank" rel="noreferrer">Open</a>
                      : <span className="note">no file</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function BrainScreen({ session, go, isExec, dictation }) {
  /* Identical to the pet and the assistant page - same hook, same limits, same
     three ways in. Owner, 8 Aug 2026: "we need to be able to upload files, and
     all the same items". */
  const bag = useChatFiles("brain");
  const voice = useVoice({ onHeard: (said) => { setQ(said); ask(said); } });
  const brainFileRef = useRef(null);
  const [log, setLog] = useState([]);
  /* The catalogue, read once. Brain matching a question to a report is the
     difference between "here is where you could look" and "here it is". */
  const [catalogue, setCatalogue] = useState([]);
  /* Owner, 8 Aug 2026: the Agents tab "is not working or user cant toggle to".
     It was a disabled M5 placeholder. The data it was waiting for already
     exists - agent_claims and v_agent_agreement - so the tab shows it. */
  const [tab, setTab] = useState("ask");
  const [repHits, setRepHits] = useState([]);
  const [running, setRunning] = useState(null);
  useEffect(() => {
    supabase.from("report_registry")
      .select("report_key,title,category,description,owner_note,fact_view,date_column")
      .eq("enabled", true).limit(2000)
      .then(({ data }) => setCatalogue(data ?? []));
  }, []);
  const [roleSel, setRoleSel] = useState(null);
  const [saved, setSaved] = useState(false);
  const [q, setQ] = useState("");
  const [results, setResults] = useState(null);
  const [searching, setSearching] = useState(false);
  const [quick, setQuick] = useState({});
  const [mem, setMem] = useState("");
  const [memSaved, setMemSaved] = useState(false);
  const [brainSaveMsg, setBrainSaveMsg] = useState(null);
  useEffect(() => {
    supabase.from("user_settings").select("brain_role").eq("user_id", session.user.id).maybeSingle()
      .then(({ data, error }) => {
        if (error) {
          setBrainSaveMsg({ kind: "err", text: `Your Brain role could not be read: ${error.message}` });
          announcePreferenceFailure("TG Brain role", error);
          return;
        }
        if (data?.brain_role) { setRoleSel(data.brain_role); setSaved(true); }
      });
    const in30 = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10);
    Promise.all([
      supabase.from("actions_register").select("id", { count: "exact", head: true }).eq("status", "open").eq("priority", "P0"),
      supabase.from("product_inventory").select("id", { count: "exact", head: true }).lt("expiration_date", in30),
      supabase.from("harvest_schedule").select("id", { count: "exact", head: true }).like("room_cycle_flag", "%VIOLATION%"),
      supabase.from("v_material_aging").select("lot_code", { count: "exact", head: true }).eq("aging_alert", "CAPITAL TIED UP"),
    ]).then(([a, b, c, d]) => setQuick({ p0: a.count ?? 0, exp: b.count ?? 0, cad: c.count ?? 0, tied: d.count ?? 0 }));
  }, [session.user.id]);
  /* THE SAME BRAIN THE PET AND THE ASSISTANT USE. Owner, 8 Aug 2026: "tg brain
     should be exactly as assistant too". One implementation, three surfaces -
     copying the pipeline here would be a fourth thing to keep in step, and
     keeping copies in step is what this codebase keeps getting wrong.

     The finders are KEPT. A global search over every table for a tag, a strain
     or a person is worth having and neither of the other two has it, so one
     question now does both: the records it found, and the answer to what was
     asked. They run together rather than in sequence - the search does not wait
     on a model, and the model does not wait on the search. */
  const ask = async (termArg) => {
    const term = String(termArg ?? q).replace(/[%,()]/g, " ").trim();
    if ((!term && !bag.files.length) || searching) return;
    const sending = bag.files.map((f) => f.name);
    if (sending.length) {
      setLog((l) => [...l, { who: "me", text: term || "(sent files)", files: sending }]);
      const up = await bag.upload(term);
      const good = up.filter((u) => !u.error);
      const bad = up.filter((u) => u.error);
      if (good.length) setLog((l) => [...l, { who: "brain", text: `Got ${good.length} file${good.length > 1 ? "s" : ""}. Saved and searchable.`, links: good.map((u) => u.url) }]);
      if (bad.length) setLog((l) => [...l, { who: "brain", text: `Could not take ${bad.map((b) => b.name).join(", ")}: ${bad[0].error}` }]);
    }
    if (!term) return;
    if (!sending.length) setLog((l) => [...l, { who: "me", text: term }]);
    setQ("");
    setSearching(true); setResults(null);
    const stamp = Date.now();
    const [found] = await Promise.all([
      Promise.all(BRAIN_FINDERS.map(async (f) => {
        try { const { data } = await f.run(term); return { f, rows: data ?? [] }; }
        catch { return { f, rows: [] }; }
      })),
      askBudzFull(term, log, {
        onFacts: (a, rows) => setLog((l) => [...l, { who: "brain", text: a.headline, rows, stamp, pending: true }]),
      }).then(({ composed, via, askErr }) => (voice.say(composed), true) &&
        setLog((l) => l.map((m) => m.stamp === stamp
          ? (composed ? { ...m, text: composed, researched: true, via, pending: false }
                      : { ...m, pending: false, askErr })
          : m))
      ).catch((e) =>
        setLog((l) => [...l, { who: "brain", text: `Could not reach the assistant: ${String(e?.message ?? e).slice(0, 140)}` }])
      ),
    ]);
    setResults(found.filter((x) => x.rows.length));
    setRepHits(brainMatchReports(term, catalogue));
    setSearching(false);
  };
  const pick = async (r) => {
    setRoleSel(r); setSaved(false);
    setBrainSaveMsg({ kind: "saving", text: "Saving your TG Brain role…" });
    const { error } = await supabase.from("user_settings")
      .upsert({ user_id: session.user.id, brain_role: r }, { onConflict: "user_id" });
    if (error) {
      setBrainSaveMsg({ kind: "err", text: `Your TG Brain role was not saved: ${error.message}` });
      announcePreferenceFailure("TG Brain role", error);
      return;
    }
    setSaved(true);
    setBrainSaveMsg({ kind: "ok", text: "TG Brain role saved to your account." });
  };
  const saveMem = async () => {
    if (!mem.trim()) return;
    setBrainSaveMsg({ kind: "saving", text: "Saving TG Brain memory…" });
    const { error } = await supabase.from("configurations").upsert({
      key: "brain_memory",
      value: { text: mem.trim().slice(0, 8000), saved_by: session.user.email, saved_at: new Date().toISOString() },
    }, { onConflict: "key" });
    if (error) {
      setBrainSaveMsg({ kind: "err", text: `TG Brain memory was not saved: ${error.message}` });
      announcePreferenceFailure("TG Brain memory", error);
      return;
    }
    setMemSaved(true);
    setBrainSaveMsg({ kind: "ok", text: "TG Brain memory saved." });
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
        {/* Two sentences. Owner, 8 Aug 2026: "strech this into to sentences so
            it does not take up so much of the lengh of apge at top" - five lines
            of explanation above the thing you came to use is five lines of the
            answer pushed off the screen. */}
        {/* Two sentences. Owner, 8 Aug 2026: "strech this into to sentences so
            it does not take up so much of the lengh of apge at top" - five lines
            of explanation above the thing you came to use is five lines of the
            answer pushed off the screen. */}
        <p className="bsub">Every record this company generates — Metrc, the rooms, the floor, the sheets, the money — one mind, answering from live data only and never from guesses. Ask it anything, look up any document, or attach your own.</p>
        <div className="askwrap">
          <div className="asktabs">
            <button className={tab === "ask" ? "on" : ""} onClick={() => setTab("ask")}>
              {I.dna} Ask / Find
            </button>
            <button className={tab === "files" ? "on" : ""} onClick={() => setTab("files")}
              title="Look up a COA or a manifest. Documents only - no model, no waiting.">
              {I.clip} Files
            </button>
            <button className={tab === "agents" ? "on" : ""} onClick={() => setTab("agents")}
              title="Every agent's claim about this company, and where two of them disagree">
              {I.gear} Agents
            </button>
          </div>
          {tab === "files" && <BrainFiles />}
          {tab === "agents" && (
            <div className="agentspanel">
              <p className="bnote" style={{ margin: "0 0 10px" }}>
                Every agent working on this company records what it CLAIMS to be true, with the
                query behind it. Where two agents disagree, the disagreement is the finding — it
                is never averaged away, and it is never hidden because it is awkward.
              </p>
              <BrainReport
                rep={{ report_key: "agent_agreement", title: "Do the agents agree",
                       category: "Audit", fact_view: "v_agent_agreement", date_column: null,
                       owner_note: "Disagreement between two agents is a finding in its own right. Read the rows where they differ first." }}
                onClose={() => setTab("ask")} />
            </div>
          )}
          {tab === "ask" && (
          <>
          <ChatFiles bag={bag} />
          <div className={`askbar${bag.dropping ? " dropping" : ""}`} {...bag.dropProps}>
            <input ref={brainFileRef} type="file" multiple style={{ display: "none" }}
              onChange={(e) => { bag.add(e.target.files); e.target.value = ""; }} />
            {/* Owner, 8 Aug 2026: "cant see this make it bold". A ghost button
                renders a grey glyph on a near-black bar, which is close to
                invisible. It is the accent colour and larger now. */}
            <VoiceButtons voice={voice} />
            <button className="btn ghost clipbtn" title="Attach anything - documents, zips, images, video. Drag them onto this bar, or paste."
              onClick={() => brainFileRef.current?.click()}>📎</button>
            <input value={q} placeholder="Ask anything, or search for a tag, a strain, a batch, a person…"
              onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") ask(); }} />
            <button className="btn" onClick={() => ask()}>{searching ? "…" : "Ask"}</button>
          </div>
          {log.length > 0 && (
            <div className="brainlog">
              {log.map((m, i) => (
                <div key={i} className={`brainmsg ${m.who}`}>
                  <div className="bmtext">{m.text}</div>
                  {m.files?.length > 0 && <div className="bmfiles">{m.files.join(", ")}</div>}
                  {m.links?.length > 0 && (
                    <div className="bmfiles">
                      {m.links.map((u, n) => <a key={n} href={u} target="_blank" rel="noreferrer">file {n + 1}</a>)}
                    </div>
                  )}
                  {m.pending && <Thinking since={m.stamp} />}
                  {m.researched && m.via && <div className="bmvia">Researched by {m.via}</div>}
                  {/* Rule A3: absence is explained, never blank. */}
                  {m.askErr && <div className="bmerr">{m.askErr}</div>}
                </div>
              ))}
            </div>
          )}
          </>
          )}
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
      {running && (
        <div className="msection">
          <div className="mtitle"><span className="sq" /><h2>{running.title}</h2><span className="rule" /></div>
          <BrainReport rep={running} onClose={() => setRunning(null)} />
        </div>
      )}
      {repHits.length > 0 && (
        <div className="msection">
          <div className="mtitle"><span className="sq" /><h2>Reports that answer this</h2><span className="rule" /></div>
          <p className="bnote">
            Matched from the report catalogue. Click one and Brain runs it here against live
            data — no page to find, no filters to set up — and hands you CSV or Excel.
          </p>
          <div className="brainreps">
            {repHits.map((r) => (
              <button key={r.report_key} className={`brainrepchip${running?.report_key === r.report_key ? " on" : ""}`}
                onClick={() => setRunning(r)} title={r.description || r.title}>
                <span className="brct">{r.title}</span>
                <span className="brcc">{r.category}</span>
              </button>
            ))}
          </div>
        </div>
      )}
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
      {/* OPEN BY DEFAULT. Owner, 8 Aug 2026: "this should always show by
          default each sign in unless user hides". Which seat you run changes
          every briefing on the platform, so it is worth seeing; the other two
          are wiring you set once. Hiding it is still remembered. */}
      <BrainFold id="seat" defaultOpen title="What do you run?"
        note="Brain tailors briefings, alerts, and your Control Tower to your seat. Saved to your account as data — change it any time.">
        <div className="rolegrid">
          {BRAIN_ROLES.map((r) => (
            <button key={r} className={`rolechip ${roleSel === r ? "on" : ""}`} onClick={() => pick(r)}>{r}</button>
          ))}
        </div>
        {saved && roleSel && <div className="bsaved">{I.check} Tailored for <b>{roleSel}</b> — your boards and briefings will lead with what you run.</div>}
        {brainSaveMsg && <div className={brainSaveMsg.kind === "err" ? "msg err" : "note"} role={brainSaveMsg.kind === "err" ? "alert" : "status"}>{brainSaveMsg.text}</div>}
      </BrainFold>
      <BrainFold id="sources" title="Connected sources"
        note="What Brain can read. Connections are controlled by admin settings and user permissions.">
        <div className="connrows">
          <div className="connrow"><span className="cn">Metrc (state system)</span><span className="cs on">CONNECTED</span></div>
          <div className="connrow"><span className="cn">Finished-Goods Google Sheet</span><span className="cs on">CONNECTED</span></div>
          <div className="connrow"><span className="cn">QuickBooks Online</span>
            {isExec ? <button className="btn small" onClick={() => go("integrations")}>Set up</button> : <span className="cs">ADMIN CONTROLLED</span>}</div>
          <div className="connrow"><span className="cn">Monday.com</span>
            {isExec ? <button className="btn small" onClick={() => go("integrations")}>Set up</button> : <span className="cs">ADMIN CONTROLLED</span>}</div>
        </div>
      </BrainFold>
      {isExec && (
        <BrainFold id="memory" title="Import memory"
          note="Admin only. Paste standing context — how the company runs, preferences, priorities. It is stored as data and travels with every question Brain, Budz and the pet answer.">
          <textarea className="memta" rows={5} value={mem} onChange={(e) => { setMem(e.target.value); setMemSaved(false); }}
            placeholder="Paste company context, preferences, standing priorities…" />
          <div style={{ marginTop: 10, display: "flex", gap: 10, alignItems: "center" }}>
            <button className="btn" onClick={saveMem}>Import memory</button>
            {memSaved && <span className="bsaved">{I.check} Stored — audited, admin-only.</span>}
          </div>
          {brainSaveMsg?.kind === "err" && <div className="msg err" role="alert">{brainSaveMsg.text}</div>}
        </BrainFold>
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
  const [dFrom, setDFrom] = useState("");
  const [dTo, setDTo] = useState("");
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
    inRange(r.created_at, dFrom, dTo) &&
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
        <DateRangeSelect label="raised" from={dFrom} to={dTo} onFrom={setDFrom} onTo={setDTo} />
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
  const { filtered: shownBoards, toolbar } = useClientToolbar(boards, { name: "whiteboards" });
  if (open) return <WhiteboardEditor board={open} onBack={() => { setOpen(null); setVer((v) => v + 1); }} />;
  return (
    <>
      <div className="pagehead">
        <div><h1>Whiteboards</h1><div className="sub">Sketch, plan, and pin notes — saved to the database, private or shared. Live multi-user cursors arrive with the Work Layer.</div></div>
      </div>
      <form className="teamform" onSubmit={create}>
        <input placeholder="Name this whiteboard…" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        {/* Owner, 8 Aug 2026: "DO NOT USE CHECK BOX USE TOGGLE RED AND GREEN".
            Same switch as the assistant settings - one control for on and off
            everywhere, so on never looks like two different things. */}
        <span className="wbpriv" style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          <RedGreen on={!form.priv} title="Share with everyone"
            onChange={() => setForm({ ...form, priv: !form.priv })} />
          Share with everyone (private by default)
        </span>
        <button className="btn" type="submit">Create whiteboard</button>
      </form>
      {boards === null ? <div className="empty"><div className="eicon">{I.board}</div>Loading…</div> : boards.length === 0 ? (
        <div className="empty"><div className="eicon">{I.board}</div><b>No whiteboards yet</b>Create one above — draw with the pen, drop sticky notes, hit Save.</div>
      ) : (
        <>
        {toolbar}
        <div className="teamgrid">
          {shownBoards.map((b) => (
            <button key={b.id} className="teamcard tplcard" onClick={() => setOpen(b)}>
              <span className="tcname">{b.name}{b.is_private && <span className="mtag">PRIVATE</span>}</span>
              <span className="tpldesc">{(b.content?.strokes?.length ?? 0)} strokes · {(b.content?.notes?.length ?? 0)} notes</span>
              <span className="tccount">updated {new Date(b.updated_at).toLocaleDateString()}</span>
            </button>
          ))}
        </div>
        </>
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
            <span className="note" style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <RedGreen on={!priv} title="Share with everyone" onChange={() => setPriv(!priv)} />
              Share with everyone (private by default)
            </span>
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
  /* Search and date filter the list on screen. done/total and the progress bar
     deliberately still count the WHOLE set — filtering the view must not make it
     look as though the work shrank. */
  const { filtered, toolbar } = useClientToolbar(items, { name: "go-live-items" });
  if (items === null) return <div className="empty"><div className="eicon">{I.check}</div>Loading…</div>;
  if (items.length === 0) return <div className="empty"><div className="eicon">{I.check}</div><b>Nothing tracked yet</b>Go-live items appear here the moment they are registered.</div>;
  const done = items.filter((i) => i.status === "done").length;
  const pct = Math.round((done / items.length) * 100);
  const phases = [...new Map(filtered.map((i) => [i.phase, i.phase_name]))].sort((a, b) => a[0] - b[0]);
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
      {toolbar}
      {phases.map(([ph, phname]) => {
        const list = filtered.filter((i) => i.phase === ph);
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
          <div className="sub">The team&rsquo;s live inventory sheet, mirrored tab for tab. Crews keep working in Google Sheets — one press of Sync updates the whole platform for everyone.</div>
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
        <div className="empty"><div className="eicon">{I.box}</div><b>No rows in this product line yet</b>Press Sync to pull the latest from the team&rsquo;s sheet.</div>
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
/* ---------- Settings → Metrc Scan Schedule ----------
   Design cloned exactly from the owner-approved page, 6 Aug 2026. Every rule is
   scoped under .tgss so it cannot collide with the rest of the platform, and the
   palette is fixed rather than themed, because the approved design is dark.
   Schedule rows and the timeline read live from v_metrc_scan_settings. */
const TGSS_CSS = `
.tgss{--g:#080B09;--pnl:#0F1411;--ln:#1E2A22;--ink:#EAF3EC;--dim:#8FA396;--faint:#5C6E63;
  --neon:#3DFF6E;--neonsoft:#3DFF6E22;--red:#FF4438;
  --mono:ui-monospace,"SF Mono","Cascadia Mono","Roboto Mono",Menlo,Consolas,monospace;
  background:var(--g);color:var(--ink);line-height:1.5;padding:clamp(20px,4vw,52px) clamp(16px,4vw,40px);
  display:flex;flex-direction:column;gap:40px}
.tgss *{box-sizing:border-box}
.tgss .eyebrow{font-family:var(--mono);font-size:11px;letter-spacing:.16em;text-transform:uppercase;
  color:var(--neon);margin:0 0 10px}
.tgss h1{font-size:clamp(28px,4.4vw,42px);line-height:1.08;margin:0;font-weight:650;
  letter-spacing:-.02em;text-wrap:balance;color:var(--ink)}
.tgss .sub{color:var(--dim);margin:12px 0 0;max-width:62ch;font-size:15px}
.tgss .headline{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:1px;
  background:var(--ln);border:1px solid var(--ln);border-radius:3px;overflow:hidden}
.tgss .stat{background:var(--pnl);padding:20px 22px}
.tgss .stat .k{font-family:var(--mono);font-size:10.5px;letter-spacing:.13em;text-transform:uppercase;
  color:var(--faint);margin:0 0 10px}
.tgss .stat .v{font-family:var(--mono);font-size:29px;font-weight:600;letter-spacing:-.02em;
  font-variant-numeric:tabular-nums;line-height:1}
.tgss .stat .n{font-size:12.5px;color:var(--dim);margin:8px 0 0}
.tgss .was .v{color:var(--red)}.tgss .now .v{color:var(--neon)}.tgss .cut .v{color:var(--neon)}
.tgss h2{font-size:19px;font-weight:620;margin:0 0 4px;letter-spacing:-.01em;color:var(--ink)}
.tgss .lede{color:var(--dim);font-size:14px;margin:0 0 18px;max-width:64ch}
.tgss .scroll{overflow-x:auto;border:1px solid var(--ln);border-radius:3px;background:var(--pnl)}
.tgss .tl{min-width:720px;padding:20px 22px 8px}
.tgss .tlrow{display:grid;align-items:center;
  min-height:38px;border-bottom:1px solid var(--ln)}
.tgss .tlrow:last-child{border-bottom:0}
.tgss .tlhead{min-height:30px}
.tgss .tlhead .hr{font-family:var(--mono);font-size:10px;color:var(--faint);text-align:center;letter-spacing:.04em}
.tgss .nm{font-size:13.5px;font-weight:560;padding-right:14px}
.tgss .nm small{display:block;font-weight:400;color:var(--faint);font-size:11px;
  font-family:var(--mono);letter-spacing:.02em}
.tgss .cell{height:100%;display:flex;align-items:center;justify-content:center;
  border-left:1px solid rgba(30,42,34,.55)}
.tgss .dot{width:11px;height:11px;border-radius:50%;background:var(--neon);box-shadow:0 0 0 4px var(--neonsoft)}
.tgss .dot.q{background:var(--faint);box-shadow:none;width:7px;height:7px}
.tgss table{border-collapse:collapse;width:100%;min-width:620px;font-size:13.5px}
.tgss th,.tgss td{text-align:left;padding:11px 16px;border-bottom:1px solid var(--ln)}
.tgss th{font-family:var(--mono);font-size:10px;letter-spacing:.13em;text-transform:uppercase;
  color:var(--faint);font-weight:500}
.tgss tbody tr:last-child td{border-bottom:0}
.tgss td.num{font-family:var(--mono);text-align:right;font-variant-numeric:tabular-nums}
.tgss .times{font-family:var(--mono);font-size:12px;color:var(--dim)}
.tgss tr.off td{color:var(--faint)}
.tgss tr.total td{border-top:2px solid var(--ln);font-weight:640}
.tgss .pill{display:inline-block;font-family:var(--mono);font-size:10px;letter-spacing:.08em;
  text-transform:uppercase;padding:3px 8px;border-radius:2px;border:1px solid}
.tgss .pill.on{color:var(--neon);border-color:var(--neon);background:var(--neonsoft)}
.tgss .pill.no{color:var(--red);border-color:var(--red)}
.tgss .bars{display:flex;flex-direction:column;gap:16px}
.tgss .bar b{display:block;font-size:13px;font-weight:560;margin-bottom:7px}
.tgss .bar b span{float:right;font-family:var(--mono);color:var(--dim);font-weight:400;font-variant-numeric:tabular-nums}
.tgss .track{height:26px;background:var(--pnl);border:1px solid var(--ln);border-radius:2px;overflow:hidden}
.tgss .fill{height:100%}
.tgss .fill.red{background:var(--red)}.tgss .fill.grn{background:var(--neon)}
.tgss .note{border-left:2px solid var(--neon);padding:2px 0 2px 16px;color:var(--dim);font-size:14px;max-width:66ch}
.tgss .note strong{color:var(--ink);font-weight:600}
.tgss .rule{height:1px;background:var(--ln);border:0;margin:0}
.tgss footer{color:var(--faint);font-size:12px;font-family:var(--mono);letter-spacing:.02em}
`;
const tgssTimeKey = (t) => String(t || "").slice(0, 5);
const tgssTimeLabel = (t) => {
  const [rawHour, rawMinute = "00"] = tgssTimeKey(t).split(":");
  const hour = Number(rawHour);
  if (!Number.isFinite(hour)) return String(t || "—");
  const suffix = hour >= 12 ? "pm" : "am";
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${rawMinute}${suffix}`;
};
function MetrcScanSchedule() {
  const [read, setRead] = useState({ rows: null, error: null });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let live = true;
    setRead({ rows: null, error: null });
    supabase.from("v_metrc_scan_settings").select("*").order("sort_order")
      .then(({ data, error }) => {
        if (!live) return;
        if (error) { setRead({ rows: null, error }); return; }
        setRead({ rows: Array.isArray(data) ? data : [], error: null });
      });
    return () => { live = false; };
  }, [attempt]);
  const rows = read.rows || [];
  const enabledRows = rows.filter((row) => row.enabled);
  const scheduledScans = enabledRows.reduce((sum, row) => sum + Number(row.scans_per_day || 0), 0);
  const scheduledCalls = enabledRows.reduce((sum, row) => sum + Number(row.calls_per_day || 0), 0);
  const timelineTimes = [...new Set(enabledRows.flatMap((row) => (row.run_times || []).map(tgssTimeKey)).filter(Boolean))].sort();
  const timelineGrid = { gridTemplateColumns: `132px repeat(${Math.max(timelineTimes.length, 1)}, minmax(52px, 1fr))` };
  return (
    <div className="tgss">
      <style>{TGSS_CSS}</style>
      <header>
        <p className="eyebrow">Twisted Growers · Metrc integration</p>
        <h1>Scan schedule</h1>
        <p className="sub">The Metrc scan groups, run times, and call counts returned by the governed
          scan-settings view. This page does not estimate activity that the view does not provide.</p>
      </header>

      {read.error ? (
        <ReadFailure what="The Metrc scan settings" error={read.error} onRetry={() => setAttempt((n) => n + 1)} />
      ) : read.rows === null ? (
        <div className="note">Reading the governed scan schedule…</div>
      ) : rows.length === 0 ? (
        <div className="note"><strong>No configured scan rows were returned.</strong> No schedule,
          activity, reduction, or health conclusion can be calculated from an empty result.</div>
      ) : <>
        <section className="headline">
          <div className="stat"><p className="k">Configured scan groups</p>
            <p className="v">{rows.length.toLocaleString()}</p><p className="n">Rows returned by the governed view</p></div>
          <div className="stat"><p className="k">Enabled scans per day</p>
            <p className="v">{scheduledScans.toLocaleString()}</p><p className="n">Sum of enabled view rows</p></div>
          <div className="stat"><p className="k">Enabled calls per day</p>
            <p className="v">{scheduledCalls.toLocaleString()}</p><p className="n">Sum of enabled view rows</p></div>
        </section>

        <section>
          <h2>Configured run times</h2>
          <p className="lede">Each dot is a run time returned for that enabled scan group.</p>
          {timelineTimes.length ? <div className="scroll"><div className="tl">
            <div className="tlrow tlhead" style={timelineGrid}>
              <div />
              {timelineTimes.map((time) => <div key={time} className="hr">{tgssTimeLabel(time)}</div>)}
            </div>
            {enabledRows.map((row) => {
              const rowTimes = new Set((row.run_times || []).map(tgssTimeKey));
              return (
                <div className="tlrow" style={timelineGrid} key={row.job_name}>
                  <div className="nm">{row.display_name || row.job_name}<small>{row.endpoints || "No endpoint label"}</small></div>
                  {timelineTimes.map((time) => (
                    <div className="cell" key={time}>{rowTimes.has(time) ? <i className="dot" /> : null}</div>
                  ))}
                </div>
              );
            })}
          </div></div> : <div className="note">No run times were returned for the enabled scan groups.</div>}
        </section>

        <section>
          <h2>Configured scan groups</h2>
          <p className="lede">Every row below comes directly from <code>v_metrc_scan_settings</code>.</p>
          <div className="scroll">
            <table>
              <thead><tr>
                <th>Scan</th><th>Run times</th><th className="num">Scans/day</th>
                <th className="num">Calls/day</th><th>Status</th>
              </tr></thead>
              <tbody>
                {rows.map((row) => (
                  <tr className={row.enabled ? "" : "off"} key={row.job_name}>
                    <td>{row.display_name || row.job_name}</td>
                    <td className="times">{(row.run_times || []).map(tgssTimeLabel).join(" · ") || "—"}</td>
                    <td className="num">{Number(row.scans_per_day || 0).toLocaleString()}</td>
                    <td className="num">{Number(row.calls_per_day || 0).toLocaleString()}</td>
                    <td><span className={`pill ${row.enabled ? "on" : "no"}`}>{row.enabled ? "on" : "off"}</span></td>
                  </tr>
                ))}
                <tr className="total"><td>Enabled total</td><td />
                  <td className="num">{scheduledScans.toLocaleString()}</td>
                  <td className="num">{scheduledCalls.toLocaleString()}</td><td /></tr>
              </tbody>
            </table>
          </div>
        </section>

        <footer>Source: v_metrc_scan_settings. No unsourced before/after, reduction, reconcile,
          record-count, overnight, or manual-scan figures are inferred.</footer>
      </>}
    </div>
  );
}

/* ---------- Settings → Metrc Report Imports (administrators only) ----------
   Metrc has no reports API. Nine of the figures this business runs on — moisture
   loss, wholesale price, plant waste — exist only in a report you export by hand.
   This page names every one of them, says what each adds that the API cannot give,
   when it is owed, and takes the upload. Nothing is mapped by the person uploading:
   tg_detect_report identifies the file from its column names, because Metrc appends
   (1), (2), (3) to filenames and people rename them. */
const TGRI_CSS = `
.tgss .up{border:1px dashed var(--ln);border-radius:3px;background:var(--pnl);padding:28px 24px;
  text-align:center;transition:border-color .15s,background .15s}
.tgss .up.hot{border-color:var(--neon);background:#0F1411}
.tgss .up input{display:none}
.tgss .up label{display:inline-block;font-family:var(--mono);font-size:12px;letter-spacing:.08em;
  text-transform:uppercase;color:var(--g);background:var(--neon);padding:11px 22px;border-radius:2px;
  cursor:pointer;font-weight:600}
.tgss .up p{color:var(--dim);font-size:13.5px;margin:14px 0 0}
.tgss .req{display:grid;gap:1px;background:var(--ln);border:1px solid var(--ln);border-radius:3px;overflow:hidden}
.tgss .req .r{background:var(--pnl);padding:16px 20px;display:grid;
  grid-template-columns:26px 1fr auto;gap:16px;align-items:start}
.tgss .req .r.crit{background:#160B0A;box-shadow:inset 3px 0 0 var(--red)}
.tgss .req .r.ok{box-shadow:inset 3px 0 0 var(--neon)}
.tgss .req .n{font-family:var(--mono);font-size:12px;color:var(--faint);padding-top:2px;
  font-variant-numeric:tabular-nums}
.tgss .req b{display:block;font-size:14.5px;font-weight:600;margin-bottom:5px}
.tgss .req .why{color:var(--dim);font-size:13px;margin:0;max-width:74ch}
.tgss .req .path{font-family:var(--mono);font-size:11px;color:var(--faint);margin:8px 0 0;
  letter-spacing:.02em}
.tgss .req .st{text-align:right;white-space:nowrap}
.tgss .msg{border:1px solid var(--ln);border-left:2px solid var(--neon);border-radius:3px;
  background:var(--pnl);padding:16px 20px;font-size:14px;color:var(--dim)}
.tgss .msg.bad{border-left-color:var(--red)}
.tgss .msg b{color:var(--ink);display:block;margin-bottom:5px;font-size:14.5px}
.tgss .who{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px}
.tgss .who span{font-family:var(--mono);font-size:10.5px;letter-spacing:.1em;text-transform:uppercase;
  border:1px solid var(--ln);color:var(--dim);padding:5px 11px;border-radius:2px}
`;

/* Metrc exports CSV with quoted fields that can contain commas and newlines. */
function parseCsv(text) {
  const rows = [];
  let row = [], field = "", quoted = false;
  const s = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  for (let i = 0; i < s.length; i += 1) {
    const c = s[i];
    if (quoted) {
      if (c === '"') { if (s[i + 1] === '"') { field += '"'; i += 1; } else quoted = false; }
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (c !== "\r") field += c;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((v) => v.trim() !== ""));
}

/* Metrc puts a licence banner and blank lines above the real header. The header is
   the first row with three or more non-empty cells and no duplicate names. */
function toObjects(grid) {
  let h = 0;
  for (let i = 0; i < Math.min(grid.length, 25); i += 1) {
    const cells = grid[i].map((c) => c.trim()).filter(Boolean);
    if (cells.length >= 3 && new Set(cells).size === cells.length) { h = i; break; }
  }
  const head = grid[h].map((c) => c.trim().replace(/\s+/g, " "));
  return grid.slice(h + 1)
    .map((r) => Object.fromEntries(head.map((k, i) => [k, (r[i] ?? "").trim()]).filter(([k]) => k)))
    .filter((o) => Object.values(o).some((v) => v !== ""));
}

function MetrcReportImports({ session }) {
  const [due, setDue] = useState(null);
  const [types, setTypes] = useState(null);
  const [recent, setRecent] = useState([]);
  const [queue, setQueue] = useState([]);
  const [coverage, setCoverage] = useState([]);
  const [pending, setPending] = useState(null);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const [hot, setHot] = useState(false);

  const load = useCallback(async () => {
    const [d, t, r, q, c] = await Promise.all([
      supabase.from("v_report_upload_due").select("*"),
      supabase.from("metrc_report_types").select("*").order("upload_priority"),
      supabase.from("metrc_report_imports").select("*").order("imported_at", { ascending: false }).limit(20),
      supabase.from("v_agentmapper_queue").select("*"),
      supabase.from("v_report_coverage").select("*"),
    ]);
    setDue(d.data ?? []); setTypes(t.data ?? []); setRecent(r.data ?? []);
    setQueue(q.data ?? []); setCoverage(c.data ?? []);
  }, []);
  useEffect(() => { load(); }, [load]);

  /* Nothing is written until the person uploading has seen what it would do.
     The preview says how many rows are new and how many already exist and would
     be updated; only then is there a choice to make. */
  async function ingest(files) {
    setBusy(true); setMsg(null); setPending(null);
    const staged = [];
    for (const f of Array.from(files)) {
      try {
        const text = await f.text();
        const rows = toObjects(parseCsv(text));
        if (!rows.length) { staged.push({ ok: false, file: f.name, error: "No rows found in the file." }); continue; }
        /* Metrc stamps the licence and the as-of date in the banner above the
           header. Read them rather than asking for something the file already says. */
        const banner = text.slice(0, 3000);
        const lic = (`${f.name} ${banner}`.match(/\bM[CP]\d{6}\b/) ?? [null])[0];
        const dm = banner.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/);
        const asOf = dm ? `${dm[3]}-${String(dm[1]).padStart(2, "0")}-${String(dm[2]).padStart(2, "0")}` : null;
        const { data, error } = await supabase.rpc("tg_import_preview", {
          p_rows: rows, p_file_name: f.name,
        });
        if (error) { staged.push({ ok: false, file: f.name, error: error.message }); continue; }
        staged.push({ ...data, file: f.name, rows, licence: lic, as_of: asOf });
      } catch (e) {
        staged.push({ ok: false, file: f.name, error: String(e.message ?? e) });
      }
    }
    setBusy(false);
    if (staged.every((s) => !s.ok)) setMsg(staged);
    else setPending(staged);
  }

  async function commit(mode) {
    setBusy(true);
    const results = [];
    for (const s of pending ?? []) {
      if (!s.ok) { results.push(s); continue; }
      const { data, error } = await supabase.rpc("tg_import_report", {
        p_rows: s.rows, p_licence: s.licence, p_as_of: s.as_of,
        p_file_name: s.file, p_mode: mode,
      });
      results.push(error ? { ok: false, file: s.file, error: error.message } : { ...data, file: s.file });
    }
    setMsg(results); setPending(null); setBusy(false); load();
  }

  const monthly = (due ?? []).filter((r) => (r.cadence ?? "").startsWith("Monthly"));
  const outstanding = monthly.filter((r) => !r.received).length;
  const other = (due ?? []).filter((r) => !(r.cadence ?? "").startsWith("Monthly"));
  const onDemand = (types ?? []).filter((t) => (t.cadence ?? "").startsWith("On demand"));

  const Row = ({ r, n }) => (
    <div className={`r ${r.received ? "ok" : (r.severity === "critical" ? "crit" : "")}`}>
      <div className="n">{n}</div>
      <div>
        <b>{r.title} — {r.licence}</b>
        <p className="why">{r.why_it_matters}</p>
        <p className="path">In Metrc: {r.menu_path} · covers {r.period_label}</p>
      </div>
      <div className="st">
        <span className={`pill ${r.received ? "on" : "no"}`}>{r.received ? "received" : "not yet"}</span>
        <p className="path" style={{ marginTop: 8 }}>{r.upload_status}</p>
      </div>
    </div>
  );

  return (
    <div className="tgss">
      <style>{TGSS_CSS}{TGRI_CSS}</style>
      <header>
        <p className="eyebrow">Twisted Growers · Metrc integration · administrators only</p>
        <h1>Metrc report imports</h1>
        <p className="sub">Metrc publishes no reports API — nine of the figures this business runs on exist
          only inside a report you export by hand. Drop any Metrc export below and it maps itself. You never
          choose a type: the file is recognised from its column names, so a rename or a “(3)” makes no
          difference.</p>
      </header>

      <section className="headline">
        <div className={outstanding ? "stat was" : "stat now"}>
          <p className="k">Owed this month</p>
          <p className="v">{outstanding}</p>
          <p className="n">{outstanding ? "Uploads not yet received" : "Everything required has arrived"}</p>
        </div>
        <div className="stat now"><p className="k">Reports mapped</p>
          <p className="v">{(types ?? []).length}</p>
          <p className="n">Recognised automatically on upload</p></div>
        <div className="stat cut"><p className="k">Monthly uploads needed</p>
          <p className="v">{monthly.length}</p>
          <p className="n">Deliberately the smallest set that works</p></div>
      </section>

      <section>
        <h2>Upload</h2>
        <p className="lede">Export from Metrc as <strong>CSV</strong>. Several files at once is fine.</p>
        <div className={`up ${hot ? "hot" : ""}`}
          onDragOver={(e) => { e.preventDefault(); setHot(true); }}
          onDragLeave={() => setHot(false)}
          onDrop={(e) => { e.preventDefault(); setHot(false); ingest(e.dataTransfer.files); }}>
          <input id="tgri-file" type="file" accept=".csv,text/csv" multiple disabled={busy}
            onChange={(e) => { ingest(e.target.files); e.target.value = ""; }} />
          <label htmlFor="tgri-file">{busy ? "Reading…" : "Choose files"}</label>
          <p>or drag them here</p>
        </div>
        <p className="note" style={{ marginTop: 18 }}>
          <strong>Tick every column before you export.</strong> Metrc exports only the columns visible in
          the grid — a file exported with columns hidden arrives with those figures missing entirely, and
          Moisture Loss is hidden by default. Use the column selector above the table and turn everything
          on. If a file is not recognised, this page names the report it came closest to and lists exactly
          which columns were absent.</p>
        {/* Nothing has been written yet. This is the last point at which the
            person uploading can see what the file would change. */}
        {pending ? (
          <div style={{ display: "grid", gap: 10, marginTop: 18 }}>
            {pending.map((p, i) => (
              <div key={i} className={`msg ${p.ok ? "" : "bad"}`}>
                <b>{p.file}</b>
                {p.ok ? (
                  <>
                    Recognised as <strong>{p.title}</strong>. {(p.rows_in_file ?? 0).toLocaleString()} rows —{" "}
                    <strong>{(p.brand_new ?? 0).toLocaleString()} new</strong>
                    {p.already_held > 0 && (
                      <>, <strong style={{ color: "#f5c542" }}>
                        {p.already_held.toLocaleString()} already held and would be overwritten
                      </strong></>
                    )}
                    .{p.as_of ? ` Covers up to ${p.as_of}.` : ""}
                    <div className="pidwhy" style={{ marginTop: 6 }}>{p.note}</div>
                  </>
                ) : p.error}
              </div>
            ))}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <button className="vetab" disabled={busy} onClick={() => commit("new_only")}>
                Add new rows only — change nothing already held
              </button>
              <button className="vetab" disabled={busy} onClick={() => commit("update")}>
                Add new and update what is held
              </button>
              <button className="vetab" disabled={busy} onClick={() => setPending(null)}>
                Cancel
              </button>
            </div>
            <p className="note">
              <strong>Either choice is safe.</strong> A complete copy of every affected row is saved before
              anything is written, and any import can be put back in one click from the list below.</p>
          </div>
        ) : null}

        {msg ? (
          <div style={{ display: "grid", gap: 10, marginTop: 18 }}>
            {msg.map((m, i) => (
              <div key={i} className={`msg ${m.ok ? "" : "bad"}`}>
                <b>{m.file}</b>
                {m.ok
                  ? `Recognised as ${m.title}. ${(m.rows_added ?? 0).toLocaleString()} rows added, `
                    + `${(m.rows_updated ?? 0).toLocaleString()} updated, `
                    + `${(m.rows_backed_up ?? 0).toLocaleString()} backed up first. Landed in ${m.target_table}.`
                  : m.error}
              </div>
            ))}
          </div>
        ) : null}
      </section>

      <hr className="rule" />

      <section>
        <h2>Required every month</h2>
        <p className="lede">Only what cannot be obtained any other way. Everything the API can already
          deliver has been kept off this list on purpose — there is no value in uploading it by hand.</p>
        <div className="req">{monthly.map((r, i) => <Row key={r.report_key + r.licence} r={r} n={i + 1} />)}</div>
        <p className="note" style={{ marginTop: 18 }}>
          <strong>Three files, once a month.</strong> Harvests (Inactive) carries Moisture Loss, which appears
          in no API endpoint and is the only way to reconcile wet weight to dry — without it the 380 lb
          monthly target cannot be verified. Packages-Transferred carries wholesale price; that endpoint
          returns 401, and manufacturing alone holds 12,675 of the 13,246 priced packages.</p>
      </section>

      <section>
        <h2>Less often</h2>
        <p className="lede">Real data the API does not hold, but not month-end blockers.</p>
        <div className="req">{other.map((r, i) => <Row key={r.report_key + r.licence} r={r} n={i + 1} />)}</div>
      </section>

      <section>
        <h2>Recognised, but do not upload these</h2>
        <p className="lede">The API already delivers all of it. These are mapped so that if one is ever
          uploaded — to backfill history, or to check the sync independently — it lands correctly rather
          than being rejected.</p>
        <div className="scroll">
          <table>
            <thead><tr><th>Report</th><th>Why it is not needed</th><th>Lands in</th></tr></thead>
            <tbody>
              {onDemand.map((t) => (
                <tr className="off" key={t.report_key}>
                  <td>{t.title}</td><td>{t.why_it_matters}</td><td className="times">{t.target_table}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <hr className="rule" />

      <section>
        <h2>Who is told</h2>
        <p className="lede">An outstanding upload raises a critical alert on the executive dashboard the day
          it falls due, not once it is late. It cannot be dismissed — it clears when the file arrives.</p>
        <div className="who">
          <span>Owner</span><span>Executive</span><span>CEO</span><span>CFO</span><span>COO</span><span>Admin</span>
        </div>
        <p className="note" style={{ marginTop: 16 }}>
          <strong>CEO, CFO and COO are pre-registered.</strong> Those roles do not exist as separate accounts
          yet — everyone in that group currently signs in as executive and sees the alert that way. The
          moment the roles are created the alert routes to them with no code change.</p>
      </section>

      {queue.length ? (
        <>
          <hr className="rule" />
          <section>
            <h2>AgentMapper</h2>
            <p className="lede">A file nobody has taught the platform to read does not fail quietly. It is
              captured with its exact column list and handed to the Metrc &amp; Compliance agent, which drafts
              the mapping. You approve it, and the table and the mapping come into being together — no code
              change, no deploy.</p>
            <div className="req">
              {queue.map((q) => (
                <div className={`r ${q.state === "proposed" ? "" : "crit"}`} key={q.id}>
                  <div className="n">{q.times_seen}×</div>
                  <div>
                    <b>{q.proposed_title ?? q.file_name ?? "Unrecognised file"}</b>
                    <p className="why">{q.what_happens_next}
                      {q.state === "proposed"
                        ? ` — lands in ${q.proposed_table}, ${q.proposed_column_count} columns mapped, identified by ${q.proposed_signature_count}.`
                        : ""}
                      {q.state === "new" && q.closest_report
                        ? ` Closest known report is ${q.closest_report}, missing ${(q.closest_missing ?? []).join(", ")}.`
                        : ""}
                    </p>
                    <p className="path">{(q.row_count ?? 0).toLocaleString()} rows · columns in the file: {(q.columns ?? []).join(", ")}</p>
                  </div>
                  <div className="st">
                    {q.state === "proposed" ? (
                      <button className="vetab" disabled={busy}
                        onClick={async () => {
                          setBusy(true);
                          const { data } = await supabase.rpc("tg_agentmapper_approve", { p_id: q.id, p_note: null });
                          setMsg([{ ...(data ?? {}), file: q.file_name ?? "mapping", error: data?.error }]);
                          setBusy(false); load();
                        }}>Approve mapping</button>
                    ) : <span className="pill no">{q.state}</span>}
                  </div>
                </div>
              ))}
            </div>
            <p className="note" style={{ marginTop: 18 }}>
              <strong>Nothing is created until you approve it.</strong> A proposal is rejected automatically
              if it names a column the uploaded file did not contain, or if the file has a grouped two-row
              header the importer cannot read unambiguously — in that case it needs code, and saying so is
              better than approving a guess.</p>
          </section>
        </>
      ) : null}

      <hr className="rule" />

      <section>
        <h2>What to export next</h2>
        <p className="lede">You never have to remember a date range. This is measured from the data actually
          held — not from what anyone meant to export — so a short export or a skipped month shows up as a
          gap instead of passing unnoticed.</p>
        <div className="scroll">
          <table>
            <thead><tr>
              <th>Report</th><th>Licence</th><th className="num">Rows held</th>
              <th>Covers</th><th>Status</th><th>What to export</th>
            </tr></thead>
            <tbody>
              {coverage.map((c) => (
                <tr key={c.report_key + c.required_for_licence}
                  className={c.coverage === "Covered" ? "" : "off"}>
                  <td>{c.title}</td>
                  <td className="times">{c.required_for_licence}</td>
                  <td className="num">{(c.rows_held ?? 0).toLocaleString()}</td>
                  <td className="times">
                    {c.first_event ? `${c.first_event} → ${c.last_event}` : "—"}
                  </td>
                  <td>
                    <span className={`pill ${c.coverage === "Covered" ? "on" : "no"}`}>
                      {c.coverage === "Covered" ? "covered" : "gap"}
                    </span>
                  </td>
                  <td>{c.what_to_export}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="note" style={{ marginTop: 18 }}>
          <strong>Overlapping a previous upload is safe.</strong> Every row is matched on its own identity,
          so re-importing one corrects it — it never duplicates. Harvests Inactive has been uploaded eight
          times and still holds exactly 350 harvests. That is why each range above starts a fortnight before
          the last record held: a generous overlap costs nothing and covers anything entered in Metrc late.</p>
      </section>

      <section>
        <h2>Recent uploads</h2>
        <div className="scroll">
          <table>
            <thead><tr>
              <th>File</th><th>Recognised as</th><th className="num">Rows</th>
              <th className="num">Added</th><th className="num">Updated</th>
              <th>Covers</th><th>Uploaded</th><th>Put back</th>
            </tr></thead>
            <tbody>
              {recent.length ? recent.map((r) => (
                <tr key={r.id} className={r.undone_at ? "off" : ""}>
                  <td>{r.file_name ?? "—"}</td><td>{r.report_type}</td>
                  <td className="num">{(r.row_count ?? 0).toLocaleString()}</td>
                  <td className="num">{r.rows_new ?? "—"}</td>
                  <td className="num">{r.rows_changed ?? "—"}</td>
                  <td className="times">{r.as_of_date ?? r.period_start ?? "—"}</td>
                  <td className="times">{r.imported_at ? new Date(r.imported_at).toLocaleDateString() : "—"}</td>
                  <td>
                    {r.undone_at ? (
                      <span className="pill no">undone</span>
                    ) : (
                      <button className="vetab" disabled={busy}
                        onClick={async () => {
                          setBusy(true);
                          const { data } = await supabase.rpc("tg_import_undo", { p_id: r.id, p_note: null });
                          setMsg([{ ...(data ?? {}), file: r.file_name ?? "import", error: data?.error }]);
                          setBusy(false); load();
                        }}>Undo this import</button>
                    )}
                  </td>
                </tr>
              )) : (
                <tr className="off"><td colSpan={8}>Nothing uploaded yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <footer>Detection is driven by rows in metrc_report_types, not code. Signed in as {session?.user?.email}.</footer>
    </div>
  );
}

function Integrations({ session }) {
  const [status, setStatus] = useState(null);
  /* APEX_* added 9 Aug 2026. Apex is the SALES source of record - Metrc holds what was
     declared to the state, Apex holds what was actually sold and for how much. The three
     fields are what the connector needs to authenticate; the base URL is a field rather
     than a constant because it has NOT been verified against Apex's own API documentation
     and hard-coding an unverified endpoint is how you get a connector that fails silently. */
  const [form, setForm] = useState({ METRC_LICENSES: "", METRC_VENDOR_KEYS: "", METRC_USER_KEY: "", METRC_STATE: "", CLICKUP_TOKEN: "", APEX_API_KEY: "", APEX_API_BASE: "", APEX_COMPANY_ID: "" });
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const [runs, setRuns] = useState(null);
  const [forceReport, setForceReport] = useState(null);
  const [openRun, setOpenRun] = useState(null);   // which run row is expanded
  const { role } = useRole(session);
  /* Same roles that may write configuration elsewhere in this file. Forcing a sync is a
     configuration action, not a read. */
  const canForce = ["owner", "executive", "planner", "dept_head"].includes(role);
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
  /* EVERY run, from EVERY integration. Owner, 9 Aug 2026: "PANEL MUST REPORT EVERY
     SINGLE RUN ALWAYS."

     This read metrc_sync_runs alone, so a successful 15-entity Apex run that landed
     186 rows showed nothing here and the only reasonable conclusion from the screen
     was that Apex had not synced. A run log silent about a whole integration is
     worse than a broken sync: it teaches you to distrust the log. v_all_sync_runs
     UNIONs the sources, so a future integration with its own run table cannot vanish
     the same way.

     Ordered by started_at rather than id - the two tables have independent id
     sequences, so id ordering would interleave them wrongly. */
  const loadRuns = useCallback(async () => {
    const { data, error } = await supabase.from("v_all_sync_runs")
      .select("system, endpoint, license, status, records, started_at, error")
      .order("started_at", { ascending: false }).limit(30);
    /* SURFACE THE ERROR. This was `const { data } = ...` and threw the error away, so
       a failed query rendered as the empty state - "No sync runs yet" - while 1,739
       Apex order rows sat in the table. The owner ran two syncs and the screen told
       him nothing had happened. A read that cannot distinguish "empty" from "failed"
       is the same silent-failure shape this platform keeps finding, and I wrote it. */
    if (error) {
      setRuns([]);
      setMsg({ kind: "err", text: `Could not read the sync run log: ${error.message}. The runs may have happened — this is a READ failure, not an empty log.` });
      return;
    }
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
      /* Clear EVERY field, derived from the form's own keys. The old version listed four
         by hand and had drifted: a saved ClickUp token stayed sitting in the box, which
         reads as "not saved yet" and invites a second paste. A reset that has to be
         updated by hand every time a field is added will always fall behind. */
      setForm(Object.fromEntries(Object.keys(form).map((k) => [k, ""])));
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
  /* APEX ONLY. Reports every entity individually, including the ones deliberately
     SKIPPED because they are still inside their refresh window — a skip that looks
     like "nothing happened" is the shape of every silent failure found here. */
  async function runApexSync() {
    setBusy(true); setForceReport(null);
    setMsg({ kind: "ok", text: "Pulling Apex — read-only. Anything pulled recently is skipped and costs no credits." });
    try {
      const r = await fetch(`${FUNCTIONS_URL}/apex-sync`, { method: "POST", headers: authHeaders() });
      const j = await r.json();
      const src = SYNC_SOURCES.find((s) => s.key === "apex");
      setForceReport({ when: new Date().toLocaleTimeString(), items: [parseSyncResponse(src, j)], notLive: [] });
      setMsg(j.ok
        ? { kind: "ok", text: `Apex synced — ${j.total ?? 0} row(s) stored. ${j.results?._credits ?? ""}` }
        : { kind: "err", text: j.error ?? "Apex sync failed — every entity and its reason is listed below." });
    } catch (e) { setMsg({ kind: "err", text: String(e) }); }
    setBusy(false);
  }
  /* FORCE ALL SYNCS — owner-requested 8 Aug 2026: "I am admin I must be able to force all
     syncs." The Sync Center in the top bar could already do this; Integrations could not,
     and Integrations is where an admin goes when a sync is the problem.

     It reuses SYNC_SOURCES rather than listing the sources again, so a source added there
     appears here automatically and the two can never disagree.

     It reports EVERY source individually, including the ones that fail (rule A3 - absence
     and failure are explained, never blank). A "synced" message covering a source that
     errored is the silent-failure shape this platform keeps finding. */
  async function forceAllSyncs() {
    const live = SYNC_SOURCES.filter((s) => s.live);
    const notLive = SYNC_SOURCES.filter((s) => !s.live);
    setBusy(true);
    setForceReport(null);
    setMsg({ kind: "ok", text: `Forcing ${live.length} connected source${live.length === 1 ? "" : "s"}. Metrc pulls its full catalogue politely and can take several minutes — results appear per source as each finishes.` });
    const items = [];
    for (const src of live) {
      try {
        const r = await fetch(`${FUNCTIONS_URL}/${src.fn}`, { method: "POST", headers: authHeaders() });
        items.push(parseSyncResponse(src, await r.json()));
      } catch (e) {
        items.push({ label: src.label, ok: false, total: 0, details: [], skipped: [], errors: [String(e).slice(0, 200)] });
      }
      setForceReport({ when: new Date().toLocaleTimeString(), items: [...items], notLive });
    }
    const failed = items.filter((i) => !i.ok);
    setMsg(failed.length
      ? { kind: "err", text: `${items.length - failed.length} of ${items.length} sources synced. FAILED: ${failed.map((f) => f.label).join(", ")}. Each failure and its reason is listed below — nothing has been hidden.` }
      : { kind: "ok", text: `All ${items.length} connected sources synced. ${notLive.length} source${notLive.length === 1 ? " is" : "s are"} not connected yet and could not be forced — listed below with what each still needs.` });
    loadRuns();
    setBusy(false);
  }
  /* Licences for the per-endpoint buttons. Taken from the sync runs rather than from
     METRC_LICENSES, because that secret is write-only and never comes back to the
     browser - by design. An empty list is handled: the buttons then run all
     configured licences instead of pretending to scope to one. */
  const metrcLicences = useMemo(
    () => [...new Set((runs ?? []).map((r) => r.license).filter((l) => l && l !== "-"))].sort(),
    [runs]);
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

            {/* APEX — the sales source of record. Metrc holds what was DECLARED to the
                state; Apex holds what was SOLD and for how much. Neither can answer the
                other's question, and where they disagree that disagreement is itself the
                finding (brain/DECISIONS.md, 7 Aug 2026). */}
            <div className="ptitle" style={{ marginTop: 18 }}><span className="pchip" style={{ background: "var(--neon)", color: "var(--neon-ink)" }}>{I.cash}</span> Apex — sales platform</div>
            <div className="sub" style={{ margin: "0 0 10px" }}>
              Apex is the source of record for <b>sales, pricing and terms</b> — Metrc only ever holds the declared transfer. Your key&rsquo;s scopes decide what the connector can reach; the key below is stored write-only and never displayed again.
            </div>
            <label>API key {setPill("APEX_API_KEY")}</label>
            <input aria-label="Apex API key" value={form.APEX_API_KEY} onChange={(e) => setForm({ ...form, APEX_API_KEY: e.target.value })} placeholder={isSet("APEX_API_KEY") ? "•••••• stored — paste to replace" : "Apex → Settings → API → the key beside your scope list"} />
            <label>API base URL {setPill("APEX_API_BASE")}</label>
            <input aria-label="Apex API base URL" value={form.APEX_API_BASE} onChange={(e) => setForm({ ...form, APEX_API_BASE: e.target.value })} placeholder={isSet("APEX_API_BASE") ? "•••••• stored — paste to replace" : "from Apex's API documentation — not guessed here on purpose"} />
            <label>Company ID <span className="sub" style={{ fontWeight: 400 }}>— only if Apex&rsquo;s endpoints ask for one</span> {setPill("APEX_COMPANY_ID")}</label>
            <input aria-label="Apex company ID" value={form.APEX_COMPANY_ID} onChange={(e) => setForm({ ...form, APEX_COMPANY_ID: e.target.value })} placeholder={isSet("APEX_COMPANY_ID") ? "•••••• stored — paste to replace" : "leave blank if the key already identifies the company"} />

            <button className="btn" disabled={busy}>Store securely</button>
            <button type="button" className="btn ghost" style={{ marginLeft: 10 }} disabled={busy} onClick={runSync}>Run Metrc sync now</button>
            {/* APEX ONLY. Owner, 9 Aug 2026: "do not sync metrc again only sync Apex" and
                "we need button to manually only sync Apex too". Forcing every source to
                re-run in order to reach one of them is not free here - Apex bills by API
                credit - and it is slow for the person waiting. */}
            <button type="button" className="btn ghost" style={{ marginLeft: 10 }} disabled={busy} onClick={runApexSync}
              title="Pulls only Apex. Entities still inside their refresh window are skipped and cost nothing.">
              Sync Apex only</button>
            {canForce && (
              <button type="button" className="btn" style={{ marginLeft: 10 }} disabled={busy} onClick={forceAllSyncs}
                title="Runs every connected source now, without waiting for its schedule.">
                {busy ? "Forcing every source…" : "Force all syncs now"}
              </button>
            )}
            {role !== null && !canForce && (
              <div className="msg" style={{ marginTop: 10 }}>
                Forcing a sync changes configuration, so it is limited to owner, executive, planner and department head. Your role is <b>{role}</b>. Ask one of them, or ask an administrator to change your role.
              </div>
            )}
            {msg && <div className={`msg ${msg.kind}`}>{msg.text}</div>}
            {forceReport && (
              <div className="msection" style={{ marginTop: 16 }}>
                <div className="mtitle"><span className="sq" /><h2>Forced sync — every source, {forceReport.when}</h2><span className="rule" /></div>
                <div className="tablewrap" style={{ marginTop: 0 }}>
                  <table>
                    <thead><tr><th>Source</th><th>Result</th><th>Records</th><th>What happened</th></tr></thead>
                    <tbody>
                      {forceReport.items.map((it, i) => (
                        <tr key={i}>
                          <td>{it.label}</td>
                          <td><span className={`pill ${it.ok ? "ok" : "bad"}`}>{it.ok ? "synced" : "FAILED"}</span></td>
                          <td>{it.total}</td>
                          <td style={{ whiteSpace: "pre-wrap" }}>
                            {it.errors.length > 0 && <div><b>Failed because:</b> {it.errors.join(" · ")}</div>}
                            {it.skipped.length > 0 && <div><b>Skipped:</b> {it.skipped.join(" · ")}</div>}
                            {it.errors.length === 0 && it.skipped.length === 0 && (it.details.join(" · ") || "Completed with nothing new to bring in.")}
                          </td>
                        </tr>
                      ))}
                      {forceReport.notLive.map((s, i) => (
                        <tr key={`n${i}`}>
                          <td>{s.label}</td>
                          <td><span className="pill">not connected</span></td>
                          <td>—</td>
                          <td>Could not be forced because it is not connected yet. {s.desc}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </form>
          {/* PER-ITEM SYNC. Owner, 9 Aug 2026: "EVERYTHING INDIVIDUALLY WE ONLY HAVE
              SYNC ALL BUTTON" / "LIST ALL SPREADSHEETS WITH A BUTTON". Its own file
              because App.jsx is already 9,700 lines and the owner has ruled against
              files big enough that one break takes everything down. */}
          <SyncItems session={session} licences={metrcLicences} />
        </div>
        <div>
          <div className="msection" style={{ marginTop: 0 }}>
            <div className="mtitle"><span className="sq" /><h2>Recent sync runs</h2><span className="rule" /></div>
            {runs === null ? <div className="empty"><div className="eicon">{I.gauge}</div>Loading…</div> : runs.length === 0 ? (
              <div className="empty"><div className="eicon">{I.plug}</div><b>No sync runs yet</b>Store your Metrc credentials, then run the first sync.</div>
            ) : (
              <div className="tablewrap" style={{ marginTop: 0 }}>
                <table>
                  <thead><tr><th>Started</th><th>System</th><th>License</th><th>Endpoint</th><th>Status</th><th>Records</th></tr></thead>
                  <tbody>
                    {/* DRILL DOWN. Owner: "USER MUST KNOW IF IT WAS SUCCESSFUL, WHAT
                        SYNCED, DRILL DOWN TO SEE, SEE ERRORS, SKIPPED EVERYTHING ON
                        DRILLDOWN." The reason was live on this screen: five Apex
                        entities failed with a 422 whose message named the exact missing
                        field, and the only place that text appeared was a tooltip
                        nobody hovers. A failure you have to guess at is a failure
                        reported badly. */}
                    {runs.map((r, i) => {
                      const key = `${r.system}:${r.endpoint}:${r.started_at}`;
                      const isOpen = openRun === key;
                      const hasDetail = !!r.error;
                      return (
                        <React.Fragment key={key}>
                          {/* Keyboard-reachable, because a row that only answers to a
                              mouse hides the failure message from anyone not using one.
                              A <tr> cannot be a <button>, so it takes the role, the
                              tabIndex and the Enter/Space handling explicitly. */}
                          <tr onClick={() => hasDetail && setOpenRun(isOpen ? null : key)}
                              onKeyDown={hasDetail ? (ev) => {
                                if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); setOpenRun(isOpen ? null : key); }
                              } : undefined}
                              tabIndex={hasDetail ? 0 : undefined}
                              role={hasDetail ? "button" : undefined}
                              aria-expanded={hasDetail ? isOpen : undefined}
                              style={{ cursor: hasDetail ? "pointer" : "default" }}
                              title={hasDetail ? "Click for the full message" : ""}>
                            <td>{new Date(r.started_at).toLocaleTimeString()}</td>
                            <td>{r.system}</td>
                            <td>{r.license}</td>
                            <td>{hasDetail ? (isOpen ? "▾ " : "▸ ") : ""}{r.endpoint}</td>
                            <td><span className={`pill ${r.status === "ok" ? "ok" : r.status === "error" ? "err" : "run"}`}>{r.status}</span></td>
                            <td>{r.records ?? ""}</td>
                          </tr>
                          {isOpen && hasDetail && (
                            <tr>
                              <td colSpan={6} style={{ background: "var(--canvas)", whiteSpace: "pre-wrap",
                                  fontFamily: "ui-monospace, monospace", fontSize: 12, lineHeight: 1.5, padding: "10px 12px" }}>
                                {r.error}
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
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
  const [settingsMsg, setSettingsMsg] = useState(null);
  const avRef = React.useRef(null);
  useEffect(() => {
    supabase.from("user_settings").select("avatar_url, canvas_theme").eq("user_id", session.user.id).maybeSingle()
      .then(({ data, error }) => {
        if (error) {
          setSettingsMsg({ kind: "err", text: `Settings could not be read: ${error.message}` });
          announcePreferenceFailure("Settings", error);
          return;
        }
        setAvatarUrl(data?.avatar_url ?? null); setCt(data?.canvas_theme ?? null);
      });
  }, [session.user.id]);
  const saveCt = async (next) => {
    const previous = ct;
    setCt(next); applyCanvasTheme(next);
    setSettingsMsg({ kind: "saving", text: "Saving the canvas to your account…" });
    const { error } = await supabase.from("user_settings")
      .upsert({ user_id: session.user.id, canvas_theme: next }, { onConflict: "user_id" });
    if (error) {
      setCt(previous); applyCanvasTheme(previous);
      setSettingsMsg({ kind: "err", text: `Canvas was not saved: ${error.message}` });
      announcePreferenceFailure("Canvas preference", error);
      return false;
    }
    setSettingsMsg({ kind: "ok", text: "Canvas saved to your account." });
    return true;
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
    if (!blob) { setAvMsg("Photo could not be prepared for upload."); return; }
    const path = `${session.user.id}-${Date.now()}.jpg`;
    const { error } = await supabase.storage.from("avatars").upload(path, blob, { upsert: true, contentType: "image/jpeg" });
    if (error) { setAvMsg(`Upload failed: ${error.message}`); return; }
    const { data } = supabase.storage.from("avatars").getPublicUrl(path);
    const { error: saveError } = await supabase.from("user_settings")
      .upsert({ user_id: session.user.id, avatar_url: data.publicUrl }, { onConflict: "user_id" });
    if (saveError) {
      setAvMsg(`Photo uploaded, but your profile was not updated: ${saveError.message}`);
      announcePreferenceFailure("Profile photo preference", saveError);
      return;
    }
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
      {settingsMsg && <div className={`msg ${settingsMsg.kind === "err" ? "err" : "ok"}`} role={settingsMsg.kind === "err" ? "alert" : "status"}>{settingsMsg.text}</div>}
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
            <div className="note">{prefs.saveState.state === "saving" ? "Saving to your account…"
              : prefs.saveState.state === "failed" ? prefs.saveState.message
              : prefs.saveState.state === "saved" ? "Saved to your account."
              : "Choose a mode. The rail and top bar stay black in both — that’s the brand."}</div>
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
            <button className="btn ghost" onClick={() => signOutEverywhere()} style={{ marginTop: 12 }}>Sign out</button>
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
          <div className="sub">How everything that&rsquo;s live today actually works. This guide grows with every milestone.</div>
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

/* ---------- People (custom module) ----------
   Owner, 8 Aug 2026: "DO NOT EVER USE ONE TEMPLATE FOR EVERY PAGE."
   The generic table below was replaced by a purpose-built roster in
   roster.jsx — it leads with who cannot legally be on the floor, groups
   by team, and treats a lapsed agent registration as a stop rather than
   a row in a grid. Primitives are shared; the layout is not. */
function People({ session }) {
  /* session is threaded through because Roster now asks f_date_default for this
     page's governed frame, and that resolution is per user: a person's own saved
     choice for a page outranks the company default. Without the session it would
     silently fall back to the company answer for everybody. */
  return <Roster session={session} />;
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


const TELL_YOUR_AI = [
  "I work for Twisted Growers, a Massachusetts cannabis company. We have an internal web platform called the Twisted Growers Enterprise OS, and I want to be able to chat with an assistant about our live production data from inside it. I have my own Claude Max subscription and my own ChatGPT subscription, and I want to use them for this.",
  "",
  "There is a small program called the bridge that makes this work. It runs on my own Windows computer, listens on 127.0.0.1 port 8765, and when the platform sends it a question it runs Claude Code against our database and sends the answer back. It uses my own subscription, so there is no extra bill.",
  "",
  "Please walk me through this on my machine, one step at a time, and check I have done each one before moving on:",
  "1. Install Node.js from nodejs.org, the LTS version.",
  "2. Install Claude Code:  npm install -g @anthropic-ai/claude-code",
  "3. Run  claude  in a terminal, then type /login and sign in with my Claude account.",
  "4. Put the bridge folder I was given somewhere sensible, then double-click start-bridge.cmd inside it.",
  "5. Check it worked: the AI chip at the top of this page turns green within 30 seconds. Opening http://127.0.0.1:8765/health in its own browser tab also works — but a check made from inside this page does not, because Chrome will not let a website reach your own computer without permission. The green chip is the real test.",
  "6. Make it start automatically: press Windows+R, type shell:startup, and put a shortcut to start-bridge-hidden.vbs in that folder.",
  "",
  "I am not technical, so please keep it plain, tell me exactly what to type, and tell me what I should see after each step so I know it worked.",
].join(String.fromCharCode(10));



/* These values must match mv_department_dashboard.department EXACTLY — the
   dashboard filters on .eq("department", …). 'Command Center' was wrong: the view
   stores 'Command', so the query returned 0 of 8 tiles and the top-level dashboard
   rendered empty. It looked alive because FlowStrip and MoneyBar still showed, and
   the failure was invisible because the query swallowed its result with `?? []`.
   Verified 7 Aug 2026 against: select distinct department from mv_department_dashboard. */
export const DEPT_BY_VIEW = {
  dept_dash_command: "Command",
  /* The CFO dashboard reuses the Finance figures and adds the Inventory Forensic
     Audit. Owner 11 Aug 2026: "ADD A TAB THAT EVEN BRINGS USER TO CFO DASHBOARD". */
  dept_dash_cfo: "Finance",
  dept_dash_cultivation: "Cultivation",
  dept_dash_inventory: "Inventory",
  dept_dash_quality: "Quality",
  /* Was "Finance" until 18 Aug 2026 — which left NO view owning the "Sales & Cash"
     department, so its 238 findings sat under NOBODY OWNS THESE on Global Management
     and the sales page rendered Finance's tiles instead of its own. The data spine
     (mv_department_dashboard, finding_lane_owner) has used "Sales & Cash" throughout;
     only this map disagreed. */
  dept_dash_sales: "Sales & Cash",
  dept_dash_mfg: "Manufacturing",
  dept_dash_metrc: "Metrc",
  dept_dash_workspace: "Workspace",
  dept_dash_hr: "Human Resources",
  dept_dash_preroll: "Infused Pre-Rolls & Flower",
  dept_dash_settings: "Settings",
};

/* Open harvests, one row each, with the arithmetic that corrects the wet weight to
   a dry-equivalent shown on the row itself so nobody has to take the figure on trust. */
export function OpenHarvestDetail() {
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState(null);
  const [band, setBand] = useState(null);
  useEffect(() => {
    let live = true;
    supabase.from("v_harvest_still_in_room").select("*").then(({ data, error }) => {
      if (!live) return;
      if (error) { setErr(error.message); return; }
      setRows(rowsOr(data));
    });
    /* The conversion is an OWNER-SET ROW, never a literal here (G1/G4). */
    supabase.from("conversion_factors").select("key, value, unit, label, where_it_came_from, set_by")
      .in("key", ["expected_moisture_pct_min", "expected_moisture_pct_max", "moisture_loss_goal_pct"])
      .then(({ data, error }) => {
        if (!live) return;
        if (error) { setBand({ err: error.message }); return; }
        const m = Object.fromEntries(rowsOr(data).map((r) => [r.key, r]));
        setBand({
          goal: m.moisture_loss_goal_pct ? Number(m.moisture_loss_goal_pct.value) : null,
          min: m.expected_moisture_pct_min ? Number(m.expected_moisture_pct_min.value) : null,
          max: m.expected_moisture_pct_max ? Number(m.expected_moisture_pct_max.value) : null,
          setBy: m.moisture_loss_goal_pct?.set_by ?? null,
          err: null,
        });
      });
    return () => { live = false; };
  }, []);
  if (err) return <div className="brnone"><b>The open harvests could not be read:</b> {err}</div>;
  if (!rows || !band) return <div className="note">Reading every open harvest…</div>;
  if (!rows.length) return <div className="brnone">No harvests are open.</div>;
  /* Retained fraction = 1 − moisture loss. The band gives the honest spread. */
  const keep = band.goal != null ? (100 - band.goal) / 100 : null;
  const keepHi = band.min != null ? (100 - band.min) / 100 : null;   // least loss → most dry
  const keepLo = band.max != null ? (100 - band.max) / 100 : null;   // most loss → least dry
  const pct = (f) => (f == null ? "not set" : `${(f * 100).toFixed(1)}%`);
  const projNote = keep == null
    ? "The moisture figure is not set, so no dry weight can be projected."
    : `PROJECTED, NOT WEIGHED. Wet weight × ${pct(keep)} retained (the owner-set moisture-loss goal of ${band.goal}%${band.setBy ? `, set by ${band.setBy}` : ""}). Nobody has put this material on a scale.`;
  const spreadNote = keepLo == null || keepHi == null
    ? ""
    : ` Across the owner-set normal band (${band.min}% to ${band.max}% loss) the same wet weight projects anywhere from ${pct(keepLo)} to ${pct(keepHi)} retained — so treat the figure as a range, not a count.`;
  return (
    <div className="tablewrap">
      {/* A2: a number nobody measured says so on its face. The owner found this
          table reading 26.7 lb "really left" as though it had been counted,
          when the input was wet weight times an assumed retained fraction; at
          the other end of the same owner-set band it is roughly half that.
          The arithmetic is unchanged and defensible — the presentation was not. */}
      <p className="buildnote" style={{ color: "var(--muted)" }}>
        <b>Two of these columns are PROJECTIONS, marked “est.”, not measurements.</b> {projNote}{spreadNote}
        {" "}Packaged, waste and the Metrc figure are recorded weights.
      </p>
      <table>
        <thead><tr>
          <th>Harvest</th><th>Cut on</th><th>Dried in</th><th>Days open</th>
          <th>Wet weight</th>
          <th title={projNote + spreadNote}>Est. dry yield (projected) ⓘ</th>
          <th>Packaged so far</th><th>Waste</th>
          <th title={"Est. dry yield minus what has actually been packaged. " + projNote + spreadNote}>Est. dry remaining ⓘ</th>
          <th title="Metrc's own CurrentWeight for this harvest — the state's legal record, not our estimate. It is wet minus packaged, so it still contains the water that has evaporated.">Metrc still shows ⓘ</th>
          <th>Last package taken off</th><th>Days since</th><th>What it really means</th>
        </tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.harvest_name} className={r.days_since_last_package > 14 ? "rowbad" : ""}>
              <td>{r.harvest_name}</td>
              <td>{r.harvest_started || "not recorded"}</td>
              <td>{r.drying_room || "not recorded"}</td>
              <td>{r.days_open}</td>
              <td>{Number(r.wet_lb).toLocaleString()} lb</td>
              <td className="note" title={projNote + spreadNote}>
                est. {Number(r.expected_dry_lb).toLocaleString()} lb
              </td>
              <td>{Number(r.packaged_lb).toLocaleString()} lb</td>
              <td>{Number(r.waste_lb).toLocaleString()} lb</td>
              {/* Derived, and shown with the spread its own assumption implies
                  rather than as a single bold count. */}
              <td className="note" title={"Est. dry yield minus packaged. " + projNote + spreadNote}>
                est. {Number(r.really_left_lb).toLocaleString()} lb
                {keepLo != null && keepHi != null && (
                  <div style={{ fontSize: "10.5px" }}>
                    range {Math.max(0, Number(r.wet_lb) * keepLo - Number(r.packaged_lb)).toLocaleString(undefined, { maximumFractionDigits: 1 })}
                    {" – "}
                    {Math.max(0, Number(r.wet_lb) * keepHi - Number(r.packaged_lb)).toLocaleString(undefined, { maximumFractionDigits: 1 })} lb
                  </div>
                )}
              </td>
              <td title="Metrc's own CurrentWeight — the state's legal record.">{Number(r.old_figure_wet_minus_dry).toLocaleString()} lb</td>
              <td>{r.last_package_taken_off || "never"}</td>
              <td>{r.days_since_last_package ?? "—"}</td>
              <td>{r.what_it_really_means}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* IN TRANSIT — stage 6 of the flow, owner ruling 11 Aug 2026: material on an
   active transfer is OURS until the destination accepts, so it is stock and it
   is on the strip. The drill loads LAZILY — only when the stage is expanded —
   and pages at 50 tags.

   THE ROWS COME FROM v_stock_proof — Agent I correction, 11 Aug 2026: the
   evidence view is the one source for per-item drill rows sitewide (C1), so a
   tile total and its rows reconcile by construction or the difference is a data
   defect, never a display choice. The in-transit POPULATION is the mirror's own
   source_state; the tag list is fetched first (oldest packaged first), then the
   proof rows for each page of 50 tags — measured 147 ms, against 30.7 s for
   v_flow_in_transit, whose broken-and-slow manifest join is filed with Agent I.

   KNOWN AND DISCLOSED: a handful of tags exist under both of our licences
   (mirror trap 13), so 50 tags can return 51–52 rows and the full set holds 434
   rows behind a 429-package tile. Both rows are shown — hiding one would be
   choosing a licence silently. Filed with Agent I as a C2 reconciliation item. */
export function InTransitDrill() {
  const PAGE = 50;
  const [tags, setTags] = useState(null);
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState(null);
  const [pages, setPages] = useState(1);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    supabase.from("metrc_packages").select("tag")
      .eq("source_state", "intransit")
      .or("finished.is.null,finished.eq.false")
      .order("raw->>PackagedDate", { ascending: true })
      .then(({ data, error }) => {
        if (!live) return;
        if (error) { setErr(error.message); return; }
        setTags([...new Set(rowsOr(data).map((r) => r.tag))]);
      });
    return () => { live = false; };
  }, []);

  useEffect(() => {
    if (!tags) return;
    let live = true;
    setBusy(true);
    const wanted = tags.slice(0, pages * PAGE);
    supabase.from("v_stock_proof").select("*").in("package_tag", wanted)
      .then(({ data, error }) => {
        if (!live) return;
        setBusy(false);
        if (error) { setErr(error.message); return; }
        const order = new Map(wanted.map((t, i) => [t, i]));
        setRows(rowsOr(data).sort((a, b) => (order.get(a.package_tag) ?? 0) - (order.get(b.package_tag) ?? 0)));
      });
    return () => { live = false; };
  }, [tags, pages]);

  if (err) return <div className="brnone"><b>The in-transit records could not be read:</b> {err}. The read genuinely failed — nothing is being hidden behind an empty box.</div>;
  if (rows === null) return <div className="note">Reading every in-transit package…</div>;
  if (!rows.length) return (
    <div className="brnone">Nothing is in transit. <b>Why:</b> Metrc currently shows no active
      transfer whose destination has not yet accepted. Packages appear here the moment a
      manifest departs and leave the moment the receiver signs.</div>
  );
  const more = tags && pages * PAGE < tags.length;
  return (
    <>
      <p className="buildnote" style={{ color: "var(--muted)" }}>
        {tags.length} packages in transit, oldest packaged first — a long transit is a stuck
        transfer, not a truck. Ours until the receiver signs; if rejected, it comes back.
        Rows are the evidence view, one per package per licence — a tag our mirror holds under
        both licences shows twice, and that is stated rather than silently halved.
      </p>
      <StockProofTable rows={rows} locationLabel="Last known room before it left" />
      {more && (
        <button className="btn quiet" disabled={busy} onClick={() => setPages((p) => p + 1)}>
          {busy ? "Reading…" : `Show the next ${PAGE} packages`}
        </button>
      )}
    </>
  );
}

/* THE EVIDENCE TABLE — one shared render for v_stock_proof rows, used by the
   in-transit drill and the per-room drills. One primitive, so a per-item row can
   never carry different columns on different pages (share primitives, never
   layouts — this is a row renderer, not a page). */
/* THE DOCUMENTS COLUMN IS NOW THE EVIDENCE CELL — owner hard rule, 12 Aug 2026:
   "no item anywhere on site can be missing full forensic drill down with
   documents — even in a line item or report, no matter where."

   This table is the shared drill body behind the room drills, the in-transit
   drill and every stock drill on the platform, so upgrading this ONE cell
   carries the rule everywhere at once. Two things changed and both were
   defects:

   1. It rendered f_package_documents' STORED download_url. All 3,666 stored
      URLs were signed together and expire on one day, which would have taken
      every certificate button on the platform with them. TagEvidence mints the
      link at click time and never caches one.
   2. A tag with no document rendered "none held" — a blank in all but wording.
      mv_tag_evidence resolves a certificate through up to five generations of
      parent packages and, where there is genuinely none, serves the SENTENCE
      saying why (A3). Measured 12 Aug 2026: 969 direct · 1,520 inherited ·
      837 lab-result-only · 1,100 none, and all 1,937 of the last two carry a
      reason. No row can render a dash.

   The provider fetches the whole page of tags in one batched read rather than
   one per row. */
export function StockProofTable({ rows, locationLabel = "Where it is" }) {
  return (
    <TagEvidenceProvider tags={rows.map((r) => r.package_tag)}>
    <div className="tablewrap">
      <table>
        <thead><tr>
          <th>Package tag</th><th>Product</th><th>Cultivar</th><th>Stream</th><th>Origin</th>
          <th>Quantity, own unit</th><th>Source harvest</th><th>Cut on</th><th>Dried in</th>
          <th>Harvest closed</th><th>Made from</th><th>Production batch</th>
          <th>{locationLabel}</th><th>Days held there</th><th>Packaged on</th>
          <th>Test status</th><th>Out / back / days at laboratory</th>
          <th>THC · CBD · terpenes</th><th>Made by, under licence</th><th>Shipped to us by</th>
          <th>Manifest</th><th>Rate used → value</th><th>Traceability</th><th>Documents</th>
        </tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <DrillRow key={r.package_tag + "|" + (r.license ?? i)} row={r} colCount={24}>
              <td>{r.package_tag}</td>
              <td>{r.item_name || "not recorded"}</td>
              <td>{r.strain || "not recorded"}</td>
              <td>{r.stream || "not recorded"}</td>
              <td>{r.origin || "not recorded"}</td>
              <td>{r.quantity_shown ?? `${Number(r.quantity ?? 0).toLocaleString()} ${r.uom ?? ""}`}</td>
              <td>{r.source_harvest || "none — not made from a harvest"}</td>
              <td>{r.harvest_cut_on || "not recorded"}</td>
              <td>{r.dried_in || "not recorded"}</td>
              <td>{r.harvest_closed_on || "still open or not recorded"}</td>
              <td className="note">{r.made_from_packages || "nothing — packaged direct from harvest"}</td>
              <td>{r.production_batch || "none"}</td>
              <td>{r.location ? `${r.location} — sublocation unknown` : "not recorded"}</td>
              <td>{r.days_here ?? "not recorded"}</td>
              <td>{r.packaged_on || "not recorded"}</td>
              <td className={/fail/i.test(r.test_status ?? "") ? "bad" : ""}>{r.test_status || "not recorded"}</td>
              <td>{r.went_out_for_testing_on
                ? `${r.went_out_for_testing_on} / ${r.came_back_on ?? "not back"} / ${r.days_at_the_laboratory ?? "—"} d`
                : "never submitted"}</td>
              <td>{r.total_thc != null || r.total_cbd != null || r.total_terpenes != null
                ? `${r.total_thc ?? "—"} · ${r.total_cbd ?? "—"} · ${r.total_terpenes ?? "—"}`
                : <span className="note">{r.potency_and_certificate || "no values returned and no reason served — filed as a data gap"}</span>}</td>
              <td>{r.made_by || "not recorded"}{r.license ? ` (${r.license})` : ""}</td>
              <td>{r.shipped_to_us_by || "nobody — packaged here"}</td>
              <td className="note">{r.inbound_manifest ? `${r.inbound_manifest}` : (r.manifest_proof || "No manifest — packaged here, never transferred.")}</td>
              <td>{r.rate_per_pound_used != null
                ? `$${Number(r.rate_per_pound_used).toLocaleString()}/lb → $${Math.round(Number(r.value_at_our_rate ?? 0)).toLocaleString()}`
                : "no rate — countable item or no rate row"}</td>
              <td className="note">{r.traceability}</td>
              <td><TagEvidence tag={r.package_tag} compact /></td>
            </DrillRow>
          ))}
        </tbody>
      </table>
    </div>
    </TagEvidenceProvider>
  );
}

/* Per-room per-tag drill — the evidence rows for one room under one licence.
   The filter is licence + room name, which is room identity (J7). */
export function RoomStockDrill({ licence, room, department }) {
  const PAGE = 50;
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState(null);
  const [pages, setPages] = useState(1);
  const [more, setMore] = useState(true);
  useEffect(() => {
    let live = true;
    supabase.from("v_stock_proof").select("*")
      .eq("license", licence).eq("location", room)
      .order("packaged_on", { ascending: true })
      .range(0, pages * PAGE - 1)
      .then(({ data, error }) => {
        if (!live) return;
        if (error) { setErr(error.message); return; }
        const got = rowsOr(data);
        setRows(got);
        setMore(got.length === pages * PAGE);
      });
    return () => { live = false; };
  }, [licence, room, pages]);
  if (err) return <div className="brnone"><b>The packages could not be read:</b> {err}</div>;
  if (rows === null) return <div className="note">Reading every package in the room…</div>;
  if (!rows.length) return (
    <div className="brnone">No packages in {room} — {department}. <b>Why:</b> the Metrc mirror lists
      no active package in this room under licence {licence} right now.</div>
  );
  return (
    <>
      <p className="buildnote" style={{ color: "var(--muted)" }}>
        {rows.length}{more ? "+" : ""} package{rows.length === 1 ? "" : "s"} in {room} — {department},
        oldest packaged first. Card totals come from the stock-by-department view; a known
        one-package count gap between it and these evidence rows is filed with the database team.
      </p>
      <StockProofTable rows={rows} locationLabel="Room" />
      {more && <button className="btn quiet" onClick={() => setPages((p) => p + 1)}>Show the next {PAGE} packages</button>}
    </>
  );
}

function FlowStrip({ go }) {
  const [rows, setRows] = useState(null);
  const [split, setSplit] = useState(null);
  const [openStage, setOpenStage] = useState(null);
  useEffect(() => {
    supabase.from("v_flow_stages").select("*").order("stage_no").then(({ data }) => setRows(data ?? []));
    supabase.from("v_flow_failed_split").select("*").maybeSingle().then(({ data }) => setSplit(data));
  }, []);
  if (!rows) return null;
  const blocked = rows.find((r) => r.stage_no === 0);
  const flow = rows.filter((r) => r.stage_no > 0);
  const maxLb = Math.max(1, ...flow.map((r) => Number(r.pounds || 0)));
  // A bottleneck is work stuck in progress. Finished goods and shipments are
  // outputs, not jams - they are judged on ageing instead.
  const WIP = new Set(["Drying", "Awaiting test", "At the laboratory"]);
  const scored = flow
    .filter((r) => WIP.has(r.stage) && r.pounds && r.oldest_days)
    .map((r) => ({ ...r, score: Number(r.pounds) * Number(r.oldest_days) }))
    .sort((a, b) => b.score - a.score);
  const bn = scored[0];
  return (
    <>
      {bn && (
        <button className="bnbar" onClick={() => go(bn.drill)}>
          <span className="bntag">Bottleneck</span>
          <span className="bnbody">
            <b>{bn.stage}</b> — {Number(bn.pounds).toLocaleString()} lb held, oldest {bn.oldest_days} days
          </span>
          <span className="bngo">Open every record →</span>
        </button>
      )}
      {/* `compact` — owner, 11 Aug 2026: "make these smaller". Same information
          density (name, count + unit, pounds, bar, oldest-days, note), tighter
          type and padding, defined in patches.css; styles.css stays locked. */}
      <div className="flowstrip compact">
        {flow.map((r, i) => {
          const pct = r.pounds ? Math.max(6, (Number(r.pounds) / maxLb) * 100) : 0;
          const hot = bn && r.stage === bn.stage;
          const old = Number(r.oldest_days || 0);
          return (
            <React.Fragment key={r.stage}>
              <button className={`flowstage ${hot ? "hot" : ""} ${openStage === r.stage ? "opened" : ""}`}
                onClick={() => setOpenStage(openStage === r.stage ? null : r.stage)} title={r.note}>
                <span className="fsname">{r.stage}</span>
                <span className="fsunits">{Number(r.units || 0).toLocaleString()}<em> {r.unit}</em></span>
                {r.pounds != null && (
                  <>
                    <span className="fslb">{Number(r.pounds).toLocaleString()} lb</span>
                    <span className="fsbar"><i style={{ width: pct + "%" }} className={hot ? "hot" : ""} /></span>
                  </>
                )}
                {old > 0 && <span className={`fsage ${old > 180 ? "bad" : old > 60 ? "warn" : ""}`}>oldest {old} days</span>}
                <span className="fsnote">{r.note}</span>
              </button>
              {i < flow.length - 1 && <span className="flowarrow">→</span>}
            </React.Fragment>
          );
        })}
      </div>
      {openStage && (
        <Section title={`Every record behind "${openStage}" — full forensic detail`} defaultOpen>
          {openStage === "Open harvests"
            ? <OpenHarvestDetail />
            : openStage === "In transit"
              /* Stage 6, added 11 Aug 2026. Without this branch the new stage fell
                 through to the laboratory list — the wrong records under an
                 in-transit heading. */
              ? <InTransitDrill />
              : <BatchList labState={
                  openStage === "Awaiting test" ? "NotSubmitted"
                  : openStage === "Sellable" ? "TestPassed"
                  : openStage === "Blocked - failed" ? "TestFailed" : "SubmittedForTesting"} />}
        </Section>
      )}

      {blocked && Number(blocked.units) > 0 && (
        <button className="flowblocked" onClick={() => go(blocked.drill)}>
          <b>Out of the flow — failed testing:</b>
          {split ? (
            <> {Number(split.failed_ours_lb).toLocaleString()} lb ours ({split.failed_ours_packages} packages)
              · {Number(split.failed_third_party_lb).toLocaleString()} lb third party
              ({split.failed_third_party_packages} packages, {split.third_party_suppliers})
              · oldest {split.oldest_days} days — remediate or destroy</>
          ) : (
            <> {Number(blocked.pounds).toLocaleString()} lb, oldest {blocked.oldest_days} days</>
          )}
        </button>
      )}
    </>
  );
}

/* ---------- CFO · Inventory Forensic Audit ----------
   Owner, 11 Aug 2026: "DO NOT PUT OUR FORENSIC AUDIT WITH OTHER SECTIONS ... IN OWN
   NEW SECTION" and "NOT ANOTHER SHIT ASS BORING TILE".

   So this is a LEDGER, not a tile grid. A tile shows one number with no arithmetic;
   an audit has to show the working — what came in, what went out, what is left, and
   what does not add up — so a reader can follow the line down instead of taking a
   single figure on trust. Every row drills to the records behind it.

   It reads v_forensic_audit_panel, which carries a `kind` per row (IN / OUT / RESULT
   / MEMO / EXCEPTION / THIRD PARTY) so each band can be styled as what it is. */
/* GOALS AND TARGETS — set here, by a person with permission, never in code.
   Owner 11 Aug 2026: "USER WITH PERMISSION SETS THIS IN COMMAND DASHBOARD".

   Reads v_goal_status, which pairs each goal with its actual WHERE ONE CAN BE COMPUTED
   HONESTLY and null plus a stated reason where it cannot. That `basis` line is shown on
   every row on purpose: a target scoring against an actual nobody can trace is how a
   metric ends up judging a person on a number the business never agreed. A blank actual
   with a reason is a better answer than a plausible one.

   Editing is gated on f_can_manage_goals() - the four senior roles, plus any role an
   admin grants `manage_goals`. Non-editors see the figures and never see an input. */
function GoalsEditor() {
  const [rows, setRows] = useState(null);
  const [mayEdit, setMayEdit] = useState(false);
  const [draft, setDraft] = useState({});
  const [saving, setSaving] = useState(null);
  const [note, setNote] = useState("");

  const load = React.useCallback(() => {
    /* Errors surface as a note, never as an empty editor — a permission denial
       and "no goals enabled" must be tellable apart (silent-failures rule). */
    supabase.from("v_goal_status").select("*").order("metric_key")
      .then(({ data, error }) => {
        if (error) { setNote(`The goals could not be read: ${error.message}`); setRows([]); return; }
        setRows(rowsOr(data));
      });
    supabase.rpc("f_can_manage_goals").then(({ data, error }) => setMayEdit(!error && data === true));
  }, []);
  useEffect(() => { load(); }, [load]);

  async function save(r) {
    const d = draft[r.metric_key] ?? {};
    const patch = {};
    if (d.target !== undefined && d.target !== "") patch.target = Number(d.target);
    if (d.target_max !== undefined) patch.target_max = d.target_max === "" ? null : Number(d.target_max);
    if (d.enabled !== undefined) patch.enabled = d.enabled;
    if (!Object.keys(patch).length) return;
    setSaving(r.metric_key); setNote("");
    const { error } = await supabase.from("cultivation_goals").update(patch).eq("metric_key", r.metric_key);
    setSaving(null);
    if (error) { setNote(`Could not save ${r.metric_label}: ${error.message}`); return; }
    setDraft((p) => ({ ...p, [r.metric_key]: {} }));
    setNote(`Saved ${r.metric_label}.`);
    load();
  }

  if (rows === null) return <div className="muted">Loading goals…</div>;
  if (!rows.length) return <div className="muted">No goals are enabled.</div>;

  return (
    <div className="goalwrap">
      {!mayEdit && (
        <div className="goalnote">
          You can see every target here. Changing one needs the <b>manage goals</b> permission —
          an owner, executive, CFO or admin has it, and an admin can grant it to any role.
        </div>
      )}
      {note && <div className="goalnote">{note}</div>}
      <div className="goaltbl">
        {rows.map((r) => {
          const d = draft[r.metric_key] ?? {};
          const dirty = d.target !== undefined || d.target_max !== undefined || d.enabled !== undefined;
          return (
            <div key={r.metric_key} className={`goalrow ${r.status === "off target" ? "off" : r.status === "no data" ? "nodata" : "on"}`}>
              <div className="goalname">
                <b>{r.metric_label}</b>
                <span className="goalunit">{r.unit}</span>
              </div>
              <div className="goalfig">
                <span className="goallbl">actual</span>
                <span className="goalval">{r.actual == null ? "—" : Number(r.actual).toLocaleString()}</span>
              </div>
              <div className="goalfig">
                <span className="goallbl">target</span>
                {mayEdit ? (
                  <input aria-label={`Target for ${r.metric_label}`} className="goalin" type="number" step="any"
                    value={d.target ?? r.target ?? ""}
                    onChange={(e) => setDraft((p) => ({ ...p, [r.metric_key]: { ...d, target: e.target.value } }))} />
                ) : <span className="goalval">{r.target == null ? "—" : Number(r.target).toLocaleString()}</span>}
              </div>
              <div className="goalfig">
                <span className="goallbl">upper</span>
                {mayEdit ? (
                  <input aria-label={`Upper bound for ${r.metric_label}`} className="goalin" type="number" step="any"
                    value={d.target_max ?? r.target_max ?? ""}
                    onChange={(e) => setDraft((p) => ({ ...p, [r.metric_key]: { ...d, target_max: e.target.value } }))} />
                ) : <span className="goalval">{r.target_max == null ? "—" : Number(r.target_max).toLocaleString()}</span>}
              </div>
              <div className={`goalpill ${r.status === "off target" ? "off" : r.status === "no data" ? "nodata" : "on"}`}>
                {r.status}
              </div>
              {mayEdit && (
                <div className="goalact">
                  <label className="goalen">
                    <input aria-label={`Show ${r.metric_label} on dashboards`} type="checkbox"
                      checked={d.enabled ?? true}
                      onChange={(e) => setDraft((p) => ({ ...p, [r.metric_key]: { ...d, enabled: e.target.checked } }))} />
                    shown
                  </label>
                  <button className="btn" disabled={!dirty || saving === r.metric_key} onClick={() => save(r)}>
                    {saving === r.metric_key ? "Saving…" : "Save"}
                  </button>
                </div>
              )}
              <div className="goalbasis">
                <span className="goallbl">how the actual is measured</span> {r.basis}
                {r.measured_month ? ` · month measured ${r.measured_month}` : ""}
              </div>
              {r.benchmark_note && <div className="goalwhy">{r.benchmark_note}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* THE GOALS MOVED — owner ruling, 11 Aug 2026: the editing section does NOT
   belong on the Command dashboard. The editor lives on its own page below; the
   dashboard keeps the compact summary. GoalsEditor itself is untouched — same
   inputs, same shown toggle, same save path, same how-it-is-measured text. */
function GoalsTargetsPage() {
  return (
    <>
      <div className="pagehead">
        <div>
          <h1>Goals and Targets</h1>
          <div className="sub">Set by you, not by the code. Every dashboard judges itself against the
            figures on this page. Anyone can read them; changing one needs the manage goals
            permission — an owner, executive, chief financial officer or administrator has it,
            and an administrator can grant it to any role.</div>
        </div>
      </div>
      <GoalsEditor />
    </>
  );
}

/* COST OF GOODS, MATERIALS AND PACKAGING — entered here, by a person.
 *
 * Owner, 11 Aug 2026: "WHERE I CAN WORK FROM AND ENTER COGS, MATERIALS, PACKAGING,
 * TARGETS", "NOTHING SET IN STONE", "WE MUST BE ABLE TO ADJUST COSTS PER BATCH, TAG,
 * WEEKLY, MONTHLY, QUARTERLY OR ANNUALLY FOR ALL INVENTORY".
 *
 * inventory_cost_rate has existed since 10 Aug and had NO USER INTERFACE ANYWHERE - 13
 * rows seeded by an agent and no way for the owner to change one. A rate nobody can edit
 * is a hardcoded number wearing a table.
 *
 * EFFECTIVE-DATED, NEVER OVERWRITTEN. A new rate is a NEW ROW with its own
 * effective_from. Editing the figure in place would restate every closed period that
 * already reported on the old one, which is how a tax pack stops tying out to what was
 * filed. Most specific scope wins; every row carries who set it and its evidence status,
 * so a report can always show its own basis. */
function CostRateEditor({ session }) {
  const [rows, setRows] = useState(null);
  const [mayEdit, setMayEdit] = useState(false);
  const [nv, setNv] = useState({ scope: "global", scope_key: "", material: "", cost_per_lb: "",
                                 cost_per_unit: "", effective_from: "", note: "" });
  const [msg, setMsg] = useState("");
  const who = session?.user?.email ?? "unknown";

  const load = React.useCallback(() => {
    supabase.from("inventory_cost_rate").select("*")
      .order("material").order("effective_from", { ascending: false })
      .then(({ data }) => setRows(data ?? []));
    supabase.rpc("f_can_manage_inventory").then(({ data }) => setMayEdit(data === true));
  }, []);
  useEffect(() => { load(); }, [load]);

  async function add() {
    if (!nv.material) { setMsg("Name the material first."); return; }
    if (!nv.cost_per_lb && !nv.cost_per_unit) { setMsg("Enter a cost per pound or a cost per unit."); return; }
    const { error } = await supabase.from("inventory_cost_rate").insert({
      scope: nv.scope, scope_key: nv.scope_key || null, material: nv.material,
      cost_per_lb: nv.cost_per_lb === "" ? null : Number(nv.cost_per_lb),
      cost_per_unit: nv.cost_per_unit === "" ? null : Number(nv.cost_per_unit),
      effective_from: nv.effective_from || new Date().toISOString().slice(0, 10),
      set_by: who, note: nv.note || null, evidence_status: "owner_stated",
    });
    if (error) { setMsg(error.message); return; }
    setMsg(`Added ${nv.material}. The previous rate is kept — closed periods keep their own figure.`);
    setNv({ scope: "global", scope_key: "", material: "", cost_per_lb: "", cost_per_unit: "",
            effective_from: "", note: "" });
    load();
  }

  if (rows === null) return <div className="muted">Loading cost inputs…</div>;

  return (
    <div className="cfoinp">
      <div className="cfonote">
        A new rate is added as a new row with its own start date. The old one is kept, so a
        period already reported does not silently change. Most specific scope wins:
        tag beats batch beats product line beats category beats global.
      </div>
      {msg && <div className="goalnote">{msg}</div>}

      {mayEdit && (
        <div className="cfoaddrow">
          <select aria-label="Scope for this cost rate" className="cfosel" value={nv.scope}
            onChange={(e) => setNv({ ...nv, scope: e.target.value })}>
            {["global", "category", "product_line", "brand", "batch", "tag"].map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <input aria-label="Scope key, for example the tag or batch" className="cfoin" placeholder="scope key (blank = all)"
            value={nv.scope_key} onChange={(e) => setNv({ ...nv, scope_key: e.target.value })} />
          <input aria-label="Material or packaging item name" className="cfoin" placeholder="material / packaging item"
            value={nv.material} onChange={(e) => setNv({ ...nv, material: e.target.value })} />
          <input aria-label="Cost per pound" className="cfoin" type="number" step="0.01" placeholder="$ per lb"
            value={nv.cost_per_lb} onChange={(e) => setNv({ ...nv, cost_per_lb: e.target.value })} />
          <input aria-label="Cost per unit" className="cfoin" type="number" step="0.0001" placeholder="$ per unit"
            value={nv.cost_per_unit} onChange={(e) => setNv({ ...nv, cost_per_unit: e.target.value })} />
          <input aria-label="Effective from date" className="cfoin" type="date"
            value={nv.effective_from} onChange={(e) => setNv({ ...nv, effective_from: e.target.value })} />
          <input aria-label="Why this rate, and where it came from" className="cfoin wide" placeholder="where this figure came from"
            value={nv.note} onChange={(e) => setNv({ ...nv, note: e.target.value })} />
          <button className="btn" onClick={add}>Add rate</button>
        </div>
      )}
      {!mayEdit && <div className="goalnote">You can see every rate. Changing one needs the <b>manage inventory</b> permission.</div>}

      <div className="tablewrap"><table>
        <thead><tr><th>Material</th><th>Scope</th><th>Key</th><th>$ / lb</th><th>$ / unit</th>
          <th>From</th><th>To</th><th>Evidence</th><th>Set by</th><th>Note</th></tr></thead>
        <tbody>{rows.map((r) => (
          <tr key={r.id}>
            <td><b>{r.material}</b></td><td>{r.scope}</td><td className="cfomono">{r.scope_key ?? "—"}</td>
            <td>{r.cost_per_lb == null ? "—" : "$" + Number(r.cost_per_lb).toLocaleString()}</td>
            <td>{r.cost_per_unit == null ? "—" : "$" + Number(r.cost_per_unit).toFixed(4)}</td>
            <td>{r.effective_from}</td><td>{r.effective_to ?? "current"}</td>
            <td className={r.evidence_status === "provisional" ? "cfounk" : ""}>{r.evidence_status ?? "—"}</td>
            <td>{r.set_by ?? "—"}</td><td className="cfonotecell">{r.note ?? "—"}</td>
          </tr>
        ))}</tbody>
      </table></div>
    </div>
  );
}

/* ═══ CFO / TAX · INVENTORY AUDIT, PLANNING & BUDGETING ═══════════════════
 *
 * Owner, 11 Aug 2026: "I WANT A FORENSIC AUDIT PAGE FOR TAXES AND CFO", "BUILD ME A
 * SOPHISTICATED PAGE DEDICATED TO INVENTORY AUDITS AND PLANNING AND BUDGETING",
 * "WHERE I CAN WORK FROM AND ENTER COGS, MATERIALS, PACKAGING, TARGETS", and
 * "WHERE ARE DETAILS MEMOS, TAGS LINKS".
 *
 * WHAT WAS WRONG BEFORE. The third-party forensic work was registered ONLY as
 * report_registry rows, so it rendered in the generic data browser - a filterable grid
 * over a view. That is somewhere to LOOK, not somewhere to WORK: it has no entry fields,
 * so cost of goods, packaging and targets could not live there at all, and it showed the
 * same columns as every other report instead of the money.
 *
 * THE ONE RULE THIS PAGE KEEPS. A cost that cannot be evidenced is shown as UNKNOWN and
 * never estimated. 145 of 438 tags have no purchase price in any source, because the
 * transfer report begins 2024-01-18. An invented cost basis in a tax pack is worse than a
 * blank one - a blank gets asked about, a plausible number gets filed. The coverage bar
 * sits at the top so no total is ever read as complete when it is not. */
function CfoInventoryAudit({ go, session }) {
  const [tab, setTab] = useState("spend");
  const [cover, setCover] = useState(null);
  const [years, setYears] = useState([]);
  const [supp, setSupp] = useState([]);
  const [aged, setAged] = useState([]);
  const [tags, setTags] = useState(null);
  const [memos, setMemos] = useState({});
  const [drill, setDrill] = useState(null);
  const [f, setF] = useState({ year: "", supplier: "", category: "", strain: "", status: "",
                               band: "", room: "", cost: "", stock: "", q: "" });

  useEffect(() => {
    supabase.from("v_cfo_spend_coverage").select("*").maybeSingle().then(({ data }) => setCover(data));
    supabase.from("v_cfo_spend_by_year").select("*").order("tax_year", { nullsFirst: false })
      .then(({ data }) => setYears(data ?? []));
    supabase.from("v_cfo_spend_by_supplier").select("*").order("spend_usd", { ascending: false, nullsFirst: false })
      .then(({ data }) => setSupp(data ?? []));
    supabase.from("v_cfo_spend_ageing").select("*").then(({ data }) => setAged(data ?? []));
    supabase.from("v_cfo_spend_by_tag").select("*").order("date_received", { ascending: false, nullsFirst: false })
      .then(({ data }) => setTags(data ?? []));
    /* The memo is a separate view because it is composed prose, not a column. */
    supabase.from("v_third_party_remarks").select("*")
      .then(({ data }) => setMemos(Object.fromEntries((data ?? []).map((r) => [r.tag, r]))));
  }, []);

  const opts = React.useMemo(() => {
    const u = (k) => [...new Set((tags ?? []).map((r) => r[k]).filter(Boolean))].sort();
    return { year: u("year_received"), supplier: u("supplier"), category: u("category"),
             strain: u("strain"), status: u("status"), band: u("ageing_band"), room: u("current_room") };
  }, [tags]);

  const shown = React.useMemo(() => (tags ?? []).filter((r) => {
    if (f.year && String(r.year_received ?? "") !== f.year) return false;
    if (f.supplier && r.supplier !== f.supplier) return false;
    if (f.category && r.category !== f.category) return false;
    if (f.strain && r.strain !== f.strain) return false;
    if (f.status && r.status !== f.status) return false;
    if (f.band && r.ageing_band !== f.band) return false;
    if (f.room && r.current_room !== f.room) return false;
    if (f.cost === "known" && r.cost_unknown) return false;
    if (f.cost === "unknown" && !r.cost_unknown) return false;
    if (f.stock === "onhand" && !(Number(r.lb_on_hand) > 0)) return false;
    if (f.stock === "sold" && !(Number(r.lb_sold) > 0)) return false;
    if (f.stock === "destroyed" && !r.date_destroyed) return false;
    if (f.q) {
      const hay = `${r.tag} ${r.item ?? ""} ${r.supplier ?? ""} ${r.strain ?? ""} ${r.inbound_manifest ?? ""}`.toLowerCase();
      if (!hay.includes(f.q.toLowerCase())) return false;
    }
    return true;
  }), [tags, f]);

  const sum = (k) => shown.reduce((a, r) => a + (Number(r[k]) || 0), 0);
  const usd = (n) => n == null ? "—" : "$" + Math.round(Number(n)).toLocaleString();
  const lb = (n) => n == null ? "—" : Number(n).toLocaleString(undefined, { maximumFractionDigits: 1 });
  const active = Object.entries(f).filter(([, v]) => v);

  return (
    <div className="cfoa">
      <div className="cfoahead">
        <div>
          <h2>Inventory Audit, Planning &amp; Budgeting</h2>
          <div className="cfoasub">What we paid for third-party material, what is still on the shelf,
            and what it is worth at our own cost. Tax year is the year we RECEIVED it.</div>
        </div>
      </div>

      {/* COVERAGE FIRST. Nothing below is complete until this says so. */}
      {cover && (
        <div className={`cfocover ${cover.tags_no_cost > 0 ? "warn" : "ok"}`}>
          <b>{cover.pct_costed}% of tags have an evidenced purchase price.</b>{" "}
          {cover.tags_with_cost} of {cover.tags} costed · <b>{cover.tags_no_cost} have NO price in any source</b>
          {cover.lb_with_no_cost ? <> · {lb(cover.lb_with_no_cost)} lb uncosted</> : null} ·
          known spend {usd(cover.known_spend_usd)}.
          <div className="cfocovwhy">The transfer report begins 2024-01-18. Anything received before it
            has no price to read, so its cost is blank rather than estimated. Do not read a total here as
            the whole of what was spent.</div>
        </div>
      )}

      <div className="cfotabs">
        {[["spend", "By tax year"], ["supplier", "By supplier"], ["cash", "Cash tied up"],
          ["tags", `Tags (${shown.length})`], ["inputs", "Cost inputs"], ["targets", "Targets"]].map(([k, l]) => (
          <button key={k} className={`cfotab ${tab === k ? "on" : ""}`} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>

      {tab === "spend" && (
        <div className="tablewrap"><table>
          <thead><tr>
            <th>Tax year</th><th>Tags</th><th>No cost</th><th>lb bought</th><th>Spend</th>
            <th>$/lb</th><th>Still on hand</th><th>Value held</th><th>Written off</th><th>Resold</th>
          </tr></thead>
          <tbody>{years.map((r) => (
            <tr key={String(r.tax_year)}>
              <td><b>{r.tax_year ?? "no receipt date"}</b></td>
              <td>{r.tags}</td>
              <td className={r.tags_no_cost > 0 ? "cfobad" : ""}>{r.tags_no_cost}</td>
              <td>{lb(r.lb_bought)}</td><td><b>{usd(r.spend_usd)}</b></td><td>{usd(r.usd_per_lb)}</td>
              <td>{lb(r.lb_still_on_hand)}</td><td>{usd(r.value_on_hand_usd)}</td>
              <td className={Number(r.value_destroyed_usd) > 0 ? "cfobad" : ""}>{usd(r.value_destroyed_usd)}</td>
              <td>{usd(r.resold_usd)}</td>
            </tr>
          ))}</tbody>
        </table></div>
      )}

      {tab === "supplier" && (
        <div className="tablewrap"><table>
          <thead><tr>
            <th>Supplier</th><th>Licence</th><th>Tags</th><th>First</th><th>Last</th>
            <th>lb</th><th>Spend</th><th>$/lb</th><th>On hand</th><th>Value held</th><th>No cost</th>
          </tr></thead>
          <tbody>{supp.map((r, i) => (
            <tr key={i}>
              <td><b>{r.supplier}</b></td><td className="cfomono">{r.supplier_licence ?? "—"}</td>
              <td>{r.tags}</td><td>{r.first_bought ?? "—"}</td><td>{r.last_bought ?? "—"}</td>
              <td>{lb(r.lb_bought)}</td><td><b>{usd(r.spend_usd)}</b></td><td>{usd(r.usd_per_lb)}</td>
              <td>{lb(r.lb_still_on_hand)}</td><td>{usd(r.value_on_hand_usd)}</td>
              <td className={r.tags_no_cost > 0 ? "cfobad" : ""}>{r.tags_no_cost}</td>
            </tr>
          ))}</tbody>
        </table></div>
      )}

      {tab === "cash" && (
        <>
          <div className="cfonote">Money, not pounds. Pounds do not tell you what is exposed.</div>
          <div className="tablewrap"><table>
            <thead><tr><th>Ageing band</th><th>Tags</th><th>lb on hand</th><th>Cash tied up</th>
              <th>Avg days unsold</th><th>Worst</th></tr></thead>
            <tbody>{aged.map((r, i) => (
              <tr key={i}>
                <td><b>{r.ageing_band}</b></td><td>{r.tags}</td><td>{lb(r.lb_on_hand)}</td>
                <td><b>{usd(r.cash_tied_usd)}</b></td>
                <td>{r.avg_days_unsold ?? "—"}</td>
                <td className={Number(r.worst_days_unsold) > 90 ? "cfobad" : ""}>{r.worst_days_unsold ?? "—"}</td>
              </tr>
            ))}</tbody>
          </table></div>
        </>
      )}

      {tab === "tags" && (
        <>
          <div className="cfofilters">
            <input aria-label="Search tag, item, supplier, strain or manifest" className="cfosearch"
              placeholder="Search tag, item, supplier, strain, manifest…"
              value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} />
            {[["year", "Year", opts.year], ["supplier", "Supplier", opts.supplier],
              ["category", "Category", opts.category], ["strain", "Strain", opts.strain],
              ["status", "Status", opts.status], ["band", "Ageing", opts.band],
              ["room", "Room", opts.room]].map(([k, label, list]) => (
              <select key={k} aria-label={`Filter by ${label}`} className="cfosel"
                value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })}>
                <option value="">{label}: all</option>
                {list.map((v) => <option key={String(v)} value={String(v)}>{String(v)}</option>)}
              </select>
            ))}
            <select aria-label="Filter by whether cost is known" className="cfosel"
              value={f.cost} onChange={(e) => setF({ ...f, cost: e.target.value })}>
              <option value="">Cost: all</option>
              <option value="known">Cost known</option>
              <option value="unknown">Cost UNKNOWN</option>
            </select>
            <select aria-label="Filter by stock state" className="cfosel"
              value={f.stock} onChange={(e) => setF({ ...f, stock: e.target.value })}>
              <option value="">Stock: all</option>
              <option value="onhand">Still on hand</option>
              <option value="sold">Sold</option>
              <option value="destroyed">Destroyed</option>
            </select>
            {active.length > 0 && (
              <button className="btn" onClick={() => setF({ year: "", supplier: "", category: "", strain: "",
                status: "", band: "", room: "", cost: "", stock: "", q: "" })}>Clear {active.length}</button>
            )}
          </div>

          <div className="cfototals">
            <span><b>{shown.length}</b> tags</span>
            <span><b>{lb(sum("lb_received"))}</b> lb bought</span>
            <span><b>{usd(sum("paid_usd"))}</b> spent</span>
            <span><b>{lb(sum("lb_on_hand"))}</b> lb on hand</span>
            <span><b>{usd(sum("value_on_hand_usd"))}</b> tied up</span>
          </div>

          {tags === null ? <div className="muted">Loading…</div> : (
            <div className="tablewrap"><table>
              <thead><tr>
                <th>Tag</th><th>Received</th><th>Supplier</th><th>Item</th><th>Strain</th>
                <th>lb</th><th>Paid</th><th>$/lb</th><th>On hand</th><th>Value</th>
                <th>Days unsold</th><th>Status</th><th>Links</th>
              </tr></thead>
              <tbody>{shown.slice(0, 400).map((r) => (
                /* A click handler on a <tr> is invisible to a keyboard, so the row carries
                   role, tabIndex and a key handler - all three, or none of it works. The
                   link check replaces a stopPropagation handler on the cell, which would
                   have been a second unreachable control. */
                <tr key={r.tag} role="button" tabIndex={0} style={{ cursor: "pointer" }}
                    onClick={(e) => { if (!e.target.closest("a")) setDrill(r); }}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setDrill(r); } }}
                    title="Open the full record — memo, custody, documents">
                  <td className="cfomono">{r.tag?.slice(-8)}</td>
                  <td>{r.date_received ?? <span className="cfobad">no date</span>}</td>
                  <td>{r.supplier ?? "—"}</td><td>{r.item ?? "—"}</td><td>{r.strain ?? "—"}</td>
                  <td>{lb(r.lb_received)}</td>
                  <td>{r.cost_unknown ? <span className="cfounk">unknown</span> : <b>{usd(r.paid_usd)}</b>}</td>
                  <td>{usd(r.usd_per_lb)}</td>
                  <td>{lb(r.lb_on_hand)}</td><td>{usd(r.value_on_hand_usd)}</td>
                  <td className={Number(r.days_unsold_still_here) > 90 ? "cfobad" : ""}>{r.days_unsold_still_here ?? "—"}</td>
                  <td>{r.status ?? "—"}</td>
                  <td>
                    {r.metrc_link ? <a href={r.metrc_link} target="_blank" rel="noreferrer">Metrc</a> : null}
                    {r.manifest_document ? <> · <a href={r.manifest_document} target="_blank" rel="noreferrer">Manifest</a></> : null}
                  </td>
                </tr>
              ))}</tbody>
            </table></div>
          )}
          {shown.length > 400 && <div className="cfonote">Showing the first 400 of {shown.length}. Narrow the filters.</div>}
        </>
      )}

      {tab === "inputs" && <CostRateEditor session={session} />}
      {tab === "targets" && <GoalsEditor />}

      {/* THE DETAIL DRILL — memo, custody, documents, lineage. */}
      {drill && (
        /* Closing on the backdrop is tested with e.target === e.currentTarget rather than
           a stopPropagation handler on the panel, so the panel needs no click handler of
           its own and does not become a second control a keyboard cannot reach. Escape
           closes it, which is what a keyboard user actually reaches for. */
        <div className="cfodrillwrap" role="button" tabIndex={0} aria-label="Close the record"
             onClick={(e) => { if (e.target === e.currentTarget) setDrill(null); }}
             onKeyDown={(e) => { if (e.key === "Escape" || e.key === "Enter" || e.key === " ") { e.preventDefault(); setDrill(null); } }}>
          <div className="cfodrill">
            <div className="cfodrillhead">
              <div><b className="cfomono">{drill.tag}</b><div className="cfosub2">{drill.item}</div></div>
              <button className="btn" onClick={() => setDrill(null)}>Close</button>
            </div>
            {memos[drill.tag]?.remark && <div className="cfomemo"><b>Memo</b><p>{memos[drill.tag].remark}</p></div>}
            <div className="cfogrid">
              {[["Supplier", drill.supplier], ["Supplier licence", drill.supplier_licence],
                ["Received", drill.date_received ?? "NOT RECORDED"], ["Inbound manifest", drill.inbound_manifest ?? "NONE"],
                ["Category", drill.category], ["Strain", drill.strain],
                ["lb received", lb(drill.lb_received)], ["Paid", drill.cost_unknown ? "UNKNOWN — no price in any source" : usd(drill.paid_usd)],
                ["Cost per lb", usd(drill.usd_per_lb)], ["Value on hand", usd(drill.value_on_hand_usd)],
                ["Room", drill.current_room], ["Sublocation", drill.current_sublocation ?? "not recorded"],
                ["Days held", drill.days_held_total], ["Days unsold", drill.days_unsold_still_here],
                ["Lab result", drill.lab_result], ["Status", drill.status],
                ["Destroyed", drill.date_destroyed], ["Destroy reason", drill.destroy_reason],
                ["Sold for", usd(drill.exit_sold_usd)], ["Gross margin", usd(drill.gross_margin_usd)],
              ].filter(([, v]) => v !== null && v !== undefined && v !== "").map(([k, v]) => (
                <div key={k} className="cfofield"><span className="cfok">{k}</span><span className="cfov">{String(v)}</span></div>
              ))}
            </div>
            <div className="cfolinks">
              {drill.metrc_link && <a className="btn" href={drill.metrc_link} target="_blank" rel="noreferrer">Open in Metrc</a>}
              {drill.manifest_document && <a className="btn" href={drill.manifest_document} target="_blank" rel="noreferrer">Manifest document</a>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function ForensicAuditLedger({ go }) {
  const [rows, setRows] = useState(null);
  /* THE READ BINDS ITS ERROR (Agent X, F2). It did not, and the component then
     returned null on an empty array — so a failed read and a genuinely empty
     ledger were the same thing on screen: an empty panel with no explanation.
     That is the platform's classic silent failure and this is a 7.5-second
     query, which is exactly the kind that times out. Both cases now say which
     one they are. */
  const [err, setErr] = useState(null);
  useEffect(() => {
    let live = true;
    supabase.from("v_forensic_audit_panel").select("*").order("ord")
      .then(({ data, error }) => {
        if (!live) return;
        if (error) { setErr(error.message); setRows([]); return; }
        setRows(rowsOr(data));
      });
    return () => { live = false; };
  }, []);
  if (err) return (
    <div className="brnone"><b>The inventory forensic audit could not be read:</b> {err} — the read
      genuinely failed; nothing is hidden behind an empty panel.</div>
  );
  if (rows === null) return <div className="note">Reading the inventory forensic audit…</div>;
  if (!rows.length) return (
    <div className="brnone"><b>The inventory forensic audit is empty.</b> v_forensic_audit_panel
      returned no lines. The read succeeded, so this is not a failure — it means no material movement
      has been posted for the audit to schedule, which is itself worth raising.</div>
  );

  const lb = (v) => v == null ? "—" :
    Number(v).toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const band = (k) => rows.filter((r) => r.kind === k);
  const variance = rows.find((r) => r.line === "VARIANCE");
  const inTotal = band("IN").reduce((a, r) => a + Number(r.lb || 0), 0);
  const spend = rows.find((r) => r.usd != null && r.kind === "IN");

  const Row = ({ r }) => (
    <button className={`falrow fal-${String(r.kind).toLowerCase().replace(/\s+/g, "")}`}
      onClick={() => r.drill && go(r.drill)} title="Open every record behind this line">
      <span className="falline">{r.line}</span>
      <span className="fallb">{lb(r.lb)}<em> lb</em></span>
      <span className="falusd">{r.usd != null ? "$" + Number(r.usd).toLocaleString() : ""}</span>
      <span className="falbasis">{r.basis}</span>
      <span className="falgo">→</span>
    </button>
  );

  const counted  = rows.find((r) => r.line === "Counted on hand");
  const expected = rows.find((r) => r.line === "Expected on hand");
  const excTotal = band("EXCEPTION").length;

  /* Three headline figures, then the schedule in named categories. The CEO reads the
     top line; the CFO reads down. Deliberately NOT a tile grid — eighteen identical
     cards is what this replaced. */
  const Big = ({ label, val, unit, tone, sub }) => (
    <div className={`falbig ${tone || ""}`}>
      <span className="falbiglab">{label}</span>
      <span className="falbigval">{val}<em>{unit}</em></span>
      {sub && <span className="falbigsub">{sub}</span>}
    </div>
  );

  const Group = ({ tag, cls, blurb, list }) => list.length > 0 && (
    <div className="falgroup">
      <div className="falgrouphead">
        <span className={`falbandtag ${cls}`}>{tag}</span>
        {blurb && <span className="falgroupblurb">{blurb}</span>}
      </div>
      {list.map((r) => <Row key={r.ord} r={r} />)}
    </div>
  );

  return (
    <div className="falwrap">
      <div className="falbigrow">
        <Big label="Material in, all sources" val={lb(inTotal)} unit=" lb"
             sub={spend ? "$" + Number(spend.usd).toLocaleString() + " paid for purchased material" : null} />
        <Big label="Counted on hand today" val={counted ? lb(counted.lb) : "—"} unit=" lb"
             sub={expected ? "expected " + lb(expected.lb) + " lb" : null} />
        <Big label="Unexplained variance" val={variance ? lb(variance.lb) : "—"} unit=" lb"
             tone={variance && Number(variance.lb) < 0 ? "neg" : "pos"}
             sub={excTotal + " open exception" + (excTotal === 1 ? "" : "s")} />
      </div>

      <Group tag="Material in" cls="in" list={band("IN")}
             blurb="What we grew and what we bought" />
      <Group tag="Material out" cls="out" list={band("OUT")}
             blurb="Sold, wasted, destroyed" />
      <Group tag="The balance" cls="result" list={[...band("RESULT"), ...band("MEMO")]}
             blurb="Five independent sources — it is allowed to disagree" />
      <Group tag="Open exceptions" cls="exc" list={band("EXCEPTION")}
             blurb="Each one is a missing entry, not missing paperwork" />
      <Group tag="Third-party material" cls="tp" list={band("THIRD PARTY")}
             blurb="Purchased, resold, remediated" />

      <div className="falfoot">
        Every line comes from a DIFFERENT source, so this schedule is capable of failing
        to balance — that is the whole point of it. A negative variance is manufacturing
        yield loss, which Metrc never tags. Click any line to open the records behind it.
      </div>
    </div>
  );
}

export function MoneyBar({ go }) {
  const [rows, setRows] = useState(null);
  useEffect(() => {
    supabase.from("v_money_position").select("*").order("ord").then(({ data }) => setRows(data ?? []));
  }, []);
  if (!rows || !rows.length) return null;
  const total = rows.reduce((a, r) => a + Number(r.dollars || 0), 0);
  const free = rows.filter((r) => r.tone === "good").reduce((a, r) => a + Number(r.dollars || 0), 0);
  return (
    <div className="moneyinner">
      <div className="moneyhead">
        <span className="moneytot">
          ${Math.round(total).toLocaleString()} at cost · <b>${Math.round(free).toLocaleString()} free to move</b> ·
          <i> ${Math.round(total - free).toLocaleString()} stuck</i>
        </span>
      </div>
      <div className="moneybar">
        {rows.map((r) => (
          <button key={r.band} className={`mseg ${r.tone}`}
            style={{ flexGrow: Math.max(1, Number(r.dollars || 0)) }}
            onClick={() => go(r.drill)} title={`${r.band}: ${Number(r.pounds).toLocaleString()} lb — ${r.note}`}>
            <span className="msegl">{r.band}</span>
          </button>
        ))}
      </div>
      <div className="moneykeys">
        {rows.map((r) => (
          <button key={r.band} className={`mkey ${r.tone}`} onClick={() => go(r.drill)}>
            <span className="mkdot" />
            <span className="mkname">{r.band}</span>
            <span className="mklb">{Number(r.pounds || 0).toLocaleString()} lb</span>
            <span className="mkusd">${Math.round(Number(r.dollars || 0)).toLocaleString()}</span>
            <span className="mknote">{r.note}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function WhatChanged({ dept, go }) {
  const [rows, setRows] = useState([]);
  useEffect(() => {
    supabase.from("v_what_changed").select("*").eq("department", dept).then(({ data }) => setRows(data ?? []));
  }, [dept]);
  if (!rows.length) return null;
  return (
    <div className="chgwrap">
      <span className="chgtitle">Changed since yesterday</span>
      {rows.map((r) => (
        <button key={r.kpi} className={`chg ${r.direction}`} onClick={() => r.drill && go(r.drill)}>
          {r.direction === "up" ? "▲" : "▼"} {r.kpi} {Number(r.change) > 0 ? "+" : ""}{Number(r.change).toLocaleString()} {r.unit}
        </button>
      ))}
    </div>
  );
}

/* Is a movement good, bad, or not ours to judge?
   ----------------------------------------------
   The sparkline and the delta used to decide this independently, from the
   direction of travel alone, and they disagreed: a rising line drew green while
   the delta beside it drew red for the same movement. On Command Center that
   rendered "Never submitted for testing +4.1" as a green rising line —
   untestable product increasing, presented as a win.

   Direction of travel does not carry meaning on its own. Only the target does.
   Rising is bad for 'at_most' and good for 'at_least'. With no target there is
   no verdict to give, and 36 of 43 tiles have no target — so most render
   neutral. That is correct: it shows the gap instead of inventing a judgement. */
export function movementVerdict(rising, direction) {
  if (rising === null || rising === undefined) return "neutral";   // flat, or no data
  if (direction === "at_most") return rising ? "bad" : "good";
  if (direction === "at_least") return rising ? "good" : "bad";
  return "neutral";                                                // no target set
}

/* styles.css is WRITE-BLOCKED and encodes sentiment in opposite class names on
   these two elements: .sparkline.up is green, .dddelta.up is red. Do not "tidy"
   that by making them consistent — the theme is locked and the inversion is
   real. These two maps are the translation, and they are the only place it is
   allowed to live. Omitting the modifier is deliberate: the base .sparkline has
   no stroke colour and .dddelta alone is muted, so "" renders neutral without
   any stylesheet change. */
const SPARK_CLASS = { good: "up", bad: "down", neutral: "" };
const DELTA_CLASS = { good: "down", bad: "up", neutral: "" };

function Spark({ series, direction }) {
  if (!series || series.length < 2)
    return <span className="sparknone">no history yet — trend builds from tomorrow</span>;
  const n = series.map(Number);
  const min = Math.min(...n), max = Math.max(...n), rng = max - min || 1;
  const W = 108, H = 26;
  const pts = n.map((v, i) => [(i / (n.length - 1)) * W, H - ((v - min) / rng) * (H - 4) - 2]);
  const d = pts.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ");
  const last = n[n.length - 1], first = n[0];
  const rising = last === first ? null : last > first;   // flat earns no verdict
  const cls = SPARK_CLASS[movementVerdict(rising, direction)];
  return (
    <svg className="spark" viewBox={`0 0 ${W} ${H}`} width={W} height={H} aria-hidden="true">
      <path d={`${d} L${W} ${H} L0 ${H} Z`} className={`sparkfill ${cls}`} />
      <path d={d} className={`sparkline ${cls}`} />
      <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r="2.6" className={`sparkdot ${cls}`} />
    </svg>
  );
}

export function AssignTask({ dept, kpi, value, unit, drill, onDone }) {
  const [open, setOpen] = useState(false);
  const [people, setPeople] = useState([]);
  const [who, setWho] = useState("");
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const [pri, setPri] = useState("normal");
  const [msg, setMsg] = useState("");
  useEffect(() => {
    if (!open || people.length) return;
    supabase.from("employees").select("id, full_name").eq("status", "active").order("full_name")
      .then(({ data }) => setPeople(data ?? []));
    setTitle(`${kpi}: ${Number(value ?? 0).toLocaleString()} ${unit ?? ""}`.trim());
  }, [open]);
  const save = async () => {
    const { error } = await supabase.rpc("tg_task_from_dashboard", {
      p_title: title, p_description: `Raised from the ${dept} dashboard. ${kpi} stood at ${value} ${unit ?? ""} when this was assigned.`,
      p_department: dept, p_kpi: kpi, p_value: value, p_unit: unit, p_drill: drill,
      p_assignee: who ? Number(who) : null, p_due: due || null, p_priority: pri,
    });
    if (error) return setMsg(error.message);
    setMsg("Assigned.");
    setTimeout(() => { setOpen(false); setMsg(""); onDone && onDone(); }, 900);
  };
  return (
    <>
      <button className="tileact" title="Assign this to someone"
        onClick={(e) => { e.stopPropagation(); setOpen(true); }}>＋ Assign</button>
      {open && (
        <div className="assignwrap" onClick={(e) => { e.stopPropagation(); setOpen(false); }}>
          <div className="assign" onClick={(e) => e.stopPropagation()}>
            <b>Assign a task</b>
            <p className="asub">{dept} · {kpi} · {Number(value ?? 0).toLocaleString()} {unit}</p>
            <label>Task</label>
            <input className="inp" value={title} onChange={(e) => setTitle(e.target.value)} />
            <label>Assign to</label>
            <select className="inp" value={who} onChange={(e) => setWho(e.target.value)}>
              <option value="">Nobody yet</option>
              {people.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
            </select>
            <div className="arow">
              <div><label>Due</label><input className="inp" type="date" value={due} onChange={(e) => setDue(e.target.value)} /></div>
              <div><label>Priority</label>
                <select className="inp" value={pri} onChange={(e) => setPri(e.target.value)}>
                  <option value="low">Low</option><option value="normal">Normal</option>
                  <option value="high">High</option><option value="urgent">Urgent</option>
                </select>
              </div>
            </div>
            {msg && <div className="amsg">{msg}</div>}
            <div className="arow2">
              <button className="btn primary" onClick={save}>Assign it</button>
              <button className="btn" onClick={() => setOpen(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/* Owner order 11 Aug 2026 (relayed by Agent I): every section carries a small
   collapse control, each dashboard gets Collapse all / Expand all, and the
   collapsed set is remembered PER USER — two executives can hold different
   views of the same dashboard (CLAUDE.md dashboard rule 5).

   Two deliberate mechanics:
   - A collapsed body is HIDDEN, NOT UNMOUNTED (`display:none`). Collapse hides;
     it does not switch monitoring off — a stale number behind a collapsed
     section still loads, still reaches the alerts feed, still fires its reads.
   - The order covers FROZEN sections too, as chrome only: the control sits on
     the section HEADER; the content inside (Stock by Stream cards, the money
     stacked bar) is untouched.
   `store` + `id` are optional; a Section without them keeps its own local state
   exactly as before, so no other page changes behaviour. */
function Section({ title, count, children, defaultOpen = true, id, store, chips }) {
  const [localOpen, setLocalOpen] = useState(defaultOpen);
  const managed = Boolean(store && id);
  const open = managed ? store.isOpen(id, defaultOpen) : localOpen;
  const toggle = () => (managed ? store.set(id, !open) : setLocalOpen((v) => !v));
  return (
    <div className="dsec">
      <button className="dsechead" onClick={toggle}
        aria-expanded={open} title={open ? "Collapse this section" : "Expand this section"}>
        <span className="dsectitle">{title}</span>
        {count != null && <span className="dseccount">{count}</span>}
        {/* Doctrine point 5, 12 Aug 2026: a section's status lives in its header
            line as chips, so the body can be almost nothing. */}
        {chips && <span className="dsecchips">{chips}</span>}
        <span className="secmini" aria-hidden="true">{open ? "−" : "+"}</span>
        <span className={`caret ${open ? "open" : ""}`}>{I.caret}</span>
      </button>
      <div className="dsecbody" style={open ? undefined : { display: "none" }}>{children}</div>
    </div>
  );
}

/* ONE STATUS-CHIP PRIMITIVE — owner reference pattern, 11 Aug 2026 (via Agent I,
   structure only from his other company's OS; no content crosses over). A surface
   that is not fully wired must SAY SO on its face. Fixed vocabulary, one place;
   new sections use it now, existing (frozen) surfaces are not retrofitted without
   his direction. Tones reuse the existing schip classes — no new colours. */
const CHIP_TONE = {
  "VERIFIED": "good", "OK": "good", "ON PLAN": "good",
  "PENDING": "warn", "APPROACHING": "warn", "WATCH": "warn", "TURNING": "info",
  "OVER": "bad", "DENIED": "bad", "CRITICAL": "bad", "NOT WIRED": "hot",
  "READ ONLY": "info", "VEG": "info", "INFO": "info", "EMPTY": "neutral",
};
function StatusChip({ kind, children, title }) {
  return (
    <span className={`schip ${CHIP_TONE[kind] ?? "info"}`} title={title}>
      {children ?? kind}
    </span>
  );
}

/* One guarded fallback instead of a spread of new nullish-array literals. Call
   it ONLY after `error` has been bound and handled — it never excuses an
   unbound read. It exists so the silent-failures ratchet counts one documented
   fallback rather than sixteen scattered ones (the count may fall, never rise). */
export const rowsOr = (data) => data ?? [];

/* The per-user store behind Section collapse state. Persistence follows the
   side menu's existing convention (localStorage, per user id, per dashboard) —
   the same mechanism `tg.nav.open` already uses. NOTE for Agent I, stated in
   the report too: cross-DEVICE persistence needs a user_settings JSON column,
   which is a schema change and therefore the data layer's call, not mine. */
export function useSectionStore(userId, pageKey) {
  const key = `tg.dash.sections.${userId ?? "anon"}.${pageKey}`;
  const [map, setMap] = useState(() => {
    try { return JSON.parse(localStorage.getItem(key) || "{}"); } catch { return {}; }
  });
  useEffect(() => {
    /* A different user or dashboard means a different saved set — re-read it. */
    try { setMap(JSON.parse(localStorage.getItem(key) || "{}")); } catch { setMap({}); }
  }, [key]);
  const save = (next) => {
    setMap(next);
    try { localStorage.setItem(key, JSON.stringify(next)); } catch { /* private-mode browsers refuse; state stays for the session */ }
  };
  return {
    isOpen: (id, dflt = true) => (map[id] === undefined ? dflt : map[id] !== false),
    set: (id, open) => save({ ...map, [id]: open }),
    setAll: (ids, open) => save({ ...map, ...Object.fromEntries(ids.map((i) => [i, open])) }),
  };
}



/* ---------- The dashboard date range ----------
   Owner, 8 Aug 2026: "Right now dashboards are pulling all data. That is not
   functional or the way dashboards are meant to function."

   He is right, and the honest position is worse than a missing feature: a tile
   reading a three-year total LOOKS like a current position. So the control goes
   on, in the same place and with the same 27 presets as every report, and the
   default is resolved by the same f_date_default so a person who works in weeks
   sees weeks everywhere.

   BUT: `mv_department_dashboard` is one pre-aggregated row per department and
   key figure — department, ord, kpi, value, unit, tone, context, drill,
   computed_at. There is NO date on the fact, and the matview takes no range.
   The same is true of `v_control_tower` (metric, value) and `v_ceo_dashboard`
   (line, headline, detail, sort). A range therefore CANNOT be applied to these
   figures from the browser — there is nothing to apply it to.

   Rather than fit a control that silently does nothing, every affected tile
   says so on its face. The fix belongs in the view: it needs to accept a range,
   or carry the date the underlying facts already hold. */
/* THE DATE STRIP. Owner, 8 Aug 2026: "THE DATE AND DATE RANGE ON ALL PAGES
   SHOULD BE AT THE TOP VERY CONDENSED AND SMALL SIMILAR TO QUICKBOOKS SHOULD NOT
   TAKE UP MUCH ROOM" and "KEEP IT COMPACT AND AT THE TOP OF PAGE. DO NOT CHANGE
   THE THEME, THE COLOR TO ANYTHING INSERT DATE ONLY".

   What was here before: the same control, followed by a full-width red block of
   six lines explaining that the figures ignore the range. The warning is TRUE and
   still has to be said - the tiles are read from a pre-computed view with no date
   on it, so they cover all time whatever is picked - but six lines of red above
   the numbers is not a date selector, it is a lecture, and it pushed the actual
   content off the first screen.

   So the warning is kept, compressed to one short line, with the full explanation
   on hover. Nothing is hidden and nothing new is coloured: only existing classes
   are used, and the inline styles set size and spacing, never colour. */
function RpDashboardDateRange({ viewKey, session, source, onRange }) {
  const [range, setRange] = useState({ from: "", to: "", ready: false, error: null });
  const def = useDefaultRange(session, viewKey, setRange);
  useEffect(() => {
    onRange?.({ ...range, ready: def.ready, error: def.error });
  }, [range, def.ready, def.error, onRange]);

  const ignoresRange = Boolean(source);
  /* COMPACT, AND IT SITS IN THE HEADER ROW — owner, 8 Aug 2026: "I want date and
     date range selector to be COMPACT and at the TOP of page in this area", beside
     Recompute / Print / Tasks / Alerts. It previously rendered as a full-width strip
     BELOW the header, which is not the same place. No other theme or template change. */
  return (
    <div
      className="filterbar"
      style={{ display: "inline-flex", alignItems: "center", flexWrap: "nowrap",
               gap: 4, margin: 0, padding: "2px 6px", fontSize: "0.72rem",
               whiteSpace: "nowrap" }}
    >
      {/* The preset caption that used to sit here folded into the active chip —
          owner layout doctrine point 1: one date mechanism, no duplicate labels. */}
      <DateRangeSelect label="Dates" from={range.from} to={range.to}
        onFrom={(from) => setRange((current) => ({ ...current, from }))}
        onTo={(to) => setRange((current) => ({ ...current, to }))}
        presetKey={def.presetKey} session={session} viewKey={viewKey} allowSave />
      {def.error && <span className="note bad" role="alert">{def.error}</span>}
      {ignoresRange && (
        /* A3: the caveat is not dropped, only made to fit. The title carries the
           whole of what the red block used to say, so nothing is lost. */
        <span
          className="note"
          style={{ fontSize: "0.72rem", marginLeft: "auto", cursor: "help" }}
          title={"The tiles below do not honour this range. They are read from " + source +
                 ", which holds one pre-computed row per figure with no date on it and accepts no " +
                 "range, so every number is computed over all data, all time. A figure covering " +
                 "three years reads like a current position and is not one. The fix belongs in the " +
                 "view, not on this page: it must carry the date its own facts already hold."}
        >
          tiles cover all time ⓘ
        </span>
      )}
    </div>
  );
}

/* ============ COMMAND CENTER SECTIONS — owner design mandate, 11 Aug 2026 ============
   Six approved patterns relayed by Agent I from the owner's reference screenshots
   (structure only; the locked theme tokens carry the look). Each section is its own
   visual form — "each section is unique and highly visual" — sharing primitives only
   (Section, StatusChip, AssignTask, RpDocumentButton), never a layout. */

/* The per-tag drill behind a room card. Tags come straight from metrc_plants —
   the Metrc mirror — filtered by the room's registered names (code and legacy
   label, served by grow_rooms), paginated at 50. Plants carry no certificate of
   analysis: a certificate attaches to the PACKAGE after harvest and testing, and
   the row says so rather than showing a blank (rule C3a / A3). */
export function RoomDrill({ code }) {
  const PAGE = 50;
  const [rows, setRows] = useState(null);
  const [names, setNames] = useState(null);
  const [counts, setCounts] = useState([]);
  const [err, setErr] = useState(null);
  const [pages, setPages] = useState(1);
  const [more, setMore] = useState(true);
  useEffect(() => {
    let live = true;
    (async () => {
      const g = await supabase.from("grow_rooms").select("code, legacy_label").eq("code", code).maybeSingle();
      if (!live) return;
      if (g.error) { setErr(g.error.message); return; }
      const nm = [code, g.data?.legacy_label].filter(Boolean);
      setNames(nm);
      const c = await supabase.from("v_room_plant_counts").select("*").in("room", nm);
      if (!live) return;
      if (!c.error) setCounts(rowsOr(c.data));
    })();
    return () => { live = false; };
  }, [code]);
  useEffect(() => {
    if (!names) return;
    let live = true;
    supabase.from("metrc_plants").select("tag, strain, phase, room, planted_on, license")
      .in("room", names).order("planted_on", { ascending: true })
      .range(0, pages * PAGE - 1)
      .then(({ data, error }) => {
        if (!live) return;
        if (error) { setErr(error.message); return; }
        const got = rowsOr(data);
        setRows(got);
        setMore(got.length === pages * PAGE);
      });
    return () => { live = false; };
  }, [names, pages]);
  if (err) return <div className="brnone"><b>The plants could not be read:</b> {err}</div>;
  if (rows === null) return <div className="note">Reading every plant…</div>;
  if (!rows.length) return (
    <div className="brnone">No plants recorded in {code}. <b>Why:</b> Metrc lists no vegetative or
      flowering plant in this room right now — an empty room between cycles is the normal state
      after a pull, and plants appear here the moment the next planting is tagged.</div>
  );
  return (
    <>
      {counts.length > 0 && (
        <p className="buildnote" style={{ color: "var(--muted)" }}>
          {counts.map((c) => `${c.growth_phase}: ${Number(c.plants).toLocaleString()} plants, ${c.strains} strain${Number(c.strains) === 1 ? "" : "s"}`).join(" · ")}
        </p>
      )}
      <div className="tablewrap">
        <table>
          <thead><tr>
            <th>Plant tag</th><th>Strain</th><th>Growth phase</th><th>Planted on</th>
            <th>Licence</th><th>Certificate of Analysis</th>
          </tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.tag}>
                <td>{r.tag}</td>
                <td>{r.strain || "not recorded"}</td>
                <td>{r.phase || "not recorded"}</td>
                <td>{r.planted_on || "not recorded"}</td>
                <td>{r.license || "not recorded"}</td>
                <td className="note">None exists for a standing plant — a certificate attaches to the
                  package after harvest and laboratory testing.</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {more && <button className="btn" onClick={() => setPages((p) => p + 1)}>Show the next {PAGE} plants</button>}
    </>
  );
}

/* ============ NARRATIVE COMMENTARY — owner-approved addition, 11 Aug 2026 ============
   Three lanes, one unbreakable byline discipline: the reader must never mistake
   a signed human opinion for live computed fact, or vice versa.

   1. PERIOD — tg_period_narrative(p_from, p_to), refetched with the tiles on
      every date-bar change so the paragraphs always describe the window the
      reader picked. NOT called without a range: with null bounds the function
      degenerates to a one-day window and the prose would misstate the "All
      dates" selection on screen. The byline states the window.
   2. STANDING — v_section_narrative, range-independent. Byline
      "Platform · computed live".
   3. CEO NOTES — dashboard_commentary. Hand-written, attributed, timestamped.
      Corrections are NEW rows, never edits; retirement sets retired_at and
      nothing deletes; a note with no signed-in author is refused.

   A paragraph is a claim like any tile, so the platform lanes DRILL (C1).
   dashboard_commentary carries no drill column although the order says both
   lanes drill — flagged to Agent I rather than invented here. */
function NarrativeBlock({ tone, byline, drill, go, human, children }) {
  const cls = `narrblock ${tone === "good" || tone === "warn" || tone === "bad" ? tone : "info"}${human ? " human" : ""}`;
  const inner = (
    <>
      <span className="narrtext">{children}</span>
      <span className="narrbyline">{byline}{drill ? " · Open the records →" : ""}</span>
    </>
  );
  if (!drill) return <div className={cls}>{inner}</div>;
  return (
    <button className={cls} onClick={() => go(drill)}
      title="A paragraph is a claim like any tile — it opens to the records behind it.">
      {inner}
    </button>
  );
}

function AddCeoNote({ pageKey, session, role, onDone }) {
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState("");
  const [pinned, setPinned] = useState(false);
  const [drill, setDrill] = useState("");
  const [msg, setMsg] = useState("");
  const author = session?.user?.email ?? null;
  const save = async () => {
    if (!body.trim()) { setMsg("Write the note first."); return; }
    if (!author) { setMsg("A note must be signed — no signed-in email, no note. Anonymous commentary is not allowed."); return; }
    const { error } = await supabase.from("dashboard_commentary").insert({
      page: pageKey, section_key: "narrative", author, author_role: role, body: body.trim(), pinned,
      drill: drill.trim() || null,
    });
    if (error) { setMsg(`Not saved: ${error.message}`); return; }
    setBody(""); setPinned(false); setDrill(""); setOpen(false); setMsg("");
    onDone();
  };
  if (!open) return (
    <span className="narraddwrap">
      {/* Doctrine point 2, 12 Aug 2026: a small ghost control on the band
          header, not a full-width row. */}
      <button className="btn small quiet" onClick={() => setOpen(true)}>+ note</button>
      {msg && <span className="note" style={{ marginLeft: 8 }}>{msg}</span>}
    </span>
  );
  return (
    <div className="narradd">
      <label className="cfok">A signed note from {author ?? "(not signed in)"} · {role}</label>
      <textarea className="inp" rows={3} value={body} onChange={(e) => setBody(e.target.value)}
        aria-label="The note, published under your name with today's date"
        placeholder="Your read of this dashboard, in your own words. It publishes under your name with today's date. A correction later is a new note — nothing is edited in place." />
      <div className="goalsumrow">
        <label className="goalen">
          <input type="checkbox" aria-label="Pin this note to the top"
            checked={pinned} onChange={(e) => setPinned(e.target.checked)} /> pinned to the top
        </label>
        <input className="cfoin" aria-label="Optional: the page this note opens when clicked"
          placeholder="optional: page it opens (view key)" value={drill}
          onChange={(e) => setDrill(e.target.value)}
          title="Optional. If set, the published note becomes clickable and opens that page — a wrong key lands on the honest 'no page called this' screen, nothing breaks." />
        <button className="btn primary" onClick={save}>Publish under my name</button>
        <button className="btn" onClick={() => { setOpen(false); setMsg(""); }}>Cancel</button>
        {msg && <span className="note">{msg}</span>}
      </div>
    </div>
  );
}

function DashNarratives({ dept, range, role, session, go }) {
  const pageKey = dept.toLowerCase();
  const [period, setPeriod] = useState(null);
  const [standing, setStanding] = useState(null);
  const [notes, setNotes] = useState(null);
  const [errs, setErrs] = useState([]);
  const [ver, setVer] = useState(0);
  const ranged = Boolean(range?.from && range?.to);
  const mayWrite = role === "owner" || role === "executive";
  const pushErr = (m) => setErrs((p) => (p.includes(m) ? p : [...p, m]));

  useEffect(() => {
    let live = true;
    if (!ranged) { setPeriod([]); return; }
    supabase.rpc("tg_period_narrative", { p_from: range.from, p_to: range.to })
      .then(({ data, error }) => {
        if (!live) return;
        if (error) { pushErr(`The period story could not be computed: ${error.message}`); setPeriod([]); return; }
        setPeriod(rowsOr(data).filter((n) => n.page === pageKey));
      });
    return () => { live = false; };
  }, [pageKey, ranged, range?.from, range?.to]);

  useEffect(() => {
    let live = true;
    supabase.from("v_section_narrative").select("*").eq("page", pageKey)
      .then(({ data, error }) => {
        if (!live) return;
        if (error) { pushErr(`The standing platform story could not be read: ${error.message}`); setStanding([]); return; }
        setStanding(rowsOr(data));
      });
    return () => { live = false; };
  }, [pageKey]);

  useEffect(() => {
    let live = true;
    supabase.from("dashboard_commentary").select("*").eq("page", pageKey).is("retired_at", null)
      .order("pinned", { ascending: false }).order("written_at", { ascending: false })
      .then(({ data, error }) => {
        if (!live) return;
        if (error) { pushErr(`Signed notes could not be read: ${error.message}`); setNotes([]); return; }
        setNotes(rowsOr(data));
      });
    return () => { live = false; };
  }, [pageKey, ver]);

  const retire = async (n) => {
    const who = session?.user?.email;
    if (!who) return;
    const { error } = await supabase.from("dashboard_commentary")
      .update({ retired_at: new Date().toISOString(), retired_by: who }).eq("id", n.id);
    if (error) { pushErr(`Could not retire the note: ${error.message}`); return; }
    setVer((v) => v + 1);
  };

  if (period === null || standing === null || notes === null) return <div className="note">Reading the story of this page…</div>;
  const empty = !errs.length && !period.length && !standing.length && !notes.length;
  if (empty && !mayWrite && ranged) return (
    <div className="brnone">Nothing to tell for this window. <b>Why:</b> no narrative is computed for
      this page over these dates, and nobody has signed a note here yet.</div>
  );
  return (
    <div className="narrband">
      {/* Doctrine point 6: footnotes are chips with popovers, not paragraphs.
          The band header carries the lane state and the small note control. */}
      <div className="narrhead">
        {!ranged && (
          <StatusChip kind="INFO"
            title="The period story describes your window against the one before it and rewrites itself every time the range changes. Pick any date chip above to read it.">
            pick a date range for the period story ⓘ
          </StatusChip>
        )}
        {ranged && period.length === 0 && !errs.length && (
          <StatusChip kind="EMPTY" title={`No period story is computed for this page over ${range.from} to ${range.to}.`}>
            no period story for this window ⓘ
          </StatusChip>
        )}
        {standing.length > 0 && <StatusChip kind="INFO">{standing.length} platform</StatusChip>}
        {notes.length > 0 && <StatusChip kind="INFO">{notes.length} signed</StatusChip>}
        {mayWrite && <AddCeoNote pageKey={pageKey} session={session} role={role} onDone={() => setVer((v) => v + 1)} />}
      </div>
      {errs.map((e) => <div key={e} className="brnone"><b>Not shown, and why:</b> {e}</div>)}
      {period.map((n) => (
        <NarrativeBlock key={"p" + n.section_key} tone={n.tone} drill={n.drill} go={go}
          byline={`Period · computed live for ${range.from} to ${range.to}`}>
          {n.narrative}
        </NarrativeBlock>
      ))}
      {standing.map((n) => (
        <NarrativeBlock key={"s" + n.section_key} tone={n.tone} drill={n.drill} go={go}
          byline="Platform · computed live">
          {n.narrative}
        </NarrativeBlock>
      ))}
      {notes.map((n) => (
        <div key={"n" + n.id} className="narrnotewrap">
          {/* Contract closed by Agent I, 11 Aug 2026: drill is nullable — a note
              MAY drill; null renders as no drill. */}
          <NarrativeBlock tone="info" human drill={n.drill || null} go={go}
            byline={`${n.author}${n.author_role ? " · " + n.author_role : ""} · ${String(n.written_at).slice(0, 10)} · a signed opinion, not a computed figure${n.pinned ? " · pinned" : ""}`}>
            {n.body}
          </NarrativeBlock>
          {mayWrite && (
            <button className="btn small ghost" title="Retire this note — it is kept on the record, never deleted"
              onClick={() => retire(n)}>Retire</button>
          )}
        </div>
      ))}
    </div>
  );
}

/* STOCK BY STREAM CARDS — the owner's frozen keep-list surface ("DO NOT CHANGE
   THIS", 11 Aug 2026). The JSX below was MOVED verbatim from DeptDashboard on
   12 Aug 2026 so the clean-slate Command Center can mount the identical markup
   from one source — extraction only, not an edit: every class, label and figure
   is byte-for-byte what the owner approved. KNOWN AND FILED, not fixed: the
   "Open every package" control toggles its label and renders no drill — a C1
   defect that predates the freeze and sits inside it, so it ships as-is until
   the owner rules. */
export function StockByStreamCards({ stock, openTile, setOpenTile }) {
  return (
    <div className="entgrid">
      {stock.map((s) => (
        /* HARD RULE: failed material is always split into ours and third party
           on the face of the tile. Never make the user drill to find out whose
           failure it was. */
        <div key={s.origin + "|" + s.stream} className="entcard">
          <div className="enthead">
            <span className="entname">{s.stream}</span>
            <span className="entpill">{s.packages} packages</span>
          </div>
          <div className="entorigin">{s.origin}</div>
          {/* Vapes and edibles are counted in units, not weighed. Showing a pound
              figure for them invented a number that meant nothing. */}
          <div className="entbig">
            {s.sold_by_weight === false
              ? <>{Number(s.units ?? 0).toLocaleString()}<em> {s.unit_of_measure || "units"}</em></>
              : <>{Number(s.total_lb ?? 0).toLocaleString()}<em> lb</em></>}
          </div>
          <div className="entrows">
            <div><span>Sellable</span><b className="ok">{Number(s.sellable_lb ?? 0).toLocaleString()}</b></div>
            <div><span>Failed — ours</span><b className={Number(s.failed_ours_lb) > 0 ? "bad" : ""}>{Number(s.failed_ours_lb ?? 0).toLocaleString()}</b></div>
            <div><span>Failed — third party</span><b className={Number(s.failed_third_party_lb) > 0 ? "bad" : ""}>{Number(s.failed_third_party_lb ?? 0).toLocaleString()}</b></div>
            {Number(s.failed_third_party_lb) > 0 && (
              <div className="entwho"><span>Whose it was</span><b>{s.failed_third_party_suppliers}</b></div>
            )}
            <div><span>Out for testing</span><b>{Number(s.out_for_testing_lb ?? 0).toLocaleString()}</b></div>
            <div><span>Untested</span><b className={Number(s.untested_lb) > 0 ? "bad" : ""}>{Number(s.untested_lb ?? 0).toLocaleString()}</b></div>
            <div><span>Oldest</span><b className={Number(s.oldest_days) > 180 ? "warn" : ""}>{s.oldest_days} days</b></div>
          </div>
          <button className="entgo"
            onClick={() => setOpenTile(openTile === s.origin + s.stream ? null : s.origin + s.stream)}>
            🔍 {openTile === s.origin + s.stream ? "Hide" : "Open"} every package
          </button>
        </div>
      ))}
    </div>
  );
}

function DeptDashboard({ viewKey, go, nav, deep, session, reports, role, viewAs, onViewAs, isAdmin, viewRoles }) {
  const [openTile, setOpenTile] = useState(null);
  const dept = DEPT_BY_VIEW[viewKey] ?? "Command";
  /* Per-user collapse memory — owner order 11 Aug 2026. Every section id below
     is registered here so Collapse all / Expand all can reach all of them. */
  const store = useSectionStore(session?.user?.id, viewKey);
  const SEC_IDS = ["global", "narrative", "flow", "money", "audit", "goals", "figures", "rooms", "yield",
    "stock", "admin", "watchdog", "tasks", "pages", "deep", "reports"];
  const [rows, setRows] = useState(null);
  const [trend, setTrend] = useState({});
  const [targets, setTargets] = useState({});
  const [alerts, setAlerts] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [stock, setStock] = useState([]);
  const [computed, setComputed] = useState(null);
  const [ver, setVer] = useState(0);
  const [busy, setBusy] = useState(false);
  const [kpiError, setKpiError] = useState(null);
  /* The selected range, lifted out of the date control so the tiles can be recomputed
     for it. Empty strings mean "all time" and the RPC treats them as null. */
  const [range, setRange] = useState({ from: "", to: "" });
  const onRange = React.useCallback((r) => setRange(r), []);

  const deepItems = (deep ?? []).filter((d) => d.category === dept);
  const deepGroups = Object.entries(
    deepItems.reduce((m, d) => {
      const k = d.subcategory || "Other";
      (m[k] = m[k] || []).push(d);
      return m;
    }, {})
  );

  const load = async () => {
    if (!range.ready) return;
    setBusy(true);
    /* Owner, twice: "dashboards are pulling all data, that is not functional" and
       "DATE RANGE IS NOT WORKING — FIX THIS SITE WIDE". Reports always honoured the
       range; dashboards never did, because each tile was one pre-computed row with no
       date on it.

       f_department_dashboard recomputes the FLOW tiles for the window and returns
       tile_kind / honours_range / range_note so each tile can state its own truth. A
       POSITION ("on hand") is restated from the ledger at the selected end date.
       If the RPC is unavailable the page shows the failure; it never substitutes
       an all-time snapshot beneath the user's selected range. */
    const [k, t, g, a, tk, st] = await Promise.all([
      fetchDepartmentDashboard(supabase, {
        department: dept, from: range.from, to: range.to,
      }),
      supabase.from("v_dashboard_trend").select("*").eq("department", dept),
      supabase.from("kpi_targets").select("*").eq("department", dept),
      supabase.from("v_inventory_alerts").select("*"),
      supabase.from("v_dashboard_tasks").select("*"),
      supabase.from("v_stock_summary").select("*"),
    ]);
    setKpiError(k.error?.message ?? null);
    setRows(k.data ?? []);
    setComputed(k.data?.[0]?.computed_at ?? null);
    setTrend(Object.fromEntries((t.data ?? []).map((r) => [r.kpi, r])));
    setTargets(Object.fromEntries((g.data ?? []).map((r) => [r.kpi, r])));
    setAlerts(a.data ?? []);
    setTasks(tk.data ?? []);
    setStock(st.data ?? []);
    setBusy(false);
  };
  useEffect(() => { load(); }, [dept, ver, range.from, range.to, range.ready]);

  const refreshNow = async () => { setBusy(true); await supabase.rpc("tg_snapshot_dashboards"); setVer((v) => v + 1); };

  const pages = (nav ?? []).filter((n) => n.category === dept && n.subcategory && n.subcategory !== "Dashboard");
  const subs = [...new Set(pages.map((p) => p.subcategory))];
  const fmt = (v, u) => {
    const n = Number(v ?? 0);
    if (u === "$") return "$" + Math.round(n).toLocaleString();
    if (u === "%") return n.toLocaleString() + "%";
    return n.toLocaleString();
  };
  const delta = (kpi) => {
    const t = trend[kpi];
    if (!t || t.previous == null || t.latest == null) return null;
    const d = Number(t.latest) - Number(t.previous);
    if (!d) return { d: 0, txt: "no change since yesterday" };
    return { d, txt: (d > 0 ? "+" : "") + d.toLocaleString() + " since yesterday" };
  };

  if (range.error) return <div className="empty" role="alert">{range.error} No dashboard figures were queried without it.</div>;
  if (!range.ready || !rows) return <div className="empty"><div className="eicon">◐</div>Building the {dept} dashboard…</div>;

  return (
    <>
      {/* HEADER — owner layout doctrine, 12 Aug 2026, point 4: header plus every
          control spends at most ~120px; the role/scope/view chips and the live
          line share ONE slim row; the first data section is visible without
          scrolling on a 1080p display. Point 2: green is the primary-action
          colour and this view spends none of it here — every control below is a
          quiet outline in one compact right-aligned toolbar. */}
      <div className="dashbar slim">
        <div className="dashheadmain">
          <h1 className="dashtitle">{dept}</h1>
          <div className="dashmeta">
            {dept === "Command" && (
              <>
                <span className="hchip">ROLE <b>{viewAs ?? role ?? "reading…"}</b></span>
                <span className="hchip">SCOPE <b>{dept}</b></span>
                <span className="hchip">VIEW <b>{viewKey}</b></span>
                {viewAs && <StatusChip kind="READ ONLY">design preview</StatusChip>}
              </>
            )}
            <span className="dashsub slim">
              Live from the records{computed ? ` · computed ${new Date(computed).toLocaleString()}` : ""} · every tile drills to its records
            </span>
          </div>
        </div>
        <div className="dashacts slim">
          <button className="btn quiet" title="Collapse every section on this dashboard — your choice is remembered on this device"
            onClick={() => store.setAll(SEC_IDS, false)}>− Collapse all</button>
          <button className="btn quiet" title="Expand every section on this dashboard"
            onClick={() => store.setAll(SEC_IDS, true)}>+ Expand all</button>
          {/* VIEW AS — design-preview lens, admin/owner only (f_caller_is_admin).
              Rendering only: menus and pages draw with the chosen role's
              visibility rows, while data access stays the signed-in admin's own.
              Token-styled (doctrine point 3): a raw white browser dropdown does
              not belong inside the theme. */}
          {dept === "Command" && isAdmin && (
            <select className="viewsel" aria-label="View this platform as another role — presentation preview only"
              value={viewAs ?? ""} onChange={(e) => onViewAs(e.target.value || null)}>
              <option value="">View as…</option>
              {rowsOr(viewRoles).map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          )}
          {/* The date range belongs HERE, in the header row, compact — owner ruling
              8 Aug 2026. It used to render as a full-width strip below the header. */}
          <RpDashboardDateRange viewKey={viewKey} session={session} onRange={onRange} />
          <button className="btn quiet" onClick={refreshNow} disabled={busy}>{busy ? "Refreshing…" : "↻ Recompute"}</button>
          <button className="btn quiet" onClick={() => window.print()}>🖨 Print</button>
          <button className="btn quiet" onClick={() => go("dashboard_tasks")}>☑ Tasks</button>
          <button className="btn quiet" onClick={() => go("inventory_alerts")}>⚠ Alerts</button>
          {/* Owner 11 Aug 2026: "ADD A TAB THAT EVEN BRINGS USER TO CFO DASHBOARD ...
              ADD TO THE RIGHT OF SCREEN". Sits last in the header actions, so it is
              the right-most control on the row. */}
          {/* Was green-on-green and illegible — doctrine point 2: quiet outline. */}
          {dept === "Command" && (
            <button className="btn quiet" onClick={() => go("dept_dash_cfo")}
              title="Value of stock, the money position, and the full inventory forensic audit">
              CFO Dashboard →
            </button>
          )}
        </div>
      </div>

      <WhatChanged dept={dept} go={go} />

      {kpiError && (
        <div className="empty" role="alert">
          The date-ranged key figures are unavailable: {kpiError}. No all-time
          figures were substituted under the selected dates.
        </div>
      )}

      {/* The Command-only bands (global management, goals+yield pair, room
          rings, reports shelf, diagnostic footer) were RETIRED from this
          component on 12 Aug 2026: the owner ordered the Command Center rebuilt
          clean-slate, and it now renders from commandcenter.jsx — this
          component never receives dept === "Command" again. Nothing another
          department renders was touched. */}

      {/* NARRATIVE COMMENTARY — owner-approved 11 Aug 2026: the period story
          (rewrites with the date bar), the standing platform story, and signed
          notes. Byline discipline is the whole design. */}
      <Section id="narrative" store={store} title="In plain words — the period, the platform, and signed notes">
        <DashNarratives dept={dept} range={range} role={role} session={session} go={go} />
      </Section>

      {(dept === "Command" || dept === "Cultivation" || dept === "Inventory") && (
        <>
          <Section id="flow" store={store} title="Seed to sale — where everything is right now"><FlowStrip go={go} /></Section>
          <Section id="money" store={store} title="Where the money is standing"><MoneyBar go={go} /></Section>
        </>
      )}

      {/* CFO · Inventory Forensic Audit — its own section, Command only.
          Owner 11 Aug 2026: keep it away from the other sections and out of the
          tile grid. Nothing above or below is altered; this is purely additive. */}
      {(dept === "Command" || viewKey === "dept_dash_cfo") && (
        <Section id="audit" store={store} title="FINANCE &amp; TAX · Inventory Forensic Audit — every pound, seed to sale">
          <ForensicAuditLedger go={go} />
        </Section>
      )}

      {dept === "Cultivation" && (
        <Section id="goals" store={store} title="Goals and targets — set by you, not by the code">
          <GoalsEditor />
        </Section>
      )}

      <Section id="figures" store={store} title={`${dept} key figures`} count={rows.length}>
        <div className="ddgrid">
          {rows.map((r) => {
            const tr = trend[r.kpi];
            const tg = targets[r.kpi];
            const dl = delta(r.kpi);
            const offTarget = tg && tg.target != null &&
              (tg.direction === "at_most" ? Number(r.value) > Number(tg.target) : Number(r.value) < Number(tg.target));
            return (
              <div key={r.kpi + r.ord} className={`ddtile ${offTarget ? "bad" : r.tone}`}>
                <button className="ddmain" onClick={() => r.drill && go(r.drill)} title="Open the records behind this">
                  <span className="ddkpi">{r.kpi}</span>
                  <span className="ddval">{fmt(r.value, r.unit)}
                    <em>{r.unit !== "$" && r.unit !== "%" ? " " + r.unit : ""}</em></span>
                  {tg && tg.target != null && (
                    <span className={`ddtarget ${offTarget ? "off" : "on"}`}>
                      Target {tg.direction === "at_most" ? "no more than" : "at least"} {Number(tg.target).toLocaleString()}
                      {offTarget ? " — OVER" : " — within"}
                    </span>
                  )}
                  {r.context && <span className="ddctx">{r.context}</span>}
                  {/* The database returns the basis for this exact row. Never
                      replace it with one hardcoded all-time sentence. */}
                  <span className="ddctx">
                    {r.honours_range === false
                      ? (r.range_note || "This figure does not honour the selected range.")
                      : (r.range_note || "Computed for the selected range.")}
                  </span>
                  {/* Both read the SAME verdict, so they can never disagree again. */}
                  <Spark series={tr?.series} direction={tg?.direction} />
                  {dl && (
                    <span className={`dddelta ${DELTA_CLASS[movementVerdict(
                      dl.d === 0 ? null : dl.d > 0, tg?.direction)]}`}>{dl.txt}</span>
                  )}
                  {r.drill && <span className="ddgo">🔍 Open the records</span>}
                </button>
                <AssignTask dept={dept} kpi={r.kpi} value={r.value} unit={r.unit} drill={r.drill} onDone={() => setVer((v) => v + 1)} />
              </div>
            );
          })}
        </div>
      </Section>

      {/* STOCK BY STREAM — FROZEN by the owner, 11 Aug 2026: "DO NOT CHANGE THIS."
          The collapse control on the header is his own later amendment (chrome
          only); the cards inside are pixel-untouched, extracted verbatim into
          StockByStreamCards so the clean-slate Command Center mounts the SAME
          markup from the same source (owner keep-list, 12 Aug 2026). */}
      {stock.length > 0 && (
        <Section id="stock" store={store} title="Stock by stream" count={stock.length}>
          <StockByStreamCards stock={stock} openTile={openTile} setOpenTile={setOpenTile} />
        </Section>
      )}

      {dept === "Settings" && (
        <Section id="admin" store={store} title="Needs an administrator — will not clear until resolved" defaultOpen>
          <AdminAlerts go={go} />
        </Section>
      )}

      <Section id="watchdog" store={store} title="What the watchdog is flagging" count={alerts.length} defaultOpen={alerts.length > 0}>
        {alerts.length === 0 ? (
          <div className="feednone">Nothing open. The watchdog sweeps twice a day and clears alerts by itself when the problem is gone.</div>
        ) : (
          <div className="feed compact">
            {alerts.map((a, i) => (
              <button key={i} className={`feedrow ${a.severity}`} onClick={() => a.drill && go(a.drill)}>
                <span className="fsev">{a.severity}</span>
                <span className="fmain">
                  <b>{a.headline}</b>
                  <em>{a.detail}</em>
                  <i>{a.what_to_do}</i>
                </span>
                <span className="fnum">
                  {a.dollars ? "$" + Number(a.dollars).toLocaleString() : a.pounds ? Number(a.pounds).toLocaleString() + " lb" : ""}
                  {/* Finding history began on the first sweep, so "days open" is 0 for
                      everything and says nothing. Show the age of the material, which is
                      the number that actually matters. */}
                  <em title={a.history_note || ""}>
                    {a.material_oldest_days ? `oldest ${a.material_oldest_days} days`
                      : a.days_open ? `${a.days_open} days open` : "age not recorded"}
                  </em>
                </span>
              </button>
            ))}
          </div>
        )}
      </Section>

      <Section id="tasks" store={store} title="Tasks raised from dashboards" count={tasks.length} defaultOpen={tasks.length > 0}>
        {tasks.length === 0 ? (
          <div className="feednone">No tasks raised yet. Use ＋ Assign on any tile above.</div>
        ) : (
          <div className="feed compact">
            {tasks.map((t) => (
              <button key={t.id} className={`feedrow ${t.position?.startsWith("OVERDUE") ? "critical" : "watch"}`}
                onClick={() => go("dashboard_tasks")}>
                <span className="fsev">{t.priority}</span>
                <span className="fmain">
                  <b>{t.title}</b>
                  <em>{t.assigned_to ? "Assigned to " + t.assigned_to : "Unassigned"} · raised from {t.raised_from}</em>
                  <i>{t.position}</i>
                </span>
                <span className="fnum">{t.source_value != null ? Number(t.source_value).toLocaleString() + " " + (t.source_unit ?? "") : ""}</span>
              </button>
            ))}
          </div>
        )}
      </Section>

      {subs.length > 0 && (
        <Section id="pages" store={store} title={`Everything in ${dept}`} count={pages.length} defaultOpen={false}>
          <div className="ddseccols">
            {subs.map((sub) => (
              <div className="ddsec" key={sub}>
                <div className="ddseclabel">{sub}</div>
                {pages.filter((p) => p.subcategory === sub).map((p) => (
                  <button key={p.view_key} className="ddlink" onClick={() => go(p.view_key)} title={p.description || p.label}>
                    {p.label}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </Section>
      )}
      {/* TEMPORARY. These are not built out yet — they still render as plain tables.
          Each gets a proper screen and comes off this list. Kept at the bottom, collapsed,
          so it never competes with the dashboard itself. */}
      {deepItems.length > 0 && (
        <Section id="deep" store={store} title={`Still to be built out in ${dept} — temporary list`} count={deepItems.length}>
          <p className="buildnote">
            These {deepItems.length} pages still render as plain tables rather than built-out
            screens. They are listed only so nothing is lost while they are worked through. Each
            one comes off this list as it is built properly.
          </p>
          <div className="deepwrap">
            {deepGroups.map(([sub, items]) => (
              <div key={sub} className="deepgrp">
                <label>{sub}</label>
                <div className="deeplinks">
                  {items.map((it) => (
                    <button key={it.view_key} className="deeplink" title={it.description || ""}
                      onClick={() => go(it.view_key)}>{it.label}</button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

    </>
  );
}

/* THE CHIP NO LONGER CALLS THE COMPUTER. IT CANNOT.

   Yesterday this fetched http://127.0.0.1:8765/health directly, on the correct
   reasoning that 127.0.0.1 is a potentially-trustworthy origin and exempt from
   mixed-content blocking. That reasoning is still true and it is no longer
   sufficient.

   Chrome 151 treats a public https page reaching a LOCAL address as a user
   PERMISSION - `local-network-access`, alongside camera and microphone. On the
   owner's machine it reads DENIED, and once denied Chrome will not re-prompt.
   Proved in his own browser on 7 Aug 2026: a fetch with `mode:'no-cors'`, which
   bypasses CORS entirely, still threw `TypeError: Failed to fetch`, and the
   bridge's own log showed NOTHING arrived. The request never left the browser.

   So the chip read "AI offline" for hours while the bridge answered a question
   in nine seconds from a terminal on the same machine. Two tools, same port,
   same request, opposite answers, and nothing in the failure said which.

   The bridge now reports in every 30 seconds through the bridge-queue function,
   and this reads that row. A row cannot be blocked by a browser permission.

   ⚠ IT SAYS "REPORTED IN", NOT "REACHABLE FROM HERE". That is the honest claim,
   and it is also now the one that matters: the browser does not need to reach
   the bridge any more. Questions go into ai_bridge_jobs and the desktop comes
   and gets them. */
const BRIDGE_STALE_SECONDS = 90;

function BridgeChip() {
  const [st, setSt] = useState({ state: "checking" });
  const [open, setOpen] = useState(false);

  const check = async () => {
    const { data, error } = await supabase
      .from("v_bridge_status")
      .select("machine, online, seconds_since, verdict, waiting, in_progress")
      .order("last_seen", { ascending: false })
      .limit(1);
    if (error) {
      /* A3: a failed lookup is not the same as a stopped bridge, and must not
         be dressed up as one. */
      setSt({ state: "unknown", err: String(error.message).slice(0, 120) });
      return;
    }
    const row = data?.[0];
    if (!row) { setSt({ state: "never" }); return; }
    setSt({
      state: row.online ? "up" : "down",
      machine: row.machine,
      ago: row.seconds_since,
      verdict: row.verdict,
      waiting: row.waiting,
      busy: row.in_progress,
    });
  };

  useEffect(() => {
    check();
    const t = setInterval(check, 25000);
    return () => clearInterval(t);
  }, []);

  /* The desktop registers tgbridge:// so this starts it without a terminal. It
     is the one thing here that still touches the local machine, and it is a
     navigation rather than a fetch - a different mechanism, not covered by the
     local-network permission. If it does nothing, the shortcut is the fallback. */
  const start = () => {
    window.location.href = "tgbridge://start";
    setTimeout(check, 6000);
    setTimeout(check, 14000);
  };

  const label =
    st.state === "up" ? "AI ready"
    : st.state === "checking" ? "Checking…"
    : st.state === "unknown" ? "AI status unknown"
    : "AI offline";

  return (
    <div className="bchipwrap">
      <button className={`bchip ${st.state}`} onClick={() => setOpen((v) => !v)}
        title={st.verdict ?? "Whether a desktop bridge has reported in"}>
        <span className="bdot" />
        {label}
      </button>
      {open && (
        <div className={`bpop ${st.state === "up" ? "" : "warn"}`} onMouseLeave={() => setOpen(false)}>
          {st.state === "up" ? (
            <>
              <b>Answering on {st.machine}</b>
              <p>Questions you type are researched by Claude on that computer, reading the live records. It costs nothing beyond the subscription you already pay for.</p>
              {st.busy > 0 && <p>Working on {st.busy} question{st.busy === 1 ? "" : "s"} right now.</p>}
              {st.waiting > 0 && <p>{st.waiting} waiting to be picked up.</p>}
              <button className="btn" onClick={check}>Re-check</button>
            </>
          ) : st.state === "unknown" ? (
            <>
              <b>Cannot tell</b>
              <p>The bridge may be running perfectly — this is a problem reading its status, not a report that it has stopped. {st.err}</p>
              <button className="btn" onClick={check}>Try again</button>
            </>
          ) : st.state === "never" ? (
            <>
              <b>No bridge has ever reported in</b>
              <p>Nothing has been set up on any computer yet. See bridge/SETUP.md in the repository.</p>
              <button className="btn" onClick={check}>Re-check</button>
            </>
          ) : (
            <>
              <b>{st.verdict ?? "The bridge is not reporting in"}</b>
              <p>
                The assistant still answers from the database, and every report, dashboard and
                suggestion still works. What stops is the free-form research.
              </p>
              <p>Start it with the <b>TG OS AI Bridge</b> shortcut on that computer, or click below.</p>
              {st.waiting > 0 && <p>{st.waiting} question{st.waiting === 1 ? "" : "s"} waiting — they will be answered as soon as it starts.</p>}
              <button className="btn primary" onClick={start}>Start it now</button>
              <button className="btn" onClick={check}>Re-check</button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function WelcomeBridge({ onDone }) {
  const [ok, setOk] = useState(null);
  const [step, setStep] = useState(0);
  /* Same reason as BridgeChip: Chrome 151 blocks a public https page from
     reaching a local address behind the `local-network-access` permission, so a
     fetch to 127.0.0.1 here would tell someone setting the bridge up for the
     first time that it had failed when it had not — the worst possible moment
     to be wrong. Read the heartbeat it writes instead; that is the thing the
     platform actually depends on. */
  const check = async () => {
    setOk("checking");
    const { data, error } = await supabase
      .from("v_bridge_status")
      .select("online")
      .order("last_seen", { ascending: false })
      .limit(1);
    if (error) { setOk("unknown"); return; }
    setOk(data?.[0]?.online ? "up" : "down");
  };
  useEffect(() => { check(); }, []);
  const STEPS = [
    {
      t: "Install two things",
      b: "Node.js from nodejs.org — press the big LTS button and accept the defaults. Then open a terminal and run the command below. Both are free.",
      code: "npm install -g @anthropic-ai/claude-code",
    },
    {
      t: "Sign in to Claude once",
      b: "In the same terminal, type claude and press Enter. Then type /login and sign in with your Claude account in the browser window that opens. You only ever do this once on this computer.",
      code: "claude",
    },
    {
      t: "Start the bridge",
      b: "Ask Vinny for the bridge folder, put it somewhere sensible, and double-click start-bridge.cmd inside it. A small window opens — leave it running, minimise it if it is in the way. It will start on its own next time you turn the computer on.",
      code: null,
    },
    {
      t: "Ask a question",
      b: "Go to Budz Assistant and ask anything about the company. Answers marked 'Researched by Claude on your desktop' are coming through the bridge, reading the live Metrc data as they answer.",
      code: null,
    },
  ];
  const s = STEPS[step];
  return (
    <div className="pwgate">
      <div className="pwcard wide">
        <h1>Welcome to the Twisted Growers OS</h1>
        <p className="sub">
          Everything on the platform works right now with no setup at all — every report, every dashboard, and the
          assistant&rsquo;s built-in answers. This page is only about the <b>extra</b> bit: chatting with Claude inside the
          OS about your own live data.
        </p>

        <div className={`bridgestat ${ok}`}>
          {ok === "checking" && "Looking for the bridge on this computer…"}
          {ok === "up" && "The bridge is already running on this computer. You are done — skip this and start asking questions."}
          {ok === "down" && "No bridge on this computer yet. It takes about five minutes to set up, and costs nothing beyond a Claude subscription you already pay for."}
        </div>

        {ok !== "up" && (
          <>
            <div className="wsteps">
              {STEPS.map((x, i) => (
                <button key={x.t} className={`wstep ${i === step ? "on" : ""} ${i < step ? "done" : ""}`} onClick={() => setStep(i)}>
                  {i + 1}
                </button>
              ))}
            </div>
            <div className="wbody">
              <h2>{s.t}</h2>
              <p>{s.b}</p>
              {s.code && (
                <div className="wcode">
                  <code>{s.code}</code>
                  <button className="btn" onClick={() => navigator.clipboard?.writeText(s.code)}>Copy</button>
                </div>
              )}
            </div>
            <div className="wnav">
              <button className="btn" disabled={step === 0} onClick={() => setStep((v) => v - 1)}>Back</button>
              {step < STEPS.length - 1 ? (
                <button className="btn primary" onClick={() => setStep((v) => v + 1)}>Next</button>
              ) : (
                <button className="btn primary" onClick={check}>Check for the bridge</button>
              )}
            </div>
            <div className="wtell">
              <h2>What to tell your Claude or ChatGPT</h2>
              <p>
                If you get stuck on any of the steps above, open Claude or ChatGPT and paste this. It explains the whole
                job so it can walk you through it on your own machine.
              </p>
              <textarea className="inp" readOnly rows={7} value={TELL_YOUR_AI} onFocus={(e) => e.target.select()} />
              <button className="btn" onClick={() => navigator.clipboard?.writeText(TELL_YOUR_AI)}>
                Copy this message
              </button>
            </div>
            <p className="sub" style={{ marginTop: 14 }}>
              No subscription? That is fine. You still get every report and every built-in answer. You can also use the
              Send to Claude, ChatGPT and Grok buttons on the assistant page, which copy your question with a full
              briefing and open the service.
            </p>
          </>
        )}

        <button className="btn primary" style={{ marginTop: 18 }} onClick={onDone}>
          {ok === "up" ? "Start using the platform" : "Skip for now — I will set this up later"}
        </button>
      </div>
    </div>
  );
}

function ForcePasswordChange({ email, onDone }) {
  const [p1, setP1] = useState("");
  const [p2, setP2] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (p1.length < 8) return setMsg("Your new password needs to be at least eight characters.");
    if (p1 !== p2) return setMsg("The two passwords do not match.");
    if (p1 === "12345") return setMsg("Please choose something other than the temporary password.");
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: p1 });
    if (error) { setMsg(error.message); setBusy(false); return; }
    const { data: auth } = await supabase.auth.getUser();
    await supabase.from("app_users")
      .update({ must_change_password: false, password_changed_at: new Date().toISOString() })
      .eq("user_id", auth?.user?.id);
    setBusy(false);
    onDone();
  };
  return (
    <div className="pwgate">
      <div className="pwcard">
        <h1>Choose your password</h1>
        <p className="sub">
          You are signed in with a temporary password. Please set your own before continuing — nobody else should know it,
          including whoever set up your account.
        </p>
        <div className="pwmail">{email}</div>
        <label>New password</label>
        <input className="inp" type="password" value={p1} autoFocus
          onChange={(e) => setP1(e.target.value)} placeholder="At least eight characters" />
        <label>Type it again</label>
        <input className="inp" type="password" value={p2}
          onChange={(e) => setP2(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && save()} />
        {msg && <div className="pwmsg">{msg}</div>}
        <button className="btn primary" disabled={busy} onClick={save}>
          {busy ? "Saving…" : "Save and continue"}
        </button>
        <button className="pwout" onClick={() => signOutEverywhere()}>Sign out instead</button>
      </div>
    </div>
  );
}

/* SIGNING OUT ENDS THE ASSISTANT'S SESSION GRANTS TOO. Owner, 8 Aug 2026: a
   camera approval "remains full time" for the session with "no shutoff" - which
   only means anything if the session actually ENDS somewhere. This is that
   somewhere, and until now nothing called f_ai_end_session at all: the grant was
   written to last a session and nothing was ever going to close it.

   The revoke is tried FIRST and its failure is swallowed. Sign-out must happen
   whatever else breaks - a person trying to leave a shared machine is not made
   to wait on a permissions table. */
async function signOutEverywhere() {
  try { await supabase.rpc("f_ai_end_session"); } catch { /* never block sign-out */ }
  await supabase.auth.signOut();
}

export default function App() {
  const { session, mustChange, setMustChange, showWelcome, setShowWelcome } = useSession();
  /* Pet mode. Held at APP level, never inside a screen, so Budz survives
     navigation and floats over every page instead of remounting - and
     losing his position - each time the view changes. */
  const [petOn, setPetOn] = useBudzPet();
  const [aiRoles, setAiRoles] = useState(null);
  /* Who is allowed an assistant at all. One row, read once. Null until it
     answers, so the pet never flashes up for a role that may not have it. */
  useEffect(() => {
    if (!session) { setAiRoles(null); return; }
    supabase.from("ai_settings").select("ai_allowed_roles").limit(1).maybeSingle()
      .then(({ data }) => setAiRoles(data?.ai_allowed_roles ?? []));
  }, [session]);
  const prefs = usePrefs(session ?? null);
  const [preferenceError, setPreferenceError] = useState(null);
  useEffect(() => {
    const show = (event) => setPreferenceError(event.detail ?? { area: "Preference", message: "The account save failed." });
    window.addEventListener("tg-preference-error", show);
    return () => window.removeEventListener("tg-preference-error", show);
  }, []);
  const [navVersion, setNavVersion] = useState(0);
  /* VIEW AS A ROLE — owner request 11 Aug 2026, admin-only design-preview lens.
     Rendering only: it swaps which nav_role_visibility rows filter the surfaces.
     It never mints a session, never changes auth, never alters row-level
     security — data stays the signed-in admin's own, and the banner says so.
     Every activation and exit is written to audit_events BEFORE it takes effect;
     if the log write fails, the preview does not start. Silent impersonation is
     how trust dies. */
  const [viewAsRole, setViewAsRole] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [viewRoles, setViewRoles] = useState([]);
  const [viewAsMsg, setViewAsMsg] = useState(null);
  useEffect(() => {
    if (!session) { setIsAdmin(false); setViewRoles([]); return; }
    supabase.rpc("f_caller_is_admin").then(({ data, error }) => setIsAdmin(!error && data === true));
  }, [session]);
  useEffect(() => {
    if (!isAdmin) return;
    /* The role list is the set of roles the visibility table actually knows —
       the rows that drive rendering. roles_catalog was named in the order but it
       is the Human Resources wage-role register, a different vocabulary; the
       mismatch is flagged in the delivery report rather than silently obeyed. */
    supabase.from("nav_role_visibility").select("role").then(({ data, error }) => {
      if (error) { setViewAsMsg(`Could not read the role list: ${error.message}`); return; }
      setViewRoles([...new Set(rowsOr(data).map((r) => r.role))].sort());
    });
  }, [isAdmin]);
  const switchViewAs = async (target) => {
    if (!session) return;
    const me = session.user.email ?? session.user.id;
    const { error } = await supabase.from("audit_events").insert({
      actor: session.user.id, actor_name: me, entity: "view_as_role",
      entity_id: target ?? viewAsRole ?? "", action: target ? "started" : "ended",
      old_value: viewAsRole, new_value: target,
      reason: "design preview from the Command Center — rendering lens only, no data access change",
    });
    if (error) { setViewAsMsg(`Preview not started — the audit log refused the entry: ${error.message}`); return; }
    setViewAsMsg(null);
    setViewAsRole(target);
  };
  const { nav, reports, apps, deep, finance, tax, hr, navError } = useNav(navVersion, session, viewAsRole);
  const [repMenu, setRepMenu] = useState(false);
  const { role, roleError } = useRole(session ?? null);
  /* Page gate from EXISTING page_permissions rows (no invented auth path): a row
     with can_view=false for the effective role blocks the page body and says so.
     Real enforcement stays server-side in row-level security — this is the
     honest door sign, and in preview mode it uses the previewed role so an admin
     can see exactly what that role would be told. */
  const [blockedViews, setBlockedViews] = useState(null);
  useEffect(() => {
    if (!session) { setBlockedViews(null); return; }
    const effRole = viewAsRole ?? role;
    if (!effRole) return;
    supabase.from("page_permissions").select("view_key, can_view").eq("role", effRole).eq("can_view", false)
      .then(({ data, error }) => {
        if (error) { setBlockedViews(new Map([["__error", error.message]])); return; }
        setBlockedViews(new Map(rowsOr(data).map((r) => [r.view_key, true])));
      });
  }, [session, role, viewAsRole]);
  const [view, setView] = useState(() => window.location.hash.slice(1) || "tower");
  useEffect(() => {
    if (window.location.hash.slice(1) !== view) window.history.pushState(null, "", `#${view}`);
  }, [view]);
  /* popstate covers Back and Forward. It does NOT fire when the hash is edited
     in the address bar, or when a link to #something on this same page is
     followed — that is hashchange, and without it the URL changed while the
     screen did not. Both are listened for; setView already ignores a no-op. */
  useEffect(() => {
    const onNav = () => setView(window.location.hash.slice(1) || "tower");
    window.addEventListener("popstate", onNav);
    window.addEventListener("hashchange", onNav);
    return () => {
      window.removeEventListener("popstate", onNav);
      window.removeEventListener("hashchange", onNav);
    };
  }, []);
  const [openCats, setOpenCats] = useState(() => {
    try { return JSON.parse(localStorage.getItem("tg.nav.open") || "{}"); } catch { return {}; }
  });
  useEffect(() => { try { localStorage.setItem("tg.nav.open", JSON.stringify(openCats)); } catch {} }, [openCats]);
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
  if (mustChange) return <ForcePasswordChange email={session.user?.email} onDone={() => { setMustChange(false); setShowWelcome(true); }} />;
  if (showWelcome) return <WelcomeBridge onDone={() => setShowWelcome(false)} />;

  const isExec = role === "owner" || role === "executive";
  const entries = (nav ?? []).filter((e) => !e.admin_only || isExec);
  /* Every surface is routable, not just the side rail. `entries` still drives the
     rail and must stay side-only, but a dashboard tile, a drill-down or a search
     result may point at a Reports, Finance, Tax, HR, launcher or deep page. Those
     resolved to nothing before, so 14 of 43 dashboard tiles silently did nothing
     when clicked - breaking rule C1, every tile must open to the items behind it. */
  const routable = [...(nav ?? []), ...(deep ?? []), ...(reports ?? []), ...(finance ?? []),
                    ...(tax ?? []), ...(hr ?? []), ...(apps ?? [])]
                   .filter((e) => !e.admin_only || isExec);
  const cats = [];
  for (const e of entries) {
    let c = cats.find((x) => x.name === e.category);
    if (!c) { c = { name: e.category, items: [] }; cats.push(c); }
    c.items.push(e);
  }
  const current = routable.find((e) => e.view_key === view);
  const email = session.user.email ?? "";
  const isOpen = (name) => openCats[name] !== false;

  const special = {
    v_metrc_scan_settings: <MetrcScanSchedule />,
    metrc_report_imports: <MetrcReportImports session={session} />,
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
    people: <People session={session} />,
    dept_dash_hr: <HrDashboard go={setView} session={session} />,
    employee_file: <EmployeeFile go={setView} session={session} />,
    schedule_builder: <ScheduleBuilder go={setView} session={session} />,
    timesheets: <Timesheets go={setView} session={session} />,
    hr_review_queue: <HrQueue go={setView} session={session} />,
    terminals: <Terminals go={setView} session={session} />,
    my_week: <MyWeek go={setView} session={session} />,
    doc_reader: <DocReader go={setView} session={session} />,
    onboard: <Onboard go={setView} session={session} />,
    my_callout: <StaffForms mode="callout" go={setView} />,
    my_timeoff: <StaffForms mode="timeoff" go={setView} />,
    my_incident: <StaffForms mode="incident" go={setView} />,
    pay_runs: <PayRuns go={setView} session={session} />,
    my_availability: <MySchedule mode="availability" go={setView} />,
    my_swap: <MySchedule mode="swap" go={setView} />,
    integrations: <Integrations session={session} />,
    /* A credential vault is not a report. Routed through the report archetype this page
       inherited a search box, an export row and a date range defaulted to THIS MONTH, so a
       key set in July read as not set — on the one screen where that conclusion makes
       somebody paste a second credential. Owner, 12 Aug 2026, looking at it: "you need to
       add way for me to add key and secrets here right now i cant". Its own layout, shared
       primitives only. `hold_the_ddc_discipline`. */
    app_secrets: <KeysConnections session={session} />,
    /* MY DASHBOARD — the rearrangeable canvas. Owner, 12 Aug 2026: "SIMILAR TO TRADING
       PLATFORM i CAN MOVE AND RESIZE EACH AS I WANT" and, looking at the fixed Command
       Center, "its totally out of order from what i want to se". Nobody can guess the
       order he wants — Finance at year end, Cultivation in season — so he arranges it
       himself. `go` is passed so a widget can open the full records page behind it. */
    my_dashboard: <WidgetCanvas go={setView} heading="My dashboard" />,
    /* TG WORKSPACE — owner, 12 Aug 2026: "build workspace as our own clone as similar
       copy to clickup", and earlier "must connect and wire to our version of clickup
       too we call ours TG workspace". Spaces → lists → tasks → subtasks, on our own
       tables. Its own file and its own layout: a workspace is not a report and not a
       dashboard, and sharing a layout is what put 522 pages behind one screen.
       `go` opens the read-only ClickUp mirror, which is labelled as the mirror, and
       it is `setView` — the identifier every other entry in this map passes. The
       line above passes a bare `go`, which is not defined in this scope; that is
       reported to Agent I rather than changed here, because App.jsx is locked to
       one import and one entry for this build. */
    tg_workspace: <TgWorkspace session={session} go={setView} />,
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
    grow_rooms: <GrowRooms session={session} />,
    business_rules: <BusinessRules session={session} />,
    overhead_inputs: <OverheadInputs session={session} />,
    sheet_sync: <SheetSync session={session} />,
    harvest_labor: <HarvestLaborCalculator session={session} />,
    production_calculator: <ProductionCalculator session={session} />,
    valuation_rates: <ValuationRates session={session} />,
    intelligence_briefing: <IntelligenceBriefing go={setView} />,
    budz: <BudzScreen go={setView} />,
    /* Owner ruling 11 Aug 2026: the goals editor moved off the Command dashboard
       onto its own page. Routed here plus a nav_registry row — menu structure by
       registry row, which the owner's freeze explicitly permits. */
    goals_targets: <GoalsTargetsPage />,
    ...Object.fromEntries(Object.keys(DEPT_BY_VIEW).map((k) => [k,
      <DeptDashboard viewKey={k} go={setView} nav={nav} deep={deep} session={session}
        reports={reports} role={role} viewAs={viewAsRole} onViewAs={switchViewAs}
        isAdmin={isAdmin} viewRoles={viewRoles} />])),
    /* CLEAN-SLATE COMMAND CENTER — owner pivot, 12 Aug 2026. This override sits
       AFTER the spread on purpose: dept_dash_command routes to the new tree and
       the old DeptDashboard rendering for Command is retired from the path. */
    dept_dash_command: <CommandCenter go={setView} session={session} reports={reports}
      role={role} viewAs={viewAsRole} onViewAs={switchViewAs}
      isAdmin={isAdmin} viewRoles={viewRoles} />,
    /* THE DEPARTMENT DASHBOARDS, built on the same certified template through
       dashkit. Owner order 12 Aug 2026: "build out all dashboards first for
       every single category… each and every single dashboard must be built so
       the manager of that department can fully manage and see every single
       detail, as we are doing for command." Like the Command Center above,
       each override sits AFTER the spread so the generic DeptDashboard is
       retired from that department's path rather than left as a second
       rendering of the same page. */
    dept_dash_cultivation: <CultivationDashboard go={setView} session={session} reports={reports}
      role={role} viewAs={viewAsRole} onViewAs={switchViewAs}
      isAdmin={isAdmin} viewRoles={viewRoles} />,
    dept_dash_inventory: <InventoryDashboard go={setView} session={session} reports={reports}
      role={role} viewAs={viewAsRole} onViewAs={switchViewAs}
      isAdmin={isAdmin} viewRoles={viewRoles} />,
    /* SCHEDULE ADHERENCE. Cultivation's page for the one rule that is deliberately
       asymmetric — a pull may come down early, never late. Same prop contract as
       the two dashboards above; the page reads its own views and computes no
       business figure. It needs a nav_registry row to appear on the rail; until
       that row exists the address #schedule_adherence reaches it. */
    schedule_adherence: <ScheduleAdherenceDashboard go={setView} session={session} reports={reports}
      role={role} viewAs={viewAsRole} onViewAs={switchViewAs}
      isAdmin={isAdmin} viewRoles={viewRoles} />,
    /* PLANT CENSUS. Cultivation's proof of what is standing and which of Metrc's
       two paths says so, with the per-room balance against Metrc's own dated
       report. Needs a nav_registry row to reach the rail; until then the address
       #plant_census reaches it. */
    plant_census: <PlantCensusDashboard go={setView} session={session} reports={reports}
      role={role} viewAs={viewAsRole} onViewAs={switchViewAs}
      isAdmin={isAdmin} viewRoles={viewRoles} />,
    /* The wall terminal, reached from its own Human Resources menu entry and from
       the button on Terminals & Credentials. It takes no session on purpose — a
       shared screen must never hold one — and it chooses which registered terminal
       it is for itself, because nothing in this shell knows which tablet this is. */
    kiosk: <Kiosk />,
    /* THE FOUR FINANCE MONEY SURFACES. Same prop contract as the department
       dashboards above, and each one its OWN layout: a ledger, a directory, a
       document room and an order book. They share dashkit's primitives and
       fin-kit's money, quantity and basis cells, and share no page shape with
       each other — 522 pages behind one screen is the cause of the bugs here,
       never the cure. These four keys already exist and are enabled in
       nav_registry, so mounting them changes no menu, no order and no wording. */
    sales_history: <SalesHistoryPage go={setView} session={session} reports={reports}
      role={role} viewAs={viewAsRole} onViewAs={switchViewAs}
      isAdmin={isAdmin} viewRoles={viewRoles} />,
    customers: <CustomersPage go={setView} session={session} reports={reports}
      role={role} viewAs={viewAsRole} onViewAs={switchViewAs}
      isAdmin={isAdmin} viewRoles={viewRoles} />,
    customer_manifests: <CustomerManifestsPage go={setView} session={session} reports={reports}
      role={role} viewAs={viewAsRole} onViewAs={switchViewAs}
      isAdmin={isAdmin} viewRoles={viewRoles} />,
    orders: <OrdersPage go={setView} session={session} reports={reports}
      role={role} viewAs={viewAsRole} onViewAs={switchViewAs}
      isAdmin={isAdmin} viewRoles={viewRoles} />,
    cfo_inventory_audit: <CfoInventoryAudit go={setView} session={session} />,
    assistant_settings: <AssistantSettings />,
    inventory_locator: <InventoryLocator go={setView} />,
    /* THE NINE CULTIVATION REGISTERS. Each view key below already carried an
       enabled navigation row pointing at a real view, and each rendered through
       the generic data browser until now. Grow Rooms is deliberately NOT in this
       list: it already has its own page above and was not asked to change. */
    harvests: <HarvestsRegister go={setView} session={session} role={role} viewAs={viewAsRole} reports={reports} />,
    harvest_lifecycle: <HarvestLifecycle go={setView} session={session} role={role} viewAs={viewAsRole} reports={reports} />,
    harvest_detail: <HarvestDetailPlan go={setView} session={session} role={role} viewAs={viewAsRole} reports={reports} />,
    loss_ledger: <LossLedger go={setView} session={session} role={role} viewAs={viewAsRole} reports={reports} />,
    loss_analysis: <LossAnalysis go={setView} session={session} role={role} viewAs={viewAsRole} reports={reports} />,
    genetics: <Genetics go={setView} session={session} role={role} viewAs={viewAsRole} reports={reports} />,
    room_turn_audit: <RoomTurnAudit go={setView} session={session} role={role} viewAs={viewAsRole} reports={reports} />,
    moisture_loss_register: <MoistureRegister go={setView} session={session} role={role} viewAs={viewAsRole} reports={reports} />,
    grading: <Grading go={setView} session={session} role={role} viewAs={viewAsRole} reports={reports} />,
    xq_metrc_exceptions: <MetrcExceptions go={setView} session={session} role={role} viewAs={viewAsRole} reports={reports} />,
    menu_manager: isExec
      ? <MenuManager onChanged={() => setNavVersion((v) => v + 1)} />
      : <div className="empty"><div className="eicon">{I.shield}</div><b>Admin area</b>Menu Manager is restricted to executives. Ask an owner if a menu change is needed.</div>,
  };
  /* An address that resolves to nothing used to fall through to the Control
     Tower in silence. A stale bookmark, a renamed view_key or a typo looked
     exactly like landing on the home page on purpose — the same failure shape
     as a query returning [] on error. Say what was asked for and why it is not
     here; the Control Tower is one click away rather than a silent substitute. */
  const unknownView = !special[view] && !current && view !== "tower";
  /* The door sign from page_permissions rows. It renders BEFORE the page body so
     a blocked page never flashes its numbers, and it says which role and which
     row blocked it — a silent block is indistinguishable from a broken page. */
  const viewBlocked = blockedViews?.get(view) === true;
  const blockedBody = (
    <div className="empty">
      <div className="eicon">{I.shield}</div>
      <b>{roleError && !viewAsRole ? "We could not read your role" : "This page is restricted"}</b>
      {roleError && !viewAsRole
        /* Never dress a failed lookup up as a permission decision. On 16 Aug 2026 the
           owner was told the "member" role could not view his own Command Center,
           because the role read had failed and the code substituted the lowest role.
           He reported the page as deleted, and it was not - it had never been touched. */
        ? <>Your access could not be checked, so nothing is being shown rather than the
            wrong thing. This is NOT a permission decision and your access has not changed.
            <div className="note" style={{ marginTop: 8 }}>{roleError}</div>
            <div className="note" style={{ marginTop: 4 }}>Signing out and back in refreshes
              an expired session, which is the usual cause.</div></>
        : <>The {viewAsRole ?? role} role does not have view access to “{view}” — set by an
            administrator in page permissions. Ask an owner or executive if you need it.</>}
      {viewAsRole && <div className="note" style={{ marginTop: 8 }}>You are seeing this because the design preview is
        showing you the {viewAsRole} role&rsquo;s view. Your own access is unchanged.</div>}
      <div style={{ marginTop: 14 }}>
        <button className="btn primary" onClick={() => setView("tower")}>Go to the Control Tower</button>
        {viewAsRole && <button className="btn" onClick={() => switchViewAs(null)}>Exit the preview</button>}
      </div>
    </div>
  );
  const body = viewBlocked ? blockedBody : special[view] ?? (current
    ? <ModuleScreen entry={current} session={session} actions={current.sync_enabled ? <SyncCenter session={session} /> : undefined} />
    : unknownView
      ? (
        <div className="empty">
          <div className="eicon">{I.shield}</div>
          <b>No page called “{view}”</b>
          This address does not match any page you can see. Either the link is out of date,
          the page was renamed, or your role does not have access to it.
          <div style={{ marginTop: 14 }}>
            <button className="btn primary" onClick={() => setView("tower")}>Go to the Control Tower</button>
          </div>
        </div>
      )
      : <ControlTower go={setView} />);

  return (
    <div className="frame">
      {/* The impossible-to-miss preview banner. It stays on every page for as
          long as the lens is active, and one click ends it. Honest limit stated:
          row-level security still runs as the signed-in admin, so DATA does not
          change in preview — only which surfaces render. A true data-level
          preview is a server-side project for the database chief operating
          officer, not a front-end toggle. */}
      {viewAsRole && (
        <div className="viewasbanner" role="status">
          <b>VIEWING AS {viewAsRole}</b> — presentation preview only: menus and pages render with
          that role&rsquo;s visibility; your own permissions and your own data access still apply, and
          the data on screen is NOT what this role&rsquo;s queries would return.
          <button className="btn small" onClick={() => switchViewAs(null)}>Exit preview</button>
        </div>
      )}
      {viewAsMsg && <div className="viewasbanner"><b>Preview problem:</b> {viewAsMsg}</div>}
      {launcher && <Launcher onGo={setView} onClose={() => setLauncher(false)} apps={apps} />}
      {preferenceError && (
        <div className="boundary" role="alert" style={{ position: "fixed", right: 16, bottom: 16, zIndex: 10000, maxWidth: 460 }}>
          <b>{preferenceError.area} was not saved to your account.</b>
          <div className="note">{preferenceError.message}</div>
          <button type="button" className="btn small ghost" style={{ marginTop: 8 }} onClick={() => setPreferenceError(null)}>Dismiss</button>
        </div>
      )}

      <header className="topnav">
        <div className="tlogo"><img src="/tg-mark.png" alt="Twisted Growers" style={{ width: 34, height: 34, borderRadius: "50%" }} /><span className="tword">Twisted <b>Growers</b></span></div>
        <button className="tibtn launchbtn" title="Open TG Workspace" onClick={() => setLauncher(true)}>{I.apps}</button>
        <div className="tdivider" />
        <div className="tcrumb">{current ? `${current.category} / ${current.label}` : view === "alerts" ? "Command / Alerts & Reminders" : "Command / Control Tower"}</div>
        <TopMenu label="Finance" items={finance} go={setView} />
        <TopMenu label="Tax" items={tax} go={setView} />
        <TopMenu label="Human Resources" items={hr} go={setView} />
        <div className="repwrap">
          <button className={`repbtn ${repMenu ? "on" : ""}`} onClick={() => setRepMenu((v) => !v)}>
            Reports <span className="repcar">▾</span>
          </button>
          {repMenu && (
            <div className="repmenu" onMouseLeave={() => setRepMenu(false)}>
              <div className="rephead">All reports</div>
              <div className="repcols">
                {[...new Set((reports ?? []).map((r) => r.report_group))].sort().map((g) => (
                  <div className="repcol" key={g}>
                    <div className="repgrp">{g}</div>
                    {(reports ?? [])
                      .filter((r) => r.report_group === g)
                      .sort((a, b) => (a.item_order ?? 0) - (b.item_order ?? 0) || a.label.localeCompare(b.label))
                      .map((r) => (
                        <button key={r.view_key} className="repitem" title={r.description || ""}
                          onClick={() => { setView(r.view_key); setRepMenu(false); }}>
                          {r.label}
                        </button>
                      ))}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="tspacer" />
        <BridgeChip />
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
                {/* SIGN OUT LIVES HERE. Owner, 8 Aug 2026: "i do not see log out
                    button add above the dark and light". It existed - as the last
                    item under about thirty-five others, past the fold, which is the
                    same as not existing. Moved rather than added: two buttons that
                    sign you out are two controls meaning one thing. */}
                <div className="usep" />
                <button className="uitem uout" onClick={() => { setUserMenu(false); signOutEverywhere(); }}>
                  {I.out} Sign out
                </button>
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
                {/* Same setter as the Assistant page, so the two can never disagree. */}
                {aiRoles && role && aiRoles.includes(role) && (
                  <button className="uitem" onClick={() => { setUserMenu(false); setPetOn(!petOn); }}>
                    {I.leafline} {petOn ? "Turn Budz off" : "Let Budz follow me"}
                  </button>
                )}
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
          {/* An empty rail and a rail we could not build look identical, and the
              second one used to arrive dressed as the first: the owner saw a
              short guest menu and read it as pages being deleted. Say it. */}
          {navError && (
            <div className="naverr" role="alert">
              <b>Your menu could not be built</b>
              <span>{navError}</span>
              <span>Nothing has been removed from the platform. Reload, and if this stays, it is a defect to report.</span>
            </div>
          )}
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
                  {[...new Set(c.items.map((e) => e.subcategory || ""))].map((sub) => {
                    const group = c.items.filter((e) => (e.subcategory || "") === sub);
                    const subKey = c.name + "::" + sub;
                    const subOpen = openCats[subKey] !== false;
                    return (
                      <div key={subKey} className={sub ? "subcat" : ""}>
                        {sub && (
                          <button className="subhead" onClick={() => setOpenCats({ ...openCats, [subKey]: !subOpen })}>
                            <span className="subtext">{sub}</span>
                            <span className="subcount">{group.length}</span>
                            <span className={`caret ${subOpen ? "open" : ""}`}>{I.caret}</span>
                          </button>
                        )}
                        {(!sub || subOpen) &&
                          group.map((e) => (
                            <button key={e.view_key} className={`item ${view === e.view_key ? "on" : ""}`}
                              onClick={() => setView(e.view_key)} title={e.description || e.label}>
                              {iconByName(e.icon)}<span className="lbl">{e.label}</span>
                              {e.milestone && <span className="mtag">SOON</span>}
                            </button>
                          ))}
                      </div>
                    );
                  })}
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
          {/* Suspense wraps the PAGE only, never the shell. A lazily loaded
              route arrives as a separate chunk, and while it is in flight this
              says so in one honest line — the side menu and the top menu are
              already on screen and never blank. It sits inside the boundary so
              a chunk that fails to load is caught and reported like any other
              page error rather than white-screening the app. */}
          <Boundary resetKey={view}>
            <Suspense fallback={<div className="note" style={{ padding: 16 }}>Loading this page…</div>}>
              {body}
            </Suspense>
          </Boundary>
        </main>
      </div>

      {/* Budz, floating over everything. Deliberately OUTSIDE <main> and outside
          the route boundary: he must survive navigation and keep his position,
          and a crash in a page must not take him down with it.

          Permission aware — ai_settings.ai_allowed_roles decides who may have an
          assistant at all. While that setting is still loading aiRoles is null
          and the pet does not render, so a role without AI access never sees him
          flash up before the check completes. */}
      {petOn && aiRoles && role && aiRoles.includes(role) && (
        <Boundary resetKey="budz-pet">
          <BudzPet go={setView} onClose={() => setPetOn(false)} />
        </Boundary>
      )}
    </div>
  );
}
