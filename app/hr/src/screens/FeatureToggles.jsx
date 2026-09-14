import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useAuth } from '../lib/auth.jsx'
import { getAllFlags, setFeatureFlag, FEATURE_DEFAULTS, ALL_ROLES as FLAG_ROLES, getFeatureRoles, setFeatureRoles, getFeatureOverrides, setFeatureOverride } from '../lib/featureFlags.js'
import { useScope } from '../lib/scope.jsx'
import { sb } from '../lib/supabase'
import DrillDown from '../components/DrillDown.jsx'

/* ── constants ───────────────────────────────────────────────────── */
const LS_KEY_FLAGS    = 'vip_feature_flags_v2'
const LS_KEY_ROLLOUT  = 'vip_feature_rollout'
const LS_KEY_LOG      = 'vip_feature_audit'

const LOCS  = ['Orange', 'Hartford', 'Manchester', 'Southington', 'Warehouse / Distribution']
const ALL_ROLES = ['Admin/Owner', 'COO', 'HR Manager', 'Store Manager', 'Key Holder', 'Associate']

const FEATURES = [
  // Core Features
  { id: 'ai_ceo',         label: 'AI CEO Assistant',       desc: 'AI-generated proposals, insights, and command center', category: 'AI Features',           defaultOn: true  },
  { id: 'ai_scheduler',   label: 'AI Scheduler',           desc: 'AI-powered schedule optimization and conflict detection', category: 'AI Features',        defaultOn: true  },
  { id: 'ai_design',      label: 'AI Design Assistant',    desc: 'Natural-language UI customization assistant',          category: 'AI Features',           defaultOn: false },
  { id: 'kpi_dashboard',  label: 'KPI Dashboard',          desc: 'Enterprise key performance indicator scorecards',      category: 'Analytics',             defaultOn: true  },
  { id: 'analytics',      label: 'Analytics Suite',        desc: 'Revenue trends, cohort analysis, business intelligence', category: 'Analytics',           defaultOn: true  },
  { id: 'attendance',     label: 'Attendance Forensics',   desc: 'Deep attendance pattern analysis and risk scoring',    category: 'Core Features',         defaultOn: true  },
  { id: 'gamification',   label: 'Gamification',           desc: 'Points, levels, badges, and leaderboard engine',      category: 'Core Features',         defaultOn: true  },
  { id: 'spiffs',         label: 'Spiff Programs',         desc: 'Commission and performance bonus tracking',            category: 'Core Features',         defaultOn: true  },
  { id: 'pipeline',       label: 'Pipeline / CRM',         desc: 'Sales pipeline and customer relationship management', category: 'Core Features',         defaultOn: false },
  { id: 'inventory',      label: 'Inventory Tracking',     desc: 'Real-time stock levels and reorder management',       category: 'Core Features',         defaultOn: true  },
  { id: 'promotions',     label: 'Promotions Manager',     desc: 'Create and manage store promotions and discounts',    category: 'Core Features',         defaultOn: true  },
  { id: 'cultivation',    label: 'Cultivation',            desc: 'Cannabis cultivation dashboard (Twisted Growers only)', category: 'Core Features',       defaultOn: false },
  { id: 'loyalty',        label: 'Customer Loyalty',       desc: 'Points-based customer rewards and retention system',  category: 'Core Features',         defaultOn: false },
  { id: 'academy',        label: 'Academy / LMS',          desc: 'Course catalog, certifications, and training paths',  category: 'Core Features',         defaultOn: true  },
  { id: 'leaderboards',   label: 'Leaderboards',           desc: 'Employee performance ranking boards',                 category: 'Core Features',         defaultOn: true  },
  { id: 'contests',       label: 'Contests',               desc: 'Sales contests and employee challenge system',        category: 'Core Features',         defaultOn: true  },
  { id: 'biometric_clock',label: 'Biometric Time Clock',   desc: 'Fingerprint / facial recognition clock-in support',  category: 'Core Features',         defaultOn: false },
  { id: 'zones',          label: 'Zone Management',        desc: 'Floor zone assignment and break management',          category: 'Core Features',         defaultOn: true  },
  { id: 'direct_deposit', label: 'Direct Deposit Mgmt',    desc: 'Employee banking and deposit configuration',          category: 'Core Features',         defaultOn: true  },
  { id: 'compliments',    label: 'Compliments',            desc: 'Peer recognition and kudos system',                   category: 'Communication Tools',   defaultOn: true  },
  { id: 'merch_store',    label: 'Merch Store',            desc: 'Company merchandise store and ordering',              category: 'Communication Tools',   defaultOn: true  },
  { id: 'broadcasts',     label: 'Broadcasts',             desc: 'Company-wide announcements and push messaging',       category: 'Communication Tools',   defaultOn: true  },
  { id: 'channel_chat',   label: 'Channel Chat',           desc: 'Topic-based team chat channels',                     category: 'Communication Tools',   defaultOn: true  },
  { id: 'shift_market',   label: 'Shift Marketplace',      desc: 'Open shift posting and employee pickup system',       category: 'Communication Tools',   defaultOn: false },
  { id: 'doc_vault',      label: 'Document Vault',         desc: 'Secure HR document storage and management',          category: 'Core Features',         defaultOn: true  },
]

const CATEGORIES = ['Core Features', 'AI Features', 'Analytics', 'Communication Tools', 'Experimental']

/* ── helpers ─────────────────────────────────────────────────────── */
function buildDefaults() {
  const m = {}
  FEATURES.forEach(f => { m[f.id] = f.defaultOn })
  return m
}

function loadLS(key, def) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : def } catch { return def }
}
function saveLS(key, val) { try { localStorage.setItem(key, JSON.stringify(val)) } catch {} }

function now() { return new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) }

/* ── sub-components ──────────────────────────────────────────────── */

function KTile({ label, value, sub, color, alert, onClick }) {
  return (
    <div onClick={onClick} title={onClick ? 'Click to drill into records' : undefined} style={{
      background: 'var(--t-surface)',
      border: `1px solid ${alert === 'red' ? 'var(--t-danger)' : alert === 'amber' ? 'var(--t-warn)' : 'var(--t-line)'}`,
      padding: '14px 16px', position: 'relative', overflow: 'hidden', flex: 1, minWidth: 120,
      cursor: onClick ? 'pointer' : 'default',
    }}>
      {alert === 'red' && <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'var(--t-danger)' }} />}
      {alert === 'amber' && <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'var(--t-warn)' }} />}
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.08em', color: 'var(--t-text-muted)', textTransform: 'uppercase', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800, color: color || 'var(--t-text)', lineHeight: 1, marginBottom: 4 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--t-text-faint)' }}>{sub}</div>}
    </div>
  )
}

function ToggleSwitch({ on, onChange, label, disabled }) {
  return (
    <div
      role="switch"
      aria-checked={on}
      aria-label={label}
      tabIndex={0}
      onClick={disabled ? undefined : onChange}
      onKeyDown={e => { if (!disabled && (e.key === ' ' || e.key === 'Enter')) { e.preventDefault(); onChange() } }}
      style={{ position: 'relative', flexShrink: 0, cursor: disabled ? 'default' : 'pointer', width: 44, height: 24, opacity: disabled ? 0.4 : 1 }}
    >
      <div style={{
        position: 'absolute', inset: 0, borderRadius: 12,
        background: on ? 'var(--t-success)' : 'rgba(120,160,220,.14)',
        border: on ? '1px solid var(--t-success)' : '1px solid var(--t-line)',
        transition: 'background .2s, border-color .2s',
        boxShadow: on ? '0 0 8px rgba(29,233,182,.3)' : 'none',
      }} />
      <div style={{
        position: 'absolute', top: 3, left: on ? 22 : 3, width: 16, height: 16,
        borderRadius: '50%', background: on ? '#03121a' : 'var(--t-text-faint)',
        transition: 'left .2s, background .2s',
      }} />
    </div>
  )
}

function Toast({ message, type, onDone }) {
  useEffect(() => { const t = setTimeout(onDone, 3000); return () => clearTimeout(t) }, [onDone])
  const bg = type === 'success' ? 'rgba(29,233,182,.18)' : type === 'warn' ? 'rgba(255,179,71,.18)' : 'rgba(255,59,48,.18)'
  const border = type === 'success' ? 'rgba(29,233,182,.5)' : type === 'warn' ? 'rgba(255,179,71,.5)' : 'rgba(255,59,48,.5)'
  return (
    <div style={{
      position: 'fixed', bottom: 24, right: 24, zIndex: 9999,
      background: bg, border: `1px solid ${border}`, backdropFilter: 'blur(12px)',
      padding: '12px 20px', fontSize: 13, fontWeight: 600, color: 'var(--t-text)',
      fontFamily: 'inherit', maxWidth: 360, boxShadow: '0 8px 32px rgba(0,0,0,.4)',
    }}>
      {message}
    </div>
  )
}

const CATEGORY_COLOR = {
  'Core Features':        { bg: 'rgba(0,229,255,.1)',   color: 'var(--t-accent)' },
  'AI Features':          { bg: 'rgba(29,233,182,.1)',  color: 'var(--t-success)' },
  'Analytics':            { bg: 'rgba(124,77,255,.1)',  color: '#b39ddb' },
  'Communication Tools':  { bg: 'rgba(255,179,71,.1)',  color: 'var(--t-warn)' },
  'Experimental':         { bg: 'rgba(255,59,48,.1)',   color: 'var(--t-danger)' },
}

/* ── Infra Flag Group (CEO / DM / HR Compliance) ─────────────────── */
function InfraFlagGroup({ title, color, items }) {
  const [infraFlags, setInfraFlags] = useState(() => getAllFlags())

  useEffect(() => {
    const h = () => setInfraFlags(getAllFlags())
    window.addEventListener('vip_flags_changed', h)
    return () => window.removeEventListener('vip_flags_changed', h)
  }, [])

  const enabledCount = items.filter(i => infraFlags[i.key] !== false).length

  return (
    <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', marginBottom: 12 }}>
      <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--t-line)', display: 'flex', alignItems: 'center', gap: 10, background: 'var(--t-surface-2)' }}>
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--t-text-muted)' }}>{title}</span>
        <span style={{ padding: '2px 8px', fontSize: 10, fontWeight: 700, ...color }}>
          {enabledCount}/{items.length} enabled
        </span>
      </div>
      {items.map((item, idx) => {
        const on = infraFlags[item.key] !== false
        const defaultOn = FEATURE_DEFAULTS[item.key] !== false
        const changed = defaultOn !== on
        return (
          <div
            key={item.key}
            style={{
              display: 'flex', alignItems: 'center', gap: 16, padding: '12px 16px',
              borderBottom: idx < items.length - 1 ? '1px solid var(--t-line)' : 'none',
              background: on ? 'transparent' : 'rgba(255,255,255,.012)',
              opacity: on ? 1 : 0.7,
              transition: 'opacity .15s, background .15s',
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--t-text)' }}>{item.label}</span>
                {changed && (
                  <span style={{ fontSize: 10, padding: '1px 6px', background: 'rgba(255,179,71,.15)', color: 'var(--t-warn)', fontWeight: 600 }}>
                    Modified
                  </span>
                )}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
              <span className={on ? 'badge green' : 'badge red'} style={{ fontSize: 10 }}>
                {on ? 'Enabled' : 'Disabled'}
              </span>
              <ToggleSwitch
                on={on}
                label={item.label}
                onChange={() => setFeatureFlag(item.key, !on)}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}

/* ── Tab 1: Feature Flags ────────────────────────────────────────── */
function PersonOverrides({ featId, roster }) {
  const [q, setQ] = useState('')
  const [, tick] = useState(0)
  const ov = getFeatureOverrides(featId)
  const byId = Object.fromEntries((roster || []).map(p => [p.id, p]))
  const set = (pid, mode) => { setFeatureOverride(featId, pid, mode); tick(t => t + 1) }
  const matches = q.trim() ? (roster || []).filter(p => (p.full_name || '').toLowerCase().includes(q.toLowerCase()) && !ov.allow.includes(p.id) && !ov.block.includes(p.id)).slice(0, 6) : []
  const chip = (id, mode) => (
    <span key={mode + id} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700, padding: '2px 4px 2px 8px', border: `1px solid ${mode === 'allow' ? 'var(--t-success)' : 'var(--t-danger)'}`, color: mode === 'allow' ? 'var(--t-success)' : 'var(--t-danger)' }}>
      {mode === 'allow' ? '✓' : '⊘'} {byId[id]?.full_name || 'Employee'}
      <button onClick={() => set(id, 'clear')} style={{ background: 'none', border: 'none', color: 'var(--t-text-muted)', cursor: 'pointer', fontSize: 12, lineHeight: 1 }}>✕</button>
    </span>
  )
  return (
    <div style={{ marginTop: 10, borderTop: '1px dashed var(--t-line)', paddingTop: 10 }}>
      <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--t-text-muted)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 6 }}>Per-person overrides <span style={{ color: 'var(--t-text-faint)', fontWeight: 500, textTransform: 'none' }}>— force a single employee on (Allow) or off (Block)</span></div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
        {ov.allow.map(id => chip(id, 'allow'))}
        {ov.block.map(id => chip(id, 'block'))}
        {!ov.allow.length && !ov.block.length && <span style={{ fontSize: 11, color: 'var(--t-text-faint)' }}>No individual overrides — role rules apply to everyone.</span>}
      </div>
      <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search an employee to Allow / Block…" style={{ width: 280, maxWidth: '100%', background: 'var(--t-surface-2)', border: '1px solid var(--t-line)', color: 'var(--t-text)', padding: '6px 10px', fontSize: 12, outline: 'none' }} />
      {matches.length > 0 && (
        <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 4, maxWidth: 380 }}>
          {matches.map(p => (
            <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
              <span style={{ flex: 1 }}>{p.full_name} <span style={{ color: 'var(--t-text-faint)' }}>· {p.role_name || ''}</span></span>
              <button onClick={() => { set(p.id, 'allow'); setQ('') }} style={{ fontSize: 10, fontWeight: 700, padding: '3px 10px', cursor: 'pointer', border: '1px solid var(--t-success)', background: 'transparent', color: 'var(--t-success)' }}>Allow</button>
              <button onClick={() => { set(p.id, 'block'); setQ('') }} style={{ fontSize: 10, fontWeight: 700, padding: '3px 10px', cursor: 'pointer', border: '1px solid var(--t-danger)', background: 'transparent', color: 'var(--t-danger)' }}>Block</button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function FlagsTab({ flags, onToggle, onBatchSave, roster }) {
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [drill, setDrill] = useState(null)
  const [roleEditFor, setRoleEditFor] = useState(null)
  const [, setRoleTick] = useState(0)
  const toggleRole = (featId, role) => {
    const cur = getFeatureRoles(featId) || [...FLAG_ROLES]
    const allowed = cur.includes(role)
    const next = allowed ? cur.filter(r => r !== role) : [...cur, role]
    setFeatureRoles(featId, next)
    setRoleTick(t => t + 1)
    import('../lib/audit.js').then(m => m.logAudit('Permission Changed', { target: `${featId} · ${role}`, meta: { access: allowed ? 'revoked' : 'granted' } })).catch(() => {})
  }

  // Real feature records behind each KPI tile
  const featureRows = useMemo(() => FEATURES.map(f => ({
    label: f.label,
    category: f.category,
    desc: f.desc,
    state: flags[f.id] ? 'Enabled' : 'Disabled',
    defaultState: f.defaultOn ? 'On' : 'Off',
    modified: f.defaultOn !== !!flags[f.id] ? 'Yes' : 'No',
  })), [flags])
  const FEATURE_COLS = [
    { key: 'label', label: 'Feature', value: r => r.label },
    { key: 'category', label: 'Category', value: r => r.category },
    { key: 'desc', label: 'Description', value: r => r.desc },
    { key: 'state', label: 'State', value: r => r.state, sortKey: r => r.state },
    { key: 'defaultState', label: 'Default', value: r => r.defaultState },
    { key: 'modified', label: 'Modified', value: r => r.modified },
  ]
  const openDrill = (title, rows, accent) => setDrill({
    title, subtitle: `${rows.length} feature${rows.length === 1 ? '' : 's'} behind this metric`, columns: FEATURE_COLS, rows, accent,
  })

  const filtered = useMemo(() => {
    let list = FEATURES
    if (filter !== 'all') list = list.filter(f => f.category === filter)
    if (search.trim()) list = list.filter(f => f.label.toLowerCase().includes(search.toLowerCase()) || f.desc.toLowerCase().includes(search.toLowerCase()))
    return list
  }, [filter, search])

  const grouped = useMemo(() => {
    const map = {}
    CATEGORIES.forEach(cat => { map[cat] = filtered.filter(f => f.category === cat) })
    return map
  }, [filtered])

  const enabledCount = FEATURES.filter(f => flags[f.id]).length
  const disabledCount = FEATURES.length - enabledCount
  const changesThisWeek = 4 // mock

  const inputStyle = {
    background: 'var(--t-surface-2)', border: '1px solid var(--t-line)',
    color: 'var(--t-text)', padding: '7px 12px', fontSize: 12,
    outline: 'none', fontFamily: 'inherit', borderRadius: 0,
  }

  return (
    <div>
      {/* KPIs */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 18 }}>
        <KTile label="Total Features" value={FEATURES.length} onClick={() => openDrill('All Features', featureRows, 'var(--t-accent)')} />
        <KTile label="Features Enabled" value={enabledCount} color="var(--t-success)" onClick={() => openDrill('Enabled Features', featureRows.filter(r => r.state === 'Enabled'), 'var(--t-success)')} />
        <KTile label="Features Disabled" value={disabledCount} color="var(--t-text-muted)" onClick={() => openDrill('Disabled Features', featureRows.filter(r => r.state === 'Disabled'), 'var(--t-text-muted)')} />
        <KTile label="In Rollout" value={3} color="var(--t-warn)" alert="amber" sub="staged rollout" onClick={() => openDrill('Modified Features — In Rollout', featureRows.filter(r => r.modified === 'Yes'), 'var(--t-warn)')} />
        <KTile label="Changes This Week" value={changesThisWeek} onClick={() => openDrill('Changed Features — Differ From Default', featureRows.filter(r => r.modified === 'Yes'), 'var(--t-accent)')} />
        <KTile label="Premium Access" value="18" sub="users" color="var(--t-accent)" onClick={() => openDrill('Premium Access — Enabled Features', featureRows.filter(r => r.state === 'Enabled'), 'var(--t-accent)')} />
      </div>

      <DrillDown open={!!drill} onClose={() => setDrill(null)} {...(drill || {})} />

      {/* Controls */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
        <input
          style={{ ...inputStyle, minWidth: 220 }}
          placeholder="Search features…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <select style={{ ...inputStyle }} value={filter} onChange={e => setFilter(e.target.value)}>
          <option value="all">All Categories</option>
          {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button
            style={{ background: 'var(--t-surface-2)', border: '1px solid var(--t-line)', color: 'var(--t-text-muted)', padding: '7px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
            onClick={() => onBatchSave(Object.fromEntries(FEATURES.map(f => [f.id, false])))}
          >
            Disable All
          </button>
          <button
            style={{ background: 'var(--t-accent)', border: 'none', color: '#000', padding: '7px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
            onClick={() => onBatchSave(Object.fromEntries(FEATURES.map(f => [f.id, true])))}
          >
            Enable All
          </button>
        </div>
      </div>

      {/* Feature groups */}
      {CATEGORIES.map(cat => {
        const catFeatures = grouped[cat]
        if (!catFeatures || !catFeatures.length) return null
        const catColor = CATEGORY_COLOR[cat] || {}
        return (
          <div key={cat} style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', marginBottom: 12 }}>
            {/* category header */}
            <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--t-line)', display: 'flex', alignItems: 'center', gap: 10, background: 'var(--t-surface-2)' }}>
              <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--t-text-muted)' }}>{cat}</span>
              <span style={{ padding: '2px 8px', fontSize: 10, fontWeight: 700, ...catColor }}>
                {catFeatures.filter(f => flags[f.id]).length}/{catFeatures.length} enabled
              </span>
            </div>
            {/* feature rows */}
            {catFeatures.map((feat, idx) => {
              const on = !!flags[feat.id]
              const changed = feat.defaultOn !== on
              const roles = getFeatureRoles(feat.id)          // null = all roles
              const editing = roleEditFor === feat.id
              return (
                <div key={feat.id} style={{ borderBottom: idx < catFeatures.length - 1 ? '1px solid var(--t-line)' : 'none' }}>
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 16, padding: '12px 16px',
                    background: on ? 'transparent' : 'rgba(255,255,255,.012)',
                    opacity: on ? 1 : 0.7, transition: 'opacity .15s, background .15s',
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--t-text)' }}>{feat.label}</span>
                        {changed && (
                          <span style={{ fontSize: 10, padding: '1px 6px', background: 'rgba(255,179,71,.15)', color: 'var(--t-warn)', fontWeight: 600 }}>Modified</span>
                        )}
                        {/* who-can-use summary chip */}
                        <span onClick={() => setRoleEditFor(editing ? null : feat.id)} title="Set who can use this feature"
                          style={{ fontSize: 10, fontWeight: 700, padding: '1px 8px', cursor: 'pointer', border: `1px solid ${roles ? 'var(--t-warn)' : 'var(--t-line)'}`, color: roles ? 'var(--t-warn)' : 'var(--t-text-muted)', background: roles ? 'rgba(255,179,71,.08)' : 'transparent' }}>
                          👥 {roles ? `${roles.length} role${roles.length === 1 ? '' : 's'}` : 'All roles'} {editing ? '▲' : '▾'}
                        </span>
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--t-text-muted)', marginTop: 2 }}>{feat.desc}</div>
                      <div style={{ marginTop: 4, fontSize: 10, color: 'var(--t-text-faint)' }}>Last changed by: Admin · {now()}</div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                      <span className={on ? 'badge green' : 'badge red'} style={{ fontSize: 10 }}>{on ? 'Enabled' : 'Disabled'}</span>
                      <ToggleSwitch on={on} label={feat.label} onChange={() => onToggle(feat)} />
                    </div>
                  </div>
                  {/* per-feature role editor (drill-down) */}
                  {editing && (
                    <div style={{ padding: '0 16px 14px 16px' }}>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                        <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--t-text-muted)', textTransform: 'uppercase', letterSpacing: '.06em', marginRight: 4 }}>Who can use this:</span>
                        {FLAG_ROLES.map(role => {
                          const allowed = !roles || roles.includes(role)
                          return (
                            <button key={role} onClick={() => toggleRole(feat.id, role)}
                              style={{ fontSize: 11, fontWeight: 700, padding: '4px 10px', cursor: 'pointer', border: `1px solid ${allowed ? 'var(--t-success)' : 'var(--t-line)'}`, background: allowed ? 'rgba(29,233,182,.12)' : 'transparent', color: allowed ? 'var(--t-success)' : 'var(--t-text-faint)' }}>
                              {allowed ? '✓ ' : ''}{role}
                            </button>
                          )
                        })}
                        <span style={{ fontSize: 10, color: 'var(--t-text-faint)', marginLeft: 4 }}>Executives always have access · all-selected = unrestricted</span>
                      </div>
                      <PersonOverrides featId={feat.id} roster={roster} />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )
      })}

      {/* ── CEO FEATURES ── */}
      <InfraFlagGroup
        title="CEO FEATURES"
        color={{ bg: 'rgba(0,229,255,.1)', color: 'var(--t-accent)' }}
        items={[
          { key: 'labor_cost_pct',        label: 'Labor Cost % of Revenue' },
          { key: 'budget_actual',          label: 'Budget vs. Actual Tracker' },
          { key: 'shrinkage_alerts',       label: 'Shrinkage & Void Anomaly Alerts' },
          { key: 'executive_digest',       label: 'Executive Daily Digest' },
          { key: 'turnover_cost',          label: 'Turnover Cost Dashboard' },
        ]}
      />

      {/* ── DISTRICT MANAGER ── */}
      <InfraFlagGroup
        title="DISTRICT MANAGER"
        color={{ bg: 'rgba(124,77,255,.1)', color: '#b39ddb' }}
        items={[
          { key: 'manager_scorecards',     label: 'Manager Performance Scorecards' },
          { key: 'store_visit_log',        label: 'Store Visit / Audit Log' },
          { key: 'shift_marketplace',      label: 'Shift Marketplace (Cross-Location)' },
          { key: 'scheduling_compliance',  label: 'Scheduling Compliance Alerts' },
          { key: 'writeup_trends',         label: 'Write-Up Trend Analysis' },
        ]}
      />

      {/* ── HR COMPLIANCE ── */}
      <InfraFlagGroup
        title="HR COMPLIANCE"
        color={{ bg: 'rgba(29,233,182,.1)', color: 'var(--t-success)' }}
        items={[
          { key: 'i9_expiry',              label: 'I-9 Expiration Tracker' },
          { key: 'paid_leave',             label: 'CT Paid Leave Compliance' },
          { key: 'fmla_loa',              label: 'FMLA / Leave of Absence Tracker' },
          { key: 'bg_check_gate',          label: 'Background Check Gate' },
          { key: 'exit_interviews',        label: 'Exit Interview Tracker' },
          { key: 'handbook_ack',           label: 'Handbook Acknowledgment Tracking' },
          { key: 'workers_comp',           label: 'Workers Comp Incident Log' },
        ]}
      />

      {/* ── STAFF MANAGEMENT ── */}
      <InfraFlagGroup
        title="STAFF MANAGEMENT"
        color={{ bg: 'rgba(0,229,255,.08)', color: 'var(--t-accent)' }}
        items={[
          { key: 'employee_360',    label: 'Employee 360 View' },
          { key: 'probation_tracker', label: 'Probation Period Tracker' },
          { key: 'one_on_ones',     label: '1-on-1 Meeting Log' },
          { key: 'shift_notes',     label: 'End-of-Shift Manager Notes' },
          { key: 'health_score',    label: 'Employee Performance Health Score' },
          { key: 'coaching_log',    label: 'Coaching Moments Log' },
          { key: 'risk_alerts',     label: 'Manager Escalation Risk Alerts' },
          { key: 'employee_timeline', label: 'Employee Timeline' },
        ]}
      />

      {/* ── ATTENDANCE MANAGEMENT ── */}
      <InfraFlagGroup
        title="ATTENDANCE MANAGEMENT"
        color={{ bg: 'rgba(255,179,71,.1)', color: 'var(--t-warn)' }}
        items={[
          { key: 'attendance_points', label: 'Attendance Points System' },
          { key: 'return_to_work',    label: 'Return-to-Work Protocol' },
          { key: 'absence_heatmap',   label: 'Absence Calendar Heatmap' },
        ]}
      />

      {/* ── POLICY & PROCEDURES ── */}
      <InfraFlagGroup
        title="POLICY & PROCEDURES"
        color={{ bg: 'rgba(124,77,255,.1)', color: '#b39ddb' }}
        items={[
          { key: 'policy_versioning',      label: 'Policy Version Control & Re-Acknowledgment' },
          { key: 'policy_quiz',            label: 'Policy Knowledge Quiz' },
          { key: 'policy_da_link',         label: 'Policy Breach Auto-Link to DAs' },
          { key: 'progressive_discipline', label: 'Progressive Discipline Auto-Tracker' },
        ]}
      />

      {/* ── TRAINING MANAGEMENT ── */}
      <InfraFlagGroup
        title="TRAINING MANAGEMENT"
        color={{ bg: 'rgba(29,233,182,.08)', color: 'var(--t-success)' }}
        items={[
          { key: 'retraining_triggers',    label: 'Retraining Auto-Trigger from DAs' },
          { key: 'training_expiry',        label: 'Training Expiration Tracker' },
          { key: 'skills_matrix',          label: 'Skills Matrix' },
          { key: 'training_effectiveness', label: 'Training Effectiveness Metrics' },
          { key: 'onboarding_milestones',  label: 'New Hire Onboarding Milestone Board' },
        ]}
      />

      {/* ── HR OPERATIONS ── */}
      <InfraFlagGroup
        title="HR OPERATIONS"
        color={{ bg: 'rgba(255,59,48,.08)', color: 'var(--t-danger)' }}
        items={[
          { key: 'suspensions',       label: 'Suspension Management' },
          { key: 'hr_investigations', label: 'HR Employee Investigations' },
          { key: 'rehires',           label: 'Rehire Management' },
        ]}
      />

      {/* ── OPERATIONS ── */}
      <InfraFlagGroup
        title="OPERATIONS"
        color={{ bg: 'rgba(0,229,255,.08)', color: 'var(--t-accent)' }}
        items={[
          { key: 'daily_projects',   label: 'Daily Projects & Task Grouping' },
          { key: 'cleaning_logs',    label: 'Store Cleaning Logs' },
          { key: 'shift_broadcasts', label: 'Management Shift Broadcasts' },
        ]}
      />

      {/* ── TIME & PAYROLL ── */}
      <InfraFlagGroup
        title="TIME & PAYROLL"
        color={{ bg: 'rgba(29,233,182,.1)', color: 'var(--t-success)' }}
        items={[
          { key: 'kiosk_mode',      label: 'Kiosk PIN Clock-In Mode' },
          { key: 'payroll_summary', label: 'Payroll Summary & Export' },
        ]}
      />

      {/* ── EMPLOYEE SELF-SERVICE ── */}
      <InfraFlagGroup
        title="EMPLOYEE SELF-SERVICE"
        color={{ bg: 'rgba(124,77,255,.1)', color: '#b39ddb' }}
        items={[
          { key: 'benefits_admin', label: 'Benefits Administration' },
          { key: 'payroll_detail', label: 'Payroll & Pay Stubs' },
          { key: 'notifications',  label: 'Notification Center' },
          { key: 'org_chart',      label: 'Organization Chart' },
        ]}
      />

      {/* ── COMPLIANCE ── */}
      <InfraFlagGroup
        title="COMPLIANCE"
        color={{ bg: 'rgba(29,233,182,.1)', color: 'var(--t-success)' }}
        items={[
          { key: 'ct_compliance',      label: 'CT Labor Compliance Tracker' },
          { key: 'emergency_contacts', label: 'Employee Emergency Contacts' },
        ]}
      />

      {/* ── HANDBOOK ── */}
      <InfraFlagGroup
        title="HANDBOOK"
        color={{ bg: 'rgba(124,77,255,.1)', color: '#b39ddb' }}
        items={[
          { key: 'handbook_builder', label: 'Employee Handbook Builder (Blissbook)' },
        ]}
      />
    </div>
  )
}

/* ── Tab 2: Rollout Control ───────────────────────────────────────── */
function RolloutTab({ flags, rollout, onRolloutChange }) {
  const [expanded, setExpanded] = useState(null)

  const totalUsers = 18
  const calcAccess = (feat) => {
    const r = rollout[feat.id] || { locs: LOCS.slice(), roles: ALL_ROLES.slice(), pct: 100 }
    if (!flags[feat.id]) return { count: 0, pct: 0 }
    const locFraction = r.locs.length / LOCS.length
    const roleFraction = r.roles.length / ALL_ROLES.length
    const combined = Math.round(totalUsers * locFraction * roleFraction * (r.pct / 100))
    return { count: Math.min(combined, totalUsers), pct: Math.round((combined / totalUsers) * 100) }
  }

  const update = (featId, patch) => {
    onRolloutChange(prev => {
      const base = prev[featId] || { locs: [...LOCS], roles: [...ALL_ROLES], pct: 100 }
      return { ...prev, [featId]: { ...base, ...patch } }
    })
  }

  const toggleLoc = (featId, loc) => {
    const curr = (rollout[featId] || { locs: [...LOCS] }).locs
    update(featId, { locs: curr.includes(loc) ? curr.filter(l => l !== loc) : [...curr, loc] })
  }

  const toggleRole = (featId, role) => {
    const curr = (rollout[featId] || { roles: [...ALL_ROLES] }).roles
    update(featId, { roles: curr.includes(role) ? curr.filter(r => r !== role) : [...curr, role] })
  }

  return (
    <div>
      <div style={{ marginBottom: 14, fontSize: 12, color: 'var(--t-text-muted)', padding: '10px 14px', background: 'rgba(255,179,71,.08)', border: '1px solid rgba(255,179,71,.25)' }}>
        Configure which locations and roles can access each feature. Percentage slider further limits the user pool (useful for A/B rollouts).
      </div>

      {FEATURES.map((feat, i) => {
        const on = !!flags[feat.id]
        const r = rollout[feat.id] || { locs: [...LOCS], roles: [...ALL_ROLES], pct: 100 }
        const access = calcAccess(feat)
        const isOpen = expanded === feat.id

        return (
          <div key={feat.id} style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', marginBottom: 8 }}>
            {/* collapsed row */}
            <div
              style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', cursor: 'pointer', userSelect: 'none' }}
              onClick={() => setExpanded(isOpen ? null : feat.id)}
            >
              <span style={{ fontSize: 10, color: 'var(--t-text-faint)', transform: isOpen ? 'rotate(0)' : 'rotate(-90deg)', display: 'inline-block', transition: 'transform .15s' }}>▼</span>
              <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: on ? 'var(--t-text)' : 'var(--t-text-muted)' }}>{feat.label}</span>
              <span className={on ? 'badge green' : 'badge red'} style={{ fontSize: 10 }}>{on ? 'Active' : 'Disabled'}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 130 }}>
                <div style={{ flex: 1, height: 4, background: 'var(--t-line)' }}>
                  <div style={{ width: `${access.pct}%`, height: '100%', background: on ? 'var(--t-accent)' : 'var(--t-line)', transition: 'width .3s' }} />
                </div>
                <span style={{ fontSize: 11, color: 'var(--t-text-muted)', minWidth: 60, textAlign: 'right' }}>
                  {access.count}/{totalUsers} users
                </span>
              </div>
            </div>

            {/* expanded controls */}
            {isOpen && (
              <div style={{ padding: '14px 18px', borderTop: '1px solid var(--t-line)', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 20 }}>
                {/* locations */}
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.08em', color: 'var(--t-text-muted)', textTransform: 'uppercase', marginBottom: 8 }}>Locations</div>
                  {LOCS.map(loc => (
                    <label key={loc} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--t-text)', marginBottom: 5, cursor: 'pointer' }}>
                      <input type="checkbox" checked={r.locs.includes(loc)} onChange={() => toggleLoc(feat.id, loc)} style={{ accentColor: 'var(--t-accent)' }} />
                      {loc}
                    </label>
                  ))}
                </div>
                {/* roles */}
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.08em', color: 'var(--t-text-muted)', textTransform: 'uppercase', marginBottom: 8 }}>Roles</div>
                  {ALL_ROLES.map(role => (
                    <label key={role} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--t-text)', marginBottom: 5, cursor: 'pointer' }}>
                      <input type="checkbox" checked={r.roles.includes(role)} onChange={() => toggleRole(feat.id, role)} style={{ accentColor: 'var(--t-accent)' }} />
                      {role}
                    </label>
                  ))}
                </div>
                {/* percentage slider */}
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.08em', color: 'var(--t-text-muted)', textTransform: 'uppercase', marginBottom: 8 }}>
                    User % — {r.pct}%
                  </div>
                  <input
                    type="range" min={0} max={100} step={5}
                    value={r.pct}
                    onChange={e => update(feat.id, { pct: Number(e.target.value) })}
                    style={{ width: '100%', accentColor: 'var(--t-accent)', marginBottom: 8 }}
                  />
                  <div style={{ fontSize: 11, color: 'var(--t-text-muted)' }}>
                    {access.count} of {totalUsers} users will have access
                  </div>
                  <div style={{ marginTop: 12, height: 6, background: 'var(--t-line)' }}>
                    <div style={{ width: `${access.pct}%`, height: '100%', background: 'var(--t-accent)', transition: 'width .3s' }} />
                  </div>
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

/* ── Tab 3: Audit Log ─────────────────────────────────────────────── */
function AuditTab({ log }) {
  const [search, setSearch] = useState('')
  const [filterUser, setFilterUser] = useState('all')

  const users = useMemo(() => ['all', ...new Set(log.map(e => e.who))], [log])

  const filtered = useMemo(() => {
    let list = log
    if (filterUser !== 'all') list = list.filter(e => e.who === filterUser)
    if (search.trim()) list = list.filter(e => e.feature.toLowerCase().includes(search.toLowerCase()) || e.who.toLowerCase().includes(search.toLowerCase()))
    return list
  }, [log, search, filterUser])

  const inputStyle = {
    background: 'var(--t-surface-2)', border: '1px solid var(--t-line)', color: 'var(--t-text)',
    padding: '7px 12px', fontSize: 12, outline: 'none', fontFamily: 'inherit', borderRadius: 0,
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        <input style={{ ...inputStyle, minWidth: 220 }} placeholder="Search by feature or user…" value={search} onChange={e => setSearch(e.target.value)} />
        <select style={inputStyle} value={filterUser} onChange={e => setFilterUser(e.target.value)}>
          {users.map(u => <option key={u} value={u}>{u === 'all' ? 'All Users' : u}</option>)}
        </select>
        <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--t-text-faint)', alignSelf: 'center' }}>
          {filtered.length} entries
        </span>
      </div>

      <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ background: 'var(--t-surface-2)', borderBottom: '1px solid var(--t-line)' }}>
              <th style={{ textAlign: 'left', padding: '10px 14px', color: 'var(--t-text-muted)', fontWeight: 600, letterSpacing: '.04em' }}>Timestamp</th>
              <th style={{ textAlign: 'left', padding: '10px 14px', color: 'var(--t-text-muted)', fontWeight: 600 }}>Feature</th>
              <th style={{ textAlign: 'left', padding: '10px 14px', color: 'var(--t-text-muted)', fontWeight: 600 }}>Changed By</th>
              <th style={{ textAlign: 'left', padding: '10px 14px', color: 'var(--t-text-muted)', fontWeight: 600 }}>Change</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={4} style={{ padding: '32px', textAlign: 'center', color: 'var(--t-text-faint)' }}>No audit entries match your filter.</td>
              </tr>
            ) : filtered.map((entry, i) => (
              <tr key={entry.id} style={{ borderBottom: '1px solid var(--t-line)', background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,.015)' }}>
                <td style={{ padding: '9px 14px', color: 'var(--t-text-faint)', fontFamily: 'monospace', fontSize: 11 }}>{entry.ts}</td>
                <td style={{ padding: '9px 14px', color: 'var(--t-text)', fontWeight: 500 }}>{entry.feature}</td>
                <td style={{ padding: '9px 14px', color: 'var(--t-text-muted)' }}>{entry.who}</td>
                <td style={{ padding: '9px 14px' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span className={entry.from ? 'badge green' : 'badge red'} style={{ fontSize: 10 }}>{entry.from ? 'Enabled' : 'Disabled'}</span>
                    <span style={{ color: 'var(--t-text-faint)' }}>→</span>
                    <span className={entry.to ? 'badge green' : 'badge red'} style={{ fontSize: 10 }}>{entry.to ? 'Enabled' : 'Disabled'}</span>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/* ── Main export ──────────────────────────────────────────────────── */
export default function FeatureToggles() {
  const { session } = useAuth()
  const { locationIds } = useScope()
  const role = session?.person?.role_name || ''
  const who = session?.person?.full_name || 'Admin'
  const isAdmin = /admin|owner|coo|ceo|cfo|president|chief/i.test(role)

  const [roster, setRoster] = useState([])
  useEffect(() => {
    if (!Array.isArray(locationIds) || !locationIds.length) return
    sb.rpc('get_roster', { p_node_ids: locationIds, p_actor: session?.person?.id || null })
      .then(({ data }) => { const seen = new Set(); setRoster((Array.isArray(data) ? data : []).filter(p => p.id && !seen.has(p.id) && seen.add(p.id))) })
      .catch(() => setRoster([]))
  }, [JSON.stringify(locationIds)])

  const [tab, setTab] = useState('flags')
  const [flags, setFlags] = useState(() => ({ ...buildDefaults(), ...loadLS(LS_KEY_FLAGS, {}) }))
  const [rollout, setRollout] = useState(() => loadLS(LS_KEY_ROLLOUT, {}))
  const [log, setLog] = useState(() => loadLS(LS_KEY_LOG, []))
  const [toast, setToast] = useState(null)
  const [pendingChanges, setPendingChanges] = useState(0)
  const toastRef = useRef(0)

  const showToast = useCallback((msg, type = 'success') => {
    const id = ++toastRef.current
    setToast({ id, msg, type })
  }, [])

  // persist on change
  useEffect(() => { saveLS(LS_KEY_FLAGS, flags) }, [flags])
  useEffect(() => { saveLS(LS_KEY_ROLLOUT, rollout) }, [rollout])
  useEffect(() => { saveLS(LS_KEY_LOG, log) }, [log])

  const handleToggle = useCallback((feat) => {
    setFlags(prev => {
      const next = { ...prev, [feat.id]: !prev[feat.id] }
      const newVal = next[feat.id]
      const entry = { id: Date.now(), ts: now(), feature: feat.label, who, from: !newVal, to: newVal }
      setLog(l => [entry, ...l].slice(0, 200))
      setPendingChanges(c => c + 1)
      showToast(`${feat.label} ${newVal ? 'enabled' : 'disabled'}`, newVal ? 'success' : 'warn')
      return next
    })
  }, [who, showToast])

  const handleBatchSave = useCallback((newFlags) => {
    setFlags(prev => {
      const entries = []
      FEATURES.forEach(f => {
        if (prev[f.id] !== newFlags[f.id]) {
          entries.push({ id: Date.now() + Math.random(), ts: now(), feature: f.label, who, from: prev[f.id], to: newFlags[f.id] })
        }
      })
      setLog(l => [...entries, ...l].slice(0, 200))
      return { ...prev, ...newFlags }
    })
    setPendingChanges(0)
    showToast('Batch change applied', 'success')
  }, [who, showToast])

  const handleSave = () => {
    saveLS(LS_KEY_FLAGS, flags)
    setPendingChanges(0)
    showToast('Feature flags saved', 'success')
  }

  if (!isAdmin) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 400, gap: 16 }}>
        <div style={{ fontSize: 48, opacity: .5 }}>🔒</div>
        <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--t-text)' }}>Admin Access Required</div>
        <div style={{ color: 'var(--t-text-muted)', fontSize: 13 }}>Feature Toggles are restricted to Admin/Owner and COO roles.</div>
      </div>
    )
  }

  const TABS = [
    { key: 'flags', label: 'Feature Flags' },
    { key: 'rollout', label: 'Rollout Control' },
    { key: 'audit', label: `Audit Log (${log.length})` },
  ]

  const tabStyle = (active) => ({
    padding: '8px 18px', fontSize: 13, fontWeight: active ? 700 : 500,
    color: active ? 'var(--t-accent)' : 'var(--t-text-muted)',
    background: 'transparent', border: 'none',
    borderBottom: active ? '2px solid var(--t-accent)' : '2px solid transparent',
    cursor: 'pointer', marginBottom: -1, fontFamily: 'inherit', transition: 'color .15s',
  })

  return (
    <div style={{ padding: 24, maxWidth: 1400 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 18, gap: 16, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--t-text)', letterSpacing: '-.02em' }}>Feature Flag Management</div>
          <div style={{ fontSize: 12, color: 'var(--t-text-muted)', marginTop: 3 }}>
            Enable or disable platform features per location and role. Changes are immediate.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {pendingChanges > 0 && (
            <span style={{ fontSize: 12, color: 'var(--t-warn)', fontWeight: 600 }}>
              {pendingChanges} unsaved change{pendingChanges !== 1 ? 's' : ''}
            </span>
          )}
          <button
            style={{ background: 'var(--t-accent)', color: '#000', border: 'none', padding: '9px 20px', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
            onClick={handleSave}
          >
            Save Changes
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--t-line)', marginBottom: 20, paddingBottom: 0 }}>
        {TABS.map(t => (
          <button key={t.key} style={tabStyle(tab === t.key)} onClick={() => setTab(t.key)}>{t.label}</button>
        ))}
      </div>

      {tab === 'flags' && (
        <FlagsTab flags={flags} onToggle={handleToggle} onBatchSave={handleBatchSave} roster={roster} />
      )}
      {tab === 'rollout' && (
        <RolloutTab flags={flags} rollout={rollout} onRolloutChange={setRollout} />
      )}
      {tab === 'audit' && (
        <AuditTab log={log} />
      )}

      {toast && (
        <Toast key={toast.id} message={toast.msg} type={toast.type} onDone={() => setToast(null)} />
      )}
    </div>
  )
}
