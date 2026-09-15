import { useState, useEffect, useCallback } from 'react'
import { useFeatureFlag } from '../lib/featureFlags.js'
import { useScope } from '../lib/scope.jsx'
import { sb } from '../lib/supabase'
import { companyName } from '../lib/config.js'

/* ══════════════════════════════════════════════════════════════
   HELPERS
══════════════════════════════════════════════════════════════ */
function fmtTime(ts) {
  if (!ts) return '—'
  const d = new Date(ts)
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })
}

function fmtDuration(sinceIso) {
  if (!sinceIso) return '—'
  const ms = Date.now() - new Date(sinceIso).getTime()
  if (ms < 0) return '0h 0m'
  const totalMins = Math.floor(ms / 60000)
  const h = Math.floor(totalMins / 60)
  const m = totalMins % 60
  return `${h}h ${m}m`
}

function fmtHours(hrs) {
  if (hrs == null) return '—'
  const h = Math.floor(hrs)
  const m = Math.round((hrs - h) * 60)
  return `${h}h ${m}m`
}

/* ══════════════════════════════════════════════════════════════
   FEATURE DISABLED FALLBACK
══════════════════════════════════════════════════════════════ */
function FeatureDisabled() {
  return (
    <div style={{ padding: 40, textAlign: 'center', color: 'var(--t-text-muted)' }}>
      Kiosk mode is disabled. Enable it in Feature Toggles.
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════
   LIVE BADGE
══════════════════════════════════════════════════════════════ */
function LiveBadge() {
  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 8px',
      fontSize: 10,
      fontWeight: 700,
      letterSpacing: '0.5px',
      textTransform: 'uppercase',
      borderRadius: 0,
      background: 'var(--t-success)',
      color: '#000',
    }}>
      LIVE
    </span>
  )
}

/* ══════════════════════════════════════════════════════════════
   ADMIN OVERLAY — roster reference (real data)
══════════════════════════════════════════════════════════════ */
function AdminOverlay({ onClose, employees }) {
  const [authed, setAuthed] = useState(false)
  const [pwd, setPwd] = useState('')
  const [err, setErr] = useState(null)

  function checkPwd() {
    if (pwd === 'admin2026') { setAuthed(true); setErr(null) }
    else setErr('Incorrect password.')
  }

  const overlayStyle = {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.82)',
    zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center',
  }
  const panelStyle = {
    background: 'var(--t-bg)', border: '1px solid var(--t-line)',
    padding: 32, width: 640, maxWidth: '96vw', maxHeight: '90vh', overflowY: 'auto',
    borderRadius: 0,
  }
  const inputSm = {
    background: 'var(--t-surface)', color: 'var(--t-text)',
    border: '1px solid var(--t-line)', padding: '7px 10px', fontSize: 12,
    width: '100%', boxSizing: 'border-box', outline: 'none', borderRadius: 0,
  }
  const btnSm = (col) => ({
    padding: '4px 10px', background: 'transparent', color: col || 'var(--t-text-muted)',
    border: `1px solid ${col || 'var(--t-line)'}`, cursor: 'pointer', fontSize: 11,
    textTransform: 'uppercase', letterSpacing: '0.3px', borderRadius: 0,
  })

  return (
    <div style={overlayStyle}>
      <div style={panelStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div style={{ fontWeight: 800, fontSize: 14, color: 'var(--t-text)', textTransform: 'uppercase', letterSpacing: '1px' }}>
            Admin — Employee Roster
          </div>
          <button onClick={onClose} style={{ ...btnSm('var(--t-text-muted)'), padding: '4px 12px' }}>Close</button>
        </div>

        {!authed ? (
          <div>
            <div style={{ fontSize: 12, color: 'var(--t-text-muted)', marginBottom: 12 }}>
              Enter admin password to view roster.
            </div>
            <input
              type="password"
              value={pwd}
              onChange={e => setPwd(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && checkPwd()}
              placeholder="Admin password"
              style={{ ...inputSm, marginBottom: 10 }}
              autoFocus
            />
            {err && <div style={{ color: 'var(--t-danger)', fontSize: 11, marginBottom: 8 }}>{err}</div>}
            <button onClick={checkPwd} style={{ ...btnSm('var(--t-accent)'), padding: '7px 20px' }}>Unlock</button>
          </div>
        ) : (
          <div>
            <div style={{ fontSize: 11, color: 'var(--t-text-muted)', marginBottom: 16 }}>
              Employee roster loaded live from Supabase. PINs are managed via Supabase Auth — use the Supabase dashboard to reset PINs.
            </div>
            {employees.length === 0 ? (
              <div style={{ fontSize: 12, color: 'var(--t-text-muted)', padding: '12px 0' }}>
                No active employees in this location scope.
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--t-line)' }}>
                    {['ID', 'Name', 'Role', 'Location', 'Status'].map(h => (
                      <th key={h} style={{ padding: '6px 8px', textAlign: 'left', color: 'var(--t-text-muted)', fontWeight: 600, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {employees.map(emp => (
                    <tr key={emp.id} style={{ borderBottom: '1px solid var(--t-line)' }}>
                      <td style={{ padding: '7px 8px', color: 'var(--t-text-muted)', fontFamily: 'monospace', fontSize: 11 }}>{String(emp.id).slice(0, 8)}</td>
                      <td style={{ padding: '7px 8px', color: 'var(--t-text)', fontWeight: 600 }}>{emp.full_name}</td>
                      <td style={{ padding: '7px 8px', color: 'var(--t-text-muted)' }}>{emp.role_name || '—'}</td>
                      <td style={{ padding: '7px 8px', color: 'var(--t-text-muted)' }}>{emp.node_name || '—'}</td>
                      <td style={{ padding: '7px 8px' }}>
                        <span style={{
                          fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 0,
                          background: emp.is_active ? 'var(--t-success)' : 'var(--t-danger)',
                          color: '#000',
                        }}>
                          {emp.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════
   CLOCK DISPLAY — live ticking clock
══════════════════════════════════════════════════════════════ */
function ClockDisplay() {
  const [now, setNow] = useState(new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  const time = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })
  const date = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })

  return (
    <div style={{ textAlign: 'center', padding: '24px 0 16px' }}>
      <div style={{ fontSize: 52, fontWeight: 800, color: 'var(--t-text)', letterSpacing: '-2px', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
        {time}
      </div>
      <div style={{ fontSize: 13, color: 'var(--t-text-muted)', marginTop: 6, letterSpacing: '0.3px' }}>
        {date}
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════
   PIN PAD
══════════════════════════════════════════════════════════════ */
function PinPad({ value, onChange, onSubmit, disabled }) {
  const digits = ['1','2','3','4','5','6','7','8','9','','0','⌫']

  const btnStyle = (d) => ({
    width: 72, height: 72,
    background: d === '' ? 'transparent' : 'var(--t-surface)',
    border: d === '' ? 'none' : '1px solid var(--t-line)',
    color: 'var(--t-text)', fontSize: d === '⌫' ? 20 : 24, fontWeight: 700,
    cursor: d === '' ? 'default' : 'pointer', borderRadius: 0,
    transition: 'background 0.1s',
    opacity: disabled ? 0.4 : 1,
  })

  function handleDigit(d) {
    if (disabled) return
    if (d === '⌫') { onChange(value.slice(0, -1)); return }
    if (d === '') return
    const next = value + d
    onChange(next)
    if (next.length === 4) onSubmit(next)
  }

  return (
    <div>
      {/* PIN display */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: 12, marginBottom: 20 }}>
        {[0,1,2,3].map(i => (
          <div key={i} style={{
            width: 16, height: 16, borderRadius: '50%',
            background: i < value.length ? 'var(--t-accent)' : 'var(--t-line)',
            transition: 'background 0.15s',
          }} />
        ))}
      </div>
      {/* Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 72px)', gap: 8, justifyContent: 'center' }}>
        {digits.map((d, i) => (
          <button key={i} style={btnStyle(d)} onClick={() => handleDigit(d)} disabled={disabled && d !== ''}>
            {d}
          </button>
        ))}
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════
   PUNCH RESULT SCREEN
══════════════════════════════════════════════════════════════ */
function PunchResult({ result, onDone }) {
  useEffect(() => {
    const id = setTimeout(onDone, 3500)
    return () => clearTimeout(id)
  }, [onDone])

  const isIn = result.action === 'in'
  const color = isIn ? 'var(--t-success)' : 'var(--t-warn)'

  return (
    <div style={{ textAlign: 'center', padding: '40px 20px' }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>✓</div>
      <div style={{ fontSize: 28, fontWeight: 800, color, marginBottom: 8 }}>
        {isIn ? 'Clocked In' : 'Clocked Out'}
      </div>
      <div style={{ fontSize: 20, color: 'var(--t-text)', fontWeight: 700, marginBottom: 6 }}>
        {result.name}
      </div>
      <div style={{ fontSize: 14, color: 'var(--t-text-muted)' }}>
        {fmtTime(result.ts)}
        {!isIn && result.duration && (
          <span style={{ marginLeft: 8 }}>· {result.duration} on shift</span>
        )}
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════
   CURRENTLY CLOCKED IN PANEL — real open punches
══════════════════════════════════════════════════════════════ */
function ActivePunchesPanel({ active, loading }) {
  const [, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 30000)
    return () => clearInterval(id)
  }, [])

  if (loading) {
    return <div style={{ fontSize: 12, color: 'var(--t-text-muted)', padding: '16px 0', textAlign: 'center' }}>Loading…</div>
  }

  if (!active.length) {
    return (
      <div style={{ fontSize: 12, color: 'var(--t-text-muted)', padding: '16px 0', textAlign: 'center' }}>
        No one clocked in right now.
      </div>
    )
  }

  return (
    <div>
      {active.map((row) => (
        <div key={row.person_id} style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '10px 0', borderBottom: '1px solid var(--t-line)', fontSize: 13,
        }}>
          <div>
            <div style={{ fontWeight: 700, color: 'var(--t-text)' }}>{row.full_name}</div>
            <div style={{ fontSize: 11, color: 'var(--t-text-muted)', marginTop: 2 }}>
              {row.node_name || '—'} · In: {fmtTime(row.punched_in_at)}
            </div>
          </div>
          <div style={{ fontSize: 13, color: 'var(--t-accent)', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
            {fmtDuration(row.punched_in_at)}
          </div>
        </div>
      ))}
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════
   RECENT ACTIVITY — real punch events
══════════════════════════════════════════════════════════════ */
function RecentActivity({ entries, loading }) {
  if (loading) {
    return <div style={{ fontSize: 12, color: 'var(--t-text-muted)', padding: '12px 0', textAlign: 'center' }}>Loading…</div>
  }
  if (!entries.length) {
    return <div style={{ fontSize: 12, color: 'var(--t-text-muted)', padding: '12px 0', textAlign: 'center' }}>No recent activity.</div>
  }

  return (
    <div>
      {entries.map((e, i) => (
        <div key={i} style={{
          display: 'flex', justifyContent: 'space-between',
          padding: '8px 0', borderBottom: '1px solid var(--t-line)', fontSize: 12,
        }}>
          <div>
            <span style={{ fontWeight: 700, color: 'var(--t-text)' }}>{e.full_name}</span>
            <span style={{ color: 'var(--t-text-muted)', marginLeft: 8 }}>
              {e.action === 'in' ? 'clocked in' : 'clocked out'}
            </span>
          </div>
          <div style={{ color: 'var(--t-text-muted)', fontVariantNumeric: 'tabular-nums' }}>
            {fmtTime(e.event_at)}
          </div>
        </div>
      ))}
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════
   MAIN KIOSK COMPONENT
══════════════════════════════════════════════════════════════ */
export default function TimeClockKiosk() {
  const kioskEnabled = useFeatureFlag('kiosk_mode')
  const { locationIds } = useScope()

  // Roster state
  const [employees, setEmployees]   = useState([])
  const [rosterLoading, setRosterLoading] = useState(true)
  const [rosterErr, setRosterErr]   = useState(null)

  // Live panels
  const [active, setActive]         = useState([])
  const [activeLoading, setActiveLoading] = useState(true)
  const [recent, setRecent]         = useState([])
  const [recentLoading, setRecentLoading] = useState(true)

  // Punch entry
  const [loginId, setLoginId]       = useState('')
  const [pin, setPin]               = useState('')
  const [phase, setPhase]           = useState('idle') // 'idle' | 'processing' | 'result' | 'error'
  const [result, setResult]         = useState(null)
  const [errMsg, setErrMsg]         = useState(null)

  // Admin overlay
  const [showAdmin, setShowAdmin]   = useState(false)
  const [adminTap, setAdminTap]     = useState(0)
  const [lastAdminTap, setLastAdminTap] = useState(0)

  const nodeIds = locationIds && locationIds.length > 0 ? locationIds : []

  /* ── Roster fetch (real) ──────────────────────────────────── */
  const fetchRoster = useCallback(async () => {
    setRosterLoading(true)
    setRosterErr(null)
    try {
      const { data, error } = await sb.rpc('get_roster', { p_node_ids: nodeIds })
      if (error) throw error
      setEmployees((data || []).filter(r => r.is_active !== false))
    } catch (e) {
      console.error('[TimeClockKiosk] roster fetch failed:', e)
      setRosterErr(e?.message || 'Failed to load roster')
      setEmployees([])
    } finally {
      setRosterLoading(false)
    }
  }, [nodeIds])

  /* ── Live panels fetch (real) ─────────────────────────────── */
  const fetchActive = useCallback(async () => {
    setActiveLoading(true)
    try {
      const { data, error } = await sb.rpc('kiosk_active_punches', { p_node_ids: nodeIds })
      if (error) throw error
      setActive(data || [])
    } catch (e) {
      console.error('[TimeClockKiosk] active punches fetch failed:', e)
      setActive([])
    } finally {
      setActiveLoading(false)
    }
  }, [nodeIds])

  const fetchRecent = useCallback(async () => {
    setRecentLoading(true)
    try {
      const { data, error } = await sb.rpc('kiosk_recent_activity', { p_node_ids: nodeIds, p_limit: 8 })
      if (error) throw error
      setRecent(data || [])
    } catch (e) {
      console.error('[TimeClockKiosk] recent activity fetch failed:', e)
      setRecent([])
    } finally {
      setRecentLoading(false)
    }
  }, [nodeIds])

  const refreshAll = useCallback(() => {
    fetchRoster(); fetchActive(); fetchRecent()
  }, [fetchRoster, fetchActive, fetchRecent])

  useEffect(() => { refreshAll() }, [refreshAll])

  // Keep the "currently on shift" durations & feed fresh on a slow poll.
  useEffect(() => {
    const id = setInterval(() => { fetchActive(); fetchRecent() }, 60000)
    return () => clearInterval(id)
  }, [fetchActive, fetchRecent])

  /* ── PIN submit → real authenticated toggle punch ─────────── */
  async function handlePinSubmit(enteredPin) {
    if (phase === 'processing') return

    const id = loginId.trim()
    if (!id) {
      setPhase('error')
      setErrMsg('Enter your Employee ID first.')
      setPin('')
      setTimeout(() => { setPhase('idle'); setErrMsg(null) }, 2500)
      return
    }

    setPhase('processing')
    setErrMsg(null)

    try {
      const { data, error } = await sb.rpc('kiosk_punch', {
        p_login_id: id,
        p_pin: enteredPin,
        p_node_ids: nodeIds,
      })
      if (error) throw error

      if (!data || data.ok !== true) {
        setPhase('error')
        setErrMsg('Invalid Employee ID or PIN.')
        setPin('')
        setTimeout(() => { setPhase('idle'); setErrMsg(null) }, 2500)
        return
      }

      const isIn = data.action === 'in'
      setResult({
        action: data.action,
        name: data.full_name,
        ts: isIn ? data.punched_in_at : data.punched_out_at,
        duration: !isIn ? fmtHours(data.hours_worked) : null,
      })
      setPhase('result')
      setPin('')
      setLoginId('')

      // Reflect the new punch in the live panels immediately.
      fetchActive(); fetchRecent()
    } catch (e) {
      console.error('[TimeClockKiosk] kiosk_punch failed:', e)
      setPhase('error')
      setErrMsg('Could not record punch. Please try again.')
      setPin('')
      setTimeout(() => { setPhase('idle'); setErrMsg(null) }, 2500)
    }
  }

  /* ── Admin tap sequence (5 taps on header) ────────────────── */
  function handleHeaderTap() {
    const now = Date.now()
    const newCount = now - lastAdminTap < 600 ? adminTap + 1 : 1
    setAdminTap(newCount)
    setLastAdminTap(now)
    if (newCount >= 5) {
      setShowAdmin(true)
      setAdminTap(0)
    }
  }

  /* ── Reset to idle after result ───────────────────────────── */
  function resetToIdle() {
    setPhase('idle')
    setResult(null)
    setPin('')
    setErrMsg(null)
  }

  /* ── Feature flag guard ───────────────────────────────────── */
  if (!kioskEnabled) return <FeatureDisabled />

  /* ══════════════════════════════════════════════════════════
     RENDER
  ══════════════════════════════════════════════════════════ */
  const inputStyle = {
    width: '100%', maxWidth: 240, boxSizing: 'border-box',
    background: 'var(--t-surface)', color: 'var(--t-text)',
    border: '1px solid var(--t-line)', padding: '10px 12px', fontSize: 14,
    textAlign: 'center', letterSpacing: '1px', outline: 'none', borderRadius: 0,
    marginBottom: 16,
  }

  return (
    <div style={{
      minHeight: '100dvh',
      background: 'var(--t-bg)',
      display: 'grid',
      gridTemplateColumns: '1fr 340px',
      gap: 0,
    }}>
      {showAdmin && (
        <AdminOverlay employees={employees} onClose={() => setShowAdmin(false)} />
      )}

      {/* ── LEFT: Kiosk punch area ─────────────────────────────── */}
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', padding: '32px 24px',
        borderRight: '1px solid var(--t-line)',
      }}>
        {/* Header */}
        <div
          onClick={handleHeaderTap}
          style={{ cursor: 'default', textAlign: 'center', marginBottom: 8, userSelect: 'none' }}
        >
          <div style={{
            fontSize: 11, fontWeight: 700, letterSpacing: '2px',
            color: 'var(--t-text-muted)', textTransform: 'uppercase', marginBottom: 6,
          }}>
            {companyName()} · Time Clock
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 8, alignItems: 'center' }}>
            <LiveBadge />
            {rosterErr && (
              <span style={{ fontSize: 10, color: 'var(--t-danger)' }}>
                {rosterErr}
              </span>
            )}
          </div>
        </div>

        <ClockDisplay />

        {/* Punch UI */}
        {phase === 'idle' || phase === 'processing' ? (
          <div style={{ width: '100%', maxWidth: 300, marginTop: 16, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div style={{
              fontSize: 12, color: 'var(--t-text-muted)', textAlign: 'center',
              marginBottom: 20, letterSpacing: '0.3px',
            }}>
              {phase === 'processing' ? 'Processing…' : 'Enter your Employee ID and PIN to clock in or out'}
            </div>
            <input
              value={loginId}
              onChange={e => setLoginId(e.target.value)}
              placeholder="Employee ID"
              autoComplete="off"
              disabled={phase === 'processing'}
              style={inputStyle}
            />
            <PinPad
              value={pin}
              onChange={setPin}
              onSubmit={handlePinSubmit}
              disabled={phase === 'processing'}
            />
          </div>
        ) : phase === 'result' && result ? (
          <PunchResult result={result} onDone={resetToIdle} />
        ) : phase === 'error' ? (
          <div style={{ textAlign: 'center', padding: 32 }}>
            <div style={{ fontSize: 32, marginBottom: 12, color: 'var(--t-danger)' }}>✗</div>
            <div style={{ fontSize: 16, color: 'var(--t-danger)', fontWeight: 700, marginBottom: 6 }}>
              {errMsg || 'Invalid PIN'}
            </div>
            <div style={{ fontSize: 12, color: 'var(--t-text-muted)' }}>Returning to kiosk…</div>
          </div>
        ) : null}
      </div>

      {/* ── RIGHT: Status panel ────────────────────────────────── */}
      <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 24, overflowY: 'auto' }}>

        {/* Currently clocked in */}
        <div>
          <div style={{
            fontSize: 10, fontWeight: 700, letterSpacing: '1.5px',
            color: 'var(--t-text-muted)', textTransform: 'uppercase', marginBottom: 12,
          }}>
            Currently On Shift
          </div>
          <ActivePunchesPanel active={active} loading={activeLoading} />
        </div>

        <div style={{ borderTop: '1px solid var(--t-line)' }} />

        {/* Recent activity */}
        <div>
          <div style={{
            fontSize: 10, fontWeight: 700, letterSpacing: '1.5px',
            color: 'var(--t-text-muted)', textTransform: 'uppercase', marginBottom: 12,
          }}>
            Recent Activity
          </div>
          <RecentActivity entries={recent} loading={recentLoading} />
        </div>

        <div style={{ borderTop: '1px solid var(--t-line)' }} />

        {/* Roster summary */}
        <div>
          <div style={{
            fontSize: 10, fontWeight: 700, letterSpacing: '1.5px',
            color: 'var(--t-text-muted)', textTransform: 'uppercase', marginBottom: 12,
          }}>
            Roster ({employees.length} active)
          </div>
          {rosterLoading ? (
            <div style={{ fontSize: 12, color: 'var(--t-text-muted)' }}>Loading…</div>
          ) : employees.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--t-text-muted)' }}>No active employees in scope.</div>
          ) : (
            employees.slice(0, 8).map(emp => (
              <div key={emp.id} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '6px 0', borderBottom: '1px solid var(--t-line)', fontSize: 12,
              }}>
                <div>
                  <span style={{ color: 'var(--t-text)', fontWeight: 600 }}>{emp.full_name}</span>
                  <span style={{ color: 'var(--t-text-muted)', marginLeft: 6, fontSize: 11 }}>{emp.role_name || ''}</span>
                </div>
                <span style={{ fontSize: 11, color: 'var(--t-text-muted)' }}>{emp.node_name || '—'}</span>
              </div>
            ))
          )}
          {employees.length > 8 && (
            <div style={{ fontSize: 11, color: 'var(--t-text-muted)', marginTop: 6, textAlign: 'center' }}>
              +{employees.length - 8} more
            </div>
          )}
        </div>

        {/* Refresh button */}
        <button
          onClick={refreshAll}
          disabled={rosterLoading}
          style={{
            background: 'transparent', border: '1px solid var(--t-line)',
            color: 'var(--t-text-muted)', fontSize: 11, padding: '7px 0',
            cursor: rosterLoading ? 'default' : 'pointer', borderRadius: 0,
            textTransform: 'uppercase', letterSpacing: '0.5px',
          }}
        >
          {rosterLoading ? 'Loading…' : 'Refresh'}
        </button>

      </div>
    </div>
  )
}
