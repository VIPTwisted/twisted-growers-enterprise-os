import { useState, useEffect, useCallback, useMemo } from 'react'
import { sb } from '../lib/supabase'
import { useAuth } from '../lib/auth.jsx'
import { useScope } from '../lib/scope.jsx'
import DrillDown from '../components/DrillDown.jsx'

// ── Deterministic seed ────────────────────────────────────────────────────────
function seed(a, b) { return ((a * 31 + b) * 17 + a * b) % 100 }

// ── Today helpers ─────────────────────────────────────────────────────────────
const TODAY = new Date('2026-06-27')
function daysAgo(n) {
  const d = new Date(TODAY); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10)
}
function daysFromNow(n) {
  const d = new Date(TODAY); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10)
}

// ── Full document content ─────────────────────────────────────────────────────
const DOC_CONTENT = {}  // document bodies come from the database (get_my_assigned_documents)

// ── Mock data ─────────────────────────────────────────────────────────────────
const LOCATIONS = ['Lakeville — Cultivation (MC281714)', 'Lakeville — Manufacturing (MP281909)', 'Dispensary (planned)']

const MY_DOCS = []  // no sample rows — real records only

const COMPANY_LIBRARY = []  // no sample rows — real records only

const SIG_REQUIRED = []  // no sample rows — real records only

const SIG_HISTORY = []  // no sample rows — real records only

// ── Shared styles ─────────────────────────────────────────────────────────────
const S = {
  card: {
    background: 'var(--t-surface)',
    border: '1px solid var(--t-line)',
    padding: '16px 20px',
  },
  cardHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
    gap: 10,
  },
  cardTitle: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: '.08em',
    color: 'var(--t-text-muted)',
    textTransform: 'uppercase',
  },
  cardBody: { display: 'flex', flexDirection: 'column', gap: 10 },
  label: {
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: '.08em',
    color: 'var(--t-text-muted)',
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  text: { fontSize: 13, color: 'var(--t-text)' },
  muted: { fontSize: 12, color: 'var(--t-text-muted)' },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '10px 0',
    borderBottom: '1px solid var(--t-line)',
  },
  btnCyan: {
    background: 'var(--t-accent)',
    color: '#070b14',
    border: 'none',
    padding: '7px 14px',
    fontSize: 12,
    fontWeight: 700,
    cursor: 'pointer',
    letterSpacing: '.03em',
  },
  btnGhost: {
    background: 'transparent',
    color: 'var(--t-text-muted)',
    border: '1px solid var(--t-line)',
    padding: '7px 14px',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
  },
  btnDanger: {
    background: 'var(--t-danger)',
    color: '#fff',
    border: 'none',
    padding: '7px 14px',
    fontSize: 12,
    fontWeight: 700,
    cursor: 'pointer',
  },
  input: {
    background: 'var(--t-surface-2)',
    border: '1px solid var(--t-line)',
    color: 'var(--t-text)',
    padding: '8px 12px',
    fontSize: 13,
    width: '100%',
    boxSizing: 'border-box',
    outline: 'none',
  },
}

// ── KPI Tile ──────────────────────────────────────────────────────────────────
function KTile({ label, value, sub, color, alert }) {
  return (
    <div style={{ background: 'var(--t-surface)', border: `1px solid ${alert === 'red' ? 'var(--t-danger)' : alert === 'amber' ? 'var(--t-warn)' : 'var(--t-line)'}`, padding: '14px 16px', position: 'relative', overflow: 'hidden' }}>
      {alert === 'red' && <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'var(--t-danger)' }} />}
      {alert === 'amber' && <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'var(--t-warn)' }} />}
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.08em', color: 'var(--t-text-muted)', textTransform: 'uppercase', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800, color: color || 'var(--t-text)', lineHeight: 1, marginBottom: 4 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--t-text-faint)' }}>{sub}</div>}
    </div>
  )
}

// ── Status badge helper ───────────────────────────────────────────────────────
function statusBadge(status) {
  const map = {
    'Signed':              'badge green',
    'Read':                'badge green',
    'Awaiting Signature':  'badge red',
    'Unread':              'badge amber',
    'Overdue':             'badge red',
  }
  return <span className={map[status] || 'badge blue'}>{status}</span>
}

function catBadge(category) {
  const map = {
    Policies:          'badge blue',
    Handbooks:         'badge purple',
    Forms:             'badge amber',
    'Training Materials': 'badge green',
    Benefits:          'badge green',
    Operations:        'badge blue',
  }
  return <span className={map[category] || 'badge blue'}>{category}</span>
}

// ── Inline document viewer ────────────────────────────────────────────────────
function DocViewer({ doc, onClose, onMarkRead, onSign }) {
  const content = doc.contentKey ? DOC_CONTENT[doc.contentKey] : null
  return (
    <div style={{ background: 'var(--t-surface-2)', border: '1px solid var(--t-accent)', padding: '20px 22px', marginTop: 10, position: 'relative' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div style={{ fontWeight: 800, fontSize: 14, color: 'var(--t-text)' }}>{doc.title}</div>
        <button onClick={onClose} style={{ ...S.btnGhost, padding: '4px 10px', fontSize: 11 }}>✕ Close</button>
      </div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        {catBadge(doc.category)}
        {doc.status && statusBadge(doc.status)}
        {doc.added && <span style={S.muted}>Added {doc.added}</span>}
        {doc.assigned && <span style={S.muted}>Assigned {doc.assigned}</span>}
      </div>
      <div style={{
        background: 'var(--t-bg)',
        border: '1px solid var(--t-line)',
        padding: '16px 18px',
        maxHeight: 340,
        overflowY: 'auto',
        fontSize: 13,
        color: 'var(--t-text)',
        lineHeight: 1.7,
        whiteSpace: 'pre-wrap',
        fontFamily: 'inherit',
      }}>
        {content || `[Document content for "${doc.title}" is stored in the Twisted Growers document system. Contact HR to request a printed copy or digital access via your employee portal.]`}
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
        {doc.status === 'Unread' && onMarkRead && (
          <button style={S.btnGhost} onClick={() => onMarkRead(doc.id)}>Mark as Read</button>
        )}
        {doc.status === 'Awaiting Signature' && onSign && (
          <button style={S.btnCyan} onClick={() => onSign(doc)}>Sign & Acknowledge</button>
        )}
        <button style={{ ...S.btnGhost, marginLeft: 'auto' }} onClick={onClose}>Close</button>
      </div>
    </div>
  )
}

// ── Confirm modal ─────────────────────────────────────────────────────────────
function ConfirmModal({ doc, onConfirm, onCancel }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)',
      zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center',
    }} onClick={onCancel}>
      <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', padding: '32px 36px', maxWidth: 440, width: '90%' }}
        onClick={e => e.stopPropagation()}>
        <div style={{ fontWeight: 800, fontSize: 16, color: 'var(--t-text)', marginBottom: 14 }}>Sign & Acknowledge</div>
        <div style={{ fontSize: 13, color: 'var(--t-text-muted)', lineHeight: 1.6, marginBottom: 10 }}>
          You are about to sign:
        </div>
        <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--t-text)', marginBottom: 20, padding: '10px 14px', background: 'var(--t-surface-2)', border: '1px solid var(--t-line)' }}>
          {doc?.title}
        </div>
        <div style={{ fontSize: 13, color: 'var(--t-text-muted)', lineHeight: 1.6, marginBottom: 24 }}>
          By clicking <strong style={{ color: 'var(--t-text)' }}>Confirm</strong>, you acknowledge that you have read and understood this document. Your digital signature will be recorded along with today's date and time.
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button style={S.btnGhost} onClick={onCancel}>Cancel</button>
          <button style={S.btnCyan} onClick={onConfirm}>Confirm</button>
        </div>
      </div>
    </div>
  )
}

// ── Tab 1: My Documents ───────────────────────────────────────────────────────
function MyDocuments({ myDocs, onDocStatusChange }) {
  const [expandedId, setExpandedId] = useState(null)
  const [signingDoc, setSigningDoc] = useState(null)
  const [statuses, setStatuses] = useState(() => {
    const m = {}
    myDocs.forEach(d => { m[d.id] = d.status })
    return m
  })

  const pending = myDocs.filter(d => statuses[d.id] === 'Awaiting Signature')

  function toggleExpand(id) {
    setExpandedId(prev => prev === id ? null : id)
  }

  function handleMarkRead(id) {
    setStatuses(prev => ({ ...prev, [id]: 'Read' }))
    onDocStatusChange && onDocStatusChange(id, 'Read')
  }

  function handleSignConfirm() {
    if (!signingDoc) return
    setStatuses(prev => ({ ...prev, [signingDoc.id]: 'Signed' }))
    onDocStatusChange && onDocStatusChange(signingDoc.id, 'Signed')
    setSigningDoc(null)
    setExpandedId(null)
  }

  const docWithStatus = (doc) => ({ ...doc, status: statuses[doc.id] })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Pending signatures alert */}
      {pending.length > 0 && (
        <div style={{ border: '1px solid var(--t-warn)', background: 'rgba(255,160,0,.06)', padding: '14px 18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <div style={{ width: 4, height: 36, background: 'var(--t-warn)', flexShrink: 0 }} />
            <div>
              <div style={{ fontWeight: 800, fontSize: 13, color: 'var(--t-warn)', letterSpacing: '.04em' }}>
                ACTION REQUIRED — {pending.length} DOCUMENT{pending.length > 1 ? 'S' : ''} AWAITING SIGNATURE
              </div>
              <div style={{ fontSize: 12, color: 'var(--t-text-muted)', marginTop: 2 }}>
                Please review and sign the following documents as soon as possible.
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingLeft: 14 }}>
            {pending.map(d => (
              <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13 }}>
                <span style={{ color: 'var(--t-warn)', fontWeight: 700, fontSize: 16, lineHeight: 1 }}>›</span>
                <span style={{ color: 'var(--t-text)', fontWeight: 600 }}>{d.title}</span>
                {d.due && (
                  <span style={{ fontSize: 11, color: 'var(--t-text-muted)' }}>Due {d.due}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* All assigned docs */}
      <div style={S.card}>
        <div style={S.cardHeader}>
          <div style={S.cardTitle}>All Assigned Documents</div>
          <span style={S.muted}>{myDocs.length} documents</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          {myDocs.map((doc, idx) => {
            const d = docWithStatus(doc)
            const isExpanded = expandedId === doc.id
            return (
              <div key={doc.id}>
                <div
                  style={{
                    ...S.row,
                    cursor: 'pointer',
                    borderBottom: isExpanded ? 'none' : '1px solid var(--t-line)',
                    paddingTop: idx === 0 ? 0 : 10,
                    flexWrap: 'wrap',
                  }}
                  onClick={() => toggleExpand(doc.id)}
                >
                  <div style={{ flex: 1, minWidth: 140 }}>
                    <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--t-text)', marginBottom: 3 }}>{doc.title}</div>
                    <div style={{ fontSize: 11, color: 'var(--t-text-muted)' }}>Assigned {doc.assigned}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    {catBadge(doc.category)}
                    {statusBadge(d.status)}
                    <span style={{ fontSize: 12, color: 'var(--t-text-faint)', marginLeft: 4 }}>
                      {isExpanded ? '▲' : '▼'}
                    </span>
                  </div>
                </div>
                {isExpanded && (
                  <DocViewer
                    doc={d}
                    onClose={() => setExpandedId(null)}
                    onMarkRead={handleMarkRead}
                    onSign={(docToSign) => setSigningDoc(docToSign)}
                  />
                )}
              </div>
            )
          })}
        </div>
      </div>

      {signingDoc && (
        <ConfirmModal
          doc={signingDoc}
          onConfirm={handleSignConfirm}
          onCancel={() => setSigningDoc(null)}
        />
      )}
    </div>
  )
}

// ── Tab 2: Company Library ────────────────────────────────────────────────────
const LIB_CATS = ['All', 'Policies', 'Handbooks', 'Forms', 'Training Materials', 'Benefits', 'Operations']

function CompanyLibrary() {
  const [catTab, setCatTab] = useState('All')
  const [search, setSearch] = useState('')
  const [expandedId, setExpandedId] = useState(null)

  const isNew = (added) => {
    const addedDate = new Date(added)
    const cutoff = new Date(TODAY); cutoff.setDate(cutoff.getDate() - 7)
    return addedDate >= cutoff
  }

  const visible = useMemo(() => {
    return COMPANY_LIBRARY.filter(d => {
      const catMatch = catTab === 'All' || d.category === catTab
      const searchMatch = !search || d.title.toLowerCase().includes(search.toLowerCase()) || d.desc.toLowerCase().includes(search.toLowerCase())
      return catMatch && searchMatch
    })
  }, [catTab, search])

  function handleDownload(doc) {
    const content = DOC_CONTENT[doc.contentKey] || `Twisted Growers — ${doc.title}\n\n${doc.desc || ''}\n\nThe full document is available from HR.`
    const blob = new Blob([content], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${doc.title.replace(/\s+/g, '_')}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Search */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <input
          type="text"
          placeholder="Search documents…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ ...S.input, maxWidth: 340 }}
        />
        <span style={S.muted}>{visible.length} documents</span>
      </div>

      {/* Category sub-tabs */}
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', borderBottom: '1px solid var(--t-line)', paddingBottom: 0 }}>
        {LIB_CATS.map(cat => (
          <button
            key={cat}
            onClick={() => setCatTab(cat)}
            style={{
              background: catTab === cat ? 'var(--t-accent)' : 'transparent',
              color: catTab === cat ? '#070b14' : 'var(--t-text-muted)',
              border: 'none',
              padding: '8px 14px',
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
              letterSpacing: '.04em',
              borderBottom: catTab === cat ? '2px solid var(--t-accent)' : '2px solid transparent',
              marginBottom: -1,
            }}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Document grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
        {visible.map(doc => (
          <div key={doc.id}>
            <div style={{ ...S.card, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--t-text)', lineHeight: 1.35, flex: 1 }}>{doc.title}</div>
                {isNew(doc.added) && <span className="badge green" style={{ flexShrink: 0 }}>New</span>}
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {catBadge(doc.category)}
                <span style={S.muted}>{doc.added}</span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--t-text-muted)', lineHeight: 1.55, flex: 1 }}>{doc.desc}</div>
              <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                <button
                  style={{ ...S.btnCyan, padding: '6px 12px', fontSize: 11 }}
                  onClick={() => setExpandedId(expandedId === doc.id ? null : doc.id)}
                >
                  {expandedId === doc.id ? 'Close' : 'View'}
                </button>
                <button
                  style={{ ...S.btnGhost, padding: '6px 12px', fontSize: 11 }}
                  onClick={() => handleDownload(doc)}
                >
                  Download
                </button>
              </div>
            </div>
            {expandedId === doc.id && (
              <DocViewer
                doc={doc}
                onClose={() => setExpandedId(null)}
              />
            )}
          </div>
        ))}
      </div>

      {visible.length === 0 && (
        <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--t-text-faint)', fontSize: 13 }}>
          No documents found{search ? ` matching "${search}"` : ''}.
        </div>
      )}
    </div>
  )
}

// ── Tab 3: Signatures Required ────────────────────────────────────────────────
function SignaturesRequired() {
  const [required, setRequired] = useState(SIG_REQUIRED)
  const [signingDoc, setSigningDoc] = useState(null)

  function handleSignConfirm() {
    if (!signingDoc) return
    setRequired(prev => prev.filter(d => d.id !== signingDoc.id))
    setSigningDoc(null)
  }

  const isDaysOverdue = (due) => {
    const d = new Date(due)
    return Math.round((TODAY - d) / (1000 * 60 * 60 * 24))
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Required signatures */}
      <div style={S.card}>
        <div style={S.cardHeader}>
          <div style={S.cardTitle}>Pending Signatures</div>
          <span style={S.muted}>{required.length} remaining</span>
        </div>

        {required.length === 0 && (
          <div style={{ padding: '24px 0', textAlign: 'center' }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>✓</div>
            <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--t-success)', marginBottom: 4 }}>All signatures complete</div>
            <div style={{ fontSize: 12, color: 'var(--t-text-faint)' }}>No documents require your signature at this time.</div>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          {required.map((doc) => {
            const overdueDays = doc.isOverdue ? isDaysOverdue(doc.due) : 0
            return (
              <div
                key={doc.id}
                style={{
                  padding: '14px 16px',
                  background: doc.isOverdue ? 'rgba(255,59,48,.06)' : 'transparent',
                  border: doc.isOverdue ? '1px solid var(--t-danger)' : '1px solid var(--t-line)',
                  marginBottom: 8,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 14,
                  flexWrap: 'wrap',
                }}
              >
                {doc.isOverdue && (
                  <div style={{ width: 3, height: 48, background: 'var(--t-danger)', flexShrink: 0, alignSelf: 'stretch' }} />
                )}
                <div style={{ flex: 1, minWidth: 140 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--t-text)', marginBottom: 4 }}>{doc.title}</div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    {catBadge(doc.category)}
                    <span style={{ fontSize: 11, color: 'var(--t-text-muted)' }}>v{doc.version}</span>
                    {doc.isOverdue
                      ? <span className="badge red">OVERDUE by {overdueDays}d</span>
                      : <span style={{ fontSize: 11, color: 'var(--t-text-muted)' }}>Due {doc.due}</span>
                    }
                  </div>
                </div>
                <button
                  style={{ ...S.btnCyan, padding: '8px 18px' }}
                  onClick={() => setSigningDoc(doc)}
                >
                  Sign
                </button>
              </div>
            )
          })}
        </div>
      </div>

      {/* Signature history */}
      <div style={S.card}>
        <div style={S.cardHeader}>
          <div style={S.cardTitle}>Signature History</div>
          <span style={S.muted}>{SIG_HISTORY.length} records</span>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--t-line)' }}>
                <th style={{ textAlign: 'left', padding: '8px 12px 10px 0', fontSize: 10, fontWeight: 700, letterSpacing: '.07em', color: 'var(--t-text-muted)', textTransform: 'uppercase' }}>Document</th>
                <th style={{ textAlign: 'left', padding: '8px 12px 10px', fontSize: 10, fontWeight: 700, letterSpacing: '.07em', color: 'var(--t-text-muted)', textTransform: 'uppercase' }}>Version</th>
                <th style={{ textAlign: 'left', padding: '8px 0 10px 12px', fontSize: 10, fontWeight: 700, letterSpacing: '.07em', color: 'var(--t-text-muted)', textTransform: 'uppercase' }}>Date Signed</th>
                <th style={{ textAlign: 'right', padding: '8px 0 10px 12px', fontSize: 10, fontWeight: 700, letterSpacing: '.07em', color: 'var(--t-text-muted)', textTransform: 'uppercase' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {SIG_HISTORY.map((h, i) => (
                <tr key={h.id} style={{ borderBottom: i < SIG_HISTORY.length - 1 ? '1px solid var(--t-line)' : 'none' }}>
                  <td style={{ padding: '10px 12px 10px 0', fontWeight: 600, color: 'var(--t-text)' }}>{h.title}</td>
                  <td style={{ padding: '10px 12px', color: 'var(--t-text-muted)', fontFamily: 'monospace', fontSize: 12 }}>v{h.version}</td>
                  <td style={{ padding: '10px 0 10px 12px', color: 'var(--t-text-muted)' }}>{h.signed}</td>
                  <td style={{ padding: '10px 0 10px 12px', textAlign: 'right' }}>
                    <span className="badge green">Signed</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {signingDoc && (
        <ConfirmModal
          doc={signingDoc}
          onConfirm={handleSignConfirm}
          onCancel={() => setSigningDoc(null)}
        />
      )}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function Documents() {
  const { session } = useAuth()
  const { locationIds } = useScope()
  const r = session?.person?.role_name || ''
  const isHR = ['ceo', 'hr', 'manager', 'coo', 'admin', 'owner'].some(x => r.toLowerCase().includes(x))

  const [activeTab, setActiveTab] = useState('my')
  const [myDocs, setMyDocs] = useState(MY_DOCS)
  const [loading, setLoading] = useState(true)

  // Simulate async data load
  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 320)
    return () => clearTimeout(t)
  }, [])

  // Try real RPC, fall back to mock
  useEffect(() => {
    if (!locationIds?.length) return
    sb.rpc('get_my_assigned_documents', { p_person_id: session?.person?.id })
      .then(({ data, error }) => {
        if (!error && data?.length) {
          setMyDocs(data)
        }
      })
      .catch(() => {/* keep mock */})
  }, [locationIds, session?.person?.id])

  function handleDocStatusChange(id, newStatus) {
    setMyDocs(prev => prev.map(d => d.id === id ? { ...d, status: newStatus } : d))
  }

  // KPI derivations
  const pendingCount = myDocs.filter(d => d.status === 'Awaiting Signature').length
  const assignedCount = myDocs.length
  const readCount = myDocs.filter(d => d.status === 'Read' || d.status === 'Signed').length
  const readPct = assignedCount > 0 ? Math.round((readCount / assignedCount) * 100) : 0
  const newThisMonth = COMPANY_LIBRARY.filter(d => {
    const added = new Date(d.added)
    return added >= new Date(TODAY.getFullYear(), TODAY.getMonth(), 1)
  }).length
  const lastSigned = SIG_HISTORY[0]?.signed || '—'
  const libSize = COMPANY_LIBRARY.length

  const TABS = [
    { key: 'my',        label: 'My Documents' },
    { key: 'library',   label: 'Company Library' },
    { key: 'signatures', label: 'Signatures Required' },
  ]

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 300, color: 'var(--t-text-muted)', fontSize: 13, letterSpacing: '.04em' }}>
        Loading Documents…
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Page title */}
      <div>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.1em', color: 'var(--t-text-muted)', textTransform: 'uppercase', marginBottom: 6 }}>
          Twisted Growers
        </div>
        <div style={{ fontSize: 22, fontWeight: 900, color: 'var(--t-text)', letterSpacing: '-.01em' }}>
          Document Center
        </div>
      </div>

      {/* KPI strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 10 }}>
        <KTile
          label="Pending Signatures"
          value={pendingCount}
          sub={pendingCount > 0 ? 'Action required' : 'All clear'}
          color={pendingCount > 0 ? 'var(--t-danger)' : 'var(--t-success)'}
          alert={pendingCount > 0 ? 'red' : undefined}
        />
        <KTile
          label="Documents Read %"
          value={`${readPct}%`}
          sub={`${readCount} of ${assignedCount} assigned`}
          color={readPct === 100 ? 'var(--t-success)' : readPct >= 60 ? 'var(--t-warn)' : 'var(--t-danger)'}
          alert={readPct < 60 ? 'amber' : undefined}
        />
        <KTile
          label="New This Month"
          value={newThisMonth}
          sub="In company library"
        />
        <KTile
          label="Total Assigned"
          value={assignedCount}
          sub="To me"
        />
        <KTile
          label="Company Library"
          value={libSize}
          sub="Documents available"
        />
        <KTile
          label="Last Signed"
          value={lastSigned !== '—' ? lastSigned.slice(5) : '—'}
          sub={lastSigned !== '—' ? lastSigned.slice(0, 4) : 'No history'}
        />
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--t-line)' }}>
        {TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={{
              background: 'transparent',
              color: activeTab === tab.key ? 'var(--t-accent)' : 'var(--t-text-muted)',
              border: 'none',
              borderBottom: activeTab === tab.key ? '2px solid var(--t-accent)' : '2px solid transparent',
              padding: '10px 18px',
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
              letterSpacing: '.05em',
              textTransform: 'uppercase',
              marginBottom: -1,
              transition: 'color .15s',
            }}
          >
            {tab.label}
            {tab.key === 'signatures' && pendingCount > 0 && (
              <span style={{
                marginLeft: 6, background: 'var(--t-danger)', color: '#fff',
                borderRadius: 10, fontSize: 10, fontWeight: 800,
                padding: '1px 6px', verticalAlign: 'middle',
              }}>
                {pendingCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'my' && (
        <MyDocuments myDocs={myDocs} onDocStatusChange={handleDocStatusChange} />
      )}
      {activeTab === 'library' && (
        <CompanyLibrary />
      )}
      {activeTab === 'signatures' && (
        <SignaturesRequired />
      )}
    </div>
  )
}
