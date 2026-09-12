// AvailabilityImport.jsx — AI Availability Import.
// HARD RULE: HR hires based on availability; HR or AI imports availability from
// the application. Employees can NEVER set their own availability — it is parsed
// from what they submitted on their application, reviewed by HR, and approved.
// This screen takes an applicant's stated availability (free text), AI-parses it
// into the 7-day × AM/PM/EVE grid used by scheduling, lets HR review/edit, and on
// approval writes it to the availability system (save_availability) for that hire.
import { useState, useCallback, useMemo, useEffect } from 'react'
import { sb } from '../lib/supabase'
import { useAuth } from '../lib/auth.jsx'
import { useScope } from '../lib/scope.jsx'

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const DAY_SHORT = { Monday: 'Mon', Tuesday: 'Tue', Wednesday: 'Wed', Thursday: 'Thu', Friday: 'Fri', Saturday: 'Sat', Sunday: 'Sun' }
const SHIFTS = ['AM', 'PM', 'EVE']
const SHIFT_LABELS = { AM: '6a–2p', PM: '2p–10p', EVE: '4p–Close' }
const EXEC_RX = /admin|owner|coo|ceo|cfo|president|chief|hr|manager/i

// day-name aliases → index
const DAY_ALIAS = {
  mon: 0, monday: 0, tue: 1, tues: 1, tuesday: 1, wed: 2, weds: 2, wednesday: 2,
  thu: 3, thur: 3, thurs: 3, thursday: 3, fri: 4, friday: 4, sat: 5, saturday: 5, sun: 6, sunday: 6,
}

function emptyGrid() {
  const g = {}
  DAYS.forEach(d => { g[d] = { AM: false, PM: false, EVE: false } })
  return g
}

// ── the "AI" parser: natural-language availability → grid + prefs ──────
// Deterministic rule engine (keyword + range + time-cue). Labeled AI-assisted;
// HR always reviews before it is saved.
function parseAvailability(text) {
  const g = emptyGrid()
  const notes = []
  if (!text || !text.trim()) return { grid: g, notes: ['No availability text provided.'], preferred: null }
  const t = ' ' + text.toLowerCase().replace(/[\n\r]+/g, ' ; ').replace(/\s+/g, ' ') + ' '

  // helper: which shifts does a phrase imply?
  const shiftsFor = (phrase) => {
    const s = new Set()
    if (/\b(all day|any ?time|any shift|open availability|whenever|full time|fully|flexible|open)\b/.test(phrase)) { s.add('AM'); s.add('PM'); s.add('EVE') }
    if (/\b(morning|opening|open|a\.?m\.?|early|before noon|day ?shift)\b/.test(phrase)) s.add('AM')
    if (/\b(afternoon|mid|midday|noon|p\.?m\.?)\b/.test(phrase)) s.add('PM')
    if (/\b(evening|night|closing|close|eve|late)\b/.test(phrase)) s.add('EVE')
    // time cues
    if (/after (3|4|5|6|7|three|four|five|6pm|5pm|4pm|3pm)/.test(phrase)) { s.add('PM'); s.add('EVE') }
    if (/before (12|noon|1|2|11)/.test(phrase)) s.add('AM')
    if (/(9\s*-\s*5|9 to 5|nine to five)/.test(phrase)) { s.add('AM'); s.add('PM') }
    if (s.size === 0) { s.add('AM'); s.add('PM'); s.add('EVE') } // default: all
    return [...s]
  }

  const setDays = (dayIdxs, shifts, on = true) => {
    dayIdxs.forEach(di => shifts.forEach(sh => { if (DAYS[di]) g[DAYS[di]][sh] = on }))
  }

  // split into clauses so "evenings" and "weekends" attach to their own days
  const clauses = t.split(/[;,.]|(?:\band\b)/).map(c => c.trim()).filter(Boolean)

  const applyClause = (clause, on = true) => {
    let days = []
    // weekday / weekend / everyday
    if (/\b(everyday|every day|all week|7 days|any day|daily)\b/.test(clause)) days = [0, 1, 2, 3, 4, 5, 6]
    else if (/\bweekend/.test(clause)) days = [5, 6]
    else if (/\bweekday|week days?\b/.test(clause)) days = [0, 1, 2, 3, 4]

    // explicit ranges: "mon-fri", "monday to saturday", "tue through thu"
    const rangeRx = /(mon|tue|tues|wed|weds|thu|thur|thurs|fri|sat|sun)[a-z]*\s*(?:-|–|to|through|thru)\s*(mon|tue|tues|wed|weds|thu|thur|thurs|fri|sat|sun)[a-z]*/g
    let m
    while ((m = rangeRx.exec(clause))) {
      const a = DAY_ALIAS[m[1]], b = DAY_ALIAS[m[2]]
      if (a != null && b != null) { for (let i = a; i !== ((b + 1) % 7); i = (i + 1) % 7) { days.push(i); if (days.length > 7) break } }
    }
    // single day mentions
    Object.keys(DAY_ALIAS).forEach(k => {
      const rx = new RegExp('\\b' + k + '\\b')
      if (rx.test(clause)) days.push(DAY_ALIAS[k])
    })
    days = [...new Set(days)]
    if (days.length === 0) return
    const shifts = shiftsFor(clause)
    setDays(days, shifts, on)
  }

  clauses.forEach(clause => {
    const negative = /\b(not available|unavailable|can'?t|cannot|no |never|except|off on|except on)\b/.test(clause)
    applyClause(clause, !negative)
  })

  // GLOBAL shift restrictions — "mornings only" / "evenings only" often appear in
  // a separate clause from the days, so apply them as a mask across all days.
  const onlyMask = []
  if (/\b(mornings?\s+only|only\s+mornings?|opening\s+only|open\s+only)\b/.test(t)) onlyMask.push('AM')
  if (/\b(afternoons?\s+only|only\s+afternoons?|middays?\s+only)\b/.test(t)) onlyMask.push('PM')
  if (/\b(evenings?\s+only|nights?\s+only|only\s+evenings?|only\s+nights?|closing\s+only)\b/.test(t)) onlyMask.push('EVE')
  if (onlyMask.length) DAYS.forEach(d => SHIFTS.forEach(sh => { if (!onlyMask.includes(sh)) g[d][sh] = false }))

  // GLOBAL negative shift removals — "cannot work mornings", "no evenings".
  const removeShift = (sh, rx) => { if (rx.test(t)) DAYS.forEach(d => { g[d][sh] = false }) }
  removeShift('AM', /\b(can'?t|cannot|no|not|never)\b[^;.,]*\b(mornings?|opening)\b/)
  removeShift('PM', /\b(can'?t|cannot|no|not|never)\b[^;.,]*\bafternoons?\b/)
  removeShift('EVE', /\b(can'?t|cannot|no|not|never)\b[^;.,]*\b(evenings?|nights?|closing)\b/)

  // preferred shift heuristic
  let preferred = null
  if (/\bprefer(s|red)?\b/.test(t)) {
    if (/\bmorning|open/.test(t)) preferred = 'AM'
    else if (/\bevening|night|close/.test(t)) preferred = 'EVE'
    else if (/\bafternoon|mid/.test(t)) preferred = 'PM'
  }

  const anyOn = DAYS.some(d => SHIFTS.some(sh => g[d][sh]))
  if (!anyOn) notes.push('Could not confidently parse — please set availability manually below.')
  else notes.push('Parsed from application text. Review and adjust before approving.')
  return { grid: g, notes, preferred }
}

// Normalize a stored/returned grid into the full 7-day × AM/PM/EVE shape so the
// UI never trips over a partial or empty object coming back from the server.
function normalizeGrid(raw) {
  const g = emptyGrid()
  if (raw && typeof raw === 'object') {
    DAYS.forEach(d => { SHIFTS.forEach(sh => { if (raw[d] && raw[d][sh]) g[d][sh] = true }) })
  }
  return g
}

const st = {
  wrap: { padding: '24px 28px', color: 'var(--t-text)', minHeight: '100vh', background: 'var(--t-bg)' },
  h1: { fontSize: 20, fontWeight: 800, letterSpacing: '.05em', margin: 0, textTransform: 'uppercase' },
  sub: { fontSize: 11, color: 'var(--t-text-muted)', marginTop: 3 },
  banner: { display: 'flex', gap: 10, alignItems: 'flex-start', padding: '12px 16px', background: 'var(--t-surface-2)', border: '1px solid var(--t-line)', borderLeft: '3px solid var(--t-warn)', marginBottom: 18, fontSize: 12, color: 'var(--t-text)' },
  grid2: { display: 'grid', gridTemplateColumns: '320px 1fr', gap: 18, alignItems: 'start' },
  card: { background: 'var(--t-surface)', border: '1px solid var(--t-line)', borderRadius: 0 },
  cardHead: { padding: '11px 16px', borderBottom: '1px solid var(--t-line)', background: 'var(--t-surface-2)', fontSize: 11, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase' },
  cardBody: { padding: 16 },
  applicant: (active) => ({ padding: '11px 14px', borderBottom: '1px solid var(--t-line)', cursor: 'pointer', background: active ? 'var(--t-surface-2)' : 'transparent', borderLeft: active ? '3px solid var(--t-accent)' : '3px solid transparent' }),
  label: { fontSize: 10, fontWeight: 700, letterSpacing: '.08em', color: 'var(--t-text-muted)', textTransform: 'uppercase' },
  ta: { width: '100%', minHeight: 90, fontSize: 12, padding: 10, background: 'var(--t-surface)', border: '1px solid var(--t-line)', color: 'var(--t-text)', borderRadius: 0, outline: 'none', resize: 'vertical', fontFamily: 'inherit' },
  btn: { fontSize: 11, fontWeight: 700, padding: '8px 15px', background: 'var(--t-accent)', border: 'none', color: '#fff', borderRadius: 0, cursor: 'pointer', letterSpacing: '.04em' },
  ghost: { fontSize: 11, fontWeight: 600, padding: '7px 13px', background: 'var(--t-surface)', border: '1px solid var(--t-line)', color: 'var(--t-text-muted)', borderRadius: 0, cursor: 'pointer' },
  cell: (on) => ({ padding: '9px 4px', textAlign: 'center', cursor: 'pointer', fontSize: 11, fontWeight: 700, border: '1px solid var(--t-line)', background: on ? 'var(--t-success)' : 'var(--t-surface)', color: on ? '#fff' : 'var(--t-text-faint)', userSelect: 'none' }),
}

export default function AvailabilityImport() {
  const { session } = useAuth()
  const { locationIds } = useScope()
  const person = session?.person || {}
  const canApprove = EXEC_RX.test(person.role_name || '')

  const [applicants, setApplicants] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadErr, setLoadErr] = useState('')
  const [selId, setSelId] = useState(null)
  const [raw, setRaw] = useState('')
  const [grid, setGrid] = useState(emptyGrid())
  const [notes, setNotes] = useState([])
  const [preferred, setPreferred] = useState(null)
  const [approved, setApproved] = useState(false)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState('')

  const selApplicant = applicants.find(a => a.applicant_id === selId) || null

  // Load real applicants (recruiting pipeline) scoped to the viewer's locations,
  // along with any reviewed/approved availability import already on file.
  const loadApplicants = useCallback(async () => {
    setLoading(true); setLoadErr('')
    const { data, error } = await sb.rpc('get_applicant_availability', {
      p_node_ids: (locationIds && locationIds.length) ? locationIds : null,
    })
    if (error) { setLoadErr(error.message || 'Could not load applicants'); setApplicants([]); setLoading(false); return }
    setApplicants(data || [])
    setLoading(false)
  }, [locationIds])

  useEffect(() => { loadApplicants() }, [loadApplicants])

  // When the applicant list (re)loads, keep a valid selection.
  useEffect(() => {
    if (!applicants.length) { setSelId(null); return }
    if (!applicants.some(a => a.applicant_id === selId)) setSelId(applicants[0].applicant_id)
  }, [applicants]) // eslint-disable-line react-hooks/exhaustive-deps

  // Populate the editor from the selected applicant's saved import (or their
  // stated application text if nothing has been reviewed yet).
  useEffect(() => {
    if (!selApplicant) { setRaw(''); setGrid(emptyGrid()); setNotes([]); setPreferred(null); setApproved(false); return }
    setRaw(selApplicant.raw_text || '')
    setGrid(normalizeGrid(selApplicant.grid))
    setNotes(Array.isArray(selApplicant.notes) ? selApplicant.notes : [])
    setPreferred(selApplicant.preferred_shift || null)
    setApproved(!!selApplicant.approved)
  }, [selId]) // eslint-disable-line react-hooks/exhaustive-deps

  const runParse = useCallback(() => {
    const { grid: g, notes: n, preferred: p } = parseAvailability(raw)
    setGrid(g); setNotes(n); setPreferred(p); setApproved(false)
    setToast('AI parsed availability — review & approve')
    setTimeout(() => setToast(''), 2500)
  }, [raw])

  const toggle = useCallback((day, sh) => {
    setGrid(g => ({ ...g, [day]: { ...g[day], [sh]: !g[day][sh] } }))
    setApproved(false)
  }, [])

  const daysCovered = useMemo(() => DAYS.filter(d => SHIFTS.some(sh => grid[d][sh])).length, [grid])
  const slotsCovered = useMemo(() => DAYS.reduce((n, d) => n + SHIFTS.filter(sh => grid[d][sh]).length, 0), [grid])

  const approve = useCallback(async () => {
    if (!selApplicant || saving) return
    setSaving(true)
    const { error } = await sb.rpc('save_applicant_availability', {
      p_applicant_id: selApplicant.applicant_id,
      p_raw: raw,
      p_grid: grid,
      p_preferred_shift: preferred,
      p_notes: notes,
      p_approved: true,
      p_approved_by: person.full_name || person.display_name || 'HR',
    })
    setSaving(false)
    if (error) {
      setToast('Not saved — ' + (error.message || 'try again'))
      setTimeout(() => setToast(''), 3000)
      return
    }
    setApproved(true)
    await loadApplicants()
    setToast('Approved & saved to applicant file')
    setTimeout(() => setToast(''), 2500)
  }, [selApplicant, saving, raw, grid, preferred, notes, person.full_name, person.display_name, loadApplicants])

  return (
    <div style={st.wrap}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
        <div>
          <h1 style={st.h1}>AI Availability Import</h1>
          <div style={st.sub}>Import each hire's availability from their application — parsed by AI, approved by HR.</div>
        </div>
      </div>

      <div style={st.banner}>
        <span style={{ fontSize: 16 }}>🔒</span>
        <div><strong>Policy:</strong> Employees cannot set their own availability. It is captured from the job application, AI-parsed here, and locked once HR approves. Any later change must go through an approval request.</div>
      </div>

      <div style={st.grid2}>
        {/* applicants list */}
        <div style={st.card}>
          <div style={st.cardHead}>Applicants</div>
          <div>
            {loading && <div style={{ padding: '16px', fontSize: 12, color: 'var(--t-text-muted)' }}>Loading applicants…</div>}
            {!loading && loadErr && <div style={{ padding: '16px', fontSize: 12, color: 'var(--t-danger)' }}>{loadErr}</div>}
            {!loading && !loadErr && applicants.length === 0 && (
              <div style={{ padding: '16px', fontSize: 12, color: 'var(--t-text-faint)' }}>No applicants in your locations yet.</div>
            )}
            {applicants.map(a => {
              const done = a.approved
              return (
                <div key={a.applicant_id} style={st.applicant(a.applicant_id === selId)} onClick={() => setSelId(a.applicant_id)}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 700, fontSize: 13 }}>{a.full_name}</span>
                    {done && <span style={{ fontSize: 8, fontWeight: 800, padding: '2px 6px', background: 'var(--t-success)', color: '#fff', letterSpacing: '.05em' }}>APPROVED</span>}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--t-text-muted)', marginTop: 2 }}>{[a.position, a.location].filter(Boolean).join(' · ') || '—'}</div>
                </div>
              )
            })}
          </div>
        </div>

        {/* editor */}
        <div style={st.card}>
          <div style={st.cardHead}>{selApplicant ? `${selApplicant.full_name} — Availability` : 'Availability'}</div>
          {!selApplicant ? (
            <div style={{ ...st.cardBody, color: 'var(--t-text-faint)', fontSize: 12 }}>
              Select an applicant to import and review their availability.
            </div>
          ) : (
          <div style={st.cardBody}>
            <div style={st.label}>Stated availability (from application)</div>
            <textarea value={raw} onChange={e => setRaw(e.target.value)} style={{ ...st.ta, marginTop: 6 }} placeholder="e.g. Weekdays after 4pm, all day weekends. Prefer evenings." />
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button style={st.btn} onClick={runParse}>🤖 AI Parse Availability</button>
              <button style={st.ghost} onClick={() => { setGrid(emptyGrid()); setApproved(false) }}>Clear Grid</button>
            </div>

            {notes.length > 0 && (
              <div style={{ marginTop: 10, fontSize: 11, color: 'var(--t-text-muted)' }}>
                {notes.map((n, i) => <div key={i}>• {n}</div>)}
                {preferred && <div style={{ color: 'var(--t-accent)', marginTop: 2 }}>• Preferred shift: <strong>{preferred}</strong> ({SHIFT_LABELS[preferred]})</div>}
              </div>
            )}

            {/* grid */}
            <div style={{ marginTop: 16, overflowX: 'auto' }}>
              <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 520 }}>
                <thead>
                  <tr>
                    <th style={{ ...st.label, textAlign: 'left', padding: '6px 8px' }}>Shift</th>
                    {DAYS.map(d => <th key={d} style={{ ...st.label, padding: '6px 4px', textAlign: 'center' }}>{DAY_SHORT[d]}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {SHIFTS.map(sh => (
                    <tr key={sh}>
                      <td style={{ fontSize: 11, fontWeight: 700, padding: '6px 8px', whiteSpace: 'nowrap' }}>{sh}<span style={{ color: 'var(--t-text-faint)', fontWeight: 400 }}> {SHIFT_LABELS[sh]}</span></td>
                      {DAYS.map(d => (
                        <td key={d + sh} style={st.cell(grid[d][sh])} onClick={() => toggle(d, sh)}>{grid[d][sh] ? '✓' : '·'}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 14 }}>
              <div style={{ fontSize: 11, color: 'var(--t-text-muted)' }}>{daysCovered} days · {slotsCovered} shift slots available</div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                {approved && <span style={{ fontSize: 11, color: 'var(--t-success)', fontWeight: 700 }}>✓ Approved</span>}
                {canApprove
                  ? <button style={{ ...st.btn, background: approved ? 'var(--t-success)' : 'var(--t-accent)', opacity: saving ? 0.6 : 1 }} onClick={approve} disabled={saving}>{saving ? 'Saving…' : approved ? 'Re-approve' : 'Approve & Save'}</button>
                  : <span style={{ fontSize: 11, color: 'var(--t-text-faint)' }}>HR approval required</span>}
              </div>
            </div>
          </div>
          )}
        </div>
      </div>

      {toast && (
        <div style={{ position: 'fixed', bottom: 24, right: 24, background: 'var(--t-success)', color: '#fff', padding: '10px 16px', fontSize: 12, fontWeight: 700, zIndex: 9999 }}>{toast}</div>
      )}
    </div>
  )
}
