import { useState, useEffect } from 'react'

export const FEATURE_DEFAULTS = {
  // ── CEO ─────────────────────────────────────────────
  labor_cost_pct:       true,
  budget_actual:        true,
  shrinkage_alerts:     true,
  executive_digest:     true,
  turnover_cost:        true,
  // ── District Manager ────────────────────────────────
  manager_scorecards:   true,
  store_visit_log:      true,
  shift_marketplace:    true,
  scheduling_compliance:true,
  writeup_trends:       true,
  // ── HR Compliance ───────────────────────────────────
  i9_expiry:            true,
  paid_leave:           true,
  fmla_loa:             true,
  bg_check_gate:        true,
  exit_interviews:      true,
  handbook_ack:         true,
  workers_comp:         true,
  // ── STAFF MANAGEMENT ────────────────────────────────
  employee_360:          true,
  probation_tracker:     true,
  one_on_ones:           true,
  shift_notes:           true,
  shift_report:          true,
  health_score:          true,
  coaching_log:          true,
  risk_alerts:           true,
  employee_timeline:     true,
  // ── ATTENDANCE ──────────────────────────────────────
  attendance_points:     true,
  return_to_work:        true,
  absence_heatmap:       true,
  // ── POLICY & PROCEDURES ─────────────────────────────
  policy_versioning:     true,
  policy_quiz:           true,
  policy_da_link:        true,
  progressive_discipline:true,
  // ── TRAINING ────────────────────────────────────────
  retraining_triggers:   true,
  training_expiry:       true,
  skills_matrix:         true,
  training_effectiveness:true,
  onboarding_milestones: true,
  // ── HR OPERATIONS ───────────────────────────────────
  suspensions:           true,
  hr_investigations:     true,
  rehires:               true,
  // ── OPERATIONS ───────────────────────────────────────────
  daily_projects:        true,
  cleaning_logs:         true,
  shift_broadcasts:      true,
  // ── TIME & PAYROLL ────────────────────────────────────────
  kiosk_mode:            true,
  payroll_summary:       true,
  // ── EMPLOYEE SELF-SERVICE ──────────────────────────────────
  benefits_admin:        true,
  payroll_detail:        true,
  notifications:         true,
  org_chart:             true,
  // ── COMPLIANCE ───────────────────────────────────────────
  ct_compliance:         true,
  emergency_contacts:    true,
  // ── HANDBOOK ─────────────────────────────────────────────
  handbook_builder:      true,
}

const KEY = 'vip_feature_flags'
const ROLE_KEY = 'vip_feature_roles'   // { [featureKey]: [allowedRoleGroups] } — absent = all roles allowed

// Role groups an admin can grant a feature to. Execs always have access.
export const ALL_ROLES = ['Admin/Owner', 'COO', 'CFO', 'HR Manager', 'Manager', 'Key Holder', 'Associate']
const EXEC_RX = /admin|owner|coo|ceo|cfo|president|chief/i
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z]/g, '')

function load() {
  try { const s = localStorage.getItem(KEY); return s ? { ...FEATURE_DEFAULTS, ...JSON.parse(s) } : { ...FEATURE_DEFAULTS } }
  catch { return { ...FEATURE_DEFAULTS } }
}
const OVERRIDE_KEY = 'vip_feature_overrides'   // { [key]: { allow:[personId], block:[personId] } }

function loadRoles() { try { const s = localStorage.getItem(ROLE_KEY); return s ? JSON.parse(s) : {} } catch { return {} } }
function loadOverrides() { try { const s = localStorage.getItem(OVERRIDE_KEY); return s ? JSON.parse(s) : {} } catch { return {} } }
function currentRole() { try { return JSON.parse(sessionStorage.getItem('vip_session') || '{}')?.person?.role_name || '' } catch { return '' } }
function currentPersonId() { try { return JSON.parse(sessionStorage.getItem('vip_session') || '{}')?.person?.id || '' } catch { return '' } }

// Access check. Precedence: explicit per-person BLOCK → per-person ALLOW → exec → role list → unrestricted.
export function roleAllowed(key, role, personId) {
  const ov = loadOverrides()[key]
  if (ov && personId) {
    if (Array.isArray(ov.block) && ov.block.includes(personId)) return false
    if (Array.isArray(ov.allow) && ov.allow.includes(personId)) return true
  }
  if (EXEC_RX.test(role || '')) return true
  const allowed = loadRoles()[key]
  if (!allowed || !allowed.length) return true
  const r = norm(role)
  return allowed.some(a => { const n = norm(a.split('/')[0]); return r.includes(n) || n.includes(r) })
}

export function useFeatureFlag(key) {
  const [flags, setFlags] = useState(load)
  const [role, setRole] = useState(currentRole)
  const [pid, setPid] = useState(currentPersonId)
  useEffect(() => {
    const h = () => { setFlags(load()); setRole(currentRole()); setPid(currentPersonId()) }
    window.addEventListener('vip_flags_changed', h)
    return () => window.removeEventListener('vip_flags_changed', h)
  }, [])
  return flags[key] !== false && roleAllowed(key, role, pid)
}

// Per-person overrides: mode ∈ 'allow' | 'block' | 'clear'.
export function getFeatureOverrides(key) { const o = loadOverrides()[key] || {}; return { allow: o.allow || [], block: o.block || [] } }
export function setFeatureOverride(key, personId, mode) {
  const all = loadOverrides()
  const o = all[key] || { allow: [], block: [] }
  o.allow = (o.allow || []).filter(id => id !== personId)
  o.block = (o.block || []).filter(id => id !== personId)
  if (mode === 'allow') o.allow.push(personId)
  else if (mode === 'block') o.block.push(personId)
  if (!o.allow.length && !o.block.length) delete all[key]; else all[key] = o
  localStorage.setItem(OVERRIDE_KEY, JSON.stringify(all))
  window.dispatchEvent(new Event('vip_flags_changed'))
}

export function setFeatureFlag(key, value) {
  const next = { ...load(), [key]: value }
  localStorage.setItem(KEY, JSON.stringify(next))
  window.dispatchEvent(new Event('vip_flags_changed'))
}

// Per-feature role access. roles = array of ALL_ROLES; empty/full → unrestricted (entry removed).
export function getFeatureRoles(key) { return loadRoles()[key] || null }
export function setFeatureRoles(key, roles) {
  const all = loadRoles()
  if (!roles || roles.length === 0 || roles.length >= ALL_ROLES.length) delete all[key]
  else all[key] = roles
  localStorage.setItem(ROLE_KEY, JSON.stringify(all))
  window.dispatchEvent(new Event('vip_flags_changed'))
}

export function getAllFlags() { return load() }
