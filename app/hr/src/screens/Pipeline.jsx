import { useState, useEffect, useCallback, useMemo } from 'react'
import { sb } from '../lib/supabase'
import { useAuth } from '../lib/auth.jsx'
import { useScope } from '../lib/scope.jsx'
import DrillDown from '../components/DrillDown.jsx'

/* ── domain taxonomy (UI config, not business records) ───────────── */
const DEAL_STAGES = ['Lead', 'Qualified', 'Proposal Sent', 'Negotiation', 'Closed Won', 'Closed Lost']

const STAGE_COLOR = {
  'Lead':          '#6b7280',
  'Qualified':     'var(--t-accent)',
  'Proposal Sent': '#a78bfa',
  'Negotiation':   'var(--t-warn)',
  'Closed Won':    'var(--t-success)',
  'Closed Lost':   'var(--t-danger)',
}

const PRODUCT_CATEGORIES = [
  'Lingerie & Intimates',
  'Adult Novelties',
  'Lubricants & Massage',
  'Couples Products',
  'Accessories',
  'Wholesale Bundles',
  'Seasonal / Holiday',
  'Custom Branded',
]

/* ── helpers ─────────────────────────────────────────────────── */
const fmt = d => d ? new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' }) : '—'
const fmtM = d => d ? new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month:'short', day:'numeric' }) : '—'
const fmtCurrency = n => n == null ? '—' : '$' + Number(n).toLocaleString()
const fmtK = n => n == null ? '—' : n >= 1000 ? '$' + (n/1000).toFixed(0) + 'K' : '$' + n
const topKey = obj => { let best=null, n=-1; for (const k in obj) { if (obj[k]>n) { n=obj[k]; best=k } } return best }

/* Normalise a raw pipeline_deals row into the shape the UI consumes.
   Tolerant of snake_case or camelCase so real rows always render. */
function normDeal(r) {
  return {
    id:           r.id,
    company:      r.company ?? '',
    contact:      r.contact ?? '',
    email:        r.email ?? '',
    phone:        r.phone ?? '',
    value:        Number(r.value ?? 0) || 0,
    stage:        r.stage ?? 'Lead',
    location:     r.location ?? r.node_name ?? '',
    rep:          r.rep ?? '',
    daysOpen:     Number(r.daysOpen ?? r.days_open ?? 0) || 0,
    lastActivity: r.lastActivity ?? r.last_activity ?? null,
    closeDate:    r.closeDate ?? r.close_date ?? null,
    products:     Array.isArray(r.products) ? r.products : [],
    notes:        r.notes ?? '',
    nextAction:   r.nextAction ?? r.next_action ?? '',
  }
}

const TABS = ['Pipeline Board','All Deals','Add Deal','Corporate Accounts','Reports']

/* ── shared drill-down columns for deal records ──────────────── */
const DEAL_COLS = [
  { key:'company',      label:'Company',       value:d=>d.company },
  { key:'contact',      label:'Contact',       value:d=>d.contact },
  { key:'value',        label:'Value',         value:d=>fmtCurrency(d.value), align:'right', sortKey:d=>d.value },
  { key:'stage',        label:'Stage',         value:d=>d.stage },
  { key:'location',     label:'Location',      value:d=>d.location },
  { key:'rep',          label:'Rep',           value:d=>d.rep },
  { key:'daysOpen',     label:'Days Open',     value:d=>d.daysOpen, align:'right', sortKey:d=>d.daysOpen },
  { key:'lastActivity', label:'Last Activity', value:d=>fmtM(d.lastActivity), sortKey:d=>d.lastActivity },
]

/* ── KPI Tile ────────────────────────────────────────────────── */
function KTile({ label, value, sub, color, alert, onClick }) {
  return (
    <div onClick={onClick} title={onClick ? 'Click to drill into records' : undefined} style={{
      background: 'var(--t-surface)',
      border: `1px solid ${alert==='red'?'var(--t-danger)':alert==='amber'?'var(--t-warn)':'var(--t-line)'}`,
      padding: '14px 16px',
      position: 'relative',
      overflow: 'hidden',
      minWidth: 0,
      cursor: onClick ? 'pointer' : 'default',
    }}>
      {alert==='red'  && <div style={{position:'absolute',top:0,left:0,right:0,height:2,background:'var(--t-danger)'}}/>}
      {alert==='amber'&& <div style={{position:'absolute',top:0,left:0,right:0,height:2,background:'var(--t-warn)'}}/>}
      <div style={{fontSize:10,fontWeight:700,letterSpacing:'.08em',color:'var(--t-text-muted)',textTransform:'uppercase',marginBottom:6}}>{label}</div>
      <div style={{fontSize:22,fontWeight:800,color:color||'var(--t-text)',lineHeight:1,marginBottom:4}}>{value}</div>
      {sub && <div style={{fontSize:11,color:'var(--t-text-faint)'}}>{sub}</div>}
    </div>
  )
}

/* ── Stage badge ─────────────────────────────────────────────── */
function StageBadge({ stage }) {
  const cls = { 'Closed Won':'badge green', 'Closed Lost':'badge red', 'Negotiation':'badge amber',
                'Proposal Sent':'badge purple', 'Qualified':'badge blue', 'Lead':'badge' }
  return <span className={cls[stage]||'badge'}>{stage}</span>
}

/* ── Deal Detail Drawer ──────────────────────────────────────── */
function DealDrawer({ deal, onClose, onUpdate, onDeleted }) {
  const [stage, setStage] = useState(deal.stage)
  const [notes, setNotes] = useState(deal.notes || '')
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [err, setErr] = useState(null)
  const [confirmDel, setConfirmDel] = useState(false)

  async function save() {
    setSaving(true); setErr(null)
    const { error } = await sb.rpc('update_pipeline_deal', {
      p_deal_id: deal.id,
      p_stage: stage,
      p_notes: notes,
    })
    setSaving(false)
    if (error) { setErr(error.message); return }
    onUpdate({ ...deal, stage, notes })
  }

  async function remove() {
    setDeleting(true); setErr(null)
    const { data, error } = await sb.rpc('delete_pipeline_deal', { p_deal_id: deal.id })
    setDeleting(false)
    if (error) { setErr(error.message); return }
    if (data && data.ok === false) { setErr('Deal could not be deleted.'); return }
    onDeleted()
  }

  function advance() {
    const idx = DEAL_STAGES.indexOf(stage)
    if (idx < 4) setStage(DEAL_STAGES[idx + 1])
  }

  return (
    <div style={{
      position:'fixed',top:0,right:0,bottom:0,width:420,
      background:'var(--t-surface)',borderLeft:'1px solid var(--t-line)',
      zIndex:500,display:'flex',flexDirection:'column',overflowY:'auto',
    }}>
      {/* Header */}
      <div style={{
        padding:'18px 22px',borderBottom:'1px solid var(--t-line)',
        background:'var(--t-surface-2)',display:'flex',alignItems:'flex-start',justifyContent:'space-between',
      }}>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontSize:15,fontWeight:800,color:'var(--t-text)',marginBottom:3,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{deal.company||'—'}</div>
          <div style={{fontSize:12,color:'var(--t-text-muted)'}}>{deal.contact||'—'}{deal.location?` · ${deal.location}`:''}</div>
          <div style={{marginTop:8,display:'flex',alignItems:'center',gap:8}}>
            <StageBadge stage={stage}/>
            <span style={{fontSize:13,fontWeight:700,color:'var(--t-accent)'}}>{fmtCurrency(deal.value)}</span>
          </div>
        </div>
        <button onClick={onClose} style={{background:'none',border:'none',color:'var(--t-text-muted)',fontSize:18,cursor:'pointer',padding:'2px 4px',lineHeight:1,marginLeft:8}}>✕</button>
      </div>

      {/* Body */}
      <div style={{padding:20,flex:1,display:'flex',flexDirection:'column',gap:16}}>

        {/* Info grid */}
        <div style={{background:'var(--t-surface-2)',border:'1px solid var(--t-line)',padding:14}}>
          {[
            {label:'Contact', value: deal.contact||'—'},
            {label:'Email',   value: deal.email||'—'},
            {label:'Phone',   value: deal.phone||'—'},
            {label:'Assigned Rep', value: deal.rep||'—'},
            {label:'Location', value: deal.location||'—'},
            {label:'Days Open', value: (deal.daysOpen||0) + ' days'},
            {label:'Last Activity', value: fmtM(deal.lastActivity)},
            {label:'Est. Close', value: fmt(deal.closeDate)},
            {label:'Next Action', value: deal.nextAction||'—'},
          ].map(r => (
            <div key={r.label} style={{display:'flex',justifyContent:'space-between',padding:'7px 0',borderBottom:'1px solid var(--t-line)',fontSize:12,gap:12}}>
              <span style={{color:'var(--t-text-muted)',flexShrink:0}}>{r.label}</span>
              <span style={{color:'var(--t-text)',textAlign:'right',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{r.value}</span>
            </div>
          ))}
          <div style={{display:'flex',justifyContent:'space-between',padding:'7px 0',fontSize:12}}>
            <span style={{color:'var(--t-text-muted)'}}>Products</span>
            <span style={{color:'var(--t-text)',textAlign:'right'}}>{deal.products?.length ? deal.products.join(', ') : '—'}</span>
          </div>
        </div>

        {/* Stage select */}
        <div>
          <div style={{fontSize:10,fontWeight:700,color:'var(--t-text-muted)',textTransform:'uppercase',letterSpacing:'.08em',marginBottom:7}}>Stage</div>
          <select value={stage} onChange={e=>setStage(e.target.value)} style={{width:'100%',background:'var(--t-surface-2)',border:'1px solid var(--t-line)',color:'var(--t-text)',padding:'9px 11px',fontSize:13}}>
            {DEAL_STAGES.map(s=><option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        {/* Notes */}
        <div>
          <div style={{fontSize:10,fontWeight:700,color:'var(--t-text-muted)',textTransform:'uppercase',letterSpacing:'.08em',marginBottom:7}}>Notes</div>
          <textarea value={notes} onChange={e=>setNotes(e.target.value)} rows={4} placeholder="Deal notes, objections, next steps…"
            style={{width:'100%',background:'var(--t-surface-2)',border:'1px solid var(--t-line)',color:'var(--t-text)',padding:'9px 11px',fontSize:13,resize:'vertical',boxSizing:'border-box',fontFamily:'inherit'}}/>
        </div>

        {/* Actions */}
        <div style={{display:'flex',flexDirection:'column',gap:8}}>
          <button onClick={advance} disabled={stage==='Closed Won'||stage==='Closed Lost'}
            style={{background:'var(--t-accent)',border:'none',color:'#000',padding:'10px 14px',fontSize:13,fontWeight:700,cursor:'pointer',opacity:(stage==='Closed Won'||stage==='Closed Lost')?0.4:1}}>
            ▶ Advance Stage
          </button>
          <div style={{display:'flex',gap:8}}>
            <button onClick={()=>setStage('Closed Won')} style={{flex:1,background:'rgba(0,229,140,0.10)',border:'1px solid var(--t-success)',color:'var(--t-success)',padding:'9px',fontSize:12,cursor:'pointer'}}>
              ✓ Mark Won
            </button>
            <button onClick={()=>setStage('Closed Lost')} style={{flex:1,background:'rgba(255,59,48,0.08)',border:'1px solid var(--t-danger)',color:'var(--t-danger)',padding:'9px',fontSize:12,cursor:'pointer'}}>
              ✕ Mark Lost
            </button>
          </div>
        </div>

        {err && <div style={{color:'var(--t-danger)',fontSize:12}}>{err}</div>}

        {/* Danger zone */}
        <div style={{marginTop:4,borderTop:'1px solid var(--t-line)',paddingTop:14}}>
          {!confirmDel ? (
            <button onClick={()=>setConfirmDel(true)} style={{width:'100%',background:'none',border:'1px solid var(--t-line)',color:'var(--t-text-muted)',padding:'9px',fontSize:12,cursor:'pointer'}}>
              Delete Deal
            </button>
          ) : (
            <div style={{display:'flex',flexDirection:'column',gap:8}}>
              <div style={{fontSize:12,color:'var(--t-text-muted)'}}>Permanently delete this deal?</div>
              <div style={{display:'flex',gap:8}}>
                <button onClick={()=>setConfirmDel(false)} disabled={deleting} style={{flex:1,background:'none',border:'1px solid var(--t-line)',color:'var(--t-text-muted)',padding:'9px',fontSize:12,cursor:'pointer'}}>Cancel</button>
                <button onClick={remove} disabled={deleting} style={{flex:1,background:'rgba(255,59,48,0.08)',border:'1px solid var(--t-danger)',color:'var(--t-danger)',padding:'9px',fontSize:12,fontWeight:700,cursor:'pointer'}}>
                  {deleting ? 'Deleting…' : 'Confirm Delete'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div style={{padding:'14px 20px',borderTop:'1px solid var(--t-line)',background:'var(--t-surface-2)'}}>
        <button onClick={save} disabled={saving} style={{width:'100%',background:'var(--t-accent)',border:'none',color:'#000',padding:'10px',fontSize:13,fontWeight:700,cursor:'pointer'}}>
          {saving ? 'Saving…' : 'Save Changes'}
        </button>
      </div>
    </div>
  )
}

/* ── Kanban Deal Card ────────────────────────────────────────── */
function DealCard({ deal, onSelect }) {
  const color = STAGE_COLOR[deal.stage]
  return (
    <div onClick={()=>onSelect(deal)}
      style={{background:'var(--t-surface)',border:'1px solid var(--t-line)',padding:'12px 13px',cursor:'pointer',borderLeft:`3px solid ${color}`,transition:'background 0.12s'}}
      onMouseEnter={e=>e.currentTarget.style.background='var(--t-surface-2)'}
      onMouseLeave={e=>e.currentTarget.style.background='var(--t-surface)'}
    >
      <div style={{fontWeight:700,fontSize:12,color:'var(--t-text)',marginBottom:2,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{deal.company||'—'}</div>
      <div style={{fontSize:11,color:'var(--t-text-muted)',marginBottom:7}}>{deal.contact||'—'}</div>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:5}}>
        <span style={{fontSize:14,fontWeight:800,color:'var(--t-accent)'}}>{fmtK(deal.value)}</span>
        <span style={{fontSize:10,color:'var(--t-text-faint)'}}>{deal.location||'—'}</span>
      </div>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
        <span style={{fontSize:10,color:'var(--t-text-muted)'}}>{deal.daysOpen}d in stage</span>
        <span style={{fontSize:10,color:'var(--t-text-faint)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',maxWidth:100}}>{deal.rep ? deal.rep.split(' ')[0] : ''}</span>
      </div>
      {deal.nextAction && deal.nextAction !== '—' && (
        <div style={{marginTop:7,fontSize:10,color:'var(--t-warn)',borderTop:'1px solid var(--t-line)',paddingTop:5,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
          → {deal.nextAction}
        </div>
      )}
    </div>
  )
}

/* ── Kanban Board Tab ────────────────────────────────────────── */
function KanbanBoard({ deals, onSelectDeal }) {
  const kanbanStages = ['Lead','Qualified','Proposal Sent','Negotiation','Closed Won','Closed Lost']
  const byStage = {}
  kanbanStages.forEach(s => { byStage[s] = [] })
  deals.forEach(d => { if (byStage[d.stage]) byStage[d.stage].push(d) })

  if (deals.length === 0) {
    return (
      <div style={{border:'1px dashed var(--t-line)',padding:'48px 24px',textAlign:'center',color:'var(--t-text-muted)'}}>
        <div style={{fontSize:14,fontWeight:600,marginBottom:6}}>No deals in the pipeline yet</div>
        <div style={{fontSize:12,color:'var(--t-text-faint)'}}>Use “Add Deal” to create your first opportunity.</div>
      </div>
    )
  }

  return (
    <div style={{display:'flex',gap:10,overflowX:'auto',paddingBottom:12,alignItems:'flex-start',minHeight:400}}>
      {kanbanStages.map(stage => {
        const color = STAGE_COLOR[stage]
        const cards = byStage[stage]||[]
        const stageTotal = cards.reduce((s,d)=>s+d.value,0)
        return (
          <div key={stage} style={{minWidth:210,flex:'0 0 210px',display:'flex',flexDirection:'column',gap:8}}>
            <div style={{borderTop:`3px solid ${color}`,background:'var(--t-surface)',border:'1px solid var(--t-line)',borderTopColor:color,padding:'10px 12px',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
              <div>
                <div style={{fontSize:11,fontWeight:800,color:'var(--t-text)',textTransform:'uppercase',letterSpacing:'.07em'}}>{stage}</div>
                <div style={{fontSize:10,color:'var(--t-text-faint)',marginTop:1}}>{fmtK(stageTotal)}</div>
              </div>
              <span style={{background:'var(--t-surface-2)',border:'1px solid var(--t-line)',color:'var(--t-text-muted)',fontSize:11,fontWeight:700,padding:'2px 7px',minWidth:20,textAlign:'center'}}>{cards.length}</span>
            </div>
            <div style={{display:'flex',flexDirection:'column',gap:7}}>
              {cards.length===0 ? (
                <div style={{border:'1px dashed var(--t-line)',padding:'18px 12px',textAlign:'center',color:'var(--t-text-faint)',fontSize:11}}>Empty</div>
              ) : (
                cards.map(d=><DealCard key={d.id} deal={d} onSelect={onSelectDeal}/>)
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

/* ── All Deals Table Tab ─────────────────────────────────────── */
function AllDealsTab({ deals, onSelectDeal }) {
  const [stageF, setStageF]   = useState('All')
  const [locF,   setLocF]     = useState('All')
  const [repF,   setRepF]     = useState('All')
  const [minVal, setMinVal]   = useState('')
  const [maxVal, setMaxVal]   = useState('')
  const [search, setSearch]   = useState('')
  const [sortCol, setSortCol] = useState('value')
  const [sortDir, setSortDir] = useState('desc')

  // Filter option lists derive from the real loaded deals.
  const locOptions = useMemo(()=>[...new Set(deals.map(d=>d.location).filter(Boolean))].sort(),[deals])
  const repOptions = useMemo(()=>[...new Set(deals.map(d=>d.rep).filter(Boolean))].sort(),[deals])

  function toggleSort(col) {
    if (sortCol===col) setSortDir(d=>d==='asc'?'desc':'asc')
    else { setSortCol(col); setSortDir('desc') }
  }

  const filtered = useMemo(()=>{
    let d = [...deals]
    if (stageF!=='All') d=d.filter(x=>x.stage===stageF)
    if (locF!=='All')   d=d.filter(x=>x.location===locF)
    if (repF!=='All')   d=d.filter(x=>x.rep===repF)
    if (minVal) d=d.filter(x=>x.value>=Number(minVal))
    if (maxVal) d=d.filter(x=>x.value<=Number(maxVal))
    if (search) {
      const q=search.toLowerCase()
      d=d.filter(x=>(x.company||'').toLowerCase().includes(q)||(x.contact||'').toLowerCase().includes(q))
    }
    d.sort((a,b)=>{
      let va=a[sortCol], vb=b[sortCol]
      if (typeof va==='string') va=va.toLowerCase(), vb=(vb||'').toLowerCase()
      return sortDir==='asc' ? (va>vb?1:va<vb?-1:0) : (va<vb?1:va>vb?-1:0)
    })
    return d
  },[deals,stageF,locF,repF,minVal,maxVal,search,sortCol,sortDir])

  const Th=({col,label})=>(
    <th onClick={()=>toggleSort(col)} style={{padding:'9px 12px',fontSize:10,fontWeight:700,textTransform:'uppercase',letterSpacing:'.07em',color:'var(--t-text-muted)',textAlign:'left',cursor:'pointer',whiteSpace:'nowrap',userSelect:'none',background:'var(--t-surface-2)',borderBottom:'1px solid var(--t-line)'}}>
      {label} {sortCol===col?(sortDir==='asc'?'↑':'↓'):''}
    </th>
  )

  return (
    <div>
      {/* Filter bar */}
      <div style={{display:'flex',gap:9,flexWrap:'wrap',marginBottom:14,alignItems:'center'}}>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search company / contact…"
          style={{background:'var(--t-surface)',border:'1px solid var(--t-line)',color:'var(--t-text)',padding:'8px 12px',fontSize:12,minWidth:200,flex:1}}/>
        <select value={stageF} onChange={e=>setStageF(e.target.value)} style={{background:'var(--t-surface)',border:'1px solid var(--t-line)',color:'var(--t-text)',padding:'8px 10px',fontSize:12}}>
          <option value="All">All Stages</option>
          {DEAL_STAGES.map(s=><option key={s} value={s}>{s}</option>)}
        </select>
        <select value={locF} onChange={e=>setLocF(e.target.value)} style={{background:'var(--t-surface)',border:'1px solid var(--t-line)',color:'var(--t-text)',padding:'8px 10px',fontSize:12}}>
          <option value="All">All Locations</option>
          {locOptions.map(l=><option key={l} value={l}>{l}</option>)}
        </select>
        <select value={repF} onChange={e=>setRepF(e.target.value)} style={{background:'var(--t-surface)',border:'1px solid var(--t-line)',color:'var(--t-text)',padding:'8px 10px',fontSize:12}}>
          <option value="All">All Reps</option>
          {repOptions.map(r=><option key={r} value={r}>{r}</option>)}
        </select>
        <input value={minVal} onChange={e=>setMinVal(e.target.value)} placeholder="Min $" type="number"
          style={{background:'var(--t-surface)',border:'1px solid var(--t-line)',color:'var(--t-text)',padding:'8px 10px',fontSize:12,width:90}}/>
        <input value={maxVal} onChange={e=>setMaxVal(e.target.value)} placeholder="Max $" type="number"
          style={{background:'var(--t-surface)',border:'1px solid var(--t-line)',color:'var(--t-text)',padding:'8px 10px',fontSize:12,width:90}}/>
        {(stageF!=='All'||locF!=='All'||repF!=='All'||minVal||maxVal||search)&&(
          <button onClick={()=>{setStageF('All');setLocF('All');setRepF('All');setMinVal('');setMaxVal('');setSearch('')}}
            style={{background:'none',border:'1px solid var(--t-line)',color:'var(--t-text-muted)',padding:'8px 12px',fontSize:11,cursor:'pointer'}}>Clear</button>
        )}
      </div>
      <div style={{overflowX:'auto'}}>
        <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
          <thead>
            <tr>
              <Th col="company"      label="Company"/>
              <Th col="contact"      label="Contact"/>
              <Th col="value"        label="Value"/>
              <Th col="stage"        label="Stage"/>
              <Th col="location"     label="Location"/>
              <Th col="rep"          label="Rep"/>
              <Th col="daysOpen"     label="Days Open"/>
              <Th col="lastActivity" label="Last Activity"/>
              <Th col="closeDate"    label="Close Date"/>
            </tr>
          </thead>
          <tbody>
            {filtered.length===0 && (
              <tr><td colSpan={9} style={{padding:'32px',textAlign:'center',color:'var(--t-text-muted)',fontSize:13}}>{deals.length===0?'No deals yet.':'No deals match filters.'}</td></tr>
            )}
            {filtered.map((d,i)=>(
              <tr key={d.id} onClick={()=>onSelectDeal(d)} style={{cursor:'pointer',background:i%2===0?'transparent':'rgba(255,255,255,0.015)'}}
                onMouseEnter={e=>e.currentTarget.style.background='var(--t-surface-2)'}
                onMouseLeave={e=>e.currentTarget.style.background=i%2===0?'transparent':'rgba(255,255,255,0.015)'}
              >
                <td style={{padding:'9px 12px',borderBottom:'1px solid var(--t-line)',color:'var(--t-text)',fontWeight:600,maxWidth:160,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{d.company||'—'}</td>
                <td style={{padding:'9px 12px',borderBottom:'1px solid var(--t-line)',color:'var(--t-text-muted)',whiteSpace:'nowrap'}}>{d.contact||'—'}</td>
                <td style={{padding:'9px 12px',borderBottom:'1px solid var(--t-line)',color:'var(--t-accent)',fontWeight:700,whiteSpace:'nowrap'}}>{fmtCurrency(d.value)}</td>
                <td style={{padding:'9px 12px',borderBottom:'1px solid var(--t-line)',whiteSpace:'nowrap'}}><StageBadge stage={d.stage}/></td>
                <td style={{padding:'9px 12px',borderBottom:'1px solid var(--t-line)',color:'var(--t-text-muted)',whiteSpace:'nowrap'}}>{d.location||'—'}</td>
                <td style={{padding:'9px 12px',borderBottom:'1px solid var(--t-line)',color:'var(--t-text-muted)',whiteSpace:'nowrap',maxWidth:120,overflow:'hidden',textOverflow:'ellipsis'}}>{d.rep||'—'}</td>
                <td style={{padding:'9px 12px',borderBottom:'1px solid var(--t-line)',color:'var(--t-text-muted)',textAlign:'center'}}>{d.daysOpen}</td>
                <td style={{padding:'9px 12px',borderBottom:'1px solid var(--t-line)',color:'var(--t-text-muted)',whiteSpace:'nowrap'}}>{fmtM(d.lastActivity)}</td>
                <td style={{padding:'9px 12px',borderBottom:'1px solid var(--t-line)',color:'var(--t-text-muted)',whiteSpace:'nowrap'}}>{fmtM(d.closeDate)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{fontSize:11,color:'var(--t-text-faint)',marginTop:10}}>{filtered.length} of {deals.length} deals</div>
    </div>
  )
}

/* ── Add Deal Tab ────────────────────────────────────────────── */
function AddDealTab({ locations, reps, onAdded }) {
  const emptyForm = {
    company:'', contact:'', email:'', phone:'', value:'',
    products:[], locationId: locations[0]?.id || '', location: locations[0]?.name || '',
    rep:'', closeDate:'', notes:'',
  }
  const [form, setForm]     = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [err, setErr]       = useState(null)
  const [success, setSuccess] = useState(false)

  // When scope locations arrive after mount, seed a sensible default.
  useEffect(() => {
    if (!form.locationId && locations.length) {
      const l = locations[0]
      setForm(f => ({ ...f, locationId: l.id, location: l.name }))
    }
  }, [locations]) // eslint-disable-line react-hooks/exhaustive-deps

  const set = (k,v) => setForm(f=>({...f,[k]:v}))

  function toggleProduct(p) {
    setForm(f=>({...f, products: f.products.includes(p) ? f.products.filter(x=>x!==p) : [...f.products, p]}))
  }

  async function submit(e) {
    e.preventDefault()
    if (!form.company.trim()) { setErr('Company name is required.'); return }
    if (!form.contact.trim()) { setErr('Contact name is required.'); return }
    if (!form.value || isNaN(Number(form.value)) || Number(form.value) <= 0) { setErr('Enter a valid deal value.'); return }
    if (!form.locationId) { setErr('Select an assigned location.'); return }
    setSaving(true); setErr(null)
    const { error } = await sb.rpc('create_pipeline_deal', {
      p_company:    form.company.trim(),
      p_contact:    form.contact.trim(),
      p_email:      form.email.trim()||null,
      p_phone:      form.phone.trim()||null,
      p_value:      Number(form.value),
      p_products:   form.products,
      p_location:   form.location||null,
      p_rep:        form.rep.trim()||null,
      p_close_date: form.closeDate||null,
      p_notes:      form.notes.trim()||null,
      p_node_id:    form.locationId,
    })
    setSaving(false)
    if (error) { setErr(error.message); return }
    setSuccess(true)
    setTimeout(()=>setSuccess(false), 3000)
    setForm(emptyForm)
    onAdded()
  }

  const inputStyle = { width:'100%', background:'var(--t-surface-2)', border:'1px solid var(--t-line)', color:'var(--t-text)', padding:'9px 11px', fontSize:13, boxSizing:'border-box' }
  const labelStyle = { fontSize:10, fontWeight:700, color:'var(--t-text-muted)', textTransform:'uppercase', letterSpacing:'.07em', marginBottom:6, display:'block' }

  return (
    <div style={{maxWidth:700}}>
      {success && (
        <div style={{background:'rgba(0,229,140,0.12)',border:'1px solid var(--t-success)',color:'var(--t-success)',padding:'11px 16px',marginBottom:18,fontSize:13,fontWeight:600}}>
          Deal created successfully!
        </div>
      )}
      {locations.length===0 && (
        <div style={{background:'var(--t-surface-2)',border:'1px solid var(--t-warn)',color:'var(--t-warn)',padding:'11px 16px',marginBottom:18,fontSize:12}}>
          No locations are in your current scope, so a deal can’t be assigned. Adjust the location selector to add deals.
        </div>
      )}
      <form onSubmit={submit}>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16,marginBottom:16}}>
          <div>
            <label style={labelStyle}>Company Name *</label>
            <input value={form.company} onChange={e=>set('company',e.target.value)} placeholder="Acme Corp" style={inputStyle}/>
          </div>
          <div>
            <label style={labelStyle}>Contact Name *</label>
            <input value={form.contact} onChange={e=>set('contact',e.target.value)} placeholder="Jane Smith" style={inputStyle}/>
          </div>
          <div>
            <label style={labelStyle}>Contact Email</label>
            <input type="email" value={form.email} onChange={e=>set('email',e.target.value)} placeholder="jane@company.com" style={inputStyle}/>
          </div>
          <div>
            <label style={labelStyle}>Contact Phone</label>
            <input type="tel" value={form.phone} onChange={e=>set('phone',e.target.value)} placeholder="860-555-0000" style={inputStyle}/>
          </div>
          <div>
            <label style={labelStyle}>Deal Value ($) *</label>
            <input type="number" value={form.value} onChange={e=>set('value',e.target.value)} placeholder="25000" min="0" style={inputStyle}/>
          </div>
          <div>
            <label style={labelStyle}>Estimated Close Date</label>
            <input type="date" value={form.closeDate} onChange={e=>set('closeDate',e.target.value)} style={inputStyle}/>
          </div>
          <div>
            <label style={labelStyle}>Assigned Location</label>
            <select value={form.locationId} onChange={e=>{ const loc=locations.find(l=>l.id===e.target.value); set('locationId',loc?.id||''); set('location',loc?.name||'') }} style={inputStyle}>
              {locations.length===0 && <option value="">No locations available</option>}
              {locations.map(l=><option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Assigned Rep</label>
            <input list="pipeline-rep-options" value={form.rep} onChange={e=>set('rep',e.target.value)} placeholder={reps.length?'Select or type a rep':'Type a rep name'} style={inputStyle}/>
            <datalist id="pipeline-rep-options">
              {reps.map(r=><option key={r} value={r}/>)}
            </datalist>
          </div>
        </div>

        {/* Products of interest */}
        <div style={{marginBottom:16}}>
          <label style={labelStyle}>Products of Interest</label>
          <div style={{display:'flex',flexWrap:'wrap',gap:8}}>
            {PRODUCT_CATEGORIES.map(p=>(
              <button key={p} type="button" onClick={()=>toggleProduct(p)}
                style={{background:form.products.includes(p)?'var(--t-accent)':' var(--t-surface-2)',border:`1px solid ${form.products.includes(p)?'var(--t-accent)':'var(--t-line)'}`,color:form.products.includes(p)?'#000':'var(--t-text-muted)',padding:'6px 12px',fontSize:11,cursor:'pointer',fontWeight:form.products.includes(p)?700:400}}>
                {p}
              </button>
            ))}
          </div>
        </div>

        {/* Notes */}
        <div style={{marginBottom:20}}>
          <label style={labelStyle}>Notes</label>
          <textarea value={form.notes} onChange={e=>set('notes',e.target.value)} rows={4}
            placeholder="Initial contact details, context, objections, budget confirmed, etc."
            style={{...inputStyle,resize:'vertical',fontFamily:'inherit'}}/>
        </div>

        {err && <div style={{color:'var(--t-danger)',fontSize:12,marginBottom:12}}>{err}</div>}

        <div style={{display:'flex',gap:10}}>
          <button type="button" onClick={()=>setForm(emptyForm)} style={{background:'none',border:'1px solid var(--t-line)',color:'var(--t-text-muted)',padding:'10px 22px',fontSize:13,cursor:'pointer'}}>
            Reset
          </button>
          <button type="submit" disabled={saving||locations.length===0} style={{background:'var(--t-accent)',border:'none',color:'#000',padding:'10px 28px',fontSize:13,fontWeight:700,cursor:'pointer',opacity:locations.length===0?0.4:1}}>
            {saving ? 'Creating…' : '+ Create Deal'}
          </button>
        </div>
      </form>
    </div>
  )
}

/* ── Corporate Accounts Tab ──────────────────────────────────── */
/* Real account view — aggregated from the live pipeline_deals data by company.
   Nothing is fabricated: spend/orders reflect closed-won deals, open pipeline
   reflects active deals, rep/location are the most frequent on record. */
function CorporateAccountsTab({ deals }) {
  const [drill, setDrill] = useState(null)

  const accounts = useMemo(()=>{
    const m = {}
    deals.forEach(d=>{
      if (!d.company) return
      const a = m[d.company] || (m[d.company] = { company:d.company, spend:0, wonOrders:0, openValue:0, openDeals:0, totalDeals:0, lastActivity:null, reps:{}, locations:{} })
      a.totalDeals++
      if (d.stage==='Closed Won') { a.spend += d.value; a.wonOrders++ }
      if (!['Closed Won','Closed Lost'].includes(d.stage)) { a.openValue += d.value; a.openDeals++ }
      if (d.rep) a.reps[d.rep] = (a.reps[d.rep]||0)+1
      if (d.location) a.locations[d.location] = (a.locations[d.location]||0)+1
      if (d.lastActivity && (!a.lastActivity || d.lastActivity > a.lastActivity)) a.lastActivity = d.lastActivity
    })
    return Object.values(m).map(a=>({ ...a, rep: topKey(a.reps), location: topKey(a.locations) }))
      .sort((x,y)=>(y.spend+y.openValue)-(x.spend+x.openValue))
  },[deals])

  const ACCOUNT_COLS = [
    { key:'company',   label:'Company',       value:a=>a.company },
    { key:'spend',     label:'Won Spend',     value:a=>fmtCurrency(a.spend), align:'right', sortKey:a=>a.spend },
    { key:'wonOrders', label:'Won Orders',    value:a=>a.wonOrders, align:'right', sortKey:a=>a.wonOrders },
    { key:'openValue', label:'Open Pipeline', value:a=>fmtCurrency(a.openValue), align:'right', sortKey:a=>a.openValue },
    { key:'openDeals', label:'Open Deals',    value:a=>a.openDeals, align:'right', sortKey:a=>a.openDeals },
    { key:'rep',       label:'Rep',           value:a=>a.rep||'—' },
    { key:'location',  label:'Location',      value:a=>a.location||'—' },
    { key:'lastActivity',label:'Last Activity',value:a=>fmtM(a.lastActivity), sortKey:a=>a.lastActivity },
  ]
  const openDrill = (title, rows, accent) => setDrill({ title, subtitle:`${rows.length} account${rows.length===1?'':'s'}`, columns:ACCOUNT_COLS, rows, accent })

  const totalSpend = accounts.reduce((s,a)=>s+a.spend,0)
  const totalOpen  = accounts.reduce((s,a)=>s+a.openValue,0)
  const withOpen   = accounts.filter(a=>a.openDeals>0)

  if (accounts.length===0) {
    return (
      <div style={{border:'1px dashed var(--t-line)',padding:'48px 24px',textAlign:'center',color:'var(--t-text-muted)'}}>
        <div style={{fontSize:14,fontWeight:600,marginBottom:6}}>No corporate accounts yet</div>
        <div style={{fontSize:12,color:'var(--t-text-faint)'}}>Accounts are built automatically from pipeline deals. Add deals to populate this view.</div>
      </div>
    )
  }

  return (
    <div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:12,marginBottom:20}}>
        <KTile label="Total Accounts" value={accounts.length} sub="companies in pipeline"
          onClick={()=>openDrill('All Corporate Accounts', [...accounts], 'var(--t-accent)')}/>
        <KTile label="Won Spend" value={fmtK(totalSpend)} sub="closed-won total" color="var(--t-success)"
          onClick={()=>openDrill('Won Spend by Account', [...accounts].sort((a,b)=>b.spend-a.spend), 'var(--t-success)')}/>
        <KTile label="Open Pipeline" value={fmtK(totalOpen)} sub="active deal value" color="var(--t-accent)"
          onClick={()=>openDrill('Open Pipeline by Account', [...accounts].sort((a,b)=>b.openValue-a.openValue), 'var(--t-accent)')}/>
        <KTile label="Accounts w/ Open Deals" value={withOpen.length} sub="currently active" alert={withOpen.length>0?null:'amber'}
          onClick={()=>openDrill('Accounts With Open Deals', withOpen, 'var(--t-accent)')}/>
      </div>
      <div style={{overflowX:'auto'}}>
        <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
          <thead>
            <tr style={{background:'var(--t-surface-2)'}}>
              {['Company','Won Spend','Won Orders','Open Pipeline','Open Deals','Last Activity','Rep','Location'].map(h=>(
                <th key={h} style={{padding:'9px 12px',fontSize:10,fontWeight:700,textTransform:'uppercase',letterSpacing:'.07em',color:'var(--t-text-muted)',textAlign:'left',borderBottom:'1px solid var(--t-line)',whiteSpace:'nowrap'}}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {accounts.map((a,i)=>(
              <tr key={a.company} style={{background:i%2===0?'transparent':'rgba(255,255,255,0.015)'}}
                onMouseEnter={e=>e.currentTarget.style.background='var(--t-surface-2)'}
                onMouseLeave={e=>e.currentTarget.style.background=i%2===0?'transparent':'rgba(255,255,255,0.015)'}
              >
                <td style={{padding:'10px 12px',borderBottom:'1px solid var(--t-line)',color:'var(--t-text)',fontWeight:700}}>{a.company}</td>
                <td style={{padding:'10px 12px',borderBottom:'1px solid var(--t-line)',color:'var(--t-success)',fontWeight:700}}>{a.spend>0?fmtCurrency(a.spend):'—'}</td>
                <td style={{padding:'10px 12px',borderBottom:'1px solid var(--t-line)',color:'var(--t-text-muted)',textAlign:'center'}}>{a.wonOrders}</td>
                <td style={{padding:'10px 12px',borderBottom:'1px solid var(--t-line)',color:'var(--t-accent)',fontWeight:700}}>{a.openValue>0?fmtCurrency(a.openValue):'—'}</td>
                <td style={{padding:'10px 12px',borderBottom:'1px solid var(--t-line)',color:'var(--t-text-muted)',textAlign:'center'}}>{a.openDeals}</td>
                <td style={{padding:'10px 12px',borderBottom:'1px solid var(--t-line)',color:'var(--t-text-muted)',whiteSpace:'nowrap'}}>{fmtM(a.lastActivity)}</td>
                <td style={{padding:'10px 12px',borderBottom:'1px solid var(--t-line)',color:'var(--t-text-muted)',whiteSpace:'nowrap'}}>{a.rep||'—'}</td>
                <td style={{padding:'10px 12px',borderBottom:'1px solid var(--t-line)',color:'var(--t-text-muted)'}}>{a.location||'—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <DrillDown open={!!drill} onClose={()=>setDrill(null)} {...(drill||{})} />
    </div>
  )
}

/* ── Reports Tab ─────────────────────────────────────────────── */
function ReportsTab({ deals }) {
  const [drill, setDrill] = useState(null)
  const openDrill = (title, rows, accent) => setDrill({ title, subtitle:`${rows.length} deal${rows.length===1?'':'s'}`, columns:DEAL_COLS, rows, accent })

  const won  = deals.filter(d=>d.stage==='Closed Won')
  const lost = deals.filter(d=>d.stage==='Closed Lost')
  const active = deals.filter(d=>!['Closed Won','Closed Lost'].includes(d.stage))

  const winRate = won.length+lost.length > 0 ? Math.round(won.length/(won.length+lost.length)*100) : 0
  const avgDeal = won.length > 0 ? Math.round(won.reduce((s,d)=>s+d.value,0)/won.length) : 0
  const avgDays = active.length > 0 ? Math.round(active.reduce((s,d)=>s+d.daysOpen,0)/active.length) : 0

  // Pipeline value by stage (active only)
  const stageVal = {}
  DEAL_STAGES.slice(0,4).forEach(s=>{ stageVal[s]=deals.filter(d=>d.stage===s).reduce((a,d)=>a+d.value,0) })
  const maxStageVal = Math.max(...Object.values(stageVal), 1)

  // By rep (top 6) — real closed-won counts
  const repMap = {}
  won.forEach(d=>{ if(d.rep) repMap[d.rep] = (repMap[d.rep]||0)+1 })
  const topReps = Object.entries(repMap).sort((a,b)=>b[1]-a[1]).slice(0,6)

  // By location — active pipeline, derived from real deal locations
  const locNames = [...new Set(deals.map(d=>d.location).filter(Boolean))]
  const locMap = {}
  locNames.forEach(l=>{ locMap[l]={value:0,count:0} })
  active.forEach(d=>{ if(locMap[d.location]){ locMap[d.location].value+=d.value; locMap[d.location].count++ } })

  // Monthly closed-won trend — real, grouped by close date (last 6 months present)
  const monthMap = {}
  won.forEach(d=>{ if(!d.closeDate) return; const k=String(d.closeDate).slice(0,7); monthMap[k]=(monthMap[k]||0)+d.value })
  const monthlyWon = Object.entries(monthMap).sort((a,b)=>a[0]<b[0]?-1:1).slice(-6)
    .map(([k,v])=>({ month:new Date(k+'-01T00:00:00').toLocaleDateString('en-US',{month:'short'}), value:v }))
  const maxMonth = Math.max(...monthlyWon.map(m=>m.value), 1)

  const lostValue = lost.reduce((s,d)=>s+d.value,0)
  const avgLost = lost.length>0 ? Math.round(lostValue/lost.length) : 0

  const sectionHead = (title,badge)=>(
    <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:14}}>
      <span style={{fontSize:12,fontWeight:800,color:'var(--t-text)',textTransform:'uppercase',letterSpacing:'.07em'}}>{title}</span>
      {badge&&<span className="badge blue">{badge}</span>}
    </div>
  )

  return (
    <div style={{display:'flex',flexDirection:'column',gap:24}}>
      {/* Summary KPIs */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:12}}>
        <KTile label="Win Rate" value={winRate+'%'} sub={`${won.length} won, ${lost.length} lost`} color={winRate>=50?'var(--t-success)':'var(--t-danger)'} alert={won.length+lost.length===0?null:winRate<40?'red':winRate<55?'amber':null}
          onClick={()=>openDrill('Closed Deals (Won + Lost)', [...won,...lost], winRate>=50?'var(--t-success)':'var(--t-danger)')}/>
        <KTile label="Avg Won Deal" value={fmtK(avgDeal)} sub="closed-won average" color="var(--t-accent)"
          onClick={()=>openDrill('Closed-Won Deals', [...won].sort((a,b)=>b.value-a.value), 'var(--t-success)')}/>
        <KTile label="Avg Days to Close" value={avgDays} sub="active deals" alert={avgDays>60?'amber':null}
          onClick={()=>openDrill('Active Deals — Days Open', [...active].sort((a,b)=>b.daysOpen-a.daysOpen), 'var(--t-warn)')}/>
        <KTile label="Pipeline Coverage" value={(active.reduce((s,d)=>s+d.value,0)/Math.max(won.reduce((s,d)=>s+d.value,0),1)).toFixed(1)+'x'} sub="active vs closed won"
          onClick={()=>openDrill('Active Pipeline Deals', [...active].sort((a,b)=>b.value-a.value), 'var(--t-accent)')}/>
      </div>

      {/* Pipeline by stage bar chart */}
      <div style={{background:'var(--t-surface)',border:'1px solid var(--t-line)',padding:18}}>
        {sectionHead('Pipeline Value by Stage')}
        <div style={{display:'flex',flexDirection:'column',gap:11}}>
          {Object.entries(stageVal).map(([stage,val])=>(
            <div key={stage} style={{display:'flex',alignItems:'center',gap:12}}>
              <div style={{width:120,fontSize:11,color:'var(--t-text-muted)',textAlign:'right',flexShrink:0}}>{stage}</div>
              <div style={{flex:1,height:22,background:'var(--t-surface-2)',border:'1px solid var(--t-line)',position:'relative',overflow:'hidden'}}>
                <div style={{width:val/maxStageVal*100+'%',height:'100%',background:STAGE_COLOR[stage]||'var(--t-accent)',opacity:0.85,transition:'width 0.5s'}}/>
                {val>0&&<span style={{position:'absolute',left:8,top:'50%',transform:'translateY(-50%)',fontSize:11,fontWeight:700,color:'#fff',mixBlendMode:'difference'}}>{fmtK(val)}</span>}
              </div>
              <div style={{width:40,fontSize:11,color:'var(--t-text-faint)',flexShrink:0,textAlign:'right'}}>{deals.filter(d=>d.stage===stage).length}d</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16}}>
        {/* Monthly trend */}
        <div style={{background:'var(--t-surface)',border:'1px solid var(--t-line)',padding:18}}>
          {sectionHead('Monthly Closed-Won Trend')}
          {monthlyWon.length===0 ? (
            <div style={{color:'var(--t-text-faint)',fontSize:12}}>No closed-won deals with a close date yet.</div>
          ) : (
            <div style={{display:'flex',alignItems:'flex-end',gap:10,height:120}}>
              {monthlyWon.map((m,i)=>(
                <div key={m.month+i} style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',gap:4}}>
                  <div style={{width:'100%',background:'var(--t-success)',opacity:0.8,height:m.value/maxMonth*100+'px',transition:'height 0.4s',minHeight:4}}/>
                  <div style={{fontSize:10,color:'var(--t-text-muted)'}}>{m.month}</div>
                  <div style={{fontSize:10,color:'var(--t-text-faint)'}}>{fmtK(m.value)}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Win rate by rep */}
        <div style={{background:'var(--t-surface)',border:'1px solid var(--t-line)',padding:18}}>
          {sectionHead('Top Reps (Won Deals)')}
          {topReps.length===0 ? (
            <div style={{color:'var(--t-text-faint)',fontSize:12}}>No closed-won deals yet.</div>
          ) : (
            <div style={{display:'flex',flexDirection:'column',gap:9}}>
              {topReps.map(([rep,count])=>(
                <div key={rep} style={{display:'flex',alignItems:'center',gap:10}}>
                  <div style={{width:110,fontSize:11,color:'var(--t-text-muted)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{rep}</div>
                  <div style={{flex:1,height:16,background:'var(--t-surface-2)',border:'1px solid var(--t-line)',overflow:'hidden'}}>
                    <div style={{width:(count/Math.max(...topReps.map(r=>r[1]),1)*100)+'%',height:'100%',background:'var(--t-accent)',opacity:0.8}}/>
                  </div>
                  <div style={{width:20,fontSize:11,color:'var(--t-text-muted)',textAlign:'right'}}>{count}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Pipeline by location */}
      <div style={{background:'var(--t-surface)',border:'1px solid var(--t-line)',padding:18}}>
        {sectionHead('Pipeline by Location')}
        {locNames.length===0 ? (
          <div style={{color:'var(--t-text-faint)',fontSize:12}}>No deals to break down by location yet.</div>
        ) : (
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
            <thead>
              <tr>
                {['Location','Active Deals','Pipeline Value','Avg Deal Size'].map(h=>(
                  <th key={h} style={{padding:'8px 12px',fontSize:10,fontWeight:700,textTransform:'uppercase',letterSpacing:'.07em',color:'var(--t-text-muted)',textAlign:'left',borderBottom:'1px solid var(--t-line)',background:'var(--t-surface-2)'}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {locNames.map((loc,i)=>{
                const ld = locMap[loc]
                const avg = ld.count>0?Math.round(ld.value/ld.count):0
                return (
                  <tr key={loc} style={{background:i%2===0?'transparent':'rgba(255,255,255,0.015)'}}>
                    <td style={{padding:'9px 12px',borderBottom:'1px solid var(--t-line)',color:'var(--t-text)',fontWeight:600}}>{loc}</td>
                    <td style={{padding:'9px 12px',borderBottom:'1px solid var(--t-line)',color:'var(--t-text-muted)',textAlign:'center'}}>{ld.count}</td>
                    <td style={{padding:'9px 12px',borderBottom:'1px solid var(--t-line)',color:'var(--t-accent)',fontWeight:700}}>{fmtCurrency(ld.value)}</td>
                    <td style={{padding:'9px 12px',borderBottom:'1px solid var(--t-line)',color:'var(--t-text-muted)'}}>{avg>0?fmtCurrency(avg):'—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Lost deal analysis — real */}
      <div style={{background:'var(--t-surface)',border:'1px solid var(--t-line)',padding:18}}>
        {sectionHead('Lost Deals Analysis', `${lost.length} lost`)}
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:20}}>
          <div>
            <div style={{fontSize:11,color:'var(--t-text-muted)',marginBottom:10}}>Summary</div>
            {[
              {label:'Deals Lost', value: lost.length},
              {label:'Value Lost', value: fmtCurrency(lostValue)},
              {label:'Avg Lost Deal', value: lost.length?fmtCurrency(avgLost):'—'},
            ].map(r=>(
              <div key={r.label} style={{display:'flex',justifyContent:'space-between',padding:'7px 0',borderBottom:'1px solid var(--t-line)',fontSize:12}}>
                <span style={{color:'var(--t-text-muted)'}}>{r.label}</span>
                <span style={{color:'var(--t-danger)',fontWeight:700}}>{r.value}</span>
              </div>
            ))}
          </div>
          <div>
            <div style={{fontSize:11,color:'var(--t-text-muted)',marginBottom:10}}>Lost Deals</div>
            {lost.map(d=>(
              <div key={d.id} style={{padding:'7px 0',borderBottom:'1px solid var(--t-line)',fontSize:12}}>
                <div style={{color:'var(--t-text)',fontWeight:600}}>{d.company||'—'}</div>
                <div style={{color:'var(--t-text-muted)',fontSize:11}}>{fmtCurrency(d.value)}{d.rep?` · ${d.rep}`:''}</div>
              </div>
            ))}
            {lost.length===0&&<div style={{color:'var(--t-text-faint)',fontSize:12}}>No lost deals on record.</div>}
          </div>
        </div>
      </div>

      <DrillDown open={!!drill} onClose={()=>setDrill(null)} {...(drill||{})} />
    </div>
  )
}

/* ── Main Component ──────────────────────────────────────────── */
export default function Pipeline() {
  const { session }               = useAuth()
  const { locationIds, locations } = useScope()

  const roleName = (session?.person?.role_name || '').toLowerCase()
  const canAccessPipeline = ['ceo','manager','coo','admin','owner','hr'].some(r => roleName.includes(r))

  const [tab, setTab]         = useState(0)
  const [deals, setDeals]     = useState([])
  const [reps, setReps]       = useState([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(null)
  const [drill, setDrill]     = useState(null)
  const openDrill = (title, rows, accent) => setDrill({ title, subtitle:`${rows.length} deal${rows.length===1?'':'s'}`, columns:DEAL_COLS, rows, accent })

  const load = useCallback(async () => {
    setLoading(true)
    const [dealsRes, rosterRes] = await Promise.all([
      sb.rpc('get_pipeline_deals', { p_node_ids: locationIds }),
      sb.rpc('get_roster', { p_node_ids: locationIds, p_actor: session?.person?.id ?? null }),
    ])
    const rows = Array.isArray(dealsRes.data) ? dealsRes.data : []
    setDeals(rows.map(normDeal))
    const roster = Array.isArray(rosterRes.data) ? rosterRes.data : []
    setReps([...new Set(roster.map(p=>p.full_name).filter(Boolean))].sort())
    setLoading(false)
  }, [locationIds, session])

  useEffect(() => { load() }, [load])

  function handleUpdate(updated) {
    setDeals(prev => prev.map(d => d.id === updated.id ? updated : d))
    setSelected(updated)
  }

  function handleDeleted() {
    setSelected(null)
    load()
  }

  if (!canAccessPipeline) {
    return (
      <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:400, flexDirection:'column', gap:12 }}>
        <div style={{ fontSize:32, opacity:.2 }}>🔒</div>
        <div style={{ fontSize:14, color:'var(--t-text-muted)', fontWeight:600 }}>Access Restricted</div>
        <div style={{ fontSize:12, color:'var(--t-text-faint)' }}>Pipeline data is available to managers and above.</div>
      </div>
    )
  }

  /* ── derived KPI numbers ── */
  const activePipeline = useMemo(()=>deals.filter(d=>!['Closed Won','Closed Lost'].includes(d.stage)),[deals])
  const wonDeals       = useMemo(()=>deals.filter(d=>d.stage==='Closed Won'),[deals])
  const lostDeals      = useMemo(()=>deals.filter(d=>d.stage==='Closed Lost'),[deals])
  const totalPipeVal   = useMemo(()=>activePipeline.reduce((s,d)=>s+d.value,0),[activePipeline])
  const wonVal         = useMemo(()=>wonDeals.reduce((s,d)=>s+d.value,0),[wonDeals])
  const winRate        = wonDeals.length+lostDeals.length>0 ? Math.round(wonDeals.length/(wonDeals.length+lostDeals.length)*100) : 0
  const avgDeal        = activePipeline.length>0 ? Math.round(totalPipeVal/activePipeline.length) : 0
  const avgDaysClose   = activePipeline.length>0 ? Math.round(activePipeline.reduce((s,d)=>s+d.daysOpen,0)/activePipeline.length) : 0
  const pipeCoverage   = wonVal>0 ? (totalPipeVal/wonVal).toFixed(1)+'x' : '—'

  const countStage = s => deals.filter(d=>d.stage===s).length

  // Location breakdown (active) — real distinct locations from loaded deals
  const locNames = useMemo(()=>[...new Set(deals.map(d=>d.location).filter(Boolean))],[deals])
  const locBreakdown = locNames.map(loc=>{
    const ld = activePipeline.filter(d=>d.location===loc)
    return { loc, value: ld.reduce((s,d)=>s+d.value,0), count: ld.length }
  })

  if (loading) {
    return (
      <div style={{display:'flex',alignItems:'center',justifyContent:'center',padding:80,color:'var(--t-text-muted)'}}>
        Loading pipeline…
      </div>
    )
  }

  const locCount = locations?.length || 0

  return (
    <div style={{padding:24,paddingRight:selected?444:24,transition:'padding-right 0.25s',minHeight:'100vh'}}>

      {/* ── Header ── */}
      <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:22}}>
        <div>
          <div style={{fontSize:22,fontWeight:800,color:'var(--t-text)',letterSpacing:-0.5}}>Sales Pipeline</div>
          <div style={{fontSize:12,color:'var(--t-text-muted)',marginTop:3}}>B2B wholesale &amp; corporate account opportunities{locCount?` across ${locCount} location${locCount===1?'':'s'}`:''}</div>
        </div>
        <button onClick={()=>setTab(2)} style={{background:'var(--t-accent)',border:'none',color:'#000',padding:'10px 20px',fontSize:13,fontWeight:700,cursor:'pointer',whiteSpace:'nowrap'}}>
          + New Deal
        </button>
      </div>

      {/* ── FORENSIC KPI PANEL ── */}
      <div style={{background:'var(--t-surface-2)',border:'1px solid var(--t-line)',padding:'16px 16px 12px',marginBottom:20}}>
        <div style={{fontSize:10,fontWeight:800,letterSpacing:'.1em',color:'var(--t-text-muted)',textTransform:'uppercase',marginBottom:12}}>Pipeline Intelligence</div>

        {/* Row 1 — Value KPIs */}
        <div style={{display:'grid',gridTemplateColumns:'repeat(6,1fr)',gap:10,marginBottom:10}}>
          <KTile label="Total Pipeline" value={fmtK(totalPipeVal)} sub="active stages" color="var(--t-accent)"
            onClick={()=>openDrill('Total Pipeline — Active Deals', [...activePipeline].sort((a,b)=>b.value-a.value), 'var(--t-accent)')}/>
          <KTile label="Deals Active"   value={activePipeline.length} sub="in funnel"
            onClick={()=>openDrill('Active Deals in Funnel', [...activePipeline].sort((a,b)=>b.value-a.value), 'var(--t-accent)')}/>
          <KTile label="Avg Deal Size"  value={fmtK(avgDeal)} sub="active deals"
            onClick={()=>openDrill('Active Deals by Value', [...activePipeline].sort((a,b)=>b.value-a.value), 'var(--t-accent)')}/>
          <KTile label="Won This Month" value={fmtK(wonVal)} sub={`${wonDeals.length} deals`} color="var(--t-success)"
            onClick={()=>openDrill('Closed-Won Deals', [...wonDeals].sort((a,b)=>b.value-a.value), 'var(--t-success)')}/>
          <KTile label="Lost"           value={lostDeals.length} sub="closed lost" alert={lostDeals.length>2?'amber':null}
            onClick={()=>openDrill('Closed-Lost Deals', lostDeals, 'var(--t-danger)')}/>
          <KTile label="Win Rate"       value={winRate+'%'} sub="won vs total closed" color={winRate>=50?'var(--t-success)':'var(--t-danger)'} alert={wonDeals.length+lostDeals.length===0?null:winRate<40?'red':winRate<55?'amber':null}
            onClick={()=>openDrill('Closed Deals (Won + Lost)', [...wonDeals,...lostDeals], winRate>=50?'var(--t-success)':'var(--t-danger)')}/>
        </div>

        {/* Row 2 — Stage counts + velocity */}
        <div style={{display:'grid',gridTemplateColumns:'repeat(6,1fr)',gap:10,marginBottom:10}}>
          <KTile label="Leads"          value={countStage('Lead')} sub="stage 1"
            onClick={()=>openDrill('Deals — Lead Stage', deals.filter(d=>d.stage==='Lead'), STAGE_COLOR['Lead'])}/>
          <KTile label="Qualified"      value={countStage('Qualified')} sub="stage 2"
            onClick={()=>openDrill('Deals — Qualified Stage', deals.filter(d=>d.stage==='Qualified'), STAGE_COLOR['Qualified'])}/>
          <KTile label="Proposals Out"  value={countStage('Proposal Sent')} sub="stage 3" alert={countStage('Proposal Sent')>3?'amber':null}
            onClick={()=>openDrill('Deals — Proposal Sent', deals.filter(d=>d.stage==='Proposal Sent'), STAGE_COLOR['Proposal Sent'])}/>
          <KTile label="Negotiations"   value={countStage('Negotiation')} sub="stage 4"
            onClick={()=>openDrill('Deals — Negotiation Stage', deals.filter(d=>d.stage==='Negotiation'), STAGE_COLOR['Negotiation'])}/>
          <KTile label="Avg Days Open"  value={avgDaysClose} sub="active deals" alert={avgDaysClose>45?'amber':null}
            onClick={()=>openDrill('Active Deals — Days Open', [...activePipeline].sort((a,b)=>b.daysOpen-a.daysOpen), 'var(--t-warn)')}/>
          <KTile label="Coverage Ratio" value={pipeCoverage} sub="pipeline / won"
            onClick={()=>openDrill('Active Pipeline Deals', [...activePipeline].sort((a,b)=>b.value-a.value), 'var(--t-accent)')}/>
        </div>

        {/* Row 3 — Location breakdown mini-table */}
        <div style={{background:'var(--t-surface)',border:'1px solid var(--t-line)',padding:'10px 14px'}}>
          <div style={{fontSize:10,fontWeight:700,color:'var(--t-text-muted)',textTransform:'uppercase',letterSpacing:'.07em',marginBottom:8}}>Active Pipeline by Location</div>
          {locBreakdown.length===0 ? (
            <div style={{fontSize:11,color:'var(--t-text-faint)'}}>No active deals to break down by location yet.</div>
          ) : (
            <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:8}}>
              {locBreakdown.map(({loc,value,count})=>(
                <div key={loc} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'6px 10px',background:'var(--t-surface-2)',border:'1px solid var(--t-line)'}}>
                  <div>
                    <div style={{fontSize:11,fontWeight:700,color:'var(--t-text)'}}>{loc}</div>
                    <div style={{fontSize:10,color:'var(--t-text-faint)'}}>{count} deal{count!==1?'s':''}</div>
                  </div>
                  <div style={{fontSize:13,fontWeight:800,color:'var(--t-accent)'}}>{fmtK(value)}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Tabs ── */}
      <div style={{display:'flex',gap:0,borderBottom:'1px solid var(--t-line)',marginBottom:20}}>
        {TABS.map((t,i)=>(
          <button key={t} onClick={()=>setTab(i)}
            style={{background:'none',border:'none',borderBottom:tab===i?'2px solid var(--t-accent)':'2px solid transparent',color:tab===i?'var(--t-accent)':'var(--t-text-muted)',padding:'10px 18px',fontSize:13,fontWeight:tab===i?700:400,cursor:'pointer',whiteSpace:'nowrap',marginBottom:-1}}>
            {t}
          </button>
        ))}
      </div>

      {/* ── Tab Content ── */}
      {tab===0 && <KanbanBoard deals={deals} onSelectDeal={setSelected}/>}
      {tab===1 && <AllDealsTab deals={deals} onSelectDeal={setSelected}/>}
      {tab===2 && <AddDealTab locations={locations||[]} reps={reps} onAdded={load}/>}
      {tab===3 && <CorporateAccountsTab deals={deals}/>}
      {tab===4 && <ReportsTab deals={deals}/>}

      {/* ── Deal Detail Drawer ── */}
      {selected && (
        <DealDrawer
          deal={selected}
          onClose={()=>setSelected(null)}
          onUpdate={handleUpdate}
          onDeleted={handleDeleted}
        />
      )}

      {/* ── Forensic Drill-Down Modal ── */}
      <DrillDown open={!!drill} onClose={()=>setDrill(null)} {...(drill||{})} />
    </div>
  )
}
