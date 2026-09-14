// AiScheduler.jsx — the schedule drafter, driven from the HR platform.
//
// THE DRAFTER IS THE OS'S (Bible §12g, §12f; owner rulings 12 Sep 2026). There is no second
// scheduler here: public.f_draft_schedule places people zone by zone from
// zone_staffing_requirements through f_schedule_candidates under the rows of
// scheduling_policy (rest ≥ N h, ≤ N days in a row, primaries before floaters, overtime only
// when a zone would otherwise be empty, nobody in training alone); f_validate_draft marks
// every line that breaks a rule; f_post_schedule publishes under a sign-off role.
// This screen reads and drives that through the hr.tg_* wrappers:
//   tg_draft_week      the draft for a week (lines, coverage vs requirements, cost from the OS rates)
//   tg_draft_conflicts each conflicting line with the candidate that would clear it
//   tg_draft_fix_line  move a line to that candidate, re-validate
//   tg_coverage_heat   required vs placed per zone per day
//   tg_draft_history   every draft, newest first
//   tg_scheduling_policy / tg_departments / tg_post_draft / tg_discard_draft
// Nothing on this page is seeded. A week with no draft says so and offers Generate.
import { useState, useEffect, useCallback, useMemo } from 'react'
import { sb } from '../lib/supabase'
import { useAuth } from '../lib/auth.jsx'
import { useScope } from '../lib/scope.jsx'

// ── helpers ────────────────────────────────────────────────────────────────────
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
function fmt12(t24) {
  if (!t24) return ''
  const [h, m] = t24.split(':').map(Number)
  return `${h % 12 || 12}:${String(m).padStart(2, '0')}${h >= 12 ? 'pm' : 'am'}`
}
function getWeekStart(offset = 0) {
  const d = new Date()
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + offset * 7)   // Monday
  return d.toISOString().split('T')[0]
}
function shiftWeek(ws, n) {
  const d = new Date(ws + 'T12:00:00'); d.setDate(d.getDate() + n * 7)
  return d.toISOString().split('T')[0]
}
function getWeekDays(ws) {
  const start = new Date(ws + 'T12:00:00')
  return Array.from({ length: 7 }, (_, i) => { const d = new Date(start); d.setDate(d.getDate() + i); return d.toISOString().split('T')[0] })
}
function fmtWeekLabel(ws) {
  if (!ws) return '—'
  const s = new Date(ws + 'T12:00:00')
  const e = new Date(s); e.setDate(e.getDate() + 6)
  const o = { month: 'short', day: 'numeric' }
  return `${s.toLocaleDateString('en-US', o)} – ${e.toLocaleDateString('en-US', o)}, ${e.getFullYear()}`
}
const money = (n) => n == null ? '—' : `$${Math.round(Number(n)).toLocaleString()}`
const rpcOk = (res) => !res?.error && (res?.data == null || res.data.ok !== false)
const rpcWhy = (res) => res?.error?.message || res?.data?.error || 'not saved'

// ── the week store: one read, shared by every tab ──────────────────────────────
function useDraftWeek(weekStart, departmentId) {
  const [week, setWeek] = useState(null)    // null = loading
  const [error, setError] = useState('')
  const [tick, setTick] = useState(0)
  const reload = useCallback(() => setTick(t => t + 1), [])
  useEffect(() => {
    let live = true
    setWeek(null)
    sb.rpc('tg_draft_week', { p_week_start: weekStart, p_department_id: departmentId || null, p_generate: false })
      .then(({ data, error: e }) => {
        if (!live) return
        if (e) { setError(e.message); setWeek({ draft: null, shifts: [], stats: null }); return }
        setError('')
        setWeek(data || { draft: null, shifts: [], stats: null })
      })
    return () => { live = false }
  }, [weekStart, departmentId, tick])
  return { week, error, reload }
}

// ── KPI tile ───────────────────────────────────────────────────────────────────
function KTile({ label, value, sub, color, alert }) {
  return (
    <div style={{
      background: 'var(--t-surface)',
      border: `1px solid ${alert === 'red' ? 'var(--t-danger)' : alert === 'amber' ? 'var(--t-warn)' : 'var(--t-line)'}`,
      padding: '14px 16px', position: 'relative', overflow: 'hidden', flex: 1, minWidth: 110,
    }}>
      {alert === 'red'   && <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'var(--t-danger)' }} />}
      {alert === 'amber' && <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'var(--t-warn)' }} />}
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.08em', color: 'var(--t-text-muted)', textTransform: 'uppercase', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800, color: color || 'var(--t-text)', lineHeight: 1, marginBottom: 4 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--t-text-faint)' }}>{sub}</div>}
    </div>
  )
}

// ── tab bar ────────────────────────────────────────────────────────────────────
function TabBar({ tabs, active, onChange }) {
  return (
    <div style={{ display: 'flex', borderBottom: '1px solid var(--t-line)', padding: '0 20px', flexShrink: 0 }}>
      {tabs.map(t => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          style={{
            background: 'transparent',
            border: 'none',
            borderBottom: active === t.id ? '2px solid var(--t-accent)' : '2px solid transparent',
            color: active === t.id ? 'var(--t-accent)' : 'var(--t-text-muted)',
            fontSize: 12, fontWeight: 700, padding: '12px 18px', cursor: 'pointer',
            letterSpacing: '.04em', textTransform: 'uppercase',
            fontFamily: 'var(--font-sans)',
            transition: 'color .15s, border-color .15s',
          }}
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}

const STATUS_COLORS = { posted: 'var(--t-success)', draft: 'var(--t-warn)', discarded: 'var(--t-text-faint)', superseded: 'var(--t-text-faint)' }
function StatusPill({ status }) {
  const c = STATUS_COLORS[status] || 'var(--t-accent)'
  return <span style={{ fontSize: 10, fontWeight: 700, color: c, background: `${c}18`, padding: '2px 7px', border: `1px solid ${c}40`, textTransform: 'uppercase' }}>{status}</span>
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB 1 — DRAFT THE WEEK
// ─────────────────────────────────────────────────────────────────────────────
function AutoScheduleTab({ weekStart, setWeekStart, departmentId, setDepartmentId, departments, policy, week, weekError, reload }) {
  const [generating, setGenerating] = useState(false)
  const [actionMsg, setActionMsg] = useState('')
  const [viewMode, setViewMode] = useState('grid')
  const [recent, setRecent] = useState([])
  const weekDays = getWeekDays(weekStart)
  const draft = week?.draft || null
  const shifts = week?.shifts || []
  const stats = week?.stats || null
  const canPost = !!policy?.caller_can_post

  useEffect(() => {
    let live = true
    sb.rpc('tg_draft_history', { p_limit: 5 }).then(({ data }) => { if (live && Array.isArray(data)) setRecent(data) })
    return () => { live = false }
  }, [week])

  async function generate() {
    if (generating) return
    setGenerating(true); setActionMsg('')
    const res = await sb.rpc('tg_draft_week', { p_week_start: weekStart, p_department_id: departmentId || null, p_generate: true })
    setGenerating(false)
    if (res.error) { setActionMsg(`Not drafted — ${res.error.message}`); return }
    setActionMsg(`Drafted: ${res.data?.draft?.rationale || 'see the draft below'}`)
    reload()
  }
  async function post() {
    if (!draft) return
    setActionMsg('')
    const res = await sb.rpc('tg_post_draft', { p_draft_id: draft.id })
    if (!rpcOk(res)) { setActionMsg(`Not posted — ${rpcWhy(res)}`); return }
    setActionMsg('Posted — the schedule is live for the team.')
    reload()
  }
  async function discard() {
    if (!draft) return
    setActionMsg('')
    const res = await sb.rpc('tg_discard_draft', { p_draft_id: draft.id, p_why: 'discarded from the HR platform' })
    if (!rpcOk(res)) { setActionMsg(`Not discarded — ${rpcWhy(res)}`); return }
    setActionMsg('Draft discarded. Generate again when ready.')
    reload()
  }

  // grid: zones × days, each cell = the people placed there
  const zones = useMemo(() => {
    const seen = new Map()
    for (const s of shifts) if (!seen.has(s.zone)) seen.set(s.zone, { zone: s.zone, dept: s.loc, start: s.start, end: s.end })
    return [...seen.values()]
  }, [shifts])
  function ScheduleGrid() {
    const byZoneDay = {}
    for (const s of shifts) { const k = `${s.date}||${s.zone}`; (byZoneDay[k] ||= []).push(s) }
    return (
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, minWidth: 700 }}>
          <thead>
            <tr style={{ background: 'var(--t-surface)' }}>
              <th style={thStyle('left', 140)}>Zone</th>
              {weekDays.map(d => {
                const dt = new Date(d + 'T12:00:00')
                return (
                  <th key={d} style={thStyle('center', 110)}>
                    <div style={{ color: 'var(--t-text-muted)' }}>{DAYS[dt.getDay()]}</div>
                    <div style={{ color: 'var(--t-text-faint)', fontSize: 9, marginTop: 1 }}>{dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</div>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {zones.map((z, zi) => (
              <tr key={z.zone} style={{ borderBottom: '1px solid var(--t-line)', background: zi % 2 === 0 ? 'var(--t-bg)' : 'transparent' }}>
                <td style={{ padding: '8px 12px', fontSize: 10, fontWeight: 700, color: 'var(--t-text-muted)', textTransform: 'uppercase', letterSpacing: '.06em', verticalAlign: 'middle' }}>
                  {z.zone}
                  <div style={{ fontSize: 9, color: 'var(--t-text-faint)', fontWeight: 400, marginTop: 1 }}>{z.dept}{z.start ? ` · ${fmt12(z.start)}–${fmt12(z.end)}` : ''}</div>
                </td>
                {weekDays.map(d => {
                  const cell = byZoneDay[`${d}||${z.zone}`] || []
                  return (
                    <td key={d} style={{ padding: 6, verticalAlign: 'top', border: '1px solid transparent' }}>
                      {cell.length === 0 ? (
                        <div style={{ color: 'var(--t-line)', fontSize: 10, textAlign: 'center', padding: '4px 0' }}>—</div>
                      ) : cell.map((s, i) => (
                        <div key={s.line_id || i} title={s.note || ''} style={{ marginBottom: i < cell.length - 1 ? 3 : 0, fontSize: 10, padding: '3px 6px',
                          background: s.conflict ? 'rgba(255,77,125,0.08)' : s.open ? 'rgba(255,184,0,0.08)' : 'rgba(0,229,255,0.05)',
                          border: `1px solid ${s.conflict ? 'rgba(255,77,125,0.4)' : s.open ? 'rgba(255,184,0,0.4)' : 'rgba(0,229,255,0.15)'}` }}>
                          <div style={{ fontWeight: 600, color: s.open ? 'var(--t-warn)' : 'var(--t-text)' }}>{s.emp}</div>
                          {s.conflict && <div style={{ color: 'var(--t-danger)', fontSize: 9 }}>{s.conflict}</div>}
                        </div>
                      ))}
                    </td>
                  )
                })}
              </tr>
            ))}
            {zones.length === 0 && <tr><td colSpan={8} style={{ padding: 16, color: 'var(--t-text-faint)', textAlign: 'center' }}>No lines in this draft for the week.</td></tr>}
          </tbody>
        </table>
      </div>
    )
  }

  const rules = policy ? [
    `Rest between shifts ≥ ${policy.min_rest_hours ?? '—'} h`,
    `At most ${policy.max_consecutive_days ?? '—'} days in a row`,
    policy.primary_department_first ? 'Primary-department people before floaters' : 'Floaters and primaries ranked together',
    policy.avoid_overtime ? 'Overtime only when a zone would otherwise be empty' : 'Overtime allowed',
    policy.in_training_needs_partner ? 'Nobody in training works a zone alone' : 'Training partner not required',
    policy.floater_rule ? `Floater rule: ${policy.floater_rule}` : null,
    policy.default_shift_template ? `Default shift: ${policy.default_shift_template}` : 'Default shift: NOT SET (Settings › Scheduling)',
    policy.block_post_on_conflict ? 'A draft with conflicts cannot be posted' : 'Conflicts do not block posting',
    `Sign-off roles: ${(policy.signoff_roles || []).join(', ') || '—'}`,
  ].filter(Boolean) : []

  return (
    <div style={{ padding: '20px 20px 40px' }}>
      {stats && (
        <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
          <KTile label="Coverage" value={stats.coveragePct == null ? '—' : `${stats.coveragePct}%`} color="var(--t-accent)" alert={stats.coveragePct != null && stats.coveragePct < 80 ? 'amber' : undefined} sub={stats.requirementCells ? `${stats.filledCells}/${stats.requirementCells} zone-days staffed` : 'no requirements set'} />
          <KTile label="Shifts" value={stats.totalShifts} color="var(--t-text)" sub={`${stats.openShifts} open`} />
          <KTile label="Conflicts" value={stats.conflicts} color={stats.conflicts > 0 ? 'var(--t-danger)' : 'var(--t-success)'} alert={stats.conflicts > 0 ? 'red' : undefined} sub={`${stats.overtimeFlags} overtime`} />
          <KTile label="Hours" value={stats.totalHours} color="var(--t-text)" />
          <KTile label="Est. Labor" value={money(stats.estimatedCost)} color="var(--t-warn)" sub={stats.ratesProvisional > 0 ? `${stats.ratesProvisional} lines on provisional rates` : stats.ratesMissing > 0 ? `${stats.ratesMissing} lines without a rate` : 'from OS pay rates'} />
          <KTile label="People" value={stats.uniqueEmployees} color="var(--t-text-muted)" />
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 20, alignItems: 'start' }}>
        <div>
          <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', padding: 20, marginBottom: 16 }}>
            <div style={sectionLabel}>Draft Configuration</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
              <div>
                <div style={fieldLabel}>Week Of (Monday)</div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={() => setWeekStart(shiftWeek(weekStart, -1))} style={ghostBtn} title="Previous week">‹</button>
                  <input type="date" value={weekStart} onChange={e => e.target.value && setWeekStart(e.target.value)} style={inputStyle} />
                  <button onClick={() => setWeekStart(shiftWeek(weekStart, 1))} style={ghostBtn} title="Next week">›</button>
                </div>
              </div>
              <div>
                <div style={fieldLabel}>Department</div>
                <select value={departmentId || ''} onChange={e => setDepartmentId(e.target.value || null)} style={inputStyle}>
                  <option value="">All departments</option>
                  {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <button onClick={generate} disabled={generating || !canPost} style={primaryBtn(generating || !canPost)} title={canPost ? '' : 'Only a scheduling sign-off role may draft'}>
                {generating ? 'Drafting…' : draft ? 'Draft Again' : 'Generate Draft'}
              </button>
              {draft && draft.status === 'draft' && (
                <>
                  <button onClick={post} disabled={!canPost || (policy?.block_post_on_conflict && stats?.conflicts > 0)} style={{ ...ghostBtn, color: 'var(--t-success)', borderColor: 'rgba(42,214,160,0.4)' }}
                    title={policy?.block_post_on_conflict && stats?.conflicts > 0 ? 'Resolve the conflicts first (Settings › Scheduling blocks posting with conflicts)' : 'Publish to the team'}>
                    Post Schedule
                  </button>
                  <button onClick={discard} disabled={!canPost} style={{ ...ghostBtn, color: 'var(--t-danger)', borderColor: 'rgba(255,77,125,0.4)' }}>Discard</button>
                </>
              )}
              {draft && <StatusPill status={draft.status} />}
            </div>
            {!canPost && <div style={{ marginTop: 10, fontSize: 11, color: 'var(--t-warn)' }}>Your OS role is not in the sign-off list ({(policy?.signoff_roles || []).join(', ') || 'owner'}); you can read drafts but not create or post them.</div>}
            {actionMsg && <div style={{ marginTop: 10, fontSize: 11, color: /^Not /.test(actionMsg) ? 'var(--t-danger)' : 'var(--t-success)' }}>{actionMsg}</div>}
            {weekError && <div style={{ marginTop: 10, fontSize: 11, color: 'var(--t-danger)' }}>Could not read the week: {weekError}</div>}
            {generating && (
              <div style={{ marginTop: 14 }}>
                <div style={{ fontSize: 11, color: 'var(--t-text-muted)', marginBottom: 6 }}>Placing people zone by zone from the staffing requirements, under the scheduling policy…</div>
                <div style={{ height: 2, background: 'var(--t-line)', overflow: 'hidden' }}>
                  <div style={{ height: '100%', background: 'linear-gradient(90deg, var(--t-accent), #7c4dff)', width: '55%', animation: 'sched-bar 1.3s ease-in-out infinite' }} />
                </div>
                <style>{`@keyframes sched-bar { 0%{margin-left:-55%} 100%{margin-left:100%} }`}</style>
              </div>
            )}
          </div>

          {week === null && !generating && (
            <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', padding: 24, color: 'var(--t-text-faint)', fontSize: 12 }}>Reading the week…</div>
          )}
          {week !== null && !generating && !draft && (
            <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', padding: '40px 24px', textAlign: 'center' }}>
              <div style={{ fontSize: 32, marginBottom: 12, opacity: 0.35 }}>🗓</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--t-text)', marginBottom: 6 }}>No draft for {fmtWeekLabel(weekStart)}</div>
              <div style={{ fontSize: 12, color: 'var(--t-text-muted)', maxWidth: 420, margin: '0 auto', lineHeight: 1.7 }}>
                Pick the week and department, then <strong style={{ color: 'var(--t-accent)' }}>Generate Draft</strong>. The drafter places people from the zone staffing requirements; nothing reaches staff until a sign-off role posts it.
              </div>
            </div>
          )}
          {week !== null && !generating && draft && (
            <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)' }}>
              <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--t-line)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <div>
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--t-text)' }}>{draft.title}</span>
                  <div style={{ fontSize: 10, color: 'var(--t-text-faint)', marginTop: 2 }}>{draft.by_kind === 'agent' ? `drafted by ${draft.agent}` : 'drafted by a person'} · {new Date(draft.created_at).toLocaleString()}{draft.posted_at ? ` · posted ${new Date(draft.posted_at).toLocaleString()}` : ''}</div>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {['grid', 'list'].map(v => (
                    <button key={v} onClick={() => setViewMode(v)} style={{
                      background: viewMode === v ? 'var(--t-accent)' : 'transparent',
                      color: viewMode === v ? '#000' : 'var(--t-text-muted)',
                      border: `1px solid ${viewMode === v ? 'var(--t-accent)' : 'var(--t-line)'}`,
                      padding: '3px 10px', cursor: 'pointer', fontSize: 10, fontWeight: 700,
                      textTransform: 'capitalize', fontFamily: 'var(--font-sans)',
                    }}>{v}</button>
                  ))}
                </div>
              </div>
              {draft.rationale && <div style={{ padding: '8px 16px', fontSize: 11, color: 'var(--t-text-muted)', borderBottom: '1px solid var(--t-line)', lineHeight: 1.6 }}>{draft.rationale}</div>}
              <div style={{ padding: 16 }}>
                {viewMode === 'grid' ? <ScheduleGrid /> : (
                  <div>
                    {weekDays.map(d => {
                      const dayShifts = shifts.filter(s => s.date === d)
                      const dt = new Date(d + 'T12:00:00')
                      return (
                        <div key={d} style={{ marginBottom: 10, border: '1px solid var(--t-line)' }}>
                          <div style={{ padding: '7px 12px', background: 'var(--t-surface-2)', borderBottom: '1px solid var(--t-line)', display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--t-text)' }}>{dt.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}</span>
                            <span style={{ fontSize: 10, color: 'var(--t-text-muted)' }}>{dayShifts.length} lines</span>
                          </div>
                          {dayShifts.length === 0 ? (
                            <div style={{ padding: '8px 12px', fontSize: 11, color: 'var(--t-text-faint)' }}>No lines</div>
                          ) : dayShifts.map((s, i) => (
                            <div key={s.line_id || i} title={s.note || ''} style={{ display: 'flex', gap: 12, padding: '7px 12px', borderBottom: i < dayShifts.length - 1 ? '1px solid var(--t-line)' : undefined, background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)', alignItems: 'center', flexWrap: 'wrap' }}>
                              <span style={{ fontSize: 12, fontWeight: 600, color: s.open ? 'var(--t-warn)' : 'var(--t-text)', minWidth: 140 }}>{s.emp}</span>
                              <span style={{ fontSize: 10, color: 'var(--t-text-muted)', minWidth: 120 }}>{s.loc}</span>
                              <span style={{ fontSize: 10, color: 'var(--t-accent)', background: 'rgba(0,229,255,0.07)', padding: '1px 7px', border: '1px solid rgba(0,229,255,0.2)' }}>{fmt12(s.start)} – {fmt12(s.end)} · {s.hours} h</span>
                              <span style={{ fontSize: 10, color: '#7c4dff' }}>{s.zone}</span>
                              {s.conflict && <span style={{ fontSize: 10, color: 'var(--t-danger)' }}>⚠ {s.conflict}</span>}
                            </div>
                          ))}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', padding: 16 }}>
            <div style={sectionLabel}>Recent drafts</div>
            {recent.length === 0 && <div style={{ fontSize: 11, color: 'var(--t-text-faint)' }}>No drafts yet.</div>}
            {recent.map(r => (
              <div key={r.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--t-line)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--t-text)' }}>{fmtWeekLabel(r.weekOf)}</div>
                  <div style={{ fontSize: 10, color: 'var(--t-text-faint)', marginTop: 2 }}>{r.shifts} shifts · {r.openShifts} open · {r.conflicts} conflicts · {r.location}</div>
                </div>
                <StatusPill status={r.status} />
              </div>
            ))}
          </div>

          <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', padding: 16 }}>
            <div style={sectionLabel}>Rules the drafter applies</div>
            {!policy && <div style={{ fontSize: 11, color: 'var(--t-text-faint)' }}>Reading Settings › Scheduling…</div>}
            {rules.map((tip, i) => (
              <div key={i} style={{ fontSize: 11, color: 'var(--t-text-muted)', padding: '4px 0', borderBottom: i < rules.length - 1 ? '1px solid var(--t-line)' : undefined }}>· {tip}</div>
            ))}
            {policy && <div style={{ fontSize: 10, color: 'var(--t-text-faint)', marginTop: 8 }}>Every rule is a row in scheduling_policy (OS Settings › Scheduling); this list is read from it.</div>}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB 2 — CONFLICT RESOLVER
// ─────────────────────────────────────────────────────────────────────────────
function ConflictResolverTab({ week, reload, policy }) {
  const draft = week?.draft || null
  const [conflicts, setConflicts] = useState(null)
  const [fixing, setFixing] = useState(false)
  const [fixedCount, setFixedCount] = useState(0)
  const [msg, setMsg] = useState('')
  const canPost = !!policy?.caller_can_post

  const load = useCallback(() => {
    if (!draft) { setConflicts([]); return }
    sb.rpc('tg_draft_conflicts', { p_draft_id: draft.id }).then(({ data, error }) => {
      if (error) { setMsg(`Could not read conflicts: ${error.message}`); setConflicts([]); return }
      setConflicts(Array.isArray(data) ? data : [])
    })
  }, [draft?.id])
  useEffect(() => { setConflicts(null); load() }, [load])

  async function fixOne(c) {
    if (!c.candidate_id) { setMsg(`No candidate clears ${c.type} — leave the line open or lift a rule in Settings › Scheduling.`); return }
    setFixing(true); setMsg('')
    const res = await sb.rpc('tg_draft_fix_line', { p_line_id: c.line_id, p_employee_id: c.candidate_id })
    setFixing(false)
    if (!rpcOk(res)) { setMsg(`Not applied — ${rpcWhy(res)}`); return }
    setFixedCount(n => n + 1)
    setMsg(`Applied: ${c.candidate} now holds ${c.shift} on ${c.day}. ${res.data.conflicts_left} conflict(s) left after re-validation.`)
    load(); reload()
  }
  async function autoFixAll() {
    const fixable = (conflicts || []).filter(c => c.candidate_id)
    if (!fixable.length) { setMsg('No conflict has a clear candidate.'); return }
    setFixing(true); setMsg('')
    let applied = 0, last = null
    for (const c of fixable) {
      const res = await sb.rpc('tg_draft_fix_line', { p_line_id: c.line_id, p_employee_id: c.candidate_id })
      if (!rpcOk(res)) { setMsg(`Stopped at ${c.type} on ${c.day} — ${rpcWhy(res)}`); break }
      applied++; last = res.data
    }
    setFixing(false)
    setFixedCount(n => n + applied)
    if (last) setMsg(`Applied ${applied} fix(es); ${last.conflicts_left} conflict(s) left after re-validation.`)
    load(); reload()
  }

  const active = conflicts || []
  const criticals = active.filter(c => c.severity === 'critical')
  const warnings = active.filter(c => c.severity === 'warning')
  const sevColor = { critical: 'var(--t-danger)', warning: 'var(--t-warn)' }
  const sevBg = { critical: 'rgba(255,77,125,0.07)', warning: 'rgba(255,184,0,0.07)' }

  return (
    <div style={{ padding: '20px 20px 40px' }}>
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
        <KTile label="Active Conflicts" value={conflicts === null ? '…' : active.length} color={active.length > 0 ? 'var(--t-danger)' : 'var(--t-success)'} alert={active.length > 0 ? 'red' : undefined} sub="lines breaking a rule" />
        <KTile label="Critical" value={criticals.length} color="var(--t-danger)" alert={criticals.length > 0 ? 'red' : undefined} sub="rule blockers" />
        <KTile label="Warnings" value={warnings.length} color="var(--t-warn)" alert={warnings.length > 0 ? 'amber' : undefined} sub="overtime" />
        <KTile label="With a candidate" value={active.filter(c => c.candidate_id).length} color="var(--t-accent)" sub="can be applied" />
        <KTile label="Applied" value={fixedCount} color="var(--t-success)" sub="this session" />
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, gap: 10, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--t-text)' }}>
          {draft ? <>Conflicts on <span style={{ color: 'var(--t-accent)' }}>{draft.title}</span> <StatusPill status={draft.status} /></> : 'No draft for this week'}
          {draft && conflicts !== null && active.length === 0 && <span style={{ marginLeft: 10, fontSize: 11, fontWeight: 400, color: 'var(--t-success)' }}>All clear</span>}
        </div>
        <button onClick={autoFixAll} disabled={fixing || !canPost || active.filter(c => c.candidate_id).length === 0} style={primaryBtn(fixing || !canPost || active.filter(c => c.candidate_id).length === 0)}>
          {fixing ? 'Applying…' : `Apply all candidates (${active.filter(c => c.candidate_id).length})`}
        </button>
      </div>
      {msg && <div style={{ fontSize: 11, color: /^(Not |Stopped|Could not)/.test(msg) ? 'var(--t-danger)' : 'var(--t-text-muted)', marginBottom: 12 }}>{msg}</div>}

      {conflicts === null ? (
        <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', padding: 24, color: 'var(--t-text-faint)', fontSize: 12 }}>Validating lines against the candidates…</div>
      ) : active.length === 0 ? (
        <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', padding: 32, textAlign: 'center' }}>
          <div style={{ fontSize: 28, marginBottom: 10 }}>✅</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--t-success)' }}>{draft ? 'No conflicting lines' : 'Nothing to resolve'}</div>
          <div style={{ fontSize: 11, color: 'var(--t-text-muted)', marginTop: 4 }}>{draft ? 'Every placed line passes the scheduling policy.' : 'Generate a draft on the first tab.'}</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {[...criticals, ...warnings].map(c => (
            <div key={c.id} style={{ background: sevBg[c.severity], border: `1px solid ${sevColor[c.severity]}40`, padding: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10, gap: 10 }}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: sevColor[c.severity], background: `${sevColor[c.severity]}18`, padding: '2px 8px', textTransform: 'uppercase', letterSpacing: '.06em' }}>{c.severity}</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--t-text)' }}>{c.type}</span>
                </div>
                <button onClick={() => fixOne(c)} disabled={fixing || !canPost || !c.candidate_id} style={{ background: 'rgba(42,214,160,0.1)', border: '1px solid rgba(42,214,160,0.35)', color: c.candidate_id ? 'var(--t-success)' : 'var(--t-text-faint)', fontSize: 11, fontWeight: 700, padding: '4px 12px', cursor: c.candidate_id ? 'pointer' : 'not-allowed', fontFamily: 'var(--font-sans)' }}>
                  {c.candidate_id ? 'Apply candidate' : 'No candidate'}
                </button>
              </div>
              <div style={{ fontSize: 12, color: 'var(--t-text-muted)', marginBottom: 8, lineHeight: 1.6 }}>{c.description}</div>
              <div style={{ display: 'flex', gap: 20, fontSize: 11, marginBottom: 10, flexWrap: 'wrap' }}>
                <div><span style={{ color: 'var(--t-text-faint)' }}>Day: </span><span style={{ color: 'var(--t-text)' }}>{c.day} {c.date}</span></div>
                <div><span style={{ color: 'var(--t-text-faint)' }}>Zone: </span><span style={{ color: 'var(--t-text)' }}>{c.shift}</span></div>
                {(c.employees || []).length > 0 && (
                  <div><span style={{ color: 'var(--t-text-faint)' }}>Affected: </span>{c.employees.map(e => <span key={e} style={{ color: 'var(--t-accent)', marginLeft: 4 }}>{e}</span>)}</div>
                )}
              </div>
              <div style={{ background: 'rgba(0,229,255,0.05)', border: '1px solid rgba(0,229,255,0.15)', padding: '8px 12px', fontSize: 11, color: 'var(--t-text-muted)', lineHeight: 1.6 }}>
                <span style={{ color: 'var(--t-accent)', fontWeight: 700 }}>Candidate: </span>{c.fix}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB 3 — COVERAGE
// ─────────────────────────────────────────────────────────────────────────────
function CoverageTab({ weekStart, departmentId, week }) {
  const [heat, setHeat] = useState(null)
  const [selected, setSelected] = useState(null)
  useEffect(() => {
    let live = true
    setHeat(null)
    sb.rpc('tg_coverage_heat', { p_week_start: weekStart, p_department_id: departmentId || null }).then(({ data, error }) => {
      if (!live) return
      setHeat(error ? { cells: [], error: error.message } : (data || { cells: [] }))
    })
    return () => { live = false }
  }, [weekStart, departmentId, week?.draft?.id])

  const cells = heat?.cells || []
  const weekDays = getWeekDays(weekStart)
  const zones = useMemo(() => { const m = new Map(); for (const c of cells) if (!m.has(c.zone)) m.set(c.zone, c.dept); return [...m.entries()] }, [cells])
  const cov = (c) => c.coverage == null ? null : Number(c.coverage)
  const color = (pct) => pct == null ? 'var(--t-text-faint)' : pct < 100 ? '#ff4d7d' : pct > 100 ? '#2979ff' : '#2ad6a0'
  const label = (pct) => pct == null ? '—' : pct < 100 ? 'Under' : pct > 100 ? 'Over' : 'Met'
  const under = cells.filter(c => cov(c) != null && cov(c) < 100).length
  const over = cells.filter(c => cov(c) != null && cov(c) > 100).length
  const met = cells.filter(c => cov(c) === 100).length
  const avg = cells.length ? Math.round(cells.reduce((a, c) => a + (cov(c) || 0), 0) / cells.length) : null
  const sel = selected ? cells.find(c => c.zone === selected.zone && c.date === selected.date) : null
  const recs = cells.filter(c => cov(c) != null && cov(c) < 100).slice(0, 8).map(c => `${c.zone} on ${DAYS[c.dow]} ${c.date}: ${c.staffed} of ${c.required} placed`)

  return (
    <div style={{ padding: '20px 20px 40px' }}>
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
        <KTile label="Avg Coverage" value={avg == null ? '—' : `${avg}%`} color="var(--t-accent)" sub="placed ÷ required" />
        <KTile label="Under-staffed" value={under} color="var(--t-danger)" alert={under > 0 ? 'red' : undefined} sub="zone-days short" />
        <KTile label="Met" value={met} color="var(--t-success)" />
        <KTile label="Over-staffed" value={over} color="#2979ff" sub="more than required" />
        <KTile label="Requirement cells" value={cells.length} color="var(--t-text-muted)" sub="zone × day with a headcount" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: 20 }}>
        <div>
          <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', padding: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, gap: 10, flexWrap: 'wrap' }}>
              <div style={sectionLabel}>Coverage — {zones.length} zones × 7 days · {heat?.draft_id ? 'against the current draft' : 'no draft for the week'}</div>
              <div style={{ display: 'flex', gap: 12, fontSize: 10, color: 'var(--t-text-faint)' }}>
                {[['#ff4d7d', 'Under'], ['#2ad6a0', 'Met'], ['#2979ff', 'Over']].map(([c, l]) => (
                  <span key={l} style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 10, height: 10, background: c, display: 'inline-block', flexShrink: 0 }} />{l}</span>
                ))}
              </div>
            </div>
            {heat === null && <div style={{ fontSize: 12, color: 'var(--t-text-faint)' }}>Measuring requirements against the draft…</div>}
            {heat?.error && <div style={{ fontSize: 12, color: 'var(--t-danger)' }}>Could not read coverage: {heat.error}</div>}
            {heat && !heat.error && cells.length === 0 && <div style={{ fontSize: 12, color: 'var(--t-text-faint)' }}>No zone staffing requirements are in force for this week (OS Settings › Zones).</div>}
            {cells.length > 0 && (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: '140px repeat(7, 1fr)', gap: 3, marginBottom: 3 }}>
                  <div />
                  {weekDays.map(d => <div key={d} style={{ fontSize: 10, fontWeight: 700, color: 'var(--t-text-muted)', textAlign: 'center', padding: '4px 0' }}>{DAYS[new Date(d + 'T12:00:00').getDay()]}<div style={{ fontSize: 9, color: 'var(--t-text-faint)', fontWeight: 400 }}>{d.slice(5)}</div></div>)}
                </div>
                {zones.map(([zone, dept]) => (
                  <div key={zone} style={{ display: 'grid', gridTemplateColumns: '140px repeat(7, 1fr)', gap: 3, marginBottom: 3 }}>
                    <div style={{ fontSize: 10, color: 'var(--t-text-faint)', display: 'flex', flexDirection: 'column', justifyContent: 'center', paddingRight: 6, alignItems: 'flex-end', textAlign: 'right' }}><span style={{ color: 'var(--t-text-muted)', fontWeight: 700 }}>{zone}</span><span>{dept}</span></div>
                    {weekDays.map(d => {
                      const cell = cells.find(c => c.zone === zone && c.date === d)
                      if (!cell) return <div key={d} style={{ height: 52, border: '1px dashed var(--t-line)' }} title="no requirement this day" />
                      const pct = cov(cell); const bg = color(pct)
                      const isSel = selected?.zone === zone && selected?.date === d
                      return (
                        <div key={d} onClick={() => setSelected(isSel ? null : { zone, date: d })} title={`${zone} ${d}: ${cell.staffed} of ${cell.required}`}
                          style={{ height: 52, background: `${bg}22`, border: `2px solid ${isSel ? bg : `${bg}60`}`, cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
                          <div style={{ fontSize: 13, fontWeight: 800, color: bg }}>{cell.staffed}/{cell.required}</div>
                          <div style={{ fontSize: 9, color: bg, opacity: 0.8 }}>{label(pct)}</div>
                        </div>
                      )
                    })}
                  </div>
                ))}
              </>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {sel ? (
            <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', padding: 16 }}>
              <div style={sectionLabel}>{sel.zone} — {DAYS[sel.dow]} {sel.date}</div>
              {[['Required', sel.required], ['Placed', sel.staffed], ['Coverage', cov(sel) == null ? '—' : `${cov(sel)}%`], ['Status', label(cov(sel))], ['Department', sel.dept || '—']].map(([l, v]) => (
                <div key={l} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, padding: '5px 0', borderBottom: '1px solid var(--t-line)' }}>
                  <span style={{ color: 'var(--t-text-faint)' }}>{l}</span><span style={{ color: 'var(--t-text)', fontWeight: 600 }}>{v}</span>
                </div>
              ))}
              <div style={{ marginTop: 12 }}>
                <div style={{ fontSize: 10, color: 'var(--t-text-faint)', marginBottom: 6 }}>Placed on this zone-day</div>
                {(week?.shifts || []).filter(s => s.zone === sel.zone && s.date === sel.date).map(s => (
                  <div key={s.line_id} style={{ fontSize: 11, color: s.open ? 'var(--t-warn)' : 'var(--t-text-muted)', padding: '3px 0', borderBottom: '1px solid var(--t-line)' }}>{s.emp}{s.conflict ? ` · ⚠ ${s.conflict}` : ''}</div>
                ))}
                {(week?.shifts || []).filter(s => s.zone === sel.zone && s.date === sel.date).length === 0 && <div style={{ fontSize: 11, color: 'var(--t-text-faint)' }}>Nobody placed.</div>}
              </div>
            </div>
          ) : (
            <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', padding: 16, textAlign: 'center' }}>
              <div style={{ fontSize: 11, color: 'var(--t-text-faint)', lineHeight: 1.7 }}>Click a cell to see who is placed there.</div>
            </div>
          )}
          <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', padding: 16 }}>
            <div style={sectionLabel}>Short zone-days</div>
            {recs.length === 0 && <div style={{ fontSize: 11, color: 'var(--t-text-faint)' }}>{cells.length ? 'Every requirement is met.' : '—'}</div>}
            {recs.map((r, i) => (
              <div key={i} style={{ fontSize: 11, color: 'var(--t-text-muted)', padding: '7px 0', borderBottom: i < recs.length - 1 ? '1px solid var(--t-line)' : undefined, lineHeight: 1.5 }}>
                <span style={{ color: 'var(--t-accent)', fontWeight: 700, marginRight: 6 }}>→</span>{r}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB 4 — DRAFT HISTORY
// ─────────────────────────────────────────────────────────────────────────────
function HistoryTab({ setWeekStart, setTab }) {
  const [history, setHistory] = useState(null)
  const [viewId, setViewId] = useState(null)
  useEffect(() => {
    let live = true
    sb.rpc('tg_draft_history', { p_limit: 48 }).then(({ data, error }) => { if (live) setHistory(error ? [] : (Array.isArray(data) ? data : [])) })
    return () => { live = false }
  }, [])
  const rows = history || []
  const agentCount = rows.filter(h => h.generatedBy !== 'Manual').length
  const posted = rows.filter(h => h.status === 'posted').length
  const totalOT = rows.reduce((a, h) => a + (Number(h.otHours) || 0), 0)
  const conflicts = rows.reduce((a, h) => a + (Number(h.conflicts) || 0), 0)
  const viewRow = rows.find(r => r.id === viewId)

  return (
    <div style={{ padding: '20px 20px 40px' }}>
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
        <KTile label="Drafts" value={history === null ? '…' : rows.length} color="var(--t-text)" sub="all time" />
        <KTile label="Drafter vs Manual" value={`${agentCount}/${rows.length - agentCount}`} color="var(--t-accent)" />
        <KTile label="Posted" value={posted} color="var(--t-success)" />
        <KTile label="Projected OT" value={`${totalOT}h`} color={totalOT > 0 ? 'var(--t-warn)' : 'var(--t-text-muted)'} sub="sum of drafts" />
        <KTile label="Open conflicts" value={conflicts} color={conflicts > 0 ? 'var(--t-danger)' : 'var(--t-text-muted)'} />
      </div>
      <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
          <thead>
            <tr style={{ background: 'var(--t-surface-2)', borderBottom: '1px solid var(--t-line)' }}>
              {['Week Of', 'Department', 'Drafted By', 'Shifts', 'Open', 'Conflicts', 'Hours', 'OT Hours', 'Loaded Cost', 'Status', ''].map(h => <th key={h} style={thStyle('left', 'auto')}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {history === null && <tr><td colSpan={11} style={{ padding: 16, color: 'var(--t-text-faint)' }}>Reading drafts…</td></tr>}
            {history !== null && rows.length === 0 && <tr><td colSpan={11} style={{ padding: 16, color: 'var(--t-text-faint)' }}>No drafts have been made yet.</td></tr>}
            {rows.map((row, i) => (
              <tr key={row.id} style={{ borderBottom: '1px solid var(--t-line)', background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)' }}>
                <td style={tdStyle}><span style={{ color: 'var(--t-text)', fontWeight: 600 }}>{fmtWeekLabel(row.weekOf)}</span></td>
                <td style={tdStyle}><span style={{ color: 'var(--t-text-muted)' }}>{row.location}</span></td>
                <td style={tdStyle}><span style={{ fontSize: 10, fontWeight: 700, color: row.generatedBy !== 'Manual' ? 'var(--t-accent)' : 'var(--t-text-muted)', background: row.generatedBy !== 'Manual' ? 'rgba(0,229,255,0.1)' : 'rgba(255,255,255,0.05)', padding: '2px 7px', border: row.generatedBy !== 'Manual' ? '1px solid rgba(0,229,255,0.3)' : '1px solid var(--t-line)' }}>{row.generatedBy}</span></td>
                <td style={tdStyle}>{row.shifts}</td>
                <td style={tdStyle}><span style={{ color: row.openShifts > 0 ? 'var(--t-warn)' : 'var(--t-text-muted)' }}>{row.openShifts}</span></td>
                <td style={tdStyle}><span style={{ color: row.conflicts > 0 ? 'var(--t-danger)' : 'var(--t-text-muted)' }}>{row.conflicts}</span></td>
                <td style={tdStyle}>{row.hours == null ? '—' : `${Number(row.hours)}h`}</td>
                <td style={tdStyle}><span style={{ color: Number(row.otHours) > 10 ? 'var(--t-warn)' : 'var(--t-text-muted)' }}>{row.otHours == null ? '—' : `${Number(row.otHours)}h`}</span></td>
                <td style={tdStyle}><span style={{ color: 'var(--t-text-muted)', fontVariantNumeric: 'tabular-nums' }}>{money(row.totalCost)}</span></td>
                <td style={tdStyle}><StatusPill status={row.status} /></td>
                <td style={tdStyle}>
                  <button onClick={() => setViewId(viewId === row.id ? null : row.id)} style={ghostBtn}>{viewId === row.id ? 'Close' : 'View'}</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {viewRow && (
        <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-accent)', padding: 16, marginTop: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--t-accent)', marginBottom: 8 }}>{viewRow.title}</div>
          <div style={{ fontSize: 11, color: 'var(--t-text-muted)', lineHeight: 1.8 }}>
            {viewRow.rationale || 'No rationale recorded.'}
            <div style={{ marginTop: 6, color: 'var(--t-text-faint)' }}>Created {new Date(viewRow.createdAt).toLocaleString()}{viewRow.postedAt ? ` · posted ${new Date(viewRow.postedAt).toLocaleString()}` : ''}</div>
          </div>
          <button onClick={() => { setWeekStart(viewRow.weekOf); setTab('auto') }} style={{ ...ghostBtn, marginTop: 10 }}>Open that week</button>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// SHARED STYLE TOKENS
// ─────────────────────────────────────────────────────────────────────────────
const sectionLabel = { fontSize: 10, fontWeight: 700, color: 'var(--t-text-muted)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 12 }
const fieldLabel = { fontSize: 10, color: 'var(--t-text-faint)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 4 }
const inputStyle = { width: '100%', background: 'var(--t-bg)', border: '1px solid var(--t-line)', color: 'var(--t-text)', padding: '7px 10px', fontSize: 12, fontFamily: 'var(--font-sans)', boxSizing: 'border-box' }
function primaryBtn(disabled) {
  return {
    background: disabled ? 'rgba(0,229,255,0.1)' : 'linear-gradient(135deg, var(--t-accent) 0%, #2979ff 100%)',
    color: disabled ? 'var(--t-text-faint)' : '#000',
    border: 'none', padding: '9px 22px', cursor: disabled ? 'not-allowed' : 'pointer',
    fontWeight: 700, fontSize: 12, letterSpacing: '.03em', fontFamily: 'var(--font-sans)',
  }
}
const ghostBtn = { background: 'transparent', border: '1px solid var(--t-line)', color: 'var(--t-text-muted)', padding: '7px 14px', cursor: 'pointer', fontSize: 11, fontFamily: 'var(--font-sans)' }
function thStyle(align = 'left', minW = 'auto') {
  return { padding: '8px 12px', textAlign: align, color: 'var(--t-text-faint)', fontWeight: 700, fontSize: 10, textTransform: 'uppercase', letterSpacing: '.07em', borderBottom: '1px solid var(--t-line)', minWidth: minW, whiteSpace: 'nowrap' }
}
const tdStyle = { padding: '9px 12px', verticalAlign: 'middle' }

// ─────────────────────────────────────────────────────────────────────────────
// MAIN EXPORT
// ─────────────────────────────────────────────────────────────────────────────
export default function AiScheduler() {
  const { session } = useAuth()
  const { locationIds } = useScope()
  const roleName = (session?.person?.role_name || '').toLowerCase()
  const isHR = ['ceo', 'hr', 'manager', 'coo', 'admin', 'owner', 'cfo', 'head', 'lead'].some(r => roleName.includes(r))

  const [tab, setTab] = useState('auto')
  const [weekStart, setWeekStart] = useState(() => getWeekStart(0))
  const [departmentId, setDepartmentId] = useState(null)
  const [departments, setDepartments] = useState([])
  const [policy, setPolicy] = useState(null)
  const { week, error: weekError, reload } = useDraftWeek(weekStart, departmentId)

  useEffect(() => {
    let live = true
    sb.rpc('tg_departments').then(({ data }) => { if (live && Array.isArray(data)) setDepartments(data) })
    sb.rpc('tg_scheduling_policy').then(({ data }) => { if (live && data) setPolicy(data) })
    return () => { live = false }
  }, [])

  const TABS = [
    { id: 'auto',      label: 'Draft the week' },
    { id: 'conflicts', label: 'Conflict Resolver' },
    { id: 'coverage',  label: 'Coverage' },
    { id: 'history',   label: 'Draft History' },
  ]

  if (!isHR) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: 'var(--t-text-muted)', fontSize: 13 }}>
        Manager or HR access required to use the schedule drafter.
      </div>
    )
  }

  return (
    <div style={{ background: 'var(--t-bg)', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '18px 20px 14px', borderBottom: '1px solid var(--t-line)', flexShrink: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--t-text)', letterSpacing: '-.02em' }}>Schedule Drafter</div>
            <div style={{ fontSize: 11, color: 'var(--t-text-faint)', marginTop: 3 }}>
              Week of {fmtWeekLabel(weekStart)} · {departmentId ? (departments.find(d => d.id === departmentId)?.name || 'department') : 'all departments'} · {locationIds?.length || 0} node{locationIds?.length !== 1 ? 's' : ''} in scope
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span className="badge blue" style={{ fontSize: 10 }}>TG rule-based drafter</span>
            {policy?.caller_can_post ? <span className="badge green" style={{ fontSize: 10 }}>Sign-off role</span> : <span className="badge" style={{ fontSize: 10 }}>Read only</span>}
          </div>
        </div>
      </div>

      <TabBar tabs={TABS} active={tab} onChange={setTab} />

      <div style={{ flex: 1, overflow: 'auto' }}>
        {tab === 'auto'      && <AutoScheduleTab weekStart={weekStart} setWeekStart={setWeekStart} departmentId={departmentId} setDepartmentId={setDepartmentId} departments={departments} policy={policy} week={week} weekError={weekError} reload={reload} />}
        {tab === 'conflicts' && <ConflictResolverTab week={week} reload={reload} policy={policy} />}
        {tab === 'coverage'  && <CoverageTab weekStart={weekStart} departmentId={departmentId} week={week} />}
        {tab === 'history'   && <HistoryTab setWeekStart={setWeekStart} setTab={setTab} />}
      </div>
    </div>
  )
}
