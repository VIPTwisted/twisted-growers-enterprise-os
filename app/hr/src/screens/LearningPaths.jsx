// LearningPaths.jsx — Twisted Growers Learning (Microsoft Viva Learning analog). Adds
// sequenced, role-based learning JOURNEYS on top of the course-level LMS: a path
// is an ordered set of steps; each step unlocks when the prior completes. HR
// builds/assigns paths and watches cohort progress; employees walk their path.
//
// Fully wired to the HR brain (project fxetuqjryttnypgepsru, schema hr) — no localStorage,
// no seed/mock data. Backend: migration 20260716180000_create_learning_paths.sql
//   reads  → hr_learning_paths_list(p_node_ids, p_person_id)
//   writes → hr_learning_path_create / hr_learning_step_complete / hr_learning_path_delete
import { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import { sb, getSession } from '../lib/supabase'

const EXEC_RX = /admin|owner|coo|ceo|cfo|president|chief|hr|manager/i
const ROLES = ['Associate', 'Key Holder', 'Store Manager', 'HR Manager', 'COO']
const KIND_ICON = { course: '🎓', video: '🎬', reading: '📖', quiz: '📝', practice: '🤝', signoff: '✍️' }

const st = {
  wrap: { padding: '24px 28px', color: 'var(--t-text)', minHeight: '100vh', background: 'var(--t-bg)' },
  h1: { fontSize: 20, fontWeight: 800, letterSpacing: '.05em', margin: 0, textTransform: 'uppercase' },
  sub: { fontSize: 11, color: 'var(--t-text-muted)', marginTop: 3 },
  tabs: { display: 'flex', gap: 4, margin: '16px 0 20px' },
  tab: (a) => ({ padding: '8px 16px', fontSize: 12, fontWeight: 700, cursor: 'pointer', border: '1px solid var(--t-line)', borderBottom: a ? '2px solid var(--t-accent)' : '1px solid var(--t-line)', background: a ? 'var(--t-surface)' : 'transparent', color: a ? 'var(--t-text)' : 'var(--t-text-muted)' }),
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 14 },
  card: { background: 'var(--t-surface)', border: '1px solid var(--t-line)', borderTop: '3px solid var(--t-accent)' },
  cardBody: { padding: 16 },
  btn: { fontSize: 11, fontWeight: 700, padding: '8px 15px', background: 'var(--t-accent)', border: 'none', color: '#fff', borderRadius: 0, cursor: 'pointer', letterSpacing: '.04em' },
  ghost: { fontSize: 11, fontWeight: 600, padding: '7px 13px', background: 'var(--t-surface)', border: '1px solid var(--t-line)', color: 'var(--t-text-muted)', borderRadius: 0, cursor: 'pointer' },
  inp: { fontSize: 12, padding: '8px 10px', background: 'var(--t-surface)', border: '1px solid var(--t-line)', color: 'var(--t-text)', borderRadius: 0, outline: 'none', width: '100%' },
  label: { fontSize: 10, fontWeight: 700, letterSpacing: '.08em', color: 'var(--t-text-muted)', textTransform: 'uppercase' },
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 9998, display: 'flex', justifyContent: 'center', alignItems: 'flex-start', padding: '40px 20px', overflowY: 'auto' },
  modal: { background: 'var(--t-surface)', border: '1px solid var(--t-line)', width: 'min(560px, 96vw)' },
  cardHead: { padding: '11px 16px', borderBottom: '1px solid var(--t-line)', background: 'var(--t-surface-2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  empty: { border: '1px dashed var(--t-line)', padding: '40px 20px', textAlign: 'center', color: 'var(--t-text-muted)', fontSize: 13 },
}

// progress derived from the server's `my_progress` map ({ stepId: { done, at, by } })
function progressOf(path) {
  const steps = path.steps || []
  const mp = path.my_progress || {}
  const done = steps.filter(s => mp[s.id]?.done).length
  return { done, total: steps.length, pct: steps.length ? Math.round((done / steps.length) * 100) : 0 }
}

export default function LearningPaths() {
  // Capture the session once (a page reload remounts on login/scope change),
  // so derived deps stay referentially stable and don't re-trigger fetches.
  const [session] = useState(getSession)
  const pid = session.id || null
  const personName = session.full_name || 'Employee'
  const role = session.role_name || ''
  const isHR = EXEC_RX.test(role)

  // scope to reachable locations (org-wide paths are always returned server-side)
  const nodeIds = useMemo(() => {
    const nodes = session.nodes || []
    const locs = nodes.filter(n => n.node_type === 'location').map(n => n.id)
    return locs.length ? locs : nodes.map(n => n.id)
  }, [session])
  const createNodeId = nodeIds.length === 1 ? nodeIds[0] : null // single location → scope; else org-wide

  const [tab, setTab] = useState('mine')
  const [paths, setPaths] = useState([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [openId, setOpenId] = useState(null)   // path id open in walker
  const [compose, setCompose] = useState(false)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true); setErr('')
    try {
      const { data, error } = await sb.rpc('hr_learning_paths_list', { p_node_ids: nodeIds, p_person_id: pid })
      if (error) throw error
      if (data && data.ok === false) throw new Error(data.error || 'load_failed')
      setPaths(Array.isArray(data?.paths) ? data.paths : [])
    } catch (e) {
      setErr(e.message || String(e)); setPaths([])
    } finally { setLoading(false) }
  }, [nodeIds, pid])

  useEffect(() => { load() }, [load])

  const open = useMemo(() => paths.find(p => p.id === openId) || null, [paths, openId])

  // paths relevant to the current user's role (plus universal compliance)
  const myPaths = useMemo(
    () => paths.filter(p => p.role === role || /associate|compliance/i.test(p.role || '') || isHR),
    [paths, role, isHR]
  )

  const completeStep = useCallback(async (path, stepId) => {
    if (!pid) { setErr('No signed-in employee — cannot record progress.'); return }
    setBusy(true)
    try {
      const { data, error } = await sb.rpc('hr_learning_step_complete', {
        p_path_id: path.id, p_step_id: stepId, p_person_id: pid, p_person_name: personName,
      })
      if (error) throw error
      if (data && data.ok === false) throw new Error(data.error || 'save_failed')
      await load()
    } catch (e) {
      setErr(e.message || String(e))
    } finally { setBusy(false) }
  }, [pid, personName, load])

  const createPath = useCallback(async (p) => {
    setBusy(true)
    try {
      const { data, error } = await sb.rpc('hr_learning_path_create', {
        p_name: p.name, p_description: p.desc, p_role: p.role,
        p_steps: p.steps.map(s => ({ title: s.title, kind: s.kind, mins: s.mins })),
        p_node_id: createNodeId, p_color: 'var(--t-accent)', p_actor: pid,
      })
      if (error) throw error
      if (data && data.ok === false) throw new Error(data.error || 'create_failed')
      setCompose(false)
      await load()
    } catch (e) {
      setErr(e.message || String(e))
    } finally { setBusy(false) }
  }, [createNodeId, pid, load])

  const deletePath = useCallback(async (pathId) => {
    setBusy(true)
    try {
      const { data, error } = await sb.rpc('hr_learning_path_delete', { p_path_id: pathId })
      if (error) throw error
      if (data && data.ok === false) throw new Error(data.error || 'delete_failed')
      if (openId === pathId) setOpenId(null)
      await load()
    } catch (e) {
      setErr(e.message || String(e))
    } finally { setBusy(false) }
  }, [openId, load])

  return (
    <div style={st.wrap}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 style={st.h1}>Learning Paths</h1>
          <div style={st.sub}>Guided, role-based learning journeys — sequenced steps that build on each other. Inspired by Microsoft Viva Learning.</div>
        </div>
        {isHR && <button style={st.btn} onClick={() => setCompose(true)}>+ New Path</button>}
      </div>

      {err && (
        <div style={{ margin: '14px 0 0', padding: '9px 12px', border: '1px solid var(--t-danger)', background: 'var(--t-surface)', color: 'var(--t-danger)', fontSize: 12 }}>
          {err}
        </div>
      )}

      <div style={st.tabs}>
        <div style={st.tab(tab === 'mine')} onClick={() => setTab('mine')}>My Learning</div>
        {isHR && <div style={st.tab(tab === 'manage')} onClick={() => setTab('manage')}>All Paths &amp; Cohort</div>}
      </div>

      {loading && <div style={{ fontSize: 12, color: 'var(--t-text-muted)', padding: '10px 0' }}>Loading…</div>}

      {!loading && tab === 'mine' && (
        myPaths.length === 0
          ? <div style={st.empty}>No learning paths yet.{isHR ? ' Use “+ New Path” to create one.' : ''}</div>
          : <div style={st.grid}>
              {myPaths.map(p => {
                const { done, total, pct } = progressOf(p)
                const color = p.color || 'var(--t-accent)'
                return (
                  <div key={p.id} style={{ ...st.card, borderTopColor: color }}>
                    <div style={st.cardBody}>
                      <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 4 }}>{p.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--t-text-muted)', marginBottom: 10, minHeight: 32 }}>{p.description}</div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--t-text-muted)', marginBottom: 4 }}>
                        <span>{done}/{total} steps</span><span>{pct}%</span>
                      </div>
                      <div style={{ height: 6, background: 'var(--t-line)' }}><div style={{ height: '100%', width: `${pct}%`, background: color }} /></div>
                      <button style={{ ...st.btn, marginTop: 12, width: '100%', background: color }} onClick={() => setOpenId(p.id)}>{pct === 0 ? 'Start Path' : pct === 100 ? 'Review' : 'Continue'}</button>
                    </div>
                  </div>
                )
              })}
            </div>
      )}

      {!loading && tab === 'manage' && isHR && (
        paths.length === 0
          ? <div style={st.empty}>No learning paths yet. Use “+ New Path” to create one.</div>
          : <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {paths.map(p => {
                const color = p.color || 'var(--t-accent)'
                const started = p.cohort_started || 0
                const avg = p.cohort_avg || 0
                return (
                  <div key={p.id} style={{ ...st.card, borderTopColor: color }}>
                    <div style={st.cardHead}>
                      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                        <span style={{ fontSize: 13, fontWeight: 800 }}>{p.name}</span>
                        <span style={{ fontSize: 10, color: 'var(--t-text-muted)' }}>{p.role || '—'} · {(p.steps || []).length} steps</span>
                      </div>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button style={st.ghost} onClick={() => setOpenId(p.id)}>Preview</button>
                        <button style={{ ...st.ghost, color: 'var(--t-danger)' }} disabled={busy}
                          onClick={() => { if (window.confirm(`Delete “${p.name}”? This removes the path and all progress.`)) deletePath(p.id) }}>Delete</button>
                      </div>
                    </div>
                    <div style={st.cardBody}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--t-text-muted)', marginBottom: 4 }}>
                        <span>{started} learner{started === 1 ? '' : 's'} started</span><span>Avg {avg}%</span>
                      </div>
                      <div style={{ height: 6, background: 'var(--t-line)' }}><div style={{ height: '100%', width: `${avg}%`, background: color }} /></div>
                    </div>
                  </div>
                )
              })}
            </div>
      )}

      {open && <PathWalker path={open} onClose={() => setOpenId(null)} onComplete={completeStep} readOnly={tab === 'manage'} busy={busy} />}
      {compose && <ComposePath onClose={() => setCompose(false)} onCreate={createPath} busy={busy} />}
    </div>
  )
}

// ── path walker (sequenced, next step unlocks on completion) ───────────
function PathWalker({ path, onClose, onComplete, readOnly, busy }) {
  const steps = path.steps || []
  const mp = path.my_progress || {}
  const color = path.color || 'var(--t-accent)'
  // first not-done index is the "current" unlocked step
  const firstOpen = steps.findIndex(s => !mp[s.id]?.done)
  return (
    <div style={st.overlay} onClick={onClose}>
      <div style={st.modal} onClick={e => e.stopPropagation()}>
        <div style={st.cardHead}>
          <div><span style={{ fontSize: 14, fontWeight: 800 }}>{path.name}</span><div style={{ fontSize: 11, color: 'var(--t-text-muted)' }}>{path.description}</div></div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--t-text-muted)', fontSize: 22, cursor: 'pointer' }}>×</button>
        </div>
        <div style={{ ...st.cardBody, display: 'flex', flexDirection: 'column', gap: 0, maxHeight: '72vh', overflowY: 'auto' }}>
          {steps.length === 0 && <div style={{ fontSize: 12, color: 'var(--t-text-muted)' }}>This path has no steps.</div>}
          {steps.map((s, i) => {
            const rec = mp[s.id]
            const done = !!rec?.done
            const locked = !done && !readOnly && firstOpen !== -1 && i > firstOpen
            const current = !done && i === firstOpen
            return (
              <div key={s.id} style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '12px 0', borderBottom: i < steps.length - 1 ? '1px solid var(--t-line)' : 'none', opacity: locked ? 0.45 : 1 }}>
                <div style={{ width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, background: done ? color : 'var(--t-surface-2)', border: `1px solid ${current ? color : 'var(--t-line)'}`, color: done ? '#fff' : 'var(--t-text-muted)', flexShrink: 0 }}>{done ? '✓' : KIND_ICON[s.kind] || '•'}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{s.title}</div>
                  <div style={{ fontSize: 10, color: 'var(--t-text-faint)' }}>{s.kind}{s.mins ? ` · ${s.mins} min` : ''}{done && rec?.at ? ` · ✓ ${rec.by || ''} · ${new Date(rec.at).toLocaleDateString()}` : ''}</div>
                </div>
                {!readOnly && (done
                  ? <span style={{ fontSize: 10, color, fontWeight: 700 }}>DONE</span>
                  : locked
                    ? <span style={{ fontSize: 10, color: 'var(--t-text-faint)' }}>🔒 Locked</span>
                    : current
                      ? <button disabled={busy} style={{ ...st.btn, background: color, padding: '6px 12px', opacity: busy ? 0.6 : 1 }} onClick={() => onComplete(path, s.id)}>Complete</button>
                      : null)}
              </div>
            )
          })}
          {steps.length > 0 && firstOpen === -1 && !readOnly && <div style={{ fontSize: 12, color: 'var(--t-success)', fontWeight: 700, marginTop: 12 }}>🎉 Path complete — nice work!</div>}
        </div>
      </div>
    </div>
  )
}

// ── HR: compose a new path ────────────────────────────────────────────
function ComposePath({ onClose, onCreate, busy }) {
  const keyRef = useRef(1)
  const nextKey = () => `k-${keyRef.current++}`
  const [name, setName] = useState('')
  const [desc, setDesc] = useState('')
  const [role, setRole] = useState(ROLES[0])
  const [steps, setSteps] = useState(() => [{ key: 'k-0', title: '', kind: 'course', mins: 20 }])
  const setStep = (i, patch) => setSteps(s => s.map((x, idx) => idx === i ? { ...x, ...patch } : x))
  const addStep = () => setSteps(s => [...s, { key: nextKey(), title: '', kind: 'course', mins: 20 }])
  const rmStep = (i) => setSteps(s => s.filter((_, idx) => idx !== i))
  const valid = name.trim() && steps.length && steps.every(s => s.title.trim()) && !busy

  return (
    <div style={st.overlay} onClick={onClose}>
      <div style={st.modal} onClick={e => e.stopPropagation()}>
        <div style={st.cardHead}><span style={{ fontSize: 14, fontWeight: 800 }}>New Learning Path</span>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--t-text-muted)', fontSize: 22, cursor: 'pointer' }}>×</button></div>
        <div style={{ ...st.cardBody, display: 'flex', flexDirection: 'column', gap: 12, maxHeight: '72vh', overflowY: 'auto' }}>
          <div><div style={st.label}>Path Name</div><input value={name} onChange={e => setName(e.target.value)} style={{ ...st.inp, marginTop: 6 }} /></div>
          <div><div style={st.label}>Description</div><input value={desc} onChange={e => setDesc(e.target.value)} style={{ ...st.inp, marginTop: 6 }} /></div>
          <div><div style={st.label}>For Role</div>
            <select value={role} onChange={e => setRole(e.target.value)} style={{ ...st.inp, marginTop: 6 }}>{ROLES.map(r => <option key={r} value={r}>{r}</option>)}</select></div>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><div style={st.label}>Steps (in order)</div><button style={st.ghost} onClick={addStep}>+ Add step</button></div>
            {steps.map((s, i) => (
              <div key={s.key} style={{ display: 'flex', gap: 6, marginTop: 6, alignItems: 'center' }}>
                <span style={{ fontSize: 11, color: 'var(--t-text-faint)', width: 16 }}>{i + 1}</span>
                <input value={s.title} onChange={e => setStep(i, { title: e.target.value })} placeholder="Step title" style={{ ...st.inp, flex: 1 }} />
                <select value={s.kind} onChange={e => setStep(i, { kind: e.target.value })} style={{ ...st.inp, width: 110 }}>
                  {Object.keys(KIND_ICON).map(k => <option key={k} value={k}>{k}</option>)}
                </select>
                <button style={{ ...st.ghost, color: 'var(--t-danger)' }} onClick={() => rmStep(i)}>✕</button>
              </div>
            ))}
          </div>
          <button disabled={!valid} style={{ ...st.btn, opacity: valid ? 1 : 0.5, cursor: valid ? 'pointer' : 'not-allowed' }} onClick={() => onCreate({ name, desc, role, steps })}>Create Path</button>
        </div>
      </div>
    </div>
  )
}
