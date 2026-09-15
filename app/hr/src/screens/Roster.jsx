// Roster.jsx — Twisted Growers HR
// Aurora midnight theme · inline styles · CSS token vars · no Tailwind
import { useState, useEffect, useCallback, useRef } from 'react'
import { useAuth } from '../lib/auth.jsx'
import { useScope } from '../lib/scope.jsx'
import { sb } from '../lib/supabase'
import { getLocationNames } from '../lib/locations.js'
import { companyName } from '../lib/config.js'


/* ─────────────────────────────────────────────────────────────────────────────
   CONSTANTS
───────────────────────────────────────────────────────────────────────────── */
const LOCATIONS = ['All', ...getLocationNames()]
const LOC_NAMES = getLocationNames()
const ROLES        = ['All Roles', 'Associate', 'Key Holder', 'Store Manager', 'HR Manager', 'COO']
const STATUS_OPTS  = ['All', 'active', 'leave', 'terminated']
const RISK_OPTS    = ['All', 'critical', 'high', 'medium', 'low']

const RISK_COLOR = {
  critical: 'var(--t-danger)',
  high:     'var(--t-warn)',
  medium:   'var(--t-accent)',
  low:      'var(--t-success)',
}
const RISK_BG = {
  critical: 'rgba(255,77,125,.15)',
  high:     'rgba(255,179,71,.15)',
  medium:   'rgba(0,229,255,.12)',
  low:      'rgba(29,233,182,.15)',
}
const RISK_LABEL = { critical: 'CRITICAL', high: 'HIGH', medium: 'MED', low: 'LOW' }

/* ─────────────────────────────────────────────────────────────────────────────
   RISK SCORING — composite score from real attendance / DA metrics
───────────────────────────────────────────────────────────────────────────── */
function computeRisk(e) {
  const score = (e.callouts_30d * 3) + e.lates_30d + (e.open_das * 5) + (e.ncns * 10)
  const level = score >= 50 ? 'critical' : score >= 25 ? 'high' : score >= 10 ? 'medium' : 'low'
  return { risk_score: score, risk_level: level }
}

// Days between an ISO date and today (null-safe).
const daysSince = d => {
  if (!d) return null
  const dt = new Date(d)
  if (isNaN(dt)) return null
  return Math.max(0, Math.floor((Date.now() - dt.getTime()) / 86400000))
}

/* ─────────────────────────────────────────────────────────────────────────────
   SHARED HELPERS
───────────────────────────────────────────────────────────────────────────── */
const ini = n => !n ? '??' : n.trim().split(/\s+/).map(x => x[0]).slice(0, 2).join('').toUpperCase()

const fmtDate = d => {
  if (!d) return '—'
  const dt = new Date(d)
  return isNaN(dt) ? d : dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function RiskBadge({ level }) {
  return (
    <span style={{
      display: 'inline-block',
      background: RISK_BG[level] || 'transparent',
      color: RISK_COLOR[level] || 'var(--t-text-muted)',
      fontSize: 10, fontWeight: 700, padding: '2px 8px',
      letterSpacing: 0.5,
    }}>
      {RISK_LABEL[level] || level?.toUpperCase()}
    </span>
  )
}

function Badge({ type, children }) {
  // type: green | amber | red | blue | purple
  const map = {
    green:  { bg: 'rgba(29,233,182,.15)',  color: 'var(--t-success)' },
    amber:  { bg: 'rgba(255,179,71,.15)',  color: 'var(--t-warn)'    },
    red:    { bg: 'rgba(255,77,125,.15)',  color: 'var(--t-danger)'  },
    blue:   { bg: 'rgba(59,130,246,.15)',  color: '#60a5fa'          },
    purple: { bg: 'rgba(139,92,246,.15)', color: '#a78bfa'           },
  }
  const s = map[type] || map.blue
  return (
    <span style={{
      display: 'inline-block',
      background: s.bg, color: s.color,
      fontSize: 10, fontWeight: 700, padding: '2px 8px', letterSpacing: 0.5,
    }}>
      {children}
    </span>
  )
}

function ProgressBar({ pct }) {
  const c = pct >= 80 ? 'var(--t-success)' : pct >= 60 ? 'var(--t-warn)' : 'var(--t-danger)'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ flex: 1, height: 5, background: 'var(--t-line)', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${pct}%`, background: c }} />
      </div>
      <span style={{ fontSize: 11, color: c, fontWeight: 700, minWidth: 32, textAlign: 'right' }}>{pct}%</span>
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────────────────
   TOAST
───────────────────────────────────────────────────────────────────────────── */
function Toast({ msg, type, onDone }) {
  useEffect(() => {
    const t = setTimeout(onDone, 3200)
    return () => clearTimeout(t)
  }, [onDone])
  const bg = type === 'error' ? 'var(--t-danger)' : type === 'warn' ? 'var(--t-warn)' : 'var(--t-success)'
  return (
    <div style={{
      position: 'fixed', bottom: 28, right: 28,
      background: bg, color: type === 'warn' ? '#000' : '#fff',
      padding: '12px 20px', fontWeight: 700, fontSize: 13,
      zIndex: 99999, boxShadow: '0 4px 24px rgba(0,0,0,.4)',
    }}>
      {msg}
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────────────────
   FORENSIC KPI PANEL
───────────────────────────────────────────────────────────────────────────── */
function KpiPanel({ emps }) {
  const active     = emps.filter(e => e.status === 'active')
  const onLeave    = emps.filter(e => e.status === 'leave')
  const terminated = emps.filter(e => e.status === 'terminated')

  // New hires this month (hire_date in current month)
  const now      = new Date()
  const newHires = emps.filter(e => {
    if (!e.hire_date) return false
    const d = new Date(e.hire_date)
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
  }).length

  const turnoverRate = emps.length > 0 ? ((terminated.length / emps.length) * 100).toFixed(1) : '0.0'

  // Risk
  const highRisk   = emps.filter(e => e.callouts_30d >= 3).length
  const critRisk   = emps.filter(e => e.ncns > 0 || e.callouts_30d >= 5).length
  const nonSigners = emps.filter(e => !e.policy_signed).length
  const nonComply  = emps.filter(e => e.training_pct < 80).length
  const openDAs    = emps.reduce((s, e) => s + (e.open_das || 0), 0)
  const dueReview  = emps.filter(e => !e.has_review || e.last_review_days > 90).length

  // Attendance
  const totalCallouts = emps.reduce((s, e) => s + (e.callouts_30d || 0), 0)
  const totalLates    = emps.reduce((s, e) => s + (e.lates_30d    || 0), 0)
  const totalNcns     = emps.reduce((s, e) => s + (e.ncns         || 0), 0)
  const avgCallouts   = emps.length > 0 ? (totalCallouts / emps.length).toFixed(1) : '0'

  // Per-location stats
  const locStats = LOC_NAMES.map(loc => {
    const locEmps = emps.filter(e => e.location === loc)
    const hc      = locEmps.length
    const hr      = locEmps.filter(e => e.callouts_30d >= 3).length
    const co      = locEmps.reduce((s, e) => s + (e.callouts_30d || 0), 0)
    const lt      = locEmps.reduce((s, e) => s + (e.lates_30d    || 0), 0)
    const tc      = hc > 0 ? Math.round(locEmps.reduce((s, e) => s + (e.training_pct || 0), 0) / hc) : 0
    return { loc, hc, hr, co, lt, tc }
  })

  const worstCalloutLoc = locStats.reduce((a, b) => (b.co > a.co ? b : a), locStats[0])
  const bestAttendLoc   = locStats.reduce((a, b) => (b.co < a.co ? b : a), locStats[0])

  const SL = { fontSize: 11, color: 'var(--t-accent)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 10, display: 'block' }
  const tile = (label, value, color = 'var(--t-text)', sub = '') => (
    <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', padding: '14px 16px', minWidth: 110, flex: 1 }}>
      <div style={{ fontSize: 24, fontWeight: 800, color, lineHeight: 1, fontFamily: 'var(--font-mono)' }}>{value}</div>
      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--t-text-muted)', marginTop: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
      {sub && <div style={{ fontSize: 10, color: 'var(--t-text-faint)', marginTop: 2 }}>{sub}</div>}
    </div>
  )

  return (
    <div style={{ marginBottom: 24, background: 'var(--t-surface-2)', border: '1px solid var(--t-line)', padding: '20px 20px 16px' }}>
      <span style={SL}>Workforce Intelligence — Forensic KPI Panel</span>

      {/* Row 1 — Workforce Overview */}
      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--t-text-faint)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Workforce Overview</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        {tile('Total Headcount', emps.length, 'var(--t-accent)')}
        {tile('Active', active.length, 'var(--t-success)')}
        {tile('On Leave', onLeave.length, 'var(--t-warn)')}
        {tile('Terminated YTD', terminated.length, 'var(--t-danger)')}
        {tile('New Hires / Month', newHires, 'var(--t-accent)')}
        {tile('Turnover Rate', `${turnoverRate}%`, terminated.length > 0 ? 'var(--t-warn)' : 'var(--t-success)')}
      </div>

      {/* Row 2 — Risk & Compliance */}
      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--t-text-faint)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Risk &amp; Compliance</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        {tile('High-Risk Emps', highRisk,   highRisk > 0  ? 'var(--t-warn)'    : 'var(--t-success)', '≥3 callouts 30d')}
        {tile('Critical Risk',  critRisk,   critRisk > 0  ? 'var(--t-danger)'  : 'var(--t-success)', 'NCNS or 5+ callouts')}
        {tile('Policy Non-Signers', nonSigners, nonSigners > 0 ? 'var(--t-warn)' : 'var(--t-success)')}
        {tile('Training <80%', nonComply,   nonComply > 0 ? 'var(--t-warn)'    : 'var(--t-success)', 'non-compliant')}
        {tile('Open DA Count', openDAs,     openDAs > 3   ? 'var(--t-danger)'  : openDAs > 0 ? 'var(--t-warn)' : 'var(--t-success)')}
        {tile('Reviews Due', dueReview,     dueReview > 0 ? 'var(--t-warn)'    : 'var(--t-success)', '>90 days overdue')}
      </div>

      {/* Row 3 — Attendance Forensics */}
      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--t-text-faint)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Attendance Forensics (30d)</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        {tile('Total Callouts', totalCallouts, totalCallouts > 10 ? 'var(--t-danger)' : 'var(--t-warn)')}
        {tile('Total Lates',    totalLates,    totalLates > 8     ? 'var(--t-warn)'   : 'var(--t-text)')}
        {tile('NCNS',           totalNcns,     totalNcns > 0      ? 'var(--t-danger)' : 'var(--t-success)')}
        {tile('Avg Callouts/Emp', avgCallouts, parseFloat(avgCallouts) > 2 ? 'var(--t-warn)' : 'var(--t-text)')}
        {tile('Worst Location', worstCalloutLoc?.loc || '—', 'var(--t-danger)', `${worstCalloutLoc?.co || 0} callouts`)}
        {tile('Best Attendance', bestAttendLoc?.loc || '—', 'var(--t-success)', `${bestAttendLoc?.co || 0} callouts`)}
      </div>

      {/* Row 4 — Per-Location Snapshot */}
      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--t-text-faint)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Per-Location Snapshot</div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ background: 'rgba(0,229,255,.04)' }}>
              {['Location', 'Headcount', 'High-Risk', 'Callouts 30d', 'Lates 30d', 'Training Compliance'].map(h => (
                <th key={h} style={{ padding: '7px 12px', color: 'var(--t-text-muted)', fontWeight: 600, fontSize: 10, textAlign: 'left', textTransform: 'uppercase', letterSpacing: 0.5, borderBottom: '1px solid var(--t-line)', whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {locStats.map(s => (
              <tr key={s.loc}>
                <td style={{ padding: '7px 12px', fontWeight: 700, color: 'var(--t-text)', borderBottom: '1px solid var(--t-line)' }}>{s.loc}</td>
                <td style={{ padding: '7px 12px', color: 'var(--t-text)', borderBottom: '1px solid var(--t-line)' }}>{s.hc}</td>
                <td style={{ padding: '7px 12px', color: s.hr > 0 ? 'var(--t-warn)' : 'var(--t-text-muted)', fontWeight: s.hr > 0 ? 700 : 400, borderBottom: '1px solid var(--t-line)' }}>{s.hr}</td>
                <td style={{ padding: '7px 12px', color: s.co > 5 ? 'var(--t-danger)' : s.co > 2 ? 'var(--t-warn)' : 'var(--t-text)', fontWeight: s.co > 2 ? 700 : 400, borderBottom: '1px solid var(--t-line)' }}>{s.co}</td>
                <td style={{ padding: '7px 12px', color: s.lt > 4 ? 'var(--t-warn)' : 'var(--t-text)', borderBottom: '1px solid var(--t-line)' }}>{s.lt}</td>
                <td style={{ padding: '7px 12px', borderBottom: '1px solid var(--t-line)', minWidth: 160 }}>
                  <ProgressBar pct={s.tc} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────────────────
   EMPLOYEE SIDE PANEL
───────────────────────────────────────────────────────────────────────────── */
function EmployeeSidePanel({ emp, isHR, onClose, onDA }) {
  if (!emp) return null

  // Real per-person detail loaded with the roster (empty arrays render honest empty states).
  const courses    = emp.training || []   // [{module, cert_status, completed_at, score}]
  const reviews    = emp.reviews  || []   // [{review_date, overall_score, notes}]
  const openDaList = (emp.das || []).filter(d => (d.status || 'active') === 'active')
  const certPct    = c => c.cert_status === 'active' ? 100 : c.cert_status === 'expired' ? 100 : 0
  const certColor  = c => c.cert_status === 'active' ? 'var(--t-success)' : c.cert_status === 'expired' ? 'var(--t-warn)' : 'var(--t-text-muted)'

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9000,
      display: 'flex', alignItems: 'stretch', justifyContent: 'flex-end',
    }}>
      {/* backdrop */}
      <div onClick={onClose} style={{ flex: 1, background: 'rgba(0,0,0,.55)' }} />
      {/* panel */}
      <div style={{
        width: 420, background: 'var(--t-surface)', borderLeft: '1px solid var(--t-line)',
        overflowY: 'auto', display: 'flex', flexDirection: 'column',
        boxShadow: '-12px 0 60px rgba(0,0,0,.5)',
      }}>
        {/* Header */}
        <div style={{ borderBottom: '1px solid var(--t-line)', padding: '16px 20px', background: 'var(--t-surface-2)', flexShrink: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <div style={{
                width: 48, height: 48, background: RISK_BG[emp.risk],
                border: `2px solid ${RISK_COLOR[emp.risk]}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontWeight: 800, fontSize: 15, color: RISK_COLOR[emp.risk],
              }}>
                {ini(emp.full_name)}
              </div>
              <div>
                <div style={{ fontWeight: 800, fontSize: 15, color: 'var(--t-text)' }}>{emp.full_name}</div>
                <div style={{ fontSize: 12, color: 'var(--t-text-muted)', marginTop: 2 }}>{emp.role} — {emp.location}</div>
                <div style={{ marginTop: 5, display: 'flex', gap: 6 }}>
                  <RiskBadge level={emp.risk} />
                  <Badge type={emp.status === 'active' ? 'green' : emp.status === 'leave' ? 'amber' : 'red'}>
                    {emp.status?.toUpperCase()}
                  </Badge>
                </div>
              </div>
            </div>
            <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--t-text-muted)', fontSize: 20, cursor: 'pointer', lineHeight: 1 }}>✕</button>
          </div>
        </div>

        {/* Body */}
        <div style={{ flex: 1, padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 18 }}>

          {/* Contact */}
          <section>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--t-accent)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Contact</div>
            {[
              ['Hire Date', fmtDate(emp.hire_date)],
              ['Email', emp.login_id],
              ['Phone', emp.phone || '—'],
              ['Wage', emp.wage ? `$${Number(emp.wage).toFixed(2)}/hr` : '—'],
            ].map(([k, v]) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid var(--t-line)', fontSize: 13 }}>
                <span style={{ color: 'var(--t-text-muted)' }}>{k}</span>
                <span style={{ color: 'var(--t-text)', fontWeight: 500 }}>{v}</span>
              </div>
            ))}
          </section>

          {/* Risk Summary */}
          <section>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--t-accent)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Risk Summary</div>
            <div style={{ background: 'var(--t-surface-2)', border: `1px solid ${RISK_COLOR[emp.risk]}30`, padding: '12px 14px' }}>
              <div style={{ fontSize: 28, fontWeight: 800, color: RISK_COLOR[emp.risk], fontFamily: 'var(--font-mono)' }}>{emp.risk_score}</div>
              <div style={{ fontSize: 11, color: 'var(--t-text-muted)', marginTop: 2 }}>Composite risk score</div>
              <div style={{ fontSize: 11, color: 'var(--t-text-faint)', marginTop: 4 }}>= callouts×3 + lates + DAs×5 + NCNS×10</div>
            </div>
          </section>

          {/* Attendance Stats */}
          <section>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--t-accent)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Attendance</div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr>
                  <th style={{ padding: '4px 8px', textAlign: 'left', color: 'var(--t-text-faint)', fontWeight: 600, fontSize: 10 }}>Metric</th>
                  <th style={{ padding: '4px 8px', textAlign: 'center', color: 'var(--t-text-faint)', fontWeight: 600, fontSize: 10 }}>30d</th>
                  <th style={{ padding: '4px 8px', textAlign: 'center', color: 'var(--t-text-faint)', fontWeight: 600, fontSize: 10 }}>7d</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { label: 'Callouts', v30: emp.callouts_30d, v7: emp.callouts_7d ?? 0 },
                  { label: 'Lates',    v30: emp.lates_30d,    v7: emp.lates_7d    ?? 0 },
                  { label: 'NCNS',     v30: emp.ncns,         v7: emp.ncns_7d     ?? 0 },
                ].map(r => (
                  <tr key={r.label}>
                    <td style={{ padding: '6px 8px', color: 'var(--t-text-muted)', borderBottom: '1px solid var(--t-line)' }}>{r.label}</td>
                    <td style={{ padding: '6px 8px', textAlign: 'center', color: r.v30 > 0 ? (r.label === 'NCNS' ? 'var(--t-danger)' : 'var(--t-warn)') : 'var(--t-text)', fontWeight: r.v30 > 0 ? 700 : 400, borderBottom: '1px solid var(--t-line)' }}>{r.v30}</td>
                    <td style={{ padding: '6px 8px', textAlign: 'center', color: 'var(--t-text)', borderBottom: '1px solid var(--t-line)' }}>{r.v7}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          {/* Training */}
          <section>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--t-accent)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Training &amp; Certifications</div>
            {courses.length === 0 ? (
              <div style={{ fontSize: 12, color: 'var(--t-text-muted)' }}>No training records on file.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {courses.map((c, i) => (
                  <div key={c.module + i}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 3 }}>
                      <span style={{ color: 'var(--t-text-muted)' }}>{c.module}</span>
                      <span style={{ color: certColor(c), fontWeight: 700, textTransform: 'uppercase' }}>
                        {c.cert_status === 'active' ? 'Certified' : c.cert_status === 'expired' ? 'Expired' : 'Incomplete'}
                      </span>
                    </div>
                    <div style={{ height: 5, background: 'var(--t-line)', position: 'relative', overflow: 'hidden' }}>
                      <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${certPct(c)}%`, background: certColor(c) }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Open DAs */}
          <section>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--t-accent)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Disciplinary Actions</div>
            {openDaList.length === 0 ? (
              <div style={{ fontSize: 12, color: 'var(--t-text-muted)' }}>No open disciplinary actions.</div>
            ) : (
              openDaList.map((d, i) => (
                <div key={d.id || i} style={{ padding: '8px 12px', background: 'rgba(255,77,125,.06)', border: '1px solid rgba(255,77,125,.25)', marginBottom: 6, fontSize: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontWeight: 700, color: 'var(--t-danger)', textTransform: 'capitalize' }}>{(d.da_type || 'Disciplinary action').replace(/_/g, ' ')}</span>
                    <span style={{ color: 'var(--t-text-muted)' }}>{fmtDate(d.da_date)}</span>
                  </div>
                  {d.description && <div style={{ color: 'var(--t-text-muted)', marginTop: 4, whiteSpace: 'pre-wrap' }}>{d.description}</div>}
                </div>
              ))
            )}
          </section>

          {/* Policy */}
          <section>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--t-accent)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Policy Acknowledgment</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 18 }}>{emp.policy_signed ? '✓' : '✗'}</span>
              <span style={{ fontSize: 13, color: emp.policy_signed ? 'var(--t-success)' : 'var(--t-danger)', fontWeight: 700 }}>
                {emp.policy_signed ? 'Policy signed' : 'Policy NOT signed'}
              </span>
            </div>
          </section>

          {/* Reviews */}
          <section>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--t-accent)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Performance Reviews</div>
            {reviews.length === 0 ? (
              <div style={{ fontSize: 12, color: 'var(--t-text-muted)' }}>No performance reviews on file.</div>
            ) : (
              reviews.map((r, i) => (
                <div key={r.id || i} style={{ padding: '8px 12px', background: 'var(--t-surface-2)', border: '1px solid var(--t-line)', marginBottom: 6, fontSize: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontWeight: 700, color: 'var(--t-text)' }}>
                      {r.overall_score != null ? `Overall ${Number(r.overall_score).toFixed(1)}/10` : (r.status || 'Review')}
                    </span>
                    <span style={{ color: 'var(--t-text-muted)' }}>{fmtDate(r.review_date)}</span>
                  </div>
                  {r.notes && <div style={{ color: 'var(--t-text-muted)', marginTop: 3 }}>{typeof r.notes === 'string' ? r.notes : ''}</div>}
                </div>
              ))
            )}
          </section>

          {/* Last Review Due */}
          <section>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
              <span style={{ color: 'var(--t-text-muted)' }}>Last review</span>
              {emp.has_review ? (
                <span style={{ color: emp.last_review_days > 90 ? 'var(--t-danger)' : 'var(--t-text)', fontWeight: emp.last_review_days > 90 ? 700 : 400 }}>
                  {emp.last_review_days} days ago {emp.last_review_days > 90 ? '— OVERDUE' : ''}
                </span>
              ) : (
                <span style={{ color: 'var(--t-text-muted)' }}>No review on record</span>
              )}
            </div>
          </section>
        </div>

        {/* Quick Actions */}
        <div style={{ borderTop: '1px solid var(--t-line)', padding: '14px 20px', background: 'var(--t-surface-2)', flexShrink: 0 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--t-text-faint)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>Quick Actions</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {[
              { label: 'Schedule', onClick: () => alert('Navigate to Schedule') },
              { label: 'Message', onClick: () => alert('Navigate to Messages') },
              { label: 'Timecards', onClick: () => alert('Navigate to TimeClock') },
            ].map(a => (
              <button key={a.label} onClick={a.onClick} style={{
                background: 'transparent', border: '1px solid var(--t-line)', color: 'var(--t-text-muted)',
                padding: '6px 12px', fontSize: 11, fontWeight: 600, cursor: 'pointer',
                transition: 'border-color .15s, color .15s',
              }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--t-accent)'; e.currentTarget.style.color = 'var(--t-accent)' }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--t-line)'; e.currentTarget.style.color = 'var(--t-text-muted)' }}
              >
                {a.label}
              </button>
            ))}
            {isHR && (
              <button onClick={() => { onClose(); onDA(emp) }} style={{
                background: 'rgba(255,77,125,.1)', border: '1px solid var(--t-danger)', color: 'var(--t-danger)',
                padding: '6px 12px', fontSize: 11, fontWeight: 700, cursor: 'pointer',
              }}>
                Issue DA
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────────────────
   TAB 1 — ROSTER
───────────────────────────────────────────────────────────────────────────── */
function RosterTab({ emps, isHR, onDA }) {
  const [locFilter,    setLocFilter]    = useState('All')
  const [roleFilter,   setRoleFilter]   = useState('All Roles')
  const [statusFilter, setStatusFilter] = useState('All')
  const [riskFilter,   setRiskFilter]   = useState('All')
  const [search,       setSearch]       = useState('')
  const [view,         setView]         = useState('table') // 'grid' | 'table'
  const [selectedEmp,  setSelectedEmp]  = useState(null)

  const filtered = emps
    .filter(e => locFilter    === 'All'       || e.location === locFilter)
    .filter(e => roleFilter   === 'All Roles' || e.role     === roleFilter)
    .filter(e => statusFilter === 'All'       || e.status   === statusFilter)
    .filter(e => riskFilter   === 'All'       || e.risk     === riskFilter)
    .filter(e => {
      if (!search.trim()) return true
      const q = search.toLowerCase()
      return e.full_name.toLowerCase().includes(q)
          || (e.login_id || '').toLowerCase().includes(q)
          || (e.role     || '').toLowerCase().includes(q)
          || (e.location || '').toLowerCase().includes(q)
    })
    .sort((a, b) => b.risk_score - a.risk_score)

  const selInput = {
    background: 'var(--t-surface-2)', border: '1px solid var(--t-line)',
    color: 'var(--t-text)', padding: '7px 10px', fontSize: 12,
  }

  return (
    <>
      {/* Filter strip */}
      <div style={{ marginBottom: 14 }}>
        {/* Location pills */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--t-line)', marginBottom: 12 }}>
          {LOCATIONS.map(loc => (
            <button key={loc} onClick={() => setLocFilter(loc)} style={{
              background: 'transparent', border: 'none',
              padding: '8px 16px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
              color: locFilter === loc ? 'var(--t-accent)' : 'var(--t-text-muted)',
              borderBottom: locFilter === loc ? '2px solid var(--t-accent)' : '2px solid transparent',
              marginBottom: -1,
            }}>
              {loc}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <select value={roleFilter}   onChange={e => setRoleFilter(e.target.value)}   style={selInput}>
            {ROLES.map(r => <option key={r}>{r}</option>)}
          </select>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={selInput}>
            {STATUS_OPTS.map(s => <option key={s} value={s}>{s === 'All' ? 'All Status' : s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
          </select>
          <select value={riskFilter}   onChange={e => setRiskFilter(e.target.value)}   style={selInput}>
            {RISK_OPTS.map(r => <option key={r} value={r}>{r === 'All' ? 'All Risk' : r.charAt(0).toUpperCase() + r.slice(1) + ' Risk'}</option>)}
          </select>
          <input
            type="text" placeholder="Search name, email, role…"
            value={search} onChange={e => setSearch(e.target.value)}
            style={{ ...selInput, minWidth: 220 }}
          />
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 0, border: '1px solid var(--t-line)' }}>
            {['table', 'grid'].map((v, i) => (
              <button key={v} onClick={() => setView(v)} style={{
                background: view === v ? 'rgba(0,229,255,.1)' : 'transparent',
                border: 'none',
                borderLeft: i > 0 ? '1px solid var(--t-line)' : 'none',
                color: view === v ? 'var(--t-accent)' : 'var(--t-text-muted)',
                padding: '6px 14px', fontSize: 11, fontWeight: 700, cursor: 'pointer',
              }}>
                {v === 'table' ? '≡ Table' : '⊞ Grid'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Count */}
      <div style={{ fontSize: 11, color: 'var(--t-text-muted)', marginBottom: 12 }}>
        Showing {filtered.length} of {emps.length} employees
      </div>

      {/* GRID VIEW */}
      {view === 'grid' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
          {filtered.length === 0 && (
            <div style={{ gridColumn: '1/-1', padding: 40, textAlign: 'center', color: 'var(--t-text-muted)', fontSize: 13 }}>
              No employees match filters.
            </div>
          )}
          {filtered.map(emp => (
            <div key={emp.id}
              onClick={() => setSelectedEmp(emp)}
              style={{
                background: 'var(--t-surface)', border: '1px solid var(--t-line)',
                padding: 16, cursor: 'pointer',
                transition: 'border-color .15s, box-shadow .15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = RISK_COLOR[emp.risk]; e.currentTarget.style.boxShadow = '0 4px 20px rgba(0,0,0,.3)' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--t-line)'; e.currentTarget.style.boxShadow = 'none' }}
            >
              {/* Card header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <div style={{
                    width: 36, height: 36,
                    background: RISK_BG[emp.risk], border: `2px solid ${RISK_COLOR[emp.risk]}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontWeight: 800, fontSize: 12, color: RISK_COLOR[emp.risk],
                  }}>
                    {ini(emp.full_name)}
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--t-text)' }}>{emp.full_name}</div>
                    <div style={{ fontSize: 10, color: 'var(--t-text-muted)', marginTop: 2 }}>{emp.role}</div>
                  </div>
                </div>
                <RiskBadge level={emp.risk} />
              </div>

              {/* Location + status */}
              <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
                <Badge type="blue">{emp.location}</Badge>
                <Badge type={emp.status === 'active' ? 'green' : emp.status === 'leave' ? 'amber' : 'red'}>
                  {emp.status}
                </Badge>
              </div>

              {/* Stats row */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, marginBottom: 10 }}>
                {[
                  { label: 'Callouts', value: emp.callouts_30d, danger: emp.callouts_30d >= 3 },
                  { label: 'Lates',    value: emp.lates_30d,    danger: emp.lates_30d >= 3 },
                  { label: 'NCNS',     value: emp.ncns,          danger: emp.ncns > 0 },
                  { label: 'Open DAs', value: emp.open_das,      danger: emp.open_das > 0 },
                ].map(s => (
                  <div key={s.label} style={{ textAlign: 'center', background: 'var(--t-surface-2)', padding: '5px 4px' }}>
                    <div style={{ fontSize: 16, fontWeight: 800, color: s.danger ? 'var(--t-danger)' : 'var(--t-text)', fontFamily: 'var(--font-mono)' }}>{s.value}</div>
                    <div style={{ fontSize: 9, color: 'var(--t-text-faint)', marginTop: 1, textTransform: 'uppercase' }}>{s.label}</div>
                  </div>
                ))}
              </div>

              {/* Hours + training + policy */}
              <div style={{ fontSize: 11, display: 'flex', justifyContent: 'space-between', color: 'var(--t-text-muted)', marginBottom: 8 }}>
                <span>{emp.hours_week}h/wk</span>
                <span style={{ color: emp.policy_signed ? 'var(--t-success)' : 'var(--t-danger)', fontWeight: 700 }}>
                  Policy {emp.policy_signed ? '✓' : '✗'}
                </span>
              </div>

              {/* Training bar */}
              <div style={{ fontSize: 10, color: 'var(--t-text-faint)', marginBottom: 4 }}>Training {emp.training_pct}%</div>
              <ProgressBar pct={emp.training_pct} />
            </div>
          ))}
        </div>
      )}

      {/* TABLE VIEW */}
      {view === 'table' && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>
                {['Employee', 'Location', 'Role', 'Risk', 'Callouts 30d', 'Lates', 'NCNS', 'Hrs/Wk', 'Training', 'DAs', 'Last Review', 'Actions'].map(h => (
                  <th key={h} style={{ padding: '9px 12px', textAlign: 'left', color: 'var(--t-text-muted)', fontWeight: 600, fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5, whiteSpace: 'nowrap', borderBottom: '1px solid var(--t-line)', background: 'rgba(0,229,255,.02)' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={12} style={{ padding: '40px 12px', textAlign: 'center', color: 'var(--t-text-muted)' }}>
                    No employees match current filters.
                  </td>
                </tr>
              )}
              {filtered.map(emp => {
                const td = { padding: '9px 12px', borderBottom: '1px solid var(--t-line)', verticalAlign: 'middle' }
                return (
                  <tr key={emp.id}
                    style={{ cursor: 'pointer' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,.02)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <td style={td} onClick={() => setSelectedEmp(emp)}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{
                          width: 32, height: 32, flexShrink: 0,
                          background: RISK_BG[emp.risk], border: `2px solid ${RISK_COLOR[emp.risk]}`,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontWeight: 800, fontSize: 10, color: RISK_COLOR[emp.risk],
                        }}>
                          {ini(emp.full_name)}
                        </div>
                        <div>
                          <div style={{ fontWeight: 600, color: 'var(--t-text)' }}>{emp.full_name}</div>
                          <div style={{ fontSize: 10, color: 'var(--t-text-muted)', marginTop: 1 }}>{emp.login_id}</div>
                        </div>
                      </div>
                    </td>
                    <td style={{ ...td, color: 'var(--t-text-muted)', whiteSpace: 'nowrap' }} onClick={() => setSelectedEmp(emp)}>{emp.location}</td>
                    <td style={{ ...td, color: 'var(--t-text-muted)', whiteSpace: 'nowrap' }} onClick={() => setSelectedEmp(emp)}>{emp.role}</td>
                    <td style={td} onClick={() => setSelectedEmp(emp)}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <RiskBadge level={emp.risk} />
                        <span style={{ fontSize: 11, color: 'var(--t-text-muted)', fontFamily: 'var(--font-mono)' }}>{emp.risk_score}</span>
                      </div>
                    </td>
                    <td style={{ ...td, textAlign: 'center', color: emp.callouts_30d >= 5 ? 'var(--t-danger)' : emp.callouts_30d >= 3 ? 'var(--t-warn)' : 'var(--t-text)', fontWeight: emp.callouts_30d >= 3 ? 700 : 400 }}>{emp.callouts_30d}</td>
                    <td style={{ ...td, textAlign: 'center', color: emp.lates_30d >= 4 ? 'var(--t-warn)' : 'var(--t-text)', fontWeight: emp.lates_30d >= 4 ? 700 : 400 }}>{emp.lates_30d}</td>
                    <td style={{ ...td, textAlign: 'center', color: emp.ncns > 0 ? 'var(--t-danger)' : 'var(--t-text)', fontWeight: emp.ncns > 0 ? 800 : 400 }}>{emp.ncns}</td>
                    <td style={{ ...td, textAlign: 'center', color: 'var(--t-text)' }}>{emp.hours_week}</td>
                    <td style={{ ...td, minWidth: 110 }}>
                      <ProgressBar pct={emp.training_pct} />
                    </td>
                    <td style={{ ...td, textAlign: 'center', color: emp.open_das >= 2 ? 'var(--t-danger)' : emp.open_das === 1 ? 'var(--t-warn)' : 'var(--t-text)', fontWeight: emp.open_das > 0 ? 700 : 400 }}>{emp.open_das}</td>
                    <td style={{ ...td, whiteSpace: 'nowrap', color: emp.last_review_days > 90 ? 'var(--t-danger)' : 'var(--t-text-muted)', fontWeight: emp.last_review_days > 90 ? 700 : 400 }}>
                      {emp.last_review_days}d ago
                    </td>
                    <td style={td}>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <SmBtn onClick={() => setSelectedEmp(emp)}>View</SmBtn>
                        {isHR && <SmBtn danger onClick={ev => { ev.stopPropagation(); onDA(emp) }}>DA</SmBtn>}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Side Panel */}
      {selectedEmp && (
        <EmployeeSidePanel
          emp={selectedEmp}
          isHR={isHR}
          onClose={() => setSelectedEmp(null)}
          onDA={emp => { setSelectedEmp(null); onDA(emp) }}
        />
      )}
    </>
  )
}

function SmBtn({ children, danger, onClick }) {
  const [hov, setHov] = useState(false)
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        background: 'transparent',
        border: `1px solid ${hov ? (danger ? 'var(--t-danger)' : 'var(--t-accent)') : 'var(--t-line)'}`,
        color: hov ? (danger ? 'var(--t-danger)' : 'var(--t-accent)') : 'var(--t-text-muted)',
        padding: '4px 10px', fontSize: 11, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
      }}
    >
      {children}
    </button>
  )
}

/* ─────────────────────────────────────────────────────────────────────────────
   TAB 2 — ADD EMPLOYEE
───────────────────────────────────────────────────────────────────────────── */
function AddEmployeeTab({ onSaved }) {
  const { session } = useAuth()
  const [form, setForm] = useState({
    first_name: '', last_name: '', login_id: '', role_id: '',
    node_id: '', start_date: '', wage: '', full_time: true,
    emergency_contact: '',
  })
  const [roles, setRoles] = useState([])
  const [nodes, setNodes] = useState([])
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState(null)
  const [success, setSuccess] = useState(false)
  const [tempPin, setTempPin] = useState(null)

  // Load real roles + locations so the dropdowns carry resolvable ids (no fabricated lists).
  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const [r, n] = await Promise.all([sb.rpc('hr_list_roles'), sb.rpc('hr_list_nodes')])
        if (!alive) return
        if (r.data) { setRoles(r.data); setForm(f => ({ ...f, role_id: f.role_id || (r.data.find(x => x.name === 'Associate') || r.data[0] || {}).id || '' })) }
        if (n.data) { setForm(f => ({ ...f, node_id: f.node_id || (n.data[0] || {}).id || '' })); setNodes(n.data) }
      } catch (e) { if (alive) setErr('Could not load roles and locations — check your connection.') }
    })()
    return () => { alive = false }
  }, [])

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleSubmit = async e => {
    e.preventDefault()
    if (!form.first_name.trim() || !form.last_name.trim() || !form.login_id.trim()) {
      setErr('First name, last name, and email are required.')
      return
    }
    if (!form.role_id || !form.node_id) {
      setErr('Select a role and a location.')
      return
    }
    setSaving(true)
    setErr(null)
    // Generated starter PIN, shown once so the manager can hand it to the new hire.
    const pin = String(Math.floor(100000 + Math.random() * 900000))
    try {
      const { data, error } = await sb.rpc('hr_create_employee', {
        p_node_id:    form.node_id,
        p_full_name:  `${form.first_name.trim()} ${form.last_name.trim()}`,
        p_login_id:   form.login_id.trim(),
        p_pin:        pin,
        p_role_id:    form.role_id,
        p_created_by: session?.person?.id || null,
      })
      if (error) throw error
      if (data && data.ok === false) { setErr(data.error || 'Could not create employee.'); setSaving(false); return }
      setTempPin(pin)
      setSuccess(true)
      onSaved && onSaved()
    } catch (ex) {
      setErr(ex?.message || 'Could not create employee — the record was not saved.')
    } finally {
      setSaving(false)
    }
  }

  const lbl = { fontSize: 11, color: 'var(--t-text-muted)', marginBottom: 4, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, display: 'block' }
  const inp = { background: 'var(--t-surface-2)', border: '1px solid var(--t-line)', color: 'var(--t-text)', padding: '9px 12px', fontSize: 13, width: '100%', boxSizing: 'border-box' }

  const full_name = `${form.first_name} ${form.last_name}`.trim()

  if (success) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '60px 20px', gap: 16 }}>
        <div style={{ fontSize: 40 }}>✓</div>
        <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--t-success)' }}>Employee Created</div>
        <div style={{ fontSize: 13, color: 'var(--t-text-muted)' }}>{full_name || 'New employee'} has been added to the roster.</div>
        {tempPin && (
          <div style={{ fontSize: 13, color: 'var(--t-text)', border: '1px solid var(--t-line)', background: 'var(--t-surface-2)', padding: '10px 14px' }}>
            Starter PIN: <b style={{ letterSpacing: 2 }}>{tempPin}</b> — give this to the employee for their first sign-in.
          </div>
        )}
        <button onClick={() => { setSuccess(false); setTempPin(null); setForm(f => ({ first_name:'', last_name:'', login_id:'', role_id:(roles.find(x=>x.name==='Associate')||roles[0]||{}).id||'', node_id:(nodes[0]||{}).id||'', start_date:'', wage:'', full_time:true, emergency_contact:'' })) }}
          style={{ background: 'var(--t-accent)', color: '#000', border: 'none', padding: '10px 22px', fontWeight: 700, cursor: 'pointer', fontSize: 13 }}>
          Add Another
        </button>
      </div>
    )
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 24 }}>
      {/* Form */}
      <div>
        {err && (
          <div style={{ background: 'rgba(255,77,125,.08)', border: '1px solid var(--t-danger)', color: 'var(--t-danger)', padding: '10px 14px', marginBottom: 16, fontSize: 13 }}>
            {err}
          </div>
        )}
        <form onSubmit={handleSubmit}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div>
              <label style={lbl}>First Name *</label>
              <input type="text" value={form.first_name} onChange={e => set('first_name', e.target.value)} style={inp} />
            </div>
            <div>
              <label style={lbl}>Last Name *</label>
              <input type="text" value={form.last_name} onChange={e => set('last_name', e.target.value)} style={inp} />
            </div>
            <div style={{ gridColumn: '1/-1' }}>
              <label style={lbl}>Email (Login ID) *</label>
              <input type="email" value={form.login_id} onChange={e => set('login_id', e.target.value)} style={inp} />
            </div>
            <div>
              <label style={lbl}>Role</label>
              <select value={form.role_id} onChange={e => set('role_id', e.target.value)} style={inp}>
                {roles.length === 0 && <option value="">Loading…</option>}
                {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Location</label>
              <select value={form.node_id} onChange={e => set('node_id', e.target.value)} style={inp}>
                {nodes.length === 0 && <option value="">Loading…</option>}
                {nodes.map(n => <option key={n.id} value={n.id}>{n.name}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Start Date</label>
              <input type="date" value={form.start_date} onChange={e => set('start_date', e.target.value)} style={inp} />
            </div>
            <div>
              <label style={lbl}>Hourly Wage ($)</label>
              <input type="number" min="0" step="0.01" value={form.wage} onChange={e => set('wage', e.target.value)} style={inp} />
            </div>
            <div style={{ gridColumn: '1/-1', display: 'flex', alignItems: 'center', gap: 10 }}>
              <input type="checkbox" id="ft" checked={form.full_time} onChange={e => set('full_time', e.target.checked)}
                style={{ width: 18, height: 18, accentColor: 'var(--t-accent)', flexShrink: 0 }} />
              <label htmlFor="ft" style={{ fontSize: 13, color: 'var(--t-text)', cursor: 'pointer' }}>Full-time employee</label>
            </div>
            <div style={{ gridColumn: '1/-1' }}>
              <label style={lbl}>Emergency Contact</label>
              <input type="text" placeholder="Name — Relationship — Phone" value={form.emergency_contact} onChange={e => set('emergency_contact', e.target.value)} style={inp} />
            </div>
          </div>
          <div style={{ marginTop: 20, display: 'flex', gap: 10 }}>
            <button type="submit" disabled={saving} style={{
              background: 'var(--t-accent)', color: '#000', border: 'none', padding: '10px 24px',
              fontWeight: 700, fontSize: 13, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1,
            }}>
              {saving ? 'Creating…' : 'Create Employee'}
            </button>
          </div>
        </form>
      </div>

      {/* ID Card Preview */}
      <div>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--t-text-muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>ID Card Preview</div>
        <div style={{
          background: 'linear-gradient(135deg, var(--t-surface) 0%, var(--t-surface-2) 100%)',
          border: '1px solid var(--t-accent)', padding: 20,
          boxShadow: '0 0 20px rgba(0,229,255,.1)',
        }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--t-accent)', letterSpacing: 2, marginBottom: 12, textTransform: 'uppercase' }}>
            {companyName()} — Employee ID
          </div>
          <div style={{ display: 'flex', gap: 14, alignItems: 'center', marginBottom: 14 }}>
            <div style={{ width: 54, height: 54, background: 'var(--t-accent-soft)', border: '2px solid var(--t-accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 20, color: 'var(--t-accent)' }}>
              {full_name ? ini(full_name) : '??'}
            </div>
            <div>
              <div style={{ fontWeight: 800, fontSize: 15, color: 'var(--t-text)' }}>{full_name || 'Employee Name'}</div>
              <div style={{ fontSize: 12, color: 'var(--t-text-muted)', marginTop: 3 }}>{form.role}</div>
              <div style={{ fontSize: 12, color: 'var(--t-accent)', marginTop: 2 }}>{form.location}</div>
            </div>
          </div>
          <div style={{ borderTop: '1px solid var(--t-line)', paddingTop: 12, fontSize: 11, color: 'var(--t-text-muted)' }}>
            <div>{form.login_id || 'email@vip.com'}</div>
            <div style={{ marginTop: 3 }}>Start: {form.start_date ? fmtDate(form.start_date) : 'TBD'}</div>
            <div style={{ marginTop: 3 }}>Type: {form.full_time ? 'Full-Time' : 'Part-Time'}</div>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────────────────
   TAB 3 — RISK MATRIX
───────────────────────────────────────────────────────────────────────────── */
const CALLOUT_ROWS  = ['0', '1', '2', '3', '4+']
const DA_COLS       = ['None', 'Verbal', 'Written', 'Final', 'PIP/Term']

function RiskMatrixTab({ emps, onFilter }) {
  const [selectedCell, setSelectedCell] = useState(null)
  const [cellEmps, setCellEmps]         = useState([])

  const getCalloutBucket = c => c >= 4 ? '4+' : String(c)
  const getDaBucket      = d => {
    if (d === 0) return 'None'
    if (d === 1) return 'Verbal'
    if (d === 2) return 'Written'
    if (d === 3) return 'Final'
    return 'PIP/Term'
  }

  const matrix = {}
  CALLOUT_ROWS.forEach(r => {
    matrix[r] = {}
    DA_COLS.forEach(c => { matrix[r][c] = [] })
  })
  emps.forEach(e => {
    const r = getCalloutBucket(e.callouts_30d)
    const c = getDaBucket(e.open_das)
    if (matrix[r] && matrix[r][c] !== undefined) matrix[r][c].push(e)
  })

  const cellRisk = (row, col) => {
    const ri = CALLOUT_ROWS.indexOf(row)
    const ci = DA_COLS.indexOf(col)
    const score = ri + ci
    if (score >= 6) return 'critical'
    if (score >= 4) return 'high'
    if (score >= 2) return 'medium'
    return 'low'
  }

  const handleCellClick = (row, col) => {
    const empsInCell = matrix[row][col]
    setSelectedCell({ row, col })
    setCellEmps(empsInCell)
  }

  // Sorted by risk score
  const sortedByRisk = [...emps].sort((a, b) => b.risk_score - a.risk_score)

  const exportRiskCSV = () => {
    const headers = ['Name', 'Role', 'Location', 'Risk Level', 'Risk Score', 'Callouts 30d', 'Lates 30d', 'NCNS', 'Open DAs', 'Training %']
    const rows = sortedByRisk.map(e => [
      e.full_name, e.role, e.location, e.risk, e.risk_score,
      e.callouts_30d, e.lates_30d, e.ncns, e.open_das, e.training_pct,
    ])
    const csv  = [headers, ...rows].map(r => r.map(v => `"${v}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url; a.download = `risk-report-${new Date().toISOString().slice(0,10)}.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 20 }}>
        {/* Matrix */}
        <div>
          <div style={{ fontSize: 11, color: 'var(--t-text-muted)', marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>Y-axis: Callout frequency (30d) · X-axis: Disciplinary severity — click a cell to drill down</span>
            <button onClick={exportRiskCSV} style={{ background: 'transparent', border: '1px solid var(--t-line)', color: 'var(--t-text-muted)', padding: '5px 12px', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
              Export Risk CSV
            </button>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%' }}>
              <thead>
                <tr>
                  <th style={{ padding: '8px 12px', width: 60, color: 'var(--t-text-faint)', fontSize: 10, textAlign: 'center', borderBottom: '1px solid var(--t-line)' }}>Callouts ↕</th>
                  {DA_COLS.map(col => (
                    <th key={col} style={{ padding: '8px 14px', color: 'var(--t-text-muted)', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, textAlign: 'center', borderBottom: '1px solid var(--t-line)', whiteSpace: 'nowrap' }}>
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...CALLOUT_ROWS].reverse().map(row => (
                  <tr key={row}>
                    <td style={{ padding: '8px 12px', color: 'var(--t-text-muted)', fontSize: 12, fontWeight: 700, textAlign: 'center', borderBottom: '1px solid var(--t-line)', background: 'var(--t-surface-2)' }}>{row}</td>
                    {DA_COLS.map(col => {
                      const count   = matrix[row][col].length
                      const risk    = cellRisk(row, col)
                      const isSelec = selectedCell?.row === row && selectedCell?.col === col
                      return (
                        <td key={col}
                          onClick={() => handleCellClick(row, col)}
                          style={{
                            padding: '14px 10px', textAlign: 'center', cursor: 'pointer',
                            background: isSelec ? 'rgba(0,229,255,.12)' : count > 0 ? RISK_BG[risk] : 'var(--t-surface)',
                            border: isSelec ? `2px solid ${RISK_COLOR[risk]}` : '1px solid var(--t-line)',
                            transition: 'background .12s',
                          }}
                        >
                          <div style={{ fontSize: 20, fontWeight: 800, color: count > 0 ? RISK_COLOR[risk] : 'var(--t-text-faint)', fontFamily: 'var(--font-mono)' }}>{count}</div>
                          {count > 0 && (
                            <div style={{ fontSize: 9, color: RISK_COLOR[risk], marginTop: 2, textTransform: 'uppercase', fontWeight: 700 }}>{RISK_LABEL[risk]}</div>
                          )}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Cell drill-down / legend */}
        <div>
          {selectedCell ? (
            <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', padding: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--t-accent)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>
                Callouts: {selectedCell.row} · DA: {selectedCell.col}
              </div>
              {cellEmps.length === 0 ? (
                <div style={{ fontSize: 13, color: 'var(--t-text-muted)' }}>No employees in this cell.</div>
              ) : (
                cellEmps.map(e => (
                  <div key={e.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: '1px solid var(--t-line)', fontSize: 13 }}>
                    <div>
                      <div style={{ fontWeight: 600, color: 'var(--t-text)' }}>{e.full_name}</div>
                      <div style={{ fontSize: 10, color: 'var(--t-text-muted)' }}>{e.location} · {e.role}</div>
                    </div>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 800, color: RISK_COLOR[e.risk] }}>{e.risk_score}</span>
                  </div>
                ))
              )}
            </div>
          ) : (
            <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', padding: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--t-text-muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>Risk Legend</div>
              {Object.entries(RISK_COLOR).map(([level, color]) => (
                <div key={level} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', fontSize: 12 }}>
                  <div style={{ width: 12, height: 12, background: color, flexShrink: 0 }} />
                  <span style={{ color, fontWeight: 700, textTransform: 'uppercase', width: 60 }}>{level}</span>
                  <span style={{ color: 'var(--t-text-muted)' }}>
                    {level === 'critical' ? '≥50 pts' : level === 'high' ? '25–49 pts' : level === 'medium' ? '10–24 pts' : '<10 pts'}
                  </span>
                </div>
              ))}
              <div style={{ marginTop: 12, fontSize: 11, color: 'var(--t-text-faint)', lineHeight: 1.5 }}>
                Score = callouts×3 + lates + DAs×5 + NCNS×10
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Full sorted risk table */}
      <div style={{ marginTop: 24 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--t-accent)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>All Employees — Sorted by Composite Risk Score</div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>
                {['#', 'Employee', 'Location', 'Risk', 'Score', 'Callouts', 'Lates', 'NCNS', 'Open DAs', 'Training', 'Policy'].map(h => (
                  <th key={h} style={{ padding: '8px 10px', textAlign: 'left', color: 'var(--t-text-muted)', fontWeight: 600, fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5, borderBottom: '1px solid var(--t-line)', whiteSpace: 'nowrap', background: 'rgba(0,229,255,.02)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedByRisk.map((emp, i) => {
                const td = { padding: '8px 10px', borderBottom: '1px solid var(--t-line)', verticalAlign: 'middle' }
                return (
                  <tr key={emp.id}>
                    <td style={{ ...td, color: 'var(--t-text-faint)', fontSize: 11, fontFamily: 'var(--font-mono)' }}>{i + 1}</td>
                    <td style={td}>
                      <div style={{ fontWeight: 600, color: 'var(--t-text)' }}>{emp.full_name}</div>
                      <div style={{ fontSize: 10, color: 'var(--t-text-muted)' }}>{emp.role}</div>
                    </td>
                    <td style={{ ...td, color: 'var(--t-text-muted)', fontSize: 12 }}>{emp.location}</td>
                    <td style={td}><RiskBadge level={emp.risk} /></td>
                    <td style={{ ...td, fontFamily: 'var(--font-mono)', fontWeight: 800, fontSize: 16, color: RISK_COLOR[emp.risk] }}>{emp.risk_score}</td>
                    <td style={{ ...td, textAlign: 'center', color: emp.callouts_30d >= 3 ? 'var(--t-danger)' : 'var(--t-text)' }}>{emp.callouts_30d}</td>
                    <td style={{ ...td, textAlign: 'center', color: emp.lates_30d >= 4 ? 'var(--t-warn)' : 'var(--t-text)' }}>{emp.lates_30d}</td>
                    <td style={{ ...td, textAlign: 'center', color: emp.ncns > 0 ? 'var(--t-danger)' : 'var(--t-text)', fontWeight: emp.ncns > 0 ? 800 : 400 }}>{emp.ncns}</td>
                    <td style={{ ...td, textAlign: 'center', color: emp.open_das > 0 ? 'var(--t-warn)' : 'var(--t-text)' }}>{emp.open_das}</td>
                    <td style={{ ...td, minWidth: 100 }}><ProgressBar pct={emp.training_pct} /></td>
                    <td style={{ ...td, textAlign: 'center', color: emp.policy_signed ? 'var(--t-success)' : 'var(--t-danger)', fontWeight: 700 }}>
                      {emp.policy_signed ? '✓' : '✗'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────────────────
   TAB 4 — TURNOVER
───────────────────────────────────────────────────────────────────────────── */
function TurnoverTab({ nodeIds }) {
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(true)
  const [err,     setErr]     = useState(null)

  useEffect(() => {
    let alive = true
    ;(async () => {
      setLoading(true); setErr(null)
      const ids = nodeIds || []
      if (ids.length === 0) { if (alive) { setData(null); setLoading(false) } return }
      try {
        const { data: d, error } = await sb.rpc('get_turnover_report', { p_node_ids: ids })
        if (error) throw error
        if (alive) setData(d || null)
      } catch (e) {
        if (alive) setErr(e?.message || 'Could not load turnover data.')
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => { alive = false }
  }, [nodeIds])

  const col = { padding: '8px 12px', borderBottom: '1px solid var(--t-line)', fontSize: 13 }
  const hdr = { padding: '8px 12px', textAlign: 'left', color: 'var(--t-text-muted)', fontWeight: 600, fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5, borderBottom: '1px solid var(--t-line)', whiteSpace: 'nowrap', background: 'rgba(0,229,255,.02)' }

  if (loading) return (
    <div style={{ padding: 40, textAlign: 'center', color: 'var(--t-text-muted)', fontSize: 13 }}>Loading turnover…</div>
  )
  if (err) return (
    <div style={{ background: 'rgba(255,77,125,.08)', border: '1px solid var(--t-danger)', color: 'var(--t-danger)', padding: '10px 14px', fontSize: 13 }}>{err}</div>
  )

  const monthly   = data?.monthly     || []
  const byLoc     = data?.by_location || []
  const byRole    = data?.by_role     || []
  const reasons   = data?.reasons     || []
  const retention = data?.retention   || []

  // Running headcount across the monthly series, anchored to current active headcount.
  const currentHeadcount = byLoc.reduce((s, r) => s + (r.headcount || 0), 0)
  let ahead = currentHeadcount
  const monthRows = monthly.map(m => {
    const row = { ...m, headcount: ahead }
    ahead -= (m.net || 0)
    return row
  })

  const totalTerms = monthly.reduce((s, m) => s + (m.terms || 0), 0)
  if (totalTerms === 0 && currentHeadcount === 0) {
    return (
      <div style={{ background: 'var(--t-surface-2)', border: '1px solid var(--t-line)', color: 'var(--t-text-muted)', padding: '16px', fontSize: 13 }}>
        No workforce or separation history for the selected location(s) yet.
      </div>
    )
  }

  const retLabel = d => `${d}-Day Retention`

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* Monthly trend */}
      <div>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--t-accent)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>Monthly Trend — Last 12 Months</div>
        {monthRows.length === 0 ? (
          <div style={{ fontSize: 12, color: 'var(--t-text-muted)' }}>No monthly hire/separation activity in range.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {['Month', 'New Hires', 'Terminations', 'Net', 'Running Headcount'].map(h => <th key={h} style={hdr}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {monthRows.map(r => (
                  <tr key={r.month}>
                    <td style={{ ...col, fontWeight: 600, color: 'var(--t-text)' }}>{r.month}</td>
                    <td style={{ ...col, color: 'var(--t-success)', fontWeight: r.hires > 0 ? 700 : 400 }}>{r.hires > 0 ? `+${r.hires}` : r.hires}</td>
                    <td style={{ ...col, color: r.terms > 0 ? 'var(--t-danger)' : 'var(--t-text-muted)', fontWeight: r.terms > 0 ? 700 : 400 }}>{r.terms > 0 ? `-${r.terms}` : '0'}</td>
                    <td style={{ ...col, color: r.net > 0 ? 'var(--t-success)' : r.net < 0 ? 'var(--t-danger)' : 'var(--t-text-muted)', fontWeight: 700 }}>
                      {r.net > 0 ? `+${r.net}` : r.net}
                    </td>
                    <td style={{ ...col, fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--t-text)' }}>{r.headcount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        {/* By Location */}
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--t-accent)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>By Location</div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['Location', 'Headcount', 'Hires', 'Terms', 'Turnover Rate'].map(h => <th key={h} style={hdr}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {byLoc.length === 0 && (
                <tr><td colSpan={5} style={{ ...col, color: 'var(--t-text-muted)' }}>No locations in scope.</td></tr>
              )}
              {byLoc.map(r => {
                const rate = r.headcount > 0 ? ((r.terms / r.headcount) * 100).toFixed(0) : '0'
                return (
                  <tr key={r.loc}>
                    <td style={{ ...col, fontWeight: 600, color: 'var(--t-text)' }}>{r.loc}</td>
                    <td style={col}>{r.headcount}</td>
                    <td style={{ ...col, color: 'var(--t-success)' }}>{r.hires}</td>
                    <td style={{ ...col, color: r.terms > 0 ? 'var(--t-danger)' : 'var(--t-text-muted)' }}>{r.terms}</td>
                    <td style={{ ...col }}>
                      <span style={{ color: parseInt(rate) > 20 ? 'var(--t-danger)' : parseInt(rate) > 10 ? 'var(--t-warn)' : 'var(--t-success)', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
                        {rate}%
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* By Role */}
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--t-accent)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>By Role</div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['Role', 'Headcount', 'Terms', 'Turnover Rate'].map(h => <th key={h} style={hdr}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {byRole.length === 0 && (
                <tr><td colSpan={4} style={{ ...col, color: 'var(--t-text-muted)' }}>No active roles in scope.</td></tr>
              )}
              {byRole.map(r => {
                const rate = r.count > 0 ? ((r.terms / r.count) * 100).toFixed(0) : '0'
                return (
                  <tr key={r.role}>
                    <td style={{ ...col, fontWeight: 600, color: 'var(--t-text)' }}>{r.role}</td>
                    <td style={col}>{r.count}</td>
                    <td style={{ ...col, color: r.terms > 0 ? 'var(--t-danger)' : 'var(--t-text-muted)' }}>{r.terms}</td>
                    <td style={col}>
                      <span style={{ color: parseInt(rate) > 20 ? 'var(--t-danger)' : parseInt(rate) > 10 ? 'var(--t-warn)' : 'var(--t-success)', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
                        {rate}%
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Reasons + Retention */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        {/* Termination Reasons */}
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--t-accent)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>Termination Reasons</div>
          {reasons.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--t-text-muted)' }}>No separations recorded in range.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {reasons.map(r => (
                <div key={r.reason}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                    <span style={{ color: 'var(--t-text)' }}>{r.reason}</span>
                    <span style={{ color: 'var(--t-text-muted)' }}>{r.count} ({r.pct}%)</span>
                  </div>
                  <div style={{ height: 6, background: 'var(--t-line)', position: 'relative', overflow: 'hidden' }}>
                    <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${r.pct}%`, background: 'var(--t-warn)' }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Retention rates */}
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--t-accent)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>Retention Rates</div>
          {retention.length === 0 || (retention[0] && retention[0].n === 0) ? (
            <div style={{ fontSize: 12, color: 'var(--t-text-muted)' }}>Not enough hire history to compute retention.</div>
          ) : (
            retention.map(r => (
              <div key={r.days} style={{ marginBottom: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                  <span style={{ color: 'var(--t-text)', fontWeight: 600 }}>{retLabel(r.days)}</span>
                  <span style={{ color: (r.rate ?? 0) >= 85 ? 'var(--t-success)' : 'var(--t-warn)', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>{r.rate ?? 0}%</span>
                </div>
                <ProgressBar pct={r.rate ?? 0} />
                <div style={{ fontSize: 10, color: 'var(--t-text-faint)', marginTop: 3 }}>Across {r.n} hire{r.n === 1 ? '' : 's'} on record</div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────────────────
   DA DRAWER
───────────────────────────────────────────────────────────────────────────── */
const DA_TYPE_CODE = {
  'Verbal Warning':        'verbal',
  'Written Warning':       'written',
  'Final Written Warning': 'final',
  'Suspension':            'suspension',
  'Termination':           'termination',
}

function DADrawer({ employee, onClose, onSaved }) {
  const { session } = useAuth()
  const [form, setForm] = useState({
    type: 'Verbal Warning',
    date: new Date().toISOString().slice(0, 10),
    description: employee
      ? `Employee: ${employee.full_name}\nCallouts (30d): ${employee.callouts_30d} | Lates (30d): ${employee.lates_30d} | NCNS: ${employee.ncns} | Open DAs: ${employee.open_das}\n\nDetails:\n`
      : '',
    witness: '',
    action_required: '',
  })
  const [saving, setSaving] = useState(false)
  const [err,    setErr]    = useState(null)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleSave = async () => {
    if (!form.description.trim()) { setErr('Description is required.'); return }
    if (!employee?.node_id) { setErr('This employee has no resolvable location on file — cannot file a DA.'); return }
    setSaving(true); setErr(null)
    try {
      const { error } = await sb.rpc('create_disciplinary_action', {
        p_person_id:         employee.id,
        p_node_id:           employee.node_id,
        p_type:              DA_TYPE_CODE[form.type] || 'written',
        p_description:       form.description,
        p_corrective_action: form.action_required || null,
        p_issued_by_id:      session?.person?.id || null,
        p_follow_up_date:    null,
      })
      if (error) throw error
      onSaved('Disciplinary action recorded.')
    } catch (ex) {
      setErr(ex?.message || 'Not saved — the disciplinary action could not be recorded.')
      setSaving(false)
    }
  }

  if (!employee) return null
  const inp = { background: 'var(--t-surface-2)', border: '1px solid var(--t-line)', color: 'var(--t-text)', padding: '8px 12px', fontSize: 13, width: '100%', boxSizing: 'border-box' }
  const lbl = { fontSize: 10, color: 'var(--t-text-muted)', marginBottom: 4, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, display: 'block' }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-danger)', padding: 28, minWidth: 460, maxWidth: 580, width: '90%', maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <span style={{ fontWeight: 800, fontSize: 15, color: 'var(--t-danger)', textTransform: 'uppercase', letterSpacing: 1 }}>Issue Disciplinary Action</span>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--t-text-muted)', fontSize: 20, cursor: 'pointer' }}>✕</button>
        </div>
        <div style={{ fontSize: 12, color: 'var(--t-text-muted)', marginBottom: 18 }}>
          {employee.full_name} · {employee.role} · {employee.location} · Risk {employee.risk_score} · {employee.open_das} prior DA(s)
        </div>
        {err && <div style={{ background: 'rgba(255,77,125,.08)', border: '1px solid var(--t-danger)', color: 'var(--t-danger)', padding: '8px 12px', marginBottom: 14, fontSize: 13 }}>{err}</div>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div>
              <label style={lbl}>DA Type</label>
              <select value={form.type} onChange={e => set('type', e.target.value)} style={inp}>
                {['Verbal Warning', 'Written Warning', 'Final Written Warning', 'Suspension', 'Termination'].map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Date</label>
              <input type="date" value={form.date} onChange={e => set('date', e.target.value)} style={inp} />
            </div>
          </div>
          <div>
            <label style={lbl}>Description *</label>
            <textarea rows={5} value={form.description} onChange={e => set('description', e.target.value)} style={{ ...inp, resize: 'vertical' }} />
          </div>
          <div>
            <label style={lbl}>Witness / Second Manager</label>
            <input type="text" placeholder="Optional" value={form.witness} onChange={e => set('witness', e.target.value)} style={inp} />
          </div>
          <div>
            <label style={lbl}>Action Required from Employee</label>
            <input type="text" placeholder="e.g. No further tardiness for 30 days" value={form.action_required} onChange={e => set('action_required', e.target.value)} style={inp} />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 20, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ background: 'transparent', border: '1px solid var(--t-line)', color: 'var(--t-text)', padding: '8px 16px', fontSize: 13, cursor: 'pointer' }}>Cancel</button>
          <button onClick={handleSave} disabled={saving} style={{ background: 'var(--t-danger)', color: '#fff', border: 'none', padding: '8px 18px', fontSize: 13, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1 }}>
            {saving ? 'Saving…' : 'Issue DA'}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────────────────────
   MAIN COMPONENT
───────────────────────────────────────────────────────────────────────────── */
export default function Roster() {
  const { session }                       = useAuth()
  const { locationIds, locations, scope } = useScope()
  const role_name = session?.person?.role_name ?? ''
  const isHR      = /ceo|hr|manager|coo|admin|owner/i.test(role_name)

  const [emps,      setEmps]      = useState([])
  const [loading,   setLoading]   = useState(true)
  const [loadError, setLoadError] = useState(null)
  const [tab,       setTab]       = useState('roster') // roster | add | risk | turnover
  const [daEmp,     setDaEmp]     = useState(null)
  const [toast,     setToast]     = useState(null)

  const showToast = useCallback((msg, type = 'success') => setToast({ msg, type }), [])

  /* FETCH — every metric below comes from a live RPC. Identity + hire from
     get_roster; attendance from get_attendance_overview; open DAs from
     get_disciplinary_actions; reviews from get_performance_reviews; training
     completion from get_training_overview; policy signing from
     policies_team_compliance. No values are invented — a person with no events
     honestly shows zeros/empty. */
  const fetchRoster = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    const ids = locationIds || []
    if (ids.length === 0) { setEmps([]); setLoading(false); return }

    const within = (dateStr, days) => {
      const n = daysSince(dateStr)
      return n != null && n <= days
    }

    try {
      const [rosterRes, attRes, daRes, revRes, trainRes, polRes] = await Promise.all([
        sb.rpc('get_roster',                 { p_node_ids: ids }),
        sb.rpc('get_attendance_overview',    { p_node_ids: ids }),
        sb.rpc('get_disciplinary_actions',   { p_node_ids: ids }),
        sb.rpc('get_performance_reviews',    { p_node_ids: ids }),
        sb.rpc('get_training_overview',      { p_node_ids: ids }),
        sb.rpc('policies_team_compliance',   { p_node_ids: ids }),
      ])
      if (rosterRes.error) throw rosterRes.error

      const roster = rosterRes.data || []
      const attRows = attRes.data || []            // [{person_id,node_id,location,incidents:[{date,type,expired}]}]
      const daRows  = daRes.data || []             // [{person_id,da_type,da_date,description,status}]
      const revRows = revRes.data || []            // [{person_id,review_date,overall_score,notes,...}]
      const trnRows = trainRes.data || []          // [{person_id,module,category,completed_at,cert_status}]
      const pol     = polRes.data || {}            // {employees,policies,acks}
      const reqPolicies = Array.isArray(pol.policies) ? pol.policies : []
      const ackRows     = Array.isArray(pol.acks) ? pol.acks : []

      // ── Index the enrichment rows by person for O(1) lookup ──
      const attByPerson = new Map()
      attRows.forEach(a => attByPerson.set(a.person_id, a))
      const daByPerson = new Map()
      daRows.forEach(d => {
        if (!daByPerson.has(d.person_id)) daByPerson.set(d.person_id, [])
        daByPerson.get(d.person_id).push(d)
      })
      const revByPerson = new Map()
      revRows.forEach(r => {
        if (!revByPerson.has(r.person_id)) revByPerson.set(r.person_id, [])
        revByPerson.get(r.person_id).push(r)
      })
      const trnByPerson = new Map()
      trnRows.forEach(t => {
        if (!trnByPerson.has(t.person_id)) trnByPerson.set(t.person_id, [])
        trnByPerson.get(t.person_id).push(t)
      })
      const ackCount = new Map()
      ackRows.forEach(a => ackCount.set(a.person_id, (ackCount.get(a.person_id) || 0) + 1))

      const mapped = roster.map(r => {
        const pid       = r.id ?? r.person_id
        const att       = attByPerson.get(pid)
        const incidents = (att && Array.isArray(att.incidents)) ? att.incidents : []
        const das       = (daByPerson.get(pid) || [])
        const openDas   = das.filter(d => (d.status || 'active') === 'active')
        const reviews   = (revByPerson.get(pid) || [])
          .slice()
          .sort((a, b) => new Date(b.review_date || 0) - new Date(a.review_date || 0))
        const training  = trnByPerson.get(pid) || []

        const count = (type, days) => incidents.filter(i => i.type === type && !i.expired && within(i.date, days)).length
        const callouts_30d = count('callout', 30)
        const lates_30d    = count('tardy',   30)
        const ncns         = count('ncns',    30)
        const callouts_7d  = count('callout', 7)
        const lates_7d     = count('tardy',   7)
        const ncns_7d      = count('ncns',    7)

        // Training completion = share of this person's modules with a valid (active) cert.
        const trainingDone = training.filter(t => t.cert_status === 'active').length
        const training_pct = training.length > 0 ? Math.round((trainingDone / training.length) * 100) : 0

        // Policy signed = acknowledged every required published policy (trivially true
        // when there are no required policies to sign).
        const policy_signed = reqPolicies.length === 0
          ? true
          : (ackCount.get(pid) || 0) >= reqPolicies.length

        const lastReview = reviews[0]?.review_date || null
        const last_review_days = daysSince(lastReview)

        const raw = {
          id:            pid,
          person_id:     pid,
          node_id:       att?.node_id ?? null,
          full_name:     r.full_name,
          login_id:      r.login_id,
          role:          r.role_name ?? r.role ?? '—',
          location:      r.node_name ?? att?.location ?? '—',
          callouts_30d,  lates_30d, ncns,
          callouts_7d,   lates_7d,  ncns_7d,
          open_das:      openDas.length,
          das,           // full DA history for the side panel
          reviews,       // real performance reviews
          training,      // real training modules
          hours_week:    0,                 // no scheduled-hours source joined here
          status:        r.is_active === false ? 'inactive' : 'active',
          hire_date:     r.effective_from ?? r.hire_date ?? null,
          wage:          r.wage ?? null,    // wage_history is owner-read only; honestly unknown here
          training_pct,
          training_total: training.length,
          policy_signed,
          last_review_days: last_review_days ?? 0,
          has_review:    !!lastReview,
          phone:         r.phone ?? null,
        }
        const { risk_score, risk_level } = computeRisk(raw)
        return { ...raw, risk_score, risk: risk_level }
      })
      setEmps(mapped)
    } catch (e) {
      setEmps([])
      setLoadError(e?.message || 'Could not load the roster from the server.')
    } finally {
      setLoading(false)
    }
  }, [locationIds])

  useEffect(() => { fetchRoster() }, [fetchRoster])

  const exportCSV = () => {
    const headers = ['Name', 'Role', 'Location', 'Status', 'Risk', 'Score', 'Callouts 30d', 'Lates 30d', 'NCNS', 'Hours/Wk', 'Training %', 'Open DAs', 'Policy Signed']
    const rows = emps.map(e => [
      e.full_name, e.role, e.location, e.status, e.risk, e.risk_score,
      e.callouts_30d, e.lates_30d, e.ncns, e.hours_week, e.training_pct, e.open_das, e.policy_signed ? 'Yes' : 'No',
    ])
    const csv  = [headers, ...rows].map(r => r.map(v => `"${String(v)}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url; a.download = `roster-${new Date().toISOString().slice(0, 10)}.csv`; a.click()
    URL.revokeObjectURL(url)
    showToast('CSV exported.')
  }

  if (loading) return (
    <div style={{ padding: 60, textAlign: 'center', color: 'var(--t-text-muted)', fontSize: 14 }}>
      <div style={{ display: 'inline-block', width: 20, height: 20, border: '2px solid var(--t-line)', borderTopColor: 'var(--t-accent)', borderRadius: '50%', animation: 'spin .6s linear infinite', marginBottom: 12 }} />
      <div>Loading roster…</div>
    </div>
  )

  const TABS = [
    { id: 'roster',   label: 'Roster'       },
    { id: 'add',      label: 'Add Employee' },
    { id: 'risk',     label: 'Risk Matrix'  },
    { id: 'turnover', label: 'Turnover'     },
  ]

  return (
    <div style={{ padding: '24px 28px', minHeight: '100%', color: 'var(--t-text)' }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg);}}`}</style>

      {/* Page Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: 1, color: 'var(--t-text)' }}>STAFF ROSTER</div>
          <div style={{ fontSize: 12, color: 'var(--t-text-muted)', marginTop: 3 }}>
            {scope === 'ALL' || !scope
              ? 'All Locations'
              : (locations || []).find(l => l.id === scope)?.name || scope} — workforce intelligence &amp; HR operations
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={exportCSV} style={{ background: 'transparent', border: '1px solid var(--t-line)', color: 'var(--t-text-muted)', padding: '8px 14px', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
            Export CSV
          </button>
          <button onClick={fetchRoster} style={{ background: 'transparent', border: '1px solid var(--t-line)', color: 'var(--t-text-muted)', padding: '8px 14px', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
            Refresh
          </button>
          {isHR && (
            <button onClick={() => setTab('add')} style={{ background: 'var(--t-accent)', color: '#000', border: 'none', padding: '8px 16px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
              + Add Employee
            </button>
          )}
        </div>
      </div>

      {/* Honest load-failure banner (no silent mock fallback) */}
      {loadError && (
        <div style={{ background: 'rgba(255,77,125,.08)', border: '1px solid var(--t-danger)', color: 'var(--t-danger)', padding: '10px 14px', marginBottom: 16, fontSize: 13 }}>
          {loadError} <button onClick={fetchRoster} style={{ marginLeft: 8, background: 'transparent', border: '1px solid var(--t-danger)', color: 'var(--t-danger)', padding: '3px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>Retry</button>
        </div>
      )}
      {!loadError && emps.length === 0 && (
        <div style={{ background: 'var(--t-surface-2)', border: '1px solid var(--t-line)', color: 'var(--t-text-muted)', padding: '14px 16px', marginBottom: 16, fontSize: 13 }}>
          No employees are assigned to the selected location(s) yet.
        </div>
      )}

      {/* Forensic KPI Panel — always visible */}
      <KpiPanel emps={emps} />

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--t-line)', marginBottom: 20 }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            background: 'transparent', border: 'none',
            padding: '10px 18px', fontSize: 12, fontWeight: 700, cursor: 'pointer',
            letterSpacing: 0.5, textTransform: 'uppercase',
            color: tab === t.id ? 'var(--t-accent)' : 'var(--t-text-muted)',
            borderBottom: tab === t.id ? '2px solid var(--t-accent)' : '2px solid transparent',
            marginBottom: -1,
          }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {tab === 'roster' && (
        <RosterTab
          emps={emps}
          isHR={isHR}
          onDA={emp => setDaEmp(emp)}
        />
      )}
      {tab === 'add' && (
        <AddEmployeeTab
          onSaved={() => {
            showToast('Employee created.')
            fetchRoster()
          }}
        />
      )}
      {tab === 'risk' && (
        <RiskMatrixTab
          emps={emps}
          onFilter={() => setTab('roster')}
        />
      )}
      {tab === 'turnover' && <TurnoverTab nodeIds={locationIds} />}

      {/* DA Drawer */}
      {daEmp && (
        <DADrawer
          employee={daEmp}
          onClose={() => setDaEmp(null)}
          onSaved={msg => {
            setDaEmp(null)
            showToast(msg)
            fetchRoster()
          }}
        />
      )}

      {/* Toast */}
      {toast && <Toast msg={toast.msg} type={toast.type} onDone={() => setToast(null)} />}
    </div>
  )
}
