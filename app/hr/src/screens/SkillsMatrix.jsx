import React, { useState, useMemo, useEffect, useCallback } from 'react'
import { useFeatureFlag } from '../lib/featureFlags.js'
import { useAuth } from '../lib/auth.jsx'
import { sb } from '../lib/supabase'
import { useScope } from '../lib/scope.jsx'
import DrillDown from '../components/DrillDown.jsx'

// ── Real competency status → cell state ─────────────────────────────────────
// competency_status.status is one of: trained | in_training | not_trained.
// A competency absent from a person's map renders as NOT_TRACKED.
const STATUS_TO_CELL = {
  trained:     'CERTIFIED',
  in_training: 'IN_PROGRESS',
  not_trained: 'NOT_STARTED',
}
// Reverse map used by the inline editor (cell state → status write value).
const CELL_TO_STATUS = {
  CERTIFIED:   'trained',
  IN_PROGRESS: 'in_training',
  NOT_STARTED: 'not_trained',
}

// Cell state constants (theme tokens only — no new colors)
const CELL = {
  CERTIFIED:   { label: '✓', bg: 'rgba(0,229,147,0.2)',  color: 'var(--t-success)',    text: 'TRAINED' },
  IN_PROGRESS: { label: '◐', bg: 'rgba(255,159,10,0.2)', color: 'var(--t-warn)',       text: 'IN TRAINING' },
  NOT_STARTED: { label: '✗', bg: 'rgba(255,59,48,0.2)',  color: 'var(--t-danger)',     text: 'NOT STARTED' },
  NOT_TRACKED: { label: '—', bg: 'var(--t-bg)',          color: 'var(--t-text-faint)', text: 'NOT TRACKED' },
}

// Status choices offered by the inline editor, in cycle order.
const EDIT_CHOICES = [
  { status: 'trained',     label: 'Trained',     color: 'var(--t-success)' },
  { status: 'in_training', label: 'In Training', color: 'var(--t-warn)' },
  { status: 'not_trained', label: 'Not Started', color: 'var(--t-danger)' },
]

// Build a short abbreviation from a competency label (e.g. "Cash Handling" → "CH").
function abbrOf(label, key) {
  const words = String(label || key || '').replace(/[^a-zA-Z0-9 ]/g, '').split(/\s+/).filter(Boolean)
  if (words.length === 0) return String(key || '').slice(0, 4).toUpperCase()
  if (words.length === 1) return words[0].slice(0, 4).toUpperCase()
  return words.map(w => w[0]).join('').slice(0, 5).toUpperCase()
}

// ── FeatureDisabled ───────────────────────────────────────────────────────────
function FeatureDisabled() {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      padding: '60px 24px', background: 'var(--t-surface)', border: '1px solid var(--t-line)',
      gap: 12,
    }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--t-text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
        Feature Disabled
      </div>
      <div style={{ fontSize: 13, color: 'var(--t-text-faint)', textAlign: 'center', maxWidth: 400 }}>
        The Skills Matrix feature is not enabled. An administrator can enable it via Feature Toggles.
      </div>
    </div>
  )
}

// ── Simple centered notice (loading / empty / error) ────────────────────────
function Notice({ title, body }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      padding: '60px 24px', background: 'var(--t-surface)', border: '1px solid var(--t-line)', gap: 10,
    }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--t-text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
        {title}
      </div>
      {body && <div style={{ fontSize: 13, color: 'var(--t-text-faint)', textAlign: 'center', maxWidth: 440 }}>{body}</div>}
    </div>
  )
}

// ── KPI Tile ──────────────────────────────────────────────────────────────────
function KTile({ label, value, sub, color, alert, onClick }) {
  return (
    <div
      onClick={onClick}
      title={onClick ? 'Click to drill into records' : undefined}
      style={{
      background: 'var(--t-surface)',
      border: `1px solid ${alert === 'red' ? 'var(--t-danger)' : alert === 'amber' ? 'var(--t-warn)' : 'var(--t-line)'}`,
      padding: '14px 16px',
      position: 'relative',
      overflow: 'hidden',
      flex: 1,
      minWidth: 140,
      cursor: onClick ? 'pointer' : 'default',
    }}>
      {alert === 'red' && <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'var(--t-danger)' }} />}
      {alert === 'amber' && <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'var(--t-warn)' }} />}
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.08em', color: 'var(--t-text-muted)', textTransform: 'uppercase', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800, color: color || 'var(--t-text)', lineHeight: 1, marginBottom: 4 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--t-text-faint)' }}>{sub}</div>}
    </div>
  )
}

function toast(msg, type = 'error') {
  try { window.dispatchEvent(new CustomEvent('vip-toast', { detail: { msg, type } })) } catch (_) { /* non-browser */ }
}

// ── Main export ───────────────────────────────────────────────────────────────
export default function SkillsMatrix() {
  const flagEnabled = useFeatureFlag('skills_matrix')
  const { session } = useAuth()
  const actorId = session?.person?.id || null
  const { locationIds } = useScope() || {}
  const role = session?.person?.role_name || ''
  const isManager = ['manager', 'hr', 'coo', 'admin', 'owner', 'lead'].some(x => role.toLowerCase().includes(x))

  const [locFilter, setLocFilter] = useState('All')
  const [roleFilter, setRoleFilter] = useState('All')
  const [showGapsOnly, setShowGapsOnly] = useState(false)

  // Live state (real backend only — no mock fallback)
  const [rows, setRows] = useState([])          // get_skills_matrix rows
  const [defs, setDefs] = useState([])          // get_competency_defs rows
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)
  const [editing, setEditing] = useState(null)  // { personId, key, x, y, node_id }

  const load = useCallback(async () => {
    if (!Array.isArray(locationIds) || locationIds.length === 0) {
      setRows([]); setDefs([]); setLoading(false); return
    }
    setLoading(true); setError(null)
    try {
      const [matrixRes, defsRes] = await Promise.all([
        sb.rpc('get_skills_matrix', { p_node_ids: locationIds }),
        sb.rpc('get_competency_defs'),
      ])
      if (matrixRes.error) throw matrixRes.error
      setRows(Array.isArray(matrixRes.data) ? matrixRes.data : [])
      // defs are enrichment only — a failure there must not blank the matrix
      setDefs(!defsRes.error && Array.isArray(defsRes.data) ? defsRes.data : [])
    } catch (e) {
      console.error('get_skills_matrix failed', e)
      setError(e?.message || 'Failed to load skills matrix')
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [locationIds])

  useEffect(() => { load() }, [load])

  // ── Derive employees, skills, matrix from real rows ───────────────────────
  const employees = useMemo(() => rows.map(r => ({
    id: r.person_id,
    name: r.full_name || '—',
    location: r.node_name || '—',
    role: r.role_name || '—',
    node_id: r.node_id || null,
  })), [rows])

  // Competency columns: labels/order from defs, augmented with any key that
  // appears in the live data but is not (yet) in the definitions table.
  const skills = useMemo(() => {
    const byKey = new Map()
    defs.forEach((d, i) => {
      if (!d || !d.key) return
      byKey.set(d.key, { key: d.key, label: d.label || d.key, abbr: abbrOf(d.label, d.key), sort: (d.sort_order ?? i) })
    })
    let extra = 1000
    rows.forEach(r => {
      const comp = r?.competencies || {}
      Object.keys(comp).forEach(k => {
        if (!byKey.has(k)) byKey.set(k, { key: k, label: k, abbr: abbrOf(k, k), sort: extra++ })
      })
    })
    return [...byKey.values()].sort((a, b) => a.sort - b.sort)
  }, [defs, rows])

  // matrix: personId → { competency_key → CELL state }
  const matrix = useMemo(() => {
    const m = {}
    rows.forEach(r => {
      const comp = r?.competencies || {}
      const cell = {}
      skills.forEach(sk => {
        const st = comp[sk.key]
        cell[sk.key] = st ? (STATUS_TO_CELL[st] || 'NOT_TRACKED') : 'NOT_TRACKED'
      })
      m[r.person_id] = cell
    })
    return m
  }, [rows, skills])

  const locations = useMemo(() => [...new Set(employees.map(e => e.location))].filter(Boolean), [employees])
  const allRoles = useMemo(() => [...new Set(employees.map(e => e.role))].filter(Boolean), [employees])

  const filteredEmps = useMemo(() => {
    return employees.filter(emp => {
      if (locFilter !== 'All' && emp.location !== locFilter) return false
      if (roleFilter !== 'All' && emp.role !== roleFilter) return false
      if (showGapsOnly) {
        const hasGap = skills.some(sk => matrix[emp.id]?.[sk.key] === 'NOT_STARTED')
        if (!hasGap) return false
      }
      return true
    })
  }, [employees, skills, matrix, locFilter, roleFilter, showGapsOnly])

  // KPI computations (tracked = any competency with a real status)
  const { trainingRate, inProgress, fullyTrainedCount, gapsCount } = useMemo(() => {
    let tracked = 0, trained = 0, inprog = 0, full = 0, gaps = 0
    employees.forEach(emp => {
      let empTracked = 0, empTrained = 0
      skills.forEach(sk => {
        const state = matrix[emp.id]?.[sk.key]
        if (!state || state === 'NOT_TRACKED') return
        tracked++; empTracked++
        if (state === 'CERTIFIED') { trained++; empTrained++ }
        if (state === 'IN_PROGRESS') inprog++
        if (state === 'NOT_STARTED') gaps++
      })
      if (empTracked > 0 && empTrained === empTracked) full++
    })
    return {
      trainingRate: tracked > 0 ? Math.round((trained / tracked) * 100) : 0,
      inProgress: inprog,
      fullyTrainedCount: full,
      gapsCount: gaps,
    }
  }, [employees, skills, matrix])

  // Column summary counts (trained / tracked per competency)
  const colSummary = useMemo(() => {
    return skills.map(sk => {
      let tracked = 0, trained = 0
      employees.forEach(emp => {
        const state = matrix[emp.id]?.[sk.key]
        if (!state || state === 'NOT_TRACKED') return
        tracked++
        if (state === 'CERTIFIED') trained++
      })
      return { key: sk.key, trained, tracked }
    })
  }, [employees, skills, matrix])

  // ── Drill-down data ───────────────────────────────────────────────────────
  const [drill, setDrill] = useState(null)

  const flatCells = useMemo(() => {
    const out = []
    employees.forEach(emp => {
      skills.forEach(sk => {
        const state = matrix[emp.id]?.[sk.key] || 'NOT_TRACKED'
        if (state === 'NOT_TRACKED') return
        out.push({
          name: emp.name,
          location: emp.location,
          role: emp.role,
          skill: sk.label,
          abbr: sk.abbr,
          state,
          status: CELL[state]?.text || state,
        })
      })
    })
    return out
  }, [employees, skills, matrix])

  const empRollup = useMemo(() => {
    return employees.map(emp => {
      let tracked = 0, trained = 0, inprog = 0, gaps = 0
      skills.forEach(sk => {
        const state = matrix[emp.id]?.[sk.key]
        if (!state || state === 'NOT_TRACKED') return
        tracked++
        if (state === 'CERTIFIED') trained++
        if (state === 'IN_PROGRESS') inprog++
        if (state === 'NOT_STARTED') gaps++
      })
      return {
        name: emp.name, location: emp.location, role: emp.role,
        tracked, trained, inprog, gaps,
        coverage: tracked > 0 ? Math.round((trained / tracked) * 100) : 0,
      }
    })
  }, [employees, skills, matrix])

  const cellColumns = [
    { key: 'name',     label: 'Employee' },
    { key: 'location', label: 'Location' },
    { key: 'role',     label: 'Role' },
    { key: 'skill',    label: 'Competency' },
    { key: 'status',   label: 'Status', align: 'center', value: r => CELL[r.state]?.text || r.status },
  ]

  const empColumns = [
    { key: 'name',      label: 'Employee' },
    { key: 'location',  label: 'Location' },
    { key: 'role',      label: 'Role' },
    { key: 'tracked',   label: 'Tracked', align: 'right' },
    { key: 'trained',   label: 'Trained', align: 'right' },
    { key: 'inprog',    label: 'In Training', align: 'right' },
    { key: 'gaps',      label: 'Gaps', align: 'right' },
    { key: 'coverage',  label: 'Coverage %', align: 'right', value: r => `${r.coverage}%`, sortKey: r => r.coverage },
  ]

  const openDrill = (title, subtitle, columns, drillRows, accent, summary) =>
    setDrill({ title, subtitle, columns, rows: drillRows, accent, summary })

  function exportCSV() {
    const header = ['Employee', 'Location', 'Role', ...skills.map(s => s.label)].join(',')
    const csvRows = employees.map(emp => {
      const cells = skills.map(sk => CELL[matrix[emp.id]?.[sk.key] || 'NOT_TRACKED']?.text || 'NOT TRACKED')
      return [emp.name, emp.location, emp.role, ...cells].map(v => `"${v}"`).join(',')
    })
    const csv = [header, ...csvRows].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'skills-matrix.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  // ── Real write: set a competency status, then refresh ─────────────────────
  async function applyStatus(personId, key, status, nodeId) {
    setSaving(true)
    // optimistic update
    setRows(prev => prev.map(r => r.person_id === personId
      ? { ...r, competencies: { ...(r.competencies || {}), [key]: status } }
      : r))
    setEditing(null)
    try {
      const { error: e } = await sb.rpc('set_competency_status', {
        p_person_id: personId,
        p_competency_key: key,
        p_status: status,
        p_node_id: nodeId || null,
        p_actor: actorId,
      })
      if (e) throw e
      await load()
    } catch (e) {
      console.error('set_competency_status failed', e)
      toast('Not saved — could not update competency status.')
      await load() // reload real state to undo the optimistic change
    } finally {
      setSaving(false)
    }
  }

  const selectStyle = {
    padding: '7px 10px',
    background: 'var(--t-bg)',
    border: '1px solid var(--t-line)',
    color: 'var(--t-text)',
    fontSize: 13,
    fontFamily: 'inherit',
    cursor: 'pointer',
    outline: 'none',
  }

  const thBase = {
    padding: '6px 4px',
    fontSize: 10,
    fontWeight: 800,
    letterSpacing: '0.06em',
    color: 'var(--t-text-muted)',
    borderBottom: '2px solid var(--t-line)',
    background: 'var(--t-surface)',
    textAlign: 'center',
    whiteSpace: 'nowrap',
    cursor: 'default',
  }

  if (!flagEnabled) return <FeatureDisabled />

  return (
    <div style={{ fontFamily: 'inherit', color: 'var(--t-text)', padding: 24, maxWidth: 1600 }}>
      {/* Page header */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--t-text)', letterSpacing: '-0.01em', marginBottom: 4 }}>
          SKILLS &amp; CERTIFICATION MATRIX
        </div>
        <div style={{ fontSize: 12, color: 'var(--t-text-faint)' }}>
          Company-wide view of employee competencies and training status
          {isManager && ' · click any cell to update'}
        </div>
      </div>

      {/* KPI row */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 20 }}>
        <KTile
          label="Overall Training Rate"
          value={`${trainingRate}%`}
          color={trainingRate >= 80 ? 'var(--t-success)' : trainingRate >= 60 ? 'var(--t-warn)' : 'var(--t-danger)'}
          sub="trained / tracked cells"
          onClick={() => openDrill(
            'Overall Training Rate',
            `${trainingRate}% — trained / tracked competency cells across all employees`,
            cellColumns,
            flatCells,
            'var(--t-accent)',
            [
              { label: 'Tracked Cells', value: flatCells.length },
              { label: 'Trained', value: flatCells.filter(c => c.state === 'CERTIFIED').length, color: 'var(--t-success)' },
              { label: 'Training Rate', value: `${trainingRate}%` },
            ],
          )}
        />
        <KTile
          label="In Training"
          value={inProgress}
          color="var(--t-warn)"
          alert={inProgress > 0 ? 'amber' : null}
          sub="competencies in progress"
          onClick={() => openDrill(
            'In Training',
            'Employee × competency cells currently in training',
            cellColumns,
            flatCells.filter(c => c.state === 'IN_PROGRESS'),
            'var(--t-warn)',
            [{ label: 'In Training', value: inProgress, color: 'var(--t-warn)' }],
          )}
        />
        <KTile
          label="Fully Trained Employees"
          value={fullyTrainedCount}
          color="var(--t-success)"
          sub={`of ${employees.length} total`}
          onClick={() => openDrill(
            'Fully Trained Employees',
            'Employees whose every tracked competency is trained (no gaps or in-progress)',
            empColumns,
            empRollup.filter(e => e.tracked > 0 && e.gaps === 0 && e.inprog === 0),
            'var(--t-success)',
            [
              { label: 'Fully Trained', value: fullyTrainedCount, color: 'var(--t-success)' },
              { label: 'Total Employees', value: employees.length },
            ],
          )}
        />
        <KTile
          label="Skills Gaps"
          value={gapsCount}
          color={gapsCount > 0 ? 'var(--t-danger)' : 'var(--t-success)'}
          alert={gapsCount > 5 ? 'red' : null}
          sub="tracked but not started"
          onClick={() => openDrill(
            'Skills Gaps',
            'Employee × competency cells that are tracked but not started',
            cellColumns,
            flatCells.filter(c => c.state === 'NOT_STARTED'),
            'var(--t-danger)',
            [{ label: 'Total Gaps', value: gapsCount, color: 'var(--t-danger)' }],
          )}
        />
      </div>

      {/* Filter bar + export */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', marginBottom: 16, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--t-text-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Location</div>
          <select value={locFilter} onChange={e => setLocFilter(e.target.value)} style={{ ...selectStyle, width: 160 }}>
            <option value="All">All Locations</option>
            {locations.map(l => <option key={l}>{l}</option>)}
          </select>
        </div>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--t-text-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Role</div>
          <select value={roleFilter} onChange={e => setRoleFilter(e.target.value)} style={{ ...selectStyle, width: 160 }}>
            <option value="All">All Roles</option>
            {allRoles.map(r => <option key={r}>{r}</option>)}
          </select>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingBottom: 6 }}>
          <input
            type="checkbox"
            id="gaps-only"
            checked={showGapsOnly}
            onChange={e => setShowGapsOnly(e.target.checked)}
            style={{ width: 15, height: 15, cursor: 'pointer', accentColor: 'var(--t-accent)' }}
          />
          <label htmlFor="gaps-only" style={{ fontSize: 13, color: 'var(--t-text)', cursor: 'pointer', fontWeight: 600 }}>
            Show Only Gaps
          </label>
        </div>
        <div style={{ flex: 1 }} />
        <button
          onClick={exportCSV}
          disabled={employees.length === 0}
          style={{
            padding: '8px 18px', fontSize: 12, fontWeight: 700, fontFamily: 'inherit',
            cursor: employees.length === 0 ? 'not-allowed' : 'pointer', border: 'none', letterSpacing: '0.04em',
            background: 'var(--t-accent)', color: '#000', opacity: employees.length === 0 ? 0.5 : 1,
          }}
        >
          Export Matrix CSV
        </button>
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 14, flexWrap: 'wrap' }}>
        {Object.entries(CELL).map(([key, val]) => (
          <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
            <div style={{ width: 20, height: 20, background: val.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800, color: val.color, border: '1px solid var(--t-line)' }}>
              {val.label}
            </div>
            <span style={{ color: 'var(--t-text-muted)' }}>{val.text}</span>
          </div>
        ))}
      </div>

      {/* Body: loading / error / empty / matrix */}
      {loading ? (
        <Notice title="Loading" body="Fetching competency data…" />
      ) : error ? (
        <Notice title="Unable to load" body={error} />
      ) : employees.length === 0 || skills.length === 0 ? (
        <Notice
          title="No competency records"
          body="No employees or tracked competencies were found for the current scope. Competencies appear here once they are recorded for your team."
        />
      ) : (
        <>
          {/* Matrix table */}
          <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: 600, border: '1px solid var(--t-line)' }}>
            <table style={{ borderCollapse: 'collapse', tableLayout: 'fixed', minWidth: 1000 }}>
              <thead>
                <tr>
                  <th style={{
                    ...thBase,
                    position: 'sticky', left: 0, zIndex: 10,
                    width: 200, minWidth: 200, textAlign: 'left',
                    padding: '8px 12px',
                    borderRight: '2px solid var(--t-line)',
                  }}>
                    EMPLOYEE
                  </th>
                  {skills.map(skill => (
                    <th
                      key={skill.key}
                      title={skill.label}
                      style={{ ...thBase, width: 52, minWidth: 52, verticalAlign: 'bottom', paddingBottom: 8 }}
                    >
                      <div style={{
                        writingMode: 'vertical-rl', transform: 'rotate(180deg)',
                        maxHeight: 80, overflow: 'hidden', textOverflow: 'ellipsis', display: 'block',
                      }}>
                        {skill.abbr}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredEmps.map((emp, ei) => (
                  <tr key={emp.id} style={{ background: ei % 2 === 0 ? 'var(--t-bg)' : 'var(--t-surface)' }}>
                    <td style={{
                      position: 'sticky', left: 0, zIndex: 5,
                      background: ei % 2 === 0 ? 'var(--t-bg)' : 'var(--t-surface)',
                      padding: '8px 12px',
                      borderRight: '2px solid var(--t-line)',
                      borderBottom: '1px solid var(--t-line)',
                      minWidth: 200,
                    }}>
                      <div style={{ fontWeight: 700, fontSize: 12, color: 'var(--t-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {emp.name}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
                        <span style={{
                          fontSize: 10, fontWeight: 700, letterSpacing: '0.05em',
                          color: 'var(--t-accent)', background: 'rgba(0,229,255,0.1)', padding: '1px 6px',
                        }}>
                          {emp.location}
                        </span>
                        <span style={{ fontSize: 10, color: 'var(--t-text-faint)' }}>{emp.role}</span>
                      </div>
                    </td>
                    {skills.map(skill => {
                      const state = matrix[emp.id]?.[skill.key] || 'NOT_TRACKED'
                      const cell = CELL[state]
                      return (
                        <td
                          key={skill.key}
                          title={`${emp.name} — ${skill.label}: ${cell.text}${isManager ? ' (click to change)' : ''}`}
                          onClick={isManager ? (e) => {
                            const rect = e.currentTarget.getBoundingClientRect()
                            setEditing({ personId: emp.id, key: skill.key, x: rect.left, y: rect.bottom, node_id: emp.node_id })
                          } : undefined}
                          style={{
                            textAlign: 'center',
                            padding: '8px 4px',
                            background: cell.bg,
                            borderBottom: '1px solid var(--t-line)',
                            fontSize: 13,
                            fontWeight: 800,
                            color: cell.color,
                            cursor: isManager ? 'pointer' : 'default',
                          }}
                        >
                          {cell.label}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ background: 'var(--t-surface)' }}>
                  <td style={{
                    position: 'sticky', left: 0,
                    background: 'var(--t-surface)',
                    padding: '9px 12px',
                    borderTop: '2px solid var(--t-line)',
                    fontSize: 10, fontWeight: 800, color: 'var(--t-text-muted)',
                    textTransform: 'uppercase', letterSpacing: '0.06em',
                    zIndex: 5,
                    borderRight: '2px solid var(--t-line)',
                  }}>
                    TRAINED
                  </td>
                  {skills.map(skill => {
                    const sum = colSummary.find(s => s.key === skill.key)
                    const pct = sum && sum.tracked > 0 ? (sum.trained / sum.tracked) : 0
                    const color = pct >= 0.8 ? 'var(--t-success)' : pct >= 0.6 ? 'var(--t-warn)' : 'var(--t-danger)'
                    return (
                      <td key={skill.key} style={{
                        textAlign: 'center',
                        borderTop: '2px solid var(--t-line)',
                        padding: '9px 4px',
                        fontSize: 10, fontWeight: 800, color,
                      }}>
                        {sum && sum.tracked > 0 ? `${sum.trained}/${sum.tracked}` : '—'}
                      </td>
                    )
                  })}
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Footer note */}
          <div style={{ fontSize: 11, color: 'var(--t-text-faint)', marginTop: 10 }}>
            {filteredEmps.length} employee{filteredEmps.length !== 1 ? 's' : ''} shown · {skills.length} competenc{skills.length !== 1 ? 'ies' : 'y'} tracked
            {saving && ' · saving…'}
          </div>
        </>
      )}

      {/* Inline status editor (managers) */}
      {editing && (
        <>
          <div
            onClick={() => setEditing(null)}
            style={{ position: 'fixed', inset: 0, zIndex: 40 }}
          />
          <div style={{
            position: 'fixed',
            top: Math.min(editing.y + 4, (typeof window !== 'undefined' ? window.innerHeight : 800) - 150),
            left: Math.min(editing.x, (typeof window !== 'undefined' ? window.innerWidth : 1200) - 160),
            zIndex: 41,
            background: 'var(--t-surface)',
            border: '1px solid var(--t-line)',
            minWidth: 150,
            boxShadow: '0 6px 20px rgba(0,0,0,0.4)',
          }}>
            <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.06em', color: 'var(--t-text-muted)', padding: '8px 10px 4px', textTransform: 'uppercase' }}>
              Set Status
            </div>
            {EDIT_CHOICES.map(choice => (
              <button
                key={choice.status}
                onClick={() => applyStatus(editing.personId, editing.key, choice.status, editing.node_id)}
                disabled={saving}
                style={{
                  display: 'block', width: '100%', textAlign: 'left',
                  padding: '8px 10px', fontSize: 12, fontWeight: 700, fontFamily: 'inherit',
                  background: 'transparent', border: 'none', borderTop: '1px solid var(--t-line)',
                  color: choice.color, cursor: saving ? 'wait' : 'pointer',
                }}
              >
                {choice.label}
              </button>
            ))}
          </div>
        </>
      )}

      <DrillDown open={!!drill} onClose={() => setDrill(null)} {...(drill || {})} />
    </div>
  )
}
