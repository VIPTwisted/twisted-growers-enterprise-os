// Forms.jsx — form library, submissions, timesheets, form builder.
// NOTHING HERE IS SEEDED (Bible §12g, 14 Sep 2026): the catalogue is hr.form_catalog rows
// (hr.get_form_catalog), submissions are hr.hr_form_submissions (hr.get_form_submissions_v2,
// joined to the person and their department), timesheets are hr time punches
// (get_all_time_entries / get_my_time_entries). Departments come from the session's nodes.
// An empty list is shown as empty — never filled with sample rows.
import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { sb } from '../lib/supabase'
import { useAuth } from '../lib/auth.jsx'
import { useScope } from '../lib/scope.jsx'
import DrillDown from '../components/DrillDown.jsx'

/* ── HELPERS ─────────────────────────────────────────────────────────── */
const todayStr = () => new Date().toISOString().split('T')[0]
const fmtDate  = iso => iso ? new Date(iso).toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' }) : '—'
const timeAgo  = iso => { if (!iso) return '—'; const s = Math.floor((Date.now()-new Date(iso))/1000); if(s<60)return `${s}s ago`; if(s<3600)return `${Math.floor(s/60)}m ago`; if(s<86400)return `${Math.floor(s/3600)}h ago`; return `${Math.floor(s/86400)}d ago` }

const STATUSES = ['Pending','Approved','Rejected','Under Review']

const STATUS_COLOR = {
  'Pending':     'var(--t-warn)',
  'Approved':    'var(--t-success)',
  'Rejected':    'var(--t-danger)',
  'Under Review':'var(--t-accent)',
}

const FIELD_TYPES = ['text','number','date','dropdown','checkbox','signature','file upload']

/* ── DATE RANGE HELPERS ──────────────────────────────────────────────── */
function twoWeeksAgo() {
  const d = new Date()
  d.setDate(d.getDate() - 14)
  return d.toISOString().split('T')[0]
}

function fmtTime(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleTimeString('en-US', { hour:'numeric', minute:'2-digit', hour12:true })
}

function fmtHours(h) {
  if (h == null) return '—'
  const n = parseFloat(h)
  if (isNaN(n)) return '—'
  return `${n.toFixed(2)}h`
}

/* ── KPI TILE ────────────────────────────────────────────────────────── */
function KTile({ label, value, sub, color, alert, onClick }) {
  return (
    <div onClick={onClick} title={onClick ? 'Click to drill into records' : undefined} style={{ background:'var(--t-surface)', border:`1px solid ${alert==='red'?'var(--t-danger)':alert==='amber'?'var(--t-warn)':'var(--t-line)'}`, padding:'14px 16px', position:'relative', overflow:'hidden', cursor: onClick ? 'pointer' : 'default' }}>
      {alert==='red'  && <div style={{ position:'absolute', top:0, left:0, right:0, height:2, background:'var(--t-danger)' }}/>}
      {alert==='amber'&& <div style={{ position:'absolute', top:0, left:0, right:0, height:2, background:'var(--t-warn)' }}/>}
      <div style={{ fontSize:10, fontWeight:700, letterSpacing:'.08em', color:'var(--t-text-muted)', textTransform:'uppercase', marginBottom:6 }}>{label}</div>
      <div style={{ fontSize:24, fontWeight:800, color:color||'var(--t-text)', lineHeight:1, marginBottom:4 }}>{value}</div>
      {sub && <div style={{ fontSize:11, color:'var(--t-text-faint)' }}>{sub}</div>}
    </div>
  )
}

/* ── BADGE ───────────────────────────────────────────────────────────── */
function StatusBadge({ status }) {
  const col = STATUS_COLOR[status] || 'var(--t-text-muted)'
  return (
    <span style={{ display:'inline-block', padding:'2px 8px', fontSize:11, fontWeight:700, borderRadius:3, background:`${col}22`, color:col, border:`1px solid ${col}55` }}>
      {status}
    </span>
  )
}

/* ── LIVE/DEMO BADGE ─────────────────────────────────────────────────── */
function DataBadge({ live }) {
  return (
    <span style={{
      display:'inline-block', padding:'2px 8px', fontSize:10, fontWeight:700, borderRadius:3,
      background: live ? 'rgba(52,199,89,.15)' : 'rgba(255,149,0,.15)',
      color:      live ? 'var(--t-success)'     : 'var(--t-warn)',
      border:     live ? '1px solid rgba(52,199,89,.4)' : '1px solid rgba(255,149,0,.4)',
      letterSpacing:'.06em',
    }}>
      {live ? 'LIVE' : 'DEMO'}
    </span>
  )
}

/* ── FORM CARD ───────────────────────────────────────────────────────── */
function FormCard({ form, submissionCount, isHR, onFillOut, onViewSubmissions }) {
  const CAT_COLOR = { Onboarding:'var(--t-accent)', Payroll:'var(--t-success)', Compliance:'var(--t-warn)', 'Employee Info':'var(--t-text-muted)', 'Time Off':'var(--t-accent)', Scheduling:'#a78bfa', 'HR Action':'var(--t-danger)', Reviews:'var(--t-success)', Operations:'var(--t-text-muted)', Finance:'var(--t-success)' }
  const catCol = CAT_COLOR[form.category] || 'var(--t-text-muted)'
  return (
    <div style={{ background:'var(--t-surface)', border:'1px solid var(--t-line)', padding:'16px', display:'flex', flexDirection:'column', gap:10 }}>
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:8 }}>
        <div style={{ fontSize:22 }}>{form.icon}</div>
        <div style={{ display:'flex', gap:6, flexWrap:'wrap', justifyContent:'flex-end' }}>
          <span style={{ fontSize:10, fontWeight:700, padding:'2px 7px', borderRadius:3, background:`${catCol}22`, color:catCol, border:`1px solid ${catCol}44` }}>{form.category}</span>
          {form.required
            ? <span style={{ fontSize:10, fontWeight:700, padding:'2px 7px', borderRadius:3, background:'rgba(255,59,48,.12)', color:'var(--t-danger)', border:'1px solid rgba(255,59,48,.3)' }}>Required</span>
            : <span style={{ fontSize:10, fontWeight:700, padding:'2px 7px', borderRadius:3, background:'var(--t-surface-2)', color:'var(--t-text-faint)', border:'1px solid var(--t-line)' }}>Optional</span>
          }
        </div>
      </div>
      <div>
        <div style={{ fontWeight:700, fontSize:13, color:'var(--t-text)', marginBottom:2 }}>{form.title}</div>
        <div style={{ fontSize:11, color:'var(--t-text-muted)' }}>{form.updated_at ? `Updated ${fmtDate(form.updated_at)}` : 'In the catalogue'}</div>
      </div>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <span style={{ fontSize:12, color:'var(--t-text-faint)' }}>
          <span style={{ fontWeight:700, color:'var(--t-text)' }}>{submissionCount}</span> submissions
        </span>
      </div>
      <div style={{ display:'flex', gap:8, marginTop:4 }}>
        <button onClick={() => onFillOut(form)} style={{ flex:1, padding:'8px 0', background:'var(--t-accent)', color:'#000', border:'none', fontWeight:700, fontSize:12, cursor:'pointer', letterSpacing:'.3px' }}>
          Fill Out
        </button>
        {isHR && (
          <button onClick={() => onViewSubmissions(form)} style={{ flex:1, padding:'8px 0', background:'var(--t-surface-2)', color:'var(--t-text)', border:'1px solid var(--t-line)', fontWeight:600, fontSize:12, cursor:'pointer' }}>
            Submissions
          </button>
        )}
      </div>
    </div>
  )
}

/* ── FORM FILL MODAL ─────────────────────────────────────────────────── */
function FormFillModal({ form, onClose, onSubmit, submitting }) {
  const [fields, setFields] = useState({ notes:'', date: todayStr(), details:'' })
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.6)', zIndex:9999, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }} onClick={onClose}>
      <div style={{ background:'var(--t-surface)', border:'1px solid var(--t-line)', padding:28, width:'100%', maxWidth:520, maxHeight:'80vh', overflowY:'auto' }} onClick={e=>e.stopPropagation()}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20 }}>
          <div>
            <div style={{ fontSize:16, fontWeight:800, color:'var(--t-text)' }}>{form.icon} {form.title}</div>
            <div style={{ fontSize:12, color:'var(--t-text-muted)', marginTop:2 }}>{form.category}</div>
          </div>
          <button onClick={onClose} style={{ background:'none', border:'none', color:'var(--t-text-muted)', fontSize:20, cursor:'pointer', lineHeight:1 }}>×</button>
        </div>
        <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
          <div>
            <label style={{ display:'block', fontSize:11, fontWeight:700, color:'var(--t-text-muted)', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:5 }}>Date</label>
            <input type="date" value={fields.date} onChange={e=>setFields(f=>({...f,date:e.target.value}))} style={inputSt} />
          </div>
          <div>
            <label style={{ display:'block', fontSize:11, fontWeight:700, color:'var(--t-text-muted)', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:5 }}>Details / Description</label>
            <textarea rows={4} value={fields.details} onChange={e=>setFields(f=>({...f,details:e.target.value}))} placeholder={`Enter details for ${form.title}...`} style={{ ...inputSt, resize:'vertical', lineHeight:1.5 }} />
          </div>
          <div>
            <label style={{ display:'block', fontSize:11, fontWeight:700, color:'var(--t-text-muted)', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:5 }}>Additional Notes (optional)</label>
            <textarea rows={2} value={fields.notes} onChange={e=>setFields(f=>({...f,notes:e.target.value}))} style={{ ...inputSt, resize:'vertical', lineHeight:1.5 }} />
          </div>
          {form.id === 'direct-deposit' && (
            <>
              <div><label style={labelSt}>Bank Name</label><input style={inputSt} placeholder="Bank of America" /></div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                <div><label style={labelSt}>Routing Number</label><input style={inputSt} placeholder="021000021" /></div>
                <div><label style={labelSt}>Account Number</label><input style={inputSt} placeholder="••••••••••" /></div>
              </div>
            </>
          )}
          {form.id === 'pto-request' && (
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
              <div><label style={labelSt}>Start Date</label><input type="date" style={inputSt} /></div>
              <div><label style={labelSt}>End Date</label><input type="date" style={inputSt} /></div>
            </div>
          )}
        </div>
        <div style={{ display:'flex', gap:10, marginTop:22 }}>
          <button onClick={() => onSubmit(fields)} disabled={submitting} style={{ flex:1, padding:'10px 0', background:'var(--t-accent)', color:'#000', border:'none', fontWeight:700, fontSize:13, cursor:submitting?'not-allowed':'pointer', opacity:submitting?.7:1 }}>
            {submitting ? 'Submitting…' : 'Submit Form'}
          </button>
          <button onClick={onClose} style={{ padding:'10px 18px', background:'none', border:'1px solid var(--t-line)', color:'var(--t-text-muted)', fontWeight:600, fontSize:13, cursor:'pointer' }}>Cancel</button>
        </div>
      </div>
    </div>
  )
}

/* ── SUBMISSION DETAIL EXPAND ────────────────────────────────────────── */
function SubmissionDetail({ sub, isHR, onUpdateStatus }) {
  const [busy, setBusy] = useState(false)
  const act = async (st) => { setBusy(true); await onUpdateStatus(sub.id, st); setBusy(false) }
  return (
    <div style={{ padding:'14px 16px', background:'var(--t-bg)', borderTop:'1px solid var(--t-line)' }}>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(180px,1fr))', gap:12, marginBottom:14 }}>
        {Object.entries(sub.formData||{}).map(([k,v]) => (
          <div key={k} style={{ background:'var(--t-surface)', border:'1px solid var(--t-line)', padding:'8px 12px' }}>
            <div style={{ fontSize:10, fontWeight:700, color:'var(--t-text-muted)', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:3 }}>{k}</div>
            <div style={{ fontSize:12, color:'var(--t-text)' }}>{String(v)}</div>
          </div>
        ))}
        {sub.notes && (
          <div style={{ background:'var(--t-surface)', border:'1px solid var(--t-line)', padding:'8px 12px', gridColumn:'1/-1' }}>
            <div style={{ fontSize:10, fontWeight:700, color:'var(--t-text-muted)', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:3 }}>HR Notes</div>
            <div style={{ fontSize:12, color:'var(--t-text)' }}>{sub.notes}</div>
          </div>
        )}
      </div>
      <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center' }}>
        <button onClick={() => { const d=`data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify(sub,null,2))}`;const a=document.createElement('a');a.href=d;a.download=`${sub.formTitle}-${sub.id}.json`;a.click() }}
          style={{ padding:'6px 14px', background:'var(--t-surface)', border:'1px solid var(--t-line)', color:'var(--t-text)', fontSize:12, fontWeight:600, cursor:'pointer' }}>
          Download PDF
        </button>
        {isHR && sub.status !== 'Approved' && (
          <button onClick={() => act('Approved')} disabled={busy} style={{ padding:'6px 14px', background:'var(--t-success)', color:'#fff', border:'none', fontSize:12, fontWeight:700, cursor:'pointer', opacity:busy?.7:1 }}>
            Approve
          </button>
        )}
        {isHR && sub.status !== 'Rejected' && (
          <button onClick={() => act('Rejected')} disabled={busy} style={{ padding:'6px 14px', background:'var(--t-danger)', color:'#fff', border:'none', fontSize:12, fontWeight:700, cursor:'pointer', opacity:busy?.7:1 }}>
            Reject
          </button>
        )}
        {isHR && sub.status !== 'Under Review' && (
          <button onClick={() => act('Under Review')} disabled={busy} style={{ padding:'6px 14px', background:'var(--t-surface-2)', color:'var(--t-accent)', border:'1px solid var(--t-accent)', fontSize:12, fontWeight:700, cursor:'pointer', opacity:busy?.7:1 }}>
            Request Info
          </button>
        )}
      </div>
    </div>
  )
}

/* ── FORM BUILDER ────────────────────────────────────────────────────── */
function FormBuilder() {
  const [formName, setFormName]  = useState('')
  const [fields, setFields]      = useState([])
  const [preview, setPreview]    = useState(false)
  const [saved, setSaved]        = useState(null)
  const [editIdx, setEditIdx]    = useState(null)

  const addField = () => {
    setFields(f => [...f, { id: Date.now(), type:'text', label:'New Field', required:false, placeholder:'', help:'' }])
    setEditIdx(fields.length)
  }
  const updateField = (idx, patch) => setFields(f => f.map((x,i) => i===idx ? {...x,...patch} : x))
  const moveField   = (idx, dir)   => setFields(f => { const a=[...f]; [a[idx],a[idx+dir]]=[a[idx+dir],a[idx]]; return a })
  const removeField = idx          => setFields(f => f.filter((_,i)=>i!==idx))

  const saveAs = (status) => {
    if (!formName.trim()) return alert('Enter a form name first.')
    setSaved({ name:formName, fields, status, savedAt: new Date().toISOString() })
  }

  return (
    <div style={{ display:'grid', gridTemplateColumns:'1fr 340px', gap:20, alignItems:'start' }}>
      {/* LEFT — canvas */}
      <div>
        <div style={{ background:'var(--t-surface)', border:'1px solid var(--t-line)', padding:'16px 18px', marginBottom:16 }}>
          <label style={labelSt}>Form Name</label>
          <input value={formName} onChange={e=>setFormName(e.target.value)} placeholder="e.g. Safety Certification Form" style={{ ...inputSt, fontSize:15, fontWeight:700 }} />
        </div>

        {fields.length === 0 && (
          <div style={{ border:'2px dashed var(--t-line)', padding:'40px 20px', textAlign:'center', color:'var(--t-text-muted)', fontSize:13 }}>
            No fields yet — click "Add Field" to start building
          </div>
        )}

        {fields.map((field, idx) => (
          <div key={field.id} style={{ background:'var(--t-surface)', border:`1px solid ${editIdx===idx?'var(--t-accent)':'var(--t-line)'}`, marginBottom:8 }}>
            <div style={{ display:'flex', alignItems:'center', gap:8, padding:'10px 14px', cursor:'pointer' }} onClick={() => setEditIdx(editIdx===idx?null:idx)}>
              <span style={{ fontSize:10, fontWeight:700, color:'var(--t-text-muted)', background:'var(--t-surface-2)', border:'1px solid var(--t-line)', padding:'2px 6px', borderRadius:3, letterSpacing:'.06em', textTransform:'uppercase' }}>{field.type}</span>
              <span style={{ flex:1, fontWeight:600, fontSize:13, color:'var(--t-text)' }}>{field.label || 'Untitled'}</span>
              {field.required && <span style={{ fontSize:10, color:'var(--t-danger)', fontWeight:700 }}>Required</span>}
              <div style={{ display:'flex', gap:4 }}>
                {idx > 0 && <button onClick={e=>{e.stopPropagation();moveField(idx,-1)}} style={arrowBtn}>↑</button>}
                {idx < fields.length-1 && <button onClick={e=>{e.stopPropagation();moveField(idx,1)}} style={arrowBtn}>↓</button>}
                <button onClick={e=>{e.stopPropagation();removeField(idx)}} style={{ ...arrowBtn, color:'var(--t-danger)' }}>×</button>
              </div>
            </div>
            {editIdx === idx && (
              <div style={{ padding:'0 14px 14px', borderTop:'1px solid var(--t-line)' }}>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginTop:12 }}>
                  <div><label style={labelSt}>Field Type</label>
                    <select value={field.type} onChange={e=>updateField(idx,{type:e.target.value})} style={inputSt}>
                      {FIELD_TYPES.map(t=><option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div><label style={labelSt}>Label</label>
                    <input value={field.label} onChange={e=>updateField(idx,{label:e.target.value})} style={inputSt} />
                  </div>
                  <div><label style={labelSt}>Placeholder</label>
                    <input value={field.placeholder} onChange={e=>updateField(idx,{placeholder:e.target.value})} style={inputSt} />
                  </div>
                  <div><label style={labelSt}>Help Text</label>
                    <input value={field.help} onChange={e=>updateField(idx,{help:e.target.value})} style={inputSt} />
                  </div>
                </div>
                <label style={{ display:'flex', alignItems:'center', gap:8, marginTop:12, cursor:'pointer' }}>
                  <input type="checkbox" checked={field.required} onChange={e=>updateField(idx,{required:e.target.checked})} />
                  <span style={{ fontSize:13, color:'var(--t-text)', fontWeight:600 }}>Required field</span>
                </label>
              </div>
            )}
          </div>
        ))}

        <button onClick={addField} style={{ width:'100%', padding:'10px', marginTop:8, background:'none', border:'2px dashed var(--t-accent)', color:'var(--t-accent)', fontWeight:700, fontSize:13, cursor:'pointer' }}>
          + Add Field
        </button>

        <div style={{ display:'flex', gap:10, marginTop:16 }}>
          <button onClick={() => setPreview(p=>!p)} style={{ padding:'9px 18px', background:'var(--t-surface-2)', border:'1px solid var(--t-line)', color:'var(--t-text)', fontWeight:600, fontSize:13, cursor:'pointer' }}>
            {preview ? 'Hide Preview' : 'Preview'}
          </button>
          <button onClick={() => saveAs('draft')} style={{ padding:'9px 18px', background:'var(--t-surface)', border:'1px solid var(--t-line)', color:'var(--t-text)', fontWeight:600, fontSize:13, cursor:'pointer' }}>
            Save as Draft
          </button>
          <button onClick={() => saveAs('published')} style={{ flex:1, padding:'9px 0', background:'var(--t-accent)', color:'#000', border:'none', fontWeight:800, fontSize:13, cursor:'pointer' }}>
            Publish Form
          </button>
        </div>

        {saved && (
          <div style={{ marginTop:12, padding:'10px 14px', background:'rgba(0,229,255,.08)', border:'1px solid rgba(0,229,255,.3)', fontSize:12, color:'var(--t-accent)' }}>
            Form "{saved.name}" {saved.status === 'draft' ? 'saved as draft' : 'published'} · {fields.length} fields · {fmtDate(saved.savedAt)}
          </div>
        )}
      </div>

      {/* RIGHT — field properties + preview */}
      <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
        {/* Field type guide */}
        <div style={{ background:'var(--t-surface)', border:'1px solid var(--t-line)', padding:'14px 16px' }}>
          <div style={{ fontSize:11, fontWeight:700, color:'var(--t-text-muted)', textTransform:'uppercase', letterSpacing:'.08em', marginBottom:10 }}>Field Types</div>
          {FIELD_TYPES.map(t => (
            <div key={t} style={{ display:'flex', alignItems:'center', gap:8, padding:'5px 0', borderBottom:'1px solid var(--t-line)' }}>
              <span style={{ fontSize:11, fontWeight:700, color:'var(--t-accent)', width:80 }}>{t}</span>
              <span style={{ fontSize:11, color:'var(--t-text-faint)' }}>
                {t==='text'&&'Free text input'}{t==='number'&&'Numeric input'}{t==='date'&&'Date picker'}{t==='dropdown'&&'Select from list'}{t==='checkbox'&&'Yes/no toggle'}{t==='signature'&&'Digital signature'}{t==='file upload'&&'Attach files'}
              </span>
            </div>
          ))}
        </div>

        {/* Form stats */}
        <div style={{ background:'var(--t-surface)', border:'1px solid var(--t-line)', padding:'14px 16px' }}>
          <div style={{ fontSize:11, fontWeight:700, color:'var(--t-text-muted)', textTransform:'uppercase', letterSpacing:'.08em', marginBottom:10 }}>Form Summary</div>
          <div style={{ display:'flex', justifyContent:'space-between', padding:'6px 0', borderBottom:'1px solid var(--t-line)', fontSize:13 }}><span style={{ color:'var(--t-text-muted)' }}>Total fields</span><span style={{ fontWeight:700, color:'var(--t-text)' }}>{fields.length}</span></div>
          <div style={{ display:'flex', justifyContent:'space-between', padding:'6px 0', borderBottom:'1px solid var(--t-line)', fontSize:13 }}><span style={{ color:'var(--t-text-muted)' }}>Required</span><span style={{ fontWeight:700, color:'var(--t-danger)' }}>{fields.filter(f=>f.required).length}</span></div>
          <div style={{ display:'flex', justifyContent:'space-between', padding:'6px 0', fontSize:13 }}><span style={{ color:'var(--t-text-muted)' }}>Optional</span><span style={{ fontWeight:700, color:'var(--t-text-faint)' }}>{fields.filter(f=>!f.required).length}</span></div>
        </div>

        {/* Live preview */}
        {preview && fields.length > 0 && (
          <div style={{ background:'var(--t-surface)', border:'1px solid var(--t-line)', padding:'14px 16px' }}>
            <div style={{ fontSize:11, fontWeight:700, color:'var(--t-text-muted)', textTransform:'uppercase', letterSpacing:'.08em', marginBottom:14 }}>Preview</div>
            <div style={{ fontSize:15, fontWeight:800, color:'var(--t-text)', marginBottom:14 }}>{formName || 'Untitled Form'}</div>
            {fields.map((field,i) => (
              <div key={i} style={{ marginBottom:12 }}>
                <label style={{ display:'block', fontSize:12, fontWeight:700, color:'var(--t-text)', marginBottom:4 }}>
                  {field.label || 'Field'}{field.required && <span style={{ color:'var(--t-danger)', marginLeft:3 }}>*</span>}
                </label>
                {field.help && <div style={{ fontSize:11, color:'var(--t-text-faint)', marginBottom:4 }}>{field.help}</div>}
                {(field.type==='text'||field.type==='number'||field.type==='signature') && <input readOnly placeholder={field.placeholder||'—'} style={{ ...inputSt, opacity:.7, cursor:'not-allowed' }} />}
                {field.type==='date'      && <input type="date" readOnly style={{ ...inputSt, opacity:.7, cursor:'not-allowed' }} />}
                {field.type==='checkbox'  && <label style={{ display:'flex', gap:8, alignItems:'center', cursor:'not-allowed' }}><input type="checkbox" disabled /><span style={{ fontSize:12, color:'var(--t-text)' }}>{field.placeholder||field.label}</span></label>}
                {field.type==='dropdown'  && <select disabled style={{ ...inputSt, opacity:.7, cursor:'not-allowed' }}><option>— Select —</option></select>}
                {field.type==='file upload'&&<div style={{ ...inputSt, color:'var(--t-text-faint)', fontSize:12 }}>Choose file…</div>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

/* ── TIMESHEET TAB ───────────────────────────────────────────────────── */
function TimesheetTab({ entries, isHR, live, loading, locations = [] }) {
  const [tsSearch, setTsSearch]     = useState('')
  const [tsLocation, setTsLocation] = useState('All')
  const [tsDateFrom, setTsDateFrom] = useState('')
  const [tsDateTo, setTsDateTo]     = useState('')

  const filtered = entries.filter(row => {
    if (tsLocation !== 'All' && row.node_name !== tsLocation) return false
    if (tsDateFrom && row.work_date < tsDateFrom) return false
    if (tsDateTo   && row.work_date > tsDateTo)   return false
    if (tsSearch) {
      const q = tsSearch.toLowerCase()
      if (!row.full_name?.toLowerCase().includes(q) && !row.node_name?.toLowerCase().includes(q)) return false
    }
    return true
  })

  const totalHours  = filtered.reduce((acc, r) => acc + (parseFloat(r.hours_worked) || 0), 0)
  const uniqueEmp   = new Set(filtered.map(r => r.person_id)).size
  const avgHours    = filtered.length ? (totalHours / filtered.length).toFixed(2) : '0.00'
  const todayRows   = filtered.filter(r => r.work_date === todayStr()).length

  const [drill, setDrill] = useState(null)
  const TS_COLS = [
    { key: 'full_name', label: 'Employee', value: r => r.full_name || '—' },
    { key: 'node_name', label: 'Location', value: r => r.node_name || '—' },
    { key: 'work_date', label: 'Date', value: r => fmtDate(r.work_date), sortKey: r => r.work_date },
    { key: 'punched_in_at', label: 'Clock In', value: r => fmtTime(r.punched_in_at), sortKey: r => r.punched_in_at },
    { key: 'punched_out_at', label: 'Clock Out', value: r => (r.punched_out_at ? fmtTime(r.punched_out_at) : 'Still in'), sortKey: r => r.punched_out_at || '' },
    { key: 'hours_worked', label: 'Hours', value: r => fmtHours(r.hours_worked), align: 'right', sortKey: r => parseFloat(r.hours_worked) || 0 },
    { key: 'notes', label: 'Notes', value: r => r.notes || '—' },
  ]
  const openDrill = (title, rows, accent) => setDrill({ title, subtitle: `${rows.length} entr${rows.length === 1 ? 'y' : 'ies'}`, columns: TS_COLS, rows, accent })

  return (
    <div>
      {/* KPI row */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, marginBottom:18 }}>
        <KTile label="Total Hours"     value={totalHours.toFixed(1)} sub={`${filtered.length} punches`} color="var(--t-accent)"
          onClick={() => openDrill('Time Entries — Total Hours', filtered, 'var(--t-accent)')} />
        <KTile label="Employees"       value={uniqueEmp}             sub="in range"
          onClick={() => openDrill('Time Entries by Employee', filtered, 'var(--t-accent)')} />
        <KTile label="Avg Hrs / Punch" value={avgHours}              sub="per entry"
          onClick={() => openDrill('All Punches (Avg Hrs)', filtered, 'var(--t-accent)')} />
        <KTile label="Today"           value={todayRows}             sub="entries today" alert={todayRows===0?'amber':null}
          onClick={() => openDrill("Today's Entries", filtered.filter(r => r.work_date === todayStr()), 'var(--t-warn)')} />
      </div>

      {/* Filters */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr auto auto auto', gap:10, marginBottom:14, alignItems:'center' }}>
        <input
          value={tsSearch}
          onChange={e => setTsSearch(e.target.value)}
          placeholder="Search by name or location…"
          style={inputSt}
        />
        {isHR && (
          <select value={tsLocation} onChange={e => setTsLocation(e.target.value)} style={inputSt}>
            <option value="All">All Departments</option>
            {locations.map(l => <option key={l} value={l}>{l}</option>)}
          </select>
        )}
        <input type="date" value={tsDateFrom} onChange={e => setTsDateFrom(e.target.value)} style={inputSt} title="From date" />
        <input type="date" value={tsDateTo}   onChange={e => setTsDateTo(e.target.value)}   style={inputSt} title="To date" />
      </div>

      {loading ? (
        <div style={{ textAlign:'center', padding:'60px 20px', color:'var(--t-text-muted)', fontSize:14 }}>Loading time entries…</div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign:'center', padding:'60px 20px', color:'var(--t-text-muted)', fontSize:14 }}>No time entries found for selected range</div>
      ) : (
        <div style={{ border:'1px solid var(--t-line)' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
            <thead>
              <tr style={{ borderBottom:'1px solid var(--t-line)', background:'var(--t-surface)' }}>
                {(isHR ? ['Employee','Location','Date','Clock In','Clock Out','Hours','Notes'] : ['Date','Location','Clock In','Clock Out','Hours','Notes']).map(h => (
                  <th key={h} style={{ padding:'10px 14px', textAlign:'left', fontSize:11, fontWeight:700, color:'var(--t-text-muted)', textTransform:'uppercase', letterSpacing:'.06em', whiteSpace:'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((row, i) => (
                <tr key={row.id || i} style={{ borderBottom:'1px solid var(--t-line)', background:i%2===0?'transparent':'rgba(255,255,255,.02)' }}>
                  {isHR && <td style={{ padding:'10px 14px', fontWeight:600, color:'var(--t-text)' }}>{row.full_name || '—'}</td>}
                  {isHR && <td style={{ padding:'10px 14px', color:'var(--t-text-muted)', fontSize:12 }}>{row.node_name || '—'}</td>}
                  <td style={{ padding:'10px 14px', color:'var(--t-text)', fontSize:12, whiteSpace:'nowrap' }}>{fmtDate(row.work_date)}</td>
                  {!isHR && <td style={{ padding:'10px 14px', color:'var(--t-text-muted)', fontSize:12 }}>{row.node_name || '—'}</td>}
                  <td style={{ padding:'10px 14px', color:'var(--t-text-muted)', fontSize:12, whiteSpace:'nowrap' }}>{fmtTime(row.punched_in_at)}</td>
                  <td style={{ padding:'10px 14px', color:row.punched_out_at?'var(--t-text-muted)':'var(--t-warn)', fontSize:12, whiteSpace:'nowrap' }}>
                    {row.punched_out_at ? fmtTime(row.punched_out_at) : 'Still clocked in'}
                  </td>
                  <td style={{ padding:'10px 14px', fontWeight:700, color:parseFloat(row.hours_worked)>10?'var(--t-warn)':'var(--t-text)' }}>
                    {fmtHours(row.hours_worked)}
                  </td>
                  <td style={{ padding:'10px 14px', color:'var(--t-text-faint)', fontSize:12, maxWidth:160 }}>{row.notes || '—'}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ borderTop:'2px solid var(--t-line)', background:'var(--t-surface)' }}>
                <td colSpan={isHR ? 6 : 5} style={{ padding:'10px 14px', fontSize:12, fontWeight:700, color:'var(--t-text-muted)', textAlign:'right' }}>Total hours shown:</td>
                <td style={{ padding:'10px 14px', fontSize:13, fontWeight:800, color:'var(--t-accent)' }}>{totalHours.toFixed(2)}h</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      <DrillDown open={!!drill} onClose={() => setDrill(null)} {...(drill || {})} />
    </div>
  )
}

/* ── SHARED STYLES ───────────────────────────────────────────────────── */
const inputSt = { width:'100%', padding:'9px 11px', background:'var(--t-bg)', border:'1px solid var(--t-line)', color:'var(--t-text)', fontSize:13, outline:'none', boxSizing:'border-box' }
const labelSt = { display:'block', fontSize:11, fontWeight:700, color:'var(--t-text-muted)', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:5 }
const arrowBtn = { background:'none', border:'1px solid var(--t-line)', color:'var(--t-text-muted)', padding:'2px 6px', fontSize:12, cursor:'pointer', lineHeight:1.4 }
const TAB_BTN  = (active) => ({ padding:'8px 18px', background:'none', border:'none', borderBottom:`2px solid ${active?'var(--t-accent)':'transparent'}`, color:active?'var(--t-accent)':'var(--t-text-muted)', fontWeight:active?700:400, fontSize:13, cursor:'pointer', marginBottom:-1, letterSpacing:'.3px', whiteSpace:'nowrap' })

/* ── MAIN COMPONENT ──────────────────────────────────────────────────── */
export default function Forms() {
  const { session }            = useAuth()
  const { locationIds, nodes } = useScope()
  const LOCATIONS = useMemo(() => [...new Set((nodes || []).filter(n => n.node_type === 'department' || n.node_type === 'location').map(n => n.name))].sort(), [nodes])
  const person                 = session?.person || {}
  const role                   = (person.role_name || '').toLowerCase()
  const isHR                   = ['ceo','hr','manager','coo','admin','owner'].some(x => role.includes(x))
  const isAdmin                = /admin|owner|coo|ceo|cfo|president|chief/i.test(role)
  const myId                   = person.id || 'me'

  const [tab, setTab]            = useState('library')
  const [allSubs, setAllSubs]    = useState([])
  const [catalog, setCatalog]    = useState(null)   // null = loading
  const [loadError, setLoadError] = useState('')
  const [fillModal, setFill]     = useState(null)
  const [submitting, setSubm]    = useState(false)
  const [toast, setToast]        = useState('')
  const [filterStatus, setFS]    = useState('All')
  const [filterLoc, setFL]       = useState('All')
  const [search, setSearch]      = useState('')
  const [filterDate, setFD]      = useState('')
  const [expanded, setExpanded]  = useState(null)
  const [bulkSel, setBulkSel]    = useState(new Set())
  const [viewForm, setViewForm]  = useState(null)
  const [drill, setDrill]        = useState(null)

  /* ── TIME ENTRY STATE ─────────────────────────────────────────────── */
  const [timeEntries, setTimeEntries]   = useState([])
  const [tsLive, setTsLive]            = useState(false)
  const [tsLoading, setTsLoading]      = useState(false)

  const showToast = (msg) => { setToast(msg); setTimeout(()=>setToast(''),3000) }

  /* ── FETCH CATALOGUE + SUBMISSIONS (rows, never samples) ──────────── */
  useEffect(() => {
    let live = true
    sb.rpc('get_form_catalog').then(({ data, error }) => {
      if (!live) return
      if (error) { setLoadError(error.message); setCatalog([]); return }
      setCatalog(Array.isArray(data) ? data : [])
    })
    return () => { live = false }
  }, [])
  const reloadSubs = useCallback(() => {
    sb.rpc('get_form_submissions_v2', { p_node_ids: locationIds })
      .then(({ data, error }) => { if (error) setLoadError(error.message); setAllSubs(Array.isArray(data) ? data : []) })
  }, [JSON.stringify(locationIds)])
  useEffect(() => { reloadSubs() }, [reloadSubs])
  const FORM_CATALOG = catalog || []

  /* ── FETCH TIME ENTRIES (lazy — only when Timesheets tab active) ──── */
  useEffect(() => {
    if (tab !== 'timesheets') return

    const from = twoWeeksAgo()
    const to   = todayStr()

    setTsLoading(true)

    const fetchEntries = async () => {
      try {
        let data = null
        if (isHR) {
          // HR/managers see all entries for their locations
          const nodeIds = locationIds?.length ? locationIds : []
          const res = await sb.rpc('get_all_time_entries', {
            p_node_ids:  nodeIds,
            p_date_from: from,
            p_date_to:   to,
          })
          data = res?.data
        } else {
          // Employees see only their own entries
          const nodeIds = locationIds?.length ? locationIds : []
          const res = await sb.rpc('get_my_time_entries', {
            p_person_id:  myId,
            p_node_ids:   nodeIds,
            p_start_date: from,
            p_end_date:   to,
          })
          // Normalize get_my_time_entries shape to match display format
          if (res?.data?.length) {
            data = res.data.map(r => ({
              id:             r.id,
              person_id:      myId,
              full_name:      person.full_name || 'You',
              node_id:        r.node_id,
              node_name:      r.node_name,
              work_date:      r.work_date,
              punched_in_at:  r.punched_in_at,
              punched_out_at: r.punched_out_at,
              hours_worked:   r.hours_worked,
              notes:          r.notes || '',
            }))
          }
        }

        setTimeEntries(Array.isArray(data) ? data : [])
        setTsLive(true)
      } catch (e) {
        setTimeEntries([])
        setTsLive(false)
        setLoadError(e?.message || 'time entries unavailable')
      } finally {
        setTsLoading(false)
      }
    }

    fetchEntries()
  }, [tab, locationIds, myId, isHR])

  const mySubs = allSubs.filter(s => s.personId === myId)

  const allSubsFiltered = allSubs.filter(s => {
    if (filterStatus !== 'All' && s.status !== filterStatus) return false
    if (filterLoc    !== 'All' && s.location !== filterLoc)  return false
    if (viewForm && s.formId !== viewForm.id)                 return false
    if (search) {
      const q = search.toLowerCase()
      if (!s.personName?.toLowerCase().includes(q) && !s.formTitle?.toLowerCase().includes(q)) return false
    }
    if (filterDate && !s.submittedAt?.startsWith(filterDate)) return false
    return true
  })

  const mySubsFiltered = mySubs.filter(s => filterStatus==='All' || s.status===filterStatus)

  /* KPI calcs */
  const today0 = new Date().toISOString().split('T')[0]
  const pendingCount  = allSubs.filter(s=>s.status==='Pending').length
  const approvedMonth = allSubs.filter(s=>s.status==='Approved' && s.submittedAt?.slice(0,7)===today0.slice(0,7)).length
  const rejectedMonth = allSubs.filter(s=>s.status==='Rejected' && s.submittedAt?.slice(0,7)===today0.slice(0,7)).length
  const todayCount    = allSubs.filter(s=>s.submittedAt?.startsWith(today0)).length
  const popularForm   = (() => { const c={}; allSubs.forEach(s=>{c[s.formTitle]=(c[s.formTitle]||0)+1}); return Object.entries(c).sort((a,b)=>b[1]-a[1])[0]?.[0] || '—' })()

  const SUB_COLS = [
    { key: 'personName', label: 'Employee', value: s => s.personName },
    { key: 'formTitle', label: 'Form', value: s => s.formTitle },
    { key: 'category', label: 'Category', value: s => s.category },
    { key: 'location', label: 'Location', value: s => s.location },
    { key: 'status', label: 'Status', value: s => s.status },
    { key: 'submittedAt', label: 'Submitted', value: s => fmtDate(s.submittedAt), sortKey: s => s.submittedAt },
  ]
  const FORM_COLS = [
    { key: 'title', label: 'Form', value: f => f.title },
    { key: 'category', label: 'Category', value: f => f.category },
    { key: 'required', label: 'Required', value: f => (f.required ? 'Yes' : 'No') },
    { key: 'subs', label: 'Submissions', value: f => subsByForm(f.id), align: 'right', sortKey: f => subsByForm(f.id) },
  ]
  const openSubDrill = (title, rows, accent) => setDrill({ title, subtitle: `${rows.length} submission${rows.length === 1 ? '' : 's'}`, columns: SUB_COLS, rows, accent })

  const submitForm = async (fields) => {
    if (!fillModal) return
    setSubm(true)
    const { data, error } = await sb.rpc('submit_hr_form', { p_form_id: fillModal.id, p_data: fields, p_person_id: myId, p_node_id: locationIds?.[0] || null })
    setSubm(false)
    if (error || !data?.ok) { showToast(`Not saved — ${error?.message || data?.error || 'the form could not be recorded'}`); return }
    setFill(null)
    reloadSubs()
    showToast(`${fillModal.title} submitted — recorded as ${String(data.id).slice(0, 8)}`)
  }

  const updateStatus = (subId, newStatus) => {
    setAllSubs(prev => prev.map(s => s.id===subId ? {...s,status:newStatus} : s))
    sb.rpc('update_form_submission_status', { p_sub_id: subId, p_status: newStatus })
      .then(({ error }) => { if (error) showToast(`Not saved — ${error.message}`); reloadSubs() })
    showToast(`Submission marked: ${newStatus}`)
  }

  const bulkApprove = () => {
    bulkSel.forEach(id => updateStatus(id,'Approved'))
    setBulkSel(new Set())
    showToast(`${bulkSel.size} submissions approved`)
  }

  const subsByForm = (formId) => allSubs.filter(s=>s.formId===formId).length

  return (
    <div style={{ padding:'0 0 40px' }}>
      {/* KPI ROW */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(6,1fr)', gap:12, marginBottom:20 }}>
        <KTile label="Total Forms"        value={FORM_CATALOG.length}    sub="in catalog"
          onClick={() => setDrill({ title: 'Form Catalog', subtitle: `${FORM_CATALOG.length} forms`, columns: FORM_COLS, rows: FORM_CATALOG, accent: 'var(--t-accent)' })} />
        <KTile label="Pending Review"     value={pendingCount}           sub="awaiting action"   alert={pendingCount>5?'amber':null} color={pendingCount>5?'var(--t-warn)':undefined}
          onClick={() => openSubDrill('Pending Review', allSubs.filter(s=>s.status==='Pending'), 'var(--t-warn)')} />
        <KTile label="Approved This Mo."  value={approvedMonth}          sub="this month"        color="var(--t-success)"
          onClick={() => openSubDrill('Approved This Month', allSubs.filter(s=>s.status==='Approved' && s.submittedAt?.slice(0,7)===today0.slice(0,7)), 'var(--t-success)')} />
        <KTile label="Rejected This Mo."  value={rejectedMonth}          sub="this month"        color="var(--t-danger)"
          onClick={() => openSubDrill('Rejected This Month', allSubs.filter(s=>s.status==='Rejected' && s.submittedAt?.slice(0,7)===today0.slice(0,7)), 'var(--t-danger)')} />
        <KTile label="Submitted Today"    value={todayCount}             sub="across all forms"
          onClick={() => openSubDrill('Submitted Today', allSubs.filter(s=>s.submittedAt?.startsWith(today0)), 'var(--t-accent)')} />
        <KTile label="Most Popular"       value={popularForm.slice(0,12)+(popularForm.length>12?'…':'')} sub="most submissions" color="var(--t-accent)"
          onClick={() => openSubDrill(`Most Popular — ${popularForm}`, allSubs.filter(s=>s.formTitle===popularForm), 'var(--t-accent)')} />
      </div>

      {/* TABS */}
      <div style={{ display:'flex', gap:0, borderBottom:'1px solid var(--t-line)', marginBottom:20, alignItems:'center' }}>
        <div style={{ display:'flex', flex:1 }}>
          {[
            ['library',    'Form Library'],
            ['my',         'My Submissions'],
            ['timesheets', 'Timesheets'],
            ...(isHR    ? [['all',     'All Submissions']] : []),
            ...(isAdmin ? [['builder', 'Form Builder']]   : []),
          ].map(([key,label]) => (
            <button key={key} onClick={()=>{setTab(key);setViewForm(null)}} style={TAB_BTN(tab===key)}>{label}</button>
          ))}
        </div>
        {tab === 'timesheets' && (
          <div style={{ paddingRight:4, paddingBottom:4 }}>
            <DataBadge live={tsLive} />
          </div>
        )}
      </div>

      {/* ── TAB: FORM LIBRARY ─────────────────────────────────────────── */}
      {tab === 'library' && (
        <div>
          {viewForm && (
            <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:16, padding:'10px 14px', background:'var(--t-surface)', border:'1px solid var(--t-line)' }}>
              <span style={{ fontSize:16 }}>{viewForm.icon}</span>
              <span style={{ fontWeight:700, fontSize:14, color:'var(--t-text)' }}>Showing submissions for: {viewForm.title}</span>
              <button onClick={()=>setViewForm(null)} style={{ marginLeft:'auto', padding:'4px 12px', background:'none', border:'1px solid var(--t-line)', color:'var(--t-text-muted)', fontSize:12, cursor:'pointer' }}>Clear Filter</button>
            </div>
          )}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(240px,1fr))', gap:14 }}>
            {catalog === null && <div style={{ color:'var(--t-text-faint)', fontSize:12 }}>Reading the catalogue…</div>}
            {catalog !== null && FORM_CATALOG.length === 0 && <div style={{ color:'var(--t-text-faint)', fontSize:12 }}>No forms in the catalogue yet (hr.form_catalog). {loadError && `— ${loadError}`}</div>}
            {FORM_CATALOG.map(form => (
              <FormCard
                key={form.id}
                form={form}
                submissionCount={subsByForm(form.id)}
                isHR={isHR}
                onFillOut={f => setFill(f)}
                onViewSubmissions={f => { setViewForm(f); setTab('all') }}
              />
            ))}
          </div>
        </div>
      )}

      {/* ── TAB: MY SUBMISSIONS ───────────────────────────────────────── */}
      {tab === 'my' && (
        <div>
          <div style={{ display:'flex', gap:10, marginBottom:16, flexWrap:'wrap' }}>
            {['All',...STATUSES].map(s => (
              <button key={s} onClick={()=>setFS(s)} style={{ padding:'6px 14px', background:'none', border:`1px solid ${filterStatus===s?'var(--t-accent)':'var(--t-line)'}`, color:filterStatus===s?'var(--t-accent)':'var(--t-text-muted)', fontWeight:filterStatus===s?700:400, fontSize:12, cursor:'pointer' }}>{s}</button>
            ))}
          </div>
          {mySubsFiltered.length === 0 ? (
            <div style={{ textAlign:'center', padding:'60px 20px', color:'var(--t-text-muted)', fontSize:14 }}>No submissions found</div>
          ) : (
            <div style={{ border:'1px solid var(--t-line)' }}>
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
                <thead>
                  <tr style={{ borderBottom:'1px solid var(--t-line)', background:'var(--t-surface)' }}>
                    {['Form Name','Submitted','Status','HR Notes','Actions'].map(h => (
                      <th key={h} style={{ padding:'10px 14px', textAlign:'left', fontSize:11, fontWeight:700, color:'var(--t-text-muted)', textTransform:'uppercase', letterSpacing:'.06em', whiteSpace:'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {mySubsFiltered.map(sub => (
                    <>
                      <tr key={sub.id} style={{ borderBottom:'1px solid var(--t-line)', cursor:'pointer', background:expanded===sub.id?'var(--t-surface)':'transparent' }} onClick={()=>setExpanded(expanded===sub.id?null:sub.id)}>
                        <td style={{ padding:'11px 14px', fontWeight:600, color:'var(--t-text)' }}>{sub.formTitle}</td>
                        <td style={{ padding:'11px 14px', color:'var(--t-text-muted)', fontSize:12 }}>{fmtDate(sub.submittedAt)}</td>
                        <td style={{ padding:'11px 14px' }}><StatusBadge status={sub.status} /></td>
                        <td style={{ padding:'11px 14px', color:'var(--t-text-faint)', fontSize:12, maxWidth:200 }}>{sub.notes || '—'}</td>
                        <td style={{ padding:'11px 14px' }}>
                          <button onClick={e=>{e.stopPropagation();const d=`data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify(sub,null,2))}`;const a=document.createElement('a');a.href=d;a.download=`${sub.formTitle}-${sub.id}.json`;a.click()}}
                            style={{ padding:'4px 10px', background:'var(--t-surface-2)', border:'1px solid var(--t-line)', color:'var(--t-text)', fontSize:11, fontWeight:600, cursor:'pointer' }}>
                            Download
                          </button>
                        </td>
                      </tr>
                      {expanded === sub.id && (
                        <tr key={`${sub.id}-detail`}><td colSpan={5}><SubmissionDetail sub={sub} isHR={isHR} onUpdateStatus={updateStatus} /></td></tr>
                      )}
                    </>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── TAB: TIMESHEETS ───────────────────────────────────────────── */}
      {tab === 'timesheets' && (
        <TimesheetTab
          entries={timeEntries}
          isHR={isHR}
          live={tsLive}
          loading={tsLoading}
          locations={LOCATIONS}
        />
      )}

      {/* ── TAB: ALL SUBMISSIONS (HR) ─────────────────────────────────── */}
      {tab === 'all' && isHR && (
        <div>
          {/* Filter bar */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr auto auto auto auto', gap:10, marginBottom:16, alignItems:'center', flexWrap:'wrap' }}>
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search by name or form…" style={{ ...inputSt, maxWidth:'100%' }} />
            <select value={filterStatus} onChange={e=>setFS(e.target.value)} style={inputSt}>
              <option value="All">All Statuses</option>
              {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <select value={filterLoc} onChange={e=>setFL(e.target.value)} style={inputSt}>
              <option value="All">All Departments</option>
              {LOCATIONS.map(l => <option key={l} value={l}>{l}</option>)}
            </select>
            <input type="date" value={filterDate} onChange={e=>setFD(e.target.value)} style={inputSt} />
            {bulkSel.size > 0 && (
              <button onClick={bulkApprove} style={{ padding:'9px 16px', background:'var(--t-success)', color:'#fff', border:'none', fontWeight:700, fontSize:12, cursor:'pointer', whiteSpace:'nowrap' }}>
                Approve {bulkSel.size} Selected
              </button>
            )}
          </div>
          {viewForm && (
            <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:12, padding:'8px 14px', background:'var(--t-surface)', border:'1px solid var(--t-accent)', fontSize:12 }}>
              <span style={{ color:'var(--t-accent)', fontWeight:700 }}>Filtered to: {viewForm.title}</span>
              <button onClick={()=>setViewForm(null)} style={{ marginLeft:'auto', padding:'3px 10px', background:'none', border:'1px solid var(--t-line)', color:'var(--t-text-muted)', fontSize:11, cursor:'pointer' }}>Clear</button>
            </div>
          )}
          {allSubsFiltered.length === 0 ? (
            <div style={{ textAlign:'center', padding:'60px 20px', color:'var(--t-text-muted)', fontSize:14 }}>No submissions match filters</div>
          ) : (
            <div style={{ border:'1px solid var(--t-line)' }}>
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
                <thead>
                  <tr style={{ borderBottom:'1px solid var(--t-line)', background:'var(--t-surface)' }}>
                    <th style={{ padding:'10px 14px', width:36 }}>
                      <input type="checkbox" checked={bulkSel.size===allSubsFiltered.length && allSubsFiltered.length>0}
                        onChange={e => setBulkSel(e.target.checked ? new Set(allSubsFiltered.map(s=>s.id)) : new Set())} />
                    </th>
                    {['Employee','Form','Submitted','Location','Status','Actions'].map(h => (
                      <th key={h} style={{ padding:'10px 14px', textAlign:'left', fontSize:11, fontWeight:700, color:'var(--t-text-muted)', textTransform:'uppercase', letterSpacing:'.06em', whiteSpace:'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {allSubsFiltered.map(sub => (
                    <>
                      <tr key={sub.id} style={{ borderBottom:'1px solid var(--t-line)', background:expanded===sub.id?'var(--t-surface)':'transparent' }}>
                        <td style={{ padding:'10px 14px' }}>
                          <input type="checkbox" checked={bulkSel.has(sub.id)} onChange={e => { const s=new Set(bulkSel); e.target.checked?s.add(sub.id):s.delete(sub.id); setBulkSel(s) }} />
                        </td>
                        <td style={{ padding:'10px 14px', fontWeight:600, color:'var(--t-text)' }}>{sub.personName}</td>
                        <td style={{ padding:'10px 14px', color:'var(--t-text-muted)' }}>{sub.formTitle}</td>
                        <td style={{ padding:'10px 14px', color:'var(--t-text-faint)', fontSize:12 }}>{fmtDate(sub.submittedAt)}</td>
                        <td style={{ padding:'10px 14px', color:'var(--t-text-muted)' }}>{sub.location}</td>
                        <td style={{ padding:'10px 14px' }}><StatusBadge status={sub.status} /></td>
                        <td style={{ padding:'10px 14px' }}>
                          <div style={{ display:'flex', gap:6 }}>
                            <button onClick={()=>updateStatus(sub.id,'Approved')} style={{ padding:'4px 8px', background:'var(--t-success)', color:'#fff', border:'none', fontSize:11, fontWeight:700, cursor:'pointer' }}>✓</button>
                            <button onClick={()=>updateStatus(sub.id,'Rejected')} style={{ padding:'4px 8px', background:'var(--t-danger)', color:'#fff', border:'none', fontSize:11, fontWeight:700, cursor:'pointer' }}>✕</button>
                            <button onClick={()=>setExpanded(expanded===sub.id?null:sub.id)} style={{ padding:'4px 8px', background:'var(--t-surface-2)', border:'1px solid var(--t-line)', color:'var(--t-text-muted)', fontSize:11, cursor:'pointer' }}>
                              {expanded===sub.id?'▲':'▼'}
                            </button>
                          </div>
                        </td>
                      </tr>
                      {expanded === sub.id && (
                        <tr key={`${sub.id}-d`}><td colSpan={7}><SubmissionDetail sub={sub} isHR={isHR} onUpdateStatus={updateStatus} /></td></tr>
                      )}
                    </>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── TAB: FORM BUILDER (ADMIN) ─────────────────────────────────── */}
      {tab === 'builder' && isAdmin && <FormBuilder />}

      {/* ── FILL MODAL ────────────────────────────────────────────────── */}
      {fillModal && (
        <FormFillModal form={fillModal} onClose={()=>setFill(null)} onSubmit={submitForm} submitting={submitting} />
      )}

      {/* TOAST */}
      {toast && (
        <div style={{ position:'fixed', bottom:24, right:24, background:'var(--t-success)', color:'#fff', padding:'12px 20px', fontWeight:700, fontSize:13, zIndex:99999, boxShadow:'0 8px 24px rgba(0,0,0,.25)', animation:'fadeUp .25s ease' }}>
          {toast}
        </div>
      )}
      <style>{`@keyframes fadeUp{from{transform:translateY(12px);opacity:0}to{transform:translateY(0);opacity:1}}`}</style>

      <DrillDown open={!!drill} onClose={() => setDrill(null)} {...(drill || {})} />
    </div>
  )
}
