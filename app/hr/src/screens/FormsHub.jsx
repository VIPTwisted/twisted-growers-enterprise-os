import { useState, useEffect, useCallback, useMemo } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useScope } from '../lib/scope.jsx'
import { sb } from '../lib/supabase'
import DrillDown from '../components/DrillDown.jsx'

// ── SHARED COMPONENTS ────────────────────────────────────────────────────────

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

// ── CONSTANTS ────────────────────────────────────────────────────────────────

const TODAY = new Date().toISOString().slice(0, 10)
const MONTH_AGO = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)

const CATEGORIES = ['All', 'Discipline', 'Leave', 'Payroll', 'HR', 'New Hire', 'Compliance']

const FORM_CATEGORIES = {
  'Discipline': [
    { name: 'Verbal Warning Form',         to: '/disciplinary',   cat: 'Discipline' },
    { name: 'Written Warning Form',        to: '/disciplinary',   cat: 'Discipline' },
    { name: 'Final Warning Form',          to: '/disciplinary',   cat: 'Discipline' },
    { name: 'Employee Suspension Form',    to: '/suspensions',    cat: 'Discipline' },
    { name: 'Performance Improvement Plan',to: '/disciplinary',   cat: 'Discipline' },
  ],
  'Leave & Time': [
    { name: 'PTO / Leave Request',         to: '/requests',       cat: 'Leave' },
    { name: 'FMLA / Leave Request',        to: '/fmla-loa',       cat: 'Leave' },
    { name: 'Timesheet Submission',        to: '/forms',          cat: 'Leave' },
    { name: 'Return to Work Form',         to: '/hr-ops',         cat: 'Leave' },
  ],
  'HR & Onboarding': [
    { name: 'New Hire Checklist',          to: '/onboarding',     cat: 'New Hire' },
    { name: 'New Hire Document Packet',    to: '/documents',      cat: 'New Hire' },
    { name: 'Direct Deposit Change',       to: '/direct-deposit', cat: 'HR' },
    { name: 'Emergency Contact Form',      to: '/emergency-contacts', cat: 'HR' },
    { name: 'I-9 Verification',            to: '/onboarding',     cat: 'New Hire' },
  ],
  'Incidents & Compliance': [
    { name: 'Incident Report',             to: '/incidents',      cat: 'Compliance' },
    { name: 'Workers Comp Claim',          to: '/workers-comp',   cat: 'Compliance' },
    { name: 'Exit Interview Form',         to: '/exit-interviews',cat: 'HR' },
    { name: 'HR Investigation Form',       to: '/hr-investigations', cat: 'Compliance' },
    { name: 'Employee Separation Form',    to: '/hr-ops',         cat: 'HR' },
  ],
  'Payroll': [
    { name: 'Timesheet Correction',        to: '/forms',          cat: 'Payroll' },
    { name: 'Pay Stub Request',            to: '/payroll',        cat: 'Payroll' },
    { name: 'Payroll Discrepancy',         to: '/payroll',        cat: 'Payroll' },
  ],
}

const STATUS_META = {
  PENDING:  { label: 'PENDING',  bg: 'var(--t-warn)',    color: '#fff' },
  APPROVED: { label: 'APPROVED', bg: 'var(--t-success)', color: '#fff' },
  DENIED:   { label: 'DENIED',   bg: 'var(--t-danger)',  color: '#fff' },
  COMPLETE: { label: 'COMPLETE', bg: 'var(--t-success)', color: '#fff' },
}

// ── S — STYLE OBJECT ─────────────────────────────────────────────────────────

const S = {
  page: {
    background: 'var(--t-bg)',
    minHeight: '100vh',
    padding: '28px 32px',
    fontFamily: "'Inter', 'Segoe UI', sans-serif",
    color: 'var(--t-text)',
    borderRadius: 0,
  },
  kpiRow: {
    display: 'flex',
    gap: 12,
    flexWrap: 'wrap',
    marginBottom: 24,
  },
  catBar: {
    display: 'flex',
    gap: 6,
    flexWrap: 'wrap',
    marginBottom: 20,
  },
  catBtn: (active) => ({
    fontSize: 11,
    fontWeight: 700,
    padding: '6px 14px',
    background: active ? 'var(--t-accent)' : 'var(--t-surface)',
    border: `1px solid ${active ? 'var(--t-accent)' : 'var(--t-line)'}`,
    color: active ? '#fff' : 'var(--t-text-muted)',
    borderRadius: 0,
    cursor: 'pointer',
    letterSpacing: '.05em',
    textTransform: 'uppercase',
  }),
  dirGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 16,
    marginBottom: 24,
  },
  formRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '9px 0',
    borderBottom: '1px solid var(--t-line)',
  },
  formName: {
    fontSize: 13,
    color: 'var(--t-text)',
    fontWeight: 500,
  },
  openLink: {
    fontSize: 11,
    fontWeight: 700,
    color: 'var(--t-accent)',
    textDecoration: 'none',
    letterSpacing: '.04em',
    whiteSpace: 'nowrap',
    padding: '4px 10px',
    border: '1px solid var(--t-accent)',
    borderRadius: 0,
    background: 'transparent',
    cursor: 'pointer',
    display: 'inline-block',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: 12,
  },
  th: {
    textAlign: 'left',
    fontSize: 10,
    fontWeight: 800,
    letterSpacing: '.08em',
    textTransform: 'uppercase',
    color: 'var(--t-text-muted)',
    padding: '8px 12px',
    borderBottom: '2px solid var(--t-line)',
    background: 'var(--t-surface-2)',
    borderRadius: 0,
  },
  td: {
    padding: '9px 12px',
    borderBottom: '1px solid var(--t-line)',
    color: 'var(--t-text)',
    verticalAlign: 'middle',
  },
  tdMuted: {
    padding: '9px 12px',
    borderBottom: '1px solid var(--t-line)',
    color: 'var(--t-text-muted)',
    verticalAlign: 'middle',
    fontSize: 11,
  },
  statusBadge: (status) => ({
    fontSize: 9,
    fontWeight: 800,
    letterSpacing: '.08em',
    padding: '3px 8px',
    background: STATUS_META[status]?.bg || 'var(--t-surface-2)',
    color: STATUS_META[status]?.color || 'var(--t-text)',
    borderRadius: 0,
    display: 'inline-block',
  }),
}

// ── FORM LINK ITEM ────────────────────────────────────────────────────────────

function FormLinkItem({ name, to }) {
  return (
    <div style={S.formRow}>
      <span style={S.formName}>{name}</span>
      <NavLink to={to} style={S.openLink}>→ Open Form</NavLink>
    </div>
  )
}

// ── MAIN SCREEN ──────────────────────────────────────────────────────────────

export default function FormsHub() {
  const { locationIds } = useScope()
  const navigate = useNavigate()

  const [dateFrom, setDateFrom]   = useState(MONTH_AGO)
  const [dateTo, setDateTo]       = useState(TODAY)
  const [search, setSearch]       = useState('')
  const [empId, setEmpId]         = useState('')
  const [category, setCategory]   = useState('All')
  const [isLive, setIsLive]       = useState(false)
  const [recentRows, setRecentRows] = useState([])
  const [kpis, setKpis]           = useState(null)
  const [loadingRecent, setLoadingRecent] = useState(false)
  const [drill, setDrill] = useState(null)

  const nodeScope = locationIds?.length ? locationIds : null

  const fetchRecent = useCallback(async () => {
    setLoadingRecent(true)
    try {
      const { data, error } = await sb.rpc('rpc_formshub_feed', {
        p_date_from: dateFrom,
        p_date_to: dateTo,
        p_search: search || null,
        p_emp_id: empId || null,
        p_node_ids: nodeScope,
      })
      if (error) throw error
      setRecentRows(Array.isArray(data) ? data : [])
      setIsLive(true)
    } catch {
      // Honest empty state — never fabricate submissions.
      setRecentRows([])
      setIsLive(false)
    } finally {
      setLoadingRecent(false)
    }
  }, [dateFrom, dateTo, search, empId, nodeScope])

  const fetchKpis = useCallback(async () => {
    try {
      const { data, error } = await sb.rpc('rpc_formshub_kpis', { p_node_ids: nodeScope })
      if (error) throw error
      setKpis(data || null)
    } catch {
      setKpis(null)
    }
  }, [nodeScope])

  useEffect(() => { fetchRecent(); fetchKpis() }, [nodeScope])

  const filteredRecent = useMemo(() => {
    let rows = recentRows
    if (search) rows = rows.filter(r => r.employee?.toLowerCase().includes(search.toLowerCase()))
    if (empId)  rows = rows.filter(r => r.id?.toLowerCase().includes(empId.toLowerCase()))
    return rows
  }, [recentRows, search, empId])

  const isCatVisible = useCallback((cat) => {
    if (category === 'All') return true
    const catMap = {
      'Discipline':          'Discipline',
      'Leave & Time':        'Leave',
      'HR & Onboarding':     ['HR', 'New Hire'],
      'Incidents & Compliance': 'Compliance',
      'Payroll':             'Payroll',
    }
    return false // handled per-category below
  }, [category])

  const shouldShowCategory = (catKey) => {
    if (category === 'All') return true
    const catMap = {
      'Discipline':             ['Discipline'],
      'Leave & Time':           ['Leave'],
      'HR & Onboarding':        ['HR', 'New Hire'],
      'Incidents & Compliance': ['Compliance', 'HR'],
      'Payroll':                ['Payroll'],
    }
    const allowed = catMap[catKey] || []
    return allowed.includes(category)
  }

  const filteredFormCategories = Object.entries(FORM_CATEGORIES).filter(([key]) => shouldShowCategory(key))

  // ── KPI VALUES (real, from rpc_formshub_kpis) ─────────────────────────────────
  const kpiToday   = kpis?.submitted_today
  const kpiPending = kpis?.pending_approvals
  const kpiPTO     = kpis?.pto_pending
  const kpiTime    = kpis?.timesheets_pending
  const kpiWC      = kpis?.workers_comp_active
  const kpiMTD     = kpis?.total_mtd

  // ── Drill-down: KPI tiles expose the submission records behind each metric ────
  const SUB_COLS = [
    { key: 'form_type', label: 'Form Type', value: r => r.form_type },
    { key: 'employee', label: 'Employee', value: r => r.employee },
    { key: 'location', label: 'Location', value: r => r.location },
    { key: 'date', label: 'Date', value: r => r.date, sortKey: r => r.date },
    { key: 'status', label: 'Status', value: r => STATUS_META[r.status]?.label || r.status },
  ]
  const openDrill = (title, rows, accent) => setDrill({ title, subtitle: `${rows.length} submission${rows.length === 1 ? '' : 's'}`, columns: SUB_COLS, rows, accent })
  const isPTO  = r => /pto|leave|fmla/i.test(r.form_type)
  const isTime = r => /timesheet|time/i.test(r.form_type)
  const isWC   = r => /workers comp|incident/i.test(r.form_type)

  return (
    <div style={S.page}>
      <PageHeader
        title="Forms Hub"
        sub="Organized HR forms directory — submit, track, and manage all employee forms"
        isLive={isLive}
      >
        <button style={GHOST_BTN} onClick={() => navigate(-1)}>← Back</button>
      </PageHeader>

      <QuickLinks links={[
        { label: 'Disciplinary',    to: '/disciplinary' },
        { label: 'Leave Requests',  to: '/requests' },
        { label: 'Onboarding',      to: '/onboarding' },
        { label: 'Payroll',         to: '/payroll' },
        { label: 'Workers Comp',    to: '/workers-comp' },
        { label: 'Documents',       to: '/documents' },
        { label: 'HR Ops',          to: '/hr-ops' },
        { label: 'Incidents',       to: '/incidents' },
      ]} />

      {/* KPI TILES */}
      <div style={S.kpiRow}>
        <KpiTile
          label="Forms Submitted Today"
          value={kpiToday}
          sub="All locations"
          accent="var(--t-accent)"
          onClick={() => openDrill('Recent Form Submissions', recentRows, 'var(--t-accent)')}
        />
        <KpiTile
          label="Pending Approvals"
          value={kpiPending}
          sub="Awaiting review"
          accent="var(--t-warn)"
          onClick={() => openDrill('Pending Approvals', recentRows.filter(r => r.status === 'PENDING'), 'var(--t-warn)')}
        />
        <KpiTile
          label="PTO Requests Pending"
          value={kpiPTO}
          sub="Leave queue"
          accent="var(--t-warn)"
          onClick={() => openDrill('PTO / Leave Requests', recentRows.filter(isPTO), 'var(--t-warn)')}
        />
        <KpiTile
          label="Timesheets Pending"
          value={kpiTime}
          sub="This period"
          accent="var(--t-warn)"
          onClick={() => openDrill('Timesheet Submissions', recentRows.filter(isTime), 'var(--t-warn)')}
        />
        <KpiTile
          label="Workers Comp Active"
          value={kpiWC}
          sub="Open claims"
          accent="var(--t-danger)"
          onClick={() => openDrill('Workers Comp / Incident Reports', recentRows.filter(isWC), 'var(--t-danger)')}
        />
        <KpiTile
          label="Total Forms MTD"
          value={kpiMTD}
          sub={`Since ${MONTH_AGO}`}
          accent="var(--t-accent)"
          onClick={() => openDrill('All Form Submissions (MTD)', recentRows, 'var(--t-accent)')}
        />
      </div>

      {/* FILTER BAR */}
      <FilterBar
        dateFrom={dateFrom}
        setDateFrom={setDateFrom}
        dateTo={dateTo}
        setDateTo={setDateTo}
        search={search}
        setSearch={setSearch}
        empId={empId}
        setEmpId={setEmpId}
        onRefresh={() => { fetchRecent(); fetchKpis() }}
      />

      {/* CATEGORY FILTER */}
      <div style={S.catBar}>
        {CATEGORIES.map(cat => (
          <button
            key={cat}
            style={S.catBtn(category === cat)}
            onClick={() => setCategory(cat)}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* FORMS DIRECTORY — 2-COLUMN GRID */}
      {filteredFormCategories.length > 0 ? (
        <div style={S.dirGrid}>
          {filteredFormCategories.map(([catKey, forms]) => (
            <SectionCard
              key={catKey}
              title={catKey}
              badge={`${forms.length} FORMS`}
            >
              {forms.map((f, i) => (
                <FormLinkItem key={`${catKey}-${i}`} name={f.name} to={f.to} />
              ))}
            </SectionCard>
          ))}
        </div>
      ) : (
        <div style={{ padding: '32px 0', textAlign: 'center', color: 'var(--t-text-faint)', fontSize: 13 }}>
          No forms match the selected category.
        </div>
      )}

      {/* RECENT FORM SUBMISSIONS */}
      <SectionCard
        title="Recent Form Submissions"
        badge={loadingRecent ? 'LOADING...' : `${filteredRecent.length} RECORDS`}
      >
        {filteredRecent.length === 0 ? (
          <div style={{ color: 'var(--t-text-faint)', fontSize: 13, padding: '12px 0' }}>
            No recent submissions found.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={S.table}>
              <thead>
                <tr>
                  <th style={S.th}>Form Type</th>
                  <th style={S.th}>Employee</th>
                  <th style={S.th}>Location</th>
                  <th style={S.th}>Date</th>
                  <th style={S.th}>Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredRecent.map((row) => (
                  <tr key={row.id} style={{ cursor: 'default' }}>
                    <td style={S.td}>{row.form_type}</td>
                    <td style={S.td}>{row.employee}</td>
                    <td style={S.tdMuted}>{row.location}</td>
                    <td style={S.tdMuted}>{row.date}</td>
                    <td style={S.td}>
                      <span style={S.statusBadge(row.status)}>
                        {STATUS_META[row.status]?.label || row.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      <DrillDown open={!!drill} onClose={() => setDrill(null)} {...(drill || {})} />
    </div>
  )
}
