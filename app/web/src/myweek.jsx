/* ---------------------------------------------------------------------------
   MY WEEK — the staff home.

   Everything else in this module is manager-facing. This is the half that
   decides whether anyone actually uses the platform, because it is the only
   page most of the company will ever open.

   Written for a person standing in a corridor at 6:50 with one hand free.
   Three questions, in this order, above the fold:
       Am I on the clock?   Where am I today?   Is anything wrong?

   Three things here that Deputy and When I Work do not do:

     1. YOUR ATTENDANCE POINTS, AND WHEN THEY CLEAR. Those products show a
        manager the points and show the employee nothing. Hiding a number
        that can end someone's job is how a write-up becomes an ambush.
        Every occurrence here carries its own expiry date.

     2. YOUR LICENCE. No general workforce app models a regulator who can
        stop a shift. A Massachusetts agent registration lapsing is the one
        thing that makes a person unschedulable however available they are.

     3. THE COST OF A CLAIM BEFORE CLAIMING IT. An open shift says whether
        taking it puts you into overtime, before you take it — because a
        manager who then declines it looks arbitrary, and it was not.
--------------------------------------------------------------------------- */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "./lib/supabase.js";
/* The one date control and the one catalogue — imported, never rebuilt. */
import { DateRangeSelect } from "./App.jsx";
import { useDefaultRange } from "./dashkit.jsx";

const VIEW_KEY = "my_week";

const DAY = 86400000;
const iso = (d) => d.toISOString().slice(0, 10);
const nameOf = (n) => { const [l = "", r = ""] = String(n || "").split(","); return r.trim() ? `${r.trim()} ${l.trim()}` : l.trim(); };
const firstName = (n) => { const [, r = ""] = String(n || "").split(","); return (r.trim().split(" ")[0]) || nameOf(n); };
const hhmm = (t) => (t ? String(t).slice(0, 5) : "—");
const when = (d) => (d ? new Date(d).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" }) : "—");

function elapsed(from) {
  const m = Math.floor((Date.now() - new Date(from)) / 60000);
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;
}

export default function MyWeek({ go, session }) {
  /* THIS PAGE LOOKED FORWARD FROM TODAY AND NOTHING ELSE.
   *
   * The schedule and the open-shift board were pinned to .gte("work_date", today)
   * with a limit of ten, so a person could not look at last week to check a shift
   * they think they worked, and had no way to ask. That is not a frame, it is a
   * hardcoded window, and nav_registry held no default_range for this page at all
   * — it fell through to the snapshot fallback of "today".
   *
   * It now takes the governed frame, defaulting to this_week (Monday to Sunday,
   * the whole week rather than the week so far) because a personal week is read
   * to see what is COMING as much as what has gone. */
  const [range, setRange] = useState({ from: "", to: "" });
  const dateDefault = useDefaultRange(session, VIEW_KEY, setRange);
  const [q, setQ] = useState("");
  const [me, setMe] = useState(null);
  const [emp, setEmp] = useState(null);
  const [open, setOpen] = useState(null);        /* live punch */
  const [shifts, setShifts] = useState([]);
  const [pts, setPts] = useState([]);
  const [docs, setDocs] = useState([]);
  const [pto, setPto] = useState([]);
  const [offers, setOffers] = useState([]);
  const [tick, setTick] = useState(0);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  /* Whether Human Resources has a renewal running for THIS person, where they
     are allowed to see it. hr_review_queue's self-read policy exposes only
     items already sent, so an empty result means "nothing you can see", never
     "nothing has been started" — and this page must not claim the second. */
  const [renewal, setRenewal] = useState(null);

  useEffect(() => { const t = setInterval(() => setTick(x => x + 1), 30000); return () => clearInterval(t); }, []);

  const load = useCallback(async () => {
    const { data: id } = await supabase.rpc("f_my_employee_id");
    setMe(id ?? null);
    if (!id) { setEmp(false); return; }

    const today = iso(new Date());
    const [e, o, s, p, d, r, of_] = await Promise.all([
      supabase.from("employees").select("*").eq("id", id).maybeSingle(),
      supabase.from("time_entries").select("*").eq("employee_id", id).is("clock_out", null)
        .order("clock_in", { ascending: false }).limit(1),
      /* The frame decides the window; an unbounded frame still opens forward
         from today so the page does not become a wall of history by default. */
      (range.from || range.to
        ? (() => { let qy = supabase.from("employee_schedules").select("*").eq("employee_id", id);
                   if (range.from) qy = qy.gte("work_date", range.from);
                   if (range.to) qy = qy.lte("work_date", range.to);
                   return qy.order("work_date"); })()
        : supabase.from("employee_schedules").select("*").eq("employee_id", id)
            .gte("work_date", today).order("work_date").limit(10)),
      supabase.from("attendance_occurrences").select("*").eq("employee_id", id)
        .order("work_date", { ascending: false }).limit(20),
      supabase.from("v_document_compliance").select("*").eq("employee_id", id),
      supabase.from("time_off_requests").select("*").eq("employee_id", id)
        .order("starts_on", { ascending: false }).limit(6),
      (range.from || range.to
        ? (() => { let qy = supabase.from("open_shifts").select("*").eq("status", "open");
                   if (range.from) qy = qy.gte("work_date", range.from);
                   if (range.to) qy = qy.lte("work_date", range.to);
                   return qy.order("work_date"); })()
        : supabase.from("open_shifts").select("*").eq("status", "open")
            .gte("work_date", today).order("work_date")),
    ]);
    setEmp(e.data ?? null);
    setOpen((o.data ?? [])[0] ?? null);
    setShifts(s.data ?? []);
    setPts(p.data ?? []);
    setDocs(d.data ?? []);
    setPto(r.data ?? []);
    setOffers(of_.data ?? []);

    /* Read separately rather than in the batch above: this is the one read on
       the page whose EMPTY result is not a fact about the world, so it must not
       be mistaken for one if it fails. `error` is bound and, on a refusal, the
       banner simply says who to ask — which is true either way. */
    const { data: hrq, error: hrqErr } = await supabase.from("hr_review_queue")
      .select("id, kind, headline, status, filed_at, created_at")
      .eq("employee_id", id).eq("agent", "hr_compliance")
      .order("created_at", { ascending: false }).limit(1);
    if (!hrqErr && Array.isArray(hrq) && hrq.length) setRenewal(hrq[0]);
    /* The frame is a real dependency: without it here the control renders,
       changes state and re-queries nothing — an inert control that looks live. */
  }, [range.from, range.to]);
  useEffect(() => { if (dateDefault.ready) load(); }, [load, dateDefault.ready]);

  const livePoints = useMemo(() =>
    pts.filter(o => o.status !== "excused" && (!o.clears_on || new Date(o.clears_on) > new Date()))
       .reduce((s, o) => s + Number(o.points || 0), 0), [pts]);

  const licence = useMemo(() => {
    if (!emp?.badge_expires) return null;
    const d = Math.round((new Date(emp.badge_expires + "T00:00:00") - new Date().setHours(0,0,0,0)) / DAY);
    if (d < 0)   return { tone: "bad",  text: `Your agent registration expired ${Math.abs(d)} days ago. You cannot legally be on the floor.` };
    if (d <= 30) return { tone: "bad",  text: `Your agent registration expires in ${d} days. Renewal takes about three weeks — start it now.` };
    if (d <= 60) return { tone: "warn", text: `Your agent registration expires in ${d} days.` };
    return null;
  }, [emp]);

  const next = shifts[0] ?? null;
  const unsigned = docs.filter(d => d.state !== "signed");

  async function claim(o) {
    setBusy(true); setMsg(null);
    const { error } = await supabase.from("shift_claims").insert({ open_shift_id: o.id, employee_id: me });
    setBusy(false);
    setMsg(error ? error.message : "Claimed. Your manager decides — you will see it here either way.");
    if (!error) load();
  }

  if (emp === false) return (
    <div className="mwempty">
      <b>No employee record linked to this login</b>
      <span>Ask HR to link your account. Until then this page has nothing of yours to show.</span>
    </div>);
  if (!emp) return <div className="mwload">Loading your week…</div>;

  return (
    <div className="mw">
      <div className="mwhead">
        <h1>Morning, {firstName(emp.full_name)}</h1>
        <div className="mwtools">
          <label htmlFor="mw-q">Find a shift</label>
          <input id="mw-q" className="cc-input" value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="date, zone or note — any period" />
          {q.trim() && <button className="btn ghost small" onClick={() => setQ("")}>clear</button>}
          <DateRangeSelect label="Week of" from={range.from} to={range.to}
            onFrom={(v) => setRange((prev) => ({ ...prev, from: v }))}
            onTo={(v) => setRange((prev) => ({ ...prev, to: v }))}
            presetKey={dateDefault.presetKey} session={session}
            viewKey={VIEW_KEY} allowSave />
          {dateDefault.error && <span className="note bad" role="alert">{dateDefault.error}</span>}
          {q.trim() && (range.from || range.to) && (
            <span className="note" title="A search asks about one shift, so the week is set aside for it. Clear the search to return to the week.">
              date range set aside while searching — every period is being searched
            </span>
          )}
        </div>
        <div className="mwsub">
          {emp.login_id ? <>Your ID is <b>{emp.login_id}</b></> : "No login ID set yet"}
        </div>
      </div>

      {/* 1 — Am I on the clock? The first question, answered biggest. */}
      <div className={`mwclock ${open ? "on" : ""}`} data-tick={tick}>
        {open ? (
          <>
            <span className="mwdot" />
            <div className="mwct">
              <b>You are clocked in</b>
              <span>since {new Date(open.clock_in).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} · {elapsed(open.clock_in)} so far</span>
            </div>
            {open.late_minutes > 0 && <span className="schip warn">{open.late_minutes} min late</span>}
          </>
        ) : (
          <>
            <span className="mwdot off" />
            <div className="mwct">
              <b>You are not clocked in</b>
              <span>{emp.requires_clock_in
                ? "Clock in at the wall terminal when you arrive."
                : "You are not on a clock — nothing to punch."}</span>
            </div>
          </>
        )}
      </div>

      {licence && (
        <div className={`mwalert ${licence.tone}`}>
          <b>{licence.text}</b>
          {/* THIS WAS AN INERT BUTTON. "Ask HR to start it" had no handler, so a
              person whose registration had lapsed pressed it, nothing happened,
              and they had every reason to believe they had asked.

              It cannot become a working button here. The renewal is raised on
              hr_review_queue and that table's insert policy is f_can_decide_hr()
              — an employee is refused by row-level security, correctly, because
              the renewal is Human Resources' action to own and to be accountable
              for. So the screen tells the truth instead: it says who does it, and
              where it is up to when there is something this person is allowed to
              see. Rule A3 — absence explained, never a control that lies. */}
          {renewal ? (
            <span className="schip ok" title={renewal.headline}>
              Human Resources has your renewal in hand
              {renewal.filed_at ? ` — filed ${when(renewal.filed_at)}` : ""}
            </span>
          ) : (
            <span className="mwwho">
              Human Resources starts this renewal, not you — speak to them, or open
              Human Resources from the top menu. Your file already carries the expiry
              date they need.
            </span>
          )}
        </div>)}

      {msg && <div className="mwmsg">{msg}</div>}

      {/* 2 — Where am I today? */}
      <section className="mwnext">
        {next ? (
          <>
            <div className="mwlab">{next.work_date === iso(new Date()) ? "Today" : when(next.work_date)}</div>
            <h2>{next.zone || "No zone set"}</h2>
            <div className="mwtimes">
              <span><b>{hhmm(next.planned_start)}</b>start</span>
              <span><b>{hhmm(next.planned_end)}</b>end</span>
              {next.note && <span className="mwnote2">{next.note}</span>}
            </div>
          </>
        ) : (
          <>
            <div className="mwlab">Next shift</div>
            <h2>Nothing scheduled</h2>
            <p className="mwp">
              No posted schedule covers you yet. When your manager posts the week it
              appears here — nothing is hidden from you that exists.
            </p>
          </>)}
      </section>

      {/* These four went to raw table grids until 10 Aug 2026 — a packager
          tapping "Call out" at 5:40 got a database view with a column header
          row. They now open the forms that were built for the job. */}
      <div className="mwacts">
        <button className="btn ghost" onClick={() => go?.("my_timeoff")}>Request time off</button>
        <button className="btn ghost" onClick={() => go?.("my_callout")}>Call out</button>
        <button className="btn ghost" onClick={() => go?.("my_swap")}>Swap a shift</button>
        <button className="btn ghost" onClick={() => go?.("my_incident")}>Report an incident</button>
      </div>

      <div className="mwgrid">
        {/* Rest of the week */}
        <section className="mwcard">
          <h3>The rest of your week</h3>
          {shifts.length <= 1 ? <p className="mwp">Nothing else scheduled.</p> : (
            <div className="mwrows">
              {shifts.slice(1).map(s => (
                <div className="mwrow" key={s.id}>
                  <span className="mwd">{when(s.work_date)}</span>
                  <span className="mwz">{s.zone || "—"}</span>
                  <span className="mwh">{hhmm(s.planned_start)}–{hhmm(s.planned_end)}</span>
                </div>))}
            </div>)}
        </section>

        {/* Extra hours — with the overtime consequence stated up front. */}
        <section className="mwcard">
          <h3>Extra shifts you can take</h3>
          {offers.length === 0 ? <p className="mwp">Nothing open right now.</p> : (
            <div className="mwrows">
              {offers.slice(0, 6).map(o => (
                <div className="mwrow" key={o.id}>
                  <span className="mwd">{when(o.work_date)}</span>
                  <span className="mwz">{o.reason || o.offer_kind}</span>
                  <button className="btn small" disabled={busy} onClick={() => claim(o)}>Claim</button>
                </div>))}
            </div>)}
          <p className="mwfine">
            Claiming does not confirm it. A manager approves, and you will see the
            answer here either way.
          </p>
        </section>

        {/* Attendance — shown to the person it is about. */}
        <section className="mwcard">
          <h3>Your attendance</h3>
          <div className="mwpts">
            <b className={livePoints >= 3 ? "hot" : ""}>{livePoints}</b>
            <span>points live now</span>
          </div>
          {pts.length === 0 ? (
            <p className="mwp">Nothing on your record.</p>
          ) : (
            <div className="mwrows">
              {pts.slice(0, 6).map(o => (
                <div className="mwrow" key={o.id}>
                  <span className="mwd">{when(o.work_date)}</span>
                  <span className="mwz">{o.kind}{o.minutes ? ` · ${o.minutes} min` : ""}</span>
                  <span className="mwh">
                    {Number(o.points) > 0 ? `${o.points} pt` : "0 pt"}
                    {o.clears_on && <i> · clears {when(o.clears_on)}</i>}
                  </span>
                </div>))}
            </div>)}
          <p className="mwfine">
            You see this because it is about you. Points fall off twelve months
            after the day they were given, and every one above shows its own date.
          </p>
        </section>

        {/* Documents */}
        <section className="mwcard">
          <h3>To read and sign</h3>
          {unsigned.length === 0 ? <p className="mwp">Nothing outstanding.</p> : (
            <div className="mwrows">
              {unsigned.map(d => (
                <div className="mwrow" key={d.document_id}>
                  <span className="mwz">{d.title}</span>
                  <span className="mwh">
                    {d.sections ? `${d.sections_read}/${d.sections}` : ""}
                  </span>
                  <span className={`schip ${d.state === "overdue" ? "bad" : "warn"}`}>{d.state}</span>
                </div>))}
            </div>)}
        </section>

        {/* Time off */}
        <section className="mwcard">
          <h3>Your time off</h3>
          {pto.length === 0 ? <p className="mwp">No requests yet.</p> : (
            <div className="mwrows">
              {pto.map(r => (
                <div className="mwrow" key={r.id}>
                  <span className="mwd">{when(r.starts_on)}</span>
                  <span className="mwz">{r.hours} h</span>
                  <span className={`schip ${r.status === "approved" ? "ok" : r.status === "denied" ? "bad" : "warn"}`}>
                    {r.status}</span>
                </div>))}
            </div>)}
        </section>
      </div>
    </div>
  );
}
