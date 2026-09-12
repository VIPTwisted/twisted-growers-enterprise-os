import { useState, useMemo, useEffect, useCallback } from 'react'
import { useAuth } from '../lib/auth.jsx'
import { useFeatureFlag } from '../lib/featureFlags.js'
import { useConfig } from '../lib/config.js'
import { sb, getSession } from '../lib/supabase'
import DrillDown from '../components/DrillDown.jsx'

/* ── helpers ─────────────────────────────────────────────────────────── */
function fmt(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

/* ── select / input style ────────────────────────────────────────────── */
const selStyle = {
  background: 'var(--t-surface-2)',
  border: '1px solid var(--t-line)',
  color: 'var(--t-text)',
  padding: '6px 10px',
  fontSize: 13,
  borderRadius: 0,
}

/* ── incident enrichment (running total, chronological) ───────────────── */
// raw incident: { id, date:'YYYY-MM-DD', type, pts, expiry:'YYYY-MM-DD', expired, recorded_by }
function enrichIncidents(raw) {
  const asc = [...raw].sort((a, b) => String(a.date).localeCompare(String(b.date)))
  let running = 0
  const withRun = asc.map(inc => {
    const pts = Number(inc.pts) || 0
    running = Math.max(0, Math.round((running + (inc.expired ? 0 : pts)) * 10) / 10)
    return { ...inc, pts, runningTotal: running }
  })
  // display newest first
  return withRun.sort((a, b) => String(b.date).localeCompare(String(a.date)))
}

/* ── compute current points (active only) ────────────────────────────── */
function currentPoints(incidents) {
  return Math.round(
    incidents.filter(i => !i.expired).reduce((s, i) => s + (Number(i.pts) || 0), 0) * 10
  ) / 10
}

/* ── stage logic ─────────────────────────────────────────────────────── */
function getStage(pts, cfg) {
  if (pts >= cfg.points_termination_threshold) return 'TERMINATION LEVEL'
  if (pts >= cfg.points_suspension_threshold)  return 'SUSPENSION LEVEL'
  if (pts >= cfg.points_final_threshold)       return 'FINAL WARNING'
  if (pts >= cfg.points_written_threshold)     return 'WRITTEN WARNING'
  if (pts >= cfg.points_verbal_threshold)      return 'VERBAL WARNING'
  return 'GOOD'
}
function stageBadgeClass(stage) {
  if (stage === 'GOOD')             return 'badge green'
  if (stage === 'VERBAL WARNING')   return 'badge amber'
  if (stage === 'WRITTEN WARNING')  return 'badge amber'
  if (stage === 'FINAL WARNING')    return 'badge red'
  if (stage === 'SUSPENSION LEVEL') return 'badge red'
  return 'badge red'  // TERMINATION LEVEL
}

/* ── enrich one roster row from the RPC payload ──────────────────────── */
function enrichRow(emp, cfg) {
  const incidents = enrichIncidents(emp.incidents || [])
  const pts = currentPoints(incidents)
  const prevPts = currentPoints(incidents.slice(1)) // drop newest for trend
  const trend = pts > prevPts + 0.5 ? '↑' : pts < prevPts - 0.5 ? '↓' : '→'
  const last = incidents.find(inc => !inc.expired) || null
  const activeIncidents = incidents.filter(inc => !inc.expired).length
  return { ...emp, incidents, pts, prevPts, trend, last, activeIncidents, stage: getStage(pts, cfg) }
}

/* ── KPI tile ────────────────────────────────────────────────────────── */
function KTile({ label, value, sub, color, alert, onClick }) {
  return (
    <div onClick={onClick} title={onClick ? 'Click to drill into records' : undefined} style={{
      background: 'var(--t-surface)',
      border: `1px solid ${alert === 'red' ? 'var(--t-danger)' : alert === 'amber' ? 'var(--t-warn)' : 'var(--t-line)'}`,
      padding: '14px 16px',
      position: 'relative',
      overflow: 'hidden',
      cursor: onClick ? 'pointer' : 'default',
    }}>
      {alert === 'red'   && <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'var(--t-danger)' }} />}
      {alert === 'amber' && <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'var(--t-warn)' }} />}
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.08em', color: 'var(--t-text-muted)', textTransform: 'uppercase', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800, color: color || 'var(--t-text)', lineHeight: 1, marginBottom: 4 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--t-text-faint)' }}>{sub}</div>}
    </div>
  )
}

/* ── FeatureDisabled ─────────────────────────────────────────────────── */
function FeatureDisabled() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 300, gap: 14 }}>
      <div style={{ fontSize: 36, opacity: .25 }}>🚫</div>
      <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--t-text)' }}>Feature Disabled</div>
      <div style={{ color: 'var(--t-text-muted)', fontSize: 13, textAlign: 'center', maxWidth: 340 }}>
        Attendance Points is not enabled for this account. Enable it in <strong>Settings → Feature Toggles</strong>.
      </div>
    </div>
  )
}

/* ── LockScreen ──────────────────────────────────────────────────────── */
function LockScreen() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 400, gap: 16 }}>
      <div style={{ fontSize: 40, opacity: .3 }}>🔒</div>
      <div style={{ fontWeight: 700, fontSize: 18, color: 'var(--t-text)' }}>Manager Access Required</div>
      <div style={{ color: 'var(--t-text-muted)', fontSize: 13, textAlign: 'center', maxWidth: 320 }}>
        Attendance Points is restricted to Managers, HR Managers, COO, and Admin roles.
      </div>
    </div>
  )
}

/* ── generic state panels (loading / empty / error) ──────────────────── */
function StatePanel({ icon, title, msg, tone }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 260, gap: 12,
      background: 'var(--t-surface)', border: `1px solid ${tone === 'error' ? 'var(--t-danger)' : 'var(--t-line)'}` }}>
      <div style={{ fontSize: 34, opacity: .3 }}>{icon}</div>
      <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--t-text)' }}>{title}</div>
      {msg && <div style={{ color: 'var(--t-text-muted)', fontSize: 13, textAlign: 'center', maxWidth: 360 }}>{msg}</div>}
    </div>
  )
}

/* ── Incident type badge ─────────────────────────────────────────────── */
function IncidentBadge({ type }) {
  const cls = type === 'tardy' ? 'badge amber' : type === 'callout' ? 'badge red' : 'badge red'
  const label = type === 'ncns' ? 'NCNS' : String(type).toUpperCase()
  const style = type === 'ncns' ? { background: 'rgba(127,29,29,.35)', color: '#fca5a5', border: '1px solid #7f1d1d', fontSize: 9, fontWeight: 800 } : { fontSize: 9, fontWeight: 700 }
  return <span className={cls} style={style}>{label}</span>
}

/* ── Row detail expand ───────────────────────────────────────────────── */
function RowDetail({ incidents, cfg }) {
  if (incidents.length === 0) {
    return (
      <tr>
        <td colSpan={8} style={{ padding: '12px 24px', color: 'var(--t-text-muted)', fontSize: 12, background: 'var(--t-surface-2)' }}>
          No incidents recorded for this employee.
        </td>
      </tr>
    )
  }
  // Next expiry
  const upcoming = incidents.filter(i => !i.expired).sort((a, b) => new Date(a.expiry) - new Date(b.expiry))
  const nextExpiry = upcoming[0]
  const nextExpiryPts = upcoming.slice(0, 1).reduce((s, i) => s + i.pts, 0)

  return (
    <tr>
      <td colSpan={8} style={{ padding: 0, background: 'var(--t-surface-2)' }}>
        <div style={{ padding: '10px 24px 14px', borderTop: '1px dashed var(--t-line)' }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--t-text-muted)', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 8 }}>
            Incident Breakdown
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--t-line)' }}>
                {['Date', 'Type', 'Points Added', 'Expires', 'Status', 'Running Total'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '5px 10px', fontWeight: 700, fontSize: 9, letterSpacing: '.07em', color: 'var(--t-text-faint)', textTransform: 'uppercase' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {incidents.map((inc, i) => {
                const rowBg = inc.type === 'ncns' ? 'rgba(127,29,29,.18)' : inc.type === 'callout' ? 'rgba(239,68,68,.07)' : 'rgba(234,179,8,.06)'
                return (
                  <tr key={inc.id || i} style={{ borderBottom: '1px solid var(--t-line)', background: rowBg }}>
                    <td style={{ padding: '6px 10px', fontFamily: 'monospace', color: 'var(--t-text-muted)' }}>{inc.date}</td>
                    <td style={{ padding: '6px 10px' }}><IncidentBadge type={inc.type} /></td>
                    <td style={{ padding: '6px 10px', fontWeight: 800, color: inc.expired ? 'var(--t-text-faint)' : inc.type === 'ncns' ? '#fca5a5' : inc.type === 'callout' ? 'var(--t-danger)' : 'var(--t-warn)' }}>
                      {inc.expired ? '—' : `+${inc.pts}`}
                    </td>
                    <td style={{ padding: '6px 10px', fontFamily: 'monospace', color: 'var(--t-text-faint)', fontSize: 10 }}>{inc.expiry}</td>
                    <td style={{ padding: '6px 10px' }}>
                      {inc.expired
                        ? <span style={{ fontSize: 9, color: 'var(--t-text-faint)', fontWeight: 600 }}>EXPIRED</span>
                        : <span style={{ fontSize: 9, color: 'var(--t-success)', fontWeight: 600 }}>ACTIVE</span>}
                    </td>
                    <td style={{ padding: '6px 10px', fontFamily: 'monospace', fontWeight: 700, color: 'var(--t-text)' }}>{inc.runningTotal}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {nextExpiry && (
            <div style={{ marginTop: 8, fontSize: 11, color: 'var(--t-text-muted)', background: 'rgba(0,229,255,.06)', border: '1px solid var(--t-line)', padding: '6px 10px' }}>
              Next expiry: <strong style={{ color: 'var(--t-accent)' }}>{nextExpiryPts}pt</strong> expire on <strong style={{ color: 'var(--t-accent)' }}>{fmt(nextExpiry.expiry)}</strong>
            </div>
          )}
        </div>
      </td>
    </tr>
  )
}

/* ══════════════════════════════════════════════════════════════════════
   TAB 1 — ALL EMPLOYEES
══════════════════════════════════════════════════════════════════════ */
function TabAllEmployees({ roster, locations, cfg, onAddIncident }) {
  const [expandedId, setExpandedId] = useState(null)
  const [locFilter, setLocFilter] = useState('All')
  const [stageFilter, setStageFilter] = useState('All')
  const [search, setSearch] = useState('')
  const [addForm, setAddForm] = useState(null) // { personId, nodeId, type, pts }
  const [saving, setSaving] = useState(false)

  const filtered = roster.filter(r => {
    if (locFilter !== 'All' && r.location !== locFilter) return false
    if (stageFilter !== 'All' && r.stage !== stageFilter) return false
    if (search && !String(r.full_name).toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  function ptsColor(pts) {
    if (pts >= cfg.points_final_threshold)  return 'var(--t-danger)'
    if (pts >= cfg.points_verbal_threshold) return 'var(--t-warn)'
    return 'var(--t-success)'
  }
  function ptsStyle(pts) {
    if (pts >= cfg.points_termination_threshold) return { color: '#fca5a5', fontWeight: 900 }
    return { color: ptsColor(pts), fontWeight: 800 }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Filter bar */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', background: 'var(--t-surface)', border: '1px solid var(--t-line)', padding: '10px 14px' }}>
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search employee..." style={{ ...selStyle, minWidth: 180 }} />
        <select value={locFilter} onChange={e => setLocFilter(e.target.value)} style={selStyle}>
          {['All', ...locations].map(l => <option key={l}>{l}</option>)}
        </select>
        <select value={stageFilter} onChange={e => setStageFilter(e.target.value)} style={selStyle}>
          {['All', 'GOOD', 'VERBAL WARNING', 'WRITTEN WARNING', 'FINAL WARNING', 'SUSPENSION LEVEL', 'TERMINATION LEVEL'].map(s => <option key={s}>{s}</option>)}
        </select>
        <span style={{ fontSize: 11, color: 'var(--t-text-faint)', marginLeft: 'auto' }}>{filtered.length} employees</span>
      </div>

      {/* Table */}
      <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: 'var(--t-surface-2)', borderBottom: '1px solid var(--t-line)' }}>
                {['Employee', 'Location', 'Role', 'Points', 'Stage', 'Last Incident', 'Trend', 'Action'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '8px 14px', fontWeight: 700, fontSize: 10, letterSpacing: '.07em', color: 'var(--t-text-muted)', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const { person_id: pid, full_name, location, role, incidents, pts, stage, last, trend, node_id } = r
                const isExpanded = expandedId === pid
                const trendColor = trend === '↑' ? 'var(--t-danger)' : trend === '↓' ? 'var(--t-success)' : 'var(--t-text-muted)'
                return (
                  <>
                    <tr key={pid} style={{ borderBottom: isExpanded ? 'none' : '1px solid var(--t-line)', borderLeft: pts >= cfg.points_final_threshold ? '3px solid var(--t-danger)' : pts >= cfg.points_verbal_threshold ? '3px solid var(--t-warn)' : '3px solid transparent' }}>
                      <td style={{ padding: '9px 14px', fontWeight: 700, color: 'var(--t-text)', whiteSpace: 'nowrap' }}>{full_name}</td>
                      <td style={{ padding: '9px 14px', color: 'var(--t-text-muted)' }}>{location}</td>
                      <td style={{ padding: '9px 14px', color: 'var(--t-text-faint)', whiteSpace: 'nowrap' }}>{role}</td>
                      <td style={{ padding: '9px 14px', fontFamily: 'monospace', fontSize: 15, ...ptsStyle(pts) }}>{pts}</td>
                      <td style={{ padding: '9px 14px' }}>
                        <span className={stageBadgeClass(stage)} style={{ fontSize: 9, whiteSpace: 'nowrap' }}>{stage}</span>
                      </td>
                      <td style={{ padding: '9px 14px', color: 'var(--t-text-muted)', whiteSpace: 'nowrap' }}>
                        {last ? <><IncidentBadge type={last.type} /> <span style={{ marginLeft: 4, fontSize: 11 }}>{last.date}</span></> : <span style={{ color: 'var(--t-text-faint)' }}>None</span>}
                      </td>
                      <td style={{ padding: '9px 14px', fontWeight: 800, color: trendColor, fontSize: 16 }}>{trend}</td>
                      <td style={{ padding: '9px 14px' }}>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button
                            onClick={() => setExpandedId(isExpanded ? null : pid)}
                            style={{ padding: '4px 10px', fontSize: 10, fontWeight: 700, cursor: 'pointer', background: isExpanded ? 'rgba(0,229,255,.15)' : 'var(--t-surface-2)', border: `1px solid ${isExpanded ? 'var(--t-accent)' : 'var(--t-line)'}`, color: isExpanded ? 'var(--t-accent)' : 'var(--t-text-muted)', borderRadius: 0 }}>
                            {isExpanded ? 'Hide' : 'View History'}
                          </button>
                          {onAddIncident && (
                            <button
                              onClick={() => setAddForm(addForm?.personId === pid ? null : { personId: pid, nodeId: node_id, type: 'tardy', pts: cfg.points_tardy })}
                              style={{ padding: '4px 10px', fontSize: 10, fontWeight: 700, cursor: 'pointer', background: addForm?.personId === pid ? 'rgba(234,179,8,.15)' : 'var(--t-surface-2)', border: `1px solid ${addForm?.personId === pid ? 'var(--t-warn)' : 'var(--t-line)'}`, color: addForm?.personId === pid ? 'var(--t-warn)' : 'var(--t-text-muted)', borderRadius: 0 }}>
                              + Add
                            </button>
                          )}
                        </div>
                        {/* Inline add-incident form */}
                        {addForm?.personId === pid && (
                          <div style={{ marginTop: 8, background: 'var(--t-surface-2)', border: '1px solid var(--t-warn)', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8, minWidth: 220 }}>
                            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--t-warn)', textTransform: 'uppercase', letterSpacing: '.06em' }}>Add Incident</div>
                            <select
                              value={addForm.type}
                              onChange={e => {
                                const t = e.target.value
                                const pv = t === 'tardy' ? cfg.points_tardy : t === 'callout' ? cfg.points_callout : cfg.points_ncns
                                setAddForm(f => ({ ...f, type: t, pts: pv }))
                              }}
                              style={{ ...selStyle, fontSize: 11 }}>
                              <option value="tardy">Tardy (+{cfg.points_tardy}pt)</option>
                              <option value="callout">Callout (+{cfg.points_callout}pt)</option>
                              <option value="ncns">NCNS (+{cfg.points_ncns}pt)</option>
                            </select>
                            <div style={{ display: 'flex', gap: 6 }}>
                              <button
                                disabled={saving}
                                onClick={async () => {
                                  setSaving(true)
                                  const reason = `${addForm.type.toUpperCase()} recorded via Attendance Points screen`
                                  const ok = await onAddIncident(addForm.personId, addForm.nodeId, addForm.type, addForm.pts, reason)
                                  setSaving(false)
                                  if (ok) setAddForm(null)
                                }}
                                style={{ flex: 1, padding: '5px 0', fontSize: 11, fontWeight: 700, cursor: saving ? 'default' : 'pointer', opacity: saving ? .6 : 1, background: 'var(--t-warn)', border: 'none', color: '#000', borderRadius: 0 }}>
                                {saving ? 'Saving…' : 'Confirm'}
                              </button>
                              <button
                                onClick={() => setAddForm(null)}
                                style={{ padding: '5px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer', background: 'var(--t-surface)', border: '1px solid var(--t-line)', color: 'var(--t-text-muted)', borderRadius: 0 }}>
                                Cancel
                              </button>
                            </div>
                          </div>
                        )}
                      </td>
                    </tr>
                    {isExpanded && <RowDetail key={`${pid}-detail`} incidents={incidents} cfg={cfg} />}
                  </>
                )
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} style={{ padding: '20px 14px', textAlign: 'center', color: 'var(--t-text-muted)', fontSize: 13 }}>
                    {roster.length === 0 ? 'No employees found for your locations yet.' : 'No employees match current filters.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════════════
   TAB 2 — INCIDENT LOG
══════════════════════════════════════════════════════════════════════ */
function TabIncidentLog({ roster, locations, cfg }) {
  const [locFilter, setLocFilter] = useState('All')
  const [typeFilter, setTypeFilter] = useState('All')
  const [dateStart, setDateStart] = useState('')
  const [dateEnd, setDateEnd] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const PER_PAGE = 25

  // Flatten all incidents (already enriched with runningTotal) into a chronological log
  const allLog = useMemo(() => {
    const entries = []
    roster.forEach(emp => {
      emp.incidents.forEach(inc => {
        entries.push({
          date: inc.date,
          emp,
          type: inc.type,
          pts: inc.pts,
          runningTotal: inc.runningTotal,
          expired: inc.expired,
          recordedBy: inc.recorded_by || 'System',
          id: inc.id,
        })
      })
    })
    entries.sort((a, b) => String(b.date).localeCompare(String(a.date)))
    return entries
  }, [roster])

  const filtered = useMemo(() => {
    return allLog.filter(r => {
      if (locFilter !== 'All' && r.emp.location !== locFilter) return false
      if (typeFilter !== 'All' && r.type !== typeFilter) return false
      if (dateStart && r.date < dateStart) return false
      if (dateEnd   && r.date > dateEnd)   return false
      if (search && !String(r.emp.full_name).toLowerCase().includes(search.toLowerCase())) return false
      return true
    })
  }, [allLog, locFilter, typeFilter, dateStart, dateEnd, search])

  const totalPages = Math.ceil(filtered.length / PER_PAGE)
  const pageRows = filtered.slice(page * PER_PAGE, (page + 1) * PER_PAGE)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', background: 'var(--t-surface)', border: '1px solid var(--t-line)', padding: '10px 14px' }}>
        <input value={search} onChange={e => { setSearch(e.target.value); setPage(0) }}
          placeholder="Search employee..." style={{ ...selStyle, minWidth: 180 }} />
        <select value={locFilter} onChange={e => { setLocFilter(e.target.value); setPage(0) }} style={selStyle}>
          {['All', ...locations].map(l => <option key={l}>{l}</option>)}
        </select>
        <select value={typeFilter} onChange={e => { setTypeFilter(e.target.value); setPage(0) }} style={selStyle}>
          {['All', 'tardy', 'callout', 'ncns'].map(t => <option key={t} value={t}>{t === 'ncns' ? 'NCNS' : t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
        </select>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 10, color: 'var(--t-text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>From</span>
          <input type="date" value={dateStart} onChange={e => { setDateStart(e.target.value); setPage(0) }}
            style={{ ...selStyle, fontFamily: 'monospace', fontSize: 11 }} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 10, color: 'var(--t-text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>To</span>
          <input type="date" value={dateEnd} onChange={e => { setDateEnd(e.target.value); setPage(0) }}
            style={{ ...selStyle, fontFamily: 'monospace', fontSize: 11 }} />
        </div>
        <span style={{ fontSize: 11, color: 'var(--t-text-faint)', marginLeft: 'auto' }}>{filtered.length} incidents</span>
      </div>

      {/* Table */}
      <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', overflow: 'hidden' }}>
        <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--t-line)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--t-text-muted)', textTransform: 'uppercase', letterSpacing: '.07em' }}>
            Incident Log — Company-Wide (Most Recent First) — Page {page + 1}/{Math.max(1, totalPages)}
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button disabled={page === 0} onClick={() => setPage(p => p - 1)}
              style={{ padding: '4px 10px', fontSize: 11, background: 'var(--t-surface-2)', border: '1px solid var(--t-line)', color: 'var(--t-text)', cursor: page === 0 ? 'default' : 'pointer', opacity: page === 0 ? .4 : 1, borderRadius: 0 }}>
              ← Prev
            </button>
            <button disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}
              style={{ padding: '4px 10px', fontSize: 11, background: 'var(--t-surface-2)', border: '1px solid var(--t-line)', color: 'var(--t-text)', cursor: page >= totalPages - 1 ? 'default' : 'pointer', opacity: page >= totalPages - 1 ? .4 : 1, borderRadius: 0 }}>
              Next →
            </button>
          </div>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: 'var(--t-surface-2)', borderBottom: '1px solid var(--t-line)' }}>
                {['Date', 'Employee', 'Location', 'Type', 'Points', 'Running Total', 'Recorded By'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '8px 14px', fontWeight: 700, fontSize: 10, letterSpacing: '.07em', color: 'var(--t-text-muted)', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pageRows.map((r, i) => (
                <tr key={r.id || i} style={{ borderBottom: '1px solid var(--t-line)', opacity: r.expired ? .5 : 1 }}>
                  <td style={{ padding: '8px 14px', fontFamily: 'monospace', color: 'var(--t-text-muted)' }}>{r.date}</td>
                  <td style={{ padding: '8px 14px', fontWeight: 700, color: 'var(--t-text)', whiteSpace: 'nowrap' }}>{r.emp.full_name}</td>
                  <td style={{ padding: '8px 14px', color: 'var(--t-text-muted)' }}>{r.emp.location}</td>
                  <td style={{ padding: '8px 14px' }}><IncidentBadge type={r.type} /></td>
                  <td style={{ padding: '8px 14px', fontWeight: 800, fontFamily: 'monospace', color: r.expired ? 'var(--t-text-faint)' : r.type === 'ncns' ? '#fca5a5' : r.type === 'callout' ? 'var(--t-danger)' : 'var(--t-warn)' }}>
                    {r.expired ? <span style={{ fontSize: 10 }}>EXPIRED</span> : `+${r.pts}`}
                  </td>
                  <td style={{ padding: '8px 14px', fontFamily: 'monospace', fontWeight: 700, color: 'var(--t-text)' }}>{r.runningTotal}</td>
                  <td style={{ padding: '8px 14px', color: 'var(--t-accent)', fontWeight: 600 }}>{r.recordedBy}</td>
                </tr>
              ))}
              {pageRows.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ padding: '20px 14px', textAlign: 'center', color: 'var(--t-text-muted)', fontSize: 13 }}>
                    {allLog.length === 0 ? 'No incidents recorded yet.' : 'No incidents match current filters.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════════════
   TAB 3 — THRESHOLDS CONFIG (display-only)
══════════════════════════════════════════════════════════════════════ */
function TabThresholds({ cfg }) {
  const stages = [
    { label: 'Verbal Warning',      threshold: cfg.points_verbal_threshold,      color: 'var(--t-warn)',    badge: 'badge amber' },
    { label: 'Written Warning',     threshold: cfg.points_written_threshold,     color: 'var(--t-warn)',    badge: 'badge amber' },
    { label: 'Final Warning',       threshold: cfg.points_final_threshold,       color: 'var(--t-danger)',  badge: 'badge red' },
    { label: 'Suspension Level',    threshold: cfg.points_suspension_threshold,  color: 'var(--t-danger)',  badge: 'badge red' },
    { label: 'Termination Level',   threshold: cfg.points_termination_threshold, color: '#fca5a5',          badge: 'badge red' },
  ]
  const maxPts = cfg.points_termination_threshold + 2

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Point values */}
      <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', padding: '14px 18px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--t-text-muted)', textTransform: 'uppercase', letterSpacing: '.07em' }}>Point Values Per Incident Type</div>
          <a href="#settings-white-label"
            onClick={e => { e.preventDefault(); document.getElementById('settings-white-label')?.scrollIntoView({ behavior: 'smooth' }) }}
            style={{ fontSize: 11, color: 'var(--t-accent)', fontWeight: 700, textDecoration: 'none', cursor: 'pointer' }}>
            Edit in Settings → White Label →
          </a>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          {[
            { label: 'Tardy',   pts: cfg.points_tardy,   color: 'var(--t-warn)', desc: 'Late arrival, partial shift' },
            { label: 'Callout', pts: cfg.points_callout, color: 'var(--t-danger)', desc: 'Called out, gave notice' },
            { label: 'NCNS',    pts: cfg.points_ncns,    color: '#fca5a5', desc: 'No call no show — most severe' },
          ].map(row => (
            <div key={row.label} style={{ background: 'var(--t-surface-2)', border: '1px solid var(--t-line)', padding: '12px 14px' }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--t-text-muted)', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 4 }}>{row.label}</div>
              <div style={{ fontSize: 28, fontWeight: 900, color: row.color, lineHeight: 1, marginBottom: 4 }}>{row.pts}<span style={{ fontSize: 14 }}>pt</span></div>
              <div style={{ fontSize: 11, color: 'var(--t-text-faint)' }}>{row.desc}</div>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 12, fontSize: 11, color: 'var(--t-text-muted)', background: 'rgba(0,229,255,.06)', padding: '8px 12px', border: '1px solid var(--t-line)' }}>
          Points expire after <strong style={{ color: 'var(--t-accent)' }}>{cfg.points_expiry_months} months</strong>. All thresholds configurable in <strong>Settings → White Label</strong>.
        </div>
      </div>

      {/* Points Ladder */}
      <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', padding: '16px 18px' }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--t-text-muted)', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 14 }}>Points Ladder</div>
        <div style={{ position: 'relative', height: 40 }}>
          {/* Track */}
          <div style={{ position: 'absolute', top: '50%', left: 0, right: 0, height: 8, transform: 'translateY(-50%)', background: 'linear-gradient(to right, var(--t-success) 0%, var(--t-warn) 40%, var(--t-danger) 75%, #7f1d1d 100%)' }} />
          {/* Markers */}
          {stages.map((s, i) => {
            const pct = (s.threshold / maxPts) * 100
            return (
              <div key={i} style={{ position: 'absolute', left: `${pct}%`, top: 0, transform: 'translateX(-50%)', display: 'flex', flexDirection: 'column', alignItems: 'center', width: 1 }}>
                <div style={{ width: 2, height: 40, background: s.color, opacity: .8 }} />
              </div>
            )
          })}
          {/* Zero and max labels */}
          <div style={{ position: 'absolute', left: 0, bottom: -18, fontSize: 9, color: 'var(--t-text-faint)' }}>0</div>
          <div style={{ position: 'absolute', right: 0, bottom: -18, fontSize: 9, color: 'var(--t-text-faint)' }}>{maxPts}</div>
        </div>
        {/* Stage labels below */}
        <div style={{ marginTop: 28, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {stages.map((s, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 36, height: 14, background: `linear-gradient(to right, var(--t-surface-2) 0%, ${s.color}88 100%)`, border: `1px solid ${s.color}`, flexShrink: 0 }} />
              <span className={s.badge} style={{ fontSize: 9 }}>{s.label}</span>
              <span style={{ fontSize: 12, fontWeight: 800, color: s.color, fontFamily: 'monospace' }}>{s.threshold}pt</span>
              <span style={{ fontSize: 11, color: 'var(--t-text-faint)' }}>and above triggers this stage</span>
            </div>
          ))}
        </div>
      </div>

      {/* Threshold table */}
      <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', overflow: 'hidden' }}>
        <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--t-line)', fontSize: 11, fontWeight: 700, color: 'var(--t-text-muted)', textTransform: 'uppercase', letterSpacing: '.07em' }}>
          Disciplinary Stage Thresholds
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ background: 'var(--t-surface-2)', borderBottom: '1px solid var(--t-line)' }}>
              {['Stage', 'Points Required', 'Action Required', 'Status'].map(h => (
                <th key={h} style={{ textAlign: 'left', padding: '8px 14px', fontWeight: 700, fontSize: 10, letterSpacing: '.07em', color: 'var(--t-text-muted)', textTransform: 'uppercase' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[
              { stage: 'GOOD',             pts: `< ${cfg.points_verbal_threshold}`,  action: 'No action required',           badge: 'badge green' },
              { stage: 'VERBAL WARNING',   pts: `≥ ${cfg.points_verbal_threshold}`,  action: 'Verbal warning conversation',  badge: 'badge amber' },
              { stage: 'WRITTEN WARNING',  pts: `≥ ${cfg.points_written_threshold}`, action: 'Written warning, file note',   badge: 'badge amber' },
              { stage: 'FINAL WARNING',    pts: `≥ ${cfg.points_final_threshold}`,   action: 'Final written warning + PIP',  badge: 'badge red' },
              { stage: 'SUSPENSION LEVEL', pts: `≥ ${cfg.points_suspension_threshold}`, action: 'Suspension review meeting', badge: 'badge red' },
              { stage: 'TERMINATION LEVEL',pts: `≥ ${cfg.points_termination_threshold}`, action: 'Termination proceedings',  badge: 'badge red' },
            ].map((row, i) => (
              <tr key={i} style={{ borderBottom: '1px solid var(--t-line)' }}>
                <td style={{ padding: '9px 14px' }}><span className={row.badge} style={{ fontSize: 9 }}>{row.stage}</span></td>
                <td style={{ padding: '9px 14px', fontFamily: 'monospace', fontWeight: 800, color: 'var(--t-text)' }}>{row.pts}</td>
                <td style={{ padding: '9px 14px', color: 'var(--t-text-muted)' }}>{row.action}</td>
                <td style={{ padding: '9px 14px' }}>
                  <a href="#settings-white-label"
                    onClick={e => e.preventDefault()}
                    style={{ fontSize: 10, color: 'var(--t-accent)', fontWeight: 600, textDecoration: 'none' }}>
                    Edit in Settings
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ fontSize: 11, color: 'var(--t-text-muted)', background: 'var(--t-surface)', border: '1px solid var(--t-line)', padding: '10px 14px' }}>
        All point values and thresholds are read from your White Label configuration. Changes take effect immediately across all reports and notifications. Points that have expired are excluded from the current balance calculation.
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════════════
   MAIN EXPORT
══════════════════════════════════════════════════════════════════════ */
const TABS = [
  { id: 'employees',  label: 'All Employees' },
  { id: 'incidents',  label: 'Incident Log' },
  { id: 'thresholds', label: 'Thresholds Config' },
]

export default function AttendancePoints() {
  const flagEnabled = useFeatureFlag('attendance_points')
  const cfg = useConfig()
  const { session } = useAuth()
  const [tab, setTab] = useState('employees')

  const role = session?.person?.role_name || ''
  const isManager = ['ceo', 'hr', 'manager', 'coo', 'admin', 'owner'].some(x => role.toLowerCase().includes(x))

  // Live data from the HR backend
  const [overview, setOverview] = useState(null)  // null = loading
  const [loadError, setLoadError] = useState('')

  // Pull thresholds from White-Label config with fallbacks (hooks before any early return)
  const resolvedCfg = useMemo(() => ({
    points_tardy:                cfg?.points_tardy                ?? 0.5,
    points_callout:              cfg?.points_callout              ?? 1.0,
    points_ncns:                 cfg?.points_ncns                 ?? 2.0,
    points_verbal_threshold:     cfg?.points_verbal_threshold     ?? 4,
    points_written_threshold:    cfg?.points_written_threshold    ?? 6,
    points_final_threshold:      cfg?.points_final_threshold      ?? 8,
    points_suspension_threshold: cfg?.points_suspension_threshold ?? 10,
    points_termination_threshold:cfg?.points_termination_threshold?? 12,
    points_expiry_months:        cfg?.points_expiry_months        ?? 6,
  }), [cfg])

  const loadOverview = useCallback(async () => {
    const s = getSession()
    const nodeIds = s.nodes || []
    if (!nodeIds.length) { setOverview([]); setLoadError(''); return }
    setLoadError('')
    const { data, error } = await sb.rpc('get_attendance_overview', { p_node_ids: nodeIds })
    if (error) {
      setLoadError(error.message || 'Unable to load attendance records.')
      setOverview([])
      return
    }
    setOverview(Array.isArray(data) ? data : [])
  }, [])

  useEffect(() => {
    if (!flagEnabled || !isManager) return
    loadOverview()
  }, [flagEnabled, isManager, loadOverview])

  // Record an incident, then refresh from the server (returns true on success)
  const addIncident = useCallback(async (personId, nodeId, type, pts, reason) => {
    const s = getSession()
    const { error } = await sb.rpc('add_attendance_incident', {
      p_person_id: personId,
      p_node_id: nodeId,
      p_type: type,
      p_points: pts,
      p_reason: reason,
      p_recorded_by: s.id ?? null,
      p_expiry_months: resolvedCfg.points_expiry_months,
    })
    if (error) { return false }
    await loadOverview()
    return true
  }, [loadOverview, resolvedCfg.points_expiry_months])

  // Enrich the raw roster payload with computed points / stages / running totals
  const roster = useMemo(() => {
    if (!Array.isArray(overview)) return []
    return overview.map(emp => enrichRow(emp, resolvedCfg))
  }, [overview, resolvedCfg])

  const locations = useMemo(
    () => [...new Set(roster.map(r => r.location).filter(Boolean))].sort(),
    [roster]
  )

  // KPI row
  const kpiData = useMemo(() => {
    const allPts = roster.map(r => r.pts)
    const atWarning     = allPts.filter(p => p >= resolvedCfg.points_verbal_threshold).length
    const atFinal       = allPts.filter(p => p >= resolvedCfg.points_final_threshold).length
    const atTermination = allPts.filter(p => p >= resolvedCfg.points_termination_threshold).length
    const avg = allPts.length ? Math.round(allPts.reduce((s, x) => s + x, 0) / allPts.length * 10) / 10 : 0
    return { atWarning, atFinal, atTermination, avg }
  }, [roster, resolvedCfg])

  // Drill-down over the employee roster
  const [drill, setDrill] = useState(null)
  const ROSTER_COLS = [
    { key: 'full_name', label: 'Employee', value: r => r.full_name },
    { key: 'location', label: 'Location', value: r => r.location },
    { key: 'role', label: 'Role', value: r => r.role },
    { key: 'pts', label: 'Points', align: 'right', value: r => r.pts, sortKey: r => r.pts },
    { key: 'stage', label: 'Stage', value: r => r.stage },
    { key: 'activeIncidents', label: 'Active Incidents', align: 'right', value: r => r.activeIncidents, sortKey: r => r.activeIncidents },
    { key: 'last', label: 'Last Incident', value: r => (r.last ? `${r.last.type.toUpperCase()} · ${r.last.date}` : 'None') },
  ]
  const openDrill = (title, rows, accent) => setDrill({ title, subtitle: `${rows.length} employee${rows.length === 1 ? '' : 's'}`, columns: ROSTER_COLS, rows: [...rows].sort((a, b) => b.pts - a.pts), accent })

  if (!flagEnabled) return (
    <div style={{ padding: 24, minHeight: '100dvh', background: 'var(--t-bg,#070b14)', color: 'var(--t-text)' }}>
      <FeatureDisabled />
    </div>
  )
  if (!isManager) return (
    <div style={{ padding: 24, minHeight: '100dvh', background: 'var(--t-bg,#070b14)', color: 'var(--t-text)' }}>
      <LockScreen />
    </div>
  )

  const locCount = locations.length

  return (
    <div style={{ padding: 24, minHeight: '100dvh', background: 'var(--t-bg,#070b14)', color: 'var(--t-text)' }}>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--t-text)', letterSpacing: '-.01em' }}>
            ATTENDANCE POINTS SYSTEM
          </div>
          <span className="badge purple">Managers Only</span>
          {overview !== null && <span className="badge blue">{roster.length} Employees</span>}
          {overview !== null && locCount > 0 && <span className="badge blue">{locCount} Location{locCount === 1 ? '' : 's'}</span>}
        </div>
        {/* Config display row */}
        <div style={{ fontSize: 11, color: 'var(--t-text-muted)', background: 'var(--t-surface)', border: '1px solid var(--t-line)', padding: '7px 12px', display: 'inline-flex', gap: 14, flexWrap: 'wrap', marginTop: 6 }}>
          <span>Tardy: <strong style={{ color: 'var(--t-warn)' }}>{resolvedCfg.points_tardy}pt</strong></span>
          <span style={{ color: 'var(--t-line)' }}>·</span>
          <span>Callout: <strong style={{ color: 'var(--t-danger)' }}>{resolvedCfg.points_callout}pt</strong></span>
          <span style={{ color: 'var(--t-line)' }}>·</span>
          <span>NCNS: <strong style={{ color: '#fca5a5' }}>{resolvedCfg.points_ncns}pt</strong></span>
          <span style={{ color: 'var(--t-line)' }}>·</span>
          <span>Points expire after <strong style={{ color: 'var(--t-accent)' }}>{resolvedCfg.points_expiry_months} months</strong></span>
          <span style={{ color: 'var(--t-line)' }}>·</span>
          <span style={{ color: 'var(--t-text-faint)' }}>All thresholds configurable in Settings → White Label</span>
        </div>
      </div>

      {/* KPI Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginBottom: 20 }}>
        <KTile
          label="At Warning Level"
          value={kpiData.atWarning}
          sub={`≥ ${resolvedCfg.points_verbal_threshold}pt verbal threshold`}
          color={kpiData.atWarning > 0 ? 'var(--t-danger)' : 'var(--t-success)'}
          alert={kpiData.atWarning > 0 ? 'red' : null}
          onClick={() => openDrill('Employees At Warning Level', roster.filter(r => r.pts >= resolvedCfg.points_verbal_threshold), 'var(--t-danger)')}
        />
        <KTile
          label="At Final Warning"
          value={kpiData.atFinal}
          sub={`≥ ${resolvedCfg.points_final_threshold}pt final threshold`}
          color={kpiData.atFinal > 0 ? 'var(--t-danger)' : 'var(--t-success)'}
          alert={kpiData.atFinal > 0 ? 'red' : null}
          onClick={() => openDrill('Employees At Final Warning', roster.filter(r => r.pts >= resolvedCfg.points_final_threshold), 'var(--t-danger)')}
        />
        <KTile
          label="At Termination Level"
          value={kpiData.atTermination}
          sub={`≥ ${resolvedCfg.points_termination_threshold}pt termination`}
          color={kpiData.atTermination > 0 ? 'var(--t-danger)' : 'var(--t-success)'}
          alert={kpiData.atTermination > 0 ? 'red' : null}
          onClick={() => openDrill('Employees At Termination Level', roster.filter(r => r.pts >= resolvedCfg.points_termination_threshold), 'var(--t-danger)')}
        />
        <KTile
          label="Avg Points (Active)"
          value={kpiData.avg}
          sub="All employees, active pts only"
          color={kpiData.avg >= resolvedCfg.points_final_threshold ? 'var(--t-danger)' : kpiData.avg >= resolvedCfg.points_verbal_threshold ? 'var(--t-warn)' : 'var(--t-success)'}
          alert={kpiData.avg >= resolvedCfg.points_verbal_threshold ? 'amber' : null}
          onClick={() => openDrill('All Employees — Points Standing', roster, 'var(--t-accent)')}
        />
      </div>
      <DrillDown open={!!drill} onClose={() => setDrill(null)} {...(drill || {})} />

      {/* Tab Bar */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--t-line)', marginBottom: 20, flexWrap: 'wrap' }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{
              padding: '10px 18px', fontSize: 12, fontWeight: 700, cursor: 'pointer',
              background: 'transparent', border: 'none', borderRadius: 0,
              borderBottom: `2px solid ${tab === t.id ? 'var(--t-accent)' : 'transparent'}`,
              color: tab === t.id ? 'var(--t-accent)' : 'var(--t-text-muted)',
              letterSpacing: '.04em',
            }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {tab === 'thresholds' ? (
        <TabThresholds cfg={resolvedCfg} />
      ) : loadError ? (
        <StatePanel icon="⚠️" tone="error" title="Couldn't load attendance records" msg={loadError} />
      ) : overview === null ? (
        <StatePanel icon="⏳" title="Loading attendance records…" />
      ) : tab === 'employees' ? (
        <TabAllEmployees roster={roster} locations={locations} cfg={resolvedCfg} onAddIncident={addIncident} />
      ) : (
        <TabIncidentLog roster={roster} locations={locations} cfg={resolvedCfg} />
      )}
    </div>
  )
}
