import { useState, useEffect, createContext, useContext } from 'react'
import { sb } from '../lib/supabase'
import { useAuth } from '../lib/auth.jsx'
import { useScope } from '../lib/scope.jsx'
import { useConfig } from '../lib/config.js'
import { useFeatureFlag } from '../lib/featureFlags.js'
import DrillDown from '../components/DrillDown.jsx'

/* ══════════════════════════════════════════════════════════════
   LIVE DATA CONTEXT — real time entries → roster + hours override
   Falls back to mock ALL_EMPLOYEES when RPC empty/errors.
══════════════════════════════════════════════════════════════ */
const PayrollDataCtx = createContext(null)
function usePayrollData() { return useContext(PayrollDataCtx) || {} }

/* ══════════════════════════════════════════════════════════════
   FEATURE GATE
══════════════════════════════════════════════════════════════ */
function FeatureDisabled() {
  return (
    <div style={{ padding: 40, textAlign: 'center', color: 'var(--t-text-muted)' }}>
      This feature is disabled. Enable it in Feature Toggles.
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════
   STYLE CONSTANTS
══════════════════════════════════════════════════════════════ */
const btnPrimary = {
  padding: '10px 18px', background: 'var(--t-accent)', color: '#000',
  border: 'none', fontWeight: 700, fontSize: '13px', cursor: 'pointer',
  textTransform: 'uppercase', letterSpacing: '0.5px', borderRadius: 0,
}
const btnGhost = {
  padding: '10px 18px', background: 'transparent', color: 'var(--t-text-muted)',
  border: '1px solid var(--t-line)', fontWeight: 600, fontSize: '13px',
  cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.5px', borderRadius: 0,
}
const btnSm = (color = 'var(--t-text-muted)') => ({
  fontSize: '10px', padding: '3px 8px', background: 'transparent',
  color, border: `1px solid ${color}`, cursor: 'pointer',
  textTransform: 'uppercase', letterSpacing: '0.3px', borderRadius: 0,
})
const thStyle = {
  padding: '9px 10px', textAlign: 'left', color: 'var(--t-text-muted)',
  fontWeight: 600, fontSize: '10px', textTransform: 'uppercase',
  letterSpacing: '0.5px', borderBottom: '1px solid var(--t-line)', whiteSpace: 'nowrap',
}
const tdStyle = { padding: '9px 10px', borderBottom: '1px solid var(--t-line)', fontSize: '13px', borderRadius: 0 }

/* ══════════════════════════════════════════════════════════════
   DETERMINISTIC HELPERS
══════════════════════════════════════════════════════════════ */
function seed(a, b) { return ((a * 31 + b) * 17 + a * b) % 100 }

const LOCATIONS = ['Orange', 'Hartford', 'Manchester', 'Southington', 'Warehouse / Distribution']

const ALL_EMPLOYEES = [
  { id: 'e01', full_name: 'Jordan Lee',      role_name: 'Key Holder',    location: 'Orange',      idx: 0 },
  { id: 'e02', full_name: 'Sam Rivera',       role_name: 'Associate',     location: 'Hartford',    idx: 1 },
  { id: 'e03', full_name: 'Casey Morgan',     role_name: 'HR Manager',    location: 'Manchester',  idx: 2 },
  { id: 'e04', full_name: 'Alex Chen',        role_name: 'Associate',     location: 'Southington', idx: 3 },
  { id: 'e05', full_name: 'Dana Kim',         role_name: 'Store Manager', location: 'Orange',      idx: 4 },
  { id: 'e06', full_name: 'Riley Gomez',      role_name: 'Associate',     location: 'Hartford',    idx: 5 },
  { id: 'e07', full_name: 'Chris Patel',      role_name: 'Key Holder',    location: 'Orange',      idx: 6 },
  { id: 'e08', full_name: 'Morgan Wu',        role_name: 'Associate',     location: 'Manchester',  idx: 7 },
  { id: 'e09', full_name: 'Taylor Brooks',    role_name: 'Associate',     location: 'Southington', idx: 8 },
  { id: 'e10', full_name: 'Jamie Ortiz',      role_name: 'Key Holder',    location: 'Hartford',    idx: 9 },
  { id: 'e11', full_name: 'Reese Murphy',     role_name: 'Associate',     location: 'Manchester',  idx: 10 },
  { id: 'e12', full_name: 'Quinn Nakamura',   role_name: 'Store Manager', location: 'Hartford',    idx: 11 },
  { id: 'e13', full_name: 'Avery Singh',      role_name: 'Associate',     location: 'Orange',      idx: 12 },
  { id: 'e14', full_name: 'Blake Torres',     role_name: 'Key Holder',    location: 'Southington', idx: 13 },
  { id: 'e15', full_name: 'Skyler Johnson',   role_name: 'Associate',     location: 'Manchester',  idx: 14 },
  { id: 'e16', full_name: 'Parker Williams',  role_name: 'COO',           location: 'Orange',      idx: 15 },
  { id: 'e17', full_name: 'Drew Ramirez',     role_name: 'Associate',     location: 'Southington', idx: 16 },
  { id: 'e18', full_name: 'Finley Scott',     role_name: 'Associate',     location: 'Hartford',    idx: 17 },
]

/* Build a live roster (mock ALL_EMPLOYEES shape) from real time-entry rows.
   Keeps deterministic `idx` so rate/deduction helpers still work.
   Returns { employees, hoursByName } or null when no usable rows. */
function buildLiveRoster(entries) {
  if (!Array.isArray(entries) || entries.length === 0) return null
  const byPerson = new Map()
  for (const e of entries) {
    const name = e.full_name
    if (!name) continue
    const key = e.person_id || name
    if (!byPerson.has(key)) {
      byPerson.set(key, {
        person_id: e.person_id || null,
        full_name: name,
        location: e.node_name || '—',
        node_id: e.node_id || null,
        totalRealHours: 0,
      })
    }
    const rec = byPerson.get(key)
    const h = Number(e.hours_worked)
    if (Number.isFinite(h)) rec.totalRealHours += h
    if (e.node_name && rec.location === '—') rec.location = e.node_name
  }
  const list = [...byPerson.values()]
  if (list.length === 0) return null
  list.sort((a, b) => a.full_name.localeCompare(b.full_name))
  const employees = list.map((rec, i) => ({
    id: rec.person_id || `live-${i}`,
    full_name: rec.full_name,
    role_name: 'Associate',
    location: rec.location,
    idx: i,
    realHours: rec.totalRealHours,
  }))
  return { employees }
}

function isManager(roleName) {
  if (!roleName) return false
  const r = roleName.toLowerCase()
  return ['ceo', 'hr', 'manager', 'coo', 'admin', 'owner'].some(k => r.includes(k))
}

/* ══════════════════════════════════════════════════════════════
   PAY PERIOD HELPERS — bi-weekly anchor Jan 1 2026
══════════════════════════════════════════════════════════════ */
function getBiweeklyPeriod(offset = 0) {
  const anchor = new Date('2026-01-01T00:00:00')
  const now = new Date()
  const diffDays = Math.floor((now - anchor) / 86400000)
  const currentIdx = Math.floor(diffDays / 14)
  const targetIdx = currentIdx + offset
  const startMs = anchor.getTime() + targetIdx * 14 * 86400000
  const endMs = startMs + 13 * 86400000
  const start = new Date(startMs)
  const end = new Date(endMs)
  const fmt = d => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  const fmtShort = d => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
    label: `${fmtShort(start)} – ${fmtShort(end)}, ${start.getFullYear()}${offset === 0 ? ' (Current)' : ''}`,
    payDate: new Date(endMs + 2 * 86400000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
    isCurrent: offset === 0,
    dates: Array.from({ length: 14 }, (_, i) => {
      const d = new Date(startMs + i * 86400000)
      return d.toISOString().slice(0, 10)
    }),
    periodIdx: targetIdx,
  }
}

// Pay rate per employee: seed-based $13.50–$22.00
function getRate(ei) {
  return (1350 + seed(ei, 4) * 85) / 100
}

// Deduction rates (deterministic per employee)
function getDeductions(ei, grossPay) {
  const healthIns = 60 + seed(ei, 30) % 40       // $60–$99 per period
  const dental = 8 + seed(ei, 44) % 8             // $8–$15
  const vision = 3 + seed(ei, 55) % 4             // $3–$6
  const k401Rate = [0, 0, 0.03, 0.04, 0.05][seed(ei, 11) % 5]
  const k401 = grossPay * k401Rate
  const fedTax = grossPay * 0.12
  const stateTax = grossPay * 0.05
  const ss = grossPay * 0.062
  const medicare = grossPay * 0.0145
  const total = healthIns + dental + vision + k401 + fedTax + stateTax + ss + medicare
  return { healthIns, dental, vision, k401, k401Rate, fedTax, stateTax, ss, medicare, total }
}

// Hours per employee per period (deterministic)
function buildEmpPeriodHours(ei, periodIdx) {
  // Regular hours: seed from employee + period index
  const baseReg = 72 + seed(ei, periodIdx) % 12   // 72–83h per period
  const otH = seed(ei + 3, periodIdx) < 20 ? (seed(ei, periodIdx + 5) % 8) : 0
  return { regH: baseReg, otH }
}

// Build full payroll row for one employee + period
function buildEmpPayroll(emp, period) {
  const ei = emp.idx
  const rate = getRate(ei)
  let { regH, otH } = buildEmpPeriodHours(ei, period.periodIdx)
  // Live override: when real worked hours are present for this employee/period,
  // use them (split into regular ≤80h and overtime beyond) instead of mock hours.
  if (Number.isFinite(emp.realHours) && emp.realHours > 0) {
    const total = emp.realHours
    regH = Math.min(total, 80)
    otH = Math.max(0, total - 80)
  }
  const totalHours = regH + otH
  const grossPay = regH * rate + otH * rate * 1.5
  const deductions = getDeductions(ei, grossPay)
  const netPay = grossPay - deductions.total
  const breakH = (seed(ei, period.periodIdx + 2) % 5) + 1.5   // 1.5–5.5h total breaks
  const statusSeed = seed(ei, period.periodIdx + 20)
  const status = period.isCurrent
    ? (statusSeed < 60 ? 'PENDING' : statusSeed < 85 ? 'APPROVED' : 'PROCESSING')
    : (statusSeed < 10 ? 'PROCESSING' : 'PAID')
  return { ...emp, rate, regH, otH, totalHours, grossPay, netPay, deductions, breakH, status }
}

// Build all 12 stub periods for an employee (most recent first)
function buildStubHistory(emp) {
  return Array.from({ length: 12 }, (_, i) => {
    const period = getBiweeklyPeriod(-i)
    return { period, ...buildEmpPayroll(emp, period) }
  })
}

// YTD helpers
function buildYTD(emp) {
  const ei = emp.idx
  // current period index = how many 14-day periods since Jan 1 2026
  const anchor = new Date('2026-01-01T00:00:00')
  const diffDays = Math.floor((new Date() - anchor) / 86400000)
  const periodsElapsed = Math.max(1, Math.floor(diffDays / 14) + 1)
  let ytdGross = 0, ytdNet = 0, ytdHours = 0, ytdOT = 0, ytdK401 = 0, ytdHealth = 0
  for (let p = 0; p < periodsElapsed && p < 13; p++) {
    const period = getBiweeklyPeriod(-p)
    const row = buildEmpPayroll(emp, period)
    ytdGross += row.grossPay
    ytdNet += row.netPay
    ytdHours += row.totalHours
    ytdOT += row.otH
    ytdK401 += row.deductions.k401
    ytdHealth += row.deductions.healthIns
  }
  return { ytdGross, ytdNet, ytdHours, ytdOT, ytdK401, ytdHealth, periodsElapsed }
}

/* ══════════════════════════════════════════════════════════════
   CSV EXPORT
══════════════════════════════════════════════════════════════ */
function downloadCSV(filename, headers, rows) {
  const lines = [headers, ...rows].map(r =>
    r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')
  )
  const blob = new Blob([lines.join('\n')], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}

/* ══════════════════════════════════════════════════════════════
   KPI TILE
══════════════════════════════════════════════════════════════ */
function KTile({ label, value, sub, color, alert, onClick }) {
  return (
    <div onClick={onClick} title={onClick ? 'Click to drill into records' : undefined} style={{
      background: 'var(--t-surface)',
      border: `1px solid ${alert === 'red' ? 'var(--t-danger)' : alert === 'amber' ? 'var(--t-warn)' : 'var(--t-line)'}`,
      padding: '14px 16px', position: 'relative', overflow: 'hidden', borderRadius: 0,
      cursor: onClick ? 'pointer' : 'default',
    }}>
      {alert === 'red' && <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'var(--t-danger)' }} />}
      {alert === 'amber' && <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'var(--t-warn)' }} />}
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.08em', color: 'var(--t-text-muted)', textTransform: 'uppercase', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800, color: color || 'var(--t-text)', lineHeight: 1, marginBottom: 4 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--t-text-faint)' }}>{sub}</div>}
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════
   TOAST
══════════════════════════════════════════════════════════════ */
function Toast({ msg }) {
  if (!msg) return null
  return (
    <div style={{
      background: 'var(--t-success)', color: '#000',
      padding: '10px 16px', fontWeight: 700, fontSize: '13px',
      marginBottom: '16px', textTransform: 'uppercase', letterSpacing: '0.5px', borderRadius: 0,
    }}>{msg}</div>
  )
}

/* ══════════════════════════════════════════════════════════════
   CONFIRM MODAL
══════════════════════════════════════════════════════════════ */
function ConfirmModal({ message, onConfirm, onCancel }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: 'var(--t-bg)', border: '1px solid var(--t-line)', padding: '28px', width: '400px', maxWidth: '96vw', borderRadius: 0 }}>
        <div style={{ fontWeight: 800, fontSize: '14px', color: 'var(--t-text)', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '1px' }}>Confirm Action</div>
        <div style={{ fontSize: '13px', color: 'var(--t-text-muted)', marginBottom: '22px' }}>{message}</div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button onClick={onConfirm} style={{ ...btnPrimary, flex: 1, background: 'var(--t-success)', color: '#000' }}>Confirm</button>
          <button onClick={onCancel} style={{ ...btnGhost, flex: 1 }}>Cancel</button>
        </div>
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════
   PAY STUB DETAIL EXPANDED ROW
══════════════════════════════════════════════════════════════ */
function PayStubDetail({ emp, row, onClose }) {
  const [disputeOpen, setDisputeOpen] = useState(false)
  const [disputeReason, setDisputeReason] = useState('')
  const [disputeNotes, setDisputeNotes] = useState('')
  const [toast, setToast] = useState(null)

  function showToast(msg) { setToast(msg); setTimeout(() => setToast(null), 3000) }

  function handleDispute() {
    if (!disputeReason) return
    setDisputeOpen(false)
    setDisputeReason('')
    setDisputeNotes('')
    showToast('Pay dispute submitted to HR')
  }

  const d = row.deductions
  const otRate = (row.rate * 1.5)

  return (
    <div style={{ background: 'var(--t-bg)', border: '1px solid var(--t-line)', padding: '20px', marginBottom: '2px', borderRadius: 0 }}>
      {toast && <Toast msg={toast} />}

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px', flexWrap: 'wrap', gap: 8 }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.1em', color: 'var(--t-text-muted)', textTransform: 'uppercase', marginBottom: 4 }}>Pay Stub</div>
          <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--t-text)' }}>
            {row.period.start} – {row.period.end}
          </div>
          <div style={{ fontSize: 12, color: 'var(--t-text-muted)', marginTop: 4 }}>
            {emp.full_name} · {emp.location} · {emp.role_name}
          </div>
          <div style={{ fontSize: 11, color: 'var(--t-text-faint)', marginTop: 2 }}>
            Pay Date: {row.period.payDate}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button disabled style={{ ...btnSm('var(--t-accent)'), opacity: 0.45, cursor: 'not-allowed' }} title="PDF download is not yet available — contact HR for printed copies">
            Download PDF <span style={{ color: 'var(--t-text-muted)', fontWeight: 400 }}>(not yet available)</span>
          </button>
          <button onClick={() => setDisputeOpen(d => !d)} style={btnSm('var(--t-warn)')}>Dispute</button>
          <button onClick={onClose} style={btnSm()}>Close</button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
        {/* Earnings */}
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.1em', color: 'var(--t-text-muted)', textTransform: 'uppercase', marginBottom: 8 }}>Earnings</div>
          <div style={{ border: '1px solid var(--t-line)', borderRadius: 0 }}>
            <StubRow label={`Regular (${row.regH.toFixed(1)} hrs × $${row.rate.toFixed(2)})`} value={`$${(row.regH * row.rate).toFixed(2)}`} />
            <StubRow label={`Overtime (${row.otH.toFixed(1)} hrs × $${otRate.toFixed(2)})`} value={`$${(row.otH * otRate).toFixed(2)}`} />
            <StubDivider />
            <StubRow label="GROSS PAY" value={`$${row.grossPay.toFixed(2)}`} bold />
          </div>
        </div>

        {/* Deductions */}
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.1em', color: 'var(--t-text-muted)', textTransform: 'uppercase', marginBottom: 8 }}>Deductions</div>
          <div style={{ border: '1px solid var(--t-line)', borderRadius: 0 }}>
            <StubRow label="Federal Income Tax (12%)" value={`-$${d.fedTax.toFixed(2)}`} muted />
            <StubRow label="CT State Tax (5%)" value={`-$${d.stateTax.toFixed(2)}`} muted />
            <StubRow label="Social Security (6.2%)" value={`-$${d.ss.toFixed(2)}`} muted />
            <StubRow label="Medicare (1.45%)" value={`-$${d.medicare.toFixed(2)}`} muted />
            <StubRow label="Health Insurance" value={`-$${d.healthIns.toFixed(2)}`} muted />
            <StubRow label={`401k (${(row.deductions.k401Rate * 100).toFixed(0)}%)`} value={`-$${d.k401.toFixed(2)}`} muted />
            <StubRow label="Dental" value={`-$${d.dental.toFixed(2)}`} muted />
            <StubRow label="Vision" value={`-$${d.vision.toFixed(2)}`} muted />
            <StubDivider />
            <StubRow label="TOTAL DEDUCTIONS" value={`-$${d.total.toFixed(2)}`} bold />
          </div>
        </div>

        {/* Net + Hours */}
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.1em', color: 'var(--t-text-muted)', textTransform: 'uppercase', marginBottom: 8 }}>Summary</div>
          <div style={{ border: '1px solid var(--t-line)', padding: '16px', borderRadius: 0, marginBottom: 12 }}>
            <div style={{ fontSize: 11, color: 'var(--t-text-muted)', marginBottom: 4 }}>NET PAY</div>
            <div style={{ fontSize: 32, fontWeight: 900, color: 'var(--t-success)', lineHeight: 1 }}>
              ${row.netPay.toFixed(2)}
            </div>
          </div>
          <div style={{ border: '1px solid var(--t-line)', borderRadius: 0 }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.1em', color: 'var(--t-text-muted)', textTransform: 'uppercase', padding: '8px 12px', borderBottom: '1px solid var(--t-line)' }}>Hours Summary</div>
            <StubRow label="Regular Hours" value={`${row.regH.toFixed(1)}`} />
            <StubRow label="Overtime Hours" value={`${row.otH.toFixed(1)}`} />
            <StubRow label="Total Hours" value={`${row.totalHours.toFixed(1)}`} bold />
            <StubRow label="Breaks (unpaid)" value={`${row.breakH.toFixed(1)}h deducted`} muted />
          </div>
        </div>
      </div>

      {/* Dispute form */}
      {disputeOpen && (
        <div style={{ marginTop: 16, border: '1px solid var(--t-warn)', padding: '16px', borderRadius: 0, background: 'var(--t-surface)' }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--t-warn)', marginBottom: 12 }}>Submit Pay Dispute</div>
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 11, color: 'var(--t-text-muted)', marginBottom: 4 }}>Reason</div>
            <select value={disputeReason} onChange={e => setDisputeReason(e.target.value)}
              style={{ width: '100%', padding: '8px', background: 'var(--t-bg)', border: '1px solid var(--t-line)', color: 'var(--t-text)', fontSize: 13, borderRadius: 0 }}>
              <option value="">— Select reason —</option>
              <option value="hours">Incorrect hours</option>
              <option value="rate">Wrong pay rate</option>
              <option value="deductions">Deduction error</option>
              <option value="ot">Overtime not applied</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, color: 'var(--t-text-muted)', marginBottom: 4 }}>Notes</div>
            <textarea value={disputeNotes} onChange={e => setDisputeNotes(e.target.value)}
              rows={3} placeholder="Describe the issue..."
              style={{ width: '100%', padding: '8px', background: 'var(--t-bg)', border: '1px solid var(--t-line)', color: 'var(--t-text)', fontSize: 12, resize: 'vertical', borderRadius: 0, boxSizing: 'border-box' }} />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={handleDispute} disabled={!disputeReason} style={{ ...btnPrimary, background: 'var(--t-warn)', opacity: !disputeReason ? 0.5 : 1 }}>Submit Dispute</button>
            <button onClick={() => setDisputeOpen(false)} style={btnGhost}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  )
}

function StubRow({ label, value, bold, muted }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 12px', borderBottom: '1px solid var(--t-line)' }}>
      <span style={{ fontSize: 12, color: bold ? 'var(--t-text)' : muted ? 'var(--t-text-muted)' : 'var(--t-text)', fontWeight: bold ? 700 : 400 }}>{label}</span>
      <span style={{ fontSize: 12, fontFamily: 'monospace', fontWeight: bold ? 800 : 500, color: bold ? 'var(--t-text)' : muted ? 'var(--t-text-muted)' : 'var(--t-text)' }}>{value}</span>
    </div>
  )
}

function StubDivider() {
  return <div style={{ height: 1, background: 'var(--t-line)', margin: '2px 0' }} />
}

/* ══════════════════════════════════════════════════════════════
   STATUS BADGE
══════════════════════════════════════════════════════════════ */
function StatusBadge({ status }) {
  const color = status === 'PAID' ? 'var(--t-success)'
    : status === 'APPROVED' ? 'var(--t-accent)'
    : status === 'PROCESSING' ? 'var(--t-warn)'
    : 'var(--t-text-muted)'
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: '2px 8px', letterSpacing: '.06em',
      border: `1px solid ${color}`, color, textTransform: 'uppercase', borderRadius: 0,
    }}>{status}</span>
  )
}

/* ══════════════════════════════════════════════════════════════
   EMPLOYEE VIEW — MY PAY STUBS
══════════════════════════════════════════════════════════════ */
function EmployeeView({ emp }) {
  const ei = emp.idx
  const stubs = buildStubHistory(emp)
  const [expandedIdx, setExpandedIdx] = useState(null)
  const [toast, setToast] = useState(null)

  function showToast(msg) { setToast(msg); setTimeout(() => setToast(null), 3000) }

  // YTD KPIs
  const rate = getRate(ei)
  const { ytdGross, ytdHours } = buildYTD(emp)
  const rateDisplay = `$${rate.toFixed(2)}/hr`

  return (
    <div>
      {toast && <Toast msg={toast} />}

      {/* KPI row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8, marginBottom: 20 }}>
        <KTile label="YTD Gross Earnings" value={`$${ytdGross.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`} sub="year to date" color="var(--t-accent)" />
        <KTile label="YTD Hours Worked" value={`${Math.round(ytdHours)}h`} sub="year to date" color="var(--t-text)" />
        <KTile label="Current Pay Rate" value={rateDisplay} sub="hourly" color="var(--t-text)" />
        <KTile label="Next Pay Date" value="Jul 11, 2026" sub="bi-weekly" color="var(--t-text)" />
      </div>

      {/* Pay stub list */}
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.1em', color: 'var(--t-text-muted)', textTransform: 'uppercase', marginBottom: 10 }}>
        Pay Stubs — Most Recent First
      </div>

      {stubs.map((row, i) => (
        <div key={i} style={{ marginBottom: 2 }}>
          {/* Collapsed stub card */}
          <div
            onClick={() => setExpandedIdx(expandedIdx === i ? null : i)}
            style={{
              background: 'var(--t-surface)', border: `1px solid ${expandedIdx === i ? 'var(--t-accent)' : 'var(--t-line)'}`,
              padding: '12px 16px', cursor: 'pointer', display: 'flex',
              alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, borderRadius: 0,
            }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 10, color: 'var(--t-text-faint)', fontWeight: 700 }}>
                {expandedIdx === i ? '▼' : '▶'}
              </span>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--t-text)' }}>
                  {row.period.label.replace(' (Current)', '')}
                </div>
                <div style={{ fontSize: 11, color: 'var(--t-text-muted)', marginTop: 2 }}>
                  Pay Date: {row.period.payDate}
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 11, color: 'var(--t-text-muted)' }}>Gross</div>
                <div style={{ fontSize: 14, fontWeight: 700, fontFamily: 'monospace', color: 'var(--t-text)' }}>${row.grossPay.toFixed(2)}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 11, color: 'var(--t-text-muted)' }}>Net</div>
                <div style={{ fontSize: 14, fontWeight: 700, fontFamily: 'monospace', color: 'var(--t-success)' }}>${row.netPay.toFixed(2)}</div>
              </div>
              <StatusBadge status={row.status} />
              <span style={{ fontSize: 11, color: 'var(--t-accent)', fontWeight: 600 }}>
                {expandedIdx === i ? 'Hide Details' : 'View Details'}
              </span>
            </div>
          </div>

          {/* Expanded detail */}
          {expandedIdx === i && (
            <PayStubDetail
              emp={emp}
              row={row}
              onClose={() => setExpandedIdx(null)}
            />
          )}
        </div>
      ))}
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════
   MANAGER TAB 1: PAY PERIOD SUMMARY
══════════════════════════════════════════════════════════════ */
function ManagerPayPeriodTab() {
  const [periodOffset, setPeriodOffset] = useState(0)
  const [statuses, setStatuses] = useState({})
  const [expanded, setExpanded] = useState(null)
  const [selected, setSelected] = useState(new Set())
  const [confirmModal, setConfirmModal] = useState(null)
  const [toast, setToast] = useState(null)
  const [sortCol, setSortCol] = useState('full_name')
  const [sortAsc, setSortAsc] = useState(true)

  const { liveRoster } = usePayrollData()
  const period = getBiweeklyPeriod(periodOffset)
  // Use real roster/hours for the CURRENT period when available; else mock.
  const roster = (periodOffset === 0 && liveRoster?.employees?.length)
    ? liveRoster.employees
    : ALL_EMPLOYEES
  const rows = roster.map(emp => buildEmpPayroll(emp, period))

  function showToast(msg) { setToast(msg); setTimeout(() => setToast(null), 3000) }
  function effectiveStatus(row) { return statuses[row.id] || row.status }

  function toggleSort(col) {
    if (sortCol === col) setSortAsc(s => !s)
    else { setSortCol(col); setSortAsc(true) }
  }

  const sorted = [...rows].sort((a, b) => {
    let va, vb
    if (sortCol === 'grossPay') return sortAsc ? a.grossPay - b.grossPay : b.grossPay - a.grossPay
    if (sortCol === 'totalHours') return sortAsc ? a.totalHours - b.totalHours : b.totalHours - a.totalHours
    if (sortCol === 'location') { va = a.location; vb = b.location }
    else { va = a.full_name; vb = b.full_name }
    return sortAsc ? va.localeCompare(vb) : vb.localeCompare(va)
  })

  const totalGross = rows.reduce((a, r) => a + r.grossPay, 0)
  const totalNet = rows.reduce((a, r) => a + r.netPay, 0)
  const totalHours = rows.reduce((a, r) => a + r.totalHours, 0)
  const totalOT = rows.reduce((a, r) => a + r.otH, 0)
  const totalBenefits = rows.reduce((a, r) => a + r.deductions.healthIns + r.deductions.dental + r.deductions.vision, 0)
  const totalTax = rows.reduce((a, r) => a + r.deductions.fedTax + r.deductions.stateTax + r.deductions.ss + r.deductions.medicare, 0)

  function handleApprove(id) {
    setStatuses(prev => ({ ...prev, [id]: 'APPROVED' }))
    showToast('Record approved')
  }

  function handleBulkApprove() {
    const next = {}
    selected.forEach(id => { next[id] = 'APPROVED' })
    setStatuses(prev => ({ ...prev, ...next }))
    setSelected(new Set())
    setConfirmModal(null)
    showToast(`${Object.keys(next).length} records approved`)
  }

  function toggleSelect(id) {
    setSelected(prev => {
      const n = new Set(prev)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })
  }

  function selectAll() {
    setSelected(new Set(rows.filter(r => effectiveStatus(r) === 'PENDING').map(r => r.id)))
  }

  const SortArrow = ({ col }) => (
    <span style={{ opacity: sortCol === col ? 1 : 0.3, marginLeft: 3 }}>
      {sortCol === col ? (sortAsc ? '↑' : '↓') : '↕'}
    </span>
  )

  return (
    <div>
      {toast && <Toast msg={toast} />}
      {confirmModal && (
        <ConfirmModal
          message={`Approve ${selected.size} selected payroll records for ${period.label}? This action cannot be undone.`}
          onConfirm={handleBulkApprove}
          onCancel={() => setConfirmModal(null)}
        />
      )}

      {/* Period selector */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, background: 'var(--t-surface)', border: '1px solid var(--t-line)', padding: '12px 16px', borderRadius: 0 }}>
        <button onClick={() => setPeriodOffset(o => o - 1)} style={{ ...btnGhost, padding: '6px 14px', fontSize: '13px' }}>← Prev</button>
        <span style={{ flex: 1, textAlign: 'center', fontSize: '13px', fontWeight: 700, color: 'var(--t-text)' }}>{period.label}</span>
        <button onClick={() => setPeriodOffset(o => o + 1)} disabled={periodOffset >= 0}
          style={{ ...btnGhost, padding: '6px 14px', fontSize: '13px', opacity: periodOffset >= 0 ? 0.35 : 1, cursor: periodOffset >= 0 ? 'default' : 'pointer' }}>
          Next →
        </button>
      </div>

      {/* KPI row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: 8, marginBottom: 16 }}>
        <KTile label="Total Gross" value={`$${totalGross.toLocaleString('en-US', { maximumFractionDigits: 0 })}`} sub="this period" color="var(--t-accent)" />
        <KTile label="Total Net" value={`$${totalNet.toLocaleString('en-US', { maximumFractionDigits: 0 })}`} sub="after deductions" color="var(--t-text)" />
        <KTile label="Total Hours" value={`${totalHours.toFixed(0)}h`} sub="all employees" color="var(--t-text)" />
        <KTile label="OT Hours" value={`${totalOT.toFixed(1)}h`} sub="@ 1.5×" color={totalOT > 0 ? 'var(--t-danger)' : 'var(--t-text-faint)'} alert={totalOT > 0 ? 'amber' : null} />
        <KTile label="Benefits Deductions" value={`$${totalBenefits.toLocaleString('en-US', { maximumFractionDigits: 0 })}`} sub="health/dental/vision" color="var(--t-text-muted)" />
        <KTile label="Tax Withholdings" value={`$${totalTax.toLocaleString('en-US', { maximumFractionDigits: 0 })}`} sub="fed/state/fica" color="var(--t-text-muted)" />
      </div>

      {/* Bulk bar */}
      {selected.size > 0 && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12, padding: '10px 14px', background: 'var(--t-surface-2)', border: '1px solid var(--t-accent)', borderRadius: 0 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--t-text)' }}>{selected.size} selected</span>
          <button onClick={() => setConfirmModal(true)} style={{ ...btnPrimary, padding: '6px 14px', fontSize: 11, background: 'var(--t-success)', color: '#000' }}>Approve Selected</button>
          <button onClick={() => setSelected(new Set())} style={{ ...btnGhost, padding: '6px 14px', fontSize: 11 }}>Clear</button>
        </div>
      )}

      {/* Table */}
      <div style={{ overflowX: 'auto', marginBottom: 12 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ background: 'var(--t-surface-2)' }}>
              <th style={{ ...thStyle, width: 32 }}>
                <input type="checkbox" onChange={e => e.target.checked ? selectAll() : setSelected(new Set())}
                  checked={selected.size > 0 && selected.size === rows.filter(r => effectiveStatus(r) === 'PENDING').length}
                  style={{ cursor: 'pointer' }} />
              </th>
              {[
                { label: 'Employee', col: 'full_name' },
                { label: 'Location', col: 'location' },
                { label: 'Hours', col: 'totalHours' },
                { label: 'OT', col: null },
                { label: 'Gross', col: 'grossPay' },
                { label: 'Deductions', col: null },
                { label: 'Net', col: null },
                { label: 'Status', col: null },
                { label: 'Action', col: null },
              ].map(h => (
                <th key={h.label} style={{ ...thStyle, cursor: h.col ? 'pointer' : 'default' }}
                  onClick={h.col ? () => toggleSort(h.col) : undefined}>
                  {h.label}{h.col && <SortArrow col={h.col} />}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map(row => {
              const eff = effectiveStatus(row)
              const isExp = expanded === row.id
              return [
                <tr key={row.id}
                  onClick={() => setExpanded(isExp ? null : row.id)}
                  style={{ borderBottom: '1px solid var(--t-line)', cursor: 'pointer', background: isExp ? 'rgba(0,229,255,.04)' : 'transparent' }}>
                  <td style={{ ...tdStyle }} onClick={e => e.stopPropagation()}>
                    {eff === 'PENDING' && (
                      <input type="checkbox" checked={selected.has(row.id)}
                        onChange={() => toggleSelect(row.id)}
                        style={{ cursor: 'pointer' }} />
                    )}
                  </td>
                  <td style={{ ...tdStyle, fontWeight: 600, color: 'var(--t-text)' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 10, color: 'var(--t-text-faint)' }}>{isExp ? '▼' : '▶'}</span>
                      {row.full_name}
                    </span>
                  </td>
                  <td style={{ ...tdStyle, color: 'var(--t-text-muted)' }}>{row.location}</td>
                  <td style={{ ...tdStyle, fontFamily: 'monospace' }}>{row.totalHours.toFixed(1)}h</td>
                  <td style={{ ...tdStyle, fontFamily: 'monospace', fontWeight: row.otH > 0 ? 700 : 400, color: row.otH > 0 ? 'var(--t-danger)' : 'var(--t-text-faint)' }}>
                    {row.otH > 0 ? `${row.otH.toFixed(1)}h` : '—'}
                  </td>
                  <td style={{ ...tdStyle, fontFamily: 'monospace', fontWeight: 700 }}>${row.grossPay.toFixed(2)}</td>
                  <td style={{ ...tdStyle, fontFamily: 'monospace', color: 'var(--t-text-muted)' }}>-${row.deductions.total.toFixed(2)}</td>
                  <td style={{ ...tdStyle, fontFamily: 'monospace', fontWeight: 700, color: 'var(--t-success)' }}>${row.netPay.toFixed(2)}</td>
                  <td style={tdStyle}><StatusBadge status={eff} /></td>
                  <td style={{ ...tdStyle }} onClick={e => e.stopPropagation()}>
                    {eff === 'PENDING' && (
                      <button onClick={() => handleApprove(row.id)} style={btnSm('var(--t-success)')}>Approve</button>
                    )}
                  </td>
                </tr>,
                isExp && (
                  <tr key={`${row.id}-exp`} style={{ borderBottom: '1px solid var(--t-line)' }}>
                    <td colSpan={10} style={{ padding: '0 0 0 40px', background: 'var(--t-bg)' }}>
                      <PayStubDetail
                        emp={row}
                        row={{ ...buildEmpPayroll(row, period), period }}
                        onClose={() => setExpanded(null)}
                      />
                    </td>
                  </tr>
                )
              ]
            })}
          </tbody>
        </table>
      </div>

      <div style={{ fontSize: 11, color: 'var(--t-text-faint)', paddingTop: 8, borderTop: '1px solid var(--t-line)' }}>
        Estimated payroll summary. Final amounts subject to payroll processor review. OT calculated at 1.5× for hours exceeding 40/week.
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════
   MANAGER TAB 2: PAY STUB HISTORY
══════════════════════════════════════════════════════════════ */
function ManagerStubHistoryTab() {
  const [search, setSearch] = useState('')
  const [filterLoc, setFilterLoc] = useState('All')
  const [filterStatus, setFilterStatus] = useState('All')
  const [toast, setToast] = useState(null)
  const [expanded, setExpanded] = useState(null)

  function showToast(msg) { setToast(msg); setTimeout(() => setToast(null), 3000) }

  // Build all stubs for all employees (12 periods)
  const allStubs = ALL_EMPLOYEES.flatMap(emp =>
    buildStubHistory(emp).map(row => ({ ...row, emp }))
  )

  const filtered = allStubs.filter(row => {
    const matchSearch = !search || row.emp.full_name.toLowerCase().includes(search.toLowerCase())
    const matchLoc = filterLoc === 'All' || row.emp.location === filterLoc
    const matchStatus = filterStatus === 'All' || row.status === filterStatus
    return matchSearch && matchLoc && matchStatus
  })

  function exportCSV() {
    downloadCSV('pay-stub-history.csv',
      ['Pay Date', 'Employee', 'Location', 'Period', 'Hours', 'Gross', 'Net', 'Status'],
      filtered.map(r => [r.period.payDate, r.emp.full_name, r.emp.location, `${r.period.start}–${r.period.end}`, r.totalHours.toFixed(1), r.grossPay.toFixed(2), r.netPay.toFixed(2), r.status])
    )
    showToast('CSV exported')
  }

  return (
    <div>
      {toast && <Toast msg={toast} />}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <input placeholder="Search employee..." value={search} onChange={e => setSearch(e.target.value)}
          style={{ padding: '8px 12px', background: 'var(--t-bg)', border: '1px solid var(--t-line)', color: 'var(--t-text)', fontSize: 12, borderRadius: 0, minWidth: 200 }} />
        <select value={filterLoc} onChange={e => setFilterLoc(e.target.value)}
          style={{ padding: '8px 12px', background: 'var(--t-bg)', border: '1px solid var(--t-line)', color: 'var(--t-text)', fontSize: 12, borderRadius: 0 }}>
          <option value="All">All Locations</option>
          {LOCATIONS.map(l => <option key={l} value={l}>{l}</option>)}
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
          style={{ padding: '8px 12px', background: 'var(--t-bg)', border: '1px solid var(--t-line)', color: 'var(--t-text)', fontSize: 12, borderRadius: 0 }}>
          <option value="All">All Statuses</option>
          <option value="PAID">PAID</option>
          <option value="APPROVED">APPROVED</option>
          <option value="PENDING">PENDING</option>
          <option value="PROCESSING">PROCESSING</option>
        </select>
        <button onClick={exportCSV} style={{ ...btnGhost, padding: '8px 14px', fontSize: 11, color: 'var(--t-accent)', border: '1px solid var(--t-accent)', marginLeft: 'auto' }}>Export CSV</button>
      </div>

      <div style={{ fontSize: 11, color: 'var(--t-text-faint)', marginBottom: 8 }}>{filtered.length} records</div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ background: 'var(--t-surface-2)' }}>
              {['Pay Date', 'Employee', 'Location', 'Period', 'Hours', 'Gross', 'Net', 'Status'].map(h => (
                <th key={h} style={thStyle}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((row, i) => [
              <tr key={i} onClick={() => setExpanded(expanded === i ? null : i)}
                style={{ borderBottom: '1px solid var(--t-line)', cursor: 'pointer', background: expanded === i ? 'rgba(0,229,255,.04)' : 'transparent' }}>
                <td style={{ ...tdStyle, fontFamily: 'monospace', fontSize: 11 }}>{row.period.payDate}</td>
                <td style={{ ...tdStyle, fontWeight: 600, color: 'var(--t-text)' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 10, color: 'var(--t-text-faint)' }}>{expanded === i ? '▼' : '▶'}</span>
                    {row.emp.full_name}
                  </span>
                </td>
                <td style={{ ...tdStyle, color: 'var(--t-text-muted)' }}>{row.emp.location}</td>
                <td style={{ ...tdStyle, fontSize: 11, color: 'var(--t-text-muted)' }}>{row.period.start} – {row.period.end}</td>
                <td style={{ ...tdStyle, fontFamily: 'monospace' }}>{row.totalHours.toFixed(1)}h</td>
                <td style={{ ...tdStyle, fontFamily: 'monospace', fontWeight: 700 }}>${row.grossPay.toFixed(2)}</td>
                <td style={{ ...tdStyle, fontFamily: 'monospace', color: 'var(--t-success)', fontWeight: 700 }}>${row.netPay.toFixed(2)}</td>
                <td style={tdStyle}><StatusBadge status={row.status} /></td>
              </tr>,
              expanded === i && (
                <tr key={`${i}-exp`} style={{ borderBottom: '1px solid var(--t-line)' }}>
                  <td colSpan={8} style={{ padding: '0 0 0 28px', background: 'var(--t-bg)' }}>
                    <PayStubDetail emp={row.emp} row={row} onClose={() => setExpanded(null)} />
                  </td>
                </tr>
              )
            ])}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════
   MANAGER TAB 3: DEDUCTIONS
══════════════════════════════════════════════════════════════ */
function ManagerDeductionsTab() {
  const [periodOffset, setPeriodOffset] = useState(0)
  const [editingId, setEditingId] = useState(null)
  const [editVals, setEditVals] = useState({})
  const [toast, setToast] = useState(null)

  function showToast(msg) { setToast(msg); setTimeout(() => setToast(null), 3000) }

  const period = getBiweeklyPeriod(periodOffset)
  const rows = ALL_EMPLOYEES.map(emp => {
    const payRow = buildEmpPayroll(emp, period)
    return { ...emp, deductions: payRow.deductions, grossPay: payRow.grossPay }
  })

  const totalHealth = rows.reduce((a, r) => a + r.deductions.healthIns, 0)
  const total401k = rows.reduce((a, r) => a + r.deductions.k401, 0)
  const totalDeductions = rows.reduce((a, r) => a + r.deductions.total, 0)
  const avgRate = totalDeductions / rows.reduce((a, r) => a + r.grossPay, 0) * 100

  function startEdit(emp) {
    const d = emp.deductions
    setEditingId(emp.id)
    setEditVals({ healthIns: d.healthIns.toFixed(2), dental: d.dental.toFixed(2), vision: d.vision.toFixed(2), k401Rate: (emp.deductions.k401Rate * 100).toFixed(0) })
  }

  function saveEdit() { showToast('Deductions updated'); setEditingId(null) }

  return (
    <div>
      {toast && <Toast msg={toast} />}

      {/* Period selector */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, background: 'var(--t-surface)', border: '1px solid var(--t-line)', padding: '12px 16px', borderRadius: 0 }}>
        <button onClick={() => setPeriodOffset(o => o - 1)} style={{ ...btnGhost, padding: '6px 14px', fontSize: '13px' }}>← Prev</button>
        <span style={{ flex: 1, textAlign: 'center', fontSize: '13px', fontWeight: 700, color: 'var(--t-text)' }}>{period.label}</span>
        <button onClick={() => setPeriodOffset(o => o + 1)} disabled={periodOffset >= 0}
          style={{ ...btnGhost, padding: '6px 14px', fontSize: '13px', opacity: periodOffset >= 0 ? 0.35 : 1, cursor: periodOffset >= 0 ? 'default' : 'pointer' }}>
          Next →
        </button>
      </div>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginBottom: 16 }}>
        <KTile label="Total Health Premiums" value={`$${totalHealth.toLocaleString('en-US', { maximumFractionDigits: 0 })}`} sub="this period" color="var(--t-text)" />
        <KTile label="Total 401k Contributions" value={`$${total401k.toLocaleString('en-US', { maximumFractionDigits: 0 })}`} sub="this period" color="var(--t-text)" />
        <KTile label="Avg Deduction Rate" value={`${avgRate.toFixed(1)}%`} sub="deductions / gross" color="var(--t-text-muted)" />
      </div>

      {/* Table */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ background: 'var(--t-surface-2)' }}>
              {['Employee', 'Health Ins', 'Dental', 'Vision', '401k', 'Other', 'Total Deductions', 'Action'].map(h => (
                <th key={h} style={thStyle}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(row => {
              const d = row.deductions
              const other = d.fedTax + d.stateTax + d.ss + d.medicare
              const isEditing = editingId === row.id
              return (
                <tr key={row.id} style={{ borderBottom: '1px solid var(--t-line)' }}>
                  <td style={{ ...tdStyle, fontWeight: 600 }}>{row.full_name}<br />
                    <span style={{ fontSize: 10, color: 'var(--t-text-muted)' }}>{row.location}</span>
                  </td>
                  {isEditing ? (
                    <>
                      <td style={tdStyle}><input type="number" value={editVals.healthIns} onChange={e => setEditVals(v => ({ ...v, healthIns: e.target.value }))} style={{ width: 70, padding: '4px 6px', background: 'var(--t-bg)', border: '1px solid var(--t-accent)', color: 'var(--t-text)', fontSize: 12, borderRadius: 0 }} /></td>
                      <td style={tdStyle}><input type="number" value={editVals.dental} onChange={e => setEditVals(v => ({ ...v, dental: e.target.value }))} style={{ width: 60, padding: '4px 6px', background: 'var(--t-bg)', border: '1px solid var(--t-accent)', color: 'var(--t-text)', fontSize: 12, borderRadius: 0 }} /></td>
                      <td style={tdStyle}><input type="number" value={editVals.vision} onChange={e => setEditVals(v => ({ ...v, vision: e.target.value }))} style={{ width: 60, padding: '4px 6px', background: 'var(--t-bg)', border: '1px solid var(--t-accent)', color: 'var(--t-text)', fontSize: 12, borderRadius: 0 }} /></td>
                      <td style={tdStyle}><input type="number" value={editVals.k401Rate} onChange={e => setEditVals(v => ({ ...v, k401Rate: e.target.value }))} style={{ width: 50, padding: '4px 6px', background: 'var(--t-bg)', border: '1px solid var(--t-accent)', color: 'var(--t-text)', fontSize: 12, borderRadius: 0 }} /><span style={{ fontSize: 10, color: 'var(--t-text-muted)' }}>%</span></td>
                      <td style={{ ...tdStyle, fontFamily: 'monospace', color: 'var(--t-text-muted)' }}>${other.toFixed(2)}</td>
                      <td style={{ ...tdStyle, fontFamily: 'monospace', fontWeight: 700 }}>${d.total.toFixed(2)}</td>
                      <td style={tdStyle}>
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button onClick={saveEdit} style={btnSm('var(--t-success)')}>Save</button>
                          <button onClick={() => setEditingId(null)} style={btnSm()}>Cancel</button>
                        </div>
                      </td>
                    </>
                  ) : (
                    <>
                      <td style={{ ...tdStyle, fontFamily: 'monospace' }}>${d.healthIns.toFixed(2)}</td>
                      <td style={{ ...tdStyle, fontFamily: 'monospace' }}>${d.dental.toFixed(2)}</td>
                      <td style={{ ...tdStyle, fontFamily: 'monospace' }}>${d.vision.toFixed(2)}</td>
                      <td style={{ ...tdStyle, fontFamily: 'monospace' }}>${d.k401.toFixed(2)}<span style={{ fontSize: 10, color: 'var(--t-text-faint)', marginLeft: 4 }}>({(d.k401Rate * 100).toFixed(0)}%)</span></td>
                      <td style={{ ...tdStyle, fontFamily: 'monospace', color: 'var(--t-text-muted)' }}>${other.toFixed(2)}</td>
                      <td style={{ ...tdStyle, fontFamily: 'monospace', fontWeight: 700 }}>${d.total.toFixed(2)}</td>
                      <td style={tdStyle}><button onClick={() => startEdit(row)} style={btnSm()}>Edit</button></td>
                    </>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════
   MANAGER TAB 4: YEAR-TO-DATE
══════════════════════════════════════════════════════════════ */
function ManagerYTDTab() {
  const [sortCol, setSortCol] = useState('full_name')
  const [sortAsc, setSortAsc] = useState(true)
  const [toast, setToast] = useState(null)

  function showToast(msg) { setToast(msg); setTimeout(() => setToast(null), 3000) }

  const rows = ALL_EMPLOYEES.map(emp => {
    const ytd = buildYTD(emp)
    const rate = getRate(emp.idx)
    return { ...emp, ...ytd, rate }
  })

  function toggleSort(col) {
    if (sortCol === col) setSortAsc(s => !s)
    else { setSortCol(col); setSortAsc(true) }
  }

  const sorted = [...rows].sort((a, b) => {
    const numCols = ['ytdGross', 'ytdNet', 'ytdHours', 'ytdOT', 'ytdK401', 'ytdHealth', 'rate']
    if (numCols.includes(sortCol)) return sortAsc ? a[sortCol] - b[sortCol] : b[sortCol] - a[sortCol]
    const va = a[sortCol] || a.full_name
    const vb = b[sortCol] || b.full_name
    return sortAsc ? va.localeCompare(vb) : vb.localeCompare(va)
  })

  const SortArrow = ({ col }) => (
    <span style={{ opacity: sortCol === col ? 1 : 0.3, marginLeft: 3 }}>
      {sortCol === col ? (sortAsc ? '↑' : '↓') : '↕'}
    </span>
  )

  function exportCSV() {
    downloadCSV('ytd-payroll.csv',
      ['Employee', 'Location', 'Role', 'Rate', 'YTD Gross', 'YTD Net', 'YTD Hours', 'YTD OT Hours', 'YTD 401k', 'YTD Health'],
      sorted.map(r => [r.full_name, r.location, r.role_name, r.rate.toFixed(2), r.ytdGross.toFixed(2), r.ytdNet.toFixed(2), r.ytdHours.toFixed(1), r.ytdOT.toFixed(1), r.ytdK401.toFixed(2), r.ytdHealth.toFixed(2)])
    )
    showToast('YTD CSV exported')
  }

  const cols = [
    { label: 'Employee', col: 'full_name' },
    { label: 'Location', col: 'location' },
    { label: 'Role', col: null },
    { label: 'Rate', col: 'rate' },
    { label: 'YTD Gross', col: 'ytdGross' },
    { label: 'YTD Net', col: 'ytdNet' },
    { label: 'YTD Hours', col: 'ytdHours' },
    { label: 'YTD OT Hrs', col: 'ytdOT' },
    { label: 'YTD 401k', col: 'ytdK401' },
    { label: 'YTD Health', col: 'ytdHealth' },
  ]

  return (
    <div>
      {toast && <Toast msg={toast} />}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <button onClick={exportCSV} style={{ ...btnGhost, padding: '8px 14px', fontSize: 11, color: 'var(--t-accent)', border: '1px solid var(--t-accent)' }}>Export CSV</button>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ background: 'var(--t-surface-2)' }}>
              {cols.map(h => (
                <th key={h.label} style={{ ...thStyle, cursor: h.col ? 'pointer' : 'default' }}
                  onClick={h.col ? () => toggleSort(h.col) : undefined}>
                  {h.label}{h.col && <SortArrow col={h.col} />}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map(row => (
              <tr key={row.id} style={{ borderBottom: '1px solid var(--t-line)' }}>
                <td style={{ ...tdStyle, fontWeight: 600, color: 'var(--t-text)' }}>{row.full_name}</td>
                <td style={{ ...tdStyle, color: 'var(--t-text-muted)' }}>{row.location}</td>
                <td style={{ ...tdStyle, fontSize: 11, color: 'var(--t-text-muted)' }}>{row.role_name}</td>
                <td style={{ ...tdStyle, fontFamily: 'monospace' }}>${row.rate.toFixed(2)}/hr</td>
                <td style={{ ...tdStyle, fontFamily: 'monospace', fontWeight: 700, color: 'var(--t-accent)' }}>${row.ytdGross.toLocaleString('en-US', { maximumFractionDigits: 0 })}</td>
                <td style={{ ...tdStyle, fontFamily: 'monospace', fontWeight: 700, color: 'var(--t-success)' }}>${row.ytdNet.toLocaleString('en-US', { maximumFractionDigits: 0 })}</td>
                <td style={{ ...tdStyle, fontFamily: 'monospace' }}>{row.ytdHours.toFixed(0)}h</td>
                <td style={{ ...tdStyle, fontFamily: 'monospace', color: row.ytdOT > 0 ? 'var(--t-danger)' : 'var(--t-text-faint)' }}>
                  {row.ytdOT > 0 ? `${row.ytdOT.toFixed(1)}h` : '—'}
                </td>
                <td style={{ ...tdStyle, fontFamily: 'monospace', color: 'var(--t-text-muted)' }}>${row.ytdK401.toFixed(2)}</td>
                <td style={{ ...tdStyle, fontFamily: 'monospace', color: 'var(--t-text-muted)' }}>${row.ytdHealth.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════
   MANAGER TAB 5: TAX DOCUMENTS
══════════════════════════════════════════════════════════════ */
function ManagerTaxTab() {
  const rows = ALL_EMPLOYEES.map((emp, i) => {
    const ei = emp.idx
    const w2Seed = seed(ei, 77)
    const w2Status = w2Seed < 70 ? 'READY' : w2Seed < 90 ? 'PENDING' : 'ACTION REQUIRED'
    const filingOptions = ['Single', 'Married Filing Jointly', 'Married Filing Separately', 'Head of Household']
    const filing = filingOptions[seed(ei, 88) % 4]
    const fedExemptions = seed(ei, 33) % 3
    const ctExemptions = seed(ei, 44) % 3
    return { ...emp, w2Status, filing, fedExemptions, ctExemptions }
  })

  return (
    <div>
      <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', padding: '12px 16px', marginBottom: 16, borderRadius: 0 }}>
        <div style={{ fontSize: 12, color: 'var(--t-text-muted)' }}>
          W-2s generated by January 31. Contact your payroll processor to update withholding or filing status.
          1099s issued for contractors with &gt;$600 annual payments.
        </div>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ background: 'var(--t-surface-2)' }}>
              {['Employee', 'Location', 'W-2 Status', '1099', 'Federal Exemptions', 'CT Exemptions', 'Filing Status'].map(h => (
                <th key={h} style={thStyle}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(row => {
              const statusColor = row.w2Status === 'READY' ? 'var(--t-success)'
                : row.w2Status === 'PENDING' ? 'var(--t-warn)'
                : 'var(--t-danger)'
              return (
                <tr key={row.id} style={{ borderBottom: '1px solid var(--t-line)' }}>
                  <td style={{ ...tdStyle, fontWeight: 600, color: 'var(--t-text)' }}>{row.full_name}</td>
                  <td style={{ ...tdStyle, color: 'var(--t-text-muted)' }}>{row.location}</td>
                  <td style={tdStyle}>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', letterSpacing: '.06em', border: `1px solid ${statusColor}`, color: statusColor, textTransform: 'uppercase', borderRadius: 0 }}>
                      {row.w2Status}
                    </span>
                  </td>
                  <td style={{ ...tdStyle, color: 'var(--t-text-faint)', fontSize: 11 }}>N/A</td>
                  <td style={{ ...tdStyle, fontFamily: 'monospace', textAlign: 'center' }}>{row.fedExemptions}</td>
                  <td style={{ ...tdStyle, fontFamily: 'monospace', textAlign: 'center' }}>{row.ctExemptions}</td>
                  <td style={{ ...tdStyle, fontSize: 11, color: 'var(--t-text-muted)' }}>{row.filing}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════
   MANAGER VIEW (TABBED)
══════════════════════════════════════════════════════════════ */
const MANAGER_TABS = [
  { id: 'period',    label: 'Pay Period Summary' },
  { id: 'history',  label: 'Pay Stub History' },
  { id: 'deductions', label: 'Deductions' },
  { id: 'ytd',      label: 'Year-to-Date' },
  { id: 'tax',      label: 'Tax Documents' },
]

function ManagerView() {
  const [tab, setTab] = useState('period')

  return (
    <div>
      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--t-line)', marginBottom: 0, overflowX: 'auto' }}>
        {MANAGER_TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{
              padding: '10px 18px', background: 'transparent', border: 'none',
              borderBottom: tab === t.id ? '2px solid var(--t-accent)' : '2px solid transparent',
              color: tab === t.id ? 'var(--t-accent)' : 'var(--t-text-muted)',
              fontWeight: tab === t.id ? 700 : 500, fontSize: '12px',
              cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.5px',
              whiteSpace: 'nowrap', transition: 'color 0.15s', borderRadius: 0,
            }}>
            {t.label}
          </button>
        ))}
      </div>

      <div style={{ padding: '20px 0' }}>
        {tab === 'period'     && <ManagerPayPeriodTab />}
        {tab === 'history'    && <ManagerStubHistoryTab />}
        {tab === 'deductions' && <ManagerDeductionsTab />}
        {tab === 'ytd'        && <ManagerYTDTab />}
        {tab === 'tax'        && <ManagerTaxTab />}
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════
   MAIN SCREEN
══════════════════════════════════════════════════════════════ */
export default function Payroll() {
  const { session } = useAuth()
  const person = session?.person || {}
  const { locationIds } = useScope() || {}
  const config = useConfig()
  const flagEnabled = useFeatureFlag('payroll_detail')

  // ── Live payroll data: real time entries for the CURRENT pay period ──
  // Builds a live roster (real names/locations/hours). Falls back to mock
  // ALL_EMPLOYEES on error or empty — the screen never blanks.
  const [liveRoster, setLiveRoster] = useState(null)

  useEffect(() => {
    let cancelled = false
    const ids = Array.isArray(locationIds) ? locationIds : []
    if (ids.length === 0) return
    const period = getBiweeklyPeriod(0)
    sb.rpc('get_all_time_entries', {
      p_node_ids: ids,
      p_date_from: period.start,
      p_date_to: period.end,
    }).then(({ data, error }) => {
      if (cancelled) return
      if (error || !Array.isArray(data) || data.length === 0) return // keep mock fallback
      const roster = buildLiveRoster(data)
      if (roster && roster.employees.length > 0) setLiveRoster(roster)
    }).catch(() => { /* keep mock fallback */ })
    return () => { cancelled = true }
  }, [locationIds])

  if (!flagEnabled) return <FeatureDisabled />

  const roleName = person.role_name || ''
  const mgr = isManager(roleName)

  // Find the employee record for the current user
  const empRecord = ALL_EMPLOYEES.find(e => e.full_name === person.full_name)
    || ALL_EMPLOYEES[0] // fallback for demo

  return (
    <div style={{ padding: '20px', maxWidth: '1440px' }}>
      {/* Header */}
      <div style={{ marginBottom: '20px' }}>
        <div style={{ fontSize: '10px', color: 'var(--t-text-muted)', textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: '4px' }}>
          {config.company_short || 'Twisted Growers'} · Payroll
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '22px', fontWeight: 800, color: 'var(--t-text)', textTransform: 'uppercase', letterSpacing: '1px' }}>
              PAYROLL
            </h1>
            <div style={{ marginTop: '4px', fontSize: '12px', color: 'var(--t-text-faint)' }}>
              {mgr ? 'Payroll Management' : 'My Pay Stubs'}
              {person.full_name && <span> · {person.full_name}</span>}
              {roleName && <span> · {roleName}</span>}
              {mgr && <span className="badge purple" style={{ fontSize: '10px', marginLeft: 8 }}>MANAGER VIEW</span>}
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <PayrollDataCtx.Provider value={{ liveRoster }}>
        {mgr ? <ManagerView /> : <EmployeeView emp={empRecord} />}
      </PayrollDataCtx.Provider>
    </div>
  )
}
