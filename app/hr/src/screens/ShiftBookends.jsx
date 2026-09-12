import { useState, useEffect, useCallback, useRef } from 'react'
import { sb, getSession } from '../lib/supabase'
import { useAuth } from '../lib/auth.jsx'
import { useScope } from '../lib/scope.jsx'
import DrillDown from '../components/DrillDown.jsx'

// ─── Procedure templates (store opening/closing SOP — UI vocabulary, not data) ──
// These are the actual store operating procedures, not fabricated records. Per-
// item COMPLETION is the real business data and lives in the database
// (shift_bookend_checklists) keyed by location + date + bookend type.

const OPEN_ITEMS = [
  // Pre-Open (8 items)
  { id: 'po1', section: 'pre',     label: 'Deactivate alarm & confirm code',          responsible: 'Key Holder', mins: 2  },
  { id: 'po2', section: 'pre',     label: 'Walk all exterior perimeter — check for issues', responsible: 'Key Holder', mins: 5  },
  { id: 'po3', section: 'pre',     label: 'Verify safe is sealed and balanced',        responsible: 'Manager',    mins: 3  },
  { id: 'po4', section: 'pre',     label: 'Turn on all store lighting',                responsible: 'Associate',  mins: 2  },
  { id: 'po5', section: 'pre',     label: 'Unlock stockroom and prep back area',       responsible: 'Associate',  mins: 5  },
  { id: 'po6', section: 'pre',     label: 'Check temperature / HVAC',                 responsible: 'Associate',  mins: 2  },
  { id: 'po7', section: 'pre',     label: 'Review prior shift handoff notes',          responsible: 'Manager',    mins: 5  },
  { id: 'po8', section: 'pre',     label: 'Confirm today\'s schedule and coverage',    responsible: 'Manager',    mins: 3  },
  // Opening Duties (6 items)
  { id: 'od1', section: 'opening', label: 'Unlock front door at posted open time',     responsible: 'Key Holder', mins: 1  },
  { id: 'od2', section: 'opening', label: 'Post "OPEN" signage and flip door sign',    responsible: 'Associate',  mins: 2  },
  { id: 'od3', section: 'opening', label: 'Brief morning huddle with floor team',      responsible: 'Manager',    mins: 5  },
  { id: 'od4', section: 'opening', label: 'Assign zone coverage for the shift',        responsible: 'Manager',    mins: 5  },
  { id: 'od5', section: 'opening', label: 'Start music / ambient settings',            responsible: 'Associate',  mins: 1  },
  { id: 'od6', section: 'opening', label: 'Log store-open time in system',             responsible: 'Key Holder', mins: 1  },
  // Ready to Sell (10 items)
  { id: 'rs1', section: 'ready',   label: 'Count & verify register 1 opening drawer',  responsible: 'Key Holder', mins: 5  },
  { id: 'rs2', section: 'ready',   label: 'Count & verify register 2 opening drawer',  responsible: 'Key Holder', mins: 5  },
  { id: 'rs3', section: 'ready',   label: 'Confirm POS system online and loaded',      responsible: 'Associate',  mins: 3  },
  { id: 'rs4', section: 'ready',   label: 'Restock featured/promotional endcaps',      responsible: 'Associate',  mins: 10 },
  { id: 'rs5', section: 'ready',   label: 'Price-check all promotional signage',       responsible: 'Associate',  mins: 5  },
  { id: 'rs6', section: 'ready',   label: 'Zone all staff to floor positions',         responsible: 'Manager',    mins: 3  },
  { id: 'rs7', section: 'ready',   label: 'Product knowledge review — today\'s focus', responsible: 'All',        mins: 10 },
  { id: 'rs8', section: 'ready',   label: 'Confirm fitting rooms are clean and stocked', responsible: 'Associate', mins: 5  },
  { id: 'rs9', section: 'ready',   label: 'Verify adult section display is compliant', responsible: 'Key Holder', mins: 5  },
  { id: 'rs10',section: 'ready',   label: 'Safety walkthrough — no hazards on floor',  responsible: 'Manager',    mins: 5  },
]

const CLOSE_ITEMS = [
  // Customer Close (5 items)
  { id: 'cc1', section: 'customer', label: 'Announce store closing (15 min, 10 min, 5 min)', responsible: 'Associate', mins: 15 },
  { id: 'cc2', section: 'customer', label: 'Escort remaining customers to exit',              responsible: 'Associate', mins: 5  },
  { id: 'cc3', section: 'customer', label: 'Secure and lock front door',                      responsible: 'Key Holder', mins: 1  },
  { id: 'cc4', section: 'customer', label: 'Lock fitting rooms and adult section',             responsible: 'Key Holder', mins: 3  },
  { id: 'cc5', section: 'customer', label: 'Turn off "OPEN" signage and flip door sign',       responsible: 'Associate', mins: 1  },
  // Cash Procedures (8 items)
  { id: 'cp1', section: 'cash',     label: 'Count register 1 and record totals',               responsible: 'Key Holder', mins: 10 },
  { id: 'cp2', section: 'cash',     label: 'Count register 2 and record totals',               responsible: 'Key Holder', mins: 10 },
  { id: 'cp3', section: 'cash',     label: 'Reconcile POS report vs. drawer count',            responsible: 'Manager',    mins: 10 },
  { id: 'cp4', section: 'cash',     label: 'Document any overages or shortages',               responsible: 'Manager',    mins: 5  },
  { id: 'cp5', section: 'cash',     label: 'Prepare deposit envelope',                         responsible: 'Manager',    mins: 5  },
  { id: 'cp6', section: 'cash',     label: 'Place deposit in safe — confirm locked',            responsible: 'Manager',    mins: 3  },
  { id: 'cp7', section: 'cash',     label: 'Set opening drawers for next shift',               responsible: 'Key Holder', mins: 5  },
  { id: 'cp8', section: 'cash',     label: 'Log cash summary in system',                        responsible: 'Manager',    mins: 3  },
  // Cleaning (10 items)
  { id: 'cl1', section: 'cleaning', label: 'Vacuum all floor areas',                           responsible: 'Associate', mins: 15 },
  { id: 'cl2', section: 'cleaning', label: 'Wipe down all display surfaces and fixtures',      responsible: 'Associate', mins: 10 },
  { id: 'cl3', section: 'cleaning', label: 'Clean and sanitize registers and countertops',     responsible: 'Associate', mins: 8  },
  { id: 'cl4', section: 'cleaning', label: 'Restock and clean fitting rooms',                  responsible: 'Associate', mins: 10 },
  { id: 'cl5', section: 'cleaning', label: 'Clean restrooms',                                  responsible: 'Associate', mins: 10 },
  { id: 'cl6', section: 'cleaning', label: 'Take out trash — all bins',                         responsible: 'Associate', mins: 5  },
  { id: 'cl7', section: 'cleaning', label: 'Sweep stockroom / back area',                      responsible: 'Associate', mins: 8  },
  { id: 'cl8', section: 'cleaning', label: 'Return all merchandise to correct positions',      responsible: 'Associate', mins: 10 },
  { id: 'cl9', section: 'cleaning', label: 'Wipe product displays — remove fingerprints',      responsible: 'Associate', mins: 5  },
  { id: 'cl10',section: 'cleaning', label: 'Final visual sweep of entire sales floor',         responsible: 'Manager',   mins: 5  },
  // Security (6 items)
  { id: 'sc1', section: 'security', label: 'Arm security system',                              responsible: 'Key Holder', mins: 2  },
  { id: 'sc2', section: 'security', label: 'Verify all doors and windows locked',              responsible: 'Key Holder', mins: 5  },
  { id: 'sc3', section: 'security', label: 'Confirm cameras are recording',                    responsible: 'Manager',    mins: 2  },
  { id: 'sc4', section: 'security', label: 'Secure all keys in lockbox',                       responsible: 'Manager',    mins: 2  },
  { id: 'sc5', section: 'security', label: 'Log any incidents or issues',                       responsible: 'Manager',    mins: 5  },
  { id: 'sc6', section: 'security', label: 'Confirm alarm code is current — report if stale',  responsible: 'Key Holder', mins: 2  },
  // Closing Report (5 items)
  { id: 'cr1', section: 'report',   label: 'Complete daily sales report',                       responsible: 'Manager',   mins: 10 },
  { id: 'cr2', section: 'report',   label: 'Log staffing & any callout issues',                 responsible: 'Manager',   mins: 5  },
  { id: 'cr3', section: 'report',   label: 'Write handoff notes for incoming manager',          responsible: 'Manager',   mins: 8  },
  { id: 'cr4', section: 'report',   label: 'Send closing summary to DM / HR',                  responsible: 'Manager',   mins: 3  },
  { id: 'cr5', section: 'report',   label: 'Final manager sign-off and lock up',                responsible: 'Manager',   mins: 2  },
]

const SECTION_META = {
  pre:      { label: 'Pre-Open',       color: '#ffb800' },
  opening:  { label: 'Opening Duties', color: '#00e5ff' },
  ready:    { label: 'Ready to Sell',  color: '#2ad6a0' },
  customer: { label: 'Customer Close', color: '#7c4dff' },
  cash:     { label: 'Cash Procedures',color: '#ff9500' },
  cleaning: { label: 'Cleaning',       color: '#2979ff' },
  security: { label: 'Security',       color: '#ff4d7d' },
  report:   { label: 'Closing Report', color: '#2ad6a0' },
}

const MANAGE_ROLES = ['ceo', 'hr', 'manager', 'coo', 'admin', 'owner', 'key', 'lead']
const HR_ROLES = ['ceo', 'hr', 'manager', 'coo', 'admin', 'owner']

// ─── Helpers ────────────────────────────────────────────────────────────────

function todayStr() { return new Date().toISOString().slice(0, 10) }

function fmtClock(iso) {
  if (!iso) return '—'
  try { return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }
  catch { return '—' }
}

function pctOf(items, checked) {
  const total = items.length
  const done = items.filter(i => checked[i.id]).length
  return { total, done, pct: total > 0 ? Math.round((done / total) * 100) : 0 }
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

// ─── Progress Bar ─────────────────────────────────────────────────────────────

function ProgressBar({ pct, color }) {
  return (
    <div style={{ background: 'var(--t-surface-2)', height: 6, width: '100%' }}>
      <div style={{
        height: 6,
        width: `${pct}%`,
        background: color || (pct >= 80 ? 'var(--t-success)' : 'var(--t-accent)'),
        transition: 'width 0.5s ease, background 0.3s',
      }} />
    </div>
  )
}

// ─── Checklist Item ───────────────────────────────────────────────────────────

function ChecklistItem({ item, checked, onToggle, canManage, readOnly }) {
  const meta = SECTION_META[item.section]
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      padding: '10px 14px',
      borderBottom: '1px solid var(--t-line)',
      opacity: checked ? 0.55 : 1,
      background: checked ? 'rgba(42,214,160,0.03)' : 'transparent',
      transition: 'opacity 0.2s, background 0.2s',
    }}>
      <input
        type="checkbox"
        checked={checked}
        onChange={() => canManage && !readOnly && onToggle(item.id)}
        disabled={!canManage || readOnly}
        style={{
          width: 16,
          height: 16,
          accentColor: 'var(--t-accent)',
          cursor: (!canManage || readOnly) ? 'not-allowed' : 'pointer',
          flexShrink: 0,
        }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 13,
          fontWeight: 600,
          color: checked ? 'var(--t-text-faint)' : 'var(--t-text)',
          textDecoration: checked ? 'line-through' : 'none',
        }}>
          {item.label}
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 2 }}>
          <span style={{ fontSize: 10, color: 'var(--t-text-muted)' }}>{item.responsible}</span>
          <span style={{ fontSize: 10, color: 'var(--t-text-faint)' }}>~{item.mins}m</span>
        </div>
      </div>
      <div style={{
        flexShrink: 0,
        fontSize: 9,
        fontWeight: 800,
        padding: '2px 7px',
        letterSpacing: '0.05em',
        textTransform: 'uppercase',
        background: meta ? `${meta.color}18` : 'var(--t-surface-2)',
        color: meta ? meta.color : 'var(--t-text-muted)',
        border: `1px solid ${meta ? `${meta.color}40` : 'var(--t-line)'}`,
      }}>
        {meta?.label || item.section}
      </div>
      {checked && <span style={{ fontSize: 13, color: 'var(--t-success)', flexShrink: 0 }}>✓</span>}
    </div>
  )
}

// ─── Section Group ────────────────────────────────────────────────────────────

function SectionGroup({ sectionKey, items, checked, onToggle, canManage, readOnly }) {
  const [collapsed, setCollapsed] = useState(false)
  const meta = SECTION_META[sectionKey]
  const total = items.length
  const done = items.filter(item => checked[item.id]).length
  const pct = total > 0 ? Math.round((done / total) * 100) : 0

  return (
    <div style={{ marginBottom: 12 }}>
      <div
        onClick={() => setCollapsed(c => !c)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '8px 14px',
          background: 'var(--t-surface-2)',
          border: '1px solid var(--t-line)',
          cursor: 'pointer',
          userSelect: 'none',
        }}
      >
        <div style={{
          width: 10,
          height: 10,
          borderRadius: '50%',
          background: meta?.color || 'var(--t-accent)',
          flexShrink: 0,
        }} />
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--t-text)', flex: 1 }}>
          {meta?.label || sectionKey}
        </span>
        <span style={{ fontSize: 11, color: pct === 100 ? 'var(--t-success)' : 'var(--t-text-muted)', fontWeight: 600 }}>
          {done}/{total}
        </span>
        <div style={{ width: 80 }}>
          <ProgressBar pct={pct} color={meta?.color} />
        </div>
        <span style={{ fontSize: 12, color: 'var(--t-text-faint)', marginLeft: 4 }}>{collapsed ? '▶' : '▼'}</span>
      </div>

      {!collapsed && (
        <div style={{ border: '1px solid var(--t-line)', borderTop: 'none' }}>
          {items.map(item => (
            <ChecklistItem
              key={item.id}
              item={item}
              checked={!!checked[item.id]}
              onToggle={onToggle}
              canManage={canManage}
              readOnly={readOnly}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Opening Checklist Tab ────────────────────────────────────────────────────

function OpeningTab({ location, canManage, initial, authorName, personId, onSaved }) {
  const nodeId = location?.id || null
  const [checkedItems, setCheckedItems] = useState(initial?.checkedItems || {})
  const [submitted, setSubmitted] = useState(initial?.status === 'submitted' || initial?.status === 'locked')
  const [submitting, setSubmitting] = useState(false)
  const [note, setNote] = useState(initial?.notes || '')
  const [err, setErr] = useState(null)
  const skipSave = useRef(true)
  const saveTimer = useRef(null)

  // Re-seed from the database whenever the selected location or its saved row changes
  const seedKey = initial ? `${initial.id}:${initial.updatedAt}` : `empty:${nodeId}`
  useEffect(() => {
    skipSave.current = true
    setCheckedItems(initial?.checkedItems || {})
    setSubmitted(initial?.status === 'submitted' || initial?.status === 'locked')
    setNote(initial?.notes || '')
    setErr(null)
  }, [seedKey]) // eslint-disable-line react-hooks/exhaustive-deps

  const { total, done, pct } = pctOf(OPEN_ITEMS, checkedItems)

  // Store open time (posted 9:00 AM)
  const storeOpenHour = 9
  const now = new Date()
  const openTime = new Date()
  openTime.setHours(storeOpenHour, 0, 0, 0)
  const minsToOpen = Math.max(0, Math.floor((openTime - now) / 60000))

  const persist = useCallback(async (status) => {
    return sb.rpc('bookend_checklist_upsert', {
      p_node_id: nodeId,
      p_type: 'OPEN',
      p_date: todayStr(),
      p_checked_items: checkedItems,
      p_completion_pct: pct,
      p_items_done: done,
      p_items_total: total,
      p_signed_by: null,
      p_notes: note || null,
      p_status: status,
      p_author: authorName || null,
      p_author_id: personId,
    })
  }, [nodeId, checkedItems, pct, done, total, note, authorName, personId])

  // Debounced autosave of in-progress state (respects the connection pool)
  useEffect(() => {
    if (!canManage || submitted || !nodeId) return
    if (skipSave.current) { skipSave.current = false; return }
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      const { error } = await persist('in_progress')
      setErr(error ? 'Autosave failed — will retry on your next change.' : null)
    }, 1500)
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current) }
  }, [checkedItems, note]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleToggle = (id) => setCheckedItems(prev => ({ ...prev, [id]: !prev[id] }))

  const sections = ['pre', 'opening', 'ready']

  const handleSubmit = async () => {
    if (!nodeId) { setErr('Select a location first.'); return }
    setSubmitting(true)
    if (saveTimer.current) clearTimeout(saveTimer.current)
    const { error } = await persist('submitted')
    setSubmitting(false)
    if (error) { setErr('Not saved: ' + error.message); return }
    setSubmitted(true)
    setErr(null)
    onSaved && onSaved()
  }

  const handleReset = async () => {
    if (!nodeId) return
    setSubmitting(true)
    const { error } = await sb.rpc('bookend_checklist_reset', { p_node_id: nodeId, p_type: 'OPEN', p_date: todayStr() })
    setSubmitting(false)
    if (error) { setErr('Could not reset: ' + error.message); return }
    setSubmitted(false)
    setCheckedItems({})
    setNote('')
    skipSave.current = true
    onSaved && onSaved()
  }

  if (!nodeId) {
    return <div style={{ padding: '32px 0', textAlign: 'center', color: 'var(--t-text-faint)', fontSize: 13 }}>Select a location to run the opening checklist.</div>
  }

  if (submitted) {
    return (
      <div style={{
        background: 'rgba(42,214,160,0.06)',
        border: '1px solid rgba(42,214,160,0.3)',
        padding: 32,
        textAlign: 'center',
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
        alignItems: 'center',
      }}>
        <div style={{ fontSize: 36 }}>✅</div>
        <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--t-success)', letterSpacing: '-0.02em' }}>Shift Ready — Store Open</div>
        <div style={{ fontSize: 13, color: 'var(--t-text-muted)' }}>
          {done}/{total} checklist items complete · {pct}% · Signed off at {fmtClock(initial?.submittedAt) === '—' ? now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : fmtClock(initial?.submittedAt)}
        </div>
        {canManage && (
          <button
            onClick={handleReset}
            disabled={submitting}
            style={{
              marginTop: 8,
              padding: '8px 20px',
              background: 'var(--t-surface-2)',
              border: '1px solid var(--t-line)',
              color: 'var(--t-text-muted)',
              fontSize: 12,
              fontWeight: 700,
              cursor: submitting ? 'not-allowed' : 'pointer',
            }}
          >
            {submitting ? 'Resetting…' : 'Reset for next shift'}
          </button>
        )}
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Progress header */}
      <div style={{
        background: 'var(--t-surface)',
        border: '1px solid var(--t-line)',
        padding: '14px 16px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <div>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--t-text)' }}>Opening Checklist</span>
            <span style={{ fontSize: 11, color: 'var(--t-text-muted)', marginLeft: 12 }}>{location?.name}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            {minsToOpen > 0 ? (
              <span style={{
                fontSize: 11,
                fontWeight: 700,
                color: 'var(--t-accent)',
                background: 'rgba(0,229,255,0.1)',
                border: '1px solid rgba(0,229,255,0.25)',
                padding: '3px 10px',
              }}>
                {minsToOpen}m until open
              </span>
            ) : (
              <span style={{
                fontSize: 11,
                fontWeight: 700,
                color: 'var(--t-success)',
                background: 'rgba(42,214,160,0.1)',
                border: '1px solid rgba(42,214,160,0.25)',
                padding: '3px 10px',
              }}>
                Store Hours
              </span>
            )}
            <span style={{ fontSize: 16, fontWeight: 800, color: pct >= 80 ? 'var(--t-success)' : 'var(--t-accent)' }}>
              {pct}%
            </span>
          </div>
        </div>
        <ProgressBar pct={pct} />
        <div style={{ fontSize: 10, color: 'var(--t-text-faint)', marginTop: 6 }}>
          {done} of {total} tasks complete
        </div>
      </div>

      {/* Checklist sections */}
      {sections.map(sec => {
        const items = OPEN_ITEMS.filter(i => i.section === sec)
        return (
          <SectionGroup
            key={sec}
            sectionKey={sec}
            items={items}
            checked={checkedItems}
            onToggle={handleToggle}
            canManage={canManage}
            readOnly={false}
          />
        )
      })}

      {/* Manager notes */}
      {canManage && (
        <div style={{
          background: 'var(--t-surface)',
          border: '1px solid var(--t-line)',
          padding: 14,
        }}>
          <label style={{
            display: 'block',
            fontSize: 10,
            fontWeight: 800,
            color: 'var(--t-text-muted)',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            marginBottom: 8,
          }}>
            Opening Notes (optional)
          </label>
          <textarea
            value={note}
            onChange={e => setNote(e.target.value)}
            rows={3}
            placeholder="Anything the team should know for today's shift…"
            style={{
              width: '100%',
              background: 'var(--t-surface-2)',
              border: '1px solid var(--t-line)',
              color: 'var(--t-text)',
              fontSize: 13,
              padding: '10px 12px',
              resize: 'none',
              outline: 'none',
              fontFamily: 'inherit',
              lineHeight: 1.5,
              boxSizing: 'border-box',
            }}
          />
        </div>
      )}

      {err && (
        <div style={{ fontSize: 11, color: 'var(--t-danger)', fontWeight: 600 }}>{err}</div>
      )}

      {/* Submit */}
      {canManage ? (
        <button
          onClick={handleSubmit}
          disabled={submitting || pct < 80}
          style={{
            width: '100%',
            padding: '14px 0',
            background: pct >= 80 ? 'var(--t-success)' : 'var(--t-line)',
            color: pct >= 80 ? '#0d0f14' : 'var(--t-text-faint)',
            fontSize: 15,
            fontWeight: 800,
            border: 'none',
            cursor: pct < 80 || submitting ? 'not-allowed' : 'pointer',
            letterSpacing: '0.04em',
            transition: 'background 0.2s',
          }}
        >
          {submitting ? 'Submitting…' : pct < 80 ? `Complete ${80 - pct}% more to submit` : '☀️  SUBMIT — SHIFT READY'}
        </button>
      ) : (
        <div style={{ fontSize: 11, color: 'var(--t-text-faint)', textAlign: 'center', padding: '8px 0' }}>
          View only — a manager or key holder signs off the opening checklist.
        </div>
      )}
    </div>
  )
}

// ─── Closing Checklist Tab ────────────────────────────────────────────────────

function ClosingTab({ location, canManage, initial, authorName, personId, onSaved }) {
  const nodeId = location?.id || null
  const [checkedItems, setCheckedItems] = useState(initial?.checkedItems || {})
  const [locked, setLocked] = useState(initial?.status === 'locked' || initial?.status === 'submitted')
  const [submitting, setSubmitting] = useState(false)
  const [signoff, setSignoff] = useState(initial?.signedBy || '')
  const [err, setErr] = useState(null)
  const skipSave = useRef(true)
  const saveTimer = useRef(null)

  const seedKey = initial ? `${initial.id}:${initial.updatedAt}` : `empty:${nodeId}`
  useEffect(() => {
    skipSave.current = true
    setCheckedItems(initial?.checkedItems || {})
    setLocked(initial?.status === 'locked' || initial?.status === 'submitted')
    setSignoff(initial?.signedBy || '')
    setErr(null)
  }, [seedKey]) // eslint-disable-line react-hooks/exhaustive-deps

  const { total, done, pct } = pctOf(CLOSE_ITEMS, checkedItems)

  const persist = useCallback(async (status) => {
    return sb.rpc('bookend_checklist_upsert', {
      p_node_id: nodeId,
      p_type: 'CLOSE',
      p_date: todayStr(),
      p_checked_items: checkedItems,
      p_completion_pct: pct,
      p_items_done: done,
      p_items_total: total,
      p_signed_by: signoff || null,
      p_notes: null,
      p_status: status,
      p_author: authorName || null,
      p_author_id: personId,
    })
  }, [nodeId, checkedItems, pct, done, total, signoff, authorName, personId])

  useEffect(() => {
    if (!canManage || locked || !nodeId) return
    if (skipSave.current) { skipSave.current = false; return }
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      const { error } = await persist('in_progress')
      setErr(error ? 'Autosave failed — will retry on your next change.' : null)
    }, 1500)
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current) }
  }, [checkedItems, signoff]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleToggle = (id) => { if (!locked) setCheckedItems(prev => ({ ...prev, [id]: !prev[id] })) }

  const sections = ['customer', 'cash', 'cleaning', 'security', 'report']

  const handleSubmit = async () => {
    if (!nodeId) { setErr('Select a location first.'); return }
    if (!signoff.trim()) { setErr('Enter the closing manager name to sign off.'); return }
    setSubmitting(true)
    if (saveTimer.current) clearTimeout(saveTimer.current)
    const { error } = await persist('locked')
    setSubmitting(false)
    if (error) { setErr('Not locked: ' + error.message); return }
    setLocked(true)
    setErr(null)
    onSaved && onSaved()
  }

  const handleReset = async () => {
    if (!nodeId) return
    setSubmitting(true)
    const { error } = await sb.rpc('bookend_checklist_reset', { p_node_id: nodeId, p_type: 'CLOSE', p_date: todayStr() })
    setSubmitting(false)
    if (error) { setErr('Could not reset: ' + error.message); return }
    setLocked(false)
    setCheckedItems({})
    setSignoff('')
    skipSave.current = true
    onSaved && onSaved()
  }

  if (!nodeId) {
    return <div style={{ padding: '32px 0', textAlign: 'center', color: 'var(--t-text-faint)', fontSize: 13 }}>Select a location to run the closing checklist.</div>
  }

  if (locked) {
    return (
      <div style={{
        background: 'rgba(42,214,160,0.06)',
        border: '1px solid rgba(42,214,160,0.3)',
        padding: 32,
        textAlign: 'center',
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
        alignItems: 'center',
      }}>
        <div style={{ fontSize: 36 }}>🌙</div>
        <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--t-success)' }}>Store Closed — Shift Locked</div>
        <div style={{ fontSize: 13, color: 'var(--t-text-muted)' }}>
          {done}/{total} items · {pct}% · Signed by {signoff || initial?.signedBy || 'Manager'} · {fmtClock(initial?.submittedAt) === '—' ? new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : fmtClock(initial?.submittedAt)}
        </div>
        {canManage && (
          <button
            onClick={handleReset}
            disabled={submitting}
            style={{
              marginTop: 8,
              padding: '8px 20px',
              background: 'var(--t-surface-2)',
              border: '1px solid var(--t-line)',
              color: 'var(--t-text-muted)',
              fontSize: 12,
              fontWeight: 700,
              cursor: submitting ? 'not-allowed' : 'pointer',
            }}
          >
            {submitting ? 'Resetting…' : 'Reset for next shift'}
          </button>
        )}
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Progress */}
      <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', padding: '14px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <div>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--t-text)' }}>Closing Checklist</span>
            <span style={{ fontSize: 11, color: 'var(--t-text-muted)', marginLeft: 12 }}>{location?.name}</span>
          </div>
          <span style={{ fontSize: 16, fontWeight: 800, color: pct >= 80 ? 'var(--t-success)' : 'var(--t-accent)' }}>
            {pct}%
          </span>
        </div>
        <ProgressBar pct={pct} />
        <div style={{ fontSize: 10, color: 'var(--t-text-faint)', marginTop: 6 }}>
          {done} of {total} tasks complete
        </div>
      </div>

      {sections.map(sec => {
        const items = CLOSE_ITEMS.filter(i => i.section === sec)
        return (
          <SectionGroup
            key={sec}
            sectionKey={sec}
            items={items}
            checked={checkedItems}
            onToggle={handleToggle}
            canManage={canManage}
            readOnly={locked}
          />
        )
      })}

      {/* Sign-off */}
      {canManage && (
        <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', padding: 14 }}>
          <label style={{
            display: 'block',
            fontSize: 10,
            fontWeight: 800,
            color: 'var(--t-text-muted)',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            marginBottom: 8,
          }}>
            Manager Sign-Off <span style={{ color: 'var(--t-danger)' }}>*</span>
          </label>
          <input
            type="text"
            value={signoff}
            onChange={e => setSignoff(e.target.value)}
            placeholder="Full name of closing manager…"
            style={{
              width: '100%',
              background: 'var(--t-surface-2)',
              border: '1px solid var(--t-line)',
              color: 'var(--t-text)',
              fontSize: 13,
              padding: '10px 12px',
              outline: 'none',
              fontFamily: 'inherit',
              boxSizing: 'border-box',
            }}
          />
        </div>
      )}

      {err && (
        <div style={{ fontSize: 11, color: 'var(--t-danger)', fontWeight: 600 }}>{err}</div>
      )}

      {canManage ? (
        <button
          onClick={handleSubmit}
          disabled={submitting || pct < 80 || !signoff.trim()}
          style={{
            width: '100%',
            padding: '14px 0',
            background: (pct >= 80 && signoff.trim()) ? 'var(--t-accent)' : 'var(--t-line)',
            color: (pct >= 80 && signoff.trim()) ? '#0d0f14' : 'var(--t-text-faint)',
            fontSize: 15,
            fontWeight: 800,
            border: 'none',
            cursor: (pct < 80 || !signoff.trim() || submitting) ? 'not-allowed' : 'pointer',
            letterSpacing: '0.04em',
            transition: 'background 0.2s',
          }}
        >
          {submitting ? 'Locking…' : '🌙  LOCK SHIFT CLOSE'}
        </button>
      ) : (
        <div style={{ fontSize: 11, color: 'var(--t-text-faint)', textAlign: 'center', padding: '8px 0' }}>
          View only — a manager or key holder signs off the closing checklist.
        </div>
      )}
    </div>
  )
}

// ─── History Tab ──────────────────────────────────────────────────────────────

// Drill-down columns for shift-bookend history rows
const BOOKEND_COLS = [
  { key: 'date', label: 'Date', value: r => r.date, sortKey: r => r.date },
  { key: 'shift', label: 'Shift', value: r => r.shift },
  { key: 'location', label: 'Location', value: r => r.location },
  { key: 'openedBy', label: 'Signed By', value: r => r.openedBy },
  { key: 'completionPct', label: 'Completion', align: 'right', value: r => `${r.completionPct}%`, sortKey: r => r.completionPct },
  { key: 'issuesNoted', label: 'Issues', value: r => r.issuesNoted || '—' },
  { key: 'timeCompleted', label: 'Time', value: r => fmtClock(r.submittedAt) },
]

function HistoryTab({ isHR, history, loading }) {
  const [expanded, setExpanded] = useState(null)
  const [drill, setDrill] = useState(null)
  const openDrill = (title, rows, accent) => setDrill({ title, subtitle: `${rows.length} shift${rows.length === 1 ? '' : 's'}`, columns: BOOKEND_COLS, rows, accent })

  if (!isHR) {
    return (
      <div style={{ padding: '32px 0', textAlign: 'center', color: 'var(--t-text-faint)', fontSize: 13 }}>
        HR access required to view shift history.
      </div>
    )
  }

  if (loading) {
    return <div style={{ padding: '32px 0', textAlign: 'center', color: 'var(--t-text-faint)', fontSize: 13 }}>Loading shift history…</div>
  }

  if (!history.length) {
    return (
      <div style={{ padding: '48px 0', textAlign: 'center', color: 'var(--t-text-faint)', fontSize: 13 }}>
        No completed shift checklists yet. Submitted opening &amp; closing checklists will appear here.
      </div>
    )
  }

  // Stats (real, from submitted/locked checklists)
  const missedCount = history.filter(r => r.completionPct < 90).length
  const avgPct = Math.round(history.reduce((s, r) => s + r.completionPct, 0) / history.length)

  // Streak: consecutive most-recent shifts at 100%
  const sorted = [...history].sort((a, b) => b.date.localeCompare(a.date))
  let streak = 0
  for (const row of sorted) {
    if (row.completionPct === 100) streak++
    else break
  }

  return (
    <div>
      {/* Summary row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginBottom: 20 }}>
        <KTile label="Avg Completion" value={`${avgPct}%`} color={avgPct >= 90 ? 'var(--t-success)' : 'var(--t-warn)'} onClick={() => openDrill('All Shift Records', sorted, 'var(--t-accent)')} />
        <KTile label="Missed" value={missedCount} alert={missedCount > 5 ? 'amber' : undefined} sub="< 90% completion" onClick={() => openDrill('Missed Shifts (< 90% Completion)', history.filter(r => r.completionPct < 90), 'var(--t-warn)')} />
        <KTile label="100% Streak" value={`${streak}`} sub="consecutive shifts" color="var(--t-accent)" onClick={() => openDrill('Perfect Completion Shifts (100%)', history.filter(r => r.completionPct === 100), 'var(--t-success)')} />
      </div>
      <DrillDown open={!!drill} onClose={() => setDrill(null)} {...(drill || {})} />

      {/* History table */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: '2px solid var(--t-line)' }}>
              {['Date', 'Shift', 'Location', 'Signed By', 'Completion', 'Issues', 'Time'].map(h => (
                <th key={h} style={{
                  padding: '8px 12px',
                  textAlign: 'left',
                  fontSize: 10,
                  fontWeight: 800,
                  color: 'var(--t-text-muted)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  background: 'var(--t-surface)',
                }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map(row => {
              const isLow = row.completionPct < 90
              return (
                <>
                  <tr
                    key={row.id}
                    onClick={() => setExpanded(id => id === row.id ? null : row.id)}
                    style={{
                      borderBottom: '1px solid var(--t-line)',
                      background: isLow ? 'rgba(251,191,36,0.04)' : 'transparent',
                      cursor: 'pointer',
                    }}
                  >
                    <td style={{ padding: '10px 12px', fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--t-text)' }}>{row.date}</td>
                    <td style={{ padding: '10px 12px', fontWeight: 700, color: row.shift === 'Open' ? 'var(--t-warn)' : 'var(--t-accent)' }}>
                      {row.shift === 'Open' ? '☀️ Open' : '🌙 Close'}
                    </td>
                    <td style={{ padding: '10px 12px', color: 'var(--t-text-muted)', fontSize: 12 }}>{row.location}</td>
                    <td style={{ padding: '10px 12px', fontWeight: 600, color: 'var(--t-text)' }}>{row.openedBy}</td>
                    <td style={{ padding: '10px 12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ width: 60 }}>
                          <ProgressBar pct={row.completionPct} color={row.completionPct >= 90 ? 'var(--t-success)' : 'var(--t-warn)'} />
                        </div>
                        <span style={{
                          fontSize: 12,
                          fontWeight: 700,
                          color: row.completionPct >= 90 ? 'var(--t-success)' : 'var(--t-warn)',
                        }}>
                          {row.completionPct}%
                        </span>
                        {isLow && <span style={{ fontSize: 9, color: 'var(--t-warn)', fontWeight: 800, letterSpacing: '0.04em' }}>LOW</span>}
                      </div>
                    </td>
                    <td style={{ padding: '10px 12px', fontSize: 12, color: row.issuesNoted ? 'var(--t-warn)' : 'var(--t-text-faint)' }}>
                      {row.issuesNoted || '—'}
                    </td>
                    <td style={{ padding: '10px 12px', fontSize: 12, color: 'var(--t-text-muted)', fontFamily: 'var(--font-mono)' }}>
                      {fmtClock(row.submittedAt)}
                    </td>
                  </tr>
                  {expanded === row.id && (
                    <tr key={`${row.id}-detail`} style={{ background: 'var(--t-surface-2)', borderBottom: '1px solid var(--t-line)' }}>
                      <td colSpan={7} style={{ padding: '12px 16px' }}>
                        <div style={{ fontSize: 12, color: 'var(--t-text-muted)', lineHeight: 1.7 }}>
                          <strong style={{ color: 'var(--t-text)' }}>Shift Detail:</strong>&nbsp;
                          {row.location} · {row.shift} shift · {row.date} · Signed by {row.openedBy} at {fmtClock(row.submittedAt)} · Completion {row.completionPct}%
                          {row.issuesNoted && <> · <strong style={{ color: 'var(--t-warn)' }}>Issue:</strong> {row.issuesNoted}</>}
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ShiftBookends() {
  const { session } = useAuth()
  const { locations, locationIds } = useScope()

  const me = getSession()
  const person = session?.person || {}
  const roleName = (person.role_name || '').toLowerCase()
  const canManage = MANAGE_ROLES.some(r => roleName.includes(r))
  const isHR = HR_ROLES.some(r => roleName.includes(r))
  const authorName = person.full_name || me.full_name || ''
  const personId = person.id || me.id || null

  const [selectedNodeId, setSelectedNodeId] = useState(null)
  const [activeTab, setActiveTab] = useState('open')

  // Keep the selected location valid as scope loads / changes
  useEffect(() => {
    if (!locations || locations.length === 0) { setSelectedNodeId(null); return }
    if (!selectedNodeId || !locations.some(l => l.id === selectedNodeId)) {
      setSelectedNodeId(locations[0].id)
    }
  }, [locations]) // eslint-disable-line react-hooks/exhaustive-deps

  const selectedLocation = (locations || []).find(l => l.id === selectedNodeId) || null

  // ── Real data: today's checklist state for the selected location ──
  const [today, setToday] = useState({ open: null, close: null })
  const [todayLoading, setTodayLoading] = useState(true)

  const loadToday = useCallback(async () => {
    if (!selectedNodeId) { setToday({ open: null, close: null }); setTodayLoading(false); return }
    setTodayLoading(true)
    const { data, error } = await sb.rpc('get_bookend_today', { p_node_ids: [selectedNodeId], p_date: todayStr() })
    if (error) {
      setToday({ open: null, close: null })
    } else {
      const rows = Array.isArray(data) ? data : []
      setToday({
        open: rows.find(r => r.bookendType === 'OPEN') || null,
        close: rows.find(r => r.bookendType === 'CLOSE') || null,
      })
    }
    setTodayLoading(false)
  }, [selectedNodeId])

  useEffect(() => { loadToday() }, [loadToday])

  // ── Real data: rolling history across the caller's locations ──
  const [history, setHistory] = useState([])
  const [historyLoading, setHistoryLoading] = useState(true)
  const nodeKey = (locationIds || []).join(',')

  const loadHistory = useCallback(async () => {
    if (!locationIds || locationIds.length === 0) { setHistory([]); setHistoryLoading(false); return }
    setHistoryLoading(true)
    const { data, error } = await sb.rpc('get_bookend_checklists', { p_node_ids: locationIds, p_days: 30 })
    setHistory(!error && Array.isArray(data) ? data : [])
    setHistoryLoading(false)
  }, [nodeKey]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadHistory() }, [loadHistory])

  const refreshAll = useCallback(() => { loadToday(); loadHistory() }, [loadToday, loadHistory])

  // ── KPIs (all from real DB reads) ──
  const openPct = today.open?.completionPct ?? 0
  const closePct = today.close?.completionPct ?? 0
  const ts = todayStr()
  const openShiftsToday = history.filter(r => r.date === ts && r.shift === 'Open').length
  const missedThisWeek = history.filter(r => {
    const w = new Date(); w.setDate(w.getDate() - 7)
    return new Date(r.date) >= w && r.completionPct < 90
  }).length
  const avgCompletion = history.length ? Math.round(history.reduce((s, r) => s + r.completionPct, 0) / history.length) : 0
  const streak = (() => {
    let n = 0
    const sorted = [...history].sort((a, b) => b.date.localeCompare(a.date))
    for (const r of sorted) { if (r.completionPct === 100) n++; else break }
    return n
  })()

  // ─── Drill-down ──────────────────────────────────────────────────────────────
  const [drill, setDrill] = useState(null)
  const ITEM_COLS = [
    { key: 'section', label: 'Section', value: i => SECTION_META[i.section]?.label || i.section },
    { key: 'label', label: 'Task', value: i => i.label },
    { key: 'responsible', label: 'Responsible', value: i => i.responsible },
    { key: 'mins', label: 'Est. Min', align: 'right', value: i => `${i.mins}m`, sortKey: i => i.mins },
    { key: 'done', label: 'Status', value: i => (i.done ? 'Done' : 'Pending') },
  ]
  const openItemDrill = (title, items, checkedMap, accent) => {
    const rows = items.map(i => ({ ...i, done: !!checkedMap?.[i.id] }))
    setDrill({ title, subtitle: `${rows.filter(r => r.done).length}/${rows.length} complete · ${selectedLocation?.name || ''}`, columns: ITEM_COLS, rows, accent })
  }
  const openHistoryDrill = (title, rows, accent) =>
    setDrill({ title, subtitle: `${rows.length} shift${rows.length === 1 ? '' : 's'}`, columns: BOOKEND_COLS, rows, accent })
  const openShiftRows = history.filter(r => r.date === ts && r.shift === 'Open')

  const tabs = [
    { id: 'open',    label: '☀️ Opening Checklist' },
    { id: 'close',   label: '🌙 Closing Checklist' },
    { id: 'history', label: 'History', hrOnly: true },
  ]

  const hasLocations = (locations || []).length > 0

  return (
    <div style={{
      padding: '20px 20px 40px',
      background: 'var(--t-bg)',
      minHeight: '100%',
      fontFamily: 'var(--font-sans)',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--t-text)', letterSpacing: '-0.3px' }}>
            Shift Bookends
          </div>
          <div style={{ fontSize: 12, color: 'var(--t-text-muted)', marginTop: 3 }}>
            Opening &amp; closing procedures — {new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
          </div>
        </div>
        {hasLocations && (
          <select
            value={selectedNodeId || ''}
            onChange={e => setSelectedNodeId(e.target.value)}
            style={{
              background: 'var(--t-surface)',
              border: '1px solid var(--t-line)',
              color: 'var(--t-text)',
              fontSize: 12,
              fontWeight: 700,
              padding: '6px 12px',
              cursor: 'pointer',
              outline: 'none',
              fontFamily: 'inherit',
            }}
          >
            {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        )}
      </div>

      {!hasLocations ? (
        <div style={{ padding: '48px 0', textAlign: 'center', color: 'var(--t-text-faint)', fontSize: 13 }}>
          No locations in your scope. Shift bookends are managed per store location.
        </div>
      ) : (
        <>
          {/* KPI Strip */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: 10, marginBottom: 20 }}>
            <KTile label="Today Open %"      value={`${openPct}%`}     color={openPct >= 80 ? 'var(--t-success)' : 'var(--t-warn)'}   sub="opening items" onClick={() => openItemDrill('Opening Checklist Items', OPEN_ITEMS, today.open?.checkedItems, 'var(--t-warn)')} />
            <KTile label="Today Close %"     value={`${closePct}%`}    color={closePct >= 80 ? 'var(--t-success)' : 'var(--t-warn)'}  sub="closing items" onClick={() => openItemDrill('Closing Checklist Items', CLOSE_ITEMS, today.close?.checkedItems, 'var(--t-accent)')} />
            <KTile label="Open Shifts"       value={openShiftsToday}   sub="today" onClick={() => openHistoryDrill("Today's Open Shifts", openShiftRows, 'var(--t-accent)')} />
            <KTile label="Missed Items"      value={missedThisWeek}     alert={missedThisWeek > 5 ? 'amber' : undefined} sub="this week &lt;90%" onClick={() => openHistoryDrill('Missed Shifts This Week (< 90%)', history.filter(r => { const w = new Date(); w.setDate(w.getDate() - 7); return new Date(r.date) >= w && r.completionPct < 90 }), 'var(--t-warn)')} />
            <KTile label="Avg Completion"    value={`${avgCompletion}%`} color={avgCompletion >= 90 ? 'var(--t-success)' : 'var(--t-warn)'} sub="30 days" onClick={() => openHistoryDrill('All Shift Records', [...history].sort((a, b) => b.date.localeCompare(a.date)), 'var(--t-accent)')} />
            <KTile label="100% Streak"       value={`${streak}`}       color="var(--t-accent)" sub="consecutive shifts" onClick={() => openHistoryDrill('Perfect Completion Shifts (100%)', history.filter(r => r.completionPct === 100), 'var(--t-success)')} />
          </div>

          {/* Tab Strip */}
          <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--t-line)', marginBottom: 20 }}>
            {tabs.map(tab => {
              if (tab.hrOnly && !isHR) return null
              const active = activeTab === tab.id
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  style={{
                    padding: '8px 18px',
                    fontSize: 12,
                    fontWeight: 700,
                    border: 'none',
                    borderBottom: `2px solid ${active ? 'var(--t-accent)' : 'transparent'}`,
                    background: 'transparent',
                    color: active ? 'var(--t-accent)' : 'var(--t-text-muted)',
                    cursor: 'pointer',
                    letterSpacing: '0.02em',
                    marginBottom: -1,
                    transition: 'color 0.15s, border-color 0.15s',
                  }}
                >
                  {tab.label}
                </button>
              )
            })}
          </div>

          {/* Tab Content */}
          {activeTab === 'open' && (
            todayLoading
              ? <div style={{ padding: '32px 0', textAlign: 'center', color: 'var(--t-text-faint)', fontSize: 13 }}>Loading today's checklist…</div>
              : <OpeningTab location={selectedLocation} canManage={canManage} initial={today.open} authorName={authorName} personId={personId} onSaved={refreshAll} />
          )}
          {activeTab === 'close' && (
            todayLoading
              ? <div style={{ padding: '32px 0', textAlign: 'center', color: 'var(--t-text-faint)', fontSize: 13 }}>Loading today's checklist…</div>
              : <ClosingTab location={selectedLocation} canManage={canManage} initial={today.close} authorName={authorName} personId={personId} onSaved={refreshAll} />
          )}
          {activeTab === 'history' && (
            <HistoryTab isHR={isHR} history={history} loading={historyLoading} />
          )}
        </>
      )}

      <DrillDown open={!!drill} onClose={() => setDrill(null)} {...(drill || {})} />
    </div>
  )
}
