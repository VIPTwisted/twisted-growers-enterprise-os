import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import DrillDown from '../components/DrillDown.jsx'
import { useFeatureFlag } from '../lib/featureFlags.js'
import { useConfig } from '../lib/config.js'
import { useAuth } from '../lib/auth.jsx'
import { sb, getSession } from '../lib/supabase'
import { locColor as locColorByName } from '../lib/locations.js'


// ── FEATURE DISABLED ─────────────────────────────────────────────────────────

function FeatureDisabled({ name }) {
  return (
    <div style={{ background: '#070b14', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--t-text-muted)' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 36, marginBottom: 12 }}>🔒</div>
        <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--t-text)', marginBottom: 6 }}>{name}</div>
        <div style={{ fontSize: 13 }}>This feature is not enabled for your account.</div>
      </div>
    </div>
  )
}

// ── CONSTANTS ─────────────────────────────────────────────────────────────────

const TOPIC_OPTIONS = ['Performance', 'Goals', 'Feedback', 'Career Development', 'Personal', 'Training', 'Concern']

const MOOD_OPTIONS = [
  { value: 'positive',  emoji: '😊', label: 'Positive',  color: '#2ad6a0' },
  { value: 'neutral',   emoji: '😐', label: 'Neutral',   color: '#ffb800' },
  { value: 'concerned', emoji: '😟', label: 'Concerned', color: '#ff4d7d' },
]

const AVATAR_COLORS = ['#7c4dff','#2979ff','#2ad6a0','#ffb800','#ff4d7d','#00e5ff','#ff6d00','#aa00ff']

// Days without a 1-on-1 before an employee is flagged as "due".
const DUE_AFTER_DAYS = 30

const BLANK_FORM = {
  employee: '',
  date: new Date().toISOString().slice(0,10),
  duration: 30,
  topics: [],
  notes: '',
  employeeGoals: '',
  actionItems: [],
  mood: '',
  followUpDate: '',
}

// ── HELPERS ───────────────────────────────────────────────────────────────────

function fmtDate(ds) {
  if (!ds) return ''
  return new Date(ds + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function initials(name) {
  if (!name) return '?'
  const parts = name.trim().split(' ')
  return parts.length >= 2 ? (parts[0][0] + parts[parts.length-1][0]).toUpperCase() : name[0].toUpperCase()
}

function avatarColor(name) {
  if (!name) return AVATAR_COLORS[0]
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}

function locColor(loc) { return locColorByName(loc) }

function topicColor(topic) {
  const map = {
    'Performance':        '#2979ff',
    'Goals':              '#2ad6a0',
    'Feedback':           '#7c4dff',
    'Career Development': '#00e5ff',
    'Personal':           '#ffb800',
    'Training':           '#ff6d00',
    'Concern':            '#ff4d7d',
  }
  return map[topic] || '#7c4dff'
}

function daysSince(dateStr) {
  if (!dateStr) return null
  const diff = Date.now() - new Date(dateStr + 'T12:00:00').getTime()
  return Math.floor(diff / 86400000)
}

// DB row (snake_case, from get_one_on_ones) → the shape the UI renders.
function normalizeMeeting(r) {
  return {
    id: r.id,
    nodeId: r.node_id || null,
    employee: r.employee_name || '',
    employeePersonId: r.employee_person_id || null,
    manager: r.manager_name || '',
    managerId: r.manager_person_id || null,
    date: (r.meeting_date || '').slice(0, 10),
    duration: Number(r.duration_min) || 0,
    topics: Array.isArray(r.topics) ? r.topics : [],
    notes: r.notes || '',
    employeeGoals: r.employee_goals || '',
    followUpDate: r.follow_up_date ? r.follow_up_date.slice(0, 10) : '',
    mood: r.mood || '',
    actionItems: Array.isArray(r.action_items) ? r.action_items.map(a => ({
      id: a.id,
      description: a.description || '',
      dueDate: a.due_date ? a.due_date.slice(0, 10) : '',
      completed: !!a.completed,
    })) : [],
  }
}

// Meeting status derived from action items + follow-up date.
function meetingStatus(m) {
  const today = new Date().toISOString().slice(0, 10)
  const overdue = m.actionItems.some(ai => !ai.completed && ai.dueDate && ai.dueDate < today)
  if (overdue) return 'Overdue'
  const openItems = m.actionItems.filter(ai => !ai.completed).length
  if (openItems > 0) return 'In Progress'
  return 'Completed'
}

// ── STYLES ────────────────────────────────────────────────────────────────────

const S = {
  page: { background: '#070b14', minHeight: '100vh', color: 'var(--t-text)', fontFamily: 'var(--font-sans, system-ui, sans-serif)' },
  header: { background: 'var(--t-surface)', borderBottom: '1px solid var(--t-line)', padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 },
  body: { padding: 20 },
  card: (borderColor = 'var(--t-line)', leftColor = null) => ({
    background: 'var(--t-surface)',
    border: `1px solid ${borderColor}`,
    borderLeft: leftColor ? `4px solid ${leftColor}` : `1px solid ${borderColor}`,
    padding: 14,
    transition: 'background 0.15s',
    borderRadius: 0,
  }),
  btn: (bg = '#00e5ff', color = '#070b14') => ({ background: bg, color, border: 'none', padding: '8px 16px', fontSize: 12, fontWeight: 700, cursor: 'pointer', letterSpacing: '0.03em', borderRadius: 0 }),
  btnSm: (color = '#00e5ff') => ({ background: 'transparent', color, border: `1px solid ${color}`, padding: '4px 10px', fontSize: 10, fontWeight: 600, cursor: 'pointer', borderRadius: 0 }),
  btnOutline: (color = '#00e5ff') => ({ background: 'transparent', color, border: `1px solid ${color}`, padding: '6px 12px', fontSize: 11, fontWeight: 600, cursor: 'pointer', borderRadius: 0 }),
  btnDanger: { background: 'rgba(255,77,125,0.15)', color: '#ff4d7d', border: '1px solid rgba(255,77,125,0.4)', padding: '5px 10px', fontSize: 11, fontWeight: 600, cursor: 'pointer', borderRadius: 0 },
  input: { width: '100%', boxSizing: 'border-box', background: '#070b14', border: '1px solid var(--t-line)', color: 'var(--t-text)', padding: '8px 10px', fontSize: 12, outline: 'none', borderRadius: 0 },
  select: { width: '100%', boxSizing: 'border-box', background: '#070b14', border: '1px solid var(--t-line)', color: 'var(--t-text)', padding: '8px 10px', fontSize: 12, outline: 'none', borderRadius: 0, appearance: 'none' },
  textarea: { width: '100%', boxSizing: 'border-box', background: '#070b14', border: '1px solid var(--t-line)', color: 'var(--t-text)', padding: '8px 10px', fontSize: 12, outline: 'none', borderRadius: 0, resize: 'vertical', minHeight: 80 },
  label: { fontSize: 10, fontWeight: 700, color: 'var(--t-text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 5 },
  formRow: { marginBottom: 12 },
  toast: (type) => ({ position: 'fixed', top: 20, right: 20, zIndex: 9999, background: type === 'error' ? '#ff4d7d' : '#2ad6a0', color: '#070b14', padding: '10px 18px', fontSize: 12, fontWeight: 700, boxShadow: '0 8px 32px rgba(0,0,0,0.4)', borderRadius: 0 }),
  tabs: { display: 'flex', gap: 0, borderBottom: '1px solid var(--t-line)', marginBottom: 20, overflowX: 'auto' },
  tab: (active) => ({ padding: '9px 16px', fontSize: 12, fontWeight: 600, cursor: 'pointer', background: 'transparent', border: 'none', borderBottom: active ? '2px solid #00e5ff' : '2px solid transparent', color: active ? '#00e5ff' : 'var(--t-text-muted)', whiteSpace: 'nowrap', letterSpacing: '0.03em', borderRadius: 0 }),
  sectionLabel: { fontSize: 10, fontWeight: 700, letterSpacing: '0.14em', color: 'var(--t-text-muted)', textTransform: 'uppercase', marginBottom: 10 },
  closeBtn: { background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.15)', color: 'var(--t-text)', width: 28, height: 28, cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 0 },
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 },
  modalBox: { background: '#0d1117', border: '1px solid var(--t-line)', maxWidth: 640, width: '100%', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 24px 80px rgba(0,0,0,0.6)', borderRadius: 0 },
  modalHeader: { background: '#0d1117', borderBottom: '1px solid var(--t-line)', padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 10 },
  modalTitle: { fontSize: 14, fontWeight: 800, color: 'var(--t-text)' },
  modalBody: { padding: 20 },
  modalFooter: { borderTop: '1px solid var(--t-line)', padding: '12px 20px', display: 'flex', gap: 8, justifyContent: 'flex-end' },
}

// ── KPI TILE ──────────────────────────────────────────────────────────────────

function KTile({ label, value, sub, color, alert, onClick }) {
  return (
    <div
      onClick={onClick}
      title={onClick ? 'Click to drill into records' : undefined}
      style={{ background: 'var(--t-surface)', border: `1px solid ${alert === 'red' ? 'var(--t-danger)' : alert === 'amber' ? 'var(--t-warn)' : 'var(--t-line)'}`, padding: '14px 16px', position: 'relative', overflow: 'hidden', minWidth: 100, flex: 1, borderRadius: 0, cursor: onClick ? 'pointer' : undefined }}
    >
      {alert === 'red'   && <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'var(--t-danger)' }} />}
      {alert === 'amber' && <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'var(--t-warn)'   }} />}
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.08em', color: 'var(--t-text-muted)', textTransform: 'uppercase', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800, color: color || 'var(--t-text)', lineHeight: 1, marginBottom: 4 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--t-text-faint)' }}>{sub}</div>}
    </div>
  )
}

// ── EMPTY STATE ───────────────────────────────────────────────────────────────

function EmptyState({ icon, text, sub }) {
  return (
    <div style={{ textAlign: 'center', padding: '48px 20px', color: 'var(--t-text-muted)' }}>
      <div style={{ fontSize: 36, marginBottom: 12 }}>{icon}</div>
      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--t-text)', marginBottom: 6 }}>{text}</div>
      {sub && <div style={{ fontSize: 12 }}>{sub}</div>}
    </div>
  )
}

// ── MAIN COMPONENT ────────────────────────────────────────────────────────────

export default function OneOnOnes() {
  const flagEnabled = useFeatureFlag('one_on_ones')
  const { session } = useAuth()
  const config = useConfig()

  const roleName = (session?.person?.role_name || '').toLowerCase()
  const isManager = ['ceo','manager','coo','admin','owner','hr'].some(x => roleName.includes(x))

  // Real session: person identity + the org nodes this login can see. Location
  // nodes drive both the data scope (p_node_ids) and node_id resolution on save.
  const sess = getSession()
  const me = session?.person || {}
  const myId = me.id || sess.id || null
  const myName = me.full_name || me.name || me.display_name || 'Manager'

  const locationNodes = useMemo(
    () => (sess.nodes || []).filter(n => n.node_type === 'location'),
    [sess.nodes]
  )
  const nodeIds = useMemo(() => {
    const locs = locationNodes.map(n => n.id)
    return locs.length ? locs : (sess.nodes || []).map(n => n.id)
  }, [locationNodes, sess.nodes])
  const nodeKey = nodeIds.join(',')

  const [tab, setTab] = useState('log')
  const [meetings, setMeetings] = useState([])
  const [roster, setRoster] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [expandedId, setExpandedId] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(BLANK_FORM)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState(null)
  const toastRef = useRef(null)
  const [viewMode, setViewMode] = useState('my')
  const [drill, setDrill] = useState(null)

  const showToast = useCallback((msg, type = 'success') => {
    setToast({ msg, type })
    clearTimeout(toastRef.current)
    toastRef.current = setTimeout(() => setToast(null), 3000)
  }, [])

  useEffect(() => () => clearTimeout(toastRef.current), [])

  // ── DATA LOAD ────────────────────────────────────────────────────────────────

  const loadMeetings = useCallback(async () => {
    if (!nodeIds.length) { setMeetings([]); setLoading(false); return }
    setLoading(true)
    const { data, error: err } = await sb.rpc('get_one_on_ones', { p_node_ids: nodeIds, p_actor: myId })
    if (err) {
      setError('Could not load 1-on-1 meetings.')
      setMeetings([])
    } else {
      setError(null)
      setMeetings(Array.isArray(data) ? data.map(normalizeMeeting) : [])
    }
    setLoading(false)
  }, [nodeKey, myId])

  useEffect(() => { loadMeetings() }, [loadMeetings])

  useEffect(() => {
    if (!nodeIds.length) { setRoster([]); return }
    let alive = true
    sb.rpc('get_roster', { p_node_ids: nodeIds }).then(({ data, error: err }) => {
      if (!alive) return
      setRoster(!err && Array.isArray(data) ? data : [])
    })
    return () => { alive = false }
  }, [nodeKey])

  // ── DRILL-DOWN ───────────────────────────────────────────────────────────────

  const openMeetingDrill = (title, rows, accent) => setDrill({
    title,
    subtitle: `${rows.length} meeting${rows.length === 1 ? '' : 's'}`,
    accent,
    columns: [
      { key: 'employee', label: 'Employee', value: r => r.employee },
      { key: 'manager', label: 'Manager', value: r => r.manager },
      { key: 'date', label: 'Meeting Date', value: r => fmtDate(r.date), sortKey: r => r.date },
      { key: 'status', label: 'Status', value: r => meetingStatus(r), sortKey: r => meetingStatus(r) },
      { key: 'topics', label: 'Topics', value: r => (r.topics || []).join(', ') || '—' },
      { key: 'openItems', label: 'Open Items', align: 'right', value: r => r.actionItems.filter(ai => !ai.completed).length, sortKey: r => r.actionItems.filter(ai => !ai.completed).length },
      { key: 'mood', label: 'Mood', value: r => (MOOD_OPTIONS.find(o => o.value === r.mood)?.label) || '—' },
    ],
    rows,
  })

  const openActionItemDrill = (title, rows, accent) => setDrill({
    title,
    subtitle: `${rows.length} action item${rows.length === 1 ? '' : 's'}`,
    accent,
    columns: [
      { key: 'employee', label: 'Employee', value: r => r.employee },
      { key: 'manager', label: 'Manager', value: r => r.manager },
      { key: 'description', label: 'Action Item', value: r => r.description },
      { key: 'dueDate', label: 'Due', value: r => r.dueDate ? fmtDate(r.dueDate) : '—', sortKey: r => r.dueDate || '' },
      { key: 'status', label: 'Status', value: r => r.completed ? 'Completed' : 'Open', sortKey: r => r.completed ? 1 : 0 },
      { key: 'meetingDate', label: 'From Meeting', value: r => fmtDate(r.meetingDate), sortKey: r => r.meetingDate },
    ],
    rows,
  })

  const openDueDrill = (title, rows, accent) => setDrill({
    title,
    subtitle: `${rows.length} employee${rows.length === 1 ? '' : 's'}`,
    accent,
    columns: [
      { key: 'name', label: 'Employee', value: r => r.name },
      { key: 'location', label: 'Location', value: r => r.location },
      { key: 'lastDate', label: 'Last 1-on-1', value: r => r.lastDate ? fmtDate(r.lastDate) : 'Never', sortKey: r => r.lastDate || '' },
      { key: 'days', label: 'Days Since', align: 'right', value: r => r.days >= 999 ? 'Never' : `${r.days}d`, sortKey: r => r.days },
    ],
    rows,
  })

  if (!flagEnabled) return <FeatureDisabled name="1-on-1 Meeting Log" />

  // ── DERIVED ────────────────────────────────────────────────────────────────

  const sortedMeetings = [...meetings].sort((a, b) => (b.date || '').localeCompare(a.date || ''))

  // My meetings = meetings I logged / manage; All = everything in my node scope.
  const myMeetings = sortedMeetings.filter(m =>
    (myId && m.managerId === myId) || (myName && m.manager === myName)
  )

  // Meetings logged this calendar month (real records behind the tile)
  const nowMonth = new Date().toISOString().slice(0, 7)
  const thisMonthMeetings = meetings.filter(m => (m.date || '').slice(0, 7) === nowMonth)
  const kpiThisMonth = thisMonthMeetings.length

  // Flatten every open action item across all meetings, carrying meeting context
  const openActionItems = meetings.flatMap(m =>
    m.actionItems.filter(ai => !ai.completed).map(ai => ({
      ...ai,
      employee: m.employee,
      manager: m.manager,
      meetingDate: m.date,
    }))
  )
  const kpiOpenItems = openActionItems.length

  const avgDuration = meetings.length
    ? Math.round(meetings.reduce((acc, m) => acc + (Number(m.duration) || 0), 0) / meetings.length)
    : 0

  // Employees due for a 1-on-1: every rostered employee whose most recent logged
  // meeting is older than DUE_AFTER_DAYS (or who has none). All derived from the
  // real roster + real meetings — no synthetic selection.
  const dueEmployees = (() => {
    const lastByName = new Map()
    for (const m of meetings) {
      if (!m.employee) continue
      const prev = lastByName.get(m.employee)
      if (!prev || (m.date || '') > prev) lastByName.set(m.employee, m.date || '')
    }
    const out = []
    for (const emp of roster) {
      const name = emp.full_name
      if (!name) continue
      const lastDate = lastByName.get(name) || null
      const days = lastDate ? (daysSince(lastDate) ?? 999) : 999
      if (days >= DUE_AFTER_DAYS) {
        out.push({ name, location: emp.node_name || '—', lastDate, days })
      }
    }
    return out.sort((a, b) => b.days - a.days)
  })()
  const kpiDue = dueEmployees.length

  // ── HANDLERS ───────────────────────────────────────────────────────────────

  const toggleExpand = (id) => setExpandedId(prev => prev === id ? null : id)

  const toggleActionItem = async (meetingId, actionId, current) => {
    // Optimistic flip, then persist; on failure revert + surface an honest toast.
    setMeetings(prev => prev.map(m => m.id !== meetingId ? m : {
      ...m,
      actionItems: m.actionItems.map(ai => ai.id === actionId ? { ...ai, completed: !current } : ai),
    }))
    const { error: err } = await sb.rpc('toggle_one_on_one_action_item', { p_item_id: actionId, p_completed: !current })
    if (err) {
      showToast('Could not update action item', 'error')
      setMeetings(prev => prev.map(m => m.id !== meetingId ? m : {
        ...m,
        actionItems: m.actionItems.map(ai => ai.id === actionId ? { ...ai, completed: current } : ai),
      }))
    }
  }

  const handleSubmit = async () => {
    if (!form.employee) { showToast('Select an employee', 'error'); return }
    if (!form.notes.trim()) { showToast('Notes are required', 'error'); return }

    // Resolve a real, in-tenant node_id + person id from the roster.
    const emp = roster.find(x => x.full_name === form.employee)
    const empLocNode = emp ? locationNodes.find(n => n.name === emp.node_name) : null
    const nodeId = empLocNode?.id || locationNodes[0]?.id || nodeIds[0] || null
    if (!nodeId) { showToast('No location in scope to log against', 'error'); return }

    setSaving(true)
    const { data, error: err } = await sb.rpc('create_one_on_one', {
      p_node_id: nodeId,
      p_employee_person_id: emp?.id || null,
      p_employee_name: form.employee,
      p_manager_person_id: myId,
      p_manager_name: myName,
      p_meeting_date: form.date,
      p_duration_min: Number(form.duration) || 30,
      p_topics: [...form.topics],
      p_notes: form.notes.trim(),
      p_employee_goals: form.employeeGoals.trim(),
      p_follow_up_date: form.followUpDate || null,
      p_mood: form.mood || null,
      p_action_items: form.actionItems
        .filter(ai => (ai.description || '').trim())
        .map(ai => ({ description: ai.description.trim(), due_date: ai.dueDate || null })),
    })
    setSaving(false)
    if (err || (data && data.ok === false)) {
      showToast('Could not log 1-on-1', 'error')
      return
    }
    showToast('1-on-1 logged')
    setForm(BLANK_FORM)
    setShowForm(false)
    setTab('log')
    await loadMeetings()
  }

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this 1-on-1 and its action items? This cannot be undone.')) return
    const { error: err } = await sb.rpc('delete_one_on_one', { p_id: id })
    if (err) { showToast('Could not delete meeting', 'error'); return }
    showToast('1-on-1 deleted')
    setExpandedId(null)
    await loadMeetings()
  }

  const handleAddActionItem = () => {
    setForm(f => ({
      ...f,
      actionItems: [
        ...f.actionItems,
        { id: 'new-' + Date.now(), description: '', dueDate: '', completed: false },
      ],
    }))
  }

  const handleUpdateActionItem = (id, field, val) => {
    setForm(f => ({
      ...f,
      actionItems: f.actionItems.map(ai => ai.id === id ? { ...ai, [field]: val } : ai),
    }))
  }

  const handleRemoveActionItem = (id) => {
    setForm(f => ({ ...f, actionItems: f.actionItems.filter(ai => ai.id !== id) }))
  }

  const toggleTopic = (topic) => {
    setForm(f => ({
      ...f,
      topics: f.topics.includes(topic)
        ? f.topics.filter(t => t !== topic)
        : [...f.topics, topic],
    }))
  }

  const startScheduleFor = (empName) => {
    setForm(f => ({ ...BLANK_FORM, employee: empName, date: f.date }))
    setShowForm(true)
    setTab('schedule')
  }

  // ── MEETING CARD ────────────────────────────────────────────────────────────

  function MeetingCard({ m }) {
    const isExpanded = expandedId === m.id
    const mood = MOOD_OPTIONS.find(o => o.value === m.mood)
    const openItems = m.actionItems.filter(ai => !ai.completed).length
    const notePreview = m.notes.length > 80 ? m.notes.slice(0, 80) : m.notes
    const hasMore = m.notes.length > 80

    return (
      <div style={{ ...S.card(isExpanded ? 'var(--t-accent)' : 'var(--t-line)', isExpanded ? '#00e5ff' : null), marginBottom: 10 }}>
        {/* Header row */}
        <div
          style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, cursor: 'pointer', marginBottom: 6 }}
          onClick={() => toggleExpand(m.id)}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
            {/* Avatar */}
            <div style={{ width: 32, height: 32, background: avatarColor(m.employee), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 900, color: '#000', flexShrink: 0, borderRadius: 0 }}>
              {initials(m.employee)}
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--t-text)' }}>
                {m.employee}
                {m.manager && <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--t-text-muted)', marginLeft: 6 }}>with {m.manager}</span>}
              </div>
              <div style={{ fontSize: 11, color: 'var(--t-text-muted)' }}>{fmtDate(m.date)}</div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            {/* Duration badge */}
            <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--t-text-muted)', background: 'rgba(255,255,255,0.06)', border: '1px solid var(--t-line)', padding: '2px 7px', borderRadius: 0 }}>
              {m.duration}m
            </span>
            <span style={{ fontSize: 12, color: 'var(--t-text-muted)' }}>{isExpanded ? '▲' : '▼'}</span>
          </div>
        </div>

        {/* Topic chips */}
        {m.topics.length > 0 && (
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 8 }}>
            {m.topics.map(t => (
              <span key={t} style={{ fontSize: 9, fontWeight: 700, color: topicColor(t), border: `1px solid ${topicColor(t)}`, padding: '2px 6px', letterSpacing: '0.05em', opacity: 0.9, borderRadius: 0 }}>
                {t.toUpperCase()}
              </span>
            ))}
          </div>
        )}

        {/* Notes preview */}
        <div style={{ fontSize: 12, color: 'var(--t-text-faint)', lineHeight: 1.55, marginBottom: 8 }}>
          {notePreview}
          {hasMore && !isExpanded && (
            <span
              style={{ color: 'var(--t-accent)', cursor: 'pointer', marginLeft: 4, fontWeight: 600, fontSize: 11 }}
              onClick={(e) => { e.stopPropagation(); toggleExpand(m.id) }}
            >
              Read more
            </span>
          )}
        </div>

        {/* Bottom row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {openItems > 0 && (
            <span style={{ fontSize: 10, fontWeight: 700, color: '#ffb800', border: '1px solid rgba(255,184,0,0.4)', padding: '2px 7px', borderRadius: 0 }}>
              {openItems} open item{openItems !== 1 ? 's' : ''}
            </span>
          )}
          {openItems === 0 && m.actionItems.length > 0 && (
            <span style={{ fontSize: 10, fontWeight: 700, color: '#2ad6a0', border: '1px solid rgba(42,214,160,0.4)', padding: '2px 7px', borderRadius: 0 }}>
              All items done
            </span>
          )}
          {mood && (
            <span style={{ fontSize: 12, color: mood.color }} title={mood.label}>{mood.emoji} {mood.label}</span>
          )}
          <button
            style={{ ...S.btnSm('#00e5ff'), marginLeft: 'auto' }}
            onClick={(e) => { e.stopPropagation(); toggleExpand(m.id) }}
          >
            {isExpanded ? 'Collapse' : 'Open'}
          </button>
        </div>

        {/* Expanded detail */}
        {isExpanded && (
          <div style={{ borderTop: '1px solid var(--t-line)', marginTop: 14, paddingTop: 14 }}>
            {/* Full notes */}
            <div style={{ marginBottom: 14 }}>
              <div style={S.sectionLabel}>Meeting Notes</div>
              <div style={{ fontSize: 12, color: 'var(--t-text)', lineHeight: 1.65, whiteSpace: 'pre-wrap' }}>
                {m.notes}
              </div>
            </div>

            {/* Employee goals */}
            {m.employeeGoals && (
              <div style={{ marginBottom: 14 }}>
                <div style={S.sectionLabel}>Employee Goals</div>
                <div style={{ fontSize: 12, color: 'var(--t-text-faint)', lineHeight: 1.55 }}>
                  {m.employeeGoals}
                </div>
              </div>
            )}

            {/* Action items */}
            {m.actionItems.length > 0 && (
              <div style={{ marginBottom: 14 }}>
                <div style={S.sectionLabel}>Action Items</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {m.actionItems.map(ai => (
                    <label
                      key={ai.id}
                      style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', padding: '6px 8px', background: ai.completed ? 'rgba(42,214,160,0.05)' : 'rgba(255,255,255,0.03)', border: '1px solid var(--t-line)', borderRadius: 0 }}
                    >
                      <input
                        type="checkbox"
                        checked={ai.completed}
                        onChange={() => toggleActionItem(m.id, ai.id, ai.completed)}
                        style={{ accentColor: '#2ad6a0', width: 14, height: 14, flexShrink: 0, cursor: 'pointer' }}
                      />
                      <span style={{ fontSize: 12, color: ai.completed ? 'var(--t-text-muted)' : 'var(--t-text)', flex: 1, textDecoration: ai.completed ? 'line-through' : 'none' }}>
                        {ai.description}
                      </span>
                      {ai.dueDate && (
                        <span style={{ fontSize: 10, color: (!ai.completed && ai.dueDate < new Date().toISOString().slice(0,10)) ? 'var(--t-danger)' : 'var(--t-text-muted)', flexShrink: 0 }}>
                          Due {fmtDate(ai.dueDate)}
                        </span>
                      )}
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* Follow-up date + mood */}
            <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'center' }}>
              {m.followUpDate && (
                <div>
                  <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--t-text-muted)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 3 }}>Follow-Up</div>
                  <div style={{ fontSize: 12, color: 'var(--t-text)', fontWeight: 600 }}>{fmtDate(m.followUpDate)}</div>
                </div>
              )}
              {mood && (
                <div>
                  <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--t-text-muted)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 3 }}>Mood</div>
                  <div style={{ fontSize: 20, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span>{mood.emoji}</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: mood.color }}>{mood.label}</span>
                  </div>
                </div>
              )}
              {isManager && (
                <button style={{ ...S.btnDanger, marginLeft: 'auto' }} onClick={() => handleDelete(m.id)}>
                  Delete
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    )
  }

  // ── LOG TAB ─────────────────────────────────────────────────────────────────

  function LogTab() {
    const displayed = viewMode === 'all' ? sortedMeetings : myMeetings

    return (
      <div>
        {/* Sub-header row */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
          <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--t-line)' }}>
            <button
              style={{ ...S.tab(viewMode === 'my'), borderRadius: 0 }}
              onClick={() => setViewMode('my')}
            >
              My Meetings
            </button>
            {isManager && (
              <button
                style={{ ...S.tab(viewMode === 'all'), borderRadius: 0 }}
                onClick={() => setViewMode('all')}
              >
                All Employees
              </button>
            )}
          </div>
          <button
            style={S.btn()}
            onClick={() => { setShowForm(true); setTab('schedule') }}
          >
            + Log New 1-on-1
          </button>
        </div>

        {loading
          ? <EmptyState icon="⏳" text="Loading 1-on-1s…" />
          : error
            ? <EmptyState icon="⚠️" text="Couldn’t load meetings" sub={error} />
            : displayed.length === 0
              ? <EmptyState icon="🤝" text="No 1-on-1s logged yet" sub="Use the button above to log your first meeting" />
              : displayed.map(m => <MeetingCard key={m.id} m={m} />)
        }
      </div>
    )
  }

  // ── SCHEDULE TAB ────────────────────────────────────────────────────────────

  function ScheduleTab() {
    const employeeNames = Array.from(new Set(roster.map(e => e.full_name).filter(Boolean))).sort()

    return (
      <div style={{ maxWidth: 620 }}>
        <div style={{ marginBottom: 18 }}>
          <div style={S.sectionLabel}>Log a New 1-on-1</div>
        </div>

        {/* Employee */}
        <div style={S.formRow}>
          <label style={S.label}>Employee *</label>
          <select style={S.select} value={form.employee} onChange={e => setForm(f => ({ ...f, employee: e.target.value }))}>
            <option value="">— Select employee —</option>
            {employeeNames.map(name => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
          {employeeNames.length === 0 && (
            <div style={{ fontSize: 11, color: 'var(--t-text-muted)', marginTop: 6 }}>
              No employees in your location scope yet.
            </div>
          )}
        </div>

        {/* Date + Duration */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
          <div>
            <label style={S.label}>Date *</label>
            <input
              style={S.input}
              type="date"
              value={form.date}
              onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
            />
          </div>
          <div>
            <label style={S.label}>Duration</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                style={{ ...S.input, width: '80px', flexShrink: 0 }}
                type="number"
                min={5}
                max={120}
                value={form.duration}
                onChange={e => setForm(f => ({ ...f, duration: parseInt(e.target.value) || 30 }))}
              />
              <span style={{ fontSize: 12, color: 'var(--t-text-muted)', whiteSpace: 'nowrap' }}>minutes</span>
            </div>
          </div>
        </div>

        {/* Topics */}
        <div style={S.formRow}>
          <label style={S.label}>Topics</label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 6 }}>
            {TOPIC_OPTIONS.map(topic => {
              const selected = form.topics.includes(topic)
              return (
                <label
                  key={topic}
                  style={{ display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer', padding: '7px 10px', background: selected ? `rgba(${topicColor(topic) === '#2979ff' ? '41,121,255' : topicColor(topic) === '#2ad6a0' ? '42,214,160' : topicColor(topic) === '#7c4dff' ? '124,77,255' : topicColor(topic) === '#00e5ff' ? '0,229,255' : topicColor(topic) === '#ffb800' ? '255,184,0' : topicColor(topic) === '#ff6d00' ? '255,109,0' : '255,77,125'},0.12)` : 'rgba(255,255,255,0.03)', border: `1px solid ${selected ? topicColor(topic) : 'var(--t-line)'}`, borderRadius: 0 }}
                  onClick={() => toggleTopic(topic)}
                >
                  <input
                    type="checkbox"
                    checked={selected}
                    readOnly
                    style={{ accentColor: topicColor(topic), width: 13, height: 13, flexShrink: 0 }}
                  />
                  <span style={{ fontSize: 11, fontWeight: selected ? 700 : 400, color: selected ? topicColor(topic) : 'var(--t-text)' }}>{topic}</span>
                </label>
              )
            })}
          </div>
        </div>

        {/* Notes */}
        <div style={S.formRow}>
          <label style={S.label}>Meeting Notes *</label>
          <textarea
            style={{ ...S.textarea, minHeight: 100 }}
            value={form.notes}
            onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
            placeholder="What did you discuss?"
            rows={4}
          />
        </div>

        {/* Employee Goals */}
        <div style={S.formRow}>
          <label style={S.label}>Employee Goals</label>
          <textarea
            style={S.textarea}
            value={form.employeeGoals}
            onChange={e => setForm(f => ({ ...f, employeeGoals: e.target.value }))}
            placeholder="What goals did the employee share?"
            rows={3}
          />
        </div>

        {/* Action Items */}
        <div style={S.formRow}>
          <label style={S.label}>Action Items</label>
          {form.actionItems.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 8 }}>
              {form.actionItems.map(ai => (
                <div key={ai.id} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input
                    style={{ ...S.input, flex: 1 }}
                    value={ai.description}
                    onChange={e => handleUpdateActionItem(ai.id, 'description', e.target.value)}
                    placeholder="Action item description"
                  />
                  <input
                    style={{ ...S.input, width: 140, flexShrink: 0 }}
                    type="date"
                    value={ai.dueDate}
                    onChange={e => handleUpdateActionItem(ai.id, 'dueDate', e.target.value)}
                  />
                  <button
                    style={S.btnDanger}
                    onClick={() => handleRemoveActionItem(ai.id)}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
          <button style={S.btnOutline()} onClick={handleAddActionItem}>
            + Add Action Item
          </button>
        </div>

        {/* Mood */}
        <div style={S.formRow}>
          <label style={S.label}>Employee Mood</label>
          <div style={{ display: 'flex', gap: 8 }}>
            {MOOD_OPTIONS.map(m => {
              const selected = form.mood === m.value
              return (
                <button
                  key={m.value}
                  style={{ ...S.btnOutline(m.color), background: selected ? `rgba(${m.color === '#2ad6a0' ? '42,214,160' : m.color === '#ffb800' ? '255,184,0' : '255,77,125'},0.18)` : 'transparent', fontWeight: selected ? 800 : 600, padding: '8px 14px', borderRadius: 0 }}
                  onClick={() => setForm(f => ({ ...f, mood: f.mood === m.value ? '' : m.value }))}
                >
                  {m.emoji} {m.label}
                </button>
              )
            })}
          </div>
        </div>

        {/* Follow-up date */}
        <div style={S.formRow}>
          <label style={S.label}>Follow-Up Date</label>
          <input
            style={{ ...S.input, maxWidth: 200 }}
            type="date"
            value={form.followUpDate}
            onChange={e => setForm(f => ({ ...f, followUpDate: e.target.value }))}
          />
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
          <button style={{ ...S.btn(), opacity: saving ? 0.6 : 1 }} onClick={handleSubmit} disabled={saving}>
            {saving ? 'Saving…' : 'Log 1-on-1'}
          </button>
          <button
            style={S.btn('rgba(255,255,255,0.07)', 'var(--t-text)')}
            onClick={() => { setForm(BLANK_FORM); setShowForm(false); setTab('log') }}
          >
            Cancel
          </button>
        </div>
      </div>
    )
  }

  // ── DUE TAB ─────────────────────────────────────────────────────────────────

  function DueTab() {
    if (!isManager) {
      return (
        <EmptyState
          icon="🔒"
          text="Manager Access Required"
          sub="The Due for 1-on-1 view is available to managers and above."
        />
      )
    }

    return (
      <div>
        <div style={{ ...S.sectionLabel, marginBottom: 14 }}>
          Employees Due for 1-on-1 ({DUE_AFTER_DAYS}+ Days)
        </div>
        {dueEmployees.length === 0 ? (
          <EmptyState icon="✅" text="Nobody is overdue" sub={roster.length ? 'Everyone in scope has had a recent 1-on-1.' : 'No employees in your location scope yet.'} />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {dueEmployees.map(emp => {
              const days = emp.days
              const badgeColor = days > 60 ? 'var(--t-danger)' : 'var(--t-warn)'
              const badgeBg    = days > 60 ? 'rgba(255,77,125,0.12)' : 'rgba(255,184,0,0.12)'

              return (
                <div key={emp.name} style={{ ...S.card(), display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                  {/* Avatar */}
                  <div style={{ width: 40, height: 40, background: avatarColor(emp.name), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 900, color: '#000', flexShrink: 0, borderRadius: 0 }}>
                    {initials(emp.name)}
                  </div>

                  {/* Name + location */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--t-text)', marginBottom: 2 }}>{emp.name}</div>
                    <div style={{ fontSize: 11, color: locColor(emp.location), fontWeight: 600 }}>{emp.location}</div>
                  </div>

                  {/* Last 1-on-1 */}
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--t-text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 2 }}>Last 1-on-1</div>
                    <div style={{ fontSize: 12, color: 'var(--t-text-faint)' }}>{emp.lastDate ? fmtDate(emp.lastDate) : 'Never'}</div>
                  </div>

                  {/* Days badge */}
                  <div style={{ flexShrink: 0 }}>
                    <span style={{ fontSize: 11, fontWeight: 800, color: badgeColor, background: badgeBg, border: `1px solid ${badgeColor}`, padding: '3px 9px', borderRadius: 0 }}>
                      {days >= 999 ? 'Never' : `${days}d ago`}
                    </span>
                  </div>

                  {/* Schedule button */}
                  <button
                    style={S.btn('#7c4dff', '#fff')}
                    onClick={() => startScheduleFor(emp.name)}
                  >
                    Schedule 1-on-1
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  // ── RENDER ─────────────────────────────────────────────────────────────────

  return (
    <div style={S.page}>
      {toast && <div style={S.toast(toast.type)}>{toast.msg}</div>}

      {/* HEADER */}
      <div style={S.header}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--t-text)', margin: 0 }}>1-on-1 Meeting Log</div>
          <div style={{ fontSize: 11, color: 'var(--t-text-muted)', marginTop: 2 }}>Manager · employee conversations</div>
        </div>
        <button style={S.btn()} onClick={() => { setShowForm(true); setTab('schedule') }}>
          + Log New 1-on-1
        </button>
      </div>

      {/* KPI ROW */}
      <div style={{ padding: '16px 20px 0' }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <KTile
            label="1-on-1s This Month"
            value={kpiThisMonth}
            sub={`${kpiThisMonth} session${kpiThisMonth === 1 ? '' : 's'} logged`}
            color="#00e5ff"
            onClick={() => openMeetingDrill('1-on-1s This Month', thisMonthMeetings, '#00e5ff')}
          />
          <KTile
            label="Due for 1-on-1"
            value={kpiDue}
            sub={`${DUE_AFTER_DAYS}+ days since last`}
            color="var(--t-warn)"
            alert={kpiDue > 0 ? 'amber' : null}
            onClick={() => openDueDrill('Employees Due for 1-on-1', dueEmployees, 'var(--t-warn)')}
          />
          <KTile
            label="Action Items Open"
            value={kpiOpenItems}
            sub="Across all meetings"
            color="var(--t-warn)"
            alert={kpiOpenItems > 5 ? 'amber' : null}
            onClick={() => openActionItemDrill('Open Action Items', openActionItems, 'var(--t-warn)')}
          />
          <KTile
            label="Avg Meeting Duration"
            value={`${avgDuration} min`}
            sub="Across all meetings"
            color="#7c4dff"
            onClick={() => openMeetingDrill('All Logged 1-on-1s', sortedMeetings, '#7c4dff')}
          />
        </div>
      </div>

      {/* BODY */}
      <div style={S.body}>
        {/* TABS */}
        <div style={S.tabs}>
          <button style={S.tab(tab === 'log')}      onClick={() => setTab('log')}>      Meeting Log    </button>
          <button style={S.tab(tab === 'schedule')} onClick={() => setTab('schedule')}> Log New 1-on-1 </button>
          {isManager && (
            <button style={S.tab(tab === 'due')} onClick={() => setTab('due')}>
              Due for 1-on-1
              {kpiDue > 0 && (
                <span style={{ marginLeft: 6, background: 'rgba(255,184,0,0.2)', color: '#ffb800', fontSize: 9, fontWeight: 800, padding: '1px 5px', borderRadius: 0 }}>
                  {kpiDue}
                </span>
              )}
            </button>
          )}
        </div>

        {/* TAB CONTENT */}
        {tab === 'log'      && <LogTab />}
        {tab === 'schedule' && <ScheduleTab />}
        {tab === 'due'      && <DueTab />}
      </div>

      <DrillDown open={!!drill} onClose={() => setDrill(null)} {...(drill || {})} />
    </div>
  )
}
