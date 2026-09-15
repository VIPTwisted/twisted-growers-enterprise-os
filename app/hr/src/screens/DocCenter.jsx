import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { sb } from '../lib/supabase'
import { useAuth } from '../lib/auth.jsx'
import { useScope } from '../lib/scope.jsx'
import DrillDown from '../components/DrillDown.jsx'

// ── Auth guard ──────────────────────────────────────────────────────────────
function isHR(person) {
  if (!person?.role_name) return false
  const r = person.role_name.toLowerCase()
  return ['ceo', 'hr', 'manager', 'coo', 'admin', 'owner'].some(k => r.includes(k))
}

// ── Constants (reference enum labels — not data) ─────────────────────────────
const CATEGORIES = ['Policies', 'Forms', 'Training Materials', 'Legal', 'HR Templates', 'Operations', 'Benefits', 'Marketing']
const ACCESS_LEVELS = ['All Employees', 'Managers Only', 'HR Only']

const CAT_BADGE = {
  'Policies':          'blue',
  'Forms':             'accent',
  'Training Materials':'green',
  'Legal':             'red',
  'HR Templates':      'purple',
  'Operations':        'warn',
  'Benefits':          'success',
  'Marketing':         'muted',
}

// ── Shared helpers ──────────────────────────────────────────────────────────
function fmtDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function isoToday() { return new Date().toISOString().split('T')[0] }
function iso30Ago() {
  const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString().split('T')[0]
}

// ── KPI Tile ────────────────────────────────────────────────────────────────
function KTile({ label, value, sub, color, alert: alertLevel, onClick }) {
  return (
    <div onClick={onClick} title={onClick ? 'Click to drill into records' : undefined} style={{
      background: 'var(--t-surface)',
      border: `1px solid ${alertLevel === 'red' ? 'var(--t-danger)' : alertLevel === 'amber' ? 'var(--t-warn)' : 'var(--t-line)'}`,
      padding: '14px 16px',
      position: 'relative',
      overflow: 'hidden',
      flex: '1 1 140px',
      minWidth: 0,
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

// ── Badge ───────────────────────────────────────────────────────────────────
function Badge({ cls, children }) {
  return <span className={`badge ${cls}`} style={{ whiteSpace: 'nowrap' }}>{children}</span>
}

// ── Tab bar ──────────────────────────────────────────────────────────────────
function TabBar({ tabs, active, onChange }) {
  return (
    <div style={{ display: 'flex', borderBottom: '1px solid var(--t-line)', marginBottom: 24, gap: 0 }}>
      {tabs.map((t, i) => (
        <button
          key={t}
          onClick={() => onChange(i)}
          style={{
            background: 'transparent',
            border: 'none',
            borderBottom: active === i ? '2px solid var(--t-accent)' : '2px solid transparent',
            color: active === i ? 'var(--t-text)' : 'var(--t-text-muted)',
            fontWeight: active === i ? 700 : 500,
            fontSize: 13,
            letterSpacing: '.04em',
            padding: '10px 18px',
            cursor: 'pointer',
            transition: 'color .15s, border-color .15s',
            whiteSpace: 'nowrap',
          }}
        >{t}</button>
      ))}
    </div>
  )
}

// ── Shared input styles ──────────────────────────────────────────────────────
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

// ════════════════════════════════════════════════════════════════════════════
// TAB 1 — LIBRARY
// ════════════════════════════════════════════════════════════════════════════
function Library({ docs, reload, locations, actor, nodeIds }) {
  const [search, setSearch]   = useState('')
  const [catF, setCatF]       = useState('All')
  const [accessF, setAccessF] = useState('All')
  const [locF, setLocF]       = useState('All')
  const [confirmArchive, setConfirmArchive] = useState(null)
  const [distributeDoc, setDistributeDoc]   = useState(null)
  const [distTarget, setDistTarget]         = useState('all')
  const [distSig, setDistSig]               = useState(false)
  const [distBusy, setDistBusy]             = useState(false)
  const [toast, setToast]     = useState(null)
  const [drill, setDrill]     = useState(null)

  const LOC_OPTIONS = useMemo(() => ['All', ...locations.map(l => l.name)], [locations])
  const DIST_TARGETS = useMemo(() => ([
    { value: 'all',      label: 'All Employees' },
    { value: 'managers', label: 'Managers Only' },
    { value: 'hr',       label: 'HR Only' },
    ...locations.map(l => ({ value: `loc:${l.id}`, label: l.name })),
  ]), [locations])

  const DOC_COLS = [
    { key: 'title', label: 'Document', value: d => d.title },
    { key: 'category', label: 'Category', value: d => d.category },
    { key: 'version', label: 'Version', value: d => d.version },
    { key: 'access', label: 'Access', value: d => d.access },
    { key: 'author', label: 'Author', value: d => d.author },
    { key: 'completion', label: 'Read', value: d => `${d.readCount}/${d.totalRec}`, align: 'right', sortKey: d => d.readCount / Math.max(d.totalRec, 1) },
    { key: 'updated', label: 'Updated', value: d => fmtDate(d.updated), sortKey: d => d.updated },
  ]
  const openDrill = (title, rows, accent) => setDrill({ title, subtitle: `${rows.length} document${rows.length === 1 ? '' : 's'}`, columns: DOC_COLS, rows, accent })

  function showToast(msg, type = 'success') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  const active = useMemo(() => docs.filter(d => !d.archived), [docs])

  const filtered = useMemo(() => {
    return active.filter(d => {
      if (catF !== 'All' && d.category !== catF) return false
      if (accessF !== 'All' && d.access !== accessF) return false
      if (locF !== 'All' && d.location !== locF && d.location !== 'All') return false
      if (search.trim()) {
        const q = search.toLowerCase()
        if (![d.title, d.category, d.author].join(' ').toLowerCase().includes(q)) return false
      }
      return true
    })
  }, [active, catF, accessF, locF, search])

  const kpis = useMemo(() => {
    const required = active.filter(d => d.required)
    const outstanding = required.filter(d => d.readCount < d.totalRec)
    const completionSum = active.reduce((s, d) => s + (d.readCount / Math.max(d.totalRec, 1)) * 100, 0)
    const now = new Date(); const mo = new Date(now.getFullYear(), now.getMonth(), 1)
    const newThisMonth = active.filter(d => new Date(d.updated) >= mo).length
    return {
      total: active.length,
      policies: active.filter(d => d.category === 'Policies').length,
      outstanding: outstanding.length,
      completion: active.length ? Math.round(completionSum / active.length) : 0,
      newThisMonth,
      archived: docs.filter(d => d.archived).length,
    }
  }, [active, docs])

  async function doArchive(id) {
    setConfirmArchive(null)
    try {
      const { data, error } = await sb.rpc('doccenter_archive_document', { p_document_id: id, p_actor: actor || null })
      if (error || (data && data.ok === false)) throw error || new Error(data?.error || 'Archive failed')
      showToast('Document archived.')
      await reload()
    } catch (e) {
      showToast(e?.message || 'Could not archive document.', 'error')
    }
  }

  async function doDistribute(doc) {
    setDistBusy(true)
    let roleFilter = null, targetNode = null
    if (distTarget.startsWith('loc:')) targetNode = distTarget.slice(4)
    else if (distTarget === 'managers') roleFilter = 'manager'
    else if (distTarget === 'hr') roleFilter = 'hr'
    try {
      const { data, error } = await sb.rpc('doccenter_distribute', {
        p_document_id: doc.id,
        p_role_filter: roleFilter,
        p_target_node: targetNode,
        p_sig_required: distSig,
        p_node_ids: nodeIds || null,
        p_actor: actor || null,
      })
      if (error || (data && data.ok === false)) throw error || new Error(data?.error || 'Distribution failed')
      const n = data?.count ?? 0
      setDistributeDoc(null); setDistTarget('all'); setDistSig(false)
      showToast(n > 0 ? `Sent "${doc.title}" to ${n} employee${n === 1 ? '' : 's'}.` : 'No matching recipients in scope.', n > 0 ? 'success' : 'error')
      await reload()
    } catch (e) {
      showToast(e?.message || 'Could not distribute document.', 'error')
    } finally {
      setDistBusy(false)
    }
  }

  return (
    <>
      {/* KPIs */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 20 }}>
        <KTile label="Total Docs"     value={kpis.total}       color="var(--t-accent)"
          onClick={() => openDrill('All Active Documents', active, 'var(--t-accent)')} />
        <KTile label="Active Policies" value={kpis.policies}   color="var(--t-text)"
          onClick={() => openDrill('Active Policies', active.filter(d => d.category === 'Policies'), 'var(--t-accent)')} />
        <KTile label="Req. Reads Outstanding" value={kpis.outstanding}
          alert={kpis.outstanding > 0 ? 'red' : undefined}
          color={kpis.outstanding > 0 ? 'var(--t-danger)' : 'var(--t-success)'}
          sub={kpis.outstanding > 0 ? 'Action required' : 'All current'}
          onClick={() => openDrill('Required Reads Outstanding', active.filter(d => d.required && d.readCount < d.totalRec), 'var(--t-danger)')} />
        <KTile label="Completion Rate"   value={`${kpis.completion}%`} color="var(--t-success)"
          onClick={() => openDrill('Completion Rate — All Documents', active, 'var(--t-success)')} />
        <KTile label="New This Month"    value={kpis.newThisMonth}     color="var(--t-text)"
          onClick={() => { const now = new Date(); const mo = new Date(now.getFullYear(), now.getMonth(), 1); openDrill('New This Month', active.filter(d => new Date(d.updated) >= mo), 'var(--t-accent)') }} />
        <KTile label="Archived"          value={kpis.archived}         color="var(--t-text-muted)"
          onClick={() => openDrill('Archived Documents', docs.filter(d => d.archived), 'var(--t-text-muted)')} />
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16, alignItems: 'flex-end' }}>
        <div style={{ flex: '1 1 220px' }}>
          <label style={SL.label}>Search</label>
          <input type="search" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Title, author, category…" style={SL.input} />
        </div>
        <div style={{ flex: '0 0 160px' }}>
          <label style={SL.label}>Category</label>
          <select value={catF} onChange={e => setCatF(e.target.value)} style={SL.select}>
            <option value="All">All Categories</option>
            {CATEGORIES.map(c => <option key={c}>{c}</option>)}
          </select>
        </div>
        <div style={{ flex: '0 0 160px' }}>
          <label style={SL.label}>Access Level</label>
          <select value={accessF} onChange={e => setAccessF(e.target.value)} style={SL.select}>
            <option value="All">All Access Levels</option>
            {ACCESS_LEVELS.map(a => <option key={a}>{a}</option>)}
          </select>
        </div>
        <div style={{ flex: '0 0 150px' }}>
          <label style={SL.label}>Location</label>
          <select value={locF} onChange={e => setLocF(e.target.value)} style={SL.select}>
            {LOC_OPTIONS.map(l => <option key={l}>{l}</option>)}
          </select>
        </div>
      </div>

      {/* Table */}
      <div style={{ border: '1px solid var(--t-line)', background: 'var(--t-surface)' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'var(--t-surface-2)' }}>
                {['Title', 'Category', 'Version', 'Updated', 'Access', 'Req. Read', 'Completion', 'Actions'].map(h => (
                  <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 700, fontSize: 10, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--t-text-muted)', borderBottom: '1px solid var(--t-line)', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={8} style={{ padding: 40, textAlign: 'center', color: 'var(--t-text-muted)' }}>No documents match the current filters.</td></tr>
              ) : filtered.map((doc, i) => {
                const pct = Math.round((doc.readCount / Math.max(doc.totalRec, 1)) * 100)
                return (
                  <tr key={doc.id} style={{ borderBottom: '1px solid var(--t-line)', background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,.015)' }}>
                    <td style={{ padding: '10px 12px', maxWidth: 260 }}>
                      <div style={{ fontWeight: 600, color: 'var(--t-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={doc.title}>{doc.title}</div>
                      <div style={{ fontSize: 11, color: 'var(--t-text-faint)', marginTop: 2 }}>{doc.author}</div>
                    </td>
                    <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
                      <Badge cls={CAT_BADGE[doc.category] || 'muted'}>{doc.category}</Badge>
                    </td>
                    <td style={{ padding: '10px 12px', color: 'var(--t-text-muted)', fontFamily: 'monospace', fontSize: 12, whiteSpace: 'nowrap' }}>{doc.version}</td>
                    <td style={{ padding: '10px 12px', color: 'var(--t-text-muted)', fontSize: 12, whiteSpace: 'nowrap' }}>{fmtDate(doc.updated)}</td>
                    <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
                      <Badge cls={doc.access === 'All Employees' ? 'success' : doc.access === 'Managers Only' ? 'warn' : 'red'}>
                        {doc.access === 'All Employees' ? 'All' : doc.access === 'Managers Only' ? 'Mgr+' : 'HR Only'}
                      </Badge>
                    </td>
                    <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
                      {doc.required ? <Badge cls="red">Required</Badge> : <span style={{ color: 'var(--t-text-faint)', fontSize: 11 }}>—</span>}
                    </td>
                    <td style={{ padding: '10px 12px', minWidth: 110 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ flex: 1, height: 5, background: 'var(--t-line)', position: 'relative' }}>
                          <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${pct}%`, background: pct >= 80 ? 'var(--t-success)' : pct >= 50 ? 'var(--t-warn)' : 'var(--t-danger)' }} />
                        </div>
                        <span style={{ fontSize: 11, color: 'var(--t-text-muted)', whiteSpace: 'nowrap' }}>{doc.readCount}/{doc.totalRec}</span>
                      </div>
                    </td>
                    <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
                      <div style={{ display: 'flex', gap: 5 }}>
                        <button className="action-btn-sm" onClick={() => alert(`Viewing: ${doc.title}`)}>View</button>
                        <button className="action-btn-sm" onClick={() => setDistributeDoc(doc)}>Distribute</button>
                        <button className="action-btn-sm" onClick={() => setConfirmArchive(doc)} style={{ color: 'var(--t-text-muted)', borderColor: 'var(--t-line)' }}>Archive</button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <div style={{ padding: '8px 14px', borderTop: '1px solid var(--t-line)', fontSize: 11, color: 'var(--t-text-muted)' }}>
          {filtered.length} of {active.length} documents
        </div>
      </div>

      {/* Archive confirm */}
      {confirmArchive && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.65)', zIndex: 9000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', padding: 32, maxWidth: 420, width: '90%' }}>
            <div style={{ fontWeight: 700, fontSize: 17, color: 'var(--t-text)', marginBottom: 10 }}>Archive Document?</div>
            <div style={{ color: 'var(--t-text-muted)', fontSize: 13, marginBottom: 24, lineHeight: 1.6 }}>
              <strong style={{ color: 'var(--t-text)' }}>{confirmArchive.title}</strong> will be moved to the archive. It will no longer appear in the active library.
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="action-btn-sm" onClick={() => setConfirmArchive(null)}>Cancel</button>
              <button className="btn" onClick={() => doArchive(confirmArchive.id)} style={{ background: 'var(--t-warn)' }}>Archive</button>
            </div>
          </div>
        </div>
      )}

      {/* Distribute modal */}
      {distributeDoc && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.65)', zIndex: 9000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', padding: 32, maxWidth: 440, width: '90%' }}>
            <div style={{ fontWeight: 700, fontSize: 17, color: 'var(--t-text)', marginBottom: 10 }}>Distribute Document</div>
            <div style={{ fontSize: 13, color: 'var(--t-text-muted)', marginBottom: 20 }}>
              <strong style={{ color: 'var(--t-text)' }}>{distributeDoc.title}</strong>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 24 }}>
              <div>
                <label style={SL.label}>Send To</label>
                <select value={distTarget} onChange={e => setDistTarget(e.target.value)} style={SL.select}>
                  {DIST_TARGETS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 13, color: 'var(--t-text)' }}>
                <input type="checkbox" checked={distSig} onChange={e => setDistSig(e.target.checked)} style={{ accentColor: 'var(--t-accent)' }} />
                Require acknowledgment signature
              </label>
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="action-btn-sm" onClick={() => setDistributeDoc(null)} disabled={distBusy}>Cancel</button>
              <button className="btn" onClick={() => doDistribute(distributeDoc)} disabled={distBusy} style={{ opacity: distBusy ? 0.5 : 1 }}>
                {distBusy ? 'Sending…' : 'Send to Employees'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 9999,
          background: toast.type === 'error' ? 'var(--t-danger)' : 'var(--t-success)',
          color: '#fff', padding: '12px 20px', fontWeight: 600, fontSize: 13,
          boxShadow: '0 8px 32px rgba(0,0,0,.4)',
        }}>{toast.msg}</div>
      )}

      <DrillDown open={!!drill} onClose={() => setDrill(null)} {...(drill || {})} />
    </>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// TAB 2 — UPLOAD & CREATE
// ════════════════════════════════════════════════════════════════════════════
function UploadCreate({ reload, actor, actorName, locations }) {
  const fileRef = useRef(null)
  const [dragging, setDragging]     = useState(false)
  const [file, setFile]             = useState(null)
  const [form, setForm]             = useState({
    title: '', category: 'Policies', version: 'v1.0',
    access: 'All Employees', required: false,
    effectiveDate: isoToday(), description: '',
    location: 'All',
  })
  const [saving, setSaving]         = useState(false)
  const [saved, setSaved]           = useState(false)
  const [err, setErr]               = useState(null)

  const LOC_OPTIONS = useMemo(() => ['All', ...locations.map(l => l.name)], [locations])

  function setF(k, v) { setForm(f => ({ ...f, [k]: v })) }

  function handleDrop(e) {
    e.preventDefault(); setDragging(false)
    const f = e.dataTransfer.files[0]; if (f) { setFile(f); setF('title', f.name.replace(/\.[^.]+$/, '')) }
  }

  async function handleSave() {
    if (!form.title.trim()) { setErr('Title is required.'); return }
    setErr(null); setSaving(true)
    const node = locations.find(l => l.name === form.location)
    try {
      const { data, error } = await sb.rpc('doccenter_create_document', {
        p_title: form.title.trim(),
        p_category: form.category,
        p_version: form.version,
        p_access: form.access,
        p_required: form.required,
        p_node_id: node ? node.id : null,
        p_description: form.description || null,
        p_effective_date: form.effectiveDate || null,
        p_author: actorName || null,
        p_actor: actor || null,
      })
      if (error || (data && data.ok === false)) throw error || new Error(data?.error || 'Save failed')
      setFile(null)
      setForm({ title: '', category: 'Policies', version: 'v1.0', access: 'All Employees', required: false, effectiveDate: isoToday(), description: '', location: 'All' })
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
      await reload()
    } catch (e) {
      setErr(e?.message || 'Could not save document.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 20, alignItems: 'start' }}>
      {/* Left: form */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        {/* Drop zone */}
        <div
          onClick={() => fileRef.current?.click()}
          onDragOver={e => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          style={{
            border: `2px dashed ${dragging ? 'var(--t-accent)' : file ? 'var(--t-success)' : 'var(--t-line)'}`,
            background: dragging ? 'rgba(0,229,255,.04)' : file ? 'rgba(29,233,182,.04)' : 'var(--t-surface-2)',
            padding: '48px 24px', textAlign: 'center', cursor: 'pointer', transition: 'all .2s',
          }}
        >
          <input ref={fileRef} type="file" accept=".pdf,.docx,.doc,.jpg,.png,.txt" style={{ display: 'none' }} onChange={e => { const f = e.target.files[0]; if (f) { setFile(f); setF('title', f.name.replace(/\.[^.]+$/, '')) } }} />
          <div style={{ fontSize: 30, marginBottom: 10, color: file ? 'var(--t-success)' : 'var(--t-text-muted)' }}>{file ? '✓' : '↑'}</div>
          {file ? (
            <div>
              <div style={{ fontWeight: 700, color: 'var(--t-success)' }}>{file.name}</div>
              <div style={{ fontSize: 11, color: 'var(--t-text-muted)', marginTop: 4 }}>{(file.size / 1024).toFixed(1)} KB — click to change</div>
            </div>
          ) : (
            <div>
              <div style={{ fontWeight: 600, color: 'var(--t-text)', marginBottom: 4 }}>Drag & drop or click to browse</div>
              <div style={{ fontSize: 11, color: 'var(--t-text-muted)' }}>PDF, DOCX, JPG, PNG supported</div>
            </div>
          )}
        </div>

        {/* Metadata form */}
        <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={SL.label}>Document Title *</label>
            <input type="text" value={form.title} onChange={e => setF('title', e.target.value)}
              placeholder="e.g. PTO Policy 2026" style={SL.input} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div>
              <label style={SL.label}>Category</label>
              <select value={form.category} onChange={e => setF('category', e.target.value)} style={SL.select}>
                {CATEGORIES.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label style={SL.label}>Version</label>
              <input type="text" value={form.version} onChange={e => setF('version', e.target.value)} style={SL.input} placeholder="v1.0" />
            </div>
            <div>
              <label style={SL.label}>Access Level</label>
              <select value={form.access} onChange={e => setF('access', e.target.value)} style={SL.select}>
                {ACCESS_LEVELS.map(a => <option key={a}>{a}</option>)}
              </select>
            </div>
            <div>
              <label style={SL.label}>Location</label>
              <select value={form.location} onChange={e => setF('location', e.target.value)} style={SL.select}>
                {LOC_OPTIONS.map(l => <option key={l}>{l}</option>)}
              </select>
            </div>
            <div>
              <label style={SL.label}>Effective Date</label>
              <input type="date" value={form.effectiveDate} onChange={e => setF('effectiveDate', e.target.value)} style={SL.input} />
            </div>
          </div>
          <div>
            <label style={SL.label}>Description</label>
            <textarea value={form.description} onChange={e => setF('description', e.target.value)}
              placeholder="Brief summary of this document…" rows={3}
              style={{ ...SL.input, resize: 'vertical', lineHeight: 1.6 }} />
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 13, color: 'var(--t-text)' }}>
            <input type="checkbox" checked={form.required} onChange={e => setF('required', e.target.checked)} style={{ accentColor: 'var(--t-accent)' }} />
            Required Read — all employees in access level must acknowledge
          </label>

          {err && <div style={{ color: 'var(--t-danger)', fontSize: 12, fontWeight: 600 }}>{err}</div>}
          {saved && <div style={{ color: 'var(--t-success)', fontSize: 12, fontWeight: 600 }}>Document saved to library.</div>}

          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn" onClick={handleSave} disabled={saving} style={{ opacity: saving ? 0.5 : 1 }}>
              {saving ? 'Saving…' : 'Save to Library'}
            </button>
          </div>
        </div>
      </div>

      {/* Right: guidelines */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* Quick tips */}
        <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', padding: 18 }}>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--t-text-muted)', marginBottom: 12 }}>Upload Guidelines</div>
          {[
            'Use clear, descriptive titles — include year for annual policies.',
            'Set access level before distributing sensitive documents.',
            'Mark required-read policies to track compliance automatically.',
            'Use consistent version naming: v1.0, v2.0, v2.1.',
          ].map((tip, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 10, alignItems: 'flex-start' }}>
              <span style={{ color: 'var(--t-accent)', fontWeight: 700, fontSize: 12, marginTop: 1 }}>→</span>
              <span style={{ fontSize: 12, color: 'var(--t-text-muted)', lineHeight: 1.5 }}>{tip}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// TAB 3 — DISTRIBUTION LOG
// ════════════════════════════════════════════════════════════════════════════
function DistributionLog({ rows }) {
  const [docFilter, setDocFilter]   = useState('All')
  const [dateFrom, setDateFrom]     = useState(iso30Ago())
  const [dateTo, setDateTo]         = useState(isoToday())
  const [sigFilter, setSigFilter]   = useState('All')

  const filtered = useMemo(() => {
    return rows.filter(r => {
      if (docFilter !== 'All' && r.docTitle !== docFilter) return false
      if (r.sentDate < dateFrom || r.sentDate > dateTo) return false
      if (sigFilter === 'Required' && !r.sigRequired) return false
      if (sigFilter === 'Not Required' && r.sigRequired) return false
      return true
    })
  }, [rows, docFilter, dateFrom, dateTo, sigFilter])

  const docTitles = useMemo(() => [...new Set(rows.map(r => r.docTitle))], [rows])
  const [drill, setDrill] = useState(null)

  const DIST_COLS = [
    { key: 'docTitle', label: 'Document', value: r => r.docTitle },
    { key: 'recipient', label: 'Recipient', value: r => r.recipient },
    { key: 'sentDate', label: 'Sent', value: r => fmtDate(r.sentDate), sortKey: r => r.sentDate },
    { key: 'sigRequired', label: 'Sig. Required', value: r => (r.sigRequired ? 'Yes' : 'No') },
    { key: 'completed', label: 'Status', value: r => (r.completed ? 'Completed' : 'Pending') },
  ]
  const openDrill = (title, rows, accent) => setDrill({ title, subtitle: `${rows.length} distribution${rows.length === 1 ? '' : 's'}`, columns: DIST_COLS, rows, accent })

  const kpis = useMemo(() => {
    const total = filtered.length
    const completed = filtered.filter(r => r.completed).length
    const pct = total ? Math.round((completed / total) * 100) : 0
    const sigPending = filtered.filter(r => r.sigRequired && !r.completed).length
    return { total, completed, pct, sigPending }
  }, [filtered])

  return (
    <>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 20 }}>
        <KTile label="Distributions" value={kpis.total}     color="var(--t-accent)"
          onClick={() => openDrill('Distributions', filtered, 'var(--t-accent)')} />
        <KTile label="Completed"      value={kpis.completed} color="var(--t-success)"
          onClick={() => openDrill('Completed Distributions', filtered.filter(r => r.completed), 'var(--t-success)')} />
        <KTile label="Completion %"   value={`${kpis.pct}%`} color={kpis.pct >= 80 ? 'var(--t-success)' : 'var(--t-warn)'}
          onClick={() => openDrill('Completion — All Distributions', filtered, 'var(--t-success)')} />
        <KTile label="Sig. Pending"   value={kpis.sigPending} alert={kpis.sigPending > 0 ? 'amber' : undefined} color="var(--t-text)"
          onClick={() => openDrill('Signatures Pending', filtered.filter(r => r.sigRequired && !r.completed), 'var(--t-warn)')} />
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16, alignItems: 'flex-end' }}>
        <div style={{ flex: '1 1 200px' }}>
          <label style={SL.label}>Document</label>
          <select value={docFilter} onChange={e => setDocFilter(e.target.value)} style={SL.select}>
            <option value="All">All Documents</option>
            {docTitles.map(t => <option key={t}>{t}</option>)}
          </select>
        </div>
        <div style={{ flex: '0 0 140px' }}>
          <label style={SL.label}>From</label>
          <input type="date" value={dateFrom} max={dateTo} onChange={e => setDateFrom(e.target.value)} style={SL.input} />
        </div>
        <div style={{ flex: '0 0 140px' }}>
          <label style={SL.label}>To</label>
          <input type="date" value={dateTo} min={dateFrom} max={isoToday()} onChange={e => setDateTo(e.target.value)} style={SL.input} />
        </div>
        <div style={{ flex: '0 0 160px' }}>
          <label style={SL.label}>Signature</label>
          <select value={sigFilter} onChange={e => setSigFilter(e.target.value)} style={SL.select}>
            <option value="All">All</option>
            <option>Required</option>
            <option>Not Required</option>
          </select>
        </div>
      </div>

      <div style={{ border: '1px solid var(--t-line)', background: 'var(--t-surface)' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'var(--t-surface-2)' }}>
                {['Document', 'Recipient', 'Sent Date', 'Sig. Required', 'Status'].map(h => (
                  <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 700, fontSize: 10, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--t-text-muted)', borderBottom: '1px solid var(--t-line)', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={5} style={{ padding: 40, textAlign: 'center', color: 'var(--t-text-muted)' }}>No distribution records match the filters.</td></tr>
              ) : filtered.map((r, i) => (
                <tr key={r.id} style={{ borderBottom: '1px solid var(--t-line)', background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,.015)' }}>
                  <td style={{ padding: '9px 12px', maxWidth: 220 }}>
                    <div style={{ fontWeight: 500, color: 'var(--t-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.docTitle}>{r.docTitle}</div>
                  </td>
                  <td style={{ padding: '9px 12px', color: 'var(--t-text)' }}>{r.recipient}</td>
                  <td style={{ padding: '9px 12px', color: 'var(--t-text-muted)', fontSize: 12, whiteSpace: 'nowrap' }}>{fmtDate(r.sentDate)}</td>
                  <td style={{ padding: '9px 12px', whiteSpace: 'nowrap' }}>
                    {r.sigRequired ? <Badge cls="warn">Required</Badge> : <span style={{ color: 'var(--t-text-faint)', fontSize: 11 }}>—</span>}
                  </td>
                  <td style={{ padding: '9px 12px', whiteSpace: 'nowrap' }}>
                    <Badge cls={r.completed ? 'success' : 'red'}>{r.completed ? 'Completed' : 'Pending'}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ padding: '8px 14px', borderTop: '1px solid var(--t-line)', fontSize: 11, color: 'var(--t-text-muted)' }}>
          {filtered.length} records
        </div>
      </div>

      <DrillDown open={!!drill} onClose={() => setDrill(null)} {...(drill || {})} />
    </>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// TAB 4 — REPORTS
// ════════════════════════════════════════════════════════════════════════════
function Reports({ docs, empCompliance }) {
  const active = docs.filter(d => !d.archived)
  const required = active.filter(d => d.required)

  // Per-doc acknowledgment rates — derived from live read counts.
  const docAck = useMemo(() => {
    return required.map(doc => {
      const readPct = doc.totalRec > 0 ? Math.round((doc.readCount / doc.totalRec) * 100) : 0
      return { ...doc, readPct }
    }).sort((a, b) => a.readPct - b.readPct)
  }, [required])

  // By-location table — aggregated from the real per-employee compliance rows.
  const locCompliance = useMemo(() => {
    const byLoc = {}
    for (const e of empCompliance) {
      const loc = e.location || '—'
      const bucket = byLoc[loc] || (byLoc[loc] = { loc, employees: 0, total: 0, done: 0 })
      bucket.employees += 1
      bucket.total += e.total
      bucket.done += e.completed
    }
    return Object.values(byLoc)
      .map(r => ({ ...r, pct: r.total ? Math.round((r.done / r.total) * 100) : 0 }))
      .sort((a, b) => a.loc.localeCompare(b.loc))
  }, [empCompliance])

  const overallPct = empCompliance.length ? Math.round(empCompliance.reduce((s, e) => s + e.pct, 0) / empCompliance.length) : 0

  // Download CSV
  function downloadEmpCSV() {
    const cols = ['Employee', 'Location', 'Required Docs', 'Completed', 'Compliance %', 'Overdue']
    const rows = empCompliance.map(e => [e.emp, e.location, e.total, e.completed, `${e.pct}%`, e.overdue])
    const csv = [cols, ...rows].map(r => r.map(c => `"${c}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = `doc-compliance-${isoToday()}.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  const overallAlert = overallPct < 70 ? 'red' : overallPct < 85 ? 'amber' : undefined

  const [drill, setDrill] = useState(null)
  const EMP_COLS = [
    { key: 'emp', label: 'Employee', value: e => e.emp },
    { key: 'location', label: 'Location', value: e => e.location },
    { key: 'completed', label: 'Completed', value: e => `${e.completed}/${e.total}`, align: 'right', sortKey: e => e.completed },
    { key: 'overdue', label: 'Overdue', value: e => e.overdue, align: 'right', sortKey: e => e.overdue },
    { key: 'pct', label: 'Compliance', value: e => `${e.pct}%`, align: 'right', sortKey: e => e.pct },
  ]
  const DOCREQ_COLS = [
    { key: 'title', label: 'Document', value: d => d.title },
    { key: 'category', label: 'Category', value: d => d.category },
    { key: 'version', label: 'Version', value: d => d.version },
    { key: 'readPct', label: 'Ack Rate', value: d => `${d.readPct}%`, align: 'right', sortKey: d => d.readPct },
    { key: 'reads', label: 'Reads', value: d => `${d.readCount}/${d.totalRec}`, align: 'right', sortKey: d => d.readCount },
    { key: 'updated', label: 'Updated', value: d => fmtDate(d.updated), sortKey: d => d.updated },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* KPIs */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <KTile label="Overall Compliance" value={`${overallPct}%`} alert={overallAlert}
          color={overallPct >= 85 ? 'var(--t-success)' : overallPct >= 70 ? 'var(--t-warn)' : 'var(--t-danger)'}
          onClick={() => setDrill({ title: 'Overall Compliance — By Employee', subtitle: `${empCompliance.length} employees`, columns: EMP_COLS, rows: empCompliance, accent: 'var(--t-success)' })} />
        <KTile label="Required Docs" value={required.length} color="var(--t-accent)"
          onClick={() => setDrill({ title: 'Required Documents', subtitle: `${docAck.length} documents`, columns: DOCREQ_COLS, rows: docAck, accent: 'var(--t-accent)' })} />
        <KTile label="Employees Tracked" value={empCompliance.length} color="var(--t-text)"
          onClick={() => setDrill({ title: 'Employees Tracked', subtitle: `${empCompliance.length} employees`, columns: EMP_COLS, rows: empCompliance, accent: 'var(--t-accent)' })} />
        <KTile label="Overdue Items" value={empCompliance.reduce((s, e) => s + e.overdue, 0)}
          alert={empCompliance.some(e => e.overdue > 0) ? 'red' : undefined}
          color="var(--t-danger)"
          onClick={() => setDrill({ title: 'Employees With Overdue Items', subtitle: `${empCompliance.filter(e => e.overdue > 0).length} employees`, columns: EMP_COLS, rows: empCompliance.filter(e => e.overdue > 0), accent: 'var(--t-danger)' })} />
      </div>

      {/* Document acknowledgment rates */}
      <div>
        <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--t-text)', marginBottom: 12 }}>Acknowledgment Rate by Document</div>
        <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)' }}>
          {docAck.map((doc, i) => (
            <div key={doc.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 16px', borderBottom: i < docAck.length - 1 ? '1px solid var(--t-line)' : 'none' }}>
              <div style={{ flex: 2, minWidth: 0 }}>
                <div style={{ fontWeight: 500, color: 'var(--t-text)', fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={doc.title}>{doc.title}</div>
                <div style={{ fontSize: 11, color: 'var(--t-text-faint)', marginTop: 2 }}>{fmtDate(doc.updated)}</div>
              </div>
              <div style={{ flex: 1, minWidth: 100 }}>
                <div style={{ height: 6, background: 'var(--t-line)', position: 'relative' }}>
                  <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${doc.readPct}%`, background: doc.readPct >= 80 ? 'var(--t-success)' : doc.readPct >= 50 ? 'var(--t-warn)' : 'var(--t-danger)' }} />
                </div>
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, color: doc.readPct >= 80 ? 'var(--t-success)' : doc.readPct >= 50 ? 'var(--t-warn)' : 'var(--t-danger)', minWidth: 44, textAlign: 'right' }}>{doc.readPct}%</div>
              <div style={{ fontSize: 11, color: 'var(--t-text-muted)', minWidth: 50, textAlign: 'right' }}>{doc.readCount}/{doc.totalRec}</div>
            </div>
          ))}
        </div>
      </div>

      {/* By-location table */}
      <div>
        <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--t-text)', marginBottom: 12 }}>Compliance by Location</div>
        <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'var(--t-surface-2)' }}>
                {['Location', 'Employees', 'Total Required', 'Completed', 'Compliance %'].map(h => (
                  <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 700, fontSize: 10, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--t-text-muted)', borderBottom: '1px solid var(--t-line)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {locCompliance.map((row, i) => (
                <tr key={row.loc} style={{ borderBottom: '1px solid var(--t-line)', background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,.015)' }}>
                  <td style={{ padding: '10px 14px', fontWeight: 600, color: 'var(--t-text)' }}>{row.loc}</td>
                  <td style={{ padding: '10px 14px', color: 'var(--t-text-muted)' }}>{row.employees}</td>
                  <td style={{ padding: '10px 14px', color: 'var(--t-text-muted)' }}>{row.total}</td>
                  <td style={{ padding: '10px 14px', color: 'var(--t-text-muted)' }}>{row.done}</td>
                  <td style={{ padding: '10px 14px' }}>
                    <span style={{ fontWeight: 700, color: row.pct >= 80 ? 'var(--t-success)' : row.pct >= 60 ? 'var(--t-warn)' : 'var(--t-danger)' }}>{row.pct}%</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Per-employee */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--t-text)' }}>Employee Compliance Detail</div>
          <button className="action-btn-sm" onClick={downloadEmpCSV}>Export CSV</button>
        </div>
        <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'var(--t-surface-2)' }}>
                {['Employee', 'Location', 'Completed', 'Overdue', 'Compliance'].map(h => (
                  <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 700, fontSize: 10, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--t-text-muted)', borderBottom: '1px solid var(--t-line)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...empCompliance].sort((a, b) => a.pct - b.pct).map((row, i) => (
                <tr key={row.emp} style={{ borderBottom: '1px solid var(--t-line)', background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,.015)' }}>
                  <td style={{ padding: '9px 14px', fontWeight: 600, color: 'var(--t-text)' }}>{row.emp}</td>
                  <td style={{ padding: '9px 14px', color: 'var(--t-text-muted)' }}>{row.location}</td>
                  <td style={{ padding: '9px 14px', color: 'var(--t-text-muted)' }}>{row.completed}/{row.total}</td>
                  <td style={{ padding: '9px 14px' }}>
                    {row.overdue > 0
                      ? <Badge cls="red">{row.overdue} Overdue</Badge>
                      : <span style={{ color: 'var(--t-text-faint)', fontSize: 11 }}>—</span>}
                  </td>
                  <td style={{ padding: '9px 14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 60, height: 5, background: 'var(--t-line)', position: 'relative' }}>
                        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${row.pct}%`, background: row.pct >= 80 ? 'var(--t-success)' : row.pct >= 50 ? 'var(--t-warn)' : 'var(--t-danger)' }} />
                      </div>
                      <span style={{ fontSize: 12, fontWeight: 700, color: row.pct >= 80 ? 'var(--t-success)' : row.pct >= 50 ? 'var(--t-warn)' : 'var(--t-danger)' }}>{row.pct}%</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <DrillDown open={!!drill} onClose={() => setDrill(null)} {...(drill || {})} />
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// ROOT
// ════════════════════════════════════════════════════════════════════════════
const TABS = ['Library', 'Upload & Create', 'Distribution Log', 'Reports']

export default function DocCenter() {
  const { session }              = useAuth()
  const { locationIds, locations } = useScope()
  const person          = session?.person
  const actor           = person?.id ?? null
  const actorName       = person?.full_name ?? null

  const [tab, setTab]   = useState(0)
  const [docs, setDocs] = useState([])
  const [distRows, setDistRows]     = useState([])
  const [empComp, setEmpComp]       = useState([])
  const [loading, setLoading]       = useState(true)
  const [loadErr, setLoadErr]       = useState(null)

  const nodeIds = locationIds?.length ? locationIds : null

  const reload = useCallback(async () => {
    setLoading(true); setLoadErr(null)
    try {
      const [docsRes, distRes, compRes] = await Promise.all([
        sb.rpc('doccenter_list_documents',     { p_node_ids: nodeIds }),
        sb.rpc('doccenter_distribution_log',   { p_node_ids: nodeIds }),
        sb.rpc('doccenter_employee_compliance',{ p_node_ids: nodeIds }),
      ])
      if (docsRes.error) throw docsRes.error
      setDocs(Array.isArray(docsRes.data) ? docsRes.data : [])
      setDistRows(!distRes.error && Array.isArray(distRes.data) ? distRes.data : [])
      setEmpComp(!compRes.error && Array.isArray(compRes.data) ? compRes.data : [])
    } catch (e) {
      setLoadErr(e?.message || 'Could not load documents.')
      setDocs([]); setDistRows([]); setEmpComp([])
    } finally {
      setLoading(false)
    }
  }, [nodeIds?.join(',')])

  useEffect(() => { reload() }, [reload])

  // HR gate
  if (!isHR(person)) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 400, gap: 14, textAlign: 'center' }}>
        <div style={{ width: 56, height: 56, background: 'rgba(255,77,125,.1)', border: '1px solid rgba(255,77,125,.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>🔒</div>
        <div style={{ fontWeight: 700, fontSize: 18, color: 'var(--t-text)' }}>HR Access Required</div>
        <div style={{ fontSize: 13, color: 'var(--t-text-muted)', maxWidth: 340 }}>Document Center is available to HR Manager, COO, and Admin roles.</div>
      </div>
    )
  }

  return (
    <>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 22, letterSpacing: '-.02em', color: 'var(--t-text)', marginBottom: 4 }}>
            Document Center
          </div>
          <div style={{ fontSize: 13, color: 'var(--t-text-muted)' }}>
            Manage, publish, and track all company documents across {companyName()}.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-ghost" onClick={() => setTab(3)} style={{ fontSize: 12 }}>Reports</button>
          <button className="btn" onClick={() => setTab(1)} style={{ fontSize: 12 }}>Upload Document</button>
        </div>
      </div>

      <TabBar tabs={TABS} active={tab} onChange={setTab} />

      {loadErr && (
        <div style={{ border: '1px solid var(--t-danger)', background: 'rgba(255,77,125,.06)', color: 'var(--t-danger)', padding: '10px 14px', fontSize: 12, fontWeight: 600, marginBottom: 16 }}>
          {loadErr}
        </div>
      )}
      {loading && docs.length === 0 && !loadErr ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--t-text-muted)', fontSize: 13 }}>Loading documents…</div>
      ) : (
        <>
          {tab === 0 && <Library docs={docs} reload={reload} locations={locations || []} actor={actor} nodeIds={nodeIds} />}
          {tab === 1 && <UploadCreate reload={reload} actor={actor} actorName={actorName} locations={locations || []} />}
          {tab === 2 && <DistributionLog rows={distRows} />}
          {tab === 3 && <Reports docs={docs} empCompliance={empComp} />}
        </>
      )}
    </>
  )
}
