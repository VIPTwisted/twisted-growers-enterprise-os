// Huddle.jsx — the daily huddle: board (priorities, goals, notes), who is in, zone coverage,
// announcements, tasks, team updates, a 14-day archive and the manager's set-up tab.
// EVERYTHING IS A ROW (Bible §12g, 14 Sep 2026). One read per day — hr.huddle_day() — returns
// the board (hr.huddle_boards), posts, tasks, announcements, the measured punch board
// (hr.punch_board: hr.time_punches + the OS clock + the posted schedule), the OS zones with the
// day's hr.zone_assignments, the day's revenue facts and training completion. Writers are the
// hr RPCs that already existed (set_huddle_board, post_huddle_post, create_huddle_task,
// set_huddle_task_complete, delete_huddle_task, post_huddle_announcement,
// delete_huddle_announcement, set_zone_assignment). Nothing lives in localStorage any more;
// nothing is drawn from a seed. An empty day says it is empty.
import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { sb } from '../lib/supabase'
import { useAuth } from '../lib/auth.jsx'
import { useScope } from '../lib/scope.jsx'
import DrillDown from '../components/DrillDown.jsx'

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

const PUNCH_STATUSES = ['In', 'Out', 'Late', 'Off']

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

// ─── THE DAY STORE ────────────────────────────────────────────────────────────
// One call reads the whole day; every writer calls reload() so the screen shows what the
// table holds, not what it hoped it wrote.
function useHuddleDay(locationIds, dateKey) {
  const [day, setDay] = useState(null)      // null = loading
  const [error, setError] = useState('')
  const [tick, setTick] = useState(0)
  const reload = useCallback(() => setTick(t => t + 1), [])
  const key = JSON.stringify(locationIds || [])
  useEffect(() => {
    let live = true
    if (!locationIds || !locationIds.length) { setDay({ punches: [], zones: [], posts: [], tasks: [], announcements: [], board: null }); return undefined }
    sb.rpc('huddle_day', { p_node_ids: locationIds, p_date: dateKey }).then(({ data, error: e }) => {
      if (!live) return
      if (e) { setError(e.message); setDay({ punches: [], zones: [], posts: [], tasks: [], announcements: [], board: null }); return }
      setError('')
      setDay(data || { punches: [], zones: [], posts: [], tasks: [], announcements: [], board: null })
    })
    return () => { live = false }
  }, [key, dateKey, tick])
  return { day, error, reload }
}
const punchRows = (day) => (day?.punches || []).map(e => ({ ...e, initials: getInitials(e.name || '') }))
const zoneRows = (day) => (day?.zones || []).map(z => ({ zone: z.zone, department: z.department, employee: z.employee || 'Unassigned', status: z.status }))
const postRowsOf = (day) => (day?.posts || []).map(p => ({ id: p.id, text: p.body, author: p.author_name || '—', time: p.created_at, displayTime: p.created_at ? fmtTime(p.created_at) : '' }))
const taskRowsOf = (day) => (day?.tasks || []).map(t => ({ id: t.id, description: t.description, assignee: t.assignee_name || '—', assigneeId: t.assignee_id, due: t.due_label, priority: t.priority || 'normal', complete: !!t.is_complete, createdAt: t.created_at }))
const annRowsOf = (day) => (day?.announcements || []).map(a => ({ id: a.id, text: a.body, author: a.author_name || '—', time: a.created_at ? fmtTime(a.created_at) : '' }))
const rpcOk = (res) => !res?.error && (res?.data == null || res.data.ok !== false)
const rpcWhy = (res) => res?.error?.message || res?.data?.error || 'not saved'

// The roster in scope, for assignee pickers (rows, not a list of names in the code).
function useRoster(locationIds, actorId) {
  const [roster, setRoster] = useState([])
  const key = JSON.stringify(locationIds || [])
  useEffect(() => {
    let live = true
    sb.rpc('get_roster', { p_node_ids: locationIds || [], p_actor: actorId || null }).then(({ data }) => {
      if (live && Array.isArray(data)) setRoster(data.filter(p => p.id && p.is_active !== false))
    })
    return () => { live = false }
  }, [key, actorId])
  return roster
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

function PostFeed({ dateKey, userName, userId, nodeId, posts, reload }) {
  const [draft, setDraft] = useState('')
  const [posting, setPosting] = useState(false)
  const [err, setErr] = useState('')
  const inputRef = useRef(null)

  const submit = async () => {
    if (!draft.trim() || posting) return
    setPosting(true); setErr('')
    const res = await sb.rpc('post_huddle_post', { p_node_id: nodeId, p_date: dateKey, p_body: draft.trim(), p_author_name: userName, p_author_id: userId || null })
    setPosting(false)
    if (!rpcOk(res)) { setErr(rpcWhy(res)); return }
    setDraft('')
    reload()
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

      {err && <div style={{ fontSize: 11, color: 'var(--t-danger)', marginBottom: 8 }}>Not posted — {err}</div>}
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

function HuddleTasks({ isHR, locationId, dateKey, tasks, reload, roster, userName, userId }) {
  const [collapsed, setCollapsed] = useState(false)
  const [completedOpen, setCompletedOpen] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [toast, setToast] = useState(null)

  // Add task form state
  const [formDesc, setFormDesc] = useState('')
  const [formAssignee, setFormAssignee] = useState('')
  const [formDue, setFormDue] = useState('End of shift')
  const [formPriority, setFormPriority] = useState('normal')
  const [busy, setBusy] = useState(false)

  const showToast = (msg) => {
    setToast(msg)
    setTimeout(() => setToast(null), 2800)
  }

  const submitTask = async () => {
    if (!formDesc.trim() || busy) return
    const who = roster.find(r => r.id === formAssignee)
    setBusy(true)
    const res = await sb.rpc('create_huddle_task', { p_node_id: locationId, p_date: dateKey, p_description: formDesc.trim(), p_assignee_name: who?.full_name || null, p_assignee_id: who?.id || null, p_due_label: formDue, p_priority: formPriority, p_created_by: userName })
    setBusy(false)
    if (!rpcOk(res)) { showToast(`Not saved — ${rpcWhy(res)}`); return }
    showToast(who ? `Task assigned to ${who.full_name}` : 'Task recorded')
    setFormDesc('')
    setFormAssignee('')
    setFormDue('End of shift')
    setFormPriority('normal')
    setAddOpen(false)
    reload()
  }

  const toggleComplete = async (id) => {
    const t = tasks.find(x => x.id === id)
    const res = await sb.rpc('set_huddle_task_complete', { p_id: id, p_complete: !t?.complete })
    if (!rpcOk(res)) { showToast(`Not saved — ${rpcWhy(res)}`); return }
    reload()
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
                        <option value="">— Whole team —</option>
                        {roster.map(emp => <option key={emp.id} value={emp.id}>{emp.full_name}</option>)}
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

function TodayHuddle({ isHR, userName, userId, locationId, locationIds }) {
  const dk = todayKey()
  const { day, error: dayError, reload } = useHuddleDay(locationIds, dk)
  const roster = useRoster(locationIds, userId)
  const huddleData = day?.board || null
  const punchData = useMemo(() => punchRows(day), [day])
  const zoneData = useMemo(() => zoneRows(day), [day])
  const localAnns = useMemo(() => annRowsOf(day), [day])
  const postRows = useMemo(() => postRowsOf(day), [day])
  const taskRows = useMemo(() => taskRowsOf(day), [day])
  const [saveErr, setSaveErr] = useState('')
  const saveBoard = async (patch) => {
    setSaveErr('')
    const res = await sb.rpc('set_huddle_board', { p_node_id: locationId, p_date: dk, p_priorities: patch.priorities ?? null, p_sales_goal: patch.sales_goal ?? null, p_training_goal: patch.training_goal ?? null, p_notes: patch.notes ?? null, p_updated_by: userName, p_updated_by_id: userId || null })
    if (!rpcOk(res)) { setSaveErr(rpcWhy(res)); return false }
    reload(); return true
  }

  // ── Inline editing (managers) ──────────────────────────────────────────────
  const [editPri, setEditPri] = useState(false)
  const [priDraft, setPriDraft] = useState([])
  const [editGoals, setEditGoals] = useState(false)
  const [goalDraft, setGoalDraft] = useState({ sales: 0, training: 0 })
  const [annDraft, setAnnDraft] = useState('')

  const beginPri = () => { const p = huddleData?.priorities || []; setPriDraft(p.length ? [...p] : ['', '', '']); setEditPri(true) }
  const savePri = async () => { if (await saveBoard({ priorities: priDraft.map(s => s.trim()).filter(Boolean) })) setEditPri(false) }
  const beginGoals = () => { setGoalDraft({ sales: huddleData?.sales_goal ?? '', training: huddleData?.training_goal ?? '' }); setEditGoals(true) }
  const saveGoals = async () => { if (await saveBoard({ sales_goal: Number(goalDraft.sales) || 0, training_goal: Math.min(100, Math.max(0, Number(goalDraft.training) || 0)) })) setEditGoals(false) }
  const postAnn = async () => {
    if (!annDraft.trim()) return
    const res = await sb.rpc('post_huddle_announcement', { p_node_id: locationId, p_date: dk, p_body: annDraft.trim(), p_author_name: userName, p_author_id: userId || null })
    if (!rpcOk(res)) { setSaveErr(rpcWhy(res)); return }
    setAnnDraft(''); reload()
  }
  const deleteAnn = async (id) => {
    const res = await sb.rpc('delete_huddle_announcement', { p_id: id, p_actor: userId || null })
    if (!rpcOk(res)) { setSaveErr(rpcWhy(res)); return }
    reload()
  }

  // Standing huddles (hr.get_huddles — pinned notes that are not tied to one day).
  const [announcements, setAnnouncements] = useState([])
  useEffect(() => {
    let cancelled = false
    const nodeIds = (locationIds && locationIds.length) ? locationIds : undefined
    if (!nodeIds) return
    sb.rpc('get_huddles', { p_node_ids: nodeIds })
      .then(({ data, error }) => {
        if (cancelled || error || !Array.isArray(data)) return
        setAnnouncements(data.map((h, i) => ({ id: h.id || i, text: h.body || h.title || '', time: h.created_at ? fmtTime(h.created_at) : '', author: h.author_name || 'Team' })))
      })
    return () => { cancelled = true }
  }, [JSON.stringify(locationIds)])

  const inCount = punchData.filter(e => e.status === 'In').length
  const lateCount = punchData.filter(e => e.status === 'Late').length
  const offCount = punchData.filter(e => e.status === 'Off').length
  const scheduledCount = punchData.filter(e => e.status !== 'Off').length
  const coveragePct = scheduledCount > 0 ? Math.round(((inCount + lateCount) / scheduledCount) * 100) : 0

  const today = new Date()
  const postCount = postRows.length
  const openTaskCount = taskRows.filter(t => !t.complete).length
  const activeAlerts = zoneData.filter(z => z.status === 'Uncovered').length

  // participation: people who posted a team update today, over the people scheduled
  const posters = new Set(postRows.map(p => p.author))
  const participationPct = scheduledCount > 0 ? Math.round((Math.min(posters.size, scheduledCount) / scheduledCount) * 100) : 0

  // ── Drill-down: expose the real records behind each KPI tile ─────────────────
  const [drill, setDrill] = useState(null)

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
  const salesGoal = huddleData?.sales_goal == null ? null : Number(huddleData.sales_goal)
  const trainingGoal = huddleData?.training_goal == null ? null : Number(huddleData.training_goal)

  // Measured progress: revenue facts recorded for today, training completion across the team
  const salesActual = day?.sales_actual == null ? null : Number(day.sales_actual)
  const salesProgress = salesGoal && salesActual != null ? Math.min(100, Math.round(salesActual / salesGoal * 100)) : null
  const trainingProgress = day?.training_pct == null ? null : Number(day.training_pct)

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
          value={salesGoal == null ? '—' : `$${salesGoal.toLocaleString()}`}
          sub={salesGoal == null ? 'no goal set — use Set Today’s Huddle' : salesProgress == null ? 'no revenue recorded today' : `${salesProgress}% pace`}
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
            {salesGoal == null ? '—' : `$${salesGoal.toLocaleString()}`}
          </div>
          <div style={{ fontSize: 11, color: 'var(--t-text-faint)', marginBottom: 4 }}>
            {salesGoal == null ? 'No goal set for today.' : salesProgress == null ? 'No revenue recorded for today yet.' : `${salesProgress}% pace — $${Math.round(salesActual).toLocaleString()} of goal`}
          </div>
          <ProgressBar pct={salesProgress || 0} color="var(--t-accent)" />
        </div>
        <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', padding: '14px 16px' }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--t-text-muted)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 6 }}>
            Training Completion
          </div>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--t-success)', marginBottom: 4 }}>
            {trainingGoal == null ? '—' : `${trainingGoal}% target`}
          </div>
          <div style={{ fontSize: 11, color: 'var(--t-text-faint)', marginBottom: 4 }}>
            {trainingProgress == null ? 'No training records yet.' : trainingGoal == null ? `${trainingProgress}% complete — no goal set` : `${trainingProgress}% actual — ${trainingProgress >= trainingGoal ? 'On track' : `${trainingGoal - trainingProgress}% below goal`}`}
          </div>
          <ProgressBar pct={trainingProgress || 0} color={trainingGoal != null && trainingProgress != null && trainingProgress >= trainingGoal ? 'var(--t-success)' : 'var(--t-warn)'} />
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
        {day === null && <div style={{ fontSize: 12, color: 'var(--t-text-faint)', padding: '8px 0' }}>Reading today…</div>}
        {dayError && <div style={{ fontSize: 12, color: 'var(--t-danger)', padding: '8px 0' }}>Could not read the huddle: {dayError}</div>}
        {saveErr && <div style={{ fontSize: 12, color: 'var(--t-danger)', padding: '8px 0' }}>Not saved — {saveErr}</div>}
        {day && localAnns.length + announcements.length === 0 && <div style={{ fontSize: 12, color: 'var(--t-text-faint)', padding: '8px 0' }}>No announcements today.</div>}
        {[...localAnns, ...announcements].map(a => {
          const isLocal = localAnns.some(x => x.id === a.id)
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
      <HuddleTasks isHR={isHR} locationId={locationId} dateKey={dk} tasks={taskRows} reload={reload} roster={roster} userName={userName} userId={userId} />

      {/* Status Update Feed */}
      <SectionHdr>Team Updates</SectionHdr>
      <PostFeed dateKey={dk} userName={userName} userId={userId} nodeId={locationId} posts={postRows} reload={reload} />
    </div>
  )
}

// ─── TAB 2: ARCHIVE ───────────────────────────────────────────────────────────

function ArchiveSnapshot({ dateKey, locationIds }) {
  const { day } = useHuddleDay(locationIds, dateKey)
  const huddle = day?.board || null
  const punchData = punchRows(day)
  const inCount = punchData.filter(e => e.status === 'In' || e.status === 'Late' || (e.status === 'Out' && e.in_at)).length
  const lateCount = punchData.filter(e => e.status === 'Late' || (e.late_minutes || 0) > 0).length
  const postsCount = (day?.posts || []).length
  const priorities = huddle?.priorities || []
  const salesGoal = huddle?.sales_goal == null ? null : Number(huddle.sales_goal)
  const trainingGoal = huddle?.training_goal == null ? null : Number(huddle.training_goal)
  const notes = huddle?.notes || ''
  const updatedBy = huddle?.updated_by || '—'
  if (day === null) return <div style={{ color: 'var(--t-text-faint)', fontSize: 12, padding: '8px 0' }}>Reading {dateKey}…</div>

  return (
    <div style={{ padding: '0 0 24px' }}>
      <div style={{ marginBottom: 16, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <KTile label="Members In" value={inCount} sub={`${lateCount} late`} color="var(--t-success)" />
        <KTile label="Sales Goal" value={salesGoal == null ? '—' : `$${salesGoal.toLocaleString()}`} sub={salesGoal == null ? 'not set' : 'set target'} color="var(--t-accent)" />
        <KTile label="Training Goal" value={trainingGoal == null ? '—' : `${trainingGoal}%`} sub={trainingGoal == null ? 'not set' : 'completion target'} color="var(--t-text-muted)" />
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

function HuddleArchive({ locationIds }) {
  const days = getPast14Days()
  const [selectedDate, setSelectedDate] = useState(days[0])
  const [counts, setCounts] = useState({})
  useEffect(() => {
    let live = true
    if (!locationIds?.length) return undefined
    sb.rpc('huddle_archive', { p_node_ids: locationIds, p_from: days[days.length - 1], p_to: days[0] }).then(({ data }) => {
      if (!live || !Array.isArray(data)) return
      const m = {}; for (const r of data) m[r.date] = r; setCounts(m)
    })
    return () => { live = false }
  }, [JSON.stringify(locationIds)])

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
              {counts[dk] && (counts[dk].board || counts[dk].posts > 0 || counts[dk].tasks > 0) && <div style={{ fontSize: 10, color: 'var(--t-text-faint)' }}>{counts[dk].board ? 'board · ' : ''}{counts[dk].posts} posts · {counts[dk].tasks} tasks</div>}
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
        <ArchiveSnapshot dateKey={selectedDate} locationIds={locationIds} />
      </div>
    </div>
  )
}

// ─── TAB 3: SET TODAY'S HUDDLE ────────────────────────────────────────────────

function SetHuddle({ isHR, userName, userId, locationId, locationIds }) {
  const dk = todayKey()
  const { day, reload } = useHuddleDay(locationIds, dk)
  const roster = useRoster(locationIds, userId)
  const existing = day?.board || null
  const ZONES = useMemo(() => (day?.zones || []).map(z => z.zone), [day])

  const [priorities, setPriorities] = useState(['', '', ''])
  const [salesGoal, setSalesGoal] = useState('')
  const [trainingGoal, setTrainingGoal] = useState('')
  const [zoneAssignments, setZoneAssignments] = useState({})
  const [notes, setNotes] = useState('')
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveErr, setSaveErr] = useState('')
  const [loadedKey, setLoadedKey] = useState('')
  // fill the form from the rows once per day read (not on every re-render)
  useEffect(() => {
    if (!day) return
    const k = dk + ':' + (existing?.updated_at || 'none')
    if (k === loadedKey) return
    setLoadedKey(k)
    const p = existing?.priorities || []
    setPriorities(p.length ? [...p] : ['', '', ''])
    setSalesGoal(existing?.sales_goal ?? '')
    setTrainingGoal(existing?.training_goal ?? '')
    setNotes(existing?.notes || '')
    setZoneAssignments(Object.fromEntries((day.zones || []).map(z => [z.zone, z.person_id || ''])))
  }, [day, dk])

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

  const handleSave = async () => {
    if (saving) return
    setSaving(true); setSaveErr('')
    const res = await sb.rpc('set_huddle_board', {
      p_node_id: locationId, p_date: dk,
      p_priorities: priorities.map(p => p.trim()).filter(Boolean),
      p_sales_goal: salesGoal === '' ? null : Number(salesGoal),
      p_training_goal: trainingGoal === '' ? null : Math.min(100, Math.max(0, Number(trainingGoal))),
      p_notes: notes, p_updated_by: userName, p_updated_by_id: userId || null,
    })
    if (!rpcOk(res)) { setSaving(false); setSaveErr(rpcWhy(res)); return }
    // zone assignments: one row per zone with a person (set_zone_assignment writes hr.zone_assignments)
    for (const [zone, personId] of Object.entries(zoneAssignments)) {
      const before = (day?.zones || []).find(z => z.zone === zone)?.person_id || ''
      if (!personId || personId === before) continue
      const who = roster.find(r => r.id === personId)
      const z = await sb.rpc('set_zone_assignment', { p_node_id: locationId, p_zone: zone, p_employee_name: who?.full_name || '', p_date: dk, p_start_time: null, p_end_time: null, p_assigned_by: userId || null, p_person_id: personId })
      if (!rpcOk(z)) { setSaving(false); setSaveErr(`${zone}: ${rpcWhy(z)}`); return }
    }
    setSaving(false)
    setSaved(true)
    reload()
    setTimeout(() => setSaved(false), 3000)
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
        Saved as rows in the HR platform (hr.huddle_boards, hr.zone_assignments) and shown on the Today tab on the next read.
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
              <ProgressBar pct={Number(trainingGoal) || 0} color="var(--t-success)" />
              <div style={{ fontSize: 10, color: 'var(--t-text-faint)', marginTop: 3 }}>{trainingGoal === '' ? 'no goal set' : `${trainingGoal}% goal`}</div>
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
              {roster.map(emp => (
                <option key={emp.id} value={emp.id}>{emp.full_name}</option>
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
            Huddle board recorded — the team sees it on their next read.
          </span>
        )}
        {saveErr && <span style={{ fontSize: 12, color: 'var(--t-danger)' }}>Not saved — {saveErr}</span>}
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
  const userId = session?.person?.id || null

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
        {tab === 'today'   && <TodayHuddle isHR={isHR} userName={userName} userId={userId} locationId={locationIds?.[0] || null} locationIds={locationIds} />}
        {tab === 'archive' && <HuddleArchive locationIds={locationIds} />}
        {tab === 'set'     && <SetHuddle isHR={isHR} userName={userName} userId={userId} locationId={locationIds?.[0] || null} locationIds={locationIds} />}
      </div>
    </div>
  )
}
