/* ---------------------------------------------------------------------------
   MY AVAILABILITY · SWAP A SHIFT

   Two staff-facing jobs that both concern the schedule, and two genuinely
   different shapes:

     AVAILABILITY is a standing pattern. A seven-day grid, because that is
     how a week is actually thought about — "I cannot do Tuesdays" is one
     tap, not a form. Scheduling without this is guessing, and the schedule
     builder already refuses to place someone marked unavailable.

     SWAP is a negotiation between two people. Pick your shift, pick who is
     taking it, say why. It needs BOTH the colleague's agreement and a
     manager's approval, because a swap moves two people's pay and the
     coverage of two zones — one signature is not enough for that.

   The one thing this page says out loud that most scheduling products do
   not: marking yourself unavailable is not a request for time off. Time off
   spends a balance; availability describes when you can work at all. People
   conflate them, get scheduled anyway, and then get an attendance point for
   it — so the page draws the distinction rather than assuming it is obvious.
--------------------------------------------------------------------------- */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "./lib/supabase.js";
/* The one date control and the one range/search primitive — imported, never rebuilt. */
import { DateRangeSelect } from "./App.jsx";
import { useDefaultRange, DkRangeSearch, rangeSearch } from "./dashkit.jsx";

const DAYS = [
  [1, "Monday"], [2, "Tuesday"], [3, "Wednesday"], [4, "Thursday"],
  [5, "Friday"], [6, "Saturday"], [0, "Sunday"],
];
const nameOf = (n) => { const [l = "", r = ""] = String(n || "").split(","); return r.trim() ? `${r.trim()} ${l.trim()}` : l.trim(); };
const when = (d) => (d ? new Date(d + "T00:00:00").toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" }) : "—");
const hhmm = (t) => (t ? String(t).slice(0, 5) : "");

export default function MySchedule({ mode = "availability", go }) {
  /* THE SESSION IS FETCHED HERE RATHER THAN PASSED IN, AND THAT IS A CONSTRAINT
   * SPEAKING, NOT A PREFERENCE.
   *
   * f_date_default resolves per user — a person's own saved choice for a page
   * outranks the company default — so the bus needs a session. This component is
   * rendered as <MySchedule mode=... go=... /> with no session prop, and adding
   * one means editing App.jsx, which three unmerged branches are currently on
   * (including claude-c/dashboard-time-frame). Reaching into a file somebody else
   * is holding to add a prop is how two sessions lose an afternoon to a conflict.
   *
   * So it asks Supabase directly for the session it already has. When App.jsx is
   * free, this should become a prop like every other page and this hook can go.
   * budz.jsx already reads the session locally, so this is the existing idiom
   * rather than a new one. */
  const [session, setSession] = useState(null);
  useEffect(() => {
    let live = true;
    supabase.auth.getSession().then(({ data }) => { if (live) setSession(data?.session ?? null); });
  return () => { live = false; };
  }, []);

  const VIEW_KEY = mode === "swap" ? "my_swap" : "my_availability";
  const [range, setRange] = useState({ from: "", to: "" });
  const dateDefault = useDefaultRange(session, VIEW_KEY, setRange);
  const [q, setQ] = useState("");
  const [me, setMe] = useState(null);
  const [rows, setRows] = useState([]);
  const [shifts, setShifts] = useState([]);
  const [mates, setMates] = useState([]);
  const [swaps, setSwaps] = useState([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  /* availability */
  const [oneOff, setOneOff] = useState("");
  const [oneOffWhy, setOneOffWhy] = useState("");

  /* swap */
  const [giveId, setGiveId] = useState("");
  const [mateId, setMateId] = useState("");
  const [swapWhy, setSwapWhy] = useState("");

  const load = useCallback(async () => {
    const { data: id } = await supabase.rpc("f_my_employee_id");
    setMe(id ?? null);
    if (!id) return;
    const today = new Date().toISOString().slice(0, 10);
    const [a, s, m, w] = await Promise.all([
      supabase.from("employee_availability").select("*").eq("employee_id", id),
      supabase.from("employee_schedules").select("*").eq("employee_id", id)
        .gte("work_date", today).order("work_date").limit(14),
      supabase.from("employees").select("id, full_name, employee_code")
        .eq("status", "active").order("full_name"),
      supabase.from("shift_swaps").select("*").or(`requested_by.eq.${id},counterparty.eq.${id}`)
        .order("created_at", { ascending: false }).limit(8),
    ]);
    setRows(a.data ?? []); setShifts(s.data ?? []);
    setMates((m.data ?? []).filter(x => x.id !== id)); setSwaps(w.data ?? []);
  }, []);
  useEffect(() => { load(); }, [load]);

  const dayState = useMemo(() => {
    const map = {};
    for (const [dow] of DAYS) {
      const r = rows.find(x => x.weekday === dow && !x.specific_date);
      map[dow] = r ?? null;
    }
    return map;
  }, [rows]);

  const oneOffs = useMemo(() =>
    rows.filter(r => r.specific_date).sort((a, b) => a.specific_date.localeCompare(b.specific_date)),
    [rows]);

  async function toggleDay(dow) {
    setBusy(true); setMsg(null);
    const existing = dayState[dow];
    if (existing) {
      /* available → unavailable → cleared, so three taps returns to default */
      if (existing.available) {
        await supabase.from("employee_availability").update({ available: false }).eq("id", existing.id);
      } else {
        await supabase.from("employee_availability").delete().eq("id", existing.id);
      }
    } else {
      await supabase.from("employee_availability").insert({
        employee_id: me, weekday: dow, available: true,
      });
    }
    setBusy(false); load();
  }

  async function addOneOff() {
    if (!oneOff) { setMsg("Pick a date."); return; }
    setBusy(true); setMsg(null);
    const { error } = await supabase.from("employee_availability").insert({
      employee_id: me, specific_date: oneOff, available: false,
      reason: oneOffWhy.trim() || null,
    });
    setBusy(false);
    setMsg(error ? error.message : "Saved. Your manager sees this when building the week.");
    setOneOff(""); setOneOffWhy(""); if (!error) load();
  }

  async function removeOneOff(id) {
    setBusy(true); await supabase.from("employee_availability").delete().eq("id", id);
    setBusy(false); load();
  }

  async function requestSwap() {
    if (!giveId || !mateId) { setMsg("Pick the shift and who is taking it."); return; }
    setBusy(true); setMsg(null);
    const { error } = await supabase.from("shift_swaps").insert({
      requested_by: me, counterparty: mateId, give_schedule_id: giveId,
      reason: swapWhy.trim() || null, status: "pending",
    });
    setBusy(false);
    if (error) { setMsg(error.message); return; }
    setMsg("Asked. They agree first, then a manager approves — two gates, because a swap moves two people's pay.");
    setGiveId(""); setMateId(""); setSwapWhy(""); load();
  }

  async function agree(sw, yes) {
    setBusy(true);
    await supabase.from("shift_swaps").update({
      counterparty_agreed: yes, counterparty_at: new Date().toISOString(),
      status: yes ? "awaiting_manager" : "cancelled",
    }).eq("id", sw.id);
    setBusy(false);
    setMsg(yes ? "Agreed. It goes to a manager now." : "Declined. Nothing changes.");
    load();
  }

  if (!me) return (
    <div className="msempty"><b>No employee record linked to this login</b>
      <span>Ask Human Resources to link your account.</span></div>);

  /* rangeSearch is the shared primitive — one unit-tested definition of "a search
     beats the range" and "an undated row is never dropped". A swap still waiting
     on a counterparty has no decided_at and is never dropped by the frame: an
     undecided swap is the one the person came here to chase. The frame is
     created_at, when the swap was RAISED. */
  const swapRs = rangeSearch(swaps, {
    from: range.from, to: range.to, dateField: "created_at", q,
    fields: ["status", "work_date", "note", "counterparty_name"],
  });
  const shownSwaps = swapRs.rows;

  return (
    <div className="ms">
      {msg && <div className="msmsg">{msg}</div>}

      {mode === "availability" && (
        <>
          <div className="mshead">
            <h1>My availability</h1>
            {/* The availability grid is a WEEKDAY PATTERN, not dated records — "I
                cannot work Tuesdays" has no date to range over. It declares that
                rather than growing a control that would narrow nothing. */}
            <div className="msasof">
              This is a standing weekly pattern, not a list of dates — there is no
              period to choose. It applies until you change it.
            </div>
            <p>When you can work at all. <b>This is not time off</b> — time off spends a
              balance and needs approval. Availability describes the days you can be
              scheduled, and your manager sees it while building the week.</p>
          </div>

          <div className="msgrid">
            {DAYS.map(([dow, label]) => {
              const st = dayState[dow];
              const cls = !st ? "" : st.available ? "yes" : "no";
              return (
                <button key={dow} className={`msday ${cls}`} disabled={busy}
                  onClick={() => toggleDay(dow)}>
                  <b>{label}</b>
                  <i>{!st ? "no preference" : st.available ? "can work" : "cannot work"}</i>
                </button>);
            })}
          </div>
          <p className="msfine">
            Tap once for <b>can work</b>, again for <b>cannot work</b>, again to clear it.
            &ldquo;No preference&rdquo; means you are schedulable — it is not a refusal.
          </p>

          <div className="mscard">
            <h3>One-off days you cannot work</h3>
            <div className="msrow">
              <input type="date" value={oneOff} onChange={(e) => setOneOff(e.target.value)} />
              <input value={oneOffWhy} onChange={(e) => setOneOffWhy(e.target.value)}
                placeholder="Reason (optional)" />
              <button className="btn small" disabled={busy} onClick={addOneOff}>Add</button>
            </div>
            {oneOffs.length === 0 ? (
              <p className="msnone">Nothing marked.</p>
            ) : (
              <div className="msrows">
                {oneOffs.map(o => (
                  <div className="msline" key={o.id}>
                    <span className="msd">{when(o.specific_date)}</span>
                    <span className="msz">{o.reason || "unavailable"}</span>
                    <button className="btn ghost small" disabled={busy}
                      onClick={() => removeOneOff(o.id)}>Remove</button>
                  </div>))}
              </div>)}
          </div>
        </>)}

      {mode === "swap" && (
        <>
          <div className="mshead">
            <h1>Swap a shift</h1>
            <div className="mstools">
              <DkRangeSearch id="ms-q" label="Find a swap" placeholder="date, mate or status"
                q={q} onQ={setQ} result={swapRs} noun="swaps" />
              <DateRangeSelect label="Raised between" from={range.from} to={range.to}
                onFrom={(v) => setRange((prev) => ({ ...prev, from: v }))}
                onTo={(v) => setRange((prev) => ({ ...prev, to: v }))}
                presetKey={dateDefault.presetKey} session={session}
                viewKey={VIEW_KEY} allowSave />
              {dateDefault.error && <span className="note bad" role="alert">{dateDefault.error}</span>}
            </div>
            <p>Pick the shift you cannot work and who is taking it. <b>They agree, then a
              manager approves</b> — two gates, because a swap changes two people&rsquo;s pay
              and the cover on two zones.</p>
          </div>

          {shifts.length === 0 ? (
            <div className="msnone">You have no upcoming shifts to swap.</div>
          ) : (
            <>
              <div className="mscard">
                <h3>Your shift</h3>
                <div className="msshifts">
                  {shifts.map(s => (
                    <button key={s.id} className={`msshift ${giveId === s.id ? "on" : ""}`}
                      onClick={() => setGiveId(s.id)}>
                      <b>{when(s.work_date)}</b>
                      <i>{hhmm(s.planned_start)}–{hhmm(s.planned_end)} · {s.zone || "no zone"}</i>
                    </button>))}
                </div>
              </div>

              <div className="mscard">
                <h3>Who is taking it</h3>
                <select value={mateId} onChange={(e) => setMateId(e.target.value)}>
                  <option value="">Choose a colleague…</option>
                  {mates.map(m => <option key={m.id} value={m.id}>{nameOf(m.full_name)}</option>)}
                </select>
                <p className="msfine">
                  Ask them first. This sends the request to them, and they can decline —
                  nobody is given a shift without agreeing to it.
                </p>
                <input value={swapWhy} onChange={(e) => setSwapWhy(e.target.value)}
                  placeholder="Why (optional)" />
                <button className="btn" disabled={busy || !giveId || !mateId}
                  onClick={requestSwap}>Ask for the swap</button>
              </div>
            </>)}

          {shownSwaps.length > 0 && (
            <div className="mscard">
              <h3>Your swaps</h3>
              <div className="msrows">
                {shownSwaps.map(sw => {
                  const mine = sw.requested_by === me;
                  const needsMe = !mine && sw.status === "pending";
                  return (
                    <div className="msline" key={sw.id}>
                      <span className="msz">
                        {mine ? "You asked" : "Asked of you"}
                        {sw.reason ? ` — ${sw.reason}` : ""}
                      </span>
                      {needsMe ? (
                        <>
                          <button className="btn small" disabled={busy} onClick={() => agree(sw, true)}>Agree</button>
                          <button className="btn ghost small" disabled={busy} onClick={() => agree(sw, false)}>Decline</button>
                        </>
                      ) : (
                        <span className={`schip ${sw.status === "approved" ? "ok"
                          : sw.status === "denied" || sw.status === "cancelled" ? "bad" : "warn"}`}>
                          {sw.status.replace(/_/g, " ")}</span>)}
                    </div>);
                })}
              </div>
            </div>)}
        </>)}
    </div>
  );
}
