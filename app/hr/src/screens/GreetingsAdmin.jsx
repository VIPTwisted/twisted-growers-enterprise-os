// GreetingsAdmin.jsx — COO approval console for AI-proposed greetings.
// The engine proposes fresh energetic greetings for review; the COO approves or
// rejects here. Approved lines join the login & clock-in rotation.
//
// Data layer is 100% real: everything reads from / writes to the HR database via
// SECURITY DEFINER RPCs (get_greetings, get_greetings_summary, approve_greeting,
// reject_greeting, greetings_generate_batch). No localStorage, no client-side
// generation — proposals are persisted rows the whole org shares.
import { useState, useCallback, useEffect } from 'react'
import { useAuth } from '../lib/auth.jsx'
import { sb, getSession } from '../lib/supabase'
import { BASE_GREETINGS } from '../lib/greetings.js'   // built-in curated rotation (real product content)

const COO_RX = /admin|owner|coo|ceo|cfo|president|chief/i

const st = {
  wrap: { padding: '24px 28px', color: 'var(--t-text)', minHeight: '100vh', background: 'var(--t-bg)' },
  h1: { fontSize: 20, fontWeight: 800, letterSpacing: '.05em', margin: 0, textTransform: 'uppercase' },
  sub: { fontSize: 11, color: 'var(--t-text-muted)', marginTop: 3 },
  kpiRow: { display: 'flex', gap: 10, flexWrap: 'wrap', margin: '18px 0' },
  kpi: { background: 'var(--t-surface)', border: '1px solid var(--t-line)', borderTop: '3px solid var(--t-accent)', padding: '14px 18px', flex: 1, minWidth: 130 },
  kpiLabel: { fontSize: 10, fontWeight: 700, letterSpacing: '.1em', color: 'var(--t-text-muted)', textTransform: 'uppercase', marginBottom: 8 },
  kpiVal: { fontSize: 28, fontWeight: 800, lineHeight: 1 },
  card: { background: 'var(--t-surface)', border: '1px solid var(--t-line)', marginBottom: 16 },
  head: { padding: '11px 16px', borderBottom: '1px solid var(--t-line)', background: 'var(--t-surface-2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase' },
  body: { padding: 16 },
  btn: { fontSize: 11, fontWeight: 700, padding: '6px 12px', background: 'var(--t-accent)', border: 'none', color: '#04121a', cursor: 'pointer' },
  ghost: { fontSize: 11, fontWeight: 600, padding: '6px 12px', background: 'var(--t-surface)', border: '1px solid var(--t-line)', color: 'var(--t-text-muted)', cursor: 'pointer' },
  row: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '9px 0', borderBottom: '1px solid var(--t-line)' },
  errBar: { background: 'var(--t-surface)', border: '1px solid var(--t-danger)', borderLeft: '3px solid var(--t-danger)', color: 'var(--t-danger)', padding: '10px 14px', fontSize: 12, margin: '14px 0' },
  faint: { fontSize: 12, color: 'var(--t-text-faint)' },
}

export default function GreetingsAdmin() {
  const { session } = useAuth()
  const isCOO = COO_RX.test(session?.person?.role_name || '')

  const [pending, setPending] = useState([])
  const [approved, setApproved] = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)

  const load = useCallback(async () => {
    setErr(null)
    const { data, error } = await sb.rpc('get_greetings', {})
    if (error) { setErr(error.message || 'Could not load greetings.'); setLoading(false); return }
    const rows = Array.isArray(data) ? data : []
    setPending(rows.filter(g => g.status === 'pending'))
    setApproved(rows.filter(g => g.status === 'approved'))
    setLoading(false)
  }, [])

  useEffect(() => { if (isCOO) load(); else setLoading(false) }, [isCOO, load])

  const decide = useCallback(async (fn, id) => {
    if (busy) return
    setBusy(true); setErr(null)
    const me = getSession()
    const { error } = await sb.rpc(fn, { p_id: id, p_actor_id: me.id ?? null, p_actor_name: me.full_name ?? null })
    if (error) setErr(error.message || 'Action failed — nothing was saved.')
    await load()
    setBusy(false)
  }, [busy, load])

  const generate = useCallback(async () => {
    if (busy) return
    setBusy(true); setErr(null)
    const me = getSession()
    const { data, error } = await sb.rpc('greetings_generate_batch', { p_actor_id: me.id ?? null, p_actor_name: me.full_name ?? null })
    if (error) { setErr(error.message || 'Could not request a new batch.'); setBusy(false); return }
    await load()
    setBusy(false)
    if (data && data.generated === 0) {
      const when = data.next_due ? new Date(data.next_due).toLocaleDateString() : null
      alert(when ? `Next AI batch is not due yet — eligible on ${when} (every 30 days).` : 'Next AI batch is not due yet (every 30 days).')
    }
  }, [busy, load])

  if (!isCOO) return <div style={st.wrap}><h1 style={st.h1}>Greeting Approvals</h1><div style={st.sub}>COO / executive access required.</div></div>

  const poolCount = BASE_GREETINGS.length + approved.length

  return (
    <div style={st.wrap}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h1 style={st.h1}>AI Greeting Approvals</h1>
          <div style={st.sub}>The AI proposes fresh, energetic greetings every 30 days. Approve the good ones — they join the login &amp; clock-in rotation. Good vibes only.</div>
        </div>
        <button style={{ ...st.ghost, opacity: busy ? 0.6 : 1, cursor: busy ? 'default' : 'pointer' }} disabled={busy} onClick={generate}>
          {busy ? 'Working…' : 'Check for new AI batch'}
        </button>
      </div>

      {err && <div style={st.errBar}>{err}</div>}

      <div style={st.kpiRow}>
        <div style={st.kpi}><div style={st.kpiLabel}>Active greetings</div><div style={st.kpiVal}>{loading ? '—' : poolCount}</div></div>
        <div style={{ ...st.kpi, borderTopColor: 'var(--t-warn)' }}><div style={st.kpiLabel}>Awaiting approval</div><div style={{ ...st.kpiVal, color: pending.length ? 'var(--t-warn)' : 'var(--t-text)' }}>{loading ? '—' : pending.length}</div></div>
        <div style={{ ...st.kpi, borderTopColor: 'var(--t-success)' }}><div style={st.kpiLabel}>Built-in</div><div style={st.kpiVal}>{BASE_GREETINGS.length}</div></div>
        <div style={{ ...st.kpi, borderTopColor: 'var(--t-success)' }}><div style={st.kpiLabel}>COO-approved</div><div style={st.kpiVal}>{loading ? '—' : approved.length}</div></div>
      </div>

      <div style={st.card}>
        <div style={st.head}><span>Pending AI Proposals</span><span style={{ color: 'var(--t-text-muted)', fontWeight: 600, textTransform: 'none' }}>{loading ? '' : `${pending.length} to review`}</span></div>
        <div style={st.body}>
          {loading && <div style={st.faint}>Loading proposals…</div>}
          {!loading && pending.length === 0 && <div style={st.faint}>Nothing pending. Use “Check for new AI batch” — a fresh set of proposals becomes available every 30 days.</div>}
          {!loading && pending.map(g => (
            <div key={g.id} style={st.row}>
              <span style={{ fontSize: 13, flex: 1 }}>{g.text}</span>
              <div style={{ display: 'flex', gap: 6 }}>
                <button style={{ ...st.btn, background: 'var(--t-success)', opacity: busy ? 0.6 : 1, cursor: busy ? 'default' : 'pointer' }} disabled={busy} onClick={() => decide('approve_greeting', g.id)}>Approve</button>
                <button style={{ ...st.ghost, color: 'var(--t-danger)', opacity: busy ? 0.6 : 1, cursor: busy ? 'default' : 'pointer' }} disabled={busy} onClick={() => decide('reject_greeting', g.id)}>Reject</button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {!loading && approved.length > 0 && (
        <div style={st.card}>
          <div style={st.head}><span>Approved Custom Greetings</span></div>
          <div style={st.body}>
            {approved.map(g => <div key={g.id} style={{ fontSize: 12, padding: '7px 0', borderBottom: '1px solid var(--t-line)', color: 'var(--t-text)' }}>✓ {g.text}</div>)}
          </div>
        </div>
      )}
    </div>
  )
}
