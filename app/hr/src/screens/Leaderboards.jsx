import { useState, useEffect, useMemo } from 'react'
import { sb } from '../lib/supabase'
import { useScope } from '../lib/scope.jsx'
import { useAuth } from '../lib/auth.jsx'
import DrillDown from '../components/DrillDown.jsx'

const fmt$ = n => `$${parseFloat(n||0).toFixed(2)}`
const fmtPct = n => `${Math.round(n||0)}%`
const num = v => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0 }

// Every board below is backed by a real RPC — no fabricated metrics.
//  · revenue / avg ticket / transactions → get_sales_leaderboard (real POS sales)
//  · attendance                          → get_attendance_overview (100 − active incident points)
//  · training                            → get_training_leaderboard (assessment scores)
//  · spiff / points / recognition        → get_gamification_board (ledger + profiles)
const BOARDS = [
  { id:'revenue_mtd',  label:'Revenue',           metric: e => e.revenue_mtd,       format: n => fmt$(n),            desc:'Total recorded sales revenue', money:true },
  { id:'revenue_week', label:'Revenue (Week)',    metric: e => e.revenue_week,      format: n => fmt$(n),            desc:'Sales revenue in the last 7 days', money:true },
  { id:'avg_ticket',   label:'Avg Ticket',        metric: e => e.avg_ticket,        format: n => `$${num(n).toFixed(2)}`, desc:'Average transaction amount', money:true },
  { id:'transactions', label:'Transactions',      metric: e => e.transactions,      format: n => `${n}`,             desc:'Number of recorded transactions' },
  { id:'attendance',   label:'Attendance Score',  metric: e => e.attendance_score,  format: n => fmtPct(n),          desc:'100 minus active attendance-incident points' },
  { id:'training',     label:'Training %',        metric: e => e.training_pct,      format: n => fmtPct(n),          desc:'Average training assessment score' },
  { id:'spiff',        label:'Spiff Earned',      metric: e => e.spiff_earned,      format: n => fmt$(n),            desc:'Spiff incentive earnings', money:true },
  { id:'points',       label:'Engagement Points', metric: e => e.points_mtd,        format: n => `${n}pts`,          desc:'Gamification points this month' },
  { id:'recognition',  label:'Recognition',       metric: e => e.recognition_count, format: n => `${n}`,             desc:'Compliments / recognitions received' },
]

function getRanked(emps, boardId, locFilter) {
  const board = BOARDS.find(b=>b.id===boardId) || BOARDS[0]
  let list = locFilter==='all' ? emps : emps.filter(e=>e.location===locFilter)
  return [...list].sort((a,b)=>board.metric(b)-board.metric(a)).map((e,i)=>({...e,rank:i+1}))
}

// Merge every real leaderboard RPC into one per-person row keyed by person_id.
// Roster base comes from the gamification board (all active people in scope with a
// current assignment → real location + role); the other RPCs enrich matching rows.
function mergeEmployees(gamEmps, salesAll, salesWeek, trainRows, attRows) {
  const map = new Map()
  const ensure = (id, name, loc, role, nodeId) => {
    if (!id) return null
    if (!map.has(id)) {
      map.set(id, {
        id, full_name: name || 'Unknown', location: loc || '—', role: role || '—', node_id: nodeId || null,
        revenue_mtd:0, revenue_week:0, avg_ticket:0, transactions:0,
        attendance_score:100, training_pct:0, training_completed:0,
        spiff_earned:0, points_mtd:0, recognition_count:0, streak_days:0,
      })
    }
    const e = map.get(id)
    if (name && (!e.full_name || e.full_name==='Unknown')) e.full_name = name
    if (loc && e.location==='—') e.location = loc
    if (role && e.role==='—') e.role = role
    if (nodeId && !e.node_id) e.node_id = nodeId
    return e
  }
  ;(gamEmps||[]).forEach(g=>{
    const e = ensure(g.id, g.display_name || g.full_name, g.location, g.role, g.node_id)
    if (!e) return
    e.points_mtd = num(g.points_mtd)
    e.spiff_earned = num(g.spiff_total)
    e.recognition_count = num(g.recognition_count)
    e.streak_days = num(g.streak)
  })
  ;(salesAll||[]).forEach(r=>{
    const e = ensure(r.person_id, r.person_name, r.node_name); if (!e) return
    const total = num(r.total_sales), cnt = num(r.sale_count)
    e.revenue_mtd = total
    e.transactions = cnt
    e.avg_ticket = cnt ? total/cnt : 0
  })
  ;(salesWeek||[]).forEach(r=>{
    const e = ensure(r.person_id, r.person_name, r.node_name); if (!e) return
    e.revenue_week = num(r.total_sales)
  })
  ;(trainRows||[]).forEach(r=>{
    const e = ensure(r.person_id, r.person_name, r.node_name); if (!e) return
    e.training_pct = num(r.avg_score)
    e.training_completed = num(r.completed_count)
  })
  ;(attRows||[]).forEach(r=>{
    const e = ensure(r.person_id, r.full_name, r.location, r.role, r.node_id); if (!e) return
    const active = (r.incidents||[]).filter(i=>!i.expired)
    const pts = active.reduce((s,i)=>s+num(i.pts),0)
    e.attendance_score = Math.max(0, 100 - pts)
  })
  return [...map.values()]
}

function MedalIcon({rank}) {
  if (rank===1) return <span style={{fontSize:20}}>🥇</span>
  if (rank===2) return <span style={{fontSize:20}}>🥈</span>
  if (rank===3) return <span style={{fontSize:20}}>🥉</span>
  return <span style={{fontSize:13,color:'var(--t-text-faint)',fontWeight:700,minWidth:20,textAlign:'center',display:'inline-block'}}>{rank}</span>
}

function SectionLabel({children}) {
  return <div style={{fontSize:11,fontWeight:700,letterSpacing:'.1em',color:'var(--t-accent)',textTransform:'uppercase',marginBottom:10}}>{children}</div>
}

function KTile({label,value,sub,color,alert,onClick}) {
  return (
    <div onClick={onClick} title={onClick?'Click to drill into records':undefined} style={{background:'var(--t-surface)',border:`1px solid ${alert==='red'?'var(--t-danger)':alert==='amber'?'var(--t-warn)':'var(--t-line)'}`,padding:'14px 16px',position:'relative',overflow:'hidden',cursor:onClick?'pointer':'default'}}>
      {alert==='red' && <div style={{position:'absolute',top:0,left:0,right:0,height:2,background:'var(--t-danger)'}}/>}
      {alert==='amber' && <div style={{position:'absolute',top:0,left:0,right:0,height:2,background:'var(--t-warn)'}}/>}
      <div style={{fontSize:10,fontWeight:700,letterSpacing:'.08em',color:'var(--t-text-muted)',textTransform:'uppercase',marginBottom:6}}>{label}</div>
      <div style={{fontSize:24,fontWeight:800,color:color||'var(--t-text)',lineHeight:1,marginBottom:4}}>{value}</div>
      {sub && <div style={{fontSize:11,color:'var(--t-text-faint)'}}>{sub}</div>}
    </div>
  )
}

function StateCard({title,body,onRetry}) {
  return (
    <div style={{padding:'48px 24px'}}>
      <div style={{background:'var(--t-surface)',border:'1px solid var(--t-line)',padding:'32px',textAlign:'center',maxWidth:460,margin:'0 auto'}}>
        <div style={{fontSize:15,fontWeight:700,color:'var(--t-text)',marginBottom:8}}>{title}</div>
        <div style={{fontSize:13,color:'var(--t-text-muted)',marginBottom:onRetry?16:0}}>{body}</div>
        {onRetry && <button onClick={onRetry} style={{background:'var(--t-accent)',color:'#000',border:'none',padding:'7px 18px',fontSize:12,fontWeight:700,cursor:'pointer'}}>Retry</button>}
      </div>
    </div>
  )
}

export default function Leaderboards() {
  const { session } = useAuth()
  const { locationIds } = useScope()

  // Role gate (mirrors Cockpit.jsx pattern)
  const nowH = new Date().getHours()
  const roleName = (session?.person?.role_name || '').toLowerCase()
  const isMgr = ['ceo', 'manager', 'coo', 'admin', 'owner', 'hr'].some(r => roleName.includes(r))
  const isKH = !isMgr && (roleName.includes('key') || roleName.includes('holder'))
  const canSeeDollars = isMgr || (isKH && nowH >= 12)

  const [activeBoard, setActiveBoard] = useState('revenue_mtd')
  const [locFilter, setLocFilter] = useState('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [emps, setEmps] = useState([])
  const [drill, setDrill] = useState(null)
  const [reloadKey, setReloadKey] = useState(0)

  // ── LIVE LEADERBOARD DATA (all real RPCs, scoped to the selected locations) ──
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      if (!locationIds || !locationIds.length) { setEmps([]); setLoading(false); setError(false); return }
      setLoading(true); setError(false)
      const [gamRes, salesRes, weekRes, trainRes, attRes] = await Promise.allSettled([
        sb.rpc('get_gamification_board', { p_node_ids: locationIds }),
        sb.rpc('get_sales_leaderboard', { p_node_ids: locationIds, p_period: 'all' }),
        sb.rpc('get_sales_leaderboard', { p_node_ids: locationIds, p_period: 'week' }),
        sb.rpc('get_training_leaderboard', { p_node_ids: locationIds }),
        sb.rpc('get_attendance_overview', { p_node_ids: locationIds }),
      ])
      if (cancelled) return
      const ok = r => r.status==='fulfilled' && !r.value?.error
      const gamData = ok(gamRes) ? (gamRes.value.data || {}) : null
      const gamEmps = Array.isArray(gamData?.employees) ? gamData.employees : []
      const sales = ok(salesRes) ? (salesRes.value.data || []) : []
      const week = ok(weekRes) ? (weekRes.value.data || []) : []
      const train = ok(trainRes) ? (trainRes.value.data || []) : []
      const att = ok(attRes) ? (attRes.value.data || []) : []
      // Every read failed → honest error state (no estimates shown).
      if (!ok(gamRes) && !ok(salesRes) && !ok(trainRes) && !ok(attRes)) {
        setError(true); setEmps([]); setLoading(false); return
      }
      setEmps(mergeEmployees(gamEmps, sales, week, train, att))
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [locationIds, reloadKey])

  const EMPS = emps
  const hasData = EMPS.length > 0

  const locList = useMemo(
    () => [...new Set(EMPS.map(e=>e.location).filter(l=>l && l!=='—'))].sort(),
    [EMPS]
  )

  const board = useMemo(()=>BOARDS.find(b=>b.id===activeBoard)||BOARDS[0],[activeBoard])
  const ranked = useMemo(()=>getRanked(EMPS,activeBoard,locFilter),[EMPS,activeBoard,locFilter])

  const topBy = key => EMPS.length ? [...EMPS].sort((a,b)=>b[key]-a[key])[0] : null
  const topEarner = useMemo(()=>topBy('revenue_mtd'),[EMPS])
  const topTicket = useMemo(()=>topBy('avg_ticket'),[EMPS])
  const topAttendance = useMemo(()=>topBy('attendance_score'),[EMPS])
  const topTraining = useMemo(()=>topBy('training_pct'),[EMPS])
  const topPoints = useMemo(()=>topBy('points_mtd'),[EMPS])
  const avg = key => EMPS.length ? EMPS.reduce((s,e)=>s+num(e[key]),0)/EMPS.length : 0
  const avgRevenue = useMemo(()=>avg('revenue_mtd'),[EMPS])
  const avgTicket = useMemo(()=>avg('avg_ticket'),[EMPS])
  const avgAttendance = useMemo(()=>avg('attendance_score'),[EMPS])
  const totalSpiff = useMemo(()=>EMPS.reduce((s,e)=>s+num(e.spiff_earned),0),[EMPS])

  // ── Forensic drill-down: every KPI tile opens the employee rows behind its number ──
  const EMP_COLS = [
    { key:'full_name', label:'Employee', value:e=>e.full_name },
    { key:'location', label:'Location', value:e=>e.location },
    { key:'role', label:'Role', value:e=>e.role },
    { key:'revenue_mtd', label:'Revenue', value:e=>fmt$(e.revenue_mtd), align:'right', sortKey:e=>e.revenue_mtd },
    { key:'avg_ticket', label:'Avg Ticket', value:e=>`$${num(e.avg_ticket).toFixed(2)}`, align:'right', sortKey:e=>e.avg_ticket },
    { key:'attendance_score', label:'Attendance', value:e=>fmtPct(e.attendance_score), align:'right', sortKey:e=>e.attendance_score },
    { key:'training_pct', label:'Training', value:e=>fmtPct(e.training_pct), align:'right', sortKey:e=>e.training_pct },
    { key:'points_mtd', label:'Points', value:e=>`${e.points_mtd}pts`, align:'right', sortKey:e=>e.points_mtd },
    { key:'spiff_earned', label:'Spiff', value:e=>fmt$(e.spiff_earned), align:'right', sortKey:e=>e.spiff_earned },
  ]
  const openDrill = (title, rows, accent) => setDrill({ title, subtitle:`${rows.length} employee${rows.length===1?'':'s'} behind this metric`, columns:EMP_COLS, rows, accent })

  return (
    <div style={{display:'flex',flexDirection:'column',gap:0}}>

      {/* ── HEADER ─────────────────────────────────────────────── */}
      <div style={{background:'var(--t-surface)',borderBottom:'1px solid var(--t-line)',padding:'16px 24px'}}>
        <div style={{fontSize:11,color:'var(--t-accent)',fontWeight:700,letterSpacing:'.1em',textTransform:'uppercase',marginBottom:4}}>Performance</div>
        <div style={{fontSize:20,fontWeight:800,color:'var(--t-text)'}}>Leaderboards</div>
      </div>

      {loading && <StateCard title="Loading leaderboards…" body="Pulling live performance data for your locations." />}

      {!loading && error && (
        <StateCard title="Couldn't load leaderboard data" body="The live platform data is temporarily unavailable. No figures are shown rather than estimates." onRetry={()=>setReloadKey(k=>k+1)} />
      )}

      {!loading && !error && !hasData && (
        <StateCard title="No leaderboard data yet" body="No employees, sales, training, or recognition records were found for the selected locations. Data appears here as soon as it is recorded." onRetry={()=>setReloadKey(k=>k+1)} />
      )}

      {!loading && !error && hasData && (
      <>
      {/* ── FORENSIC KPI PANEL ──────────────────────────────────── */}
      <div style={{padding:'20px 24px',borderBottom:'1px solid var(--t-line)',background:'#080d18'}}>
        <SectionLabel>TOP PERFORMERS</SectionLabel>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(150px,1fr))',gap:8,marginBottom:16}}>
          <KTile label="Top Revenue" value={isMgr ? fmt$(topEarner?.revenue_mtd) : '—'} sub={topEarner?.full_name} color='var(--t-success)' onClick={()=>openDrill('Revenue Leaderboard',[...EMPS].sort((a,b)=>b.revenue_mtd-a.revenue_mtd),'var(--t-success)')}/>
          <KTile label="Avg Revenue/Emp" value={isMgr ? fmt$(avgRevenue) : '—'} sub="company average" onClick={()=>openDrill('Revenue by Employee',[...EMPS].sort((a,b)=>b.revenue_mtd-a.revenue_mtd),'var(--t-accent)')}/>
          <KTile label="Best Avg Ticket" value={isMgr ? `$${num(topTicket?.avg_ticket).toFixed(2)}` : '—'} sub={topTicket?.full_name} color='var(--t-warn)' onClick={()=>openDrill('Avg Ticket Leaderboard',[...EMPS].sort((a,b)=>b.avg_ticket-a.avg_ticket),'var(--t-warn)')}/>
          <KTile label="Company Avg Ticket" value={isMgr ? `$${avgTicket.toFixed(2)}` : '—'} sub="all employees" onClick={()=>openDrill('Avg Ticket by Employee',[...EMPS].sort((a,b)=>b.avg_ticket-a.avg_ticket),'var(--t-accent)')}/>
          <KTile label="Top Attendance" value={fmtPct(topAttendance?.attendance_score)} sub={topAttendance?.full_name} color='var(--t-success)' onClick={()=>openDrill('Attendance Leaderboard',[...EMPS].sort((a,b)=>b.attendance_score-a.attendance_score),'var(--t-success)')}/>
          <KTile label="Avg Attendance" value={fmtPct(avgAttendance)} sub="company average" onClick={()=>openDrill('Attendance by Employee',[...EMPS].sort((a,b)=>b.attendance_score-a.attendance_score),'var(--t-accent)')}/>
          <KTile label="Top Training" value={fmtPct(topTraining?.training_pct)} sub={topTraining?.full_name} color='var(--t-accent)' onClick={()=>openDrill('Training Leaderboard',[...EMPS].sort((a,b)=>b.training_pct-a.training_pct),'var(--t-accent)')}/>
          <KTile label="Top Points" value={`${topPoints?.points_mtd||0}pts`} sub={topPoints?.full_name} color='var(--t-accent)' onClick={()=>openDrill('Points Leaderboard',[...EMPS].sort((a,b)=>b.points_mtd-a.points_mtd),'var(--t-accent)')}/>
          <KTile label="Total Spiff Paid" value={isMgr ? fmt$(totalSpiff) : '—'} sub="company total" onClick={()=>openDrill('Spiff by Employee',[...EMPS].sort((a,b)=>b.spiff_earned-a.spiff_earned),'var(--t-success)')}/>
          <KTile label="Active Players" value={EMPS.length} sub="on leaderboard" onClick={()=>openDrill('All Players',[...EMPS].sort((a,b)=>b.revenue_mtd-a.revenue_mtd),'var(--t-accent)')}/>
        </div>

        {locList.length > 0 && <>
        <SectionLabel>BY LOCATION</SectionLabel>
        <div style={{background:'var(--t-surface)',border:'1px solid var(--t-line)',overflow:'hidden'}}>
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
            <thead>
              <tr style={{background:'var(--t-surface-2)',borderBottom:'1px solid var(--t-line)'}}>
                {['Location','Employees','Avg Revenue','Top Earner','Avg Ticket','Avg Attendance','Total Spiff'].map(h=>(
                  <th key={h} style={{padding:'8px 12px',textAlign:'left',color:'var(--t-text-muted)',fontWeight:700,fontSize:10,letterSpacing:'.06em',textTransform:'uppercase'}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {locList.map(loc=>{
                const locEmps = EMPS.filter(e=>e.location===loc)
                if (!locEmps.length) return null
                const locAvgRev = locEmps.reduce((s,e)=>s+num(e.revenue_mtd),0)/locEmps.length
                const locTopEarner = [...locEmps].sort((a,b)=>b.revenue_mtd-a.revenue_mtd)[0]
                const locAvgTicket = locEmps.reduce((s,e)=>s+num(e.avg_ticket),0)/locEmps.length
                const locAvgAtt = locEmps.reduce((s,e)=>s+num(e.attendance_score),0)/locEmps.length
                const locSpiff = locEmps.reduce((s,e)=>s+num(e.spiff_earned),0)
                return (
                  <tr key={loc} style={{borderBottom:'1px solid var(--t-line)'}}>
                    <td style={{padding:'10px 12px',fontWeight:700,color:'var(--t-text)'}}>{loc}</td>
                    <td style={{padding:'10px 12px',color:'var(--t-text)'}}>{locEmps.length}</td>
                    <td style={{padding:'10px 12px',color:'var(--t-success)',fontWeight:700}}>{isMgr ? fmt$(locAvgRev) : '—'}</td>
                    <td style={{padding:'10px 12px',color:'var(--t-text)',fontSize:11}}>{locTopEarner?.full_name}</td>
                    <td style={{padding:'10px 12px',color:'var(--t-text)'}}>{isMgr ? `$${locAvgTicket.toFixed(2)}` : '—'}</td>
                    <td style={{padding:'10px 12px'}}><span style={{fontWeight:700,color:locAvgAtt>=90?'var(--t-success)':locAvgAtt>=80?'var(--t-warn)':'var(--t-danger)'}}>{fmtPct(locAvgAtt)}</span></td>
                    <td style={{padding:'10px 12px',color:'var(--t-text)'}}>{isMgr ? fmt$(locSpiff) : '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        </>}
      </div>

      {/* ── BOARD SELECTOR ───────────────────────────────────────── */}
      <div style={{background:'var(--t-surface)',borderBottom:'1px solid var(--t-line)',padding:'12px 24px'}}>
        <div style={{display:'flex',gap:8,flexWrap:'wrap',alignItems:'center'}}>
          <span style={{fontSize:11,color:'var(--t-text-muted)',fontWeight:700,marginRight:4}}>BOARD:</span>
          {BOARDS.map(b=>(
            <button key={b.id} onClick={()=>setActiveBoard(b.id)} style={{
              background:activeBoard===b.id?'var(--t-accent)':'var(--t-surface-2)',
              color:activeBoard===b.id?'#000':'var(--t-text)',
              border:'1px solid var(--t-line)',padding:'5px 12px',fontSize:11,fontWeight:700,cursor:'pointer',
            }}>{b.label}</button>
          ))}
          {locList.length > 0 && (
            <div style={{marginLeft:'auto',display:'flex',gap:6,flexWrap:'wrap'}}>
              <span style={{fontSize:11,color:'var(--t-text-muted)',fontWeight:700,alignSelf:'center'}}>LOCATION:</span>
              <button onClick={()=>setLocFilter('all')} style={{background:locFilter==='all'?'rgba(0,229,255,.15)':'transparent',border:'1px solid var(--t-line)',color:locFilter==='all'?'var(--t-accent)':'var(--t-text-muted)',padding:'4px 10px',fontSize:11,fontWeight:700,cursor:'pointer'}}>All</button>
              {locList.map(l=>(
                <button key={l} onClick={()=>setLocFilter(l)} style={{background:locFilter===l?'rgba(0,229,255,.15)':'transparent',border:'1px solid var(--t-line)',color:locFilter===l?'var(--t-accent)':'var(--t-text-muted)',padding:'4px 10px',fontSize:11,fontWeight:700,cursor:'pointer'}}>{l}</button>
              ))}
            </div>
          )}
        </div>
        <div style={{marginTop:8,fontSize:11,color:'var(--t-text-faint)'}}>{board.desc} — {ranked.length} employees ranked</div>
      </div>

      {/* ── MAIN LEADERBOARD ─────────────────────────────────────── */}
      <div style={{padding:'0 24px 24px'}}>

        {ranked.length === 0 ? (
          <div style={{padding:'40px 0',textAlign:'center',color:'var(--t-text-muted)',fontSize:13}}>No employees match this board and location filter.</div>
        ) : (
        <>
        {/* Top 3 hero */}
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:12,padding:'20px 0',borderBottom:'1px solid var(--t-line)',marginBottom:16}}>
          {ranked.slice(0,3).map((e,pos)=>{
            const medal = pos===0?'🥇':pos===1?'🥈':'🥉'
            const borderColor = pos===0?'#FFD700':pos===1?'#C0C0C0':'#CD7F32'
            const bg = pos===0?'rgba(255,215,0,.05)':pos===1?'rgba(192,192,192,.04)':'rgba(205,127,50,.04)'
            const topVal = board.metric(ranked[0]) || 1
            return (
              <div key={e.id} style={{background:bg,border:`2px solid ${borderColor}`,padding:'20px',textAlign:'center',position:'relative'}}>
                {pos===0 && <div style={{position:'absolute',top:-12,left:'50%',transform:'translateX(-50%)',fontSize:24}}>👑</div>}
                <div style={{fontSize:28,marginBottom:8}}>{medal}</div>
                <div style={{fontSize:15,fontWeight:800,color:'var(--t-text)',marginBottom:4}}>{e.full_name}</div>
                <div style={{fontSize:11,color:'var(--t-text-muted)',marginBottom:8}}>{e.location} · {e.role}</div>
                <div style={{fontSize:28,fontWeight:800,color:pos===0?'#FFD700':pos===1?'#C0C0C0':'#CD7F32'}}>
                  {(board.money && !isMgr)
                    ? (isKH && canSeeDollars ? `${Math.round(board.metric(e)/topVal*100)}%` : `#${pos+1}`)
                    : board.format(board.metric(e))}
                </div>
                <div style={{fontSize:10,color:'var(--t-text-faint)',marginTop:4}}>{board.label}</div>
              </div>
            )
          })}
        </div>

        {/* Full table */}
        <div style={{background:'var(--t-surface)',border:'1px solid var(--t-line)',overflow:'hidden'}}>
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
            <thead>
              <tr style={{background:'var(--t-surface-2)',borderBottom:'2px solid var(--t-line)'}}>
                {['#','Employee','Location','Role',board.label,'Revenue','Avg Ticket','Att. Score','Points'].map(h=>(
                  <th key={h} style={{padding:'10px 12px',textAlign:'left',color:'var(--t-text-muted)',fontWeight:700,fontSize:10,letterSpacing:'.06em',textTransform:'uppercase'}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ranked.map((e,i)=>{
                const isTop3 = i<3
                const rowBg = i===0?'rgba(255,215,0,.04)':i===1?'rgba(192,192,192,.03)':i===2?'rgba(205,127,50,.03)':'transparent'
                const topRev = ranked[0]?.revenue_mtd || 1
                return (
                  <tr key={e.id} style={{borderBottom:'1px solid var(--t-line)',background:rowBg}}>
                    <td style={{padding:'10px 12px'}}><MedalIcon rank={e.rank}/></td>
                    <td style={{padding:'10px 12px',fontWeight:isTop3?800:600,color:'var(--t-text)'}}>{e.full_name}</td>
                    <td style={{padding:'10px 12px',color:'var(--t-text-muted)',fontSize:11}}>{e.location}</td>
                    <td style={{padding:'10px 12px',color:'var(--t-text-faint)',fontSize:11}}>{e.role}</td>
                    <td style={{padding:'10px 12px',fontWeight:800,color:i===0?'#FFD700':i===1?'#C0C0C0':i===2?'#CD7F32':'var(--t-text)',fontSize:isTop3?15:13}}>
                      {(board.money && !isMgr)
                        ? (isKH && canSeeDollars ? `${Math.round(board.metric(e)/(board.metric(ranked[0])||1)*100)}%` : `#${e.rank}`)
                        : board.format(board.metric(e))}
                    </td>
                    <td style={{padding:'10px 12px',color:'var(--t-success)',fontWeight:700}}>{isMgr ? fmt$(e.revenue_mtd) : isKH && canSeeDollars ? `${Math.round(e.revenue_mtd/topRev*100)}%` : '—'}</td>
                    <td style={{padding:'10px 12px',color:'var(--t-text)'}}>{isMgr ? `$${num(e.avg_ticket).toFixed(2)}` : '—'}</td>
                    <td style={{padding:'10px 12px'}}><span style={{color:e.attendance_score>=90?'var(--t-success)':e.attendance_score>=80?'var(--t-warn)':'var(--t-danger)',fontWeight:700}}>{fmtPct(e.attendance_score)}</span></td>
                    <td style={{padding:'10px 12px',color:'var(--t-accent)',fontWeight:700}}>{e.points_mtd}pts</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Multi-board snapshot */}
        <div style={{marginTop:20}}>
          <SectionLabel>MULTI-METRIC SNAPSHOT — ALL BOARDS</SectionLabel>
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(220px,1fr))',gap:10}}>
            {BOARDS.map(b=>{
              const topForBoard = [...EMPS].sort((a,e2)=>b.metric(e2)-b.metric(a))[0]
              if (!topForBoard) return null
              return (
                <div key={b.id} onClick={()=>setActiveBoard(b.id)} style={{background:'var(--t-surface)',border:`1px solid ${activeBoard===b.id?'var(--t-accent)':'var(--t-line)'}`,padding:'12px 14px',cursor:'pointer',transition:'border-color .2s'}}>
                  <div style={{fontSize:10,color:'var(--t-text-muted)',fontWeight:700,letterSpacing:'.06em',textTransform:'uppercase',marginBottom:6}}>{b.label}</div>
                  <div style={{fontSize:18,fontWeight:800,color:'var(--t-accent)',marginBottom:3}}>
                    {(b.money && !isMgr) ? '#1' : b.format(b.metric(topForBoard))}
                  </div>
                  <div style={{fontSize:11,color:'var(--t-text)',fontWeight:600}}>{topForBoard.full_name}</div>
                  <div style={{fontSize:10,color:'var(--t-text-faint)'}}>{topForBoard.location}</div>
                </div>
              )
            })}
          </div>
        </div>
        </>
        )}

      </div>
      </>
      )}

      <DrillDown open={!!drill} onClose={()=>setDrill(null)} {...(drill||{})} />
    </div>
  )
}
