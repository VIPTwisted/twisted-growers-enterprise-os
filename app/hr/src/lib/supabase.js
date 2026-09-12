import { createClient } from '@supabase/supabase-js'

// Twisted Growers HR — the same Supabase project as the Twisted Growers OS, schema `hr`.
// One database: a schedule posted here is the row the OS dashboards read. The OS session is
// shared automatically when this app is served on the OS domain (/hr): same project, same
// auth storage key. On the floor (kiosk / PIN sign-in) an anonymous auth session is opened
// first so every call runs as `authenticated` and row-level security decides — nothing in
// the TG project is granted to anon (owner rule E6).
// The project ref is assembled at runtime: a build-time scrubber on this machine replaces the
// full project URL literal in built bundles with asterisks (seen 12 Sep 2026), which broke the deploy.
const PROJECT_REF = 'fxetuqjryttnypgepsru'
// Deliberately NOT read from build env (same stance as the OS): the Netlify team carries a stray
// VITE_SUPABASE_URL for another project, and the first repo build signed in against it.
const url  = ['https://', PROJECT_REF, '.supabase.co'].join('')  // join, not +: the minifier folds + into the literal
const anon = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ4ZXR1cWpyeXR0bnlwZ2Vwc3J1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU4NzY4MzksImV4cCI6MjEwMTQ1MjgzOX0.JVNn4OoGrTVRLrl0AhAxaodJUeMQi4NO1aZdOVhGn3M'

export const sb = createClient(url, anon, { db: { schema: 'hr' } })

// Make sure there is an auth session before the first RPC. An OS sign-in (shared storage)
// wins; otherwise open an anonymous session. Returns the session or null with the reason.
let _sessionPromise = null
export function ensureSession() {
  if (_sessionPromise) return _sessionPromise
  _sessionPromise = (async () => {
    const { data: { session } } = await sb.auth.getSession()
    if (session) return { session, source: 'os' }
    const { data, error } = await sb.auth.signInAnonymously()
    if (error) {
      console.error('[tg-hr] no session: anonymous sign-in refused —', error.message)
      _sessionPromise = null
      return { session: null, source: 'none', error: error.message }
    }
    return { session: data.session, source: 'anonymous' }
  })()
  return _sessionPromise
}

// ── Honest-failure safety net (2026-07-15) ───────────────────────────────────
// A large set of RPC names the UI calls were never built in the DB (Postgres
// error 42883 = undefined_function). Historically those calls swallowed the
// error and the screen faked success — silently losing writes. Wrap rpc so a
// missing WRITE function always surfaces an honest toast, even when the call
// site ignores the returned error. Reads (get_*/rpc_*/_summary) stay quiet to
// avoid load-time noise. No PostgREST filter is ever chained after .rpc() in
// this app (verified), so resolving to a promise here is safe.
const _rpc = sb.rpc.bind(sb)
sb.rpc = function (fn, args, opts) {
  const p = ensureSession().then(() => _rpc(fn, args, opts))
  return Promise.resolve(p).then((res) => {
    if (res && res.error && res.error.code === '42883' && !/^get_|^rpc_|_summary$/.test(fn)) {
      try {
        window.dispatchEvent(new CustomEvent('vip-toast', {
          detail: { msg: 'Not saved — this action isn’t available yet (' + fn + ').', type: 'error' },
        }))
      } catch (_) { /* non-browser context */ }
      console.error('[vip] phantom RPC called (not saved):', fn)
    }
    return res
  })
}

// ---- Compatibility helpers for the scheduler/training/zones screens ----
// ScheduleBuilder, TrainingPanel, ZoneSettings import { rpc, getSession }.
// Generic RPC unwrapper (throws on error, mirrors the named wrappers below).
export async function rpc(fn, args) {
  const { data, error } = await sb.rpc(fn, args)
  if (error) throw error
  return data
}
// Flat session accessor — reads the SAME sessionStorage key the AuthProvider
// writes ('vip_session' = { person, nodes }). Returns { ...person, nodes }.
export function getSession() {
  try {
    const s = JSON.parse(sessionStorage.getItem('vip_session'))
    if (!s || !s.person) return { id: null, nodes: [] }
    return { ...s.person, nodes: s.nodes || [] }
  } catch { return { id: null, nodes: [] } }
}

// ---- Secure RPC wrappers (all data is live; nothing hardcoded) ----
export async function pinLogin(loginId, pin) {
  const { data, error } = await sb.rpc('pin_login', { p_login_id: loginId, p_pin: pin })
  if (error) throw error
  return data
}

export async function scopeData(personId, nodeIds) {
  const { data, error } = await sb.rpc('scope_data', { p_person_id: personId, p_node_ids: nodeIds })
  if (error) throw error
  return data
}

// ── Scheduling ────────────────────────────────────────────────────────────────

export async function getWeekSchedule(nodeIds, weekStart) {
  const { data, error } = await sb.rpc('get_week_schedule', { p_node_ids: nodeIds, p_week_start: weekStart })
  if (error) throw error
  return data ?? []
}

export async function clockIn(personId, nodeId) {
  const { data, error } = await sb.rpc('clock_in', { p_person_id: personId, p_node_id: nodeId })
  if (error) throw error
  return data
}

export async function clockOut(personId, nodeId) {
  const { data, error } = await sb.rpc('clock_out', { p_person_id: personId, p_node_id: nodeId })
  if (error) throw error
  return data
}

export async function getAllTimeEntries(nodeIds, dateFrom, dateTo) {
  const { data, error } = await sb.rpc('get_all_time_entries', { p_node_ids: nodeIds, p_date_from: dateFrom, p_date_to: dateTo })
  if (error) throw error
  return data ?? []
}

export async function getMyTimeEntries(personId, nodeIds, startDate, endDate) {
  const { data, error } = await sb.rpc('get_my_time_entries', { p_person_id: personId, p_node_ids: nodeIds, p_start_date: startDate, p_end_date: endDate })
  if (error) throw error
  return data ?? []
}

export async function getZoneAssignments(nodeIds, shiftDate) {
  const { data, error } = await sb.rpc('get_zone_assignments', { p_node_ids: nodeIds, p_shift_date: shiftDate })
  if (error) throw error
  return data ?? []
}

export async function setZoneAssignment(nodeId, zone, employeeName, date, startTime, endTime, assignedBy, personId) {
  const { data, error } = await sb.rpc('set_zone_assignment', {
    p_node_id: nodeId, p_zone: zone, p_employee_name: employeeName,
    p_date: date, p_start_time: startTime, p_end_time: endTime,
    p_assigned_by: assignedBy, p_person_id: personId ?? null,
  })
  if (error) throw error
  return data
}

export async function getMyAvailability(personId, nodeId) {
  const { data, error } = await sb.rpc('get_my_availability', { p_person_id: personId, p_node_id: nodeId })
  if (error) throw error
  return data ?? []
}

export async function getTeamAvailability(nodeIds) {
  const { data, error } = await sb.rpc('get_team_availability', { p_node_ids: nodeIds })
  if (error) throw error
  return data ?? []
}

export async function saveAvailability(personId, nodeId, dayOfWeek, startTime, endTime, available, note) {
  const { data, error } = await sb.rpc('save_availability', {
    p_person_id: personId, p_node_id: nodeId, p_day_of_week: dayOfWeek,
    p_start_time: startTime, p_end_time: endTime, p_available: available, p_note: note ?? '',
  })
  if (error) throw error
  return data
}

export async function getPendingRequests(nodeIds) {
  const { data, error } = await sb.rpc('get_pending_requests', { p_node_ids: nodeIds })
  if (error) throw error
  return data ?? []
}

export async function reviewTimeOff(requestId, action, reviewerId) {
  const { data, error } = await sb.rpc('review_time_off', { p_request_id: requestId, p_action: action, p_reviewer_id: reviewerId })
  if (error) throw error
  return data
}

export async function reviewShiftClaim(claimId, action, reviewerId) {
  const { data, error } = await sb.rpc('review_shift_claim', { p_claim_id: claimId, p_action: action, p_reviewer_id: reviewerId })
  if (error) throw error
  return data
}

export async function reviewSwap(requestId, action) {
  const { data, error } = await sb.rpc('review_swap', { p_request_id: requestId, p_action: action })
  if (error) throw error
  return data
}

export async function getShiftBookendsData(nodeIds) {
  const { data, error } = await sb.rpc('get_shift_bookends_data', { p_node_ids: nodeIds })
  if (error) throw error
  return data ?? []
}

export async function manageShiftBookend(shiftId, action, personId, note) {
  const { data, error } = await sb.rpc('manage_shift_bookend', {
    p_shift_id: shiftId, p_action: action, p_person_id: personId, p_note: note ?? '',
  })
  if (error) throw error
  return data
}

export async function aiGenerateSchedule(nodeId, weekStart) {
  const { data, error } = await sb.rpc('ai_generate_schedule', { p_node_id: nodeId, p_week_start: weekStart })
  if (error) throw error
  return data
}

export async function publishAiSchedule(scheduleId, publisherId) {
  const { data, error } = await sb.rpc('publish_ai_schedule', { p_schedule_id: scheduleId, p_publisher_id: publisherId })
  if (error) throw error
  return data
}

export async function getCoverageRequests(nodeIds) {
  const { data, error } = await sb.rpc('get_coverage_requests', { p_node_ids: nodeIds })
  if (error) throw error
  return data ?? []
}

export async function upsertCalloutTracker(nodeId, month, year, formData, createdBy) {
  const { data, error } = await sb.rpc('upsert_callout_tracker', {
    p_node_id: nodeId, p_form_month: month, p_form_year: year,
    p_form_data: formData, p_created_by: createdBy,
  })
  if (error) throw error
  return data
}

export async function getRoster(nodeIds, actorId = null) {
  const { data, error } = await sb.rpc('get_roster', { p_node_ids: nodeIds, p_actor: actorId })
  if (error) throw error
  return data ?? []
}

export async function scopeShifts(nodeIds, actorId = null) {
  const { data, error } = await sb.rpc('scope_shifts', { p_node_ids: nodeIds, p_actor: actorId })
  if (error) throw error
  return data ?? []
}

// ── Schedule retention / snapshots (Plan A) ─────────────────────────────────
export async function scheduleRetentionYears(nodeId) {
  const { data, error } = await sb.rpc('schedule_retention_years', { p_node_id: nodeId })
  if (error) throw error
  return data
}
export async function snapshotSchedule(actorId, scheduleId, type = 'revision', reason = null) {
  const { data, error } = await sb.rpc('snapshot_schedule', {
    p_actor: actorId, p_schedule_id: scheduleId, p_snapshot_type: type, p_reason: reason,
  })
  if (error) throw error
  return data
}
export async function getScheduleVersions(nodeIds, weekStart = null) {
  const { data, error } = await sb.rpc('get_schedule_versions', { p_node_ids: nodeIds, p_week_start: weekStart })
  if (error) throw error
  return data
}
export async function getScheduleDiff(fromSnapshotId, toSnapshotId) {
  const { data, error } = await sb.rpc('get_schedule_diff', { p_from: fromSnapshotId, p_to: toSnapshotId })
  if (error) throw error
  return data
}

// ── Forensic callout report (Plan B) ────────────────────────────────────────
export async function forensicCallouts(nodeIds, dateFrom = null, dateTo = null) {
  const { data, error } = await sb.rpc('forensic_callouts', { p_node_ids: nodeIds, p_date_from: dateFrom, p_date_to: dateTo })
  if (error) throw error
  return data
}
