// Benchmarking.jsx — cross-location comparison. Ranks each store per metric with
// rank, percentile, and delta vs the network average, plus a composite scorecard.
// All data is REAL: locations + headcount come from the HR brain (org_nodes /
// assignments) and each benchmark metric is persisted per location+period in
// hr_location_benchmarks via the hr_benchmarks_* RPCs. No fabricated data — where
// nothing is entered yet the grid shows an honest em-dash / empty state.
import { useState, useEffect, useMemo, useCallback } from 'react'
import { sb, getSession } from '../lib/supabase'
import DrillDown from '../components/DrillDown.jsx'

const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
function ddl(name, content, mime) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([content], { type: mime })); a.download = name; a.click() }

// metric defs — higherIsBetter controls ranking direction. `key` is the metric_key
// persisted in hr_location_benchmarks; `parse` normalises the value the user types.
const METRICS = [
  { key: 'revenue', label: 'Revenue', fmt: v => `$${Number(v).toLocaleString()}`, higher: true },
  { key: 'laborPct', label: 'Labor %', fmt: v => `${v}%`, higher: false },
  { key: 'attendance', label: 'Attendance %', fmt: v => `${v}%`, higher: true },
  { key: 'training', label: 'Training %', fmt: v => `${v}%`, higher: true },
  { key: 'compliance', label: 'Compliance %', fmt: v => `${v}%`, higher: true },
  { key: 'callouts', label: 'Callouts (30d)', fmt: v => `${v}`, higher: false },
  { key: 'turnover', label: 'Turnover %', fmt: v => `${v}%`, higher: false },
  { key: 'avgTicket', label: 'Avg Ticket', fmt: v => `$${v}`, higher: true },
]

const thisMonth = () => new Date().toISOString().slice(0, 7) // YYYY-MM

const st = {
  wrap: { padding: '24px 28px', color: 'var(--t-text)', minHeight: '100vh', background: 'var(--t-bg)' },
  h1: { fontSize: 20, fontWeight: 800, letterSpacing: '.04em', margin: 0, textTransform: 'uppercase' },
  sub: { fontSize: 11, color: 'var(--t-text-muted)', marginTop: 3 },
  card: { background: 'var(--t-surface)', border: '1px solid var(--t-line)', marginTop: 16 },
  th: { fontSize: 10, fontWeight: 800, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--t-text-muted)', padding: '9px 12px', textAlign: 'right', borderBottom: '1px solid var(--t-line)', background: 'var(--t-surface-2)', whiteSpace: 'nowrap', cursor: 'pointer' },
  td: { fontSize: 12, padding: '9px 12px', borderBottom: '1px solid var(--t-line)', textAlign: 'right', whiteSpace: 'nowrap' },
  btn: { fontSize: 11, fontWeight: 700, padding: '7px 13px', background: 'var(--t-surface)', border: '1px solid var(--t-line)', color: 'var(--t-text-muted)', cursor: 'pointer' },
  input: { width: 78, fontSize: 12, padding: '4px 6px', background: 'var(--t-bg)', border: '1px solid var(--t-accent)', color: 'var(--t-text)', textAlign: 'right' },
  monthInput: { fontSize: 12, padding: '6px 8px', background: 'var(--t-surface)', border: '1px solid var(--t-line)', color: 'var(--t-text)' },
  empty: { padding: '40px 20px', textAlign: 'center', color: 'var(--t-text-muted)', fontSize: 13 },
}

export default function Benchmarking() {
  const [period, setPeriod] = useState(thisMonth())
  const [locations, setLocations] = useState([]) // [{ node_id, name, headcount, metrics:{key:val} }]
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState(null)
  const [sortMetric, setSortMetric] = useState('composite')
  const [drill, setDrill] = useState(null)
  const [edit, setEdit] = useState(null) // { node_id, key, value }
  const [saving, setSaving] = useState(false)

  const session = getSession()
  const nodeIds = useMemo(() => {
    const nodes = session.nodes || []
    const locs = nodes.filter(n => n.node_type === 'location').map(n => n.id)
    return locs.length ? locs : nodes.map(n => n.id)
  }, [session.nodes])

  const load = useCallback(async () => {
    setLoading(true); setErr(null)
    try {
      const { data, error } = await sb.rpc('hr_benchmarks_overview', { p_node_ids: nodeIds, p_period: period })
      if (error) throw error
      if (data && data.ok === false) throw new Error(data.error || 'load_failed')
      setLocations(Array.isArray(data?.locations) ? data.locations : [])
    } catch (e) {
      setErr(e.message || String(e)); setLocations([])
    } finally { setLoading(false) }
  }, [nodeIds, period])

  useEffect(() => { load() }, [load])

  // Flatten each location's stored metrics onto the row (numbers or null — never faked).
  const data = useMemo(() => locations.map(l => {
    const row = { loc: l.name, node_id: l.node_id, headcount: l.headcount ?? 0 }
    METRICS.forEach(m => {
      const v = l.metrics ? l.metrics[m.key] : null
      row[m.key] = (v === null || v === undefined || v === '') ? null : Number(v)
    })
    return row
  }), [locations])

  // Network average per metric — only over locations that actually have a value.
  const network = useMemo(() => {
    const n = {}
    METRICS.forEach(m => {
      const vals = data.map(d => d[m.key]).filter(v => v !== null && !Number.isNaN(v))
      n[m.key] = vals.length ? +(vals.reduce((s, v) => s + v, 0) / vals.length).toFixed(1) : null
    })
    return n
  }, [data])

  // Rank + percentile per metric (only among locations with a value), plus a
  // composite = avg of that location's available per-metric percentiles.
  const scored = useMemo(() => {
    const rows = data.map(d => ({ ...d, rank: {}, pct: {}, delta: {} }))
    METRICS.forEach(m => {
      const withVal = rows.filter(d => d[m.key] !== null && !Number.isNaN(d[m.key]))
      const sorted = [...withVal].sort((a, b) => m.higher ? b[m.key] - a[m.key] : a[m.key] - b[m.key])
      rows.forEach(d => {
        if (d[m.key] === null || Number.isNaN(d[m.key])) { d.rank[m.key] = null; d.pct[m.key] = null; d.delta[m.key] = null; return }
        const rank = sorted.findIndex(x => x.node_id === d.node_id) + 1
        d.rank[m.key] = rank
        d.pct[m.key] = withVal.length > 1 ? Math.round((withVal.length - rank) / (withVal.length - 1) * 100) : 100
        d.delta[m.key] = network[m.key] === null ? null : +(d[m.key] - network[m.key]).toFixed(1)
      })
    })
    rows.forEach(d => {
      const pcts = METRICS.map(m => d.pct[m.key]).filter(v => v !== null)
      d.composite = pcts.length ? Math.round(pcts.reduce((s, v) => s + v, 0) / pcts.length) : null
    })
    return rows
  }, [data, network])

  const sorted = useMemo(() => [...scored].sort((a, b) => {
    const va = sortMetric === 'composite' ? a.composite : a[sortMetric]
    const vb = sortMetric === 'composite' ? b.composite : b[sortMetric]
    if (va === null && vb === null) return 0
    if (va === null) return 1
    if (vb === null) return -1
    const higher = sortMetric === 'composite' ? true : (METRICS.find(m => m.key === sortMetric)?.higher ?? true)
    return higher ? vb - va : va - vb
  }), [scored, sortMetric])

  const clrPct = p => p === null ? 'var(--t-text-faint)' : p >= 75 ? 'var(--t-success)' : p >= 40 ? 'var(--t-warn)' : 'var(--t-danger)'
  const hasAnyValue = data.some(d => METRICS.some(m => d[m.key] !== null))
  const ranked = sorted.filter(d => d.composite !== null)

  // ── Persist a single edited metric cell (real write, then reload) ────────────
  const commitEdit = async () => {
    if (!edit) return
    const raw = String(edit.value).trim()
    setSaving(true)
    try {
      if (raw === '') {
        await sb.rpc('hr_benchmark_delete', { p_node_id: edit.node_id, p_metric_key: edit.key, p_period: period })
      } else {
        const num = Number(raw)
        if (Number.isNaN(num)) { setSaving(false); setEdit(null); return }
        const { data, error } = await sb.rpc('hr_benchmark_set', {
          p_node_id: edit.node_id, p_metric_key: edit.key, p_metric_value: num,
          p_period: period, p_note: null, p_actor: session.id || null,
        })
        if (error) throw error
        if (data && data.ok === false) throw new Error(data.error || 'save_failed')
      }
      setEdit(null)
      await load()
    } catch (e) {
      setErr(e.message || String(e)); setEdit(null)
    } finally { setSaving(false) }
  }

  const exportRows = scored.map(d => ({ Location: d.loc, Headcount: d.headcount, Composite: d.composite ?? '', ...Object.fromEntries(METRICS.map(m => [m.label, d[m.key] ?? ''])), ...Object.fromEntries(METRICS.map(m => [`${m.label} rank`, d.rank[m.key] ?? ''])) }))
  const exportCSV = () => { if (!exportRows.length) return; const k = Object.keys(exportRows[0]); ddl(`vip-benchmarking-${period}.csv`, [k.join(','), ...exportRows.map(o => k.map(x => JSON.stringify(o[x] ?? '')).join(','))].join('\n'), 'text/csv') }
  const exportXLS = () => { if (!exportRows.length) return; const k = Object.keys(exportRows[0]); const th = k.map(x => `<th style="background:#0b2545;color:#fff;padding:6px 10px">${esc(x)}</th>`).join(''); const trs = exportRows.map(o => `<tr>${k.map(x => `<td style="padding:5px 10px">${esc(o[x])}</td>`).join('')}</tr>`).join(''); ddl(`vip-benchmarking-${period}.xls`, `<html xmlns:o="urn:schemas-microsoft-com:office:office"><head><meta charset="utf-8"></head><body><table border="1">${`<tr>${th}</tr>`}${trs}</table></body></html>`, 'application/vnd.ms-excel') }

  const drillMetric = (m) => setDrill({
    title: `${m.label} — Location Ranking`, subtitle: network[m.key] === null ? 'No values entered yet' : `Network avg ${m.fmt(network[m.key])}`, accent: 'var(--t-accent)',
    columns: [
      { key: 'rank', label: 'Rank', value: r => r.rank[m.key] ? `#${r.rank[m.key]}` : '—', align: 'right', sortKey: r => r.rank[m.key] ?? 999 },
      { key: 'loc', label: 'Location', value: r => r.loc },
      { key: 'val', label: m.label, value: r => r[m.key] === null ? '—' : m.fmt(r[m.key]), align: 'right', sortKey: r => r[m.key] ?? -1 },
      { key: 'delta', label: 'vs Network', value: r => r.delta[m.key] === null ? '—' : `${r.delta[m.key] > 0 ? '+' : ''}${r.delta[m.key]}`, align: 'right', sortKey: r => r.delta[m.key] ?? 0 },
      { key: 'pct', label: 'Percentile', value: r => r.pct[m.key] === null ? '—' : `${r.pct[m.key]}th`, align: 'right', sortKey: r => r.pct[m.key] ?? -1 },
    ],
    rows: [...scored].sort((a, b) => (a.rank[m.key] ?? 999) - (b.rank[m.key] ?? 999)),
  })

  const headerClick = (m) => { if (sortMetric === m.key) drillMetric(m); else setSortMetric(m.key) }

  return (
    <div style={st.wrap}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={st.h1}>Location Benchmarking</h1>
          <div style={st.sub}>Rank · percentile · delta-vs-network across all metrics. Click a metric value to edit it; click a column header to sort, click again to drill into the ranking.</div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input type="month" value={period} onChange={e => setPeriod(e.target.value)} style={st.monthInput} title="Benchmark period" />
          <button style={st.btn} onClick={exportCSV} disabled={!exportRows.length}>⤓ CSV</button>
          <button style={st.btn} onClick={exportXLS} disabled={!exportRows.length}>⤓ Excel</button>
        </div>
      </div>

      {loading && <div style={st.empty}>Loading…</div>}
      {!loading && err && <div style={{ ...st.empty, color: 'var(--t-danger)' }}>Could not load benchmarks: {err}</div>}
      {!loading && !err && locations.length === 0 && <div style={st.empty}>No locations in scope yet.</div>}

      {!loading && !err && locations.length > 0 && (
        <>
          {/* leaderboard by composite — only locations that have data */}
          {ranked.length > 0 ? (
            <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
              {ranked.map((d, i) => (
                <div key={d.node_id} style={{ flex: 1, minWidth: 150, background: 'var(--t-surface)', border: '1px solid var(--t-line)', borderTop: `3px solid ${i === 0 ? 'var(--t-success)' : i === ranked.length - 1 ? 'var(--t-danger)' : 'var(--t-accent)'}`, padding: '12px 14px' }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--t-text-muted)', textTransform: 'uppercase' }}>#{i + 1} {i === 0 ? '🏆' : ''}</div>
                  <div style={{ fontSize: 13, fontWeight: 800, marginTop: 2 }}>{d.loc}</div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: clrPct(d.composite), marginTop: 4 }}>{d.composite}<span style={{ fontSize: 11, color: 'var(--t-text-faint)' }}> composite</span></div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ ...st.empty, marginTop: 16, border: '1px solid var(--t-line)', background: 'var(--t-surface)' }}>
              No benchmark values entered for {period} yet. Click any metric cell below to enter a value — it saves to the database immediately.
            </div>
          )}

          <div style={st.card}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={{ ...st.th, textAlign: 'left' }} onClick={() => setSortMetric('composite')}>Location</th>
                    <th style={{ ...st.th, textAlign: 'right' }} title="Active headcount (live)">Headcount</th>
                    <th style={st.th} onClick={() => setSortMetric('composite')}>Composite{sortMetric === 'composite' ? ' ▼' : ''}</th>
                    {METRICS.map(m => <th key={m.key} style={st.th} onClick={() => headerClick(m)} title="Click to sort · click header again to drill">{m.label}{sortMetric === m.key ? ' ▼' : ''}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((d, i) => (
                    <tr key={d.node_id} style={{ background: d.composite !== null && i === 0 ? 'rgba(52,199,89,.05)' : 'transparent' }}>
                      <td style={{ ...st.td, textAlign: 'left', fontWeight: 700 }}>{d.composite !== null ? `#${i + 1} ` : ''}{d.loc}</td>
                      <td style={{ ...st.td, color: 'var(--t-text-muted)' }}>{d.headcount}</td>
                      <td style={{ ...st.td, fontWeight: 800, color: clrPct(d.composite) }}>{d.composite ?? '—'}</td>
                      {METRICS.map(m => {
                        const editing = edit && edit.node_id === d.node_id && edit.key === m.key
                        return (
                          <td key={m.key} style={{ ...st.td, cursor: editing ? 'text' : 'pointer', color: clrPct(d.pct[m.key]) }}
                            onClick={() => { if (!editing && !saving) setEdit({ node_id: d.node_id, key: m.key, value: d[m.key] ?? '' }) }}
                            title={d[m.key] === null ? 'Click to enter a value' : `Rank ${d.rank[m.key] ? '#' + d.rank[m.key] : '—'} · ${d.pct[m.key] ?? '—'}th pct · ${d.delta[m.key] === null ? '—' : (d.delta[m.key] > 0 ? '+' : '') + d.delta[m.key]} vs network`}>
                            {editing ? (
                              <input autoFocus type="number" step="any" style={st.input} value={edit.value}
                                onChange={e => setEdit({ ...edit, value: e.target.value })}
                                onBlur={commitEdit}
                                onKeyDown={e => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') setEdit(null) }} />
                            ) : d[m.key] === null ? (
                              <span style={{ color: 'var(--t-text-faint)' }}>—</span>
                            ) : (
                              <>{m.fmt(d[m.key])} {d.rank[m.key] && <span style={{ fontSize: 9, color: 'var(--t-text-faint)' }}>#{d.rank[m.key]}</span>}</>
                            )}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                  {hasAnyValue && (
                    <tr style={{ background: 'var(--t-surface-2)', fontWeight: 800 }}>
                      <td style={{ ...st.td, textAlign: 'left' }}>NETWORK AVG</td>
                      <td style={st.td}>—</td>
                      <td style={st.td}>—</td>
                      {METRICS.map(m => <td key={m.key} style={st.td}>{network[m.key] === null ? '—' : m.fmt(network[m.key])}</td>)}
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      <DrillDown open={!!drill} onClose={() => setDrill(null)} {...(drill || {})} />
    </div>
  )
}
