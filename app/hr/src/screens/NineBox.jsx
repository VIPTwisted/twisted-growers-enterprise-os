// NineBox.jsx — 9-Box Talent Grid & Succession Planning (Tier 4).
// Enterprise talent-review tool: plots every employee on the classic
// Performance × Potential 9-box and derives a succession bench for key roles.
//
// Data is 100% live: roster + placements come from get_nine_box (real people
// via assignments joined to their manager-set rating in nine_box_placements).
// There are NO invented positions — a person the team hasn't rated yet sits in
// an honest "Unrated" pool until a manager places them. Every move writes to
// set_nine_box_placement / reset_nine_box_placement and re-reads from the DB, so
// placements survive refresh and follow the employee across devices.
import { useState, useEffect, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { sb } from '../lib/supabase'
import { useAuth } from '../lib/auth.jsx'
import { useScope } from '../lib/scope.jsx'

function dbRoleToLevel(role = '') {
  const r = role.toLowerCase()
  if (r.includes('owner')) return 'owner'
  if (r.includes('coo') || r.includes('ceo') || r.includes('chief') || r.includes('president')) return 'coo'
  if (r.includes('manager') || r.includes('director')) return 'manager'
  if (r.includes('keyholder') || r.includes('key holder') || r.includes('lead') || r.includes('supervisor')) return 'keyholder'
  return 'associate'
}
const LEVEL_LABEL = { owner: 'Owner', coo: 'Executive', manager: 'Manager', keyholder: 'Key Holder', associate: 'Associate' }

// Classic 9-box nomenclature keyed by `${perf}-${pot}`. 1 = low, 3 = high.
const BOX_META = {
  '1-3': { name: 'Rough Diamond', tone: 'warn', note: 'High potential, not yet performing — coach & stretch.' },
  '2-3': { name: 'High Potential', tone: 'accent', note: 'Growth talent — invest in development.' },
  '3-3': { name: 'Star', tone: 'success', note: 'Future leader — retain & fast-track.' },
  '1-2': { name: 'Dilemma', tone: 'warn', note: 'Inconsistent — diagnose the blocker.' },
  '2-2': { name: 'Core Player', tone: 'accent', note: 'Backbone of the team — keep engaged.' },
  '3-2': { name: 'High Performer', tone: 'success', note: 'Strong contributor — grow scope.' },
  '1-1': { name: 'Underperformer', tone: 'danger', note: 'At risk — performance plan.' },
  '2-1': { name: 'Solid Performer', tone: 'accent', note: 'Reliable in role — recognize.' },
  '3-1': { name: 'Trusted Pro', tone: 'success', note: 'Expert & dependable — protect knowledge.' },
}
const TONE = { success: 'var(--t-success)', accent: 'var(--t-accent)', warn: 'var(--t-warn)', danger: 'var(--t-danger)' }

// Readiness for succession derived from box position.
function readiness(perf, pot) {
  if (perf >= 3 && pot >= 2) return { label: 'Ready Now', tone: 'success' }
  if (pot >= 3 || (perf >= 2 && pot >= 2)) return { label: 'Ready 1–2 yrs', tone: 'accent' }
  if (perf >= 2) return { label: 'Development needed', tone: 'warn' }
  return { label: 'Not a candidate', tone: 'danger' }
}

const st = {
  wrap: { padding: '24px 28px', color: 'var(--t-text)', minHeight: '100vh', background: 'var(--t-bg)' },
  h1: { fontSize: 20, fontWeight: 800, letterSpacing: '.05em', margin: 0, textTransform: 'uppercase' },
  sub: { fontSize: 11, color: 'var(--t-text-muted)', marginTop: 3 },
  tabs: { display: 'flex', gap: 4, margin: '16px 0 18px' },
  tab: (a) => ({ padding: '8px 16px', fontSize: 12, fontWeight: 700, cursor: 'pointer', border: '1px solid var(--t-line)', borderBottom: a ? '2px solid var(--t-accent)' : '1px solid var(--t-line)', background: a ? 'var(--t-surface)' : 'transparent', color: a ? 'var(--t-text)' : 'var(--t-text-muted)' }),
  bar: { display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 16 },
  sel: { padding: '7px 10px', fontSize: 12, background: 'var(--t-surface)', color: 'var(--t-text)', border: '1px solid var(--t-line)', cursor: 'pointer' },
  btn: { padding: '7px 12px', fontSize: 12, fontWeight: 700, background: 'var(--t-surface)', color: 'var(--t-text)', border: '1px solid var(--t-line)', cursor: 'pointer' },
  badge: (tone) => ({ fontSize: 9, fontWeight: 800, letterSpacing: '.05em', padding: '2px 7px', color: '#031', background: TONE[tone] || 'var(--t-accent)', textTransform: 'uppercase', whiteSpace: 'nowrap' }),
  chip: { fontSize: 11, fontWeight: 600, padding: '3px 7px', border: '1px solid var(--t-line)', background: 'var(--t-bg)', cursor: 'grab', display: 'inline-flex', alignItems: 'center', gap: 5, marginBottom: 0 },
  sectionLabel: { fontSize: 11, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--t-text-muted)', margin: '4px 0 12px' },
  card: { background: 'var(--t-surface)', border: '1px solid var(--t-line)', borderTop: '3px solid var(--t-accent)', padding: '14px 16px', marginBottom: 12 },
  pool: { border: '1px dashed var(--t-line)', background: 'var(--t-surface)', padding: '10px 12px', marginBottom: 14 },
}

function Chip({ emp, selected, onClick, draggable, onDragStart }) {
  const lvl = LEVEL_LABEL[emp.level] || emp.role_name
  return (
    <div
      style={{ ...st.chip, cursor: draggable ? 'grab' : 'pointer', borderColor: selected ? 'var(--t-accent)' : 'var(--t-line)', background: selected ? 'var(--t-surface)' : 'var(--t-bg)', boxShadow: selected ? '0 0 0 2px var(--t-accent)' : 'none' }}
      draggable={draggable}
      onDragStart={onDragStart}
      onClick={onClick}
      title={`${emp.full_name} · ${lvl} · ${emp.node_name}`}
    >
      <span style={{ fontSize: 12 }}>{emp.full_name}</span>
      <span style={{ fontSize: 9, color: 'var(--t-text-muted)' }}>{lvl}</span>
    </div>
  )
}

export default function NineBox() {
  const { session } = useAuth()
  const person = session?.person
  const { locationIds, locations } = useScope() || {}
  const navigate = useNavigate()

  const [tab, setTab] = useState('grid')          // 'grid' | 'succession'
  const [roster, setRoster] = useState([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState(null)
  const [busy, setBusy] = useState(false)
  const [locFilter, setLocFilter] = useState('All')
  const [selected, setSelected] = useState(null)   // person_id being placed (click-to-place)
  const [succRole, setSuccRole] = useState('')
  const [toast, setToast] = useState(null)

  const flash = useCallback((msg) => { setToast(msg); setTimeout(() => setToast(null), 2200) }, [])

  // ── live load (roster + placements) ─────────────────────────────────────────
  const load = useCallback(async () => {
    if (!locationIds || locationIds.length === 0) { setRoster([]); setLoading(false); return }
    setLoading(true); setErr(null)
    try {
      const { data, error } = await sb.rpc('get_nine_box', { p_node_ids: locationIds })
      if (error) throw error
      const rows = (Array.isArray(data) ? data : [])
        .map(p => ({
          id: p.person_id,
          full_name: p.full_name,
          role_name: p.role,
          node_name: p.location || '—',
          node_id: p.node_id,
          level: dbRoleToLevel(p.role),
          perf: p.performance ?? null,
          pot: p.potential ?? null,
          rated: p.performance != null && p.potential != null,
          note: p.note || '',
          rated_by: p.rated_by || null,
          rated_at: p.rated_at || null,
        }))
      setRoster(rows)
    } catch (e) {
      setErr(e?.message || 'Failed to load talent grid')
      setRoster([])
    } finally {
      setLoading(false)
    }
  }, [locationIds])

  useEffect(() => { load() }, [load])

  // Esc clears the click-to-place selection
  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') setSelected(null) }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [])

  // real location names in scope (for the filter + succession key-role list)
  const locNames = useMemo(() => {
    const fromScope = (locations || []).map(l => l.name)
    const fromRoster = roster.map(r => r.node_name).filter(n => n && n !== '—')
    return [...new Set([...fromScope, ...fromRoster])].sort()
  }, [locations, roster])

  const filtered = useMemo(
    () => locFilter === 'All' ? roster : roster.filter(e => e.node_name === locFilter),
    [roster, locFilter]
  )

  // ── writes (real, then re-read) ─────────────────────────────────────────────
  const setCell = useCallback(async (id, perf, pot) => {
    setBusy(true)
    try {
      const { data, error } = await sb.rpc('set_nine_box_placement', {
        p_person_id: id, p_performance: perf, p_potential: pot, p_rated_by: person?.id ?? null,
      })
      if (error) throw error
      if (data && data.ok === false) throw new Error(data.error || 'Could not save placement')
      const who = roster.find(r => r.id === id)
      const meta = BOX_META[`${perf}-${pot}`]
      flash(`${who?.full_name || 'Employee'} → ${meta?.name || 'placed'}`)
      await load()
    } catch (e) {
      flash(`Not saved — ${e?.message || 'placement failed'}`)
    } finally {
      setBusy(false)
    }
  }, [roster, person, load, flash])

  const resetPlacement = useCallback(async (id) => {
    setBusy(true)
    try {
      const { error } = await sb.rpc('reset_nine_box_placement', { p_person_id: id })
      if (error) throw error
      flash('Reset to unrated')
      await load()
    } catch (e) {
      flash(`Not reset — ${e?.message || 'failed'}`)
    } finally {
      setBusy(false)
    }
  }, [load, flash])

  // cell click handler (click-to-place after selecting a chip)
  const onCellClick = (perf, pot) => { if (selected) { setCell(selected, perf, pot); setSelected(null) } }

  // group RATED people by cell; unrated go to the pool
  const byCell = useMemo(() => {
    const m = {}
    filtered.forEach(e => { if (e.rated) { const k = `${e.perf}-${e.pot}`; (m[k] = m[k] || []).push(e) } })
    return m
  }, [filtered])
  const unrated = useMemo(() => filtered.filter(e => !e.rated), [filtered])

  function exportCsv() {
    const rows = [['Name', 'Role', 'Location', 'Performance', 'Potential', 'Box', 'Rated by', 'Rated on']]
    filtered.forEach(e => rows.push([
      e.full_name, e.role_name, e.node_name,
      e.rated ? e.perf : '', e.rated ? e.pot : '',
      e.rated ? (BOX_META[`${e.perf}-${e.pot}`]?.name || '') : 'Unrated',
      e.rated_by || '', e.rated_at || '',
    ]))
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    a.download = `vip-9box-${locFilter.replace(/\W+/g, '-').toLowerCase()}.csv`
    a.click()
  }

  // ── succession bench for the selected key role (real ratings only) ──────────
  const succKeyRoles = useMemo(() => locNames.map(loc => `Manager @ ${loc}`), [locNames])

  // keep the succession selector valid as scope changes
  useEffect(() => {
    if (succKeyRoles.length === 0) { if (succRole) setSuccRole(''); return }
    if (!succKeyRoles.includes(succRole)) setSuccRole(succKeyRoles[0])
  }, [succKeyRoles, succRole])

  const succession = useMemo(() => {
    const loc = succRole.replace('Manager @ ', '')
    const incumbent = roster.find(e => e.node_name === loc && e.level === 'manager') || null
    const bench = roster
      .filter(e => e.node_name === loc && e.rated && e.level !== 'manager' && e.level !== 'owner' && e.level !== 'coo')
      .map(e => ({ ...e, r: readiness(e.perf, e.pot), score: e.perf + e.pot * 1.2 }))
      .sort((a, b) => b.score - a.score)
    return { loc, incumbent, bench }
  }, [succRole, roster])

  const ratedCount = filtered.filter(e => e.rated).length

  return (
    <div style={st.wrap}>
      <div>
        <h1 style={st.h1}>9-Box Talent Grid</h1>
        <div style={st.sub}>
          Performance × Potential talent review and succession bench · {ratedCount}/{filtered.length} rated.
        </div>
      </div>

      <div style={st.tabs}>
        <div style={st.tab(tab === 'grid')} onClick={() => setTab('grid')}>Talent Grid</div>
        <div style={st.tab(tab === 'succession')} onClick={() => setTab('succession')}>Succession Bench</div>
      </div>

      {loading && <div style={{ ...st.card, color: 'var(--t-text-muted)' }}>Loading talent grid…</div>}
      {err && !loading && (
        <div style={{ ...st.card, borderTopColor: 'var(--t-danger)' }}>
          <div style={{ fontWeight: 700, color: 'var(--t-danger)' }}>Couldn’t load the talent grid</div>
          <div style={{ fontSize: 12, color: 'var(--t-text-muted)', marginTop: 4 }}>{err}</div>
          <button style={{ ...st.btn, marginTop: 10 }} onClick={load}>Retry</button>
        </div>
      )}
      {!loading && !err && roster.length === 0 && (
        <div style={{ ...st.card, color: 'var(--t-text-muted)' }}>
          No employees in the current scope. Pick a location with staff, or add people to see them here.
        </div>
      )}

      {!loading && !err && roster.length > 0 && tab === 'grid' && (
        <>
          <div style={st.bar}>
            <select style={st.sel} value={locFilter} onChange={e => setLocFilter(e.target.value)}>
              <option value="All">All Locations</option>
              {locNames.map(l => <option key={l} value={l}>{l}</option>)}
            </select>
            {selected && <span style={{ fontSize: 12, color: 'var(--t-accent)', fontWeight: 700 }}>Placing: {roster.find(r => r.id === selected)?.full_name} — click a box (or Esc)</span>}
            {busy && <span style={{ fontSize: 11, color: 'var(--t-text-muted)' }}>Saving…</span>}
            <button style={{ ...st.btn, marginLeft: 'auto' }} onClick={exportCsv}>Export CSV</button>
          </div>

          {/* Unrated pool — honest empty ratings, no invented positions */}
          <div style={st.pool}>
            <div style={{ ...st.sectionLabel, margin: '0 0 8px' }}>Unrated — {unrated.length} awaiting a placement</div>
            {unrated.length === 0
              ? <div style={{ fontSize: 11, color: 'var(--t-text-muted)', fontStyle: 'italic' }}>Everyone in view has been rated.</div>
              : <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {unrated.map(e => (
                    <Chip
                      key={e.id}
                      emp={e}
                      selected={selected === e.id}
                      draggable
                      onDragStart={ev => ev.dataTransfer.setData('text/plain', e.id)}
                      onClick={() => setSelected(selected === e.id ? null : e.id)}
                    />
                  ))}
                </div>}
          </div>

          {/* axis-labelled 9-box */}
          <div style={{ display: 'flex', gap: 8 }}>
            {/* Y axis label */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', writingMode: 'vertical-rl', transform: 'rotate(180deg)', fontSize: 10, fontWeight: 800, letterSpacing: '.12em', color: 'var(--t-text-muted)', textTransform: 'uppercase' }}>Potential →</div>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                {[3, 2, 1].map(pot => [1, 2, 3].map(perf => {
                  const k = `${perf}-${pot}`
                  const meta = BOX_META[k]
                  const people = byCell[k] || []
                  return (
                    <div
                      key={k}
                      onClick={() => onCellClick(perf, pot)}
                      onDragOver={e => e.preventDefault()}
                      onDrop={e => { e.preventDefault(); const id = e.dataTransfer.getData('text/plain'); if (id) setCell(id, perf, pot) }}
                      style={{ minHeight: 132, border: `1px solid var(--t-line)`, borderTop: `3px solid ${TONE[meta.tone]}`, background: 'var(--t-surface)', padding: '8px 10px', cursor: selected ? 'copy' : 'default' }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                        <span style={{ fontSize: 11, fontWeight: 800, color: TONE[meta.tone] }}>{meta.name}</span>
                        <span style={{ fontSize: 10, color: 'var(--t-text-muted)' }}>{people.length}</span>
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                        {people.map(e => (
                          <Chip
                            key={e.id}
                            emp={e}
                            selected={selected === e.id}
                            draggable
                            onDragStart={ev => ev.dataTransfer.setData('text/plain', e.id)}
                            onClick={ev => { ev.stopPropagation(); setSelected(selected === e.id ? null : e.id) }}
                          />
                        ))}
                        {people.length === 0 && <span style={{ fontSize: 10, color: 'var(--t-text-muted)', fontStyle: 'italic' }}>{meta.note}</span>}
                      </div>
                    </div>
                  )
                }))}
              </div>
              <div style={{ textAlign: 'center', fontSize: 10, fontWeight: 800, letterSpacing: '.12em', color: 'var(--t-text-muted)', textTransform: 'uppercase', marginTop: 6 }}>Performance →</div>
            </div>
          </div>

          <div style={{ ...st.sub, marginTop: 12 }}>
            Tip: click a name to pick it up, then click a box to place — or drag &amp; drop. Placements save to the database and persist across devices. People start Unrated until a manager places them — nothing is guessed.
          </div>
          {selected && roster.find(r => r.id === selected)?.rated && (
            <button style={{ ...st.btn, marginTop: 10 }} onClick={() => { resetPlacement(selected); setSelected(null) }}>
              Reset “{roster.find(r => r.id === selected)?.full_name}” to unrated
            </button>
          )}
        </>
      )}

      {!loading && !err && roster.length > 0 && tab === 'succession' && (
        <>
          <div style={st.bar}>
            <span style={{ fontSize: 12, color: 'var(--t-text-muted)', fontWeight: 700 }}>Key role:</span>
            <select style={st.sel} value={succRole} onChange={e => setSuccRole(e.target.value)}>
              {succKeyRoles.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>

          <div style={st.card}>
            <div style={st.sectionLabel}>Incumbent — {succession.loc}</div>
            {succession.incumbent
              ? <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 15, fontWeight: 700 }}>{succession.incumbent.full_name}</span>
                  <span style={{ fontSize: 11, color: 'var(--t-text-muted)' }}>{succession.incumbent.role_name}</span>
                  {succession.incumbent.rated
                    ? <span style={st.badge(BOX_META[`${succession.incumbent.perf}-${succession.incumbent.pot}`]?.tone || 'accent')}>{BOX_META[`${succession.incumbent.perf}-${succession.incumbent.pot}`]?.name}</span>
                    : <span style={{ fontSize: 11, color: 'var(--t-text-muted)', fontStyle: 'italic' }}>not yet rated</span>}
                </div>
              : <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--t-danger)' }}>Vacant</span>
                  <span style={{ fontSize: 12, color: 'var(--t-text-muted)' }}>No manager on record — fill from the bench below.</span>
                </div>}
          </div>

          <div style={st.sectionLabel}>Succession bench — ranked by readiness (rated candidates only)</div>
          {succession.bench.length === 0 && <div style={{ ...st.card, color: 'var(--t-text-muted)' }}>No rated internal candidates at this location yet. Rate the team on the Talent Grid, or consider a cross-location transfer or external hire.</div>}
          {succession.bench.map((e, i) => {
            const meta = BOX_META[`${e.perf}-${e.pot}`]
            return (
              <div key={e.id} style={{ ...st.card, borderTopColor: TONE[e.r.tone], display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--t-text-muted)', width: 26 }}>#{i + 1}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>{e.full_name} <span style={{ fontSize: 11, color: 'var(--t-text-muted)', fontWeight: 600 }}>· {LEVEL_LABEL[e.level] || e.role_name}</span></div>
                  <div style={{ fontSize: 11, color: 'var(--t-text-muted)', marginTop: 2 }}>{meta?.name} · {meta?.note}</div>
                </div>
                <span style={st.badge(e.r.tone)}>{e.r.label}</span>
                <button style={st.btn} onClick={() => navigate('/employee-360')}>Open file</button>
              </div>
            )
          })}
        </>
      )}

      {toast && (
        <div style={{ position: 'fixed', bottom: 24, right: 24, background: 'var(--t-surface)', border: '1px solid var(--t-accent)', borderLeft: '3px solid var(--t-accent)', padding: '10px 16px', fontSize: 12, fontWeight: 700, color: 'var(--t-text)', boxShadow: '0 8px 30px rgba(0,0,0,.4)', zIndex: 9999 }}>{toast}</div>
      )}
    </div>
  )
}
