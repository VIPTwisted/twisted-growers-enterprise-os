import { useState, useEffect, useCallback, useMemo } from 'react'
import { NavLink } from 'react-router-dom'
import { useAuth } from '../lib/auth.jsx'
import { useScope } from '../lib/scope.jsx'
import { sb } from '../lib/supabase'

// ─── SHARED COMPONENTS ────────────────────────────────────────────────────────

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

function FilterBar({ search, setSearch, empId, setEmpId, onRefresh, extraFilters }) {
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', padding: '12px 0', marginBottom: 4 }}>
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
          {isLive ? 'LIVE' : 'OFFLINE'}
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

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

const TODAY = new Date().toISOString().slice(0, 10)

const QUICK_LINKS = [
  { label: 'Training',       to: '/training' },
  { label: 'LMS',            to: '/training-lms' },
  { label: 'Academy',        to: '/academy' },
  { label: 'Weekly Drills',  to: '/weekly-drills' },
  { label: 'Track Progress', to: '/training-track' },
  { label: 'Reviews',        to: '/reviews' },
  { label: 'Products',       to: '/products' },
  { label: 'Manual',         to: '/manual' },
]

const UUID_RX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// ─── PROGRESS BAR ────────────────────────────────────────────────────────────

function ProgressBar({ pct, color }) {
  return (
    <div style={{ height: 6, background: 'var(--t-line)', borderRadius: 0, overflow: 'hidden', minWidth: 80 }}>
      <div style={{ height: '100%', width: `${pct}%`, background: color || 'var(--t-accent)', transition: 'width .3s', borderRadius: 0 }} />
    </div>
  )
}

// ─── COMPETENCY CHIP ─────────────────────────────────────────────────────────

const COMPETENCY_STYLE = {
  trained:     { bg: 'var(--t-success)', label: 'Trained' },
  in_training: { bg: 'var(--t-warn)',    label: 'In Training' },
  not_trained: { bg: 'var(--t-danger)',  label: 'Not Trained' },
}

function CompetencyChip({ state }) {
  const cfg = COMPETENCY_STYLE[state] || { bg: 'var(--t-line)', label: state || '—' }
  return (
    <span style={{ fontSize: 9, fontWeight: 800, padding: '2px 7px', background: cfg.bg, color: '#fff', letterSpacing: '.05em', borderRadius: 0, whiteSpace: 'nowrap' }}>
      {cfg.label}
    </span>
  )
}

function StatusChip({ status }) {
  const map = {
    'COMPLETE':  { bg: 'var(--t-success)', label: 'COMPLETE ✓' },
    'ON TRACK':  { bg: 'var(--t-success)', label: 'ON TRACK' },
    'BEHIND':    { bg: 'var(--t-warn)',    label: 'BEHIND' },
    'CRITICAL':  { bg: 'var(--t-danger)',  label: 'CRITICAL' },
  }
  const cfg = map[status] || { bg: 'var(--t-line)', label: status }
  return (
    <span style={{ fontSize: 9, fontWeight: 800, padding: '2px 7px', background: cfg.bg, color: '#fff', letterSpacing: '.06em', borderRadius: 0 }}>
      {cfg.label}
    </span>
  )
}

// ─── MAIN SCREEN ─────────────────────────────────────────────────────────────

export default function TrainingHub() {
  const { session } = useAuth()
  const { locationIds, locations } = useScope()

  const person = session?.person ?? { id: null, full_name: 'User', role_name: '—' }
  const actorId = UUID_RX.test(String(person.id)) ? person.id : null

  const nodeIds = useMemo(
    () => (Array.isArray(locationIds) && locationIds.length ? locationIds : null),
    [locationIds]
  )

  const [search, setSearch]   = useState('')
  const [empId, setEmpId]     = useState('')
  const [isLive, setIsLive]   = useState(false)
  const [loading, setLoading] = useState(false)
  const [err, setErr]         = useState('')

  const [summary, setSummary] = useState(null)
  const [matrix, setMatrix]   = useState([])
  const [certs, setCerts]     = useState([])
  const [drills, setDrills]   = useState([])

  // Drill scheduling form
  const [showDrillForm, setShowDrillForm] = useState(false)
  const [dName, setDName]         = useState('')
  const [dDate, setDDate]         = useState(TODAY)
  const [dNode, setDNode]         = useState('')
  const [dMandatory, setDMandatory] = useState(false)
  const [saving, setSaving]       = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setErr('')
    const [sumRes, mtxRes, certRes, drillRes] = await Promise.all([
      sb.rpc('rpc_training_hub_summary', { p_location_ids: nodeIds, p_date_from: null, p_date_to: null }),
      sb.rpc('get_training_matrix', { p_node_ids: nodeIds }),
      sb.rpc('get_expiring_certifications', { p_node_ids: nodeIds, p_within_days: 30 }),
      sb.rpc('get_training_drills', { p_node_ids: nodeIds, p_from: TODAY }),
    ])

    const firstErr = sumRes.error || mtxRes.error || certRes.error || drillRes.error
    if (firstErr) {
      setErr(firstErr.message || 'Failed to load training data.')
      setIsLive(false)
    } else {
      setIsLive(true)
    }

    setSummary(sumRes.error ? null : (sumRes.data || null))
    setMatrix(mtxRes.error ? [] : (Array.isArray(mtxRes.data) ? mtxRes.data : []))
    setCerts(certRes.error ? [] : (Array.isArray(certRes.data) ? certRes.data : []))
    setDrills(drillRes.error ? [] : (Array.isArray(drillRes.data) ? drillRes.data : []))
    setLoading(false)
  }, [nodeIds])

  useEffect(() => { fetchData() }, [fetchData])

  // Union of competency keys across the matrix → dynamic columns
  const competencyKeys = useMemo(() => {
    const set = new Set()
    matrix.forEach(row => {
      if (row && row.competencies && typeof row.competencies === 'object') {
        Object.keys(row.competencies).forEach(k => set.add(k))
      }
    })
    return Array.from(set).sort()
  }, [matrix])

  // Per-person derived completion + status
  const rows = useMemo(() => {
    return matrix
      .map(row => {
        const comp = row.competencies || {}
        const keys = competencyKeys
        const total = keys.length
        const trained = keys.filter(k => comp[k] === 'trained').length
        const inProg = keys.filter(k => comp[k] === 'in_training').length
        const pct = total ? Math.round((trained / total) * 100) : 0
        let status = 'ON TRACK'
        if (total && trained === total) status = 'COMPLETE'
        else if (pct < 40) status = 'CRITICAL'
        else if (pct < 80) status = 'BEHIND'
        return { ...row, comp, pct, trained, total, inProg, status }
      })
      .filter(r => {
        const matchName = !search || (r.full_name || '').toLowerCase().includes(search.toLowerCase())
        const matchId   = !empId  || String(r.person_id || '').toLowerCase().includes(empId.toLowerCase())
        return matchName && matchId
      })
  }, [matrix, competencyKeys, search, empId])

  // ── KPIs (all from real RPC output) ──
  const completionRate = summary && summary.total_records
    ? Math.round((summary.completed / summary.total_records) * 100) + '%'
    : (summary ? '0%' : '—')
  const certsExpiring    = certs.length
  const employeesBehind  = rows.filter(r => r.total && r.trained < r.total).length
  const moduleCount      = summary ? (summary.modules ?? '—') : '—'
  const drillsScheduled  = drills.length
  const fullyTrained     = matrix.filter(r => {
    const c = r.competencies || {}
    const keys = competencyKeys
    return keys.length && keys.every(k => c[k] === 'trained')
  }).length

  // ── WRITE: schedule certification renewal ──
  async function scheduleRenewal(certId) {
    const { error } = await sb.rpc('certification_schedule_renewal', { p_id: certId, p_actor: actorId })
    if (error) { setErr(error.message || 'Could not schedule renewal.'); return }
    fetchData()
  }

  // ── WRITE: schedule a training drill ──
  async function saveDrill(e) {
    e.preventDefault()
    if (!dName.trim()) { setErr('Drill name is required.'); return }
    setSaving(true)
    const { data, error } = await sb.rpc('training_drill_upsert', {
      p_id: null,
      p_node_id: dNode || null,
      p_drill_name: dName.trim(),
      p_drill_date: dDate || null,
      p_mandatory: dMandatory,
      p_status: 'scheduled',
      p_notes: null,
      p_actor: actorId,
    })
    setSaving(false)
    if (error || (data && data.ok === false)) {
      setErr((error && error.message) || (data && data.error) || 'Could not schedule drill.')
      return
    }
    setDName(''); setDDate(TODAY); setDNode(''); setDMandatory(false); setShowDrillForm(false)
    fetchData()
  }

  const S = {
    page: { padding: '24px 28px', background: 'var(--t-bg)', minHeight: '100vh', color: 'var(--t-text)', fontFamily: 'inherit' },
    kpiRow: { display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 },
    table: { width: '100%', borderCollapse: 'collapse', fontSize: 12 },
    th: { background: 'var(--t-surface-2)', color: 'var(--t-text-muted)', fontSize: 10, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', padding: '9px 12px', textAlign: 'left', borderBottom: '1px solid var(--t-line)' },
    td: { padding: '9px 12px', borderBottom: '1px solid var(--t-line)', color: 'var(--t-text)', fontSize: 12, verticalAlign: 'middle' },
    certCard: { background: 'var(--t-surface)', border: '1px solid var(--t-line)', borderRadius: 0, padding: '14px 16px' },
    certGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 },
    empty: { textAlign: 'center', color: 'var(--t-text-faint)', padding: 32, fontSize: 12 },
  }

  return (
    <div style={S.page}>

      <PageHeader
        title="Training Hub"
        sub={`All-location training dashboard · ${person.role_name}`}
        isLive={isLive}
      />

      <QuickLinks links={QUICK_LINKS} />

      {err && (
        <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-danger)', color: 'var(--t-danger)', padding: '10px 14px', fontSize: 12, marginBottom: 16, borderRadius: 0 }}>
          {err}
        </div>
      )}

      <FilterBar
        search={search} setSearch={setSearch}
        empId={empId}   setEmpId={setEmpId}
        onRefresh={fetchData}
        extraFilters={null}
      />

      {/* ── KPI TILES ── */}
      <div style={S.kpiRow}>
        <KpiTile label="Completion Rate"         value={completionRate}  sub="Records completed & valid" accent="var(--t-success)" />
        <KpiTile label="Certs Expiring (30 days)" value={certsExpiring}   sub="Requires renewal"          accent="var(--t-warn)" />
        <KpiTile label="Employees Behind"        value={employeesBehind} sub="Missing a competency"      accent="var(--t-danger)" />
        <KpiTile label="Training Modules"        value={moduleCount}     sub="Distinct modules on record" accent="var(--t-accent)" />
        <KpiTile label="Drills Scheduled"        value={drillsScheduled} sub="Upcoming"                  accent="var(--t-warn)" />
        <KpiTile label="Fully Trained"           value={fullyTrained}    sub="All competencies trained"  accent="var(--t-success)" />
      </div>

      {/* ── EMPLOYEE TRAINING STATUS TABLE ── */}
      <SectionCard
        title="Employee Training Status"
        badge={`${rows.length} EMPLOYEES`}
        action={loading ? <span style={{ fontSize: 10, color: 'var(--t-text-muted)' }}>Loading...</span> : null}
      >
        <div style={{ overflowX: 'auto' }}>
          <table style={S.table}>
            <thead>
              <tr>
                <th style={S.th}>Employee</th>
                <th style={S.th}>Completion</th>
                {competencyKeys.map(k => (
                  <th key={k} style={S.th}>{k.replace(/_/g, ' ')}</th>
                ))}
                <th style={S.th}>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, idx) => {
                const reqColor = r.pct === 100 ? 'var(--t-success)' : r.pct < 40 ? 'var(--t-danger)' : 'var(--t-warn)'
                const rowBg = idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)'
                return (
                  <tr key={r.person_id || idx} style={{ background: rowBg }}>
                    <td style={S.td}>
                      <div style={{ fontWeight: 700, color: 'var(--t-text)' }}>{r.full_name}</div>
                      {r.role_name && <div style={{ fontSize: 10, color: 'var(--t-text-muted)' }}>{r.role_name}</div>}
                    </td>
                    <td style={{ ...S.td, minWidth: 130 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <ProgressBar pct={r.pct} color={reqColor} />
                        <span style={{ fontSize: 11, fontWeight: 700, color: reqColor, minWidth: 30 }}>{r.pct}%</span>
                      </div>
                    </td>
                    {competencyKeys.map(k => (
                      <td key={k} style={S.td}><CompetencyChip state={r.comp[k]} /></td>
                    ))}
                    <td style={S.td}><StatusChip status={r.status} /></td>
                  </tr>
                )
              })}
              {!loading && rows.length === 0 && (
                <tr>
                  <td colSpan={competencyKeys.length + 3} style={S.empty}>
                    No training records for the selected locations.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </SectionCard>

      {/* ── EXPIRING CERTIFICATIONS ── */}
      <SectionCard title="Expiring Certifications" badge={`${certs.length} CERTS`}>
        {certs.length === 0 ? (
          <div style={S.empty}>No certifications expiring in the next 30 days.</div>
        ) : (
          <div style={S.certGrid}>
            {certs.map((cert) => {
              const days = cert.days_left
              const accentColor = days == null ? 'var(--t-text-muted)' : days < 7 ? 'var(--t-danger)' : days < 30 ? 'var(--t-warn)' : 'var(--t-success)'
              const urgency = cert.status === 'renewal_scheduled' ? 'RENEWAL SET' : days == null ? 'NO DATE' : days < 7 ? 'URGENT' : days < 30 ? 'EXPIRING SOON' : 'UPCOMING'
              return (
                <div key={cert.id} style={{ ...S.certCard, borderTop: `3px solid ${accentColor}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                    <div style={{ fontWeight: 700, fontSize: 12, color: 'var(--t-text)' }}>{cert.employee}</div>
                    <span style={{ fontSize: 9, fontWeight: 800, padding: '2px 7px', background: accentColor, color: '#fff', letterSpacing: '.06em', borderRadius: 0 }}>
                      {urgency}
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--t-text-muted)', marginBottom: 6 }}>{cert.cert}</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                    <div style={{ fontSize: 10, color: 'var(--t-text-faint)' }}>{cert.location}</div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: accentColor }}>
                      {cert.expiry ? `Expires ${cert.expiry}` : 'No expiry'}{days != null ? ` · ${days}d` : ''}
                    </div>
                  </div>
                  {cert.status !== 'renewal_scheduled' && (
                    <button style={{ ...GHOST_BTN, width: '100%', textAlign: 'center' }} onClick={() => scheduleRenewal(cert.id)}>
                      Schedule Renewal
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </SectionCard>

      {/* ── UPCOMING DRILLS ── */}
      <SectionCard
        title="Upcoming Weekly Drills"
        badge={`${drills.length} DRILLS`}
        action={
          <button style={{ ...GHOST_BTN, padding: '4px 10px' }} onClick={() => setShowDrillForm(v => !v)}>
            {showDrillForm ? 'Cancel' : '+ Schedule Drill'}
          </button>
        }
      >
        {showDrillForm && (
          <form onSubmit={saveDrill} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', padding: '4px 0 16px', borderBottom: '1px solid var(--t-line)', marginBottom: 16 }}>
            <input type="text" placeholder="Drill name..." value={dName} onChange={e => setDName(e.target.value)} style={{ ...INP, minWidth: 220 }} />
            <input type="date" value={dDate} onChange={e => setDDate(e.target.value)} style={INP} />
            <select value={dNode} onChange={e => setDNode(e.target.value)} style={INP}>
              <option value="">All locations</option>
              {(locations || []).map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--t-text-muted)' }}>
              <input type="checkbox" checked={dMandatory} onChange={e => setDMandatory(e.target.checked)} /> Mandatory
            </label>
            <button type="submit" style={BTN} disabled={saving}>{saving ? 'Saving…' : 'Save Drill'}</button>
          </form>
        )}
        <div style={{ overflowX: 'auto' }}>
          <table style={S.table}>
            <thead>
              <tr>
                {['Drill Name', 'Location', 'Date', 'Mandatory', 'Status'].map(h => (
                  <th key={h} style={S.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {drills.map((drill, idx) => {
                const statusColor = drill.status === 'scheduled' ? 'var(--t-success)' : 'var(--t-text-muted)'
                const rowBg = idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)'
                return (
                  <tr key={drill.id || idx} style={{ background: rowBg }}>
                    <td style={{ ...S.td, fontWeight: 700 }}>{drill.name}</td>
                    <td style={{ ...S.td, color: 'var(--t-text-muted)' }}>{drill.location}</td>
                    <td style={{ ...S.td, fontSize: 11, color: 'var(--t-text-muted)' }}>{drill.date || '—'}</td>
                    <td style={{ ...S.td, textAlign: 'center' }}>
                      <span style={{ fontWeight: 700, color: drill.mandatory ? 'var(--t-danger)' : 'var(--t-text-muted)' }}>
                        {drill.mandatory ? 'YES' : 'No'}
                      </span>
                    </td>
                    <td style={S.td}>
                      <span style={{ fontSize: 9, fontWeight: 800, padding: '2px 7px', background: statusColor, color: '#fff', letterSpacing: '.06em', borderRadius: 0 }}>
                        {String(drill.status || '').toUpperCase()}
                      </span>
                    </td>
                  </tr>
                )
              })}
              {drills.length === 0 && (
                <tr>
                  <td colSpan={5} style={S.empty}>No drills scheduled for the selected locations.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </SectionCard>

    </div>
  )
}
