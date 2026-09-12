import { useState, useEffect, useMemo, useCallback } from 'react'
import { useAuth } from '../lib/auth.jsx'
import { useScope } from '../lib/scope.jsx'
import { sb } from '../lib/supabase'
import { useFeatureFlag } from '../lib/featureFlags.js'
import DrillDown from '../components/DrillDown.jsx'
import ItemDrawer from '../components/ItemDrawer.jsx'
import { useNavigate } from 'react-router-dom'

// ── Helpers ───────────────────────────────────────────────────────────────────
function relativeTime(iso) {
  if (!iso) return ''
  const diff = Date.now() - new Date(iso).getTime()
  const s = Math.floor(diff / 1000)
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  return `${d}d ago`
}

const CATEGORIES = {
  TIME:     { label: 'Time & Attendance', color: 'var(--t-danger)',  icon: '🕐', filterKey: 'time' },
  APPROVAL: { label: 'Approvals Pending', color: 'var(--t-warn)',    icon: '📋', filterKey: 'approvals' },
  HR:       { label: 'HR Alerts',         color: 'var(--t-danger)',  icon: '⚠',  filterKey: 'hr' },
  MESSAGE:  { label: 'Messages',          color: 'var(--t-accent)',  icon: '💬', filterKey: 'messages' },
  INFO:     { label: 'Completed / Info',  color: 'var(--t-success)', icon: '✅', filterKey: 'completed' },
}

// ── Shared styles ─────────────────────────────────────────────────────────────
const selStyle = {
  padding: '6px 10px',
  background: 'var(--t-surface-2)',
  border: '1px solid var(--t-line)',
  color: 'var(--t-text)',
  fontSize: 12,
  borderRadius: 0,
  outline: 'none',
  cursor: 'pointer',
}

const btnStyle = {
  padding: '5px 12px',
  background: 'var(--t-surface-2)',
  border: '1px solid var(--t-line)',
  color: 'var(--t-text-muted)',
  fontSize: 11,
  fontWeight: 600,
  borderRadius: 0,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
}

// ── KPI Tile ──────────────────────────────────────────────────────────────────
function KTile({ label, value, sub, color, alert, onClick }) {
  return (
    <div onClick={onClick} title={onClick ? 'Click to drill into records' : undefined} style={{
      background: 'var(--t-surface)',
      border: `1px solid ${alert === 'red' ? 'var(--t-danger)' : alert === 'amber' ? 'var(--t-warn)' : 'var(--t-line)'}`,
      padding: '14px 16px',
      position: 'relative',
      overflow: 'hidden',
      borderRadius: 0,
      cursor: onClick ? 'pointer' : 'default',
    }}>
      {alert === 'red' && <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'var(--t-danger)' }} />}
      {alert === 'amber' && <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'var(--t-warn)' }} />}
      {!alert && <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: color || 'var(--t-accent)' }} />}
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.08em', color: 'var(--t-text-muted)', textTransform: 'uppercase', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800, color: color || 'var(--t-text)', lineHeight: 1, marginBottom: 4 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--t-text-faint)' }}>{sub}</div>}
    </div>
  )
}

// ── Toast ─────────────────────────────────────────────────────────────────────
function useToast() {
  const [toasts, setToasts] = useState([])
  const push = useCallback((msg) => {
    const id = Date.now()
    setToasts(t => [...t, { id, msg }])
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3000)
  }, [])
  return { toasts, push }
}

function ToastContainer({ toasts }) {
  if (!toasts.length) return null
  return (
    <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 9999, display: 'flex', flexDirection: 'column', gap: 8 }}>
      {toasts.map(t => (
        <div key={t.id} style={{
          background: 'var(--t-success)',
          color: '#000',
          padding: '10px 18px',
          fontSize: 13,
          fontWeight: 700,
          borderRadius: 0,
          boxShadow: '0 4px 20px rgba(0,0,0,.4)',
          animation: 'notif-slide-in 0.25s ease',
        }}>
          {t.msg}
        </div>
      ))}
      <style>{`@keyframes notif-slide-in { from { transform: translateX(60px); opacity: 0 } to { transform: translateX(0); opacity: 1 } }`}</style>
    </div>
  )
}

// ── Notification Card ─────────────────────────────────────────────────────────
function NotifCard({ notif, onMarkRead, onAction, isManager, onOpen }) {
  const [hovered, setHovered] = useState(false)
  const cat = CATEGORIES[notif.category]

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex',
        alignItems: 'stretch',
        background: notif.read ? 'var(--t-surface)' : 'var(--t-surface-2)',
        border: '1px solid var(--t-line)',
        borderLeft: `3px solid ${cat.color}`,
        position: 'relative',
        transition: 'background 0.12s',
        opacity: notif.read ? 0.8 : 1,
        borderRadius: 0,
      }}
    >
      {/* Unread dot */}
      {!notif.read && (
        <div style={{
          position: 'absolute',
          top: '50%',
          left: 10,
          transform: 'translateY(-50%)',
          width: 7,
          height: 7,
          borderRadius: '50%',
          background: 'var(--t-accent)',
          flexShrink: 0,
        }} />
      )}

      {/* Main content — click to drill into the notification detail */}
      <div onClick={() => onOpen && onOpen(notif)} title="Click for detail & actions" style={{ flex: 1, padding: '12px 16px 12px 24px', display: 'flex', alignItems: 'flex-start', gap: 12, cursor: onOpen ? 'pointer' : 'default' }}>
        {/* Icon */}
        <div style={{ fontSize: 18, lineHeight: 1, marginTop: 1, flexShrink: 0 }}>{cat.icon}</div>

        {/* Body */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, color: 'var(--t-text)', lineHeight: 1.5, marginBottom: 7 }}>{notif.message}</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            {/* Employee chip */}
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                background: 'rgba(0,229,255,0.08)',
                border: '1px solid rgba(0,229,255,0.18)',
                color: 'var(--t-accent)',
                padding: '2px 8px',
                cursor: 'pointer',
                borderRadius: 0,
              }}
              onClick={() => { window.location.hash = '#/employee-360' }}
            >
              {notif.employee}
            </span>
            {/* Location chip */}
            <span style={{
              fontSize: 11,
              background: 'var(--t-surface-2)',
              border: '1px solid var(--t-line)',
              color: 'var(--t-text-muted)',
              padding: '2px 8px',
              borderRadius: 0,
            }}>
              {notif.location}
            </span>
            {/* Timestamp */}
            <span style={{ fontSize: 11, color: 'var(--t-text-faint)', fontFamily: 'monospace' }}>
              {relativeTime(notif.ts)}
            </span>
            {/* Category badge */}
            <span style={{
              fontSize: 10,
              fontWeight: 700,
              color: cat.color,
              textTransform: 'uppercase',
              letterSpacing: '.06em',
            }}>
              {cat.label}
            </span>
          </div>
        </div>
      </div>

      {/* Right actions */}
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 6, padding: '12px 14px', borderLeft: '1px solid var(--t-line)', flexShrink: 0, minWidth: 120 }}>
        {/* Contextual action */}
        {notif.action && (
          notif.action === 'link' ? (
            <button
              onClick={() => { window.location.hash = `#${notif.linkTo}` }}
              style={{ ...btnStyle, color: 'var(--t-accent)', borderColor: 'rgba(0,229,255,.3)', background: 'rgba(0,229,255,.07)' }}
            >
              {notif.actionLabel}
            </button>
          ) : (
            <button
              onClick={() => onAction(notif)}
              style={{ ...btnStyle, color: 'var(--t-accent)', borderColor: 'rgba(0,229,255,.3)', background: 'rgba(0,229,255,.07)' }}
            >
              {notif.actionLabel}
            </button>
          )
        )}
        {/* Mark Read */}
        {(!notif.read || hovered) && (
          <button
            onClick={() => onMarkRead(notif.id)}
            style={{ ...btnStyle, fontSize: 10, opacity: notif.read ? 0.5 : 1 }}
          >
            {notif.read ? '✓ Read' : 'Mark Read'}
          </button>
        )}
      </div>
    </div>
  )
}

// ── Preferences Panel ─────────────────────────────────────────────────────────
const PREF_DEFAULTS = {
  time: true,
  approvals: true,
  hr: true,
  messages: true,
  completed: true,
}

function PrefPanel({ prefs, onToggle }) {
  const [open, setOpen] = useState(false)
  const toggle = (key) => onToggle(key)

  return (
    <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', borderRadius: 0 }}>
      <div
        onClick={() => setOpen(o => !o)}
        style={{
          padding: '12px 16px',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          userSelect: 'none',
        }}
      >
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--t-text-muted)' }}>
          Notification Preferences
        </div>
        <span style={{ fontSize: 11, color: 'var(--t-text-faint)' }}>{open ? '▲' : '▼'}</span>
      </div>
      {open && (
        <div style={{ borderTop: '1px solid var(--t-line)', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ fontSize: 12, color: 'var(--t-text-muted)', marginBottom: 4 }}>
            Toggle which notification categories appear in your feed.
            Saved to your local preferences on this device.
          </div>
          {Object.entries(CATEGORIES).map(([key, cat]) => (
            <div key={key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 16 }}>{cat.icon}</span>
                <span style={{ fontSize: 13, color: 'var(--t-text)' }}>Notify me about {cat.label}</span>
              </div>
              <button
                onClick={() => toggle(cat.filterKey)}
                style={{
                  width: 44,
                  height: 22,
                  background: prefs[cat.filterKey] ? 'var(--t-success)' : 'var(--t-surface-2)',
                  border: `1px solid ${prefs[cat.filterKey] ? 'var(--t-success)' : 'var(--t-line)'}`,
                  borderRadius: 11,
                  cursor: 'pointer',
                  position: 'relative',
                  transition: 'background 0.2s',
                  padding: 0,
                }}
                aria-label={`Toggle ${cat.label}`}
              >
                <div style={{
                  position: 'absolute',
                  top: 3,
                  left: prefs[cat.filterKey] ? 23 : 3,
                  width: 14,
                  height: 14,
                  borderRadius: '50%',
                  background: '#fff',
                  transition: 'left 0.2s',
                }} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function NotificationCenter() {
  const enabled = useFeatureFlag('notifications')
  const { session } = useAuth()
  const person = session?.person
  const { locationIds } = useScope() || {}

  const r = (session?.person?.role_name || '').toLowerCase()
  const isManager = ['ceo', 'hr', 'manager', 'coo', 'admin', 'owner'].some(x => r.includes(x))

  const { toasts, push: pushToast } = useToast()

  const [notifications, setNotifications] = useState([])
  const [realCounts, setRealCounts] = useState({ pto: null, tasks: null })
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)
  const [activeFilter, setActiveFilter] = useState('all')
  const [unreadOnly, setUnreadOnly] = useState(false)
  const [drill, setDrill] = useState(null)
  const [detail, setDetail] = useState(null)
  const navigate = useNavigate()

  // Category-visibility preferences (a local per-device UI setting — not a data store).
  const [prefs, setPrefs] = useState(() => {
    try { const s = localStorage.getItem('vip_notif_prefs'); return s ? { ...PREF_DEFAULTS, ...JSON.parse(s) } : { ...PREF_DEFAULTS } }
    catch { return { ...PREF_DEFAULTS } }
  })
  const togglePref = useCallback((key) => {
    setPrefs(prev => {
      const next = { ...prev, [key]: !prev[key] }
      try { localStorage.setItem('vip_notif_prefs', JSON.stringify(next)) } catch (_) {}
      return next
    })
  }, [])

  // ── Load the real, unified notification feed + pending-approval counts ───────
  // Every item comes from live HR tables via get_notification_center; the two
  // pending-count RPCs feed the "Pending Approvals" KPI. No fabricated rows.
  const load = useCallback(async () => {
    if (!Array.isArray(locationIds) || locationIds.length === 0) {
      setNotifications([]); setLoading(false); return
    }
    setLoading(true); setLoadError(null)
    try {
      const [feed, pto, tasks] = await Promise.all([
        sb.rpc('get_notification_center', { p_person_id: person?.id ?? null, p_node_ids: locationIds }),
        sb.rpc('get_pending_pto_count', { p_node_ids: locationIds }),
        sb.rpc('get_pending_tasks_count', { p_node_ids: locationIds }),
      ])
      if (feed.error) throw feed.error
      const items = Array.isArray(feed.data?.items) ? feed.data.items : []
      setNotifications(items)
      setRealCounts({
        pto: (!pto.error && typeof pto.data === 'number') ? pto.data : null,
        tasks: (!tasks.error && typeof tasks.data === 'number') ? tasks.data : null,
      })
    } catch (e) {
      setLoadError(e?.message || 'Could not load notifications.')
      setNotifications([])
    } finally {
      setLoading(false)
    }
  }, [locationIds, person?.id])

  useEffect(() => { load() }, [load])

  // Dispatch unread count so Shell.jsx can update badge
  useEffect(() => {
    const unread = notifications.filter(n => !n.read).length
    window.dispatchEvent(new CustomEvent('vip_notif_count', { detail: { count: unread } }))
  }, [notifications])

  // Feature flag gate
  if (!enabled) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 400, gap: 16, color: 'var(--t-text-muted)' }}>
        <div style={{ fontSize: 48 }}>🔔</div>
        <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--t-text)' }}>Notifications Disabled</div>
        <div style={{ fontSize: 14 }}>This feature is currently disabled. Enable it in Feature Flags.</div>
      </div>
    )
  }

  // ── Derived counts (all from the real feed) ─────────────────────────────────
  const unreadCount = useMemo(() => notifications.filter(n => !n.read).length, [notifications])
  const feedApprovals = useMemo(() => notifications.filter(n => n.category === 'APPROVAL').length, [notifications])
  // Prefer the dedicated pending-count RPCs when available; else the feed's own count.
  const pendingApprovals = (realCounts.pto != null || realCounts.tasks != null)
    ? (realCounts.pto || 0) + (realCounts.tasks || 0)
    : feedApprovals
  const hrAlerts = useMemo(() => notifications.filter(n => n.category === 'HR').length, [notifications])
  const resolvedToday = useMemo(() => notifications.filter(n => n.category === 'INFO').length, [notifications])

  // ── Drill-down: every KPI tile opens the notifications behind it ──────────────
  const NOTIF_COLS = [
    { key: 'message', label: 'Notification', value: n => n.message },
    { key: 'employee', label: 'Employee', value: n => n.employee },
    { key: 'location', label: 'Location', value: n => n.location },
    { key: 'category', label: 'Type', value: n => CATEGORIES[n.category]?.label || n.category },
    { key: 'ts', label: 'When', value: n => relativeTime(n.ts), sortKey: n => n.ts },
    { key: 'read', label: 'Status', value: n => (n.read ? 'Read' : 'Unread') },
  ]
  const openDrill = (title, rows, accent) => setDrill({ title, subtitle: `${rows.length} record${rows.length === 1 ? '' : 's'}`, columns: NOTIF_COLS, rows, accent })

  // ── Filtered list ───────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    return notifications.filter(n => {
      const fk = CATEGORIES[n.category]?.filterKey
      // Preference panel hides categories the user opted out of.
      if (fk && prefs[fk] === false) return false
      if (activeFilter !== 'all' && fk !== activeFilter) return false
      if (unreadOnly && n.read) return false
      return true
    })
  }, [notifications, activeFilter, unreadOnly, prefs])

  // ── Actions (real writes → local reflect) ───────────────────────────────────
  const markRead = useCallback(async (id) => {
    if (!id || !person?.id) return
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n))
    try {
      const { error } = await sb.rpc('notif_mark_read', { p_person_id: person.id, p_notif_key: id })
      if (error) throw error
    } catch (_) {
      // Revert the optimistic flip so the badge never lies.
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: false } : n))
      pushToast('Could not mark as read — please retry')
    }
  }, [person?.id, pushToast])

  const markAllRead = useCallback(async () => {
    if (!person?.id) return
    const prev = notifications
    setNotifications(ns => ns.map(n => ({ ...n, read: true })))
    try {
      const { error } = await sb.rpc('notif_mark_all_read', { p_person_id: person.id, p_node_ids: locationIds })
      if (error) throw error
      pushToast('All notifications marked as read')
    } catch (_) {
      setNotifications(prev)
      pushToast('Could not mark all read — please retry')
    }
  }, [person?.id, locationIds, notifications, pushToast])

  // Non-link actions no longer exist in the real feed (every actionable item is a
  // link into the owning screen). Kept as a safe no-op fallback for older shapes.
  const handleAction = useCallback((notif) => {
    if (notif?.linkTo) { navigate(notif.linkTo) }
    markRead(notif.id)
  }, [navigate, markRead])

  // Filter tabs config
  const FILTER_TABS = [
    { key: 'all',       label: 'All' },
    { key: 'time',      label: 'Time & Attendance' },
    { key: 'approvals', label: 'Approvals' },
    { key: 'hr',        label: 'HR Alerts' },
    { key: 'messages',  label: 'Messages' },
    { key: 'completed', label: 'Completed' },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <ToastContainer toasts={toasts} />

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--t-text)', letterSpacing: '-.02em' }}>
            NOTIFICATION CENTER
            {unreadCount > 0 && (
              <span style={{
                marginLeft: 12,
                background: 'var(--t-danger)',
                color: '#fff',
                borderRadius: 12,
                fontSize: 13,
                fontWeight: 800,
                padding: '2px 10px',
                verticalAlign: 'middle',
              }}>
                {unreadCount}
              </span>
            )}
          </div>
          <div style={{ fontSize: 12, color: 'var(--t-text-muted)', marginTop: 3 }}>
            All alerts, approvals, and reminders in one place
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Unread Only toggle */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, color: 'var(--t-text-muted)' }}>Unread Only</span>
            <button
              onClick={() => setUnreadOnly(o => !o)}
              style={{
                width: 44,
                height: 22,
                background: unreadOnly ? 'var(--t-accent)' : 'var(--t-surface-2)',
                border: `1px solid ${unreadOnly ? 'var(--t-accent)' : 'var(--t-line)'}`,
                borderRadius: 11,
                cursor: 'pointer',
                position: 'relative',
                padding: 0,
                transition: 'background 0.2s',
              }}
              aria-label="Toggle unread only"
            >
              <div style={{
                position: 'absolute',
                top: 3,
                left: unreadOnly ? 23 : 3,
                width: 14,
                height: 14,
                borderRadius: '50%',
                background: '#fff',
                transition: 'left 0.2s',
              }} />
            </button>
          </div>
          {/* Mark all read */}
          {isManager && (
            <button onClick={markAllRead} style={{ ...btnStyle, borderColor: 'rgba(0,229,255,.3)', color: 'var(--t-accent)' }}>
              Mark All Read
            </button>
          )}
        </div>
      </div>

      {/* Manager KPIs */}
      {isManager && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
          <KTile
            label="Unread"
            value={unreadCount}
            sub="pending review"
            color={unreadCount > 5 ? 'var(--t-danger)' : 'var(--t-text-muted)'}
            alert={unreadCount > 5 ? 'red' : null}
            onClick={() => openDrill('Unread Notifications', notifications.filter(n => !n.read), 'var(--t-danger)')}
          />
          <KTile
            label="Pending Approvals"
            value={pendingApprovals}
            sub={(realCounts.pto != null || realCounts.tasks != null)
              ? `${realCounts.pto || 0} PTO · ${realCounts.tasks || 0} tasks`
              : 'awaiting action'}
            color="var(--t-warn)"
            alert={pendingApprovals > 0 ? 'amber' : null}
            onClick={() => openDrill('Pending Approvals', notifications.filter(n => n.category === 'APPROVAL'), 'var(--t-warn)')}
          />
          <KTile
            label="HR Alerts"
            value={hrAlerts}
            sub="require attention"
            color="var(--t-danger)"
            alert={hrAlerts > 0 ? 'red' : null}
            onClick={() => openDrill('HR Alerts', notifications.filter(n => n.category === 'HR'), 'var(--t-danger)')}
          />
          <KTile
            label="Resolved Today"
            value={resolvedToday}
            sub="completed items"
            color="var(--t-success)"
            onClick={() => openDrill('Resolved / Completed', notifications.filter(n => n.category === 'INFO'), 'var(--t-success)')}
          />
        </div>
      )}

      {/* Filter bar */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--t-line)', flexWrap: 'wrap' }}>
        {FILTER_TABS.map(tab => {
          const active = activeFilter === tab.key
          // Badge count for filter tabs
          let badge = 0
          if (tab.key === 'time') badge = notifications.filter(n => n.category === 'TIME' && !n.read).length
          if (tab.key === 'approvals') badge = notifications.filter(n => n.category === 'APPROVAL' && !n.read).length
          if (tab.key === 'hr') badge = notifications.filter(n => n.category === 'HR' && !n.read).length
          if (tab.key === 'messages') badge = notifications.filter(n => n.category === 'MESSAGE' && !n.read).length
          return (
            <button
              key={tab.key}
              onClick={() => setActiveFilter(tab.key)}
              style={{
                padding: '9px 16px',
                fontSize: 12,
                fontWeight: active ? 700 : 500,
                color: active ? 'var(--t-accent)' : 'var(--t-text-muted)',
                background: 'transparent',
                border: 'none',
                borderBottom: active ? '2px solid var(--t-accent)' : '2px solid transparent',
                cursor: 'pointer',
                marginBottom: -1,
                transition: 'all .15s',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                borderRadius: 0,
              }}
            >
              {tab.label}
              {badge > 0 && (
                <span style={{ background: 'var(--t-danger)', color: '#fff', borderRadius: 8, fontSize: 9, padding: '1px 5px', fontWeight: 800 }}>
                  {badge}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Result count */}
      <div style={{ fontSize: 12, color: 'var(--t-text-muted)' }}>
        Showing <strong style={{ color: 'var(--t-text)' }}>{filtered.length}</strong> notification{filtered.length !== 1 ? 's' : ''}
        {unreadOnly && ' (unread only)'}
        {activeFilter !== 'all' && ` · ${FILTER_TABS.find(t => t.key === activeFilter)?.label}`}
      </div>

      {/* Notification list */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px 16px', color: 'var(--t-text-faint)', fontSize: 13 }}>
          Loading notifications…
        </div>
      ) : loadError ? (
        <div style={{ textAlign: 'center', padding: '48px 16px', color: 'var(--t-danger)', fontSize: 13, display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center' }}>
          <div>Could not load notifications.</div>
          <div style={{ fontSize: 11, color: 'var(--t-text-faint)', maxWidth: 420 }}>{loadError}</div>
          <button onClick={load} style={{ ...btnStyle, borderColor: 'rgba(0,229,255,.3)', color: 'var(--t-accent)' }}>Retry</button>
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 16px', color: 'var(--t-text-faint)', fontSize: 13 }}>
          {unreadOnly ? 'No unread notifications in this category.'
            : activeFilter !== 'all' ? 'No notifications in this category.'
            : 'No notifications right now — you are all caught up.'}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.map(notif => (
            <NotifCard
              key={notif.id}
              notif={notif}
              onMarkRead={markRead}
              onAction={handleAction}
              isManager={isManager}
              onOpen={setDetail}
            />
          ))}
        </div>
      )}

      {/* Preferences panel */}
      <PrefPanel prefs={prefs} onToggle={togglePref} />

      <DrillDown open={!!drill} onClose={() => setDrill(null)} {...(drill || {})} />

      {/* Notification detail — drill-down + permission-gated actions */}
      <ItemDrawer
        open={!!detail} onClose={() => setDetail(null)}
        entityType="notification" entityId={detail?.id}
        title={detail ? (CATEGORIES[detail.category]?.label || 'Notification') : ''}
        subtitle={detail ? `${detail.employee || ''}${detail.location ? ' · ' + detail.location : ''}` : ''}
        actorId={person?.id}
        accent={detail ? (CATEGORIES[detail.category]?.color || 'var(--t-accent)') : 'var(--t-accent)'}
        fields={detail ? [
          { label: 'Detail', value: detail.message },
          { label: 'Employee', value: detail.employee },
          { label: 'Location', value: detail.location },
          { label: 'Category', value: CATEGORIES[detail.category]?.label },
          { label: 'When', value: detail.ts ? relativeTime(detail.ts) : detail.time },
          { label: 'Status', value: detail.read ? 'Read' : 'Unread' },
        ] : []}
        actions={detail ? (
          <>
            {/* Permission-gated action: managers can act; the linked action opens the right screen */}
            {isManager && detail.linkTo && (
              <button onClick={() => { navigate(detail.linkTo); setDetail(null) }}
                style={{ padding: '7px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer', background: 'var(--t-accent)', color: '#04121a', border: 'none' }}>
                ✎ {detail.actionLabel || 'Open & Edit'}
              </button>
            )}
            {isManager && detail.action && !detail.linkTo && (
              <button onClick={() => { handleAction(detail); setDetail(null) }}
                style={{ padding: '7px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer', background: 'var(--t-accent)', color: '#04121a', border: 'none' }}>
                {detail.actionLabel || 'Take Action'}
              </button>
            )}
            {!detail.read && (
              <button onClick={() => { markRead(detail.id); setDetail(d => d ? { ...d, read: true } : d) }}
                style={{ padding: '7px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer', background: 'transparent', color: 'var(--t-text-muted)', border: '1px solid var(--t-line)' }}>
                ✓ Mark Read
              </button>
            )}
            {!isManager && (
              <span style={{ fontSize: 11, color: 'var(--t-text-faint)', alignSelf: 'center' }}>View only — actions require manager access</span>
            )}
          </>
        ) : null}
      />
    </div>
  )
}
