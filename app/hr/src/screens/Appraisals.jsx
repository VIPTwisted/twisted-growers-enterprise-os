// Appraisals.jsx — Twisted Growers Appraisals (Odoo Appraisals analog). Adds the two-sided
// appraisal CYCLE that the manager-only Reviews screen lacks: an employee
// self-assessment, a manager assessment beside it, and a finalize step. HR
// launches a cycle for a period/audience; employees self-assess; managers review
// side-by-side and finalize.
//
// DATA: 100% live on the HR brain via security-definer RPCs
// (get_my_appraisals, get_appraisal_cycles_admin, create_appraisal_cycle,
//  set_appraisal_cycle_status, submit_self_appraisal, save_manager_review).
// No localStorage, no seed data, no synthetic identities — honest empty states.
import { useState, useCallback, useMemo, useEffect } from 'react'
import { useAuth } from '../lib/auth.jsx'
import { useScope } from '../lib/scope.jsx'
import { sb } from '../lib/supabase'

const EXEC_RX = /admin|owner|coo|ceo|cfo|president|chief|hr|manager/i

// competencies scored by both sides (form configuration, not record data)
const COMPETENCIES = [
  { id: 'quality', label: 'Quality of Work' },
  { id: 'reliability', label: 'Reliability & Attendance' },
  { id: 'customer', label: 'Customer Service' },
  { id: 'teamwork', label: 'Teamwork' },
  { id: 'initiative', label: 'Initiative & Growth' },
  { id: 'compliance', label: 'Policy & Compliance' },
]

// audience role picklist (no-code default; a role table can replace this later)
const ROLES = ['Associate', 'Key Holder', 'Store Manager', 'HR Manager', 'COO']

const st = {
  wrap: { padding: '24px 28px', color: 'var(--t-text)', minHeight: '100vh', background: 'var(--t-bg)' },
  h1: { fontSize: 20, fontWeight: 800, letterSpacing: '.05em', margin: 0, textTransform: 'uppercase' },
  sub: { fontSize: 11, color: 'var(--t-text-muted)', marginTop: 3 },
  tabs: { display: 'flex', gap: 4, margin: '16px 0 20px' },
  tab: (a) => ({ padding: '8px 16px', fontSize: 12, fontWeight: 700, cursor: 'pointer', border: '1px solid var(--t-line)', borderBottom: a ? '2px solid var(--t-accent)' : '1px solid var(--t-line)', background: a ? 'var(--t-surface)' : 'transparent', color: a ? 'var(--t-text)' : 'var(--t-text-muted)' }),
  card: { background: 'var(--t-surface)', border: '1px solid var(--t-line)', marginBottom: 14 },
  cardHead: { padding: '11px 16px', borderBottom: '1px solid var(--t-line)', background: 'var(--t-surface-2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  cardBody: { padding: 16 },
  btn: { fontSize: 11, fontWeight: 700, padding: '8px 15px', background: 'var(--t-accent)', border: 'none', color: '#fff', borderRadius: 0, cursor: 'pointer', letterSpacing: '.04em' },
  ghost: { fontSize: 11, fontWeight: 600, padding: '7px 13px', background: 'var(--t-surface)', border: '1px solid var(--t-line)', color: 'var(--t-text-muted)', borderRadius: 0, cursor: 'pointer' },
  inp: { fontSize: 12, padding: '8px 10px', background: 'var(--t-surface)', border: '1px solid var(--t-line)', color: 'var(--t-text)', borderRadius: 0, outline: 'none', width: '100%' },
  label: { fontSize: 10, fontWeight: 700, letterSpacing: '.08em', color: 'var(--t-text-muted)', textTransform: 'uppercase' },
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 9998, display: 'flex', justifyContent: 'center', alignItems: 'flex-start', padding: '40px 20px', overflowY: 'auto' },
  modal: { background: 'var(--t-surface)', border: '1px solid var(--t-line)', width: 'min(640px, 96vw)' },
  chip: (a) => ({ fontSize: 11, fontWeight: 600, padding: '4px 10px', border: '1px solid var(--t-line)', cursor: 'pointer', background: a ? 'var(--t-accent)' : 'var(--t-surface)', color: a ? '#fff' : 'var(--t-text-muted)' }),
  statusBadge: (s) => ({ fontSize: 9, fontWeight: 800, padding: '3px 8px', letterSpacing: '.05em', color: '#fff', background: s === 'finalized' ? 'var(--t-success)' : s === 'in_review' ? 'var(--t-accent)' : s === 'self_done' ? 'var(--t-warn)' : 'var(--t-text-muted)' }),
}
const STATUS_LABEL = { not_started: 'Not started', self_done: 'Self-assessed', in_review: 'In review', finalized: 'Finalized' }

function Rating({ value, onChange, readOnly }) {
  return (
    <div style={{ display: 'flex', gap: 4 }}>
      {[1, 2, 3, 4, 5].map(n => (
        <button key={n} disabled={readOnly} onClick={() => onChange && onChange(n)}
          style={{ width: 32, height: 30, fontSize: 12, fontWeight: 700, cursor: readOnly ? 'default' : 'pointer', border: '1px solid var(--t-line)', background: value === n ? 'var(--t-accent)' : 'var(--t-surface)', color: value === n ? '#fff' : 'var(--t-text-muted)' }}>{n}</button>
      ))}
    </div>
  )
}

export default function Appraisals() {
  const { session } = useAuth()
  const { locations, locationIds } = useScope()
  const person = session?.person || {}
  const pid = person.id || null
  const isHR = EXEC_RX.test(person.role_name || '')
  // node to stamp on writes (current focus, else first reachable location)
  const nodeId = (locationIds && locationIds[0]) || (locations && locations[0]?.id) || null

  const [tab, setTab] = useState('mine')
  const [mine, setMine] = useState([])        // [{ cycle, rec }] — live
  const [cycles, setCycles] = useState([])    // admin: [{ ...cycle, records:[] }]
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [compose, setCompose] = useState(false)
  const [selfForm, setSelfForm] = useState(null)   // { cycle, readOnly? }
  const [review, setReview] = useState(null)       // { cycle, rec }

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const calls = [sb.rpc('get_my_appraisals', { p_person_id: pid })]
      if (isHR) calls.push(sb.rpc('get_appraisal_cycles_admin'))
      const [myRes, adminRes] = await Promise.all(calls)
      if (myRes.error) throw myRes.error
      setMine(Array.isArray(myRes.data) ? myRes.data : [])
      if (isHR) {
        if (adminRes.error) throw adminRes.error
        setCycles(Array.isArray(adminRes.data) ? adminRes.data : [])
      }
    } catch (e) {
      setError(e?.message || 'Could not load appraisals.')
      setMine([]); setCycles([])
    } finally {
      setLoading(false)
    }
  }, [pid, isHR])

  useEffect(() => { load() }, [load])

  // ── employee: submit self-assessment ──
  const submitSelf = useCallback(async (cycle, data) => {
    const { error: err } = await sb.rpc('submit_self_appraisal', {
      p_cycle_id: cycle.id, p_person_id: pid, p_person_name: person.full_name || 'Employee',
      p_person_role: person.role_name || '', p_node_id: nodeId,
      p_scores: data.scores, p_accomplishments: data.accomplishments,
      p_goals: data.goals, p_support: data.support,
    })
    if (err) { setError(err.message); return }
    setSelfForm(null)
    await load()
  }, [pid, person.full_name, person.role_name, nodeId, load])

  // ── manager: save/finalize review ──
  const saveReview = useCallback(async (recordId, mgr, finalize) => {
    const { error: err } = await sb.rpc('save_manager_review', {
      p_record_id: recordId, p_scores: mgr.scores, p_summary: mgr.summary,
      p_raise: mgr.raise, p_manager_by: person.full_name || 'Manager', p_finalize: !!finalize,
    })
    if (err) { setError(err.message); return }
    if (finalize) setReview(null)
    await load()
  }, [person.full_name, load])

  const createCycle = useCallback(async (c) => {
    const { error: err } = await sb.rpc('create_appraisal_cycle', {
      p_name: c.name, p_period: c.period, p_due: c.due || null, p_audience: c.audience,
      p_created_by: person.full_name || 'HR', p_created_by_person: pid, p_node_id: nodeId,
    })
    if (err) { setError(err.message); return }
    setCompose(false)
    await load()
  }, [person.full_name, pid, nodeId, load])

  const setCycleStatus = useCallback(async (cycleId, status) => {
    const { error: err } = await sb.rpc('set_appraisal_cycle_status', { p_cycle_id: cycleId, p_status: status })
    if (err) { setError(err.message); return }
    await load()
  }, [load])

  const openMine = useMemo(() => mine.filter(m => m.cycle?.status === 'open'), [mine])

  return (
    <div style={st.wrap}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 style={st.h1}>Appraisals</h1>
          <div style={st.sub}>Two-sided appraisal cycles — self-assessment, manager assessment, and finalize. Inspired by Odoo Appraisals.</div>
        </div>
        {isHR && <button style={st.btn} onClick={() => setCompose(true)}>+ Launch Cycle</button>}
      </div>

      {error && (
        <div style={{ marginTop: 14, padding: '10px 14px', border: '1px solid var(--t-line)', background: 'var(--t-surface-2)', color: 'var(--t-warn)', fontSize: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>{error}</span>
          <button style={st.ghost} onClick={load}>Retry</button>
        </div>
      )}

      <div style={st.tabs}>
        <div style={st.tab(tab === 'mine')} onClick={() => setTab('mine')}>My Appraisals</div>
        {isHR && <div style={st.tab(tab === 'manage')} onClick={() => setTab('manage')}>Manage Cycles</div>}
      </div>

      {loading && <div style={{ fontSize: 13, color: 'var(--t-text-muted)', padding: '20px 0' }}>Loading…</div>}

      {!loading && tab === 'mine' && (
        <>
          {openMine.length === 0 && <div style={{ fontSize: 13, color: 'var(--t-text-muted)', padding: '20px 0' }}>No open appraisal cycles right now.</div>}
          {openMine.map(({ cycle, rec }) => (
            <div key={cycle.id} style={st.card}>
              <div style={st.cardHead}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <span style={{ fontSize: 13, fontWeight: 800 }}>{cycle.name}</span>
                  <span style={st.statusBadge(rec?.status || 'not_started')}>{STATUS_LABEL[rec?.status || 'not_started']}</span>
                </div>
                <span style={{ fontSize: 11, color: 'var(--t-text-muted)' }}>Due {cycle.due || '—'}</span>
              </div>
              <div style={st.cardBody}>
                {rec?.status === 'finalized' ? (
                  <div>
                    <div style={{ fontSize: 12, color: 'var(--t-success)', marginBottom: 8 }}>✓ Finalized by {rec.manager_by} · {rec.finalized_at ? new Date(rec.finalized_at).toLocaleDateString() : ''}</div>
                    <button style={st.ghost} onClick={() => setSelfForm({ cycle, rec, readOnly: true })}>View Appraisal</button>
                  </div>
                ) : rec?.status === 'self_done' || rec?.status === 'in_review' ? (
                  <div>
                    <div style={{ fontSize: 12, color: 'var(--t-text-muted)', marginBottom: 8 }}>Self-assessment submitted{rec.status === 'in_review' ? ' — manager review in progress' : ' — awaiting manager review'}.</div>
                    <button style={st.ghost} onClick={() => setSelfForm({ cycle, rec, readOnly: true })}>View My Answers</button>
                  </div>
                ) : (
                  <div>
                    <div style={{ fontSize: 12, color: 'var(--t-text-muted)', marginBottom: 8 }}>Complete your self-assessment for this period.</div>
                    <button style={st.btn} onClick={() => setSelfForm({ cycle, rec })}>Start Self-Assessment</button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </>
      )}

      {!loading && tab === 'manage' && isHR && (
        <>
          {cycles.length === 0 && <div style={{ fontSize: 13, color: 'var(--t-text-muted)', padding: '20px 0' }}>No appraisal cycles yet. Launch one to begin.</div>}
          {cycles.map(c => {
            const subs = Array.isArray(c.records) ? c.records : []
            const done = subs.filter(s => s.status === 'finalized').length
            const selfDone = subs.filter(s => s.status === 'self_done' || s.status === 'in_review').length
            return (
              <div key={c.id} style={st.card}>
                <div style={st.cardHead}>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    <span style={{ fontSize: 13, fontWeight: 800 }}>{c.name}</span>
                    <span style={st.statusBadge(c.status === 'open' ? 'in_review' : 'finalized')}>{(c.status || '').toUpperCase()}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {c.status === 'open'
                      ? <button style={st.ghost} onClick={() => setCycleStatus(c.id, 'closed')}>Close Cycle</button>
                      : <button style={st.ghost} onClick={() => setCycleStatus(c.id, 'open')}>Reopen</button>}
                  </div>
                </div>
                <div style={st.cardBody}>
                  <div style={{ fontSize: 11, color: 'var(--t-text-muted)', marginBottom: 10 }}>
                    Period {c.period || '—'} · Due {c.due || '—'} · {selfDone} self-assessed · {done} finalized
                  </div>
                  {subs.length === 0 ? (
                    <div style={{ fontSize: 12, color: 'var(--t-text-faint)' }}>No self-assessments submitted yet.</div>
                  ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                      <thead><tr>
                        <th style={{ textAlign: 'left', padding: '6px 8px', ...st.label }}>Employee</th>
                        <th style={{ textAlign: 'left', padding: '6px 8px', ...st.label }}>Self Avg</th>
                        <th style={{ textAlign: 'left', padding: '6px 8px', ...st.label }}>Status</th>
                        <th style={{ padding: '6px 8px' }}></th>
                      </tr></thead>
                      <tbody>
                        {subs.map(s => {
                          const selfVals = Object.values(s.scores || {}).filter(v => typeof v === 'number')
                          const selfAvg = selfVals.length ? (selfVals.reduce((a, b) => a + b, 0) / selfVals.length).toFixed(1) : '—'
                          return (
                            <tr key={s.id} style={{ borderTop: '1px solid var(--t-line)' }}>
                              <td style={{ padding: '8px', fontWeight: 600 }}>{s.person_name}</td>
                              <td style={{ padding: '8px' }}>{selfAvg}</td>
                              <td style={{ padding: '8px' }}><span style={st.statusBadge(s.status)}>{STATUS_LABEL[s.status]}</span></td>
                              <td style={{ padding: '8px', textAlign: 'right' }}>
                                <button style={st.ghost} onClick={() => setReview({ cycle: c, rec: s })}>{s.status === 'finalized' ? 'View' : 'Review'}</button>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            )
          })}
        </>
      )}

      {compose && <ComposeCycle locationNames={(locations || []).map(l => l.name)} onClose={() => setCompose(false)} onCreate={createCycle} />}
      {selfForm && <SelfAssessment ctx={selfForm} existing={selfForm.rec} onClose={() => setSelfForm(null)} onSubmit={submitSelf} />}
      {review && <ManagerReview rec={review.rec} onClose={() => setReview(null)} onSave={saveReview} />}
    </div>
  )
}

// ── employee self-assessment ──────────────────────────────────────────
function SelfAssessment({ ctx, existing, onClose, onSubmit }) {
  const readOnly = ctx.readOnly
  const [scores, setScores] = useState(existing?.scores || {})
  const [accomplishments, setAcc] = useState(existing?.accomplishments || '')
  const [goals, setGoals] = useState(existing?.goals || '')
  const [support, setSupport] = useState(existing?.support || '')
  const [saving, setSaving] = useState(false)
  const setScore = (id, n) => setScores(s => ({ ...s, [id]: n }))
  const complete = COMPETENCIES.every(c => scores[c.id]) && accomplishments.trim()

  const submit = async () => { setSaving(true); await onSubmit(ctx.cycle, { scores, accomplishments, goals, support }); setSaving(false) }

  return (
    <div style={st.overlay} onClick={onClose}>
      <div style={st.modal} onClick={e => e.stopPropagation()}>
        <div style={st.cardHead}><span style={{ fontSize: 14, fontWeight: 800 }}>{readOnly ? 'My Self-Assessment' : 'Self-Assessment'} — {ctx.cycle.name}</span>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--t-text-muted)', fontSize: 22, cursor: 'pointer' }}>×</button></div>
        <div style={{ ...st.cardBody, display: 'flex', flexDirection: 'column', gap: 14, maxHeight: '72vh', overflowY: 'auto' }}>
          <div style={{ fontSize: 11, color: 'var(--t-text-muted)' }}>Rate yourself honestly. Your manager will review alongside their own assessment.</div>
          {COMPETENCIES.map(c => (
            <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 13 }}>{c.label}</span>
              <Rating value={scores[c.id]} onChange={readOnly ? null : (n) => setScore(c.id, n)} readOnly={readOnly} />
            </div>
          ))}
          <div><div style={st.label}>Key accomplishments this period</div>
            <textarea value={accomplishments} onChange={e => setAcc(e.target.value)} disabled={readOnly} style={{ ...st.inp, minHeight: 70, marginTop: 6, resize: 'vertical', fontFamily: 'inherit' }} /></div>
          <div><div style={st.label}>Goals for next period</div>
            <textarea value={goals} onChange={e => setGoals(e.target.value)} disabled={readOnly} style={{ ...st.inp, minHeight: 60, marginTop: 6, resize: 'vertical', fontFamily: 'inherit' }} /></div>
          <div><div style={st.label}>Support / resources I need</div>
            <textarea value={support} onChange={e => setSupport(e.target.value)} disabled={readOnly} style={{ ...st.inp, minHeight: 50, marginTop: 6, resize: 'vertical', fontFamily: 'inherit' }} /></div>
          {!readOnly && <button disabled={!complete || saving} style={{ ...st.btn, opacity: (complete && !saving) ? 1 : 0.5, cursor: (complete && !saving) ? 'pointer' : 'not-allowed' }} onClick={submit}>{saving ? 'Submitting…' : 'Submit Self-Assessment'}</button>}
        </div>
      </div>
    </div>
  )
}

// ── manager review (side-by-side) ─────────────────────────────────────
function ManagerReview({ rec, onClose, onSave }) {
  const readOnly = rec?.status === 'finalized'
  const [mgrScores, setMgrScores] = useState(rec?.manager?.scores || {})
  const [summary, setSummary] = useState(rec?.manager?.summary || '')
  const [raise, setRaise] = useState(rec?.manager?.raise || 'none')
  const [saving, setSaving] = useState(false)
  const setScore = (id, n) => setMgrScores(s => ({ ...s, [id]: n }))
  const complete = COMPETENCIES.every(c => mgrScores[c.id]) && summary.trim()
  const selfAvg = (() => { const v = Object.values(rec?.scores || {}).filter(x => typeof x === 'number'); return v.length ? (v.reduce((a, b) => a + b, 0) / v.length).toFixed(1) : '—' })()
  const mgrAvg = (() => { const v = Object.values(mgrScores).filter(x => typeof x === 'number'); return v.length ? (v.reduce((a, b) => a + b, 0) / v.length).toFixed(1) : '—' })()

  const save = async (finalize) => { setSaving(true); await onSave(rec.id, { scores: mgrScores, summary, raise }, finalize); setSaving(false) }

  return (
    <div style={st.overlay} onClick={onClose}>
      <div style={{ ...st.modal, width: 'min(720px, 96vw)' }} onClick={e => e.stopPropagation()}>
        <div style={st.cardHead}>
          <div><span style={{ fontSize: 14, fontWeight: 800 }}>{rec?.person_name}</span><span style={{ fontSize: 11, color: 'var(--t-text-muted)', marginLeft: 8 }}>{rec?.role}</span></div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--t-text-muted)', fontSize: 22, cursor: 'pointer' }}>×</button>
        </div>
        <div style={{ ...st.cardBody, display: 'flex', flexDirection: 'column', gap: 14, maxHeight: '72vh', overflowY: 'auto' }}>
          <div style={{ display: 'flex', gap: 16, fontSize: 12 }}>
            <span>Self avg: <b style={{ color: 'var(--t-accent)' }}>{selfAvg}</b></span>
            <span>Manager avg: <b style={{ color: 'var(--t-success)' }}>{mgrAvg}</b></span>
          </div>
          {/* side-by-side competency scoring */}
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead><tr>
              <th style={{ textAlign: 'left', padding: '6px 8px', ...st.label }}>Competency</th>
              <th style={{ textAlign: 'center', padding: '6px 8px', ...st.label }}>Self</th>
              <th style={{ textAlign: 'left', padding: '6px 8px', ...st.label }}>Manager</th>
            </tr></thead>
            <tbody>
              {COMPETENCIES.map(c => (
                <tr key={c.id} style={{ borderTop: '1px solid var(--t-line)' }}>
                  <td style={{ padding: '8px' }}>{c.label}</td>
                  <td style={{ padding: '8px', textAlign: 'center', fontWeight: 700 }}>{rec?.scores?.[c.id] || '—'}</td>
                  <td style={{ padding: '8px' }}><Rating value={mgrScores[c.id]} onChange={readOnly ? null : (n) => setScore(c.id, n)} readOnly={readOnly} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          {/* employee narrative */}
          <div style={{ background: 'var(--t-surface-2)', border: '1px solid var(--t-line)', padding: 12 }}>
            <div style={st.label}>Employee accomplishments</div>
            <div style={{ fontSize: 12, marginTop: 4, whiteSpace: 'pre-wrap' }}>{rec?.accomplishments || '—'}</div>
            <div style={{ ...st.label, marginTop: 10 }}>Employee goals</div>
            <div style={{ fontSize: 12, marginTop: 4, whiteSpace: 'pre-wrap' }}>{rec?.goals || '—'}</div>
            {rec?.support && <><div style={{ ...st.label, marginTop: 10 }}>Support requested</div><div style={{ fontSize: 12, marginTop: 4, whiteSpace: 'pre-wrap' }}>{rec.support}</div></>}
          </div>
          <div><div style={st.label}>Manager summary</div>
            <textarea value={summary} onChange={e => setSummary(e.target.value)} disabled={readOnly} style={{ ...st.inp, minHeight: 70, marginTop: 6, resize: 'vertical', fontFamily: 'inherit' }} /></div>
          <div><div style={st.label}>Compensation recommendation</div>
            <select value={raise} onChange={e => setRaise(e.target.value)} disabled={readOnly} style={{ ...st.inp, marginTop: 6 }}>
              <option value="none">No change</option>
              <option value="standard">Standard increase</option>
              <option value="merit">Merit increase</option>
              <option value="promo">Promotion track</option>
            </select></div>
          {readOnly ? (
            <div style={{ fontSize: 12, color: 'var(--t-success)' }}>✓ Finalized by {rec.manager_by} · {rec.finalized_at ? new Date(rec.finalized_at).toLocaleDateString() : ''}</div>
          ) : (
            <div style={{ display: 'flex', gap: 8 }}>
              <button disabled={saving} style={st.ghost} onClick={() => save(false)}>Save Draft</button>
              <button disabled={!complete || saving} style={{ ...st.btn, opacity: (complete && !saving) ? 1 : 0.5, cursor: (complete && !saving) ? 'pointer' : 'not-allowed' }} onClick={() => save(true)}>Finalize</button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── HR: launch a cycle ────────────────────────────────────────────────
function ComposeCycle({ locationNames, onClose, onCreate }) {
  const locOptions = (locationNames && locationNames.length) ? locationNames : []
  const [name, setName] = useState('')
  const [period, setPeriod] = useState('')
  const [due, setDue] = useState('')
  const [roles, setRoles] = useState([...ROLES])
  const [locs, setLocs] = useState([...locOptions])
  const [saving, setSaving] = useState(false)
  const toggle = (arr, set, v) => set(arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v])
  const valid = name.trim() && roles.length && (locOptions.length === 0 || locs.length)

  const submit = async () => { setSaving(true); await onCreate({ name, period, due, audience: { roles, locations: locs } }); setSaving(false) }

  return (
    <div style={st.overlay} onClick={onClose}>
      <div style={st.modal} onClick={e => e.stopPropagation()}>
        <div style={st.cardHead}><span style={{ fontSize: 14, fontWeight: 800 }}>Launch Appraisal Cycle</span>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--t-text-muted)', fontSize: 22, cursor: 'pointer' }}>×</button></div>
        <div style={{ ...st.cardBody, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div><div style={st.label}>Cycle Name</div><input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Q3 2026 Performance Appraisal" style={{ ...st.inp, marginTop: 6 }} /></div>
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ flex: 1 }}><div style={st.label}>Period</div><input value={period} onChange={e => setPeriod(e.target.value)} placeholder="e.g. Q3 2026" style={{ ...st.inp, marginTop: 6 }} /></div>
            <div style={{ flex: 1 }}><div style={st.label}>Due date</div><input type="date" value={due} onChange={e => setDue(e.target.value)} style={{ ...st.inp, marginTop: 6 }} /></div>
          </div>
          <div><div style={st.label}>Roles</div><div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>{ROLES.map(r => <span key={r} style={st.chip(roles.includes(r))} onClick={() => toggle(roles, setRoles, r)}>{r}</span>)}</div></div>
          <div><div style={st.label}>Locations</div>
            {locOptions.length === 0
              ? <div style={{ fontSize: 11, color: 'var(--t-text-faint)', marginTop: 6 }}>No locations available for your scope — the cycle will apply company-wide.</div>
              : <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>{locOptions.map(l => <span key={l} style={st.chip(locs.includes(l))} onClick={() => toggle(locs, setLocs, l)}>{l}</span>)}</div>}
          </div>
          <button disabled={!valid || saving} style={{ ...st.btn, opacity: (valid && !saving) ? 1 : 0.5, cursor: (valid && !saving) ? 'pointer' : 'not-allowed' }} onClick={submit}>{saving ? 'Launching…' : 'Launch Cycle'}</button>
        </div>
      </div>
    </div>
  )
}
