import { useState, useEffect, useCallback, useMemo } from 'react'
import { sb } from '../lib/supabase'
import { useAuth } from '../lib/auth.jsx'
import { useScope } from '../lib/scope.jsx'

// ── Deterministic seed ──────────────────────────────────────────────────────

// ── Constants ───────────────────────────────────────────────────────────────
const CATEGORIES = ['All', 'Policies', 'Forms', 'Compliance', 'Tax Forms', 'Training', 'HR Records', 'Personal']

const CAT_BADGE = {
  'Policies':    'blue',
  'Forms':       'accent',
  'Compliance':  'red',
  'Tax Forms':   'success',
  'Training':    'green',
  'HR Records':  'purple',
  'Personal':    'muted',
}

// ── Mock document data keyed by employee seed ────────────────────────────────
const today = new Date()
function daysAgo(n) {
  const d = new Date(today); d.setDate(d.getDate() - n); return d.toISOString().split('T')[0]
}
function daysFuture(n) {
  const d = new Date(today); d.setDate(d.getDate() + n); return d.toISOString().split('T')[0]
}
function isoToday() { return new Date().toISOString().split('T')[0] }

function buildMyDocs() { return [] }  // no seeded rows — real records only (get_my_documents)

// ── HR record items ──────────────────────────────────────────────────────────
function buildHRRecords() { return [] }  // no seeded rows — real records only (get_my_documents)

// ── Policy acknowledgment timeline ───────────────────────────────────────────
function buildPolicies() { return [] }  // no seeded rows — real records only (get_my_documents)

// ── Helpers ──────────────────────────────────────────────────────────────────
function fmtDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function daysFromNow(iso) {
  if (!iso) return null
  return Math.ceil((new Date(iso) - today) / 86400000)
}

// ── Shared styles ─────────────────────────────────────────────────────────────
const SL = {
  label: {
    display: 'block', fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
    letterSpacing: '.08em', color: 'var(--t-text-muted)', marginBottom: 5,
  },
  input: {
    padding: '8px 12px', border: '1px solid var(--t-line)',
    background: 'var(--t-surface-2)', color: 'var(--t-text)',
    fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box',
  },
  select: {
    padding: '8px 12px', border: '1px solid var(--t-line)',
    background: 'var(--t-surface-2)', color: 'var(--t-text)',
    fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box', cursor: 'pointer',
  },
}

// ── KPI Tile ─────────────────────────────────────────────────────────────────
function KTile({ label, value, sub, color, alert: alertLevel }) {
  return (
    <div style={{
      background: 'var(--t-surface)',
      border: `1px solid ${alertLevel === 'red' ? 'var(--t-danger)' : alertLevel === 'amber' ? 'var(--t-warn)' : 'var(--t-line)'}`,
      padding: '14px 16px', position: 'relative', overflow: 'hidden',
      flex: '1 1 130px', minWidth: 0,
    }}>
      {alertLevel === 'red' && <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'var(--t-danger)' }} />}
      {alertLevel === 'amber' && <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'var(--t-warn)' }} />}
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.08em', color: 'var(--t-text-muted)', textTransform: 'uppercase', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800, color: color || 'var(--t-text)', lineHeight: 1, marginBottom: 4 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--t-text-faint)' }}>{sub}</div>}
    </div>
  )
}

// ── Badge ─────────────────────────────────────────────────────────────────────
function Badge({ cls, children }) {
  return <span className={`badge ${cls}`} style={{ whiteSpace: 'nowrap' }}>{children}</span>
}

// ── Tab bar ──────────────────────────────────────────────────────────────────
function TabBar({ tabs, active, onChange }) {
  return (
    <div style={{ display: 'flex', borderBottom: '1px solid var(--t-line)', marginBottom: 24 }}>
      {tabs.map((t, i) => (
        <button key={t} onClick={() => onChange(i)} style={{
          background: 'transparent', border: 'none',
          borderBottom: active === i ? '2px solid var(--t-accent)' : '2px solid transparent',
          color: active === i ? 'var(--t-text)' : 'var(--t-text-muted)',
          fontWeight: active === i ? 700 : 500, fontSize: 13,
          padding: '10px 18px', cursor: 'pointer', transition: 'color .15s, border-color .15s', whiteSpace: 'nowrap',
        }}>{t}</button>
      ))}
    </div>
  )
}

// ── Document viewer modal ─────────────────────────────────────────────────────
function DocViewer({ doc, onClose, onSign }) {
  const [signed, setSigned] = useState(doc.status === 'Signed')
  const [signing, setSigning] = useState(false)
  const [confirmed, setConfirmed] = useState(false)

  function handleSign() {
    setSigning(true)
    setTimeout(() => {
      setSigned(true)
      setSigning(false)
      setConfirmed(true)
      onSign(doc.id)
    }, 900)
  }

  const needsAction = doc.status === 'Pending' && !signed

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.8)', zIndex: 9000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', width: '100%', maxWidth: 680, maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--t-line)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--t-text)' }}>{doc.title}</div>
            <div style={{ fontSize: 11, color: 'var(--t-text-muted)', marginTop: 3 }}>
              Issued by {doc.issuedBy} · Received {fmtDate(doc.receivedDate)}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {signed
              ? <Badge cls="success">Signed {fmtDate(doc.sigDate || isoToday())}</Badge>
              : <Badge cls="warn">Pending Signature</Badge>}
            <button className="action-btn-sm" onClick={onClose}>Close</button>
          </div>
        </div>

        {/* Document content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px' }}>
          <div style={{
            background: 'var(--t-surface-2)', border: '1px solid var(--t-line)',
            padding: '24px 28px', lineHeight: 1.8, fontSize: 14,
            color: 'var(--t-text)', minHeight: 200,
          }}>
            <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--t-text)', marginBottom: 16, borderBottom: '1px solid var(--t-line)', paddingBottom: 12 }}>
              {doc.title}
            </div>
            <div style={{ color: 'var(--t-text-muted)', marginBottom: 16, fontSize: 13 }}>
              <strong>Issued by:</strong> {doc.issuedBy} &nbsp;·&nbsp; <strong>Date:</strong> {fmtDate(doc.receivedDate)}
              {doc.dueDate && <span> &nbsp;·&nbsp; <strong>Acknowledgment Due:</strong> {fmtDate(doc.dueDate)}</span>}
            </div>
            <p style={{ color: 'var(--t-text)', marginBottom: 16 }}>{doc.content}</p>
            <p style={{ color: 'var(--t-text-muted)', fontSize: 13 }}>
              By signing below, you confirm that you have read, understand, and agree to comply with the above policy or information. Your signature is being recorded electronically and is legally binding.
            </p>
          </div>

          {/* Signature area */}
          {needsAction && !confirmed && (
            <div style={{ marginTop: 20, background: 'rgba(0,229,255,.04)', border: '1px solid var(--t-accent)', padding: 20 }}>
              <div style={{ fontSize: 12, color: 'var(--t-text-muted)', marginBottom: 14, lineHeight: 1.6 }}>
                By clicking "Sign & Acknowledge," you confirm that you have read and understood the above document. This constitutes your electronic signature.
              </div>
              <button className="btn" onClick={handleSign} disabled={signing} style={{ opacity: signing ? 0.6 : 1 }}>
                {signing ? 'Signing…' : 'Sign & Acknowledge'}
              </button>
            </div>
          )}

          {confirmed && (
            <div style={{ marginTop: 20, background: 'rgba(29,233,182,.06)', border: '1px solid var(--t-success)', padding: 20, display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 20, color: 'var(--t-success)' }}>✓</span>
              <div>
                <div style={{ fontWeight: 700, color: 'var(--t-success)', fontSize: 14 }}>Signed & Acknowledged</div>
                <div style={{ fontSize: 12, color: 'var(--t-text-muted)', marginTop: 2 }}>Your signature was recorded on {fmtDate(isoToday())}.</div>
              </div>
            </div>
          )}

          {signed && !needsAction && !confirmed && (
            <div style={{ marginTop: 20, background: 'rgba(29,233,182,.06)', border: '1px solid var(--t-success)', padding: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ color: 'var(--t-success)' }}>✓</span>
              <span style={{ fontSize: 13, color: 'var(--t-success)', fontWeight: 600 }}>You signed this document on {fmtDate(doc.sigDate)}.</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// TAB 1 — MY DOCUMENTS
// ════════════════════════════════════════════════════════════════════════════
function MyDocuments({ docs, setDocs, personSeed }) {
  const [catFilter, setCatFilter]   = useState('All')
  const [search, setSearch]         = useState('')
  const [viewDoc, setViewDoc]       = useState(null)
  const [toast, setToast]           = useState(null)

  function showToast(msg, type = 'success') {
    setToast({ msg, type }); setTimeout(() => setToast(null), 3500)
  }

  function handleSign(docId) {
    setDocs(prev => prev.map(d => d.id === docId ? { ...d, status: 'Signed', sigDate: isoToday() } : d))
    showToast('Document signed and acknowledged.')
  }

  const pending    = useMemo(() => docs.filter(d => d.status === 'Pending'), [docs])
  const recentDays = 14
  const recent     = useMemo(() => docs.filter(d => d.receivedDate && d.receivedDate >= daysAgo(recentDays)), [docs])
  const overdue    = useMemo(() => pending.filter(d => d.dueDate && d.dueDate < isoToday()), [pending])

  const filtered = useMemo(() => {
    return docs.filter(d => {
      if (catFilter !== 'All' && d.category !== catFilter) return false
      if (search.trim() && !d.title.toLowerCase().includes(search.toLowerCase())) return false
      return true
    })
  }, [docs, catFilter, search])

  const kpis = useMemo(() => {
    const signed = docs.filter(d => d.status === 'Signed').length
    const readPct = docs.length ? Math.round((signed / docs.length) * 100) : 0
    const lastNew = docs.reduce((max, d) => d.receivedDate > max ? d.receivedDate : max, '')
    const daysSinceLast = lastNew ? Math.ceil((today - new Date(lastNew)) / 86400000) : null
    return { total: docs.length, readPct, pendingCount: pending.length, signed, daysSinceLast }
  }, [docs, pending])

  function DocCard({ doc, section }) {
    const isOverdue = doc.dueDate && doc.dueDate < isoToday() && doc.status === 'Pending'
    const daysLeft = doc.dueDate ? daysFromNow(doc.dueDate) : null
    return (
      <div style={{
        background: 'var(--t-surface)', border: `1px solid ${isOverdue ? 'var(--t-danger)' : doc.status === 'Pending' ? 'var(--t-warn)' : 'var(--t-line)'}`,
        padding: 16, position: 'relative', cursor: 'pointer',
        transition: 'border-color .15s',
      }} onClick={() => setViewDoc(doc)}>
        {isOverdue && <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'var(--t-danger)' }} />}
        {!isOverdue && doc.status === 'Pending' && <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'var(--t-warn)' }} />}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginBottom: 8 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--t-text)', lineHeight: 1.4 }}>{doc.title}</div>
            <div style={{ fontSize: 11, color: 'var(--t-text-faint)', marginTop: 3 }}>From {doc.issuedBy} · {fmtDate(doc.receivedDate)}</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 5, flexShrink: 0 }}>
            <Badge cls={doc.status === 'Signed' ? 'success' : isOverdue ? 'red' : 'warn'}>
              {doc.status === 'Signed' ? 'Signed' : isOverdue ? 'Overdue' : 'Pending'}
            </Badge>
            <Badge cls={CAT_BADGE[doc.category] || 'muted'}>{doc.category}</Badge>
          </div>
        </div>
        {doc.dueDate && doc.status === 'Pending' && (
          <div style={{ fontSize: 11, color: isOverdue ? 'var(--t-danger)' : daysLeft !== null && daysLeft <= 7 ? 'var(--t-warn)' : 'var(--t-text-muted)', fontWeight: 600 }}>
            {isOverdue ? `Overdue by ${Math.abs(daysLeft)} day(s)` : `Due in ${daysLeft} day(s) — ${fmtDate(doc.dueDate)}`}
          </div>
        )}
        <div style={{ marginTop: 10, display: 'flex', gap: 6 }}>
          <button className="action-btn-sm" onClick={e => { e.stopPropagation(); setViewDoc(doc) }}>
            {doc.status === 'Pending' ? 'Review & Sign' : 'View'}
          </button>
          {doc.status === 'Pending' && (
            <button className="action-btn-sm" style={{ color: 'var(--t-accent)', borderColor: 'var(--t-accent)' }}
              onClick={e => { e.stopPropagation(); setViewDoc(doc) }}>
              Sign Now
            </button>
          )}
        </div>
      </div>
    )
  }

  return (
    <>
      {/* KPIs */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 20 }}>
        <KTile label="Total Assigned"  value={kpis.total}        color="var(--t-accent)" />
        <KTile label="Read %"          value={`${kpis.readPct}%`} color={kpis.readPct >= 80 ? 'var(--t-success)' : 'var(--t-warn)'} />
        <KTile label="Pending Signatures" value={kpis.pendingCount}
          alert={kpis.pendingCount > 0 ? (overdue.length > 0 ? 'red' : 'amber') : undefined}
          color={kpis.pendingCount > 0 ? (overdue.length > 0 ? 'var(--t-danger)' : 'var(--t-warn)') : 'var(--t-success)'}
          sub={overdue.length > 0 ? `${overdue.length} overdue` : undefined} />
        <KTile label="Signed"          value={kpis.signed}       color="var(--t-success)" />
        <KTile label="Days Since Last New" value={kpis.daysSinceLast ?? '—'} color="var(--t-text-muted)" />
      </div>

      {/* Action Required section */}
      {pending.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--t-text)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
            Action Required
            <Badge cls={overdue.length > 0 ? 'red' : 'warn'}>{pending.length}</Badge>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 }}>
            {pending.map(doc => <DocCard key={doc.id} doc={doc} section="pending" />)}
          </div>
        </div>
      )}

      {/* Recently Added */}
      {recent.filter(d => d.status !== 'Pending').length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--t-text)', marginBottom: 12 }}>Recently Added (14 days)</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 }}>
            {recent.filter(d => d.status !== 'Pending').map(doc => <DocCard key={doc.id} doc={doc} />)}
          </div>
        </div>
      )}

      {/* All documents */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--t-text)' }}>All My Documents</div>
          <div style={{ display: 'flex', gap: 10 }}>
            <input type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search…"
              style={{ ...SL.input, width: 180, padding: '6px 10px', fontSize: 12 }} />
            <select value={catFilter} onChange={e => setCatFilter(e.target.value)}
              style={{ ...SL.select, width: 150, padding: '6px 10px', fontSize: 12 }}>
              {CATEGORIES.map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
        </div>
        <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'var(--t-surface-2)' }}>
                  {['Title', 'Category', 'Received', 'Due Date', 'Status', 'Actions'].map(h => (
                    <th key={h} style={{ padding: '9px 12px', textAlign: 'left', fontWeight: 700, fontSize: 10, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--t-text-muted)', borderBottom: '1px solid var(--t-line)', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0
                  ? <tr><td colSpan={6} style={{ padding: 32, textAlign: 'center', color: 'var(--t-text-muted)' }}>No documents match.</td></tr>
                  : filtered.map((doc, i) => {
                    const isOverdue = doc.dueDate && doc.dueDate < isoToday() && doc.status === 'Pending'
                    return (
                      <tr key={doc.id} style={{ borderBottom: '1px solid var(--t-line)', background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,.015)', cursor: 'pointer' }}
                        onClick={() => setViewDoc(doc)}>
                        <td style={{ padding: '9px 12px', fontWeight: 500, color: 'var(--t-text)', maxWidth: 240 }}>
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }} title={doc.title}>{doc.title}</span>
                          <span style={{ fontSize: 11, color: 'var(--t-text-faint)' }}>{doc.issuedBy}</span>
                        </td>
                        <td style={{ padding: '9px 12px', whiteSpace: 'nowrap' }}>
                          <Badge cls={CAT_BADGE[doc.category] || 'muted'}>{doc.category}</Badge>
                        </td>
                        <td style={{ padding: '9px 12px', color: 'var(--t-text-muted)', fontSize: 12, whiteSpace: 'nowrap' }}>{fmtDate(doc.receivedDate)}</td>
                        <td style={{ padding: '9px 12px', fontSize: 12, whiteSpace: 'nowrap', color: isOverdue ? 'var(--t-danger)' : 'var(--t-text-muted)', fontWeight: isOverdue ? 700 : 400 }}>
                          {doc.dueDate ? fmtDate(doc.dueDate) : '—'}
                        </td>
                        <td style={{ padding: '9px 12px', whiteSpace: 'nowrap' }}>
                          <Badge cls={doc.status === 'Signed' ? 'success' : isOverdue ? 'red' : 'warn'}>
                            {doc.status === 'Signed' ? 'Signed' : isOverdue ? 'Overdue' : 'Pending'}
                          </Badge>
                        </td>
                        <td style={{ padding: '9px 12px', whiteSpace: 'nowrap' }} onClick={e => e.stopPropagation()}>
                          <button className="action-btn-sm" onClick={() => setViewDoc(doc)}>
                            {doc.status === 'Pending' ? 'Sign' : 'View'}
                          </button>
                        </td>
                      </tr>
                    )
                  })}
              </tbody>
            </table>
          </div>
          <div style={{ padding: '8px 14px', borderTop: '1px solid var(--t-line)', fontSize: 11, color: 'var(--t-text-muted)' }}>
            {filtered.length} of {docs.length} documents
          </div>
        </div>
      </div>

      {/* Doc viewer */}
      {viewDoc && (
        <DocViewer
          doc={viewDoc}
          onClose={() => setViewDoc(null)}
          onSign={handleSign}
        />
      )}

      {/* Toast */}
      {toast && (
        <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 9999, background: 'var(--t-success)', color: '#fff', padding: '12px 20px', fontWeight: 600, fontSize: 13, boxShadow: '0 8px 32px rgba(0,0,0,.4)' }}>{toast.msg}</div>
      )}
    </>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// TAB 2 — MY HR RECORDS
// ════════════════════════════════════════════════════════════════════════════
function MyHRRecords({ fullName }) {
  const records = useMemo(() => buildHRRecords(fullName), [fullName])
  const [requestModal, setRequestModal] = useState(null)
  const [toast, setToast]               = useState(null)

  function showToast(msg) { setToast(msg); setTimeout(() => setToast(null), 3000) }

  function handleDownload(rec) {
    showToast(`Downloading ${rec.type}…`)
  }

  function handleRequest(rec) {
    setRequestModal(rec)
  }

  function submitRequest() {
    showToast(`Copy request submitted for ${requestModal.type}. HR will respond within 2 business days.`)
    setRequestModal(null)
  }

  const statusColor = {
    'Signed': 'success', 'Current': 'success', 'Verified': 'success',
    'Active': 'success', 'Available': 'blue', 'On File': 'muted',
  }

  // Group records by type
  const groups = useMemo(() => {
    const paystubs = records.filter(r => r.type.startsWith('Pay Stub'))
    const other    = records.filter(r => !r.type.startsWith('Pay Stub'))
    return { paystubs, other }
  }, [records])

  return (
    <>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 20 }}>
        <KTile label="Documents on File" value={records.length}                         color="var(--t-accent)" />
        <KTile label="Pay Stubs"         value={groups.paystubs.length}                  color="var(--t-text)" />
        <KTile label="I-9 Status"        value="Verified"                                color="var(--t-success)" />
        <KTile label="Active Records"    value={records.filter(r => r.status === 'Current' || r.status === 'Active' || r.status === 'Verified').length} color="var(--t-text-muted)" />
      </div>

      {/* Core HR records */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--t-text)', marginBottom: 12 }}>Core HR Records</div>
        <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'var(--t-surface-2)' }}>
                {['Document', 'Description', 'Date', 'Status', 'Actions'].map(h => (
                  <th key={h} style={{ padding: '9px 14px', textAlign: 'left', fontWeight: 700, fontSize: 10, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--t-text-muted)', borderBottom: '1px solid var(--t-line)', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {groups.other.map((rec, i) => (
                <tr key={rec.id} style={{ borderBottom: '1px solid var(--t-line)', background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,.015)' }}>
                  <td style={{ padding: '10px 14px', fontWeight: 600, color: 'var(--t-text)', whiteSpace: 'nowrap' }}>{rec.type}</td>
                  <td style={{ padding: '10px 14px', color: 'var(--t-text-muted)', fontSize: 12 }}>{rec.desc}</td>
                  <td style={{ padding: '10px 14px', color: 'var(--t-text-muted)', fontSize: 12, whiteSpace: 'nowrap' }}>{fmtDate(rec.date)}</td>
                  <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                    <Badge cls={statusColor[rec.status] || 'muted'}>{rec.status}</Badge>
                  </td>
                  <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {rec.downloadable && (
                        <button className="action-btn-sm" onClick={() => handleDownload(rec)}>Download</button>
                      )}
                      {rec.updateLink && (
                        <button className="action-btn-sm" style={{ color: 'var(--t-accent)', borderColor: 'var(--t-accent)' }} onClick={() => alert(`Opening ${rec.type} update form…`)}>Update</button>
                      )}
                      <button className="action-btn-sm" onClick={() => handleRequest(rec)} style={{ color: 'var(--t-text-muted)' }}>Request Copy</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pay stubs */}
      <div>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--t-text)', marginBottom: 12 }}>Pay Stubs (Last 6)</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 10 }}>
          {groups.paystubs.map(rec => (
            <div key={rec.id} style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', padding: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--t-text)' }}>{rec.type}</div>
                <div style={{ fontSize: 11, color: 'var(--t-text-faint)', marginTop: 2 }}>{fmtDate(rec.date)}</div>
              </div>
              <button className="action-btn-sm" onClick={() => handleDownload(rec)}>Download</button>
            </div>
          ))}
        </div>
      </div>

      {/* Request copy modal */}
      {requestModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)', zIndex: 9000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', padding: 32, maxWidth: 400, width: '90%' }}>
            <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--t-text)', marginBottom: 6 }}>Request Document Copy</div>
            <div style={{ fontSize: 13, color: 'var(--t-text-muted)', marginBottom: 20, lineHeight: 1.6 }}>
              Request a copy of <strong style={{ color: 'var(--t-text)' }}>{requestModal.type}</strong>. HR will send it to your registered email within 2 business days.
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={SL.label}>Reason (optional)</label>
              <textarea placeholder="Why do you need this copy?" rows={3} style={{ ...SL.input, resize: 'vertical', lineHeight: 1.5 }} />
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="action-btn-sm" onClick={() => setRequestModal(null)}>Cancel</button>
              <button className="btn" onClick={submitRequest}>Submit Request</button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 9999, background: 'var(--t-success)', color: '#fff', padding: '12px 20px', fontWeight: 600, fontSize: 13, boxShadow: '0 8px 32px rgba(0,0,0,.4)' }}>{toast}</div>
      )}
    </>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// TAB 3 — POLICY ACKNOWLEDGMENTS
// ════════════════════════════════════════════════════════════════════════════
function PolicyAcknowledgments({ personSeed, onSignFromPolicies }) {
  const [policies, setPolicies] = useState(() => buildPolicies(personSeed))
  const [viewPolicy, setViewPolicy] = useState(null)
  const [toast, setToast] = useState(null)

  function showToast(msg) { setToast(msg); setTimeout(() => setToast(null), 3000) }

  function handleSign(id) {
    setPolicies(prev => prev.map(p => p.id === id ? { ...p, signed: true, signedDate: isoToday() } : p))
    showToast('Policy signed and acknowledged.')
  }

  const signed    = policies.filter(p => p.signed)
  const unsigned  = policies.filter(p => !p.signed)
  const overdue   = unsigned.filter(p => p.dueDate && p.dueDate < isoToday())

  const kpis = useMemo(() => ({
    total:   policies.length,
    signed:  signed.length,
    pending: unsigned.length,
    overdue: overdue.length,
    pct:     policies.length ? Math.round((signed.length / policies.length) * 100) : 0,
  }), [policies, signed, unsigned, overdue])

  return (
    <>
      {/* KPIs */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 20 }}>
        <KTile label="Policies Total"      value={kpis.total}   color="var(--t-accent)" />
        <KTile label="Acknowledged"        value={kpis.signed}  color="var(--t-success)" />
        <KTile label="Pending Signatures"  value={kpis.pending}
          alert={kpis.overdue > 0 ? 'red' : kpis.pending > 0 ? 'amber' : undefined}
          color={kpis.overdue > 0 ? 'var(--t-danger)' : kpis.pending > 0 ? 'var(--t-warn)' : 'var(--t-success)'}
          sub={kpis.overdue > 0 ? `${kpis.overdue} overdue` : undefined} />
        <KTile label="Completion"          value={`${kpis.pct}%`} color={kpis.pct >= 80 ? 'var(--t-success)' : 'var(--t-warn)'} />
      </div>

      {/* Outstanding - top section */}
      {unsigned.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--t-text)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
            Outstanding Signatures
            <Badge cls={overdue.length > 0 ? 'red' : 'warn'}>{unsigned.length}</Badge>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {unsigned.map(policy => {
              const daysLeft = policy.dueDate ? daysFromNow(policy.dueDate) : null
              const isPastDue = daysLeft !== null && daysLeft < 0
              return (
                <div key={policy.id} style={{
                  background: 'var(--t-surface)', border: `1px solid ${isPastDue ? 'var(--t-danger)' : 'var(--t-warn)'}`,
                  padding: 16, position: 'relative',
                }}>
                  {isPastDue && <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'var(--t-danger)' }} />}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--t-text)' }}>{policy.title}</div>
                      <div style={{ fontSize: 11, color: 'var(--t-text-muted)', marginTop: 3 }}>
                        {policy.version}
                        {policy.dueDate && (
                          <span style={{ marginLeft: 10, color: isPastDue ? 'var(--t-danger)' : 'var(--t-warn)', fontWeight: 600 }}>
                            {isPastDue ? `${Math.abs(daysLeft)} day(s) overdue` : `Due in ${daysLeft} day(s)`}
                          </span>
                        )}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <Badge cls={isPastDue ? 'red' : 'warn'}>{isPastDue ? 'Overdue' : 'Pending'}</Badge>
                      <button className="btn" onClick={() => setViewPolicy(policy)} style={{ fontSize: 12, padding: '6px 14px' }}>
                        Review & Sign
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Timeline of all policies */}
      <div>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--t-text)', marginBottom: 14 }}>All Policy Acknowledgments</div>
        <div style={{ position: 'relative' }}>
          {/* Timeline line */}
          <div style={{ position: 'absolute', left: 18, top: 0, bottom: 0, width: 2, background: 'var(--t-line)', zIndex: 0 }} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {[...policies].sort((a, b) => {
              const da = a.signedDate || a.dueDate || ''
              const db = b.signedDate || b.dueDate || ''
              return db.localeCompare(da)
            }).map((policy, i) => {
              const daysLeft = !policy.signed && policy.dueDate ? daysFromNow(policy.dueDate) : null
              const isPastDue = daysLeft !== null && daysLeft < 0
              return (
                <div key={policy.id} style={{ display: 'flex', gap: 16, paddingBottom: 16, position: 'relative', zIndex: 1 }}>
                  {/* Dot */}
                  <div style={{
                    width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                    background: policy.signed ? 'var(--t-success)' : isPastDue ? 'var(--t-danger)' : 'var(--t-warn)',
                    border: '3px solid var(--t-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 14, color: '#fff', fontWeight: 700,
                    boxShadow: '0 0 0 2px var(--t-line)',
                  }}>
                    {policy.signed ? '✓' : '!'}
                  </div>
                  {/* Content */}
                  <div style={{ flex: 1, background: 'var(--t-surface)', border: `1px solid ${isPastDue && !policy.signed ? 'var(--t-danger)' : 'var(--t-line)'}`, padding: '12px 16px', marginTop: 4 }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--t-text)' }}>{policy.title}</div>
                        <div style={{ fontSize: 11, color: 'var(--t-text-muted)', marginTop: 3 }}>
                          {policy.version}
                          {policy.signed && policy.signedDate && <span style={{ marginLeft: 8, color: 'var(--t-success)' }}>· Signed {fmtDate(policy.signedDate)}</span>}
                          {!policy.signed && policy.dueDate && (
                            <span style={{ marginLeft: 8, color: isPastDue ? 'var(--t-danger)' : 'var(--t-warn)', fontWeight: 600 }}>
                              · {isPastDue ? `Overdue by ${Math.abs(daysLeft)}d` : `Due in ${daysLeft}d`}
                            </span>
                          )}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <Badge cls={policy.signed ? 'success' : isPastDue ? 'red' : 'warn'}>
                          {policy.signed ? 'Acknowledged' : isPastDue ? 'Overdue' : 'Pending'}
                        </Badge>
                        {!policy.signed && (
                          <button className="action-btn-sm" onClick={() => setViewPolicy(policy)} style={{ fontSize: 11 }}>Sign</button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Policy sign modal */}
      {viewPolicy && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.8)', zIndex: 9000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', width: '100%', maxWidth: 600, maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--t-line)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--t-text)' }}>{viewPolicy.title}</div>
                <div style={{ fontSize: 11, color: 'var(--t-text-muted)', marginTop: 3 }}>{viewPolicy.version}</div>
              </div>
              <button className="action-btn-sm" onClick={() => setViewPolicy(null)}>Close</button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
              <div style={{ background: 'var(--t-surface-2)', border: '1px solid var(--t-line)', padding: 24, lineHeight: 1.8, color: 'var(--t-text)', fontSize: 14, marginBottom: 20 }}>
                <p>This policy acknowledgment confirms that <strong>{viewPolicy.title}</strong> has been provided to you for review. You are required to read and understand the contents of this policy.</p>
                <p style={{ marginTop: 12 }}>By signing, you confirm that:</p>
                <ul style={{ paddingLeft: 20, marginTop: 8, color: 'var(--t-text-muted)' }}>
                  <li>You have received and read this policy</li>
                  <li>You understand the requirements and expectations</li>
                  <li>You agree to comply with the outlined standards</li>
                </ul>
                <p style={{ marginTop: 12, color: 'var(--t-text-muted)', fontSize: 13 }}>Questions about this policy should be directed to your HR Manager.</p>
              </div>
              {!viewPolicy.signed ? (
                <div style={{ background: 'rgba(0,229,255,.04)', border: '1px solid var(--t-accent)', padding: 20 }}>
                  <div style={{ fontSize: 12, color: 'var(--t-text-muted)', marginBottom: 14 }}>
                    By clicking Sign, you provide your electronic acknowledgment. This is legally binding.
                  </div>
                  <button className="btn" onClick={() => { handleSign(viewPolicy.id); setViewPolicy(null) }}>
                    Sign & Acknowledge
                  </button>
                </div>
              ) : (
                <div style={{ background: 'rgba(29,233,182,.06)', border: '1px solid var(--t-success)', padding: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ color: 'var(--t-success)', fontSize: 18 }}>✓</span>
                  <span style={{ fontSize: 13, color: 'var(--t-success)', fontWeight: 600 }}>Acknowledged on {fmtDate(viewPolicy.signedDate)}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 9999, background: 'var(--t-success)', color: '#fff', padding: '12px 20px', fontWeight: 600, fontSize: 13, boxShadow: '0 8px 32px rgba(0,0,0,.4)' }}>{toast}</div>
      )}
    </>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// ROOT
// ════════════════════════════════════════════════════════════════════════════
const TABS = ['My Documents', 'My HR Records', 'Policy Acknowledgments']

export default function MyDocs() {
  const { session }     = useAuth()
  const { locationIds } = useScope()
  const person          = session?.person
  const personId        = person?.id
  const fullName        = person?.full_name || 'Team Member'

  const personSeed = useMemo(() => {
    if (!personId) return 5
    const n = parseInt(String(personId).replace(/\D/g, '').slice(0, 4)) || 5
    return n % 97 + 1
  }, [personId])

  const [tab, setTab]   = useState(0)
  const [docs, setDocs] = useState([])
  const [loading, setLoading] = useState(true)
  const [isMock, setIsMock]   = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { data, error } = await sb.rpc('get_my_documents', { p_person_id: personId })
      if (!error && Array.isArray(data) && data.length > 0) {
        setDocs(data)
      } else {
        setDocs(buildMyDocs(personSeed))
        setIsMock(true)
      }
    } catch {
      setDocs(buildMyDocs(personSeed))
      setIsMock(true)
    } finally {
      setLoading(false)
    }
  }, [personId, personSeed])

  useEffect(() => { load() }, [load])

  // Global KPIs for header
  const pendingCount = useMemo(() => docs.filter(d => d.status === 'Pending').length, [docs])
  const signedPct    = useMemo(() => docs.length ? Math.round(docs.filter(d => d.status === 'Signed').length / docs.length * 100) : 0, [docs])

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 300, color: 'var(--t-text-muted)', fontSize: 14 }}>
        Loading your documents…
      </div>
    )
  }

  return (
    <>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 22, letterSpacing: '-.02em', color: 'var(--t-text)', marginBottom: 4 }}>
            My Documents
          </div>
          <div style={{ fontSize: 13, color: 'var(--t-text-muted)' }}>
            {fullName} — personal documents, HR records, and policy acknowledgments
          </div>
          {isMock && (
            <div style={{ fontSize: 11, color: 'var(--t-text-faint)', marginTop: 4, fontStyle: 'italic' }}>
              Sample data — connect to live database for your actual documents.
            </div>
          )}
        </div>
        {pendingCount > 0 && (
          <div style={{ background: 'rgba(255,165,0,.1)', border: '1px solid var(--t-warn)', padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ color: 'var(--t-warn)', fontWeight: 700, fontSize: 13 }}>!</span>
            <span style={{ fontSize: 13, color: 'var(--t-warn)', fontWeight: 600 }}>{pendingCount} document{pendingCount > 1 ? 's' : ''} need your signature</span>
            <button className="action-btn-sm" onClick={() => setTab(0)} style={{ borderColor: 'var(--t-warn)', color: 'var(--t-warn)' }}>Review</button>
          </div>
        )}
      </div>

      <TabBar tabs={TABS} active={tab} onChange={setTab} />

      {tab === 0 && <MyDocuments docs={docs} setDocs={setDocs} personSeed={personSeed} />}
      {tab === 1 && <MyHRRecords fullName={fullName} />}
      {tab === 2 && <PolicyAcknowledgments personSeed={personSeed} onSignFromPolicies={() => {}} />}
    </>
  )
}
