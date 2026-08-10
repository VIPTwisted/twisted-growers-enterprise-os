/* ---------------------------------------------------------------------------
   ONBOARDING CONSOLE — the go-live tool.

   Owner, 10 Aug 2026: employee data does not exist until we deploy live and
   onboard. So this is the page that turns an empty module into a running one.
   Everything else in Human Resources waits on what happens here.

   One person, one pass, in the order the law and the floor require:

     1. Who they are            name, department, role, manager
     2. How they are paid       basis, weekly target, and the REAL rate
     3. How they clock in       required or exempt, then a PIN or a badge
     4. What they must do       the statutory checklist, raised automatically
     5. Welcome                 drafted, never sent by the machine

   Two things this page will not do:

     - It will not let an agent invent a wage. The rate box is empty and stays
       empty until a person types one. Every rate currently in the database is
       a planning placeholder and is shown as such.

     - It will not send the welcome. ALL HR REQUIRES HUMAN, and the owner
       included reminders. The welcome is drafted into hr_review_queue for a
       person to read and send.
--------------------------------------------------------------------------- */
import React, { useCallback, useEffect, useState } from "react";
import { supabase } from "./lib/supabase.js";

const nameOf = (n) => { const [l = "", r = ""] = String(n || "").split(","); return r.trim() ? `${r.trim()} ${l.trim()}` : l.trim(); };

export default function Onboard({ go }) {
  const [staff, setStaff] = useState([]);
  const [depts, setDepts] = useState([]);
  const [roles, setRoles] = useState([]);
  const [conf, setConf] = useState(null);
  const [canDo, setCanDo] = useState(false);
  const [sel, setSel] = useState("");
  const [emp, setEmp] = useState(null);
  const [steps, setSteps] = useState([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  const [f, setF] = useState({
    department_id: "", primary_role_id: "", manager_id: "",
    hours_basis: "shift", weekly_target_hours: "", requires_clock_in: true,
    rate: "", basis: "hourly", pin: "", badge_code: "", email: "",
  });

  const load = useCallback(async () => {
    const [s, d, r, c, k] = await Promise.all([
      supabase.from("employees").select("id, full_name, employee_code, login_id, status, pin_set_at, primary_department_id, primary_role_id, manager_id, hours_basis, weekly_target_hours, requires_clock_in, email, badge_code").order("full_name"),
      supabase.from("departments").select("id, name").order("name"),
      supabase.from("roles_catalog").select("id, name").order("name"),
      supabase.from("v_rate_confidence").select("*").maybeSingle(),
      supabase.rpc("f_can_decide_hr"),
    ]);
    setStaff(s.data ?? []); setDepts(d.data ?? []); setRoles(r.data ?? []);
    setConf(c.data ?? null); setCanDo(!!k.data);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function pick(id) {
    setSel(id); setMsg(null);
    if (!id) { setEmp(null); setSteps([]); return; }
    const e = staff.find(x => x.id === id);
    setEmp(e);
    setF(v => ({ ...v,
      department_id: e.primary_department_id ?? "", primary_role_id: e.primary_role_id ?? "",
      manager_id: e.manager_id ?? "", hours_basis: e.hours_basis ?? "shift",
      weekly_target_hours: e.weekly_target_hours ?? "",
      requires_clock_in: e.requires_clock_in ?? true,
      email: e.email ?? "", rate: "", pin: "", badge_code: e.badge_code ?? "",
    }));
    const { data } = await supabase.from("v_lifecycle_open").select("*")
      .eq("employee_id", id).eq("phase", "onboarding");
    setSteps(data ?? []);
  }

  const set = (k) => (e) => setF(v => ({ ...v, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));

  async function saveBasics() {
    setBusy(true); setMsg(null);
    const { error } = await supabase.from("employees").update({
      primary_department_id: f.department_id || null,
      primary_role_id: f.primary_role_id || null,
      manager_id: f.manager_id || null,
      hours_basis: f.hours_basis,
      weekly_target_hours: f.weekly_target_hours === "" ? null : Number(f.weekly_target_hours),
      requires_clock_in: f.requires_clock_in,
      email: f.email.trim() || null,
      status: "active",
    }).eq("id", sel);
    setBusy(false);
    setMsg(error ? error.message : "Saved. They are active and can be scheduled once the blocking steps are done.");
    if (!error) { load(); pick(sel); }
  }

  async function saveRate() {
    const n = Number(f.rate);
    if (!f.rate || !isFinite(n) || n <= 0) { setMsg("Type the real approved rate. Nothing is filled in for you."); return; }
    setBusy(true); setMsg(null);
    const uid = (await supabase.auth.getUser()).data?.user?.id ?? null;
    /* Close any open placeholder, then open a real, approved, non-placeholder row. */
    await supabase.from("employee_rates")
      .update({ effective_to: new Date(Date.now() - 864e5).toISOString().slice(0, 10) })
      .eq("employee_id", sel).is("effective_to", null);
    const { error } = await supabase.from("employee_rates").insert({
      employee_id: sel, basis: f.basis, rate: n,
      effective_from: new Date().toISOString().slice(0, 10),
      approved_by: uid, is_placeholder: false,
      note: "Approved at onboarding",
    });
    setBusy(false);
    setMsg(error ? error.message : "Rate approved. It is no longer a placeholder, and labour cost for this person is now real.");
    if (!error) { setF(v => ({ ...v, rate: "" })); load(); }
  }

  async function savePin() {
    if (!/^[0-9]{4,8}$/.test(f.pin)) { setMsg("A PIN is 4 to 8 digits."); return; }
    setBusy(true); setMsg(null);
    const { error } = await supabase.rpc("f_set_punch_pin", { p_employee_id: sel, p_pin: f.pin });
    setBusy(false);
    setMsg(error ? error.message
      : "PIN set. Tell them in the room — it is hashed and cannot be read back.");
    if (!error) { setF(v => ({ ...v, pin: "" })); load(); pick(sel); }
  }

  async function startChecklist() {
    setBusy(true); setMsg(null);
    const { data, error } = await supabase.rpc("f_start_lifecycle", {
      p_employee_id: sel, p_phase: "onboarding", p_anchor: new Date().toISOString().slice(0, 10),
    });
    setBusy(false);
    setMsg(error ? error.message : `Checklist raised — ${data} steps, each with its own due date.`);
    if (!error) pick(sel);
  }

  async function markStep(s) {
    setBusy(true);
    const uid = (await supabase.auth.getUser()).data?.user?.id ?? null;
    await supabase.from("lifecycle_progress")
      .update({ done_at: new Date().toISOString(), done_by: uid }).eq("id", s.id);
    setBusy(false); pick(sel);
  }

  async function draftWelcome() {
    setBusy(true); setMsg(null);
    const who = nameOf(emp.full_name);
    const { error } = await supabase.from("hr_message").insert({
      employee_id: sel,
      audience: null,
      kind: "welcome",
      subject: `Welcome to Twisted Growers, ${who.split(" ")[0]}`,
      body:
`${who},

Welcome to Twisted Growers.

Your sign-in ID is ${emp.login_id ?? "—"}. ${f.requires_clock_in
  ? "You clock in at the wall terminal with that ID and the PIN you were given. Clock in no more than five minutes before your shift starts, and be in your zone ready to work at the start."
  : "You are not required to clock in."}

Open "My Week" to see your shift, your hours and anything waiting for you to
read and sign. Everything about you that we hold, you can see.

If anything on this page looks wrong, tell Human Resources — do not work around it.`,
    });
    setBusy(false);
    setMsg(error ? error.message
      : "Welcome drafted. It is NOT sent — it waits in the review queue for a person to read and send, reminders included.");
  }

  const blocking = steps.filter(s => s.blocks_start);
  const rateIsPlaceholder = conf?.any_placeholder;

  return (
    <div className="ob">
      <div className="obhead">
        <div>
          <h1>Onboarding</h1>
          <div className="obsub">One person, one pass — who they are, how they are paid, how they clock in, what they must do.</div>
        </div>
        <button className="btn ghost small" onClick={() => go?.("lifecycle_open")}>All outstanding steps</button>
      </div>

      {rateIsPlaceholder && (
        <div className="obwarn">
          <b>{conf.placeholder_rates} of {conf.rates_total} wage rates are planning placeholders.</b>
          {conf.disclosure} Approving a real rate below removes that person from the count.
        </div>)}

      {!canDo && <div className="obwarn">You can view this page but not change it.</div>}
      {msg && <div className="obmsg">{msg}</div>}

      <div className="obpick">
        <label>Person</label>
        <select value={sel} onChange={(e) => pick(e.target.value)}>
          <option value="">Choose someone to onboard…</option>
          {staff.map(s => (
            <option key={s.id} value={s.id}>
              {nameOf(s.full_name)} · {s.employee_code}
              {String(s.status) !== "active" ? " — inactive" : ""}
              {s.pin_set_at ? " · has PIN" : ""}
            </option>))}
        </select>
      </div>

      {emp && (
        <>
          {/* 1 — Who they are */}
          <section className="obcard">
            <h2><span>1</span>Who they are</h2>
            <div className="obgrid">
              <div className="obf"><label>Department</label>
                <select value={f.department_id} onChange={set("department_id")} disabled={!canDo}>
                  <option value="">Not set</option>
                  {depts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select></div>
              <div className="obf"><label>Position</label>
                <select value={f.primary_role_id} onChange={set("primary_role_id")} disabled={!canDo}>
                  <option value="">Not set</option>
                  {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select></div>
              <div className="obf"><label>Manager</label>
                <select value={f.manager_id} onChange={set("manager_id")} disabled={!canDo}>
                  <option value="">Not set</option>
                  {staff.filter(x => x.id !== sel).map(x =>
                    <option key={x.id} value={x.id}>{nameOf(x.full_name)}</option>)}
                </select>
                <i>Decides who approves their time and their write-ups.</i></div>
              <div className="obf"><label>Work email</label>
                <input value={f.email} onChange={set("email")} placeholder="name@twistedgrowers.com" disabled={!canDo} /></div>
            </div>
            <button className="btn" disabled={busy || !canDo} onClick={saveBasics}>Save and activate</button>
          </section>

          {/* 2 — How they are paid */}
          <section className="obcard">
            <h2><span>2</span>How they are paid</h2>
            <div className="obgrid">
              <div className="obf"><label>Hours basis</label>
                <select value={f.hours_basis} onChange={set("hours_basis")} disabled={!canDo}>
                  <option value="shift">Paid per shift — overtime above the weekly threshold</option>
                  <option value="weekly_minimum">Salaried with a contracted weekly minimum</option>
                  <option value="exempt">Exempt — not measured on hours</option>
                </select></div>
              <div className="obf"><label>Weekly target hours</label>
                <input type="number" min="0" max="80" step="0.5" value={f.weekly_target_hours}
                  onChange={set("weekly_target_hours")} disabled={!canDo} />
                <i>45 or 50 for salaried staff on a contracted minimum.</i></div>
              <div className="obf"><label>Rate basis</label>
                <select value={f.basis} onChange={set("basis")} disabled={!canDo}>
                  <option value="hourly">Hourly</option>
                  <option value="weekly_salary">Weekly salary</option>
                </select></div>
              <div className="obf"><label>Approved rate</label>
                <input type="number" min="0" step="0.01" value={f.rate} onChange={set("rate")}
                  placeholder="Type the real rate" disabled={!canDo} />
                <i>Nothing is filled in for you. A wage is an owner decision.</i></div>
            </div>
            <button className="btn" disabled={busy || !canDo} onClick={saveRate}>Approve this rate</button>
          </section>

          {/* 3 — How they clock in */}
          <section className="obcard">
            <h2><span>3</span>How they clock in</h2>
            <label className="obcheck">
              <input type="checkbox" checked={f.requires_clock_in} onChange={set("requires_clock_in")} disabled={!canDo} />
              Required to clock in
            </label>
            {f.requires_clock_in ? (
              <div className="obgrid">
                <div className="obf"><label>Sign-in ID</label>
                  <input value={emp.login_id ?? "not generated"} readOnly />
                  <i>Generated automatically. This is what they type at the terminal.</i></div>
                <div className="obf"><label>Terminal PIN</label>
                  <input type="password" inputMode="numeric" maxLength={8} value={f.pin}
                    onChange={set("pin")} placeholder="4–8 digits" disabled={!canDo} />
                  <i>{emp.pin_set_at ? "A PIN is already set. Typing a new one replaces it." : "No PIN yet — they cannot clock in."}</i></div>
              </div>
            ) : (
              <p className="obp">Not on a clock. They raise no attendance occurrences and need no PIN.</p>
            )}
            {f.requires_clock_in && <button className="btn" disabled={busy || !canDo} onClick={savePin}>Set PIN</button>}
          </section>

          {/* 4 — The checklist */}
          <section className="obcard">
            <h2><span>4</span>What must happen</h2>
            {steps.length === 0 ? (
              <>
                <p className="obp">No checklist raised for this person yet.</p>
                <button className="btn" disabled={busy || !canDo} onClick={startChecklist}>Raise the onboarding checklist</button>
              </>
            ) : (
              <>
                {blocking.length > 0 && (
                  <div className="obblock">
                    <b>{blocking.length} step{blocking.length === 1 ? "" : "s"} must be done before they can be scheduled.</b>
                    The database refuses a shift until then — this is enforced, not advisory.
                  </div>)}
                <div className="obsteps">
                  {steps.map(s => (
                    <div className={`obstep ${s.blocks_start ? "blocks" : ""} ${s.overdue ? "late" : ""}`} key={s.id}>
                      <span className="obn">{s.ordinal}</span>
                      <span className="obt"><b>{s.title}</b><i>{s.detail}</i></span>
                      {s.is_legal && <span className="schip bad">legal</span>}
                      {s.blocks_start && <span className="schip warn">blocks start</span>}
                      <button className="btn ghost small" disabled={busy || !canDo}
                        onClick={() => markStep(s)}>Done</button>
                    </div>))}
                </div>
              </>)}
          </section>

          {/* 5 — Welcome */}
          <section className="obcard">
            <h2><span>5</span>Welcome them</h2>
            <p className="obp">
              The welcome is <b>drafted, never sent by the machine</b>. It waits in the review
              queue for a person to read and send — the owner&rsquo;s ruling covers reminders too.
            </p>
            <button className="btn" disabled={busy || !canDo} onClick={draftWelcome}>Draft the welcome</button>
          </section>
        </>)}
    </div>
  );
}
