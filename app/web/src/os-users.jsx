/* Settings → Users. Live app_users only. Do not invent staff.
   Owner/admin edits role, display name, password flag. Auth account is not created here. */
import React, { useEffect, useState } from "react";
import { supabase } from "./lib/supabase.js";
import "./os-desk.css";

function Icon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
      <path d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4Z" />
      <path d="M4 20a8 8 0 0 1 16 0" />
    </svg>
  );
}

export default function OsUsers({ go, session }) {
  const [rows, setRows] = useState(null);
  const [roles, setRoles] = useState([]);
  const [err, setErr] = useState(null);
  const [notice, setNotice] = useState(null);
  const [sel, setSel] = useState(null);
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);
  const [adding, setAdding] = useState(false);
  const [fresh, setFresh] = useState({ user_id: "", display_name: "", role: "staff" });

  function load() {
    supabase.from("app_users")
      .select("user_id, display_name, role, must_change_password, created_at, employee_id")
      .order("created_at")
      .then(({ data, error }) => {
        if (error) { setErr(error.message); setRows([]); return; }
        setRows(Array.isArray(data) ? data : []);
        setErr(null);
      });
    supabase.from("app_roles").select("role, label, rank").order("rank").then(({ data }) => {
      const list = Array.isArray(data) ? data.filter((r) => String(r.role).indexOf("qb_") !== 0 && r.role !== "guest" && r.role !== "member" && r.role !== "limited") : [];
      setRoles(list);
    });
  }
  useEffect(() => { load(); }, []);

  function open(u) {
    setSel(u.user_id);
    setDraft({
      display_name: u.display_name || "",
      role: u.role,
      must_change_password: !!u.must_change_password,
    });
    setNotice(null);
  }

  async function saveEdit() {
    if (!sel || !draft) return;
    setSaving(true);
    const { error } = await supabase.from("app_users").update({
      display_name: draft.display_name.trim() || null,
      role: draft.role,
      must_change_password: !!draft.must_change_password,
    }).eq("user_id", sel);
    setSaving(false);
    if (error) { setErr(error.message); setNotice("Save refused: " + error.message); return; }
    setNotice("User saved. Role change takes effect on their next page load.");
    setErr(null);
    load();
  }

  async function addUser() {
    const id = (fresh.user_id || "").trim();
    if (!/^[0-9a-f-]{36}$/i.test(id)) {
      setNotice("Paste a real Auth user id (UUID). This pane does not create logins or passwords.");
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("app_users").insert({
      user_id: id,
      display_name: (fresh.display_name || "").trim() || null,
      role: fresh.role,
      must_change_password: true,
    });
    setSaving(false);
    if (error) { setErr(error.message); setNotice("Could not provision: " + error.message); return; }
    setNotice("Provisioned. They already had a login — we assigned a role. Password never prints here.");
    setAdding(false);
    setFresh({ user_id: "", display_name: "", role: "staff" });
    load();
  }

  const owners = (rows || []).filter((r) => r.role === "owner").length;

  return (
    <div className="osdesk">
      <p className="osdesk-kicker">Settings</p>
      <h1 className="osdesk-title">Users</h1>
      <p className="osdesk-lede">
        Live <b>app_users</b>. {rows ? `${rows.length} provisioned · ${owners} owner${owners === 1 ? "" : "s"}` : "Reading…"}.
        Edit anyone. Do not invent staff. A login is created in Auth first — then you assign a role here.
      </p>

      <div className="osdesk-shell">
        <div className="osdesk-tabs">
          <button type="button" className="on">Users</button>
          <button type="button" onClick={() => go && go("permissions")}>Permissions</button>
          <button type="button" onClick={() => go && go("watchdog_log")}>Audit log</button>
          <button type="button" onClick={() => go && go("people")}>Employees</button>
          <button type="button" onClick={() => go && go("settings")}>Settings</button>
        </div>
        <div className="osdesk-body">
          <div className="osdesk-head">
            <div>
              <h2>Who is on this OS</h2>
              <p>Click a row. Change name, role, or force a password change. Owner and admin only on save.</p>
            </div>
            <div>
              <button type="button" className="osdesk-add" onClick={() => { setAdding((v) => !v); setNotice(null); }}>
                Add user <b>{rows ? rows.length : "…"}</b>
              </button>
              <p className="osdesk-own">Does not create a password</p>
            </div>
          </div>

          {err ? <p className="osdesk-note osdesk-err" role="alert">app_users could not be read: {err}</p> : null}

          {adding ? (
            <div className="osdesk-editor">
              <b>Provision an existing login</b>
              <p>Paste the Auth user id. Role is assigned here. Password is never shown or set on this page.</p>
              <label className="osdesk-field">Auth user id
                <input aria-label="Auth user id" value={fresh.user_id} onChange={(e) => setFresh({ ...fresh, user_id: e.target.value })} placeholder="uuid" />
              </label>
              <label className="osdesk-field">Display name
                <input aria-label="New user display name" value={fresh.display_name} onChange={(e) => setFresh({ ...fresh, display_name: e.target.value })} />
              </label>
              <label className="osdesk-field">Role
                <select aria-label="New user role" value={fresh.role} onChange={(e) => setFresh({ ...fresh, role: e.target.value })}>
                  {roles.map((r) => <option key={r.role} value={r.role}>{r.label || r.role}</option>)}
                </select>
              </label>
              <button type="button" className="osdesk-save" disabled={saving || !session} onClick={addUser}>Provision</button>
            </div>
          ) : null}

          <div className="osdesk-tablewrap">
            <table>
              <thead>
                <tr>
                  <th>User</th>
                  <th>Role</th>
                  <th>Must change password</th>
                  <th>Provisioned</th>
                  <th>User id</th>
                  <th>Edit</th>
                </tr>
              </thead>
              <tbody>
                {(rows || []).map((u) => (
                  <tr key={u.user_id} className={sel === u.user_id ? "on" : ""}>
                    <td><span className="osdesk-role"><Icon />{u.display_name || "Unnamed"}</span></td>
                    <td>{u.role}</td>
                    <td>{u.must_change_password ? <span className="osdesk-no">Yes</span> : <span className="osdesk-yes">No</span>}</td>
                    <td>{u.created_at ? String(u.created_at).slice(0, 10) : "—"}</td>
                    <td style={{ fontFamily: "ui-monospace, monospace", fontSize: 12 }}>{u.user_id}</td>
                    <td><button type="button" className="osdesk-add" onClick={() => open(u)}>Edit</button></td>
                  </tr>
                ))}
                {rows && rows.length === 0 ? (
                  <tr><td colSpan={5}>No app_users rows. Do not invent staff.</td></tr>
                ) : null}
              </tbody>
            </table>
          </div>

          {sel && draft ? (
            <div className="osdesk-editor">
              <b>Edit user</b>
              <label className="osdesk-field">Display name
                <input aria-label="Display name" value={draft.display_name} onChange={(e) => setDraft({ ...draft, display_name: e.target.value })} />
              </label>
              <label className="osdesk-field">Role
                <select aria-label="User role" value={draft.role} onChange={(e) => setDraft({ ...draft, role: e.target.value })}>
                  {roles.map((r) => <option key={r.role} value={r.role}>{r.label || r.role}</option>)}
                </select>
              </label>
              <label className="osdesk-field" style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <input type="checkbox" aria-label="Must change password" checked={!!draft.must_change_password} onChange={(e) => setDraft({ ...draft, must_change_password: e.target.checked })} />
                Must change password on next sign-in
              </label>
              <button type="button" className="osdesk-save" disabled={saving || !session} onClick={saveEdit}>
                {saving ? "Saving…" : "Save user"}
              </button>
              <p className="osdesk-own">Owner / admin. Last remaining owner cannot be demoted if the database refuses it.</p>
            </div>
          ) : null}

          {notice ? <p className="osdesk-note" role="status">{notice}</p> : (
            <p className="osdesk-note">Two owners are live. Assign staff by role. Page-level View / Edit / Approve / Export / Delete is on Permissions.</p>
          )}
        </div>
      </div>
    </div>
  );
}
