import { useState, useEffect, useCallback, useMemo } from 'react'
import { sb } from '../lib/supabase'
import { useScope } from '../lib/scope.jsx'
import { useAuth } from '../lib/auth.jsx'
import DrillDown from '../components/DrillDown.jsx'

// ─── Constants ────────────────────────────────────────────────────────────────

// Reasons offered when logging a callout. 'No Call No Show' maps to the
// shift_exceptions.exception_type = 'no_show'; everything else = 'callout'.
const CALLOUT_REASONS = [
  'Sick / Illness',
  'Family Emergency',
  'Car Trouble',
  'No Call No Show',
  'Personal Day',
  'Childcare Issue',
  'Weather',
  'Other',
]

const NCNS_LABEL = 'No Call No Show'
const HR_ROLES = ['ceo', 'hr', 'manager', 'coo', 'admin', 'owner']

// ─── Helpers ──────────────────────────────────────────────────────────────────

function today() { return new Date().toISOString().slice(0, 10) }

function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00')
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

function fmtDate(dateStr) {
  if (!dateStr) return '—'
  const s = String(dateStr).slice(0, 10)
  const d = new Date(s + 'T00:00:00')
  if (isNaN(d)) return s
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function fmtDateTime(ts) {
  if (!ts) return '—'
  const d = new Date(ts)
  if (isNaN(d)) return '—'
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

// Map a forensic_callouts row (from shift_exceptions) to the tracker entry shape.
function forensicRowToEntry(r) {
  const isNoShow = r.exception_type === 'no_show'
  const date = String(r.callout_date || '').slice(0, 10)
  return {
    id: r.exception_id,
    date,
    employee: {
      id: r.employee_id,
      name: r.employee || 'Unknown',
      role: '',
    },
    location: r.node || '',
    slot: r.shift_slot || null,
    exceptionType: r.exception_type,
    reason: isNoShow ? NCNS_LABEL : (r.reason || 'Other'),
    reportedAt: r.reported_at,
    covered: !!r.covered,
    coveredBy: r.covered_by || null,
    excused: r.excused,
    ptoUsed: !!r.pto_used,
    shortStaffed: !!r.short_staffed,
    disciplinaryCount: r.disciplinary_count || 0,
    note: r.reason || '',
    isToday: date === today(),
  }
}

// ─── KPI Tile ─────────────────────────────────────────────────────────────────

function KTile({ label, value, sub, color, alert, onClick }) {
  return (
    <div onClick={onClick} title={onClick ? 'Click to drill into records' : undefined} style={{
      background: 'var(--t-surface)',
      border: `1px solid ${alert === 'red' ? 'var(--t-danger)' : alert === 'amber' ? 'var(--t-warn)' : 'var(--t-line)'}`,
      padding: '14px 16px',
      position: 'relative',
      overflow: 'hidden',
      borderRadius: 0,
      cursor: onClick ? 'pointer' : 'default',
    }}>
      {alert === 'red' && <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'var(--t-danger)' }} />}
      {alert === 'amber' && <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'var(--t-warn)' }} />}
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.08em', color: 'var(--t-text-muted)', textTransform: 'uppercase', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800, color: color || 'var(--t-text)', lineHeight: 1, marginBottom: 4 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--t-text-faint)' }}>{sub}</div>}
    </div>
  )
}

// ─── Badge ────────────────────────────────────────────────────────────────────

function Badge({ children, cls }) {
  const colors = {
    green:  { bg: 'rgba(42,214,160,0.12)',  border: 'rgba(42,214,160,0.3)',  text: '#2ad6a0' },
    red:    { bg: 'rgba(239,68,68,0.12)',   border: 'rgba(239,68,68,0.3)',   text: '#ef4444' },
    amber:  { bg: 'rgba(251,146,60,0.12)',  border: 'rgba(251,146,60,0.3)',  text: '#fb923c' },
    blue:   { bg: 'rgba(96,165,250,0.12)',  border: 'rgba(96,165,250,0.3)',  text: '#60a5fa' },
    gray:   { bg: 'rgba(148,163,184,0.1)', border: 'rgba(148,163,184,0.2)', text: '#94a3b8' },
  }
  const c = colors[cls] || colors.gray
  return (
    <span style={{
      fontSize: 10, fontWeight: 800,
      padding: '2px 7px',
      background: c.bg,
      border: `1px solid ${c.border}`,
      color: c.text,
      letterSpacing: '0.05em',
      textTransform: 'uppercase',
      whiteSpace: 'nowrap',
      borderRadius: 0,
    }}>
      {children}
    </span>
  )
}

// ─── Coverage Finder Modal ────────────────────────────────────────────────────
// Candidates are the REAL roster (get_roster) for the callout's location, ranked
// by real reliability signals (same store, key personnel, fewer recent callouts).

function findCoverageOptions(callout, roster) {
  return roster
    .filter(e => e.id && e.id !== callout.employee.id)
    .map(e => {
      const sameStore = e.location && callout.location && e.location === callout.location
      const isKey = /manager|key/i.test(e.role || '')
      const reliability = Math.max(0, 20 - (Number(e.callouts_30d) || 0) * 4)
      return {
        ...e,
        sameStore,
        isKey,
        score: (sameStore ? 50 : 0) + (isKey ? 20 : 0) + reliability,
      }
    })
    .sort((a, b) => (b.sameStore - a.sameStore) || (b.score - a.score))
    .slice(0, 8)
}

function CoverageFinder({ callout, roster, onAccept, onClose, busy }) {
  const options = useMemo(() => findCoverageOptions(callout, roster), [callout, roster])
  const [note, setNote] = useState('')
  const [selected, setSelected] = useState(null)

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', width: 480, maxHeight: '80vh', overflowY: 'auto', padding: 24, boxShadow: '0 24px 64px rgba(0,0,0,0.5)', borderRadius: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--t-text)' }}>Find Coverage</div>
            <div style={{ fontSize: 12, color: 'var(--t-text-muted)', marginTop: 2 }}>{callout.employee.name} · {callout.location || '—'}</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--t-text-muted)', fontSize: 18, cursor: 'pointer', padding: '4px 8px' }}>✕</button>
        </div>

        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--t-text-muted)', letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 8 }}>
          Ranked Candidates — {callout.location || 'All Locations'}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
          {options.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--t-text-faint)', padding: '10px 0' }}>No available team members found for this location.</div>
          ) : options.map(emp => (
            <div
              key={emp.id}
              onClick={() => setSelected(emp)}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '10px 12px',
                background: selected?.id === emp.id ? 'rgba(42,214,160,0.08)' : 'var(--t-bg)',
                border: `1px solid ${selected?.id === emp.id ? 'rgba(42,214,160,0.4)' : 'var(--t-line)'}`,
                cursor: 'pointer',
                borderRadius: 0,
              }}
            >
              <div>
                <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--t-text)' }}>{emp.full_name}</div>
                <div style={{ fontSize: 11, color: 'var(--t-text-muted)' }}>{emp.role || 'Associate'} · {emp.location || '—'}</div>
              </div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                {emp.isKey && <Badge cls="blue">Key</Badge>}
                {emp.sameStore && <Badge cls="green">Same Store</Badge>}
                <span style={{ fontSize: 11, color: 'var(--t-text-faint)' }}>Score {emp.score}</span>
              </div>
            </div>
          ))}
        </div>

        <textarea
          value={note}
          onChange={e => setNote(e.target.value)}
          placeholder="Notes (optional)…"
          rows={2}
          style={{
            width: '100%', boxSizing: 'border-box',
            background: 'var(--t-bg)', border: '1px solid var(--t-line)',
            color: 'var(--t-text)', fontSize: 12, padding: '8px 10px',
            resize: 'vertical', fontFamily: 'inherit', borderRadius: 0,
            marginBottom: 12,
          }}
        />

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '8px 16px', background: 'var(--t-bg)', border: '1px solid var(--t-line)', color: 'var(--t-text-muted)', fontSize: 12, fontWeight: 700, cursor: 'pointer', borderRadius: 0 }}>Cancel</button>
          <button
            onClick={() => selected && onAccept(selected, note)}
            disabled={!selected || busy}
            style={{ padding: '8px 16px', background: (selected && !busy) ? 'var(--t-accent)' : 'rgba(42,214,160,0.2)', border: 'none', color: (selected && !busy) ? '#000' : 'var(--t-text-muted)', fontSize: 12, fontWeight: 800, cursor: (selected && !busy) ? 'pointer' : 'not-allowed', borderRadius: 0 }}
          >
            {busy ? 'Assigning…' : 'Assign Coverage'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Callout Detail Row ───────────────────────────────────────────────────────

function CalloutRow({ entry, onFindCoverage, onMarkOpen, onSaveNote, busy }) {
  const [expanded, setExpanded] = useState(false)
  const [localNote, setLocalNote] = useState(entry.note || '')
  const [dirty, setDirty] = useState(false)

  const reasonColor = {
    [NCNS_LABEL]: 'red',
    'Sick / Illness': 'amber',
    'Family Emergency': 'amber',
    'Car Trouble': 'amber',
  }[entry.reason] || 'gray'

  return (
    <div style={{
      border: '1px solid var(--t-line)',
      background: entry.isToday ? 'rgba(251,146,60,0.04)' : 'var(--t-surface)',
      borderLeft: entry.isToday ? '3px solid var(--t-warn)' : '3px solid transparent',
      marginBottom: 4,
      borderRadius: 0,
    }}>
      <div
        onClick={() => setExpanded(x => !x)}
        style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', cursor: 'pointer' }}
      >
        <div style={{ minWidth: 80, fontSize: 11, color: 'var(--t-text-muted)', fontWeight: 600 }}>
          {fmtDate(entry.date)}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--t-text)' }}>
            {entry.employee.name}
            {entry.isToday && <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 800, color: 'var(--t-warn)' }}>TODAY</span>}
          </div>
          <div style={{ fontSize: 11, color: 'var(--t-text-muted)' }}>
            {entry.location || '—'}{entry.slot ? ` · ${entry.slot}` : ''}
          </div>
        </div>
        <Badge cls={reasonColor}>{entry.reason}</Badge>
        <Badge cls={entry.covered ? 'green' : 'red'}>{entry.covered ? 'Covered' : 'Open'}</Badge>
        {entry.shortStaffed && <Badge cls="amber">Short</Badge>}
        <span style={{ fontSize: 12, color: 'var(--t-text-faint)', userSelect: 'none' }}>{expanded ? '▲' : '▼'}</span>
      </div>

      {expanded && (
        <div style={{ padding: '0 14px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 12, color: 'var(--t-text-muted)' }}>
            <span>Reported: <strong style={{ color: 'var(--t-text)' }}>{fmtDateTime(entry.reportedAt)}</strong></span>
            <span>Type: <strong style={{ color: 'var(--t-text)' }}>{(entry.exceptionType || '').toUpperCase() || '—'}</strong></span>
            {entry.coveredBy && <span>Covered by: <strong style={{ color: 'var(--t-text)' }}>{entry.coveredBy}</strong></span>}
            {entry.ptoUsed && <Badge cls="blue">PTO</Badge>}
            {entry.excused === true && <Badge cls="green">Excused</Badge>}
            {entry.excused === false && <Badge cls="amber">Unexcused</Badge>}
            {entry.disciplinaryCount > 0 && <Badge cls="amber">{entry.disciplinaryCount} prior DA</Badge>}
          </div>
          <textarea
            value={localNote}
            onChange={e => { setLocalNote(e.target.value); setDirty(true) }}
            placeholder="Add note…"
            rows={2}
            style={{
              background: 'var(--t-bg)', border: '1px solid var(--t-line)',
              color: 'var(--t-text)', fontSize: 12, padding: '6px 8px',
              resize: 'vertical', fontFamily: 'inherit', borderRadius: 0, width: '100%', boxSizing: 'border-box',
            }}
          />
          <div style={{ display: 'flex', gap: 8 }}>
            {dirty && (
              <button
                onClick={() => { onSaveNote(entry.id, localNote); setDirty(false) }}
                disabled={busy}
                style={{ padding: '6px 14px', background: 'var(--t-accent)', border: 'none', color: '#000', fontSize: 11, fontWeight: 800, cursor: busy ? 'not-allowed' : 'pointer', borderRadius: 0 }}
              >
                Save Note
              </button>
            )}
            {!entry.covered ? (
              <button
                onClick={() => onFindCoverage(entry)}
                style={{ padding: '6px 14px', background: 'var(--t-accent)', border: 'none', color: '#000', fontSize: 11, fontWeight: 800, cursor: 'pointer', borderRadius: 0 }}
              >
                Find Coverage
              </button>
            ) : (
              <button
                onClick={() => onMarkOpen(entry.id)}
                disabled={busy}
                style={{
                  padding: '6px 14px',
                  background: 'rgba(239,68,68,0.12)',
                  border: '1px solid rgba(239,68,68,0.3)',
                  color: '#ef4444',
                  fontSize: 11, fontWeight: 800, cursor: busy ? 'not-allowed' : 'pointer', borderRadius: 0,
                }}
              >
                Mark Open
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function CalloutTracker() {
  const { session }     = useAuth()
  const { locationIds } = useScope()

  // ── Data state ──────────────────────────────────────────────────────────────
  const [callouts, setCallouts]     = useState([])
  const [roster, setRoster]         = useState([])
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState(null)
  const [saveStatus, setSaveStatus] = useState(null) // null | 'saving' | 'saved' | 'error'
  const [busy, setBusy]             = useState(false)

  // ── Filter state ────────────────────────────────────────────────────────────
  const [locFilter, setLocFilter]       = useState('All')
  const [covFilter, setCovFilter]       = useState('All') // All | Open | Covered
  const [reasonFilter, setReasonFilter] = useState('All')
  const [search, setSearch]             = useState('')
  const [dateFrom, setDateFrom]         = useState(addDays(today(), -30))
  const [dateTo, setDateTo]             = useState(today())

  // ── Modal state ─────────────────────────────────────────────────────────────
  const [coverageFor, setCoverageFor]   = useState(null)
  const [showAddModal, setShowAddModal] = useState(false)

  // ── Add-callout form ────────────────────────────────────────────────────────
  const blankForm = { personId: '', reason: CALLOUT_REASONS[0], note: '' }
  const [addForm, setAddForm] = useState(blankForm)

  const flash = useCallback((status) => {
    setSaveStatus(status)
    setTimeout(() => setSaveStatus(null), 3000)
  }, [])

  // ─── Load callouts (real) from forensic_callouts ───────────────────────────

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const nodeIds = locationIds && locationIds.length > 0 ? locationIds : []
      if (nodeIds.length === 0) {
        setCallouts([])
        setRoster([])
        setLoading(false)
        return
      }

      const [coRes, rosterRes] = await Promise.all([
        sb.rpc('forensic_callouts', { p_node_ids: nodeIds, p_date_from: dateFrom || null, p_date_to: dateTo || null }),
        sb.rpc('get_roster', { p_node_ids: nodeIds }),
      ])

      if (coRes.error) throw coRes.error
      const rows = Array.isArray(coRes.data?.callouts) ? coRes.data.callouts : []
      setCallouts(rows.map(forensicRowToEntry))

      if (!rosterRes.error && Array.isArray(rosterRes.data)) {
        setRoster(rosterRes.data.map(r => ({
          id: r.id ?? r.person_id,
          full_name: r.full_name,
          role: r.role_name ?? r.role ?? '',
          location: r.node_name ?? r.location ?? '',
          callouts_30d: r.callouts_30d ?? 0,
        })))
      } else {
        setRoster([])
      }
    } catch (err) {
      console.error('[CalloutTracker] load error:', err)
      setError(err.message || 'Failed to load callouts.')
      setCallouts([])
    } finally {
      setLoading(false)
    }
  }, [locationIds, dateFrom, dateTo])

  useEffect(() => { load() }, [load])

  // ─── Writes (all go to shift_exceptions via SECURITY DEFINER RPCs) ─────────

  const handleFindCoverageAccept = useCallback(async (calloutEntry, coverEmp, note) => {
    setBusy(true)
    setSaveStatus('saving')
    try {
      const { error } = await sb.rpc('set_callout_coverage', {
        p_exception_id: calloutEntry.id,
        p_swap_person_id: coverEmp.id,
        p_note: note || null,
      })
      if (error) throw error
      setCoverageFor(null)
      flash('saved')
      await load()
    } catch (err) {
      console.error('[CalloutTracker] set_callout_coverage error:', err)
      flash('error')
    } finally {
      setBusy(false)
    }
  }, [flash, load])

  const handleMarkOpen = useCallback(async (id) => {
    setBusy(true)
    setSaveStatus('saving')
    try {
      const { error } = await sb.rpc('set_callout_coverage', {
        p_exception_id: id,
        p_swap_person_id: null,
        p_note: null,
      })
      if (error) throw error
      flash('saved')
      await load()
    } catch (err) {
      console.error('[CalloutTracker] mark open error:', err)
      flash('error')
    } finally {
      setBusy(false)
    }
  }, [flash, load])

  const handleSaveNote = useCallback(async (id, note) => {
    setBusy(true)
    setSaveStatus('saving')
    try {
      const { error } = await sb.rpc('set_callout_note', { p_exception_id: id, p_note: note })
      if (error) throw error
      flash('saved')
      await load()
    } catch (err) {
      console.error('[CalloutTracker] set_callout_note error:', err)
      flash('error')
    } finally {
      setBusy(false)
    }
  }, [flash, load])

  const handleAddCallout = useCallback(async () => {
    if (!addForm.personId) return
    const isNoShow = addForm.reason === NCNS_LABEL
    setBusy(true)
    setSaveStatus('saving')
    try {
      const { error } = await sb.rpc('log_callout', {
        p_person_id: addForm.personId,
        p_exception_type: isNoShow ? 'no_show' : 'callout',
        p_callout_reason: addForm.reason,
        p_note: addForm.note || null,
        p_reported_by: session?.person?.id || null,
        p_node_ids: locationIds && locationIds.length > 0 ? locationIds : null,
      })
      if (error) throw error
      setAddForm(blankForm)
      setShowAddModal(false)
      flash('saved')
      await load()
    } catch (err) {
      console.error('[CalloutTracker] log_callout error:', err)
      flash('error')
    } finally {
      setBusy(false)
    }
  }, [addForm, session, locationIds, flash, load, blankForm])

  // ─── Derived location list (real, from data) ───────────────────────────────

  const locationOptions = useMemo(() => {
    const set = new Set()
    callouts.forEach(c => { if (c.location) set.add(c.location) })
    roster.forEach(r => { if (r.location) set.add(r.location) })
    return Array.from(set).sort()
  }, [callouts, roster])

  // ─── Derived / filtered list ───────────────────────────────────────────────

  const filtered = useMemo(() => {
    return callouts.filter(c => {
      if (locFilter !== 'All' && c.location !== locFilter) return false
      if (covFilter === 'Open' && c.covered) return false
      if (covFilter === 'Covered' && !c.covered) return false
      if (reasonFilter !== 'All' && c.reason !== reasonFilter) return false
      if (search) {
        const q = search.toLowerCase()
        if (!c.employee.name.toLowerCase().includes(q) && !String(c.location).toLowerCase().includes(q)) return false
      }
      return true
    })
  }, [callouts, locFilter, covFilter, reasonFilter, search])

  // ─── KPIs ──────────────────────────────────────────────────────────────────

  const kpis = useMemo(() => {
    const todayStr = today()
    const todayEntries = callouts.filter(c => c.date === todayStr)
    const openToday    = todayEntries.filter(c => !c.covered).length
    const total        = callouts.length
    const uncovered    = callouts.filter(c => !c.covered).length
    const covered      = callouts.filter(c => c.covered).length
    const ncns         = callouts.filter(c => c.exceptionType === 'no_show').length
    return { openToday, todayTotal: todayEntries.length, total, uncovered, covered, ncns }
  }, [callouts])

  // ─── Drill-down ──────────────────────────────────────────────────────────────
  const [drill, setDrill] = useState(null)
  const CALLOUT_COLS = [
    { key: 'employee', label: 'Employee', value: c => c.employee?.name || '—' },
    { key: 'location', label: 'Location', value: c => c.location || '—' },
    { key: 'date', label: 'Date', value: c => fmtDate(c.date), sortKey: c => c.date },
    { key: 'slot', label: 'Slot', value: c => c.slot || '—' },
    { key: 'reason', label: 'Reason', value: c => c.reason },
    { key: 'covered', label: 'Status', value: c => (c.covered ? 'Covered' : 'Open') },
    { key: 'coveredBy', label: 'Covered By', value: c => c.coveredBy || '—' },
  ]
  const openDrill = (title, rows, accent) => setDrill({ title, subtitle: `${rows.length} callout${rows.length === 1 ? '' : 's'}`, columns: CALLOUT_COLS, rows, accent })
  const todayStr = today()

  // ─── Render ────────────────────────────────────────────────────────────────

  const canManage = HR_ROLES.includes(session?.person?.role_name?.toLowerCase() || '')
  const noScope = !locationIds || locationIds.length === 0

  const inputStyle = {
    background: 'var(--t-bg)',
    border: '1px solid var(--t-line)',
    color: 'var(--t-text)',
    fontSize: 12,
    padding: '6px 10px',
    fontFamily: 'inherit',
    borderRadius: 0,
  }

  return (
    <div style={{ padding: '0 0 40px', color: 'var(--t-text)' }}>

      {/* ── Header ── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '16px 20px',
        background: 'var(--t-surface)',
        borderBottom: '1px solid var(--t-line)',
        marginBottom: 20,
        flexWrap: 'wrap', gap: 12,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 900, letterSpacing: '-.01em' }}>Callout Tracker</div>
            <div style={{ fontSize: 11, color: 'var(--t-text-muted)', marginTop: 2 }}>Callout &amp; no-show log</div>
          </div>
          {loading
            ? <Badge cls="gray">Loading…</Badge>
            : error
              ? <Badge cls="red">Error</Badge>
              : <Badge cls="green">Live</Badge>
          }
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {saveStatus === 'saving' && <Badge cls="blue">Saving…</Badge>}
          {saveStatus === 'saved'  && <Badge cls="green">Saved</Badge>}
          {saveStatus === 'error'  && <Badge cls="red">Save Error</Badge>}

          <button onClick={load} style={{ ...inputStyle, cursor: 'pointer' }}>↻ Refresh</button>

          {canManage && (
            <button
              onClick={() => setShowAddModal(true)}
              disabled={noScope}
              style={{ padding: '7px 16px', background: noScope ? 'rgba(42,214,160,0.2)' : 'var(--t-accent)', border: 'none', color: noScope ? 'var(--t-text-muted)' : '#000', fontSize: 12, fontWeight: 800, cursor: noScope ? 'not-allowed' : 'pointer', borderRadius: 0 }}
            >
              + Log Callout
            </button>
          )}
        </div>
      </div>

      {/* ── Error banner ── */}
      {error && (
        <div style={{ margin: '0 20px 16px', padding: '10px 14px', border: '1px solid var(--t-danger)', background: 'rgba(239,68,68,0.08)', color: 'var(--t-danger)', fontSize: 12, borderRadius: 0 }}>
          {error}
        </div>
      )}

      {/* ── KPI Row ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8, padding: '0 20px 20px' }}>
        <KTile label="Open Today"      value={kpis.openToday}   sub={`${kpis.todayTotal} total today`}  color={kpis.openToday > 0 ? 'var(--t-danger)' : 'var(--t-success)'}  alert={kpis.openToday > 1 ? 'red' : kpis.openToday > 0 ? 'amber' : null} onClick={() => openDrill('Open Callouts Today', callouts.filter(c => c.date === todayStr && !c.covered), 'var(--t-danger)')} />
        <KTile label="Total"           value={kpis.total}       sub="in selected range"                 onClick={() => openDrill('All Callouts — Selected Range', callouts, 'var(--t-accent)')} />
        <KTile label="Uncovered"       value={kpis.uncovered}   sub="in selected range"                 color={kpis.uncovered > 5 ? 'var(--t-danger)' : undefined}            alert={kpis.uncovered > 10 ? 'red' : kpis.uncovered > 5 ? 'amber' : null} onClick={() => openDrill('Uncovered Callouts', callouts.filter(c => !c.covered), 'var(--t-danger)')} />
        <KTile label="Covered"         value={kpis.covered}     sub="in selected range"                 color={kpis.covered > 0 ? 'var(--t-success)' : undefined} onClick={() => openDrill('Covered Callouts', callouts.filter(c => c.covered), 'var(--t-success)')} />
        <KTile label="No Call No Show" value={kpis.ncns}        sub="in selected range"                 color={kpis.ncns > 3  ? 'var(--t-danger)' : undefined}                alert={kpis.ncns > 3 ? 'red' : null} onClick={() => openDrill('No Call / No Show', callouts.filter(c => c.exceptionType === 'no_show'), 'var(--t-danger)')} />
      </div>

      {/* ── Filters ── */}
      <div style={{ padding: '0 20px 16px', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search employee / location…"
          style={{ ...inputStyle, minWidth: 200, flex: 1 }}
        />
        <select value={locFilter} onChange={e => setLocFilter(e.target.value)} style={inputStyle}>
          <option value="All">All Locations</option>
          {locationOptions.map(l => <option key={l} value={l}>{l}</option>)}
        </select>
        <select value={covFilter} onChange={e => setCovFilter(e.target.value)} style={inputStyle}>
          <option value="All">All Status</option>
          <option value="Open">Open</option>
          <option value="Covered">Covered</option>
        </select>
        <select value={reasonFilter} onChange={e => setReasonFilter(e.target.value)} style={inputStyle}>
          <option value="All">All Reasons</option>
          {CALLOUT_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }} title="Date range">
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={{ ...inputStyle, colorScheme: 'dark' }} />
          <span style={{ color: 'var(--t-text-faint)', fontSize: 11 }}>→</span>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} style={{ ...inputStyle, colorScheme: 'dark' }} />
        </span>
        {(locFilter !== 'All' || reasonFilter !== 'All' || covFilter !== 'All' || search) &&
          <button onClick={() => { setLocFilter('All'); setReasonFilter('All'); setCovFilter('All'); setSearch('') }} style={{ ...inputStyle, cursor: 'pointer', color: 'var(--t-danger)', borderColor: 'var(--t-danger)' }}>✕ Clear</button>}
      </div>

      {/* ── Result count ── */}
      <div style={{ padding: '0 20px 10px', fontSize: 11, color: 'var(--t-text-muted)' }}>
        {filtered.length} entries {filtered.length !== callouts.length ? `(filtered from ${callouts.length})` : ''}
      </div>

      {/* ── Callout list ── */}
      <div style={{ padding: '0 20px' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--t-text-muted)', fontSize: 13 }}>Loading callouts…</div>
        ) : noScope ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--t-text-muted)', fontSize: 13 }}>Select a location to view callouts.</div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--t-text-muted)', fontSize: 13 }}>
            {callouts.length === 0 ? 'No callouts logged for this location and date range.' : 'No callouts match filters.'}
          </div>
        ) : (
          filtered.map(entry => (
            <CalloutRow
              key={entry.id}
              entry={entry}
              busy={busy}
              onFindCoverage={setCoverageFor}
              onMarkOpen={handleMarkOpen}
              onSaveNote={handleSaveNote}
            />
          ))
        )}
      </div>

      {/* ── Coverage Finder Modal ── */}
      {coverageFor && (
        <CoverageFinder
          callout={coverageFor}
          roster={roster}
          busy={busy}
          onAccept={(emp, note) => handleFindCoverageAccept(coverageFor, emp, note)}
          onClose={() => setCoverageFor(null)}
        />
      )}

      {/* ── Add Callout Modal ── */}
      {showAddModal && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={e => { if (e.target === e.currentTarget) setShowAddModal(false) }}
        >
          <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', width: 420, padding: 24, boxShadow: '0 24px 64px rgba(0,0,0,0.5)', borderRadius: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
              <div style={{ fontSize: 14, fontWeight: 800 }}>Log Callout</div>
              <button onClick={() => setShowAddModal(false)} style={{ background: 'none', border: 'none', color: 'var(--t-text-muted)', fontSize: 18, cursor: 'pointer' }}>✕</button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--t-text-muted)', marginBottom: 4 }}>EMPLOYEE</div>
                <select
                  value={addForm.personId}
                  onChange={e => setAddForm(f => ({ ...f, personId: e.target.value }))}
                  style={{ ...inputStyle, width: '100%' }}
                >
                  <option value="">— Select employee —</option>
                  {roster.map(e => (
                    <option key={e.id} value={e.id}>{e.full_name}{e.location ? ` (${e.location}` : ''}{e.role ? ` · ${e.role})` : e.location ? ')' : ''}</option>
                  ))}
                </select>
                {roster.length === 0 && (
                  <div style={{ fontSize: 11, color: 'var(--t-text-faint)', marginTop: 4 }}>No roster available for this location.</div>
                )}
              </div>

              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--t-text-muted)', marginBottom: 4 }}>REASON</div>
                <select value={addForm.reason} onChange={e => setAddForm(f => ({ ...f, reason: e.target.value }))} style={{ ...inputStyle, width: '100%' }}>
                  {CALLOUT_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>

              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--t-text-muted)', marginBottom: 4 }}>NOTE (OPTIONAL)</div>
                <textarea
                  value={addForm.note}
                  onChange={e => setAddForm(f => ({ ...f, note: e.target.value }))}
                  rows={2}
                  style={{ ...inputStyle, width: '100%', boxSizing: 'border-box', resize: 'vertical', fontFamily: 'inherit' }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
              <button onClick={() => setShowAddModal(false)} style={{ ...inputStyle, cursor: 'pointer' }}>Cancel</button>
              <button
                onClick={handleAddCallout}
                disabled={!addForm.personId || busy}
                style={{ padding: '7px 18px', background: (addForm.personId && !busy) ? 'var(--t-accent)' : 'rgba(42,214,160,0.2)', border: 'none', color: (addForm.personId && !busy) ? '#000' : 'var(--t-text-muted)', fontSize: 12, fontWeight: 800, cursor: (addForm.personId && !busy) ? 'pointer' : 'not-allowed', borderRadius: 0 }}
              >
                {busy ? 'Logging…' : 'Log Callout'}
              </button>
            </div>
          </div>
        </div>
      )}

      <DrillDown open={!!drill} onClose={() => setDrill(null)} {...(drill || {})} />
    </div>
  )
}
