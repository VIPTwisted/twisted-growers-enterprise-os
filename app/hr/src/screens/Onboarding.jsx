import { useState, useEffect, useMemo, useCallback } from 'react'
import { sb } from '../lib/supabase'
import { useScope } from '../lib/scope.jsx'
import { useAuth } from '../lib/auth.jsx'
import { useFeatureFlag } from '../lib/featureFlags.js'
import DrillDown from '../components/DrillDown.jsx'

/* ── helpers ────────────────────────────────────────────────────── */
function today() { return new Date().toISOString().slice(0, 10) }

function daysSince(dateStr) {
  if (!dateStr) return 0
  return Math.max(0, Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000))
}

function daysUntil(dateStr) {
  if (!dateStr) return 0
  return Math.max(0, Math.floor((new Date(dateStr).getTime() - Date.now()) / 86400000))
}

function fmtDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function pct(tasks) {
  if (!tasks || !tasks.length) return 0
  return Math.round((tasks.filter(t => t.done).length / tasks.length) * 100)
}

function initials(name) {
  return (name || '').split(' ').map(x => x[0]).slice(0, 2).join('').toUpperCase()
}

function pctColor(p) {
  if (p >= 75) return 'var(--t-success)'
  if (p >= 50) return 'var(--t-warn)'
  return 'var(--t-danger)'
}

function hireStatus(p) {
  if (p >= 100) return 'Complete'
  if (p >= 75) return 'On Track'
  if (p >= 50) return 'Watch'
  return 'Behind'
}

/* ── drill-down columns: one row per new-hire onboarding record ──── */
const HIRE_DRILL_COLS = [
  { key: 'name', label: 'New Hire', value: h => h.name },
  { key: 'location', label: 'Location', value: h => h.location },
  { key: 'role', label: 'Role', value: h => h.role },
  { key: 'startDate', label: 'Start Date', value: h => fmtDate(h.startDate), sortKey: h => h.startDate || '' },
  { key: 'days', label: 'Day of 90', value: h => `Day ${daysSince(h.startDate)}`, align: 'right', sortKey: h => daysSince(h.startDate) },
  { key: 'tasksDone', label: 'Tasks Done', value: h => `${h.tasks.filter(t => t.done).length}/${h.tasks.length}`, align: 'right', sortKey: h => h.tasks.filter(t => t.done).length },
  { key: 'pct', label: 'Completion', value: h => `${pct(h.tasks)}%`, align: 'right', sortKey: h => pct(h.tasks) },
  { key: 'status', label: 'Status', value: h => hireStatus(pct(h.tasks)) },
]

/* ── drill-down columns: one row per checklist task across hires ── */
const TASK_DRILL_COLS = [
  { key: 'label', label: 'Checklist Item', value: r => r.label },
  { key: 'name', label: 'New Hire', value: r => r.name },
  { key: 'location', label: 'Location', value: r => r.location },
  { key: 'section', label: 'Timeline', value: r => r.section },
  { key: 'done', label: 'Status', value: r => (r.done ? 'Complete' : 'Incomplete') },
  { key: 'doneAt', label: 'Completed', value: r => fmtDate(r.doneAt), sortKey: r => r.doneAt || '' },
]

/* ── checklist definition ────────────────────────────────────────── */
const CHECKLIST_SECTIONS = [
  {
    id: 'day1', label: 'Day 1', timeline: 'Day 1',
    items: [
      { id: 'i9',        label: 'I-9 Verification' },
      { id: 'w4',        label: 'W-4 Tax Form' },
      { id: 'dd_form',   label: 'Direct Deposit Form' },
      { id: 'sys_access',label: 'System Access Setup' },
      { id: 'id_badge',  label: 'ID Badge Issued' },
      { id: 'tour',      label: 'Store Tour' },
      { id: 'meet_team', label: 'Meet the Team' },
    ],
  },
  {
    id: 'week1', label: 'Week 1', timeline: 'Week 1',
    items: [
      { id: 'prod_basics',  label: 'Product Knowledge Basics' },
      { id: 'pos_train',    label: 'POS System Training' },
      { id: 'shadow_1',     label: 'Shadowing Shift 1' },
      { id: 'shadow_2',     label: 'Shadowing Shift 2' },
      { id: 'shadow_3',     label: 'Shadowing Shift 3' },
      { id: 'safety',       label: 'Safety Training' },
    ],
  },
  {
    id: 'month1', label: 'Month 1', timeline: 'Month 1',
    items: [
      { id: 'solo_shifts',  label: 'First Solo Shifts' },
      { id: 'checkin_30',   label: '30-Day Performance Check-In' },
      { id: 'module_1',     label: 'Training Module 1' },
      { id: 'module_2',     label: 'Training Module 2' },
      { id: 'module_3',     label: 'Training Module 3' },
      { id: 'module_4',     label: 'Training Module 4' },
      { id: 'module_5',     label: 'Training Module 5' },
    ],
  },
  {
    id: 'month3', label: 'Month 3', timeline: 'Month 3',
    items: [
      { id: 'prod_cert',    label: 'Full Product Certification' },
      { id: 'review_90',    label: '90-Day Performance Review' },
      { id: 'benefits',     label: 'Benefits Enrollment' },
    ],
  },
]

const ALL_ITEMS = CHECKLIST_SECTIONS.flatMap(s => s.items.map(i => ({ ...i, section: s.id })))

const MILESTONE_COLUMNS = [
  {
    id: 'week1',
    label: 'Week 1',
    items: [
      { id: 'ms_i9',        label: 'Complete I-9' },
      { id: 'ms_w4',        label: 'Complete W-4' },
      { id: 'ms_handbook',  label: 'Handbook Signed' },
      { id: 'ms_firstshift',label: 'First Shift Completed' },
      { id: 'ms_sysaccess', label: 'Systems Access Set Up' },
      { id: 'ms_shadow',    label: 'Shadow Experienced Associate' },
    ],
  },
  {
    id: 'week2',
    label: 'Week 2',
    items: [
      { id: 'ms_register',  label: 'First Solo Register' },
      { id: 'ms_pkquiz1',   label: 'Product Knowledge Quiz 1' },
      { id: 'ms_safety',    label: 'Complete Safety Training' },
      { id: 'ms_1on1',      label: '1-on-1 with Manager' },
    ],
  },
  {
    id: 'day30',
    label: '30 Days',
    items: [
      { id: 'ms_checkin30', label: '30-Day Performance Check-In' },
      { id: 'ms_allmod',    label: 'Complete All Required Modules' },
      { id: 'ms_pkquiz2',   label: 'Product Knowledge Quiz 2' },
      { id: 'ms_goals90',   label: 'Goals Set for 90 Days' },
    ],
  },
  {
    id: 'day60_90',
    label: '60–90 Days',
    items: [
      { id: 'ms_checkin60', label: '60-Day Check-In' },
      { id: 'ms_review90',  label: '90-Day Probation Review' },
      { id: 'ms_certs',     label: 'All Certifications Current' },
      { id: 'ms_independence', label: 'Full Independence Confirmed' },
    ],
  },
]

// A hire row from onboarding_list_hires may carry no tasks (legacy intake).
// Normalize to the program template so the checklist always renders; stored
// task state (done/doneAt) is preserved when present. This is app config, not
// employee data — no fabricated completion.
function normalizeHire(h) {
  const stored = Array.isArray(h.tasks) ? h.tasks : []
  const byId = Object.fromEntries(stored.map(t => [t.id, t]))
  const tasks = ALL_ITEMS.map(item => {
    const s = byId[item.id] || {}
    return { ...item, done: !!s.done, doneAt: s.doneAt || null, note: s.note || '' }
  })
  return {
    ...h,
    payRate: h.payRate != null ? String(h.payRate) : '',
    buddy: h.buddy || '—',
    milestones: h.milestones && typeof h.milestones === 'object' ? h.milestones : {},
    tasks,
  }
}

/* ── KPI tile ─────────────────────────────────────────────────────── */
function KTile({ label, value, sub, color, alert, onClick }) {
  return (
    <div onClick={onClick} title={onClick ? 'Click to drill into records' : undefined} style={{
      background: 'var(--t-surface)',
      border: `1px solid ${alert === 'red' ? 'var(--t-danger)' : alert === 'amber' ? 'var(--t-warn)' : 'var(--t-line)'}`,
      padding: '14px 16px',
      position: 'relative',
      overflow: 'hidden',
      flex: 1,
      minWidth: 130,
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

/* ── inline styles ───────────────────────────────────────────────── */
const S = {
  page: { padding: 24, maxWidth: 1400 },
  tabBar: { display: 'flex', gap: 4, marginBottom: 20, borderBottom: '1px solid var(--t-line)', paddingBottom: 0 },
  tab: (active) => ({
    padding: '8px 18px',
    fontSize: 13,
    fontWeight: active ? 700 : 500,
    color: active ? 'var(--t-accent)' : 'var(--t-text-muted)',
    background: 'transparent',
    border: 'none',
    borderBottom: active ? '2px solid var(--t-accent)' : '2px solid transparent',
    cursor: 'pointer',
    marginBottom: -1,
    fontFamily: 'inherit',
    transition: 'color .15s',
    letterSpacing: '.03em',
  }),
  card: {
    background: 'var(--t-surface)',
    border: '1px solid var(--t-line)',
    padding: '16px 18px',
    marginBottom: 10,
  },
  input: {
    background: 'var(--t-surface-2)',
    border: '1px solid var(--t-line)',
    color: 'var(--t-text)',
    padding: '8px 12px',
    fontSize: 13,
    width: '100%',
    boxSizing: 'border-box',
    outline: 'none',
    fontFamily: 'inherit',
    borderRadius: 0,
  },
  label: {
    display: 'block',
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: '.08em',
    color: 'var(--t-text-muted)',
    marginBottom: 5,
    textTransform: 'uppercase',
  },
  btnPrimary: {
    background: 'var(--t-accent)',
    color: '#000',
    border: 'none',
    padding: '9px 20px',
    fontSize: 13,
    fontWeight: 700,
    cursor: 'pointer',
    fontFamily: 'inherit',
    letterSpacing: '.03em',
  },
  btnSecondary: {
    background: 'var(--t-surface-2)',
    color: 'var(--t-text)',
    border: '1px solid var(--t-line)',
    padding: '9px 20px',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,.65)',
    zIndex: 9998, display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: 16,
  },
  modal: {
    background: 'var(--t-surface)',
    border: '1px solid var(--t-line)',
    width: '100%',
    maxWidth: 620,
    maxHeight: '90vh',
    overflowY: 'auto',
    boxShadow: '0 24px 64px rgba(0,0,0,.5)',
  },
  modalHeader: {
    padding: '16px 20px',
    borderBottom: '1px solid var(--t-line)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    position: 'sticky',
    top: 0,
    background: 'var(--t-surface)',
    zIndex: 1,
  },
}

/* ── Avatar ──────────────────────────────────────────────────────── */
function Av({ name, size = 36 }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: 'var(--t-accent)', color: '#000',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.35, fontWeight: 800, flexShrink: 0, letterSpacing: '-.02em',
    }}>
      {initials(name)}
    </div>
  )
}

/* ── Progress bar ────────────────────────────────────────────────── */
function ProgBar({ value, color, height = 6 }) {
  return (
    <div style={{ background: 'var(--t-line)', height, width: '100%' }}>
      <div style={{ width: `${value}%`, height: '100%', background: color || 'var(--t-accent)', transition: 'width .3s' }} />
    </div>
  )
}

/* ── Hire card ───────────────────────────────────────────────────── */
function HireCard({ hire, onClick }) {
  const p = pct(hire.tasks)
  const days = daysSince(hire.startDate)
  const done = hire.tasks.filter(t => t.done).length
  const alert = p < 50 ? 'red' : p < 75 ? 'amber' : null

  return (
    <div
      style={{
        ...S.card,
        cursor: 'pointer',
        borderLeft: `3px solid ${pctColor(p)}`,
        transition: 'border-color .15s',
      }}
      onClick={onClick}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <Av name={hire.name} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--t-text)' }}>{hire.name}</span>
            <span className="badge blue" style={{ fontSize: 10 }}>{hire.location}</span>
            <span className="badge purple" style={{ fontSize: 10 }}>{hire.role}</span>
            {alert === 'red' && <span className="badge red" style={{ fontSize: 10 }}>Behind</span>}
          </div>
          <div style={{ fontSize: 11, color: 'var(--t-text-muted)', marginTop: 3 }}>
            Started {fmtDate(hire.startDate)} · Day {days} of 90 · Buddy: {hire.buddy}
          </div>
          <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ flex: 1 }}>
              <ProgBar value={p} color={pctColor(p)} />
            </div>
            <span style={{ fontSize: 11, fontWeight: 700, color: pctColor(p), minWidth: 40, textAlign: 'right' }}>
              {p}%
            </span>
            <span style={{ fontSize: 11, color: 'var(--t-text-faint)' }}>
              {done}/{hire.tasks.length} tasks
            </span>
          </div>
        </div>
        <button style={{ ...S.btnSecondary, padding: '6px 14px', fontSize: 12, flexShrink: 0 }} onClick={e => { e.stopPropagation(); onClick() }}>
          View
        </button>
      </div>
    </div>
  )
}

/* ── Hire detail modal ───────────────────────────────────────────── */
function HireModal({ hire, onClose, onTaskToggle }) {
  const p = pct(hire.tasks)
  const days = daysSince(hire.startDate)
  return (
    <div style={S.overlay} onClick={onClose}>
      <div style={S.modal} onClick={e => e.stopPropagation()}>
        <div style={S.modalHeader}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Av name={hire.name} size={42} />
            <div>
              <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--t-text)' }}>{hire.name}</div>
              <div style={{ fontSize: 11, color: 'var(--t-text-muted)', marginTop: 2 }}>
                {hire.role} · {hire.location} · Day {days} of 90
              </div>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, color: 'var(--t-text-muted)', cursor: 'pointer', lineHeight: 1 }}>×</button>
        </div>

        {/* progress summary */}
        <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--t-line)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 12, color: 'var(--t-text-muted)' }}>
            <span>Onboarding Progress</span>
            <span style={{ fontWeight: 700, color: pctColor(p) }}>{p}%</span>
          </div>
          <ProgBar value={p} color={pctColor(p)} height={8} />
          <div style={{ display: 'flex', gap: 20, marginTop: 10, fontSize: 11, color: 'var(--t-text-faint)' }}>
            <span>Started: {fmtDate(hire.startDate)}</span>
            <span>Buddy: {hire.buddy}</span>
            <span>Pay: ${hire.payRate}/hr</span>
            <span>Email: {hire.email}</span>
          </div>
        </div>

        {/* checklist by section */}
        <div style={{ padding: 20 }}>
          {CHECKLIST_SECTIONS.map(sec => {
            const secTasks = hire.tasks.filter(t => t.section === sec.id)
            const secPct = pct(secTasks)
            return (
              <div key={sec.id} style={{ marginBottom: 18 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.06em', color: 'var(--t-text-muted)', textTransform: 'uppercase' }}>{sec.label}</span>
                  <div style={{ flex: 1, height: 1, background: 'var(--t-line)' }} />
                  <span style={{ fontSize: 11, color: pctColor(secPct), fontWeight: 600 }}>{secPct}%</span>
                </div>
                {secTasks.map(task => (
                  <div
                    key={task.id}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10, padding: '7px 10px',
                      background: task.done ? 'rgba(29,233,182,.05)' : 'var(--t-surface-2)',
                      border: `1px solid ${task.done ? 'rgba(29,233,182,.2)' : 'var(--t-line)'}`,
                      marginBottom: 4, cursor: 'pointer', transition: 'background .15s',
                    }}
                    onClick={() => onTaskToggle(hire.id, task.id)}
                  >
                    <div style={{
                      width: 18, height: 18, border: `2px solid ${task.done ? 'var(--t-success)' : 'var(--t-line)'}`,
                      background: task.done ? 'var(--t-success)' : 'transparent',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 11, color: '#000', fontWeight: 700, flexShrink: 0,
                    }}>
                      {task.done ? '✓' : ''}
                    </div>
                    <span style={{
                      flex: 1, fontSize: 13, color: task.done ? 'var(--t-text-muted)' : 'var(--t-text)',
                      textDecoration: task.done ? 'line-through' : 'none',
                    }}>{task.label}</span>
                    {task.doneAt && (
                      <span style={{ fontSize: 10, color: 'var(--t-text-faint)' }}>{fmtDate(task.doneAt)}</span>
                    )}
                  </div>
                ))}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

/* ── New Hire Form ────────────────────────────────────────────────── */
function NewHireForm({ options, onAdded }) {
  const locs = options.locations
  const roles = options.roles
  const buddies = options.buddies
  const blank = () => ({
    name: '', startDate: today(),
    location: locs[0]?.name || '', role: roles[0]?.name || '',
    payRate: '', buddy: buddies[0] || '',
    email: '', phone: '', emergencyName: '', emergencyPhone: '',
  })
  const [form, setForm] = useState(blank)
  const [saving, setSaving] = useState(false)
  const [recent, setRecent] = useState([])

  const fld = (key, e) => setForm(f => ({ ...f, [key]: e.target.value }))

  const handleSubmit = async () => {
    if (!form.name || !form.startDate) return
    setSaving(true)
    const tasks = ALL_ITEMS.map(item => ({ ...item, done: false, doneAt: null, note: '' }))
    const payload = { ...form, tasks }
    const { error } = await sb.rpc('create_employee', { p_data: payload })
    setSaving(false)
    if (error) return  // safety net surfaces the honest "not available yet" toast; do not fake a saved hire
    setRecent(r => [{ id: `r_${Date.now()}`, name: form.name, role: form.role, location: form.location }, ...r].slice(0, 5))
    setForm(blank())
    onAdded && onAdded()  // parent re-reads the roster from the DB
  }

  const gridRow = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }
  const sel = { ...S.input, paddingRight: 8 }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 20, alignItems: 'start' }}>
      {/* Form */}
      <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', padding: 24 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--t-text)', marginBottom: 18, letterSpacing: '.04em' }}>NEW EMPLOYEE ONBOARDING</div>

        <div style={gridRow}>
          <div>
            <label style={S.label}>Full Name *</label>
            <input style={S.input} value={form.name} onChange={e => fld('name', e)} placeholder="First Last" />
          </div>
          <div>
            <label style={S.label}>Start Date *</label>
            <input type="date" style={S.input} value={form.startDate} onChange={e => fld('startDate', e)} />
          </div>
        </div>

        <div style={gridRow}>
          <div>
            <label style={S.label}>Location</label>
            <select style={sel} value={form.location} onChange={e => fld('location', e)}>
              {locs.length === 0 && <option value="">No locations available</option>}
              {locs.map(l => <option key={l.id} value={l.name}>{l.name}</option>)}
            </select>
          </div>
          <div>
            <label style={S.label}>Role</label>
            <select style={sel} value={form.role} onChange={e => fld('role', e)}>
              {roles.length === 0 && <option value="">No roles available</option>}
              {roles.map(r => <option key={r.id} value={r.name}>{r.name}</option>)}
            </select>
          </div>
        </div>

        <div style={gridRow}>
          <div>
            <label style={S.label}>Pay Rate ($/hr)</label>
            <input style={S.input} value={form.payRate} onChange={e => fld('payRate', e)} placeholder="15.00" />
          </div>
          <div>
            <label style={S.label}>Assigned Buddy / Mentor</label>
            <select style={sel} value={form.buddy} onChange={e => fld('buddy', e)}>
              <option value="">Unassigned</option>
              {buddies.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>
        </div>

        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.08em', color: 'var(--t-text-muted)', textTransform: 'uppercase', marginBottom: 10 }}>Contact Information</div>
          <div style={gridRow}>
            <div>
              <label style={S.label}>Work Email</label>
              <input style={S.input} value={form.email} onChange={e => fld('email', e)} placeholder="name@vip.com" />
            </div>
            <div>
              <label style={S.label}>Phone</label>
              <input style={S.input} value={form.phone} onChange={e => fld('phone', e)} placeholder="(860) 555-0100" />
            </div>
          </div>
        </div>

        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.08em', color: 'var(--t-text-muted)', textTransform: 'uppercase', marginBottom: 10 }}>Emergency Contact</div>
          <div style={gridRow}>
            <div>
              <label style={S.label}>Name & Relationship</label>
              <input style={S.input} value={form.emergencyName} onChange={e => fld('emergencyName', e)} placeholder="Jane Doe – Spouse" />
            </div>
            <div>
              <label style={S.label}>Phone</label>
              <input style={S.input} value={form.emergencyPhone} onChange={e => fld('emergencyPhone', e)} placeholder="(860) 555-0200" />
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button style={S.btnPrimary} onClick={handleSubmit} disabled={saving || !form.name || !form.startDate}>
            {saving ? 'Adding…' : 'Start Onboarding Program'}
          </button>
        </div>
      </div>

      {/* Recent */}
      <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', padding: 20 }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.08em', color: 'var(--t-text-muted)', textTransform: 'uppercase', marginBottom: 14 }}>
          Recently Added
        </div>
        {recent.length === 0 ? (
          <div style={{ color: 'var(--t-text-faint)', fontSize: 12 }}>No recent additions this session.</div>
        ) : recent.map(h => (
          <div key={h.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--t-line)' }}>
            <Av name={h.name} size={28} />
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--t-text)' }}>{h.name}</div>
              <div style={{ fontSize: 10, color: 'var(--t-text-faint)' }}>{h.role} · {h.location}</div>
            </div>
            <span className="badge green" style={{ marginLeft: 'auto', fontSize: 10 }}>Added</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ── Checklist tab ────────────────────────────────────────────────── */
function ChecklistTab({ hires }) {
  const [selectedHireId, setSelectedHireId] = useState(hires[0]?.id || '')
  const hire = hires.find(h => h.id === selectedHireId) || hires[0]

  if (!hire) return <div style={{ color: 'var(--t-text-muted)', fontSize: 13 }}>No active onboarding programs.</div>

  const p = pct(hire.tasks)

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 16, alignItems: 'start' }}>
      {/* Employee picker */}
      <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)' }}>
        <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--t-line)', fontSize: 11, fontWeight: 700, letterSpacing: '.08em', color: 'var(--t-text-muted)', textTransform: 'uppercase' }}>
          Select Employee
        </div>
        {hires.map(h => {
          const hp = pct(h.tasks)
          return (
            <div
              key={h.id}
              onClick={() => setSelectedHireId(h.id)}
              style={{
                padding: '10px 14px',
                cursor: 'pointer',
                background: selectedHireId === h.id ? 'rgba(0,229,255,.06)' : 'transparent',
                borderLeft: selectedHireId === h.id ? '2px solid var(--t-accent)' : '2px solid transparent',
                borderBottom: '1px solid var(--t-line)',
                transition: 'background .12s',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Av name={h.name} size={24} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--t-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.name}</div>
                  <div style={{ fontSize: 10, color: pctColor(hp) }}>{hp}% complete</div>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Master checklist */}
      <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', padding: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <Av name={hire.name} />
          <div>
            <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--t-text)' }}>{hire.name}</div>
            <div style={{ fontSize: 11, color: 'var(--t-text-muted)' }}>Day {daysSince(hire.startDate)} of 90 · {p}% complete</div>
          </div>
          <div style={{ marginLeft: 'auto', width: 200 }}>
            <ProgBar value={p} color={pctColor(p)} height={8} />
          </div>
        </div>

        {CHECKLIST_SECTIONS.map(sec => {
          const secTasks = hire.tasks.filter(t => t.section === sec.id)
          const sp = pct(secTasks)
          return (
            <div key={sec.id} style={{ marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, padding: '6px 10px', background: 'var(--t-surface-2)', border: '1px solid var(--t-line)' }}>
                <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.06em', color: 'var(--t-text-muted)', textTransform: 'uppercase', flex: 1 }}>
                  {sec.label} — {sec.timeline}
                </span>
                <span style={{ fontSize: 11, fontWeight: 700, color: pctColor(sp) }}>{sp}%</span>
                <span style={{ fontSize: 10, color: 'var(--t-text-faint)' }}>
                  {secTasks.filter(t => t.done).length}/{secTasks.length}
                </span>
              </div>
              {secTasks.map(task => (
                <div key={task.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 12px', borderBottom: '1px solid var(--t-line)', background: task.done ? 'rgba(29,233,182,.04)' : 'transparent' }}>
                  <div style={{
                    width: 16, height: 16, border: `2px solid ${task.done ? 'var(--t-success)' : 'var(--t-line)'}`,
                    background: task.done ? 'var(--t-success)' : 'transparent',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 10, color: '#000', fontWeight: 700, flexShrink: 0,
                  }}>
                    {task.done ? '✓' : ''}
                  </div>
                  <span style={{ flex: 1, fontSize: 13, color: task.done ? 'var(--t-text-muted)' : 'var(--t-text)', textDecoration: task.done ? 'line-through' : 'none' }}>{task.label}</span>
                  {task.doneAt ? (
                    <span style={{ fontSize: 10, color: 'var(--t-text-faint)' }}>{fmtDate(task.doneAt)}</span>
                  ) : (
                    <span style={{ fontSize: 10, color: 'var(--t-text-faint)' }}>Pending</span>
                  )}
                </div>
              ))}
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ── Reports tab ──────────────────────────────────────────────────── */
function ReportsTab({ hires }) {
  const [drill, setDrill] = useState(null)
  const openDrill = (title, rows, accent, columns = HIRE_DRILL_COLS) =>
    setDrill({ title, subtitle: `${rows.length} record${rows.length === 1 ? '' : 's'}`, columns, rows, accent })

  const locNames = useMemo(
    () => [...new Set(hires.map(h => h.location).filter(Boolean))].sort(),
    [hires]
  )
  const byLocation = useMemo(() => {
    const map = {}
    locNames.forEach(l => { map[l] = [] })
    hires.forEach(h => { if (map[h.location]) map[h.location].push(h) })
    return map
  }, [hires, locNames])

  const totalItems = ALL_ITEMS.length
  const incompleteFreq = useMemo(() => {
    const freq = {}
    ALL_ITEMS.forEach(item => { freq[item.id] = { label: item.label, skipped: 0, rows: [] } })
    hires.forEach(h => {
      h.tasks.forEach(t => {
        if (!t.done && freq[t.id]) {
          freq[t.id].skipped++
          freq[t.id].rows.push({ ...t, name: h.name, location: h.location, role: h.role })
        }
      })
    })
    return Object.values(freq).sort((a, b) => b.skipped - a.skipped).slice(0, 8)
  }, [hires])

  const avgDaysToComplete = useMemo(() => {
    const completed = hires.filter(h => h.completedAt)
    if (!completed.length) return 0
    return Math.round(completed.reduce((s, h) => s + daysSince(h.startDate), 0) / completed.length)
  }, [hires])

  const retention90 = useMemo(() => {
    const past90 = hires.filter(h => daysSince(h.startDate) >= 90)
    if (!past90.length) return '—'
    const retained = past90.filter(h => pct(h.tasks) >= 80).length
    return Math.round((retained / past90.length) * 100) + '%'
  }, [hires])

  const onTrack = hires.filter(h => pct(h.tasks) >= 75).length
  const behind = hires.filter(h => pct(h.tasks) < 50).length
  const avgOverall = hires.length ? Math.round(hires.reduce((s, h) => s + pct(h.tasks), 0) / hires.length) : 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* summary KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 }}>
        <KTile label="Avg Completion" value={`${avgOverall}%`} color="var(--t-accent)"
          onClick={() => openDrill('Avg Completion — All Onboarding Records', hires, 'var(--t-accent)')} />
        <KTile label="On Track (≥75%)" value={onTrack} color="var(--t-success)"
          onClick={() => openDrill('On Track (≥75% Complete)', hires.filter(h => pct(h.tasks) >= 75), 'var(--t-success)')} />
        <KTile label="Behind (<50%)" value={behind} color="var(--t-danger)" alert={behind > 2 ? 'red' : null}
          onClick={() => openDrill('Behind (<50% Complete)', hires.filter(h => pct(h.tasks) < 50), 'var(--t-danger)')} />
        <KTile label="Avg Days to 100%" value={avgDaysToComplete || '—'} sub="days"
          onClick={() => openDrill('Completed Onboarding — Days to 100%', hires.filter(h => h.completedAt), 'var(--t-text)')} />
        <KTile label="90-Day Retention" value={retention90} color="var(--t-success)"
          onClick={() => openDrill('90-Day Retention — Hires Past Day 90', hires.filter(h => daysSince(h.startDate) >= 90), 'var(--t-success)')} />
      </div>

      {/* by location */}
      <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', padding: 20 }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.08em', color: 'var(--t-text-muted)', textTransform: 'uppercase', marginBottom: 16 }}>
          Completion Rate by Location
        </div>
        {locNames.length === 0 && (
          <div style={{ color: 'var(--t-text-faint)', fontSize: 12 }}>No onboarding records yet.</div>
        )}
        {locNames.map(loc => {
          const locHires = byLocation[loc]
          if (!locHires.length) return null
          const avg = Math.round(locHires.reduce((s, h) => s + pct(h.tasks), 0) / locHires.length)
          return (
            <div key={loc} style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 5, color: 'var(--t-text)' }}>
                <span style={{ fontWeight: 600 }}>{loc}</span>
                <span style={{ color: pctColor(avg), fontWeight: 700 }}>{avg}% ({locHires.length} active)</span>
              </div>
              <ProgBar value={avg} color={pctColor(avg)} height={8} />
            </div>
          )
        })}
      </div>

      {/* most skipped items */}
      <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', padding: 20 }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.08em', color: 'var(--t-text-muted)', textTransform: 'uppercase', marginBottom: 16 }}>
          Most Commonly Incomplete Items
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--t-line)' }}>
              <th style={{ textAlign: 'left', padding: '6px 0', color: 'var(--t-text-muted)', fontWeight: 600 }}>Checklist Item</th>
              <th style={{ textAlign: 'right', padding: '6px 0', color: 'var(--t-text-muted)', fontWeight: 600 }}>Employees Skipping</th>
              <th style={{ textAlign: 'right', padding: '6px 0', color: 'var(--t-text-muted)', fontWeight: 600 }}>Skip Rate</th>
            </tr>
          </thead>
          <tbody>
            {incompleteFreq.map((item, i) => (
              <tr key={item.label}
                onClick={() => item.rows.length && openDrill(`Incomplete: ${item.label}`, item.rows, 'var(--t-danger)', TASK_DRILL_COLS)}
                title={item.rows.length ? 'Click to drill into records' : undefined}
                style={{ borderBottom: '1px solid var(--t-line)', background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,.02)', cursor: item.rows.length ? 'pointer' : 'default' }}>
                <td style={{ padding: '8px 0', color: 'var(--t-text)' }}>{item.label}</td>
                <td style={{ textAlign: 'right', padding: '8px 0', color: 'var(--t-text-muted)' }}>{item.skipped}</td>
                <td style={{ textAlign: 'right', padding: '8px 0', color: item.skipped > hires.length * 0.5 ? 'var(--t-danger)' : 'var(--t-text-muted)' }}>
                  {hires.length ? Math.round((item.skipped / hires.length) * 100) + '%' : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <DrillDown open={!!drill} onClose={() => setDrill(null)} {...(drill || {})} />
    </div>
  )
}

/* ── Milestones tab ───────────────────────────────────────────────── */
function MilestonesTab({ hires, onToggleMilestone }) {
  const [selectedHireId, setSelectedHireId] = useState(hires[0]?.id || '')

  const hire = hires.find(h => h.id === selectedHireId) || hires[0]
  if (!hire) return <div style={{ color: 'var(--t-text-muted)', fontSize: 13 }}>No active onboarding programs.</div>

  const hireMs = hire.milestones || {}

  const allItems = MILESTONE_COLUMNS.flatMap(c => c.items)
  const totalDone = allItems.filter(i => hireMs[i.id]).length
  const totalAll = allItems.length
  const overallPct = Math.round((totalDone / totalAll) * 100)

  const daysAgo = daysSince(hire.startDate)
  // BEHIND if any Week 1 items unchecked past day 7
  const week1Items = MILESTONE_COLUMNS[0].items
  const week1Undone = week1Items.filter(i => !hireMs[i.id]).length
  let statusLabel, statusColor
  if (totalDone === totalAll) { statusLabel = 'COMPLETE'; statusColor = 'var(--t-success)' }
  else if (daysAgo > 7 && week1Undone > 0) { statusLabel = 'BEHIND'; statusColor = 'var(--t-warn)' }
  else { statusLabel = 'ON TRACK'; statusColor = 'var(--t-success)' }

  function toggleItem(itemId) {
    onToggleMilestone(hire.id, itemId, !hireMs[itemId])
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr', gap: 16, alignItems: 'start' }}>
      {/* Employee picker */}
      <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)' }}>
        <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--t-line)', fontSize: 11, fontWeight: 700, letterSpacing: '.08em', color: 'var(--t-text-muted)', textTransform: 'uppercase' }}>
          Select Employee
        </div>
        {hires.map((h) => {
          const hms = h.milestones || {}
          const items = MILESTONE_COLUMNS.flatMap(c => c.items)
          const done = items.filter(i => hms[i.id]).length
          const hp = Math.round((done / items.length) * 100)
          return (
            <div
              key={h.id}
              onClick={() => setSelectedHireId(h.id)}
              style={{
                padding: '10px 14px', cursor: 'pointer',
                background: selectedHireId === h.id ? 'rgba(0,229,255,.06)' : 'transparent',
                borderLeft: selectedHireId === h.id ? '2px solid var(--t-accent)' : '2px solid transparent',
                borderBottom: '1px solid var(--t-line)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Av name={h.name} size={24} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--t-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.name}</div>
                  <div style={{ fontSize: 10, color: pctColor(hp) }}>{hp}% complete</div>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Board */}
      <div>
        {/* Header */}
        <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', padding: '14px 18px', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 16 }}>
          <Av name={hire.name} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--t-text)', marginBottom: 2 }}>{hire.name}</div>
            <div style={{ fontSize: 11, color: 'var(--t-text-muted)' }}>Day {daysAgo} of 90 · {hire.role} · {hire.location}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.08em', color: statusColor, marginBottom: 4 }}>{statusLabel}</div>
            <div style={{ fontSize: 11, color: 'var(--t-text-muted)' }}>Onboarding {overallPct}% complete</div>
          </div>
          <div style={{ width: 160 }}>
            <ProgBar value={overallPct} color={pctColor(overallPct)} height={8} />
          </div>
        </div>

        {/* 4-column board */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
          {MILESTONE_COLUMNS.map(col => {
            const colDone = col.items.filter(i => hireMs[i.id]).length
            const colPct = Math.round((colDone / col.items.length) * 100)
            return (
              <div key={col.id} style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)' }}>
                {/* Column header */}
                <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--t-line)', background: 'var(--t-surface-2)' }}>
                  <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.06em', color: 'var(--t-text-muted)', textTransform: 'uppercase', marginBottom: 6 }}>{col.label}</div>
                  <ProgBar value={colPct} color={pctColor(colPct)} height={4} />
                  <div style={{ fontSize: 10, color: pctColor(colPct), marginTop: 4, fontWeight: 700 }}>{colDone}/{col.items.length}</div>
                </div>
                {/* Items */}
                <div style={{ padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {col.items.map(item => {
                    const done = !!hireMs[item.id]
                    return (
                      <div
                        key={item.id}
                        onClick={() => toggleItem(item.id)}
                        style={{
                          display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer',
                          padding: '6px 8px',
                          background: done ? 'rgba(29,233,182,.05)' : 'var(--t-bg)',
                          border: `1px solid ${done ? 'rgba(29,233,182,.2)' : 'var(--t-line)'}`,
                        }}
                      >
                        <div style={{
                          width: 15, height: 15, border: `2px solid ${done ? 'var(--t-success)' : 'var(--t-line)'}`,
                          background: done ? 'var(--t-success)' : 'transparent',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 9, color: '#000', fontWeight: 700, flexShrink: 0, marginTop: 1,
                        }}>
                          {done ? '✓' : ''}
                        </div>
                        <span style={{ fontSize: 12, color: done ? 'var(--t-text-muted)' : 'var(--t-text)', textDecoration: done ? 'line-through' : 'none', lineHeight: 1.4 }}>
                          {item.label}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

/* ── Main export ──────────────────────────────────────────────────── */
export default function Onboarding() {
  const { session } = useAuth()
  const { locationIds, locations } = useScope()
  const showMilestones = useFeatureFlag('onboarding_milestones')

  const [tab, setTab] = useState('active')
  const [hires, setHires] = useState([])
  const [loading, setLoading] = useState(true)
  const [options, setOptions] = useState({ locations: [], roles: [], buddies: [] })
  const [selected, setSelected] = useState(null)
  const [drill, setDrill] = useState(null)
  const openDrill = (title, rows, accent, columns = HIRE_DRILL_COLS) =>
    setDrill({ title, subtitle: `${rows.length} record${rows.length === 1 ? '' : 's'}`, columns, rows, accent })

  const nodeKey = locationIds.join(',')

  // Load the real onboarding roster scoped to the caller's locations.
  const loadHires = useCallback(() => {
    setLoading(true)
    return sb.rpc('onboarding_list_hires', { p_node_ids: locationIds.length ? locationIds : null })
      .then(({ data }) => setHires(Array.isArray(data) ? data.map(normalizeHire) : []))
      .catch(() => setHires([]))
      .finally(() => setLoading(false))
  }, [nodeKey])

  useEffect(() => { loadHires() }, [loadHires])

  // Reference dropdowns from real reference data: locations from the session
  // scope, roles from hr_list_roles, buddies (mentors) from the roster.
  useEffect(() => {
    const locOpts = (locations || []).map(l => ({ id: l.id, name: l.name }))
    Promise.all([
      sb.rpc('hr_list_roles').then(r => r.data).catch(() => null),
      sb.rpc('get_roster', { p_node_ids: locationIds, p_actor: session?.person?.id || null }).then(r => r.data).catch(() => null),
    ]).then(([roles, roster]) => {
      const buddies = Array.isArray(roster)
        ? [...new Set(roster.map(p => p.full_name || p.name || p.display_name).filter(Boolean))].sort()
        : []
      setOptions({
        locations: locOpts,
        roles: Array.isArray(roles) ? roles : [],
        buddies,
      })
    })
  }, [nodeKey, session?.person?.id, locations])

  // Apply a task toggle locally for instant feedback, then persist and reconcile.
  function applyTaskToggle(hire, taskId) {
    const tgt = hire.tasks.find(t => t.id === taskId)
    const nextDone = !(tgt && tgt.done)
    const patched = {
      ...hire,
      tasks: hire.tasks.map(t => t.id !== taskId ? t : { ...t, done: nextDone, doneAt: nextDone ? today() : null }),
    }
    return { patched, nextDone }
  }

  const handleTaskToggle = useCallback((hireId, taskId) => {
    let done = false
    setHires(prev => prev.map(h => {
      if (h.id !== hireId) return h
      const { patched, nextDone } = applyTaskToggle(h, taskId)
      done = nextDone
      return patched
    }))
    setSelected(prev => (prev && prev.id === hireId) ? applyTaskToggle(prev, taskId).patched : prev)
    sb.rpc('onboarding_toggle_task', { p_hire_id: hireId, p_task_id: taskId, p_done: done })
      .then(({ error }) => { if (!error) loadHires() })
      .catch(() => {})
  }, [loadHires])

  const handleMilestoneToggle = useCallback((hireId, itemId, done) => {
    setHires(prev => prev.map(h =>
      h.id !== hireId ? h : { ...h, milestones: { ...(h.milestones || {}), [itemId]: done } }
    ))
    sb.rpc('onboarding_set_milestone', { p_hire_id: hireId, p_item_id: itemId, p_done: done })
      .catch(() => {})
  }, [])

  const activeHires = hires.filter(h => pct(h.tasks) < 100)
  const completedHires = hires.filter(h => pct(h.tasks) === 100)
  const avgPct = activeHires.length ? Math.round(activeHires.reduce((s, h) => s + pct(h.tasks), 0) / activeHires.length) : 0
  const onTrack = activeHires.filter(h => pct(h.tasks) >= 75).length
  const behind = activeHires.filter(h => pct(h.tasks) < 50).length
  const thisMonth = completedHires.filter(h => {
    if (!h.completedAt) return false
    const d = new Date(h.completedAt)
    const n = new Date()
    return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth()
  }).length
  const retention = hires.length ? Math.round((completedHires.length / hires.length) * 100) : 0

  const TABS = [
    { key: 'active',     label: `Active Onboarding (${activeHires.length})` },
    { key: 'checklist',  label: 'Onboarding Checklist' },
    { key: 'form',       label: 'New Hire Form' },
    { key: 'reports',    label: 'Reports' },
    ...(showMilestones ? [{ key: 'milestones', label: 'Milestone Board' }] : []),
  ]

  return (
    <div style={S.page}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--t-text)', letterSpacing: '-.02em' }}>New Hire Onboarding</div>
          <div style={{ fontSize: 12, color: 'var(--t-text-muted)', marginTop: 3 }}>Track and manage employee onboarding progress across all locations</div>
        </div>
        <button style={S.btnPrimary} onClick={() => setTab('form')}>+ New Hire</button>
      </div>

      {/* KPIs */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 20 }}>
        <KTile label="Active Onboarding" value={activeHires.length} sub="employees in progress"
          onClick={() => openDrill('Active Onboarding', activeHires, 'var(--t-accent)')} />
        <KTile label="Avg Progress" value={`${avgPct}%`} color="var(--t-accent)" sub="across active hires"
          onClick={() => openDrill('Avg Progress — Active Hires', activeHires, 'var(--t-accent)')} />
        <KTile label="On Track (≥75%)" value={onTrack} color="var(--t-success)"
          onClick={() => openDrill('On Track (≥75% Complete)', activeHires.filter(h => pct(h.tasks) >= 75), 'var(--t-success)')} />
        <KTile label="Behind Schedule" value={behind} color="var(--t-danger)" alert={behind > 2 ? 'red' : null} sub="<50% completion"
          onClick={() => openDrill('Behind Schedule (<50% Complete)', activeHires.filter(h => pct(h.tasks) < 50), 'var(--t-danger)')} />
        <KTile label="Completed This Month" value={thisMonth} color="var(--t-success)"
          onClick={() => openDrill('Completed This Month', completedHires.filter(h => {
            if (!h.completedAt) return false
            const d = new Date(h.completedAt), n = new Date()
            return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth()
          }), 'var(--t-success)')} />
        <KTile label="90-Day Retention" value={`${retention}%`} color={retention >= 80 ? 'var(--t-success)' : 'var(--t-warn)'}
          onClick={() => openDrill('90-Day Retention — Completed Hires', completedHires, retention >= 80 ? 'var(--t-success)' : 'var(--t-warn)')} />
      </div>

      {/* Tabs */}
      <div style={S.tabBar}>
        {TABS.map(t => (
          <button key={t.key} style={S.tab(tab === t.key)} onClick={() => setTab(t.key)}>{t.label}</button>
        ))}
      </div>

      {/* Active tab */}
      {tab === 'active' && (
        <div>
          {loading ? (
            <div style={{ color: 'var(--t-text-faint)', fontSize: 13, padding: '40px 0', textAlign: 'center' }}>
              Loading onboarding records…
            </div>
          ) : activeHires.length === 0 ? (
            <div style={{ color: 'var(--t-text-muted)', fontSize: 13, padding: '40px 0', textAlign: 'center' }}>
              No active onboarding programs. Click "+ New Hire" to start one.
            </div>
          ) : (
            activeHires.map(h => (
              <HireCard key={h.id} hire={h} onClick={() => setSelected(h)} />
            ))
          )}
        </div>
      )}

      {/* Checklist tab */}
      {tab === 'checklist' && (
        <ChecklistTab hires={activeHires.length ? activeHires : hires} />
      )}

      {/* New Hire Form tab */}
      {tab === 'form' && (
        <NewHireForm options={options} onAdded={() => { loadHires(); setTab('active') }} />
      )}

      {/* Reports tab */}
      {tab === 'reports' && <ReportsTab hires={hires} />}

      {/* Milestones tab */}
      {tab === 'milestones' && showMilestones && (
        <MilestonesTab hires={activeHires.length ? activeHires : hires} onToggleMilestone={handleMilestoneToggle} />
      )}

      {/* Detail modal */}
      {selected && (
        <HireModal
          hire={selected}
          onClose={() => setSelected(null)}
          onTaskToggle={handleTaskToggle}
        />
      )}

      {/* Forensic drill-down modal */}
      <DrillDown open={!!drill} onClose={() => setDrill(null)} {...(drill || {})} />
    </div>
  )
}
