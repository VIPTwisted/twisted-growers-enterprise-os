// PulseGate.jsx — blocking Daily Pulse check-in. Used to REQUIRE the pulse (e.g.
// before clocking back in from break). Anything below "Good" requires a reason,
// and HR + the COO are notified. Cannot be dismissed without answering.
import { useState } from 'react'
import { MOODS, recordPulse } from '../lib/pulse.js'

export default function PulseGate({ person, title = 'Daily Pulse — required to continue', onComplete, onCancel }) {
  const [mood, setMood] = useState(null)
  const [note, setNote] = useState('')
  const low = mood != null && mood < 4
  const ready = mood != null && (!low || note.trim())

  const submit = () => {
    if (!ready) return
    recordPulse(person?.id, person?.full_name, mood, note)
    onComplete && onComplete(mood)
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(4,8,18,0.9)', zIndex: 10001, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ width: 'min(460px, 96vw)', background: 'var(--t-bg)', border: '1px solid var(--t-accent)', boxShadow: '0 20px 60px rgba(0,0,0,.6)', overflow: 'hidden' }}>
        <div style={{ background: 'var(--t-grad, linear-gradient(120deg,#00e5ff,#7c4dff))', padding: '16px 20px' }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--t-on-grad,#04121a)' }}>💗 {title}</div>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--t-on-grad,#04121a)', opacity: 0.85, marginTop: 2 }}>How are you feeling for this shift?</div>
        </div>
        <div style={{ padding: 20 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
            {MOODS.map(m => (
              <button key={m.v} onClick={() => setMood(m.v)} style={{ flex: 1, minWidth: 70, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, padding: '10px 6px', cursor: 'pointer', background: mood === m.v ? 'rgba(0,229,255,0.12)' : 'var(--t-surface-2)', border: `1px solid ${mood === m.v ? 'var(--t-accent)' : 'var(--t-line)'}` }}>
                <span style={{ fontSize: 22 }}>{m.e}</span>
                <span style={{ fontSize: 10, fontWeight: 700, color: mood === m.v ? 'var(--t-accent)' : 'var(--t-text-muted)' }}>{m.label}</span>
              </button>
            ))}
          </div>

          {low && (
            <div style={{ background: 'rgba(255,184,0,0.08)', border: '1px solid var(--t-warn)', padding: '10px 12px', marginBottom: 10, fontSize: 12, color: 'var(--t-text)', lineHeight: 1.5 }}>
              💛 <b>We need you feeling good — good vibes only!</b> Each shift our energy should be happy & energetic; it's contagious and drives sales. Please tell us <b>why</b> so we can help. <span style={{ color: 'var(--t-warn)', fontWeight: 700 }}>HR and the COO will be messaged.</span>
            </div>
          )}
          <input value={note} onChange={e => setNote(e.target.value)} placeholder={low ? 'Required — tell us why…' : 'Add a note (optional, private to HR)…'}
            style={{ width: '100%', background: 'var(--t-surface-2)', border: `1px solid ${low && !note.trim() ? 'var(--t-warn)' : 'var(--t-line)'}`, color: 'var(--t-text)', padding: '9px 10px', fontSize: 12, outline: 'none', boxSizing: 'border-box' }} />

          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            <button onClick={submit} disabled={!ready} style={{ flex: 1, fontSize: 13, fontWeight: 800, padding: '11px', background: ready ? 'var(--t-accent)' : 'var(--t-surface-2)', color: ready ? 'var(--t-on-grad,#04121a)' : 'var(--t-text-faint)', border: 'none', cursor: ready ? 'pointer' : 'not-allowed' }}>Check in &amp; continue →</button>
            {onCancel && <button onClick={onCancel} style={{ fontSize: 12, fontWeight: 600, padding: '11px 14px', background: 'var(--t-surface)', border: '1px solid var(--t-line)', color: 'var(--t-text-muted)', cursor: 'pointer' }}>Later</button>}
          </div>
          <div style={{ fontSize: 10, color: 'var(--t-text-faint)', marginTop: 8, textAlign: 'center' }}>Required each shift · takes 5 seconds</div>
        </div>
      </div>
    </div>
  )
}
