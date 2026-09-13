/* Settings → Permissions. Dynamics-style: pick a role, edit every page.
   Menu = nav_role_visibility. Actions = page_permissions (view/edit/approve/export/delete).
   Owner/admin save. Hidden page is not a missing page. */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "./lib/supabase.js";
import "./os-desk.css";
import { readPermissionMatrix, savePermissionMatrix } from "./lib/permission-matrix.js";

const EMPTY = { can_view: false, can_edit: false, can_approve: false, can_export: false, can_delete: false };

function Ico() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
      <rect x="4" y="4" width="16" height="16" rx="3" />
      <path d="M8 12h8M12 8v8" />
    </svg>
  );
}

function Cell({ on, label, onClick, disabled }) {
  return (
    <button
      type="button"
      className="osdesk-cellbtn"
      disabled={disabled}
      aria-pressed={on}
      aria-label={label}
      onClick={onClick}
    >
      {on ? (
        <svg className="yes" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" aria-hidden="true"><path d="M5 12l5 5L20 7" /></svg>
      ) : (
        <svg className="no" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" aria-hidden="true"><path d="M5 12h14" /></svg>
      )}
    </button>
  );
}

export default function OsPermissions({ go, session }) {
  const [nav, setNav] = useState([]);
  const [roles, setRoles] = useState([]);
  const [perm, setPerm] = useState({});
  const [menu, setMenu] = useState({});
  const [role, setRole] = useState("staff");
  const [copyFrom, setCopyFrom] = useState("owner");
  const [q, setQ] = useState("");
  const [openCat, setOpenCat] = useState({ Settings: true });
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);
  const [notice, setNotice] = useState(null);
  const [revision, setRevision] = useState(null);
  const [loading, setLoading] = useState(true);
  const requestSequence = useRef(0);

  const applySnapshot = useCallback((snapshot) => {
    setNav(snapshot.nav);
    setPerm(Object.fromEntries(snapshot.permissions.map(row => [row.view_key, row])));
    setMenu(Object.fromEntries(snapshot.visibility.map(row => [row.view_key, row.visible])));
    setRoles(snapshot.roles.filter(r => !String(r.role).startsWith("qb_") && !["guest", "member", "limited"].includes(r.role)));
    setRevision(snapshot.revision);
    setDirty(false); setErr(null);
  }, []);
  useEffect(() => {
    const sequence = ++requestSequence.current;
    let active = true;
    setLoading(true); setRevision(null); setPerm({}); setMenu({}); setNav([]);
    readPermissionMatrix(supabase, role).then(snapshot => {
      if (active && sequence === requestSequence.current) applySnapshot(snapshot);
    }).catch(error => {
      if (active && sequence === requestSequence.current) setErr(error.message);
    }).finally(() => {
      if (active && sequence === requestSequence.current) setLoading(false);
    });
    return () => { active = false; };
  }, [role, session?.user?.id, applySnapshot]);

  const groups = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const by = {};
    nav.forEach((r) => {
      const blob = ((r.label || "") + " " + r.view_key + " " + (r.category || "")).toLowerCase();
      if (needle && blob.indexOf(needle) === -1) return;
      const cat = r.category || "Other";
      if (!by[cat]) by[cat] = [];
      by[cat].push(r);
    });
    return Object.keys(by).sort().map((cat) => ({ cat, pages: by[cat] }));
  }, [nav, q]);

  function rowState(viewKey) {
    const p = perm[viewKey] || EMPTY;
    return {
      menu: menu[viewKey] === true || (menu[viewKey] !== false && p.can_view),
      can_view: !!p.can_view,
      can_edit: !!p.can_edit,
      can_approve: !!p.can_approve,
      can_export: !!p.can_export,
      can_delete: !!p.can_delete,
    };
  }

  function setRow(viewKey, patch) {
    if (loading || saving || !revision) return;
    const cur = rowState(viewKey);
    const next = { ...cur, ...patch };
    if (patch.menu === true && !next.can_view) next.can_view = true;
    if (patch.can_view === false) next.menu = false;
    setPerm((m) => ({
      ...m,
      [viewKey]: {
        view_key: viewKey,
        can_view: next.can_view,
        can_edit: next.can_edit,
        can_approve: next.can_approve,
        can_export: next.can_export,
        can_delete: next.can_delete,
      },
    }));
    setMenu((m) => ({ ...m, [viewKey]: next.menu }));
    setDirty(true);
    setNotice(null);
  }

  async function save() {
    if (saving || loading || !revision || !dirty) return;
    setSaving(true); setNotice(null);
    const pages = Object.keys({ ...perm, ...menu }).map(view_key => ({ view_key, ...rowState(view_key) }));
    try {
      const snapshot = await savePermissionMatrix(supabase, role, revision, pages);
      applySnapshot(snapshot);
      setNotice("Saved. " + role + " — menu visibility and page actions confirmed together.");
    } catch (error) {
      setErr(error.message);
      setNotice("Save was not confirmed. Your edits remain here. " + error.message);
    } finally { setSaving(false); }
  }

  async function copyRole() {
    if (saving || loading || !revision) return;
    setLoading(true); setNotice(null);
    try {
      const snapshot = await readPermissionMatrix(supabase, copyFrom);
      setPerm(Object.fromEntries(snapshot.permissions.map(row => [row.view_key, row])));
      setMenu(Object.fromEntries(snapshot.visibility.map(row => [row.view_key, row.visible])));
      setDirty(true); setErr(null);
      setNotice("Copied " + copyFrom + " onto " + role + " in this pane. Save to write it.");
    } catch (error) { setErr(error.message); }
    finally { setLoading(false); }
  }

  return (
    <div className="osdesk">
      <p className="osdesk-kicker">Settings</p>
      <h1 className="osdesk-title">Permissions</h1>
      <p className="osdesk-lede">
        Pick a role. Every page is editable: menu on/off, then View · Edit · Approve · Export · Delete.
        Menu is <b>nav_role_visibility</b>. Actions are <b>page_permissions</b>. Data access is still RLS.
      </p>

      <div className="osdesk-shell">
        <div className="osdesk-tabs">
          <button type="button" onClick={() => go && go("os_users")}>Users</button>
          <button type="button" className="on">Permissions</button>
          <button type="button" onClick={() => go && go("watchdog_log")}>Audit log</button>
          <button type="button" onClick={() => go && go("settings")}>Settings</button>
        </div>
        <div className="osdesk-body">
          <div className="osdesk-head">
            <div>
              <h2 className="osdesk-mark">Role matrix</h2>
              <p>Like QuickBooks user types + Dynamics security roles. One role at a time so you cannot fat-finger 24 columns.</p>
            </div>
            <span className="osdesk-saved">Live tables <i /></span>
          </div>

          <div className="osdesk-editor" style={{ marginTop: 12 }}>
            <label className="osdesk-field">Role
              <select aria-label="Role to edit" disabled={saving || loading} value={role} onChange={(e) => { if (dirty && !window.confirm("Discard unsaved permission edits for this role?")) return; setRole(e.target.value); setNotice(null); }}>
                {roles.map((r) => <option key={r.role} value={r.role}>{r.label || r.role}</option>)}
              </select>
            </label>
            <label className="osdesk-field">Copy from
              <select disabled={saving || loading} aria-label="Copy permissions from role" value={copyFrom} onChange={(e) => setCopyFrom(e.target.value)}>
                {roles.map((r) => <option key={r.role} value={r.role}>{r.label || r.role}</option>)}
              </select>
            </label>
            <button type="button" className="osdesk-add" disabled={saving || loading || !revision} onClick={copyRole}>Copy onto {role}</button>
            <button type="button" className="osdesk-save" disabled={saving || loading || !session || !dirty || !revision} onClick={save}>
              {loading ? "Loading…" : saving ? "Saving…" : dirty ? "Save " + role : revision ? "No unsaved changes" : "Unavailable"}
            </button>
          </div>

          <input
            className="osdesk-find"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Find any page, department, or view key"
            aria-label="Find any page"
          />

          {err ? <p className="osdesk-note osdesk-err" role="alert">{err}</p> : null}

          {groups.map((g) => {
            const open = !!openCat[g.cat] || !!q.trim();
            return (
              <div key={g.cat} className="osdesk-acc">
                <button
                  type="button"
                  className="osdesk-acchead"
                  onClick={() => setOpenCat((m) => ({ ...m, [g.cat]: !m[g.cat] }))}
                >
                  <span>{open ? "−" : "+"}</span>
                  {g.cat}
                  <em>{g.pages.length}</em>
                </button>
                {open ? (
                  <div className="osdesk-tablewrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Page</th>
                          <th style={{ textAlign: "center" }}>Menu</th>
                          <th style={{ textAlign: "center" }}>View</th>
                          <th style={{ textAlign: "center" }}>Edit</th>
                          <th style={{ textAlign: "center" }}>Approve</th>
                          <th style={{ textAlign: "center" }}>Export</th>
                          <th style={{ textAlign: "center" }}>Delete</th>
                        </tr>
                      </thead>
                      <tbody>
                        {g.pages.map((pg) => {
                          const s = rowState(pg.view_key);
                          return (
                            <tr key={pg.view_key}>
                              <td>
                                <span className="osdesk-role"><Ico />{pg.label}</span>
                                <div className="osdesk-own" style={{ textAlign: "left" }}>{pg.view_key}</div>
                              </td>
                              <td style={{ textAlign: "center" }}>
                                <Cell disabled={saving || loading || !revision} on={s.menu} label={pg.label + " menu"} onClick={() => setRow(pg.view_key, { menu: !s.menu })} />
                              </td>
                              <td style={{ textAlign: "center" }}>
                                <Cell disabled={saving || loading || !revision} on={s.can_view} label={pg.label + " view"} onClick={() => setRow(pg.view_key, { can_view: !s.can_view })} />
                              </td>
                              <td style={{ textAlign: "center" }}>
                                <Cell disabled={saving || loading || !revision} on={s.can_edit} label={pg.label + " edit"} onClick={() => setRow(pg.view_key, { can_edit: !s.can_edit })} />
                              </td>
                              <td style={{ textAlign: "center" }}>
                                <Cell disabled={saving || loading || !revision} on={s.can_approve} label={pg.label + " approve"} onClick={() => setRow(pg.view_key, { can_approve: !s.can_approve })} />
                              </td>
                              <td style={{ textAlign: "center" }}>
                                <Cell disabled={saving || loading || !revision} on={s.can_export} label={pg.label + " export"} onClick={() => setRow(pg.view_key, { can_export: !s.can_export })} />
                              </td>
                              <td style={{ textAlign: "center" }}>
                                <Cell disabled={saving || loading || !revision} on={s.can_delete} label={pg.label + " delete"} onClick={() => setRow(pg.view_key, { can_delete: !s.can_delete })} />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : null}
              </div>
            );
          })}

          {notice ? <p className="osdesk-note" role="status">{notice}</p> : (
            <p className="osdesk-note">
              Menu off hides the page from that role. View/Edit/Approve/Export/Delete is the action grant.
              RLS still blocks data they should not see. Save is owner/admin.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
