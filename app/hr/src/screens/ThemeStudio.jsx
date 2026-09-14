import { useState, useEffect, useCallback, useMemo } from 'react'
import { useAuth } from '../lib/auth.jsx'
import { sb, getSession } from '../lib/supabase'

/* ── AURORA MIDNIGHT DEFAULTS ────────────────────────────────────────── */
const AURORA_DEFAULTS = {
  '--t-bg':           '#070b14',
  '--t-surface':      '#0d1525',
  '--t-surface-2':    '#111d30',
  '--t-line':         '#1e2f4a',
  '--t-accent':       '#00e5ff',
  '--t-success':      '#00c853',
  '--t-warn':         '#ffab00',
  '--t-danger':       '#ff3d3d',
  '--t-text':         '#e8f0fe',
  '--t-text-muted':   '#7a8fa8',
  '--t-text-faint':   '#3d5166',
}

/* ── CSS TOKEN DEFINITIONS (grouped) ────────────────────────────────── */
const TOKEN_GROUPS = [
  {
    group: 'Brand',
    tokens: [
      { key:'--t-accent',  label:'Accent',  desc:'Primary brand color — buttons, links, highlights' },
      { key:'--t-success', label:'Success', desc:'Positive states, approvals, health indicators' },
      { key:'--t-warn',    label:'Warning', desc:'Caution states, pending, alerts' },
      { key:'--t-danger',  label:'Danger',  desc:'Errors, rejected, critical alerts' },
    ],
  },
  {
    group: 'Surfaces',
    tokens: [
      { key:'--t-bg',        label:'Page Background', desc:'Root page background' },
      { key:'--t-surface',   label:'Surface',         desc:'Cards, panels, modals' },
      { key:'--t-surface-2', label:'Surface 2',       desc:'Nested surfaces, inputs, hover states' },
    ],
  },
  {
    group: 'Text',
    tokens: [
      { key:'--t-text',       label:'Primary Text',  desc:'Body text, headings' },
      { key:'--t-text-muted', label:'Muted Text',    desc:'Labels, secondary text' },
      { key:'--t-text-faint', label:'Faint Text',    desc:'Hints, placeholders, disabled states' },
    ],
  },
  {
    group: 'Lines',
    tokens: [
      { key:'--t-line', label:'Line / Border', desc:'Dividers, card borders, input borders' },
    ],
  },
]

/* ── PRESET THEMES ───────────────────────────────────────────────────── */
const PRESETS = [
  {
    id:'aurora-midnight',
    name:'Aurora Midnight',
    desc:'Default dark theme with cyan accent',
    swatches:['#070b14','#0d1525','#00e5ff','#00c853','#ffab00'],
    vars: { ...AURORA_DEFAULTS },
  },
  {
    id:'twisted-growers',
    name:'Twisted Growers',
    desc:'The OS theme — neon green on near-black',
    swatches:['#0a0c0b','#111513','#2df26a','#2df26a','#ffea00'],
    vars: {
      '--t-bg':'#0a0c0b', '--t-surface':'#111513', '--t-surface-2':'#181d1a',
      '--t-line':'#242a26', '--t-accent':'#2df26a', '--t-success':'#2df26a',
      '--t-warn':'#ffea00', '--t-danger':'#ff4245',
      '--t-text':'#ffffff', '--t-text-muted':'#9aa69f', '--t-text-faint':'#5b665f',
    },
  },
  {
    id:'twisted-growers-light',
    name:'Twisted Growers Light',
    desc:'The OS light mode — green on white',
    swatches:['#fdfefd','#ffffff','#0fae4f','#0fae4f','#9c7a1e'],
    vars: {
      '--t-bg':'#fdfefd', '--t-surface':'#ffffff', '--t-surface-2':'#eef1ee',
      '--t-line':'#e0e5e1', '--t-accent':'#0fae4f', '--t-success':'#0fae4f',
      '--t-warn':'#9c7a1e', '--t-danger':'#c8323a',
      '--t-text':'#101312', '--t-text-muted':'#6e7a73', '--t-text-faint':'#a3aca6',
    },
  },
  {
    id:'executive-dark',
    name:'Executive Dark',
    desc:'Dark navy with gold accent',
    swatches:['#0a0e1a','#121828','#c9a84c','#2ecc71','#e67e22'],
    vars: {
      '--t-bg':'#0a0e1a', '--t-surface':'#121828', '--t-surface-2':'#192033',
      '--t-line':'#243050', '--t-accent':'#c9a84c', '--t-success':'#2ecc71',
      '--t-warn':'#e67e22', '--t-danger':'#e74c3c',
      '--t-text':'#f5f0e8', '--t-text-muted':'#8a9bb5', '--t-text-faint':'#3a4d6a',
    },
  },
  {
    id:'clean-light',
    name:'Clean Light',
    desc:'White background with blue accent',
    swatches:['#f8fafc','#ffffff','#2979ff','#22c55e','#f59e0b'],
    vars: {
      '--t-bg':'#f0f4f8', '--t-surface':'#ffffff', '--t-surface-2':'#f8fafc',
      '--t-line':'#e2e8f0', '--t-accent':'#2979ff', '--t-success':'#22c55e',
      '--t-warn':'#f59e0b', '--t-danger':'#ef4444',
      '--t-text':'#0f172a', '--t-text-muted':'#64748b', '--t-text-faint':'#cbd5e1',
    },
  },
  {
    id:'high-contrast',
    name:'High Contrast',
    desc:'Pure black with neon green for accessibility',
    swatches:['#000000','#111111','#00ff41','#00ff41','#ffff00'],
    vars: {
      '--t-bg':'#000000', '--t-surface':'#111111', '--t-surface-2':'#1a1a1a',
      '--t-line':'#333333', '--t-accent':'#00ff41', '--t-success':'#00ff41',
      '--t-warn':'#ffff00', '--t-danger':'#ff2d2d',
      '--t-text':'#ffffff', '--t-text-muted':'#aaaaaa', '--t-text-faint':'#555555',
    },
  },
  {
    id:'rose-corporate',
    name:'Rose Corporate',
    desc:'Light pink surfaces with deep crimson',
    swatches:['#fff0f3','#ffffff','#be123c','#16a34a','#d97706'],
    vars: {
      '--t-bg':'#fff0f3', '--t-surface':'#ffffff', '--t-surface-2':'#fff5f7',
      '--t-line':'#fecdd3', '--t-accent':'#be123c', '--t-success':'#16a34a',
      '--t-warn':'#d97706', '--t-danger':'#dc2626',
      '--t-text':'#1a0010', '--t-text-muted':'#9f4060', '--t-text-faint':'#fda4af',
    },
  },
  {
    id:'ocean-deep',
    name:'Ocean Deep',
    desc:'Dark teal with aqua accent',
    swatches:['#051820','#082030', '#00b4d8','#2dc653','#ffa500'],
    vars: {
      '--t-bg':'#051820', '--t-surface':'#082030', '--t-surface-2':'#0a2840',
      '--t-line':'#0e3555', '--t-accent':'#00b4d8', '--t-success':'#2dc653',
      '--t-warn':'#ffa500', '--t-danger':'#ff4040',
      '--t-text':'#caf0f8', '--t-text-muted':'#5a8a9f', '--t-text-faint':'#1e4a60',
    },
  },
  {
    id:'forest',
    name:'Forest',
    desc:'Dark green background with lime accent',
    swatches:['#061408','#0a1e0c','#7fff00','#00e676','#ffd740'],
    vars: {
      '--t-bg':'#061408', '--t-surface':'#0a1e0c', '--t-surface-2':'#0f2812',
      '--t-line':'#173520', '--t-accent':'#7fff00', '--t-success':'#00e676',
      '--t-warn':'#ffd740', '--t-danger':'#ff5252',
      '--t-text':'#e8f5e0', '--t-text-muted':'#6a9970', '--t-text-faint':'#2a4a30',
    },
  },
  {
    id:'ember',
    name:'Ember',
    desc:'Dark charcoal with orange-red accent',
    swatches:['#120a04','#1e1008','#ff6d00','#69f0ae','#ffd740'],
    vars: {
      '--t-bg':'#120a04', '--t-surface':'#1e1008', '--t-surface-2':'#2a1510',
      '--t-line':'#3a2010', '--t-accent':'#ff6d00', '--t-success':'#69f0ae',
      '--t-warn':'#ffd740', '--t-danger':'#ff1744',
      '--t-text':'#fff3e0', '--t-text-muted':'#a0704a', '--t-text-faint':'#4a2818',
    },
  },
]

/* ── FONT OPTIONS ────────────────────────────────────────────────────── */
const FONT_FAMILIES = [
  { value:'system-ui, sans-serif',   label:'System UI' },
  { value:"'Inter', sans-serif",     label:'Inter' },
  { value:"'Roboto', sans-serif",    label:'Roboto' },
  { value:"'Poppins', sans-serif",   label:'Poppins' },
  { value:"'JetBrains Mono', monospace", label:'JetBrains Mono' },
]

const TYPO_DEFAULTS = {
  bodySize:     14,
  headingWeight:800,
  letterSpacing:0,
  lineHeight:   1.5,
  fontFamily:   'system-ui, sans-serif',
}

/* ── HELPERS ─────────────────────────────────────────────────────────── */
function toHex6(val) {
  if (!val) return '#888888'
  const t = val.trim()
  if (/^#[0-9a-fA-F]{6}$/.test(t)) return t
  if (/^#[0-9a-fA-F]{3}$/.test(t)) {
    const [,r,g,b] = t.split(''); return `#${r}${r}${g}${g}${b}${b}`
  }
  return '#888888'
}

function setVar(name, value) {
  document.documentElement.style.setProperty(name, value)
}

/* ── KPI TILE ─────────────────────────────────────────────────────────*/
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

/* ── LIVE PREVIEW MINI DASHBOARD ────────────────────────────────────── */
function LivePreview({ tokens }) {
  const bg  = tokens['--t-bg']      || 'var(--t-bg)'
  const sf  = tokens['--t-surface'] || 'var(--t-surface)'
  const ac  = tokens['--t-accent']  || 'var(--t-accent)'
  const tx  = tokens['--t-text']    || 'var(--t-text)'
  const mu  = tokens['--t-text-muted'] || 'var(--t-text-muted)'
  const li  = tokens['--t-line']    || 'var(--t-line)'
  const sc  = tokens['--t-success'] || 'var(--t-success)'
  const wn  = tokens['--t-warn']    || 'var(--t-warn)'
  return (
    <div style={{ background:bg, border:`1px solid ${li}`, padding:14, borderRadius:0 }}>
      <div style={{ fontSize:10, fontWeight:700, color:mu, letterSpacing:'.08em', textTransform:'uppercase', marginBottom:12 }}>Live Theme Preview</div>
      {/* KPI tiles */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:12 }}>
        {[
          { label:'Total Hours', value:'2,847', color:ac },
          { label:'Pending',     value:'14',    color:wn },
        ].map(t => (
          <div key={t.label} style={{ background:sf, border:`1px solid ${li}`, padding:'10px 12px' }}>
            <div style={{ fontSize:9, fontWeight:700, color:mu, textTransform:'uppercase', letterSpacing:'.06em', marginBottom:4 }}>{t.label}</div>
            <div style={{ fontSize:18, fontWeight:800, color:t.color, lineHeight:1 }}>{t.value}</div>
          </div>
        ))}
      </div>
      {/* Mini table */}
      <div style={{ background:sf, border:`1px solid ${li}` }}>
        <div style={{ padding:'7px 10px', borderBottom:`1px solid ${li}`, display:'grid', gridTemplateColumns:'1fr auto' }}>
          <span style={{ fontSize:10, fontWeight:700, color:mu, textTransform:'uppercase', letterSpacing:'.06em' }}>Employee</span>
          <span style={{ fontSize:10, fontWeight:700, color:mu, textTransform:'uppercase', letterSpacing:'.06em' }}>Status</span>
        </div>
        {[
          { name:'Sample Row One',   status:'Active',   sc },
          { name:'Sample Row Two',   status:'On Leave', wn },
          { name:'Sample Row Three', status:'Active',   sc },
        ].map((r,i) => (
          <div key={i} style={{ padding:'6px 10px', borderBottom:i<2?`1px solid ${li}`:'none', display:'grid', gridTemplateColumns:'1fr auto', alignItems:'center' }}>
            <span style={{ fontSize:11, fontWeight:600, color:tx }}>{r.name}</span>
            <span style={{ fontSize:10, fontWeight:700, padding:'2px 7px', borderRadius:3, background:r.status==='Active'?`${sc}22`:`${wn}22`, color:r.status==='Active'?sc:wn, border:`1px solid ${r.status==='Active'?`${sc}44`:`${wn}44`}` }}>{r.status}</span>
          </div>
        ))}
      </div>
      {/* Accent button */}
      <button style={{ marginTop:10, width:'100%', padding:'8px 0', background:ac, color:'#000', border:'none', fontWeight:800, fontSize:12, cursor:'default', letterSpacing:'.3px' }}>
        Sample Action Button
      </button>
    </div>
  )
}

/* ── COLOR TOKEN ROW ─────────────────────────────────────────────────── */
function TokenRow({ token, value, onChange, onReset }) {
  const hex = toHex6(value)
  const [localHex, setLocalHex] = useState(hex)

  useEffect(() => setLocalHex(toHex6(value)), [value])

  const handleHexInput = (v) => {
    setLocalHex(v)
    if (/^#[0-9a-fA-F]{6}$/.test(v)) onChange(token.key, v)
  }

  return (
    <div style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 0', borderBottom:'1px solid var(--t-line)' }}>
      <div style={{ width:30, height:30, background:hex, border:'2px solid var(--t-line)', borderRadius:4, flexShrink:0 }} />
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ fontSize:13, fontWeight:600, color:'var(--t-text)' }}>{token.label}</div>
        <div style={{ fontSize:11, color:'var(--t-text-faint)', fontFamily:'monospace' }}>{token.key}</div>
        {token.desc && <div style={{ fontSize:11, color:'var(--t-text-muted)', marginTop:1 }}>{token.desc}</div>}
      </div>
      <div style={{ display:'flex', alignItems:'center', gap:8, flexShrink:0 }}>
        <input
          type="color"
          value={hex}
          onChange={e => onChange(token.key, e.target.value)}
          style={{ width:36, height:36, border:'none', borderRadius:4, cursor:'pointer', padding:2, background:'transparent' }}
        />
        <input
          type="text"
          value={localHex}
          maxLength={7}
          onChange={e => handleHexInput(e.target.value)}
          style={{ width:82, fontFamily:'monospace', fontSize:12, padding:'5px 8px', border:'1px solid var(--t-line)', background:'var(--t-bg)', color:'var(--t-text)', outline:'none' }}
        />
        <button
          onClick={() => onReset(token.key)}
          title="Reset to Aurora default"
          style={{ padding:'5px 10px', background:'none', border:'1px solid var(--t-line)', color:'var(--t-text-muted)', fontSize:14, cursor:'pointer', lineHeight:1 }}
        >↺</button>
      </div>
    </div>
  )
}

/* ── TAB BTN ─────────────────────────────────────────────────────────── */
const TB = (active) => ({
  padding:'8px 18px', background:'none', border:'none',
  borderBottom:`2px solid ${active?'var(--t-accent)':'transparent'}`,
  color:active?'var(--t-accent)':'var(--t-text-muted)',
  fontWeight:active?700:400, fontSize:13, cursor:'pointer',
  marginBottom:-1, letterSpacing:'.3px', whiteSpace:'nowrap',
})

/* ── MAIN COMPONENT ──────────────────────────────────────────────────── */
export default function ThemeStudio() {
  const { session }           = useAuth()
  const role                  = (session?.person?.role_name || '').toLowerCase()
  const isAdmin               = /admin|owner|coo|ceo|cfo|president|chief/i.test(role)

  const [tab, setTab]         = useState('colors')
  const [tokens, setTokens]   = useState({})
  const [activePreset, setAP] = useState('aurora-midnight')
  const [toast, setToast]     = useState('')
  const [confirm, setConfirm] = useState(null)
  const [typo, setTypo]       = useState(TYPO_DEFAULTS)
  const [saved, setSaved]     = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState(false)
  const [loadError, setLoadError] = useState(null)

  const showToast = (msg) => { setToast(msg); setTimeout(()=>setToast(''),3000) }

  const nodeIds = useMemo(
    () => (getSession().nodes || []).map(n => (n && n.id) ? n.id : n).filter(Boolean),
    [],
  )
  const actorId = getSession().id || null

  const applyTypo = useCallback((t) => {
    document.documentElement.style.setProperty('--t-font-family', t.fontFamily)
    document.documentElement.style.setProperty('--t-body-size', `${t.bodySize}px`)
    document.documentElement.style.setProperty('--t-heading-weight', String(t.headingWeight))
    document.documentElement.style.setProperty('--t-letter-spacing', `${t.letterSpacing}px`)
    document.documentElement.style.setProperty('--t-line-height', String(t.lineHeight))
    // Apply to body directly for broader effect
    document.body.style.fontFamily = t.fontFamily
    document.body.style.fontSize   = `${t.bodySize}px`
    document.body.style.lineHeight = String(t.lineHeight)
    document.body.style.letterSpacing = `${t.letterSpacing}px`
  }, [])

  /* ── Load the tenant theme from the HR brain ─────────────────────────── */
  const loadFromServer = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    const allTokens = TOKEN_GROUPS.flatMap(g => g.tokens)
    try {
      const { data, error } = await sb.rpc('hr_theme_get', { p_node_ids: nodeIds })
      if (error) throw error
      if (!data || data.ok === false) throw new Error(data?.error || 'load_failed')
      const savedTokens = (data.tokens && typeof data.tokens === 'object') ? data.tokens : {}
      const savedTypo   = (data.typography && typeof data.typography === 'object') ? data.typography : {}
      // Saved overrides layered on top of the Aurora defaults, so every token
      // always has a value even before anything has been saved (honest empty).
      const current = {}
      allTokens.forEach(t => { current[t.key] = toHex6(savedTokens[t.key] || AURORA_DEFAULTS[t.key]) })
      setTokens(current)
      Object.entries(current).forEach(([k, v]) => setVar(k, v))
      const mergedTypo = { ...TYPO_DEFAULTS, ...savedTypo }
      setTypo(mergedTypo)
      applyTypo(mergedTypo)
      setAP(data.preset_id || 'aurora-midnight')
      setSaved(true)
    } catch (e) {
      setLoadError(e?.message || 'Could not load theme settings.')
      // Honest fallback: render the Aurora defaults, do not fabricate saved state.
      const current = {}
      allTokens.forEach(t => { current[t.key] = AURORA_DEFAULTS[t.key] })
      setTokens(current)
      Object.entries(current).forEach(([k, v]) => setVar(k, v))
      setTypo(TYPO_DEFAULTS)
      applyTypo(TYPO_DEFAULTS)
      setAP('aurora-midnight')
    } finally {
      setLoading(false)
    }
  }, [nodeIds, applyTypo])

  useEffect(() => { loadFromServer() }, [loadFromServer])

  /* ── Persist the tenant theme to the HR brain ────────────────────────── */
  const persistTheme = useCallback(async ({ nextTokens, nextTypo, nextPreset }) => {
    setSaving(true)
    try {
      const { data, error } = await sb.rpc('hr_theme_save', {
        p_node_ids:   nodeIds,
        p_tokens:     nextTokens ?? tokens,
        p_typography: nextTypo   ?? typo,
        p_preset_id:  nextPreset ?? activePreset,
        p_actor:      actorId,
      })
      if (error) throw error
      if (!data || data.ok === false) throw new Error(data?.error || 'save_failed')
      return true
    } catch (e) {
      showToast('Could not save: ' + (e?.message || 'unknown error'))
      return false
    } finally {
      setSaving(false)
    }
  }, [nodeIds, actorId, tokens, typo, activePreset])

  const handleTokenChange = useCallback((key, value) => {
    const hex = toHex6(value)
    setTokens(prev => ({ ...prev, [key]: hex }))
    setVar(key, hex)
  }, [])

  const handleTokenReset = useCallback((key) => {
    const def = AURORA_DEFAULTS[key] || '#888888'
    setTokens(prev => ({ ...prev, [key]: def }))
    setVar(key, def)
    showToast(`Reset ${key} — click Save to persist`)
  }, [])

  const handleSaveAll = useCallback(async () => {
    const ok = await persistTheme({ nextTokens: tokens })
    if (ok) { showToast('Theme colors saved'); loadFromServer() }
  }, [persistTheme, tokens, loadFromServer])

  const handleResetAllConfirm = () => {
    setConfirm({
      msg: 'Reset ALL theme settings to Aurora Midnight defaults? This clears the saved tenant theme.',
      onOk: async () => {
        setSaving(true)
        let ok = false
        try {
          const { data, error } = await sb.rpc('hr_theme_reset', { p_node_ids: nodeIds, p_actor: actorId })
          if (error) throw error
          if (!data || data.ok === false) throw new Error(data?.error || 'reset_failed')
          ok = true
        } catch (e) {
          showToast('Could not reset: ' + (e?.message || 'unknown error'))
        } finally {
          setSaving(false)
        }
        setConfirm(null)
        if (ok) { showToast('Theme reset to Aurora Midnight'); loadFromServer() }
      },
    })
  }

  const applyPreset = async (preset) => {
    const nextTokens = { ...tokens }
    Object.entries(preset.vars).forEach(([k, v]) => {
      const hex = toHex6(v)
      setVar(k, hex)
      nextTokens[k] = hex
    })
    setTokens(nextTokens)
    setAP(preset.id)
    const ok = await persistTheme({ nextTokens, nextPreset: preset.id })
    if (ok) { showToast(`Applied: ${preset.name}`); loadFromServer() }
  }

  const updateTypo = (patch) => {
    setTypo(prev => {
      const next = { ...prev, ...patch }
      applyTypo(next)
      return next
    })
    setSaved(false)
  }

  const saveTypo = async () => {
    const ok = await persistTheme({ nextTypo: typo })
    if (ok) { setSaved(true); showToast('Typography settings saved'); loadFromServer() }
  }

  if (!isAdmin) {
    return (
      <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:400, gap:16, color:'var(--t-text-muted)' }}>
        <div style={{ fontSize:40 }}>🔐</div>
        <div style={{ fontSize:15, fontWeight:600 }}>Admin access required</div>
        <div style={{ fontSize:13 }}>Theme Studio is restricted to Admin and Owner roles.</div>
      </div>
    )
  }

  return (
    <div style={{ padding:'0 0 40px' }}>
      {/* LOAD / SAVE STATUS — honest states from the HR brain */}
      {loading && (
        <div style={{ background:'var(--t-surface)', border:'1px solid var(--t-line)', color:'var(--t-text-muted)', padding:'10px 14px', fontSize:12, marginBottom:16 }}>
          Loading saved theme…
        </div>
      )}
      {loadError && !loading && (
        <div style={{ background:'var(--t-surface)', border:'1px solid var(--t-danger)', color:'var(--t-danger)', padding:'10px 14px', fontSize:12, marginBottom:16, display:'flex', justifyContent:'space-between', alignItems:'center', gap:12 }}>
          <span>Could not load the saved theme — showing Aurora Midnight defaults. ({loadError})</span>
          <button onClick={loadFromServer} style={{ padding:'5px 12px', background:'none', border:'1px solid var(--t-danger)', color:'var(--t-danger)', fontSize:12, fontWeight:700, cursor:'pointer' }}>Retry</button>
        </div>
      )}

      {/* LIVE PREVIEW HEADER — replaces KPI row */}
      <div style={{ marginBottom:20 }}>
        <div style={{ fontSize:11, fontWeight:700, color:'var(--t-text-muted)', textTransform:'uppercase', letterSpacing:'.08em', marginBottom:10 }}>Live Theme Preview</div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
          <LivePreview tokens={tokens} />
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, alignContent:'start' }}>
            <KTile label="Active Preset"  value={PRESETS.find(p=>p.id===activePreset)?.name || 'Custom'} sub="currently applied" color="var(--t-accent)" />
            <KTile label="Tokens Defined" value={TOKEN_GROUPS.flatMap(g=>g.tokens).length} sub="CSS variables" />
            <KTile label="Font Size"   value={`${typo.bodySize}px`} sub="body text" />
            <KTile label="Line Height" value={typo.lineHeight}      sub="current setting" />
          </div>
        </div>
      </div>

      {/* TABS */}
      <div style={{ display:'flex', gap:0, borderBottom:'1px solid var(--t-line)', marginBottom:22 }}>
        {[['colors','Color Tokens'],['presets','Presets'],['typography','Typography']].map(([k,l]) => (
          <button key={k} onClick={()=>setTab(k)} style={TB(tab===k)}>{l}</button>
        ))}
      </div>

      {/* ── TAB: COLOR TOKENS ─────────────────────────────────────────── */}
      {tab === 'colors' && (
        <div style={{ display:'grid', gridTemplateColumns:'1fr 320px', gap:20, alignItems:'start' }}>
          {/* Token groups */}
          <div>
            {/* Bulk action bar */}
            <div style={{ display:'flex', gap:10, marginBottom:18, flexWrap:'wrap' }}>
              <button onClick={handleSaveAll} disabled={saving||loading} style={{ padding:'9px 20px', background:'var(--t-accent)', color:'#000', border:'none', fontWeight:800, fontSize:13, cursor:saving||loading?'default':'pointer', opacity:saving||loading?.6:1, letterSpacing:'.3px' }}>
                {saving ? 'Saving…' : 'Save All Colors'}
              </button>
              <button onClick={() => {
                const d=`data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify(tokens,null,2))}`
                const a=document.createElement('a'); a.href=d; a.download='vip-theme-tokens.json'; a.click()
              }} style={{ padding:'9px 16px', background:'var(--t-surface)', border:'1px solid var(--t-line)', color:'var(--t-text)', fontWeight:600, fontSize:13, cursor:'pointer' }}>
                Export JSON
              </button>
              <button onClick={handleResetAllConfirm} style={{ padding:'9px 16px', background:'none', border:'1px solid var(--t-danger)', color:'var(--t-danger)', fontWeight:600, fontSize:13, cursor:'pointer' }}>
                Reset to Aurora Defaults
              </button>
            </div>

            {TOKEN_GROUPS.map(grp => (
              <div key={grp.group} style={{ background:'var(--t-surface)', border:'1px solid var(--t-line)', padding:'4px 18px 12px', marginBottom:14 }}>
                <div style={{ fontSize:11, fontWeight:700, color:'var(--t-text-muted)', textTransform:'uppercase', letterSpacing:'.08em', padding:'14px 0 4px' }}>{grp.group}</div>
                {grp.tokens.map(token => (
                  <TokenRow
                    key={token.key}
                    token={token}
                    value={tokens[token.key] || AURORA_DEFAULTS[token.key]}
                    onChange={handleTokenChange}
                    onReset={handleTokenReset}
                  />
                ))}
              </div>
            ))}
          </div>

          {/* Sticky live preview sidebar */}
          <div style={{ position:'sticky', top:20 }}>
            <LivePreview tokens={tokens} />
            <div style={{ marginTop:14, background:'var(--t-surface)', border:'1px solid var(--t-line)', padding:'14px 16px' }}>
              <div style={{ fontSize:11, fontWeight:700, color:'var(--t-text-muted)', textTransform:'uppercase', letterSpacing:'.08em', marginBottom:10 }}>Quick Samples</div>
              <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                {[
                  { label:'Accent',  bg:tokens['--t-accent']  || '#00e5ff', dark:true },
                  { label:'Success', bg:tokens['--t-success'] || '#00c853', dark:true },
                  { label:'Warning', bg:tokens['--t-warn']    || '#ffab00', dark:true },
                  { label:'Danger',  bg:tokens['--t-danger']  || '#ff3d3d', dark:false },
                ].map(s => (
                  <span key={s.label} style={{ padding:'3px 10px', background:s.bg, color:s.dark?'#000':'#fff', fontSize:11, fontWeight:700, borderRadius:3 }}>{s.label}</span>
                ))}
              </div>
              <div style={{ marginTop:10, fontSize:13, color:tokens['--t-text']||'var(--t-text)', fontWeight:600 }}>Primary text</div>
              <div style={{ fontSize:13, color:tokens['--t-text-muted']||'var(--t-text-muted)' }}>Muted text sample</div>
              <div style={{ fontSize:12, color:tokens['--t-text-faint']||'var(--t-text-faint)' }}>Faint / placeholder text</div>
            </div>
          </div>
        </div>
      )}

      {/* ── TAB: PRESETS ─────────────────────────────────────────────── */}
      {tab === 'presets' && (
        <div>
          <div style={{ fontSize:13, color:'var(--t-text-muted)', marginBottom:18 }}>
            Click a preset to preview — then click Apply to make it active. Your current custom overrides will be replaced.
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(220px,1fr))', gap:14 }}>
            {PRESETS.map(p => {
              const isActive = activePreset === p.id
              return (
                <div key={p.id} style={{ background:'var(--t-surface)', border:`2px solid ${isActive?'var(--t-accent)':'var(--t-line)'}`, overflow:'hidden', transition:'border-color .2s', cursor:'pointer' }}
                  onClick={() => applyPreset(p)}>
                  {/* Mini palette preview */}
                  <div style={{ display:'flex', height:6 }}>
                    {p.swatches.map((sw,i) => <div key={i} style={{ flex:1, background:sw }} />)}
                  </div>
                  {/* Mini UI mockup */}
                  <div style={{ padding:10, background:p.vars['--t-bg'] || p.swatches[0] }}>
                    <div style={{ height:10, borderRadius:3, background:p.vars['--t-accent'] || p.swatches[2], marginBottom:6, width:'60%' }} />
                    <div style={{ height:8, borderRadius:3, background:p.vars['--t-surface'] || p.swatches[1], marginBottom:4 }} />
                    <div style={{ height:8, borderRadius:3, background:p.vars['--t-surface'] || p.swatches[1] }} />
                  </div>
                  {/* Info */}
                  <div style={{ padding:'10px 12px' }}>
                    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:4 }}>
                      <div style={{ fontSize:13, fontWeight:700, color:'var(--t-text)' }}>{p.name}</div>
                      {isActive && <span style={{ fontSize:10, fontWeight:700, padding:'2px 7px', background:'rgba(0,229,255,.15)', color:'var(--t-accent)', border:'1px solid rgba(0,229,255,.3)' }}>ACTIVE</span>}
                    </div>
                    <div style={{ fontSize:11, color:'var(--t-text-muted)' }}>{p.desc}</div>
                    {/* Swatches */}
                    <div style={{ display:'flex', gap:5, marginTop:10 }}>
                      {p.swatches.map((sw,i) => (
                        <div key={i} style={{ width:20, height:20, borderRadius:'50%', background:sw, border:'2px solid var(--t-line)' }} />
                      ))}
                    </div>
                  </div>
                  <div style={{ padding:'0 12px 12px' }}>
                    <button
                      onClick={e => { e.stopPropagation(); applyPreset(p) }}
                      style={{ width:'100%', padding:'8px 0', background:isActive?'var(--t-surface-2)':'var(--t-accent)', color:isActive?'var(--t-text-muted)':'#000', border:isActive?'1px solid var(--t-line)':'none', fontWeight:700, fontSize:12, cursor:'pointer', letterSpacing:'.3px' }}
                    >
                      {isActive ? 'Currently Active' : 'Apply Preset'}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── TAB: TYPOGRAPHY ──────────────────────────────────────────── */}
      {tab === 'typography' && (
        <div style={{ display:'grid', gridTemplateColumns:'1fr 380px', gap:20, alignItems:'start' }}>
          {/* Controls */}
          <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
            {/* Font Family */}
            <div style={{ background:'var(--t-surface)', border:'1px solid var(--t-line)', padding:'16px 18px' }}>
              <div style={{ fontSize:11, fontWeight:700, color:'var(--t-text-muted)', textTransform:'uppercase', letterSpacing:'.08em', marginBottom:14 }}>Font Family</div>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(160px,1fr))', gap:10 }}>
                {FONT_FAMILIES.map(f => (
                  <button key={f.value} onClick={() => updateTypo({ fontFamily: f.value })}
                    style={{ padding:'10px 14px', background:typo.fontFamily===f.value?'rgba(0,229,255,.12)':'var(--t-bg)', border:`1px solid ${typo.fontFamily===f.value?'var(--t-accent)':'var(--t-line)'}`, color:typo.fontFamily===f.value?'var(--t-accent)':'var(--t-text)', fontFamily:f.value, fontSize:13, fontWeight:typo.fontFamily===f.value?700:400, cursor:'pointer', textAlign:'left' }}>
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Sliders */}
            <div style={{ background:'var(--t-surface)', border:'1px solid var(--t-line)', padding:'16px 18px' }}>
              <div style={{ fontSize:11, fontWeight:700, color:'var(--t-text-muted)', textTransform:'uppercase', letterSpacing:'.08em', marginBottom:14 }}>Size & Spacing</div>
              {[
                { label:'Body Font Size', key:'bodySize', min:12, max:18, step:1, unit:'px', value:typo.bodySize },
                { label:'Heading Font Weight', key:'headingWeight', min:400, max:900, step:100, unit:'', value:typo.headingWeight },
                { label:'Letter Spacing', key:'letterSpacing', min:-1, max:3, step:0.5, unit:'px', value:typo.letterSpacing },
                { label:'Line Height', key:'lineHeight', min:1.0, max:2.0, step:0.1, unit:'×', value:typo.lineHeight },
              ].map(s => (
                <div key={s.key} style={{ marginBottom:18 }}>
                  <div style={{ display:'flex', justifyContent:'space-between', marginBottom:6 }}>
                    <label style={{ fontSize:13, fontWeight:600, color:'var(--t-text)' }}>{s.label}</label>
                    <span style={{ fontSize:13, fontWeight:700, color:'var(--t-accent)', fontFamily:'monospace' }}>{s.value}{s.unit}</span>
                  </div>
                  <input
                    type="range"
                    min={s.min} max={s.max} step={s.step}
                    value={s.value}
                    onChange={e => updateTypo({ [s.key]: s.key==='headingWeight'?Number(e.target.value):parseFloat(e.target.value) })}
                    style={{ width:'100%', accentColor:'var(--t-accent)' }}
                  />
                  <div style={{ display:'flex', justifyContent:'space-between', marginTop:3 }}>
                    <span style={{ fontSize:10, color:'var(--t-text-faint)' }}>{s.min}{s.unit}</span>
                    <span style={{ fontSize:10, color:'var(--t-text-faint)' }}>{s.max}{s.unit}</span>
                  </div>
                </div>
              ))}
            </div>

            <div style={{ display:'flex', gap:10 }}>
              <button onClick={saveTypo} disabled={saving||loading} style={{ flex:1, padding:'11px 0', background:'var(--t-accent)', color:'#000', border:'none', fontWeight:800, fontSize:13, cursor:saving||loading?'default':'pointer', opacity:saving||loading?.6:1, letterSpacing:'.3px' }}>
                {saving ? 'Saving…' : saved ? '✓ Saved' : 'Save Typography Settings'}
              </button>
              <button onClick={() => { setTypo(TYPO_DEFAULTS); applyTypo(TYPO_DEFAULTS); setSaved(false) }}
                style={{ padding:'11px 18px', background:'none', border:'1px solid var(--t-line)', color:'var(--t-text-muted)', fontWeight:600, fontSize:13, cursor:'pointer' }}>
                Reset
              </button>
            </div>
          </div>

          {/* Live preview panel */}
          <div style={{ position:'sticky', top:20, background:'var(--t-surface)', border:'1px solid var(--t-line)', padding:'18px 20px' }}>
            <div style={{ fontSize:11, fontWeight:700, color:'var(--t-text-muted)', textTransform:'uppercase', letterSpacing:'.08em', marginBottom:16 }}>Typography Preview</div>

            {/* Heading */}
            <div style={{ fontFamily:typo.fontFamily, fontWeight:typo.headingWeight, fontSize:22, color:'var(--t-text)', letterSpacing:`${typo.letterSpacing}px`, lineHeight:typo.lineHeight, marginBottom:10 }}>
              Twisted Growers HR
            </div>

            {/* Body */}
            <p style={{ fontFamily:typo.fontFamily, fontSize:typo.bodySize, color:'var(--t-text)', lineHeight:typo.lineHeight, letterSpacing:`${typo.letterSpacing}px`, margin:'0 0 14px' }}>
              This is how body text will appear throughout the platform. Employee names, schedule details, and status updates all use this style. Ensure readability across all screen sizes.
            </p>

            {/* Muted */}
            <p style={{ fontFamily:typo.fontFamily, fontSize:Math.max(typo.bodySize-2,10), color:'var(--t-text-muted)', lineHeight:typo.lineHeight, letterSpacing:`${typo.letterSpacing}px`, margin:'0 0 14px' }}>
              Secondary / muted text — used for labels, timestamps, and supplemental info.
            </p>

            {/* Badge */}
            <div style={{ display:'flex', gap:8, marginBottom:14, flexWrap:'wrap' }}>
              {['Active','On Leave','Pending','Manager'].map((b,i) => (
                <span key={b} style={{ fontFamily:typo.fontFamily, fontSize:Math.max(typo.bodySize-3,9), fontWeight:700, padding:'3px 9px', borderRadius:3, background:`rgba(0,229,255,${.1+i*.03})`, color:'var(--t-accent)', border:'1px solid rgba(0,229,255,.3)', letterSpacing:`${typo.letterSpacing}px` }}>{b}</span>
              ))}
            </div>

            {/* Table row sample */}
            <div style={{ border:'1px solid var(--t-line)' }}>
              <div style={{ padding:'8px 12px', borderBottom:'1px solid var(--t-line)', background:'var(--t-surface-2)', display:'grid', gridTemplateColumns:'1fr auto auto', gap:12 }}>
                {['Employee','Hours','Status'].map(h => (
                  <span key={h} style={{ fontFamily:typo.fontFamily, fontSize:Math.max(typo.bodySize-3,9), fontWeight:700, color:'var(--t-text-muted)', textTransform:'uppercase', letterSpacing:`.06em` }}>{h}</span>
                ))}
              </div>
              {[['Sample Row One','42h'],['Sample Row Two','38h']].map(([name,hrs]) => (
                <div key={name} style={{ padding:'8px 12px', borderBottom:'1px solid var(--t-line)', display:'grid', gridTemplateColumns:'1fr auto auto', gap:12, alignItems:'center' }}>
                  <span style={{ fontFamily:typo.fontFamily, fontSize:typo.bodySize, fontWeight:600, color:'var(--t-text)', letterSpacing:`${typo.letterSpacing}px` }}>{name}</span>
                  <span style={{ fontFamily:typo.fontFamily, fontSize:typo.bodySize, color:'var(--t-text-muted)', letterSpacing:`${typo.letterSpacing}px` }}>{hrs}</span>
                  <span style={{ fontFamily:typo.fontFamily, fontSize:Math.max(typo.bodySize-2,10), fontWeight:700, color:'var(--t-success)', letterSpacing:`${typo.letterSpacing}px` }}>Active</span>
                </div>
              ))}
            </div>

            {/* Settings summary */}
            <div style={{ marginTop:14, padding:'10px 12px', background:'var(--t-bg)', border:'1px solid var(--t-line)' }}>
              <div style={{ fontSize:10, fontWeight:700, color:'var(--t-text-muted)', textTransform:'uppercase', letterSpacing:'.08em', marginBottom:8 }}>Current Settings</div>
              {[
                ['Font Family',     FONT_FAMILIES.find(f=>f.value===typo.fontFamily)?.label || 'Custom'],
                ['Body Size',       `${typo.bodySize}px`],
                ['Heading Weight',  String(typo.headingWeight)],
                ['Letter Spacing',  `${typo.letterSpacing}px`],
                ['Line Height',     String(typo.lineHeight)],
              ].map(([k,v]) => (
                <div key={k} style={{ display:'flex', justifyContent:'space-between', padding:'4px 0', borderBottom:'1px solid var(--t-line)', fontSize:12 }}>
                  <span style={{ color:'var(--t-text-muted)' }}>{k}</span>
                  <span style={{ fontWeight:700, color:'var(--t-text)', fontFamily:'monospace' }}>{v}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* CONFIRM MODAL */}
      {confirm && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.6)', zIndex:9999, display:'flex', alignItems:'center', justifyContent:'center' }} onClick={()=>setConfirm(null)}>
          <div style={{ background:'var(--t-surface)', border:'1px solid var(--t-line)', padding:28, maxWidth:400, width:'90%' }} onClick={e=>e.stopPropagation()}>
            <div style={{ fontSize:16, fontWeight:800, color:'var(--t-text)', marginBottom:12 }}>Confirm Reset</div>
            <div style={{ fontSize:13, color:'var(--t-text-muted)', marginBottom:22, lineHeight:1.6 }}>{confirm.msg}</div>
            <div style={{ display:'flex', gap:10, justifyContent:'flex-end' }}>
              <button onClick={()=>setConfirm(null)} style={{ padding:'9px 18px', background:'none', border:'1px solid var(--t-line)', color:'var(--t-text-muted)', fontWeight:600, fontSize:13, cursor:'pointer' }}>Cancel</button>
              <button onClick={confirm.onOk} style={{ padding:'9px 18px', background:'var(--t-danger)', color:'#fff', border:'none', fontWeight:700, fontSize:13, cursor:'pointer' }}>Reset</button>
            </div>
          </div>
        </div>
      )}

      {/* TOAST */}
      {toast && (
        <div style={{ position:'fixed', bottom:24, right:24, background:'var(--t-accent)', color:'#000', padding:'12px 20px', fontWeight:700, fontSize:13, zIndex:99999, boxShadow:'0 8px 24px rgba(0,0,0,.3)', animation:'fadeUp .25s ease' }}>
          {toast}
        </div>
      )}

      <style>{`@keyframes fadeUp{from{transform:translateY(12px);opacity:0}to{transform:translateY(0);opacity:1}}`}</style>
    </div>
  )
}
