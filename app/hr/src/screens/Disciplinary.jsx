import { useState, useEffect, useCallback, useMemo } from 'react'
import { sb } from '../lib/supabase'
import { useScope } from '../lib/scope.jsx'
import { useAuth } from '../lib/auth.jsx'
import { useFeatureFlag } from '../lib/featureFlags.js'
import { useConfig } from '../lib/config.js'
import { companyName } from '../lib/config.js'

/* ── helpers ─────────────────────────────────────────────────── */
const fmt = (d) =>
  d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'

const today = () => new Date().toISOString().slice(0, 10)

const HR_ROLES = ['ceo', 'hr', 'manager', 'coo', 'admin', 'owner']
const isHRRole = (roleName = '') =>
  HR_ROLES.some((r) => roleName.toLowerCase().includes(r))

const DA_TYPES = [
  'Verbal Warning',
  'Written Warning',
  'Final Warning',
  'Suspension (Paid)',
  'Suspension (Unpaid)',
  'PIP',
  'Termination',
]

const TYPE_BADGE = {
  'Verbal Warning':      'badge blue',
  'Written Warning':     'badge amber',
  'Final Warning':       'badge red',
  'Suspension (Paid)':   'badge amber',
  'Suspension (Unpaid)': 'badge red',
  'PIP':                 'badge purple',
  'Termination':         'badge red',
}

const TYPE_BORDER = {
  'Verbal Warning':      'var(--t-accent)',
  'Written Warning':     'var(--t-warn)',
  'Final Warning':       'var(--t-danger)',
  'Suspension (Paid)':   'var(--t-warn)',
  'Suspension (Unpaid)': 'var(--t-danger)',
  'PIP':                 '#9b59b6',
  'Termination':         '#7f0000',
}

const POLICY_REF = {
  'Verbal Warning':      'Employee Handbook §4.1 — Progressive Discipline',
  'Written Warning':     'Employee Handbook §4.2 — Written Corrective Action',
  'Final Warning':       'Employee Handbook §4.3 — Final Warning Prior to Termination',
  'Suspension (Paid)':   'Employee Handbook §4.4a — Paid Suspension',
  'Suspension (Unpaid)': 'Employee Handbook §4.4b — Suspension Without Pay',
  'PIP':                 'Employee Handbook §5.1 — Performance Improvement Plan',
  'Termination':         'Employee Handbook §4.5 — Termination Procedures',
}

const AI_DRAFT = {
  'Verbal Warning': (name, reason) =>
    `This document serves as a formal verbal warning issued to ${name || 'the employee'} regarding the following matter: ${reason || '[reason]'}. This conversation was held to address the issue directly and provide an opportunity for immediate corrective action. The employee is expected to demonstrate sustained improvement. Failure to do so may result in further disciplinary measures up to and including written warning.`,
  'Written Warning': (name, reason) =>
    `This written warning is issued to ${name || 'the employee'} in accordance with ${companyName()} progressive discipline policy (§4.2). The specific concern is as follows: ${reason || '[reason]'}. This constitutes a formal written notice that continuation of this behavior or performance deficiency will result in escalated disciplinary action, including final warning or termination.`,
  'Final Warning': (name, reason) =>
    `This final written warning is issued to ${name || 'the employee'} and represents the last step in the progressive discipline process prior to termination. The matter at hand: ${reason || '[reason]'}. Any further violation or recurrence will result in immediate termination of employment. This document has been reviewed by HR and management.`,
  'Suspension (Paid)': (name, reason) =>
    `${name || 'The employee'} is hereby placed on a temporary paid suspension effective immediately, pending investigation related to: ${reason || '[reason]'}. During this period the employee is not authorized to be on company premises. This action is taken in accordance with §4.4a of the Employee Handbook.`,
  'Suspension (Unpaid)': (name, reason) =>
    `${name || 'The employee'} is hereby placed on a temporary suspension without pay effective immediately, as a disciplinary measure related to: ${reason || '[reason]'}. This action is taken in accordance with §4.4b of the Employee Handbook.`,
  'PIP': (name, reason) =>
    `This Performance Improvement Plan (PIP) is established for ${name || 'the employee'} to address the following performance concern: ${reason || '[reason]'}. The plan is effective for a period of 30 days. Progress reviews will be conducted weekly. Failure to meet the stated objectives may result in further disciplinary action up to and including termination.`,
  'Termination': (name, reason) =>
    `This document confirms the separation of ${name || 'the employee'} from ${companyName()}, effective on the date indicated herein. The basis for this decision is: ${reason || '[reason]'}. The employee's final paycheck, including all accrued and unused PTO where applicable under Massachusetts law, will be processed per the standard payroll schedule.`,
}



/* ── map a live get_disciplinary_actions row → the shape this screen renders ──
   The shared read RPC returns { id, person_name, da_type, da_date, description,
   issuer_name, policy_cited, node_id, status, created_at }. Resolve node_id → the
   location name via the session's node list, normalize the raw type token to the
   display label, and never invent values that aren't present. */
const TYPE_FROM_RAW = {
  verbal_warning:    'Verbal Warning',
  written_warning:   'Written Warning',
  final_warning:     'Final Warning',
  suspension_paid:   'Suspension (Paid)',
  suspension_unpaid: 'Suspension (Unpaid)',
  suspension:        'Suspension (Unpaid)',
  pip:               'PIP',
  termination:       'Termination',
}
function normalizeType(raw) {
  if (!raw) return 'Written Warning'
  if (DA_TYPES.includes(raw)) return raw
  const key = String(raw).toLowerCase().replace(/[\s-]+/g, '_')
  if (TYPE_FROM_RAW[key]) return TYPE_FROM_RAW[key]
  return String(raw).replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}
function mapDaRow(r, nodeNameById) {
  const status  = String(r.status || '').toLowerCase()
  const rawDate = r.da_date || r.issued_date || r.date || r.created_at || ''
  return {
    id:                r.id,
    person_id:         r.person_id || r.person_name || r.id,
    person_name:       r.person_name || '—',
    node_id:           r.node_id || null,
    node_name:         (r.node_id && nodeNameById.get(r.node_id)) || r.node_name || '—',
    type:              normalizeType(r.da_type || r.type),
    description:       r.description || '',
    corrective_action: r.corrective_action || '',
    consequences:      r.consequences || '',
    witnesses:         r.witnesses || r.witness || '',
    issued_by_name:    r.issuer_name || r.issued_by_name || '—',
    issued_date:       rawDate ? String(rawDate).slice(0, 10) : null,
    follow_up_date:    r.follow_up_date || null,
    status:            status === 'resolved' ? 'resolved' : 'open',
    acknowledged:      r.acknowledged === true,
    policy_ref:        r.policy_cited || '',
  }
}

const POLICY_OPTIONS = [
  'Attendance Policy',
  'Punctuality Policy',
  'Cash Handling Policy',
  'Customer Service Standards',
  'Dress Code Policy',
  'Cell Phone Policy',
  'Harassment & Discrimination Policy',
  'Loss Prevention Policy',
  'Social Media Policy',
  'General Conduct Policy',
]

const BEREAVEMENT_TEXT = `BEREAVEMENT POLICY: In the event of a death in the employee's immediate family (spouse, child, parent, sibling, grandparent, grandchild, parent-in-law, or domestic partner), employees are eligible for up to three (3) consecutive days of paid bereavement leave. Employees must notify their supervisor as soon as possible and may be required to provide documentation.`

/* ── blank form shapes ───────────────────────────────────────── */
const blankForm = () => ({
  person_id: '',
  type: 'Verbal Warning',
  issued_date: today(),
  follow_up_date: '',
  description: '',
  corrective_action: '',
  consequences: '',
  witnesses: '',
  notify_employee: true,
  require_ack: true,
  ai_note: '',
  policy_ref: POLICY_REF['Verbal Warning'],
  violated_policy: '',
})

const blankDAForm = () => ({
  employee: '',
  location: '',
  humanResources: '',
  incidentDate: today(),
  warningDate: today(),
  dateOfHire: '',
  position: '',
  infractions: {
    violationWorkRules: false, violationCompanyPolicy: false, violationSafetyRules: false,
    otherRuleViolation: false, excessiveAbsenteeism: false, excessiveTardiness: false,
    excessiveEarlyDeparture: false, otherAttendanceIssues: false,
    insubordination: false, substandartWork: false, other: false,
  },
  descriptionOfInfraction: '',
  commentsRecommendations: '',
  employeeComments: '',
  deliveryEmailed: true, deliveryTextSent: false, deliveryFaxed: false,
  deliveryPhoneCall: false, deliveryRefusedToSign: false,
  employeeSignature: '', employeeSignDate: today(),
  keyHolderSignature: '', keyHolderSignDate: today(),
})

/* ══════════════════════════════════════════════════════════════
   DA PRINTABLE FORM MODAL
══════════════════════════════════════════════════════════════ */
function DAFormModal({ onClose, prefill, employees, nodeId, issuedById, onSaved }) {
  const [da, setDa] = useState(() => {
    const base = blankDAForm()
    if (prefill) return { ...base, employee: prefill.employee||'', location: prefill.location||'', dateOfHire: prefill.dateOfHire||'', position: prefill.position||'' }
    return base
  })
  const [saving, setSaving] = useState(false)

  function setField(key, val) { setDa((p) => ({ ...p, [key]: val })) }
  function setInfraction(key, val) { setDa((p) => ({ ...p, infractions: { ...p.infractions, [key]: val } })) }

  async function saveToFile() {
    // A disciplinary record is a legal document — never claim it saved unless it did.
    // The old path called a non-existent RPC (save_da_form), swallowed the error, and
    // ALWAYS toasted success, silently discarding the record. Route through the same
    // proven create_disciplinary_action RPC the main form uses, and report honestly.
    const emp = employees.find(e =>
      (e.full_name || '').trim().toLowerCase() === (da.employee || '').trim().toLowerCase())
    if (!emp || !emp.id) {
      window.dispatchEvent(new CustomEvent('vip-toast', { detail: { msg: 'Not saved: select a known employee first (use PRINT / PDF for an off-roster copy).', type: 'error' } }))
      return
    }
    if (!nodeId) {
      window.dispatchEvent(new CustomEvent('vip-toast', { detail: { msg: 'Not saved: no location in scope. Use PRINT / PDF to keep a copy.', type: 'error' } }))
      return
    }
    const checked = Object.keys(da.infractions || {}).filter(k => da.infractions[k])
    const desc = [da.descriptionOfInfraction, checked.length ? ('Infractions: ' + checked.join(', ')) : '']
      .filter(Boolean).join('\n').trim() || 'Disciplinary action'
    setSaving(true)
    let err = null
    try {
      const { error } = await sb.rpc('create_disciplinary_action', {
        p_person_id:         emp.id,
        p_node_id:           nodeId,
        p_type:              'written_warning',
        p_description:       desc,
        p_corrective_action: da.commentsRecommendations || '',
        p_issued_by_id:      issuedById || null,
        p_follow_up_date:    null,
      })
      err = error
    } catch (e) { err = e || new Error('save failed') }
    setSaving(false)
    if (err) {
      console.error('[Disciplinary] create_disciplinary_action failed:', err.message || err)
      window.dispatchEvent(new CustomEvent('vip-toast', { detail: { msg: 'NOT saved — ' + (err.message || 'server error') + '. Use PRINT / PDF to keep a copy.', type: 'error' } }))
      return
    }
    import('../lib/audit.js').then(m => m.logAudit('Disciplinary Action Saved', { target: emp.full_name || emp.id, meta: { via: 'DA form' } })).catch(() => {})
    if (typeof onSaved === 'function') onSaved()
    window.dispatchEvent(new CustomEvent('vip-toast', { detail: { msg: "Saved to " + (emp.full_name || 'employee') + "'s record.", type: 'success' } }))
    onClose()
  }

  const inp = { background:'transparent', border:'none', borderBottom:'1px solid #000', outline:'none', fontSize:13, padding:'2px 4px', width:'100%', color:'#000', fontFamily:'Arial,sans-serif' }
  const lbl = { fontSize:11, fontWeight:700, color:'#000', fontFamily:'Arial,sans-serif', whiteSpace:'nowrap', marginRight:4 }
  const sh  = { fontSize:13, fontWeight:700, color:'#000', fontFamily:'Arial,sans-serif', borderBottom:'1px solid #000', paddingBottom:3, marginTop:14, marginBottom:8, textTransform:'uppercase' }
  const cb  = { display:'flex', alignItems:'center', gap:6, marginBottom:6, fontSize:12, color:'#000', fontFamily:'Arial,sans-serif' }

  return (
    <>
      <style>{`@media print { body * { visibility:hidden!important; } #da-printable,#da-printable *{ visibility:visible!important; } #da-printable{ position:fixed!important;top:0!important;left:0!important;width:100%!important;background:#fff!important;color:#000!important;padding:24px!important;z-index:999999!important; } .da-no-print{ display:none!important; } }`}</style>
      <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.75)', zIndex:9000, display:'flex', alignItems:'flex-start', justifyContent:'center', overflowY:'auto', padding:'24px 16px' }} onClick={onClose}>
        <div style={{ background:'var(--t-surface)', border:'1px solid var(--t-line)', width:'100%', maxWidth:780, position:'relative' }} onClick={(e) => e.stopPropagation()}>
          <div className="da-no-print" style={{ padding:'14px 20px', borderBottom:'1px solid var(--t-line)', display:'flex', alignItems:'center', justifyContent:'space-between', background:'var(--t-surface)' }}>
            <span style={{ fontSize:14, fontWeight:700, color:'var(--t-text)', letterSpacing:'0.04em' }}>GENERATE DISCIPLINARY ACTION FORM</span>
            <div style={{ display:'flex', gap:8, alignItems:'center' }}>
              <button onClick={() => window.print()} style={{ background:'rgba(0,229,255,0.1)', border:'1px solid var(--t-accent)', color:'var(--t-accent)', padding:'6px 14px', fontSize:12, fontWeight:700, cursor:'pointer', letterSpacing:'0.04em' }}>PRINT / PDF</button>
              <button onClick={saveToFile} disabled={saving} style={{ background:saving?'rgba(42,214,160,0.05)':'rgba(42,214,160,0.1)', border:'1px solid #2ad6a0', color:'#2ad6a0', padding:'6px 14px', fontSize:12, fontWeight:700, cursor:saving?'not-allowed':'pointer', opacity:saving?0.6:1, letterSpacing:'0.04em' }}>{saving?'SAVING…':'SAVE TO FILE'}</button>
              <button onClick={onClose} style={{ background:'none', border:'1px solid var(--t-line)', color:'var(--t-text-muted)', padding:'6px 12px', fontSize:12, cursor:'pointer' }}>CLOSE</button>
            </div>
          </div>
          <div id="da-printable" style={{ background:'#fff', color:'#000', padding:'28px 32px', fontFamily:'Arial,sans-serif' }}>
            <div style={{ textAlign:'center', fontSize:20, fontWeight:900, letterSpacing:'0.06em', color:'#000', marginBottom:4, textTransform:'uppercase', borderBottom:'3px solid #000', paddingBottom:8 }}>V.I.P Disciplinary Warning</div>
            <div style={{ textAlign:'center', fontSize:11, color:'#444', marginBottom:18, letterSpacing:'0.08em' }}>{companyName()} — Massachusetts</div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:16, marginBottom:12 }}>
              <div><div style={lbl}>Employee:</div><input style={inp} value={da.employee} onChange={(e)=>setField('employee',e.target.value)}/></div>
              <div><div style={lbl}>Location:</div><input style={inp} value={da.location} onChange={(e)=>setField('location',e.target.value)}/></div>
              <div><div style={lbl}>Human Resources:</div><input style={inp} value={da.humanResources} onChange={(e)=>setField('humanResources',e.target.value)}/></div>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr 1fr', gap:12, marginBottom:16 }}>
              <div><div style={lbl}>Incident Date:</div><input type="date" style={inp} value={da.incidentDate} onChange={(e)=>setField('incidentDate',e.target.value)}/></div>
              <div><div style={lbl}>Warning Date:</div><input type="date" style={inp} value={da.warningDate} onChange={(e)=>setField('warningDate',e.target.value)}/></div>
              <div><div style={lbl}>Date of Hire:</div><input type="date" style={inp} value={da.dateOfHire} onChange={(e)=>setField('dateOfHire',e.target.value)}/></div>
              <div><div style={lbl}>Position:</div><input style={inp} value={da.position} onChange={(e)=>setField('position',e.target.value)}/></div>
            </div>
            <div style={sh}>Nature Of Infraction</div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:0, marginBottom:14 }}>
              <div style={{ paddingRight:12, borderRight:'1px solid #ddd' }}>
                {[['violationWorkRules','Violation Of Work Rules'],['violationCompanyPolicy','Violation Of Company Policy'],['violationSafetyRules','Violation Of Safety Rules'],['otherRuleViolation','Other Rule Violation']].map(([k,l])=>(
                  <label key={k} style={cb}><input type="checkbox" checked={da.infractions[k]} onChange={(e)=>setInfraction(k,e.target.checked)} style={{ width:14,height:14,cursor:'pointer',accentColor:'#000' }}/>{l}</label>
                ))}
              </div>
              <div style={{ paddingLeft:16, paddingRight:12, borderRight:'1px solid #ddd' }}>
                {[['excessiveAbsenteeism','Excessive Absenteeism'],['excessiveTardiness','Excessive Tardiness'],['excessiveEarlyDeparture','Excessive Early Departure'],['otherAttendanceIssues','Other Attendance Issues']].map(([k,l])=>(
                  <label key={k} style={cb}><input type="checkbox" checked={da.infractions[k]} onChange={(e)=>setInfraction(k,e.target.checked)} style={{ width:14,height:14,cursor:'pointer',accentColor:'#000' }}/>{l}</label>
                ))}
              </div>
              <div style={{ paddingLeft:16 }}>
                {[['insubordination','Insubordination'],['substandartWork','Substandard Work'],['other','Other']].map(([k,l])=>(
                  <label key={k} style={cb}><input type="checkbox" checked={da.infractions[k]} onChange={(e)=>setInfraction(k,e.target.checked)} style={{ width:14,height:14,cursor:'pointer',accentColor:'#000' }}/>{l}</label>
                ))}
              </div>
            </div>
            <div style={sh}>Description Of Infraction:</div>
            {[...Array(4)].map((_,i)=>(
              <input key={i} style={{ ...inp, display:'block', marginBottom:10 }} value={i===0?da.descriptionOfInfraction:''} onChange={i===0?(e)=>setField('descriptionOfInfraction',e.target.value):undefined} placeholder={i===0?'Describe the infraction…':''}/>
            ))}
            <div style={sh}>Comment(s)/Recommendation(s)</div>
            {[...Array(6)].map((_,i)=>(
              <input key={i} style={{ ...inp, display:'block', marginBottom:10 }} value={i===0?da.commentsRecommendations:''} onChange={i===0?(e)=>setField('commentsRecommendations',e.target.value):undefined} placeholder={i===0?'Manager comments…':''}/>
            ))}
            <div style={sh}>Employees Comments:</div>
            {[...Array(3)].map((_,i)=>(
              <input key={i} style={{ ...inp, display:'block', marginBottom:10 }} value={i===0?da.employeeComments:''} onChange={i===0?(e)=>setField('employeeComments',e.target.value):undefined} placeholder={i===0?"Employee's statement…":''}/>
            ))}
            <div style={{ marginTop:20, paddingTop:14, borderTop:'2px solid #000' }}>
              <div style={{ fontSize:12, fontWeight:700, color:'#000', textAlign:'center', marginBottom:14, fontFamily:'Arial,sans-serif', fontStyle:'italic' }}>***I understand that a similar violation will be cause for future discipline up to and including termination***</div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr auto', gap:24, alignItems:'flex-end', marginBottom:12 }}>
                <div><div style={lbl}>Employee Signature:</div><input style={inp} value={da.employeeSignature} onChange={(e)=>setField('employeeSignature',e.target.value)}/></div>
                <div style={{ minWidth:140 }}><div style={lbl}>Date:</div><input type="date" style={{ ...inp, minWidth:130 }} value={da.employeeSignDate} onChange={(e)=>setField('employeeSignDate',e.target.value)}/></div>
              </div>
              <div style={{ display:'flex', gap:20, alignItems:'center', marginBottom:12, flexWrap:'wrap' }}>
                {[['deliveryEmailed','Emailed'],['deliveryTextSent','Text sent'],['deliveryFaxed','Faxed'],['deliveryPhoneCall','Phone Call'],['deliveryRefusedToSign','Employee Refused To Sign']].map(([k,l])=>(
                  <label key={k} style={{ ...cb, marginBottom:0 }}><input type="checkbox" checked={da[k]} onChange={(e)=>setField(k,e.target.checked)} style={{ width:14,height:14,cursor:'pointer',accentColor:'#000' }}/>{l}</label>
                ))}
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr auto', gap:24, alignItems:'flex-end', marginBottom:18 }}>
                <div><div style={lbl}>Key Holder Signature:</div><input style={inp} value={da.keyHolderSignature} onChange={(e)=>setField('keyHolderSignature',e.target.value)}/></div>
                <div style={{ minWidth:140 }}><div style={lbl}>Date:</div><input type="date" style={{ ...inp, minWidth:130 }} value={da.keyHolderSignDate} onChange={(e)=>setField('keyHolderSignDate',e.target.value)}/></div>
              </div>
              <div style={{ fontSize:9, color:'#555', lineHeight:1.5, borderTop:'1px solid #ccc', paddingTop:10, fontFamily:'Arial,sans-serif' }}>{BEREAVEMENT_TEXT}</div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

/* ══════════════════════════════════════════════════════════════
   DETAIL SIDE PANEL
══════════════════════════════════════════════════════════════ */
function DetailPanel({ row, allRecords, employees, isHR, onClose, onResolve, onGenerateDA }) {
  if (!row) return null
  const empHistory = allRecords.filter((r) => r.person_id === row.person_id).sort((a,b)=>new Date(b.issued_date)-new Date(a.issued_date))
  const emp = employees.find((e) => e.id === row.person_id)

  return (
    <div style={{ position:'fixed', top:0, right:0, bottom:0, width:420, background:'var(--t-surface)', borderLeft:'1px solid var(--t-line)', zIndex:8000, overflowY:'auto', display:'flex', flexDirection:'column' }}>
      {/* header */}
      <div style={{ padding:'14px 16px', borderBottom:'1px solid var(--t-line)', display:'flex', alignItems:'center', justifyContent:'space-between', background:'var(--t-surface-2)', flexShrink:0 }}>
        <span style={{ fontSize:13, fontWeight:700, color:'var(--t-text)', letterSpacing:'0.04em' }}>DA DETAIL</span>
        <button onClick={onClose} style={{ background:'none', border:'1px solid var(--t-line)', color:'var(--t-text-muted)', padding:'4px 10px', fontSize:12, cursor:'pointer' }}>✕</button>
      </div>

      <div style={{ padding:16, flex:1 }}>
        {/* type + severity stripe */}
        <div style={{ borderLeft:`4px solid ${TYPE_BORDER[row.type]||'var(--t-line)'}`, paddingLeft:12, marginBottom:16 }}>
          <div style={{ fontSize:11, color:'var(--t-text-muted)', letterSpacing:'0.06em', marginBottom:4 }}>TYPE</div>
          <span className={TYPE_BADGE[row.type]||'badge'}>{row.type}</span>
        </div>

        {/* employee info */}
        <div style={{ background:'var(--t-surface-2)', padding:12, marginBottom:14 }}>
          <div style={{ fontSize:11, color:'var(--t-accent)', letterSpacing:'0.06em', fontWeight:700, marginBottom:8 }}>EMPLOYEE</div>
          <div style={{ fontSize:15, fontWeight:700, color:'var(--t-text)', marginBottom:4 }}>{row.person_name}</div>
          <div style={{ fontSize:12, color:'var(--t-text-muted)' }}>{row.node_name} {emp ? `· ${emp.role_name}` : ''}</div>
          {emp && <div style={{ fontSize:11, color:'var(--t-text-faint)', marginTop:2 }}>Hired: {fmt(emp.hire_date)}</div>}
        </div>

        {/* DA details */}
        <div style={{ marginBottom:14 }}>
          <div style={{ fontSize:11, color:'var(--t-accent)', letterSpacing:'0.06em', fontWeight:700, marginBottom:8 }}>VIOLATION DESCRIPTION</div>
          <div style={{ fontSize:13, color:'var(--t-text)', lineHeight:1.6 }}>{row.description}</div>
        </div>

        {row.corrective_action && (
          <div style={{ marginBottom:14 }}>
            <div style={{ fontSize:11, color:'var(--t-accent)', letterSpacing:'0.06em', fontWeight:700, marginBottom:8 }}>CORRECTIVE ACTION</div>
            <div style={{ fontSize:13, color:'var(--t-text)', lineHeight:1.6 }}>{row.corrective_action}</div>
          </div>
        )}

        {row.consequences && (
          <div style={{ marginBottom:14 }}>
            <div style={{ fontSize:11, color:'var(--t-accent)', letterSpacing:'0.06em', fontWeight:700, marginBottom:8 }}>CONSEQUENCES IF NOT RESOLVED</div>
            <div style={{ fontSize:13, color:'var(--t-danger)', lineHeight:1.6 }}>{row.consequences}</div>
          </div>
        )}

        {/* metadata grid */}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:14 }}>
          {[
            ['Issued By', row.issued_by_name||'—'],
            ['Issued Date', fmt(row.issued_date)],
            ['Follow-Up Due', row.follow_up_date ? fmt(row.follow_up_date) : '—'],
            ['Acknowledged', row.acknowledged ? 'Yes' : 'Pending'],
            ['Status', row.status==='resolved'?'Resolved':'Active'],
            ['Witnesses', row.witnesses||'None listed'],
          ].map(([label, val]) => (
            <div key={label} style={{ background:'var(--t-surface-2)', padding:8 }}>
              <div style={{ fontSize:10, color:'var(--t-text-muted)', letterSpacing:'0.05em', marginBottom:2 }}>{label.toUpperCase()}</div>
              <div style={{ fontSize:12, color:'var(--t-text)', fontWeight:600 }}>{val}</div>
            </div>
          ))}
        </div>


        {/* full history for this employee */}
        <div style={{ marginBottom:14 }}>
          <div style={{ fontSize:11, color:'var(--t-accent)', letterSpacing:'0.06em', fontWeight:700, marginBottom:8 }}>FULL DA HISTORY — {row.person_name} ({empHistory.length} total)</div>
          <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
            {empHistory.map((h) => (
              <div key={h.id} style={{ display:'flex', alignItems:'flex-start', gap:8, padding:8, background:'var(--t-surface-2)', borderLeft:`3px solid ${TYPE_BORDER[h.type]||'var(--t-line)'}` }}>
                <div style={{ flex:1 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:3 }}>
                    <span className={TYPE_BADGE[h.type]||'badge'} style={{ fontSize:10 }}>{h.type}</span>
                    <span style={{ fontSize:10, color:'var(--t-text-faint)' }}>{fmt(h.issued_date)}</span>
                    {h.id === row.id && <span style={{ fontSize:10, color:'var(--t-accent)', fontWeight:700 }}>← THIS</span>}
                  </div>
                  <div style={{ fontSize:11, color:'var(--t-text-muted)', lineHeight:1.5 }}>{h.description?.slice(0,80)}{h.description?.length>80?'…':''}</div>
                </div>
                <span className={h.status==='resolved'?'badge green':'badge red'} style={{ fontSize:10, flexShrink:0 }}>{h.status==='resolved'?'Resolved':'Active'}</span>
              </div>
            ))}
          </div>
        </div>

        {/* actions */}
        {isHR && (
          <div style={{ display:'flex', flexDirection:'column', gap:8, marginTop:8 }}>
            <button onClick={() => onGenerateDA(row)} style={{ background:'rgba(0,229,255,0.08)', border:'1px solid var(--t-accent)', color:'var(--t-accent)', padding:'8px 14px', fontSize:13, fontWeight:700, cursor:'pointer', letterSpacing:'0.04em' }}>📋 Generate DA Form</button>
            {row.status !== 'resolved' && (
              <button onClick={() => onResolve(row.id)} style={{ background:'rgba(42,214,160,0.1)', border:'1px solid var(--t-success)', color:'var(--t-success)', padding:'8px 14px', fontSize:13, fontWeight:700, cursor:'pointer', letterSpacing:'0.04em' }}>✓ Mark Resolved</button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════
   MAIN COMPONENT
══════════════════════════════════════════════════════════════ */

/* ── progressive stage helpers ───────────────────────────── */
function getProgressiveStage(daCount, steps) {
  const idx = Math.min(daCount, steps.length - 1)
  return { step: idx, label: steps[idx] }
}

function stageBadgeClass(label = '') {
  const l = label.toLowerCase()
  if (l.includes('verbal') || l.includes('written')) return 'badge amber'
  if (l.includes('final')) return 'badge red'
  if (l.includes('suspension') || l.includes('terminat')) return 'badge red'
  return 'badge amber'
}

function stageBadgeStyle(label = '') {
  const l = label.toLowerCase()
  if (l.includes('terminat') || l.includes('suspension')) return { background:'#7f0000', color:'#fff', border:'none' }
  return {}
}

export default function Disciplinary() {
  const { locationIds, nodes } = useScope()
  const { session } = useAuth()
  const config = useConfig()
  const roleName = session?.person?.role_name || ''
  const personId = session?.person?.id
  const personName = session?.person?.full_name || ''
  const isHR = isHRRole(roleName)
  const trendsEnabled = useFeatureFlag('writeup_trends')
  const progEnabled = useFeatureFlag('progressive_discipline')
  const policyLinkEnabled = useFeatureFlag('policy_da_link')

  const progressiveSteps = useMemo(
    () => (config.progressive_steps || 'Verbal Warning,Written Warning,Final Written Warning,Suspension,Termination').split(','),
    [config.progressive_steps]
  )

  const [records, setRecords]         = useState([])
  const [employees, setEmployees]     = useState([])
  const [loading, setLoading]         = useState(true)
  const [loadError, setLoadError]     = useState(null)
  const [activeTab, setActiveTab]     = useState('all')
  const [detailRow, setDetailRow]     = useState(null)
  const [showModal, setShowModal]     = useState(false)
  const [showDAModal, setShowDAModal] = useState(false)
  const [daPrefill, setDaPrefill]     = useState(null)
  const [resolvingId, setResolvingId] = useState(null)

  /* filters (Tab 1) */
  const [filterLoc,    setFilterLoc]    = useState('All')
  const [filterType,   setFilterType]   = useState('All')
  const [filterStatus, setFilterStatus] = useState('All')
  const [filterDate,   setFilterDate]   = useState({ from:'', to:'' })
  const [search,       setSearch]       = useState('')
  const [sortBy,       setSortBy]       = useState('newest')

  /* create form (Tab 2) */
  const [form,      setForm]      = useState(blankForm)
  const [saving,    setSaving]    = useState(false)
  const [formError, setFormError] = useState(null)
  const [draftingAI, setDraftingAI] = useState(false)

  /* employee files (Tab 3) */
  const [empSort,  setEmpSort]  = useState('risk')
  const [expandedEmp, setExpandedEmp] = useState(null)

  /* ── load data ────────────────────────────────────────────── */
  const load = useCallback(() => {
    if (!locationIds.length) { setRecords([]); setLoading(false); return }
    setLoading(true)
    const nodeNameById = new Map((nodes || []).map(n => [n.id, n.name]))
    sb.rpc('get_disciplinary_actions', { p_node_ids: locationIds })
      .then(({ data, error }) => {
        if (error) {
          console.error('[Disciplinary] get_disciplinary_actions failed:', error.message || error)
          setRecords([]); setLoadError('The disciplinary service is temporarily unavailable.')
        } else {
          setLoadError(null)
          setRecords(Array.isArray(data) ? data.map(r => mapDaRow(r, nodeNameById)) : [])
        }
        setLoading(false)
      })
      .catch((e) => {
        console.error('[Disciplinary] get_disciplinary_actions error:', e)
        setRecords([]); setLoadError('The disciplinary service is temporarily unavailable.'); setLoading(false)
      })
  }, [locationIds.join(','), nodes])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (!locationIds.length) { setEmployees([]); return }
    sb.rpc('get_roster', { p_node_ids: locationIds })
      .then(({ data, error }) => setEmployees(!error && Array.isArray(data) ? data : []))
      .catch(() => setEmployees([]))
  }, [locationIds.join(',')])

  /* ── derived dates ────────────────────────────────────────── */
  const now = new Date()
  const yyyy = now.getFullYear()
  const mm   = String(now.getMonth()+1).padStart(2,'0')
  const thisMonthPfx  = `${yyyy}-${mm}`
  const thisQStart    = new Date(yyyy, Math.floor(now.getMonth()/3)*3, 1)
  const thisYearPfx   = `${yyyy}`
  const ninetyDaysAgo = new Date(now - 90*24*60*60*1000)

  /* ── KPI derivations ─────────────────────────────────────── */
  /* ── real location list (session nodes + any location present in records) ── */
  const locNames = useMemo(() => {
    const s = new Set()
    ;(nodes || []).forEach(n => { if ((n.node_type === 'location' || !n.node_type) && n.name) s.add(n.name) })
    records.forEach(r => { if (r.node_name && r.node_name !== '—') s.add(r.node_name) })
    return [...s].sort()
  }, [nodes, records])

  const kpi = useMemo(() => {
    const total       = records.length
    const open        = records.filter(r=>r.status==='open').length
    const resolved    = records.filter(r=>r.status==='resolved').length
    const thisMonth   = records.filter(r=>(r.issued_date||'').startsWith(thisMonthPfx)).length
    const thisQuarter = records.filter(r=>new Date(r.issued_date)>=thisQStart).length
    const thisYear    = records.filter(r=>(r.issued_date||'').startsWith(thisYearPfx)).length

    const verbal      = records.filter(r=>r.type==='Verbal Warning').length
    const written     = records.filter(r=>r.type==='Written Warning').length
    const final       = records.filter(r=>r.type==='Final Warning').length
    const suspensions = records.filter(r=>r.type==='Suspension (Paid)'||r.type==='Suspension (Unpaid)').length
    const pips        = records.filter(r=>r.type==='PIP'&&r.status==='open').length
    const terminations= records.filter(r=>r.type==='Termination').length

    /* repeat offenders: employees with 2+ DAs in last 90d */
    const recentByPerson = {}
    records.forEach(r => {
      if (new Date(r.issued_date) >= ninetyDaysAgo) {
        recentByPerson[r.person_id] = (recentByPerson[r.person_id]||0)+1
      }
    })
    const repeatOffenders = Object.values(recentByPerson).filter(c=>c>=2).length

    /* high risk: 2+ total open DAs or final warning/suspension/termination open */
    const openByPerson = {}
    records.filter(r=>r.status==='open').forEach(r => {
      openByPerson[r.person_id] = (openByPerson[r.person_id]||[])
      openByPerson[r.person_id].push(r)
    })
    const highRisk = Object.values(openByPerson).filter(arr =>
      arr.length >= 2 || arr.some(r=>['Final Warning','Suspension (Unpaid)','Termination'].includes(r.type))
    ).length

    /* avg days to resolve */
    const resolved_records = records.filter(r=>r.status==='resolved'&&r.issued_date)
    const avgDays = resolved_records.length
      ? Math.round(resolved_records.reduce((sum,r)=>{
          const diff = (new Date() - new Date(r.issued_date))/(1000*60*60*24)
          return sum + Math.min(diff, 30)
        },0) / resolved_records.length)
      : 0

    const overdue       = records.filter(r=>r.status==='open'&&r.follow_up_date&&new Date(r.follow_up_date)<now).length
    const pendingAck    = records.filter(r=>r.status==='open'&&!r.acknowledged).length
    const dueToday      = records.filter(r=>r.follow_up_date===today()&&r.status==='open').length

    const byLoc = locNames.map(loc => ({
      loc,
      open:       records.filter(r=>r.node_name===loc&&r.status==='open').length,
      thisMonth:  records.filter(r=>r.node_name===loc&&(r.issued_date||'').startsWith(thisMonthPfx)).length,
      total:      records.filter(r=>r.node_name===loc).length,
      repeatRate: (() => {
        const locRecent = {}
        records.filter(r=>r.node_name===loc&&new Date(r.issued_date)>=ninetyDaysAgo).forEach(r=>{
          locRecent[r.person_id]=(locRecent[r.person_id]||0)+1
        })
        const repeats = Object.values(locRecent).filter(c=>c>=2).length
        const uniq    = Object.keys(locRecent).length
        return uniq ? `${Math.round((repeats/uniq)*100)}%` : '0%'
      })(),
    }))

    return { total, open, resolved, thisMonth, thisQuarter, thisYear, verbal, written, final, suspensions, pips, terminations, repeatOffenders, highRisk, avgDays, overdue, pendingAck, dueToday, byLoc }
  }, [records, locNames])

  /* ── filtered + sorted records (Tab 1) ───────────────────── */
  const displayed = useMemo(() => {
    let rows = records.filter(r => {
      if (filterLoc    !== 'All' && r.node_name !== filterLoc)   return false
      if (filterType   !== 'All' && r.type !== filterType)        return false
      if (filterStatus === 'open'         && r.status !== 'open') return false
      if (filterStatus === 'resolved'     && r.status !== 'resolved') return false
      if (filterStatus === 'pending-ack'  && (r.acknowledged || r.status==='resolved')) return false
      if (filterDate.from && r.issued_date < filterDate.from)     return false
      if (filterDate.to   && r.issued_date > filterDate.to)       return false
      if (search && !r.person_name?.toLowerCase().includes(search.toLowerCase())) return false
      return true
    })
    rows = [...rows].sort((a,b) => {
      if (sortBy==='newest')   return new Date(b.issued_date)-new Date(a.issued_date)
      if (sortBy==='oldest')   return new Date(a.issued_date)-new Date(b.issued_date)
      if (sortBy==='employee') return (a.person_name||'').localeCompare(b.person_name||'')
      if (sortBy==='severity') {
        const sev = {'Termination':6,'Final Warning':5,'Suspension (Unpaid)':4,'Suspension (Paid)':3,'PIP':2,'Written Warning':1,'Verbal Warning':0}
        return (sev[b.type]||0)-(sev[a.type]||0)
      }
      return 0
    })
    return rows
  }, [records, filterLoc, filterType, filterStatus, filterDate, search, sortBy])

  /* ── employee file cards (Tab 3) ─────────────────────────── */
  const empCards = useMemo(() => {
    const empSet = {}
    records.forEach(r => {
      if (!empSet[r.person_id]) {
        empSet[r.person_id] = { person_id:r.person_id, person_name:r.person_name, node_name:r.node_name, das:[] }
      }
      empSet[r.person_id].das.push(r)
    })
    return Object.values(empSet).map(emp => {
      const open  = emp.das.filter(d=>d.status==='open').length
      const types = emp.das.map(d=>d.type)
      const hasTermination = types.includes('Termination')
      const hasFinal       = types.includes('Final Warning')
      const hasSuspension  = types.includes('Suspension (Unpaid)')||types.includes('Suspension (Paid)')
      let risk = 'low'
      if (hasTermination || emp.das.length >= 3) risk = 'critical'
      else if (hasFinal || hasSuspension || emp.das.length === 2) risk = 'high'
      else if (emp.das.length === 1) risk = 'medium'
      const lastDA = emp.das.sort((a,b)=>new Date(b.issued_date)-new Date(a.issued_date))[0]
      return { ...emp, open, risk, lastDA, total: emp.das.length }
    }).sort((a,b) => {
      if (empSort === 'risk') {
        const rv = {critical:3,high:2,medium:1,low:0}
        return (rv[b.risk]||0)-(rv[a.risk]||0)
      }
      if (empSort === 'name')   return (a.person_name||'').localeCompare(b.person_name||'')
      if (empSort === 'lastda') return new Date(b.lastDA?.issued_date||0)-new Date(a.lastDA?.issued_date||0)
      return 0
    })
  }, [records, empSort])

  /* ── resolve DA ───────────────────────────────────────────── */
  async function resolveDA(id) {
    if (!window.confirm('Resolve this disciplinary action? This cannot be undone.')) return
    setResolvingId(id)
    let err = null
    try {
      const { error } = await sb.rpc('resolve_disciplinary_action', { p_da_id: id, p_resolution_notes: 'Marked resolved by manager.', p_manager_id: personId })
      err = error
    } catch (e) { err = e || new Error('resolve failed') }
    setResolvingId(null)
    if (err) {
      console.error('[Disciplinary] resolve_disciplinary_action failed:', err.message || err)
      window.dispatchEvent(new CustomEvent('vip-toast', { detail: { msg: 'Not resolved — ' + (err.message || 'server error') + '.', type: 'error' } }))
      return
    }
    setRecords(prev => prev.map(r => r.id === id ? { ...r, status: 'resolved' } : r))
    if (detailRow?.id === id) setDetailRow(prev => ({ ...prev, status: 'resolved' }))
  }

  /* ── open DA modal ────────────────────────────────────────── */
  function openDAModal(row) {
    if (row) {
      const emp = employees.find(e=>e.id===row.person_id)
      setDaPrefill({ employee:row.person_name||'', location:row.node_name||'', dateOfHire:emp?.hire_date||'', position:emp?.role_name||'' })
    } else {
      setDaPrefill(null)
    }
    setShowDAModal(true)
  }

  /* ── form helpers ─────────────────────────────────────────── */
  function setType(t) {
    setForm(f=>({...f, type:t, policy_ref:POLICY_REF[t]||'', ai_note:''}))
  }

  function generateAIDraft() {
    const emp = employees.find(e => e.id === form.person_id)
    const name = emp?.full_name || ''
    const fn = AI_DRAFT[form.type]
    if (!fn) return
    setDraftingAI(true)
    setForm(f => ({ ...f, ai_note: fn(name, f.description) }))
    setDraftingAI(false)
  }

  async function submitDA() {
    if (!form.person_id) { setFormError('Select an employee.'); return }
    if (!form.description.trim()) { setFormError('Violation description is required.'); return }
    const emp = employees.find(e => (e.id || e.person_id) === form.person_id)
    const nodeIdByName = new Map((nodes || []).map(n => [n.name, n.id]))
    const nodeId = emp?.node_id || nodeIdByName.get(emp?.node_name) || locationIds?.[0] || null
    if (!nodeId) { setFormError('No location in scope to attach this record to.'); return }
    setSaving(true); setFormError(null)
    let err = null
    try {
      const { error } = await sb.rpc('create_disciplinary_action', {
        p_person_id:         form.person_id,
        p_node_id:           nodeId,
        p_type:              form.type,
        p_description:       form.description,
        p_corrective_action: form.corrective_action,
        p_issued_by_id:      personId || null,
        p_follow_up_date:    form.follow_up_date || null,
      })
      err = error
    } catch (e) { err = e || new Error('save failed') }
    setSaving(false)
    if (err) {
      console.error('[Disciplinary] create_disciplinary_action failed:', err.message || err)
      setFormError('Not saved — ' + (err.message || 'server error') + '.')
      return
    }
    import('../lib/audit.js').then(m => m.logAudit('Disciplinary Action Issued', { target: emp?.full_name || form.person_id, meta: { type: form.type } })).catch(() => {})
    window.dispatchEvent(new CustomEvent('vip-toast', { detail: { msg: 'Disciplinary action saved to ' + (emp?.full_name || 'employee') + "'s record.", type: 'success' } }))
    setForm(blankForm())
    load()
    setActiveTab('all')
  }

  /* ── CSV export ───────────────────────────────────────────── */
  function exportDAsToCSV(das) {
    const rows = [
      ['Employee', 'Location', 'Type', 'Severity', 'Date', 'Status', 'Issued By'],
      ...das.map(da => [
        da.employee_name || da.emp_name || da.person_name || '',
        da.location || da.node_name || '',
        da.type || da.violation_type || '',
        da.severity || da.level || da.type || '',
        da.created_at ? new Date(da.created_at).toLocaleDateString() : (da.issued_date ? new Date(da.issued_date).toLocaleDateString() : ''),
        da.status || '',
        da.issued_by || da.manager_name || da.issued_by_name || '',
      ])
    ]
    const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = 'disciplinary-actions.csv'; a.click()
    URL.revokeObjectURL(url)
  }

  function exportCSV() {
    const cols = ['Employee','Location','Type','Description','Date','Issued By','Status','Follow-Up Due','Acknowledged']
    const rows = displayed.map(r=>[
      r.person_name||'',r.node_name||'',r.type||'',
      `"${(r.description||'').replace(/"/g,'""')}"`,
      r.issued_date||'',r.issued_by_name||'',r.status||'',
      r.follow_up_date||'',r.acknowledged?'Yes':'No',
    ])
    const csv=[cols.join(','),...rows.map(r=>r.join(','))].join('\n')
    const blob=new Blob([csv],{type:'text/csv'})
    const url=URL.createObjectURL(blob)
    const a=document.createElement('a');a.href=url;a.download=`disciplinary-${today()}.csv`;a.click()
    URL.revokeObjectURL(url)
  }

  /* ── shared select style ──────────────────────────────────── */
  const selStyle = { background:'var(--t-surface-2)', border:'1px solid var(--t-line)', color:'var(--t-text)', padding:'6px 10px', fontSize:13, minWidth:130 }
  const inputStyle = { background:'var(--t-surface-2)', border:'1px solid var(--t-line)', color:'var(--t-text)', padding:'6px 10px', fontSize:13, width:'100%', boxSizing:'border-box' }
  const taStyle = { ...inputStyle, resize:'vertical', fontFamily:'inherit', lineHeight:1.6 }
  const riskBadge = { critical:'badge red', high:'badge red', medium:'badge amber', low:'badge green' }
  const riskLabel = { critical:'Critical', high:'High', medium:'Medium', low:'Low' }

  /* ════════════════════════════════════════════════════════════
     RENDER
  ════════════════════════════════════════════════════════════ */
  return (
    <>
      {/* ── page header ─────────────────────────────────────── */}
      <div style={{ display:'flex', alignItems:'flex-end', justifyContent:'space-between', marginBottom:20, gap:16, flexWrap:'wrap' }}>
        <div>
          <div className="section-title" style={{ marginBottom:4 }}>Disciplinary Tracker</div>
          <div style={{ fontSize:13, color:'var(--t-text-muted)' }}>Warnings · write-ups · PIPs · terminations · employee risk files</div>
        </div>
        <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
          {isHR && (
            <button onClick={()=>openDAModal(null)} style={{ background:'rgba(0,229,255,0.08)', border:'1px solid var(--t-accent)', color:'var(--t-accent)', padding:'7px 14px', fontSize:13, fontWeight:700, cursor:'pointer', letterSpacing:'0.04em' }}>
              📋 Generate DA Form
            </button>
          )}
          {isHR && (
            <button className="btn-approve" onClick={()=>{ setForm(blankForm()); setFormError(null); setActiveTab('create') }}>
              + Issue Write-Up
            </button>
          )}
          <button onClick={exportCSV} style={{ background:'var(--t-surface-2)', border:'1px solid var(--t-line)', color:'var(--t-text-muted)', padding:'7px 12px', fontSize:12, cursor:'pointer' }}>
            Export CSV
          </button>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════
          FORENSIC KPI PANEL — always visible
      ════════════════════════════════════════════════════════ */}
      <div style={{ background:'var(--t-surface)', border:'1px solid var(--t-line)', marginBottom:20, padding:16 }}>
        <div style={{ fontSize:11, color:'var(--t-accent)', letterSpacing:'0.08em', fontWeight:700, marginBottom:12 }}>FORENSIC KPI PANEL</div>

        {/* Row 1 — Volume & Status */}
        <div style={{ fontSize:10, color:'var(--t-text-faint)', letterSpacing:'0.06em', marginBottom:6 }}>VOLUME &amp; STATUS</div>
        <div className="kpis" style={{ marginBottom:16 }}>
          {[
            ['Total DAs',       kpi.total,       ''],
            ['Open',            kpi.open,        kpi.open>0?'amber':''],
            ['Resolved',        kpi.resolved,    'green'],
            ['This Month',      kpi.thisMonth,   ''],
            ['This Quarter',    kpi.thisQuarter, ''],
            ['This Year',       kpi.thisYear,    ''],
          ].map(([label,val,color])=>(
            <div key={label} className="kpi">
              <div className="label">{label}</div>
              <div className={`val${color?' '+color:''}`}>{loading?'…':val}</div>
            </div>
          ))}
        </div>

        {/* Row 2 — By Type */}
        <div style={{ fontSize:10, color:'var(--t-text-faint)', letterSpacing:'0.06em', marginBottom:6 }}>BY TYPE</div>
        <div className="kpis" style={{ marginBottom:16 }}>
          {[
            ['Verbal Warnings', kpi.verbal,       ''],
            ['Written Warnings',kpi.written,      kpi.written>0?'amber':''],
            ['Final Warnings',  kpi.final,        kpi.final>0?'red':''],
            ['Suspensions',     kpi.suspensions,  kpi.suspensions>0?'red':''],
            ['PIPs Active',     kpi.pips,         kpi.pips>0?'amber':''],
            ['Terminations YTD',kpi.terminations, kpi.terminations>0?'red':''],
          ].map(([label,val,color])=>(
            <div key={label} className="kpi">
              <div className="label">{label}</div>
              <div className={`val${color?' '+color:''}`}>{loading?'…':val}</div>
            </div>
          ))}
        </div>

        {/* Row 3 — Compliance & Risk */}
        <div style={{ fontSize:10, color:'var(--t-text-faint)', letterSpacing:'0.06em', marginBottom:6 }}>COMPLIANCE &amp; RISK</div>
        <div className="kpis" style={{ marginBottom:16 }}>
          {[
            ['Repeat Offenders (90d)', kpi.repeatOffenders, kpi.repeatOffenders>0?'red':''],
            ['High-Risk Employees',    kpi.highRisk,        kpi.highRisk>0?'red':''],
            ['Avg Days to Resolve',    kpi.avgDays+'d',     ''],
            ['Overdue Follow-Ups',     kpi.overdue,         kpi.overdue>0?'red':''],
            ['Pending Acknowledgments',kpi.pendingAck,      kpi.pendingAck>0?'amber':''],
            ['Due for Follow-Up Today',kpi.dueToday,        kpi.dueToday>0?'amber':''],
          ].map(([label,val,color])=>(
            <div key={label} className="kpi">
              <div className="label">{label}</div>
              <div className={`val${color?' '+color:''}`}>{loading?'…':val}</div>
            </div>
          ))}
        </div>

        {/* Row 4 — Location Breakdown */}
        <div style={{ fontSize:10, color:'var(--t-text-faint)', letterSpacing:'0.06em', marginBottom:8 }}>LOCATION BREAKDOWN</div>
        <div style={{ overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
            <thead>
              <tr style={{ borderBottom:'1px solid var(--t-line)' }}>
                {['Location','Open DAs','This Month','Repeat Rate (90d)','Total DAs'].map(h=>(
                  <th key={h} style={{ textAlign:'left', padding:'6px 12px', fontSize:10, letterSpacing:'0.06em', color:'var(--t-text-muted)', fontWeight:700 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {kpi.byLoc.map((l,i)=>(
                <tr key={l.loc} style={{ borderBottom:i<3?'1px solid var(--t-line)':'none' }}>
                  <td style={{ padding:'7px 12px', fontWeight:600, color:'var(--t-text)' }}>{l.loc}</td>
                  <td style={{ padding:'7px 12px' }}><span className={l.open>0?'badge amber':'badge green'}>{l.open}</span></td>
                  <td style={{ padding:'7px 12px', color:'var(--t-text-muted)' }}>{l.thisMonth}</td>
                  <td style={{ padding:'7px 12px' }}><span className={parseInt(l.repeatRate)>20?'badge red':'badge green'}>{l.repeatRate}</span></td>
                  <td style={{ padding:'7px 12px', color:'var(--t-text-muted)' }}>{l.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── tab bar ─────────────────────────────────────────── */}
      <div style={{ display:'flex', gap:2, marginBottom:20, borderBottom:'1px solid var(--t-line)' }}>
        {[
          ['all','All DAs'],
          ['create','Create DA'],
          ['files','Employee Files'],
          ['reports','Reports'],
          ['trends','Trends'],
          ...(progEnabled ? [['progressive','Progressive']] : []),
        ].map(([id,label])=>(
          (!isHR && id==='create') ? null : (
          <button
            key={id}
            onClick={()=>setActiveTab(id)}
            style={{
              padding:'10px 18px', fontSize:13, fontWeight:600, cursor:'pointer', border:'none',
              background:'none', color: activeTab===id?'var(--t-accent)':'var(--t-text-muted)',
              borderBottom: activeTab===id?'2px solid var(--t-accent)':'2px solid transparent',
              letterSpacing:'0.04em',
            }}
          >{label}</button>
        )))}
      </div>

      {/* ══════════════════════════════════════════════════════
          TAB 1 — ALL DAs
      ════════════════════════════════════════════════════════ */}
      {activeTab==='all' && (
        <>
          {/* filter bar */}
          <div style={{ display:'flex', gap:8, alignItems:'center', marginBottom:14, flexWrap:'wrap' }}>
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search employee…" style={{ ...selStyle, minWidth:180 }}/>
            <select value={filterLoc}    onChange={e=>setFilterLoc(e.target.value)}    style={selStyle}>
              <option value="All">All Locations</option>
              {locNames.map(l=><option key={l} value={l}>{l}</option>)}
            </select>
            <select value={filterType}   onChange={e=>setFilterType(e.target.value)}   style={selStyle}>
              <option value="All">All Types</option>
              {DA_TYPES.map(t=><option key={t} value={t}>{t}</option>)}
            </select>
            <select value={filterStatus} onChange={e=>setFilterStatus(e.target.value)} style={selStyle}>
              <option value="All">All Statuses</option>
              <option value="open">Open</option>
              <option value="resolved">Resolved</option>
              <option value="pending-ack">Pending Ack</option>
            </select>
            <input type="date" value={filterDate.from} onChange={e=>setFilterDate(p=>({...p,from:e.target.value}))} style={{ ...selStyle, minWidth:130 }} title="From date"/>
            <input type="date" value={filterDate.to}   onChange={e=>setFilterDate(p=>({...p,to:e.target.value}))}   style={{ ...selStyle, minWidth:130 }} title="To date"/>
            <select value={sortBy} onChange={e=>setSortBy(e.target.value)} style={selStyle}>
              <option value="newest">Newest First</option>
              <option value="oldest">Oldest First</option>
              <option value="severity">By Severity</option>
              <option value="employee">By Employee</option>
            </select>
            <span style={{ marginLeft:'auto', fontSize:12, color:'var(--t-text-faint)' }}>{displayed.length} record{displayed.length!==1?'s':''}</span>
          </div>

          {loading && <div className="loader">Loading records…</div>}
          {!loading && loadError && (
            <div className="empty-state">
              <div style={{ fontSize:32, marginBottom:12, opacity:0.3 }}>⚠️</div>
              <div style={{ fontWeight:700, marginBottom:6 }}>Could not load records</div>
              <div style={{ fontSize:13, color:'var(--t-text-faint)' }}>{loadError}</div>
            </div>
          )}
          {!loading && !loadError && displayed.length===0 && (
            <div className="empty-state">
              <div style={{ fontSize:32, marginBottom:12, opacity:0.3 }}>📋</div>
              <div style={{ fontWeight:700, marginBottom:6 }}>No records found</div>
              <div style={{ fontSize:13, color:'var(--t-text-faint)' }}>Try adjusting your filters.</div>
            </div>
          )}

          {!loading && displayed.length>0 && (
            <div className="card" style={{ padding:0, overflow:'hidden' }}>
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
                <thead>
                  <tr style={{ background:'var(--t-surface-2)', borderBottom:'1px solid var(--t-line)' }}>
                    {['Employee','Location','Type','Issued By','Date','Status','Follow-Up Due','Actions'].map(h=>(
                      <th key={h} style={{ textAlign:'left', padding:'10px 12px', fontWeight:700, fontSize:11, letterSpacing:'0.06em', color:'var(--t-text-muted)', whiteSpace:'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {displayed.map((row,i)=>{
                    const isResolved = row.status==='resolved'
                    const isOverdue  = row.follow_up_date && new Date(row.follow_up_date)<now && !isResolved
                    return (
                      <tr key={row.id} style={{ borderBottom:i<displayed.length-1?'1px solid var(--t-line)':'none', borderLeft:`3px solid ${TYPE_BORDER[row.type]||'var(--t-line)'}`, opacity:isResolved?0.75:1, cursor:'pointer' }} onClick={()=>setDetailRow(row)}>
                        <td style={{ padding:'11px 12px', fontWeight:600, color:'var(--t-text)', whiteSpace:'nowrap' }}>
                          {row.person_name||'—'}
                          {!row.acknowledged&&!isResolved&&<span style={{ marginLeft:6, fontSize:10, color:'var(--t-warn)' }}>⚠ No Ack</span>}
                        </td>
                        <td style={{ padding:'11px 12px', color:'var(--t-text-muted)', whiteSpace:'nowrap' }}>{row.node_name||'—'}</td>
                        <td style={{ padding:'11px 12px', whiteSpace:'nowrap' }}><span className={TYPE_BADGE[row.type]||'badge'}>{row.type}</span></td>
                        <td style={{ padding:'11px 12px', color:'var(--t-text-muted)', whiteSpace:'nowrap' }}>{row.issued_by_name||'—'}</td>
                        <td style={{ padding:'11px 12px', color:'var(--t-text-muted)', whiteSpace:'nowrap' }}>{fmt(row.issued_date)}</td>
                        <td style={{ padding:'11px 12px', whiteSpace:'nowrap' }}><span className={isResolved?'badge green':'badge red'}>{isResolved?'Resolved':'Active'}</span></td>
                        <td style={{ padding:'11px 12px', whiteSpace:'nowrap', color:isOverdue?'var(--t-danger)':'var(--t-text-muted)' }}>
                          {row.follow_up_date ? fmt(row.follow_up_date) : '—'}
                          {isOverdue&&<span style={{ fontSize:10, marginLeft:4 }}>OVERDUE</span>}
                        </td>
                        <td style={{ padding:'11px 12px', whiteSpace:'nowrap' }} onClick={e=>e.stopPropagation()}>
                          <div style={{ display:'flex', gap:6 }}>
                            <button className="action-btn-sm" onClick={()=>setDetailRow(row)}>View</button>
                            {isHR && (
                              <button className="action-btn-sm" onClick={()=>openDAModal(row)} style={{ background:'rgba(0,229,255,0.07)', border:'1px solid var(--t-accent)', color:'var(--t-accent)', fontSize:11 }}>DA</button>
                            )}
                            {isHR && !isResolved && (
                              <button className="action-btn-sm" disabled={resolvingId===row.id} onClick={()=>resolveDA(row.id)} style={{ background:'var(--t-success)', color:'#fff', border:'none', opacity:resolvingId===row.id?0.6:1 }}>{resolvingId===row.id?'…':'Resolve'}</button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* ══════════════════════════════════════════════════════
          TAB 2 — CREATE DA
      ════════════════════════════════════════════════════════ */}
      {activeTab==='create' && isHR && (
        <div style={{ display:'grid', gridTemplateColumns:'1fr 380px', gap:20, alignItems:'start' }}>
          {/* left: form */}
          <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
            <div style={{ background:'var(--t-surface)', border:'1px solid var(--t-line)', padding:20 }}>
              <div style={{ fontSize:13, fontWeight:700, color:'var(--t-accent)', letterSpacing:'0.06em', marginBottom:16 }}>DISCIPLINARY ACTION FORM</div>

              {/* Employee */}
              <div style={{ marginBottom:12 }}>
                <div style={{ fontSize:11, color:'var(--t-text-muted)', marginBottom:5, fontWeight:600 }}>EMPLOYEE *</div>
                <select value={form.person_id} onChange={e=>setForm(f=>({...f,person_id:e.target.value}))} style={{ ...selStyle, width:'100%' }}>
                  <option value="">— Select employee —</option>
                  {employees.map(emp=><option key={emp.id||emp.person_id} value={emp.id||emp.person_id}>{emp.full_name} — {emp.node_name}</option>)}
                </select>
              </div>

              {/* DA Type */}
              <div style={{ marginBottom:12 }}>
                <div style={{ fontSize:11, color:'var(--t-text-muted)', marginBottom:5, fontWeight:600 }}>DA TYPE</div>
                <select value={form.type} onChange={e=>setType(e.target.value)} style={{ ...selStyle, width:'100%' }}>
                  {DA_TYPES.map(t=><option key={t} value={t}>{t}</option>)}
                </select>
              </div>

              {/* Enhancement 1 — Progressive Stage (flag: progressive_discipline) */}
              {progEnabled && form.person_id && (() => {
                const empDAs = records.filter(r => r.person_id === form.person_id)
                const emp = employees.find(e => e.id === form.person_id)
                const { label: curLabel } = getProgressiveStage(empDAs.length, progressiveSteps)
                const nextStage = getProgressiveStage(empDAs.length + 1, progressiveSteps)
                return (
                  <div style={{ marginBottom:12, background:'var(--t-surface-2)', border:'1px solid var(--t-line)', padding:12 }}>
                    <div style={{ fontSize:11, color:'var(--t-accent)', letterSpacing:'0.06em', fontWeight:700, marginBottom:8 }}>PROGRESSIVE DISCIPLINE STAGE</div>
                    <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:8 }}>
                      <span style={{ fontSize:13, color:'var(--t-text)' }}>
                        Progressive Stage for <strong>{emp?.full_name || '—'}</strong>:
                      </span>
                      <span
                        className={stageBadgeClass(curLabel)}
                        style={{ ...stageBadgeStyle(curLabel), fontSize:12 }}
                      >
                        Step {empDAs.length + 1} — {curLabel}
                      </span>
                    </div>
                    <div style={{ fontSize:12, color:'var(--t-text-muted)' }}>
                      Based on prior history ({empDAs.length} DA{empDAs.length !== 1 ? 's' : ''}), recommended action:{' '}
                      <strong style={{ color:'var(--t-text)' }}>{nextStage.label}</strong>
                    </div>
                  </div>
                )
              })()}

              {/* Enhancement 2 — Policy Link (flag: policy_da_link) */}
              {policyLinkEnabled && (
                <div style={{ marginBottom:12 }}>
                  <div style={{ fontSize:11, color:'var(--t-text-muted)', marginBottom:5, fontWeight:600 }}>VIOLATED POLICY</div>
                  <select
                    value={form.violated_policy}
                    onChange={e => setForm(f => ({ ...f, violated_policy: e.target.value }))}
                    style={{ ...selStyle, width:'100%' }}
                  >
                    <option value="">— Select policy (optional) —</option>
                    {POLICY_OPTIONS.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                  {form.violated_policy && (
                    <div style={{ marginTop:6, fontSize:11, color:'var(--t-text-muted)', fontStyle:'italic' }}>
                      Policy text will be referenced in the DA document.
                    </div>
                  )}
                </div>
              )}

              {/* Location (auto from employee, but allow override) */}
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:12 }}>
                <div>
                  <div style={{ fontSize:11, color:'var(--t-text-muted)', marginBottom:5, fontWeight:600 }}>ISSUED DATE</div>
                  <input type="date" value={form.issued_date} onChange={e=>setForm(f=>({...f,issued_date:e.target.value}))} style={inputStyle}/>
                </div>
                <div>
                  <div style={{ fontSize:11, color:'var(--t-text-muted)', marginBottom:5, fontWeight:600 }}>FOLLOW-UP DATE</div>
                  <input type="date" value={form.follow_up_date} onChange={e=>setForm(f=>({...f,follow_up_date:e.target.value}))} style={inputStyle}/>
                </div>
              </div>

              {/* Violation Description */}
              <div style={{ marginBottom:12 }}>
                <div style={{ fontSize:11, color:'var(--t-text-muted)', marginBottom:5, fontWeight:600 }}>VIOLATION DESCRIPTION *</div>
                <textarea rows={4} value={form.description} onChange={e=>setForm(f=>({...f,description:e.target.value}))} placeholder="Describe the violation in detail…" style={taStyle}/>
              </div>

              {/* Witnesses */}
              <div style={{ marginBottom:12 }}>
                <div style={{ fontSize:11, color:'var(--t-text-muted)', marginBottom:5, fontWeight:600 }}>WITNESSES</div>
                <input value={form.witnesses} onChange={e=>setForm(f=>({...f,witnesses:e.target.value}))} placeholder="Names of witnesses present (if any)" style={inputStyle}/>
              </div>

              {/* Corrective Action */}
              <div style={{ marginBottom:12 }}>
                <div style={{ fontSize:11, color:'var(--t-text-muted)', marginBottom:5, fontWeight:600 }}>CORRECTIVE ACTION</div>
                <textarea rows={3} value={form.corrective_action} onChange={e=>setForm(f=>({...f,corrective_action:e.target.value}))} placeholder="Steps the employee must take to correct the issue…" style={taStyle}/>
              </div>

              {/* Consequences */}
              <div style={{ marginBottom:12 }}>
                <div style={{ fontSize:11, color:'var(--t-text-muted)', marginBottom:5, fontWeight:600 }}>CONSEQUENCES IF NOT RESOLVED</div>
                <textarea rows={2} value={form.consequences} onChange={e=>setForm(f=>({...f,consequences:e.target.value}))} placeholder="e.g. Final warning, termination…" style={taStyle}/>
              </div>

              {/* Policy Ref */}
              <div style={{ marginBottom:12 }}>
                <div style={{ fontSize:11, color:'var(--t-text-muted)', marginBottom:5, fontWeight:600 }}>POLICY REFERENCE</div>
                <input value={form.policy_ref} onChange={e=>setForm(f=>({...f,policy_ref:e.target.value}))} style={inputStyle}/>
              </div>

              {/* AI Draft */}
              <div style={{ marginBottom:12 }}>
                <div style={{ fontSize:11, color:'var(--t-text-muted)', marginBottom:5, fontWeight:600 }}>PROFESSIONAL WRITE-UP NOTE (AI-ASSISTED)</div>
                <div style={{ display:'flex', gap:8, marginBottom:8 }}>
                  <button className="action-btn-sm" onClick={generateAIDraft} disabled={draftingAI} style={{ background:'rgba(0,229,255,0.12)', border:'1px solid var(--t-accent)', color:'var(--t-accent)', fontWeight:700 }}>{draftingAI?'Drafting…':'AI Draft'}</button>
                  {form.ai_note && <button className="action-btn-sm" onClick={()=>setForm(f=>({...f,ai_note:''}))} style={{ color:'var(--t-text-muted)' }}>Clear</button>}
                </div>
                <textarea rows={5} value={form.ai_note} onChange={e=>setForm(f=>({...f,ai_note:e.target.value}))} placeholder="Click 'AI Draft' to generate a professional write-up, or type manually…" style={{ ...taStyle, fontSize:12, lineHeight:1.6 }}/>
              </div>

              {/* Checkboxes */}
              <div style={{ display:'flex', gap:20, marginBottom:16 }}>
                <label style={{ display:'flex', alignItems:'center', gap:6, fontSize:13, color:'var(--t-text)', cursor:'pointer' }}>
                  <input type="checkbox" checked={form.notify_employee} onChange={e=>setForm(f=>({...f,notify_employee:e.target.checked}))} style={{ accentColor:'var(--t-accent)', width:14, height:14 }}/>
                  Notify employee
                </label>
                <label style={{ display:'flex', alignItems:'center', gap:6, fontSize:13, color:'var(--t-text)', cursor:'pointer' }}>
                  <input type="checkbox" checked={form.require_ack} onChange={e=>setForm(f=>({...f,require_ack:e.target.checked}))} style={{ accentColor:'var(--t-accent)', width:14, height:14 }}/>
                  Require acknowledgment
                </label>
              </div>

              <div style={{ fontSize:11, color:'var(--t-text-muted)', marginBottom:12 }}>
                Issued by: <strong style={{ color:'var(--t-text)' }}>{personName||'HR'}</strong>
              </div>

              {formError && <div style={{ color:'var(--t-danger)', fontSize:13, marginBottom:12 }}>{formError}</div>}

              <div style={{ display:'flex', gap:8 }}>
                <button className="btn-approve" onClick={submitDA} disabled={saving}>{saving?'Saving…':'Submit DA'}</button>
                <button className="action-btn-sm" onClick={()=>setForm(blankForm())} style={{ color:'var(--t-text-muted)' }}>Reset Form</button>
              </div>
            </div>
          </div>

          {/* right: live preview */}
          <div style={{ position:'sticky', top:20 }}>
            <div style={{ background:'var(--t-surface)', border:'1px solid var(--t-line)', padding:16 }}>
              <div style={{ fontSize:11, color:'var(--t-accent)', letterSpacing:'0.06em', fontWeight:700, marginBottom:12 }}>LIVE PREVIEW</div>
              <div style={{ background:'#fff', color:'#000', padding:20, fontFamily:'Arial,sans-serif', fontSize:12, lineHeight:1.7 }}>
                <div style={{ textAlign:'center', fontWeight:900, fontSize:14, textTransform:'uppercase', borderBottom:'2px solid #000', paddingBottom:6, marginBottom:10 }}>V.I.P. DISCIPLINARY ACTION</div>
                <div style={{ textAlign:'center', fontSize:10, color:'#555', marginBottom:12 }}>{companyName()} — Massachusetts</div>
                <div style={{ marginBottom:6 }}><strong>Employee:</strong> {employees.find(e=>e.id===form.person_id)?.full_name||'—'}</div>
                <div style={{ marginBottom:6 }}><strong>Location:</strong> {employees.find(e=>e.id===form.person_id)?.node_name||'—'}</div>
                <div style={{ marginBottom:6 }}><strong>Type:</strong> {form.type}</div>
                <div style={{ marginBottom:6 }}><strong>Date:</strong> {fmt(form.issued_date)}</div>
                {form.follow_up_date&&<div style={{ marginBottom:6 }}><strong>Follow-Up:</strong> {fmt(form.follow_up_date)}</div>}
                <div style={{ marginBottom:6 }}><strong>Issued By:</strong> {personName||'HR'}</div>
                {form.description&&<div style={{ marginBottom:6 }}><strong>Violation:</strong> {form.description}</div>}
                {form.corrective_action&&<div style={{ marginBottom:6 }}><strong>Corrective Action:</strong> {form.corrective_action}</div>}
                {form.consequences&&<div style={{ marginBottom:6, color:'#cc0000' }}><strong>Consequences:</strong> {form.consequences}</div>}
                {form.policy_ref&&<div style={{ marginBottom:6, fontSize:10, color:'#555' }}>{form.policy_ref}</div>}
                {form.ai_note&&(
                  <div style={{ marginTop:10, paddingTop:10, borderTop:'1px solid #ddd', fontSize:11, lineHeight:1.6 }}>{form.ai_note}</div>
                )}
                <div style={{ marginTop:14, paddingTop:10, borderTop:'1px solid #000' }}>
                  <div style={{ marginBottom:8, borderBottom:'1px solid #000', paddingBottom:4 }}>Employee Signature: ______________________ Date: __________</div>
                  <div style={{ marginBottom:8, borderBottom:'1px solid #000', paddingBottom:4 }}>Manager Signature: _______________________ Date: __________</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════
          TAB 3 — EMPLOYEE FILES
      ════════════════════════════════════════════════════════ */}
      {activeTab==='files' && (
        <>
          <div style={{ display:'flex', gap:10, alignItems:'center', marginBottom:16 }}>
            <div style={{ fontSize:13, color:'var(--t-text-muted)' }}>Sort by:</div>
            {[['risk','Risk Level'],['name','Name'],['lastda','Last DA']].map(([v,l])=>(
              <button key={v} onClick={()=>setEmpSort(v)} style={{ background:empSort===v?'rgba(0,229,255,0.1)':'var(--t-surface-2)', border:`1px solid ${empSort===v?'var(--t-accent)':'var(--t-line)'}`, color:empSort===v?'var(--t-accent)':'var(--t-text-muted)', padding:'5px 12px', fontSize:12, fontWeight:600, cursor:'pointer' }}>{l}</button>
            ))}
            <span style={{ marginLeft:'auto', fontSize:12, color:'var(--t-text-faint)' }}>{empCards.length} employees with DAs on record</span>
          </div>

          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(300px,1fr))', gap:12 }}>
            {empCards.map(emp=>(
              <div key={emp.person_id} style={{ background:'var(--t-surface)', border:'1px solid var(--t-line)', borderLeft:`4px solid ${emp.risk==='critical'?'var(--t-danger)':emp.risk==='high'?'#ff6b35':emp.risk==='medium'?'var(--t-warn)':'var(--t-success)'}` }}>
                <div style={{ padding:14, cursor:'pointer' }} onClick={()=>setExpandedEmp(expandedEmp===emp.person_id?null:emp.person_id)}>
                  <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:8 }}>
                    <div>
                      <div style={{ fontSize:14, fontWeight:700, color:'var(--t-text)', marginBottom:2 }}>{emp.person_name}</div>
                      <div style={{ fontSize:12, color:'var(--t-text-muted)' }}>{emp.node_name}</div>
                    </div>
                    <span className={riskBadge[emp.risk]}>{riskLabel[emp.risk]} Risk</span>
                  </div>
                  <div style={{ display:'flex', gap:16, fontSize:12 }}>
                    <div><span style={{ color:'var(--t-text-faint)' }}>Total DAs: </span><strong style={{ color:'var(--t-text)' }}>{emp.total}</strong></div>
                    <div><span style={{ color:'var(--t-text-faint)' }}>Open: </span><strong style={{ color:emp.open>0?'var(--t-danger)':'var(--t-success)' }}>{emp.open}</strong></div>
                    <div><span style={{ color:'var(--t-text-faint)' }}>Last: </span><strong style={{ color:'var(--t-text)' }}>{fmt(emp.lastDA?.issued_date)}</strong></div>
                  </div>
                  <div style={{ display:'flex', gap:4, flexWrap:'wrap', marginTop:8 }}>
                    {[...new Set(emp.das.map(d=>d.type))].map(t=>(
                      <span key={t} className={TYPE_BADGE[t]||'badge'} style={{ fontSize:10 }}>{t}</span>
                    ))}
                  </div>
                </div>

                {/* expanded timeline */}
                {expandedEmp===emp.person_id && (
                  <div style={{ borderTop:'1px solid var(--t-line)', padding:'12px 14px' }}>
                    <div style={{ fontSize:11, color:'var(--t-accent)', letterSpacing:'0.06em', fontWeight:700, marginBottom:10 }}>FULL DA TIMELINE</div>
                    <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                      {emp.das.sort((a,b)=>new Date(b.issued_date)-new Date(a.issued_date)).map(d=>(
                        <div key={d.id} style={{ display:'flex', gap:10, alignItems:'flex-start', padding:'8px 10px', background:'var(--t-surface-2)', borderLeft:`3px solid ${TYPE_BORDER[d.type]||'var(--t-line)'}`, cursor:'pointer' }} onClick={()=>{ setDetailRow(d); setActiveTab('all') }}>
                          <div style={{ flex:1 }}>
                            <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:3 }}>
                              <span className={TYPE_BADGE[d.type]||'badge'} style={{ fontSize:10 }}>{d.type}</span>
                              <span style={{ fontSize:10, color:'var(--t-text-faint)' }}>{fmt(d.issued_date)}</span>
                            </div>
                            <div style={{ fontSize:11, color:'var(--t-text-muted)', lineHeight:1.5 }}>{d.description?.slice(0,100)}{d.description?.length>100?'…':''}</div>
                          </div>
                          <span className={d.status==='resolved'?'badge green':'badge red'} style={{ fontSize:10, flexShrink:0 }}>{d.status==='resolved'?'Resolved':'Active'}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {/* ══════════════════════════════════════════════════════
          TAB 4 — REPORTS
      ════════════════════════════════════════════════════════ */}
      {activeTab==='reports' && (
        <div style={{ display:'flex', flexDirection:'column', gap:20 }}>
          {/* KPI summary */}
          <div style={{ background:'var(--t-surface)', border:'1px solid var(--t-line)', padding:16 }}>
            <div style={{ fontSize:11, color:'var(--t-accent)', letterSpacing:'0.06em', fontWeight:700, marginBottom:12 }}>KPI SUMMARY</div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(160px,1fr))', gap:10 }}>
              {[
                ['Total DAs on Record', kpi.total],['Currently Active', kpi.open],['Resolved', kpi.resolved],
                ['Issued This Month', kpi.thisMonth],['Issued This Year', kpi.thisYear],
                ['Repeat Offenders (90d)', kpi.repeatOffenders],['High-Risk Employees', kpi.highRisk],
                ['Overdue Follow-Ups', kpi.overdue],['Pending Acknowledgments', kpi.pendingAck],
              ].map(([label,val])=>(
                <div key={label} style={{ background:'var(--t-surface-2)', padding:10 }}>
                  <div style={{ fontSize:10, color:'var(--t-text-muted)', marginBottom:4 }}>{label.toUpperCase()}</div>
                  <div style={{ fontSize:22, fontWeight:700, color:'var(--t-text)' }}>{val}</div>
                </div>
              ))}
            </div>
          </div>

          {/* By-type bar chart (simulated) */}
          <div style={{ background:'var(--t-surface)', border:'1px solid var(--t-line)', padding:16 }}>
            <div style={{ fontSize:11, color:'var(--t-accent)', letterSpacing:'0.06em', fontWeight:700, marginBottom:12 }}>DAs BY TYPE</div>
            {DA_TYPES.map(t=>{
              const count = records.filter(r=>r.type===t).length
              const pct   = kpi.total ? Math.round((count/kpi.total)*100) : 0
              return (
                <div key={t} style={{ marginBottom:10 }}>
                  <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, marginBottom:4 }}>
                    <span style={{ color:'var(--t-text)' }}>{t}</span>
                    <span style={{ color:'var(--t-text-muted)' }}>{count} ({pct}%)</span>
                  </div>
                  <div style={{ background:'var(--t-surface-2)', height:8 }}>
                    <div style={{ background:TYPE_BORDER[t]||'var(--t-accent)', height:'100%', width:`${pct}%`, transition:'width 0.4s' }}/>
                  </div>
                </div>
              )
            })}
          </div>

          {/* By-location bar chart (simulated) */}
          <div style={{ background:'var(--t-surface)', border:'1px solid var(--t-line)', padding:16 }}>
            <div style={{ fontSize:11, color:'var(--t-accent)', letterSpacing:'0.06em', fontWeight:700, marginBottom:12 }}>DAs BY LOCATION</div>
            {kpi.byLoc.map(l=>{
              const pct = kpi.total ? Math.round((l.total/kpi.total)*100) : 0
              return (
                <div key={l.loc} style={{ marginBottom:10 }}>
                  <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, marginBottom:4 }}>
                    <span style={{ color:'var(--t-text)' }}>{l.loc}</span>
                    <span style={{ color:'var(--t-text-muted)' }}>{l.total} total · {l.open} open</span>
                  </div>
                  <div style={{ background:'var(--t-surface-2)', height:8 }}>
                    <div style={{ background:'var(--t-accent)', height:'100%', width:`${pct}%`, transition:'width 0.4s' }}/>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Monthly trend table */}
          <div style={{ background:'var(--t-surface)', border:'1px solid var(--t-line)', padding:16 }}>
            <div style={{ fontSize:11, color:'var(--t-accent)', letterSpacing:'0.06em', fontWeight:700, marginBottom:12 }}>MONTHLY TREND</div>
            <div style={{ overflowX:'auto' }}>
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                <thead>
                  <tr style={{ borderBottom:'1px solid var(--t-line)' }}>
                    {['Month','Total DAs','Verbal','Written','Final','Suspension','PIP','Termination'].map(h=>(
                      <th key={h} style={{ textAlign:'left', padding:'7px 12px', fontSize:10, letterSpacing:'0.06em', color:'var(--t-text-muted)', fontWeight:700 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[...Array(6)].map((_,i)=>{
                    const d = new Date(yyyy, now.getMonth()-i, 1)
                    const pfx = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`
                    const mo  = records.filter(r=>(r.issued_date||'').startsWith(pfx))
                    const label = d.toLocaleDateString('en-US',{month:'short',year:'numeric'})
                    return (
                      <tr key={pfx} style={{ borderBottom:i<5?'1px solid var(--t-line)':'none' }}>
                        <td style={{ padding:'7px 12px', fontWeight:600, color:'var(--t-text)' }}>{label}</td>
                        <td style={{ padding:'7px 12px', fontWeight:700, color:'var(--t-accent)' }}>{mo.length}</td>
                        {['Verbal Warning','Written Warning','Final Warning','Suspension (Paid)','PIP','Termination'].map(t=>(
                          <td key={t} style={{ padding:'7px 12px', color:'var(--t-text-muted)' }}>{mo.filter(r=>r.type===t||(t==='Suspension (Paid)'&&(r.type==='Suspension (Paid)'||r.type==='Suspension (Unpaid)'))).length}</td>
                        ))}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Repeat offender table */}
          <div style={{ background:'var(--t-surface)', border:'1px solid var(--t-line)', padding:16 }}>
            <div style={{ fontSize:11, color:'var(--t-accent)', letterSpacing:'0.06em', fontWeight:700, marginBottom:12 }}>REPEAT OFFENDERS</div>
            {(() => {
              const byPerson = {}
              records.forEach(r => {
                if (!byPerson[r.person_id]) byPerson[r.person_id] = { name:r.person_name, loc:r.node_name, das:[] }
                byPerson[r.person_id].das.push(r)
              })
              const repeats = Object.values(byPerson).filter(p=>p.das.length>=2).sort((a,b)=>b.das.length-a.das.length)
              if (!repeats.length) return <div style={{ fontSize:13, color:'var(--t-text-faint)' }}>No repeat offenders on record.</div>
              return (
                <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
                  <thead>
                    <tr style={{ borderBottom:'1px solid var(--t-line)' }}>
                      {['Employee','Location','Total DAs','Open','Types','Last DA'].map(h=>(
                        <th key={h} style={{ textAlign:'left', padding:'7px 12px', fontSize:10, letterSpacing:'0.06em', color:'var(--t-text-muted)', fontWeight:700 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {repeats.map((p,i)=>(
                      <tr key={p.name} style={{ borderBottom:i<repeats.length-1?'1px solid var(--t-line)':'none' }}>
                        <td style={{ padding:'8px 12px', fontWeight:600, color:'var(--t-text)' }}>{p.name}</td>
                        <td style={{ padding:'8px 12px', color:'var(--t-text-muted)' }}>{p.loc}</td>
                        <td style={{ padding:'8px 12px' }}><span className="badge red">{p.das.length}</span></td>
                        <td style={{ padding:'8px 12px', color:'var(--t-text-muted)' }}>{p.das.filter(d=>d.status==='open').length}</td>
                        <td style={{ padding:'8px 12px' }}>
                          <div style={{ display:'flex', gap:4, flexWrap:'wrap' }}>
                            {[...new Set(p.das.map(d=>d.type))].map(t=><span key={t} className={TYPE_BADGE[t]||'badge'} style={{ fontSize:10 }}>{t}</span>)}
                          </div>
                        </td>
                        <td style={{ padding:'8px 12px', color:'var(--t-text-muted)' }}>{fmt(p.das.sort((a,b)=>new Date(b.issued_date)-new Date(a.issued_date))[0]?.issued_date)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )
            })()}
          </div>

          {/* Resolution time table */}
          <div style={{ background:'var(--t-surface)', border:'1px solid var(--t-line)', padding:16 }}>
            <div style={{ fontSize:11, color:'var(--t-accent)', letterSpacing:'0.06em', fontWeight:700, marginBottom:12 }}>AVG RESOLUTION TIME BY TYPE</div>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
              <thead>
                <tr style={{ borderBottom:'1px solid var(--t-line)' }}>
                  {['DA Type','Total Resolved','Avg Days Open','Still Active'].map(h=>(
                    <th key={h} style={{ textAlign:'left', padding:'7px 12px', fontSize:10, letterSpacing:'0.06em', color:'var(--t-text-muted)', fontWeight:700 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {DA_TYPES.map((t,i)=>{
                  const all      = records.filter(r=>r.type===t)
                  const resolved = all.filter(r=>r.status==='resolved')
                  const active   = all.filter(r=>r.status==='open').length
                  const avgD     = resolved.length
                    ? Math.round(resolved.reduce((s,r)=>{
                        const diff=(new Date()-new Date(r.issued_date))/(1000*60*60*24)
                        return s+Math.min(diff,60)
                      },0)/resolved.length)
                    : '—'
                  return (
                    <tr key={t} style={{ borderBottom:i<DA_TYPES.length-1?'1px solid var(--t-line)':'none' }}>
                      <td style={{ padding:'8px 12px' }}><span className={TYPE_BADGE[t]||'badge'}>{t}</span></td>
                      <td style={{ padding:'8px 12px', color:'var(--t-text-muted)' }}>{resolved.length}</td>
                      <td style={{ padding:'8px 12px', color:'var(--t-text)' }}>{avgD}{typeof avgD==='number'?'d':''}</td>
                      <td style={{ padding:'8px 12px', color:active>0?'var(--t-warn)':'var(--t-text-muted)' }}>{active}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div style={{ display:'flex', justifyContent:'flex-end', gap:8 }}>
            <button onClick={()=>exportDAsToCSV(records)} style={{ background:'var(--t-surface-2)', border:'1px solid var(--t-line)', color:'var(--t-text-muted)', padding:'8px 18px', fontSize:13, fontWeight:700, cursor:'pointer', letterSpacing:'0.04em' }}>Export CSV</button>
            <button onClick={exportCSV} style={{ background:'rgba(0,229,255,0.08)', border:'1px solid var(--t-accent)', color:'var(--t-accent)', padding:'8px 18px', fontSize:13, fontWeight:700, cursor:'pointer', letterSpacing:'0.04em' }}>Export Full CSV</button>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════
          TAB 5 — TRENDS
      ════════════════════════════════════════════════════════ */}
      {activeTab==='trends' && (
        !trendsEnabled
          ? <div style={{ padding:24, color:'var(--t-text-muted)', fontSize:13 }}>Feature disabled — enable in Feature Toggles.</div>
          : (() => {
              /* real trend data derived from the live disciplinary records in scope */
              const in90 = records.filter(r => new Date(r.issued_date) >= ninetyDaysAgo)
              const total90 = in90.length
              const typeCount = {}
              in90.forEach(r => { typeCount[r.type] = (typeCount[r.type] || 0) + 1 })
              const commonType = Object.entries(typeCount).sort((a, b) => b[1] - a[1])[0]?.[0] || '—'
              const locCount = {}
              in90.forEach(r => { if (r.node_name && r.node_name !== '—') locCount[r.node_name] = (locCount[r.node_name] || 0) + 1 })
              const topLoc = Object.entries(locCount).sort((a, b) => b[1] - a[1])[0]?.[0] || '—'
              const avgResolve = kpi.avgDays ? kpi.avgDays + ' days' : '—'

              const mgrMap = {}
              in90.forEach(r => {
                const m = r.issued_by_name || '—'
                if (!mgrMap[m]) mgrMap[m] = { name: m, locs: new Set(), total: 0, open: 0, resolved: 0, last: null }
                const g = mgrMap[m]
                g.total++
                if (r.status === 'resolved') g.resolved++; else g.open++
                if (r.node_name && r.node_name !== '—') g.locs.add(r.node_name)
                if (!g.last || new Date(r.issued_date) > new Date(g.last)) g.last = r.issued_date
              })
              const mgrs = Object.values(mgrMap).map(g => ({
                ...g,
                loc: [...g.locs].join(', ') || '—',
                resolvePct: g.total ? Math.round((g.resolved / g.total) * 100) + '%' : '—',
              })).sort((a, b) => b.total - a.total)

              const d45 = new Date(now - 45 * 24 * 60 * 60 * 1000)
              const violations = DA_TYPES.map(t => {
                const count = in90.filter(r => r.type === t).length
                const recent = in90.filter(r => r.type === t && new Date(r.issued_date) >= d45).length
                const prior = count - recent
                const trend = recent > prior ? '↑' : recent < prior ? '↓' : '→'
                return { type: t, count, trend }
              }).filter(v => v.count > 0)
              const violTotal = violations.reduce((s, v) => s + v.count, 0)

              if (!total90) {
                return (
                  <div className="empty-state">
                    <div style={{ fontSize:32, marginBottom:12, opacity:0.3 }}>📈</div>
                    <div style={{ fontWeight:700, marginBottom:6 }}>No disciplinary activity in the last 90 days</div>
                    <div style={{ fontSize:13, color:'var(--t-text-faint)' }}>Trends populate automatically as records are logged.</div>
                  </div>
                )
              }

              return (
                <div style={{ display:'flex', flexDirection:'column', gap:20 }}>

                  {/* KPI row */}
                  <div style={{ display:'flex', flexWrap:'wrap', gap:10 }}>
                    {[
                      { label:'Total DAs — 90 Days',    val: total90,    color:'var(--t-text)' },
                      { label:'Most Common Type',        val: commonType, color:'var(--t-warn)' },
                      { label:'Highest Volume Location', val: topLoc,     color:'var(--t-accent)' },
                      { label:'Avg Days to Resolve',     val: avgResolve, color:'var(--t-text)' },
                    ].map(({ label, val, color }) => (
                      <div key={label} style={{ background:'var(--t-surface)', border:'1px solid var(--t-line)', padding:'12px 16px', flex:'1 1 160px' }}>
                        <div style={{ fontSize:10, fontWeight:700, letterSpacing:'.08em', color:'var(--t-text-muted)', textTransform:'uppercase', marginBottom:6 }}>{label}</div>
                        <div style={{ fontSize:22, fontWeight:800, color, lineHeight:1 }}>{val}</div>
                      </div>
                    ))}
                  </div>

                  {/* DAs by Issuer */}
                  <div style={{ background:'var(--t-surface)', border:'1px solid var(--t-line)', padding:16 }}>
                    <div style={{ fontSize:11, color:'var(--t-accent)', letterSpacing:'0.08em', fontWeight:700, marginBottom:12 }}>DAs BY ISSUER — Last 90 Days</div>
                    <div style={{ overflowX:'auto' }}>
                      <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                        <thead>
                          <tr style={{ background:'var(--t-surface-2)' }}>
                            {['Issued By','Location(s)','Total','Open','Resolved','Resolve %','Last DA'].map(h => (
                              <th key={h} style={{ padding:'8px 12px', textAlign:'left', fontWeight:700, color:'var(--t-text-muted)', borderBottom:'1px solid var(--t-line)', whiteSpace:'nowrap' }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {mgrs.map((m, i) => (
                            <tr key={m.name} style={{ borderBottom:i<mgrs.length-1?'1px solid var(--t-line)':'none', background: m.total>7?'rgba(255,77,77,0.10)':m.total<3?'rgba(29,233,182,0.05)':'transparent' }}>
                              <td style={{ padding:'8px 12px', fontWeight:600, color:'var(--t-text)' }}>{m.name}</td>
                              <td style={{ padding:'8px 12px', color:'var(--t-text-muted)' }}>{m.loc}</td>
                              <td style={{ padding:'8px 12px', fontWeight:700, color: m.total>7?'var(--t-danger)':m.total<3?'var(--t-success)':'var(--t-text)' }}>{m.total}</td>
                              <td style={{ padding:'8px 12px', color: m.open>0?'var(--t-warn)':'var(--t-text-muted)' }}>{m.open}</td>
                              <td style={{ padding:'8px 12px', color:'var(--t-text-muted)' }}>{m.resolved}</td>
                              <td style={{ padding:'8px 12px', color:'var(--t-text-muted)' }}>{m.resolvePct}</td>
                              <td style={{ padding:'8px 12px', color:'var(--t-text-muted)', whiteSpace:'nowrap' }}>{fmt(m.last)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div style={{ marginTop:10, fontSize:11, color:'var(--t-text-muted)', lineHeight:1.5 }}>
                      Issuers with &gt;7 DAs in 90 days are highlighted for review; fewer than 3 shows a green signal.
                    </div>
                  </div>

                  {/* DAs by Type */}
                  <div style={{ background:'var(--t-surface)', border:'1px solid var(--t-line)', padding:16 }}>
                    <div style={{ fontSize:11, color:'var(--t-accent)', letterSpacing:'0.08em', fontWeight:700, marginBottom:12 }}>DAs BY TYPE — Last 90 Days</div>
                    <div style={{ overflowX:'auto', marginBottom:20 }}>
                      <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                        <thead>
                          <tr style={{ background:'var(--t-surface-2)' }}>
                            {['Type','Count','% of Total','Trend (45d)'].map(h => (
                              <th key={h} style={{ padding:'8px 12px', textAlign:'left', fontWeight:700, color:'var(--t-text-muted)', borderBottom:'1px solid var(--t-line)', whiteSpace:'nowrap' }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {violations.map((v, i) => (
                            <tr key={v.type} style={{ borderBottom:i<violations.length-1?'1px solid var(--t-line)':'none' }}>
                              <td style={{ padding:'8px 12px' }}><span className={TYPE_BADGE[v.type]||'badge'}>{v.type}</span></td>
                              <td style={{ padding:'8px 12px', color:'var(--t-text)' }}>{v.count}</td>
                              <td style={{ padding:'8px 12px', color:'var(--t-text-muted)' }}>{violTotal?Math.round(v.count/violTotal*100):0}%</td>
                              <td style={{ padding:'8px 12px', color: v.trend==='↑'?'var(--t-danger)':v.trend==='↓'?'var(--t-success)':'var(--t-text-muted)', fontWeight:700 }}>{v.trend}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <div style={{ fontSize:11, color:'var(--t-accent)', letterSpacing:'0.08em', fontWeight:700, marginBottom:10 }}>DISTRIBUTION</div>
                    {violations.map(v => (
                      <div key={v.type} style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
                        <div style={{ width:150, fontSize:11, color:'var(--t-text-muted)', flexShrink:0 }}>{v.type}</div>
                        <div style={{ flex:1, background:'var(--t-line)', height:16, position:'relative' }}>
                          <div style={{ width:`${violTotal?Math.round(v.count/violTotal*100):0}%`, height:'100%', background:TYPE_BORDER[v.type]||'var(--t-accent)' }}/>
                        </div>
                        <div style={{ width:30, fontSize:11, color:'var(--t-text)', textAlign:'right' }}>{v.count}</div>
                      </div>
                    ))}
                  </div>

                </div>
              )
            })()
      )}

      {/* ══════════════════════════════════════════════════════
          TAB 6 — PROGRESSIVE DISCIPLINE
      ════════════════════════════════════════════════════════ */}
      {activeTab === 'progressive' && progEnabled && (() => {
        /* Build per-employee progressive data */
        const empMap = {}
        records.forEach(r => {
          if (!empMap[r.person_id]) {
            empMap[r.person_id] = {
              person_id: r.person_id,
              person_name: r.person_name,
              node_name: r.node_name,
              das: [],
            }
          }
          empMap[r.person_id].das.push(r)
        })
        const progRows = Object.values(empMap).map(emp => {
          const sorted = [...emp.das].sort((a, b) => new Date(b.issued_date) - new Date(a.issued_date))
          const count = emp.das.length
          const { label: curLabel } = getProgressiveStage(count, progressiveSteps)
          const { label: nextLabel } = getProgressiveStage(count + 1, progressiveSteps)
          const lastDA = sorted[0]
          const daysSince = lastDA
            ? Math.floor((new Date() - new Date(lastDA.issued_date)) / (1000 * 60 * 60 * 24))
            : null
          return { ...emp, count, curLabel, nextLabel, lastDA, daysSince }
        }).sort((a, b) => b.count - a.count)

        return (
          <div style={{ display:'flex', flexDirection:'column', gap:20 }}>
            {/* Ladder table */}
            <div style={{ background:'var(--t-surface)', border:'1px solid var(--t-line)', padding:16 }}>
              <div style={{ fontSize:11, color:'var(--t-accent)', letterSpacing:'0.08em', fontWeight:700, marginBottom:14 }}>
                PROGRESSIVE DISCIPLINE LADDER
              </div>
              <div style={{ overflowX:'auto' }}>
                <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
                  <thead>
                    <tr style={{ background:'var(--t-surface-2)', borderBottom:'1px solid var(--t-line)' }}>
                      {['Employee','Location','DA Count','Current Stage','Last DA','Days Since','Recommended Next','Action'].map(h => (
                        <th key={h} style={{ textAlign:'left', padding:'9px 12px', fontSize:10, letterSpacing:'0.06em', color:'var(--t-text-muted)', fontWeight:700, whiteSpace:'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {progRows.map((row, i) => (
                      <tr key={row.person_id} style={{ borderBottom: i < progRows.length - 1 ? '1px solid var(--t-line)' : 'none' }}>
                        <td style={{ padding:'9px 12px', fontWeight:600, color:'var(--t-text)', whiteSpace:'nowrap' }}>{row.person_name}</td>
                        <td style={{ padding:'9px 12px', color:'var(--t-text-muted)', whiteSpace:'nowrap' }}>{row.node_name}</td>
                        <td style={{ padding:'9px 12px', fontWeight:700, color:'var(--t-text)' }}>{row.count}</td>
                        <td style={{ padding:'9px 12px', whiteSpace:'nowrap' }}>
                          <span className={stageBadgeClass(row.curLabel)} style={stageBadgeStyle(row.curLabel)}>
                            {row.curLabel}
                          </span>
                        </td>
                        <td style={{ padding:'9px 12px', color:'var(--t-text-muted)', whiteSpace:'nowrap' }}>{fmt(row.lastDA?.issued_date)}</td>
                        <td style={{ padding:'9px 12px', color:'var(--t-text-muted)', whiteSpace:'nowrap' }}>
                          {row.daysSince !== null ? `${row.daysSince}d` : '—'}
                        </td>
                        <td style={{ padding:'9px 12px', whiteSpace:'nowrap' }}>
                          <span className={stageBadgeClass(row.nextLabel)} style={stageBadgeStyle(row.nextLabel)}>
                            {row.nextLabel}
                          </span>
                        </td>
                        <td style={{ padding:'9px 12px', whiteSpace:'nowrap' }}>
                          {isHR && (
                            <button
                              className="action-btn-sm"
                              onClick={() => {
                                setForm(f => ({ ...blankForm(), person_id: row.person_id }))
                                setActiveTab('create')
                              }}
                              style={{ background:'rgba(0,229,255,0.08)', border:'1px solid var(--t-accent)', color:'var(--t-accent)', fontSize:11, fontWeight:700 }}
                            >
                              Issue Next Step
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                    {progRows.length === 0 && (
                      <tr>
                        <td colSpan={8} style={{ padding:24, textAlign:'center', color:'var(--t-text-faint)', fontSize:13 }}>
                          No employees with DA history found.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Visual ladder diagram — one per employee in the table */}
            <div style={{ background:'var(--t-surface)', border:'1px solid var(--t-line)', padding:16 }}>
              <div style={{ fontSize:11, color:'var(--t-accent)', letterSpacing:'0.08em', fontWeight:700, marginBottom:14 }}>
                DISCIPLINE STAGE REFERENCE
              </div>
              <div style={{ display:'flex', alignItems:'center', gap:0, overflowX:'auto', paddingBottom:8 }}>
                {progressiveSteps.map((step, idx) => (
                  <div key={step} style={{ display:'flex', alignItems:'center', flexShrink:0 }}>
                    <div style={{
                      padding:'10px 16px',
                      border: `2px solid ${idx === 0 ? 'var(--t-success)' : idx === 1 ? 'var(--t-warn)' : idx === 2 ? 'var(--t-warn)' : 'var(--t-danger)'}`,
                      background: 'var(--t-surface-2)',
                      fontSize:12,
                      fontWeight:700,
                      color:'var(--t-text)',
                      whiteSpace:'nowrap',
                      textAlign:'center',
                      minWidth:120,
                    }}>
                      <div style={{ fontSize:10, color:'var(--t-text-faint)', marginBottom:3 }}>STEP {idx + 1}</div>
                      {step}
                    </div>
                    {idx < progressiveSteps.length - 1 && (
                      <div style={{ fontSize:16, color:'var(--t-text-muted)', padding:'0 4px', flexShrink:0 }}>→</div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Per-employee ladders */}
            <div style={{ background:'var(--t-surface)', border:'1px solid var(--t-line)', padding:16 }}>
              <div style={{ fontSize:11, color:'var(--t-accent)', letterSpacing:'0.08em', fontWeight:700, marginBottom:14 }}>
                INDIVIDUAL POSITION ON LADDER
              </div>
              <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
                {progRows.map(row => {
                  const activeIdx = Math.min(row.count, progressiveSteps.length - 1)
                  return (
                    <div key={row.person_id} style={{ background:'var(--t-surface-2)', padding:12 }}>
                      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
                        <div>
                          <span style={{ fontSize:13, fontWeight:700, color:'var(--t-text)' }}>{row.person_name}</span>
                          <span style={{ fontSize:12, color:'var(--t-text-muted)', marginLeft:8 }}>{row.node_name}</span>
                        </div>
                        <span style={{ fontSize:11, color:'var(--t-text-faint)' }}>{row.count} DA{row.count !== 1 ? 's' : ''} on file</span>
                      </div>
                      <div style={{ display:'flex', alignItems:'center', gap:0, overflowX:'auto' }}>
                        {progressiveSteps.map((step, idx) => {
                          const isActive = idx === activeIdx
                          const isPast   = idx < activeIdx
                          return (
                            <div key={step} style={{ display:'flex', alignItems:'center', flexShrink:0 }}>
                              <div style={{
                                padding:'8px 12px',
                                border: isActive
                                  ? '2px solid var(--t-accent)'
                                  : isPast
                                    ? '2px solid var(--t-line)'
                                    : '1px dashed var(--t-line)',
                                background: isActive
                                  ? 'rgba(0,229,255,0.12)'
                                  : isPast
                                    ? 'rgba(255,255,255,0.03)'
                                    : 'transparent',
                                fontSize:11,
                                fontWeight: isActive ? 700 : 400,
                                color: isActive ? 'var(--t-accent)' : isPast ? 'var(--t-text-muted)' : 'var(--t-text-faint)',
                                whiteSpace:'nowrap',
                                textAlign:'center',
                                minWidth:100,
                                opacity: isPast ? 0.6 : 1,
                              }}>
                                {isActive && <div style={{ fontSize:9, color:'var(--t-accent)', marginBottom:2 }}>● CURRENT</div>}
                                {step}
                              </div>
                              {idx < progressiveSteps.length - 1 && (
                                <div style={{ fontSize:13, color:'var(--t-line)', padding:'0 3px', flexShrink:0 }}>→</div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )
      })()}

      {/* ── detail side panel ───────────────────────────────── */}
      {detailRow && (
        <DetailPanel
          row={detailRow}
          allRecords={records}
          employees={employees}
          isHR={isHR}
          onClose={()=>setDetailRow(null)}
          onResolve={resolveDA}
          onGenerateDA={openDAModal}
        />
      )}

      {/* ── backdrop for side panel ──────────────────────────── */}
      {detailRow && (
        <div onClick={()=>setDetailRow(null)} style={{ position:'fixed', inset:0, zIndex:7999 }}/>
      )}

      {/* ── DA form modal ────────────────────────────────────── */}
      {showDAModal && (
        <DAFormModal onClose={()=>setShowDAModal(false)} prefill={daPrefill} employees={employees}
          nodeId={locationIds?.[0]||null} issuedById={personId} onSaved={load}/>
      )}
    </>
  )
}
