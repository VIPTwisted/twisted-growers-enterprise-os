import { useState, useEffect, useCallback, useRef } from 'react'
import { sb, getSession } from '../lib/supabase'
import { useAuth } from '../lib/auth.jsx'
import { useScope } from '../lib/scope.jsx'

// ── constants ──────────────────────────────────────────────────────────────────
// Fixed colors for the company channels; location channels get a deterministic
// color from the palette below. Colors are styling only — never data.
const CH_COLORS = {
  general:        '#00e5ff',
  scheduling:     '#ff9100',
  'manager-chat': '#ff4d7d',
  announcements:  '#00e5ff',
  training:       '#43e97b',
}
const LOC_PALETTE = ['#ffb800', '#2979ff', '#7c4dff', '#2ad6a0', '#ff9100', '#43e97b', '#ff4d7d']

function channelColor(key) {
  if (CH_COLORS[key]) return CH_COLORS[key]
  // deterministic per location channel
  let h = 0
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) & 0xffff
  return LOC_PALETTE[h % LOC_PALETTE.length]
}

const EMOJI_REACTIONS = ['👍', '❤️', '😂', '🔥', '💯', '🙌']
const FLAG_RX = /incident|complaint|harassment|urgent|escalat/i

// ── KPI tile ───────────────────────────────────────────────────────────────────
function KTile({ label, value, sub, color, alert }) {
  return (
    <div style={{
      background: 'var(--t-surface)',
      border: `1px solid ${alert === 'red' ? 'var(--t-danger)' : alert === 'amber' ? 'var(--t-warn)' : 'var(--t-line)'}`,
      padding: '14px 16px',
      position: 'relative',
      overflow: 'hidden',
      minWidth: 0,
    }}>
      {alert === 'red'   && <div style={{ position:'absolute', top:0, left:0, right:0, height:2, background:'var(--t-danger)' }} />}
      {alert === 'amber' && <div style={{ position:'absolute', top:0, left:0, right:0, height:2, background:'var(--t-warn)' }} />}
      <div style={{ fontSize:10, fontWeight:700, letterSpacing:'.08em', color:'var(--t-text-muted)', textTransform:'uppercase', marginBottom:6 }}>{label}</div>
      <div style={{ fontSize:24, fontWeight:800, color: color || 'var(--t-text)', lineHeight:1, marginBottom:4 }}>{value}</div>
      {sub && <div style={{ fontSize:11, color:'var(--t-text-faint)' }}>{sub}</div>}
    </div>
  )
}

// ── helpers ────────────────────────────────────────────────────────────────────
function getInitials(name) {
  if (!name) return '?'
  return name.split(' ').map(p => p[0]).join('').toUpperCase().slice(0, 2)
}

function formatTime(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const now = new Date()
  const diff = now - d
  const mins = Math.floor(diff / 60000)
  if (mins < 1)  return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24)  return `${hrs}h ago`
  return d.toLocaleDateString('en-US', { month:'short', day:'numeric' })
}

function formatDuration(mins) {
  if (mins == null || !isFinite(mins)) return '—'
  if (mins < 1) return '<1m'
  if (mins < 60) return `${Math.round(mins)}m`
  const h = Math.floor(mins / 60)
  return `${h}h ${Math.round(mins % 60)}m`
}

function avatarBg(name) {
  const PALETTES = [
    'rgba(0,229,255,.15)','rgba(124,77,255,.15)','rgba(42,214,160,.15)',
    'rgba(255,77,125,.15)','rgba(41,121,255,.15)','rgba(255,184,0,.15)',
  ]
  if (!name) return PALETTES[0]
  return PALETTES[name.charCodeAt(0) % PALETTES.length]
}

function avatarColor(name) {
  const COLORS = ['#00e5ff','#b39ddb','#2ad6a0','#ff4d7d','#2979ff','#ffb800']
  if (!name) return COLORS[0]
  return COLORS[name.charCodeAt(0) % COLORS.length]
}

// Group a flat DM list (from get_messages) into per-contact threads.
function buildDmThreads(rows, myId, myName) {
  const map = {}
  for (const r of rows || []) {
    const otherId   = r.from_id === myId ? r.to_id   : r.from_id
    const otherName = r.from_id === myId ? (r.to_name || 'Unknown') : (r.from_name || 'Unknown')
    const key = 'dm:' + (otherId ?? otherName)
    if (!map[key]) map[key] = { id: key, otherId, name: otherName, messages: [] }
    map[key].messages.push({
      id: r.id,
      sender_name: r.from_name || (r.from_id === myId ? myName : otherName),
      message: r.body || '',
      created_at: r.sent_at || r.created_at || new Date().toISOString(),
      read_at: r.read_at || null,
      from_id: r.from_id,
      to_id: r.to_id,
      reactions: [],
      reply_count: 0,
    })
  }
  return Object.values(map).map(t => {
    t.messages.sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
    const last = t.messages[t.messages.length - 1]
    t.preview = last?.message?.slice(0, 40) || ''
    t.ts = last?.created_at || null
    t.unread = t.messages.filter(m => m.to_id === myId && !m.read_at).length
    return t
  }).sort((a, b) => new Date(b.ts || 0) - new Date(a.ts || 0))
}

// ── REACTION BUTTON ────────────────────────────────────────────────────────────
function ReactionBar({ reactions, onReact }) {
  if (!reactions || reactions.length === 0) return null
  return (
    <div style={{ display:'flex', flexWrap:'wrap', gap:4, marginTop:4 }}>
      {reactions.map((r, i) => (
        <button
          key={i}
          onClick={() => onReact && onReact(r.emoji)}
          style={{
            background: 'rgba(255,255,255,.06)',
            border: '1px solid rgba(255,255,255,.1)',
            color: 'var(--t-text)',
            fontSize: 11,
            padding: '2px 7px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            fontFamily: 'inherit',
          }}
        >
          {r.emoji}
          <span style={{ fontSize:10, color:'var(--t-text-muted)', fontWeight:600 }}>{r.count}</span>
        </button>
      ))}
    </div>
  )
}

// ── EMOJI PICKER (inline popover) ──────────────────────────────────────────────
function EmojiPicker({ onSelect, onClose }) {
  return (
    <div style={{
      position: 'absolute',
      bottom: '100%',
      right: 0,
      background: 'var(--t-surface)',
      border: '1px solid var(--t-line)',
      padding: 8,
      display: 'flex',
      gap: 4,
      zIndex: 200,
      boxShadow: '0 4px 24px rgba(0,0,0,.5)',
    }}>
      {EMOJI_REACTIONS.map(e => (
        <button
          key={e}
          onClick={() => { onSelect(e); onClose(); }}
          style={{
            background: 'none',
            border: 'none',
            fontSize: 20,
            cursor: 'pointer',
            padding: '2px 4px',
          }}
        >
          {e}
        </button>
      ))}
    </div>
  )
}

// ── THREAD PANEL (real replies via get_chat_thread / chat_send_message) ─────────
function ThreadPanel({ message, channelKey, nodeId, myName, myId, onClose, onReplied }) {
  const [replies, setReplies]       = useState([])
  const [loading, setLoading]       = useState(true)
  const [replyInput, setReplyInput] = useState('')
  const [sending, setSending]       = useState(false)
  const bottomRef = useRef(null)

  const load = useCallback(async () => {
    if (!message?.id) return
    setLoading(true)
    try {
      const { data } = await sb.rpc('get_chat_thread', { p_parent_id: message.id })
      setReplies(Array.isArray(data) ? data : [])
    } catch { setReplies([]) }
    setLoading(false)
  }, [message?.id])

  useEffect(() => { load() }, [load])
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior:'smooth' }) }, [replies])

  async function sendReply(e) {
    e.preventDefault()
    const text = replyInput.trim()
    if (!text || sending) return
    setSending(true)
    setReplyInput('')
    try {
      await sb.rpc('chat_send_message', {
        p_channel_key: channelKey,
        p_sender_id: myId,
        p_sender_name: myName,
        p_body: text,
        p_node_id: nodeId ?? null,
        p_parent_id: message.id,
      })
    } catch { /* honest-failure toast handled by rpc wrapper */ }
    await load()
    onReplied && onReplied()
    setSending(false)
  }

  return (
    <div style={{
      width: 340,
      flexShrink: 0,
      background: 'rgba(10,16,28,.95)',
      borderLeft: '1px solid rgba(120,160,220,.18)',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
    }}>
      <div style={{
        display:'flex', alignItems:'center', justifyContent:'space-between',
        padding:'14px 16px', borderBottom:'1px solid rgba(120,160,220,.18)',
        flexShrink: 0,
      }}>
        <span style={{ fontSize:13, fontWeight:700, color:'var(--t-text)', letterSpacing:'-0.2px' }}>Thread</span>
        <button onClick={onClose} style={{
          background:'none', border:'none', color:'var(--t-text-muted)',
          fontSize:18, cursor:'pointer', lineHeight:1, padding:'0 2px',
        }}>×</button>
      </div>

      {/* parent message */}
      <div style={{
        padding:'12px 16px', borderBottom:'1px solid rgba(120,160,220,.12)',
        background:'rgba(0,229,255,.03)', flexShrink:0,
      }}>
        <div style={{ display:'flex', alignItems:'flex-start', gap:8 }}>
          <div style={{
            width:28, height:28, flexShrink:0,
            background: avatarBg(message.sender_name),
            color: avatarColor(message.sender_name),
            fontSize:10, fontWeight:800,
            display:'flex', alignItems:'center', justifyContent:'center',
          }}>
            {getInitials(message.sender_name)}
          </div>
          <div>
            <div style={{ display:'flex', alignItems:'baseline', gap:6, marginBottom:3 }}>
              <span style={{ fontSize:12, fontWeight:700, color:'var(--t-text)' }}>{message.sender_name}</span>
              <span style={{ fontSize:10, color:'var(--t-text-faint)' }}>{formatTime(message.created_at)}</span>
            </div>
            <div style={{ fontSize:12, color:'var(--t-text)', lineHeight:1.5 }}>{message.message}</div>
          </div>
        </div>
      </div>

      {/* replies */}
      <div style={{ flex:1, overflowY:'auto', padding:'8px 0' }}>
        {loading && (
          <div style={{ padding:'16px', textAlign:'center', fontSize:11, color:'var(--t-text-faint)' }}>Loading thread…</div>
        )}
        {!loading && replies.length === 0 && (
          <div style={{ padding:'16px', textAlign:'center', fontSize:11, color:'var(--t-text-faint)' }}>
            No replies yet. Start the thread.
          </div>
        )}
        {replies.map(r => (
          <div key={r.id} style={{ display:'flex', alignItems:'flex-start', gap:8, padding:'6px 16px' }}>
            <div style={{
              width:26, height:26, flexShrink:0,
              background: avatarBg(r.sender_name),
              color: avatarColor(r.sender_name),
              fontSize:9, fontWeight:800,
              display:'flex', alignItems:'center', justifyContent:'center',
            }}>
              {getInitials(r.sender_name)}
            </div>
            <div>
              <div style={{ display:'flex', alignItems:'baseline', gap:6, marginBottom:2 }}>
                <span style={{ fontSize:11, fontWeight:700, color:'var(--t-text)' }}>{r.sender_name}</span>
                <span style={{ fontSize:10, color:'var(--t-text-faint)' }}>{formatTime(r.created_at)}</span>
              </div>
              <div style={{ fontSize:12, color:'var(--t-text)', lineHeight:1.5 }}>{r.message}</div>
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* reply input */}
      <form onSubmit={sendReply} style={{
        borderTop:'1px solid rgba(120,160,220,.18)',
        padding:'10px 12px', display:'flex', gap:8, alignItems:'flex-end', flexShrink:0,
      }}>
        <textarea
          rows={1}
          value={replyInput}
          onChange={e => setReplyInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) sendReply(e) }}
          placeholder="Reply in thread…"
          disabled={sending}
          style={{
            flex:1, background:'rgba(14,22,38,.9)',
            border:'1px solid rgba(120,160,220,.22)',
            color:'var(--t-text)', fontSize:12, padding:'7px 10px',
            resize:'none', outline:'none',
            fontFamily:'var(--font-sans, "Inter Tight", system-ui, sans-serif)',
            lineHeight:1.4, minHeight:32, maxHeight:80,
          }}
        />
        <button type="submit" disabled={sending} style={{
          background: '#00e5ff', color:'#020c12',
          border:'none', padding:'7px 12px', fontSize:11,
          fontWeight:800, cursor:'pointer', flexShrink:0, fontFamily:'inherit',
        }}>
          ↑
        </button>
      </form>
    </div>
  )
}

// ── MAIN COMPONENT ─────────────────────────────────────────────────────────────
export default function Chat() {
  const { session } = useAuth()
  const { locationIds } = useScope()

  const roleName = (session?.person?.role_name || '').toLowerCase()
  const isHR = ['ceo','hr','manager','coo','admin','owner'].some(x => roleName.includes(x))
  const myName = session?.person?.full_name || session?.person?.name || getSession().full_name || 'You'
  const myId   = session?.person?.id || getSession().id || null

  // ── state ──────────────────────────────────────────────────────────────────
  const [channels,    setChannels]    = useState([])
  const [roster,      setRoster]      = useState([])
  const [dmThreads,   setDmThreads]   = useState([])
  const [pendingDm,   setPendingDm]   = useState(null)   // new DM not yet in history
  const [activeId,    setActiveId]    = useState('general')
  const [activeType,  setActiveType]  = useState('channel')  // 'channel' | 'dm'
  const [messages,    setMessages]    = useState({})
  const [input,       setInput]       = useState('')
  const [sending,     setSending]     = useState(false)
  const [loading,     setLoading]     = useState(false)
  const [threadMsg,   setThreadMsg]   = useState(null)
  const [showEmoji,   setShowEmoji]   = useState(false)
  const [sideSearch,  setSideSearch]  = useState('')
  const [msgSearch,   setMsgSearch]   = useState('')
  const [hoverMsgId,  setHoverMsgId]  = useState(null)
  const [composing,   setComposing]   = useState(false)

  const bottomRef = useRef(null)
  const pollRef   = useRef(null)

  const nodeKey = (locationIds || []).join(',')

  // ── load channel catalog (member counts + unread + previews) ─────────────────
  const loadChannels = useCallback(async () => {
    try {
      const { data } = await sb.rpc('get_chat_channels', { p_person_id: myId, p_node_ids: locationIds })
      setChannels(Array.isArray(data) ? data : [])
    } catch { setChannels([]) }
  }, [myId, nodeKey]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── load roster (real people) ────────────────────────────────────────────────
  const loadRoster = useCallback(async () => {
    try {
      const { data } = await sb.rpc('get_roster', { p_node_ids: locationIds })
      const mapped = (Array.isArray(data) ? data : []).map(r => ({
        id: r.id ?? r.person_id,
        full_name: r.full_name,
        role: r.role_name ?? r.role,
        node_id: r.node_id,
        node_name: r.node_name ?? r.location,
        hire_date: r.hire_date,
      })).filter(p => p.full_name)
      setRoster(mapped)
    } catch { setRoster([]) }
  }, [nodeKey]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── load direct messages (real, grouped into threads) ────────────────────────
  const loadDMs = useCallback(async () => {
    if (!myId) { setDmThreads([]); return }
    try {
      const { data } = await sb.rpc('get_messages', { p_person_id: myId })
      setDmThreads(buildDmThreads(data, myId, myName))
    } catch { setDmThreads([]) }
  }, [myId, myName])

  // ── load messages for a channel ──────────────────────────────────────────────
  const loadMessages = useCallback(async (chKey, silent = false) => {
    if (!silent) setLoading(true)
    let rows = []
    try {
      const { data } = await sb.rpc('get_chat_messages', { p_channel_key: chKey, p_limit: 200 })
      if (Array.isArray(data)) rows = data
    } catch { rows = [] }
    setMessages(prev => ({ ...prev, [chKey]: rows }))
    if (!silent) setLoading(false)
  }, [])

  // ── switch channel / DM ──────────────────────────────────────────────────────
  function switchTo(id, type) {
    setActiveId(id)
    setActiveType(type)
    setThreadMsg(null)
    setMsgSearch('')
    setComposing(false)
    if (type === 'channel') {
      if (!messages[id]) loadMessages(id)
      // mark read on the server, then refresh badges
      if (myId) sb.rpc('chat_mark_read', { p_channel_key: id, p_person_id: myId }).then(loadChannels).catch(() => {})
    } else {
      // mark DM incoming messages read (real), then refresh
      const t = dmThreads.find(x => x.id === id)
      const unreadIds = (t?.messages || []).filter(m => m.to_id === myId && !m.read_at).map(m => m.id)
      if (unreadIds.length) {
        Promise.all(unreadIds.map(mid => sb.rpc('mark_message_read', { p_message_id: mid }).catch(() => {})))
          .then(loadDMs)
      }
    }
  }

  // ── initial + scope-driven load ──────────────────────────────────────────────
  useEffect(() => {
    loadChannels()
    loadRoster()
    loadDMs()
  }, [loadChannels, loadRoster, loadDMs])

  // once channels are known, prefetch their messages so KPIs reflect real data
  useEffect(() => {
    if (!channels.length) return
    channels.forEach(ch => {
      const key = ch.channel_key
      if (ch.restricted && !isHR) return
      loadMessages(key, key !== activeId)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channels.map(c => c.channel_key).join(',')])

  // ── poll active channel ──────────────────────────────────────────────────────
  useEffect(() => {
    clearInterval(pollRef.current)
    if (activeType === 'channel') {
      pollRef.current = setInterval(() => loadMessages(activeId, true), 20000)
    } else {
      pollRef.current = setInterval(() => loadDMs(), 20000)
    }
    return () => clearInterval(pollRef.current)
  }, [activeId, activeType, loadMessages, loadDMs])

  // ── scroll to bottom ─────────────────────────────────────────────────────────
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior:'smooth' })
  }, [messages[activeId], activeId, dmThreads]) // eslint-disable-line

  // ── active DM thread resolver ────────────────────────────────────────────────
  const activeDm = activeType === 'dm'
    ? (dmThreads.find(t => t.id === activeId) || (pendingDm?.id === activeId ? pendingDm : null))
    : null

  // ── send message (channel → chat_send_message, DM → send_dm) ─────────────────
  async function handleSend(e) {
    e.preventDefault()
    const text = input.trim()
    if (!text || sending) return
    setSending(true)
    setInput('')

    if (activeType === 'channel') {
      const activeCh = channels.find(c => c.channel_key === activeId)
      const optId = 'opt-' + Date.now()
      const optimistic = {
        id: optId, sender_id: myId, sender_name: myName, message: text,
        created_at: new Date().toISOString(), _pending: true, reactions: [], reply_count: 0,
      }
      setMessages(prev => ({ ...prev, [activeId]: [...(prev[activeId] || []), optimistic] }))
      try {
        const { data } = await sb.rpc('chat_send_message', {
          p_channel_key: activeId,
          p_sender_id: myId,
          p_sender_name: myName,
          p_body: text,
          p_node_id: activeCh?.node_id ?? null,
          p_parent_id: null,
        })
        const saved = data?.message
        setMessages(prev => {
          const ch = prev[activeId] || []
          return { ...prev, [activeId]: saved
            ? ch.map(m => m.id === optId ? { ...saved, reactions: saved.reactions || [], reply_count: 0 } : m)
            : ch.filter(m => m.id !== optId) }
        })
        loadChannels()
      } catch {
        setMessages(prev => ({ ...prev, [activeId]: (prev[activeId] || []).filter(m => m.id !== optId) }))
      }
    } else if (activeDm?.otherId) {
      try {
        await sb.rpc('send_dm', { p_from_id: myId, p_to_id: activeDm.otherId, p_body: text })
      } catch { /* honest-failure toast handled by rpc wrapper */ }
      setPendingDm(null)
      await loadDMs()
      // keep the (now real) thread selected
      setActiveId('dm:' + activeDm.otherId)
    }
    setSending(false)
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) handleSend(e)
  }

  // ── react to a channel message (real toggle) ─────────────────────────────────
  async function handleReact(msgId, emoji) {
    if (activeType !== 'channel' || String(msgId).startsWith('opt-')) return
    try {
      const { data } = await sb.rpc('chat_toggle_reaction', {
        p_message_id: msgId, p_person_id: myId, p_person_name: myName, p_emoji: emoji,
      })
      if (data?.reactions) {
        setMessages(prev => ({
          ...prev,
          [activeId]: (prev[activeId] || []).map(m => m.id === msgId ? { ...m, reactions: data.reactions } : m),
        }))
      }
    } catch { /* silent — reaction not saved surfaces via rpc wrapper */ }
  }

  // ── start a new DM with a real person ────────────────────────────────────────
  function startDm(person) {
    const id = 'dm:' + person.id
    const existing = dmThreads.find(t => t.id === id)
    if (!existing) setPendingDm({ id, otherId: person.id, name: person.full_name, messages: [], preview: '', ts: null, unread: 0 })
    setActiveType('dm')
    setActiveId(id)
    setComposing(false)
    setThreadMsg(null)
  }

  // ── derived ──────────────────────────────────────────────────────────────────
  const activeMessages = activeType === 'channel' ? (messages[activeId] || []) : (activeDm?.messages || [])
  const chMessages = activeMessages.filter(m =>
    !msgSearch || m.message?.toLowerCase().includes(msgSearch.toLowerCase()) ||
    m.sender_name?.toLowerCase().includes(msgSearch.toLowerCase())
  )
  const activeCh    = channels.find(c => c.channel_key === activeId)
  const accentColor = activeType === 'channel' ? channelColor(activeId) : '#00e5ff'

  // ── KPI computations (all from real loaded data) ─────────────────────────────
  const allMessages = Object.values(messages).flat().filter(m => !m._pending)
  const dmMessages  = dmThreads.flatMap(t => t.messages)
  const now = Date.now()
  const todayStart  = new Date(); todayStart.setHours(0,0,0,0)
  const weekStart   = new Date(); weekStart.setDate(weekStart.getDate() - 7)

  const msgsToday = allMessages.filter(m => new Date(m.created_at) >= todayStart)
  const msgsWeek  = allMessages.filter(m => new Date(m.created_at) >= weekStart)
  const dmsToday  = dmMessages.filter(m => new Date(m.created_at) >= todayStart).length

  // active now = distinct posters in the last 15 minutes
  const activeCutoff = now - 15 * 60000
  const activeNames = new Set(
    allMessages.filter(m => new Date(m.created_at).getTime() >= activeCutoff).map(m => m.sender_name)
  )
  const activeNow = activeNames.size

  const channelUnread = channels.reduce((a, c) => a + (c.unread_count || 0), 0)
  const dmUnread      = dmThreads.reduce((a, t) => a + (t.unread || 0), 0)
  const myUnread      = channelUnread + dmUnread

  const activeChCount = channels.filter(ch =>
    (messages[ch.channel_key] || []).some(m => new Date(m.created_at).getTime() >= now - 86400000)
  ).length

  // top poster today
  const posterCounts = {}
  msgsToday.forEach(m => { posterCounts[m.sender_name] = (posterCounts[m.sender_name] || 0) + 1 })
  const topPoster = Object.entries(posterCounts).sort((a,b) => b[1]-a[1])[0]

  // most active channel (by loaded message count)
  let mostActive = null
  channels.forEach(ch => {
    const n = (messages[ch.channel_key] || []).length
    if (!mostActive || n > mostActive.n) mostActive = { label: ch.label, n }
  })

  // avg response = median gap between consecutive different-sender messages
  const gaps = []
  channels.forEach(ch => {
    const list = [...(messages[ch.channel_key] || [])].sort((a,b) => new Date(a.created_at) - new Date(b.created_at))
    for (let i = 1; i < list.length; i++) {
      if (list[i].sender_name !== list[i-1].sender_name) {
        gaps.push((new Date(list[i].created_at) - new Date(list[i-1].created_at)) / 60000)
      }
    }
  })
  gaps.sort((a,b) => a - b)
  const avgResp = gaps.length ? formatDuration(gaps[Math.floor(gaps.length / 2)]) : '—'

  // new members = roster hired within 30 days
  const newMembers = roster.filter(p => p.hire_date && (now - new Date(p.hire_date).getTime()) <= 30 * 86400000).length

  // flagged (HR only)
  const flagged = isHR ? allMessages.filter(m => FLAG_RX.test(m.message || '')).length : 0

  // sidebar filters
  const visibleChannels = channels
  const filteredChannels = visibleChannels.filter(ch =>
    !sideSearch || ch.label.toLowerCase().includes(sideSearch.toLowerCase()) ||
    (ch.description || '').toLowerCase().includes(sideSearch.toLowerCase())
  )
  const filteredDMs = dmThreads.filter(dm =>
    !sideSearch || dm.name.toLowerCase().includes(sideSearch.toLowerCase())
  )
  // team members to show as presence (real roster), most-recently-active first
  const teamMembers = roster.filter(p => p.id !== myId).slice(0, 8)

  // ── styles ───────────────────────────────────────────────────────────────────
  const rootStyle = {
    display: 'flex', flexDirection: 'column', height: 'calc(100vh - 56px)',
    background: '#070b14', fontFamily: 'var(--font-sans, "Inter Tight", system-ui, sans-serif)', overflow: 'hidden',
  }
  const kpiWrap = { padding: '12px 16px 10px', borderBottom: '1px solid rgba(120,160,220,.14)', background: 'rgba(7,11,20,.98)', flexShrink: 0 }
  const kpiGrid = { display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 8, marginBottom: 8 }
  const bodyStyle = { display: 'flex', flex: 1, overflow: 'hidden' }
  const sidebarStyle = { width: 230, flexShrink: 0, background: 'rgba(9,14,24,.96)', borderRight: '1px solid rgba(120,160,220,.14)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }
  const mainStyle = { flex: 1, display: 'flex', overflow: 'hidden' }
  const chatPaneStyle = { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#070b14' }

  const restrictedBlocked = activeType === 'channel' && activeCh?.restricted && !isHR

  return (
    <div style={rootStyle}>

      {/* ── KPI PANEL ──────────────────────────────────────────────────────── */}
      <div style={kpiWrap}>
        <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '.14em', color: 'var(--t-text-faint)', textTransform: 'uppercase', marginBottom: 8 }}>
          Team Chat · Live Metrics
        </div>
        {/* row 1 */}
        <div style={kpiGrid}>
          <KTile label="Active Now"    value={activeNow}            sub="posted in last 15m"   color="var(--t-success)" />
          <KTile label="Channels"      value={visibleChannels.length} sub="accessible to you" />
          <KTile label="Msgs Today"    value={msgsToday.length}     sub="across all channels" />
          <KTile label="My Unread"     value={myUnread}             sub="pending messages"
            color={myUnread > 0 ? 'var(--t-warn)' : 'var(--t-text)'} alert={myUnread > 5 ? 'amber' : undefined} />
          <KTile label="Active Ch 24h" value={activeChCount}        sub="channels with traffic" />
          <KTile label="DMs Today"     value={dmsToday}             sub="direct messages" />
        </div>
        {/* row 2 */}
        <div style={kpiGrid}>
          <KTile label="Most Active Ch" value={mostActive?.label || '—'} sub={`${mostActive?.n || 0} msgs`} color="var(--t-accent)" />
          <KTile label="Top Poster"     value={topPoster ? topPoster[0].split(' ')[0] : '—'} sub={`${topPoster ? topPoster[1] : 0} msgs today`} />
          <KTile label="Avg Response"   value={avgResp}             sub="median reply gap" color="var(--t-success)" />
          <KTile label="Msgs This Week" value={msgsWeek.length}     sub="7-day total" />
          <KTile label="New Members"    value={newMembers}          sub="hired last 30 days" color="var(--t-accent)" />
          {isHR ? (
            <KTile label="Flagged Msgs" value={flagged} sub="HR review needed"
              color={flagged > 0 ? 'var(--t-warn)' : 'var(--t-text)'} alert={flagged > 0 ? 'amber' : undefined} />
          ) : (
            <KTile label="Channels Joined" value={visibleChannels.length} sub="all locations + shared" />
          )}
        </div>
      </div>

      {/* ── BODY ───────────────────────────────────────────────────────────── */}
      <div style={bodyStyle}>

        {/* ── SIDEBAR ──────────────────────────────────────────────────────── */}
        <aside style={sidebarStyle}>

          {/* sidebar header + search */}
          <div style={{ padding: '12px 12px 8px', borderBottom: '1px solid rgba(120,160,220,.14)', flexShrink: 0 }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:8 }}>
              <div style={{ fontSize:11, fontWeight:800, color:'var(--t-text)', letterSpacing:'-0.2px' }}>Team Chat</div>
              <button
                onClick={() => setComposing(v => !v)}
                style={{
                  background: composing ? '#00e5ff' : 'rgba(0,229,255,.12)',
                  border:'1px solid rgba(0,229,255,.2)',
                  color: composing ? '#020c12' : '#00e5ff', fontSize:16, fontWeight:700,
                  width:24, height:24, cursor:'pointer',
                  display:'flex', alignItems:'center', justifyContent:'center', lineHeight:1,
                }} title="New direct message">+</button>
            </div>
            <input
              type="text"
              value={sideSearch}
              onChange={e => setSideSearch(e.target.value)}
              placeholder="Search channels…"
              style={{
                width: '100%', boxSizing:'border-box', background: 'rgba(14,22,38,.8)',
                border: '1px solid rgba(120,160,220,.18)', color: 'var(--t-text)', fontSize:11,
                padding: '5px 8px', outline:'none', fontFamily: 'inherit',
              }}
            />
          </div>

          {/* channel list */}
          <div style={{ overflowY:'auto', flex:1, padding:'6px 0' }}>

            <div style={{ fontSize:9, fontWeight:700, letterSpacing:'.12em', color:'var(--t-text-faint)', textTransform:'uppercase', padding:'8px 14px 4px' }}>
              Channels
            </div>

            {filteredChannels.length === 0 && (
              <div style={{ fontSize:11, color:'var(--t-text-faint)', padding:'6px 14px' }}>No channels.</div>
            )}

            {filteredChannels.map(ch => {
              const isActive = activeId === ch.channel_key && activeType === 'channel'
              const badge = ch.unread_count || 0
              const msgs  = messages[ch.channel_key] || []
              const latestMsg = msgs[msgs.length - 1]
              const col = channelColor(ch.channel_key)
              return (
                <div
                  key={ch.channel_key}
                  onClick={() => switchTo(ch.channel_key, 'channel')}
                  style={{
                    display:'flex', alignItems:'center', gap:7, padding:'6px 14px', cursor:'pointer',
                    borderLeft:`3px solid ${isActive ? col : 'transparent'}`,
                    background: isActive ? 'rgba(0,229,255,.05)' : 'transparent', transition: 'background .1s',
                  }}
                >
                  <span style={{ width:5, height:5, flexShrink:0, background: isActive ? col : 'rgba(120,160,220,.2)' }} />
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{
                      fontSize:12, fontWeight: badge > 0 || isActive ? 700 : 400,
                      color: ch.restricted && !isHR ? 'var(--t-text-faint)' : isActive || badge > 0 ? 'var(--t-text)' : 'var(--t-text-muted)',
                      overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', display:'flex', alignItems:'center', gap:4,
                    }}>
                      {ch.label}
                      {ch.restricted && !isHR && <span style={{ fontSize:9, opacity:.5, flexShrink:0 }}>🔒</span>}
                    </div>
                    {latestMsg && !isActive && (
                      <div style={{ fontSize:10, color:'var(--t-text-faint)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                        {latestMsg.message?.slice(0,30)}…
                      </div>
                    )}
                  </div>
                  {badge > 0 && (
                    <span style={{ background:'#ff4d7d', color:'#fff', fontSize:9, fontWeight:900, padding:'1px 5px', minWidth:16, textAlign:'center', lineHeight:'14px', flexShrink:0 }}>
                      {badge}
                    </span>
                  )}
                </div>
              )
            })}

            {/* DMs section */}
            <div style={{ fontSize:9, fontWeight:700, letterSpacing:'.12em', color:'var(--t-text-faint)', textTransform:'uppercase', padding:'14px 14px 4px' }}>
              Direct Messages
            </div>

            {filteredDMs.length === 0 && (
              <div style={{ fontSize:10, color:'var(--t-text-faint)', padding:'4px 14px 2px' }}>
                No conversations yet. Use + to start one.
              </div>
            )}

            {filteredDMs.map(dm => {
              const isActive = activeId === dm.id && activeType === 'dm'
              const badge = dm.unread || 0
              return (
                <div
                  key={dm.id}
                  onClick={() => switchTo(dm.id, 'dm')}
                  style={{
                    display:'flex', alignItems:'center', gap:7, padding:'6px 14px', cursor:'pointer',
                    borderLeft:`3px solid ${isActive ? '#00e5ff' : 'transparent'}`,
                    background: isActive ? 'rgba(0,229,255,.05)' : 'transparent', transition: 'background .1s',
                  }}
                >
                  <div style={{
                    width:22, height:22, flexShrink:0, background: avatarBg(dm.name), color: avatarColor(dm.name),
                    fontSize:8, fontWeight:800, display:'flex', alignItems:'center', justifyContent:'center', position:'relative',
                  }}>
                    {getInitials(dm.name)}
                    <span style={{
                      position:'absolute', bottom:0, right:0, width:5, height:5,
                      background: activeNames.has(dm.name) ? '#2ad6a0' : 'rgba(120,160,220,.3)',
                    }} />
                  </div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{
                      fontSize:12, fontWeight: badge > 0 || isActive ? 700 : 400,
                      color: isActive || badge > 0 ? 'var(--t-text)' : 'var(--t-text-muted)',
                      overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap',
                    }}>
                      {dm.name}
                    </div>
                    <div style={{ fontSize:10, color:'var(--t-text-faint)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                      {dm.preview || 'No messages yet'}
                    </div>
                  </div>
                  {badge > 0 && (
                    <span style={{ background:'#ff4d7d', color:'#fff', fontSize:9, fontWeight:900, padding:'1px 5px', minWidth:16, textAlign:'center', lineHeight:'14px', flexShrink:0 }}>
                      {badge}
                    </span>
                  )}
                </div>
              )
            })}

            {/* team roster / presence (real people) */}
            <div style={{ fontSize:9, fontWeight:700, letterSpacing:'.12em', color:'var(--t-text-faint)', textTransform:'uppercase', padding:'14px 14px 6px' }}>
              Team
            </div>
            {teamMembers.length === 0 && (
              <div style={{ fontSize:11, color:'var(--t-text-faint)', padding:'3px 14px' }}>No teammates in scope.</div>
            )}
            {teamMembers.map(emp => (
              <div key={emp.id || emp.full_name} onClick={() => startDm(emp)} title="Start a direct message"
                style={{ display:'flex', alignItems:'center', gap:6, padding:'3px 14px', cursor:'pointer' }}>
                <span style={{ width:5, height:5, flexShrink:0, background: activeNames.has(emp.full_name) ? '#2ad6a0' : 'rgba(120,160,220,.3)' }} />
                <span style={{ fontSize:11, color:'var(--t-text-muted)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{emp.full_name}</span>
              </div>
            ))}
          </div>

          {/* sidebar footer */}
          <div style={{ padding:'10px 14px', borderTop:'1px solid rgba(120,160,220,.14)', flexShrink:0 }}>
            {activeType === 'channel' && activeCh && (
              <div style={{ fontSize:10, color:'var(--t-text-faint)', lineHeight:1.5 }}>
                {activeCh.description}
                {activeCh.restricted && (
                  <span style={{ display:'inline-block', marginLeft:6, fontSize:9, fontWeight:700, color:'#ffb800', letterSpacing:'.1em' }}>
                    RESTRICTED
                  </span>
                )}
              </div>
            )}
            {activeType === 'dm' && (
              <div style={{ fontSize:10, color:'var(--t-text-faint)' }}>Direct message conversation</div>
            )}
          </div>
        </aside>

        {/* ── MAIN CHAT AREA ─────────────────────────────────────────────── */}
        <div style={mainStyle}>
          <div style={chatPaneStyle}>

            {/* channel header */}
            <div style={{
              display:'flex', alignItems:'center', gap:10, padding:'0 20px', height:48,
              borderBottom:'1px solid rgba(120,160,220,.14)', background:'rgba(9,14,24,.8)', flexShrink:0,
            }}>
              <div style={{ width:3, height:26, background:accentColor, flexShrink:0 }} />
              <div style={{ flex:1, minWidth:0 }}>
                <span style={{ fontSize:14, fontWeight:700, color:'var(--t-text)', letterSpacing:'-0.2px' }}>
                  {composing ? 'New Direct Message'
                    : activeType === 'channel' ? (activeCh?.label || '#' + activeId)
                    : (activeDm?.name || 'Direct message')}
                </span>
                {activeType === 'channel' && activeCh && !composing && (
                  <span style={{ fontSize:11, color:'var(--t-text-faint)', marginLeft:8 }}>
                    {activeCh.description} · {activeCh.member_count} members
                  </span>
                )}
              </div>

              {!composing && (
                <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                  <input
                    type="text"
                    value={msgSearch}
                    onChange={e => setMsgSearch(e.target.value)}
                    placeholder="Search messages…"
                    style={{
                      background:'rgba(14,22,38,.8)', border:'1px solid rgba(120,160,220,.18)',
                      color:'var(--t-text)', fontSize:11, padding:'4px 8px', outline:'none', fontFamily:'inherit', width:160,
                    }}
                  />
                  <span style={{ fontSize:10, color:'var(--t-text-faint)', letterSpacing:'.08em' }}>{chMessages.length} MSGS</span>
                </div>
              )}
            </div>

            {/* compose: pick a real teammate to DM */}
            {composing ? (
              <div style={{ flex:1, overflowY:'auto', padding:'12px 20px' }}>
                <div style={{ fontSize:11, color:'var(--t-text-muted)', marginBottom:10 }}>Select a teammate to message:</div>
                {roster.filter(p => p.id !== myId).length === 0 && (
                  <div style={{ fontSize:12, color:'var(--t-text-faint)' }}>No teammates available in the current scope.</div>
                )}
                {roster.filter(p => p.id !== myId).map(p => (
                  <div key={p.id} onClick={() => startDm(p)}
                    style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 10px', cursor:'pointer', borderBottom:'1px solid rgba(120,160,220,.08)' }}>
                    <div style={{ width:28, height:28, background: avatarBg(p.full_name), color: avatarColor(p.full_name), fontSize:10, fontWeight:800, display:'flex', alignItems:'center', justifyContent:'center' }}>
                      {getInitials(p.full_name)}
                    </div>
                    <div>
                      <div style={{ fontSize:13, color:'var(--t-text)' }}>{p.full_name}</div>
                      <div style={{ fontSize:10, color:'var(--t-text-faint)' }}>{[p.role, p.node_name].filter(Boolean).join(' · ')}</div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
            <>
            {/* pinned banner (channels only, when a message is pinned via reactions? — none for now) */}

            {/* message area */}
            <div style={{ flex:1, overflowY:'auto', padding:'8px 0', display:'flex', flexDirection:'column' }}>
              {/* Restricted channel — block content for non-managers */}
              {restrictedBlocked && (
                <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column', gap:10, color:'var(--t-text-faint)' }}>
                  <div style={{ fontSize:28, opacity:.2 }}>🔒</div>
                  <div style={{ fontSize:13, fontWeight:600 }}>Manager channel — restricted access</div>
                  <div style={{ fontSize:11 }}>You do not have permission to view this channel.</div>
                </div>
              )}

              {!restrictedBlocked && loading && chMessages.length === 0 && (
                <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', color:'var(--t-text-faint)', fontSize:12 }}>
                  Loading messages…
                </div>
              )}

              {!restrictedBlocked && !loading && chMessages.length === 0 && (
                <div style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', color:'var(--t-text-faint)', fontSize:12, gap:6, padding:40 }}>
                  <div style={{ fontSize:28, color:accentColor }}>
                    {activeType === 'channel' ? (activeCh?.label?.charAt(0) || '#') : '💬'}
                  </div>
                  <div style={{ fontWeight:700, fontSize:13, color:'var(--t-text-muted)' }}>No messages yet</div>
                  <div>
                    {activeType === 'channel'
                      ? `Be the first to post in ${activeCh?.label || 'this channel'}`
                      : `Say hello to ${activeDm?.name || 'your teammate'}`}
                  </div>
                </div>
              )}

              {!restrictedBlocked && chMessages.map((msg, idx) => {
                const isPrev = idx > 0 && chMessages[idx-1].sender_name === msg.sender_name
                const isHovered = hoverMsgId === msg.id
                const isPending = !!msg._pending
                const canThread = activeType === 'channel' && !isPending

                return (
                  <div
                    key={msg.id}
                    onMouseEnter={() => setHoverMsgId(msg.id)}
                    onMouseLeave={() => setHoverMsgId(null)}
                    style={{
                      display:'flex', alignItems:'flex-start', gap:10,
                      padding: isPrev ? '2px 20px' : '10px 20px 2px',
                      background: isHovered ? 'rgba(255,255,255,.02)' : 'transparent',
                      position:'relative', opacity: isPending ? 0.6 : 1, transition:'background .1s',
                    }}
                  >
                    {!isPrev ? (
                      <div style={{
                        width:32, height:32, flexShrink:0, background: avatarBg(msg.sender_name), color: avatarColor(msg.sender_name),
                        fontSize:11, fontWeight:800, marginTop:2, display:'flex', alignItems:'center', justifyContent:'center', letterSpacing:'0.02em',
                      }}>
                        {getInitials(msg.sender_name)}
                      </div>
                    ) : (
                      <div style={{ width:32, flexShrink:0, position:'relative' }}>
                        {isHovered && (
                          <span style={{ position:'absolute', top:'50%', left:'50%', transform:'translate(-50%,-50%)', fontSize:9, color:'var(--t-text-faint)', whiteSpace:'nowrap' }}>
                            {formatTime(msg.created_at)}
                          </span>
                        )}
                      </div>
                    )}

                    <div style={{ flex:1, minWidth:0 }}>
                      {!isPrev && (
                        <div style={{ display:'flex', alignItems:'baseline', gap:8, marginBottom:2, flexWrap:'wrap' }}>
                          <span style={{ fontSize:13, fontWeight:700, color:'var(--t-text)' }}>{msg.sender_name || 'Unknown'}</span>
                          <span style={{ fontSize:10, color:'var(--t-text-faint)' }}>{formatTime(msg.created_at)}</span>
                          {isPending && <span style={{ fontSize:9, color:'var(--t-text-faint)' }}>sending…</span>}
                        </div>
                      )}

                      <div style={{ fontSize:13, color:'var(--t-text)', lineHeight:1.55, wordBreak:'break-word' }}>{msg.message}</div>

                      <ReactionBar reactions={msg.reactions} onReact={(emoji) => handleReact(msg.id, emoji)} />

                      {msg.reply_count > 0 && (
                        <button onClick={() => setThreadMsg(msg)} style={{
                          background:'none', border:'none', color:'#00e5ff', fontSize:11, fontWeight:600,
                          cursor:'pointer', marginTop:3, padding:0, fontFamily:'inherit',
                        }}>
                          {msg.reply_count} {msg.reply_count === 1 ? 'reply' : 'replies'} →
                        </button>
                      )}
                    </div>

                    {isHovered && canThread && (
                      <div style={{
                        position:'absolute', right:16, top:6, display:'flex', alignItems:'center', gap:4,
                        background:'var(--t-surface)', border:'1px solid var(--t-line)', padding:'3px 6px', zIndex:10,
                      }}>
                        {EMOJI_REACTIONS.slice(0,3).map(e => (
                          <button key={e} onClick={() => handleReact(msg.id, e)} style={{ background:'none', border:'none', fontSize:14, cursor:'pointer', padding:'1px 2px' }}>
                            {e}
                          </button>
                        ))}
                        <button onClick={() => setThreadMsg(msg)} style={{
                          background:'none', border:'none', color:'var(--t-text-muted)', fontSize:11, cursor:'pointer', fontFamily:'inherit', padding:'1px 4px', fontWeight:600,
                        }}>
                          Reply
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}

              <div ref={bottomRef} />
            </div>

            {/* input */}
            <form onSubmit={restrictedBlocked ? e => e.preventDefault() : handleSend} style={{
              borderTop:'1px solid rgba(120,160,220,.14)', background:'rgba(9,14,24,.8)', padding:'10px 16px', flexShrink:0,
              display:'flex', gap:8, alignItems:'flex-end',
            }}>
              <div style={{ position:'relative', flexShrink:0 }}>
                <button type="button" onClick={() => setShowEmoji(v => !v)} style={{
                  background:'rgba(255,255,255,.05)', border:'1px solid rgba(120,160,220,.18)', color:'var(--t-text-muted)', fontSize:16,
                  width:36, height:36, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center',
                }}>😊</button>
                {showEmoji && <EmojiPicker onSelect={(e) => setInput(v => v + e)} onClose={() => setShowEmoji(false)} />}
              </div>

              <textarea
                style={{
                  flex:1, background:'rgba(14,22,38,.9)', border:'1px solid rgba(120,160,220,.22)', color:'var(--t-text)', fontSize:13,
                  padding:'8px 12px', resize:'none', outline:'none', fontFamily:'var(--font-sans, "Inter Tight", system-ui, sans-serif)',
                  lineHeight:1.5, minHeight:36, maxHeight:120, opacity: restrictedBlocked ? 0.3 : 1,
                }}
                rows={1}
                placeholder={restrictedBlocked
                  ? 'You do not have permission to post in this channel'
                  : activeType === 'channel'
                    ? `Message ${activeCh?.label || '#' + activeId}…`
                    : `Message ${activeDm?.name || '…'}`}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={sending || restrictedBlocked}
              />

              <button
                type="submit"
                disabled={!input.trim() || sending || restrictedBlocked}
                style={{
                  background: !input.trim() || sending || restrictedBlocked ? 'rgba(0,229,255,.10)' : accentColor,
                  color: !input.trim() || sending || restrictedBlocked ? 'rgba(0,229,255,.4)' : '#020c12',
                  border:'none', padding:'8px 18px', fontSize:12, fontWeight:800, letterSpacing:'.08em',
                  cursor: !input.trim() || sending || restrictedBlocked ? 'not-allowed' : 'pointer',
                  flexShrink:0, fontFamily:'inherit', transition:'background .15s',
                }}
              >
                SEND
              </button>
            </form>
            </>
            )}

          </div>

          {/* ── THREAD PANEL ─────────────────────────────────────────────── */}
          {threadMsg && activeType === 'channel' && (
            <ThreadPanel
              message={threadMsg}
              channelKey={activeId}
              nodeId={activeCh?.node_id}
              myName={myName}
              myId={myId}
              onClose={() => setThreadMsg(null)}
              onReplied={() => loadMessages(activeId, true)}
            />
          )}
        </div>
      </div>
    </div>
  )
}
