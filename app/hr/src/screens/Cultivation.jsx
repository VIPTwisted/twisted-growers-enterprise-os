import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { sb, getSession } from '../lib/supabase'

/* ── CONSTANTS (presentation + business option lists, not data) ── */

const PREF_OPTIONS = ['Lingerie', 'Toys', 'BDSM', 'Couples', 'Gifts', 'Skincare']

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const AVATAR_COLORS = [
  '#7c4dff', '#00b8d9', '#00c875', '#ff5630', '#ff8800',
  '#6554c0', '#0065ff', '#00875a', '#bf2600', '#ff991f',
]

// Deterministic presentation color from the record's uuid (no stored fake data)
function avatarColor(id) {
  const s = String(id || '')
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return AVATAR_COLORS[h % AVATAR_COLORS.length]
}

function initialsOf(name) {
  const parts = String(name || '').split(/[.\s]+/).filter(Boolean)
  if (parts.length === 0) return '?'
  return parts.slice(0, 2).map(p => p[0]).join('').toUpperCase()
}

// Days until a yyyy-mm-dd date (negative = overdue); null when unscheduled
function daysUntil(dateStr) {
  if (!dateStr) return null
  const d = new Date(dateStr + 'T00:00:00')
  if (isNaN(d)) return null
  const today = new Date(); today.setHours(0, 0, 0, 0)
  return Math.round((d - today) / 86400000)
}

// Normalize a server row into the shape the UI renders
function normalizeCustomer(c) {
  return {
    ...c,
    tier: parseInt(c.tier, 10) || 1,
    preferences: Array.isArray(c.preferences) ? c.preferences : [],
    last_visit_days: (c.last_visit_days === null || c.last_visit_days === undefined)
      ? null : Number(c.last_visit_days),
    next_followup_days: daysUntil(c.next_followup_date),
  }
}

/* ── KPI TILE ── */

function KTile({ label, value, sub, color, alert }) {
  return (
    <div style={{
      background: 'var(--t-surface)',
      border: `1px solid ${alert === 'red' ? 'var(--t-danger)' : alert === 'amber' ? 'var(--t-warn)' : 'var(--t-line)'}`,
      padding: '14px 16px',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {alert === 'red'   && <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'var(--t-danger)' }} />}
      {alert === 'amber' && <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'var(--t-warn)' }} />}
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.08em', color: 'var(--t-text-muted)', textTransform: 'uppercase', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800, color: color || 'var(--t-text)', lineHeight: 1, marginBottom: 4 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--t-text-faint)' }}>{sub}</div>}
    </div>
  )
}

/* ── TIER BADGE ── */

function TierBadge({ tier }) {
  const map = { 1: { label: '$', color: '#22c55e' }, 2: { label: '$$', color: '#00e5ff' }, 3: { label: '$$$', color: '#7c4dff' } }
  const t = map[tier] || map[1]
  return (
    <span style={{
      fontSize: 11,
      fontWeight: 700,
      color: t.color,
      background: t.color + '22',
      border: `1px solid ${t.color}44`,
      padding: '2px 7px',
      borderRadius: 3,
    }}>{t.label}</span>
  )
}

/* ── AVATAR ── */

function Avatar({ customer, size = 36 }) {
  return (
    <div style={{
      width: size,
      height: size,
      borderRadius: '50%',
      background: avatarColor(customer.id),
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: size * 0.4,
      fontWeight: 800,
      color: '#fff',
      flexShrink: 0,
      letterSpacing: '-0.5px',
    }}>
      {initialsOf(customer.name)}
    </div>
  )
}

/* ── FREQ BADGE ── */

function FreqBadge({ freq }) {
  const map = {
    weekly:     { color: '#22c55e', label: 'Weekly' },
    monthly:    { color: '#00e5ff', label: 'Monthly' },
    occasional: { color: '#9ca3af', label: 'Occasional' },
  }
  const t = map[freq] || map.occasional
  return (
    <span style={{ fontSize: 10, fontWeight: 700, color: t.color, background: t.color + '18', padding: '2px 6px', borderRadius: 3 }}>
      {t.label}
    </span>
  )
}

/* ── DETAIL PANEL ── */

function DetailPanel({ customer, onClose, onSaveNotes, myId, onDataChanged }) {
  const [notes, setNotes] = useState(customer?.notes || '')
  const [saveState, setSaveState] = useState('idle')      // idle | saving | saved | error
  const [visits, setVisits] = useState([])
  const [visitsLoading, setVisitsLoading] = useState(false)
  const [visitsError, setVisitsError] = useState('')
  const [logging, setLogging] = useState(false)

  const loadVisits = useCallback(async (customerId) => {
    setVisitsLoading(true)
    setVisitsError('')
    try {
      const { data, error } = await sb.rpc('get_cultivation_visits', { p_customer_id: customerId })
      if (error) throw error
      setVisits(Array.isArray(data) ? data : [])
    } catch (e) {
      setVisits([])
      setVisitsError(e?.message || 'Could not load visit history.')
    } finally {
      setVisitsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (customer) {
      setNotes(customer.notes || '')
      setSaveState('idle')
      loadVisits(customer.id)
    }
  }, [customer?.id])  // eslint-disable-line

  const handleSave = async () => {
    setSaveState('saving')
    try {
      await onSaveNotes(customer.id, notes)
      setSaveState('saved')
      setTimeout(() => setSaveState('idle'), 2000)
    } catch {
      setSaveState('error')
    }
  }

  const handleLogVisit = async () => {
    if (!customer || logging) return
    setLogging(true)
    try {
      const { data, error } = await sb.rpc('log_cultivation_visit', {
        p_customer_id: customer.id,
        p_actor: myId || null,
        p_tier: customer.tier,
      })
      if (error) throw error
      if (data && data.ok === false) throw new Error(data.error || 'Not saved')
      await loadVisits(customer.id)
      onDataChanged && onDataChanged()
    } catch (e) {
      setVisitsError(e?.message || 'Visit was not saved.')
    } finally {
      setLogging(false)
    }
  }

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      right: 0,
      bottom: 0,
      width: 380,
      background: '#0c1220',
      borderLeft: '1px solid var(--t-line)',
      zIndex: 200,
      display: 'flex',
      flexDirection: 'column',
      transform: customer ? 'translateX(0)' : 'translateX(100%)',
      transition: 'transform 0.25s cubic-bezier(.4,0,.2,1)',
      boxShadow: '-8px 0 32px rgba(0,0,0,0.5)',
    }}>
      {/* Header */}
      <div style={{
        padding: '16px 20px',
        borderBottom: '1px solid var(--t-line)',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        flexShrink: 0,
      }}>
        {customer && <Avatar customer={customer} size={44} />}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--t-text)' }}>{customer?.name}</div>
          <div style={{ fontSize: 12, color: 'var(--t-text-muted)', marginTop: 2 }}>
            {customer?.location || '—'} · {customer?.assigned_name || 'Unassigned'}
          </div>
        </div>
        <button onClick={onClose} style={{
          background: 'transparent',
          border: '1px solid var(--t-line)',
          color: 'var(--t-text-muted)',
          cursor: 'pointer',
          width: 32,
          height: 32,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 18,
          flexShrink: 0,
        }}>×</button>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 20 }}>
        {/* Quick stats */}
        {customer && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
            <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', padding: '10px 12px', textAlign: 'center' }}>
              <div style={{ fontSize: 10, color: 'var(--t-text-muted)', fontWeight: 700, textTransform: 'uppercase', marginBottom: 4 }}>Tier</div>
              <TierBadge tier={customer.tier} />
            </div>
            <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', padding: '10px 12px', textAlign: 'center' }}>
              <div style={{ fontSize: 10, color: 'var(--t-text-muted)', fontWeight: 700, textTransform: 'uppercase', marginBottom: 4 }}>Freq</div>
              <FreqBadge freq={customer.visit_freq} />
            </div>
            <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', padding: '10px 12px', textAlign: 'center' }}>
              <div style={{ fontSize: 10, color: 'var(--t-text-muted)', fontWeight: 700, textTransform: 'uppercase', marginBottom: 4 }}>B-Month</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--t-text)' }}>
                {(customer.birthday_month === null || customer.birthday_month === undefined) ? '—' : MONTHS[customer.birthday_month] || '—'}
              </div>
            </div>
          </div>
        )}

        {/* Preferences */}
        {customer && (
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--t-text-muted)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>Preferences</div>
            {customer.preferences.length === 0 ? (
              <div style={{ fontSize: 12, color: 'var(--t-text-faint)' }}>No preferences recorded.</div>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {customer.preferences.map(p => (
                  <span key={p} style={{
                    fontSize: 11,
                    fontWeight: 600,
                    padding: '3px 10px',
                    background: 'var(--t-accent)22',
                    color: 'var(--t-accent)',
                    border: '1px solid var(--t-accent)44',
                    borderRadius: 3,
                  }}>{p}</span>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Follow-up */}
        {customer && (
          <div style={{
            background: (customer.next_followup_days !== null && customer.next_followup_days <= 3) ? '#7c4dff18' : 'var(--t-surface)',
            border: `1px solid ${(customer.next_followup_days !== null && customer.next_followup_days <= 3) ? '#7c4dff44' : 'var(--t-line)'}`,
            padding: '10px 14px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}>
            <span style={{ fontSize: 12, color: 'var(--t-text-muted)' }}>Next follow-up</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: (customer.next_followup_days !== null && customer.next_followup_days <= 3) ? '#7c4dff' : 'var(--t-text)' }}>
              {customer.next_followup_days === null
                ? 'Not scheduled'
                : customer.next_followup_days < 0
                  ? `${Math.abs(customer.next_followup_days)}d overdue`
                  : customer.next_followup_days === 0
                    ? 'Today'
                    : `in ${customer.next_followup_days}d`}
            </span>
          </div>
        )}

        {/* Visit History */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--t-text-muted)', textTransform: 'uppercase', letterSpacing: '.06em' }}>Visit History</div>
            <button
              onClick={handleLogVisit}
              disabled={logging}
              style={{
                background: 'var(--t-accent)22',
                border: '1px solid var(--t-accent)44',
                color: 'var(--t-accent)',
                fontSize: 11,
                fontWeight: 700,
                padding: '3px 10px',
                cursor: logging ? 'wait' : 'pointer',
              }}
            >
              {logging ? 'Logging…' : '+ Log Visit Today'}
            </button>
          </div>
          {visitsError && (
            <div style={{ fontSize: 12, color: 'var(--t-danger)', marginBottom: 8 }}>{visitsError}</div>
          )}
          {visitsLoading ? (
            <div style={{ fontSize: 12, color: 'var(--t-text-faint)', padding: '8px 0' }}>Loading visits…</div>
          ) : visits.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--t-text-faint)', padding: '8px 0' }}>No visits recorded yet.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              {visits.map((v, i) => (
                <div key={v.id} style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '8px 0',
                  borderBottom: i < visits.length - 1 ? '1px solid var(--t-line)' : 'none',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{
                      width: 6, height: 6, borderRadius: '50%',
                      background: i === 0 ? 'var(--t-accent)' : 'var(--t-line)',
                      flexShrink: 0,
                    }} />
                    <span style={{ fontSize: 12, color: i === 0 ? 'var(--t-text)' : 'var(--t-text-muted)' }}>
                      {v.days_ago === 0 ? 'Today' : `${v.days_ago}d ago`}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {v.tier ? <TierBadge tier={v.tier} /> : null}
                    <span style={{ fontSize: 11, color: 'var(--t-text-faint)' }}>{v.logged_by_name || ''}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Notes */}
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--t-text-muted)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>Notes</div>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            rows={4}
            placeholder="Add notes about this customer..."
            style={{
              width: '100%',
              background: 'var(--t-surface)',
              border: '1px solid var(--t-line)',
              color: 'var(--t-text)',
              padding: '10px 12px',
              fontSize: 13,
              resize: 'vertical',
              boxSizing: 'border-box',
              outline: 'none',
              fontFamily: 'inherit',
              lineHeight: 1.5,
            }}
          />
          <button
            onClick={handleSave}
            disabled={saveState === 'saving'}
            style={{
              marginTop: 8,
              padding: '8px 20px',
              background: saveState === 'saved' ? '#00c87522' : saveState === 'error' ? 'var(--t-danger)22' : 'var(--t-accent)',
              color: saveState === 'saved' ? '#00c875' : saveState === 'error' ? 'var(--t-danger)' : '#070b14',
              border: saveState === 'saved' ? '1px solid #00c87544' : saveState === 'error' ? '1px solid var(--t-danger)' : 'none',
              fontWeight: 700,
              fontSize: 13,
              cursor: saveState === 'saving' ? 'wait' : 'pointer',
              width: '100%',
              transition: 'all 0.2s',
            }}
          >
            {saveState === 'saved' ? 'Saved' : saveState === 'error' ? 'Not saved — retry' : saveState === 'saving' ? 'Saving…' : 'Save Notes'}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ── CUSTOMER CARD ── */

function CustomerCard({ customer, onClick, atRisk }) {
  return (
    <div
      onClick={() => onClick(customer)}
      style={{
        background: 'var(--t-surface)',
        border: `1px solid ${atRisk ? 'var(--t-warn)' : 'var(--t-line)'}`,
        padding: '14px 16px',
        cursor: 'pointer',
        position: 'relative',
        overflow: 'hidden',
        transition: 'border-color 0.15s',
      }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = atRisk ? 'var(--t-warn)' : 'var(--t-accent)' }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = atRisk ? 'var(--t-warn)' : 'var(--t-line)' }}
    >
      {atRisk && <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'var(--t-warn)' }} />}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
        <Avatar customer={customer} size={36} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--t-text)' }}>{customer.name}</div>
          <div style={{ fontSize: 11, color: 'var(--t-text-muted)', marginTop: 1 }}>{customer.assigned_name || 'Unassigned'}</div>
        </div>
        <TierBadge tier={customer.tier} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <FreqBadge freq={customer.visit_freq} />
        <span style={{ fontSize: 11, color: atRisk ? 'var(--t-warn)' : 'var(--t-text-muted)' }}>
          {customer.last_visit_days === null ? 'No visits' : customer.last_visit_days === 0 ? 'Today' : `${customer.last_visit_days}d ago`}
        </span>
      </div>
      {customer.preferences.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {customer.preferences.map(p => (
            <span key={p} style={{ fontSize: 10, fontWeight: 600, padding: '2px 6px', background: 'var(--t-surface-2, #1a2035)', color: 'var(--t-text-faint)', borderRadius: 2 }}>
              {p}
            </span>
          ))}
        </div>
      )}
      {customer.next_followup_days !== null && customer.next_followup_days <= 3 && (
        <div style={{ marginTop: 8, fontSize: 11, color: '#7c4dff', fontWeight: 600 }}>
          {customer.next_followup_days < 0
            ? `Follow-up ${Math.abs(customer.next_followup_days)}d overdue`
            : customer.next_followup_days === 0
              ? 'Follow-up today'
              : `Follow-up in ${customer.next_followup_days}d`}
        </div>
      )}
    </div>
  )
}

/* ── TAB 1: MY CULTIVATIONS ── */

function MyCultivations({ myId, customers, onSelectCustomer }) {
  const [search, setSearch] = useState('')
  const [filterTier, setFilterTier] = useState('all')
  const [sortBy, setSortBy] = useState('last_visit')

  const mine = useMemo(() => customers.filter(c => c.assigned_to === myId), [customers, myId])

  const filtered = useMemo(() => {
    let list = mine
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter(c => (c.name || '').toLowerCase().includes(q))
    }
    if (filterTier !== 'all') {
      list = list.filter(c => c.tier === parseInt(filterTier))
    }
    const vDays = c => (c.last_visit_days === null ? Infinity : c.last_visit_days)
    const fDays = c => (c.next_followup_days === null ? Infinity : c.next_followup_days)
    if (sortBy === 'last_visit') {
      list = [...list].sort((a, b) => vDays(a) - vDays(b))
    } else if (sortBy === 'followup') {
      list = [...list].sort((a, b) => fDays(a) - fDays(b))
    } else if (sortBy === 'tier') {
      list = [...list].sort((a, b) => b.tier - a.tier)
    }
    return list
  }, [mine, search, filterTier, sortBy])

  const atRisk = mine.filter(c => c.last_visit_days !== null && c.last_visit_days >= 60)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {atRisk.length > 0 && (
        <div style={{
          background: '#f59e0b18',
          border: '1px solid var(--t-warn)',
          padding: '10px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}>
          <span style={{ fontSize: 13, color: 'var(--t-warn)', fontWeight: 700 }}>
            {atRisk.length} at-risk customer{atRisk.length > 1 ? 's' : ''} — not seen in 60+ days
          </span>
        </div>
      )}

      {/* Controls */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search customers..."
          style={{
            flex: '1 1 180px',
            background: 'var(--t-surface)',
            border: '1px solid var(--t-line)',
            color: 'var(--t-text)',
            padding: '8px 12px',
            fontSize: 13,
            outline: 'none',
          }}
        />
        <select
          value={filterTier}
          onChange={e => setFilterTier(e.target.value)}
          style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', color: 'var(--t-text)', padding: '8px 10px', fontSize: 13, cursor: 'pointer' }}
        >
          <option value="all">All Tiers</option>
          <option value="1">$ Tier</option>
          <option value="2">$$ Tier</option>
          <option value="3">$$$ Tier</option>
        </select>
        <select
          value={sortBy}
          onChange={e => setSortBy(e.target.value)}
          style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', color: 'var(--t-text)', padding: '8px 10px', fontSize: 13, cursor: 'pointer' }}
        >
          <option value="last_visit">Sort: Last Visit</option>
          <option value="followup">Sort: Follow-up</option>
          <option value="tier">Sort: Tier</option>
        </select>
      </div>

      {filtered.length === 0 ? (
        <div style={{ color: 'var(--t-text-faint)', fontSize: 14, textAlign: 'center', padding: 40 }}>
          {mine.length === 0
            ? 'No VIP customers assigned to you yet.'
            : 'No customers match your filters.'}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
          {filtered.map(c => (
            <CustomerCard
              key={c.id}
              customer={c}
              atRisk={c.last_visit_days !== null && c.last_visit_days >= 60}
              onClick={onSelectCustomer}
            />
          ))}
        </div>
      )}
    </div>
  )
}

/* ── TAB 2: TEAM PIPELINE ── */

function TeamPipeline({ customers, onSelectCustomer }) {
  const [sortField, setSortField] = useState('count')

  // Per-rep metrics, grouped from real assignment data
  const repMetrics = useMemo(() => {
    const map = {}
    customers.forEach(c => {
      const key = c.assigned_to || 'unassigned'
      if (!map[key]) {
        map[key] = {
          emp: { id: key, name: c.assigned_name || 'Unassigned' },
          customers: [],
          lastActivity: null,
        }
      }
      map[key].customers.push(c)
      if (c.last_visit_days !== null &&
          (map[key].lastActivity === null || c.last_visit_days < map[key].lastActivity)) {
        map[key].lastActivity = c.last_visit_days
      }
    })
    return Object.values(map)
      .filter(r => r.customers.length > 0)
      .map(r => ({
        ...r,
        avgTier: (r.customers.reduce((s, c) => s + c.tier, 0) / r.customers.length).toFixed(1),
        count: r.customers.length,
      }))
  }, [customers])

  const sorted = useMemo(() => {
    const act = r => (r.lastActivity === null ? Infinity : r.lastActivity)
    return [...repMetrics].sort((a, b) => {
      if (sortField === 'count')    return b.count - a.count
      if (sortField === 'avgTier')  return parseFloat(b.avgTier) - parseFloat(a.avgTier)
      if (sortField === 'activity') return act(a) - act(b)
      return 0
    })
  }, [repMetrics, sortField])

  // Top customers (tier 3, most recently seen first)
  const topCustomers = useMemo(() =>
    [...customers]
      .filter(c => c.tier === 3)
      .sort((a, b) => {
        const av = a.last_visit_days === null ? Infinity : a.last_visit_days
        const bv = b.last_visit_days === null ? Infinity : b.last_visit_days
        return av - bv
      })
      .slice(0, 8),
    [customers]
  )

  // At-risk customers (visited, but not in 60+ days)
  const lostCustomers = useMemo(() =>
    [...customers]
      .filter(c => c.last_visit_days !== null && c.last_visit_days >= 60)
      .sort((a, b) => b.last_visit_days - a.last_visit_days),
    [customers]
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Lost customers alert */}
      {lostCustomers.length > 0 && (
        <div style={{
          background: '#f59e0b12',
          border: '1px solid var(--t-warn)',
          padding: '12px 16px',
        }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--t-warn)', marginBottom: 10 }}>
            {lostCustomers.length} At-Risk — No visit in 60+ days
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {lostCustomers.map((c, i) => (
              <div
                key={c.id}
                onClick={() => onSelectCustomer(c)}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '8px 0',
                  borderBottom: i < lostCustomers.length - 1 ? '1px solid var(--t-line)' : 'none',
                  cursor: 'pointer',
                  borderLeft: `3px solid ${c.last_visit_days >= 80 ? 'var(--t-danger)' : 'var(--t-warn)'}`,
                  paddingLeft: 10,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Avatar customer={c} size={28} />
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--t-text)' }}>{c.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--t-text-muted)' }}>{c.assigned_name || 'Unassigned'}</div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <TierBadge tier={c.tier} />
                  <span style={{
                    fontSize: 12,
                    fontWeight: 700,
                    color: c.last_visit_days >= 80 ? 'var(--t-danger)' : 'var(--t-warn)',
                  }}>
                    {c.last_visit_days}d ago
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* By-rep table */}
      <div>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--t-text-muted)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 10 }}>
          Rep Performance
        </div>
        <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)' }}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 80px 80px 100px',
            padding: '10px 16px',
            borderBottom: '1px solid var(--t-line)',
            background: 'var(--t-surface-2, #1a2035)',
          }}>
            {['Rep', 'Customers', 'Avg Tier', 'Last Active'].map((h, i) => (
              <div
                key={h}
                onClick={() => {
                  const fields = ['', 'count', 'avgTier', 'activity']
                  if (fields[i]) setSortField(fields[i])
                }}
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  color: 'var(--t-text-muted)',
                  textTransform: 'uppercase',
                  letterSpacing: '.06em',
                  cursor: i > 0 ? 'pointer' : 'default',
                  textAlign: i > 0 ? 'center' : 'left',
                  userSelect: 'none',
                }}
              >
                {h} {i > 0 && sortField === ['', 'count', 'avgTier', 'activity'][i] ? '▲' : ''}
              </div>
            ))}
          </div>
          {sorted.length === 0 && (
            <div style={{ padding: '18px 16px', fontSize: 13, color: 'var(--t-text-faint)', textAlign: 'center' }}>
              No cultivation assignments yet.
            </div>
          )}
          {sorted.map((r, i) => (
            <div
              key={r.emp.id}
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 80px 80px 100px',
                padding: '10px 16px',
                borderBottom: i < sorted.length - 1 ? '1px solid var(--t-line)' : 'none',
                alignItems: 'center',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{
                  width: 28, height: 28, borderRadius: 0,
                  background: avatarColor(r.emp.id),
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, fontWeight: 800, color: '#fff', flexShrink: 0,
                }}>
                  {(r.emp.name || '?')[0]}
                </div>
                <span style={{ fontSize: 13, color: 'var(--t-text)' }}>{r.emp.name}</span>
              </div>
              <div style={{ textAlign: 'center', fontSize: 14, fontWeight: 700, color: 'var(--t-accent)' }}>{r.count}</div>
              <div style={{ textAlign: 'center' }}>
                <TierBadge tier={Math.round(parseFloat(r.avgTier))} />
              </div>
              <div style={{ textAlign: 'center', fontSize: 12, color: (r.lastActivity !== null && r.lastActivity > 30) ? 'var(--t-warn)' : 'var(--t-text-muted)' }}>
                {r.lastActivity === null ? '—' : `${r.lastActivity}d ago`}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Top VIP customers */}
      <div>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--t-text-muted)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 10 }}>
          Top VIP Customers ($$$ Tier)
        </div>
        {topCustomers.length === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--t-text-faint)', padding: '10px 0' }}>No $$$-tier customers yet.</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 10 }}>
            {topCustomers.map(c => (
              <CustomerCard
                key={c.id}
                customer={c}
                atRisk={c.last_visit_days !== null && c.last_visit_days >= 60}
                onClick={onSelectCustomer}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

/* ── TAB 3: ADD & ASSIGN ── */

function AddAssign({ customers, locations, myId, onAdded }) {
  const BLANK_FORM = {
    name: '',
    tier: 1,
    node_id: locations[0]?.id || '',
    preferences: [],
    assigned_to: '',
  }
  const [form, setForm] = useState({ ...BLANK_FORM })
  const [success, setSuccess] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const [reps, setReps] = useState([])
  const [repsLoading, setRepsLoading] = useState(false)

  // Real roster for the selected location
  useEffect(() => {
    let alive = true
    if (!form.node_id) { setReps([]); return }
    setRepsLoading(true)
    sb.rpc('get_roster', { p_node_ids: [form.node_id] })
      .then(({ data, error }) => {
        if (!alive) return
        if (error || !Array.isArray(data)) { setReps([]); return }
        setReps(data.map(r => ({
          id: r.person_id ?? r.id,
          name: r.full_name || r.display_name || 'Unknown',
        })).filter(r => r.id))
      })
      .catch(() => { if (alive) setReps([]) })
      .finally(() => { if (alive) setRepsLoading(false) })
    return () => { alive = false }
  }, [form.node_id])

  const recent = useMemo(
    () => [...customers]
      .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
      .slice(0, 6),
    [customers]
  )

  const togglePref = (pref) => {
    setForm(f => ({
      ...f,
      preferences: f.preferences.includes(pref)
        ? f.preferences.filter(p => p !== pref)
        : [...f.preferences, pref],
    }))
  }

  const validate = () => {
    const e = {}
    if (!form.name.trim()) e.name = 'Name code required'
    else if (!/^[A-Z]\.[A-Za-z]+$/.test(form.name.trim())) e.name = 'Format: J.Smith'
    if (!form.node_id) e.node_id = 'Select a location'
    if (!form.assigned_to) e.assigned_to = 'Assign to a rep'
    return e
  }

  const handleSubmit = async () => {
    const e = validate()
    if (Object.keys(e).length > 0) { setErrors(e); return }
    setSaving(true)
    setSubmitError('')
    try {
      const { data, error } = await sb.rpc('add_cultivation_customer', {
        p_name: form.name.trim(),
        p_node_id: form.node_id,
        p_assigned_to: form.assigned_to,
        p_tier: parseInt(form.tier) || 1,
        p_preferences: form.preferences,
        p_actor: myId || null,
      })
      if (error) throw error
      if (data && data.ok === false) throw new Error(data.error || 'Not saved')
      setForm({ ...BLANK_FORM, node_id: form.node_id })
      setErrors({})
      setSuccess(true)
      setTimeout(() => setSuccess(false), 3000)
      await onAdded()
    } catch (err) {
      setSubmitError(err?.message || 'Customer was not saved.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
      {/* Form */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--t-text)', marginBottom: 4 }}>Add New VIP Customer</div>

        {success && (
          <div style={{ background: '#00c87518', border: '1px solid #00c87544', padding: '10px 14px', fontSize: 13, color: '#00c875', fontWeight: 600 }}>
            Customer added successfully.
          </div>
        )}
        {submitError && (
          <div style={{ background: 'var(--t-danger)18', border: '1px solid var(--t-danger)', padding: '10px 14px', fontSize: 13, color: 'var(--t-danger)', fontWeight: 600 }}>
            {submitError}
          </div>
        )}

        {/* Name code */}
        <div>
          <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--t-text-muted)', textTransform: 'uppercase', letterSpacing: '.06em', display: 'block', marginBottom: 6 }}>
            Name Code (e.g. J.Smith)
          </label>
          <input
            value={form.name}
            onChange={e => { setForm(f => ({ ...f, name: e.target.value })); setErrors(v => ({ ...v, name: '' })) }}
            placeholder="J.Smith"
            style={{
              width: '100%',
              background: 'var(--t-surface)',
              border: `1px solid ${errors.name ? 'var(--t-danger)' : 'var(--t-line)'}`,
              color: 'var(--t-text)',
              padding: '9px 12px',
              fontSize: 14,
              boxSizing: 'border-box',
              outline: 'none',
            }}
          />
          {errors.name && <div style={{ fontSize: 11, color: 'var(--t-danger)', marginTop: 4 }}>{errors.name}</div>}
        </div>

        {/* Tier */}
        <div>
          <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--t-text-muted)', textTransform: 'uppercase', letterSpacing: '.06em', display: 'block', marginBottom: 6 }}>
            Spend Tier
          </label>
          <div style={{ display: 'flex', gap: 8 }}>
            {[1, 2, 3].map(t => (
              <button
                key={t}
                onClick={() => setForm(f => ({ ...f, tier: t }))}
                style={{
                  flex: 1,
                  padding: '9px 0',
                  background: form.tier === t ? 'var(--t-accent)22' : 'var(--t-surface)',
                  border: `1px solid ${form.tier === t ? 'var(--t-accent)' : 'var(--t-line)'}`,
                  color: form.tier === t ? 'var(--t-accent)' : 'var(--t-text-muted)',
                  fontWeight: 700,
                  fontSize: 14,
                  cursor: 'pointer',
                }}
              >
                {'$'.repeat(t)}
              </button>
            ))}
          </div>
        </div>

        {/* Location */}
        <div>
          <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--t-text-muted)', textTransform: 'uppercase', letterSpacing: '.06em', display: 'block', marginBottom: 6 }}>
            Location
          </label>
          {locations.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--t-text-faint)' }}>No locations available on your session.</div>
          ) : (
            <select
              value={form.node_id}
              onChange={e => setForm(f => ({ ...f, node_id: e.target.value, assigned_to: '' }))}
              style={{ width: '100%', background: 'var(--t-surface)', border: '1px solid var(--t-line)', color: 'var(--t-text)', padding: '9px 12px', fontSize: 14, boxSizing: 'border-box', cursor: 'pointer' }}
            >
              {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          )}
          {errors.node_id && <div style={{ fontSize: 11, color: 'var(--t-danger)', marginTop: 4 }}>{errors.node_id}</div>}
        </div>

        {/* Preferences */}
        <div>
          <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--t-text-muted)', textTransform: 'uppercase', letterSpacing: '.06em', display: 'block', marginBottom: 8 }}>
            Preferences
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            {PREF_OPTIONS.map(p => (
              <label key={p} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={form.preferences.includes(p)}
                  onChange={() => togglePref(p)}
                  style={{ accentColor: 'var(--t-accent)', width: 14, height: 14 }}
                />
                <span style={{ fontSize: 13, color: form.preferences.includes(p) ? 'var(--t-text)' : 'var(--t-text-muted)' }}>{p}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Assign to rep */}
        <div>
          <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--t-text-muted)', textTransform: 'uppercase', letterSpacing: '.06em', display: 'block', marginBottom: 6 }}>
            Assign to Rep
          </label>
          <select
            value={form.assigned_to}
            onChange={e => { setForm(f => ({ ...f, assigned_to: e.target.value })); setErrors(v => ({ ...v, assigned_to: '' })) }}
            style={{
              width: '100%',
              background: 'var(--t-surface)',
              border: `1px solid ${errors.assigned_to ? 'var(--t-danger)' : 'var(--t-line)'}`,
              color: form.assigned_to ? 'var(--t-text)' : 'var(--t-text-muted)',
              padding: '9px 12px',
              fontSize: 14,
              boxSizing: 'border-box',
              cursor: 'pointer',
            }}
          >
            <option value="">{repsLoading ? 'Loading roster…' : reps.length === 0 ? '— No staff at this location —' : '— Select rep —'}</option>
            {reps.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
          {errors.assigned_to && <div style={{ fontSize: 11, color: 'var(--t-danger)', marginTop: 4 }}>{errors.assigned_to}</div>}
        </div>

        <button
          onClick={handleSubmit}
          disabled={saving}
          style={{
            padding: '11px 0',
            background: 'var(--t-accent)',
            color: '#070b14',
            border: 'none',
            fontWeight: 800,
            fontSize: 14,
            cursor: saving ? 'wait' : 'pointer',
            letterSpacing: '.02em',
            marginTop: 4,
            opacity: saving ? 0.7 : 1,
          }}
        >
          {saving ? 'Saving…' : 'Add VIP Customer'}
        </button>
      </div>

      {/* Recent additions */}
      <div>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--t-text-muted)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 12 }}>
          Recent Additions
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {recent.length === 0 && (
            <div style={{ fontSize: 13, color: 'var(--t-text-faint)', textAlign: 'center', padding: 24 }}>No recent additions.</div>
          )}
          {recent.map(c => (
            <div key={c.id} style={{
              background: 'var(--t-surface)',
              border: '1px solid var(--t-line)',
              padding: '12px 14px',
              display: 'flex',
              alignItems: 'center',
              gap: 12,
            }}>
              <Avatar customer={c} size={32} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--t-text)' }}>{c.name}</div>
                <div style={{ fontSize: 11, color: 'var(--t-text-muted)', marginTop: 1 }}>
                  {c.location || '—'} · {c.assigned_name || 'Unassigned'}
                </div>
              </div>
              <TierBadge tier={c.tier} />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/* ── MAIN COMPONENT ── */

export default function Cultivation() {
  // Real session (written by the AuthProvider at pin_login)
  const me = getSession()   // { id, full_name, role_name, nodes }
  const myId = me.id || null
  const r = me.role_name || ''
  const isHR = ['ceo', 'hr', 'manager', 'coo', 'admin', 'owner'].some(x => r.toLowerCase().includes(x))

  const locations = useMemo(
    () => (me.nodes || []).filter(n => n.node_type === 'location'),
    [me.nodes]
  )
  const nodeIds = useMemo(() => locations.map(l => l.id), [locations])

  const [tab, setTab] = useState('mine')
  const [customers, setCustomers] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [selectedCustomer, setSelectedCustomer] = useState(null)

  const load = useCallback(async () => {
    setLoadError('')
    try {
      const { data, error } = await sb.rpc('get_cultivation_customers', { p_node_ids: nodeIds })
      if (error) throw error
      const rows = (Array.isArray(data) ? data : []).map(normalizeCustomer)
      setCustomers(rows)
      // Keep the open detail panel in sync with fresh server data
      setSelectedCustomer(prev => prev ? (rows.find(c => c.id === prev.id) || null) : null)
    } catch (e) {
      setCustomers([])
      setLoadError(e?.message || 'Could not load cultivation data.')
    } finally {
      setLoading(false)
    }
  }, [nodeIds.join(',')])  // eslint-disable-line

  useEffect(() => { load() }, [load])

  const handleSaveNotes = async (customerId, notes) => {
    const { data, error } = await sb.rpc('update_cultivation_customer', {
      p_id: customerId,
      p_notes: notes,
      p_actor: myId,
    })
    if (error) throw error
    if (data && data.ok === false) throw new Error(data.error || 'Not saved')
    setCustomers(prev => prev.map(c => c.id === customerId ? { ...c, notes } : c))
    setSelectedCustomer(prev => (prev && prev.id === customerId) ? { ...prev, notes } : prev)
  }

  const handleSelectCustomer = (c) => {
    setSelectedCustomer(c)
  }

  // KPIs — computed from real server rows only
  const kpis = useMemo(() => {
    const total = customers.length
    const visited = c => c.last_visit_days !== null
    const activeThisMonth = customers.filter(c => visited(c) && c.last_visit_days <= 30).length
    const avgTier = total > 0
      ? (customers.reduce((s, c) => s + c.tier, 0) / total).toFixed(1)
      : '0'
    const retained = customers.filter(c => visited(c) && c.last_visit_days <= 60).length
    const retentionRate = total > 0 ? Math.round((retained / total) * 100) : 0
    const monthAgo = Date.now() - 30 * 86400000
    const newThisMonth = customers.filter(c => c.created_at && new Date(c.created_at).getTime() >= monthAgo).length
    const atRisk = customers.filter(c => visited(c) && c.last_visit_days >= 60).length
    return { total, activeThisMonth, avgTier, retentionRate, newThisMonth, atRisk }
  }, [customers])

  const TABS = [
    { key: 'mine', label: 'My Cultivations' },
    ...(isHR ? [{ key: 'team', label: 'Team Pipeline' }] : []),
    ...(isHR ? [{ key: 'add', label: 'Add & Assign' }] : []),
  ]

  if (loading) {
    return (
      <div style={{ padding: 40, color: 'var(--t-text-muted)', fontSize: 14, background: '#070b14', minHeight: '100%' }}>
        Loading cultivations…
      </div>
    )
  }

  return (
    <div style={{
      padding: '20px 24px',
      display: 'flex',
      flexDirection: 'column',
      gap: 20,
      background: '#070b14',
      minHeight: '100%',
      fontFamily: 'var(--font-sans, system-ui, sans-serif)',
      color: 'var(--t-text)',
      position: 'relative',
    }}>

      {/* ── HEADER ── */}
      <div>
        <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--t-text)', letterSpacing: '-0.3px', lineHeight: 1.2 }}>
          Customer Cultivation
        </div>
        <div style={{ fontSize: 13, color: 'var(--t-text-muted)', marginTop: 3 }}>
          VIP · High-value customer relationship pipeline
        </div>
      </div>

      {/* ── LOAD ERROR (honest) ── */}
      {loadError && (
        <div style={{
          background: 'var(--t-danger)12',
          border: '1px solid var(--t-danger)',
          padding: '10px 16px',
          fontSize: 13,
          color: 'var(--t-danger)',
          fontWeight: 600,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
        }}>
          <span>Could not load cultivation data: {loadError}</span>
          <button
            onClick={() => { setLoading(true); load() }}
            style={{ background: 'transparent', border: '1px solid var(--t-danger)', color: 'var(--t-danger)', fontSize: 12, fontWeight: 700, padding: '4px 12px', cursor: 'pointer' }}
          >
            Retry
          </button>
        </div>
      )}

      {/* ── KPI ROW ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10 }}>
        <KTile
          label="Total VIP Customers"
          value={kpis.total}
          sub="enrolled"
          color="var(--t-accent)"
        />
        <KTile
          label="Active This Month"
          value={kpis.activeThisMonth}
          sub="visited ≤30d"
          color="var(--t-success, #22c55e)"
        />
        <KTile
          label="Avg Spend Tier"
          value={kpis.avgTier}
          sub="out of 3"
        />
        <KTile
          label="Retention Rate"
          value={`${kpis.retentionRate}%`}
          sub="visited in 60d"
          color={kpis.retentionRate >= 80 ? 'var(--t-success, #22c55e)' : 'var(--t-text)'}
          alert={kpis.total > 0 && kpis.retentionRate < 70 ? 'amber' : undefined}
        />
        <KTile
          label="New VIPs This Month"
          value={kpis.newThisMonth}
          sub="added ≤30d"
        />
        <KTile
          label="At-Risk"
          value={kpis.atRisk}
          sub="60+ days no visit"
          color={kpis.atRisk > 0 ? 'var(--t-warn)' : 'var(--t-text)'}
          alert={kpis.atRisk > 0 ? 'amber' : undefined}
        />
      </div>

      {/* ── TABS ── */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--t-line)' }}>
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              padding: '10px 20px',
              background: 'transparent',
              border: 'none',
              borderBottom: tab === t.key ? '2px solid var(--t-accent)' : '2px solid transparent',
              color: tab === t.key ? 'var(--t-accent)' : 'var(--t-text-muted)',
              fontWeight: tab === t.key ? 700 : 500,
              fontSize: 13,
              cursor: 'pointer',
              letterSpacing: '.01em',
              transition: 'all 0.15s',
              marginBottom: -1,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── TAB CONTENT ── */}
      {tab === 'mine' && (
        <MyCultivations
          myId={myId}
          customers={customers}
          onSelectCustomer={handleSelectCustomer}
        />
      )}
      {tab === 'team' && isHR && (
        <TeamPipeline
          customers={customers}
          onSelectCustomer={handleSelectCustomer}
        />
      )}
      {tab === 'add' && isHR && (
        <AddAssign
          customers={customers}
          locations={locations}
          myId={myId}
          onAdded={load}
        />
      )}

      {/* ── DETAIL PANEL OVERLAY ── */}
      {selectedCustomer && (
        <div
          onClick={() => setSelectedCustomer(null)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(7,11,20,0.5)',
            zIndex: 199,
          }}
        />
      )}
      <DetailPanel
        customer={selectedCustomer}
        onClose={() => setSelectedCustomer(null)}
        onSaveNotes={handleSaveNotes}
        myId={myId}
        onDataChanged={load}
      />

    </div>
  )
}
