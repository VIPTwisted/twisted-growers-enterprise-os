// CoverageMonitor.jsx — HR & Management staff-coverage monitoring board.
// See ALL staff by location for the live day OR any selected date, with
// Day / Week / Month / List views, a date selector, and print. 100% real data:
//   * get_week_schedule — scheduled shifts incl. shift_id + latest exception_type
//     per shift, so called-out status reads straight from shift_exceptions.
//   * get_coverage_requests — live coverage-request overlay (when dated).
//   * mark_shift_callout / clear_shift_callout — manager toggle writes to
//     shift_exceptions (same table the Callout Tracker + forensics read).
// Locations come from the session's real org nodes (useScope), never hardcoded.
// Empty = honestly empty; backend errors are flagged, never papered over.
import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../lib/auth.jsx'
import { useScope } from '../lib/scope.jsx'
import { sb } from '../lib/supabase'
import FilterBar from '../components/FilterBar.jsx'
import { companyName } from '../lib/config.js'

/* ── shift buckets (grouping only; hours shown are the REAL shift times) ──
   AM/PM split at 13:00 mirrors the backend's shift_slot rule (forensic_callouts). */
const SHIFTS = [
  { id: 'AM', label: 'AM Shift', color: '#ffd60a' },
  { id: 'PM', label: 'PM Shift', color: '#00e5ff' },
]
const OUT_TYPES = ['callout', 'no_show']

// Transform real get_week_schedule rows into { [location]: { AM|PM: { dayIdx: [entry] } } }.
// Every entry carries its real shift_id + times + live called-out state.
function transformLiveRows(rows, days, locNames) {
  if (!rows || rows.length === 0) return null
  const s = {}
  const ensure = (loc) => {
    if (!s[loc]) { s[loc] = {}; SHIFTS.forEach(sh => { s[loc][sh.id] = {}; days.forEach((_, di) => { s[loc][sh.id][di] = [] }) }) }
  }
  locNames.forEach(ensure)
  rows.forEach(row => {
    const loc = row.node_name || 'Unassigned'
    ensure(loc)
    const rowDate = new Date(String(row.shift_date).slice(0, 10) + 'T00:00:00')
    const dayIdx = days.findIndex(d => isSameDay(d, rowDate))
    if (dayIdx === -1) return
    const hour = row.start_time ? parseInt(row.start_time.split(':')[0], 10) : 9
    const shiftId = hour < 13 ? 'AM' : 'PM'
    const isKH = row.keyholder_eligible === true || (row.role_name || '').toLowerCase().includes('key')
    if (!s[loc][shiftId]) return
    if (!s[loc][shiftId][dayIdx]) s[loc][shiftId][dayIdx] = []
    s[loc][shiftId][dayIdx].push({
      name: row.full_name || 'Unknown',
      role: isKH ? 'KH' : 'ASSOC',
      shiftId: row.shift_id || null,
      start: row.start_time ? String(row.start_time).slice(0, 5) : '',
      end: row.end_time ? String(row.end_time).slice(0, 5) : '',
      out: OUT_TYPES.includes(row.exception_type),
    })
  })
  return s
}

/* ── date helpers ── */
function getWeekDays(baseDate) {
  const d = new Date(baseDate); const day = d.getDay()
  d.setDate(d.getDate() - day + (day === 0 ? -6 : 1))       // Monday
  return Array.from({ length: 7 }, (_, i) => { const x = new Date(d); x.setDate(d.getDate() + i); return x })
}
function isSameDay(a, b) { return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate() }
function iso(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
function longDate(d) { return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) }
function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x }
function addMonths(d, n) { const x = new Date(d); x.setMonth(x.getMonth() + n); return x }
function rosterSpan(roster) {
  const starts = roster.map(e => e.start).filter(Boolean).sort()
  const ends = roster.map(e => e.end).filter(Boolean).sort()
  if (!starts.length) return ''
  return ends.length ? `${starts[0]} – ${ends[ends.length - 1]}` : starts[0]
}

const VIEWS = [{ id: 'day', label: 'Day' }, { id: 'week', label: 'Week' }, { id: 'month', label: 'Month' }, { id: 'list', label: 'List' }]

export default function CoverageMonitor() {
  const { session } = useAuth()
  const nav = useNavigate()
  const routerLoc = useLocation()
  const { locationIds, locations } = useScope()
  const person = session?.person
  const today = new Date()

  const [view, setView] = useState('day')
  const [anchor, setAnchor] = useState(today)
  const [cache, setCache] = useState({})        // weekStartISO -> { schedule, live, error? }
  const [callouts, setCallouts] = useState([])  // coverage-request overlay [{name, dateISO, location}]
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)       // a callout write is in flight
  const [fval, setFval] = useState({})   // { location:[], role:[], status:[], q:'' }

  /* real locations: the session's org nodes, plus any node name present in the
     loaded schedule (covers shifts at nodes outside the picker, e.g. after a
     scope change). Never a hardcoded list. */
  const locNames = useMemo(() => {
    const names = (locations || []).map(l => l.name).filter(Boolean)
    Object.values(cache).forEach(v => Object.keys(v.schedule || {}).forEach(n => { if (!names.includes(n)) names.push(n) }))
    return names
  }, [locations, cache])

  const FILTERS = useMemo(() => [
    { key: 'q', label: 'staff', type: 'search', width: 170 },
    { key: 'location', label: 'Locations', type: 'multiselect', options: locNames.map(l => ({ value: l, label: l })) },
    { key: 'role', label: 'Role', type: 'multiselect', options: [{ value: 'KH', label: 'Key Holder' }, { value: 'ASSOC', label: 'Associate' }] },
    { key: 'status', label: 'Status', type: 'multiselect', options: [{ value: 'scheduled', label: 'Scheduled' }, { value: 'out', label: 'Called Out' }] },
  ], [locNames])

  // Deep-link (e.g. from a Time-Off request): focus the requested date + location.
  useEffect(() => {
    const st = routerLoc.state
    if (!st) return
    if (st.date) { const [y, m, d] = String(st.date).slice(0, 10).split('-').map(Number); if (y) setAnchor(new Date(y, m - 1, d)) }
    if (st.location) setFval(f => ({ ...f, location: [st.location] }))
  }, []) // eslint-disable-line

  /* which week-starts does the current view need? */
  const neededWeeks = useMemo(() => {
    const set = new Map()
    const add = (d) => { const ws = getWeekDays(d)[0]; set.set(iso(ws), ws) }
    if (view === 'month') {
      const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1)
      for (let i = 0; i < 42; i += 7) add(addDays(getWeekDays(first)[0], i))
    } else { add(anchor) }
    return Array.from(set.values())
  }, [view, anchor])

  /* load any missing weeks from the real schedule RPC.
     setCache is applied unconditionally so a StrictMode remount can't drop it;
     `cache` in deps lets the effect settle once every needed week is present. */
  useEffect(() => {
    if (!locationIds || locationIds.length === 0) return
    const missing = neededWeeks.filter(ws => !cache[iso(ws)])
    if (missing.length === 0) { setLoading(false); return }
    let alive = true
    setLoading(true)
    Promise.all(missing.map(async ws => {
      const days = getWeekDays(ws)
      try {
        const { data, error } = await sb.rpc('get_week_schedule', { p_node_ids: locationIds, p_week_start: iso(ws), p_actor: person?.id || null })
        if (error) throw error
        // Real data is the source of truth. Empty (no schedule published) shows
        // honestly empty — never fabricated.
        const live = transformLiveRows(data, days, [])
        return [iso(ws), { schedule: live || {}, live: Array.isArray(data) && data.length > 0 }]
      } catch {
        // Never fabricate. If the backend errors, show honestly empty + flag it.
        return [iso(ws), { schedule: {}, live: false, error: true }]
      }
    })).then(results => {
      setCache(c => { const next = { ...c }; results.forEach(([k, v]) => { if (!next[k]) next[k] = v }); return next })
      if (alive) setLoading(false)
    })
    return () => { alive = false }
  }, [neededWeeks, locationIds.join(','), person?.id, cache])

  /* re-pull one week from the server (used after a callout write) */
  const refreshWeek = useCallback(async (date) => {
    const ws = getWeekDays(date)[0]
    const days = getWeekDays(ws)
    try {
      const { data, error } = await sb.rpc('get_week_schedule', { p_node_ids: locationIds, p_week_start: iso(ws), p_actor: person?.id || null })
      if (error) throw error
      const live = transformLiveRows(data, days, [])
      setCache(c => ({ ...c, [iso(ws)]: { schedule: live || {}, live: Array.isArray(data) && data.length > 0 } }))
    } catch {
      // drop the stale entry; the loader effect refetches and flags on error
      setCache(c => { const n = { ...c }; delete n[iso(ws)]; return n })
    }
  }, [locationIds.join(','), person?.id]) // eslint-disable-line

  /* live coverage-request overlay (best-effort; only shows when the row carries a date) */
  useEffect(() => {
    if (!locationIds || locationIds.length === 0) return
    sb.rpc('get_coverage_requests', { p_node_ids: locationIds }).then(({ data }) => {
      const rows = Array.isArray(data) ? data : []
      setCallouts(rows.map(r => ({
        name: r.employee_name || r.full_name || r.name || '',
        dateISO: (r.shift_date || r.date || r.request_date || '').slice(0, 10),
        location: r.node_name || r.location || '',
      })).filter(c => c.name))
    }).catch(() => setCallouts([]))
  }, [locationIds.join(',')])

  const calloutSet = useMemo(() => new Set(callouts.map(c => `${c.name}__${c.dateISO}`)), [callouts])

  // Managers/execs toggle called-out inline. The write goes to shift_exceptions
  // via mark_shift_callout / clear_shift_callout, then this week re-syncs from
  // the server — the Callout Tracker and forensics see the exact same record.
  const canEdit = /admin|owner|coo|ceo|cfo|president|chief|manager|hr|lead|supervisor/i.test(session?.person?.role_name || '')
  const toggleOut = useCallback(async (entry, date) => {
    if (!canEdit || busy || !entry?.shiftId) return
    setBusy(true)
    try {
      const { error } = entry.out
        ? await sb.rpc('clear_shift_callout', { p_shift_id: entry.shiftId })
        : await sb.rpc('mark_shift_callout', { p_shift_id: entry.shiftId, p_reason: 'Marked out — Coverage Monitor', p_reported_by: person?.id || null })
      if (error) throw error
      await refreshWeek(date)
    } catch (err) {
      console.error('[CoverageMonitor] callout toggle failed:', err)
      try { window.dispatchEvent(new CustomEvent('vip-toast', { detail: { msg: 'Callout not saved — ' + (err.message || 'server error'), type: 'error' } })) } catch (_) { /* non-browser */ }
    } finally { setBusy(false) }
  }, [canEdit, busy, person?.id, refreshWeek])

  // OUT = the shift's real exception (shift_exceptions) OR a dated coverage request.
  const isOut = useCallback((entry, dISO) => !!entry?.out || calloutSet.has(`${entry?.name}__${dISO}`), [calloutSet])

  const shownLocs = useMemo(() => {
    const sel = (fval.location || []).filter(l => locNames.includes(l))
    return sel.length ? locNames.filter(l => sel.includes(l)) : locNames
  }, [fval.location, locNames])

  /* staff for a specific calendar date, per location+shift — with filters applied */
  const staffForDate = useCallback((date) => {
    const ws = getWeekDays(date)[0]; const entry = cache[iso(ws)]
    const days = getWeekDays(date); const di = days.findIndex(d => isSameDay(d, date))
    const dISO = iso(date)
    const roleSel = fval.role || [], statusSel = fval.status || [], q = (fval.q || '').toLowerCase()
    const keep = (e) => {
      if (roleSel.length && !roleSel.includes(e.role)) return false
      if (q && !String(e.name || '').toLowerCase().includes(q)) return false
      if (statusSel.length && !statusSel.includes(isOut(e, dISO) ? 'out' : 'scheduled')) return false
      return true
    }
    const out = {}
    locNames.forEach(loc => { out[loc] = { AM: [], PM: [] } })
    if (entry && di !== -1) {
      locNames.forEach(loc => SHIFTS.forEach(sh => { out[loc][sh.id] = (entry.schedule?.[loc]?.[sh.id]?.[di] || []).filter(keep) }))
    }
    return out
  }, [cache, fval, isOut, locNames])

  const dataMode = useMemo(() => {
    const vals = Object.values(cache)
    if (vals.some(v => v.live)) return 'live schedule'
    if (vals.some(v => v.error)) return 'schedule service unavailable'
    return vals.length ? 'no published schedule' : ''
  }, [cache])

  /* prev / next stepping by view */
  const step = (dir) => {
    if (view === 'month') setAnchor(a => addMonths(a, dir))
    else if (view === 'week') setAnchor(a => addDays(a, dir * 7))
    else setAnchor(a => addDays(a, dir))
  }

  const printLabel = view === 'month'
    ? anchor.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    : view === 'week'
      ? `Week of ${getWeekDays(anchor)[0].toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
      : longDate(anchor)

  return (
    <div style={{ color: 'var(--t-text)', fontSize: 13 }}>
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #cov-print, #cov-print * { visibility: visible !important; }
          #cov-print { position: absolute; left: 0; top: 0; width: 100%; padding: 0; background: #fff !important; color: #000 !important; }
          #cov-print * { color: #000 !important; background: #fff !important; box-shadow: none !important; }
          #cov-print .cov-card, #cov-print table, #cov-print th, #cov-print td { border-color: #999 !important; }
          .cov-noprint { display: none !important; }
        }
      `}</style>

      {/* ── controls ── */}
      <div className="cov-noprint" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-.3px' }}>Coverage Monitor</div>
          <div style={{ fontSize: 12, color: 'var(--t-text-muted)', marginTop: 2 }}>
            All staff by location{dataMode ? ` · ${dataMode}` : ''}{loading ? ' · loading…' : ''}{busy ? ' · saving…' : ''}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          {/* view toggle */}
          <div style={{ display: 'flex', border: '1px solid var(--t-line)', overflow: 'hidden' }}>
            {VIEWS.map(v => (
              <button key={v.id} onClick={() => setView(v.id)} style={{
                padding: '6px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer', border: 'none',
                background: view === v.id ? 'var(--t-accent)' : 'var(--t-surface)',
                color: view === v.id ? 'var(--t-on-grad,#04212a)' : 'var(--t-text-muted)',
              }}>{v.label}</button>
            ))}
          </div>
          <button onClick={() => nav('/schedule-center')} style={{ ...btnS, fontWeight: 700 }} title="Open the Schedule Command Center to add / move / reassign shifts">✎ Open Scheduler</button>
          <button onClick={() => nav('/schedule-center', { state: { date: iso(anchor), action: 'coverage' } })} style={{ ...btnS, fontWeight: 700, background: 'var(--t-warn)', color: '#111', border: 'none' }} title="Jump into the coverage-request flow for this day">📣 Find Coverage</button>
          <button onClick={() => window.print()} style={{ ...btnS, background: 'var(--t-accent)', color: 'var(--t-on-grad,#04212a)', border: 'none' }}>🖨 Print</button>
        </div>
      </div>
      {canEdit && <div className="cov-noprint" style={{ fontSize: 11, color: 'var(--t-text-muted)', marginTop: -6, marginBottom: 10 }}>Tip: click any staff name to mark them <b>called out</b> (or clear it) — it saves to the real callout record, so the Callout Tracker and forensics update too. Use <b>Open Scheduler</b> to rearrange shifts.</div>}

      {/* ── date bar ── */}
      <div className="cov-noprint" style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <button onClick={() => step(-1)} style={btnS}>‹ Prev</button>
        <button onClick={() => setAnchor(new Date())} style={{ ...btnS, fontWeight: 700 }}>Today</button>
        <button onClick={() => step(1)} style={btnS}>Next ›</button>
        <input type="date" value={iso(anchor)} onChange={e => { const [y, m, dd] = e.target.value.split('-').map(Number); if (y) setAnchor(new Date(y, m - 1, dd)) }} style={{ ...selS, colorScheme: 'dark' }} />
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--t-accent)', marginLeft: 4 }}>{printLabel}</span>
      </div>

      {/* ── enterprise filters ── */}
      <div className="cov-noprint">
        <FilterBar filters={FILTERS} value={fval} onChange={(k, v) => setFval(s => ({ ...s, [k]: v }))} onClear={() => setFval({})} savedViewsKey="coverage-monitor" />
      </div>

      {/* ── printable report ── */}
      <div id="cov-print">
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 15, fontWeight: 900, letterSpacing: '.04em' }}>{companyName()} — Staff Coverage</div>
          <div style={{ fontSize: 12, color: 'var(--t-text-muted)' }}>{printLabel}{(fval.location && fval.location.length) ? ` · ${fval.location.join(', ')}` : ' · All Locations'}</div>
        </div>

        {view === 'day' && <DayView date={anchor} staffForDate={staffForDate} shownLocs={shownLocs} isOut={isOut} isToday={isSameDay(anchor, today)} toggleOut={toggleOut} canEdit={canEdit} busy={busy} nav={nav} />}
        {view === 'week' && <WeekView anchor={anchor} staffForDate={staffForDate} shownLocs={shownLocs} isOut={isOut} today={today} />}
        {view === 'month' && <MonthView anchor={anchor} staffForDate={staffForDate} shownLocs={shownLocs} today={today} onPick={(d) => { setAnchor(d); setView('day') }} />}
        {view === 'list' && <ListView date={anchor} staffForDate={staffForDate} shownLocs={shownLocs} isOut={isOut} />}
      </div>
    </div>
  )
}

/* ─────────── DAY VIEW (the live-coverage board) ─────────── */
function DayView({ date, staffForDate, shownLocs, isOut, isToday, toggleOut, canEdit, busy, nav }) {
  const dISO = iso(date)
  const staff = staffForDate(date)
  const dayCallouts = []
  shownLocs.forEach(loc => SHIFTS.forEach(sh => (staff[loc]?.[sh.id] || []).forEach(e => { if (isOut(e, dISO)) dayCallouts.push({ ...e, loc, shift: sh.id }) })))
  const findCoverage = (loc, shift) => nav && nav('/schedule-center', { state: { date: dISO, shift, location: loc, action: 'coverage' } })

  return (
    <div>
      {isToday && (
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.1em', color: 'var(--t-success)', textTransform: 'uppercase', marginBottom: 10 }}>● LIVE — TODAY</div>
      )}
      {dayCallouts.length > 0 && (
        <div className="cov-card" style={{ background: 'rgba(255,59,48,0.1)', border: '1px solid var(--t-danger)', padding: '10px 14px', marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--t-danger)' }}>⚠ {dayCallouts.length} CALLOUT{dayCallouts.length > 1 ? 'S' : ''} — COVERAGE REVIEW REQUIRED</div>
            {canEdit && nav && <button className="cov-noprint" onClick={() => findCoverage(dayCallouts[0].loc, dayCallouts[0].shift)} style={{ fontSize: 10, fontWeight: 800, padding: '4px 10px', background: 'var(--t-danger)', color: '#fff', border: 'none', cursor: 'pointer' }}>📣 Find Coverage Now</button>}
          </div>
          <div style={{ marginTop: 6, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {dayCallouts.map((c, i) => (
              <button key={i} onClick={() => findCoverage(c.loc, c.shift)} title={`Find coverage for ${c.name}'s ${c.shift} shift at ${c.loc}`}
                className="cov-noprint" style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', background: 'rgba(255,59,48,0.2)', color: 'var(--t-danger)', border: '1px solid var(--t-danger)', cursor: canEdit ? 'pointer' : 'default' }}>
                {c.name} · {c.loc} · {c.shift} 📣
              </button>
            ))}
          </div>
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.max(1, Math.min(shownLocs.length, 5))}, 1fr)`, gap: 12 }}>
        {shownLocs.length === 0 && (
          <div className="cov-card" style={{ border: '1px solid var(--t-line)', padding: '14px 16px', fontSize: 12, color: 'var(--t-text-faint)' }}>
            No locations in scope — sign in with location access to see coverage.
          </div>
        )}
        {shownLocs.map(loc => {
          const locCallouts = SHIFTS.flatMap(sh => (staff[loc]?.[sh.id] || []).filter(e => isOut(e, dISO)))
          const hasCallout = locCallouts.length > 0
          const totalStaff = SHIFTS.reduce((n, sh) => n + (staff[loc]?.[sh.id]?.length || 0), 0)
          return (
            <div key={loc} className="cov-card" style={{ background: 'var(--t-surface)', border: `1px solid ${hasCallout ? 'var(--t-danger)' : 'var(--t-line)'}`, overflow: 'hidden' }}>
              <div style={{ background: hasCallout ? 'rgba(255,59,48,0.08)' : 'var(--t-surface-2)', padding: '8px 12px', borderBottom: `1px solid ${hasCallout ? 'var(--t-danger)' : 'var(--t-line)'}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: '.05em' }}>{loc.toUpperCase()}</span>
                {hasCallout
                  ? <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--t-danger)' }}>⚠ {locCallouts.length} CALLOUT</span>
                  : <span style={{ fontSize: 10, fontWeight: 600, color: totalStaff ? 'var(--t-success)' : 'var(--t-text-faint)' }}>{totalStaff ? '● STAFFED' : '— NO SHIFTS'}</span>}
              </div>
              {SHIFTS.map((sh, si) => {
                const roster = staff[loc]?.[sh.id] || []
                const span = rosterSpan(roster)
                return (
                  <div key={sh.id} style={{ padding: '8px 12px', borderBottom: si === 0 ? `1px solid ${hasCallout ? 'var(--t-danger)' : 'var(--t-line)'}` : undefined }}>
                    <div style={{ fontSize: 9, fontWeight: 700, color: sh.color, letterSpacing: '.08em', marginBottom: 4 }}>{sh.label.toUpperCase()}{span ? ` · ${span}` : ''}</div>
                    {roster.length === 0 && <div style={{ fontSize: 10, color: 'var(--t-text-faint)' }}>—</div>}
                    {roster.map((emp, k) => {
                      const out = isOut(emp, dISO)
                      return (
                        <div key={(emp.shiftId || emp.name) + k} onClick={() => canEdit && !busy && toggleOut(emp, date)}
                          title={canEdit ? (out ? 'Click to clear callout' : 'Click to mark called out') : undefined}
                          className="cov-noprint-hover"
                          style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2, cursor: canEdit ? 'pointer' : 'default', padding: '1px 2px', opacity: busy ? 0.6 : 1 }}>
                          <span style={{ fontSize: 8, fontWeight: 700, padding: '1px 4px', borderRadius: 2, minWidth: out ? 44 : 34, textAlign: 'center',
                            background: out ? 'rgba(255,59,48,0.2)' : emp.role === 'KH' ? 'rgba(0,229,255,0.15)' : 'rgba(52,199,89,0.15)',
                            color: out ? 'var(--t-danger)' : emp.role === 'KH' ? 'var(--t-accent)' : 'var(--t-success)',
                            border: `1px solid ${out ? 'var(--t-danger)' : emp.role === 'KH' ? 'var(--t-accent)' : 'var(--t-success)'}` }}>{out ? 'OUT' : emp.role}</span>
                          <span style={{ fontSize: 11, fontWeight: 500, color: out ? 'var(--t-danger)' : 'var(--t-text)', textDecoration: out ? 'line-through' : 'none', opacity: out ? 0.75 : 1 }}>{emp.name}</span>
                          {emp.start && <span style={{ fontSize: 9, color: 'var(--t-text-faint)' }}>{emp.start}{emp.end ? `–${emp.end}` : ''}</span>}
                          {out && canEdit && nav && (
                            <button className="cov-noprint" onClick={(ev) => { ev.stopPropagation(); findCoverage(loc, sh.id) }} title={`Find coverage for ${emp.name}`}
                              style={{ marginLeft: 'auto', fontSize: 8, fontWeight: 800, padding: '1px 6px', background: 'var(--t-warn)', color: '#111', border: 'none', cursor: 'pointer', letterSpacing: '.04em' }}>📣 COVER</button>
                          )}
                          {canEdit && !out && <span style={{ marginLeft: 'auto', fontSize: 8, fontWeight: 800, color: 'var(--t-text-faint)', letterSpacing: '.04em' }}>MARK OUT</span>}
                          {canEdit && out && <span style={{ fontSize: 8, fontWeight: 800, color: 'var(--t-success)', letterSpacing: '.04em', marginLeft: 6 }}>↺ CLEAR</span>}
                        </div>
                      )
                    })}
                    {hasCallout && roster.some(e => isOut(e, dISO)) && (
                      <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--t-warn)' }}>⚠ COVERAGE NEEDED</span>
                        {canEdit && nav && (
                          <button className="cov-noprint" onClick={(e) => { e.stopPropagation(); nav('/schedule-center', { state: { date: dISO, shift: sh.id, location: loc, action: 'coverage' } }) }}
                            style={{ marginLeft: 'auto', fontSize: 9, fontWeight: 800, padding: '2px 7px', background: 'var(--t-warn)', color: '#111', border: 'none', cursor: 'pointer' }}>📣 Find Coverage</button>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ─────────── WEEK VIEW ─────────── */
function WeekView({ anchor, staffForDate, shownLocs, isOut, today }) {
  const days = getWeekDays(anchor)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {shownLocs.length === 0 && (
        <div className="cov-card" style={{ border: '1px solid var(--t-line)', padding: '14px 16px', fontSize: 12, color: 'var(--t-text-faint)' }}>
          No locations in scope — sign in with location access to see coverage.
        </div>
      )}
      {shownLocs.map(loc => (
        <div key={loc} className="cov-card" style={{ border: '1px solid var(--t-line)', overflow: 'hidden' }}>
          <div style={{ background: 'var(--t-surface-2)', padding: '8px 12px', fontSize: 12, fontWeight: 800, letterSpacing: '.05em', borderBottom: '1px solid var(--t-line)' }}>{loc.toUpperCase()}</div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
              <thead>
                <tr style={{ background: 'var(--t-surface)' }}>
                  <th style={{ ...thS, minWidth: 70 }}>Shift</th>
                  {days.map((d, i) => (
                    <th key={i} style={{ ...thS, background: isSameDay(d, today) ? 'rgba(0,229,255,0.1)' : undefined }}>
                      {d.toLocaleDateString('en-US', { weekday: 'short' })}<br /><span style={{ fontWeight: 500, color: 'var(--t-text-muted)' }}>{d.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' })}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {SHIFTS.map(sh => (
                  <tr key={sh.id}>
                    <td style={{ ...tdS, fontWeight: 700, color: sh.color }}>{sh.id}</td>
                    {days.map((d, i) => {
                      const roster = staffForDate(d)[loc]?.[sh.id] || []
                      return (
                        <td key={i} style={{ ...tdS, verticalAlign: 'top', background: isSameDay(d, today) ? 'rgba(0,229,255,0.05)' : undefined }}>
                          {roster.length === 0 ? <span style={{ color: 'var(--t-text-faint)' }}>—</span> : roster.map((e, k) => {
                            const out = isOut(e, iso(d))
                            return <div key={k} style={{ marginBottom: 2, color: out ? 'var(--t-danger)' : 'var(--t-text)', textDecoration: out ? 'line-through' : 'none' }}>
                              <span style={{ color: e.role === 'KH' ? 'var(--t-accent)' : 'var(--t-success)', fontWeight: 700, fontSize: 9 }}>{out ? 'OUT ' : e.role + ' '}</span>{e.name}
                            </div>
                          })}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  )
}

/* ─────────── MONTH VIEW ─────────── */
function MonthView({ anchor, staffForDate, shownLocs, today, onPick }) {
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1)
  const gridStart = getWeekDays(first)[0]
  const cells = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i))
  const month = anchor.getMonth()
  return (
    <div className="cov-card" style={{ border: '1px solid var(--t-line)' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)' }}>
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => (
          <div key={d} style={{ padding: '6px 8px', fontSize: 10, fontWeight: 800, color: 'var(--t-text-muted)', textAlign: 'center', background: 'var(--t-surface-2)', borderBottom: '1px solid var(--t-line)' }}>{d}</div>
        ))}
        {cells.map((d, i) => {
          const inMonth = d.getMonth() === month
          const staff = staffForDate(d)
          const count = shownLocs.reduce((n, loc) => n + SHIFTS.reduce((m, sh) => m + (staff[loc]?.[sh.id]?.length || 0), 0), 0)
          const isTd = isSameDay(d, today)
          return (
            <div key={i} onClick={() => onPick(d)} style={{
              minHeight: 74, padding: '6px 8px', borderRight: '1px solid var(--t-line)', borderBottom: '1px solid var(--t-line)',
              cursor: 'pointer', opacity: inMonth ? 1 : 0.4, background: isTd ? 'rgba(0,229,255,0.08)' : 'var(--t-surface)',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 12, fontWeight: isTd ? 800 : 600, color: isTd ? 'var(--t-accent)' : 'var(--t-text)' }}>{d.getDate()}</span>
                {isTd && <span style={{ fontSize: 8, fontWeight: 800, color: 'var(--t-accent)' }}>TODAY</span>}
              </div>
              {inMonth && count > 0 && (
                <div style={{ marginTop: 8 }}>
                  <div style={{ fontSize: 18, fontWeight: 800, lineHeight: 1, color: 'var(--t-text)' }}>{count}</div>
                  <div style={{ fontSize: 9, color: 'var(--t-text-muted)' }}>scheduled</div>
                </div>
              )}
            </div>
          )
        })}
      </div>
      <div style={{ padding: '8px 12px', fontSize: 10, color: 'var(--t-text-muted)' }}>Click any day to open its full coverage board.</div>
    </div>
  )
}

/* ─────────── LIST VIEW ─────────── */
function ListView({ date, staffForDate, shownLocs, isOut }) {
  const dISO = iso(date)
  const staff = staffForDate(date)
  const rows = []
  shownLocs.forEach(loc => SHIFTS.forEach(sh => (staff[loc]?.[sh.id] || []).forEach(e => rows.push({ loc, shift: sh, emp: e }))))
  rows.sort((a, b) => shownLocs.indexOf(a.loc) - shownLocs.indexOf(b.loc) || a.shift.id.localeCompare(b.shift.id) || (a.emp.role === b.emp.role ? 0 : a.emp.role === 'KH' ? -1 : 1))
  return (
    <div className="cov-card" style={{ border: '1px solid var(--t-line)', overflow: 'hidden' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr style={{ background: 'var(--t-surface-2)' }}>
            {['Location', 'Shift', 'Hours', 'Role', 'Employee', 'Status'].map(h => <th key={h} style={{ ...thS, textAlign: 'left' }}>{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && <tr><td colSpan={6} style={{ ...tdS, textAlign: 'center', color: 'var(--t-text-faint)' }}>No scheduled shifts for this date.</td></tr>}
          {rows.map((r, i) => {
            const out = isOut(r.emp, dISO)
            return (
              <tr key={i} style={{ borderTop: '1px solid var(--t-line)' }}>
                <td style={tdS}>{r.loc}</td>
                <td style={{ ...tdS, color: r.shift.color, fontWeight: 700 }}>{r.shift.id}</td>
                <td style={{ ...tdS, color: 'var(--t-text-muted)' }}>{r.emp.start ? `${r.emp.start} – ${r.emp.end || '—'}` : '—'}</td>
                <td style={{ ...tdS }}>{r.emp.role === 'KH' ? 'Key Holder' : 'Associate'}</td>
                <td style={{ ...tdS, fontWeight: 600, textDecoration: out ? 'line-through' : 'none', color: out ? 'var(--t-danger)' : 'var(--t-text)' }}>{r.emp.name}</td>
                <td style={{ ...tdS }}>{out ? <span style={{ color: 'var(--t-danger)', fontWeight: 700 }}>CALLED OUT</span> : <span style={{ color: 'var(--t-success)' }}>Scheduled</span>}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

/* ── shared inline styles ── */
const btnS = { padding: '6px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer', background: 'var(--t-surface)', color: 'var(--t-text-muted)', border: '1px solid var(--t-line)' }
const selS = { padding: '6px 8px', fontSize: 12, background: 'var(--t-surface)', color: 'var(--t-text)', border: '1px solid var(--t-line)' }
const thS = { padding: '7px 10px', fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--t-text-muted)', textAlign: 'center', borderBottom: '1px solid var(--t-line)' }
const tdS = { padding: '6px 10px', fontSize: 11, color: 'var(--t-text)' }
