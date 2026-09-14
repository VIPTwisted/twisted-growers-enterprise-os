import React, { useState, useCallback, useMemo, useEffect } from 'react'
import { useFeatureFlag } from '../lib/featureFlags.js'
import { useAuth } from '../lib/auth.jsx'
import { useScope } from '../lib/scope.jsx'

import { sb, getSession } from '../lib/supabase'
import { locColor, locBorder } from '../lib/locations.js'


// ─── Date / time utilities ──────────────────────────────────────────────────
const _today  = new Date()
const fmtIso  = (d) => d.toISOString().slice(0, 10)
const TODAY   = fmtIso(_today)

const fmtDate = (str) => {
  if (!str) return '—'
  const d = new Date(String(str).slice(0, 10) + 'T00:00:00')
  if (Number.isNaN(d.getTime())) return String(str)
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

const fmtTime = (t) => {
  if (!t) return ''
  const [h, m] = String(t).split(':').map(Number)
  if (Number.isNaN(h)) return ''
  const ap = h >= 12 ? 'PM' : 'AM'
  const hr = h % 12 === 0 ? 12 : h % 12
  return `${hr}:${String(m || 0).padStart(2, '0')} ${ap}`
}

const timeRange = (s, e) => {
  if (!s && !e) return '—'
  return `${fmtTime(s)}${e ? '–' + fmtTime(e) : ''}`
}

const hoursUntil = (dateStr) => {
  if (!dateStr) return Infinity
  const d = new Date(String(dateStr).slice(0, 10) + 'T00:00:00')
  return (d - _today) / 3600000
}

// ─── Cosmetic per-location accents (fallbacks handle any real name) ──────────
const LOC_COLORS = new Proxy({}, { get: (_, name) => (typeof name === 'string' ? locColor(name) : undefined) })
const LOC_BORDER = new Proxy({}, { get: (_, name) => (typeof name === 'string' ? locBorder(name) : undefined) })

// ─── Feature Disabled ────────────────────────────────────────────────────────
function FeatureDisabledMsg() {
  return (
    <div style={{ ...S.page }}>
      <div style={S.pageHeader}>
        <div style={S.pageTitle}>SHIFT MARKETPLACE</div>
        <div style={S.pageSub}>Cross-location open shifts — claim to cover or request coverage</div>
      </div>
      <div style={{ padding: '40px 24px', textAlign: 'center', color: 'var(--t-text-faint)', fontSize: 13 }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>—</div>
        <div style={{ fontWeight: 700, color: 'var(--t-text-muted)', marginBottom: 8 }}>Shift Marketplace is not enabled</div>
        <div>Contact your administrator to enable this feature.</div>
      </div>
    </div>
  )
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const S = {
  page:       { padding: '0 0 48px 0', minHeight: '100vh', background: 'var(--t-bg, #070b14)' },
  pageHeader: { padding: '20px 24px 16px', borderBottom: '1px solid var(--t-line)' },
  pageTitle:  { fontSize: 20, fontWeight: 800, color: 'var(--t-text)', margin: 0, letterSpacing: '-0.3px' },
  pageSub:    { fontSize: 12, color: 'var(--t-text-muted)', marginTop: 4 },
  body:       { padding: '20px 24px' },

  kpiGrid:  (cols) => ({ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 12, marginBottom: 20 }),
  kpiTile:  (variant) => ({
    background: variant === 'danger'  ? 'rgba(255,77,125,0.07)'
              : variant === 'success' ? 'rgba(42,214,160,0.05)'
              : variant === 'warn'    ? 'rgba(255,179,71,0.06)'
              : 'var(--t-surface)',
    border: `1px solid ${
      variant === 'danger'  ? 'rgba(255,77,125,0.25)'
    : variant === 'success' ? 'rgba(42,214,160,0.18)'
    : variant === 'warn'    ? 'rgba(255,179,71,0.22)'
    : 'var(--t-line)'}`,
    padding: '14px 16px',
  }),
  kpiLabel: { fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--t-text-muted)', marginBottom: 6 },
  kpiValue: (color) => ({ fontSize: 26, fontWeight: 800, lineHeight: 1, color: color || 'var(--t-text)' }),
  kpiSub:   { fontSize: 11, color: 'var(--t-text-faint)', marginTop: 4 },

  sectionLabel: { fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--t-text-muted)', marginBottom: 10 },

  tabBar: { display: 'flex', gap: 0, borderBottom: '1px solid var(--t-line)', marginBottom: 20 },
  tab:    (active) => ({ padding: '10px 18px', fontSize: 12, fontWeight: 700, cursor: 'pointer', border: 'none', background: 'none', color: active ? 'var(--t-accent)' : 'var(--t-text-muted)', borderBottom: active ? '2px solid var(--t-accent)' : '2px solid transparent', letterSpacing: '0.04em', marginBottom: -1 }),

  card:      { background: 'var(--t-surface)', border: '1px solid var(--t-line)', marginBottom: 12 },
  cardHead:  { padding: '12px 16px', borderBottom: '1px solid var(--t-line)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' },
  cardTitle: { fontSize: 12, fontWeight: 800, color: 'var(--t-text)', letterSpacing: '0.04em', textTransform: 'uppercase' },
  cardBody:  { padding: 16 },

  th:  { padding: '10px 14px', textAlign: 'left', fontWeight: 700, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--t-text-muted)', borderBottom: '2px solid var(--t-line)', background: 'var(--t-surface)', whiteSpace: 'nowrap' },
  td:  { padding: '10px 14px', borderBottom: '1px solid var(--t-line)', color: 'var(--t-text)', verticalAlign: 'middle' },

  input:      { padding: '8px 10px', fontSize: 12, border: '1px solid var(--t-line)', background: 'var(--t-surface-2)', color: 'var(--t-text)', borderRadius: 0, outline: 'none' },
  btn:        { padding: '8px 16px', fontSize: 12, fontWeight: 700, border: '1px solid var(--t-line)', background: 'var(--t-surface-2)', color: 'var(--t-text)', cursor: 'pointer', letterSpacing: '0.03em', borderRadius: 0 },
  btnSm:      { padding: '6px 12px', fontSize: 11, fontWeight: 700, border: '1px solid var(--t-line)', background: 'var(--t-surface-2)', color: 'var(--t-text)', cursor: 'pointer', letterSpacing: '0.03em', borderRadius: 0 },
  btnAccent:  { background: 'var(--t-accent)', color: '#000', border: '1px solid var(--t-accent)' },
  btnSuccess: { background: 'rgba(42,214,160,0.15)', color: '#2ad6a0', border: '1px solid rgba(42,214,160,0.28)' },
  btnDanger:  { background: 'rgba(255,77,125,0.14)', color: '#ff4d7d', border: '1px solid rgba(255,77,125,0.28)' },
  btnDisabled:{ background: 'rgba(42,214,160,0.08)', color: 'rgba(42,214,160,0.35)', border: '1px solid rgba(42,214,160,0.12)', cursor: 'default' },

  badge:      (variant) => ({
    display: 'inline-block',
    padding: '2px 8px',
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: '0.07em',
    textTransform: 'uppercase',
    borderRadius: 0,
    background: variant === 'urgent'   ? 'rgba(255,77,125,0.15)'
              : variant === 'approved' ? 'rgba(42,214,160,0.15)'
              : variant === 'pending'  ? 'rgba(255,179,71,0.12)'
              : variant === 'denied'   ? 'rgba(255,77,125,0.12)'
              : 'rgba(120,120,160,0.12)',
    color: variant === 'urgent'   ? '#ff4d7d'
         : variant === 'approved' ? '#2ad6a0'
         : variant === 'pending'  ? 'var(--t-accent)'
         : variant === 'denied'   ? '#ff4d7d'
         : 'var(--t-text-muted)',
    border: `1px solid ${
      variant === 'urgent'   ? 'rgba(255,77,125,0.3)'
    : variant === 'approved' ? 'rgba(42,214,160,0.28)'
    : variant === 'pending'  ? 'rgba(255,179,71,0.25)'
    : variant === 'denied'   ? 'rgba(255,77,125,0.28)'
    : 'rgba(120,120,160,0.2)'}`,
  }),

  emptyState: { padding: '32px 0', textAlign: 'center', color: 'var(--t-text-faint)', fontSize: 12 },
  spinner:    { display: 'inline-block', width: 14, height: 14, border: '2px solid var(--t-line)', borderTopColor: 'var(--t-accent)', borderRadius: '50%', animation: 'sm-spin 0.7s linear infinite' },
}

// ─── Sub-components ───────────────────────────────────────────────────────────
function StatusBadge({ status }) {
  const v = String(status || '').toLowerCase()
  const variant = v === 'approved' || v === 'filled' ? 'approved'
                : v === 'pending' || v === 'open'     ? 'pending'
                : v === 'denied'  || v === 'declined' ? 'denied' : 'neutral'
  return <span style={S.badge(variant)}>{status || '—'}</span>
}

function LocBadge({ loc }) {
  const name   = loc || '—'
  const color  = LOC_COLORS[name] || 'var(--t-text-muted)'
  const border = LOC_BORDER[name] || 'rgba(120,120,160,0.3)'
  return (
    <span style={{ fontSize: 11, fontWeight: 700, color, border: `1px solid ${border}`, padding: '2px 8px', borderRadius: 0, background: `${color}10` }}>
      {name}
    </span>
  )
}

function Spinner() {
  return (
    <>
      <style>{`@keyframes sm-spin { to { transform:rotate(360deg) } }`}</style>
      <span style={S.spinner} />
    </>
  )
}

// ─── Main Component ────────────────────────────────────────────────────────────
export default function ShiftMarketplace() {
  const enabled     = useFeatureFlag('shiftMarketplace')
  const { session } = useAuth()
  const { locationIds, locations } = useScope()

  const fallback  = getSession()
  const personId  = session?.person?.id || fallback.id || null
  const roleName  = session?.person?.role_name || ''
  const isManager = /manager|admin|owner|coo|ceo|supervisor|president|chief/i.test(roleName)

  // Node scope: prefer the live scope selector, fall back to the session's nodes.
  const nodeIds = useMemo(() => {
    if (locationIds?.length) return locationIds
    return (fallback.nodes || []).map((n) => n.id)
  }, [locationIds, fallback.nodes])

  // Real location options for filtering / posting (from the session, never faked).
  const locOptions = useMemo(() => {
    const map = new Map()
    ;(locations || []).forEach((l) => { if (l?.name) map.set(l.name, l.id) })
    ;(fallback.nodes || []).forEach((n) => {
      if (n?.node_type === 'location' && n?.name) map.set(n.name, n.id)
    })
    return [...map.entries()].map(([name, id]) => ({ name, id })).sort((a, b) => a.name.localeCompare(b.name))
  }, [locations, fallback.nodes])

  // ── State ──────────────────────────────────────────────────────────────────
  const [tab, setTab]           = useState('open')     // open | mine | posted | approvals
  const [board, setBoard]       = useState([])         // get_swap_board rows
  const [myPosted, setMyPosted] = useState([])         // get_my_posted_shifts rows
  const [pendingSwaps, setSwaps]= useState([])         // get_pending_requests().shift_swaps
  const [loading, setLoading]   = useState(true)
  const [loadErr, setLoadErr]   = useState(null)
  const [busy, setBusyState]    = useState({})
  const [filterLoc, setFilterLoc] = useState('All')
  const [toast, setToast]       = useState(null)
  const [postForm, setPostForm] = useState({ node_id: '', date: '', start: '', end: '', note: '' })
  const [posting, setPosting]   = useState(false)

  const setBusy = useCallback((k, v) => setBusyState((p) => ({ ...p, [k]: v })), [])
  const showToast = useCallback((msg, type = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }, [])

  // ── Load everything real ─────────────────────────────────────────────────────
  const refresh = useCallback(async () => {
    setLoading(true)
    setLoadErr(null)
    const ids = nodeIds.length ? nodeIds : null
    const [sw, mp, pr] = await Promise.all([
      sb.rpc('get_swap_board', { p_node_ids: ids, p_date_from: TODAY }),
      personId ? sb.rpc('get_my_posted_shifts', { p_person_id: personId }) : Promise.resolve({ data: [] }),
      isManager ? sb.rpc('get_pending_requests', { p_node_ids: ids }) : Promise.resolve({ data: null }),
    ])
    if (sw.error) setLoadErr(sw.error.message || 'Failed to load the shift board')
    setBoard(sw.error ? [] : (Array.isArray(sw.data) ? sw.data : []))
    // get_my_posted_shifts ships in this feature's migration; tolerate absence.
    setMyPosted(mp.error ? [] : (Array.isArray(mp.data) ? mp.data : []))
    setSwaps(pr?.data && Array.isArray(pr.data.shift_swaps) ? pr.data.shift_swaps : [])
    setLoading(false)
  }, [nodeIds, personId, isManager])

  useEffect(() => { refresh() }, [refresh])

  // ── Derived, all from live rows ──────────────────────────────────────────────
  const myPostedIds = useMemo(() => new Set(myPosted.map((p) => p.id)), [myPosted])

  // Open postings I can still claim (not mine, not already volunteered by me).
  const openList = useMemo(() => board.filter((post) => {
    if (String(post.status || '').toLowerCase() !== 'open') return false
    if (myPostedIds.has(post.id)) return false
    const iVol = (post.volunteers || []).some((v) => v.person_id === personId)
    return !iVol
  }).map((p) => ({ ...p, urgent: hoursUntil(p.shift_date) < 24 })), [board, myPostedIds, personId])

  const filteredOpen = useMemo(() =>
    filterLoc === 'All' ? openList : openList.filter((s) => s.node === filterLoc),
    [openList, filterLoc]
  )

  // My claims across the whole board (pending + approved volunteers that are me).
  const myClaims = useMemo(() => {
    const out = []
    board.forEach((post) => (post.volunteers || []).forEach((v) => {
      if (v.person_id === personId) {
        out.push({
          id:     v.claim_id,
          date:   post.shift_date,
          node:   post.node,
          start:  post.start_time,
          end:    post.end_time,
          status: v.status || 'Pending',
        })
      }
    }))
    return out
  }, [board, personId])

  // Manager view — every pending volunteer claim on the board.
  const pendingClaims = useMemo(() => {
    const out = []
    board.forEach((post) => (post.volunteers || []).forEach((v) => {
      if (String(v.status || 'pending').toLowerCase() === 'pending') {
        out.push({
          claim_id: v.claim_id,
          employee: v.name || 'Employee',
          date:     post.shift_date,
          node:     post.node,
          start:    post.start_time,
          end:      post.end_time,
        })
      }
    }))
    return out
  }, [board])

  const kpis = useMemo(() => ({
    totalOpen:    openList.length,
    urgentCount:  openList.filter((s) => s.urgent).length,
    myClaims:     myClaims.filter((c) => String(c.status).toLowerCase() === 'pending').length,
    pendingCount: pendingClaims.length + pendingSwaps.length,
  }), [openList, myClaims, pendingClaims, pendingSwaps])

  // ── Actions — every one is a REAL write, then a server refresh ───────────────
  const handleClaim = useCallback(async (post) => {
    if (!personId) { showToast('Sign in to claim a shift', 'error'); return }
    if (busy[post.id]) return
    setBusy(post.id, true)
    const { error } = await sb.rpc('volunteer_open_shift', {
      p_shift_id: post.id, p_person_id: personId, p_note: null,
    })
    setBusy(post.id, false)
    if (error) showToast(`Not saved — ${error.message}`, 'error')
    else { showToast('Shift claimed — pending manager approval'); refresh() }
  }, [personId, busy, setBusy, showToast, refresh])

  const handleReviewClaim = useCallback(async (claim, action) => {
    const key = `${claim.claim_id}-${action}`
    if (busy[key]) return
    setBusy(key, true)
    const { data, error } = await sb.rpc('review_shift_claim', {
      p_claim_id: claim.claim_id, p_action: action, p_reviewer_id: personId,
    })
    setBusy(key, false)
    if (error || data?.ok === false) showToast(`Not saved — ${error?.message || data?.error || 'review failed'}`, 'error')
    else { showToast(`Claim ${action === 'approve' ? 'approved' : 'denied'}`); refresh() }
  }, [busy, setBusy, personId, showToast, refresh])

  const handleReviewSwap = useCallback(async (swap, action) => {
    const key = `swap-${swap.id}-${action}`
    if (busy[key]) return
    setBusy(key, true)
    const { data, error } = await sb.rpc('review_swap', {
      p_request_id: swap.id, p_action: action,
    })
    setBusy(key, false)
    if (error || data?.ok === false) showToast(`Not saved — ${error?.message || data?.error || 'review failed'}`, 'error')
    else { showToast(`Swap ${action === 'approve' ? 'approved' : 'denied'}`); refresh() }
  }, [busy, setBusy, showToast, refresh])

  const handlePost = useCallback(async () => {
    if (!personId) { showToast('Sign in to post a shift', 'error'); return }
    if (!postForm.node_id || !postForm.date) { showToast('Location and date are required', 'error'); return }
    setPosting(true)
    const { error } = await sb.rpc('post_marketplace_shift', {
      p_person_id: personId,
      p_node_id:   postForm.node_id,
      p_date:      postForm.date,
      p_start:     postForm.start || null,
      p_end:       postForm.end || null,
      p_note:      postForm.note || null,
    })
    setPosting(false)
    if (error) showToast(`Not posted — ${error.message}`, 'error')
    else {
      showToast('Shift posted for coverage')
      setPostForm({ node_id: '', date: '', start: '', end: '', note: '' })
      refresh()
    }
  }, [personId, postForm, showToast, refresh])

  // ── Guards ───────────────────────────────────────────────────────────────────
  if (enabled === false) return <FeatureDisabledMsg />

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={S.page}>
      <style>{`@keyframes sm-spin { to { transform:rotate(360deg) } }`}</style>

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', top: 16, right: 16, zIndex: 9999,
          background: toast.type === 'error' ? 'rgba(255,77,125,0.95)' : 'rgba(42,214,160,0.95)',
          color: '#000', padding: '10px 18px', fontSize: 12, fontWeight: 700,
          borderRadius: 0, boxShadow: '0 4px 24px rgba(0,0,0,0.4)',
        }}>
          {toast.msg}
        </div>
      )}

      {/* Page Header */}
      <div style={S.pageHeader}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <div>
            <div style={S.pageTitle}>SHIFT MARKETPLACE</div>
            <div style={S.pageSub}>Cross-location open shifts — claim to cover or request coverage</div>
          </div>
          <button style={{ ...S.btn, ...S.btnSm }} onClick={refresh} disabled={loading}>
            {loading ? <Spinner /> : 'Refresh'}
          </button>
        </div>
      </div>

      <div style={S.body}>

        {loadErr && (
          <div style={{ ...S.card, borderColor: 'rgba(255,77,125,0.3)', background: 'rgba(255,77,125,0.06)', padding: '10px 14px', fontSize: 12, color: '#ff4d7d' }}>
            {loadErr}
          </div>
        )}

        {/* KPI Row */}
        <div style={S.kpiGrid(isManager ? 4 : 3)}>
          <div style={S.kpiTile('warn')}>
            <div style={S.kpiLabel}>Open Shifts</div>
            <div style={S.kpiValue('var(--t-accent)')}>{loading ? '—' : kpis.totalOpen}</div>
            <div style={S.kpiSub}>available to claim</div>
          </div>
          <div style={S.kpiTile('danger')}>
            <div style={S.kpiLabel}>Urgent</div>
            <div style={S.kpiValue('#ff4d7d')}>{loading ? '—' : kpis.urgentCount}</div>
            <div style={S.kpiSub}>within 24 hours</div>
          </div>
          <div style={S.kpiTile()}>
            <div style={S.kpiLabel}>My Claims</div>
            <div style={S.kpiValue()}>{loading ? '—' : kpis.myClaims}</div>
            <div style={S.kpiSub}>awaiting approval</div>
          </div>
          {isManager && (
            <div style={S.kpiTile('success')}>
              <div style={S.kpiLabel}>Pending Approvals</div>
              <div style={S.kpiValue('#2ad6a0')}>{loading ? '—' : kpis.pendingCount}</div>
              <div style={S.kpiSub}>needs review</div>
            </div>
          )}
        </div>

        {/* Tab Bar */}
        <div style={S.tabBar}>
          <button style={S.tab(tab === 'open')}   onClick={() => setTab('open')}>Open Shifts</button>
          <button style={S.tab(tab === 'mine')}   onClick={() => setTab('mine')}>My Claims</button>
          <button style={S.tab(tab === 'posted')} onClick={() => setTab('posted')}>Posted by Me</button>
          {isManager && (
            <button style={S.tab(tab === 'approvals')} onClick={() => setTab('approvals')}>
              Pending Approvals
              {kpis.pendingCount > 0 && (
                <span style={{ marginLeft: 6, ...S.badge('urgent'), fontSize: 9 }}>{kpis.pendingCount}</span>
              )}
            </button>
          )}
        </div>

        {/* ── Tab: Open Shifts ─────────────────────────────────────────────── */}
        {tab === 'open' && (
          <div>
            {locOptions.length > 0 && (
              <div style={{ display: 'flex', gap: 8, marginBottom: 16, alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={S.sectionLabel}>Filter by Location:</div>
                {['All', ...locOptions.map((l) => l.name)].map((loc) => (
                  <button
                    key={loc}
                    style={{ ...S.btnSm, ...(filterLoc === loc ? S.btnAccent : {}), fontSize: 10 }}
                    onClick={() => setFilterLoc(loc)}
                  >
                    {loc}
                  </button>
                ))}
              </div>
            )}

            {loading ? (
              <div style={S.emptyState}><Spinner /> <span style={{ marginLeft: 8 }}>Loading shifts…</span></div>
            ) : filteredOpen.length === 0 ? (
              <div style={S.emptyState}>No open shifts {filterLoc !== 'All' ? `at ${filterLoc}` : 'available right now'}</div>
            ) : (
              <div style={S.card}>
                <div style={S.cardHead}>
                  <span style={S.cardTitle}>Available Shifts</span>
                  <span style={{ fontSize: 11, color: 'var(--t-text-muted)' }}>{filteredOpen.length} shift{filteredOpen.length !== 1 ? 's' : ''}</span>
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        <th style={S.th}>Date</th>
                        <th style={S.th}>Location</th>
                        <th style={S.th}>Time</th>
                        <th style={S.th}>Note</th>
                        <th style={S.th}>Status</th>
                        <th style={S.th}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredOpen.map((shift) => (
                        <tr key={shift.id} style={{ background: shift.urgent ? 'rgba(255,77,125,0.03)' : 'transparent' }}>
                          <td style={S.td}>
                            <div style={{ fontWeight: 700, fontSize: 12 }}>{fmtDate(shift.shift_date)}</div>
                            {shift.urgent && <span style={S.badge('urgent')}>URGENT</span>}
                          </td>
                          <td style={S.td}><LocBadge loc={shift.node} /></td>
                          <td style={S.td}><span style={{ fontSize: 12, color: 'var(--t-text-muted)' }}>{timeRange(shift.start_time, shift.end_time)}</span></td>
                          <td style={S.td}><span style={{ fontSize: 12, color: 'var(--t-text-faint)' }}>{shift.note || '—'}</span></td>
                          <td style={S.td}><StatusBadge status={shift.status || 'Open'} /></td>
                          <td style={{ ...S.td, textAlign: 'right' }}>
                            <button
                              style={{ ...S.btnSm, ...(busy[shift.id] ? S.btnDisabled : S.btnAccent) }}
                              disabled={!!busy[shift.id]}
                              onClick={() => handleClaim(shift)}
                            >
                              {busy[shift.id] ? <Spinner /> : 'Claim'}
                            </button>
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

        {/* ── Tab: My Claims ────────────────────────────────────────────────── */}
        {tab === 'mine' && (
          <div style={S.card}>
            <div style={S.cardHead}>
              <span style={S.cardTitle}>My Claimed Shifts</span>
            </div>
            {loading ? (
              <div style={{ ...S.cardBody, ...S.emptyState }}><Spinner /></div>
            ) : myClaims.length === 0 ? (
              <div style={{ ...S.cardBody, ...S.emptyState }}>You have not claimed any shifts</div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={S.th}>Date</th>
                      <th style={S.th}>Location</th>
                      <th style={S.th}>Time</th>
                      <th style={S.th}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {myClaims.map((c) => (
                      <tr key={c.id}>
                        <td style={S.td}><span style={{ fontWeight: 700, fontSize: 12 }}>{fmtDate(c.date)}</span></td>
                        <td style={S.td}><LocBadge loc={c.node} /></td>
                        <td style={S.td}><span style={{ fontSize: 12, color: 'var(--t-text-muted)' }}>{timeRange(c.start, c.end)}</span></td>
                        <td style={S.td}><StatusBadge status={c.status} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── Tab: Posted by Me ─────────────────────────────────────────────── */}
        {tab === 'posted' && (
          <div>
            {/* Post a shift for coverage — real write */}
            <div style={S.card}>
              <div style={S.cardHead}>
                <span style={S.cardTitle}>Post a Shift for Coverage</span>
              </div>
              <div style={{ ...S.cardBody, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <div>
                  <div style={S.kpiLabel}>Location</div>
                  <select
                    style={{ ...S.input, minWidth: 160 }}
                    value={postForm.node_id}
                    onChange={(e) => setPostForm((f) => ({ ...f, node_id: e.target.value }))}
                  >
                    <option value="">Select…</option>
                    {locOptions.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </select>
                </div>
                <div>
                  <div style={S.kpiLabel}>Date</div>
                  <input type="date" style={S.input} value={postForm.date} min={TODAY}
                    onChange={(e) => setPostForm((f) => ({ ...f, date: e.target.value }))} />
                </div>
                <div>
                  <div style={S.kpiLabel}>Start</div>
                  <input type="time" style={S.input} value={postForm.start}
                    onChange={(e) => setPostForm((f) => ({ ...f, start: e.target.value }))} />
                </div>
                <div>
                  <div style={S.kpiLabel}>End</div>
                  <input type="time" style={S.input} value={postForm.end}
                    onChange={(e) => setPostForm((f) => ({ ...f, end: e.target.value }))} />
                </div>
                <div style={{ flex: 1, minWidth: 160 }}>
                  <div style={S.kpiLabel}>Note</div>
                  <input type="text" style={{ ...S.input, width: '100%' }} placeholder="Reason / details (optional)" value={postForm.note}
                    onChange={(e) => setPostForm((f) => ({ ...f, note: e.target.value }))} />
                </div>
                <button
                  style={{ ...S.btn, ...(posting ? S.btnDisabled : S.btnAccent) }}
                  disabled={posting}
                  onClick={handlePost}
                >
                  {posting ? <Spinner /> : 'Post Shift'}
                </button>
              </div>
            </div>

            {/* Shifts I posted */}
            <div style={S.card}>
              <div style={S.cardHead}>
                <span style={S.cardTitle}>Shifts I Posted</span>
                {!loading && <span style={{ fontSize: 11, color: 'var(--t-text-muted)' }}>{myPosted.length} open</span>}
              </div>
              {loading ? (
                <div style={{ ...S.cardBody, ...S.emptyState }}><Spinner /></div>
              ) : myPosted.length === 0 ? (
                <div style={{ ...S.cardBody, ...S.emptyState }}>You have not posted any open shifts</div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        <th style={S.th}>Date</th>
                        <th style={S.th}>Location</th>
                        <th style={S.th}>Time</th>
                        <th style={S.th}>Applicants</th>
                        <th style={S.th}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {myPosted.map((p) => (
                        <tr key={p.id}>
                          <td style={S.td}><span style={{ fontWeight: 700, fontSize: 12 }}>{fmtDate(p.shift_date)}</span></td>
                          <td style={S.td}><LocBadge loc={p.node} /></td>
                          <td style={S.td}><span style={{ fontSize: 12, color: 'var(--t-text-muted)' }}>{timeRange(p.start_time, p.end_time)}</span></td>
                          <td style={S.td}>
                            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--t-accent)' }}>{p.claim_count ?? (p.volunteers || []).length}</span>
                            <span style={{ fontSize: 11, color: 'var(--t-text-muted)', marginLeft: 4 }}>applicant{(p.claim_count ?? (p.volunteers || []).length) !== 1 ? 's' : ''}</span>
                          </td>
                          <td style={S.td}><StatusBadge status={p.status} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Tab: Pending Approvals (manager only) ─────────────────────────── */}
        {tab === 'approvals' && isManager && (
          <div>
            {/* Shift Claim Requests */}
            <div style={S.card}>
              <div style={S.cardHead}>
                <span style={S.cardTitle}>Shift Claim Requests</span>
                <span style={{ fontSize: 11, color: 'var(--t-text-muted)' }}>{pendingClaims.length} pending</span>
              </div>
              {loading ? (
                <div style={{ ...S.cardBody, ...S.emptyState }}><Spinner /></div>
              ) : pendingClaims.length === 0 ? (
                <div style={{ ...S.cardBody, ...S.emptyState }}>No pending claim approvals</div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        <th style={S.th}>Employee</th>
                        <th style={S.th}>Date</th>
                        <th style={S.th}>Location</th>
                        <th style={S.th}>Time</th>
                        <th style={S.th}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pendingClaims.map((a) => (
                        <tr key={a.claim_id}>
                          <td style={S.td}><span style={{ fontWeight: 700, fontSize: 12 }}>{a.employee}</span></td>
                          <td style={S.td}><span style={{ fontSize: 12 }}>{fmtDate(a.date)}</span></td>
                          <td style={S.td}><LocBadge loc={a.node} /></td>
                          <td style={S.td}><span style={{ fontSize: 12, color: 'var(--t-text-muted)' }}>{timeRange(a.start, a.end)}</span></td>
                          <td style={{ ...S.td, whiteSpace: 'nowrap' }}>
                            <div style={{ display: 'flex', gap: 6 }}>
                              <button
                                style={{ ...S.btnSm, ...(busy[`${a.claim_id}-approve`] ? S.btnDisabled : S.btnSuccess) }}
                                disabled={!!busy[`${a.claim_id}-approve`]}
                                onClick={() => handleReviewClaim(a, 'approve')}
                              >
                                {busy[`${a.claim_id}-approve`] ? <Spinner /> : 'Approve'}
                              </button>
                              <button
                                style={{ ...S.btnSm, ...(busy[`${a.claim_id}-deny`] ? S.btnDisabled : S.btnDanger) }}
                                disabled={!!busy[`${a.claim_id}-deny`]}
                                onClick={() => handleReviewClaim(a, 'deny')}
                              >
                                {busy[`${a.claim_id}-deny`] ? <Spinner /> : 'Deny'}
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Swap Requests */}
            <div style={S.card}>
              <div style={S.cardHead}>
                <span style={S.cardTitle}>Swap Requests</span>
                <span style={{ fontSize: 11, color: 'var(--t-text-muted)' }}>{pendingSwaps.length} pending</span>
              </div>
              {loading ? (
                <div style={{ ...S.cardBody, ...S.emptyState }}><Spinner /></div>
              ) : pendingSwaps.length === 0 ? (
                <div style={{ ...S.cardBody, ...S.emptyState }}>No pending swap requests</div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        <th style={S.th}>Employee</th>
                        <th style={S.th}>Date</th>
                        <th style={S.th}>Location</th>
                        <th style={S.th}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pendingSwaps.map((r) => (
                        <tr key={r.id}>
                          <td style={S.td}><span style={{ fontWeight: 700, fontSize: 12 }}>{r.person_name || r.requester_name || r.full_name || 'Employee'}</span></td>
                          <td style={S.td}><span style={{ fontSize: 12 }}>{fmtDate(r.shift_date || r.date)}</span></td>
                          <td style={S.td}><LocBadge loc={r.node_name || r.node} /></td>
                          <td style={{ ...S.td, whiteSpace: 'nowrap' }}>
                            <div style={{ display: 'flex', gap: 6 }}>
                              <button
                                style={{ ...S.btnSm, ...(busy[`swap-${r.id}-approve`] ? S.btnDisabled : S.btnSuccess) }}
                                disabled={!!busy[`swap-${r.id}-approve`]}
                                onClick={() => handleReviewSwap(r, 'approve')}
                              >
                                {busy[`swap-${r.id}-approve`] ? <Spinner /> : 'Approve'}
                              </button>
                              <button
                                style={{ ...S.btnSm, ...(busy[`swap-${r.id}-deny`] ? S.btnDisabled : S.btnDanger) }}
                                disabled={!!busy[`swap-${r.id}-deny`]}
                                onClick={() => handleReviewSwap(r, 'deny')}
                              >
                                {busy[`swap-${r.id}-deny`] ? <Spinner /> : 'Deny'}
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
