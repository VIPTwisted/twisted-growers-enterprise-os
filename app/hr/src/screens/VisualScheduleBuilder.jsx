// VisualScheduleBuilder.jsx — Odoo Planning-style visual scheduler. See the
// ACTUAL week grid per location, click a shift slot → pick from AVAILABLE staff
// (availability + keyholder shown), assign/remove. Every action writes straight
// to the real backend (public.shifts via vsb_assign / vsb_remove) and the grid
// re-reads vsb_get_schedule — no local draft, no fake data.
import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth.jsx'
import { useScope } from '../lib/scope.jsx'
import { sb } from '../lib/supabase'

const SHIFTS = [
  { id: 'AM', label: 'AM', hours: '9:00a–5:00p', color: '#ffd60a' },
  { id: 'PM', label: 'PM', hours: '1:00p–9:00p', color: '#00e5ff' },
]
const KH_RX = /key|manager|lead|owner|supervisor|director|coordinator/i
const isKH = (r) => KH_RX.test(r || '')
const REQ = { AM: { staff: 3, keys: 2 }, PM: { staff: 3, keys: 2 } }  // coverage targets
const ZONES = ['Floor', 'Register', 'Fitting', 'Stock', 'Manager', 'Close']
// Key Holders = GREEN, Associates = BLUE
const posClr = (kh) => kh ? 'var(--t-success)' : '#3d8bff'

function mondayOf(base) { const d = new Date(base); const day = d.getDay(); d.setDate(d.getDate() - day + (day === 0 ? -6 : 1)); d.setHours(0, 0, 0, 0); return d }
function iso(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
function sameDay(a, b) { return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate() }
const dayLabel = (d) => d.toLocaleDateString('en-US', { weekday: 'short' })
const dayNum = (d) => d.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' })

export default function VisualScheduleBuilder() {
  const { session } = useAuth()
  const nav = useNavigate()
  const { locations, locationIds } = useScope()
  const person = session?.person

  // Real locations only — no fabricated fallback names. Empty until scope loads.
  const [locId, setLocId] = useState(null)
  useEffect(() => {
    if (!locations?.length) { setLocId(null); return }
    if (!locations.some(l => l.id === locId)) setLocId(locations[0].id)
  }, [locations]) // eslint-disable-line
  const locName = useMemo(() => locations?.find(l => l.id === locId)?.name || '', [locations, locId])

  const [anchor, setAnchor] = useState(() => new Date())
  const weekStart = useMemo(() => mondayOf(anchor), [anchor])
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => { const x = new Date(weekStart); x.setDate(weekStart.getDate() + i); return x }), [weekStart])
  const wsISO = iso(weekStart)

  const [roster, setRoster] = useState([])
  const [avail, setAvail] = useState({})        // person_id -> availability_json
  const [sched, setSched] = useState({})        // { dayIdx: { AM:[{id,personId,name,role,kh,zone}], PM:[...] } }
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState(null)
  const [busy, setBusy] = useState(false)       // a write is in flight
  const [picker, setPicker] = useState(null)    // { dayIdx, shift }
  const [q, setQ] = useState('')
  const [toast, setToast] = useState(null)
  const [zoneSel, setZoneSel] = useState('Floor')  // zone applied to new assignments
  const showToast = (m) => { setToast(m); setTimeout(() => setToast(null), 2400) }

  // Load roster + availability once per scope
  useEffect(() => {
    if (!locationIds?.length) { setRoster([]); setAvail({}); return }
    sb.rpc('get_roster', { p_node_ids: locationIds, p_actor: person?.id || null }).then(({ data }) => {
      const seen = new Set()
      setRoster((Array.isArray(data) ? data : []).filter(p => p.id && !seen.has(p.id) && seen.add(p.id)).map(p => ({ id: p.id, name: p.full_name, role: p.role_name || '', kh: isKH(p.role_name), loc: p.node_name || '' })))
    }).catch(() => setRoster([]))
    sb.rpc('get_team_availability', { p_node_ids: locationIds }).then(({ data }) => {
      const m = {}; (Array.isArray(data) ? data : []).forEach(r => { m[r.person_id] = r.availability_json || {} }); setAvail(m)
    }).catch(() => setAvail({}))
  }, [JSON.stringify(locationIds), person?.id])

  // Load the REAL published week for the selected location from the backend.
  const loadSchedule = useCallback(async () => {
    if (!locId) { setSched({}); return }
    setLoading(true); setErr(null)
    try {
      const { data, error } = await sb.rpc('vsb_get_schedule', { p_node_ids: [locId], p_week_start: wsISO, p_actor: person?.id || null })
      if (error) throw error
      const map = {}
      ;(Array.isArray(data) ? data : []).forEach(r => {
        const di = days.findIndex(d => sameDay(d, new Date(r.shift_date + 'T00:00:00')))
        if (di === -1) return
        const sh = (r.shift_type || '').toUpperCase() === 'PM' ? 'PM' : 'AM'
        map[di] = map[di] || { AM: [], PM: [] }
        map[di][sh].push({
          id: r.shift_id, personId: r.person_id, name: r.full_name || 'Unknown',
          role: r.role_name || '', kh: r.keyholder === true || isKH(r.role_name), zone: r.zone || '',
        })
      })
      setSched(map)
    } catch (e) {
      setErr(e?.message || 'Could not load the schedule.'); setSched({})
    } finally { setLoading(false) }
  }, [locId, wsISO, days, person?.id])

  useEffect(() => { loadSchedule() }, [loadSchedule])

  const cell = (di, sh) => (sched[di]?.[sh] || [])
  const assignedIds = (di, sh) => new Set(cell(di, sh).map(e => e.personId))

  // Assign → real write (vsb_assign) → re-read the week.
  const addStaff = async (di, sh, emp) => {
    if (busy || !locId) return
    if (assignedIds(di, sh).has(emp.id)) return
    setBusy(true)
    try {
      const { error } = await sb.rpc('vsb_assign', {
        p_node_id: locId, p_person_id: emp.id, p_shift_date: iso(days[di]),
        p_shift_type: sh, p_zone: zoneSel, p_actor: person?.id || null,
      })
      if (error) throw error
      await loadSchedule()
      showToast(`${emp.name} → ${SHIFTS.find(s => s.id === sh)?.label} ${dayLabel(days[di])}`)
    } catch (e) {
      showToast(`Not saved — ${e?.message || 'assign failed'}`)
    } finally { setBusy(false) }
  }

  // Remove → real write (vsb_remove by shift id) → re-read the week.
  const removeStaff = async (entry) => {
    if (busy || !entry?.id) return
    setBusy(true)
    try {
      const { error } = await sb.rpc('vsb_remove', { p_shift_id: entry.id, p_actor: person?.id || null })
      if (error) throw error
      await loadSchedule()
    } catch (e) {
      showToast(`Not removed — ${e?.message || 'remove failed'}`)
    } finally { setBusy(false) }
  }

  // Availability read (best-effort): true = marked available, false = marked off, null = unknown.
  const availFor = (emp, di, sh) => {
    const a = avail[emp.id]; if (!a) return null
    const dow = days[di].getDay()
    try {
      const dayKey = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][dow]
      const shifts = a.shifts || a
      if (shifts && typeof shifts === 'object') {
        const v = shifts[dayKey] ?? shifts[dow] ?? shifts[days[di].toLocaleDateString('en-US', { weekday: 'long' })]
        if (v == null) return null
        if (Array.isArray(v)) return v.includes(sh) || v.includes(sh.toLowerCase()) || v.length > 0
        if (typeof v === 'object') return !!(v[sh] ?? v[sh.toLowerCase()])
        return !!v
      }
    } catch (_) {}
    return null
  }

  // Available pool for the picker cell: sort available-first, keyholders flagged; exclude already-assigned.
  const pool = useMemo(() => {
    if (!picker) return []
    const { dayIdx, shift } = picker
    const has = assignedIds(dayIdx, shift)
    const rows = roster.filter(e => !has.has(e.id)).map(e => ({ ...e, av: availFor(e, dayIdx, shift) }))
    const ql = q.trim().toLowerCase()
    const filtered = ql ? rows.filter(e => e.name.toLowerCase().includes(ql) || (e.role || '').toLowerCase().includes(ql)) : rows
    return filtered.sort((a, b) => (b.av === true) - (a.av === true) || (b.kh - a.kh) || a.name.localeCompare(b.name))
  }, [picker, roster, sched, avail, q]) // eslint-disable-line

  const s = { color: 'var(--t-text)', fontSize: 13 }
  const btn = { padding: '6px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer', background: 'var(--t-surface)', color: 'var(--t-text-muted)', border: '1px solid var(--t-line)' }

  return (
    <div style={s}>
      {/* controls */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-.3px' }}>Schedule Builder</div>
          <div style={{ fontSize: 12, color: 'var(--t-text-muted)', marginTop: 2 }}>
            Click a slot to assign from available staff · {busy ? 'saving…' : loading ? 'loading…' : 'changes save instantly'}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <select value={locId || ''} onChange={e => setLocId(e.target.value)} disabled={!locations?.length} style={{ ...btn, cursor: 'pointer', color: 'var(--t-text)' }}>
            {!locations?.length && <option value="">No locations</option>}
            {(locations || []).map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
          <button onClick={() => setAnchor(a => { const x = new Date(a); x.setDate(x.getDate() - 7); return x })} style={btn}>‹ Prev</button>
          <button onClick={() => setAnchor(new Date())} style={{ ...btn, fontWeight: 700 }}>This week</button>
          <button onClick={() => setAnchor(a => { const x = new Date(a); x.setDate(x.getDate() + 7); return x })} style={btn}>Next ›</button>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--t-accent)', marginLeft: 4 }}>Week of {weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
          <button onClick={loadSchedule} disabled={busy || loading} style={{ ...btn, background: 'var(--t-accent)', color: '#04121a', border: 'none', fontWeight: 700 }}>↻ Refresh</button>
        </div>
      </div>

      {err && <div style={{ padding: '10px 14px', marginBottom: 12, background: 'rgba(255,59,48,0.08)', border: '1px solid var(--t-danger)', color: 'var(--t-danger)', fontSize: 12, fontWeight: 600 }}>{err}</div>}

      {!locations?.length ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--t-text-faint)', border: '1px solid var(--t-line)' }}>No locations in your scope. Nothing to schedule.</div>
      ) : (
      <>
      {/* grid */}
      <div style={{ overflowX: 'auto', border: '1px solid var(--t-line)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 900 }}>
          <thead>
            <tr style={{ background: 'var(--t-surface-2)' }}>
              <th style={{ ...th, minWidth: 70, position: 'sticky', left: 0, background: 'var(--t-surface-2)' }}>Shift</th>
              {days.map((d, i) => (
                <th key={i} style={{ ...th, background: sameDay(d, new Date()) ? 'rgba(0,229,255,0.1)' : undefined }}>
                  {dayLabel(d)}<br /><span style={{ fontWeight: 500, color: 'var(--t-text-muted)' }}>{dayNum(d)}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {SHIFTS.map(sh => (
              <tr key={sh.id}>
                <td style={{ ...td, fontWeight: 800, color: sh.color, verticalAlign: 'top', position: 'sticky', left: 0, background: 'var(--t-bg)' }}>{sh.label}<div style={{ fontSize: 9, color: 'var(--t-text-faint)', fontWeight: 500 }}>{sh.hours}</div></td>
                {days.map((d, di) => {
                  const list = cell(di, sh.id)
                  const khCount = list.filter(e => e.kh).length
                  const need = REQ[sh.id]
                  const short = list.length < need.staff || khCount < need.keys
                  return (
                    <td key={di} style={{ ...td, verticalAlign: 'top', minWidth: 120, background: short ? 'rgba(255,59,48,0.05)' : undefined }}>
                      {list.map((e, k) => (
                        <div key={e.id || (e.name + k)} style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 3 }}>
                          <span style={{ fontSize: 8, fontWeight: 800, padding: '0 3px', borderRadius: 2, color: posClr(e.kh), border: `1px solid ${posClr(e.kh)}` }}>{e.kh ? 'KH' : 'A'}</span>
                          <span style={{ fontSize: 11, flex: 1, color: posClr(e.kh), fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.name}</span>
                          {e.zone && <span style={{ fontSize: 8, color: 'var(--t-text-faint)', border: '1px solid var(--t-line)', padding: '0 2px' }}>{e.zone}</span>}
                          <button onClick={() => removeStaff(e)} disabled={busy} title="Remove" style={{ background: 'none', border: 'none', color: 'var(--t-text-faint)', cursor: 'pointer', fontSize: 11 }}>✕</button>
                        </div>
                      ))}
                      <button onClick={() => { setPicker({ dayIdx: di, shift: sh.id }); setQ('') }} style={{ marginTop: 2, width: '100%', fontSize: 10, fontWeight: 700, padding: '3px 0', cursor: 'pointer', background: 'transparent', color: short ? 'var(--t-danger)' : 'var(--t-accent)', border: `1px dashed ${short ? 'var(--t-danger)' : 'var(--t-line)'}` }}>
                        {short ? `+ NEED ${Math.max(0, need.staff - list.length)} / ${Math.max(0, need.keys - khCount)}KH` : '+ Assign'}
                      </button>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ fontSize: 11, color: 'var(--t-text-faint)', marginTop: 8 }}>Target per shift: {REQ.AM.staff} staff incl. {REQ.AM.keys} key holders · red = under-staffed · <b style={{ color: 'var(--t-success)' }}>KH</b> key holder · <b style={{ color: '#3d8bff' }}>A</b> associate · zone shown per assignment</div>
      </>
      )}

      {/* picker drawer */}
      {picker && (
        <div onClick={() => setPicker(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9998, display: 'flex', justifyContent: 'flex-end' }}>
          <div onClick={e => e.stopPropagation()} style={{ width: 'min(400px,94vw)', height: '100%', background: 'var(--t-bg)', borderLeft: '1px solid var(--t-line)', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--t-line)', background: 'var(--t-surface)' }}>
              <div style={{ fontSize: 15, fontWeight: 800 }}>Assign — {SHIFTS.find(s => s.id === picker.shift)?.label} · {dayLabel(days[picker.dayIdx])} {dayNum(days[picker.dayIdx])}</div>
              <div style={{ fontSize: 12, color: 'var(--t-text-muted)', marginTop: 2 }}>{locName} · available staff first</div>
              <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search staff…" style={{ marginTop: 8, width: '100%', boxSizing: 'border-box', background: 'var(--t-surface-2)', border: '1px solid var(--t-line)', color: 'var(--t-text)', padding: '7px 10px', fontSize: 12, outline: 'none' }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--t-text-muted)', textTransform: 'uppercase', letterSpacing: '.06em' }}>Zone</span>
                <select value={zoneSel} onChange={e => setZoneSel(e.target.value)} style={{ flex: 1, background: 'var(--t-surface-2)', border: '1px solid var(--t-line)', color: 'var(--t-text)', padding: '6px 8px', fontSize: 12 }}>
                  {ZONES.map(z => <option key={z} value={z}>{z}</option>)}
                </select>
                <span style={{ fontSize: 9, color: 'var(--t-text-faint)' }}>applied on add</span>
              </div>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: 10 }}>
              {pool.length === 0 && <div style={{ padding: 20, textAlign: 'center', color: 'var(--t-text-faint)' }}>No staff match.</div>}
              {pool.map(e => (
                <div key={e.id} onClick={() => addStaff(picker.dayIdx, picker.shift, e)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 10px', marginBottom: 4, cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.6 : 1, background: 'var(--t-surface)', border: '1px solid var(--t-line)' }}>
                  <span style={{ fontSize: 8, fontWeight: 800, padding: '1px 4px', borderRadius: 2, color: posClr(e.kh), border: `1px solid ${posClr(e.kh)}` }}>{e.kh ? 'KH' : 'A'}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: posClr(e.kh) }}>{e.name}</div>
                    <div style={{ fontSize: 10, color: 'var(--t-text-muted)' }}>{e.role || 'Staff'}{e.loc && e.loc !== locName ? ` · ${e.loc}` : ''}</div>
                  </div>
                  <span style={{ fontSize: 10, fontWeight: 700, color: e.av === true ? 'var(--t-success)' : e.av === false ? 'var(--t-danger)' : 'var(--t-text-faint)' }}>{e.av === true ? '✓ available' : e.av === false ? '✗ off' : '— unset'}</span>
                  <span style={{ color: 'var(--t-accent)', fontWeight: 800 }}>+</span>
                </div>
              ))}
            </div>
            <div style={{ padding: 12, borderTop: '1px solid var(--t-line)', display: 'flex', gap: 8 }}>
              <button onClick={() => nav('/availability')} style={{ ...btn, flex: 1 }}>View full availability →</button>
              <button onClick={() => setPicker(null)} style={{ ...btn, background: 'var(--t-accent)', color: '#04121a', border: 'none', fontWeight: 700 }}>Done</button>
            </div>
          </div>
        </div>
      )}

      {toast && <div style={{ position: 'fixed', bottom: 24, right: 24, background: 'var(--t-success)', color: '#04121a', padding: '10px 18px', fontWeight: 700, fontSize: 13, zIndex: 9999, boxShadow: '0 4px 20px rgba(0,0,0,0.4)' }}>{toast}</div>}
    </div>
  )
}

const th = { textAlign: 'center', padding: '9px 8px', fontSize: 11, fontWeight: 800, color: 'var(--t-text)', borderBottom: '1px solid var(--t-line)', borderRight: '1px solid var(--t-line)' }
const td = { padding: '8px 8px', borderBottom: '1px solid var(--t-line)', borderRight: '1px solid var(--t-line)' }
