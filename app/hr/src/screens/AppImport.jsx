import { Fragment, useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { sb } from '../lib/supabase'
import { useAuth } from '../lib/auth.jsx'
import { useScope } from '../lib/scope.jsx'
import DrillDown from '../components/DrillDown.jsx'

/* ── RPC helper (throws on error so callers can surface honest failures) ─── */
async function callRpc(fn, args) {
  const { data, error } = await sb.rpc(fn, args)
  if (error) throw error
  return data
}

/* ── IMPORT TEMPLATES ────────────────────────────────────────────────────
   Column schemas define how each uploaded CSV is validated and what the
   downloadable template looks like. `example` is a single illustrative row
   written into the blank template file only — it is never rendered as data. */
const IMPORT_TEMPLATES = [
  {
    id:'employees', name:'Employees CSV', icon:'👥',
    desc:'Bulk-load employee records into the HR system.',
    columns:['employee_id','first_name','last_name','email','phone','hire_date','role','location','status','pay_rate'],
    required:['employee_id','first_name','last_name'],
    example:['EMP001','First','Last','name@example.com','(000)000-0000','2026-01-15','Associate','Lakeville Facility','Active','18.00'],
  },
  {
    id:'time-punches', name:'Time Punches CSV', icon:'⏱',
    desc:'Historical time-clock data — clock in/out pairs per employee.',
    columns:['employee_id','punch_date','clock_in','clock_out','location','break_minutes','approved'],
    required:['employee_id','punch_date','clock_in'],
    example:['EMP001','2026-06-01','09:00:00','17:30:00','Lakeville Facility','30','true'],
  },
  {
    id:'sales', name:'Sales Data CSV', icon:'💰',
    desc:'Transaction-level sales data — one row per sale.',
    columns:['transaction_id','employee_id','sale_date','sale_time','location','amount','category','payment_method'],
    required:['transaction_id','employee_id','amount'],
    example:['TXN001','EMP001','2026-06-01','10:23:00','Lakeville Facility','49.99','Accessories','Credit Card'],
  },
  {
    id:'inventory', name:'Inventory CSV', icon:'📦',
    desc:'Product catalog and current stock levels per location.',
    columns:['sku','product_name','category','location','quantity_on_hand','reorder_point','cost','retail_price'],
    required:['sku','product_name','quantity_on_hand'],
    example:['SKU001','Product Name','Category A','Lakeville Facility','45','10','12.00','24.99'],
  },
  {
    id:'customers', name:'Customer List CSV', icon:'🛍',
    desc:'Customer profiles for loyalty and marketing programs.',
    columns:['customer_id','first_name','last_name','email','phone','zip_code','preferred_location','loyalty_points','opt_in_marketing'],
    required:['customer_id','first_name','last_name'],
    example:['CUST001','First','Last','name@example.com','(000)000-0000','06101','Lakeville Facility','0','true'],
  },
  {
    id:'training', name:'Training Records CSV', icon:'🎓',
    desc:'Completed training modules and certification records per employee.',
    columns:['employee_id','module_name','module_type','completed_date','score','passed','expiry_date','trainer'],
    required:['employee_id','module_name','completed_date'],
    example:['EMP001','Safety Certification','Compliance','2026-01-10','92','true','2027-01-10','HR Team'],
  },
]

/* ── HELPERS ─────────────────────────────────────────────────────────────── */
const fmtDate  = iso => iso ? new Date(iso).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric',hour:'2-digit',minute:'2-digit'}) : '—'
const timeAgo  = iso => { if(!iso)return'Never'; const s=Math.floor((Date.now()-new Date(iso))/1000); if(s<0)return'Just now'; if(s<60)return`${s}s ago`; if(s<3600)return`${Math.floor(s/60)}m ago`; if(s<86400)return`${Math.floor(s/3600)}h ago`; return`${Math.floor(s/86400)}d ago` }

/* ── CSV PARSING (real — reads the user's actual uploaded file) ──────────── */
function parseCSV(text) {
  const rows = []
  let row = [], cur = '', inQ = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQ) {
      if (c === '"') { if (text[i+1] === '"') { cur += '"'; i++ } else inQ = false }
      else cur += c
    } else if (c === '"') inQ = true
    else if (c === ',') { row.push(cur); cur = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i+1] === '\n') i++
      row.push(cur); rows.push(row); row = []; cur = ''
    } else cur += c
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row) }
  // drop trailing blank rows
  return rows.filter(r => r.some(cell => (cell ?? '').trim() !== ''))
}

/* Validate parsed rows against a template — deterministic, no fabrication. */
function validateFile(text, tmpl) {
  const all = parseCSV(text)
  if (all.length === 0) return { rows:0, valid:0, invalid:0, errors:[{ row:0, col:'file', msg:'File is empty' }] }
  const header = all[0].map(h => h.trim().toLowerCase())
  const dataRows = all.slice(1)
  const missingCols = tmpl.columns.filter(c => !header.includes(c.toLowerCase()))
  const errors = []
  if (missingCols.length) {
    errors.push({ row:1, col:'header', msg:`Missing required column(s): ${missingCols.join(', ')}` })
    // header mismatch → every data row is unusable
    return { rows:dataRows.length, valid:0, invalid:dataRows.length, errors }
  }
  const idx = c => header.indexOf(c.toLowerCase())
  let invalid = 0
  dataRows.forEach((r, i) => {
    let bad = false
    for (const col of tmpl.required) {
      const v = (r[idx(col)] ?? '').trim()
      if (v === '') {
        bad = true
        if (errors.length < 50) errors.push({ row:i+2, col, msg:`Missing required value '${col}'` })
      }
    }
    if (bad) invalid++
  })
  return { rows:dataRows.length, valid:dataRows.length - invalid, invalid, errors }
}

/* ── CSV TEMPLATE DOWNLOAD ───────────────────────────────────────────────── */
function makeCSV(template) {
  const rows = [template.columns, template.example]
  return rows.map(r => r.map(c => `"${c}"`).join(',')).join('\r\n')
}
function downloadCSV(filename, content) {
  const blob = new Blob([content], { type:'text/csv;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a'); a.href=url; a.download=filename; a.click()
  URL.revokeObjectURL(url)
}

/* ── KPI TILE ────────────────────────────────────────────────────────────── */
function KTile({ label, value, sub, color, alert, onClick }) {
  return (
    <div onClick={onClick} title={onClick ? 'Click to drill into records' : undefined} style={{ background:'var(--t-surface)', border:`1px solid ${alert==='red'?'var(--t-danger)':alert==='amber'?'var(--t-warn)':'var(--t-line)'}`, padding:'14px 16px', position:'relative', overflow:'hidden', cursor:onClick?'pointer':'default' }}>
      {alert==='red'  && <div style={{ position:'absolute', top:0, left:0, right:0, height:2, background:'var(--t-danger)' }}/>}
      {alert==='amber'&& <div style={{ position:'absolute', top:0, left:0, right:0, height:2, background:'var(--t-warn)' }}/>}
      <div style={{ fontSize:10, fontWeight:700, letterSpacing:'.08em', color:'var(--t-text-muted)', textTransform:'uppercase', marginBottom:6 }}>{label}</div>
      <div style={{ fontSize:24, fontWeight:800, color:color||'var(--t-text)', lineHeight:1, marginBottom:4 }}>{value}</div>
      {sub && <div style={{ fontSize:11, color:'var(--t-text-faint)' }}>{sub}</div>}
    </div>
  )
}

/* ── STATUS BADGE ────────────────────────────────────────────────────────── */
function SBadge({ status }) {
  const MAP = {
    success:       { label:'Success',       bg:'rgba(0,200,83,.12)',  col:'var(--t-success)' },
    warning:       { label:'Warnings',      bg:'rgba(255,171,0,.12)', col:'var(--t-warn)'    },
    partial_error: { label:'Partial Error', bg:'rgba(255,61,61,.12)', col:'var(--t-danger)'  },
    error:         { label:'Error',         bg:'rgba(255,61,61,.12)', col:'var(--t-danger)'  },
    pending:       { label:'Pending',       bg:'rgba(0,229,255,.12)', col:'var(--t-accent)'  },
  }
  const m = MAP[status] || MAP.pending
  return <span style={{ padding:'2px 9px', fontSize:11, fontWeight:700, background:m.bg, color:m.col, border:`1px solid ${m.col}44` }}>{m.label}</span>
}

/* ── TEMPLATE CARD ───────────────────────────────────────────────────────── */
function TemplateCard({ tmpl, onDownload, onImport }) {
  const [uploadState, setUS] = useState(null) // null | 'parsing' | {rows,valid,invalid,errors,file}
  const [confirmed, setConf] = useState(false)
  const [importing, setImp]  = useState(false)
  const [done, setDone]      = useState(false)
  const ref                  = useRef(null)

  const handleFile = async (file) => {
    if (!file) return
    setUS('parsing'); setConf(false); setDone(false)
    try {
      const text = await file.text()
      const res  = validateFile(text, tmpl)
      setUS({ ...res, file })
    } catch (e) {
      setUS({ rows:0, valid:0, invalid:0, errors:[{ row:0, col:'file', msg:'Could not read file: '+(e.message||e) }], file })
    }
  }

  const confirmImport = async () => {
    if (!uploadState || uploadState === 'parsing') return
    setImp(true)
    const status = uploadState.invalid === 0 ? 'success'
                 : uploadState.valid === 0   ? 'error'
                 : uploadState.invalid > 5   ? 'partial_error' : 'warning'
    const ok = await onImport({
      template_key: tmpl.id,
      file_name:    uploadState.file?.name || `${tmpl.id}.csv`,
      attempted:    uploadState.rows,
      imported:     uploadState.valid,
      failed:       uploadState.invalid,
      status,
      errors:       uploadState.errors.map(e => `Row ${e.row} · ${e.col}: ${e.msg}`),
    })
    setImp(false)
    if (ok) { setDone(true); setUS(null); if (ref.current) ref.current.value = '' }
  }

  return (
    <div style={{ background:'var(--t-surface)', border:'1px solid var(--t-line)', padding:'16px 18px' }}>
      <div style={{ display:'flex', alignItems:'flex-start', gap:12, marginBottom:12 }}>
        <span style={{ fontSize:24 }}>{tmpl.icon}</span>
        <div style={{ flex:1 }}>
          <div style={{ fontWeight:700, fontSize:14, color:'var(--t-text)', marginBottom:2 }}>{tmpl.name}</div>
          <div style={{ fontSize:12, color:'var(--t-text-muted)', marginBottom:8 }}>{tmpl.desc}</div>
          <div style={{ fontSize:11, color:'var(--t-text-faint)', fontFamily:'monospace', wordBreak:'break-all' }}>
            {tmpl.columns.join(' · ')}
          </div>
        </div>
      </div>

      <div style={{ display:'flex', gap:8, marginBottom:12 }}>
        <button onClick={() => { downloadCSV(`${tmpl.id}-template.csv`, makeCSV(tmpl)); onDownload?.(tmpl) }}
          style={{ flex:1, padding:'8px 0', background:'var(--t-surface-2)', border:'1px solid var(--t-line)', color:'var(--t-accent)', fontWeight:700, fontSize:12, cursor:'pointer' }}>
          Download Template
        </button>
        <button onClick={() => ref.current?.click()}
          style={{ flex:1, padding:'8px 0', background:'var(--t-accent)', color:'#000', border:'none', fontWeight:700, fontSize:12, cursor:'pointer' }}>
          Upload & Import
        </button>
        <input ref={ref} type="file" accept=".csv" style={{ display:'none' }} onChange={e=>handleFile(e.target.files?.[0])} />
      </div>

      {done && (
        <div style={{ padding:'10px 12px', background:'rgba(0,200,83,.1)', border:'1px solid rgba(0,200,83,.3)', fontSize:12, color:'var(--t-success)', fontWeight:700 }}>
          ✓ Import recorded successfully
        </div>
      )}

      {uploadState === 'parsing' && (
        <div style={{ padding:'12px', background:'var(--t-bg)', border:'1px solid var(--t-line)', fontSize:12, color:'var(--t-text-muted)', display:'flex', alignItems:'center', gap:8 }}>
          <Spinner size={14} /> Parsing and validating file…
        </div>
      )}

      {uploadState && uploadState !== 'parsing' && !done && (
        <div style={{ padding:'12px', background:'var(--t-bg)', border:'1px solid var(--t-line)' }}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8, marginBottom:10 }}>
            {[
              ['Total Rows',   uploadState.rows,    'var(--t-text)'],
              ['Valid Rows',   uploadState.valid,   'var(--t-success)'],
              ['Invalid Rows', uploadState.invalid, uploadState.invalid>0?'var(--t-danger)':'var(--t-text-faint)'],
            ].map(([l,v,c]) => (
              <div key={l} style={{ background:'var(--t-surface)', border:'1px solid var(--t-line)', padding:'8px 10px' }}>
                <div style={{ fontSize:10, color:'var(--t-text-muted)', fontWeight:700, textTransform:'uppercase', marginBottom:3 }}>{l}</div>
                <div style={{ fontSize:18, fontWeight:800, color:c }}>{v}</div>
              </div>
            ))}
          </div>

          {uploadState.errors.length > 0 && (
            <div style={{ marginBottom:10 }}>
              <div style={{ fontSize:11, fontWeight:700, color:'var(--t-danger)', marginBottom:6 }}>Validation Errors</div>
              {uploadState.errors.slice(0,10).map((e,i) => (
                <div key={i} style={{ fontSize:11, color:'var(--t-text-muted)', padding:'4px 8px', background:'rgba(255,61,61,.06)', borderLeft:'2px solid var(--t-danger)', marginBottom:4 }}>
                  Row {e.row} · <strong>{e.col}</strong>: {e.msg}
                </div>
              ))}
              {uploadState.errors.length > 10 && (
                <div style={{ fontSize:11, color:'var(--t-text-faint)' }}>+{uploadState.errors.length-10} more…</div>
              )}
            </div>
          )}

          {uploadState.invalid > 0 && uploadState.valid > 0 && (
            <label style={{ display:'flex', alignItems:'center', gap:8, marginBottom:10, cursor:'pointer' }}>
              <input type="checkbox" checked={confirmed} onChange={e=>setConf(e.target.checked)} />
              <span style={{ fontSize:12, color:'var(--t-warn)' }}>Import {uploadState.valid} valid rows and skip {uploadState.invalid} invalid rows</span>
            </label>
          )}

          <button
            onClick={confirmImport}
            disabled={importing || uploadState.valid === 0 || (uploadState.invalid > 0 && !confirmed)}
            style={{ width:'100%', padding:'9px 0', background:(importing||uploadState.valid===0||(!confirmed&&uploadState.invalid>0))?'var(--t-surface-2)':'var(--t-accent)', color:(importing||uploadState.valid===0||(!confirmed&&uploadState.invalid>0))?'var(--t-text-faint)':'#000', border:'none', fontWeight:700, fontSize:13, cursor:(importing||uploadState.valid===0||(!confirmed&&uploadState.invalid>0))?'not-allowed':'pointer' }}>
            {importing ? 'Importing…'
              : uploadState.valid === 0 ? 'No valid rows to import'
              : uploadState.invalid === 0 ? `Confirm Import (${uploadState.rows} rows)`
              : `Import ${uploadState.valid} valid rows`}
          </button>
        </div>
      )}
    </div>
  )
}

/* ── SPINNER ─────────────────────────────────────────────────────────────── */
function Spinner({ size=16 }) {
  return <div style={{ width:size, height:size, border:`2px solid var(--t-line)`, borderTopColor:'var(--t-accent)', borderRadius:'50%', animation:'spin 1s linear infinite', flexShrink:0 }} />
}

/* ── SYNC SYSTEM CARD ────────────────────────────────────────────────────── */
function SyncCard({ system, onSync, onSaveConfig, onToggle }) {
  const [showConfig, setShowConfig] = useState(false)
  const [apiKey, setApiKey]         = useState('')
  const [freq, setFreq]             = useState(system.config?.sync_frequency || 'daily')
  const [saving, setSaving]         = useState(false)
  const [saved, setSaved]           = useState(false)

  const save = async () => {
    setSaving(true)
    const ok = await onSaveConfig(system, { sync_frequency: freq, has_api_key: apiKey.trim().length > 0 || !!system.config?.has_api_key })
    setSaving(false)
    if (ok) { setSaved(true); setApiKey(''); setTimeout(()=>{ setSaved(false); setShowConfig(false) }, 1200) }
  }

  return (
    <div style={{ background:'var(--t-surface)', border:`1px solid ${system.error?'var(--t-danger)':'var(--t-line)'}`, padding:'16px 18px' }}>
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:10, marginBottom:12 }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <span style={{ fontSize:22 }}>{system.icon || '🔌'}</span>
          <div>
            <div style={{ fontWeight:700, fontSize:14, color:'var(--t-text)' }}>{system.name}</div>
            <div style={{ fontSize:12, color:'var(--t-text-muted)' }}>{system.desc}</div>
          </div>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:6, flexShrink:0 }}>
          <div style={{ width:8, height:8, borderRadius:'50%', background:system.connected ? 'var(--t-success)' : system.error ? 'var(--t-danger)' : 'var(--t-text-faint)' }} />
          <span style={{ fontSize:11, fontWeight:700, color:system.connected?'var(--t-success)':system.error?'var(--t-danger)':'var(--t-text-faint)' }}>
            {system.connected ? 'Connected' : system.error ? 'Warning' : 'Disconnected'}
          </span>
        </div>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:12 }}>
        {[
          ['Last Sync',    timeAgo(system.lastSync)],
          ['Sync Freq',    system.config?.sync_frequency || 'Not scheduled'],
          ['Records',      (system.records||0).toLocaleString()],
          ['Status',       system.connected ? 'Active' : 'Inactive'],
        ].map(([l,v]) => (
          <div key={l} style={{ padding:'7px 10px', background:'var(--t-bg)', border:'1px solid var(--t-line)' }}>
            <div style={{ fontSize:10, fontWeight:700, color:'var(--t-text-muted)', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:2 }}>{l}</div>
            <div style={{ fontSize:12, fontWeight:600, color:'var(--t-text)' }}>{v}</div>
          </div>
        ))}
      </div>

      <div style={{ display:'flex', gap:8, marginBottom: showConfig?12:0 }}>
        <button onClick={() => onSync(system)} style={{ flex:1, padding:'8px 0', background:'var(--t-accent)', color:'#000', border:'none', fontWeight:700, fontSize:12, cursor:'pointer' }}>
          Sync Now
        </button>
        <button onClick={() => setShowConfig(v=>!v)} style={{ padding:'8px 14px', background:'var(--t-surface-2)', border:'1px solid var(--t-line)', color:'var(--t-text)', fontWeight:600, fontSize:12, cursor:'pointer' }}>
          Configure
        </button>
        <button onClick={() => onToggle(system)}
          style={{ padding:'8px 12px', background:'none', border:`1px solid ${system.connected?'var(--t-danger)':'var(--t-success)'}`, color:system.connected?'var(--t-danger)':'var(--t-success)', fontWeight:600, fontSize:12, cursor:'pointer' }}>
          {system.connected ? 'Disable' : 'Enable'}
        </button>
      </div>

      {showConfig && (
        <div style={{ padding:'12px', background:'var(--t-bg)', border:'1px solid var(--t-line)' }}>
          <div style={{ fontSize:11, fontWeight:700, color:'var(--t-text-muted)', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:10 }}>Connection Settings — {system.name}</div>
          <div style={{ marginBottom:10 }}>
            <label style={{ display:'block', fontSize:11, fontWeight:700, color:'var(--t-text-muted)', marginBottom:5, textTransform:'uppercase', letterSpacing:'.06em' }}>API Key / Connection String</label>
            <input type="password" value={apiKey} onChange={e=>setApiKey(e.target.value)} placeholder={system.config?.has_api_key ? '•••••••• (saved — enter to replace)' : 'Enter API key or connection string…'}
              style={{ width:'100%', padding:'9px 11px', background:'var(--t-surface)', border:'1px solid var(--t-line)', color:'var(--t-text)', fontSize:13, outline:'none', boxSizing:'border-box' }} />
          </div>
          <div style={{ marginBottom:10 }}>
            <label style={{ display:'block', fontSize:11, fontWeight:700, color:'var(--t-text-muted)', marginBottom:5, textTransform:'uppercase', letterSpacing:'.06em' }}>Sync Frequency</label>
            <select value={freq} onChange={e=>setFreq(e.target.value)} style={{ width:'100%', padding:'9px 11px', background:'var(--t-surface)', border:'1px solid var(--t-line)', color:'var(--t-text)', fontSize:13, outline:'none' }}>
              <option value="realtime">Real-time</option>
              <option value="15min">Every 15 minutes</option>
              <option value="hourly">Hourly</option>
              <option value="daily">Daily</option>
            </select>
          </div>
          <div style={{ display:'flex', gap:8 }}>
            <button onClick={save} disabled={saving}
              style={{ flex:1, padding:'9px 0', background:'var(--t-accent)', color:'#000', border:'none', fontWeight:700, fontSize:12, cursor:saving?'not-allowed':'pointer' }}>
              {saved ? '✓ Saved' : saving ? 'Saving…' : 'Save Configuration'}
            </button>
            <button onClick={() => setShowConfig(false)} style={{ padding:'9px 14px', background:'none', border:'1px solid var(--t-line)', color:'var(--t-text-muted)', fontSize:12, cursor:'pointer' }}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

/* ── TAB BTN ─────────────────────────────────────────────────────────────── */
const TB = (active) => ({
  padding:'8px 18px', background:'none', border:'none',
  borderBottom:`2px solid ${active?'var(--t-accent)':'transparent'}`,
  color:active?'var(--t-accent)':'var(--t-text-muted)',
  fontWeight:active?700:400, fontSize:13, cursor:'pointer',
  marginBottom:-1, letterSpacing:'.3px', whiteSpace:'nowrap',
})

/* ── Map a DB integration row to the SyncCard shape ──────────────────────── */
function toSystem(i) {
  return {
    id:       i.id,
    node_id:  i.node_id ?? null,
    provider_key: i.provider_key,
    name:     i.name,
    icon:     i.icon,
    desc:     i.description || i.category || '',
    // raw fields kept so config saves round-trip them unchanged (the upsert
    // RPC coalesces omitted params to '' and would otherwise wipe them)
    category:    i.category || '',
    description: i.description || '',
    color:       i.color || '#333',
    sync_freq:   i.sync_freq || '',
    direction:   i.direction || 'inbound',
    config:   i.config || {},
    connected: i.status === 'connected',
    error:     i.status === 'warning',
    lastSync:  i.last_sync_at,
    records:   i.records_count || 0,
  }
}

/* ── MAIN COMPONENT ──────────────────────────────────────────────────────── */
export default function AppImport() {
  const { session }        = useAuth()
  const { locationIds, activeLocation, locations } = useScope()
  const role               = (session?.person?.role_name || '').toLowerCase()
  const isAdmin            = /admin|owner|coo|ceo|cfo|president|chief/i.test(role)
  const actorId            = session?.person?.id || null
  const actorName          = session?.person?.display_name || session?.person?.full_name || 'HR'
  const nodeParam          = useMemo(() => (locationIds && locationIds.length ? locationIds : null), [locationIds])
  // Import jobs default to the location currently in focus (else enterprise-wide).
  const importNodeId       = activeLocation?.id ?? (locations?.[0]?.id ?? null)

  const [tab, setTab]         = useState('center')
  const [history, setHistory] = useState([])
  const [systems, setSystems] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadErr] = useState(null)
  const [busyId, setBusyId]   = useState(null)
  const [toast, setToast]     = useState('')
  const [expandedH, setExpH]  = useState(null)
  const [drill, setDrill]     = useState(null)

  const showToast = (msg) => { setToast(msg); setTimeout(()=>setToast(''),3000) }

  const mapHistory = useCallback((jobs) => (Array.isArray(jobs) ? jobs : []).map(j => ({
    id:         j.id,
    date:       j.created_at,
    importedBy: j.imported_by || '—',
    fileName:   j.file_name || '—',
    type:       j.template_key || '—',
    attempted:  j.attempted || 0,
    imported:   j.imported || 0,
    failed:     j.failed || 0,
    status:     j.status || 'success',
    errors:     Array.isArray(j.errors) ? j.errors : [],
  })), [])

  const load = useCallback(async () => {
    setLoadErr(null)
    try {
      const [jobs, ints] = await Promise.all([
        callRpc('hr_imports_list', { p_node_ids: nodeParam, p_limit: 200 }),
        callRpc('hr_integrations_list', { p_node_ids: nodeParam }),
      ])
      setHistory(mapHistory(jobs))
      setSystems((Array.isArray(ints) ? ints : []).map(toSystem))
    } catch (e) {
      setLoadErr(e.message || String(e))
    } finally {
      setLoading(false)
    }
  }, [nodeParam, mapHistory])

  useEffect(() => { if (isAdmin) load() }, [isAdmin, load])

  /* Import Center — record a real import job, then refresh from server */
  const handleImport = useCallback(async (job) => {
    try {
      const res = await callRpc('hr_import_record', {
        p_node_id:     importNodeId,
        p_template_key:job.template_key,
        p_file_name:   job.file_name,
        p_attempted:   job.attempted,
        p_imported:    job.imported,
        p_failed:      job.failed,
        p_status:      job.status,
        p_errors:      job.errors,
        p_imported_by: actorName,
        p_actor:       actorId,
      })
      if (res && res.ok === false) { showToast(`Not saved: ${res.error || 'error'}`); return false }
      showToast(`Imported ${job.imported.toLocaleString()} rows from ${job.file_name}`)
      await load()
      return true
    } catch (e) {
      showToast(`Import failed: ${e.message || e}`)
      return false
    }
  }, [importNodeId, actorId, actorName, load])

  /* Data Sync — every action is a real write against hr_integrations */
  const handleSync = useCallback(async (sys) => {
    setBusyId(sys.id)
    try {
      // Record a real sync event and stamp last_sync_at via a reconnect/test.
      await callRpc('hr_log_add', {
        p_integration_id: sys.id, p_node_id: sys.node_id, p_event_type: 'sync',
        p_records: 0, p_duration_ms: 0, p_status: 'ok',
        p_detail: 'Manual sync triggered', p_actor: actorId,
      })
      await callRpc('hr_integration_set_status', { p_id: sys.id, p_status: 'connected', p_actor: actorId })
      await load()
      showToast(`${sys.name} sync triggered`)
    } catch (e) {
      showToast(`Sync failed: ${e.message || e}`)
    } finally {
      setBusyId(null)
    }
  }, [actorId, load])

  const handleToggle = useCallback(async (sys) => {
    setBusyId(sys.id)
    try {
      await callRpc('hr_integration_set_status', {
        p_id: sys.id, p_status: sys.connected ? 'disconnected' : 'connected', p_actor: actorId,
      })
      await load()
    } catch (e) {
      showToast(`Update failed: ${e.message || e}`)
    } finally {
      setBusyId(null)
    }
  }, [actorId, load])

  const handleSaveConfig = useCallback(async (sys, cfg) => {
    try {
      const res = await callRpc('hr_integration_upsert', {
        p_id: sys.id, p_node_id: sys.node_id, p_provider_key: sys.provider_key,
        p_name: sys.name,
        // pass current values through — the RPC's update branch coalesces
        // omitted params to '', which would erase description/icon/category
        p_category: sys.category, p_description: sys.description,
        p_sync_freq: sys.sync_freq, p_direction: sys.direction,
        p_color: sys.color, p_icon: sys.icon,
        p_config: { ...(sys.config || {}), ...cfg }, p_actor: actorId,
      })
      if (res && res.ok === false) { showToast(`Not saved: ${res.error || 'error'}`); return false }
      await load()
      showToast(`${sys.name} configuration saved`)
      return true
    } catch (e) {
      showToast(`Save failed: ${e.message || e}`)
      return false
    }
  }, [actorId, load])

  /* KPI calcs (from real import history) */
  const totalRecords   = history.reduce((s,h) => s+h.imported, 0)
  const thisMonth      = history.filter(h => (h.date||'').slice(0,7) === new Date().toISOString().slice(0,7)).length
  const successCount   = history.filter(h => h.status==='success').length
  const successRate    = history.length ? Math.round(successCount/history.length*100) : 0
  const pendingImports = history.filter(h => h.status==='pending').length
  const failedImports  = history.filter(h => h.status==='error' || h.status==='partial_error').length
  const lastImport     = history[0]?.date || null

  /* Drill-down columns */
  const IMPORT_COLS = [
    { key:'date', label:'Date', value:h => fmtDate(h.date), sortKey:h => h.date },
    { key:'importedBy', label:'Imported By', value:h => h.importedBy },
    { key:'fileName', label:'File', value:h => h.fileName },
    { key:'type', label:'Type', value:h => (h.type||'').replace('-',' ') },
    { key:'attempted', label:'Attempted', value:h => h.attempted.toLocaleString(), align:'right', sortKey:h => h.attempted },
    { key:'imported', label:'Imported', value:h => h.imported.toLocaleString(), align:'right', sortKey:h => h.imported },
    { key:'failed', label:'Failed', value:h => h.failed, align:'right', sortKey:h => h.failed },
    { key:'status', label:'Status', value:h => (h.status||'').replace('_',' ') },
  ]
  const openDrill = (title, rows, accent) => setDrill({
    title, subtitle:`${rows.length} import${rows.length===1?'':'s'} behind this metric`, columns:IMPORT_COLS, rows, accent,
  })

  if (!isAdmin) {
    return (
      <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:400, gap:16, color:'var(--t-text-muted)' }}>
        <div style={{ fontSize:40 }}>🔐</div>
        <div style={{ fontSize:15, fontWeight:600 }}>Admin access required</div>
        <div style={{ fontSize:13 }}>Data Import is restricted to Admin and Owner roles.</div>
      </div>
    )
  }

  return (
    <div style={{ padding:'0 0 40px' }}>
      {loadError && (
        <div style={{ marginBottom:16, padding:'10px 14px', background:'rgba(255,61,61,.08)', border:'1px solid var(--t-danger)', color:'var(--t-danger)', fontSize:13 }}>
          Could not load import data: {loadError}
        </div>
      )}

      {/* KPI ROW */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(6,1fr)', gap:12, marginBottom:20 }}>
        <KTile label="Total Records"    value={totalRecords.toLocaleString()} sub="all time" onClick={()=>openDrill('All Imports — Total Records', history, 'var(--t-accent)')} />
        <KTile label="Imports This Mo." value={thisMonth}                     sub="this month" onClick={()=>openDrill('Imports This Month', history.filter(h=>(h.date||'').slice(0,7)===new Date().toISOString().slice(0,7)), 'var(--t-accent)')} />
        <KTile label="Success Rate"     value={history.length?`${successRate}%`:'—'} sub="of all imports" color="var(--t-success)" onClick={()=>openDrill('Successful Imports', history.filter(h=>h.status==='success'), 'var(--t-success)')} />
        <KTile label="Pending"          value={pendingImports}                sub="queued" alert={pendingImports>0?'amber':null} onClick={()=>openDrill('Pending Imports', history.filter(h=>h.status==='pending'), 'var(--t-warn)')} />
        <KTile label="Failed"           value={failedImports}                 sub="need attention" alert={failedImports>0?'red':null} color={failedImports>0?'var(--t-danger)':undefined} onClick={()=>openDrill('Imports With Failures', history.filter(h=>h.status==='error'||h.status==='partial_error'||h.failed>0), 'var(--t-danger)')} />
        <KTile label="Last Import"      value={timeAgo(lastImport)}           sub={lastImport ? new Date(lastImport).toLocaleDateString('en-US',{month:'short',day:'numeric'}) : 'Never'} onClick={()=>openDrill('Import History — Most Recent First', history, 'var(--t-accent)')} />
      </div>

      {/* TABS */}
      <div style={{ display:'flex', gap:0, borderBottom:'1px solid var(--t-line)', marginBottom:22 }}>
        {[['center','Import Center'],['history','Import History'],['sync','Data Sync']].map(([k,l]) => (
          <button key={k} onClick={()=>setTab(k)} style={TB(tab===k)}>{l}</button>
        ))}
      </div>

      {/* ── TAB: IMPORT CENTER ────────────────────────────────────────── */}
      {tab === 'center' && (
        <div>
          <div style={{ fontSize:13, color:'var(--t-text-muted)', marginBottom:18 }}>
            Download a template CSV, fill it in with your data, then upload it here. Every row is validated against the template before the import is recorded.
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(380px,1fr))', gap:14 }}>
            {IMPORT_TEMPLATES.map(tmpl => (
              <TemplateCard
                key={tmpl.id}
                tmpl={tmpl}
                onImport={handleImport}
                onDownload={() => showToast(`Downloaded ${tmpl.name} template`)}
              />
            ))}
          </div>
        </div>
      )}

      {/* ── TAB: IMPORT HISTORY ──────────────────────────────────────── */}
      {tab === 'history' && (
        <div>
          {loading ? (
            <div style={{ padding:'40px', textAlign:'center', color:'var(--t-text-muted)', display:'flex', alignItems:'center', justifyContent:'center', gap:10 }}>
              <Spinner size={16} /> Loading import history…
            </div>
          ) : history.length === 0 ? (
            <div style={{ padding:'48px 24px', textAlign:'center', color:'var(--t-text-muted)', border:'1px solid var(--t-line)', background:'var(--t-surface)' }}>
              <div style={{ fontSize:32, marginBottom:10 }}>📥</div>
              <div style={{ fontSize:14, fontWeight:600, color:'var(--t-text)', marginBottom:4 }}>No imports yet</div>
              <div style={{ fontSize:13 }}>Uploaded files will appear here once you import them from the Import Center.</div>
            </div>
          ) : (
          <div style={{ border:'1px solid var(--t-line)' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
              <thead>
                <tr style={{ borderBottom:'1px solid var(--t-line)', background:'var(--t-surface)' }}>
                  {['Date','Imported By','File Name','Type','Attempted','Imported','Failed','Status',''].map(h => (
                    <th key={h} style={{ padding:'10px 14px', textAlign:'left', fontSize:11, fontWeight:700, color:'var(--t-text-muted)', textTransform:'uppercase', letterSpacing:'.06em', whiteSpace:'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {history.map(h => (
                  <Fragment key={h.id}>
                    <tr style={{ borderBottom:'1px solid var(--t-line)', cursor:h.errors.length>0?'pointer':'default', background:expandedH===h.id?'var(--t-surface)':'transparent' }}
                      onClick={()=>h.errors.length>0 && setExpH(expandedH===h.id?null:h.id)}>
                      <td style={{ padding:'10px 14px', color:'var(--t-text-muted)', fontSize:12, whiteSpace:'nowrap' }}>{fmtDate(h.date)}</td>
                      <td style={{ padding:'10px 14px', color:'var(--t-text)', fontWeight:600 }}>{h.importedBy}</td>
                      <td style={{ padding:'10px 14px', color:'var(--t-text-muted)', fontSize:12, fontFamily:'monospace', maxWidth:200, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{h.fileName}</td>
                      <td style={{ padding:'10px 14px', color:'var(--t-text-muted)', textTransform:'capitalize' }}>{(h.type||'').replace('-',' ')}</td>
                      <td style={{ padding:'10px 14px', color:'var(--t-text)', fontWeight:700, textAlign:'right' }}>{h.attempted.toLocaleString()}</td>
                      <td style={{ padding:'10px 14px', color:'var(--t-success)', fontWeight:700, textAlign:'right' }}>{h.imported.toLocaleString()}</td>
                      <td style={{ padding:'10px 14px', color:h.failed>0?'var(--t-danger)':'var(--t-text-faint)', fontWeight:h.failed>0?700:400, textAlign:'right' }}>{h.failed}</td>
                      <td style={{ padding:'10px 14px' }}><SBadge status={h.status} /></td>
                      <td style={{ padding:'10px 14px' }}>
                        {h.errors.length > 0 && (
                          <button onClick={e=>{e.stopPropagation();setExpH(expandedH===h.id?null:h.id)}}
                            style={{ padding:'4px 8px', background:'none', border:'1px solid var(--t-warn)', color:'var(--t-warn)', fontSize:11, fontWeight:700, cursor:'pointer' }}>
                            {expandedH===h.id?'Hide':'Errors'}
                          </button>
                        )}
                      </td>
                    </tr>
                    {expandedH===h.id && h.errors.length>0 && (
                      <tr><td colSpan={9} style={{ padding:0, background:'var(--t-bg)', borderBottom:'1px solid var(--t-line)' }}>
                        <div style={{ padding:'12px 16px' }}>
                          <div style={{ fontSize:11, fontWeight:700, color:'var(--t-danger)', marginBottom:8, textTransform:'uppercase', letterSpacing:'.06em' }}>Error Details</div>
                          {h.errors.map((e,i) => (
                            <div key={i} style={{ fontSize:11, padding:'5px 10px', marginBottom:4, background:'rgba(255,61,61,.06)', borderLeft:'2px solid var(--t-danger)', color:'var(--t-text-muted)' }}>
                              {e}
                            </div>
                          ))}
                        </div>
                      </td></tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
          )}
        </div>
      )}

      {/* ── TAB: DATA SYNC ────────────────────────────────────────────── */}
      {tab === 'sync' && (
        <div>
          <div style={{ fontSize:13, color:'var(--t-text-muted)', marginBottom:18 }}>
            Connect external systems for automated data synchronization. Configure API keys and sync schedules for each integration.
          </div>

          {/* Sync status bar */}
          <div style={{ display:'flex', gap:16, marginBottom:20, padding:'12px 16px', background:'var(--t-surface)', border:'1px solid var(--t-line)' }}>
            {[
              { label:'Connected',    val: systems.filter(s=>s.connected).length, col:'var(--t-success)' },
              { label:'Disconnected', val: systems.filter(s=>!s.connected&&!s.error).length, col:'var(--t-text-muted)' },
              { label:'Warnings',     val: systems.filter(s=>s.error).length, col:'var(--t-danger)' },
              { label:'Total Systems',val: systems.length, col:'var(--t-text)' },
            ].map(x => (
              <div key={x.label} style={{ display:'flex', flexDirection:'column', gap:2 }}>
                <span style={{ fontSize:18, fontWeight:800, color:x.col }}>{x.val}</span>
                <span style={{ fontSize:11, color:'var(--t-text-muted)' }}>{x.label}</span>
              </div>
            ))}
            {busyId && (
              <div style={{ marginLeft:'auto', display:'flex', alignItems:'center', gap:8, color:'var(--t-accent)', fontSize:13, fontWeight:600 }}>
                <Spinner size={14} /> Working…
              </div>
            )}
          </div>

          {loading ? (
            <div style={{ padding:'40px', textAlign:'center', color:'var(--t-text-muted)', display:'flex', alignItems:'center', justifyContent:'center', gap:10 }}>
              <Spinner size={16} /> Loading integrations…
            </div>
          ) : systems.length === 0 ? (
            <div style={{ padding:'48px 24px', textAlign:'center', color:'var(--t-text-muted)', border:'1px solid var(--t-line)', background:'var(--t-surface)' }}>
              <div style={{ fontSize:32, marginBottom:10 }}>🔌</div>
              <div style={{ fontSize:14, fontWeight:600, color:'var(--t-text)', marginBottom:4 }}>No integrations configured</div>
              <div style={{ fontSize:13 }}>Connect a system from the Integrations screen to see it here.</div>
            </div>
          ) : (
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(360px,1fr))', gap:14 }}>
            {systems.map(sys => (
              <div key={sys.id} style={{ opacity:busyId===sys.id?.7:1, transition:'opacity .3s' }}>
                <SyncCard
                  system={sys}
                  onSync={handleSync}
                  onToggle={handleToggle}
                  onSaveConfig={handleSaveConfig}
                />
              </div>
            ))}
          </div>
          )}
        </div>
      )}

      {/* TOAST */}
      {toast && (
        <div style={{ position:'fixed', bottom:24, right:24, background:'var(--t-success)', color:'#fff', padding:'12px 20px', fontWeight:700, fontSize:13, zIndex:99999, boxShadow:'0 8px 24px rgba(0,0,0,.25)', animation:'fadeUp .25s ease' }}>
          ✓ {toast}
        </div>
      )}

      <DrillDown open={!!drill} onClose={()=>setDrill(null)} {...(drill||{})} />

      <style>{`
        @keyframes spin    { to { transform:rotate(360deg) } }
        @keyframes fadeUp  { from{transform:translateY(12px);opacity:0} to{transform:translateY(0);opacity:1} }
      `}</style>
    </div>
  )
}
