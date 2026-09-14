import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { sb } from '../lib/supabase'
import { useAuth } from '../lib/auth.jsx'
import { useScope } from '../lib/scope.jsx'
import { useFeatureFlag } from '../lib/featureFlags.js'

// ── Real RPC helper ───────────────────────────────────────
async function callRpc(fn, args) {
  const { data, error } = await sb.rpc(fn, args)
  if (error) throw error
  return data
}

// ── KPI Tile ──────────────────────────────────────────────
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

// ── Progress Bar ──────────────────────────────────────────
function ProgressBar({ value, total, color }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ flex: 1, height: 4, background: 'var(--t-line)' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color || 'var(--t-accent)', transition: 'width 0.4s' }} />
      </div>
      <span style={{ fontSize: 11, color: 'var(--t-text-muted)', whiteSpace: 'nowrap' }}>{value}/{total} ({pct}%)</span>
    </div>
  )
}

// ── Shared Styles ─────────────────────────────────────────
const S = {
  card: { background: 'var(--t-surface)', border: '1px solid var(--t-line)', marginBottom: 16 },
  cardHeader: { padding: '12px 16px', borderBottom: '1px solid var(--t-line)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  cardTitle: { fontSize: 11, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--t-text-muted)' },
  cardBody: { padding: 16 },
  label: { fontSize: 10, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--t-text-muted)' },
  text: { fontSize: 13, color: 'var(--t-text)' },
  muted: { fontSize: 12, color: 'var(--t-text-muted)' },
  row: { display: 'flex', alignItems: 'center', gap: 8 },
  btn: { background: 'var(--t-accent)', color: '#070b14', border: 'none', padding: '6px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer', borderRadius: 0 },
  btnGhost: { background: 'transparent', color: 'var(--t-accent)', border: '1px solid var(--t-accent)', padding: '6px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer', borderRadius: 0 },
  btnDanger: { background: 'var(--t-danger)', color: '#fff', border: 'none', padding: '6px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer', borderRadius: 0 },
  btnAmber: { background: 'var(--t-warn)', color: '#070b14', border: 'none', padding: '6px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer', borderRadius: 0 },
  btnSm: { background: 'transparent', color: 'var(--t-accent)', border: '1px solid var(--t-accent)', padding: '4px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer', borderRadius: 0 },
  input: { background: 'var(--t-surface-2)', border: '1px solid var(--t-line)', color: 'var(--t-text)', padding: '6px 10px', fontSize: 13, borderRadius: 0, outline: 'none' },
  select: { background: 'var(--t-surface-2)', border: '1px solid var(--t-line)', color: 'var(--t-text)', padding: '6px 10px', fontSize: 13, borderRadius: 0, outline: 'none' },
  textarea: { background: 'var(--t-surface-2)', border: '1px solid var(--t-line)', color: 'var(--t-text)', padding: '8px 10px', fontSize: 13, borderRadius: 0, outline: 'none', resize: 'vertical', width: '100%', boxSizing: 'border-box' },
}

// Category options (enum labels for dropdowns — not data).
const CATEGORIES = ['Employment', 'Conduct', 'Safety', 'Benefits', 'Operations', 'Technology', 'Legal']

// ── Small utils ───────────────────────────────────────────
function fmtDate(ts) {
  if (!ts) return '—'
  const d = new Date(ts)
  if (isNaN(d)) return String(ts)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}
function verLabel(v) { return v ? (String(v).startsWith('v') ? v : `v${v}`) : 'v1.0' }

// ── Loading / Empty / Error blocks ────────────────────────
function StateBlock({ children, tone }) {
  const color = tone === 'error' ? 'var(--t-danger)' : 'var(--t-text-muted)'
  return (
    <div style={{ ...S.card, textAlign: 'center', padding: 40 }}>
      <div style={{ fontSize: 13, color }}>{children}</div>
    </div>
  )
}

// ── Toast ─────────────────────────────────────────────────
function useToast() {
  const [toasts, setToasts] = useState([])
  const show = useCallback((msg, type = 'success') => {
    const id = Date.now() + Math.floor(Math.random() * 1000)
    setToasts(t => [...t, { id, msg, type }])
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3200)
  }, [])
  return { toasts, show }
}

function ToastContainer({ toasts }) {
  return (
    <div style={{ position: 'fixed', top: 20, right: 20, zIndex: 2000, display: 'flex', flexDirection: 'column', gap: 8, pointerEvents: 'none' }}>
      {toasts.map(t => (
        <div key={t.id} style={{
          background: t.type === 'error' ? 'var(--t-danger)' : t.type === 'warn' ? 'var(--t-warn)' : 'var(--t-success)',
          color: t.type === 'warn' ? '#070b14' : '#fff',
          padding: '10px 16px', fontSize: 13, fontWeight: 700,
          boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
          borderRadius: 0, minWidth: 260,
        }}>{t.msg}</div>
      ))}
    </div>
  )
}

// ── Confirm Modal ─────────────────────────────────────────
function ConfirmModal({ title, body, onConfirm, onCancel, confirmLabel = 'Confirm', danger = false, busy = false }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.72)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', padding: 28, maxWidth: 480, width: '90%', borderRadius: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--t-text)', marginBottom: 12 }}>{title}</div>
        <div style={{ fontSize: 13, color: 'var(--t-text-muted)', marginBottom: 20, lineHeight: 1.65, whiteSpace: 'pre-line' }}>{body}</div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button style={S.btnGhost} onClick={onCancel} disabled={busy}>Cancel</button>
          <button style={danger ? S.btnDanger : S.btn} onClick={onConfirm} disabled={busy}>{busy ? '…' : confirmLabel}</button>
        </div>
      </div>
    </div>
  )
}

// ── Role level helpers ────────────────────────────────────
function roleLevelPasses(policyLevel, filterLevel) {
  if (filterLevel === 'all') return policyLevel === 'all'
  if (filterLevel === 'keyholder') return policyLevel === 'all' || policyLevel === 'keyholder'
  if (filterLevel === 'manager') return policyLevel === 'all' || policyLevel === 'keyholder' || policyLevel === 'manager'
  if (filterLevel === 'admin') return true
  return true
}
function isManagerRole(role) {
  if (!role) return false
  return ['ceo', 'hr', 'manager', 'coo', 'admin', 'owner'].some(x => role.toLowerCase().includes(x))
}
function fmtInitials(name) {
  if (!name) return '?'
  return name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
}

// ── Policy Comments (real: policies_comments / policies_add_comment) ─
function PolicyComments({ policyId, session, toast }) {
  const person = session?.person || {}
  const [comments, setComments] = useState([])
  const [newComment, setNewComment] = useState('')
  const [showAll, setShowAll] = useState(false)
  const [loading, setLoading] = useState(true)
  const [posting, setPosting] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try { setComments(await callRpc('policies_comments', { p_policy_id: policyId }) || []) }
    catch { setComments([]) }
    finally { setLoading(false) }
  }, [policyId])
  useEffect(() => { load() }, [load])

  async function submitComment() {
    const body = newComment.trim()
    if (!body || posting) return
    setPosting(true)
    try {
      const r = await callRpc('policies_add_comment', {
        p_policy_id: policyId,
        p_person_id: person.id || null,
        p_author: person.full_name || 'Employee',
        p_role: person.role_name || '',
        p_body: body,
      })
      if (r && r.ok === false) throw new Error(r.error || 'failed')
      setNewComment('')
      await load()
    } catch { toast('Could not post comment', 'error') }
    finally { setPosting(false) }
  }

  const displayed = showAll ? comments : comments.slice(-5)

  return (
    <div style={{ marginTop: 20, borderTop: '1px solid var(--t-line)', paddingTop: 16 }}>
      <div style={{ ...S.label, marginBottom: 12 }}>Discussion ({comments.length})</div>
      {comments.length > 5 && !showAll && (
        <button style={{ ...S.btnSm, marginBottom: 12 }} onClick={() => setShowAll(true)}>
          Show all {comments.length} comments
        </button>
      )}
      {loading ? (
        <div style={{ fontSize: 12, color: 'var(--t-text-muted)', marginBottom: 12 }}>Loading discussion…</div>
      ) : displayed.length === 0 && (
        <div style={{ fontSize: 12, color: 'var(--t-text-muted)', marginBottom: 12 }}>No comments yet. Be the first to ask a question.</div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 14 }}>
        {displayed.map(c => (
          <div key={c.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <div style={{ width: 30, height: 30, borderRadius: 0, background: isManagerRole(c.role_name) ? 'var(--t-accent)' : 'var(--t-surface-2)', border: '1px solid var(--t-line)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: isManagerRole(c.role_name) ? '#070b14' : 'var(--t-text)', flexShrink: 0 }}>
              {fmtInitials(c.author_name)}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 4 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--t-text)' }}>{c.author_name || 'Employee'}</span>
                {c.role_name && <span style={{ fontSize: 11, color: 'var(--t-text-muted)' }}>{c.role_name}</span>}
                <span style={{ fontSize: 11, color: 'var(--t-text-faint)' }}>{fmtDate(c.created_at)}</span>
                {isManagerRole(c.role_name) && (
                  <span style={{ fontSize: 9, fontWeight: 700, background: 'var(--t-accent)', color: '#070b14', padding: '1px 5px' }}>HR RESPONSE</span>
                )}
              </div>
              <div style={{ fontSize: 12, color: 'var(--t-text)', lineHeight: 1.55, background: 'var(--t-surface-2)', border: '1px solid var(--t-line)', padding: '6px 10px' }}>
                {c.body}
              </div>
            </div>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          type="text"
          style={{ ...S.input, flex: 1 }}
          placeholder="Ask a question or leave a comment..."
          value={newComment}
          onChange={e => setNewComment(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && submitComment()}
        />
        <button style={S.btn} onClick={submitComment} disabled={posting}>{posting ? '…' : 'Post'}</button>
      </div>
    </div>
  )
}

// ── TAB 1: Policy Library ─────────────────────────────────
function PolicyLibrary({ policies, mySignedIds, onAcknowledge, showVersions, sigSummary, session, toast }) {
  const published = useMemo(() => policies.filter(p => p.status === 'published'), [policies])
  const firstCat = published[0]?.category || CATEGORIES[0]
  const [selectedCat, setSelectedCat] = useState(firstCat)
  const [expandedId, setExpandedId] = useState(null)
  const [ackConfirm, setAckConfirm] = useState(null)
  const [ackBusy, setAckBusy] = useState(false)
  const [roleFilter, setRoleFilter] = useState('all')
  const [versionsById, setVersionsById] = useState({})

  const sigByPolicy = useMemo(() => {
    const m = {}
    ;(sigSummary || []).forEach(s => { m[s.policy_id] = s })
    return m
  }, [sigSummary])

  const catCounts = useMemo(() => {
    const m = {}
    CATEGORIES.forEach(c => { m[c] = published.filter(p => p.category === c).length })
    return m
  }, [published])

  const catPolicies = useMemo(() => published.filter(p => {
    if (p.category !== selectedCat) return false
    return roleLevelPasses(p.role_level || 'all', roleFilter)
  }), [published, selectedCat, roleFilter])

  async function loadVersions(polId) {
    if (versionsById[polId]) return
    try {
      const vs = await callRpc('policies_versions', { p_policy_id: polId }) || []
      setVersionsById(v => ({ ...v, [polId]: vs }))
    } catch { setVersionsById(v => ({ ...v, [polId]: [] })) }
  }

  function toggleExpand(polId) {
    const next = expandedId === polId ? null : polId
    setExpandedId(next)
    if (next && showVersions) loadVersions(next)
  }

  async function confirmAck() {
    if (!ackConfirm) return
    setAckBusy(true)
    const ok = await onAcknowledge(ackConfirm)
    setAckBusy(false)
    if (ok) { toast('Policy acknowledged'); setAckConfirm(null) }
    else toast('Could not record acknowledgment', 'error')
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: 16, alignItems: 'start' }}>
      {ackConfirm && (
        <ConfirmModal
          title="Acknowledge Policy"
          body={`By clicking Acknowledge, you confirm that you have read and understand "${ackConfirm.title}" (${verLabel(ackConfirm.version)}).`}
          onConfirm={confirmAck}
          onCancel={() => setAckConfirm(null)}
          confirmLabel="Acknowledge"
          busy={ackBusy}
        />
      )}

      {/* Left sidebar: category list */}
      <div style={{ ...S.card }}>
        <div style={S.cardHeader}><span style={S.cardTitle}>Categories</span></div>
        <div>
          {CATEGORIES.map(cat => (
            <div
              key={cat}
              onClick={() => { setSelectedCat(cat); setExpandedId(null) }}
              style={{
                padding: '10px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                borderLeft: selectedCat === cat ? '3px solid var(--t-accent)' : '3px solid transparent',
                background: selectedCat === cat ? 'var(--t-surface-2)' : 'transparent', transition: 'background 0.12s',
              }}
            >
              <span style={{ fontSize: 13, color: selectedCat === cat ? 'var(--t-accent)' : 'var(--t-text)', fontWeight: selectedCat === cat ? 700 : 400 }}>{cat}</span>
              <span style={{ fontSize: 10, background: 'var(--t-line)', color: 'var(--t-text-muted)', borderRadius: 10, padding: '1px 6px', fontWeight: 700 }}>{catCounts[cat]}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Right panel: policies */}
      <div>
        <div style={{ ...S.card, ...S.cardHeader, marginBottom: 8, gap: 12 }}>
          <span style={S.cardTitle}>{selectedCat} — {catPolicies.length} {catPolicies.length === 1 ? 'policy' : 'policies'}</span>
          <select style={S.select} value={roleFilter} onChange={e => setRoleFilter(e.target.value)}>
            <option value="all">All Roles</option>
            <option value="keyholder">Key Holder & Up</option>
            <option value="manager">Manager & Up</option>
            <option value="admin">Admin Only</option>
          </select>
        </div>

        {published.length === 0 && (
          <StateBlock>No published policies yet. HR can create policies in the Edit Policies tab.</StateBlock>
        )}
        {published.length > 0 && catPolicies.length === 0 && (
          <StateBlock>No policies in this category for the selected role filter.</StateBlock>
        )}

        {catPolicies.map(policy => {
          const isSigned = mySignedIds.has(policy.id)
          const isExpanded = expandedId === policy.id
          const sig = sigByPolicy[policy.id]
          const unsignedCnt = showVersions && sig ? Math.max(0, (sig.headcount || 0) - (sig.signed_count || 0)) : 0
          const verHistory = versionsById[policy.id]
          const roleBadge = policy.role_level === 'keyholder'
            ? <span style={{ fontSize: 9, fontWeight: 700, background: 'var(--t-accent)', color: '#070b14', padding: '1px 5px' }}>KEY HOLDER+</span>
            : policy.role_level === 'manager'
              ? <span style={{ fontSize: 9, fontWeight: 700, background: 'var(--t-purple, #7c4dff)', color: '#fff', padding: '1px 5px' }}>MANAGER+</span>
              : policy.role_level === 'admin'
                ? <span style={{ fontSize: 9, fontWeight: 700, background: 'var(--t-danger)', color: '#fff', padding: '1px 5px' }}>ADMIN</span>
                : null
          return (
            <div key={policy.id} style={{ ...S.card }}>
              <div
                onClick={() => toggleExpand(policy.id)}
                style={{ padding: '12px 16px', cursor: 'pointer', display: 'flex', alignItems: 'flex-start', gap: 12, background: isExpanded ? 'var(--t-surface-2)' : 'transparent', transition: 'background 0.12s' }}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--t-text)' }}>{policy.title}</span>
                    <span className="badge blue" style={{ fontSize: 10 }}>{verLabel(policy.version)}</span>
                    {policy.ack_required && <span className="badge amber" style={{ fontSize: 10 }}>Ack Required</span>}
                    {isSigned && <span className="badge green" style={{ fontSize: 10 }}>✓ Signed</span>}
                    {policy.source === 'import' && <span className="badge blue" style={{ fontSize: 9 }}>Imported</span>}
                    {roleBadge}
                    {showVersions && unsignedCnt > 0 && (
                      <span style={{ fontSize: 10, fontWeight: 700, background: 'var(--t-warn)', color: '#070b14', padding: '1px 6px', borderRadius: 0 }}>
                        {unsignedCnt} unsigned
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 20 }}>
                    <span style={{ fontSize: 11, color: 'var(--t-text-muted)' }}>Effective: {policy.effective_date || '—'}</span>
                    <span style={{ fontSize: 11, color: 'var(--t-text-muted)' }}>Updated: {fmtDate(policy.updated_at)}</span>
                  </div>
                  {policy.change_annotation && (
                    <div style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.3)', padding: '6px 10px', fontSize: 11, color: '#f59e0b', marginTop: 6 }}>
                      ⚠ RECENT CHANGE: {policy.change_annotation}
                    </div>
                  )}
                </div>
                <span style={{ color: 'var(--t-text-muted)', fontSize: 11, marginTop: 2, flexShrink: 0 }}>{isExpanded ? '▲' : '▼'}</span>
              </div>

              {isExpanded && (
                <div style={{ borderTop: '1px solid var(--t-line)', padding: 16 }}>
                  {showVersions && verHistory && verHistory.length > 0 && (
                    <div style={{ marginBottom: 16, background: 'var(--t-surface-2)', border: '1px solid var(--t-line)', padding: 12 }}>
                      <div style={{ ...S.label, marginBottom: 8 }}>Version History</div>
                      {verHistory.map((vh, idx) => (
                        <div key={idx} style={{ display: 'flex', gap: 10, alignItems: 'baseline', marginBottom: 6, fontSize: 12 }}>
                          <span style={{ fontWeight: 700, color: 'var(--t-accent)', minWidth: 40 }}>{verLabel(vh.version)}</span>
                          <span style={{ color: 'var(--t-text-muted)', fontFamily: 'monospace', fontSize: 11 }}>{fmtDate(vh.created_at)}</span>
                          <span style={{ color: 'var(--t-text)', flex: 1 }}>{vh.note || '—'}</span>
                          {vh.require_re_ack && <span className="badge amber" style={{ fontSize: 9 }}>Re-Ack Required</span>}
                        </div>
                      ))}
                    </div>
                  )}
                  <pre style={{ fontFamily: 'inherit', fontSize: 12, color: 'var(--t-text)', lineHeight: 1.75, whiteSpace: 'pre-wrap', margin: 0, background: 'var(--t-surface-2)', padding: 16, borderRadius: 0, border: '1px solid var(--t-line)' }}>
                    {policy.content || 'No content.'}
                  </pre>
                  {policy.ack_required && !isSigned && (
                    <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
                      <button style={S.btn} onClick={() => setAckConfirm(policy)}>Acknowledge This Policy</button>
                      <span style={{ fontSize: 12, color: 'var(--t-text-muted)' }}>Your acknowledgment is required.</span>
                    </div>
                  )}
                  {isSigned && (
                    <div style={{ marginTop: 12, padding: '8px 14px', background: 'rgba(0,200,100,0.07)', border: '1px solid var(--t-success)', borderRadius: 0, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ color: 'var(--t-success)', fontWeight: 700, fontSize: 13 }}>✓ You have acknowledged this policy</span>
                    </div>
                  )}
                  <PolicyComments policyId={policy.id} session={session} toast={toast} />
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── TAB 2: My Acknowledgments ─────────────────────────────
function MyAcknowledgments({ policies, myAcks, mySignedIds, onAcknowledge, toast }) {
  const [ackAllConfirm, setAckAllConfirm] = useState(false)
  const [singleConfirm, setSingleConfirm] = useState(null)
  const [busy, setBusy] = useState(false)

  const required = useMemo(() => policies.filter(p => p.status === 'published' && p.ack_required), [policies])
  const outstanding = required.filter(p => !mySignedIds.has(p.id))
  const acknowledged = required.filter(p => mySignedIds.has(p.id))

  const ackAtByPolicy = useMemo(() => {
    const m = {}
    ;(myAcks || []).forEach(a => { m[a.policy_id] = a.acknowledged_at })
    return m
  }, [myAcks])

  async function confirmSingle() {
    if (!singleConfirm) return
    setBusy(true)
    const ok = await onAcknowledge(singleConfirm)
    setBusy(false)
    if (ok) { toast('Policy acknowledged'); setSingleConfirm(null) }
    else toast('Could not record acknowledgment', 'error')
  }
  async function confirmAckAll() {
    setBusy(true)
    let allOk = true
    for (const p of outstanding) { const ok = await onAcknowledge(p); if (!ok) allOk = false }
    setBusy(false)
    setAckAllConfirm(false)
    toast(allOk ? 'All pending policies acknowledged' : 'Some acknowledgments failed', allOk ? 'success' : 'error')
  }

  return (
    <div>
      {singleConfirm && (
        <ConfirmModal
          title="Acknowledge Policy"
          body={`Confirm you have read and understood:\n\n"${singleConfirm.title}" (${verLabel(singleConfirm.version)})`}
          onConfirm={confirmSingle} onCancel={() => setSingleConfirm(null)} confirmLabel="Acknowledge" busy={busy}
        />
      )}
      {ackAllConfirm && (
        <ConfirmModal
          title="Acknowledge All Pending Policies"
          body={`You are acknowledging all ${outstanding.length} outstanding required policies:\n\n${outstanding.map(p => `• ${p.title}`).join('\n')}\n\nBy confirming, you attest that you have read and understood each of these policies.`}
          onConfirm={confirmAckAll} onCancel={() => setAckAllConfirm(false)} confirmLabel="Acknowledge All" busy={busy}
        />
      )}

      <div style={{ ...S.card, padding: 16, marginBottom: 16 }}>
        <div style={{ marginBottom: 10, fontSize: 13, fontWeight: 600, color: 'var(--t-text)' }}>Overall Acknowledgment Progress</div>
        <ProgressBar value={acknowledged.length} total={required.length} />
      </div>

      <div style={S.card}>
        <div style={S.cardHeader}>
          <span style={S.cardTitle}>Outstanding ({outstanding.length})</span>
          {outstanding.length > 0 && <button style={S.btn} onClick={() => setAckAllConfirm(true)}>Acknowledge All Pending</button>}
        </div>
        <div style={S.cardBody}>
          {required.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 24, color: 'var(--t-text-muted)', fontSize: 13 }}>No policies require acknowledgment yet.</div>
          ) : outstanding.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 24, color: 'var(--t-text-muted)', fontSize: 13 }}>✓ All required policies acknowledged. Nothing outstanding.</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--t-line)' }}>
                  {['Policy Name', 'Category', 'Effective', 'Version', ''].map(h => (
                    <th key={h} style={{ textAlign: 'left', padding: '6px 10px', ...S.label }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {outstanding.map(policy => (
                  <tr key={policy.id} style={{ borderBottom: '1px solid var(--t-line)' }}>
                    <td style={{ padding: '10px 10px', color: 'var(--t-text)', fontWeight: 600 }}>{policy.title}</td>
                    <td style={{ padding: '10px 10px', color: 'var(--t-text-muted)' }}>{policy.category}</td>
                    <td style={{ padding: '10px 10px', color: 'var(--t-text-muted)', fontFamily: 'monospace', fontSize: 12 }}>{policy.effective_date || '—'}</td>
                    <td style={{ padding: '10px 10px' }}><span className="badge blue">{verLabel(policy.version)}</span></td>
                    <td style={{ padding: '10px 10px' }}>
                      <button style={{ ...S.btnGhost, fontSize: 11, padding: '4px 10px' }} onClick={() => setSingleConfirm(policy)}>Acknowledge</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div style={S.card}>
        <div style={S.cardHeader}><span style={S.cardTitle}>Acknowledged ({acknowledged.length})</span></div>
        <div style={S.cardBody}>
          {acknowledged.length === 0 ? (
            <div style={{ color: 'var(--t-text-muted)', fontSize: 13 }}>No policies acknowledged yet.</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--t-line)' }}>
                  {['Policy', 'Date Signed', 'Version', 'Status'].map(h => (
                    <th key={h} style={{ textAlign: 'left', padding: '6px 10px', ...S.label }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {acknowledged.map(policy => (
                  <tr key={policy.id} style={{ borderBottom: '1px solid var(--t-line)' }}>
                    <td style={{ padding: '10px 10px', color: 'var(--t-text)', fontWeight: 600 }}>{policy.title}</td>
                    <td style={{ padding: '10px 10px', color: 'var(--t-text-muted)', fontFamily: 'monospace', fontSize: 12 }}>{fmtDate(ackAtByPolicy[policy.id])}</td>
                    <td style={{ padding: '10px 10px' }}><span className="badge blue">{verLabel(policy.version)}</span></td>
                    <td style={{ padding: '10px 10px' }}><span className="badge green">✓ Signed</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}

// ── TAB 3: Team Compliance ────────────────────────────────
function TeamCompliance({ session, locationIds }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState(null)
  const [sendingAll, setSendingAll] = useState(false)
  const [remindersSent, setRemindersSent] = useState(false)
  const [sentRows, setSentRows] = useState({})

  const load = useCallback(async () => {
    setLoading(true); setErr(null)
    try { setData(await callRpc('policies_team_compliance', { p_node_ids: locationIds && locationIds.length ? locationIds : null })) }
    catch (e) { setErr(e.message || 'Failed to load team compliance') }
    finally { setLoading(false) }
  }, [locationIds])
  useEffect(() => { load() }, [load])

  const employees = data?.employees || []
  const reqPols = data?.policies || []
  const ackSet = useMemo(() => {
    const s = new Set()
    ;(data?.acks || []).forEach(a => s.add(`${a.person_id}|${a.policy_id}`))
    return s
  }, [data])

  const matrix = useMemo(() => employees.map(emp => ({
    ...emp,
    signed: reqPols.map(p => ackSet.has(`${emp.person_id}|${p.id}`)),
  })), [employees, reqPols, ackSet])

  const polCompletion = reqPols.map((_, pi) => {
    if (employees.length === 0) return 0
    const count = matrix.filter(e => e.signed[pi]).length
    return Math.round((count / employees.length) * 100)
  })
  const empCompletion = matrix.map(emp => {
    if (reqPols.length === 0) return 100
    const count = emp.signed.filter(Boolean).length
    return Math.round((count / reqPols.length) * 100)
  })
  const nonCompliant = matrix
    .map((emp, i) => ({ ...emp, pct: empCompletion[i] }))
    .filter(e => e.pct < 100)
    .sort((a, b) => a.pct - b.pct)

  async function sendReminder(emp) {
    const from = session?.person?.id
    if (!from) { setSentRows(prev => ({ ...prev, [emp.person_id]: 'error' })); return false }
    try {
      const { data: res, error } = await sb.rpc('send_dm', {
        p_from_id: from,
        p_to_id: emp.person_id,
        p_body: 'Reminder: You have outstanding policy acknowledgments. Please review and sign all required policies as soon as possible.',
      })
      if (error || (res && res.ok === false)) throw (error || new Error('send failed'))
      setSentRows(prev => ({ ...prev, [emp.person_id]: 'sent' }))
      return true
    } catch { setSentRows(prev => ({ ...prev, [emp.person_id]: 'error' })); return false }
  }
  async function sendAllReminders() {
    setSendingAll(true)
    let allOk = true
    for (const emp of nonCompliant) { const ok = await sendReminder(emp); if (!ok) allOk = false }
    setRemindersSent(allOk); setSendingAll(false)
  }

  if (loading) return <StateBlock>Loading team compliance…</StateBlock>
  if (err) return <StateBlock tone="error">{err}</StateBlock>
  if (employees.length === 0) return <StateBlock>No employees found in the selected locations.</StateBlock>
  if (reqPols.length === 0) return <StateBlock>No policies require acknowledgment yet.</StateBlock>

  return (
    <div>
      <div style={S.card}>
        <div style={S.cardHeader}>
          <span style={S.cardTitle}>Compliance Matrix — {employees.length} Employees × {reqPols.length} Required Policies</span>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', fontSize: 11, minWidth: '100%' }}>
            <thead>
              <tr style={{ background: 'var(--t-surface-2)' }}>
                <th style={{ textAlign: 'left', padding: '8px 12px', color: 'var(--t-text-muted)', fontWeight: 700, minWidth: 148, position: 'sticky', left: 0, background: 'var(--t-surface-2)', borderRight: '1px solid var(--t-line)', fontSize: 10, letterSpacing: '.08em', textTransform: 'uppercase' }}>Employee</th>
                <th style={{ padding: '8px 10px', color: 'var(--t-text-muted)', fontWeight: 700, textAlign: 'center', fontSize: 10, letterSpacing: '.08em', textTransform: 'uppercase', minWidth: 48 }}>Pct</th>
                {reqPols.map(p => (
                  <th key={p.id} style={{ padding: '6px 4px', color: 'var(--t-text-muted)', fontWeight: 700, maxWidth: 68, minWidth: 48, textAlign: 'center', overflow: 'hidden' }}>
                    <span title={p.title} style={{ display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 68, fontSize: 9, letterSpacing: '.06em', textTransform: 'uppercase' }}>
                      {p.title.split(' ').slice(0, 2).join(' ')}
                    </span>
                  </th>
                ))}
              </tr>
              <tr style={{ borderBottom: '2px solid var(--t-line)' }}>
                <td style={{ padding: '5px 12px', color: 'var(--t-text-muted)', fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', position: 'sticky', left: 0, background: 'var(--t-surface)', borderRight: '1px solid var(--t-line)' }}>Policy Completion</td>
                <td />
                {polCompletion.map((pct, i) => (
                  <td key={i} style={{ textAlign: 'center', padding: '4px 4px', fontSize: 10, fontWeight: 800, color: pct === 100 ? 'var(--t-success)' : pct < 70 ? 'var(--t-danger)' : 'var(--t-warn)' }}>{pct}%</td>
                ))}
              </tr>
            </thead>
            <tbody>
              {matrix.map((emp, ei) => (
                <tr key={emp.person_id} style={{ borderBottom: '1px solid var(--t-line)' }}>
                  <td style={{ padding: '8px 12px', position: 'sticky', left: 0, background: 'var(--t-surface)', zIndex: 1, borderRight: '1px solid var(--t-line)' }}>
                    <div style={{ fontWeight: 600, color: 'var(--t-text)', fontSize: 12 }}>{emp.name}</div>
                    <div style={{ color: 'var(--t-text-muted)', fontSize: 10 }}>{emp.location}</div>
                  </td>
                  <td style={{ textAlign: 'center', padding: '8px 6px', fontWeight: 800, fontSize: 11, color: empCompletion[ei] === 100 ? 'var(--t-success)' : empCompletion[ei] < 70 ? 'var(--t-danger)' : 'var(--t-warn)' }}>
                    {empCompletion[ei]}%
                  </td>
                  {emp.signed.map((signed, pi) => (
                    <td key={pi} style={{ textAlign: 'center', padding: '8px 4px', fontSize: 13, color: signed ? 'var(--t-success)' : 'var(--t-danger)' }}>
                      {signed ? '✓' : '✗'}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div style={S.card}>
        <div style={S.cardHeader}>
          <span style={S.cardTitle}>Non-Compliant Employees ({nonCompliant.length})</span>
          {nonCompliant.length > 0 && (
            <button
              style={{ ...S.btn, opacity: remindersSent || sendingAll ? 0.5 : 1, cursor: remindersSent ? 'not-allowed' : 'pointer' }}
              onClick={sendAllReminders} disabled={remindersSent || sendingAll}
            >
              {sendingAll ? 'Sending...' : remindersSent ? '✓ All Reminders Sent' : 'Send All Reminders'}
            </button>
          )}
        </div>
        <div style={S.cardBody}>
          {nonCompliant.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 24, color: 'var(--t-success)', fontSize: 13, fontWeight: 700 }}>✓ All employees are fully compliant.</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--t-line)' }}>
                  {['Name', 'Role', 'Location', 'Completion', ''].map(h => (
                    <th key={h} style={{ textAlign: 'left', padding: '6px 10px', ...S.label }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {nonCompliant.map(emp => (
                  <tr key={emp.person_id} style={{ borderBottom: '1px solid var(--t-line)' }}>
                    <td style={{ padding: '10px 10px', fontWeight: 600, color: 'var(--t-text)' }}>{emp.name}</td>
                    <td style={{ padding: '10px 10px', color: 'var(--t-text-muted)' }}>{emp.role}</td>
                    <td style={{ padding: '10px 10px', color: 'var(--t-text-muted)' }}>{emp.location}</td>
                    <td style={{ padding: '10px 10px' }}>
                      <span style={{ fontWeight: 800, color: emp.pct < 50 ? 'var(--t-danger)' : emp.pct < 80 ? 'var(--t-warn)' : 'var(--t-text)' }}>{emp.pct}%</span>
                    </td>
                    <td style={{ padding: '10px 10px' }}>
                      <button
                        style={{ ...S.btnGhost, fontSize: 11, padding: '4px 10px',
                          opacity: sentRows[emp.person_id] === 'sent' ? 0.5 : 1,
                          cursor: sentRows[emp.person_id] === 'sent' ? 'not-allowed' : 'pointer',
                          color: sentRows[emp.person_id] === 'error' ? 'var(--t-danger)' : undefined,
                          borderColor: sentRows[emp.person_id] === 'error' ? 'var(--t-danger)' : undefined }}
                        onClick={() => sentRows[emp.person_id] !== 'sent' && sendReminder(emp)}
                        disabled={sentRows[emp.person_id] === 'sent'}
                      >
                        {sentRows[emp.person_id] === 'sent' ? 'Sent ✓' : sentRows[emp.person_id] === 'error' ? 'Failed — retry' : 'Send Reminder'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}

// ── TAB 4: Version History ────────────────────────────────
function VersionHistoryTab({ policies, sigSummary, session, onReload, toast }) {
  const published = useMemo(() => policies.filter(p => p.status === 'published'), [policies])
  const [newVerForm, setNewVerForm] = useState(null) // policy object
  const [formData, setFormData] = useState({ note: '', effectiveDate: '', version: '', requireReAck: true })
  const [busy, setBusy] = useState(false)
  const [detail, setDetail] = useState({}) // policyId -> versions[]

  const sigByPolicy = useMemo(() => {
    const m = {}; (sigSummary || []).forEach(s => { m[s.policy_id] = s }); return m
  }, [sigSummary])

  function openForm(pol) {
    setNewVerForm(pol)
    const cur = parseFloat(String(pol.version).replace(/[^\d.]/g, '')) || 1
    setFormData({ note: '', effectiveDate: pol.effective_date || '', version: `v${(cur + 1).toFixed(1)}`, requireReAck: true })
  }

  async function loadDetail(polId) {
    try {
      const vs = await callRpc('policies_versions', { p_policy_id: polId }) || []
      setDetail(d => ({ ...d, [polId]: vs }))
    } catch { setDetail(d => ({ ...d, [polId]: [] })) }
  }
  useEffect(() => { published.forEach(p => loadDetail(p.id)) }, [published.length])

  async function handlePublish() {
    if (!newVerForm) return
    if (!formData.version.trim()) { toast('Version is required', 'error'); return }
    setBusy(true)
    try {
      const r = await callRpc('policies_new_version', {
        p_policy_id: newVerForm.id,
        p_version: formData.version.trim(),
        p_effective: formData.effectiveDate || null,
        p_note: formData.note.trim() || null,
        p_require_re_ack: formData.requireReAck,
        p_actor: session?.person?.id || null,
      })
      if (r && r.ok === false) throw new Error(r.error)
      toast(`New version ${verLabel(formData.version)} published`)
      setNewVerForm(null)
      await onReload()
      await loadDetail(newVerForm.id)
    } catch { toast('Could not publish new version', 'error') }
    finally { setBusy(false) }
  }

  return (
    <div>
      <div style={S.card}>
        <div style={S.cardHeader}><span style={S.cardTitle}>All Policy Versions</span></div>
        <div style={{ overflowX: 'auto' }}>
          {published.length === 0 ? (
            <div style={{ padding: 24, color: 'var(--t-text-muted)', fontSize: 13, textAlign: 'center' }}>No published policies yet.</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--t-line)', background: 'var(--t-surface-2)' }}>
                  {['Policy Name', 'Current Version', 'Last Updated', 'Signed By', 'Unsigned', 'Action'].map(h => (
                    <th key={h} style={{ textAlign: 'left', padding: '8px 12px', ...S.label }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {published.map(pol => {
                  const sig = sigByPolicy[pol.id]
                  const headcount = sig?.headcount || 0
                  const signed = sig?.signed_count || 0
                  const unsigned = Math.max(0, headcount - signed)
                  return (
                    <tr key={pol.id} style={{ borderBottom: '1px solid var(--t-line)' }}>
                      <td style={{ padding: '10px 12px', fontWeight: 600, color: 'var(--t-text)' }}>{pol.title}</td>
                      <td style={{ padding: '10px 12px' }}><span className="badge blue" style={{ fontSize: 10 }}>{verLabel(pol.version)}</span></td>
                      <td style={{ padding: '10px 12px', color: 'var(--t-text-muted)', fontFamily: 'monospace', fontSize: 12 }}>{fmtDate(pol.updated_at)}</td>
                      <td style={{ padding: '10px 12px' }}>
                        <span style={{ color: 'var(--t-success)', fontWeight: 700 }}>{signed}</span>
                        <span style={{ color: 'var(--t-text-muted)' }}> / {headcount}</span>
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        {pol.ack_required
                          ? (unsigned > 0 ? <span style={{ color: 'var(--t-warn)', fontWeight: 700 }}>{unsigned}</span> : <span style={{ color: 'var(--t-success)' }}>—</span>)
                          : <span style={{ color: 'var(--t-text-faint)' }}>n/a</span>}
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        <button style={S.btnSm} onClick={() => openForm(pol)}>+ New Version</button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {newVerForm && (
        <div style={{ ...S.card, border: '1px solid var(--t-accent)' }}>
          <div style={S.cardHeader}>
            <span style={S.cardTitle}>New Version for: {newVerForm.title}</span>
            <button style={S.btnGhost} onClick={() => setNewVerForm(null)}>Cancel</button>
          </div>
          <div style={S.cardBody}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
              <div>
                <div style={{ ...S.label, marginBottom: 6 }}>Version Number</div>
                <input value={formData.version} onChange={e => setFormData(f => ({ ...f, version: e.target.value }))} style={{ ...S.input, width: '100%', boxSizing: 'border-box' }} />
              </div>
              <div>
                <div style={{ ...S.label, marginBottom: 6 }}>Effective Date</div>
                <input type="date" value={formData.effectiveDate} onChange={e => setFormData(f => ({ ...f, effectiveDate: e.target.value }))} style={{ ...S.input, width: '100%', boxSizing: 'border-box' }} />
              </div>
            </div>
            <div style={{ marginBottom: 16 }}>
              <div style={{ ...S.label, marginBottom: 6 }}>What Changed</div>
              <textarea rows={3} placeholder="Describe what was updated in this version..." value={formData.note} onChange={e => setFormData(f => ({ ...f, note: e.target.value }))} style={S.textarea} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: 'var(--t-text)' }}>
                <input type="checkbox" checked={formData.requireReAck} onChange={e => setFormData(f => ({ ...f, requireReAck: e.target.checked }))} style={{ width: 14, height: 14, accentColor: 'var(--t-accent)', cursor: 'pointer' }} />
                Require re-acknowledgment from all employees
              </label>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button style={S.btn} onClick={handlePublish} disabled={busy}>{busy ? '…' : 'Publish New Version'}</button>
              <button style={S.btnGhost} onClick={() => setNewVerForm(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      <div style={S.card}>
        <div style={S.cardHeader}><span style={S.cardTitle}>Detailed History</span></div>
        <div style={S.cardBody}>
          {published.every(p => (detail[p.id] || []).length <= 1) ? (
            <div style={{ color: 'var(--t-text-muted)', fontSize: 13 }}>No multi-version history yet. Publishing a new version records it here.</div>
          ) : published.filter(p => (detail[p.id] || []).length > 0).map(pol => (
            <div key={pol.id} style={{ marginBottom: 20, paddingBottom: 20, borderBottom: '1px solid var(--t-line)' }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--t-text)', marginBottom: 10 }}>{pol.title}</div>
              {(detail[pol.id] || []).map((vh, i) => (
                <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '8px 0', borderBottom: '1px solid var(--t-line)' }}>
                  <span style={{ fontWeight: 800, color: i === 0 ? 'var(--t-accent)' : 'var(--t-text-muted)', minWidth: 40, fontSize: 12 }}>{verLabel(vh.version)}</span>
                  <span style={{ color: 'var(--t-text-muted)', fontFamily: 'monospace', fontSize: 11, minWidth: 90 }}>{fmtDate(vh.created_at)}</span>
                  <span style={{ color: 'var(--t-text)', fontSize: 12, flex: 1 }}>{vh.note || '—'}</span>
                  {vh.require_re_ack && <span className="badge amber" style={{ fontSize: 9, flexShrink: 0 }}>Re-Ack</span>}
                  {i === 0 && <span className="badge green" style={{ fontSize: 9, flexShrink: 0 }}>Current</span>}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── TAB 5: Quizzes ────────────────────────────────────────
const ANSWER_LABELS = ['A', 'B', 'C', 'D', 'E', 'F']

function QuizzesTab({ isHR, policies, session, toast }) {
  const currentUserId = session?.person?.id || null
  const published = useMemo(() => policies.filter(p => p.status === 'published'), [policies])
  const [quizzes, setQuizzes] = useState([])
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState(null)

  const [takingQuiz, setTakingQuiz] = useState(null) // { quiz, step, answers, submitted, score, total, passed }
  const [editing, setEditing] = useState(null) // { quiz_id, label, policy_id, questions }
  const [viewingResults, setViewingResults] = useState(null) // quiz object
  const [newQuiz, setNewQuiz] = useState(null) // { policy_id, label }
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true); setErr(null)
    try {
      const [q, r] = await Promise.all([callRpc('policies_quiz_list'), callRpc('policies_quiz_results', {})])
      setQuizzes(q || []); setResults(r || [])
    } catch (e) { setErr(e.message || 'Failed to load quizzes') }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])

  const resultIndex = useMemo(() => {
    const m = {}
    results.forEach(r => { (m[r.quiz_id] = m[r.quiz_id] || {})[r.person_id] = r })
    return m
  }, [results])

  function quizStats(quizId) {
    const rs = results.filter(r => r.quiz_id === quizId)
    const taken = rs.length
    const passed = rs.filter(r => r.passed).length
    return { taken, passed, rate: taken > 0 ? Math.round((passed / taken) * 100) : 0 }
  }

  const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0)
  const failedThisMonth = results.filter(r => !r.passed && new Date(r.taken_at) >= monthStart).length
  const perfectScores = (() => {
    const byPerson = {}
    results.forEach(r => { (byPerson[r.person_id] = byPerson[r.person_id] || []).push(r) })
    return Object.values(byPerson).filter(rs => rs.length === quizzes.length && quizzes.length > 0 && rs.every(r => r.passed)).length
  })()
  const overallRate = results.length > 0 ? Math.round((results.filter(r => r.passed).length / results.length) * 100) : 0

  // Take quiz
  function startQuiz(quiz) { setTakingQuiz({ quiz, step: 0, answers: {}, submitted: false }) }
  async function answerQuestion(ansIdx) {
    if (!takingQuiz || takingQuiz.submitted) return
    const qs = takingQuiz.quiz.questions
    const answers = { ...takingQuiz.answers, [takingQuiz.step]: ansIdx }
    if (takingQuiz.step + 1 < qs.length) {
      setTakingQuiz(q => ({ ...q, step: q.step + 1, answers }))
    } else {
      try {
        const r = await callRpc('policies_quiz_submit', {
          p_quiz_id: takingQuiz.quiz.quiz_id, p_person_id: currentUserId,
          p_person_name: session?.person?.full_name || null, p_answers: answers,
        })
        if (r && r.ok === false) throw new Error(r.error)
        setTakingQuiz(q => ({ ...q, answers, submitted: true, score: r.score, total: r.total, passed: r.passed }))
        toast(r.passed ? 'Quiz passed — result recorded!' : 'Quiz failed — please review and retake.', r.passed ? 'success' : 'error')
        load()
      } catch { toast('Could not submit quiz', 'error') }
    }
  }

  // Edit quiz
  function openEdit(quiz) {
    setEditing({ quiz_id: quiz.quiz_id, label: quiz.label, policy_id: quiz.policy_id, questions: (quiz.questions || []).map(q => ({ question: q.question, answers: [...(q.answers || [])], correct_index: q.correct_index })) })
  }
  function updateQuestion(qi, field, val) {
    setEditing(e => ({ ...e, questions: e.questions.map((q, i) => i === qi ? { ...q, [field]: val } : q) }))
  }
  function updateAnswer(qi, ai, val) {
    setEditing(e => ({ ...e, questions: e.questions.map((q, i) => { if (i !== qi) return q; const answers = [...q.answers]; answers[ai] = val; return { ...q, answers } }) }))
  }
  function addQuestion() {
    setEditing(e => ({ ...e, questions: [...e.questions, { question: '', answers: ['', '', '', ''], correct_index: 0 }] }))
  }
  function removeQuestion(qi) {
    setEditing(e => ({ ...e, questions: e.questions.filter((_, i) => i !== qi) }))
  }
  async function saveQuiz() {
    if (!editing) return
    setBusy(true)
    try {
      const r = await callRpc('policies_quiz_upsert', {
        p_quiz_id: editing.quiz_id, p_policy_id: editing.policy_id || null,
        p_key: null, p_label: editing.label, p_questions: editing.questions, p_actor: currentUserId,
      })
      if (r && r.ok === false) throw new Error(r.error)
      toast('Quiz saved'); setEditing(null); await load()
    } catch { toast('Could not save quiz', 'error') }
    finally { setBusy(false) }
  }

  async function createQuiz() {
    if (!newQuiz || !newQuiz.label.trim()) { toast('Quiz name is required', 'error'); return }
    setBusy(true)
    try {
      const r = await callRpc('policies_quiz_upsert', {
        p_quiz_id: null, p_policy_id: newQuiz.policy_id || null, p_key: null,
        p_label: newQuiz.label.trim(), p_questions: [], p_actor: currentUserId,
      })
      if (r && r.ok === false) throw new Error(r.error)
      setNewQuiz(null); await load()
      setEditing({ quiz_id: r.quiz_id, label: newQuiz.label.trim(), policy_id: newQuiz.policy_id || null, questions: [{ question: '', answers: ['', '', '', ''], correct_index: 0 }] })
    } catch { toast('Could not create quiz', 'error') }
    finally { setBusy(false) }
  }

  if (loading) return <StateBlock>Loading quizzes…</StateBlock>
  if (err) return <StateBlock tone="error">{err}</StateBlock>

  const participants = (() => {
    const seen = {}
    results.forEach(r => { seen[r.person_id] = r.person_name || 'Employee' })
    return Object.entries(seen).map(([id, name]) => ({ id, name }))
  })()

  return (
    <div>
      {/* Take Quiz Modal */}
      {takingQuiz && !takingQuiz.submitted && takingQuiz.quiz.questions.length > 0 && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-accent)', padding: 28, maxWidth: 520, width: '92%', borderRadius: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <div>
                <div style={{ ...S.cardTitle }}>{takingQuiz.quiz.label}</div>
                <div style={{ fontSize: 11, color: 'var(--t-text-muted)', marginTop: 2 }}>Question {takingQuiz.step + 1} of {takingQuiz.quiz.questions.length}</div>
              </div>
              <button style={S.btnGhost} onClick={() => setTakingQuiz(null)}>✕</button>
            </div>
            <div style={{ marginBottom: 6 }}>
              <div style={{ height: 3, background: 'var(--t-line)', borderRadius: 0 }}>
                <div style={{ height: '100%', width: `${(takingQuiz.step / takingQuiz.quiz.questions.length) * 100}%`, background: 'var(--t-accent)', transition: 'width 0.3s' }} />
              </div>
            </div>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--t-text)', marginBottom: 20, lineHeight: 1.55, marginTop: 16 }}>
              {takingQuiz.quiz.questions[takingQuiz.step].question}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {(takingQuiz.quiz.questions[takingQuiz.step].answers || []).map((ans, ai) => (
                <button key={ai}
                  style={{ background: 'var(--t-surface-2)', border: '1px solid var(--t-line)', color: 'var(--t-text)', padding: '10px 14px', fontSize: 13, cursor: 'pointer', textAlign: 'left', borderRadius: 0, display: 'flex', gap: 10, alignItems: 'center', transition: 'border-color 0.15s' }}
                  onClick={() => answerQuestion(ai)}
                  onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--t-accent)'}
                  onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--t-line)'}
                >
                  <span style={{ fontWeight: 700, color: 'var(--t-accent)', minWidth: 20 }}>{ANSWER_LABELS[ai]}</span>
                  <span>{ans}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Quiz Result Modal */}
      {takingQuiz?.submitted && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'var(--t-surface)', border: `1px solid ${takingQuiz.passed ? 'var(--t-success)' : 'var(--t-danger)'}`, padding: 32, maxWidth: 420, width: '90%', textAlign: 'center', borderRadius: 0 }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>{takingQuiz.passed ? '✓' : '✗'}</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: takingQuiz.passed ? 'var(--t-success)' : 'var(--t-danger)', marginBottom: 8 }}>
              {takingQuiz.score}/{takingQuiz.total} — {takingQuiz.passed ? 'PASSED' : 'FAILED'}
            </div>
            <div style={{ fontSize: 13, color: 'var(--t-text-muted)', marginBottom: 24, lineHeight: 1.6 }}>
              {takingQuiz.passed ? 'Result recorded. You have successfully completed this quiz.' : 'Please review the policy and retake when ready.'}
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              {!takingQuiz.passed && <button style={S.btn} onClick={() => setTakingQuiz({ quiz: takingQuiz.quiz, step: 0, answers: {}, submitted: false })}>Retake Quiz</button>}
              <button style={S.btnGhost} onClick={() => setTakingQuiz(null)}>{takingQuiz.passed ? 'Done' : 'Close'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Quiz Editor Modal */}
      {editing && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.80)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', overflowY: 'auto' }}>
          <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', padding: 28, maxWidth: 640, width: '94%', borderRadius: 0, maxHeight: '90vh', overflowY: 'auto', margin: '20px auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <div style={{ ...S.cardTitle }}>Edit Quiz</div>
              <button style={S.btnGhost} onClick={() => setEditing(null)}>Cancel</button>
            </div>
            <div style={{ marginBottom: 16 }}>
              <div style={{ ...S.label, marginBottom: 6 }}>Quiz Name</div>
              <input value={editing.label} onChange={e => setEditing(ed => ({ ...ed, label: e.target.value }))} style={{ ...S.input, width: '100%', boxSizing: 'border-box' }} />
            </div>
            <div style={{ marginBottom: 16 }}>
              <div style={{ ...S.label, marginBottom: 6 }}>Linked Policy</div>
              <select value={editing.policy_id || ''} onChange={e => setEditing(ed => ({ ...ed, policy_id: e.target.value || null }))} style={{ ...S.select, width: '100%', boxSizing: 'border-box' }}>
                <option value="">— none —</option>
                {published.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
              </select>
            </div>
            {editing.questions.map((q, qi) => (
              <div key={qi} style={{ ...S.card, padding: 16, marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <div style={{ ...S.label }}>Question {qi + 1}</div>
                  <button style={{ ...S.btnSm, borderColor: 'var(--t-danger)', color: 'var(--t-danger)', padding: '2px 8px' }} onClick={() => removeQuestion(qi)}>Remove</button>
                </div>
                <input value={q.question} onChange={e => updateQuestion(qi, 'question', e.target.value)} placeholder="Question text" style={{ ...S.input, width: '100%', boxSizing: 'border-box', marginBottom: 12 }} />
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
                  {q.answers.map((ans, ai) => (
                    <div key={ai} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--t-accent)', minWidth: 16 }}>{ANSWER_LABELS[ai]}</span>
                      <input value={ans} onChange={e => updateAnswer(qi, ai, e.target.value)} style={{ ...S.input, flex: 1 }} />
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ ...S.label }}>Correct Answer:</span>
                  <select value={q.correct_index} onChange={e => updateQuestion(qi, 'correct_index', Number(e.target.value))} style={S.select}>
                    {q.answers.map((_, i) => <option key={i} value={i}>{ANSWER_LABELS[i]}</option>)}
                  </select>
                </div>
              </div>
            ))}
            <button style={{ ...S.btnSm, marginBottom: 16 }} onClick={addQuestion}>+ Add Question</button>
            <div style={{ display: 'flex', gap: 10 }}>
              <button style={S.btn} onClick={saveQuiz} disabled={busy}>{busy ? '…' : 'Save Quiz'}</button>
              <button style={S.btnGhost} onClick={() => setEditing(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* New Quiz Modal */}
      {newQuiz && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-accent)', padding: 28, maxWidth: 480, width: '90%', borderRadius: 0 }}>
            <div style={{ ...S.cardTitle, marginBottom: 16 }}>New Quiz</div>
            <div style={{ marginBottom: 14 }}>
              <div style={{ ...S.label, marginBottom: 6 }}>Quiz Name *</div>
              <input value={newQuiz.label} onChange={e => setNewQuiz(q => ({ ...q, label: e.target.value }))} style={{ ...S.input, width: '100%', boxSizing: 'border-box' }} placeholder="e.g. Anti-Harassment" />
            </div>
            <div style={{ marginBottom: 20 }}>
              <div style={{ ...S.label, marginBottom: 6 }}>Linked Policy</div>
              <select value={newQuiz.policy_id || ''} onChange={e => setNewQuiz(q => ({ ...q, policy_id: e.target.value || null }))} style={{ ...S.select, width: '100%', boxSizing: 'border-box' }}>
                <option value="">— none —</option>
                {published.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button style={S.btnGhost} onClick={() => setNewQuiz(null)}>Cancel</button>
              <button style={S.btn} onClick={createQuiz} disabled={busy}>{busy ? '…' : 'Create & Add Questions'}</button>
            </div>
          </div>
        </div>
      )}

      {/* View Results Modal */}
      {viewingResults && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', padding: 24, maxWidth: 560, width: '92%', borderRadius: 0, maxHeight: '80vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ ...S.cardTitle }}>{viewingResults.label} — Results</div>
              <button style={S.btnGhost} onClick={() => setViewingResults(null)}>✕</button>
            </div>
            {results.filter(r => r.quiz_id === viewingResults.quiz_id).length === 0 ? (
              <div style={{ color: 'var(--t-text-muted)', fontSize: 13 }}>No one has taken this quiz yet.</div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--t-line)' }}>
                    {['Employee', 'Score', 'Status', 'Date'].map(h => <th key={h} style={{ textAlign: 'left', padding: '6px 10px', ...S.label }}>{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {results.filter(r => r.quiz_id === viewingResults.quiz_id).map(r => (
                    <tr key={r.person_id} style={{ borderBottom: '1px solid var(--t-line)' }}>
                      <td style={{ padding: '8px 10px', fontWeight: 600, color: 'var(--t-text)' }}>{r.person_name || 'Employee'}</td>
                      <td style={{ padding: '8px 10px', color: 'var(--t-text-muted)' }}>{r.score}/{r.total}</td>
                      <td style={{ padding: '8px 10px' }}>{r.passed ? <span className="badge green">Passed</span> : <span className="badge red">Failed</span>}</td>
                      <td style={{ padding: '8px 10px', color: 'var(--t-text-muted)', fontFamily: 'monospace', fontSize: 11 }}>{fmtDate(r.taken_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* KPI Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(130px,1fr))', gap: 12, marginBottom: 20 }}>
        <KTile label="Quizzes Active" value={quizzes.length} sub="Policies with quizzes" color="var(--t-accent)" />
        <KTile label="Pass Rate" value={`${overallRate}%`} sub="Of all attempts" color={overallRate >= 80 ? 'var(--t-success)' : 'var(--t-warn)'} />
        <KTile label="Failed This Month" value={failedThisMonth} sub="Need retry" alert={failedThisMonth > 0 ? 'red' : undefined} color={failedThisMonth > 0 ? 'var(--t-danger)' : 'var(--t-success)'} />
        <KTile label="Perfect Scores" value={perfectScores} sub="Passed all quizzes" color="var(--t-success)" />
      </div>

      {isHR && (
        <div style={{ marginBottom: 16 }}>
          <button style={S.btn} onClick={() => setNewQuiz({ policy_id: '', label: '' })}>+ New Quiz</button>
        </div>
      )}

      {quizzes.length === 0 ? (
        <StateBlock>{isHR ? 'No quizzes yet. Click “+ New Quiz” to create one.' : 'No quizzes available yet.'}</StateBlock>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: 16, marginBottom: 24 }}>
          {quizzes.map(quiz => {
            const stats = quizStats(quiz.quiz_id)
            const myResult = currentUserId ? resultIndex[quiz.quiz_id]?.[currentUserId] : null
            return (
              <div key={quiz.quiz_id} style={{ ...S.card, marginBottom: 0 }}>
                <div style={S.cardHeader}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--t-text)' }}>{quiz.label}</span>
                  {myResult && <span className={myResult.passed ? 'badge green' : 'badge red'} style={{ fontSize: 10 }}>{myResult.passed ? 'You Passed' : 'You Failed'}</span>}
                </div>
                <div style={S.cardBody}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                    <span style={{ ...S.muted }}>{quiz.questions.length} question{quiz.questions.length === 1 ? '' : 's'}</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: stats.rate >= 70 ? 'var(--t-success)' : 'var(--t-warn)' }}>{stats.rate}% pass rate</span>
                  </div>
                  <ProgressBar value={stats.passed} total={stats.taken} color={stats.rate >= 70 ? 'var(--t-success)' : 'var(--t-warn)'} />
                  <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
                    {!isHR && quiz.questions.length > 0 && (
                      <button style={S.btnSm} onClick={() => startQuiz(quiz)}>{myResult?.passed ? 'Retake' : 'Take Quiz'}</button>
                    )}
                    {isHR && (
                      <>
                        <button style={S.btnSm} onClick={() => openEdit(quiz)}>Edit Quiz</button>
                        <button style={{ ...S.btnSm, borderColor: 'var(--t-text-muted)', color: 'var(--t-text-muted)' }} onClick={() => setViewingResults(quiz)}>View Results</button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Participant status table */}
      {participants.length > 0 && (
        <div style={S.card}>
          <div style={S.cardHeader}><span style={S.cardTitle}>Employee Quiz Status</span></div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', fontSize: 12, minWidth: '100%' }}>
              <thead>
                <tr style={{ background: 'var(--t-surface-2)', borderBottom: '1px solid var(--t-line)' }}>
                  <th style={{ textAlign: 'left', padding: '8px 12px', ...S.label, minWidth: 140, position: 'sticky', left: 0, background: 'var(--t-surface-2)', borderRight: '1px solid var(--t-line)' }}>Employee</th>
                  {quizzes.map(q => (
                    <th key={q.quiz_id} style={{ padding: '8px 10px', ...S.label, textAlign: 'center', minWidth: 80 }}>
                      <span title={q.label} style={{ display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 72, fontSize: 9 }}>{q.label}</span>
                    </th>
                  ))}
                  <th style={{ padding: '8px 10px', ...S.label, textAlign: 'center', minWidth: 100 }}>Overall</th>
                </tr>
              </thead>
              <tbody>
                {participants.map(emp => {
                  const cells = quizzes.map(q => resultIndex[q.quiz_id]?.[emp.id])
                  const taken = cells.filter(Boolean)
                  const overall = taken.length === 0 ? null : (taken.every(r => r.passed) ? 'COMPLIANT' : 'NEEDS REVIEW')
                  return (
                    <tr key={emp.id} style={{ borderBottom: '1px solid var(--t-line)' }}>
                      <td style={{ padding: '8px 12px', fontWeight: 600, color: 'var(--t-text)', position: 'sticky', left: 0, background: 'var(--t-surface)', zIndex: 1, borderRight: '1px solid var(--t-line)' }}>{emp.name}</td>
                      {cells.map((r, i) => (
                        <td key={i} style={{ textAlign: 'center', padding: '8px 10px' }}>
                          {!r ? <span style={{ color: 'var(--t-text-muted)' }}>—</span>
                            : r.passed ? <span style={{ color: 'var(--t-success)', fontWeight: 700 }}>✓</span>
                              : <span style={{ color: 'var(--t-danger)', fontWeight: 700 }}>✗</span>}
                        </td>
                      ))}
                      <td style={{ textAlign: 'center', padding: '8px 10px' }}>
                        {overall ? <span className={overall === 'COMPLIANT' ? 'badge green' : 'badge red'} style={{ fontSize: 10 }}>{overall}</span> : <span style={{ color: 'var(--t-text-muted)' }}>—</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

// ── AI Assist local text transforms (client-side editing aid; result is saved via real RPC) ─
function aiTransform(action, content) {
  let next = content
  const firstParaEnd = next.indexOf('\n\n')
  const firstPara = firstParaEnd > -1 ? next.slice(0, firstParaEnd) : next
  if (action === 'expand') {
    next = next + '\n\nADDITIONAL CONTEXT\nThis section provides supplementary guidance for employees and managers. All provisions within this policy are subject to applicable federal, state, and local law. Where this policy conflicts with applicable law, the law shall govern. Employees who have questions regarding the application of this policy to specific circumstances should contact the HR department for clarification.'
  } else if (action === 'simplify') {
    next = next.replace(/\bshall\b/g, 'will').replace(/\bpursuant to\b/gi, 'under').replace(/\butilize\b/gi, 'use').replace(/\bprior to\b/gi, 'before').replace(/\bin the event that\b/gi, 'if')
  } else if (action === 'compliance') {
    next = next + '\n\nCONNECTICUT COMPLIANCE NOTE\nThis policy is designed to comply with applicable Massachusetts state law, including the Massachusetts General Statutes, Massachusetts Fair Employment Practices Act (CGS §46a-60), and Massachusetts Paid Sick Leave law (CGS §31-57r). Employees are encouraged to report any compliance concerns to HR or the COO immediately.'
  } else if (action === 'rewrite') {
    const rest = firstParaEnd > -1 ? next.slice(firstParaEnd) : ''
    const title = firstPara.split('\n')[0] || firstPara
    next = title + '\n\nThis policy establishes clear standards and expectations for all employees. It reflects our commitment to operating a compliant, ethical, and professional workplace while protecting the rights and interests of every team member. All employees are expected to read, understand, and adhere to the provisions outlined below.' + rest
  }
  return next
}

// ── TAB 6: Edit Policies ──────────────────────────────────
function EditPoliciesTab({ policies, session, onReload, toast }) {
  const [searchQ, setSearchQ] = useState('')
  const [catFilter, setCatFilter] = useState('All')
  const [selectedId, setSelectedId] = useState(null)
  const [showAI, setShowAI] = useState(false)
  const [aiPrompt, setAiPrompt] = useState('')
  const [aiDiff, setAiDiff] = useState(null)
  const [aiPendingContent, setAiPendingContent] = useState(null)
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [importResults, setImportResults] = useState(null)
  const [draft, setDraft] = useState(null)
  const batchImportRef = useRef(null)

  const editable = useMemo(() => policies.filter(p => p.status === 'published'), [policies])
  const filtered = useMemo(() => editable.filter(p => {
    const matchCat = catFilter === 'All' || p.category === catFilter
    const matchQ = !searchQ || p.title.toLowerCase().includes(searchQ.toLowerCase()) || p.category.toLowerCase().includes(searchQ.toLowerCase())
    return matchCat && matchQ
  }), [editable, catFilter, searchQ])

  const selectedPolicy = selectedId != null ? editable.find(p => p.id === selectedId) : null

  useEffect(() => {
    if (selectedPolicy) {
      setDraft({
        category: selectedPolicy.category, version: selectedPolicy.version,
        effective: selectedPolicy.effective_date || '', ackRequired: selectedPolicy.ack_required,
        roleLevel: selectedPolicy.role_level || 'all', content: selectedPolicy.content,
        annotation: selectedPolicy.change_annotation || '',
      })
      setShowAI(false); setAiDiff(null); setAiPendingContent(null); setAiPrompt('')
    } else { setDraft(null) }
  }, [selectedId]) // eslint-disable-line

  async function handleSave() {
    if (!draft || !selectedId) return
    setBusy(true)
    try {
      const r = await callRpc('policies_upsert', {
        p_id: selectedId, p_category: draft.category, p_title: selectedPolicy.title,
        p_version: draft.version, p_effective: draft.effective || null, p_ack_required: draft.ackRequired,
        p_role_level: draft.roleLevel, p_content: draft.content, p_status: 'published',
        p_release_at: null, p_annotation: draft.annotation.trim() || null, p_source: null,
        p_actor: session?.person?.id || null,
      })
      if (r && r.ok === false) throw new Error(r.error)
      toast('Policy changes saved'); await onReload()
    } catch { toast('Could not save policy', 'error') }
    finally { setBusy(false) }
  }

  async function handleDelete() {
    if (!selectedId) return
    setBusy(true)
    try {
      const r = await callRpc('policies_delete', { p_id: selectedId, p_actor: session?.person?.id || null })
      if (r && r.ok === false) throw new Error(r.error)
      toast('Policy deleted'); setDeleteConfirm(false); setSelectedId(null); await onReload()
    } catch { toast('Could not delete policy', 'error') }
    finally { setBusy(false) }
  }

  function applyAIAction(action) {
    if (!draft) return
    const next = aiTransform(action, draft.content)
    const origFirst = draft.content.split('\n\n')[0].trim().slice(0, 120)
    const newFirst = next.split('\n\n')[0].trim().slice(0, 120)
    setAiDiff({ orig: origFirst, next: newFirst }); setAiPendingContent(next)
  }
  function applyAIPromptAction() {
    if (!aiPrompt.trim() || !draft) return
    const lower = aiPrompt.toLowerCase()
    if (lower.includes('expand') || lower.includes('more detail')) applyAIAction('expand')
    else if (lower.includes('simplif') || lower.includes('simpler') || lower.includes('plain')) applyAIAction('simplify')
    else if (lower.includes('complian') || lower.includes('connecticut') || lower.includes('legal')) applyAIAction('compliance')
    else applyAIAction('rewrite')
  }
  function acceptAI() {
    if (!aiPendingContent || !draft) return
    setDraft(d => ({ ...d, content: aiPendingContent }))
    setAiDiff(null); setAiPendingContent(null); setAiPrompt('')
    toast('Draft updated — click Save Changes to persist')
  }
  function rejectAI() { setAiDiff(null); setAiPendingContent(null); setAiPrompt('') }

  async function handleBatchImport(e) {
    const file = e.target.files[0]
    if (!file) return
    const text = await file.text()
    const blocks = text.split(/\n---+\n/)
    const parsed = blocks.map(block => {
      const lines = block.trim().split('\n')
      const title = (lines[0] || '').replace(/^#+\s*/, '').trim()
      const content = lines.slice(1).join('\n').trim()
      return { title, content }
    }).filter(p => p.title && p.content)
    if (parsed.length === 0) {
      toast('No valid policies found. Format: Title on line 1, content below, separated by "---"', 'error')
      if (batchImportRef.current) batchImportRef.current.value = ''
      return
    }
    setBusy(true)
    let ok = 0
    for (const p of parsed) {
      try {
        const r = await callRpc('policies_upsert', {
          p_id: null, p_category: 'Operations', p_title: p.title, p_version: 'v1.0',
          p_effective: new Date().toISOString().slice(0, 10), p_ack_required: false,
          p_role_level: 'all', p_content: p.content, p_status: 'published', p_release_at: null,
          p_annotation: null, p_source: 'import', p_actor: session?.person?.id || null,
        })
        if (!(r && r.ok === false)) ok++
      } catch { /* skip */ }
    }
    setBusy(false)
    setImportResults({ count: ok })
    toast(`Imported ${ok} ${ok === 1 ? 'policy' : 'policies'}`, ok > 0 ? 'success' : 'error')
    if (batchImportRef.current) batchImportRef.current.value = ''
    await onReload()
  }

  const catBadgeColor = { Employment: 'blue', Conduct: 'amber', Safety: 'red', Benefits: 'green', Operations: 'purple', Technology: 'cyan', Legal: 'purple' }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: 16, alignItems: 'start' }}>
      {deleteConfirm && (
        <ConfirmModal
          title="Delete Policy" body={`Permanently delete "${selectedPolicy?.title}"? This removes the policy and its acknowledgments, comments, and version history.`}
          onConfirm={handleDelete} onCancel={() => setDeleteConfirm(false)} confirmLabel="Delete" danger busy={busy}
        />
      )}

      <div>
        <div style={S.card}>
          <div style={S.cardHeader}><span style={S.cardTitle}>Batch Import</span></div>
          <div style={S.cardBody}>
            <div style={{ fontSize: 12, color: 'var(--t-text-muted)', marginBottom: 8 }}>
              Upload a .txt or .md file — each policy separated by "---". Title on line 1, then content. Saved as real published policies.
            </div>
            <input type="file" accept=".txt,.md" style={{ fontSize: 12, color: 'var(--t-text-muted)' }} onChange={handleBatchImport} ref={batchImportRef} disabled={busy} />
            {importResults && (
              <div style={{ marginTop: 8, fontSize: 12, color: 'var(--t-success)' }}>✓ Imported {importResults.count} {importResults.count === 1 ? 'policy' : 'policies'}</div>
            )}
          </div>
        </div>

        <div style={{ ...S.card }}>
          <div style={{ ...S.cardHeader, flexDirection: 'column', gap: 8, alignItems: 'stretch' }}>
            <span style={S.cardTitle}>Policy List</span>
            <input style={{ ...S.input, width: '100%', boxSizing: 'border-box' }} placeholder="Search policies..." value={searchQ} onChange={e => setSearchQ(e.target.value)} />
            <select style={{ ...S.select, width: '100%', boxSizing: 'border-box' }} value={catFilter} onChange={e => setCatFilter(e.target.value)}>
              <option value="All">All Categories</option>
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            {filtered.map(p => {
              const isSelected = selectedId === p.id
              return (
                <div key={p.id}
                  style={{ padding: '10px 12px', borderBottom: '1px solid var(--t-line)', cursor: 'pointer', background: isSelected ? 'var(--t-surface-2)' : 'transparent', borderLeft: isSelected ? '3px solid var(--t-accent)' : '3px solid transparent', transition: 'background 0.1s' }}
                  onClick={() => setSelectedId(p.id)}
                >
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 4 }}>
                    <span className={`badge ${catBadgeColor[p.category] || 'blue'}`} style={{ fontSize: 9 }}>{p.category}</span>
                    {p.source === 'import' && <span className="badge blue" style={{ fontSize: 9 }}>Imported</span>}
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--t-text)', marginBottom: 2, lineHeight: 1.35 }}>{p.title}</div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span style={{ fontSize: 10, color: 'var(--t-text-muted)' }}>{verLabel(p.version)}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                    <button style={{ ...S.btnSm, fontSize: 10, padding: '2px 8px' }} onClick={e => { e.stopPropagation(); setSelectedId(p.id); setShowAI(false) }}>Edit</button>
                    <button style={{ ...S.btnSm, fontSize: 10, padding: '2px 8px', borderColor: 'var(--t-purple, #7c4dff)', color: 'var(--t-purple, #7c4dff)' }} onClick={e => { e.stopPropagation(); setSelectedId(p.id); setShowAI(true) }}>AI Assist</button>
                  </div>
                </div>
              )
            })}
            {filtered.length === 0 && <div style={{ padding: 20, color: 'var(--t-text-muted)', fontSize: 12, textAlign: 'center' }}>{editable.length === 0 ? 'No policies yet. Create one in the Scheduled tab or import above.' : 'No policies match filter'}</div>}
          </div>
        </div>
      </div>

      <div>
        {!selectedPolicy && (
          <div style={{ ...S.card, padding: 48, textAlign: 'center' }}>
            <div style={{ fontSize: 13, color: 'var(--t-text-muted)' }}>Select a policy from the list to edit it.</div>
          </div>
        )}

        {selectedPolicy && draft && !showAI && (
          <div style={S.card}>
            <div style={{ ...S.cardHeader }}><span style={S.cardTitle}>EDITING: {selectedPolicy.title}</span></div>
            <div style={S.cardBody}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr auto', gap: 12, marginBottom: 16 }}>
                <div>
                  <div style={{ ...S.label, marginBottom: 4 }}>Category</div>
                  <select style={{ ...S.select, width: '100%', boxSizing: 'border-box' }} value={draft.category} onChange={e => setDraft(d => ({ ...d, category: e.target.value }))}>
                    {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <div style={{ ...S.label, marginBottom: 4 }}>Version</div>
                  <input style={{ ...S.input, width: '100%', boxSizing: 'border-box' }} value={draft.version} onChange={e => setDraft(d => ({ ...d, version: e.target.value }))} />
                </div>
                <div>
                  <div style={{ ...S.label, marginBottom: 4 }}>Effective Date</div>
                  <input type="date" style={{ ...S.input, width: '100%', boxSizing: 'border-box' }} value={draft.effective} onChange={e => setDraft(d => ({ ...d, effective: e.target.value }))} />
                </div>
                <div>
                  <div style={{ ...S.label, marginBottom: 4 }}>Role Level</div>
                  <select style={{ ...S.select, width: '100%', boxSizing: 'border-box' }} value={draft.roleLevel} onChange={e => setDraft(d => ({ ...d, roleLevel: e.target.value }))}>
                    <option value="all">All</option>
                    <option value="keyholder">Key Holder+</option>
                    <option value="manager">Manager+</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 12, color: 'var(--t-text)', whiteSpace: 'nowrap' }}>
                    <input type="checkbox" checked={draft.ackRequired} onChange={e => setDraft(d => ({ ...d, ackRequired: e.target.checked }))} style={{ accentColor: 'var(--t-accent)', cursor: 'pointer' }} />
                    Ack Required
                  </label>
                </div>
              </div>
              <div style={{ borderTop: '1px solid var(--t-line)', marginBottom: 12 }} />
              <textarea rows={20} style={{ ...S.textarea, fontFamily: 'monospace', fontSize: 13 }} value={draft.content} onChange={e => setDraft(d => ({ ...d, content: e.target.value }))} />
              <div style={{ marginTop: 16, borderTop: '1px solid var(--t-line)', paddingTop: 16 }}>
                <div style={{ ...S.label, marginBottom: 6 }}>Change Annotation (shown to employees on the policy card)</div>
                <input type="text" style={{ ...S.input, width: '100%', boxSizing: 'border-box' }} placeholder="e.g., Updated to reflect CT minimum wage increase" value={draft.annotation} onChange={e => setDraft(d => ({ ...d, annotation: e.target.value }))} />
              </div>
              <div style={{ borderTop: '1px solid var(--t-line)', marginTop: 16, marginBottom: 12 }} />
              <div style={{ display: 'flex', gap: 10 }}>
                <button style={S.btn} onClick={handleSave} disabled={busy}>{busy ? '…' : 'Save Changes'}</button>
                <button style={S.btnDanger} onClick={() => setDeleteConfirm(true)}>Delete Policy</button>
              </div>
            </div>
          </div>
        )}

        {selectedPolicy && draft && showAI && (
          <div style={S.card}>
            <div style={S.cardHeader}>
              <span style={S.cardTitle}>AI ASSIST — {selectedPolicy.title}</span>
              <button style={S.btnGhost} onClick={() => { setShowAI(false); setAiDiff(null); setAiPendingContent(null) }}>Back to Editor</button>
            </div>
            <div style={S.cardBody}>
              <div style={{ ...S.label, marginBottom: 6 }}>Prompt</div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                <input style={{ ...S.input, flex: 1 }} placeholder="Type what you want to change..." value={aiPrompt} onChange={e => setAiPrompt(e.target.value)} onKeyDown={e => e.key === 'Enter' && applyAIPromptAction()} />
                <button style={S.btn} onClick={applyAIPromptAction}>Apply</button>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
                {[{ label: 'Expand this section', action: 'expand' }, { label: 'Simplify language', action: 'simplify' }, { label: 'Add compliance note', action: 'compliance' }, { label: 'Rewrite intro', action: 'rewrite' }].map(chip => (
                  <button key={chip.action} style={{ background: 'var(--t-surface-2)', border: '1px solid var(--t-line)', color: 'var(--t-text)', padding: '5px 12px', fontSize: 11, fontWeight: 600, cursor: 'pointer', borderRadius: 0 }} onClick={() => applyAIAction(chip.action)}>{chip.label}</button>
                ))}
              </div>
              {aiDiff ? (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ ...S.label, marginBottom: 8 }}>Preview Changes</div>
                  <div style={{ background: 'rgba(255,149,0,0.12)', border: '1px solid var(--t-warn)', padding: '8px 12px', fontSize: 12, fontFamily: 'monospace', marginBottom: 4, color: 'var(--t-text)' }}>
                    <span style={{ color: 'var(--t-warn)', fontWeight: 700, marginRight: 8 }}>− BEFORE:</span>{aiDiff.orig}
                  </div>
                  <div style={{ background: 'rgba(52,199,89,0.10)', border: '1px solid var(--t-success)', padding: '8px 12px', fontSize: 12, fontFamily: 'monospace', color: 'var(--t-text)' }}>
                    <span style={{ color: 'var(--t-success)', fontWeight: 700, marginRight: 8 }}>+ AFTER:</span>{aiDiff.next}
                  </div>
                  <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
                    <button style={S.btn} onClick={acceptAI}>Accept Changes</button>
                    <button style={S.btnDanger} onClick={rejectAI}>Reject</button>
                  </div>
                </div>
              ) : (
                <div style={{ color: 'var(--t-text-muted)', fontSize: 12 }}>Choose a quick action or type a custom prompt above, then click Apply to preview. Accepted text is saved to the real policy from the editor.</div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── TAB 7: Scheduled ─────────────────────────────────────
function ScheduledTab({ policies, session, onReload, toast }) {
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [deleteConfirm, setDeleteConfirm] = useState(null)
  const [publishNowConfirm, setPublishNowConfirm] = useState(null)
  const [busy, setBusy] = useState(false)
  const [now, setNow] = useState(Date.now())
  const [form, setForm] = useState({ title: '', category: 'Employment', version: '1.0', effective: '', ackRequired: false, content: '', releaseDate: '', releaseTime: '08:00' })

  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t) }, [])

  const drafts = useMemo(() => policies.filter(p => p.status === 'draft'), [policies])
  const scheduled = useMemo(() => policies.filter(p => p.status === 'scheduled').sort((a, b) => new Date(a.release_at) - new Date(b.release_at)), [policies])
  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
  const recentPublished = useMemo(() => policies.filter(p => p.status === 'published' && p.published_at && new Date(p.published_at).getTime() >= thirtyDaysAgo).sort((a, b) => new Date(b.published_at) - new Date(a.published_at)), [policies])

  // Auto-publish due scheduled items (real write) when HR views this tab.
  const publishingRef = useRef(false)
  useEffect(() => {
    async function sweep() {
      if (publishingRef.current) return
      const due = scheduled.filter(p => p.release_at && new Date(p.release_at).getTime() <= Date.now())
      if (due.length === 0) return
      publishingRef.current = true
      for (const p of due) { try { await callRpc('policies_publish', { p_id: p.id, p_actor: session?.person?.id || null }) } catch { /* ignore */ } }
      publishingRef.current = false
      due.forEach(p => toast(`Policy "${p.title}" auto-published`, 'success'))
      await onReload()
    }
    sweep()
    const iv = setInterval(sweep, 60000)
    return () => clearInterval(iv)
  }, [scheduled, session, onReload, toast])

  function resetForm() { setForm({ title: '', category: 'Employment', version: '1.0', effective: '', ackRequired: false, content: '', releaseDate: '', releaseTime: '08:00' }) }

  async function upsert(status, releaseAt) {
    setBusy(true)
    try {
      const r = await callRpc('policies_upsert', {
        p_id: editingId, p_category: form.category, p_title: form.title, p_version: verLabel(form.version),
        p_effective: form.effective || null, p_ack_required: form.ackRequired, p_role_level: 'all',
        p_content: form.content, p_status: status, p_release_at: releaseAt, p_annotation: null,
        p_source: null, p_actor: session?.person?.id || null,
      })
      if (r && r.ok === false) throw new Error(r.error)
      setShowForm(false); setEditingId(null); resetForm(); await onReload()
      return true
    } catch (e) { toast(e.message || 'Save failed', 'error'); return false }
    finally { setBusy(false) }
  }

  async function handleSaveDraft() {
    if (!form.title.trim() || !form.content.trim()) { toast('Title and content are required', 'error'); return }
    if (await upsert('draft', null)) toast('Draft saved')
  }
  async function handleSchedule() {
    if (!form.title.trim() || !form.content.trim()) { toast('Title and content are required', 'error'); return }
    if (!form.releaseDate) { toast('Release date is required to schedule', 'error'); return }
    const releaseAt = new Date(`${form.releaseDate}T${form.releaseTime || '08:00'}`)
    if (releaseAt.getTime() <= Date.now()) { toast('Release date/time must be in the future', 'error'); return }
    if (await upsert('scheduled', releaseAt.toISOString())) toast(`Policy scheduled for ${releaseAt.toLocaleString()}`)
  }

  function openEdit(item) {
    setEditingId(item.id)
    setForm({
      title: item.title, category: item.category, version: item.version || '1.0',
      effective: item.effective_date || '', ackRequired: item.ack_required, content: item.content,
      releaseDate: item.release_at ? item.release_at.slice(0, 10) : '',
      releaseTime: item.release_at ? new Date(item.release_at).toTimeString().slice(0, 5) : '08:00',
    })
    setShowForm(true)
  }

  async function publishNow(item) {
    setBusy(true)
    try {
      const r = await callRpc('policies_publish', { p_id: item.id, p_actor: session?.person?.id || null })
      if (r && r.ok === false) throw new Error(r.error)
      setPublishNowConfirm(null); toast(`"${item.title}" published`); await onReload()
    } catch { toast('Could not publish', 'error') }
    finally { setBusy(false) }
  }
  async function deletePolicy(item) {
    setBusy(true)
    try {
      const r = await callRpc('policies_delete', { p_id: item.id, p_actor: session?.person?.id || null })
      if (r && r.ok === false) throw new Error(r.error)
      setDeleteConfirm(null); toast('Deleted'); await onReload()
    } catch { toast('Could not delete', 'error') }
    finally { setBusy(false) }
  }

  function formatCountdown(releaseAt) {
    const ms = new Date(releaseAt).getTime() - now
    if (ms <= 0) return 'Publishing...'
    const totalSec = Math.floor(ms / 1000)
    const d = Math.floor(totalSec / 86400), h = Math.floor((totalSec % 86400) / 3600), m = Math.floor((totalSec % 3600) / 60), s = totalSec % 60
    const parts = []
    if (d > 0) parts.push(`${d}d`)
    if (h > 0 || d > 0) parts.push(`${h}h`)
    parts.push(`${m}m`); parts.push(`${String(s).padStart(2, '0')}s`)
    return parts.join(' ')
  }
  function formatReleaseLabel(releaseAt) {
    return new Date(releaseAt).toLocaleString('en-US', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
  }

  const catBadgeColor2 = { Employment: 'blue', Conduct: 'amber', Safety: 'red', Benefits: 'green', Operations: 'purple', Technology: 'cyan', Legal: 'purple' }

  return (
    <div>
      {deleteConfirm && (
        <ConfirmModal title="Delete Policy" body={`Permanently delete "${deleteConfirm.title}"?`} onConfirm={() => deletePolicy(deleteConfirm)} onCancel={() => setDeleteConfirm(null)} confirmLabel="Delete" danger busy={busy} />
      )}
      {publishNowConfirm && (
        <ConfirmModal title="Publish Now" body={`Immediately publish "${publishNowConfirm.title}"?`} onConfirm={() => publishNow(publishNowConfirm)} onCancel={() => setPublishNowConfirm(null)} confirmLabel="Publish Now" busy={busy} />
      )}

      {!showForm && (
        <div style={{ marginBottom: 20 }}>
          <button style={{ ...S.btn, fontSize: 14, padding: '10px 22px' }} onClick={() => { resetForm(); setEditingId(null); setShowForm(true) }}>+ Create New Draft Policy</button>
        </div>
      )}

      {showForm && (
        <div style={{ ...S.card, border: '1px solid var(--t-accent)', marginBottom: 24 }}>
          <div style={S.cardHeader}>
            <span style={S.cardTitle}>{editingId ? 'EDIT DRAFT' : 'NEW DRAFT POLICY'}</span>
            <button style={S.btnGhost} onClick={() => { setShowForm(false); setEditingId(null); resetForm() }}>Cancel</button>
          </div>
          <div style={S.cardBody}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <div style={{ gridColumn: '1 / -1' }}>
                <div style={{ ...S.label, marginBottom: 4 }}>Title *</div>
                <input style={{ ...S.input, width: '100%', boxSizing: 'border-box' }} placeholder="Policy title" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
              </div>
              <div>
                <div style={{ ...S.label, marginBottom: 4 }}>Category *</div>
                <select style={{ ...S.select, width: '100%', boxSizing: 'border-box' }} value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <div style={{ ...S.label, marginBottom: 4 }}>Version</div>
                <input style={{ ...S.input, width: '100%', boxSizing: 'border-box' }} placeholder="1.0" value={form.version} onChange={e => setForm(f => ({ ...f, version: e.target.value }))} />
              </div>
              <div>
                <div style={{ ...S.label, marginBottom: 4 }}>Effective Date</div>
                <input type="date" style={{ ...S.input, width: '100%', boxSizing: 'border-box' }} value={form.effective} onChange={e => setForm(f => ({ ...f, effective: e.target.value }))} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: 'var(--t-text)', marginTop: 20 }}>
                  <input type="checkbox" checked={form.ackRequired} onChange={e => setForm(f => ({ ...f, ackRequired: e.target.checked }))} style={{ accentColor: 'var(--t-accent)', cursor: 'pointer' }} />
                  Ack Required
                </label>
              </div>
            </div>
            <div style={{ borderTop: '1px solid var(--t-line)', marginBottom: 12 }} />
            <div style={{ ...S.label, marginBottom: 4 }}>Content *</div>
            <textarea rows={20} style={{ ...S.textarea, fontFamily: 'monospace', fontSize: 13, marginBottom: 12 }} placeholder="Full policy content..." value={form.content} onChange={e => setForm(f => ({ ...f, content: e.target.value }))} />
            <div style={{ borderTop: '1px solid var(--t-line)', marginBottom: 12 }} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 8 }}>
              <div>
                <div style={{ ...S.label, marginBottom: 4 }}>Release Date</div>
                <input type="date" style={{ ...S.input, width: '100%', boxSizing: 'border-box' }} value={form.releaseDate} onChange={e => setForm(f => ({ ...f, releaseDate: e.target.value }))} />
              </div>
              <div>
                <div style={{ ...S.label, marginBottom: 4 }}>Release Time</div>
                <input type="time" style={{ ...S.input, width: '100%', boxSizing: 'border-box' }} value={form.releaseTime} onChange={e => setForm(f => ({ ...f, releaseTime: e.target.value }))} />
              </div>
            </div>
            {form.releaseDate && (
              <div style={{ fontSize: 12, color: 'var(--t-text-muted)', marginBottom: 12 }}>
                Will auto-publish on {new Date(`${form.releaseDate}T${form.releaseTime || '08:00'}`).toLocaleString('en-US', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}
              </div>
            )}
            <div style={{ borderTop: '1px solid var(--t-line)', marginBottom: 12 }} />
            <div style={{ display: 'flex', gap: 10 }}>
              <button style={S.btnAmber} onClick={handleSaveDraft} disabled={busy}>Save as Draft</button>
              <button style={S.btn} onClick={handleSchedule} disabled={busy}>Schedule Release</button>
              <button style={S.btnGhost} onClick={() => { setShowForm(false); setEditingId(null); resetForm() }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      <div style={S.card}>
        <div style={S.cardHeader}><span style={S.cardTitle}>⏳ SCHEDULED ({scheduled.length})</span></div>
        <div style={S.cardBody}>
          {scheduled.length === 0 && <div style={{ color: 'var(--t-text-muted)', fontSize: 13 }}>No scheduled policies.</div>}
          {scheduled.map(item => (
            <div key={item.id} style={{ ...S.card, marginBottom: 12 }}>
              <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--t-line)' }}>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                  <span className={`badge ${catBadgeColor2[item.category] || 'blue'}`} style={{ fontSize: 9 }}>{item.category}</span>
                  <span className="badge amber" style={{ fontSize: 9 }}>SCHEDULED</span>
                </div>
                <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--t-text)', marginBottom: 4 }}>{item.title}</div>
                <div style={{ display: 'flex', gap: 16, fontSize: 11, color: 'var(--t-text-muted)' }}>
                  {item.ack_required && <span>Ack Required: Yes</span>}
                  {item.effective_date && <span>Effective: {item.effective_date}</span>}
                  <span>{verLabel(item.version)}</span>
                </div>
              </div>
              <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--t-line)', background: 'var(--t-surface-2)' }}>
                <div style={{ fontSize: 12, color: 'var(--t-text-muted)', marginBottom: 4 }}>Scheduled for: <strong style={{ color: 'var(--t-text)' }}>{formatReleaseLabel(item.release_at)}</strong></div>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--t-accent)' }}>Time remaining: {formatCountdown(item.release_at)}</div>
              </div>
              <div style={{ padding: '10px 14px', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button style={{ ...S.btnSm, fontSize: 11 }} onClick={() => openEdit(item)}>Edit / Reschedule</button>
                <button style={S.btn} onClick={() => setPublishNowConfirm(item)}>Publish Now</button>
                <button style={{ ...S.btnDanger, fontSize: 11, padding: '4px 10px' }} onClick={() => setDeleteConfirm(item)}>Cancel / Delete</button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={S.card}>
        <div style={S.cardHeader}><span style={S.cardTitle}>📝 DRAFTS ({drafts.length})</span></div>
        <div style={S.cardBody}>
          {drafts.length === 0 && <div style={{ color: 'var(--t-text-muted)', fontSize: 13 }}>No unscheduled drafts.</div>}
          {drafts.map(item => (
            <div key={item.id} style={{ ...S.card, marginBottom: 12 }}>
              <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--t-line)' }}>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                  <span className={`badge ${catBadgeColor2[item.category] || 'blue'}`} style={{ fontSize: 9 }}>{item.category}</span>
                  <span className="badge blue" style={{ fontSize: 9 }}>DRAFT</span>
                </div>
                <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--t-text)', marginBottom: 4 }}>{item.title}</div>
                <div style={{ display: 'flex', gap: 16, fontSize: 11, color: 'var(--t-text-muted)' }}>
                  {item.ack_required && <span>Ack Required: Yes</span>}
                  {item.effective_date && <span>Effective: {item.effective_date}</span>}
                  <span>{verLabel(item.version)}</span>
                  <span>Created: {fmtDate(item.created_at)}</span>
                </div>
              </div>
              <div style={{ padding: '10px 14px', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button style={{ ...S.btnSm, fontSize: 11 }} onClick={() => openEdit(item)}>Edit Draft</button>
                <button style={S.btn} onClick={() => setPublishNowConfirm(item)}>Publish Now</button>
                <button style={{ ...S.btnDanger, fontSize: 11, padding: '4px 10px' }} onClick={() => setDeleteConfirm(item)}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={S.card}>
        <div style={S.cardHeader}>
          <span style={S.cardTitle}>✅ RECENTLY PUBLISHED ({recentPublished.length})</span>
          <span style={{ fontSize: 11, color: 'var(--t-text-muted)' }}>Last 30 days</span>
        </div>
        <div style={S.cardBody}>
          {recentPublished.length === 0 && <div style={{ color: 'var(--t-text-muted)', fontSize: 13 }}>No policies published in the last 30 days.</div>}
          {recentPublished.map(item => {
            const isNew = new Date(item.published_at).getTime() >= sevenDaysAgo
            return (
              <div key={item.id} style={{ ...S.card, marginBottom: 12 }}>
                <div style={{ padding: '12px 14px' }}>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                    <span className={`badge ${catBadgeColor2[item.category] || 'blue'}`} style={{ fontSize: 9 }}>{item.category}</span>
                    <span className="badge green" style={{ fontSize: 9 }}>PUBLISHED</span>
                    {isNew && <span className="badge green" style={{ fontSize: 9, fontWeight: 900 }}>NEW</span>}
                  </div>
                  <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--t-text)', marginBottom: 4 }}>{item.title}</div>
                  <div style={{ fontSize: 11, color: 'var(--t-text-muted)' }}>Published: {new Date(item.published_at).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}</div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ── Main Export ───────────────────────────────────────────
export default function Policies() {
  const { session } = useAuth()
  const { locationIds } = useScope()
  const showVersioning = useFeatureFlag('policy_versioning')
  const showQuiz = useFeatureFlag('policy_quiz')
  const person = session?.person || {}
  const r = person.role_name || ''
  const isHR = ['ceo', 'hr', 'manager', 'coo', 'admin', 'owner'].some(x => r.toLowerCase().includes(x))

  const { toasts, show: toast } = useToast()
  const [tab, setTab] = useState(0)

  const [policies, setPolicies] = useState([])
  const [myAcks, setMyAcks] = useState([])
  const [sigSummary, setSigSummary] = useState([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState(null)

  const load = useCallback(async () => {
    setErr(null)
    try {
      const tasks = [
        callRpc('policies_list'),
        person.id ? callRpc('policies_my_acks', { p_person_id: person.id }) : Promise.resolve([]),
        isHR ? callRpc('policies_signature_summary', { p_node_ids: locationIds && locationIds.length ? locationIds : null }) : Promise.resolve([]),
      ]
      const [pols, acks, sig] = await Promise.all(tasks)
      setPolicies(pols || [])
      setMyAcks(acks || [])
      setSigSummary(sig || [])
    } catch (e) { setErr(e.message || 'Failed to load policies') }
    finally { setLoading(false) }
  }, [person.id, isHR, locationIds])
  useEffect(() => { load() }, [load])

  const currentVersion = useMemo(() => {
    const m = new Map(); policies.forEach(p => m.set(p.id, p.version)); return m
  }, [policies])
  const mySignedIds = useMemo(() => {
    const s = new Set()
    myAcks.forEach(a => { if (a.version === currentVersion.get(a.policy_id)) s.add(a.policy_id) })
    return s
  }, [myAcks, currentVersion])

  const acknowledge = useCallback(async (policy) => {
    if (!person.id) { toast('Sign in to acknowledge policies', 'error'); return false }
    try {
      const res = await callRpc('policies_acknowledge', {
        p_policy_id: policy.id, p_person_id: person.id, p_person_name: person.full_name || null,
        p_version: policy.version, p_node_id: (locationIds && locationIds[0]) || null,
      })
      if (res && res.ok === false) throw new Error(res.error)
      await load()
      return true
    } catch { return false }
  }, [person.id, person.full_name, locationIds, load, toast])

  const published = useMemo(() => policies.filter(p => p.status === 'published'), [policies])
  const required = useMemo(() => published.filter(p => p.ack_required), [published])

  // KPIs
  const totalPolicies = published.length
  const myPending = required.filter(p => !mySignedIds.has(p.id)).length
  const myCompletion = required.length > 0 ? Math.round(((required.length - myPending) / required.length) * 100) : 100
  const teamCompletion = useMemo(() => {
    const reqIds = new Set(required.map(p => p.id))
    const rows = sigSummary.filter(s => reqIds.has(s.policy_id) && (s.headcount || 0) > 0)
    if (rows.length === 0) return 0
    const pcts = rows.map(s => (s.signed_count || 0) / s.headcount)
    return Math.round((pcts.reduce((a, b) => a + b, 0) / pcts.length) * 100)
  }, [sigSummary, required])
  const nowD = new Date()
  const updatedThisMonth = published.filter(p => {
    if (!p.updated_at) return false
    const d = new Date(p.updated_at)
    return d.getFullYear() === nowD.getFullYear() && d.getMonth() === nowD.getMonth()
  }).length
  const overdueAcks = required.filter(p => {
    if (mySignedIds.has(p.id)) return false
    return p.effective_date && new Date(p.effective_date) < nowD
  }).length
  const monthLabel = nowD.toLocaleString('en-US', { month: 'long', year: 'numeric' })

  const TABS = [
    'Policy Library', 'My Acknowledgments',
    ...(isHR ? ['Team Compliance'] : []),
    ...(showVersioning ? ['Version History'] : []),
    ...(showQuiz ? ['Quizzes'] : []),
    ...(isHR ? ['EDIT POLICIES'] : []),
    ...(isHR ? ['SCHEDULED'] : []),
  ]
  const TAB_TEAM = isHR ? 2 : -1
  const TAB_VERSION = showVersioning ? (isHR ? 3 : 2) : -1
  const TAB_QUIZ = showQuiz ? (isHR ? (showVersioning ? 4 : 3) : (showVersioning ? 3 : 2)) : -1
  const baseOffset = 2 + (isHR ? 1 : 0) + (showVersioning ? 1 : 0) + (showQuiz ? 1 : 0)
  const TAB_EDIT = isHR ? baseOffset : -1
  const TAB_SCHEDULED = isHR ? baseOffset + 1 : -1

  return (
    <div style={{ background: 'var(--t-bg)', minHeight: '100dvh', padding: 20 }}>
      <ToastContainer toasts={toasts} />

      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--t-text)', marginBottom: 4 }}>Company Policies</div>
        <div style={{ fontSize: 13, color: 'var(--t-text-muted)' }}>Policy library · acknowledgment tracking · team compliance{showVersioning ? ' · version control' : ''}{showQuiz ? ' · knowledge quizzes' : ''}</div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(155px,1fr))', gap: 12, marginBottom: 20 }}>
        <KTile label="Total Policies" value={totalPolicies} sub={`${required.length} require ack`} />
        <KTile label="My Pending" value={myPending} sub="Needs acknowledgment" alert={myPending > 0 ? 'red' : undefined} color={myPending > 0 ? 'var(--t-danger)' : 'var(--t-success)'} />
        <KTile label="My Completion" value={`${myCompletion}%`} sub="Required policies" color={myCompletion === 100 ? 'var(--t-success)' : myCompletion < 60 ? 'var(--t-danger)' : 'var(--t-warn)'} />
        <KTile label="Team Completion" value={isHR ? `${teamCompletion}%` : '--'} sub={isHR ? 'All employees' : 'HR access only'} color={isHR ? (teamCompletion >= 90 ? 'var(--t-success)' : 'var(--t-warn)') : 'var(--t-text-muted)'} />
        <KTile label="Updated This Month" value={updatedThisMonth} sub={monthLabel} color="var(--t-accent)" />
        <KTile label="Overdue Acks" value={overdueAcks} sub="Past effective date" alert={overdueAcks > 0 ? 'red' : undefined} color={overdueAcks > 0 ? 'var(--t-danger)' : 'var(--t-success)'} />
      </div>

      <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--t-line)', marginBottom: 20, flexWrap: 'wrap' }}>
        {TABS.map((t, i) => (
          <button key={t} onClick={() => setTab(i)}
            style={{ background: 'transparent', border: 'none', borderBottom: tab === i ? '2px solid var(--t-accent)' : '2px solid transparent', padding: '10px 20px', fontSize: 13, fontWeight: tab === i ? 700 : 400, color: tab === i ? 'var(--t-accent)' : 'var(--t-text-muted)', cursor: 'pointer', marginBottom: -1, transition: 'color 0.15s, border-color 0.15s' }}>
            {t}
          </button>
        ))}
      </div>

      {loading ? (
        <StateBlock>Loading policies…</StateBlock>
      ) : err ? (
        <StateBlock tone="error">{err}</StateBlock>
      ) : (
        <>
          {tab === 0 && (
            <PolicyLibrary policies={policies} mySignedIds={mySignedIds} onAcknowledge={acknowledge} showVersions={showVersioning} sigSummary={sigSummary} session={session} toast={toast} />
          )}
          {tab === 1 && (
            <MyAcknowledgments policies={policies} myAcks={myAcks} mySignedIds={mySignedIds} onAcknowledge={acknowledge} toast={toast} />
          )}
          {tab === TAB_TEAM && isHR && <TeamCompliance session={session} locationIds={locationIds} />}
          {tab === TAB_TEAM && !isHR && (
            <div style={{ ...S.card, textAlign: 'center', padding: 48 }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>🔒</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--t-text)', marginBottom: 8 }}>Access Restricted</div>
              <div style={{ fontSize: 13, color: 'var(--t-text-muted)' }}>Team compliance data is available to HR, Managers, COO, and Admin roles only.</div>
            </div>
          )}
          {showVersioning && tab === TAB_VERSION && (
            <VersionHistoryTab policies={policies} sigSummary={sigSummary} session={session} onReload={load} toast={toast} />
          )}
          {showQuiz && tab === TAB_QUIZ && (
            <QuizzesTab isHR={isHR} policies={policies} session={session} toast={toast} />
          )}
          {isHR && tab === TAB_EDIT && (
            <EditPoliciesTab policies={policies} session={session} onReload={load} toast={toast} />
          )}
          {isHR && tab === TAB_SCHEDULED && (
            <ScheduledTab policies={policies} session={session} onReload={load} toast={toast} />
          )}
        </>
      )}
    </div>
  )
}
