// TrainingTrack.jsx — my training, as recorded.
//
// The clone's version was a demo: a fake session ("Jordan Kim"), a fake supabase client, and
// stages, certificates and skill ratings drawn from a hash of the employee id. This screen
// reads hr.my_training_track(p_person_id) — training records and modules, LMS enrolments and
// courses, certifications (HR rows, the OS department certifications and the Metrc agent badge),
// department skill levels and training sessions — for the signed-in person, or for a person a
// manager picks. Nothing is invented; an empty section says what would fill it.
import { useState, useEffect, useMemo } from 'react'
import { sb } from '../lib/supabase'
import { useAuth } from '../lib/auth.jsx'
import { useScope } from '../lib/scope.jsx'

const fmtDate = (d) => d ? new Date(String(d).length === 10 ? d + 'T12:00:00' : d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'
const daysUntil = (d) => d ? Math.round((new Date(String(d).slice(0, 10) + 'T00:00:00') - new Date(new Date().toDateString())) / 86400000) : null

function KTile({ label, value, sub, color, alert }) {
  return (
    <div style={{ background: 'var(--t-surface)', border: `1px solid ${alert === 'red' ? 'var(--t-danger)' : alert === 'amber' ? 'var(--t-warn)' : 'var(--t-line)'}`, padding: '14px 16px', position: 'relative', overflow: 'hidden', flex: 1, minWidth: 140 }}>
      {alert === 'red' && <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'var(--t-danger)' }} />}
      {alert === 'amber' && <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'var(--t-warn)' }} />}
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.08em', color: 'var(--t-text-muted)', textTransform: 'uppercase', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800, color: color || 'var(--t-text)', lineHeight: 1, marginBottom: 4 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--t-text-faint)' }}>{sub}</div>}
    </div>
  )
}

function ProgressBar({ pct, color }) {
  const p = Math.max(0, Math.min(100, Number(pct) || 0))
  return <div style={{ height: 6, background: 'var(--t-line)' }}><div style={{ height: '100%', width: `${p}%`, background: color || 'var(--t-accent)' }} /></div>
}

const S = {
  wrap: { padding: '24px 28px', color: 'var(--t-text)', minHeight: '100vh', background: 'var(--t-bg)' },
  h1: { fontSize: 20, fontWeight: 800, letterSpacing: '.04em', margin: 0, textTransform: 'uppercase' },
  sub: { fontSize: 11, color: 'var(--t-text-muted)', marginTop: 3, maxWidth: 760 },
  card: { background: 'var(--t-surface)', border: '1px solid var(--t-line)', padding: 16 },
  head: { fontSize: 11, fontWeight: 700, letterSpacing: '.1em', color: 'var(--t-accent)', textTransform: 'uppercase', marginBottom: 10 },
  row: { display: 'flex', justifyContent: 'space-between', gap: 12, padding: '8px 0', borderBottom: '1px solid var(--t-line)', fontSize: 12, alignItems: 'center', flexWrap: 'wrap' },
  empty: { fontSize: 12, color: 'var(--t-text-faint)', padding: '8px 0' },
  pill: (c) => ({ fontSize: 9, fontWeight: 800, padding: '2px 7px', color: '#fff', background: c }),
  select: { background: 'var(--t-surface)', border: '1px solid var(--t-line)', color: 'var(--t-text)', padding: '6px 10px', fontSize: 12 },
}

export default function TrainingTrack() {
  const { session } = useAuth()
  const { locationIds } = useScope()
  const me = session?.person || {}
  const isManager = /admin|owner|coo|ceo|cfo|hr|manager|head|lead/i.test(me.role_name || '')
  const [personId, setPersonId] = useState(me.id || null)
  const [roster, setRoster] = useState([])
  const [track, setTrack] = useState(null)   // null = loading
  const [error, setError] = useState('')

  useEffect(() => {
    if (!isManager || !locationIds?.length) return undefined
    let live = true
    sb.rpc('get_roster', { p_node_ids: locationIds, p_actor: me.id || null }).then(({ data }) => { if (live && Array.isArray(data)) setRoster(data.filter(p => p.id)) })
    return () => { live = false }
  }, [JSON.stringify(locationIds), me.id, isManager])

  useEffect(() => {
    if (!personId) return undefined
    let live = true
    setTrack(null); setError('')
    sb.rpc('my_training_track', { p_person_id: personId }).then(({ data, error: e }) => {
      if (!live) return
      if (e) { setError(e.message); setTrack({ modules: [], courses: [], certifications: [], skills: [], sessions: [] }); return }
      setTrack(data || { modules: [], courses: [], certifications: [], skills: [], sessions: [] })
    })
    return () => { live = false }
  }, [personId])

  const modules = track?.modules || []
  const courses = track?.courses || []
  const certs = track?.certifications || []
  const skills = track?.skills || []
  const sessions = track?.sessions || []
  const k = useMemo(() => {
    const done = modules.filter(m => m.completed_at || ['completed', 'complete', 'passed'].includes(String(m.status || '').toLowerCase())).length + courses.filter(c => c.completed).length
    const total = modules.length + courses.length
    const expiring = certs.filter(c => { const d = daysUntil(c.expiry_date); return d != null && d <= 30 }).length
    const expired = certs.filter(c => { const d = daysUntil(c.expiry_date); return d != null && d < 0 }).length
    return { done, total, pct: total ? Math.round(done / total * 100) : null, expiring, expired, trained: skills.filter(s => /trained|certified|lead/i.test(s.level || '')).length }
  }, [modules, courses, certs, skills])

  return (
    <div style={S.wrap}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={S.h1}>Training Progress</h1>
          <div style={S.sub}>Modules, courses, certifications, department skill levels and training sessions as recorded for {track?.person?.full_name || me.full_name || 'you'}{track?.person?.role_name ? ` · ${track.person.role_name}` : ''}{track?.person?.hired_on ? ` · hired ${fmtDate(track.person.hired_on)}` : ''}. A section with no rows says what fills it.</div>
          {error && <div style={{ ...S.sub, color: 'var(--t-danger)' }}>Could not read the training track: {error}</div>}
        </div>
        {isManager && roster.length > 0 && (
          <label style={{ fontSize: 11, color: 'var(--t-text-muted)' }}>Person&nbsp;
            <select style={S.select} value={personId || ''} onChange={e => setPersonId(e.target.value || me.id)}>
              {me.id && <option value={me.id}>Me — {me.full_name}</option>}
              {roster.filter(p => p.id !== me.id).map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
            </select>
          </label>
        )}
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', margin: '18px 0' }}>
        <KTile label="Completion" value={k.pct == null ? '—' : `${k.pct}%`} sub={k.total ? `${k.done} of ${k.total} modules and courses` : 'nothing assigned yet'} color={k.pct == null ? 'var(--t-text-muted)' : k.pct >= 90 ? 'var(--t-success)' : k.pct >= 60 ? 'var(--t-warn)' : 'var(--t-danger)'} />
        <KTile label="Certifications" value={track === null ? '…' : certs.length} sub={k.expired ? `${k.expired} EXPIRED` : k.expiring ? `${k.expiring} due ≤30 d` : 'on record'} alert={k.expired ? 'red' : k.expiring ? 'amber' : undefined} color={k.expired ? 'var(--t-danger)' : k.expiring ? 'var(--t-warn)' : 'var(--t-text)'} />
        <KTile label="Departments trained" value={track === null ? '…' : k.trained} sub={`${skills.length} department skill row${skills.length === 1 ? '' : 's'}`} />
        <KTile label="Training sessions" value={track === null ? '…' : sessions.length} sub="with a trainer" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 16 }}>
        <div style={S.card}>
          <div style={S.head}>Modules</div>
          {track === null && <div style={S.empty}>Reading…</div>}
          {track !== null && modules.length === 0 && <div style={S.empty}>No training modules are assigned yet. HR assigns them in Training › Modules.</div>}
          {modules.map(m => {
            const done = m.completed_at || ['completed', 'complete', 'passed'].includes(String(m.status || '').toLowerCase())
            return (
              <div key={m.id} style={{ ...S.row, flexDirection: 'column', alignItems: 'stretch' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <span style={{ fontWeight: 600 }}>{m.module}{m.required ? <span style={{ ...S.pill('var(--t-danger)'), marginLeft: 6 }}>REQUIRED</span> : null}</span>
                  <span style={{ color: done ? 'var(--t-success)' : 'var(--t-text-muted)' }}>{done ? `completed ${fmtDate(m.completed_at)}` : (m.status || 'assigned')}{m.score != null ? ` · score ${m.score}` : ''}</span>
                </div>
                <ProgressBar pct={done ? 100 : m.progress_pct} color={done ? 'var(--t-success)' : 'var(--t-accent)'} />
                <div style={{ fontSize: 10, color: 'var(--t-text-faint)' }}>{m.category || ''}{m.expires_at ? ` · expires ${fmtDate(m.expires_at)}` : ''}{m.duration_minutes ? ` · ${m.duration_minutes} min` : ''}</div>
              </div>
            )
          })}
        </div>

        <div style={S.card}>
          <div style={S.head}>Courses (LMS)</div>
          {track === null && <div style={S.empty}>Reading…</div>}
          {track !== null && courses.length === 0 && <div style={S.empty}>No course enrolments yet. Enrol from Training › Academy.</div>}
          {courses.map(c => (
            <div key={c.id} style={{ ...S.row, flexDirection: 'column', alignItems: 'stretch' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <span style={{ fontWeight: 600 }}>{c.course}{c.required ? <span style={{ ...S.pill('var(--t-danger)'), marginLeft: 6 }}>REQUIRED</span> : null}</span>
                <span style={{ color: c.completed ? 'var(--t-success)' : 'var(--t-text-muted)' }}>{c.completed ? `completed ${fmtDate(c.completed_at)}` : c.due_date ? `due ${fmtDate(c.due_date)}` : 'in progress'}{c.score != null ? ` · ${c.score}` : ''}</span>
              </div>
              <ProgressBar pct={c.completed ? 100 : c.pct} color={c.completed ? 'var(--t-success)' : 'var(--t-accent)'} />
              <div style={{ fontSize: 10, color: 'var(--t-text-faint)' }}>{c.category || ''}{c.level ? ` · ${c.level}` : ''}{c.duration_hours ? ` · ${c.duration_hours} h` : ''}</div>
            </div>
          ))}
        </div>

        <div style={S.card}>
          <div style={S.head}>Certifications &amp; licences</div>
          {track === null && <div style={S.empty}>Reading…</div>}
          {track !== null && certs.length === 0 && <div style={S.empty}>No certifications on record. HR enters them on the employee file; the Metrc agent badge comes from the OS register.</div>}
          {certs.map(c => {
            const d = daysUntil(c.expiry_date)
            const tone = d == null ? 'var(--t-text-muted)' : d < 0 ? 'var(--t-danger)' : d <= 30 ? 'var(--t-warn)' : 'var(--t-success)'
            return (
              <div key={c.id} style={S.row}>
                <span style={{ fontWeight: 600 }}>{c.name}<span style={{ fontSize: 10, color: 'var(--t-text-faint)', marginLeft: 6 }}>{c.source === 'os' ? 'OS record' : 'HR record'}</span></span>
                <span style={{ color: tone }}>{c.expiry_date ? (d < 0 ? `EXPIRED ${Math.abs(d)} d ago` : `expires ${fmtDate(c.expiry_date)} · ${d} d`) : (c.status || 'no expiry')}</span>
              </div>
            )
          })}
        </div>

        <div style={S.card}>
          <div style={S.head}>Department skills</div>
          {track === null && <div style={S.empty}>Reading…</div>}
          {track !== null && skills.length === 0 && <div style={S.empty}>No department skill rows. The OS holds them (Human Resources › Employees › skills) and the drafter reads them.</div>}
          {skills.map(s => (
            <div key={s.id} style={S.row}>
              <span style={{ fontWeight: 600 }}>{s.department || '—'}</span>
              <span style={{ color: /trained|certified|lead/i.test(s.level || '') ? 'var(--t-success)' : 'var(--t-warn)' }}>{s.level || '—'}{s.trained_on ? ` · trained ${fmtDate(s.trained_on)}` : ''}{s.verified_on ? ` · verified ${fmtDate(s.verified_on)}` : ''}</span>
            </div>
          ))}
        </div>

        <div style={S.card}>
          <div style={S.head}>Training sessions</div>
          {track === null && <div style={S.empty}>Reading…</div>}
          {track !== null && sessions.length === 0 && <div style={S.empty}>No training sessions scheduled. Managers book them in Scheduling › Training.</div>}
          {sessions.map(s => (
            <div key={s.id} style={S.row}>
              <span style={{ fontWeight: 600 }}>{s.competency || 'Session'}{s.trainer ? ` with ${s.trainer}` : ''}</span>
              <span style={{ color: 'var(--t-text-muted)' }}>{fmtDate(s.train_date)}{s.slot ? ` · ${s.slot}` : ''} · {s.status || 'planned'}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
