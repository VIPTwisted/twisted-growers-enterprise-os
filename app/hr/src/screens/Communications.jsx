// Communications — fully live screen. Every number, feed row, receipt and
// write on this page comes from the HR Supabase brain (fxetuqjryttnypgepsru, schema hr):
//   reads  : get_comms_hub, get_shift_broadcasts, get_broadcast_receipts,
//            get_roster, get_messages, get_chat_channels, get_huddles
//   writes : post_shift_broadcast, post_announcement, broadcast_mark_read,
//            broadcast_ack, broadcast_remind, send_dm
// No mock arrays, no seeded generators, no localStorage data stores.
// Empty feeds render honest empty states.
import { useState, useEffect, useCallback, useMemo, Fragment } from 'react'
import { useNavigate } from 'react-router-dom'
import { sb } from '../lib/supabase'
import { useAuth } from '../lib/auth.jsx'
import { useScope } from '../lib/scope.jsx'
import { useFeatureFlag } from '../lib/featureFlags.js'
import DrillDown from '../components/DrillDown.jsx'

// Shift-target labels are composer options (config), not data.
const SHIFT_TARGETS = ['All Shifts', 'AM Shift', 'PM Shift', 'Closing']

const SRC_META = {
  chat:     { label: 'Team Chat',    color: 'var(--t-accent)' },
  dm:       { label: 'Direct Msg',   color: 'var(--t-text-muted)' },
  announce: { label: 'Announcement', color: 'var(--t-warn)' },
  hr:       { label: 'HR Message',   color: 'var(--t-danger)' },
  huddle:   { label: 'Huddle',       color: 'var(--t-success)' },
}

// ── TIME HELPERS ──────────────────────────────────────────────────────────────
function timeAgo(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  if (isNaN(d)) return ''
  const s = Math.floor((Date.now() - d.getTime()) / 1000)
  if (s < 60) return 'just now'
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const dd = Math.floor(h / 24)
  if (dd === 1) return 'Yesterday'
  if (dd < 7) return `${dd} days ago`
  return d.toLocaleDateString()
}
function fmtDateTime(ts) {
  if (!ts) return '—'
  const d = new Date(ts)
  if (isNaN(d)) return '—'
  return d.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}
function expiryToTs(expiry, custom) {
  const end = (d) => { d.setHours(23, 59, 0, 0); return d.toISOString() }
  if (expiry === 'Tonight') return end(new Date())
  if (expiry === 'Tomorrow') { const d = new Date(); d.setDate(d.getDate() + 1); return end(d) }
  if (expiry === 'End of Week') { const d = new Date(); d.setDate(d.getDate() + ((7 - d.getDay()) % 7 || 7)); return end(d) }
  if (expiry === 'Custom' && custom) { const d = new Date(`${custom}T12:00:00`); return isNaN(d) ? null : end(d) }
  return null
}

// Normalize one get_shift_broadcasts row for the UI.
function normBroadcast(b) {
  const locs = Array.isArray(b.target_locations) && b.target_locations.length
    ? b.target_locations
    : ['All Locations']
  return {
    id: b.id,
    title: b.title || '(untitled)',
    body: b.body || '',
    priority: b.priority || 'FYI',
    kind: b.kind || 'Announcement',
    target: { locations: locs, shift: b.shift_target || 'All Shifts' },
    targetRoles: Array.isArray(b.target_roles) ? b.target_roles : null,
    senderName: b.sender_name || '—',
    senderRole: b.sender_role || '',
    createdAt: b.created_at,
    date: (b.created_at || '').slice(0, 10),
    postedTime: timeAgo(b.created_at),
    expiry: b.expires_at ? fmtDateTime(b.expires_at) : '—',
    status: b.status || 'ACTIVE',
    requiresAck: !!b.requires_ack,
    pinned: !!b.pinned,
    readCount: b.read_count || 0,
    ackCount: b.ack_count || 0,
    total: b.total_recipients || 0,
    myRead: !!b.my_read,
    myAcked: !!b.my_acked,
  }
}

// ── SHARED STYLE CONSTANTS ────────────────────────────────────────────────────
const S = {
  card: {
    background: 'var(--t-surface)',
    border: '1px solid var(--t-line)',
    borderRadius: 0,
    marginBottom: 16,
  },
  cardHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 16px',
    borderBottom: '1px solid var(--t-line)',
  },
  cardTitle: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: '.1em',
    textTransform: 'uppercase',
    color: 'var(--t-text-muted)',
  },
  cardBody: {
    padding: '16px',
  },
  label: {
    fontSize: 12,
    fontWeight: 600,
    color: 'var(--t-text-muted)',
    marginBottom: 4,
    display: 'block',
  },
  text: {
    fontSize: 14,
    color: 'var(--t-text)',
  },
  muted: {
    fontSize: 12,
    color: 'var(--t-text-faint)',
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  btnCyan: {
    background: 'var(--t-accent)',
    color: '#000',
    border: 'none',
    borderRadius: 0,
    padding: '7px 14px',
    fontSize: 12,
    fontWeight: 700,
    cursor: 'pointer',
    letterSpacing: '.04em',
  },
  btnGhost: {
    background: 'transparent',
    color: 'var(--t-text-muted)',
    border: '1px solid var(--t-line)',
    borderRadius: 0,
    padding: '7px 14px',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
  },
  btnDanger: {
    background: 'var(--t-danger)',
    color: '#fff',
    border: 'none',
    borderRadius: 0,
    padding: '7px 14px',
    fontSize: 12,
    fontWeight: 700,
    cursor: 'pointer',
  },
  input: {
    background: 'var(--t-surface-2)',
    border: '1px solid var(--t-line)',
    borderRadius: 0,
    color: 'var(--t-text)',
    padding: '8px 10px',
    fontSize: 13,
    width: '100%',
    boxSizing: 'border-box',
    outline: 'none',
  },
  sendBtn: {
    background: 'var(--t-accent)',
    color: '#000',
    border: 'none',
    borderRadius: 0,
    padding: '10px 20px',
    fontSize: 13,
    fontWeight: 800,
    cursor: 'pointer',
    letterSpacing: '.06em',
    whiteSpace: 'nowrap',
  },
  sectionLabel: {
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: '.1em',
    textTransform: 'uppercase',
    color: 'var(--t-text-muted)',
  },
}

// ── KPI TILE ──────────────────────────────────────────────────────────────────
function KTile({label, value, sub, color, alert, onClick}) {
  return (
    <div onClick={onClick} title={onClick ? 'Click to drill into records' : undefined} style={{background:'var(--t-surface)',border:`1px solid ${alert==='red'?'var(--t-danger)':alert==='amber'?'var(--t-warn)':'var(--t-line)'}`,borderRadius:0,padding:'14px 16px',position:'relative',overflow:'hidden',cursor:onClick?'pointer':'default'}}>
      {alert==='red'&&<div style={{position:'absolute',top:0,left:0,right:0,height:2,background:'var(--t-danger)'}}/>}
      {alert==='amber'&&<div style={{position:'absolute',top:0,left:0,right:0,height:2,background:'var(--t-warn)'}}/>}
      <div style={{fontSize:10,fontWeight:700,letterSpacing:'.08em',color:'var(--t-text-muted)',textTransform:'uppercase',marginBottom:6}}>{label}</div>
      <div style={{fontSize:24,fontWeight:800,color:color||'var(--t-text)',lineHeight:1,marginBottom:4}}>{value}</div>
      {sub&&<div style={{fontSize:11,color:'var(--t-text-faint)'}}>{sub}</div>}
    </div>
  )
}

// ── BADGE ─────────────────────────────────────────────────────────────────────
function Badge({color, children}) {
  const colorMap = {
    cyan:   {bg:'rgba(0,229,255,.12)', color:'var(--t-accent)'},
    amber:  {bg:'rgba(255,170,0,.15)', color:'var(--t-warn)'},
    red:    {bg:'rgba(255,50,50,.15)', color:'var(--t-danger)'},
    green:  {bg:'rgba(0,230,118,.12)', color:'var(--t-success)'},
    purple: {bg:'rgba(180,0,255,.12)', color:'#c77dff'},
    blue:   {bg:'rgba(41,121,255,.12)',color:'#2979ff'},
  }
  const c = colorMap[color] || colorMap.cyan
  return (
    <span style={{
      background: c.bg,
      color: c.color,
      fontSize: 10,
      fontWeight: 700,
      letterSpacing: '.06em',
      textTransform: 'uppercase',
      padding: '2px 7px',
      borderRadius: 0,
    }}>{children}</span>
  )
}

// ── CHANNEL CARD ──────────────────────────────────────────────────────────────
function ChannelCard({icon, title, stat, statColor, sub, btnLabel, onLaunch}) {
  return (
    <div style={{
      ...S.card,
      padding: '14px 16px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 0,
    }}>
      <div style={{display:'flex',alignItems:'center',gap:12}}>
        <div style={{fontSize:22,width:36,textAlign:'center'}}>{icon}</div>
        <div>
          <div style={{fontSize:13,fontWeight:700,color:'var(--t-text)',marginBottom:2}}>{title}</div>
          <div style={{fontSize:11,color:'var(--t-text-faint)'}}>{sub}</div>
        </div>
      </div>
      <div style={{display:'flex',alignItems:'center',gap:12}}>
        <div style={{fontSize:20,fontWeight:800,color:statColor||'var(--t-text)'}}>{stat}</div>
        <button style={S.btnGhost} onClick={onLaunch}>{btnLabel}</button>
      </div>
    </div>
  )
}

// ── TAB BAR ───────────────────────────────────────────────────────────────────
function TabBar({tabs, active, onSelect}) {
  return (
    <div style={{display:'flex',gap:0,borderBottom:'2px solid var(--t-line)',marginBottom:20}}>
      {tabs.map(t=>(
        <button
          key={t.id}
          onClick={()=>onSelect(t.id)}
          style={{
            background:'none',
            border:'none',
            borderBottom: active===t.id?'2px solid var(--t-accent)':'2px solid transparent',
            marginBottom:-2,
            padding:'10px 20px',
            fontSize:12,
            fontWeight:700,
            letterSpacing:'.08em',
            textTransform:'uppercase',
            color: active===t.id?'var(--t-accent)':'var(--t-text-muted)',
            cursor:'pointer',
            transition:'color .15s',
          }}
        >{t.label}{t.badge ? <span style={{marginLeft:6,background:'var(--t-danger)',color:'#fff',borderRadius:0,fontSize:9,fontWeight:800,padding:'1px 5px'}}>{t.badge}</span> : null}</button>
      ))}
    </div>
  )
}

// ── PRIORITY BADGE ────────────────────────────────────────────────────────────
function PriorityBadge({priority, animate}) {
  const cfg = {
    URGENT:    { color:'var(--t-danger)',  bg:'rgba(255,50,50,.15)',   label:'URGENT' },
    IMPORTANT: { color:'var(--t-warn)',    bg:'rgba(255,170,0,.15)',   label:'IMPORTANT' },
    FYI:       { color:'#2979ff',          bg:'rgba(41,121,255,.12)',  label:'FYI' },
  }
  const c = cfg[priority] || cfg.FYI
  return (
    <span style={{
      background: c.bg,
      color: c.color,
      fontSize: 10,
      fontWeight: 800,
      letterSpacing: '.08em',
      textTransform: 'uppercase',
      padding: '3px 8px',
      borderRadius: 0,
      border: animate ? `1px solid ${c.color}` : 'none',
      animation: animate ? 'pulse-border 1.4s ease-in-out infinite' : 'none',
    }}>{c.label}</span>
  )
}

// ── TARGET CHIP ───────────────────────────────────────────────────────────────
function TargetChip({target}) {
  const locStr = target.locations[0] === 'All Locations'
    ? 'All Locations'
    : target.locations.join(' · ')
  const label = target.shift === 'All Shifts'
    ? locStr
    : `${locStr} · ${target.shift}`
  return (
    <span style={{
      background: 'rgba(0,229,255,.08)',
      color: 'var(--t-accent)',
      border: '1px solid rgba(0,229,255,.25)',
      borderRadius: 0,
      fontSize: 10,
      fontWeight: 700,
      letterSpacing: '.05em',
      padding: '2px 8px',
    }}>→ {label}</span>
  )
}

// ── QUICK COMPOSE (send_dm for a person; post_announcement for staff/location) ─
function QuickCompose({person, roster, locations, onSent}) {
  const [to, setTo]           = useState('all')
  const [body, setBody]       = useState('')
  const [sent, setSent]       = useState(false)
  const [sending, setSending] = useState(false)
  const [err, setErr]         = useState(null)

  async function handleSend() {
    if (!body.trim() || sending) return
    setSending(true)
    setErr(null)
    try {
      let error = null
      if (to.startsWith('p:')) {
        const res = await sb.rpc('send_dm', {
          p_from_id: person.id ?? null,
          p_to_id: to.slice(2),
          p_body: body.trim(),
        })
        error = res.error
      } else {
        const res = await sb.rpc('post_announcement', {
          p_author_id: person.id ?? null,
          p_body: body.trim(),
          p_node_id: to.startsWith('l:') ? to.slice(2) : null,
          p_requires_ack: false,
          p_title: body.trim().slice(0, 60),
        })
        error = res.error
      }
      if (error) {
        setErr('Message not sent — the server rejected it. Please try again.')
      } else {
        setSent(true)
        setBody('')
        onSent && onSent()
        setTimeout(()=>setSent(false), 3000)
      }
    } catch {
      setErr('Message not sent — connection problem. Please try again.')
    } finally {
      setSending(false)
    }
  }

  if (sent) return (
    <div style={{...S.card}}>
      <div style={S.cardHeader}><span style={S.cardTitle}>Quick Compose</span></div>
      <div style={{...S.cardBody, textAlign:'center', padding:'24px 16px'}}>
        <div style={{fontSize:28,marginBottom:8}}>✓</div>
        <div style={{color:'var(--t-success)',fontWeight:700,fontSize:14}}>Message sent successfully</div>
      </div>
    </div>
  )

  return (
    <div style={S.card}>
      <div style={S.cardHeader}><span style={S.cardTitle}>Quick Compose</span></div>
      <div style={S.cardBody}>
        <div style={{marginBottom:10}}>
          <label style={S.label}>To</label>
          <select
            value={to}
            onChange={e=>setTo(e.target.value)}
            style={{...S.input}}
          >
            <option value="all">All Staff</option>
            {locations.map(l=><option key={l.id} value={`l:${l.id}`}>{l.name} Location</option>)}
            {roster.map(r=><option key={r.id} value={`p:${r.id}`}>{r.full_name}</option>)}
          </select>
        </div>
        <div style={{marginBottom:12}}>
          <label style={S.label}>Message</label>
          <textarea
            value={body}
            onChange={e=>setBody(e.target.value)}
            placeholder="Type your message..."
            rows={4}
            style={{...S.input, resize:'vertical', fontFamily:'inherit'}}
          />
        </div>
        {err && (
          <div style={{padding:'8px 12px',marginBottom:10,border:'1px solid var(--t-danger)',color:'var(--t-danger)',fontSize:12,fontWeight:600}}>{err}</div>
        )}
        <div style={{display:'flex',justifyContent:'flex-end'}}>
          <button
            style={{...S.sendBtn, opacity: (!body.trim()||sending)?0.5:1}}
            onClick={handleSend}
            disabled={!body.trim()||sending}
          >
            {sending ? 'Sending…' : 'Send Message'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── ACTIVITY FEED (real merged announcements + DMs + chat) ────────────────────
function ActivityFeed({items}) {
  return (
    <div style={S.card}>
      <div style={S.cardHeader}>
        <span style={S.cardTitle}>Recent Activity</span>
        <span style={S.muted}>All channels</span>
      </div>
      <div style={{padding:'0 0 8px'}}>
        {items.length === 0 && (
          <div style={{padding:'24px 16px',textAlign:'center',fontSize:13,color:'var(--t-text-faint)'}}>
            No activity yet — messages and broadcasts will appear here.
          </div>
        )}
        {items.map((item,i)=>(
          <div key={`${item.src}-${item.at}-${i}`} style={{
            display:'flex',
            alignItems:'flex-start',
            gap:12,
            padding:'10px 16px',
            borderBottom: i<items.length-1?'1px solid var(--t-line)':'none',
          }}>
            <div style={{
              width:6,
              height:6,
              borderRadius:'50%',
              background: item.srcColor,
              marginTop:5,
              flexShrink:0,
            }}/>
            <div style={{flex:1,minWidth:0}}>
              <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:3}}>
                <span style={{
                  fontSize:10,fontWeight:700,letterSpacing:'.06em',textTransform:'uppercase',
                  color: item.srcColor,
                }}>{item.srcLabel}</span>
                <span style={{fontSize:12,fontWeight:600,color:'var(--t-text)'}}>{item.sender}</span>
                <span style={{fontSize:11,color:'var(--t-text-faint)',marginLeft:'auto',flexShrink:0}}>{item.time}</span>
              </div>
              <div style={{fontSize:12,color:'var(--t-text-muted)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                {item.preview}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── HUB TAB ───────────────────────────────────────────────────────────────────
function HubTab({ onTab, person, hub, broadcasts, roster, locations, dms, channels, huddlesToday, shiftBroadcastsOn, refresh }) {
  const nav = useNavigate()
  const [drill, setDrill] = useState(null)

  const rosterById = useMemo(()=>{
    const m = {}
    roster.forEach(r=>{ m[r.id] = r })
    return m
  }, [roster])

  // Real merged activity: hub RPC feed + chat feed, newest first.
  const activity = useMemo(()=>{
    const raw = [
      ...(Array.isArray(hub?.activity) ? hub.activity : []),
      ...(Array.isArray(hub?.chat_activity) ? hub.chat_activity : []),
    ]
    return raw
      .sort((a,b)=>String(b.at||'').localeCompare(String(a.at||'')))
      .slice(0, 12)
      .map(a=>({
        src: a.src,
        srcLabel: (SRC_META[a.src]||SRC_META.announce).label,
        srcColor: (SRC_META[a.src]||SRC_META.announce).color,
        sender: a.sender || '—',
        preview: a.preview || '',
        at: a.at,
        time: timeAgo(a.at),
      }))
  }, [hub])

  const active = broadcasts.filter(b=>b.status==='ACTIVE')
  const unreadBroadcasts = active.filter(b=>!b.myRead)
  const unreadDms = useMemo(
    ()=> dms.filter(m => m.to_id === person.id && !m.read_at),
    [dms, person.id]
  )
  const chatUnread = channels === null
    ? null
    : channels.reduce((a,c)=>a+(c.unread_count||0), 0)
  const unreadTotal = (hub?.unread_dms||0) + (chatUnread||0) + unreadBroadcasts.length

  const ACTIVITY_COLS = [
    { key:'srcLabel', label:'Channel', value:a=>a.srcLabel },
    { key:'sender',   label:'From',    value:a=>a.sender },
    { key:'preview',  label:'Message', value:a=>a.preview },
    { key:'time',     label:'When',    value:a=>a.time, sortKey:a=>a.at||'' },
  ]
  const BC_COLS = [
    { key:'title',    label:'Broadcast', value:b=>b.title },
    { key:'priority', label:'Priority',  value:b=>b.priority },
    { key:'target',   label:'Target',    value:b=>b.target.locations.join(' · '), sortKey:b=>b.target.locations.join(',') },
    { key:'sender',   label:'Sender',    value:b=>b.senderName },
    { key:'read',     label:'Read',      value:b=>`${b.readCount}/${b.total}`, align:'right', sortKey:b=>b.total?b.readCount/b.total:0 },
    { key:'ack',      label:'Acked',     value:b=>`${b.ackCount}/${b.total}`, align:'right', sortKey:b=>b.total?b.ackCount/b.total:0 },
    { key:'status',   label:'Status',    value:b=>b.status },
  ]
  const ROSTER_COLS = [
    { key:'full_name', label:'Employee', value:r=>r.full_name },
    { key:'location',  label:'Location', value:r=>r.location },
    { key:'role',      label:'Role',     value:r=>r.role },
  ]
  const openDrill = (title, rows, columns, accent) => setDrill({
    title, subtitle:`${rows.length} record${rows.length===1?'':'s'}`, columns, rows, accent,
  })

  const unreadRows = useMemo(()=>[
    ...unreadDms.map(m=>({
      srcLabel:'Direct Msg',
      sender: m.from_name || rosterById[m.from_id]?.full_name || '—',
      preview: m.body || '',
      at: m.sent_at || m.created_at, time: timeAgo(m.sent_at || m.created_at),
    })),
    ...unreadBroadcasts.map(b=>({
      srcLabel: b.priority==='URGENT' ? 'HR Message' : 'Announcement',
      sender: b.senderName,
      preview: b.title,
      at: b.createdAt, time: b.postedTime,
    })),
  ], [unreadDms, unreadBroadcasts, rosterById])

  const convoRows = useMemo(()=>{
    const partners = new Map()
    dms.forEach(m=>{
      const other = m.from_id === person.id ? m.to_id : m.from_id
      if (!other) return
      const otherName = (m.from_id === person.id ? m.to_name : m.from_name) || rosterById[other]?.full_name || '—'
      const at = m.sent_at || m.created_at
      const prev = partners.get(other)
      if (!prev || String(at||'') > String(prev.at||'')) {
        partners.set(other, { sender: otherName, preview: m.body || '', at, time: timeAgo(at), srcLabel:'Direct Msg' })
      }
    })
    return [...partners.values()]
  }, [dms, person.id, rosterById])

  const monthKey = new Date().toISOString().slice(0,7)
  const monthBroadcasts = broadcasts.filter(b=>(b.date||'').startsWith(monthKey))
  const myPendingAcks = active.filter(b=>b.requiresAck && !b.myAcked)

  const latestChat = useMemo(()=>{
    if (!channels || !channels.length) return null
    const withMsg = channels.filter(c=>c.last_at)
    if (!withMsg.length) return null
    return withMsg.sort((a,b)=>String(b.last_at).localeCompare(String(a.last_at)))[0]
  }, [channels])

  const channelCards = [
    {
      icon:'💬', title:'Team Chat',
      stat: chatUnread === null ? '—' : chatUnread,
      statColor:'var(--t-accent)',
      sub: channels === null
        ? 'Open the team chat'
        : (latestChat?.last_body ? `Last: "${String(latestChat.last_body).slice(0,48)}"` : 'No channel messages yet'),
      btnLabel:'Open Chat', to:'/chat',
    },
    {
      icon:'✉️', title:'Direct Messages',
      stat: hub?.unread_dms ?? 0,
      statColor:'var(--t-accent)',
      sub: (hub?.unread_dms||0) > 0 ? `${hub.unread_dms} unread direct message${hub.unread_dms===1?'':'s'}` : 'No unread direct messages',
      btnLabel:'Open DMs', to:'/messages',
    },
    {
      icon:'📢', title:'Announcements',
      stat: active.length,
      statColor:'var(--t-warn)',
      sub: active.length ? `Latest: "${active[0].title.slice(0,44)}"` : 'No active broadcasts',
      btnLabel:'View All', tab: shiftBroadcastsOn ? 'broadcasts' : 'broadcast',
    },
    {
      icon:'🔴', title:'HR Messages',
      stat: hub?.pending_acks_mine ?? 0,
      statColor: (hub?.pending_acks_mine||0) > 0 ? 'var(--t-danger)' : 'var(--t-text)',
      sub: (hub?.pending_acks_mine||0) > 0 ? 'Acknowledgment required' : 'Nothing pending',
      btnLabel:'Review', to:'/hr-messages',
    },
    {
      icon:'🎙️', title:'Huddles',
      stat: huddlesToday === null ? '—' : huddlesToday,
      statColor:'var(--t-success)',
      sub: huddlesToday === null ? 'Open the huddle board' : `${huddlesToday} huddle post${huddlesToday===1?'':'s'} today`,
      btnLabel:'Open', to:'/huddle',
    },
  ]

  function handleLaunch(ch) {
    if (ch.tab) { onTab?.(ch.tab); return }
    if (ch.to)  { nav(ch.to); return }
  }

  const avgReadRate = hub?.avg_read_rate

  return (
    <div>
      {/* KPI ROW — every value live */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(6,1fr)',gap:12,marginBottom:20}}>
        <KTile label="Total Unread"     value={unreadTotal} sub="Across all channels" color="var(--t-accent)" alert={unreadTotal>0?'amber':undefined}
          onClick={()=>openDrill('Unread Items', unreadRows, ACTIVITY_COLS, 'var(--t-accent)')}/>
        <KTile label="Active Convos"    value={hub?.active_convos ?? 0} sub="DM threads · 7 days" color="var(--t-text)"
          onClick={()=>openDrill('Active Conversations', convoRows, ACTIVITY_COLS, 'var(--t-accent)')}/>
        <KTile label="Broadcasts/Month" value={hub?.ann_month ?? monthBroadcasts.length} sub="This month" color="var(--t-text)"
          onClick={()=>openDrill('Broadcasts This Month', monthBroadcasts, BC_COLS, 'var(--t-warn)')}/>
        <KTile label="Avg Read Rate"    value={avgReadRate==null?'—':`${avgReadRate}%`} sub="Last 30 days" color="var(--t-success)"
          onClick={()=>openDrill('Broadcast Read Rates', broadcasts, BC_COLS, 'var(--t-success)')}/>
        <KTile label="Pending Acks"     value={myPendingAcks.length} sub="Require your response" color="var(--t-warn)" alert={myPendingAcks.length>0?'amber':undefined}
          onClick={()=>openDrill('Broadcasts Awaiting Your Acknowledgment', myPendingAcks, BC_COLS, 'var(--t-warn)')}/>
        <KTile label="Active Staff"     value={hub?.active_staff ?? roster.length} sub="In current scope" color="var(--t-text)"
          onClick={()=>openDrill('Active Staff', roster, ROSTER_COLS, 'var(--t-accent)')}/>
      </div>

      <DrillDown open={!!drill} onClose={()=>setDrill(null)} {...(drill||{})} />

      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:20}}>
        {/* LEFT: Channels + Activity */}
        <div>
          <div style={{...S.sectionLabel, marginBottom:10, display:'block'}}>Communication Channels</div>
          <div style={{display:'flex',flexDirection:'column',gap:10,marginBottom:20}}>
            {channelCards.map(ch=>(
              <ChannelCard key={ch.title} {...ch} onLaunch={()=>handleLaunch(ch)}/>
            ))}
          </div>
          <ActivityFeed items={activity}/>
        </div>

        {/* RIGHT: Quick Compose + summary */}
        <div>
          <div style={{...S.sectionLabel, marginBottom:10, display:'block'}}>Compose</div>
          <QuickCompose person={person} roster={roster} locations={locations} onSent={refresh}/>

          {/* Channel summary card — all live counts */}
          <div style={S.card}>
            <div style={S.cardHeader}><span style={S.cardTitle}>Channel Summary</span></div>
            <div style={S.cardBody}>
              {[
                {label:'Messages sent today',   value:(hub?.dm_today||0)+(hub?.ann_today||0)},
                {label:'Messages this week',    value:(hub?.dm_week||0)+(hub?.ann_week||0)},
                {label:'Active employees',      value:hub?.active_staff ?? roster.length},
                {label:'Avg read rate (30d)',   value:avgReadRate==null?'—':`${avgReadRate}%`},
                {label:'Unread 24h+ old',       value:hub?.unread_old_dms ?? 0, warn:(hub?.unread_old_dms||0)>0},
              ].map(r=>(
                <div key={r.label} style={{
                  display:'flex',
                  justifyContent:'space-between',
                  alignItems:'center',
                  padding:'8px 0',
                  borderBottom:'1px solid var(--t-line)',
                }}>
                  <span style={{fontSize:13,color:'var(--t-text-muted)'}}>{r.label}</span>
                  <span style={{fontSize:14,fontWeight:700,color:r.warn?'var(--t-warn)':'var(--t-text)'}}>{r.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── BROADCAST CARD (feed view; real read/ack writes) ──────────────────────────
function BroadcastCard({bc, isManager, personId, onChanged}) {
  const [expanded, setExpanded]   = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const [acking, setAcking]       = useState(false)
  const [ackErr, setAckErr]       = useState(null)

  // Record a real read receipt the first time this card renders for me.
  useEffect(()=>{
    if (!bc.myRead && personId) {
      sb.rpc('broadcast_mark_read', { p_announcement_id: bc.id, p_person_id: personId }).catch(()=>{})
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bc.id, personId])

  async function handleAck() {
    if (acking || !personId) return
    setAcking(true)
    setAckErr(null)
    try {
      const { data, error } = await sb.rpc('broadcast_ack', { p_announcement_id: bc.id, p_person_id: personId })
      if (error || data?.ok === false) {
        setAckErr('Could not record your acknowledgment — please try again.')
      } else {
        onChanged && onChanged()
      }
    } catch {
      setAckErr('Could not record your acknowledgment — connection problem.')
    } finally {
      setAcking(false)
    }
  }

  if (dismissed) return null

  const borderColor = bc.priority === 'URGENT'
    ? 'var(--t-danger)'
    : bc.priority === 'IMPORTANT'
    ? 'var(--t-warn)'
    : 'rgba(41,121,255,.4)'

  const ackedPct = bc.total > 0 ? Math.round(bc.ackCount / bc.total * 100) : 0
  const readPct  = bc.total > 0 ? Math.round(bc.readCount / bc.total * 100) : 0

  return (
    <div style={{
      background: 'var(--t-surface)',
      border: `1px solid ${borderColor}`,
      borderRadius: 0,
      borderLeft: `3px solid ${borderColor}`,
      marginBottom: 12,
      animation: bc.priority === 'URGENT' ? 'pulse-border 1.4s ease-in-out infinite' : 'none',
    }}>
      <style>{`
        @keyframes pulse-border {
          0%, 100% { border-color: var(--t-danger); }
          50% { border-color: rgba(255,50,50,.3); }
        }
      `}</style>

      {/* Header row */}
      <div style={{display:'flex',alignItems:'flex-start',gap:10,padding:'12px 16px 10px',borderBottom:'1px solid var(--t-line)'}}>
        <PriorityBadge priority={bc.priority} animate={bc.priority === 'URGENT'} />
        <TargetChip target={bc.target} />
        {bc.pinned && (
          <span style={{fontSize:10,fontWeight:700,color:'var(--t-text-muted)',letterSpacing:'.05em',padding:'2px 6px',border:'1px solid var(--t-line)',borderRadius:0}}>PINNED</span>
        )}
        {bc.status === 'EXPIRED' && (
          <Badge color="purple">Expired</Badge>
        )}
        <span style={{marginLeft:'auto',fontSize:11,color:'var(--t-text-faint)',whiteSpace:'nowrap'}}>{bc.postedTime}</span>
      </div>

      {/* Body */}
      <div style={{padding:'12px 16px'}}>
        <div style={{fontSize:14,fontWeight:700,color:'var(--t-text)',marginBottom:6}}>{bc.title}</div>
        <div style={{
          fontSize:13,
          color:'var(--t-text-muted)',
          lineHeight:1.6,
          overflow: expanded ? 'visible' : 'hidden',
          display: expanded ? 'block' : '-webkit-box',
          WebkitLineClamp: expanded ? 'unset' : 3,
          WebkitBoxOrient: 'vertical',
        }}>
          {bc.body}
        </div>
        {bc.body.length > 160 && (
          <button
            onClick={()=>setExpanded(e=>!e)}
            style={{background:'none',border:'none',color:'var(--t-accent)',fontSize:12,fontWeight:700,cursor:'pointer',padding:'4px 0',marginTop:2}}
          >{expanded ? 'Show less' : 'Read more'}</button>
        )}

        {/* Sender + expiry row */}
        <div style={{display:'flex',alignItems:'center',gap:12,marginTop:10}}>
          <span style={{fontSize:11,color:'var(--t-text-faint)'}}>
            From: <span style={{color:'var(--t-text)',fontWeight:600}}>{bc.senderName}</span>
            {bc.senderRole ? <span style={{color:'var(--t-text-muted)'}}> · {bc.senderRole}</span> : null}
          </span>
          <span style={{fontSize:11,color:'var(--t-text-faint)'}}>
            Expires: <span style={{color:'var(--t-warn)',fontWeight:600}}>{bc.expiry}</span>
          </span>
        </div>

        {/* Manager stats — live counts */}
        {isManager && (
          <div style={{marginTop:10,display:'flex',gap:16,padding:'8px 0',borderTop:'1px solid var(--t-line)'}}>
            <span style={{fontSize:11,color:'var(--t-text-faint)'}}>
              Read: <span style={{color:'var(--t-accent)',fontWeight:700}}>{bc.readCount}/{bc.total}</span>
              <span style={{color:'var(--t-text-faint)'}}> ({readPct}%)</span>
            </span>
            {bc.requiresAck && (
              <span style={{fontSize:11,color:'var(--t-text-faint)'}}>
                Acknowledged: <span style={{color:'var(--t-success)',fontWeight:700}}>{bc.ackCount}/{bc.total}</span>
                <span style={{color:'var(--t-text-faint)'}}> ({ackedPct}%)</span>
              </span>
            )}
          </div>
        )}

        {ackErr && (
          <div style={{marginTop:8,padding:'6px 10px',border:'1px solid var(--t-danger)',color:'var(--t-danger)',fontSize:11,fontWeight:600}}>{ackErr}</div>
        )}

        {/* Action row */}
        <div style={{display:'flex',alignItems:'center',gap:8,marginTop:10}}>
          {bc.requiresAck && !bc.myAcked && bc.status !== 'EXPIRED' && (
            <button
              onClick={handleAck}
              disabled={acking}
              style={{...S.btnCyan, padding:'6px 14px', fontSize:11, opacity: acking?0.6:1}}
            >{acking ? 'Saving…' : 'Acknowledge'}</button>
          )}
          {bc.myAcked && (
            <span style={{fontSize:11,fontWeight:700,color:'var(--t-success)'}}>✓ Acknowledged</span>
          )}
          <button
            onClick={()=>setDismissed(true)}
            style={{...S.btnGhost, padding:'5px 10px', fontSize:11}}
          >Dismiss</button>
        </div>
      </div>
    </div>
  )
}

// ── COMPOSE BROADCAST FORM (post_shift_broadcast) ─────────────────────────────
function ComposeBroadcast({person, roster, locations, onSent, refresh}) {
  const [form, setForm] = useState({
    title: '',
    body: '',
    priority: 'FYI',
    allLocations: true,
    locations: [],           // node ids
    shift: 'All Shifts',
    expiry: 'Tonight',
    customExpiry: '',
    requireAck: false,
    pinToTop: false,
  })
  const [sending, setSending] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [result, setResult] = useState(null)

  function upd(k, v) { setForm(f=>({...f,[k]:v})); setResult(null) }

  function toggleLocation(id) {
    setForm(f=>({
      ...f,
      locations: f.locations.includes(id)
        ? f.locations.filter(l=>l!==id)
        : [...f.locations, id],
    }))
  }

  const locNameById = useMemo(()=>{
    const m = {}
    locations.forEach(l=>{ m[l.id] = l.name })
    return m
  }, [locations])

  const targetLabel = useMemo(()=>{
    const locPart = form.allLocations ? 'All Locations'
      : form.locations.length === 0 ? '[select location]'
      : form.locations.map(id=>locNameById[id]||'?').join(', ')
    const shiftPart = form.shift === 'All Shifts' ? 'All Shifts' : form.shift
    return `${locPart} — ${shiftPart}`
  }, [form, locNameById])

  async function handleSend() {
    if (!form.title.trim() || !form.body.trim() || sending) return
    setSending(true)
    setConfirmOpen(false)
    try {
      const { data, error } = await sb.rpc('post_shift_broadcast', {
        p_author_id: person.id ?? null,
        p_title: form.title.trim(),
        p_body: form.body.trim(),
        p_priority: form.priority === 'Important' ? 'IMPORTANT' : form.priority,
        p_node_ids: form.allLocations ? null : form.locations,
        p_shift: form.shift,
        p_expires_at: expiryToTs(form.expiry, form.customExpiry),
        p_require_ack: form.requireAck,
        p_pin: form.pinToTop,
      })
      if (error || data?.ok === false) {
        setResult({ok:false, msg: data?.error || 'Failed to send — the server rejected the broadcast.'})
      } else {
        setResult({ok:true, msg:'Broadcast sent successfully.'})
        setForm({title:'',body:'',priority:'FYI',allLocations:true,locations:[],shift:'All Shifts',expiry:'Tonight',customExpiry:'',requireAck:false,pinToTop:false})
        refresh && refresh()
        onSent && onSent()
      }
    } catch {
      setResult({ok:false, msg:'Failed to send — connection problem. Please try again.'})
    } finally {
      setSending(false)
    }
  }

  const priCfg = {
    FYI:       { color:'#2979ff',        bg:'rgba(41,121,255,.12)' },
    Important: { color:'var(--t-warn)',   bg:'rgba(255,170,0,.12)' },
    URGENT:    { color:'var(--t-danger)', bg:'rgba(255,50,50,.12)' },
  }

  return (
    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:20}}>
      {/* LEFT: Form */}
      <div style={S.card}>
        <div style={S.cardHeader}>
          <span style={S.cardTitle}>Create Broadcast</span>
          {form.priority === 'URGENT' && <Badge color="red">URGENT</Badge>}
          {form.priority === 'Important' && <Badge color="amber">IMPORTANT</Badge>}
        </div>
        <div style={S.cardBody}>
          {/* Title */}
          <div style={{marginBottom:14}}>
            <label style={S.label}>Title <span style={{color:'var(--t-danger)'}}>*</span></label>
            <input
              style={S.input}
              value={form.title}
              onChange={e=>upd('title',e.target.value)}
              placeholder="Brief subject line…"
            />
          </div>

          {/* Body */}
          <div style={{marginBottom:14}}>
            <label style={S.label}>Message Body <span style={{color:'var(--t-danger)'}}>*</span></label>
            <textarea
              rows={5}
              style={{...S.input, resize:'vertical', fontFamily:'inherit'}}
              value={form.body}
              onChange={e=>upd('body',e.target.value)}
              placeholder="Full message details…"
            />
            <div style={{...S.muted, marginTop:4, textAlign:'right'}}>{form.body.length} chars</div>
          </div>

          {/* Priority */}
          <div style={{marginBottom:14}}>
            <label style={S.label}>Priority</label>
            <div style={{display:'flex',gap:8}}>
              {['FYI','Important','URGENT'].map(p=>(
                <button
                  key={p}
                  onClick={()=>upd('priority',p)}
                  style={{
                    flex:1, padding:'8px 0', borderRadius:0,
                    border:`2px solid ${form.priority===p ? priCfg[p].color : 'var(--t-line)'}`,
                    background: form.priority===p ? priCfg[p].bg : 'transparent',
                    color: form.priority===p ? priCfg[p].color : 'var(--t-text-muted)',
                    fontSize:11, fontWeight:700, cursor:'pointer', transition:'all .15s',
                  }}
                >{p}</button>
              ))}
            </div>
          </div>

          {/* Target Locations — real org_nodes from session scope */}
          <div style={{marginBottom:14}}>
            <label style={S.label}>Target Location</label>
            <label style={{display:'flex',alignItems:'center',gap:8,cursor:'pointer',marginBottom:8,fontSize:13,color:'var(--t-text)'}}>
              <input
                type="checkbox"
                checked={form.allLocations}
                onChange={e=>upd('allLocations',e.target.checked)}
              />
              All Locations
            </label>
            {!form.allLocations && (
              locations.length === 0
                ? <div style={{fontSize:12,color:'var(--t-text-faint)'}}>No locations visible in your current scope.</div>
                : <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:6}}>
                    {locations.map(loc=>(
                      <label key={loc.id} style={{display:'flex',alignItems:'center',gap:8,cursor:'pointer',fontSize:13,color:'var(--t-text)',padding:'6px 8px',border:`1px solid ${form.locations.includes(loc.id)?'var(--t-accent)':'var(--t-line)'}`,background:form.locations.includes(loc.id)?'rgba(0,229,255,.06)':'transparent'}}>
                        <input
                          type="checkbox"
                          checked={form.locations.includes(loc.id)}
                          onChange={()=>toggleLocation(loc.id)}
                        />
                        {loc.name}
                      </label>
                    ))}
                  </div>
            )}
          </div>

          {/* Shift Target */}
          <div style={{marginBottom:14}}>
            <label style={S.label}>Shift Target</label>
            <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
              {SHIFT_TARGETS.map(s=>(
                <button
                  key={s}
                  onClick={()=>upd('shift',s)}
                  style={{
                    padding:'6px 12px', borderRadius:0, fontSize:11, fontWeight:700, cursor:'pointer',
                    border:`1px solid ${form.shift===s?'var(--t-accent)':'var(--t-line)'}`,
                    background: form.shift===s ? 'rgba(0,229,255,.1)' : 'transparent',
                    color: form.shift===s ? 'var(--t-accent)' : 'var(--t-text-muted)',
                  }}
                >{s}</button>
              ))}
            </div>
          </div>

          {/* Expires */}
          <div style={{marginBottom:14}}>
            <label style={S.label}>Expires</label>
            <div style={{display:'flex',gap:6,flexWrap:'wrap',marginBottom: form.expiry==='Custom' ? 8 : 0}}>
              {['Tonight','Tomorrow','End of Week','Custom'].map(ex=>(
                <button
                  key={ex}
                  onClick={()=>upd('expiry',ex)}
                  style={{
                    padding:'6px 12px', borderRadius:0, fontSize:11, fontWeight:700, cursor:'pointer',
                    border:`1px solid ${form.expiry===ex?'var(--t-accent)':'var(--t-line)'}`,
                    background: form.expiry===ex ? 'rgba(0,229,255,.1)' : 'transparent',
                    color: form.expiry===ex ? 'var(--t-accent)' : 'var(--t-text-muted)',
                  }}
                >{ex}</button>
              ))}
            </div>
            {form.expiry === 'Custom' && (
              <input
                type="date"
                style={S.input}
                value={form.customExpiry}
                onChange={e=>upd('customExpiry',e.target.value)}
              />
            )}
          </div>

          {/* Options row */}
          <div style={{display:'flex',gap:20,marginBottom:16,flexWrap:'wrap'}}>
            <label style={{display:'flex',alignItems:'center',gap:8,cursor:'pointer',fontSize:13,color:'var(--t-text)'}}>
              <input type="checkbox" checked={form.requireAck} onChange={e=>upd('requireAck',e.target.checked)}/>
              Require Acknowledgment
            </label>
            <label style={{display:'flex',alignItems:'center',gap:8,cursor:'pointer',fontSize:13,color:'var(--t-text)'}}>
              <input type="checkbox" checked={form.pinToTop} onChange={e=>upd('pinToTop',e.target.checked)}/>
              Pin to Top
            </label>
          </div>

          {result && (
            <div style={{
              padding:'10px 14px', marginBottom:12, borderRadius:0,
              background: result.ok ? 'rgba(0,230,118,.1)' : 'rgba(255,50,50,.1)',
              border:`1px solid ${result.ok?'var(--t-success)':'var(--t-danger)'}`,
              color: result.ok ? 'var(--t-success)' : 'var(--t-danger)',
              fontSize:13, fontWeight:600,
            }}>{result.msg}</div>
          )}

          <button
            style={{
              ...S.sendBtn,
              width:'100%',
              opacity:(!form.title.trim()||!form.body.trim()||sending)?0.5:1,
            }}
            onClick={()=>setConfirmOpen(true)}
            disabled={!form.title.trim()||!form.body.trim()||sending}
          >
            {sending ? 'Sending…' : 'Send Broadcast'}
          </button>
        </div>
      </div>

      {/* RIGHT: Live Preview */}
      <div>
        <div style={S.card}>
          <div style={S.cardHeader}>
            <span style={S.cardTitle}>Live Preview</span>
            <Badge color={form.priority==='URGENT'?'red':form.priority==='Important'?'amber':'blue'}>
              {form.priority}
            </Badge>
          </div>
          <div style={{padding:16}}>
            {/* Pinned banner preview */}
            {form.pinToTop && (
              <div style={{
                background:'rgba(255,50,50,.08)',
                border:'1px solid var(--t-danger)',
                borderLeft:'3px solid var(--t-danger)',
                padding:'10px 14px',
                marginBottom:12,
                fontSize:12,
                color:'var(--t-danger)',
                fontWeight:600,
                borderRadius:0,
              }}>
                URGENT {form.title || 'Broadcast Title'} — See details below.
                <button style={{...S.btnGhost,padding:'3px 8px',fontSize:10,marginLeft:8}}>Dismiss</button>
              </div>
            )}

            {/* Card preview */}
            <div style={{
              border:`1px solid ${form.priority==='URGENT'?'var(--t-danger)':form.priority==='Important'?'var(--t-warn)':'rgba(41,121,255,.4)'}`,
              borderLeft:`3px solid ${form.priority==='URGENT'?'var(--t-danger)':form.priority==='Important'?'var(--t-warn)':'rgba(41,121,255,.4)'}`,
              borderRadius:0,
              background:'var(--t-surface-2)',
              padding:'14px 16px',
            }}>
              <div style={{display:'flex',gap:8,alignItems:'center',marginBottom:8,flexWrap:'wrap'}}>
                <PriorityBadge priority={form.priority === 'Important' ? 'IMPORTANT' : form.priority} />
                <TargetChip target={{
                  locations: form.allLocations || form.locations.length === 0
                    ? ['All Locations']
                    : form.locations.map(id=>locNameById[id]||'?'),
                  shift: form.shift,
                }} />
                {form.pinToTop && <span style={{fontSize:10,fontWeight:700,color:'var(--t-text-muted)',padding:'2px 6px',border:'1px solid var(--t-line)'}}>PINNED</span>}
                <span style={{marginLeft:'auto',fontSize:11,color:'var(--t-text-faint)'}}>Just now</span>
              </div>
              <div style={{fontSize:14,fontWeight:700,color:'var(--t-text)',marginBottom:6}}>
                {form.title || <span style={{color:'var(--t-text-faint)'}}>Your title here…</span>}
              </div>
              <div style={{fontSize:13,color:'var(--t-text-muted)',lineHeight:1.6}}>
                {form.body || <span style={{color:'var(--t-text-faint)'}}>Your message body will appear here…</span>}
              </div>
              <div style={{marginTop:10,display:'flex',gap:8,alignItems:'center',paddingTop:10,borderTop:'1px solid var(--t-line)'}}>
                <span style={{fontSize:11,color:'var(--t-text-faint)'}}>
                  From: <span style={{color:'var(--t-text)',fontWeight:600}}>{person.full_name||'You'}</span>
                </span>
                <span style={{fontSize:11,color:'var(--t-text-faint)'}}>
                  Expires: <span style={{color:'var(--t-warn)',fontWeight:600}}>{form.expiry==='Custom'&&form.customExpiry ? form.customExpiry : form.expiry}</span>
                </span>
              </div>
              {form.requireAck && (
                <div style={{marginTop:8}}>
                  <button style={{...S.btnCyan,padding:'5px 12px',fontSize:11,opacity:.7}}>Acknowledge</button>
                </div>
              )}
            </div>

            {/* Audience summary — real roster counts per location */}
            <div style={{marginTop:14}}>
              <div style={{...S.sectionLabel, marginBottom:8, display:'block'}}>Recipients</div>
              {locations.length === 0
                ? <div style={{fontSize:12,color:'var(--t-text-faint)'}}>No locations in scope.</div>
                : <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:6}}>
                    {locations.map(loc=>{
                      const inc = form.allLocations || form.locations.includes(loc.id)
                      const count = roster.filter(r=>r.node_id===loc.id).length
                      return (
                        <div key={loc.id} style={{
                          padding:'7px 10px', borderRadius:0,
                          background:'var(--t-surface-2)',
                          border:`1px solid ${inc?'var(--t-accent)':'var(--t-line)'}`,
                          display:'flex', justifyContent:'space-between', alignItems:'center',
                        }}>
                          <span style={{fontSize:12,color:inc?'var(--t-text)':'var(--t-text-faint)'}}>{loc.name}</span>
                          <span style={{fontSize:12,fontWeight:700,color:inc?'var(--t-accent)':'var(--t-text-faint)'}}>{inc?count:0}</span>
                        </div>
                      )
                    })}
                  </div>}
            </div>
          </div>
        </div>
      </div>

      {/* Confirm Modal */}
      {confirmOpen && (
        <div style={{
          position:'fixed',inset:0,background:'rgba(0,0,0,.6)',zIndex:9999,
          display:'flex',alignItems:'center',justifyContent:'center',
        }}
          onClick={()=>setConfirmOpen(false)}
        >
          <div
            style={{background:'var(--t-surface)',border:'1px solid var(--t-line)',borderRadius:0,padding:28,maxWidth:420,width:'90%'}}
            onClick={e=>e.stopPropagation()}
          >
            <div style={{fontSize:16,fontWeight:800,color:'var(--t-text)',marginBottom:10}}>Confirm Broadcast</div>
            <div style={{fontSize:13,color:'var(--t-text-muted)',marginBottom:20,lineHeight:1.6}}>
              Send <strong style={{color:'var(--t-text)'}}>{form.priority}</strong> broadcast to{' '}
              <strong style={{color:'var(--t-text)'}}>{targetLabel}</strong>?
              It will be visible immediately.
            </div>
            <div style={{display:'flex',gap:10,justifyContent:'flex-end'}}>
              <button style={S.btnGhost} onClick={()=>setConfirmOpen(false)}>Cancel</button>
              <button style={S.sendBtn} onClick={handleSend}>Send Broadcast</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── RECEIPT LIST PAIR (read vs unread, from get_broadcast_receipts) ───────────
function ReceiptListPair({bcId}) {
  const [rows, setRows]       = useState(null)
  const [err, setErr]         = useState(null)

  useEffect(()=>{
    let alive = true
    setRows(null); setErr(null)
    sb.rpc('get_broadcast_receipts', { p_announcement_id: bcId }).then(({data, error})=>{
      if (!alive) return
      if (error) { setErr('Could not load receipts.'); setRows([]) }
      else setRows(Array.isArray(data) ? data : [])
    }).catch(()=>{ if (alive) { setErr('Could not load receipts.'); setRows([]) } })
    return ()=>{ alive = false }
  }, [bcId])

  if (rows === null) return <div style={{fontSize:12,color:'var(--t-text-faint)',padding:'8px 0'}}>Loading receipts…</div>
  if (err) return <div style={{fontSize:12,color:'var(--t-danger)',padding:'8px 0'}}>{err}</div>

  const read   = rows.filter(r=>r.read)
  const unread = rows.filter(r=>!r.read)
  return (
    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
      <div>
        <div style={{...S.sectionLabel,marginBottom:8,display:'block',color:'var(--t-success)'}}>
          Read ({read.length}/{rows.length})
        </div>
        <div style={{display:'flex',flexDirection:'column',gap:3,maxHeight:140,overflowY:'auto'}}>
          {read.map(e=>(
            <div key={e.id} style={{display:'flex',gap:8,alignItems:'center',padding:'4px 8px',background:'rgba(0,230,118,.06)',border:'1px solid rgba(0,230,118,.15)'}}>
              <span style={{fontSize:10,color:'var(--t-success)'}}>✓</span>
              <span style={{fontSize:12,color:'var(--t-text)'}}>{e.full_name}</span>
              <span style={{fontSize:10,color:'var(--t-text-faint)',marginLeft:'auto'}}>{e.location}</span>
            </div>
          ))}
          {read.length===0 && <div style={{fontSize:12,color:'var(--t-text-faint)'}}>No reads yet.</div>}
        </div>
      </div>
      <div>
        <div style={{...S.sectionLabel,marginBottom:8,display:'block',color:'var(--t-warn)'}}>
          Did Not Read ({unread.length}/{rows.length})
        </div>
        <div style={{display:'flex',flexDirection:'column',gap:3,maxHeight:140,overflowY:'auto'}}>
          {unread.map(e=>(
            <div key={e.id} style={{display:'flex',gap:8,alignItems:'center',padding:'4px 8px',background:'rgba(255,170,0,.06)',border:'1px solid rgba(255,170,0,.15)'}}>
              <span style={{fontSize:10,color:'var(--t-warn)'}}>○</span>
              <span style={{fontSize:12,color:'var(--t-text)'}}>{e.full_name}</span>
              <span style={{fontSize:10,color:'var(--t-text-faint)',marginLeft:'auto'}}>{e.location}</span>
            </div>
          ))}
          {unread.length===0 && <div style={{fontSize:12,color:'var(--t-text-faint)'}}>All read.</div>}
        </div>
      </div>
    </div>
  )
}

// ── READ RECEIPTS PANEL ───────────────────────────────────────────────────────
function ReceiptsPanel({broadcasts, personId}) {
  const [selected, setSelected]   = useState(broadcasts[0]?.id || null)
  const [filterLoc, setFilterLoc] = useState('All')
  const [filterAck, setFilterAck] = useState('All')
  const [reminded, setReminded]   = useState(null)   // {id, count}
  const [remindErr, setRemindErr] = useState(null)
  const [rows, setRows]           = useState(null)
  const [rowsErr, setRowsErr]     = useState(null)
  const [drill, setDrill]         = useState(null)
  const [rowRemindedId, setRowRemindedId] = useState(null)

  const bc = broadcasts.find(b=>b.id===selected)

  useEffect(()=>{
    let alive = true
    if (!selected) { setRows([]); return }
    setRows(null); setRowsErr(null)
    sb.rpc('get_broadcast_receipts', { p_announcement_id: selected }).then(({data, error})=>{
      if (!alive) return
      if (error) { setRowsErr('Could not load receipt records.'); setRows([]) }
      else setRows(Array.isArray(data) ? data : [])
    }).catch(()=>{ if (alive) { setRowsErr('Could not load receipt records.'); setRows([]) } })
    return ()=>{ alive = false }
  }, [selected])

  const locOptions = useMemo(()=>{
    const s = new Set((rows||[]).map(r=>r.location).filter(l=>l && l!=='—'))
    return [...s].sort()
  }, [rows])

  const filtered = useMemo(()=>{
    return (rows||[]).filter(e=>{
      if (filterLoc !== 'All' && e.location !== filterLoc) return false
      if (filterAck === 'Acked' && !e.acked) return false
      if (filterAck === 'Not Acked' && e.acked) return false
      return true
    })
  }, [rows, filterLoc, filterAck])

  async function handleRemind() {
    if (!bc) return
    setRemindErr(null)
    try {
      const { data, error } = await sb.rpc('broadcast_remind', { p_announcement_id: bc.id, p_sender_id: personId ?? null })
      if (error || data?.ok === false) {
        setRemindErr('Reminders were not sent — please try again.')
      } else {
        setReminded({ id: bc.id, count: data?.reminded ?? 0 })
        setTimeout(()=>setReminded(null), 4000)
      }
    } catch {
      setRemindErr('Reminders were not sent — connection problem.')
    }
  }

  async function handleRowRemind(row) {
    if (!bc) return
    try {
      const { error } = await sb.rpc('send_dm', {
        p_from_id: personId ?? null,
        p_to_id: row.id,
        p_body: `Reminder: please review the broadcast "${bc.title}" and acknowledge it.`,
      })
      if (!error) { setRowRemindedId(row.id); setTimeout(()=>setRowRemindedId(null), 2500) }
    } catch { /* surfaced by global toast */ }
  }

  if (!bc) return <div style={{padding:20,color:'var(--t-text-faint)',fontSize:13}}>No broadcasts available yet — receipts appear once a broadcast has been sent.</div>

  const ackPct = bc.total > 0 ? Math.round(bc.ackCount / bc.total * 100) : 0
  const readPct = bc.total > 0 ? Math.round(bc.readCount / bc.total * 100) : 0

  const RCPT_COLS = [
    { key:'full_name', label:'Employee', value:e=>e.full_name },
    { key:'location',  label:'Location', value:e=>e.location },
    { key:'role',      label:'Role',     value:e=>e.role },
    { key:'read',      label:'Read',     value:e=>e.read?'Yes':'No' },
    { key:'acked',     label:'Acknowledged', value:e=>e.acked?'Yes':'No' },
    { key:'readAt',    label:'Read At',  value:e=>e.read_at ? fmtDateTime(e.read_at) : '—', sortKey:e=>e.read_at || '' },
  ]
  const openDrill = (title, drillRows, accent) => setDrill({
    title, subtitle:`${bc.title} · ${drillRows.length} record${drillRows.length===1?'':'s'}`, columns:RCPT_COLS, rows:drillRows, accent,
  })

  const allRows = rows || []

  return (
    <div>
      {/* Broadcast selector */}
      <div style={{marginBottom:16}}>
        <label style={S.label}>Select Broadcast</label>
        <select
          style={S.input}
          value={selected || ''}
          onChange={e=>setSelected(e.target.value)}
        >
          {broadcasts.map(b=>(
            <option key={b.id} value={b.id}>{b.title}</option>
          ))}
        </select>
      </div>

      {/* Summary stats — live */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:12,marginBottom:16}}>
        <KTile label="Total Recipients" value={bc.total} color="var(--t-text)" onClick={()=>openDrill('All Recipients', allRows, 'var(--t-accent)')}/>
        <KTile label="Read" value={`${readPct}%`} sub={`${bc.readCount} of ${bc.total}`} color="var(--t-accent)" onClick={()=>openDrill('Recipients Who Read', allRows.filter(e=>e.read), 'var(--t-accent)')}/>
        {bc.requiresAck && (
          <KTile label="Acknowledged" value={`${ackPct}%`} sub={`${bc.ackCount} of ${bc.total}`} color="var(--t-success)" alert={ackPct < 50 ? 'amber' : undefined} onClick={()=>openDrill('Recipients Who Acknowledged', allRows.filter(e=>e.acked), 'var(--t-success)')}/>
        )}
        <KTile label="Compliance" value={bc.requiresAck ? `${ackPct}%` : 'N/A'} sub={bc.requiresAck ? `${bc.total - bc.ackCount} outstanding` : 'No ack required'} color={ackPct >= 80 ? 'var(--t-success)' : 'var(--t-warn)'} onClick={()=>openDrill('Outstanding — Not Acknowledged', allRows.filter(e=>!e.acked), 'var(--t-warn)')}/>
      </div>

      <DrillDown open={!!drill} onClose={()=>setDrill(null)} {...(drill||{})} />

      {/* Progress bars */}
      <div style={{...S.card,marginBottom:16}}>
        <div style={S.cardBody}>
          {[
            {label:'Read Rate', pct:readPct, color:'var(--t-accent)'},
            ...(bc.requiresAck ? [{label:'Acknowledgment Rate', pct:ackPct, color:'var(--t-success)'}] : []),
          ].map(bar=>(
            <div key={bar.label} style={{marginBottom:bar.label==='Read Rate'&&bc.requiresAck?12:0}}>
              <div style={{display:'flex',justifyContent:'space-between',marginBottom:4}}>
                <span style={S.muted}>{bar.label}</span>
                <span style={{...S.muted,fontWeight:700,color:bar.color}}>{bar.pct}%</span>
              </div>
              <div style={{height:6,background:'var(--t-line)',borderRadius:0,overflow:'hidden'}}>
                <div style={{height:'100%',width:`${bar.pct}%`,background:bar.color,transition:'width .4s'}}/>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Filters + action */}
      <div style={{display:'flex',gap:10,marginBottom:12,alignItems:'center',flexWrap:'wrap'}}>
        <select style={{...S.input,width:'auto'}} value={filterLoc} onChange={e=>setFilterLoc(e.target.value)}>
          <option value="All">All Locations</option>
          {locOptions.map(l=><option key={l}>{l}</option>)}
        </select>
        <select style={{...S.input,width:'auto'}} value={filterAck} onChange={e=>setFilterAck(e.target.value)}>
          <option value="All">All Statuses</option>
          <option value="Acked">Acknowledged</option>
          <option value="Not Acked">Not Acknowledged</option>
        </select>
        <button
          style={{
            ...S.btnGhost,
            color: reminded?.id === bc.id ? 'var(--t-success)' : 'var(--t-text-muted)',
            borderColor: reminded?.id === bc.id ? 'var(--t-success)' : 'var(--t-line)',
          }}
          onClick={handleRemind}
        >
          {reminded?.id === bc.id
            ? `Reminder sent to ${reminded.count} employee${reminded.count===1?'':'s'}`
            : 'Send Reminder to Non-Acknowledged'}
        </button>
        {remindErr && <span style={{fontSize:12,color:'var(--t-danger)',fontWeight:600}}>{remindErr}</span>}
      </div>

      {/* Table */}
      <div style={S.card}>
        <div style={{overflowX:'auto'}}>
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
            <thead>
              <tr style={{background:'var(--t-surface-2)'}}>
                {['Employee','Location','Role','Read At','Acknowledged','Action'].map(h=>(
                  <th key={h} style={{
                    textAlign:'left',padding:'9px 12px',
                    fontSize:10,fontWeight:700,letterSpacing:'.07em',textTransform:'uppercase',
                    color:'var(--t-text-muted)',borderBottom:'2px solid var(--t-line)',
                    whiteSpace:'nowrap',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((e,i)=>(
                <tr key={e.id} style={{borderBottom:'1px solid var(--t-line)',background:i%2===0?'transparent':'var(--t-surface-2)'}}>
                  <td style={{padding:'9px 12px',fontWeight:600,color:'var(--t-text)'}}>{e.full_name}</td>
                  <td style={{padding:'9px 12px',color:'var(--t-text-muted)'}}>{e.location}</td>
                  <td style={{padding:'9px 12px',color:'var(--t-text-muted)'}}>{e.role}</td>
                  <td style={{padding:'9px 12px',color:'var(--t-text-faint)',fontSize:11}}>{e.read_at ? fmtDateTime(e.read_at) : '—'}</td>
                  <td style={{padding:'9px 12px'}}>
                    {e.acked
                      ? <span style={{fontSize:11,fontWeight:700,color:'var(--t-success)'}}>✓ Yes</span>
                      : <span style={{fontSize:11,color:'var(--t-text-faint)'}}>—</span>
                    }
                  </td>
                  <td style={{padding:'9px 12px'}}>
                    {!e.acked && bc.requiresAck && (
                      <button
                        style={{...S.btnGhost,padding:'3px 8px',fontSize:10,color:rowRemindedId===e.id?'var(--t-success)':'var(--t-text-muted)'}}
                        onClick={()=>handleRowRemind(e)}
                      >{rowRemindedId===e.id?'Sent!':'Remind'}</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows === null && (
            <div style={{padding:'24px 16px',textAlign:'center',fontSize:13,color:'var(--t-text-faint)'}}>
              Loading receipt records…
            </div>
          )}
          {rowsErr && (
            <div style={{padding:'24px 16px',textAlign:'center',fontSize:13,color:'var(--t-danger)'}}>
              {rowsErr}
            </div>
          )}
          {rows !== null && !rowsErr && filtered.length === 0 && (
            <div style={{padding:'24px 16px',textAlign:'center',fontSize:13,color:'var(--t-text-faint)'}}>
              No results match the selected filters.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── BROADCAST HISTORY TABLE ───────────────────────────────────────────────────
function BroadcastHistory({broadcasts, locations}) {
  const [expanded, setExpanded]   = useState(null)
  const [filterPri, setFilterPri] = useState('All')
  const [filterLoc, setFilterLoc] = useState('All')
  const [dateFrom, setDateFrom]   = useState('')
  const [dateTo, setDateTo]       = useState('')

  const filtered = useMemo(()=>{
    return broadcasts.filter(b=>{
      if (filterPri !== 'All' && b.priority !== filterPri) return false
      if (filterLoc !== 'All' && !b.target.locations.includes(filterLoc) && b.target.locations[0] !== 'All Locations') return false
      if (dateFrom && b.date < dateFrom) return false
      if (dateTo   && b.date > dateTo)   return false
      return true
    })
  }, [broadcasts, filterPri, filterLoc, dateFrom, dateTo])

  return (
    <div>
      {/* Filters */}
      <div style={{display:'flex',gap:10,marginBottom:16,flexWrap:'wrap',alignItems:'center'}}>
        <span style={S.sectionLabel}>Filters:</span>
        <select style={{...S.input,width:'auto'}} value={filterPri} onChange={e=>setFilterPri(e.target.value)}>
          <option value="All">All Priorities</option>
          {['URGENT','IMPORTANT','FYI'].map(p=><option key={p}>{p}</option>)}
        </select>
        <select style={{...S.input,width:'auto'}} value={filterLoc} onChange={e=>setFilterLoc(e.target.value)}>
          <option value="All">All Locations</option>
          {locations.map(l=><option key={l.id} value={l.name}>{l.name}</option>)}
        </select>
        <input type="date" style={{...S.input,width:'auto'}} value={dateFrom} onChange={e=>setDateFrom(e.target.value)} placeholder="From"/>
        <input type="date" style={{...S.input,width:'auto'}} value={dateTo}   onChange={e=>setDateTo(e.target.value)}   placeholder="To"/>
        <button style={S.btnGhost} onClick={()=>{setFilterPri('All');setFilterLoc('All');setDateFrom('');setDateTo('')}}>Clear</button>
      </div>

      <div style={S.card}>
        <div style={S.cardHeader}>
          <span style={S.cardTitle}>Broadcast History</span>
          <span style={S.muted}>{filtered.length} records</span>
        </div>
        <div style={{overflowX:'auto'}}>
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
            <thead>
              <tr style={{background:'var(--t-surface-2)'}}>
                {['Date','Title','Priority','Target','Sender','Read Rate','Ack Rate','Status'].map(h=>(
                  <th key={h} style={{
                    textAlign:'left',padding:'9px 12px',
                    fontSize:10,fontWeight:700,letterSpacing:'.07em',textTransform:'uppercase',
                    color:'var(--t-text-muted)',borderBottom:'2px solid var(--t-line)',
                    whiteSpace:'nowrap',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(b=>(
                <Fragment key={b.id}>
                  <tr
                    style={{
                      borderBottom:'1px solid var(--t-line)',
                      cursor:'pointer',
                      background: expanded===b.id ? 'var(--t-surface-2)' : 'transparent',
                    }}
                    onClick={()=>setExpanded(expanded===b.id ? null : b.id)}
                  >
                    <td style={{padding:'9px 12px',color:'var(--t-text-faint)',whiteSpace:'nowrap'}}>{b.date}</td>
                    <td style={{padding:'9px 12px',fontWeight:600,color:'var(--t-text)',maxWidth:220}}>
                      <div style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{b.title}</div>
                    </td>
                    <td style={{padding:'9px 12px'}}>
                      <PriorityBadge priority={b.priority} />
                    </td>
                    <td style={{padding:'9px 12px'}}>
                      <TargetChip target={b.target} />
                    </td>
                    <td style={{padding:'9px 12px',color:'var(--t-text-muted)',whiteSpace:'nowrap'}}>
                      <div style={{fontSize:12}}>{b.senderName}</div>
                      <div style={{fontSize:10,color:'var(--t-text-faint)'}}>{b.senderRole}</div>
                    </td>
                    <td style={{padding:'9px 12px'}}>
                      <span style={{fontWeight:700,color:'var(--t-accent)'}}>{b.total>0?`${Math.round(b.readCount/b.total*100)}%`:'—'}</span>
                    </td>
                    <td style={{padding:'9px 12px'}}>
                      <span style={{fontWeight:700,color:'var(--t-success)'}}>{b.requiresAck ? (b.total>0?`${Math.round(b.ackCount/b.total*100)}%`:'—') : 'N/A'}</span>
                    </td>
                    <td style={{padding:'9px 12px'}}>
                      <Badge color="purple">Expired</Badge>
                    </td>
                  </tr>

                  {/* Expanded row — live receipts */}
                  {expanded===b.id && (
                    <tr key={`${b.id}-exp`}>
                      <td colSpan={8} style={{padding:0,borderBottom:'2px solid var(--t-line)'}}>
                        <div style={{padding:'16px 20px',background:'var(--t-surface-2)'}}>
                          <div style={{fontSize:13,color:'var(--t-text-muted)',lineHeight:1.7,marginBottom:14}}>{b.body}</div>
                          <ReceiptListPair bcId={b.id}/>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <div style={{padding:'24px 16px',textAlign:'center',fontSize:13,color:'var(--t-text-faint)'}}>
              {broadcasts.length === 0 ? 'No expired broadcasts yet.' : 'No broadcasts match the current filters.'}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── SHIFT BROADCASTS TAB ──────────────────────────────────────────────────────
function ShiftBroadcastsTab({isManager, canCompose, person, roster, locations, broadcasts, refresh}) {
  const [subTab, setSubTab]       = useState('feed')
  const [dismissed, setDismissed] = useState(false)
  const [drill, setDrill]         = useState(null)

  const active  = broadcasts.filter(b=>b.status === 'ACTIVE')
  const history = broadcasts.filter(b=>b.status === 'EXPIRED')
  const urgentPinned = active.find(b=>b.pinned && b.priority === 'URGENT')

  const BC_COLS = [
    { key:'title',    label:'Broadcast', value:b=>b.title },
    { key:'priority', label:'Priority',  value:b=>b.priority },
    { key:'target',   label:'Target',    value:b=>b.target.locations.join(' · '), sortKey:b=>b.target.locations.join(',') },
    { key:'sender',   label:'Sender',    value:b=>b.senderName },
    { key:'read',     label:'Read',      value:b=>b.total>0?`${b.readCount}/${b.total} (${Math.round(b.readCount/b.total*100)}%)`:`${b.readCount}/0`, align:'right', sortKey:b=>b.total?b.readCount/b.total:0 },
    { key:'ack',      label:'Acked',     value:b=>b.total>0?`${b.ackCount}/${b.total} (${Math.round(b.ackCount/b.total*100)}%)`:`${b.ackCount}/0`, align:'right', sortKey:b=>b.total?b.ackCount/b.total:0 },
    { key:'status',   label:'Status',    value:b=>b.status },
  ]
  const openDrill = (title, rows, accent) => setDrill({
    title, subtitle:`${rows.length} record${rows.length===1?'':'s'}`, columns:BC_COLS, rows, accent,
  })

  const subTabs = [
    { id:'feed',     label:'Active Feed', badge: active.length || null },
    ...(isManager ? [{ id:'receipts', label:'Receipts' }] : []),
    { id:'history',  label:'History' },
    ...(canCompose  ? [{ id:'compose',  label:'+ New Broadcast' }] : []),
  ]

  const rated = broadcasts.filter(b=>b.total>0)
  const avgReadRate = rated.length
    ? Math.round(rated.reduce((a,b)=>a+(b.readCount/b.total),0)/rated.length*100)
    : null
  const pendingAcks = broadcasts.reduce((a,b)=>a+(b.requiresAck?Math.max(b.total-b.ackCount,0):0),0)

  return (
    <div>
      {/* KPI row — live */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:12,marginBottom:20}}>
        <KTile label="Active Broadcasts" value={active.length} sub="Awaiting employee reads" color="var(--t-accent)" onClick={()=>openDrill('Active Broadcasts', active, 'var(--t-accent)')}/>
        <KTile label="Urgent"            value={active.filter(b=>b.priority==='URGENT').length} sub="Require immediate action" color="var(--t-danger)" alert={active.some(b=>b.priority==='URGENT')?'red':undefined} onClick={()=>openDrill('Urgent Broadcasts', active.filter(b=>b.priority==='URGENT'), 'var(--t-danger)')}/>
        <KTile label="Avg Read Rate"     value={avgReadRate==null?'—':`${avgReadRate}%`} sub="Across all broadcasts" color="var(--t-success)" onClick={()=>openDrill('All Broadcasts — Read Rate', broadcasts, 'var(--t-success)')}/>
        <KTile label="Pending Acks"      value={pendingAcks} sub="Acknowledgments due" color="var(--t-warn)" alert={pendingAcks>0?'amber':undefined} onClick={()=>openDrill('Broadcasts Awaiting Acknowledgment', broadcasts.filter(b=>b.requiresAck && b.ackCount<b.total), 'var(--t-warn)')}/>
      </div>

      <DrillDown open={!!drill} onClose={()=>setDrill(null)} {...(drill||{})} />

      {/* Pinned urgent banner */}
      {urgentPinned && !dismissed && (
        <div style={{
          background:'rgba(255,50,50,.08)',
          border:'1px solid var(--t-danger)',
          borderLeft:'4px solid var(--t-danger)',
          borderRadius:0,
          padding:'12px 16px',
          marginBottom:16,
          display:'flex',
          alignItems:'center',
          gap:12,
          animation:'pulse-border 1.4s ease-in-out infinite',
        }}>
          <style>{`@keyframes pulse-border { 0%,100%{border-color:var(--t-danger)}50%{border-color:rgba(255,50,50,.3)} }`}</style>
          <PriorityBadge priority="URGENT" animate />
          <TargetChip target={urgentPinned.target} />
          <span style={{fontSize:13,fontWeight:700,color:'var(--t-danger)',flex:1}}>
            {urgentPinned.title} — See details below.
          </span>
          <button
            style={{...S.btnGhost,padding:'5px 10px',fontSize:11,borderColor:'var(--t-danger)',color:'var(--t-danger)'}}
            onClick={()=>setDismissed(true)}
          >Dismiss</button>
        </div>
      )}

      {/* Sub tabs */}
      <TabBar tabs={subTabs} active={subTab} onSelect={setSubTab} />

      {/* Feed */}
      {subTab === 'feed' && (
        <div>
          {active.length === 0 && (
            <div style={{padding:'40px 0',textAlign:'center',color:'var(--t-text-faint)',fontSize:13}}>
              No active broadcasts.
            </div>
          )}
          {active.map(bc=>(
            <BroadcastCard
              key={bc.id}
              bc={bc}
              isManager={isManager}
              personId={person.id}
              onChanged={refresh}
            />
          ))}
        </div>
      )}

      {/* Receipts (managers only) */}
      {subTab === 'receipts' && isManager && (
        <ReceiptsPanel broadcasts={broadcasts} personId={person.id} />
      )}

      {/* History */}
      {subTab === 'history' && (
        <BroadcastHistory broadcasts={history} locations={locations} />
      )}

      {/* Compose (managers with flag) */}
      {subTab === 'compose' && canCompose && (
        <ComposeBroadcast person={person} roster={roster} locations={locations} refresh={refresh} onSent={()=>setSubTab('feed')} />
      )}
    </div>
  )
}

// ── LEGACY BROADCAST CENTER TAB ───────────────────────────────────────────────
function BroadcastTab({person, roster, locations, broadcasts, refresh}) {
  const [form, setForm] = useState({
    type: 'Announcement',
    audience: 'All Staff',
    body: '',
    urgency: 'Normal',
    timing: 'now',
    schedAt: '',
    audienceRole: '',
    audienceLocation: '',      // node id
    audiencePerson: '',        // person id
    audienceLocs: [],          // node ids
    audienceRoles: [],         // role names
    audiencePeople: [],        // person ids
  })
  const [preview, setPreview] = useState(false)
  const [sending, setSending] = useState(false)
  const [multiPersonQ, setMultiPersonQ] = useState('')
  const [result, setResult]   = useState(null)
  const [expanded, setExpanded] = useState(null)
  const [chasing,  setChasing]  = useState(null)   // {id, count} | {id, pending:true}
  const [chaseErr, setChaseErr] = useState(null)

  const rolesList = useMemo(
    ()=>[...new Set(roster.map(r=>r.role).filter(r=>r && r!=='—'))].sort(),
    [roster]
  )
  const locNameById = useMemo(()=>{
    const m = {}
    locations.forEach(l=>{ m[l.id] = l.name })
    return m
  }, [locations])
  const personNameById = useMemo(()=>{
    const m = {}
    roster.forEach(r=>{ m[r.id] = r.full_name })
    return m
  }, [roster])

  function updateForm(k, v) { setForm(f=>({...f,[k]:v})); setResult(null) }
  const toggleIn = (key, val) => updateForm(key, (form[key] || []).includes(val) ? (form[key] || []).filter(x => x !== val) : [...(form[key] || []), val])
  const urgencyColor = {Normal:'var(--t-text-muted)', High:'var(--t-warn)', Critical:'var(--t-danger)'}
  const URGENCY_TO_PRIORITY = { Normal:'FYI', High:'IMPORTANT', Critical:'URGENT' }

  function audienceArgs() {
    if (form.audience === 'By Location' && form.audienceLocation) return { node_ids:[form.audienceLocation], role_names:null, person_ids:null }
    if (form.audience === 'By Role' && form.audienceRole)         return { node_ids:null, role_names:[form.audienceRole], person_ids:null }
    if (form.audience === 'Individual' && form.audiencePerson)    return { node_ids:null, role_names:null, person_ids:[form.audiencePerson] }
    if (form.audience === 'Custom (Multi)') return {
      node_ids: form.audienceLocs.length ? form.audienceLocs : null,
      role_names: form.audienceRoles.length ? form.audienceRoles : null,
      person_ids: form.audiencePeople.length ? form.audiencePeople : null,
    }
    return { node_ids:null, role_names:null, person_ids:null }   // All Staff
  }

  async function handleSend() {
    if (!form.body.trim() || sending) return
    setSending(true)
    setResult(null)
    try {
      const aud = audienceArgs()
      const { data, error } = await sb.rpc('post_shift_broadcast', {
        p_author_id: person.id ?? null,
        p_title: form.type,
        p_body: form.body.trim(),
        p_priority: URGENCY_TO_PRIORITY[form.urgency] || 'FYI',
        p_kind: form.type,
        p_node_ids: aud.node_ids,
        p_role_names: aud.role_names,
        p_person_ids: aud.person_ids,
        p_require_ack: form.urgency === 'Critical',
        p_scheduled_at: form.timing === 'schedule' && form.schedAt ? new Date(form.schedAt).toISOString() : null,
      })
      if (error || data?.ok === false) {
        setResult({ok:false, msg: data?.error || 'Failed to send — the server rejected the broadcast.'})
      } else {
        setResult({ok:true, msg: form.timing==='schedule' ? 'Broadcast scheduled successfully.' : 'Broadcast sent successfully.'})
        setForm(f=>({...f, body:'', timing:'now', schedAt:''}))
        refresh && refresh()
      }
    } catch {
      setResult({ok:false, msg:'Failed to send — connection problem. Please try again.'})
    } finally {
      setSending(false)
    }
  }

  async function handleChase(bcId) {
    setChaseErr(null)
    setChasing({id:bcId, pending:true})
    try {
      const { data, error } = await sb.rpc('broadcast_remind', { p_announcement_id: bcId, p_sender_id: person.id ?? null })
      if (error || data?.ok === false) {
        setChasing(null)
        setChaseErr('Reminders were not sent — please try again.')
      } else {
        setChasing({id:bcId, count:data?.reminded ?? 0})
        setTimeout(()=>setChasing(null), 3000)
      }
    } catch {
      setChasing(null)
      setChaseErr('Reminders were not sent — connection problem.')
    }
  }

  const audienceLabel = useMemo(()=>{
    if (form.audience==='All Staff') return `All ${roster.length} employee${roster.length===1?'':'s'} across ${locations.length} location${locations.length===1?'':'s'}`
    if (form.audience==='By Location') return `All staff at ${locNameById[form.audienceLocation]||'[select location]'}`
    if (form.audience==='By Role')     return `All ${form.audienceRole||'[select role]'} employees`
    if (form.audience==='Individual')  return personNameById[form.audiencePerson] || '[select employee]'
    if (form.audience==='Custom (Multi)') {
      const parts = []
      if (form.audienceLocs.length)   parts.push(`${form.audienceLocs.length} location(s)`)
      if (form.audienceRoles.length)  parts.push(`${form.audienceRoles.length} role(s)`)
      if (form.audiencePeople.length) parts.push(`${form.audiencePeople.length} individual(s)`)
      return parts.length
        ? `Custom → ${parts.join(' + ')}: ${[...form.audienceLocs.map(id=>locNameById[id]||'?'),...form.audienceRoles,...form.audiencePeople.map(id=>personNameById[id]||'?')].join(', ')}`
        : '[select recipients]'
    }
    return form.audience
  },[form, roster.length, locations.length, locNameById, personNameById])

  const statusFor = (b) => b.status==='SCHEDULED' ? 'Scheduled' : b.status==='EXPIRED' ? 'Expired' : 'Active'

  return (
    <div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:20,marginBottom:24}}>
        <div>
          <div style={S.card}>
            <div style={S.cardHeader}>
              <span style={S.cardTitle}>Compose Broadcast</span>
              {form.urgency==='Critical'&&<Badge color="red">CRITICAL</Badge>}
              {form.urgency==='High'&&<Badge color="amber">HIGH URGENCY</Badge>}
            </div>
            <div style={S.cardBody}>
              <div style={{marginBottom:14}}>
                <label style={S.label}>Message Type</label>
                <select style={S.input} value={form.type} onChange={e=>updateForm('type',e.target.value)}>
                  {['Announcement','Policy Update','Schedule Change','Emergency Alert'].map(t=><option key={t}>{t}</option>)}
                </select>
              </div>
              <div style={{marginBottom:14}}>
                <label style={S.label}>Audience</label>
                <select style={S.input} value={form.audience} onChange={e=>updateForm('audience',e.target.value)}>
                  {['All Staff','By Location','By Role','Individual','Custom (Multi)'].map(a=><option key={a}>{a}</option>)}
                </select>
                {form.audience==='Custom (Multi)'&&(
                  <div style={{marginTop:10,background:'var(--t-surface)',border:'1px solid var(--t-line)',padding:'12px 14px'}}>
                    <div style={{fontSize:10,fontWeight:800,color:'var(--t-text-muted)',textTransform:'uppercase',letterSpacing:'.06em',marginBottom:6}}>Locations</div>
                    <div style={{display:'flex',gap:6,flexWrap:'wrap',marginBottom:12}}>
                      {locations.length === 0 && <span style={{fontSize:11,color:'var(--t-text-faint)'}}>No locations in scope.</span>}
                      {locations.map(l=>{const on=form.audienceLocs.includes(l.id);return <button key={l.id} type="button" onClick={()=>toggleIn('audienceLocs',l.id)} style={{fontSize:11,fontWeight:700,padding:'4px 10px',cursor:'pointer',border:`1px solid ${on?'var(--t-accent)':'var(--t-line)'}`,background:on?'rgba(0,229,255,.12)':'transparent',color:on?'var(--t-accent)':'var(--t-text-muted)'}}>{on?'✓ ':''}{l.name}</button>})}
                    </div>
                    <div style={{fontSize:10,fontWeight:800,color:'var(--t-text-muted)',textTransform:'uppercase',letterSpacing:'.06em',marginBottom:6}}>Roles</div>
                    <div style={{display:'flex',gap:6,flexWrap:'wrap',marginBottom:12}}>
                      {rolesList.length === 0 && <span style={{fontSize:11,color:'var(--t-text-faint)'}}>No roles found in the roster.</span>}
                      {rolesList.map(r=>{const on=form.audienceRoles.includes(r);return <button key={r} type="button" onClick={()=>toggleIn('audienceRoles',r)} style={{fontSize:11,fontWeight:700,padding:'4px 10px',cursor:'pointer',border:`1px solid ${on?'var(--t-success)':'var(--t-line)'}`,background:on?'rgba(29,233,182,.12)':'transparent',color:on?'var(--t-success)':'var(--t-text-muted)'}}>{on?'✓ ':''}{r}</button>})}
                    </div>
                    <div style={{fontSize:10,fontWeight:800,color:'var(--t-text-muted)',textTransform:'uppercase',letterSpacing:'.06em',marginBottom:6}}>Individuals</div>
                    <div style={{display:'flex',gap:6,flexWrap:'wrap',marginBottom:8}}>
                      {form.audiencePeople.map(pid=><span key={pid} style={{display:'inline-flex',alignItems:'center',gap:4,fontSize:11,fontWeight:700,padding:'2px 4px 2px 8px',border:'1px solid var(--t-accent)',color:'var(--t-accent)'}}>{personNameById[pid]||'?'}<button type="button" onClick={()=>toggleIn('audiencePeople',pid)} style={{background:'none',border:'none',color:'var(--t-text-muted)',cursor:'pointer'}}>✕</button></span>)}
                    </div>
                    <input value={multiPersonQ} onChange={e=>setMultiPersonQ(e.target.value)} placeholder="Search employees to add…" style={{...S.input}} />
                    {multiPersonQ.trim()&&(
                      <div style={{marginTop:6,display:'flex',flexDirection:'column',gap:3}}>
                        {roster.filter(e=>e.full_name.toLowerCase().includes(multiPersonQ.toLowerCase())&&!form.audiencePeople.includes(e.id)).slice(0,6).map(e=>(
                          <div key={e.id} onClick={()=>{toggleIn('audiencePeople',e.id);setMultiPersonQ('')}} style={{cursor:'pointer',fontSize:12,padding:'4px 8px',background:'var(--t-surface-2)',border:'1px solid var(--t-line)'}}>{e.full_name} <span style={{color:'var(--t-text-faint)'}}>· {e.location}</span></div>
                        ))}
                      </div>
                    )}
                    <div style={{marginTop:8,fontSize:11,color:'var(--t-text-muted)'}}>Selected: <b style={{color:'var(--t-text)'}}>{form.audienceLocs.length}</b> locations · <b style={{color:'var(--t-text)'}}>{form.audienceRoles.length}</b> roles · <b style={{color:'var(--t-text)'}}>{form.audiencePeople.length}</b> people</div>
                  </div>
                )}
                {form.audience==='By Location'&&(
                  <select style={{...S.input,marginTop:8}} value={form.audienceLocation} onChange={e=>updateForm('audienceLocation',e.target.value)}>
                    <option value="">— Select location —</option>
                    {locations.map(l=><option key={l.id} value={l.id}>{l.name}</option>)}
                  </select>
                )}
                {form.audience==='By Role'&&(
                  <select style={{...S.input,marginTop:8}} value={form.audienceRole} onChange={e=>updateForm('audienceRole',e.target.value)}>
                    <option value="">— Select role —</option>
                    {rolesList.map(r=><option key={r}>{r}</option>)}
                  </select>
                )}
                {form.audience==='Individual'&&(
                  <select style={{...S.input,marginTop:8}} value={form.audiencePerson} onChange={e=>updateForm('audiencePerson',e.target.value)}>
                    <option value="">— Select employee —</option>
                    {roster.map(e=><option key={e.id} value={e.id}>{e.full_name} — {e.location}</option>)}
                  </select>
                )}
              </div>
              <div style={{marginBottom:14}}>
                <label style={S.label}>Message Body</label>
                <textarea
                  rows={6} style={{...S.input, resize:'vertical', fontFamily:'inherit'}}
                  value={form.body} onChange={e=>updateForm('body',e.target.value)}
                  placeholder="Enter your broadcast message…"
                />
                <div style={{...S.muted, marginTop:4, textAlign:'right'}}>{form.body.length} chars</div>
              </div>
              <div style={{marginBottom:14}}>
                <label style={S.label}>Urgency Level</label>
                <div style={{display:'flex',gap:8}}>
                  {['Normal','High','Critical'].map(u=>(
                    <button key={u} onClick={()=>updateForm('urgency',u)} style={{
                      flex:1, padding:'8px 0', borderRadius:0,
                      border:`2px solid ${form.urgency===u?urgencyColor[u]:'var(--t-line)'}`,
                      background: form.urgency===u?'var(--t-surface-2)':'transparent',
                      color: form.urgency===u?urgencyColor[u]:'var(--t-text-muted)',
                      fontSize:12, fontWeight:700, cursor:'pointer', transition:'all .15s',
                    }}>{u}</button>
                  ))}
                </div>
              </div>
              <div style={{marginBottom:16}}>
                <label style={S.label}>Send Timing</label>
                <div style={{display:'flex',gap:16,marginBottom:8}}>
                  {[{v:'now',l:'Send Immediately'},{v:'schedule',l:'Schedule'}].map(opt=>(
                    <label key={opt.v} style={{display:'flex',alignItems:'center',gap:6,cursor:'pointer',fontSize:13,color:'var(--t-text)'}}>
                      <input type="radio" value={opt.v} checked={form.timing===opt.v} onChange={()=>updateForm('timing',opt.v)}/>
                      {opt.l}
                    </label>
                  ))}
                </div>
                {form.timing==='schedule'&&(
                  <input type="datetime-local" style={S.input} value={form.schedAt} onChange={e=>updateForm('schedAt',e.target.value)}/>
                )}
              </div>
              {result&&(
                <div style={{
                  padding:'10px 14px', marginBottom:12, borderRadius:0,
                  background: result.ok?'rgba(0,230,118,.1)':'rgba(255,50,50,.1)',
                  border:`1px solid ${result.ok?'var(--t-success)':'var(--t-danger)'}`,
                  color: result.ok?'var(--t-success)':'var(--t-danger)',
                  fontSize:13, fontWeight:600,
                }}>{result.msg}</div>
              )}
              <div style={{display:'flex',gap:10}}>
                <button
                  style={{...S.sendBtn, flex:1, opacity:(!form.body.trim()||sending)?0.5:1}}
                  onClick={handleSend}
                  disabled={!form.body.trim()||sending}
                >
                  {sending?'Sending…':form.timing==='schedule'?'Schedule Broadcast':'Send Broadcast'}
                </button>
                <button style={S.btnGhost} onClick={()=>setPreview(p=>!p)}>
                  {preview?'Hide':'Preview'}
                </button>
              </div>
            </div>
          </div>
        </div>

        <div>
          <div style={S.card}>
            <div style={S.cardHeader}>
              <span style={S.cardTitle}>Message Preview</span>
              <Badge color={form.urgency==='Critical'?'red':form.urgency==='High'?'amber':'cyan'}>{form.type}</Badge>
            </div>
            <div style={S.cardBody}>
              <div style={{
                background:'var(--t-surface-2)',
                border:`2px solid ${form.urgency==='Critical'?'var(--t-danger)':form.urgency==='High'?'var(--t-warn)':'var(--t-line)'}`,
                borderRadius:0, padding:16, marginBottom:12,
              }}>
                <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:10}}>
                  <div style={{
                    background: form.urgency==='Critical'?'var(--t-danger)':form.urgency==='High'?'var(--t-warn)':'var(--t-accent)',
                    color:'#000', fontSize:9, fontWeight:800, letterSpacing:'.1em', textTransform:'uppercase', padding:'3px 8px', borderRadius:0,
                  }}>
                    {form.urgency==='Normal'?'ANNOUNCEMENT':form.urgency.toUpperCase()}
                  </div>
                  <div style={{fontSize:10,color:'var(--t-text-muted)'}}>From: {person.full_name||'Admin'} · To: {audienceLabel}</div>
                </div>
                <div style={{
                  fontSize:13, color: form.body?'var(--t-text)':'var(--t-text-faint)',
                  lineHeight:1.6, minHeight:80, whiteSpace:'pre-wrap',
                }}>
                  {form.body||'Your message will appear here…'}
                </div>
                <div style={{marginTop:12,paddingTop:10,borderTop:'1px solid var(--t-line)',fontSize:11,color:'var(--t-text-faint)'}}>
                  Sent via Twisted Growers Platform · {form.timing==='schedule'&&form.schedAt?new Date(form.schedAt).toLocaleString():'Now'}
                </div>
              </div>
              <div style={{...S.sectionLabel, marginBottom:8, display:'block'}}>Audience Breakdown</div>
              {locations.length === 0
                ? <div style={{fontSize:12,color:'var(--t-text-faint)'}}>No locations in scope.</div>
                : <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
                    {locations.map(loc=>{
                      const count = roster.filter(e=>e.node_id===loc.id).length
                      const inc = form.audience==='All Staff'
                        || (form.audience==='By Location'&&form.audienceLocation===loc.id)
                        || (form.audience==='Custom (Multi)'&&(form.audienceLocs.includes(loc.id)||form.audienceLocs.length===0))
                        || form.audience==='By Role'
                      return (
                        <div key={loc.id} style={{
                          padding:'8px 12px', borderRadius:0, background:'var(--t-surface-2)',
                          border:`1px solid ${inc?'var(--t-accent)':'var(--t-line)'}`,
                          display:'flex', justifyContent:'space-between', alignItems:'center',
                        }}>
                          <span style={{fontSize:12,color:inc?'var(--t-text)':'var(--t-text-faint)'}}>{loc.name}</span>
                          <span style={{fontSize:12,fontWeight:700,color:inc?'var(--t-accent)':'var(--t-text-faint)'}}>{inc?count:0}</span>
                        </div>
                      )
                    })}
                  </div>}
            </div>
          </div>
        </div>
      </div>

      {/* Sent Broadcasts History — live rows */}
      <div style={S.card}>
        <div style={S.cardHeader}>
          <span style={S.cardTitle}>Sent Broadcasts</span>
          <span style={S.muted}>{broadcasts.length} total</span>
        </div>
        {chaseErr && (
          <div style={{margin:'10px 16px 0',padding:'8px 12px',border:'1px solid var(--t-danger)',color:'var(--t-danger)',fontSize:12,fontWeight:600}}>{chaseErr}</div>
        )}
        <div style={{overflowX:'auto'}}>
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
            <thead>
              <tr style={{background:'var(--t-surface-2)'}}>
                {['Type','Audience','Sent At','Read','Ack','Status','Actions'].map(h=>(
                  <th key={h} style={{
                    textAlign:'left',padding:'10px 14px',
                    fontSize:10,fontWeight:700,letterSpacing:'.08em',textTransform:'uppercase',
                    color:'var(--t-text-muted)',borderBottom:'2px solid var(--t-line)',whiteSpace:'nowrap',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {broadcasts.map((bc)=>(
                <Fragment key={bc.id}>
                  <tr
                    style={{borderBottom:'1px solid var(--t-line)',background:expanded===bc.id?'var(--t-surface-2)':'transparent',cursor:'pointer'}}
                    onClick={()=>setExpanded(expanded===bc.id?null:bc.id)}
                  >
                    <td style={{padding:'10px 14px'}}>
                      <div style={{fontWeight:600,color:'var(--t-text)'}}>{bc.kind}</div>
                      <div style={{fontSize:11,color:'var(--t-text-faint)',maxWidth:200,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{bc.title}</div>
                    </td>
                    <td style={{padding:'10px 14px',color:'var(--t-text-muted)'}}>{bc.target.locations.join(', ')}{bc.targetRoles?` · ${bc.targetRoles.join(', ')}`:''}</td>
                    <td style={{padding:'10px 14px',color:'var(--t-text-muted)',whiteSpace:'nowrap'}}>{fmtDateTime(bc.createdAt)}</td>
                    <td style={{padding:'10px 14px'}}>
                      <span style={{fontWeight:700,color:'var(--t-accent)'}}>{bc.readCount}</span>
                      <span style={{color:'var(--t-text-faint)'}}> / {bc.total}</span>
                    </td>
                    <td style={{padding:'10px 14px'}}>
                      <span style={{fontWeight:700,color:'var(--t-success)'}}>{bc.requiresAck ? bc.ackCount : '—'}</span>
                      {bc.requiresAck && <span style={{color:'var(--t-text-faint)'}}> / {bc.total}</span>}
                    </td>
                    <td style={{padding:'10px 14px'}}>
                      <Badge color={statusFor(bc)==='Active'?'cyan':statusFor(bc)==='Scheduled'?'amber':'purple'}>{statusFor(bc)}</Badge>
                    </td>
                    <td style={{padding:'10px 14px'}}>
                      <div style={{display:'flex',gap:6}} onClick={e=>e.stopPropagation()}>
                        <button
                          style={{...S.btnGhost,padding:'5px 10px',fontSize:11}}
                          onClick={()=>setExpanded(expanded===bc.id?null:bc.id)}
                        >{expanded===bc.id?'▲ Hide':'▼ Details'}</button>
                        <button
                          style={{...S.btnGhost,padding:'5px 10px',fontSize:11,color:chasing?.id===bc.id&&!chasing.pending?'var(--t-success)':'var(--t-text-muted)',borderColor:chasing?.id===bc.id&&!chasing.pending?'var(--t-success)':'var(--t-line)'}}
                          onClick={()=>handleChase(bc.id)}
                          disabled={chasing?.id===bc.id&&chasing.pending}
                        >{chasing?.id===bc.id ? (chasing.pending ? 'Sending…' : `Sent to ${chasing.count}!`) : 'Chase Unread'}</button>
                      </div>
                    </td>
                  </tr>
                  {expanded===bc.id&&(
                    <tr key={`${bc.id}-detail`}>
                      <td colSpan={7} style={{padding:0,borderBottom:'2px solid var(--t-accent)'}}>
                        <div style={{padding:'16px 20px',background:'var(--t-surface-2)'}}>
                          <div style={{fontSize:13,color:'var(--t-text-muted)',lineHeight:1.7,marginBottom:14}}>{bc.body}</div>
                          <ReceiptListPair bcId={bc.id}/>
                          <div style={{marginTop:14}}>
                            <div style={{display:'flex',justifyContent:'space-between',marginBottom:4}}>
                              <span style={S.muted}>Read rate</span>
                              <span style={{...S.muted,fontWeight:700}}>{bc.total>0?Math.round(bc.readCount/bc.total*100):0}%</span>
                            </div>
                            <div style={{height:6,background:'var(--t-line)',borderRadius:0,overflow:'hidden'}}>
                              <div style={{height:'100%',width:`${bc.total>0?Math.round(bc.readCount/bc.total*100):0}%`,background:'var(--t-accent)',transition:'width .4s'}}/>
                            </div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
          {broadcasts.length === 0 && (
            <div style={{padding:'24px 16px',textAlign:'center',fontSize:13,color:'var(--t-text-faint)'}}>
              No broadcasts sent yet.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── MAIN COMPONENT ────────────────────────────────────────────────────────────
export default function Communications() {
  const {session}          = useAuth()
  const {locationIds, locations} = useScope()
  const shiftBroadcastsOn  = useFeatureFlag('shift_broadcasts')
  const [tab, setTab]      = useState('hub')

  const person = session?.person || {}
  const r          = person.role_name || ''
  const rLower     = r.toLowerCase()
  const isManager  = ['ceo','hr','manager','coo','admin','owner','store manager','key holder'].some(x=>rLower.includes(x))
  const canCompose = shiftBroadcastsOn && ['ceo','hr','manager','coo','admin','owner','store manager'].some(x=>rLower.includes(x))

  const [loading, setLoading] = useState(true)
  const [loadErr, setLoadErr] = useState(null)
  const [hub, setHub]                 = useState(null)
  const [rawBroadcasts, setRawBroadcasts] = useState([])
  const [rawRoster, setRawRoster]     = useState([])
  const [dms, setDms]                 = useState([])
  const [channels, setChannels]       = useState(null)   // null = chat backend unavailable
  const [huddlesToday, setHuddlesToday] = useState(null)

  const nodeKey = (locationIds||[]).join(',')

  const refresh = useCallback(async () => {
    setLoadErr(null)
    try {
      const pid = person.id ?? null
      const nodes = locationIds && locationIds.length ? locationIds : null
      const [hubR, bcR, rosterR, dmR, chR, hudR] = await Promise.all([
        sb.rpc('get_comms_hub',       { p_person_id: pid, p_node_ids: nodes }),
        sb.rpc('get_shift_broadcasts',{ p_person_id: pid, p_node_ids: nodes }),
        sb.rpc('get_roster',          { p_node_ids: locationIds || [] }),
        sb.rpc('get_messages',        { p_person_id: pid }),
        sb.rpc('get_chat_channels',   { p_person_id: pid, p_node_ids: locationIds || [] }),
        sb.rpc('get_huddles',         { p_node_ids: locationIds || [] }),
      ])
      setHub(hubR.error ? null : (hubR.data || null))
      setRawBroadcasts(bcR.error ? [] : (Array.isArray(bcR.data) ? bcR.data : []))
      setRawRoster(rosterR.error ? [] : (Array.isArray(rosterR.data) ? rosterR.data : []))
      setDms(dmR.error ? [] : (Array.isArray(dmR.data) ? dmR.data : []))
      setChannels(chR.error ? null : (Array.isArray(chR.data) ? chR.data : []))
      if (hudR.error) setHuddlesToday(null)
      else {
        const today = new Date().toISOString().slice(0,10)
        const list = Array.isArray(hudR.data) ? hudR.data : []
        setHuddlesToday(list.filter(h=>String(h.created_at||h.date||h.huddle_date||'').slice(0,10)===today).length)
      }
      if (hubR.error && bcR.error) {
        setLoadErr('Unable to load communications data — the server did not respond. Pull to retry.')
      }
    } catch {
      setLoadErr('Unable to load communications data — connection problem.')
    } finally {
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [person.id, nodeKey])

  useEffect(()=>{ refresh() }, [refresh])

  const roster = useMemo(()=> rawRoster.map(x=>({
    id: x.id ?? x.person_id,
    full_name: x.full_name || '—',
    role: x.role_name ?? x.role ?? '—',
    node_id: x.node_id ?? null,
    location: x.node_name ?? x.location ?? '—',
  })), [rawRoster])

  const broadcasts = useMemo(()=> rawBroadcasts.map(normBroadcast), [rawBroadcasts])
  const activeBroadcasts = broadcasts.filter(b=>b.status==='ACTIVE')

  const chatUnread = channels === null ? 0 : channels.reduce((a,c)=>a+(c.unread_count||0),0)
  const unreadTotal = (hub?.unread_dms||0) + chatUnread + activeBroadcasts.filter(b=>!b.myRead).length

  const tabs = [
    {id:'hub',        label:'Hub'},
    ...(shiftBroadcastsOn ? [{id:'broadcasts', label:'Broadcasts', badge: activeBroadcasts.length || null}] : []),
    {id:'broadcast',  label:'Broadcast Center'},
  ]

  return (
    <div style={{
      background:'var(--t-bg)',
      minHeight:'100vh',
      padding:'24px 28px',
      fontFamily:'inherit',
    }}>
      {/* Page Header */}
      <div style={{marginBottom:20}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:4}}>
          <div>
            <div style={{fontSize:20,fontWeight:800,color:'var(--t-text)',letterSpacing:'-.02em',marginBottom:2}}>
              Communications
            </div>
            <div style={{fontSize:13,color:'var(--t-text-muted)'}}>
              Team chat · Broadcasts · Shift Announcements · Messaging hub
            </div>
          </div>
          <div style={{display:'flex',gap:10,alignItems:'center'}}>
            <div style={{
              background:'rgba(0,229,255,.1)',
              border:'1px solid var(--t-accent)',
              borderRadius:0,
              padding:'6px 14px',
              fontSize:12,fontWeight:700,color:'var(--t-accent)',
            }}>
              {unreadTotal} Unread
            </div>
            {isManager && <Badge color="purple">Manager Access</Badge>}
          </div>
        </div>
      </div>

      {loadErr && (
        <div style={{
          background:'rgba(255,50,50,.08)',
          border:'1px solid var(--t-danger)',
          color:'var(--t-danger)',
          padding:'10px 16px',
          fontSize:13,fontWeight:600,
          marginBottom:16,
          display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,
        }}>
          <span>{loadErr}</span>
          <button style={{...S.btnGhost,borderColor:'var(--t-danger)',color:'var(--t-danger)'}} onClick={()=>{setLoading(true);refresh()}}>Retry</button>
        </div>
      )}

      <TabBar tabs={tabs} active={tab} onSelect={setTab}/>

      {loading ? (
        <div style={{padding:'60px 0',textAlign:'center',color:'var(--t-text-faint)',fontSize:13}}>
          Loading communications…
        </div>
      ) : (
        <>
          {tab === 'hub' && (
            <HubTab
              onTab={setTab}
              person={person}
              hub={hub}
              broadcasts={broadcasts}
              roster={roster}
              locations={locations || []}
              dms={dms}
              channels={channels}
              huddlesToday={huddlesToday}
              shiftBroadcastsOn={shiftBroadcastsOn}
              refresh={refresh}
            />
          )}
          {tab === 'broadcasts' && shiftBroadcastsOn && (
            <ShiftBroadcastsTab
              isManager={isManager}
              canCompose={canCompose}
              person={person}
              roster={roster}
              locations={locations || []}
              broadcasts={broadcasts}
              refresh={refresh}
            />
          )}
          {tab === 'broadcast' && (
            <BroadcastTab
              person={person}
              roster={roster}
              locations={locations || []}
              broadcasts={broadcasts}
              refresh={refresh}
            />
          )}
        </>
      )}
    </div>
  )
}
