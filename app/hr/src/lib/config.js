import { useState, useEffect } from 'react'
import { sb } from './supabase'

// WHITE-LABEL (owner, 15 Sep 2026): nothing about the company is written here. The company's
// name comes from its org node, its settings from rows (hr.tenant_config.settings via
// tg_settings_get / tg_settings_save). localStorage is only a cache so the first paint is not
// blank; the rows win the moment they arrive, and every save goes to the rows first.
export const CONFIG_DEFAULTS = {
  company_name:             '',
  company_short:            '',
  industry:                 '',
  logo_text:                '',
  currency:                 '$',
  min_wage:                 15.00,
  paid_leave_accrual_hours: 40,
  labor_cost_target_pct:    30,
  labor_cost_warn_pct:      38,
  turnover_cost_per_emp:    4000,
  schedule_publish_hours:   72,
  i9_warning_days:          '60,30,7',
  fmla_threshold_hours:     1250,
  handbook_version:         '2026',
  bg_check_provider:        '',
  exit_interview_required:  true,
  fiscal_year_start:        'January',
  daily_digest_hour:        8,
  points_tardy:                  0.5,
  points_callout:                1.0,
  points_ncns:                   2.0,
  points_verbal_threshold:       4,
  points_written_threshold:      6,
  points_final_threshold:        8,
  points_suspension_threshold:   10,
  points_termination_threshold:  12,
  points_expiry_months:          6,
  probation_days:                90,
  suspension_max_days:           5,
  investigation_sla_days:        14,
  rehire_waiting_period_days:    90,
  progressive_steps:             'Verbal Warning,Written Warning,Final Written Warning,Suspension,Termination',
  // ── TIME & PAYROLL ────────────────────────────────────────
  ot_threshold_weekly:  40,
  ot_multiplier:        1.5,
  break_paid_min:       15,
  break_unpaid_min:     30,
  auto_clockout_hours:  10,
  punch_rounding_min:   5,
  pay_period_type:      'biweekly',
}

const KEY = 'tg_hr_config_cache'

function derive(c) {
  const name = c.company_name || ''
  const initials = name.split(/\s+/).filter(Boolean).map(w => w[0]).join('').slice(0, 3).toUpperCase()
  return { ...c, company_short: c.company_short || initials, logo_text: c.logo_text || initials }
}
function load() {
  try { const s = localStorage.getItem(KEY); return derive(s ? { ...CONFIG_DEFAULTS, ...JSON.parse(s) } : { ...CONFIG_DEFAULTS }) }
  catch { return derive({ ...CONFIG_DEFAULTS }) }
}
function cache(next) {
  try { localStorage.setItem(KEY, JSON.stringify(next)) } catch { /* a blocked store only loses the cache */ }
  window.dispatchEvent(new Event('tg_hr_config_changed'))
}

let pulled = false
export async function pullConfig() {
  const { data, error } = await sb.rpc('tg_settings_get')
  if (error || !data || typeof data !== 'object') return load()
  const next = { ...CONFIG_DEFAULTS, ...data }
  pulled = true
  cache(next)
  return derive(next)
}

export function useConfig() {
  const [config, setConfig] = useState(load)
  useEffect(() => {
    const h = () => setConfig(load())
    window.addEventListener('tg_hr_config_changed', h)
    if (!pulled) pullConfig().then(c => setConfig(c)).catch(() => {})
    return () => window.removeEventListener('tg_hr_config_changed', h)
  }, [])
  return config
}

// Saves go to the rows first; the cache follows. A refused save (not an admin / HR role) is thrown
// to the caller in the database's words — nothing is kept locally that the rows did not accept.
export async function saveConfig(updates) {
  const { data, error } = await sb.rpc('tg_settings_save', { p: updates })
  if (error) throw new Error(error.message || 'the settings could not be saved')
  const next = { ...CONFIG_DEFAULTS, ...(data && typeof data === 'object' ? data : updates) }
  cache(next)
  return derive(next)
}

export function getConfig() { return load() }

// The company's name from the rows (cached) — the one call every screen makes instead of writing a name.
export function companyName() { return load().company_name || 'the company' }

// A regex that strips the company's name from the front of a location label ("<Company> Lakeville" -> "Lakeville").
export function companyPrefix() { return new RegExp('^' + companyName().replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*', 'i') }
