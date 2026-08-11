/* ---------------------------------------------------------------------------
   STAFF FORMS — call out · request time off · report an incident

   These three existed as buttons on My Week that navigated to raw table
   grids. A packager tapping "Call out" at 5:40 in the morning got a database
   view with a column header row. That was my defect, and this is the fix.

   Three genuinely different jobs, so three genuinely different layouts in one
   file. What they share is primitives — field, chip, button, the message
   strip. What they do not share is shape, because:

     CALL OUT      is urgent and one-shot. Notice is computed against policy
                   and shown BEFORE submitting, so nobody discovers after the
                   fact that they were an hour short of proper notice.

     TIME OFF      is planning. The balance is shown first, because a request
                   for more hours than you hold should be visible as such
                   while you type it, not denied a week later.

     INCIDENT      is evidence. Severity and witnesses lead. It never asks a
                   member of staff whether something is OSHA recordable —
                   that is a determination, not an observation, and it belongs
                   to Human Resources.
--------------------------------------------------------------------------- */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "./lib/supabase.js";

const CALLOUT_REASONS = [
  "Sick — myself", "Sick — family member", "Injury", "Family emergency",
  "Transport or breakdown", "Weather", "Bereavement", "Legal or jury duty",
  "Childcare", "Other",
];
const INCIDENT_KINDS = [
  ["injury", "Someone was hurt"],
  ["near_miss", "Near miss — nobody hurt this time"],
  ["illness", "Illness at work"],
  ["spill", "Spill or release"],
  ["equipment", "Equipment fault or damage"],
  ["security", "Security or theft"],
  ["product", "Product problem"],
  ["other", "Something else"],
];

export default function StaffForms({ mode = "callout", go }) {
  const [me, setMe] = useState(null);
  const [policy, setPolicy] = useState(null);
  const [shifts, setShifts] = useState([]);
  const [balances, setBalances] = useState([]);
  const [policies, setPolicies] = useState([]);
  const [zones, setZones] = useState([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [done, setDone] = useState(false);

  /* call out */
  const [shiftId, setShiftId] = useState("");
  const [coReason, setCoReason] = useState("");
  const [coNote, setCoNote] = useState("");

  /* time off */
  const [policyId, setPolicyId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [hours, setHours] = useState("8");
  const [toNote, setToNote] = useState("");

  /* incident */
  const [kind, setKind] = useState("");
  const [severity, setSeverity] = useState("low");
  const [occurred, setOccurred] = useState(() => new Date().toISOString().slice(0, 16));
  const [zoneId, setZoneId] = useState("");
  const [desc, setDesc] = useState("");
  const [witness, setWitness] = useState("");
  const [treatment, setTreatment] = useState("");

  const load = useCallback(async () => {
    const { data: id } = await supabase.rpc("f_my_employee_id");
    setMe(id ?? null);
    const [p, s, b, pol, z] = await Promise.all([
      supabase.from("attendance_policy").select("*").limit(1).maybeSingle(),
      id ? supabase.from("employee_schedules").select("*").eq("employee_id", id)
            .gte("work_date", new Date().toISOString().slice(0, 10))
            .order("work_date").limit(8) : { data: [] },
      id ? supabase.from("employee_pto").select("*, pto_policies(name, kind)").eq("employee_id", id) : { data: [] },
      supabase.from("pto_policies").select("*").eq("active", true).order("name"),
      supabase.from("zones").select("id, name").eq("active", true).order("name"),
    ]);
    setPolicy(p.data ?? null); setShifts(s.data ?? []); setBalances(b.data ?? []);
    setPolicies(pol.data ?? []); setZones(z.data ?? []);
  }, []);
  useEffect(() => { load(); }, [load]);

  /* Notice, computed and shown before submitting — never discovered after. */
  const notice = useMemo(() => {
    const sh = shifts.find(x => x.id === shiftId);
    if (!sh || !sh.planned_start) return null;
    const start = new Date(`${sh.work_date}T${sh.planned_start}`);
    const h = (start - Date.now()) / 3600000;
    const need = Number(policy?.notice_hours_required ?? 2);
    return { hours: h, need, meets: h >= need };
  }, [shiftId, shifts, policy]);

  const balanceFor = (pid) => balances.find(b => b.policy_id === pid);
  const bal = balanceFor(policyId);
  const overdrawn = bal && Number(hours) > Number(bal.balance_hours ?? 0);

  async function submitCallout() {
    if (!coReason || coNote.trim().length < 4) { setMsg("Choose a reason and say briefly what happened."); return; }
    setBusy(true); setMsg(null);
    const sh = shifts.find(x => x.id === shiftId);
    const { error } = await supabase.from("callouts").insert({
      employee_id: me, work_date: sh?.work_date ?? new Date().toISOString().slice(0, 10),
      schedule_id: shiftId || null, reason_code: coReason, explanation: coNote.trim(),
      notice_hours: notice ? Number(notice.hours.toFixed(2)) : null,
      meets_notice: notice ? notice.meets : null,
    });
    setBusy(false);
    if (error) { setMsg(error.message); return; }
    setDone(true);
    setMsg("Recorded. Your lead is told, and the shift is raised for cover.");
  }

  async function submitTimeOff() {
    if (!from || !to || !Number(hours)) { setMsg("Pick the dates and the hours."); return; }
    setBusy(true); setMsg(null);
    const { error } = await supabase.from("time_off_requests").insert({
      employee_id: me, policy_id: policyId || null,
      starts_on: from, ends_on: to, hours: Number(hours),
      note: toNote.trim() || null,
    });
    setBusy(false);
    if (error) { setMsg(error.message); return; }
    setDone(true);
    setMsg("Requested. You will see approve or deny on this page — nothing is decided silently.");
  }

  async function submitIncident() {
    if (!kind || desc.trim().length < 10) { setMsg("Choose what happened and describe it — ten characters at least."); return; }
    setBusy(true); setMsg(null);
    const { error } = await supabase.from("hr_incidents").insert({
      occurred_at: new Date(occurred).toISOString(),
      reported_by: me, involved_employee: me,
      zone_id: zoneId || null, kind, severity,
      description: desc.trim(), witnesses: witness.trim() || null,
      treatment: treatment || null,
    });
    setBusy(false);
    if (error) { setMsg(error.message); return; }
    setDone(true);
    setMsg("Reported. Human Resources decides what is recordable — you have done your part by writing it down.");
  }

  if (!me) return (
    <div className="sfempty"><b>No employee record linked to this login</b>
      <span>Ask Human Resources to link your account.</span></div>);

  if (done) return (
    <div className="sfdone">
      <div className="sfok">✓</div>
      <b>{msg}</b>
      <div className="sfacts">
        <button className="btn" onClick={() => go?.("my_week")}>Back to My Week</button>
        <button className="btn ghost" onClick={() => { setDone(false); setMsg(null); }}>Submit another</button>
      </div>
    </div>);

  return (
    <div className="sf">
      {msg && <div className="sfmsg">{msg}</div>}

      {/* ── CALL OUT — urgent, one-shot, notice shown before sending ── */}
      {mode === "callout" && (
        <>
          <div className="sfhead">
            <h1>Call out</h1>
            <p>Tell us you cannot make a shift. Do this as early as you can — notice is
              what separates an absence from a problem.</p>
          </div>

          <div className="sffield">
            <label>Which shift</label>
            {shifts.length === 0 ? (
              <p className="sfnone">Nothing scheduled for you. If you should be working, tell your lead directly.</p>
            ) : (
              <div className="sfshifts">
                {shifts.map(s => (
                  <button key={s.id} className={`sfshift ${shiftId === s.id ? "on" : ""}`}
                    onClick={() => setShiftId(s.id)}>
                    <b>{new Date(s.work_date + "T00:00:00").toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })}</b>
                    <i>{String(s.planned_start ?? "").slice(0, 5)}–{String(s.planned_end ?? "").slice(0, 5)} · {s.zone || "no zone"}</i>
                  </button>))}
              </div>)}
          </div>

          {notice && (
            <div className={`sfnotice ${notice.meets ? "ok" : "bad"}`}>
              <b>{notice.hours < 0
                ? `That shift started ${Math.abs(notice.hours).toFixed(1)} hours ago.`
                : `${notice.hours.toFixed(1)} hours before that shift starts.`}</b>
              {notice.meets
                ? `That meets the ${notice.need}-hour notice rule.`
                : `The rule is ${notice.need} hours. This will be recorded as short notice — call out anyway, being honest is better than not calling.`}
            </div>)}

          <div className="sffield">
            <label>Reason</label>
            <div className="sfchips">
              {CALLOUT_REASONS.map(r => (
                <button key={r} className={`sfchip ${coReason === r ? "on" : ""}`}
                  onClick={() => setCoReason(r)}>{r}</button>))}
            </div>
          </div>

          <div className="sffield">
            <label>What happened</label>
            <textarea rows={3} value={coNote} onChange={(e) => setCoNote(e.target.value)}
              placeholder="A sentence is enough." />
            <i>You do not have to give medical detail. Say enough that your lead can plan.</i>
          </div>

          <button className="btn sfbig" disabled={busy} onClick={submitCallout}>Send the call-out</button>
        </>)}

      {/* ── TIME OFF — planning; balance first ── */}
      {mode === "timeoff" && (
        <>
          <div className="sfhead">
            <h1>Request time off</h1>
            <p>Your balance is shown first, so you can see what you hold before you ask.</p>
          </div>

          {balances.length === 0 ? (
            <div className="sfnone">No balances set up for you yet. You can still request — Human Resources will decide.</div>
          ) : (
            <div className="sfbal">
              {balances.map(b => (
                <div className="sfbalb" key={b.id}>
                  <b>{Number(b.balance_hours ?? 0).toFixed(1)}</b>
                  <span>{b.pto_policies?.name ?? "hours"}</span>
                </div>))}
            </div>)}

          <div className="sffield">
            <label>Type</label>
            <select value={policyId} onChange={(e) => setPolicyId(e.target.value)}>
              <option value="">Choose…</option>
              {policies.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>

          <div className="sfrow">
            <div className="sffield"><label>From</label>
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
            <div className="sffield"><label>To</label>
              <input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
            <div className="sffield"><label>Hours</label>
              <input type="number" min="0.5" step="0.5" value={hours} onChange={(e) => setHours(e.target.value)} /></div>
          </div>

          {overdrawn && (
            <div className="sfnotice bad">
              <b>That is more than you hold.</b>
              You have {Number(bal.balance_hours).toFixed(1)} hours. You can still ask —
              it may be approved as unpaid — but you are seeing it now rather than in a
              denial next week.
            </div>)}

          <div className="sffield">
            <label>Anything your lead should know <span>optional</span></label>
            <textarea rows={2} value={toNote} onChange={(e) => setToNote(e.target.value)} />
          </div>

          <button className="btn sfbig" disabled={busy} onClick={submitTimeOff}>Send the request</button>
        </>)}

      {/* ── INCIDENT — evidence; severity and witnesses lead ── */}
      {mode === "incident" && (
        <>
          <div className="sfhead">
            <h1>Report an incident</h1>
            <p>Write it down while it is fresh. <b>A near miss is worth reporting precisely
              because nothing happened that time.</b></p>
          </div>

          <div className="sffield">
            <label>What happened</label>
            <div className="sfchips">
              {INCIDENT_KINDS.map(([k, l]) => (
                <button key={k} className={`sfchip ${kind === k ? "on" : ""}`}
                  onClick={() => setKind(k)}>{l}</button>))}
            </div>
          </div>

          <div className="sfrow">
            <div className="sffield"><label>When</label>
              <input type="datetime-local" value={occurred} onChange={(e) => setOccurred(e.target.value)} /></div>
            <div className="sffield"><label>Where</label>
              <select value={zoneId} onChange={(e) => setZoneId(e.target.value)}>
                <option value="">Not sure</option>
                {zones.map(z => <option key={z.id} value={z.id}>{z.name}</option>)}
              </select></div>
            <div className="sffield"><label>How serious</label>
              <select value={severity} onChange={(e) => setSeverity(e.target.value)}>
                <option value="low">Low — no harm</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select></div>
          </div>

          <div className="sffield">
            <label>Describe it</label>
            <textarea rows={4} value={desc} onChange={(e) => setDesc(e.target.value)}
              placeholder="What happened, in your own words. Facts rather than blame." />
          </div>

          <div className="sfrow">
            <div className="sffield"><label>Anyone who saw it <span>optional</span></label>
              <input value={witness} onChange={(e) => setWitness(e.target.value)} placeholder="Names" /></div>
            <div className="sffield"><label>Was anyone treated <span>optional</span></label>
              <select value={treatment} onChange={(e) => setTreatment(e.target.value)}>
                <option value="">No treatment</option>
                <option value="first_aid">First aid</option>
                <option value="medical">Saw a doctor</option>
                <option value="er">Emergency room</option>
                <option value="hospitalised">Admitted to hospital</option>
              </select></div>
          </div>

          <div className="sffine">
            You are not asked whether this is recordable under health-and-safety rules or
            reportable to the Commission. Those are determinations, and Human Resources
            makes them. Your job is to write down what happened.
          </div>

          <button className="btn sfbig" disabled={busy} onClick={submitIncident}>Submit the report</button>
        </>)}
    </div>
  );
}
