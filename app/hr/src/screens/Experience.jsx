// Experience.jsx — "{companyName()} Experience" hub: our own Microsoft Viva-style employee
// experience layer. Unifies Connections (news), Learning, Goals, Insights
// (wellbeing), Recognition, Community & Knowledge into one personalized home,
// plus a working Pulse daily check-in. Modules link to the existing screens;
// Pulse is a net-new feature persisted per person/day to the HR brain
// (pulse_checkins table via the submit_pulse / get_pulse_today /
// get_pulse_sentiment definer RPCs — no localStorage, no fabricated data).
import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth.jsx'
import { sb } from '../lib/supabase'
import { companyName } from '../lib/config.js'

function greeting() { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening' }
const isUuid = (v) => typeof v === 'string' && /^[0-9a-f-]{36}$/i.test(v)

// Viva-analog modules → the {companyName()} screens that power them.
const MODULES = [
  { key: 'connections', icon: '📰', name: 'Connections', viva: 'Viva Connections', desc: 'Company news, broadcasts & announcements in one feed.', to: '/comms', accent: 'var(--t-accent)' },
  { key: 'learning',    icon: '🎓', name: 'Learning',    viva: 'Viva Learning',    desc: 'Your courses, certifications & required training.', to: '/training', accent: '#a78bfa' },
  { key: 'goals',       icon: '🎯', name: 'Goals',       viva: 'Viva Goals',       desc: 'Your goals, targets & OKRs — track progress.', to: '/goals', accent: 'var(--t-success)' },
  { key: 'insights',    icon: '📊', name: 'Insights',    viva: 'Viva Insights',    desc: 'Your work patterns, hours & wellbeing signals.', to: '/myhome', accent: '#00e5ff' },
  { key: 'recognition', icon: '🏆', name: 'Recognition', viva: 'Viva Engage',      desc: 'Kudos, compliments & leaderboards.', to: '/compliments', accent: 'var(--t-warn)' },
  { key: 'community',   icon: '💬', name: 'Community',    viva: 'Viva Engage',      desc: 'Team chat, daily huddle & the crew.', to: '/chat', accent: 'var(--t-accent)' },
  { key: 'knowledge',   icon: '📚', name: 'Knowledge',   viva: 'Viva Topics',      desc: 'Handbook, policies & documents you need.', to: '/manual', accent: '#f59e0b' },
  { key: 'meetings',    icon: '🗓️', name: 'Meetings',    viva: 'Viva',             desc: 'Your meetings, 1:1s & agendas.', to: '/meetings', accent: '#7c4dff' },
]

const MOODS = [
  { v: 5, e: '😄', label: 'Great' },
  { v: 4, e: '🙂', label: 'Good' },
  { v: 3, e: '😐', label: 'Okay' },
  { v: 2, e: '😕', label: 'Meh' },
  { v: 1, e: '😞', label: 'Rough' },
]

export default function Experience() {
  const { session } = useAuth()
  const nav = useNavigate()
  const person = session?.person
  const name = (person?.full_name || 'there').split(' ')[0]
  const pid = person?.id

  // Today's check-in (from the DB), the mood picker, and live team sentiment.
  const [pulse, setPulse] = useState(null)
  const [loadingPulse, setLoadingPulse] = useState(true)
  const [moodSel, setMoodSel] = useState(null)
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const [sentiment, setSentiment] = useState(null) // { avg, count } for the team today

  // Anything below "Good" (mood < 4) requires a reason, and HR + the COO are notified.
  const lowMood = moodSel != null && moodSel < 4

  // Load THIS person's check-in for today from the HR brain.
  const loadToday = useCallback(async () => {
    if (!isUuid(pid)) { setPulse(null); setLoadingPulse(false); return }
    setLoadingPulse(true)
    const { data, error } = await sb.rpc('get_pulse_today', { p_person_id: pid })
    if (error) { setErr('Could not load your check-in.'); setLoadingPulse(false); return }
    const row = Array.isArray(data) ? data[0] : data
    setPulse(row && row.mood != null ? row : null)
    setLoadingPulse(false)
  }, [pid])

  // Load live team sentiment (durable aggregate across everyone, all devices).
  const loadSentiment = useCallback(async () => {
    const { data, error } = await sb.rpc('get_pulse_sentiment', { p_node_ids: null })
    if (error) return
    const row = Array.isArray(data) ? data[0] : data
    const count = row ? Number(row.checkins) || 0 : 0
    setSentiment(count > 0 ? { avg: Number(row.avg_mood) || 0, count } : null)
  }, [])

  useEffect(() => { loadToday(); loadSentiment() }, [loadToday, loadSentiment])

  const submitPulse = async () => {
    if (!moodSel || saving) return
    if (lowMood && !note.trim()) return // reason required
    if (!isUuid(pid)) { setErr('Please sign in to check in.'); return }
    setSaving(true); setErr('')
    // Durable persistence to the HR brain; low mood (<Good) is flagged server-side
    // and surfaced to HR + the COO via get_pulse_flags.
    const { error } = await sb.rpc('submit_pulse', {
      p_person_id: pid,
      p_person_name: person?.full_name || 'Employee',
      p_mood: moodSel,
      p_note: note.trim() || null,
    })
    setSaving(false)
    if (error) { setErr('Could not save your check-in. Please try again.'); return }
    setMoodSel(null); setNote('')
    await loadToday()
    await loadSentiment()
  }

  const ready = moodSel && (!lowMood || note.trim()) && !saving
  const card = { background: 'var(--t-surface)', border: '1px solid var(--t-line)', padding: 16, cursor: 'pointer', transition: 'border-color .15s, transform .1s' }

  return (
    <div style={{ color: 'var(--t-text)', fontSize: 13 }}>
      {/* Hero */}
      <div style={{ background: 'linear-gradient(135deg, rgba(0,229,255,0.08), rgba(124,77,255,0.06), transparent)', border: '1px solid var(--t-line)', padding: '22px 24px', marginBottom: 18 }}>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.12em', color: 'var(--t-accent)', textTransform: 'uppercase', marginBottom: 6 }}>{companyName()} EXPERIENCE</div>
        <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-.4px' }}>{greeting()}, {name} 👋</div>
        <div style={{ fontSize: 13, color: 'var(--t-text-muted)', marginTop: 4 }}>Your personalized hub — learning, goals, recognition, community & wellbeing, all in one place.</div>
      </div>

      {/* Pulse check-in (net-new Viva Pulse analog) */}
      <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', padding: '16px 20px', marginBottom: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 18 }}>💗</span>
          <span style={{ fontSize: 14, fontWeight: 800 }}>Daily Pulse</span>
          <span style={{ fontSize: 11, color: 'var(--t-text-muted)' }}>· How are you feeling at work today?</span>
          {sentiment && (
            <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--t-text-muted)' }}>Team today: <b style={{ color: 'var(--t-accent)' }}>{sentiment.avg.toFixed(1)}/5</b> · {sentiment.count} check-in{sentiment.count === 1 ? '' : 's'} · live</span>
          )}
        </div>

        {err && (
          <div style={{ background: 'rgba(255,80,80,0.12)', border: '1px solid var(--t-danger)', padding: '8px 12px', marginBottom: 10, fontSize: 12, color: 'var(--t-text)' }}>{err}</div>
        )}

        {loadingPulse ? (
          <div style={{ fontSize: 12, color: 'var(--t-text-muted)', padding: '4px 0' }}>Loading your check-in…</div>
        ) : pulse ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 13 }}>
            <span style={{ fontSize: 28 }}>{MOODS.find(m => m.v === pulse.mood)?.e}</span>
            <div>
              <div style={{ fontWeight: 700 }}>Thanks — checked in as <span style={{ color: 'var(--t-accent)' }}>{MOODS.find(m => m.v === pulse.mood)?.label}</span></div>
              {pulse.note && <div style={{ fontSize: 12, color: 'var(--t-text-muted)', marginTop: 2 }}>"{pulse.note}"</div>}
              <button onClick={() => setPulse(null)} style={{ marginTop: 6, background: 'transparent', border: '1px solid var(--t-line)', color: 'var(--t-text-muted)', fontSize: 11, padding: '3px 10px', cursor: 'pointer' }}>Update</button>
            </div>
          </div>
        ) : (
          <div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
              {MOODS.map(m => (
                <button key={m.v} onClick={() => setMoodSel(m.v)} title={m.label}
                  style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, padding: '8px 14px', cursor: 'pointer', background: moodSel === m.v ? 'rgba(0,229,255,0.12)' : 'var(--t-surface-2)', border: `1px solid ${moodSel === m.v ? 'var(--t-accent)' : 'var(--t-line)'}` }}>
                  <span style={{ fontSize: 22 }}>{m.e}</span>
                  <span style={{ fontSize: 10, fontWeight: 700, color: moodSel === m.v ? 'var(--t-accent)' : 'var(--t-text-muted)' }}>{m.label}</span>
                </button>
              ))}
            </div>
            {lowMood && (
              <div style={{ background: 'rgba(255,184,0,0.08)', border: '1px solid var(--t-warn)', padding: '10px 12px', marginBottom: 10, fontSize: 12, color: 'var(--t-text)', lineHeight: 1.5 }}>
                💛 <b>We need you feeling good — good vibes only!</b> Each shift our energy should be happy & energetic; it's contagious and it drives sales. Please tell us <b>why you're not feeling great</b> so we can help. <span style={{ color: 'var(--t-warn)', fontWeight: 700 }}>HR and the COO will be messaged.</span>
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <input value={note} onChange={e => setNote(e.target.value)}
                placeholder={lowMood ? 'Required — tell us why you\'re not feeling great…' : 'Add a note (optional, private to HR)…'}
                style={{ flex: 1, minWidth: 220, background: 'var(--t-surface-2)', border: `1px solid ${lowMood && !note.trim() ? 'var(--t-warn)' : 'var(--t-line)'}`, color: 'var(--t-text)', padding: '8px 10px', fontSize: 12, outline: 'none' }} />
              <button onClick={submitPulse} disabled={!ready} title={lowMood && !note.trim() ? 'A reason is required for this mood' : ''} style={{ background: ready ? 'var(--t-accent)' : 'var(--t-surface-2)', color: ready ? '#04121a' : 'var(--t-text-faint)', border: 'none', padding: '0 18px', fontSize: 12, fontWeight: 700, cursor: ready ? 'pointer' : 'not-allowed' }}>{saving ? 'Saving…' : 'Check in'}</button>
            </div>
          </div>
        )}
      </div>

      {/* Module grid — Viva analogs */}
      <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.08em', color: 'var(--t-text-muted)', textTransform: 'uppercase', marginBottom: 10 }}>Your Modules</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 12 }}>
        {MODULES.map(m => (
          <div key={m.key} onClick={() => nav(m.to)} className="exp-card" style={{ ...card, borderTop: `2px solid ${m.accent}` }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = m.accent }} onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--t-line)'; e.currentTarget.style.borderTopColor = m.accent }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <span style={{ fontSize: 22 }}>{m.icon}</span>
              <div>
                <div style={{ fontSize: 14, fontWeight: 800 }}>{m.name}</div>
                <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--t-text-faint)', letterSpacing: '.04em' }}>our {m.viva}</div>
              </div>
              <span style={{ marginLeft: 'auto', color: m.accent, fontWeight: 800 }}>→</span>
            </div>
            <div style={{ fontSize: 12, color: 'var(--t-text-muted)', lineHeight: 1.45 }}>{m.desc}</div>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 16, fontSize: 11, color: 'var(--t-text-faint)' }}>
        This is our own employee-experience layer, inspired by Microsoft Viva — every module runs on {companyName()}'s real data. More depth (org-wide Insights analytics, Pulse survey campaigns, communities) rolling out next.
      </div>
    </div>
  )
}
