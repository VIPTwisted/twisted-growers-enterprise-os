import { useEffect, useState } from 'react'
import { rpc, getSession } from '../lib/supabase'


export default function ZoneSettings(){
  const me = getSession()
  const nodes = (me.nodes||[]).filter(n=>n.node_type==='location')
  const [nodeId,setNodeId] = useState(nodes[0]?.id || null)
  const [zones,setZones] = useState([])
  const [banner,setBanner] = useState(null)
  const [form,setForm] = useState({label:'',is_register:false,requires_keyholder:false})

  async function load(){
    try{ const z = await rpc('zones_for_node',{p_person_id:me.id,p_node_id:nodeId}); setZones(z?.zones||[]) }
    catch(e){ setBanner({type:'err',msg:e.message}) }
  }
  useEffect(()=>{ load() },[nodeId])

  async function add(){
    if(!form.label.trim()){ setBanner({type:'err',msg:'Zone needs a name'}); return }
    const key = form.label.toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'')
    try{
      await rpc('upsert_zone',{
        p_actor:me.id,p_node_id:nodeId,p_zone_key:key,p_label:form.label.trim(),
        p_is_register:form.is_register,p_requires_keyholder:form.requires_keyholder,
        p_sort_order:(zones.length+1)
      })
      setForm({label:'',is_register:false,requires_keyholder:false})
      setBanner({type:'ok',msg:`Zone "${form.label}" saved.`}); load()
    }catch(e){ setBanner({type:'err',msg:e.message}) }
  }

  async function remove(z){
    try{ await rpc('deactivate_zone',{p_actor:me.id,p_node_id:nodeId,p_zone_key:z.zone_key})
      setBanner({type:'ok',msg:`Removed ${z.label}.`}); load() }
    catch(e){ setBanner({type:'err',msg:e.message}) }
  }

  return (
    <div className="vip-sched">
      <h1 style={{marginBottom:6}}>Zones &amp; Settings</h1>
      <p className="muted" style={{marginTop:0}}>Each location builds its own zones. Register zones rotate staff and flag keyholders.</p>

      <div className="row" style={{margin:'14px 0'}}>
        <select style={{width:240}} value={nodeId} onChange={e=>setNodeId(e.target.value)}>
          {nodes.map(n=>(
            <option key={n.id} value={n.id}>{n.name}</option>
          ))}
        </select>
      </div>

      {banner && <div className={`banner ${banner.type}`}>{banner.msg}</div>}

      <div className="grid g2">
        <div className="card">
          <h3 style={{marginTop:0}}>Current zones</h3>
          {zones.length===0 && <div className="muted">No zones yet — add one →</div>}
          {zones.map(z=>(
            <div className="person-row" key={z.zone_key}>
              <div className="row">
                <span>{z.label}</span>
                {z.is_register && <span className="code amber" title="Register zone">★ register</span>}
                {z.requires_keyholder && <span className="muted">· key req</span>}
              </div>
              <button className="btn ghost sm" onClick={()=>remove(z)}>Remove</button>
            </div>
          ))}
        </div>

        <div className="card">
          <h3 style={{marginTop:0}}>Add a zone</h3>
          <label className="fld">Zone name</label>
          <input value={form.label} onChange={e=>setForm({...form,label:e.target.value})}
            placeholder="e.g. Lingerie, Toys, Register" onKeyDown={e=>e.key==='Enter'&&add()} />
          <label className="row" style={{marginTop:10,gap:8}}>
            <input type="checkbox" style={{width:'auto'}} checked={form.is_register}
              onChange={e=>setForm({...form,is_register:e.target.checked})} />
            <span className="muted">This is a register zone (rotation + keyholder flag)</span>
          </label>
          <label className="row" style={{marginTop:8,gap:8}}>
            <input type="checkbox" style={{width:'auto'}} checked={form.requires_keyholder}
              onChange={e=>setForm({...form,requires_keyholder:e.target.checked})} />
            <span className="muted">Requires a keyholder</span>
          </label>
          <button className="btn" style={{marginTop:16}} onClick={add}>+ Add zone</button>
        </div>
      </div>
    </div>
  )
}
