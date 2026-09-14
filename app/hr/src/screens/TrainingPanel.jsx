import { useEffect, useState } from 'react'
import { rpc, getSession } from '../lib/supabase'
const HARTFORD='63ec69c7-297b-4c7b-9cd7-c9ffc168ae97'

export default function TrainingPanel(){
  const me = getSession()
  const nodes = (me.nodes||[]).filter(n=>n.node_type==='location')
  const [nodeId,setNodeId] = useState(nodes[0]?.id || HARTFORD)
  const [date,setDate] = useState(new Date().toISOString().slice(0,10))
  const [avail,setAvail] = useState(null)
  const [sessions,setSessions] = useState([])
  const [banner,setBanner] = useState(null)
  const [form,setForm] = useState({trainee:'',competency:'register',trainer:'',slot:'mid'})
  const comps = [['register','Register'],['open','Open'],['close','Close']]

  async function load(){
    try{
      const [a,t] = await Promise.all([
        rpc('schedule_availability',{p_person_id:me.id,p_node_id:nodeId,p_date:date}),
        rpc('training_for_day',{p_person_id:me.id,p_node_id:nodeId,p_date:date})
      ])
      setAvail(a); setSessions(t?.sessions||[])
    }catch(e){ setBanner({type:'err',msg:e.message}) }
  }
  useEffect(()=>{ load() },[nodeId,date])

  async function assign(){
    if(!form.trainee||!form.trainer){ setBanner({type:'err',msg:'Pick trainee and trainer'}); return }
    try{
      await rpc('assign_training',{
        p_actor:me.id,p_node_id:nodeId,p_trainee:form.trainee,p_competency:form.competency,
        p_train_date:date,p_trainer:form.trainer,p_slot:form.slot,p_shift_id:null,p_notes:null
      })
      setBanner({type:'ok',msg:'Training assigned.'}); setForm({...form,trainee:''}); load()
    }catch(e){ setBanner({type:'err',msg:e.message}) }
  }

  const people = avail?.staff || []
  return (
    <div className="vip-sched">
      <h1 style={{marginBottom:6}}>Training</h1>
      <div className="row" style={{margin:'14px 0'}}>
        <select style={{width:220}} value={nodeId} onChange={e=>setNodeId(e.target.value)}>
          {(nodes.length?nodes:[{id:HARTFORD,name:'Hartford'}]).map(n=>(<option key={n.id} value={n.id}>{n.name}</option>))}
        </select>
        <div className="spacer"/>
        <input type="date" style={{width:170}} value={date} onChange={e=>setDate(e.target.value)} />
      </div>

      {banner && <div className={`banner ${banner.type}`}>{banner.msg}</div>}

      <div className="grid g2">
        <div className="card">
          <h3 style={{marginTop:0}}>Assign training</h3>
          <label className="fld">Trainee</label>
          <select value={form.trainee} onChange={e=>setForm({...form,trainee:e.target.value})}>
            <option value="">Select…</option>
            {people.map(p=><option key={p.person_id} value={p.person_id}>{p.full_name} · {p.status?.code}</option>)}
          </select>
          <label className="fld">Competency</label>
          <select value={form.competency} onChange={e=>setForm({...form,competency:e.target.value})}>
            {comps.map(([k,l])=><option key={k} value={k}>{l}</option>)}
          </select>
          <label className="fld">Trainer</label>
          <select value={form.trainer} onChange={e=>setForm({...form,trainer:e.target.value})}>
            <option value="">Select…</option>
            {people.filter(p=>p.status?.color==='green').map(p=><option key={p.person_id} value={p.person_id}>{p.full_name} · {p.status?.code}</option>)}
          </select>
          <label className="fld">Slot</label>
          <select value={form.slot} onChange={e=>setForm({...form,slot:e.target.value})}>
            {['open','mid','close'].map(s=><option key={s} value={s}>{s}</option>)}
          </select>
          <button className="btn" style={{marginTop:16}} onClick={assign}>Assign training</button>
        </div>

        <div className="card">
          <h3 style={{marginTop:0}}>Sessions on {date}</h3>
          {sessions.length===0 && <div className="muted">No training scheduled.</div>}
          {sessions.map((s,i)=>(
            <div className="person-row" key={i}>
              <div>
                <b>{s.trainee}</b> <span className="muted">← {s.trainer}</span><br/>
                <span className="muted">{s.competency} · {s.slot} · {s.status}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
