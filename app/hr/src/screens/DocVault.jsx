import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { sb } from '../lib/supabase'
import { useAuth } from '../lib/auth.jsx'
import { useScope } from '../lib/scope.jsx'

// ── Auth guard ──────────────────────────────────────────────────────────────
function isVaultAuthorized(person) {
  if (!person?.role_name) return false
  const r = person.role_name.toLowerCase()
  const allowed = ['ceo', 'hr manager', 'hr', 'coo', 'admin', 'owner'].some(k => r.includes(k))
  const blocked = ['store manager', 'key holder', 'associate', 'cashier'].some(k => r.includes(k))
  return allowed && !blocked
}

// ── Constants (UI enums — not data) ──────────────────────────────────────────
const REQUIRED_EMP_DOCS = ['I-9', 'W-4', 'CT-W4', 'Offer Letter', 'Direct Deposit', 'NDA', 'Handbook Ack.']
const EMP_DOC_TYPES     = [...REQUIRED_EMP_DOCS, 'DA Record', 'Performance Review', 'Medical Note', 'Other']
const SENSITIVE_TYPES   = ['Business License', 'Insurance Certificate', 'Lease Agreement', 'Vendor Contract', 'State Permit', 'Franchise Agreement', 'Audit Report', 'Legal Opinion']

// ── Helpers ──────────────────────────────────────────────────────────────────
const today = new Date()
function fmtDate(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d)) return '—'
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}
function isoToday() { return new Date().toISOString().split('T')[0] }
function iso30Ago() { const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString().split('T')[0] }
function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s }

// Map a get_documents() row into the sensitive-doc card shape.
function dvMapDocRow(row) {
  let meta = {}
  if (typeof row.content === 'string') { try { meta = JSON.parse(row.content) } catch { meta = {} } }
  else if (row.content && typeof row.content === 'object') meta = row.content
  const typeLabel = row.category || meta.category || (row.type ? cap(row.type) : 'Document')
  return {
    id: row.id,
    type: typeLabel,
    title: row.name || meta.title || 'Untitled Document',
    uploaded: row.created_at ? String(row.created_at).split('T')[0].split(' ')[0] : isoToday(),
    uploadedBy: row.created_by || meta.applies_to || 'Twisted Growers HR',
    expires: row.expires_at || null,
    confidential: row.requires_ack !== false,
  }
}

// De-duplicate documents by name + type (same policy can be seeded per location).
function dedupeDocs(rows) {
  const seen = new Set(); const out = []
  for (const row of rows) {
    const key = (row.name || row.id) + '|' + (row.type || '')
    if (seen.has(key)) continue
    seen.add(key); out.push(row)
  }
  return out
}

// Map an app_audit_log row into the audit-trail display shape.
function shortAction(a = '') {
  const m = a.replace(/^document\s+/i, '')
  return m ? cap(m) : (a || '—')
}
function mapAudit(row) {
  return {
    id: row.id,
    actor: row.actor_name || '—',
    action: shortAction(row.action),
    rawAction: row.action || '',
    docTitle: row.target || '—',
    ts: row.created_at ? String(row.created_at).split('T')[0].split(' ')[0] : '',
    loc: row.node_name || '—',
    result: row.result || '',
  }
}
function isDocAudit(row) { return (row.action || '').toLowerCase().includes('document') }

// Build per-employee folders from the live roster + stored personnel docs.
function buildFolders(roster, empDocs) {
  const byPerson = new Map()
  for (const d of empDocs) {
    const arr = byPerson.get(d.person_id) || []
    arr.push(d); byPerson.set(d.person_id, arr)
  }
  return roster.map(emp => {
    const stored = byPerson.get(emp.id) || []
    const firstByType = new Map()
    for (const s of stored) if (!firstByType.has(s.doc_type)) firstByType.set(s.doc_type, s)
    const req = REQUIRED_EMP_DOCS.map(type => {
      const s = firstByType.get(type)
      return s
        ? { id: s.id, empId: emp.id, docType: type, title: s.title, uploaded: s.uploaded, uploadedBy: s.uploaded_by, lastAccessed: s.last_accessed, present: true }
        : { id: `${emp.id}:${type}`, empId: emp.id, docType: type, title: `${type} — ${emp.full_name}`, uploaded: null, uploadedBy: null, lastAccessed: null, present: false }
    })
    const extras = stored
      .filter(s => !REQUIRED_EMP_DOCS.includes(s.doc_type))
      .map(s => ({ id: s.id, empId: emp.id, docType: s.doc_type, title: s.title, uploaded: s.uploaded, uploadedBy: s.uploaded_by, lastAccessed: s.last_accessed, present: true }))
    return { emp, docs: [...req, ...extras] }
  })
}

// ── Shared style tokens ──────────────────────────────────────────────────────
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
function KTile({ label, value, sub, color, alert: alertLevel, onClick }) {
  return (
    <div onClick={onClick} title={onClick ? 'Click to drill into records' : undefined} style={{
      background: 'var(--t-surface)',
      border: `1px solid ${alertLevel === 'red' ? 'var(--t-danger)' : alertLevel === 'amber' ? 'var(--t-warn)' : 'var(--t-line)'}`,
      padding: '14px 16px', position: 'relative', overflow: 'hidden',
      flex: '1 1 130px', minWidth: 0,
      cursor: onClick ? 'pointer' : 'default',
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
function Badge({ cls, children, style }) {
  return <span className={`badge ${cls}`} style={{ whiteSpace: 'nowrap', ...style }}>{children}</span>
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

// ════════════════════════════════════════════════════════════════════════════
// TAB 1 — EMPLOYEE RECORDS
// ════════════════════════════════════════════════════════════════════════════
function EmployeeRecords({ roster, folders, docAudit, onUpload, onAccess }) {
  const [selectedId, setSelectedId] = useState(null)
  const [locFilter, setLocFilter]   = useState('All')
  const [empSearch, setEmpSearch]   = useState('')
  const [uploadTarget, setUploadTarget] = useState(null)
  const [uploadForm, setUploadForm]     = useState({ docType: REQUIRED_EMP_DOCS[0], file: null })
  const [accessLog, setAccessLog]       = useState(null)
  const [saving, setSaving]             = useState(false)
  const [toast, setToast]               = useState(null)
  const fileRef = useRef(null)

  const locations = useMemo(
    () => ['All', ...[...new Set(roster.map(e => e.node_name).filter(Boolean))].sort()],
    [roster],
  )

  // Keep a valid selection as roster loads / filters change.
  useEffect(() => {
    if (roster.length === 0) { setSelectedId(null); return }
    if (!roster.some(e => e.id === selectedId)) setSelectedId(roster[0].id)
  }, [roster, selectedId])

  function showToast(msg) { setToast(msg); setTimeout(() => setToast(null), 3000) }

  const filteredEmps = useMemo(() => {
    return roster.filter(e => {
      if (locFilter !== 'All' && e.node_name !== locFilter) return false
      if (empSearch.trim() && !(e.full_name || '').toLowerCase().includes(empSearch.toLowerCase())) return false
      return true
    })
  }, [roster, locFilter, empSearch])

  const folder = useMemo(() => folders.find(f => f.emp.id === selectedId), [folders, selectedId])

  const missingRequired = useMemo(() => {
    if (!folder) return 0
    return folder.docs.filter(d => REQUIRED_EMP_DOCS.includes(d.docType) && !d.present).length
  }, [folder])

  const totalMissing = useMemo(
    () => folders.reduce((s, f) => s + f.docs.filter(d => REQUIRED_EMP_DOCS.includes(d.docType) && !d.present).length, 0),
    [folders],
  )
  const totalDocs = useMemo(
    () => folders.reduce((s, f) => s + f.docs.filter(d => d.present).length, 0),
    [folders],
  )
  const recentAccesses = useMemo(
    () => docAudit.filter(a => a.rawAction === 'Document Viewed' || a.rawAction === 'Document Downloaded').filter(a => a.ts >= iso30Ago()).length,
    [docAudit],
  )

  async function handleUpload() {
    if (!uploadTarget || !uploadForm.docType) return
    setSaving(true)
    try {
      await onUpload(uploadTarget.id, uploadForm.docType, `${uploadForm.docType} — ${uploadTarget.full_name}`)
      showToast(`${uploadForm.docType} recorded for ${uploadTarget.full_name}.`)
      setUploadTarget(null)
      setUploadForm({ docType: REQUIRED_EMP_DOCS[0], file: null })
    } catch (e) {
      showToast(e.message || 'Upload failed.')
    }
    setSaving(false)
  }

  async function handleView(doc) {
    showToast(`Viewing ${doc.docType}…`)
    try { await onAccess(doc.id, 'Document Viewed') } catch { /* honest toast handled globally */ }
  }

  const accessRows = useMemo(() => {
    if (!accessLog || !folder) return []
    const t = accessLog.docType.toLowerCase()
    const n = (folder.emp.full_name || '').toLowerCase()
    return docAudit.filter(a => {
      const dt = a.docTitle.toLowerCase()
      return dt.includes(t) && (!n || dt.includes(n))
    }).slice(0, 12)
  }, [accessLog, folder, docAudit])

  return (
    <>
      {/* KPIs */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 20 }}>
        <KTile label="Secured Docs"       value={totalDocs}       color="var(--t-accent)" />
        <KTile label="Employee Folders"   value={roster.length}   color="var(--t-text)" />
        <KTile label="Accesses (30d)"     value={recentAccesses}  color="var(--t-text-muted)" />
        <KTile label="Missing Req. Docs"  value={totalMissing}
          alert={totalMissing > 0 ? 'red' : undefined}
          color={totalMissing > 0 ? 'var(--t-danger)' : 'var(--t-success)'}
          sub={totalMissing > 0 ? 'Review required' : 'All complete'} />
      </div>

      {roster.length === 0 ? (
        <div style={{ padding: 48, textAlign: 'center', color: 'var(--t-text-muted)', border: '1px solid var(--t-line)', background: 'var(--t-surface)' }}>
          No employees in scope. Roster is empty for the selected locations.
        </div>
      ) : (
      <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr', gap: 16, alignItems: 'start' }}>
        {/* Left: employee list */}
        <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)' }}>
          <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--t-line)' }}>
            <input type="search" value={empSearch} onChange={e => setEmpSearch(e.target.value)}
              placeholder="Search employees…" style={{ ...SL.input, fontSize: 12, padding: '6px 10px' }} />
            <div style={{ marginTop: 8 }}>
              <select value={locFilter} onChange={e => setLocFilter(e.target.value)} style={{ ...SL.select, fontSize: 12, padding: '6px 10px' }}>
                {locations.map(l => <option key={l}>{l}</option>)}
              </select>
            </div>
          </div>
          <div style={{ maxHeight: 480, overflowY: 'auto' }}>
            {filteredEmps.map(emp => {
              const f = folders.find(fl => fl.emp.id === emp.id)
              const missing = f ? f.docs.filter(d => REQUIRED_EMP_DOCS.includes(d.docType) && !d.present).length : 0
              const isActive = emp.id === selectedId
              return (
                <div key={emp.id} onClick={() => setSelectedId(emp.id)} style={{
                  padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid var(--t-line)',
                  background: isActive ? 'rgba(0,229,255,.08)' : 'transparent',
                  borderLeft: isActive ? '3px solid var(--t-accent)' : '3px solid transparent',
                  transition: 'background .15s',
                }}>
                  <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--t-text)', marginBottom: 2 }}>{emp.full_name}</div>
                  <div style={{ fontSize: 11, color: 'var(--t-text-muted)', display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span>{emp.node_name || '—'}</span>
                    {missing > 0 && <span style={{ color: 'var(--t-danger)', fontWeight: 700 }}>• {missing} missing</span>}
                  </div>
                </div>
              )
            })}
            {filteredEmps.length === 0 && (
              <div style={{ padding: 24, color: 'var(--t-text-muted)', fontSize: 12, textAlign: 'center' }}>No employees match.</div>
            )}
          </div>
        </div>

        {/* Right: folder contents */}
        {folder && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--t-text)' }}>{folder.emp.full_name}</div>
                <div style={{ fontSize: 12, color: 'var(--t-text-muted)', marginTop: 2 }}>
                  {(folder.emp.node_name || '—')} · {(folder.emp.role_name || '—')}
                  {missingRequired > 0 && <span style={{ color: 'var(--t-danger)', fontWeight: 700, marginLeft: 8 }}>• {missingRequired} required doc(s) missing</span>}
                </div>
              </div>
              <button className="btn" onClick={() => setUploadTarget(folder.emp)} style={{ fontSize: 12 }}>Upload to Folder</button>
            </div>

            <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: 'var(--t-surface-2)' }}>
                    {['Document', 'Status', 'Upload Date', 'Uploaded By', 'Last Accessed', 'Actions'].map(h => (
                      <th key={h} style={{ padding: '9px 12px', textAlign: 'left', fontWeight: 700, fontSize: 10, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--t-text-muted)', borderBottom: '1px solid var(--t-line)', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {folder.docs.map((doc, i) => (
                    <tr key={doc.id} style={{ borderBottom: '1px solid var(--t-line)', background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,.015)' }}>
                      <td style={{ padding: '9px 12px', fontWeight: 500, color: 'var(--t-text)' }}>{doc.docType}</td>
                      <td style={{ padding: '9px 12px', whiteSpace: 'nowrap' }}>
                        {doc.present ? <Badge cls="success">On File</Badge> : <Badge cls="red">Missing</Badge>}
                      </td>
                      <td style={{ padding: '9px 12px', color: 'var(--t-text-muted)', fontSize: 12, whiteSpace: 'nowrap' }}>{fmtDate(doc.uploaded)}</td>
                      <td style={{ padding: '9px 12px', color: 'var(--t-text-muted)', fontSize: 12 }}>{doc.uploadedBy || '—'}</td>
                      <td style={{ padding: '9px 12px', color: 'var(--t-text-faint)', fontSize: 12, whiteSpace: 'nowrap' }}>{fmtDate(doc.lastAccessed)}</td>
                      <td style={{ padding: '9px 12px', whiteSpace: 'nowrap' }}>
                        {doc.present ? (
                          <div style={{ display: 'flex', gap: 5 }}>
                            <button className="action-btn-sm" onClick={() => handleView(doc)}>View</button>
                            <button className="action-btn-sm" onClick={() => setAccessLog(doc)} style={{ fontSize: 11 }}>Log</button>
                          </div>
                        ) : (
                          <button className="action-btn-sm" onClick={() => { setUploadForm({ docType: doc.docType, file: null }); setUploadTarget(folder.emp) }} style={{ color: 'var(--t-danger)', borderColor: 'var(--t-danger)' }}>Upload</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
      )}

      {/* Upload modal */}
      {uploadTarget && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)', zIndex: 9000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', padding: 32, maxWidth: 440, width: '90%' }}>
            <div style={{ fontWeight: 700, fontSize: 17, color: 'var(--t-text)', marginBottom: 4 }}>Upload to Folder</div>
            <div style={{ fontSize: 12, color: 'var(--t-text-muted)', marginBottom: 20 }}>{uploadTarget.full_name}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 24 }}>
              <div>
                <label style={SL.label}>Document Type</label>
                <select value={uploadForm.docType} onChange={e => setUploadForm(f => ({ ...f, docType: e.target.value }))} style={SL.select}>
                  {EMP_DOC_TYPES.map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label style={SL.label}>File (PDF, JPG, DOCX)</label>
                <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.docx,.png" onChange={e => setUploadForm(f => ({ ...f, file: e.target.files[0] || null }))} style={{ fontSize: 13, color: 'var(--t-text)', display: 'block', marginTop: 4 }} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="action-btn-sm" onClick={() => setUploadTarget(null)} disabled={saving}>Cancel</button>
              <button className="btn" onClick={handleUpload} disabled={saving}>{saving ? 'Saving…' : 'Save to Folder'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Access log modal */}
      {accessLog && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)', zIndex: 9000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', padding: 28, maxWidth: 480, width: '90%', maxHeight: '80vh', overflowY: 'auto' }}>
            <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--t-text)', marginBottom: 4 }}>Access Log</div>
            <div style={{ fontSize: 12, color: 'var(--t-text-muted)', marginBottom: 20 }}>{accessLog.title}</div>
            {accessRows.map((entry) => (
              <div key={entry.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--t-line)', gap: 12 }}>
                <div>
                  <span style={{ fontWeight: 600, color: 'var(--t-text)', fontSize: 13 }}>{entry.actor}</span>
                  <span style={{ color: 'var(--t-text-muted)', fontSize: 12, marginLeft: 8 }}>{entry.action}</span>
                </div>
                <div style={{ fontSize: 11, color: 'var(--t-text-faint)', whiteSpace: 'nowrap' }}>{fmtDate(entry.ts)}</div>
              </div>
            ))}
            {accessRows.length === 0 && (
              <div style={{ color: 'var(--t-text-muted)', fontSize: 13 }}>No access records for this document yet.</div>
            )}
            <div style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end' }}>
              <button className="action-btn-sm" onClick={() => setAccessLog(null)}>Close</button>
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
// TAB 2 — SENSITIVE DOCUMENTS
// ════════════════════════════════════════════════════════════════════════════
function SensitiveDocuments({ docs, onUpload, onAccess }) {
  const [typeFilter, setTypeFilter]   = useState('All')
  const [search, setSearch]           = useState('')
  const [uploadModal, setUploadModal] = useState(false)
  const [confirmDownload, setConfirmDownload] = useState(null)
  const [uploadForm, setUploadForm]   = useState({ title: '', type: SENSITIVE_TYPES[0], content: '', file: null })
  const [saving, setSaving]           = useState(false)
  const [toast, setToast]             = useState(null)
  const fileRef = useRef(null)

  function showToast(msg) { setToast(msg); setTimeout(() => setToast(null), 3000) }

  const typeOptions = useMemo(
    () => [...new Set(docs.map(d => d.type).filter(Boolean))].sort(),
    [docs],
  )

  const filtered = useMemo(() => {
    return docs.filter(d => {
      if (typeFilter !== 'All' && d.type !== typeFilter) return false
      if (search.trim() && !d.title.toLowerCase().includes(search.toLowerCase())) return false
      return true
    })
  }, [docs, typeFilter, search])

  async function confirmAndDownload() {
    const doc = confirmDownload
    setConfirmDownload(null)
    showToast(`Downloading "${doc.title}"…`)
    try { await onAccess(doc, 'Document Downloaded') } catch { /* honest toast handled globally */ }
  }

  async function handleView(doc) {
    showToast(`Viewing "${doc.title}"…`)
    try { await onAccess(doc, 'Document Viewed') } catch { /* honest toast handled globally */ }
  }

  async function handleUpload() {
    if (!uploadForm.title.trim()) return
    setSaving(true)
    try {
      await onUpload({
        title: uploadForm.title.trim(),
        type: uploadForm.type,
        category: uploadForm.type,
        location: 'All',
        content: uploadForm.content || null,
      })
      setUploadModal(false)
      setUploadForm({ title: '', type: SENSITIVE_TYPES[0], content: '', file: null })
      showToast('Document saved to vault.')
    } catch (e) {
      showToast(e.message || 'Save failed.')
    }
    setSaving(false)
  }

  const expiringSoon = docs.filter(d => {
    if (!d.expires) return false
    const days = Math.ceil((new Date(d.expires) - today) / 86400000)
    return days >= 0 && days <= 60
  }).length
  const thisMonth = docs.filter(d => d.uploaded >= new Date().toISOString().slice(0, 7)).length

  return (
    <>
      {/* KPIs */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 20 }}>
        <KTile label="Sensitive Docs" value={docs.length} color="var(--t-accent)" />
        <KTile label="Confidential"   value={docs.filter(d => d.confidential).length} color="var(--t-text)" />
        <KTile label="Expiring Soon (60d)" value={expiringSoon}
          alert={expiringSoon > 0 ? 'amber' : undefined}
          color={expiringSoon > 0 ? 'var(--t-warn)' : 'var(--t-success)'} />
        <KTile label="Uploaded This Month" value={thisMonth} color="var(--t-text-muted)" />
      </div>

      {/* Filters + upload */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16, alignItems: 'flex-end' }}>
        <div style={{ flex: '1 1 200px' }}>
          <label style={SL.label}>Search</label>
          <input type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Title…" style={SL.input} />
        </div>
        <div style={{ flex: '0 0 200px' }}>
          <label style={SL.label}>Type</label>
          <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} style={SL.select}>
            <option value="All">All Types</option>
            {typeOptions.map(t => <option key={t}>{t}</option>)}
          </select>
        </div>
        <div style={{ alignSelf: 'flex-end' }}>
          <button className="btn" onClick={() => setUploadModal(true)}>Upload Sensitive Doc</button>
        </div>
      </div>

      {/* Cards grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 14 }}>
        {filtered.map(doc => {
          const days = doc.expires ? Math.ceil((new Date(doc.expires) - today) / 86400000) : null
          const expAlert = days !== null && days <= 60 && days >= 0
          return (
            <div key={doc.id} style={{ background: 'var(--t-surface)', border: `1px solid ${expAlert ? 'var(--t-warn)' : 'var(--t-line)'}`, padding: 18, position: 'relative' }}>
              {expAlert && <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'var(--t-warn)' }} />}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 10 }}>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--t-text-muted)', marginBottom: 5 }}>{doc.type}</div>
                  <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--t-text)', lineHeight: 1.4 }}>{doc.title}</div>
                </div>
                {doc.confidential && <Badge cls="red">Confidential</Badge>}
              </div>
              <div style={{ fontSize: 11, color: 'var(--t-text-faint)', marginBottom: 14 }}>
                Uploaded {fmtDate(doc.uploaded)} by {doc.uploadedBy}
                {doc.expires && <span style={{ marginLeft: 8, color: expAlert ? 'var(--t-warn)' : 'var(--t-text-faint)' }}>· Expires {fmtDate(doc.expires)}</span>}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="action-btn-sm" onClick={() => setConfirmDownload(doc)}>Download</button>
                <button className="action-btn-sm" onClick={() => handleView(doc)}>View</button>
              </div>
            </div>
          )
        })}
        {filtered.length === 0 && (
          <div style={{ gridColumn: '1 / -1', padding: 48, textAlign: 'center', color: 'var(--t-text-muted)' }}>
            {docs.length === 0 ? 'No sensitive documents stored yet. Use “Upload Sensitive Doc” to add one.' : 'No documents match.'}
          </div>
        )}
      </div>

      {/* Confirm download modal */}
      {confirmDownload && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)', zIndex: 9000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', padding: 32, maxWidth: 400, width: '90%' }}>
            <div style={{ fontWeight: 700, fontSize: 17, color: 'var(--t-text)', marginBottom: 6 }}>Confirm Download</div>
            <div style={{ fontSize: 12, color: 'var(--t-text-muted)', marginBottom: 24, lineHeight: 1.6 }}>
              Download <strong style={{ color: 'var(--t-text)' }}>{confirmDownload.title}</strong>? This action will be logged to the audit trail.
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="action-btn-sm" onClick={() => setConfirmDownload(null)}>Cancel</button>
              <button className="btn" onClick={confirmAndDownload}>Download</button>
            </div>
          </div>
        </div>
      )}

      {/* Upload modal */}
      {uploadModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)', zIndex: 9000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', padding: 32, maxWidth: 440, width: '90%' }}>
            <div style={{ fontWeight: 700, fontSize: 17, color: 'var(--t-text)', marginBottom: 20 }}>Upload Sensitive Document</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 24 }}>
              <div>
                <label style={SL.label}>Document Title *</label>
                <input type="text" value={uploadForm.title} onChange={e => setUploadForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Insurance Certificate 2026" style={SL.input} />
              </div>
              <div>
                <label style={SL.label}>Document Type</label>
                <select value={uploadForm.type} onChange={e => setUploadForm(f => ({ ...f, type: e.target.value }))} style={SL.select}>
                  {SENSITIVE_TYPES.map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label style={SL.label}>Notes / Content (optional)</label>
                <textarea value={uploadForm.content} onChange={e => setUploadForm(f => ({ ...f, content: e.target.value }))} rows={4} placeholder="Reference details, expiry, contacts…" style={{ ...SL.input, resize: 'vertical' }} />
              </div>
              <div>
                <label style={SL.label}>File</label>
                <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.docx,.png" onChange={e => setUploadForm(f => ({ ...f, file: e.target.files[0] || null }))} style={{ fontSize: 13, color: 'var(--t-text)', marginTop: 4, display: 'block' }} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="action-btn-sm" onClick={() => setUploadModal(false)} disabled={saving}>Cancel</button>
              <button className="btn" onClick={handleUpload} disabled={saving || !uploadForm.title.trim()}>{saving ? 'Saving…' : 'Save to Vault'}</button>
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
// TAB 3 — AUDIT TRAIL
// ════════════════════════════════════════════════════════════════════════════
function AuditTrail({ rows }) {
  const [actorFilter, setActorFilter] = useState('All')
  const [actionFilter, setActionFilter] = useState('All')
  const [dateFrom, setDateFrom]       = useState(iso30Ago())
  const [dateTo, setDateTo]           = useState(isoToday())
  const [docSearch, setDocSearch]     = useState('')

  const actors  = useMemo(() => ['All', ...[...new Set(rows.map(r => r.actor).filter(Boolean))].sort()], [rows])
  const actions = ['All', 'Viewed', 'Downloaded', 'Uploaded', 'Deleted']

  const filtered = useMemo(() => {
    return rows.filter(e => {
      if (actorFilter !== 'All' && e.actor !== actorFilter) return false
      if (actionFilter !== 'All' && e.action !== actionFilter) return false
      if (e.ts && (e.ts < dateFrom || e.ts > dateTo)) return false
      if (docSearch.trim() && !e.docTitle.toLowerCase().includes(docSearch.toLowerCase())) return false
      return true
    })
  }, [rows, actorFilter, actionFilter, dateFrom, dateTo, docSearch])

  const kpis = useMemo(() => ({
    total:      filtered.length,
    downloads:  filtered.filter(e => e.action === 'Downloaded').length,
    deletes:    filtered.filter(e => e.action === 'Deleted').length,
    uploads:    filtered.filter(e => e.action === 'Uploaded').length,
  }), [filtered])

  function downloadCSV() {
    const cols = ['Actor', 'Action', 'Document', 'Date', 'Location', 'Result']
    const csvRows = filtered.map(e => [e.actor, e.action, e.docTitle, e.ts, e.loc, e.result])
    const csv = [cols, ...csvRows].map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = `vault-audit-${isoToday()}.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  const actionColor = { Viewed: 'accent', Downloaded: 'blue', Uploaded: 'success', Deleted: 'red' }

  return (
    <>
      {/* KPIs */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 20 }}>
        <KTile label="Total Events" value={kpis.total}     color="var(--t-accent)" />
        <KTile label="Downloads"    value={kpis.downloads} color="var(--t-text)" />
        <KTile label="Uploads"      value={kpis.uploads}   color="var(--t-success)" />
        <KTile label="Deletions"    value={kpis.deletes}   alert={kpis.deletes > 0 ? 'amber' : undefined} color="var(--t-warn)" />
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16, alignItems: 'flex-end' }}>
        <div style={{ flex: '1 1 200px' }}>
          <label style={SL.label}>Search Document</label>
          <input type="search" value={docSearch} onChange={e => setDocSearch(e.target.value)} placeholder="Document title…" style={SL.input} />
        </div>
        <div style={{ flex: '0 0 160px' }}>
          <label style={SL.label}>Actor</label>
          <select value={actorFilter} onChange={e => setActorFilter(e.target.value)} style={SL.select}>
            {actors.map(a => <option key={a}>{a}</option>)}
          </select>
        </div>
        <div style={{ flex: '0 0 140px' }}>
          <label style={SL.label}>Action</label>
          <select value={actionFilter} onChange={e => setActionFilter(e.target.value)} style={SL.select}>
            {actions.map(a => <option key={a}>{a}</option>)}
          </select>
        </div>
        <div style={{ flex: '0 0 130px' }}>
          <label style={SL.label}>From</label>
          <input type="date" value={dateFrom} max={dateTo} onChange={e => setDateFrom(e.target.value)} style={SL.input} />
        </div>
        <div style={{ flex: '0 0 130px' }}>
          <label style={SL.label}>To</label>
          <input type="date" value={dateTo} min={dateFrom} max={isoToday()} onChange={e => setDateTo(e.target.value)} style={SL.input} />
        </div>
        <div style={{ alignSelf: 'flex-end' }}>
          <button className="action-btn-sm" onClick={downloadCSV}>Export</button>
        </div>
      </div>

      {/* Table */}
      <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'var(--t-surface-2)' }}>
                {['Actor', 'Action', 'Document', 'Date', 'Location'].map(h => (
                  <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 700, fontSize: 10, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--t-text-muted)', borderBottom: '1px solid var(--t-line)', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={5} style={{ padding: 40, textAlign: 'center', color: 'var(--t-text-muted)' }}>No document audit events match the current filters.</td></tr>
              ) : filtered.map((entry, i) => (
                <tr key={entry.id} style={{ borderBottom: '1px solid var(--t-line)', background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,.015)' }}>
                  <td style={{ padding: '9px 14px', fontWeight: 600, color: 'var(--t-text)', whiteSpace: 'nowrap' }}>{entry.actor}</td>
                  <td style={{ padding: '9px 14px', whiteSpace: 'nowrap' }}>
                    <Badge cls={actionColor[entry.action] || 'muted'}>{entry.action}</Badge>
                  </td>
                  <td style={{ padding: '9px 14px', color: 'var(--t-text-muted)', maxWidth: 280 }}>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }} title={entry.docTitle}>{entry.docTitle}</span>
                  </td>
                  <td style={{ padding: '9px 14px', color: 'var(--t-text-muted)', fontSize: 12, whiteSpace: 'nowrap' }}>{fmtDate(entry.ts)}</td>
                  <td style={{ padding: '9px 14px', color: 'var(--t-text-faint)', fontSize: 12, whiteSpace: 'nowrap' }}>{entry.loc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ padding: '8px 14px', borderTop: '1px solid var(--t-line)', fontSize: 11, color: 'var(--t-text-muted)' }}>
          {filtered.length} document event{filtered.length === 1 ? '' : 's'}
        </div>
      </div>
    </>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// ROOT
// ════════════════════════════════════════════════════════════════════════════
const TABS = ['Employee Records', 'Sensitive Documents', 'Audit Trail']

export default function DocVault() {
  const { session }     = useAuth()
  const { locationIds } = useScope()
  const person          = session?.person
  const actorId         = person?.id || null
  const actorName       = person?.full_name || null

  const [tab, setTab]         = useState(0)
  const [roster, setRoster]   = useState([])
  const [empDocs, setEmpDocs] = useState([])
  const [sensitive, setSensitive] = useState([])
  const [audit, setAudit]     = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)

  const authorized = isVaultAuthorized(person)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    const ids = locationIds && locationIds.length ? locationIds : null
    try {
      const [rRes, eRes, sRes, aRes] = await Promise.allSettled([
        sb.rpc('get_roster', { p_node_ids: ids, p_actor: actorId }),
        sb.rpc('docvault_employee_docs', { p_node_ids: ids }),
        sb.rpc('get_documents', { p_node_ids: ids }),
        sb.rpc('get_audit_log', { p_from: null, p_to: null, p_action: null, p_limit: 500, p_node_ids: ids }),
      ])
      if (rRes.status === 'fulfilled' && !rRes.value.error)
        setRoster((rRes.value.data || []).filter(p => p.is_active !== false))
      else setRoster([])

      setEmpDocs(eRes.status === 'fulfilled' && !eRes.value.error ? (eRes.value.data || []) : [])
      setSensitive(sRes.status === 'fulfilled' && !sRes.value.error ? dedupeDocs(sRes.value.data || []) : [])
      setAudit(aRes.status === 'fulfilled' && !aRes.value.error ? (aRes.value.data || []) : [])

      const firstErr = [rRes, eRes, sRes, aRes].find(r => r.status === 'rejected' || r.value?.error)
      if (firstErr && rRes.value?.error) setError(rRes.value.error.message)
    } catch (e) {
      setError(e.message || 'Failed to load vault.')
    }
    setLoading(false)
  }, [locationIds, actorId])

  useEffect(() => { if (authorized) load() }, [authorized, load])

  const folders   = useMemo(() => buildFolders(roster, empDocs), [roster, empDocs])
  const sensitiveCards = useMemo(() => sensitive.map(dvMapDocRow), [sensitive])
  const docAudit  = useMemo(() => audit.filter(isDocAudit).map(mapAudit), [audit])

  // ── Write handlers (real RPCs, then refresh from server) ───────────────────
  const handleEmpUpload = useCallback(async (personId, docType, title) => {
    const { error: err } = await sb.rpc('docvault_upload_employee_doc', {
      p_person_id: personId, p_doc_type: docType, p_title: title || null,
      p_file_url: null, p_actor: actorId, p_actor_name: actorName,
    })
    if (err) throw err
    await load()
  }, [actorId, actorName, load])

  const handleEmpAccess = useCallback(async (docId, action) => {
    // Only stored docs have a uuid id; synthetic "missing" ids are never accessed.
    if (typeof docId !== 'string' || docId.includes(':')) return
    const { error: err } = await sb.rpc('docvault_log_access', {
      p_doc_id: docId, p_action: action, p_actor: actorId, p_actor_name: actorName,
    })
    if (err) throw err
    await load()
  }, [actorId, actorName, load])

  const handleSensitiveUpload = useCallback(async (form) => {
    const node = locationIds && locationIds.length ? locationIds[0] : null
    const { error: err } = await sb.rpc('docvault_save_document', {
      p_name: form.title, p_type: form.type, p_category: form.category || form.type,
      p_location: form.location || 'All', p_node_id: node, p_content: form.content || null,
      p_actor: actorId, p_actor_name: actorName,
    })
    if (err) throw err
    await load()
  }, [locationIds, actorId, actorName, load])

  const handleSensitiveAccess = useCallback(async (doc, action) => {
    const { error: err } = await sb.rpc('write_audit', {
      p_actor_id: actorId, p_actor_name: actorName, p_actor_role: person?.role_name || null,
      p_action: action, p_target: doc.title, p_node_name: null, p_result: 'Success',
      p_meta: { doc_id: doc.id, source: 'DocVault' },
    })
    if (err) throw err
    await load()
  }, [actorId, actorName, person, load])

  // ── Global header KPIs (all real) ──────────────────────────────────────────
  const totalEmpDocs = empDocs.length
  const missingI9    = useMemo(
    () => roster.filter(p => !empDocs.some(d => d.person_id === p.id && d.doc_type === 'I-9')).length,
    [roster, empDocs],
  )
  const requiredExpected = roster.length * REQUIRED_EMP_DOCS.length
  const requiredPresent  = useMemo(
    () => folders.reduce((s, f) => s + f.docs.filter(d => REQUIRED_EMP_DOCS.includes(d.docType) && d.present).length, 0),
    [folders],
  )
  const compliancePct = requiredExpected > 0 ? Math.round((requiredPresent / requiredExpected) * 100) : 0
  const lastAudit     = docAudit[0]?.ts

  if (!authorized) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 400, gap: 14, textAlign: 'center' }}>
        <div style={{ width: 56, height: 56, background: 'rgba(255,77,125,.1)', border: '1px solid rgba(255,77,125,.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>🔒</div>
        <div style={{ fontWeight: 700, fontSize: 18, color: 'var(--t-text)' }}>Vault Access Restricted</div>
        <div style={{ fontSize: 13, color: 'var(--t-text-muted)', maxWidth: 360 }}>
          Vault access restricted to HR Manager, COO, and Owner/Admin roles. Contact your administrator.
        </div>
      </div>
    )
  }

  return (
    <>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
            <div style={{ fontWeight: 800, fontSize: 22, letterSpacing: '-.02em', color: 'var(--t-text)' }}>Document Vault</div>
            <Badge cls="red">HR Only</Badge>
          </div>
          <div style={{ fontSize: 13, color: 'var(--t-text-muted)' }}>
            Secure storage for employee records, legal documents, and sensitive files.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-ghost" onClick={() => setTab(2)} style={{ fontSize: 12 }}>Audit Trail</button>
        </div>
      </div>

      {error && (
        <div style={{ marginBottom: 16, padding: '10px 14px', border: '1px solid var(--t-danger)', background: 'rgba(255,77,125,.08)', color: 'var(--t-danger)', fontSize: 12 }}>
          Could not load vault data: {error}
        </div>
      )}

      {/* Global KPI strip */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 20 }}>
        <KTile label="Secured Documents" value={totalEmpDocs + sensitive.length} color="var(--t-accent)" />
        <KTile label="Employee Folders"  value={roster.length} color="var(--t-text)" />
        <KTile label="Sensitive Docs"    value={sensitive.length} color="var(--t-text-muted)" />
        <KTile label="Missing I-9s"      value={missingI9}
          alert={missingI9 > 0 ? 'red' : undefined}
          color={missingI9 > 0 ? 'var(--t-danger)' : 'var(--t-success)'}
          sub={missingI9 > 0 ? 'Compliance risk' : 'All on file'} />
        <KTile label="Last Audit"        value={lastAudit ? fmtDate(lastAudit) : '—'} color="var(--t-text-muted)" />
        <KTile label="Req. Doc Coverage" value={`${compliancePct}%`}
          color={compliancePct >= 90 ? 'var(--t-success)' : compliancePct >= 60 ? 'var(--t-warn)' : 'var(--t-danger)'}
          sub="Required docs on file" />
      </div>

      <TabBar tabs={TABS} active={tab} onChange={setTab} />

      {loading ? (
        <div style={{ padding: 80, textAlign: 'center', color: 'var(--t-text-muted)' }}>Loading vault…</div>
      ) : (
        <>
          {tab === 0 && <EmployeeRecords roster={roster} folders={folders} docAudit={docAudit} onUpload={handleEmpUpload} onAccess={handleEmpAccess} />}
          {tab === 1 && <SensitiveDocuments docs={sensitiveCards} onUpload={handleSensitiveUpload} onAccess={handleSensitiveAccess} />}
          {tab === 2 && <AuditTrail rows={docAudit} />}
        </>
      )}
    </>
  )
}
