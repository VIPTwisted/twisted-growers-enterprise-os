import { useState, useRef, useCallback, useMemo, useEffect } from 'react'
import { useFeatureFlag } from '../lib/featureFlags.js'
import { useAuth } from '../lib/auth.jsx'
import { sb, getSession } from '../lib/supabase'
import DrillDown from '../components/DrillDown.jsx'

// ─── Feature Gate ─────────────────────────────────────────────────────────────

function FeatureDisabled() {
  return (
    <div style={{ padding: 40, textAlign: 'center', color: 'var(--t-text-muted)' }}>
      This feature is disabled. Enable it in Feature Toggles.
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
  card: (borderColor = 'var(--t-line)', leftColor = null) => ({
    background: 'var(--t-surface)',
    border: `1px solid ${borderColor}`,
    borderLeft: leftColor ? `4px solid ${leftColor}` : `1px solid ${borderColor}`,
    padding: 14,
  }),
  btn: (bg = '#00e5ff', color = '#070b14') => ({ background: bg, color, border: 'none', padding: '8px 16px', fontSize: 12, fontWeight: 700, cursor: 'pointer', letterSpacing: '0.03em', borderRadius: 0 }),
  btnOutline: (color = '#00e5ff') => ({ background: 'transparent', color, border: `1px solid ${color}`, padding: '6px 12px', fontSize: 11, fontWeight: 600, cursor: 'pointer', borderRadius: 0 }),
  btnSm: (color = '#00e5ff') => ({ background: 'transparent', color, border: `1px solid ${color}`, padding: '4px 10px', fontSize: 10, fontWeight: 600, cursor: 'pointer', borderRadius: 0 }),
  btnDanger: { background: 'rgba(255,77,125,0.15)', color: '#ff4d7d', border: '1px solid rgba(255,77,125,0.4)', padding: '5px 10px', fontSize: 11, fontWeight: 600, cursor: 'pointer', borderRadius: 0 },
  label: { fontSize: 10, fontWeight: 700, color: 'var(--t-text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 5 },
  input: { width: '100%', boxSizing: 'border-box', background: '#070b14', border: '1px solid var(--t-line)', color: 'var(--t-text)', padding: '8px 10px', fontSize: 12, outline: 'none', borderRadius: 0 },
  select: { width: '100%', boxSizing: 'border-box', background: '#070b14', border: '1px solid var(--t-line)', color: 'var(--t-text)', padding: '8px 10px', fontSize: 12, outline: 'none', borderRadius: 0, appearance: 'none' },
  textarea: { width: '100%', boxSizing: 'border-box', background: '#070b14', border: '1px solid var(--t-line)', color: 'var(--t-text)', padding: '8px 10px', fontSize: 12, outline: 'none', borderRadius: 0, resize: 'vertical', minHeight: 60 },
  toast: (type) => ({ position: 'fixed', top: 20, right: 20, zIndex: 9999, background: type === 'error' ? '#ff4d7d' : '#2ad6a0', color: '#070b14', padding: '10px 18px', fontSize: 12, fontWeight: 700, boxShadow: '0 8px 32px rgba(0,0,0,0.4)', borderRadius: 0 }),
  empty: { textAlign: 'center', padding: '48px 24px', color: 'var(--t-text-muted)', fontSize: 13 },
}

// ─── Checklist template (configuration, not data) ─────────────────────────────

const SHIFTS = ['AM', 'PM', 'Closing']

const AREAS = [
  {
    id: 'sales-floor',
    label: 'Sales Floor',
    items: [
      { id: 'swept', label: 'Swept/vacuumed sales floor' },
      { id: 'merch-straight', label: 'All merchandise straightened and faced' },
      { id: 'fixtures-dusted', label: 'Display fixtures dusted and clean' },
      { id: 'floor-debris', label: 'Floor free of visible debris' },
      { id: 'testers-sanitized', label: 'Product testers sanitized' },
    ],
  },
  {
    id: 'restrooms',
    label: 'Restrooms',
    items: [
      { id: 'toilets', label: 'Toilets cleaned and disinfected' },
      { id: 'sinks', label: 'Sinks scrubbed and wiped' },
      { id: 'mirrors', label: 'Mirrors spotless' },
      { id: 'floors-mopped', label: 'Floors mopped' },
      { id: 'supplies-stocked', label: 'Paper/soap/towels stocked' },
      { id: 'trash-emptied', label: 'Trash emptied' },
    ],
  },
  {
    id: 'register',
    label: 'Register Area',
    items: [
      { id: 'counter-wiped', label: 'Register counter wiped down' },
      { id: 'cc-terminal', label: 'Credit card terminal cleaned' },
      { id: 'receipt-paper', label: 'Receipt paper stocked' },
      { id: 'under-counter', label: 'Under-counter area swept' },
      { id: 'supplies-restock', label: 'Bags/supplies restocked' },
    ],
  },
  {
    id: 'display-cases',
    label: 'Display Cases & Glass',
    items: [
      { id: 'cases-wiped', label: 'All glass display cases wiped inside and out' },
      { id: 'counter-glass', label: 'Counter glass streak-free' },
      { id: 'case-lighting', label: 'Lighting in cases operational' },
      { id: 'merch-arranged', label: 'Merchandise arranged neatly' },
    ],
  },
  {
    id: 'back-room',
    label: 'Back Room / Storage',
    items: [
      { id: 'floor-swept', label: 'Floor swept/mopped' },
      { id: 'trash-back', label: 'Trash emptied' },
      { id: 'boxes-broken', label: 'Boxes broken down and removed' },
      { id: 'product-organized', label: 'Product organized on shelves' },
      { id: 'break-area-wiped', label: 'Break area wiped down' },
    ],
  },
  {
    id: 'entrance',
    label: 'Entrance & Windows',
    items: [
      { id: 'doors-wiped', label: 'Entry doors/glass wiped streak-free' },
      { id: 'handles-disinfected', label: 'Door handles/knobs disinfected' },
      { id: 'welcome-mat', label: 'Welcome mat clean or replaced' },
      { id: 'exterior-swept', label: 'Exterior entrance swept (if applicable)' },
    ],
  },
  {
    id: 'break-room',
    label: 'Break Room',
    items: [
      { id: 'tables-wiped', label: 'Tables wiped' },
      { id: 'microwave', label: 'Microwave cleaned inside and out' },
      { id: 'sink-clean', label: 'Sink area clean' },
      { id: 'floor-break', label: 'Floor swept/mopped' },
      { id: 'trash-break', label: 'Trash emptied' },
      { id: 'fridge-checked', label: 'Fridge checked (expired items removed)' },
    ],
  },
]

const TOTAL_ITEMS = AREAS.reduce((s, a) => s + a.items.length, 0)
const AREA_LABEL = Object.fromEntries(AREAS.map(a => [a.id, a.label]))

const MANAGER_ROLES = ['ceo', 'manager', 'coo', 'admin', 'owner', 'hr']
const isManager = (r = '') => MANAGER_ROLES.some(x => r.toLowerCase().includes(x))

const keyOf = (areaId, itemId) => `${areaId}::${itemId}`

function todayStr() { return new Date().toISOString().slice(0, 10) }

function fmtTime(isoStr) {
  if (!isoStr) return ''
  return new Date(isoStr).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

function fmtDate(ds) {
  if (!ds) return ''
  return new Date(ds + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function daysAgoStr(n) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString().slice(0, 10)
}

const LOC_PALETTE = ['var(--t-accent)', 'var(--t-success)', 'var(--t-warn)', '#b388ff', '#ff9d5c']
function locColor(loc) {
  let h = 0
  for (const c of (loc || '')) h = (h + c.charCodeAt(0)) % LOC_PALETTE.length
  return LOC_PALETTE[h]
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function KTile({ label, value, sub, color, alert, onClick }) {
  return (
    <div onClick={onClick} title={onClick ? 'Click to drill into records' : undefined} style={{ background: 'var(--t-surface)', border: `1px solid ${alert === 'red' ? 'var(--t-danger)' : alert === 'amber' ? 'var(--t-warn)' : 'var(--t-line)'}`, padding: '14px 16px', position: 'relative', overflow: 'hidden', minWidth: 100, flex: 1, cursor: onClick ? 'pointer' : 'default' }}>
      {alert === 'red' && <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'var(--t-danger)' }} />}
      {alert === 'amber' && <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'var(--t-warn)' }} />}
      {alert === 'green' && <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'var(--t-success)' }} />}
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.08em', color: 'var(--t-text-muted)', textTransform: 'uppercase', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800, color: color || 'var(--t-text)', lineHeight: 1, marginBottom: 4 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--t-text-faint)' }}>{sub}</div>}
    </div>
  )
}

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
    <span>
      <input ref={ref} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFile} />
      {value
        ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <img src={value} alt="evidence" style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 0, border: '1px solid var(--t-line)' }} />
            <button onClick={() => onChange(null)} style={{ background: 'var(--t-danger)', color: '#fff', border: 'none', borderRadius: 0, padding: '2px 6px', cursor: 'pointer', fontSize: 10 }}>✕</button>
          </span>
        : <button onClick={() => ref.current.click()} style={{ background: 'transparent', border: '1px dashed var(--t-line)', color: 'var(--t-text-muted)', padding: '3px 8px', borderRadius: 0, cursor: 'pointer', fontSize: 11 }}>
            📷 Photo
          </button>
      }
    </span>
  )
}

// ─── AreaSection ─────────────────────────────────────────────────────────────

function AreaSection({ area, checklistData, onItemChange, locked }) {
  const done = area.items.filter(it => checklistData[keyOf(area.id, it.id)]?.checked).length
  const total = area.items.length
  const allDone = done === total
  const anyDone = done > 0

  const dotColor = allDone ? 'var(--t-success)' : anyDone ? 'var(--t-warn)' : 'var(--t-danger)'

  const [open, setOpen] = useState(!allDone)
  const [expandedNotes, setExpandedNotes] = useState({})

  function toggleNote(k) {
    setExpandedNotes(prev => ({ ...prev, [k]: !prev[k] }))
  }

  return (
    <div style={{ border: '1px solid var(--t-line)', marginBottom: 8, overflow: 'hidden' }}>
      <div
        onClick={() => setOpen(o => !o)}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: 'var(--t-surface-2)', cursor: 'pointer', userSelect: 'none' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: dotColor, flexShrink: 0 }} />
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--t-text)', letterSpacing: '0.04em' }}>{area.label.toUpperCase()}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 11, color: allDone ? 'var(--t-success)' : anyDone ? 'var(--t-warn)' : 'var(--t-text-muted)', fontWeight: 600 }}>
            {done} of {total}
          </span>
          <span style={{ color: 'var(--t-text-muted)', fontSize: 12 }}>{open ? '▲' : '▼'}</span>
        </div>
      </div>

      {open && (
        <div style={{ background: '#070b14' }}>
          {area.items.map((it, idx) => {
            const k = keyOf(area.id, it.id)
            const state = checklistData[k] || {}
            const noteOpen = expandedNotes[k]

            return (
              <div key={it.id} style={{ borderTop: idx > 0 ? '1px solid var(--t-line)' : 'none', padding: '10px 14px' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  <input
                    type="checkbox"
                    checked={!!state.checked}
                    disabled={locked}
                    onChange={e => onItemChange(area.id, it.id, 'checked', e.target.checked)}
                    style={{ width: 18, height: 18, accentColor: 'var(--t-accent)', marginTop: 1, cursor: locked ? 'not-allowed' : 'pointer', flexShrink: 0, borderRadius: 0 }}
                  />

                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
                      <span style={{ fontSize: 13, color: state.checked ? 'var(--t-text-muted)' : 'var(--t-text)', textDecoration: state.checked ? 'line-through' : 'none' }}>
                        {it.label}
                      </span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {state.completedAt && (
                          <span style={{ fontSize: 10, color: 'var(--t-success)' }}>Completed {fmtTime(state.completedAt)}</span>
                        )}
                        {!locked && (
                          <button
                            onClick={() => toggleNote(k)}
                            style={{ background: 'transparent', border: 'none', color: state.note ? 'var(--t-accent)' : 'var(--t-text-faint)', fontSize: 11, cursor: 'pointer', padding: '2px 6px', borderRadius: 0, textDecoration: 'underline' }}
                          >
                            {noteOpen ? 'Hide note' : state.note ? 'Note ✓' : 'Note'}
                          </button>
                        )}
                        {!locked && (
                          <ImageUploader
                            value={state.photo || null}
                            onChange={val => onItemChange(area.id, it.id, 'photo', val)}
                          />
                        )}
                        {locked && state.photo && (
                          <img src={state.photo} alt="evidence" style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 0, border: '1px solid var(--t-line)' }} />
                        )}
                      </div>
                    </div>

                    {noteOpen && !locked && (
                      <textarea
                        value={state.note || ''}
                        onChange={e => onItemChange(area.id, it.id, 'note', e.target.value)}
                        onBlur={e => onItemChange(area.id, it.id, 'note', e.target.value, true)}
                        placeholder="Add a note for this item…"
                        style={{ ...S.textarea, marginTop: 8, minHeight: 52, fontSize: 12 }}
                      />
                    )}
                    {locked && state.note && (
                      <div style={{ marginTop: 6, fontSize: 11, color: 'var(--t-text-faint)', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--t-line)', padding: '5px 8px' }}>
                        {state.note}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── ChecklistView ────────────────────────────────────────────────────────────
// Self-contained: loads its own shift state from the server and persists every
// change via RPC. No localStorage, no fabricated defaults.

function ChecklistView({ node, shift, dateStr, personId, userRole, userName, showToast, onChanged }) {
  const [checklistData, setChecklistData] = useState({})
  const [signoff, setSignoff] = useState(null)
  const [loading, setLoading] = useState(true)
  const [confirmingSignoff, setConfirmingSignoff] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const { data, error } = await sb.rpc('cleaning_shift_get', {
      p_node_id: node.id, p_date: dateStr, p_shift: shift,
    })
    if (error) {
      showToast('Could not load checklist: ' + error.message, 'error')
      setChecklistData({}); setSignoff(null); setLoading(false)
      return
    }
    const map = {}
    for (const it of (data?.items || [])) {
      map[keyOf(it.area_id, it.item_id)] = {
        checked: !!it.checked, note: it.note || '', photo: it.photo || null,
        completedAt: it.completed_at, completedBy: it.completed_by,
      }
    }
    setChecklistData(map)
    setSignoff(data?.signoff || null)
    setLoading(false)
  }, [node.id, dateStr, shift, showToast])

  useEffect(() => { load() }, [load])

  const completedItems = useMemo(
    () => AREAS.reduce((s, a) => s + a.items.filter(it => checklistData[keyOf(a.id, it.id)]?.checked).length, 0),
    [checklistData],
  )
  const remaining = TOTAL_ITEMS - completedItems
  const locked = !!signoff

  async function persistItem(areaId, itemId, item) {
    const { error } = await sb.rpc('cleaning_item_set', {
      p_node_id: node.id, p_date: dateStr, p_shift: shift,
      p_area_id: areaId, p_item_id: itemId,
      p_checked: !!item.checked, p_note: item.note || null, p_photo: item.photo || null,
      p_by: userName, p_by_id: personId || null,
    })
    if (error) {
      showToast('Not saved: ' + error.message, 'error')
      load()
      return
    }
    if (onChanged) onChanged()
  }

  function handleItemChange(areaId, itemId, field, value, isBlur = false) {
    if (locked) return
    const k = keyOf(areaId, itemId)
    const cur = checklistData[k] || {}
    let updated
    if (field === 'checked') {
      updated = { ...cur, checked: value, completedAt: value ? new Date().toISOString() : null, completedBy: value ? userName : cur.completedBy }
    } else {
      updated = { ...cur, [field]: value }
    }
    setChecklistData(prev => ({ ...prev, [k]: updated }))
    // Persist on checkbox/photo immediately; for note text only on blur to avoid
    // a write per keystroke.
    if (field === 'note' && !isBlur) return
    persistItem(areaId, itemId, updated)
  }

  async function doSignoff() {
    const { error } = await sb.rpc('cleaning_signoff', {
      p_node_id: node.id, p_date: dateStr, p_shift: shift,
      p_manager: userName, p_manager_id: personId || null,
    })
    if (error) { showToast('Sign-off failed: ' + error.message, 'error'); return }
    setConfirmingSignoff(false)
    showToast('Shift signed off.')
    load()
    if (onChanged) onChanged()
  }

  if (loading) {
    return <div style={{ padding: '20px 4px', color: 'var(--t-text-muted)', fontSize: 12 }}>Loading checklist…</div>
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <div>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--t-text-muted)', letterSpacing: '0.05em' }}>
            {fmtDate(dateStr)} · {shift} Shift · {node.name}
          </span>
        </div>
        <div style={{ fontSize: 12, color: completedItems === TOTAL_ITEMS ? 'var(--t-success)' : 'var(--t-text-muted)' }}>
          <strong style={{ color: completedItems === TOTAL_ITEMS ? 'var(--t-success)' : 'var(--t-text)' }}>{completedItems}</strong> of {TOTAL_ITEMS} items complete
        </div>
      </div>

      {AREAS.map(area => (
        <AreaSection
          key={area.id}
          area={area}
          checklistData={checklistData}
          onItemChange={handleItemChange}
          locked={locked}
        />
      ))}

      {isManager(userRole) && (
        <div style={{ marginTop: 20, border: `1px solid ${locked ? 'var(--t-success)' : remaining > 0 ? 'var(--t-danger)' : 'var(--t-success)'}`, padding: '16px 18px', background: 'var(--t-surface)' }}>
          {locked ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 18 }}>✓</span>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--t-success)' }}>Signed off by {signoff.manager_name || 'Manager'}</div>
                <div style={{ fontSize: 11, color: 'var(--t-text-muted)', marginTop: 2 }}>at {fmtTime(signoff.signed_at)}</div>
              </div>
            </div>
          ) : (
            <div>
              <div style={{ fontSize: 12, color: 'var(--t-text)', marginBottom: 10 }}>
                Checklist: <strong>{completedItems} of {TOTAL_ITEMS}</strong> items complete
              </div>
              {remaining > 0 ? (
                <div style={{ fontSize: 12, color: 'var(--t-danger)', fontWeight: 600 }}>
                  Cannot sign off — {remaining} item{remaining !== 1 ? 's' : ''} remaining
                </div>
              ) : (
                <>
                  {!confirmingSignoff ? (
                    <button onClick={() => setConfirmingSignoff(true)} style={S.btn('var(--t-success)', '#070b14')}>
                      Sign Off This Shift
                    </button>
                  ) : (
                    <div style={{ border: '1px solid var(--t-success)', padding: '12px 14px', background: 'rgba(42,214,160,0.06)' }}>
                      <div style={{ fontSize: 12, color: 'var(--t-text)', marginBottom: 12 }}>
                        Sign off <strong>{shift}</strong> cleaning log for <strong>{node.name}</strong> on <strong>{fmtDate(dateStr)}</strong>?
                        <br />
                        <span style={{ color: 'var(--t-text-muted)', fontSize: 11 }}>This records your name as the approving manager.</span>
                      </div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button onClick={doSignoff} style={S.btn('var(--t-success)', '#070b14')}>Confirm Sign-Off</button>
                        <button onClick={() => setConfirmingSignoff(false)} style={S.btnOutline('var(--t-text-muted)')}>Cancel</button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── TodaysLogsTab ────────────────────────────────────────────────────────────

function TodaysLogsTab({ locations, nodeIds, personId, userRole, userName, showToast }) {
  const [activeLocation, setActiveLocation] = useState('All')
  const [activeShift, setActiveShift] = useState('AM')
  const [drill, setDrill] = useState(null)
  const [summary, setSummary] = useState([])
  const today = todayStr()

  const loadDay = useCallback(async () => {
    if (!nodeIds.length) { setSummary([]); return }
    const { data, error } = await sb.rpc('cleaning_day_get', { p_node_ids: nodeIds, p_date: today })
    if (error) { showToast('Could not load today\'s summary: ' + error.message, 'error'); setSummary([]); return }
    setSummary(Array.isArray(data) ? data : [])
  }, [nodeIds, today, showToast])

  useEffect(() => { loadDay() }, [loadDay])

  // Every location × shift combo, filled from real server counts (0 when untouched).
  const todayRows = useMemo(() => {
    const byKey = {}
    for (const r of summary) byKey[`${r.node_id}|${r.shift}`] = r
    const rows = []
    for (const loc of locations) {
      for (const sh of SHIFTS) {
        const r = byKey[`${loc.id}|${sh}`]
        const done = r?.items_complete || 0
        rows.push({
          location: loc.name, shift: sh, itemsComplete: done, totalItems: TOTAL_ITEMS,
          compliancePct: Math.round((done / TOTAL_ITEMS) * 100),
          signedOffBy: r?.signed_off_by || null, remaining: TOTAL_ITEMS - done,
        })
      }
    }
    return rows
  }, [summary, locations])

  const kpis = useMemo(() => {
    const combos = todayRows.length || 1
    return {
      avgCompliance: Math.round(todayRows.reduce((s, r) => s + r.compliancePct, 0) / combos),
      signedOff: todayRows.filter(r => r.signedOffBy).length,
      inProgress: todayRows.filter(r => r.itemsComplete > 0 && r.remaining > 0).length,
      itemsDone: todayRows.reduce((s, r) => s + r.itemsComplete, 0),
    }
  }, [todayRows])

  const displayLocations = activeLocation === 'All' ? locations : locations.filter(l => l.name === activeLocation)

  const TODAY_COLS = [
    { key: 'location', label: 'Location', value: r => r.location },
    { key: 'shift', label: 'Shift', value: r => r.shift },
    { key: 'itemsComplete', label: 'Items Done', value: r => `${r.itemsComplete} / ${r.totalItems}`, align: 'right', sortKey: r => r.itemsComplete },
    { key: 'remaining', label: 'Remaining', value: r => r.remaining, align: 'right', sortKey: r => r.remaining },
    { key: 'compliancePct', label: 'Compliance', value: r => `${r.compliancePct}%`, align: 'right', sortKey: r => r.compliancePct },
    { key: 'signedOffBy', label: 'Signed Off By', value: r => r.signedOffBy || '—' },
  ]
  const openDrill = (title, rows, accent) => setDrill({
    title, subtitle: `${rows.length} shift record${rows.length === 1 ? '' : 's'} · today`, columns: TODAY_COLS, rows, accent,
  })

  if (!locations.length) {
    return <div style={S.empty}>No locations are assigned to your account, so there are no cleaning logs to show yet.</div>
  }

  return (
    <div>
      {/* KPI row */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 20 }}>
        <KTile
          label="Today's Compliance Rate"
          value={`${kpis.avgCompliance}%`}
          sub={`Avg across ${locations.length} location${locations.length === 1 ? '' : 's'}`}
          color={kpis.avgCompliance >= 80 ? 'var(--t-success)' : 'var(--t-warn)'}
          onClick={() => openDrill("Today's Compliance — All Shifts", todayRows, kpis.avgCompliance >= 80 ? 'var(--t-success)' : 'var(--t-warn)')}
        />
        <KTile
          label="Shifts Signed Off Today"
          value={`${kpis.signedOff}`}
          sub={`of ${locations.length * SHIFTS.length} shifts`}
          color="var(--t-text)"
          onClick={() => openDrill('Signed-Off Shifts — Today', todayRows.filter(r => r.signedOffBy), 'var(--t-success)')}
        />
        <KTile
          label="Shifts In Progress"
          value={kpis.inProgress}
          sub="Started, not yet complete"
          alert={kpis.inProgress > 0 ? 'amber' : undefined}
          onClick={() => openDrill('Shifts In Progress — Today', todayRows.filter(r => r.itemsComplete > 0 && r.remaining > 0), 'var(--t-warn)')}
        />
        <KTile
          label="Items Completed Today"
          value={kpis.itemsDone}
          sub="Across all locations & shifts"
          color="var(--t-success)"
          alert={kpis.itemsDone > 0 ? 'green' : undefined}
          onClick={() => openDrill('Shifts With Activity — Today', todayRows.filter(r => r.itemsComplete > 0), 'var(--t-success)')}
        />
      </div>

      <DrillDown open={!!drill} onClose={() => setDrill(null)} {...(drill || {})} />

      {/* Location tabs */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--t-line)', marginBottom: 16, overflowX: 'auto' }}>
        {['All', ...locations.map(l => l.name)].map(loc => (
          <button
            key={loc}
            onClick={() => setActiveLocation(loc)}
            style={{
              padding: '8px 14px', fontSize: 11, fontWeight: 700, cursor: 'pointer',
              background: 'transparent', border: 'none',
              borderBottom: activeLocation === loc ? `2px solid ${loc === 'All' ? '#00e5ff' : locColor(loc)}` : '2px solid transparent',
              color: activeLocation === loc ? (loc === 'All' ? '#00e5ff' : locColor(loc)) : 'var(--t-text-muted)',
              whiteSpace: 'nowrap', letterSpacing: '0.06em',
            }}
          >
            {loc.toUpperCase()}
          </button>
        ))}
      </div>

      {/* Shift tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {SHIFTS.map(sh => (
          <button
            key={sh}
            onClick={() => setActiveShift(sh)}
            style={{
              padding: '6px 14px', fontSize: 11, fontWeight: 700, cursor: 'pointer', borderRadius: 0,
              border: activeShift === sh ? '1px solid var(--t-accent)' : '1px solid var(--t-line)',
              background: activeShift === sh ? 'rgba(0,229,255,0.1)' : 'transparent',
              color: activeShift === sh ? 'var(--t-accent)' : 'var(--t-text-muted)', letterSpacing: '0.06em',
            }}
          >
            {sh}
          </button>
        ))}
      </div>

      {/* Checklists */}
      {displayLocations.map(loc => (
        <div key={loc.id} style={{ marginBottom: 28 }}>
          {displayLocations.length > 1 && (
            <div style={{ fontSize: 11, fontWeight: 800, color: locColor(loc.name), letterSpacing: '0.1em', marginBottom: 10, textTransform: 'uppercase', borderBottom: `1px solid ${locColor(loc.name)}`, paddingBottom: 6 }}>
              {loc.name}
            </div>
          )}
          <ChecklistView
            key={`${loc.id}-${activeShift}`}
            node={loc}
            shift={activeShift}
            dateStr={today}
            personId={personId}
            userRole={userRole}
            userName={userName}
            showToast={showToast}
            onChanged={loadDay}
          />
        </div>
      ))}
    </div>
  )
}

// ─── HistoryTab ───────────────────────────────────────────────────────────────

function HistoryTab({ locations, nodeIds, showToast }) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [filterLoc, setFilterLoc] = useState('all')
  const [filterShift, setFilterShift] = useState('all')
  const [filterSignedOff, setFilterSignedOff] = useState('all')
  const [filterDateFrom, setFilterDateFrom] = useState('')
  const [filterDateTo, setFilterDateTo] = useState('')
  const [page, setPage] = useState(0)
  const [drill, setDrill] = useState(null)
  const PAGE_SIZE = 20

  useEffect(() => {
    let alive = true
    async function run() {
      if (!nodeIds.length) { setRows([]); setLoading(false); return }
      setLoading(true)
      const { data, error } = await sb.rpc('cleaning_history', {
        p_node_ids: nodeIds, p_date_from: daysAgoStr(90), p_date_to: todayStr(),
      })
      if (!alive) return
      if (error) { showToast('Could not load history: ' + error.message, 'error'); setRows([]); setLoading(false); return }
      const mapped = (Array.isArray(data) ? data : []).map(r => ({
        id: `${r.node_id}-${r.log_date}-${r.shift}`,
        date: r.log_date, location: r.node_name || '—', shift: r.shift,
        itemsComplete: r.items_complete || 0, totalItems: TOTAL_ITEMS,
        signedOffBy: r.signed_off_by || null, signOffTime: r.sign_off_time || null,
        compliancePct: Math.round(((r.items_complete || 0) / TOTAL_ITEMS) * 100),
      }))
      setRows(mapped); setLoading(false)
    }
    run()
    return () => { alive = false }
  }, [nodeIds, showToast])

  const filtered = useMemo(() => rows.filter(r => {
    if (filterLoc !== 'all' && r.location !== filterLoc) return false
    if (filterShift !== 'all' && r.shift !== filterShift) return false
    if (filterSignedOff === 'yes' && !r.signedOffBy) return false
    if (filterSignedOff === 'no' && r.signedOffBy) return false
    if (filterDateFrom && r.date < filterDateFrom) return false
    if (filterDateTo && r.date > filterDateTo) return false
    return true
  }), [rows, filterLoc, filterShift, filterSignedOff, filterDateFrom, filterDateTo])

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  const pageRows = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  const HIST_COLS = [
    { key: 'date', label: 'Date', value: r => fmtDate(r.date), sortKey: r => r.date },
    { key: 'location', label: 'Location', value: r => r.location },
    { key: 'shift', label: 'Shift', value: r => r.shift },
    { key: 'items', label: 'Items Complete', value: r => `${r.itemsComplete} / ${r.totalItems}`, align: 'right', sortKey: r => r.itemsComplete },
    { key: 'signedOffBy', label: 'Signed Off By', value: r => r.signedOffBy || '—' },
    { key: 'signOffTime', label: 'Sign-Off Time', value: r => r.signOffTime ? fmtTime(r.signOffTime) : '—' },
    { key: 'compliancePct', label: 'Compliance', value: r => `${r.compliancePct}%`, align: 'right', sortKey: r => r.compliancePct },
  ]

  const sevenDayAvg = useMemo(() => {
    const cutoff = daysAgoStr(7)
    return locations.map(loc => {
      const lr = rows.filter(r => r.location === loc.name && r.date >= cutoff)
      if (!lr.length) return { loc: loc.name, avg: 0 }
      return { loc: loc.name, avg: Math.round(lr.reduce((s, r) => s + r.compliancePct, 0) / lr.length) }
    })
  }, [rows, locations])

  const maxAvg = Math.max(...sevenDayAvg.map(x => x.avg), 1)

  function barColor(pct) {
    if (pct >= 90) return 'var(--t-success)'
    if (pct >= 70) return 'var(--t-warn)'
    return 'var(--t-danger)'
  }

  const hasFilters = filterLoc !== 'all' || filterShift !== 'all' || filterSignedOff !== 'all' || filterDateFrom || filterDateTo

  if (loading) return <div style={{ padding: '20px 4px', color: 'var(--t-text-muted)', fontSize: 12 }}>Loading history…</div>
  if (!locations.length) return <div style={S.empty}>No locations assigned to your account.</div>

  return (
    <div>
      {/* 7-day KPI tiles */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 20 }}>
        {sevenDayAvg.map(({ loc, avg }) => {
          const cutoff = daysAgoStr(7)
          const lr = rows.filter(r => r.location === loc && r.date >= cutoff)
          return (
            <div key={loc}
              onClick={() => lr.length && setDrill({ title: `${loc} — 7-Day Compliance History`, subtitle: `${lr.length} shift records · 7-day avg ${avg}%`, columns: HIST_COLS, rows: lr, accent: barColor(avg) })}
              title={lr.length ? 'Click to drill into records' : undefined}
              style={{ flex: 1, minWidth: 120, background: 'var(--t-surface)', border: '1px solid var(--t-line)', padding: '14px 16px', cursor: lr.length ? 'pointer' : 'default' }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: locColor(loc), letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6 }}>{loc}</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: barColor(avg), lineHeight: 1, marginBottom: 4 }}>{avg}%</div>
              <div style={{ fontSize: 10, color: 'var(--t-text-faint)' }}>7-day avg</div>
            </div>
          )
        })}
      </div>

      {/* CSS bar chart */}
      <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', padding: '16px 18px', marginBottom: 20 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--t-text-muted)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 14 }}>7-Day Compliance by Location</div>
        {sevenDayAvg.map(({ loc, avg }) => (
          <div key={loc} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
            <div style={{ width: 90, fontSize: 11, fontWeight: 700, color: locColor(loc), textAlign: 'right', flexShrink: 0 }}>{loc}</div>
            <div style={{ flex: 1, height: 16, background: 'var(--t-line)', position: 'relative', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${(avg / maxAvg) * 100}%`, background: barColor(avg), transition: 'width 0.4s' }} />
            </div>
            <div style={{ width: 40, fontSize: 12, fontWeight: 700, color: barColor(avg), flexShrink: 0 }}>{avg}%</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14, alignItems: 'flex-end' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={S.label}>Location</label>
          <select value={filterLoc} onChange={e => { setFilterLoc(e.target.value); setPage(0) }} style={{ ...S.select, width: 'auto' }}>
            <option value="all">All Locations</option>
            {locations.map(l => <option key={l.id} value={l.name}>{l.name}</option>)}
          </select>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={S.label}>Shift</label>
          <select value={filterShift} onChange={e => { setFilterShift(e.target.value); setPage(0) }} style={{ ...S.select, width: 'auto' }}>
            <option value="all">All Shifts</option>
            {SHIFTS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={S.label}>Signed Off</label>
          <select value={filterSignedOff} onChange={e => { setFilterSignedOff(e.target.value); setPage(0) }} style={{ ...S.select, width: 'auto' }}>
            <option value="all">Any</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </select>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={S.label}>From</label>
          <input type="date" value={filterDateFrom} onChange={e => { setFilterDateFrom(e.target.value); setPage(0) }} style={{ ...S.input, width: 'auto' }} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={S.label}>To</label>
          <input type="date" value={filterDateTo} onChange={e => { setFilterDateTo(e.target.value); setPage(0) }} style={{ ...S.input, width: 'auto' }} />
        </div>
        {hasFilters && (
          <button
            style={{ ...S.btnSm('var(--t-text-muted)'), alignSelf: 'flex-end' }}
            onClick={() => { setFilterLoc('all'); setFilterShift('all'); setFilterSignedOff('all'); setFilterDateFrom(''); setFilterDateTo(''); setPage(0) }}
          >
            CLEAR
          </button>
        )}
      </div>

      {/* Table */}
      <div style={{ border: '1px solid var(--t-line)', overflow: 'hidden', overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ background: 'var(--t-surface-2)', borderBottom: '1px solid var(--t-line)' }}>
              {['Date', 'Location', 'Shift', 'Items Complete', 'Signed Off By', 'Sign-Off Time', 'Compliance'].map(h => (
                <th key={h} style={{ padding: '9px 14px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: 'var(--t-text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageRows.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ padding: '32px 14px', textAlign: 'center', color: 'var(--t-text-muted)', fontSize: 13 }}>
                  {hasFilters ? 'No records match your filters.' : 'No cleaning history recorded yet.'}
                </td>
              </tr>
            ) : pageRows.map((r, i) => (
              <tr key={r.id} style={{ borderBottom: i < pageRows.length - 1 ? '1px solid var(--t-line)' : 'none', background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)' }}>
                <td style={{ padding: '9px 14px', color: 'var(--t-text)' }}>{fmtDate(r.date)}</td>
                <td style={{ padding: '9px 14px', fontWeight: 700, color: locColor(r.location) }}>{r.location}</td>
                <td style={{ padding: '9px 14px', color: 'var(--t-text-muted)' }}>{r.shift}</td>
                <td style={{ padding: '9px 14px', color: 'var(--t-text)' }}>{r.itemsComplete} / {r.totalItems}</td>
                <td style={{ padding: '9px 14px', color: r.signedOffBy ? 'var(--t-text)' : 'var(--t-text-faint)' }}>{r.signedOffBy || '—'}</td>
                <td style={{ padding: '9px 14px', color: 'var(--t-text-muted)', fontSize: 11 }}>{r.signOffTime ? fmtTime(r.signOffTime) : '—'}</td>
                <td style={{ padding: '9px 14px' }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: barColor(r.compliancePct) }}>{r.compliancePct}%</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12 }}>
          <button
            disabled={page === 0}
            onClick={() => setPage(p => Math.max(0, p - 1))}
            style={{ ...S.btnSm(), opacity: page === 0 ? 0.4 : 1, cursor: page === 0 ? 'not-allowed' : 'pointer' }}
          >
            ◀ Prev
          </button>
          <span style={{ fontSize: 11, color: 'var(--t-text-muted)' }}>Page {page + 1} of {totalPages} · {filtered.length} records</span>
          <button
            disabled={page >= totalPages - 1}
            onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
            style={{ ...S.btnSm(), opacity: page >= totalPages - 1 ? 0.4 : 1, cursor: page >= totalPages - 1 ? 'not-allowed' : 'pointer' }}
          >
            Next ▶
          </button>
        </div>
      )}

      <DrillDown open={!!drill} onClose={() => setDrill(null)} {...(drill || {})} />
    </div>
  )
}

// ─── IssuesTab ────────────────────────────────────────────────────────────────

function IssuesTab({ locations, nodeIds, personId, userRole, userName, showToast }) {
  const [issues, setIssues] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ node_id: '', area: AREAS[0].label, item: '', note: '' })
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    if (!nodeIds.length) { setIssues([]); setLoading(false); return }
    setLoading(true)
    const { data, error } = await sb.rpc('cleaning_issues_list', { p_node_ids: nodeIds })
    if (error) { showToast('Could not load issues: ' + error.message, 'error'); setIssues([]); setLoading(false); return }
    setIssues((Array.isArray(data) ? data : []).map(i => ({
      id: i.id, date: i.log_date, location: i.node_name || '—', area: i.area, item: i.item,
      note: i.note, reportedBy: i.reported_by, status: i.status,
    })))
    setLoading(false)
  }, [nodeIds, showToast])

  useEffect(() => { load() }, [load])

  async function markResolved(id) {
    const { error } = await sb.rpc('cleaning_issue_resolve', { p_id: id, p_by: userName })
    if (error) { showToast('Could not resolve: ' + error.message, 'error'); return }
    showToast('Issue resolved.')
    load()
  }

  async function submitIssue() {
    if (!form.node_id) { showToast('Choose a location.', 'error'); return }
    if (!form.item.trim() && !form.note.trim()) { showToast('Describe the issue.', 'error'); return }
    setSaving(true)
    const { error } = await sb.rpc('cleaning_issue_create', {
      p_node_id: form.node_id, p_date: todayStr(), p_area: form.area,
      p_item: form.item.trim() || null, p_note: form.note.trim() || null,
      p_by: userName, p_by_id: personId || null,
    })
    setSaving(false)
    if (error) { showToast('Could not report issue: ' + error.message, 'error'); return }
    showToast('Issue reported.')
    setForm({ node_id: '', area: AREAS[0].label, item: '', note: '' })
    setShowForm(false)
    load()
  }

  const openIssues = issues.filter(i => i.status === 'Open')
  const resolvedIssues = issues.filter(i => i.status === 'Resolved')

  function IssueTable({ rows, title }) {
    if (!rows.length) return null
    return (
      <div style={{ marginBottom: 24 }}>
        <div style={S.sectionLabel}>{title} ({rows.length})</div>
        <div style={{ border: '1px solid var(--t-line)', overflow: 'hidden', overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: 'var(--t-surface-2)', borderBottom: '1px solid var(--t-line)' }}>
                {['Date', 'Location', 'Area', 'Item', 'Note', 'Reported By', 'Status', ...(isManager(userRole) ? ['Action'] : [])].map(h => (
                  <th key={h} style={{ padding: '9px 12px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: 'var(--t-text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((iss, i) => (
                <tr key={iss.id} style={{ borderBottom: i < rows.length - 1 ? '1px solid var(--t-line)' : 'none' }}>
                  <td style={{ padding: '9px 12px', color: 'var(--t-text-muted)', whiteSpace: 'nowrap' }}>{fmtDate(iss.date)}</td>
                  <td style={{ padding: '9px 12px', fontWeight: 700, color: locColor(iss.location) }}>{iss.location}</td>
                  <td style={{ padding: '9px 12px', color: 'var(--t-text)', fontSize: 11 }}>{iss.area}</td>
                  <td style={{ padding: '9px 12px', color: 'var(--t-text-faint)', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{iss.item}</td>
                  <td style={{ padding: '9px 12px', color: 'var(--t-text)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{iss.note}</td>
                  <td style={{ padding: '9px 12px', color: 'var(--t-text-muted)', whiteSpace: 'nowrap' }}>{iss.reportedBy}</td>
                  <td style={{ padding: '9px 12px' }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: iss.status === 'Open' ? 'var(--t-danger)' : 'var(--t-success)', border: `1px solid ${iss.status === 'Open' ? 'rgba(255,77,125,0.4)' : 'rgba(42,214,160,0.4)'}`, padding: '2px 6px' }}>
                      {iss.status.toUpperCase()}
                    </span>
                  </td>
                  {isManager(userRole) && (
                    <td style={{ padding: '9px 12px' }}>
                      {iss.status === 'Open' && (
                        <button onClick={() => markResolved(iss.id)} style={S.btnSm('var(--t-success)')}>
                          Mark Resolved
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  if (loading) return <div style={{ padding: '20px 4px', color: 'var(--t-text-muted)', fontSize: 12 }}>Loading issues…</div>

  return (
    <div>
      {/* Report an issue */}
      <div style={{ marginBottom: 20 }}>
        {!showForm ? (
          <button
            style={S.btn()}
            disabled={!locations.length}
            onClick={() => { setShowForm(true); setForm(f => ({ ...f, node_id: locations[0]?.id || '' })) }}
          >
            + Report an Issue
          </button>
        ) : (
          <div style={{ ...S.card(), display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, alignItems: 'end' }}>
            <div>
              <label style={S.label}>Location</label>
              <select value={form.node_id} onChange={e => setForm({ ...form, node_id: e.target.value })} style={S.select}>
                {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </div>
            <div>
              <label style={S.label}>Area</label>
              <select value={form.area} onChange={e => setForm({ ...form, area: e.target.value })} style={S.select}>
                {AREAS.map(a => <option key={a.id} value={a.label}>{a.label}</option>)}
              </select>
            </div>
            <div>
              <label style={S.label}>Item</label>
              <input value={form.item} onChange={e => setForm({ ...form, item: e.target.value })} placeholder="e.g. Toilets cleaned" style={S.input} />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={S.label}>Note</label>
              <textarea value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} placeholder="Describe the issue…" style={S.textarea} />
            </div>
            <div style={{ display: 'flex', gap: 8, gridColumn: '1 / -1' }}>
              <button onClick={submitIssue} disabled={saving} style={{ ...S.btn(), opacity: saving ? 0.6 : 1 }}>{saving ? 'Saving…' : 'Submit Issue'}</button>
              <button onClick={() => setShowForm(false)} style={S.btnOutline('var(--t-text-muted)')}>Cancel</button>
            </div>
          </div>
        )}
      </div>

      <IssueTable rows={openIssues} title="Open Issues" />
      <IssueTable rows={resolvedIssues} title="Resolved" />
      {issues.length === 0 && (
        <div style={S.empty}>No flagged issues yet.</div>
      )}
    </div>
  )
}

// ─── Main Export ──────────────────────────────────────────────────────────────

export default function CleaningLogs() {
  const flagEnabled = useFeatureFlag('cleaning_logs')
  const { session } = useAuth()

  const [tab, setTab] = useState('today')
  const [toast, setToast] = useState(null)
  const toastRef = useRef(null)

  const showToast = useCallback((msg, type = 'success') => {
    setToast({ msg, type })
    if (toastRef.current) clearTimeout(toastRef.current)
    toastRef.current = setTimeout(() => setToast(null), 3200)
  }, [])

  // Read the session once — getSession() returns a fresh object each call, so
  // memoizing keeps locations/nodeIds referentially stable (no reload loops).
  const me = useMemo(() => getSession(), [])
  const locations = useMemo(
    () => (me.nodes || []).filter(n => n.node_type === 'location'),
    [me],
  )
  const nodeIds = useMemo(() => locations.map(l => l.id), [locations])

  if (!flagEnabled) return <FeatureDisabled />

  const userRole = session?.person?.role_name || session?.person?.role || session?.role || 'associate'
  const userName = session?.person?.full_name || session?.person?.name || me.full_name || me.name || 'Manager'
  const personId = me.id || session?.person?.id || null

  const TABS = [
    { id: 'today', label: "TODAY'S LOGS" },
    { id: 'history', label: 'HISTORY / COMPLIANCE' },
    { id: 'issues', label: 'ISSUES LOG' },
  ]

  return (
    <div style={S.page}>
      {toast && <div style={S.toast(toast.type)}>{toast.msg}</div>}

      {/* Header */}
      <div style={S.header}>
        <div style={S.headerLeft}>
          <div style={S.title}>STORE CLEANING LOGS</div>
          <div style={S.subtitle}>Daily cleanliness compliance — sign-off required per shift</div>
        </div>
        <div style={S.headerRight}>
          <span style={{ fontSize: 11, color: 'var(--t-text-muted)' }}>{todayStr()}</span>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ padding: '0 20px', borderBottom: '1px solid var(--t-line)' }}>
        <div style={{ display: 'flex', gap: 0, overflowX: 'auto' }}>
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                padding: '11px 16px', fontSize: 11, fontWeight: 600, cursor: 'pointer',
                background: 'transparent', border: 'none',
                borderBottom: tab === t.id ? '2px solid #00e5ff' : '2px solid transparent',
                color: tab === t.id ? '#00e5ff' : 'var(--t-text-muted)',
                whiteSpace: 'nowrap', letterSpacing: '0.06em',
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Body */}
      <div style={S.body}>
        {tab === 'today' && <TodaysLogsTab locations={locations} nodeIds={nodeIds} personId={personId} userRole={userRole} userName={userName} showToast={showToast} />}
        {tab === 'history' && <HistoryTab locations={locations} nodeIds={nodeIds} showToast={showToast} />}
        {tab === 'issues' && <IssuesTab locations={locations} nodeIds={nodeIds} personId={personId} userRole={userRole} userName={userName} showToast={showToast} />}
      </div>
    </div>
  )
}
