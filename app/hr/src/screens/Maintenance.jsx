import { useState, useEffect, useCallback, useMemo } from 'react'
import { sb } from '../lib/supabase'
import { useAuth } from '../lib/auth.jsx'
import { useScope } from '../lib/scope.jsx'

/* ── HELPERS ──────────────────────────────────────────────────────────── */
const fmtDate = iso => iso ? new Date(iso).toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric', hour:'2-digit', minute:'2-digit' }) : '—'
const timeAgo = iso => { if(!iso)return'Never'; const s=Math.floor((Date.now()-new Date(iso))/1000); if(s<0)return'just now'; if(s<60)return`${s}s ago`; if(s<3600)return`${Math.floor(s/60)}m ago`; if(s<86400)return`${Math.floor(s/3600)}h ago`; return`${Math.floor(s/86400)}d ago` }
const fmtNum  = n => Number(n||0).toLocaleString()
const fmtBytes = b => {
  const n = Number(b||0)
  if (n >= 1e9) return `${(n/1e9).toFixed(2)} GB`
  if (n >= 1e6) return `${(n/1e6).toFixed(1)} MB`
  if (n >= 1e3) return `${(n/1e3).toFixed(1)} KB`
  return `${n} B`
}
const isUuid = v => v && /^[0-9a-f-]{36}$/i.test(String(v))

/* ── KPI TILE ─────────────────────────────────────────────────────────── */
function KTile({ label, value, sub, color, alert }) {
  return (
    <div style={{ background:'var(--t-surface)', border:`1px solid ${alert==='red'?'var(--t-danger)':alert==='amber'?'var(--t-warn)':'var(--t-line)'}`, padding:'14px 16px', position:'relative', overflow:'hidden' }}>
      {alert==='red'  && <div style={{ position:'absolute', top:0, left:0, right:0, height:2, background:'var(--t-danger)' }}/>}
      {alert==='amber'&& <div style={{ position:'absolute', top:0, left:0, right:0, height:2, background:'var(--t-warn)' }}/>}
      <div style={{ fontSize:10, fontWeight:700, letterSpacing:'.08em', color:'var(--t-text-muted)', textTransform:'uppercase', marginBottom:6 }}>{label}</div>
      <div style={{ fontSize:24, fontWeight:800, color:color||'var(--t-text)', lineHeight:1, marginBottom:4 }}>{value}</div>
      {sub && <div style={{ fontSize:11, color:'var(--t-text-faint)' }}>{sub}</div>}
    </div>
  )
}

/* ── STATUS DOT ───────────────────────────────────────────────────────── */
function SDot({ status }) {
  const col = status==='green'?'var(--t-success)':status==='amber'?'var(--t-warn)':'var(--t-danger)'
  return (
    <span style={{ display:'inline-flex', alignItems:'center', gap:5 }}>
      <span style={{ width:8, height:8, borderRadius:'50%', background:col, display:'inline-block', boxShadow:`0 0 6px ${col}` }} />
      <span style={{ fontSize:11, fontWeight:700, color:col }}>{status==='green'?'Healthy':status==='amber'?'Degraded':'Down'}</span>
    </span>
  )
}

/* ── SPINNER ──────────────────────────────────────────────────────────── */
function Spinner({ size=14 }) {
  return <div style={{ width:size, height:size, border:`2px solid var(--t-line)`, borderTopColor:'var(--t-accent)', borderRadius:'50%', animation:'spin 1s linear infinite', flexShrink:0 }} />
}

/* ── CONFIRM MODAL ────────────────────────────────────────────────────── */
function ConfirmModal({ msg, onOk, onCancel }) {
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.6)', zIndex:9999, display:'flex', alignItems:'center', justifyContent:'center' }} onClick={onCancel}>
      <div style={{ background:'var(--t-surface)', border:'1px solid var(--t-line)', padding:28, maxWidth:420, width:'90%' }} onClick={e=>e.stopPropagation()}>
        <div style={{ fontSize:16, fontWeight:800, color:'var(--t-text)', marginBottom:12 }}>Confirm Action</div>
        <div style={{ fontSize:13, color:'var(--t-text-muted)', marginBottom:22, lineHeight:1.6 }}>{msg}</div>
        <div style={{ display:'flex', gap:10, justifyContent:'flex-end' }}>
          <button onClick={onCancel} style={{ padding:'9px 18px', background:'none', border:'1px solid var(--t-line)', color:'var(--t-text-muted)', fontWeight:600, fontSize:13, cursor:'pointer' }}>Cancel</button>
          <button onClick={onOk}     style={{ padding:'9px 18px', background:'var(--t-danger)', color:'#fff', border:'none', fontWeight:700, fontSize:13, cursor:'pointer' }}>Confirm</button>
        </div>
      </div>
    </div>
  )
}

/* ── TAB BTN ──────────────────────────────────────────────────────────── */
const TB = (active) => ({
  padding:'8px 18px', background:'none', border:'none',
  borderBottom:`2px solid ${active?'var(--t-accent)':'transparent'}`,
  color:active?'var(--t-accent)':'var(--t-text-muted)',
  fontWeight:active?700:400, fontSize:13, cursor:'pointer',
  marginBottom:-1, letterSpacing:'.3px', whiteSpace:'nowrap',
})

/* ── RESULT COLOR ─────────────────────────────────────────────────────── */
const resultColor = r => {
  const s = (r||'').toLowerCase()
  if (!s || s==='success' || s==='ok') return 'var(--t-success)'
  if (/deny|denied|fail|error|block/.test(s)) return 'var(--t-danger)'
  return 'var(--t-warn)'
}
const alertSeverity = ev => {
  const a = `${ev.result||''} ${ev.action||''}`.toLowerCase()
  if (/deny|denied|fail|error|block/.test(a)) return 'high'
  if (/role|permission|security|delete/.test(a)) return 'medium'
  return 'low'
}

/* ── MAIN COMPONENT ───────────────────────────────────────────────────── */
export default function Maintenance() {
  const { session }     = useAuth()
  const { locationIds } = useScope()
  const role            = (session?.person?.role_name || '').toLowerCase()
  const isAdmin         = /admin|owner|coo|ceo|cfo|president|chief/i.test(role)

  const actorId   = isUuid(session?.person?.id) ? session.person.id : null
  const actorName = session?.person?.full_name || session?.person?.display_name || 'Admin'

  const [tab, setTab]         = useState('health')
  const [loading, setLoading] = useState(true)
  const [err, setErr]         = useState('')
  const [health, setHealth]   = useState(null)
  const [storage, setStorage] = useState(null)
  const [incidents, setInc]   = useState([])
  const [cleanup, setCleanup] = useState([])
  const [auditRows, setAudit] = useState([])
  const [dbPingMs, setPing]   = useState(null)
  const [checkedAt, setCheck] = useState(null)

  const [toast, setToast]     = useState('')
  const [confirm, setConfirm] = useState(null)
  const [cleanupBusy, setCB]  = useState({})
  const [logFilter, setLF]    = useState({ action:'', user:'', date:'' })
  const [incForm, setIncForm] = useState(null)   // { system, description, severity } | null
  const [incBusy, setIncBusy] = useState(false)

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 3500) }

  /* ── Real data load (measures live DB round-trip on the health call) ──── */
  const load = useCallback(async () => {
    setErr('')
    const nodeArg = { p_node_ids: (locationIds && locationIds.length) ? locationIds : null }
    try {
      const t0 = performance.now()
      const { data: h, error: eh } = await sb.rpc('get_maintenance_health', nodeArg)
      const ping = Math.round(performance.now() - t0)
      if (eh) throw eh
      setPing(ping)
      setHealth(h || {})

      const [st, inc, cl, al] = await Promise.all([
        sb.rpc('get_maintenance_storage'),
        sb.rpc('get_system_incidents', nodeArg),
        sb.rpc('get_maintenance_cleanup_preview'),
        sb.rpc('get_audit_log', { ...nodeArg, p_limit: 500 }),
      ])
      if (!st.error)  setStorage(st.data || {})
      if (!inc.error) setInc(Array.isArray(inc.data) ? inc.data : [])
      if (!cl.error)  setCleanup(Array.isArray(cl.data) ? cl.data : [])
      if (!al.error)  setAudit(Array.isArray(al.data) ? al.data : [])
      setCheck(new Date().toISOString())
    } catch (e) {
      setErr(e?.message || 'Failed to load maintenance data')
    } finally {
      setLoading(false)
    }
  }, [locationIds])

  useEffect(() => { setLoading(true); load() }, [load])

  /* ── Derived real metrics ─────────────────────────────────────────────── */
  const totalEvents   = health?.total_events_24h   ?? 0
  const failedEvents  = health?.failed_events_24h  ?? 0
  const securityCount = health?.security_events_24h ?? 0
  const activeUsers   = health?.active_users_15m   ?? 0
  const lastEventAt   = health?.last_event_at      || null
  const securityFeed  = Array.isArray(health?.security_events) ? health.security_events : []
  const errorRate     = totalEvents > 0 ? (failedEvents / totalEvents * 100) : 0

  const totalBytes = storage?.total_bytes ?? 0
  const totalRows  = storage?.total_rows  ?? 0
  const tableCount = storage?.table_count ?? 0
  const tables     = Array.isArray(storage?.tables) ? storage.tables : []

  const dbStatus = dbPingMs == null ? 'amber' : dbPingMs > 500 ? 'red' : dbPingMs > 200 ? 'amber' : 'green'

  const healthScore = useMemo(() => {
    if (!health) return null
    let s = 100
    s -= Math.min(errorRate, 40)
    s -= dbPingMs == null ? 15 : dbPingMs > 1000 ? 25 : dbPingMs > 500 ? 15 : dbPingMs > 200 ? 5 : 0
    return Math.max(0, Math.round(s))
  }, [health, errorRate, dbPingMs])
  const healthColor = healthScore == null ? 'var(--t-text-muted)'
    : healthScore >= 95 ? 'var(--t-success)' : healthScore >= 80 ? 'var(--t-warn)' : 'var(--t-danger)'

  /* Subsystem cards — every value below is measured, not fabricated. */
  const subsystems = useMemo(() => ([
    { id:'db', name:'Database', desc:'Supabase PostgreSQL', icon:'🗄', status: dbStatus,
      metrics:[
        { label:'Response', value: dbPingMs==null?'—':`${dbPingMs}ms`, color: dbStatus==='red'?'var(--t-danger)':dbStatus==='amber'?'var(--t-warn)':'var(--t-success)' },
        { label:'Rows',     value: fmtNum(totalRows),  color:'var(--t-text)' },
        { label:'Size',     value: fmtBytes(totalBytes), color:'var(--t-text)' },
      ] },
    { id:'audit', name:'Activity Stream', desc:'Audit log (24h)', icon:'📋',
      status: failedEvents>0 ? 'amber' : 'green',
      metrics:[
        { label:'Events 24h', value: fmtNum(totalEvents), color:'var(--t-text)' },
        { label:'Failed',     value: fmtNum(failedEvents), color: failedEvents>0?'var(--t-warn)':'var(--t-text-faint)' },
        { label:'Last',       value: timeAgo(lastEventAt), color:'var(--t-text-muted)' },
      ] },
    { id:'auth', name:'Authentication', desc:'PIN sessions', icon:'🔐',
      status: 'green',
      metrics:[
        { label:'Active 15m',   value: fmtNum(activeUsers),  color: activeUsers>0?'var(--t-success)':'var(--t-text-faint)' },
        { label:'Security 24h', value: fmtNum(securityCount), color: securityCount>0?'var(--t-warn)':'var(--t-text-faint)' },
        { label:'Failed 24h',   value: fmtNum(failedEvents),  color: failedEvents>0?'var(--t-warn)':'var(--t-text-faint)' },
      ] },
    { id:'storage', name:'Storage', desc:'Database tables', icon:'📁',
      status: 'green',
      metrics:[
        { label:'Tables', value: fmtNum(tableCount), color:'var(--t-text)' },
        { label:'Total',  value: fmtBytes(totalBytes), color:'var(--t-text)' },
        { label:'Rows',   value: fmtNum(totalRows), color:'var(--t-text)' },
      ] },
  ]), [dbStatus, dbPingMs, totalRows, totalBytes, failedEvents, totalEvents, lastEventAt, activeUsers, securityCount, tableCount])

  /* Distinct actions for the audit filter dropdown (from real rows). */
  const actionOptions = useMemo(
    () => Array.from(new Set(auditRows.map(r => r.action).filter(Boolean))).sort(),
    [auditRows]
  )

  const filteredLog = useMemo(() => auditRows.filter(e => {
    if (logFilter.action && e.action !== logFilter.action) return false
    if (logFilter.user && !((e.actor_name||'').toLowerCase().includes(logFilter.user.toLowerCase()))) return false
    if (logFilter.date && !(e.created_at||'').startsWith(logFilter.date)) return false
    return true
  }), [auditRows, logFilter])

  /* ── Real writes ──────────────────────────────────────────────────────── */
  const resolveIncident = async (inc) => {
    const { error } = await sb.rpc('resolve_system_incident', { p_id: inc.id, p_actor_id: actorId, p_actor_name: actorName })
    if (error) { showToast(`Could not resolve — ${error.message}`); return }
    showToast('Incident marked resolved')
    load()
  }

  const submitIncident = async () => {
    if (!incForm?.description?.trim()) { showToast('Description is required'); return }
    setIncBusy(true)
    const { error } = await sb.rpc('log_system_incident', {
      p_system: incForm.system || '', p_description: incForm.description.trim(),
      p_severity: incForm.severity || 'medium',
      p_node_id: (locationIds && locationIds.length === 1) ? locationIds[0] : null,
      p_reported_by: actorId, p_reporter_name: actorName,
    })
    setIncBusy(false)
    if (error) { showToast(`Could not log incident — ${error.message}`); return }
    setIncForm(null)
    showToast('Incident logged')
    load()
  }

  const runCleanup = (task) => {
    if (!task.rows) return
    setConfirm({
      msg: `Run "${task.label}"? This will permanently delete ${fmtNum(task.rows)} eligible record(s). This action cannot be undone.`,
      onOk: async () => {
        setConfirm(null)
        setCB(prev => ({ ...prev, [task.task]: true }))
        const { data, error } = await sb.rpc('run_maintenance_cleanup', { p_task: task.task, p_actor_id: actorId, p_actor_name: actorName })
        setCB(prev => ({ ...prev, [task.task]: false }))
        if (error) { showToast(`Cleanup failed — ${error.message}`); return }
        showToast(`${task.label} completed — ${fmtNum(data?.deleted ?? 0)} record(s) removed`)
        load()
      },
    })
  }

  const exportStorage = () => {
    if (!tables.length) { showToast('No storage data to export'); return }
    const header = ['Table','Rows','Size (bytes)','Size']
    const rows   = tables.map(t => [t.name, t.rows, t.size_bytes, fmtBytes(t.size_bytes)])
    const csv    = [header, ...rows].map(r => r.map(c => `"${c}"`).join(',')).join('\r\n')
    const blob   = new Blob([csv], { type:'text/csv' })
    const url    = URL.createObjectURL(blob)
    const a      = document.createElement('a'); a.href=url; a.download=`storage-report-${new Date().toISOString().slice(0,10)}.csv`; a.click()
    URL.revokeObjectURL(url)
    showToast('Storage report exported')
  }

  const exportLogs = () => {
    if (!filteredLog.length) { showToast('No events to export'); return }
    const header = ['Timestamp','User','Role','Action','Target','Result','Node']
    const rows   = filteredLog.map(e => [fmtDate(e.created_at), e.actor_name||'', e.actor_role||'', e.action||'', e.target||'', e.result||'', e.node_name||''])
    const csv    = [header, ...rows].map(r => r.map(c => `"${c}"`).join(',')).join('\r\n')
    const blob   = new Blob([csv], { type:'text/csv' })
    const url    = URL.createObjectURL(blob)
    const a      = document.createElement('a'); a.href=url; a.download=`audit-log-${new Date().toISOString().slice(0,10)}.csv`; a.click()
    URL.revokeObjectURL(url)
    showToast('Audit log exported')
  }

  if (!isAdmin) {
    return (
      <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:400, gap:16, color:'var(--t-text-muted)' }}>
        <div style={{ fontSize:40 }}>🔐</div>
        <div style={{ fontSize:15, fontWeight:600 }}>Admin access required</div>
        <div style={{ fontSize:13 }}>System Maintenance is restricted to Admin and Owner roles.</div>
      </div>
    )
  }

  if (loading && !health) {
    return (
      <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:300, gap:12, color:'var(--t-text-muted)' }}>
        <Spinner size={18} /> <span style={{ fontSize:13 }}>Loading system telemetry…</span>
      </div>
    )
  }

  return (
    <div style={{ padding:'0 0 40px' }}>

      {err && (
        <div style={{ padding:'10px 14px', background:'rgba(255,61,61,.08)', border:'1px solid var(--t-danger)', color:'var(--t-danger)', fontSize:13, fontWeight:600, marginBottom:16 }}>
          {err}
        </div>
      )}

      {/* KPI ROW — all real, measured from the live DB / audit log */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(6,1fr)', gap:12, marginBottom:20 }}>
        <KTile label="DB Response"   value={dbPingMs==null?'—':`${dbPingMs}ms`} sub="live round-trip"
          color={dbPingMs==null?'var(--t-text-muted)':dbPingMs>500?'var(--t-danger)':dbPingMs>200?'var(--t-warn)':'var(--t-success)'}
          alert={dbPingMs>500?'red':dbPingMs>200?'amber':null} />
        <KTile label="Active Users"  value={fmtNum(activeUsers)}   sub="last 15 min"           color="var(--t-accent)" />
        <KTile label="Events (24h)"  value={fmtNum(totalEvents)}   sub="audited actions"       color="var(--t-text)" />
        <KTile label="Failed (24h)"  value={fmtNum(failedEvents)}  sub={`${errorRate.toFixed(1)}% error rate`}
          color={failedEvents>0?'var(--t-danger)':undefined} alert={errorRate>5?'red':errorRate>2?'amber':null} />
        <KTile label="Security (24h)" value={fmtNum(securityCount)} sub="flagged events"
          color={securityCount>0?'var(--t-warn)':undefined} alert={securityCount>5?'amber':null} />
        <KTile label="Storage"       value={fmtBytes(totalBytes)}  sub={`${fmtNum(tableCount)} tables · ${fmtNum(totalRows)} rows`} color="var(--t-text)" />
      </div>

      {/* OVERALL HEALTH SCORE */}
      <div style={{ display:'flex', alignItems:'center', gap:20, padding:'14px 18px', background:'var(--t-surface)', border:'1px solid var(--t-line)', marginBottom:20 }}>
        <div style={{ fontSize:48, fontWeight:900, color:healthColor, lineHeight:1, fontFamily:'monospace' }}>{healthScore==null?'—':healthScore}</div>
        <div>
          <div style={{ fontSize:14, fontWeight:700, color:'var(--t-text)', marginBottom:2 }}>Overall Health Score</div>
          <div style={{ fontSize:12, color:'var(--t-text-muted)' }}>
            {healthScore==null ? 'Awaiting telemetry.'
              : healthScore >= 95 ? 'All systems operational — no action needed.'
              : healthScore >= 80 ? 'Minor degradation detected — review signals below.'
              : 'Elevated error/latency — investigate recent failures.'}
          </div>
        </div>
        <div style={{ marginLeft:'auto', display:'flex', gap:12, alignItems:'center' }}>
          <div style={{ textAlign:'right', fontSize:11, color:'var(--t-text-faint)' }}>
            Checked {timeAgo(checkedAt)}
          </div>
          <button onClick={() => { setLoading(true); load() }} disabled={loading}
            style={{ padding:'8px 16px', background:'none', border:'1px solid var(--t-line)', color:'var(--t-text)', fontWeight:600, fontSize:12, cursor:loading?'not-allowed':'pointer', display:'flex', alignItems:'center', gap:6 }}>
            {loading ? <><Spinner size={12}/> Refreshing…</> : 'Refresh'}
          </button>
        </div>
      </div>

      {/* TABS */}
      <div style={{ display:'flex', gap:0, borderBottom:'1px solid var(--t-line)', marginBottom:22 }}>
        {[['health','System Health'],['data','Data Management'],['audit','Audit & Logs']].map(([k,l]) => (
          <button key={k} onClick={()=>setTab(k)} style={TB(tab===k)}>{l}</button>
        ))}
      </div>

      {/* ── TAB: SYSTEM HEALTH ────────────────────────────────────────── */}
      {tab === 'health' && (
        <div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(300px,1fr))', gap:14, marginBottom:24 }}>
            {subsystems.map(sys => (
              <div key={sys.id} style={{ background:'var(--t-surface)', border:`1px solid ${sys.status==='red'?'var(--t-danger)':sys.status==='amber'?'var(--t-warn)':'var(--t-line)'}`, padding:'14px 16px', position:'relative', overflow:'hidden' }}>
                <div style={{ position:'absolute', top:0, left:0, right:0, height:2, background:sys.status==='red'?'var(--t-danger)':sys.status==='amber'?'var(--t-warn)':'var(--t-success)' }} />
                <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:12 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                    <span style={{ fontSize:20 }}>{sys.icon}</span>
                    <div>
                      <div style={{ fontWeight:700, fontSize:13, color:'var(--t-text)' }}>{sys.name}</div>
                      <div style={{ fontSize:11, color:'var(--t-text-muted)' }}>{sys.desc}</div>
                    </div>
                  </div>
                  <SDot status={sys.status} />
                </div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8 }}>
                  {sys.metrics.map(m => (
                    <div key={m.label} style={{ padding:'7px 8px', background:'var(--t-bg)', border:'1px solid var(--t-line)' }}>
                      <div style={{ fontSize:9, fontWeight:700, color:'var(--t-text-muted)', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:3 }}>{m.label}</div>
                      <div style={{ fontSize:14, fontWeight:800, color:m.color, fontFamily:'monospace' }}>{m.value}</div>
                    </div>
                  ))}
                </div>
                <div style={{ marginTop:8, fontSize:10, color:'var(--t-text-faint)' }}>Checked {timeAgo(checkedAt)}</div>
              </div>
            ))}
          </div>

          {/* Recent Incidents — real system_incidents */}
          <div style={{ background:'var(--t-surface)', border:'1px solid var(--t-line)', padding:'16px 18px' }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14 }}>
              <div style={{ fontSize:11, fontWeight:700, color:'var(--t-text-muted)', textTransform:'uppercase', letterSpacing:'.08em' }}>Recent Incidents</div>
              <button onClick={() => setIncForm({ system:'', description:'', severity:'medium' })}
                style={{ padding:'6px 12px', background:'var(--t-accent)', color:'#000', border:'none', fontWeight:700, fontSize:12, cursor:'pointer' }}>
                + Log Incident
              </button>
            </div>

            {incForm && (
              <div style={{ padding:'14px', background:'var(--t-bg)', border:'1px solid var(--t-line)', marginBottom:14, display:'flex', flexDirection:'column', gap:10 }}>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 160px', gap:10 }}>
                  <input value={incForm.system} onChange={e=>setIncForm(f=>({...f,system:e.target.value}))} placeholder="System / component (optional)"
                    style={{ padding:'9px 11px', background:'var(--t-surface)', border:'1px solid var(--t-line)', color:'var(--t-text)', fontSize:13, outline:'none' }} />
                  <select value={incForm.severity} onChange={e=>setIncForm(f=>({...f,severity:e.target.value}))}
                    style={{ padding:'9px 11px', background:'var(--t-surface)', border:'1px solid var(--t-line)', color:'var(--t-text)', fontSize:13, outline:'none' }}>
                    <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option>
                  </select>
                </div>
                <textarea value={incForm.description} onChange={e=>setIncForm(f=>({...f,description:e.target.value}))} placeholder="Describe the issue…" rows={2}
                  style={{ padding:'9px 11px', background:'var(--t-surface)', border:'1px solid var(--t-line)', color:'var(--t-text)', fontSize:13, outline:'none', resize:'vertical', fontFamily:'inherit' }} />
                <div style={{ display:'flex', gap:10, justifyContent:'flex-end' }}>
                  <button onClick={()=>setIncForm(null)} style={{ padding:'8px 16px', background:'none', border:'1px solid var(--t-line)', color:'var(--t-text-muted)', fontWeight:600, fontSize:13, cursor:'pointer' }}>Cancel</button>
                  <button onClick={submitIncident} disabled={incBusy}
                    style={{ padding:'8px 16px', background:'var(--t-accent)', color:'#000', border:'none', fontWeight:700, fontSize:13, cursor:incBusy?'not-allowed':'pointer', display:'flex', alignItems:'center', gap:6 }}>
                    {incBusy ? <><Spinner size={12}/> Saving…</> : 'Log Incident'}
                  </button>
                </div>
              </div>
            )}

            {incidents.length === 0 ? (
              <div style={{ textAlign:'center', padding:'30px 20px', color:'var(--t-text-muted)', fontSize:13 }}>No incidents logged — all clear</div>
            ) : (
              incidents.map(inc => (
                <div key={inc.id} style={{ display:'flex', alignItems:'flex-start', gap:12, padding:'10px 0', borderBottom:'1px solid var(--t-line)' }}>
                  <div style={{ width:8, height:8, borderRadius:'50%', background:inc.resolved?'var(--t-success)':'var(--t-danger)', marginTop:4, flexShrink:0, boxShadow:`0 0 6px ${inc.resolved?'var(--t-success)':'var(--t-danger)'}` }} />
                  <div style={{ flex:1 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:2, flexWrap:'wrap' }}>
                      <span style={{ fontSize:12, fontWeight:700, color:'var(--t-text)' }}>{[inc.system, inc.node_name].filter(Boolean).join(' — ') || 'Incident'}</span>
                      <span style={{ fontSize:10, fontWeight:700, padding:'2px 7px', textTransform:'uppercase', letterSpacing:'.04em', color:inc.severity==='high'?'var(--t-danger)':inc.severity==='medium'?'var(--t-warn)':'var(--t-accent)', border:`1px solid ${inc.severity==='high'?'rgba(255,61,61,.3)':inc.severity==='medium'?'rgba(255,180,0,.3)':'rgba(0,200,255,.3)'}` }}>{inc.severity}</span>
                      <span style={{ fontSize:10, fontWeight:700, padding:'2px 7px', background:inc.resolved?'rgba(0,200,83,.12)':'rgba(255,61,61,.12)', color:inc.resolved?'var(--t-success)':'var(--t-danger)', border:`1px solid ${inc.resolved?'rgba(0,200,83,.3)':'rgba(255,61,61,.3)'}` }}>
                        {inc.resolved ? 'Resolved' : 'Active'}
                      </span>
                    </div>
                    <div style={{ fontSize:12, color:'var(--t-text-muted)' }}>{inc.description}{inc.reporter_name ? ` · reported by ${inc.reporter_name}` : ''}</div>
                    <div style={{ fontSize:10, color:'var(--t-text-faint)', marginTop:2 }}>{fmtDate(inc.ts)}</div>
                  </div>
                  {!inc.resolved && (
                    <button onClick={() => resolveIncident(inc)}
                      style={{ padding:'5px 12px', background:'var(--t-success)', color:'#fff', border:'none', fontWeight:700, fontSize:11, cursor:'pointer', flexShrink:0 }}>
                      Resolve
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* ── TAB: DATA MANAGEMENT ─────────────────────────────────────── */}
      {tab === 'data' && (
        <div style={{ display:'grid', gridTemplateColumns:'1fr 360px', gap:20, alignItems:'start' }}>
          {/* LEFT */}
          <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
            {/* Storage usage — real table sizes */}
            <div style={{ background:'var(--t-surface)', border:'1px solid var(--t-line)', padding:'16px 18px' }}>
              <div style={{ fontSize:11, fontWeight:700, color:'var(--t-text-muted)', textTransform:'uppercase', letterSpacing:'.08em', marginBottom:14 }}>Storage by Table</div>
              {tables.length === 0 ? (
                <div style={{ textAlign:'center', padding:'24px', color:'var(--t-text-muted)', fontSize:13 }}>No storage statistics available</div>
              ) : (
                <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
                  <thead>
                    <tr style={{ borderBottom:'1px solid var(--t-line)' }}>
                      {['Table','Rows','Size','% of Total'].map(h => (
                        <th key={h} style={{ padding:'7px 10px', textAlign:'left', fontSize:11, fontWeight:700, color:'var(--t-text-muted)', textTransform:'uppercase', letterSpacing:'.06em' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {tables.map(t => {
                      const pct = totalBytes ? Math.round(t.size_bytes / totalBytes * 100) : 0
                      return (
                        <tr key={t.name} style={{ borderBottom:'1px solid var(--t-line)' }}>
                          <td style={{ padding:'8px 10px', fontFamily:'monospace', fontSize:12, color:'var(--t-accent)', fontWeight:600 }}>{t.name}</td>
                          <td style={{ padding:'8px 10px', color:'var(--t-text)', fontWeight:600 }}>{fmtNum(t.rows)}</td>
                          <td style={{ padding:'8px 10px', color:'var(--t-text-muted)' }}>{fmtBytes(t.size_bytes)}</td>
                          <td style={{ padding:'8px 10px' }}>
                            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                              <div style={{ flex:1, height:4, background:'var(--t-bg)', borderRadius:2 }}>
                                <div style={{ height:'100%', width:`${pct}%`, background:'var(--t-accent)', borderRadius:2, opacity:.7 }} />
                              </div>
                              <span style={{ fontSize:11, color:'var(--t-text-faint)', width:28, textAlign:'right' }}>{pct}%</span>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>

            {/* Cleanup tools — real eligible counts + real audited deletes */}
            <div style={{ background:'var(--t-surface)', border:'1px solid var(--t-line)', padding:'16px 18px' }}>
              <div style={{ fontSize:11, fontWeight:700, color:'var(--t-text-muted)', textTransform:'uppercase', letterSpacing:'.08em', marginBottom:6 }}>Cleanup Tools</div>
              <div style={{ fontSize:11, color:'var(--t-text-faint)', marginBottom:14 }}>Removes only disposable records (resolved incidents, old alert dismissals). Business/HR data is never touched.</div>
              <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                {cleanup.map(task => (
                  <div key={task.task} style={{ display:'flex', alignItems:'center', gap:14, padding:'12px 14px', background:'var(--t-bg)', border:'1px solid var(--t-line)' }}>
                    <div style={{ flex:1 }}>
                      <div style={{ fontWeight:700, fontSize:13, color:'var(--t-text)', marginBottom:2 }}>{task.label}</div>
                      <div style={{ fontSize:11, color:'var(--t-text-muted)' }}>{task.desc}</div>
                      <div style={{ fontSize:11, color:'var(--t-text-faint)', marginTop:3 }}>{fmtNum(task.rows)} eligible record(s)</div>
                    </div>
                    {task.rows > 0 ? (
                      <button
                        onClick={() => runCleanup(task)}
                        disabled={!!cleanupBusy[task.task]}
                        style={{ display:'flex', alignItems:'center', gap:6, padding:'8px 14px', background:cleanupBusy[task.task]?'var(--t-surface-2)':'var(--t-warn)', color:cleanupBusy[task.task]?'var(--t-text-muted)':'#000', border:'none', fontWeight:700, fontSize:12, cursor:cleanupBusy[task.task]?'not-allowed':'pointer', flexShrink:0 }}>
                        {cleanupBusy[task.task] ? <><Spinner size={12}/> Running…</> : 'Run'}
                      </button>
                    ) : (
                      <span style={{ fontSize:12, fontWeight:600, color:'var(--t-text-faint)', whiteSpace:'nowrap' }}>Nothing to clean</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* RIGHT — real snapshot facts */}
          <div style={{ display:'flex', flexDirection:'column', gap:14, position:'sticky', top:20 }}>
            <div style={{ background:'var(--t-surface)', border:'1px solid var(--t-line)', padding:'16px 18px' }}>
              <div style={{ fontSize:11, fontWeight:700, color:'var(--t-text-muted)', textTransform:'uppercase', letterSpacing:'.08em', marginBottom:16 }}>Database Snapshot</div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:16 }}>
                {[
                  ['Total Size',   fmtBytes(totalBytes)],
                  ['Total Rows',   fmtNum(totalRows)],
                  ['Tables',       fmtNum(tableCount)],
                  ['Last Activity',timeAgo(lastEventAt)],
                ].map(([l,v]) => (
                  <div key={l} style={{ padding:'8px 10px', background:'var(--t-bg)', border:'1px solid var(--t-line)' }}>
                    <div style={{ fontSize:9, fontWeight:700, color:'var(--t-text-muted)', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:3 }}>{l}</div>
                    <div style={{ fontSize:13, fontWeight:700, color:'var(--t-text)' }}>{v}</div>
                  </div>
                ))}
              </div>
              <div style={{ padding:'10px 12px', background:'var(--t-bg)', border:'1px solid var(--t-line)', fontSize:11, color:'var(--t-text-muted)', lineHeight:1.6, marginBottom:12 }}>
                Automated database backups are managed by the platform. Use the export below for an on-demand storage report.
              </div>
              <button onClick={exportStorage}
                style={{ width:'100%', padding:'11px 0', background:'var(--t-accent)', color:'#000', border:'none', fontWeight:800, fontSize:13, cursor:'pointer', letterSpacing:'.3px' }}>
                Export Storage Report (CSV)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── TAB: AUDIT & LOGS ─────────────────────────────────────────── */}
      {tab === 'audit' && (
        <div>
          {/* Filter bar */}
          <div style={{ display:'grid', gridTemplateColumns:'auto 1fr auto auto', gap:10, marginBottom:16, alignItems:'center' }}>
            <select value={logFilter.action} onChange={e=>setLF(f=>({...f,action:e.target.value}))}
              style={{ padding:'9px 11px', background:'var(--t-bg)', border:'1px solid var(--t-line)', color:'var(--t-text)', fontSize:13, outline:'none' }}>
              <option value="">All Actions</option>
              {actionOptions.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
            <input value={logFilter.user} onChange={e=>setLF(f=>({...f,user:e.target.value}))} placeholder="Filter by user…"
              style={{ padding:'9px 11px', background:'var(--t-bg)', border:'1px solid var(--t-line)', color:'var(--t-text)', fontSize:13, outline:'none' }} />
            <input type="date" value={logFilter.date} onChange={e=>setLF(f=>({...f,date:e.target.value}))}
              style={{ padding:'9px 11px', background:'var(--t-bg)', border:'1px solid var(--t-line)', color:'var(--t-text)', fontSize:13, outline:'none' }} />
            <button onClick={exportLogs}
              style={{ padding:'9px 18px', background:'var(--t-accent)', color:'#000', border:'none', fontWeight:700, fontSize:13, cursor:'pointer', whiteSpace:'nowrap' }}>
              Export CSV
            </button>
          </div>

          <div style={{ fontSize:12, color:'var(--t-text-muted)', marginBottom:10 }}>
            Showing {filteredLog.length} of {auditRows.length} events
          </div>

          {/* Log table */}
          <div style={{ border:'1px solid var(--t-line)', marginBottom:20 }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
              <thead>
                <tr style={{ borderBottom:'1px solid var(--t-line)', background:'var(--t-surface)' }}>
                  {['Timestamp','User','Role','Action','Target','Result'].map(h => (
                    <th key={h} style={{ padding:'10px 12px', textAlign:'left', fontSize:10, fontWeight:700, color:'var(--t-text-muted)', textTransform:'uppercase', letterSpacing:'.06em', whiteSpace:'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredLog.length === 0 ? (
                  <tr><td colSpan={6} style={{ padding:'30px', textAlign:'center', color:'var(--t-text-muted)', fontSize:13 }}>No audit events recorded</td></tr>
                ) : filteredLog.map(e => (
                  <tr key={e.id} style={{ borderBottom:'1px solid var(--t-line)' }}>
                    <td style={{ padding:'9px 12px', color:'var(--t-text-faint)', fontFamily:'monospace', fontSize:11, whiteSpace:'nowrap' }}>{fmtDate(e.created_at)}</td>
                    <td style={{ padding:'9px 12px', color:'var(--t-text)', fontWeight:600 }}>{e.actor_name || '—'}</td>
                    <td style={{ padding:'9px 12px', color:'var(--t-text-muted)' }}>{e.actor_role || '—'}</td>
                    <td style={{ padding:'9px 12px', color:'var(--t-text)' }}>{e.action || '—'}</td>
                    <td style={{ padding:'9px 12px', color:'var(--t-text-muted)', maxWidth:220, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', fontFamily:'monospace', fontSize:11 }}>{e.target || '—'}</td>
                    <td style={{ padding:'9px 12px' }}>
                      <span style={{ padding:'2px 8px', fontSize:10, fontWeight:700, color:resultColor(e.result), border:`1px solid ${resultColor(e.result)}44`, background:`${resultColor(e.result)}18` }}>
                        {e.result || 'Success'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Security events — real, from the audit feed */}
          <div style={{ background:'var(--t-surface)', border:'1px solid var(--t-line)', padding:'16px 18px' }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14 }}>
              <div style={{ fontSize:11, fontWeight:700, color:'var(--t-text-muted)', textTransform:'uppercase', letterSpacing:'.08em' }}>Security Events (24h)</div>
              {securityFeed.some(a=>alertSeverity(a)==='high') && (
                <span style={{ fontSize:11, fontWeight:700, padding:'3px 10px', background:'rgba(255,61,61,.12)', color:'var(--t-danger)', border:'1px solid rgba(255,61,61,.3)' }}>
                  {securityFeed.filter(a=>alertSeverity(a)==='high').length} High Priority
                </span>
              )}
            </div>
            {securityFeed.length === 0 ? (
              <div style={{ textAlign:'center', padding:'24px', color:'var(--t-text-muted)', fontSize:13 }}>No flagged security events in the last 24 hours</div>
            ) : securityFeed.map(alert => {
              const sev = alertSeverity(alert)
              const col = sev==='high'?'var(--t-danger)':sev==='medium'?'var(--t-warn)':'var(--t-accent)'
              return (
                <div key={alert.id} style={{ display:'flex', alignItems:'flex-start', gap:12, padding:'10px 12px', background:`${col}08`, border:`1px solid ${col}33`, marginBottom:8 }}>
                  <div style={{ width:8, height:8, borderRadius:'50%', background:col, marginTop:4, flexShrink:0, boxShadow:`0 0 6px ${col}` }} />
                  <div style={{ flex:1 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:2, flexWrap:'wrap' }}>
                      <span style={{ fontSize:11, fontWeight:700, color:col, textTransform:'uppercase', letterSpacing:'.06em' }}>{sev}</span>
                      <span style={{ fontSize:10, color:'var(--t-text-faint)' }}>{timeAgo(alert.ts)}</span>
                    </div>
                    <div style={{ fontSize:12, color:'var(--t-text)', lineHeight:1.5 }}>
                      {alert.action}{alert.result && alert.result.toLowerCase()!=='success' ? ` — ${alert.result}` : ''}
                      {alert.actor_name ? ` · ${alert.actor_name}` : ''}{alert.target ? ` · ${alert.target}` : ''}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* CONFIRM MODAL */}
      {confirm && <ConfirmModal msg={confirm.msg} onOk={confirm.onOk} onCancel={()=>setConfirm(null)} />}

      {/* TOAST */}
      {toast && (
        <div style={{ position:'fixed', bottom:24, right:24, background:'var(--t-success)', color:'#fff', padding:'12px 20px', fontWeight:700, fontSize:13, zIndex:99999, boxShadow:'0 8px 24px rgba(0,0,0,.25)', animation:'fadeUp .25s ease' }}>
          ✓ {toast}
        </div>
      )}

      <style>{`
        @keyframes spin    { to { transform:rotate(360deg) } }
        @keyframes fadeUp  { from{transform:translateY(12px);opacity:0} to{transform:translateY(0);opacity:1} }
      `}</style>
    </div>
  )
}
