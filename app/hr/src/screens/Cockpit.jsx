// Cockpit.jsx — Twisted Growers Command Center. 100% real data (2026-07-17 rewire).
// Every number on this screen comes from a live RPC on the HR brain:
//   get_roster, scope_shifts, get_all_time_entries, get_attendance_overview,
//   get_disciplinary_actions, get_pending_requests, hr_dashboard,
//   get_coverage_gaps, get_incidents, get_employee_sales,
//   get_cockpit_sales + get_current_wages (supabase/migrations/20260717_cockpit.sql).
// No mock arrays, no seeded generators, no localStorage-as-datastore. When a
// value has no backing data the UI shows an honest '—' / empty state.
import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { sb } from '../lib/supabase'
import { useAuth } from '../lib/auth.jsx'
import { useScope } from '../lib/scope.jsx'
import { useFeatureFlag } from '../lib/featureFlags.js'
import { useConfig } from '../lib/config.js'
import DrillDown from '../components/DrillDown.jsx'
import CeoCompanyStrip from '../components/CeoCompanyStrip.jsx'
import CeoPlatformMenu from '../components/CeoPlatformMenu.jsx'

/* ── helpers ─────────────────────────────────────────────────────── */
const fmt$ = n => n == null ? '—' : `$${parseFloat(n||0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}`
const fmtPct = n => n == null ? '—' : `${Math.round(n||0)}%`
const fmtH = n => n == null ? '—' : `${parseFloat(n||0).toFixed(1)}h`
const isHR = r => ['ceo','hr','manager','coo','admin','owner'].some(x=>(r||'').toLowerCase().includes(x))
const today = () => new Date().toISOString().slice(0,10)
const addDays = (iso, n) => { const d = new Date(`${iso}T00:00:00`); d.setDate(d.getDate()+n); return d.toISOString().slice(0,10) }

function weekStart() {
  const d=new Date(); d.setDate(d.getDate()-d.getDay()); d.setHours(0,0,0,0); return d.toISOString().slice(0,10)
}

// '09:00:00' → 9.0 ; null → null
const parseHM = t => { if (!t) return null; const [h,m] = String(t).split(':'); return (+h) + (+(m||0))/60 }
// '09:00:00' → '9:00a'
const hhmm = t => { if (!t) return '—'; const [h,m] = String(t).split(':'); const H = +h; return `${H%12||12}:${m||'00'}${H>=12?'p':'a'}` }
// timestamp → '9:04 AM'
const tsTime = ts => ts ? new Date(ts).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'}) : '—'
const normName = s => String(s||'').trim().toLowerCase()

function useLiveClock() {
  const [t,setT]=useState(new Date())
  useEffect(()=>{ const id=setInterval(()=>setT(new Date()),1000); return ()=>clearInterval(id) },[])
  return t
}

/* ── build the cockpit model from live RPC payloads only ─────────── */
function buildModel({ roster, shifts, punches, overview, das, pending, hrDash, gaps, incidents, sales, wages, empSales, locations }) {
  const todayS = today()
  const yestS  = addDays(todayS, -1)
  const d30    = addDays(todayS, -30)
  const now    = new Date()
  const nowH   = now.getHours() + now.getMinutes()/60

  const locList = (locations || []).map(l => ({ id: l.id, name: l.name }))
  const nodeNameById = {}; locList.forEach(l => { nodeNameById[l.id] = l.name })

  /* people (real roster) */
  const people = (Array.isArray(roster) ? roster : []).filter(p => p && p.id && p.is_active !== false)

  /* wages — latest per person (get_current_wages) */
  const wageBy = {}
  ;(Array.isArray(wages) ? wages : []).forEach(w => { if (w && w.person_id && w.wage != null) wageBy[w.person_id] = Number(w.wage) })

  /* time punches — hours this week, today's punch, clocked-in-now */
  const punchRows = Array.isArray(punches) ? punches : []
  const hoursWk = {}, todayPunch = {}, inNow = new Set()
  const punchEvents = []
  for (const te of punchRows) {
    const pid = te.person_id
    if (!pid || !te.punched_in_at) continue
    const start = new Date(te.punched_in_at)
    const end   = te.punched_out_at ? new Date(te.punched_out_at) : now
    hoursWk[pid] = (hoursWk[pid] || 0) + Math.max(0, (end - start) / 3600000)
    const wd = String(te.work_date || te.punched_in_at || '').slice(0,10)
    if (wd === todayS) {
      if (!todayPunch[pid] || new Date(todayPunch[pid].punched_in_at) > start) todayPunch[pid] = te
      if (!te.punched_out_at) inNow.add(pid)
      punchEvents.push(te)
    }
  }

  /* attendance incidents (get_attendance_overview) */
  const incBy = {}
  const todayIncEvents = []
  let yCallouts = 0, yNcns = 0
  for (const r of (Array.isArray(overview) ? overview : [])) {
    const pid = r.person_id; if (!pid) continue
    const rec = incBy[pid] = { callouts_30d:0, lates_30d:0, ncns_30d:0, calloutToday:false, ncnsToday:false, tardyToday:false }
    for (const inc of (r.incidents || [])) {
      if (inc.expired) continue
      const dt = String(inc.date || '').slice(0,10)
      if (dt >= d30) {
        if (inc.type === 'callout') rec.callouts_30d++
        else if (inc.type === 'tardy') rec.lates_30d++
        else if (inc.type === 'ncns') rec.ncns_30d++
      }
      if (dt === todayS) {
        if (inc.type === 'callout') rec.calloutToday = true
        if (inc.type === 'ncns')    rec.ncnsToday = true
        if (inc.type === 'tardy')   rec.tardyToday = true
        todayIncEvents.push({ type: inc.type, person: r.full_name, location: r.location || '—' })
      }
      if (dt === yestS) {
        if (inc.type === 'callout') yCallouts++
        if (inc.type === 'ncns')    yNcns++
      }
    }
  }

  /* disciplinary (get_disciplinary_actions) */
  const daRows = Array.isArray(das) ? das : []
  const openDaRows = daRows.filter(r => r.status === 'open')
  const openDaByPid = {}, openDaByName = {}
  openDaRows.forEach(r => {
    if (r.person_id) openDaByPid[r.person_id] = (openDaByPid[r.person_id]||0) + 1
    openDaByName[normName(r.person_name)] = (openDaByName[normName(r.person_name)]||0) + 1
  })

  /* enriched employees — every field traces to a real row */
  const emps = people.map(p => {
    const i = incBy[p.id] || {}
    return {
      id: p.id, person_id: p.id,
      full_name: p.full_name || 'Unknown',
      role: p.role_name || '—',
      location: p.node_name || '—',
      callouts_30d: i.callouts_30d || 0,
      lates_30d: i.lates_30d || 0,
      ncns: i.ncns_30d || 0,
      hours_week: +((hoursWk[p.id] || 0).toFixed(2)),
      wage: wageBy[p.id] ?? null,
      open_das: openDaByPid[p.id] ?? openDaByName[normName(p.full_name)] ?? 0,
    }
  })
  const empById = {}; emps.forEach(e => { empById[e.id] = e })
  const empByName = {}; emps.forEach(e => { empByName[normName(e.full_name)] = e })

  /* today's shifts (scope_shifts) → live board rows */
  const allShifts = Array.isArray(shifts) ? shifts : []
  const shiftsToday = allShifts.filter(s => String(s.shift_date||'').slice(0,10) === todayS)
  const rows = shiftsToday.map((s, idx) => {
    const emp = (s.person_id && empById[s.person_id]) || empByName[normName(s.full_name)] || null
    const pid = emp?.id || s.person_id || null
    const location = nodeNameById[s.node_id] || s.node_name || emp?.location || '—'
    const st = parseHM(s.start_time), en = parseHM(s.end_time)
    const started = st != null && nowH >= st
    const ended   = en != null && nowH >= en
    const flags = (pid && incBy[pid]) || {}
    const punch = pid ? todayPunch[pid] : null
    const clockedNow = pid ? inNow.has(pid) : false

    let status, statusColor, statusBg, sortKey
    if (flags.ncnsToday)          { status='NCNS';       statusColor='var(--t-danger)';     statusBg='rgba(255,59,48,.18)'; sortKey=0 }
    else if (flags.calloutToday)  { status='CALLED OUT'; statusColor='var(--t-danger)';     statusBg='rgba(255,59,48,.10)'; sortKey=1 }
    else if (clockedNow)          { status='CLOCKED IN'; statusColor='var(--t-success)';    statusBg='transparent';         sortKey=2 }
    else if (punch && ended)      { status='OFF DUTY';   statusColor='var(--t-text-faint)'; statusBg='transparent';         sortKey=5 }
    else if (punch)               { status='CLOCKED IN'; statusColor='var(--t-success)';    statusBg='transparent';         sortKey=2 }
    else if (started && !ended && st != null && (nowH - st) > 0.25)
                                  { status='LATE';       statusColor='var(--t-warn)';       statusBg='rgba(255,184,0,.08)'; sortKey=3 }
    else                          { status='SCHEDULED';  statusColor='var(--t-text-muted)'; statusBg='transparent';         sortKey=4 }

    let hrsToday = '—'
    if (punch && punch.punched_in_at) {
      const endT = punch.punched_out_at ? new Date(punch.punched_out_at) : now
      const el = (endT - new Date(punch.punched_in_at)) / 3600000
      if (el > 0) hrsToday = `${Math.floor(el)}h ${Math.floor((el - Math.floor(el)) * 60)}m`
    }

    const hoursWeek = emp?.hours_week ?? null
    let otRisk = null, otColor = 'var(--t-text-faint)'
    if (hoursWeek != null && hoursWeek >= 40)      { otRisk = `OT +${fmtH(hoursWeek-40)}`; otColor = 'var(--t-danger)' }
    else if (hoursWeek != null && hoursWeek >= 36) { otRisk = `${fmtH(hoursWeek)} wk`;      otColor = 'var(--t-warn)'   }

    return {
      key: `${s.node_id||'n'}-${s.full_name||idx}-${s.start_time||idx}`,
      emp: emp || { id: pid, person_id: pid, full_name: s.full_name || 'Unassigned', role: '—', location, hours_week: null, wage: null },
      location,
      shiftLabel: `${hhmm(s.start_time)}–${hhmm(s.end_time)}`,
      startH: st, endH: en, rawStatus: s.status || null,
      status, statusColor, statusBg, sortKey,
      clockInTime: punch ? tsTime(punch.punched_in_at) : '—',
      hrsToday, otRisk, otColor,
    }
  })

  /* today's incidents that have no shift row still surface (NCNS/callout) */
  const calloutsToday = emps.filter(e => (incBy[e.id]||{}).calloutToday)
  const ncnsToday     = emps.filter(e => (incBy[e.id]||{}).ncnsToday)
  const lateToday     = rows.filter(r => r.status === 'LATE').map(r => r.emp)
  const otAlerts      = emps.filter(e => e.hours_week >= 40)
  const clockedInEmps = emps.filter(e => inNow.has(e.id))

  /* hr_dashboard aggregates */
  const hr = hrDash && typeof hrDash === 'object' ? hrDash : {}
  const headcount = emps.length
  const trainingPct = headcount > 0 && (hr.training_complete != null)
    ? Math.round((Number(hr.training_complete) / headcount) * 100) : null
  const docsPendingAck = hr.docs_pending_ack != null ? Number(hr.docs_pending_ack) : null

  /* per-location training from hr_dashboard.by_location when the shape allows */
  const trainByLoc = {}
  if (Array.isArray(hr.by_location)) {
    hr.by_location.forEach(b => {
      const nm = b?.name || b?.location || b?.node_name
      const cnt = Number(b?.headcount ?? b?.count ?? 0)
      const done = Number(b?.training_complete ?? NaN)
      if (nm && cnt > 0 && !Number.isNaN(done)) trainByLoc[nm] = Math.round((done / cnt) * 100)
    })
  }

  /* incidents (safety/ops incidents table via get_incidents) */
  const incRows = Array.isArray(incidents) ? incidents : []
  const openIncRows = incRows.filter(r => (r.status || '').toLowerCase() === 'open')

  /* coverage gaps (get_coverage_gaps, today) */
  const gapRows = (Array.isArray(gaps) ? gaps : []).filter(g => (g.status || '') !== 'filled')

  /* sales per node (get_cockpit_sales) */
  const salesByNode = Array.isArray(sales) ? sales : []
  const salesByName = {}; salesByNode.forEach(s => { if (s && s.node_name) salesByName[s.node_name] = s })

  /* pending PTO (get_pending_requests) */
  const pendingPTO = Array.isArray(pending?.time_off) ? pending.time_off.length : 0

  /* per-location stats — all real */
  const locationStats = locList.map(l => {
    const locEmps  = emps.filter(e => e.location === l.name)
    const locRows  = rows.filter(r => r.location === l.name)
    const covered  = locRows.filter(r => r.status === 'CLOCKED IN' || r.status === 'OFF DUTY').length
    const coverage = locRows.length ? Math.round(covered / locRows.length * 100) : null
    const callouts = todayIncEvents.filter(ev => ev.type === 'callout' && ev.location === l.name).length
    const withWage = locEmps.filter(e => e.wage != null)
    const laborCost = withWage.length
      ? withWage.reduce((s,e)=>s + Math.min(e.hours_week,40)*e.wage + Math.max(0,e.hours_week-40)*e.wage*1.5, 0)
      : null
    return {
      name: l.name, node_id: l.id,
      headcount: locEmps.length,
      clockedIn: locEmps.filter(e => inNow.has(e.id)).length,
      callouts,
      coverage,
      otCount: locEmps.filter(e => e.hours_week >= 40).length,
      totalHrs: +(locEmps.reduce((s,e)=>s+e.hours_week,0).toFixed(1)),
      laborCost,
      trainingPct: trainByLoc[l.name] ?? null,
      openDAs: openDaRows.filter(r => (r.node_name || '') === l.name).length,
      shiftsToday: locRows,
      sales: salesByName[l.name] || null,
      alerts: coverage == null ? 'green' : coverage >= 100 ? 'green' : coverage >= 80 ? 'amber' : 'red',
    }
  })

  /* company totals */
  const totalHrsWeek = +(emps.reduce((s,e)=>s+e.hours_week,0).toFixed(1))
  const totalOTHrs   = +(emps.filter(e=>e.hours_week>40).reduce((s,e)=>s+(e.hours_week-40),0).toFixed(1))
  const withWage     = emps.filter(e => e.wage != null)
  const laborCost    = withWage.length
    ? withWage.reduce((s,e)=>s + Math.min(e.hours_week,40)*e.wage + Math.max(0,e.hours_week-40)*e.wage*1.5, 0) : null
  const otCost       = withWage.length
    ? withWage.filter(e=>e.hours_week>40).reduce((s,e)=>s + (e.hours_week-40)*e.wage*1.5, 0) : null
  const wageCoverage = withWage.length

  const attendanceRate = headcount > 0
    ? Math.round((headcount - calloutsToday.length - ncnsToday.length) / headcount * 100) : null
  const coveredAll   = rows.filter(r => r.status === 'CLOCKED IN' || r.status === 'OFF DUTY').length
  const coverageRate = rows.length ? Math.round(coveredAll / rows.length * 100) : null

  /* alerts — each one backed by the rows that triggered it */
  const alerts = [
    ...ncnsToday.map(e=>({sev:'critical',icon:'🚨',title:`NCNS — ${e.full_name}`,detail:`${e.location} · No call, no show today`,action:'View File',to:'/employees'})),
    ...otAlerts.slice(0,3).map(e=>({sev:'critical',icon:'⏰',title:`OT Alert — ${e.full_name}`,detail:`${fmtH(e.hours_week)} this week (${fmtH(e.hours_week-40)} OT)`,action:'View Timecard',to:'/timeclock'})),
    ...calloutsToday.slice(0,3).map(e=>({sev:'warning',icon:'📞',title:`Callout — ${e.full_name}`,detail:`${e.location} called out today`,action:'Find Coverage',to:'/coverage'})),
    ...gapRows.slice(0,3).map(g=>({sev:'warning',icon:'🕳️',title:`Coverage Gap — ${g.location || '—'}`,detail:`${g.shift || 'Shift'} · ${g.urgency || 'uncovered'}`,action:'Fill Gap',to:'/coverage'})),
    ...(pendingPTO>3?[{sev:'warning',icon:'🌴',title:`${pendingPTO} PTO Requests Pending`,detail:'Requires manager review',action:'Review',to:'/requests'}]:[]),
    ...(trainingPct!=null && trainingPct<80?[{sev:'warning',icon:'📚',title:`Training Compliance: ${fmtPct(trainingPct)}`,detail:'Below 80% threshold',action:'View Training',to:'/training'}]:[]),
    ...(openDaRows.length>0?[{sev:'info',icon:'⚖️',title:`${openDaRows.length} Open Disciplinary Action${openDaRows.length===1?'':'s'}`,detail:'Review required',action:'View',to:'/disciplinary'}]:[]),
    ...(openIncRows.length>0?[{sev:'info',icon:'📋',title:`${openIncRows.length} Open Incident${openIncRows.length===1?'':'s'}`,detail:'Requiring follow-up',action:'View',to:'/incidents'}]:[]),
  ]

  /* today's real event feed — punches + incidents + DAs issued today */
  const feed = []
  for (const te of punchEvents) {
    const e = empById[te.person_id]
    const loc = nodeNameById[te.node_id] || e?.location || '—'
    feed.push({ ts:new Date(te.punched_in_at), icon:'🕐', type:'clock', color:'var(--t-success)',
      text:`${e?.full_name || 'Employee'} clocked in at ${loc}` })
    if (te.punched_out_at)
      feed.push({ ts:new Date(te.punched_out_at), icon:'🕐', type:'clock', color:'var(--t-text-muted)',
        text:`${e?.full_name || 'Employee'} clocked out at ${loc}` })
  }
  for (const ev of todayIncEvents) {
    const label = ev.type === 'ncns' ? 'no-call no-show' : ev.type === 'callout' ? 'called out' : 'marked tardy'
    feed.push({ ts:null, icon: ev.type==='tardy'?'⚠':'📞', type: ev.type==='tardy'?'alert':'callout',
      color: ev.type==='tardy'?'var(--t-warn)':'var(--t-danger)', text:`${ev.person} ${label} — ${ev.location}` })
  }
  for (const r of daRows.filter(r => String(r.issued_date||'').slice(0,10) === todayS)) {
    feed.push({ ts:null, icon:'📋', type:'alert', color:'var(--t-danger)',
      text:`DA issued: ${r.person_name || '—'} (${r.type || 'disciplinary action'})` })
  }
  for (const g of gapRows) {
    feed.push({ ts:null, icon:'🕳️', type:'alert', color:'var(--t-warn)',
      text:`Coverage gap at ${g.location || '—'} — ${g.shift || 'shift uncovered'}` })
  }
  feed.sort((a,b) => (b.ts?.getTime()||0) - (a.ts?.getTime()||0))

  /* top performers (get_employee_sales, yesterday→today) — defensive shape */
  const perf = (Array.isArray(empSales) ? empSales : [])
    .map(r => ({
      name: r.full_name || r.person_name || r.employee_name || '—',
      sales: Number(r.total_sales ?? r.total ?? r.amount ?? 0),
      units: Number(r.total_units ?? r.units ?? 0),
    }))
    .filter(r => r.name !== '—' && r.sales > 0)
    .sort((a,b) => b.sales - a.sales)

  /* schedule published? — real: are there shifts next week per location */
  const nextWkStart = addDays(weekStart(), 7)
  const nextWkEnd   = addDays(nextWkStart, 6)
  const unpublishedLocs = locList
    .filter(l => !allShifts.some(s => {
      const d = String(s.shift_date||'').slice(0,10)
      return s.node_id === l.id && d >= nextWkStart && d <= nextWkEnd
    }))
    .map(l => l.name)

  return {
    emps, rows, locList,
    clockedInEmps, calloutsToday, ncnsToday, lateToday, otAlerts,
    totalHrsWeek, totalOTHrs, laborCost, otCost, wageCoverage,
    trainingPct, docsPendingAck, pendingPTO,
    openDAs: openDaRows.length, openDaRows,
    openIncidents: openIncRows.length, openIncRows,
    attendanceRate, coverageRate, locationStats, alerts, feed,
    salesByNode, salesByName, gapRows, perf,
    yCallouts, yNcns, unpublishedLocs,
    headcount, clockedInCount: clockedInEmps.length,
    pendingTimeOff: pending?.time_off || [],
  }
}

/* ── KPI Tile ─────────────────────────────────────────────────────── */
function KTile({label, value, sub, color='var(--t-text)', alert, trend, onClick}) {
  return (
    <div onClick={onClick} style={{
      background:'var(--t-surface)', border:`1px solid ${alert==='red'?'var(--t-danger)':alert==='amber'?'var(--t-warn)':'var(--t-line)'}`,
      padding:'14px 16px', cursor:onClick?'pointer':'default', transition:'border-color .2s',
      position:'relative', overflow:'hidden',
    }}>
      {alert==='red' && <div style={{position:'absolute',top:0,left:0,right:0,height:2,background:'var(--t-danger)'}}/>}
      {alert==='amber' && <div style={{position:'absolute',top:0,left:0,right:0,height:2,background:'var(--t-warn)'}}/>}
      <div style={{fontSize:10,fontWeight:700,letterSpacing:'.08em',color:'var(--t-text-muted)',textTransform:'uppercase',marginBottom:6}}>{label}</div>
      <div style={{fontSize:24,fontWeight:800,color,lineHeight:1,marginBottom:4}}>{value}</div>
      {sub && <div style={{fontSize:11,color:'var(--t-text-faint)'}}>{sub}</div>}
      {trend != null && <div style={{fontSize:11,color:trend>0?'var(--t-success)':trend<0?'var(--t-danger)':'var(--t-text-muted)',marginTop:2}}>{trend>0?'▲':'▼'} {Math.abs(trend)}% vs last wk</div>}
    </div>
  )
}

/* ── mini bar ────────────────────────────────────────────────────── */
function MiniBar({pct, color}) {
  if (pct == null) return <span style={{fontSize:11,color:'var(--t-text-faint)'}}>— no data</span>
  const c = color||(pct>=90?'var(--t-success)':pct>=70?'var(--t-warn)':'var(--t-danger)')
  return (
    <div style={{display:'flex',alignItems:'center',gap:6}}>
      <div style={{flex:1,height:4,background:'var(--t-line)'}}>
        <div style={{width:`${Math.min(100,pct||0)}%`,height:'100%',background:c}}/>
      </div>
      <span style={{fontSize:11,color:c,fontWeight:700,minWidth:32,textAlign:'right'}}>{Math.round(pct||0)}%</span>
    </div>
  )
}

/* ── alert card ──────────────────────────────────────────────────── */
function AlertCard({alert, onNavigate}) {
  const bg = alert.sev==='critical'?'var(--t-danger)':alert.sev==='warning'?'var(--t-warn)':'var(--t-accent)'
  const bgLight = alert.sev==='critical'?'rgba(255,77,125,.08)':alert.sev==='warning'?'rgba(255,184,0,.08)':'rgba(0,229,255,.08)'
  return (
    <div style={{background:bgLight,border:`1px solid ${bg}33`,padding:'12px 14px',display:'flex',alignItems:'center',gap:12,marginBottom:6}}>
      <span style={{fontSize:18,flexShrink:0}}>{alert.icon}</span>
      <div style={{flex:1,minWidth:0}}>
        <div style={{fontSize:13,fontWeight:700,color:'var(--t-text)'}}>{alert.title}</div>
        <div style={{fontSize:11,color:'var(--t-text-muted)'}}>{alert.detail}</div>
      </div>
      <button onClick={()=>onNavigate(alert.to)} style={{flexShrink:0,background:bg,color:'#000',border:'none',padding:'5px 10px',fontSize:11,fontWeight:700,cursor:'pointer'}}>
        {alert.action}
      </button>
    </div>
  )
}

/* ── location card ───────────────────────────────────────────────── */
function LocCard({loc, onNavigate}) {
  const border = loc.alerts==='red'?'var(--t-danger)':loc.alerts==='amber'?'var(--t-warn)':'var(--t-line)'
  return (
    <div style={{background:'var(--t-surface)',border:`1px solid ${border}`,padding:'16px',cursor:'pointer'}} onClick={()=>onNavigate('/schedule')}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
        <div style={{fontWeight:800,fontSize:15,color:'var(--t-text)'}}>{loc.name}</div>
        <span className={`badge ${loc.alerts==='red'?'red':loc.alerts==='amber'?'amber':'green'}`} style={{fontSize:10}}>
          {loc.coverage == null ? 'no shifts' : `${loc.coverage}% covered`}
        </span>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:12}}>
        {[
          {l:'Clocked In', v:loc.clockedIn, t:'var(--t-success)'},
          {l:'Headcount', v:loc.headcount, t:'var(--t-text)'},
          {l:'Callouts Today', v:loc.callouts, t:loc.callouts>0?'var(--t-danger)':'var(--t-text-muted)'},
          {l:'OT Employees', v:loc.otCount, t:loc.otCount>0?'var(--t-warn)':'var(--t-text-muted)'},
          {l:'Hours This Wk', v:fmtH(loc.totalHrs), t:'var(--t-text)'},
          {l:'Open D.A.s', v:loc.openDAs, t:loc.openDAs>0?'var(--t-danger)':'var(--t-text-muted)'},
        ].map(k=>(
          <div key={k.l}>
            <div style={{fontSize:10,color:'var(--t-text-faint)',letterSpacing:'.06em',textTransform:'uppercase'}}>{k.l}</div>
            <div style={{fontSize:18,fontWeight:700,color:k.t}}>{k.v}</div>
          </div>
        ))}
      </div>
      <div style={{marginTop:4}}>
        <div style={{fontSize:10,color:'var(--t-text-faint)',marginBottom:3}}>Training Compliance</div>
        <MiniBar pct={loc.trainingPct}/>
      </div>
    </div>
  )
}

/* ── deterministic avatar color (cosmetic only — not data) ───────── */
const AVATAR_COLORS = [
  '#00e5ff','#7c4dff','#ff6d00','#00e676','#ff1744',
  '#2979ff','#ffea00','#d500f9','#00bfa5','#ff6f00',
]
function avatarColor(name) {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffffffff
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length]
}
function initials(name) {
  const p = String(name||'?').trim().split(' ')
  return p.length >= 2 ? p[0][0] + p[p.length-1][0] : String(name||'?').slice(0,2)
}

/* ── location chip colors — assigned by scope order (cosmetic) ───── */
const LOC_PALETTE = ['var(--t-warn)','var(--t-accent)','var(--t-success)','var(--t-text-muted)','#7c4dff','#00bfa5']
const LOC_BG_PALETTE = ['rgba(255,184,0,.13)','rgba(0,229,255,.13)','rgba(52,199,89,.13)','rgba(120,120,140,.13)','rgba(124,77,255,.13)','rgba(0,191,165,.13)']
const locColorIdx = (name, locNames) => { const i = locNames.indexOf(name); return i < 0 ? 3 : i % LOC_PALETTE.length }

/* ── Section A: Live Staff Status Board (real shifts + punches) ──── */
function LiveStaffBoard({ d }) {
  const nav = useNavigate()
  const [locFilter, setLocFilter] = useState('All')
  const locNames = d.locList.map(l=>l.name)

  const filtered = useMemo(() => {
    const base = locFilter === 'All' ? d.rows : d.rows.filter(r => r.location === locFilter)
    return [...base].sort((a,b) => a.sortKey - b.sortKey)
  }, [d.rows, locFilter])

  const counts = useMemo(() => ({
    scheduled: d.rows.length,
    clockedIn: d.rows.filter(r=>r.status==='CLOCKED IN').length,
    calledOut: d.rows.filter(r=>r.status==='CALLED OUT').length,
    late:      d.rows.filter(r=>r.status==='LATE').length,
    notYet:    d.rows.filter(r=>r.status==='SCHEDULED').length,
    ncns:      d.rows.filter(r=>r.status==='NCNS').length,
  }), [d.rows])

  return (
    <div style={{background:'var(--t-surface)',border:'1px solid var(--t-line)',overflow:'hidden'}}>
      {/* Header */}
      <div style={{background:'var(--t-surface-2)',borderBottom:'1px solid var(--t-line)',padding:'10px 14px',display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:8}}>
        <div style={{display:'flex',alignItems:'center',gap:10}}>
          <span style={{fontSize:11,fontWeight:800,letterSpacing:'.1em',color:'var(--t-accent)',textTransform:'uppercase'}}>LIVE STAFF STATUS — ALL LOCATIONS</span>
          <span style={{width:8,height:8,borderRadius:'50%',background:'var(--t-success)',display:'inline-block',boxShadow:'0 0 6px var(--t-success)',animation:'pulse 2s infinite'}}/>
        </div>
        {/* Location tab strip — real scope locations */}
        <div style={{display:'flex',gap:4,flexWrap:'wrap'}}>
          {['All',...locNames].map(loc=>(
            <button key={loc} onClick={()=>setLocFilter(loc)} style={{
              padding:'4px 10px',fontSize:11,fontWeight:700,cursor:'pointer',border:'1px solid var(--t-line)',
              background: locFilter===loc ? 'var(--t-accent)' : 'var(--t-bg)',
              color: locFilter===loc ? '#000' : 'var(--t-text-muted)',
            }}>{loc}</button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div style={{overflowX:'auto'}}>
        {filtered.length === 0 ? (
          <div style={{padding:'24px 14px',fontSize:12,color:'var(--t-text-faint)',fontStyle:'italic'}}>
            No shifts scheduled today{locFilter!=='All'?` at ${locFilter}`:''} — publish a schedule to populate this board.
          </div>
        ) : (
        <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
          <thead>
            <tr style={{background:'var(--t-surface-2)',borderBottom:'1px solid var(--t-line)'}}>
              {['EMPLOYEE','LOCATION','ROLE','SHIFT','STATUS','CLOCK-IN','HRS TODAY','OT RISK','COVERAGE'].map(h=>(
                <th key={h} style={{padding:'8px 10px',textAlign:'left',color:'var(--t-text-muted)',fontWeight:700,fontSize:10,letterSpacing:'.06em',whiteSpace:'nowrap'}}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map(r => (
              <tr key={r.key} onClick={()=>r.emp.person_id && nav('/employee-360',{state:{personId:r.emp.person_id,personName:r.emp.full_name}})} title={r.emp.person_id?`Open ${r.emp.full_name}'s forensic file`:undefined} style={{
                borderBottom:'1px solid var(--t-line)',
                background: r.statusBg,
                borderLeft: r.otRisk ? `3px solid ${r.otColor}` : '3px solid transparent',
                cursor: r.emp.person_id ? 'pointer' : 'default',
              }}>
                {/* Employee */}
                <td style={{padding:'8px 10px',whiteSpace:'nowrap'}}>
                  <div style={{display:'flex',alignItems:'center',gap:8}}>
                    <div style={{
                      width:28,height:28,borderRadius:0,flexShrink:0,
                      background:avatarColor(r.emp.full_name),
                      display:'flex',alignItems:'center',justifyContent:'center',
                      fontSize:10,fontWeight:800,color:'#000',
                    }}>{initials(r.emp.full_name)}</div>
                    <span style={{fontWeight:700,color:'var(--t-text)',fontSize:13}}>{r.emp.full_name}</span>
                  </div>
                </td>
                {/* Location */}
                <td style={{padding:'8px 10px'}}>
                  <span style={{
                    fontSize:10,fontWeight:700,padding:'2px 7px',
                    background: LOC_BG_PALETTE[locColorIdx(r.location, locNames)],
                    color: LOC_PALETTE[locColorIdx(r.location, locNames)],
                    border: `1px solid ${LOC_PALETTE[locColorIdx(r.location, locNames)]}44`,
                    whiteSpace:'nowrap',
                  }}>{r.location}</span>
                </td>
                {/* Role */}
                <td style={{padding:'8px 10px'}}>
                  <span style={{
                    fontSize:10,fontWeight:700,padding:'2px 6px',
                    background: /key/i.test(r.emp.role)?'rgba(0,229,255,.12)':'rgba(52,199,89,.1)',
                    color: /key/i.test(r.emp.role)?'var(--t-accent)':'var(--t-success)',
                    border: `1px solid ${/key/i.test(r.emp.role)?'var(--t-accent)':'var(--t-success)'}44`,
                    whiteSpace:'nowrap',
                  }}>{r.emp.role}</span>
                </td>
                {/* Shift */}
                <td style={{padding:'8px 10px',color:'var(--t-text-muted)',fontSize:11,whiteSpace:'nowrap'}}>
                  {r.shiftLabel}
                </td>
                {/* Status */}
                <td style={{padding:'8px 10px'}}>
                  <span style={{
                    fontSize:10,fontWeight:800,padding:'3px 8px',whiteSpace:'nowrap',
                    background: r.statusBg||'transparent',
                    color: r.statusColor,
                    border: `1px solid ${r.statusColor}55`,
                  }}>
                    {r.status==='CLOCKED IN' && '✓ '}
                    {r.status==='CALLED OUT' && '✕ '}
                    {r.status==='NCNS' && '🚫 '}
                    {r.status==='LATE' && '⏰ '}
                    {r.status}
                  </span>
                </td>
                {/* Clock-in */}
                <td style={{padding:'8px 10px',fontSize:11,color:'var(--t-text-muted)',fontFamily:'monospace',whiteSpace:'nowrap'}}>
                  {r.clockInTime}
                </td>
                {/* Hrs today */}
                <td style={{padding:'8px 10px',fontSize:11,fontWeight:700,color:'var(--t-text)',fontFamily:'monospace'}}>
                  {r.hrsToday}
                </td>
                {/* OT Risk */}
                <td style={{padding:'8px 10px',whiteSpace:'nowrap'}}>
                  {r.otRisk
                    ? <span style={{fontSize:10,fontWeight:700,color:r.otColor}}>{(r.emp.hours_week??0)>=40?'🔴':'⚠'} {r.otRisk}</span>
                    : <span style={{fontSize:10,color:'var(--t-text-faint)'}}>—</span>
                  }
                </td>
                {/* Coverage */}
                <td style={{padding:'8px 10px',whiteSpace:'nowrap'}}>
                  {r.status==='CALLED OUT' || r.status==='NCNS'
                    ? <span style={{fontSize:11,fontWeight:800,color:'var(--t-danger)'}}>NEEDED</span>
                    : <span style={{fontSize:10,color:'var(--t-text-faint)'}}>—</span>
                  }
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        )}
      </div>

      {/* Summary bar */}
      <div style={{borderTop:'1px solid var(--t-line)',padding:'8px 14px',background:'var(--t-surface-2)',display:'flex',gap:16,flexWrap:'wrap',fontSize:11}}>
        <span style={{color:'var(--t-text-muted)'}}><b style={{color:'var(--t-text)'}}>{counts.scheduled}</b> scheduled</span>
        <span style={{color:'var(--t-text-muted)'}}><b style={{color:'var(--t-success)'}}>{counts.clockedIn}</b> clocked in</span>
        <span style={{color:'var(--t-text-muted)'}}><b style={{color:counts.calledOut>0?'var(--t-danger)':'var(--t-text-muted)'}}>{counts.calledOut}</b> called out</span>
        <span style={{color:'var(--t-text-muted)'}}><b style={{color:counts.late>0?'var(--t-warn)':'var(--t-text-muted)'}}>{counts.late}</b> late</span>
        <span style={{color:'var(--t-text-muted)'}}><b style={{color:'var(--t-text-muted)'}}>{counts.notYet}</b> not yet on shift</span>
        <span style={{color:'var(--t-text-muted)'}}><b style={{color:counts.ncns>0?'var(--t-danger)':'var(--t-text-muted)'}}>{counts.ncns}</b> NCNS</span>
      </div>
    </div>
  )
}

/* ── Section B: Shift Breakdown by Location (real shifts + sales) ── */
function ShiftBreakdownBoard({ d, roleName }) {
  const isManager = isHR(roleName)
  const now = new Date()
  const nowH = now.getHours() + now.getMinutes() / 60
  // Sales visibility rule preserved: non-managers see progress ONLY after 12PM
  const khCanSeeSales = isManager || nowH >= 12

  if (!d.locationStats.length) return null

  return (
    <div>
      <div style={{fontSize:11,fontWeight:700,letterSpacing:'.1em',color:'var(--t-accent)',textTransform:'uppercase',marginBottom:10}}>
        SHIFT BREAKDOWN BY LOCATION — TODAY
      </div>
      <div style={{display:'grid',gridTemplateColumns:`repeat(${Math.min(4, Math.max(1, d.locationStats.length))},1fr)`,gap:12}}>
        {d.locationStats.map(ls => {
          const hasGap = ls.callouts > 0 || ls.shiftsToday.some(r=>r.status==='NCNS')
          const borderColor = hasGap ? 'var(--t-danger)' : 'var(--t-success)'
          const am = ls.shiftsToday.filter(r => r.startH != null && r.startH < 12)
          const pm = ls.shiftsToday.filter(r => r.startH == null || r.startH >= 12)
          const mgrOnDuty = d.clockedInEmps.find(e => e.location === ls.name && /manager|lead|key/i.test(e.role))
          const sales = ls.sales
          const goal = sales?.daily_goal != null ? Number(sales.daily_goal) : null
          const amt  = sales ? Number(sales.today_amount || 0) : null
          const salesPct = goal && goal > 0 && amt != null ? Math.round(amt / goal * 100) : null

          return (
            <div key={ls.name} style={{background:'var(--t-surface)',border:`2px solid ${borderColor}33`,overflow:'hidden'}}>
              {/* Panel header */}
              <div style={{
                background: hasGap ? 'rgba(255,59,48,.08)' : 'rgba(52,199,89,.06)',
                borderBottom:`1px solid ${borderColor}55`,
                padding:'10px 12px',
              }}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:2}}>
                  <span style={{fontSize:13,fontWeight:800,color:'var(--t-text)'}}>{ls.name.toUpperCase()}</span>
                  <span style={{fontSize:10,fontWeight:700,color:borderColor}}>{hasGap ? '⚠ GAP' : ls.shiftsToday.length ? '● STAFFED' : '— NO SHIFTS'}</span>
                </div>
                <div style={{fontSize:10,color:'var(--t-text-faint)'}}>
                  Mgr on duty: <span style={{color:'var(--t-text-muted)',fontWeight:600}}>{mgrOnDuty?.full_name || '—'}</span>
                </div>
              </div>

              {/* AM + PM shifts — real scheduled people */}
              {[
                { list: am, label:'AM SHIFTS', accentColor:'var(--t-accent)' },
                { list: pm, label:'PM SHIFTS', accentColor:'var(--t-warn)'   },
              ].map(({ list, label, accentColor }, si) => (
                <div key={si} style={{padding:'8px 12px',borderBottom:si===0?`1px solid var(--t-line)`:undefined}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:5}}>
                    <span style={{fontSize:9,fontWeight:800,letterSpacing:'.08em',color:accentColor}}>{label}</span>
                    <span style={{fontSize:9,color:'var(--t-text-faint)'}}>{list.length} scheduled</span>
                  </div>
                  {list.length === 0 && (
                    <div style={{fontSize:10,color:'var(--t-text-faint)',fontStyle:'italic'}}>None scheduled</div>
                  )}
                  {list.map(r => {
                    const out = r.status==='CALLED OUT' || r.status==='NCNS'
                    return (
                      <div key={r.key} style={{marginBottom:3}}>
                        <div style={{display:'flex',alignItems:'center',gap:5}}>
                          <span style={{
                            fontSize:8,fontWeight:700,padding:'1px 4px',minWidth:30,textAlign:'center',
                            background: out?'rgba(255,59,48,.2)':/key/i.test(r.emp.role)?'rgba(0,229,255,.15)':'rgba(52,199,89,.12)',
                            color: out?'var(--t-danger)':/key/i.test(r.emp.role)?'var(--t-accent)':'var(--t-success)',
                            border:`1px solid ${out?'var(--t-danger)':/key/i.test(r.emp.role)?'var(--t-accent)':'var(--t-success)'}44`,
                          }}>{out?'OUT':(r.emp.role||'—').slice(0,6).toUpperCase()}</span>
                          <span style={{
                            fontSize:11,fontWeight:out?400:600,
                            color:out?'var(--t-danger)':'var(--t-text)',
                            textDecoration:out?'line-through':'none',opacity:out?.65:1,
                          }}>{r.emp.full_name}</span>
                          <span style={{fontSize:9,color:'var(--t-text-faint)'}}>{r.shiftLabel}</span>
                          {r.status==='CLOCKED IN' && <span style={{fontSize:8,color:'var(--t-success)',marginLeft:'auto'}}>● IN</span>}
                        </div>
                        {out && (
                          <div style={{fontSize:9,marginLeft:36,marginTop:1}}>
                            <span style={{color:'var(--t-danger)'}}>{r.status}</span>
                            <span style={{color:'var(--t-warn)',fontWeight:700,marginLeft:6}}>OPEN SHIFT</span>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              ))}

              {/* Today's numbers — real POS log rollup (get_cockpit_sales) */}
              <div style={{background:'var(--t-surface-2)',borderTop:'1px solid var(--t-line)',padding:'8px 12px'}}>
                <div style={{fontSize:9,fontWeight:700,letterSpacing:'.08em',color:'var(--t-text-muted)',marginBottom:6}}>TODAY'S NUMBERS</div>

                {(() => {
                  if (!sales) return (
                    <div style={{fontSize:10,color:'var(--t-text-faint)',fontStyle:'italic',marginBottom:6}}>
                      No sales data for this location
                    </div>
                  )
                  if (!khCanSeeSales) return (
                    <div style={{fontSize:10,color:'var(--t-text-faint)',fontStyle:'italic',marginBottom:6,padding:'4px 0',borderBottom:'1px solid var(--t-line)'}}>
                      Sales progress available after 12:00 PM
                    </div>
                  )
                  const pctBar = salesPct != null && (
                    <div style={{height:3,background:'var(--t-line)',marginBottom:4}}>
                      <div style={{width:`${Math.min(100,salesPct)}%`,height:'100%',background:salesPct>=80?'var(--t-success)':salesPct>=50?'var(--t-warn)':'var(--t-danger)'}}/>
                    </div>
                  )
                  if (isManager) return (
                    <div style={{marginBottom:5}}>
                      <div style={{display:'flex',justifyContent:'space-between',fontSize:10,marginBottom:2}}>
                        <span style={{color:'var(--t-text-muted)'}}>Sales{goal!=null?' vs goal':''}</span>
                        <span style={{color:'var(--t-text)',fontWeight:700}}>{fmt$(amt)}{goal!=null?` / ${fmt$(goal)}`:''}</span>
                      </div>
                      {pctBar}
                      {goal==null && <div style={{fontSize:9,color:'var(--t-text-faint)',fontStyle:'italic'}}>No daily goal set for this location</div>}
                    </div>
                  )
                  // Non-manager after threshold: % + amount needed only — never the total
                  if (salesPct == null) return (
                    <div style={{fontSize:10,color:'var(--t-text-faint)',fontStyle:'italic',marginBottom:6}}>No daily goal set</div>
                  )
                  const amountNeeded = Math.max(0, goal - amt)
                  return (
                    <div style={{marginBottom:5}}>
                      <div style={{display:'flex',justifyContent:'space-between',fontSize:10,marginBottom:2}}>
                        <span style={{color:'var(--t-text-muted)'}}>Goal progress</span>
                        <span style={{color:salesPct>=80?'var(--t-success)':salesPct>=50?'var(--t-warn)':'var(--t-danger)',fontWeight:700}}>{salesPct}%</span>
                      </div>
                      {pctBar}
                      <div style={{fontSize:10,color:amountNeeded===0?'var(--t-success)':'var(--t-warn)',fontWeight:700}}>
                        {amountNeeded===0 ? '✓ Goal reached!' : `Need ${fmt$(amountNeeded)} more to hit goal`}
                      </div>
                    </div>
                  )
                })()}

                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'2px 8px'}}>
                  {[
                    {l:'Transactions', v: sales ? Number(sales.today_txns||0) : '—', c:'var(--t-text)', show: khCanSeeSales},
                    {l:'Avg Ticket', v: sales && Number(sales.today_txns) > 0 ? fmt$(Number(sales.today_amount||0)/Number(sales.today_txns)) : '—', c:'var(--t-text)', show: isManager},
                    {l:'Open Incidents', v: d.openIncRows.filter(i => i.node_id === ls.node_id).length, c: d.openIncRows.some(i=>i.node_id===ls.node_id)?'var(--t-danger)':'var(--t-text-muted)', show: true},
                    {l:'On Floor Now', v: ls.clockedIn, c:'var(--t-success)', show: true},
                  ].filter(x=>x.show).map(({l,v,c})=>(
                    <div key={l} style={{display:'flex',justifyContent:'space-between',fontSize:10,padding:'1px 0'}}>
                      <span style={{color:'var(--t-text-faint)'}}>{l}</span>
                      <span style={{fontWeight:700,color:c}}>{v}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ── Section C: Today's Event Feed — real punches/incidents/DAs ──── */
const FEED_TYPES = ['all','clock','callout','alert']

function TodayEventFeed({ d, nav }) {
  const [filter, setFilter] = useState('all')
  const visible = filter === 'all' ? d.feed : d.feed.filter(e => e.type === filter)

  return (
    <div style={{background:'var(--t-surface)',border:'1px solid var(--t-line)',overflow:'hidden'}}>
      {/* Header */}
      <div style={{background:'var(--t-surface-2)',borderBottom:'1px solid var(--t-line)',padding:'10px 12px'}}>
        <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:8}}>
          <span style={{fontSize:11,fontWeight:800,letterSpacing:'.08em',color:'var(--t-accent)',textTransform:'uppercase'}}>TODAY'S FEED</span>
          <span style={{width:7,height:7,borderRadius:'50%',background:'var(--t-danger)',display:'inline-block',animation:'pulse 1.4s infinite'}}/>
          <span style={{fontSize:9,fontWeight:700,color:'var(--t-danger)'}}>LIVE</span>
        </div>
        <div style={{display:'flex',gap:3,flexWrap:'wrap'}}>
          {FEED_TYPES.map(t=>(
            <button key={t} onClick={()=>setFilter(t)} style={{
              padding:'2px 8px',fontSize:9,fontWeight:700,cursor:'pointer',
              border:'1px solid var(--t-line)',textTransform:'uppercase',letterSpacing:'.05em',
              background: filter===t ? 'var(--t-accent)' : 'var(--t-bg)',
              color: filter===t ? '#000' : 'var(--t-text-muted)',
            }}>{t}</button>
          ))}
        </div>
      </div>

      {/* Feed items */}
      <div style={{maxHeight:420,overflowY:'auto'}}>
        {visible.length === 0 && (
          <div style={{padding:'18px 12px',fontSize:11,color:'var(--t-text-faint)',fontStyle:'italic'}}>
            No events logged today yet — clock-ins, callouts and DAs will appear here as they happen.
          </div>
        )}
        {visible.map((ev, i) => (
          <div key={i} style={{
            borderBottom:'1px solid var(--t-line)',
            borderLeft:`3px solid ${ev.color}`,
            padding:'8px 10px',
            display:'flex',gap:8,alignItems:'flex-start',
          }}>
            <span style={{fontSize:13,flexShrink:0,lineHeight:1.2}}>{ev.icon}</span>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:11,color:'var(--t-text)',lineHeight:1.35}}>{ev.text}</div>
              <div style={{fontSize:9,fontFamily:'monospace',color:'var(--t-text-faint)',marginTop:2}}>
                {ev.ts ? ev.ts.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'}) : 'today'}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Quick action buttons */}
      <div style={{borderTop:'1px solid var(--t-line)',padding:'10px 12px',background:'var(--t-surface-2)'}}>
        <div style={{fontSize:9,fontWeight:700,letterSpacing:'.08em',color:'var(--t-text-muted)',textTransform:'uppercase',marginBottom:7}}>QUICK ACTIONS</div>
        <div style={{display:'flex',flexDirection:'column',gap:5}}>
          {[
            {l:'Find Coverage',to:'/coverage'},{l:'Log Callout',to:'/callout'},
            {l:'Approve PTO',to:'/requests'},{l:'Issue DA',to:'/disciplinary'},
            {l:'View Reports',to:'/reports'},
          ].map(({l,to})=>(
            <button key={l} onClick={()=>nav(to)} style={{
              width:'100%',background:'var(--t-bg)',border:'1px solid var(--t-line)',
              color:'var(--t-text)',padding:'7px 10px',fontSize:11,fontWeight:600,
              cursor:'pointer',textAlign:'left',
            }}>{l}</button>
          ))}
        </div>
      </div>
    </div>
  )
}

/* ── Feature 1: Labor Cost % of Revenue (real punches × wages vs POS) ─ */
function LaborCostRow({ d }) {
  const config = useConfig()
  const target = config.labor_cost_target_pct ?? 30
  const warn   = config.labor_cost_warn_pct   ?? 38
  const [drill, setDrill] = useState(null)

  // Per-location labor rows — real: week punch hours × wage vs MTD revenue pace
  const laborRows = useMemo(() => d.locationStats.map(ls => {
    const revenue   = ls.sales ? Number(ls.sales.mtd_amount || 0) : null
    const payrollHrs = ls.totalHrs
    const laborCost = ls.laborCost
    const laborPct  = laborCost != null && revenue ? Math.round(laborCost / revenue * 100) : null
    const revPerHr  = revenue != null && payrollHrs > 0 ? Math.round(revenue / payrollHrs) : null
    return { loc: ls.name, laborPct, payrollHrs, revPerHr, revenue, laborCost }
  }), [d.locationStats])

  const LABOR_COLS = [
    { key: 'loc', label: 'Location', value: r => r.loc },
    { key: 'laborPct', label: 'Labor Cost %', value: r => r.laborPct != null ? `${r.laborPct}%` : '—', align: 'right', sortKey: r => r.laborPct ?? -1 },
    { key: 'payrollHrs', label: 'Payroll Hrs (wk)', value: r => fmtH(r.payrollHrs), align: 'right', sortKey: r => r.payrollHrs },
    { key: 'revPerHr', label: 'Revenue / Hr', value: r => r.revPerHr != null ? `$${r.revPerHr}/hr` : '—', align: 'right', sortKey: r => r.revPerHr ?? -1 },
    { key: 'revenue', label: 'Revenue MTD', value: r => fmt$(r.revenue), align: 'right', sortKey: r => r.revenue ?? -1 },
    { key: 'laborCost', label: 'Labor Cost (wk)', value: r => fmt$(r.laborCost), align: 'right', sortKey: r => r.laborCost ?? -1 },
  ]
  const openDrill = (title, accent) => setDrill({ title, subtitle: `${laborRows.length} locations · labor cost vs. revenue (live punches × wage history vs POS log)`, columns: LABOR_COLS, rows: laborRows, accent })

  if (!laborRows.length) return null

  return (
    <div>
      <div style={{fontSize:11,fontWeight:700,letterSpacing:'.1em',color:'var(--t-accent)',textTransform:'uppercase',marginBottom:10}}>
        LABOR COST vs. REVENUE
      </div>
      {d.wageCoverage === 0 && (
        <div style={{fontSize:11,color:'var(--t-text-faint)',fontStyle:'italic',marginBottom:8}}>
          No wages on file yet — labor cost shows “—” until wages are entered in employee files.
        </div>
      )}
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(160px,1fr))',gap:8}}>
        {laborRows.map(row => {
          const { loc, laborPct, payrollHrs, revPerHr } = row
          const laborColor  = laborPct == null ? 'var(--t-text-muted)' : laborPct < target ? 'var(--t-success)' : laborPct < warn ? 'var(--t-warn)' : 'var(--t-danger)'
          const laborAlert  = laborPct == null ? null : laborPct >= warn ? 'red' : laborPct >= target ? 'amber' : null
          return [
            <KTile key={`lc-${loc}`}
              label={`${loc} · Labor Cost %`}
              value={laborPct != null ? `${laborPct}%` : '—'}
              sub={laborPct != null ? `Target: ${target}%` : 'needs wages + sales'}
              color={laborColor}
              alert={laborAlert}
              onClick={() => openDrill(`${loc} — Labor Cost %`, laborColor)}
            />,
            <KTile key={`ph-${loc}`}
              label={`${loc} · Payroll Hrs`}
              value={fmtH(payrollHrs)}
              sub="this week (punches)"
              onClick={() => openDrill(`${loc} — Payroll Hours`, 'var(--t-accent)')}
            />,
            <KTile key={`rh-${loc}`}
              label={`${loc} · Revenue/Hr`}
              value={revPerHr != null ? `$${revPerHr}/hr` : '—'}
              sub="MTD revenue ÷ week hrs"
              onClick={() => openDrill(`${loc} — Revenue per Hour`, 'var(--t-accent)')}
            />,
          ]
        })}
      </div>
      <DrillDown open={!!drill} onClose={() => setDrill(null)} {...(drill || {})} />
    </div>
  )
}

/* ── Feature 2: Budget vs. Actual (sales_goals + sales_logs) ─────── */
function BudgetActualCard({ d }) {
  const now = new Date()
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  const daysElapsed = now.getDate()
  const daysLeft    = daysInMonth - daysElapsed
  const monthName   = now.toLocaleString('en-US', { month: 'long' })

  const rows = d.salesByNode.map(s => {
    const goal    = s.monthly_goal != null ? Number(s.monthly_goal) : null
    const soldMTD = Number(s.mtd_amount || 0)
    const gap     = goal != null ? goal - soldMTD : null
    const pace    = daysElapsed > 0 ? soldMTD / daysElapsed : 0
    const required = goal != null ? goal / daysInMonth : null
    const onPace  = required != null ? pace >= required * 0.9 : null
    return { loc: s.node_name, goal, soldMTD, gap, daysLeft, onPace }
  })

  if (!rows.length) return (
    <div style={{background:'var(--t-surface)',border:'1px solid var(--t-line)',padding:'16px 14px',fontSize:12,color:'var(--t-text-faint)',fontStyle:'italic'}}>
      Budget vs. Actual — no sales data available for this scope yet.
    </div>
  )

  return (
    <div style={{background:'var(--t-surface)',border:'1px solid var(--t-line)',overflow:'hidden'}}>
      <div style={{background:'var(--t-surface-2)',borderBottom:'1px solid var(--t-line)',padding:'10px 14px',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
        <span style={{fontSize:11,fontWeight:800,letterSpacing:'.1em',color:'var(--t-accent)',textTransform:'uppercase'}}>
          BUDGET vs. ACTUAL — {monthName.toUpperCase()}
        </span>
        <span style={{fontSize:9,fontWeight:800,padding:'2px 8px',background:'var(--t-success)',color:'#000',letterSpacing:'.06em'}}>LIVE</span>
      </div>
      <div style={{overflowX:'auto'}}>
        <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
          <thead>
            <tr style={{background:'var(--t-surface-2)',borderBottom:'1px solid var(--t-line)'}}>
              {['Location','Monthly Goal','Sold MTD','%','Gap','Days Left'].map(h => (
                <th key={h} style={{padding:'8px 12px',textAlign:'left',color:'var(--t-text-muted)',fontWeight:700,fontSize:10,letterSpacing:'.06em',textTransform:'uppercase',whiteSpace:'nowrap'}}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(r => {
              const pct = r.goal ? Math.round(r.soldMTD / r.goal * 100) : null
              return (
                <tr key={r.loc} style={{borderBottom:'1px solid var(--t-line)'}}>
                  <td style={{padding:'10px 12px',fontWeight:700,color:'var(--t-text)'}}>{r.loc}</td>
                  <td style={{padding:'10px 12px',fontFamily:'monospace',color:'var(--t-text-muted)'}}>
                    {r.goal != null ? `$${r.goal.toLocaleString()}` : <span style={{fontStyle:'italic',color:'var(--t-text-faint)'}}>no goal set</span>}
                  </td>
                  <td style={{padding:'10px 12px',fontFamily:'monospace',fontWeight:700,color:'var(--t-text)'}}>${r.soldMTD.toLocaleString()}</td>
                  <td style={{padding:'10px 12px'}}>
                    {pct != null ? (
                      <div style={{display:'flex',alignItems:'center',gap:6}}>
                        <div style={{width:48,height:4,background:'var(--t-line)'}}>
                          <div style={{width:`${Math.min(100,pct)}%`,height:'100%',background:pct>=90?'var(--t-success)':pct>=70?'var(--t-warn)':'var(--t-danger)'}}/>
                        </div>
                        <span style={{fontSize:11,fontWeight:700,color:pct>=90?'var(--t-success)':pct>=70?'var(--t-warn)':'var(--t-danger)'}}>{pct}%</span>
                      </div>
                    ) : <span style={{fontSize:11,color:'var(--t-text-faint)'}}>—</span>}
                  </td>
                  <td style={{padding:'10px 12px',fontFamily:'monospace',fontWeight:700,color:r.onPace==null?'var(--t-text-faint)':r.onPace?'var(--t-success)':'var(--t-danger)'}}>
                    {r.gap != null ? <>{r.onPace ? '✓' : '▼'} ${Math.max(0,r.gap).toLocaleString()}</> : '—'}
                  </td>
                  <td style={{padding:'10px 12px',color:'var(--t-text-muted)',fontFamily:'monospace'}}>{r.daysLeft}d</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/* ── Feature 3: Shrinkage & Incident Alerts (real incidents table) ── */
function ShrinkageAlertsCard({ d, nav }) {
  const anomalies = d.openIncRows.map(r => ({
    sev: ['high','critical'].includes((r.severity||'').toLowerCase()) ? 'red' : 'amber',
    loc: d.locList.find(l => l.id === r.node_id)?.name || '—',
    text: r.description || r.type || 'Open incident',
    ts: String(r.date || r.created_at || '').slice(0, 10),
  }))

  return (
    <div style={{background:'var(--t-surface)',border:'1px solid var(--t-line)',overflow:'hidden',position:'relative'}}>
      <div style={{background:'var(--t-surface-2)',borderBottom:'1px solid var(--t-line)',padding:'10px 14px',display:'flex',alignItems:'center',gap:8}}>
        <span style={{fontSize:11,fontWeight:800,letterSpacing:'.1em',color:'var(--t-accent)',textTransform:'uppercase'}}>SHRINKAGE & INCIDENT ALERTS</span>
        <span style={{width:7,height:7,background:'var(--t-danger)',borderRadius:'50%',display:'inline-block',animation:'pulse 1.4s infinite'}}/>
        <span style={{fontSize:9,fontWeight:700,padding:'1px 6px',background:'rgba(255,77,125,.15)',color:'var(--t-danger)',border:'1px solid var(--t-danger)44',marginLeft:'auto'}}>{anomalies.length} OPEN</span>
      </div>
      <div style={{padding:'8px 0'}}>
        {anomalies.length === 0
          ? <div style={{padding:'16px 14px',fontSize:12,color:'var(--t-text-faint)',fontStyle:'italic'}}>No open incidents</div>
          : anomalies.map((a, i) => {
              const borderColor = a.sev === 'red' ? 'var(--t-danger)' : 'var(--t-warn)'
              const bgColor     = a.sev === 'red' ? 'rgba(255,59,48,.06)' : 'rgba(255,184,0,.06)'
              return (
                <div key={i} style={{
                  borderLeft:`3px solid ${borderColor}`,
                  background: bgColor,
                  padding:'10px 14px',
                  borderBottom: i < anomalies.length - 1 ? '1px solid var(--t-line)' : undefined,
                  display:'flex',alignItems:'center',gap:10,
                }}>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:11,fontWeight:700,color:'var(--t-text)',marginBottom:2}}>
                      <span style={{color:borderColor,marginRight:6}}>{a.loc}:</span>{a.text}
                    </div>
                    <div style={{fontSize:10,color:'var(--t-text-faint)',fontFamily:'monospace'}}>{a.ts}</div>
                  </div>
                  <button
                    onClick={() => nav && nav('/incidents')}
                    style={{flexShrink:0,background:borderColor,color:a.sev==='red'?'#fff':'#000',border:'none',padding:'4px 10px',fontSize:11,fontWeight:700,cursor:'pointer'}}
                  >
                    Review
                  </button>
                </div>
              )
            })
        }
      </div>
    </div>
  )
}

/* ── Feature 4: Scheduling Compliance Banner (real next-week shifts) ── */
function SchedulingComplianceBanner({ d, nav }) {
  const config = useConfig()
  const publishHours = config.schedule_publish_hours ?? 72

  if (!d.unpublishedLocs.length) return null

  // hours until next Monday 12:00 AM
  const now     = new Date()
  const dayOfWk = now.getDay()
  const daysToMon = dayOfWk === 0 ? 1 : 8 - dayOfWk
  const nextMon = new Date(now)
  nextMon.setDate(now.getDate() + daysToMon)
  nextMon.setHours(0, 0, 0, 0)
  const hoursUntil = Math.round((nextMon - now) / 3600000)

  if (hoursUntil > publishHours) return null

  return (
    <div style={{
      background:'rgba(255,184,0,.10)',
      border:'1px solid var(--t-warn)',
      borderLeft:'4px solid var(--t-warn)',
      padding:'10px 24px',
      display:'flex',alignItems:'center',gap:10,
      fontSize:12,
    }}>
      <span style={{fontSize:14,flexShrink:0}}>⚠</span>
      <span style={{fontWeight:700,color:'var(--t-warn)',flex:1}}>
        {d.unpublishedLocs.join(', ')} — no shifts published for next week. {hoursUntil} hours until deadline.
      </span>
      <button
        onClick={() => nav('/schedule')}
        style={{flexShrink:0,background:'var(--t-warn)',color:'#000',border:'none',padding:'5px 14px',fontSize:11,fontWeight:800,cursor:'pointer'}}
      >
        Publish Now →
      </button>
    </div>
  )
}

/* ── Feature 5: Executive Digest Card (real yesterday data) ──────── */
function ExecutiveDigestCard({ d }) {
  const [open, setOpen] = useState(false)
  const [drill, setDrill] = useState(null)

  const revRows = d.salesByNode.map(s => {
    const amt = Number(s.yesterday_amount || 0)
    const goal = s.daily_goal != null ? Number(s.daily_goal) : null
    return { loc: s.node_name, amt, goal, rev: goal ? Math.round(amt / goal * 100) : null, gap: goal ? Math.max(0, goal - amt) : null }
  })
  const totalRev = revRows.reduce((s, r) => s + r.amt, 0)

  const attendance = d.headcount > 0 ? Math.round((d.headcount - d.yCallouts - d.yNcns) / d.headcount * 100) : null
  const openDAsEx  = d.openDAs
  const topPerf    = d.perf[0] || null

  const REV_COLS = [
    { key: 'loc', label: 'Location', value: r => r.loc },
    { key: 'amt', label: 'Revenue', value: r => `$${r.amt.toLocaleString()}`, align: 'right', sortKey: r => r.amt },
    { key: 'goal', label: 'Daily Goal', value: r => r.goal != null ? `$${r.goal.toLocaleString()}` : '—', align: 'right', sortKey: r => r.goal ?? -1 },
    { key: 'rev', label: '% of Goal', value: r => r.rev != null ? `${r.rev}%` : '—', align: 'right', sortKey: r => r.rev ?? -1 },
    { key: 'gap', label: 'Gap', value: r => r.gap != null ? `$${r.gap.toLocaleString()}` : '—', align: 'right', sortKey: r => r.gap ?? -1 },
  ]
  const openRevDrill = (title, accent) => setDrill({ title, subtitle: `${revRows.length} locations · yesterday's POS log revenue`, columns: REV_COLS, rows: revRows, accent })
  const yesterday  = new Date(); yesterday.setDate(yesterday.getDate() - 1)
  const ydateStr   = yesterday.toLocaleDateString('en-US', { weekday:'short', month:'short', day:'numeric' })

  const summaryLine = `EXECUTIVE DIGEST — ${ydateStr} | Total Revenue: $${totalRev.toLocaleString()} | Attendance: ${attendance != null ? `${attendance}%` : '—'} | ${openDAsEx} Open Issue${openDAsEx !== 1 ? 's' : ''}`

  return (
    <div style={{background:'var(--t-surface)',border:'1px solid var(--t-line)',overflow:'hidden'}}>
      {/* Collapsed header — always visible */}
      <div
        onClick={() => setOpen(p => !p)}
        style={{
          background:'var(--t-surface-2)',
          borderBottom: open ? '1px solid var(--t-line)' : undefined,
          padding:'12px 14px',
          display:'flex',alignItems:'center',justifyContent:'space-between',
          cursor:'pointer',
          userSelect:'none',
        }}
      >
        <span style={{fontSize:11,fontWeight:700,color:'var(--t-text)',letterSpacing:'.04em'}}>{summaryLine}</span>
        <span style={{fontSize:13,color:'var(--t-text-muted)',flexShrink:0,marginLeft:12}}>{open ? '▲' : '▼'}</span>
      </div>

      {/* Expanded detail */}
      {open && (
        <div style={{padding:'16px 14px',display:'flex',flexDirection:'column',gap:16}}>
          {/* Yesterday's revenue by location */}
          <div>
            <div style={{fontSize:10,fontWeight:700,letterSpacing:'.1em',color:'var(--t-accent)',textTransform:'uppercase',marginBottom:8}}>YESTERDAY'S REVENUE BY LOCATION</div>
            {revRows.length === 0 ? (
              <div style={{fontSize:12,color:'var(--t-text-faint)',fontStyle:'italic'}}>No sales data available for this scope.</div>
            ) : (
              <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(140px,1fr))',gap:8}}>
                {revRows.map(({ loc, rev, amt }) => (
                    <KTile
                      key={loc}
                      label={loc}
                      value={`$${amt.toLocaleString()}`}
                      sub={rev != null ? `${rev}% of goal` : 'no goal set'}
                      color={rev == null ? 'var(--t-text)' : rev >= 85 ? 'var(--t-success)' : rev >= 65 ? 'var(--t-warn)' : 'var(--t-danger)'}
                      onClick={() => openRevDrill(`${loc} — Yesterday's Revenue`, 'var(--t-accent)')}
                    />
                ))}
              </div>
            )}
          </div>

          {/* Stats row */}
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(160px,1fr))',gap:8}}>
            <KTile
              label="Top Performer"
              value={topPerf ? topPerf.name : '—'}
              sub={topPerf ? `${fmt$(topPerf.sales)} sold` : 'no sales logged'}
              color="var(--t-success)"
              onClick={() => setDrill({
                title: 'Top Performers',
                subtitle: `${d.perf.length} ranked by logged sales (yesterday → today)`,
                accent: 'var(--t-success)',
                columns: [
                  { key: 'rank', label: 'Rank', value: r => r.rank, align: 'right', sortKey: r => r.rank },
                  { key: 'name', label: 'Employee', value: r => r.name },
                  { key: 'sales', label: 'Sales', value: r => fmt$(r.sales), align: 'right', sortKey: r => r.sales },
                  { key: 'units', label: 'Units', value: r => r.units, align: 'right', sortKey: r => r.units },
                ],
                rows: d.perf.map((p, i) => ({ rank: i + 1, ...p })),
              })}
            />
            <KTile
              label="Attendance Rate"
              value={attendance != null ? `${attendance}%` : '—'}
              sub="yesterday"
              color={attendance == null ? 'var(--t-text-muted)' : attendance >= 95 ? 'var(--t-success)' : attendance >= 88 ? 'var(--t-warn)' : 'var(--t-danger)'}
              alert={attendance == null ? null : attendance < 88 ? 'red' : attendance < 95 ? 'amber' : null}
              onClick={() => openRevDrill('Yesterday — Revenue by Location', 'var(--t-accent)')}
            />
            <KTile
              label="Open D.A.s"
              value={openDAsEx}
              sub="require review"
              color={openDAsEx > 0 ? 'var(--t-warn)' : 'var(--t-text-muted)'}
              alert={openDAsEx > 1 ? 'amber' : null}
              onClick={() => setDrill({
                title: 'Open Disciplinary Actions',
                subtitle: `${openDAsEx} action${openDAsEx === 1 ? '' : 's'} requiring review · live records`,
                accent: 'var(--t-warn)',
                columns: [
                  { key: 'emp', label: 'Employee', value: r => r.person_name || '—' },
                  { key: 'loc', label: 'Location', value: r => r.node_name || '—' },
                  { key: 'type', label: 'Type', value: r => r.type || '—' },
                  { key: 'issued', label: 'Issued', value: r => r.issued_date || '—' },
                  { key: 'by', label: 'Issued By', value: r => r.issued_by_name || '—' },
                ],
                rows: d.openDaRows,
              })}
            />
            <KTile
              label="Total Revenue"
              value={`$${totalRev.toLocaleString()}`}
              sub="all locations · yesterday"
              color="var(--t-text)"
              onClick={() => openRevDrill('Total Revenue — By Location', 'var(--t-accent)')}
            />
          </div>

          {/* Callouts */}
          <div>
            <div style={{fontSize:10,fontWeight:700,letterSpacing:'.1em',color:'var(--t-text-muted)',textTransform:'uppercase',marginBottom:6}}>CALLOUTS — YESTERDAY</div>
            <div style={{fontSize:12,color:'var(--t-text-faint)',fontStyle:'italic'}}>
              {d.yCallouts + d.yNcns === 0
                ? 'No callouts logged — full coverage maintained'
                : `${d.yCallouts} callout${d.yCallouts === 1 ? '' : 's'}${d.yNcns > 0 ? ` · ${d.yNcns} NCNS` : ''} logged yesterday`
              }
            </div>
          </div>
        </div>
      )}
      <DrillDown open={!!drill} onClose={() => setDrill(null)} {...(drill || {})} />
    </div>
  )
}

/* ── main ─────────────────────────────────────────────────────────── */
export default function Cockpit() {
  const nav = useNavigate()
  const { session } = useAuth()
  const { locationIds, locations, setScope } = useScope()
  const clock = useLiveClock()
  const person = session?.person
  const personId = person?.id
  const roleName = person?.role_name || ''
  const isManager = isHR(roleName)

  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)
  const [activeSection, setActiveSection] = useState('overview') // overview | locations | alerts | live
  const [drill, setDrill] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    const nodeIds = locationIds || []
    if (!nodeIds.length) { setData(null); setLoading(false); return }
    const todayS = today()
    const yestS  = addDays(todayS, -1)
    const wkS    = weekStart()
    try {
      const results = await Promise.allSettled([
        sb.rpc('get_roster',               { p_node_ids: nodeIds, p_actor: personId || null }),      // 0
        sb.rpc('scope_shifts',             { p_node_ids: nodeIds, p_actor: personId || null }),      // 1
        sb.rpc('get_all_time_entries',     { p_node_ids: nodeIds, p_date_from: wkS, p_date_to: todayS }), // 2
        sb.rpc('get_attendance_overview',  { p_node_ids: nodeIds }),                                 // 3
        sb.rpc('get_disciplinary_actions', { p_node_ids: nodeIds }),                                 // 4
        sb.rpc('get_pending_requests',     { p_node_ids: nodeIds }),                                 // 5
        sb.rpc('hr_dashboard',             { p_node_ids: nodeIds }),                                 // 6
        sb.rpc('get_coverage_gaps',        { p_node_ids: nodeIds, p_date_from: todayS, p_date_to: todayS }), // 7
        sb.rpc('get_incidents',            { p_node_ids: nodeIds }),                                 // 8
        sb.rpc('get_cockpit_sales',        { p_node_ids: nodeIds }),                                 // 9
        sb.rpc('get_current_wages',        { p_node_ids: nodeIds }),                                 // 10
        sb.rpc('get_employee_sales',       { p_node_ids: nodeIds, p_date_from: yestS, p_date_to: todayS }), // 11
      ])
      const val = i => {
        const r = results[i]
        return (r.status === 'fulfilled' && r.value && !r.value.error) ? r.value.data : null
      }
      // The two primary reads (roster + shifts) failing means the screen has no
      // spine — surface an honest error rather than an empty dashboard.
      const rosterFailed = !(results[0].status === 'fulfilled' && !results[0].value?.error)
      const shiftsFailed = !(results[1].status === 'fulfilled' && !results[1].value?.error)
      if (rosterFailed && shiftsFailed) {
        const err = results[0].status === 'fulfilled' ? results[0].value?.error : results[0].reason
        throw new Error(err?.message || 'Roster and schedule reads failed')
      }
      setData(buildModel({
        roster:   val(0)  || [],
        shifts:   val(1)  || [],
        punches:  val(2)  || [],
        overview: val(3)  || [],
        das:      val(4)  || [],
        pending:  val(5)  || {},
        hrDash:   val(6)  || {},
        gaps:     val(7)  || [],
        incidents:val(8)  || [],
        sales:    val(9)  || [],   // null until 20260717_cockpit.sql is applied → honest '—'
        wages:    val(10) || [],   // idem
        empSales: val(11) || [],
        locations,
      }))
    } catch (e) {
      setData(null)
      setLoadError(e?.message || 'Failed to load command center data')
    }
    setLoading(false)
  }, [locationIds.join(','), personId, locations])

  useEffect(() => { load() }, [load])

  const criticalAlerts = useMemo(()=>(data?.alerts||[]).filter(a=>a.sev==='critical'),[data])
  const warningAlerts = useMemo(()=>(data?.alerts||[]).filter(a=>a.sev==='warning'),[data])
  const infoAlerts = useMemo(()=>(data?.alerts||[]).filter(a=>a.sev==='info'),[data])

  const staffCounts = useMemo(() => {
    if (!data) return null
    const rows = data.rows
    return {
      all: rows,
      scheduled: rows.length,
      clockedIn:  rows.filter(r=>r.status==='CLOCKED IN'),
      calledOut:  rows.filter(r=>r.status==='CALLED OUT'),
      late:       rows.filter(r=>r.status==='LATE'),
      ncns:       rows.filter(r=>r.status==='NCNS'),
      offDuty:    rows.filter(r=>r.status==='OFF DUTY'),
      notYet:     rows.filter(r=>r.status==='SCHEDULED'),
    }
  }, [data])

  /* drill-down column sets — every KPI tile exposes its live source rows */
  const STAFF_COLS = [
    { key:'name',    label:'Employee', value:r=>r.emp?.full_name || '—' },
    { key:'role',    label:'Role',     value:r=>r.emp?.role || '—' },
    { key:'loc',     label:'Location', value:r=>r.location || '—' },
    { key:'status',  label:'Status',   value:r=>r.status },
    { key:'shift',   label:'Shift',    value:r=>r.shiftLabel || '—' },
    { key:'clockin', label:'Clock-In', value:r=>r.clockInTime || '—' },
    { key:'hrs',     label:'Hrs Today',value:r=>r.hrsToday || '—' },
    { key:'ot',      label:'OT Risk',  value:r=>r.otRisk || '—' },
  ]
  const openStaffDrill = (label, rows, accent) => setDrill({
    title: label, subtitle:`${rows.length} employee${rows.length===1?'':'s'} · live schedule + punch data`, columns: STAFF_COLS, rows, accent,
  })
  const ALERT_COLS = [
    { key:'sev',    label:'Severity', value:r=>(r.sev||'').toUpperCase() },
    { key:'title',  label:'Alert',    value:r=>r.title || '—' },
    { key:'detail', label:'Detail',   value:r=>r.detail || '—' },
    { key:'action', label:'Action',   value:r=>r.action || '—' },
  ]
  const EMP_COLS = [
    { key:'full_name', label:'Employee', value:e=>e.full_name },
    { key:'location',  label:'Location', value:e=>e.location },
    { key:'role',      label:'Role',     value:e=>e.role },
    { key:'hours_week',label:'Hrs / Wk', value:e=>fmtH(e.hours_week), align:'right', sortKey:e=>e.hours_week },
    { key:'callouts_30d', label:'Callouts 30d', value:e=>e.callouts_30d, align:'right', sortKey:e=>e.callouts_30d },
    { key:'lates_30d', label:'Tardies 30d', value:e=>e.lates_30d, align:'right', sortKey:e=>e.lates_30d },
    { key:'open_das',  label:'Open D.A.s', value:e=>e.open_das, align:'right', sortKey:e=>e.open_das },
  ]
  const OT_COLS = [
    { key:'full_name', label:'Employee', value:e=>e.full_name },
    { key:'location',  label:'Location', value:e=>e.location },
    { key:'role',      label:'Role',     value:e=>e.role },
    { key:'hours_week',label:'Hrs / Wk', value:e=>fmtH(e.hours_week), align:'right', sortKey:e=>e.hours_week },
    { key:'ot',        label:'OT Hrs',   value:e=>fmtH(Math.max(0,e.hours_week-40)), align:'right', sortKey:e=>Math.max(0,e.hours_week-40) },
    { key:'wage',      label:'Wage',     value:e=>fmt$(e.wage), align:'right', sortKey:e=>e.wage ?? -1 },
    { key:'otCost',    label:'OT Cost',  value:e=>e.wage!=null?fmt$(Math.max(0,e.hours_week-40)*e.wage*1.5):'—', align:'right', sortKey:e=>e.wage!=null?Math.max(0,e.hours_week-40)*e.wage*1.5:-1 },
  ]
  const LOCSTAT_COLS = [
    { key:'name',      label:'Location', value:l=>l.name },
    { key:'headcount', label:'Headcount', value:l=>l.headcount, align:'right', sortKey:l=>l.headcount },
    { key:'clockedIn', label:'Clocked In', value:l=>l.clockedIn, align:'right', sortKey:l=>l.clockedIn },
    { key:'coverage',  label:'Coverage', value:l=>l.coverage!=null?`${l.coverage}%`:'—', align:'right', sortKey:l=>l.coverage ?? -1 },
    { key:'callouts',  label:'Callouts', value:l=>l.callouts, align:'right', sortKey:l=>l.callouts },
    { key:'otCount',   label:'OT Emps', value:l=>l.otCount, align:'right', sortKey:l=>l.otCount },
    { key:'trainingPct', label:'Training', value:l=>l.trainingPct!=null?`${l.trainingPct}%`:'—', align:'right', sortKey:l=>l.trainingPct ?? -1 },
    { key:'openDAs',   label:'Open D.A.s', value:l=>l.openDAs, align:'right', sortKey:l=>l.openDAs },
  ]
  const openDrill = (title, rows, cols, accent) => setDrill({
    title, subtitle:`${rows.length} record${rows.length===1?'':'s'} behind this metric · live data`, columns:cols, rows, accent,
  })

  const dateStr = clock.toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric',year:'numeric'})
  const greeting = clock.getHours()<12?'Good morning':clock.getHours()<17?'Good afternoon':'Good evening'

  const flagLaborCost      = useFeatureFlag('labor_cost_pct')
  const flagBudgetActual   = useFeatureFlag('budget_actual')
  const flagShrinkage      = useFeatureFlag('shrinkage_alerts')
  const flagExecDigest     = useFeatureFlag('executive_digest')
  const flagSchedCompliance = useFeatureFlag('scheduling_compliance')

  if (loading) return <div className="loader">Loading command center…</div>

  if (loadError) return (
    <div style={{padding:'48px 24px',textAlign:'center'}}>
      <div style={{fontSize:15,fontWeight:800,color:'var(--t-danger)',marginBottom:8}}>Command center data unavailable</div>
      <div style={{fontSize:12,color:'var(--t-text-muted)',marginBottom:16}}>{loadError}</div>
      <button onClick={load} style={{background:'var(--t-accent)',color:'#000',border:'none',padding:'8px 18px',fontSize:12,fontWeight:800,cursor:'pointer'}}>↻ Retry</button>
    </div>
  )

  if (!data) return (
    <div style={{padding:'48px 24px',textAlign:'center',color:'var(--t-text-muted)',fontSize:13}}>
      No locations in scope — select a location to load the command center.
    </div>
  )

  const d = data

  return (
    <div style={{display:'flex',flexDirection:'column',gap:0}}>

      {/* ── HEADER BAND ─────────────────────────────────────────── */}
      <div style={{background:'linear-gradient(135deg,#070b14 0%,#0d1a2e 100%)',borderBottom:'1px solid var(--t-line)',padding:'20px 24px',marginBottom:0}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',flexWrap:'wrap',gap:12}}>
          <div>
            <div style={{fontSize:11,color:'var(--t-accent)',fontWeight:700,letterSpacing:'.1em',textTransform:'uppercase',marginBottom:4}}>Twisted Growers — Command Center</div>
            <div style={{fontSize:22,fontWeight:800,color:'var(--t-text)',marginBottom:2}}>{greeting}, {person?.full_name?.split(' ')[0]||'Manager'}</div>
            <div style={{fontSize:13,color:'var(--t-text-muted)'}}>{dateStr}</div>
          </div>
          <div style={{textAlign:'right'}}>
            <div style={{fontSize:11,color:'var(--t-text-faint)',marginTop:2}}>Live · {d.locList.length} location{d.locList.length===1?'':'s'}</div>
          </div>
        </div>

        {/* Alert count badges — drill into the underlying alert records */}
        <div style={{display:'flex',gap:8,marginTop:16,flexWrap:'wrap'}}>
          {criticalAlerts.length>0 && (
            <button onClick={()=>setDrill({title:'Critical Alerts',subtitle:`${criticalAlerts.length} critical alert${criticalAlerts.length===1?'':'s'} · source records`,columns:ALERT_COLS,rows:criticalAlerts,accent:'var(--t-danger)'})} style={{background:'var(--t-danger)',color:'#fff',border:'none',padding:'5px 12px',fontSize:12,fontWeight:700,cursor:'pointer',display:'flex',alignItems:'center',gap:6}}>
              🔴 {criticalAlerts.length} CRITICAL ⤢
            </button>
          )}
          {warningAlerts.length>0 && (
            <button onClick={()=>setDrill({title:'Warnings',subtitle:`${warningAlerts.length} warning${warningAlerts.length===1?'':'s'} · source records`,columns:ALERT_COLS,rows:warningAlerts,accent:'var(--t-warn)'})} style={{background:'var(--t-warn)',color:'#000',border:'none',padding:'5px 12px',fontSize:12,fontWeight:700,cursor:'pointer'}}>
              ⚠ {warningAlerts.length} Warnings ⤢
            </button>
          )}
          {infoAlerts.length>0 && (
            <button onClick={()=>setActiveSection('alerts')} style={{background:'var(--t-surface-2)',color:'var(--t-text-muted)',border:'1px solid var(--t-line)',padding:'5px 12px',fontSize:12,fontWeight:600,cursor:'pointer'}}>
              ℹ {infoAlerts.length} Info
            </button>
          )}
          <button onClick={load} style={{marginLeft:'auto',background:'transparent',color:'var(--t-text-muted)',border:'1px solid var(--t-line)',padding:'5px 12px',fontSize:11,cursor:'pointer'}}>
            ↻ Refresh
          </button>
        </div>
      </div>

      {/* ── COMPANY (CEO PLATFORM · LIVE) — cross-brain federation ─── */}
      <CeoCompanyStrip />

      {/* ── CEO PLATFORM — ALL MODULES — cross-app launcher ────────── */}
      <CeoPlatformMenu />

      {/* ── SCHEDULING COMPLIANCE BANNER ─────────────────────────── */}
      {flagSchedCompliance && <SchedulingComplianceBanner d={d} nav={nav} />}

      {/* ── STAFFING PULSE — always visible across all tabs ────────── */}
      {staffCounts && (
        <div style={{background:'var(--t-surface-2)',borderBottom:'2px solid var(--t-line)',padding:'0 24px'}}>
          {/* stat tiles row */}
          <div style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:0}}>
            {[
              { label:'SCHEDULED',  val: staffCounts.scheduled,          rows: staffCounts.all,       accent:'var(--t-accent)',  color:'var(--t-text)',    bg:'transparent' },
              { label:'CLOCKED IN', val: staffCounts.clockedIn.length,   rows: staffCounts.clockedIn, accent:'var(--t-success)', color:'var(--t-success)', bg: staffCounts.clockedIn.length>0?'rgba(0,255,65,.06)':'transparent' },
              { label:'CALLED OUT', val: staffCounts.calledOut.length,   rows: staffCounts.calledOut, accent:'var(--t-danger)',  color: staffCounts.calledOut.length>0?'var(--t-danger)':'var(--t-text-muted)', bg: staffCounts.calledOut.length>0?'rgba(255,26,26,.08)':'transparent', flash: staffCounts.calledOut.length>0 },
              { label:'NO-SHOW',    val: staffCounts.ncns.length,        rows: staffCounts.ncns,      accent:'var(--t-danger)',  color: staffCounts.ncns.length>0?'var(--t-danger)':'var(--t-text-muted)',      bg: staffCounts.ncns.length>0?'rgba(255,26,26,.10)':'transparent',    flash: staffCounts.ncns.length>0 },
              { label:'LATE',       val: staffCounts.late.length,        rows: staffCounts.late,      accent:'var(--t-warn)',    color: staffCounts.late.length>0?'var(--t-warn)':'var(--t-text-muted)',        bg: staffCounts.late.length>0?'rgba(255,179,0,.07)':'transparent' },
              { label:'NOT ON YET', val: staffCounts.notYet.length,      rows: staffCounts.notYet,    accent:'var(--t-text-muted)', color:'var(--t-text-muted)', bg:'transparent' },
              { label:'OFF DUTY',   val: staffCounts.offDuty.length,     rows: staffCounts.offDuty,   accent:'var(--t-text-faint)', color:'var(--t-text-faint)', bg:'transparent' },
            ].map(({label, val, rows, accent, color, bg, flash}) => (
              <div key={label} onClick={()=>openStaffDrill(label+' — Staff', rows||[], accent)} title={`Drill into ${label} — every employee, source data`} style={{
                background: bg, borderRight:'1px solid var(--t-line)',
                padding:'12px 14px', position:'relative', overflow:'hidden', cursor:'pointer',
              }}>
                {flash && <div style={{position:'absolute',top:0,left:0,right:0,height:2,background:'var(--t-danger)',animation:'pulse 1.4s infinite'}}/>}
                <div style={{fontSize:9,fontWeight:700,letterSpacing:'.1em',color:'var(--t-text-muted)',textTransform:'uppercase',marginBottom:4}}>{label} <span style={{color:'var(--t-text-faint)'}}>⤢</span></div>
                <div style={{fontSize:28,fontWeight:800,color,lineHeight:1,fontFamily:'monospace'}}>{val}</div>
              </div>
            ))}
          </div>

          {/* name pills row — only show non-zero problem statuses */}
          {(staffCounts.calledOut.length + staffCounts.ncns.length + staffCounts.late.length) > 0 && (
            <div style={{display:'flex',alignItems:'center',gap:6,padding:'8px 0',flexWrap:'wrap',borderTop:'1px solid var(--t-line)'}}>
              <span style={{fontSize:9,fontWeight:700,letterSpacing:'.08em',color:'var(--t-text-faint)',textTransform:'uppercase',marginRight:4,flexShrink:0}}>ATTENTION:</span>

              {staffCounts.ncns.map(r=>(
                <span key={r.key} style={{
                  fontSize:10,fontWeight:700,padding:'2px 8px',
                  background:'rgba(255,26,26,.18)',color:'var(--t-danger)',
                  border:'1px solid var(--t-danger)',flexShrink:0,
                }}>🚫 {r.emp.full_name} · {r.location} · NCNS</span>
              ))}

              {staffCounts.calledOut.map(r=>(
                <span key={r.key} style={{
                  fontSize:10,fontWeight:700,padding:'2px 8px',
                  background:'rgba(255,26,26,.10)',color:'var(--t-danger)',
                  border:'1px solid var(--t-danger)44',flexShrink:0,
                }}>✕ {r.emp.full_name} · {r.location} · CALLED OUT</span>
              ))}

              {staffCounts.late.map(r=>(
                <span key={r.key} style={{
                  fontSize:10,fontWeight:600,padding:'2px 8px',
                  background:'rgba(255,179,0,.12)',color:'var(--t-warn)',
                  border:'1px solid var(--t-warn)44',flexShrink:0,
                }}>⏰ {r.emp.full_name} · {r.location} · LATE</span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── SECTION TABS ─────────────────────────────────────────── */}
      <div style={{display:'flex',borderBottom:'1px solid var(--t-line)',background:'var(--t-surface)',padding:'0 24px',overflowX:'auto'}}>
        {[
          {k:'overview', l:'Overview KPIs'},
          {k:'locations', l:'By Location'},
          {k:'alerts', l:`Alerts ${d.alerts.length>0?`(${d.alerts.length})`:''}`, color: criticalAlerts.length>0?'var(--t-danger)':warningAlerts.length>0?'var(--t-warn)':null},
          {k:'live', l:'Live Floor'},
        ].map(({k,l,color})=>(
          <button key={k} onClick={()=>setActiveSection(k)} style={{
            padding:'10px 18px',border:'none',background:'none',cursor:'pointer',
            borderBottom:activeSection===k?'2px solid var(--t-accent)':'2px solid transparent',
            color:activeSection===k?'var(--t-text)':color||'var(--t-text-muted)',
            fontSize:12,fontWeight:activeSection===k?700:500,letterSpacing:'.06em',textTransform:'uppercase',fontFamily:'inherit',
          }}>{l}</button>
        ))}
      </div>

      <div style={{padding:'20px 24px',display:'flex',flexDirection:'column',gap:20}}>

        {/* ── OVERVIEW KPIs ─────────────────────────────────────── */}
        {activeSection==='overview' && <>

          {/* ─── EXECUTIVE DIGEST ────────────────────────────────── */}
          {flagExecDigest && <ExecutiveDigestCard d={d} />}

          {/* ─── TODAY'S LIVE COVERAGE ─────────────────────────── */}
          <div style={{marginBottom:16}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10,flexWrap:'wrap',gap:8}}>
              <div style={{fontSize:11,fontWeight:700,letterSpacing:'.1em',color:'var(--t-accent)',textTransform:'uppercase'}}>
                TODAY'S LIVE COVERAGE — {new Date().toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric'})}
              </div>
              <div style={{display:'flex',gap:8}}>
                <button onClick={()=>nav('/schedule-center')} style={{fontSize:10,fontWeight:800,padding:'5px 12px',background:'var(--t-accent)',color:'var(--t-on-grad,#04212a)',border:'none',cursor:'pointer',letterSpacing:'.05em'}}>★ SCHEDULE COMMAND CENTER</button>
                {d.calloutsToday.length>0 && <button onClick={()=>nav('/schedule-center',{state:{date:today(),action:'coverage'}})} style={{fontSize:10,fontWeight:800,padding:'5px 12px',background:'var(--t-danger)',color:'#fff',border:'none',cursor:'pointer',letterSpacing:'.05em'}}>📣 FIND COVERAGE</button>}
              </div>
            </div>

            {/* CALLOUT ALERT BANNER — real logged callouts */}
            {d.calloutsToday.length > 0 && (
              <div style={{background:'rgba(255,59,48,0.1)',border:'1px solid var(--t-danger)',padding:'10px 14px',marginBottom:12}}>
                <div style={{fontSize:11,fontWeight:800,color:'var(--t-danger)',marginBottom:6}}>
                  🚨 {d.calloutsToday.length} CALLOUT{d.calloutsToday.length>1?'S':''} TODAY — COVERAGE REVIEW REQUIRED
                </div>
                {d.calloutsToday.map((e,i)=>(
                  <div key={e.id} style={{display:'flex',alignItems:'center',gap:8,marginBottom:i<d.calloutsToday.length-1?6:0}}>
                    <span style={{fontSize:10,fontWeight:700,padding:'2px 6px',background:'rgba(255,59,48,0.2)',color:'var(--t-danger)',border:'1px solid var(--t-danger)'}}>CALLED OUT</span>
                    <span style={{fontSize:12,fontWeight:700,color:'var(--t-text)'}}>{e.full_name}</span>
                    <span style={{fontSize:10,color:'var(--t-text-muted)'}}>· {e.location} · {e.role}</span>
                    <span style={{fontSize:10,color:'var(--t-text-faint)',marginLeft:4}}>→</span>
                    <span style={{fontSize:10,color:'var(--t-warn)'}}>Coverage needed</span>
                    <button onClick={()=>nav('/schedule-center',{state:{date:today(),location:e.location,action:'coverage'}})} style={{marginLeft:'auto',background:'var(--t-danger)',color:'white',border:'none',padding:'4px 10px',fontSize:10,fontWeight:700,cursor:'pointer'}}>
                      📣 FIND COVERAGE
                    </button>
                  </div>
                ))}
              </div>
            )}

            {d.ncnsToday.length > 0 && (
              <div style={{background:'rgba(255,59,48,0.06)',border:'1px solid var(--t-danger)',padding:'8px 14px',marginBottom:12,display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
                <span style={{fontSize:10,fontWeight:800,color:'var(--t-danger)'}}>🚫 NO-CALL NO-SHOW:</span>
                {d.ncnsToday.map(e=>(
                  <span key={e.id} style={{fontSize:10,fontWeight:700,padding:'1px 6px',background:'rgba(255,59,48,0.2)',color:'var(--t-danger)',border:'1px solid var(--t-danger)'}}>{e.full_name} · {e.location}</span>
                ))}
                <button onClick={()=>nav('/disciplinary')} style={{marginLeft:'auto',background:'var(--t-danger)',color:'white',border:'none',padding:'4px 10px',fontSize:10,fontWeight:700,cursor:'pointer'}}>LOG DA</button>
              </div>
            )}

            {/* LOCATION CARDS — real per-location schedule for today */}
            {d.locationStats.length === 0 ? (
              <div style={{background:'var(--t-surface)',border:'1px solid var(--t-line)',padding:'20px 14px',fontSize:12,color:'var(--t-text-faint)',fontStyle:'italic'}}>
                No locations in scope.
              </div>
            ) : (
            <div style={{display:'grid',gridTemplateColumns:`repeat(${Math.min(4, Math.max(1, d.locationStats.length))},1fr)`,gap:12}}>
              {d.locationStats.map(ls => {
                const hasCallout = ls.callouts > 0
                const am = ls.shiftsToday.filter(r => r.startH != null && r.startH < 12)
                const pm = ls.shiftsToday.filter(r => r.startH == null || r.startH >= 12)
                return (
                  <div key={ls.name} onClick={()=>{ if(setScope) setScope(ls.node_id); nav('/schedule-center',{state:{location:ls.name, date:today(), action:'edit'}})}} title={`Edit ${ls.name}'s schedule for today — add, move & reassign shifts`}
                    style={{background:'var(--t-surface)',border:`1px solid ${hasCallout?'var(--t-danger)':'var(--t-line)'}`,padding:0,overflow:'hidden',cursor:'pointer'}}>
                    <div style={{background: hasCallout?'rgba(255,59,48,0.08)':'var(--t-surface-2)',padding:'8px 12px',borderBottom:`1px solid ${hasCallout?'var(--t-danger)':'var(--t-line)'}`,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                      <span style={{fontSize:12,fontWeight:800,color:'var(--t-text)',letterSpacing:'.05em'}}>{ls.name.toUpperCase()}</span>
                      {hasCallout
                        ? <span style={{fontSize:10,fontWeight:700,color:'var(--t-danger)'}}>⚠ {ls.callouts} CALLOUT</span>
                        : ls.shiftsToday.length
                          ? <span style={{fontSize:10,fontWeight:600,color:'var(--t-success)'}}>● STAFFED</span>
                          : <span style={{fontSize:10,fontWeight:600,color:'var(--t-text-faint)'}}>— NO SHIFTS</span>
                      }
                    </div>
                    {[{list:am,label:'AM SHIFTS',c:'var(--t-accent)'},{list:pm,label:'PM SHIFTS',c:'var(--t-warn)'}].map(({list,label,c},si)=>(
                      <div key={si} style={{padding:'8px 12px',borderBottom: si===0?`1px solid ${hasCallout?'var(--t-danger)':'var(--t-line)'}`:undefined}}>
                        <div style={{fontSize:9,fontWeight:700,color:c,letterSpacing:'.08em',marginBottom:4}}>{label}</div>
                        {list.length === 0 && <div style={{fontSize:10,color:'var(--t-text-faint)',fontStyle:'italic'}}>None scheduled</div>}
                        {list.map(r=>{
                          const out = r.status==='CALLED OUT' || r.status==='NCNS'
                          return (
                            <div key={r.key} onClick={(ev)=>{ev.stopPropagation(); r.emp.person_id && nav('/employee-360',{state:{personId:r.emp.person_id,personName:r.emp.full_name}})}} title={r.emp.person_id?`Open ${r.emp.full_name}'s forensic file`:undefined}
                              style={{display:'flex',alignItems:'center',gap:6,marginBottom:2,cursor:r.emp.person_id?'pointer':'default'}}>
                              <span style={{
                                fontSize:8,fontWeight:700,padding:'1px 4px',
                                background: out ? 'rgba(255,59,48,0.2)' : /key/i.test(r.emp.role) ? 'rgba(0,229,255,0.15)' : 'rgba(52,199,89,0.15)',
                                color: out ? 'var(--t-danger)' : /key/i.test(r.emp.role) ? 'var(--t-accent)' : 'var(--t-success)',
                                border: `1px solid ${out ? 'var(--t-danger)' : /key/i.test(r.emp.role) ? 'var(--t-accent)' : 'var(--t-success)'}`,
                                minWidth:out?50:34,textAlign:'center',
                              }}>{out ? 'OUT' : (r.emp.role||'—').slice(0,6).toUpperCase()}</span>
                              <span style={{fontSize:11,color:out?'var(--t-danger)':'var(--t-text)',fontWeight:500,textDecoration:out?'line-through':'none',opacity:out?0.7:1}}>{r.emp.full_name}</span>
                              <span style={{fontSize:9,color:'var(--t-text-faint)'}}>{r.shiftLabel}</span>
                              {out && <span style={{fontSize:9,color:'var(--t-danger)',fontWeight:700}}>{r.status}</span>}
                            </div>
                          )
                        })}
                        {list.some(r=>r.status==='CALLED OUT'||r.status==='NCNS') && (
                          <div style={{marginTop:4,fontSize:9,fontWeight:700,color:'var(--t-warn)'}}>⚠ COVERAGE NEEDED</div>
                        )}
                      </div>
                    ))}
                    <div style={{padding:'6px 12px',borderTop:'1px solid var(--t-line)',fontSize:9,fontWeight:800,letterSpacing:'.06em',color:'var(--t-accent)',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                      <span>✎ EDIT SCHEDULE</span><span>→</span>
                    </div>
                  </div>
                )
              })}
            </div>
            )}
          </div>

          {/* ─── SECTION A: LIVE STAFF STATUS BOARD ──────────────── */}
          <LiveStaffBoard d={d} />

          {/* ─── LABOR COST % OF REVENUE ──────────────────────────── */}
          {flagLaborCost && <LaborCostRow d={d} />}

          {/* ─── BUDGET vs. ACTUAL ───────────────────────────────── */}
          {flagBudgetActual && <BudgetActualCard d={d} />}

          {/* ─── SHRINKAGE & INCIDENT ALERTS ─────────────────────── */}
          {flagShrinkage && <ShrinkageAlertsCard d={d} nav={nav} />}

          {/* ─── SECTION B: SHIFT BREAKDOWN BY LOCATION ─────────── */}
          <ShiftBreakdownBoard d={d} roleName={roleName} />

          {/* ── 2-col layout: KPI rows (left 75%) + Event Feed (right 25%) ── */}
          <div style={{display:'grid',gridTemplateColumns:'3fr 1fr',gap:16,alignItems:'start'}}>

            {/* LEFT: KPI rows + snapshot */}
            <div style={{display:'flex',flexDirection:'column',gap:20}}>

              {/* Row 1: Workforce */}
              <div>
                <div style={{fontSize:11,fontWeight:700,letterSpacing:'.1em',color:'var(--t-accent)',textTransform:'uppercase',marginBottom:10}}>WORKFORCE</div>
                <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(160px,1fr))',gap:8}}>
                  <KTile label="Active Headcount" value={d.headcount} sub={`across ${d.locList.length} location${d.locList.length===1?'':'s'}`} onClick={()=>openDrill('Active Headcount', d.emps, EMP_COLS, 'var(--t-accent)')}/>
                  <KTile label="Clocked In Now" value={d.clockedInCount} sub={d.headcount>0?`${Math.round(d.clockedInCount/d.headcount*100)}% of staff`:'—'} color='var(--t-success)' onClick={()=>openDrill('Clocked In Now', d.clockedInEmps, EMP_COLS, 'var(--t-success)')}/>
                  <KTile label="Coverage Rate" value={fmtPct(d.coverageRate)} sub={d.coverageRate!=null?"today's scheduled shifts":'no shifts today'} alert={d.coverageRate!=null&&d.coverageRate<90?'red':d.coverageRate!=null&&d.coverageRate<95?'amber':null} color={d.coverageRate==null?'var(--t-text-muted)':d.coverageRate>=95?'var(--t-success)':d.coverageRate>=85?'var(--t-warn)':'var(--t-danger)'} onClick={()=>openDrill('Coverage Rate — By Location', d.locationStats, LOCSTAT_COLS, 'var(--t-accent)')}/>
                  <KTile label="Callouts Today" value={d.calloutsToday.length} sub="logged attendance incidents" alert={d.calloutsToday.length>2?'red':d.calloutsToday.length>0?'amber':null} color={d.calloutsToday.length>0?'var(--t-danger)':'var(--t-success)'} onClick={()=>openDrill('Callouts Today', d.calloutsToday, EMP_COLS, 'var(--t-danger)')}/>
                  <KTile label="NCNS Today" value={d.ncnsToday.length} sub="no-call no-show" alert={d.ncnsToday.length>0?'red':null} color={d.ncnsToday.length>0?'var(--t-danger)':'var(--t-text-muted)'} onClick={()=>openDrill('No-Call No-Show — Today', d.ncnsToday, EMP_COLS, 'var(--t-danger)')}/>
                  <KTile label="Attendance Rate" value={fmtPct(d.attendanceRate)} sub="today" alert={d.attendanceRate!=null&&d.attendanceRate<85?'red':d.attendanceRate!=null&&d.attendanceRate<92?'amber':null} color={d.attendanceRate==null?'var(--t-text-muted)':d.attendanceRate>=95?'var(--t-success)':d.attendanceRate>=85?'var(--t-warn)':'var(--t-danger)'} onClick={()=>openDrill('Attendance — Callouts Driving Rate', d.calloutsToday, EMP_COLS, 'var(--t-warn)')}/>
                </div>
              </div>

              {/* Row 2: Hours & Labor */}
              <div>
                <div style={{fontSize:11,fontWeight:700,letterSpacing:'.1em',color:'var(--t-accent)',textTransform:'uppercase',marginBottom:10}}>HOURS & LABOR COST</div>
                <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(160px,1fr))',gap:8}}>
                  <KTile label="Total Hours This Wk" value={fmtH(d.totalHrsWeek)} sub="from live time punches" onClick={()=>openDrill('Total Hours This Week', d.emps, OT_COLS, 'var(--t-accent)')}/>
                  <KTile label="OT Hours" value={fmtH(d.totalOTHrs)} sub="above 40hr threshold" alert={d.totalOTHrs>20?'amber':null} color={d.totalOTHrs>0?'var(--t-warn)':'var(--t-text-muted)'} onClick={()=>openDrill('Overtime Hours — Employees Over 40h', d.emps.filter(e=>e.hours_week>40), OT_COLS, 'var(--t-warn)')}/>
                  <KTile label="OT Employees" value={d.otAlerts.length} sub="at or above 40 hrs" alert={d.otAlerts.length>3?'amber':null} color={d.otAlerts.length>0?'var(--t-warn)':'var(--t-text-muted)'} onClick={()=>openDrill('OT Employees — At or Above 40h', d.otAlerts, OT_COLS, 'var(--t-warn)')}/>
                  <KTile label="Est. Labor Cost" value={fmt$(d.laborCost)} sub={d.laborCost!=null?`this week · ${d.wageCoverage} wage${d.wageCoverage===1?'':'s'} on file`:'no wages on file'} onClick={()=>openDrill('Est. Labor Cost — By Employee', d.emps, OT_COLS, 'var(--t-accent)')}/>
                  <KTile label="OT Cost" value={fmt$(d.otCost)} sub={d.otCost!=null&&d.laborCost?`${Math.round(d.otCost/d.laborCost*100)}% of labor`:'—'} alert={d.otCost!=null&&d.laborCost&&d.otCost/d.laborCost>.15?'amber':null} color={d.otCost>500?'var(--t-warn)':'var(--t-text-muted)'} onClick={()=>openDrill('OT Cost — Employees Over 40h', d.emps.filter(e=>e.hours_week>40), OT_COLS, 'var(--t-warn)')}/>
                  <KTile label="Avg Hrs/Employee" value={d.headcount>0?fmtH(d.totalHrsWeek/d.headcount):'—'} sub="per week" onClick={()=>openDrill('Avg Hours per Employee', d.emps, OT_COLS, 'var(--t-accent)')}/>
                </div>
              </div>

              {/* Row 3: Training & Compliance */}
              <div>
                <div style={{fontSize:11,fontWeight:700,letterSpacing:'.1em',color:'var(--t-accent)',textTransform:'uppercase',marginBottom:10}}>TRAINING & COMPLIANCE</div>
                <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(160px,1fr))',gap:8}}>
                  <KTile label="Training Compliance" value={fmtPct(d.trainingPct)} sub={d.trainingPct!=null?'courses complete':'no training data'} alert={d.trainingPct!=null&&d.trainingPct<80?'red':d.trainingPct!=null&&d.trainingPct<90?'amber':null} color={d.trainingPct==null?'var(--t-text-muted)':d.trainingPct>=90?'var(--t-success)':d.trainingPct>=75?'var(--t-warn)':'var(--t-danger)'} onClick={()=>nav('/training')}/>
                  <KTile label="Docs Pending Ack" value={d.docsPendingAck ?? '—'} sub="unsigned required documents" alert={d.docsPendingAck>0?'amber':null} color={d.docsPendingAck>0?'var(--t-warn)':'var(--t-text-muted)'} onClick={()=>nav('/documents')}/>
                  <KTile label="Open Incidents" value={d.openIncidents} sub="requiring follow-up" alert={d.openIncidents>2?'amber':null} color={d.openIncidents>0?'var(--t-warn)':'var(--t-text-muted)'} onClick={()=>nav('/incidents')}/>
                  <KTile label="Pending PTO" value={d.pendingPTO} sub="awaiting review" alert={d.pendingPTO>5?'amber':null} onClick={()=>nav('/requests')}/>
                  <KTile label="Open D.A.s" value={d.openDAs} sub="disciplinary actions" alert={d.openDAs>3?'red':d.openDAs>0?'amber':null} color={d.openDAs>0?'var(--t-danger)':'var(--t-text-muted)'} onClick={()=>openDrill('Open Disciplinary Actions — By Employee', d.emps.filter(e=>e.open_das>0), EMP_COLS, 'var(--t-danger)')}/>
                </div>
              </div>

              {/* Per-location mini summary */}
              <div>
                <div style={{fontSize:11,fontWeight:700,letterSpacing:'.1em',color:'var(--t-accent)',textTransform:'uppercase',marginBottom:10}}>LOCATION SNAPSHOT</div>
                <div style={{background:'var(--t-surface)',border:'1px solid var(--t-line)',overflow:'hidden'}}>
                  <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
                    <thead>
                      <tr style={{background:'var(--t-surface-2)',borderBottom:'1px solid var(--t-line)'}}>
                        {['Location','Headcount','Clocked In','Coverage','Callouts','OT','Hours Wk','Training','D.A.s'].map(h=>(
                          <th key={h} style={{padding:'8px 12px',textAlign:'left',color:'var(--t-text-muted)',fontWeight:700,fontSize:10,letterSpacing:'.06em',textTransform:'uppercase'}}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {d.locationStats.map(ls=>(
                        <tr key={ls.name} style={{borderBottom:'1px solid var(--t-line)',cursor:'pointer'}} onClick={()=>nav('/schedule')}>
                          <td style={{padding:'10px 12px',fontWeight:700,color:'var(--t-text)',fontSize:13}}>{ls.name}</td>
                          <td style={{padding:'10px 12px',color:'var(--t-text)'}}>{ls.headcount}</td>
                          <td style={{padding:'10px 12px',color:'var(--t-success)',fontWeight:700}}>{ls.clockedIn}</td>
                          <td style={{padding:'10px 12px'}}>
                            {ls.coverage != null ? (
                              <div style={{display:'flex',alignItems:'center',gap:6}}>
                                <div style={{width:50,height:4,background:'var(--t-line)'}}>
                                  <div style={{width:`${ls.coverage}%`,height:'100%',background:ls.coverage>=90?'var(--t-success)':ls.coverage>=75?'var(--t-warn)':'var(--t-danger)'}}/>
                                </div>
                                <span style={{fontSize:11,fontWeight:700,color:ls.coverage>=90?'var(--t-success)':ls.coverage>=75?'var(--t-warn)':'var(--t-danger)'}}>{ls.coverage}%</span>
                              </div>
                            ) : <span style={{fontSize:11,color:'var(--t-text-faint)'}}>no shifts</span>}
                          </td>
                          <td style={{padding:'10px 12px',color:ls.callouts>0?'var(--t-danger)':'var(--t-text-muted)',fontWeight:ls.callouts>0?700:400}}>{ls.callouts}</td>
                          <td style={{padding:'10px 12px',color:ls.otCount>0?'var(--t-warn)':'var(--t-text-muted)',fontWeight:ls.otCount>0?700:400}}>{ls.otCount}</td>
                          <td style={{padding:'10px 12px',color:'var(--t-text)'}}>{fmtH(ls.totalHrs)}</td>
                          <td style={{padding:'10px 12px'}}><span style={{fontSize:11,fontWeight:700,color:ls.trainingPct==null?'var(--t-text-faint)':ls.trainingPct>=90?'var(--t-success)':ls.trainingPct>=75?'var(--t-warn)':'var(--t-danger)'}}>{ls.trainingPct!=null?`${ls.trainingPct}%`:'—'}</span></td>
                          <td style={{padding:'10px 12px',color:ls.openDAs>0?'var(--t-danger)':'var(--t-text-muted)',fontWeight:ls.openDAs>0?700:400}}>{ls.openDAs}</td>
                        </tr>
                      ))}
                      <tr style={{background:'var(--t-surface-2)',borderTop:'2px solid var(--t-line)'}}>
                        <td style={{padding:'10px 12px',fontWeight:800,color:'var(--t-accent)',fontSize:11,letterSpacing:'.06em'}}>COMPANY TOTAL</td>
                        <td style={{padding:'10px 12px',fontWeight:700,color:'var(--t-text)'}}>{d.headcount}</td>
                        <td style={{padding:'10px 12px',fontWeight:700,color:'var(--t-success)'}}>{d.clockedInCount}</td>
                        <td style={{padding:'10px 12px',fontWeight:700,color:d.coverageRate==null?'var(--t-text-faint)':d.coverageRate>=90?'var(--t-success)':d.coverageRate>=75?'var(--t-warn)':'var(--t-danger)'}}>{fmtPct(d.coverageRate)}</td>
                        <td style={{padding:'10px 12px',fontWeight:700,color:d.calloutsToday.length>0?'var(--t-danger)':'var(--t-text-muted)'}}>{d.calloutsToday.length}</td>
                        <td style={{padding:'10px 12px',fontWeight:700,color:d.otAlerts.length>0?'var(--t-warn)':'var(--t-text-muted)'}}>{d.otAlerts.length}</td>
                        <td style={{padding:'10px 12px',fontWeight:700,color:'var(--t-text)'}}>{fmtH(d.totalHrsWeek)}</td>
                        <td style={{padding:'10px 12px',fontWeight:700,color:d.trainingPct==null?'var(--t-text-faint)':d.trainingPct>=90?'var(--t-success)':d.trainingPct>=75?'var(--t-warn)':'var(--t-danger)'}}>{fmtPct(d.trainingPct)}</td>
                        <td style={{padding:'10px 12px',fontWeight:700,color:d.openDAs>0?'var(--t-danger)':'var(--t-text-muted)'}}>{d.openDAs}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Quick actions */}
              {isManager && (
                <div>
                  <div style={{fontSize:11,fontWeight:700,letterSpacing:'.1em',color:'var(--t-accent)',textTransform:'uppercase',marginBottom:10}}>QUICK ACTIONS</div>
                  <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
                    {[
                      {l:'View Schedule',to:'/schedule'},{l:'Time Off Queue',to:'/requests'},
                      {l:'Add Employee',to:'/employees'},{l:'Post Announcement',to:'/comms'},
                      {l:'Incident Report',to:'/incidents'},{l:'Training Matrix',to:'/training'},
                      {l:'Disciplinary',to:'/disciplinary'},{l:'Reports',to:'/reports'},
                      {l:'KPI Forensics',to:'/kpi'},{l:'Coverage Board',to:'/coverage'},
                    ].map(({l,to})=>(
                      <button key={l} onClick={()=>nav(to)} style={{background:'var(--t-surface)',border:'1px solid var(--t-line)',color:'var(--t-text)',padding:'8px 14px',fontSize:12,fontWeight:600,cursor:'pointer'}}>
                        {l}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* RIGHT: Event Feed + Quick Action Buttons */}
            <div style={{position:'sticky',top:0,display:'flex',flexDirection:'column',gap:12}}>
              <TodayEventFeed d={d} nav={nav} />
            </div>

          </div>
        </>}

        {/* ── BY LOCATION ─────────────────────────────────────────── */}
        {activeSection==='locations' && (
          d.locationStats.length === 0
            ? <div style={{textAlign:'center',padding:'48px',color:'var(--t-text-faint)',fontSize:13,fontStyle:'italic'}}>No locations in scope.</div>
            : <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))',gap:12}}>
                {d.locationStats.map(ls=><LocCard key={ls.name} loc={ls} onNavigate={nav}/>)}
              </div>
        )}

        {/* ── ALERTS ──────────────────────────────────────────────── */}
        {activeSection==='alerts' && (
          <div style={{display:'flex',flexDirection:'column',gap:16}}>
            {criticalAlerts.length>0 && (
              <div>
                <div style={{fontSize:11,fontWeight:700,letterSpacing:'.1em',color:'var(--t-danger)',textTransform:'uppercase',marginBottom:8}}>🔴 CRITICAL — IMMEDIATE ACTION</div>
                {criticalAlerts.map((a,i)=><AlertCard key={i} alert={a} onNavigate={nav}/>)}
              </div>
            )}
            {warningAlerts.length>0 && (
              <div>
                <div style={{fontSize:11,fontWeight:700,letterSpacing:'.1em',color:'var(--t-warn)',textTransform:'uppercase',marginBottom:8}}>⚠ WARNINGS — ACTION TODAY</div>
                {warningAlerts.map((a,i)=><AlertCard key={i} alert={a} onNavigate={nav}/>)}
              </div>
            )}
            {infoAlerts.length>0 && (
              <div>
                <div style={{fontSize:11,fontWeight:700,letterSpacing:'.1em',color:'var(--t-accent)',textTransform:'uppercase',marginBottom:8}}>ℹ INFO — WATCH</div>
                {infoAlerts.map((a,i)=><AlertCard key={i} alert={a} onNavigate={nav}/>)}
              </div>
            )}
            {d.alerts.length===0 && (
              <div style={{textAlign:'center',padding:'48px',color:'var(--t-success)',fontSize:16,fontWeight:700}}>
                ✓ All systems nominal — no active alerts
              </div>
            )}
          </div>
        )}

        {/* ── LIVE FLOOR ──────────────────────────────────────────── */}
        {activeSection==='live' && (
          <div>
            <div style={{fontSize:11,fontWeight:700,letterSpacing:'.1em',color:'var(--t-accent)',textTransform:'uppercase',marginBottom:12}}>WHO'S WORKING RIGHT NOW</div>
            {d.locationStats.length === 0 ? (
              <div style={{textAlign:'center',padding:'48px',color:'var(--t-text-faint)',fontSize:13,fontStyle:'italic'}}>No locations in scope.</div>
            ) : (
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(260px,1fr))',gap:10}}>
              {d.locationStats.map(ls=>(
                <div key={ls.name} style={{background:'var(--t-surface)',border:'1px solid var(--t-line)',padding:'14px 16px'}}>
                  <div style={{fontWeight:800,fontSize:14,color:'var(--t-text)',marginBottom:10,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                    {ls.name}
                    <span style={{fontSize:11,color:'var(--t-success)',fontWeight:700}}>{ls.clockedIn} in</span>
                  </div>
                  {d.emps.filter(e=>e.location===ls.name).length === 0 && (
                    <div style={{fontSize:11,color:'var(--t-text-faint)',fontStyle:'italic'}}>No employees assigned here.</div>
                  )}
                  {d.emps.filter(e=>e.location===ls.name).map(e=>(
                    <div key={e.id} onClick={()=>nav('/employee-360',{state:{personId:e.person_id,personName:e.full_name}})} title={`Open ${e.full_name}'s forensic file`} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'5px 0',borderBottom:'1px solid var(--t-line)',cursor:'pointer'}}>
                      <div>
                        <div style={{fontSize:13,fontWeight:600,color:'var(--t-text)'}}>{e.full_name}</div>
                        <div style={{fontSize:11,color:'var(--t-text-muted)'}}>{e.role}</div>
                      </div>
                      <div style={{textAlign:'right'}}>
                        {e.callouts_30d>3 && <span className="badge red" style={{fontSize:9}}>HIGH RISK</span>}
                        {e.hours_week>=40 && <span className="badge amber" style={{fontSize:9,marginLeft:4}}>OT</span>}
                        {e.callouts_30d===0 && e.lates_30d===0 && e.ncns===0 && <span className="badge green" style={{fontSize:9}}>Perfect</span>}
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
            )}
          </div>
        )}

      </div>

      <DrillDown open={!!drill} onClose={()=>setDrill(null)} {...(drill||{})} />
    </div>
  )
}
