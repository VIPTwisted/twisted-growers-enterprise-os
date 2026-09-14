// OrgChart.jsx — Twisted Growers HR
// Aurora midnight theme · inline styles · CSS token vars · no Tailwind · no chart libs
import { useState, useCallback, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { sb } from '../lib/supabase'
import { useAuth } from '../lib/auth.jsx'
import { useScope } from '../lib/scope.jsx'
import { useFeatureFlag } from '../lib/featureFlags.js'
import { getLocationNames } from '../lib/locations.js'

/* ─────────────────────────────────────────────────────────────────────────────
   SEED HELPER
───────────────────────────────────────────────────────────────────────────── */
const seed = (a, b) => ((a * 31 + b) * 17 + a * b) % 100

/* ─────────────────────────────────────────────────────────────────────────────
   ORG DATA
───────────────────────────────────────────────────────────────────────────── */
// No typed-in org: the tree is built from get_roster rows (buildTreeFromLive); an empty scope is an empty tree.
const ORG_TREE = { id: 'root', name: 'Twisted Growers', role: 'Company', level: 'company', location: null, children: [] }
const ALL_EMPLOYEES = flattenTree(ORG_TREE)

/* ─────────────────────────────────────────────────────────────────────────────
   CONSTANTS
───────────────────────────────────────────────────────────────────────────── */
const LEVEL_COLORS = {
  owner:      'var(--t-accent)',
  coo:        'var(--t-warn)',
  manager:    'var(--t-danger)',
  keyholder:  'var(--t-success)',
  associate:  'var(--t-line)',
}
const LEVEL_BG = {
  owner:      'rgba(0,229,255,.15)',
  coo:        'rgba(255,179,71,.15)',
  manager:    'rgba(255,77,125,.15)',
  keyholder:  'rgba(29,233,182,.15)',
  associate:  'rgba(255,255,255,.06)',
}

const ini = n =>
  !n || n.startsWith('(')
    ? '?'
    : n.trim().split(/\s+/).map(x => x[0]).slice(0, 2).join('').toUpperCase()

/* ─────────────────────────────────────────────────────────────────────────────
   NODE CARD COMPONENT
───────────────────────────────────────────────────────────────────────────── */
function NodeCard({ node, navigate }) {
  const [hov, setHov] = useState(false)
  const color = LEVEL_COLORS[node.level] || 'var(--t-text-muted)'
  const bg    = LEVEL_BG[node.level]    || 'rgba(255,255,255,.04)'

  const handleView360 = (e) => {
    e.stopPropagation()
    navigate('/employee-360')
  }

  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        minWidth: 140,
        maxWidth: 180,
        background: 'var(--t-surface)',
        border: `1px solid ${hov ? color : 'var(--t-line)'}`,
        padding: '10px 12px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 6,
        cursor: node.vacant ? 'default' : 'pointer',
        opacity: node.vacant ? 0.55 : 1,
        transition: 'border-color .15s',
      }}
    >
      {/* Avatar */}
      <div style={{
        width: 36, height: 36, flexShrink: 0,
        background: bg, border: `2px solid ${color}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontWeight: 800, fontSize: 12, color,
      }}>
        {ini(node.name)}
      </div>

      {/* Name */}
      <div style={{
        fontWeight: 700, fontSize: 12, color: node.vacant ? 'var(--t-text-muted)' : 'var(--t-text)',
        textAlign: 'center', lineHeight: 1.3,
      }}>
        {node.name}
      </div>

      {/* Role chip */}
      <div style={{
        fontSize: 10, fontWeight: 700, padding: '2px 7px',
        background: bg, color,
        textAlign: 'center',
      }}>
        {node.role}
      </div>

      {/* Location chip */}
      {node.location && (
        <div style={{
          fontSize: 10, padding: '1px 6px',
          background: 'rgba(0,229,255,.08)', color: 'var(--t-accent)',
          textAlign: 'center',
        }}>
          {node.location}
        </div>
      )}

      {/* View 360 link */}
      {!node.vacant && (
        <button
          onClick={handleView360}
          style={{
            background: 'transparent', border: 'none',
            color: hov ? 'var(--t-accent)' : 'var(--t-text-faint)',
            fontSize: 10, cursor: 'pointer', padding: 0,
            fontFamily: 'inherit', fontWeight: 600,
            transition: 'color .15s',
          }}
        >
          View 360
        </button>
      )}
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────────────────
   ORG TREE RENDERER (recursive)
───────────────────────────────────────────────────────────────────────────── */
function OrgLevel({ nodes, navigate }) {
  if (!nodes || nodes.length === 0) return null

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'center',
      gap: 0,
      position: 'relative',
    }}>
      {nodes.map((node, idx) => (
        <div
          key={node.id}
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            position: 'relative',
            padding: '0 12px',
          }}
        >
          {/* Vertical connector going up */}
          <div style={{
            width: 1,
            height: 20,
            background: 'var(--t-line)',
            marginBottom: 0,
          }} />

          {/* Node card */}
          <NodeCard node={node} navigate={navigate} />

          {/* Children connector + children */}
          {node.children && node.children.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              {/* Vertical line down from node */}
              <div style={{ width: 1, height: 20, background: 'var(--t-line)' }} />

              {/* Horizontal bar spanning children */}
              <div style={{
                position: 'relative',
                display: 'flex',
                flexDirection: 'row',
                alignItems: 'flex-start',
                justifyContent: 'center',
              }}>
                {/* Horizontal line */}
                {node.children.length > 1 && (
                  <div style={{
                    position: 'absolute',
                    top: 0,
                    left: `calc(50% / ${node.children.length})`,
                    right: `calc(50% / ${node.children.length})`,
                    height: 1,
                    background: 'var(--t-line)',
                  }} />
                )}
                <OrgLevel nodes={node.children} navigate={navigate} />
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

function TreeView({ navigate, tree = ORG_TREE }) {
  return (
    <div style={{ overflowX: 'auto', paddingBottom: 24 }}>
      <div style={{
        minWidth: 1100,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        paddingTop: 16,
      }}>
        {/* Root node (Owner) */}
        <NodeCard node={tree} navigate={navigate} />

        {/* Root children */}
        {tree.children.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div style={{ width: 1, height: 20, background: 'var(--t-line)' }} />
            <OrgLevel nodes={tree.children} navigate={navigate} />
          </div>
        )}
      </div>
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────────────────
   TABLE VIEW
───────────────────────────────────────────────────────────────────────────── */
function TableView({ employees, navigate, searchQ, roleFilter, locFilter }) {
  const filtered = employees.filter(e => {
    const q = searchQ.toLowerCase()
    const matchSearch = !searchQ || e.name.toLowerCase().includes(q) || e.role.toLowerCase().includes(q)
    const matchRole = !roleFilter || roleFilter === 'All' || e.role === roleFilter
    const matchLoc  = !locFilter  || locFilter  === 'All' || e.location === locFilter
    return matchSearch && matchRole && matchLoc
  })

  const th = {
    padding: '8px 12px', textAlign: 'left', fontWeight: 600, fontSize: 10,
    color: 'var(--t-text-muted)', textTransform: 'uppercase', letterSpacing: 0.5,
    borderBottom: '1px solid var(--t-line)', background: 'rgba(0,229,255,.02)',
    whiteSpace: 'nowrap',
  }
  const td = { padding: '9px 12px', borderBottom: '1px solid var(--t-line)', verticalAlign: 'middle' }

  return (
    <div style={{ overflowX: 'auto' }}>
      <div style={{ fontSize: 11, color: 'var(--t-text-muted)', marginBottom: 10 }}>
        Showing {filtered.length} of {employees.length} employees
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr>
            {['Name', 'Role', 'Location', 'Manager', 'Reports To', 'Direct Reports', 'Status'].map(h => (
              <th key={h} style={th}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filtered.length === 0 && (
            <tr>
              <td colSpan={7} style={{ padding: '36px 12px', textAlign: 'center', color: 'var(--t-text-muted)' }}>
                No employees match filters.
              </td>
            </tr>
          )}
          {filtered.map(emp => {
            const color = LEVEL_COLORS[emp.level] || 'var(--t-text-muted)'
            const bg    = LEVEL_BG[emp.level]    || 'transparent'
            return (
              <tr
                key={emp.id}
                style={{ cursor: emp.status === 'vacant' ? 'default' : 'pointer' }}
                onClick={() => emp.status !== 'vacant' && navigate('/employee-360')}
                onMouseEnter={e => { if (emp.status !== 'vacant') e.currentTarget.style.background = 'rgba(255,255,255,.02)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
              >
                <td style={td}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{
                      width: 28, height: 28, flexShrink: 0,
                      background: bg, border: `1px solid ${color}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontWeight: 800, fontSize: 9, color,
                    }}>
                      {ini(emp.name)}
                    </div>
                    <span style={{
                      fontWeight: 600,
                      color: emp.status === 'vacant' ? 'var(--t-text-muted)' : 'var(--t-text)',
                      fontStyle: emp.status === 'vacant' ? 'italic' : 'normal',
                    }}>
                      {emp.name}
                    </span>
                  </div>
                </td>
                <td style={{ ...td, color: 'var(--t-text-muted)' }}>{emp.role}</td>
                <td style={{ ...td, color: 'var(--t-text-muted)' }}>{emp.location}</td>
                <td style={{ ...td, color: 'var(--t-text-muted)' }}>{emp.manager || '—'}</td>
                <td style={{ ...td, color: 'var(--t-text-muted)' }}>{emp.manager || '—'}</td>
                <td style={{ ...td, textAlign: 'center', color: 'var(--t-text)' }}>{emp.directReports}</td>
                <td style={td}>
                  <span style={{
                    fontSize: 10, fontWeight: 700, padding: '2px 7px',
                    background: emp.status === 'vacant' ? 'rgba(255,77,125,.12)' : 'rgba(29,233,182,.12)',
                    color: emp.status === 'vacant' ? 'var(--t-danger)' : 'var(--t-success)',
                  }}>
                    {emp.status === 'vacant' ? 'VACANT' : 'ACTIVE'}
                  </span>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────────────────
   LOCATION VIEW
───────────────────────────────────────────────────────────────────────────── */
const LOCATIONS_DATA = []

function LocationView({ navigate, locations = LOCATIONS_DATA }) {
  const [expanded, setExpanded] = useState({})

  const toggle = (name) => setExpanded(prev => ({ ...prev, [name]: !prev[name] }))

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
      {locations.map(loc => {
        const headcount = 1 + loc.keyHolders.length + loc.associates.length
        const realHeadcount = headcount - loc.openPositions
        const isExpanded = expanded[loc.name]

        return (
          <div
            key={loc.name}
            style={{
              background: 'var(--t-surface)',
              border: '1px solid var(--t-line)',
              overflow: 'hidden',
            }}
          >
            {/* Location header */}
            <div style={{
              padding: '12px 16px',
              borderBottom: '1px solid var(--t-line)',
              background: 'var(--t-surface-2)',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--t-accent)', letterSpacing: 0.5 }}>
                  {loc.name.toUpperCase()}
                </div>
                <div style={{ fontSize: 11, color: 'var(--t-text-muted)', marginTop: 2 }}>
                  {realHeadcount} active · {loc.openPositions > 0 ? `${loc.openPositions} open` : 'fully staffed'}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <span style={{
                  fontSize: 11, fontWeight: 700, padding: '3px 8px',
                  background: 'rgba(0,229,255,.1)', color: 'var(--t-accent)',
                }}>
                  {realHeadcount} staff
                </span>
                {loc.openPositions > 0 && (
                  <span style={{
                    fontSize: 11, fontWeight: 700, padding: '3px 8px',
                    background: 'rgba(255,77,125,.1)', color: 'var(--t-danger)',
                  }}>
                    {loc.openPositions} open
                  </span>
                )}
              </div>
            </div>

            {/* Body */}
            <div style={{ padding: '12px 16px' }}>
              {/* Manager */}
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--t-text-faint)', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6 }}>Store Manager</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{
                    width: 32, height: 32, background: LEVEL_BG.manager,
                    border: `1px solid ${LEVEL_COLORS.manager}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontWeight: 800, fontSize: 10, color: LEVEL_COLORS.manager, flexShrink: 0,
                  }}>
                    {ini(loc.manager)}
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--t-text)' }}>{loc.manager}</div>
                    <div style={{ fontSize: 11, color: 'var(--t-text-muted)' }}>{loc.managerEmail}</div>
                  </div>
                </div>
              </div>

              {/* Key Holders */}
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--t-text-faint)', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6 }}>Key Holders</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {loc.keyHolders.map((kh, i) => (
                    <div key={i} style={{
                      display: 'flex', alignItems: 'center', gap: 8, fontSize: 12,
                      color: kh.startsWith('(') ? 'var(--t-text-muted)' : 'var(--t-text)',
                      fontStyle: kh.startsWith('(') ? 'italic' : 'normal',
                    }}>
                      <div style={{
                        width: 6, height: 6, flexShrink: 0,
                        background: kh.startsWith('(') ? 'var(--t-danger)' : LEVEL_COLORS.keyholder,
                      }} />
                      {kh}
                    </div>
                  ))}
                </div>
              </div>

              {/* Associates */}
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--t-text-faint)', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6 }}>Associates</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {loc.associates.map((a, i) => (
                    <div key={i} style={{
                      display: 'flex', alignItems: 'center', gap: 8, fontSize: 12,
                      color: a.startsWith('(') ? 'var(--t-text-muted)' : 'var(--t-text)',
                      fontStyle: a.startsWith('(') ? 'italic' : 'normal',
                    }}>
                      <div style={{
                        width: 5, height: 5, flexShrink: 0,
                        background: a.startsWith('(') ? 'var(--t-danger)' : LEVEL_COLORS.associate,
                      }} />
                      {a}
                    </div>
                  ))}
                </div>
              </div>

              {/* Expand / collapse store tree */}
              <button
                onClick={() => toggle(loc.name)}
                style={{
                  width: '100%', background: 'transparent',
                  border: '1px solid var(--t-line)', color: 'var(--t-text-muted)',
                  padding: '7px 0', fontSize: 11, fontWeight: 600, cursor: 'pointer',
                  fontFamily: 'inherit',
                  transition: 'border-color .15s, color .15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--t-accent)'; e.currentTarget.style.color = 'var(--t-accent)' }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--t-line)'; e.currentTarget.style.color = 'var(--t-text-muted)' }}
              >
                {isExpanded ? 'Hide Team Tree ▲' : 'View Store Team ▼'}
              </button>

              {/* Inline mini tree */}
              {isExpanded && (
                <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--t-line)' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                    {/* Manager row */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                      <div style={{ width: 3, background: LEVEL_COLORS.manager, alignSelf: 'stretch' }} />
                      <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--t-text)' }}>{loc.manager}</span>
                      <span style={{ fontSize: 10, padding: '1px 6px', background: LEVEL_BG.manager, color: LEVEL_COLORS.manager }}>Manager</span>
                    </div>
                    {[...loc.keyHolders.map(n => ({ name: n, role: 'Key Holder', level: 'keyholder' })),
                      ...loc.associates.map(n => ({ name: n, role: 'Associate', level: 'associate' }))].map((e, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 12, marginBottom: 4 }}>
                        <div style={{ width: 2, background: LEVEL_COLORS[e.level], alignSelf: 'stretch', opacity: 0.5 }} />
                        <span style={{
                          fontSize: 12, color: e.name.startsWith('(') ? 'var(--t-text-muted)' : 'var(--t-text)',
                          fontStyle: e.name.startsWith('(') ? 'italic' : 'normal',
                        }}>
                          {e.name}
                        </span>
                        <span style={{ fontSize: 10, color: 'var(--t-text-faint)' }}>{e.role}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────────────────
   EXPORT FUNCTION
───────────────────────────────────────────────────────────────────────────── */
function exportOrgTxt(filtered, tree = ORG_TREE, employees = ALL_EMPLOYEES) {
  const lines = [
    'TWISTED GROWERS — ORGANIZATION CHART',
    'Twisted Growers ',
    '='.repeat(50),
    '',
  ]

  function renderNode(node, prefix = '', isLast = true) {
    const connector = isLast ? '└── ' : '├── '
    const vacant = node.vacant ? ' [VACANT]' : ''
    const loc = node.location ? ` (${node.location})` : ''
    lines.push(`${prefix}${connector}${node.name} — ${node.role}${loc}${vacant}`)
    const childPrefix = prefix + (isLast ? '    ' : '│   ')
    node.children.forEach((child, i) => {
      renderNode(child, childPrefix, i === node.children.length - 1)
    })
  }

  lines.push(`${tree.name} — ${tree.role}`)
  tree.children.forEach((child, i) => {
    renderNode(child, '', i === tree.children.length - 1)
  })

  lines.push('')
  lines.push('='.repeat(50))
  lines.push(`Total employees: ${employees.filter(e => e.status !== 'vacant').length}`)
  lines.push(`Open positions: ${employees.filter(e => e.status === 'vacant').length}`)
  lines.push(`Generated: ${new Date().toLocaleString()}`)

  const blob = new Blob([lines.join('\n')], { type: 'text/plain' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url
  a.download = `vip-org-chart-${new Date().toISOString().slice(0, 10)}.txt`
  a.click()
  URL.revokeObjectURL(url)
}

/* ─────────────────────────────────────────────────────────────────────────────
   LIVE DATA BUILDERS — transform get_roster + get_nodes_for_person into the
   EXACT shapes the render layer already consumes (tree / flat list / locations).
   All hardcoded mock data above is preserved as a fallback.
───────────────────────────────────────────────────────────────────────────── */
// Map a live role_name string → the internal level buckets used for colors/tree.
function dbRoleToLevel(role = '') {
  const r = role.toLowerCase()
  if (r.includes('owner')) return 'owner'
  if (r.includes('coo') || r.includes('chief')) return 'coo'
  if (r.includes('manager')) return 'manager'
  if (r.includes('keyholder') || r.includes('key holder') || r.includes('lead')) return 'keyholder'
  return 'associate'
}

// Rank for ordering within a location (managers first, then keyholders, then rest).
const LEVEL_RANK = { owner: 0, coo: 1, manager: 2, keyholder: 3, associate: 4 }

// Build the same nested ORG_TREE shape from live roster rows + location nodes.
// Structure: Owner (session person) → COO placeholder omitted → per-location
// Manager → that location's keyholders + associates. Locations with no live
// manager still surface as a manager-less bucket under the owner.
function buildTreeFromLive(roster, locationNodes, ownerPerson) {
  // Group roster by node_name (location label as returned by get_roster).
  const byLoc = {}
  roster.forEach(p => {
    const key = p.node_name || '—'
    ;(byLoc[key] = byLoc[key] || []).push(p)
  })

  const locChildren = Object.keys(byLoc).map(locName => {
    const people = byLoc[locName]
      .map(p => ({ ...p, _level: dbRoleToLevel(p.role_name) }))
      .sort((a, b) => (LEVEL_RANK[a._level] - LEVEL_RANK[b._level]))

    const mgr = people.find(p => p._level === 'manager')
    const reports = people.filter(p => p !== mgr)

    const reportNodes = reports.map(p => ({
      id: p.id,
      name: p.full_name,
      role: p.role_name,
      level: p._level === 'manager' ? 'keyholder' : p._level, // sub-managers demoted visually under the store mgr
      location: locName,
      children: [],
    }))

    if (mgr) {
      return {
        id: mgr.id,
        name: mgr.full_name,
        role: mgr.role_name,
        level: 'manager',
        location: locName,
        children: reportNodes,
      }
    }
    // No manager on file → synthetic location bucket holding the staff.
    return {
      id: 'loc-' + locName,
      name: locName,
      role: 'Location',
      level: 'manager',
      location: locName,
      children: reportNodes,
    }
  })

  return {
    id: ownerPerson?.id || 'owner',
    name: ownerPerson?.full_name || 'Owner',
    role: ownerPerson?.role_name || 'Owner',
    level: 'owner',
    children: locChildren,
  }
}

// Build the flat employee list (table/search/export) from live roster rows.
function buildFlatFromLive(roster) {
  return roster.map(p => {
    const level = dbRoleToLevel(p.role_name)
    return {
      id: p.id,
      name: p.full_name,
      role: p.role_name,
      level,
      location: p.node_name || '—',
      manager: null,
      directReports: 0,
      status: p.is_active === false ? 'vacant' : 'active',
    }
  })
}

// Build the LocationView cards from live roster rows.
function buildLocationsFromLive(roster) {
  const byLoc = {}
  roster.forEach(p => {
    const key = p.node_name || '—'
    ;(byLoc[key] = byLoc[key] || []).push(p)
  })
  return Object.keys(byLoc).map(locName => {
    const people = byLoc[locName]
    const mgr = people.find(p => dbRoleToLevel(p.role_name) === 'manager')
    const keyHolders = people
      .filter(p => dbRoleToLevel(p.role_name) === 'keyholder')
      .map(p => p.full_name)
    const associates = people
      .filter(p => p !== mgr && dbRoleToLevel(p.role_name) !== 'keyholder')
      .map(p => p.full_name)
    return {
      name: locName,
      manager: mgr ? mgr.full_name : '(Vacant)',
      managerEmail: mgr ? (mgr.login_id ? mgr.login_id + '@vip.com' : '—') : '—',
      keyHolders: keyHolders.length ? keyHolders : ['(None)'],
      associates: associates.length ? associates : ['(None)'],
      openPositions: 0,
    }
  })
}

/* ─────────────────────────────────────────────────────────────────────────────
   MAIN EXPORT
───────────────────────────────────────────────────────────────────────────── */
const UNIQUE_ROLES = ['All', ...new Set(ALL_EMPLOYEES.map(e => e.role))]
const UNIQUE_LOCS  = ['All', ...getLocationNames()]

export default function OrgChart() {
  const enabled = useFeatureFlag('org_chart')
  const { session } = useAuth()
  const person = session?.person
  const { locationIds } = useScope() || {}
  const navigate = useNavigate()

  const [view, setView]       = useState('tree')   // 'tree' | 'table' | 'location'
  const [searchQ, setSearchQ] = useState('')
  const [roleFilter, setRoleFilter] = useState('All')
  const [locFilter, setLocFilter]   = useState('All')

  // Live org data (null until a non-empty, error-free RPC result arrives).
  // On error/empty we keep null and fall back to the mock constants below.
  const [liveTree, setLiveTree]           = useState(null)
  const [liveEmployees, setLiveEmployees] = useState(null)
  const [liveLocations, setLiveLocations] = useState(null)

  useEffect(() => {
    if (!locationIds || locationIds.length === 0) return
    let cancelled = false
    ;(async () => {
      try {
        const { data, error } = await sb.rpc('get_roster', {
          p_node_ids: locationIds,
          p_actor: person?.id ?? null,
        })
        if (cancelled) return
        if (error) throw error
        if (Array.isArray(data) && data.length > 0) {
          setLiveTree(buildTreeFromLive(data, [], person))
          setLiveEmployees(buildFlatFromLive(data))
          setLiveLocations(buildLocationsFromLive(data))
        }
        // empty/no rows → leave state null, mock fallback stays in place
      } catch {
        // error → keep mock fallback; never blank or crash
      }
    })()
    return () => { cancelled = true }
  }, [locationIds, person])

  // Resolve the active dataset: live when present, otherwise mock.
  const treeData      = liveTree      || ORG_TREE
  const employeesData = liveEmployees || ALL_EMPLOYEES
  const locationsData = liveLocations || LOCATIONS_DATA

  if (!enabled) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 400, gap: 16 }}>
        <div style={{ fontSize: 40, opacity: 0.4 }}>🚫</div>
        <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--t-text)' }}>Feature Disabled</div>
        <div style={{ fontSize: 13, color: 'var(--t-text-muted)' }}>Enable "Org Chart" in Feature Toggles to access this page.</div>
      </div>
    )
  }

  const filteredEmployees = employeesData.filter(e => {
    const q = searchQ.toLowerCase()
    const matchSearch = !searchQ || e.name.toLowerCase().includes(q) || e.role.toLowerCase().includes(q)
    const matchRole = roleFilter === 'All' || e.role === roleFilter
    const matchLoc  = locFilter  === 'All' || e.location === locFilter
    return matchSearch && matchRole && matchLoc
  })

  const selInput = {
    background: 'var(--t-surface-2)', border: '1px solid var(--t-line)',
    color: 'var(--t-text)', padding: '7px 10px', fontSize: 12, fontFamily: 'inherit',
  }

  const activeCount  = employeesData.filter(e => e.status !== 'vacant').length
  const vacantCount  = employeesData.filter(e => e.status === 'vacant').length
  const managerCount = employeesData.filter(e => ['manager'].includes(e.level)).length
  const locationCount = new Set(employeesData.filter(e => e.location && e.location !== '—').map(e => e.location)).size || 4

  return (
    <div style={{ padding: 24, maxWidth: 1600 }}>
      {/* Page header */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--t-text)', letterSpacing: '-.02em' }}>
          ORGANIZATION CHART
        </div>
        <div style={{ fontSize: 12, color: 'var(--t-text-muted)', marginTop: 3 }}>
          Twisted Growers
        </div>
      </div>

      {/* KPI strip */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 20 }}>
        {[
          { label: 'Total Headcount', value: activeCount, color: 'var(--t-accent)' },
          { label: 'Open Positions',  value: vacantCount, color: vacantCount > 0 ? 'var(--t-danger)' : 'var(--t-success)' },
          { label: 'Managers',        value: managerCount, color: 'var(--t-warn)' },
          { label: 'Locations',       value: locationCount, color: 'var(--t-success)' },
        ].map(k => (
          <div key={k.label} style={{
            background: 'var(--t-surface)', border: '1px solid var(--t-line)',
            padding: '12px 18px', flex: 1, minWidth: 120,
          }}>
            <div style={{ fontSize: 24, fontWeight: 800, color: k.color, fontFamily: 'var(--font-mono)', lineHeight: 1 }}>{k.value}</div>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--t-text-muted)', marginTop: 5, textTransform: 'uppercase', letterSpacing: 0.5 }}>{k.label}</div>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 20 }}>
        {/* Search */}
        <input
          type="text"
          placeholder="Search by name…"
          value={searchQ}
          onChange={e => setSearchQ(e.target.value)}
          style={{ ...selInput, minWidth: 200 }}
        />

        {/* Role filter */}
        <select value={roleFilter} onChange={e => setRoleFilter(e.target.value)} style={selInput}>
          {UNIQUE_ROLES.map(r => <option key={r} value={r}>{r === 'All' ? 'All Roles' : r}</option>)}
        </select>

        {/* Location filter */}
        <select value={locFilter} onChange={e => setLocFilter(e.target.value)} style={selInput}>
          {UNIQUE_LOCS.map(l => <option key={l} value={l}>{l === 'All' ? 'All Locations' : l}</option>)}
        </select>

        {/* Export */}
        <button
          onClick={() => exportOrgTxt(filteredEmployees, treeData, employeesData)}
          style={{
            background: 'transparent', border: '1px solid var(--t-line)',
            color: 'var(--t-text-muted)', padding: '7px 14px', fontSize: 12, fontWeight: 600,
            cursor: 'pointer', fontFamily: 'inherit',
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--t-accent)'; e.currentTarget.style.color = 'var(--t-accent)' }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--t-line)'; e.currentTarget.style.color = 'var(--t-text-muted)' }}
        >
          Export Org Chart
        </button>

        {/* View toggle */}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 0, border: '1px solid var(--t-line)' }}>
          {[
            { key: 'tree',     label: '⊞ Visual' },
            { key: 'table',    label: '≡ Table' },
            { key: 'location', label: '⊙ Locations' },
          ].map((v, i) => (
            <button
              key={v.key}
              onClick={() => setView(v.key)}
              style={{
                background: view === v.key ? 'rgba(0,229,255,.1)' : 'transparent',
                border: 'none',
                borderLeft: i > 0 ? '1px solid var(--t-line)' : 'none',
                color: view === v.key ? 'var(--t-accent)' : 'var(--t-text-muted)',
                padding: '7px 14px', fontSize: 11, fontWeight: 700, cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              {v.label}
            </button>
          ))}
        </div>
      </div>

      {/* Level legend */}
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 20, padding: '10px 14px', background: 'var(--t-surface-2)', border: '1px solid var(--t-line)' }}>
        {[
          { level: 'owner',     label: 'Owner' },
          { level: 'coo',       label: 'COO' },
          { level: 'manager',   label: 'Manager' },
          { level: 'keyholder', label: 'Key Holder' },
          { level: 'associate', label: 'Associate' },
        ].map(({ level, label }) => (
          <div key={level} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
            <div style={{ width: 10, height: 10, background: LEVEL_COLORS[level] }} />
            <span style={{ color: 'var(--t-text-muted)', fontWeight: 600 }}>{label}</span>
          </div>
        ))}
      </div>

      {/* Main content */}
      <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', padding: 20 }}>
        {view === 'tree' && <TreeView navigate={navigate} tree={treeData} />}
        {view === 'table' && (
          <TableView
            employees={employeesData}
            navigate={navigate}
            searchQ={searchQ}
            roleFilter={roleFilter}
            locFilter={locFilter}
          />
        )}
        {view === 'location' && <LocationView navigate={navigate} locations={locationsData} />}
      </div>
    </div>
  )
}
