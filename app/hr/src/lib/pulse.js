import { sb } from './supabase'

// pulse.js — Daily Pulse enforcement engine.
// Every staff member answers the Daily Pulse each shift. Rules (admin-adjustable):
//  • A reminder fires N minutes into the shift.
//  • Returning from break, they cannot clock back in until the pulse is answered.
//  • Anything below "Good" requires a reason; HR + the COO are notified.
//  • AI can send the reminder + a "required each shift" warning.

export const MOODS = [
  { v: 5, e: '😄', label: 'Great' },
  { v: 4, e: '🙂', label: 'Good' },
  { v: 3, e: '😐', label: 'Okay' },
  { v: 2, e: '😕', label: 'Meh' },
  { v: 1, e: '😞', label: 'Rough' },
]

const SETTINGS_KEY = 'vip_pulse_settings'
const DEFAULT_SETTINGS = {
  reminderMins: 30,          // fire a reminder this many minutes into the shift
  enforceOnClockIn: false,   // require the pulse at clock-in
  enforceOnBreakReturn: true,// require the pulse before clocking back in from break
  aiReminder: true,          // AI-worded reminder + "required each shift" warning
}

export function getPulseSettings() {
  try { const r = localStorage.getItem(SETTINGS_KEY); return r ? { ...DEFAULT_SETTINGS, ...JSON.parse(r) } : { ...DEFAULT_SETTINGS } }
  catch { return { ...DEFAULT_SETTINGS } }
}
export function setPulseSettings(patch) {
  const next = { ...getPulseSettings(), ...patch }
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(next)) } catch (_) {}
  return next
}

const todayKey = () => new Date().toISOString().slice(0, 10)
const pulseKey = (pid) => `vip_pulse_${pid}_${todayKey()}`

export function pulseDoneToday(pid) {
  try { return !!JSON.parse(localStorage.getItem(pulseKey(pid || 'anon')) || 'null') } catch { return false }
}

// record a pulse; low mood (<Good) escalates to HR + COO
export function recordPulse(pid, personName, mood, note) {
  const low = mood < 4
  const rec = { mood, note: (note || '').trim(), at: new Date().toISOString(), flagged: low, notified: low ? ['HR', 'COO'] : [] }
  try { localStorage.setItem(pulseKey(pid || 'anon'), JSON.stringify(rec)) } catch (_) {}
  if (low) {
    try {
      const flags = JSON.parse(localStorage.getItem('vip_pulse_flags') || '[]')
      flags.unshift({ id: `pf-${Date.now()}`, person_id: pid, person_name: personName || 'Employee', mood, mood_label: MOODS.find(m => m.v === mood)?.label, note: (note || '').trim(), at: rec.at, notified: ['HR', 'COO'] })
      localStorage.setItem('vip_pulse_flags', JSON.stringify(flags.slice(0, 200)))
    } catch (_) {}
  }
  // DURABLE persistence to Supabase (best-effort, non-blocking) so HR/COO see
  // flags across devices/browsers — not just this browser's localStorage.
  try {
    if (pid && /^[0-9a-f-]{36}$/i.test(String(pid))) {
      sb.rpc('submit_pulse', { p_person_id: pid, p_person_name: personName || 'Employee', p_mood: mood, p_note: (note || '').trim() || null }).then(() => {}, () => {})
    }
  } catch (_) {}
  return rec
}

// durable reads for HR/COO — fall back to localStorage if offline/empty
export async function fetchPulseFlags() {
  try { const { data } = await sb.rpc('get_pulse_flags', { p_node_ids: null }); if (Array.isArray(data) && data.length) return data } catch (_) {}
  try { return JSON.parse(localStorage.getItem('vip_pulse_flags') || '[]') } catch { return [] }
}
export async function fetchPulseDoneToday(pid) {
  try { const { data } = await sb.rpc('get_pulse_today', { p_person_id: pid }); if (data) return true } catch (_) {}
  return pulseDoneToday(pid)
}
export async function fetchPulseSentiment() {
  try { const { data } = await sb.rpc('get_pulse_sentiment', { p_node_ids: null }); if (Array.isArray(data) && data[0]) return { avg: Number(data[0].avg_mood) || null, count: Number(data[0].checkins) || 0 } } catch (_) {}
  return { avg: null, count: 0 }
}

// AI reminder copy — required-each-shift warning
export function pulseReminderText(name) {
  const first = (name || 'there').split(' ')[0]
  return `👋 ${first}, quick check — your Daily Pulse is required every shift. Take 5 seconds to check in so HR knows how the team's doing. Good vibes only — let's have a great shift!`
}
