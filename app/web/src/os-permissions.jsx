/* Settings → Users & Permissions. Grok matrix on live nav_role_visibility.
   Owner/executive save. Hidden page is not a missing page. */
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "./lib/supabase.js";
import "./os-desk.css";

const ROLES = [
  ["owner", "Owner"],
  ["executive", "Executive"],
  ["cfo", "CFO"],
  ["manager", "Manager"],
  ["staff", "Staff"],
];

const FEATURED = [
  ["tower", "Control Tower"],
  ["xq_metrc_exceptions", "Exception Queues"],
  ["orders", "Finance Orders"],
  ["plant_loss_by_batch", "Plant Waste"],
  ["os_help", "Help"],
  ["os_users", "Users"],
  ["permissions", "Permissions"],
  ["os_staff", "Staff"],
  ["report_vault", "Report Vault"],
  ["ops_cm", "Cultivation & Manufacturing"],
];

function Ico() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
      <rect x="4" y="4" width="16" height="16" rx="3" />
      <path d="M8 12h8M12 8v8" />
    </svg>
  );
}

export default function OsPermissions({ go, session }) {
  const [nav, setNav] = useState([]);
  const [vis, setVis] = useState({});
  const [dirty, setDirty] = useState(false);
  const [err, setErr] = useState(null);
  const [notice, setNotice] = useState(null);
  const [q, setQ] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let live = true;
    Promise.all([
      supabase.from("nav_registry").select("view_key, label, category, enabled"),
      supabase.from("nav_role_visibility").select("view_key, role, visible").in("role", ROLES.map((r) => r[0])),
    ]).then(([n, v]) => {
      if (!live) return;
      const e1 = n.error?.message;
      const e2 = v.error?.message;
      if (e1 || e2) {
        setErr([e1, e2].filter(Boolean).join(" · "));
        setNav([]);
        setVis({});
        return;
      }
      setNav(Array.isArray(n.data) ? n.data.filter((r) => r.enabled !== false) : []);
      const map = {};
      (Array.isArray(v.data) ? v.data : []).forEach((row) => {
        if (!map[row.view_key]) map[row.view_key] = {};
        map[row.view_key][row.role] = !!row.visible;
      });
      setVis(map);
      setErr(null);
    });
    return () => { live = false; };
  }, []);

  const needle = q.trim().toLowerCase();
  const rows = useMemo(() => {
    const byKey = Object.fromEntries(nav.map((r) => [r.view_key, r]));
    const featured = FEATURED
      .map(([id, fallback]) => ({ id, label: byKey[id]?.label || fallback }))
      .filter((r) => !needle || r.label.toLowerCase().includes(needle) || r.id.includes(needle));
    if (!needle) return featured;
    const extra = nav
      .filter((r) => !FEATURED.some(([id]) => id === r.view_key))
      .filter((r) => (r.label + " " + r.view_key + " " + (r.category || "")).toLowerCase().includes(needle))
      .slice(0, 40)
      .map((r) => ({ id: r.view_key, label: r.label }));
    return [...featured, ...extra];
  }, [nav, needle]);

  function toggle(pageId, role) {
    setVis((m) => ({
      ...m,
      [pageId]: { ...(m[pageId] || {}), [role]: !(m[pageId] || {})[role] },
    }));
    setDirty(true);
    setNotice(null);
  }

  async function save() {
    setSaving(true);
    setNotice(null);
    const payload = [];
    rows.forEach((r) => {
      ROLES.forEach(([role]) => {
        payload.push({
          view_key: r.id,
          role,
          visible: !!(vis[r.id] || {})[role],
          updated_at: new Date().toISOString(),
        });
      });
    });
    const { error } = await supabase.from("nav_role_visibility").upsert(payload, { onConflict: "view_key,role" });
    setSaving(false);
    if (error) {
      setErr(error.message);
      setNotice("Save is owner/executive only. " + error.message);
      return;
    }
    setDirty(false);
    setErr(null);
    setNotice("Saved to nav_role_visibility. A hidden page is not a missing page.");
  }

  return (
    <div className="osdesk">
      <p className="osdesk-kicker">Settings</p>
      <h1 className="osdesk-title">Permissions</h1>
      <p className="osdesk-lede">
        Menu visibility is <b>nav_role_visibility</b>. Data access is RLS.
        Owner or executive saves. A hidden page is not a missing page.
      </p>

      <div className="osdesk-shell">
        <div className="osdesk-tabs">
          <button type="button" onClick={() => go && go("settings")}>Overview</button>
          <button type="button" onClick={() => go && go("menu_manager")}>Menus</button>
          <button type="button" className="on">Permissions</button>
          <button type="button" onClick={() => go && go("os_users")}>Roles</button>
          <button type="button" onClick={() => go && go("watchdog_log")}>Audit Log</button>
          <button type="button" onClick={() => go && go("settings")}>Settings</button>
        </div>

        <div className="osdesk-body">
          <div className="osdesk-head">
            <div>
              <h2 className="osdesk-mark">Permissions — menu visibility by role</h2>
            </div>
            <span className="osdesk-saved">
              Last saved: live <b>nav_role_visibility</b> <i />
            </span>
          </div>

          <div className="osdesk-steps">
            <p className="osdesk-step">
              <span className="osdesk-n">1</span>
              <span><b className="osdesk-mark">matrix</b> Green check = visible to role. Red dash = hidden from role.</span>
            </p>
            <p className="osdesk-step">
              <span className="osdesk-n">2</span>
              <span><b className="osdesk-mark">save is owner-only</b> Only Owner or Executive can save changes.</span>
            </p>
          </div>

          <input
            className="osdesk-find"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Find any page"
            aria-label="Find any page"
          />

          {err ? <p className="osdesk-note osdesk-err" role="alert">{err}</p> : null}

          <div className="osdesk-tablewrap">
            <table>
              <thead>
                <tr>
                  <th>Menu / Page</th>
                  {ROLES.map(([id, label]) => (
                    <th key={id} style={{ textAlign: "center" }}>{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <span className="osdesk-role"><Ico />{row.label}</span>
                    </td>
                    {ROLES.map(([role, label]) => {
                      const on = !!(vis[row.id] || {})[role];
                      return (
                        <td key={role} style={{ textAlign: "center" }}>
                          <button
                            type="button"
                            className="osdesk-cellbtn"
                            aria-pressed={on}
                            aria-label={`${row.label} ${label} ${on ? "visible" : "hidden"}`}
                            onClick={() => toggle(row.id, role)}
                          >
                            {on ? (
                              <svg className="yes" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" aria-hidden="true"><path d="M5 12l5 5L20 7" /></svg>
                            ) : (
                              <svg className="no" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" aria-hidden="true"><path d="M5 12h14" /></svg>
                            )}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
            <div>
              <button type="button" className="osdesk-save" disabled={saving || !session} onClick={save}>
                Save changes
              </button>
              <p className="osdesk-own">Save is owner-only{dirty ? " · unsaved on this pane" : ""}</p>
            </div>
          </div>
          {notice ? <p className="osdesk-note" role="status">{notice}</p> : null}
        </div>
      </div>
    </div>
  );
}
