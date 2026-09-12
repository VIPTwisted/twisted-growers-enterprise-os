// GreetingModal.jsx — the AI login briefing. Fires on EVERY login (consumes a
// one-shot sessionStorage flag set by auth.login). Two steps: (1) an energetic,
// customer-service + sales-focused AI greeting with a premium look, then (2) a
// prompt to check alerts & messages before proceeding.
import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { buildBriefing } from '../lib/greetings.js'

function countInbox(person) {
  let alerts = 0, messages = 0
  const me = person?.full_name || ''
  const mgr = /admin|owner|coo|ceo|cfo|president|chief|hr|manager/i.test(person?.role_name || '')
  try {
    if (mgr) alerts += (JSON.parse(localStorage.getItem('vip_pulse_flags') || '[]')).length
    const cov = JSON.parse(localStorage.getItem('vip_coverage_requests') || '[]')
    cov.forEach(r => (r.recipients || []).forEach(rc => { if (rc.id === person?.id && rc.status === 'pending') messages++ }))
    const tm = JSON.parse(localStorage.getItem('vip_task_messages') || '{}')
    Object.values(tm).flat().forEach(m => { if (m.to === me) messages++ })
  } catch (_) {}
  return { alerts, messages }
}

export default function GreetingModal({ person, isLate, minutesLate, scheduledShift }) {
  const nav = useNavigate()
  const [brief, setBrief] = useState(null)
  const [step, setStep] = useState(1)
  const inbox = useMemo(() => countInbox(person), [person?.id])

  useEffect(() => {
    if (!person?.id) return
    let flag = null
    try { flag = sessionStorage.getItem('vip_login_greet') } catch { /* */ }
    if (!flag) return
    try { sessionStorage.removeItem('vip_login_greet') } catch { /* */ }
    setStep(1)
    setBrief(buildBriefing({
      name: person.full_name, mode: 'login',
      isLate, minutesLate, scheduledShift,
      hasMessages: inbox.messages > 0, messageCount: inbox.messages,
    }))
  }, [person?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!brief) return null
  const close = () => setBrief(null)
  const goto = (to) => { close(); nav(to) }
  const first = (person?.full_name || 'there').split(' ')[0]

  const tile = (icon, label, count, to, color) => (
    <button onClick={() => goto(to)} style={{
      flex: 1, minWidth: 130, background: 'var(--t-surface)', border: `1px solid ${count ? color : 'var(--t-line)'}`,
      padding: '16px 14px', cursor: 'pointer', textAlign: 'left', position: 'relative', transition: 'transform .1s',
    }}
      onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-2px)'} onMouseLeave={e => e.currentTarget.style.transform = 'none'}>
      <div style={{ fontSize: 22 }}>{icon}</div>
      <div style={{ fontSize: 26, fontWeight: 800, color: count ? color : 'var(--t-text-muted)', marginTop: 6, lineHeight: 1 }}>{count}</div>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--t-text-muted)', letterSpacing: '.05em', textTransform: 'uppercase', marginTop: 4 }}>{label}</div>
      <div style={{ fontSize: 10, color: 'var(--t-accent)', marginTop: 6 }}>Open ↗</div>
    </button>
  )

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(4,8,18,0.9)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <style>{`
        @keyframes gm-in { from { opacity:0; transform: translateY(24px) scale(.98) } to { opacity:1; transform:none } }
        @keyframes gm-glow { 0%,100%{ box-shadow:0 0 0 0 rgba(0,229,255,.0) } 50%{ box-shadow:0 0 42px 0 rgba(0,229,255,.22) } }
        @keyframes gm-shine { 0%{ background-position:-160% 0 } 100%{ background-position:260% 0 } }
        .gm-card{ animation: gm-in .34s cubic-bezier(.16,.84,.44,1) both; }
        .gm-hero{ position:relative; overflow:hidden; }
        .gm-hero:after{ content:''; position:absolute; inset:0; background:linear-gradient(105deg,transparent 30%,rgba(255,255,255,.28) 48%,transparent 66%); background-size:200% 100%; animation: gm-shine 2.6s ease-in-out .3s both; }
        .gm-dot{ width:7px;height:7px;border-radius:50%;background:var(--t-line);transition:all .2s }
        .gm-dot.on{ background:var(--t-accent); width:20px; border-radius:4px }
      `}</style>

      <div className="gm-card" style={{ width: 'min(520px, 96vw)', background: 'var(--t-bg)', border: '1px solid var(--t-accent)', overflow: 'hidden', boxShadow: '0 0 42px 0 rgba(0,229,255,.18)', animation: 'gm-in .34s cubic-bezier(.16,.84,.44,1) both' }}>
        {/* hero band */}
        <div className="gm-hero" style={{ background: 'var(--t-grad, linear-gradient(120deg,#00e5ff 0%,#7c4dff 55%,#ff5ca8 100%))', padding: '22px 26px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 40, height: 40, background: 'rgba(0,0,0,.22)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 16, color: '#fff', borderRadius: 8 }}>TG</div>
            <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.16em', color: 'rgba(255,255,255,.85)', textTransform: 'uppercase' }}>AI Daily Briefing</div>
          </div>
          <div style={{ fontSize: 27, fontWeight: 900, color: '#fff', marginTop: 12, letterSpacing: '-.5px', textShadow: '0 2px 12px rgba(0,0,0,.2)' }}>{brief.salutation}</div>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,.9)', marginTop: 3 }}>{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</div>
        </div>

        <div style={{ padding: '22px 26px' }}>
          {step === 1 ? (
            <>
              <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--t-text)', lineHeight: 1.5 }}>{brief.greeting}</div>
              <div style={{ fontSize: 12, color: 'var(--t-text-muted)', marginTop: 10, lineHeight: 1.5 }}>
                Bring your best energy to the floor, <b style={{ color: 'var(--t-text)' }}>{first}</b> — deliver five-star customer service and let's drive sales together. Good vibes are contagious. 💛
              </div>
              {brief.lateWarning && <div style={{ fontSize: 12, color: 'var(--t-warn)', background: 'rgba(255,184,0,.08)', border: '1px solid var(--t-warn)', padding: '10px 12px', marginTop: 14 }}>{brief.lateWarning}</div>}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 20 }}>
                <div className="gm-dot on" /><div className="gm-dot" />
                <button onClick={() => setStep(2)} style={{ marginLeft: 'auto', fontSize: 13, fontWeight: 800, padding: '11px 22px', background: 'var(--t-accent)', color: 'var(--t-on-grad,#04121a)', border: 'none', cursor: 'pointer', letterSpacing: '.03em' }}>Continue →</button>
              </div>
            </>
          ) : (
            <>
              <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--t-text)' }}>Before you dive in — check your alerts &amp; messages 👇</div>
              <div style={{ fontSize: 12, color: 'var(--t-text-muted)', marginTop: 4 }}>Stay ahead of coverage, tasks, and team signals.</div>
              <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
                {tile('🔔', 'Alerts', inbox.alerts, '/notifications', 'var(--t-danger)')}
                {tile('✉️', 'Messages', inbox.messages, '/tasks', 'var(--t-accent)')}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 20 }}>
                <div className="gm-dot" /><div className="gm-dot on" />
                <button onClick={close} style={{ marginLeft: 'auto', fontSize: 13, fontWeight: 800, padding: '11px 22px', background: 'var(--t-accent)', color: 'var(--t-on-grad,#04121a)', border: 'none', cursor: 'pointer', letterSpacing: '.03em' }}>Let's drive sales 🚀</button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
