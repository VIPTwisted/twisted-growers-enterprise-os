/* Settings → Users. Grok design in live OS chrome. Live app_users. Do not invent staff. */
import React, { useEffect, useState } from "react";
import { supabase } from "./lib/supabase.js";
import "./os-desk.css";

const SHOW = [
  ["owner", "Owner", true, true, true],
  ["executive", "Executive", true, true, true],
  ["cfo", "CFO", true, true, true],
  ["admin", "Admin", true, true, false],
  ["manager", "Manager", true, false, false],
  ["dept_head", "Dept Head", true, false, false],
  ["staff", "Staff", false, false, false],
  ["hr", "HR", false, false, false],
  ["planner", "Planner", false, false, false],
  ["readonly", "ReadOnly", false, false, false],
];

function Icon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
      <path d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4Z" />
      <path d="M4 20a8 8 0 0 1 16 0" />
    </svg>
  );
}

function Pill({ on }) {
  return on ? (
    <span className="osdesk-yes">Yes
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" aria-hidden="true"><path d="M5 12l5 5L20 7" /></svg>
    </span>
  ) : (
    <span className="osdesk-no">No
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" aria-hidden="true"><path d="M5 12h14" /></svg>
    </span>
  );
}

export default function OsUsers({ go, session }) {
  const [counts, setCounts] = useState(null);
  const [err, setErr] = useState(null);
  const [notice, setNotice] = useState(null);

  useEffect(() => {
    let live = true;
    supabase.from("app_users").select("role").then(({ data, error }) => {
      if (!live) return;
      if (error) {
        setErr(error.message);
        setCounts({});
        return;
      }
      const rows = Array.isArray(data) ? data : [];
      const next = {};
      rows.forEach((r) => { next[r.role] = (next[r.role] || 0) + 1; });
      setCounts(next);
      setErr(null);
    });
    return () => { live = false; };
  }, []);

  const owners = counts ? (counts.owner || 0) : 0;

  return (
    <div className="osdesk">
      <p className="osdesk-kicker">Settings</p>
      <h1 className="osdesk-title">Users</h1>
      <p className="osdesk-lede">
        Live <b>app_users</b>. {counts ? `${owners} owner row${owners === 1 ? "" : "s"}` : "Reading…"}.
        Other roles exist in the catalog with 0 provisioned — do not invent staff.
        Only owner creates a user. Passwords never print here.
      </p>

      <div className="osdesk-shell">
        <div className="osdesk-split">
          <aside className="osdesk-rail">
            <div className="osdesk-rail-h">
              <b>Command Center</b>
              <span className="osdesk-online"><i /> Online</span>
            </div>
            <button type="button" onClick={() => go && go("ops_cm")}>Cultivation</button>
            <button type="button" onClick={() => go && go("dept_dash_metrc")}>Metrc</button>
            <button type="button" onClick={() => go && go("orders")}>Finance</button>
            <button type="button" className="on">HR</button>
            <button type="button" className="osdesk-sub on" onClick={() => go && go("os_users")}>Users</button>
            <button type="button" className="osdesk-sub" onClick={() => go && go("permissions")}>Roles & Permissions</button>
            <button type="button" onClick={() => go && go("settings")}>Settings</button>
            <button type="button" onClick={() => go && go("watchdog_log")}>Audit Log</button>
            <button type="button" onClick={() => go && go("cron_health")}>System Status</button>
          </aside>

          <div className="osdesk-main">
            <div className="osdesk-head">
              <div>
                <h2>Users — who is on this OS</h2>
                <p>Application roles and access provisioning for this facility.</p>
              </div>
              <div>
                <button
                  type="button"
                  className="osdesk-add"
                  onClick={() => setNotice(
                    session?.user
                      ? "Add user is owner-only. This pane does not create auth accounts. Live app_users is owners only until you provision someone. Do not invent staff."
                      : "Sign in as owner to create a user.",
                  )}
                >
                  Add user <b>{counts ? owners : "…"}</b>
                </button>
                <p className="osdesk-own">Owner only</p>
              </div>
            </div>

            {err ? <p className="osdesk-note osdesk-err" role="alert">app_users could not be read: {err}</p> : null}

            <div className="osdesk-tablewrap">
              <table>
                <thead>
                  <tr>
                    <th>Role</th>
                    <th>Provisioned</th>
                    <th>Sees Metrc queues</th>
                    <th>Sees finance</th>
                    <th>Can edit policy</th>
                  </tr>
                </thead>
                <tbody>
                  {SHOW.map(([id, label, queues, finance, policy]) => (
                    <tr key={id}>
                      <td>
                        <span className="osdesk-role"><Icon />{label}</span>
                      </td>
                      <td>{counts ? (counts[id] || 0) : "…"}</td>
                      <td><Pill on={queues} /></td>
                      <td><Pill on={finance} /></td>
                      <td><Pill on={policy} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {notice ? (
              <p className="osdesk-note" role="status">{notice}</p>
            ) : (
              <p className="osdesk-note">Live policy, not a mock. Owner sees finance. Staff does not see queues.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
