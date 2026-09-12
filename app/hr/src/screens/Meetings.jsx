import { useState, useEffect, useCallback, useRef } from 'react'
import { sb } from '../lib/supabase'
import { useAuth } from '../lib/auth.jsx'
import { useScope } from '../lib/scope.jsx'
import DrillDown from '../components/DrillDown.jsx'

// ── CONSTANTS ─────────────────────────────────────────────────────────────────

const ROOM_DEFS = [
  { id: 'boardroom',  name: 'Executive Boardroom',    seats: 12, desc: 'Leadership, company-wide, executive sessions',     color: '#7c4dff' },
  { id: 'hr_room',    name: 'HR Private Room',         seats: 4,  desc: 'Confidential HR, investigations, sensitive matters', color: '#ff4d7d' },
  { id: 'corrective', name: 'Corrective Action Room',  seats: 4,  desc: 'Write-ups, PIPs, disciplinary hearings',           color: '#ffb800' },
  { id: 'training',   name: 'Training Room',           seats: 20, desc: 'Group training, onboarding, skills workshops',      color: '#2979ff' },
  { id: 'huddle',     name: 'Team Huddle Room',        seats: 8,  desc: 'Shift briefings, quick syncs, daily stand-ups',     color: '#2ad6a0' },
  { id: 'virtual',    name: 'Virtual / Video Room',    seats: 50, desc: 'Zoom, Google Meet, Teams — remote meetings',        color: '#00e5ff' },
  { id: 'review',     name: 'Performance Review Room', seats: 3,  desc: 'Quarterly reviews, goal setting, feedback',         color: '#ffb800' },
]

const MTG_TYPES = [
  { id: 'huddle',       label: 'Team Huddle',                   color: '#2ad6a0', needsSig: false },
  { id: 'group',        label: 'Group Meeting',                  color: '#2979ff', needsSig: false },
  { id: 'oneon1',       label: '1-on-1',                        color: '#7c4dff', needsSig: false },
  { id: 'corrective',   label: 'Corrective Action',             color: '#ff4d7d', needsSig: true  },
  { id: 'review',       label: 'Performance Review',            color: '#ffb800', needsSig: true  },
  { id: 'disciplinary', label: 'Disciplinary Hearing',          color: '#ff4d7d', needsSig: true  },
  { id: 'training_s',   label: 'Training Session',              color: '#2979ff', needsSig: false },
  { id: 'pip',          label: 'Performance Improvement Plan',  color: '#ffb800', needsSig: true  },
  { id: 'onboarding',   label: 'New Employee Orientation',      color: '#2ad6a0', needsSig: false },
  { id: 'general',      label: 'General Meeting',               color: '#00e5ff', needsSig: false },
]

const QUICK_TEMPLATES = [
  { id: 'daily_huddle', label: 'Daily Huddle',    type: 'huddle',    room: 'huddle',    duration: 15, agenda: '1. Yesterday recap\n2. Today plan\n3. Blockers' },
  { id: 'oneon1',       label: '1-on-1',          type: 'oneon1',    room: 'hr_room',   duration: 30, agenda: '1. Check-in\n2. Goals update\n3. Feedback\n4. Next steps' },
  { id: 'team_meeting', label: 'Team Meeting',    type: 'group',     room: 'boardroom', duration: 60, agenda: '1. Announcements\n2. KPIs review\n3. Open floor\n4. Action items' },
  { id: 'training',     label: 'Training Session',type: 'training_s',room: 'training',  duration: 90, agenda: '1. Introduction\n2. Core content\n3. Q&A\n4. Assessment' },
]

const BLANK_FORM = {
  title: '',
  type: 'general',
  room: 'huddle',
  meeting_date: '',
  start_time: '10:00',
  duration: 60,
  location: 'All',
  meeting_type_label: 'In-person',
  video_link: '',
  agenda: '',
  recurring: 'none',
  confidential: false,
  pre_note: '',
  attendee_ids: [],
}

// ── HELPERS ───────────────────────────────────────────────────────────────────

function fmt12(t) {
  if (!t) return ''
  const [h, m] = t.split(':')
  const hr = parseInt(h)
  return `${hr > 12 ? hr - 12 : hr || 12}:${m} ${hr >= 12 ? 'PM' : 'AM'}`
}

function fmtDate(ds) {
  if (!ds) return ''
  return new Date(ds + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

function fmtDateLong(ds) {
  if (!ds) return ''
  return new Date(ds + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
}

function getMtgType(typeId) {
  return MTG_TYPES.find(t => t.id === typeId) || MTG_TYPES[MTG_TYPES.length - 1]
}

function getRoomDef(roomId) {
  return ROOM_DEFS.find(r => r.id === roomId)
}

function calcEndTime(startTime, durationMins) {
  if (!startTime) return ''
  const [h, m] = startTime.split(':').map(Number)
  const total = h * 60 + m + durationMins
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

const AVATAR_COLORS = ['#7c4dff','#2979ff','#2ad6a0','#ffb800','#ff4d7d','#00e5ff','#ff6d00','#aa00ff']

function hexA(hex) {
  const h = hex.replace('#', '')
  if (h.length === 3) {
    return `${parseInt(h[0]+h[0],16)},${parseInt(h[1]+h[1],16)},${parseInt(h[2]+h[2],16)}`
  }
  return `${parseInt(h.slice(0,2),16)},${parseInt(h.slice(2,4),16)},${parseInt(h.slice(4,6),16)}`
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

// Location chip color
function locColor(loc) {
  if (loc === 'Orange')     return 'var(--t-warn)'
  if (loc === 'Hartford')   return 'var(--t-accent)'
  if (loc === 'Manchester') return 'var(--t-success)'
  if (loc === 'Southington') return 'var(--t-text-muted)'
  return 'var(--t-text-muted)'
}

const LOCATIONS = ['Orange', 'Hartford', 'Manchester', 'Southington', 'Warehouse / Distribution']

// ── STYLES ────────────────────────────────────────────────────────────────────

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
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 },
  modalBox: { background: '#0d1117', border: '1px solid var(--t-line)', maxWidth: 640, width: '100%', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 24px 80px rgba(0,0,0,0.6)' },
  modalHeader: { background: '#0d1117', borderBottom: '1px solid var(--t-line)', padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 10 },
  modalTitle: { fontSize: 14, fontWeight: 800, color: 'var(--t-text)' },
  modalBody: { padding: 20 },
  modalFooter: { borderTop: '1px solid var(--t-line)', padding: '12px 20px', display: 'flex', gap: 8, justifyContent: 'flex-end' },
  closeBtn: { background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.15)', color: 'var(--t-text)', width: 28, height: 28, cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 0 },
  toast: (type) => ({ position: 'fixed', top: 20, right: 20, zIndex: 9999, background: type === 'error' ? '#ff4d7d' : '#2ad6a0', color: '#070b14', padding: '10px 18px', fontSize: 12, fontWeight: 700, boxShadow: '0 8px 32px rgba(0,0,0,0.4)' }),
  avatar: (color = '#7c4dff') => ({ width: 24, height: 24, background: color, fontSize: 9, fontWeight: 900, color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginRight: 2, flexShrink: 0, borderRadius: 0 }),
}

// ── DRILL-DOWN COLUMNS ────────────────────────────────────────────────────────

const MEETING_COLS = [
  { key: 'title', label: 'Meeting', value: m => m.title },
  { key: 'type', label: 'Type', value: m => getMtgType(m.type).label },
  { key: 'meeting_date', label: 'Date', value: m => fmtDate(m.meeting_date), sortKey: m => m.meeting_date },
  { key: 'start_time', label: 'Time', value: m => fmt12(m.start_time), sortKey: m => m.start_time },
  { key: 'location', label: 'Location', value: m => m.location },
  { key: 'attendee_count', label: 'Attendees', value: m => (m.attendee_count || m.attendees?.length || 0), align: 'right', sortKey: m => (m.attendee_count || m.attendees?.length || 0) },
  { key: 'status', label: 'Status', value: m => m.status },
  { key: 'recurring', label: 'Recurring', value: m => m.recurring || 'none' },
]

const ACTION_ITEM_COLS = [
  { key: 'description', label: 'Action Item', value: a => a.description || '(untitled)' },
  { key: 'meetingTitle', label: 'From Meeting', value: a => a.meetingTitle },
  { key: 'owner', label: 'Owner', value: a => a.owner || '—' },
  { key: 'dueDate', label: 'Due', value: a => a.dueDate || '—', sortKey: a => a.dueDate || '' },
  { key: 'status', label: 'Status', value: a => a.status || 'open' },
]

// ── KPI TILE ──────────────────────────────────────────────────────────────────

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

// ── MEETING CARD (shared between list and by-location) ────────────────────────

function MeetingCard({ m, rsvpState, handleRsvp, handleDelete, compact }) {
  const mt = getMtgType(m.type)
  const room = getRoomDef(m.room)
  const isDone = m.status === 'completed'
  const isLive = m.status === 'live'
  const rsvp = rsvpState ? rsvpState[m.id] : null
  const borderColor = isLive ? 'rgba(255,77,125,0.5)' : 'var(--t-line)'

  return (
    <div style={{ ...S.card(borderColor, mt.color), marginBottom: compact ? 8 : 0 }}>
      {/* Title row */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 3 }}>
            {isLive && <span style={{ width: 7, height: 7, background: '#ff4d7d', borderRadius: '50%', display: 'inline-block', flexShrink: 0 }} />}
            <span style={{ fontSize: compact ? 12 : 13, fontWeight: 800, color: 'var(--t-text)', lineHeight: 1.3 }}>{m.title}</span>
            {isDone && <span className="badge green" style={{ fontSize: 9 }}>Done</span>}
          </div>
          <div style={{ display: 'flex', gap: 8, fontSize: 11, color: 'var(--t-text-muted)', flexWrap: 'wrap', alignItems: 'center' }}>
            <span>{fmt12(m.start_time)}{m.end_time ? ` – ${fmt12(m.end_time)}` : ''}</span>
            {m.location && !compact && (
              <span style={{ color: locColor(m.location), fontWeight: 600 }}>· {m.location}</span>
            )}
            {room && !compact && <span>· {room.name}</span>}
            {m.video_link && <span className="badge blue" style={{ fontSize: 9 }}>Video</span>}
            {m.organizer && !compact && <span>· {m.organizer}</span>}
          </div>
        </div>
        <span
          className={`badge ${mt.color === '#ff4d7d' ? 'red' : mt.color === '#2ad6a0' ? 'green' : mt.color === '#ffb800' ? 'amber' : mt.color === '#7c4dff' ? 'purple' : 'blue'}`}
          style={{ fontSize: 9, flexShrink: 0 }}
        >
          {mt.label}
        </span>
      </div>

      {/* Attendees row */}
      {(m.attendees?.length > 0 || m.attendee_count > 0) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 3, marginBottom: 6, flexWrap: 'wrap' }}>
          {(m.attendees || []).slice(0, compact ? 4 : 6).map((a, i) => (
            <span key={i} title={a} style={{ ...S.avatar(AVATAR_COLORS[i % AVATAR_COLORS.length]) }}>
              {initials(a)}
            </span>
          ))}
          {((m.attendees?.length || 0) > (compact ? 4 : 6) || (m.attendee_count > (compact ? 4 : 6))) && (
            <span style={{ fontSize: 10, color: 'var(--t-text-faint)' }}>
              +{Math.max(0, (m.attendee_count || m.attendees?.length || 0) - (compact ? 4 : 6))} more
            </span>
          )}
          <span style={{ fontSize: 10, color: 'var(--t-text-faint)', marginLeft: 4 }}>
            {m.attendee_count || m.attendees?.length || 0} attendees
          </span>
        </div>
      )}

      {/* Agenda preview */}
      {m.agenda && !compact && (
        <div style={{ fontSize: 11, color: 'var(--t-text-faint)', lineHeight: 1.5, marginBottom: 8, maxHeight: 36, overflow: 'hidden' }}>
          {m.agenda.split('\n')[0]}
        </div>
      )}

      {/* Action row */}
      {!compact && (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          {m.video_link && (
            <a href={m.video_link} target="_blank" rel="noreferrer"
              style={{ ...S.btnSm('#2979ff'), textDecoration: 'none', display: 'inline-block' }}>
              Join Video
            </a>
          )}
          {handleRsvp && (
            <>
              <button
                style={{ ...S.btnSm('#2ad6a0'), background: rsvp === 'accept' ? 'rgba(42,214,160,0.2)' : 'transparent', fontWeight: rsvp === 'accept' ? 900 : 600 }}
                onClick={() => handleRsvp(m.id, 'accept')}
              >
                {rsvp === 'accept' ? 'Accepted' : 'Accept'}
              </button>
              <button
                style={{ ...S.btnSm('#ffb800'), background: rsvp === 'maybe' ? 'rgba(255,184,0,0.2)' : 'transparent', fontWeight: rsvp === 'maybe' ? 900 : 600 }}
                onClick={() => handleRsvp(m.id, 'maybe')}
              >
                {rsvp === 'maybe' ? "Maybe'd" : 'Maybe'}
              </button>
              <button
                style={{ ...S.btnSm('#ff4d7d'), background: rsvp === 'decline' ? 'rgba(255,77,125,0.2)' : 'transparent', fontWeight: rsvp === 'decline' ? 900 : 600 }}
                onClick={() => handleRsvp(m.id, 'decline')}
              >
                {rsvp === 'decline' ? 'Declined' : 'Decline'}
              </button>
            </>
          )}
          {handleDelete && (
            <button
              style={{ ...S.btnDanger, marginLeft: 'auto', fontSize: 10 }}
              onClick={() => handleDelete(m.id)}
            >
              Delete
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ── MAIN COMPONENT ────────────────────────────────────────────────────────────

export default function Meetings() {
  const { session } = useAuth()
  const { locationIds } = useScope()

  const roleName = (session?.person?.role_name || '').toLowerCase()
  const isHR = ['ceo', 'hr', 'manager', 'coo', 'admin', 'owner'].some(x => roleName.includes(x))
  const userId = session?.person?.id
  const userName = session?.person?.full_name || session?.person?.name || 'You'

  const today = new Date().toISOString().slice(0, 10)
  const thisMonth = today.slice(0, 7)

  const [meetings, setMeetings] = useState([])
  const [employees, setEmployees] = useState([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('upcoming')
  const [form, setForm] = useState({ ...BLANK_FORM, meeting_date: today })
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState(null)
  const [drill, setDrill] = useState(null)
  const toastRef = useRef(null)

  // Upcoming tab: view mode and filters
  const [upcomingView, setUpcomingView] = useState('list') // 'list' | 'bylocation'
  const [listFilters, setListFilters] = useState({
    search: '',
    location: 'All',
    type: 'All',
    status: 'All',
    dateRange: 'All',
    recurringOnly: false,
  })

  // Upcoming tab: RSVP state keyed by meeting id (loaded from meeting_rsvps)
  const [rsvpState, setRsvpState] = useState({})

  // Persisted meeting notes keyed by meeting_id (from meeting_notes table)
  const [notesMap, setNotesMap] = useState({})

  // Notes tab state
  const [notesMeetingId, setNotesMeetingId] = useState('')
  const [notesPresentMap, setNotesPresentMap] = useState({})
  const [notesAgendaStatus, setNotesAgendaStatus] = useState({})
  const [notesActionItems, setNotesActionItems] = useState([])
  const [notesNextDate, setNotesNextDate] = useState('')
  const [notesSaving, setNotesSaving] = useState(false)

  // Archive tab state
  const [archiveSearch, setArchiveSearch] = useState('')
  const [archiveDetail, setArchiveDetail] = useState(null)

  // Schedule tab state
  const [scheduleError, setScheduleError] = useState('')

  // Attendee filter state (inside schedule form)
  const [attSearch, setAttSearch] = useState('')
  const [attLocFilter, setAttLocFilter] = useState('All')
  const [attRoleFilter, setAttRoleFilter] = useState('All')

  // ── TOAST ───────────────────────────────────────────────────────────────────
  const showToast = useCallback((msg, type = 'success') => {
    setToast({ msg, type })
    clearTimeout(toastRef.current)
    toastRef.current = setTimeout(() => setToast(null), 3000)
  }, [])

  // ── LOAD ────────────────────────────────────────────────────────────────────
  // Map real Supabase node ids → clean location names (for filters/grouping/display).
  const NODE_LOCATION = {
    '63ec69c7-297b-4c7b-9cd7-c9ffc168ae97': 'Hartford',
    '412af28d-997b-459e-a305-e785f9eac7d0': 'Manchester',
    '4701a552-e635-4394-a607-a5e1b9aeebbe': 'Orange',
    '46919412-dcea-422e-89d5-8637891142eb': 'Southington',
    'b4cb7b65-39e8-48cd-a5e2-35f706ad4d93': 'Warehouse',
  }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { data, error } = await sb.rpc('get_meetings', { p_node_ids: locationIds })
      if (error) throw error
      // Normalize real RPC rows into the existing render shape.
      // Real fields: id, node_id, title, meeting_date, start_time, end_time,
      // location (room string), agenda, notes, attendee_ids (uuid[]), status, created_by, created_at.
      const mapped = (Array.isArray(data) ? data : []).map(r => {
        const ids = Array.isArray(r.attendee_ids) ? r.attendee_ids : []
        return {
          id: r.id,
          node_id: r.node_id,
          title: r.title || 'Meeting',
          type: r.type || 'general',
          room: r.room || 'huddle',
          meeting_date: r.meeting_date ? String(r.meeting_date).slice(0, 10) : '',
          start_time: r.start_time ? String(r.start_time).slice(0, 5) : '',
          end_time: r.end_time ? String(r.end_time).slice(0, 5) : '',
          location: NODE_LOCATION[r.node_id] || r.location || 'All',
          room_label: r.location || '',
          status: r.status || 'scheduled',
          attendee_ids: ids,
          attendee_count: ids.length,
          attendees: [],
          agenda: r.agenda || '',
          notes: r.notes || '',
          video_link: r.video_link || '',
          organizer: r.organizer || '',
          recurring: r.recurring || 'none',
          confidential: !!r.confidential,
        }
      })
      setMeetings(mapped)
    } catch {
      // Honest empty state — no fabricated meetings.
      setMeetings([])
    } finally {
      setLoading(false)
    }
  }, [locationIds.join(',')])

  const loadEmployees = useCallback(async () => {
    try {
      const { data } = await sb.rpc('get_roster', { p_node_ids: locationIds })
      // Real roster columns: id, full_name, role_name, node_name (location label).
      setEmployees((data || []).map(r => ({
        id: r.person_id ?? r.id,
        name: r.full_name ?? r.name ?? r.employee_name ?? String(r.id),
        full_name: r.full_name ?? r.name ?? r.employee_name ?? String(r.id),
        role_name: r.role_name ?? null,
        location: r.node_name ?? r.location ?? null,
      })))
    } catch {
      setEmployees([])
    }
  }, [locationIds.join(',')])

  // All persisted meeting notes in scope, keyed by meeting_id (replaces the old
  // localStorage store). Powers KPIs, the Notes tab, and the Archive.
  const loadNotes = useCallback(async () => {
    try {
      const { data } = await sb.rpc('get_meeting_notes_bulk', { p_node_ids: locationIds })
      const map = {}
      ;(data || []).forEach(n => { map[n.meeting_id] = n })
      setNotesMap(map)
    } catch {
      setNotesMap({})
    }
  }, [locationIds.join(',')])

  // This user's RSVP responses, keyed by meeting_id.
  const loadRsvps = useCallback(async () => {
    if (!userId) { setRsvpState({}); return }
    try {
      const { data } = await sb.rpc('get_my_rsvps', { p_person_id: userId, p_node_ids: locationIds })
      setRsvpState(data && typeof data === 'object' ? data : {})
    } catch {
      setRsvpState({})
    }
  }, [userId, locationIds.join(',')])

  useEffect(() => { load(); loadEmployees(); loadNotes(); loadRsvps() }, [load, loadEmployees, loadNotes, loadRsvps])

  // ── DERIVED ─────────────────────────────────────────────────────────────────

  // Resolve attendee uuids → real names from the live roster.
  const nameById = employees.reduce((acc, e) => { acc[e.id] = e.full_name || e.name; return acc }, {})
  const resolvedMeetings = meetings.map(m => {
    const attendees = (m.attendee_ids || []).map(id => nameById[id]).filter(Boolean)
    return { ...m, attendees, attendee_count: (m.attendee_ids || []).length }
  })

  // Filter confidential meetings for non-managers
  const isManager = ['ceo','manager','coo','admin','owner','hr'].some(r => roleName.includes(r))
  const visibleMeetings = resolvedMeetings.filter(m => {
    if (!m.confidential) return true
    if (isManager) return true
    // Non-managers can only see confidential meetings they explicitly organized
    return m.organizer === userName
  })

  const todayMeetings = visibleMeetings
    .filter(m => m.meeting_date === today && m.status !== 'cancelled')
    .sort((a, b) => (a.start_time || '').localeCompare(b.start_time || ''))

  const upcomingMeetings = visibleMeetings
    .filter(m => m.meeting_date >= today && m.status !== 'cancelled')
    .sort((a, b) => a.meeting_date.localeCompare(b.meeting_date) || (a.start_time || '').localeCompare(b.start_time || ''))

  const pastMeetings = visibleMeetings
    .filter(m => m.meeting_date < today)
    .sort((a, b) => b.meeting_date.localeCompare(a.meeting_date))

  const last30Past = pastMeetings.slice(0, 30)

  // KPI computations
  const meetingsThisMonth = meetings.filter(m => m.meeting_date.startsWith(thisMonth)).length
  const avgAttendancePct = (() => {
    const withAtt = meetings.filter(m => m.attendee_count > 0)
    if (!withAtt.length) return 0
    const sum = withAtt.reduce((acc, m) => {
      const cap = getRoomDef(m.room)?.seats || 10
      return acc + Math.min(100, Math.round((m.attendee_count / cap) * 100))
    }, 0)
    return Math.round(sum / withAtt.length)
  })()

  const allActionItems = (() => {
    const items = []
    meetings.forEach(m => {
      const n = notesMap[m.id]
      const list = Array.isArray(n?.action_items) ? n.action_items : []
      list.forEach(ai => items.push({ ...ai, meetingTitle: m.title }))
    })
    return items
  })()
  const openActionItems = allActionItems.filter(ai => ai.status !== 'done').length
  const overdueActionItems = allActionItems.filter(ai => {
    if (!ai.dueDate || ai.status === 'done') return false
    return ai.dueDate < today
  }).length

  const recurringMeetings = meetings.filter(m => m.recurring && m.recurring !== 'none').length

  // ── FILTERED UPCOMING (for list view) ───────────────────────────────────────
  const filteredUpcoming = (() => {
    let list = upcomingMeetings
    const f = listFilters

    if (f.search) {
      const q = f.search.toLowerCase()
      list = list.filter(m =>
        m.title?.toLowerCase().includes(q) ||
        m.organizer?.toLowerCase().includes(q)
      )
    }
    if (f.location !== 'All') {
      list = list.filter(m => m.location === f.location)
    }
    if (f.type !== 'All') {
      list = list.filter(m => m.type === f.type)
    }
    if (f.status !== 'All') {
      list = list.filter(m => m.status === f.status)
    }
    if (f.recurringOnly) {
      list = list.filter(m => m.recurring && m.recurring !== 'none')
    }
    if (f.dateRange === 'Today') {
      list = list.filter(m => m.meeting_date === today)
    } else if (f.dateRange === 'This Week') {
      const weekEnd = new Date()
      weekEnd.setDate(weekEnd.getDate() + 7)
      const weekEndStr = weekEnd.toISOString().slice(0, 10)
      list = list.filter(m => m.meeting_date >= today && m.meeting_date <= weekEndStr)
    } else if (f.dateRange === 'This Month') {
      list = list.filter(m => m.meeting_date.startsWith(thisMonth))
    }

    return list
  })()

  // ── SCHEDULE SAVE ───────────────────────────────────────────────────────────
  const handleSchedule = async () => {
    setScheduleError('')
    if (!form.title.trim()) { setScheduleError('Meeting title is required'); return }
    if (!form.meeting_date) { setScheduleError('Date is required'); return }
    if (!locationIds[0]) { setScheduleError('No location in scope — cannot schedule'); return }
    setSaving(true)
    const endTime = calcEndTime(form.start_time, form.duration)
    try {
      const params = {
        p_node_id: locationIds[0],
        p_title: form.title.trim(),
        p_type: form.type,
        p_room: form.room,
        p_meeting_date: form.meeting_date,
        p_start_time: form.start_time || null,
        p_end_time: endTime || null,
        p_location: form.location || null,
        p_video_link: form.video_link || null,
        p_agenda: form.agenda || null,
        p_recurring: form.recurring,
        p_confidential: form.confidential,
        p_pre_note: form.pre_note || null,
        p_attendee_ids: form.attendee_ids,
        p_created_by: userId,
      }
      const { data, error } = await sb.rpc('create_meeting', params)
      if (error) throw error
      if (data && data.ok === false) throw new Error(data.error || 'save_failed')
      showToast('Meeting scheduled — attendees notified')
      setForm({ ...BLANK_FORM, meeting_date: today })
      await load()
    } catch (e) {
      // Honest failure — nothing is faked or stored locally.
      setScheduleError('Could not save meeting. Please try again.')
      showToast('Meeting not saved', 'error')
    } finally {
      setSaving(false)
    }
  }

  // ── DELETE MEETING (managers) ────────────────────────────────────────────────
  const handleDelete = async (meetingId) => {
    if (!meetingId) return
    if (typeof window !== 'undefined' && !window.confirm('Delete this meeting? This cannot be undone.')) return
    try {
      const { error } = await sb.rpc('delete_meeting', { p_id: meetingId })
      if (error) throw error
      showToast('Meeting deleted')
      if (archiveDetail?.id === meetingId) setArchiveDetail(null)
      await load()
    } catch {
      showToast('Delete failed', 'error')
    }
  }

  const applyTemplate = (t) => {
    setForm(f => ({
      ...f,
      title: t.label,
      type: t.type,
      room: t.room,
      agenda: t.agenda,
      duration: t.duration,
    }))
    setTab('schedule')
  }

  // ── RSVP TOGGLE (persisted to meeting_rsvps) ─────────────────────────────────
  const handleRsvp = async (meetingId, status) => {
    if (!userId) { showToast('Sign in to RSVP', 'error'); return }
    const prevStatus = rsvpState[meetingId] || null
    const nextStatus = prevStatus === status ? null : status
    // Optimistic update, reconciled against the server response.
    setRsvpState(prev => ({ ...prev, [meetingId]: nextStatus }))
    try {
      const { data, error } = await sb.rpc('set_meeting_rsvp', {
        p_meeting_id: meetingId, p_person_id: userId, p_status: status,
      })
      if (error) throw error
      const serverStatus = data && 'status' in data ? data.status : nextStatus
      setRsvpState(prev => ({ ...prev, [meetingId]: serverStatus }))
    } catch {
      setRsvpState(prev => ({ ...prev, [meetingId]: prevStatus }))
      showToast('RSVP not saved', 'error')
    }
  }

  // ── NOTES HELPERS ───────────────────────────────────────────────────────────
  // Notes are persisted in meeting_notes and preloaded into notesMap. Selecting a
  // meeting hydrates the editor from that record, or seeds a blank scaffold from
  // the meeting's attendees + agenda when no notes exist yet.
  const loadNotesForMeeting = (mId) => {
    setNotesMeetingId(mId)
    if (!mId) { setNotesPresentMap({}); setNotesAgendaStatus({}); setNotesActionItems([]); setNotesNextDate(''); return }
    const saved = notesMap[mId]
    if (saved) {
      setNotesPresentMap(saved.present_map || {})
      setNotesAgendaStatus(saved.agenda_status || {})
      setNotesActionItems(Array.isArray(saved.action_items) ? saved.action_items : [])
      setNotesNextDate(saved.next_date || '')
      return
    }
    const mtg = resolvedMeetings.find(m => m.id === mId)
    if (mtg) {
      const pMap = {}
      ;(mtg.attendees || []).forEach(a => { pMap[a] = true })
      setNotesPresentMap(pMap)
      const aStatus = {}
      ;(mtg.agenda || '').split('\n').filter(Boolean).forEach(line => { aStatus[line] = 'pending' })
      setNotesAgendaStatus(aStatus)
    } else {
      setNotesPresentMap({})
      setNotesAgendaStatus({})
    }
    setNotesActionItems([])
    setNotesNextDate('')
  }

  const cycleAgendaStatus = (line) => {
    const cycle = { pending: 'discussed', discussed: 'skipped', skipped: 'tabled', tabled: 'pending' }
    setNotesAgendaStatus(prev => ({ ...prev, [line]: cycle[prev[line] || 'pending'] || 'discussed' }))
  }

  const agendaStatusColor = (s) => {
    if (s === 'discussed') return '#2ad6a0'
    if (s === 'skipped') return '#ff4d7d'
    if (s === 'tabled') return '#ffb800'
    return 'var(--t-text-muted)'
  }

  const addActionItem = () => {
    setNotesActionItems(prev => [...prev, { id: Date.now(), description: '', owner: '', dueDate: '', status: 'open' }])
  }

  const updateActionItem = (id, field, val) => {
    setNotesActionItems(prev => prev.map(ai => ai.id === id ? { ...ai, [field]: val } : ai))
  }

  const removeActionItem = (id) => {
    setNotesActionItems(prev => prev.filter(ai => ai.id !== id))
  }

  const persistNotes = async (shared) => {
    if (!notesMeetingId) { showToast('Select a meeting first', 'error'); return false }
    const { data, error } = await sb.rpc('save_meeting_notes', {
      p_meeting_id: notesMeetingId,
      p_present_map: notesPresentMap,
      p_agenda_status: notesAgendaStatus,
      p_action_items: notesActionItems,
      p_next_date: notesNextDate || null,
      p_shared: shared,
      p_actor: userId || null,
    })
    if (error) throw error
    if (data && data.ok === false) throw new Error(data.error || 'save_failed')
    await loadNotes()
    return true
  }

  const saveNotes = async () => {
    if (!notesMeetingId) { showToast('Select a meeting first', 'error'); return }
    setNotesSaving(true)
    try {
      await persistNotes(false)
      showToast('Meeting notes saved')
    } catch {
      showToast('Save failed', 'error')
    } finally {
      setNotesSaving(false)
    }
  }

  const shareNotes = async () => {
    if (!notesMeetingId) { showToast('Select a meeting first', 'error'); return }
    setNotesSaving(true)
    try {
      await persistNotes(true)
      showToast('Notes saved and shared with attendees')
    } catch {
      showToast('Share failed', 'error')
    } finally {
      setNotesSaving(false)
    }
  }

  // ── FILTER BAR COMPONENT ─────────────────────────────────────────────────────

  function FilterBar() {
    const setF = (key, val) => setListFilters(prev => ({ ...prev, [key]: val }))
    const activeCount = [
      listFilters.search,
      listFilters.location !== 'All',
      listFilters.type !== 'All',
      listFilters.status !== 'All',
      listFilters.dateRange !== 'All',
      listFilters.recurringOnly,
    ].filter(Boolean).length

    const filterSelectStyle = {
      background: '#070b14',
      border: '1px solid var(--t-line)',
      color: 'var(--t-text)',
      padding: '6px 10px',
      fontSize: 11,
      outline: 'none',
      borderRadius: 0,
      appearance: 'none',
      cursor: 'pointer',
    }

    return (
      <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', padding: '10px 14px', marginBottom: 16 }}>
        {/* Row 1: search + clear */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 8 }}>
          <input
            style={{ ...S.input, maxWidth: 220, padding: '6px 10px', fontSize: 11 }}
            placeholder="Search title or organizer..."
            value={listFilters.search}
            onChange={e => setF('search', e.target.value)}
          />
          {activeCount > 0 && (
            <button
              style={{ ...S.btnSm('#ff4d7d'), fontSize: 10 }}
              onClick={() => setListFilters({ search: '', location: 'All', type: 'All', status: 'All', dateRange: 'All', recurringOnly: false })}
            >
              Clear Filters ({activeCount})
            </button>
          )}
        </div>

        {/* Row 2: filter dropdowns + recurring toggle */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {/* Location */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--t-text-muted)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Location</div>
            <select style={filterSelectStyle} value={listFilters.location} onChange={e => setF('location', e.target.value)}>
              <option value="All">All</option>
              {LOCATIONS.map(l => <option key={l} value={l}>{l}</option>)}
            </select>
          </div>

          {/* Type */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--t-text-muted)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Type</div>
            <select style={filterSelectStyle} value={listFilters.type} onChange={e => setF('type', e.target.value)}>
              <option value="All">All Types</option>
              {MTG_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
          </div>

          {/* Status */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--t-text-muted)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Status</div>
            <select style={filterSelectStyle} value={listFilters.status} onChange={e => setF('status', e.target.value)}>
              <option value="All">All</option>
              <option value="scheduled">Scheduled</option>
              <option value="live">In Progress</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>

          {/* Date range */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--t-text-muted)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Date Range</div>
            <select style={filterSelectStyle} value={listFilters.dateRange} onChange={e => setF('dateRange', e.target.value)}>
              <option value="All">All Dates</option>
              <option value="Today">Today</option>
              <option value="This Week">This Week</option>
              <option value="This Month">This Month</option>
            </select>
          </div>

          {/* Recurring toggle */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--t-text-muted)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Recurring Only</div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', padding: '6px 0' }}>
              <input
                type="checkbox"
                checked={listFilters.recurringOnly}
                onChange={e => setF('recurringOnly', e.target.checked)}
                style={{ accentColor: '#00e5ff', width: 14, height: 14 }}
              />
              <span style={{ fontSize: 11, color: 'var(--t-text)' }}>Show only recurring</span>
            </label>
          </div>

          {/* Result count */}
          <div style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--t-text-muted)', alignSelf: 'flex-end', paddingBottom: 4 }}>
            {filteredUpcoming.length} meeting{filteredUpcoming.length !== 1 ? 's' : ''}
          </div>
        </div>
      </div>
    )
  }

  // ── UPCOMING VIEW ────────────────────────────────────────────────────────────

  function UpcomingView() {
    const grouped = {}
    filteredUpcoming.forEach(m => {
      if (!grouped[m.meeting_date]) grouped[m.meeting_date] = []
      grouped[m.meeting_date].push(m)
    })
    const dates = Object.keys(grouped).sort()

    return (
      <div>
        {/* View toggle */}
        <div style={{ display: 'flex', gap: 0, marginBottom: 16, borderBottom: '1px solid var(--t-line)' }}>
          {[
            { id: 'list',       label: 'List View' },
            { id: 'bylocation', label: 'By Location' },
          ].map(v => (
            <button
              key={v.id}
              style={{
                padding: '7px 16px', fontSize: 11, fontWeight: 700, cursor: 'pointer',
                background: 'transparent', border: 'none',
                borderBottom: upcomingView === v.id ? '2px solid #00e5ff' : '2px solid transparent',
                color: upcomingView === v.id ? '#00e5ff' : 'var(--t-text-muted)',
                letterSpacing: '0.06em', textTransform: 'uppercase',
              }}
              onClick={() => setUpcomingView(v.id)}
            >
              {v.label}
            </button>
          ))}
        </div>

        {/* Filter bar */}
        <FilterBar />

        {/* List View */}
        {upcomingView === 'list' && (
          dates.length === 0
            ? <EmptyState icon="📅" text="No meetings match your filters" sub="Adjust the filters above or schedule a new meeting" />
            : dates.map(ds => (
              <div key={ds} style={{ marginBottom: 24 }}>
                <div style={{ ...S.sectionLabel, color: ds === today ? '#2ad6a0' : 'var(--t-text-muted)', marginBottom: 10 }}>
                  {ds === today ? 'Today — ' : ''}{fmtDateLong(ds)}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {grouped[ds].map(m => (
                    <MeetingCard key={m.id} m={m} rsvpState={rsvpState} handleRsvp={handleRsvp} handleDelete={isManager ? handleDelete : null} compact={false} />
                  ))}
                </div>
              </div>
            ))
        )}

        {/* By Location View */}
        {upcomingView === 'bylocation' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 }}>
            {LOCATIONS.map(loc => {
              const locMeetings = filteredUpcoming.filter(m => m.location === loc || m.location === 'All')
              return (
                <div key={loc} style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', borderTop: `3px solid ${locColor(loc)}` }}>
                  {/* Location header */}
                  <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--t-line)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 8, height: 8, background: locColor(loc), flexShrink: 0 }} />
                      <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--t-text)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>{loc}</span>
                    </div>
                    <span style={{ fontSize: 10, color: 'var(--t-text-muted)', fontWeight: 600 }}>
                      {locMeetings.length} meeting{locMeetings.length !== 1 ? 's' : ''}
                    </span>
                  </div>

                  {/* Meeting list */}
                  <div style={{ padding: '10px 10px', maxHeight: 480, overflowY: 'auto' }}>
                    {locMeetings.length === 0
                      ? <div style={{ fontSize: 11, color: 'var(--t-text-muted)', textAlign: 'center', padding: '24px 0' }}>No upcoming meetings</div>
                      : locMeetings.map(m => (
                        <MeetingCard key={m.id} m={m} rsvpState={null} handleRsvp={null} compact={true} />
                      ))
                    }
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  // ── ATTENDEE PICKER ──────────────────────────────────────────────────────────

  function AttendeePicker({ form, setForm, employees }) {
    const toggleAttendee = (id) => {
      setForm(f => ({
        ...f,
        attendee_ids: f.attendee_ids.includes(id)
          ? f.attendee_ids.filter(x => x !== id)
          : [...f.attendee_ids, id],
      }))
    }

    const filteredEmps = employees.filter(emp => {
      const name = emp.full_name || emp.name || ''
      const role = emp.role_name || ''
      const loc  = emp.location || ''

      const matchSearch = !attSearch || name.toLowerCase().includes(attSearch.toLowerCase())
      const matchLoc    = attLocFilter === 'All' || loc === attLocFilter
      const matchRole   = attRoleFilter === 'All' || role === attRoleFilter

      return matchSearch && matchLoc && matchRole
    })

    const selectedCount = form.attendee_ids.length

    return (
      <div>
        {/* Filter bar */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8, alignItems: 'center' }}>
          <input
            placeholder="Search employees..."
            style={{ ...S.input, flex: '1 1 160px', maxWidth: 220, padding: '6px 10px', fontSize: 11 }}
            value={attSearch}
            onChange={e => setAttSearch(e.target.value)}
          />
          <select
            value={attLocFilter}
            onChange={e => setAttLocFilter(e.target.value)}
            style={{ ...S.select, width: 'auto', padding: '6px 10px', fontSize: 11 }}
          >
            <option value="All">All Locations</option>
            {LOCATIONS.map(l => <option key={l} value={l}>{l}</option>)}
          </select>
          <select
            value={attRoleFilter}
            onChange={e => setAttRoleFilter(e.target.value)}
            style={{ ...S.select, width: 'auto', padding: '6px 10px', fontSize: 11 }}
          >
            <option value="All">All Roles</option>
            <option value="Manager">Manager</option>
            <option value="Key Holder">Key Holder</option>
            <option value="Associate">Associate</option>
          </select>
          {selectedCount > 0 && (
            <button
              style={{ ...S.btnSm('#ff4d7d'), fontSize: 10, marginLeft: 'auto' }}
              onClick={() => setForm(f => ({ ...f, attendee_ids: [] }))}
            >
              Clear ({selectedCount})
            </button>
          )}
        </div>

        {/* Employee rows */}
        <div style={{ maxHeight: 280, overflowY: 'auto', border: '1px solid var(--t-line)', background: '#070b14' }}>
          {filteredEmps.length === 0 && (
            <div style={{ padding: '20px', textAlign: 'center', fontSize: 12, color: 'var(--t-text-muted)' }}>
              No employees match your filters
            </div>
          )}
          {filteredEmps.map(emp => {
            const id = emp.id
            const name = emp.full_name || emp.name
            const role = emp.role_name || 'Associate'
            const loc  = emp.location || ''
            const isSelected = form.attendee_ids.includes(id)

            return (
              <label
                key={id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '8px 12px',
                  borderBottom: '1px solid var(--t-line)',
                  cursor: 'pointer',
                  background: isSelected ? 'rgba(0,229,255,0.06)' : 'transparent',
                  transition: 'background 0.1s',
                }}
              >
                {/* Checkbox — fixed width, no float */}
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => toggleAttendee(id)}
                  style={{ width: 15, height: 15, flexShrink: 0, accentColor: '#00e5ff', cursor: 'pointer' }}
                />

                {/* Square avatar */}
                <div style={{
                  width: 28,
                  height: 28,
                  background: avatarColor(name),
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 10,
                  fontWeight: 800,
                  color: '#000',
                  flexShrink: 0,
                  borderRadius: 0,
                  userSelect: 'none',
                }}>
                  {initials(name)}
                </div>

                {/* Name */}
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--t-text)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {name}
                </span>

                {/* Role */}
                <span style={{ fontSize: 10, color: 'var(--t-text-muted)', flexShrink: 0, whiteSpace: 'nowrap' }}>
                  {role}
                </span>

                {/* Location chip */}
                {loc && (
                  <span style={{
                    fontSize: 9,
                    fontWeight: 700,
                    color: locColor(loc),
                    border: `1px solid ${locColor(loc)}`,
                    padding: '1px 5px',
                    flexShrink: 0,
                    letterSpacing: '0.05em',
                    opacity: 0.85,
                  }}>
                    {loc}
                  </span>
                )}
              </label>
            )
          })}
        </div>

        {/* Summary */}
        <div style={{ fontSize: 10, color: 'var(--t-text-muted)', marginTop: 5 }}>
          {filteredEmps.length} shown · {selectedCount} selected
        </div>
      </div>
    )
  }

  // ── SCHEDULE VIEW ────────────────────────────────────────────────────────────

  function ScheduleView() {
    const mtType = getMtgType(form.type)
    const endTime = calcEndTime(form.start_time, form.duration)
    const showVideoLink = form.meeting_type_label === 'Video' || form.meeting_type_label === 'Hybrid'

    return (
      <div style={{ maxWidth: 680 }}>
        {/* Quick templates */}
        <div style={{ marginBottom: 20 }}>
          <div style={S.sectionLabel}>Quick Templates</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {QUICK_TEMPLATES.map(t => {
              const mt = getMtgType(t.type)
              return (
                <button
                  key={t.id}
                  style={{ padding: '7px 14px', background: `rgba(${hexA(mt.color)}, 0.12)`, border: `1px solid rgba(${hexA(mt.color)}, 0.4)`, color: 'var(--t-text)', fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, borderRadius: 0 }}
                  onClick={() => applyTemplate(t)}
                >
                  {t.label}
                </button>
              )
            })}
          </div>
        </div>

        {scheduleError && (
          <div style={{ background: 'rgba(255,77,125,0.1)', border: '1px solid rgba(255,77,125,0.4)', padding: '10px 14px', fontSize: 12, color: '#ff4d7d', marginBottom: 16 }}>
            {scheduleError}
          </div>
        )}

        {/* Title */}
        <div style={S.formRow}>
          <label style={S.label}>Meeting Title *</label>
          <input style={S.input} value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Weekly Team Huddle, 1-on-1 with Jordan" />
        </div>

        {/* Type + Room */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
          <div>
            <label style={S.label}>Meeting Type</label>
            <select style={S.select} value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>
              {MTG_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}{t.needsSig ? ' ✍' : ''}</option>)}
            </select>
          </div>
          <div>
            <label style={S.label}>Room</label>
            <select style={S.select} value={form.room} onChange={e => setForm(f => ({ ...f, room: e.target.value }))}>
              {ROOM_DEFS.map(r => <option key={r.id} value={r.id}>{r.name} (seats {r.seats})</option>)}
            </select>
          </div>
        </div>

        {/* Signature warning */}
        {mtType.needsSig && (
          <div style={{ background: 'rgba(255,184,0,0.08)', border: '1px solid rgba(255,184,0,0.35)', padding: '10px 12px', fontSize: 12, color: 'rgba(255,200,100,0.9)', marginBottom: 12 }}>
            ✍ This meeting type requires signatures from all attendees during the session.
          </div>
        )}

        {/* Date + Location */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
          <div>
            <label style={S.label}>Date *</label>
            <input style={S.input} type="date" value={form.meeting_date} onChange={e => setForm(f => ({ ...f, meeting_date: e.target.value }))} />
          </div>
          <div>
            <label style={S.label}>Location</label>
            <select style={S.select} value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))}>
              <option value="All">All Locations</option>
              <option value="Orange">Orange</option>
              <option value="Hartford">Hartford</option>
              <option value="Manchester">Manchester</option>
              <option value="Southington">Southington</option>
            </select>
          </div>
        </div>

        {/* Start time + Duration */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 12 }}>
          <div>
            <label style={S.label}>Start Time</label>
            <input style={S.input} type="time" value={form.start_time} onChange={e => setForm(f => ({ ...f, start_time: e.target.value }))} />
          </div>
          <div>
            <label style={S.label}>Duration</label>
            <select style={S.select} value={form.duration} onChange={e => setForm(f => ({ ...f, duration: parseInt(e.target.value) }))}>
              <option value={15}>15 min</option>
              <option value={30}>30 min</option>
              <option value={60}>60 min</option>
              <option value={90}>90 min</option>
              <option value={120}>2 hours</option>
            </select>
          </div>
          <div>
            <label style={S.label}>End Time (auto)</label>
            <input style={{ ...S.input, color: 'var(--t-text-muted)', background: 'rgba(255,255,255,0.02)' }} value={endTime ? fmt12(endTime) : '—'} readOnly />
          </div>
        </div>

        {/* Format */}
        <div style={S.formRow}>
          <label style={S.label}>Format</label>
          <select style={S.select} value={form.meeting_type_label} onChange={e => setForm(f => ({ ...f, meeting_type_label: e.target.value }))}>
            <option value="In-person">In-person</option>
            <option value="Video">Video Call</option>
            <option value="Phone">Phone</option>
            <option value="Hybrid">Hybrid</option>
          </select>
        </div>

        {/* Video link — conditional */}
        {showVideoLink && (
          <div style={S.formRow}>
            <label style={S.label}>Video Link (Zoom / Meet / Teams)</label>
            <input style={S.input} type="url" value={form.video_link} onChange={e => setForm(f => ({ ...f, video_link: e.target.value }))} placeholder="https://zoom.us/j/..." />
          </div>
        )}

        {/* Attendees — FIXED PICKER */}
        <div style={S.formRow}>
          <label style={S.label}>Attendees ({form.attendee_ids.length} selected)</label>
          <AttendeePicker form={form} setForm={setForm} employees={employees} />
        </div>

        {/* Agenda */}
        <div style={S.formRow}>
          <label style={S.label}>Agenda</label>
          <textarea
            style={S.textarea}
            value={form.agenda}
            onChange={e => setForm(f => ({ ...f, agenda: e.target.value }))}
            placeholder={'1. Opening\n2. Discussion points\n3. Action items\n4. Next steps'}
            rows={4}
          />
        </div>

        {/* Recurring + Confidential */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
          <div>
            <label style={S.label}>Recurring</label>
            <select style={S.select} value={form.recurring} onChange={e => setForm(f => ({ ...f, recurring: e.target.value }))}>
              <option value="none">None (One-time)</option>
              <option value="weekly">Weekly</option>
              <option value="biweekly">Bi-weekly</option>
              <option value="monthly">Monthly</option>
            </select>
          </div>
          <div>
            <label style={S.label}>Confidential</label>
            <select style={S.select} value={form.confidential ? '1' : '0'} onChange={e => setForm(f => ({ ...f, confidential: e.target.value === '1' }))}>
              <option value="0">No</option>
              <option value="1">Yes — restricted access</option>
            </select>
          </div>
        </div>

        {/* Pre-note */}
        <div style={S.formRow}>
          <label style={S.label}>Pre-meeting note to attendees (optional)</label>
          <input style={S.input} value={form.pre_note} onChange={e => setForm(f => ({ ...f, pre_note: e.target.value }))} placeholder="Please bring your last review, ID, etc..." />
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
          <button style={S.btn()} onClick={handleSchedule} disabled={saving || !form.title.trim()}>
            {saving ? 'Scheduling…' : 'Schedule Meeting'}
          </button>
          <button style={S.btn('rgba(255,255,255,0.07)', 'var(--t-text)')} onClick={() => setForm({ ...BLANK_FORM, meeting_date: today })}>
            Clear Form
          </button>
        </div>
      </div>
    )
  }

  // ── MEETING NOTES VIEW ────────────────────────────────────────────────────────

  function NotesView() {
    const eligibleMeetings = [...todayMeetings, ...pastMeetings].slice(0, 50)
    const selectedMtg = resolvedMeetings.find(m => m.id === notesMeetingId)
    const agendaLines = selectedMtg ? (selectedMtg.agenda || '').split('\n').filter(Boolean) : []
    const allAttendees = selectedMtg?.attendees || []

    return (
      <div style={{ maxWidth: 760 }}>
        {/* Select meeting */}
        <div style={S.formRow}>
          <label style={S.label}>Select Meeting</label>
          <select
            style={S.select}
            value={notesMeetingId}
            onChange={e => loadNotesForMeeting(e.target.value)}
          >
            <option value="">— Select a meeting to take notes —</option>
            <optgroup label="Today">
              {todayMeetings.map(m => (
                <option key={m.id} value={m.id}>{m.title} @ {fmt12(m.start_time)}</option>
              ))}
            </optgroup>
            <optgroup label="Past Meetings">
              {pastMeetings.slice(0, 30).map(m => (
                <option key={m.id} value={m.id}>{fmtDate(m.meeting_date)} — {m.title}</option>
              ))}
            </optgroup>
          </select>
        </div>

        {!notesMeetingId && (
          <EmptyState icon="📝" text="Select a meeting to take notes" sub="Today's and past meetings appear in the dropdown above" />
        )}

        {notesMeetingId && selectedMtg && (
          <div>
            {/* Meeting context bar */}
            <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', padding: '10px 14px', marginBottom: 16, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--t-text)' }}>{selectedMtg.title}</span>
              <span style={{ fontSize: 11, color: 'var(--t-text-muted)' }}>{fmtDate(selectedMtg.meeting_date)}</span>
              {selectedMtg.start_time && <span style={{ fontSize: 11, color: 'var(--t-text-muted)' }}>{fmt12(selectedMtg.start_time)} – {fmt12(selectedMtg.end_time)}</span>}
              {selectedMtg.location && <span style={{ fontSize: 11, color: 'var(--t-text-muted)' }}>· {selectedMtg.location}</span>}
              <span className={`badge ${getMtgType(selectedMtg.type).color === '#ff4d7d' ? 'red' : getMtgType(selectedMtg.type).color === '#2ad6a0' ? 'green' : 'blue'}`} style={{ fontSize: 9 }}>{getMtgType(selectedMtg.type).label}</span>
            </div>

            {/* Attendees present */}
            {allAttendees.length > 0 && (
              <div style={{ marginBottom: 20 }}>
                <div style={S.sectionLabel}>Attendees Present</div>
                <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', padding: 12, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 6 }}>
                  {allAttendees.map((a, i) => (
                    <label key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 12, color: 'var(--t-text)', padding: '3px 0' }}>
                      <input
                        type="checkbox"
                        style={S.checkbox}
                        checked={notesPresentMap[a] !== false}
                        onChange={e => setNotesPresentMap(prev => ({ ...prev, [a]: e.target.checked }))}
                      />
                      <span style={{ ...S.avatar(AVATAR_COLORS[i % AVATAR_COLORS.length]) }}>{initials(a)}</span>
                      {a}
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* Agenda items with status cycling */}
            {agendaLines.length > 0 && (
              <div style={{ marginBottom: 20 }}>
                <div style={S.sectionLabel}>Agenda Items</div>
                <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)' }}>
                  {agendaLines.map((line, i) => {
                    const status = notesAgendaStatus[line] || 'pending'
                    return (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: i < agendaLines.length - 1 ? '1px solid var(--t-line)' : 'none' }}>
                        <div style={{ flex: 1, fontSize: 12, color: 'var(--t-text)' }}>{line}</div>
                        <button
                          onClick={() => cycleAgendaStatus(line)}
                          style={{ background: `rgba(${hexA(agendaStatusColor(status))}, 0.12)`, border: `1px solid rgba(${hexA(agendaStatusColor(status))}, 0.4)`, color: agendaStatusColor(status), padding: '4px 12px', fontSize: 10, fontWeight: 700, cursor: 'pointer', minWidth: 80, textAlign: 'center', textTransform: 'uppercase', letterSpacing: '0.06em', borderRadius: 0 }}
                        >
                          {status}
                        </button>
                      </div>
                    )
                  })}
                </div>
                <div style={{ fontSize: 10, color: 'var(--t-text-faint)', marginTop: 4 }}>Click status to cycle: Pending → Discussed → Skipped → Tabled</div>
              </div>
            )}

            {/* Action items */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <div style={S.sectionLabel}>Action Items</div>
                <button style={S.btnSm()} onClick={addActionItem}>+ Add Item</button>
              </div>
              {notesActionItems.length === 0 && (
                <div style={{ color: 'var(--t-text-faint)', fontSize: 12, padding: '12px 0' }}>No action items yet. Click + Add Item to add one.</div>
              )}
              {notesActionItems.map((ai) => (
                <div key={ai.id} style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', padding: 12, marginBottom: 6, display: 'grid', gridTemplateColumns: '1fr auto auto auto auto', gap: 8, alignItems: 'center' }}>
                  <input
                    style={{ ...S.input, fontSize: 11 }}
                    value={ai.description}
                    onChange={e => updateActionItem(ai.id, 'description', e.target.value)}
                    placeholder="Action item description..."
                  />
                  <select
                    style={{ ...S.select, width: 140, fontSize: 11 }}
                    value={ai.owner}
                    onChange={e => updateActionItem(ai.id, 'owner', e.target.value)}
                  >
                    <option value="">Owner</option>
                    {employees.map(emp => <option key={emp.id} value={emp.full_name}>{emp.full_name}</option>)}
                    {allAttendees.filter(a => !employees.find(e => e.full_name === a)).map((a, i) => (
                      <option key={'att-'+i} value={a}>{a}</option>
                    ))}
                  </select>
                  <input
                    style={{ ...S.input, width: 120, fontSize: 11 }}
                    type="date"
                    value={ai.dueDate}
                    onChange={e => updateActionItem(ai.id, 'dueDate', e.target.value)}
                  />
                  <select
                    style={{ ...S.select, width: 100, fontSize: 11 }}
                    value={ai.status}
                    onChange={e => updateActionItem(ai.id, 'status', e.target.value)}
                  >
                    <option value="open">Open</option>
                    <option value="in_progress">In Progress</option>
                    <option value="done">Done</option>
                    <option value="overdue">Overdue</option>
                  </select>
                  <button style={{ ...S.btnDanger, padding: '4px 8px', fontSize: 10 }} onClick={() => removeActionItem(ai.id)}>✕</button>
                </div>
              ))}
            </div>

            {/* Next meeting date */}
            <div style={{ ...S.formRow, maxWidth: 240 }}>
              <label style={S.label}>Next Meeting Date</label>
              <input style={S.input} type="date" value={notesNextDate} onChange={e => setNotesNextDate(e.target.value)} />
            </div>

            {/* Save + Share */}
            <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
              <button style={S.btn()} onClick={saveNotes} disabled={notesSaving}>
                {notesSaving ? 'Saving…' : 'Save Notes'}
              </button>
              <button style={S.btn('rgba(41,121,255,0.2)', '#2979ff')} onClick={shareNotes}>
                Share Notes
              </button>
            </div>
          </div>
        )}
      </div>
    )
  }

  // ── ARCHIVE VIEW ─────────────────────────────────────────────────────────────

  function ArchiveView() {
    const filtered = last30Past.filter(m => !archiveSearch || m.title.toLowerCase().includes(archiveSearch.toLowerCase()))

    return (
      <div>
        {/* Search */}
        <div style={{ marginBottom: 16 }}>
          <input
            style={{ ...S.input, maxWidth: 320 }}
            value={archiveSearch}
            onChange={e => setArchiveSearch(e.target.value)}
            placeholder="Search past meetings by title..."
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: archiveDetail ? '1fr 360px' : '1fr', gap: 16, alignItems: 'start' }}>
          {/* List */}
          <div>
            {filtered.length === 0 && (
              <EmptyState icon="📋" text="No past meetings found" sub={archiveSearch ? 'Try a different search' : 'Completed meetings appear here'} />
            )}
            {filtered.map(m => {
              const mt = getMtgType(m.type)
              const isSelected = archiveDetail?.id === m.id
              const savedNotes = notesMap[m.id] || null

              const hasNotes = savedNotes || m.notes
              const aiOpen = (savedNotes?.action_items || []).filter(ai => ai.status !== 'done')
              const aiOverdue = aiOpen.filter(ai => ai.dueDate && ai.dueDate < today)

              return (
                <div
                  key={m.id}
                  onClick={() => setArchiveDetail(isSelected ? null : m)}
                  style={{ ...S.card(isSelected ? mt.color : 'var(--t-line)', isSelected ? mt.color : mt.color + '60'), marginBottom: 6, cursor: 'pointer' }}
                  onMouseOver={e => e.currentTarget.style.background = 'rgba(255,255,255,0.03)'}
                  onMouseOut={e => e.currentTarget.style.background = 'var(--t-surface)'}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--t-text)' }}>{m.title}</span>
                        <span className={`badge ${mt.color === '#ff4d7d' ? 'red' : mt.color === '#ffb800' ? 'amber' : mt.color === '#7c4dff' ? 'purple' : 'green'}`} style={{ fontSize: 9 }}>{mt.label}</span>
                        {hasNotes && <span className="badge blue" style={{ fontSize: 9 }}>Notes</span>}
                        {aiOverdue.length > 0 && <span className="badge red" style={{ fontSize: 9 }}>{aiOverdue.length} Overdue</span>}
                        {aiOpen.length > 0 && aiOverdue.length === 0 && <span className="badge amber" style={{ fontSize: 9 }}>{aiOpen.length} Open</span>}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--t-text-muted)', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <span>{fmtDate(m.meeting_date)}</span>
                        {m.start_time && <span>{fmt12(m.start_time)} – {fmt12(m.end_time)}</span>}
                        {m.location && <span>· {m.location}</span>}
                        <span>· {m.attendee_count || m.attendees?.length || 0} attendees</span>
                      </div>
                    </div>
                    <span className={`badge ${m.status === 'completed' ? 'green' : 'blue'}`} style={{ fontSize: 9, flexShrink: 0 }}>
                      {m.status === 'completed' ? 'Done' : 'Past'}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Detail panel */}
          {archiveDetail && (
            <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', padding: 16, position: 'sticky', top: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--t-text)', flex: 1, minWidth: 0, paddingRight: 8 }}>{archiveDetail.title}</div>
                <button style={S.closeBtn} onClick={() => setArchiveDetail(null)}>✕</button>
              </div>

              {/* Meta */}
              <div style={{ fontSize: 11, color: 'var(--t-text-muted)', marginBottom: 12, display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div><strong style={{ color: 'var(--t-text)' }}>Date:</strong> {fmtDateLong(archiveDetail.meeting_date)}</div>
                {archiveDetail.start_time && <div><strong style={{ color: 'var(--t-text)' }}>Time:</strong> {fmt12(archiveDetail.start_time)} – {fmt12(archiveDetail.end_time)}</div>}
                {archiveDetail.location && <div><strong style={{ color: 'var(--t-text)' }}>Location:</strong> {archiveDetail.location}</div>}
                {archiveDetail.organizer && <div><strong style={{ color: 'var(--t-text)' }}>Organizer:</strong> {archiveDetail.organizer}</div>}
              </div>

              {/* Attendees */}
              {archiveDetail.attendees?.length > 0 && (
                <div style={{ marginBottom: 12 }}>
                  <div style={S.sectionLabel}>Attendees</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {archiveDetail.attendees.map((a, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'rgba(255,255,255,0.04)', border: '1px solid var(--t-line)', padding: '2px 6px', fontSize: 10 }}>
                        <span style={{ ...S.avatar(AVATAR_COLORS[i % AVATAR_COLORS.length]), width: 18, height: 18, fontSize: 8 }}>{initials(a)}</span>
                        {a}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Agenda */}
              {archiveDetail.agenda && (
                <div style={{ marginBottom: 12 }}>
                  <div style={S.sectionLabel}>Agenda</div>
                  <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--t-line)', padding: '8px 10px', fontSize: 11, lineHeight: 1.7, whiteSpace: 'pre-wrap', color: 'var(--t-text-muted)', maxHeight: 120, overflowY: 'auto' }}>
                    {archiveDetail.agenda}
                  </div>
                </div>
              )}

              {/* Notes from meeting_notes or the meeting record */}
              {(() => {
                const savedNotes = notesMap[archiveDetail.id] || null
                const notesText = archiveDetail.notes
                const actionItems = savedNotes?.action_items || []

                return (
                  <>
                    {notesText && (
                      <div style={{ marginBottom: 12 }}>
                        <div style={S.sectionLabel}>Meeting Notes</div>
                        <div style={{ background: 'rgba(42,214,160,0.05)', border: '1px solid rgba(42,214,160,0.2)', padding: '8px 10px', fontSize: 11, lineHeight: 1.7, whiteSpace: 'pre-wrap', color: 'var(--t-text)', maxHeight: 120, overflowY: 'auto' }}>
                          {notesText}
                        </div>
                      </div>
                    )}
                    {actionItems.length > 0 && (
                      <div style={{ marginBottom: 12 }}>
                        <div style={S.sectionLabel}>Action Items Follow-Up</div>
                        {actionItems.map((ai, i) => {
                          const isComplete = ai.status === 'done'
                          const isOverdueItem = ai.dueDate && ai.dueDate < today && !isComplete
                          return (
                            <div key={ai.id || i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '6px 0', borderBottom: i < actionItems.length - 1 ? '1px solid var(--t-line)' : 'none' }}>
                              <div style={{ width: 8, height: 8, borderRadius: '50%', background: isComplete ? '#2ad6a0' : isOverdueItem ? '#ff4d7d' : '#ffb800', marginTop: 3, flexShrink: 0 }} />
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 11, color: isComplete ? 'var(--t-text-muted)' : 'var(--t-text)', textDecoration: isComplete ? 'line-through' : 'none' }}>{ai.description}</div>
                                <div style={{ fontSize: 10, color: 'var(--t-text-faint)', marginTop: 2 }}>
                                  {ai.owner && <span>{ai.owner}</span>}
                                  {ai.dueDate && <span> · Due {fmtDate(ai.dueDate)}</span>}
                                  {isOverdueItem && <span style={{ color: '#ff4d7d' }}> · OVERDUE</span>}
                                </div>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </>
                )
              })()}

              <div style={{ display: 'flex', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
                <button
                  style={{ ...S.btnOutline('#2ad6a0'), fontSize: 11 }}
                  onClick={() => { setNotesMeetingId(archiveDetail.id); loadNotesForMeeting(archiveDetail.id); setTab('notes') }}
                >
                  Edit Notes
                </button>
                {isManager && (
                  <button style={{ ...S.btnDanger, fontSize: 11 }} onClick={() => handleDelete(archiveDetail.id)}>
                    Delete Meeting
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }

  // ── TABS CONFIG ──────────────────────────────────────────────────────────────

  const TABS = [
    { id: 'upcoming', label: `Upcoming${upcomingMeetings.length ? ` (${upcomingMeetings.length})` : ''}` },
    { id: 'schedule', label: 'Schedule Meeting' },
    { id: 'notes',    label: 'Meeting Notes' },
    { id: 'archive',  label: 'Archive' },
  ]

  // ── RENDER ───────────────────────────────────────────────────────────────────

  return (
    <div style={S.page}>
      {/* TOAST */}
      {toast && <div style={S.toast(toast.type)}>{toast.msg}</div>}

      {/* HEADER */}
      <div style={S.header}>
        <div style={S.headerLeft}>
          <div style={S.title}>Meeting Scheduler</div>
          <div style={S.subtitle}>Schedule, run, and archive team meetings — {fmtDateLong(today)}</div>
        </div>
        <div style={S.headerRight}>
          {todayMeetings.length > 0 && (
            <div style={{ textAlign: 'center', padding: '4px 14px', background: 'rgba(0,229,255,0.08)', border: '1px solid rgba(0,229,255,0.3)' }}>
              <div style={{ fontSize: 20, fontWeight: 900, color: '#00e5ff' }}>{todayMeetings.length}</div>
              <div style={{ fontSize: 9, color: 'rgba(0,229,255,0.7)', letterSpacing: '0.1em' }}>TODAY</div>
            </div>
          )}
          <button style={S.btn()} onClick={() => setTab('schedule')}>+ Schedule Meeting</button>
        </div>
      </div>

      {/* KPI BAR */}
      <div style={{ padding: '16px 20px 0', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <KTile
          label="Meetings This Month"
          value={meetingsThisMonth}
          sub={`${thisMonth.slice(5)} total`}
          color="#00e5ff"
          onClick={() => { const rows = meetings.filter(m => m.meeting_date.startsWith(thisMonth)); setDrill({ title: 'Meetings This Month', subtitle: `${rows.length} meetings`, columns: MEETING_COLS, rows, accent: '#00e5ff' }) }}
        />
        <KTile
          label="Avg Attendance %"
          value={`${avgAttendancePct}%`}
          sub="vs. room capacity"
          color={avgAttendancePct < 70 ? 'var(--t-warn)' : '#2ad6a0'}
          alert={avgAttendancePct < 70 ? 'amber' : null}
          onClick={() => { const rows = meetings.filter(m => m.attendee_count > 0); setDrill({ title: 'Attendance by Meeting', subtitle: `${rows.length} meetings with attendees`, columns: MEETING_COLS, rows, accent: '#2ad6a0' }) }}
        />
        <KTile
          label="Action Items Open"
          value={openActionItems}
          sub="across all meetings"
          color={openActionItems > 0 ? '#ffb800' : '#2ad6a0'}
          onClick={() => { const rows = allActionItems.filter(ai => ai.status !== 'done'); setDrill({ title: 'Open Action Items', subtitle: `${rows.length} items`, columns: ACTION_ITEM_COLS, rows, accent: '#ffb800' }) }}
        />
        <KTile
          label="Overdue Items"
          value={overdueActionItems}
          sub={overdueActionItems > 0 ? 'Needs attention' : 'All on track'}
          color={overdueActionItems > 0 ? 'var(--t-danger)' : '#2ad6a0'}
          alert={overdueActionItems > 0 ? 'red' : null}
          onClick={() => { const rows = allActionItems.filter(ai => ai.dueDate && ai.status !== 'done' && ai.dueDate < today); setDrill({ title: 'Overdue Action Items', subtitle: `${rows.length} items`, columns: ACTION_ITEM_COLS, rows, accent: 'var(--t-danger)' }) }}
        />
        <KTile
          label="Recurring Meetings"
          value={recurringMeetings}
          sub="weekly, biweekly, monthly"
          color="#7c4dff"
          onClick={() => { const rows = meetings.filter(m => m.recurring && m.recurring !== 'none'); setDrill({ title: 'Recurring Meetings', subtitle: `${rows.length} meetings`, columns: MEETING_COLS, rows, accent: '#7c4dff' }) }}
        />
        <KTile
          label="Meetings Today"
          value={todayMeetings.length}
          sub={todayMeetings.length > 0 ? `Next: ${fmt12(todayMeetings[0]?.start_time)}` : 'Clear day'}
          color={todayMeetings.length > 0 ? '#00e5ff' : '#2ad6a0'}
          onClick={() => setDrill({ title: "Today's Meetings", subtitle: `${todayMeetings.length} meetings`, columns: MEETING_COLS, rows: todayMeetings, accent: '#00e5ff' })}
        />
      </div>

      {/* TABS */}
      <div style={{ padding: '16px 20px 0' }}>
        <div style={S.tabs}>
          {TABS.map(t => (
            <button key={t.id} style={S.tab(tab === t.id)} onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* BODY */}
      <div style={S.body}>
        {loading ? (
          <div style={{ color: 'var(--t-text-muted)', fontSize: 13, padding: 20 }}>Loading meetings…</div>
        ) : (
          <>
            {tab === 'upcoming' && <UpcomingView />}
            {tab === 'schedule' && <ScheduleView />}
            {tab === 'notes'    && <NotesView />}
            {tab === 'archive'  && <ArchiveView />}
          </>
        )}
      </div>

      <DrillDown open={!!drill} onClose={() => setDrill(null)} {...(drill || {})} />
    </div>
  )
}
