// HR Messaging — fully live screen. Every message, broadcast, receipt and write
// on this page comes from the HR Supabase brain (fxetuqjryttnypgepsru, schema hr):
//   reads  : get_comms_hub, get_messages, get_shift_broadcasts,
//            comms_person_directory
//   writes : send_dm, mark_message_read, post_shift_broadcast
// No mock arrays, no seeded generators, no localStorage data stores. Every feed
// renders an honest empty state until real rows exist.
import { useState, useEffect, useCallback, useMemo } from 'react'
import { sb } from '../lib/supabase'
import { useScope } from '../lib/scope.jsx'
import { useAuth } from '../lib/auth.jsx'
import DrillDown from '../components/DrillDown.jsx'

// Compose presets are UI content templates (config), not data.
const TEMPLATES = [
  {
    label: 'Schedule Change',
    subject: 'Schedule Change Notice',
    body: 'Please be advised that your schedule has been updated. Log in to the platform to view your latest shifts. If you have any conflicts, contact your manager at least 48 hours in advance.',
  },
  {
    label: 'Policy Update',
    subject: 'Policy Update — Action Required',
    body: 'This is a reminder to review the updated employee handbook policies effective immediately. Compliance with all store policies is mandatory. Please acknowledge receipt of this message by end of business today.',
  },
  {
    label: 'Safety Reminder',
    subject: 'Workplace Safety Reminder',
    body: 'Your safety is our top priority. Please review the posted safety guidelines at your location and ensure all protocols are being followed during every shift. Report any hazards to your store manager immediately.',
  },
  {
    label: 'Benefits Open Enrollment',
    subject: 'Benefits Open Enrollment — Window Now Open',
    body: 'Open enrollment for the upcoming benefits period is now active. Log in to the employee portal to review your options and make selections. The enrollment window closes at the end of this month. Contact HR with any questions.',
  },
  {
    label: 'Performance Review Season',
    subject: 'Performance Review Season Has Begun',
    body: 'Annual performance reviews are now underway. You will be contacted by your manager to schedule your one-on-one review session. Please prepare a self-assessment using the form available in the HR portal.',
  },
  {
    label: 'Holiday Hours',
    subject: 'Holiday Store Hours — Please Review',
    body: 'Updated holiday operating hours have been posted for all locations. Please review the schedule carefully and confirm your availability with your manager at least one week prior to the holiday. Thank you for your flexibility.',
  },
]

function timeAgo(iso) {
  if (!iso) return '—'
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  return `${d}d ago`
}

function formatDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function formatDateTime(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function initials(name) {
  if (!name) return '?'
  return name.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase()
}

// Normalize one get_shift_broadcasts row for the UI.
function normBroadcast(b) {
  const locs = Array.isArray(b.target_locations) ? b.target_locations.filter(Boolean) : []
  const roles = Array.isArray(b.target_roles) ? b.target_roles.filter(Boolean) : []
  const recipients = locs.length ? locs.join(', ') : roles.length ? roles.join(', ') : 'All Staff'
  const total = b.total_recipients || 0
  const readCount = b.read_count || 0
  return {
    id: b.id,
    subject: b.title || '(untitled)',
    body: b.body || '',
    priority: b.priority || 'FYI',
    recipients,
    sentAt: b.created_at,
    scheduledAt: b.scheduled_at,
    status: b.status || 'ACTIVE',
    senderName: b.sender_name || '—',
    total,
    readCount,
    ackCount: b.ack_count || 0,
    openRate: total > 0 ? Math.round((readCount / total) * 100) : 0,
  }
}

function LockScreen() {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', minHeight: 320, gap: 16,
      color: 'var(--t-text-muted)', fontFamily: 'var(--font-sans)',
    }}>
      <div style={{ fontSize: 40, opacity: 0.4 }}>🔒</div>
      <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--t-text)' }}>HR access required</div>
      <div style={{ fontSize: 13, color: 'var(--t-text-muted)', textAlign: 'center', maxWidth: 320 }}>
        HR Messaging is restricted to HR staff, managers, and above.
      </div>
    </div>
  )
}

function KTile({ label, value, sub, color, alert, onClick }) {
  return (
    <div onClick={onClick} title={onClick ? 'Click to drill into records' : undefined} style={{
      background: 'var(--t-surface)',
      border: `1px solid ${alert === 'red' ? 'var(--t-danger)' : alert === 'amber' ? 'var(--t-warn)' : 'var(--t-line)'}`,
      padding: '14px 16px', position: 'relative', overflow: 'hidden',
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

// ── SHARED STYLES ─────────────────────────────────────────────────────────────

const inputStyle = {
  width: '100%',
  background: 'var(--t-surface-2)',
  border: '1px solid var(--t-line)',
  color: 'var(--t-text)',
  fontFamily: 'var(--font-sans)',
  fontSize: 13,
  padding: '8px 10px',
  outline: 'none',
  boxSizing: 'border-box',
}

const labelStyle = {
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: '0.06em',
  color: 'var(--t-text-muted)',
  marginBottom: 6,
  display: 'block',
  fontFamily: 'var(--font-sans)',
  textTransform: 'uppercase',
}

const cardHeaderStyle = {
  padding: '12px 16px',
  borderBottom: '1px solid var(--t-line)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
}

const sectionLabel = {
  fontSize: 13,
  fontWeight: 700,
  color: 'var(--t-text)',
  fontFamily: 'var(--font-sans)',
}

function TabBtn({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: 'none',
        border: 'none',
        borderBottom: active ? '2px solid var(--t-accent)' : '2px solid transparent',
        color: active ? 'var(--t-accent)' : 'var(--t-text-muted)',
        fontFamily: 'var(--font-sans)',
        fontSize: 13,
        fontWeight: 700,
        padding: '10px 16px',
        cursor: 'pointer',
        letterSpacing: '0.04em',
        transition: 'color 0.15s',
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </button>
  )
}

// ── INBOX TAB (real direct messages addressed to the HR user) ─────────────────

function InboxTab({ personId, directoryById }) {
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState(null)
  const [replyText, setReplyText] = useState('')
  const [sending, setSending] = useState(false)
  const [toastMsg, setToastMsg] = useState('')
  const [toastType, setToastType] = useState('success')

  const showToast = useCallback((msg, type = 'success') => {
    setToastMsg(msg); setToastType(type)
    setTimeout(() => setToastMsg(''), 3000)
  }, [])

  const load = useCallback(async () => {
    if (!personId) { setMessages([]); setLoading(false); return }
    setLoading(true)
    setError(null)
    try {
      const { data, error } = await sb.rpc('get_messages', { p_person_id: personId })
      if (error) throw error
      const rows = (Array.isArray(data) ? data : [])
        // The HR inbox shows messages addressed TO the signed-in HR user.
        .filter(m => m.to_id === personId)
        .map(m => {
          const dir = directoryById[m.from_id]
          return {
            id: m.id,
            fromId: m.from_id,
            from: m.from_name || dir?.full_name || 'Unknown',
            to: m.to_name || 'HR Team',
            body: m.body || '',
            sentAt: m.sent_at || m.created_at,
            read: !!m.read_at,
            location: dir?.node_name || '—',
          }
        })
        .sort((a, b) => new Date(b.sentAt) - new Date(a.sentAt))
      setMessages(rows)
    } catch {
      setError('Could not load messages. Please try again.')
      setMessages([])
    } finally {
      setLoading(false)
    }
  }, [personId, directoryById])

  useEffect(() => { load() }, [load])

  const filtered = messages.filter(m =>
    !search || m.body.toLowerCase().includes(search.toLowerCase()) ||
    m.from.toLowerCase().includes(search.toLowerCase())
  )

  async function openMessage(msg) {
    setSelected(msg)
    setReplyText('')
    if (!msg.read && msg.id) {
      setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, read: true } : m))
      try { await sb.rpc('mark_message_read', { p_message_id: msg.id }) } catch { /* best-effort */ }
    }
  }

  async function handleReply() {
    if (!replyText.trim() || !selected || sending) return
    if (!selected.fromId) { showToast('Cannot reply — sender is unknown.', 'error'); return }
    setSending(true)
    try {
      const { data, error } = await sb.rpc('send_dm', {
        p_from_id: personId,
        p_to_id: selected.fromId,
        p_body: replyText.trim(),
      })
      if (error || data?.ok === false) {
        showToast('Failed to send reply. Please try again.', 'error')
      } else {
        showToast('Reply sent')
        setReplyText('')
        load()
      }
    } catch {
      showToast('Failed to send reply — connection problem.', 'error')
    } finally {
      setSending(false)
    }
  }

  const unread = messages.filter(m => !m.read).length
  const visible = filtered

  return (
    <div style={{ padding: '16px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
      {toastMsg && (
        <div style={{
          position: 'fixed', top: 20, right: 20, zIndex: 9999,
          background: toastType === 'error' ? 'var(--t-danger)' : 'var(--t-accent)',
          color: '#000', padding: '10px 20px', fontWeight: 700, fontSize: 13,
          fontFamily: 'var(--font-sans)',
        }}>{toastMsg}</div>
      )}

      <div style={{ fontSize: 12, color: 'var(--t-text-muted)', fontFamily: 'var(--font-sans)' }}>
        {unread > 0 ? <span style={{ color: 'var(--t-danger)', fontWeight: 700 }}>{unread} unread</span> : 'All messages read'}
        {' · '}{messages.length} total
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 16, alignItems: 'start', minHeight: 520 }}>
        {/* LEFT: Message List */}
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--t-line)' }}>
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search messages…"
              style={{ ...inputStyle, fontSize: 12, padding: '7px 10px' }}
            />
          </div>
          <div style={{ overflowY: 'auto', maxHeight: 520 }}>
            {loading ? (
              <div style={{ padding: 20, color: 'var(--t-text-faint)', fontSize: 13, textAlign: 'center', fontFamily: 'var(--font-sans)' }}>
                Loading messages…
              </div>
            ) : error ? (
              <div style={{ padding: 20, color: 'var(--t-danger)', fontSize: 13, textAlign: 'center', fontFamily: 'var(--font-sans)' }}>
                {error}
              </div>
            ) : visible.length === 0 ? (
              <div style={{ padding: 20, color: 'var(--t-text-faint)', fontSize: 13, textAlign: 'center', fontFamily: 'var(--font-sans)' }}>
                {messages.length === 0 ? 'No messages in the HR inbox yet.' : 'No messages found'}
              </div>
            ) : (
              visible.map((msg, i, arr) => (
                <div
                  key={msg.id}
                  onClick={() => openMessage(msg)}
                  style={{
                    padding: '12px 14px',
                    borderBottom: i < arr.length - 1 ? '1px solid var(--t-line)' : 'none',
                    background: selected?.id === msg.id ? 'var(--t-surface-2)' : 'transparent',
                    cursor: 'pointer',
                    transition: 'background 0.1s',
                  }}
                  onMouseEnter={e => { if (selected?.id !== msg.id) e.currentTarget.style.background = 'var(--t-surface-2)' }}
                  onMouseLeave={e => { if (selected?.id !== msg.id) e.currentTarget.style.background = 'transparent' }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                    {/* Avatar */}
                    <div style={{
                      width: 34, height: 34, borderRadius: 0, flexShrink: 0,
                      background: 'var(--t-surface-2)', border: '1px solid var(--t-line)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 11, fontWeight: 700, color: 'var(--t-accent)',
                      fontFamily: 'var(--font-sans)',
                    }}>
                      {initials(msg.from)}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, marginBottom: 3 }}>
                        <span style={{
                          fontSize: 12, fontWeight: msg.read ? 500 : 700,
                          color: 'var(--t-text)', fontFamily: 'var(--font-sans)',
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>{msg.from}</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
                          {!msg.read && <div style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--t-accent)', flexShrink: 0 }} />}
                          <span style={{ fontSize: 10, color: 'var(--t-text-faint)', fontFamily: 'var(--font-sans)' }}>{timeAgo(msg.sentAt)}</span>
                        </div>
                      </div>
                      <div style={{
                        fontSize: 12, fontWeight: msg.read ? 400 : 600,
                        color: msg.read ? 'var(--t-text-muted)' : 'var(--t-text)',
                        fontFamily: 'var(--font-sans)',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        marginBottom: 4,
                      }}>{msg.body}</div>
                      <div style={{ display: 'flex', gap: 5 }}>
                        {msg.location !== '—' && <span className="badge blue">{msg.location}</span>}
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* RIGHT: Message Detail */}
        {selected ? (
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ ...cardHeaderStyle, flexWrap: 'wrap', gap: 8 }}>
              <span style={{ ...sectionLabel, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                Message from {selected.from}
              </span>
            </div>

            {/* Meta */}
            <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--t-line)', display: 'flex', flexWrap: 'wrap', gap: 16 }}>
              {[
                ['From', selected.from],
                ['To', selected.to],
                ['Received', formatDateTime(selected.sentAt)],
                ['Location', selected.location],
              ].map(([k, v]) => (
                <div key={k} style={{ fontFamily: 'var(--font-sans)' }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--t-text-muted)', textTransform: 'uppercase', letterSpacing: '.06em' }}>{k}: </span>
                  <span style={{ fontSize: 12, color: 'var(--t-text)' }}>{v}</span>
                </div>
              ))}
            </div>

            {/* Body */}
            <div style={{ padding: '16px', borderBottom: '1px solid var(--t-line)', minHeight: 120 }}>
              <p style={{ margin: 0, fontSize: 13, lineHeight: 1.7, color: 'var(--t-text)', fontFamily: 'var(--font-sans)', whiteSpace: 'pre-wrap' }}>
                {selected.body}
              </p>
            </div>

            {/* Reply */}
            <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <label style={labelStyle}>Reply</label>
              <textarea
                value={replyText}
                onChange={e => setReplyText(e.target.value)}
                placeholder="Type your reply…"
                style={{ ...inputStyle, minHeight: 90, resize: 'vertical' }}
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  onClick={handleReply}
                  disabled={sending || !replyText.trim()}
                  style={{
                    background: 'var(--t-accent)', border: 'none', color: '#000',
                    fontFamily: 'var(--font-sans)', fontSize: 13, fontWeight: 700,
                    padding: '9px 24px', cursor: sending || !replyText.trim() ? 'not-allowed' : 'pointer',
                    opacity: sending || !replyText.trim() ? 0.5 : 1,
                    letterSpacing: '0.04em',
                  }}>
                  {sending ? 'Sending…' : 'Send Reply'}
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="card" style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            minHeight: 300, color: 'var(--t-text-faint)', fontSize: 13,
            fontFamily: 'var(--font-sans)',
          }}>
            Select a message to read
          </div>
        )}
      </div>
    </div>
  )
}

// ── COMPOSE TAB (real 1:1 secure direct message via send_dm) ──────────────────

function ComposeTab({ people, personId }) {
  const [toId, setToId] = useState('')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const [toastMsg, setToastMsg] = useState('')
  const [toastType, setToastType] = useState('success')
  const [sent, setSent] = useState(false)

  const showToast = useCallback((msg, type = 'success') => {
    setToastMsg(msg); setToastType(type)
    setTimeout(() => setToastMsg(''), 3200)
  }, [])

  async function handleSend() {
    if (!toId) { showToast('Please select a recipient', 'error'); return }
    if (!body.trim()) { showToast('Message body is required', 'error'); return }
    if (sending) return
    setSending(true)
    const fullBody = subject.trim() ? `${subject.trim()}\n\n${body.trim()}` : body.trim()
    try {
      const { data, error } = await sb.rpc('send_dm', {
        p_from_id: personId,
        p_to_id: toId,
        p_body: fullBody,
      })
      if (error || data?.ok === false) {
        showToast('Failed to send. Try again.', 'error')
      } else {
        showToast('Message sent successfully')
        setSent(true)
        setToId(''); setSubject(''); setBody('')
        setTimeout(() => setSent(false), 4000)
      }
    } catch {
      showToast('Failed to send — connection problem.', 'error')
    } finally {
      setSending(false)
    }
  }

  const recipients = people.filter(p => p.person_id !== personId)

  return (
    <div style={{ padding: '16px 24px' }}>
      {toastMsg && (
        <div style={{
          position: 'fixed', top: 20, right: 20, zIndex: 9999,
          background: toastType === 'error' ? 'var(--t-danger)' : 'var(--t-accent)',
          color: '#000', padding: '10px 20px', fontWeight: 700, fontSize: 13,
          fontFamily: 'var(--font-sans)',
        }}>{toastMsg}</div>
      )}

      {sent && (
        <div style={{
          background: 'rgba(0,229,255,0.08)', border: '1px solid var(--t-accent)',
          padding: '12px 16px', marginBottom: 16, fontSize: 13, fontWeight: 600,
          color: 'var(--t-accent)', fontFamily: 'var(--font-sans)',
        }}>
          Message delivered successfully.
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 20, alignItems: 'start' }}>
        {/* LEFT: Compose Form */}
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={cardHeaderStyle}>
            <span style={sectionLabel}>New Secure Message</span>
            <span className="badge purple">HR Only</span>
          </div>
          <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>

            {/* To */}
            <div>
              <label style={labelStyle}>To (Employee)</label>
              <select value={toId} onChange={e => setToId(e.target.value)} style={inputStyle}>
                <option value="">— Select recipient —</option>
                {recipients.map(emp => (
                  <option key={emp.person_id} value={emp.person_id}>
                    {emp.full_name}{emp.node_name ? ` · ${emp.node_name}` : ''}
                  </option>
                ))}
              </select>
              {recipients.length === 0 && (
                <div style={{ marginTop: 6, fontSize: 11, color: 'var(--t-text-faint)', fontFamily: 'var(--font-sans)' }}>
                  No employees available in the directory.
                </div>
              )}
            </div>

            {/* Subject */}
            <div>
              <label style={labelStyle}>Subject</label>
              <input
                type="text" value={subject} onChange={e => setSubject(e.target.value)}
                placeholder="Enter subject…" style={inputStyle}
              />
            </div>

            {/* Body */}
            <div>
              <label style={labelStyle}>Message</label>
              <textarea
                value={body} onChange={e => setBody(e.target.value)}
                placeholder="Type your message here…"
                style={{ ...inputStyle, minHeight: 140, resize: 'vertical' }}
              />
            </div>

            {/* Send Button */}
            <button
              onClick={handleSend}
              disabled={sending || !toId || !body.trim()}
              style={{
                background: 'var(--t-accent)', border: 'none', color: '#000',
                fontFamily: 'var(--font-sans)', fontSize: 13, fontWeight: 700,
                padding: '11px 0', cursor: (sending || !toId || !body.trim()) ? 'not-allowed' : 'pointer',
                opacity: (sending || !toId || !body.trim()) ? 0.5 : 1,
                width: '100%', letterSpacing: '0.04em',
              }}>
              {sending ? 'Sending…' : 'Send Message'}
            </button>
          </div>
        </div>

        {/* RIGHT: Template Library */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={cardHeaderStyle}>
              <span style={sectionLabel}>Template Library</span>
            </div>
            <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {TEMPLATES.map(tpl => (
                <button
                  key={tpl.label}
                  onClick={() => { setSubject(tpl.subject); setBody(tpl.body) }}
                  style={{
                    background: 'var(--t-surface-2)', border: '1px solid var(--t-line)',
                    color: 'var(--t-text)', fontFamily: 'var(--font-sans)', fontSize: 13,
                    fontWeight: 600, padding: '9px 12px', textAlign: 'left', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    transition: 'border-color 0.15s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--t-accent)'; e.currentTarget.style.color = 'var(--t-accent)' }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--t-line)'; e.currentTarget.style.color = 'var(--t-text)' }}
                >
                  <span>{tpl.label}</span>
                  <span style={{ fontSize: 11, color: 'var(--t-text-faint)', fontWeight: 400 }}>pre-fill →</span>
                </button>
              ))}
              <div style={{ fontSize: 11, color: 'var(--t-text-faint)', fontFamily: 'var(--font-sans)', marginTop: 2 }}>
                Click a template to pre-fill subject and message.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── BROADCAST TAB (real announcements via post_shift_broadcast) ───────────────

function BroadcastTab({ personId, locations, roles, broadcasts, refresh }) {
  const [recipientMode, setRecipientMode] = useState('all') // 'all' | 'location' | 'role'
  const [selectedLocations, setSelectedLocations] = useState([]) // node ids
  const [selectedRoles, setSelectedRoles] = useState([])
  const [priority, setPriority] = useState('FYI')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [scheduled, setScheduled] = useState(false)
  const [schedDate, setSchedDate] = useState('')
  const [schedTime, setSchedTime] = useState('')
  const [sending, setSending] = useState(false)
  const [toastMsg, setToastMsg] = useState('')
  const [toastType, setToastType] = useState('success')

  const showToast = useCallback((msg, type = 'success') => {
    setToastMsg(msg); setToastType(type)
    setTimeout(() => setToastMsg(''), 3200)
  }, [])

  const locNameById = useMemo(() => {
    const m = {}
    locations.forEach(l => { m[l.id] = l.name })
    return m
  }, [locations])

  function toggleLocation(id) {
    setSelectedLocations(prev => prev.includes(id) ? prev.filter(l => l !== id) : [...prev, id])
  }
  function toggleRole(role) {
    setSelectedRoles(prev => prev.includes(role) ? prev.filter(r => r !== role) : [...prev, role])
  }

  function recipientSummary() {
    if (recipientMode === 'all') return 'All Staff'
    if (recipientMode === 'location') return selectedLocations.length ? selectedLocations.map(id => locNameById[id] || '?').join(', ') : 'No locations selected'
    if (recipientMode === 'role') return selectedRoles.length ? selectedRoles.join(', ') : 'No roles selected'
    return '—'
  }

  const PRIORITY_OPTIONS = [
    { value: 'FYI', label: 'FYI', color: 'var(--t-success)' },
    { value: 'IMPORTANT', label: 'Important', color: 'var(--t-warn)' },
    { value: 'URGENT', label: 'Urgent', color: 'var(--t-danger)' },
  ]

  async function handleBroadcast() {
    if (!subject.trim()) { showToast('Subject is required', 'error'); return }
    if (!body.trim()) { showToast('Message body is required', 'error'); return }
    if (recipientMode === 'location' && selectedLocations.length === 0) { showToast('Select at least one location', 'error'); return }
    if (recipientMode === 'role' && selectedRoles.length === 0) { showToast('Select at least one role', 'error'); return }
    if (scheduled && (!schedDate || !schedTime)) { showToast('Set a delivery date and time', 'error'); return }
    if (sending) return

    setSending(true)
    const scheduledAt = scheduled ? new Date(`${schedDate}T${schedTime}:00`).toISOString() : null
    try {
      const { data, error } = await sb.rpc('post_shift_broadcast', {
        p_author_id: personId,
        p_title: subject.trim(),
        p_body: body.trim(),
        p_priority: priority,
        p_node_ids: recipientMode === 'location' ? selectedLocations : null,
        p_role_names: recipientMode === 'role' ? selectedRoles : null,
        p_scheduled_at: scheduledAt,
      })
      if (error || data?.ok === false) {
        showToast(data?.error || 'Failed to send broadcast', 'error')
      } else {
        showToast(scheduled ? 'Broadcast scheduled' : 'Broadcast sent to ' + recipientSummary())
        setSubject(''); setBody(''); setPriority('FYI'); setRecipientMode('all')
        setSelectedLocations([]); setSelectedRoles([])
        setScheduled(false); setSchedDate(''); setSchedTime('')
        refresh && refresh()
      }
    } catch {
      showToast('Failed to send — connection problem.', 'error')
    } finally {
      setSending(false)
    }
  }

  return (
    <div style={{ padding: '16px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
      {toastMsg && (
        <div style={{
          position: 'fixed', top: 20, right: 20, zIndex: 9999,
          background: toastType === 'error' ? 'var(--t-danger)' : 'var(--t-accent)',
          color: '#000', padding: '10px 20px', fontWeight: 700, fontSize: 13,
          fontFamily: 'var(--font-sans)',
        }}>{toastMsg}</div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 20, alignItems: 'start' }}>
        {/* LEFT: Broadcast Form */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={cardHeaderStyle}>
              <span style={sectionLabel}>Send HR Broadcast</span>
              <span className="badge amber">Announcement</span>
            </div>
            <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>

              {/* Recipients */}
              <div>
                <label style={labelStyle}>Recipients</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {[
                    { value: 'all', label: 'All Staff' },
                    { value: 'location', label: 'By Location' },
                    { value: 'role', label: 'By Role' },
                  ].map(opt => (
                    <label key={opt.value} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontFamily: 'var(--font-sans)', fontSize: 13, color: 'var(--t-text)' }}>
                      <input
                        type="radio" name="recipMode" value={opt.value}
                        checked={recipientMode === opt.value}
                        onChange={() => setRecipientMode(opt.value)}
                        style={{ accentColor: 'var(--t-accent)' }}
                      />
                      {opt.label}
                    </label>
                  ))}

                  {/* Location checkboxes (real org_nodes) */}
                  {recipientMode === 'location' && (
                    locations.length === 0
                      ? <div style={{ paddingLeft: 20, fontSize: 12, color: 'var(--t-text-faint)', fontFamily: 'var(--font-sans)' }}>No locations visible in your scope.</div>
                      : <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', paddingLeft: 20, marginTop: 4 }}>
                          {locations.map(loc => (
                            <label key={loc.id} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontFamily: 'var(--font-sans)', fontSize: 12, color: 'var(--t-text)' }}>
                              <input type="checkbox" checked={selectedLocations.includes(loc.id)} onChange={() => toggleLocation(loc.id)} style={{ accentColor: 'var(--t-accent)' }} />
                              {loc.name}
                            </label>
                          ))}
                        </div>
                  )}

                  {/* Role checkboxes (real roles) */}
                  {recipientMode === 'role' && (
                    roles.length === 0
                      ? <div style={{ paddingLeft: 20, fontSize: 12, color: 'var(--t-text-faint)', fontFamily: 'var(--font-sans)' }}>No roles found in the directory.</div>
                      : <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', paddingLeft: 20, marginTop: 4 }}>
                          {roles.map(role => (
                            <label key={role} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontFamily: 'var(--font-sans)', fontSize: 12, color: 'var(--t-text)' }}>
                              <input type="checkbox" checked={selectedRoles.includes(role)} onChange={() => toggleRole(role)} style={{ accentColor: 'var(--t-accent)' }} />
                              {role}
                            </label>
                          ))}
                        </div>
                  )}

                  {/* Summary */}
                  <div style={{ fontSize: 11, color: 'var(--t-accent)', fontFamily: 'var(--font-sans)', fontWeight: 600, paddingLeft: 2 }}>
                    Sending to: {recipientSummary()}
                  </div>
                </div>
              </div>

              {/* Priority */}
              <div>
                <label style={labelStyle}>Priority</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  {PRIORITY_OPTIONS.map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => setPriority(opt.value)}
                      style={{
                        background: priority === opt.value ? opt.color : 'var(--t-surface-2)',
                        border: `1px solid ${priority === opt.value ? opt.color : 'var(--t-line)'}`,
                        color: priority === opt.value ? '#000' : 'var(--t-text)',
                        fontFamily: 'var(--font-sans)', fontSize: 12, fontWeight: 700,
                        padding: '6px 16px', cursor: 'pointer', transition: 'all 0.15s',
                      }}>
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Subject */}
              <div>
                <label style={labelStyle}>Subject</label>
                <input type="text" value={subject} onChange={e => setSubject(e.target.value)} placeholder="Broadcast subject…" style={inputStyle} />
              </div>

              {/* Body */}
              <div>
                <label style={labelStyle}>Message Body</label>
                <textarea value={body} onChange={e => setBody(e.target.value)} placeholder="Type your announcement…" style={{ ...inputStyle, minHeight: 120, resize: 'vertical' }} />
              </div>

              {/* Schedule Delivery */}
              <div style={{ padding: '10px 12px', background: 'var(--t-surface-2)', border: '1px solid var(--t-line)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: scheduled ? 12 : 0 }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--t-text)', fontFamily: 'var(--font-sans)' }}>Schedule Delivery</div>
                    <div style={{ fontSize: 11, color: 'var(--t-text-faint)', fontFamily: 'var(--font-sans)' }}>Send at a future date and time</div>
                  </div>
                  <div
                    onClick={() => setScheduled(v => !v)}
                    style={{
                      width: 44, height: 24, borderRadius: 12, cursor: 'pointer',
                      background: scheduled ? 'var(--t-accent)' : 'var(--t-line)',
                      position: 'relative', transition: 'background 0.2s', flexShrink: 0,
                    }}>
                    <div style={{
                      width: 18, height: 18, borderRadius: '50%', background: '#fff',
                      position: 'absolute', top: 3, left: scheduled ? 23 : 3, transition: 'left 0.2s',
                    }} />
                  </div>
                </div>
                {scheduled && (
                  <div style={{ display: 'flex', gap: 10 }}>
                    <div style={{ flex: 1 }}>
                      <label style={{ ...labelStyle, marginBottom: 4 }}>Date</label>
                      <input type="date" value={schedDate} onChange={e => setSchedDate(e.target.value)} style={{ ...inputStyle }} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <label style={{ ...labelStyle, marginBottom: 4 }}>Time</label>
                      <input type="time" value={schedTime} onChange={e => setSchedTime(e.target.value)} style={{ ...inputStyle }} />
                    </div>
                  </div>
                )}
              </div>

              {/* Send */}
              <button
                onClick={handleBroadcast}
                disabled={sending || !subject.trim() || !body.trim()}
                style={{
                  background: 'var(--t-accent)', border: 'none', color: '#000',
                  fontFamily: 'var(--font-sans)', fontSize: 13, fontWeight: 700,
                  padding: '11px 0', cursor: (sending || !subject.trim() || !body.trim()) ? 'not-allowed' : 'pointer',
                  opacity: (sending || !subject.trim() || !body.trim()) ? 0.5 : 1,
                  width: '100%', letterSpacing: '0.04em',
                }}>
                {sending ? 'Sending…' : scheduled ? 'Schedule Broadcast' : 'Send Broadcast'}
              </button>
            </div>
          </div>

          {/* Sent Broadcast History */}
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={cardHeaderStyle}>
              <span style={sectionLabel}>Sent Broadcast History</span>
              <span style={{ fontSize: 11, color: 'var(--t-text-faint)', fontFamily: 'var(--font-sans)' }}>last {Math.min(broadcasts.length, 10)}</span>
            </div>
            {broadcasts.length === 0 ? (
              <div style={{ padding: 20, color: 'var(--t-text-faint)', fontSize: 13, textAlign: 'center', fontFamily: 'var(--font-sans)' }}>
                No broadcasts sent yet.
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: 'var(--t-surface-2)' }}>
                      {['Subject', 'Recipients', 'Sent At', 'Read Rate'].map(h => (
                        <th key={h} style={{
                          padding: '9px 14px', textAlign: 'left',
                          fontSize: 10, fontWeight: 700, color: 'var(--t-text-muted)',
                          textTransform: 'uppercase', letterSpacing: '.06em',
                          borderBottom: '1px solid var(--t-line)', fontFamily: 'var(--font-sans)',
                          whiteSpace: 'nowrap',
                        }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {broadcasts.slice(0, 10).map((bc, i, arr) => (
                      <tr key={bc.id} style={{ borderBottom: i < arr.length - 1 ? '1px solid var(--t-line)' : 'none' }}>
                        <td style={{ padding: '9px 14px', fontSize: 12, color: 'var(--t-text)', fontFamily: 'var(--font-sans)', maxWidth: 220 }}>
                          <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{bc.subject}</div>
                        </td>
                        <td style={{ padding: '9px 14px', fontSize: 12, color: 'var(--t-text-muted)', fontFamily: 'var(--font-sans)', whiteSpace: 'nowrap' }}>{bc.recipients}</td>
                        <td style={{ padding: '9px 14px', fontSize: 12, color: 'var(--t-text-faint)', fontFamily: 'var(--font-sans)', whiteSpace: 'nowrap' }}>{formatDate(bc.sentAt)}</td>
                        <td style={{ padding: '9px 14px', whiteSpace: 'nowrap' }}>
                          <span style={{
                            fontSize: 12, fontWeight: 700, fontFamily: 'var(--font-sans)',
                            color: bc.total === 0 ? 'var(--t-text-faint)' : bc.openRate >= 80 ? 'var(--t-success)' : bc.openRate >= 50 ? 'var(--t-warn)' : 'var(--t-text-muted)',
                          }}>{bc.total === 0 ? '—' : `${bc.openRate}%`}</span>
                          <span style={{ fontSize: 10, color: 'var(--t-text-faint)', fontFamily: 'var(--font-sans)', marginLeft: 6 }}>{bc.readCount}/{bc.total}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT: Template Library */}
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={cardHeaderStyle}>
            <span style={sectionLabel}>Templates</span>
          </div>
          <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {TEMPLATES.map(tpl => (
              <button
                key={tpl.label}
                onClick={() => { setSubject(tpl.subject); setBody(tpl.body) }}
                style={{
                  background: 'var(--t-surface-2)', border: '1px solid var(--t-line)',
                  color: 'var(--t-text)', fontFamily: 'var(--font-sans)', fontSize: 13,
                  fontWeight: 600, padding: '9px 12px', textAlign: 'left', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  transition: 'border-color 0.15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--t-accent)'; e.currentTarget.style.color = 'var(--t-accent)' }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--t-line)'; e.currentTarget.style.color = 'var(--t-text)' }}
              >
                <span>{tpl.label}</span>
                <span style={{ fontSize: 11, color: 'var(--t-text-faint)', fontWeight: 400 }}>use →</span>
              </button>
            ))}
            <div style={{ fontSize: 11, color: 'var(--t-text-faint)', fontFamily: 'var(--font-sans)', marginTop: 4 }}>
              Click to pre-fill subject and body.
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── ROOT COMPONENT ─────────────────────────────────────────────────────────────

export default function HRMessages() {
  const { session } = useAuth()
  const { locationIds } = useScope()

  const person = session?.person || {}
  const personId = person.id || null
  const roleName = person.role_name || ''
  // HR inbox requires HR Manager, COO, Admin, or Owner — Store Managers are explicitly excluded
  const hasAccess = ['ceo', 'hr manager', 'hr', 'coo', 'admin', 'owner'].some(r =>
    roleName.toLowerCase().includes(r)
  ) && !roleName.toLowerCase().includes('store manager')

  const [tab, setTab] = useState('inbox')
  const [directory, setDirectory] = useState([])
  const [hub, setHub] = useState(null)
  const [broadcasts, setBroadcasts] = useState([])
  const [loadingData, setLoadingData] = useState(true)
  const [drill, setDrill] = useState(null)

  const scopeKey = (locationIds || []).join(',')

  const loadBroadcasts = useCallback(async () => {
    try {
      const { data, error } = await sb.rpc('get_shift_broadcasts', {
        p_person_id: personId,
        p_node_ids: (locationIds && locationIds.length) ? locationIds : null,
        p_limit: 50,
      })
      if (!error && Array.isArray(data)) setBroadcasts(data.map(normBroadcast))
    } catch { /* honest empty state on failure */ }
  }, [personId, scopeKey]) // eslint-disable-line react-hooks/exhaustive-deps

  const loadHub = useCallback(async () => {
    try {
      const { data, error } = await sb.rpc('get_comms_hub', {
        p_person_id: personId,
        p_node_ids: (locationIds && locationIds.length) ? locationIds : null,
      })
      if (!error && data && typeof data === 'object') setHub(data)
    } catch { /* leave hub null → tiles show 0 */ }
  }, [personId, scopeKey]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!hasAccess) { setLoadingData(false); return }
    let cancelled = false
    setLoadingData(true)
    ;(async () => {
      const dirP = sb.rpc('comms_person_directory').then(({ data, error }) => {
        if (!cancelled && !error && Array.isArray(data)) setDirectory(data)
      }).catch(() => {})
      await Promise.all([dirP, loadHub(), loadBroadcasts()])
      if (!cancelled) setLoadingData(false)
    })()
    return () => { cancelled = true }
  }, [hasAccess, scopeKey, loadHub, loadBroadcasts])

  const refreshBroadcasts = useCallback(() => { loadBroadcasts(); loadHub() }, [loadBroadcasts, loadHub])

  // Directory lookup by person_id → { full_name, node_name, role_name }.
  const directoryById = useMemo(() => {
    const m = {}
    directory.forEach(d => { m[d.person_id] = d })
    return m
  }, [directory])

  // Real locations (distinct nodes), constrained to the active scope when present.
  const locations = useMemo(() => {
    const seen = new Map()
    directory.forEach(d => {
      if (d.node_id && !seen.has(d.node_id)) seen.set(d.node_id, { id: d.node_id, name: d.node_name || 'Location' })
    })
    let arr = [...seen.values()]
    if (locationIds && locationIds.length) {
      const set = new Set(locationIds)
      const scoped = arr.filter(l => set.has(l.id))
      if (scoped.length) arr = scoped
    }
    return arr.sort((a, b) => a.name.localeCompare(b.name))
  }, [directory, scopeKey]) // eslint-disable-line react-hooks/exhaustive-deps

  // Real roles (distinct role names from the directory).
  const roles = useMemo(() => {
    const set = new Set()
    directory.forEach(d => { if (d.role_name) set.add(d.role_name) })
    return [...set].sort((a, b) => a.localeCompare(b))
  }, [directory])

  // ── KPI values — all live from get_comms_hub + get_shift_broadcasts ─────────
  const unreadCount = hub?.unread_dms ?? 0
  const msgsThisWeek = hub?.dm_week ?? 0
  const broadcastsMonth = hub?.ann_month ?? 0
  const activeBroadcasts = broadcasts.filter(b => b.status === 'ACTIVE').length
  const avgReadRate = hub?.avg_read_rate
  const pendingAcks = hub?.pending_acks_mine ?? 0

  // ── Drill-down column config for broadcasts ─────────────────────────────────
  const BROADCAST_COLS = [
    { key: 'subject', label: 'Subject', value: b => b.subject },
    { key: 'recipients', label: 'Recipients', value: b => b.recipients },
    { key: 'priority', label: 'Priority', value: b => b.priority },
    { key: 'sentAt', label: 'Sent At', value: b => formatDate(b.sentAt), sortKey: b => new Date(b.sentAt).getTime() },
    { key: 'read', label: 'Read', value: b => `${b.readCount}/${b.total}`, align: 'right', sortKey: b => (b.total ? b.readCount / b.total : 0) },
    { key: 'status', label: 'Status', value: b => b.status },
  ]
  const openBroadcastDrill = (title, rows) => setDrill({
    title,
    subtitle: `${rows.length} record${rows.length === 1 ? '' : 's'}`,
    columns: BROADCAST_COLS,
    rows,
    accent: 'var(--t-warn)',
  })

  const monthBroadcasts = useMemo(() => {
    const monthKey = new Date().toISOString().slice(0, 7)
    return broadcasts.filter(b => (b.sentAt || '').startsWith(monthKey))
  }, [broadcasts])
  const activeBroadcastRows = useMemo(() => broadcasts.filter(b => b.status === 'ACTIVE'), [broadcasts])

  return (
    <div style={{
      minHeight: '100vh', background: '#070b14',
      color: 'var(--t-text)', fontFamily: 'var(--font-sans)', paddingBottom: 48,
    }}>
      {/* Page Header */}
      <div style={{ padding: '20px 24px 0', borderBottom: '1px solid var(--t-line)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <div className="section-title">HR Messaging</div>
          <span className="badge purple">HR Only</span>
        </div>
        <div style={{ fontSize: 13, color: 'var(--t-text-muted)', fontWeight: 500, marginBottom: 12 }}>
          Secure confidential HR communications for all locations
        </div>

        {/* Tabs */}
        {hasAccess && (
          <div style={{ display: 'flex', borderBottom: 'none', gap: 0 }}>
            <TabBtn active={tab === 'inbox'} onClick={() => setTab('inbox')}>
              Inbox {unreadCount > 0 && <span style={{ marginLeft: 6, background: 'var(--t-danger)', color: '#fff', borderRadius: 10, padding: '1px 6px', fontSize: 10, fontWeight: 800 }}>{unreadCount}</span>}
            </TabBtn>
            <TabBtn active={tab === 'compose'} onClick={() => setTab('compose')}>Compose</TabBtn>
            <TabBtn active={tab === 'broadcast'} onClick={() => setTab('broadcast')}>HR Broadcast</TabBtn>
          </div>
        )}
      </div>

      {/* Lock Screen */}
      {!hasAccess ? (
        <LockScreen />
      ) : loadingData ? (
        <div className="loader">Loading…</div>
      ) : (
        <>
          {/* KPI Row — all values live */}
          <div style={{ padding: '16px 24px 0' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 4 }}>
              <KTile
                label="Unread Messages"
                value={unreadCount}
                sub="in HR inbox"
                alert={unreadCount > 0 ? 'red' : undefined}
                color={unreadCount > 0 ? 'var(--t-danger)' : 'var(--t-text)'}
              />
              <KTile
                label="Messages This Week"
                value={msgsThisWeek}
                sub="direct messages"
              />
              <KTile
                label="Broadcasts This Month"
                value={broadcastsMonth}
                sub="announcements sent"
                onClick={() => openBroadcastDrill('Broadcasts This Month', monthBroadcasts)}
              />
              <KTile
                label="Active Broadcasts"
                value={activeBroadcasts}
                sub="currently live"
                onClick={() => openBroadcastDrill('Active Broadcasts', activeBroadcastRows)}
              />
              <KTile
                label="Avg Read Rate"
                value={avgReadRate == null ? '—' : `${avgReadRate}%`}
                sub="last 30 days"
                color="var(--t-success)"
                onClick={() => openBroadcastDrill('Broadcast Read Rates', broadcasts)}
              />
              <KTile
                label="Pending Acknowledgments"
                value={pendingAcks}
                sub="require your response"
                alert={pendingAcks > 0 ? 'amber' : undefined}
                color={pendingAcks > 0 ? 'var(--t-warn)' : 'var(--t-text)'}
              />
            </div>
          </div>

          <DrillDown open={!!drill} onClose={() => setDrill(null)} {...(drill || {})} />

          {/* Tab Content */}
          {tab === 'inbox' && <InboxTab personId={personId} directoryById={directoryById} />}
          {tab === 'compose' && <ComposeTab people={directory} personId={personId} />}
          {tab === 'broadcast' && (
            <BroadcastTab
              personId={personId}
              locations={locations}
              roles={roles}
              broadcasts={broadcasts}
              refresh={refreshBroadcasts}
            />
          )}
        </>
      )}
    </div>
  )
}
