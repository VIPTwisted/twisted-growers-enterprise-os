import { useState, useEffect } from 'react'
import { useAuth } from '../lib/auth.jsx'
import { ensureSession } from '../lib/supabase'
import { companyName } from '../lib/config.js'

// The floor path (Employee ID + PIN) runs as an anonymous auth session. That switch lives in
// the Supabase dashboard (owner). Until it is on, say so instead of "Invalid ID or PIN".

export default function Login() {
  const { login, ssoTried } = useAuth()
  const [loginId, setLoginId] = useState('')
  const [pin, setPin]         = useState('')
  const [err, setErr]         = useState('')
  const [busy, setBusy]       = useState(false)
  const [showPin, setShowPin] = useState(false)
  const [kiosk, setKiosk]     = useState(null)   // null = unknown, true = anonymous session available, false = refused
  useEffect(() => {
    if (!ssoTried) return
    let live = true
    ensureSession().then(r => { if (live) setKiosk(r?.session ? true : false) })
    return () => { live = false }
  }, [ssoTried])

  async function submit(e) {
    e.preventDefault()
    setErr('')
    if (!loginId || !pin) { setErr('Enter ID and PIN'); return }
    setBusy(true)
    try {
      const res = await login(loginId.trim(), pin)
      if (!res.ok) { setErr(kiosk === false ? 'Kiosk sign-in is not enabled on this project yet' : 'Invalid ID or PIN'); setBusy(false) }
    } catch (e2) {
      setErr((kiosk === false ? 'Kiosk sign-in is not enabled on this project yet — ' : 'Login error: ') + (e2.message || e2)); setBusy(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: '#070b14', position: 'relative', overflow: 'hidden',
    }}>

      {/* ── Aurora midnight orbs — deep navy / ice blue / cyan ── */}
      <div style={{
        position: 'absolute', width: 800, height: 800, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(0,130,255,.32) 0%, transparent 68%)',
        top: '-280px', left: '-260px', animation: 'orb1 16s ease-in-out infinite',
        pointerEvents: 'none',
      }} />
      <div style={{
        position: 'absolute', width: 640, height: 640, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(0,40,120,.60) 0%, transparent 70%)',
        bottom: '-200px', right: '-160px', animation: 'orb2 20s ease-in-out infinite',
        pointerEvents: 'none',
      }} />
      <div style={{
        position: 'absolute', width: 480, height: 480, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(0,229,255,.22) 0%, transparent 68%)',
        top: '35%', right: '18%', animation: 'orb3 24s ease-in-out infinite',
        pointerEvents: 'none',
      }} />
      <div style={{
        position: 'absolute', width: 360, height: 360, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(20,80,200,.38) 0%, transparent 70%)',
        bottom: '22%', left: '10%', animation: 'orb4 18s ease-in-out infinite',
        pointerEvents: 'none',
      }} />
      {/* subtle horizon glow */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, height: 220,
        background: 'radial-gradient(ellipse 80% 100% at 50% 120%, rgba(0,100,220,.16), transparent)',
        pointerEvents: 'none',
      }} />

      {/* scanlines */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0,
        backgroundImage: 'repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,0,0,.04) 2px,rgba(0,0,0,.04) 4px)',
      }} />

      {/* ── glass card ── */}
      <form onSubmit={submit} style={{
        position: 'relative', zIndex: 1,
        background: 'rgba(7, 14, 30, 0.80)',
        backdropFilter: 'blur(40px) saturate(1.6)',
        WebkitBackdropFilter: 'blur(40px) saturate(1.6)',
        border: '1px solid rgba(0,180,255,.20)',
        borderRadius: 0,
        padding: '50px 42px',
        width: 390,
        boxShadow: '0 0 0 1px rgba(0,120,255,.10), 0 48px 110px rgba(0,0,0,.80), inset 0 1px 0 rgba(255,255,255,.04)',
        textAlign: 'center',
        animation: 'loginFade .5s ease-out both',
      }}>

        {/* Aurora gradient top bar */}
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 3,
          background: 'linear-gradient(90deg,#070b14 0%,#1a4bd4 40%,#00e5ff 100%)',
        }} />

        {/* TG logo mark */}
        <div style={{
          width: 68, height: 68, borderRadius: 0, margin: '0 auto 22px',
          background: 'linear-gradient(135deg,#0a1628 0%,#1a4bd4 55%,#00e5ff 100%)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontWeight: 900, fontSize: 21, color: '#ffffff', letterSpacing: 2,
          boxShadow: '0 0 36px rgba(0,200,255,.40), 0 0 72px rgba(0,120,255,.20)',
          animation: 'logoPulse 3.5s ease-in-out infinite',
        }}>TG</div>

        <div style={{ fontSize: 22, fontWeight: 800, color: '#eaf2ff', letterSpacing: .4, marginBottom: 4 }}>
          {companyName()}
        </div>
        <div style={{ fontSize: 13, color: 'rgba(120,170,230,.60)', marginBottom: 6, letterSpacing: .3 }}>
          HR Command Center · Lakeville, MA
        </div>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 2, color: 'rgba(0,229,255,.45)', textTransform: 'uppercase', marginBottom: 28 }}>
          TWISTED GROWERS · LAKEVILLE, MA
        </div>

        <div style={{ minHeight: 20, marginBottom: 14, fontSize: 13, color: err ? '#ffb347' : '#00e5ff', fontWeight: 600 }}>
          {err || (!ssoTried ? 'Checking for your ' + companyName() + ' OS sign-in…' : '')}
        </div>
        {ssoTried && !err && (
          <div style={{ fontSize: 12, color: 'rgba(120,170,230,.75)', marginBottom: 16, lineHeight: 1.6 }}>
            Signed in to the {companyName()} OS? <a href="/" style={{ color: '#00e5ff' }}>Open the OS</a> and come back — the same sign-in works here.
            {kiosk === false && <div style={{ marginTop: 6, color: '#ffb347' }}>Employee ID + PIN (kiosk) needs anonymous sign-ins switched on in the Supabase dashboard (Auth → Providers) — an owner setting, not yet on.</div>}
          </div>
        )}

        <div style={{ position: 'relative', marginBottom: 12 }}>
          <input
            placeholder="Employee ID"
            value={loginId}
            onChange={e => setLoginId(e.target.value)}
            autoComplete="off"
            style={{
              width: '100%', background: 'rgba(255,255,255,.04)',
              border: '1px solid rgba(0,180,255,.22)',
              color: '#eaf2ff', padding: '14px 16px', borderRadius: 0,
              fontFamily: 'var(--font-sans)', fontSize: 14, outline: 'none', letterSpacing: .3,
              boxSizing: 'border-box',
            }}
            onFocus={e => e.target.style.borderColor = 'rgba(0,229,255,.55)'}
            onBlur={e => e.target.style.borderColor  = 'rgba(0,180,255,.22)'}
          />
        </div>

        <div style={{ position: 'relative', marginBottom: 26 }}>
          <input
            type={showPin ? 'text' : 'password'}
            placeholder="PIN"
            value={pin}
            onChange={e => setPin(e.target.value)}
            autoComplete="off"
            style={{
              width: '100%', background: 'rgba(255,255,255,.04)',
              border: '1px solid rgba(0,180,255,.22)',
              color: '#eaf2ff', padding: '14px 48px 14px 16px', borderRadius: 0,
              fontFamily: 'var(--font-sans)', fontSize: 14, outline: 'none', letterSpacing: .3,
              boxSizing: 'border-box',
            }}
            onFocus={e => e.target.style.borderColor = 'rgba(0,229,255,.55)'}
            onBlur={e => e.target.style.borderColor  = 'rgba(0,180,255,.22)'}
          />
          <button type="button" onClick={() => setShowPin(p => !p)} style={{
            position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
            background: 'none', border: 'none', color: 'rgba(120,170,230,.50)',
            cursor: 'pointer', fontSize: 11, fontFamily: 'var(--font-sans)', fontWeight: 700,
          }}>
            {showPin ? 'HIDE' : 'SHOW'}
          </button>
        </div>

        <button
          type="submit"
          disabled={busy}
          style={{
            width: '100%',
            background: busy
              ? 'rgba(0,80,180,.30)'
              : 'linear-gradient(135deg,#0a1628 0%,#1a4bd4 55%,#00e5ff 100%)',
            color: '#ffffff', border: 'none', padding: '16px',
            borderRadius: 0, fontFamily: 'var(--font-sans)', fontSize: 12,
            fontWeight: 800, letterSpacing: 2.5, textTransform: 'uppercase',
            cursor: busy ? 'default' : 'pointer',
            boxShadow: busy ? 'none' : '0 0 28px rgba(0,180,255,.40), 0 0 50px rgba(0,100,255,.15)',
            transition: 'box-shadow .25s, opacity .2s',
          }}>
          {busy ? 'Signing In…' : 'Sign In'}
        </button>

        <div style={{ marginTop: 26, fontSize: 10, color: 'rgba(100,150,200,.32)', letterSpacing: .8, textTransform: 'uppercase' }}>
          Secure · Encrypted · {companyName()} © 2026
        </div>
      </form>

      <style>{`
        @keyframes orb1 {
          0%,100% { transform: translate(0,0) scale(1); }
          33% { transform: translate(80px,60px) scale(1.12); }
          66% { transform: translate(-60px,80px) scale(.92); }
        }
        @keyframes orb2 {
          0%,100% { transform: translate(0,0) scale(1); }
          33% { transform: translate(-100px,-70px) scale(1.10); }
          66% { transform: translate(60px,-100px) scale(.88); }
        }
        @keyframes orb3 {
          0%,100% { transform: translate(0,0) scale(1); }
          50%  { transform: translate(70px,-80px) scale(1.20); }
        }
        @keyframes orb4 {
          0%,100% { transform: translate(0,0) scale(1); }
          40% { transform: translate(50px,-60px) scale(1.15); }
          80% { transform: translate(-35px,45px) scale(.85); }
        }
        @keyframes logoPulse {
          0%,100% { box-shadow: 0 0 36px rgba(0,200,255,.40), 0 0 72px rgba(0,120,255,.20); }
          50%     { box-shadow: 0 0 54px rgba(0,220,255,.65), 0 0 100px rgba(0,150,255,.35); }
        }
        @keyframes loginFade {
          from { opacity:0; transform: translateY(24px); }
          to   { opacity:1; transform: translateY(0); }
        }
      `}</style>
    </div>
  )
}
