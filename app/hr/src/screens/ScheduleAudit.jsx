// ScheduleAudit.jsx — Plan A: original-vs-revised schedule records + CHRO-grade print.
// Reads the live retention/snapshot RPCs (schedule_retention_years, get_schedule_versions,
// get_schedule_diff). Printing uses a self-contained popup document, so it never touches
// the app's global styles or theme.
import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../lib/auth.jsx'
import { useScope } from '../lib/scope.jsx'
import { scheduleRetentionYears, getScheduleVersions, getScheduleDiff } from '../lib/supabase'

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]))
const fmtDateTime = (s) => s ? new Date(s).toLocaleString('en-US', { dateStyle:'medium', timeStyle:'short' }) : '—'
const fmtDate = (s) => s ? new Date(s + (String(s).length === 10 ? 'T00:00:00' : '')).toLocaleDateString('en-US', { weekday:'short', month:'short', day:'numeric', year:'numeric' }) : '—'

/* ── build a self-contained printable document ───────────────────────────── */
function shiftTable(rows) {
  if (!rows || rows.length === 0) return '<p class="empty">No shifts recorded in this version.</p>'
  const body = rows.map(r => `<tr>
    <td>${esc(fmtDate(r.shift_date))}</td><td>${esc(r.slot || '—')}</td>
    <td>${esc(r.full_name)}</td><td>${esc(r.shift_type || r.role || '—')}</td>
    <td>${esc(r.start_time || '—')}</td><td>${esc(r.end_time || '—')}</td>
    <td>${esc(r.zone || '—')}</td><td>${r.requires_key ? 'KEY' : ''}</td>
  </tr>`).join('')
  return `<table><thead><tr><th>Date</th><th>Slot</th><th>Employee</th><th>Type</th><th>Start</th><th>End</th><th>Zone</th><th>Key</th></tr></thead><tbody>${body}</tbody></table>`
}

function buildDoc({ locName, weekStart, retain, sections, diff }) {
  const printedAt = new Date().toLocaleString('en-US', { dateStyle:'long', timeStyle:'short' })
  const sectionHtml = sections.map(s => `
    <section>
      <h2>${esc(s.heading)}</h2>
      <div class="meta">Version ${esc(s.version)} · ${esc(s.type === 'original_posted' ? 'ORIGINAL POSTED' : 'REVISION')} · captured ${esc(fmtDateTime(s.created_at))}${s.reason ? ' · reason: ' + esc(s.reason) : ''}</div>
      ${shiftTable(s.rows)}
    </section>`).join('')

  let diffHtml = ''
  if (diff) {
    const list = (arr, cls) => (arr && arr.length)
      ? '<ul class="' + cls + '">' + arr.map(r => `<li>${esc(fmtDate(r.shift_date))} ${esc(r.slot || '')} — ${esc(r.full_name)} (${esc(r.shift_type || r.role || '')})</li>`).join('') + '</ul>'
      : '<p class="empty">None.</p>'
    diffHtml = `<section><h2>Change Log (Original → Revised)</h2>
      <h3 class="rem">Removed from original (${diff.removed_count || 0})</h3>${list(diff.removed, 'rem')}
      <h3 class="add">Added in revision (${diff.added_count || 0})</h3>${list(diff.added, 'add')}</section>`
  }

  return `<!doctype html><html><head><meta charset="utf-8"><title>Schedule Record — ${esc(locName)} — week of ${esc(weekStart)}</title>
  <style>
    *{box-sizing:border-box} body{font-family:Georgia,'Times New Roman',serif;color:#111;margin:0;padding:32px;font-size:12px}
    .lh{display:flex;justify-content:space-between;border-bottom:3px double #111;padding-bottom:10px;margin-bottom:14px}
    .lh h1{font-size:18px;margin:0} .lh .co{font-size:13px;font-weight:bold;letter-spacing:.5px}
    .lh .r{text-align:right;font-size:11px;color:#333}
    .retain{background:#f4f4f0;border:1px solid #bbb;border-left:4px solid #444;padding:8px 12px;margin:12px 0;font-size:11px}
    section{margin:18px 0;page-break-inside:avoid} h2{font-size:14px;border-bottom:1px solid #999;padding-bottom:3px;margin:0 0 4px}
    h3{font-size:12px;margin:10px 0 4px} h3.add{color:#0a6b2e} h3.rem{color:#a01024}
    .meta{font-size:10px;color:#555;margin-bottom:6px}
    table{width:100%;border-collapse:collapse;margin-top:4px} th,td{border:1px solid #999;padding:4px 6px;text-align:left;font-size:11px}
    th{background:#eee;text-transform:uppercase;font-size:9px;letter-spacing:.5px}
    ul{margin:4px 0 0 18px;padding:0} ul.add li{color:#0a6b2e} ul.rem li{color:#a01024}
    .empty{color:#777;font-style:italic;font-size:11px}
    .sig{margin-top:34px;display:flex;gap:40px} .sig div{flex:1;border-top:1px solid #111;padding-top:4px;font-size:10px;color:#333}
    .foot{margin-top:18px;border-top:1px solid #ccc;padding-top:6px;font-size:9px;color:#777}
    @media print{body{padding:0}}
  </style></head><body>
    <div class="lh">
      <div><div class="co">VERY INTIMATE PLEASURES — Twisted Growers</div><h1>Schedule Record — ${esc(locName)}</h1>
        <div>Week of ${esc(weekStart)}</div></div>
      <div class="r">Printed: ${esc(printedAt)}<br/>Official records copy</div>
    </div>
    <div class="retain"><b>Records Retention:</b> ${esc(retain?.advisory || 'Retained per applicable law.')}<br/>
      <span style="color:#555">${esc(retain?.citation || '')}</span></div>
    ${sectionHtml}
    ${diffHtml}
    <div class="sig"><div>Manager signature / date</div><div>HR signature / date</div></div>
    <div class="foot">Generated by Twisted Growers HR · This is a frozen, immutable record. Snapshots are retained until their retain_until date and cannot be altered after capture.</div>
  </body></html>`
}

function printDoc(html) {
  const w = window.open('', '_blank', 'width=920,height=720')
  if (!w) { alert('Please allow pop-ups to print the schedule record.'); return }
  w.document.write(html); w.document.close(); w.focus()
  setTimeout(() => { try { w.print() } catch (e) {} }, 350)
}

/* ── UI helpers ───────────────────────────────────────────────────────────── */
function Badge({ type }) {
  const orig = type === 'original_posted'
  return <span style={{ fontSize:9, fontWeight:800, letterSpacing:'.06em', padding:'2px 7px', borderRadius:0,
    color: orig ? 'var(--t-on-grad)' : 'var(--t-warn)',
    background: orig ? 'var(--t-accent)' : 'rgba(255,179,0,0.12)',
    border: `1px solid ${orig ? 'var(--t-accent)' : 'var(--t-warn)'}` }}>
    {orig ? 'ORIGINAL POSTED' : 'REVISION'}</span>
}

export default function ScheduleAudit() {
  const { session } = useAuth()
  const { locations } = useScope()
  const locs = locations || []
  const [nodeId, setNodeId] = useState('')
  const [retain, setRetain] = useState(null)
  const [versions, setVersions] = useState([])
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState(null)
  const [aId, setAId] = useState('')   // original (A)
  const [bId, setBId] = useState('')   // revised (B)
  const [diff, setDiff] = useState(null)

  useEffect(() => { if (!nodeId && locs.length) setNodeId(locs[0].id) }, [locs, nodeId])

  const load = useCallback(async () => {
    if (!nodeId) return
    setLoading(true); setErr(null); setDiff(null); setAId(''); setBId('')
    try {
      const [r, v] = await Promise.all([
        scheduleRetentionYears(nodeId).catch(() => null),
        getScheduleVersions([nodeId]).catch(() => ({ versions: [] })),
      ])
      setRetain(r)
      setVersions(Array.isArray(v?.versions) ? v.versions : [])
    } catch (e) { setErr(e.message) } finally { setLoading(false) }
  }, [nodeId])
  useEffect(() => { load() }, [load])

  useEffect(() => {
    let cancel = false
    if (aId && bId && aId !== bId) {
      getScheduleDiff(aId, bId).then(d => { if (!cancel) setDiff(d) }).catch(() => {})
    } else setDiff(null)
    return () => { cancel = true }
  }, [aId, bId])

  const locName = locs.find(l => l.id === nodeId)?.name || 'Location'
  const byId = (id) => versions.find(v => v.snapshot_id === id)

  function printOne(v) {
    printDoc(buildDoc({
      locName, weekStart: v.week_start, retain,
      sections: [{ heading: v.type === 'original_posted' ? 'Original Posted Schedule' : 'Revised Schedule',
        version: v.version, type: v.type, created_at: v.created_at, reason: v.reason, rows: v.snapshot_data || [] }],
    }))
  }
  function printAudit() {
    const a = byId(aId), b = byId(bId)
    if (!a || !b) return
    printDoc(buildDoc({
      locName, weekStart: a.week_start, retain, diff,
      sections: [
        { heading: 'Original Posted Schedule', version: a.version, type: a.type, created_at: a.created_at, reason: a.reason, rows: a.snapshot_data || [] },
        { heading: 'Revised Schedule', version: b.version, type: b.type, created_at: b.created_at, reason: b.reason, rows: b.snapshot_data || [] },
      ],
    }))
  }

  const cardS = { background:'var(--t-surface)', border:'1px solid var(--t-line)', borderRadius:0, padding:14 }
  const btn = (primary) => ({ padding:'5px 12px', fontSize:11, fontWeight:700, cursor:'pointer', borderRadius:0,
    background: primary ? 'var(--t-accent)' : 'var(--t-surface)', color: primary ? 'var(--t-on-grad)' : 'var(--t-text-muted)',
    border: `1px solid ${primary ? 'var(--t-accent)' : 'var(--t-line)'}` })

  return (
    <div style={{ color:'var(--t-text)', fontSize:13 }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14, flexWrap:'wrap', gap:8 }}>
        <div style={{ fontSize:16, fontWeight:800, letterSpacing:'-.3px' }}>SCHEDULE AUDIT &amp; RECORDS</div>
        <select value={nodeId} onChange={e => setNodeId(e.target.value)} style={{ padding:'5px 8px', background:'var(--t-surface)', color:'var(--t-text)', border:'1px solid var(--t-line)', borderRadius:0, fontSize:12, fontWeight:700 }}>
          {locs.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
      </div>

      {retain && (
        <div style={{ ...cardS, borderLeft:'3px solid var(--t-warn)', marginBottom:14, fontSize:12 }}>
          <div style={{ fontWeight:800, color:'var(--t-warn)', fontSize:11, letterSpacing:'.06em', marginBottom:4 }}>
            📁 RECORDS RETENTION — {retain.years} YEAR{retain.years === 1 ? '' : 'S'} {retain.state ? `· ${retain.state}` : ''}
          </div>
          <div style={{ color:'var(--t-text-muted)', lineHeight:1.5 }}>{retain.advisory}</div>
          {retain.citation && <div style={{ color:'var(--t-text-faint)', fontSize:10, marginTop:4 }}>{retain.citation}</div>}
        </div>
      )}

      {err && <div style={{ ...cardS, borderColor:'var(--t-danger)', color:'var(--t-danger)', marginBottom:12 }}>{err}</div>}

      <div style={{ ...cardS }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
          <div style={{ fontSize:11, fontWeight:700, color:'var(--t-text-muted)', letterSpacing:'.06em' }}>
            STORED VERSIONS — {locName} {loading && <span style={{ color:'var(--t-accent)' }}>· loading…</span>}
          </div>
          <button onClick={load} style={btn(false)}>REFRESH</button>
        </div>

        {(!loading && versions.length === 0) ? (
          <div style={{ color:'var(--t-text-faint)', fontSize:12, padding:'18px 4px', lineHeight:1.6 }}>
            No stored schedule versions for this location yet.<br/>
            Versions are created automatically when a schedule is <b>published</b> (original) and on each change after posting (revisions).
          </div>
        ) : (
          <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
            <div style={{ display:'grid', gridTemplateColumns:'90px 1fr 130px 70px 110px 70px 70px', gap:8, fontSize:9, fontWeight:800, color:'var(--t-text-faint)', letterSpacing:'.06em', padding:'0 6px' }}>
              <span>TYPE</span><span>WEEK / CAPTURED</span><span>BY</span><span>SHIFTS</span><span>RETAIN UNTIL</span><span>ORIG</span><span>REVISED</span>
            </div>
            {versions.map(v => (
              <div key={v.snapshot_id} style={{ display:'grid', gridTemplateColumns:'90px 1fr 130px 70px 110px 70px 70px', gap:8, alignItems:'center', padding:'8px 6px', background:'var(--t-bg)', border:'1px solid var(--t-line)' }}>
                <Badge type={v.type} />
                <div>
                  <div style={{ fontSize:12, fontWeight:700 }}>v{v.version} · week of {v.week_start}</div>
                  <div style={{ fontSize:10, color:'var(--t-text-muted)' }}>{fmtDateTime(v.created_at)}{v.reason ? ` · ${v.reason}` : ''}</div>
                </div>
                <div style={{ fontSize:10, color:'var(--t-text-muted)', overflow:'hidden', textOverflow:'ellipsis' }}>{v.created_by?.slice(0, 8) || '—'}</div>
                <div style={{ fontSize:12, fontWeight:700, color: v.shift_count ? 'var(--t-text)' : 'var(--t-text-faint)' }}>{v.shift_count}</div>
                <div style={{ fontSize:10, color:'var(--t-warn)', fontWeight:600 }}>{v.retain_until}</div>
                <div><input type="radio" name="origSel" checked={aId === v.snapshot_id} onChange={() => setAId(v.snapshot_id)} /></div>
                <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                  <input type="radio" name="revSel" checked={bId === v.snapshot_id} onChange={() => setBId(v.snapshot_id)} />
                  <button onClick={() => printOne(v)} style={btn(false)} title="Print this version">🖨</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {aId && bId && aId !== bId && (
        <div style={{ ...cardS, marginTop:14 }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:8 }}>
            <div style={{ fontSize:11, fontWeight:700, color:'var(--t-text-muted)', letterSpacing:'.06em' }}>CHANGE LOG — ORIGINAL → REVISED</div>
            <button onClick={printAudit} style={btn(true)}>🖨 PRINT FULL AUDIT (original + revised + changes)</button>
          </div>
          {diff ? (
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
              <div>
                <div style={{ fontSize:10, fontWeight:800, color:'var(--t-danger)', marginBottom:4 }}>REMOVED FROM ORIGINAL ({diff.removed_count || 0})</div>
                {(diff.removed || []).length === 0 ? <div style={{ fontSize:11, color:'var(--t-text-faint)' }}>None.</div> :
                  (diff.removed || []).map((r, i) => <div key={i} style={{ fontSize:11, color:'var(--t-danger)' }}>{fmtDate(r.shift_date)} {r.slot} — {r.full_name}</div>)}
              </div>
              <div>
                <div style={{ fontSize:10, fontWeight:800, color:'var(--t-success)', marginBottom:4 }}>ADDED IN REVISION ({diff.added_count || 0})</div>
                {(diff.added || []).length === 0 ? <div style={{ fontSize:11, color:'var(--t-text-faint)' }}>None.</div> :
                  (diff.added || []).map((r, i) => <div key={i} style={{ fontSize:11, color:'var(--t-success)' }}>{fmtDate(r.shift_date)} {r.slot} — {r.full_name}</div>)}
              </div>
            </div>
          ) : <div style={{ fontSize:11, color:'var(--t-text-faint)' }}>Computing differences…</div>}
        </div>
      )}
    </div>
  )
}
