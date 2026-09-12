// ScheduleCenter.jsx — Twisted Growers Schedule Command Center.
// Enterprise visual scheduling: Day / Week / Month calendar views with date,
// location, position, and employee filters; click any shift cell to assign from
// a searchable (name/ID/location/availability) employee dropdown BY POSITION;
// min-required-per-shift coverage warnings ("NO KEY HOLDER"); and a full coverage
// request flow — in-app + text, approve/decline with reason, cross-location,
// on-call, and "blast all" for last-minute call-outs. Everything drill-downable.
import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { logAudit } from '../lib/audit.js'
import { useAuth } from '../lib/auth.jsx'
import { useScope } from '../lib/scope.jsx'
import { sb } from '../lib/supabase'

const DAY_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const DAY_ABBR = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const SHIFTS = [
  { id: 'AM', label: 'AM', hours: '9:00a–5:00p' },
  { id: 'PM', label: 'PM', hours: '1:00p–9:00p' },
  { id: 'EVE', label: 'EVE', hours: '4:00p–Close' },
]
const EXEC_RX = /admin|owner|coo|ceo|cfo|president|chief|hr|manager|store manager/i
const KH_RX = /key|lead|manager|supervisor/i

// Fallback coverage minimums used only until a manager saves real per-store
// targets (get_coverage_targets / set_coverage_target). Not data — a default.
const DEFAULT_MINREQ = { AM: { KH: 1, ASSOC: 2 }, PM: { KH: 1, ASSOC: 2 }, EVE: { KH: 1, ASSOC: 1 } }

// Slot → real clock times sent to schedule_assign. Reads bucket by start_time.
const SLOT_TIMES = { AM: { start: '09:00', end: '17:00' }, PM: { start: '13:00', end: '21:00' }, EVE: { start: '16:00', end: null } }
function slotOf(t) { const h = parseInt(String(t || '09:00').slice(0, 2), 10); return (isNaN(h) || h < 13) ? 'AM' : h < 16 ? 'PM' : 'EVE' }

// ── date helpers ──────────────────────────────────────────────────────
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
function startOfWeek(d) { const x = new Date(d); const day = (x.getDay() + 6) % 7; x.setDate(x.getDate() - day); x.setHours(0, 0, 0, 0); return x } // Monday
function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x }
function weekDates(anchor) { const s = startOfWeek(anchor); return Array.from({ length: 7 }, (_, i) => addDays(s, i)) }
function sameDay(a, b) { return iso(a) === iso(b) }
function posOf(role) { return KH_RX.test(role || '') ? 'KH' : 'ASSOC' }
function posBadge(pos) { return pos === 'KH' ? 'KH' : 'ASSOC' }
// Key Holders = GREEN, Associates = BLUE
function posColor(pos) { return pos === 'KH' ? 'var(--t-success)' : '#3d8bff' }
// zones assigned at schedule-creation time
const ZONES = ['Floor', 'Register', 'Fitting', 'Stock', 'Manager', 'Close']

// availability_json shape: { Monday:{AM,PM,EVE}, ... }
function availableFor(availMap, pid, date, shift) {
  const dn = DAY_FULL[date.getDay()]
  return !!availMap?.[pid]?.[dn]?.[shift]
}

// weekly shift load across ALL locations (overtime proxy: ~8h/shift, 5+ ≈ OT).
// Scheduled rows carry no person id (get_week_schedule returns names), so load
// is counted by employee name — unique within this roster.
function weekLoad(sched, name, date) {
  const wk = iso(startOfWeek(date)); let n = 0
  Object.values(sched || {}).forEach(locObj => {
    const w = locObj?.[wk]; if (!w) return
    Object.values(w).forEach(dayObj => Object.values(dayObj || {}).forEach(list => { if ((list || []).some(e => e.name === name) && name) n++ }))
  })
  return n
}
// week-start (Monday) dates covering the 6-row month calendar grid
function monthWeekStarts(anchor) { const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1); const gs = startOfWeek(first); return Array.from({ length: 6 }, (_, w) => addDays(gs, w * 7)) }

// AI candidate ranking — prefers available, low current load (avoids OT),
// same store, and the position the shift actually needs. Returns sorted list
// with a human-readable reason for each pick (humans still approve).
function rankCandidates(roster, avail, sched, date, shift, loc, needPos) {
  return roster.map(r => {
    const isAvail = availableFor(avail, r.id, date, shift)
    const load = weekLoad(sched, r.name, date)
    const otRisk = load >= 5
    let score = 0
    if (isAvail) score += 100
    score -= load * 8
    if (r.loc === loc) score += 15
    if (needPos && r.pos === needPos) score += 25
    if (otRisk) score -= 60
    const reasons = []
    reasons.push(isAvail ? 'available' : 'not marked avail')
    reasons.push(`${load} shift${load === 1 ? '' : 's'} this wk`)
    reasons.push(r.loc === loc ? 'same store' : r.loc)
    if (needPos && r.pos === needPos) reasons.push(`is ${needPos}`)
    if (otRisk) reasons.push('⚠ near OT')
    return { ...r, isAvail, load, otRisk, score, reason: reasons.join(' · ') }
  }).sort((a, b) => b.score - a.score)
}

const st = {
  wrap: { padding: '18px 22px', color: 'var(--t-text)', minHeight: '100vh', background: 'var(--t-bg)' },
  h1: { fontSize: 19, fontWeight: 800, letterSpacing: '.04em', margin: 0, textTransform: 'uppercase' },
  sub: { fontSize: 11, color: 'var(--t-text-muted)', marginTop: 2 },
  bar: { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', padding: '12px 0', marginBottom: 6 },
  seg: (a) => ({ padding: '7px 13px', fontSize: 12, fontWeight: 700, cursor: 'pointer', border: '1px solid var(--t-line)', background: a ? 'var(--t-accent)' : 'var(--t-surface)', color: a ? '#fff' : 'var(--t-text-muted)' }),
  sel: { fontSize: 12, padding: '7px 9px', background: 'var(--t-surface)', border: '1px solid var(--t-line)', color: 'var(--t-text)', borderRadius: 0, outline: 'none' },
  inp: { fontSize: 12, padding: '8px 10px', background: 'var(--t-surface)', border: '1px solid var(--t-line)', color: 'var(--t-text)', borderRadius: 0, outline: 'none', width: '100%' },
  btn: { fontSize: 11, fontWeight: 700, padding: '7px 13px', background: 'var(--t-accent)', border: 'none', color: '#fff', borderRadius: 0, cursor: 'pointer', letterSpacing: '.03em' },
  ghost: { fontSize: 11, fontWeight: 600, padding: '6px 11px', background: 'var(--t-surface)', border: '1px solid var(--t-line)', color: 'var(--t-text-muted)', borderRadius: 0, cursor: 'pointer' },
  label: { fontSize: 10, fontWeight: 700, letterSpacing: '.06em', color: 'var(--t-text-muted)', textTransform: 'uppercase' },
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.74)', zIndex: 9998, display: 'flex', justifyContent: 'flex-end' },
  // opaque backing for floating panels/lists so page content never bleeds through
  solid: { background: 'var(--t-bg)', boxShadow: '0 12px 40px rgba(0,0,0,.6)' },
  rowName: { flexGrow: 1, flexShrink: 1, flexBasis: 'auto', minWidth: 40, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  // the app has a global `input{width:100%}` — checkboxes must be pinned small
  cb: { width: 16, height: 16, minWidth: 16, flexShrink: 0, margin: 0, cursor: 'pointer' },
  drawer: { width: 'min(460px, 96vw)', height: '100%', background: 'var(--t-bg)', borderLeft: '1px solid var(--t-line)', overflowY: 'auto', display: 'flex', flexDirection: 'column' },
  drawerHead: { padding: '14px 18px', borderBottom: '1px solid var(--t-line)', background: 'var(--t-surface-2)', position: 'sticky', top: 0, zIndex: 2 },
  modal: { background: 'var(--t-bg)', border: '1px solid var(--t-line)', width: 'min(560px, 96vw)', maxHeight: '86vh', overflowY: 'auto' },
  posBadge: (pos) => ({ fontSize: 8, fontWeight: 800, padding: '1px 4px', letterSpacing: '.04em', marginRight: 5, color: posColor(pos), border: `1px solid ${posColor(pos)}` }),
  chip: (pos) => ({ display: 'flex', alignItems: 'center', border: `1px solid ${posColor(pos)}`, padding: '4px 6px', marginBottom: 4, fontSize: 11, cursor: 'default', justifyContent: 'space-between' }),
}

export default function ScheduleCenter() {
  const { session } = useAuth()
  const { locations, locationIds, activeLocation } = useScope()
  const routerLoc = useLocation()
  const person = session?.person || {}
  const canEdit = EXEC_RX.test(person.role_name || '')

  // Real store list + name↔id maps, straight from the signed-in scope (no hardcoded list).
  const LOC_LIST = useMemo(() => (locations || []).map(l => l.name), [locations])
  const nodeIdByName = useMemo(() => Object.fromEntries((locations || []).map(l => [l.name, l.id])), [locations])

  const [view, setView] = useState('week')          // day | week | month
  const [anchor, setAnchor] = useState(() => new Date())
  const [loc, setLoc] = useState('')
  const [posFilter, setPosFilter] = useState('All')  // All | KH | ASSOC
  const [empFilter, setEmpFilter] = useState('')     // person id
  const [availOnly, setAvailOnly] = useState(false)

  const [roster, setRoster] = useState([])           // [{id,name,role,pos,kh,loc}]
  const [avail, setAvail] = useState({})
  const [sched, setSched] = useState({})             // [locName][weekKey][dayIdx][slot] = [{shift_id,id,name,pos,zone}]
  const [minReqByNode, setMinReqByNode] = useState({}) // nodeId -> { AM:{KH,ASSOC}, PM:{...}, EVE:{...} }
  const [coverage, setCoverage] = useState([])       // sched_coverage_ask rows (get_coverage_asks)
  const [oncall, setOncall] = useState({})           // [locName][isoDate] = [{id,name,pos}]

  const [assignCtx, setAssignCtx] = useState(null)   // { date, shift }
  const [coverCtx, setCoverCtx] = useState(null)     // { date, shift, need }
  const [showReqs, setShowReqs] = useState(false)
  const [showMinReq, setShowMinReq] = useState(false)
  const [showSolver, setShowSolver] = useState(false)
  const [fillMsg, setFillMsg] = useState('')

  const effRoster = roster
  const minReqFor = useCallback((locName) => minReqByNode[nodeIdByName[locName]] || DEFAULT_MINREQ, [minReqByNode, nodeIdByName])

  // ── real roster + availability ──────────────────────────────────────
  useEffect(() => {
    if (!locationIds?.length) { setRoster([]); setAvail({}); return }
    sb.rpc('get_roster', { p_node_ids: locationIds, p_actor: person.id || null }).then(({ data }) => {
      const seen = new Set()
      const rows = (Array.isArray(data) ? data : []).filter(p => p.id && !seen.has(p.id) && seen.add(p.id))
        .map(p => ({ id: p.id, name: p.full_name || 'Unknown', role: p.role_name || '', pos: posOf(p.role_name), kh: KH_RX.test(p.role_name || ''), loc: p.node_name || '' }))
      setRoster(rows)
    }).catch(() => setRoster([]))
    sb.rpc('get_team_availability', { p_node_ids: locationIds }).then(({ data }) => {
      const m = {}; (Array.isArray(data) ? data : []).forEach(r => { m[r.person_id] = r.availability_json || {} }); setAvail(m)
    }).catch(() => setAvail({}))
  }, [JSON.stringify(locationIds), person.id])

  // ── real schedule grid: get_week_schedule for every visible week ────
  const loadSchedule = useCallback(async () => {
    if (!locationIds?.length) { setSched({}); return }
    const starts = view === 'month' ? monthWeekStarts(anchor) : [startOfWeek(anchor)]
    const results = await Promise.all(starts.map(ws =>
      sb.rpc('get_week_schedule', { p_node_ids: locationIds, p_week_start: iso(ws) })
        .then(r => ({ wk: iso(ws), data: r.data })).catch(() => ({ wk: iso(ws), data: [] }))))
    setSched(prev => {
      const next = { ...prev }
      results.forEach(({ wk, data }) => {
        // clear this week across every store first, so unassigns/moves reflect
        LOC_LIST.forEach(ln => { if (next[ln]?.[wk]) { next[ln] = { ...next[ln] }; delete next[ln][wk] } })
        ;(Array.isArray(data) ? data : []).forEach(r => {
          const ln = r.node_name; if (!ln) return
          const d = new Date(String(r.shift_date).slice(0, 10) + 'T00:00:00'); const di = d.getDay(); const slot = slotOf(r.start_time)
          next[ln] = { ...(next[ln] || {}) }
          next[ln][wk] = { ...(next[ln][wk] || {}) }
          next[ln][wk][di] = { ...(next[ln][wk][di] || {}) }
          next[ln][wk][di][slot] = [...(next[ln][wk][di][slot] || []), {
            id: r.shift_id, shift_id: r.shift_id, name: r.full_name || 'Unknown',
            pos: r.keyholder_eligible ? 'KH' : 'ASSOC', zone: r.zone || 'Floor', status: r.status || null,
          }]
        })
      })
      return next
    })
  }, [locationIds, view, anchor, LOC_LIST])
  useEffect(() => { loadSchedule() }, [loadSchedule])

  // ── real coverage minimums (per store, per slot) ────────────────────
  const loadTargets = useCallback(() => {
    if (!locationIds?.length) { setMinReqByNode({}); return }
    sb.rpc('get_coverage_targets', { p_node_ids: locationIds }).then(({ data }) => {
      const m = {}; (Array.isArray(data) ? data : []).forEach(t => {
        m[t.node_id] = m[t.node_id] || { AM: { KH: 0, ASSOC: 0 }, PM: { KH: 0, ASSOC: 0 }, EVE: { KH: 0, ASSOC: 0 } }
        m[t.node_id][t.slot] = { KH: t.kh_required, ASSOC: t.assoc_required }
      }); setMinReqByNode(m)
    }).catch(() => setMinReqByNode({}))
  }, [locationIds])
  useEffect(() => { loadTargets() }, [loadTargets])

  // ── real coverage requests (multi-recipient asks) ───────────────────
  const loadCoverage = useCallback(() => {
    if (!locationIds?.length) { setCoverage([]); return }
    sb.rpc('get_coverage_asks', { p_node_ids: locationIds })
      .then(({ data }) => setCoverage(Array.isArray(data) ? data : [])).catch(() => setCoverage([]))
  }, [locationIds])
  useEffect(() => { loadCoverage() }, [loadCoverage])

  // ── real on-call roster (per store, per date) ───────────────────────
  const loadOnCall = useCallback(() => {
    if (!locationIds?.length) { setOncall({}); return }
    const starts = view === 'month' ? monthWeekStarts(anchor) : [startOfWeek(anchor)]
    const from = iso(starts[0]); const to = iso(addDays(starts[starts.length - 1], 6))
    sb.rpc('get_sched_on_call', { p_node_ids: locationIds, p_from: from, p_to: to }).then(({ data }) => {
      const m = {}; (Array.isArray(data) ? data : []).forEach(r => {
        const ln = r.node_name; if (!ln) return
        const dk = String(r.on_date).slice(0, 10)
        m[ln] = m[ln] || {}; m[ln][dk] = m[ln][dk] || []
        m[ln][dk].push({ id: r.person_id, name: r.full_name || 'Unknown', pos: posOf(r.role_name) })
      }); setOncall(m)
    }).catch(() => setOncall({}))
  }, [locationIds, view, anchor])
  useEffect(() => { loadOnCall() }, [loadOnCall])

  // deep-link: a call-out elsewhere (e.g. Coverage Monitor) can hand us a shift
  // and open the coverage-request flow directly. state: {date, shift, location, action}
  const deepRef = useRef(false)
  useEffect(() => {
    const s = routerLoc.state
    if (!s || deepRef.current) return
    deepRef.current = true
    if (s.location) setLoc(s.location)
    const d = s.date ? new Date(String(s.date).length <= 10 ? s.date + 'T00:00:00' : s.date) : new Date()
    if (!isNaN(d)) setAnchor(d)
    const shift = SHIFTS.some(x => x.id === s.shift) ? s.shift : 'AM'
    // open after paint so loc/anchor state settles. 'edit' (or no action) just
    // scopes the editable grid to the incoming location/date — no modal.
    setTimeout(() => {
      if (s.action === 'assign') setAssignCtx({ date: d, shift })
      else if (s.action === 'coverage') setCoverCtx({ date: d, shift })
      // else 'edit'/none → land directly on the editable schedule, no popup
    }, 60)
  }, [routerLoc.state]) // eslint-disable-line react-hooks/exhaustive-deps

  // Keep the local store selector in step with the real scope: follow the global
  // switcher when it narrows to one store, otherwise default to the first store.
  useEffect(() => {
    if (activeLocation?.name) { setLoc(activeLocation.name); return }
    setLoc(prev => (prev && LOC_LIST.includes(prev)) ? prev : (LOC_LIST[0] || ''))
  }, [activeLocation, LOC_LIST])

  const getCell = useCallback((date, shift) => (sched[loc]?.[iso(startOfWeek(date))]?.[date.getDay()]?.[shift]) || [], [sched, loc])
  // location-aware cell + status (for the cross-location Coverage Finder)
  const getCellAt = useCallback((location, date, shift) => (sched[location]?.[iso(startOfWeek(date))]?.[date.getDay()]?.[shift]) || [], [sched])
  const statusAt = useCallback((location, date, shift) => {
    const list = getCellAt(location, date, shift)
    const req = minReqFor(location)[shift] || { KH: 0, ASSOC: 0 }
    const kh = list.filter(e => e.pos === 'KH').length
    const assoc = list.filter(e => e.pos === 'ASSOC').length
    const noKH = req.KH > 0 && kh < req.KH
    const short = noKH || assoc < req.ASSOC
    return { list, kh, assoc, req, noKH, short, needKH: Math.max(0, req.KH - kh), needAssoc: Math.max(0, req.ASSOC - assoc) }
  }, [getCellAt, minReqFor])

  // scan the visible week across ALL locations for understaffed shifts
  const weekGaps = useMemo(() => {
    const days = weekDates(anchor); const gaps = []
    LOC_LIST.forEach(location => days.forEach(d => SHIFTS.forEach(sh => {
      const s = statusAt(location, d, sh.id)
      if (s.short) gaps.push({ location, date: d, shift: sh.id, ...s })
    })))
    // soonest + worst (no key holder) first
    return gaps.sort((a, b) => (b.noKH - a.noKH) || (a.date - b.date))
  }, [anchor, statusAt, LOC_LIST])

  // ── real assign: schedule_assign writes public.shifts, then refetch ──
  const assign = useCallback(async (date, shift, emp, zone = 'Floor') => {
    const nodeId = nodeIdByName[loc]; if (!nodeId) return
    if (getCell(date, shift).some(e => e.name === emp.name)) return  // already on this shift
    const t = SLOT_TIMES[shift] || {}
    const { error } = await sb.rpc('schedule_assign', {
      p_actor: person.id || null, p_node_id: nodeId, p_person_id: emp.id, p_date: iso(date),
      p_slot: shift, p_start: t.start || null, p_end: t.end || null, p_ends_at_close: shift === 'EVE',
      p_zones: zone ? [zone] : null, p_break_start: null, p_break_end: null,
      p_requires_key: emp.pos === 'KH', p_schedule_id: null,
    })
    if (error) return
    logAudit('Shift Assign', { target: emp.name, node: loc, meta: { date: iso(date), shift } })
    await loadSchedule()
  }, [getCell, loc, nodeIdByName, person.id, loadSchedule])

  const unassign = useCallback(async (date, shift, shiftId) => {
    const { error } = await sb.rpc('schedule_center_unassign', { p_shift_id: shiftId, p_actor: person.id || null })
    if (!error) { logAudit('Shift Unassign', { node: loc, meta: { date: iso(date), shift } }); await loadSchedule() }
  }, [person.id, loc, loadSchedule])

  // location-aware assign (Coverage Finder assigns into other stores)
  const assignAt = useCallback(async (location, date, shift, emp) => {
    const nodeId = nodeIdByName[location]; if (!nodeId) return
    const t = SLOT_TIMES[shift] || {}
    const { error } = await sb.rpc('schedule_assign', {
      p_actor: person.id || null, p_node_id: nodeId, p_person_id: emp.id, p_date: iso(date),
      p_slot: shift, p_start: t.start || null, p_end: t.end || null, p_ends_at_close: shift === 'EVE',
      p_zones: ['Floor'], p_break_start: null, p_break_end: null,
      p_requires_key: (emp.pos || posOf(emp.role)) === 'KH', p_schedule_id: null,
    })
    if (!error) await loadSchedule()
  }, [nodeIdByName, person.id, loadSchedule])

  // ── greedy optimizer: fill every understaffed shift this week with the best
  // available, right-position, NON-OT staff — each pick is a real schedule_assign ──
  const autoFillWeek = useCallback(async () => {
    const nodeId = nodeIdByName[loc]; if (!nodeId) return
    const days = weekDates(anchor); const wk = iso(startOfWeek(anchor))
    const req = minReqFor(loc)
    const working = JSON.parse(JSON.stringify(sched || {}))  // local projection to avoid double-picking
    const picks = []
    days.forEach(d => {
      const di = d.getDay()
      SHIFTS.forEach(sh => {
        const cur = [...((working[loc]?.[wk]?.[di]?.[sh.id]) || [])]
        const need = req[sh.id] || { KH: 0, ASSOC: 0 }
        const takenNames = new Set(cur.map(e => e.name))
        ;['KH', 'ASSOC'].forEach(pos => {
          const gap = Math.max(0, (need[pos] || 0) - cur.filter(e => e.pos === pos).length)
          for (let n = 0; n < gap; n++) {
            const pool = rankCandidates(effRoster.filter(r => r.pos === pos && !takenNames.has(r.name)), avail, working, d, sh.id, loc, pos).filter(r => !r.otRisk && r.score > -60)
            const pick = pool[0]; if (!pick) break
            cur.push({ id: pick.id, name: pick.name, pos: pick.pos, zone: 'Floor' })
            takenNames.add(pick.name)
            picks.push({ date: d, shift: sh.id, emp: pick })
            working[loc] = working[loc] || {}; working[loc][wk] = working[loc][wk] || {}
            working[loc][wk][di] = working[loc][wk][di] || {}; working[loc][wk][di][sh.id] = cur
          }
        })
      })
    })
    if (!picks.length) { setFillMsg('All shifts already meet the minimum — nothing to fill.'); setTimeout(() => setFillMsg(''), 5000); return }
    for (const p of picks) {
      const t = SLOT_TIMES[p.shift] || {}
      await sb.rpc('schedule_assign', {
        p_actor: person.id || null, p_node_id: nodeId, p_person_id: p.emp.id, p_date: iso(p.date),
        p_slot: p.shift, p_start: t.start || null, p_end: t.end || null, p_ends_at_close: p.shift === 'EVE',
        p_zones: ['Floor'], p_break_start: null, p_break_end: null, p_requires_key: p.emp.pos === 'KH', p_schedule_id: null,
      })
    }
    logAudit('Schedule Auto-Fill', { node: loc, meta: { week: wk, filled: picks.length } })
    await loadSchedule()
    setFillMsg(`🪄 Auto-filled ${picks.length} shift slot${picks.length === 1 ? '' : 's'} — review & adjust below.`)
    setTimeout(() => setFillMsg(''), 5000)
  }, [nodeIdByName, loc, anchor, sched, minReqFor, avail, effRoster, person.id, loadSchedule])

  // coverage status for a cell vs min req
  const cellStatus = useCallback((date, shift) => {
    const list = getCell(date, shift)
    const req = minReqFor(loc)[shift] || { KH: 0, ASSOC: 0 }
    const kh = list.filter(e => e.pos === 'KH').length
    const assoc = list.filter(e => e.pos === 'ASSOC').length
    const noKH = req.KH > 0 && kh < req.KH
    const shortAssoc = assoc < req.ASSOC
    return { list, kh, assoc, req, noKH, short: noKH || shortAssoc, filled: !noKH && !shortAssoc }
  }, [getCell, minReqFor, loc])

  // ── real coverage request (create_coverage_ask), then refetch ───────
  const sendCoverage = useCallback(async (ctx, recipients, message, channel, urgency, blast) => {
    const nodeId = nodeIdByName[loc]; if (!nodeId) { setCoverCtx(null); return }
    const { error } = await sb.rpc('create_coverage_ask', {
      p_node_id: nodeId, p_date: iso(ctx.date), p_slot: ctx.shift, p_requester: person.id || null,
      p_message: message, p_channel: channel, p_urgency: urgency, p_blast: !!blast,
      p_recipient_ids: recipients.map(r => r.id),
    })
    if (!error) { logAudit('Coverage Request', { target: `${ctx.shift} · ${iso(ctx.date)}`, node: loc, meta: { recipients: recipients.length, urgency, blast: !!blast } }); await loadCoverage() }
    setCoverCtx(null)
  }, [nodeIdByName, loc, person.id, loadCoverage])

  const respondCoverage = useCallback(async (reqId, recipId, status, reason) => {
    const { error } = await sb.rpc('respond_coverage_ask', { p_ask_id: reqId, p_person_id: recipId, p_status: status, p_reason: reason || null })
    if (!error) await loadCoverage()
  }, [loadCoverage])

  // when a coverage request is accepted, record it AND assign that person to the shift
  const acceptCoverage = useCallback(async (req, recip) => {
    await sb.rpc('respond_coverage_ask', { p_ask_id: req.id, p_person_id: recip.id, p_status: 'approved', p_reason: null })
    const nodeId = nodeIdByName[req.location]
    if (nodeId) {
      const emp = effRoster.find(e => e.id === recip.id)
      const t = SLOT_TIMES[req.shift] || {}
      await sb.rpc('schedule_assign', {
        p_actor: person.id || null, p_node_id: nodeId, p_person_id: recip.id, p_date: req.date,
        p_slot: req.shift, p_start: t.start || null, p_end: t.end || null, p_ends_at_close: req.shift === 'EVE',
        p_zones: ['Floor'], p_break_start: null, p_break_end: null, p_requires_key: (emp?.pos) === 'KH', p_schedule_id: null,
      })
    }
    await loadCoverage(); await loadSchedule()
  }, [nodeIdByName, effRoster, person.id, loadCoverage, loadSchedule])

  const pendingCount = useMemo(() => coverage.reduce((n, r) => n + (r.recipients || []).filter(rc => rc.status === 'pending').length, 0), [coverage])
  // requests targeting the current user (their inbox)
  const myRequests = useMemo(() => coverage.filter(r => (r.recipients || []).some(rc => rc.id === person.id && rc.status === 'pending')), [coverage, person.id])

  const label = view === 'month'
    ? `${MONTHS[anchor.getMonth()]} ${anchor.getFullYear()}`
    : view === 'day'
      ? `${DAY_FULL[anchor.getDay()]}, ${MONTHS[anchor.getMonth()]} ${anchor.getDate()}`
      : (() => { const w = weekDates(anchor); return `${MONTHS[w[0].getMonth()].slice(0, 3)} ${w[0].getDate()} – ${MONTHS[w[6].getMonth()].slice(0, 3)} ${w[6].getDate()}` })()

  const nav = (dir) => {
    if (view === 'month') { const x = new Date(anchor); x.setMonth(x.getMonth() + dir); setAnchor(x) }
    else if (view === 'day') setAnchor(addDays(anchor, dir))
    else setAnchor(addDays(anchor, dir * 7))
  }

  return (
    <div style={st.wrap}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 style={st.h1}>Schedule Command Center</h1>
          <div style={st.sub}>Create, draft & edit schedules visually · find coverage · on-call · everything drill-downable.</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {canEdit && weekGaps.length > 0 && <button style={{ ...st.btn, background: 'var(--t-purple, #7c4dff)' }} onClick={autoFillWeek} title="Greedily fill every understaffed shift this week with the best available, non-overtime staff">🪄 Auto-fill Week</button>}
          {canEdit && <button style={{ ...st.btn, background: weekGaps.length ? 'var(--t-danger)' : 'var(--t-success)' }} onClick={() => setShowSolver(true)}>🔍 Coverage Finder{weekGaps.length ? ` (${weekGaps.length})` : ''}</button>}
          {myRequests.length > 0 && <button style={{ ...st.btn, background: 'var(--t-warn)' }} onClick={() => setShowReqs(true)}>📨 {myRequests.length} Coverage Ask{myRequests.length > 1 ? 's' : ''}</button>}
          <button style={st.ghost} onClick={() => setShowReqs(true)}>Coverage Requests{pendingCount ? ` (${pendingCount})` : ''}</button>
          {canEdit && <button style={st.ghost} onClick={() => setShowMinReq(true)}>Min / Shift</button>}
        </div>
      </div>

      {/* filter + nav bar */}
      <div style={st.bar}>
        <div style={{ display: 'flex' }}>
          {['day', 'week', 'month'].map(v => <div key={v} style={st.seg(view === v)} onClick={() => setView(v)}>{v[0].toUpperCase() + v.slice(1)}</div>)}
        </div>
        <button style={st.ghost} onClick={() => nav(-1)}>‹</button>
        <button style={st.ghost} onClick={() => setAnchor(new Date())}>Today</button>
        <button style={st.ghost} onClick={() => nav(1)}>›</button>
        <input type="date" value={iso(anchor)} onChange={e => e.target.value && setAnchor(new Date(e.target.value + 'T00:00:00'))} style={st.sel} />
        <span style={{ fontSize: 13, fontWeight: 800, minWidth: 150 }}>{label}</span>
        <span style={{ flex: 1 }} />
        <span style={st.label}>Loc</span>
        <select value={loc} onChange={e => setLoc(e.target.value)} style={st.sel}>
          {LOC_LIST.length === 0 && <option value="">No stores in scope</option>}
          {LOC_LIST.map(l => <option key={l} value={l}>{l}</option>)}
        </select>
        <span style={st.label}>Position</span>
        <select value={posFilter} onChange={e => setPosFilter(e.target.value)} style={st.sel}>
          <option value="All">All positions</option><option value="KH">Key Holders</option><option value="ASSOC">Associates</option>
        </select>
        <EmployeeDropdown roster={effRoster} value={empFilter} onChange={setEmpFilter} placeholder="All employees" />
        <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--t-text-muted)' }}>
          <input type="checkbox" checked={availOnly} onChange={e => setAvailOnly(e.target.checked)} style={st.cb} /> Available only
        </label>
      </div>

      {fillMsg && <div style={{ background: 'rgba(124,77,255,.1)', border: '1px solid var(--t-purple, #7c4dff)', padding: '9px 14px', marginBottom: 10, fontSize: 12, fontWeight: 600, color: 'var(--t-text)' }}>{fillMsg}</div>}

      {/* views */}
      {view === 'week' && <WeekGrid dates={weekDates(anchor)} loc={loc} cellStatus={cellStatus} oncall={oncall} onCellClick={(date, shift) => canEdit && setAssignCtx({ date, shift })} posFilter={posFilter} empFilter={empFilter} anchor={anchor} onOncall={canEdit ? (date) => setAssignCtx({ date, shift: '__oncall' }) : null} />}
      {view === 'day' && <DayView date={anchor} cellStatus={cellStatus} oncall={oncall} loc={loc} onCellClick={(date, shift) => canEdit && setAssignCtx({ date, shift })} posFilter={posFilter} empFilter={empFilter} />}
      {view === 'month' && <MonthView anchor={anchor} loc={loc} cellStatus={cellStatus} onDayClick={(d) => { setAnchor(d); setView('day') }} />}

      {/* assign drawer */}
      {assignCtx && assignCtx.shift !== '__oncall' && (
        <AssignDrawer ctx={assignCtx} loc={loc} roster={effRoster} avail={avail} sched={sched} status={cellStatus(assignCtx.date, assignCtx.shift)}
          onClose={() => setAssignCtx(null)}
          onAssign={(emp, zone) => assign(assignCtx.date, assignCtx.shift, emp, zone)}
          onUnassign={(id) => unassign(assignCtx.date, assignCtx.shift, id)}
          onRequestCoverage={() => { setCoverCtx({ date: assignCtx.date, shift: assignCtx.shift }); setAssignCtx(null) }}
          getCell={getCell} />
      )}
      {assignCtx && assignCtx.shift === '__oncall' && (
        <OnCallDrawer date={assignCtx.date} loc={loc} roster={effRoster} current={oncall[loc]?.[iso(assignCtx.date)] || []}
          onClose={() => setAssignCtx(null)}
          onSet={async (list) => { const nodeId = nodeIdByName[loc]; if (nodeId) { await sb.rpc('set_sched_on_call', { p_node_id: nodeId, p_date: iso(assignCtx.date), p_person_ids: list.map(x => x.id) }); logAudit('On-Call Set', { node: loc, meta: { date: iso(assignCtx.date), count: list.length } }); await loadOnCall() } }} />
      )}

      {/* coverage request modal */}
      {coverCtx && (
        <CoverageModal ctx={coverCtx} loc={loc} roster={effRoster} avail={avail} sched={sched} onClose={() => setCoverCtx(null)} onSend={sendCoverage} />
      )}

      {/* coverage requests panel */}
      {showReqs && (
        <CoverageRequestsPanel coverage={coverage} me={person} onClose={() => setShowReqs(false)}
          onRespond={respondCoverage} onAccept={acceptCoverage} />
      )}

      {/* min-req editor (per selected store) */}
      {showMinReq && <MinReqModal minReq={minReqFor(loc)} loc={loc} onClose={() => setShowMinReq(false)}
        onSave={async (m) => { const nodeId = nodeIdByName[loc]; if (!nodeId) return; for (const sh of SHIFTS) { await sb.rpc('set_coverage_target', { p_node_id: nodeId, p_slot: sh.id, p_kh: m[sh.id]?.KH ?? 0, p_assoc: m[sh.id]?.ASSOC ?? 0 }) } loadTargets() }} />}

      {/* cross-location coverage finder */}
      {showSolver && (
        <CoverageSolver gaps={weekGaps} roster={effRoster} avail={avail} sched={sched} anchor={anchor}
          onClose={() => setShowSolver(false)}
          onAssign={(g, emp) => assignAt(g.location, g.date, g.shift, emp)}
          onRequest={(g) => { setShowSolver(false); setLoc(g.location); setAnchor(g.date); setTimeout(() => setCoverCtx({ date: g.date, shift: g.shift }), 60) }} />
      )}
    </div>
  )
}

// ── cross-location Coverage Finder ────────────────────────────────────
// Scans the week for every understaffed shift across ALL locations and, for
// each gap, ranks who could fill it — favoring available, non-overtime staff,
// including people from OTHER stores. One click assigns or fires a request.
function CoverageSolver({ gaps, roster, avail, sched, onClose, onAssign, onRequest }) {
  const [assigned, setAssigned] = useState({})   // gapKey -> empId (optimistic UI)
  const gapKey = (g) => `${g.location}|${iso(g.date)}|${g.shift}`
  return (
    <div style={{ ...st.overlay, justifyContent: 'center', alignItems: 'flex-start', padding: '32px 20px' }} onClick={onClose}>
      <div style={{ ...st.modal, width: 'min(760px, 96vw)' }} onClick={e => e.stopPropagation()}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--t-line)', background: 'var(--t-surface-2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, zIndex: 2 }}>
          <div><div style={{ fontSize: 15, fontWeight: 800 }}>🔍 Coverage Finder</div><div style={{ fontSize: 11, color: 'var(--t-text-muted)' }}>{gaps.length} understaffed shift{gaps.length === 1 ? '' : 's'} this week across all locations — ranked fills below</div></div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--t-text-muted)', fontSize: 22, cursor: 'pointer' }}>×</button>
        </div>
        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {gaps.length === 0 && <div style={{ fontSize: 13, color: 'var(--t-success)', fontWeight: 700 }}>✓ Every shift this week meets its minimum. No gaps to fill.</div>}
          {gaps.map(g => {
            const needPos = g.noKH ? 'KH' : 'ASSOC'
            const picks = rankCandidates(roster.filter(r => !g.list.some(e => e.name === r.name)), avail, sched, g.date, g.shift, g.location, needPos)
              .filter(r => r.score > -60).slice(0, 3)
            const k = gapKey(g); const done = assigned[k]
            return (
              <div key={k} style={{ border: `1px solid ${g.noKH ? 'var(--t-danger)' : 'var(--t-warn)'}`, borderLeft: `3px solid ${g.noKH ? 'var(--t-danger)' : 'var(--t-warn)'}`, padding: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>{g.location} · {DAY_ABBR[g.date.getDay()]} {MONTHS[g.date.getMonth()].slice(0, 3)} {g.date.getDate()} · {g.shift}</div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: g.noKH ? 'var(--t-danger)' : 'var(--t-warn)' }}>{g.needKH ? `need ${g.needKH} Key Holder` : ''}{g.needKH && g.needAssoc ? ' · ' : ''}{g.needAssoc ? `need ${g.needAssoc} Associate` : ''}</div>
                </div>
                {done ? (
                  <div style={{ fontSize: 12, color: 'var(--t-success)', marginTop: 8, fontWeight: 700 }}>✓ Assigned {done} — gap filled</div>
                ) : (
                  <>
                    <div style={{ ...st.label, marginTop: 8, color: 'var(--t-accent)' }}>🤖 Best fills{picks.some(p => p.loc !== g.location) ? ' (incl. other stores)' : ''}</div>
                    <div style={{ marginTop: 6 }}>
                      {picks.length === 0 && <div style={{ fontSize: 11, color: 'var(--t-text-faint)' }}>No good internal fills — send a coverage request.</div>}
                      {picks.map(r => (
                        <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--t-line)' }}>
                          <div>
                            <div style={{ fontSize: 12, fontWeight: 600 }}><span style={st.posBadge(r.pos)}>{posBadge(r.pos)}</span>{r.name}{r.loc !== g.location ? <span style={{ fontSize: 9, color: 'var(--t-purple, #7c4dff)', marginLeft: 6, fontWeight: 700 }}>⇄ {r.loc}</span> : ''}</div>
                            <div style={{ fontSize: 10, color: r.otRisk ? 'var(--t-warn)' : 'var(--t-text-faint)' }}>{r.reason}</div>
                          </div>
                          <button style={{ ...st.btn, padding: '5px 11px' }} onClick={() => { onAssign(g, r); setAssigned(a => ({ ...a, [k]: r.name })) }}>Assign</button>
                        </div>
                      ))}
                    </div>
                    <button style={{ ...st.ghost, marginTop: 8, borderColor: 'var(--t-warn)', color: 'var(--t-warn)' }} onClick={() => onRequest(g)}>📣 Request coverage instead (message staff)</button>
                  </>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ── searchable employee dropdown (name / ID / location / availability) ─
function EmployeeDropdown({ roster, value, onChange, placeholder }) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [locF, setLocF] = useState('All')
  const ref = useRef(null)
  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h)
  }, [])
  const sel = roster.find(r => r.id === value)
  const shown = roster.filter(r => {
    if (locF !== 'All' && r.loc !== locF) return false
    if (!q) return true
    const s = q.toLowerCase()
    return r.name.toLowerCase().includes(s) || String(r.id).toLowerCase().includes(s)
  }).slice(0, 60)
  const locs = [...new Set(roster.map(r => r.loc).filter(Boolean))]

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button style={{ ...st.sel, cursor: 'pointer', minWidth: 150, textAlign: 'left', display: 'flex', justifyContent: 'space-between', gap: 8 }} onClick={() => setOpen(o => !o)}>
        <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sel ? sel.name : (placeholder || 'Select employee')}</span>
        <span style={{ color: 'var(--t-text-faint)' }}>▾</span>
      </button>
      {open && (
        <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: 4, width: 300, ...st.solid, border: '1px solid var(--t-line)', zIndex: 50 }}>
          <div style={{ padding: 8, display: 'flex', gap: 6, borderBottom: '1px solid var(--t-line)' }}>
            <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Search name or ID…" style={{ ...st.inp, fontSize: 11, padding: '6px 8px' }} />
            <select value={locF} onChange={e => setLocF(e.target.value)} style={{ ...st.sel, fontSize: 11, padding: '6px' }}>
              <option value="All">All loc</option>{locs.map(l => <option key={l} value={l}>{l}</option>)}
            </select>
          </div>
          <div style={{ maxHeight: 260, overflowY: 'auto' }}>
            <div style={{ padding: '8px 10px', fontSize: 11, color: 'var(--t-text-muted)', cursor: 'pointer', borderBottom: '1px solid var(--t-line)' }} onClick={() => { onChange(''); setOpen(false) }}>— {placeholder || 'All'} —</div>
            {shown.length === 0 && <div style={{ padding: 10, fontSize: 11, color: 'var(--t-text-faint)' }}>No match.</div>}
            {shown.map(r => (
              <div key={r.id} style={{ padding: '7px 10px', fontSize: 12, cursor: 'pointer', display: 'flex', gap: 8, alignItems: 'center', borderBottom: '1px solid var(--t-line)', background: r.id === value ? 'var(--t-surface-2)' : 'transparent' }}
                onClick={() => { onChange(r.id); setOpen(false) }}>
                <span style={st.posBadge(r.pos)}>{posBadge(r.pos)}</span>
                <span style={st.rowName}>{r.name}</span>
                <span style={{ fontSize: 10, color: 'var(--t-text-faint)', whiteSpace: 'nowrap', flexShrink: 0 }}>{r.loc}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── week grid (matches the AM/PM layout, adds EVE + on-call + status) ──
function WeekGrid({ dates, loc, cellStatus, oncall, onCellClick, onOncall, posFilter, empFilter, anchor }) {
  const td = { border: '1px solid var(--t-line)', verticalAlign: 'top', padding: 0, minWidth: 150 }
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 1050 }}>
        <thead>
          <tr>
            <th style={{ ...td, minWidth: 70, background: 'var(--t-surface-2)' }}></th>
            {dates.map(d => {
              const today = sameDay(d, new Date())
              return (
                <th key={iso(d)} style={{ ...td, padding: '8px 6px', textAlign: 'center', background: today ? 'rgba(0,229,255,.08)' : 'var(--t-surface-2)', borderTop: today ? '2px solid var(--t-accent)' : '1px solid var(--t-line)' }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--t-text-muted)', letterSpacing: '.08em' }}>{DAY_ABBR[d.getDay()].toUpperCase()}</div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: today ? 'var(--t-accent)' : 'var(--t-text)' }}>{MONTHS[d.getMonth()].slice(0, 3)} {d.getDate()}</div>
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {SHIFTS.map(sh => (
            <tr key={sh.id}>
              <td style={{ ...td, padding: '10px 8px', background: 'var(--t-surface-2)' }}>
                <div style={{ fontSize: 12, fontWeight: 800 }}>{sh.label}</div>
                <div style={{ fontSize: 9, color: 'var(--t-text-faint)' }}>{sh.hours}</div>
              </td>
              {dates.map(d => {
                const s = cellStatus(d, sh.id)
                let list = s.list
                if (posFilter !== 'All') list = list.filter(e => e.pos === posFilter)
                if (empFilter) list = list.filter(e => e.id === empFilter)
                const border = s.noKH ? 'var(--t-danger)' : s.short ? 'var(--t-warn)' : 'var(--t-success)'
                return (
                  <td key={iso(d) + sh.id} style={{ ...td, cursor: onCellClick ? 'pointer' : 'default' }} onClick={() => onCellClick && onCellClick(d, sh.id)}>
                    <div style={{ borderLeft: `3px solid ${border}`, padding: '6px 7px', minHeight: 58 }}>
                      {list.map(e => (
                        <div key={e.id} style={{ fontSize: 11, marginBottom: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'flex', alignItems: 'center', gap: 4 }}>
                          <span style={st.posBadge(e.pos)}>{posBadge(e.pos)}</span>
                          <span style={{ color: posColor(e.pos), fontWeight: 600 }}>{e.name}</span>
                          {e.zone && <span style={{ fontSize: 8, color: 'var(--t-text-faint)', border: '1px solid var(--t-line)', padding: '0 3px', marginLeft: 'auto' }}>{e.zone}</span>}
                        </div>
                      ))}
                      {s.noKH && <div style={{ fontSize: 9, fontWeight: 800, color: 'var(--t-danger)', border: '1px solid var(--t-danger)', padding: '1px 4px', display: 'inline-block', marginTop: 2 }}>NO KEY HOLDER</div>}
                      {!s.noKH && s.short && <div style={{ fontSize: 9, fontWeight: 800, color: 'var(--t-warn)' }}>SHORT · need {Math.max(0, s.req.ASSOC - s.assoc)} more</div>}
                      {list.length === 0 && !s.short && <div style={{ fontSize: 10, color: 'var(--t-text-faint)' }}>+ add</div>}
                    </div>
                  </td>
                )
              })}
            </tr>
          ))}
          {/* on-call row */}
          <tr>
            <td style={{ border: '1px solid var(--t-line)', padding: '10px 8px', background: 'var(--t-surface-2)' }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--t-purple, #7c4dff)' }}>ON-CALL</div>
            </td>
            {dates.map(d => {
              const list = oncall[loc]?.[iso(d)] || []
              return (
                <td key={'oc' + iso(d)} style={{ border: '1px solid var(--t-line)', cursor: onOncall ? 'pointer' : 'default' }} onClick={() => onOncall && onOncall(d)}>
                  <div style={{ padding: '6px 7px', minHeight: 28 }}>
                    {list.map(e => <div key={e.id} style={{ fontSize: 11 }}>📞 {e.name}</div>)}
                    {list.length === 0 && <div style={{ fontSize: 10, color: 'var(--t-text-faint)' }}>+ set on-call</div>}
                  </div>
                </td>
              )
            })}
          </tr>
        </tbody>
      </table>
      <Legend />
    </div>
  )
}

function Legend() {
  return (
    <div style={{ display: 'flex', gap: 16, marginTop: 10, fontSize: 10, color: 'var(--t-text-muted)' }}>
      <span><span style={{ display: 'inline-block', width: 10, height: 10, background: 'var(--t-success)', marginRight: 4 }} />Fully covered</span>
      <span><span style={{ display: 'inline-block', width: 10, height: 10, background: 'var(--t-warn)', marginRight: 4 }} />Short-staffed</span>
      <span><span style={{ display: 'inline-block', width: 10, height: 10, background: 'var(--t-danger)', marginRight: 4 }} />No key holder</span>
      <span style={{ marginLeft: 'auto' }}>Click any cell to assign · click on-call to set</span>
    </div>
  )
}

// ── day view ──────────────────────────────────────────────────────────
function DayView({ date, cellStatus, loc, oncall, onCellClick, posFilter, empFilter }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {SHIFTS.map(sh => {
        const s = cellStatus(date, sh.id)
        let list = s.list
        if (posFilter !== 'All') list = list.filter(e => e.pos === posFilter)
        if (empFilter) list = list.filter(e => e.id === empFilter)
        const border = s.noKH ? 'var(--t-danger)' : s.short ? 'var(--t-warn)' : 'var(--t-success)'
        return (
          <div key={sh.id} style={{ border: '1px solid var(--t-line)', borderLeft: `3px solid ${border}`, background: 'var(--t-surface)', cursor: onCellClick ? 'pointer' : 'default' }} onClick={() => onCellClick && onCellClick(date, sh.id)}>
            <div style={{ padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--t-line)', background: 'var(--t-surface-2)' }}>
              <div><span style={{ fontSize: 13, fontWeight: 800 }}>{sh.label}</span><span style={{ fontSize: 10, color: 'var(--t-text-faint)', marginLeft: 8 }}>{sh.hours}</span></div>
              <div style={{ fontSize: 11, color: s.noKH ? 'var(--t-danger)' : s.short ? 'var(--t-warn)' : 'var(--t-success)', fontWeight: 700 }}>
                {s.kh}/{s.req.KH} KH · {s.assoc}/{s.req.ASSOC} ASSOC {s.noKH ? '· NO KEY HOLDER' : s.short ? '· SHORT' : '· ✓'}
              </div>
            </div>
            <div style={{ padding: '10px 14px', display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {list.map(e => <span key={e.id} style={{ fontSize: 12, border: `1px solid ${posColor(e.pos)}`, padding: '4px 8px', display: 'inline-flex', alignItems: 'center', gap: 6 }}><span style={st.posBadge(e.pos)}>{posBadge(e.pos)}</span><span style={{ color: posColor(e.pos), fontWeight: 600 }}>{e.name}</span>{e.zone && <span style={{ fontSize: 9, color: 'var(--t-text-faint)', borderLeft: '1px solid var(--t-line)', paddingLeft: 6 }}>{e.zone}</span>}</span>)}
              {list.length === 0 && <span style={{ fontSize: 12, color: 'var(--t-text-faint)' }}>No one scheduled — click to assign.</span>}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── month view (calendar) ─────────────────────────────────────────────
function MonthView({ anchor, cellStatus, onDayClick }) {
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1)
  const gridStart = startOfWeek(first)
  const weeks = Array.from({ length: 6 }, (_, w) => Array.from({ length: 7 }, (_, d) => addDays(gridStart, w * 7 + d)))
  const th = { padding: '6px', fontSize: 10, fontWeight: 700, color: 'var(--t-text-muted)', textAlign: 'center', textTransform: 'uppercase', letterSpacing: '.06em', border: '1px solid var(--t-line)', background: 'var(--t-surface-2)' }
  return (
    <table style={{ borderCollapse: 'collapse', width: '100%' }}>
      <thead><tr>{['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => <th key={d} style={th}>{d}</th>)}</tr></thead>
      <tbody>
        {weeks.map((wk, wi) => (
          <tr key={wi}>
            {wk.map(d => {
              const inMonth = d.getMonth() === anchor.getMonth()
              const today = sameDay(d, new Date())
              const statuses = SHIFTS.map(sh => cellStatus(d, sh.id))
              const anyRed = statuses.some(s => s.noKH)
              const anyAmber = statuses.some(s => s.short && !s.noKH)
              const total = statuses.reduce((n, s) => n + s.list.length, 0)
              return (
                <td key={iso(d)} onClick={() => onDayClick(d)} style={{ border: '1px solid var(--t-line)', verticalAlign: 'top', height: 84, width: '14%', cursor: 'pointer', background: today ? 'rgba(0,229,255,.06)' : inMonth ? 'var(--t-surface)' : 'var(--t-bg)', opacity: inMonth ? 1 : 0.5, padding: 6 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 12, fontWeight: today ? 800 : 600, color: today ? 'var(--t-accent)' : 'var(--t-text)' }}>{d.getDate()}</span>
                    <div style={{ display: 'flex', gap: 3 }}>
                      {statuses.map((s, i) => <span key={i} title={SHIFTS[i].label} style={{ width: 8, height: 8, borderRadius: '50%', background: s.noKH ? 'var(--t-danger)' : s.short ? 'var(--t-warn)' : s.list.length ? 'var(--t-success)' : 'var(--t-line)' }} />)}
                    </div>
                  </div>
                  {total > 0 && <div style={{ fontSize: 10, color: 'var(--t-text-muted)', marginTop: 6 }}>{total} scheduled</div>}
                  {anyRed && <div style={{ fontSize: 9, fontWeight: 800, color: 'var(--t-danger)', marginTop: 2 }}>⚠ No KH</div>}
                  {!anyRed && anyAmber && <div style={{ fontSize: 9, fontWeight: 800, color: 'var(--t-warn)', marginTop: 2 }}>Short</div>}
                </td>
              )
            })}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

// ── assign drawer (searchable, position + availability aware) ─────────
function AssignDrawer({ ctx, loc, roster, avail, sched, status, onClose, onAssign, onUnassign, onRequestCoverage }) {
  const [q, setQ] = useState('')
  const [locF, setLocF] = useState(loc)
  const [posF, setPosF] = useState('All')
  const [availOnly, setAvailOnly] = useState(false)
  const [zoneSel, setZoneSel] = useState('Floor')   // zone applied to new assignments
  const shHours = SHIFTS.find(s => s.id === ctx.shift)?.hours || ''
  // scheduled rows key on shift_id, so exclude already-assigned people by name
  const assignedNames = new Set(status.list.map(e => e.name))
  // AI picks: what position does this shift still need?
  const needPos = status.noKH ? 'KH' : status.assoc < status.req.ASSOC ? 'ASSOC' : null
  const suggestions = rankCandidates(roster.filter(r => !assignedNames.has(r.name)), avail, sched, ctx.date, ctx.shift, loc, needPos)
    .filter(r => r.score > -40).slice(0, 3)

  const candidates = roster
    .filter(r => !assignedNames.has(r.name))
    .filter(r => locF === 'All' || r.loc === locF)
    .filter(r => posF === 'All' || r.pos === posF)
    .map(r => { const load = weekLoad(sched, r.name, ctx.date); return { ...r, avail: availableFor(avail, r.id, ctx.date, ctx.shift), load, otRisk: load >= 5 } })
    .filter(r => !availOnly || r.avail)
    .filter(r => { if (!q) return true; const s = q.toLowerCase(); return r.name.toLowerCase().includes(s) || String(r.id).toLowerCase().includes(s) })
    .sort((a, b) => (b.avail - a.avail) || a.name.localeCompare(b.name))
    .slice(0, 80)

  // proactive cross-location OT guard: shifts are ~8h; a 6th shift (load>=5) tips into OT
  const assignGuarded = (r, zone) => {
    if (r.otRisk) {
      const projHrs = (r.load + 1) * 8, otHrs = Math.max(0, projHrs - 40), otCost = Math.round(otHrs * 27)  // ~$18 base × 1.5
      if (!window.confirm(`⚠ Overtime warning\n\nThis is ${r.name}'s ${r.load + 1}th shift this week across all locations (~${projHrs}h).\nThat's ~${otHrs}h of paid OT ≈ $${otCost}.\n\nAssign anyway?`)) return
    }
    onAssign(r, zone)
  }
  const locs = [...new Set(roster.map(r => r.loc).filter(Boolean))]

  return (
    <div style={st.overlay} onClick={onClose}>
      <div style={st.drawer} onClick={e => e.stopPropagation()}>
        <div style={st.drawerHead}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 800 }}>{DAY_FULL[ctx.date.getDay()]}, {MONTHS[ctx.date.getMonth()].slice(0, 3)} {ctx.date.getDate()} · {ctx.shift}</div>
              <div style={{ fontSize: 11, color: 'var(--t-text-muted)' }}>{loc} · {shHours}</div>
            </div>
            <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--t-text-muted)', fontSize: 22, cursor: 'pointer' }}>×</button>
          </div>
          <div style={{ marginTop: 8, fontSize: 11, fontWeight: 700, color: status.noKH ? 'var(--t-danger)' : status.short ? 'var(--t-warn)' : 'var(--t-success)' }}>
            {status.kh}/{status.req.KH} Key Holders · {status.assoc}/{status.req.ASSOC} Associates {status.noKH ? '· NO KEY HOLDER' : status.short ? '· SHORT' : '· fully covered'}
          </div>
        </div>

        <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 12, flex: 1 }}>
          {/* AI suggested picks */}
          {suggestions.length > 0 && (
            <div style={{ border: '1px solid var(--t-accent)', background: 'rgba(0,229,255,.05)', padding: 10 }}>
              <div style={{ ...st.label, color: 'var(--t-accent)', marginBottom: 6 }}>🤖 AI Suggested{needPos ? ` — needs ${needPos}` : ''}</div>
              {suggestions.map(r => (
                <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--t-line)' }}>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600 }}><span style={st.posBadge(r.pos)}>{posBadge(r.pos)}</span>{r.name}</div>
                    <div style={{ fontSize: 10, color: r.otRisk ? 'var(--t-warn)' : 'var(--t-text-faint)' }}>{r.reason}</div>
                  </div>
                  <button style={{ ...st.btn, padding: '5px 11px' }} onClick={() => assignGuarded(r, zoneSel)}>Add</button>
                </div>
              ))}
            </div>
          )}
          {/* assigned */}
          <div>
            <div style={st.label}>Assigned ({status.list.length})</div>
            <div style={{ marginTop: 6 }}>
              {status.list.length === 0 && <div style={{ fontSize: 11, color: 'var(--t-text-faint)' }}>No one assigned yet.</div>}
              {status.list.map(e => (
                <div key={e.id} style={st.chip(e.pos)}>
                  <span style={{ minWidth: 0, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}><span style={st.posBadge(e.pos)}>{posBadge(e.pos)}</span><span style={{ color: posColor(e.pos), fontWeight: 600 }}>{e.name}</span></span>
                  {/* zone is set at assignment time (schedule_assign) and read from the shift */}
                  <span title="Zone (set when assigned)" style={{ fontSize: 9, color: 'var(--t-text-faint)', border: '1px solid var(--t-line)', padding: '2px 5px', flexShrink: 0 }}>{e.zone || 'Floor'}</span>
                  <button onClick={() => onUnassign(e.shift_id ?? e.id)} style={{ background: 'transparent', border: 'none', color: 'var(--t-danger)', cursor: 'pointer', fontSize: 14, flexShrink: 0 }}>×</button>
                </div>
              ))}
            </div>
          </div>

          {/* zone for new assignments */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--t-surface-2)', padding: '8px 10px', border: '1px solid var(--t-line)' }}>
            <span style={{ ...st.label, marginBottom: 0 }}>Assign to zone</span>
            <select value={zoneSel} onChange={e => setZoneSel(e.target.value)} style={{ ...st.sel, fontSize: 12, flex: 1 }}>
              {ZONES.map(z => <option key={z} value={z}>{z}</option>)}
            </select>
            <span style={{ fontSize: 9, color: 'var(--t-text-faint)' }}>applied when you add someone</span>
          </div>

          {/* picker */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={st.label}>Add employee</div>
              <label style={{ fontSize: 10, color: 'var(--t-text-muted)', display: 'flex', gap: 4, alignItems: 'center' }}>
                <input type="checkbox" checked={availOnly} onChange={e => setAvailOnly(e.target.checked)} style={st.cb} /> Available only
              </label>
            </div>
            <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
              <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search name or ID…" style={{ ...st.inp, fontSize: 11 }} />
            </div>
            <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
              <select value={locF} onChange={e => setLocF(e.target.value)} style={{ ...st.sel, flex: 1, fontSize: 11 }}>
                <option value="All">All locations</option>{locs.map(l => <option key={l} value={l}>{l}</option>)}
              </select>
              <select value={posF} onChange={e => setPosF(e.target.value)} style={{ ...st.sel, fontSize: 11 }}>
                <option value="All">All</option><option value="KH">KH</option><option value="ASSOC">Assoc</option>
              </select>
            </div>
            <div style={{ marginTop: 8, border: '1px solid var(--t-line)', maxHeight: 300, overflowY: 'auto' }}>
              {candidates.length === 0 && <div style={{ padding: 12, fontSize: 12, color: 'var(--t-text-faint)' }}>No {availOnly ? 'available ' : ''}employees match. Try turning off "Available only", or request coverage below.</div>}
              {candidates.map(r => (
                <div key={r.id} style={{ padding: '8px 10px', borderBottom: '1px solid var(--t-line)', display: 'flex', gap: 8, justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', background: r.otRisk ? 'rgba(255,184,0,.05)' : 'transparent' }} onClick={() => assignGuarded(r, zoneSel)}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, display: 'flex', gap: 6, alignItems: 'center' }}><span style={{ ...st.posBadge(r.pos), flexShrink: 0 }}>{posBadge(r.pos)}</span><span style={st.rowName}>{r.name}</span>{r.otRisk && <span style={{ fontSize: 8, fontWeight: 800, color: 'var(--t-warn)', border: '1px solid var(--t-warn)', padding: '0 3px', flexShrink: 0 }}>⚠ OT</span>}</div>
                    <div style={{ fontSize: 10, color: 'var(--t-text-faint)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.loc} · ID {String(r.id).slice(0, 8)} · {r.load} shifts/wk</div>
                  </div>
                  <span style={{ fontSize: 10, fontWeight: 700, flexShrink: 0, whiteSpace: 'nowrap', color: r.avail ? 'var(--t-success)' : 'var(--t-text-faint)' }}>{r.avail ? '● available' : '○ not avail'}</span>
                </div>
              ))}
            </div>
          </div>

          <button style={{ ...st.btn, background: 'var(--t-warn)' }} onClick={onRequestCoverage}>📣 Request Coverage (short-handed / call-out)</button>
        </div>
      </div>
    </div>
  )
}

// ── on-call drawer ────────────────────────────────────────────────────
function OnCallDrawer({ date, loc, roster, current, onClose, onSet }) {
  const [q, setQ] = useState('')
  const [sel, setSel] = useState(current)
  const toggle = (r) => setSel(s => s.some(x => x.id === r.id) ? s.filter(x => x.id !== r.id) : [...s, { id: r.id, name: r.name, pos: r.pos }])
  const shown = roster.filter(r => !q || r.name.toLowerCase().includes(q.toLowerCase()) || String(r.id).toLowerCase().includes(q.toLowerCase())).slice(0, 60)
  return (
    <div style={st.overlay} onClick={onClose}>
      <div style={st.drawer} onClick={e => e.stopPropagation()}>
        <div style={st.drawerHead}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div><div style={{ fontSize: 14, fontWeight: 800 }}>On-Call · {MONTHS[date.getMonth()].slice(0, 3)} {date.getDate()}</div><div style={{ fontSize: 11, color: 'var(--t-text-muted)' }}>{loc}</div></div>
            <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--t-text-muted)', fontSize: 22, cursor: 'pointer' }}>×</button>
          </div>
        </div>
        <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search name or ID…" style={{ ...st.inp, fontSize: 11 }} />
          <div style={{ border: '1px solid var(--t-line)', maxHeight: 360, overflowY: 'auto' }}>
            {shown.map(r => {
              const on = sel.some(x => x.id === r.id)
              return (
                <label key={r.id} style={{ padding: '8px 10px', borderBottom: '1px solid var(--t-line)', display: 'flex', gap: 8, alignItems: 'center', cursor: 'pointer' }}>
                  <input type="checkbox" checked={on} onChange={() => toggle(r)} style={st.cb} />
                  <span style={{ ...st.posBadge(r.pos), flexShrink: 0 }}>{posBadge(r.pos)}</span>
                  <span style={{ ...st.rowName, fontSize: 12 }}>{r.name}</span>
                  <span style={{ fontSize: 10, color: 'var(--t-text-faint)', whiteSpace: 'nowrap', flexShrink: 0 }}>{r.loc}</span>
                </label>
              )
            })}
          </div>
          <button style={st.btn} onClick={() => { onSet(sel); onClose() }}>Save On-Call ({sel.length})</button>
        </div>
      </div>
    </div>
  )
}

// ── coverage request modal ────────────────────────────────────────────
function CoverageModal({ ctx, loc, roster, avail, sched, onClose, onSend }) {
  const [q, setQ] = useState('')
  const [locF, setLocF] = useState('All')
  const [sel, setSel] = useState([])
  const suggestions = rankCandidates(roster, avail, sched, ctx.date, ctx.shift, loc, null).filter(r => r.score > -40).slice(0, 5)
  const addSuggested = () => setSel(s => { const ids = new Set(s.map(x => x.id)); return [...s, ...suggestions.filter(r => !ids.has(r.id))] })
  const [msg, setMsg] = useState(`We're short for the ${ctx.shift} shift on ${MONTHS[ctx.date.getMonth()].slice(0, 3)} ${ctx.date.getDate()} at ${loc}. Can you cover?`)
  const [channel, setChannel] = useState('both')
  const [urgency, setUrgency] = useState('normal')
  const toggle = (r) => setSel(s => s.some(x => x.id === r.id) ? s.filter(x => x.id !== r.id) : [...s, r])
  const shown = roster
    .map(r => ({ ...r, avail: availableFor(avail, r.id, ctx.date, ctx.shift) }))
    .filter(r => locF === 'All' || r.loc === locF)
    .filter(r => !q || r.name.toLowerCase().includes(q.toLowerCase()) || String(r.id).toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => (b.avail - a.avail) || a.name.localeCompare(b.name))
  const locs = [...new Set(roster.map(r => r.loc).filter(Boolean))]
  const blastAll = () => setSel(shown)

  return (
    <div style={{ ...st.overlay, alignItems: 'flex-start', justifyContent: 'center', padding: '40px 20px' }} onClick={onClose}>
      <div style={st.modal} onClick={e => e.stopPropagation()}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--t-line)', background: 'var(--t-surface-2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div><div style={{ fontSize: 14, fontWeight: 800 }}>📣 Request Coverage</div><div style={{ fontSize: 11, color: 'var(--t-text-muted)' }}>{DAY_FULL[ctx.date.getDay()]} {MONTHS[ctx.date.getMonth()].slice(0, 3)} {ctx.date.getDate()} · {ctx.shift} · {loc}</div></div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--t-text-muted)', fontSize: 22, cursor: 'pointer' }}>×</button>
        </div>
        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* AI suggested best people to ask */}
          {suggestions.length > 0 && (
            <div style={{ border: '1px solid var(--t-accent)', background: 'rgba(0,229,255,.05)', padding: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <div style={{ ...st.label, color: 'var(--t-accent)' }}>🤖 AI Suggested — best people to ask first</div>
                <button style={{ ...st.btn, padding: '5px 11px' }} onClick={addSuggested}>+ Add all suggested</button>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {suggestions.map(r => {
                  const on = sel.some(x => x.id === r.id)
                  return (
                    <button key={r.id} onClick={() => setSel(s => on ? s.filter(x => x.id !== r.id) : [...s, r])} title={r.reason}
                      style={{ fontSize: 11, padding: '5px 9px', border: `1px solid ${on ? 'var(--t-accent)' : 'var(--t-line)'}`, background: on ? 'var(--t-accent)' : 'var(--t-surface)', color: on ? '#fff' : 'var(--t-text)', cursor: 'pointer' }}>
                      {on ? '✓ ' : '+ '}{r.name}{r.otRisk ? ' ⚠' : ''}
                    </button>
                  )
                })}
              </div>
            </div>
          )}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={st.label}>Recipients ({sel.length}) — search across ALL locations</div>
              <button style={{ ...st.btn, background: 'var(--t-danger)' }} onClick={blastAll} title="Below shift minimum — ask everyone available across all locations">🚨 Below Shift Minimum — Ask All</button>
            </div>
            <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
              <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search name or ID…" style={{ ...st.inp, fontSize: 11 }} />
              <select value={locF} onChange={e => setLocF(e.target.value)} style={{ ...st.sel, fontSize: 11 }}><option value="All">All loc</option>{locs.map(l => <option key={l} value={l}>{l}</option>)}</select>
            </div>
            <div style={{ marginTop: 8, border: '1px solid var(--t-line)', maxHeight: 220, overflowY: 'auto' }}>
              {shown.map(r => {
                const on = sel.some(x => x.id === r.id)
                return (
                  <label key={r.id} style={{ padding: '7px 10px', borderBottom: '1px solid var(--t-line)', display: 'flex', gap: 8, alignItems: 'center', cursor: 'pointer', background: on ? 'var(--t-surface-2)' : 'transparent' }}>
                    <input type="checkbox" checked={on} onChange={() => toggle(r)} style={st.cb} />
                    <span style={{ ...st.posBadge(r.pos), flexShrink: 0 }}>{posBadge(r.pos)}</span>
                    <span style={{ ...st.rowName, fontSize: 12 }}>{r.name}</span>
                    <span style={{ fontSize: 10, color: 'var(--t-text-faint)', whiteSpace: 'nowrap', flexShrink: 0 }}>{r.loc}</span>
                    <span style={{ fontSize: 11, flexShrink: 0, color: r.avail ? 'var(--t-success)' : 'var(--t-text-faint)' }}>{r.avail ? '●' : '○'}</span>
                  </label>
                )
              })}
            </div>
          </div>
          <div><div style={st.label}>Message</div><textarea value={msg} onChange={e => setMsg(e.target.value)} style={{ ...st.inp, minHeight: 60, marginTop: 6, resize: 'vertical', fontFamily: 'inherit' }} /></div>
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ flex: 1 }}><div style={st.label}>Send via</div>
              <select value={channel} onChange={e => setChannel(e.target.value)} style={{ ...st.sel, width: '100%', marginTop: 6 }}>
                <option value="both">In-App + Text</option><option value="app">In-App only</option><option value="text">Text (SMS) only</option>
              </select></div>
            <div style={{ flex: 1 }}><div style={st.label}>Urgency</div>
              <select value={urgency} onChange={e => setUrgency(e.target.value)} style={{ ...st.sel, width: '100%', marginTop: 6 }}>
                <option value="normal">Normal</option><option value="high">High</option><option value="critical">🚨 Critical / desperate</option>
              </select></div>
          </div>
          <button disabled={sel.length === 0} style={{ ...st.btn, opacity: sel.length ? 1 : 0.5, cursor: sel.length ? 'pointer' : 'not-allowed' }} onClick={() => onSend(ctx, sel, msg, channel, urgency, sel.length === shown.length)}>Send to {sel.length} · {channel === 'text' ? 'Text' : channel === 'app' ? 'In-App' : 'App + Text'}</button>
        </div>
      </div>
    </div>
  )
}

// ── coverage requests panel (outgoing + my inbox) ─────────────────────
function CoverageRequestsPanel({ coverage, me, onClose, onRespond, onAccept }) {
  const [reasonDraft, setReasonDraft] = useState({})
  const myInbox = coverage.filter(r => r.recipients.some(rc => rc.id === me.id))
  return (
    <div style={{ ...st.overlay, justifyContent: 'center', alignItems: 'flex-start', padding: '40px 20px' }} onClick={onClose}>
      <div style={{ ...st.modal, width: 'min(680px, 96vw)' }} onClick={e => e.stopPropagation()}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--t-line)', background: 'var(--t-surface-2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 14, fontWeight: 800 }}>Coverage Requests</span>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--t-text-muted)', fontSize: 22, cursor: 'pointer' }}>×</button>
        </div>
        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 18 }}>
          {/* my inbox */}
          {myInbox.length > 0 && (
            <div>
              <div style={{ ...st.label, marginBottom: 8 }}>📨 Asks for me</div>
              {myInbox.map(r => {
                const mine = r.recipients.find(rc => rc.id === me.id)
                return (
                  <div key={r.id} style={{ border: '1px solid var(--t-line)', padding: 12, marginBottom: 8 }}>
                    <div style={{ fontSize: 12, fontWeight: 700 }}>{r.location} · {r.shift} · {r.date}</div>
                    <div style={{ fontSize: 12, color: 'var(--t-text-muted)', margin: '4px 0 8px' }}>{r.message}</div>
                    <div style={{ fontSize: 10, color: 'var(--t-text-faint)', marginBottom: 8 }}>From {r.requester} · via {r.channel} · {r.urgency}</div>
                    {mine.status === 'pending' ? (
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <button style={{ ...st.btn, background: 'var(--t-success)' }} onClick={() => onAccept(r, mine)}>✓ I can cover</button>
                        <input placeholder="Reason if declining…" value={reasonDraft[r.id] || ''} onChange={e => setReasonDraft(d => ({ ...d, [r.id]: e.target.value }))} style={{ ...st.inp, fontSize: 11, flex: 1 }} />
                        <button style={{ ...st.ghost, color: 'var(--t-danger)' }} onClick={() => onRespond(r.id, me.id, 'declined', reasonDraft[r.id] || '')}>Decline</button>
                      </div>
                    ) : <span style={{ fontSize: 11, fontWeight: 700, color: mine.status === 'approved' ? 'var(--t-success)' : 'var(--t-danger)' }}>You {mine.status === 'approved' ? 'accepted' : 'declined'}{mine.reason ? ` — "${mine.reason}"` : ''}</span>}
                  </div>
                )
              })}
            </div>
          )}
          {/* outgoing */}
          <div>
            <div style={{ ...st.label, marginBottom: 8 }}>Outgoing requests</div>
            {coverage.length === 0 && <div style={{ fontSize: 12, color: 'var(--t-text-faint)' }}>No coverage requests yet.</div>}
            {coverage.map(r => {
              const accepted = r.recipients.filter(rc => rc.status === 'approved')
              const declined = r.recipients.filter(rc => rc.status === 'declined')
              const pending = r.recipients.filter(rc => rc.status === 'pending')
              return (
                <div key={r.id} style={{ border: '1px solid var(--t-line)', padding: 12, marginBottom: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 12, fontWeight: 700 }}>{r.location} · {r.shift} · {r.date}</span>
                    <span style={{ fontSize: 10, color: 'var(--t-text-faint)' }}>{r.channel} · {r.urgency}{r.blast ? ' · BLAST' : ''}</span>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--t-text-muted)', margin: '4px 0 8px' }}>{r.message}</div>
                  <div style={{ display: 'flex', gap: 12, fontSize: 11 }}>
                    <span style={{ color: 'var(--t-success)' }}>✓ {accepted.length} accepted</span>
                    <span style={{ color: 'var(--t-danger)' }}>✕ {declined.length} declined</span>
                    <span style={{ color: 'var(--t-text-muted)' }}>◷ {pending.length} pending</span>
                  </div>
                  {accepted.length > 0 && <div style={{ fontSize: 11, color: 'var(--t-success)', marginTop: 4 }}>Covering: {accepted.map(a => a.name).join(', ')}</div>}
                  {declined.some(d => d.reason) && <div style={{ fontSize: 10, color: 'var(--t-text-faint)', marginTop: 4 }}>{declined.filter(d => d.reason).map(d => `${d.name}: "${d.reason}"`).join(' · ')}</div>}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── min-required-per-shift editor ─────────────────────────────────────
function MinReqModal({ minReq, onClose, onSave }) {
  const [m, setM] = useState(minReq)
  const set = (sh, pos, v) => setM(x => ({ ...x, [sh]: { ...x[sh], [pos]: Math.max(0, parseInt(v || '0', 10)) } }))
  return (
    <div style={{ ...st.overlay, justifyContent: 'center', alignItems: 'flex-start', padding: '60px 20px' }} onClick={onClose}>
      <div style={{ ...st.modal, width: 'min(420px, 96vw)' }} onClick={e => e.stopPropagation()}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--t-line)', background: 'var(--t-surface-2)', display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 14, fontWeight: 800 }}>Minimum Required per Shift</span>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--t-text-muted)', fontSize: 22, cursor: 'pointer' }}>×</button>
        </div>
        <div style={{ padding: 16 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr><th style={{ ...st.label, textAlign: 'left', padding: 6 }}>Shift</th><th style={{ ...st.label, padding: 6 }}>Key Holders</th><th style={{ ...st.label, padding: 6 }}>Associates</th></tr></thead>
            <tbody>
              {SHIFTS.map(sh => (
                <tr key={sh.id}>
                  <td style={{ padding: 6, fontWeight: 700, fontSize: 12 }}>{sh.label}</td>
                  <td style={{ padding: 6, textAlign: 'center' }}><input type="number" min="0" value={m[sh.id]?.KH ?? 0} onChange={e => set(sh.id, 'KH', e.target.value)} style={{ ...st.inp, width: 60, textAlign: 'center' }} /></td>
                  <td style={{ padding: 6, textAlign: 'center' }}><input type="number" min="0" value={m[sh.id]?.ASSOC ?? 0} onChange={e => set(sh.id, 'ASSOC', e.target.value)} style={{ ...st.inp, width: 60, textAlign: 'center' }} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          <button style={{ ...st.btn, marginTop: 14, width: '100%' }} onClick={() => { onSave(m); onClose() }}>Save Coverage Targets</button>
        </div>
      </div>
    </div>
  )
}
