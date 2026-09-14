import { useEffect, useState } from 'react'
import { rpc, getSession } from '../lib/supabase'


function CodeBadge({ status }){
  if(!status) return null
  const cls = status.color === 'green' ? 'green' : 'amber'
  return <span className={`code ${cls}`} title={status.label}>{status.code}</span>
}

function Legend(){
  const items = [
    ['K','Key Holder (fully trained)'],['KT','Key Holder in Training'],
    ['KRT','Key Holder · Register Training'],['A','Associate (floor+register)'],
    ['ART','Associate · Register Training'],['T','New Hire in Training'],
  ]
  return (
    <div className="legend">
      {items.map(([c,l])=>(
        <span className="item" key={c}><b style={{color:'var(--t-muted)'}}>{c}</b> = {l}</span>
      ))}
    </div>
  )
}

export default function ScheduleBuilder(){
  const me = getSession()
  const nodes = (me.nodes||[]).filter(n=>n.node_type==='location')
  const [nodeId,setNodeId] = useState(nodes[0]?.id || null)
  const [view,setView] = useState('daily')   // daily | weekly
  const [date,setDate] = useState(new Date().toISOString().slice(0,10))
  const [weekStart,setWeekStart] = useState(mondayOf(new Date()))
  const [avail,setAvail] = useState(null)
  const [zones,setZones] = useState([])
  const [shifts,setShifts] = useState([])
  const [weeks,setWeeks] = useState(1)
  const [banner,setBanner] = useState(null)
  const [modal,setModal] = useState(null)   // {slot, template}
  const [busy,setBusy] = useState(false)

  function mondayOf(d){ const x=new Date(d); const day=(x.getDay()+6)%7; x.setDate(x.getDate()-day); return x.toISOString().slice(0,10) }

  async function loadDaily(){
    setBanner(null)
    try{
      const [a,z] = await Promise.all([
        rpc('schedule_availability',{ p_person_id: me.id, p_node_id: nodeId, p_date: date }),
        rpc('zones_for_node',{ p_person_id: me.id, p_node_id: nodeId })
      ])
      setAvail(a); setZones(z?.zones || [])
    }catch(e){ setBanner({type:'err',msg:e.message}) }
  }

  async function loadWeekShifts(){
    try{
      const node_ids = [nodeId]
      const data = await rpc('scope_shifts',{ p_node_ids: node_ids, p_actor: me.id })
      setShifts(Array.isArray(data)? data : (data?.shifts||[]))
    }catch(e){ /* scope_shifts optional */ setShifts([]) }
  }

  useEffect(()=>{ if(view==='daily') loadDaily(); else loadWeekShifts() },[nodeId,date,view,weekStart])

  async function draftWeeks(){
    setBusy(true); setBanner(null)
    try{
      const res = await rpc('ai_draft_multiweek',{
        p_actor: me.id, p_node_id: nodeId, p_start_date: weekStart, p_num_weeks: Number(weeks)
      })
      if(res?.ok){
        const gaps = res.total_gaps||0
        setBanner({type: gaps>0?'warn':'ok',
          msg:`Drafted ${res.num_weeks} week(s): ${res.total_shifts_created} shifts created${gaps>0?`, ${gaps} gaps flagged (see week detail)`:''}.`})
        loadWeekShifts()
      } else setBanner({type:'err',msg:res?.error||'Draft failed'})
    }catch(e){ setBanner({type:'err',msg:e.message}) }
    setBusy(false)
  }

  function staffFor(slot){
    if(!avail) return {have:0,keys:0}
    // people already assigned this slot are not re-counted here (live shifts read separately)
    return { templates: avail.templates }
  }

  return (
    <div className="vip-sched">
      <h1 style={{marginBottom:6}}>Build Schedule</h1>
      <Legend/>

      <div className="row" style={{margin:'16px 0'}}>
        <select style={{width:220}} value={nodeId} onChange={e=>setNodeId(e.target.value)}>
          {nodes.map(n=>(
            <option key={n.id} value={n.id}>{n.name}</option>
          ))}
        </select>
        <div className="tabs" style={{margin:0}}>
          <div className={`tab ${view==='daily'?'active':''}`} onClick={()=>setView('daily')}>Daily</div>
          <div className={`tab ${view==='weekly'?'active':''}`} onClick={()=>setView('weekly')}>Weekly</div>
        </div>
        <div className="spacer"/>
        {view==='daily'
          ? <input type="date" style={{width:170}} value={date} onChange={e=>setDate(e.target.value)} />
          : <input type="date" style={{width:170}} value={weekStart} onChange={e=>setWeekStart(mondayOf(e.target.value))} />}
      </div>

      {banner && <div className={`banner ${banner.type}`}>{banner.msg}</div>}

      {/* AI multi-week draft bar */}
      <div className="card" style={{marginBottom:18}}>
        <div className="row">
          <b>✦ AI Draft</b>
          <span className="muted">Build</span>
          <select style={{width:90}} value={weeks} onChange={e=>setWeeks(e.target.value)}>
            {[1,2,3,4,6,8].map(w=><option key={w} value={w}>{w} wk</option>)}
          </select>
          <span className="muted">starting week of {weekStart}</span>
          <div className="spacer"/>
          <button className="btn" disabled={busy} onClick={draftWeeks}>{busy?'Drafting…':'✦ Draft Schedule'}</button>
        </div>
      </div>

      {view==='daily' && avail && (
        <>
          <div className="muted" style={{marginBottom:10}}>
            Close today: <b style={{color:'var(--t-muted)'}}>{avail.close_time}</b>
          </div>
          <div className="slots">
            {avail.templates.map(t=>(
              <div className="slot" key={t.slot}>
                <h3>{t.label}</h3>
                <div className="meta">
                  {t.start} – {t.ends_at_close ? 'close' : t.end} ·
                  need {t.staff_required} staff{t.keyholders_required>0?`, ${t.keyholders_required} keys`:''}
                </div>
                <button className="btn ghost sm" onClick={()=>setModal({slot:t.slot,template:t})}>+ Assign</button>
              </div>
            ))}
          </div>

          <div className="railbox">
            <h4>Available — {avail.date}</h4>
            {avail.staff.filter(s=>s.available && !s.time_off).map(s=>(
              <div className="person-row" key={s.person_id}>
                <div className="row">
                  <CodeBadge status={s.status}/>
                  <span>{s.full_name}</span>
                  <span className="muted">· {s.role}</span>
                </div>
                <span className="muted">
                  {s.keyholder_eligible?'key-eligible · ':''}reg {s.register_recent}×/14d
                </span>
              </div>
            ))}
            <h4>Off / Time-off</h4>
            {avail.staff.filter(s=>!s.available || s.time_off).map(s=>(
              <div className="person-row dim" key={s.person_id}>
                <div className="row"><CodeBadge status={s.status}/><span>{s.full_name}</span></div>
                <span className="muted">{s.time_off ? `${s.time_off.type} (${s.time_off.status})` : 'unavailable'}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {view==='weekly' && (
        <WeeklyGrid weekStart={weekStart} shifts={shifts} />
      )}

      {modal && (
        <AssignModal
          me={me} nodeId={nodeId} date={date} slot={modal.slot} template={modal.template}
          staff={avail.staff} zones={zones}
          onClose={()=>setModal(null)}
          onAssigned={(msg)=>{ setModal(null); setBanner({type:'ok',msg}); loadDaily() }}
          onError={(msg)=>setBanner({type:'err',msg})}
        />
      )}
    </div>
  )
}

function WeeklyGrid({ weekStart, shifts }){
  const days = [...Array(7)].map((_,i)=>{ const d=new Date(weekStart); d.setDate(d.getDate()+i); return d.toISOString().slice(0,10) })
  const byDay = {}; days.forEach(d=>byDay[d]=[])
  ;(shifts||[]).forEach(s=>{ const d=(s.shift_date||s.work_date||s.date||'').slice(0,10); if(byDay[d]) byDay[d].push(s) })
  const dow = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']
  return (
    <div className="weekgrid">
      {days.map((d,i)=>(
        <div className="daycol" key={d}>
          <h5>{dow[i]}<br/><span className="muted">{d.slice(5)}</span></h5>
          {byDay[d].length===0 && <div className="muted" style={{fontSize:11,textAlign:'center'}}>—</div>}
          {byDay[d].map((s,idx)=>(
            <div className={`dshift ${s.requires_key||s.requires_keyholder?'key':''}`} key={idx}>
              {(s.employee_name||s.full_name||'TBD')}<br/>
              <span className="muted">{(s.slot||'').toUpperCase()} {s.start_time||s.start||''}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

function AssignModal({ me, nodeId, date, slot, template, staff, zones, onClose, onAssigned, onError }){
  const [personId,setPersonId] = useState('')
  const [start,setStart] = useState(template.start||'')
  const [end,setEnd] = useState(template.ends_at_close?'':(template.end||''))
  const [endsAtClose,setEndsAtClose] = useState(!!template.ends_at_close)
  const [requiresKey,setRequiresKey] = useState((template.keyholders_required||0)>0)
  const [pickedZones,setPickedZones] = useState([])
  const [breakStart,setBreakStart] = useState('')
  const [breakEnd,setBreakEnd] = useState('')
  const [busy,setBusy] = useState(false)

  // when key required, only show key-eligible people
  const eligible = staff.filter(s=>s.available && !s.time_off && (!requiresKey || s.keyholder_eligible))

  function toggleZone(z){
    setPickedZones(p=> p.includes(z.zone_key) ? p.filter(k=>k!==z.zone_key) : [...p,z.zone_key])
  }

  async function save(){
    if(!personId){ onError('Pick a person'); return }
    setBusy(true)
    try{
      await rpc('schedule_assign',{
        p_actor: me.id, p_node_id: nodeId, p_person_id: personId, p_date: date,
        p_slot: slot, p_start: start || null, p_end: endsAtClose? null : (end||null),
        p_ends_at_close: endsAtClose, p_zones: pickedZones.length?pickedZones:null,
        p_break_start: breakStart||null, p_break_end: breakEnd||null,
        p_requires_key: requiresKey, p_schedule_id: null
      })
      // multi-zone coverage record if >1 zone
      if(pickedZones.length>1){
        await rpc('assign_zone_coverage',{
          p_actor: me.id, p_node_id: nodeId, p_person_id: personId, p_date: date,
          p_zone_keys: pickedZones, p_slot: slot, p_short_staff: true
        })
      }
      const who = staff.find(s=>s.person_id===personId)?.full_name || 'Staff'
      onAssigned(`${who} assigned to ${slot}${pickedZones.length?` · zones: ${pickedZones.join(', ')}`:''}.`)
    }catch(e){ onError(e.message); setBusy(false) }
  }

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="card modal" onClick={e=>e.stopPropagation()}>
        <h3 style={{marginTop:0,textTransform:'capitalize'}}>Assign · {slot}</h3>

        <label className="fld">Person {requiresKey && <span style={{color:'var(--t-warn)'}}>(key-eligible only)</span>}</label>
        <select value={personId} onChange={e=>setPersonId(e.target.value)}>
          <option value="">Select…</option>
          {eligible.map(s=>(
            <option key={s.person_id} value={s.person_id}>
              {s.full_name} · {s.status?.code} · {s.role}
            </option>
          ))}
        </select>

        <div className="row" style={{gap:12}}>
          <div style={{flex:1}}>
            <label className="fld">Start</label>
            <input type="time" value={start} onChange={e=>setStart(e.target.value)} />
          </div>
          <div style={{flex:1}}>
            <label className="fld">End</label>
            <input type="time" value={end} disabled={endsAtClose} onChange={e=>setEnd(e.target.value)} />
          </div>
        </div>
        <label className="row" style={{marginTop:8,gap:8}}>
          <input type="checkbox" style={{width:'auto'}} checked={endsAtClose} onChange={e=>setEndsAtClose(e.target.checked)} />
          <span className="muted">Ends at close</span>
        </label>

        <label className="fld">Zones {pickedZones.length>1 && <span style={{color:'var(--t-accent)'}}>· multi-zone coverage</span>}</label>
        <div className="zone-pick">
          {zones.map(z=>(
            <div key={z.zone_key}
              className={`z ${z.is_register?'reg':''} ${pickedZones.includes(z.zone_key)?'on':''}`}
              onClick={()=>toggleZone(z)}>
              {z.label}{z.is_register?' ★':''}
            </div>
          ))}
          {zones.length===0 && <span className="muted">No zones defined — add them in Zones &amp; Settings.</span>}
        </div>
        {requiresKey && pickedZones.some(k=>zones.find(z=>z.zone_key===k && z.is_register)) &&
          <div className="banner warn" style={{marginTop:10}}>Keyholder on a register zone — keys should be on the floor driving sales.</div>}

        <div className="row" style={{gap:12}}>
          <div style={{flex:1}}>
            <label className="fld">Break start</label>
            <input type="time" value={breakStart} onChange={e=>setBreakStart(e.target.value)} />
          </div>
          <div style={{flex:1}}>
            <label className="fld">Break end</label>
            <input type="time" value={breakEnd} onChange={e=>setBreakEnd(e.target.value)} />
          </div>
        </div>

        <div className="row" style={{marginTop:18}}>
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <div className="spacer"/>
          <button className="btn" disabled={busy} onClick={save}>{busy?'Saving…':'Assign'}</button>
        </div>
      </div>
    </div>
  )
}
