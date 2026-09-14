import React, { useState, useCallback, useRef, useMemo, useEffect } from 'react'
import { useFeatureFlag } from '../lib/featureFlags.js'
import { useConfig } from '../lib/config.js'
import { useAuth } from '../lib/auth.jsx'
import { useScope } from '../lib/scope.jsx'
import { sb, getSession } from '../lib/supabase'
import DrillDown from '../components/DrillDown.jsx'

// ─── Date utilities ────────────────────────────────────────────────────────────
const _today = new Date()
const fmtIso  = (d) => d.toISOString().slice(0, 10)
const addDays = (d, n) => { const r = new Date(d); r.setDate(r.getDate() + n); return r }
const TODAY   = fmtIso(_today)

const fmtDate = (str) => {
  if (!str) return '—'
  const d = new Date(str + 'T00:00:00')
  if (isNaN(d)) return '—'
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

// ─── Config / enums (labels & templates, not data) ──────────────────────────────
const VISIT_TYPES  = ['Routine', 'Compliance', 'Surprise', 'Training']
const VISIT_TYPE_VARIANT = { Routine: 'accent', Compliance: 'amber', Surprise: 'red', Training: 'green' }

const CATEGORY_TAGS = ['Training', 'Compliance', 'Operations', 'Inventory', 'Cleanliness']
const CAT_VARIANT   = { Training: 'green', Compliance: 'amber', Operations: 'accent', Inventory: 'purple', Cleanliness: 'cyan' }

const INSPECTION_ITEMS = [
  'Floor clean',
  'Product stocked',
  'Register balanced',
  "I-9s current",
  'Schedule posted',
  'Safety exits clear',
  'Break compliance',
  'Opening/closing checklist complete',
]

const PRIORITY_LABELS = ['HIGH', 'MEDIUM', 'LOW']
const PRIORITY_VARIANT = { HIGH: 'red', MEDIUM: 'amber', LOW: 'green' }
const ITEM_STATUSES = ['OPEN', 'IN PROGRESS', 'COMPLETE']
const ITEM_STATUS_VARIANT = { 'OPEN': 'red', 'IN PROGRESS': 'amber', 'COMPLETE': 'green' }

// ─── Normalizers: RPC (snake_case) → view model ──────────────────────────────────
const normVisit = (r) => ({
  id:              r.id,
  nodeId:          r.node_id ?? null,
  location:        r.location_name || '—',
  visitType:       r.visit_type || 'Routine',
  date:            r.visit_date || null,
  managerPresent:  r.manager_present || '—',
  dm:              r.visited_by || '—',
  score:           Number.isFinite(r.score) ? r.score : (parseInt(r.score, 10) || 0),
  summary:         r.summary || '',
  findings:        r.findings || '',
  tags:            Array.isArray(r.tags) ? r.tags : [],
  actionItemCount: Number(r.action_item_count) || 0,
  scoreBreakdown:  (r.score_breakdown && typeof r.score_breakdown === 'object') ? r.score_breakdown : {},
  checklist:       (r.checklist && typeof r.checklist === 'object') ? r.checklist : {},
})

const normItem = (r) => ({
  id:         r.id,
  visitId:    r.visit_id ?? null,
  nodeId:     r.node_id ?? null,
  item:       r.item || '',
  location:   r.location_name || '—',
  visitDate:  r.visit_date || null,
  assignedTo: r.assigned_to || '—',
  dueDate:    r.due_date || null,
  status:     r.status || 'OPEN',
  priority:   r.priority || 'MEDIUM',
})

// ─── Feature Disabled ──────────────────────────────────────────────────────────
function FeatureDisabledMsg() {
  return (
    <div style={S.page}>
      <div style={S.pageHeader}>
        <div style={S.pageTitle}>STORE VISIT / COMPLIANCE LOG</div>
        <div style={S.pageSub}>Log field visits, track findings, and follow-up action items</div>
      </div>
      <div style={{ padding: '40px 24px', textAlign: 'center', color: 'var(--t-text-faint)', fontSize: 13 }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>—</div>
        <div style={{ fontWeight: 700, color: 'var(--t-text-muted)', marginBottom: 8 }}>Store Visit Log is not enabled</div>
        <div>Contact your administrator to enable this feature.</div>
      </div>
    </div>
  )
}

function AccessRestricted() {
  return (
    <div style={S.page}>
      <div style={S.pageHeader}>
        <div style={S.pageTitle}>STORE VISIT / COMPLIANCE LOG</div>
        <div style={S.pageSub}>Log field visits, track findings, and follow-up action items</div>
      </div>
      <div style={{ padding: '40px 24px', textAlign: 'center', color: 'var(--t-text-faint)', fontSize: 13 }}>
        <div style={{ fontWeight: 700, color: '#ff4d7d', marginBottom: 8, fontSize: 15 }}>Access Restricted</div>
        <div>District Manager and above only.</div>
      </div>
    </div>
  )
}

// ─── Styles ────────────────────────────────────────────────────────────────────
const S = {
  page:       { padding: '0 0 48px 0', minHeight: '100vh', background: 'var(--t-bg, #070b14)' },
  pageHeader: { padding: '20px 24px 16px', borderBottom: '1px solid var(--t-line)' },
  pageTitle:  { fontSize: 20, fontWeight: 800, color: 'var(--t-text)', margin: 0, letterSpacing: '-0.3px' },
  pageSub:    { fontSize: 12, color: 'var(--t-text-muted)', marginTop: 4 },
  body:       { padding: '20px 24px' },

  kpiGrid: (cols) => ({ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 12, marginBottom: 20 }),
  kpiTile: (variant) => ({
    background: variant === 'danger'  ? 'rgba(255,77,125,0.07)'
              : variant === 'success' ? 'rgba(42,214,160,0.05)'
              : variant === 'warn'    ? 'rgba(255,179,71,0.06)'
              : 'var(--t-surface)',
    border: `1px solid ${
      variant === 'danger'  ? 'rgba(255,77,125,0.25)'
    : variant === 'success' ? 'rgba(42,214,160,0.18)'
    : variant === 'warn'    ? 'rgba(255,179,71,0.22)'
    : 'var(--t-line)'}`,
    padding: '14px 16px',
  }),
  kpiLabel: { fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--t-text-muted)', marginBottom: 6 },
  kpiValue: (color) => ({ fontSize: 26, fontWeight: 800, lineHeight: 1, color: color || 'var(--t-text)' }),
  kpiSub:   { fontSize: 11, color: 'var(--t-text-faint)', marginTop: 4 },

  sectionLabel: { fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--t-text-muted)', marginBottom: 10 },

  tabBar: { display: 'flex', gap: 0, borderBottom: '1px solid var(--t-line)', marginBottom: 20 },
  tab:    (active) => ({ padding: '10px 18px', fontSize: 12, fontWeight: 700, cursor: 'pointer', border: 'none', background: 'none', color: active ? 'var(--t-accent)' : 'var(--t-text-muted)', borderBottom: active ? '2px solid var(--t-accent)' : '2px solid transparent', letterSpacing: '0.04em', marginBottom: -1 }),

  card:       { background: 'var(--t-surface)', border: '1px solid var(--t-line)', marginBottom: 12 },
  cardHead:   { padding: '12px 16px', borderBottom: '1px solid var(--t-line)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' },
  cardTitle:  { fontSize: 12, fontWeight: 800, color: 'var(--t-text)', letterSpacing: '0.04em', textTransform: 'uppercase' },
  cardBody:   { padding: 16 },

  th:   { padding: '10px 14px', textAlign: 'left', fontWeight: 700, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--t-text-muted)', borderBottom: '2px solid var(--t-line)', background: 'var(--t-surface)', whiteSpace: 'nowrap' },
  td:   { padding: '10px 14px', borderBottom: '1px solid var(--t-line)', color: 'var(--t-text)', verticalAlign: 'middle' },

  btn:        { padding: '8px 16px', fontSize: 12, fontWeight: 700, border: '1px solid var(--t-line)', background: 'var(--t-surface-2)', color: 'var(--t-text)', cursor: 'pointer', letterSpacing: '0.03em' },
  btnSm:      { padding: '6px 12px', fontSize: 11, fontWeight: 700, border: '1px solid var(--t-line)', background: 'var(--t-surface-2)', color: 'var(--t-text)', cursor: 'pointer', letterSpacing: '0.03em' },
  btnAccent:  { background: 'var(--t-accent)', color: '#000', border: '1px solid var(--t-accent)' },
  btnSuccess: { background: 'rgba(42,214,160,0.15)', color: '#2ad6a0', border: '1px solid rgba(42,214,160,0.28)' },
  btnDanger:  { background: 'rgba(255,77,125,0.14)', color: '#ff4d7d', border: '1px solid rgba(255,77,125,0.28)' },

  select:   { background: 'var(--t-bg, #070b14)', border: '1px solid var(--t-line)', color: 'var(--t-text)', padding: '8px 10px', fontSize: 12, fontFamily: 'inherit', boxSizing: 'border-box' },
  input:    { background: 'var(--t-bg, #070b14)', border: '1px solid var(--t-line)', color: 'var(--t-text)', padding: '8px 10px', fontSize: 12, fontFamily: 'inherit', boxSizing: 'border-box' },
  textarea: { background: 'var(--t-bg, #070b14)', border: '1px solid var(--t-line)', color: 'var(--t-text)', padding: '8px 10px', fontSize: 12, fontFamily: 'inherit', boxSizing: 'border-box', width: '100%', resize: 'vertical', minHeight: 80 },
  label:    { display: 'block', fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--t-text-muted)', marginBottom: 5 },
  formRow:  { marginBottom: 14 },

  toast: (type) => ({
    position: 'fixed', bottom: 24, right: 24, zIndex: 9999,
    background: type === 'success' ? '#2ad6a0' : type === 'error' ? '#ff4d7d' : 'var(--t-accent)',
    color: type === 'info' ? '#000' : '#fff',
    padding: '12px 20px', fontWeight: 700, fontSize: 13,
    boxShadow: '0 4px 24px rgba(0,0,0,0.4)',
  }),

  empty:  { padding: '32px 20px', textAlign: 'center', color: 'var(--t-text-faint)', fontSize: 13 },
  divider:{ height: 1, background: 'var(--t-line)', margin: '14px 0' },
}

// ─── Toast hook ────────────────────────────────────────────────────────────────
function useToast() {
  const [toast, setToast] = useState(null)
  const timerRef = useRef(null)
  const show = useCallback((msg, type = 'success') => {
    if (timerRef.current) clearTimeout(timerRef.current)
    setToast({ msg, type })
    timerRef.current = setTimeout(() => setToast(null), 3200)
  }, [])
  return { toast, show }
}

// ─── Badge helpers ─────────────────────────────────────────────────────────────
function Bdg({ variant, children }) {
  return <span className={`badge ${variant}`}>{children}</span>
}

function statusBdg(s) {
  const v = ITEM_STATUS_VARIANT[s] || 'accent'
  return <Bdg variant={v}>{s}</Bdg>
}

function priorityBdg(p) {
  return <Bdg variant={PRIORITY_VARIANT[p] || 'green'}>{p}</Bdg>
}

// ─── KPI Tile ──────────────────────────────────────────────────────────────────
function KpiTile({ label, value, sub, valueColor, variant, onClick }) {
  return (
    <div onClick={onClick} title={onClick ? 'Click to drill into records' : undefined}
      style={{ ...S.kpiTile(variant), cursor: onClick ? 'pointer' : 'default' }}>
      <div style={S.kpiLabel}>{label}</div>
      <div style={S.kpiValue(valueColor)}>{value}</div>
      {sub && <div style={S.kpiSub}>{sub}</div>}
    </div>
  )
}

// ─── Score bar ─────────────────────────────────────────────────────────────────
function ScoreBar({ score }) {
  const color = score >= 90 ? '#2ad6a0' : score >= 75 ? '#ffb800' : '#ff4d7d'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ flex: 1, height: 6, background: 'var(--t-line)', position: 'relative' }}>
        <div style={{ width: `${score}%`, height: '100%', background: color, transition: 'width 0.3s' }} />
      </div>
      <span style={{ fontSize: 13, fontWeight: 800, color, minWidth: 48, textAlign: 'right' }}>
        {score}/100
      </span>
    </div>
  )
}

// ─── Visit Detail Expand ───────────────────────────────────────────────────────
function VisitDetail({ visit, isManager, showToast, reload }) {
  const [checklist, setChecklist] = useState(() => ({ ...visit.checklist }))
  const [findings,  setFindings]  = useState(visit.findings)
  const [saving,    setSaving]    = useState(false)

  const toggleItem = (item) => {
    setChecklist(prev => ({ ...prev, [item]: !prev[item] }))
  }

  const dirty = findings !== visit.findings ||
    JSON.stringify(checklist) !== JSON.stringify(visit.checklist)

  const save = async () => {
    setSaving(true)
    try {
      const { error } = await sb.rpc('update_store_visit', {
        p_visit_id: visit.id,
        p_findings: findings,
        p_checklist: checklist,
      })
      if (error) { showToast('Could not save changes', 'error'); return }
      showToast('Visit updated', 'success')
      await reload()
    } catch (e) {
      showToast('Could not save changes', 'error')
    } finally { setSaving(false) }
  }

  // Merge stored checklist keys with the standard template so managers can
  // complete any item, while historical items still render.
  const items = useMemo(() => {
    const keys = new Set([...INSPECTION_ITEMS, ...Object.keys(visit.checklist || {})])
    return [...keys]
  }, [visit.checklist])

  const breakdownEntries = Object.entries(visit.scoreBreakdown || {})

  return (
    <div style={{ borderTop: '1px solid var(--t-line)', padding: 16, background: 'var(--t-bg, #070b14)' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {/* Findings */}
        <div>
          <div style={S.sectionLabel}>Full Findings</div>
          {isManager ? (
            <textarea
              style={S.textarea}
              value={findings}
              placeholder="No findings recorded"
              onChange={e => setFindings(e.target.value)}
            />
          ) : (
            <div style={{ fontSize: 13, color: 'var(--t-text-muted)', lineHeight: 1.7 }}>
              {findings || 'No findings recorded.'}
            </div>
          )}
        </div>

        {/* Inspection checklist */}
        <div>
          <div style={S.sectionLabel}>Inspection Checklist</div>
          {items.map(item => (
            <label key={item} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, cursor: isManager ? 'pointer' : 'default' }}>
              <input
                type="checkbox"
                checked={!!checklist[item]}
                onChange={() => isManager && toggleItem(item)}
                style={{ accentColor: 'var(--t-accent)', width: 14, height: 14 }}
                readOnly={!isManager}
              />
              <span style={{ fontSize: 13, color: checklist[item] ? 'var(--t-text)' : 'var(--t-text-faint)', textDecoration: checklist[item] ? 'none' : 'line-through' }}>
                {item}
              </span>
              {checklist[item]
                ? <Bdg variant="green">PASS</Bdg>
                : <Bdg variant="red">FAIL</Bdg>
              }
            </label>
          ))}
        </div>

        {/* Score breakdown */}
        <div>
          <div style={S.sectionLabel}>Score Breakdown</div>
          {breakdownEntries.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--t-text-faint)' }}>No score breakdown recorded.</div>
          ) : breakdownEntries.map(([cat, val]) => {
            const n = Number(val) || 0
            return (
              <div key={cat} style={{ marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 12, color: 'var(--t-text-muted)' }}>{cat}</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--t-text)' }}>{n}/25</span>
                </div>
                <div style={{ height: 4, background: 'var(--t-line)' }}>
                  <div style={{ width: `${(n / 25) * 100}%`, height: '100%', background: n >= 20 ? '#2ad6a0' : n >= 15 ? '#ffb800' : '#ff4d7d' }} />
                </div>
              </div>
            )
          })}
        </div>

        {/* Photos (no attachment backend yet — honest empty state) */}
        <div>
          <div style={S.sectionLabel}>Photos</div>
          <div style={{ border: '1px dashed var(--t-line)', padding: 20, textAlign: 'center' }}>
            <div style={{ fontSize: 12, color: 'var(--t-text-faint)' }}>No photos attached</div>
          </div>
        </div>
      </div>

      {isManager && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
          <button
            style={{ ...S.btnSm, ...(dirty ? S.btnAccent : {}), opacity: dirty && !saving ? 1 : 0.5, cursor: dirty && !saving ? 'pointer' : 'not-allowed' }}
            disabled={!dirty || saving}
            onClick={save}
          >
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Visit Card ────────────────────────────────────────────────────────────────
function VisitCard({ visit, isManager, showToast, reload }) {
  const [expanded, setExpanded] = useState(false)
  const scoreColor = visit.score >= 90 ? '#2ad6a0' : visit.score >= 75 ? '#ffb800' : '#ff4d7d'
  const typeVariant = VISIT_TYPE_VARIANT[visit.visitType] || 'accent'

  return (
    <div style={S.card}>
      <div style={S.cardHead}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--t-text)' }}>
            {fmtDate(visit.date)} — {visit.location}
          </span>
          <Bdg variant={typeVariant}>{(visit.visitType || '').toUpperCase()}</Bdg>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 20, fontWeight: 800, color: scoreColor }}>{visit.score}/100</span>
          <button style={S.btnSm} onClick={() => setExpanded(e => !e)}>
            {expanded ? 'Collapse' : 'View Details'}
          </button>
        </div>
      </div>

      <div style={S.cardBody}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 16px', marginBottom: 10 }}>
          <div style={{ fontSize: 12, color: 'var(--t-text-muted)' }}>
            <span style={{ color: 'var(--t-text-faint)' }}>Visited by:</span>{' '}
            <span style={{ fontWeight: 600, color: 'var(--t-text)' }}>{visit.dm}</span>
          </div>
          <div style={{ fontSize: 12, color: 'var(--t-text-muted)' }}>
            <span style={{ color: 'var(--t-text-faint)' }}>Manager present:</span>{' '}
            <span style={{ fontWeight: 600, color: 'var(--t-text)' }}>{visit.managerPresent}</span>
          </div>
        </div>

        <div style={{ fontSize: 12, color: 'var(--t-text-muted)', lineHeight: 1.7, marginBottom: 12 }}>
          {visit.summary || 'No summary provided.'}
        </div>

        {/* Score bar */}
        <div style={{ marginBottom: 12 }}>
          <ScoreBar score={visit.score} />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {/* Category tags */}
          {visit.tags.map(tag => (
            <Bdg key={tag} variant={CAT_VARIANT[tag] || 'accent'}>{tag}</Bdg>
          ))}
          <span style={{
            marginLeft: 8,
            fontSize: 11,
            background: visit.actionItemCount > 0 ? 'rgba(255,179,71,0.15)' : 'rgba(42,214,160,0.1)',
            color:      visit.actionItemCount > 0 ? '#ffb800' : '#2ad6a0',
            border:     `1px solid ${visit.actionItemCount > 0 ? 'rgba(255,179,71,0.3)' : 'rgba(42,214,160,0.25)'}`,
            padding:    '2px 8px',
            fontWeight: 700,
          }}>
            Action Items: {visit.actionItemCount}
          </span>
        </div>
      </div>

      {expanded && (
        <VisitDetail visit={visit} isManager={isManager} showToast={showToast} reload={reload} />
      )}
    </div>
  )
}

// ─── Log New Visit Form ────────────────────────────────────────────────────────
function LogVisitForm({ onSubmit, onCancel, locations, saving }) {
  const initItems = [{ id: 1, desc: '', assignedTo: '', dueDate: '' }]
  const [form, setForm]   = useState({
    nodeId: locations[0]?.id || '', visitType: 'Routine', date: TODAY,
    managerPresent: '', visitedBy: '', score: 80, summary: '', findings: '',
  })
  const [items, setItems] = useState(initItems)
  const [nextId, setNextId] = useState(2)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const addItem = () => {
    setItems(prev => [...prev, { id: nextId, desc: '', assignedTo: '', dueDate: '' }])
    setNextId(n => n + 1)
  }
  const setItem = (id, k, v) => setItems(prev => prev.map(i => i.id === id ? { ...i, [k]: v } : i))
  const removeItem = (id) => setItems(prev => prev.filter(i => i.id !== id))

  const submit = () => {
    const loc = locations.find(l => l.id === form.nodeId)
    onSubmit({ ...form, locationName: loc?.name || '', actionItems: items })
  }

  return (
    <div style={{ ...S.card, border: '1px solid rgba(42,214,160,0.3)', marginBottom: 20 }}>
      <div style={S.cardHead}>
        <span style={S.cardTitle}>Log New Visit</span>
        <button style={S.btnSm} onClick={onCancel}>Cancel</button>
      </div>
      <div style={S.cardBody}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 14, marginBottom: 16 }}>
          <div style={S.formRow}>
            <label style={S.label}>Location</label>
            <select style={{ ...S.select, width: '100%' }} value={form.nodeId} onChange={e => set('nodeId', e.target.value)}>
              {locations.length === 0 && <option value="">No locations available</option>}
              {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
          <div style={S.formRow}>
            <label style={S.label}>Visit Type</label>
            <select style={{ ...S.select, width: '100%' }} value={form.visitType} onChange={e => set('visitType', e.target.value)}>
              {VISIT_TYPES.map(t => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div style={S.formRow}>
            <label style={S.label}>Visit Date</label>
            <input type="date" style={{ ...S.input, width: '100%' }} value={form.date} onChange={e => set('date', e.target.value)} />
          </div>
          <div style={S.formRow}>
            <label style={S.label}>Manager Present</label>
            <input type="text" style={{ ...S.input, width: '100%' }} value={form.managerPresent} placeholder="Name" onChange={e => set('managerPresent', e.target.value)} />
          </div>
          <div style={S.formRow}>
            <label style={S.label}>Visited By</label>
            <input type="text" style={{ ...S.input, width: '100%' }} value={form.visitedBy} placeholder="Name" onChange={e => set('visitedBy', e.target.value)} />
          </div>
          <div style={S.formRow}>
            <label style={S.label}>Overall Score (0–100)</label>
            <input type="number" min="0" max="100" style={{ ...S.input, width: '100%' }} value={form.score} onChange={e => set('score', parseInt(e.target.value) || 0)} />
          </div>
          <div style={{ ...S.formRow, gridColumn: 'span 2' }}>
            <label style={S.label}>Summary</label>
            <input type="text" style={{ ...S.input, width: '100%' }} value={form.summary} placeholder="Brief visit summary…" onChange={e => set('summary', e.target.value)} />
          </div>
          <div style={{ ...S.formRow, gridColumn: 'span 2' }}>
            <label style={S.label}>Findings</label>
            <textarea style={S.textarea} value={form.findings} placeholder="Detailed findings…" onChange={e => set('findings', e.target.value)} />
          </div>
          <div style={{ ...S.formRow, gridColumn: 'span 2' }}>
            <label style={S.label}>Action Items</label>
            {items.map(item => (
              <div key={item.id} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr auto', gap: 6, marginBottom: 6 }}>
                <input type="text" style={S.input} value={item.desc} placeholder="Description" onChange={e => setItem(item.id, 'desc', e.target.value)} />
                <input type="text" style={S.input} value={item.assignedTo} placeholder="Assigned to" onChange={e => setItem(item.id, 'assignedTo', e.target.value)} />
                <input type="date" style={S.input} value={item.dueDate} onChange={e => setItem(item.id, 'dueDate', e.target.value)} />
                <button style={S.btnSm} onClick={() => removeItem(item.id)}>×</button>
              </div>
            ))}
            <button style={S.btnSm} onClick={addItem}>+ Add Item</button>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button style={S.btn} onClick={onCancel}>Cancel</button>
          <button
            style={{ ...S.btn, ...S.btnAccent, opacity: saving || !form.nodeId ? 0.6 : 1, cursor: saving || !form.nodeId ? 'not-allowed' : 'pointer' }}
            disabled={saving || !form.nodeId}
            onClick={submit}
          >
            {saving ? 'Saving…' : 'Submit Visit Log'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Tab: Visit Log ────────────────────────────────────────────────────────────
function VisitLogTab({ visits, isManager, showToast, reload, locations }) {
  const [filterLoc,  setFilterLoc]  = useState('All')
  const [filterDate, setFilterDate] = useState('')
  const [filterType, setFilterType] = useState('All')
  const [showForm,   setShowForm]   = useState(false)
  const [saving,     setSaving]     = useState(false)

  const locNames = useMemo(() => locations.map(l => l.name), [locations])

  const filtered = useMemo(() =>
    visits.filter(v =>
      (filterLoc  === 'All' || v.location  === filterLoc) &&
      (!filterDate || v.date === filterDate) &&
      (filterType === 'All' || v.visitType === filterType)
    ), [visits, filterLoc, filterDate, filterType])

  const handleLogVisit = async (form) => {
    setSaving(true)
    try {
      const { error } = await sb.rpc('create_store_visit', {
        p_node_id:         form.nodeId || null,
        p_location_name:   form.locationName || null,
        p_visit_type:      form.visitType,
        p_visit_date:      form.date,
        p_manager_present: form.managerPresent || null,
        p_visited_by:      form.visitedBy || null,
        p_score:           form.score,
        p_summary:         form.summary || null,
        p_findings:        form.findings || null,
        p_score_breakdown: {},
        p_checklist:       {},
        p_tags:            [],
        p_action_items:    form.actionItems || [],
        p_created_by:      getSession().id || null,
      })
      if (error) { showToast('Could not log visit', 'error'); return }
      showToast('Visit logged successfully', 'success')
      setShowForm(false)
      await reload()
    } catch (e) {
      showToast('Could not log visit', 'error')
    } finally { setSaving(false) }
  }

  return (
    <div>
      {isManager && !showForm && (
        <div style={{ marginBottom: 16 }}>
          <button style={{ ...S.btn, ...S.btnAccent }} onClick={() => setShowForm(true)}>
            + Log New Visit
          </button>
        </div>
      )}

      {showForm && <LogVisitForm onSubmit={handleLogVisit} onCancel={() => setShowForm(false)} locations={locations} saving={saving} />}

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <select style={S.select} value={filterLoc} onChange={e => setFilterLoc(e.target.value)}>
          <option value="All">All Locations</option>
          {locNames.map(l => <option key={l}>{l}</option>)}
        </select>
        <input type="date" style={S.input} value={filterDate} onChange={e => setFilterDate(e.target.value)} />
        <select style={S.select} value={filterType} onChange={e => setFilterType(e.target.value)}>
          <option value="All">All Visit Types</option>
          {VISIT_TYPES.map(t => <option key={t}>{t}</option>)}
        </select>
        {filterDate && (
          <button style={S.btnSm} onClick={() => setFilterDate('')}>Clear Date</button>
        )}
        <span style={{ fontSize: 12, color: 'var(--t-text-muted)', marginLeft: 'auto' }}>
          {filtered.length} visit{filtered.length !== 1 ? 's' : ''}
        </span>
      </div>

      {visits.length === 0 ? (
        <div style={S.empty}>No store visits recorded yet.</div>
      ) : filtered.length === 0 ? (
        <div style={S.empty}>No visits match the current filters.</div>
      ) : filtered.map(visit => (
        <VisitCard key={visit.id} visit={visit} isManager={isManager} showToast={showToast} reload={reload} />
      ))}
    </div>
  )
}

// ─── Add Action Item Form ──────────────────────────────────────────────────────
function AddActionItemForm({ onSubmit, onCancel, locations, saving }) {
  const [form, setForm] = useState({ item: '', nodeId: locations[0]?.id || '', assignedTo: '', dueDate: TODAY, priority: 'MEDIUM' })
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const submit = () => {
    const loc = locations.find(l => l.id === form.nodeId)
    onSubmit({ ...form, locationName: loc?.name || '' })
  }
  return (
    <div style={{ ...S.card, border: '1px solid rgba(42,214,160,0.3)', marginBottom: 20 }}>
      <div style={S.cardHead}>
        <span style={S.cardTitle}>Add Action Item</span>
        <button style={S.btnSm} onClick={onCancel}>Cancel</button>
      </div>
      <div style={{ ...S.cardBody, display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: 14 }}>
        <div style={S.formRow}>
          <label style={S.label}>Description</label>
          <input type="text" style={{ ...S.input, width: '100%' }} value={form.item} placeholder="Action item description" onChange={e => set('item', e.target.value)} />
        </div>
        <div style={S.formRow}>
          <label style={S.label}>Location</label>
          <select style={{ ...S.select, width: '100%' }} value={form.nodeId} onChange={e => set('nodeId', e.target.value)}>
            {locations.length === 0 && <option value="">No locations available</option>}
            {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </div>
        <div style={S.formRow}>
          <label style={S.label}>Assigned To</label>
          <input type="text" style={{ ...S.input, width: '100%' }} value={form.assignedTo} placeholder="Name" onChange={e => set('assignedTo', e.target.value)} />
        </div>
        <div style={S.formRow}>
          <label style={S.label}>Due Date</label>
          <input type="date" style={{ ...S.input, width: '100%' }} value={form.dueDate} onChange={e => set('dueDate', e.target.value)} />
        </div>
        <div style={S.formRow}>
          <label style={S.label}>Priority</label>
          <select style={{ ...S.select, width: '100%' }} value={form.priority} onChange={e => set('priority', e.target.value)}>
            {PRIORITY_LABELS.map(p => <option key={p}>{p}</option>)}
          </select>
        </div>
        <div style={{ ...S.formRow, gridColumn: 'span 3', display: 'flex', alignItems: 'flex-end', gap: 8, paddingBottom: 14 }}>
          <button
            style={{ ...S.btn, ...S.btnAccent, opacity: saving || !form.item.trim() ? 0.6 : 1, cursor: saving || !form.item.trim() ? 'not-allowed' : 'pointer' }}
            disabled={saving || !form.item.trim()}
            onClick={submit}
          >
            {saving ? 'Saving…' : 'Add Item'}
          </button>
          <button style={S.btn} onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </div>
  )
}

// ─── Tab: Action Items ─────────────────────────────────────────────────────────
function ActionItemsTab({ items, isManager, showToast, reload, locations }) {
  const [filterLoc,      setFilterLoc]      = useState('All')
  const [filterStatus,   setFilterStatus]   = useState('All')
  const [filterPriority, setFilterPriority] = useState('All')
  const [filterAssignee, setFilterAssignee] = useState('All')
  const [showAdd,        setShowAdd]        = useState(false)
  const [saving,         setSaving]         = useState(false)
  const [busyId,         setBusyId]         = useState(null)

  const locNames = useMemo(() => locations.map(l => l.name), [locations])

  const filtered = useMemo(() =>
    items.filter(it =>
      (filterLoc      === 'All' || it.location   === filterLoc) &&
      (filterStatus   === 'All' || it.status     === filterStatus) &&
      (filterPriority === 'All' || it.priority   === filterPriority) &&
      (filterAssignee === 'All' || it.assignedTo === filterAssignee)
    ), [items, filterLoc, filterStatus, filterPriority, filterAssignee])

  const allAssignees = useMemo(() => [...new Set(items.map(i => i.assignedTo).filter(Boolean))], [items])

  const handleComplete = async (id) => {
    setBusyId(id)
    try {
      const { error } = await sb.rpc('set_store_visit_action_item_status', {
        p_item_id: id, p_status: 'COMPLETE', p_actor_id: getSession().id || null,
      })
      if (error) { showToast('Could not update item', 'error'); return }
      showToast('Action item marked complete', 'success')
      await reload()
    } catch (e) {
      showToast('Could not update item', 'error')
    } finally { setBusyId(null) }
  }

  const handleAddItem = async (form) => {
    setSaving(true)
    try {
      const { error } = await sb.rpc('create_store_visit_action_item', {
        p_node_id:       form.nodeId || null,
        p_location_name: form.locationName || null,
        p_item:          form.item,
        p_assigned_to:   form.assignedTo || null,
        p_due_date:      form.dueDate || null,
        p_priority:      form.priority,
        p_visit_id:      null,
        p_created_by:    getSession().id || null,
      })
      if (error) { showToast('Could not add action item', 'error'); return }
      showToast('Action item added', 'success')
      setShowAdd(false)
      await reload()
    } catch (e) {
      showToast('Could not add action item', 'error')
    } finally { setSaving(false) }
  }

  return (
    <div>
      {isManager && !showAdd && (
        <div style={{ marginBottom: 16 }}>
          <button style={{ ...S.btn, ...S.btnAccent }} onClick={() => setShowAdd(true)}>
            + Add Action Item
          </button>
        </div>
      )}

      {showAdd && <AddActionItemForm onSubmit={handleAddItem} onCancel={() => setShowAdd(false)} locations={locations} saving={saving} />}

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <select style={S.select} value={filterLoc} onChange={e => setFilterLoc(e.target.value)}>
          <option value="All">All Locations</option>
          {locNames.map(l => <option key={l}>{l}</option>)}
        </select>
        <select style={S.select} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="All">All Statuses</option>
          {ITEM_STATUSES.map(s => <option key={s}>{s}</option>)}
        </select>
        <select style={S.select} value={filterPriority} onChange={e => setFilterPriority(e.target.value)}>
          <option value="All">All Priorities</option>
          {PRIORITY_LABELS.map(p => <option key={p}>{p}</option>)}
        </select>
        <select style={S.select} value={filterAssignee} onChange={e => setFilterAssignee(e.target.value)}>
          <option value="All">All Assignees</option>
          {allAssignees.map(a => <option key={a}>{a}</option>)}
        </select>
        <span style={{ fontSize: 12, color: 'var(--t-text-muted)', marginLeft: 'auto' }}>
          {filtered.length} item{filtered.length !== 1 ? 's' : ''}
        </span>
      </div>

      <div style={S.card}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>
                {['Item', 'Location', 'Visit Date', 'Assigned To', 'Due Date', 'Status', 'Priority', 'Action'].map(h => (
                  <th key={h} style={S.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr><td colSpan={8} style={{ ...S.td, textAlign: 'center', color: 'var(--t-text-faint)', padding: 24 }}>No action items recorded yet.</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={8} style={{ ...S.td, textAlign: 'center', color: 'var(--t-text-faint)', padding: 24 }}>No action items match the filters.</td></tr>
              ) : filtered.map((it, i) => {
                const overdue = it.status !== 'COMPLETE' && it.dueDate && it.dueDate < TODAY
                return (
                  <tr key={it.id} style={i % 2 === 1 ? { background: 'rgba(255,255,255,0.015)' } : {}}>
                    <td style={{ ...S.td, maxWidth: 220, fontWeight: 600 }}>
                      <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.item}</div>
                    </td>
                    <td style={S.td}>{it.location}</td>
                    <td style={{ ...S.td, whiteSpace: 'nowrap', fontSize: 12 }}>{fmtDate(it.visitDate)}</td>
                    <td style={{ ...S.td, color: 'var(--t-text-muted)' }}>{it.assignedTo}</td>
                    <td style={{ ...S.td, whiteSpace: 'nowrap', color: overdue ? '#ff4d7d' : 'var(--t-text)', fontWeight: overdue ? 700 : 400 }}>
                      {fmtDate(it.dueDate)}
                      {overdue && <span style={{ marginLeft: 4 }}><Bdg variant="red">OVERDUE</Bdg></span>}
                    </td>
                    <td style={S.td}>{statusBdg(it.status)}</td>
                    <td style={S.td}>{priorityBdg(it.priority)}</td>
                    <td style={S.td}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        {it.status !== 'COMPLETE' && isManager && (
                          <button
                            style={{ ...S.btnSm, ...S.btnSuccess, opacity: busyId === it.id ? 0.6 : 1, cursor: busyId === it.id ? 'not-allowed' : 'pointer' }}
                            disabled={busyId === it.id}
                            onClick={() => handleComplete(it.id)}
                          >
                            {busyId === it.id ? 'Saving…' : 'Mark Complete'}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ─── Main Component ────────────────────────────────────────────────────────────
const TABS = ['Visit Log', 'Action Items']

export default function StoreVisits() {
  const enabled       = useFeatureFlag('store_visit_log')
  const config        = useConfig()
  const { session }   = useAuth()
  const { locationIds, locations: scopeLocations } = useScope()

  const roleName  = (session?.person?.role_name || '').toLowerCase()
  const isManager = ['ceo','manager','coo','admin','owner','hr'].some(r => roleName.includes(r))

  const { toast, show: showToast } = useToast()
  const [activeTab,   setActiveTab]   = useState(0)
  const [visits,      setVisits]      = useState([])
  const [actionItems, setActionItems] = useState([])
  const [loading,     setLoading]     = useState(true)
  const [loadError,   setLoadError]   = useState(null)
  const [drill,       setDrill]       = useState(null)

  // Real, node-scoped locations for dropdowns/filters.
  const locations = useMemo(
    () => (scopeLocations || []).map(l => ({ id: l.id, name: l.name })).filter(l => l.name),
    [scopeLocations]
  )

  const nodeKey = useMemo(() => (locationIds || []).join(','), [locationIds])

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const nodeIds = (locationIds && locationIds.length) ? locationIds : null
      const [vRes, aRes] = await Promise.all([
        sb.rpc('get_store_visits', { p_node_ids: nodeIds }),
        sb.rpc('get_store_visit_action_items', { p_node_ids: nodeIds }),
      ])
      if (vRes.error) throw vRes.error
      if (aRes.error) throw aRes.error
      setVisits((vRes.data || []).map(normVisit))
      setActionItems((aRes.data || []).map(normItem))
    } catch (e) {
      setLoadError(e?.message || 'load_failed')
      setVisits([])
      setActionItems([])
    } finally {
      setLoading(false)
    }
  }, [nodeKey]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (enabled && isManager) load()
  }, [enabled, isManager, load])

  if (!enabled)    return <FeatureDisabledMsg />
  if (!isManager)  return <AccessRestricted />

  // KPI values — derived from real rows
  const monthPrefix = TODAY.slice(0, 7)
  const cutoff30 = fmtIso(addDays(_today, -30))
  const visitsThisMonth = visits.filter(v => (v.date || '').startsWith(monthPrefix)).length
  const openItems       = actionItems.filter(i => i.status !== 'COMPLETE')
  const openActionItems = openItems.length
  const recentVisits    = visits.filter(v => v.date && v.date >= cutoff30)
  const storesVisited   = new Set(recentVisits.map(v => v.location)).size
  const totalStores     = locations.length || storesVisited
  const avgVisitScore   = visits.length
    ? Math.round(visits.reduce((s, v) => s + (v.score || 0), 0) / visits.length) + '/100'
    : '—'
  const actionVariant   = openActionItems > 3 ? 'danger' : 'warn'
  const actionColor     = openActionItems > 3 ? '#ff4d7d' : '#ffb800'

  // ── Forensic drill-down: real rows behind each KPI ───────────────────────────
  const VISIT_COLS = [
    { key: 'date', label: 'Date', value: v => fmtDate(v.date), sortKey: v => v.date },
    { key: 'location', label: 'Location', value: v => v.location },
    { key: 'visitType', label: 'Type', value: v => v.visitType },
    { key: 'dm', label: 'Visited By', value: v => v.dm },
    { key: 'managerPresent', label: 'Manager', value: v => v.managerPresent },
    { key: 'score', label: 'Score', value: v => `${v.score}/100`, align: 'right', sortKey: v => v.score },
    { key: 'actionItemCount', label: 'Action Items', value: v => v.actionItemCount, align: 'right', sortKey: v => v.actionItemCount },
  ]
  const ITEM_COLS = [
    { key: 'item', label: 'Action Item', value: it => it.item },
    { key: 'location', label: 'Location', value: it => it.location },
    { key: 'assignedTo', label: 'Assigned To', value: it => it.assignedTo },
    { key: 'visitDate', label: 'Visit Date', value: it => fmtDate(it.visitDate), sortKey: it => it.visitDate },
    { key: 'dueDate', label: 'Due', value: it => fmtDate(it.dueDate), sortKey: it => it.dueDate },
    { key: 'priority', label: 'Priority', value: it => it.priority },
    { key: 'status', label: 'Status', value: it => it.status },
  ]
  const drillVisits = (title, rows, accent) => setDrill({
    title, subtitle: `${rows.length} visit${rows.length === 1 ? '' : 's'}`, columns: VISIT_COLS, rows, accent,
  })
  const drillItems = (title, rows, accent) => setDrill({
    title, subtitle: `${rows.length} action item${rows.length === 1 ? '' : 's'}`, columns: ITEM_COLS, rows, accent,
  })

  return (
    <div style={S.page}>
      {/* Header */}
      <div style={S.pageHeader}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <div style={S.pageTitle}>STORE VISIT / COMPLIANCE LOG</div>
            <div style={S.pageSub}>
              Log field visits, track findings, and follow-up action items
              {config?.company_short ? ` · ${config.company_short}` : ''}
            </div>
          </div>
          <Bdg variant={openActionItems > 3 ? 'red' : 'amber'}>
            {openActionItems} OPEN ITEMS
          </Bdg>
        </div>
      </div>

      <div style={S.body}>
        {loading ? (
          <div style={S.empty}>Loading store visits…</div>
        ) : loadError ? (
          <div style={{ ...S.empty, color: 'var(--t-text-muted)' }}>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>Couldn’t load store visits.</div>
            <button style={{ ...S.btnSm, ...S.btnAccent }} onClick={load}>Retry</button>
          </div>
        ) : (
          <>
            {/* KPI row */}
            <div style={S.kpiGrid(4)}>
              <KpiTile
                label="Visits This Month"
                value={visitsThisMonth}
                sub="logged field visits"
                valueColor="var(--t-accent)"
                onClick={visits.length ? () => drillVisits('Store Visits — All', visits, 'var(--t-accent)') : undefined}
              />
              <KpiTile
                label="Open Action Items"
                value={openActionItems}
                sub="requiring follow-up"
                valueColor={actionColor}
                variant={actionVariant}
                onClick={openItems.length ? () => drillItems('Open Action Items', openItems, actionColor) : undefined}
              />
              <KpiTile
                label="Stores Visited"
                value={`${storesVisited} of ${totalStores}`}
                sub="last 30 days"
                valueColor="#2ad6a0"
                variant="success"
                onClick={recentVisits.length ? () => drillVisits('Store Visits by Location — Last 30 Days', [...recentVisits].sort((a, b) => a.location.localeCompare(b.location)), '#2ad6a0') : undefined}
              />
              <KpiTile
                label="Avg Visit Score"
                value={avgVisitScore}
                sub="across all locations"
                valueColor="var(--t-accent)"
                onClick={visits.length ? () => drillVisits('Visit Scores — All Locations', [...visits].sort((a, b) => b.score - a.score), 'var(--t-accent)') : undefined}
              />
            </div>

            {/* Tab bar */}
            <div style={S.tabBar}>
              {TABS.map((tab, i) => {
                const badge = i === 1 ? openActionItems : 0
                return (
                  <button key={tab} style={S.tab(activeTab === i)} onClick={() => setActiveTab(i)}>
                    {tab}
                    {badge > 0 && (
                      <span style={{ marginLeft: 6, background: 'rgba(255,77,125,0.2)', color: '#ff4d7d', padding: '1px 6px', fontSize: 10, fontWeight: 800 }}>
                        {badge}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>

            {/* Tab content */}
            {activeTab === 0 && (
              <VisitLogTab
                visits={visits}
                isManager={isManager}
                showToast={showToast}
                reload={load}
                locations={locations}
              />
            )}
            {activeTab === 1 && (
              <ActionItemsTab
                items={actionItems}
                isManager={isManager}
                showToast={showToast}
                reload={load}
                locations={locations}
              />
            )}
          </>
        )}
      </div>

      {/* Toast */}
      {toast && <div style={S.toast(toast.type)}>{toast.msg}</div>}

      {/* Forensic drill-down */}
      <DrillDown open={!!drill} onClose={() => setDrill(null)} {...(drill || {})} />
    </div>
  )
}
