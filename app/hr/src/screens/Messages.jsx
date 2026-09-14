import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useAuth } from '../lib/auth.jsx';
import { useScope } from '../lib/scope.jsx';
import { sb } from '../lib/supabase';
import DrillDown from '../components/DrillDown.jsx';

/* ─── constants (styling only — NO data) ─────────────────────────────────────── */

const AVATAR_COLORS = [
  '#0d2a38','#0d1f38','#0d3820','#221038','#381028',
  '#381a0d','#0d2832','#2a1a0d','#0d3030','#2a0d38',
];

/* ─── helpers ─────────────────────────────────────────────────────────────── */

function formatAgo(ts) {
  if (!ts) return '';
  const diff = Date.now() - new Date(ts).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(ts).toLocaleDateString([], { month: 'numeric', day: 'numeric' });
}

function formatTime(ts) {
  if (!ts) return '';
  return new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function formatDuration(ms) {
  if (ms == null) return '—';
  const m = Math.round(ms / 60000);
  if (m < 1) return '<1m';
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

function initials(name) {
  return (name || '?')
    .split(' ')
    .map(p => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

function avatarColor(name) {
  const idx = (name || '?').charCodeAt(0) % AVATAR_COLORS.length;
  return AVATAR_COLORS[idx];
}

/* Normalize one get_messages row → a flat message shape. */
function normMsg(m) {
  return {
    id: m.id,
    from_id: m.from_id ?? null,
    to_id: m.to_id ?? null,
    from_name: m.from_name ?? null,
    to_name: m.to_name ?? null,
    body: m.body ?? '',
    sent_at: m.sent_at ?? m.created_at ?? null,
    read_at: m.read_at ?? null,
  };
}

/* Group flat DM rows into 1:1 conversation threads for the signed-in user. */
function buildThreads(rawMessages, personId, dirById, stateByOther) {
  const threadMap = {};
  rawMessages.forEach(raw => {
    const m = normMsg(raw);
    const otherId = m.from_id === personId ? m.to_id : m.from_id;
    if (!otherId) return; // cannot attribute → skip rather than fake
    const dir = dirById[otherId];
    const otherName = dir?.full_name
      || (m.from_id === personId ? m.to_name : m.from_name)
      || 'Unknown';
    if (!threadMap[otherId]) {
      const st = stateByOther[otherId] || {};
      threadMap[otherId] = {
        thread_id: otherId,          // conversation key = the other party's id
        other_id: otherId,
        other_name: otherName,
        location: dir?.node_name || '',
        role: dir?.role_name || '',
        messages: [],
        starred: !!st.starred,
        archived: !!st.archived,
      };
    }
    threadMap[otherId].messages.push(m);
  });

  return Object.values(threadMap).map(t => {
    t.messages.sort((a, b) => new Date(a.sent_at || 0) - new Date(b.sent_at || 0));
    t.last_message = t.messages[t.messages.length - 1] || null;
    // unread = any inbound (to me) message not yet read
    t.unread = t.messages.some(m => m.to_id === personId && !m.read_at);
    return t;
  }).sort((a, b) =>
    new Date(b.last_message?.sent_at || 0) - new Date(a.last_message?.sent_at || 0)
  );
}

/* Real average first-response time: time between an inbound message and my next reply. */
function computeAvgResponseMs(threads, personId) {
  let total = 0, n = 0;
  const week = 7 * 864e5;
  threads.forEach(t => {
    const msgs = t.messages;
    for (let i = 1; i < msgs.length; i++) {
      const prev = msgs[i - 1], cur = msgs[i];
      if (prev.from_id !== personId && cur.from_id === personId) {
        const d = new Date(cur.sent_at) - new Date(prev.sent_at);
        if (d > 0 && d < week) { total += d; n++; }
      }
    }
  });
  return n ? total / n : null;
}

/* ─── KPI tile ─────────────────────────────────────────────────────────────── */

function KTile({ label, value, sub, color, alert, onClick }) {
  return (
    <div onClick={onClick} title={onClick ? 'Click to drill into records' : undefined} style={{
      background: 'var(--t-surface)',
      border: `1px solid ${alert === 'red' ? 'var(--t-danger)' : alert === 'amber' ? 'var(--t-warn)' : 'var(--t-line)'}`,
      padding: '14px 16px',
      position: 'relative',
      overflow: 'hidden',
      flex: 1,
      minWidth: 0,
      cursor: onClick ? 'pointer' : 'default',
    }}>
      {alert === 'red' && (
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'var(--t-danger)' }} />
      )}
      {alert === 'amber' && (
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'var(--t-warn)' }} />
      )}
      <div style={{
        fontSize: 10, fontWeight: 700, letterSpacing: '.08em',
        color: 'var(--t-text-muted)', textTransform: 'uppercase', marginBottom: 6,
      }}>
        {label}
      </div>
      <div style={{
        fontSize: 24, fontWeight: 800, color: color || 'var(--t-text)',
        lineHeight: 1, marginBottom: 4,
      }}>
        {value}
      </div>
      {sub && (
        <div style={{ fontSize: 11, color: 'var(--t-text-faint)' }}>{sub}</div>
      )}
    </div>
  );
}

/* ─── Avatar ───────────────────────────────────────────────────────────────── */

function Avatar({ name, size = 30 }) {
  return (
    <div style={{
      width: size,
      height: size,
      flexShrink: 0,
      background: avatarColor(name),
      border: '1px solid var(--t-line)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: size * 0.36,
      fontWeight: 700,
      color: 'var(--t-accent)',
      letterSpacing: 0.5,
      userSelect: 'none',
      borderRadius: 0,
    }}>
      {initials(name)}
    </div>
  );
}

/* ─── Spinner ──────────────────────────────────────────────────────────────── */

function Spinner() {
  return (
    <div style={{
      width: 16, height: 16,
      border: '2px solid var(--t-line)',
      borderTopColor: 'var(--t-accent)',
      borderRadius: '50%',
      animation: 'msg-spin 0.7s linear infinite',
      flexShrink: 0,
    }} />
  );
}

/* ─── EmptyPane ────────────────────────────────────────────────────────────── */

function EmptyPane({ icon, text }) {
  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      color: 'var(--t-text-faint)', fontSize: 13, gap: 10, padding: 24,
    }}>
      <div style={{ fontSize: 32, opacity: 0.3 }}>{icon}</div>
      <div style={{ textAlign: 'center' }}>{text}</div>
    </div>
  );
}

/* ─── Sidebar ──────────────────────────────────────────────────────────────── */

function Sidebar({ folder, setFolder, unread, counts }) {
  const FOLDERS = [
    { id: 'inbox',    label: 'Inbox',   icon: '✉', badge: unread },
    { id: 'starred',  label: 'Starred', icon: '★', badge: 0 },
    { id: 'archived', label: 'Archive', icon: '⊟', badge: 0 },
  ];

  const navItem = (f) => {
    const active = folder === f.id;
    const count = counts[f.id] ?? 0;
    return (
      <div
        key={f.id}
        onClick={() => setFolder(f.id)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '7px 12px',
          cursor: 'pointer',
          background: active ? 'rgba(0,229,255,0.08)' : 'transparent',
          borderLeft: active ? '2px solid var(--t-accent)' : '2px solid transparent',
          color: active ? 'var(--t-accent)' : 'var(--t-text-muted)',
          fontSize: 13,
          fontWeight: active ? 600 : 400,
          userSelect: 'none',
          transition: 'background 0.15s',
        }}
      >
        <span style={{ fontSize: 13, width: 16, textAlign: 'center', flexShrink: 0 }}>{f.icon}</span>
        <span style={{ flex: 1 }}>{f.label}</span>
        {(f.id === 'inbox' ? unread : count) > 0 && (
          <span style={{
            background: f.id === 'inbox' ? 'var(--t-accent)' : 'var(--t-surface-2)',
            color: f.id === 'inbox' ? '#000' : 'var(--t-text-faint)',
            border: f.id === 'inbox' ? 'none' : '1px solid var(--t-line)',
            fontSize: 10,
            fontWeight: 700,
            padding: '1px 6px',
            letterSpacing: 0.5,
          }}>
            {f.id === 'inbox' ? unread : count}
          </span>
        )}
      </div>
    );
  };

  return (
    <div style={{
      width: 168,
      flexShrink: 0,
      background: 'var(--t-surface)',
      borderRight: '1px solid var(--t-line)',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
    }}>
      <div style={{
        padding: '14px 12px 6px',
        fontSize: 10, fontWeight: 700, letterSpacing: 1.2,
        color: 'var(--t-text-faint)', textTransform: 'uppercase',
      }}>
        Folders
      </div>
      {FOLDERS.map(navItem)}
      <div style={{ flex: 1 }} />
    </div>
  );
}

/* ─── LocationTabStrip ─────────────────────────────────────────────────────── */

function LocationTabStrip({ activeLocation, onSelect, locations, threadsByLocation }) {
  const tabs = ['All', ...locations];

  return (
    <div style={{
      display: 'flex',
      gap: 0,
      borderBottom: '1px solid var(--t-line)',
      background: 'var(--t-surface)',
      flexShrink: 0,
      overflowX: 'auto',
    }}>
      {tabs.map(loc => {
        const isActive = activeLocation === loc;
        const count = loc === 'All'
          ? Object.values(threadsByLocation).reduce((s, n) => s + n, 0)
          : (threadsByLocation[loc] || 0);
        return (
          <button
            key={loc}
            onClick={() => onSelect(loc)}
            style={{
              padding: '8px 14px',
              background: 'none',
              border: 'none',
              borderBottom: isActive
                ? '2px solid var(--t-accent)'
                : '2px solid transparent',
              color: isActive ? 'var(--t-accent)' : 'var(--t-text-muted)',
              fontSize: 11,
              fontWeight: isActive ? 700 : 400,
              letterSpacing: isActive ? 0.8 : 0.4,
              cursor: 'pointer',
              textTransform: 'uppercase',
              whiteSpace: 'nowrap',
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              transition: 'color 0.15s, border-color 0.15s',
              flexShrink: 0,
            }}
          >
            {loc}
            {count > 0 && (
              <span style={{
                fontSize: 9,
                fontWeight: 700,
                color: isActive ? '#000' : 'var(--t-text-faint)',
                background: isActive ? 'var(--t-accent)' : 'var(--t-surface-2)',
                border: `1px solid ${isActive ? 'var(--t-accent)' : 'var(--t-line)'}`,
                padding: '0 4px',
                lineHeight: '14px',
                letterSpacing: 0,
              }}>
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/* ─── FilterBar ────────────────────────────────────────────────────────────── */

function FilterBar({ filters, onFiltersChange, locations, roles }) {
  const { search, location, role, unreadOnly, sort } = filters;

  const sel = (key, value) => onFiltersChange({ ...filters, [key]: value });

  const inputBase = {
    background: 'var(--t-surface-2)',
    border: '1px solid var(--t-line)',
    color: 'var(--t-text)',
    fontSize: 11,
    outline: 'none',
    fontFamily: 'inherit',
  };

  return (
    <div style={{
      display: 'flex',
      gap: 6,
      padding: '8px 10px',
      borderBottom: '1px solid var(--t-line)',
      background: 'var(--t-surface)',
      alignItems: 'center',
      flexWrap: 'wrap',
      flexShrink: 0,
    }}>
      {/* Search */}
      <div style={{ position: 'relative', flex: '1 1 120px', minWidth: 100 }}>
        <span style={{
          position: 'absolute', left: 7, top: '50%', transform: 'translateY(-50%)',
          fontSize: 11, color: 'var(--t-text-faint)', pointerEvents: 'none',
        }}>🔍</span>
        <input
          type="text"
          placeholder="Search messages..."
          value={search}
          onChange={e => sel('search', e.target.value)}
          style={{
            ...inputBase,
            width: '100%',
            padding: '5px 8px 5px 24px',
            boxSizing: 'border-box',
          }}
        />
      </div>

      {/* Location filter */}
      {locations.length > 0 && (
        <select
          value={location}
          onChange={e => sel('location', e.target.value)}
          style={{ ...inputBase, padding: '5px 6px', cursor: 'pointer' }}
        >
          <option value="All">Location: All</option>
          {locations.map(l => <option key={l} value={l}>{l}</option>)}
        </select>
      )}

      {/* Role filter */}
      {roles.length > 0 && (
        <select
          value={role}
          onChange={e => sel('role', e.target.value)}
          style={{ ...inputBase, padding: '5px 6px', cursor: 'pointer' }}
        >
          <option value="All">Role: All</option>
          {roles.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
      )}

      {/* Sort */}
      <select
        value={sort}
        onChange={e => sel('sort', e.target.value)}
        style={{ ...inputBase, padding: '5px 6px', cursor: 'pointer' }}
      >
        <option value="newest">Newest</option>
        <option value="oldest">Oldest</option>
        <option value="unread">Unread First</option>
      </select>

      {/* Unread only */}
      <label style={{
        display: 'flex', alignItems: 'center', gap: 5,
        fontSize: 11, color: 'var(--t-text-muted)', cursor: 'pointer',
        userSelect: 'none', flexShrink: 0, whiteSpace: 'nowrap',
      }}>
        <input
          type="checkbox"
          checked={unreadOnly}
          onChange={e => sel('unreadOnly', e.target.checked)}
          style={{ accentColor: 'var(--t-accent)', cursor: 'pointer', width: 12, height: 12 }}
        />
        Unread only
      </label>

      {/* Clear filters (shown if any active) */}
      {(search || location !== 'All' || role !== 'All' || unreadOnly || sort !== 'newest') && (
        <button
          onClick={() => onFiltersChange({ search: '', location: 'All', role: 'All', unreadOnly: false, sort: 'newest' })}
          style={{
            padding: '4px 8px',
            background: 'rgba(255,26,26,0.08)',
            border: '1px solid var(--t-danger)',
            color: 'var(--t-danger)',
            fontSize: 10, fontWeight: 700, letterSpacing: 0.5,
            cursor: 'pointer', flexShrink: 0,
          }}
        >
          CLEAR
        </button>
      )}
    </div>
  );
}

/* ─── ThreadList ───────────────────────────────────────────────────────────── */

function ThreadList({
  threads, loading, selectedId, onSelect, folder, onMarkAllRead,
  activeLocation, onLocationSelect, locations, roles,
}) {
  const [filters, setFilters] = useState({
    search: '', location: 'All', role: 'All', unreadOnly: false, sort: 'newest',
  });

  /* derive location counts for tab strip from the unfiltered folder threads */
  const threadsByLocation = {};
  locations.forEach(l => {
    threadsByLocation[l] = threads.filter(t => t.location === l).length;
  });

  /* apply all filters */
  let visible = threads.filter(t => {
    // location tab (from parent) takes priority
    if (activeLocation !== 'All' && t.location !== activeLocation) return false;

    // inline location filter
    if (filters.location !== 'All' && t.location !== filters.location) return false;

    // role filter
    if (filters.role !== 'All' && t.role !== filters.role) return false;

    // unread only
    if (filters.unreadOnly && !t.unread) return false;

    // search
    if (filters.search) {
      const q = filters.search.toLowerCase();
      if (!t.other_name.toLowerCase().includes(q) &&
          !(t.last_message?.body || '').toLowerCase().includes(q) &&
          !(t.location || '').toLowerCase().includes(q) &&
          !(t.role || '').toLowerCase().includes(q)) return false;
    }
    return true;
  });

  /* sort */
  if (filters.sort === 'oldest') {
    visible = [...visible].sort((a, b) =>
      new Date(a.last_message?.sent_at || 0) - new Date(b.last_message?.sent_at || 0)
    );
  } else if (filters.sort === 'unread') {
    visible = [...visible].sort((a, b) => {
      if (a.unread && !b.unread) return -1;
      if (!a.unread && b.unread) return 1;
      return new Date(b.last_message?.sent_at || 0) - new Date(a.last_message?.sent_at || 0);
    });
  }
  // default 'newest' — already sorted by parent

  const emptyText = folder === 'starred'
    ? 'No starred conversations.'
    : folder === 'archived'
      ? 'No archived conversations.'
      : threads.length === 0
        ? 'No conversations yet.'
        : 'No conversations match filters.';

  return (
    <div style={{
      width: 288,
      flexShrink: 0,
      borderRight: '1px solid var(--t-line)',
      display: 'flex',
      flexDirection: 'column',
      background: 'var(--t-surface)',
      overflow: 'hidden',
    }}>
      {/* Location tab strip */}
      {locations.length > 0 && (
        <LocationTabStrip
          activeLocation={activeLocation}
          onSelect={onLocationSelect}
          locations={locations}
          threadsByLocation={threadsByLocation}
        />
      )}

      {/* Rich filter bar */}
      <FilterBar filters={filters} onFiltersChange={setFilters} locations={locations} roles={roles} />

      {/* Action bar */}
      <div style={{ padding: '6px 10px', display: 'flex', gap: 6, borderBottom: '1px solid var(--t-line)', flexShrink: 0 }}>
        <button
          onClick={onMarkAllRead}
          style={{
            flex: 1, padding: '5px 0',
            background: 'transparent',
            border: '1px solid var(--t-line)',
            color: 'var(--t-text-muted)',
            fontSize: 10, fontWeight: 700, letterSpacing: 0.6, cursor: 'pointer',
          }}
        >
          MARK ALL READ
        </button>
        <span style={{
          display: 'flex', alignItems: 'center',
          fontSize: 10, color: 'var(--t-text-faint)', padding: '0 4px',
          flexShrink: 0,
        }}>
          {visible.length} thread{visible.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Thread rows */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}><Spinner /></div>
        ) : visible.length === 0 ? (
          <EmptyPane icon="📭" text={emptyText} />
        ) : (
          visible.map(t => {
            const isUnread = t.unread && folder === 'inbox';
            const isActive = selectedId === t.thread_id;
            const preview = (t.last_message?.body || '').slice(0, 72);

            return (
              <div
                key={t.thread_id}
                onClick={() => onSelect(t)}
                style={{
                  padding: '10px 12px',
                  borderBottom: '1px solid var(--t-line)',
                  borderLeft: isActive ? '2px solid var(--t-accent)' : '2px solid transparent',
                  background: isActive ? 'rgba(0,229,255,0.06)' : 'transparent',
                  cursor: 'pointer',
                  transition: 'background 0.12s',
                  display: 'flex',
                  gap: 9,
                  alignItems: 'flex-start',
                }}
              >
                <div style={{ position: 'relative', flexShrink: 0 }}>
                  <Avatar name={t.other_name} size={32} />
                  {isUnread && (
                    <div style={{
                      position: 'absolute',
                      top: -2, right: -2,
                      width: 7, height: 7,
                      borderRadius: '50%',
                      background: 'var(--t-accent)',
                      border: '1px solid var(--t-surface)',
                    }} />
                  )}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  {/* Name + time row */}
                  <div style={{
                    display: 'flex', justifyContent: 'space-between',
                    alignItems: 'center', marginBottom: 2,
                  }}>
                    <span style={{
                      fontSize: 12,
                      fontWeight: isUnread ? 700 : 500,
                      color: isUnread ? 'var(--t-text)' : 'var(--t-text-muted)',
                      display: 'flex', alignItems: 'center', gap: 4,
                    }}>
                      {t.starred && <span style={{ color: 'var(--t-accent)', fontSize: 11 }}>★</span>}
                      {t.other_name}
                    </span>
                    <span style={{ fontSize: 10, color: 'var(--t-text-faint)', flexShrink: 0 }}>
                      {formatAgo(t.last_message?.sent_at)}
                    </span>
                  </div>
                  {/* Location + role meta */}
                  {(t.location || t.role) && (
                    <div style={{ display: 'flex', gap: 6, marginBottom: 3, alignItems: 'center' }}>
                      {t.location && (
                        <span style={{
                          fontSize: 9, fontWeight: 700, letterSpacing: 0.5,
                          color: 'var(--t-accent)', textTransform: 'uppercase',
                          border: '1px solid rgba(0,229,255,0.3)',
                          padding: '0 4px', lineHeight: '14px',
                        }}>
                          {t.location}
                        </span>
                      )}
                      {t.role && (
                        <span style={{
                          fontSize: 9, fontWeight: 600, letterSpacing: 0.3,
                          color: 'var(--t-text-faint)',
                        }}>
                          {t.role}
                        </span>
                      )}
                    </div>
                  )}
                  {/* Preview */}
                  <div style={{
                    fontSize: 11, color: 'var(--t-text-faint)',
                    overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
                  }}>
                    {preview || '(no messages)'}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

/* ─── ThreadDetail ─────────────────────────────────────────────────────────── */

function ThreadDetail({ thread, personId, onMarkRead, onArchive, onStar, onSendReply }) {
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef(null);
  const textareaRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [thread?.thread_id, thread?.messages?.length]);

  if (!thread) {
    return (
      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        gap: 10, color: 'var(--t-text-faint)',
      }}>
        <div style={{ fontSize: 36, opacity: 0.2 }}>💬</div>
        <div style={{ fontSize: 13 }}>Select a conversation to read.</div>
      </div>
    );
  }

  const handleSend = async () => {
    const text = reply.trim();
    if (!text || sending) return;
    setSending(true);
    await onSendReply(thread.other_id, text);
    setReply('');
    setSending(false);
    setTimeout(() => textareaRef.current?.focus(), 50);
  };

  const handleKeyDown = e => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSend();
    }
  };

  const ACTION_BTN = (label, onClick, accent) => (
    <button
      onClick={onClick}
      style={{
        padding: '4px 12px',
        background: accent ? 'rgba(0,229,255,0.08)' : 'transparent',
        border: `1px solid ${accent ? 'var(--t-accent)' : 'var(--t-line)'}`,
        color: accent ? 'var(--t-accent)' : 'var(--t-text-muted)',
        fontSize: 10, fontWeight: 700, letterSpacing: 0.7, cursor: 'pointer',
      }}
    >
      {label}
    </button>
  );

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
      {/* Thread header */}
      <div style={{
        padding: '12px 18px',
        borderBottom: '1px solid var(--t-line)',
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        background: 'var(--t-surface)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Avatar name={thread.other_name} size={34} />
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--t-text)' }}>
                {thread.other_name}
              </span>
              {thread.location && (
                <span style={{
                  fontSize: 9, fontWeight: 700, letterSpacing: 0.5,
                  color: 'var(--t-accent)', textTransform: 'uppercase',
                  border: '1px solid rgba(0,229,255,0.3)',
                  padding: '0 4px', lineHeight: '14px',
                }}>
                  {thread.location}
                </span>
              )}
              {thread.role && (
                <span style={{
                  fontSize: 9, fontWeight: 600,
                  color: 'var(--t-text-faint)',
                  letterSpacing: 0.3,
                }}>
                  {thread.role}
                </span>
              )}
            </div>
            <div style={{ fontSize: 10, color: 'var(--t-text-faint)' }}>
              {thread.messages.length} message{thread.messages.length !== 1 ? 's' : ''}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {ACTION_BTN(thread.starred ? '★ STARRED' : '☆ STAR', () => onStar(thread.other_id), thread.starred)}
          {thread.unread && ACTION_BTN('MARK READ', () => onMarkRead(thread.other_id), false)}
          {ACTION_BTN(thread.archived ? 'UNARCHIVE' : 'ARCHIVE', () => onArchive(thread.other_id), true)}
        </div>
      </div>

      {/* Messages scroll area */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {thread.messages.map((msg, i) => {
          const isMine = msg.from_id === personId;
          return (
            <div
              key={msg.id || i}
              style={{
                display: 'flex',
                flexDirection: isMine ? 'row-reverse' : 'row',
                gap: 8,
                alignItems: 'flex-start',
              }}
            >
              <Avatar name={isMine ? 'You' : thread.other_name} size={28} />
              <div style={{ maxWidth: '70%', display: 'flex', flexDirection: 'column', gap: 3, alignItems: isMine ? 'flex-end' : 'flex-start' }}>
                <div style={{ display: 'flex', gap: 6, alignItems: 'baseline' }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: isMine ? 'var(--t-accent)' : 'var(--t-text-muted)' }}>
                    {isMine ? 'You' : (msg.from_name || thread.other_name)}
                  </span>
                  <span style={{ fontSize: 10, color: 'var(--t-text-faint)' }}>
                    {formatTime(msg.sent_at)}
                  </span>
                </div>
                <div style={{
                  padding: '8px 12px',
                  background: isMine ? 'rgba(0,229,255,0.1)' : 'var(--t-surface-2)',
                  border: `1px solid ${isMine ? 'rgba(0,229,255,0.25)' : 'var(--t-line)'}`,
                  fontSize: 13,
                  lineHeight: 1.6,
                  color: 'var(--t-text)',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}>
                  {msg.body}
                </div>
              </div>
            </div>
          );
        })}
        {/* Typing indicator */}
        {reply.trim().length > 0 && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', flexDirection: 'row-reverse' }}>
            <Avatar name="You" size={28} />
            <div style={{
              padding: '8px 16px',
              background: 'rgba(0,229,255,0.06)',
              border: '1px solid rgba(0,229,255,0.15)',
              color: 'var(--t-text-faint)',
              fontSize: 18,
              letterSpacing: 3,
            }}>
              •••
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Reply input pinned at bottom */}
      <div style={{
        padding: '12px 18px',
        borderTop: '1px solid var(--t-line)',
        flexShrink: 0,
        background: 'var(--t-surface)',
        display: 'flex',
        gap: 10,
        alignItems: 'flex-end',
      }}>
        <textarea
          ref={textareaRef}
          value={reply}
          onChange={e => setReply(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Reply… (Ctrl+Enter to send)"
          rows={2}
          style={{
            flex: 1,
            padding: '8px 10px',
            background: 'var(--t-surface-2)',
            border: '1px solid var(--t-line)',
            color: 'var(--t-text)',
            fontSize: 13,
            outline: 'none',
            resize: 'none',
            fontFamily: 'inherit',
            lineHeight: 1.5,
          }}
        />
        <button
          onClick={handleSend}
          disabled={!reply.trim() || sending}
          style={{
            padding: '8px 18px',
            background: reply.trim() ? 'var(--t-accent)' : 'var(--t-surface-2)',
            border: `1px solid ${reply.trim() ? 'var(--t-accent)' : 'var(--t-line)'}`,
            color: reply.trim() ? '#000' : 'var(--t-text-faint)',
            fontSize: 12, fontWeight: 700, letterSpacing: 0.5,
            cursor: reply.trim() && !sending ? 'pointer' : 'not-allowed',
            display: 'flex', alignItems: 'center', gap: 6,
            flexShrink: 0, alignSelf: 'flex-end',
            transition: 'background 0.15s, color 0.15s',
          }}
        >
          {sending ? <Spinner /> : null}
          SEND
        </button>
      </div>
    </div>
  );
}

/* ─── ComposeTab ───────────────────────────────────────────────────────────── */

function ComposeTab({ people, personId, recentThreads, onOpenThread, onSent }) {
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null); // { person_id, full_name, node_name, role_name }
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState(null);

  const filtered = people
    .filter(p => p.person_id !== personId)
    .filter(p => !search || (p.full_name || '').toLowerCase().includes(search.toLowerCase()));

  const handleSend = async () => {
    if (!selected || !body.trim()) {
      setErr('Select a recipient and write a message.');
      return;
    }
    setSending(true);
    setErr(null);
    try {
      const { data, error } = await sb.rpc('send_dm', {
        p_from_id: personId,
        p_to_id: selected.person_id,
        p_body: body.trim(),
      });
      if (error || data?.ok === false) {
        setErr(data?.error || error?.message || 'Message could not be sent. Please try again.');
        setSending(false);
        return;
      }
      setSent(true);
      const toId = selected.person_id;
      setSelected(null);
      setBody('');
      setSearch('');
      setSending(false);
      setTimeout(() => setSent(false), 3000);
      onSent && onSent(toId);
    } catch {
      setErr('Message could not be sent — connection problem.');
      setSending(false);
    }
  };

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
      {sent && (
        <div style={{
          marginBottom: 16, padding: '10px 14px',
          background: 'rgba(52,199,89,0.1)',
          border: '1px solid var(--t-success)',
          color: 'var(--t-success)',
          fontSize: 12, fontWeight: 700,
        }}>
          Message sent successfully.
        </div>
      )}
      {err && (
        <div style={{
          marginBottom: 16, padding: '10px 14px',
          background: 'rgba(255,59,48,0.1)',
          border: '1px solid var(--t-danger)',
          color: 'var(--t-danger)',
          fontSize: 12,
        }}>
          {err}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginBottom: 24 }}>
        {/* Left: Recipient picker */}
        <div>
          <div style={{
            fontSize: 10, fontWeight: 700, letterSpacing: 1, color: 'var(--t-text-faint)',
            textTransform: 'uppercase', marginBottom: 10,
          }}>
            To
          </div>

          {/* Selected chip */}
          {selected && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10,
              padding: '6px 10px',
              background: 'rgba(0,229,255,0.08)',
              border: '1px solid var(--t-accent)',
            }}>
              <Avatar name={selected.full_name} size={22} />
              <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: 'var(--t-accent)' }}>{selected.full_name}</span>
              <button
                onClick={() => setSelected(null)}
                style={{
                  background: 'none', border: 'none',
                  color: 'var(--t-text-faint)', fontSize: 16,
                  cursor: 'pointer', lineHeight: 1, padding: 0,
                }}
              >
                ×
              </button>
            </div>
          )}

          {/* Search input */}
          {!selected && (
            <input
              type="text"
              placeholder="Search employees..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              autoFocus
              style={{
                width: '100%', padding: '8px 10px',
                background: 'var(--t-surface-2)',
                border: '1px solid var(--t-line)',
                color: 'var(--t-text)', fontSize: 13, outline: 'none',
                boxSizing: 'border-box', marginBottom: 8,
              }}
            />
          )}

          {/* Employee list */}
          {!selected && (
            <div style={{
              border: '1px solid var(--t-line)',
              background: 'var(--t-surface)',
              maxHeight: 220, overflowY: 'auto',
            }}>
              {filtered.length === 0 ? (
                <div style={{ padding: '14px 12px', color: 'var(--t-text-faint)', fontSize: 12 }}>
                  {people.length === 0 ? 'No employees in the directory yet.' : 'No employees found.'}
                </div>
              ) : (
                filtered.map(p => (
                  <div
                    key={p.person_id}
                    onClick={() => { setSelected(p); setSearch(''); }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '8px 12px',
                      borderBottom: '1px solid var(--t-line)',
                      cursor: 'pointer',
                      transition: 'background 0.1s',
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(0,229,255,0.06)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <Avatar name={p.full_name} size={26} />
                    <div>
                      <div style={{ fontSize: 13, color: 'var(--t-text)' }}>{p.full_name}</div>
                      {(p.node_name || p.role_name) && (
                        <div style={{ display: 'flex', gap: 6, marginTop: 2 }}>
                          {p.node_name && (
                            <span style={{
                              fontSize: 9, fontWeight: 700, letterSpacing: 0.4,
                              color: 'var(--t-accent)', textTransform: 'uppercase',
                            }}>
                              {p.node_name}
                            </span>
                          )}
                          {p.role_name && (
                            <span style={{ fontSize: 9, color: 'var(--t-text-faint)' }}>
                              {p.role_name}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* Right: Message body */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{
            fontSize: 10, fontWeight: 700, letterSpacing: 1,
            color: 'var(--t-text-faint)', textTransform: 'uppercase',
          }}>
            Message
          </div>
          <textarea
            value={body}
            onChange={e => setBody(e.target.value)}
            placeholder="Write your message…"
            rows={8}
            style={{
              flex: 1,
              padding: '10px 12px',
              background: 'var(--t-surface-2)',
              border: '1px solid var(--t-line)',
              color: 'var(--t-text)',
              fontSize: 13, lineHeight: 1.7,
              outline: 'none', resize: 'vertical',
              fontFamily: 'inherit',
            }}
          />
          <button
            onClick={handleSend}
            disabled={!selected || !body.trim() || sending}
            style={{
              padding: '10px 0',
              background: selected && body.trim() ? 'var(--t-accent)' : 'var(--t-surface-2)',
              border: `1px solid ${selected && body.trim() ? 'var(--t-accent)' : 'var(--t-line)'}`,
              color: selected && body.trim() ? '#000' : 'var(--t-text-faint)',
              fontSize: 12, fontWeight: 700, letterSpacing: 0.8,
              cursor: selected && body.trim() && !sending ? 'pointer' : 'not-allowed',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              transition: 'background 0.15s',
            }}
          >
            {sending ? <Spinner /> : '✉'}
            {sending ? 'Sending…' : 'SEND MESSAGE'}
          </button>
        </div>
      </div>

      {/* Recent conversations */}
      {recentThreads.length > 0 && (
        <div>
          <div style={{
            fontSize: 10, fontWeight: 700, letterSpacing: 1,
            color: 'var(--t-text-faint)', textTransform: 'uppercase',
            marginBottom: 12, paddingTop: 8,
            borderTop: '1px solid var(--t-line)',
          }}>
            Recent Conversations
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {recentThreads.slice(0, 5).map(t => (
              <div
                key={t.thread_id}
                onClick={() => onOpenThread(t)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '9px 12px',
                  background: 'var(--t-surface)',
                  border: '1px solid var(--t-line)',
                  cursor: 'pointer',
                  transition: 'background 0.12s',
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(0,229,255,0.05)'}
                onMouseLeave={e => e.currentTarget.style.background = 'var(--t-surface)'}
              >
                <Avatar name={t.other_name} size={30} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 2 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--t-text)' }}>
                      {t.other_name}
                    </span>
                    {t.location && (
                      <span style={{
                        fontSize: 9, fontWeight: 700, letterSpacing: 0.4,
                        color: 'var(--t-accent)', textTransform: 'uppercase',
                      }}>
                        {t.location}
                      </span>
                    )}
                  </div>
                  <div style={{
                    fontSize: 11, color: 'var(--t-text-faint)',
                    overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
                  }}>
                    {(t.last_message?.body || '').slice(0, 60)}
                  </div>
                </div>
                <span style={{ fontSize: 10, color: 'var(--t-text-faint)', flexShrink: 0 }}>
                  {formatAgo(t.last_message?.sent_at)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── main component ───────────────────────────────────────────────────────── */

export default function Messages() {
  const { session } = useAuth();
  const { locations: scopeLocations } = useScope();

  const person   = session?.person ?? {};
  const personId = person.id ?? null;

  /* ── tab state ── */
  const [tab, setTab] = useState('inbox'); // 'inbox' | 'new'

  /* ── inbox: folder + selection state ── */
  const [folder, setFolder]       = useState('inbox');
  const [selectedId, setSelectedId] = useState(null); // = other party's id
  const [activeLocation, setActiveLocation] = useState('All');

  /* ── live data state (all real, from RPCs) ── */
  const [rawMessages, setRawMessages] = useState([]);
  const [directory, setDirectory]     = useState({}); // person_id → { full_name, node_name, role_name }
  const [convState, setConvState]     = useState({}); // other_id → { starred, archived }
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState(null);

  /* ── load everything live ── */
  const load = useCallback(async () => {
    if (!personId) { setLoading(false); setRawMessages([]); return; }
    setLoading(true);
    setError(null);
    try {
      const [msgRes, dirRes, stateRes] = await Promise.all([
        sb.rpc('get_messages', { p_person_id: personId }),
        sb.rpc('comms_person_directory'),
        sb.rpc('get_dm_conversation_state', { p_person_id: personId }),
      ]);
      if (msgRes.error) throw msgRes.error;

      const dir = {};
      (Array.isArray(dirRes.data) ? dirRes.data : []).forEach(d => { dir[d.person_id] = d; });

      const state = {};
      const sd = stateRes.data;
      (Array.isArray(sd) ? sd : []).forEach(s => { state[s.other_id] = s; });

      setDirectory(dir);
      setConvState(state);
      setRawMessages(Array.isArray(msgRes.data) ? msgRes.data : []);
    } catch {
      setError('Could not load messages. Please try again.');
      setRawMessages([]);
    } finally {
      setLoading(false);
    }
  }, [personId]);

  useEffect(() => { load(); }, [load]);

  /* ── derive threads from live data ── */
  const threads = useMemo(
    () => buildThreads(rawMessages, personId, directory, convState),
    [rawMessages, personId, directory, convState]
  );

  /* ── real locations / roles present in my conversations ── */
  const locations = useMemo(() => {
    const set = new Set();
    threads.forEach(t => { if (t.location) set.add(t.location); });
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [threads]);

  const roles = useMemo(() => {
    const set = new Set();
    threads.forEach(t => { if (t.role) set.add(t.role); });
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [threads]);

  const people = useMemo(() => Object.values(directory), [directory]);

  /* ── auto-select location tab based on the global scope selector ── */
  const scopeKey = (scopeLocations || []).map(l => l.id).join(',');
  useEffect(() => {
    if (scopeLocations && scopeLocations.length === 1) {
      const nodeName = (scopeLocations[0].name || '').toLowerCase();
      const matched = locations.find(l => l.toLowerCase() === nodeName || nodeName.includes(l.toLowerCase()));
      setActiveLocation(matched || 'All');
    } else {
      setActiveLocation('All');
    }
  }, [scopeKey]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── derived KPI stats (all real) ── */
  const now = Date.now();
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);

  const activeThreads = useMemo(() => threads.filter(t => !t.archived), [threads]);
  const allMessages   = useMemo(() => threads.flatMap(t => t.messages), [threads]);
  const unreadThreads = useMemo(() => threads.filter(t => t.unread && !t.archived), [threads]);
  const unreadCount   = unreadThreads.length;
  const todayMsgs     = useMemo(() => allMessages.filter(m => new Date(m.sent_at) >= todayStart), [allMessages]); // eslint-disable-line react-hooks/exhaustive-deps
  const msgsToday     = todayMsgs.length;
  const weekThreads   = useMemo(() => threads.filter(t => new Date(t.last_message?.sent_at || 0) >= new Date(now - 7 * 864e5)), [threads]); // eslint-disable-line react-hooks/exhaustive-deps
  const newThisWeek   = weekThreads.length;
  const avgMs         = useMemo(() => computeAvgResponseMs(activeThreads, personId), [activeThreads, personId]);
  const avgLabel      = formatDuration(avgMs);

  /* ── Drill-down config ── */
  const [drill, setDrill] = useState(null);
  const THREAD_COLS = [
    { key: 'other_name', label: 'Contact', value: t => t.other_name },
    { key: 'location', label: 'Location', value: t => t.location || '—' },
    { key: 'role', label: 'Role', value: t => t.role || '—' },
    { key: 'preview', label: 'Last Message', value: t => (t.last_message?.body || '').slice(0, 60) },
    { key: 'when', label: 'Last Activity', value: t => formatAgo(t.last_message?.sent_at), sortKey: t => t.last_message?.sent_at || '' },
    { key: 'unread', label: 'Status', value: t => (t.unread ? 'Unread' : 'Read') },
  ];
  const MSG_COLS = [
    { key: 'from_name', label: 'From', value: m => (m.from_id === personId ? 'You' : (m.from_name || directory[m.from_id]?.full_name || 'Unknown')) },
    { key: 'to_name', label: 'To', value: m => (m.to_id === personId ? 'You' : (m.to_name || directory[m.to_id]?.full_name || 'Unknown')) },
    { key: 'body', label: 'Message', value: m => (m.body || '').slice(0, 70) },
    { key: 'sent_at', label: 'Sent', value: m => formatTime(m.sent_at), sortKey: m => m.sent_at || '' },
    { key: 'read_at', label: 'Status', value: m => (m.read_at ? 'Read' : 'Unread') },
  ];
  const openDrill = (title, rows, columns, accent) => setDrill({
    title, subtitle: `${rows.length} record${rows.length === 1 ? '' : 's'}`, columns, rows, accent,
  });

  /* ── mark a set of messages read (reuses existing mark_message_read) ── */
  const markMessagesRead = useCallback(async ids => {
    const real = ids.filter(Boolean);
    if (!real.length) return;
    await Promise.all(real.map(id => sb.rpc('mark_message_read', { p_message_id: id }).catch(() => {})));
  }, []);

  /* ── select thread & mark its inbound messages read ── */
  const handleSelectThread = useCallback(async t => {
    setSelectedId(t.thread_id);
    const unreadIds = t.messages.filter(m => m.to_id === personId && !m.read_at).map(m => m.id);
    if (unreadIds.length) {
      await markMessagesRead(unreadIds);
      load();
    }
  }, [personId, markMessagesRead, load]);

  /* ── mark a single thread read ── */
  const handleMarkRead = useCallback(async otherId => {
    const t = threads.find(x => x.thread_id === otherId);
    if (!t) return;
    const unreadIds = t.messages.filter(m => m.to_id === personId && !m.read_at).map(m => m.id);
    await markMessagesRead(unreadIds);
    load();
  }, [threads, personId, markMessagesRead, load]);

  /* ── mark ALL inbound messages read ── */
  const handleMarkAllRead = useCallback(async () => {
    const unreadIds = allMessages.filter(m => m.to_id === personId && !m.read_at).map(m => m.id);
    await markMessagesRead(unreadIds);
    load();
  }, [allMessages, personId, markMessagesRead, load]);

  /* ── archive / unarchive thread (real toggle) ── */
  const handleArchive = useCallback(async otherId => {
    await sb.rpc('dm_toggle_archive', { p_person_id: personId, p_other_id: otherId }).catch(() => {});
    if (selectedId === otherId) setSelectedId(null);
    load();
  }, [personId, selectedId, load]);

  /* ── star / unstar thread (real toggle) ── */
  const handleStar = useCallback(async otherId => {
    await sb.rpc('dm_toggle_star', { p_person_id: personId, p_other_id: otherId }).catch(() => {});
    load();
  }, [personId, load]);

  /* ── send reply (real write) ── */
  const handleSendReply = useCallback(async (otherId, text) => {
    const { data, error: sendErr } = await sb.rpc('send_dm', {
      p_from_id: personId,
      p_to_id: otherId,
      p_body: text,
    }).catch(() => ({ data: null, error: new Error('send failed') }));
    if (sendErr || data?.ok === false) {
      setError('Message could not be sent. Please try again.');
      return;
    }
    setError(null);
    await load();
  }, [personId, load]);

  /* ── compose tab: after a real send, refresh and open that thread ── */
  const handleComposeSent = useCallback(async toId => {
    await load();
    setTab('inbox');
    setFolder('inbox');
    setSelectedId(toId);
  }, [load]);

  /* ── compose tab: open existing thread ── */
  const handleOpenThreadFromCompose = useCallback(t => {
    setTab('inbox');
    setFolder('inbox');
    setSelectedId(t.thread_id);
  }, []);

  /* ── folder-specific thread list ── */
  const visibleThreads = useMemo(() => threads.filter(t => {
    if (folder === 'archived') return t.archived;
    if (folder === 'starred')  return t.starred && !t.archived;
    return !t.archived; // inbox
  }), [threads, folder]);

  const folderCounts = useMemo(() => ({
    inbox: threads.filter(t => !t.archived).length,
    starred: threads.filter(t => t.starred && !t.archived).length,
    archived: threads.filter(t => t.archived).length,
  }), [threads]);

  const selectedThread = useMemo(
    () => visibleThreads.find(t => t.thread_id === selectedId)
       || threads.find(t => t.thread_id === selectedId)
       || null,
    [visibleThreads, threads, selectedId]
  );

  const recentThreads = useMemo(() => [...activeThreads]
    .sort((a, b) => new Date(b.last_message?.sent_at || 0) - new Date(a.last_message?.sent_at || 0))
    .slice(0, 5), [activeThreads]);

  /* ─────────────────────────────────────────────────────────────────────── */

  return (
    <>
      <style>{`
        @keyframes msg-spin { to { transform: rotate(360deg); } }
      `}</style>

      <div style={{
        display: 'flex', flexDirection: 'column',
        height: '100%', background: '#070b14', overflow: 'hidden',
      }}>
        {/* ── Page header ── */}
        <div style={{
          padding: '12px 20px 10px',
          borderBottom: '1px solid var(--t-line)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexShrink: 0, background: 'var(--t-surface)',
        }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--t-text)', letterSpacing: 0.3 }}>
              Direct Messages
            </div>
            <div style={{ fontSize: 11, color: 'var(--t-text-faint)', marginTop: 2 }}>
              Personal DM inbox — conversations with your team
            </div>
          </div>
          {unreadCount > 0 && (
            <span style={{
              padding: '4px 12px',
              background: 'rgba(0,229,255,0.12)',
              border: '1px solid var(--t-accent)',
              color: 'var(--t-accent)',
              fontSize: 11, fontWeight: 700, letterSpacing: 0.5,
            }}>
              {unreadCount} UNREAD
            </span>
          )}
        </div>

        {/* ── KPI row ── */}
        <div style={{
          display: 'flex', gap: 1, padding: '1px',
          background: 'var(--t-line)',
          flexShrink: 0,
        }}>
          <KTile
            label="Total Conversations"
            value={activeThreads.length}
            sub={`${threads.length} lifetime`}
            onClick={() => openDrill('All Conversations', activeThreads, THREAD_COLS, 'var(--t-accent)')}
          />
          <KTile
            label="Unread Messages"
            value={unreadCount}
            sub={unreadCount > 0 ? 'needs attention' : 'all caught up'}
            color={unreadCount > 0 ? 'var(--t-danger)' : 'var(--t-success)'}
            alert={unreadCount > 0 ? 'red' : null}
            onClick={() => openDrill('Unread Conversations', unreadThreads, THREAD_COLS, 'var(--t-danger)')}
          />
          <KTile
            label="Messages Today"
            value={msgsToday}
            sub="sent + received"
            onClick={() => openDrill('Messages Today', todayMsgs, MSG_COLS, 'var(--t-accent)')}
          />
          <KTile
            label="Avg Response Time"
            value={avgLabel}
            sub="last 7 days"
            alert={avgMs != null && avgMs > 45 * 60000 ? 'amber' : null}
            onClick={() => openDrill('Conversations — Response Time', activeThreads, THREAD_COLS, 'var(--t-warn)')}
          />
          <KTile
            label="New This Week"
            value={newThisWeek}
            sub="active threads"
            color="var(--t-accent)"
            onClick={() => openDrill('Active Threads This Week', weekThreads, THREAD_COLS, 'var(--t-accent)')}
          />
        </div>

        {/* ── Tab bar ── */}
        <div style={{
          display: 'flex', gap: 0,
          borderBottom: '1px solid var(--t-line)',
          background: 'var(--t-surface)',
          flexShrink: 0,
        }}>
          {[
            { id: 'inbox', label: 'Inbox' },
            { id: 'new',   label: '+ New Message' },
          ].map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                padding: '10px 22px',
                background: 'none', border: 'none',
                borderBottom: tab === t.id ? '2px solid var(--t-accent)' : '2px solid transparent',
                color: tab === t.id ? 'var(--t-accent)' : 'var(--t-text-muted)',
                fontSize: 12, fontWeight: tab === t.id ? 700 : 400,
                letterSpacing: 0.5, cursor: 'pointer',
                transition: 'color 0.15s, border-color 0.15s',
              }}
            >
              {t.label}
              {t.id === 'inbox' && unreadCount > 0 && (
                <span style={{
                  marginLeft: 7, background: 'var(--t-accent)', color: '#000',
                  fontSize: 9, fontWeight: 700, padding: '1px 5px', letterSpacing: 0.5,
                }}>
                  {unreadCount}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ── Error banner ── */}
        {error && (
          <div style={{
            padding: '8px 20px',
            background: 'rgba(255,59,48,0.1)',
            borderBottom: '1px solid var(--t-danger)',
            color: 'var(--t-danger)', fontSize: 12, flexShrink: 0,
          }}>
            {error}
          </div>
        )}

        {/* ── Tab content ── */}
        {tab === 'inbox' ? (
          /* ── Three-panel inbox layout ── */
          <div style={{ flex: 1, display: 'flex', minHeight: 0, overflow: 'hidden' }}>
            <Sidebar
              folder={folder}
              setFolder={f => { setFolder(f); setSelectedId(null); }}
              unread={unreadCount}
              counts={folderCounts}
            />
            <ThreadList
              threads={visibleThreads}
              loading={loading}
              selectedId={selectedId}
              onSelect={handleSelectThread}
              folder={folder}
              onMarkAllRead={handleMarkAllRead}
              activeLocation={activeLocation}
              onLocationSelect={loc => { setActiveLocation(loc); setSelectedId(null); }}
              locations={locations}
              roles={roles}
            />
            <ThreadDetail
              thread={selectedThread}
              personId={personId}
              onMarkRead={handleMarkRead}
              onArchive={handleArchive}
              onStar={handleStar}
              onSendReply={handleSendReply}
            />
          </div>
        ) : (
          /* ── New message compose tab ── */
          <ComposeTab
            people={people}
            personId={personId}
            recentThreads={recentThreads}
            onOpenThread={handleOpenThreadFromCompose}
            onSent={handleComposeSent}
          />
        )}
      </div>

      <DrillDown open={!!drill} onClose={() => setDrill(null)} {...(drill || {})} />
    </>
  );
}
