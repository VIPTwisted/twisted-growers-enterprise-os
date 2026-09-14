import { useState, useEffect, useCallback, useMemo } from 'react'
import { useAuth } from '../lib/auth.jsx'
import { sb } from '../lib/supabase'

/* ── nav definition (mirrors Shell.jsx) ──────────────────────────── */
const DEFAULT_NAV = [
  {
    section: 'MAIN',
    items: [
      { label: 'Dashboard',            to: '/',               icon: '🏠', role: 'all'   },
    ],
  },
  {
    section: 'COMMUNICATION',
    items: [
      { label: 'Messages',             to: '/messages',        icon: '💬', role: 'all'   },
      { label: 'Team Chat',            to: '/chat',            icon: '💭', role: 'all'   },
      { label: 'Broadcasts',           to: '/comms',           icon: '📢', role: 'hr'    },
      { label: 'Daily Huddle',         to: '/huddle',          icon: '☀️', role: 'all'   },
      { label: 'Meetings',             to: '/meetings',        icon: '📅', role: 'all'   },
      { label: 'Compliments',          to: '/compliments',     icon: '⭐', role: 'all'   },
      { label: 'HR Messaging',         to: '/hr-messages',     icon: '📩', role: 'hr'    },
    ],
  },
  {
    section: 'WORKFORCE',
    items: [
      { label: 'Employee Files',       to: '/employees',       icon: '👤', role: 'hr'    },
      { label: 'Staff Roster',         to: '/roster',          icon: '📋', role: 'hr'    },
      { label: 'Scheduling',           to: '/schedule',        icon: '🗓', role: 'hr'    },
      { label: 'Calendar',             to: '/cal',             icon: '📆', role: 'all'   },
      { label: 'Shift Bookends',       to: '/bookends',        icon: '🔖', role: 'hr'    },
      { label: 'Time Clock',           to: '/timeclock',       icon: '⏱', role: 'all'   },
      { label: 'Attendance',           to: '/attendance',      icon: '✅', role: 'hr'    },
      { label: 'Callout Tracker',      to: '/callout',         icon: '📞', role: 'hr'    },
      { label: 'Coverage Board',       to: '/coverage',        icon: '🛡', role: 'hr'    },
      { label: 'Availability',         to: '/availability',    icon: '🕐', role: 'all'   },
      { label: 'Zone Assignments',     to: '/zones',           icon: '🗺', role: 'hr'    },
      { label: 'AI Scheduler',         to: '/ai-schedule',     icon: '🤖', role: 'hr'    },
    ],
  },
  {
    section: 'TRAINING',
    items: [
      { label: 'Training & Dev',       to: '/training',        icon: '📚', role: 'all'   },
      { label: 'Training LMS',         to: '/training-lms',    icon: '🎓', role: 'all'   },
      { label: 'Academy',              to: '/academy',         icon: '🏫', role: 'all'   },
      { label: 'Performance',          to: '/reviews',         icon: '📊', role: 'hr'    },
      { label: 'Product Knowledge',    to: '/products',        icon: '🏷', role: 'all'   },
      { label: 'Employee Manual',      to: '/manual',          icon: '📖', role: 'all'   },
      { label: 'Weekly Drills',        to: '/drills',          icon: '🔁', role: 'all'   },
    ],
  },
  {
    section: 'MY PORTAL',
    items: [
      { label: 'My Home',              to: '/myhome',          icon: '🏡', role: 'all'   },
      { label: 'PTO & Leave',          to: '/requests',        icon: '🌴', role: 'all'   },
      { label: 'Timesheets',           to: '/forms',           icon: '🕒', role: 'all'   },
      { label: 'Direct Deposit',       to: '/direct-deposit',  icon: '💳', role: 'all'   },
      { label: 'My Documents',         to: '/my-docs',         icon: '📄', role: 'all'   },
      { label: 'Spiffs',               to: '/spiffs',          icon: '💰', role: 'all'   },
      { label: 'Merchandise',          to: '/merch',           icon: '🛍', role: 'all'   },
      { label: 'Goals & Targets',      to: '/goals',           icon: '🎯', role: 'all'   },
    ],
  },
  {
    section: 'HR TOOLS',
    items: [
      { label: 'Tasks',                to: '/tasks',           icon: '✔️', role: 'hr'    },
      { label: 'Documents',            to: '/documents',       icon: '🗂', role: 'hr'    },
      { label: 'Policies',             to: '/policies',        icon: '📜', role: 'hr'    },
      { label: 'Incidents',            to: '/incidents',       icon: '⚠️', role: 'hr'    },
      { label: 'Disciplinary',         to: '/disciplinary',    icon: '🔴', role: 'hr'    },
      { label: 'Doc Vault',            to: '/doc-vault',       icon: '🔒', role: 'hr'    },
      { label: 'Reports',              to: '/reports',         icon: '📈', role: 'hr'    },
      { label: 'Onboarding',           to: '/onboarding',      icon: '🚀', role: 'hr'    },
      { label: 'Applicant Tracking',   to: '/ats',             icon: '🎯', role: 'hr'    },
      { label: 'HR Operations',        to: '/hr-ops',          icon: '⚙️', role: 'hr'    },
      { label: 'Attendance Forensics', to: '/forensics',       icon: '🔍', role: 'hr'    },
    ],
  },
  {
    section: 'BUSINESS',
    items: [
      { label: 'Sales Tracker',        to: '/sales',           icon: '💵', role: 'hr'    },
      { label: 'Promotions',           to: '/promotions',      icon: '🏷', role: 'hr'    },
      { label: 'Inventory',            to: '/inventory',       icon: '📦', role: 'hr'    },
      { label: 'Contests',             to: '/contests',        icon: '🏆', role: 'all'   },
      { label: 'Leaderboards',         to: '/leaderboards',    icon: '🥇', role: 'all'   },
      { label: 'Analytics',            to: '/analytics',       icon: '📉', role: 'hr'    },
      { label: 'Pipeline / CRM',       to: '/pipeline',        icon: '🔗', role: 'hr'    },
      { label: 'Cultivation Floor',    to: '/cultivation',     icon: '🌿', role: 'hr'    },
      { label: 'Loyalty Program',      to: '/loyalty',         icon: '💎', role: 'hr'    },
    ],
  },
  {
    section: 'REPORTS & AI',
    items: [
      { label: 'AI CEO Command',       to: '/ai-ceo',          icon: '👑', role: 'admin' },
      { label: 'AI Assistant',         to: '/ai-assist',       icon: '🤖', role: 'hr'    },
      { label: 'AI Scheduler',         to: '/ai-schedule',     icon: '🗓', role: 'hr'    },
      { label: 'KPI Dashboard',        to: '/kpi',             icon: '📊', role: 'hr'    },
      { label: 'Audit Log',            to: '/audit',           icon: '🔍', role: 'admin' },
    ],
  },
  {
    section: 'ADMIN',
    items: [
      { label: 'Admin Panel',          to: '/admin',           icon: '🛠', role: 'admin' },
      { label: 'Feature Toggles',      to: '/feature-toggles', icon: '🔀', role: 'admin' },
      { label: 'Integrations',         to: '/integrations',    icon: '🔌', role: 'admin' },
      { label: 'Nav Config',           to: '/nav-config',      icon: '🗂', role: 'admin' },
      { label: 'Theme Studio',         to: '/theme-studio',    icon: '🎨', role: 'admin' },
      { label: 'Settings',             to: '/settings',        icon: '⚙️', role: 'admin' },
      { label: 'Maintenance',          to: '/maintenance',     icon: '🔧', role: 'admin' },
    ],
  },
]

const ALL_ITEMS_FLAT = DEFAULT_NAV.flatMap(s => s.items)

const EMOJI_OPTIONS = ['🏠','📊','📅','💬','🤖','📈','🔒','📦','💵','🌴','⭐','📋','⚙️','🎯','🏆','📚','🔔','📌','🛡','💳']

// Suggested starter set used only by the explicit "Reset to Defaults" button.
// Not treated as persisted data — the live list always comes from the server.
const DEFAULT_QUICK_LINKS = [
  { id: 'ql1', emoji: '🏠', label: 'Dashboard',      path: '/'            },
  { id: 'ql2', emoji: '📅', label: 'Schedule',        path: '/schedule'    },
  { id: 'ql3', emoji: '🌴', label: 'PTO & Leave',     path: '/requests'    },
  { id: 'ql4', emoji: '📊', label: 'KPI Dashboard',   path: '/kpi'         },
  { id: 'ql5', emoji: '💬', label: 'Messages',        path: '/messages'    },
  { id: 'ql6', emoji: '📈', label: 'Reports',         path: '/reports'     },
  { id: 'ql7', emoji: '⏱',  label: 'Time Clock',      path: '/timeclock'   },
  { id: 'ql8', emoji: '🚀', label: 'Onboarding',      path: '/onboarding'  },
]

const PREVIEW_ROLES = ['all', 'admin', 'hr', 'manager', 'associate']

/* ── helpers ─────────────────────────────────────────────────────── */
function buildDefaultConfig() {
  const map = {}
  ALL_ITEMS_FLAT.forEach(item => {
    map[item.to] = { visible: true, customLabel: '' }
  })
  return map
}

function useToast() {
  const [toast, setToast] = useState(null)
  const show = useCallback((msg, type = 'success') => {
    setToast({ msg, type, id: Date.now() })
    setTimeout(() => setToast(null), 3200)
  }, [])
  return { toast, show }
}

/* ── sub-components ──────────────────────────────────────────────── */

function Toggle({ checked, onChange, small }) {
  const w = small ? 36 : 40, h = small ? 20 : 22, r = small ? 8 : 14
  return (
    <button
      onClick={() => onChange(!checked)}
      style={{
        position: 'relative', width: w, height: h, background: checked ? 'var(--t-success)' : 'var(--t-surface-2)',
        border: '1px solid var(--t-line)', borderRadius: 0, cursor: 'pointer', padding: 0, flexShrink: 0,
        transition: 'background .15s',
      }}
      title={checked ? 'Visible — click to hide' : 'Hidden — click to show'}
    >
      <span style={{
        position: 'absolute', top: 3, left: checked ? (w - r - 3) : 3, width: r, height: r,
        background: checked ? '#fff' : 'var(--t-text-muted)', transition: 'left .15s',
      }} />
    </button>
  )
}

function RoleBadge({ role }) {
  const cls = role === 'admin' ? 'badge red' : role === 'hr' ? 'badge blue' : 'badge green'
  return <span className={cls} style={{ fontSize: 10, padding: '2px 6px' }}>{role}</span>
}

function Toast({ message, type }) {
  return (
    <div style={{
      position: 'fixed', top: 20, right: 20, zIndex: 9999,
      background: type === 'error' ? 'var(--t-danger)' : type === 'warn' ? 'rgba(255,179,71,.2)' : 'rgba(29,233,182,.2)',
      border: `1px solid ${type === 'error' ? 'var(--t-danger)' : type === 'warn' ? 'rgba(255,179,71,.5)' : 'rgba(29,233,182,.5)'}`,
      color: type === 'error' ? '#fff' : 'var(--t-text)',
      padding: '12px 20px', fontSize: 13, fontWeight: 600, boxShadow: '0 4px 24px rgba(0,0,0,.4)',
    }}>
      {message}
    </div>
  )
}

/* ── Tab 1: Menu Builder ─────────────────────────────────────────── */
function MenuBuilderTab({ config, setConfig, onSave }) {
  const [collapsed, setCollapsed] = useState({})
  const [previewRole, setPreviewRole] = useState('all')

  function setItem(to, patch) {
    setConfig(p => ({ ...p, [to]: { ...p[to], ...patch } }))
  }

  function setSectionAll(sec, visible) {
    const upd = {}
    sec.items.forEach(item => { upd[item.to] = { ...(config[item.to] ?? {}), visible } })
    setConfig(p => ({ ...p, ...upd }))
  }

  function roleMatchesPreview(itemRole) {
    if (previewRole === 'all') return true
    if (itemRole === 'all') return true
    if (previewRole === 'admin') return true
    if (previewRole === 'hr' && ['all', 'hr'].includes(itemRole)) return true
    if (previewRole === 'manager' && ['all', 'hr'].includes(itemRole)) return true
    if (previewRole === 'associate' && itemRole === 'all') return true
    return false
  }

  const selStyle = {
    background: 'var(--t-surface-2)', border: '1px solid var(--t-line)', color: 'var(--t-text)',
    padding: '6px 10px', fontSize: 12, outline: 'none', fontFamily: 'inherit', borderRadius: 0,
  }

  const totalItems = ALL_ITEMS_FLAT.length
  const visibleCount = ALL_ITEMS_FLAT.filter(i => config[i.to]?.visible !== false).length
  const previewCount = ALL_ITEMS_FLAT.filter(i => config[i.to]?.visible !== false && roleMatchesPreview(i.role)).length

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: 16, alignItems: 'start' }}>
      {/* left: section cards */}
      <div>
        {/* controls bar */}
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 14, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, color: 'var(--t-text-muted)' }}>
            <strong style={{ color: 'var(--t-text)' }}>{visibleCount}</strong> of {totalItems} items visible
          </span>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <button
              style={{ background: 'transparent', border: '1px solid var(--t-line)', color: 'var(--t-text-muted)', padding: '6px 14px', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
              onClick={() => {
                const upd = {}
                ALL_ITEMS_FLAT.forEach(i => { upd[i.to] = { ...config[i.to], visible: true } })
                setConfig(p => ({ ...p, ...upd }))
              }}
            >
              Show All
            </button>
            <button
              style={{ background: 'var(--t-accent)', border: 'none', color: '#000', padding: '6px 14px', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
              onClick={onSave}
            >
              Save Navigation
            </button>
          </div>
        </div>

        {DEFAULT_NAV.map(sec => {
          const isCollapsed = !!collapsed[sec.section]
          const secVisible = sec.items.filter(i => config[i.to]?.visible !== false).length
          const allVis = secVisible === sec.items.length
          const noneVis = secVisible === 0

          return (
            <div key={sec.section} style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', marginBottom: 10 }}>
              {/* section header */}
              <div
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', cursor: 'pointer', userSelect: 'none', borderBottom: isCollapsed ? 'none' : '1px solid var(--t-line)', background: 'var(--t-surface-2)' }}
                onClick={() => setCollapsed(p => ({ ...p, [sec.section]: !p[sec.section] }))}
              >
                <span style={{ fontSize: 10, color: 'var(--t-text-faint)', transform: isCollapsed ? 'rotate(-90deg)' : 'none', display: 'inline-block', transition: 'transform .15s' }}>▼</span>
                <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.08em', color: 'var(--t-text-muted)', textTransform: 'uppercase' }}>{sec.section}</span>
                <span style={{ fontSize: 11, color: 'var(--t-text-faint)' }}>{secVisible}/{sec.items.length} visible</span>
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }} onClick={e => e.stopPropagation()}>
                  <button
                    disabled={noneVis}
                    onClick={() => setSectionAll(sec, false)}
                    style={{ background: 'transparent', border: '1px solid var(--t-line)', color: 'var(--t-text-faint)', padding: '3px 9px', fontSize: 10, cursor: noneVis ? 'default' : 'pointer', opacity: noneVis ? .4 : 1, fontFamily: 'inherit' }}
                  >
                    Hide All
                  </button>
                  <button
                    disabled={allVis}
                    onClick={() => setSectionAll(sec, true)}
                    style={{ background: 'transparent', border: '1px solid var(--t-line)', color: 'var(--t-text-faint)', padding: '3px 9px', fontSize: 10, cursor: allVis ? 'default' : 'pointer', opacity: allVis ? .4 : 1, fontFamily: 'inherit' }}
                  >
                    Show All
                  </button>
                </div>
              </div>

              {/* items */}
              {!isCollapsed && sec.items.map((item, idx) => {
                const cfg = config[item.to] || { visible: true, customLabel: '' }
                const isVis = cfg.visible !== false
                return (
                  <div
                    key={item.to}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 12, padding: '9px 14px',
                      borderBottom: idx < sec.items.length - 1 ? '1px solid var(--t-line)' : 'none',
                      background: isVis ? 'transparent' : 'rgba(255,255,255,.01)',
                      opacity: isVis ? 1 : 0.5, transition: 'opacity .15s',
                    }}
                  >
                    {/* toggle */}
                    <Toggle checked={isVis} onChange={v => setItem(item.to, { visible: v })} />
                    {/* icon */}
                    <span style={{ fontSize: 15, width: 22, textAlign: 'center', flexShrink: 0 }}>{item.icon}</span>
                    {/* label */}
                    <span style={{ fontSize: 13, color: 'var(--t-text)', fontWeight: 500, minWidth: 160 }}>{item.label}</span>
                    {/* path badge */}
                    <span style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--t-text-faint)', background: 'var(--t-surface-2)', border: '1px solid var(--t-line)', padding: '2px 6px', flexShrink: 0 }}>
                      {item.to}
                    </span>
                    {/* role badge */}
                    <RoleBadge role={item.role} />
                    {/* custom label */}
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'flex-end' }}>
                      <span style={{ fontSize: 10, color: 'var(--t-text-faint)', flexShrink: 0 }}>Custom label:</span>
                      <input
                        type="text"
                        value={cfg.customLabel || ''}
                        onChange={e => setItem(item.to, { customLabel: e.target.value })}
                        placeholder={item.label}
                        maxLength={40}
                        style={{ background: 'var(--t-surface-2)', border: '1px solid var(--t-line)', color: 'var(--t-text)', padding: '5px 10px', fontSize: 12, width: 170, outline: 'none', borderRadius: 0, fontFamily: 'inherit' }}
                        onFocus={e => (e.target.style.borderColor = 'var(--t-accent)')}
                        onBlur={e => (e.target.style.borderColor = 'var(--t-line)')}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>

      {/* right: preview panel */}
      <div style={{ position: 'sticky', top: 16 }}>
        <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', padding: 0 }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--t-line)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.06em', color: 'var(--t-text-muted)', textTransform: 'uppercase' }}>Preview</span>
            <select style={selStyle} value={previewRole} onChange={e => setPreviewRole(e.target.value)}>
              {PREVIEW_ROLES.map(r => <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>)}
            </select>
          </div>
          <div style={{ padding: '8px 0', maxHeight: 520, overflowY: 'auto' }}>
            <div style={{ fontSize: 10, color: 'var(--t-text-faint)', padding: '0 12px 6px', fontStyle: 'italic' }}>
              {previewCount} items visible
            </div>
            {DEFAULT_NAV.map(sec => {
              const visible = sec.items.filter(i => config[i.to]?.visible !== false && roleMatchesPreview(i.role))
              if (!visible.length) return null
              return (
                <div key={sec.section} style={{ marginBottom: 8 }}>
                  <div style={{ padding: '4px 12px', fontSize: 9, fontWeight: 700, letterSpacing: '.1em', color: 'var(--t-text-faint)', textTransform: 'uppercase' }}>{sec.section}</div>
                  {visible.map(item => {
                    const customLabel = config[item.to]?.customLabel
                    return (
                      <div key={item.to} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 12px' }}>
                        <span style={{ fontSize: 13 }}>{item.icon}</span>
                        <span style={{ fontSize: 12, color: 'var(--t-text)', fontWeight: 500 }}>
                          {customLabel || item.label}
                        </span>
                      </div>
                    )
                  })}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── Tab 2: Quick Links ──────────────────────────────────────────── */
function QuickLinksTab({ links, setLinks, onSave }) {
  const [editId, setEditId] = useState(null)
  const [emojiPickerId, setEmojiPickerId] = useState(null)

  const update = (id, patch) => setLinks(prev => prev.map(l => l.id === id ? { ...l, ...patch } : l))

  const moveUp = (i) => {
    if (i === 0) return
    setLinks(prev => {
      const next = [...prev]
      ;[next[i - 1], next[i]] = [next[i], next[i - 1]]
      return next
    })
  }

  const moveDown = (i) => {
    setLinks(prev => {
      if (i >= prev.length - 1) return prev
      const next = [...prev]
      ;[next[i], next[i + 1]] = [next[i + 1], next[i]]
      return next
    })
  }

  const removeLink = (id) => setLinks(prev => prev.filter(l => l.id !== id))

  const addLink = () => {
    if (links.length >= 8) return
    const id = `ql_${Date.now()}`
    setLinks(prev => [...prev, { id, emoji: '📌', label: 'New Link', path: '/' }])
    setEditId(id)
  }

  const inputStyle = {
    background: 'var(--t-surface-2)', border: '1px solid var(--t-line)', color: 'var(--t-text)',
    padding: '6px 10px', fontSize: 12, outline: 'none', fontFamily: 'inherit', borderRadius: 0,
    width: '100%', boxSizing: 'border-box',
  }

  return (
    <div style={{ maxWidth: 700 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div style={{ fontSize: 12, color: 'var(--t-text-muted)' }}>
          Up to 8 quick-access links shown on MyHome and the header. Drag-free reorder with arrows.
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            style={{ background: 'var(--t-surface-2)', border: '1px solid var(--t-line)', color: 'var(--t-text-muted)', padding: '7px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
            onClick={() => { setLinks(DEFAULT_QUICK_LINKS); onSave && onSave(DEFAULT_QUICK_LINKS) }}
          >
            Reset to Defaults
          </button>
          <button
            disabled={links.length >= 8}
            style={{ background: links.length >= 8 ? 'var(--t-surface-2)' : 'var(--t-accent)', border: 'none', color: links.length >= 8 ? 'var(--t-text-faint)' : '#000', padding: '7px 14px', fontSize: 12, fontWeight: 700, cursor: links.length >= 8 ? 'default' : 'pointer', fontFamily: 'inherit', opacity: links.length >= 8 ? 0.5 : 1 }}
            onClick={addLink}
          >
            + Add Link ({links.length}/8)
          </button>
        </div>
      </div>

      {/* link cards */}
      <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)' }}>
        {links.length === 0 && (
          <div style={{ padding: '32px', textAlign: 'center', color: 'var(--t-text-faint)', fontSize: 13 }}>
            No quick links configured. Click "Add Link" to get started.
          </div>
        )}
        {links.map((link, i) => {
          const isEditing = editId === link.id
          const showEmoji = emojiPickerId === link.id
          return (
            <div key={link.id} style={{ borderBottom: i < links.length - 1 ? '1px solid var(--t-line)' : 'none' }}>
              {/* collapsed row */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px' }}>
                {/* reorder */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flexShrink: 0 }}>
                  <button
                    onClick={() => moveUp(i)} disabled={i === 0}
                    style={{ background: 'transparent', border: 'none', cursor: i === 0 ? 'default' : 'pointer', fontSize: 10, color: i === 0 ? 'var(--t-line)' : 'var(--t-text-muted)', padding: '1px 4px', lineHeight: 1 }}
                  >▲</button>
                  <button
                    onClick={() => moveDown(i)} disabled={i === links.length - 1}
                    style={{ background: 'transparent', border: 'none', cursor: i === links.length - 1 ? 'default' : 'pointer', fontSize: 10, color: i === links.length - 1 ? 'var(--t-line)' : 'var(--t-text-muted)', padding: '1px 4px', lineHeight: 1 }}
                  >▼</button>
                </div>

                {/* emoji picker trigger */}
                <button
                  style={{ fontSize: 20, width: 36, height: 36, background: 'var(--t-surface-2)', border: '1px solid var(--t-line)', cursor: 'pointer', flexShrink: 0 }}
                  onClick={() => setEmojiPickerId(showEmoji ? null : link.id)}
                  title="Pick emoji"
                >
                  {link.emoji}
                </button>

                {/* label + path */}
                <div style={{ flex: 1, display: 'flex', gap: 10, minWidth: 0 }}>
                  <input
                    style={{ ...inputStyle, flex: 1 }}
                    value={link.label}
                    onChange={e => update(link.id, { label: e.target.value })}
                    placeholder="Label"
                    maxLength={32}
                  />
                  <input
                    style={{ ...inputStyle, flex: 1, fontFamily: 'monospace', fontSize: 11 }}
                    value={link.path}
                    onChange={e => update(link.id, { path: e.target.value })}
                    placeholder="/path"
                    maxLength={100}
                  />
                </div>

                {/* remove */}
                <button
                  onClick={() => removeLink(link.id)}
                  style={{ background: 'transparent', border: '1px solid rgba(255,59,48,.4)', color: 'var(--t-danger)', padding: '5px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}
                >
                  ×
                </button>
              </div>

              {/* emoji picker dropdown */}
              {showEmoji && (
                <div style={{ padding: '10px 14px 12px 60px', borderTop: '1px solid var(--t-line)', background: 'var(--t-surface-2)' }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--t-text-muted)', marginBottom: 8, letterSpacing: '.06em' }}>CHOOSE EMOJI</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {EMOJI_OPTIONS.map(em => (
                      <button
                        key={em}
                        style={{ fontSize: 18, width: 36, height: 36, background: link.emoji === em ? 'rgba(0,229,255,.15)' : 'var(--t-surface)', border: `1px solid ${link.emoji === em ? 'var(--t-accent)' : 'var(--t-line)'}`, cursor: 'pointer' }}
                        onClick={() => { update(link.id, { emoji: em }); setEmojiPickerId(null) }}
                      >
                        {em}
                      </button>
                    ))}
                    <input
                      type="text"
                      placeholder="Custom…"
                      maxLength={2}
                      style={{ width: 64, ...inputStyle, fontFamily: 'inherit', fontSize: 16, textAlign: 'center' }}
                      onKeyDown={e => { if (e.key === 'Enter' && e.target.value) { update(link.id, { emoji: e.target.value.trim() }); setEmojiPickerId(null) } }}
                    />
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* preview strip */}
      <div style={{ marginTop: 16, background: 'var(--t-surface)', border: '1px solid var(--t-line)', padding: '12px 16px' }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.06em', color: 'var(--t-text-muted)', textTransform: 'uppercase', marginBottom: 10 }}>Preview — Header Quick Links</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {links.map(link => (
            <div
              key={link.id}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', background: 'var(--t-surface-2)', border: '1px solid var(--t-line)', fontSize: 12, color: 'var(--t-text)', cursor: 'default' }}
            >
              <span style={{ fontSize: 14 }}>{link.emoji}</span>
              <span style={{ fontWeight: 500 }}>{link.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* save bar */}
      <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end' }}>
        <button
          style={{ background: 'var(--t-accent)', border: 'none', color: '#000', padding: '9px 24px', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
          onClick={() => onSave(links)}
        >
          Save Quick Links
        </button>
      </div>
    </div>
  )
}

/* ── Main export ──────────────────────────────────────────────────── */
export default function NavConfig() {
  const { session } = useAuth()
  const role = session?.person?.role_name || ''
  const isAdmin = /admin|owner|coo|ceo|cfo|president|chief/i.test(role)

  const [tab, setTab] = useState('builder')
  const [config, setConfig] = useState(buildDefaultConfig)
  const [links, setLinks] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [loadError, setLoadError] = useState(null)
  const { toast, show: showToast } = useToast()

  const nodeIds = useMemo(() => (session?.nodes || []).map(n => n.id).filter(Boolean), [session])
  const actorId = session?.person?.id || null

  const loadFromServer = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const { data, error } = await sb.rpc('hr_nav_get', { p_node_ids: nodeIds })
      if (error) throw error
      if (!data || data.ok === false) throw new Error(data?.error || 'load_failed')
      // Merge stored overrides over the full default catalog so newly-added
      // routes always appear (visible) even before they've been saved.
      setConfig({ ...buildDefaultConfig(), ...(data.nav || {}) })
      setLinks(Array.isArray(data.quick_links) ? data.quick_links : [])
    } catch (e) {
      setLoadError(e?.message || 'Could not load navigation configuration.')
      setConfig(buildDefaultConfig())
      setLinks([])
    } finally {
      setLoading(false)
    }
  }, [nodeIds])

  useEffect(() => { loadFromServer() }, [loadFromServer])

  if (!isAdmin) {
    return (
      <div style={{ padding: 24 }}>
        <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', padding: 48, textAlign: 'center' }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>🔒</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--t-text)', marginBottom: 8 }}>Admin Access Required</div>
          <div style={{ color: 'var(--t-text-muted)', fontSize: 13 }}>Navigation Configuration is restricted to Admin and Owner roles.</div>
        </div>
      </div>
    )
  }

  const saveNav = async () => {
    if (saving) return
    setSaving(true)
    try {
      const { data, error } = await sb.rpc('hr_nav_save', { p_node_ids: nodeIds, p_config: config, p_actor: actorId })
      if (error) throw error
      if (!data || data.ok === false) throw new Error(data?.error || 'save_failed')
      showToast('Navigation saved — refresh the sidebar to apply', 'success')
      loadFromServer()
    } catch (e) {
      showToast('Could not save navigation: ' + (e?.message || 'unknown error'), 'error')
    } finally {
      setSaving(false)
    }
  }

  const saveQL = async (newLinks) => {
    if (saving) return
    setSaving(true)
    try {
      const payload = (newLinks || []).map(l => ({ emoji: l.emoji, label: l.label, path: l.path }))
      const { data, error } = await sb.rpc('hr_quick_links_save', { p_node_ids: nodeIds, p_links: payload, p_actor: actorId })
      if (error) throw error
      if (!data || data.ok === false) throw new Error(data?.error || 'save_failed')
      showToast('Quick links saved', 'success')
      loadFromServer()
    } catch (e) {
      showToast('Could not save quick links: ' + (e?.message || 'unknown error'), 'error')
    } finally {
      setSaving(false)
    }
  }

  const resetAll = async () => {
    if (saving) return
    setSaving(true)
    try {
      const { data, error } = await sb.rpc('hr_nav_reset', { p_node_ids: nodeIds, p_actor: actorId })
      if (error) throw error
      if (!data || data.ok === false) throw new Error(data?.error || 'reset_failed')
      setConfig(buildDefaultConfig())
      showToast('Navigation reset to defaults — refresh sidebar to apply', 'warn')
      loadFromServer()
    } catch (e) {
      showToast('Could not reset navigation: ' + (e?.message || 'unknown error'), 'error')
    } finally {
      setSaving(false)
    }
  }

  const visCount = ALL_ITEMS_FLAT.filter(i => config[i.to]?.visible !== false).length
  const totalCount = ALL_ITEMS_FLAT.length

  const tabStyle = (active) => ({
    padding: '8px 18px', fontSize: 13, fontWeight: active ? 700 : 500,
    color: active ? 'var(--t-accent)' : 'var(--t-text-muted)',
    background: 'transparent', border: 'none',
    borderBottom: active ? '2px solid var(--t-accent)' : '2px solid transparent',
    cursor: 'pointer', marginBottom: -1, fontFamily: 'inherit', transition: 'color .15s',
  })

  const TABS = [
    { key: 'builder', label: `Menu Builder (${visCount}/${totalCount} visible)` },
    { key: 'quicklinks', label: `Quick Links (${links.length}/8)` },
  ]

  return (
    <div style={{ padding: 24, maxWidth: 1400 }}>
      {/* Header — no KPI panel, simple title per spec */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 18, gap: 16, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--t-text)', letterSpacing: '-.02em' }}>Navigation Configuration</div>
          <div style={{ fontSize: 12, color: 'var(--t-text-muted)', marginTop: 3 }}>
            Control visibility, labels, and order of all sidebar navigation items and quick links.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            style={{ background: 'transparent', border: '1px solid var(--t-danger)', color: 'var(--t-danger)', padding: '8px 16px', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
            onClick={resetAll}
          >
            Reset All Defaults
          </button>
          <button
            style={{ background: 'var(--t-accent)', border: 'none', color: '#000', padding: '8px 20px', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
            onClick={saveNav}
          >
            Save Navigation
          </button>
        </div>
      </div>

      {/* Role preview tabs (as described in spec) */}
      <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--t-line)', marginBottom: 20, paddingBottom: 0 }}>
        {TABS.map(t => (
          <button key={t.key} style={tabStyle(tab === t.key)} onClick={() => setTab(t.key)}>{t.label}</button>
        ))}
      </div>

      {/* Info banner */}
      <div style={{ marginBottom: 16, padding: '10px 14px', background: 'rgba(255,179,71,.06)', border: '1px solid rgba(255,179,71,.25)', color: 'var(--t-warn)', fontSize: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 14 }}>⚠</span>
        Changes to navigation require a page refresh to take effect in the sidebar. Click Save to persist.
      </div>

      {loadError && (
        <div style={{ marginBottom: 16, padding: '10px 14px', background: 'rgba(255,59,48,.08)', border: '1px solid rgba(255,59,48,.35)', color: 'var(--t-danger)', fontSize: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 14 }}>⚠</span>
          Could not load saved navigation ({loadError}). Showing defaults — saving will overwrite them.
          <button
            onClick={loadFromServer}
            style={{ marginLeft: 'auto', background: 'transparent', border: '1px solid var(--t-danger)', color: 'var(--t-danger)', padding: '4px 12px', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
          >
            Retry
          </button>
        </div>
      )}

      {loading ? (
        <div style={{ padding: '48px', textAlign: 'center', color: 'var(--t-text-muted)', fontSize: 13, background: 'var(--t-surface)', border: '1px solid var(--t-line)' }}>
          Loading navigation configuration…
        </div>
      ) : (
        <>
          {tab === 'builder' && (
            <MenuBuilderTab config={config} setConfig={setConfig} onSave={saveNav} />
          )}
          {tab === 'quicklinks' && (
            <QuickLinksTab links={links} setLinks={setLinks} onSave={saveQL} />
          )}
        </>
      )}

      {/* bottom action bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 24, padding: '14px 18px', background: 'var(--t-surface)', border: '1px solid var(--t-line)' }}>
        <button
          onClick={resetAll}
          style={{ background: 'transparent', border: '1px solid var(--t-danger)', color: 'var(--t-danger)', padding: '8px 16px', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
        >
          Reset All to Defaults
        </button>
        <button
          onClick={saveNav}
          style={{ background: 'var(--t-accent)', border: 'none', color: '#000', padding: '9px 28px', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
        >
          Save and Apply Navigation
        </button>
      </div>

      {toast && <Toast message={toast.msg} type={toast.type} />}
    </div>
  )
}
