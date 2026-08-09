/* ---------------------------------------------------------------------------
   HUMAN RESOURCES DASHBOARD
   Owner, 8 Aug 2026: better than Deputy and When I Work.

   Those tools answer "who is working today". They are scheduling products
   with an HR tab bolted on. This company's HR problem is different and
   harder: an agent whose Massachusetts registration lapses CANNOT LEGALLY
   BE ON THE FLOOR, and no general workforce app models that at all.

   So this page leads with legal readiness, not headcount:

     1. Who cannot work right now, and who is about to fall off a cliff
     2. The licence horizon — twelve months of expiries, at a glance
     3. Cost and capacity, by department
     4. Onboarding — who cannot even sign in yet

   Rule 2: every tile assigns, carrying the number as it stood.
   Rule 3: every tile drills into the records beneath it.
   Every figure is computed live. Nothing here is typed in.
--------------------------------------------------------------------------- */
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "./lib/supabase.js";
import { AssignTask } from "./App.jsx";

const DAY = 86400000;
const days = (d) => (d ? Math.round((new Date(d + "T00:00:00") - new Date().setHours(0, 0, 0, 0)) / DAY) : null);
const money = (n) => (n == null ? "—" : "$" + Math.round(n).toLocaleString());
const initials = (n) => {
  const [l = "", r = ""] = String(n || "").split(",");
  return ((r.trim()[0] || "") + (l.trim()[0] || "")).toUpperCase() || "?";
};
const nameOf = (n) => {
  const [l = "", r = ""] = String(n || "").split(",");
  return r.trim() ? `${r.trim()} ${l.trim()}` : l.trim();
};

/* The licence bucket drives the band, the horizon and the tile colours. */
function bucket(d) {
  if (d === null) return "unknown";
  if (d < 0) return "expired";
  if (d <= 30) return "urgent";
  if (d <= 90) return "soon";
  return "ok";
}

export default function HrDashboard({ go }) {
  const [emp, setEmp] = useState(null);
  const [cost, setCost] = useState([]);
  const [cap, setCap] = useState([]);
  const [logins, setLogins] = useState(new Set());
  const [depts, setDepts] = useState({});
  const [assign, setAssign] = useState(null);

  useEffect(() => {
    Promise.all([
      supabase.from("employees").select("*"),
      supabase.from("v_payroll_forecast").select("*"),
      supabase.from("v_employee_capacity").select("*"),
      supabase.from("app_users").select("employee_id"),
      supabase.from("departments").select("id, name"),
    ]).then(([e, p, c, u, d]) => {
      setEmp(e.data ?? []);
      setCost(p.data ?? []);
      setCap(c.data ?? []);
      setLogins(new Set((u.data ?? []).map((x) => x.employee_id).filter(Boolean)));
      setDepts(Object.fromEntries((d.data ?? []).map((x) => [x.id, x.name])));
    });
  }, []);

  const m = useMemo(() => {
    if (!emp) return null;
    const active = emp.filter((e) => String(e.status) === "active");
    const withLic = active.map((e) => ({ ...e, d: days(e.badge_expires), b: bucket(days(e.badge_expires)) }));
    const blocked = withLic.filter((e) => e.b === "expired" || e.b === "unknown");
    const urgent = withLic.filter((e) => e.b === "urgent").sort((a, b) => a.d - b.d);
    const soon = withLic.filter((e) => e.b === "soon").sort((a, b) => a.d - b.d);
    const noLogin = active.filter((e) => !logins.has(e.id));
    const weekly = cost.reduce((s, r) => s + Number(r.loaded_weekly_cost ?? 0), 0);
    const annual = cost.reduce((s, r) => s + Number(r.annualized_loaded_cost ?? 0), 0);
    const capacity = cap.reduce((s, r) => s + Number(r.weekly_capacity_hours ?? 0), 0);

    /* By department, from the employee record — the cost view carries a
       joined department string, which double-counts anyone in two. */
    const byDept = new Map();
    for (const e of active) {
      const k = depts[e.primary_department_id] ?? "No department";
      if (!byDept.has(k)) byDept.set(k, { n: 0, hrs: 0, cost: 0, risk: 0 });
      const row = byDept.get(k);
      row.n += 1;
      const cr = cost.find((c) => c.employee_code === e.employee_code);
      const cp = cap.find((c) => c.employee_code === e.employee_code);
      row.cost += Number(cr?.loaded_weekly_cost ?? 0);
      row.hrs += Number(cp?.weekly_capacity_hours ?? 0);
      const bb = bucket(days(e.badge_expires));
      if (bb === "expired" || bb === "urgent" || bb === "unknown") row.risk += 1;
    }

    /* Twelve months of expiries, by month. Nobody else builds this because
       nobody else has a regulator who can stop a shift. */
    const horizon = [];
    const now = new Date();
    for (let i = 0; i < 12; i++) {
      const dt = new Date(now.getFullYear(), now.getMonth() + i, 1);
      const key = dt.toISOString().slice(0, 7);
      const people = active.filter((e) => (e.badge_expires ?? "").slice(0, 7) === key);
      horizon.push({
        key,
        label: dt.toLocaleDateString(undefined, { month: "short" }),
        year: dt.getFullYear(),
        n: people.length,
        people,
        hot: i === 0 || i === 1,
      });
    }
    const peak = Math.max(1, ...horizon.map((h) => h.n));

    return { active, blocked, urgent, soon, noLogin, weekly, annual, capacity,
      byDept: [...byDept.entries()].sort((a, b) => b[1].n - a[1].n), horizon, peak,
      inactive: emp.length - active.length, total: emp.length };
  }, [emp, cost, cap, logins, depts]);

  if (!m) return <div className="hrload">Loading Human Resources…</div>;

  const tile = (key, label, value, unit, tone, foot, drill) => (
    <div className={`hrt ${tone}`} onClick={() => drill && go?.(drill)}>
      <button className="hrassign" onClick={(ev) => { ev.stopPropagation(); setAssign({ kpi: label, value, unit, drill }); }}>
        Assign
      </button>
      <div className="hrtl">{label}</div>
      <div className="hrtv">{value}<span className="hrtu">{unit}</span></div>
      <div className="hrtf">{foot}</div>
    </div>
  );

  return (
    <div className="hrdash">
      <div className="hrhead">
        <div>
          <h1>Human Resources</h1>
          <div className="sub">
            Legal readiness first. <b>{m.active.length}</b> active of <b>{m.total}</b> ·
            every figure computed live from the records
          </div>
        </div>
        <div className="hrheadact">
          <button className="btn ghost small" onClick={() => go?.("people")}>Open the roster</button>
          <button className="btn ghost small" onClick={() => go?.("hr_review_queue")}>Review queue</button>
        </div>
      </div>

      {/* 1 — THE CLIFF. Anyone who cannot legally work, or is about to. */}
      {(m.blocked.length > 0 || m.urgent.length > 0) && (
        <section className="cliff">
          <div className="cliffhead">
            <span className="cdot" />
            <b>
              {m.blocked.length > 0 && `${m.blocked.length} cannot legally work`}
              {m.blocked.length > 0 && m.urgent.length > 0 && " · "}
              {m.urgent.length > 0 && `${m.urgent.length} past the renewal window`}
            </b>
            <span className="cliffsub">Massachusetts renewal takes about three weeks</span>
          </div>
          <div className="cliffgrid">
            {[...m.blocked, ...m.urgent].slice(0, 8).map((e) => (
              <div className={`cliffcard ${e.b}`} key={e.id}>
                <span className="cav">{initials(e.full_name)}</span>
                <div className="ctext">
                  <b>{nameOf(e.full_name)}</b>
                  <span>{depts[e.primary_department_id] ?? "No department"}</span>
                </div>
                <div className="cwhen">
                  <b>{e.d === null ? "—" : e.d < 0 ? `${Math.abs(e.d)}d ago` : `${e.d}d`}</b>
                  <span>{e.b === "expired" ? "lapsed" : e.b === "unknown" ? "no licence" : "left"}</span>
                </div>
                <button className="btn small" onClick={() => setAssign({ kpi: `Renew agent registration — ${nameOf(e.full_name)}`, value: e.d ?? 0, unit: "days", drill: "people" })}>
                  Assign
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 2 — The numbers that matter. Every one assigns and drills. */}
      <div className="hrtiles">
        {tile("ready", "Legally ready to work", m.active.length - m.blocked.length - m.urgent.length, `of ${m.active.length}`,
          m.blocked.length + m.urgent.length > 0 ? "warn" : "ok",
          `${m.blocked.length + m.urgent.length} cannot be scheduled with confidence`, "people")}
        {tile("expired", "Licences needing action", m.blocked.length + m.urgent.length, "people",
          m.blocked.length + m.urgent.length > 0 ? "bad" : "ok",
          m.soon.length > 0 ? `${m.soon.length} more inside 90 days` : "Nothing else inside 90 days", "people")}
        {tile("cost", "Weekly labour cost", money(m.weekly), "loaded", "gold",
          `${money(m.annual)} annualised · ${cost.length} on rates`, "plan_payroll")}
        {tile("cap", "Weekly capacity", Math.round(m.capacity), "hours",
          "info", `${cap.length} standing schedules`, "work_schedules")}
        {tile("login", "Cannot sign in", m.noLogin.length, "active staff",
          m.noLogin.length > 0 ? "warn" : "ok",
          "No clock-in, no schedule, no acknowledgements", "people")}
        {tile("roster", "Roster", m.active.length, "active",
          "ok", `${m.inactive} inactive · ${m.total} on file`, "people")}
      </div>

      {/* 3 — THE LICENCE HORIZON. The thing Deputy and When I Work cannot do. */}
      <section className="panelx">
        <div className="pxhead">
          <h2>Licence horizon — next twelve months</h2>
          <span className="pxsub">agent registrations expiring, by month</span>
        </div>
        <div className="horizon">
          {m.horizon.map((h) => (
            <div className={`hbar ${h.n === 0 ? "empty" : h.hot ? "hot" : ""}`} key={h.key}
                 title={h.people.map((p) => nameOf(p.full_name)).join("\n") || "none"}>
              <div className="hcol">
                <div className="hfill" style={{ height: `${(h.n / m.peak) * 100}%` }} />
              </div>
              <div className="hn">{h.n || ""}</div>
              <div className="hm">{h.label}</div>
            </div>
          ))}
        </div>
        <div className="hnote">
          Renewal takes about three weeks, so anything in the first two columns is
          already late. Hover a column for the names.
        </div>
      </section>

      {/* 4 — Department readiness: people, hours, cost, risk. */}
      <section className="panelx">
        <div className="pxhead">
          <h2>By department</h2>
          <span className="pxsub">active staff · weekly capacity · weekly loaded cost · licence risk</span>
        </div>
        <div className="dgrid">
          <div className="dhead"><span>Department</span><span className="r">Staff</span><span className="r">Capacity</span><span className="r">Weekly cost</span><span className="r">At risk</span></div>
          {m.byDept.map(([name, d]) => (
            <div className="drow" key={name} onClick={() => go?.("people")}>
              <span className="dn">{name}</span>
              <span className="r">{d.n}</span>
              <span className="r">{d.hrs ? Math.round(d.hrs) + " h" : "—"}</span>
              <span className="r">{d.cost ? money(d.cost) : "—"}</span>
              <span className="r">
                {d.risk > 0
                  ? <span className="schip bad">{d.risk}</span>
                  : <span className="schip ok">clear</span>}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* 5 — Onboarding: the people who cannot even sign in. */}
      {m.noLogin.length > 0 && (
        <section className="panelx">
          <div className="pxhead">
            <h2>Waiting on a login</h2>
            <span className="pxsub">{m.noLogin.length} active staff cannot clock in or see a schedule</span>
            <button className="btn small" style={{ marginLeft: "auto" }}
              onClick={() => setAssign({ kpi: "Invite staff without a login", value: m.noLogin.length, unit: "people", drill: "people" })}>
              Assign
            </button>
          </div>
          <div className="chips">
            {m.noLogin.slice(0, 24).map((e) => (
              <span className="pchip" key={e.id} title={e.email ?? "no email on file"}>
                <i>{initials(e.full_name)}</i>
                {nameOf(e.full_name)}
                {!e.email && <b className="noem">no email</b>}
              </span>
            ))}
            {m.noLogin.length > 24 && <span className="pchip more">+{m.noLogin.length - 24} more</span>}
          </div>
        </section>
      )}

      {assign && (
        <AssignTask dept="Human Resources" kpi={assign.kpi} value={assign.value}
          unit={assign.unit} drill={assign.drill} onDone={() => setAssign(null)} />
      )}
    </div>
  );
}
