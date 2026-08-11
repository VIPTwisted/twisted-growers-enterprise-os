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

export default function MyWeek({ go }) {
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
      supabase.from("employee_schedules").select("*").eq("employee_id", id)
        .gte("work_date", today).order("work_date").limit(10),
      supabase.from("attendance_occurrences").select("*").eq("employee_id", id)
        .order("work_date", { ascending: false }).limit(20),
      supabase.from("v_document_compliance").select("*").eq("employee_id", id),
      supabase.from("time_off_requests").select("*").eq("employee_id", id)
        .order("starts_on", { ascending: false }).limit(6),
      supabase.from("open_shifts").select("*").eq("status", "open").gte("work_date", today).order("work_date"),
    ]);
    setEmp(e.data ?? null);
    setOpen((o.data ?? [])[0] ?? null);
    setShifts(s.data ?? []);
    setPts(p.data ?? []);
    setDocs(d.data ?? []);
    setPto(r.data ?? []);
    setOffers(of_.data ?? []);
  }, []);
  useEffect(() => { load(); }, [load]);

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
          <button className="btn small">Ask HR to start it</button>
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
        <button className="btn ghost" onClick={() => go?.("shift_swaps")}>Swap a shift</button>
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
