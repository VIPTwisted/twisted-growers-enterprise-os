// CommandCenter.jsx — Monday.com-style management dashboard: multi-location
// oversight across every core workflow, aggregated from live RPCs. Read-only.
import { useState, useEffect, useCallback, useMemo } from 'react'
import { sb } from '../lib/supabase'
import { useAuth } from '../lib/auth.jsx'
import { useScope } from '../lib/scope.jsx'
import { useNavigate } from 'react-router-dom'
import DrillDown from '../components/DrillDown.jsx'
import AIAdvisor from '../components/AIAdvisor.jsx'
import { generateRecommendations } from '../lib/aiAdvisor.js'
import { companyName } from '../lib/config.js'

const APPLICANT_STAGES = ['applied', 'screening', 'interview', 'offer', 'hired']
const STAGE_LABEL = { applied: 'Applied', screening: 'Screening', interview: 'Interview', offer: 'Offer', hired: 'Hired' }
const num = (v) => (typeof v === 'number' ? v : Number(v) || 0)

function Bar({ label, value, max, color }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--t-text-muted)', marginBottom: 3 }}>
        <span>{label}</span><span style={{ fontWeight: 700, color: 'var(--t-text)' }}>{value}</span>
      </div>
      <div style={{ height: 8, background: 'var(--t-surface-2)', borderRadius: 0 }}>
        <div style={{ height: '100%', width: `${pct}%`, background: color || 'var(--t-accent)' }} />
      </div>
    </div>
  )
}

export default function CommandCenter() {
  const { session } = useAuth()
  const { locationIds, locations, nodes } = useScope()
  const nav = useNavigate()
  const person = session?.person
  // Execs see every incident company-wide, regardless of the scope selector.
  const seesAll = /admin|owner|coo|ceo|cfo|president|chief/i.test(person?.role_name || '')
  const incNodeIds = useMemo(() => seesAll ? Array.from(new Set((nodes || []).map(n => n.id))) : locationIds, [seesAll, nodes, locationIds])
  const [d, setD] = useState(null)
  const [loading, setLoading] = useState(false)
  const [drill, setDrill] = useState(null)

  const load = useCallback(async () => {
    if (!locationIds || !locationIds.length) return
    setLoading(true)
    const rpc = (fn, args) => sb.rpc(fn, args).then(r => r.error ? null : r.data).catch(() => null)
    try {
      const [hr, applicants, tasks, incidents, pending] = await Promise.all([
        rpc('hr_dashboard', { p_node_ids: locationIds }),
        rpc('get_applicants', { p_node_ids: locationIds }),
        rpc('get_tasks', { p_person_id: person?.id, p_node_ids: locationIds }),
        rpc('get_incidents', { p_node_ids: incNodeIds }),
        rpc('get_pending_requests', { p_node_ids: locationIds }),
      ])
      // De-dupe incidents by id (parent+child nodes can return an incident twice).
      const seen = new Set()
      const inc = (Array.isArray(incidents) ? incidents : []).filter(i => i.id == null || (!seen.has(i.id) && seen.add(i.id)))
      setD({ hr, applicants: applicants || [], tasks: tasks || [], incidents: inc, pending })
    } finally { setLoading(false) }
  }, [locationIds, incNodeIds, person?.id])
  useEffect(() => { load() }, [load])

  const m = useMemo(() => {
    const hr = d?.hr || {}
    const apps = d?.applicants || []
    const tasks = d?.tasks || []
    const inc = d?.incidents || []
    const timeOff = Array.isArray(d?.pending?.time_off) ? d.pending.time_off : (Array.isArray(d?.pending) ? d.pending : [])
    const openTasks = tasks.filter(t => !['completed', 'done', 'complete'].includes((t.status || '').toLowerCase()))
    const openInc = inc.filter(i => !['closed', 'resolved'].includes((i.status || '').toLowerCase()))
    const funnel = APPLICANT_STAGES.map(s => ({ s, n: apps.filter(a => (a.stage || '').toLowerCase() === s).length }))
    const incByType = Object.entries(inc.reduce((o, i) => { const k = i.inc_type || i.type || 'other'; o[k] = (o[k] || 0) + 1; return o }, {}))
    const byLoc = Array.isArray(hr.by_location) ? hr.by_location : []
    return {
      headcount: num(hr.headcount ?? hr.active),
      trainingOverdue: num(hr.training_overdue),
      docsPending: num(hr.docs_pending_ack),
      openTasks: openTasks.length, tasksTotal: tasks.length,
      approvals: timeOff.length,
      openInc: openInc.length, incTotal: inc.length,
      pipeline: apps.filter(a => !['hired', 'rejected'].includes((a.stage || '').toLowerCase())).length,
      // row sets behind each metric (for forensic drill-down)
      openTasksRows: openTasks, openIncRows: openInc,
      pipelineRows: apps.filter(a => !['hired', 'rejected'].includes((a.stage || '').toLowerCase())),
      allApps: apps,
      funnel, incByType, byLoc,
      maxFunnel: Math.max(1, ...funnel.map(f => f.n)),
      maxInc: Math.max(1, ...incByType.map(([, n]) => n)),
      timeOff,
    }
  }, [d])

  const recs = useMemo(() => generateRecommendations({
    byLoc: m.byLoc, timeOff: m.timeOff,
    incidents: d?.incidents || [], applicants: d?.applicants || [], tasks: d?.tasks || [],
  }), [m, d])

  const nameOf = (id) => locations?.find(l => l.id === id)?.name || '—'
  const cardS = { background: 'var(--t-surface)', border: '1px solid var(--t-line)', padding: 16 }
  const KTile = ({ label, value, color, onClick }) => (
    <div onClick={onClick} style={{ ...cardS, textAlign: 'center', cursor: onClick ? 'pointer' : 'default' }}>
      <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: '.08em', color: 'var(--t-text-muted)', textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 800, color: color || 'var(--t-text)', marginTop: 4, lineHeight: 1 }}>{value}</div>
    </div>
  )
  const H = ({ children, action }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
      <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: '.05em', color: 'var(--t-text-muted)', textTransform: 'uppercase' }}>{children}</div>
      {action}
    </div>
  )
  const link = (to) => <button onClick={() => nav(to)} style={{ background: 'transparent', border: 'none', color: 'var(--t-accent)', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>Open →</button>
  const dt = (v) => v ? new Date(v).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'

  // Forensic drill-down configs — each KPI tile opens the source rows behind it.
  const DRILLS = {
    headcount: { title: 'Active Headcount', subtitle: 'Employees by location', rows: m.byLoc, accent: 'var(--t-accent)',
      summary: [{ label: 'Total', value: m.headcount }, { label: 'Locations', value: m.byLoc.length }],
      columns: [
        { key: 'loc', label: 'Location', value: l => l.node_name || nameOf(l.node_id) },
        { key: 'headcount', label: 'Headcount', align: 'right', value: l => num(l.headcount), sortKey: l => num(l.headcount) },
        { key: 'training_overdue', label: 'Training Overdue', align: 'right', value: l => num(l.training_overdue), sortKey: l => num(l.training_overdue) },
      ] },
    tasks: { title: 'Open Tasks', subtitle: 'Every incomplete task in scope', rows: m.openTasksRows, accent: 'var(--t-accent)',
      summary: [{ label: 'Open', value: m.openTasks }, { label: 'Total', value: m.tasksTotal }],
      columns: [
        { key: 'title', label: 'Task', value: t => t.title || t.name || t.subject || '—' },
        { key: 'status', label: 'Status', value: t => t.status || '—' },
        { key: 'assignee', label: 'Assignee', value: t => t.assignee_name || t.assigned_to || t.owner || '—' },
        { key: 'priority', label: 'Priority', value: t => t.priority || '—' },
        { key: 'due', label: 'Due', value: t => dt(t.due_date), sortKey: t => t.due_date || '' },
        { key: 'loc', label: 'Location', value: t => t.node_name || t.location || '—' },
      ] },
    approvals: { title: 'Pending Approvals', subtitle: 'Time-off & leave awaiting review', rows: m.timeOff, accent: 'var(--t-warn)',
      summary: [{ label: 'Pending', value: m.approvals, color: 'var(--t-warn)' }],
      columns: [
        { key: 'person', label: 'Employee', value: r => r.person_name || '—' },
        { key: 'type', label: 'Type', value: r => r.type || 'PTO' },
        { key: 'days', label: 'Days', align: 'right', value: r => r.total_days ?? '—', sortKey: r => num(r.total_days) },
        { key: 'start', label: 'Start', value: r => dt(r.start_date), sortKey: r => r.start_date || '' },
        { key: 'end', label: 'End', value: r => dt(r.end_date), sortKey: r => r.end_date || '' },
        { key: 'status', label: 'Status', value: r => r.status || 'Pending' },
      ] },
    incidents: { title: 'Open Incidents', subtitle: 'Unresolved incidents in scope', rows: m.openIncRows, accent: 'var(--t-danger)',
      summary: [{ label: 'Open', value: m.openInc, color: m.openInc ? 'var(--t-danger)' : 'var(--t-success)' }, { label: 'Total', value: m.incTotal }],
      columns: [
        { key: 'type', label: 'Type', value: i => i.inc_type || i.type || '—' },
        { key: 'status', label: 'Status', value: i => i.status || '—' },
        { key: 'severity', label: 'Severity', value: i => i.severity || '—' },
        { key: 'location', label: 'Location', value: i => i.node_name || i.location || '—' },
        { key: 'who', label: 'Employee', value: i => i.employee_name || i.person_name || '—' },
        { key: 'date', label: 'Date', value: i => dt(i.occurred_at || i.created_at), sortKey: i => i.occurred_at || i.created_at || '' },
      ] },
    pipeline: { title: 'Recruiting Pipeline', subtitle: 'Active candidates (excludes hired/rejected)', rows: m.pipelineRows, accent: 'var(--t-accent)',
      summary: [{ label: 'Active', value: m.pipeline }, { label: 'All Applicants', value: m.allApps.length }],
      columns: [
        { key: 'name', label: 'Candidate', value: a => a.full_name || '—' },
        { key: 'position', label: 'Position', value: a => a.job_position || '—' },
        { key: 'stage', label: 'Stage', value: a => STAGE_LABEL[(a.stage || '').toLowerCase()] || a.stage || '—' },
        { key: 'source', label: 'Source', value: a => a.source || '—' },
        { key: 'applied', label: 'Applied', value: a => dt(a.applied_at), sortKey: a => a.applied_at || '' },
      ] },
    training: { title: 'Training Overdue', subtitle: 'Overdue training by location', rows: m.byLoc.filter(l => num(l.training_overdue) > 0), accent: 'var(--t-warn)',
      summary: [{ label: 'Overdue', value: m.trainingOverdue, color: m.trainingOverdue ? 'var(--t-warn)' : 'var(--t-success)' }],
      columns: [
        { key: 'loc', label: 'Location', value: l => l.node_name || nameOf(l.node_id) },
        { key: 'training_overdue', label: 'Overdue', align: 'right', value: l => num(l.training_overdue), sortKey: l => num(l.training_overdue) },
        { key: 'headcount', label: 'Headcount', align: 'right', value: l => num(l.headcount), sortKey: l => num(l.headcount) },
      ] },
  }
  const openDrill = (k) => setDrill(DRILLS[k])

  return (
    <div style={{ color: 'var(--t-text)', fontSize: 13 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-.3px' }}>Command Center</div>
          <div style={{ fontSize: 12, color: 'var(--t-text-muted)', marginTop: 2 }}>
            Live oversight across {locations?.length || 0} locations · {loading ? 'loading…' : 'up to date'}
          </div>
        </div>
        <button onClick={load} style={{ padding: '6px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer', background: 'var(--t-surface)', color: 'var(--t-text-muted)', border: '1px solid var(--t-line)' }}>Refresh</button>
      </div>

      {/* AI Operations Advisor — the platform brain, monitoring all live data */}
      <AIAdvisor recommendations={recs} title={"AI Operations Advisor — " + companyName() + " Command"} />

      {/* KPI row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: 8, marginBottom: 16 }}>
        <KTile label="Headcount" value={m.headcount} onClick={() => openDrill('headcount')} />
        <KTile label="Open Tasks" value={m.openTasks} color="var(--t-accent)" onClick={() => openDrill('tasks')} />
        <KTile label="Pending Approvals" value={m.approvals} color="var(--t-warn)" onClick={() => openDrill('approvals')} />
        <KTile label="Open Incidents" value={m.openInc} color={m.openInc ? 'var(--t-danger)' : 'var(--t-success)'} onClick={() => openDrill('incidents')} />
        <KTile label="In Pipeline" value={m.pipeline} color="var(--t-accent)" onClick={() => openDrill('pipeline')} />
        <KTile label="Training Overdue" value={m.trainingOverdue} color={m.trainingOverdue ? 'var(--t-warn)' : 'var(--t-success)'} onClick={() => openDrill('training')} />
      </div>
      <div style={{ fontSize: 11, color: 'var(--t-text-faint)', marginTop: -8, marginBottom: 16 }}>Tip: click any KPI tile to drill into the source records (searchable, sortable, exportable).</div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: 16, marginBottom: 16 }}>
        {/* By location */}
        <div style={cardS}>
          <H action={link('/hr-dashboard')}>By Location</H>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead><tr style={{ color: 'var(--t-text-muted)' }}>
              {['Location', 'Headcount', 'Training Overdue'].map(h => <th key={h} style={{ textAlign: h === 'Location' ? 'left' : 'right', padding: '6px 8px', fontSize: 9, fontWeight: 800, textTransform: 'uppercase', borderBottom: '1px solid var(--t-line)' }}>{h}</th>)}
            </tr></thead>
            <tbody>
              {m.byLoc.length === 0 ? <tr><td colSpan={3} style={{ padding: 16, textAlign: 'center', color: 'var(--t-text-faint)' }}>No location data</td></tr> :
                m.byLoc.map((l, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--t-line)' }}>
                    <td style={{ padding: '7px 8px', fontWeight: 600 }}>{l.node_name || nameOf(l.node_id)}</td>
                    <td style={{ padding: '7px 8px', textAlign: 'right' }}>{num(l.headcount)}</td>
                    <td style={{ padding: '7px 8px', textAlign: 'right', color: num(l.training_overdue) ? 'var(--t-warn)' : 'var(--t-text-muted)', fontWeight: 700 }}>{num(l.training_overdue)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>

        {/* Hiring funnel */}
        <div style={cardS}>
          <H action={link('/recruiting')}>Hiring Funnel</H>
          {m.funnel.every(f => f.n === 0) ? <div style={{ color: 'var(--t-text-faint)', fontSize: 12 }}>No candidates in scope.</div> :
            m.funnel.map(f => <Bar key={f.s} label={STAGE_LABEL[f.s]} value={f.n} max={m.maxFunnel} color={f.s === 'hired' ? 'var(--t-success)' : f.s === 'offer' ? 'var(--t-warn)' : 'var(--t-accent)'} />)}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {/* Incidents by type */}
        <div style={cardS}>
          <H action={link('/incidents-board')}>Incidents by Type</H>
          {m.incByType.length === 0 ? <div style={{ color: 'var(--t-text-faint)', fontSize: 12 }}>No incidents.</div> :
            m.incByType.map(([t, n]) => <Bar key={t} label={t} value={n} max={m.maxInc} color="var(--t-danger)" />)}
        </div>

        {/* Pending approvals */}
        <div style={cardS}>
          <H action={link('/time-off-board')}>Pending Approvals</H>
          {m.timeOff.length === 0 ? <div style={{ color: 'var(--t-success)', fontSize: 12, fontWeight: 600 }}>All caught up — no pending requests.</div> :
            m.timeOff.slice(0, 6).map((r, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: '1px solid var(--t-line)' }}>
                <div><span style={{ fontWeight: 700 }}>{r.person_name || 'Employee'}</span> <span style={{ color: 'var(--t-text-muted)', fontSize: 11 }}>· {r.type || 'PTO'}</span></div>
                <span style={{ fontSize: 11, color: 'var(--t-text-muted)' }}>{r.total_days ? `${r.total_days}d` : ''} {r.start_date ? new Date(r.start_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''}</span>
              </div>
            ))}
        </div>
      </div>

      <DrillDown open={!!drill} onClose={() => setDrill(null)} {...(drill || {})} />
    </div>
  )
}
