/* ---------------------------------------------------------------------------
   THE ROSTER
   Owner, 8 Aug 2026: "DO NOT EVER USE ONE TEMPLATE FOR EVERY PAGE."

   So this is not a table with a filter bar on top. A roster answers three
   questions, in this order:

     1. Who cannot legally work right now?   ← leads the page, impossible to miss
     2. Who is on the roster, by department?
     3. Who is missing something (login, badge, department)?

   A Massachusetts agent registration that lapses is a stop, not a warning:
   that person cannot be on the floor. So licence state outranks employment
   status in the visual hierarchy, and it is red, not amber.

   Shares primitives with the rest of the platform — .schip, .btn, .pill,
   the tokens — and shares no layout with anything.
--------------------------------------------------------------------------- */
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "./lib/supabase.js";

const DAY = 86400000;
const daysUntil = (d) => (d ? Math.round((new Date(d + "T00:00:00") - new Date().setHours(0, 0, 0, 0)) / DAY) : null);

/* One derived judgement per person, used by the band, the chip and the sort.
   Computed once here rather than three times at three call sites. */
function licenceState(p) {
  const d = daysUntil(p.badge_expires);
  if (!p.metrc_agent_badge && d === null) return { key: "none", rank: 1, tone: "bad", label: "No agent licence", detail: "Not registered with the CCC" };
  if (d !== null && d < 0) return { key: "expired", rank: 0, tone: "bad", label: "Licence expired", detail: `Lapsed ${Math.abs(d)} days ago` };
  if (d !== null && d <= 30) return { key: "urgent", rank: 2, tone: "bad", label: `Expires in ${d} days`, detail: "Past the renewal window — renewal takes about 3 weeks" };
  if (d !== null && d <= 90) return { key: "soon", rank: 3, tone: "warn", label: `Expires in ${d} days`, detail: "Start the renewal" };
  if (d !== null) return { key: "ok", rank: 9, tone: "ok", label: "Licensed", detail: `Valid to ${p.badge_expires}` };
  return { key: "unknown", rank: 4, tone: "warn", label: "Expiry unknown", detail: "Licence number held, no expiry recorded" };
}

const initials = (name) => {
  const [last = "", rest = ""] = String(name || "").split(",");
  return ((rest.trim()[0] || "") + (last.trim()[0] || "")).toUpperCase() || "?";
};
const displayName = (name) => {
  const [last = "", rest = ""] = String(name || "").split(",");
  return rest.trim() ? `${rest.trim()} ${last.trim()}` : last.trim();
};

/* THE RENEWAL BUTTON, WIRED 15 AUG 2026.
   It was `<button className="btn small">Start renewal</button>` — no handler,
   on the card of a person who CANNOT LEGALLY BE ON THE FLOOR. Pressed, it did
   nothing, which to a non-technical reader is indistinguishable from "I have
   started it". The most consequential inert control in the product.

   It now raises a real row on the Human Resources review queue, the same queue
   hrqueue.jsx works from, tagged to the hr_compliance agent that queue already
   recognises. The evidence carries the badge number and the expiry so whoever
   picks it up is not re-deriving what this screen already knew.

   WHO MAY PRESS IT. hr_review_queue's insert policy is f_can_decide_hr(), so
   anybody else would get a row-level-security refusal presented as a failure of
   their own. The button is therefore disabled for them and SAYS WHY — which is
   rule A3 done properly, not a dead control. */
const RENEWAL_AGENT = "hr_compliance";

export default function Roster() {
  const [people, setPeople] = useState(null);
  const [lk, setLk] = useState({ roles: {}, depts: {} });
  const [logins, setLogins] = useState(new Set());
  const [q, setQ] = useState("");
  const [dept, setDept] = useState("");
  const [show, setShow] = useState("active");   /* active | all | attention */
  const [canDo, setCanDo] = useState(false);
  const [raised, setRaised] = useState(new Set());
  const [busyId, setBusyId] = useState(null);
  const [renewMsg, setRenewMsg] = useState(null);

  /* May this person raise the item, and which renewals are already waiting?
     `error` is bound on both: a refusal that reads as "nothing is queued" would
     have somebody raise a second item for a renewal already in hand. */
  useEffect(() => {
    let live = true;
    supabase.rpc("f_can_decide_hr").then(({ data, error }) => {
      if (!live) return;
      if (error) { setRenewMsg(`Could not check whether you may raise a renewal: ${error.message}`); return; }
      setCanDo(data === true);
      if (data !== true) return;
      supabase.from("hr_review_queue")
        .select("employee_id").eq("agent", RENEWAL_AGENT).eq("status", "pending")
        .then(({ data: q2, error: e2 }) => {
          if (!live) return;
          if (e2) { setRenewMsg(`Could not read the renewals already queued: ${e2.message}`); return; }
          setRaised(new Set((Array.isArray(q2) ? q2 : []).map((x) => x.employee_id).filter(Boolean)));
        });
    });
    return () => { live = false; };
  }, []);

  async function startRenewal(r) {
    setBusyId(r.id); setRenewMsg(null);
    const { error } = await supabase.from("hr_review_queue").insert({
      agent: RENEWAL_AGENT,
      kind: "agent_registration_renewal",
      employee_id: r.id,
      severity: r.lic.key === "expired" || r.lic.key === "none" ? "high" : "warn",
      headline: `Agent registration renewal — ${r.name}: ${r.lic.label}`,
      rationale: `${r.lic.detail}. Raised from the roster, where this person is shown as unable to legally be on the floor. A Massachusetts agent registration renewal takes about three weeks.`,
      /* The screen's own evidence, so nobody re-derives it. Never a summary of
         it — the badge number and the recorded expiry, as they stand. */
      evidence: {
        raised_from: "roster",
        licence_state: r.lic.key,
        metrc_agent_badge: r.metrc_agent_badge ?? null,
        badge_expires: r.badge_expires ?? null,
        employee_code: r.employee_code ?? null,
        position: r.role ?? null,
        department: r.dept ?? null,
      },
    });
    setBusyId(null);
    if (error) { setRenewMsg(`${r.name}: the renewal was NOT raised — ${error.message}`); return; }
    setRaised((s) => new Set(s).add(r.id));
    setRenewMsg(`Renewal raised for ${r.name}. It is waiting on the Human Resources review queue.`);
  }

  useEffect(() => {
    Promise.all([
      supabase.from("employees").select("*").order("full_name"),
      supabase.from("roles_catalog").select("id, name"),
      supabase.from("departments").select("id, name"),
      supabase.from("app_users").select("employee_id"),
    ]).then(([e, r, d, u]) => {
      setLk({
        roles: Object.fromEntries((r.data ?? []).map((x) => [x.id, x.name])),
        depts: Object.fromEntries((d.data ?? []).map((x) => [x.id, x.name])),
      });
      setLogins(new Set((u.data ?? []).map((x) => x.employee_id).filter(Boolean)));
      setPeople(e.data ?? []);
    });
  }, []);

  const rows = useMemo(() => (people ?? []).map((p) => {
    const lic = licenceState(p);
    const active = String(p.status) === "active";
    return {
      ...p,
      lic,
      active,
      name: displayName(p.full_name),
      role: lk.roles[p.primary_role_id] ?? null,
      dept: lk.depts[p.primary_department_id] ?? null,
      hasLogin: logins.has(p.id),
      /* Only an ACTIVE person with a licence problem is a blocker. An
         inactive person with a lapsed badge is just history. */
      blocked: active && (lic.tone === "bad"),
    };
  }), [people, lk, logins]);

  const blockers = rows.filter((r) => r.blocked).sort((a, b) => a.lic.rank - b.lic.rank);
  const depts = [...new Set(rows.map((r) => r.dept).filter(Boolean))].sort();

  const visible = rows
    .filter((r) => (show === "all" ? true : show === "attention" ? r.blocked || (r.active && !r.hasLogin) : r.active))
    .filter((r) => !dept || r.dept === dept)
    .filter((r) => !q || `${r.employee_code} ${r.name} ${r.role ?? ""} ${r.dept ?? ""} ${r.email ?? ""} ${r.login_id ?? ""}`
      .toLowerCase().includes(q.toLowerCase()));

  /* Grouped by department — a roster is read by team, not alphabetically
     across the whole company. */
  const grouped = useMemo(() => {
    const g = new Map();
    for (const r of visible) {
      const k = r.dept ?? "No department set";
      if (!g.has(k)) g.set(k, []);
      g.get(k).push(r);
    }
    return [...g.entries()].sort((a, b) =>
      a[0] === "No department set" ? 1 : b[0] === "No department set" ? -1 : a[0].localeCompare(b[0]));
  }, [visible]);

  const counts = {
    active: rows.filter((r) => r.active).length,
    inactive: rows.filter((r) => !r.active).length,
    noLogin: rows.filter((r) => r.active && !r.hasLogin).length,
  };

  const exportCSV = () => {
    const head = ["Code", "Login ID", "Name", "Position", "Department", "Status", "Agent licence", "Expires", "Days left", "Email"];
    const line = (r) => [r.employee_code, r.login_id, r.name, r.role, r.dept, r.status,
      r.metrc_agent_badge, r.badge_expires, daysUntil(r.badge_expires), r.email]
      .map((v) => `"${String(v ?? "").replaceAll('"', '""')}"`).join(",");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([[head.join(","), ...visible.map(line)].join("\n")], { type: "text/csv" }));
    a.download = "roster.csv"; a.click();
  };

  if (people === null) return <div className="rosterload">Loading the roster…</div>;

  return (
    <div className="roster">
      <div className="rosterhead">
        <div>
          <h1>Roster</h1>
          <div className="sub">
            <b>{counts.active}</b> active · <b>{counts.inactive}</b> inactive ·
            licence state from Metrc, checked against today
          </div>
        </div>
        <div className="rosteract">
          <button className="btn ghost small" onClick={exportCSV}>Export CSV</button>
          <button className="btn ghost small" onClick={() => window.print()}>Print</button>
        </div>
      </div>

      {/* 1. Who cannot legally work. Leads the page, or is absent entirely. */}
      {blockers.length > 0 && (
        <section className="blockband">
          <div className="bbhead">
            <span className="bbdot" />
            <b>{blockers.length} {blockers.length === 1 ? "person" : "people"} cannot legally be on the floor</b>
            <span className="bbsub">Massachusetts agent registration · renewal takes about three weeks</span>
          </div>
          <div className="bbgrid">
            {blockers.map((r) => (
              <div className="bbcard" key={r.id}>
                <span className="av bad">{initials(r.full_name)}</span>
                <div className="bbtext">
                  <b>{r.name}</b>
                  <span>{r.role ?? "No position set"}{r.dept ? ` · ${r.dept}` : ""}</span>
                  <span className="bbwhy">{r.lic.label} — {r.lic.detail}</span>
                </div>
                {raised.has(r.id) ? (
                  <span className="schip ok" title="An agent registration renewal is already waiting on the Human Resources review queue for this person. Raising a second one would not make it move faster.">Renewal raised</span>
                ) : (
                  <button className="btn small" disabled={!canDo || busyId === r.id}
                    title={canDo
                      ? "Raise an agent registration renewal on the Human Resources review queue, with this person's badge number and expiry attached."
                      : "Only an owner, executive, administrator, Human Resources or finance chief can raise a renewal. Ask one of them, or open Human Resources → Review Queue."}
                    onClick={() => startRenewal(r)}>
                    {busyId === r.id ? "Raising…" : "Start renewal"}
                  </button>
                )}
              </div>
            ))}
          </div>
          {renewMsg && <div className="bbmsg" role="status">{renewMsg}</div>}
        </section>
      )}

      {/* 2. Controls. Segmented, because the default view is "who works here". */}
      <div className="rosterbar">
        <div className="seg">
          <button className={show === "active" ? "on" : ""} onClick={() => setShow("active")}>Active {counts.active}</button>
          <button className={show === "attention" ? "on" : ""} onClick={() => setShow("attention")}>
            Needs attention {blockers.length + counts.noLogin}
          </button>
          <button className={show === "all" ? "on" : ""} onClick={() => setShow("all")}>Everyone {rows.length}</button>
        </div>
        <input className="rsearch" placeholder="Name, code, position, email…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={dept} onChange={(e) => setDept(e.target.value)}>
          <option value="">All departments</option>
          {depts.map((d) => <option key={d}>{d}</option>)}
        </select>
      </div>

      {/* 3. The roster, by team. */}
      {visible.length === 0 ? (
        <div className="rosterempty">
          <b>Nobody matches</b>
          <span>{show === "attention" ? "Nothing needs attention — every active person is licensed and has a login." : "Try a different filter."}</span>
        </div>
      ) : grouped.map(([team, list]) => (
        <section className="team" key={team}>
          <div className="teamhead">
            <h2>{team}</h2>
            <span className="teamn">{list.length}</span>
          </div>
          <div className="teamlist">
            {list.map((r) => (
              <article className={`prow ${r.blocked ? "prow-bad" : ""} ${!r.active ? "prow-off" : ""}`} key={r.id}>
                <span className={`av ${r.blocked ? "bad" : r.active ? "" : "off"}`}>{initials(r.full_name)}</span>

                <div className="pid">
                  <b>{r.name}</b>
                  <span>{r.role ?? "No position set"}</span>
                </div>

                <div className="pcode">
                  <span className="k">ID</span>
                  <b>{r.login_id ?? "—"}</b>
                  <span className="k2">{r.employee_code}</span>
                </div>

                <div className="plic">
                  <span className={`schip ${r.lic.tone === "bad" ? "bad" : r.lic.tone === "warn" ? "warn" : "ok"}`}>
                    {r.lic.label}
                  </span>
                  {r.metrc_agent_badge && <span className="licno">{r.metrc_agent_badge}</span>}
                </div>

                <div className="plogin">
                  {r.hasLogin
                    ? <span className="schip ok">Has login</span>
                    : <span className="schip mute">No login</span>}
                </div>

                <div className="pstat">
                  <span className={`schip ${r.active ? "ok" : "mute"}`}>{r.status}</span>
                </div>
              </article>
            ))}
          </div>
        </section>
      ))}

      {counts.noLogin > 0 && (
        <div className="rosternote">
          <b>{counts.noLogin} active {counts.noLogin === 1 ? "person has" : "people have"} no system login.</b>{" "}
          They cannot clock in, see a schedule, or acknowledge a notice until invited.
        </div>
      )}
    </div>
  );
}
