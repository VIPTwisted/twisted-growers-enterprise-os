import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { sb } from '../lib/supabase'
import { useAuth } from '../lib/auth.jsx'
import { useScope } from '../lib/scope.jsx'
import DrillDown from '../components/DrillDown.jsx'

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

const LOCATIONS = ['Orange', 'Hartford', 'Manchester', 'Southington', 'Warehouse / Distribution']

const ZONES = ['Floor', 'Register', 'Stockroom', 'Entry']

const ALL_EMPLOYEES = [
  'Alex Rivera', 'Jordan Lee', 'Sam Torres', 'Morgan Chen', 'Casey Park',
  'Riley Kim', 'Taylor Ng', 'Drew Patel', 'Chris Wade', 'Pat Quinn',
  'Dana Mills', 'Terrell W', 'Deon Mitchell', 'Isabel Reyes', 'Kyle Brennan',
  'Priya Shah', 'Marcus Webb', 'Sandra Reyes',
]

const PUNCH_STATUSES = ['In', 'Out', 'Late', 'Off']

// ─── DETERMINISTIC MOCK ───────────────────────────────────────────────────────

function seed(a, b) {
  return ((a * 31 + b) * 17 + a * b) % 100
}

function getInitials(name) {
  return name.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase()
}

function todayKey() {
  return new Date().toISOString().split('T')[0]
}

function dateStr(d) {
  return d instanceof Date ? d.toISOString().split('T')[0] : d
}

function fmtDate(dateStr) {
  const d = new Date(dateStr + 'T12:00:00')
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

function fmtTime(iso) {
  const d = new Date(iso)
  const h = d.getHours()
  const m = String(d.getMinutes()).padStart(2, '0')
  const ampm = h >= 12 ? 'PM' : 'AM'
  return `${h % 12 || 12}:${m} ${ampm}`
}

function greeting() {
  const h = new Date().getHours()
  return h < 12 ? 'Good Morning' : h < 17 ? 'Good Afternoon' : 'Good Evening'
}

function getPast14Days() {
  const days = []
  for (let i = 0; i < 14; i++) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    days.push(dateStr(d))
  }
  return days
}

// Generate mock employee punch statuses for a given date
function getMockPunchData(dateKey) {
  return ALL_EMPLOYEES.map((name, idx) => {
    const v = seed(idx, dateKey.slice(-2))
    let status
    if (v < 5) status = 'Off'
    else if (v < 15) status = 'Late'
    else if (v < 55) status = 'In'
    else status = 'Out'
    const loc = LOCATIONS[idx % LOCATIONS.length]
    return { name, initials: getInitials(name), status, location: loc }
  })
}

// Generate mock zone assignments for a given date
function getMockZoneData(dateKey, employees) {
  return ZONES.map((zone, zi) => {
    const emp = employees[(zi + parseInt(dateKey.slice(-1), 10)) % employees.length]
    return {
      zone,
      employee: emp?.name || 'Unassigned',
      status: emp?.status === 'In' ? 'Covered' : emp?.status === 'Late' ? 'Late Arrival' : 'Uncovered',
    }
  })
}

function getMockAnnouncements() {
  return [
    { id: 1, text: 'New inventory arriving Thursday — please clear back stockroom by Wednesday close.', time: '8:02 AM', author: 'HR Ops' },
    { id: 2, text: 'Monthly one-on-ones scheduled for all full-time staff this week. Check your calendar.', time: '7:45 AM', author: 'Manager' },
    { id: 3, text: 'Loyalty program enrollment is up 18% — keep up the great work!', time: '7:30 AM', author: 'Corporate' },
    { id: 4, text: 'Dress code reminder: all team members must wear name badges at all times on the floor.', time: '7:15 AM', author: 'HR Ops' },
  ]
}

function getMockHuddleForDate(dateKey) {
  const stored = localStorage.getItem(`vip_huddle_${dateKey}`)
  if (stored) {
    try { return JSON.parse(stored) } catch (_) {}
  }
  // Deterministic mock for past dates
  const dayNum = parseInt(dateKey.replace(/-/g, ''), 10)
  const priorities = [
    [`Focus on upsell conversations — aim for 1 add-on per ticket`, `Greet every customer within 30 seconds of entry`, `Review today's product push before your shift`],
    [`Hit ${2200 + (dayNum % 600)} in sales today`, `Cross-sell memberships on every transaction`, `Keep the floor clean and organized at all times`],
    [`Train new staff on POS system during low-traffic periods`, `Run today's promotion proactively — don't wait to be asked`, `Follow up on last week's layaway orders`],
  ]
  const piSet = priorities[dayNum % priorities.length]
  return {
    priorities: piSet,
    sales_goal: 2000 + (dayNum % 1000),
    training_goal: 70 + (dayNum % 25),
    zone_assignments: Object.fromEntries(ZONES.map((z, i) => [z, ALL_EMPLOYEES[(i + dayNum) % ALL_EMPLOYEES.length]])),
    notes: dayNum % 3 === 0 ? 'End of week push — every dollar counts toward monthly ranking.' : '',
    updated_at: dateKey + 'T08:00:00.000Z',
    updated_by: 'Manager',
  }
}

// Merge a patch into today's huddle record and persist (shared by Set tab + inline edits).
function saveHuddle(dateKey, patch, userName) {
  let existing = {}
  try { const raw = localStorage.getItem(`vip_huddle_${dateKey}`); existing = raw ? JSON.parse(raw) : getMockHuddleForDate(dateKey) }
  catch { existing = getMockHuddleForDate(dateKey) }
  const next = { ...existing, ...patch, updated_at: new Date().toISOString(), updated_by: userName || 'Manager' }
  try { localStorage.setItem(`vip_huddle_${dateKey}`, JSON.stringify(next)) } catch (_) {}
  return next
}
// Manager-posted announcements (persisted separately, merged into the feed on the Today tab).
function loadLocalAnns(dateKey) {
  try { const raw = localStorage.getItem(`vip_huddle_ann_${dateKey}`); return raw ? JSON.parse(raw) : [] } catch { return [] }
}
function saveLocalAnns(dateKey, list) {
  try { localStorage.setItem(`vip_huddle_ann_${dateKey}`, JSON.stringify(list)) } catch (_) {}
}

// Small pencil "Edit" button for inline section editing (managers only).
function EditBtn({ onClick, label = '✎ Edit' }) {
  return (
    <button onClick={onClick} style={{ marginLeft: 'auto', background: 'transparent', border: '1px solid var(--t-line)', color: 'var(--t-accent)', fontSize: 10, fontWeight: 700, padding: '2px 8px', cursor: 'pointer', letterSpacing: '.04em' }}>{label}</button>
  )
}

// ─── KPI TILE ─────────────────────────────────────────────────────────────────

function KTile({ label, value, sub, color, alert, onClick }) {
  return (
    <div onClick={onClick} title={onClick ? 'Click to drill into records' : undefined} style={{
      background: 'var(--t-surface)',
      border: `1px solid ${alert === 'red' ? 'var(--t-danger)' : alert === 'amber' ? 'var(--t-warn)' : 'var(--t-line)'}`,
      padding: '14px 16px',
      position: 'relative',
      overflow: 'hidden',
      cursor: onClick ? 'pointer' : 'default',
    }}>
      {alert === 'red' && <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'var(--t-danger)' }} />}
      {alert === 'amber' && <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'var(--t-warn)' }} />}
      {!alert && <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: color || 'var(--t-accent)' }} />}
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.08em', color: 'var(--t-text-muted)', textTransform: 'uppercase', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800, color: color || 'var(--t-text)', lineHeight: 1, marginBottom: 4 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--t-text-faint)' }}>{sub}</div>}
    </div>
  )
}

// ─── PROGRESS BAR ─────────────────────────────────────────────────────────────

function ProgressBar({ pct, color }) {
  return (
    <div style={{ height: 6, background: 'var(--t-line)', borderRadius: 3, overflow: 'hidden', marginTop: 6 }}>
      <div style={{
        height: '100%',
        width: `${Math.min(100, Math.max(0, pct))}%`,
        background: color || 'var(--t-success)',
        borderRadius: 3,
        transition: 'width 0.6s ease',
      }} />
    </div>
  )
}

// ─── AVATAR ───────────────────────────────────────────────────────────────────

function Avatar({ initials, size = 32, color }) {
  return (
    <div style={{
      width: size,
      height: size,
      background: color || 'var(--t-surface-2)',
      border: '1px solid var(--t-line)',
      borderRadius: 0,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: size * 0.35,
      fontWeight: 800,
      color: 'var(--t-text)',
      flexShrink: 0,
      letterSpacing: '0.02em',
    }}>
      {initials}
    </div>
  )
}

// ─── STATUS BADGE ─────────────────────────────────────────────────────────────

function StatusBadge({ status }) {
  const map = {
    In:    { cls: 'badge green',  label: 'In' },
    Out:   { cls: 'badge red',    label: 'Out' },
    Late:  { cls: 'badge amber',  label: 'Late' },
    Off:   { cls: 'badge blue',   label: 'Off' },
    'Covered':      { cls: 'badge green',  label: 'Covered' },
    'Late Arrival': { cls: 'badge amber',  label: 'Late Arrival' },
    'Uncovered':    { cls: 'badge red',    label: 'Uncovered' },
  }
  const cfg = map[status] || { cls: 'badge blue', label: status }
  return <span className={cfg.cls}>{cfg.label}</span>
}

// ─── SECTION HEADER ───────────────────────────────────────────────────────────

function SectionHdr({ children }) {
  return (
    <div style={{
      fontSize: 10,
      fontWeight: 700,
      letterSpacing: '.1em',
      textTransform: 'uppercase',
      color: 'var(--t-text-muted)',
      borderBottom: '1px solid var(--t-line)',
      paddingBottom: 6,
      marginBottom: 12,
      marginTop: 24,
    }}>
      {children}
    </div>
  )
}

// ─── POST FEED ────────────────────────────────────────────────────────────────

function PostFeed({ dateKey, userName }) {
  const storageKey = `vip_huddle_posts_${dateKey}`
  const [posts, setPosts] = useState([])
  const [draft, setDraft] = useState('')
  const [posting, setPosting] = useState(false)
  const inputRef = useRef(null)

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey)
      if (raw) setPosts(JSON.parse(raw))
    } catch (_) {}
  }, [storageKey])

  const submit = () => {
    if (!draft.trim()) return
    setPosting(true)
    const now = new Date()
    const post = {
      id: Date.now(),
      text: draft.trim(),
      author: userName,
      time: now.toISOString(),
      displayTime: fmtTime(now.toISOString()),
    }
    const updated = [post, ...posts]
    setPosts(updated)
    try { localStorage.setItem(storageKey, JSON.stringify(updated)) } catch (_) {}
    setDraft('')
    setPosting(false)
    if (inputRef.current) inputRef.current.focus()
  }

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit() }
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <textarea
          ref={inputRef}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={handleKey}
          placeholder="Post a status update for the team… (Enter to send)"
          rows={2}
          style={{
            flex: 1,
            background: 'var(--t-surface)',
            border: '1px solid var(--t-line)',
            color: 'var(--t-text)',
            padding: '8px 10px',
            fontSize: 13,
            resize: 'none',
            fontFamily: 'inherit',
            outline: 'none',
          }}
        />
        <button
          onClick={submit}
          disabled={!draft.trim() || posting}
          style={{
            background: 'var(--t-accent)',
            color: '#000',
            border: 'none',
            padding: '0 16px',
            fontSize: 12,
            fontWeight: 700,
            cursor: draft.trim() ? 'pointer' : 'not-allowed',
            opacity: draft.trim() ? 1 : 0.5,
            alignSelf: 'stretch',
            letterSpacing: '.04em',
          }}
        >
          Post
        </button>
      </div>

      {posts.length === 0 && (
        <div style={{ color: 'var(--t-text-faint)', fontSize: 12, padding: '16px 0', textAlign: 'center' }}>
          No updates posted yet — be the first to check in.
        </div>
      )}

      {posts.map(post => (
        <div key={post.id} style={{
          background: 'var(--t-surface)',
          border: '1px solid var(--t-line)',
          padding: '10px 14px',
          marginBottom: 6,
        }}>
          <div style={{ display: 'flex', gap: 6, marginBottom: 4 }}>
            <span style={{ fontSize: 11, color: 'var(--t-accent)', fontWeight: 700, fontFamily: 'monospace' }}>
              {post.displayTime}
            </span>
            <span style={{ fontSize: 11, color: 'var(--t-text-muted)', fontWeight: 600 }}>
              {post.author}:
            </span>
          </div>
          <div style={{ fontSize: 13, color: 'var(--t-text)', lineHeight: 1.5 }}>{post.text}</div>
        </div>
      ))}
    </div>
  )
}

// ─── HUDDLE TASKS ─────────────────────────────────────────────────────────────

const PRIORITY_LABELS = { low: 'Low', normal: 'Normal', high: 'High' }
const PRIORITY_COLORS = { low: 'var(--t-text-faint)', normal: 'var(--t-accent)', high: 'var(--t-danger)' }

const DUE_OPTIONS = ['End of shift', 'Before close', 'By 3:00 PM', 'By 5:00 PM', 'By 7:00 PM', 'By 9:00 PM']

function loadTasks(locationId, dateKey) {
  try {
    const raw = localStorage.getItem(`vip_huddle_tasks_${locationId}_${dateKey}`)
    return raw ? JSON.parse(raw) : []
  } catch (_) { return [] }
}

function saveTasks(locationId, dateKey, tasks) {
  try { localStorage.setItem(`vip_huddle_tasks_${locationId}_${dateKey}`, JSON.stringify(tasks)) } catch (_) {}
}

function HuddleTasks({ isHR, locationId, dateKey }) {
  const [tasks, setTasks] = useState(() => loadTasks(locationId, dateKey))
  const [collapsed, setCollapsed] = useState(false)
  const [completedOpen, setCompletedOpen] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [toast, setToast] = useState(null)

  // Add task form state
  const [formDesc, setFormDesc] = useState('')
  const [formAssignee, setFormAssignee] = useState(ALL_EMPLOYEES[0])
  const [formDue, setFormDue] = useState('End of shift')
  const [formPriority, setFormPriority] = useState('normal')

  const persist = useCallback((next) => {
    setTasks(next)
    saveTasks(locationId, dateKey, next)
  }, [locationId, dateKey])

  const showToast = (msg) => {
    setToast(msg)
    setTimeout(() => setToast(null), 2800)
  }

  const submitTask = () => {
    if (!formDesc.trim()) return
    const task = {
      id: `task-${Date.now()}`,
      description: formDesc.trim(),
      assignee: formAssignee,
      due: formDue,
      priority: formPriority,
      complete: false,
      createdAt: new Date().toISOString(),
    }
    persist([...tasks, task])
    showToast(`Task assigned to ${formAssignee}`)
    setFormDesc('')
    setFormAssignee(ALL_EMPLOYEES[0])
    setFormDue('End of shift')
    setFormPriority('normal')
    setAddOpen(false)
  }

  const toggleComplete = (id) => {
    persist(tasks.map(t => t.id === id ? { ...t, complete: !t.complete } : t))
  }

  const open = tasks.filter(t => !t.complete)
  const done = tasks.filter(t => t.complete)

  const inputStyle = {
    background: 'var(--t-surface)',
    border: '1px solid var(--t-line)',
    color: 'var(--t-text)',
    padding: '7px 10px',
    fontSize: 12,
    fontFamily: 'inherit',
    outline: 'none',
    borderRadius: 0,
    width: '100%',
    boxSizing: 'border-box',
  }

  const selStyle = {
    background: 'var(--t-surface)',
    border: '1px solid var(--t-line)',
    color: 'var(--t-text)',
    padding: '7px 10px',
    fontSize: 12,
    fontFamily: 'inherit',
    outline: 'none',
    borderRadius: 0,
    cursor: 'pointer',
  }

  return (
    <div style={{ marginTop: 24, position: 'relative' }}>
      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed',
          bottom: 24,
          right: 24,
          background: 'var(--t-success)',
          color: '#000',
          padding: '10px 18px',
          fontSize: 13,
          fontWeight: 700,
          borderRadius: 0,
          zIndex: 9999,
          boxShadow: '0 4px 20px rgba(0,0,0,.4)',
        }}>
          {toast}
        </div>
      )}

      {/* Section header */}
      <div
        onClick={() => setCollapsed(c => !c)}
        style={{
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: '.1em',
          textTransform: 'uppercase',
          color: 'var(--t-text-muted)',
          borderBottom: '1px solid var(--t-line)',
          paddingBottom: 6,
          marginBottom: collapsed ? 0 : 12,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          userSelect: 'none',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          Huddle Tasks — Tasks for This Shift
          {open.length > 0 && (
            <span style={{
              background: open.some(t => t.priority === 'high') ? 'var(--t-danger)' : 'var(--t-accent)',
              color: '#000',
              borderRadius: 8,
              fontSize: 9,
              padding: '1px 6px',
              fontWeight: 800,
            }}>
              {open.length}
            </span>
          )}
        </div>
        <span style={{ fontSize: 11 }}>{collapsed ? '▼' : '▲'}</span>
      </div>

      {!collapsed && (
        <div>
          {/* Add Task button / form (managers only) */}
          {isHR && (
            <div style={{ marginBottom: 12 }}>
              {!addOpen ? (
                <button
                  onClick={() => setAddOpen(true)}
                  style={{
                    background: 'var(--t-accent)',
                    color: '#000',
                    border: 'none',
                    padding: '7px 16px',
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: 'pointer',
                    letterSpacing: '.04em',
                    borderRadius: 0,
                  }}
                >
                  + Add Task
                </button>
              ) : (
                <div style={{
                  background: 'var(--t-surface)',
                  border: '1px solid var(--t-line)',
                  borderLeft: '3px solid var(--t-accent)',
                  padding: '14px 16px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10,
                }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--t-text-muted)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 2 }}>
                    New Task
                  </div>
                  {/* Description */}
                  <div>
                    <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: 'var(--t-text-muted)', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 4 }}>
                      Task Description *
                    </label>
                    <input
                      style={inputStyle}
                      value={formDesc}
                      onChange={e => setFormDesc(e.target.value)}
                      placeholder="Describe the task…"
                      onKeyDown={e => { if (e.key === 'Enter') submitTask() }}
                      autoFocus
                    />
                  </div>
                  {/* Row: assignee + due + priority */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                    <div>
                      <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: 'var(--t-text-muted)', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 4 }}>
                        Assign To
                      </label>
                      <select style={selStyle} value={formAssignee} onChange={e => setFormAssignee(e.target.value)}>
                        {ALL_EMPLOYEES.map(emp => <option key={emp} value={emp}>{emp}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: 'var(--t-text-muted)', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 4 }}>
                        Due
                      </label>
                      <select style={selStyle} value={formDue} onChange={e => setFormDue(e.target.value)}>
                        {DUE_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: 'var(--t-text-muted)', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 4 }}>
                        Priority
                      </label>
                      <select style={selStyle} value={formPriority} onChange={e => setFormPriority(e.target.value)}>
                        {Object.entries(PRIORITY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                      </select>
                    </div>
                  </div>
                  {/* Actions */}
                  <div style={{ display: 'flex', gap: 8, marginTop: 2 }}>
                    <button
                      onClick={submitTask}
                      disabled={!formDesc.trim()}
                      style={{
                        background: formDesc.trim() ? 'var(--t-accent)' : 'var(--t-surface-2)',
                        color: formDesc.trim() ? '#000' : 'var(--t-text-faint)',
                        border: 'none',
                        padding: '7px 20px',
                        fontSize: 12,
                        fontWeight: 700,
                        cursor: formDesc.trim() ? 'pointer' : 'not-allowed',
                        borderRadius: 0,
                      }}
                    >
                      Assign Task
                    </button>
                    <button
                      onClick={() => setAddOpen(false)}
                      style={{
                        background: 'var(--t-surface-2)',
                        border: '1px solid var(--t-line)',
                        color: 'var(--t-text-muted)',
                        padding: '7px 14px',
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: 'pointer',
                        borderRadius: 0,
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Open tasks */}
          {open.length === 0 && done.length === 0 && (
            <div style={{ color: 'var(--t-text-faint)', fontSize: 12, padding: '12px 0', textAlign: 'center' }}>
              No tasks assigned for this shift.{isHR ? ' Click + Add Task to create one.' : ''}
            </div>
          )}

          {open.length === 0 && done.length > 0 && (
            <div style={{ color: 'var(--t-text-faint)', fontSize: 12, padding: '12px 0' }}>
              All tasks complete for this shift.
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 8 }}>
            {open.map(task => (
              <TaskRow key={task.id} task={task} onToggle={toggleComplete} />
            ))}
          </div>

          {/* Completed tasks (collapsed) */}
          {done.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <div
                onClick={() => setCompletedOpen(o => !o)}
                style={{
                  fontSize: 11,
                  color: 'var(--t-text-faint)',
                  cursor: 'pointer',
                  userSelect: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '6px 0',
                  borderTop: '1px solid var(--t-line)',
                }}
              >
                <span style={{ color: 'var(--t-success)' }}>✓</span>
                {done.length} completed {completedOpen ? '▲' : '▼'}
              </div>
              {completedOpen && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 6 }}>
                  {done.map(task => (
                    <TaskRow key={task.id} task={task} onToggle={toggleComplete} />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function TaskRow({ task, onToggle }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      background: task.complete ? 'var(--t-surface)' : 'var(--t-surface-2)',
      border: '1px solid var(--t-line)',
      borderLeft: `3px solid ${task.complete ? 'var(--t-line)' : PRIORITY_COLORS[task.priority]}`,
      padding: '9px 12px',
      opacity: task.complete ? 0.65 : 1,
      transition: 'opacity 0.2s',
    }}>
      {/* Checkbox */}
      <input
        type="checkbox"
        checked={task.complete}
        onChange={() => onToggle(task.id)}
        style={{ width: 15, height: 15, cursor: 'pointer', flexShrink: 0, accentColor: 'var(--t-success)' }}
      />
      {/* Description */}
      <div style={{
        flex: 1,
        fontSize: 13,
        color: 'var(--t-text)',
        textDecoration: task.complete ? 'line-through' : 'none',
        lineHeight: 1.4,
      }}>
        {task.description}
      </div>
      {/* Chips */}
      <div style={{ display: 'flex', gap: 6, flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
        <span style={{
          fontSize: 11,
          background: 'rgba(0,229,255,0.08)',
          border: '1px solid rgba(0,229,255,0.18)',
          color: 'var(--t-accent)',
          padding: '2px 8px',
          borderRadius: 0,
          fontWeight: 600,
        }}>
          {task.assignee}
        </span>
        <span style={{
          fontSize: 10,
          background: 'var(--t-surface-2)',
          border: '1px solid var(--t-line)',
          color: 'var(--t-text-muted)',
          padding: '2px 7px',
          borderRadius: 0,
          fontFamily: 'monospace',
        }}>
          {task.due}
        </span>
        <span style={{
          fontSize: 10,
          fontWeight: 700,
          color: PRIORITY_COLORS[task.priority],
          textTransform: 'uppercase',
          letterSpacing: '.05em',
          padding: '2px 0',
        }}>
          {PRIORITY_LABELS[task.priority]}
        </span>
      </div>
    </div>
  )
}

// ─── TAB 1: TODAY'S HUDDLE ────────────────────────────────────────────────────

function TodayHuddle({ isHR, userName, locationId, locationIds }) {
  const dk = todayKey()
  const [huddleData, setHuddleData] = useState(() => getMockHuddleForDate(dk))
  const punchData = getMockPunchData(dk)
  const zoneData = getMockZoneData(dk, punchData)

  // ── Inline editing (managers) ──────────────────────────────────────────────
  const [editPri, setEditPri] = useState(false)
  const [priDraft, setPriDraft] = useState([])
  const [editGoals, setEditGoals] = useState(false)
  const [goalDraft, setGoalDraft] = useState({ sales: 0, training: 0 })
  const [localAnns, setLocalAnns] = useState(() => loadLocalAnns(dk))
  const [annDraft, setAnnDraft] = useState('')

  const beginPri = () => { const p = huddleData?.priorities || []; setPriDraft(p.length ? [...p] : ['', '', '']); setEditPri(true) }
  const savePri = () => { setHuddleData(saveHuddle(dk, { priorities: priDraft.map(s => s.trim()).filter(Boolean) }, userName)); setEditPri(false) }
  const beginGoals = () => { setGoalDraft({ sales: huddleData?.sales_goal || 2400, training: huddleData?.training_goal || 75 }); setEditGoals(true) }
  const saveGoals = () => { setHuddleData(saveHuddle(dk, { sales_goal: Number(goalDraft.sales) || 0, training_goal: Math.min(100, Math.max(0, Number(goalDraft.training) || 0)) }, userName)); setEditGoals(false) }
  const postAnn = () => {
    if (!annDraft.trim()) return
    const next = [{ id: 'la-' + Date.now(), text: annDraft.trim(), time: fmtTime(new Date().toISOString()), author: userName }, ...localAnns]
    setLocalAnns(next); saveLocalAnns(dk, next); setAnnDraft('')
  }
  const deleteAnn = (id) => { const next = localAnns.filter(a => a.id !== id); setLocalAnns(next); saveLocalAnns(dk, next) }

  // ─── LIVE HUDDLES (Supabase get_huddles) ───────────────────────────────────
  // Maps real huddle posts into the existing announcements shape.
  // Falls back to mock announcements on error or empty result.
  const [announcements, setAnnouncements] = useState(() => getMockAnnouncements())
  useEffect(() => {
    let cancelled = false
    const nodeIds = (locationIds && locationIds.length) ? locationIds : undefined
    if (!nodeIds) return
    sb.rpc('get_huddles', { p_node_ids: nodeIds })
      .then(({ data, error }) => {
        if (cancelled) return
        if (error || !Array.isArray(data) || data.length === 0) return // keep mock
        const mapped = data.map((h, i) => ({
          id: h.id || i,
          text: h.body || h.title || '',
          time: h.created_at ? fmtTime(h.created_at) : '',
          author: h.author_name || 'Team',
        }))
        setAnnouncements(mapped)
      })
      .catch(() => { /* keep mock */ })
    return () => { cancelled = true }
  }, [locationIds])

  const inCount = punchData.filter(e => e.status === 'In').length
  const lateCount = punchData.filter(e => e.status === 'Late').length
  const offCount = punchData.filter(e => e.status === 'Off').length
  const scheduledCount = punchData.filter(e => e.status !== 'Off').length
  const coveragePct = scheduledCount > 0 ? Math.round(((inCount + lateCount) / scheduledCount) * 100) : 0

  const today = new Date()
  const todayPosts = (() => {
    try {
      const raw = localStorage.getItem(`vip_huddle_posts_${dk}`)
      if (raw) return JSON.parse(raw).length
    } catch (_) {}
    return 0
  })()

  // re-render trigger when posts change
  const [postCount, setPostCount] = useState(todayPosts)
  const refreshPosts = useCallback(() => {
    try {
      const raw = localStorage.getItem(`vip_huddle_posts_${dk}`)
      setPostCount(raw ? JSON.parse(raw).length : 0)
    } catch (_) {}
  }, [dk])

  // Open huddle tasks count — live from localStorage
  const [openTaskCount, setOpenTaskCount] = useState(() => {
    const tasks = loadTasks(locationId, dk)
    return tasks.filter(t => !t.complete).length
  })
  useEffect(() => {
    const refresh = () => {
      const tasks = loadTasks(locationId, dk)
      setOpenTaskCount(tasks.filter(t => !t.complete).length)
    }
    window.addEventListener('storage', refresh)
    return () => window.removeEventListener('storage', refresh)
  }, [locationId, dk])

  const activeAlerts = zoneData.filter(z => z.status === 'Uncovered').length

  // participation: employees who posted
  const participationPct = scheduledCount > 0 ? Math.round((Math.min(postCount + inCount * 0.4, scheduledCount) / scheduledCount) * 100) : 0

  // ── Drill-down: expose the real records behind each KPI tile ─────────────────
  const [drill, setDrill] = useState(null)
  const postRows = (() => {
    try {
      const raw = localStorage.getItem(`vip_huddle_posts_${dk}`)
      return raw ? JSON.parse(raw) : []
    } catch (_) { return [] }
  })()
  const taskRows = loadTasks(locationId, dk)

  const PUNCH_COLS = [
    { key: 'name', label: 'Employee', value: e => e.name },
    { key: 'status', label: 'Status', value: e => e.status },
    { key: 'location', label: 'Location', value: e => e.location },
    { key: 'initials', label: 'Initials', value: e => e.initials },
  ]
  const ZONE_COLS = [
    { key: 'zone', label: 'Zone', value: z => z.zone },
    { key: 'employee', label: 'Assigned Employee', value: z => z.employee },
    { key: 'status', label: 'Coverage Status', value: z => z.status },
  ]
  const POST_COLS = [
    { key: 'author', label: 'Author', value: p => p.author },
    { key: 'text', label: 'Update', value: p => p.text },
    { key: 'displayTime', label: 'Time', value: p => p.displayTime || fmtTime(p.time), sortKey: p => p.time },
  ]
  const TASK_COLS = [
    { key: 'description', label: 'Task', value: t => t.description },
    { key: 'assignee', label: 'Assigned To', value: t => t.assignee },
    { key: 'due', label: 'Due', value: t => t.due },
    { key: 'priority', label: 'Priority', value: t => PRIORITY_LABELS[t.priority] || t.priority },
    { key: 'complete', label: 'Status', value: t => (t.complete ? 'Complete' : 'Open') },
  ]
  const openDrill = (title, rows, columns, accent) => setDrill({
    title, subtitle: `${rows.length} record${rows.length === 1 ? '' : 's'}`, columns, rows, accent,
  })

  const priorities = huddleData?.priorities || []
  const salesGoal = huddleData?.sales_goal || 2400
  const trainingGoal = huddleData?.training_goal || 75

  // Mock progress values
  const salesProgress = Math.min(100, seed(dk.slice(-2), 3) + 30)
  const trainingProgress = Math.min(100, seed(dk.slice(-2), 7) + 40)

  const statusColor = {
    In:   'rgba(0,229,100,0.12)',
    Out:  'rgba(255,60,80,0.08)',
    Late: 'rgba(255,184,0,0.10)',
    Off:  'rgba(41,121,255,0.08)',
  }

  return (
    <div>
      {/* KPI Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 4 }}>
        <KTile
          label="Team Members In"
          value={inCount}
          sub={`${lateCount} late · ${offCount} off today`}
          color="var(--t-success)"
          alert={inCount < 5 ? 'amber' : null}
          onClick={() => openDrill('Team Members Clocked In', punchData.filter(e => e.status === 'In'), PUNCH_COLS, 'var(--t-success)')}
        />
        <KTile
          label="Coverage %"
          value={`${coveragePct}%`}
          sub={`${scheduledCount} scheduled today`}
          color={coveragePct >= 80 ? 'var(--t-success)' : 'var(--t-warn)'}
          alert={coveragePct < 80 ? 'amber' : null}
          onClick={() => openDrill('Scheduled Team — Coverage', punchData.filter(e => e.status !== 'Off'), PUNCH_COLS, 'var(--t-warn)')}
        />
        <KTile
          label="Today's Sales Target"
          value={`$${salesGoal.toLocaleString()}`}
          sub={`${salesProgress}% pace`}
          color="var(--t-accent)"
          onClick={() => openDrill("Today's Zone Coverage", zoneData, ZONE_COLS, 'var(--t-accent)')}
        />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 20 }}>
        <KTile
          label="Huddle Participation"
          value={`${participationPct}%`}
          sub="of scheduled team"
          color="var(--t-accent)"
          onClick={() => openDrill('Team Updates — Participation', postRows, POST_COLS, 'var(--t-accent)')}
        />
        <KTile
          label="Posts Today"
          value={postCount}
          sub="team updates"
          color="var(--t-text-muted)"
          onClick={() => openDrill('Posts Today', postRows, POST_COLS, 'var(--t-accent)')}
        />
        <KTile
          label="Active Alerts"
          value={activeAlerts}
          sub="uncovered zones"
          color={activeAlerts > 0 ? 'var(--t-danger)' : 'var(--t-success)'}
          alert={activeAlerts > 0 ? 'red' : null}
          onClick={() => openDrill('Uncovered Zones', zoneData.filter(z => z.status === 'Uncovered'), ZONE_COLS, 'var(--t-danger)')}
        />
        <KTile
          label="Open Huddle Tasks"
          value={openTaskCount}
          sub="this shift"
          color={openTaskCount > 0 ? 'var(--t-warn)' : 'var(--t-success)'}
          alert={openTaskCount > 0 ? 'amber' : null}
          onClick={() => openDrill('Open Huddle Tasks', taskRows.filter(t => !t.complete), TASK_COLS, 'var(--t-warn)')}
        />
      </div>

      <DrillDown open={!!drill} onClose={() => setDrill(null)} {...(drill || {})} />

      {/* Today's Priorities — inline editable */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, borderBottom: '1px solid var(--t-line)', paddingBottom: 6, marginTop: 24, marginBottom: 12 }}>
        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--t-text-muted)' }}>Today's Priorities</span>
        {isHR && !editPri && <EditBtn onClick={beginPri} />}
      </div>
      {editPri ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 8 }}>
          {priDraft.map((p, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <div style={{ width: 22, height: 22, background: 'var(--t-accent)', color: '#000', fontSize: 11, fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{i + 1}</div>
              <input value={p} onChange={e => setPriDraft(d => d.map((x, j) => j === i ? e.target.value : x))} placeholder={`Priority ${i + 1}…`} style={{ flex: 1, background: 'var(--t-surface)', border: '1px solid var(--t-line)', color: 'var(--t-text)', padding: '8px 10px', fontSize: 13, outline: 'none', fontFamily: 'inherit' }} />
              <button onClick={() => setPriDraft(d => d.filter((_, j) => j !== i))} title="Remove" style={{ background: 'transparent', border: '1px solid var(--t-line)', color: 'var(--t-danger)', cursor: 'pointer', padding: '5px 9px', fontSize: 12 }}>✕</button>
            </div>
          ))}
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setPriDraft(d => [...d, ''])} style={{ background: 'var(--t-surface-2)', border: '1px solid var(--t-line)', color: 'var(--t-text-muted)', padding: '6px 12px', fontSize: 12, cursor: 'pointer' }}>+ Add priority</button>
            <button onClick={savePri} style={{ background: 'var(--t-accent)', color: '#000', border: 'none', padding: '6px 18px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Save</button>
            <button onClick={() => setEditPri(false)} style={{ background: 'transparent', border: '1px solid var(--t-line)', color: 'var(--t-text-muted)', padding: '6px 12px', fontSize: 12, cursor: 'pointer' }}>Cancel</button>
          </div>
        </div>
      ) : (
        <>
          {priorities.length === 0 && (
            <div style={{ color: 'var(--t-text-faint)', fontSize: 12, padding: '12px 0' }}>
              No priorities set for today.{isHR ? ' Click ✎ Edit to add them.' : ''}
            </div>
          )}
          {priorities.map((p, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, background: 'var(--t-surface)', border: '1px solid var(--t-line)', padding: '10px 14px', marginBottom: 6 }}>
              <div style={{ width: 22, height: 22, background: 'var(--t-accent)', color: '#000', fontSize: 11, fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{i + 1}</div>
              <div style={{ fontSize: 13, color: 'var(--t-text)', lineHeight: 1.5 }}>{p}</div>
            </div>
          ))}
        </>
      )}

      {/* Who's In */}
      <SectionHdr>Who's In</SectionHdr>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 8, marginBottom: 8 }}>
        {punchData.map((emp, i) => (
          <div key={i} style={{
            background: statusColor[emp.status] || 'var(--t-surface)',
            border: '1px solid var(--t-line)',
            padding: '10px 12px',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}>
            <Avatar initials={emp.initials} size={28} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--t-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {emp.name}
              </div>
              <StatusBadge status={emp.status} />
            </div>
          </div>
        ))}
      </div>

      {/* Floor Coverage */}
      <SectionHdr>Floor Coverage</SectionHdr>
      <div style={{
        background: 'var(--t-surface)',
        border: '1px solid var(--t-line)',
        marginBottom: 4,
        overflow: 'hidden',
      }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr 120px',
          padding: '8px 14px',
          background: 'var(--t-surface-2)',
          borderBottom: '1px solid var(--t-line)',
        }}>
          {['Zone', 'Assigned Employee', 'Status'].map(h => (
            <div key={h} style={{ fontSize: 10, fontWeight: 700, color: 'var(--t-text-muted)', textTransform: 'uppercase', letterSpacing: '.08em' }}>{h}</div>
          ))}
        </div>
        {zoneData.map((row, i) => (
          <div key={i} style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr 120px',
            padding: '10px 14px',
            borderBottom: i < zoneData.length - 1 ? '1px solid var(--t-line)' : 'none',
            alignItems: 'center',
          }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--t-accent)' }}>{row.zone}</div>
            <div style={{ fontSize: 12, color: 'var(--t-text)' }}>{row.employee}</div>
            <StatusBadge status={row.status} />
          </div>
        ))}
      </div>

      {/* Today's Goals — inline editable */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, borderBottom: '1px solid var(--t-line)', paddingBottom: 6, marginTop: 24, marginBottom: 12 }}>
        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--t-text-muted)' }}>Today's Goals</span>
        {isHR && !editGoals && <EditBtn onClick={beginGoals} />}
      </div>
      {editGoals ? (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 8, background: 'var(--t-surface)', border: '1px solid var(--t-line)', padding: '14px 16px' }}>
          <div>
            <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: 'var(--t-text-muted)', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 5 }}>Sales Goal ($)</label>
            <input type="number" value={goalDraft.sales} onChange={e => setGoalDraft(g => ({ ...g, sales: e.target.value }))} style={{ width: '100%', boxSizing: 'border-box', background: 'var(--t-surface)', border: '1px solid var(--t-line)', color: 'var(--t-text)', padding: '8px 10px', fontSize: 13, outline: 'none' }} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: 'var(--t-text-muted)', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 5 }}>Training Target (%)</label>
            <input type="number" min={0} max={100} value={goalDraft.training} onChange={e => setGoalDraft(g => ({ ...g, training: e.target.value }))} style={{ width: '100%', boxSizing: 'border-box', background: 'var(--t-surface)', border: '1px solid var(--t-line)', color: 'var(--t-text)', padding: '8px 10px', fontSize: 13, outline: 'none' }} />
          </div>
          <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 8 }}>
            <button onClick={saveGoals} style={{ background: 'var(--t-accent)', color: '#000', border: 'none', padding: '6px 18px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Save</button>
            <button onClick={() => setEditGoals(false)} style={{ background: 'transparent', border: '1px solid var(--t-line)', color: 'var(--t-text-muted)', padding: '6px 12px', fontSize: 12, cursor: 'pointer' }}>Cancel</button>
          </div>
        </div>
      ) : (
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 4 }}>
        <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', padding: '14px 16px' }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--t-text-muted)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 6 }}>
            Sales Target
          </div>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--t-accent)', marginBottom: 4 }}>
            ${salesGoal.toLocaleString()}
          </div>
          <div style={{ fontSize: 11, color: 'var(--t-text-faint)', marginBottom: 4 }}>
            {salesProgress}% pace — ${Math.round(salesGoal * salesProgress / 100).toLocaleString()} of goal
          </div>
          <ProgressBar pct={salesProgress} color="var(--t-accent)" />
        </div>
        <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', padding: '14px 16px' }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--t-text-muted)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 6 }}>
            Training Completion
          </div>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--t-success)', marginBottom: 4 }}>
            {trainingGoal}% target
          </div>
          <div style={{ fontSize: 11, color: 'var(--t-text-faint)', marginBottom: 4 }}>
            {trainingProgress}% actual — {trainingProgress >= trainingGoal ? 'On track' : `${trainingGoal - trainingProgress}% below goal`}
          </div>
          <ProgressBar pct={trainingProgress} color={trainingProgress >= trainingGoal ? 'var(--t-success)' : 'var(--t-warn)'} />
        </div>
      </div>
      )}

      {/* Announcements — managers can post inline */}
      <SectionHdr>Announcements</SectionHdr>
      {isHR && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
          <input value={annDraft} onChange={e => setAnnDraft(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') postAnn() }} placeholder="Post an announcement to the team…" style={{ flex: 1, background: 'var(--t-surface)', border: '1px solid var(--t-line)', color: 'var(--t-text)', padding: '8px 10px', fontSize: 13, outline: 'none', fontFamily: 'inherit' }} />
          <button onClick={postAnn} disabled={!annDraft.trim()} style={{ background: annDraft.trim() ? 'var(--t-accent)' : 'var(--t-surface-2)', color: annDraft.trim() ? '#000' : 'var(--t-text-faint)', border: 'none', padding: '0 16px', fontSize: 12, fontWeight: 700, cursor: annDraft.trim() ? 'pointer' : 'not-allowed' }}>Post</button>
        </div>
      )}
      <div style={{ maxHeight: 240, overflowY: 'auto', marginBottom: 4 }}>
        {[...localAnns, ...announcements].map(a => {
          const isLocal = String(a.id).startsWith('la-')
          return (
            <div key={a.id} style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', borderLeft: '3px solid var(--t-accent)', padding: '10px 14px', marginBottom: 6 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, gap: 8, alignItems: 'center' }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--t-text-muted)' }}>{a.author}</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                  <span style={{ fontSize: 11, color: 'var(--t-text-faint)', fontFamily: 'monospace' }}>{a.time}</span>
                  {isLocal && isHR && <button onClick={() => deleteAnn(a.id)} title="Delete" style={{ background: 'transparent', border: 'none', color: 'var(--t-danger)', cursor: 'pointer', fontSize: 12 }}>✕</button>}
                </span>
              </div>
              <div style={{ fontSize: 13, color: 'var(--t-text)', lineHeight: 1.5 }}>{a.text}</div>
            </div>
          )
        })}
      </div>

      {/* Huddle Tasks */}
      <HuddleTasks isHR={isHR} locationId={locationId} dateKey={dk} />

      {/* Status Update Feed */}
      <SectionHdr>Team Updates</SectionHdr>
      <PostFeed dateKey={dk} userName={userName} />
    </div>
  )
}

// ─── TAB 2: ARCHIVE ───────────────────────────────────────────────────────────

function ArchiveSnapshot({ dateKey }) {
  const huddle = getMockHuddleForDate(dateKey)
  const punchData = getMockPunchData(dateKey)
  const inCount = punchData.filter(e => e.status === 'In').length
  const lateCount = punchData.filter(e => e.status === 'Late').length

  let postsCount = 0
  try {
    const raw = localStorage.getItem(`vip_huddle_posts_${dateKey}`)
    if (raw) postsCount = JSON.parse(raw).length
  } catch (_) {}

  const priorities = huddle?.priorities || []
  const salesGoal = huddle?.sales_goal || 2400
  const trainingGoal = huddle?.training_goal || 75
  const notes = huddle?.notes || ''
  const updatedBy = huddle?.updated_by || '—'

  return (
    <div style={{ padding: '0 0 24px' }}>
      <div style={{ marginBottom: 16, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <KTile label="Members In" value={inCount} sub={`${lateCount} late`} color="var(--t-success)" />
        <KTile label="Sales Goal" value={`$${salesGoal.toLocaleString()}`} sub="set target" color="var(--t-accent)" />
        <KTile label="Training Goal" value={`${trainingGoal}%`} sub="completion target" color="var(--t-text-muted)" />
        <KTile label="Posts" value={postsCount} sub="team updates" color="var(--t-text-muted)" />
      </div>

      <SectionHdr>Priorities</SectionHdr>
      {priorities.length === 0 && (
        <div style={{ color: 'var(--t-text-faint)', fontSize: 12, padding: '8px 0' }}>No priorities recorded.</div>
      )}
      {priorities.map((p, i) => (
        <div key={i} style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 10,
          marginBottom: 6,
          padding: '8px 12px',
          background: 'var(--t-surface)',
          border: '1px solid var(--t-line)',
        }}>
          <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--t-accent)', minWidth: 16 }}>{i + 1}.</span>
          <span style={{ fontSize: 12, color: 'var(--t-text)', lineHeight: 1.5 }}>{p}</span>
        </div>
      ))}

      {notes && (
        <>
          <SectionHdr>Notes</SectionHdr>
          <div style={{
            background: 'var(--t-surface)',
            border: '1px solid var(--t-line)',
            borderLeft: '3px solid var(--t-warn)',
            padding: '10px 14px',
            fontSize: 12,
            color: 'var(--t-text)',
            lineHeight: 1.6,
          }}>
            {notes}
          </div>
        </>
      )}

      <div style={{ marginTop: 20, fontSize: 11, color: 'var(--t-text-faint)' }}>
        Set by {updatedBy} · {huddle?.updated_at ? new Date(huddle.updated_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '—'}
      </div>
    </div>
  )
}

function HuddleArchive() {
  const days = getPast14Days()
  const [selectedDate, setSelectedDate] = useState(days[0])

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: 16, alignItems: 'start' }}>
      {/* Date list */}
      <div style={{
        background: 'var(--t-surface)',
        border: '1px solid var(--t-line)',
        overflow: 'hidden',
      }}>
        <div style={{
          padding: '8px 12px',
          background: 'var(--t-surface-2)',
          borderBottom: '1px solid var(--t-line)',
          fontSize: 10,
          fontWeight: 700,
          color: 'var(--t-text-muted)',
          textTransform: 'uppercase',
          letterSpacing: '.08em',
        }}>
          Past 14 Days
        </div>
        {days.map(dk => {
          const isSelected = dk === selectedDate
          const isToday = dk === todayKey()
          return (
            <div
              key={dk}
              onClick={() => setSelectedDate(dk)}
              style={{
                padding: '10px 12px',
                cursor: 'pointer',
                background: isSelected ? 'rgba(0,229,255,0.08)' : 'transparent',
                borderLeft: isSelected ? '3px solid var(--t-accent)' : '3px solid transparent',
                borderBottom: '1px solid var(--t-line)',
                transition: 'background 0.15s',
              }}
            >
              <div style={{ fontSize: 12, fontWeight: isSelected ? 700 : 500, color: isSelected ? 'var(--t-accent)' : 'var(--t-text)' }}>
                {isToday ? 'Today' : fmtDate(dk)}
              </div>
              {isToday && <div style={{ fontSize: 10, color: 'var(--t-text-muted)' }}>{dk}</div>}
            </div>
          )
        })}
      </div>

      {/* Snapshot */}
      <div>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 16,
          paddingBottom: 10,
          borderBottom: '1px solid var(--t-line)',
        }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--t-text)' }}>
              {selectedDate === todayKey() ? 'Today' : fmtDate(selectedDate)}
            </div>
            <div style={{ fontSize: 11, color: 'var(--t-text-faint)', fontFamily: 'monospace', marginTop: 2 }}>{selectedDate}</div>
          </div>
          <span className="badge blue">Archive</span>
        </div>
        <ArchiveSnapshot dateKey={selectedDate} />
      </div>
    </div>
  )
}

// ─── TAB 3: SET TODAY'S HUDDLE ────────────────────────────────────────────────

function SetHuddle({ isHR, userName }) {
  const dk = todayKey()
  const existing = getMockHuddleForDate(dk)

  const [priorities, setPriorities] = useState(existing?.priorities || ['', '', ''])
  const [salesGoal, setSalesGoal] = useState(existing?.sales_goal || 2400)
  const [trainingGoal, setTrainingGoal] = useState(existing?.training_goal || 75)
  const [zoneAssignments, setZoneAssignments] = useState(
    existing?.zone_assignments || Object.fromEntries(ZONES.map(z => [z, '']))
  )
  const [notes, setNotes] = useState(existing?.notes || '')
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)

  if (!isHR) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '60px 24px',
        textAlign: 'center',
        gap: 12,
      }}>
        <div style={{ fontSize: 32, marginBottom: 4 }}>🔒</div>
        <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--t-text)' }}>Manager Access Required</div>
        <div style={{ fontSize: 13, color: 'var(--t-text-muted)', maxWidth: 340, lineHeight: 1.6 }}>
          Setting the daily huddle is restricted to managers, HR, and above.
          Contact your manager to update today's priorities and assignments.
        </div>
      </div>
    )
  }

  const setPriority = (idx, val) => {
    setPriorities(prev => prev.map((p, i) => i === idx ? val : p))
  }

  const setZone = (zone, emp) => {
    setZoneAssignments(prev => ({ ...prev, [zone]: emp }))
  }

  const handleSave = () => {
    setSaving(true)
    const data = {
      priorities: priorities.filter(p => p.trim()),
      sales_goal: salesGoal,
      training_goal: trainingGoal,
      zone_assignments: zoneAssignments,
      notes,
      updated_at: new Date().toISOString(),
      updated_by: userName,
    }
    try {
      localStorage.setItem(`vip_huddle_${dk}`, JSON.stringify(data))
    } catch (_) {}
    setTimeout(() => {
      setSaving(false)
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    }, 400)
  }

  const inputStyle = {
    width: '100%',
    background: 'var(--t-surface)',
    border: '1px solid var(--t-line)',
    color: 'var(--t-text)',
    padding: '8px 10px',
    fontSize: 13,
    boxSizing: 'border-box',
    fontFamily: 'inherit',
    outline: 'none',
  }

  const selectStyle = {
    ...inputStyle,
    cursor: 'pointer',
  }

  const labelStyle = {
    display: 'block',
    fontSize: 10,
    fontWeight: 700,
    color: 'var(--t-text-muted)',
    textTransform: 'uppercase',
    letterSpacing: '.08em',
    marginBottom: 5,
    marginTop: 14,
  }

  return (
    <div style={{ maxWidth: 680 }}>
      <div style={{
        background: 'rgba(0,229,255,0.04)',
        border: '1px solid rgba(0,229,255,0.18)',
        padding: '10px 14px',
        marginBottom: 20,
        fontSize: 12,
        color: 'var(--t-text-muted)',
        lineHeight: 1.6,
      }}>
        Setting today's huddle for <strong style={{ color: 'var(--t-text)' }}>{fmtDate(dk)}</strong>.
        Changes save to localStorage and appear immediately on the Today's Huddle tab.
      </div>

      {/* Priorities */}
      <SectionHdr>3 Focus Priorities</SectionHdr>
      {[0, 1, 2].map(i => (
        <div key={i} style={{ marginBottom: 8 }}>
          <label style={labelStyle}>Priority {i + 1}</label>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <div style={{
              width: 22,
              height: 22,
              background: 'var(--t-accent)',
              color: '#000',
              fontSize: 11,
              fontWeight: 900,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}>
              {i + 1}
            </div>
            <input
              style={inputStyle}
              value={priorities[i] || ''}
              onChange={e => setPriority(i, e.target.value)}
              placeholder={`Enter priority ${i + 1} for today…`}
            />
          </div>
        </div>
      ))}

      {/* Goals */}
      <SectionHdr>Daily Goals</SectionHdr>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div>
          <label style={labelStyle}>Sales Goal ($)</label>
          <input
            style={inputStyle}
            type="number"
            value={salesGoal}
            onChange={e => setSalesGoal(Number(e.target.value))}
            min={0}
          />
          <div style={{ fontSize: 10, color: 'var(--t-text-faint)', marginTop: 4 }}>
            Displays as target on Today tab
          </div>
        </div>
        <div>
          <label style={labelStyle}>Training Completion Target (%)</label>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              style={{ ...inputStyle, width: 80 }}
              type="number"
              value={trainingGoal}
              onChange={e => setTrainingGoal(Math.min(100, Math.max(0, Number(e.target.value))))}
              min={0}
              max={100}
            />
            <div style={{ flex: 1 }}>
              <ProgressBar pct={trainingGoal} color="var(--t-success)" />
              <div style={{ fontSize: 10, color: 'var(--t-text-faint)', marginTop: 3 }}>{trainingGoal}% goal</div>
            </div>
          </div>
        </div>
      </div>

      {/* Zone Assignments */}
      <SectionHdr>Zone Assignments</SectionHdr>
      <div style={{
        background: 'var(--t-surface)',
        border: '1px solid var(--t-line)',
        overflow: 'hidden',
        marginBottom: 4,
      }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: '130px 1fr',
          padding: '8px 14px',
          background: 'var(--t-surface-2)',
          borderBottom: '1px solid var(--t-line)',
        }}>
          {['Zone', 'Assigned Employee'].map(h => (
            <div key={h} style={{ fontSize: 10, fontWeight: 700, color: 'var(--t-text-muted)', textTransform: 'uppercase', letterSpacing: '.08em' }}>{h}</div>
          ))}
        </div>
        {ZONES.map((zone, i) => (
          <div key={zone} style={{
            display: 'grid',
            gridTemplateColumns: '130px 1fr',
            padding: '10px 14px',
            borderBottom: i < ZONES.length - 1 ? '1px solid var(--t-line)' : 'none',
            alignItems: 'center',
            gap: 12,
          }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--t-accent)' }}>{zone}</div>
            <select
              style={selectStyle}
              value={zoneAssignments[zone] || ''}
              onChange={e => setZone(zone, e.target.value)}
            >
              <option value="">— Unassigned —</option>
              {ALL_EMPLOYEES.map(emp => (
                <option key={emp} value={emp}>{emp}</option>
              ))}
            </select>
          </div>
        ))}
      </div>

      {/* Notes */}
      <SectionHdr>Special Notes</SectionHdr>
      <textarea
        style={{
          ...inputStyle,
          minHeight: 80,
          resize: 'vertical',
        }}
        value={notes}
        onChange={e => setNotes(e.target.value)}
        placeholder="Optional notes for the team — reminders, shift context, policy updates…"
      />

      {/* Save */}
      <div style={{ marginTop: 20, display: 'flex', gap: 10, alignItems: 'center' }}>
        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            background: saved ? 'var(--t-success)' : 'var(--t-accent)',
            color: '#000',
            border: 'none',
            padding: '10px 28px',
            fontSize: 13,
            fontWeight: 700,
            cursor: saving ? 'wait' : 'pointer',
            letterSpacing: '.04em',
            opacity: saving ? 0.7 : 1,
            transition: 'background 0.2s',
          }}
        >
          {saving ? 'Saving…' : saved ? '✓ Saved!' : 'Save Today\'s Huddle'}
        </button>
        {saved && (
          <span style={{ fontSize: 12, color: 'var(--t-success)' }}>
            Huddle board updated — team will see it immediately.
          </span>
        )}
      </div>
    </div>
  )
}

// ─── MAIN EXPORT ──────────────────────────────────────────────────────────────

export default function Huddle() {
  const { session } = useAuth()
  const { locationIds } = useScope()

  const r = (session?.person?.role_name || '').toLowerCase()
  const isHR = ['ceo', 'hr', 'manager', 'coo', 'admin', 'owner'].some(x => (r || '').toLowerCase().includes(x))
  const userName = session?.person?.full_name || session?.person?.name || 'Team Member'

  const [tab, setTab] = useState('today')

  const today = new Date()
  const dateLabel = today.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })

  const TABS = [
    { id: 'today',   label: "Today's Huddle" },
    { id: 'archive', label: 'Huddle Archive' },
    { id: 'set',     label: isHR ? 'Set Today\'s Huddle' : '🔒 Set Today\'s Huddle' },
  ]

  return (
    <div style={{
      background: 'var(--t-bg)',
      minHeight: '100vh',
      fontFamily: 'var(--font-sans, system-ui, sans-serif)',
      color: 'var(--t-text)',
      paddingBottom: 60,
    }}>
      {/* Page Header */}
      <div style={{
        background: 'linear-gradient(135deg, #070b14 0%, #0d1117 100%)',
        borderBottom: '1px solid var(--t-line)',
        padding: '20px 24px 0',
      }}>
        <div style={{ marginBottom: 16 }}>
          <div style={{
            fontSize: 22,
            fontWeight: 800,
            color: 'var(--t-text)',
            letterSpacing: '-0.02em',
            lineHeight: 1.2,
            marginBottom: 4,
          }}>
            Daily Huddle
          </div>
          <div style={{
            fontSize: 12,
            color: 'var(--t-text-muted)',
            fontFamily: 'monospace',
          }}>
            {greeting()}, {userName} · {dateLabel}
          </div>
        </div>

        {/* Tab bar */}
        <div style={{ display: 'flex', gap: 0 }}>
          {TABS.map(t => {
            const active = t.id === tab
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  borderBottom: active ? '2px solid var(--t-accent)' : '2px solid transparent',
                  color: active ? 'var(--t-accent)' : 'var(--t-text-muted)',
                  padding: '10px 18px',
                  fontSize: 12,
                  fontWeight: active ? 700 : 500,
                  cursor: 'pointer',
                  letterSpacing: '.04em',
                  transition: 'color 0.15s, border-color 0.15s',
                  fontFamily: 'inherit',
                }}
              >
                {t.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Tab Content */}
      <div style={{ padding: '20px 24px' }}>
        {tab === 'today'   && <TodayHuddle isHR={isHR} userName={userName} locationId={locationIds?.[0] || 'all'} locationIds={locationIds} />}
        {tab === 'archive' && <HuddleArchive />}
        {tab === 'set'     && <SetHuddle isHR={isHR} userName={userName} />}
      </div>
    </div>
  )
}
