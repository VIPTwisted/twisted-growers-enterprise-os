// DrillDown.jsx — reusable forensic drill-down modal. Any KPI tile can open this
// to expose the row-level records behind the number: searchable, sortable,
// CSV-exportable, with a summary strip and an audit stamp. IRS-grade transparency.
import { useState, useMemo, Fragment } from 'react'

const cell = (row, c) => (c.value ? c.value(row) : row[c.key])
const rawText = (row, c) => {
  const v = c.sortKey ? c.sortKey(row) : (c.value ? c.value(row) : row[c.key])
  return v == null ? '' : String(v)
}

// message store shared with the Tasks screen + top-bar inbox
function ddSessionName() { try { return JSON.parse(sessionStorage.getItem('vip_session') || '{}')?.person?.full_name || 'Manager' } catch { return 'Manager' } }
function ddSaveMsg(subjectKey, msg) {
  try {
    const all = JSON.parse(localStorage.getItem('vip_task_messages') || '{}')
    all[subjectKey] = [...(all[subjectKey] || []), msg]
    localStorage.setItem('vip_task_messages', JSON.stringify(all))
  } catch (_) {}
}
const DD_PRESETS = [
  { label: '🎉 Great job!', text: 'Great job on this — thank you!', kind: 'praise' },
  { label: '⏰ Do this now', text: 'Please prioritize this and do it now.', kind: 'urgent' },
  { label: '✏️ Needs revision', text: 'This needs a revision — please review and fix.', kind: 'revise' },
]

// messaging: { nameKey, subjectKey } — when set, each row gets a 💬 Message action
export default function DrillDown({ open, onClose, title, subtitle, columns = [], rows = [], summary = [], accent = 'var(--t-accent)', emptyText = 'No records behind this metric.', messaging = null }) {
  const [q, setQ] = useState('')
  const [sort, setSort] = useState({ key: null, dir: 1 })
  const [msgRow, setMsgRow] = useState(null)   // row being messaged
  const [msgText, setMsgText] = useState('')
  const [sentToast, setSentToast] = useState('')

  const rowName = (row) => messaging ? (row[messaging.nameKey] ?? '') : ''
  const rowSubject = (row) => messaging ? String(row[messaging.subjectKey] ?? title ?? 'item') : ''
  const sendMsg = (row, body, kind = 'comment') => {
    const b = (body ?? msgText).trim(); if (!b) return
    const to = rowName(row)
    ddSaveMsg(rowSubject(row), { id: `m-${Date.now()}`, from: ddSessionName(), to, kind, body: b, subject: rowSubject(row), at: new Date().toISOString() })
    setMsgText(''); setMsgRow(null)
    setSentToast(`Sent to ${String(to).split(' ')[0] || 'employee'}`)
    setTimeout(() => setSentToast(''), 2200)
  }

  const view = useMemo(() => {
    let r = rows || []
    if (q) { const s = q.toLowerCase(); r = r.filter(row => columns.some(c => rawText(row, c).toLowerCase().includes(s))) }
    if (sort.key) {
      const col = columns.find(c => c.key === sort.key)
      r = [...r].sort((a, b) => {
        const av = col?.sortKey ? col.sortKey(a) : a[sort.key]
        const bv = col?.sortKey ? col.sortKey(b) : b[sort.key]
        if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * sort.dir
        return String(av ?? '').localeCompare(String(bv ?? '')) * sort.dir
      })
    }
    return r
  }, [rows, q, sort, columns])

  const exportCSV = () => {
    const head = columns.map(c => `"${c.label}"`).join(',')
    const body = view.map(row => columns.map(c => `"${String(rawText(row, c)).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([head + '\n' + body], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `${(title || 'drilldown').replace(/[^a-z0-9]+/gi, '_').toLowerCase()}.csv`; a.click()
    URL.revokeObjectURL(url)
    import('../lib/audit.js').then(m => m.logAudit('Data Export', { target: title || 'drill-down', meta: { rows: view.length, format: 'CSV' } })).catch(() => {})
  }

  if (!open) return null
  const stamp = new Date().toLocaleString('en-US')

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 9997, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 20px', overflowY: 'auto' }}>
      <div id="dd-print" onClick={e => e.stopPropagation()} style={{ width: 'min(1040px, 96vw)', background: 'var(--t-bg)', border: '1px solid var(--t-line)', boxShadow: '0 24px 80px rgba(0,0,0,0.6)' }}>
        <style>{`@media print { body * { visibility: hidden !important; } #dd-print, #dd-print * { visibility: visible !important; } #dd-print { position: absolute; left: 0; top: 0; width: 100%; max-height: none !important; box-shadow: none !important; background: #fff !important; color: #000 !important; } #dd-print * { color: #000 !important; background: #fff !important; border-color: #999 !important; } #dd-print .dd-noprint { display: none !important; } #dd-print .dd-scroll { max-height: none !important; overflow: visible !important; } }`}</style>
        {/* header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--t-line)', background: 'var(--t-surface)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--t-text)', borderLeft: `3px solid ${accent}`, paddingLeft: 10 }}>{title}</div>
            {subtitle && <div style={{ fontSize: 12, color: 'var(--t-text-muted)', marginTop: 4, paddingLeft: 13 }}>{subtitle}</div>}
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--t-text-muted)', fontSize: 24, cursor: 'pointer', lineHeight: 1 }}>×</button>
        </div>

        {/* summary strip */}
        {summary.length > 0 && (
          <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--t-line)', flexWrap: 'wrap' }}>
            {summary.map((s, i) => (
              <div key={i} style={{ padding: '12px 20px', borderRight: '1px solid var(--t-line)', minWidth: 130 }}>
                <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: '.06em', color: 'var(--t-text-muted)', textTransform: 'uppercase' }}>{s.label}</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: s.color || 'var(--t-text)', marginTop: 2 }}>{s.value}</div>
              </div>
            ))}
          </div>
        )}

        {/* toolbar */}
        <div className="dd-noprint" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', borderBottom: '1px solid var(--t-line)' }}>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search records…" style={{ flex: 1, maxWidth: 320, padding: '6px 10px', fontSize: 12, background: 'var(--t-surface)', color: 'var(--t-text)', border: '1px solid var(--t-line)', outline: 'none' }} />
          <span style={{ fontSize: 12, color: 'var(--t-text-muted)' }}><b style={{ color: 'var(--t-text)' }}>{view.length}</b> of {rows.length} records</span>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <button onClick={() => window.print()} style={{ padding: '6px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer', background: 'var(--t-surface)', color: 'var(--t-text-muted)', border: '1px solid var(--t-line)' }}>🖨 Print</button>
            <button onClick={exportCSV} style={{ padding: '6px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer', background: 'var(--t-surface)', color: 'var(--t-text-muted)', border: '1px solid var(--t-line)' }}>⤓ Export CSV</button>
          </div>
        </div>

        {/* table */}
        <div className="dd-scroll" style={{ maxHeight: '58vh', overflowY: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: 'var(--t-surface-2)', position: 'sticky', top: 0, zIndex: 1 }}>
                {columns.map(c => {
                  const active = sort.key === c.key
                  return (
                    <th key={c.key} onClick={() => setSort(s => ({ key: c.key, dir: s.key === c.key ? -s.dir : 1 }))}
                      style={{ textAlign: c.align || 'left', padding: '9px 12px', fontSize: 9, fontWeight: 800, letterSpacing: '.05em', color: active ? accent : 'var(--t-text-muted)', textTransform: 'uppercase', borderBottom: '1px solid var(--t-line)', cursor: 'pointer', whiteSpace: 'nowrap', userSelect: 'none' }}>
                      {c.label}{active ? (sort.dir === 1 ? ' ▲' : ' ▼') : ''}
                    </th>
                  )
                })}
                {messaging && <th className="dd-noprint" style={{ padding: '9px 12px', fontSize: 9, fontWeight: 800, letterSpacing: '.05em', color: 'var(--t-text-muted)', textTransform: 'uppercase', borderBottom: '1px solid var(--t-line)' }}>Action</th>}
              </tr>
            </thead>
            <tbody>
              {view.length === 0 ? (
                <tr><td colSpan={columns.length + (messaging ? 1 : 0)} style={{ padding: 28, textAlign: 'center', color: 'var(--t-text-faint)' }}>{emptyText}</td></tr>
              ) : view.map((row, i) => (
                <Fragment key={i}>
                  <tr style={{ borderBottom: msgRow === i ? 'none' : '1px solid var(--t-line)', background: msgRow === i ? 'var(--t-surface-2)' : 'transparent', cursor: messaging ? 'pointer' : 'default' }}
                    onClick={messaging ? () => setMsgRow(msgRow === i ? null : i) : undefined}>
                    {columns.map(c => <td key={c.key} style={{ padding: '8px 12px', textAlign: c.align || 'left', color: 'var(--t-text)', whiteSpace: 'nowrap' }}>{cell(row, c)}</td>)}
                    {messaging && <td className="dd-noprint" style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>
                      <button onClick={(e) => { e.stopPropagation(); setMsgRow(msgRow === i ? null : i) }} style={{ fontSize: 11, fontWeight: 700, padding: '4px 10px', background: msgRow === i ? 'var(--t-surface)' : accent, color: msgRow === i ? 'var(--t-text-muted)' : '#04121a', border: msgRow === i ? '1px solid var(--t-line)' : 'none', cursor: 'pointer' }}>💬 {msgRow === i ? 'Close' : 'Message'}</button>
                    </td>}
                  </tr>
                  {messaging && msgRow === i && (
                    <tr style={{ borderBottom: '1px solid var(--t-line)', background: 'var(--t-surface-2)' }}>
                      <td colSpan={columns.length + 1} className="dd-noprint" style={{ padding: '10px 14px' }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--t-text-muted)', marginBottom: 6 }}>💬 Message {rowName(row)} — re: {rowSubject(row)}</div>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                          {DD_PRESETS.map(p => <button key={p.label} onClick={(e) => { e.stopPropagation(); sendMsg(row, p.text, p.kind) }} style={{ fontSize: 11, fontWeight: 600, padding: '5px 10px', background: 'var(--t-surface)', border: '1px solid var(--t-line)', color: 'var(--t-text)', cursor: 'pointer' }}>{p.label}</button>)}
                        </div>
                        <div style={{ display: 'flex', gap: 6 }} onClick={e => e.stopPropagation()}>
                          <input value={msgText} onChange={e => setMsgText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') sendMsg(row) }} placeholder={`Message ${String(rowName(row)).split(' ')[0] || 'employee'}…`} style={{ flex: 1, background: 'var(--t-surface)', border: '1px solid var(--t-line)', color: 'var(--t-text)', padding: '8px 10px', fontSize: 12, outline: 'none' }} />
                          <button onClick={() => sendMsg(row)} disabled={!msgText.trim()} style={{ fontSize: 12, fontWeight: 700, padding: '0 16px', background: msgText.trim() ? accent : 'var(--t-surface)', color: msgText.trim() ? '#04121a' : 'var(--t-text-faint)', border: 'none', cursor: msgText.trim() ? 'pointer' : 'not-allowed' }}>Send</button>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>

        {/* audit footer */}
        <div style={{ padding: '10px 16px', borderTop: '1px solid var(--t-line)', background: 'var(--t-surface)', fontSize: 10, color: 'var(--t-text-faint)', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <span>🔒 Forensic record view — every row is source data, not a computed estimate.{messaging ? ' Click a row to message the employee.' : ''}</span>
          <span>Generated {stamp}</span>
        </div>
      </div>
      {sentToast && <div className="dd-noprint" style={{ position: 'fixed', bottom: 24, right: 24, background: 'var(--t-success)', color: '#000', padding: '10px 16px', fontSize: 12, fontWeight: 700, zIndex: 9999 }}>{sentToast}</div>}
    </div>
  )
}
