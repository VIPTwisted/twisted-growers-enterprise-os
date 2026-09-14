import { useState, useEffect, useCallback } from 'react'
import { useFeatureFlag } from '../lib/featureFlags.js'
import { useAuth } from '../lib/auth.jsx'
import { useScope } from '../lib/scope.jsx'
import { sb, getSession } from '../lib/supabase'

// ─── Style System ─────────────────────────────────────────────────────────────

const S = {
  page: { background: '#070b14', minHeight: '100dvh', color: 'var(--t-text)', fontFamily: 'var(--font-sans, system-ui, sans-serif)' },
  header: { background: 'var(--t-surface)', borderBottom: '1px solid var(--t-line)', padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 },
  title: { fontSize: 18, fontWeight: 800, color: 'var(--t-text)', margin: 0 },
  subtitle: { fontSize: 11, color: 'var(--t-text-muted)', margin: 0 },
  body: { padding: 20, maxWidth: 1100, margin: '0 auto' },
  card: (border = 'var(--t-line)', accent = null) => ({
    background: 'var(--t-surface)', border: `1px solid ${border}`,
    borderLeft: accent ? `4px solid ${accent}` : `1px solid ${border}`,
    padding: 16, marginBottom: 16, borderRadius: 0,
  }),
  sectionHead: (color = '#00e5ff') => ({
    display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14,
    paddingBottom: 8, borderBottom: `1px solid var(--t-line)`,
  }),
  sectionIcon: (color = '#00e5ff') => ({
    width: 28, height: 28, background: color + '22', border: `1px solid ${color}40`,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 14, flexShrink: 0, borderRadius: 0,
  }),
  sectionTitle: (color = '#00e5ff') => ({ fontSize: 12, fontWeight: 800, color, letterSpacing: '0.12em', textTransform: 'uppercase' }),
  sectionSub: { fontSize: 10, color: 'var(--t-text-muted)', marginTop: 1 },
  label: { fontSize: 10, fontWeight: 700, color: 'var(--t-text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 5 },
  input: { width: '100%', boxSizing: 'border-box', background: '#070b14', border: '1px solid var(--t-line)', color: 'var(--t-text)', padding: '8px 10px', fontSize: 12, outline: 'none', borderRadius: 0 },
  select: { width: '100%', boxSizing: 'border-box', background: '#070b14', border: '1px solid var(--t-line)', color: 'var(--t-text)', padding: '8px 10px', fontSize: 12, outline: 'none', borderRadius: 0, appearance: 'none' },
  textarea: { width: '100%', boxSizing: 'border-box', background: '#070b14', border: '1px solid var(--t-line)', color: 'var(--t-text)', padding: '8px 10px', fontSize: 12, outline: 'none', borderRadius: 0, resize: 'vertical', minHeight: 70 },
  btn: (bg = '#00e5ff', fg = '#070b14') => ({ background: bg, color: fg, border: 'none', padding: '8px 18px', fontSize: 12, fontWeight: 700, cursor: 'pointer', letterSpacing: '0.04em', borderRadius: 0 }),
  btnOutline: (color = '#00e5ff') => ({ background: 'transparent', color, border: `1px solid ${color}`, padding: '6px 12px', fontSize: 11, fontWeight: 600, cursor: 'pointer', borderRadius: 0 }),
  btnSm: (color = '#7c4dff') => ({ background: 'transparent', color, border: `1px solid ${color}`, padding: '4px 10px', fontSize: 10, fontWeight: 600, cursor: 'pointer', borderRadius: 0 }),
  btnDanger: { background: 'rgba(255,77,125,0.12)', color: '#ff4d7d', border: '1px solid rgba(255,77,125,0.35)', padding: '5px 10px', fontSize: 11, fontWeight: 600, cursor: 'pointer', borderRadius: 0 },
  badge: (color = '#00e5ff') => ({ background: color + '22', color, border: `1px solid ${color}40`, fontSize: 9, fontWeight: 700, padding: '2px 7px', letterSpacing: '0.1em', textTransform: 'uppercase', borderRadius: 0, whiteSpace: 'nowrap' }),
  grid2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 },
  grid3: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 },
  row: { display: 'flex', alignItems: 'center', gap: 8 },
  formRow: { marginBottom: 12 },
  divider: { borderTop: '1px solid var(--t-line)', margin: '14px 0' },
  pill: (bg = '#7c4dff') => ({ background: bg + '22', color: bg, fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20, letterSpacing: '0.06em' }),
  toast: (ok = true) => ({ position: 'fixed', top: 20, right: 20, zIndex: 9999, background: ok ? '#2ad6a0' : '#ff4d7d', color: '#070b14', padding: '10px 18px', fontSize: 12, fontWeight: 700, boxShadow: '0 8px 32px rgba(0,0,0,0.4)', borderRadius: 0 }),
}

// ─── Constants (UI vocabulary only — no fabricated business data) ─────────────

const EVENT_TYPES = [
  { id: 'incident',    label: 'INCIDENT',          color: '#ff4d7d', icon: '⚠' },
  { id: 'customer',    label: 'CUSTOMER ISSUE',    color: '#ffb800', icon: '🧑' },
  { id: 'highlight',   label: 'HIGHLIGHT / WIN',   color: '#2ad6a0', icon: '★' },
  { id: 'ops',         label: 'OPERATIONS',        color: '#2979ff', icon: '⚙' },
  { id: 'safety',      label: 'SAFETY / SECURITY', color: '#ff6d00', icon: '🛡' },
  { id: 'maintenance', label: 'MAINTENANCE',       color: '#7c4dff', icon: '🔧' },
  { id: 'other',       label: 'OTHER',             color: '#aaa',    icon: '•' },
]

const ZONES = ['Sales Floor', 'Register/POS', 'Back Room', 'Entrance', 'Fitting Room', 'Break Room', 'Parking Lot', 'Other']

const SHIFT_TYPES = [
  { id: 'open',  label: 'OPEN',  hours: '9:00 AM – 3:00 PM' },
  { id: 'mid',   label: 'MID',   hours: '12:00 PM – 6:00 PM' },
  { id: 'close', label: 'CLOSE', hours: '3:00 PM – 10:00 PM' },
  { id: 'full',  label: 'FULL',  hours: '9:00 AM – 10:00 PM' },
]

const OPS_CHECKLIST = [
  { id: 'safe_count',      label: 'Safe count completed & verified' },
  { id: 'register_close',  label: 'Register balanced and closed' },
  { id: 'cleaning',        label: 'Cleaning checklist signed off' },
  { id: 'restock',         label: 'Floor restocked' },
  { id: 'fitting_checked', label: 'Fitting rooms checked & secured' },
  { id: 'backroom_locked', label: 'Back room locked & organized' },
  { id: 'alarm_set',       label: 'Alarm set / system secured' },
  { id: 'trash_out',       label: 'Trash disposed' },
  { id: 'lights_off',      label: 'Lights off / HVAC set' },
  { id: 'staff_briefed',   label: 'Staff debriefed before departure' },
]

const KEY_HOLDER_RX = /key\s*holder|lead/i
const MANAGER_RX = /manager|key\s*holder|lead|coo|ceo|owner|assistant/i

// Local id for client-side sub-items (event rows). Not business data — just a
// stable React key / reference inside the report payload. Uses the platform
// crypto RNG, never Math.random.
function localId() {
  try { return crypto.randomUUID() } catch { return 'ev-' + Date.now().toString(36) + '-' + (crypto.getRandomValues(new Uint32Array(1))[0]).toString(36) }
}
function today() { return new Date().toISOString().slice(0, 10) }
function timeNow() { return new Date().toTimeString().slice(0, 5) }
function fmtDate(s) {
  if (!s) return '—'
  const d = new Date(s + 'T12:00:00')
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
}
function fmtTime(t) {
  if (!t) return '—'
  const [h, m] = t.split(':').map(Number)
  const ampm = h < 12 ? 'AM' : 'PM'
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${ampm}`
}

function newEvent() {
  return { id: localId(), type: 'incident', title: '', time: timeNow(), zone: 'Sales Floor', cause: '', resolution: '', followUp: false, followUpPerson: '', followUpDate: '' }
}

function blankReport(location, author = '') {
  return {
    id: null,
    node_id: location?.id || null,
    location: location?.name || '',
    date: today(),
    shiftType: 'close',
    shiftStart: '',
    shiftEnd: '',
    // WHO
    managerOnDuty: author,
    staffPresent: [],
    // WHAT / WHEN / WHERE / WHY / HOW — events array holds them
    events: [],
    // WHAT — narrative fields
    salesNotes: '',
    generalNotes: '',
    // HOW — ops checklist
    ops: {},
    // status
    rating: 4,
    status: 'draft',
    submittedAt: null,
  }
}

// ─── Toast ────────────────────────────────────────────────────────────────────

function Toast({ msg, ok }) {
  return <div style={S.toast(ok)}>{msg}</div>
}

// ─── Section Header ───────────────────────────────────────────────────────────

function SectionHead({ icon, title, sub, color = '#00e5ff', children }) {
  return (
    <div style={S.sectionHead(color)}>
      <div style={S.sectionIcon(color)}>{icon}</div>
      <div style={{ flex: 1 }}>
        <div style={S.sectionTitle(color)}>{title}</div>
        {sub && <div style={S.sectionSub}>{sub}</div>}
      </div>
      {children}
    </div>
  )
}

// ─── WHO Section ─────────────────────────────────────────────────────────────

function WhoSection({ report, onChange, onLocationChange, locations, locationStaff }) {
  const managers = locationStaff.filter(s => MANAGER_RX.test(s.role_name || ''))
  const toggle = (name) => {
    const next = report.staffPresent.includes(name)
      ? report.staffPresent.filter(n => n !== name)
      : [...report.staffPresent, name]
    onChange('staffPresent', next)
  }
  return (
    <div style={S.card('var(--t-line)', '#00e5ff')}>
      <SectionHead icon="👤" title="WHO" sub="Who was on duty this shift?" color="#00e5ff" />
      <div style={S.grid2}>
        <div style={S.formRow}>
          <label style={S.label}>Manager On Duty *</label>
          <select style={S.select} value={report.managerOnDuty} onChange={e => onChange('managerOnDuty', e.target.value)}>
            <option value="">— Select manager —</option>
            {managers.map(m => <option key={m.id || m.full_name} value={m.full_name}>{m.full_name}</option>)}
            {report.managerOnDuty && !managers.some(m => m.full_name === report.managerOnDuty) && (
              <option value={report.managerOnDuty}>{report.managerOnDuty}</option>
            )}
            <option value="Other">Other / COO / Owner</option>
          </select>
        </div>
        <div style={S.formRow}>
          <label style={S.label}>Location *</label>
          <select style={S.select} value={report.node_id || ''} onChange={e => onLocationChange(e.target.value)}>
            <option value="">— Select location —</option>
            {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </div>
      </div>
      <div style={S.formRow}>
        <label style={S.label}>Staff Present This Shift ({report.staffPresent.length} selected)</label>
        {locationStaff.length === 0 ? (
          <div style={{ fontSize: 11, color: 'var(--t-text-muted)', fontStyle: 'italic', padding: '6px 0' }}>
            {report.node_id ? 'No staff on the roster for this location yet.' : 'Select a location to load its roster.'}
          </div>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {locationStaff.map(emp => {
              const on = report.staffPresent.includes(emp.full_name)
              const keyHolder = KEY_HOLDER_RX.test(emp.role_name || '')
              return (
                <button key={emp.id || emp.full_name} onClick={() => toggle(emp.full_name)}
                  style={{ background: on ? keyHolder ? '#ffb80022' : '#00e5ff22' : '#070b14', border: `1px solid ${on ? keyHolder ? '#ffb800' : '#00e5ff' : 'var(--t-line)'}`, color: on ? keyHolder ? '#ffb800' : '#00e5ff' : 'var(--t-text-muted)', padding: '5px 10px', fontSize: 11, fontWeight: 600, cursor: 'pointer', borderRadius: 0, transition: 'all 0.15s' }}>
                  {emp.full_name} <span style={{ fontSize: 9, opacity: 0.7 }}>{keyHolder ? '🔑' : ''}</span>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── WHEN Section ─────────────────────────────────────────────────────────────

function WhenSection({ report, onChange }) {
  return (
    <div style={S.card('var(--t-line)', '#7c4dff')}>
      <SectionHead icon="🕐" title="WHEN" sub="Date, shift type, and exact times" color="#7c4dff" />
      <div style={S.grid3}>
        <div style={S.formRow}>
          <label style={S.label}>Report Date *</label>
          <input type="date" style={S.input} value={report.date} onChange={e => onChange('date', e.target.value)} />
        </div>
        <div style={S.formRow}>
          <label style={S.label}>Shift Type</label>
          <select style={S.select} value={report.shiftType} onChange={e => onChange('shiftType', e.target.value)}>
            {SHIFT_TYPES.map(s => <option key={s.id} value={s.id}>{s.label} — {s.hours}</option>)}
          </select>
        </div>
        <div style={S.formRow}>
          <label style={S.label}>Shift Rating (1–5)</label>
          <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
            {[1, 2, 3, 4, 5].map(n => (
              <button key={n} onClick={() => onChange('rating', n)} style={{ width: 34, height: 34, background: report.rating >= n ? '#ffb80033' : '#070b14', border: `1px solid ${report.rating >= n ? '#ffb800' : 'var(--t-line)'}`, color: report.rating >= n ? '#ffb800' : 'var(--t-text-muted)', fontSize: 14, cursor: 'pointer', borderRadius: 0 }}>★</button>
            ))}
            <span style={{ fontSize: 11, color: 'var(--t-text-muted)', alignSelf: 'center', marginLeft: 4 }}>
              {['', 'Rough', 'Below Avg', 'Average', 'Good', 'Excellent'][report.rating]}
            </span>
          </div>
        </div>
      </div>
      <div style={S.grid2}>
        <div style={S.formRow}>
          <label style={S.label}>Shift Start Time</label>
          <input type="time" style={S.input} value={report.shiftStart} onChange={e => onChange('shiftStart', e.target.value)} />
        </div>
        <div style={S.formRow}>
          <label style={S.label}>Shift End Time</label>
          <input type="time" style={S.input} value={report.shiftEnd} onChange={e => onChange('shiftEnd', e.target.value)} />
        </div>
      </div>
    </div>
  )
}

// ─── Event Row (WHAT / WHEN / WHERE / WHY / HOW) ──────────────────────────────

function EventRow({ event, onChange, onRemove, idx }) {
  const et = EVENT_TYPES.find(t => t.id === event.type) || EVENT_TYPES[0]
  const [expanded, setExpanded] = useState(true)

  return (
    <div style={{ border: `1px solid ${et.color}40`, borderLeft: `4px solid ${et.color}`, background: '#070b14', marginBottom: 10 }}>
      {/* Collapse bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', cursor: 'pointer', borderBottom: expanded ? `1px solid ${et.color}20` : 'none' }} onClick={() => setExpanded(e => !e)}>
        <span style={{ fontSize: 14 }}>{et.icon}</span>
        <span style={S.badge(et.color)}>{et.label}</span>
        <span style={{ fontSize: 12, color: 'var(--t-text)', flex: 1, fontWeight: 600 }}>
          {event.title || <span style={{ color: 'var(--t-text-muted)', fontStyle: 'italic' }}>Untitled event #{idx + 1}</span>}
        </span>
        <span style={{ fontSize: 10, color: 'var(--t-text-muted)' }}>{fmtTime(event.time)}</span>
        <button onClick={e => { e.stopPropagation(); onRemove() }} style={{ ...S.btnDanger, padding: '2px 8px', fontSize: 10 }}>✕</button>
        <span style={{ fontSize: 11, color: 'var(--t-text-muted)' }}>{expanded ? '▲' : '▼'}</span>
      </div>

      {expanded && (
        <div style={{ padding: 12 }}>
          {/* WHAT + type */}
          <div style={{ ...S.grid2, marginBottom: 12 }}>
            <div>
              <label style={S.label}>WHAT — Event Type</label>
              <select style={S.select} value={event.type} onChange={e => onChange('type', e.target.value)}>
                {EVENT_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label style={S.label}>WHAT — Title / Brief Description *</label>
              <input style={S.input} placeholder="One-line summary of what happened" value={event.title} onChange={e => onChange('title', e.target.value)} />
            </div>
          </div>

          {/* WHEN + WHERE */}
          <div style={{ ...S.grid2, marginBottom: 12 }}>
            <div>
              <label style={S.label}>WHEN — Time It Occurred</label>
              <input type="time" style={S.input} value={event.time} onChange={e => onChange('time', e.target.value)} />
            </div>
            <div>
              <label style={S.label}>WHERE — Zone / Area in Store</label>
              <select style={S.select} value={event.zone} onChange={e => onChange('zone', e.target.value)}>
                {ZONES.map(z => <option key={z}>{z}</option>)}
              </select>
            </div>
          </div>

          {/* WHY */}
          <div style={{ marginBottom: 12 }}>
            <label style={S.label}>WHY — Root Cause / Context</label>
            <textarea style={S.textarea} placeholder="What caused this? What was the context or background?" value={event.cause} onChange={e => onChange('cause', e.target.value)} />
          </div>

          {/* HOW */}
          <div style={{ marginBottom: 12 }}>
            <label style={S.label}>HOW — Resolution / Action Taken</label>
            <textarea style={S.textarea} placeholder="How was this handled? What steps were taken? What was the outcome?" value={event.resolution} onChange={e => onChange('resolution', e.target.value)} />
          </div>

          {/* Follow-up */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', background: event.followUp ? '#ffb80011' : 'transparent', border: `1px solid ${event.followUp ? '#ffb80040' : 'var(--t-line)'}` }}>
            <input type="checkbox" checked={event.followUp} onChange={e => onChange('followUp', e.target.checked)} style={{ accentColor: '#ffb800' }} id={`fu-${event.id}`} />
            <label htmlFor={`fu-${event.id}`} style={{ fontSize: 11, fontWeight: 600, color: event.followUp ? '#ffb800' : 'var(--t-text-muted)', cursor: 'pointer' }}>Requires Follow-Up</label>
            {event.followUp && (
              <>
                <input style={{ ...S.input, width: 160, marginLeft: 8 }} placeholder="Assign to..." value={event.followUpPerson} onChange={e => onChange('followUpPerson', e.target.value)} />
                <input type="date" style={{ ...S.input, width: 140 }} value={event.followUpDate} onChange={e => onChange('followUpDate', e.target.value)} />
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── WHAT Section (events + sales notes) ─────────────────────────────────────

function WhatSection({ report, onChange }) {
  const addEvent = () => onChange('events', [...report.events, newEvent()])
  const removeEvent = (id) => onChange('events', report.events.filter(e => e.id !== id))
  const updateEvent = (id, field, val) => onChange('events', report.events.map(e => e.id === id ? { ...e, [field]: val } : e))

  const incidents = report.events.filter(e => e.type === 'incident' || e.type === 'safety' || e.type === 'customer')
  const highlights = report.events.filter(e => e.type === 'highlight')
  const followUps = report.events.filter(e => e.followUp)

  return (
    <div style={S.card('var(--t-line)', '#ff4d7d')}>
      <SectionHead icon="📋" title="WHAT" sub="Events, incidents, highlights — each with full 5W+H detail" color="#ff4d7d">
        <div style={{ display: 'flex', gap: 8 }}>
          {incidents.length > 0 && <span style={S.badge('#ff4d7d')}>{incidents.length} incident{incidents.length > 1 ? 's' : ''}</span>}
          {highlights.length > 0 && <span style={S.badge('#2ad6a0')}>{highlights.length} highlight{highlights.length > 1 ? 's' : ''}</span>}
          {followUps.length > 0 && <span style={S.badge('#ffb800')}>{followUps.length} follow-up{followUps.length > 1 ? 's' : ''}</span>}
        </div>
      </SectionHead>

      {report.events.length === 0 && (
        <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--t-text-muted)', fontSize: 12 }}>
          No events logged yet. Use the button below to document anything notable from this shift.
        </div>
      )}

      {report.events.map((ev, idx) => (
        <EventRow key={ev.id} event={ev} idx={idx}
          onChange={(f, v) => updateEvent(ev.id, f, v)}
          onRemove={() => removeEvent(ev.id)} />
      ))}

      <button onClick={addEvent} style={{ ...S.btn('#ff4d7d22', '#ff4d7d'), border: '1px dashed #ff4d7d60', width: '100%', marginBottom: 16 }}>
        + Log Event / Incident / Highlight
      </button>

      <div style={S.divider} />

      <div style={S.formRow}>
        <label style={S.label}>Sales Notes (performance, big tickets, product feedback)</label>
        <textarea style={{ ...S.textarea, minHeight: 60 }} placeholder="How was traffic? Any notable sales? Product feedback from customers?" value={report.salesNotes} onChange={e => onChange('salesNotes', e.target.value)} />
      </div>

      <div style={S.formRow}>
        <label style={S.label}>General Shift Notes (anything else worth documenting)</label>
        <textarea style={{ ...S.textarea, minHeight: 60 }} placeholder="Staffing dynamics, morale, anything the next manager needs to know..." value={report.generalNotes} onChange={e => onChange('generalNotes', e.target.value)} />
      </div>
    </div>
  )
}

// ─── WHERE Section ────────────────────────────────────────────────────────────

function WhereSection({ report, onChange, onLocationChange, locations }) {
  return (
    <div style={S.card('var(--t-line)', '#2979ff')}>
      <SectionHead icon="📍" title="WHERE" sub="Location context and store conditions" color="#2979ff" />
      <div style={S.grid3}>
        <div style={S.formRow}>
          <label style={S.label}>Store Location</label>
          <select style={S.select} value={report.node_id || ''} onChange={e => onLocationChange(e.target.value)}>
            <option value="">— Select location —</option>
            {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </div>
        <div style={S.formRow}>
          <label style={S.label}>Store Condition at Open</label>
          <select style={S.select} value={report.storeConditionOpen || 'good'} onChange={e => onChange('storeConditionOpen', e.target.value)}>
            <option value="excellent">Excellent — Ready to go</option>
            <option value="good">Good — Minor cleanup needed</option>
            <option value="fair">Fair — Notable issues found</option>
            <option value="poor">Poor — Major issues (see notes)</option>
          </select>
        </div>
        <div style={S.formRow}>
          <label style={S.label}>Store Condition at Close</label>
          <select style={S.select} value={report.storeConditionClose || 'good'} onChange={e => onChange('storeConditionClose', e.target.value)}>
            <option value="excellent">Excellent — Left spotless</option>
            <option value="good">Good — Clean and organized</option>
            <option value="fair">Fair — Some items pending</option>
            <option value="poor">Poor — Left issues for next shift</option>
          </select>
        </div>
      </div>
      <div style={S.formRow}>
        <label style={S.label}>Condition Notes (issues found, items left for next shift)</label>
        <textarea style={{ ...S.textarea, minHeight: 50 }} placeholder="Describe any physical store conditions worth noting..." value={report.conditionNotes || ''} onChange={e => onChange('conditionNotes', e.target.value)} />
      </div>
    </div>
  )
}

// ─── HOW Section (Ops Checklist) ─────────────────────────────────────────────

function HowSection({ report, onChange }) {
  const toggleOps = (id) => onChange('ops', { ...report.ops, [id]: !report.ops[id] })
  const completedCount = OPS_CHECKLIST.filter(i => report.ops[i.id]).length
  const pct = Math.round((completedCount / OPS_CHECKLIST.length) * 100)

  return (
    <div style={S.card('var(--t-line)', '#2ad6a0')}>
      <SectionHead icon="✅" title="HOW" sub="Standard operating procedures — what was completed this shift" color="#2ad6a0">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ fontSize: 20, fontWeight: 900, color: pct >= 80 ? '#2ad6a0' : pct >= 50 ? '#ffb800' : '#ff4d7d' }}>{pct}%</div>
          <span style={{ fontSize: 10, color: 'var(--t-text-muted)' }}>{completedCount}/{OPS_CHECKLIST.length} complete</span>
        </div>
      </SectionHead>

      {/* Progress bar */}
      <div style={{ height: 4, background: 'var(--t-line)', marginBottom: 14 }}>
        <div style={{ height: '100%', width: pct + '%', background: pct >= 80 ? '#2ad6a0' : pct >= 50 ? '#ffb800' : '#ff4d7d', transition: 'width 0.3s' }} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
        {OPS_CHECKLIST.map(item => (
          <label key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', background: report.ops[item.id] ? '#2ad6a011' : 'transparent', border: `1px solid ${report.ops[item.id] ? '#2ad6a040' : 'var(--t-line)'}`, cursor: 'pointer', transition: 'all 0.15s' }}>
            <input type="checkbox" checked={!!report.ops[item.id]} onChange={() => toggleOps(item.id)} style={{ accentColor: '#2ad6a0', flexShrink: 0 }} />
            <span style={{ fontSize: 11, color: report.ops[item.id] ? '#2ad6a0' : 'var(--t-text-muted)', fontWeight: report.ops[item.id] ? 600 : 400 }}>{item.label}</span>
          </label>
        ))}
      </div>

      <div style={{ ...S.formRow, marginTop: 12 }}>
        <label style={S.label}>HOW — Any deviations or incomplete items explained</label>
        <textarea style={{ ...S.textarea, minHeight: 50 }} placeholder="If any checklist items were skipped or incomplete, explain why..." value={report.opsNotes || ''} onChange={e => onChange('opsNotes', e.target.value)} />
      </div>
    </div>
  )
}

// ─── WHY Section ──────────────────────────────────────────────────────────────

function WhySection({ report, onChange }) {
  return (
    <div style={S.card('var(--t-line)', '#ffb800')}>
      <SectionHead icon="💡" title="WHY" sub="Context, decisions, and root causes for anything unusual" color="#ffb800" />
      <div style={S.formRow}>
        <label style={S.label}>Why was this shift rated {['', 'Rough (1)', 'Below Avg (2)', 'Average (3)', 'Good (4)', 'Excellent (5)'][report.rating]}?</label>
        <textarea style={{ ...S.textarea, minHeight: 60 }} placeholder="What drove the overall shift rating? What contributed positively or negatively?" value={report.ratingContext || ''} onChange={e => onChange('ratingContext', e.target.value)} />
      </div>
      <div style={S.formRow}>
        <label style={S.label}>Staffing decisions made this shift (call-outs covered, overtime, adjustments)</label>
        <textarea style={{ ...S.textarea, minHeight: 50 }} placeholder="Why were any staffing adjustments made? Who covered what and why?" value={report.staffingContext || ''} onChange={e => onChange('staffingContext', e.target.value)} />
      </div>
      <div style={S.formRow}>
        <label style={S.label}>Anything leadership needs to be aware of?</label>
        <textarea style={{ ...S.textarea, minHeight: 50 }} placeholder="Flag anything that should escalate to COO / Owner / HR..." value={report.escalation || ''} onChange={e => onChange('escalation', e.target.value)} />
      </div>
    </div>
  )
}

// ─── Summary Card ─────────────────────────────────────────────────────────────

function ReportSummaryCard({ report, onView, onDelete }) {
  const shiftDef = SHIFT_TYPES.find(s => s.id === report.shiftType) || SHIFT_TYPES[2]
  const incidents = report.events?.filter(e => e.type === 'incident' || e.type === 'safety' || e.type === 'customer') || []
  const highlights = report.events?.filter(e => e.type === 'highlight') || []
  const followUps = report.events?.filter(e => e.followUp) || []
  const opsComplete = OPS_CHECKLIST.filter(i => report.ops?.[i.id]).length
  const statusColor = report.status === 'submitted' ? '#2ad6a0' : '#ffb800'
  const ratingColor = report.rating >= 4 ? '#2ad6a0' : report.rating >= 3 ? '#ffb800' : '#ff4d7d'

  return (
    <div style={{ ...S.card(), marginBottom: 10 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--t-text)' }}>{fmtDate(report.date)}</span>
            <span style={S.badge('#7c4dff')}>{report.location}</span>
            <span style={S.badge('#2979ff')}>{shiftDef.label}</span>
            <span style={S.badge(statusColor)}>{report.status}</span>
          </div>
          <div style={{ fontSize: 11, color: 'var(--t-text-muted)', marginBottom: 8 }}>
            Manager: <span style={{ color: 'var(--t-text)', fontWeight: 600 }}>{report.managerOnDuty || '—'}</span>
            {' · '}{report.staffPresent?.length || 0} staff on shift
            {' · '}{opsComplete}/{OPS_CHECKLIST.length} ops complete
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {incidents.length > 0 && <span style={S.badge('#ff4d7d')}>{incidents.length} incident{incidents.length > 1 ? 's' : ''}</span>}
            {highlights.length > 0 && <span style={S.badge('#2ad6a0')}>{highlights.length} highlight{highlights.length > 1 ? 's' : ''}</span>}
            {followUps.length > 0 && <span style={S.badge('#ffb800')}>{followUps.length} follow-up{followUps.length > 1 ? 's' : ''}</span>}
            <span style={{ fontSize: 10, color: ratingColor, fontWeight: 700 }}>{'★'.repeat(report.rating || 0)}</span>
            {report.escalation?.trim() && <span style={S.badge('#ff6d00')}>ESCALATION FLAGGED</span>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={onView} style={S.btnSm('#00e5ff')}>View / Edit</button>
          <button onClick={onDelete} style={{ ...S.btnSm('#ff4d7d'), borderColor: 'rgba(255,77,125,0.4)' }}>Delete</button>
        </div>
      </div>
    </div>
  )
}

// ─── Follow-Up Tracker ────────────────────────────────────────────────────────

function FollowUpTracker({ reports }) {
  const allFollowUps = reports.flatMap(r =>
    (r.events || []).filter(e => e.followUp).map(e => ({ ...e, reportDate: r.date, reportLocation: r.location, reportManager: r.managerOnDuty }))
  )
  const overdue = allFollowUps.filter(f => f.followUpDate && f.followUpDate < today())
  const upcoming = allFollowUps.filter(f => f.followUpDate && f.followUpDate >= today())
  const unscheduled = allFollowUps.filter(f => !f.followUpDate)

  if (allFollowUps.length === 0) return (
    <div style={{ ...S.card(), textAlign: 'center', padding: '20px 0', color: 'var(--t-text-muted)', fontSize: 12 }}>
      No open follow-ups across all reports.
    </div>
  )

  const FuRow = ({ fu, accent }) => (
    <div style={{ ...S.card(accent + '40', accent), marginBottom: 8 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        <span style={S.badge(EVENT_TYPES.find(t => t.id === fu.type)?.color || '#aaa')}>{EVENT_TYPES.find(t => t.id === fu.type)?.label || 'EVENT'}</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--t-text)' }}>{fu.title}</div>
          <div style={{ fontSize: 10, color: 'var(--t-text-muted)', marginTop: 2 }}>
            From: {fmtDate(fu.reportDate)} · {fu.reportLocation} · {fu.reportManager}
            {fu.followUpPerson && <> · Assigned: <span style={{ color: 'var(--t-text)', fontWeight: 600 }}>{fu.followUpPerson}</span></>}
            {fu.followUpDate && <> · Due: <span style={{ color: accent, fontWeight: 600 }}>{fmtDate(fu.followUpDate)}</span></>}
          </div>
        </div>
      </div>
    </div>
  )

  return (
    <>
      {overdue.length > 0 && (
        <>
          <div style={{ ...S.sectionTitle('#ff4d7d'), marginBottom: 8 }}>OVERDUE ({overdue.length})</div>
          {overdue.map((f, i) => <FuRow key={i} fu={f} accent="#ff4d7d" />)}
        </>
      )}
      {upcoming.length > 0 && (
        <>
          <div style={{ ...S.sectionTitle('#ffb800'), marginBottom: 8, marginTop: 12 }}>UPCOMING ({upcoming.length})</div>
          {upcoming.map((f, i) => <FuRow key={i} fu={f} accent="#ffb800" />)}
        </>
      )}
      {unscheduled.length > 0 && (
        <>
          <div style={{ ...S.sectionTitle('#7c4dff'), marginBottom: 8, marginTop: 12 }}>UNSCHEDULED ({unscheduled.length})</div>
          {unscheduled.map((f, i) => <FuRow key={i} fu={f} accent="#7c4dff" />)}
        </>
      )}
    </>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ShiftReport() {
  const enabled = useFeatureFlag('shift_report')
  const { session } = useAuth()
  const { locations, locationIds } = useScope()

  const me = getSession()
  const person = session?.person || {}
  const roleName = (person.role_name || '').toLowerCase()
  const isManager = ['ceo', 'manager', 'coo', 'admin', 'owner', 'hr'].some(r => roleName.includes(r)) || /key\s*holder|lead/i.test(person.role_name || '')
  const authorName = person.full_name || me.full_name || 'Manager'
  const personId = person.id || me.id || null

  const defaultLoc = locations?.[0] || null

  const [reports, setReports] = useState([])
  const [roster, setRoster] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [view, setView] = useState('list') // 'list' | 'form' | 'followups'
  const [activeReport, setActiveReport] = useState(null)
  const [toast, setToast] = useState(null)
  const [filterLoc, setFilterLoc] = useState('All')
  const [filterStatus, setFilterStatus] = useState('All')

  const showToast = (msg, ok = true) => {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 3000)
  }

  const nodeKey = (locationIds || []).join(',')

  // ── Load reports from the real backend, scoped to the caller's locations ──
  const loadReports = useCallback(async () => {
    if (!locationIds || locationIds.length === 0) { setReports([]); setLoading(false); return }
    setLoading(true)
    const { data, error } = await sb.rpc('get_shift_reports', { p_node_ids: locationIds })
    if (error) {
      showToast('Could not load shift reports: ' + error.message, false)
      setReports([])
    } else {
      setReports(Array.isArray(data) ? data : [])
    }
    setLoading(false)
  }, [nodeKey])

  useEffect(() => { loadReports() }, [loadReports])

  // ── Load the real staff roster (scoped) for the WHO section ──
  useEffect(() => {
    if (!locationIds || locationIds.length === 0) { setRoster([]); return }
    let alive = true
    sb.rpc('get_roster', { p_node_ids: locationIds, p_actor: personId || null }).then(({ data, error }) => {
      if (!alive) return
      setRoster(!error && Array.isArray(data) ? data : [])
    })
    return () => { alive = false }
  }, [nodeKey])

  const persist = useCallback(async (statusOverride) => {
    if (!activeReport) return null
    if (!activeReport.node_id) { showToast('Select a location', false); return null }
    setSaving(true)
    const status = statusOverride || activeReport.status || 'draft'
    const { data, error } = await sb.rpc('shift_report_upsert', {
      p_id: activeReport.id || null,
      p_node_id: activeReport.node_id,
      p_data: activeReport,
      p_status: status,
      p_author: authorName,
      p_author_id: personId,
    })
    setSaving(false)
    if (error) { showToast('Not saved: ' + error.message, false); return null }
    if (data) setActiveReport(data)
    await loadReports()
    return data
  }, [activeReport, authorName, personId, loadReports])

  const save = useCallback(async () => {
    const res = await persist('draft')
    if (res) showToast('Report saved as draft')
  }, [persist])

  const submit = useCallback(async () => {
    if (!activeReport) return
    if (!activeReport.managerOnDuty) { showToast('Manager on duty required', false); return }
    if (!activeReport.staffPresent || activeReport.staffPresent.length === 0) { showToast('Select at least one staff member', false); return }
    const res = await persist('submitted')
    if (res) { showToast('Shift report submitted!'); setView('list') }
  }, [activeReport, persist])

  const startNew = () => {
    if (!defaultLoc) { showToast('No location available for your account', false); return }
    setActiveReport(blankReport(defaultLoc, authorName))
    setView('form')
  }

  const editReport = (r) => { setActiveReport({ ...r }); setView('form') }

  const deleteReport = async (id) => {
    if (!window.confirm('Delete this shift report?')) return
    const { error } = await sb.rpc('shift_report_delete', { p_id: id })
    if (error) { showToast('Could not delete: ' + error.message, false); return }
    await loadReports()
    showToast('Report deleted')
  }

  const updateField = (field, value) => setActiveReport(prev => ({ ...prev, [field]: value }))

  const changeLocation = (nodeId) => {
    const loc = (locations || []).find(l => l.id === nodeId)
    setActiveReport(prev => ({ ...prev, node_id: nodeId || null, location: loc?.name || '' }))
  }

  // Filtered reports (client-side over the real, server-scoped set)
  const filtered = reports
    .filter(r => filterLoc === 'All' || r.location === filterLoc)
    .filter(r => filterStatus === 'All' || r.status === filterStatus)
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''))

  const totalIncidents = reports.flatMap(r => r.events || []).filter(e => e.type === 'incident' || e.type === 'safety').length
  const openFollowUps = reports.flatMap(r => (r.events || []).filter(e => e.followUp)).length
  const submittedCount = reports.filter(r => r.status === 'submitted').length

  const locationStaff = roster.filter(s => {
    if (!activeReport?.node_id) return false
    return s.node_id === activeReport.node_id || s.node_name === activeReport.location
  })

  if (!enabled) return (
    <div style={{ ...S.page, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center', color: 'var(--t-text-muted)' }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>🔒</div>
        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--t-text)' }}>Shift Reports</div>
        <div style={{ fontSize: 12, marginTop: 6 }}>Feature not enabled. Enable via Feature Toggles.</div>
      </div>
    </div>
  )

  return (
    <div style={S.page}>
      {toast && <Toast {...toast} />}

      {/* ─── Header ─── */}
      <div style={S.header}>
        <div>
          <h1 style={S.title}>Shift Reports</h1>
          <p style={S.subtitle}>WHO · WHAT · WHEN · WHERE · WHY · HOW — end-of-shift accountability documentation</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {view === 'form' && (
            <>
              <span style={S.badge(activeReport?.status === 'submitted' ? '#2ad6a0' : '#ffb800')}>
                {activeReport?.status === 'submitted' ? 'SUBMITTED' : 'DRAFT'}
              </span>
              <button onClick={save} disabled={saving} style={S.btn('#7c4dff', '#fff')}>{saving ? 'Saving…' : 'Save Draft'}</button>
              <button onClick={submit} disabled={saving} style={S.btn('#2ad6a0', '#070b14')}>Submit Report</button>
              <button onClick={() => setView('list')} style={S.btnOutline('#aaa')}>← Back</button>
            </>
          )}
          {view !== 'form' && isManager && (
            <button onClick={startNew} style={S.btn()}>+ New Shift Report</button>
          )}
          {view !== 'form' && (
            <>
              <button onClick={() => setView(view === 'followups' ? 'list' : 'followups')} style={S.btnOutline(openFollowUps > 0 ? '#ffb800' : '#aaa')}>
                Follow-Ups {openFollowUps > 0 ? `(${openFollowUps})` : ''}
              </button>
            </>
          )}
        </div>
      </div>

      <div style={S.body}>

        {/* ─── KPI Bar ─── */}
        {view !== 'form' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 20 }}>
            {[
              { label: 'Total Reports', value: reports.length, color: '#00e5ff' },
              { label: 'Submitted', value: submittedCount, color: '#2ad6a0' },
              { label: 'Total Incidents', value: totalIncidents, color: '#ff4d7d' },
              { label: 'Open Follow-Ups', value: openFollowUps, color: '#ffb800' },
            ].map(k => (
              <div key={k.label} style={{ background: 'var(--t-surface)', border: `1px solid var(--t-line)`, borderTop: `3px solid ${k.color}`, padding: '12px 14px' }}>
                <div style={{ fontSize: 22, fontWeight: 900, color: k.color }}>{k.value}</div>
                <div style={{ fontSize: 10, color: 'var(--t-text-muted)', marginTop: 2, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{k.label}</div>
              </div>
            ))}
          </div>
        )}

        {/* ─── Follow-Up Tracker ─── */}
        {view === 'followups' && (
          <>
            <div style={S.card()}>
              <SectionHead icon="🔔" title="Open Follow-Ups" sub="Items requiring action from past shift reports" color="#ffb800" />
              <FollowUpTracker reports={reports} />
            </div>
          </>
        )}

        {/* ─── Report List ─── */}
        {view === 'list' && (
          <>
            <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ fontSize: 10, color: 'var(--t-text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>Filter:</span>
              <select style={{ ...S.select, width: 'auto', minWidth: 130 }} value={filterLoc} onChange={e => setFilterLoc(e.target.value)}>
                <option value="All">All Locations</option>
                {(locations || []).map(l => <option key={l.id} value={l.name}>{l.name}</option>)}
              </select>
              <select style={{ ...S.select, width: 'auto', minWidth: 120 }} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
                <option value="All">All Status</option>
                <option value="draft">Drafts</option>
                <option value="submitted">Submitted</option>
              </select>
              <span style={{ fontSize: 11, color: 'var(--t-text-muted)', marginLeft: 4 }}>Showing {filtered.length} of {reports.length}</span>
            </div>

            {loading && (
              <div style={{ ...S.card(), textAlign: 'center', padding: '40px 20px', color: 'var(--t-text-muted)', fontSize: 12 }}>
                Loading shift reports…
              </div>
            )}

            {!loading && filtered.length === 0 && (
              <div style={{ ...S.card(), textAlign: 'center', padding: '40px 20px', color: 'var(--t-text-muted)' }}>
                <div style={{ fontSize: 28, marginBottom: 10 }}>📋</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--t-text)', marginBottom: 6 }}>No shift reports yet</div>
                <div style={{ fontSize: 12 }}>Every shift should end with a report. It takes 3 minutes and prevents a week of confusion.</div>
                {isManager && <button onClick={startNew} style={{ ...S.btn(), marginTop: 16 }}>Create First Report</button>}
              </div>
            )}

            {!loading && filtered.map(r => (
              <ReportSummaryCard key={r.id} report={r}
                onView={() => editReport(r)}
                onDelete={() => deleteReport(r.id)} />
            ))}
          </>
        )}

        {/* ─── Report Form ─── */}
        {view === 'form' && activeReport && (
          <>
            {/* Form header */}
            <div style={{ ...S.card('#00e5ff40', '#00e5ff'), marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ fontSize: 22, fontWeight: 900, color: '#00e5ff' }}>📋</div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--t-text)' }}>
                    {activeReport.status === 'submitted' ? 'Viewing' : 'Editing'} Shift Report
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--t-text-muted)', marginTop: 2 }}>
                    Every field maps to WHO · WHAT · WHEN · WHERE · WHY · HOW — this stops confusion between shifts.
                  </div>
                </div>
              </div>
            </div>

            <WhoSection report={activeReport} onChange={updateField} onLocationChange={changeLocation} locations={locations || []} locationStaff={locationStaff} />
            <WhenSection report={activeReport} onChange={updateField} />
            <WhereSection report={activeReport} onChange={updateField} onLocationChange={changeLocation} locations={locations || []} />
            <WhatSection report={activeReport} onChange={updateField} />
            <WhySection report={activeReport} onChange={updateField} />
            <HowSection report={activeReport} onChange={updateField} />

            {/* Bottom actions */}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 10, paddingBottom: 40 }}>
              <button onClick={() => setView('list')} style={S.btnOutline('#aaa')}>Cancel</button>
              <button onClick={save} disabled={saving} style={S.btn('#7c4dff', '#fff')}>{saving ? 'Saving…' : 'Save Draft'}</button>
              <button onClick={submit} disabled={saving} style={{ ...S.btn('#2ad6a0', '#070b14'), fontSize: 13, padding: '10px 24px' }}>Submit Shift Report</button>
            </div>
          </>
        )}

      </div>
    </div>
  )
}
