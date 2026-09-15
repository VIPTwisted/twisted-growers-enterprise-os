import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { useFeatureFlag } from '../lib/featureFlags.js'
import { useConfig } from '../lib/config.js'
import { useAuth } from '../lib/auth.jsx'
import { sb, getSession } from '../lib/supabase'
import { locColor as locColorByName } from '../lib/locations.js'
import { companyName } from '../lib/config.js'


function FeatureDisabled({ name }) {
  return (
    <div style={{ background: '#070b14', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--t-text-muted)' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>🔒</div>
        <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--t-text)', marginBottom: 6 }}>{name}</div>
        <div style={{ fontSize: 13 }}>This feature is not enabled for your account.</div>
      </div>
    </div>
  )
}

const S = {
  page: { background: '#070b14', minHeight: '100vh', color: 'var(--t-text)', fontFamily: 'var(--font-sans, system-ui, sans-serif)' },
  header: { background: 'var(--t-surface)', borderBottom: '1px solid var(--t-line)', padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 },
  headerLeft: { display: 'flex', flexDirection: 'column', gap: 2 },
  title: { fontSize: 18, fontWeight: 800, color: 'var(--t-text)', margin: 0 },
  subtitle: { fontSize: 11, color: 'var(--t-text-muted)', margin: 0 },
  headerRight: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' },
  body: { padding: 20 },
  tabs: { display: 'flex', gap: 0, borderBottom: '1px solid var(--t-line)', marginBottom: 20, overflowX: 'auto' },
  tab: (active) => ({ padding: '9px 16px', fontSize: 12, fontWeight: 600, cursor: 'pointer', background: 'transparent', border: 'none', borderBottom: active ? '2px solid #00e5ff' : '2px solid transparent', color: active ? '#00e5ff' : 'var(--t-text-muted)', whiteSpace: 'nowrap', letterSpacing: '0.03em' }),
  sectionLabel: { fontSize: 10, fontWeight: 700, letterSpacing: '0.14em', color: 'var(--t-text-muted)', textTransform: 'uppercase', marginBottom: 10 },
  card: (borderColor = 'var(--t-line)', leftColor = null) => ({ background: 'var(--t-surface)', border: `1px solid ${borderColor}`, borderLeft: leftColor ? `4px solid ${leftColor}` : `1px solid ${borderColor}`, padding: 14, transition: 'background 0.15s' }),
  btn: (bg = '#00e5ff', color = '#070b14') => ({ background: bg, color, border: 'none', padding: '8px 16px', fontSize: 12, fontWeight: 700, cursor: 'pointer', letterSpacing: '0.03em', borderRadius: 0 }),
  btnOutline: (color = '#00e5ff') => ({ background: 'transparent', color, border: `1px solid ${color}`, padding: '6px 12px', fontSize: 11, fontWeight: 600, cursor: 'pointer', borderRadius: 0 }),
  btnDanger: { background: 'rgba(255,77,125,0.15)', color: '#ff4d7d', border: '1px solid rgba(255,77,125,0.4)', padding: '5px 10px', fontSize: 11, fontWeight: 600, cursor: 'pointer', borderRadius: 0 },
  btnSm: (color = '#00e5ff') => ({ background: 'transparent', color, border: `1px solid ${color}`, padding: '4px 10px', fontSize: 10, fontWeight: 600, cursor: 'pointer', borderRadius: 0 }),
  formRow: { marginBottom: 12 },
  label: { fontSize: 10, fontWeight: 700, color: 'var(--t-text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 5 },
  input: { width: '100%', boxSizing: 'border-box', background: '#070b14', border: '1px solid var(--t-line)', color: 'var(--t-text)', padding: '8px 10px', fontSize: 12, outline: 'none', borderRadius: 0 },
  select: { width: '100%', boxSizing: 'border-box', background: '#070b14', border: '1px solid var(--t-line)', color: 'var(--t-text)', padding: '8px 10px', fontSize: 12, outline: 'none', borderRadius: 0, appearance: 'none' },
  textarea: { width: '100%', boxSizing: 'border-box', background: '#070b14', border: '1px solid var(--t-line)', color: 'var(--t-text)', padding: '8px 10px', fontSize: 12, outline: 'none', borderRadius: 0, resize: 'vertical', minHeight: 80 },
  checkbox: { marginRight: 6, accentColor: '#00e5ff' },
  toast: (type) => ({ position: 'fixed', top: 20, right: 20, zIndex: 9999, background: type === 'error' ? '#ff4d7d' : '#2ad6a0', color: '#070b14', padding: '10px 18px', fontSize: 12, fontWeight: 700, boxShadow: '0 8px 32px rgba(0,0,0,0.4)', borderRadius: 0 }),
  avatar: (color = '#7c4dff') => ({ width: 28, height: 28, background: color, fontSize: 10, fontWeight: 900, color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, borderRadius: 0 }),
}

const AVATAR_COLORS = ['#7c4dff','#2979ff','#2ad6a0','#ffb800','#ff4d7d','#00e5ff','#ff6d00','#aa00ff']

const COACHING_TYPES = [
  { id: 'verbal',      label: 'VERBAL COACHING',     color: '#2979ff' },
  { id: 'written',     label: 'WRITTEN NOTE',         color: '#7c4dff' },
  { id: 'praise',      label: 'PRAISE',               color: '#2ad6a0' },
  { id: 'performance', label: 'PERFORMANCE CONCERN',  color: '#ffb800' },
  { id: 'policy',      label: 'POLICY REMINDER',      color: '#ff6d00' },
  { id: 'safety',      label: 'SAFETY CONCERN',       color: '#ff4d7d' },
]

const STATUS_OPTIONS = [
  { id: 'open',      label: 'OPEN',              color: '#ffb800' },
  { id: 'resolved',  label: 'RESOLVED',          color: '#2ad6a0' },
  { id: 'escalated', label: 'ESCALATED TO DA',   color: '#ff4d7d' },
]

const BLANK_FORM = {
  employee: '',
  date: new Date().toISOString().slice(0, 10),
  time: '',
  type: 'verbal',
  description: '',
  discussed: '',
  employeeResponse: '',
  followUpRequired: false,
  followUpDate: '',
  witnessedBy: '',
}

// Normalize a coaching_log row (snake_case from the RPC) into the shape the
// render code below expects. Keeps the visual layer untouched.
function normalizeEntry(row) {
  return {
    id: row.id,
    person_id: row.person_id,
    node_id: row.node_id,
    employee: row.employee_name || '',
    location: row.location_name || '',
    date: row.occurred_on || '',
    time: row.occurred_time || '',
    type: row.coaching_type || 'verbal',
    description: row.description || '',
    discussed: row.discussed || '',
    employeeResponse: row.employee_response || '',
    followUpRequired: !!row.follow_up_required,
    followUpDate: row.follow_up_date || '',
    witnessedBy: row.witnessed_by || '',
    managedBy: row.managed_by || '',
    status: row.status || 'open',
  }
}

function initials(name) {
  if (!name) return '?'
  return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
}

function avatarColor(name) {
  const sum = (name || '').split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0)
  return AVATAR_COLORS[sum % AVATAR_COLORS.length]
}

function locColor(loc) { return locColorByName(loc) }

function fmtDate(ds) {
  if (!ds) return ''
  return new Date(ds + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function fmtDateTime(ds, time) {
  if (!ds) return ''
  const dateStr = new Date(ds + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  if (!time) return dateStr
  const [h, m] = time.split(':').map(Number)
  const ampm = h >= 12 ? 'PM' : 'AM'
  const hour12 = h % 12 || 12
  return `${dateStr} · ${hour12}:${String(m).padStart(2, '0')} ${ampm}`
}

function getTypeInfo(typeId) {
  return COACHING_TYPES.find(t => t.id === typeId) || COACHING_TYPES[0]
}

function getStatusInfo(statusId) {
  return STATUS_OPTIONS.find(s => s.id === statusId) || STATUS_OPTIONS[0]
}

function Badge({ label, color }) {
  return (
    <span style={{
      background: `rgba(${hexToRgb(color)}, 0.15)`,
      color,
      border: `1px solid ${color}`,
      padding: '2px 8px',
      fontSize: 10,
      fontWeight: 700,
      letterSpacing: '0.08em',
      borderRadius: 0,
      display: 'inline-block',
    }}>
      {label}
    </span>
  )
}

function hexToRgb(hex) {
  const clean = hex.replace('#', '')
  const r = parseInt(clean.substring(0, 2), 16)
  const g = parseInt(clean.substring(2, 4), 16)
  const b = parseInt(clean.substring(4, 6), 16)
  return `${r},${g},${b}`
}

function KpiTile({ value, label, color }) {
  return (
    <div style={{ ...S.card(), flex: '1 1 120px', minWidth: 100, textAlign: 'center' }}>
      <div style={{ fontSize: 28, fontWeight: 900, color: color || 'var(--t-text)', lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 10, color: 'var(--t-text-muted)', marginTop: 4, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{label}</div>
    </div>
  )
}

export default function CoachingLog() {
  const flagEnabled = useFeatureFlag('coaching_log')
  if (!flagEnabled) return <FeatureDisabled name="Coaching Moments Log" />

  const { session } = useAuth()
  const config = useConfig()
  const roleName = (session?.person?.role_name || '').toLowerCase()

  const isManager = ['ceo', 'manager', 'coo', 'admin', 'owner', 'hr', 'lead', 'key holder', 'director'].some(x => roleName.includes(x))
  if (!isManager) return (
    <div style={{ background: '#070b14', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center', color: 'var(--t-text-muted)' }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--t-text)', marginBottom: 6 }}>Manager Access Required</div>
        <div style={{ fontSize: 13 }}>Coaching logs are visible to managers only.</div>
      </div>
    </div>
  )

  // Real session: person identity + the org nodes this login can see. Location
  // nodes drive both the data scope (p_node_ids) and node_id resolution on save.
  const sess = getSession()
  const locationNodes = useMemo(
    () => (sess.nodes || []).filter(n => n.node_type === 'location'),
    [sess.nodes]
  )
  const nodeIds = useMemo(() => {
    const locs = locationNodes.map(n => n.id)
    return locs.length ? locs : (sess.nodes || []).map(n => n.id)
  }, [locationNodes, sess.nodes])
  const nodeKey = nodeIds.join(',')

  const [entries, setEntries] = useState([])
  const [employees, setEmployees] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [tab, setTab] = useState('log')
  const [filters, setFilters] = useState({ employee: '', type: 'all', status: 'all', range: 'all' })
  const [historyEmployee, setHistoryEmployee] = useState('')
  const [form, setForm] = useState({ ...BLANK_FORM })
  const [toast, setToast] = useState(null)
  const toastRef = useRef(null)
  const [expandedDiscussed, setExpandedDiscussed] = useState({})

  const showToast = useCallback((msg, type = 'success') => {
    if (toastRef.current) clearTimeout(toastRef.current)
    setToast({ msg, type })
    toastRef.current = setTimeout(() => setToast(null), 3000)
  }, [])

  // ── Load coaching entries + the real employee roster from the HR brain ──────
  const loadEntries = useCallback(async () => {
    if (!nodeIds.length) { setEntries([]); setLoading(false); return }
    setLoading(true)
    const { data, error } = await sb.rpc('get_coaching_log', { p_node_ids: nodeIds })
    setEntries(!error && Array.isArray(data) ? data.map(normalizeEntry) : [])
    setLoading(false)
  }, [nodeKey])

  useEffect(() => { loadEntries() }, [loadEntries])

  useEffect(() => {
    if (!nodeIds.length) { setEmployees([]); return }
    let alive = true
    sb.rpc('get_roster', { p_node_ids: nodeIds }).then(({ data, error }) => {
      if (!alive) return
      setEmployees(!error && Array.isArray(data) ? data : [])
    })
    return () => { alive = false }
  }, [nodeKey])

  // Distinct employee names for the filter/history dropdowns (from the real roster).
  const employeeNames = useMemo(() => {
    const names = new Set()
    employees.forEach(e => { if (e.full_name) names.add(e.full_name) })
    entries.forEach(e => { if (e.employee) names.add(e.employee) })
    return Array.from(names).sort()
  }, [employees, entries])

  function updateFilter(key, val) {
    setFilters(f => ({ ...f, [key]: val }))
  }

  function updateForm(key, val) {
    setForm(f => ({ ...f, [key]: val }))
  }

  function isWithinRange(dateStr, range) {
    if (range === 'all') return true
    const d = new Date(dateStr + 'T12:00:00')
    const now = new Date()
    const diffMs = now - d
    const diffDays = diffMs / (1000 * 60 * 60 * 24)
    if (range === 'week') return diffDays <= 7
    if (range === 'month') return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
    if (range === '30days') return diffDays <= 30
    return true
  }

  const filteredEntries = entries
    .filter(e => {
      if (filters.employee && e.employee !== filters.employee) return false
      if (filters.type !== 'all' && e.type !== filters.type) return false
      if (filters.status !== 'all' && e.status !== filters.status) return false
      if (!isWithinRange(e.date, filters.range)) return false
      return true
    })
    .sort((a, b) => new Date(b.date) - new Date(a.date))

  async function markResolved(id) {
    const { error } = await sb.rpc('coaching_log_set_status', { p_id: id, p_status: 'resolved' })
    if (error) { showToast('Could not update entry', 'error'); return }
    showToast('Entry marked as resolved')
    await loadEntries()
  }

  async function escalateToDA(id) {
    if (!window.confirm('Escalate to DA? This cannot be undone.')) return
    const { error } = await sb.rpc('coaching_log_set_status', { p_id: id, p_status: 'escalated' })
    if (error) { showToast('Could not escalate entry', 'error'); return }
    showToast('DA form required — escalation recorded')
    await loadEntries()
  }

  function toggleDiscussed(id) {
    setExpandedDiscussed(prev => ({ ...prev, [id]: !prev[id] }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.employee || !form.description.trim()) {
      showToast('Employee and description are required', 'error')
      return
    }
    const emp = employees.find(x => x.full_name === form.employee)
    // Resolve a real, in-tenant node_id: the employee's own location if it is in
    // scope, otherwise the first scoped location node.
    const empLocNode = emp ? locationNodes.find(n => n.name === emp.node_name) : null
    const nodeId = empLocNode?.id || locationNodes[0]?.id || nodeIds[0] || null
    if (!nodeId) { showToast('No location in scope to file against', 'error'); return }

    setSaving(true)
    const { error } = await sb.rpc('coaching_log_create', {
      p_node_id: nodeId,
      p_person_id: emp?.id || null,
      p_employee_name: form.employee,
      p_location_name: emp?.node_name || null,
      p_coaching_type: form.type,
      p_occurred_on: form.date || null,
      p_occurred_time: form.time || null,
      p_description: form.description,
      p_discussed: form.discussed || null,
      p_employee_response: form.employeeResponse || null,
      p_follow_up_required: !!form.followUpRequired,
      p_follow_up_date: form.followUpRequired && form.followUpDate ? form.followUpDate : null,
      p_witnessed_by: form.witnessedBy || null,
      p_managed_by: sess.full_name || 'Manager',
      p_managed_by_id: sess.id || null,
    })
    setSaving(false)
    if (error) { showToast('Could not save coaching moment', 'error'); return }
    setForm({ ...BLANK_FORM })
    showToast('Coaching moment logged')
    setTab('log')
    await loadEntries()
  }

  const historyEntries = historyEmployee
    ? entries.filter(e => e.employee === historyEmployee).sort((a, b) => new Date(a.date) - new Date(b.date))
    : []

  const typeCounts = historyEntries.reduce((acc, e) => {
    acc[e.type] = (acc[e.type] || 0) + 1
    return acc
  }, {})

  const escalatedCount = historyEntries.filter(e => e.status === 'escalated').length

  const kpiMonth = entries.filter(e => {
    const d = new Date(e.date + 'T12:00:00')
    const now = new Date()
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
  })

  const kpiCoached = new Set(kpiMonth.map(e => e.employee)).size
  const kpiOpenFollowups = entries.filter(e => e.followUpRequired && e.status === 'open').length
  const kpiResolved = entries.filter(e => {
    if (e.status !== 'resolved') return false
    const d = new Date(e.date + 'T12:00:00')
    const now = new Date()
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
  }).length

  function EntryCard({ entry, showActions = true }) {
    const typeInfo = getTypeInfo(entry.type)
    const statusInfo = getStatusInfo(entry.status)
    const ac = avatarColor(entry.employee)
    const expanded = expandedDiscussed[entry.id]

    return (
      <div style={{ ...S.card('var(--t-line)', typeInfo.color), marginBottom: 10 }}>
        {/* Header row */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={S.avatar(ac)}>{initials(entry.employee)}</div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--t-text)' }}>{entry.employee}</div>
              <div style={{ fontSize: 10, color: locColor(entry.location), fontWeight: 600, letterSpacing: '0.05em', marginTop: 1 }}>{entry.location}</div>
            </div>
          </div>
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <div style={{ fontSize: 11, color: 'var(--t-text-muted)' }}>{fmtDateTime(entry.date, entry.time)}</div>
            {entry.managedBy && (
              <div style={{ fontSize: 10, color: 'var(--t-text-muted)', marginTop: 2 }}>by {entry.managedBy}</div>
            )}
          </div>
        </div>

        {/* Badges */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
          <Badge label={typeInfo.label} color={typeInfo.color} />
          <Badge label={statusInfo.label} color={statusInfo.color} />
        </div>

        {/* Description */}
        <div style={{ fontSize: 12, lineHeight: 1.6, color: 'var(--t-text)', marginTop: 8 }}>
          {entry.description}
        </div>

        {/* What was discussed toggle */}
        {entry.discussed && (
          <div style={{ marginTop: 8 }}>
            <button
              style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--t-text-muted)', fontSize: 11, fontWeight: 600, padding: 0, letterSpacing: '0.03em' }}
              onClick={() => toggleDiscussed(entry.id)}
            >
              {expanded ? '▼' : '▶'} What was discussed
            </button>
            {expanded && (
              <div style={{ marginTop: 6, fontSize: 12, color: 'var(--t-text-muted)', fontStyle: 'italic', lineHeight: 1.6, paddingLeft: 14, borderLeft: '2px solid var(--t-line)' }}>
                {entry.discussed}
              </div>
            )}
          </div>
        )}

        {/* Employee response */}
        {entry.employeeResponse && (
          <div style={{ fontSize: 12, color: 'var(--t-text-muted)', fontStyle: 'italic', marginTop: 6, lineHeight: 1.5 }}>
            <span style={{ fontWeight: 700, fontStyle: 'normal' }}>Employee response: </span>{entry.employeeResponse}
          </div>
        )}

        {/* Follow-up chip */}
        {entry.followUpRequired && (
          <div style={{ marginTop: 8 }}>
            <span style={{
              background: 'rgba(255,184,0,0.12)',
              color: '#ffb800',
              border: '1px solid #ffb800',
              padding: '2px 8px',
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: '0.06em',
              borderRadius: 0,
              display: 'inline-block',
            }}>
              Follow-up required: {fmtDate(entry.followUpDate)}
            </span>
          </div>
        )}

        {/* Actions */}
        {showActions && entry.status === 'open' && (
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button style={S.btnOutline('#2ad6a0')} onClick={() => markResolved(entry.id)}>Mark Resolved</button>
            <button style={S.btnDanger} onClick={() => escalateToDA(entry.id)}>Escalate to DA</button>
          </div>
        )}
      </div>
    )
  }

  return (
    <div style={S.page}>
      {toast && <div style={S.toast(toast.type)}>{toast.msg}</div>}

      {/* Header */}
      <div style={S.header}>
        <div style={S.headerLeft}>
          <h1 style={S.title}>Coaching Moments Log</h1>
          <p style={S.subtitle}>Document coaching interactions · Track follow-ups · Build the paper trail</p>
        </div>
        <div style={S.headerRight}>
          <span style={{ fontSize: 11, color: 'var(--t-text-muted)' }}>
            {companyName()} · {config?.locationName || 'All Locations'}
          </span>
        </div>
      </div>

      <div style={S.body}>
        {/* KPI Row */}
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
          <KpiTile value={kpiMonth.length} label="Coaching Notes This Month" />
          <KpiTile value={kpiCoached} label="Employees Coached" />
          <KpiTile value={kpiOpenFollowups} label="Open Follow-ups" color="var(--t-warn)" />
          <KpiTile value={kpiResolved} label="Resolved This Month" color="var(--t-success)" />
        </div>

        {/* Tabs */}
        <div style={S.tabs}>
          {[
            { id: 'log',     label: 'Coaching Log' },
            { id: 'new',     label: 'New Entry' },
            { id: 'history', label: 'Employee History' },
          ].map(t => (
            <button key={t.id} style={S.tab(tab === t.id)} onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
        </div>

        {/* LOG TAB */}
        {tab === 'log' && (
          <div>
            {/* Legal note */}
            <div style={{ ...S.card('var(--t-line)', 'var(--t-accent)'), marginBottom: 16, fontSize: 12, color: 'var(--t-text-muted)', lineHeight: 1.6 }}>
              <strong style={{ color: 'var(--t-text)', fontWeight: 700 }}>Legal Note: </strong>
              Coaching logs document good-faith effort to correct behavior before formal discipline. These records may be referenced in DA proceedings and unemployment hearings.
            </div>

            {/* Filter bar */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
              <select style={{ ...S.select, width: 'auto', minWidth: 140 }} value={filters.employee} onChange={ev => updateFilter('employee', ev.target.value)}>
                <option value="">All Employees</option>
                {employeeNames.map(emp => <option key={emp} value={emp}>{emp}</option>)}
              </select>
              <select style={{ ...S.select, width: 'auto', minWidth: 160 }} value={filters.type} onChange={ev => updateFilter('type', ev.target.value)}>
                <option value="all">All Types</option>
                {COACHING_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
              <select style={{ ...S.select, width: 'auto', minWidth: 140 }} value={filters.status} onChange={ev => updateFilter('status', ev.target.value)}>
                <option value="all">All Statuses</option>
                {STATUS_OPTIONS.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
              <select style={{ ...S.select, width: 'auto', minWidth: 140 }} value={filters.range} onChange={ev => updateFilter('range', ev.target.value)}>
                <option value="all">All Time</option>
                <option value="week">This Week</option>
                <option value="month">This Month</option>
                <option value="30days">Last 30 Days</option>
              </select>
            </div>

            {/* Entry count */}
            <div style={{ fontSize: 11, color: 'var(--t-text-muted)', marginBottom: 12, fontWeight: 600 }}>
              {filteredEntries.length} {filteredEntries.length === 1 ? 'entry' : 'entries'}
            </div>

            {/* Entries */}
            {loading ? (
              <div style={{ color: 'var(--t-text-muted)', fontSize: 13, textAlign: 'center', padding: '32px 0' }}>Loading coaching log…</div>
            ) : entries.length === 0 ? (
              <div style={{ color: 'var(--t-text-muted)', fontSize: 13, textAlign: 'center', padding: '32px 0' }}>No coaching moments logged yet. Use “New Entry” to record the first one.</div>
            ) : filteredEntries.length === 0 ? (
              <div style={{ color: 'var(--t-text-muted)', fontSize: 13, textAlign: 'center', padding: '32px 0' }}>No entries match the current filters.</div>
            ) : (
              filteredEntries.map(entry => <EntryCard key={entry.id} entry={entry} showActions={true} />)
            )}
          </div>
        )}

        {/* NEW ENTRY TAB */}
        {tab === 'new' && (
          <div>
            <div style={{ ...S.card(), maxWidth: 640 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--t-text)', marginBottom: 16, borderBottom: '1px solid var(--t-line)', paddingBottom: 10 }}>
                Log a Coaching Moment
              </div>

              <form onSubmit={handleSubmit}>
                {/* Employee */}
                <div style={S.formRow}>
                  <label style={S.label}>Employee *</label>
                  <select style={S.select} value={form.employee} onChange={ev => updateForm('employee', ev.target.value)} required>
                    <option value="">{employeeNames.length ? '— Select employee —' : 'No employees in scope'}</option>
                    {employeeNames.map(emp => <option key={emp} value={emp}>{emp}</option>)}
                  </select>
                </div>

                {/* Date + Time */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                  <div>
                    <label style={S.label}>Date *</label>
                    <input type="date" style={S.input} value={form.date} onChange={ev => updateForm('date', ev.target.value)} required />
                  </div>
                  <div>
                    <label style={S.label}>Time</label>
                    <input type="time" style={S.input} value={form.time} onChange={ev => updateForm('time', ev.target.value)} />
                  </div>
                </div>

                {/* Type */}
                <div style={S.formRow}>
                  <label style={S.label}>Coaching Type</label>
                  <select style={S.select} value={form.type} onChange={ev => updateForm('type', ev.target.value)}>
                    {COACHING_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                  </select>
                </div>

                {/* Description */}
                <div style={S.formRow}>
                  <label style={S.label}>Issue / Observation *</label>
                  <textarea
                    style={{ ...S.textarea, minHeight: 100 }}
                    value={form.description}
                    onChange={ev => updateForm('description', ev.target.value)}
                    placeholder="Describe the situation or behavior observed..."
                    required
                  />
                </div>

                {/* Discussed */}
                <div style={S.formRow}>
                  <label style={S.label}>What was discussed</label>
                  <textarea
                    style={S.textarea}
                    value={form.discussed}
                    onChange={ev => updateForm('discussed', ev.target.value)}
                    placeholder="What policies were reviewed? What expectations were set?"
                  />
                </div>

                {/* Employee response */}
                <div style={S.formRow}>
                  <label style={S.label}>Employee Response</label>
                  <textarea
                    style={S.textarea}
                    value={form.employeeResponse}
                    onChange={ev => updateForm('employeeResponse', ev.target.value)}
                    placeholder="How did the employee respond?"
                  />
                </div>

                {/* Follow-up toggle */}
                <div style={{ ...S.formRow, display: 'flex', alignItems: 'center', gap: 10 }}>
                  <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', gap: 8, fontSize: 12, color: 'var(--t-text)' }}>
                    <input
                      type="checkbox"
                      style={S.checkbox}
                      checked={form.followUpRequired}
                      onChange={ev => updateForm('followUpRequired', ev.target.checked)}
                    />
                    Follow-up required
                  </label>
                </div>

                {/* Follow-up date (conditional) */}
                {form.followUpRequired && (
                  <div style={S.formRow}>
                    <label style={S.label}>Follow-up Date</label>
                    <input type="date" style={S.input} value={form.followUpDate} onChange={ev => updateForm('followUpDate', ev.target.value)} />
                  </div>
                )}

                {/* Witnessed by */}
                <div style={S.formRow}>
                  <label style={S.label}>Witnessed By</label>
                  <input
                    type="text"
                    style={S.input}
                    value={form.witnessedBy}
                    onChange={ev => updateForm('witnessedBy', ev.target.value)}
                    placeholder="Name of witness (optional)"
                  />
                </div>

                {/* Submit */}
                <button type="submit" disabled={saving} style={{ ...S.btn(), width: '100%', marginTop: 8, padding: '10px 16px', fontSize: 13, opacity: saving ? 0.6 : 1, cursor: saving ? 'default' : 'pointer' }}>
                  {saving ? 'Saving…' : 'Log Coaching Moment'}
                </button>
              </form>
            </div>
          </div>
        )}

        {/* HISTORY TAB */}
        {tab === 'history' && (
          <div>
            {/* Employee selector */}
            <div style={{ ...S.formRow, maxWidth: 320 }}>
              <label style={S.label}>Select Employee</label>
              <select style={S.select} value={historyEmployee} onChange={ev => setHistoryEmployee(ev.target.value)}>
                <option value="">— Select employee —</option>
                {employeeNames.map(emp => <option key={emp} value={emp}>{emp}</option>)}
              </select>
            </div>

            {!historyEmployee ? (
              <div style={{ color: 'var(--t-text-muted)', fontSize: 13, marginTop: 24 }}>
                Select an employee to view their coaching history.
              </div>
            ) : (
              <div>
                {/* Count summary */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                  {COACHING_TYPES.filter(t => typeCounts[t.id]).map(t => (
                    <Badge key={t.id} label={`${typeCounts[t.id]} ${t.label}`} color={t.color} />
                  ))}
                  {escalatedCount > 0 && (
                    <Badge label={`${escalatedCount} Escalated`} color="#ff4d7d" />
                  )}
                  {historyEntries.length === 0 && (
                    <span style={{ fontSize: 12, color: 'var(--t-text-muted)' }}>No entries found.</span>
                  )}
                </div>

                {/* Legal note */}
                {historyEntries.length > 0 && (
                  <div style={{ fontSize: 11, color: '#ffb800', marginBottom: 12, fontStyle: 'italic' }}>
                    This is the paper trail view used before termination proceedings.
                  </div>
                )}

                {/* Print / Export */}
                {historyEntries.length > 0 && (
                  <div style={{ marginBottom: 16 }}>
                    <button style={S.btnOutline()} onClick={() => window.print()}>
                      Print / Export
                    </button>
                  </div>
                )}

                {/* Chronological entries */}
                {historyEntries.map(entry => (
                  <EntryCard key={entry.id} entry={entry} showActions={false} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
