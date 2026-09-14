import { useState, useEffect, useCallback, useMemo } from 'react'
import { sb } from '../lib/supabase'
import { useAuth } from '../lib/auth.jsx'
import { useScope } from '../lib/scope.jsx'
import DrillDown from '../components/DrillDown.jsx'

// ── drill-down columns for promotion records ──────────────────────────────────
const PROMO_COLS = [
  { key: 'name', label: 'Promotion', value: p => p.name },
  { key: 'category', label: 'Category', value: p => p.category },
  { key: 'status', label: 'Status', value: p => p.status },
  { key: 'discount_pct', label: 'Discount', value: p => `${p.discount_pct}%`, align: 'right', sortKey: p => p.discount_pct },
  { key: 'revenue', label: 'Revenue', value: p => `$${p.revenue.toLocaleString()}`, align: 'right', sortKey: p => p.revenue },
  { key: 'transactions', label: 'Transactions', value: p => p.transactions, align: 'right', sortKey: p => p.transactions },
  { key: 'redemptions', label: 'Redemptions', value: p => p.redemptions, align: 'right', sortKey: p => p.redemptions },
  { key: 'goal', label: 'Goal %', value: p => (p.goal > 0 ? `${Math.round(p.revenue / p.goal * 100)}%` : '—'), align: 'right', sortKey: p => (p.goal > 0 ? p.revenue / p.goal : 0) },
]

function seed(a,b){ return ((a*31+b)*17+a*b)%100 }
const isHR = r => ['ceo','hr','manager','coo','admin','owner'].some(x=>(r||'').toLowerCase().includes(x))
const LOCS = ['Orange','Hartford','Manchester','Southington','Warehouse / Distribution']
const CATEGORIES = ['Seasonal','Product Launch','Clearance','Bundle Deal','Holiday','Flash Sale','Loyalty','Cross-Sell']
const STATUSES = ['active','upcoming','expired','draft','paused']

const PROMO_NAMES = [
  'Summer Pleasure Pack',
  'Couples Weekend Bundle',
  'New Arrivals 20% Off',
  'Wellness Wednesday',
  'Twisted Growers Member Flash Sale',
  'Holiday Romance Kit',
  'Clearance Blowout',
  'Buy 2 Get 1 Lubes',
  'Fall Fantasy Collection',
  'Loyalty Reward Week',
  'First Visit Discount',
  'Spring Awakening Sale',
]

function buildMockPromos() {
  const now = new Date()
  return PROMO_NAMES.map((name, i) => {
    const start = new Date(now); start.setDate(start.getDate() - seed(i,0)%20)
    const end = new Date(now); end.setDate(end.getDate() + seed(i,1)%30 - 5)
    const expired = end < now
    const upcoming = start > now
    const status = i===6?'draft':i===7?'paused':expired?'expired':upcoming?'upcoming':'active'
    const discount = [10,15,20,25,30,40,50][(seed(i,2))%7]
    const revenue = 3000 + seed(i,3)*400
    const transactions = 20 + seed(i,4)*8
    const avgTicket = Math.round(revenue/transactions)
    const goal = 5000 + seed(i,5)*500
    return {
      id: `promo-${i+1}`,
      name,
      category: CATEGORIES[i%CATEGORIES.length],
      status,
      discount_pct: discount,
      start_date: start.toISOString().slice(0,10),
      end_date: end.toISOString().slice(0,10),
      locations: LOCS.filter((_,li)=>seed(i,li+6)%3!==0),
      revenue,
      transactions,
      avg_ticket: avgTicket,
      goal,
      redemptions: 10 + seed(i,7)*15,
      description: `Special promotion: ${name}. ${discount}% off eligible products.`,
      products: ['All Categories','Intimate Accessories','Lubricants & Massage','Apparel','Wellness'][seed(i,8)%5],
      promo_code: name.toUpperCase().replace(/[^A-Z]/g,'').slice(0,6) + discount,
      created_by: 'HR Manager',
    }
  })
}

function KTile({label,value,sub,color,alert,onClick}) {
  return (
    <div onClick={onClick} title={onClick?'Click to drill into records':undefined} style={{background:'var(--t-surface)',border:`1px solid ${alert==='red'?'var(--t-danger)':alert==='amber'?'var(--t-warn)':'var(--t-line)'}`,padding:'14px 16px',position:'relative',overflow:'hidden',cursor:onClick?'pointer':'default'}}>
      {alert==='red'&&<div style={{position:'absolute',top:0,left:0,right:0,height:2,background:'var(--t-danger)'}}/>}
      {alert==='amber'&&<div style={{position:'absolute',top:0,left:0,right:0,height:2,background:'var(--t-warn)'}}/>}
      <div style={{fontSize:10,fontWeight:700,letterSpacing:'.08em',color:'var(--t-text-muted)',textTransform:'uppercase',marginBottom:6}}>{label}</div>
      <div style={{fontSize:24,fontWeight:800,color:color||'var(--t-text)',lineHeight:1,marginBottom:4}}>{value}</div>
      {sub&&<div style={{fontSize:11,color:'var(--t-text-faint)'}}>{sub}</div>}
    </div>
  )
}

function SL({children}) {
  return <div style={{fontSize:11,fontWeight:700,letterSpacing:'.1em',color:'var(--t-accent)',textTransform:'uppercase',marginBottom:10}}>{children}</div>
}

function StatusBadge({s}) {
  const c = s==='active'?'green':s==='upcoming'?'blue':s==='draft'?'purple':s==='paused'?'amber':'red'
  return <span className={`badge ${c}`} style={{fontSize:10}}>{s.charAt(0).toUpperCase()+s.slice(1)}</span>
}

export default function Promotions() {
  const { session } = useAuth()
  const { locationIds } = useScope()
  const role = session?.person?.role_name || ''
  const canManage = isHR(role)

  const [promos, setPromos] = useState([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('active')
  const [selected, setSelected] = useState(null)
  const [filterCat, setFilterCat] = useState('all')
  const [filterLoc, setFilterLoc] = useState('all')
  const [search, setSearch] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState({name:'',category:CATEGORIES[0],discount_pct:20,start_date:'',end_date:'',locations:LOCS,products:'All Categories',description:'',promo_code:''})
  const [formSuccess, setFormSuccess] = useState(false)
  const [drill, setDrill] = useState(null)
  const openDrill = (title, rows, accent) => setDrill({ title, subtitle: `${rows.length} promotion${rows.length === 1 ? '' : 's'}`, columns: PROMO_COLS, rows, accent })

  useEffect(()=>{
    const load = async () => {
      try {
        const {data} = await sb.rpc('get_promotions',{p_node_ids:locationIds})
        if (data?.length){ setPromos(data); setLoading(false); return }
      } catch {}
      setPromos(buildMockPromos())
      setLoading(false)
    }
    load()
  },[])

  const filtered = useMemo(()=>{
    const base = tab==='all'?promos:promos.filter(p=>p.status===tab)
    return base.filter(p=>{
      if (filterCat!=='all' && p.category!==filterCat) return false
      if (filterLoc!=='all' && !p.locations.includes(filterLoc)) return false
      if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false
      return true
    })
  },[promos,tab,filterCat,filterLoc,search])

  const stats = useMemo(()=>{
    const active = promos.filter(p=>p.status==='active')
    const upcoming = promos.filter(p=>p.status==='upcoming')
    const totalRev = promos.reduce((s,p)=>s+p.revenue,0)
    const activeRev = active.reduce((s,p)=>s+p.revenue,0)
    const totalTx = promos.reduce((s,p)=>s+p.transactions,0)
    const totalRed = promos.reduce((s,p)=>s+p.redemptions,0)
    const avgGoalPct = promos.filter(p=>p.goal>0).reduce((s,p)=>s+(p.revenue/p.goal*100),0)/Math.max(1,promos.length)
    const draft = promos.filter(p=>p.status==='draft').length
    return {active:active.length,upcoming:upcoming.length,totalRev,activeRev,totalTx,totalRed,avgGoalPct:Math.round(avgGoalPct),draft}
  },[promos])

  const submitPromo = async () => {
    if (!form.name.trim()) return
    try { await sb.rpc('create_promotion',{...form,p_node_ids:locationIds}) } catch {}
    const newPromo = {...form,id:`promo-new-${Date.now()}`,status:'upcoming',revenue:0,transactions:0,avg_ticket:0,redemptions:0,created_by:session?.person?.full_name||'HR'}
    setPromos(prev=>[newPromo,...prev])
    setFormSuccess(true)
    setTimeout(()=>{setFormSuccess(false);setShowCreate(false)},1500)
  }

  if (loading) return <div className="loader">Loading promotions…</div>

  return (
    <div style={{display:'flex',flexDirection:'column',gap:0}}>

      {/* HEADER */}
      <div style={{background:'var(--t-surface)',borderBottom:'1px solid var(--t-line)',padding:'16px 24px',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
        <div>
          <div style={{fontSize:11,color:'var(--t-accent)',fontWeight:700,letterSpacing:'.1em',textTransform:'uppercase',marginBottom:4}}>Marketing</div>
          <div style={{fontSize:20,fontWeight:800,color:'var(--t-text)'}}>Promotions Manager</div>
        </div>
        {canManage && (
          <button onClick={()=>setShowCreate(true)} style={{background:'var(--t-accent)',color:'#000',border:'none',padding:'8px 18px',fontSize:13,fontWeight:700,cursor:'pointer'}}>
            + New Promo
          </button>
        )}
      </div>

      {/* FORENSIC KPI PANEL */}
      <div style={{padding:'20px 24px',borderBottom:'1px solid var(--t-line)',background:'#080d18'}}>
        <SL>PROMOTIONS OVERVIEW</SL>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(140px,1fr))',gap:8,marginBottom:16}}>
          <KTile label="Active Promos" value={stats.active} sub="running now" color='var(--t-success)' onClick={()=>openDrill('Active Promotions', promos.filter(p=>p.status==='active'), 'var(--t-success)')}/>
          <KTile label="Upcoming" value={stats.upcoming} sub="scheduled" color='var(--t-accent)' onClick={()=>openDrill('Upcoming Promotions', promos.filter(p=>p.status==='upcoming'), 'var(--t-accent)')}/>
          <KTile label="Total Revenue" value={`$${(stats.totalRev/1000).toFixed(1)}k`} sub="from all promos" color='var(--t-text)' onClick={()=>openDrill('Revenue by Promotion', [...promos].sort((a,b)=>b.revenue-a.revenue), 'var(--t-accent)')}/>
          <KTile label="Active Revenue" value={`$${(stats.activeRev/1000).toFixed(1)}k`} sub="this period" color='var(--t-success)' onClick={()=>openDrill('Active Revenue by Promotion', promos.filter(p=>p.status==='active').sort((a,b)=>b.revenue-a.revenue), 'var(--t-success)')}/>
          <KTile label="Total Transactions" value={stats.totalTx} sub="promo sales" onClick={()=>openDrill('Transactions by Promotion', [...promos].sort((a,b)=>b.transactions-a.transactions), 'var(--t-accent)')}/>
          <KTile label="Redemptions" value={stats.totalRed} sub="codes used" onClick={()=>openDrill('Redemptions by Promotion', [...promos].sort((a,b)=>b.redemptions-a.redemptions), 'var(--t-accent)')}/>
          <KTile label="Avg Goal %" value={`${stats.avgGoalPct}%`} sub="vs revenue goal" color={stats.avgGoalPct>=80?'var(--t-success)':stats.avgGoalPct>=60?'var(--t-warn)':'var(--t-danger)'} onClick={()=>openDrill('Goal Attainment by Promotion', [...promos].filter(p=>p.goal>0).sort((a,b)=>(b.revenue/b.goal)-(a.revenue/a.goal)), 'var(--t-warn)')}/>
          <KTile label="Drafts" value={stats.draft} alert={stats.draft>3?'amber':null} color='var(--t-text-muted)' onClick={()=>openDrill('Draft Promotions', promos.filter(p=>p.status==='draft'), 'var(--t-text-muted)')}/>
        </div>

        <SL>BY LOCATION PERFORMANCE</SL>
        <div style={{background:'var(--t-surface)',border:'1px solid var(--t-line)',overflow:'hidden'}}>
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
            <thead>
              <tr style={{background:'var(--t-surface-2)',borderBottom:'1px solid var(--t-line)'}}>
                {['Location','Active Promos','Revenue','Transactions','Avg Ticket','Goal %'].map(h=>(
                  <th key={h} style={{padding:'8px 12px',textAlign:'left',color:'var(--t-text-muted)',fontWeight:700,fontSize:10,letterSpacing:'.06em',textTransform:'uppercase'}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {LOCS.map((loc,i)=>{
                const locPromos = promos.filter(p=>p.locations.includes(loc)&&p.status==='active')
                const locRev = locPromos.reduce((s,p)=>s+p.revenue,0)
                const locTx = locPromos.reduce((s,p)=>s+p.transactions,0)
                const locAvg = locTx>0?Math.round(locRev/locTx):0
                const goalPct = 60+seed(i,10)*30
                return (
                  <tr key={loc} style={{borderBottom:'1px solid var(--t-line)'}}>
                    <td style={{padding:'8px 12px',fontWeight:700,color:'var(--t-text)'}}>{loc}</td>
                    <td style={{padding:'8px 12px',color:'var(--t-text)'}}>{locPromos.length}</td>
                    <td style={{padding:'8px 12px',color:'var(--t-success)',fontWeight:700}}>${locRev.toLocaleString()}</td>
                    <td style={{padding:'8px 12px',color:'var(--t-text)'}}>{locTx}</td>
                    <td style={{padding:'8px 12px',color:'var(--t-text)'}}>${locAvg}</td>
                    <td style={{padding:'8px 12px'}}><span style={{fontWeight:700,color:goalPct>=80?'var(--t-success)':goalPct>=60?'var(--t-warn)':'var(--t-danger)'}}>{goalPct}%</span></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* STATUS TABS */}
      <div style={{display:'flex',borderBottom:'1px solid var(--t-line)',background:'var(--t-surface)',padding:'0 24px',overflowX:'auto'}}>
        {[
          {k:'active',l:'Active'},
          {k:'upcoming',l:'Upcoming'},
          {k:'draft',l:'Drafts'},
          {k:'paused',l:'Paused'},
          {k:'expired',l:'Expired'},
          {k:'all',l:'All'},
        ].map(({k,l})=>{
          const count = k==='all'?promos.length:promos.filter(p=>p.status===k).length
          return (
            <button key={k} onClick={()=>setTab(k)} style={{padding:'10px 16px',border:'none',background:'none',cursor:'pointer',fontFamily:'inherit',borderBottom:tab===k?'2px solid var(--t-accent)':'2px solid transparent',color:tab===k?'var(--t-text)':'var(--t-text-muted)',fontSize:12,fontWeight:tab===k?700:500,letterSpacing:'.05em',textTransform:'uppercase',whiteSpace:'nowrap'}}>
              {l} <span style={{fontSize:10,color:'var(--t-text-faint)'}}>{count}</span>
            </button>
          )
        })}
      </div>

      <div style={{padding:'20px 24px',display:'grid',gridTemplateColumns:selected?'1fr 360px':'1fr',gap:20}}>

        {/* LEFT: LIST */}
        <div>
          {/* FILTER BAR */}
          <div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:16,alignItems:'center'}}>
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search promos…" style={{background:'var(--t-surface)',border:'1px solid var(--t-line)',color:'var(--t-text)',padding:'6px 10px',fontSize:12,outline:'none',minWidth:160}}/>
            <select value={filterCat} onChange={e=>setFilterCat(e.target.value)} style={{background:'var(--t-surface)',border:'1px solid var(--t-line)',color:'var(--t-text)',padding:'6px 10px',fontSize:12}}>
              <option value="all">All Categories</option>
              {CATEGORIES.map(c=><option key={c}>{c}</option>)}
            </select>
            <select value={filterLoc} onChange={e=>setFilterLoc(e.target.value)} style={{background:'var(--t-surface)',border:'1px solid var(--t-line)',color:'var(--t-text)',padding:'6px 10px',fontSize:12}}>
              <option value="all">All Locations</option>
              {LOCS.map(l=><option key={l}>{l}</option>)}
            </select>
            <button onClick={()=>{setFilterCat('all');setFilterLoc('all');setSearch('')}} style={{background:'transparent',border:'1px solid var(--t-line)',color:'var(--t-text-muted)',padding:'6px 10px',fontSize:11,cursor:'pointer'}}>Clear</button>
          </div>

          {/* PROMO CARDS */}
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))',gap:12}}>
            {filtered.map(p=>{
              const goalPct = Math.min(100,Math.round(p.revenue/p.goal*100))
              const isSel = selected?.id===p.id
              return (
                <div key={p.id} onClick={()=>setSelected(isSel?null:p)} style={{
                  background:'var(--t-surface)',
                  border:`1px solid ${isSel?'var(--t-accent)':p.status==='active'?'var(--t-line)':'var(--t-line)'}`,
                  padding:'16px',cursor:'pointer',position:'relative',overflow:'hidden',
                  boxShadow:isSel?'0 0 0 2px var(--t-accent)':undefined,
                }}>
                  {p.status==='active'&&<div style={{position:'absolute',top:0,left:0,right:0,height:2,background:'var(--t-success)'}}/>}
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:8}}>
                    <div style={{flex:1,marginRight:8}}>
                      <div style={{fontSize:14,fontWeight:700,color:'var(--t-text)',marginBottom:3}}>{p.name}</div>
                      <div style={{fontSize:11,color:'var(--t-text-muted)'}}>{p.category}</div>
                    </div>
                    <StatusBadge s={p.status}/>
                  </div>
                  <div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:10}}>
                    <span className="badge purple" style={{fontSize:10}}>{p.discount_pct}% OFF</span>
                    {p.locations.map(l=><span key={l} className="badge blue" style={{fontSize:9}}>{l}</span>)}
                  </div>
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:8,marginBottom:10}}>
                    {[
                      {l:'Revenue',v:`$${p.revenue.toLocaleString()}`},
                      {l:'Transactions',v:p.transactions},
                      {l:'Avg Ticket',v:`$${p.avg_ticket}`},
                    ].map(({l,v})=>(
                      <div key={l}>
                        <div style={{fontSize:9,color:'var(--t-text-muted)',fontWeight:700,textTransform:'uppercase',marginBottom:2}}>{l}</div>
                        <div style={{fontSize:13,fontWeight:800,color:'var(--t-text)'}}>{v}</div>
                      </div>
                    ))}
                  </div>
                  {p.goal>0 && (
                    <div>
                      <div style={{display:'flex',justifyContent:'space-between',marginBottom:3}}>
                        <span style={{fontSize:9,color:'var(--t-text-muted)',fontWeight:700}}>GOAL PROGRESS</span>
                        <span style={{fontSize:10,fontWeight:700,color:goalPct>=80?'var(--t-success)':goalPct>=60?'var(--t-warn)':'var(--t-danger)'}}>{goalPct}%</span>
                      </div>
                      <div style={{background:'var(--t-surface-2)',height:4}}>
                        <div style={{height:'100%',width:`${goalPct}%`,background:goalPct>=80?'var(--t-success)':goalPct>=60?'var(--t-accent)':'var(--t-warn)',transition:'width .5s'}}/>
                      </div>
                    </div>
                  )}
                  <div style={{fontSize:10,color:'var(--t-text-faint)',marginTop:8}}>{p.start_date} – {p.end_date}</div>
                </div>
              )
            })}
            {filtered.length===0 && (
              <div style={{gridColumn:'1/-1',textAlign:'center',padding:40,color:'var(--t-text-muted)',fontSize:13}}>No promotions match filters</div>
            )}
          </div>
        </div>

        {/* RIGHT: DETAIL PANEL */}
        {selected && (
          <div style={{background:'var(--t-surface)',border:'1px solid var(--t-line)',padding:'20px',overflowY:'auto',maxHeight:'75vh',position:'sticky',top:16}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
              <div style={{fontSize:14,fontWeight:800,color:'var(--t-text)'}}>{selected.name}</div>
              <button onClick={()=>setSelected(null)} style={{background:'transparent',border:'none',color:'var(--t-text-muted)',cursor:'pointer',fontSize:18}}>✕</button>
            </div>
            <StatusBadge s={selected.status}/>
            <div style={{marginTop:12,display:'flex',flexDirection:'column',gap:0}}>
              {[
                {l:'Category',v:selected.category},
                {l:'Discount',v:`${selected.discount_pct}%`},
                {l:'Promo Code',v:selected.promo_code||'—'},
                {l:'Products',v:selected.products},
                {l:'Start Date',v:selected.start_date},
                {l:'End Date',v:selected.end_date},
                {l:'Locations',v:selected.locations.join(', ')},
                {l:'Created By',v:selected.created_by},
                {l:'Revenue',v:`$${selected.revenue.toLocaleString()}`},
                {l:'Transactions',v:selected.transactions},
                {l:'Avg Ticket',v:`$${selected.avg_ticket}`},
                {l:'Redemptions',v:selected.redemptions},
                {l:'Goal',v:`$${selected.goal.toLocaleString()}`},
                {l:'Goal %',v:`${Math.round(selected.revenue/selected.goal*100)}%`},
              ].map(({l,v})=>(
                <div key={l} style={{display:'flex',justifyContent:'space-between',padding:'7px 0',borderBottom:'1px solid var(--t-line)',fontSize:12}}>
                  <span style={{color:'var(--t-text-muted)'}}>{l}</span>
                  <span style={{color:'var(--t-text)',fontWeight:600}}>{v}</span>
                </div>
              ))}
            </div>
            {selected.description && (
              <div style={{marginTop:12,background:'var(--t-surface-2)',padding:'10px',border:'1px solid var(--t-line)'}}>
                <div style={{fontSize:10,fontWeight:700,color:'var(--t-text-muted)',marginBottom:6,textTransform:'uppercase'}}>Description</div>
                <div style={{fontSize:12,color:'var(--t-text)',lineHeight:1.6}}>{selected.description}</div>
              </div>
            )}
            {canManage && (
              <div style={{marginTop:16,display:'flex',gap:8,flexWrap:'wrap'}}>
                {selected.status==='draft'&&<button style={{background:'var(--t-success)',color:'#000',border:'none',padding:'8px 14px',fontSize:12,fontWeight:700,cursor:'pointer'}} onClick={()=>{ setPromos(p=>p.map(pr=>pr.id===selected.id?{...pr,status:'active'}:pr)); setSelected(s=>({...s,status:'active'})) }}>Activate</button>}
                {selected.status==='active'&&<button style={{background:'var(--t-warn)',color:'#000',border:'none',padding:'8px 14px',fontSize:12,fontWeight:700,cursor:'pointer'}} onClick={()=>{ setPromos(p=>p.map(pr=>pr.id===selected.id?{...pr,status:'paused'}:pr)); setSelected(s=>({...s,status:'paused'})) }}>Pause</button>}
                {selected.status==='paused'&&<button style={{background:'var(--t-success)',color:'#000',border:'none',padding:'8px 14px',fontSize:12,fontWeight:700,cursor:'pointer'}} onClick={()=>{ setPromos(p=>p.map(pr=>pr.id===selected.id?{...pr,status:'active'}:pr)); setSelected(s=>({...s,status:'active'})) }}>Resume</button>}
                <button style={{background:'transparent',border:'1px solid var(--t-line)',color:'var(--t-text-muted)',padding:'8px 14px',fontSize:12,cursor:'pointer'}}>Edit</button>
                <button style={{background:'transparent',border:'1px solid var(--t-line)',color:'var(--t-text-muted)',padding:'8px 14px',fontSize:12,cursor:'pointer'}}>Duplicate</button>
              </div>
            )}

            {/* MINI PERFORMANCE CHART */}
            <div style={{marginTop:16}}>
              <div style={{fontSize:10,fontWeight:700,color:'var(--t-text-muted)',textTransform:'uppercase',marginBottom:8}}>Daily Revenue (Last 7 Days)</div>
              <div style={{display:'flex',alignItems:'flex-end',gap:4,height:60}}>
                {Array.from({length:7},(_,d)=>{
                  const val = 200+seed(selected.id.length,d)*80
                  const maxVal = 800
                  return (
                    <div key={d} style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',gap:2}}>
                      <div style={{background:'var(--t-accent)',width:'100%',height:`${(val/maxVal)*50}px`,opacity:.8}}/>
                      <div style={{fontSize:8,color:'var(--t-text-faint)',fontFamily:'monospace'}}>{['M','T','W','T','F','S','S'][d]}</div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}

      </div>

      {/* CREATE MODAL */}
      {showCreate && canManage && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.7)',zIndex:999,display:'flex',alignItems:'center',justifyContent:'center',padding:20}}>
          <div style={{background:'var(--t-surface)',border:'1px solid var(--t-line)',padding:'24px',maxWidth:520,width:'100%',maxHeight:'85vh',overflowY:'auto'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20}}>
              <div style={{fontSize:16,fontWeight:800,color:'var(--t-text)'}}>Create Promotion</div>
              <button onClick={()=>setShowCreate(false)} style={{background:'transparent',border:'none',color:'var(--t-text-muted)',fontSize:20,cursor:'pointer'}}>✕</button>
            </div>
            {[
              {l:'PROMO NAME', el:<input value={form.name} onChange={e=>setForm(p=>({...p,name:e.target.value}))} placeholder="e.g. Summer Flash Sale" style={{width:'100%',background:'var(--t-surface-2)',border:'1px solid var(--t-line)',color:'var(--t-text)',padding:'8px 10px',fontSize:13,outline:'none',boxSizing:'border-box'}}/>},
              {l:'CATEGORY', el:<select value={form.category} onChange={e=>setForm(p=>({...p,category:e.target.value}))} style={{width:'100%',background:'var(--t-surface-2)',border:'1px solid var(--t-line)',color:'var(--t-text)',padding:'8px 10px',fontSize:12}}>{CATEGORIES.map(c=><option key={c}>{c}</option>)}</select>},
              {l:'DISCOUNT %', el:<input type="number" value={form.discount_pct} min={5} max={80} onChange={e=>setForm(p=>({...p,discount_pct:+e.target.value}))} style={{width:'100%',background:'var(--t-surface-2)',border:'1px solid var(--t-line)',color:'var(--t-text)',padding:'8px 10px',fontSize:13,outline:'none',boxSizing:'border-box'}}/>},
              {l:'APPLICABLE PRODUCTS', el:<select value={form.products} onChange={e=>setForm(p=>({...p,products:e.target.value}))} style={{width:'100%',background:'var(--t-surface-2)',border:'1px solid var(--t-line)',color:'var(--t-text)',padding:'8px 10px',fontSize:12}}>
                {['All Categories','Intimate Accessories','Lubricants & Massage','Apparel','Wellness','Novelty'].map(c=><option key={c}>{c}</option>)}
              </select>},
              {l:'START DATE', el:<input type="date" value={form.start_date} onChange={e=>setForm(p=>({...p,start_date:e.target.value}))} style={{width:'100%',background:'var(--t-surface-2)',border:'1px solid var(--t-line)',color:'var(--t-text)',padding:'8px 10px',fontSize:12,outline:'none',boxSizing:'border-box'}}/>},
              {l:'END DATE', el:<input type="date" value={form.end_date} onChange={e=>setForm(p=>({...p,end_date:e.target.value}))} style={{width:'100%',background:'var(--t-surface-2)',border:'1px solid var(--t-line)',color:'var(--t-text)',padding:'8px 10px',fontSize:12,outline:'none',boxSizing:'border-box'}}/>},
              {l:'DESCRIPTION', el:<textarea value={form.description} onChange={e=>setForm(p=>({...p,description:e.target.value}))} rows={3} placeholder="Describe the promotion…" style={{width:'100%',background:'var(--t-surface-2)',border:'1px solid var(--t-line)',color:'var(--t-text)',padding:'8px 10px',fontSize:12,outline:'none',resize:'vertical',boxSizing:'border-box'}}/>},
            ].map(({l,el})=>(
              <div key={l} style={{marginBottom:12}}>
                <div style={{fontSize:11,color:'var(--t-text-muted)',marginBottom:4,fontWeight:700}}>{l}</div>
                {el}
              </div>
            ))}
            <div style={{marginBottom:12}}>
              <div style={{fontSize:11,color:'var(--t-text-muted)',marginBottom:6,fontWeight:700}}>LOCATIONS</div>
              <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
                {LOCS.map(loc=>{
                  const sel = form.locations.includes(loc)
                  return (
                    <button key={loc} onClick={()=>setForm(p=>({...p,locations:sel?p.locations.filter(l=>l!==loc):[...p.locations,loc]}))} style={{background:sel?'var(--t-accent)':'var(--t-surface-2)',color:sel?'#000':'var(--t-text)',border:`1px solid ${sel?'var(--t-accent)':'var(--t-line)'}`,padding:'6px 12px',fontSize:12,cursor:'pointer',fontWeight:sel?700:400}}>{loc}</button>
                  )
                })}
              </div>
            </div>
            <div style={{display:'flex',gap:8,marginTop:16}}>
              <button onClick={()=>setShowCreate(false)} style={{flex:1,background:'transparent',border:'1px solid var(--t-line)',color:'var(--t-text-muted)',padding:'10px',fontSize:13,cursor:'pointer'}}>Cancel</button>
              <button onClick={submitPromo} style={{flex:2,background:formSuccess?'var(--t-success)':'var(--t-accent)',color:'#000',border:'none',padding:'10px',fontSize:13,fontWeight:700,cursor:'pointer'}}>
                {formSuccess?'✓ Created!':'Create Promotion'}
              </button>
            </div>
          </div>
        </div>
      )}

      <DrillDown open={!!drill} onClose={() => setDrill(null)} {...(drill || {})} />
    </div>
  )
}
