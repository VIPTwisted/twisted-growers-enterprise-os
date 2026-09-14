import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { sb } from '../lib/supabase'
import { useAuth } from '../lib/auth.jsx'
import { useScope } from '../lib/scope.jsx'
import { useNavigate } from 'react-router-dom'
import { useFeatureFlag } from '../lib/featureFlags.js'
import DrillDown from '../components/DrillDown.jsx'

const isHR = r => ['ceo','hr','manager','coo','admin','owner'].some(x=>(r||'').toLowerCase().includes(x))
const todayISO = () => new Date().toISOString().slice(0,10)

const PRIORITIES = ['Low','Medium','High','Urgent']
const CATEGORIES = ['Opening Duties','Closing Duties','Cleaning','Inventory','Training','Customer Service','Administrative','Safety','Zone Coverage','Other']

// ── Task/status normalization (live rows → the vocabulary this UI renders) ────
const DONE = s => ['complete','completed','done','closed','finished'].includes((s||'').toLowerCase().trim())
const PRIO_MAP = { low:'Low', medium:'Medium', normal:'Medium', high:'High', urgent:'Urgent' }
const capPrio = p => PRIO_MAP[(p||'').toLowerCase().trim()] || 'Medium'
// UI status → DB status the update_task_status RPC expects.
const toDbStatus = s => s === 'complete' ? 'completed' : s

function deriveStatus(row) {
  const s = (row.status || '').toLowerCase().trim()
  if (DONE(s)) return 'complete'
  if (['in_progress','in progress','doing','active','started','wip'].includes(s)) return 'in_progress'
  if (row.due_date && new Date(row.due_date) < new Date(todayISO())) return 'overdue'
  return 'pending'
}

// ── Task → message the assignee (real, via add_comment / get_comments) ────────
const MSG_PRESETS = [
  { label: '🎉 Great job!', text: 'Great job on this — thank you!', kind: 'praise' },
  { label: '⏰ Do this now', text: 'Please prioritize this and do it now.', kind: 'urgent' },
  { label: '✏️ Needs revision', text: 'This needs a revision — please review and fix.', kind: 'revise' },
  { label: '💬 Comment', text: '', kind: 'comment' },
]
const kindColor = k => k === 'praise' ? 'var(--t-success)' : k === 'urgent' ? 'var(--t-danger)' : k === 'revise' ? 'var(--t-warn)' : 'var(--t-accent)'
const parseKind = body => {
  const m = /^\[(praise|urgent|revise|comment)\]\s*/i.exec(body || '')
  return m ? { kind: m[1].toLowerCase(), body: body.slice(m[0].length) } : { kind: 'comment', body: body || '' }
}

function TaskMessage({ task, personId, canManage }) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [msgs, setMsgs] = useState([])
  const [loading, setLoading] = useState(false)
  const [toast, setToast] = useState('')

  const load = useCallback(async () => {
    if (!task?.id) return
    setLoading(true)
    try {
      const { data } = await sb.rpc('get_comments', { p_entity_type: 'task', p_entity_id: task.id })
      setMsgs(Array.isArray(data) ? data : [])
    } catch { setMsgs([]) } finally { setLoading(false) }
  }, [task?.id])

  useEffect(() => { if (open) load() }, [open, load])

  const send = async (body, kind = 'comment') => {
    const b = (body ?? text).trim()
    if (!b) return
    const prefix = kind !== 'comment' ? `[${kind}] ` : ''
    try {
      const { data, error } = await sb.rpc('add_comment', { p_entity_type: 'task', p_entity_id: task.id, p_author_id: personId, p_body: prefix + b })
      if (error || !data?.ok) throw new Error('failed')
      setText('')
      load()
      setToast(`Sent to ${(task.assigned_to_name || 'employee').split(' ')[0]}`)
      setTimeout(() => setToast(''), 2200)
    } catch {
      setToast('Not sent — try again')
      setTimeout(() => setToast(''), 2200)
    }
  }

  const firstName = (task.assigned_to_name || 'employee').split(' ')[0]

  return (
    <div style={{ marginTop: 12, borderTop: '1px solid var(--t-line)', paddingTop: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--t-text-muted)' }}>💬 MESSAGE {(task.assigned_to_name || '').toUpperCase()}{msgs.length ? ` · ${msgs.length}` : ''}</span>
        <button onClick={() => setOpen(o => !o)} style={{ fontSize: 11, fontWeight: 700, padding: '5px 12px', background: open ? 'var(--t-surface)' : 'var(--t-accent)', color: open ? 'var(--t-text-muted)' : '#04121a', border: open ? '1px solid var(--t-line)' : 'none', cursor: 'pointer' }}>{open ? 'Close' : `Message ${firstName}`}</button>
      </div>

      {open && (
        <div style={{ marginTop: 10 }}>
          {canManage && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
              {MSG_PRESETS.map(p => (
                <button key={p.label} onClick={() => p.kind === 'comment' ? null : send(p.text, p.kind)}
                  style={{ fontSize: 11, fontWeight: 600, padding: '5px 10px', background: 'var(--t-surface-2)', border: '1px solid var(--t-line)', color: 'var(--t-text)', cursor: 'pointer' }}>{p.label}</button>
              ))}
            </div>
          )}
          <div style={{ display: 'flex', gap: 6 }}>
            <input value={text} onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') send() }}
              placeholder={`Message ${firstName} about this task…`}
              style={{ flex: 1, background: 'var(--t-surface-2)', border: '1px solid var(--t-line)', color: 'var(--t-text)', padding: '8px 10px', fontSize: 12, outline: 'none' }} />
            <button onClick={() => send()} disabled={!text.trim()} style={{ fontSize: 12, fontWeight: 700, padding: '0 16px', background: text.trim() ? 'var(--t-accent)' : 'var(--t-surface-2)', color: text.trim() ? '#04121a' : 'var(--t-text-faint)', border: 'none', cursor: text.trim() ? 'pointer' : 'not-allowed' }}>Send</button>
          </div>
          {loading ? (
            <div style={{ marginTop: 10, fontSize: 12, color: 'var(--t-accent)' }}>Loading…</div>
          ) : msgs.length > 0 ? (
            <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 180, overflowY: 'auto' }}>
              {msgs.map(m => {
                const parsed = parseKind(m.body)
                return (
                  <div key={m.id} style={{ fontSize: 12, background: 'var(--t-surface)', border: '1px solid var(--t-line)', borderLeft: `3px solid ${kindColor(parsed.kind)}`, padding: '7px 10px' }}>
                    <div style={{ color: 'var(--t-text)' }}>{parsed.body}</div>
                    <div style={{ fontSize: 10, color: 'var(--t-text-faint)', marginTop: 3 }}>{m.author_name || 'Someone'} · {m.created_at ? new Date(m.created_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''}</div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div style={{ marginTop: 10, fontSize: 11, color: 'var(--t-text-faint)' }}>No messages yet.</div>
          )}
        </div>
      )}
      {toast && <div style={{ position: 'fixed', bottom: 24, right: 24, background: 'var(--t-success)', color: '#000', padding: '10px 16px', fontSize: 12, fontWeight: 700, zIndex: 9999 }}>{toast}</div>}
    </div>
  )
}

// ── CHECKLIST TEMPLATES (form definitions, not data records) ──────────────────
const CHECKLISTS = {
  AM: [
    { id:'am_1', text:'Count register drawers' },
    { id:'am_2', text:'Verify safe balance' },
    { id:'am_3', text:'Sign in all present staff' },
    { id:'am_4', text:'Check and restock restrooms' },
    { id:'am_5', text:'Vacuum/sweep sales floor' },
    { id:'am_6', text:'Wipe down display cases and glass' },
    { id:'am_7', text:'Check inventory levels on featured products' },
    { id:'am_8', text:'Verify security cameras operational' },
    { id:'am_9', text:'Set daily sales goal on whiteboard' },
    { id:'am_10', text:'Review manager notes from prior shift' },
  ],
  PM: [
    { id:'pm_1', text:'Conduct mid-day register count' },
    { id:'pm_2', text:'Restock shelves depleted since opening' },
    { id:'pm_3', text:'Clean restrooms (midday check)' },
    { id:'pm_4', text:'Review void/return log' },
    { id:'pm_5', text:'Check break room cleanliness' },
    { id:'pm_6', text:'Verify all staff clocked in correctly' },
    { id:'pm_7', text:'Update display cases if needed' },
    { id:'pm_8', text:'Review any pending customer issues' },
  ],
  Closing: [
    { id:'cl_1', text:'Final register count + drawer drop' },
    { id:'cl_2', text:'Reconcile cash with POS total' },
    { id:'cl_3', text:'Lock all display cases' },
    { id:'cl_4', text:'Set alarm system' },
    { id:'cl_5', text:'Take out trash' },
    { id:'cl_6', text:'Mop restrooms and back room' },
    { id:'cl_7', text:'Final security camera check' },
    { id:'cl_8', text:'Sign out all staff' },
    { id:'cl_9', text:'Write end-of-shift manager notes' },
    { id:'cl_10', text:'Lock all doors + exterior check' },
  ],
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

function PriorityBadge({p}) {
  const color = p==='Urgent'?'red':p==='High'?'amber':p==='Medium'?'blue':'green'
  return <span className={`badge ${color}`} style={{fontSize:9}}>{p}</span>
}

function StatusBadge({s}) {
  const c = s==='complete'?'green':s==='overdue'?'red':s==='in_progress'?'blue':'amber'
  const l = s==='in_progress'?'In Progress':s.charAt(0).toUpperCase()+s.slice(1)
  return <span className={`badge ${c}`} style={{fontSize:9}}>{l}</span>
}

// ── IMAGE UPLOADER ────────────────────────────────────────────────────────────
function ImageUploader({ value, onChange, label = 'Attach Photo Evidence' }) {
  const ref = useRef(null)
  const handleFile = (e) => {
    const file = e.target.files[0]
    if (!file) return
    if (file.size > 3 * 1024 * 1024) { alert('Max 3MB'); return }
    const reader = new FileReader()
    reader.onload = ev => onChange(ev.target.result)
    reader.readAsDataURL(file)
  }
  return (
    <div style={{ marginTop: 8 }}>
      <input ref={ref} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFile} />
      {value
        ? <div style={{ position: 'relative', display: 'inline-block' }}>
            <img src={value} alt="evidence" style={{ maxWidth: '100%', maxHeight: 180, borderRadius: 0, border: '1px solid var(--t-line)', display: 'block' }} />
            <button onClick={() => onChange(null)} style={{ position: 'absolute', top: 4, right: 4, background: 'var(--t-danger)', color: '#fff', border: 'none', borderRadius: 0, padding: '2px 6px', cursor: 'pointer', fontSize: 11 }}>✕ Remove</button>
          </div>
        : <button onClick={() => ref.current.click()} style={{ background: 'var(--t-surface-2)', border: '1px dashed var(--t-line)', color: 'var(--t-text-muted)', padding: '8px 16px', borderRadius: 0, cursor: 'pointer', fontSize: 12, width: '100%' }}>
            📷 {label}
          </button>
      }
    </div>
  )
}

// ── PROJECTS TAB (live task_projects backend) ─────────────────────────────────
function ProjectsTab({ locationIds, locations, roster, personId, canManage }) {
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [projectFilter, setProjectFilter] = useState(null)
  const [projTasks, setProjTasks] = useState([])
  const [toast, setToast] = useState(null)
  const [saving, setSaving] = useState(false)
  const [newProj, setNewProj] = useState({ name:'', description:'', node_id:'', owner:'', priority:'normal', dueDate:'' })

  const nodeKey = (locationIds || []).join(',')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await sb.rpc('get_task_projects', { p_node_ids: locationIds })
      setProjects(Array.isArray(data) ? data : [])
    } catch { setProjects([]) } finally { setLoading(false) }
  }, [nodeKey]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load() }, [load])

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 2500) }

  const openProjectTasks = async (projId) => {
    if (projectFilter === projId) { setProjectFilter(null); setProjTasks([]); return }
    setProjectFilter(projId)
    try {
      const { data } = await sb.rpc('get_project_tasks', { p_project_id: projId })
      setProjTasks(Array.isArray(data) ? data : [])
    } catch { setProjTasks([]) }
  }

  const progressColor = (pct) => pct >= 100 ? 'var(--t-success)' : pct > 50 ? 'var(--t-warn)' : 'var(--t-danger)'
  const statusColor = (s) => s === 'active' ? 'var(--t-accent)' : s === 'review' ? 'var(--t-warn)' : 'var(--t-success)'
  const statusLabel = (s) => s === 'active' ? 'Active' : s === 'review' ? 'In Review' : 'Complete'

  const today = todayISO()
  const dueDateColor = (d) => {
    if (!d) return 'var(--t-text-muted)'
    if (d < today) return 'var(--t-danger)'
    const diff = (new Date(d) - new Date(today)) / 86400000
    if (diff <= 7) return 'var(--t-warn)'
    return 'var(--t-text-muted)'
  }

  const submitProject = async () => {
    if (!newProj.name.trim() || saving) return
    setSaving(true)
    try {
      const { data, error } = await sb.rpc('create_task_project', {
        p_node_id: newProj.node_id || null,
        p_name: newProj.name.trim(),
        p_description: newProj.description || null,
        p_owner_name: newProj.owner || null,
        p_priority: newProj.priority,
        p_due_date: newProj.dueDate || null,
        p_created_by: personId || null,
      })
      if (error || !data?.ok) throw new Error(data?.error || 'failed')
      setShowCreate(false)
      setNewProj({ name:'', description:'', node_id:'', owner:'', priority:'normal', dueDate:'' })
      showToast('Project created')
      load()
    } catch (e) { showToast('Could not create project') } finally { setSaving(false) }
  }

  const progressOf = (proj) => proj.task_count > 0 ? Math.round((proj.done_count / proj.task_count) * 100) : 0

  return (
    <div>
      {toast && (
        <div style={{ position:'fixed', top:20, right:20, background:'var(--t-success)', color:'#000', padding:'10px 20px', fontWeight:700, fontSize:13, zIndex:9999, border:'none', borderRadius:0 }}>{toast}</div>
      )}

      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
        <div style={{ fontSize:12, color:'var(--t-text-muted)' }}>{loading ? 'Loading…' : `${projects.length} projects`}</div>
        {canManage && (
          <button onClick={() => setShowCreate(!showCreate)} style={{ background:'var(--t-accent)', color:'#000', border:'none', padding:'7px 16px', fontSize:12, fontWeight:700, cursor:'pointer', borderRadius:0 }}>+ Create Project</button>
        )}
      </div>

      {showCreate && canManage && (
        <div style={{ background:'var(--t-surface)', border:'1px solid var(--t-line)', padding:'20px', marginBottom:20 }}>
          <div style={{ fontSize:11, fontWeight:700, color:'var(--t-accent)', letterSpacing:'.1em', textTransform:'uppercase', marginBottom:14 }}>NEW PROJECT</div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
            {[
              { label:'NAME', el:<input value={newProj.name} onChange={e=>setNewProj(p=>({...p,name:e.target.value}))} placeholder="Project name…" style={{ width:'100%', background:'var(--t-surface-2)', border:'1px solid var(--t-line)', color:'var(--t-text)', padding:'7px 10px', fontSize:12, outline:'none', boxSizing:'border-box', borderRadius:0 }}/> },
              { label:'LOCATION', el:<select value={newProj.node_id} onChange={e=>setNewProj(p=>({...p,node_id:e.target.value}))} style={{ width:'100%', background:'var(--t-surface-2)', border:'1px solid var(--t-line)', color:'var(--t-text)', padding:'7px 10px', fontSize:12, borderRadius:0 }}><option value="">All Locations</option>{locations.map(l=><option key={l.id} value={l.id}>{l.name}</option>)}</select> },
              { label:'OWNER', el:<select value={newProj.owner} onChange={e=>setNewProj(p=>({...p,owner:e.target.value}))} style={{ width:'100%', background:'var(--t-surface-2)', border:'1px solid var(--t-line)', color:'var(--t-text)', padding:'7px 10px', fontSize:12, borderRadius:0 }}><option value="">— Select owner —</option>{roster.map(r=><option key={r.id} value={r.full_name}>{r.full_name}</option>)}</select> },
              { label:'PRIORITY', el:<select value={newProj.priority} onChange={e=>setNewProj(p=>({...p,priority:e.target.value}))} style={{ width:'100%', background:'var(--t-surface-2)', border:'1px solid var(--t-line)', color:'var(--t-text)', padding:'7px 10px', fontSize:12, borderRadius:0 }}>{['normal','high','urgent'].map(pr=><option key={pr} value={pr}>{pr.charAt(0).toUpperCase()+pr.slice(1)}</option>)}</select> },
              { label:'DUE DATE', el:<input type="date" value={newProj.dueDate} onChange={e=>setNewProj(p=>({...p,dueDate:e.target.value}))} style={{ width:'100%', background:'var(--t-surface-2)', border:'1px solid var(--t-line)', color:'var(--t-text)', padding:'7px 10px', fontSize:12, outline:'none', boxSizing:'border-box', borderRadius:0 }}/> },
            ].map(({label,el})=>(
              <div key={label}>
                <div style={{ fontSize:10, color:'var(--t-text-muted)', marginBottom:4, fontWeight:700 }}>{label}</div>
                {el}
              </div>
            ))}
            <div style={{ gridColumn:'1/-1' }}>
              <div style={{ fontSize:10, color:'var(--t-text-muted)', marginBottom:4, fontWeight:700 }}>DESCRIPTION</div>
              <textarea value={newProj.description} onChange={e=>setNewProj(p=>({...p,description:e.target.value}))} placeholder="Project description…" style={{ width:'100%', background:'var(--t-surface-2)', border:'1px solid var(--t-line)', color:'var(--t-text)', padding:'7px 10px', fontSize:12, resize:'vertical', minHeight:60, outline:'none', boxSizing:'border-box', borderRadius:0, fontFamily:'inherit' }}/>
            </div>
          </div>
          <div style={{ display:'flex', gap:8, marginTop:12 }}>
            <button onClick={() => setShowCreate(false)} style={{ background:'transparent', border:'1px solid var(--t-line)', color:'var(--t-text-muted)', padding:'8px 16px', fontSize:12, cursor:'pointer', borderRadius:0 }}>Cancel</button>
            <button onClick={submitProject} disabled={saving} style={{ background:'var(--t-accent)', color:'#000', border:'none', padding:'8px 20px', fontSize:12, fontWeight:700, cursor:saving?'not-allowed':'pointer', borderRadius:0, opacity:saving?0.6:1 }}>{saving?'Saving…':'Save Project'}</button>
          </div>
        </div>
      )}

      {!loading && projects.length === 0 && (
        <div style={{ textAlign:'center', padding:'40px', color:'var(--t-text-muted)', fontSize:13, border:'1px dashed var(--t-line)' }}>
          No projects yet.{canManage ? ' Create one to group and track related tasks.' : ''}
        </div>
      )}

      {projects.map(proj => {
        const pct = progressOf(proj)
        return (
          <div key={proj.id} style={{ display:'flex', marginBottom:10, background:'var(--t-surface)', border:'1px solid var(--t-line)', overflow:'hidden' }}>
            <div style={{ width:4, flexShrink:0, background:statusColor(proj.status) }}/>
            <div style={{ flex:1, padding:'14px 16px' }}>
              <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:12, flexWrap:'wrap' }}>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap', marginBottom:4 }}>
                    <span style={{ fontSize:14, fontWeight:800, color:'var(--t-text)' }}>{proj.name}</span>
                    <span className="badge blue" style={{ fontSize:9 }}>{proj.node_name || 'All Locations'}</span>
                    {proj.owner_name && <span className="badge amber" style={{ fontSize:9 }}>By {proj.owner_name}</span>}
                    {proj.priority === 'urgent' && <span className="badge red" style={{ fontSize:9 }}>Urgent</span>}
                    {proj.priority === 'high' && <span className="badge amber" style={{ fontSize:9 }}>High</span>}
                    <span className="badge green" style={{ fontSize:9 }}>{statusLabel(proj.status)}</span>
                  </div>
                  {proj.description && <div style={{ fontSize:12, color:'var(--t-text-muted)', marginBottom:10 }}>{proj.description}</div>}

                  <div style={{ marginBottom:8 }}>
                    <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
                      <span style={{ fontSize:11, color: progressColor(pct), fontWeight:700 }}>{pct}% complete</span>
                      <span style={{ fontSize:11, color:'var(--t-text-muted)' }}>{proj.task_count} tasks</span>
                    </div>
                    <div style={{ height:6, background:'var(--t-line)', position:'relative', overflow:'hidden' }}>
                      <div style={{ position:'absolute', left:0, top:0, bottom:0, width:`${pct}%`, background: progressColor(pct), transition:'width .3s' }}/>
                    </div>
                  </div>

                  {proj.due_date && (
                    <div style={{ display:'flex', gap:12, alignItems:'center', flexWrap:'wrap' }}>
                      <span style={{ fontSize:11, color: dueDateColor(proj.due_date), fontWeight:600 }}>Due {proj.due_date}</span>
                    </div>
                  )}
                </div>

                <div style={{ display:'flex', gap:6, flexShrink:0, alignItems:'flex-start' }}>
                  <button onClick={() => openProjectTasks(proj.id)} style={{ background: projectFilter === proj.id ? 'var(--t-accent)' : 'transparent', color: projectFilter === proj.id ? '#000' : 'var(--t-text-muted)', border:'1px solid var(--t-line)', padding:'5px 10px', fontSize:11, cursor:'pointer', fontWeight:600, borderRadius:0 }}>
                    {projectFilter === proj.id ? 'Hide Tasks' : 'View Tasks'}
                  </button>
                </div>
              </div>

              {projectFilter === proj.id && (
                <div style={{ marginTop:12, borderTop:'1px solid var(--t-line)', paddingTop:12 }}>
                  {projTasks.length === 0 ? (
                    <div style={{ color:'var(--t-text-muted)', fontSize:12 }}>No tasks linked to this project yet.</div>
                  ) : projTasks.map(t => (
                    <div key={t.id} style={{ background:'var(--t-surface-2)', border:'1px solid var(--t-line)', padding:'10px 14px', marginBottom:6, display:'flex', alignItems:'center', gap:10 }}>
                      <StatusBadge s={deriveStatus(t)}/>
                      <span style={{ fontSize:12, fontWeight:600, color:'var(--t-text)', flex:1 }}>{t.title}</span>
                      <span style={{ fontSize:11, color:'var(--t-text-muted)' }}>{t.assignee_name || '—'}</span>
                      <PriorityBadge p={capPrio(t.priority)}/>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── DAILY CHECKLISTS TAB (live shift_checklist_runs backend) ──────────────────
function ChecklistsTab({ canManage, locations, personId, myName }) {
  const [shift, setShift] = useState('AM')
  const [nodeId, setNodeId] = useState(locations[0]?.id || '')
  const [run, setRun] = useState(null)
  const [loading, setLoading] = useState(false)
  const [expandedNotes, setExpandedNotes] = useState({})

  const dateStr = todayISO()
  const currentLoc = locations.find(l => l.id === nodeId)

  useEffect(() => { if (!nodeId && locations[0]) setNodeId(locations[0].id) }, [locations, nodeId])

  const load = useCallback(async () => {
    if (!nodeId) { setRun(null); return }
    setLoading(true)
    try {
      const { data } = await sb.rpc('get_shift_checklist', { p_node_id: nodeId, p_shift: shift, p_date: dateStr })
      setRun(data || { items:{}, signed_off:false })
    } catch { setRun({ items:{}, signed_off:false }) } finally { setLoading(false) }
  }, [nodeId, shift, dateStr])

  useEffect(() => { load() }, [load])

  const items = CHECKLISTS[shift] || []
  const state = run?.items || {}
  const signedOff = !!run?.signed_off
  const checkedCount = items.filter(it => state[it.id]?.checked).length
  const allChecked = items.length > 0 && checkedCount === items.length
  const progressPct = items.length > 0 ? Math.round(checkedCount / items.length * 100) : 0

  const persistItem = async (itemId, patch) => {
    if (signedOff || !nodeId) return
    // optimistic
    setRun(r => ({ ...r, items: { ...(r?.items||{}), [itemId]: { ...(r?.items?.[itemId]||{}), ...patch } } }))
    try {
      await sb.rpc('set_shift_checklist_item', {
        p_node_id: nodeId, p_shift: shift, p_date: dateStr, p_item_id: itemId,
        p_checked: patch.checked ?? null, p_note: patch.note ?? null, p_photo: patch.photo ?? null,
        p_actor_name: myName, p_actor_id: personId || null,
      })
    } catch { load() }
  }

  const toggleItem = (itemId) => { if (signedOff) return; persistItem(itemId, { checked: !state[itemId]?.checked }) }
  const updateNote = (itemId, note) => persistItem(itemId, { note })
  const updateItemPhoto = (itemId, b64) => persistItem(itemId, { photo: b64 })

  const signOff = async () => {
    if (!allChecked || !nodeId) return
    try {
      await sb.rpc('sign_off_shift_checklist', { p_node_id: nodeId, p_shift: shift, p_date: dateStr, p_signed_by: myName, p_signed_by_id: personId || null })
      load()
    } catch { /* honest: reload reflects server truth */ }
  }

  const shiftLabel = { AM:'AM Shift', PM:'PM Shift', Closing:'Closing' }
  const statusText = signedOff ? 'SIGNED OFF' : allChecked ? 'COMPLETE' : 'IN PROGRESS'
  const statusColor = signedOff ? 'var(--t-success)' : allChecked ? 'var(--t-success)' : 'var(--t-warn)'

  if (locations.length === 0) {
    return <div style={{ textAlign:'center', padding:'40px', color:'var(--t-text-muted)', fontSize:13, border:'1px dashed var(--t-line)' }}>No location in scope — select a location to run its checklist.</div>
  }

  return (
    <div>
      <div style={{ display:'flex', gap:10, marginBottom:16, flexWrap:'wrap', alignItems:'center' }}>
        <div style={{ display:'flex', gap:0 }}>
          {['AM','PM','Closing'].map(s => (
            <button key={s} onClick={()=>setShift(s)} style={{ background: shift===s ? 'var(--t-accent)' : 'var(--t-surface)', color: shift===s ? '#000' : 'var(--t-text-muted)', border:'1px solid var(--t-line)', borderRight: s!=='Closing'?'none':undefined, padding:'6px 14px', fontSize:12, fontWeight: shift===s?700:500, cursor:'pointer', borderRadius:0 }}>
              {shiftLabel[s]}
            </button>
          ))}
        </div>
        <select value={nodeId} onChange={e=>setNodeId(e.target.value)} style={{ background:'var(--t-surface)', border:'1px solid var(--t-line)', color:'var(--t-text)', padding:'6px 10px', fontSize:12, borderRadius:0 }}>
          {locations.map(l=><option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
        {loading && <span style={{ fontSize:11, color:'var(--t-accent)' }}>Loading…</span>}
      </div>

      <div style={{ background:'var(--t-surface)', border:'1px solid var(--t-line)', padding:'14px 16px', marginBottom:12 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:10 }}>
          <div>
            <div style={{ fontSize:14, fontWeight:800, color:'var(--t-text)', marginBottom:2 }}>{shiftLabel[shift]} Checklist — {currentLoc?.name || ''}</div>
            <div style={{ fontSize:11, color:'var(--t-text-muted)' }}>{dateStr}</div>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:12, flexWrap:'wrap' }}>
            <span style={{ fontSize:12, fontWeight:700, color:'var(--t-text)' }}>{checkedCount} of {items.length} complete</span>
            <span style={{ fontSize:11, fontWeight:700, color: statusColor, padding:'3px 8px', border:`1px solid ${statusColor}` }}>{statusText}</span>
            {canManage && !signedOff && (
              <button onClick={signOff} disabled={!allChecked} style={{ background: allChecked ? 'var(--t-success)' : 'var(--t-surface-2)', color: allChecked ? '#000' : 'var(--t-text-muted)', border:'1px solid var(--t-line)', padding:'6px 14px', fontSize:12, fontWeight:700, cursor: allChecked?'pointer':'not-allowed', borderRadius:0 }}>Sign Off</button>
            )}
            {signedOff && (
              <span style={{ fontSize:11, color:'var(--t-text-muted)' }}>Signed by {run?.signed_by || 'Manager'}{run?.signed_at ? ` at ${new Date(run.signed_at).toLocaleTimeString()}` : ''}</span>
            )}
          </div>
        </div>
        <div style={{ marginTop:10, height:4, background:'var(--t-line)', position:'relative', overflow:'hidden' }}>
          <div style={{ position:'absolute', left:0, top:0, bottom:0, width:`${progressPct}%`, background: progressPct===100?'var(--t-success)':'var(--t-accent)', transition:'width .3s' }}/>
        </div>
      </div>

      <div style={{ background:'var(--t-surface)', border:'1px solid var(--t-line)' }}>
        {items.map((item, idx) => {
          const st = state[item.id] || { checked:false, note:'', photo:null }
          const noteOpen = expandedNotes[item.id]
          return (
            <div key={item.id} style={{ borderBottom: idx < items.length-1 ? '1px solid var(--t-line)' : 'none', padding:'10px 14px' }}>
              <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                <div onClick={() => toggleItem(item.id)} style={{ width:18, height:18, border:`2px solid ${st.checked?'var(--t-success)':'var(--t-line)'}`, background:st.checked?'var(--t-success)':'transparent', display:'flex', alignItems:'center', justifyContent:'center', cursor:signedOff?'default':'pointer', flexShrink:0, borderRadius:0 }}>
                  {st.checked && <span style={{ color:'#000', fontSize:11, fontWeight:900 }}>✓</span>}
                </div>
                <span style={{ flex:1, fontSize:13, color: st.checked?'var(--t-text-muted)':'var(--t-text)', textDecoration: st.checked?'line-through':'none' }}>{item.text}</span>
                <button onClick={() => setExpandedNotes(prev => ({ ...prev, [item.id]: !prev[item.id] }))} style={{ background:'transparent', border:'none', color:'var(--t-accent)', fontSize:11, cursor:'pointer', fontWeight:600, padding:'0 6px', borderRadius:0 }}>{noteOpen ? 'Hide Note' : 'Add Note'}</button>
                <button onClick={() => setExpandedNotes(prev => ({ ...prev, [`${item.id}_photo`]: !prev[`${item.id}_photo`] }))} style={{ background:'transparent', border:'1px solid var(--t-line)', color:'var(--t-text-muted)', fontSize:11, cursor:'pointer', padding:'3px 8px', borderRadius:0 }} title="Attach photo">📷</button>
              </div>
              {noteOpen && (
                <textarea value={st.note || ''} onChange={e => updateNote(item.id, e.target.value)} placeholder="Add a note…" disabled={signedOff} style={{ marginTop:6, marginLeft:28, width:'calc(100% - 28px)', background:'var(--t-surface-2)', border:'1px solid var(--t-line)', color:'var(--t-text)', padding:'6px 8px', fontSize:12, resize:'vertical', minHeight:50, outline:'none', boxSizing:'border-box', borderRadius:0, fontFamily:'inherit' }}/>
              )}
              {expandedNotes[`${item.id}_photo`] && (
                <div style={{ marginLeft:28, marginTop:4 }}>
                  <ImageUploader value={st.photo || null} onChange={b64 => updateItemPhoto(item.id, b64)} label="Attach Photo Evidence" />
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── BULK ASSIGN TAB (real create_task per selected employee) ──────────────────
function BulkAssignTab({ roster, locations, personId }) {
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState(CATEGORIES[0])
  const [priority, setPriority] = useState('Medium')
  const [nodeId, setNodeId] = useState(locations[0]?.id || '')
  const [dueDate, setDueDate] = useState('')
  const [selected, setSelected] = useState([])
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(null)

  useEffect(() => { if (!nodeId && locations[0]) setNodeId(locations[0].id) }, [locations, nodeId])

  const toggle = (id) => setSelected(s => s.includes(id) ? s.filter(x=>x!==id) : [...s, id])
  const selectAll = () => setSelected(roster.map(r=>r.id))
  const clearAll = () => setSelected([])

  const assign = async () => {
    if (!title.trim() || selected.length === 0 || busy) return
    setBusy(true); setResult(null)
    let ok = 0, fail = 0
    for (const pid of selected) {
      try {
        const { data, error } = await sb.rpc('create_task', {
          p_title: title.trim(), p_category: category, p_description: null,
          p_priority: priority.toLowerCase(), p_due_date: dueDate || null,
          p_node_id: nodeId || null, p_assigned_to: pid, p_person_id: personId || null,
        })
        if (error || (data && data.ok === false)) fail++; else ok++
      } catch { fail++ }
    }
    setResult({ ok, fail })
    if (ok > 0) { setTitle(''); setSelected([]) }
    setBusy(false)
  }

  return (
    <div style={{ maxWidth:640 }}>
      <SL>BULK ASSIGN TASK</SL>
      <div style={{ background:'var(--t-surface)', border:'1px solid var(--t-line)', padding:'20px', display:'flex', flexDirection:'column', gap:12, borderRadius:0 }}>
        <div>
          <div style={{ fontSize:11, color:'var(--t-text-muted)', marginBottom:4 }}>TASK TITLE</div>
          <input value={title} onChange={e=>setTitle(e.target.value)} placeholder="e.g. Complete opening checklist" style={{ width:'100%', background:'var(--t-surface-2)', border:'1px solid var(--t-line)', color:'var(--t-text)', padding:'8px 10px', fontSize:12, outline:'none', boxSizing:'border-box', borderRadius:0 }}/>
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
          <div>
            <div style={{ fontSize:11, color:'var(--t-text-muted)', marginBottom:4 }}>CATEGORY</div>
            <select value={category} onChange={e=>setCategory(e.target.value)} style={{ width:'100%', background:'var(--t-surface-2)', border:'1px solid var(--t-line)', color:'var(--t-text)', padding:'8px 10px', fontSize:12, borderRadius:0 }}>{CATEGORIES.map(c=><option key={c}>{c}</option>)}</select>
          </div>
          <div>
            <div style={{ fontSize:11, color:'var(--t-text-muted)', marginBottom:4 }}>PRIORITY</div>
            <select value={priority} onChange={e=>setPriority(e.target.value)} style={{ width:'100%', background:'var(--t-surface-2)', border:'1px solid var(--t-line)', color:'var(--t-text)', padding:'8px 10px', fontSize:12, borderRadius:0 }}>{PRIORITIES.map(p=><option key={p}>{p}</option>)}</select>
          </div>
          <div>
            <div style={{ fontSize:11, color:'var(--t-text-muted)', marginBottom:4 }}>LOCATION</div>
            <select value={nodeId} onChange={e=>setNodeId(e.target.value)} style={{ width:'100%', background:'var(--t-surface-2)', border:'1px solid var(--t-line)', color:'var(--t-text)', padding:'8px 10px', fontSize:12, borderRadius:0 }}><option value="">— Location —</option>{locations.map(l=><option key={l.id} value={l.id}>{l.name}</option>)}</select>
          </div>
          <div>
            <div style={{ fontSize:11, color:'var(--t-text-muted)', marginBottom:4 }}>DUE DATE</div>
            <input type="date" value={dueDate} onChange={e=>setDueDate(e.target.value)} style={{ width:'100%', background:'var(--t-surface-2)', border:'1px solid var(--t-line)', color:'var(--t-text)', padding:'8px 10px', fontSize:12, outline:'none', boxSizing:'border-box', borderRadius:0 }}/>
          </div>
        </div>
        <div>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6 }}>
            <div style={{ fontSize:11, color:'var(--t-text-muted)' }}>ASSIGN TO ({selected.length} selected)</div>
            <div style={{ display:'flex', gap:6 }}>
              <button onClick={selectAll} style={{ background:'transparent', border:'1px solid var(--t-line)', color:'var(--t-text-muted)', padding:'3px 8px', fontSize:10, cursor:'pointer', borderRadius:0 }}>Select all</button>
              <button onClick={clearAll} style={{ background:'transparent', border:'1px solid var(--t-line)', color:'var(--t-text-muted)', padding:'3px 8px', fontSize:10, cursor:'pointer', borderRadius:0 }}>Clear</button>
            </div>
          </div>
          {roster.length === 0 ? (
            <div style={{ fontSize:12, color:'var(--t-text-faint)', padding:'8px 0' }}>No employees in scope.</div>
          ) : (
            <div style={{ display:'flex', gap:6, flexWrap:'wrap', maxHeight:180, overflowY:'auto' }}>
              {roster.map(r=>(
                <button key={r.id} onClick={()=>toggle(r.id)} style={{ background: selected.includes(r.id)?'var(--t-accent)':'var(--t-surface-2)', color: selected.includes(r.id)?'#000':'var(--t-text)', border:'1px solid var(--t-line)', padding:'5px 10px', fontSize:11, cursor:'pointer', fontWeight:600, borderRadius:0 }}>{r.full_name}</button>
              ))}
            </div>
          )}
        </div>
        <button onClick={assign} disabled={busy || !title.trim() || selected.length===0} style={{ background: (busy||!title.trim()||selected.length===0)?'var(--t-surface-2)':'var(--t-accent)', color: (busy||!title.trim()||selected.length===0)?'var(--t-text-muted)':'#000', border:'none', padding:'10px', fontSize:13, fontWeight:700, cursor:(busy||!title.trim()||selected.length===0)?'not-allowed':'pointer', borderRadius:0 }}>
          {busy ? 'Assigning…' : `Assign to ${selected.length || 'selected'} employee${selected.length===1?'':'s'}`}
        </button>
        {result && (
          <div style={{ fontSize:12, fontWeight:700, color: result.fail ? 'var(--t-warn)' : 'var(--t-success)' }}>
            ✓ {result.ok} task{result.ok===1?'':'s'} created{result.fail ? ` · ${result.fail} failed` : ''}
          </div>
        )}
      </div>
    </div>
  )
}

export default function Tasks() {
  const nav = useNavigate()
  const { session } = useAuth()
  const { locationIds, locations } = useScope()
  const person = session?.person
  const personId = person?.id
  const myName = person?.full_name || 'Me'
  const role = person?.role_name || ''
  const canManage = isHR(role)

  const showProjects = useFeatureFlag('daily_projects')

  const [tasks, setTasks] = useState([])
  const [roster, setRoster] = useState([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('my')
  const [filterStatus, setFilterStatus] = useState('all')
  const [filterPriority, setFilterPriority] = useState('all')
  const [filterLocation, setFilterLocation] = useState('all')
  const [filterCategory, setFilterCategory] = useState('all')
  const [search, setSearch] = useState('')
  const [selectedTask, setSelectedTask] = useState(null)
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState({title:'',category:CATEGORIES[0],priority:'Medium',assignee_id:'',node_id:'',due_date:'',description:''})
  const [formSuccess, setFormSuccess] = useState(false)
  const [creating, setCreating] = useState(false)

  const nodeKey = (locationIds || []).join(',')

  // Node id → display name (scope locations + any name the roster surfaces).
  const nodeName = useMemo(() => {
    const m = {}
    ;(locations || []).forEach(l => { m[l.id] = l.name })
    roster.forEach(r => { if (r.node_id && r.node_name) m[r.node_id] = r.node_name })
    return m
  }, [locations, roster])

  const rosterName = useMemo(() => {
    const m = {}
    roster.forEach(r => { if (r.id) m[r.id] = r.full_name })
    return m
  }, [roster])

  // Distinct location labels present, for the filter + BY LOCATION rollup.
  const locList = useMemo(() => {
    const s = new Set((locations || []).map(l => l.name))
    tasks.forEach(t => { if (t.location) s.add(t.location) })
    return [...s]
  }, [locations, tasks])

  const normalize = useCallback((row) => ({
    ...row,
    status: deriveStatus(row),
    priority: capPrio(row.priority),
    assigned_to_name: row.assignee_name || rosterName[row.assigned_to] || row.assigned_to_name || 'Unassigned',
    assigned_by_name: row.assigned_by_name || rosterName[row.assigned_by] || null,
    location: row.node_name || nodeName[row.node_id] || row.location || '—',
    notes: row.description || row.notes || '',
    due_date: row.due_date || '',
    created_at: (row.created_at || '').slice(0, 10),
  }), [rosterName, nodeName])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [tRes, rRes] = await Promise.all([
        sb.rpc('get_tasks', { p_node_ids: locationIds, p_person_id: personId ?? null }),
        sb.rpc('get_roster', { p_node_ids: locationIds }),
      ])
      const rawRoster = (Array.isArray(rRes.data) ? rRes.data : []).map(r => ({
        id: r.id ?? r.person_id, full_name: r.full_name, role: r.role_name ?? r.role,
        node_id: r.node_id, node_name: r.node_name ?? r.location,
      })).filter(p => p.id && p.full_name)
      setRoster(rawRoster)
      setTasks(Array.isArray(tRes.data) ? tRes.data : [])
    } catch {
      setTasks([]); setRoster([])
    } finally { setLoading(false) }
  }, [nodeKey, personId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(()=>{ load() },[load])

  const allTasks = useMemo(() => tasks.map(normalize), [tasks, normalize])

  const myTasks = useMemo(()=>allTasks.filter(t=>{
    if (personId) return t.assigned_to === personId
    return true
  }),[allTasks,personId])

  const applyFilters = useCallback((list) => {
    return list.filter(t=>{
      if (filterStatus!=='all' && t.status!==filterStatus) return false
      if (filterPriority!=='all' && t.priority!==filterPriority) return false
      if (filterLocation!=='all' && t.location!==filterLocation) return false
      if (filterCategory!=='all' && t.category!==filterCategory) return false
      if (search && !(t.title||'').toLowerCase().includes(search.toLowerCase()) && !(t.assigned_to_name||'').toLowerCase().includes(search.toLowerCase())) return false
      return true
    })
  },[filterStatus,filterPriority,filterLocation,filterCategory,search])

  const filteredMyTasks = useMemo(()=>applyFilters(myTasks),[myTasks,applyFilters])
  const filteredAllTasks = useMemo(()=>applyFilters(allTasks),[allTasks,applyFilters])

  const stats = useMemo(()=>{
    const total = allTasks.length
    const complete = allTasks.filter(t=>t.status==='complete').length
    const overdue = allTasks.filter(t=>t.status==='overdue').length
    const inProg = allTasks.filter(t=>t.status==='in_progress').length
    const pending = allTasks.filter(t=>t.status==='pending').length
    const urgent = allTasks.filter(t=>t.priority==='Urgent').length
    const myTotal = myTasks.length
    const myDone = myTasks.filter(t=>t.status==='complete').length
    const myOverdue = myTasks.filter(t=>t.status==='overdue').length
    const completionRate = total>0?Math.round(complete/total*100):0
    return {total,complete,overdue,inProg,pending,urgent,myTotal,myDone,myOverdue,completionRate}
  },[allTasks,myTasks])

  // ── Drill-down: every KPI tile exposes the task records behind its number ──
  const [drill, setDrill] = useState(null)
  const statusLabelOf = s => s==='in_progress'?'In Progress':(s||'').charAt(0).toUpperCase()+(s||'').slice(1)
  const TASK_COLS = [
    { key:'title', label:'Task', value:t=>t.title },
    { key:'assigned_to_name', label:'Assigned To', value:t=>t.assigned_to_name },
    { key:'location', label:'Location', value:t=>t.location },
    { key:'category', label:'Category', value:t=>t.category },
    { key:'priority', label:'Priority', value:t=>t.priority, sortKey:t=>PRIORITIES.indexOf(t.priority) },
    { key:'status', label:'Status', value:t=>statusLabelOf(t.status) },
    { key:'due_date', label:'Due', value:t=>t.due_date, sortKey:t=>t.due_date },
  ]
  const openDrill = (title, rows, accent) => setDrill({
    title, subtitle:`${rows.length} task${rows.length===1?'':'s'} behind this metric`, columns:TASK_COLS, rows, accent,
  })

  const toggleStatus = async (taskId, newStatus) => {
    // optimistic
    setTasks(prev=>prev.map(t=>t.id===taskId?{...t,status:toDbStatus(newStatus),completed_at:newStatus==='complete'?new Date().toISOString():null}:t))
    try {
      const { error } = await sb.rpc('update_task_status', { p_task_id: taskId, p_status: toDbStatus(newStatus), p_actor: personId ?? null })
      if (error) throw error
    } catch { load() }
  }

  const submitTask = async () => {
    if (!form.title.trim() || creating) return
    setCreating(true)
    try {
      const { data, error } = await sb.rpc('create_task', {
        p_title: form.title.trim(),
        p_category: form.category,
        p_description: form.description || null,
        p_priority: form.priority.toLowerCase(),
        p_due_date: form.due_date || null,
        p_node_id: form.node_id || locationIds[0] || null,
        p_assigned_to: form.assignee_id || personId || null,
        p_person_id: personId || null,
      })
      if (error || (data && data.ok === false)) throw new Error('failed')
      setFormSuccess(true)
      await load()
      setTimeout(()=>{ setFormSuccess(false); setShowCreate(false); setForm({title:'',category:CATEGORIES[0],priority:'Medium',assignee_id:'',node_id:'',due_date:'',description:''}) }, 1200)
    } catch {
      // sb.rpc wrapper already surfaces an honest toast for missing functions
    } finally { setCreating(false) }
  }

  const filterBar = (
    <div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:16,alignItems:'center'}}>
      <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search tasks…" style={{background:'var(--t-surface)',border:'1px solid var(--t-line)',color:'var(--t-text)',padding:'6px 10px',fontSize:12,outline:'none',minWidth:160,borderRadius:0}}/>
      {[
        {val:filterStatus,set:setFilterStatus,opts:['all','pending','in_progress','complete','overdue'],label:'Status'},
        {val:filterPriority,set:setFilterPriority,opts:['all','Urgent','High','Medium','Low'],label:'Priority'},
        {val:filterLocation,set:setFilterLocation,opts:['all',...locList],label:'Location'},
        {val:filterCategory,set:setFilterCategory,opts:['all',...CATEGORIES],label:'Category'},
      ].map(({val,set,opts,label})=>(
        <select key={label} value={val} onChange={e=>set(e.target.value)} style={{background:'var(--t-surface)',border:'1px solid var(--t-line)',color:'var(--t-text)',padding:'6px 10px',fontSize:12,borderRadius:0}}>
          {opts.map(o=><option key={o} value={o}>{o==='all'?`All ${label}s`:o==='in_progress'?'In Progress':o.charAt(0).toUpperCase()+o.slice(1)}</option>)}
        </select>
      ))}
      <button onClick={()=>{ setFilterStatus('all');setFilterPriority('all');setFilterLocation('all');setFilterCategory('all');setSearch('') }} style={{background:'transparent',border:'1px solid var(--t-line)',color:'var(--t-text-muted)',padding:'6px 10px',fontSize:11,cursor:'pointer',borderRadius:0}}>
        Clear
      </button>
    </div>
  )

  const taskRow = (t) => (
    <div key={t.id} style={{background:'var(--t-surface)',border:`1px solid ${t.status==='overdue'?'var(--t-danger)33':t.priority==='Urgent'?'var(--t-warn)33':'var(--t-line)'}`,padding:'12px 16px',marginBottom:6,display:'flex',alignItems:'center',gap:12,cursor:'pointer',borderRadius:0}} onClick={()=>setSelectedTask(selectedTask?.id===t.id?null:t)}>
      <div style={{width:20,height:20,border:`2px solid ${t.status==='complete'?'var(--t-success)':'var(--t-line)'}`,background:t.status==='complete'?'var(--t-success)':'transparent',display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',flexShrink:0,borderRadius:0}} onClick={e=>{e.stopPropagation();toggleStatus(t.id,t.status==='complete'?'pending':'complete')}}>
        {t.status==='complete'&&<span style={{color:'#000',fontSize:12,fontWeight:900}}>✓</span>}
      </div>
      <div style={{flex:1,minWidth:0}}>
        <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
          <span style={{fontSize:13,fontWeight:600,color:t.status==='complete'?'var(--t-text-muted)':'var(--t-text)',textDecoration:t.status==='complete'?'line-through':'none'}}>{t.title}</span>
          <PriorityBadge p={t.priority}/>
          <StatusBadge s={t.status}/>
        </div>
        <div style={{fontSize:11,color:'var(--t-text-muted)',marginTop:3,display:'flex',gap:10,flexWrap:'wrap'}}>
          <span>{t.category}</span>
          <span>{t.location}</span>
          {canManage&&<span>→ {t.assigned_to_name}</span>}
          {t.due_date && <span style={{color:t.status==='overdue'?'var(--t-danger)':'var(--t-text-faint)'}}>Due {t.due_date}</span>}
        </div>
      </div>
      <div style={{display:'flex',gap:6,flexShrink:0}}>
        {t.status!=='complete' && (
          <button onClick={e=>{e.stopPropagation();toggleStatus(t.id,'in_progress')}} style={{background:'transparent',border:'1px solid var(--t-line)',color:'var(--t-text-muted)',padding:'4px 8px',fontSize:10,cursor:'pointer',fontWeight:600,borderRadius:0}}>
            Start
          </button>
        )}
      </div>
    </div>
  )

  const expandedDetail = (t) => (
    <div style={{background:'var(--t-surface-2)',border:'1px solid var(--t-line)',padding:'16px',marginBottom:12,marginTop:-6,borderRadius:0}}>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16}}>
        <div>
          <div style={{fontSize:11,color:'var(--t-text-muted)',marginBottom:6,fontWeight:700}}>TASK DETAILS</div>
          {[
            {l:'Category',v:t.category},{l:'Priority',v:t.priority},{l:'Location',v:t.location},
            {l:'Assigned To',v:t.assigned_to_name},{l:'Assigned By',v:t.assigned_by_name||'—'},{l:'Due',v:t.due_date||'—'},
            {l:'Created',v:t.created_at||'—'},
          ].map(({l,v})=>(
            <div key={l} style={{display:'flex',justifyContent:'space-between',padding:'4px 0',borderBottom:'1px solid var(--t-line)',fontSize:12}}>
              <span style={{color:'var(--t-text-muted)'}}>{l}</span>
              <span style={{color:'var(--t-text)',fontWeight:600}}>{v}</span>
            </div>
          ))}
        </div>
        <div>
          {t.notes && (
            <>
              <div style={{fontSize:11,color:'var(--t-text-muted)',marginBottom:6,fontWeight:700}}>NOTES</div>
              <div style={{fontSize:12,color:'var(--t-text)',lineHeight:1.6,background:'var(--t-surface)',padding:'10px',border:'1px solid var(--t-line)',borderRadius:0}}>{t.notes}</div>
            </>
          )}
          <div style={{marginTop:12,display:'flex',gap:8,flexWrap:'wrap'}}>
            {t.status!=='complete'&&<button onClick={()=>toggleStatus(t.id,'complete')} style={{background:'var(--t-success)',color:'#000',border:'none',padding:'7px 14px',fontSize:12,fontWeight:700,cursor:'pointer',borderRadius:0}}>Mark Complete</button>}
            {t.status==='pending'&&<button onClick={()=>toggleStatus(t.id,'in_progress')} style={{background:'var(--t-accent)',color:'#000',border:'none',padding:'7px 14px',fontSize:12,fontWeight:700,cursor:'pointer',borderRadius:0}}>Start Task</button>}
            {t.status==='complete'&&<button onClick={()=>toggleStatus(t.id,'pending')} style={{background:'var(--t-surface)',border:'1px solid var(--t-line)',color:'var(--t-text-muted)',padding:'7px 14px',fontSize:12,cursor:'pointer',borderRadius:0}}>Reopen</button>}
          </div>
          <TaskMessage task={t} personId={personId} canManage={canManage} />
        </div>
      </div>
    </div>
  )

  if (loading) return <div className="loader">Loading tasks…</div>

  // Build tab list — projects only if flag is on
  const tabList = [
    {k:'my',l:`My Tasks (${myTasks.length})`},
    ...(canManage?[{k:'all',l:'All Tasks'},{k:'board',l:'Kanban Board'},{k:'create_bulk',l:'Bulk Assign'}]:[]),
    ...(showProjects?[{k:'projects',l:'Projects'}]:[]),
    {k:'checklists',l:'Daily Checklists'},
  ]

  return (
    <div style={{display:'flex',flexDirection:'column',gap:0}}>

      {/* HEADER */}
      <div style={{background:'var(--t-surface)',borderBottom:'1px solid var(--t-line)',padding:'16px 24px',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
        <div>
          <div style={{fontSize:11,color:'var(--t-accent)',fontWeight:700,letterSpacing:'.1em',textTransform:'uppercase',marginBottom:4}}>Operations</div>
          <div style={{fontSize:20,fontWeight:800,color:'var(--t-text)'}}>Task Manager</div>
        </div>
        <button onClick={()=>setShowCreate(true)} style={{background:'var(--t-accent)',color:'#000',border:'none',padding:'8px 18px',fontSize:13,fontWeight:700,cursor:'pointer',borderRadius:0}}>
          + Create Task
        </button>
      </div>

      {/* FORENSIC KPI PANEL */}
      <div style={{padding:'20px 24px',borderBottom:'1px solid var(--t-line)',background:'#080d18'}}>
        <SL>TASK OVERVIEW</SL>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(140px,1fr))',gap:8,marginBottom:16}}>
          <KTile label="Total Tasks" value={stats.total} sub="in scope" onClick={()=>openDrill('All Tasks', allTasks, 'var(--t-accent)')}/>
          <KTile label="Complete" value={stats.complete} sub={`${stats.completionRate}% done`} color='var(--t-success)' onClick={()=>openDrill('Completed Tasks', allTasks.filter(t=>t.status==='complete'), 'var(--t-success)')}/>
          <KTile label="Overdue" value={stats.overdue} alert={stats.overdue>3?'red':stats.overdue>0?'amber':null} color={stats.overdue>0?'var(--t-danger)':'var(--t-text-muted)'} onClick={()=>openDrill('Overdue Tasks', allTasks.filter(t=>t.status==='overdue'), 'var(--t-danger)')}/>
          <KTile label="In Progress" value={stats.inProg} color='var(--t-accent)' onClick={()=>openDrill('In-Progress Tasks', allTasks.filter(t=>t.status==='in_progress'), 'var(--t-accent)')}/>
          <KTile label="Pending" value={stats.pending} color='var(--t-text-muted)' onClick={()=>openDrill('Pending Tasks', allTasks.filter(t=>t.status==='pending'), 'var(--t-text-muted)')}/>
          <KTile label="Urgent" value={stats.urgent} alert={stats.urgent>0?'red':null} color={stats.urgent>0?'var(--t-danger)':'var(--t-text-muted)'} onClick={()=>openDrill('Urgent Tasks', allTasks.filter(t=>t.priority==='Urgent'), 'var(--t-danger)')}/>
          <KTile label="My Tasks" value={stats.myTotal} sub={`${stats.myDone} done`} color='var(--t-accent)' onClick={()=>openDrill('My Tasks', myTasks, 'var(--t-accent)')}/>
          <KTile label="My Overdue" value={stats.myOverdue} alert={stats.myOverdue>0?'red':null} color={stats.myOverdue>0?'var(--t-danger)':'var(--t-text-muted)'} onClick={()=>openDrill('My Overdue Tasks', myTasks.filter(t=>t.status==='overdue'), 'var(--t-danger)')}/>
        </div>

        <SL>BY LOCATION</SL>
        <div style={{background:'var(--t-surface)',border:'1px solid var(--t-line)',overflow:'hidden'}}>
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
            <thead>
              <tr style={{background:'var(--t-surface-2)',borderBottom:'1px solid var(--t-line)'}}>
                {['Location','Total','Complete','Overdue','Pending','Rate %'].map(h=>(
                  <th key={h} style={{padding:'8px 12px',textAlign:'left',color:'var(--t-text-muted)',fontWeight:700,fontSize:10,letterSpacing:'.06em',textTransform:'uppercase'}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {locList.length===0 ? (
                <tr><td colSpan={6} style={{padding:'14px 12px',color:'var(--t-text-muted)'}}>No tasks in scope yet.</td></tr>
              ) : locList.map(loc=>{
                const lt = allTasks.filter(t=>t.location===loc)
                const lc = lt.filter(t=>t.status==='complete').length
                const lo = lt.filter(t=>t.status==='overdue').length
                const lp = lt.filter(t=>t.status==='pending').length
                const rate = lt.length>0?Math.round(lc/lt.length*100):0
                return (
                  <tr key={loc} style={{borderBottom:'1px solid var(--t-line)',cursor:'pointer'}} onClick={()=>openDrill(`Tasks — ${loc}`, lt, 'var(--t-accent)')}>
                    <td style={{padding:'8px 12px',fontWeight:700,color:'var(--t-text)'}}>{loc}</td>
                    <td style={{padding:'8px 12px',color:'var(--t-text)'}}>{lt.length}</td>
                    <td style={{padding:'8px 12px',color:'var(--t-success)',fontWeight:700}}>{lc}</td>
                    <td style={{padding:'8px 12px',color:lo>0?'var(--t-danger)':'var(--t-text-muted)',fontWeight:lo>0?700:400}}>{lo}</td>
                    <td style={{padding:'8px 12px',color:'var(--t-text-muted)'}}>{lp}</td>
                    <td style={{padding:'8px 12px'}}><span style={{fontWeight:700,color:rate>=80?'var(--t-success)':rate>=60?'var(--t-warn)':'var(--t-danger)'}}>{rate}%</span></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* TABS */}
      <div style={{display:'flex',borderBottom:'1px solid var(--t-line)',background:'var(--t-surface)',padding:'0 24px',overflowX:'auto'}}>
        {tabList.map(({k,l})=>(
          <button key={k} onClick={()=>setTab(k)} style={{padding:'10px 18px',border:'none',background:'none',cursor:'pointer',fontFamily:'inherit',borderBottom:tab===k?'2px solid var(--t-accent)':'2px solid transparent',color:tab===k?'var(--t-text)':'var(--t-text-muted)',fontSize:12,fontWeight:tab===k?700:500,letterSpacing:'.06em',textTransform:'uppercase',whiteSpace:'nowrap',borderRadius:0}}>{l}</button>
        ))}
      </div>

      <div style={{padding:'20px 24px'}}>

        {/* MY TASKS */}
        {tab==='my' && (
          <div>
            {filterBar}
            {filteredMyTasks.length===0 ? (
              <div style={{textAlign:'center',padding:'40px',color:'var(--t-success)',fontSize:14,fontWeight:700}}>✓ All caught up — no tasks matching filters</div>
            ) : (
              filteredMyTasks.map(t=>(
                <div key={t.id}>
                  {taskRow(t)}
                  {selectedTask?.id===t.id && expandedDetail(t)}
                </div>
              ))
            )}
          </div>
        )}

        {/* ALL TASKS (HR) */}
        {tab==='all' && canManage && (
          <div>
            {filterBar}
            <div style={{fontSize:12,color:'var(--t-text-muted)',marginBottom:12}}>{filteredAllTasks.length} tasks</div>
            {filteredAllTasks.length===0 ? (
              <div style={{textAlign:'center',padding:'40px',color:'var(--t-text-muted)',fontSize:13}}>No tasks in scope.</div>
            ) : filteredAllTasks.map(t=>(
              <div key={t.id}>
                {taskRow(t)}
                {selectedTask?.id===t.id && expandedDetail(t)}
              </div>
            ))}
          </div>
        )}

        {/* KANBAN */}
        {tab==='board' && canManage && (
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr 1fr',gap:12,overflowX:'auto'}}>
            {[
              {status:'pending',label:'Pending',color:'var(--t-text-muted)'},
              {status:'in_progress',label:'In Progress',color:'var(--t-accent)'},
              {status:'overdue',label:'Overdue',color:'var(--t-danger)'},
              {status:'complete',label:'Complete',color:'var(--t-success)'},
            ].map(col=>{
              const colTasks = allTasks.filter(t=>t.status===col.status)
              return (
                <div key={col.status} style={{background:'var(--t-surface)',border:'1px solid var(--t-line)',minHeight:300,borderRadius:0}}>
                  <div style={{padding:'10px 12px',borderBottom:'1px solid var(--t-line)',display:'flex',justifyContent:'space-between',alignItems:'center',background:'var(--t-surface-2)'}}>
                    <span style={{fontSize:12,fontWeight:700,color:col.color,textTransform:'uppercase',letterSpacing:'.06em'}}>{col.label}</span>
                    <span style={{background:col.color,color:'#000',padding:'2px 8px',fontSize:11,fontWeight:800,borderRadius:0}}>{colTasks.length}</span>
                  </div>
                  <div style={{padding:'8px'}}>
                    {colTasks.slice(0,8).map(t=>(
                      <div key={t.id} style={{background:'var(--t-surface-2)',border:'1px solid var(--t-line)',padding:'8px 10px',marginBottom:6,borderRadius:0}}>
                        <div style={{fontSize:12,fontWeight:600,color:'var(--t-text)',marginBottom:3}}>{t.title}</div>
                        <div style={{fontSize:10,color:'var(--t-text-muted)'}}>{t.assigned_to_name} · {t.location}</div>
                        <div style={{marginTop:4,display:'flex',gap:4}}>
                          <PriorityBadge p={t.priority}/>
                        </div>
                      </div>
                    ))}
                    {colTasks.length>8&&<div style={{fontSize:11,color:'var(--t-text-faint)',textAlign:'center',padding:'4px'}}>{colTasks.length-8} more…</div>}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* BULK ASSIGN */}
        {tab==='create_bulk' && canManage && (
          <BulkAssignTab roster={roster} locations={locations} personId={personId} />
        )}

        {/* PROJECTS (feature-flagged) */}
        {tab==='projects' && showProjects && (
          <ProjectsTab locationIds={locationIds} locations={locations} roster={roster} personId={personId} canManage={canManage} />
        )}

        {/* DAILY CHECKLISTS */}
        {tab==='checklists' && (
          <ChecklistsTab canManage={canManage} locations={locations} personId={personId} myName={myName} />
        )}

      </div>

      {/* CREATE TASK MODAL */}
      {showCreate && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.7)',zIndex:999,display:'flex',alignItems:'center',justifyContent:'center',padding:20}}>
          <div style={{background:'var(--t-surface)',border:'1px solid var(--t-line)',padding:'24px',maxWidth:500,width:'100%',maxHeight:'85vh',overflowY:'auto',borderRadius:0}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20}}>
              <div style={{fontSize:16,fontWeight:800,color:'var(--t-text)'}}>Create Task</div>
              <button onClick={()=>setShowCreate(false)} style={{background:'transparent',border:'none',color:'var(--t-text-muted)',fontSize:20,cursor:'pointer',borderRadius:0}}>✕</button>
            </div>
            {[
              {label:'TITLE', el:<input value={form.title} onChange={e=>setForm(p=>({...p,title:e.target.value}))} placeholder="Task title…" style={{width:'100%',background:'var(--t-surface-2)',border:'1px solid var(--t-line)',color:'var(--t-text)',padding:'8px 10px',fontSize:13,outline:'none',boxSizing:'border-box',borderRadius:0}}/>},
              {label:'CATEGORY', el:<select value={form.category} onChange={e=>setForm(p=>({...p,category:e.target.value}))} style={{width:'100%',background:'var(--t-surface-2)',border:'1px solid var(--t-line)',color:'var(--t-text)',padding:'8px 10px',fontSize:12,borderRadius:0}}>{CATEGORIES.map(c=><option key={c}>{c}</option>)}</select>},
              {label:'PRIORITY', el:<select value={form.priority} onChange={e=>setForm(p=>({...p,priority:e.target.value}))} style={{width:'100%',background:'var(--t-surface-2)',border:'1px solid var(--t-line)',color:'var(--t-text)',padding:'8px 10px',fontSize:12,borderRadius:0}}>{PRIORITIES.map(pr=><option key={pr}>{pr}</option>)}</select>},
              {label:'LOCATION', el:<select value={form.node_id} onChange={e=>setForm(p=>({...p,node_id:e.target.value}))} style={{width:'100%',background:'var(--t-surface-2)',border:'1px solid var(--t-line)',color:'var(--t-text)',padding:'8px 10px',fontSize:12,borderRadius:0}}><option value="">— Location —</option>{locations.map(l=><option key={l.id} value={l.id}>{l.name}</option>)}</select>},
              {label:'DUE DATE', el:<input type="date" value={form.due_date} onChange={e=>setForm(p=>({...p,due_date:e.target.value}))} style={{width:'100%',background:'var(--t-surface-2)',border:'1px solid var(--t-line)',color:'var(--t-text)',padding:'8px 10px',fontSize:12,outline:'none',boxSizing:'border-box',borderRadius:0}}/>},
              ...(canManage?[{label:'ASSIGN TO', el:<select value={form.assignee_id} onChange={e=>setForm(p=>({...p,assignee_id:e.target.value}))} style={{width:'100%',background:'var(--t-surface-2)',border:'1px solid var(--t-line)',color:'var(--t-text)',padding:'8px 10px',fontSize:12,borderRadius:0}}><option value="">— Self —</option>{roster.map(r=><option key={r.id} value={r.id}>{r.full_name}</option>)}</select>}]:[]),
              {label:'NOTES', el:<textarea value={form.description} onChange={e=>setForm(p=>({...p,description:e.target.value}))} placeholder="Additional instructions…" style={{width:'100%',background:'var(--t-surface-2)',border:'1px solid var(--t-line)',color:'var(--t-text)',padding:'8px 10px',fontSize:12,resize:'vertical',minHeight:70,outline:'none',boxSizing:'border-box',borderRadius:0,fontFamily:'inherit'}}/>},
            ].map(({label,el})=>(
              <div key={label} style={{marginBottom:12}}>
                <div style={{fontSize:11,color:'var(--t-text-muted)',marginBottom:4,fontWeight:700}}>{label}</div>
                {el}
              </div>
            ))}
            <div style={{display:'flex',gap:8,marginTop:16}}>
              <button onClick={()=>setShowCreate(false)} style={{flex:1,background:'transparent',border:'1px solid var(--t-line)',color:'var(--t-text-muted)',padding:'10px',fontSize:13,cursor:'pointer',borderRadius:0}}>Cancel</button>
              <button onClick={submitTask} disabled={creating} style={{flex:2,background:formSuccess?'var(--t-success)':'var(--t-accent)',color:'#000',border:'none',padding:'10px',fontSize:13,fontWeight:700,cursor:creating?'not-allowed':'pointer',borderRadius:0,opacity:creating?0.7:1}}>
                {formSuccess?'✓ Task Created!':creating?'Creating…':'Create Task'}
              </button>
            </div>
          </div>
        </div>
      )}

      <DrillDown open={!!drill} onClose={()=>setDrill(null)} {...(drill||{})} messaging={canManage?{nameKey:'assigned_to_name',subjectKey:'title'}:null} />
    </div>
  )
}
