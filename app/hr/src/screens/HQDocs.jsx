import { useEffect, useRef, useState } from 'react'
import { hq } from '../lib/hq.js'
import { getSession } from '../lib/supabase.js'

// Shared HQ Document Vault + New-Hire Onboarding, surfaced inside the HR app.
// Reuses the verified vanilla primitives (public/hqdocs/*.js) which attach to
// window and mount into a div. We point window.VIP_SUPABASE at the HQ client so
// the SAME document store the CEO platform uses is what the HR app reads/writes
// — one source of truth, no duplicate.

let scriptsLoading = null
function loadHqScripts() {
  if (window.VIP_DOC_VAULT && window.VIP_ONBOARDING) return Promise.resolve()
  if (scriptsLoading) return scriptsLoading
  const files = [
    '/hqdocs/data-io.js',
    '/hqdocs/filter-bar.js',
    '/hqdocs/signature-pad.js',
    '/hqdocs/doc-vault.js',
    '/hqdocs/onboarding-admin.js',
  ]
  scriptsLoading = files.reduce((p, src) => p.then(() => new Promise((res, rej) => {
    if (document.querySelector(`script[data-hq="${src}"]`)) return res()
    const s = document.createElement('script')
    s.src = src; s.async = false; s.setAttribute('data-hq', src)
    s.onload = res; s.onerror = () => rej(new Error('failed to load ' + src))
    document.body.appendChild(s)
  })), Promise.resolve())
  return scriptsLoading
}

export default function HQDocs() {
  const [tab, setTab] = useState('vault')
  const [err, setErr] = useState(null)
  const vaultRef = useRef(null)
  const onbRef = useRef(null)
  const mounted = useRef({ vault: false, onb: false })

  useEffect(() => {
    let cancelled = false
    // Point the primitives at HQ, and give them an actor from the HR session.
    const session = getSession()
    window.VIP_SUPABASE = hq
    window.VIP_AUTH = {
      currentUser: { id: session?.id || null, role: session?.role || 'hr' },
      // let tenant resolve from HQ locations inside the primitive; supply actor here
      getEmployeeContext: () => ({ employee_id: session?.id || null }),
    }
    loadHqScripts().then(() => {
      if (cancelled) return
      mountActive()
    }).catch(e => !cancelled && setErr(e.message))
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function mountActive() {
    if (tab === 'vault' && vaultRef.current && window.VIP_DOC_VAULT && !mounted.current.vault) {
      window.VIP_DOC_VAULT.mount(vaultRef.current, { scope: 'hr', admin: true })
      mounted.current.vault = true
    }
    if (tab === 'onb' && onbRef.current && window.VIP_ONBOARDING && !mounted.current.onb) {
      window.VIP_ONBOARDING.mount(onbRef.current, {})
      mounted.current.onb = true
    }
  }

  // re-mount the active tab when it changes (lazy)
  useEffect(() => {
    if (window.VIP_DOC_VAULT && window.VIP_ONBOARDING) mountActive()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab])

  const tabBtn = (id, label) => (
    <button
      onClick={() => setTab(id)}
      style={{
        padding: '8px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer',
        border: '1px solid #363d52', borderBottom: tab === id ? '2px solid #00d4ff' : '1px solid #363d52',
        background: tab === id ? 'rgba(0,212,255,.12)' : '#0f1419',
        color: tab === id ? '#00d4ff' : '#e8ecf4',
      }}>{label}</button>
  )

  return (
    <div style={{ padding: 16, color: '#e8ecf4' }}>
      <h2 style={{ margin: '0 0 4px', fontSize: 18 }}>HQ Documents &amp; Onboarding</h2>
      <div style={{ color: '#8a94a8', fontSize: 12, marginBottom: 12 }}>
        Shared with headquarters — the same document vault, retention, e-signature, and new-hire packets the CEO platform uses. One source of truth.
      </div>
      {err && <div style={{ color: '#ff1744', marginBottom: 10 }}>Failed to load HQ module: {err}</div>}
      <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
        {tabBtn('vault', '📁 Document Vault')}
        {tabBtn('onb', '📝 New-Hire Packets')}
      </div>
      <div style={{ display: tab === 'vault' ? 'block' : 'none' }}><div ref={vaultRef} /></div>
      <div style={{ display: tab === 'onb' ? 'block' : 'none' }}><div ref={onbRef} /></div>
    </div>
  )
}
