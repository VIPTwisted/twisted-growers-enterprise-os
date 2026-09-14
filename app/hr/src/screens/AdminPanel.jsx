import { useState, useEffect, useCallback } from 'react'
import { sb } from '../lib/supabase'
import { useScope } from '../lib/scope.jsx'
import { useAuth } from '../lib/auth.jsx'
import { logAudit, fetchAuditLog } from '../lib/audit'

/* ── helpers ──────────────────────────────────────────────── */
const initials = n =>
  !n ? '?' : n.split(' ').map(x => x[0]).slice(0, 2).join('').toUpperCase()

function fmtDate(ts) {
  if (!ts) return '—'
  try {
    return new Date(ts).toLocaleString('en-US', {
      month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
  } catch { return ts }
}

function fmtDateShort(ts) {
  if (!ts) return '—'
  try {
    return new Date(ts).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
    })
  } catch { return ts }
}

const DAY_MS = 86400000
const within24h = ts => ts && (Date.now() - new Date(ts).getTime()) < DAY_MS

/* ── KPI tile ─────────────────────────────────────────────── */
function KTile({ label, value, sub, color, alert }) {
  return (
    <div style={{
      background: 'var(--t-surface)',
      border: `1px solid ${alert === 'red' ? 'var(--t-danger)' : alert === 'amber' ? 'var(--t-warn)' : 'var(--t-line)'}`,
      padding: '14px 16px',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {alert === 'red'   && <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'var(--t-danger)' }} />}
      {alert === 'amber' && <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'var(--t-warn)'   }} />}
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.08em', color: 'var(--t-text-muted)', textTransform: 'uppercase', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800, color: color || 'var(--t-text)', lineHeight: 1, marginBottom: 4 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--t-text-faint)' }}>{sub}</div>}
    </div>
  )
}

/* ── Forensic KPI panel (always visible in admin view) ───────
   Everything here is derived from live data: get_roster (users),
   get_audit_log (activity + logins) and a measured RPC round-trip. */
function ForensicKPIs({ users, locations, auditRows, loginRows, dbLatency, rolesCount }) {
  const active   = users.filter(u => u.is_active).length
  const inactive = users.filter(u => !u.is_active).length
  const admins   = users.filter(u => /admin|owner|coo|ceo|chief/i.test(u.role_name || '')).length
  const managers = users.filter(u => /manager/i.test(u.role_name || '')).length

  const events24 = auditRows.filter(r => within24h(r.created_at)).length
  const fails24  = auditRows.filter(r => within24h(r.created_at) && r.result !== 'Success').length
  const logins24 = loginRows.filter(r => within24h(r.created_at) && r.result === 'Success').length
  const lastActivity = auditRows.length ? auditRows[0].created_at : null

  /* by-location — real roster grouped by node_name */
  const byLoc = locations.map(loc => {
    const locUsers  = users.filter(u => u.node_name === loc.name)
    const locActive = locUsers.filter(u => u.is_active).length
    const pct = locUsers.length ? Math.round((locActive / locUsers.length) * 100) : 0
    const mgr = locUsers.find(u => /manager/i.test(u.role_name || ''))?.full_name || 'Unassigned'
    const lastLoginArr = locUsers.map(u => u.last_login).filter(Boolean).sort()
    const lastLogin = lastLoginArr.length ? fmtDate(lastLoginArr[lastLoginArr.length - 1]) : '—'
    return { loc: loc.name, headcount: locUsers.length, active: locActive, pct, mgr, lastLogin }
  })

  return (
    <div style={{ marginBottom: 24 }}>
      {/* Row 1 — User counts (live roster) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 8, marginBottom: 8 }}>
        <KTile label="Total Users"   value={users.length} sub="in scope" />
        <KTile label="Active"        value={active}   color="var(--t-success)" sub="can log in" />
        <KTile label="Inactive"      value={inactive} color="var(--t-warn)"    sub="deactivated" alert={inactive > 3 ? 'amber' : undefined} />
        <KTile label="Execs / Admin" value={admins}   color="var(--t-accent)"  sub="elevated roles" />
        <KTile label="Managers"      value={managers} sub="manager roles" />
        <KTile label="Roles"         value={rolesCount} sub="defined in system" />
      </div>

      {/* Row 2 — Live activity (audit log + measured round-trip) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 8, marginBottom: 8 }}>
        <KTile label="DB Round-Trip" value={dbLatency == null ? '—' : `${dbLatency}ms`}
               color={dbLatency != null && dbLatency > 800 ? 'var(--t-warn)' : 'var(--t-text)'} sub="measured this load" />
        <KTile label="Logins 24h"    value={logins24} color="var(--t-success)" sub="successful" />
        <KTile label="Audit Events 24h" value={events24} sub="all actions" />
        <KTile label="Failed Events 24h" value={fails24}
               color={fails24 > 0 ? 'var(--t-warn)' : 'var(--t-success)'} sub="non-success results"
               alert={fails24 > 0 ? 'amber' : undefined} />
        <KTile label="Last Activity" value={lastActivity ? fmtDate(lastActivity) : '—'} sub="most recent event" />
        <KTile label="Locations"     value={locations.length} sub="in scope" />
      </div>

      {/* Row 3 — By-location table */}
      <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', padding: '12px 16px' }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.08em', color: 'var(--t-text-muted)', textTransform: 'uppercase', marginBottom: 10 }}>Location Breakdown</div>
        {byLoc.length === 0 ? (
          <div style={{ padding: 16, textAlign: 'center', color: 'var(--t-text-muted)', fontSize: 13 }}>No locations in scope.</div>
        ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr>
              {['Location', 'Headcount', 'Active', 'Active %', 'Manager', 'Last Login'].map(h => (
                <th key={h} style={{ textAlign: 'left', padding: '4px 8px', fontSize: 10, fontWeight: 700, color: 'var(--t-text-muted)', textTransform: 'uppercase', letterSpacing: '.06em', borderBottom: '1px solid var(--t-line)' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {byLoc.map(row => (
              <tr key={row.loc}>
                <td style={{ padding: '8px 8px', fontWeight: 700, color: 'var(--t-accent)' }}>{row.loc}</td>
                <td style={{ padding: '8px 8px' }}>{row.headcount}</td>
                <td style={{ padding: '8px 8px', color: 'var(--t-success)' }}>{row.active}</td>
                <td style={{ padding: '8px 8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ flex: 1, height: 4, background: 'var(--t-line)', borderRadius: 2, overflow: 'hidden', maxWidth: 60 }}>
                      <div style={{ width: `${row.pct}%`, height: '100%', background: row.pct < 60 ? 'var(--t-danger)' : row.pct < 80 ? 'var(--t-warn)' : 'var(--t-success)', borderRadius: 2 }} />
                    </div>
                    <span style={{ fontSize: 12, color: 'var(--t-text-muted)', minWidth: 30 }}>{row.pct}%</span>
                  </div>
                </td>
                <td style={{ padding: '8px 8px', color: 'var(--t-text-muted)' }}>{row.mgr}</td>
                <td style={{ padding: '8px 8px', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--t-text-faint)' }}>{row.lastLogin}</td>
              </tr>
            ))}
          </tbody>
        </table>
        )}
      </div>
    </div>
  )
}

/* ── Tab 1: User Management ───────────────────────────────── */
function UserModal({ mode, user, roles, locations, actorId, onClose, onSaved }) {
  const [form, setForm] = useState(() => ({
    full_name: user?.full_name || '',
    login_id:  user?.login_id  || '',
    role_id:   (roles.find(r => r.name === user?.role_name)?.id) || '',
    node_id:   (locations.find(n => n.name === user?.node_name)?.id) || (locations[0]?.id || ''),
    is_active: user ? !!user.is_active : true,
    pin:       '',
  }))
  const [saving, setSaving] = useState(false)
  const [err, setErr]       = useState(null)

  function set(k, v) { setForm(f => ({ ...f, [k]: v })) }

  async function submit(e) {
    e.preventDefault()
    setErr(null)
    if (!form.full_name.trim()) { setErr('Name is required.'); return }
    if (!form.role_id)          { setErr('Role is required.'); return }
    if (!form.node_id)          { setErr('Location is required.'); return }
    if (mode === 'add') {
      if (!form.login_id.trim())  { setErr('Login ID is required.'); return }
      if (form.pin.length < 4)    { setErr('PIN must be ≥ 4 digits.'); return }
    }
    setSaving(true)
    try {
      if (mode === 'add') {
        const { data, error } = await sb.rpc('hr_create_employee', {
          p_created_by: actorId,
          p_full_name:  form.full_name.trim(),
          p_login_id:   form.login_id.trim(),
          p_node_id:    form.node_id,
          p_pin:        form.pin,
          p_role_id:    form.role_id,
        })
        if (error) { setErr(error.message); setSaving(false); return }
        if (data && data.ok === false) { setErr(data.error || 'Create failed.'); setSaving(false); return }
        logAudit('User Created', { target: form.full_name.trim() })
      } else {
        const { data, error } = await sb.rpc('admin_update_person', {
          p_person_id: user.id,
          p_full_name: form.full_name.trim(),
          p_role_id:   form.role_id,
          p_node_id:   form.node_id,
          p_is_active: form.is_active,
        })
        if (error) { setErr(error.message); setSaving(false); return }
        if (data && data.ok === false) { setErr(data.error || 'Update failed.'); setSaving(false); return }
        logAudit('User Updated', { target: form.full_name.trim() })
      }
      onSaved()
    } catch (ex) {
      setErr(ex.message || 'Unexpected error')
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-box" style={{ maxWidth: 480 }}>
        <div className="modal-title">{mode === 'add' ? '+ Add New User' : `Edit — ${user.full_name}`}</div>
        <form onSubmit={submit}>
          <div className="form-row">
            <label className="form-label">Full Name *</label>
            <input value={form.full_name} onChange={e => set('full_name', e.target.value)} placeholder="Full name" required autoFocus />
          </div>
          {mode === 'add' && (
            <div className="form-row">
              <label className="form-label">Login ID *</label>
              <input value={form.login_id} onChange={e => set('login_id', e.target.value)} placeholder="e.g. initials — used to sign in" required />
            </div>
          )}
          <div className="form-row">
            <label className="form-label">Role *</label>
            <select value={form.role_id} onChange={e => set('role_id', e.target.value)} required>
              <option value="">Select role…</option>
              {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </div>
          <div className="form-row">
            <label className="form-label">Location *</label>
            <select value={form.node_id} onChange={e => set('node_id', e.target.value)} required>
              <option value="">Select location…</option>
              {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
          {mode === 'add' && (
            <div className="form-row">
              <label className="form-label">PIN (≥ 4 digits)</label>
              <input
                type="password" inputMode="numeric" maxLength={8}
                value={form.pin}
                onChange={e => set('pin', e.target.value.replace(/\D/g, ''))}
                placeholder="••••" required
              />
            </div>
          )}
          {mode === 'edit' && (
            <div className="form-row">
              <label className="form-label">Status</label>
              <select value={form.is_active ? 'Active' : 'Inactive'} onChange={e => set('is_active', e.target.value === 'Active')}>
                <option value="Active">Active</option>
                <option value="Inactive">Inactive</option>
              </select>
            </div>
          )}
          {err && (
            <div style={{ padding: '8px 12px', marginBottom: 12, background: 'rgba(255,59,48,.08)', border: '1px solid var(--t-danger)', color: 'var(--t-danger)', fontSize: 13 }}>
              {err}
            </div>
          )}
          <div className="approve-bar">
            <button className="btn-approve" type="submit" disabled={saving}>
              {saving ? 'Saving…' : mode === 'add' ? 'Create User' : 'Save Changes'}
            </button>
            <button className="btn-edit" type="button" onClick={onClose}>Cancel</button>
          </div>
        </form>
      </div>
    </div>
  )
}

function PinResetModal({ user, actorId, onClose, onDone }) {
  const [pin, setPin]       = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr]       = useState(null)

  async function submit(e) {
    e.preventDefault()
    setErr(null)
    if (pin.length < 4) { setErr('PIN must be ≥ 4 digits.'); return }
    setSaving(true)
    try {
      const { data, error } = await sb.rpc('admin_reset_pin', {
        p_person_id: user.id, p_pin: pin, p_actor: actorId,
      })
      if (error) { setErr(error.message); setSaving(false); return }
      if (data && data.ok === false) { setErr(data.error || 'Reset failed.'); setSaving(false); return }
      logAudit('PIN Reset', { target: user.full_name })
      onDone()
    } catch (ex) {
      setErr(ex.message || 'Unexpected error')
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-box" style={{ maxWidth: 400 }}>
        <div className="modal-title">Reset PIN — {user.full_name}</div>
        <form onSubmit={submit}>
          <div className="form-row">
            <label className="form-label">New PIN (4–8 digits)</label>
            <input
              type="password" inputMode="numeric" maxLength={8}
              value={pin}
              onChange={e => setPin(e.target.value.replace(/\D/g, ''))}
              placeholder="••••" required autoFocus
            />
          </div>
          {err && (
            <div style={{ padding: '8px 12px', marginBottom: 12, background: 'rgba(255,59,48,.08)', border: '1px solid var(--t-danger)', color: 'var(--t-danger)', fontSize: 13 }}>
              {err}
            </div>
          )}
          <div className="approve-bar">
            <button className="btn-approve" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Set New PIN'}</button>
            <button className="btn-edit" type="button" onClick={onClose}>Cancel</button>
          </div>
        </form>
      </div>
    </div>
  )
}

/* Per-user forensic trail — filtered from the real audit log */
function AuditTrailModal({ user, auditRows, onClose }) {
  const log = auditRows.filter(r =>
    (r.actor_id && r.actor_id === user.id) ||
    (r.actor_name && r.actor_name === user.full_name) ||
    (r.target && (r.target === user.login_id || r.target === user.full_name))
  ).slice(0, 50)

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-box" style={{ maxWidth: 600 }}>
        <div className="modal-title">Audit Trail — {user.full_name}</div>
        {log.length === 0 ? (
          <div style={{ padding: 24, textAlign: 'center', color: 'var(--t-text-muted)', fontSize: 13 }}>
            No audit events recorded for this user yet.
          </div>
        ) : (
        <div className="card table-card" style={{ maxHeight: 360, overflowY: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th>When</th>
                <th>Action</th>
                <th>Target</th>
                <th>Result</th>
              </tr>
            </thead>
            <tbody>
              {log.map(r => (
                <tr key={r.id}>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11, whiteSpace: 'nowrap', color: 'var(--t-text-muted)' }}>{fmtDate(r.created_at)}</td>
                  <td><span className="tag">{r.action}</span></td>
                  <td style={{ fontSize: 12, color: 'var(--t-text-muted)' }}>{r.target || '—'}</td>
                  <td>
                    <span className={`badge ${r.result === 'Success' ? 'green' : 'red'}`}>
                      {r.result === 'Success' ? 'OK' : r.result || 'FAIL'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        )}
        <div className="approve-bar" style={{ marginTop: 16 }}>
          <button className="btn-edit" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  )
}

function TabUserManagement({ users, roles, nodes, locations, auditRows, actorId, onUsersChange }) {
  const [search,  setSearch]  = useState('')
  const [roleF,   setRoleF]   = useState('All')
  const [locF,    setLocF]    = useState('All')
  const [statusF, setStatusF] = useState('All')
  const [modal,   setModal]   = useState(null) // { type: 'add'|'edit'|'audit'|'pin', user? }
  const [msg,     setMsg]     = useState(null)

  function toast(text, ok = true) {
    setMsg({ text, ok })
    setTimeout(() => setMsg(null), 2500)
  }

  function handleSaved() {
    const wasAdd = modal?.type === 'add'
    setModal(null)
    toast(wasAdd ? 'User created.' : 'User updated.')
    onUsersChange()
  }

  async function setActive(u, active) {
    const verb = active ? 'Reactivate' : 'Deactivate'
    if (!window.confirm(`${verb} ${u.full_name}?`)) return
    const roleId = roles.find(r => r.name === u.role_name)?.id || null
    const nodeId = nodes.find(n => n.name === u.node_name)?.id || null
    if (!roleId || !nodeId) {
      toast(`Cannot resolve ${!roleId ? 'role' : 'location'} for ${u.full_name} — edit the user instead.`, false)
      return
    }
    const { data, error } = await sb.rpc('admin_update_person', {
      p_person_id: u.id, p_full_name: u.full_name,
      p_role_id: roleId, p_node_id: nodeId, p_is_active: active,
    })
    if (error) { toast(error.message, false); return }
    if (data && data.ok === false) { toast(data.error || `${verb} failed.`, false); return }
    logAudit(active ? 'User Reactivated' : 'User Deactivated', { target: u.full_name })
    toast(`${u.full_name} ${active ? 'reactivated' : 'deactivated'}.`)
    onUsersChange()
  }

  const roleNames = [...new Set(users.map(u => u.role_name).filter(Boolean))].sort()
  const locNames  = [...new Set(users.map(u => u.node_name).filter(Boolean))].sort()

  const filtered = users.filter(u => {
    const q = search.toLowerCase()
    const matchQ = !q || u.full_name?.toLowerCase().includes(q) || u.role_name?.toLowerCase().includes(q) || u.node_name?.toLowerCase().includes(q) || u.login_id?.toLowerCase().includes(q)
    const matchR = roleF === 'All' || u.role_name === roleF
    const matchL = locF  === 'All' || u.node_name === locF
    const matchS = statusF === 'All' || u.status === statusF
    return matchQ && matchR && matchL && matchS
  })

  return (
    <>
      {msg && (
        <div style={{
          position: 'fixed', top: 20, right: 20, zIndex: 9999,
          background: msg.ok ? 'var(--t-success)' : 'var(--t-danger)',
          color: '#fff', padding: '10px 20px', fontWeight: 700, fontSize: 13,
          borderRadius: 6, boxShadow: '0 4px 20px rgba(0,0,0,.3)',
        }}>
          {msg.text}
        </div>
      )}

      {/* Toolbar */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16 }}>
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search name, login, role, location…"
          style={{ flex: '1 1 200px', maxWidth: 300 }}
        />
        <select value={roleF} onChange={e => setRoleF(e.target.value)} style={{ flex: '0 0 auto' }}>
          <option value="All">All Roles</option>
          {roleNames.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
        <select value={locF} onChange={e => setLocF(e.target.value)} style={{ flex: '0 0 auto' }}>
          <option value="All">All Locations</option>
          {locNames.map(l => <option key={l} value={l}>{l}</option>)}
        </select>
        <select value={statusF} onChange={e => setStatusF(e.target.value)} style={{ flex: '0 0 auto' }}>
          <option value="All">All Statuses</option>
          <option value="Active">Active</option>
          <option value="Inactive">Inactive</option>
        </select>
        <button className="btn-approve" style={{ marginLeft: 'auto', whiteSpace: 'nowrap' }} onClick={() => setModal({ type: 'add' })}>
          + Add User
        </button>
      </div>

      {/* Table */}
      <div className="card table-card">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Role</th>
              <th>Location</th>
              <th>Status</th>
              <th>Last Login</th>
              <th>Assigned Since</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={7} style={{ textAlign: 'center', padding: 32, color: 'var(--t-text-muted)' }}>
                {users.length === 0 ? 'No users found in the selected scope.' : 'No users match the current filter.'}
              </td></tr>
            ) : filtered.map(u => (
              <tr key={u.id}>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div className="av">{initials(u.full_name)}</div>
                    <div>
                      <div style={{ fontWeight: 600 }}>{u.full_name}</div>
                      <div style={{ fontSize: 11, color: 'var(--t-text-faint)' }}>Login: {u.login_id || '—'}</div>
                    </div>
                  </div>
                </td>
                <td><span className="tag">{u.role_name || '—'}</span></td>
                <td style={{ color: 'var(--t-text-muted)', fontSize: 13 }}>{u.node_name || '—'}</td>
                <td>
                  <span className={`badge ${u.status === 'Active' ? 'green' : 'amber'}`}>
                    {u.status}
                  </span>
                </td>
                <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--t-text-muted)', whiteSpace: 'nowrap' }}>
                  {u.last_login ? fmtDate(u.last_login) : '—'}
                </td>
                <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--t-text-faint)', whiteSpace: 'nowrap' }}>
                  {fmtDateShort(u.effective_from)}
                </td>
                <td>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    <button className="action-btn-sm" onClick={() => setModal({ type: 'edit', user: u })}>Edit</button>
                    <button className="action-btn-sm" onClick={() => setModal({ type: 'pin', user: u })}>Reset PIN</button>
                    {u.is_active ? (
                      <button className="action-btn-sm" style={{ borderColor: 'var(--t-danger)', color: 'var(--t-danger)' }} onClick={() => setActive(u, false)}>Deactivate</button>
                    ) : (
                      <button className="action-btn-sm" style={{ borderColor: 'var(--t-success)', color: 'var(--t-success)' }} onClick={() => setActive(u, true)}>Reactivate</button>
                    )}
                    <button className="action-btn-sm" style={{ borderColor: 'var(--t-accent)', color: 'var(--t-accent)' }} onClick={() => setModal({ type: 'audit', user: u })}>Audit</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ marginTop: 8, fontSize: 12, color: 'var(--t-text-faint)' }}>
        Showing {filtered.length} of {users.length} users
      </div>

      {(modal?.type === 'add' || modal?.type === 'edit') && (
        <UserModal
          mode={modal.type} user={modal.user}
          roles={roles} locations={locations} actorId={actorId}
          onClose={() => setModal(null)} onSaved={handleSaved}
        />
      )}
      {modal?.type === 'pin' && (
        <PinResetModal
          user={modal.user} actorId={actorId}
          onClose={() => setModal(null)}
          onDone={() => { setModal(null); toast('PIN updated.') }}
        />
      )}
      {modal?.type === 'audit' && (
        <AuditTrailModal user={modal.user} auditRows={auditRows} onClose={() => setModal(null)} />
      )}
    </>
  )
}

/* ── Tab 2: System Health ─────────────────────────────────────
   Real, measured checks: each service row is an actual timed RPC round-trip
   run from this browser. Error feed = real audit-log failures + real
   integration error events. Nothing is simulated. */
function TabSystemHealth({ auditRows }) {
  const [checks,  setChecks]  = useState(null)   // null = running
  const [intLogs, setIntLogs] = useState([])
  const [running, setRunning] = useState(false)

  const runChecks = useCallback(async () => {
    setRunning(true)
    const targets = [
      { name: 'Database (roles RPC)',     fn: 'hr_list_roles',        args: {} },
      { name: 'Audit Log Service',        fn: 'get_audit_log',        args: { p_limit: 1 } },
      { name: 'Integrations Service',     fn: 'hr_integrations_list', args: {} },
      { name: 'Org Structure (nodes RPC)', fn: 'hr_list_nodes',       args: {} },
    ]
    const results = []
    for (const t of targets) {
      const t0 = performance.now()
      try {
        const { error } = await sb.rpc(t.fn, t.args)
        const ms = Math.round(performance.now() - t0)
        results.push({ name: t.name, ms, ok: !error, detail: error ? error.message : `${ms}ms round-trip` })
      } catch (ex) {
        results.push({ name: t.name, ms: Math.round(performance.now() - t0), ok: false, detail: ex.message || 'request failed' })
      }
    }
    setChecks(results)
    setRunning(false)
  }, [])

  useEffect(() => {
    runChecks()
    sb.rpc('hr_logs_list', { p_node_ids: null, p_integration_id: null, p_event_type: null, p_limit: 50 })
      .then(({ data }) => setIntLogs(Array.isArray(data) ? data : []))
      .catch(() => setIntLogs([]))
  }, [runChecks])

  const auditFails = auditRows.filter(r => r.result !== 'Success').slice(0, 20)
  const intErrors  = intLogs.filter(l => l.status === 'error')
  const passing = checks ? checks.filter(c => c.ok).length : 0
  const avgMs = checks && checks.length ? Math.round(checks.reduce((s, c) => s + c.ms, 0) / checks.length) : null
  const errorCount = auditFails.length + intErrors.length

  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 20 }}>
        <KTile label="Service Checks" value={checks ? `${passing}/${checks.length}` : '…'}
               color={checks && passing < checks.length ? 'var(--t-danger)' : 'var(--t-success)'}
               sub="live RPC round-trips" alert={checks && passing < checks.length ? 'red' : undefined} />
        <KTile label="Avg Round-Trip" value={avgMs == null ? '…' : `${avgMs}ms`}
               color={avgMs != null && avgMs > 800 ? 'var(--t-warn)' : 'var(--t-text)'} sub="measured just now" />
        <KTile label="Audit Failures" value={auditFails.length}
               color={auditFails.length > 0 ? 'var(--t-warn)' : 'var(--t-success)'} sub="recent non-success events"
               alert={auditFails.length > 0 ? 'amber' : undefined} />
        <KTile label="Integration Errors" value={intErrors.length}
               color={intErrors.length > 0 ? 'var(--t-warn)' : 'var(--t-success)'} sub="from sync logs"
               alert={intErrors.length > 0 ? 'amber' : undefined} />
      </div>

      {/* Measured service checks */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
          <div className="section-title" style={{ marginBottom: 0 }}>Service Checks</div>
          <button className="action-btn-sm" style={{ marginLeft: 'auto' }} onClick={runChecks} disabled={running}>
            {running ? 'Running…' : 'Re-run Checks'}
          </button>
        </div>
        {!checks ? (
          <div style={{ padding: 16, color: 'var(--t-text-muted)', fontSize: 13 }}>Running live checks…</div>
        ) : (
          <div style={{ display: 'grid', gap: 0 }}>
            {checks.map((c, i) => (
              <div key={c.name} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '12px 0', borderBottom: i < checks.length - 1 ? '1px solid var(--t-line)' : 'none',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: c.ok ? 'var(--t-success)' : 'var(--t-danger)', flexShrink: 0 }} />
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{c.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--t-text-faint)' }}>{c.detail}</div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: c.ok ? 'var(--t-text-muted)' : 'var(--t-danger)' }}>{c.ms}ms</span>
                  <span className={`badge ${c.ok ? 'green' : 'red'}`}>{c.ok ? 'Reachable' : 'Failed'}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Real failure feed */}
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
          <div className="section-title" style={{ marginBottom: 0 }}>Recent Failures</div>
          <span className={`badge ${errorCount > 0 ? 'amber' : 'green'}`}>{errorCount} recorded</span>
        </div>
        {errorCount === 0 ? (
          <div style={{ padding: 20, textAlign: 'center', color: 'var(--t-text-muted)', fontSize: 13 }}>
            No failures recorded in the audit log or integration sync logs.
          </div>
        ) : (
        <div className="card table-card">
          <table>
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Source</th>
                <th>Detail</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {auditFails.map(r => (
                <tr key={`a-${r.id}`}>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11, whiteSpace: 'nowrap', color: 'var(--t-text-muted)' }}>{fmtDate(r.created_at)}</td>
                  <td><span className="tag">Audit — {r.action}</span></td>
                  <td style={{ fontSize: 12, color: 'var(--t-text-muted)', maxWidth: 340 }}>
                    {[r.actor_name, r.target].filter(Boolean).join(' → ') || '—'}
                  </td>
                  <td><span className="badge red">{r.result}</span></td>
                </tr>
              ))}
              {intErrors.map(l => (
                <tr key={`i-${l.id}`}>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11, whiteSpace: 'nowrap', color: 'var(--t-text-muted)' }}>{fmtDate(l.created_at)}</td>
                  <td><span className="tag">Integration — {l.integration_name || l.event_type}</span></td>
                  <td style={{ fontSize: 12, color: 'var(--t-text-muted)', maxWidth: 340 }}>{l.detail || '—'}</td>
                  <td><span className="badge red">Error</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        )}
      </div>
    </>
  )
}

/* ── Tab 3: Location Management ──────────────────────────────
   Locations come from the real org structure (hr_list_nodes); headcount and
   manager are derived live from the roster. Editable operations profile
   (address / phone / hours / staffing) persists via hr_location_profiles. */
function TabLocationManagement({ locations, users, actorId }) {
  const [profiles, setProfiles] = useState({})
  const [profErr,  setProfErr]  = useState(null)
  const [loading,  setLoading]  = useState(true)
  const [editing,  setEditing]  = useState(null)
  const [form,     setForm]     = useState({})
  const [saved,    setSaved]    = useState(false)
  const [saveErr,  setSaveErr]  = useState(null)

  const loadProfiles = useCallback(async () => {
    setLoading(true)
    setProfErr(null)
    try {
      const { data, error } = await sb.rpc('get_location_profiles', {
        p_node_ids: locations.length ? locations.map(l => l.id) : null,
      })
      if (error) throw error
      const map = {}
      ;(Array.isArray(data) ? data : []).forEach(p => { map[p.node_id] = p })
      setProfiles(map)
    } catch (e) {
      setProfErr(e.message || 'Could not load location profiles.')
    }
    setLoading(false)
  }, [locations.map(l => l.id).join(',')])

  useEffect(() => { loadProfiles() }, [loadProfiles])

  function startEdit(loc) {
    const p = profiles[loc.id] || {}
    setSaveErr(null)
    setEditing(loc.id)
    setForm({
      address: p.address || '', phone: p.phone || '', hours: p.hours || '',
      status: p.status || 'Active',
      max_headcount: p.max_headcount ?? '', min_staffing: p.min_staffing ?? '',
    })
  }

  async function saveEdit(loc) {
    setSaveErr(null)
    const { data, error } = await sb.rpc('upsert_location_profile', {
      p_node_id:       loc.id,
      p_address:       form.address,
      p_phone:         form.phone,
      p_hours:         form.hours,
      p_status:        form.status,
      p_max_headcount: form.max_headcount === '' ? null : +form.max_headcount,
      p_min_staffing:  form.min_staffing === '' ? null : +form.min_staffing,
      p_actor:         actorId,
    })
    if (error) { setSaveErr(error.message); return }
    if (data && data.ok === false) { setSaveErr(data.error || 'Save failed.'); return }
    logAudit('Location Profile Updated', { target: loc.name, node: loc.name })
    setEditing(null)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
    loadProfiles()
  }

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <div className="section-title" style={{ marginBottom: 0 }}>Locations ({locations.length})</div>
        {saved && <span className="badge green">Saved</span>}
        <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--t-text-faint)' }}>
          Locations are provisioned in the org structure — this panel edits their operations profile.
        </span>
      </div>

      {profErr && (
        <div style={{ padding: '10px 14px', marginBottom: 16, background: 'rgba(255,59,48,.08)', border: '1px solid var(--t-danger)', color: 'var(--t-danger)', fontSize: 13 }}>
          Location profiles unavailable — {profErr}
        </div>
      )}
      {saveErr && (
        <div style={{ padding: '10px 14px', marginBottom: 16, background: 'rgba(255,59,48,.08)', border: '1px solid var(--t-danger)', color: 'var(--t-danger)', fontSize: 13 }}>
          {saveErr}
        </div>
      )}

      {locations.length === 0 ? (
        <div className="card" style={{ padding: 32, textAlign: 'center', color: 'var(--t-text-muted)', fontSize: 13 }}>
          No locations in the selected scope.
        </div>
      ) : (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}>
        {locations.map(loc => {
          const p = profiles[loc.id] || {}
          const locUsers = users.filter(u => u.node_name === loc.name)
          const mgr = locUsers.find(u => /manager/i.test(u.role_name || ''))?.full_name || 'Unassigned'
          const status = p.status || 'Active'
          return (
            <div key={loc.id} className="card">
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--t-accent)', marginBottom: 2 }}>{loc.name}</div>
                  <span className={`badge ${status === 'Active' ? 'green' : status === 'Closed' ? 'red' : 'amber'}`}>{status}</span>
                </div>
                {editing !== loc.id && (
                  <button className="action-btn-sm" onClick={() => startEdit(loc)} disabled={loading}>Edit</button>
                )}
              </div>

              {editing === loc.id ? (
                <div style={{ display: 'grid', gap: 10 }}>
                  {[['Address', 'address'], ['Phone', 'phone'], ['Hours', 'hours']].map(([lbl, key]) => (
                    <div key={key} className="form-row" style={{ margin: 0 }}>
                      <label className="form-label">{lbl}</label>
                      <input value={form[key] || ''} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} />
                    </div>
                  ))}
                  <div className="form-row" style={{ margin: 0 }}>
                    <label className="form-label">Status</label>
                    <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
                      <option value="Active">Active</option>
                      <option value="Under Review">Under Review</option>
                      <option value="Closed">Closed</option>
                    </select>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <div className="form-row" style={{ margin: 0 }}>
                      <label className="form-label">Max Headcount</label>
                      <input type="number" value={form.max_headcount} onChange={e => setForm(f => ({ ...f, max_headcount: e.target.value }))} />
                    </div>
                    <div className="form-row" style={{ margin: 0 }}>
                      <label className="form-label">Min Staffing</label>
                      <input type="number" value={form.min_staffing} onChange={e => setForm(f => ({ ...f, min_staffing: e.target.value }))} />
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn-approve" onClick={() => saveEdit(loc)}>Save Changes</button>
                    <button className="btn-edit" onClick={() => setEditing(null)}>Cancel</button>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'grid', gap: 6 }}>
                  {[
                    ['Address',       p.address || '—'],
                    ['Phone',         p.phone || '—'],
                    ['Hours',         p.hours || '—'],
                    ['Manager',       mgr],
                    ['Headcount',     `${locUsers.length} on roster (${locUsers.filter(u => u.is_active).length} active)`],
                    ['Max Headcount', p.max_headcount != null ? `${p.max_headcount} staff` : '—'],
                    ['Min Staffing',  p.min_staffing != null ? `${p.min_staffing} per shift` : '—'],
                  ].map(([k, v]) => (
                    <div key={k} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--t-text-muted)', textTransform: 'uppercase', letterSpacing: '.06em', minWidth: 100, paddingTop: 1 }}>{k}</span>
                      <span style={{ fontSize: 13, color: 'var(--t-text)' }}>{v}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
      )}
    </>
  )
}

/* ── Tab 4: Integrations ─────────────────────────────────────
   Live hr_integrations rows + real sync/event logs. "Test" uses the same
   honest semantics as the Integrations screen: an integration with a saved
   endpoint reports connected, otherwise a warning — persisted server-side. */
function TabIntegrations({ locationIds, actorId }) {
  const [integrations, setIntegrations] = useState([])
  const [logs,     setLogs]     = useState([])
  const [loading,  setLoading]  = useState(true)
  const [loadErr,  setLoadErr]  = useState(null)
  const [testing,  setTesting]  = useState(null)
  const [msg,      setMsg]      = useState(null)

  function toast(text, ok = true) {
    setMsg({ text, ok })
    setTimeout(() => setMsg(null), 2500)
  }

  const load = useCallback(async () => {
    setLoading(true)
    setLoadErr(null)
    try {
      const p = locationIds.length ? locationIds : null
      const [ints, lgs] = await Promise.all([
        sb.rpc('hr_integrations_list', { p_node_ids: p }),
        sb.rpc('hr_logs_list', { p_node_ids: p, p_integration_id: null, p_event_type: null, p_limit: 50 }),
      ])
      if (ints.error) throw ints.error
      setIntegrations(Array.isArray(ints.data) ? ints.data : [])
      setLogs(Array.isArray(lgs.data) ? lgs.data : [])
    } catch (e) {
      setLoadErr(e.message || 'Could not load integrations.')
    }
    setLoading(false)
  }, [locationIds.join(',')])

  useEffect(() => { load() }, [load])

  async function handleTest(integ) {
    setTesting(integ.id)
    try {
      const ok = Boolean(integ.config?.endpoint_url)
      const { data, error } = await sb.rpc('hr_integration_set_status', {
        p_id: integ.id, p_status: ok ? 'connected' : 'warning', p_actor: actorId,
      })
      if (error) throw error
      if (data && data.ok === false) throw new Error(data.error || 'test failed')
      toast(ok ? `${integ.name} — connection successful` : `${integ.name} — no endpoint configured`, ok)
      await load()
    } catch (e) {
      toast(`Test failed — ${e.message || e}`, false)
    }
    setTesting(null)
  }

  async function setStatus(integ, status) {
    try {
      const { data, error } = await sb.rpc('hr_integration_set_status', {
        p_id: integ.id, p_status: status, p_actor: actorId,
      })
      if (error) throw error
      if (data && data.ok === false) throw new Error(data.error || 'update failed')
      logAudit('Integration Status Changed', { target: `${integ.name} → ${status}` })
      toast(`${integ.name} ${status === 'connected' ? 'reconnected' : 'disconnected'}.`, status === 'connected')
      await load()
    } catch (e) {
      toast(`Could not update — ${e.message || e}`, false)
    }
  }

  const connected = integrations.filter(i => i.status === 'connected').length
  const degraded  = integrations.filter(i => i.status === 'warning').length
  const down      = integrations.filter(i => i.status === 'disconnected').length

  if (loading) {
    return <div className="card" style={{ padding: 32, textAlign: 'center', color: 'var(--t-text-muted)', fontSize: 13 }}>Loading integrations…</div>
  }
  if (loadErr) {
    return (
      <div style={{ padding: '10px 14px', background: 'rgba(255,59,48,.08)', border: '1px solid var(--t-danger)', color: 'var(--t-danger)', fontSize: 13 }}>
        Integrations unavailable — {loadErr}
      </div>
    )
  }

  return (
    <>
      {msg && (
        <div style={{
          position: 'fixed', top: 20, right: 20, zIndex: 9999,
          background: msg.ok ? 'var(--t-success)' : 'var(--t-danger)',
          color: '#fff', padding: '10px 20px', fontWeight: 700, fontSize: 13,
          borderRadius: 6, boxShadow: '0 4px 20px rgba(0,0,0,.3)',
        }}>
          {msg.text}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 20 }}>
        <KTile label="Total Integrations" value={integrations.length} sub="configured" />
        <KTile label="Connected"          value={connected} color="var(--t-success)" sub="operational" />
        <KTile label="Warning"            value={degraded}  color="var(--t-warn)"    sub="check config"  alert={degraded > 0 ? 'amber' : undefined} />
        <KTile label="Disconnected"       value={down}      color="var(--t-danger)"  sub="needs attention" alert={down > 0 ? 'red' : undefined} />
      </div>

      {integrations.length === 0 ? (
        <div className="card" style={{ padding: 32, textAlign: 'center', color: 'var(--t-text-muted)', fontSize: 13 }}>
          No integrations configured yet. Add and configure them in the Integrations screen.
        </div>
      ) : (
      <div style={{ display: 'grid', gap: 12, marginBottom: 16 }}>
        {integrations.map(integ => (
          <div key={integ.id} className="card" style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: '1 1 200px' }}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', flexShrink: 0, background: integ.status === 'connected' ? 'var(--t-success)' : integ.status === 'warning' ? 'var(--t-warn)' : 'var(--t-danger)' }} />
              <div>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{integ.name}</div>
                <div style={{ fontSize: 11, color: 'var(--t-text-faint)' }}>{integ.description || integ.category || '—'}</div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, flex: '1 1 200px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 11, color: 'var(--t-text-muted)', marginBottom: 2 }}>Last sync</div>
                <div style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--t-text-faint)' }}>
                  {integ.last_sync_at ? fmtDate(integ.last_sync_at) : 'never'}
                </div>
              </div>
              <span className={`badge ${integ.status === 'connected' ? 'green' : integ.status === 'warning' ? 'amber' : 'red'}`}>
                {integ.status === 'connected' ? 'Connected' : integ.status === 'warning' ? 'Warning' : 'Disconnected'}
              </span>
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  className="action-btn-sm"
                  style={{ borderColor: 'var(--t-accent)', color: 'var(--t-accent)', minWidth: 80 }}
                  onClick={() => handleTest(integ)}
                  disabled={testing === integ.id}
                >
                  {testing === integ.id ? 'Testing…' : 'Test'}
                </button>
                {integ.status === 'disconnected' ? (
                  <button className="action-btn-sm" onClick={() => setStatus(integ, 'connected')}>Reconnect</button>
                ) : (
                  <button className="action-btn-sm" style={{ borderColor: 'var(--t-danger)', color: 'var(--t-danger)' }} onClick={() => setStatus(integ, 'disconnected')}>Disconnect</button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
      )}

      {/* Real sync/event log */}
      <div className="card">
        <div className="section-title" style={{ marginBottom: 14 }}>Recent Events</div>
        {logs.length === 0 ? (
          <div style={{ padding: 16, textAlign: 'center', color: 'var(--t-text-muted)', fontSize: 13 }}>No integration events recorded yet.</div>
        ) : (
        <div className="card table-card">
          <table>
            <thead>
              <tr>
                <th>When</th>
                <th>Integration</th>
                <th>Event</th>
                <th>Detail</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {logs.map(l => (
                <tr key={l.id}>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11, whiteSpace: 'nowrap', color: 'var(--t-text-muted)' }}>{fmtDate(l.created_at)}</td>
                  <td style={{ fontSize: 13 }}>{l.integration_name || '—'}</td>
                  <td><span className="tag">{l.event_type}</span></td>
                  <td style={{ fontSize: 12, color: 'var(--t-text-muted)', maxWidth: 300 }}>{l.detail || '—'}</td>
                  <td><span className={`badge ${l.status === 'ok' ? 'green' : 'red'}`}>{l.status === 'ok' ? 'OK' : 'Error'}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        )}
      </div>
    </>
  )
}

/* ── Tab 5: Security & Audit ─────────────────────────────────
   Login attempts + audit trail from the real audit_log; password policy and
   IP allow-list persist via hr_security_settings. */
function TabSecurityAudit({ auditRows, loginRows, actorId }) {
  const [settings,   setSettings]   = useState(null)
  const [setErrMsg,  setSetErrMsg]  = useState(null)
  const [saving,     setSaving]     = useState(false)
  const [saved,      setSaved]      = useState(false)
  const [newIp,      setNewIp]      = useState('')
  const [filterLogin, setFilterLogin] = useState('All')

  const loadSettings = useCallback(async () => {
    setSetErrMsg(null)
    try {
      const { data, error } = await sb.rpc('get_security_settings')
      if (error) throw error
      setSettings(data && typeof data === 'object' ? data : null)
    } catch (e) {
      setSetErrMsg(e.message || 'Could not load security settings.')
    }
  }, [])

  useEffect(() => { loadSettings() }, [loadSettings])

  async function persist(next) {
    setSaving(true)
    setSetErrMsg(null)
    try {
      const { data, error } = await sb.rpc('save_security_settings', {
        p_min_pw_len:          next.min_pw_len,
        p_session_timeout_min: next.session_timeout_min,
        p_max_failed_logins:   next.max_failed_logins,
        p_require_2fa:         next.require_2fa,
        p_ip_whitelist:        next.ip_whitelist,
        p_actor:               actorId,
      })
      if (error) throw error
      if (data && data.ok === false) throw new Error(data.error || 'save failed')
      logAudit('Security Policy Updated')
      setSettings(s => ({ ...s, ...next, persisted: true }))
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (e) {
      setSetErrMsg(e.message || 'Save failed.')
    }
    setSaving(false)
  }

  function setLocal(k, v) { setSettings(s => ({ ...s, [k]: v })) }

  function addIp() {
    const ip = newIp.trim()
    if (!ip || !settings) return
    const list = Array.isArray(settings.ip_whitelist) ? settings.ip_whitelist : []
    if (list.includes(ip)) return
    persist({ ...settings, ip_whitelist: [...list, ip] })
    setNewIp('')
  }

  function removeIp(ip) {
    if (!settings) return
    const list = (Array.isArray(settings.ip_whitelist) ? settings.ip_whitelist : []).filter(x => x !== ip)
    persist({ ...settings, ip_whitelist: list })
  }

  const failedLogins  = loginRows.filter(l => l.result !== 'Success').length
  const successLogins = loginRows.filter(l => l.result === 'Success').length
  const ipList = settings && Array.isArray(settings.ip_whitelist) ? settings.ip_whitelist : []

  const filteredLogins = loginRows.filter(l =>
    filterLogin === 'All' ? true : filterLogin === 'Success' ? l.result === 'Success' : l.result !== 'Success'
  ).slice(0, 50)

  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 20 }}>
        <KTile label="Login Attempts" value={loginRows.length} sub="recorded in audit log" />
        <KTile label="Successful"     value={successLogins} color="var(--t-success)" sub="authenticated" />
        <KTile label="Failed"         value={failedLogins}  color="var(--t-danger)"  sub="non-success" alert={failedLogins > 2 ? 'amber' : undefined} />
        <KTile label="IP Whitelist"   value={settings ? ipList.length : '—'} color="var(--t-accent)" sub="allowed ranges" />
      </div>

      {setErrMsg && (
        <div style={{ padding: '10px 14px', marginBottom: 16, background: 'rgba(255,59,48,.08)', border: '1px solid var(--t-danger)', color: 'var(--t-danger)', fontSize: 13 }}>
          Security settings — {setErrMsg}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        {/* Password policy */}
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
            <div className="section-title" style={{ marginBottom: 0 }}>Password Policy</div>
            {saved && <span className="badge green">Saved</span>}
            {settings && settings.persisted === false && <span className="badge amber">Defaults — not yet saved</span>}
          </div>
          {!settings ? (
            <div style={{ padding: 12, color: 'var(--t-text-muted)', fontSize: 13 }}>
              {setErrMsg ? 'Policy unavailable.' : 'Loading policy…'}
            </div>
          ) : (
          <>
            {[
              { label: 'Min password length', key: 'min_pw_len',          min: 6, max: 24,  unit: 'chars' },
              { label: 'Session timeout',     key: 'session_timeout_min', min: 5, max: 120, unit: 'min' },
              { label: 'Max failed logins',   key: 'max_failed_logins',   min: 3, max: 10,  unit: 'attempts' },
            ].map(({ label, key, min, max, unit }) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--t-line)' }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>{label}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input type="range" min={min} max={max} value={settings[key] ?? min} onChange={e => setLocal(key, +e.target.value)} style={{ width: 80 }} />
                  <span style={{ fontSize: 13, fontFamily: 'var(--font-mono)', color: 'var(--t-accent)', minWidth: 60 }}>{settings[key]} {unit}</span>
                </div>
              </div>
            ))}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--t-line)' }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>Require 2FA for Admins</span>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <span style={{ fontSize: 12, color: settings.require_2fa ? 'var(--t-success)' : 'var(--t-text-muted)' }}>{settings.require_2fa ? 'On' : 'Off'}</span>
                <span
                  onClick={() => setLocal('require_2fa', !settings.require_2fa)}
                  role="switch"
                  style={{ display: 'inline-block', width: 40, height: 22, borderRadius: 11, background: settings.require_2fa ? 'var(--t-success)' : 'var(--t-line)', position: 'relative', cursor: 'pointer', transition: 'background .2s' }}
                >
                  <span style={{ display: 'block', width: 16, height: 16, borderRadius: '50%', background: 'white', position: 'absolute', top: 3, left: settings.require_2fa ? 21 : 3, transition: 'left .2s', boxShadow: '0 1px 3px rgba(0,0,0,.25)' }} />
                </span>
              </label>
            </div>
            <button className="btn-approve" style={{ marginTop: 16 }} onClick={() => persist(settings)} disabled={saving}>
              {saving ? 'Saving…' : 'Save Policy'}
            </button>
          </>
          )}
        </div>

        {/* IP Whitelist */}
        <div className="card">
          <div className="section-title" style={{ marginBottom: 14 }}>IP Whitelist</div>
          {!settings ? (
            <div style={{ padding: 12, color: 'var(--t-text-muted)', fontSize: 13 }}>
              {setErrMsg ? 'Whitelist unavailable.' : 'Loading…'}
            </div>
          ) : (
          <>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <input
                value={newIp} onChange={e => setNewIp(e.target.value)}
                placeholder="e.g. 203.0.113.50 or 10.0.0.0/8"
                onKeyDown={e => e.key === 'Enter' && addIp()}
                style={{ flex: 1 }}
              />
              <button className="btn-approve" onClick={addIp} disabled={saving}>Add</button>
            </div>
            {ipList.length === 0 ? (
              <div style={{ padding: 12, color: 'var(--t-text-muted)', fontSize: 13 }}>No IP restrictions configured — all addresses allowed.</div>
            ) : (
            <div style={{ display: 'grid', gap: 6 }}>
              {ipList.map(ip => (
                <div key={ip} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', background: 'var(--t-surface-2)', borderRadius: 4 }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13 }}>{ip}</span>
                  <button
                    onClick={() => removeIp(ip)}
                    disabled={saving}
                    style={{ background: 'none', border: 'none', color: 'var(--t-danger)', cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: '0 4px' }}
                  >×</button>
                </div>
              ))}
            </div>
            )}
          </>
          )}
        </div>
      </div>

      {/* Login attempts — real audit_log rows (action = Login) */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
          <div className="section-title" style={{ marginBottom: 0 }}>Login Attempts</div>
          <select value={filterLogin} onChange={e => setFilterLogin(e.target.value)} style={{ marginLeft: 'auto' }}>
            <option value="All">All</option>
            <option value="Success">Success Only</option>
            <option value="Failed">Failed Only</option>
          </select>
        </div>
        {filteredLogins.length === 0 ? (
          <div style={{ padding: 20, textAlign: 'center', color: 'var(--t-text-muted)', fontSize: 13 }}>No login attempts recorded.</div>
        ) : (
        <div className="card table-card">
          <table>
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>User</th>
                <th>Login ID</th>
                <th>Role</th>
                <th>Result</th>
              </tr>
            </thead>
            <tbody>
              {filteredLogins.map(l => (
                <tr key={l.id}>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11, whiteSpace: 'nowrap', color: 'var(--t-text-muted)' }}>{fmtDate(l.created_at)}</td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div className="av" style={{ width: 22, height: 22, fontSize: 9, flexShrink: 0 }}>{initials(l.actor_name)}</div>
                      <span style={{ fontWeight: 600, fontSize: 13 }}>{l.actor_name || '—'}</span>
                    </div>
                  </td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--t-text-faint)' }}>{l.target || '—'}</td>
                  <td><span className="tag">{l.actor_role || '—'}</span></td>
                  <td>
                    <span className={`badge ${l.result === 'Success' ? 'green' : 'red'}`}>
                      {l.result === 'Success' ? 'Success' : 'Failed'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        )}
      </div>

      {/* Audit log — real events */}
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
          <div className="section-title" style={{ marginBottom: 0 }}>Audit Log</div>
          <span className="badge blue">{auditRows.length} recent entries</span>
        </div>
        {auditRows.length === 0 ? (
          <div style={{ padding: 20, textAlign: 'center', color: 'var(--t-text-muted)', fontSize: 13 }}>No audit events recorded yet.</div>
        ) : (
        <>
        <div className="card table-card">
          <table>
            <thead>
              <tr>
                <th>When</th>
                <th>User</th>
                <th>Action</th>
                <th>Target</th>
                <th>Result</th>
              </tr>
            </thead>
            <tbody>
              {auditRows.slice(0, 20).map(r => (
                <tr key={r.id}>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11, whiteSpace: 'nowrap', color: 'var(--t-text-muted)' }}>{fmtDate(r.created_at)}</td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div className="av" style={{ width: 22, height: 22, fontSize: 9, flexShrink: 0 }}>{initials(r.actor_name)}</div>
                      <span style={{ fontWeight: 600, fontSize: 13 }}>{r.actor_name || '—'}</span>
                    </div>
                  </td>
                  <td><span className="tag">{r.action || '—'}</span></td>
                  <td style={{ fontSize: 13, color: 'var(--t-text-muted)' }}>{r.target || '—'}</td>
                  <td>
                    <span className={`badge ${r.result === 'Success' ? 'green' : 'red'}`}>{r.result || '—'}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ marginTop: 12, fontSize: 12, color: 'var(--t-text-faint)' }}>
          Showing {Math.min(20, auditRows.length)} of {auditRows.length} entries — full history in the Audit Log screen
        </div>
        </>
        )}
      </div>
    </>
  )
}

/* ── Lock screen ──────────────────────────────────────────── */
function LockScreen() {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      minHeight: '60vh', gap: 16,
    }}>
      <div style={{ fontSize: 48, color: 'var(--t-line)' }}>🔒</div>
      <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--t-text)' }}>Admin access required</div>
      <div style={{ fontSize: 14, color: 'var(--t-text-muted)', textAlign: 'center', maxWidth: 360 }}>
        This panel is restricted to HR Managers, COOs, and platform Admins.<br />
        Contact your administrator if you believe this is an error.
      </div>
    </div>
  )
}

/* ── Root ─────────────────────────────────────────────────── */
export default function AdminPanel() {
  const { session }               = useAuth()
  const { locationIds, locations } = useScope()
  const [tab, setTab]             = useState('users')
  const [users, setUsers]         = useState([])
  const [roles, setRoles]         = useState([])
  const [nodes, setNodes]         = useState([])   // all org nodes (hr_list_nodes)
  const [auditRows, setAuditRows] = useState([])
  const [loginRows, setLoginRows] = useState([])
  const [dbLatency, setDbLatency] = useState(null)
  const [loaded, setLoaded]       = useState(false)
  const [loadErr, setLoadErr]     = useState(null)

  const actorId = session?.person?.id || null
  const r = session?.person?.role_name || ''
  const isHR = ['ceo', 'hr', 'manager', 'coo', 'admin', 'owner'].some(x => r.toLowerCase().includes(x))

  const loadAll = useCallback(async () => {
    setLoadErr(null)
    try {
      const t0 = performance.now()
      const rolesRes = await sb.rpc('hr_list_roles')
      setDbLatency(Math.round(performance.now() - t0))
      if (rolesRes.error) throw rolesRes.error

      const [nodesRes, rosterRes] = await Promise.all([
        sb.rpc('hr_list_nodes'),
        sb.rpc('get_roster', { p_node_ids: locationIds, p_actor: actorId }),
      ])
      if (nodesRes.error)  throw nodesRes.error
      if (rosterRes.error) throw rosterRes.error

      const [audit, logins] = await Promise.all([
        fetchAuditLog({ limit: 500 }),
        fetchAuditLog({ action: 'Login', limit: 500 }),
      ])

      /* last successful login per person — real audit rows, newest first */
      const lastLogin = {}
      logins.forEach(row => {
        if (row.result !== 'Success') return
        if (row.actor_id   && !lastLogin[row.actor_id])   lastLogin[row.actor_id]   = row.created_at
        if (row.actor_name && !lastLogin[row.actor_name]) lastLogin[row.actor_name] = row.created_at
      })

      setRoles(Array.isArray(rolesRes.data) ? rolesRes.data : [])
      setNodes(Array.isArray(nodesRes.data) ? nodesRes.data : [])
      setUsers((Array.isArray(rosterRes.data) ? rosterRes.data : []).map(u => ({
        ...u,
        status: u.is_active ? 'Active' : 'Inactive',
        last_login: lastLogin[u.id] || lastLogin[u.full_name] || null,
      })))
      setAuditRows(audit)
      setLoginRows(logins)
    } catch (e) {
      setLoadErr(e.message || 'Failed to load admin data.')
    }
    setLoaded(true)
  }, [locationIds.join(','), actorId])

  useEffect(() => { if (isHR) loadAll() }, [isHR, loadAll])

  if (!isHR) return <LockScreen />

  const allLocations = nodes.filter(n => n.node_type === 'location')
  const scopedLocations = locations.length
    ? allLocations.filter(n => locationIds.includes(n.id))
    : allLocations

  const TABS = [
    { id: 'users',        label: 'User Management'     },
    { id: 'health',       label: 'System Health'       },
    { id: 'locations',    label: 'Location Management' },
    { id: 'integrations', label: 'Integrations'        },
    { id: 'security',     label: 'Security & Audit'    },
  ]

  return (
    <>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
        <div className="section-title" style={{ marginBottom: 0 }}>Admin Panel</div>
        <span className="badge amber">Admin Only</span>
        {session?.person?.full_name && (
          <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--t-text-muted)' }}>
            Signed in as <strong style={{ color: 'var(--t-text)' }}>{session.person.full_name}</strong>
          </span>
        )}
      </div>

      {loadErr && (
        <div style={{ padding: '10px 14px', margin: '12px 0', background: 'rgba(255,59,48,.08)', border: '1px solid var(--t-danger)', color: 'var(--t-danger)', fontSize: 13 }}>
          Could not load admin data — {loadErr}
          <button className="action-btn-sm" style={{ marginLeft: 12 }} onClick={loadAll}>Retry</button>
        </div>
      )}

      {/* Forensic KPI panel — always visible, all real */}
      {loaded && !loadErr && (
        <ForensicKPIs
          users={users} locations={scopedLocations}
          auditRows={auditRows} loginRows={loginRows}
          dbLatency={dbLatency} rolesCount={roles.length}
        />
      )}
      {!loaded && (
        <div style={{ height: 120, background: 'var(--t-surface)', border: '1px solid var(--t-line)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--t-text-muted)', fontSize: 13, marginBottom: 24 }}>
          Loading live admin data…
        </div>
      )}

      {/* Tabs */}
      <div className="tabs" style={{ marginBottom: 20, overflowX: 'auto' }}>
        {TABS.map(t => (
          <button
            key={t.id}
            className={`tab-btn${tab === t.id ? ' active' : ''}`}
            onClick={() => setTab(t.id)}
            style={{ whiteSpace: 'nowrap' }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab panels */}
      {tab === 'users' && (
        <TabUserManagement
          users={users} roles={roles} nodes={nodes} locations={allLocations}
          auditRows={auditRows} actorId={actorId} onUsersChange={loadAll}
        />
      )}
      {tab === 'health'       && <TabSystemHealth auditRows={auditRows} />}
      {tab === 'locations'    && <TabLocationManagement locations={scopedLocations} users={users} actorId={actorId} />}
      {tab === 'integrations' && <TabIntegrations locationIds={locationIds} actorId={actorId} />}
      {tab === 'security'     && <TabSecurityAudit auditRows={auditRows} loginRows={loginRows} actorId={actorId} />}
    </>
  )
}
