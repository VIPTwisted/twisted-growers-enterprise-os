import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { useFeatureFlag } from '../lib/featureFlags.js'
import { useConfig } from '../lib/config.js'
import { sb, getSession } from '../lib/supabase'
import DrillDown from '../components/DrillDown.jsx'

// ─── Feature Gate ────────────────────────────────────────────────────────────

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

// ─── Style System ─────────────────────────────────────────────────────────────

const S = {
  page: { background: '#070b14', minHeight: '100vh', color: 'var(--t-text)', fontFamily: 'var(--font-sans, system-ui, sans-serif)' },
  header: { background: 'var(--t-surface)', borderBottom: '1px solid var(--t-line)', padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 },
  headerLeft: { display: 'flex', flexDirection: 'column', gap: 2 },
  title: { fontSize: 18, fontWeight: 800, color: 'var(--t-text)', margin: 0 },
  subtitle: { fontSize: 11, color: 'var(--t-text-muted)', margin: 0 },
  headerRight: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' },
  body: { padding: 20 },
  sectionLabel: { fontSize: 10, fontWeight: 700, letterSpacing: '0.14em', color: 'var(--t-text-muted)', textTransform: 'uppercase', marginBottom: 10 },
  card: (borderColor = 'var(--t-line)', leftColor = null) => ({ background: 'var(--t-surface)', border: `1px solid ${borderColor}`, borderLeft: leftColor ? `4px solid ${leftColor}` : `1px solid ${borderColor}`, padding: 14 }),
  btn: (bg = '#00e5ff', color = '#070b14') => ({ background: bg, color, border: 'none', padding: '8px 16px', fontSize: 12, fontWeight: 700, cursor: 'pointer', letterSpacing: '0.03em', borderRadius: 0 }),
  btnOutline: (color = '#00e5ff') => ({ background: 'transparent', color, border: `1px solid ${color}`, padding: '6px 12px', fontSize: 11, fontWeight: 600, cursor: 'pointer', borderRadius: 0 }),
  btnSm: (color = '#00e5ff') => ({ background: 'transparent', color, border: `1px solid ${color}`, padding: '4px 10px', fontSize: 10, fontWeight: 600, cursor: 'pointer', borderRadius: 0 }),
  btnDanger: { background: 'rgba(255,77,125,0.15)', color: '#ff4d7d', border: '1px solid rgba(255,77,125,0.4)', padding: '5px 10px', fontSize: 11, fontWeight: 600, cursor: 'pointer', borderRadius: 0 },
  formRow: { marginBottom: 12 },
  label: { fontSize: 10, fontWeight: 700, color: 'var(--t-text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 5 },
  input: { width: '100%', boxSizing: 'border-box', background: '#070b14', border: '1px solid var(--t-line)', color: 'var(--t-text)', padding: '8px 10px', fontSize: 12, outline: 'none', borderRadius: 0 },
  select: { width: '100%', boxSizing: 'border-box', background: '#070b14', border: '1px solid var(--t-line)', color: 'var(--t-text)', padding: '8px 10px', fontSize: 12, outline: 'none', borderRadius: 0, appearance: 'none' },
  textarea: { width: '100%', boxSizing: 'border-box', background: '#070b14', border: '1px solid var(--t-line)', color: 'var(--t-text)', padding: '8px 10px', fontSize: 12, outline: 'none', borderRadius: 0, resize: 'vertical', minHeight: 80 },
  checkbox: { marginRight: 6, accentColor: '#00e5ff' },
  toast: (type) => ({ position: 'fixed', top: 20, right: 20, zIndex: 9999, background: type === 'error' ? '#ff4d7d' : '#2ad6a0', color: '#070b14', padding: '10px 18px', fontSize: 12, fontWeight: 700, boxShadow: '0 8px 32px rgba(0,0,0,0.4)', borderRadius: 0 }),
  avatar: (color = '#7c4dff') => ({ width: 24, height: 24, background: color, fontSize: 9, fontWeight: 900, color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, borderRadius: 0 }),
}

// ─── Constants (UI enums — not data) ───────────────────────────────────────────

const NOTE_TYPES = [
  { id: 'recognition',  label: 'RECOGNITION',         color: '#2ad6a0' },
  { id: 'concern',      label: 'PERFORMANCE CONCERN',  color: '#ffb800' },
  { id: 'incident',     label: 'INCIDENT',             color: '#ff4d7d' },
  { id: 'general',      label: 'GENERAL',              color: '#7c4dff' },
]

const AVATAR_COLORS = ['#7c4dff','#2979ff','#2ad6a0','#ffb800','#ff4d7d','#00e5ff','#ff6d00','#aa00ff']

function avatarColor(name) {
  if (!name) return AVATAR_COLORS[0]
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}

function initials(name) {
  if (!name) return '?'
  const parts = name.trim().split(' ')
  return parts.length >= 2 ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase() : name[0].toUpperCase()
}

function locColor(loc) {
  if (loc === 'Orange') return 'var(--t-warn)'
  if (loc === 'Hartford') return 'var(--t-accent)'
  if (loc === 'Manchester') return 'var(--t-success)'
  return 'var(--t-text-muted)'
}

function fmtDate(ds) {
  if (!ds) return ''
  return new Date(ds + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

// ─── Sub-Components ───────────────────────────────────────────────────────────

function KTile({ label, value, sub, color, alert, onClick }) {
  return (
    <div onClick={onClick} title={onClick ? 'Click to drill into records' : undefined} style={{ background: 'var(--t-surface)', border: `1px solid ${alert === 'red' ? 'var(--t-danger)' : alert === 'amber' ? 'var(--t-warn)' : 'var(--t-line)'}`, padding: '14px 16px', position: 'relative', overflow: 'hidden', minWidth: 100, flex: 1, cursor: onClick ? 'pointer' : 'default' }}>
      {alert === 'red' && <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'var(--t-danger)' }} />}
      {alert === 'amber' && <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'var(--t-warn)' }} />}
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.08em', color: 'var(--t-text-muted)', textTransform: 'uppercase', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800, color: color || 'var(--t-text)', lineHeight: 1, marginBottom: 4 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--t-text-faint)' }}>{sub}</div>}
    </div>
  )
}

function NoteTypeBadge({ typeId }) {
  const t = NOTE_TYPES.find(n => n.id === typeId)
  if (!t) return null
  return (
    <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.1em', color: t.color, border: `1px solid ${t.color}`, padding: '2px 6px', background: 'transparent' }}>
      {t.label}
    </span>
  )
}

function ShiftBadge({ shift }) {
  return (
    <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', background: shift === 'AM' ? 'rgba(41,121,255,0.18)' : 'rgba(124,77,255,0.18)', color: shift === 'AM' ? '#2979ff' : '#b39ddb', border: `1px solid ${shift === 'AM' ? 'rgba(41,121,255,0.4)' : 'rgba(124,77,255,0.4)'}`, padding: '2px 7px' }}>
      {shift}
    </span>
  )
}

function NoteCard({ note, compact = false, canDelete = false, onDelete }) {
  const typeObj = NOTE_TYPES.find(t => t.id === note.type)
  const leftColor = typeObj ? typeObj.color : 'var(--t-line)'

  return (
    <div style={{ ...S.card('var(--t-line)', leftColor), marginBottom: compact ? 8 : 12, padding: compact ? '10px 12px' : 14 }}>
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--t-text)' }}>{fmtDate(note.date)}</span>
        <ShiftBadge shift={note.shift} />
        {note.location && (
          <span style={{ fontSize: 10, fontWeight: 700, color: locColor(note.location), border: `1px solid ${locColor(note.location)}`, padding: '1px 6px', background: 'transparent' }}>
            {note.location.toUpperCase()}
          </span>
        )}
        <span style={{ fontSize: 10, color: 'var(--t-text-muted)', marginLeft: 'auto' }}>
          {note.manager}
        </span>
      </div>

      {/* Summary */}
      <div style={{ fontSize: 12, color: 'var(--t-text)', lineHeight: 1.6, marginBottom: 8 }}>
        {note.summary}
      </div>

      {/* Tagged employees */}
      {note.taggedEmployees.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
          <span style={{ fontSize: 10, color: 'var(--t-text-muted)', fontWeight: 600 }}>TAGGED:</span>
          {note.taggedEmployees.map(emp => (
            <span key={emp} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'rgba(255,255,255,0.04)', border: '1px solid var(--t-line)', padding: '2px 7px', fontSize: 10, color: 'var(--t-text)' }}>
              <span style={S.avatar(avatarColor(emp))}>{initials(emp)}</span>
              {emp}
            </span>
          ))}
        </div>
      )}

      {/* Footer row: type badge + private + follow-up */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <NoteTypeBadge typeId={note.type} />

        {note.isPrivate && (
          <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', color: 'var(--t-danger)', border: '1px solid rgba(255,77,125,0.4)', padding: '2px 6px', background: 'rgba(255,77,125,0.08)' }}>
            PRIVATE — MANAGER ONLY
          </span>
        )}

        {note.followUpRequired && (
          <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', color: 'var(--t-warn)', border: '1px solid rgba(255,184,0,0.4)', padding: '2px 6px', background: 'rgba(255,184,0,0.08)' }}>
            FOLLOW-UP REQUIRED
          </span>
        )}

        {canDelete && (
          <button style={{ ...S.btnDanger, marginLeft: 'auto' }} onClick={() => onDelete?.(note)}>
            Delete
          </button>
        )}
      </div>

      {/* Follow-up detail */}
      {note.followUpRequired && note.followUpNote && (
        <div style={{ marginTop: 8, padding: '8px 10px', background: 'rgba(255,184,0,0.06)', border: '1px solid rgba(255,184,0,0.2)', fontSize: 11, color: 'var(--t-warn)', lineHeight: 1.5 }}>
          <span style={{ fontWeight: 700 }}>ACTION: </span>{note.followUpNote}
        </div>
      )}

      {/* Photo */}
      {note.photo && (
        <div style={{ marginTop: 8 }}>
          <img src={note.photo} alt="shift photo" style={{ maxWidth: '100%', maxHeight: 140, borderRadius: 0, border: '1px solid var(--t-line)', display: 'block' }} />
        </div>
      )}
    </div>
  )
}

// ─── Image Uploader ───────────────────────────────────────────────────────────

function ImageUploader({ value, onChange }) {
  const ref = useRef(null)
  const handleFile = e => {
    const file = e.target.files[0]
    if (!file) return
    if (file.size > 3 * 1024 * 1024) { alert('Max 3MB'); return }
    const reader = new FileReader()
    reader.onload = ev => onChange(ev.target.result)
    reader.readAsDataURL(file)
  }
  return (
    <div style={{ marginTop: 8 }}>
      <input ref={ref} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFile} />
      {value
        ? <div style={{ position: 'relative', display: 'inline-block' }}>
            <img src={value} alt="shift photo" style={{ maxWidth: 240, maxHeight: 160, borderRadius: 0, border: '1px solid var(--t-line)', display: 'block' }} />
            <button onClick={() => onChange(null)} style={{ position: 'absolute', top: 4, right: 4, background: 'var(--t-danger)', color: '#fff', border: 'none', borderRadius: 0, padding: '2px 6px', cursor: 'pointer', fontSize: 11 }}>✕ Remove</button>
          </div>
        : <button onClick={() => ref.current?.click()} style={{ background: 'transparent', border: '1px dashed var(--t-line)', color: 'var(--t-text-muted)', padding: '8px 14px', borderRadius: 0, cursor: 'pointer', fontSize: 12, width: '100%', textAlign: 'left' }}>
            📷 Attach Photo (optional — max 3MB)
          </button>
      }
    </div>
  )
}

// ─── Row mapper: DB row → UI note shape ─────────────────────────────────────────

function mapRow(r) {
  const tagged = Array.isArray(r.tagged) ? r.tagged : []
  return {
    id: r.id,
    node_id: r.node_id,
    date: r.note_date,
    shift: r.shift,
    location: r.node_name || '',
    manager: r.manager_name || '',
    manager_id: r.manager_id || null,
    summary: r.summary || '',
    taggedEmployees: tagged.map(t => (typeof t === 'string' ? t : t.name)).filter(Boolean),
    type: r.note_type || 'general',
    isPrivate: !!r.is_private,
    followUpRequired: !!r.follow_up_required,
    followUpNote: r.follow_up_note || '',
    photo: r.photo || null,
  }
}

// ─── Main Export ──────────────────────────────────────────────────────────────

export default function ShiftNotes() {
  const flagEnabled = useFeatureFlag('shift_notes')
  useConfig()

  const me = getSession()
  const locationNodes = useMemo(
    () => (me.nodes || []).filter(n => n.node_type === 'location'),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [(me.nodes || []).map(n => n.id).join(',')]
  )
  const locationIds = useMemo(() => locationNodes.map(n => n.id), [locationNodes])
  const myName = me.full_name || me.name || 'Me'

  const blankForm = useMemo(() => ({
    node_id: locationNodes[0]?.id || '',
    date: new Date().toISOString().slice(0, 10),
    shift: 'AM',
    summary: '',
    tagged: [],            // [{id, name}]
    type: 'general',
    followUpRequired: false,
    followUpNote: '',
    isPrivate: false,
  }), [locationNodes])

  const [notes, setNotes] = useState([])
  const [roster, setRoster] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [drill, setDrill] = useState(null)
  const [tab, setTab] = useState('feed')
  const [filters, setFilters] = useState({ location: 'all', date: '', shift: 'all', type: 'all' })
  const [form, setForm] = useState(blankForm)
  const [notePhoto, setNotePhoto] = useState(null)
  const [charCount, setCharCount] = useState(0)
  const [toast, setToast] = useState(null)
  const toastRef = useRef(null)

  const showToast = useCallback((msg, type = 'success') => {
    setToast({ msg, type })
    if (toastRef.current) clearTimeout(toastRef.current)
    toastRef.current = setTimeout(() => setToast(null), 3200)
  }, [])

  // ── Load real data ────────────────────────────────────────────────────────────

  const loadNotes = useCallback(async () => {
    setLoading(true)
    try {
      const { data, error } = await sb.rpc('get_shift_notes', { p_node_ids: locationIds, p_limit: 500 })
      if (error) throw error
      setNotes(Array.isArray(data) ? data.map(mapRow) : [])
    } catch (e) {
      setNotes([])
      showToast('Could not load shift notes.', 'error')
    } finally {
      setLoading(false)
    }
  }, [locationIds, showToast])

  const loadRoster = useCallback(async () => {
    try {
      const { data, error } = await sb.rpc('get_roster', { p_node_ids: locationIds })
      if (error) throw error
      setRoster((Array.isArray(data) ? data : []).map(r => ({
        id: r.person_id ?? r.id,
        name: r.full_name || r.name || '',
        location: r.node_name ?? r.location ?? '',
      })).filter(r => r.id && r.name))
    } catch {
      setRoster([])
    }
  }, [locationIds])

  useEffect(() => { loadNotes() }, [loadNotes])
  useEffect(() => { loadRoster() }, [loadRoster])
  // Keep the form's default location aligned with the loaded nodes.
  useEffect(() => {
    setForm(f => (f.node_id ? f : { ...f, node_id: locationNodes[0]?.id || '' }))
  }, [locationNodes])

  if (!flagEnabled) return <FeatureDisabled name="Shift Manager Notes" />

  // ── Derived ──────────────────────────────────────────────────────────────────

  const filteredNotes = notes.filter(n => {
    if (filters.location !== 'all' && n.location !== filters.location) return false
    if (filters.date && n.date !== filters.date) return false
    if (filters.shift !== 'all' && n.shift !== filters.shift) return false
    if (filters.type !== 'all' && n.type !== filters.type) return false
    return true
  }).sort((a, b) => b.date.localeCompare(a.date) || (b.shift === 'PM' ? 1 : -1))

  const myRecentNotes = notes
    .filter(n => n.manager_id && me.id && n.manager_id === me.id)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 5)

  // ── KPI values ───────────────────────────────────────────────────────────────

  const oneWeekAgo = new Date()
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7)
  const weekStr = oneWeekAgo.toISOString().slice(0, 10)
  const notesThisWeek = notes.filter(n => n.date >= weekStr).length
  const empMentioned = new Set(notes.flatMap(n => n.taggedEmployees)).size
  const outstandingFollowUps = notes.filter(n => n.followUpRequired).length
  const locationsCovered = new Set(notes.map(n => n.node_id).filter(Boolean)).size

  // ── Forensic drill-down: real note rows behind each KPI ──────────────────────
  const NOTE_COLS = [
    { key: 'date', label: 'Date', value: n => fmtDate(n.date), sortKey: n => n.date },
    { key: 'shift', label: 'Shift', value: n => n.shift },
    { key: 'location', label: 'Location', value: n => n.location },
    { key: 'manager', label: 'Manager', value: n => n.manager },
    { key: 'type', label: 'Type', value: n => NOTE_TYPES.find(t => t.id === n.type)?.label || n.type },
    { key: 'tagged', label: 'Tagged', value: n => n.taggedEmployees.join(', ') || '—' },
    { key: 'followUp', label: 'Follow-up', value: n => (n.followUpRequired ? 'Required' : '—') },
  ]
  const EMP_MENTION_COLS = [
    { key: 'employee', label: 'Employee', value: r => r.employee },
    { key: 'mentions', label: 'Mentions', value: r => r.mentions, align: 'right', sortKey: r => r.mentions },
    { key: 'lastNote', label: 'Last Mentioned', value: r => fmtDate(r.lastNote), sortKey: r => r.lastNote },
    { key: 'types', label: 'Note Types', value: r => r.types },
    { key: 'locations', label: 'Locations', value: r => r.locations },
  ]
  const empMentionRows = (() => {
    const map = {}
    notes.forEach(n => n.taggedEmployees.forEach(emp => {
      if (!map[emp]) map[emp] = { employee: emp, mentions: 0, lastNote: '', typeSet: new Set(), locSet: new Set() }
      map[emp].mentions++
      if (n.date > map[emp].lastNote) map[emp].lastNote = n.date
      map[emp].typeSet.add(NOTE_TYPES.find(t => t.id === n.type)?.label || n.type)
      map[emp].locSet.add(n.location)
    }))
    return Object.values(map).map(r => ({ ...r, types: [...r.typeSet].join(', '), locations: [...r.locSet].join(', ') }))
  })()
  const drillNotes = (title, rows, accent) => setDrill({
    title, subtitle: `${rows.length} note${rows.length === 1 ? '' : 's'}`, columns: NOTE_COLS, rows, accent,
  })

  // ── Form handlers ─────────────────────────────────────────────────────────────

  function handleSummaryChange(e) {
    setForm(f => ({ ...f, summary: e.target.value }))
    setCharCount(e.target.value.length)
  }

  function toggleTagEmployee(emp) {
    setForm(f => {
      const already = f.tagged.some(t => t.id === emp.id)
      return {
        ...f,
        tagged: already
          ? f.tagged.filter(t => t.id !== emp.id)
          : [...f.tagged, { id: emp.id, name: emp.name }],
      }
    })
  }

  async function handleSubmit() {
    if (!form.node_id) {
      showToast('Select a location first.', 'error')
      return
    }
    if (form.summary.trim().length < 20) {
      showToast('Summary must be at least 20 characters.', 'error')
      return
    }
    setSaving(true)
    try {
      const { data, error } = await sb.rpc('shift_note_create', {
        p_node_id: form.node_id,
        p_note_date: form.date,
        p_shift: form.shift,
        p_summary: form.summary.trim(),
        p_tagged: form.tagged,
        p_note_type: form.type,
        p_is_private: form.isPrivate,
        p_follow_up_required: form.followUpRequired,
        p_follow_up_note: form.followUpRequired ? form.followUpNote : '',
        p_photo: notePhoto,
        p_manager_name: myName,
        p_manager_id: me.id || null,
      })
      if (error) throw error
      if (data && data.ok === false) {
        showToast(data.error || 'Could not save shift note.', 'error')
        return
      }
      showToast('Shift note logged.')
      setForm({ ...blankForm })
      setNotePhoto(null)
      setCharCount(0)
      setTab('feed')
      await loadNotes()
    } catch (e) {
      showToast('Could not save shift note.', 'error')
    } finally {
      setSaving(false)
    }
  }

  function handleClear() {
    setForm({ ...blankForm })
    setNotePhoto(null)
    setCharCount(0)
  }

  async function handleDelete(note) {
    try {
      const { error } = await sb.rpc('shift_note_delete', { p_id: note.id, p_actor: me.id || null })
      if (error) throw error
      showToast('Shift note deleted.')
      await loadNotes()
    } catch {
      showToast('Could not delete shift note.', 'error')
    }
  }

  const hasFilters = filters.location !== 'all' || filters.date || filters.shift !== 'all' || filters.type !== 'all'

  // ── Views ─────────────────────────────────────────────────────────────────────

  function FeedView() {
    return (
      <>
        {/* Filter bar */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16, alignItems: 'flex-end' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 130 }}>
            <label style={S.label}>Location</label>
            <select
              style={{ ...S.select, width: 'auto' }}
              value={filters.location}
              onChange={e => setFilters(f => ({ ...f, location: e.target.value }))}
            >
              <option value="all">All Locations</option>
              {locationNodes.map(l => <option key={l.id} value={l.name}>{l.name}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={S.label}>Date</label>
            <input
              type="date"
              style={{ ...S.input, width: 'auto' }}
              value={filters.date}
              onChange={e => setFilters(f => ({ ...f, date: e.target.value }))}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={S.label}>Shift</label>
            <select
              style={{ ...S.select, width: 'auto' }}
              value={filters.shift}
              onChange={e => setFilters(f => ({ ...f, shift: e.target.value }))}
            >
              <option value="all">All Shifts</option>
              <option value="AM">AM</option>
              <option value="PM">PM</option>
            </select>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 160 }}>
            <label style={S.label}>Type</label>
            <select
              style={{ ...S.select, width: 'auto' }}
              value={filters.type}
              onChange={e => setFilters(f => ({ ...f, type: e.target.value }))}
            >
              <option value="all">All Types</option>
              {NOTE_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
          </div>
          {hasFilters && (
            <button
              style={{ ...S.btnSm('var(--t-text-muted)'), alignSelf: 'flex-end' }}
              onClick={() => setFilters({ location: 'all', date: '', shift: 'all', type: 'all' })}
            >
              CLEAR
            </button>
          )}
        </div>

        {/* Note count */}
        <div style={{ fontSize: 11, color: 'var(--t-text-muted)', marginBottom: 12 }}>
          {filteredNotes.length} {filteredNotes.length === 1 ? 'note' : 'notes'}
          {hasFilters ? ' matching filters' : ''}
        </div>

        {/* Notes list */}
        {loading ? (
          <div style={{ ...S.card(), textAlign: 'center', padding: '40px 20px', color: 'var(--t-text-muted)', fontSize: 13 }}>
            Loading shift notes…
          </div>
        ) : filteredNotes.length === 0 ? (
          <div style={{ ...S.card(), textAlign: 'center', padding: '40px 20px', color: 'var(--t-text-muted)', fontSize: 13 }}>
            {notes.length === 0 ? 'No shift notes yet.' : 'No shift notes match your filters.'}
          </div>
        ) : (
          filteredNotes.map(note => (
            <NoteCard
              key={note.id}
              note={note}
              canDelete={!!(me.id && note.manager_id === me.id)}
              onDelete={handleDelete}
            />
          ))
        )}

        {/* My Recent Notes */}
        {myRecentNotes.length > 0 && (
          <div style={{ marginTop: 32 }}>
            <div style={S.sectionLabel}>My Recent Notes</div>
            {myRecentNotes.map(note => <NoteCard key={note.id} note={note} compact />)}
          </div>
        )}
      </>
    )
  }

  function LogView() {
    return (
      <div style={{ maxWidth: 680 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--t-text-muted)', letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 16 }}>
          LOG NEW SHIFT NOTE
        </div>

        {locationNodes.length === 0 && (
          <div style={{ ...S.card('rgba(255,77,125,0.4)'), color: 'var(--t-danger)', fontSize: 12, marginBottom: 16 }}>
            No locations are assigned to your account, so shift notes cannot be logged.
          </div>
        )}

        {/* Row 1: Location + Date */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
          <div style={S.formRow}>
            <label style={S.label}>Location</label>
            <select
              style={S.select}
              value={form.node_id}
              onChange={e => setForm(f => ({ ...f, node_id: e.target.value }))}
            >
              {locationNodes.length === 0 && <option value="">No locations</option>}
              {locationNodes.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
          <div style={S.formRow}>
            <label style={S.label}>Date</label>
            <input
              type="date"
              style={S.input}
              value={form.date}
              onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
            />
          </div>
        </div>

        {/* Shift selector */}
        <div style={S.formRow}>
          <label style={S.label}>Shift</label>
          <div style={{ display: 'flex', gap: 8 }}>
            {['AM', 'PM'].map(s => (
              <button
                key={s}
                style={{
                  padding: '7px 24px',
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer',
                  borderRadius: 0,
                  border: form.shift === s ? `1px solid ${s === 'AM' ? '#2979ff' : '#7c4dff'}` : '1px solid var(--t-line)',
                  background: form.shift === s ? (s === 'AM' ? 'rgba(41,121,255,0.15)' : 'rgba(124,77,255,0.15)') : 'transparent',
                  color: form.shift === s ? (s === 'AM' ? '#2979ff' : '#b39ddb') : 'var(--t-text-muted)',
                  letterSpacing: '0.06em',
                }}
                onClick={() => setForm(f => ({ ...f, shift: s }))}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {/* Summary */}
        <div style={S.formRow}>
          <label style={S.label}>Summary <span style={{ color: 'var(--t-danger)' }}>*</span></label>
          <textarea
            style={{ ...S.textarea, minHeight: 100 }}
            placeholder="Describe what happened during this shift — incidents, recognitions, customer interactions, operational notes..."
            value={form.summary}
            onChange={handleSummaryChange}
          />
          <div style={{ fontSize: 10, color: charCount >= 20 ? 'var(--t-success)' : 'var(--t-danger)', marginTop: 4 }}>
            {charCount} characters (min 20)
          </div>
        </div>

        {/* Tag employees */}
        <div style={S.formRow}>
          <label style={S.label}>Tag Employees</label>
          {roster.length === 0 ? (
            <div style={{ fontSize: 11, color: 'var(--t-text-muted)', padding: '6px 0' }}>
              No team members found for your locations yet.
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
              {roster.map(emp => {
                const checked = form.tagged.some(t => t.id === emp.id)
                return (
                  <label
                    key={emp.id}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 8px', cursor: 'pointer', background: checked ? 'rgba(0,229,255,0.06)' : 'transparent', border: checked ? '1px solid rgba(0,229,255,0.3)' : '1px solid var(--t-line)', fontSize: 11, color: 'var(--t-text)' }}
                  >
                    <input
                      type="checkbox"
                      style={S.checkbox}
                      checked={checked}
                      onChange={() => toggleTagEmployee(emp)}
                    />
                    <span style={S.avatar(avatarColor(emp.name))}>{initials(emp.name)}</span>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{emp.name}</span>
                  </label>
                )
              })}
            </div>
          )}
        </div>

        {/* Note type */}
        <div style={S.formRow}>
          <label style={S.label}>Note Type</label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {NOTE_TYPES.map(t => {
              const active = form.type === t.id
              return (
                <button
                  key={t.id}
                  style={{
                    padding: '7px 14px',
                    fontSize: 10,
                    fontWeight: 800,
                    letterSpacing: '0.06em',
                    cursor: 'pointer',
                    borderRadius: 0,
                    border: `1px solid ${active ? t.color : 'var(--t-line)'}`,
                    background: active ? `${t.color}22` : 'transparent',
                    color: active ? t.color : 'var(--t-text-muted)',
                  }}
                  onClick={() => setForm(f => ({ ...f, type: t.id }))}
                >
                  {t.label}
                </button>
              )
            })}
          </div>
        </div>

        {/* Photo attachment */}
        <div style={S.formRow}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--t-text-muted)', marginBottom: 4 }}>PHOTO ATTACHMENT</div>
          <ImageUploader value={notePhoto} onChange={setNotePhoto} />
        </div>

        {/* Follow-up required */}
        <div style={{ ...S.formRow, display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            type="checkbox"
            id="followup-check"
            style={S.checkbox}
            checked={form.followUpRequired}
            onChange={e => setForm(f => ({ ...f, followUpRequired: e.target.checked }))}
          />
          <label htmlFor="followup-check" style={{ fontSize: 12, color: 'var(--t-text)', cursor: 'pointer' }}>
            Follow-up required
          </label>
        </div>

        {/* Follow-up note (conditional) */}
        {form.followUpRequired && (
          <div style={S.formRow}>
            <label style={S.label}>Follow-up Action</label>
            <textarea
              style={S.textarea}
              placeholder="Describe what action needs to be taken and by whom..."
              value={form.followUpNote}
              onChange={e => setForm(f => ({ ...f, followUpNote: e.target.value }))}
            />
          </div>
        )}

        {/* Private toggle */}
        <div style={{ ...S.formRow, background: 'rgba(255,77,125,0.04)', border: '1px solid rgba(255,77,125,0.15)', padding: '10px 12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <input
              type="checkbox"
              id="private-check"
              style={{ ...S.checkbox, accentColor: '#ff4d7d' }}
              checked={form.isPrivate}
              onChange={e => setForm(f => ({ ...f, isPrivate: e.target.checked }))}
            />
            <label htmlFor="private-check" style={{ fontSize: 12, color: 'var(--t-text)', cursor: 'pointer', fontWeight: 600 }}>
              Mark as private
            </label>
          </div>
          <div style={{ fontSize: 10, color: 'var(--t-danger)', paddingLeft: 22 }}>
            Private notes are only visible to managers and above.
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
          <button style={{ ...S.btn(), opacity: saving ? 0.6 : 1 }} disabled={saving} onClick={handleSubmit}>
            {saving ? 'SAVING…' : 'SUBMIT NOTE'}
          </button>
          <button style={S.btnOutline('var(--t-text-muted)')} onClick={handleClear}>CLEAR</button>
        </div>
      </div>
    )
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div style={S.page}>
      {/* Toast */}
      {toast && <div style={S.toast(toast.type)}>{toast.msg}</div>}

      {/* Header */}
      <div style={S.header}>
        <div style={S.headerLeft}>
          <div style={S.title}>SHIFT MANAGER NOTES</div>
          <div style={S.subtitle}>End-of-shift notes — feeds directly into performance reviews</div>
        </div>
        <div style={S.headerRight}>
          <button style={S.btn()} onClick={() => setTab('log')}>+ Log Shift Note</button>
        </div>
      </div>

      {/* KPI Row */}
      <div style={{ padding: '16px 20px 0', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <KTile
          label="Notes This Week"
          value={notesThisWeek}
          sub="Last 7 days"
          color="#00e5ff"
          onClick={() => drillNotes('Shift Notes — Last 7 Days', notes.filter(n => n.date >= weekStr), '#00e5ff')}
        />
        <KTile
          label="Locations Covered"
          value={locationsCovered}
          sub="With notes logged"
          color="#2ad6a0"
          onClick={() => drillNotes('Shift Notes by Location', [...notes].sort((a, b) => a.location.localeCompare(b.location)), '#2ad6a0')}
        />
        <KTile
          label="Employees Mentioned"
          value={empMentioned}
          sub="Across all notes"
          color="#7c4dff"
          onClick={() => setDrill({ title: 'Employees Mentioned in Shift Notes', subtitle: `${empMentionRows.length} employees`, columns: EMP_MENTION_COLS, rows: empMentionRows, accent: '#7c4dff' })}
        />
        <KTile
          label="Outstanding Follow-ups"
          value={outstandingFollowUps}
          sub="Action required"
          alert="amber"
          onClick={() => drillNotes('Notes Requiring Follow-up', notes.filter(n => n.followUpRequired), 'var(--t-warn)')}
        />
      </div>

      {/* Tabs */}
      <div style={{ padding: '16px 20px 0' }}>
        <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--t-line)', overflowX: 'auto' }}>
          {[
            { id: 'feed', label: 'FEED' },
            { id: 'log',  label: 'LOG NOTE' },
          ].map(t => (
            <button
              key={t.id}
              style={{
                padding: '9px 16px',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                background: 'transparent',
                border: 'none',
                borderBottom: tab === t.id ? '2px solid #00e5ff' : '2px solid transparent',
                color: tab === t.id ? '#00e5ff' : 'var(--t-text-muted)',
                whiteSpace: 'nowrap',
                letterSpacing: '0.06em',
              }}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Body */}
      <div style={S.body}>
        {tab === 'feed' && <FeedView />}
        {tab === 'log' && <LogView />}
      </div>

      {/* Forensic drill-down */}
      <DrillDown open={!!drill} onClose={() => setDrill(null)} {...(drill || {})} />
    </div>
  )
}
