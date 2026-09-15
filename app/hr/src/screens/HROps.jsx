// HROps.jsx — People & Compliance Command. 100% real data (2026-07-17 rewire).
// Every number, list and action on this screen traces to a live RPC on the HR
// brain (fxetuqjryttnypgepsru, schema hr). No mock arrays, no seeded generators, no
// Math.random, no localStorage-as-datastore. When a value has no backing row the
// UI shows an honest '—' / empty state.
//
// Reads (Promise.allSettled on load, scoped by useScope().locationIds):
//   get_roster · scope_shifts · get_all_time_entries · get_attendance_overview
//   get_disciplinary_actions · get_pending_requests · get_current_wages
//   get_coverage_gaps · get_swap_board · get_shift_broadcasts · hr_dashboard
//   forensic_callouts
// Writes (each followed by a server refresh):
//   update_employee_wage · post_shift_broadcast · create_disciplinary_action
//   resolve_disciplinary_action · log_callout · set_callout_coverage
//   log_on_call_attempt · post_open_shift · review_shift_claim
import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { sb } from '../lib/supabase'
import { useAuth } from '../lib/auth.jsx'
import { useScope } from '../lib/scope.jsx'
import DrillDown from '../components/DrillDown.jsx'
import { companyName } from '../lib/config.js'

/* ─────────────────── helpers & constants ─────────────────── */
const isHR = r => ['ceo','hr','manager','coo','admin','owner'].some(x=>(r||'').toLowerCase().includes(x))
const fmtPct = n => n == null ? '—' : `${Math.round(n||0)}%`
const fmt$   = n => n == null ? '—' : `$${parseFloat(n||0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}`
const today  = () => new Date().toISOString().slice(0,10)
const addDays = (iso, n) => { const d = new Date(`${iso}T00:00:00`); d.setDate(d.getDate()+n); return d.toISOString().slice(0,10) }
function weekStart(){ const d=new Date(); d.setDate(d.getDate()-d.getDay()); d.setHours(0,0,0,0); return d.toISOString().slice(0,10) }
const parseHM = t => { if (!t) return null; const [h,m]=String(t).split(':'); return (+h)+(+(m||0))/60 }
const hhmm = t => { if (!t) return '—'; const [h,m]=String(t).split(':'); const H=+h; return `${H%12||12}:${m||'00'}${H>=12?'p':'a'}` }
const tsTime = ts => ts ? new Date(ts).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'}) : '—'
const normName = s => String(s||'').trim().toLowerCase()
const isoDate = s => String(s||'').slice(0,10)
const titleize = s => String(s||'').replace(/[_-]+/g,' ').replace(/\b\w/g,c=>c.toUpperCase()).trim()
const fmtDay = iso => iso ? new Date(`${iso}T00:00:00`).toLocaleDateString('en-US',{weekday:'short',month:'numeric',day:'numeric'}) : '—'
const toast = (msg, type='success') => { try { window.dispatchEvent(new CustomEvent('vip-toast',{detail:{msg,type}})) } catch {/* non-browser */} }

const DA_COLORS = {
  'verbal_warning':'var(--t-accent)',
  'written_warning':'var(--t-warn)',
  'final_warning':'var(--t-danger)',
  'termination':'#8b0000',
  'suspension':'#8b0000',
  'resolved':'var(--t-success)',
}
const daColor = (type, status) => status === 'resolved' ? 'var(--t-success)' : (DA_COLORS[String(type||'').toLowerCase()] || 'var(--t-warn)')

/* ─────────────────── real-data model builder ─────────────────── */
// Every field below is derived from a live RPC payload — nothing fabricated.
function buildModel({ roster, shifts, punches, overview, das, pending, wages, gaps, swap, broadcasts, hrDash, callouts, locations }) {
  const todayS = today()
  const wkS = weekStart()
  const d30 = addDays(todayS, -30)
  const now = new Date()
  const nowH = now.getHours() + now.getMinutes()/60

  const locList = (locations || []).map(l => ({ id: l.id, name: l.name }))
  const nodeNameById = {}; locList.forEach(l => { nodeNameById[l.id] = l.name })

  /* raw roster → status counts (active/leave/terminated) */
  const rawRoster = Array.isArray(roster) ? roster.filter(p => p && p.id) : []
  const statusOf = p => {
    const s = String(p.status || '').toLowerCase()
    if (s) return s === 'on_leave' ? 'leave' : s === 'inactive' ? 'terminated' : s
    return p.is_active === false ? 'terminated' : 'active'
  }
  const active     = rawRoster.filter(p => statusOf(p) === 'active').length
  const onLeave    = rawRoster.filter(p => statusOf(p) === 'leave').length
  const terminated = rawRoster.filter(p => statusOf(p) === 'terminated').length

  /* people we operate on = not terminated */
  const people = rawRoster.filter(p => statusOf(p) !== 'terminated')

  /* wages — latest per person (get_current_wages) */
  const wageBy = {}
  ;(Array.isArray(wages) ? wages : []).forEach(w => { if (w && w.person_id && w.wage != null) wageBy[w.person_id] = Number(w.wage) })

  /* time punches — hours this week, today's punch, clocked-in-now */
  const punchRows = Array.isArray(punches) ? punches : []
  const hoursWk = {}, todayPunch = {}, inNow = new Set()
  for (const te of punchRows) {
    const pid = te.person_id
    if (!pid || !te.punched_in_at) continue
    const start = new Date(te.punched_in_at)
    const end   = te.punched_out_at ? new Date(te.punched_out_at) : now
    hoursWk[pid] = (hoursWk[pid] || 0) + Math.max(0, (end - start) / 3600000)
    if (isoDate(te.work_date || te.punched_in_at) === todayS) {
      if (!todayPunch[pid] || new Date(todayPunch[pid].punched_in_at) > start) todayPunch[pid] = te
      if (!te.punched_out_at) inNow.add(pid)
    }
  }

  /* attendance incidents (get_attendance_overview) → 30d counts + today flags */
  const incBy = {}
  for (const r of (Array.isArray(overview) ? overview : [])) {
    const pid = r.person_id; if (!pid) continue
    const rec = incBy[pid] = { callouts_30d:0, lates_30d:0, ncns_30d:0, calloutToday:false, ncnsToday:false, tardyToday:false }
    for (const inc of (r.incidents || [])) {
      if (inc.expired) continue
      const dt = isoDate(inc.date)
      if (dt >= d30) {
        if (inc.type === 'callout') rec.callouts_30d++
        else if (inc.type === 'tardy') rec.lates_30d++
        else if (inc.type === 'ncns') rec.ncns_30d++
      }
      if (dt === todayS) {
        if (inc.type === 'callout') rec.calloutToday = true
        if (inc.type === 'ncns')    rec.ncnsToday = true
        if (inc.type === 'tardy')   rec.tardyToday = true
      }
    }
  }

  /* disciplinary (get_disciplinary_actions) — open = not resolved */
  const daRows = Array.isArray(das) ? das : []
  const isOpenDa = r => String(r.status || '').toLowerCase() !== 'resolved'
  const openDaRows = daRows.filter(isOpenDa)
  const openDaByPid = {}, openDaByName = {}
  openDaRows.forEach(r => {
    if (r.person_id) openDaByPid[r.person_id] = (openDaByPid[r.person_id]||0) + 1
    openDaByName[normName(r.person_name)] = (openDaByName[normName(r.person_name)]||0) + 1
  })
  const openDAsDisplay = openDaRows.map(r => ({
    id: r.id,
    person_id: r.person_id || null,
    node_id: r.node_id || null,
    employee: r.person_name || '—',
    location: r.node_name || '—',
    type: titleize(r.type) || 'Disciplinary Action',
    typeRaw: r.type || '',
    status: String(r.status || 'open').toLowerCase(),
    issuedBy: r.issued_by_name || r.issued_by || '—',
    date: isoDate(r.issued_date || r.date) || '—',
    stage: titleize(r.status) || 'Active',
    dueDate: isoDate(r.follow_up_date) || '—',
    description: r.description || '',
  })).sort((a,b) => String(b.date).localeCompare(String(a.date)))

  /* enriched active employees — every field traces to a real row */
  const emps = people.map(p => {
    const i = incBy[p.id] || {}
    const hoursWeek = hoursWk[p.id] != null ? +(hoursWk[p.id].toFixed(2)) : 0
    return {
      id: p.id, person_id: p.id,
      full_name: p.full_name || 'Unknown',
      role: p.role_name || '—',
      location: p.node_name || '—',
      node_id: p.node_id || null,
      phone: p.phone || null,
      status: statusOf(p),
      callouts30d: i.callouts_30d || 0,
      lates30d: i.lates_30d || 0,
      ncns30d: i.ncns_30d || 0,
      hoursWeek,
      otRisk: hoursWeek >= 36,
      wage: wageBy[p.id] ?? null,
      openDAs: openDaByPid[p.id] ?? openDaByName[normName(p.full_name)] ?? 0,
    }
  })
  const empById = {}; emps.forEach(e => { empById[e.id] = e })
  const empByName = {}; emps.forEach(e => { empByName[normName(e.full_name)] = e })

  /* today's callouts / no-shows (forensic_callouts) — carry exception_id for writes */
  const calloutRows = (Array.isArray(callouts) ? callouts : []).map(r => {
    const emp = (r.employee_id && empById[r.employee_id]) || empByName[normName(r.employee)] || null
    return {
      exception_id: r.exception_id,
      person_id: r.employee_id || emp?.id || null,
      full_name: r.employee || emp?.full_name || 'Unknown',
      location: r.node || emp?.location || '—',
      node_id: r.node_id || emp?.node_id || null,
      role: emp?.role || '—',
      shift: r.shift_slot || '—',
      date: isoDate(r.callout_date),
      exceptionType: r.exception_type,
      todayStatus: r.exception_type === 'no_show' ? 'ncns' : 'called-out',
      calloutReason: r.exception_type === 'no_show' ? 'No-Call No-Show' : (r.reason || 'Not given'),
      covered: !!r.covered,
      coveredBy: r.covered_by || null,
      phone: emp?.phone || null,
      callouts30d: emp?.callouts30d ?? 0,
      isKH: /key|manager|lead|super/i.test(emp?.role || ''),
    }
  })
  const calloutsTodayRows = calloutRows.filter(r => r.date === todayS)
  const calledOutList = calloutsTodayRows.filter(r => r.todayStatus === 'called-out')
  const ncnsList      = calloutsTodayRows.filter(r => r.todayStatus === 'ncns')
  const outPersonIds  = new Set(calloutsTodayRows.map(r => r.person_id).filter(Boolean))

  /* today's shifts (scope_shifts) → live board rows */
  const allShifts = Array.isArray(shifts) ? shifts : []
  const shiftsToday = allShifts.filter(s => isoDate(s.shift_date) === todayS)
  const boardRows = shiftsToday.filter(s => s.person_id || s.full_name).map((s, idx) => {
    const emp = (s.person_id && empById[s.person_id]) || empByName[normName(s.full_name)] || null
    const pid = emp?.id || s.person_id || null
    const location = nodeNameById[s.node_id] || s.node_name || emp?.location || '—'
    const st = parseHM(s.start_time), en = parseHM(s.end_time)
    const started = st != null && nowH >= st
    const ended   = en != null && nowH >= en
    const flags = (pid && incBy[pid]) || {}
    const punch = pid ? todayPunch[pid] : null
    const clockedNow = pid ? inNow.has(pid) : false

    let todayStatus
    if (flags.ncnsToday || (pid && ncnsList.some(n => n.person_id === pid)))          todayStatus = 'ncns'
    else if (flags.calloutToday || (pid && calledOutList.some(c => c.person_id===pid))) todayStatus = 'called-out'
    else if (clockedNow || punch) todayStatus = ended && punch ? 'off' : 'clocked-in'
    else if (started && !ended && st != null && (nowH - st) > 0.25) todayStatus = 'late'
    else if (started && ended) todayStatus = 'off'
    else todayStatus = 'upcoming'

    let hrsToday = null
    if (punch && punch.punched_in_at) {
      const endT = punch.punched_out_at ? new Date(punch.punched_out_at) : now
      const el = (endT - new Date(punch.punched_in_at)) / 3600000
      if (el > 0) hrsToday = el.toFixed(1)
    }
    const hoursWeek = emp?.hoursWeek ?? 0
    return {
      key: `${s.node_id||'n'}-${pid||s.full_name||idx}-${s.start_time||idx}`,
      id: pid || `row-${idx}`,
      person_id: pid,
      exception_id: (calloutsTodayRows.find(c => c.person_id === pid) || {}).exception_id || null,
      full_name: emp?.full_name || s.full_name || 'Unassigned',
      role: emp?.role || s.role_name || '—',
      location,
      node_id: s.node_id || emp?.node_id || null,
      shift: (s.start_time || s.end_time) ? `${hhmm(s.start_time)}–${hhmm(s.end_time)}` : '—',
      todayStatus,
      clockedInAt: punch ? tsTime(punch.punched_in_at) : null,
      hrsToday,
      hoursWeek,
      otRisk: hoursWeek >= 36,
      phone: emp?.phone || null,
      calloutReason: (calloutsTodayRows.find(c => c.person_id === pid) || {}).calloutReason || null,
    }
  })
  const STATUS_ORDER = { 'ncns':0, 'called-out':1, 'late':2, 'clocked-in':3, 'upcoming':4, 'off':5 }
  boardRows.sort((a,b) => (STATUS_ORDER[a.todayStatus] ?? 9) - (STATUS_ORDER[b.todayStatus] ?? 9))

  const lateList = boardRows.filter(r => r.todayStatus === 'late')
  const todayScheduled = boardRows.filter(r => r.todayStatus !== 'off').length
  const todayClocked   = boardRows.filter(r => r.todayStatus === 'clocked-in').length

  /* coverage pool for a called-out person: active key holders not out today */
  const coveragePool = (emp) => emps.filter(e =>
    e.id !== emp.person_id &&
    /key|manager|lead|super/i.test(e.role) &&
    !outPersonIds.has(e.id)
  ).slice(0, 6)

  /* week KPIs — real */
  const weekCallouts = calloutRows.filter(r => r.date >= wkS && r.exceptionType !== 'no_show').length
  const weekNcns     = calloutRows.filter(r => r.date >= wkS && r.exceptionType === 'no_show').length
  const weekOtHrs    = +(emps.filter(e=>e.hoursWeek>40).reduce((s,e)=>s+(e.hoursWeek-40),0).toFixed(1))
  const otRiskCount  = emps.filter(e=>e.hoursWeek>=36 && e.hoursWeek<40).length
  const coverageGaps = calledOutList.filter(r => r.isKH && !r.covered).length + ncnsList.filter(r => r.isKH).length

  /* coverage gaps + open shift postings (get_coverage_gaps + get_swap_board) */
  const gapRows = (Array.isArray(gaps) ? gaps : []).filter(g => (g.status || '') !== 'filled')
  const swapPostings = Array.isArray(swap) ? swap : []
  const openShiftRows = swapPostings.filter(p => (p.status || 'open') === 'open').map(p => ({
    id: p.id, node_id: p.node_id,
    location: p.node || nodeNameById[p.node_id] || '—',
    date: isoDate(p.shift_date),
    shift: (p.start_time || p.end_time) ? `${hhmm(p.start_time)}–${hhmm(p.end_time)}` : '—',
    note: p.note || '',
    volunteers: Array.isArray(p.volunteers) ? p.volunteers : [],
  }))
  const openSlots = openShiftRows.length + gapRows.length
  /* pending volunteer claims across the swap board = "swap requests" */
  const swapClaims = []
  openShiftRows.forEach(os => (os.volunteers || []).forEach(v => {
    if (String(v.status||'pending').toLowerCase() === 'pending')
      swapClaims.push({ claim_id: v.claim_id, name: v.name, person_id: v.person_id, location: os.location, date: os.date, shift: os.shift })
  }))

  /* PTO pending (get_pending_requests) */
  const pendingPTO = Array.isArray(pending?.time_off) ? pending.time_off.length : (Array.isArray(pending) ? pending.length : 0)

  /* broadcasts (get_shift_broadcasts) — real acknowledgment metrics */
  const bcRows = Array.isArray(broadcasts) ? broadcasts : []
  const ackBroadcasts = bcRows.filter(b => b.requires_ack).map(b => ({
    id: b.id, title: b.title, kind: b.kind, priority: b.priority,
    total: Number(b.total_recipients||0), acks: Number(b.ack_count||0), reads: Number(b.read_count||0),
    ackRate: b.total_recipients ? Math.round((Number(b.ack_count||0)/Number(b.total_recipients))*100) : null,
    created: isoDate(b.created_at),
  }))
  const recentBroadcasts = bcRows.slice(0, 8).map(b => ({
    id: b.id, title: b.title, priority: b.priority, kind: b.kind,
    to: Array.isArray(b.target_locations) ? b.target_locations.join(', ') : (Array.isArray(b.target_roles)? b.target_roles.join(', ') : 'All'),
    by: b.sender_name || '—', date: isoDate(b.created_at),
  }))

  /* hr_dashboard aggregates (training / docs) */
  const hr = hrDash && typeof hrDash === 'object' && !Array.isArray(hrDash) ? hrDash : {}
  const headcount = emps.length
  const trainingComplete = hr.training_complete != null ? Number(hr.training_complete) : null
  const trainingPct = (headcount>0 && trainingComplete != null) ? Math.round((trainingComplete/headcount)*100) : null
  const trainingGap  = (headcount>0 && trainingComplete != null) ? Math.max(0, headcount - trainingComplete) : null
  const docsPendingAck = hr.docs_pending_ack != null ? Number(hr.docs_pending_ack) : null

  /* per-location stats — all real */
  const locStats = locList.map(l => {
    const locEmps = emps.filter(e => e.node_id === l.id || e.location === l.name)
    const locRows = boardRows.filter(r => r.node_id === l.id || r.location === l.name)
    const scheduled = locRows.filter(r => r.todayStatus !== 'off').length
    const clocked   = locRows.filter(r => r.todayStatus === 'clocked-in').length
    const callouts  = calloutsTodayRows.filter(r => r.node_id === l.id || r.location === l.name).length
    const withWage  = locEmps.filter(e => e.wage != null)
    const topIssue  = ncnsList.some(r => r.location === l.name) ? 'NCNS'
                    : calledOutList.some(r => r.location === l.name) ? 'Callout'
                    : locRows.some(r => r.todayStatus === 'late') ? 'Late Staff' : 'On Track'
    return {
      name: l.name, node_id: l.id,
      headcount: locEmps.length,
      active: locEmps.filter(e => e.status === 'active').length,
      highRisk: locEmps.filter(e => e.callouts30d>=3 || e.openDAs>0).length,
      avgWage: withWage.length ? withWage.reduce((s,e)=>s+e.wage,0)/withWage.length : null,
      openDAs: openDaRows.filter(r => r.node_id === l.id || (r.node_name||'') === l.name).length,
      calloutsToday: callouts,
      coveragePct: scheduled ? Math.round((clocked/scheduled)*100) : null,
      topIssue,
    }
  })

  /* recent HR activity feed — real events only */
  const recentActions = []
  openDAsDisplay.slice(0,6).forEach(r => recentActions.push({
    id:`da-${r.id}`, type:'DA Issued', employee:r.employee, location:r.location, date:r.date,
    severity: /final|termination|suspension/i.test(r.typeRaw) ? 'critical' : 'high', detail:r.type }))
  calloutsTodayRows.forEach((r,i) => recentActions.push({
    id:`co-${r.exception_id||i}`, type: r.todayStatus==='ncns'?'NCNS Flagged':'Callout', employee:r.full_name, location:r.location,
    date:r.date, severity: r.todayStatus==='ncns'?'critical':'high', detail:r.calloutReason }))
  recentBroadcasts.slice(0,4).forEach(b => recentActions.push({
    id:`bc-${b.id}`, type:'Announcement Sent', employee:b.by, location:b.to, date:b.date, severity:'low', detail:b.title }))
  recentActions.sort((a,b) => String(b.date).localeCompare(String(a.date)))

  /* pending action items — only categories with a real backing count */
  const pendingItems = []
  if (pendingPTO > 0)               pendingItems.push({ id:'pi-pto', category:'PTO', count:pendingPTO, urgency:'normal', label:'PTO Requests Awaiting Approval' })
  if (openDaRows.length > 0)        pendingItems.push({ id:'pi-da', category:'DA', count:openDaRows.length, urgency:'red', label:'Open Disciplinary Actions' })
  if (docsPendingAck != null && docsPendingAck > 0) pendingItems.push({ id:'pi-doc', category:'Policy', count:docsPendingAck, urgency:'amber', label:'Documents Pending Acknowledgment' })
  if (trainingGap != null && trainingGap > 0)       pendingItems.push({ id:'pi-train', category:'Training', count:trainingGap, urgency:'amber', label:'Training Non-Compliant Employees' })
  if (swapClaims.length > 0)        pendingItems.push({ id:'pi-swap', category:'Coverage', count:swapClaims.length, urgency:'amber', label:'Open-Shift Volunteers Awaiting Approval' })

  /* weekly staffing grid — real shifts grouped by node + day */
  const weekDays = Array.from({length:7}, (_,i) => addDays(wkS, i))
  const gridByLoc = {}
  locList.forEach(l => { gridByLoc[l.id] = {}; weekDays.forEach(dt => { gridByLoc[l.id][dt] = { emps:[], open:0 } }) })
  allShifts.forEach(s => {
    const dt = isoDate(s.shift_date)
    if (!gridByLoc[s.node_id] || !gridByLoc[s.node_id][dt]) return
    if (s.person_id || s.full_name) gridByLoc[s.node_id][dt].emps.push({ name: s.full_name || (empById[s.person_id]?.full_name) || 'Staff', role: s.role_name || '' })
    else gridByLoc[s.node_id][dt].open++
  })

  const complianceRate = headcount>0 && trainingComplete != null
    ? Math.round((emps.filter(e=>e.openDAs===0 && e.ncns30d===0).length/headcount)*100) : null

  return {
    headcount, active, onLeave, terminated,
    emps, boardRows,
    todayScheduled, todayClocked,
    calledOutList, ncnsList, lateList, coverageGaps, coveragePool,
    weekCallouts, weekNcns, weekOtHrs, otRiskCount, openSlots, pendingPTO,
    openDAsDisplay, openDaCount: openDaRows.length,
    atLimit: emps.filter(e => e.callouts30d + e.lates30d >= 4),
    openShiftRows, gapRows, swapClaims,
    locStats, recentActions, pendingItems,
    ackBroadcasts, recentBroadcasts,
    weekDays, gridByLoc, locList,
    trainingPct, trainingGap, docsPendingAck, complianceRate,
  }
}

/* ─────────────────── sub-components ─────────────────── */
function KTile({label,value,sub,color,alert,names,onClick}) {
  return (
    <div onClick={onClick} style={{
      background:'var(--t-surface)',
      border:`1px solid ${alert==='red'?'var(--t-danger)':alert==='amber'?'var(--t-warn)':'var(--t-line)'}`,
      padding:'14px 16px',cursor:onClick?'pointer':'default',position:'relative',overflow:'hidden',
    }}>
      {alert==='red'  && <div style={{position:'absolute',top:0,left:0,right:0,height:2,background:'var(--t-danger)'}}/>}
      {alert==='amber'&& <div style={{position:'absolute',top:0,left:0,right:0,height:2,background:'var(--t-warn)'}}/>}
      <div style={{fontSize:10,fontWeight:700,letterSpacing:'.08em',color:'var(--t-text-muted)',textTransform:'uppercase',marginBottom:6}}>{label}</div>
      <div style={{fontSize:24,fontWeight:800,color:color||'var(--t-text)',lineHeight:1,marginBottom:4}}>{value}</div>
      {sub && <div style={{fontSize:11,color:'var(--t-text-faint)'}}>{sub}</div>}
      {names && names.map(n=>(
        <div key={n} style={{fontSize:9,color:alert==='red'?'var(--t-danger)':'var(--t-warn)',marginTop:2}}>{n}</div>
      ))}
    </div>
  )
}

function SectionLabel({children}) {
  return <div style={{fontSize:11,fontWeight:700,letterSpacing:'.1em',color:'var(--t-accent)',textTransform:'uppercase',marginBottom:10}}>{children}</div>
}

function StatusBadge({status}) {
  const MAP = {
    'clocked-in': {label:'✅ Clocked In',  bg:'var(--t-success)',        text:'#000'},
    'called-out': {label:'🔴 Called Out',  bg:'var(--t-danger)',         text:'#fff'},
    'ncns':       {label:'🚫 No-Show',     bg:'#8b0000',                 text:'#fff'},
    'late':       {label:'⏰ Late',         bg:'var(--t-warn)',           text:'#000'},
    'upcoming':   {label:'🕐 Upcoming',    bg:'var(--t-surface-2)',      text:'var(--t-text-muted)'},
    'off':        {label:'✅ Off Today',   bg:'transparent',             text:'var(--t-text-faint)'},
  }
  const s = MAP[status] || MAP['upcoming']
  return (
    <span style={{fontSize:10,fontWeight:700,padding:'3px 8px',borderRadius:4,background:s.bg,color:s.text,whiteSpace:'nowrap'}}>
      {s.label}
    </span>
  )
}

function SmBtn({children,color,onClick,disabled}) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      fontSize:10,fontWeight:700,padding:'3px 8px',cursor:disabled?'default':'pointer',
      background:'transparent',border:`1px solid ${color||'var(--t-line)'}`,
      color:color||'var(--t-text)',borderRadius:3,whiteSpace:'nowrap',opacity:disabled?.5:1,
    }}>{children}</button>
  )
}

/* ─────────────────── main component ─────────────────── */
export default function HROps() {
  const nav = useNavigate()
  const { session } = useAuth()
  const { locationIds, locations } = useScope()
  const person = session?.person
  const personId = person?.id || null
  const role   = person?.role_name || ''
  const canEdit = isHR(role)

  const [tab, setTab] = useState('daily-ops')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)
  const [drill, setDrill] = useState(null)

  /* wage tab */
  const [compSearch,  setCompSearch]  = useState('')
  const [compFilter,  setCompFilter]  = useState('all')
  const [wageEmp,     setWageEmp]     = useState('')
  const [newWage,     setNewWage]     = useState('')
  const [wageNote,    setWageNote]    = useState('')
  const [wageSuccess, setWageSuccess] = useState(false)

  /* announcement tab */
  const [announcementText, setAnnouncementText] = useState('')
  const [annLocation,      setAnnLocation]      = useState('all')
  const [annRole,          setAnnRole]          = useState('all')
  const [annSending,       setAnnSending]       = useState(false)
  const [annSent,          setAnnSent]          = useState(false)

  /* daily ops interaction state */
  const [expandedCell, setExpandedCell] = useState(null)
  const [busy,         setBusy]         = useState({})   // { [key]: true } while an action is in-flight

  const load = useCallback(async () => {
    const nodeIds = locationIds || []
    setLoading(true); setLoadError(null)
    if (!nodeIds.length) { setData(null); setLoading(false); return }
    const todayS = today(), wkS = weekStart()
    try {
      const results = await Promise.allSettled([
        sb.rpc('get_roster',               { p_node_ids: nodeIds, p_actor: personId }),                       // 0
        sb.rpc('scope_shifts',             { p_node_ids: nodeIds, p_actor: personId }),                       // 1
        sb.rpc('get_all_time_entries',     { p_node_ids: nodeIds, p_date_from: wkS, p_date_to: todayS }),     // 2
        sb.rpc('get_attendance_overview',  { p_node_ids: nodeIds }),                                          // 3
        sb.rpc('get_disciplinary_actions', { p_node_ids: nodeIds }),                                          // 4
        sb.rpc('get_pending_requests',     { p_node_ids: nodeIds }),                                          // 5
        sb.rpc('get_current_wages',        { p_node_ids: nodeIds }),                                          // 6
        sb.rpc('get_coverage_gaps',        { p_node_ids: nodeIds, p_date_from: todayS, p_date_to: todayS }),  // 7
        sb.rpc('get_swap_board',           { p_node_ids: nodeIds }),                                          // 8
        sb.rpc('get_shift_broadcasts',     { p_person_id: personId, p_node_ids: nodeIds }),                   // 9
        sb.rpc('hr_dashboard',             { p_node_ids: nodeIds }),                                          // 10
        sb.rpc('forensic_callouts',        { p_node_ids: nodeIds, p_date_from: wkS, p_date_to: todayS }),     // 11
      ])
      const val = i => {
        const r = results[i]
        return (r.status === 'fulfilled' && r.value && !r.value.error) ? r.value.data : null
      }
      const rosterFailed = !(results[0].status === 'fulfilled' && !results[0].value?.error)
      const shiftsFailed = !(results[1].status === 'fulfilled' && !results[1].value?.error)
      if (rosterFailed && shiftsFailed) {
        const err = results[0].status === 'fulfilled' ? results[0].value?.error : results[0].reason
        throw new Error(err?.message || 'Roster and schedule reads failed')
      }
      const fc = val(11)
      setData(buildModel({
        roster:     val(0) || [],
        shifts:     val(1) || [],
        punches:    val(2) || [],
        overview:   val(3) || [],
        das:        val(4) || [],
        pending:    val(5) || {},
        wages:      val(6) || [],
        gaps:       val(7) || [],
        swap:       val(8) || [],
        broadcasts: val(9) || [],
        hrDash:     val(10) || {},
        callouts:   Array.isArray(fc?.callouts) ? fc.callouts : (Array.isArray(fc) ? fc : []),
        locations:  locations || [],
      }))
    } catch (e) {
      setData(null)
      setLoadError(e?.message || 'Failed to load HR Operations data')
    }
    setLoading(false)
  }, [locationIds.join(','), personId, locations])

  useEffect(()=>{ load() },[load])

  const withBusy = async (key, fn) => {
    if (busy[key]) return
    setBusy(p => ({ ...p, [key]: true }))
    try { await fn() } finally { setBusy(p => { const n = { ...p }; delete n[key]; return n }) }
  }

  /* ── write handlers (all real) ──────────────────────────────── */
  const submitWageChange = () => withBusy('wage', async () => {
    if (!wageEmp || !newWage) return
    const { error } = await sb.rpc('update_employee_wage', { p_person_id: wageEmp, p_wage: parseFloat(newWage), p_note: wageNote, p_changed_by: personId })
    if (error) { toast('Wage change not saved: ' + error.message, 'error'); return }
    toast('Wage change saved to history.')
    setWageSuccess(true); setTimeout(()=>setWageSuccess(false),3000)
    setWageEmp(''); setNewWage(''); setWageNote('')
    load()
  })

  const sendAnnouncement = () => withBusy('ann', async () => {
    const body = announcementText.trim()
    if (!body) return
    setAnnSending(true)
    const p_node_ids = annLocation === 'all' ? null : [annLocation]
    const p_role_names = annRole === 'all' ? null : [annRole]
    const title = body.length > 60 ? body.slice(0, 57) + '…' : body
    const { data: res, error } = await sb.rpc('post_shift_broadcast', {
      p_author_id: personId, p_title: title, p_body: body,
      p_priority: 'FYI', p_node_ids, p_role_names,
    })
    setAnnSending(false)
    if (error || (res && res.ok === false)) { toast('Announcement not sent: ' + (error?.message || res?.error || 'unknown'), 'error'); return }
    toast('Announcement broadcast to staff.')
    setAnnSent(true); setTimeout(()=>setAnnSent(false),3000)
    setAnnouncementText('')
    load()
  })

  const askToCover = (emp, coverEmp) => withBusy(`cover-${emp.person_id}-${coverEmp.id}`, async () => {
    // Log the coverage request, then (if we have the callout's exception) mark it covered.
    await sb.rpc('log_on_call_attempt', { p_person_id: coverEmp.id, p_outcome: 'called', p_called_by: personId, p_note: `Coverage for ${emp.full_name}` })
    if (emp.exception_id) {
      const { error } = await sb.rpc('set_callout_coverage', { p_exception_id: emp.exception_id, p_swap_person_id: coverEmp.id })
      if (error) { toast('Coverage not saved: ' + error.message, 'error'); return }
    }
    toast(`${coverEmp.full_name} asked to cover ${emp.full_name}.`)
    load()
  })

  const logCallout = (emp, type) => withBusy(`log-${emp.person_id}-${type}`, async () => {
    if (!emp.person_id) { toast('Cannot log — no employee record linked.', 'error'); return }
    const { error } = await sb.rpc('log_callout', {
      p_person_id: emp.person_id, p_exception_type: type,
      p_callout_reason: type === 'no_show' ? null : (emp.calloutReason || null),
      p_reported_by: personId, p_node_ids: locationIds,
    })
    if (error) { toast('Not logged: ' + error.message, 'error'); return }
    toast(type === 'no_show' ? 'NCNS logged to attendance record.' : 'Callout logged to attendance record.')
    load()
  })

  const issueDA = (emp) => withBusy(`da-${emp.person_id}`, async () => {
    if (!emp.person_id || !emp.node_id) { toast('Cannot issue — employee/location missing.', 'error'); return }
    const { error } = await sb.rpc('create_disciplinary_action', {
      p_person_id: emp.person_id, p_node_id: emp.node_id,
      p_type: 'verbal_warning',
      p_description: `Attendance — ${emp.calloutReason || emp.todayStatus || 'incident'} on ${today()}`,
      p_issued_by_id: personId,
    })
    if (error) { toast('DA not saved: ' + error.message, 'error'); return }
    toast(`Disciplinary action opened for ${emp.full_name}.`)
    load()
  })

  const resolveDA = (da) => withBusy(`resolve-${da.id}`, async () => {
    const { error } = await sb.rpc('resolve_disciplinary_action', { p_da_id: da.id, p_manager_id: personId })
    if (error) { toast('Not resolved: ' + error.message, 'error'); return }
    toast(`Disciplinary action for ${da.employee} resolved.`)
    load()
  })

  const reviewSwapClaim = (claim, action) => withBusy(`swap-${claim.claim_id}`, async () => {
    const { error } = await sb.rpc('review_shift_claim', { p_claim_id: claim.claim_id, p_action: action, p_reviewer_id: personId })
    if (error) { toast('Not saved: ' + error.message, 'error'); return }
    toast(`Swap ${action} for ${claim.name}.`)
    load()
  })

  const postOpenShift = (gap) => withBusy(`open-${gap.node_id}-${gap.date}`, async () => {
    if (!gap.node_id) { toast('Cannot post — location missing.', 'error'); return }
    const { error } = await sb.rpc('post_open_shift', { p_node_id: gap.node_id, p_date: gap.date || today(), p_note: gap.note || null })
    if (error) { toast('Open shift not posted: ' + error.message, 'error'); return }
    toast('Open shift posted to the swap board.')
    load()
  })

  const filteredEmps = useMemo(()=> {
    const list = data?.emps || []
    return list.filter(e=>{
      if (compSearch && !e.full_name.toLowerCase().includes(compSearch.toLowerCase())) return false
      if (compFilter==='ot' && e.hoursWeek<40) return false
      if (compFilter==='below_min' && !(e.wage != null && e.wage<16)) return false
      if (compFilter==='high_wage' && !(e.wage != null && e.wage>=20)) return false
      if (compFilter==='ot_risk' && !e.otRisk) return false
      return true
    })
  },[data,compSearch,compFilter])

  if (!canEdit) return (
    <div style={{padding:40,textAlign:'center',color:'var(--t-text-muted)'}}>
      <div style={{fontSize:48,marginBottom:16}}>🔒</div>
      <div style={{fontSize:18,fontWeight:700,color:'var(--t-text)'}}>HR Operations — Restricted</div>
      <div style={{fontSize:13,marginTop:8}}>Manager access required.</div>
    </div>
  )

  if (loading) return <div className="loader">Loading HR Operations…</div>

  if (loadError) return (
    <div style={{padding:40,textAlign:'center',color:'var(--t-text-muted)'}}>
      <div style={{fontSize:40,marginBottom:12}}>⚠</div>
      <div style={{fontSize:16,fontWeight:700,color:'var(--t-text)'}}>Couldn’t load HR Operations</div>
      <div style={{fontSize:13,marginTop:8}}>{loadError}</div>
      <button onClick={load} style={{marginTop:16,background:'var(--t-accent)',color:'#000',border:'none',padding:'8px 20px',fontSize:13,fontWeight:700,cursor:'pointer'}}>Retry</button>
    </div>
  )

  if (!data) return (
    <div style={{padding:40,textAlign:'center',color:'var(--t-text-muted)'}}>
      <div style={{fontSize:40,marginBottom:12}}>🗂️</div>
      <div style={{fontSize:16,fontWeight:700,color:'var(--t-text)'}}>No location in scope</div>
      <div style={{fontSize:13,marginTop:8}}>Select a location to view HR operations.</div>
    </div>
  )

  const d = data
  const {
    calledOutList, ncnsList, lateList, boardRows, coverageGaps, locStats,
    openDAsDisplay, openShiftRows, gapRows, swapClaims, weekDays, gridByLoc, locList,
  } = d

  /* ── Forensic drill-down columns ── */
  const EMP_COLS = [
    { key:'full_name', label:'Employee', value: e => e.full_name },
    { key:'location',  label:'Location', value: e => e.location },
    { key:'role',      label:'Role',     value: e => e.role },
    { key:'todayStatus', label:'Status', value: e => e.todayStatus || '—' },
    { key:'hoursWeek', label:'Hrs/Wk',   value: e => e.hoursWeek!=null?`${e.hoursWeek}h`:'—', align:'right', sortKey: e => e.hoursWeek||0 },
    { key:'phone',     label:'Phone',    value: e => e.phone || '—' },
  ]
  const OT_COLS = [
    { key:'full_name', label:'Employee', value: e => e.full_name },
    { key:'location',  label:'Location', value: e => e.location },
    { key:'role',      label:'Role',     value: e => e.role },
    { key:'hoursWeek', label:'Hours This Week', value: e => `${e.hoursWeek}h`, align:'right', sortKey: e => e.hoursWeek },
    { key:'otHrs',     label:'OT Hours', value: e => `${Math.max(0,e.hoursWeek-40)}h`, align:'right', sortKey: e => Math.max(0,e.hoursWeek-40) },
    { key:'wage',      label:'Wage',     value: e => e.wage!=null?`$${e.wage.toFixed(2)}`:'—', align:'right', sortKey: e => e.wage||0 },
  ]
  const CO_COLS = [
    { key:'full_name', label:'Employee', value: r => r.full_name },
    { key:'location',  label:'Location', value: r => r.location },
    { key:'role',      label:'Role',     value: r => r.role },
    { key:'shift',     label:'Shift',    value: r => r.shift },
    { key:'calloutReason', label:'Reason', value: r => r.calloutReason },
    { key:'covered',   label:'Covered',  value: r => r.covered ? `Yes — ${r.coveredBy||''}` : 'No' },
  ]
  const drillEmps = (title, rows, cols=EMP_COLS, accent='var(--t-accent)') => setDrill({
    title, subtitle:`${rows.length} record${rows.length===1?'':'s'}`, columns:cols, rows, accent,
  })

  /* ──────────────────────────────────────────────────────── */
  return (
    <div style={{display:'flex',flexDirection:'column',gap:0}}>

      {/* ── HEADER ──────────────────────────────────────────── */}
      <div style={{background:'var(--t-surface)',borderBottom:'1px solid var(--t-line)',padding:'16px 24px',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
        <div>
          <div style={{fontSize:11,color:'var(--t-accent)',fontWeight:700,letterSpacing:'.1em',textTransform:'uppercase',marginBottom:4}}>HR Operations</div>
          <div style={{fontSize:20,fontWeight:800,color:'var(--t-text)'}}>People & Compliance Command</div>
        </div>
        <div style={{display:'flex',gap:8,flexWrap:'wrap',justifyContent:'flex-end'}}>
          {ncnsList.length > 0 && <span className="badge red" style={{fontSize:10}}>{ncnsList.length} NCNS</span>}
          {calledOutList.length > 0 && <span className="badge red" style={{fontSize:10}}>{calledOutList.length} Called Out</span>}
          {coverageGaps > 0 && <span className="badge red" style={{fontSize:10}}>{coverageGaps} KH Gap</span>}
          {d.pendingItems.filter(p=>p.urgency==='red').map(p=>(
            <span key={p.id} className="badge red" style={{fontSize:10}}>{p.count} {p.category}</span>
          ))}
          {d.pendingItems.filter(p=>p.urgency==='amber').map(p=>(
            <span key={p.id} className="badge amber" style={{fontSize:10}}>{p.count} {p.category}</span>
          ))}
        </div>
      </div>

      {/* ═══ KPI PANEL — 3 ROWS ═══ */}
      <div style={{padding:'20px 24px',borderBottom:'1px solid var(--t-line)',background:'#080d18'}}>

        {/* ROW 1 — TODAY */}
        <SectionLabel>TODAY — LIVE STATUS</SectionLabel>
        <div style={{display:'grid',gridTemplateColumns:'repeat(6,1fr)',gap:8,marginBottom:16}}>
          <KTile label="On Shift Now" value={`${d.todayClocked}/${d.todayScheduled}`} sub="clocked in / scheduled"
            color={d.todayClocked >= d.todayScheduled ? 'var(--t-success)' : 'var(--t-warn)'}
            onClick={()=>drillEmps('Scheduled Today', boardRows.filter(e=>e.todayStatus!=='off'), EMP_COLS)}/>
          <KTile label="Clocked In" value={d.todayClocked} sub="as of now" color="var(--t-success)"
            alert={d.todayClocked < d.todayScheduled ? 'amber' : null}
            onClick={()=>drillEmps('Clocked In Now', boardRows.filter(e=>e.todayStatus==='clocked-in'), EMP_COLS, 'var(--t-success)')}/>
          <KTile label="Called Out" value={calledOutList.length} sub="today"
            color={calledOutList.length>0?'var(--t-danger)':'var(--t-text-muted)'} alert={calledOutList.length>0?'red':null}
            names={calledOutList.slice(0,3).map(e=>`${e.full_name} · ${e.location} · ${e.role}`)}
            onClick={()=>drillEmps('Called Out Today', calledOutList, CO_COLS, 'var(--t-danger)')}/>
          <KTile label="No-Show (NCNS)" value={ncnsList.length} sub="no contact made"
            color={ncnsList.length>0?'var(--t-danger)':'var(--t-text-muted)'} alert={ncnsList.length>0?'red':null}
            names={ncnsList.slice(0,3).map(e=>`${e.full_name} · ${e.location} · ${e.role}`)}
            onClick={()=>drillEmps('No-Call No-Show Today', ncnsList, CO_COLS, 'var(--t-danger)')}/>
          <KTile label="Late Today" value={lateList.length} sub={lateList.length>0?'clocked in past start':'all on time'}
            color={lateList.length>0?'var(--t-warn)':'var(--t-text-muted)'} alert={lateList.length>0?'amber':null}
            names={lateList.slice(0,3).map(e=>`${e.full_name} · ${e.location}`)}
            onClick={()=>drillEmps('Late Today', lateList, EMP_COLS, 'var(--t-warn)')}/>
          <KTile label="Coverage Gaps" value={coverageGaps} sub={coverageGaps>0?'key holder roles uncovered':'fully covered'}
            color={coverageGaps>0?'var(--t-danger)':'var(--t-success)'} alert={coverageGaps>0?'red':null}
            onClick={()=>drillEmps('Key Holder Coverage Gaps', [...calledOutList,...ncnsList].filter(e=>e.isKH), CO_COLS, 'var(--t-danger)')}/>
        </div>

        {/* ROW 2 — THIS WEEK */}
        <SectionLabel>THIS WEEK</SectionLabel>
        <div style={{display:'grid',gridTemplateColumns:'repeat(6,1fr)',gap:8,marginBottom:16}}>
          <KTile label="Callouts This Week" value={d.weekCallouts} sub="Sun–today"
            color={d.weekCallouts>3?'var(--t-danger)':'var(--t-warn)'} alert={d.weekCallouts>3?'red':d.weekCallouts>0?'amber':null}
            onClick={()=>drillEmps('Employees With Callouts (30d)', d.emps.filter(e=>e.callouts30d>0).sort((a,b)=>b.callouts30d-a.callouts30d), [...EMP_COLS.slice(0,3), {key:'callouts30d',label:'Callouts (30d)',value:e=>e.callouts30d,align:'right',sortKey:e=>e.callouts30d}], 'var(--t-danger)')}/>
          <KTile label="NCNS This Week" value={d.weekNcns} sub="no-call no-show"
            color={d.weekNcns>0?'var(--t-danger)':'var(--t-text-muted)'} alert={d.weekNcns>0?'red':null}
            onClick={()=>drillEmps('No-Call No-Show (this week)', ncnsList, CO_COLS, 'var(--t-danger)')}/>
          <KTile label="OT Hours Logged" value={`${d.weekOtHrs}h`} sub="above 40h threshold"
            color={d.weekOtHrs>20?'var(--t-warn)':'var(--t-text)'} alert={d.weekOtHrs>20?'amber':null}
            onClick={()=>drillEmps('Employees Logging Overtime (40h+)', d.emps.filter(e=>e.hoursWeek>40).sort((a,b)=>b.hoursWeek-a.hoursWeek), OT_COLS, 'var(--t-warn)')}/>
          <KTile label="At OT Risk" value={d.otRiskCount} sub="within 4h of 40"
            color={d.otRiskCount>3?'var(--t-warn)':'var(--t-text-muted)'} alert={d.otRiskCount>3?'amber':null}
            names={d.emps.filter(e=>e.otRisk&&e.hoursWeek<40).slice(0,2).map(e=>`${e.full_name} — ${e.hoursWeek}h`)}
            onClick={()=>drillEmps('At OT Risk (36–39h)', d.emps.filter(e=>e.otRisk&&e.hoursWeek<40).sort((a,b)=>b.hoursWeek-a.hoursWeek), OT_COLS, 'var(--t-warn)')}/>
          <KTile label="PTO Pending" value={d.pendingPTO} sub="awaiting approval"
            color={d.pendingPTO>0?'var(--t-warn)':'var(--t-text-muted)'} alert={d.pendingPTO>3?'amber':null}
            onClick={()=>nav('/requests')}/>
          <KTile label="Open Shift Slots" value={d.openSlots} sub="unfilled / posted"
            color={d.openSlots>2?'var(--t-danger)':d.openSlots>0?'var(--t-warn)':'var(--t-success)'} alert={d.openSlots>2?'red':d.openSlots>0?'amber':null}
            onClick={()=>setTab('staffing')}/>
        </div>

        {/* ROW 3 — LOCATION COMPARISON */}
        <SectionLabel>LOCATION COMPARISON — TODAY</SectionLabel>
        {locStats.length === 0 ? (
          <div style={{fontSize:12,color:'var(--t-text-faint)'}}>No locations in scope.</div>
        ) : (
        <div style={{display:'grid',gridTemplateColumns:`repeat(${Math.min(4,Math.max(1,locStats.length))},1fr)`,gap:8}}>
          {locStats.map(ls=>(
            <div key={ls.node_id||ls.name} title="Click to drill into records"
              onClick={()=>drillEmps(`${ls.name} — Staff On Roster`, d.emps.filter(e=>e.node_id===ls.node_id||e.location===ls.name), EMP_COLS)}
              style={{background:'var(--t-surface)',border:`1px solid ${ls.calloutsToday>0?'var(--t-danger)':(ls.coveragePct!=null&&ls.coveragePct<80)?'var(--t-warn)':'var(--t-line)'}`,padding:'14px 16px',position:'relative',overflow:'hidden',cursor:'pointer'}}>
              {ls.calloutsToday > 0 && <div style={{position:'absolute',top:0,left:0,right:0,height:2,background:'var(--t-danger)'}}/>}
              <div style={{fontSize:10,fontWeight:700,letterSpacing:'.08em',color:'var(--t-text-muted)',textTransform:'uppercase',marginBottom:6}}>{ls.name}</div>
              <div style={{fontSize:24,fontWeight:800,color:ls.coveragePct==null?'var(--t-text-muted)':ls.coveragePct>=90?'var(--t-success)':ls.coveragePct>=70?'var(--t-warn)':'var(--t-danger)',lineHeight:1,marginBottom:4}}>
                {ls.coveragePct==null?'—':`${ls.coveragePct}%`}
              </div>
              <div style={{fontSize:11,color:'var(--t-text-faint)',marginBottom:4}}>coverage today · {ls.headcount} staff</div>
              {ls.calloutsToday > 0 && (
                <div style={{fontSize:9,color:'var(--t-danger)',fontWeight:700}}>{ls.calloutsToday} callout{ls.calloutsToday>1?'s':''} today</div>
              )}
              <div style={{fontSize:9,color:ls.topIssue==='On Track'?'var(--t-success)':'var(--t-warn)',marginTop:2,fontWeight:600}}>{ls.topIssue}</div>
            </div>
          ))}
        </div>
        )}
      </div>

      {/* ── TABS ── */}
      <div style={{display:'flex',borderBottom:'1px solid var(--t-line)',background:'var(--t-surface)',padding:'0 24px',overflowX:'auto'}}>
        {[
          {k:'daily-ops',   l:'Daily Ops'},
          {k:'staffing',    l:'Staffing Overview'},
          {k:'disciplinary',l:`Disciplinary (${d.openDaCount})`},
          {k:'overview',    l:'Overview'},
          {k:'pending',     l:`Action Items (${d.pendingItems.reduce((s,p)=>s+p.count,0)})`},
          {k:'payroll',     l:'Wage & Payroll'},
          {k:'announcements',l:'Announcements'},
          {k:'compliance',  l:'Compliance'},
        ].map(({k,l})=>(
          <button key={k} onClick={()=>setTab(k)} style={{
            padding:'10px 18px',border:'none',background:'none',cursor:'pointer',fontFamily:'inherit',
            borderBottom:tab===k?'2px solid var(--t-accent)':'2px solid transparent',
            color:tab===k?'var(--t-text)':'var(--t-text-muted)',
            fontSize:12,fontWeight:tab===k?700:500,letterSpacing:'.06em',textTransform:'uppercase',whiteSpace:'nowrap',
          }}>{l}</button>
        ))}
      </div>

      <div style={{padding:'20px 24px',display:'flex',flexDirection:'column',gap:20}}>

        {/* ═══ DAILY OPS TAB ═══ */}
        {tab==='daily-ops' && (
          <div style={{display:'flex',flexDirection:'column',gap:20}}>

            {/* COVERAGE NEEDED */}
            {[...calledOutList, ...ncnsList].length > 0 && (
              <div style={{display:'flex',flexDirection:'column',gap:10}}>
                <SectionLabel>COVERAGE NEEDED — {[...calledOutList,...ncnsList].length} OPEN SITUATION{[...calledOutList,...ncnsList].length>1?'S':''}</SectionLabel>
                {[...calledOutList,...ncnsList].map(emp=>{
                  const pool = d.coveragePool(emp)
                  return (
                    <div key={emp.exception_id||emp.person_id} style={{background:'var(--t-surface)',border:'1px solid var(--t-danger)',padding:'16px 20px'}}>
                      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:12}}>
                        <div>
                          <div style={{fontSize:13,fontWeight:800,color:'var(--t-danger)'}}>
                            {emp.todayStatus==='ncns'?'🚫 NCNS — NO-CALL NO-SHOW':'🔴 CALLED OUT — COVERAGE NEEDED'}
                          </div>
                          <div style={{fontSize:14,fontWeight:700,color:'var(--t-text)',marginTop:2}}>
                            {emp.full_name} <span style={{color:'var(--t-text-muted)',fontWeight:400}}>— {emp.role}</span>
                          </div>
                          <div style={{fontSize:12,color:'var(--t-text-muted)',marginTop:2}}>
                            {emp.location} · Shift: {emp.shift}
                            {emp.todayStatus==='called-out' && <> · Reason: {emp.calloutReason}</>}
                          </div>
                        </div>
                        {emp.covered && (
                          <span className="badge green" style={{fontSize:11}}>✓ {emp.coveredBy || 'Covered'}</span>
                        )}
                      </div>
                      {!emp.covered && (
                        <>
                          <div style={{fontSize:10,fontWeight:700,letterSpacing:'.08em',color:'var(--t-text-muted)',textTransform:'uppercase',marginBottom:8}}>
                            Available Key Holders Who Can Cover:
                          </div>
                          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(220px,1fr))',gap:6}}>
                            {pool.map(p=>(
                              <div key={p.id} style={{background:'var(--t-surface-2)',border:'1px solid var(--t-line)',padding:'10px 14px',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                                <div>
                                  <div style={{fontSize:12,fontWeight:700,color:'var(--t-text)'}}>{p.full_name}</div>
                                  <div style={{fontSize:10,color:'var(--t-text-muted)'}}>{p.location} · {p.hoursWeek}h/wk</div>
                                  {p.hoursWeek >= 36 && <div style={{fontSize:9,color:'var(--t-warn)',fontWeight:700}}>⚠ Near OT</div>}
                                </div>
                                <SmBtn color="var(--t-success)" disabled={busy[`cover-${emp.person_id}-${p.id}`]} onClick={()=>askToCover(emp,p)}>Ask to Cover</SmBtn>
                              </div>
                            ))}
                            {pool.length === 0 && (
                              <div style={{fontSize:11,color:'var(--t-danger)',fontWeight:600}}>No available Key Holders. Consider cross-location transfer.</div>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  )
                })}
              </div>
            )}

            {/* ATTENDANCE ALERTS */}
            <div style={{display:'flex',flexDirection:'column',gap:8}}>
              <SectionLabel>ATTENDANCE ALERTS — TODAY</SectionLabel>

              {ncnsList.map(emp=>(
                <div key={emp.exception_id||emp.person_id} style={{background:'var(--t-surface)',border:'1px solid #8b0000',padding:'16px 20px'}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}>
                    <div style={{flex:1}}>
                      <div style={{fontSize:11,fontWeight:800,color:'#ff4444',letterSpacing:'.08em',textTransform:'uppercase',marginBottom:4}}>🚫 CRITICAL — NO-CALL NO-SHOW</div>
                      <div style={{fontSize:15,fontWeight:700,color:'var(--t-text)'}}>{emp.full_name}</div>
                      <div style={{fontSize:12,color:'var(--t-text-muted)',marginTop:2}}>{emp.location} · {emp.role} · Shift: {emp.shift}</div>
                      <div style={{fontSize:11,color:'var(--t-text-faint)',marginTop:2}}>Phone: {emp.phone || '—'}</div>
                    </div>
                    <div style={{display:'flex',gap:6,flexWrap:'wrap',justifyContent:'flex-end',maxWidth:280}}>
                      <SmBtn color="var(--t-danger)" disabled={busy[`log-${emp.person_id}-no_show`]} onClick={()=>logCallout(emp,'no_show')}>Log NCNS</SmBtn>
                      <SmBtn color="var(--t-danger)" disabled={busy[`da-${emp.person_id}`]} onClick={()=>issueDA(emp)}>Issue DA</SmBtn>
                    </div>
                  </div>
                </div>
              ))}

              {calledOutList.map(emp=>(
                <div key={emp.exception_id||emp.person_id} style={{background:'var(--t-surface)',border:'1px solid var(--t-danger)',padding:'16px 20px'}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}>
                    <div style={{flex:1}}>
                      <div style={{fontSize:11,fontWeight:800,color:'var(--t-danger)',letterSpacing:'.08em',textTransform:'uppercase',marginBottom:4}}>🔴 CRITICAL — CALLED OUT</div>
                      <div style={{fontSize:15,fontWeight:700,color:'var(--t-text)'}}>{emp.full_name}</div>
                      <div style={{fontSize:12,color:'var(--t-text-muted)',marginTop:2}}>{emp.location} · {emp.role} · Shift: {emp.shift}</div>
                      <div style={{fontSize:12,color:'var(--t-text-muted)',marginTop:2}}>Reason: <strong>{emp.calloutReason}</strong></div>
                      <div style={{fontSize:11,color:'var(--t-text-faint)',marginTop:2}}>
                        Coverage: {emp.covered
                          ? <span style={{color:'var(--t-success)',fontWeight:700}}>{emp.coveredBy || 'Covered'} ✅</span>
                          : <span style={{color:'var(--t-danger)',fontWeight:700}}>Not yet arranged</span>}
                      </div>
                      <div style={{fontSize:11,color:'var(--t-text-faint)',marginTop:2}}>Callouts (30d): {emp.callouts30d} · Phone: {emp.phone || '—'}</div>
                    </div>
                    <div style={{display:'flex',gap:6,flexWrap:'wrap',justifyContent:'flex-end',maxWidth:280}}>
                      <SmBtn color="var(--t-accent)" disabled={busy[`da-${emp.person_id}`]} onClick={()=>issueDA(emp)}>Issue DA</SmBtn>
                    </div>
                  </div>
                </div>
              ))}

              {lateList.map(emp=>(
                <div key={emp.id} style={{background:'var(--t-surface)',border:'1px solid var(--t-warn)',padding:'16px 20px'}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}>
                    <div style={{flex:1}}>
                      <div style={{fontSize:11,fontWeight:800,color:'var(--t-warn)',letterSpacing:'.08em',textTransform:'uppercase',marginBottom:4}}>⚠ WARNING — LATE ARRIVAL</div>
                      <div style={{fontSize:15,fontWeight:700,color:'var(--t-text)'}}>{emp.full_name}</div>
                      <div style={{fontSize:12,color:'var(--t-text-muted)',marginTop:2}}>{emp.location} · {emp.role} · Shift: {emp.shift}</div>
                      <div style={{fontSize:11,color:'var(--t-text-faint)',marginTop:2}}>Phone: {emp.phone || '—'}</div>
                    </div>
                    <div style={{display:'flex',gap:6,flexWrap:'wrap',justifyContent:'flex-end',maxWidth:240}}>
                      <SmBtn color="var(--t-warn)" disabled={busy[`log-${emp.person_id}-tardy`]} onClick={()=>logCallout({...emp,calloutReason:'Tardy'},'tardy')}>Log Late</SmBtn>
                    </div>
                  </div>
                </div>
              ))}

              {calledOutList.length===0 && ncnsList.length===0 && lateList.length===0 && (
                <div style={{fontSize:13,color:'var(--t-success)',padding:'16px',background:'var(--t-surface)',border:'1px solid var(--t-line)'}}>✅ No attendance issues today.</div>
              )}
            </div>

            {/* LIVE STAFF BOARD */}
            <div>
              <SectionLabel>LIVE STAFF BOARD — SCHEDULED TODAY</SectionLabel>
              <div style={{background:'var(--t-surface)',border:'1px solid var(--t-line)',overflow:'auto'}}>
                <table style={{width:'100%',borderCollapse:'collapse',fontSize:11}}>
                  <thead>
                    <tr style={{background:'var(--t-surface-2)',borderBottom:'1px solid var(--t-line)'}}>
                      {['Name','Location','Role','Shift','Status','Clocked In','Hrs Today','OT Risk','Phone'].map(h=>(
                        <th key={h} style={{padding:'8px 10px',textAlign:'left',color:'var(--t-text-muted)',fontWeight:700,fontSize:9,letterSpacing:'.06em',textTransform:'uppercase',whiteSpace:'nowrap'}}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {boardRows.length === 0 && (
                      <tr><td colSpan={9} style={{padding:'16px',color:'var(--t-text-faint)',textAlign:'center'}}>No shifts scheduled today for the selected location(s).</td></tr>
                    )}
                    {boardRows.map(emp=>{
                      const rowBg =
                        emp.todayStatus==='ncns'       ? 'rgba(139,0,0,.12)' :
                        emp.todayStatus==='called-out' ? 'rgba(239,68,68,.07)' :
                        emp.todayStatus==='late'       ? 'rgba(245,158,11,.07)' : 'transparent'
                      return (
                        <tr key={emp.key} style={{borderBottom:'1px solid var(--t-line)',background:rowBg}}>
                          <td style={{padding:'8px 10px',fontWeight:700,color:'var(--t-text)',whiteSpace:'nowrap'}}>{emp.full_name}</td>
                          <td style={{padding:'8px 10px',color:'var(--t-text-muted)',whiteSpace:'nowrap'}}>{emp.location}</td>
                          <td style={{padding:'8px 10px',color:'var(--t-text-muted)',whiteSpace:'nowrap'}}>{emp.role}</td>
                          <td style={{padding:'8px 10px',color:'var(--t-text-faint)',fontSize:10,whiteSpace:'nowrap'}}>{emp.shift}</td>
                          <td style={{padding:'8px 10px',whiteSpace:'nowrap'}}>
                            <StatusBadge status={emp.todayStatus}/>
                            {emp.todayStatus==='called-out' && emp.calloutReason && (
                              <div style={{fontSize:9,color:'var(--t-text-faint)',marginTop:2}}>{emp.calloutReason}</div>
                            )}
                          </td>
                          <td style={{padding:'8px 10px',color:'var(--t-text-muted)',fontSize:10,whiteSpace:'nowrap'}}>{emp.clockedInAt || '—'}</td>
                          <td style={{padding:'8px 10px',color:'var(--t-text)',fontSize:10,whiteSpace:'nowrap'}}>{emp.hrsToday ? `${emp.hrsToday}h` : '—'}</td>
                          <td style={{padding:'8px 10px',whiteSpace:'nowrap'}}>
                            {emp.otRisk
                              ? <span className="badge amber" style={{fontSize:9}}>OT Risk {emp.hoursWeek}h</span>
                              : <span style={{color:'var(--t-text-faint)',fontSize:10}}>—</span>}
                          </td>
                          <td style={{padding:'8px 10px',color:'var(--t-text-faint)',fontSize:10,whiteSpace:'nowrap'}}>{emp.phone || '—'}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ═══ STAFFING OVERVIEW TAB ═══ */}
        {tab==='staffing' && (
          <div style={{display:'flex',flexDirection:'column',gap:20}}>

            {/* weekly grid */}
            <div>
              <SectionLabel>THIS WEEK — STAFFING GRID (click cell to expand)</SectionLabel>
              <div style={{background:'var(--t-surface)',border:'1px solid var(--t-line)',overflow:'auto'}}>
                <table style={{width:'100%',borderCollapse:'collapse',fontSize:11}}>
                  <thead>
                    <tr style={{background:'var(--t-surface-2)',borderBottom:'1px solid var(--t-line)'}}>
                      <th style={{padding:'8px 12px',textAlign:'left',color:'var(--t-text-muted)',fontWeight:700,fontSize:10,letterSpacing:'.06em',textTransform:'uppercase',minWidth:100}}>Location</th>
                      {weekDays.map(dt=>(
                        <th key={dt} style={{padding:'8px 10px',textAlign:'center',color:'var(--t-text-muted)',fontWeight:700,fontSize:10,letterSpacing:'.06em',textTransform:'uppercase',minWidth:90}}>{fmtDay(dt)}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {locList.length === 0 && (
                      <tr><td colSpan={weekDays.length+1} style={{padding:'16px',color:'var(--t-text-faint)',textAlign:'center'}}>No locations in scope.</td></tr>
                    )}
                    {locList.map(loc=>(
                      <>
                        <tr key={loc.id} style={{borderBottom:'1px solid var(--t-line)'}}>
                          <td style={{padding:'10px 12px',fontWeight:700,color:'var(--t-text)'}}>{loc.name}</td>
                          {weekDays.map(dt=>{
                            const cell = gridByLoc[loc.id]?.[dt] || { emps:[], open:0 }
                            const staffed = cell.emps.length
                            const total = staffed + cell.open
                            const cellKey = `${loc.id}-${dt}`
                            const full = cell.open === 0
                            return (
                              <td key={dt} style={{padding:'8px 10px',textAlign:'center',cursor:staffed?'pointer':'default'}}
                                onClick={()=>staffed && setExpandedCell(expandedCell===cellKey?null:cellKey)}>
                                <span style={{fontWeight:800,fontSize:13,color:total===0?'var(--t-text-faint)':full?'var(--t-success)':'var(--t-danger)'}}>
                                  {total===0?'—':`${staffed}/${total}`}
                                </span>
                                {total>0 && <div style={{fontSize:8,color:'var(--t-text-faint)',marginTop:1}}>{full?'Full':'Open'}</div>}
                              </td>
                            )
                          })}
                        </tr>
                        {weekDays.map(dt=>{
                          const cellKey = `${loc.id}-${dt}`
                          if (expandedCell !== cellKey) return null
                          const emps = gridByLoc[loc.id]?.[dt]?.emps || []
                          return (
                            <tr key={`exp-${cellKey}`} style={{borderBottom:'1px solid var(--t-line)',background:'rgba(0,229,255,.04)'}}>
                              <td colSpan={weekDays.length+1} style={{padding:'10px 20px'}}>
                                <div style={{fontSize:10,fontWeight:700,color:'var(--t-accent)',marginBottom:6,textTransform:'uppercase',letterSpacing:'.08em'}}>
                                  {loc.name} — {fmtDay(dt)} Staff
                                </div>
                                <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
                                  {emps.map((e,i)=>(
                                    <div key={i} style={{background:'var(--t-surface)',border:'1px solid var(--t-line)',padding:'4px 10px',fontSize:11}}>
                                      <span style={{fontWeight:700,color:'var(--t-text)'}}>{e.name}</span>
                                      {e.role && <span style={{color:'var(--t-text-faint)',marginLeft:4}}>— {e.role}</span>}
                                    </div>
                                  ))}
                                </div>
                              </td>
                            </tr>
                          )
                        })}
                      </>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* open slots */}
            <div>
              <SectionLabel>OPEN / UNCOVERED SHIFTS</SectionLabel>
              <div style={{display:'flex',flexDirection:'column',gap:6}}>
                {openShiftRows.map(row=>(
                  <div key={row.id} style={{background:'var(--t-surface)',border:'1px solid var(--t-danger)',padding:'12px 16px',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                    <div>
                      <div style={{fontSize:13,fontWeight:700,color:'var(--t-text)'}}>{row.location} — {row.shift}</div>
                      <div style={{fontSize:11,color:'var(--t-text-muted)',marginTop:2}}>{fmtDay(row.date)}{row.note?` · ${row.note}`:''} · {row.volunteers.length} volunteer{row.volunteers.length===1?'':'s'}</div>
                    </div>
                    <span className="badge red" style={{fontSize:10}}>Open</span>
                  </div>
                ))}
                {gapRows.map((g,i)=>(
                  <div key={`gap-${i}`} style={{background:'var(--t-surface)',border:'1px solid var(--t-warn)',padding:'12px 16px',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                    <div>
                      <div style={{fontSize:13,fontWeight:700,color:'var(--t-text)'}}>{g.location || '—'} — {g.shift || 'Shift'}</div>
                      <div style={{fontSize:11,color:'var(--t-text-muted)',marginTop:2}}>{g.date?fmtDay(isoDate(g.date)):'Today'} · {g.urgency || 'uncovered'}</div>
                    </div>
                    <SmBtn color="var(--t-success)" disabled={busy[`open-${g.node_id}-${g.date}`]} onClick={()=>postOpenShift(g)}>Post Open Shift</SmBtn>
                  </div>
                ))}
                {openShiftRows.length===0 && gapRows.length===0 && (
                  <div style={{fontSize:13,color:'var(--t-success)',padding:'14px',background:'var(--t-surface)',border:'1px solid var(--t-line)'}}>✅ No open or uncovered shifts.</div>
                )}
              </div>
            </div>

            {/* swap volunteers */}
            <div>
              <SectionLabel>OPEN-SHIFT VOLUNTEERS — PENDING</SectionLabel>
              <div style={{display:'flex',flexDirection:'column',gap:6}}>
                {swapClaims.map(sw=>(
                  <div key={sw.claim_id} style={{background:'var(--t-surface)',border:'1px solid var(--t-line)',padding:'12px 16px',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                    <div>
                      <div style={{fontSize:13,fontWeight:700,color:'var(--t-text)'}}>{sw.name}</div>
                      <div style={{fontSize:11,color:'var(--t-text-muted)',marginTop:2}}>{sw.location} · {fmtDay(sw.date)} · {sw.shift}</div>
                    </div>
                    <div style={{display:'flex',gap:6}}>
                      <SmBtn color="var(--t-success)" disabled={busy[`swap-${sw.claim_id}`]} onClick={()=>reviewSwapClaim(sw,'approved')}>Approve</SmBtn>
                      <SmBtn color="var(--t-danger)"  disabled={busy[`swap-${sw.claim_id}`]} onClick={()=>reviewSwapClaim(sw,'denied')}>Deny</SmBtn>
                    </div>
                  </div>
                ))}
                {swapClaims.length===0 && (
                  <div style={{fontSize:13,color:'var(--t-text-faint)',padding:'14px',background:'var(--t-surface)',border:'1px solid var(--t-line)'}}>No pending volunteers.</div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ═══ DISCIPLINARY TAB ═══ */}
        {tab==='disciplinary' && (
          <div style={{display:'flex',flexDirection:'column',gap:20}}>

            {d.atLimit.length > 0 && (
              <div style={{background:'var(--t-surface)',border:'1px solid var(--t-danger)',padding:'16px 20px'}}>
                <div style={{fontSize:11,fontWeight:800,color:'var(--t-danger)',letterSpacing:'.08em',textTransform:'uppercase',marginBottom:10}}>
                  ⚠ APPROACHING POLICY LIMIT — {d.atLimit.length} Employee{d.atLimit.length>1?'s':''}
                </div>
                <div style={{display:'flex',flexDirection:'column',gap:6}}>
                  {d.atLimit.map(emp=>(
                    <div key={emp.id} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'8px 0',borderBottom:'1px solid var(--t-line)'}}>
                      <div>
                        <span style={{fontWeight:700,color:'var(--t-text)',fontSize:13}}>{emp.full_name}</span>
                        <span style={{color:'var(--t-text-muted)',fontSize:12,marginLeft:8}}>{emp.location} · {emp.role}</span>
                      </div>
                      <div style={{display:'flex',gap:12,alignItems:'center'}}>
                        <div style={{textAlign:'right'}}>
                          <div style={{fontSize:11,color:'var(--t-text-muted)'}}>{emp.callouts30d} callout{emp.callouts30d!==1?'s':''} + {emp.lates30d} late{emp.lates30d!==1?'s':''} (30d)</div>
                          <div style={{fontSize:10,color:'var(--t-danger)',fontWeight:700}}>Total: {emp.callouts30d + emp.lates30d} incidents — 4+ threshold hit</div>
                        </div>
                        <SmBtn color="var(--t-danger)" disabled={busy[`da-${emp.id}`]} onClick={()=>issueDA({person_id:emp.id,node_id:emp.node_id,full_name:emp.full_name,calloutReason:'Attendance pattern'})}>Issue DA</SmBtn>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div>
              <SectionLabel>OPEN DISCIPLINARY ACTIONS ({d.openDaCount})</SectionLabel>
              <div style={{background:'var(--t-surface)',border:'1px solid var(--t-line)',overflow:'auto'}}>
                <table style={{width:'100%',borderCollapse:'collapse',fontSize:11,minWidth:800}}>
                  <thead>
                    <tr style={{background:'var(--t-surface-2)',borderBottom:'1px solid var(--t-line)'}}>
                      {['Employee','Location','DA Type','Issued By','Date','Stage','Follow-up','Actions'].map(h=>(
                        <th key={h} style={{padding:'8px 10px',textAlign:'left',color:'var(--t-text-muted)',fontWeight:700,fontSize:9,letterSpacing:'.06em',textTransform:'uppercase',whiteSpace:'nowrap'}}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {openDAsDisplay.length===0 && (
                      <tr><td colSpan={8} style={{padding:'16px',color:'var(--t-text-faint)',textAlign:'center'}}>No open disciplinary actions. ✅</td></tr>
                    )}
                    {openDAsDisplay.map(da=>(
                      <tr key={da.id} style={{borderBottom:'1px solid var(--t-line)'}}>
                        <td style={{padding:'8px 10px',fontWeight:700,color:'var(--t-text)',whiteSpace:'nowrap'}}>{da.employee}</td>
                        <td style={{padding:'8px 10px',color:'var(--t-text-muted)',whiteSpace:'nowrap'}}>{da.location}</td>
                        <td style={{padding:'8px 10px',whiteSpace:'nowrap'}}>
                          <span style={{fontSize:10,fontWeight:700,padding:'2px 8px',borderRadius:3,background:daColor(da.typeRaw,da.status),color:/verbal|written/i.test(da.typeRaw)?'#000':'#fff'}}>{da.type}</span>
                        </td>
                        <td style={{padding:'8px 10px',color:'var(--t-text-muted)',whiteSpace:'nowrap'}}>{da.issuedBy}</td>
                        <td style={{padding:'8px 10px',color:'var(--t-text-faint)',whiteSpace:'nowrap'}}>{da.date}</td>
                        <td style={{padding:'8px 10px',color:'var(--t-text-muted)',whiteSpace:'nowrap'}}>{da.stage}</td>
                        <td style={{padding:'8px 10px',color:'var(--t-warn)',fontWeight:700,whiteSpace:'nowrap'}}>{da.dueDate}</td>
                        <td style={{padding:'8px 10px',whiteSpace:'nowrap'}}>
                          <div style={{display:'flex',gap:4}}>
                            <SmBtn onClick={()=>drillEmps(`DA — ${da.employee}`, [da], [
                              {key:'employee',label:'Employee',value:r=>r.employee},
                              {key:'type',label:'Type',value:r=>r.type},
                              {key:'stage',label:'Stage',value:r=>r.stage},
                              {key:'date',label:'Issued',value:r=>r.date},
                              {key:'dueDate',label:'Follow-up',value:r=>r.dueDate},
                              {key:'description',label:'Detail',value:r=>r.description||'—'},
                            ], 'var(--t-warn)')}>View</SmBtn>
                            <SmBtn color="var(--t-success)" disabled={busy[`resolve-${da.id}`]} onClick={()=>resolveDA(da)}>Resolve</SmBtn>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ═══ OVERVIEW TAB ═══ */}
        {tab==='overview' && (
          <div style={{display:'grid',gridTemplateColumns:'1fr 320px',gap:16}}>
            <div style={{display:'flex',flexDirection:'column',gap:12}}>
              <SectionLabel>RECENT HR ACTIVITY</SectionLabel>
              {d.recentActions.length===0 && (
                <div style={{fontSize:13,color:'var(--t-text-faint)',padding:'14px',background:'var(--t-surface)',border:'1px solid var(--t-line)'}}>No recent HR activity.</div>
              )}
              {d.recentActions.map(a=>(
                <div key={a.id} style={{background:'var(--t-surface)',border:'1px solid var(--t-line)',padding:'12px 16px',display:'flex',alignItems:'center',gap:12}}>
                  <div style={{width:8,height:8,borderRadius:'50%',flexShrink:0,background:a.severity==='critical'?'var(--t-danger)':a.severity==='high'?'var(--t-warn)':'var(--t-success)'}}/>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                      <div style={{fontSize:13,fontWeight:700,color:'var(--t-text)'}}>{a.type}</div>
                      <div style={{fontSize:11,color:'var(--t-text-faint)'}}>{a.date}</div>
                    </div>
                    <div style={{fontSize:12,color:'var(--t-text-muted)'}}>{a.employee} · {a.location}</div>
                    {a.detail && <div style={{fontSize:11,color:'var(--t-text-faint)',marginTop:2}}>{a.detail}</div>}
                  </div>
                </div>
              ))}
            </div>
            <div style={{display:'flex',flexDirection:'column',gap:8}}>
              <SectionLabel>QUICK ACTIONS</SectionLabel>
              {[
                {l:'Issue Disciplinary Action',to:'/disciplinary',color:'var(--t-danger)'},
                {l:'Review PTO Requests',to:'/requests',color:'var(--t-warn)'},
                {l:'Schedule Performance Reviews',to:'/reviews',color:'var(--t-accent)'},
                {l:'Send Policy for Signature',to:'/policies',color:'var(--t-text)'},
                {l:'File Incident Report',to:'/incidents',color:'var(--t-danger)'},
                {l:'View Training Matrix',to:'/training',color:'var(--t-text)'},
                {l:'Add New Employee',to:'/roster',color:'var(--t-success)'},
                {l:'Post Open Position',to:'/ats',color:'var(--t-text)'},
                {l:'View KPI Forensics',to:'/kpi',color:'var(--t-accent)'},
                {l:'Generate HR Report',to:'/reports',color:'var(--t-text)'},
              ].map(({l,to,color})=>(
                <button key={l} onClick={()=>nav(to)} style={{background:'var(--t-surface)',border:'1px solid var(--t-line)',color,padding:'10px 14px',fontSize:12,fontWeight:600,cursor:'pointer',textAlign:'left',display:'flex',alignItems:'center',gap:8}}>
                  <span style={{flex:1}}>{l}</span>
                  <span style={{color:'var(--t-text-faint)'}}>→</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ═══ PENDING ACTION ITEMS TAB ═══ */}
        {tab==='pending' && (
          <div style={{display:'flex',flexDirection:'column',gap:12}}>
            <SectionLabel>ITEMS REQUIRING ACTION</SectionLabel>
            {d.pendingItems.length===0 && (
              <div style={{fontSize:13,color:'var(--t-success)',padding:'16px',background:'var(--t-surface)',border:'1px solid var(--t-line)'}}>✅ No outstanding action items.</div>
            )}
            {d.pendingItems.map(p=>{
              const color = p.urgency==='red'?'var(--t-danger)':p.urgency==='amber'?'var(--t-warn)':'var(--t-accent)'
              const routeMap = {PTO:'/requests',DA:'/disciplinary',Policy:'/policies',Training:'/training',Coverage:'/coverage'}
              return (
                <div key={p.id} style={{background:'var(--t-surface)',border:`1px solid ${p.urgency==='red'?'var(--t-danger)':p.urgency==='amber'?'var(--t-warn)':'var(--t-line)'}`,padding:'16px 20px',display:'flex',alignItems:'center',gap:16,cursor:'pointer'}} onClick={()=>nav(routeMap[p.category]||'/')}>
                  <div style={{fontSize:32,fontWeight:800,color,minWidth:48,textAlign:'center'}}>{p.count}</div>
                  <div style={{flex:1}}>
                    <div style={{fontSize:14,fontWeight:700,color:'var(--t-text)'}}>{p.label}</div>
                    <div style={{fontSize:11,color:'var(--t-text-muted)',marginTop:2}}>Category: {p.category} · Click to review</div>
                  </div>
                  <span className={`badge ${p.urgency==='red'?'red':p.urgency==='amber'?'amber':'blue'}`}>{p.urgency==='red'?'Urgent':p.urgency==='amber'?'Action Needed':'Info'}</span>
                </div>
              )
            })}
            <div style={{marginTop:8}}>
              <SectionLabel>ACKNOWLEDGMENT STATUS</SectionLabel>
              {d.ackBroadcasts.length===0 && (
                <div style={{fontSize:13,color:'var(--t-text-faint)',padding:'14px',background:'var(--t-surface)',border:'1px solid var(--t-line)'}}>No broadcasts requiring acknowledgment.</div>
              )}
              {d.ackBroadcasts.map(pol=>(
                <div key={pol.id} style={{background:'var(--t-surface)',border:'1px solid var(--t-line)',padding:'12px 16px',marginBottom:6,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                  <div>
                    <div style={{fontSize:13,fontWeight:700,color:'var(--t-text)'}}>{pol.title}</div>
                    <div style={{fontSize:11,color:'var(--t-text-muted)'}}>{pol.kind} · {pol.acks}/{pol.total} acknowledged</div>
                  </div>
                  <div style={{display:'flex',alignItems:'center',gap:12}}>
                    <div style={{textAlign:'right'}}>
                      <div style={{fontSize:18,fontWeight:800,color:pol.ackRate==null?'var(--t-text-muted)':pol.ackRate>=90?'var(--t-success)':pol.ackRate>=75?'var(--t-warn)':'var(--t-danger)'}}>{fmtPct(pol.ackRate)}</div>
                      <div style={{fontSize:10,color:'var(--t-text-faint)'}}>acknowledged</div>
                    </div>
                    <button onClick={()=>nav('/communications')} style={{background:'var(--t-surface-2)',border:'1px solid var(--t-line)',color:'var(--t-text)',padding:'6px 12px',fontSize:11,cursor:'pointer',fontWeight:600}}>View</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ═══ WAGE & PAYROLL TAB ═══ */}
        {tab==='payroll' && (
          <div style={{display:'grid',gridTemplateColumns:'1fr 320px',gap:16}}>
            <div>
              <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:12}}>
                <SectionLabel>EMPLOYEE WAGES</SectionLabel>
                <input value={compSearch} onChange={e=>setCompSearch(e.target.value)} placeholder="Search employee…" style={{flex:1,background:'var(--t-surface)',border:'1px solid var(--t-line)',color:'var(--t-text)',padding:'6px 10px',fontSize:12,outline:'none'}}/>
                <select value={compFilter} onChange={e=>setCompFilter(e.target.value)} style={{background:'var(--t-surface)',border:'1px solid var(--t-line)',color:'var(--t-text)',padding:'6px 10px',fontSize:12}}>
                  <option value="all">All Employees</option>
                  <option value="ot">OT (40+ hrs)</option>
                  <option value="ot_risk">OT Risk (36-39h)</option>
                  <option value="below_min">Below $16/hr</option>
                  <option value="high_wage">Top Earners ($20+)</option>
                </select>
              </div>
              <div style={{background:'var(--t-surface)',border:'1px solid var(--t-line)',overflow:'auto'}}>
                <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
                  <thead>
                    <tr style={{background:'var(--t-surface-2)',borderBottom:'1px solid var(--t-line)'}}>
                      {['Employee','Location','Role','Wage/Hr','Hrs/Wk','Est. Wk Pay','OT Risk'].map(h=>(
                        <th key={h} style={{padding:'8px 10px',textAlign:'left',color:'var(--t-text-muted)',fontWeight:700,fontSize:10,letterSpacing:'.06em',textTransform:'uppercase'}}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredEmps.length===0 && (
                      <tr><td colSpan={7} style={{padding:'16px',color:'var(--t-text-faint)',textAlign:'center'}}>No employees match.</td></tr>
                    )}
                    {filteredEmps.map(e=>{
                      const wkPay = e.wage!=null ? Math.min(e.hoursWeek,40)*e.wage + Math.max(0,e.hoursWeek-40)*e.wage*1.5 : null
                      return (
                        <tr key={e.id} style={{borderBottom:'1px solid var(--t-line)'}}>
                          <td style={{padding:'8px 10px',fontWeight:600,color:'var(--t-text)'}}>{e.full_name}</td>
                          <td style={{padding:'8px 10px',color:'var(--t-text-muted)'}}>{e.location}</td>
                          <td style={{padding:'8px 10px',color:'var(--t-text-muted)'}}>{e.role}</td>
                          <td style={{padding:'8px 10px',fontWeight:700,color:'var(--t-text)'}}>{e.wage!=null?`$${e.wage.toFixed(2)}`:'—'}</td>
                          <td style={{padding:'8px 10px',color:e.hoursWeek>=40?'var(--t-warn)':e.otRisk?'var(--t-warn)':'var(--t-text)'}}>{e.hoursWeek}</td>
                          <td style={{padding:'8px 10px',color:'var(--t-text)'}}>{fmt$(wkPay)}</td>
                          <td style={{padding:'8px 10px'}}>
                            {e.hoursWeek>=40 ? <span className="badge red" style={{fontSize:9}}>OT</span>
                              : e.otRisk ? <span className="badge amber" style={{fontSize:9}}>Risk</span>
                              : <span style={{color:'var(--t-text-faint)',fontSize:10}}>—</span>}
                          </td>
                        </tr>
                      )
                    })}
                    <tr style={{background:'var(--t-surface-2)',borderTop:'2px solid var(--t-line)'}}>
                      <td colSpan={4} style={{padding:'8px 10px',fontWeight:800,color:'var(--t-accent)',fontSize:11}}>TOTALS</td>
                      <td style={{padding:'8px 10px',fontWeight:700,color:'var(--t-text)'}}>{+filteredEmps.reduce((s,e)=>s+e.hoursWeek,0).toFixed(1)}</td>
                      <td style={{padding:'8px 10px',fontWeight:700,color:'var(--t-text)'}}>{fmt$(filteredEmps.filter(e=>e.wage!=null).reduce((s,e)=>s+(Math.min(e.hoursWeek,40)*e.wage+Math.max(0,e.hoursWeek-40)*e.wage*1.5),0))}</td>
                      <td/>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
            <div>
              <SectionLabel>WAGE ADJUSTMENT</SectionLabel>
              <div style={{background:'var(--t-surface)',border:'1px solid var(--t-line)',padding:'16px',display:'flex',flexDirection:'column',gap:12}}>
                <div>
                  <div style={{fontSize:11,color:'var(--t-text-muted)',marginBottom:4}}>EMPLOYEE</div>
                  <select value={wageEmp} onChange={e=>setWageEmp(e.target.value)} style={{width:'100%',background:'var(--t-surface-2)',border:'1px solid var(--t-line)',color:'var(--t-text)',padding:'8px 10px',fontSize:12}}>
                    <option value="">— Select employee —</option>
                    {d.emps.map(e=><option key={e.id} value={e.id}>{e.full_name}{e.wage!=null?` · $${e.wage.toFixed(2)}/hr`:''}</option>)}
                  </select>
                </div>
                <div>
                  <div style={{fontSize:11,color:'var(--t-text-muted)',marginBottom:4}}>NEW WAGE ($/hr)</div>
                  <input type="number" step="0.25" min="16" value={newWage} onChange={e=>setNewWage(e.target.value)} placeholder="e.g. 18.50" style={{width:'100%',background:'var(--t-surface-2)',border:'1px solid var(--t-line)',color:'var(--t-text)',padding:'8px 10px',fontSize:14,fontWeight:700,outline:'none',boxSizing:'border-box'}}/>
                </div>
                {wageEmp && newWage && (()=>{
                  const emp = d.emps.find(e=>e.id===wageEmp)
                  return emp ? (
                    <div style={{background:'rgba(0,229,255,.06)',border:'1px solid rgba(0,229,255,.2)',padding:'10px 12px',fontSize:12}}>
                      <div style={{color:'var(--t-text-muted)'}}>Change summary:</div>
                      <div style={{fontWeight:700,color:'var(--t-text)',marginTop:4}}>{emp.full_name} · {emp.wage!=null?`$${emp.wage.toFixed(2)}`:'—'} → ${parseFloat(newWage||0).toFixed(2)}/hr</div>
                      {emp.wage!=null && (
                        <div style={{color:'var(--t-text-faint)',marginTop:2,fontSize:11}}>Est. weekly Δ: {fmt$((parseFloat(newWage||0)-emp.wage)*emp.hoursWeek)}</div>
                      )}
                    </div>
                  ) : null
                })()}
                <div>
                  <div style={{fontSize:11,color:'var(--t-text-muted)',marginBottom:4}}>REASON / NOTE</div>
                  <textarea value={wageNote} onChange={e=>setWageNote(e.target.value)} placeholder="Annual review, promotion, market adjustment…" style={{width:'100%',background:'var(--t-surface-2)',border:'1px solid var(--t-line)',color:'var(--t-text)',padding:'8px 10px',fontSize:12,resize:'vertical',minHeight:70,outline:'none',boxSizing:'border-box'}}/>
                </div>
                <button onClick={submitWageChange} disabled={busy['wage']||!wageEmp||!newWage} style={{background:wageSuccess?'var(--t-success)':'var(--t-accent)',color:'#000',border:'none',padding:'10px',fontSize:13,fontWeight:700,cursor:(busy['wage']||!wageEmp||!newWage)?'default':'pointer',opacity:(!wageEmp||!newWage)?.6:1}}>
                  {wageSuccess?'✓ Wage Updated':busy['wage']?'Saving…':'Submit Wage Change'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ═══ ANNOUNCEMENTS TAB ═══ */}
        {tab==='announcements' && (
          <div style={{display:'grid',gridTemplateColumns:'1fr 320px',gap:16}}>
            <div>
              <SectionLabel>SEND ANNOUNCEMENT</SectionLabel>
              <div style={{background:'var(--t-surface)',border:'1px solid var(--t-line)',padding:'20px',display:'flex',flexDirection:'column',gap:12}}>
                <div style={{display:'flex',gap:10}}>
                  <div style={{flex:1}}>
                    <div style={{fontSize:11,color:'var(--t-text-muted)',marginBottom:4}}>SEND TO LOCATION</div>
                    <select value={annLocation} onChange={e=>setAnnLocation(e.target.value)} style={{width:'100%',background:'var(--t-surface-2)',border:'1px solid var(--t-line)',color:'var(--t-text)',padding:'8px 10px',fontSize:12}}>
                      <option value="all">All Locations</option>
                      {locList.map(l=><option key={l.id} value={l.id}>{l.name}</option>)}
                    </select>
                  </div>
                  <div style={{flex:1}}>
                    <div style={{fontSize:11,color:'var(--t-text-muted)',marginBottom:4}}>SEND TO ROLE</div>
                    <select value={annRole} onChange={e=>setAnnRole(e.target.value)} style={{width:'100%',background:'var(--t-surface-2)',border:'1px solid var(--t-line)',color:'var(--t-text)',padding:'8px 10px',fontSize:12}}>
                      <option value="all">All Roles</option>
                      {[...new Set(d.emps.map(e=>e.role).filter(r=>r&&r!=='—'))].map(r=><option key={r} value={r}>{r}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <div style={{fontSize:11,color:'var(--t-text-muted)',marginBottom:4}}>MESSAGE</div>
                  <textarea value={announcementText} onChange={e=>setAnnouncementText(e.target.value)} placeholder="Type your announcement here…" style={{width:'100%',background:'var(--t-surface-2)',border:'1px solid var(--t-line)',color:'var(--t-text)',padding:'10px 12px',fontSize:13,resize:'vertical',minHeight:140,outline:'none',boxSizing:'border-box',lineHeight:'1.5'}}/>
                  <div style={{fontSize:10,color:'var(--t-text-faint)',textAlign:'right',marginTop:4}}>{announcementText.length} characters</div>
                </div>
                <div style={{display:'flex',gap:8,justifyContent:'flex-end'}}>
                  <button onClick={()=>setAnnouncementText('')} style={{background:'transparent',border:'1px solid var(--t-line)',color:'var(--t-text-muted)',padding:'8px 16px',fontSize:12,cursor:'pointer'}}>Clear</button>
                  <button onClick={sendAnnouncement} disabled={!announcementText.trim()||annSending} style={{background:annSent?'var(--t-success)':'var(--t-accent)',color:'#000',border:'none',padding:'8px 20px',fontSize:13,fontWeight:700,cursor:announcementText.trim()&&!annSending?'pointer':'not-allowed',opacity:announcementText.trim()?1:.5}}>
                    {annSent?'✓ Sent!':annSending?'Sending…':'Send Announcement'}
                  </button>
                </div>
              </div>
              <div style={{marginTop:16}}>
                <SectionLabel>TEMPLATES</SectionLabel>
                {[
                  {title:'Schedule Reminder',body:'Please review this week\'s schedule in the ' + companyName() + ' app. Any conflicts must be reported to your manager by Monday morning.'},
                  {title:'Policy Acknowledgment Due',body:'All employees must complete and sign the updated Employee Handbook by end of week. Please log in and navigate to Policies to sign.'},
                  {title:'Training Deadline',body:'Mandatory training modules are due by Friday. Check your Training tab for any incomplete courses.'},
                  {title:'Peak Season Alert',body:'We are entering a peak season period. All time-off requests require 21 days notice. No exceptions.'},
                ].map(t=>(
                  <div key={t.title} style={{background:'var(--t-surface)',border:'1px solid var(--t-line)',padding:'12px 14px',marginBottom:6,display:'flex',justifyContent:'space-between',alignItems:'center',gap:12}}>
                    <div>
                      <div style={{fontSize:13,fontWeight:700,color:'var(--t-text)'}}>{t.title}</div>
                      <div style={{fontSize:11,color:'var(--t-text-muted)',marginTop:2}}>{t.body.substring(0,80)}…</div>
                    </div>
                    <button onClick={()=>setAnnouncementText(t.body)} style={{flexShrink:0,background:'var(--t-surface-2)',border:'1px solid var(--t-line)',color:'var(--t-text)',padding:'5px 10px',fontSize:11,cursor:'pointer',fontWeight:600}}>Use</button>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <SectionLabel>RECENT BROADCASTS</SectionLabel>
              {d.recentBroadcasts.length===0 && (
                <div style={{fontSize:13,color:'var(--t-text-faint)',padding:'12px',background:'var(--t-surface)',border:'1px solid var(--t-line)'}}>No broadcasts yet.</div>
              )}
              {d.recentBroadcasts.map(a=>(
                <div key={a.id} style={{background:'var(--t-surface)',border:'1px solid var(--t-line)',padding:'10px 12px',marginBottom:6}}>
                  <div style={{fontSize:12,fontWeight:700,color:'var(--t-text)'}}>{a.title}</div>
                  <div style={{fontSize:10,color:'var(--t-text-faint)',marginTop:3}}>{a.date} · To: {a.to} · By: {a.by}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ═══ COMPLIANCE TAB ═══ */}
        {tab==='compliance' && (
          <div style={{display:'flex',flexDirection:'column',gap:16}}>
            <SectionLabel>COMPLIANCE HEALTH</SectionLabel>
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))',gap:12}}>
              {[
                {label:'Training Compliance',   pct:d.trainingPct, desc:d.trainingPct==null?'No training data available':`${d.headcount-(d.trainingGap||0)}/${d.headcount} employees complete`,to:'/training'},
                {label:'Documents Pending Ack', pct:d.docsPendingAck==null?null:(d.headcount?Math.round((1-Math.min(1,d.docsPendingAck/Math.max(1,d.headcount)))*100):null), desc:d.docsPendingAck==null?'No document data':`${d.docsPendingAck} acknowledgments outstanding`,to:'/policies'},
                {label:'Disciplinary Compliance',pct:d.headcount?Math.round((d.headcount-d.emps.filter(e=>e.openDAs>0).length)/d.headcount*100):null,desc:`${d.openDaCount} open action${d.openDaCount===1?'':'s'} requiring resolution`,to:'/disciplinary'},
                {label:'Attendance Health',      pct:d.headcount?Math.round((d.headcount-d.calledOutList.length-d.ncnsList.length)/d.headcount*100):null,desc:`${d.calledOutList.length+d.ncnsList.length} out today`,to:'/attendance'},
              ].map(c=>(
                <div key={c.label} style={{background:'var(--t-surface)',border:'1px solid var(--t-line)',padding:'16px',cursor:'pointer'}} onClick={()=>nav(c.to)}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
                    <div style={{fontSize:13,fontWeight:700,color:'var(--t-text)'}}>{c.label}</div>
                    <span style={{fontSize:20,fontWeight:800,color:c.pct==null?'var(--t-text-muted)':c.pct>=90?'var(--t-success)':c.pct>=75?'var(--t-warn)':'var(--t-danger)'}}>{fmtPct(c.pct)}</span>
                  </div>
                  <div style={{height:6,background:'var(--t-line)',marginBottom:6}}>
                    <div style={{width:`${c.pct||0}%`,height:'100%',background:c.pct==null?'var(--t-line)':c.pct>=90?'var(--t-success)':c.pct>=75?'var(--t-warn)':'var(--t-danger)'}}/>
                  </div>
                  <div style={{fontSize:11,color:'var(--t-text-faint)'}}>{c.desc}</div>
                </div>
              ))}
            </div>
            <SectionLabel>EMPLOYEES WITH OPEN RISK SIGNALS</SectionLabel>
            <div style={{background:'var(--t-surface)',border:'1px solid var(--t-line)',overflow:'auto'}}>
              <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
                <thead>
                  <tr style={{background:'var(--t-surface-2)',borderBottom:'1px solid var(--t-line)'}}>
                    {['Employee','Location','Callouts (30d)','Lates (30d)','NCNS (30d)','Open D.A.s','Action'].map(h=>(
                      <th key={h} style={{padding:'8px 10px',textAlign:'left',color:'var(--t-text-muted)',fontWeight:700,fontSize:10,letterSpacing:'.06em',textTransform:'uppercase'}}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {d.emps.filter(e=>e.openDAs>0||e.callouts30d>=3||e.ncns30d>0).length===0 && (
                    <tr><td colSpan={7} style={{padding:'16px',color:'var(--t-text-faint)',textAlign:'center'}}>No employees with open risk signals. ✅</td></tr>
                  )}
                  {d.emps.filter(e=>e.openDAs>0||e.callouts30d>=3||e.ncns30d>0).sort((a,b)=>(b.openDAs+b.callouts30d)-(a.openDAs+a.callouts30d)).map(e=>(
                    <tr key={e.id} style={{borderBottom:'1px solid var(--t-line)'}}>
                      <td style={{padding:'8px 10px',fontWeight:600,color:'var(--t-text)'}}>{e.full_name}</td>
                      <td style={{padding:'8px 10px',color:'var(--t-text-muted)'}}>{e.location}</td>
                      <td style={{padding:'8px 10px',color:e.callouts30d>=3?'var(--t-danger)':'var(--t-text-muted)',fontWeight:e.callouts30d>=3?700:400}}>{e.callouts30d}</td>
                      <td style={{padding:'8px 10px',color:'var(--t-text-muted)'}}>{e.lates30d}</td>
                      <td style={{padding:'8px 10px',color:e.ncns30d>0?'var(--t-danger)':'var(--t-text-muted)',fontWeight:e.ncns30d>0?700:400}}>{e.ncns30d}</td>
                      <td style={{padding:'8px 10px',color:e.openDAs>0?'var(--t-danger)':'var(--t-text-muted)',fontWeight:e.openDAs>0?700:400}}>{e.openDAs}</td>
                      <td style={{padding:'8px 10px'}}>
                        <button onClick={()=>nav('/disciplinary')} style={{background:'transparent',border:'1px solid var(--t-line)',color:'var(--t-text)',padding:'3px 8px',fontSize:10,cursor:'pointer',fontWeight:600}}>Remediate</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

      </div>

      {/* Forensic drill-down */}
      <DrillDown open={!!drill} onClose={()=>setDrill(null)} {...(drill || {})} />
    </div>
  )
}
