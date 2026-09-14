import { useState, useEffect } from 'react'

export const CONFIG_DEFAULTS = {
  company_name:             'Twisted Growers',
  company_short:            'TG',
  industry:                 'Cannabis cultivation, manufacturing & retail',
  logo_text:                'TG',
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

const KEY = 'vip_config'

function load() {
  try { const s = localStorage.getItem(KEY); return s ? { ...CONFIG_DEFAULTS, ...JSON.parse(s) } : { ...CONFIG_DEFAULTS } }
  catch { return { ...CONFIG_DEFAULTS } }
}

export function useConfig() {
  const [config, setConfig] = useState(load)
  useEffect(() => {
    const h = () => setConfig(load())
    window.addEventListener('vip_config_changed', h)
    return () => window.removeEventListener('vip_config_changed', h)
  }, [])
  return config
}

export function saveConfig(updates) {
  const next = { ...load(), ...updates }
  localStorage.setItem(KEY, JSON.stringify(next))
  window.dispatchEvent(new Event('vip_config_changed'))
}

export function getConfig() { return load() }
