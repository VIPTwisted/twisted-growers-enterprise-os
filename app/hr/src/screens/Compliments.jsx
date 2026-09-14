import { useState, useEffect, useCallback, useMemo } from 'react'
import { sb } from '../lib/supabase'
import { useAuth } from '../lib/auth.jsx'
import { useScope } from '../lib/scope.jsx'
import DrillDown from '../components/DrillDown.jsx'

// ─── Constants ─────────────────────────────────────────────────────────────────

const CATEGORIES = [
  { key: 'Customer Service', color: '#2979ff' },
  { key: 'Teamwork',         color: 'var(--t-success)' },
  { key: 'Sales',            color: '#ffb800' },
  { key: 'Training',         color: 'var(--t-danger)' },
  { key: 'Leadership',       color: '#00e5ff' },
  { key: 'Initiative',       color: '#7c4dff' },
]

// Resolved colors for use in non-CSS-variable contexts (canvas, SVG, etc.)
const CAT_COLORS_RESOLVED = {
  'Customer Service': '#2979ff',
  'Teamwork':         '#00ff41',
  'Sales':            '#ffb800',
  'Training':         '#ff1a1a',
  'Leadership':       '#00e5ff',
  'Initiative':       '#7c4dff',
}

const CAT_MAP = Object.fromEntries(CATEGORIES.map(c => [c.key, c]))

const EMPTY_SETTINGS = { systemEnabled: true, associatesCanSubmit: true, bannedIds: [] }

// ─── Helpers ────────────────────────────────────────────────────────────────────

function initials(name = '') {
  return name.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase()
}

function fmtDate(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const now = new Date()
  const diffDays = Math.floor((now - d) / 86400000)
  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7)  return `${diffDays}d ago`
  if (diffDays < 30) return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })
}

function catColor(key) {
  return (CAT_MAP[key] || CATEGORIES[0]).color
}

function catColorResolved(key) {
  return CAT_COLORS_RESOLVED[key] || '#00e5ff'
}

function monthOf(iso) {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function currentMonth() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function prevMonth() {
  const d = new Date()
  d.setMonth(d.getMonth() - 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

// ─── KPI Tile ───────────────────────────────────────────────────────────────────

function KTile({ label, value, sub, color, alert, wide, onClick }) {
  return (
    <div onClick={onClick} title={onClick ? 'Click to drill into records' : undefined} style={{
      background: 'var(--t-surface)',
      border: `1px solid ${alert === 'red' ? 'var(--t-danger)' : alert === 'amber' ? 'var(--t-warn)' : 'var(--t-line)'}`,
      padding: '14px 16px',
      position: 'relative',
      overflow: 'hidden',
      gridColumn: wide ? 'span 2' : undefined,
      cursor: onClick ? 'pointer' : 'default',
    }}>
      {alert === 'red'   && <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'var(--t-danger)' }} />}
      {alert === 'amber' && <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'var(--t-warn)'   }} />}
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.08em', color: 'var(--t-text-muted)', textTransform: 'uppercase', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800, color: color || 'var(--t-text)', lineHeight: 1, marginBottom: 4 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--t-text-faint)' }}>{sub}</div>}
    </div>
  )
}

// ─── Avatar ─────────────────────────────────────────────────────────────────────

function Avatar({ name, size = 36, color }) {
  const bg = color || 'var(--t-accent)'
  return (
    <div style={{
      width: size, height: size, borderRadius: 0,
      background: `${bg}22`, border: `1.5px solid ${bg}55`,
      color: bg, display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontWeight: 800, fontSize: Math.round(size * 0.34), flexShrink: 0,
      letterSpacing: '0.04em', fontFamily: 'var(--font-mono, monospace)',
    }}>
      {initials(name)}
    </div>
  )
}

// ─── Category Badge ─────────────────────────────────────────────────────────────

function CatBadge({ category, small }) {
  const color = catColor(category)
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 3,
      padding: small ? '2px 6px' : '3px 9px',
      background: `${catColorResolved(category)}18`, border: `1px solid ${catColorResolved(category)}44`,
      color, fontSize: small ? 9 : 10, fontWeight: 700,
      letterSpacing: '0.08em', textTransform: 'uppercase',
      fontFamily: 'var(--font-mono, monospace)', lineHeight: 1,
    }}>
      {category}
    </span>
  )
}

// ─── Section Label ──────────────────────────────────────────────────────────────

function SectionLabel({ children, mt }) {
  return (
    <div style={{
      fontSize: 9, fontWeight: 700, letterSpacing: '0.16em',
      color: 'var(--t-text-faint)', textTransform: 'uppercase',
      fontFamily: 'var(--font-mono, monospace)',
      marginBottom: 10, marginTop: mt || 0,
      paddingBottom: 6, borderBottom: '1px solid var(--t-line)',
    }}>
      {children}
    </div>
  )
}

// ─── Label style helper ─────────────────────────────────────────────────────────

function fieldLabel(text) {
  return (
    <label style={{
      display: 'block', fontSize: 10, fontWeight: 700, letterSpacing: '0.1em',
      textTransform: 'uppercase', color: 'var(--t-text-muted)',
      fontFamily: 'var(--font-mono, monospace)', marginBottom: 5,
    }}>
      {text}
    </label>
  )
}

// ─── Reaction Button ────────────────────────────────────────────────────────────

function ReactionBtn({ emoji, count, onReact }) {
  return (
    <button
      onClick={onReact}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        background: 'transparent', border: '1px solid var(--t-line)',
        color: 'var(--t-text-muted)', fontSize: 11, padding: '2px 7px',
        cursor: 'pointer', borderRadius: 0, fontFamily: 'var(--font-mono, monospace)',
      }}
    >
      <span style={{ fontSize: 13 }}>{emoji}</span>
      <span style={{ fontWeight: 700, color: 'var(--t-text-faint)' }}>{count}</span>
    </button>
  )
}

// ─── Compliment Card ────────────────────────────────────────────────────────────

function ComplimentCard({ c, myId, onReact }) {
  const color = catColor(c.category)
  const isToMe = c.recipient_id === myId
  return (
    <div style={{
      padding: '14px 16px', marginBottom: 8,
      background: 'var(--t-surface)', border: `1px solid var(--t-line)`,
      borderLeft: `3px solid ${color}`, position: 'relative',
    }}>
      {isToMe && (
        <div style={{
          position: 'absolute', top: 10, right: 12,
          fontSize: 9, fontWeight: 700, letterSpacing: '0.1em',
          textTransform: 'uppercase', color: 'var(--t-accent)',
          fontFamily: 'var(--font-mono, monospace)',
        }}>
          FOR YOU
        </div>
      )}
      {c.is_customer_sourced && (
        <div style={{
          position: 'absolute', top: isToMe ? 24 : 10, right: 12,
          fontSize: 9, fontWeight: 700, letterSpacing: '0.08em',
          color: '#ffb800', fontFamily: 'var(--font-mono, monospace)',
        }}>
          CUST. SOURCED
        </div>
      )}

      <div style={{ display: 'flex', gap: 11, alignItems: 'flex-start' }}>
        <Avatar name={c.sender_name} size={34} color={color} />
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Sender → Recipient */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 5 }}>
            <span style={{ fontWeight: 700, color: 'var(--t-text)', fontSize: 12 }}>{c.sender_name}</span>
            <span style={{ color: 'var(--t-text-faint)', fontSize: 11 }}>→</span>
            <span style={{ fontWeight: 700, color, fontSize: 12 }}>{c.recipient_name}</span>
            <CatBadge category={c.category} small />
            {c.visibility !== 'public' && (
              <span style={{
                fontSize: 9, fontWeight: 700, letterSpacing: '0.08em',
                color: 'var(--t-text-faint)', fontFamily: 'var(--font-mono, monospace)',
                background: 'var(--t-surface-2, #111827)', padding: '1px 5px',
              }}>
                {c.visibility === 'private' ? 'PRIVATE' : 'MGR ONLY'}
              </span>
            )}
          </div>

          {/* Message */}
          <div style={{ fontSize: 12, color: 'var(--t-text-muted)', lineHeight: 1.6, marginBottom: c.customer_quote ? 6 : 8 }}>
            "{c.message}"
          </div>

          {/* Customer Quote */}
          {c.customer_quote && (
            <div style={{
              fontSize: 11, color: '#ffb800', fontStyle: 'italic',
              lineHeight: 1.5, marginBottom: 8,
              borderLeft: '2px solid #ffb80044', paddingLeft: 8,
            }}>
              {c.customer_quote}
            </div>
          )}

          {/* Footer: date + location + reactions */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 10, color: 'var(--t-text-faint)', fontFamily: 'var(--font-mono, monospace)' }}>
                {fmtDate(c.created_at)}
              </span>
              {c.recipient_loc && (
                <span style={{ fontSize: 9, color: 'var(--t-text-faint)', fontFamily: 'var(--font-mono, monospace)' }}>
                  · {c.recipient_loc}
                </span>
              )}
              <span style={{ fontSize: 9, color, fontFamily: 'var(--font-mono, monospace)' }}>
                +{c.points}pts
              </span>
            </div>
            {c.reactions && (
              <div style={{ display: 'flex', gap: 4 }}>
                <ReactionBtn emoji="👏" count={c.reactions.clap}  onReact={() => onReact && onReact(c.id, 'clap')}  />
                <ReactionBtn emoji="❤️" count={c.reactions.heart} onReact={() => onReact && onReact(c.id, 'heart')} />
                <ReactionBtn emoji="⭐" count={c.reactions.star}  onReact={() => onReact && onReact(c.id, 'star')}  />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Mini Bar Chart ─────────────────────────────────────────────────────────────

function BarChart({ data, color, maxVal }) {
  const max = maxVal || Math.max(...data.map(d => d.value), 1)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {data.map((d, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 90, fontSize: 11, fontWeight: 600, color: 'var(--t-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexShrink: 0 }}>
            {d.label}
          </div>
          <div style={{ flex: 1, height: 14, background: 'var(--t-line)', position: 'relative', overflow: 'hidden' }}>
            <div style={{
              position: 'absolute', left: 0, top: 0, bottom: 0,
              width: `${Math.round((d.value / max) * 100)}%`,
              background: color || 'var(--t-accent)',
              transition: 'width 0.5s ease',
            }} />
          </div>
          <div style={{ width: 24, textAlign: 'right', fontSize: 11, fontWeight: 800, color: color || 'var(--t-accent)', fontFamily: 'var(--font-mono, monospace)', flexShrink: 0 }}>
            {d.value}
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Pending Approval Queue (manager only) ───────────────────────────────────────

function PendingQueue({ pending, onApprove, onReject }) {
  if (pending.length === 0) return null

  return (
    <div style={{
      background: 'var(--t-surface)', border: '1px solid var(--t-warn)',
      borderTop: '3px solid var(--t-warn)', marginBottom: 16,
    }}>
      <div style={{
        padding: '10px 16px', borderBottom: '1px solid var(--t-line)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.16em', color: 'var(--t-warn)', textTransform: 'uppercase', fontFamily: 'var(--font-mono, monospace)' }}>
            Pending Approval
          </span>
          <span style={{
            background: 'var(--t-warn)', color: '#070b14', fontSize: 9, fontWeight: 800,
            padding: '1px 6px', fontFamily: 'var(--font-mono, monospace)',
          }}>
            {pending.length}
          </span>
        </div>
        <span style={{ fontSize: 9, color: 'var(--t-text-faint)', fontFamily: 'var(--font-mono, monospace)' }}>
          MANAGER VIEW ONLY
        </span>
      </div>
      <div style={{ padding: '10px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {pending.map(c => {
          const color = catColor(c.category)
          return (
            <div key={c.id} style={{
              background: '#070b14', border: `1px solid var(--t-line)`,
              borderLeft: `3px solid var(--t-warn)`, padding: '12px 14px',
            }}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <Avatar name={c.sender_name} size={30} color={color} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 4 }}>
                    <span style={{ fontWeight: 700, color: 'var(--t-text)', fontSize: 11 }}>{c.sender_name}</span>
                    <span style={{ color: 'var(--t-text-faint)', fontSize: 10 }}>→</span>
                    <span style={{ fontWeight: 700, color, fontSize: 11 }}>{c.recipient_name}</span>
                    <CatBadge category={c.category} small />
                    <span style={{ fontSize: 9, color: 'var(--t-text-faint)', fontFamily: 'var(--font-mono, monospace)' }}>{fmtDate(c.created_at)}</span>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--t-text-muted)', lineHeight: 1.5, marginBottom: 8 }}>
                    "{c.message}"
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      onClick={() => onApprove(c.id)}
                      style={{
                        background: 'var(--t-success, #00ff41)22', border: '1px solid var(--t-success, #00ff41)',
                        color: 'var(--t-success, #00ff41)', padding: '4px 14px',
                        fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
                        cursor: 'pointer', fontFamily: 'var(--font-mono, monospace)', borderRadius: 0,
                      }}
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => onReject(c.id)}
                      style={{
                        background: 'var(--t-danger)22', border: '1px solid var(--t-danger)',
                        color: 'var(--t-danger)', padding: '4px 14px',
                        fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
                        cursor: 'pointer', fontFamily: 'var(--font-mono, monospace)', borderRadius: 0,
                      }}
                    >
                      Reject
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Admin Controls Panel (manager only) ────────────────────────────────────────

function AdminControls({ settings, onSettingsChange, employees }) {
  const [banTarget, setBanTarget] = useState('')

  const toggle = (field) => {
    const next = { ...settings, [field]: !settings[field] }
    onSettingsChange(next)
  }

  const handleBan = () => {
    if (!banTarget) return
    if (settings.bannedIds.includes(banTarget)) return
    const next = { ...settings, bannedIds: [...settings.bannedIds, banTarget] }
    onSettingsChange(next)
    setBanTarget('')
  }

  const handleUnban = (id) => {
    const next = { ...settings, bannedIds: settings.bannedIds.filter(x => x !== id) }
    onSettingsChange(next)
  }

  const bannedEmployees = employees.filter(e => settings.bannedIds.includes(e.id))

  const ToggleRow = ({ label, field, description }) => {
    const on = settings[field]
    return (
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, padding: '12px 0', borderBottom: '1px solid var(--t-line)' }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--t-text)', marginBottom: 3 }}>{label}</div>
          {description && <div style={{ fontSize: 10, color: 'var(--t-text-faint)' }}>{description}</div>}
        </div>
        <button
          onClick={() => toggle(field)}
          style={{
            flexShrink: 0, width: 52, height: 26,
            background: on ? 'var(--t-success, #00ff41)22' : 'var(--t-line)',
            border: `1px solid ${on ? 'var(--t-success, #00ff41)' : 'var(--t-line)'}`,
            cursor: 'pointer', borderRadius: 0, position: 'relative', transition: 'all 0.15s',
            display: 'flex', alignItems: 'center', padding: '0 3px',
          }}
        >
          <div style={{
            width: 18, height: 18,
            background: on ? 'var(--t-success, #00ff41)' : 'var(--t-text-muted)',
            marginLeft: on ? 'auto' : 0, transition: 'all 0.15s',
          }} />
        </button>
      </div>
    )
  }

  return (
    <div style={{
      background: 'var(--t-surface)', border: '1px solid var(--t-line)',
      borderTop: '3px solid var(--t-accent)', marginBottom: 16,
    }}>
      <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--t-line)', display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.16em', color: 'var(--t-accent)', textTransform: 'uppercase', fontFamily: 'var(--font-mono, monospace)' }}>
          Admin Controls
        </span>
        <span style={{ fontSize: 9, color: 'var(--t-text-faint)', fontFamily: 'var(--font-mono, monospace)' }}>
          MANAGER VIEW ONLY
        </span>
      </div>
      <div style={{ padding: '4px 16px 16px' }}>
        <ToggleRow
          label="Compliments System"
          field="systemEnabled"
          description="When off, all submissions are blocked and the board shows a paused message."
        />
        <ToggleRow
          label="Associate Submissions"
          field="associatesCanSubmit"
          description="When off, only Key Holders and above can submit compliments."
        />

        {/* Ban list */}
        <div style={{ paddingTop: 14 }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', color: 'var(--t-text-muted)', textTransform: 'uppercase', fontFamily: 'var(--font-mono, monospace)', marginBottom: 10 }}>
            Individual Restriction List
          </div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <select
              value={banTarget}
              onChange={e => setBanTarget(e.target.value)}
              style={{
                flex: 1, background: '#070b14', border: '1px solid var(--t-line)',
                color: 'var(--t-text)', padding: '7px 10px', fontSize: 11,
                outline: 'none', borderRadius: 0,
              }}
            >
              <option value="">— Select employee to restrict —</option>
              {employees.filter(e => !settings.bannedIds.includes(e.id)).map(e => (
                <option key={e.id} value={e.id}>{e.full_name} · {e.location}</option>
              ))}
            </select>
            <button
              onClick={handleBan}
              disabled={!banTarget}
              style={{
                background: banTarget ? 'var(--t-danger)22' : 'transparent',
                border: `1px solid ${banTarget ? 'var(--t-danger)' : 'var(--t-line)'}`,
                color: banTarget ? 'var(--t-danger)' : 'var(--t-text-faint)',
                padding: '7px 16px', fontSize: 10, fontWeight: 700, letterSpacing: '0.1em',
                textTransform: 'uppercase', cursor: banTarget ? 'pointer' : 'not-allowed',
                fontFamily: 'var(--font-mono, monospace)', borderRadius: 0,
              }}
            >
              Restrict
            </button>
          </div>
          {bannedEmployees.length === 0 ? (
            <div style={{ fontSize: 11, color: 'var(--t-text-faint)', fontStyle: 'italic' }}>No employees currently restricted.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {bannedEmployees.map(e => (
                <div key={e.id} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  background: '#070b14', border: '1px solid var(--t-danger)44',
                  padding: '7px 12px',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Avatar name={e.full_name} size={22} color="var(--t-danger)" />
                    <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--t-text)' }}>{e.full_name}</span>
                    <span style={{ fontSize: 9, color: 'var(--t-text-faint)', fontFamily: 'var(--font-mono, monospace)' }}>{e.location}</span>
                  </div>
                  <button
                    onClick={() => handleUnban(e.id)}
                    style={{
                      background: 'transparent', border: '1px solid var(--t-line)',
                      color: 'var(--t-text-muted)', padding: '3px 10px',
                      fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
                      cursor: 'pointer', fontFamily: 'var(--font-mono, monospace)', borderRadius: 0,
                    }}
                  >
                    Unrestrict
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Tab: Feed ──────────────────────────────────────────────────────────────────

function TabFeed({ compliments, myId, onReact, systemEnabled, isManager, onApprove, onReject, locations }) {
  const [filterCat,  setFilterCat]  = useState('All')
  const [filterLoc,  setFilterLoc]  = useState('All')
  const [filterDays, setFilterDays] = useState('90')

  const select = (val, setter) => ({
    value: val,
    onChange: e => setter(e.target.value),
    style: {
      background: '#070b14', border: '1px solid var(--t-line)',
      color: 'var(--t-text)', padding: '5px 8px', fontSize: 11,
      outline: 'none', borderRadius: 0, marginRight: 6,
    },
  })

  const pending  = compliments.filter(c => c.status === 'pending')
  const approved = compliments.filter(c => c.status !== 'pending' && c.status !== 'rejected')

  const cutoff = new Date(Date.now() - Number(filterDays) * 86400000)

  const filtered = approved.filter(c => {
    if (filterCat !== 'All' && c.category !== filterCat) return false
    if (filterLoc !== 'All' && c.recipient_loc !== filterLoc) return false
    if (new Date(c.created_at) < cutoff) return false
    return true
  })

  if (!systemEnabled) {
    return (
      <div style={{
        background: 'var(--t-surface)', border: '1px solid var(--t-warn)',
        padding: '32px 24px', textAlign: 'center',
      }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--t-warn)', marginBottom: 8 }}>
          Compliments Paused
        </div>
        <div style={{ fontSize: 12, color: 'var(--t-text-muted)' }}>
          Compliments paused by management. Please check back later.
        </div>
      </div>
    )
  }

  return (
    <div>
      {/* Pending queue — manager only */}
      {isManager && pending.length > 0 && (
        <PendingQueue pending={pending} onApprove={onApprove} onReject={onReject} />
      )}

      {/* Filter bar */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginBottom: 14 }}>
        <select {...select(filterCat, setFilterCat)}>
          <option value="All">All Categories</option>
          {CATEGORIES.map(c => <option key={c.key} value={c.key}>{c.key}</option>)}
        </select>
        <select {...select(filterLoc, setFilterLoc)}>
          <option value="All">All Locations</option>
          {locations.map(l => <option key={l} value={l}>{l}</option>)}
        </select>
        <select {...select(filterDays, setFilterDays)}>
          <option value="7">Last 7 days</option>
          <option value="30">Last 30 days</option>
          <option value="60">Last 60 days</option>
          <option value="90">Last 90 days</option>
        </select>
        <span style={{ fontSize: 10, color: 'var(--t-text-faint)', fontFamily: 'var(--font-mono, monospace)' }}>
          {filtered.length} result{filtered.length !== 1 ? 's' : ''}
        </span>
      </div>

      {filtered.length === 0 ? (
        <div style={{ color: 'var(--t-text-faint)', fontSize: 12, padding: '30px 0', textAlign: 'center' }}>
          No compliments match current filters.
        </div>
      ) : (
        filtered.map(c => (
          <ComplimentCard key={c.id} c={c} myId={myId} onReact={onReact} />
        ))
      )}
    </div>
  )
}

// ─── Tab: Send Compliment ───────────────────────────────────────────────────────

function TabSend({ employees, myId, myName, onSend, sending, recentSent, systemEnabled, isBanned, associatesBlocked }) {
  const [toId,       setToId]       = useState('')
  const [category,   setCategory]   = useState('')
  const [message,    setMessage]    = useState('')
  const [visibility, setVisibility] = useState('public')
  const [custFeedback, setCustFeedback] = useState('')
  const [err,        setErr]        = useState('')
  const [success,    setSuccess]    = useState(false)

  const recipients = employees.filter(e => e.id !== myId)

  const handleSend = async () => {
    if (!toId)           { setErr('Select a recipient.'); return }
    if (!category)       { setErr('Choose a category.'); return }
    if (!message.trim()) { setErr('Write a message.'); return }
    setErr('')
    const ok = await onSend({ to_id: toId, category, message: message.trim(), visibility, customer_feedback: custFeedback.trim() })
    if (ok) {
      setSuccess(true)
      setToId(''); setCategory(''); setMessage(''); setVisibility('public'); setCustFeedback('')
      setTimeout(() => setSuccess(false), 4000)
    }
  }

  const selStyle = {
    width: '100%', background: '#070b14', border: '1px solid var(--t-line)',
    color: 'var(--t-text)', padding: '8px 10px', fontSize: 12,
    outline: 'none', borderRadius: 0,
  }

  const taStyle = {
    ...selStyle, lineHeight: 1.5, resize: 'vertical', fontFamily: 'inherit',
    boxSizing: 'border-box',
  }

  // Block send if system is off or user is banned
  if (!systemEnabled) {
    return (
      <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-warn)', borderTop: '2px solid var(--t-warn)', padding: '32px 24px', textAlign: 'center', marginBottom: 20 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--t-warn)', marginBottom: 8 }}>Compliments Paused</div>
        <div style={{ fontSize: 12, color: 'var(--t-text-muted)' }}>Compliments paused by management. Please check back later.</div>
      </div>
    )
  }

  if (isBanned) {
    return (
      <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-danger)', borderTop: '2px solid var(--t-danger)', padding: '32px 24px', textAlign: 'center', marginBottom: 20 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--t-danger)', marginBottom: 8 }}>Submission Restricted</div>
        <div style={{ fontSize: 12, color: 'var(--t-text-muted)' }}>You are currently restricted from sending compliments. Please speak with your manager.</div>
      </div>
    )
  }

  if (associatesBlocked) {
    return (
      <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-warn)', borderTop: '2px solid var(--t-warn)', padding: '32px 24px', textAlign: 'center', marginBottom: 20 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--t-warn)', marginBottom: 8 }}>Associate Submissions Off</div>
        <div style={{ fontSize: 12, color: 'var(--t-text-muted)' }}>Only Key Holders and above can submit compliments right now. Please see your manager.</div>
      </div>
    )
  }

  return (
    <div>
      {/* Form */}
      <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', borderTop: '2px solid var(--t-accent)', padding: '20px 20px 16px', marginBottom: 20 }}>
        <SectionLabel>Send a Compliment</SectionLabel>

        <div style={{ background: 'var(--t-warn)18', border: '1px solid var(--t-warn)44', color: 'var(--t-warn)', padding: '8px 12px', fontSize: 11, marginBottom: 14 }}>
          Compliments are reviewed by management before appearing on the board.
        </div>

        {success && (
          <div style={{ background: 'var(--t-success, #00ff41)22', border: '1px solid var(--t-success, #00ff41)', color: 'var(--t-success, #00ff41)', padding: '10px 14px', fontSize: 12, fontWeight: 600, marginBottom: 14 }}>
            Compliment submitted for review. A manager will approve it shortly.
          </div>
        )}

        {/* Recipient */}
        <div style={{ marginBottom: 12 }}>
          {fieldLabel('Recipient')}
          <select value={toId} onChange={e => setToId(e.target.value)} style={selStyle}>
            <option value="">— Select employee —</option>
            {recipients.map(e => (
              <option key={e.id} value={e.id}>{e.full_name} · {e.location}</option>
            ))}
          </select>
        </div>

        {/* Category chips */}
        <div style={{ marginBottom: 12 }}>
          {fieldLabel('Category')}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {CATEGORIES.map(cat => (
              <button
                key={cat.key}
                onClick={() => setCategory(cat.key)}
                style={{
                  padding: '5px 10px',
                  background: category === cat.key ? `${catColorResolved(cat.key)}22` : 'transparent',
                  border: `1px solid ${category === cat.key ? catColorResolved(cat.key) : 'var(--t-line)'}`,
                  color: category === cat.key ? cat.color : 'var(--t-text-muted)',
                  fontSize: 10, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase',
                  cursor: 'pointer', fontFamily: 'var(--font-mono, monospace)', borderRadius: 0,
                }}
              >
                {cat.key}
              </button>
            ))}
          </div>
        </div>

        {/* Message */}
        <div style={{ marginBottom: 12 }}>
          {fieldLabel('Message')}
          <textarea
            value={message}
            onChange={e => setMessage(e.target.value)}
            placeholder="Describe what they did that deserves recognition…"
            rows={3}
            style={taStyle}
          />
          <div style={{ fontSize: 10, color: message.length > 400 ? 'var(--t-danger)' : 'var(--t-text-faint)', fontFamily: 'var(--font-mono, monospace)', marginTop: 3, textAlign: 'right' }}>
            {message.length}/500
          </div>
        </div>

        {/* Visibility */}
        <div style={{ marginBottom: 12 }}>
          {fieldLabel('Visibility')}
          <div style={{ display: 'flex', gap: 6 }}>
            {[['public','Public'], ['private','Private'], ['manager-only','Manager Only']].map(([val, lbl]) => (
              <button
                key={val}
                onClick={() => setVisibility(val)}
                style={{
                  padding: '5px 10px',
                  background: visibility === val ? '#00e5ff22' : 'transparent',
                  border: `1px solid ${visibility === val ? 'var(--t-accent)' : 'var(--t-line)'}`,
                  color: visibility === val ? 'var(--t-accent)' : 'var(--t-text-muted)',
                  fontSize: 10, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase',
                  cursor: 'pointer', fontFamily: 'var(--font-mono, monospace)', borderRadius: 0,
                }}
              >
                {lbl}
              </button>
            ))}
          </div>
        </div>

        {/* Customer feedback */}
        <div style={{ marginBottom: 14 }}>
          {fieldLabel('Attach Customer Feedback (optional)')}
          <textarea
            value={custFeedback}
            onChange={e => setCustFeedback(e.target.value)}
            placeholder='e.g. "They asked for this associate by name on a Google review…"'
            rows={2}
            style={taStyle}
          />
        </div>

        {err && (
          <div style={{ color: 'var(--t-danger)', fontSize: 11, marginBottom: 10, fontWeight: 600 }}>{err}</div>
        )}

        <button
          onClick={handleSend}
          disabled={sending}
          style={{
            background: sending ? 'transparent' : '#00e5ff18',
            border: `1px solid ${sending ? 'var(--t-line)' : 'var(--t-accent)'}`,
            color: sending ? 'var(--t-text-muted)' : 'var(--t-accent)',
            padding: '9px 22px', fontSize: 11, fontWeight: 700, letterSpacing: '0.1em',
            textTransform: 'uppercase', cursor: sending ? 'not-allowed' : 'pointer',
            fontFamily: 'var(--font-mono, monospace)', borderRadius: 0,
          }}
        >
          {sending ? 'Submitting…' : 'Submit for Approval'}
        </button>
      </div>

      {/* Recent sent */}
      {recentSent.length > 0 && (
        <>
          <SectionLabel>Recently Sent</SectionLabel>
          {recentSent.slice(0, 5).map(c => (
            <ComplimentCard key={c.id} c={c} myId={myId} />
          ))}
        </>
      )}
    </div>
  )
}

// ─── Tab: My Recognition ────────────────────────────────────────────────────────

function TabMine({ compliments, myId }) {
  const received = compliments.filter(c => c.recipient_id === myId && c.status !== 'rejected')
  const given    = compliments.filter(c => c.from_id === myId)

  const totalPts = received.filter(c => c.status === 'approved').reduce((s, c) => s + (c.points || 0), 0)

  const cm = currentMonth()
  const monthPts = received
    .filter(c => monthOf(c.created_at) === cm && c.status === 'approved')
    .reduce((s, c) => s + (c.points || 0), 0)

  const catBreakdown = CATEGORIES.map(cat => ({
    label: cat.key,
    value: received.filter(c => c.category === cat.key && c.status === 'approved').length,
    color: cat.color,
  })).filter(d => d.value > 0).sort((a, b) => b.value - a.value)

  // Monthly totals (last 3 months)
  const monthlyMap = {}
  received.filter(c => c.status === 'approved').forEach(c => {
    const m = monthOf(c.created_at)
    monthlyMap[m] = (monthlyMap[m] || 0) + 1
  })
  const monthlyArr = Object.entries(monthlyMap)
    .sort((a, b) => b[0].localeCompare(a[0]))
    .slice(0, 3)
    .map(([m, n]) => {
      const [yr, mo] = m.split('-')
      const label = new Date(Number(yr), Number(mo) - 1, 1).toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
      return { label, value: n }
    })
    .reverse()

  const approvedReceived = received.filter(c => c.status === 'approved')

  return (
    <div>
      {/* Summary KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 1, marginBottom: 16, borderBottom: '1px solid var(--t-line)' }}>
        {[
          { label: 'Total Received',  value: approvedReceived.length, color: 'var(--t-success)' },
          { label: 'Total Points',    value: totalPts,                 color: 'var(--t-accent)' },
          { label: 'This Month Pts',  value: monthPts,                 color: '#ffb800' },
        ].map(k => (
          <div key={k.label} style={{ padding: '12px 14px', background: 'var(--t-surface)', borderRight: '1px solid var(--t-line)' }}>
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', color: 'var(--t-text-faint)', textTransform: 'uppercase', fontFamily: 'var(--font-mono, monospace)', marginBottom: 4 }}>{k.label}</div>
            <div style={{ fontSize: 22, fontWeight: 900, color: k.color, fontFamily: 'var(--font-mono, monospace)' }}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* Monthly trend */}
      {monthlyArr.length > 0 && (
        <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', padding: '14px 16px', marginBottom: 16 }}>
          <SectionLabel>Monthly Received</SectionLabel>
          <BarChart data={monthlyArr} color="var(--t-success)" />
        </div>
      )}

      {/* Category breakdown */}
      {catBreakdown.length > 0 && (
        <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', padding: '14px 16px', marginBottom: 16 }}>
          <SectionLabel>Received by Category</SectionLabel>
          {catBreakdown.map(d => {
            const pct = approvedReceived.length ? Math.round((d.value / approvedReceived.length) * 100) : 0
            return (
              <div key={d.label} style={{ marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <CatBadge category={d.label} small />
                  <span style={{ fontSize: 10, fontWeight: 700, color: d.color, fontFamily: 'var(--font-mono, monospace)' }}>{d.value} ({pct}%)</span>
                </div>
                <div style={{ height: 3, background: 'var(--t-line)', position: 'relative', overflow: 'hidden' }}>
                  <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: `${pct}%`, background: d.color }} />
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Timeline — received */}
      <SectionLabel>Received ({approvedReceived.length})</SectionLabel>
      {approvedReceived.length === 0 ? (
        <div style={{ color: 'var(--t-text-faint)', fontSize: 12, padding: '16px 0 20px', textAlign: 'center' }}>No compliments received yet.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          {approvedReceived.map((c, i) => (
            <div key={c.id} style={{ display: 'flex', gap: 12, marginBottom: 8 }}>
              {/* Timeline line */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: catColorResolved(c.category), flexShrink: 0, marginTop: 4 }} />
                {i < approvedReceived.length - 1 && <div style={{ width: 1, flex: 1, background: 'var(--t-line)', marginTop: 3 }} />}
              </div>
              <div style={{ flex: 1, paddingBottom: 12 }}>
                <ComplimentCard c={c} myId={myId} />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Given */}
      <SectionLabel mt={16}>Given ({given.length})</SectionLabel>
      {given.length === 0 ? (
        <div style={{ color: 'var(--t-text-faint)', fontSize: 12, padding: '16px 0', textAlign: 'center' }}>You haven't sent any compliments yet.</div>
      ) : (
        given.map(c => (
          <div key={c.id}>
            <ComplimentCard c={c} myId={myId} />
            {c.status === 'pending' && (
              <div style={{ fontSize: 9, color: 'var(--t-warn)', fontFamily: 'var(--font-mono, monospace)', marginTop: -6, marginBottom: 8, paddingLeft: 4 }}>
                PENDING MANAGER APPROVAL
              </div>
            )}
          </div>
        ))
      )}
    </div>
  )
}

// ─── Tab: Leaderboard & Reports ─────────────────────────────────────────────────

function TabLeaderboard({ compliments, isHR, people, locations }) {
  const cm = currentMonth()
  const pm = prevMonth()

  // Only count approved compliments on leaderboard
  const approved    = compliments.filter(c => c.status !== 'pending' && c.status !== 'rejected')
  const thisMonth   = approved.filter(c => monthOf(c.created_at) === cm)
  const prevMo      = approved.filter(c => monthOf(c.created_at) === pm)

  // Top receivers this month
  const recvMap = {}
  thisMonth.forEach(c => {
    if (!recvMap[c.recipient_id]) recvMap[c.recipient_id] = { name: c.recipient_name, loc: c.recipient_loc, count: 0, cats: {} }
    recvMap[c.recipient_id].count++
    recvMap[c.recipient_id].cats[c.category] = (recvMap[c.recipient_id].cats[c.category] || 0) + 1
  })
  const topReceivers = Object.values(recvMap).sort((a, b) => b.count - a.count).slice(0, 8)

  // Top senders this month
  const sendMap = {}
  thisMonth.forEach(c => {
    if (!sendMap[c.from_id]) sendMap[c.from_id] = { name: c.sender_name, count: 0 }
    sendMap[c.from_id].count++
  })
  const topSenders = Object.values(sendMap).sort((a, b) => b.count - a.count).slice(0, 5)

  // By-category
  const catTotals = CATEGORIES.map(cat => ({
    label: cat.key,
    value: thisMonth.filter(c => c.category === cat.key).length,
    color: cat.color,
  })).sort((a, b) => b.value - a.value)

  // Prior Month Change
  const priorMonthChange = prevMo.length
    ? Math.round(((thisMonth.length - prevMo.length) / prevMo.length) * 100)
    : null

  // By-location culture breakdown
  const locStats = locations.map(loc => {
    const empCount = people.filter(e => e.location === loc).length
    const recv = approved.filter(c => c.recipient_loc === loc)
    const thisMonthLoc = recv.filter(c => monthOf(c.created_at) === cm)
    const topRcv = (() => {
      const m = {}
      recv.forEach(c => { m[c.recipient_name] = (m[c.recipient_name] || 0) + 1 })
      const top = Object.entries(m).sort((a, b) => b[1] - a[1])[0]
      return top ? `${top[0]} (${top[1]})` : '—'
    })()
    const avgPerEmp = empCount ? (thisMonthLoc.length / empCount).toFixed(1) : '0'
    return { loc, total: thisMonthLoc.length, empCount, avgPerEmp, topRcv }
  })

  const medals = ['#ffb800', '#8b949e', '#b87333', '#00e5ff', '#00e5ff', '#00e5ff', '#00e5ff', '#00e5ff']
  const medalLabel = ['1ST', '2ND', '3RD', '4TH', '5TH', '6TH', '7TH', '8TH']

  const exportReport = () => {
    const rows = [['Name', 'Location', 'Compliments (MTD)', 'Top Category']]
    topReceivers.forEach(r => {
      const top = Object.entries(r.cats).sort((a, b) => b[1] - a[1])[0]?.[0] || '—'
      rows.push([r.name, r.loc || '—', r.count, top])
    })
    const csv = rows.map(r => r.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `vip-recognition-${cm}.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div>
      {/* Prior Month Change header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 16 }}>
          <span style={{ fontSize: 11, color: 'var(--t-text-muted)' }}>
            This month: <strong style={{ color: 'var(--t-accent)' }}>{thisMonth.length}</strong>
          </span>
          {priorMonthChange !== null && (
            <span style={{ fontSize: 11, color: priorMonthChange >= 0 ? 'var(--t-success)' : 'var(--t-danger)', fontWeight: 700 }}>
              {priorMonthChange >= 0 ? '▲' : '▼'} {Math.abs(priorMonthChange)}% vs. Prior Month
            </span>
          )}
        </div>
        {isHR && (
          <button
            onClick={exportReport}
            style={{
              background: 'transparent', border: '1px solid var(--t-line)',
              color: 'var(--t-text-muted)', padding: '5px 12px',
              fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
              cursor: 'pointer', fontFamily: 'var(--font-mono, monospace)', borderRadius: 0,
            }}
          >
            Export CSV
          </button>
        )}
      </div>

      {/* Top Receivers Bar Chart */}
      <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', borderTop: '2px solid #ffb800', padding: '16px', marginBottom: 12 }}>
        <SectionLabel>Top Receivers — This Month</SectionLabel>
        {topReceivers.length === 0 ? (
          <div style={{ fontSize: 12, color: 'var(--t-text-faint)', textAlign: 'center', padding: '16px 0' }}>No data yet this month.</div>
        ) : (
          <div>
            {topReceivers.map((emp, i) => {
              const topCat = Object.entries(emp.cats).sort((a, b) => b[1] - a[1])[0]?.[0]
              const barPct = Math.round((emp.count / (topReceivers[0]?.count || 1)) * 100)
              return (
                <div key={emp.name + i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: i < topReceivers.length - 1 ? '1px solid var(--t-line)' : 'none' }}>
                  <div style={{ width: 30, textAlign: 'center', fontSize: i < 3 ? 11 : 10, fontWeight: 800, color: medals[i], fontFamily: 'var(--font-mono, monospace)', flexShrink: 0 }}>{medalLabel[i]}</div>
                  <Avatar name={emp.name} size={28} color={medals[i]} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--t-text)', marginBottom: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {emp.name}
                      {emp.loc && <span style={{ fontSize: 9, color: 'var(--t-text-faint)', fontFamily: 'var(--font-mono, monospace)', marginLeft: 6 }}>{emp.loc}</span>}
                    </div>
                    <div style={{ height: 3, background: 'var(--t-line)', position: 'relative', overflow: 'hidden' }}>
                      <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: `${barPct}%`, background: medals[i], transition: 'width 0.6s ease' }} />
                    </div>
                    {topCat && <div style={{ marginTop: 3 }}><CatBadge category={topCat} small /></div>}
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 900, color: medals[i], fontFamily: 'var(--font-mono, monospace)', flexShrink: 0 }}>{emp.count}</div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Top Senders */}
      <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', borderTop: '2px solid #7c4dff', padding: '16px', marginBottom: 12 }}>
        <SectionLabel>Top Senders — This Month</SectionLabel>
        {topSenders.length === 0 ? (
          <div style={{ fontSize: 12, color: 'var(--t-text-faint)', textAlign: 'center', padding: '8px 0' }}>No data yet.</div>
        ) : (
          <BarChart data={topSenders.map(s => ({ label: s.name, value: s.count }))} color="#7c4dff" />
        )}
      </div>

      {/* By Category */}
      <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', padding: '16px', marginBottom: 12 }}>
        <SectionLabel>By Category — This Month</SectionLabel>
        <BarChart data={catTotals.map(d => ({ label: d.label, value: d.value }))} color="var(--t-accent)" />
      </div>

      {/* Location Culture Score Table */}
      <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', padding: '16px', marginBottom: 12 }}>
        <SectionLabel>Location Culture Breakdown — MTD</SectionLabel>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
            <thead>
              <tr style={{ background: 'var(--t-bg, #070b14)' }}>
                {['Location', 'MTD Count', 'Employees', 'Avg/Emp', 'Top Recipient'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '8px 10px', fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', color: 'var(--t-text-muted)', textTransform: 'uppercase', fontFamily: 'var(--font-mono, monospace)', borderBottom: '1px solid var(--t-line)', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {locStats.map((row, i) => (
                <tr key={row.loc} style={{ background: i % 2 === 0 ? 'transparent' : 'var(--t-bg, #070b14)', borderBottom: '1px solid var(--t-line)' }}>
                  <td style={{ padding: '9px 10px', fontWeight: 700, color: 'var(--t-text)' }}>{row.loc}</td>
                  <td style={{ padding: '9px 10px', fontWeight: 800, color: 'var(--t-accent)', fontFamily: 'var(--font-mono, monospace)' }}>{row.total}</td>
                  <td style={{ padding: '9px 10px', color: 'var(--t-text-muted)', fontFamily: 'var(--font-mono, monospace)' }}>{row.empCount}</td>
                  <td style={{ padding: '9px 10px', fontWeight: 700, color: row.avgPerEmp >= 1 ? 'var(--t-success)' : 'var(--t-warn)', fontFamily: 'var(--font-mono, monospace)' }}>{row.avgPerEmp}</td>
                  <td style={{ padding: '9px 10px', color: 'var(--t-text-muted)', fontSize: 10 }}>{row.topRcv}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* HR: All employees all-time */}
      {isHR && (
        <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', padding: '16px' }}>
          <SectionLabel>All Employees — All Time</SectionLabel>
          {(() => {
            const emp = {}
            approved.forEach(c => {
              if (!emp[c.recipient_id]) emp[c.recipient_id] = { name: c.recipient_name, received: 0, given: 0, pts: 0 }
              emp[c.recipient_id].received++
              emp[c.recipient_id].pts += c.points || 0
              if (!emp[c.from_id]) emp[c.from_id] = { name: c.sender_name, received: 0, given: 0, pts: 0 }
              emp[c.from_id].given++
            })
            return Object.values(emp).sort((a, b) => b.received - a.received).map((e, i) => (
              <div key={e.name + i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--t-line)' }}>
                <Avatar name={e.name} size={26} />
                <div style={{ flex: 1, fontSize: 11, fontWeight: 600, color: 'var(--t-text)' }}>{e.name}</div>
                <div style={{ fontSize: 10, color: 'var(--t-text-muted)', fontFamily: 'var(--font-mono, monospace)' }}>
                  <span style={{ color: 'var(--t-success)', fontWeight: 700 }}>{e.received}</span> rcvd ·{' '}
                  <span style={{ color: '#7c4dff', fontWeight: 700 }}>{e.given}</span> sent ·{' '}
                  <span style={{ color: '#ffb800', fontWeight: 700 }}>{e.pts}</span>pts
                </div>
              </div>
            ))
          })()}
        </div>
      )}
    </div>
  )
}

// ─── Forensic KPI Panel ─────────────────────────────────────────────────────────

function KPIPanel({ compliments, loading, people, locations }) {
  const empCount = Math.max(people.length, 1)
  const cm = currentMonth()
  const pm = prevMonth()
  const now = new Date()
  const weekAgo = new Date(now.getTime() - 7 * 86400000)

  // KPI only counts approved
  const approved    = compliments.filter(c => c.status !== 'pending' && c.status !== 'rejected')

  const mtd        = approved.filter(c => monthOf(c.created_at) === cm)
  const prevMtd    = approved.filter(c => monthOf(c.created_at) === pm)
  const thisWeek   = approved.filter(c => new Date(c.created_at) >= weekAgo)

  const uniqueRecip = new Set(mtd.map(c => c.recipient_id)).size
  const uniqueSend  = new Set(mtd.map(c => c.from_id)).size
  const custSrc     = approved.filter(c => c.is_customer_sourced).length
  const totalPts    = approved.reduce((s, c) => s + (c.points || 0), 0)

  // Culture score: avg compliments per employee per month (0–100)
  const cultureScore = Math.min(100, Math.round((mtd.length / empCount) * 20))

  // Highest receiver
  const recvMap = {}
  mtd.forEach(c => { recvMap[c.recipient_id] = { name: c.recipient_name, n: (recvMap[c.recipient_id]?.n || 0) + 1 } })
  const topRecv = Object.values(recvMap).sort((a, b) => b.n - a.n)[0]

  // Most active sender
  const sendMap2 = {}
  mtd.forEach(c => { sendMap2[c.from_id] = { name: c.sender_name, n: (sendMap2[c.from_id]?.n || 0) + 1 } })
  const topSend = Object.values(sendMap2).sort((a, b) => b.n - a.n)[0]

  // Best category
  const catMap2 = {}
  mtd.forEach(c => { catMap2[c.category] = (catMap2[c.category] || 0) + 1 })
  const bestCat = Object.entries(catMap2).sort((a, b) => b[1] - a[1])[0]

  // Avg per employee
  const avgPerEmp = mtd.length > 0 ? (mtd.length / empCount).toFixed(1) : '0'

  // Prior Month Change
  const priorMonthPct = prevMtd.length
    ? Math.round(((mtd.length - prevMtd.length) / prevMtd.length) * 100)
    : null

  const v = s => loading ? '—' : s

  // ── Drill-down: expose the real compliment records behind each KPI tile ───────
  const [drill, setDrill] = useState(null)
  const COMP_COLS = [
    { key: 'sender_name',    label: 'From',      value: c => c.sender_name },
    { key: 'recipient_name', label: 'To',        value: c => c.recipient_name },
    { key: 'category',       label: 'Category',  value: c => c.category },
    { key: 'recipient_loc',  label: 'Location',  value: c => c.recipient_loc },
    { key: 'points',         label: 'Points',    value: c => `+${c.points || 0}`, align: 'right', sortKey: c => c.points || 0 },
    { key: 'is_customer_sourced', label: 'Source', value: c => (c.is_customer_sourced ? 'Customer' : 'Internal') },
    { key: 'created_at',     label: 'Date',      value: c => fmtDate(c.created_at), sortKey: c => c.created_at },
  ]
  const openDrill = (title, rows, accent) => setDrill({
    title, subtitle: `${rows.length} record${rows.length === 1 ? '' : 's'}`, columns: COMP_COLS, rows, accent,
  })
  const topRecvId = Object.keys(recvMap).sort((a, b) => (recvMap[b]?.n || 0) - (recvMap[a]?.n || 0))[0]
  const topSendId = Object.keys(sendMap2).sort((a, b) => (sendMap2[b]?.n || 0) - (sendMap2[a]?.n || 0))[0]

  // Row 1
  const row1 = [
    { label: 'Total (MTD)',       value: v(mtd.length),        sub: 'company-wide',         color: 'var(--t-accent)',
      onClick: () => openDrill('Compliments — Month to Date', mtd, 'var(--t-accent)') },
    { label: 'Unique Recipients', value: v(uniqueRecip),        sub: 'employees recognized', color: 'var(--t-success)',
      onClick: () => openDrill('MTD Compliments — Recipients', mtd, 'var(--t-success)') },
    { label: 'Unique Senders',    value: v(uniqueSend),         sub: 'active givers',        color: '#7c4dff',
      onClick: () => openDrill('MTD Compliments — Senders', mtd, '#7c4dff') },
    { label: 'Customer-Sourced',  value: v(custSrc),            sub: 'all time',             color: '#ffb800',
      alert: custSrc === 0 ? 'amber' : undefined,
      onClick: () => openDrill('Customer-Sourced Compliments', approved.filter(c => c.is_customer_sourced), '#ffb800') },
    { label: 'Points Awarded',    value: v(totalPts),           sub: 'all time',             color: 'var(--t-danger)',
      onClick: () => openDrill('Points Awarded — All Approved', approved, 'var(--t-danger)') },
    { label: 'Culture Score',     value: v(`${cultureScore}/100`), sub: 'engagement index',  color: cultureScore >= 60 ? 'var(--t-success)' : 'var(--t-warn)',
      alert: cultureScore < 30 ? 'red' : cultureScore < 50 ? 'amber' : undefined,
      onClick: () => openDrill('Culture Score — MTD Compliments', mtd, cultureScore >= 60 ? 'var(--t-success)' : 'var(--t-warn)') },
  ]

  // Row 2
  const row2 = [
    { label: 'Top Receiver (MTD)', value: v(topRecv ? topRecv.name.split(' ')[0] : '—'), sub: topRecv ? `${topRecv.n} compliments` : 'no data', color: '#ffb800', wide: true,
      onClick: () => openDrill(`Top Receiver — ${topRecv?.name || 'N/A'}`, mtd.filter(c => c.recipient_id === topRecvId), '#ffb800') },
    { label: 'Most Active Sender', value: v(topSend ? topSend.name.split(' ')[0] : '—'), sub: topSend ? `${topSend.n} sent` : 'no data',        color: '#7c4dff', wide: true,
      onClick: () => openDrill(`Most Active Sender — ${topSend?.name || 'N/A'}`, mtd.filter(c => c.from_id === topSendId), '#7c4dff') },
    { label: 'Best Category',      value: v(bestCat ? bestCat[0] : '—'),                  sub: bestCat ? `${bestCat[1]} this month` : 'no data', color: catColor(bestCat?.[0] || ''), wide: true,
      onClick: () => openDrill(`Best Category — ${bestCat?.[0] || 'N/A'}`, mtd.filter(c => c.category === bestCat?.[0]), catColorResolved(bestCat?.[0] || '')) },
    { label: 'This Week',          value: v(thisWeek.length),                              sub: 'last 7 days',                                    color: 'var(--t-accent)',
      onClick: () => openDrill('Compliments — Last 7 Days', thisWeek, 'var(--t-accent)') },
    { label: 'Avg / Employee',     value: v(avgPerEmp),                                    sub: 'compliments per person MTD',                     color: 'var(--t-success)',
      onClick: () => openDrill('Avg / Employee — MTD Compliments', mtd, 'var(--t-success)') },
    { label: 'Prior Month Change',
      value: v(priorMonthPct !== null ? `${priorMonthPct >= 0 ? '+' : ''}${priorMonthPct}%` : '—'),
      sub: 'vs. prior month',
      color: priorMonthPct === null ? 'var(--t-text-muted)' : priorMonthPct >= 0 ? 'var(--t-success)' : 'var(--t-danger)',
      alert: priorMonthPct !== null && priorMonthPct < -20 ? 'red' : priorMonthPct !== null && priorMonthPct < 0 ? 'amber' : undefined,
      onClick: () => openDrill('Prior Month Compliments', prevMtd, priorMonthPct !== null && priorMonthPct < 0 ? 'var(--t-danger)' : 'var(--t-success)') },
  ]

  // Row 3 — location table
  const locRow = locations.map(loc => {
    const locComps = mtd.filter(c => c.recipient_loc === loc)
    const empCount  = people.filter(e => e.location === loc).length
    const avg       = empCount ? (locComps.length / empCount).toFixed(1) : '0'
    const rm = {}
    locComps.forEach(c => { rm[c.recipient_name] = (rm[c.recipient_name] || 0) + 1 })
    const top = Object.entries(rm).sort((a, b) => b[1] - a[1])[0]
    return { loc, count: locComps.length, avg, topRcv: top ? top[0].split(' ')[0] : '—' }
  })

  return (
    <div style={{ borderBottom: '1px solid var(--t-line)' }}>
      {/* Row 1 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: 1, borderBottom: '1px solid var(--t-line)' }}>
        {row1.map(k => <KTile key={k.label} {...k} />)}
      </div>

      {/* Row 2 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: 1, borderBottom: '1px solid var(--t-line)' }}>
        {row2.map(k => <KTile key={k.label} {...k} />)}
      </div>

      {/* Row 3 — location inline table */}
      <div style={{ background: 'var(--t-surface)', padding: '10px 16px', overflowX: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 0, minWidth: 480 }}>
          <div style={{ width: 100, fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', color: 'var(--t-text-faint)', textTransform: 'uppercase', fontFamily: 'var(--font-mono, monospace)' }}>Location</div>
          <div style={{ width: 70, fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', color: 'var(--t-text-faint)', textTransform: 'uppercase', fontFamily: 'var(--font-mono, monospace)' }}>MTD</div>
          <div style={{ width: 80, fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', color: 'var(--t-text-faint)', textTransform: 'uppercase', fontFamily: 'var(--font-mono, monospace)' }}>Avg/Emp</div>
          <div style={{ flex: 1, fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', color: 'var(--t-text-faint)', textTransform: 'uppercase', fontFamily: 'var(--font-mono, monospace)' }}>Top Recipient</div>
        </div>
        {locRow.map((r, i) => (
          <div key={r.loc} style={{ display: 'flex', alignItems: 'center', gap: 0, minWidth: 480, padding: '4px 0', borderTop: i === 0 ? '1px solid var(--t-line)' : 'none', marginTop: i === 0 ? 6 : 0 }}>
            <div style={{ width: 100, fontSize: 11, fontWeight: 700, color: 'var(--t-text)' }}>{r.loc}</div>
            <div style={{ width: 70,  fontSize: 13, fontWeight: 900, color: 'var(--t-accent)', fontFamily: 'var(--font-mono, monospace)' }}>{loading ? '—' : r.count}</div>
            <div style={{ width: 80,  fontSize: 11, fontWeight: 700, color: r.avg >= 1 ? 'var(--t-success)' : 'var(--t-warn)', fontFamily: 'var(--font-mono, monospace)' }}>{loading ? '—' : r.avg}</div>
            <div style={{ flex: 1,    fontSize: 11, color: 'var(--t-text-muted)' }}>{loading ? '—' : r.topRcv}</div>
          </div>
        ))}
      </div>

      <DrillDown open={!!drill} onClose={() => setDrill(null)} {...(drill || {})} />
    </div>
  )
}

// ─── Main Screen ────────────────────────────────────────────────────────────────

export default function Compliments() {
  const { session }     = useAuth()
  const { locationIds } = useScope()

  const myId      = session?.person?.id   || null
  const myName    = session?.person?.full_name || ''
  const roleName  = (session?.person?.role_name || '').toLowerCase()
  const isManager = ['ceo','manager','coo','admin','owner','hr'].some(r => roleName.includes(r))
  // Key Holders and above may still submit when associate submissions are off
  const isKeyholderPlus = isManager || ['key','lead','supervisor','director'].some(r => roleName.includes(r))
  // Legacy alias — HR check is same as manager for export privileges
  const isHR      = isManager

  const [tab,      setTab]      = useState('feed')
  const [feed,     setFeed]     = useState([])
  const [people,   setPeople]   = useState([])
  const [loading,  setLoading]  = useState(true)
  const [sending,  setSending]  = useState(false)
  const [settings, setSettings] = useState(EMPTY_SETTINGS)

  // ── Load ──────────────────────────────────────────────────────────────────────

  const loadFeed = useCallback(async () => {
    setLoading(true)
    try {
      // Visibility is enforced server-side: pass the viewer so private /
      // manager-only compliments are only returned to participants + managers.
      const { data, error } = await sb.rpc('get_compliments', {
        p_node_ids:   locationIds,
        p_viewer_id:  myId,
        p_is_manager: isManager,
      })
      setFeed(!error && Array.isArray(data) ? data.map(c => ({ ...c, status: c.status || 'approved' })) : [])
    } catch {
      setFeed([])
    } finally {
      setLoading(false)
    }
  }, [locationIds.join(','), myId, isManager])  // eslint-disable-line

  const loadPeople = useCallback(async () => {
    try {
      const { data, error } = await sb.rpc('get_roster', { p_node_ids: locationIds })
      setPeople(!error && Array.isArray(data) ? data.map(r => ({
        id:        r.person_id ?? r.id,
        full_name: r.full_name,
        location:  r.node_name ?? r.location ?? '',
      })) : [])
    } catch {
      setPeople([])
    }
  }, [locationIds.join(',')])  // eslint-disable-line

  const loadSettings = useCallback(async () => {
    try {
      const { data, error } = await sb.rpc('get_compliment_settings')
      if (!error && data) {
        setSettings({
          systemEnabled:       data.systemEnabled ?? true,
          associatesCanSubmit: data.associatesCanSubmit ?? true,
          bannedIds:           Array.isArray(data.bannedIds) ? data.bannedIds : [],
        })
      }
    } catch { /* keep current settings */ }
  }, [])

  useEffect(() => { loadFeed()     }, [loadFeed])
  useEffect(() => { loadPeople()   }, [loadPeople])
  useEffect(() => { loadSettings() }, [loadSettings])

  // ── Derived location config (real, from roster + feed) ─────────────────────────

  const locations = useMemo(() => {
    const set = new Set()
    people.forEach(p => { if (p.location) set.add(p.location) })
    feed.forEach(c => { if (c.recipient_loc) set.add(c.recipient_loc) })
    return Array.from(set).sort()
  }, [people, feed])

  // ── Reactions (real toggle write) ──────────────────────────────────────────────

  const handleReact = useCallback(async (cid, kind) => {
    if (!myId) return
    try {
      const { data, error } = await sb.rpc('react_to_compliment', { p_compliment_id: cid, p_person_id: myId, p_kind: kind })
      if (!error && data?.reactions) {
        setFeed(prev => prev.map(c => c.id === cid ? { ...c, reactions: data.reactions } : c))
      }
    } catch { /* toast handled by rpc wrapper */ }
  }, [myId])

  // ── Approval / Rejection (real write, then refresh) ────────────────────────────

  const handleApprove = useCallback(async (cid) => {
    try {
      await sb.rpc('review_compliment', { p_id: cid, p_action: 'approve', p_reviewer_id: myId })
    } finally { loadFeed() }
  }, [myId, loadFeed])

  const handleReject = useCallback(async (cid) => {
    try {
      await sb.rpc('review_compliment', { p_id: cid, p_action: 'reject', p_reviewer_id: myId })
    } finally { loadFeed() }
  }, [myId, loadFeed])

  // ── Settings (real writes, then refresh) ───────────────────────────────────────

  const handleSettingsChange = useCallback(async (next) => {
    const prev = settings
    setSettings(next)  // optimistic
    try {
      if (next.systemEnabled !== prev.systemEnabled || next.associatesCanSubmit !== prev.associatesCanSubmit) {
        await sb.rpc('set_compliment_settings', {
          p_system_enabled:        next.systemEnabled,
          p_associates_can_submit: next.associatesCanSubmit,
          p_actor:                 myId,
        })
      }
      const added   = next.bannedIds.filter(id => !prev.bannedIds.includes(id))
      const removed = prev.bannedIds.filter(id => !next.bannedIds.includes(id))
      for (const id of added)   await sb.rpc('set_compliment_restriction', { p_person_id: id, p_restrict: true,  p_actor: myId })
      for (const id of removed) await sb.rpc('set_compliment_restriction', { p_person_id: id, p_restrict: false, p_actor: myId })
    } finally {
      loadSettings()
    }
  }, [settings, myId, loadSettings])

  // ── Send (real write, then refresh from server) ────────────────────────────────

  const handleSend = async ({ to_id, category, message, visibility, customer_feedback }) => {
    setSending(true)
    try {
      const { data, error } = await sb.rpc('send_compliment', {
        p_from_id:           myId,
        p_to_id:             to_id,
        p_category:          category,
        p_message:           message,
        p_visibility:        visibility,
        p_customer_feedback: customer_feedback || null,
      })
      setSending(false)
      if (error || (data && data.ok === false)) return false
      await loadFeed()
      return true
    } catch {
      setSending(false)
      return false
    }
  }

  // ── Derived ───────────────────────────────────────────────────────────────────

  const recentSent = useMemo(() => feed.filter(c => c.from_id === myId), [feed, myId])
  const isBanned   = settings.bannedIds.includes(myId)

  // ── Render ────────────────────────────────────────────────────────────────────

  const tabBtn = active => ({
    padding: '9px 14px', background: 'none', border: 'none',
    borderBottom: active ? '2px solid var(--t-accent)' : '2px solid transparent',
    color: active ? 'var(--t-accent)' : 'var(--t-text-muted)',
    fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
    cursor: 'pointer', fontFamily: 'var(--font-mono, monospace)', transition: 'all 0.12s',
    whiteSpace: 'nowrap',
  })

  const pendingCount = feed.filter(c => c.status === 'pending').length

  const tabs = [
    { key: 'feed',  label: `Feed (${feed.filter(c => c.status === 'approved').length})` },
    { key: 'send',  label: 'Send Compliment' },
    { key: 'mine',  label: 'My Recognition' },
    { key: 'board', label: 'Leaderboard' },
    ...(isManager ? [{ key: 'admin', label: `Admin${pendingCount > 0 ? ` (${pendingCount})` : ''}` }] : []),
  ]

  return (
    <div style={{ background: '#070b14', minHeight: '100%', color: 'var(--t-text)', fontFamily: 'var(--font-sans, system-ui, sans-serif)' }}>

      {/* Page Header */}
      <div style={{
        padding: '16px 20px 14px', borderBottom: '1px solid var(--t-line)',
        background: 'var(--t-surface)', display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', flexWrap: 'wrap', gap: 10,
      }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--t-text)', letterSpacing: '-0.01em' }}>
            Employee Recognition
          </div>
          <div style={{ fontSize: 10, color: 'var(--t-text-faint)', fontFamily: 'var(--font-mono, monospace)', marginTop: 2 }}>
            Compliments · Culture Score · Leaderboard
          </div>
        </div>
        <button
          onClick={() => setTab('send')}
          style={{
            background: '#00e5ff18', border: '1px solid #00e5ff44', color: 'var(--t-accent)',
            padding: '8px 16px', fontSize: 10, fontWeight: 700, letterSpacing: '0.1em',
            textTransform: 'uppercase', cursor: 'pointer', fontFamily: 'var(--font-mono, monospace)',
            borderRadius: 0,
          }}
        >
          + Send Compliment
        </button>
      </div>

      {/* Forensic KPI Panel */}
      <KPIPanel compliments={feed} loading={loading} people={people} locations={locations} />

      {/* Tab Bar */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--t-line)', background: 'var(--t-surface)', overflowX: 'auto' }}>
        {tabs.map(t => (
          <button key={t.key} style={tabBtn(tab === t.key)} onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div style={{ padding: 16 }}>
        {loading && tab === 'feed' && (
          <div style={{ color: 'var(--t-text-faint)', fontSize: 12, padding: '40px 0', textAlign: 'center', fontFamily: 'var(--font-mono, monospace)' }}>
            Loading…
          </div>
        )}

        {!loading && tab === 'feed' && (
          <TabFeed
            compliments={feed}
            myId={myId}
            onReact={handleReact}
            systemEnabled={settings.systemEnabled}
            isManager={isManager}
            onApprove={handleApprove}
            onReject={handleReject}
            locations={locations}
          />
        )}

        {tab === 'send' && (
          <TabSend
            employees={people}
            myId={myId}
            myName={myName}
            onSend={handleSend}
            sending={sending}
            recentSent={recentSent}
            systemEnabled={settings.systemEnabled}
            isBanned={isBanned}
            associatesBlocked={!settings.associatesCanSubmit && !isKeyholderPlus}
          />
        )}

        {tab === 'mine' && (
          <TabMine compliments={feed} myId={myId} />
        )}

        {tab === 'board' && (
          <TabLeaderboard compliments={feed} isHR={isHR} people={people} locations={locations} />
        )}

        {tab === 'admin' && isManager && (
          <div>
            <AdminControls
              settings={settings}
              onSettingsChange={handleSettingsChange}
              employees={people}
            />
            {feed.filter(c => c.status === 'pending').length > 0 && (
              <>
                <SectionLabel>Pending Approval Queue</SectionLabel>
                <PendingQueue
                  pending={feed.filter(c => c.status === 'pending')}
                  onApprove={handleApprove}
                  onReject={handleReject}
                />
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
