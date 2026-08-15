/* ---------------------------------------------------------------------------
   THE EMPLOYEE FILE
   One person, everything, in the order someone actually needs it.

   This is the page an HR manager opens when a person is standing in front of
   them, or when a lawyer asks a question eighteen months later. So it leads
   with what stops work — a lapsed agent registration — then identity, then
   the record: attendance, documents signed, compliance, schedule, pay.

   Pay is LAST and permission-gated. Owner's rule: per-person pay never leaves
   the payroll module. A manager opens this file to see who someone is and how
   they are doing; they do not need to see what the person earns.

   Not a template. A roster is a list; this is a dossier.
--------------------------------------------------------------------------- */
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "./lib/supabase.js";

const DAY = 86400000;
const daysTo = (d) => (d ? Math.round((new Date(d + "T00:00:00") - new Date().setHours(0,0,0,0)) / DAY) : null);
const money = (n) => (n == null ? "—" : "$" + Number(n).toLocaleString(undefined, { minimumFractionDigits: 2 }));
const nameOf = (n) => { const [l="", r=""] = String(n||"").split(","); return r.trim() ? `${r.trim()} ${l.trim()}` : l.trim(); };
const initials = (n) => { const [l="", r=""] = String(n||"").split(","); return ((r.trim()[0]||"")+(l.trim()[0]||"")).toUpperCase() || "?"; };
const when = (d) => (d ? new Date(d).toLocaleDateString(undefined, { day:"numeric", month:"short", year:"numeric" }) : "—");
/* The Human Resources review queue recognises a fixed set of agents and this is
   the compliance one. The roster raises renewals under the same name, so the two
   screens can never produce two different kinds of the same item. */
const RENEWAL_AGENT = "hr_compliance";

export default function EmployeeFile({ employeeId, go }) {
  const [id, setId] = useState(employeeId || null);
  const [list, setList] = useState([]);
  const [p, setP] = useState(null);
  const [lk, setLk] = useState({ roles:{}, depts:{} });
  const [rates, setRates] = useState([]);
  const [occ, setOcc] = useState([]);
  const [docs, setDocs] = useState([]);
  const [comp, setComp] = useState([]);
  const [sched, setSched] = useState([]);
  const [canSeePay, setCanSeePay] = useState(false);
  const [tab, setTab] = useState("record");
  /* THE RENEWAL BUTTON, WIRED 15 AUG 2026. It was
     `<button className="btn small">Start renewal</button>` with no handler, in
     the alert band that says this person cannot legally be on the floor. It now
     raises a real item on the Human Resources review queue — the same queue and
     the same hr_compliance agent the roster raises to, so the two screens cannot
     produce two different kinds of renewal. hr_review_queue's insert policy is
     f_can_decide_hr(), so anyone else is told who can rather than shown a
     row-level-security refusal they cannot act on. */
  const [canDecide, setCanDecide] = useState(false);
  const [renewState, setRenewState] = useState("idle");  /* idle | saving | raised */
  const [renewMsg, setRenewMsg] = useState(null);

  useEffect(() => {
    supabase.from("employees").select("id, full_name, employee_code, status")
      .order("full_name").then(({ data }) => {
        setList(data ?? []);
        /* Functional form so this mount-only effect does not depend on id —
           it only ever fills a blank selection, never overrides a chosen one. */
        if (data?.length) setId((cur) => cur ?? data[0].id);
      });
    supabase.rpc("f_can_read_hr").then(({ data }) => setCanSeePay(!!data));
    supabase.rpc("f_can_decide_hr").then(({ data, error }) => {
      if (error) { setRenewMsg(`Could not check whether you may raise a renewal: ${error.message}`); return; }
      setCanDecide(data === true);
    });
    Promise.all([
      supabase.from("roles_catalog").select("id, name"),
      supabase.from("departments").select("id, name"),
    ]).then(([r, d]) => setLk({
      roles: Object.fromEntries((r.data ?? []).map(x => [x.id, x.name])),
      depts: Object.fromEntries((d.data ?? []).map(x => [x.id, x.name])),
    }));
  }, []);

  useEffect(() => {
    if (!id) return;
    /* A renewal already waiting belongs to the person, not to the screen, so it
       is re-read whenever the person changes rather than carried across. */
    setRenewState("idle"); setRenewMsg(null);
    supabase.from("hr_review_queue")
      .select("id").eq("agent", RENEWAL_AGENT).eq("employee_id", id).eq("status", "pending").limit(1)
      .then(({ data, error }) => {
        /* Not everyone may read this queue, and a refusal is NOT "none queued".
           Saying so matters: a silent empty result invites a second renewal for
           one already in hand. Only a successful read that came back empty
           leaves the button offering to raise one. */
        if (error) { setRenewMsg(`Could not check whether a renewal is already queued for this person: ${error.message}`); return; }
        if (Array.isArray(data) && data.length) setRenewState("raised");
      });
    supabase.from("employees").select("*").eq("id", id).maybeSingle()
      .then(({ data }) => setP(data));
    supabase.from("employee_rates").select("*").eq("employee_id", id)
      .order("effective_from", { ascending: false }).then(({ data }) => setRates(data ?? []));
    supabase.from("attendance_occurrences").select("*").eq("employee_id", id)
      .order("work_date", { ascending: false }).limit(50).then(({ data }) => setOcc(data ?? []));
    supabase.from("v_document_compliance").select("*").eq("employee_id", id)
      .then(({ data }) => setDocs(data ?? []));
    supabase.from("employee_compliance").select("*, compliance_requirements(name, authority, blocks_work)")
      .eq("employee_id", id).then(({ data }) => setComp(data ?? []));
    supabase.from("employee_schedules").select("*").eq("employee_id", id)
      .gte("work_date", new Date(Date.now() - 14*DAY).toISOString().slice(0,10))
      .order("work_date", { ascending: false }).limit(30).then(({ data }) => setSched(data ?? []));
  }, [id]);

  const lic = useMemo(() => {
    if (!p) return null;
    const d = daysTo(p.badge_expires);
    if (!p.metrc_agent_badge && d === null) return { tone:"bad", label:"No agent licence on file", sub:"Not registered with the Commission" };
    if (d !== null && d < 0)  return { tone:"bad",  label:`Licence expired ${Math.abs(d)} days ago`, sub:"Cannot legally be on the floor" };
    if (d !== null && d <= 30) return { tone:"bad",  label:`Licence expires in ${d} days`, sub:"Past the renewal window — renewal takes about three weeks" };
    if (d !== null && d <= 90) return { tone:"warn", label:`Licence expires in ${d} days`, sub:"Start the renewal" };
    if (d !== null)            return { tone:"ok",   label:"Licence valid", sub:`Valid to ${when(p.badge_expires)}` };
    return { tone:"warn", label:"Expiry unknown", sub:"Licence number held, no expiry recorded" };
  }, [p]);

  const points = occ.filter(o => o.status !== "excused" && (!o.clears_on || new Date(o.clears_on) > new Date()))
                    .reduce((s, o) => s + Number(o.points || 0), 0);

  async function startRenewal() {
    if (!p || !lic) return;
    setRenewState("saving"); setRenewMsg(null);
    const { error } = await supabase.from("hr_review_queue").insert({
      agent: RENEWAL_AGENT,
      kind: "agent_registration_renewal",
      employee_id: p.id,
      severity: lic.tone === "bad" ? "high" : "warn",
      headline: `Agent registration renewal — ${nameOf(p.full_name)}: ${lic.label}`,
      rationale: `${lic.sub}. Raised from this person's employee file. A Massachusetts agent registration renewal takes about three weeks.`,
      /* The file's own evidence, as it stands, so the person who picks this up
         is not re-deriving what this screen already had in front of it. */
      evidence: {
        raised_from: "employee_file",
        licence_label: lic.label,
        metrc_agent_badge: p.metrc_agent_badge ?? null,
        badge_expires: p.badge_expires ?? null,
        employee_code: p.employee_code ?? null,
        status: p.status ?? null,
      },
    });
    if (error) { setRenewState("idle"); setRenewMsg(`The renewal was NOT raised — ${error.message}`); return; }
    setRenewState("raised");
    setRenewMsg("Renewal raised. It is waiting on the Human Resources review queue.");
  }

  if (!p) return <div className="efload">Select a person…</div>;

  const active = String(p.status) === "active";

  return (
    <div className="empfile">
      <div className="efbar">
        <select value={id ?? ""} onChange={(e) => setId(e.target.value)}>
          {list.map(x => (
            <option key={x.id} value={x.id}>
              {nameOf(x.full_name)} · {x.employee_code}{String(x.status)!=="active" ? " (inactive)" : ""}
            </option>
          ))}
        </select>
        <button className="btn ghost small" onClick={() => go?.("people")}>Back to roster</button>
      </div>

      {/* Identity. Who this is, and whether they can work. */}
      <div className="efhead">
        <span className={`efav ${!active ? "off" : lic?.tone === "bad" ? "bad" : ""}`}>{initials(p.full_name)}</span>
        <div className="efwho">
          <h1>{nameOf(p.full_name)}</h1>
          <div className="efsub">
            {lk.roles[p.primary_role_id] ?? "No position set"}
            {lk.depts[p.primary_department_id] ? " · " + lk.depts[p.primary_department_id] : ""}
          </div>
          <div className="efids">
            <span><b>{p.login_id ?? "—"}</b>login ID</span>
            <span><b>{p.employee_code}</b>employee code</span>
            <span><b>{p.metrc_agent_badge ?? "—"}</b>agent licence</span>
            <span><b>{when(p.hired_on)}</b>hired</span>
          </div>
        </div>
        <div className="efstate">
          <span className={`schip ${active ? "ok" : "mute"}`}>{p.status}</span>
          {points > 0 && <span className="schip warn">{points} attendance points</span>}
        </div>
      </div>

      {/* What stops work leads the page, or is absent. */}
      {lic && lic.tone !== "ok" && (
        <div className={`efalert ${lic.tone}`}>
          <b>{lic.label}</b><span>{lic.sub}</span>
          {renewState === "raised" ? (
            <span className="schip ok" title="An agent registration renewal for this person is waiting on the Human Resources review queue. Raising a second one would not make it move faster.">Renewal raised</span>
          ) : (
            <button className="btn small" disabled={!canDecide || renewState === "saving"}
              title={canDecide
                ? "Raise an agent registration renewal on the Human Resources review queue, with this person's badge number and recorded expiry attached."
                : "Only an owner, executive, administrator, Human Resources or finance chief can raise a renewal. Ask one of them, or open Human Resources → Review Queue."}
              onClick={startRenewal}>
              {renewState === "saving" ? "Raising…" : "Start renewal"}
            </button>
          )}
          {renewMsg && <span role="status">{renewMsg}</span>}
        </div>
      )}

      <div className="eftabs">
        {["record","documents","compliance","schedule", canSeePay && "pay"].filter(Boolean).map(t => (
          <button key={t} className={tab===t ? "on" : ""} onClick={() => setTab(t)}>
            {t === "record" ? "Attendance" : t[0].toUpperCase()+t.slice(1)}
          </button>
        ))}
      </div>

      {tab === "record" && (
        <section className="efsec">
          <div className="efsechead"><h2>Attendance record</h2>
            <span className="efn">{points} points live · {occ.length} occurrences on file</span></div>
          {occ.length === 0 ? <div className="efempty">No attendance occurrences recorded.</div> : (
            <table className="eftable"><thead><tr>
              <th>Date</th><th>Type</th><th>Detail</th><th>Reason given</th>
              <th className="r">Points</th><th>Clears</th><th>Status</th></tr></thead>
              <tbody>{occ.map(o => (
                <tr key={o.id}>
                  <td>{when(o.work_date)}</td><td>{o.kind}</td>
                  <td>{o.minutes ? o.minutes + " min" : "—"}</td>
                  <td>{o.explanation || o.reason_code || "—"}</td>
                  <td className="r">{o.points}</td><td>{when(o.clears_on)}</td>
                  <td><span className={`schip ${o.status==="excused"?"mute":o.status==="upheld"?"bad":"warn"}`}>
                    {o.status}</span></td>
                </tr>))}</tbody></table>
          )}
        </section>
      )}

      {tab === "documents" && (
        <section className="efsec">
          <div className="efsechead"><h2>Documents &amp; acknowledgements</h2>
            <span className="efn">signatures are matched to the version signed</span></div>
          {docs.length === 0 ? <div className="efempty">No documents assigned to this person yet.</div> : (
            <table className="eftable"><thead><tr>
              <th>Document</th><th>Version</th><th>Progress</th><th>Signed</th><th>Due</th><th>State</th>
            </tr></thead><tbody>{docs.map(d => (
              <tr key={d.document_id}>
                <td>{d.title}</td><td>v{d.version}</td>
                <td>{d.sections ? `${d.sections_read}/${d.sections} sections` : "—"}</td>
                <td>{when(d.signed_at)}</td><td>{when(d.due_on)}</td>
                <td><span className={`schip ${d.state==="signed"?"ok":d.state==="overdue"?"bad":"warn"}`}>
                  {d.state}</span></td>
              </tr>))}</tbody></table>
          )}
        </section>
      )}

      {tab === "compliance" && (
        <section className="efsec">
          <div className="efsechead"><h2>Compliance &amp; training</h2></div>
          {comp.length === 0 ? <div className="efempty">No requirements assigned to this person yet.</div> : (
            <table className="eftable"><thead><tr>
              <th>Requirement</th><th>Authority</th><th>Granted</th><th>Expires</th><th>Blocks work</th><th>Status</th>
            </tr></thead><tbody>{comp.map(c => (
              <tr key={c.id}>
                <td>{c.compliance_requirements?.name ?? "—"}</td>
                <td>{c.compliance_requirements?.authority ?? "—"}</td>
                <td>{when(c.granted_on)}</td><td>{when(c.expires_on)}</td>
                <td>{c.compliance_requirements?.blocks_work ? "Yes" : "No"}</td>
                <td><span className={`schip ${c.status==="held"?"ok":c.status==="expired"?"bad":"warn"}`}>
                  {c.status}</span></td>
              </tr>))}</tbody></table>
          )}
        </section>
      )}

      {tab === "schedule" && (
        <section className="efsec">
          <div className="efsechead"><h2>Recent schedule</h2>
            <span className="efn">last 14 days forward</span></div>
          {sched.length === 0 ? <div className="efempty">Nothing scheduled — no posted schedule covers this person yet.</div> : (
            <table className="eftable"><thead><tr>
              <th>Date</th><th>Zone</th><th>Start</th><th>End</th><th>Status</th>
            </tr></thead><tbody>{sched.map(s => (
              <tr key={s.id}><td>{when(s.work_date)}</td><td>{s.zone ?? "—"}</td>
                <td>{s.planned_start ?? "—"}</td><td>{s.planned_end ?? "—"}</td>
                <td><span className="schip mute">{s.status ?? "—"}</span></td></tr>))}</tbody></table>
          )}
        </section>
      )}

      {tab === "pay" && canSeePay && (
        <section className="efsec">
          <div className="efsechead"><h2>Pay</h2>
            <span className="efn efwarn">Effective-dated. Visible to payroll roles only.</span></div>
          <div className="efpaynote">
            Hours basis: <b>{p.hours_basis}</b>
            {p.hours_basis === "weekly_minimum" && p.weekly_target_hours
              ? ` — contracted minimum ${p.weekly_target_hours} hours`
              : ` — target ${p.weekly_target_hours ?? "—"} hours`}
          </div>
          {rates.length === 0 ? <div className="efempty">No rate on file.</div> : (
            <table className="eftable"><thead><tr>
              <th>From</th><th>To</th><th>Basis</th><th className="r">Rate</th>
              <th className="r">OT ×</th><th className="r">Burden</th><th>Note</th>
            </tr></thead><tbody>{rates.map(r => (
              <tr key={r.id} className={!r.effective_to ? "efcurrent" : ""}>
                <td>{when(r.effective_from)}</td>
                <td>{r.effective_to ? when(r.effective_to) : "current"}</td>
                <td>{r.basis}</td><td className="r">{money(r.rate)}</td>
                <td className="r">{r.ot_multiplier ?? "—"}</td>
                <td className="r">{r.burden_pct != null ? Math.round(r.burden_pct*100)+"%" : "—"}</td>
                <td>{r.note ?? "—"}</td>
              </tr>))}</tbody></table>
          )}
        </section>
      )}
    </div>
  );
}
