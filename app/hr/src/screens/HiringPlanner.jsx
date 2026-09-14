// HiringPlanner.jsx — AI Staffing Planner (100% real data).
// Turns REAL scheduling coverage gaps into hiring requisitions. Every signal on
// this screen comes from a live RPC on the HR brain (fxetuqjryttnypgepsru, schema hr):
//   * get_coverage_gaps(node_ids, from, to)  — forward required-vs-scheduled gaps
//   * forensic_callouts(node_ids, from, to)   — historical callouts (chronic signal)
//   * get_coverage_requests(node_ids)         — unfilled coverage asks (demand)
//   * get_roster(node_ids, actor)             — current headcount per location/role
//   * get_job_postings(node_ids)              — real open requisitions (read)
//   * create_job_posting(...)                 — open a requisition (write)
// No localStorage-as-datastore, no seeded/mock generators, no Math.random, no
// fabricated "confidence". When there is no backing data the UI shows an honest
// empty state. Reads are scoped by useScope().locationIds; a hire requisition is
// a real row in public.job_postings, opened via create_job_posting then refreshed.
import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth.jsx'
import { useScope } from '../lib/scope.jsx'
import { sb } from '../lib/supabase'

const DAY_ABBR = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const KH_RX = /key|lead|manager|supervisor|assistant manager|keyholder/i
const COO_RX = /admin|owner|coo|ceo|cfo|president|chief|hr|manager/i

const toast = (msg, type = 'error') => {
  try { window.dispatchEvent(new CustomEvent('vip-toast', { detail: { msg, type } })) } catch { /* non-browser */ }
}

// ── date helpers ──────────────────────────────────────────────────────────────
const iso = d => d.toISOString().slice(0, 10)
const addDays = (d, n) => { const r = new Date(d); r.setDate(r.getDate() + n); return r }
const dowOf = s => { const d = new Date(String(s).slice(0, 10) + 'T00:00:00'); return Number.isNaN(d.getTime()) ? null : d.getDay() }
const isoWeek = s => { const d = new Date(String(s).slice(0, 10) + 'T00:00:00'); if (Number.isNaN(d.getTime())) return null; const day = (d.getDay() + 6) % 7; d.setDate(d.getDate() - day); return iso(d) }
const posOf = r => KH_RX.test(r || '') ? 'KH' : 'ASSOC'

// Normalize the various field names the coverage RPCs return.
const gapLoc  = g => g.node_name || g.location || g.node || ''
const gapDate = g => String(g.shift_date || g.date || '').slice(0, 10)
const gapSlot = g => g.shift_slot || g.slot || g.shift || ''
const gapRole = g => g.role || g.role_name || g.position || ''
const gapFilled = g => (g.status || '').toLowerCase() === 'filled'

const coLoc  = c => c.node || c.node_name || c.location || ''
const coDate = c => String(c.callout_date || c.date || c.shift_date || '').slice(0, 10)
const coSlot = c => c.shift_slot || c.slot || ''

const reqLoc = r => r.node_name || r.location || r.node || ''
const reqUnfilled = r => {
  if (Array.isArray(r.recipients) && r.recipients.length) return r.recipients.every(rc => (rc.status || '') !== 'approved')
  const s = (r.status || '').toLowerCase()
  return s === '' || s === 'open' || s === 'pending'
}

// ── the analysis (pure; operates only on real fetched arrays) ──────────────────
// Returns requisitions [{loc, pos, count, availability, severity, reason, pattern, chronic}]
function buildRecommendations({ gaps, callouts, requests, rosterByLoc, locationNames }) {
  const locs = new Set(locationNames)
  gaps.forEach(g => { const l = gapLoc(g); if (l) locs.add(l) })
  callouts.forEach(c => { const l = coLoc(c); if (l) locs.add(l) })
  requests.forEach(r => { const l = reqLoc(r); if (l) locs.add(l) })

  const recs = []
  locs.forEach(loc => {
    const locGaps = gaps.filter(g => gapLoc(g) === loc && !gapFilled(g))
    const locCallouts = callouts.filter(c => coLoc(c) === loc)
    const uncovered = locCallouts.filter(c => !c.covered)
    const shortStaffed = locCallouts.filter(c => c.short_staffed)
    const unfilledReq = requests.filter(r => reqLoc(r) === loc && reqUnfilled(r))

    const roster = rosterByLoc[loc] || []
    const khCount = roster.filter(e => e.pos === 'KH').length
    const assocCount = roster.filter(e => e.pos === 'ASSOC').length
    const noKeyHolder = roster.length > 0 && khCount === 0
    const unstaffed = roster.length === 0

    // Any real signal to act on?
    const openGaps = locGaps.length
    const generalNeed = openGaps > 0 || uncovered.length >= 2 || shortStaffed.length >= 2 || unfilledReq.length > 0
    if (!generalNeed && !noKeyHolder && !unstaffed) return

    // Chronic signal = distinct weeks in the callout window with a callout here.
    const weeks = new Set(locCallouts.map(c => isoWeek(coDate(c))).filter(Boolean))
    const chronic = weeks.size

    // Position: prefer role info from real gaps; else infer from roster composition.
    const khGapRole = locGaps.filter(g => KH_RX.test(gapRole(g))).length
    const assocGapRole = locGaps.filter(g => gapRole(g) && !KH_RX.test(gapRole(g))).length
    const position = (noKeyHolder || unstaffed || (khGapRole > 0 && khGapRole >= assocGapRole)) ? 'KH' : 'ASSOC'
    const posLabel = position === 'KH' ? 'Key Holder' : 'Associate'
    const headHere = position === 'KH' ? khCount : assocCount

    // Availability profile from the real (dow, slot) shape of gaps + uncovered callouts.
    const byDow = {}, bySlot = {}
    const addProfile = (d, s) => {
      const w = dowOf(d); if (w != null) byDow[w] = (byDow[w] || 0) + 1
      const slot = (s || '').toString().trim(); if (slot) bySlot[slot] = (bySlot[slot] || 0) + 1
    }
    locGaps.forEach(g => addProfile(gapDate(g), gapSlot(g)))
    uncovered.forEach(c => addProfile(coDate(c), coSlot(c)))
    const topDows = Object.entries(byDow).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([d]) => DAY_ABBR[+d]).filter(Boolean)
    const topSlots = Object.entries(bySlot).sort((a, b) => b[1] - a[1]).map(([s]) => s)
    const combos = Object.keys(byDow).length * Math.max(1, Object.keys(bySlot).length)
    const spread = combos >= 10 || (topDows.length === 0 && topSlots.length === 0)
    const availability = spread
      ? 'Open availability (flexible)'
      : `Available ${topDows.join('/') || 'flex'}${topSlots.length ? ` · ${topSlots.slice(0, 2).join(' & ')}` : ''}`

    // Bodies to hire: scale to the magnitude of real open gaps, min 1.
    const bodies = Math.max(1, Math.min(4, Math.ceil((openGaps + uncovered.length / 2) / 4) || 1))

    // Severity from real weighted counts.
    const severity =
      openGaps * 8 +
      uncovered.length * 3 +
      shortStaffed.length * 4 +
      unfilledReq.length * 5 +
      chronic * 4 +
      (position === 'KH' ? 10 : 0) +
      (unstaffed ? 30 : 0) +
      (noKeyHolder ? 14 : 0)

    const reasonBits = []
    if (unstaffed) reasonBits.push('no active staff assigned to this location')
    else if (noKeyHolder) reasonBits.push('no key holder currently staffed here')
    if (openGaps > 0) reasonBits.push(`${openGaps} open scheduling gap${openGaps === 1 ? '' : 's'} in the next 30 days`)
    if (uncovered.length > 0) reasonBits.push(`${uncovered.length} uncovered callout${uncovered.length === 1 ? '' : 's'} recently`)
    if (shortStaffed.length > 0) reasonBits.push(`${shortStaffed.length} short-staffed shift${shortStaffed.length === 1 ? '' : 's'}`)
    if (unfilledReq.length > 0) reasonBits.push(`${unfilledReq.length} unfilled coverage request${unfilledReq.length === 1 ? '' : 's'}`)
    reasonBits.push(`current ${posLabel} headcount here: ${headHere}`)

    recs.push({
      id: `req-${loc}-${position}`.replace(/[^a-z0-9-]/gi, ''),
      loc, pos: position, count: bodies, availability,
      severity, chronic, openGaps,
      reason: reasonBits.join(' · '),
      pattern: spread ? 'Widespread shortage' : `Concentrated: ${topDows.join('/') || 'flex'} ${topSlots[0] || ''}`.trim(),
    })
  })
  recs.sort((a, b) => b.severity - a.severity)
  return recs
}

const st = {
  wrap: { padding: '24px 28px', color: 'var(--t-text)', minHeight: '100vh', background: 'var(--t-bg)' },
  h1: { fontSize: 20, fontWeight: 800, letterSpacing: '.05em', margin: 0, textTransform: 'uppercase' },
  sub: { fontSize: 11, color: 'var(--t-text-muted)', marginTop: 3, maxWidth: 720 },
  btn: { fontSize: 12, fontWeight: 800, padding: '9px 16px', background: 'var(--t-accent)', border: 'none', color: '#04121a', cursor: 'pointer', letterSpacing: '.04em' },
  ghost: { fontSize: 11, fontWeight: 600, padding: '7px 12px', background: 'var(--t-surface)', border: '1px solid var(--t-line)', color: 'var(--t-text-muted)', cursor: 'pointer' },
  kpiRow: { display: 'flex', gap: 10, flexWrap: 'wrap', margin: '18px 0' },
  kpi: { background: 'var(--t-surface)', border: '1px solid var(--t-line)', borderTop: '3px solid var(--t-accent)', padding: '14px 18px', flex: 1, minWidth: 140 },
  kpiLabel: { fontSize: 10, fontWeight: 700, letterSpacing: '.1em', color: 'var(--t-text-muted)', textTransform: 'uppercase', marginBottom: 8 },
  kpiVal: { fontSize: 26, fontWeight: 800, lineHeight: 1 },
  card: { background: 'var(--t-surface)', border: '1px solid var(--t-line)', padding: 16, marginBottom: 12 },
  badge: (pos) => ({ fontSize: 9, fontWeight: 800, padding: '2px 6px', marginRight: 6, color: pos === 'KH' ? 'var(--t-warn)' : 'var(--t-accent)', border: `1px solid ${pos === 'KH' ? 'var(--t-warn)' : 'var(--t-accent)'}` }),
  label: { fontSize: 10, fontWeight: 700, letterSpacing: '.08em', color: 'var(--t-text-muted)', textTransform: 'uppercase' },
}

function sevColor(s) { return s >= 40 ? 'var(--t-danger)' : s >= 20 ? 'var(--t-warn)' : 'var(--t-accent)' }
function sevLabel(s) { return s >= 40 ? 'CRITICAL' : s >= 20 ? 'HIGH' : 'MODERATE' }

export default function HiringPlanner() {
  const nav = useNavigate()
  const { session } = useAuth()
  const { locationIds, locations } = useScope()
  const person = session?.person || {}
  const canManage = COO_RX.test(person.role_name || '')

  // location name ↔ node id map (real org nodes from the session scope)
  const nameToId = useMemo(() => {
    const m = {}; (locations || []).forEach(l => { if (l?.name) m[l.name] = l.id }); return m
  }, [locations])

  const [gaps, setGaps] = useState([])
  const [callouts, setCallouts] = useState([])
  const [requests, setRequests] = useState([])
  const [rosterByLoc, setRosterByLoc] = useState({})
  const [postings, setPostings] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    if (!Array.isArray(locationIds) || locationIds.length === 0) { setLoading(false); return }
    setLoading(true); setError(null)
    const today = new Date()
    const from = iso(addDays(today, -90))
    const to = iso(addDays(today, 30))
    const args = { p_node_ids: locationIds }
    const [gRes, cRes, rRes, roRes, jpRes] = await Promise.allSettled([
      sb.rpc('get_coverage_gaps', { ...args, p_date_from: iso(today), p_date_to: to }),
      sb.rpc('forensic_callouts', { ...args, p_date_from: from, p_date_to: to }),
      sb.rpc('get_coverage_requests', args),
      sb.rpc('get_roster', { ...args, p_actor: person.id || null }),
      sb.rpc('get_job_postings', args),
    ])

    const ok = res => res.status === 'fulfilled' && !res.value?.error && Array.isArray(res.value?.data)
    const val = res => (ok(res) ? res.value.data : [])

    setGaps(val(gRes))
    setCallouts(val(cRes))
    setRequests(val(rRes))
    setPostings(val(jpRes))

    const roster = val(roRes)
    const by = {}; const seen = new Set()
    roster.filter(p => p.id && !seen.has(p.id) && seen.add(p.id)).forEach(p => {
      const loc = p.node_name || p.location || ''
      if (!loc) return
      ;(by[loc] = by[loc] || []).push({ id: p.id, name: p.full_name, pos: posOf(p.role_name), loc })
    })
    setRosterByLoc(by)

    // Only a hard failure of EVERY read is an error; partial data still renders honestly.
    const anyOk = [gRes, cRes, rRes, roRes, jpRes].some(ok)
    if (!anyOk) setError('Could not reach the staffing data service. Please retry.')
    setLoading(false)
  }, [JSON.stringify(locationIds), person.id])

  useEffect(() => { load() }, [load])

  const recs = useMemo(
    () => buildRecommendations({ gaps, callouts, requests, rosterByLoc, locationNames: (locations || []).map(l => l.name).filter(Boolean) }),
    [gaps, callouts, requests, rosterByLoc, locations]
  )

  const openPostings = useMemo(
    () => (Array.isArray(postings) ? postings : []).filter(p => (p.status || 'open').toLowerCase() === 'open'),
    [postings]
  )
  const openGapCount = useMemo(() => gaps.filter(g => !gapFilled(g)).length, [gaps])

  const openReq = useCallback(async (r) => {
    const nodeId = nameToId[r.loc]
    if (!nodeId) { toast(`No org-node id for "${r.loc}" — cannot open a requisition here.`); return }
    setBusy(true)
    const title = r.pos === 'KH' ? 'Key Holder' : 'Sales Associate'
    const { error: err } = await sb.rpc('create_job_posting', {
      p_node_id: nodeId,
      p_title: title,
      p_description: r.reason,
      p_dept: r.pos === 'KH' ? 'Store Leadership' : 'Store Operations',
      p_employment_type: r.pos === 'KH' ? 'Full-Time' : 'Part-Time',
      p_openings: r.count,
    })
    setBusy(false)
    if (err) { toast(`Requisition not opened — ${err.message || 'write failed'}.`); return }
    toast(`Requisition opened: ${r.count}× ${title} — ${r.loc}.`, 'success')
    await load()
    nav('/recruiting')
  }, [nameToId, load, nav])

  return (
    <div style={st.wrap}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={st.h1}>AI Staffing Planner</h1>
          <div style={st.sub}>Turns your real coverage gaps, callout history and unfilled coverage requests into hiring plans — what to hire, where, and with what availability. Chronic shortages (recurring callouts) rise to the top automatically.</div>
        </div>
        <button style={{ ...st.ghost, ...(loading ? { opacity: 0.6 } : {}) }} onClick={load} disabled={loading}>{loading ? 'Analyzing…' : '↻ Refresh Analysis'}</button>
      </div>

      <div style={st.kpiRow}>
        <div style={st.kpi}><div style={st.kpiLabel}>Recommended Hires</div><div style={st.kpiVal}>{recs.length}</div></div>
        <div style={{ ...st.kpi, borderTopColor: 'var(--t-danger)' }}><div style={st.kpiLabel}>Critical Needs</div><div style={{ ...st.kpiVal, color: recs.some(r => r.severity >= 40) ? 'var(--t-danger)' : 'var(--t-text)' }}>{recs.filter(r => r.severity >= 40).length}</div></div>
        <div style={{ ...st.kpi, borderTopColor: 'var(--t-warn)' }}><div style={st.kpiLabel}>Open Coverage Gaps</div><div style={st.kpiVal}>{openGapCount}</div></div>
        <div style={{ ...st.kpi, borderTopColor: 'var(--t-success)' }}><div style={st.kpiLabel}>Open Requisitions</div><div style={st.kpiVal}>{openPostings.length}</div></div>
      </div>

      {error && <div style={{ ...st.card, borderLeft: '3px solid var(--t-danger)', color: 'var(--t-danger)', fontWeight: 700 }}>{error}</div>}

      {loading && <div style={{ ...st.card, textAlign: 'center', color: 'var(--t-text-muted)' }}>Analyzing live coverage, callout and roster data…</div>}

      {!loading && !error && recs.length === 0 && (
        <div style={{ ...st.card, color: 'var(--t-success)', fontWeight: 700 }}>✓ No hiring gaps detected — coverage is healthy across your locations. No open gaps, uncovered callouts or unfilled coverage requests in the current window.</div>
      )}

      {!loading && recs.map(r => (
        <div key={r.id} style={{ ...st.card, borderLeft: `3px solid ${sevColor(r.severity)}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10 }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 800 }}>
                Hire {r.count} {r.pos === 'KH' ? 'Key Holder' : 'Associate'}{r.count > 1 ? 's' : ''} — {r.loc}
              </div>
              <div style={{ fontSize: 12, color: 'var(--t-accent)', fontWeight: 700, marginTop: 4 }}>
                <span style={st.badge(r.pos)}>{r.pos}</span>{r.availability}
              </div>
              <div style={{ fontSize: 11, color: 'var(--t-text-muted)', marginTop: 6, lineHeight: 1.5 }}>{r.reason}</div>
              {r.chronic > 2 && <div style={{ fontSize: 10, color: 'var(--t-warn)', fontWeight: 700, marginTop: 4 }}>📈 Chronic — callouts recorded across {r.chronic} distinct weeks here.</div>}
            </div>
            <div style={{ textAlign: 'right' }}>
              <span style={{ fontSize: 10, fontWeight: 800, padding: '3px 8px', color: '#fff', background: sevColor(r.severity) }}>{sevLabel(r.severity)}</span>
              <div style={{ fontSize: 10, color: 'var(--t-text-faint)', marginTop: 4 }}>{r.pattern}</div>
            </div>
          </div>
          {canManage && (
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button style={{ ...st.btn, ...(busy ? { opacity: 0.6 } : {}) }} onClick={() => openReq(r)} disabled={busy}>Open Requisition → Recruiting</button>
              <button style={st.ghost} onClick={() => nav('/coverage')}>View gaps in Coverage</button>
            </div>
          )}
        </div>
      ))}

      {openPostings.length > 0 && (
        <div style={{ ...st.card, marginTop: 8 }}>
          <div style={{ ...st.label, marginBottom: 8 }}>Open requisitions ({openPostings.length})</div>
          {openPostings.slice(0, 12).map(p => (
            <div key={p.id} style={{ fontSize: 12, padding: '7px 0', borderBottom: '1px solid var(--t-line)', display: 'flex', justifyContent: 'space-between', gap: 12 }}>
              <span><span style={st.badge(KH_RX.test(p.title || '') ? 'KH' : 'ASSOC')}>{KH_RX.test(p.title || '') ? 'KH' : 'ASSOC'}</span>{p.openings || 1}× {p.title} — {p.location || '—'}</span>
              <span style={{ fontSize: 10, color: 'var(--t-text-faint)', whiteSpace: 'nowrap' }}>{p.created_at ? new Date(p.created_at).toLocaleDateString() : ''}</span>
            </div>
          ))}
          <div style={{ marginTop: 10 }}>
            <button style={st.ghost} onClick={() => nav('/recruiting')}>Open Recruiting Board →</button>
          </div>
        </div>
      )}
    </div>
  )
}
