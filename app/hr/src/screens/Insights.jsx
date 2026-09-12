// Insights.jsx — Twisted Growers Insights (Microsoft Viva Insights analog). People-and-
// wellbeing intelligence (distinct from the ops/revenue Analytics screen):
// personal wellbeing + team engagement, wellbeing risk, and recommendations a
// human acts on. All numbers are REAL and come from the HR brain's Daily Pulse
// (pulse_checkins) via security-definer RPCs — get_pulse_sentiment,
// get_pulse_flags, get_pulse_today. Nothing is synthesized: where a signal has
// no data source yet we render an honest empty state instead of a fake number.
import { useState, useEffect, useMemo } from 'react'
import { useAuth } from '../lib/auth.jsx'
import { useScope } from '../lib/scope.jsx'
import { sb } from '../lib/supabase'

const EXEC_RX = /admin|owner|coo|ceo|cfo|president|chief|hr|manager/i
const UUID_RX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MOOD_LABEL = { 5: 'Great', 4: 'Good', 3: 'Okay', 2: 'Meh', 1: 'Rough' }
const moodColor = (m) => (m >= 4 ? 'var(--t-success)' : m >= 3 ? 'var(--t-warn)' : 'var(--t-danger)')

const st = {
  wrap: { padding: '24px 28px', color: 'var(--t-text)', minHeight: '100vh', background: 'var(--t-bg)' },
  h1: { fontSize: 20, fontWeight: 800, letterSpacing: '.05em', margin: 0, textTransform: 'uppercase' },
  sub: { fontSize: 11, color: 'var(--t-text-muted)', marginTop: 3 },
  tabs: { display: 'flex', gap: 4, margin: '16px 0 20px' },
  tab: (a) => ({ padding: '8px 16px', fontSize: 12, fontWeight: 700, cursor: 'pointer', border: '1px solid var(--t-line)', borderBottom: a ? '2px solid var(--t-accent)' : '1px solid var(--t-line)', background: a ? 'var(--t-surface)' : 'transparent', color: a ? 'var(--t-text)' : 'var(--t-text-muted)' }),
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14, marginBottom: 22 },
  card: { background: 'var(--t-surface)', border: '1px solid var(--t-line)', borderTop: '3px solid var(--t-accent)', padding: '16px 18px' },
  cLabel: { fontSize: 10, fontWeight: 700, letterSpacing: '.1em', color: 'var(--t-text-muted)', textTransform: 'uppercase', marginBottom: 8 },
  cVal: { fontSize: 30, fontWeight: 800, lineHeight: 1 },
  cSub: { fontSize: 11, color: 'var(--t-text-muted)', marginTop: 6 },
  bar: () => ({ height: 6, background: 'var(--t-line)', marginTop: 10, position: 'relative' }),
  fill: (pct, color) => ({ height: '100%', width: `${Math.max(0, Math.min(100, pct))}%`, background: color }),
  recWrap: { background: 'var(--t-surface)', border: '1px solid var(--t-line)', borderLeft: '3px solid var(--t-accent)', padding: '14px 16px', marginBottom: 10, display: 'flex', gap: 12, alignItems: 'flex-start' },
  sectionLabel: { fontSize: 11, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--t-text-muted)', margin: '4px 0 12px' },
  empty: { background: 'var(--t-surface)', border: '1px dashed var(--t-line)', padding: '18px 20px', color: 'var(--t-text-muted)', fontSize: 12, lineHeight: 1.6, marginBottom: 22 },
  flagRow: { display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0' },
  flagMood: (m) => ({ fontSize: 11, fontWeight: 800, padding: '3px 8px', color: '#fff', background: moodColor(m), whiteSpace: 'nowrap' }),
}

function InsightCard({ label, value, sub, pct, color = 'var(--t-accent)', accent }) {
  return (
    <div style={{ ...st.card, borderTopColor: accent || color }}>
      <div style={st.cLabel}>{label}</div>
      <div style={{ ...st.cVal, color }}>{value}</div>
      {sub && <div style={st.cSub}>{sub}</div>}
      {pct != null && <div style={st.bar()}><div style={st.fill(pct, color)} /></div>}
    </div>
  )
}

function Recommendation({ icon, title, body, tag }) {
  return (
    <div style={st.recWrap}>
      <span style={{ fontSize: 18 }}>{icon}</span>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 3 }}>{title}</div>
        <div style={{ fontSize: 12, color: 'var(--t-text-muted)', lineHeight: 1.5 }}>{body}</div>
      </div>
      {tag && <span style={{ fontSize: 9, fontWeight: 800, padding: '3px 8px', background: 'var(--t-accent)', color: '#fff', letterSpacing: '.05em', whiteSpace: 'nowrap' }}>{tag}</span>}
    </div>
  )
}

export default function Insights() {
  const { session } = useAuth()
  const { locationIds } = useScope()
  const person = session?.person || {}
  const isManager = EXEC_RX.test(person.role_name || '')
  const [tab, setTab] = useState('personal')

  // Node scope for team-level reads (null = all reachable locations).
  const nodeIds = useMemo(
    () => (Array.isArray(locationIds) && locationIds.length ? locationIds : null),
    [locationIds]
  )

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [sentiment, setSentiment] = useState({ avg: null, n: 0 }) // team, real
  const [flags, setFlags] = useState([])                          // low-mood escalations, real
  const [myToday, setMyToday] = useState(null)                    // my check-in today, real (null = none)

  useEffect(() => {
    let alive = true
    setLoading(true)
    setError(null)
    const pid = person.id
    const jobs = [
      sb.rpc('get_pulse_sentiment', { p_node_ids: nodeIds }),
      sb.rpc('get_pulse_flags', { p_node_ids: nodeIds }),
      pid && UUID_RX.test(String(pid))
        ? sb.rpc('get_pulse_today', { p_person_id: pid })
        : Promise.resolve({ data: null, error: null }),
    ]
    Promise.all(jobs)
      .then(([s, f, t]) => {
        if (!alive) return
        if (s.error || f.error) {
          setError((s.error || f.error).message || 'Could not load insights.')
          return
        }
        const row = Array.isArray(s.data) ? s.data[0] : s.data
        setSentiment({
          avg: row && row.avg_mood != null ? Number(row.avg_mood) : null,
          n: row && row.checkins != null ? Number(row.checkins) : 0,
        })
        setFlags(Array.isArray(f.data) ? f.data : [])
        setMyToday(t && t.data && !t.error ? t.data : null)
      })
      .catch((e) => { if (alive) setError(e?.message || String(e)) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [nodeIds, person.id])

  const myMood = myToday && typeof myToday.mood === 'number' ? myToday.mood : null

  return (
    <div style={st.wrap}>
      <div>
        <h1 style={st.h1}>Insights</h1>
        <div style={st.sub}>People &amp; wellbeing intelligence — engagement and wellbeing signals from the Daily Pulse. Inspired by Microsoft Viva Insights.</div>
      </div>

      <div style={st.tabs}>
        <div style={st.tab(tab === 'personal')} onClick={() => setTab('personal')}>My Insights</div>
        {isManager && <div style={st.tab(tab === 'team')} onClick={() => setTab('team')}>Team &amp; Org</div>}
      </div>

      {loading && <div style={st.empty}>Loading your insights…</div>}
      {!loading && error && (
        <div style={{ ...st.empty, borderColor: 'var(--t-danger)', color: 'var(--t-danger)' }}>
          Couldn&apos;t load insights right now. {error}
        </div>
      )}

      {!loading && !error && tab === 'personal' && (
        <>
          <div style={st.grid}>
            <InsightCard
              label="My Wellbeing"
              value={myMood != null ? `${myMood}/5` : '—'}
              sub={myMood != null ? `Your Daily Pulse today: ${MOOD_LABEL[myMood] || myMood}` : "You haven't checked in today"}
              pct={myMood != null ? (myMood / 5) * 100 : null}
              color={myMood != null ? moodColor(myMood) : 'var(--t-text-muted)'}
            />
          </div>

          <div style={st.sectionLabel}>Recommended for you</div>
          {myMood == null && (
            <Recommendation icon="👋" title="Check in with your Daily Pulse" body="Take five seconds to log how your shift is going. Your check-ins are what power these insights — and they let HR know when someone needs support." tag="ENGAGE" />
          )}
          {myMood != null && myMood < 4 && (
            <Recommendation icon="🌤️" title="Your wellbeing dipped today" body="Consider talking to your manager about workload, and make sure you're taking your scheduled breaks. Confidential support is available in the Benefits center." tag="WELLBEING" />
          )}
          {myMood != null && myMood >= 4 && (
            <Recommendation icon="✅" title="You're in good shape today" body="Your check-in looks healthy. Keep it up — and consider recognizing a teammate who helped you this shift." tag="STRONG" />
          )}

          <div style={{ ...st.empty, marginTop: 6 }}>
            Recognition, training progress, and break-adherence signals aren&apos;t tracked in the HR brain yet — they&apos;ll appear here automatically once those modules start recording data. No estimates are shown in their place.
          </div>
        </>
      )}

      {!loading && !error && tab === 'team' && isManager && (
        <>
          <div style={st.grid}>
            <InsightCard
              label="Team Sentiment"
              value={sentiment.n > 0 && sentiment.avg != null ? `${sentiment.avg.toFixed(1)}/5` : '—'}
              sub={sentiment.n > 0 ? `From ${sentiment.n} check-in${sentiment.n === 1 ? '' : 's'}` : 'No check-ins yet'}
              pct={sentiment.n > 0 && sentiment.avg != null ? (sentiment.avg / 5) * 100 : null}
              color={sentiment.avg != null && sentiment.avg >= 3.5 ? 'var(--t-success)' : sentiment.n > 0 ? 'var(--t-warn)' : 'var(--t-text-muted)'}
            />
            <InsightCard
              label="Check-ins Logged"
              value={sentiment.n}
              sub="Daily Pulse responses in scope"
              color="var(--t-accent)"
            />
            <InsightCard
              label="Wellbeing Flags"
              value={flags.length}
              sub={flags.length ? 'Low-mood check-ins — HR & COO notified' : 'No escalations right now'}
              color={flags.length ? 'var(--t-danger)' : 'var(--t-success)'}
              accent={flags.length ? 'var(--t-danger)' : 'var(--t-success)'}
            />
          </div>

          <div style={st.sectionLabel}>Wellbeing flags — HR reviews &amp; acts</div>
          {flags.length === 0 ? (
            <div style={st.empty}>No wellbeing flags in the selected scope. When someone logs a below-&ldquo;Good&rdquo; Daily Pulse, it lands here for HR and the COO to follow up.</div>
          ) : (
            <div style={{ ...st.card, borderTopColor: 'var(--t-danger)', marginBottom: 22 }}>
              {flags.map((f, i) => {
                const label = f.mood_label || MOOD_LABEL[f.mood] || 'Low'
                const when = f.created_at || f.at
                return (
                  <div key={f.id || i} style={{ ...st.flagRow, borderBottom: i < flags.length - 1 ? '1px solid var(--t-line)' : 'none' }}>
                    <span style={st.flagMood(f.mood)}>{label}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700 }}>{f.person_name || 'Employee'}</div>
                      <div style={{ fontSize: 12, color: 'var(--t-text-muted)' }}>{f.note ? f.note : 'No reason given'}</div>
                    </div>
                    {when && <span style={{ fontSize: 11, color: 'var(--t-text-muted)', whiteSpace: 'nowrap' }}>{new Date(when).toLocaleString()}</span>}
                  </div>
                )
              })}
            </div>
          )}

          <div style={st.sectionLabel}>Recommendations</div>
          {sentiment.n === 0 && (
            <Recommendation icon="📊" title="No engagement baseline yet" body="Encourage the team to complete their Daily Pulse each shift. A few days of check-ins gives you a sentiment baseline you can trend over time." tag="ACTION" />
          )}
          {sentiment.avg != null && sentiment.avg < 3.5 && sentiment.n > 0 && (
            <Recommendation icon="💬" title="Team sentiment is soft" body="Daily Pulse sentiment is below target. Hold a short listening session with the team and follow up on any open wellbeing flags." tag="ENGAGE" />
          )}
          {flags.length > 0 && (
            <Recommendation icon="🔥" title={`${flags.length} wellbeing flag${flags.length === 1 ? '' : 's'} need follow-up`} body="One or more team members reported a low mood. Review OT distribution and coverage gaps, and reach out privately to check in." tag="RISK" />
          )}
          {sentiment.avg != null && sentiment.avg >= 3.8 && flags.length === 0 && sentiment.n > 0 && (
            <Recommendation icon="🌟" title="Engagement is strong" body="Sentiment is healthy and there are no open wellbeing flags. Capture what's working and keep the Daily Pulse habit going." tag="STRONG" />
          )}

          <div style={{ ...st.empty, marginTop: 6 }}>
            eNPS and survey-campaign metrics require the survey module, which isn&apos;t enabled on the HR brain yet. Rather than show a modeled number, this space stays empty until real survey responses exist.
          </div>
        </>
      )}
    </div>
  )
}
