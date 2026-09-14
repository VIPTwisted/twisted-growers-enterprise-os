import { useState, useEffect } from 'react'
import { useFeatureFlag } from '../lib/featureFlags.js'
import { useConfig } from '../lib/config.js'
import { useAuth } from '../lib/auth.jsx'
import { useScope } from '../lib/scope.jsx'
import { sb } from '../lib/supabase'

/* ── star helper ─────────────────────────────────────────────── */
const stars = (n) => '★'.repeat(n) + '☆'.repeat(5 - n)

/* ── reason picklist (controlled vocabulary, not data) ───────── */
const LEAVE_REASONS = [
  'Better Pay',
  'Culture/Management',
  'Personal/Relocation',
  'Career Growth',
  'Performance-based',
]

/* ── quarter key for period comparisons ──────────────────────── */
const quarterOf = (d) => {
  const dt = new Date(d)
  if (Number.isNaN(dt.getTime())) return null
  return dt.getFullYear() * 4 + Math.floor(dt.getMonth() / 3)
}

/* ── star input component ────────────────────────────────────── */
function StarInput({ value, onChange }) {
  return (
    <div style={{ display: 'flex', gap: 4 }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          onClick={() => onChange(n)}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontSize: 20,
            color: n <= value ? 'var(--t-warn)' : 'var(--t-text-faint)',
            padding: '0 2px',
          }}
        >
          {n <= value ? '★' : '☆'}
        </button>
      ))}
    </div>
  )
}

/* ── status badge class ──────────────────────────────────────── */
function statusBadge(status) {
  if (status === 'PENDING') return 'badge amber'
  if (status === 'SCHEDULED') return 'badge blue'
  if (status === 'OVERDUE') return 'badge red'
  return 'badge amber'
}

/* ── date format ─────────────────────────────────────────────── */
const fmt = (d) =>
  d
    ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : '—'

/* ── tab button styles ───────────────────────────────────────── */
const tabBase = {
  background: 'none',
  border: 'none',
  borderBottom: '2px solid transparent',
  color: 'var(--t-text-muted)',
  padding: '8px 16px',
  fontSize: 13,
  fontWeight: 700,
  cursor: 'pointer',
  letterSpacing: '.04em',
}

const tabActive = {
  ...tabBase,
  borderBottom: '2px solid var(--t-accent)',
  color: 'var(--t-accent)',
}

/* ══════════════════════════════════════════════════════════════ */
export default function ExitInterviews() {
  const flag = useFeatureFlag('exit_interviews')
  const { session } = useAuth()
  const person = session?.person
  const { locationIds, locations } = useScope() || {}
  const config = useConfig()
  const roleName = (session?.person?.role_name || '').toLowerCase()
  const isManager = ['ceo', 'manager', 'coo', 'admin', 'owner', 'hr'].some((r) => roleName.includes(r))

  /* ── feature gate ──────────────────────────────────────────── */
  if (!flag) {
    return (
      <div style={{ padding: 24 }}>
        <div
          style={{
            background: 'var(--t-surface)',
            border: '1px solid var(--t-line)',
            padding: 24,
          }}
        >
          <div style={{ fontSize: 13, color: 'var(--t-text-muted)' }}>
            Exit Interviews module is not enabled for this account.
            Contact your administrator to enable the <code>exit_interviews</code> feature flag.
          </div>
        </div>
      </div>
    )
  }

  /* ── role gate ─────────────────────────────────────────────── */
  if (!isManager) {
    return (
      <div style={{ padding: 24 }}>
        <div
          style={{
            background: 'var(--t-surface)',
            border: '1px solid var(--t-line)',
            padding: 24,
          }}
        >
          <div style={{ fontSize: 13, color: 'var(--t-text-muted)', fontWeight: 700 }}>
            Access Restricted — HR Manager and above only.
          </div>
        </div>
      </div>
    )
  }

  return (
    <ExitInterviewsInner
      isManager={isManager}
      config={config}
      person={person}
      locationIds={locationIds}
      locations={locations || []}
    />
  )
}

/* ── inner component (only rendered when authed + flagged) ────── */
function ExitInterviewsInner({ isManager, config, person, locationIds, locations }) {
  const [tab, setTab] = useState('pending')
  const [pending, setPending] = useState([])
  const [completed, setCompleted] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [busy, setBusy] = useState(false)
  // completed-list filters (custom date range + location + reason)
  const [cDateFrom, setCDateFrom] = useState('')
  const [cDateTo, setCDateTo] = useState('')
  const [cLoc, setCLoc] = useState('All')
  const [cReason, setCReason] = useState('All')
  const filteredCompleted = completed.filter(r => {
    const d = String(r.exitDate || '').slice(0, 10)
    if (cDateFrom && d < cDateFrom) return false
    if (cDateTo && d > cDateTo) return false
    if (cLoc !== 'All' && r.location !== cLoc) return false
    if (cReason !== 'All' && r.primaryReason !== cReason) return false
    return true
  })

  // Location options for the filter come from the caller's scope (real nodes),
  // falling back to whatever locations actually appear in the loaded records.
  const locOptions = (() => {
    const names = new Set()
    ;(locations || []).forEach(l => { if (l?.name) names.add(l.name) })
    completed.forEach(r => { if (r.location && r.location !== '—') names.add(r.location) })
    pending.forEach(r => { if (r.location && r.location !== '—') names.add(r.location) })
    return Array.from(names).sort()
  })()

  /* ── live data loader: pending queue (derived from separations) +
        completed exit interviews, both scoped to the caller's nodes. ─ */
  async function loadAll() {
    const p_node_ids = locationIds && locationIds.length ? locationIds : null
    const [pRes, cRes] = await Promise.all([
      sb.rpc('exit_interview_pending_list', { p_node_ids }),
      sb.rpc('exit_interview_completed_list', { p_node_ids }),
    ])
    if (pRes.error) throw pRes.error
    if (cRes.error) throw cRes.error
    setPending(Array.isArray(pRes.data) ? pRes.data : [])
    setCompleted(Array.isArray(cRes.data) ? cRes.data : [])
  }

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setLoadError('')
    ;(async () => {
      try {
        await loadAll()
      } catch (e) {
        if (!cancelled) setLoadError(e?.message || 'Unable to load exit interviews.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [person?.id, JSON.stringify(locationIds || [])])

  const [selectedCompleted, setSelectedCompleted] = useState(null)
  const [activeConduct, setActiveConduct] = useState(null)

  /* conduct form state — conductEmp holds the selected separation_id */
  const [conductEmp, setConductEmp] = useState('')
  const [conductOverall, setConductOverall] = useState(0)
  const [conductMgmt, setConductMgmt] = useState(0)
  const [conductRecommend, setConductRecommend] = useState('Yes')
  const [conductReason, setConductReason] = useState(LEAVE_REASONS[0])
  const [conductBetter, setConductBetter] = useState('')
  const [conductSuggestions, setConductSuggestions] = useState('')
  const [conductRehire, setConductRehire] = useState('Yes')
  const [conductNotes, setConductNotes] = useState('')

  /* derived */
  const rehirePct = completed.length
    ? Math.round((completed.filter((c) => c.wouldRehire).length / completed.length) * 100)
    : 0

  /* ── pending actions (all persisted to the backend, then refresh) ─ */
  async function refresh() {
    try { await loadAll() } catch (e) { setLoadError(e?.message || 'Refresh failed.') }
  }

  async function handleSchedule(separationId) {
    if (busy) return
    setBusy(true)
    try {
      const { error } = await sb.rpc('exit_interview_schedule', {
        p_separation_id: separationId,
        p_actor: person?.id ?? null,
      })
      if (error) throw error
      await refresh()
    } catch (e) {
      window.alert('Could not schedule: ' + (e?.message || 'unknown error'))
    } finally {
      setBusy(false)
    }
  }

  async function handleWaive(separationId) {
    if (busy) return
    if (!window.confirm('Waive this exit interview? This cannot be undone.')) return
    setBusy(true)
    try {
      const { error } = await sb.rpc('exit_interview_waive', {
        p_separation_id: separationId,
        p_actor: person?.id ?? null,
      })
      if (error) throw error
      await refresh()
    } catch (e) {
      window.alert('Could not waive: ' + (e?.message || 'unknown error'))
    } finally {
      setBusy(false)
    }
  }

  function handleMarkComplete(separationId) {
    setActiveConduct(separationId)
    setConductEmp(separationId)
    setTab('conduct')
  }

  /* ── conduct submit — persists a completed exit interview ─────── */
  async function handleConductSubmit() {
    if (!conductEmp || busy) return
    const pendingRow = pending.find((p) => p.separation_id === conductEmp)
    if (!pendingRow) {
      window.alert('That employee is no longer awaiting an exit interview. Refreshing…')
      await refresh()
      return
    }
    setBusy(true)
    try {
      const { error } = await sb.rpc('exit_interview_complete', {
        p_separation_id: conductEmp,
        p_would_rehire: conductRehire === 'Yes',
        p_primary_reason: conductReason,
        p_overall: conductOverall,
        p_mgmt: conductMgmt,
        p_recommend: conductRecommend,
        p_better: conductBetter,
        p_suggestions: conductSuggestions,
        p_notes: conductNotes,
        p_interviewed_by: person?.full_name || 'HR Manager',
        p_actor: person?.id ?? null,
      })
      if (error) throw error
      await refresh()
      /* reset form */
      setConductEmp('')
      setConductOverall(0)
      setConductMgmt(0)
      setConductRecommend('Yes')
      setConductReason(LEAVE_REASONS[0])
      setConductBetter('')
      setConductSuggestions('')
      setConductRehire('Yes')
      setConductNotes('')
      setActiveConduct(null)
      setTab('completed')
    } catch (e) {
      window.alert('Could not save interview: ' + (e?.message || 'unknown error'))
    } finally {
      setBusy(false)
    }
  }

  /* ── aggregate insights ─────────────────────────────────────── */
  const reasonCounts = LEAVE_REASONS.map((r) => ({
    reason: r,
    count: completed.filter((c) => c.primaryReason === r).length,
  })).sort((a, b) => b.count - a.count).slice(0, 3)

  const maxReasonCount = reasonCounts[0]?.count || 1

  const avgMgmt = completed.length
    ? (completed.reduce((s, c) => s + c.mgmtRating, 0) / completed.length).toFixed(1)
    : '—'

  const avgScore = completed.length
    ? (completed.reduce((s, c) => s + c.score, 0) / completed.length).toFixed(1)
    : '—'

  /* ── period metrics (real, derived from completed data) ───────── */
  const nowQ = quarterOf(new Date())
  const curQ = completed.filter((c) => quarterOf(c.dateCompleted) === nowQ)
  const prevQ = completed.filter((c) => quarterOf(c.dateCompleted) === nowQ - 1)
  const completedThisQuarter = curQ.length
  const avgOf = (arr) => (arr.length ? arr.reduce((s, c) => s + (c.score || 0), 0) / arr.length : null)
  const curQAvg = avgOf(curQ)
  const prevQAvg = avgOf(prevQ)
  const trendDelta = curQAvg != null && prevQAvg != null ? curQAvg - prevQAvg : null
  const decidedTotal = completed.length + pending.length
  const completionRate = decidedTotal > 0 ? Math.round((completed.length / decidedTotal) * 100) : null

  /* ── selected detail record ─────────────────────────────────── */
  const detailRecord = completed.find((c) => c.id === selectedCompleted)

  /* ── KPI tiles ──────────────────────────────────────────────── */
  const pendingCount = pending.length

  /* ── render ─────────────────────────────────────────────────── */
  return (
    <div style={{ padding: 24 }}>
      {/* page header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--t-text)', letterSpacing: '-.01em' }}>
          Exit Interviews
        </div>
        {config?.exit_interview_required ? (
          <span className="badge green">EXIT INTERVIEWS: REQUIRED</span>
        ) : (
          <span className="badge amber">EXIT INTERVIEWS: OPTIONAL</span>
        )}
        {loading && (
          <span style={{ fontSize: 11, color: 'var(--t-text-muted)' }}>Loading…</span>
        )}
      </div>

      {/* load error (honest failure, never fabricated data) */}
      {loadError && (
        <div
          style={{
            background: 'var(--t-surface)',
            border: '1px solid var(--t-danger)',
            color: 'var(--t-danger)',
            padding: '10px 14px',
            fontSize: 12,
            marginBottom: 16,
          }}
        >
          Could not load exit interviews: {loadError}
        </div>
      )}

      {/* KPI tiles */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <div
          style={{
            background: 'var(--t-surface-2)',
            border: '1px solid var(--t-line)',
            padding: '14px 18px',
            minWidth: 110,
          }}
        >
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: 'var(--t-text-muted)',
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
              marginBottom: 6,
            }}
          >
            Pending Interviews
          </div>
          <div
            style={{
              fontSize: 22,
              fontWeight: 800,
              color: pendingCount > 0 ? 'var(--t-warn)' : 'var(--t-text)',
            }}
          >
            {pendingCount}
          </div>
        </div>

        <div
          style={{
            background: 'var(--t-surface-2)',
            border: '1px solid var(--t-line)',
            padding: '14px 18px',
            minWidth: 110,
          }}
        >
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: 'var(--t-text-muted)',
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
              marginBottom: 6,
            }}
          >
            Completed This Quarter
          </div>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--t-success)' }}>{completedThisQuarter}</div>
        </div>

        <div
          style={{
            background: 'var(--t-surface-2)',
            border: '1px solid var(--t-line)',
            padding: '14px 18px',
            minWidth: 110,
          }}
        >
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: 'var(--t-text-muted)',
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
              marginBottom: 6,
            }}
          >
            Completion Rate
          </div>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--t-warn)' }}>
            {completionRate == null ? '—' : `${completionRate}%`}
          </div>
        </div>

        <div
          style={{
            background: 'var(--t-surface-2)',
            border: '1px solid var(--t-line)',
            padding: '14px 18px',
            minWidth: 110,
          }}
        >
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: 'var(--t-text-muted)',
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
              marginBottom: 6,
            }}
          >
            Would Rehire %
          </div>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--t-success)' }}>
            {rehirePct}%
          </div>
        </div>
      </div>

      {/* tab bar */}
      <div
        style={{
          display: 'flex',
          borderBottom: '1px solid var(--t-line)',
          marginBottom: 20,
          gap: 0,
        }}
      >
        <button style={tab === 'pending' ? tabActive : tabBase} onClick={() => setTab('pending')}>
          Pending
          {pendingCount > 0 && (
            <span
              style={{
                marginLeft: 6,
                background: 'var(--t-warn)',
                color: '#000',
                fontSize: 10,
                fontWeight: 800,
                padding: '1px 5px',
              }}
            >
              {pendingCount}
            </span>
          )}
        </button>
        <button
          style={tab === 'completed' ? tabActive : tabBase}
          onClick={() => setTab('completed')}
        >
          Completed
        </button>
        <button
          style={tab === 'conduct' ? tabActive : tabBase}
          onClick={() => setTab('conduct')}
        >
          Conduct Interview
        </button>
      </div>

      {/* ── TAB: PENDING ─────────────────────────────────────── */}
      {tab === 'pending' && (
        <div>
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: 'var(--t-text-muted)',
              letterSpacing: '.08em',
              textTransform: 'uppercase',
              marginBottom: 12,
            }}
          >
            Awaiting Exit Interview
          </div>

          {pending.length === 0 ? (
            <div
              style={{
                background: 'var(--t-surface)',
                border: '1px solid var(--t-line)',
                padding: 24,
                color: 'var(--t-text-muted)',
                fontSize: 13,
              }}
            >
              No pending exit interviews.
            </div>
          ) : (
            <div
              style={{
                background: 'var(--t-surface)',
                border: '1px solid var(--t-line)',
                padding: 0,
                marginBottom: 16,
              }}
            >
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr>
                    {[
                      'Employee',
                      'Location',
                      'Last Day',
                      'Manager',
                      'Days Since Separation',
                      'Status',
                      'Actions',
                    ].map((h) => (
                      <th
                        key={h}
                        style={{
                          padding: '8px 12px',
                          textAlign: 'left',
                          fontSize: 10,
                          fontWeight: 700,
                          color: 'var(--t-text-muted)',
                          letterSpacing: '.08em',
                          borderBottom: '1px solid var(--t-line)',
                          textTransform: 'uppercase',
                        }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pending.map((row) => (
                    <tr key={row.separation_id}>
                      <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--t-line)', color: 'var(--t-text)', fontWeight: 600 }}>
                        {row.employee}
                      </td>
                      <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--t-line)', color: 'var(--t-text)' }}>
                        {row.location}
                      </td>
                      <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--t-line)', color: 'var(--t-text)' }}>
                        {fmt(row.lastDay)}
                      </td>
                      <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--t-line)', color: 'var(--t-text)' }}>
                        {row.manager}
                      </td>
                      <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--t-line)', color: 'var(--t-text)' }}>
                        <span
                          style={{
                            fontWeight: 700,
                            color: row.daysSinceSeparation >= 7 ? 'var(--t-danger)' : 'var(--t-text)',
                          }}
                        >
                          {row.daysSinceSeparation}d
                        </span>
                      </td>
                      <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--t-line)' }}>
                        <span className={statusBadge(row.status)}>{row.status}</span>
                      </td>
                      <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--t-line)' }}>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button
                            style={{
                              background: 'var(--t-surface-2)',
                              border: '1px solid var(--t-line)',
                              color: 'var(--t-text-muted)',
                              padding: '6px 12px',
                              fontSize: 12,
                              fontWeight: 700,
                              cursor: busy ? 'not-allowed' : 'pointer',
                            }}
                            disabled={busy || row.status === 'SCHEDULED'}
                            onClick={() => handleSchedule(row.separation_id)}
                          >
                            Schedule
                          </button>
                          <button
                            style={{
                              background: 'rgba(0,229,255,0.12)',
                              border: '1px solid var(--t-accent)',
                              color: 'var(--t-accent)',
                              padding: '6px 12px',
                              fontSize: 12,
                              fontWeight: 700,
                              cursor: 'pointer',
                            }}
                            onClick={() => handleMarkComplete(row.separation_id)}
                          >
                            Mark Complete
                          </button>
                          <button
                            style={{
                              background: 'rgba(255,59,48,0.1)',
                              border: '1px solid var(--t-danger)',
                              color: 'var(--t-danger)',
                              padding: '6px 12px',
                              fontSize: 12,
                              fontWeight: 700,
                              cursor: 'pointer',
                            }}
                            onClick={() => handleWaive(row.separation_id)}
                          >
                            Waive
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── TAB: COMPLETED ───────────────────────────────────── */}
      {tab === 'completed' && (
        <div>
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: 'var(--t-text-muted)',
              letterSpacing: '.08em',
              textTransform: 'uppercase',
              marginBottom: 12,
            }}
          >
            Completed Exit Interviews
          </div>

          {/* filters — custom date range + location + reason */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }} title="Exit date range">
              <input type="date" value={cDateFrom} onChange={e => setCDateFrom(e.target.value)} style={{ padding: '6px 9px', fontSize: 12, background: 'var(--t-surface)', color: 'var(--t-text)', border: '1px solid var(--t-line)', colorScheme: 'dark' }} />
              <span style={{ color: 'var(--t-text-faint)', fontSize: 11 }}>→</span>
              <input type="date" value={cDateTo} onChange={e => setCDateTo(e.target.value)} style={{ padding: '6px 9px', fontSize: 12, background: 'var(--t-surface)', color: 'var(--t-text)', border: '1px solid var(--t-line)', colorScheme: 'dark' }} />
            </span>
            <select value={cLoc} onChange={e => setCLoc(e.target.value)} style={{ padding: '6px 9px', fontSize: 12, background: 'var(--t-surface)', color: 'var(--t-text)', border: '1px solid var(--t-line)' }}>
              <option value="All">All Locations</option>{locOptions.map(l => <option key={l} value={l}>{l}</option>)}
            </select>
            <select value={cReason} onChange={e => setCReason(e.target.value)} style={{ padding: '6px 9px', fontSize: 12, background: 'var(--t-surface)', color: 'var(--t-text)', border: '1px solid var(--t-line)' }}>
              <option value="All">All Reasons</option>{LEAVE_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
            <span style={{ fontSize: 11, color: 'var(--t-text-muted)' }}>{filteredCompleted.length} of {completed.length}</span>
            {(cDateFrom || cDateTo || cLoc !== 'All' || cReason !== 'All') && <button onClick={() => { setCDateFrom(''); setCDateTo(''); setCLoc('All'); setCReason('All') }} style={{ padding: '6px 9px', fontSize: 11, background: 'var(--t-surface)', color: 'var(--t-danger)', border: '1px solid var(--t-danger)', cursor: 'pointer' }}>✕ Clear</button>}
          </div>

          <div
            style={{
              background: 'var(--t-surface)',
              border: '1px solid var(--t-line)',
              padding: 0,
              marginBottom: 16,
            }}
          >
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr>
                  {[
                    'Employee',
                    'Location',
                    'Exit Date',
                    'Interviewed By',
                    'Would Rehire',
                    'Primary Reason',
                    'Score',
                    'Date Completed',
                  ].map((h) => (
                    <th
                      key={h}
                      style={{
                        padding: '8px 12px',
                        textAlign: 'left',
                        fontSize: 10,
                        fontWeight: 700,
                        color: 'var(--t-text-muted)',
                        letterSpacing: '.08em',
                        borderBottom: '1px solid var(--t-line)',
                        textTransform: 'uppercase',
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredCompleted.length === 0 && (
                  <tr>
                    <td colSpan={8} style={{ padding: 20, textAlign: 'center', color: 'var(--t-text-muted)', fontSize: 13, borderBottom: '1px solid var(--t-line)' }}>
                      {completed.length === 0 ? 'No completed exit interviews yet.' : 'No interviews match the current filters.'}
                    </td>
                  </tr>
                )}
                {filteredCompleted.map((row) => (
                  <tr
                    key={row.id}
                    style={{
                      cursor: 'pointer',
                      background:
                        selectedCompleted === row.id ? 'var(--t-surface-2)' : 'transparent',
                    }}
                    onClick={() =>
                      setSelectedCompleted(selectedCompleted === row.id ? null : row.id)
                    }
                  >
                    <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--t-line)', color: 'var(--t-text)', fontWeight: 600 }}>
                      {row.employee}
                    </td>
                    <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--t-line)', color: 'var(--t-text)' }}>
                      {row.location}
                    </td>
                    <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--t-line)', color: 'var(--t-text)' }}>
                      {fmt(row.exitDate)}
                    </td>
                    <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--t-line)', color: 'var(--t-text)' }}>
                      {row.interviewedBy}
                    </td>
                    <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--t-line)' }}>
                      {row.wouldRehire ? (
                        <span className="badge green">YES</span>
                      ) : (
                        <span className="badge red">NO</span>
                      )}
                    </td>
                    <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--t-line)', color: 'var(--t-text)' }}>
                      {row.primaryReason}
                    </td>
                    <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--t-line)' }}>
                      <span style={{ color: 'var(--t-warn)', fontFamily: 'monospace', letterSpacing: 1 }}>
                        {stars(row.score)}
                      </span>
                    </td>
                    <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--t-line)', color: 'var(--t-text)' }}>
                      {fmt(row.dateCompleted)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* interview detail panel */}
          {detailRecord && (
            <div
              style={{
                background: 'var(--t-surface)',
                border: '1px solid var(--t-line)',
                padding: 16,
                marginBottom: 16,
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: 'var(--t-text-muted)',
                  letterSpacing: '.08em',
                  textTransform: 'uppercase',
                  marginBottom: 12,
                }}
              >
                Exit Interview Detail — {detailRecord.employee}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--t-line)' }}>
                    <span style={{ fontSize: 12, color: 'var(--t-text-muted)', fontWeight: 600 }}>Overall Experience</span>
                    <span style={{ color: 'var(--t-warn)', fontFamily: 'monospace' }}>{stars(detailRecord.overallExp)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--t-line)' }}>
                    <span style={{ fontSize: 12, color: 'var(--t-text-muted)', fontWeight: 600 }}>Management Rating</span>
                    <span style={{ color: 'var(--t-warn)', fontFamily: 'monospace' }}>{stars(detailRecord.mgmtRating)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--t-line)' }}>
                    <span style={{ fontSize: 12, color: 'var(--t-text-muted)', fontWeight: 600 }}>Would Recommend Employer?</span>
                    <span style={{ fontSize: 12, color: 'var(--t-text)', fontWeight: 700 }}>{detailRecord.recommendEmployer}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--t-line)' }}>
                    <span style={{ fontSize: 12, color: 'var(--t-text-muted)', fontWeight: 600 }}>Primary Reason for Leaving</span>
                    <span style={{ fontSize: 12, color: 'var(--t-text)' }}>{detailRecord.primaryReason}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--t-line)' }}>
                    <span style={{ fontSize: 12, color: 'var(--t-text-muted)', fontWeight: 600 }}>Rehire Eligible</span>
                    {detailRecord.wouldRehire ? (
                      <span className="badge green">YES</span>
                    ) : (
                      <span className="badge red">NO</span>
                    )}
                  </div>
                </div>

                <div>
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--t-text-muted)', letterSpacing: '.06em', textTransform: 'uppercase', marginBottom: 4 }}>
                      What Could We Have Done Differently?
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--t-text)', lineHeight: 1.5 }}>
                      {detailRecord.whatCouldDoBetter || '—'}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--t-text-muted)', letterSpacing: '.06em', textTransform: 'uppercase', marginBottom: 4 }}>
                      Suggestions for Improvement
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--t-text)', lineHeight: 1.5 }}>
                      {detailRecord.suggestions || '—'}
                    </div>
                  </div>
                </div>
              </div>

              {/* confidential notes — manager only */}
              {isManager && detailRecord.confidentialNotes && (
                <div
                  style={{
                    background: 'var(--t-surface-2)',
                    border: '1px solid var(--t-warn)',
                    padding: 12,
                    marginTop: 14,
                  }}
                >
                  <div
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      color: 'var(--t-warn)',
                      letterSpacing: '.08em',
                      textTransform: 'uppercase',
                      marginBottom: 6,
                    }}
                  >
                    Manager Only — Confidential Notes
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--t-text)', lineHeight: 1.5 }}>
                    {detailRecord.confidentialNotes}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* aggregate insights */}
          <div
            style={{
              background: 'var(--t-surface)',
              border: '1px solid var(--t-line)',
              padding: 16,
              marginBottom: 16,
            }}
          >
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: 'var(--t-text-muted)',
                letterSpacing: '.08em',
                textTransform: 'uppercase',
                marginBottom: 16,
              }}
            >
              Aggregate Insights
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
              {/* top reasons */}
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--t-text-muted)', marginBottom: 10, letterSpacing: '.06em', textTransform: 'uppercase' }}>
                  Top Reasons for Leaving
                </div>
                {reasonCounts.map((r) => (
                  <div key={r.reason} style={{ marginBottom: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ fontSize: 12, color: 'var(--t-text)' }}>{r.reason}</span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--t-text-muted)' }}>{r.count}</span>
                    </div>
                    <div style={{ height: 6, background: 'var(--t-line)' }}>
                      <div
                        style={{
                          height: '100%',
                          width: `${(r.count / maxReasonCount) * 100}%`,
                          background: 'rgba(0,229,255,0.3)',
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>

              {/* averages + trend */}
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--t-text-muted)', marginBottom: 10, letterSpacing: '.06em', textTransform: 'uppercase' }}>
                  Ratings Summary
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--t-line)' }}>
                  <span style={{ fontSize: 12, color: 'var(--t-text-muted)', fontWeight: 600 }}>Avg. Management Rating</span>
                  <span style={{ fontSize: 12, color: 'var(--t-warn)', fontFamily: 'monospace' }}>{avgMgmt} / 5</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--t-line)' }}>
                  <span style={{ fontSize: 12, color: 'var(--t-text-muted)', fontWeight: 600 }}>Avg. Overall Score</span>
                  <span style={{ fontSize: 12, color: 'var(--t-warn)', fontFamily: 'monospace' }}>{avgScore} / 5</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0' }}>
                  <span style={{ fontSize: 12, color: 'var(--t-text-muted)', fontWeight: 600 }}>Trend vs. Prior Quarter</span>
                  {trendDelta == null ? (
                    <span style={{ fontSize: 12, color: 'var(--t-text-muted)', fontWeight: 700 }}>
                      Not enough data
                    </span>
                  ) : (
                    <span
                      style={{
                        fontSize: 12,
                        fontWeight: 700,
                        color: trendDelta > 0.05 ? 'var(--t-success)' : trendDelta < -0.05 ? 'var(--t-danger)' : 'var(--t-text-muted)',
                      }}
                    >
                      {trendDelta > 0.05 ? 'Improving' : trendDelta < -0.05 ? 'Declining' : 'Flat'} — {trendDelta >= 0 ? '+' : ''}{trendDelta.toFixed(1)} pts
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── TAB: CONDUCT INTERVIEW ───────────────────────────── */}
      {tab === 'conduct' && (
        <div>
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: 'var(--t-text-muted)',
              letterSpacing: '.08em',
              textTransform: 'uppercase',
              marginBottom: 12,
            }}
          >
            Conduct Exit Interview
          </div>

          <div
            style={{
              background: 'var(--t-surface)',
              border: '1px solid var(--t-line)',
              padding: 16,
              marginBottom: 16,
            }}
          >
            {/* employee selector */}
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--t-text-muted)', letterSpacing: '.06em', textTransform: 'uppercase', marginBottom: 6 }}>
                Employee
              </div>
              <select
                value={conductEmp}
                onChange={(e) => setConductEmp(e.target.value)}
                style={{
                  background: 'var(--t-surface-2)',
                  border: '1px solid var(--t-line)',
                  color: 'var(--t-text)',
                  padding: '6px 10px',
                  fontSize: 13,
                  minWidth: 220,
                  outline: 'none',
                }}
              >
                <option value="">— Select employee —</option>
                {pending.map((p) => (
                  <option key={p.separation_id} value={p.separation_id}>
                    {p.employee} ({p.location})
                  </option>
                ))}
              </select>
            </div>

            {/* overall experience */}
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--t-text-muted)', letterSpacing: '.06em', textTransform: 'uppercase', marginBottom: 6 }}>
                Overall Experience (1–5)
              </div>
              <StarInput value={conductOverall} onChange={setConductOverall} />
            </div>

            {/* management rating */}
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--t-text-muted)', letterSpacing: '.06em', textTransform: 'uppercase', marginBottom: 6 }}>
                Management Rating (1–5)
              </div>
              <StarInput value={conductMgmt} onChange={setConductMgmt} />
            </div>

            {/* recommend employer */}
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--t-text-muted)', letterSpacing: '.06em', textTransform: 'uppercase', marginBottom: 6 }}>
                Would You Recommend Us as an Employer?
              </div>
              <div style={{ display: 'flex', gap: 16 }}>
                {['Yes', 'No', 'Maybe'].map((opt) => (
                  <label key={opt} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13, color: 'var(--t-text)' }}>
                    <input
                      type="radio"
                      name="conductRecommend"
                      value={opt}
                      checked={conductRecommend === opt}
                      onChange={() => setConductRecommend(opt)}
                    />
                    {opt}
                  </label>
                ))}
              </div>
            </div>

            {/* primary reason */}
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--t-text-muted)', letterSpacing: '.06em', textTransform: 'uppercase', marginBottom: 6 }}>
                Primary Reason for Leaving
              </div>
              <select
                value={conductReason}
                onChange={(e) => setConductReason(e.target.value)}
                style={{
                  background: 'var(--t-surface-2)',
                  border: '1px solid var(--t-line)',
                  color: 'var(--t-text)',
                  padding: '6px 10px',
                  fontSize: 13,
                  minWidth: 220,
                  outline: 'none',
                }}
              >
                {LEAVE_REASONS.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>

            {/* what could we have done differently */}
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--t-text-muted)', letterSpacing: '.06em', textTransform: 'uppercase', marginBottom: 6 }}>
                What Could We Have Done Differently?
              </div>
              <textarea
                value={conductBetter}
                onChange={(e) => setConductBetter(e.target.value)}
                rows={3}
                style={{
                  background: 'var(--t-surface-2)',
                  border: '1px solid var(--t-line)',
                  color: 'var(--t-text)',
                  padding: '7px 10px',
                  fontSize: 13,
                  outline: 'none',
                  width: '100%',
                  boxSizing: 'border-box',
                  resize: 'vertical',
                }}
                placeholder="Enter employee response..."
              />
            </div>

            {/* suggestions */}
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--t-text-muted)', letterSpacing: '.06em', textTransform: 'uppercase', marginBottom: 6 }}>
                Suggestions for Improvement
              </div>
              <textarea
                value={conductSuggestions}
                onChange={(e) => setConductSuggestions(e.target.value)}
                rows={3}
                style={{
                  background: 'var(--t-surface-2)',
                  border: '1px solid var(--t-line)',
                  color: 'var(--t-text)',
                  padding: '7px 10px',
                  fontSize: 13,
                  outline: 'none',
                  width: '100%',
                  boxSizing: 'border-box',
                  resize: 'vertical',
                }}
                placeholder="Enter employee suggestions..."
              />
            </div>

            {/* rehire eligible */}
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--t-text-muted)', letterSpacing: '.06em', textTransform: 'uppercase', marginBottom: 6 }}>
                Rehire Eligible?
              </div>
              <div style={{ display: 'flex', gap: 16 }}>
                {['Yes', 'No'].map((opt) => (
                  <label key={opt} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13, color: 'var(--t-text)' }}>
                    <input
                      type="radio"
                      name="conductRehire"
                      value={opt}
                      checked={conductRehire === opt}
                      onChange={() => setConductRehire(opt)}
                    />
                    {opt}
                  </label>
                ))}
              </div>
            </div>

            {/* confidential notes — manager only */}
            {isManager && (
              <div style={{ marginBottom: 14 }}>
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: 'var(--t-warn)',
                    letterSpacing: '.06em',
                    textTransform: 'uppercase',
                    marginBottom: 6,
                  }}
                >
                  Confidential Notes (Manager Only)
                </div>
                <textarea
                  value={conductNotes}
                  onChange={(e) => setConductNotes(e.target.value)}
                  rows={3}
                  style={{
                    background: 'var(--t-surface-2)',
                    border: '1px solid var(--t-warn)',
                    color: 'var(--t-text)',
                    padding: '7px 10px',
                    fontSize: 13,
                    outline: 'none',
                    width: '100%',
                    boxSizing: 'border-box',
                    resize: 'vertical',
                  }}
                  placeholder="Internal notes not visible to employee..."
                />
              </div>
            )}

            {/* submit */}
            <div style={{ marginTop: 20 }}>
              <button
                onClick={handleConductSubmit}
                disabled={!conductEmp || conductOverall === 0}
                style={{
                  background: conductEmp && conductOverall > 0
                    ? 'rgba(0,229,255,0.12)'
                    : 'var(--t-surface-2)',
                  border: conductEmp && conductOverall > 0
                    ? '1px solid var(--t-accent)'
                    : '1px solid var(--t-line)',
                  color: conductEmp && conductOverall > 0
                    ? 'var(--t-accent)'
                    : 'var(--t-text-muted)',
                  padding: '8px 20px',
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: conductEmp && conductOverall > 0 ? 'pointer' : 'not-allowed',
                  letterSpacing: '.04em',
                }}
              >
                Complete Interview
              </button>
              {(!conductEmp || conductOverall === 0) && (
                <span style={{ marginLeft: 12, fontSize: 11, color: 'var(--t-text-muted)' }}>
                  Select an employee and provide an overall rating to submit.
                </span>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
