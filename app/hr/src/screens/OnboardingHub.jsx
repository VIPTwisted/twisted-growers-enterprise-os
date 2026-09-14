import { useState, useEffect, useCallback, useMemo } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth.jsx'
import { useScope } from '../lib/scope.jsx'
import { sb } from '../lib/supabase'

// ── SHARED COMPONENTS ─────────────────────────────────────

function KpiTile({ label, value, sub, accent, onClick }) {
  return (
    <div onClick={onClick} style={{
      background: 'var(--t-surface)', border: '1px solid var(--t-line)',
      borderTop: `3px solid ${accent || 'var(--t-accent)'}`,
      padding: '18px 20px', borderRadius: 0, flex: 1, minWidth: 140,
      cursor: onClick ? 'pointer' : 'default',
    }}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.1em', color: 'var(--t-text-muted)', textTransform: 'uppercase', marginBottom: 10 }}>{label}</div>
      <div style={{ fontSize: 32, fontWeight: 800, color: 'var(--t-text)', lineHeight: 1 }}>{value ?? '—'}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--t-text-muted)', marginTop: 6 }}>{sub}</div>}
    </div>
  )
}

const INP = { fontSize: 12, padding: '7px 10px', background: 'var(--t-surface)', border: '1px solid var(--t-line)', color: 'var(--t-text)', borderRadius: 0, outline: 'none' }
const BTN = { fontSize: 11, fontWeight: 700, padding: '7px 14px', background: 'var(--t-accent)', border: 'none', color: '#fff', borderRadius: 0, cursor: 'pointer', letterSpacing: '.04em' }
const GHOST_BTN = { fontSize: 11, fontWeight: 600, padding: '7px 14px', background: 'var(--t-surface)', border: '1px solid var(--t-line)', color: 'var(--t-text-muted)', borderRadius: 0, cursor: 'pointer', textDecoration: 'none', display: 'inline-block' }

function FilterBar({ dateFrom, setDateFrom, dateTo, setDateTo, search, setSearch, empId, setEmpId, onRefresh, extraFilters }) {
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', padding: '12px 0', marginBottom: 4 }}>
      <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--t-text-muted)', letterSpacing: '.08em' }}>FROM</label>
      <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={INP} />
      <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--t-text-muted)', letterSpacing: '.08em' }}>TO</label>
      <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} style={INP} />
      <input type="text" placeholder="Employee name..." value={search} onChange={e => setSearch(e.target.value)} style={{ ...INP, minWidth: 200 }} />
      <input type="text" placeholder="Employee ID..." value={empId} onChange={e => setEmpId(e.target.value)} style={{ ...INP, width: 130 }} />
      {extraFilters}
      <button style={BTN} onClick={onRefresh}>↺ Refresh</button>
    </div>
  )
}

function PageHeader({ title, sub, isLive, children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
      <div>
        <h1 style={{ fontSize: 20, fontWeight: 800, letterSpacing: '.05em', color: 'var(--t-text)', margin: 0, textTransform: 'uppercase' }}>{title}</h1>
        {sub && <div style={{ fontSize: 11, color: 'var(--t-text-muted)', marginTop: 3 }}>{sub}</div>}
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        {children}
        <span style={{ fontSize: 9, fontWeight: 800, padding: '4px 9px', background: isLive ? 'var(--t-success)' : 'var(--t-warn)', color: '#fff', letterSpacing: '.08em', borderRadius: 0 }}>
          {isLive ? 'LIVE' : 'DEMO'}
        </span>
      </div>
    </div>
  )
}

function QuickLinks({ links }) {
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 20 }}>
      {links.map(({ label, to }) => (
        <NavLink key={to} to={to} style={GHOST_BTN}>{label}</NavLink>
      ))}
    </div>
  )
}

function SectionCard({ title, badge, children, action }) {
  return (
    <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', borderRadius: 0, marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '11px 16px', borderBottom: '1px solid var(--t-line)', background: 'var(--t-surface-2)' }}>
        <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--t-text)' }}>{title}</span>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {badge && <span style={{ fontSize: 9, padding: '2px 8px', background: 'var(--t-accent)', color: '#fff', fontWeight: 700, letterSpacing: '.06em' }}>{badge}</span>}
          {action}
        </div>
      </div>
      <div style={{ padding: 16 }}>{children}</div>
    </div>
  )
}

// ── CONSTANTS ─────────────────────────────────────────────

const TODAY = new Date().toISOString().slice(0, 10)
const MONTH_AGO = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)

// Onboarding checklist definition (app configuration — NOT employee data).
// Task ids are stable keys persisted per person in onboarding_checklist_items.
// The section order derives the "Stage" a hire is currently in.
const CHECKLIST_SECTIONS = [
  { id: 'day1',   label: 'Day 1', items: [
    { id: 'i9',         label: 'I-9 Verification' },
    { id: 'w4',         label: 'W-4 Tax Form' },
    { id: 'dd_form',    label: 'Direct Deposit Form' },
    { id: 'sys_access', label: 'System Access Setup' },
    { id: 'id_badge',   label: 'ID Badge Issued' },
    { id: 'tour',       label: 'Store Tour' },
    { id: 'meet_team',  label: 'Meet the Team' },
  ] },
  { id: 'week1',  label: 'Week 1', items: [
    { id: 'prod_basics', label: 'Product Knowledge Basics' },
    { id: 'pos_train',   label: 'POS System Training' },
    { id: 'shadow_1',    label: 'Shadowing Shift 1' },
    { id: 'shadow_2',    label: 'Shadowing Shift 2' },
    { id: 'shadow_3',    label: 'Shadowing Shift 3' },
    { id: 'safety',      label: 'Safety Training' },
  ] },
  { id: 'month1', label: 'Month 1', items: [
    { id: 'solo_shifts', label: 'First Solo Shifts' },
    { id: 'checkin_30',  label: '30-Day Performance Check-In' },
    { id: 'module_1',    label: 'Training Module 1' },
    { id: 'module_2',    label: 'Training Module 2' },
    { id: 'module_3',    label: 'Training Module 3' },
    { id: 'module_4',    label: 'Training Module 4' },
    { id: 'module_5',    label: 'Training Module 5' },
  ] },
  { id: 'month3', label: 'Month 3', items: [
    { id: 'prod_cert',   label: 'Full Product Certification' },
    { id: 'review_90',   label: '90-Day Performance Review' },
    { id: 'benefits',    label: 'Benefits Enrollment' },
  ] },
]
const ALL_ITEMS = CHECKLIST_SECTIONS.flatMap(s => s.items.map(i => ({ ...i, section: s.id })))
const TOTAL_ITEMS = ALL_ITEMS.length
// Day-1 statutory documents — used for the "Docs Incomplete" KPI (real).
const DOC_TASK_IDS = ['i9', 'w4', 'dd_form']

// Merge a person's stored checklist state (from get_onboarding_checklist_bulk)
// onto the template. No fabricated completion — unstored tasks are simply undone.
function mergeChecklist(stored) {
  const byId = Object.fromEntries((stored || []).map(t => [t.task_id, t]))
  return ALL_ITEMS.map(item => {
    const s = byId[item.id] || {}
    return {
      ...item,
      done: !!s.done,
      doneAt: s.done_at || null,
      doneBy: s.done_by_name || null,
      note: s.note || '',
    }
  })
}

// Current stage = the first section that still has an incomplete task.
function deriveStage(tasks) {
  for (const sec of CHECKLIST_SECTIONS) {
    const secTasks = tasks.filter(t => t.section === sec.id)
    if (secTasks.some(t => !t.done)) return sec.label
  }
  return 'Complete'
}

// Map a real onboarding_pipeline row + its persisted checklist into the table shape.
// Pipeline row fields: role, days_in, node_id, hired_at, login_id, full_name,
// node_name, person_id, docs_signed, training_done, training_total.
function mapRow(r, storedByPerson) {
  const tasks = mergeChecklist(storedByPerson[r.person_id])
  const doneCount = tasks.filter(t => t.done).length
  const docsPct = TOTAL_ITEMS ? Math.round((doneCount / TOTAL_ITEMS) * 100) : 0
  const docsDone = DOC_TASK_IDS.every(id => tasks.find(t => t.id === id)?.done)
  const daysIn = Number(r.days_in) || 0
  const status = docsPct >= 100 ? 'COMPLETE' : (daysIn > 30 ? 'DELAYED' : 'IN PROGRESS')
  return {
    id: r.person_id,
    name: r.full_name || '—',
    node: r.node_name || '—',
    role: r.role || '—',
    start: r.hired_at ? String(r.hired_at).slice(0, 10) : '—',
    daysIn,
    stage: deriveStage(tasks),
    docsPct,
    docsDone,
    doneCount,
    total: TOTAL_ITEMS,
    status,
  }
}

// ── STATUS BADGE ──────────────────────────────────────────
function StatusBadge({ status }) {
  const bg =
    status === 'COMPLETE' ? 'var(--t-success)'
    : status === 'DELAYED' ? 'var(--t-warn)'
    : 'var(--t-accent)'
  return (
    <span style={{ fontSize: 9, fontWeight: 800, padding: '3px 8px', background: bg, color: '#fff', letterSpacing: '.06em', borderRadius: 0 }}>
      {status}
    </span>
  )
}

// ── PROGRESS BAR ─────────────────────────────────────────
function ProgressBar({ pct }) {
  const color = pct === 100 ? 'var(--t-success)' : pct >= 50 ? 'var(--t-accent)' : 'var(--t-warn)'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={{ flex: 1, height: 6, background: 'var(--t-line)', borderRadius: 0 }}>
        <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 0, transition: 'width .3s' }} />
      </div>
      <span style={{ fontSize: 10, color: 'var(--t-text-muted)', minWidth: 28, textAlign: 'right' }}>{pct}%</span>
    </div>
  )
}

// ── TABLE STYLES ──────────────────────────────────────────
const S = {
  wrap: { padding: '24px 28px', color: 'var(--t-text)', minHeight: '100vh', background: 'var(--t-bg)' },
  kpiRow: { display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 20 },
  th: { fontSize: 10, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--t-text-muted)', padding: '9px 12px', textAlign: 'left', borderBottom: '1px solid var(--t-line)', background: 'var(--t-surface-2)', whiteSpace: 'nowrap' },
  td: { fontSize: 12, padding: '10px 12px', borderBottom: '1px solid var(--t-line)', verticalAlign: 'middle', color: 'var(--t-text)' },
  trHover: { background: 'var(--t-surface-2)', cursor: 'pointer' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 12 },
  pipeCard: { background: 'var(--t-surface)', border: '1px solid var(--t-line)', borderRadius: 0, padding: '18px 20px', flex: 1, minWidth: 150 },
  checkItem: { display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--t-line)' },
}

// ── MAIN SCREEN ───────────────────────────────────────────

export default function OnboardingHub() {
  const { session } = useAuth()
  const { locationIds } = useScope()
  const navigate = useNavigate()

  const [dateFrom, setDateFrom] = useState(MONTH_AGO)
  const [dateTo, setDateTo] = useState(TODAY)
  const [search, setSearch] = useState('')
  const [empId, setEmpId] = useState('')
  const [loading, setLoading] = useState(false)
  const [rows, setRows] = useState([])
  const [funnel, setFunnel] = useState({ applications: 0, interviews: 0, offers: 0 })
  const [selectedRow, setSelectedRow] = useState(null)
  const [hoveredRow, setHoveredRow] = useState(null)
  const [selectedId, setSelectedId] = useState(null)
  const [checklist, setChecklist] = useState([])

  const nodeKey = (locationIds || []).join(',')
  const actorId = session?.person?.id || null
  const actorName = session?.person?.full_name || session?.person?.display_name || 'Manager'

  // Load the real onboarding roster + persisted checklists, all scoped to the
  // caller's locations. onboarding_pipeline + get_onboarding_checklist_bulk +
  // get_job_applications are all SECURITY DEFINER RPCs. No fake fallback — an
  // empty scope or empty backend renders an honest empty state.
  const load = useCallback(async () => {
    if (!locationIds || !locationIds.length) {
      setRows([]); setFunnel({ applications: 0, interviews: 0, offers: 0 }); return
    }
    setLoading(true)
    try {
      const { data: pipe, error } = await sb.rpc('onboarding_pipeline', { p_node_ids: locationIds })
      if (error) throw error
      const roster = Array.isArray(pipe) ? pipe : (pipe ? [pipe].flat() : [])
      const personIds = roster.map(r => r.person_id).filter(Boolean)

      const storedByPerson = {}
      if (personIds.length) {
        const { data: ck } = await sb.rpc('get_onboarding_checklist_bulk', { p_person_ids: personIds })
        if (Array.isArray(ck)) {
          for (const item of ck) {
            (storedByPerson[item.person_id] ||= []).push(item)
          }
        }
      }
      setRows(roster.map(r => mapRow(r, storedByPerson)))
    } catch {
      setRows([])
    } finally {
      setLoading(false)
    }

    // Real hiring funnel from the ATS (applicant_records via get_job_applications).
    try {
      const { data: apps } = await sb.rpc('get_job_applications', { p_node_ids: locationIds })
      const list = Array.isArray(apps) ? apps : []
      setFunnel({
        applications: list.filter(a => a.stage === 'applied' || a.stage === 'screening').length,
        interviews: list.filter(a => a.stage === 'interview').length,
        offers: list.filter(a => a.stage === 'offer').length,
      })
    } catch {
      setFunnel({ applications: 0, interviews: 0, offers: 0 })
    }
  }, [nodeKey])

  useEffect(() => { load() }, [load])

  // Select row → load that person's persisted checklist from the DB.
  const handleSelectRow = useCallback((rowIdx, id) => {
    setSelectedRow(rowIdx)
    setSelectedId(id)
    setChecklist([])
    if (!id) return
    sb.rpc('get_onboarding_checklist', { p_person_id: id })
      .then(({ data }) => setChecklist(mergeChecklist(Array.isArray(data) ? data : [])))
      .catch(() => setChecklist(mergeChecklist([])))
  }, [])

  // Toggle a checklist item; optimistic update, then persist (done + note) and
  // refresh the roster so progress/KPIs reflect the real stored state.
  const toggleCheck = useCallback((i) => {
    if (!selectedId) return
    let payload = null
    setChecklist(prev => {
      const next = prev.map((c, idx) => {
        if (idx !== i) return c
        const done = !c.done
        payload = { task_id: c.id, done, note: c.note || '' }
        return done
          ? { ...c, done, doneAt: new Date().toISOString(), doneBy: actorName }
          : { ...c, done, doneAt: null, doneBy: null }
      })
      return next
    })
    if (payload) {
      sb.rpc('set_onboarding_checklist_item', {
        p_person_id: selectedId, p_task_id: payload.task_id,
        p_done: payload.done, p_note: payload.note, p_actor: actorId,
      }).then(({ error }) => { if (!error) load() }).catch(() => {})
    }
  }, [selectedId, actorId, actorName, load])

  // Edit the note on a checklist item; optimistic, then persist.
  const setNote = useCallback((i, note) => {
    if (!selectedId) return
    let payload = null
    setChecklist(prev => prev.map((c, idx) => {
      if (idx !== i) return c
      payload = { task_id: c.id, done: c.done }
      return { ...c, note }
    }))
    if (payload) {
      sb.rpc('set_onboarding_checklist_item', {
        p_person_id: selectedId, p_task_id: payload.task_id,
        p_done: payload.done, p_note: note, p_actor: actorId,
      }).catch(() => {})
    }
  }, [selectedId, actorId])

  // Drill through to the clicked hire's real forensic file.
  const openFile = useCallback((r) => {
    navigate('/employee-360', { state: { personId: r.id, personName: r.name } })
  }, [navigate])

  // The screen is always wired to the live backend; there is no demo mode.
  const isLive = true

  // Filter by search/empId/date range
  const filtered = useMemo(() => {
    const q = search.toLowerCase(), eId = empId.toLowerCase()
    return rows.filter(r => {
      if (q && !r.name.toLowerCase().includes(q)) return false
      if (eId && !String(r.id).toLowerCase().includes(eId)) return false
      if (r.start !== '—') {
        if (dateFrom && r.start < dateFrom) return false
        if (dateTo && r.start > dateTo) return false
      }
      return true
    })
  }, [rows, search, empId, dateFrom, dateTo])

  const person = session?.person || {}

  // KPI values — DERIVED from the real onboarding data
  const kpis = useMemo(() => {
    const inProg = rows.filter(r => r.status !== 'COMPLETE')
    const docsPending = rows.filter(r => !r.docsDone).length
    const delayed = rows.filter(r => r.status === 'DELAYED').length
    const complete = rows.filter(r => r.status === 'COMPLETE').length
    const newHires = rows.filter(r => r.start !== '—' && r.start >= MONTH_AGO).length
    const avgDocs = rows.length ? Math.round(rows.reduce((s, r) => s + r.docsPct, 0) / rows.length) : 0
    return { active: inProg.length, docsPending, delayed, complete, newHires, avgDocs }
  }, [rows])

  return (
    <div style={S.wrap}>
      <PageHeader
        title="Onboarding Hub"
        sub={`Welcome, ${person.full_name || 'Manager'} — ${person.role_name || ''}`}
        isLive={isLive}
      />

      <FilterBar
        dateFrom={dateFrom} setDateFrom={setDateFrom}
        dateTo={dateTo} setDateTo={setDateTo}
        search={search} setSearch={setSearch}
        empId={empId} setEmpId={setEmpId}
        onRefresh={load}
      />

      {/* KPI TILES — derived from live data */}
      <div style={S.kpiRow}>
        <KpiTile label="Active Onboardings" value={kpis.active} sub="Currently in progress" />
        <KpiTile label="Docs Incomplete" value={kpis.docsPending} sub="Missing I-9 / W-4 / Direct Deposit" accent="var(--t-warn)" />
        <KpiTile label="Avg Checklist Complete" value={`${kpis.avgDocs}%`} sub="Across all onboardings" />
        <KpiTile label="New Hires This Month" value={kpis.newHires} sub={`Since ${MONTH_AGO}`} accent="var(--t-success)" />
        <KpiTile label="Delayed" value={kpis.delayed} sub=">30 days, not complete" accent="var(--t-warn)" />
        <KpiTile label="Completed" value={kpis.complete} sub="Fully onboarded" accent="var(--t-success)" />
      </div>

      {/* QUICK LINKS */}
      <QuickLinks links={[
        { label: 'Onboarding', to: '/onboarding' },
        { label: 'Documents', to: '/documents' },
        { label: 'ATS', to: '/ats' },
        { label: 'Pipeline', to: '/pipeline' },
        { label: 'HR Messages', to: '/hr-messages' },
        { label: 'App Import', to: '/app-import' },
      ]} />

      {/* ACTIVE ONBOARDINGS TABLE */}
      <SectionCard
        title="Active Onboardings"
        badge={loading ? 'LOADING…' : `${filtered.length} RECORDS`}
        action={
          <button style={{ ...BTN, fontSize: 10 }} onClick={load}>Refresh</button>
        }
      >
        <div style={{ overflowX: 'auto' }}>
          <table style={S.table}>
            <thead>
              <tr>
                <th style={S.th}>Employee Name</th>
                <th style={S.th}>ID</th>
                <th style={S.th}>Start Date</th>
                <th style={S.th}>Location</th>
                <th style={S.th}>Stage</th>
                <th style={S.th}>Checklist %</th>
                <th style={S.th}>Days In</th>
                <th style={S.th}>Status</th>
                <th style={S.th}></th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={9} style={{ ...S.td, textAlign: 'center', color: 'var(--t-text-faint)', padding: '24px 12px' }}>
                    No onboarding records match current filters.
                  </td>
                </tr>
              )}
              {filtered.map((r, i) => {
                const isSelected = selectedRow === i
                const isHovered = hoveredRow === i
                return (
                  <tr
                    key={r.id || i}
                    onClick={() => handleSelectRow(i, r.id)}
                    onMouseEnter={() => setHoveredRow(i)}
                    onMouseLeave={() => setHoveredRow(null)}
                    style={{
                      background: isSelected
                        ? 'rgba(var(--t-accent-rgb, 41,121,255), 0.08)'
                        : isHovered ? 'var(--t-surface-2)' : 'transparent',
                      cursor: 'pointer',
                      outline: isSelected ? '1px solid var(--t-accent)' : 'none',
                    }}
                  >
                    <td style={S.td}>
                      <span
                        onClick={(e) => { e.stopPropagation(); openFile(r) }}
                        title={`Open ${r.name}'s forensic file`}
                        style={{ fontWeight: 600, color: 'var(--t-accent)', cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 2 }}
                      >
                        {r.name}
                      </span>
                      <span style={{ fontSize: 10, color: 'var(--t-text-faint)', marginLeft: 8 }}>· checklist {r.doneCount}/{r.total}</span>
                    </td>
                    <td style={{ ...S.td, color: 'var(--t-text-muted)', fontFamily: 'monospace', fontSize: 11 }}>
                      {String(r.id || '—').slice(0, 8).toUpperCase()}
                    </td>
                    <td style={S.td}>{r.start}</td>
                    <td style={S.td}>{r.node}</td>
                    <td style={S.td}>
                      <span style={{ fontSize: 11, color: 'var(--t-text-muted)' }}>{r.stage || '—'}</span>
                    </td>
                    <td style={{ ...S.td, minWidth: 120 }}>
                      <ProgressBar pct={r.docsPct} />
                    </td>
                    <td style={{ ...S.td, color: 'var(--t-text-muted)' }}>{r.start !== '—' ? `Day ${r.daysIn}` : '—'}</td>
                    <td style={S.td}>
                      <StatusBadge status={r.status} />
                    </td>
                    <td style={S.td}>
                      <button
                        onClick={(e) => { e.stopPropagation(); openFile(r) }}
                        style={{ ...GHOST_BTN, fontSize: 10, padding: '4px 10px' }}
                      >
                        Open File ↗
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {selectedRow !== null && (
          <div style={{ marginTop: 10, fontSize: 11, color: 'var(--t-text-muted)' }}>
            Row selected — checklist below reflects this employee.
            <button
              style={{ ...GHOST_BTN, marginLeft: 10, fontSize: 10, padding: '4px 10px' }}
              onClick={() => { setSelectedRow(null); setChecklist([]) }}
            >
              Clear Selection
            </button>
          </div>
        )}
      </SectionCard>

      {/* NEW HIRE CHECKLIST — persisted, audit-stamped, per employee */}
      <SectionCard
        title="New Hire Checklist"
        badge={selectedRow !== null ? (filtered[selectedRow]?.name || 'Employee') : 'SELECT ROW'}
        action={
          checklist.length > 0 && (
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <span style={{ fontSize: 10, color: 'var(--t-text-muted)' }}>
                {checklist.filter(c => c.done).length} / {checklist.length} complete
              </span>
              {filtered[selectedRow] && (
                <button style={{ ...GHOST_BTN, fontSize: 10, padding: '4px 10px' }}
                  onClick={() => openFile(filtered[selectedRow])}>Open Full File ↗</button>
              )}
            </div>
          )
        }
      >
        {checklist.length === 0 ? (
          <div style={{ color: 'var(--t-text-faint)', fontSize: 12, padding: '12px 0' }}>
            Select an employee row above to view and edit their checklist.
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '4px 24px' }}>
            {checklist.map((c, i) => (
              <div key={i} style={{ padding: '10px 0', borderBottom: '1px solid var(--t-line)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }} onClick={() => toggleCheck(i)}>
                  <div style={{
                    width: 18, height: 18, border: `2px solid ${c.done ? 'var(--t-success)' : 'var(--t-line)'}`,
                    background: c.done ? 'var(--t-success)' : 'transparent',
                    borderRadius: 0, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {c.done && <span style={{ color: '#fff', fontSize: 11, lineHeight: 1, fontWeight: 800 }}>✓</span>}
                  </div>
                  <span style={{
                    fontSize: 12, flex: 1,
                    color: c.done ? 'var(--t-text-muted)' : 'var(--t-text)',
                    textDecoration: c.done ? 'line-through' : 'none',
                  }}>
                    {c.label}
                  </span>
                  {c.done && c.doneAt && (
                    <span style={{ fontSize: 9, color: 'var(--t-success)', whiteSpace: 'nowrap' }}>
                      ✓ {c.doneBy || ''} · {new Date(c.doneAt).toLocaleDateString()}
                    </span>
                  )}
                </div>
                <input
                  type="text" value={c.note || ''} placeholder="Add note…"
                  onChange={(e) => setNote(i, e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  style={{ ...INP, fontSize: 11, width: '100%', marginTop: 6, marginLeft: 28, maxWidth: 'calc(100% - 28px)' }}
                />
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {/* PIPELINE SNAPSHOT */}
      <SectionCard title="Pipeline Snapshot" badge="HIRING FUNNEL">
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <div style={S.pipeCard}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.1em', color: 'var(--t-text-muted)', textTransform: 'uppercase', marginBottom: 10 }}>Applications</div>
            <div style={{ fontSize: 36, fontWeight: 800, color: 'var(--t-text)', lineHeight: 1 }}>{funnel.applications}</div>
            <div style={{ fontSize: 11, color: 'var(--t-text-muted)', marginTop: 6 }}>Applied / screening</div>
            <div style={{ marginTop: 12, height: 3, background: 'var(--t-accent)', borderRadius: 0 }} />
          </div>
          <div style={S.pipeCard}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.1em', color: 'var(--t-text-muted)', textTransform: 'uppercase', marginBottom: 10 }}>Interviews Scheduled</div>
            <div style={{ fontSize: 36, fontWeight: 800, color: 'var(--t-text)', lineHeight: 1 }}>{funnel.interviews}</div>
            <div style={{ fontSize: 11, color: 'var(--t-text-muted)', marginTop: 6 }}>In interview stage</div>
            <div style={{ marginTop: 12, height: 3, background: 'var(--t-warn)', borderRadius: 0 }} />
          </div>
          <div style={S.pipeCard}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.1em', color: 'var(--t-text-muted)', textTransform: 'uppercase', marginBottom: 10 }}>Offers Extended</div>
            <div style={{ fontSize: 36, fontWeight: 800, color: 'var(--t-text)', lineHeight: 1 }}>{funnel.offers}</div>
            <div style={{ fontSize: 11, color: 'var(--t-text-muted)', marginTop: 6 }}>Pending acceptance</div>
            <div style={{ marginTop: 12, height: 3, background: 'var(--t-success)', borderRadius: 0 }} />
          </div>
        </div>
      </SectionCard>
    </div>
  )
}
