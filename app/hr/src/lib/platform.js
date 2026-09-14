// lib/platform.js — shared platform event bus + localStorage contract

// ── Key generators ────────────────────────────────────────
export const KEY = {
  activePunch:    (personId) => `vip_active_punch_${personId}`,
  punchStatus:    () => `vip_punch_status`,
  timeRecords:    (personId) => `vip_time_records_${personId}`,
  disputes:       () => `vip_disputes`,
  gamifPoints:    (personId) => `vip_gamification_points_${personId}`,
  gamifPending:   () => `vip_pending_gamification_awards`,
  trainingDone:   (personId, moduleId) => `vip_training_completed_${personId}_${moduleId}`,
  attPoints:      (personId) => `vip_attendance_points_${personId}`,
  notifications:  () => `vip_notifications`,
  scheduleData:   (locationId, weekStart) => `vip_schedule_${locationId}_${weekStart}`,
  schedulePub:    (locationId, weekStart) => `vip_schedule_published_${locationId}_${weekStart}`,
  cleaningSignoff:(location, shift, date) => `vip_cleaning_signoff_${location}_${shift}_${date}`,
  huddleTasks:    (locationId, date) => `vip_huddle_tasks_${locationId}_${date}`,
  broadcastAcks:  () => `vip_broadcast_acks`,
  policyEdits:    () => `vip_policy_edits`,
  scheduledPolicies: () => `vip_scheduled_policies`,
  publishedDrafts:   () => `vip_published_drafts`,
}

// ── Local read/write helpers ──────────────────────────────
export function lsGet(key, def = null) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : def } catch { return def }
}
export function lsSet(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)) } catch {}
}

// ── Notification push ─────────────────────────────────────
// type: 'info' | 'success' | 'warning' | 'alert'
// category: 'schedule' | 'policy' | 'training' | 'hr' | 'system'
export function pushNotification({ title, message, type = 'info', category = 'system', targetPersonIds = null }) {
  const notifs = lsGet(KEY.notifications(), [])
  const notif = {
    id: `notif_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
    title,
    message,
    type,
    category,
    targetPersonIds, // null = all employees; array of IDs = specific people
    createdAt: new Date().toISOString(),
    read: false,
  }
  notifs.unshift(notif) // newest first
  // Keep max 200 notifications
  lsSet(KEY.notifications(), notifs.slice(0, 200))
  // Dispatch event so NotificationCenter updates in real time
  window.dispatchEvent(new CustomEvent('vip_notification_added', { detail: notif }))
}

// ── Points award ──────────────────────────────────────────
// reason: string describing why points were awarded
export function awardPoints(personId, pts, reason) {
  const current = lsGet(KEY.gamifPoints(personId), { total: 0, history: [] })
  current.total = (current.total || 0) + pts
  current.history.unshift({ pts, reason, ts: new Date().toISOString() })
  current.history = current.history.slice(0, 100) // keep last 100
  lsSet(KEY.gamifPoints(personId), current)
  window.dispatchEvent(new CustomEvent('vip_points_awarded', { detail: { personId, pts, reason } }))
}

// ── Attendance points ─────────────────────────────────────
export function addAttendancePoints(personId, pts, reason, config) {
  const rec = lsGet(KEY.attPoints(personId), { total: 0, history: [] })
  rec.total = Math.max(0, (rec.total || 0) + pts)
  rec.history.unshift({ pts, reason, ts: new Date().toISOString() })
  rec.history = rec.history.slice(0, 50)
  lsSet(KEY.attPoints(personId), rec)
  window.dispatchEvent(new CustomEvent('vip_att_points_changed', { detail: { personId, total: rec.total } }))
}

// ── Training record ───────────────────────────────────────
export function recordTrainingComplete(personId, moduleId, moduleName) {
  lsSet(KEY.trainingDone(personId, moduleId), { completedAt: new Date().toISOString(), moduleName })
  awardPoints(personId, 25, `Completed training: ${moduleName}`)
  pushNotification({
    title: 'Training Completed',
    message: `Training module "${moduleName}" marked complete.`,
    type: 'success',
    category: 'training',
    targetPersonIds: [personId],
  })
}

// ── Active staff scan ─────────────────────────────────────
export function getActiveStaff() {
  return Object.keys(localStorage)
    .filter(k => k.startsWith('vip_active_punch_'))
    .map(k => {
      try { return JSON.parse(localStorage.getItem(k)) } catch { return null }
    })
    .filter(Boolean)
}

// ── Get person's gamif points ─────────────────────────────
export function getPoints(personId) {
  return lsGet(KEY.gamifPoints(personId), { total: 0, history: [] })
}

// ── Get person's attendance points ───────────────────────
export function getAttPoints(personId) {
  return lsGet(KEY.attPoints(personId), { total: 0, history: [] })
}
