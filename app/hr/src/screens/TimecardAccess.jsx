// TimecardAccess.jsx — Admin-only. Assign which employees may EDIT timecards.
// Admins/execs always can; everyone else edits only if granted here. Employees
// cannot edit unless explicitly granted. Backed by feature_grants('timecard_edit').
import { useState, useEffect, useCallback, useMemo } from 'react'
import { sb } from '../lib/supabase'
import { useAuth } from '../lib/auth.jsx'
import { useScope } from '../lib/scope.jsx'

const FEATURE = 'timecard_edit'
const ADMIN_RX = /admin|owner|coo|ceo|cfo|president|chief/i
const fmtDT = (d) => d ? new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—'
const initials = (n) => !n ? '?' : n.split(' ').map(x => x[0]).slice(0, 2).join('').toUpperCase()

function Toggle({ on, onChange, disabled }) {
  return (
    <label style={{ position: 'relative', display: 'inline-block', width: 40, height: 22, opacity: disabled ? 0.5 : 1 }}>
      <input type="checkbox" checked={on} disabled={disabled} onChange={e => onChange(e.target.checked)} style={{ opacity: 0, width: 0, height: 0 }} />
      <span style={{ position: 'absolute', cursor: disabled ? 'default' : 'pointer', inset: 0, background: on ? 'var(--t-success)' : 'var(--t-surface-2)', border: '1px solid var(--t-line)', borderRadius: 22, transition: '.2s' }}>
        <span style={{ position: 'absolute', height: 16, width: 16, left: on ? 21 : 3, bottom: 2, background: '#fff', borderRadius: '50%', transition: '.2s' }} />
      </span>
    </label>
  )
}

export default function TimecardAccess() {
  const { session } = useAuth()
  const { locationIds } = useScope()
  const role = session?.person?.role_name || ''
  const isAdmin = ADMIN_RX.test(role)

  const [roster, setRoster] = useState([])
  const [grants, setGrants] = useState([])
  const [loading, setLoading] = useState(false)
  const [q, setQ] = useState('')
  const [toast, setToast] = useState(null)

  const load = useCallback(async () => {
    if (!locationIds?.length) return
    setLoading(true)
    try {
      const [r, g] = await Promise.all([
        sb.rpc('get_roster', { p_node_ids: locationIds, p_actor: session?.person?.id || null }),
        sb.rpc('get_feature_grants', { p_feature: FEATURE }),
      ])
      const seen = new Set()
      const people = (Array.isArray(r.data) ? r.data : []).filter(p => p.id && !seen.has(p.id) && seen.add(p.id))
      setRoster(people)
      setGrants(Array.isArray(g.data) ? g.data : [])
    } finally { setLoading(false) }
  }, [locationIds, session])
  useEffect(() => { load() }, [load])

  const grantMap = useMemo(() => Object.fromEntries(grants.map(g => [g.person_id, g])), [grants])
  const showToast = (m) => { setToast(m); setTimeout(() => setToast(null), 2800) }

  const toggle = async (person, granted) => {
    setGrants(list => granted
      ? [...list.filter(g => g.person_id !== person.id), { person_id: person.id, full_name: person.full_name, granted_by_name: session?.person?.full_name || 'You', granted_at: new Date().toISOString() }]
      : list.filter(g => g.person_id !== person.id))
    const { error } = await sb.rpc('set_feature_grant', { p_feature: FEATURE, p_person_id: person.id, p_granted: granted, p_actor: session?.person?.id || null })
    if (error) { showToast('Failed: ' + error.message); load() }
    else showToast(`${granted ? '✓ Granted' : 'Revoked'} timecard editing — ${person.full_name}`)
  }

  if (!isAdmin) {
    return (
      <div style={{ padding: 24 }}>
        <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', padding: 48, textAlign: 'center' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🔒</div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>Admin Access Required</div>
          <div style={{ color: 'var(--t-text-muted)', fontSize: 13, marginTop: 6 }}>Only Admin/Owner and executives can assign timecard-edit permissions.</div>
        </div>
      </div>
    )
  }

  const shown = roster.filter(p => !q || `${p.full_name || ''} ${p.role_name || ''}`.toLowerCase().includes(q.toLowerCase()))
  const grantedCount = roster.filter(p => grantMap[p.id] || ADMIN_RX.test(p.role_name || '')).length

  return (
    <div style={{ color: 'var(--t-text)', fontSize: 13 }}>
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-.3px' }}>Timecard Edit Access</div>
        <div style={{ fontSize: 12, color: 'var(--t-text-muted)', marginTop: 2 }}>
          Assign who may correct/edit timecards. Admins & executives always can; everyone else needs a grant. Employees cannot edit unless granted.
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', padding: '10px 16px', minWidth: 120 }}>
          <div style={{ fontSize: 9, fontWeight: 800, color: 'var(--t-text-muted)', textTransform: 'uppercase' }}>Employees</div>
          <div style={{ fontSize: 22, fontWeight: 800 }}>{roster.length}</div>
        </div>
        <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', padding: '10px 16px', minWidth: 120 }}>
          <div style={{ fontSize: 9, fontWeight: 800, color: 'var(--t-text-muted)', textTransform: 'uppercase' }}>Can Edit Timecards</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--t-success)' }}>{grantedCount}</div>
        </div>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search employees…" style={{ flex: 1, minWidth: 200, padding: '8px 12px', background: 'var(--t-surface)', color: 'var(--t-text)', border: '1px solid var(--t-line)', fontSize: 13 }} />
      </div>

      <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: 'var(--t-surface-2)' }}>
              {['Employee', 'Role', 'Can Edit Timecards', 'Granted By', 'Granted'].map(h => (
                <th key={h} style={{ textAlign: h === 'Can Edit Timecards' ? 'center' : 'left', padding: '10px 14px', fontSize: 9, fontWeight: 800, letterSpacing: '.05em', color: 'var(--t-text-muted)', textTransform: 'uppercase', borderBottom: '1px solid var(--t-line)', whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && shown.length === 0 && <tr><td colSpan={5} style={{ padding: 24, textAlign: 'center', color: 'var(--t-accent)' }}>Loading…</td></tr>}
            {!loading && shown.length === 0 && <tr><td colSpan={5} style={{ padding: 24, textAlign: 'center', color: 'var(--t-text-faint)' }}>No employees found.</td></tr>}
            {shown.map(p => {
              const alwaysOn = ADMIN_RX.test(p.role_name || '')
              const g = grantMap[p.id]
              const on = alwaysOn || !!g
              return (
                <tr key={p.id} style={{ borderBottom: '1px solid var(--t-line)' }}>
                  <td style={{ padding: '9px 14px' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ width: 26, height: 26, borderRadius: '50%', background: 'var(--t-surface-2)', border: '1px solid var(--t-line)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 800, color: 'var(--t-text-muted)' }}>{initials(p.full_name)}</span>
                      <span style={{ fontWeight: 700 }}>{p.full_name}</span>
                    </span>
                  </td>
                  <td style={{ padding: '9px 14px', color: 'var(--t-text-muted)' }}>{p.role_name || '—'}</td>
                  <td style={{ padding: '9px 14px', textAlign: 'center' }}>
                    {alwaysOn
                      ? <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--t-accent)', border: '1px solid var(--t-accent)', padding: '2px 8px' }}>ALWAYS · {p.role_name?.toUpperCase()}</span>
                      : <Toggle on={on} onChange={(v) => toggle(p, v)} />}
                  </td>
                  <td style={{ padding: '9px 14px', color: 'var(--t-text-muted)' }}>{alwaysOn ? '—' : (g?.granted_by_name || '—')}</td>
                  <td style={{ padding: '9px 14px', color: 'var(--t-text-faint)', fontSize: 12 }}>{alwaysOn ? '—' : (g ? fmtDT(g.granted_at) : '—')}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {toast && <div style={{ position: 'fixed', bottom: 24, right: 24, background: 'var(--t-success)', color: '#04121a', padding: '10px 18px', fontWeight: 700, fontSize: 13, zIndex: 9999, boxShadow: '0 4px 20px rgba(0,0,0,0.4)' }}>{toast}</div>}
    </div>
  )
}
