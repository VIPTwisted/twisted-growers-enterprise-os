import { useState, useEffect, useCallback, useMemo } from 'react'
import { sb } from '../lib/supabase'
import { useScope } from '../lib/scope.jsx'
import { useAuth } from '../lib/auth.jsx'

// ─── Constants ────────────────────────────────────────────────────────────────
// Zone catalog, employees and assignments are ALL loaded live from Supabase.
// The only client-side constant is a presentational icon fallback keyed by the
// zone_key stored in the DB — icons are pure display, never data.

const ZONE_ICONS = {
  entrance:   '🚪',
  adult:      '🔐',
  register1:  '🖥️',
  register2:  '🖥️',
  register:   '🖥️',
  fitting:    '👗',
  stockroom:  '📦',
  backoffice: '🏢',
  floor:      '🛍️',
}
const zoneIcon = (key) => ZONE_ICONS[key] || '📍'

// A role counts as a "key holder" (manager / lead) for the ★ marker.
const KEY_ROLE_RX = /manager|owner|key|lead|supervis|coo|ceo|assistant/i

// ─── KPI Tile ─────────────────────────────────────────────────────────────────

function KTile({ label, value, sub, color, alert }) {
  return (
    <div style={{
      background: 'var(--t-surface)',
      border: `1px solid ${alert === 'red' ? 'var(--t-danger)' : alert === 'amber' ? 'var(--t-warn)' : 'var(--t-line)'}`,
      padding: '14px 16px',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {alert === 'red' && <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'var(--t-danger)' }} />}
      {alert === 'amber' && <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'var(--t-warn)' }} />}
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.08em', color: 'var(--t-text-muted)', textTransform: 'uppercase', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800, color: color || 'var(--t-text)', lineHeight: 1, marginBottom: 4 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--t-text-faint)' }}>{sub}</div>}
    </div>
  )
}

// ─── Zone Status Card ─────────────────────────────────────────────────────────

function ZoneCard({ zone, assignments, employees, selected, onSelect, onDrop, onReassign, onDeleteZone, canManage }) {
  const assigned = (assignments[zone.id] || []).map(id => employees.find(e => e.id === id)).filter(Boolean)
  const count = assigned.length
  const min = zone.min

  let borderColor = 'var(--t-line)'
  let topBar = null
  let statusLabel = 'Covered'
  let statusColor = 'var(--t-success)'

  if (count === 0 && min > 0) {
    borderColor = 'var(--t-danger)'
    topBar = 'var(--t-danger)'
    statusLabel = 'EMPTY'
    statusColor = 'var(--t-danger)'
  } else if (count < min) {
    borderColor = 'var(--t-warn)'
    topBar = 'var(--t-warn)'
    statusLabel = 'UNDERSTAFFED'
    statusColor = 'var(--t-warn)'
  }

  const isTarget = selected !== null

  return (
    <div
      onClick={() => isTarget && onDrop(zone.id)}
      style={{
        background: isTarget ? 'rgba(0,229,255,0.04)' : 'var(--t-surface)',
        border: `1px solid ${isTarget ? 'var(--t-accent)' : borderColor}`,
        padding: 0,
        cursor: isTarget ? 'pointer' : 'default',
        transition: 'border-color 0.15s, background 0.15s',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {topBar && <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: topBar }} />}

      <div style={{ padding: '10px 12px 8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 14 }}>{zone.icon}</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--t-text)' }}>{zone.label}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{
              fontSize: 9,
              fontWeight: 800,
              color: statusColor,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
            }}>
              {statusLabel}
            </span>
            {canManage && (
              <button
                title="Remove zone"
                onClick={e => { e.stopPropagation(); onDeleteZone(zone) }}
                style={{
                  background: 'transparent', border: 'none', color: 'var(--t-text-faint)',
                  fontSize: 12, lineHeight: 1, cursor: 'pointer', padding: 0,
                }}
              >×</button>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, minHeight: 28 }}>
          {assigned.length === 0 ? (
            <div style={{ fontSize: 11, color: 'var(--t-text-faint)', fontStyle: 'italic' }}>No one assigned</div>
          ) : (
            assigned.map(emp => {
              const isSelected = selected === emp.id
              return (
                <div
                  key={emp.id}
                  onClick={e => { e.stopPropagation(); onSelect(emp.id, zone.id) }}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    padding: '3px 8px',
                    background: isSelected ? 'rgba(0,229,255,0.15)' : 'var(--t-surface-2)',
                    border: `1px solid ${isSelected ? 'var(--t-accent)' : 'var(--t-line)'}`,
                    cursor: 'pointer',
                    fontSize: 11,
                    fontWeight: 600,
                    color: 'var(--t-text)',
                    userSelect: 'none',
                  }}
                >
                  <span style={{ fontSize: 9, color: emp.isKey ? 'var(--t-warn)' : 'var(--t-text-muted)' }}>
                    {emp.isKey ? '★' : '·'}
                  </span>
                  {emp.name}
                  {isSelected && (
                    <span style={{ fontSize: 9, color: 'var(--t-accent)', marginLeft: 2 }}>→</span>
                  )}
                </div>
              )
            })
          )}
        </div>

        <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 10, color: 'var(--t-text-faint)' }}>
            {count}/{min} min
          </div>
          <button
            onClick={e => { e.stopPropagation(); onReassign(zone.id) }}
            style={{
              background: 'transparent',
              border: '1px solid var(--t-line)',
              color: 'var(--t-text-muted)',
              fontSize: 10,
              padding: '2px 6px',
              cursor: 'pointer',
              letterSpacing: '0.04em',
            }}
          >
            + ASSIGN
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Assign Modal ─────────────────────────────────────────────────────────────

function AssignModal({ zone, employees, assignments, onAssign, onClose }) {
  const already = new Set((assignments[zone.id] || []))
  const available = employees.filter(e => !already.has(e.id))

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 9999,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }} onClick={onClose}>
      <div style={{
        background: 'var(--t-surface)',
        border: '1px solid var(--t-line)',
        padding: 24,
        minWidth: 280,
        maxWidth: 360,
        width: '90%',
      }} onClick={e => e.stopPropagation()}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--t-text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 16 }}>
          Assign to {zone.label}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 300, overflowY: 'auto' }}>
          {employees.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--t-text-faint)', fontStyle: 'italic' }}>No employees on the roster for this location.</div>
          ) : available.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--t-text-faint)', fontStyle: 'italic' }}>Everyone is already assigned here.</div>
          ) : (
            available.map(emp => (
              <div
                key={emp.id}
                onClick={() => onAssign(zone.id, emp)}
                style={{
                  padding: '8px 12px',
                  background: 'var(--t-surface-2)',
                  border: '1px solid var(--t-line)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  fontSize: 12,
                  fontWeight: 600,
                  color: 'var(--t-text)',
                }}
              >
                <span style={{ fontSize: 10, color: emp.isKey ? 'var(--t-warn)' : 'var(--t-text-muted)' }}>
                  {emp.isKey ? '★' : '·'}
                </span>
                {emp.name}
                <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--t-text-faint)', textTransform: 'uppercase' }}>
                  {emp.role}
                </span>
              </div>
            ))
          )}
        </div>
        <button
          onClick={onClose}
          style={{
            marginTop: 16,
            width: '100%',
            background: 'transparent',
            border: '1px solid var(--t-line)',
            color: 'var(--t-text-muted)',
            padding: '8px 0',
            cursor: 'pointer',
            fontSize: 11,
            letterSpacing: '0.06em',
          }}
        >
          CANCEL
        </button>
      </div>
    </div>
  )
}

// ─── Add Zone Modal ───────────────────────────────────────────────────────────

function AddZoneModal({ onCreate, onClose, saving }) {
  const [label, setLabel] = useState('')
  const [minStaff, setMinStaff] = useState(1)

  const submit = () => {
    const l = label.trim()
    if (!l) return
    const key = l.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
    onCreate({ zone_key: key || `zone_${Date.now()}`, label: l, min_staff: Math.max(0, Number(minStaff) || 0) })
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 9999,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }} onClick={onClose}>
      <div style={{
        background: 'var(--t-surface)', border: '1px solid var(--t-line)', padding: 24,
        minWidth: 280, maxWidth: 360, width: '90%',
      }} onClick={e => e.stopPropagation()}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--t-text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 16 }}>
          New Zone
        </div>
        <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--t-text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Zone name</label>
        <input
          autoFocus
          value={label}
          onChange={e => setLabel(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') submit() }}
          placeholder="e.g. Register 3"
          style={{
            width: '100%', margin: '6px 0 14px', padding: '8px 10px', fontSize: 12,
            background: 'var(--t-surface-2)', border: '1px solid var(--t-line)', color: 'var(--t-text)',
          }}
        />
        <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--t-text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Minimum staff</label>
        <input
          type="number" min={0} value={minStaff}
          onChange={e => setMinStaff(e.target.value)}
          style={{
            width: '100%', margin: '6px 0 16px', padding: '8px 10px', fontSize: 12,
            background: 'var(--t-surface-2)', border: '1px solid var(--t-line)', color: 'var(--t-text)',
          }}
        />
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={submit}
            disabled={saving || !label.trim()}
            style={{
              flex: 1, background: 'var(--t-accent)', border: '1px solid var(--t-accent)',
              color: '#04121a', padding: '8px 0', cursor: saving ? 'default' : 'pointer',
              fontSize: 11, fontWeight: 800, letterSpacing: '0.06em', opacity: saving || !label.trim() ? 0.6 : 1,
            }}
          >
            {saving ? 'SAVING…' : 'CREATE'}
          </button>
          <button
            onClick={onClose}
            style={{
              flex: 1, background: 'transparent', border: '1px solid var(--t-line)',
              color: 'var(--t-text-muted)', padding: '8px 0', cursor: 'pointer',
              fontSize: 11, letterSpacing: '0.06em',
            }}
          >
            CANCEL
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main Zones Component ─────────────────────────────────────────────────────

export default function Zones() {
  const { session } = useAuth()
  const { locations, activeLocation } = useScope()

  const role_name = session?.person?.role_name ?? ''
  const canManage = /ceo|coo|hr|manager|owner|admin|lead|supervis|assistant/i.test(role_name)

  const todayISO = useMemo(() => new Date().toISOString().slice(0, 10), [])

  // The zone board is per-location. Focus the scope's active location, else the
  // first location this user can reach.
  const [focusNodeId, setFocusNodeId] = useState(null)
  useEffect(() => {
    setFocusNodeId(prev => {
      const reachable = (locations || []).map(l => l.id)
      if (prev && reachable.includes(prev)) return prev
      if (activeLocation?.id) return activeLocation.id
      return reachable[0] || null
    })
  }, [activeLocation, locations])

  const focusNode = useMemo(
    () => (locations || []).find(l => l.id === focusNodeId) || null,
    [locations, focusNodeId]
  )
  const locationLabel = focusNode?.name || 'Location'

  // ── State ──────────────────────────────────────────────────────────────────
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [zones, setZones] = useState([])              // [{ id(zone_key), label, min, icon }]
  const [assignments, setAssignments] = useState({})  // { [zone_key]: personId[] }
  const [employees, setEmployees] = useState([])      // [{ id, name, role, isKey }]

  const [selectedEmp, setSelectedEmp] = useState(null)  // { id, fromZone }
  const [assignTarget, setAssignTarget] = useState(null) // zone_key for assign modal
  const [showAddZone, setShowAddZone] = useState(false)
  const [saving, setSaving] = useState(false)

  // ── Load everything live from Supabase ─────────────────────────────────────
  const loadAll = useCallback(async () => {
    if (!focusNodeId) { setLoading(false); return }
    setLoading(true)
    setError(null)
    try {
      const [zoneRes, rosterRes, assignRes] = await Promise.all([
        sb.rpc('get_location_zones', { p_node_ids: [focusNodeId] }),
        sb.rpc('get_roster', { p_node_ids: [focusNodeId] }),
        sb.rpc('get_zone_assignments', { p_node_ids: [focusNodeId], p_shift_date: todayISO }),
      ])
      if (zoneRes.error) throw zoneRes.error
      if (assignRes.error) throw assignRes.error

      // Zone catalog (real; empty is honest)
      const zoneRows = (zoneRes.data || []).map(z => ({
        id:    z.zone_key,
        label: z.label || z.zone_key,
        min:   z.min_staff ?? 0,
        icon:  zoneIcon(z.zone_key),
      }))

      // Employees from the live roster
      const empMap = {}
      ;(rosterRes.error ? [] : (rosterRes.data || [])).forEach(r => {
        const id = r.id ?? r.person_id
        if (!id) return
        const role = r.role_name ?? r.role ?? ''
        empMap[id] = {
          id,
          name: r.full_name ?? r.display_name ?? '—',
          role: role || 'staff',
          isKey: KEY_ROLE_RX.test(role),
        }
      })

      // Assignments → { zone_key: [personId] }; fold in any assigned person the
      // roster didn't return (name-only records) so their chip still renders.
      const zoneMap = {}
      ;(assignRes.data || []).forEach(row => {
        const zoneKey = row.zone
        const personId = row.person_id || row.id
        if (!zoneKey || !personId) return
        if (!zoneMap[zoneKey]) zoneMap[zoneKey] = []
        if (!zoneMap[zoneKey].includes(personId)) zoneMap[zoneKey].push(personId)
        if (!empMap[personId]) {
          empMap[personId] = {
            id: personId,
            name: row.employee_name || '—',
            role: 'staff',
            isKey: false,
          }
        }
      })

      setZones(zoneRows)
      setEmployees(Object.values(empMap))
      setAssignments(zoneMap)
    } catch (err) {
      console.error('Zones load failed:', err)
      setError(err?.message || 'Could not load zone coverage.')
      setZones([])
      setEmployees([])
      setAssignments({})
    } finally {
      setLoading(false)
    }
  }, [focusNodeId, todayISO])

  useEffect(() => { loadAll() }, [loadAll])

  // ── Reassign: click chip to select, click a zone to move ───────────────────
  const handleSelectEmp = useCallback((empId, fromZone) => {
    setSelectedEmp(prev =>
      prev && prev.id === empId && prev.fromZone === fromZone ? null : { id: empId, fromZone }
    )
  }, [])

  const handleDrop = useCallback(async (toZoneId) => {
    if (!selectedEmp || !focusNodeId) return
    const { id: empId, fromZone } = selectedEmp
    setSelectedEmp(null)
    if (fromZone === toZoneId) return

    const emp = employees.find(e => e.id === empId)
    if (!emp) return

    // Optimistic move
    setAssignments(prev => {
      const next = { ...prev }
      next[fromZone] = (next[fromZone] || []).filter(id => id !== empId)
      if (!(next[toZoneId] || []).includes(empId)) {
        next[toZoneId] = [...(next[toZoneId] || []), empId]
      }
      return next
    })

    try {
      setSaving(true)
      // Leave the source zone, then join the target zone — both persisted.
      const rm = await sb.rpc('remove_zone_assignment', {
        p_node_id: focusNodeId, p_zone: fromZone, p_person_id: emp.id, p_date: todayISO,
      })
      if (rm.error) throw rm.error
      const add = await sb.rpc('set_zone_assignment', {
        p_node_id: focusNodeId,
        p_zone: toZoneId,
        p_employee_name: emp.name,
        p_date: todayISO,
        p_assigned_by: session?.person?.id || null,
        p_person_id: emp.id || null,
      })
      if (add.error) throw add.error
    } catch (err) {
      console.error('move assignment failed:', err)
    } finally {
      setSaving(false)
      loadAll()
    }
  }, [selectedEmp, employees, focusNodeId, todayISO, session, loadAll])

  // ── Assign modal ───────────────────────────────────────────────────────────
  const handleOpenReassign = useCallback((zoneId) => {
    setSelectedEmp(null)
    setAssignTarget(zoneId)
  }, [])

  const handleModalAssign = useCallback(async (zoneId, emp) => {
    setAssignTarget(null)
    if (!focusNodeId) return

    setAssignments(prev => {
      const next = { ...prev }
      if (!(next[zoneId] || []).includes(emp.id)) {
        next[zoneId] = [...(next[zoneId] || []), emp.id]
      }
      return next
    })

    try {
      setSaving(true)
      const { error } = await sb.rpc('set_zone_assignment', {
        p_node_id: focusNodeId,
        p_zone: zoneId,
        p_employee_name: emp.name,
        p_date: todayISO,
        p_assigned_by: session?.person?.id || null,
        p_person_id: emp.id || null,
      })
      if (error) throw error
    } catch (err) {
      console.error('set_zone_assignment failed:', err)
    } finally {
      setSaving(false)
      loadAll()
    }
  }, [focusNodeId, todayISO, session, loadAll])

  // ── Zone catalog: create / delete (no-code, real writes) ───────────────────
  const handleCreateZone = useCallback(async ({ zone_key, label, min_staff }) => {
    if (!focusNodeId) return
    try {
      setSaving(true)
      const { error } = await sb.rpc('upsert_location_zone', {
        p_node_id: focusNodeId,
        p_zone_key: zone_key,
        p_label: label,
        p_min_staff: min_staff,
        p_sort_order: zones.length,
      })
      if (error) throw error
      setShowAddZone(false)
    } catch (err) {
      console.error('upsert_location_zone failed:', err)
    } finally {
      setSaving(false)
      loadAll()
    }
  }, [focusNodeId, zones.length, loadAll])

  const handleDeleteZone = useCallback(async (zone) => {
    if (!focusNodeId) return
    if (!window.confirm(`Remove the "${zone.label}" zone from ${locationLabel}?`)) return
    try {
      setSaving(true)
      const { error } = await sb.rpc('delete_location_zone', {
        p_node_id: focusNodeId, p_zone_key: zone.id,
      })
      if (error) throw error
    } catch (err) {
      console.error('delete_location_zone failed:', err)
    } finally {
      setSaving(false)
      loadAll()
    }
  }, [focusNodeId, locationLabel, loadAll])

  // ── KPI Calculations (over the real zone catalog) ──────────────────────────
  const kpis = useMemo(() => {
    let covered = 0, understaffed = 0, empty = 0
    zones.forEach(zone => {
      const count = (assignments[zone.id] || []).length
      if (count === 0 && zone.min > 0) empty++
      else if (count < zone.min) understaffed++
      else covered++
    })
    const total = zones.length
    const pct = total > 0 ? Math.round((covered / total) * 100) : 0
    return { covered, understaffed, empty, total, pct }
  }, [assignments, zones])

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ padding: '20px 24px', fontFamily: 'var(--t-font, Inter, sans-serif)' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--t-text)', letterSpacing: '-0.01em' }}>
            Zone Coverage
          </div>
          <div style={{ fontSize: 12, color: 'var(--t-text-muted)', marginTop: 2 }}>
            {todayISO} · {locationLabel}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {saving && (
            <span style={{ fontSize: 10, color: 'var(--t-text-muted)', letterSpacing: '0.06em' }}>SAVING…</span>
          )}
          {(locations || []).length > 1 && (
            <select
              value={focusNodeId || ''}
              onChange={e => setFocusNodeId(e.target.value)}
              style={{
                background: 'var(--t-surface-2)', border: '1px solid var(--t-line)',
                color: 'var(--t-text)', fontSize: 11, padding: '4px 8px', cursor: 'pointer',
              }}
            >
              {(locations || []).map(l => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
          )}
          {canManage && focusNodeId && (
            <button
              onClick={() => setShowAddZone(true)}
              style={{
                background: 'transparent', border: '1px solid var(--t-line)',
                color: 'var(--t-text-muted)', fontSize: 10, padding: '4px 10px',
                cursor: 'pointer', letterSpacing: '0.06em',
              }}
            >
              + ZONE
            </button>
          )}
          <button
            onClick={loadAll}
            style={{
              background: 'transparent',
              border: '1px solid var(--t-line)',
              color: 'var(--t-text-muted)',
              fontSize: 10,
              padding: '4px 10px',
              cursor: 'pointer',
              letterSpacing: '0.06em',
            }}
          >
            REFRESH
          </button>
        </div>
      </div>

      {/* KPI Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
        <KTile
          label="Coverage"
          value={`${kpis.pct}%`}
          sub={`${kpis.covered} of ${kpis.total} zones`}
          color={kpis.total === 0 ? 'var(--t-text-muted)' : kpis.pct === 100 ? 'var(--t-success)' : kpis.pct >= 70 ? 'var(--t-warn)' : 'var(--t-danger)'}
          alert={kpis.total === 0 ? null : kpis.pct < 70 ? 'red' : kpis.pct < 100 ? 'amber' : null}
        />
        <KTile
          label="Covered"
          value={kpis.covered}
          sub="zones fully staffed"
          color="var(--t-success)"
        />
        <KTile
          label="Understaffed"
          value={kpis.understaffed}
          sub="below minimum"
          color={kpis.understaffed > 0 ? 'var(--t-warn)' : 'var(--t-text-muted)'}
          alert={kpis.understaffed > 0 ? 'amber' : null}
        />
        <KTile
          label="Empty"
          value={kpis.empty}
          sub="no coverage"
          color={kpis.empty > 0 ? 'var(--t-danger)' : 'var(--t-text-muted)'}
          alert={kpis.empty > 0 ? 'red' : null}
        />
      </div>

      {/* Instruction hint when an employee is selected */}
      {selectedEmp && (
        <div style={{
          marginBottom: 12,
          padding: '8px 14px',
          background: 'rgba(0,229,255,0.08)',
          border: '1px solid var(--t-accent)',
          fontSize: 11,
          color: 'var(--t-accent)',
          letterSpacing: '0.04em',
        }}>
          {employees.find(e => e.id === selectedEmp.id)?.name || selectedEmp.id} selected — click a zone card to reassign, or click the chip again to cancel.
        </div>
      )}

      {/* Zone Grid */}
      {loading ? (
        <div style={{ color: 'var(--t-text-muted)', fontSize: 13, padding: '40px 0', textAlign: 'center' }}>
          Loading zone assignments…
        </div>
      ) : error ? (
        <div style={{
          border: '1px solid var(--t-danger)', background: 'rgba(255,59,48,0.06)',
          padding: '24px', textAlign: 'center', color: 'var(--t-danger)', fontSize: 13,
        }}>
          {error}
          <div style={{ marginTop: 10 }}>
            <button onClick={loadAll} style={{
              background: 'transparent', border: '1px solid var(--t-danger)', color: 'var(--t-danger)',
              fontSize: 10, padding: '4px 12px', cursor: 'pointer', letterSpacing: '0.06em',
            }}>RETRY</button>
          </div>
        </div>
      ) : !focusNodeId ? (
        <div style={{ color: 'var(--t-text-muted)', fontSize: 13, padding: '40px 0', textAlign: 'center' }}>
          No location is in scope. Choose a location to manage zone coverage.
        </div>
      ) : zones.length === 0 ? (
        <div style={{
          border: '1px dashed var(--t-line)', background: 'var(--t-surface)',
          padding: '40px 24px', textAlign: 'center',
        }}>
          <div style={{ fontSize: 13, color: 'var(--t-text-muted)', marginBottom: 6 }}>
            No zones configured for {locationLabel} yet.
          </div>
          <div style={{ fontSize: 11, color: 'var(--t-text-faint)', marginBottom: 16 }}>
            Zones define the coverage map for this location — front entrance, registers, fitting room, and so on.
          </div>
          {canManage && (
            <button
              onClick={() => setShowAddZone(true)}
              style={{
                background: 'var(--t-accent)', border: '1px solid var(--t-accent)', color: '#04121a',
                fontSize: 11, fontWeight: 800, padding: '8px 16px', cursor: 'pointer', letterSpacing: '0.06em',
              }}
            >
              + ADD FIRST ZONE
            </button>
          )}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
          {zones.map(zone => (
            <ZoneCard
              key={zone.id}
              zone={zone}
              assignments={assignments}
              employees={employees}
              selected={selectedEmp ? selectedEmp.id : null}
              onSelect={handleSelectEmp}
              onDrop={handleDrop}
              onReassign={handleOpenReassign}
              onDeleteZone={handleDeleteZone}
              canManage={canManage}
            />
          ))}
        </div>
      )}

      {/* Assign Modal */}
      {assignTarget && (
        <AssignModal
          zone={zones.find(z => z.id === assignTarget)}
          employees={employees}
          assignments={assignments}
          onAssign={handleModalAssign}
          onClose={() => setAssignTarget(null)}
        />
      )}

      {/* Add Zone Modal */}
      {showAddZone && (
        <AddZoneModal
          onCreate={handleCreateZone}
          onClose={() => setShowAddZone(false)}
          saving={saving}
        />
      )}
    </div>
  )
}
