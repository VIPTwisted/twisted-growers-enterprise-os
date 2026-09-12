// Pulse.jsx — Twisted Growers Pulse (Microsoft Viva Pulse analog). HR authors survey
// campaigns, targets roles/locations, and reads sentiment analytics; employees
// answer active surveys once. Fully wired to the HR brain (Supabase project
// fxetuqjryttnypgepsru, schema hr) via SECURITY DEFINER RPCs — no localStorage, no seed data.
import { useState, useCallback, useMemo, useEffect } from 'react'
import { useAuth } from '../lib/auth.jsx'
import { sb, getSession } from '../lib/supabase'
import DrillDown from '../components/DrillDown.jsx'

const EXEC_RX = /admin|owner|coo|ceo|cfo|president|chief|hr|manager/i
// Audience picker catalogs + starter templates are static UI config (option lists
// the author chooses from) — not records. No fabricated data is ever shown as real.
const ROLES = ['Associate', 'Key Holder', 'Store Manager', 'HR Manager', 'COO']
const LOCATIONS = ['Orange', 'Hartford', 'Manchester', 'Southington', 'Warehouse / Distribution']

// question types: rating (1-5), nps (0-10), yesno, choice, text
const TEMPLATES = [
  { id: 'enps', title: 'Employee Net Promoter (eNPS)', questions: [
    { id: 'q1', type: 'nps', text: 'How likely are you to recommend Twisted Growers as a place to work?' },
    { id: 'q2', type: 'text', text: 'What is the main reason for your score?' },
  ] },
  { id: 'manager', title: 'Manager Effectiveness', questions: [
    { id: 'q1', type: 'rating', text: 'My manager gives me clear direction.' },
    { id: 'q2', type: 'rating', text: 'My manager recognizes good work.' },
    { id: 'q3', type: 'rating', text: 'I feel comfortable raising concerns with my manager.' },
  ] },
  { id: 'burnout', title: 'Workload & Wellbeing', questions: [
    { id: 'q1', type: 'rating', text: 'My workload is manageable.' },
    { id: 'q2', type: 'yesno', text: 'Have you felt burned out in the last 2 weeks?' },
    { id: 'q3', type: 'text', text: 'What would make your work life better?' },
  ] },
  { id: 'recognition', title: 'Recognition & Belonging', questions: [
    { id: 'q1', type: 'rating', text: 'I feel valued for the work I do.' },
    { id: 'q2', type: 'choice', text: 'How often do you receive recognition?', options: ['Weekly', 'Monthly', 'Rarely', 'Never'] },
  ] },
  { id: 'onboarding', title: 'Onboarding Experience', questions: [
    { id: 'q1', type: 'rating', text: 'My onboarding prepared me for my role.' },
    { id: 'q2', type: 'text', text: 'What was missing from your onboarding?' },
  ] },
]

const QTYPE_LABEL = { rating: 'Rating 1–5', nps: 'NPS 0–10', yesno: 'Yes / No', choice: 'Multiple choice', text: 'Open text' }
// local id only for draft question rows inside the compose form (never persisted as-is)
let _qseq = 0
const draftQid = () => `q${++_qseq}-${Date.now().toString(36)}`

const st = {
  wrap: { padding: '24px 28px', color: 'var(--t-text)', minHeight: '100vh', background: 'var(--t-bg)' },
  h1: { fontSize: 20, fontWeight: 800, letterSpacing: '.05em', margin: 0, textTransform: 'uppercase' },
  sub: { fontSize: 11, color: 'var(--t-text-muted)', marginTop: 3 },
  tabs: { display: 'flex', gap: 4, margin: '16px 0 20px' },
  tab: (a) => ({ padding: '8px 16px', fontSize: 12, fontWeight: 700, cursor: 'pointer', border: '1px solid var(--t-line)', borderBottom: a ? '2px solid var(--t-accent)' : '1px solid var(--t-line)', background: a ? 'var(--t-surface)' : 'transparent', color: a ? 'var(--t-text)' : 'var(--t-text-muted)' }),
  kpiRow: { display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 20 },
  kpi: { background: 'var(--t-surface)', border: '1px solid var(--t-line)', borderTop: '3px solid var(--t-accent)', padding: '16px 18px', flex: 1, minWidth: 130, cursor: 'pointer' },
  kpiLabel: { fontSize: 10, fontWeight: 700, letterSpacing: '.1em', color: 'var(--t-text-muted)', textTransform: 'uppercase', marginBottom: 8 },
  kpiVal: { fontSize: 28, fontWeight: 800, lineHeight: 1 },
  card: { background: 'var(--t-surface)', border: '1px solid var(--t-line)', borderRadius: 0, marginBottom: 14 },
  cardHead: { padding: '11px 16px', borderBottom: '1px solid var(--t-line)', background: 'var(--t-surface-2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  cardBody: { padding: 16 },
  btn: { fontSize: 11, fontWeight: 700, padding: '8px 15px', background: 'var(--t-accent)', border: 'none', color: '#fff', borderRadius: 0, cursor: 'pointer', letterSpacing: '.04em' },
  ghost: { fontSize: 11, fontWeight: 600, padding: '7px 13px', background: 'var(--t-surface)', border: '1px solid var(--t-line)', color: 'var(--t-text-muted)', borderRadius: 0, cursor: 'pointer' },
  inp: { fontSize: 12, padding: '8px 10px', background: 'var(--t-surface)', border: '1px solid var(--t-line)', color: 'var(--t-text)', borderRadius: 0, outline: 'none', width: '100%' },
  label: { fontSize: 10, fontWeight: 700, letterSpacing: '.08em', color: 'var(--t-text-muted)', textTransform: 'uppercase' },
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 9998, display: 'flex', justifyContent: 'center', alignItems: 'flex-start', padding: '40px 20px', overflowY: 'auto' },
  modal: { background: 'var(--t-surface)', border: '1px solid var(--t-line)', width: 'min(560px, 96vw)' },
  chip: (a) => ({ fontSize: 11, fontWeight: 600, padding: '4px 10px', border: '1px solid var(--t-line)', cursor: 'pointer', background: a ? 'var(--t-accent)' : 'var(--t-surface)', color: a ? '#fff' : 'var(--t-text-muted)' }),
  statusBadge: (s) => ({ fontSize: 9, fontWeight: 800, padding: '3px 8px', letterSpacing: '.05em', color: '#fff', background: s === 'active' ? 'var(--t-success)' : s === 'closed' ? 'var(--t-text-muted)' : 'var(--t-warn)' }),
  banner: { padding: '10px 14px', marginBottom: 14, fontSize: 12, border: '1px solid var(--t-danger)', color: 'var(--t-danger)', background: 'var(--t-surface)' },
  muted: { fontSize: 13, color: 'var(--t-text-muted)', padding: '20px 0' },
}

// admin-adjustable Daily Pulse enforcement (reminder timing + break-return gate + AI).
// Controlled — parent owns the value and persists every change to the HR brain.
function PulseEnforcementSettings({ value, onPatch, saving }) {
  const s = value
  const card = { background: 'var(--t-surface)', border: '1px solid var(--t-line)', borderTop: '3px solid var(--t-accent)', marginBottom: 16 }
  const row = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', borderBottom: '1px solid var(--t-line)', gap: 12, flexWrap: 'wrap' }
  const lbl = { fontSize: 13, fontWeight: 600, color: 'var(--t-text)' }
  const sub = { fontSize: 11, color: 'var(--t-text-muted)', marginTop: 2 }
  return (
    <div style={card}>
      <div style={{ padding: '11px 16px', borderBottom: '1px solid var(--t-line)', background: 'var(--t-surface-2)', fontSize: 11, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase' }}>
        💗 Daily Pulse Enforcement — required each shift{saving ? ' · saving…' : ''}
      </div>
      <div style={row}>
        <div><div style={lbl}>Reminder timing</div><div style={sub}>Fire the AI reminder this many minutes into the shift.</div></div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input type="number" min="0" max="480" value={s.reminderMins} onChange={e => onPatch({ reminderMins: Math.max(0, parseInt(e.target.value || '0', 10)) })} style={{ width: 70, textAlign: 'center', background: 'var(--t-surface-2)', border: '1px solid var(--t-line)', color: 'var(--t-text)', padding: '6px 8px', fontSize: 12 }} />
          <span style={{ fontSize: 11, color: 'var(--t-text-muted)' }}>min ({(s.reminderMins / 60).toFixed(1)} hr)</span>
        </div>
      </div>
      {[
        { k: 'enforceOnBreakReturn', t: 'Require before clocking back in from break', d: 'Staff must answer the pulse to end a break and resume their shift.' },
        { k: 'enforceOnClockIn', t: 'Require at clock-in', d: 'Prompt for the pulse right after clocking in.' },
        { k: 'aiReminder', t: 'AI reminder + required-each-shift warning', d: 'AI sends the reminder and reminds staff it is required every shift.' },
      ].map(o => (
        <div key={o.k} style={row}>
          <div><div style={lbl}>{o.t}</div><div style={sub}>{o.d}</div></div>
          <label style={{ position: 'relative', display: 'inline-block', width: 42, height: 22, flexShrink: 0 }}>
            <input type="checkbox" checked={!!s[o.k]} onChange={e => onPatch({ [o.k]: e.target.checked })} style={{ opacity: 0, width: 0, height: 0 }} />
            <span style={{ position: 'absolute', inset: 0, background: s[o.k] ? 'var(--t-success)' : 'var(--t-line)', borderRadius: 22, transition: '.2s' }} />
            <span style={{ position: 'absolute', height: 16, width: 16, left: s[o.k] ? 23 : 3, top: 3, background: '#fff', borderRadius: '50%', transition: '.2s' }} />
          </label>
        </div>
      ))}
    </div>
  )
}

const DEFAULT_SETTINGS = { reminderMins: 30, enforceOnClockIn: false, enforceOnBreakReturn: true, aiReminder: true }

export default function Pulse() {
  const { session } = useAuth()
  const person = session?.person || {}
  const pid = person.id || null
  const role = person.role_name || ''
  const isHR = EXEC_RX.test(role)
  const nodeIds = useMemo(() => (getSession().nodes || []).map(n => n.id), [])

  const [tab, setTab] = useState(isHR ? 'manage' : 'mine')
  const [camps, setCamps] = useState([])          // HR: all campaigns w/ response_count
  const [kpis, setKpis] = useState({ campaigns: 0, active: 0, total_responses: 0, enps: null })
  const [mine, setMine] = useState([])            // employee: active campaigns + responded flag
  const [settings, setSettings] = useState(DEFAULT_SETTINGS)
  const [savingSettings, setSavingSettings] = useState(false)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')

  const [compose, setCompose] = useState(false)
  const [analytics, setAnalytics] = useState(null)
  const [answering, setAnswering] = useState(null)
  const [drill, setDrill] = useState(null)

  const loadManage = useCallback(async () => {
    const [c, k] = await Promise.all([
      sb.rpc('get_pulse_campaigns', { p_node_ids: nodeIds.length ? nodeIds : null }),
      sb.rpc('get_pulse_kpis', { p_node_ids: nodeIds.length ? nodeIds : null }),
    ])
    if (c.error) throw c.error
    if (k.error) throw k.error
    setCamps(Array.isArray(c.data) ? c.data : [])
    setKpis(k.data || { campaigns: 0, active: 0, total_responses: 0, enps: null })
  }, [nodeIds])

  const loadMine = useCallback(async () => {
    if (!pid) { setMine([]); return }
    const { data, error } = await sb.rpc('get_my_pulse_surveys', { p_person_id: pid })
    if (error) throw error
    setMine(Array.isArray(data) ? data : [])
  }, [pid])

  const loadSettings = useCallback(async () => {
    const { data, error } = await sb.rpc('get_pulse_settings', { p_node_ids: nodeIds.length ? nodeIds : null })
    if (error) throw error
    if (data) setSettings({ ...DEFAULT_SETTINGS, ...data })
  }, [nodeIds])

  const refresh = useCallback(async () => {
    setErr('')
    try {
      const jobs = [loadMine()]
      if (isHR) jobs.push(loadManage(), loadSettings())
      await Promise.all(jobs)
    } catch (e) {
      setErr(e?.message || 'Could not load pulse data.')
    } finally {
      setLoading(false)
    }
  }, [isHR, loadMine, loadManage, loadSettings])

  useEffect(() => { refresh() }, [refresh])

  const patchSettings = useCallback(async (patch) => {
    const next = { ...settings, ...patch }
    setSettings(next)                 // optimistic
    setSavingSettings(true); setErr('')
    try {
      const { error } = await sb.rpc('set_pulse_settings', {
        p_reminder_mins: next.reminderMins,
        p_enforce_on_clock_in: next.enforceOnClockIn,
        p_enforce_break_return: next.enforceOnBreakReturn,
        p_ai_reminder: next.aiReminder,
      })
      if (error) throw error
      await loadSettings()
    } catch (e) {
      setErr(e?.message || 'Could not save settings.')
      await loadSettings()            // revert to server truth
    } finally {
      setSavingSettings(false)
    }
  }, [settings, loadSettings])

  const createCampaign = useCallback(async (c) => {
    setErr('')
    const { error } = await sb.rpc('create_pulse_campaign', {
      p_title: c.title,
      p_questions: c.questions,
      p_audience: c.audience,
      p_anonymous: c.anonymous,
      p_created_by: pid,
      p_created_by_name: person.full_name || null,
      p_node_id: nodeIds[0] || null,
    })
    if (error) { setErr(error.message || 'Could not create campaign.'); return }
    setCompose(false)
    await refresh()
  }, [pid, person.full_name, nodeIds, refresh])

  const setStatus = useCallback(async (id, status) => {
    setErr('')
    const { error } = await sb.rpc('set_pulse_campaign_status', { p_campaign_id: id, p_status: status })
    if (error) { setErr(error.message || 'Could not update campaign.'); return }
    await refresh()
  }, [refresh])

  const submitAnswers = useCallback(async (camp, answers) => {
    setErr('')
    const { error } = await sb.rpc('submit_pulse_response', {
      p_campaign_id: camp.id,
      p_person_id: pid,
      p_answers: answers,
      p_responder_name: person.full_name || null,
    })
    if (error) { setErr(error.message || 'Could not submit your response.'); return }
    setAnswering(null)
    await refresh()
  }, [pid, person.full_name, refresh])

  const myOpen = useMemo(() => mine.filter(c => !c.responded), [mine])
  const myDone = useMemo(() => mine.filter(c => c.responded), [mine])

  return (
    <div style={st.wrap}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 style={st.h1}>Pulse Surveys</h1>
          <div style={st.sub}>Listen at scale — targeted pulse campaigns with sentiment analytics. Inspired by Microsoft Viva Pulse.</div>
        </div>
        {isHR && <button style={st.btn} onClick={() => setCompose(true)}>+ New Campaign</button>}
      </div>

      {err && <div style={{ ...st.banner, marginTop: 14 }}>{err}</div>}

      <div style={st.tabs}>
        {isHR && <div style={st.tab(tab === 'manage')} onClick={() => setTab('manage')}>Manage Campaigns</div>}
        <div style={st.tab(tab === 'mine')} onClick={() => setTab('mine')}>My Surveys{myOpen.length ? ` (${myOpen.length})` : ''}</div>
      </div>

      {loading && <div style={st.muted}>Loading…</div>}

      {!loading && tab === 'manage' && isHR && (
        <>
          <PulseEnforcementSettings value={settings} onPatch={patchSettings} saving={savingSettings} />
          <div style={st.kpiRow}>
            <div style={st.kpi} onClick={() => setDrill({ title: 'All Campaigns', rows: camps.map(c => ({ ...c, responses: c.response_count })) })}>
              <div style={st.kpiLabel}>Campaigns</div><div style={st.kpiVal}>{kpis.campaigns}</div>
            </div>
            <div style={{ ...st.kpi, borderTopColor: 'var(--t-success)' }}>
              <div style={st.kpiLabel}>Active</div><div style={st.kpiVal}>{kpis.active}</div>
            </div>
            <div style={{ ...st.kpi, borderTopColor: 'var(--t-accent)' }}>
              <div style={st.kpiLabel}>Total Responses</div><div style={st.kpiVal}>{kpis.total_responses}</div>
            </div>
            <div style={{ ...st.kpi, borderTopColor: kpis.enps != null && kpis.enps >= 0 ? 'var(--t-success)' : 'var(--t-warn)' }}>
              <div style={st.kpiLabel}>eNPS</div><div style={st.kpiVal}>{kpis.enps == null ? '—' : kpis.enps}</div>
            </div>
          </div>

          {camps.length === 0 && <div style={st.muted}>No campaigns yet. Click “+ New Campaign” to launch your first pulse survey.</div>}
          {camps.map(c => (
            <div key={c.id} style={st.card}>
              <div style={st.cardHead}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <span style={{ fontSize: 13, fontWeight: 800 }}>{c.title}</span>
                  <span style={st.statusBadge(c.status)}>{(c.status || '').toUpperCase()}</span>
                  {c.anonymous && <span style={{ fontSize: 9, color: 'var(--t-text-muted)' }}>🔒 Anonymous</span>}
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button style={st.ghost} onClick={() => setAnalytics(c)}>Analytics ({c.response_count})</button>
                  {c.status === 'active'
                    ? <button style={st.ghost} onClick={() => setStatus(c.id, 'closed')}>Close</button>
                    : <button style={st.ghost} onClick={() => setStatus(c.id, 'active')}>Reopen</button>}
                </div>
              </div>
              <div style={st.cardBody}>
                <div style={{ fontSize: 11, color: 'var(--t-text-muted)' }}>
                  {(c.questions || []).length} question{(c.questions || []).length === 1 ? '' : 's'} · Audience: {audienceLabel(c.audience?.roles, ROLES, 'roles')} · {audienceLabel(c.audience?.locations, LOCATIONS, 'locations')}
                </div>
              </div>
            </div>
          ))}
        </>
      )}

      {!loading && tab === 'mine' && (
        <>
          {!pid && <div style={st.muted}>Sign in to see the surveys assigned to you.</div>}
          {pid && myOpen.length === 0 && <div style={st.muted}>No open surveys right now. Thanks for staying current! 🎉</div>}
          {myOpen.map(c => (
            <div key={c.id} style={st.card}>
              <div style={st.cardHead}>
                <span style={{ fontSize: 13, fontWeight: 800 }}>{c.title}</span>
                {c.anonymous && <span style={{ fontSize: 9, color: 'var(--t-text-muted)' }}>🔒 Anonymous</span>}
              </div>
              <div style={st.cardBody}>
                <div style={{ fontSize: 12, color: 'var(--t-text-muted)', marginBottom: 10 }}>{(c.questions || []).length} quick question{(c.questions || []).length === 1 ? '' : 's'} · ~1 min</div>
                <button style={st.btn} onClick={() => setAnswering(c)}>Take Survey</button>
              </div>
            </div>
          ))}
          {myDone.length > 0 && (
            <div style={{ marginTop: 20 }}>
              <div style={st.label}>Completed</div>
              {myDone.map(c => <div key={c.id} style={{ fontSize: 12, color: 'var(--t-text-muted)', padding: '8px 0', borderBottom: '1px solid var(--t-line)' }}>✓ {c.title}</div>)}
            </div>
          )}
        </>
      )}

      {compose && <ComposeCampaign onClose={() => setCompose(false)} onCreate={createCampaign} />}
      {answering && <AnswerSurvey camp={answering} onClose={() => setAnswering(null)} onSubmit={submitAnswers} />}
      {analytics && <Analytics camp={analytics} onClose={() => setAnalytics(null)} />}

      <DrillDown open={!!drill} onClose={() => setDrill(null)} title={drill?.title || ''} subtitle="Pulse campaigns"
        columns={[
          { key: 'title', label: 'Campaign' },
          { key: 'status', label: 'Status' },
          { key: 'responses', label: 'Responses' },
          { key: 'created_at', label: 'Created', render: r => r.created_at ? new Date(r.created_at).toLocaleDateString() : '—' },
        ]} rows={drill?.rows || []} />
    </div>
  )
}

function audienceLabel(arr, full, kind) {
  if (!arr || !arr.length) return kind === 'roles' ? 'All roles' : 'All locations'
  if (arr.length >= full.length) return kind === 'roles' ? 'All roles' : 'All locations'
  return arr.join(', ')
}

// ── compose a campaign ────────────────────────────────────────────────
function ComposeCampaign({ onClose, onCreate }) {
  const [tmplId, setTmplId] = useState(TEMPLATES[0].id)
  const [title, setTitle] = useState(TEMPLATES[0].title)
  const [questions, setQuestions] = useState(TEMPLATES[0].questions)
  const [roles, setRoles] = useState([...ROLES])
  const [locs, setLocs] = useState([...LOCATIONS])
  const [anon, setAnon] = useState(true)
  const [busy, setBusy] = useState(false)

  const applyTemplate = (id) => {
    const t = TEMPLATES.find(x => x.id === id); setTmplId(id)
    if (t) { setTitle(t.title); setQuestions(t.questions) }
  }
  const toggle = (arr, set, v) => set(arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v])
  const addQ = () => setQuestions(q => [...q, { id: draftQid(), type: 'rating', text: '' }])
  const setQ = (i, patch) => setQuestions(q => q.map((x, idx) => idx === i ? { ...x, ...patch } : x))
  const rmQ = (i) => setQuestions(q => q.filter((_, idx) => idx !== i))
  const valid = title.trim() && questions.length && questions.every(q => q.text.trim()) && roles.length && locs.length

  const submit = async () => {
    if (!valid || busy) return
    setBusy(true)
    await onCreate({ title, questions, audience: { roles, locations: locs }, anonymous: anon })
    setBusy(false)
  }

  return (
    <div style={st.overlay} onClick={onClose}>
      <div style={st.modal} onClick={e => e.stopPropagation()}>
        <div style={st.cardHead}><span style={{ fontSize: 14, fontWeight: 800 }}>New Pulse Campaign</span>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--t-text-muted)', fontSize: 22, cursor: 'pointer' }}>×</button></div>
        <div style={{ ...st.cardBody, display: 'flex', flexDirection: 'column', gap: 12, maxHeight: '70vh', overflowY: 'auto' }}>
          <div>
            <div style={st.label}>Start from template</div>
            <select value={tmplId} onChange={e => applyTemplate(e.target.value)} style={{ ...st.inp, marginTop: 6 }}>
              {TEMPLATES.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
            </select>
          </div>
          <div>
            <div style={st.label}>Campaign Title</div>
            <input value={title} onChange={e => setTitle(e.target.value)} style={{ ...st.inp, marginTop: 6 }} />
          </div>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={st.label}>Questions</div><button style={st.ghost} onClick={addQ}>+ Add</button>
            </div>
            {questions.map((q, i) => (
              <div key={q.id} style={{ border: '1px solid var(--t-line)', padding: 10, marginTop: 6 }}>
                <input value={q.text} onChange={e => setQ(i, { text: e.target.value })} placeholder="Question text" style={{ ...st.inp, marginBottom: 6 }} />
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <select value={q.type} onChange={e => setQ(i, { type: e.target.value })} style={{ ...st.inp, width: 160 }}>
                    {Object.entries(QTYPE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                  {q.type === 'choice' && <input value={(q.options || []).join(', ')} onChange={e => setQ(i, { options: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })} placeholder="Options, comma-separated" style={{ ...st.inp, flex: 1 }} />}
                  <button style={{ ...st.ghost, color: 'var(--t-danger)' }} onClick={() => rmQ(i)}>Remove</button>
                </div>
              </div>
            ))}
          </div>
          <div>
            <div style={st.label}>Audience — Roles</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
              {ROLES.map(r => <span key={r} style={st.chip(roles.includes(r))} onClick={() => toggle(roles, setRoles, r)}>{r}</span>)}
            </div>
          </div>
          <div>
            <div style={st.label}>Audience — Locations</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
              {LOCATIONS.map(l => <span key={l} style={st.chip(locs.includes(l))} onClick={() => toggle(locs, setLocs, l)}>{l}</span>)}
            </div>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
            <input type="checkbox" checked={anon} onChange={e => setAnon(e.target.checked)} /> Anonymous responses (recommended for candor)
          </label>
          <button disabled={!valid || busy} style={{ ...st.btn, opacity: (valid && !busy) ? 1 : 0.5, cursor: (valid && !busy) ? 'pointer' : 'not-allowed' }} onClick={submit}>
            {busy ? 'Launching…' : 'Launch Campaign'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── answer a survey ───────────────────────────────────────────────────
function AnswerSurvey({ camp, onClose, onSubmit }) {
  const [ans, setAns] = useState({})
  const [busy, setBusy] = useState(false)
  const set = (qid, v) => setAns(a => ({ ...a, [qid]: v }))
  const complete = (camp.questions || []).every(q => ans[q.id] !== undefined && ans[q.id] !== '')

  const submit = async () => {
    if (!complete || busy) return
    setBusy(true)
    await onSubmit(camp, ans)
    setBusy(false)
  }

  return (
    <div style={st.overlay} onClick={onClose}>
      <div style={st.modal} onClick={e => e.stopPropagation()}>
        <div style={st.cardHead}><span style={{ fontSize: 14, fontWeight: 800 }}>{camp.title}</span>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--t-text-muted)', fontSize: 22, cursor: 'pointer' }}>×</button></div>
        <div style={{ ...st.cardBody, display: 'flex', flexDirection: 'column', gap: 16, maxHeight: '70vh', overflowY: 'auto' }}>
          {camp.anonymous && <div style={{ fontSize: 11, color: 'var(--t-success)' }}>🔒 Your answers are anonymous.</div>}
          {(camp.questions || []).map((q, i) => (
            <div key={q.id}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>{i + 1}. {q.text}</div>
              {q.type === 'rating' && (
                <div style={{ display: 'flex', gap: 6 }}>
                  {[1, 2, 3, 4, 5].map(n => <button key={n} onClick={() => set(q.id, n)} style={{ ...st.ghost, width: 40, ...(ans[q.id] === n ? { background: 'var(--t-accent)', color: '#fff', borderColor: 'var(--t-accent)' } : {}) }}>{n}</button>)}
                </div>
              )}
              {q.type === 'nps' && (
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {Array.from({ length: 11 }, (_, n) => <button key={n} onClick={() => set(q.id, n)} style={{ ...st.ghost, width: 34, padding: '7px 0', ...(ans[q.id] === n ? { background: 'var(--t-accent)', color: '#fff', borderColor: 'var(--t-accent)' } : {}) }}>{n}</button>)}
                </div>
              )}
              {q.type === 'yesno' && (
                <div style={{ display: 'flex', gap: 6 }}>
                  {['Yes', 'No'].map(v => <button key={v} onClick={() => set(q.id, v)} style={{ ...st.ghost, ...(ans[q.id] === v ? { background: 'var(--t-accent)', color: '#fff', borderColor: 'var(--t-accent)' } : {}) }}>{v}</button>)}
                </div>
              )}
              {q.type === 'choice' && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {(q.options || []).map(o => <button key={o} onClick={() => set(q.id, o)} style={{ ...st.ghost, ...(ans[q.id] === o ? { background: 'var(--t-accent)', color: '#fff', borderColor: 'var(--t-accent)' } : {}) }}>{o}</button>)}
                </div>
              )}
              {q.type === 'text' && (
                <textarea value={ans[q.id] || ''} onChange={e => set(q.id, e.target.value)} placeholder="Your answer…" style={{ ...st.inp, minHeight: 70, resize: 'vertical', fontFamily: 'inherit' }} />
              )}
            </div>
          ))}
          <button disabled={!complete || busy} style={{ ...st.btn, opacity: (complete && !busy) ? 1 : 0.5, cursor: (complete && !busy) ? 'pointer' : 'not-allowed' }} onClick={submit}>{busy ? 'Submitting…' : 'Submit'}</button>
        </div>
      </div>
    </div>
  )
}

// ── analytics ─────────────────────────────────────────────────────────
function Analytics({ camp, onClose }) {
  const [responses, setResponses] = useState(null)   // null = loading
  const [err, setErr] = useState('')

  useEffect(() => {
    let live = true
    ;(async () => {
      const { data, error } = await sb.rpc('get_pulse_responses', { p_campaign_id: camp.id })
      if (!live) return
      if (error) { setErr(error.message || 'Could not load responses.'); setResponses([]); return }
      setResponses(Array.isArray(data) ? data : [])
    })()
    return () => { live = false }
  }, [camp.id])

  const perQ = (camp.questions || []).map(q => {
    const vals = (responses || []).map(r => r.answers?.[q.id]).filter(v => v !== undefined && v !== '')
    if (q.type === 'rating' || q.type === 'nps') {
      const nums = vals.filter(v => typeof v === 'number')
      const avg = nums.length ? (nums.reduce((s, n) => s + n, 0) / nums.length) : null
      return { q, kind: 'num', avg, n: nums.length, max: q.type === 'nps' ? 10 : 5 }
    }
    if (q.type === 'yesno' || q.type === 'choice') {
      const counts = {}; vals.forEach(v => { counts[v] = (counts[v] || 0) + 1 })
      return { q, kind: 'dist', counts, n: vals.length }
    }
    return { q, kind: 'text', texts: vals, n: vals.length }
  })

  const count = responses?.length || 0

  return (
    <div style={st.overlay} onClick={onClose}>
      <div style={{ ...st.modal, width: 'min(640px, 96vw)' }} onClick={e => e.stopPropagation()}>
        <div style={st.cardHead}>
          <div><span style={{ fontSize: 14, fontWeight: 800 }}>{camp.title}</span><span style={{ fontSize: 11, color: 'var(--t-text-muted)', marginLeft: 8 }}>{count} response{count === 1 ? '' : 's'}</span></div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--t-text-muted)', fontSize: 22, cursor: 'pointer' }}>×</button>
        </div>
        <div style={{ ...st.cardBody, display: 'flex', flexDirection: 'column', gap: 18, maxHeight: '72vh', overflowY: 'auto' }}>
          {err && <div style={st.banner}>{err}</div>}
          {responses === null && <div style={{ fontSize: 13, color: 'var(--t-text-muted)' }}>Loading responses…</div>}
          {responses !== null && count === 0 && !err && <div style={{ fontSize: 13, color: 'var(--t-text-muted)' }}>No responses yet.</div>}
          {responses !== null && perQ.map((a, i) => (
            <div key={a.q.id}>
              <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>{i + 1}. {a.q.text}</div>
              {a.kind === 'num' && (
                a.avg == null ? <div style={{ fontSize: 12, color: 'var(--t-text-faint)' }}>No numeric answers.</div> : (
                  <div>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                      <span style={{ fontSize: 28, fontWeight: 800, color: 'var(--t-accent)' }}>{a.avg.toFixed(1)}</span>
                      <span style={{ fontSize: 12, color: 'var(--t-text-muted)' }}>/ {a.max} avg · {a.n} responses</span>
                    </div>
                    <div style={{ height: 8, background: 'var(--t-line)', marginTop: 6 }}><div style={{ height: '100%', width: `${(a.avg / a.max) * 100}%`, background: 'var(--t-accent)' }} /></div>
                  </div>
                )
              )}
              {a.kind === 'dist' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  {Object.entries(a.counts).map(([k, v]) => (
                    <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 11, width: 90, color: 'var(--t-text-muted)' }}>{k}</span>
                      <div style={{ flex: 1, height: 14, background: 'var(--t-line)' }}><div style={{ height: '100%', width: `${a.n ? (v / a.n) * 100 : 0}%`, background: 'var(--t-success)' }} /></div>
                      <span style={{ fontSize: 11, width: 30, textAlign: 'right' }}>{v}</span>
                    </div>
                  ))}
                </div>
              )}
              {a.kind === 'text' && (
                a.texts.length === 0 ? <div style={{ fontSize: 12, color: 'var(--t-text-faint)' }}>No comments.</div> : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {a.texts.map((tx, j) => <div key={j} style={{ fontSize: 12, padding: '8px 10px', background: 'var(--t-surface-2)', border: '1px solid var(--t-line)' }}>"{tx}"</div>)}
                  </div>
                )
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
