// Sign.jsx — Twisted Growers e-Sign (Odoo Sign–style). Send documents for signature, sign
// them, and track an auditable trail. Backed by the HR brain (sign_requests table
// via SECURITY DEFINER RPCs) — real, node-scoped, live data with real roster
// recipients, a signature pad, and full status board + drill-downs.
import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useAuth } from '../lib/auth.jsx'
import { useScope } from '../lib/scope.jsx'
import { sb, getSession } from '../lib/supabase'
import WorkBoard from '../components/WorkBoard.jsx'
import DrillDown from '../components/DrillDown.jsx'

const EXEC_RX = /admin|owner|coo|ceo|cfo|president|chief|hr/i

// ── document templates HR can send for signature ──────────────────────
const TEMPLATES = [
  { id: 'direct-deposit',  name: 'Direct Deposit Authorization', fields: ['Bank name', 'Routing #', 'Account #'] },
  { id: 'handbook-ack',    name: 'Employee Handbook Acknowledgment', fields: [] },
  { id: 'i9',              name: 'I-9 Employment Eligibility', fields: [] },
  { id: 'w4',              name: 'W-4 Withholding Certificate', fields: [] },
  { id: 'policy-ack',      name: 'Policy Acknowledgment', fields: [] },
  { id: 'confidentiality', name: 'Confidentiality / NDA', fields: [] },
  { id: 'uniform',         name: 'Uniform & Appearance Agreement', fields: [] },
  { id: 'safety',          name: 'Safety Training Acknowledgment', fields: [] },
  { id: 'pto-policy',      name: 'PTO & Attendance Policy', fields: [] },
]

const COLUMNS = [
  { key: 'draft',     label: 'Draft',     color: 'var(--t-text-muted)' },
  { key: 'sent',      label: 'Sent',      color: 'var(--t-accent)' },
  { key: 'viewed',    label: 'Viewed',    color: 'var(--t-warn)' },
  { key: 'signed',    label: 'Signed',    color: 'var(--t-success)' },
  { key: 'completed', label: 'Completed', color: 'var(--t-success)' },
  { key: 'declined',  label: 'Declined',  color: 'var(--t-danger)' },
]

const fmt = (iso) => iso ? new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'
const daysSince = (iso) => iso ? Math.floor((Date.now() - new Date(iso).getTime()) / 86400000) : 0

// ── styles ───────────────────────────────────────────────────────────
const S = {
  wrap: { padding: '24px 28px', color: 'var(--t-text)', minHeight: '100vh', background: 'var(--t-bg)' },
  kpiRow: { display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 20 },
  kpi: { background: 'var(--t-surface)', border: '1px solid var(--t-line)', borderTop: '3px solid var(--t-accent)', padding: '16px 18px', flex: 1, minWidth: 130, cursor: 'pointer' },
  kpiLabel: { fontSize: 10, fontWeight: 700, letterSpacing: '.1em', color: 'var(--t-text-muted)', textTransform: 'uppercase', marginBottom: 8 },
  kpiVal: { fontSize: 28, fontWeight: 800, lineHeight: 1 },
  btn: { fontSize: 11, fontWeight: 700, padding: '8px 15px', background: 'var(--t-accent)', border: 'none', color: '#fff', borderRadius: 0, cursor: 'pointer', letterSpacing: '.04em' },
  ghost: { fontSize: 11, fontWeight: 600, padding: '7px 13px', background: 'var(--t-surface)', border: '1px solid var(--t-line)', color: 'var(--t-text-muted)', borderRadius: 0, cursor: 'pointer' },
  inp: { fontSize: 12, padding: '8px 10px', background: 'var(--t-surface)', border: '1px solid var(--t-line)', color: 'var(--t-text)', borderRadius: 0, outline: 'none', width: '100%' },
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 9998, display: 'flex', justifyContent: 'center', alignItems: 'flex-start', padding: '40px 20px', overflowY: 'auto' },
  modal: { background: 'var(--t-surface)', border: '1px solid var(--t-line)', width: 'min(560px, 96vw)', borderRadius: 0 },
  modalHead: { padding: '14px 18px', borderBottom: '1px solid var(--t-line)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--t-surface-2)' },
  modalBody: { padding: 18, display: 'flex', flexDirection: 'column', gap: 12 },
  label: { fontSize: 10, fontWeight: 700, letterSpacing: '.08em', color: 'var(--t-text-muted)', textTransform: 'uppercase' },
}

function statusBadge(status) {
  const c = COLUMNS.find(c => c.key === status)
  return <span style={{ fontSize: 9, fontWeight: 800, padding: '3px 8px', background: c?.color || 'var(--t-text-muted)', color: '#fff', letterSpacing: '.05em' }}>{(c?.label || status).toUpperCase()}</span>
}

// ── signature pad (canvas draw + typed fallback) ──────────────────────
function SignaturePad({ onCapture, defaultName }) {
  const canvasRef = useRef(null)
  const drawing = useRef(false)
  const hasInk = useRef(false)
  const [typed, setTyped] = useState(defaultName || '')
  const [mode, setMode] = useState('draw')

  const pos = (e, c) => {
    const r = c.getBoundingClientRect()
    const t = e.touches ? e.touches[0] : e
    return { x: t.clientX - r.left, y: t.clientY - r.top }
  }
  const start = (e) => { drawing.current = true; const c = canvasRef.current; const ctx = c.getContext('2d'); const p = pos(e, c); ctx.beginPath(); ctx.moveTo(p.x, p.y) }
  const move = (e) => {
    if (!drawing.current) return
    e.preventDefault()
    const c = canvasRef.current; const ctx = c.getContext('2d'); const p = pos(e, c)
    ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.strokeStyle = '#111'
    ctx.lineTo(p.x, p.y); ctx.stroke(); hasInk.current = true
  }
  const end = () => { drawing.current = false }
  const clear = () => { const c = canvasRef.current; c.getContext('2d').clearRect(0, 0, c.width, c.height); hasInk.current = false }

  const commit = () => {
    if (mode === 'type') {
      if (!typed.trim()) return
      onCapture({ kind: 'typed', value: typed.trim() })
    } else {
      if (!hasInk.current) return
      onCapture({ kind: 'drawn', value: canvasRef.current.toDataURL('image/png') })
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
        <button onClick={() => setMode('draw')} style={{ ...S.ghost, ...(mode === 'draw' ? { background: 'var(--t-accent)', color: '#fff', borderColor: 'var(--t-accent)' } : {}) }}>Draw</button>
        <button onClick={() => setMode('type')} style={{ ...S.ghost, ...(mode === 'type' ? { background: 'var(--t-accent)', color: '#fff', borderColor: 'var(--t-accent)' } : {}) }}>Type</button>
      </div>
      {mode === 'draw' ? (
        <div>
          <canvas
            ref={canvasRef} width={500} height={140}
            onMouseDown={start} onMouseMove={move} onMouseUp={end} onMouseLeave={end}
            onTouchStart={start} onTouchMove={move} onTouchEnd={end}
            style={{ width: '100%', height: 140, background: '#fff', border: '1px dashed var(--t-line)', borderRadius: 0, touchAction: 'none', cursor: 'crosshair' }}
          />
          <button onClick={clear} style={{ ...S.ghost, marginTop: 6 }}>Clear</button>
        </div>
      ) : (
        <div>
          <input value={typed} onChange={e => setTyped(e.target.value)} placeholder="Type your full legal name" style={{ ...S.inp }} />
          <div style={{ marginTop: 8, padding: '14px 12px', background: '#fff', border: '1px dashed var(--t-line)', fontFamily: 'cursive', fontSize: 26, color: '#111', minHeight: 44 }}>{typed || 'Your signature'}</div>
        </div>
      )}
      <button onClick={commit} style={{ ...S.btn, marginTop: 10, width: '100%' }}>Adopt & Sign</button>
    </div>
  )
}

export default function Sign() {
  const { session } = useAuth()
  const { locationIds } = useScope()
  const person = session?.person || {}
  const role = person.role_name || ''
  const canSend = EXEC_RX.test(role)

  const [requests, setRequests] = useState([])
  const [roster, setRoster] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [toast, setToast] = useState(null)
  const [drill, setDrill] = useState(null)
  const [detail, setDetail] = useState(null)      // request open in signer/detail modal
  const [composeOpen, setComposeOpen] = useState(false)

  const showToast = (m) => { setToast(m); setTimeout(() => setToast(null), 2600) }

  // ── load requests (node-scoped OR addressed to me) ──
  const loadRequests = useCallback(async () => {
    setLoadError('')
    const nodeIds = (locationIds || []).filter(Boolean)
    const signerId = person.id || getSession().id || null
    if (!nodeIds.length && !signerId) { setRequests([]); setLoading(false); return }
    const { data, error } = await sb.rpc('get_sign_requests', {
      p_node_ids: nodeIds.length ? nodeIds : null,
      p_signer_id: signerId,
    })
    if (error) { setLoadError(error.message || 'Unable to load signature requests.'); setRequests([]); setLoading(false); return }
    setRequests(Array.isArray(data) ? data : [])
    setLoading(false)
  }, [JSON.stringify(locationIds), person.id])

  useEffect(() => { loadRequests() }, [loadRequests])

  useEffect(() => {
    sb.rpc('get_roster', { p_node_ids: locationIds, p_actor: person.id || null })
      .then(({ data }) => { if (Array.isArray(data)) setRoster(data.filter(p => p.id)) })
      .catch(() => {})
  }, [JSON.stringify(locationIds), person.id])

  // keep the open detail modal in sync with freshly loaded rows
  useEffect(() => { setDetail(d => (d ? requests.find(r => r.id === d.id) || null : d)) }, [requests])

  // ── mutations (all real writes → refresh) ──
  const setStatus = useCallback(async (id, toCol) => {
    const { data, error } = await sb.rpc('set_sign_request_status', {
      p_id: id, p_status: toCol,
      p_actor_id: person.id || null, p_actor_name: person.full_name || null,
    })
    if (error || !data?.ok) { showToast(error?.message || 'Update failed'); return false }
    await loadRequests()
    return true
  }, [person.id, person.full_name, loadRequests])

  const move = useCallback((id, toCol) => { setStatus(id, toCol) }, [setStatus])

  const markViewed = useCallback((r) => {
    if (r.status !== 'sent') return
    setStatus(r.id, 'viewed')
  }, [setStatus])

  const applySignature = useCallback(async (r, sig) => {
    const { data, error } = await sb.rpc('apply_sign_signature', {
      p_id: r.id, p_signature: sig.value, p_kind: sig.kind,
      p_actor_id: person.id || null, p_actor_name: person.full_name || null,
    })
    if (error || !data?.ok) { showToast(error?.message || 'Could not save signature'); return }
    showToast('Signature adopted')
    await loadRequests()
  }, [person.id, person.full_name, loadRequests])

  const decline = useCallback(async (r) => {
    if (await setStatus(r.id, 'declined')) { showToast('Declined to sign'); setDetail(null) }
  }, [setStatus])

  const completeReq = useCallback(async (r) => {
    if (await setStatus(r.id, 'completed')) { showToast('Marked completed'); setDetail(null) }
  }, [setStatus])

  const sendRequests = useCallback(async (templateId, recipientIds) => {
    const tmpl = TEMPLATES.find(t => t.id === templateId)
    const { data, error } = await sb.rpc('create_sign_requests', {
      p_template_id: templateId,
      p_template_name: tmpl?.name || templateId,
      p_recipient_ids: recipientIds,
      p_node_ids: (locationIds || []).filter(Boolean),
      p_fields: tmpl?.fields || [],
      p_actor_id: person.id || null,
      p_actor_name: person.full_name || 'HR',
    })
    if (error || !data?.ok) { showToast(error?.message || 'Could not send documents'); return }
    setComposeOpen(false)
    showToast(`Sent to ${data.count || recipientIds.length} recipient${(data.count || recipientIds.length) === 1 ? '' : 's'}`)
    await loadRequests()
  }, [JSON.stringify(locationIds), person.id, person.full_name, loadRequests])

  // ── KPIs ──
  const kpis = useMemo(() => {
    const awaiting = requests.filter(r => ['sent', 'viewed'].includes(r.status))
    const overdue = awaiting.filter(r => daysSince(r.sent_at) > 7)
    const signedToday = requests.filter(r => r.signed_at && daysSince(r.signed_at) === 0)
    const done = requests.filter(r => ['signed', 'completed'].includes(r.status))
    const rate = requests.length ? Math.round((done.length / requests.length) * 100) : 0
    return { total: requests.length, awaiting, overdue, signedToday, done, rate }
  }, [requests])

  const drillCols = [
    { key: 'signer_name', label: 'Signer' },
    { key: 'template_name', label: 'Document' },
    { key: 'node_name', label: 'Location' },
    { key: 'status', label: 'Status', render: r => (COLUMNS.find(c => c.key === r.status)?.label || r.status) },
    { key: 'sent_at', label: 'Sent', render: r => fmt(r.sent_at) },
    { key: 'signed_at', label: 'Signed', render: r => fmt(r.signed_at) },
  ]
  const openDrill = (title, rows) => setDrill({ title, rows })

  return (
    <div style={S.wrap}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 800, letterSpacing: '.05em', margin: 0, textTransform: 'uppercase' }}>e-Sign</h1>
          <div style={{ fontSize: 11, color: 'var(--t-text-muted)', marginTop: 3 }}>Send, sign, and audit documents — every signature time-stamped and attributed.</div>
        </div>
        {canSend && <button style={S.btn} onClick={() => setComposeOpen(true)}>+ Send for Signature</button>}
      </div>

      {/* KPI tiles — all drillable */}
      <div style={S.kpiRow}>
        <div style={S.kpi} onClick={() => openDrill('All Requests', requests)}>
          <div style={S.kpiLabel}>Total Requests</div><div style={S.kpiVal}>{kpis.total}</div>
        </div>
        <div style={{ ...S.kpi, borderTopColor: 'var(--t-accent)' }} onClick={() => openDrill('Awaiting Signature', kpis.awaiting)}>
          <div style={S.kpiLabel}>Awaiting Signature</div><div style={S.kpiVal}>{kpis.awaiting.length}</div>
        </div>
        <div style={{ ...S.kpi, borderTopColor: 'var(--t-warn)' }} onClick={() => openDrill('Overdue (>7 days)', kpis.overdue)}>
          <div style={S.kpiLabel}>Overdue</div><div style={{ ...S.kpiVal, color: kpis.overdue.length ? 'var(--t-warn)' : 'var(--t-text)' }}>{kpis.overdue.length}</div>
        </div>
        <div style={{ ...S.kpi, borderTopColor: 'var(--t-success)' }} onClick={() => openDrill('Signed Today', kpis.signedToday)}>
          <div style={S.kpiLabel}>Signed Today</div><div style={S.kpiVal}>{kpis.signedToday.length}</div>
        </div>
        <div style={{ ...S.kpi, borderTopColor: 'var(--t-success)' }} onClick={() => openDrill('Signed / Completed', kpis.done)}>
          <div style={S.kpiLabel}>Completion Rate</div><div style={S.kpiVal}>{kpis.rate}%</div>
        </div>
      </div>

      {loadError ? (
        <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-danger)', padding: '16px 18px', color: 'var(--t-danger)', fontSize: 13 }}>
          {loadError} <button onClick={() => { setLoading(true); loadRequests() }} style={{ ...S.ghost, marginLeft: 10, color: 'var(--t-text)' }}>Retry</button>
        </div>
      ) : loading ? (
        <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', padding: '28px 18px', textAlign: 'center', color: 'var(--t-text-muted)', fontSize: 13 }}>Loading signature requests…</div>
      ) : requests.length === 0 ? (
        <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', padding: '40px 18px', textAlign: 'center', color: 'var(--t-text-muted)', fontSize: 13 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--t-text)' }}>No signature requests yet</div>
          <div style={{ marginTop: 6 }}>{canSend ? 'Use “+ Send for Signature” to send a document, and it will appear here.' : 'Documents sent to you for signature will appear here.'}</div>
        </div>
      ) : (
      <WorkBoard
        columns={COLUMNS}
        items={requests}
        getGroup={r => r.status}
        onMove={canSend ? move : undefined}
        onOpen={r => { markViewed(r); setDetail(r) }}
        getSearchText={r => `${r.signer_name} ${r.template_name} ${r.node_name}`}
        tableColumns={[
          { key: 'signer', label: 'Signer', render: r => <span style={{ fontWeight: 600 }}>{r.signer_name}</span> },
          { key: 'doc', label: 'Document', render: r => r.template_name },
          { key: 'loc', label: 'Location', render: r => r.node_name },
          { key: 'status', label: 'Status', render: r => statusBadge(r.status) },
          { key: 'sent', label: 'Sent', render: r => fmt(r.sent_at) },
          { key: 'signed', label: 'Signed', render: r => fmt(r.signed_at) },
        ]}
        renderCard={r => (
          <div>
            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>{r.signer_name}</div>
            <div style={{ fontSize: 11, color: 'var(--t-text-muted)', marginBottom: 6 }}>{r.template_name}</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 10, color: 'var(--t-text-faint)' }}>{r.node_name}</span>
              {['sent', 'viewed'].includes(r.status) && daysSince(r.sent_at) > 7 && (
                <span style={{ fontSize: 9, fontWeight: 800, color: 'var(--t-warn)' }}>OVERDUE {daysSince(r.sent_at)}d</span>
              )}
            </div>
          </div>
        )}
      />
      )}

      {/* detail / signer modal */}
      {detail && (
        <div style={S.overlay} onClick={() => setDetail(null)}>
          <div style={S.modal} onClick={e => e.stopPropagation()}>
            <div style={S.modalHead}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 800 }}>{detail.template_name}</div>
                <div style={{ fontSize: 11, color: 'var(--t-text-muted)', marginTop: 2 }}>{detail.signer_name} · {detail.node_name}</div>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                {statusBadge(detail.status)}
                <button onClick={() => setDetail(null)} style={{ background: 'transparent', border: 'none', color: 'var(--t-text-muted)', fontSize: 22, cursor: 'pointer' }}>×</button>
              </div>
            </div>
            <div style={S.modalBody}>
              {/* document body (summary) */}
              <div style={{ padding: '14px 16px', background: 'var(--t-surface-2)', border: '1px solid var(--t-line)', fontSize: 12, color: 'var(--t-text-med, var(--t-text))', lineHeight: 1.6 }}>
                This document, <strong>{detail.template_name}</strong>, is presented to <strong>{detail.signer_name}</strong> for electronic signature.
                By adopting a signature below, the signer agrees this constitutes a legally binding electronic signature under the U.S. E-SIGN Act.
              </div>

              {/* signature area */}
              {['sent', 'viewed'].includes(detail.status) ? (
                <div>
                  <div style={S.label}>Adopt your signature</div>
                  <div style={{ marginTop: 8 }}>
                    <SignaturePad defaultName={detail.signer_name} onCapture={sig => applySignature(detail, sig)} />
                  </div>
                  <button onClick={() => decline(detail)} style={{ ...S.ghost, marginTop: 10, color: 'var(--t-danger)', borderColor: 'var(--t-danger)' }}>Decline to sign</button>
                </div>
              ) : ['signed', 'completed'].includes(detail.status) ? (
                <div>
                  <div style={S.label}>Signature</div>
                  <div style={{ marginTop: 8, padding: 12, background: '#fff', border: '1px solid var(--t-line)' }}>
                    {detail.signature_kind === 'drawn' && detail.signature?.startsWith('data:')
                      ? <img src={detail.signature} alt="signature" style={{ maxHeight: 80 }} />
                      : <span style={{ fontFamily: 'cursive', fontSize: 26, color: '#111' }}>{detail.signature || detail.signer_name}</span>}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--t-success)', marginTop: 6 }}>✓ Signed by {detail.signer_name} · {fmt(detail.signed_at)}</div>
                  {canSend && detail.status === 'signed' && (
                    <button onClick={() => completeReq(detail)} style={{ ...S.btn, marginTop: 10 }}>Mark Completed</button>
                  )}
                </div>
              ) : (
                <div style={{ fontSize: 12, color: 'var(--t-text-muted)' }}>This request is in <strong>{detail.status}</strong> state.</div>
              )}

              {/* audit trail */}
              <div>
                <div style={S.label}>Audit Trail</div>
                <div style={{ marginTop: 8, borderLeft: '2px solid var(--t-line)', paddingLeft: 12 }}>
                  {(detail.audit || []).map((a, i) => (
                    <div key={i} style={{ fontSize: 11, color: 'var(--t-text-muted)', marginBottom: 6 }}>
                      <span style={{ fontWeight: 700, color: 'var(--t-text)' }}>{a.event}</span> — {a.by} · {fmt(a.at)}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* compose / send modal */}
      {composeOpen && (
        <ComposeModal roster={roster} onClose={() => setComposeOpen(false)} onSend={sendRequests} />
      )}

      <DrillDown
        open={!!drill}
        onClose={() => setDrill(null)}
        title={drill?.title || ''}
        subtitle="e-Sign requests"
        columns={drillCols}
        rows={drill?.rows || []}
      />

      {toast && <div style={{ position: 'fixed', bottom: 24, right: 24, background: 'var(--t-success)', color: '#04121a', padding: '10px 18px', fontWeight: 700, fontSize: 13, zIndex: 9999, boxShadow: '0 4px 20px rgba(0,0,0,0.4)' }}>{toast}</div>}
    </div>
  )
}

function ComposeModal({ roster, onClose, onSend }) {
  const [tmpl, setTmpl] = useState(TEMPLATES[0].id)
  const [sel, setSel] = useState([])
  const [q, setQ] = useState('')
  const filtered = roster.filter(p => !q || (p.full_name || '').toLowerCase().includes(q.toLowerCase()))
  const toggle = (id) => setSel(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id])
  const allShownIds = filtered.map(p => p.id)
  const allSelected = allShownIds.length > 0 && allShownIds.every(id => sel.includes(id))

  return (
    <div style={S.overlay} onClick={onClose}>
      <div style={S.modal} onClick={e => e.stopPropagation()}>
        <div style={S.modalHead}>
          <div style={{ fontSize: 14, fontWeight: 800 }}>Send Document for Signature</div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--t-text-muted)', fontSize: 22, cursor: 'pointer' }}>×</button>
        </div>
        <div style={S.modalBody}>
          <div>
            <div style={S.label}>Document Template</div>
            <select value={tmpl} onChange={e => setTmpl(e.target.value)} style={{ ...S.inp, marginTop: 6 }}>
              {TEMPLATES.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={S.label}>Recipients ({sel.length} selected)</div>
              <button style={S.ghost} onClick={() => setSel(allSelected ? [] : allShownIds)}>{allSelected ? 'Clear' : 'Select all'}</button>
            </div>
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search employees…" style={{ ...S.inp, marginTop: 6 }} />
            <div style={{ maxHeight: 240, overflowY: 'auto', border: '1px solid var(--t-line)', marginTop: 6 }}>
              {filtered.length === 0 && <div style={{ padding: 12, fontSize: 12, color: 'var(--t-text-faint)' }}>No employees loaded.</div>}
              {filtered.map(p => (
                <label key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderBottom: '1px solid var(--t-line)', cursor: 'pointer' }}>
                  <input type="checkbox" checked={sel.includes(p.id)} onChange={() => toggle(p.id)} />
                  <span style={{ fontSize: 12, fontWeight: 600 }}>{p.full_name}</span>
                  <span style={{ fontSize: 11, color: 'var(--t-text-muted)', marginLeft: 'auto' }}>{p.node_name || ''}</span>
                </label>
              ))}
            </div>
          </div>
          <button
            disabled={sel.length === 0}
            onClick={() => onSend(tmpl, sel)}
            style={{ ...S.btn, opacity: sel.length === 0 ? 0.5 : 1, cursor: sel.length === 0 ? 'not-allowed' : 'pointer' }}
          >
            Send to {sel.length || 0} recipient{sel.length === 1 ? '' : 's'}
          </button>
        </div>
      </div>
    </div>
  )
}
