import { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import { sb } from '../lib/supabase'
import { useFeatureFlag } from '../lib/featureFlags.js'
import { useAuth } from '../lib/auth.jsx'
import { useScope } from '../lib/scope.jsx'
import { useConfig } from '../lib/config.js'

// ── PLAN CATALOG (reference offerings — static plan definitions, not per-employee data) ──
const HEALTH_PLANS = ['PPO Silver', 'PPO Gold', 'HMO Basic', 'Waived']
const DENTAL_PLANS = ['Basic', 'Enhanced', 'Waived']
const VISION_PLANS = ['VSP Basic', 'VSP Plus', 'Waived']
const COVERAGE_TYPES = ['Employee Only', 'Employee + Spouse', 'Family']

const OPEN_ENROLLMENT_START = new Date('2026-08-01')
const OPEN_ENROLLMENT_END   = new Date('2026-08-31')

function isEnrollmentOpen() {
  const now = new Date()
  return now >= OPEN_ENROLLMENT_START && now <= OPEN_ENROLLMENT_END
}

function enrollmentWithin30Days() {
  const now = new Date()
  const diff = (OPEN_ENROLLMENT_END - now) / 86400000
  return diff >= 0 && diff <= 30
}

function fmt(n) { return '$' + Number(n || 0).toLocaleString() }

// Monthly premium (employee share) by health plan — reference pricing.
const HEALTH_PREMIUM = { 'HMO Basic': 80, 'PPO Silver': 140, 'PPO Gold': 220, 'Waived': 0 }

// ── FEATURE GATE ──────────────────────────────────────────────────────────────
function FeatureDisabled({ name }) {
  return (
    <div style={{ background: '#070b14', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--t-text-muted)' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>🔒</div>
        <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--t-text)', marginBottom: 6 }}>{name}</div>
        <div style={{ fontSize: 13 }}>This feature is not enabled for your account.</div>
      </div>
    </div>
  )
}

// ── STYLES ────────────────────────────────────────────────────────────────────
const S = {
  page: { background: 'var(--t-bg, #070b14)', minHeight: '100vh', padding: '0 0 60px', fontFamily: 'var(--font-sans, system-ui, sans-serif)', color: 'var(--t-text, #e2e8f0)' },
  hdr: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 24px 16px', borderBottom: '1px solid var(--t-line, #1e2530)', background: 'var(--t-bg, #070b14)' },
  hdrTitle: { fontSize: 18, fontWeight: 800, color: 'var(--t-text)', margin: 0, letterSpacing: '-0.02em' },
  hdrSub: { fontSize: 11, color: 'var(--t-text-muted, #6b7a90)', marginTop: 3, letterSpacing: '0.05em', textTransform: 'uppercase' },
  body: { padding: '20px 24px' },
  kpiStrip: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 1, background: 'var(--t-line, #1e2530)', border: '1px solid var(--t-line)', marginBottom: 20 },
  kpiCell: { background: 'var(--t-surface, #0d1117)', padding: '14px 18px' },
  kpiLabel: { fontSize: 9, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--t-text-muted, #6b7a90)', marginBottom: 6 },
  kpiVal: (c) => ({ fontSize: 22, fontWeight: 800, color: c || 'var(--t-text)', lineHeight: 1 }),
  kpiSub: { fontSize: 10, color: 'var(--t-text-faint, #3d4a5c)', marginTop: 4 },
  tabRow: { display: 'flex', borderBottom: '1px solid var(--t-line, #1e2530)', marginBottom: 20, overflowX: 'auto' },
  tabBtn: (a) => ({ padding: '10px 18px', background: 'none', border: 'none', borderBottom: a ? '2px solid #00e5ff' : '2px solid transparent', color: a ? '#00e5ff' : 'var(--t-text-muted, #6b7a90)', fontSize: 11, fontWeight: a ? 700 : 500, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap', transition: 'color 0.15s' }),
  card: { background: 'var(--t-surface, #0d1117)', border: '1px solid var(--t-line, #1e2530)', marginBottom: 12 },
  cardHdr: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid var(--t-line)', background: 'rgba(255,255,255,0.02)' },
  cardHdrTitle: { fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--t-text-muted)' },
  cardBody: { padding: '14px 16px' },
  btnPrimary: { background: '#00e5ff', color: '#070b14', border: 'none', padding: '9px 18px', fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer', fontFamily: 'inherit', borderRadius: 0 },
  btnGhost: { background: 'transparent', color: 'var(--t-text-muted, #6b7a90)', border: '1px solid var(--t-line)', padding: '7px 14px', fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', cursor: 'pointer', fontFamily: 'inherit', borderRadius: 0 },
  btnSm: { background: 'transparent', color: 'var(--t-text-muted)', border: '1px solid var(--t-line)', padding: '5px 10px', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit', borderRadius: 0 },
  input: { background: 'rgba(255,255,255,0.04)', border: '1px solid var(--t-line)', color: 'var(--t-text)', padding: '9px 12px', fontSize: 13, fontFamily: 'inherit', width: '100%', boxSizing: 'border-box', outline: 'none', borderRadius: 0 },
  select: { background: 'rgba(255,255,255,0.04)', border: '1px solid var(--t-line)', color: 'var(--t-text)', padding: '9px 12px', fontSize: 13, fontFamily: 'inherit', width: '100%', boxSizing: 'border-box', outline: 'none', cursor: 'pointer', borderRadius: 0 },
  label: { fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--t-text-muted)', display: 'block', marginBottom: 6 },
  fg: { marginBottom: 14 },
  divRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid rgba(30,37,48,0.6)', fontSize: 12 },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 12 },
  th: { padding: '10px 12px', textAlign: 'left', fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--t-text-muted)', borderBottom: '1px solid var(--t-line)', background: 'rgba(255,255,255,0.02)', whiteSpace: 'nowrap' },
  td: { padding: '10px 12px', borderBottom: '1px solid rgba(30,37,48,0.5)', color: 'var(--t-text)', verticalAlign: 'middle' },
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 },
  modal: { background: '#0d1117', border: '1px solid var(--t-line)', width: '100%', maxWidth: 520, maxHeight: '90vh', overflowY: 'auto', borderRadius: 0 },
  modalHdr: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: '1px solid var(--t-line)', background: 'rgba(0,229,255,0.05)' },
  modalTitle: { fontSize: 13, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#00e5ff' },
  modalBody: { padding: '20px' },
  modalFoot: { display: 'flex', justifyContent: 'flex-end', gap: 10, padding: '14px 20px', borderTop: '1px solid var(--t-line)' },
  infoBox: { background: 'rgba(0,229,255,0.04)', border: '1px solid rgba(0,229,255,0.2)', padding: '14px 16px', marginBottom: 16 },
  alertBox: (c) => ({ background: `rgba(${c},0.07)`, border: `1px solid rgba(${c},0.3)`, padding: '14px 16px', marginBottom: 16 }),
  empty: { textAlign: 'center', padding: '40px 20px', color: 'var(--t-text-muted)', fontSize: 13, border: '1px solid var(--t-line)', background: 'var(--t-surface)' },
}

// ── HELPERS ───────────────────────────────────────────────────────────────────
function Badge({ label, color, bg }) {
  return (
    <span style={{ display: 'inline-block', padding: '2px 8px', fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: color || '#e2e8f0', background: bg || (color ? color + '22' : 'rgba(255,255,255,0.08)'), border: `1px solid ${color ? color + '44' : '#1e2530'}`, borderRadius: 0 }}>
      {label}
    </span>
  )
}

function DataRow({ label, value, valueColor }) {
  return (
    <div style={S.divRow}>
      <span style={{ color: 'var(--t-text-muted)', fontSize: 12 }}>{label}</span>
      <span style={{ fontWeight: 600, color: valueColor || 'var(--t-text)', fontSize: 12 }}>{value}</span>
    </div>
  )
}

function Spinner() {
  return <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--t-text-muted)', fontSize: 12, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Loading…</div>
}

function ErrorState({ msg, onRetry }) {
  return (
    <div style={{ ...S.empty, borderColor: 'rgba(255,77,125,0.3)', background: 'rgba(255,77,125,0.05)', color: '#ff4d7d' }}>
      <div style={{ fontWeight: 700, marginBottom: 8 }}>Unable to load benefits data</div>
      <div style={{ fontSize: 12, marginBottom: 12, color: 'var(--t-text-muted)' }}>{msg}</div>
      {onRetry && <button style={S.btnSm} onClick={onRetry}>Retry</button>}
    </div>
  )
}

function statusColor(s) {
  if (s === 'ENROLLED') return '#2ad6a0'
  if (s === 'WAIVED') return '#6b7a90'
  if (s === 'PENDING') return '#ffb800'
  return '#ff4d7d'
}

function planColor(p) {
  if (!p || p === 'Waived') return '#6b7a90'
  if (p.includes('Gold') || p.includes('Plus') || p.includes('Enhanced')) return '#ffb800'
  if (p.includes('Silver') || p.includes('Basic') || p.includes('VSP Basic')) return '#00e5ff'
  return '#7c4dff'
}

function downloadCSV(cols, rows, filename) {
  const lines = [cols.join(','), ...rows]
  const blob = new Blob([lines.join('\n')], { type: 'text/csv' })
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: filename })
  a.click(); URL.revokeObjectURL(a.href)
}

// ── TOAST ─────────────────────────────────────────────────────────────────────
function useToast() {
  const [toast, setToast] = useState(null)
  const timer = useRef(null)
  function show(msg, type = 'success') {
    clearTimeout(timer.current)
    setToast({ msg, type })
    timer.current = setTimeout(() => setToast(null), 3000)
  }
  function ToastEl() {
    if (!toast) return null
    return (
      <div style={{ position: 'fixed', bottom: 24, right: 24, background: toast.type === 'error' ? '#ff4d7d' : '#2ad6a0', color: '#070b14', padding: '12px 20px', fontSize: 13, fontWeight: 700, zIndex: 2000, boxShadow: '0 8px 32px rgba(0,0,0,0.4)', letterSpacing: '0.04em', borderRadius: 0 }}>
        {toast.msg}
      </div>
    )
  }
  return { show, ToastEl }
}

// ── PLAN DETAILS CARD (static reference detail for the selected plan) ──────────
function PlanDetailsCard({ plan, type }) {
  if (type === 'health') {
    const isGold = plan === 'PPO Gold'
    const isSilver = plan === 'PPO Silver'
    const isHMO = plan === 'HMO Basic'
    return (
      <div style={{ background: 'rgba(0,229,255,0.04)', border: '1px solid rgba(0,229,255,0.15)', padding: 14, marginTop: 10 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: '#00e5ff', letterSpacing: '0.1em', marginBottom: 10 }}>PLAN SUMMARY</div>
        <DataRow label="Network" value={isHMO ? 'HMO — In-network only' : 'PPO — In + Out of network'} />
        <DataRow label="Deductible (individual)" value={isGold ? '$250' : isSilver ? '$500' : '$1,500'} />
        <DataRow label="Out-of-pocket max" value={isGold ? '$2,000' : isSilver ? '$4,000' : '$6,500'} />
        <DataRow label="Primary care visit" value={isGold ? '$20 copay' : isSilver ? '$30 copay' : '$40 copay'} />
        <DataRow label="Specialist" value={isGold ? '$40 copay' : isSilver ? '$60 copay' : '$80 copay'} />
        <DataRow label="Emergency room" value="$250 copay after deductible" />
        <DataRow label="Prescription (generic)" value={isGold ? '$10' : '$15'} />
        <DataRow label="Carrier" value="Not configured — HR sets the carrier in Benefits › Administration" />
      </div>
    )
  }
  if (type === 'dental') {
    const isEnhanced = plan === 'Enhanced'
    return (
      <div style={{ background: 'rgba(0,229,255,0.04)', border: '1px solid rgba(0,229,255,0.15)', padding: 14, marginTop: 10 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: '#00e5ff', letterSpacing: '0.1em', marginBottom: 10 }}>COVERAGE SUMMARY</div>
        <DataRow label="Annual maximum" value={isEnhanced ? '$2,000' : '$1,000'} />
        <DataRow label="Preventive (cleanings, X-rays)" value="100% covered" valueColor="#2ad6a0" />
        <DataRow label="Basic procedures (fillings)" value="80% after deductible" />
        <DataRow label="Major procedures (crowns)" value={isEnhanced ? '60%' : '50%'} />
        <DataRow label="Orthodontia" value={isEnhanced ? '$1,500 lifetime max' : 'Not covered'} />
        <DataRow label="Carrier" value="Delta Dental of CT" />
      </div>
    )
  }
  if (type === 'vision') {
    const isPlus = plan === 'VSP Plus'
    return (
      <div style={{ background: 'rgba(0,229,255,0.04)', border: '1px solid rgba(0,229,255,0.15)', padding: 14, marginTop: 10 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: '#00e5ff', letterSpacing: '0.1em', marginBottom: 10 }}>COVERAGE SUMMARY</div>
        <DataRow label="Eye exam coverage" value={isPlus ? '$200' : '$150'} />
        <DataRow label="Frames allowance" value={isPlus ? '$200' : '$150'} />
        <DataRow label="Contact lens allowance" value={isPlus ? '$200' : '$150'} />
        <DataRow label="Exam frequency" value="Once every 12 months" />
        <DataRow label="Carrier" value="VSP Vision Care" />
      </div>
    )
  }
  return null
}

// ── ENROLLMENT WIZARD (persists to the real backend) ──────────────────────────
function EnrollmentWizard({ person, currentBenefits, savedDraft, onClose, onSaved, toast }) {
  const [step, setStep] = useState(1)
  const [busy, setBusy] = useState(false)
  const d = savedDraft || {}

  const [selections, setSelections] = useState({
    health: d.health || currentBenefits.health || 'Waived',
    dental: d.dental || currentBenefits.dental || 'Waived',
    vision: d.vision || currentBenefits.vision || 'Waived',
    coverage: d.coverage || currentBenefits.coverage || 'Employee Only',
    contrib: d.contrib !== undefined ? d.contrib : (currentBenefits.contrib || 0),
    beneficiary: d.beneficiary || { name: '', relationship: '', dob: '' },
    beneficiary2_enabled: d.beneficiary2_enabled || false,
    beneficiary2: d.beneficiary2 || { name: '', relationship: '', dob: '' },
  })

  function upd(k, v) { setSelections(s => ({ ...s, [k]: v })) }

  const PLAN_DATA = {
    'HMO Basic':  { premium: 80, deductible: '$1,500', oop: '$6,500', network: 'HMO Only' },
    'PPO Silver': { premium: 140, deductible: '$500', oop: '$4,000', network: 'PPO (In + Out)' },
    'PPO Gold':   { premium: 220, deductible: '$250', oop: '$2,000', network: 'PPO (In + Out)' },
    'Waived':     { premium: 0, deductible: '—', oop: '—', network: '—' },
  }

  const totalMonthly = (PLAN_DATA[selections.health]?.premium || 0)

  async function saveDraft() {
    if (!person.id) { toast('No employee session — cannot save.', 'error'); return }
    setBusy(true)
    try {
      const { data, error } = await sb.rpc('benefits_save_draft', { p_person_id: person.id, p_draft: selections })
      if (error) throw error
      if (!data || data.ok !== true) throw new Error('Draft was not saved.')
      toast('Draft saved — your selections are preserved.')
    } catch (e) {
      toast('Could not save draft — ' + (e.message || 'try again'), 'error')
    } finally { setBusy(false) }
  }

  async function submitEnrollment() {
    if (!person.id) { toast('No employee session — cannot submit.', 'error'); return }
    setBusy(true)
    try {
      const beneficiaries = []
      if (selections.beneficiary?.name) beneficiaries.push({ ...selections.beneficiary, is_primary: true })
      if (selections.beneficiary2_enabled && selections.beneficiary2?.name) beneficiaries.push({ ...selections.beneficiary2, is_primary: false })
      const { data, error } = await sb.rpc('benefits_submit_enrollment', {
        p_person_id: person.id,
        p_health: selections.health,
        p_dental: selections.dental,
        p_vision: selections.vision,
        p_coverage: selections.coverage,
        p_contrib: selections.contrib,
        p_premium: totalMonthly,
        p_beneficiaries: beneficiaries,
      })
      if (error) throw error
      if (!data || data.ok !== true) throw new Error('Enrollment was not saved.')
      toast('Enrollment submitted — changes take effect Jan 1, 2027.')
      onSaved && onSaved()
      onClose()
    } catch (e) {
      toast('Could not submit enrollment — ' + (e.message || 'try again'), 'error')
    } finally { setBusy(false) }
  }

  const STEPS = ['Health Plan', 'Dental & Vision', '401k', 'Beneficiaries', 'Review & Submit']

  return (
    <div style={S.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ ...S.modal, maxWidth: 640 }}>
        <div style={S.modalHdr}>
          <span style={S.modalTitle}>Open Enrollment — Step {step} of 5: {STEPS[step - 1]}</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#6b7a90', fontSize: 20, cursor: 'pointer', lineHeight: 1 }}>×</button>
        </div>

        <div style={{ display: 'flex', borderBottom: '1px solid var(--t-line)' }}>
          {STEPS.map((s, i) => (
            <div key={i} style={{ flex: 1, padding: '8px 4px', textAlign: 'center', fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', background: step === i + 1 ? 'rgba(0,229,255,0.08)' : 'transparent', color: step === i + 1 ? '#00e5ff' : step > i + 1 ? '#2ad6a0' : 'var(--t-text-faint)', borderBottom: step === i + 1 ? '2px solid #00e5ff' : '2px solid transparent', cursor: 'pointer' }} onClick={() => setStep(i + 1)}>
              {i + 1}
            </div>
          ))}
        </div>

        <div style={S.modalBody}>
          {step === 1 && (
            <div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
                {Object.entries(PLAN_DATA).map(([plan, data]) => (
                  <div key={plan} onClick={() => upd('health', plan)} style={{ border: `2px solid ${selections.health === plan ? '#00e5ff' : 'var(--t-line)'}`, background: selections.health === plan ? 'rgba(0,229,255,0.06)' : 'var(--t-surface)', padding: 14, cursor: 'pointer' }}>
                    <div style={{ fontWeight: 700, fontSize: 13, color: selections.health === plan ? '#00e5ff' : 'var(--t-text)', marginBottom: 6 }}>{plan}</div>
                    <DataRow label="Monthly premium (your share)" value={data.premium === 0 ? 'No coverage' : fmt(data.premium)} />
                    <DataRow label="Deductible" value={data.deductible} />
                    <DataRow label="OOP max" value={data.oop} />
                    <DataRow label="Network" value={data.network} />
                  </div>
                ))}
              </div>
              <div style={{ fontSize: 11, color: 'var(--t-text-muted)', marginBottom: 12 }}>
                Estimated monthly cost with selected plan: <strong style={{ color: '#00e5ff' }}>{fmt(totalMonthly)}</strong>
              </div>
              <div style={S.fg}>
                <label style={S.label}>Coverage Level</label>
                <select style={S.select} value={selections.coverage} onChange={e => upd('coverage', e.target.value)}>
                  {COVERAGE_TYPES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>
          )}

          {step === 2 && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--t-text-muted)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 10 }}>Dental Plan</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 20 }}>
                {DENTAL_PLANS.map(p => (
                  <div key={p} onClick={() => upd('dental', p)} style={{ border: `2px solid ${selections.dental === p ? '#00e5ff' : 'var(--t-line)'}`, background: selections.dental === p ? 'rgba(0,229,255,0.06)' : 'var(--t-surface)', padding: 12, cursor: 'pointer', textAlign: 'center' }}>
                    <div style={{ fontWeight: 700, color: selections.dental === p ? '#00e5ff' : 'var(--t-text)', fontSize: 12, marginBottom: 6 }}>{p}</div>
                    <div style={{ fontSize: 11, color: 'var(--t-text-muted)' }}>{p === 'Basic' ? '$1,000 max/year' : p === 'Enhanced' ? '$2,000 max/year' : 'No coverage'}</div>
                  </div>
                ))}
              </div>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--t-text-muted)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 10 }}>Vision Plan</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                {VISION_PLANS.map(p => (
                  <div key={p} onClick={() => upd('vision', p)} style={{ border: `2px solid ${selections.vision === p ? '#00e5ff' : 'var(--t-line)'}`, background: selections.vision === p ? 'rgba(0,229,255,0.06)' : 'var(--t-surface)', padding: 12, cursor: 'pointer', textAlign: 'center' }}>
                    <div style={{ fontWeight: 700, color: selections.vision === p ? '#00e5ff' : 'var(--t-text)', fontSize: 12, marginBottom: 6 }}>{p}</div>
                    <div style={{ fontSize: 11, color: 'var(--t-text-muted)' }}>{p === 'VSP Basic' ? '$150 frames/contacts' : p === 'VSP Plus' ? '$200 frames/contacts' : 'No coverage'}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {step === 3 && (
            <div>
              <div style={S.fg}>
                <label style={S.label}>Contribution rate: {selections.contrib}%</label>
                <input type="range" min={0} max={10} value={selections.contrib} style={{ width: '100%' }} onChange={e => upd('contrib', Number(e.target.value))} />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--t-text-faint)', marginTop: 4 }}>
                  <span>0% (No contribution)</span><span>10% (Maximum)</span>
                </div>
              </div>
              <div style={{ background: 'rgba(42,214,160,0.06)', border: '1px solid rgba(42,214,160,0.2)', padding: 14, marginBottom: 14 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#2ad6a0', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>Employer Match Calculator</div>
                <DataRow label="Your contribution" value={`${selections.contrib}%`} />
                <DataRow label="Company match (50% up to 4%)" value={`${Math.min(selections.contrib * 0.5, 2)}%`} valueColor="#2ad6a0" />
                <DataRow label="Total retirement savings rate" value={`${selections.contrib + Math.min(selections.contrib * 0.5, 2)}%`} valueColor="#00e5ff" />
              </div>
              <div style={S.infoBox}>
                <div style={{ fontSize: 11, color: '#00e5ff', lineHeight: 1.6 }}>
                  <strong>Vesting schedule:</strong> 3-year graded vesting — 33% after year 1, 67% after year 2, 100% after year 3.<br />
                  <strong>Investment options:</strong> Not configured — HR sets the plan options in Benefits › Administration.<br />
                  <strong>Plan:</strong> Not configured.
                </div>
              </div>
            </div>
          )}

          {step === 4 && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--t-text-muted)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 12 }}>Primary Beneficiary</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 20 }}>
                <div style={S.fg}>
                  <label style={S.label}>Full Name</label>
                  <input style={S.input} value={selections.beneficiary.name} placeholder="First Last" onChange={e => upd('beneficiary', { ...selections.beneficiary, name: e.target.value })} />
                </div>
                <div style={S.fg}>
                  <label style={S.label}>Relationship</label>
                  <select style={S.select} value={selections.beneficiary.relationship} onChange={e => upd('beneficiary', { ...selections.beneficiary, relationship: e.target.value })}>
                    <option value="">Select…</option>
                    {['Spouse', 'Child', 'Parent', 'Sibling', 'Domestic Partner', 'Other'].map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
                <div style={S.fg}>
                  <label style={S.label}>Date of Birth</label>
                  <input type="date" style={S.input} value={selections.beneficiary.dob} onChange={e => upd('beneficiary', { ...selections.beneficiary, dob: e.target.value })} />
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                <input type="checkbox" id="ben2toggle" checked={selections.beneficiary2_enabled} onChange={e => upd('beneficiary2_enabled', e.target.checked)} style={{ cursor: 'pointer' }} />
                <label htmlFor="ben2toggle" style={{ fontSize: 12, color: 'var(--t-text-muted)', cursor: 'pointer' }}>Add a secondary beneficiary</label>
              </div>

              {selections.beneficiary2_enabled && (
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--t-text-muted)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 12 }}>Secondary Beneficiary</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                    <div style={S.fg}>
                      <label style={S.label}>Full Name</label>
                      <input style={S.input} value={selections.beneficiary2.name} placeholder="First Last" onChange={e => upd('beneficiary2', { ...selections.beneficiary2, name: e.target.value })} />
                    </div>
                    <div style={S.fg}>
                      <label style={S.label}>Relationship</label>
                      <select style={S.select} value={selections.beneficiary2.relationship} onChange={e => upd('beneficiary2', { ...selections.beneficiary2, relationship: e.target.value })}>
                        <option value="">Select…</option>
                        {['Spouse', 'Child', 'Parent', 'Sibling', 'Domestic Partner', 'Other'].map(r => <option key={r} value={r}>{r}</option>)}
                      </select>
                    </div>
                    <div style={S.fg}>
                      <label style={S.label}>Date of Birth</label>
                      <input type="date" style={S.input} value={selections.beneficiary2.dob} onChange={e => upd('beneficiary2', { ...selections.beneficiary2, dob: e.target.value })} />
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {step === 5 && (
            <div>
              <div style={S.infoBox}>
                <div style={{ fontSize: 11, color: '#00e5ff', fontWeight: 600 }}>Changes take effect January 1, 2027. Review your selections carefully.</div>
              </div>
              {[
                ['Health Plan', selections.health, planColor(selections.health)],
                ['Coverage Level', selections.coverage, 'var(--t-text)'],
                ['Dental Plan', selections.dental, planColor(selections.dental)],
                ['Vision Plan', selections.vision, planColor(selections.vision)],
                ['401k Contribution', `${selections.contrib}%`, '#2ad6a0'],
                ['Employer Match', `${Math.min(selections.contrib * 0.5, 2)}%`, '#2ad6a0'],
                ['Primary Beneficiary', selections.beneficiary.name || '(not set)', selections.beneficiary.name ? 'var(--t-text)' : '#ff4d7d'],
              ].map(([l, v, c]) => <DataRow key={l} label={l} value={v} valueColor={c} />)}
            </div>
          )}
        </div>

        <div style={S.modalFoot}>
          {step > 1 && <button onClick={() => setStep(s => s - 1)} style={S.btnGhost} disabled={busy}>Back</button>}
          <button onClick={saveDraft} style={S.btnSm} disabled={busy}>Save Draft</button>
          {step < 5
            ? <button onClick={() => setStep(s => s + 1)} style={S.btnPrimary} disabled={busy}>Next</button>
            : <button onClick={submitEnrollment} style={{ ...S.btnPrimary, background: '#2ad6a0', opacity: busy ? 0.6 : 1 }} disabled={busy}>{busy ? 'Submitting…' : 'Confirm Enrollment'}</button>
          }
        </div>
      </div>
    </div>
  )
}

// ── TAB 1: MY BENEFITS ────────────────────────────────────────────────────────
function TabMyBenefits({ person, config, myData, reload, toast }) {
  const enr = myData?.enrollment || null
  const lv = myData?.leave || null
  const b = {
    health: enr?.health_plan || null,
    dental: enr?.dental_plan || null,
    vision: enr?.vision_plan || null,
    coverage: enr?.coverage_type || null,
    contrib: enr?.contrib_pct ?? 0,
    premium: enr?.premium ?? 0,
  }
  const leaveAccrued = Number(lv?.accrued_hours ?? 0)
  const leaveUsed = Number(lv?.used_hours ?? 0)
  const leaveRemaining = leaveAccrued - leaveUsed

  const [showHealthDetail, setShowHealthDetail] = useState(false)
  const [showDentalDetail, setShowDentalDetail] = useState(false)
  const [showVisionDetail, setShowVisionDetail] = useState(false)
  const [showContribEdit, setShowContribEdit] = useState(false)
  const [contribDraft, setContribDraft] = useState(b.contrib)
  const [savingContrib, setSavingContrib] = useState(false)
  const [showEnrollment, setShowEnrollment] = useState(false)
  const enrollOpen = isEnrollmentOpen()

  // Rough monthly estimate at company minimum wage, full-time — clearly an estimate.
  const monthlyContribEst = Math.round(config.min_wage * 40 * 52 * (contribDraft / 100) / 12)

  async function saveContribution() {
    if (!person.id) { toast('No employee session — cannot save.', 'error'); return }
    setSavingContrib(true)
    try {
      const { data, error } = await sb.rpc('benefits_set_contribution', { p_person_id: person.id, p_contrib: contribDraft })
      if (error) throw error
      if (!data || data.ok !== true) throw new Error('Rate was not saved.')
      toast(`Contribution rate updated to ${contribDraft}%.`)
      setShowContribEdit(false)
      reload()
    } catch (e) {
      toast('Could not update contribution — ' + (e.message || 'try again'), 'error')
    } finally { setSavingContrib(false) }
  }

  const notEnrolled = !enr

  return (
    <div>
      {showEnrollment && (
        <EnrollmentWizard
          person={person}
          currentBenefits={b}
          savedDraft={myData?.draft}
          onClose={() => setShowEnrollment(false)}
          onSaved={reload}
          toast={toast}
        />
      )}

      {enrollOpen && (
        <div style={{ ...S.alertBox('255,184,0'), display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#ffb800', marginBottom: 4 }}>OPEN ENROLLMENT — Aug 1–31, 2026</div>
            <div style={{ fontSize: 11, color: 'var(--t-text-muted)' }}>Make your plan selections before the deadline. Changes take effect Jan 1, 2027.</div>
          </div>
          <button style={S.btnPrimary} onClick={() => setShowEnrollment(true)}>Enroll Now</button>
        </div>
      )}

      {notEnrolled && (
        <div style={{ ...S.infoBox, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: 12, color: 'var(--t-text-muted)' }}>
            You have no benefit elections on record yet. {enrollOpen ? 'Enrollment is open — start the wizard to elect your plans.' : 'Elections can be made during open enrollment or a qualifying life event.'}
          </div>
          {enrollOpen && <button style={S.btnSm} onClick={() => setShowEnrollment(true)}>Start Enrollment</button>}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>

        {/* Health */}
        <div style={S.card}>
          <div style={S.cardHdr}>
            <span style={S.cardHdrTitle}>Health Insurance</span>
            <Badge label={b.health || 'No election'} color={planColor(b.health)} />
          </div>
          <div style={S.cardBody}>
            {!b.health
              ? <div style={{ fontSize: 12, color: 'var(--t-text-muted)' }}>No health election on record.</div>
              : b.health === 'Waived'
              ? <div style={{ fontSize: 12, color: 'var(--t-text-muted)' }}>Coverage waived.</div>
              : <>
                <DataRow label="Coverage type" value={b.coverage || '—'} />
                <DataRow label="Monthly premium (your share)" value={fmt(b.premium || HEALTH_PREMIUM[b.health] || 0)} />
                <DataRow label="Deductible" value={b.health === 'PPO Gold' ? '$250' : b.health === 'PPO Silver' ? '$500' : '$1,500'} />
                <DataRow label="Out-of-pocket max" value={b.health === 'PPO Gold' ? '$2,000' : b.health === 'PPO Silver' ? '$4,000' : '$6,500'} />
                {enr?.effective_date && <DataRow label="Effective date" value={new Date(enr.effective_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} />}
                {showHealthDetail && <PlanDetailsCard plan={b.health} type="health" />}
              </>
            }
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              {b.health && b.health !== 'Waived' && (
                <button style={S.btnSm} onClick={() => setShowHealthDetail(x => !x)}>
                  {showHealthDetail ? 'Hide Details' : 'View Plan Details'}
                </button>
              )}
              {enrollOpen && (
                <button style={S.btnGhost} onClick={() => setShowEnrollment(true)}>
                  Change Plan
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Dental */}
        <div style={S.card}>
          <div style={S.cardHdr}>
            <span style={S.cardHdrTitle}>Dental Insurance</span>
            <Badge label={b.dental || 'No election'} color={planColor(b.dental)} />
          </div>
          <div style={S.cardBody}>
            {!b.dental
              ? <div style={{ fontSize: 12, color: 'var(--t-text-muted)' }}>No dental election on record.</div>
              : b.dental === 'Waived'
              ? <div style={{ fontSize: 12, color: 'var(--t-text-muted)' }}>Coverage waived.</div>
              : <>
                <DataRow label="Annual maximum" value={b.dental === 'Enhanced' ? '$2,000' : '$1,000'} />
                <DataRow label="Preventive coverage" value="100%" valueColor="#2ad6a0" />
                <DataRow label="Basic procedures" value="80%" />
                {showDentalDetail && <PlanDetailsCard plan={b.dental} type="dental" />}
              </>
            }
            {b.dental && b.dental !== 'Waived' && (
              <div style={{ marginTop: 12 }}>
                <button style={S.btnSm} onClick={() => setShowDentalDetail(x => !x)}>
                  {showDentalDetail ? 'Hide Details' : 'View Coverage Details'}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Vision */}
        <div style={S.card}>
          <div style={S.cardHdr}>
            <span style={S.cardHdrTitle}>Vision Insurance</span>
            <Badge label={b.vision || 'No election'} color={planColor(b.vision)} />
          </div>
          <div style={S.cardBody}>
            {!b.vision
              ? <div style={{ fontSize: 12, color: 'var(--t-text-muted)' }}>No vision election on record.</div>
              : b.vision === 'Waived'
              ? <div style={{ fontSize: 12, color: 'var(--t-text-muted)' }}>Coverage waived.</div>
              : <>
                <DataRow label="Eye exam coverage" value={b.vision === 'VSP Plus' ? '$200' : '$150'} />
                <DataRow label="Frames/contacts allowance" value={b.vision === 'VSP Plus' ? '$200' : '$150'} />
                {showVisionDetail && <PlanDetailsCard plan={b.vision} type="vision" />}
              </>
            }
            {b.vision && b.vision !== 'Waived' && (
              <div style={{ marginTop: 12 }}>
                <button style={S.btnSm} onClick={() => setShowVisionDetail(x => !x)}>
                  {showVisionDetail ? 'Hide Details' : 'View Coverage Details'}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* 401k */}
        <div style={S.card}>
          <div style={S.cardHdr}>
            <span style={S.cardHdrTitle}>401(k) Retirement</span>
            <Badge label={`${b.contrib}% contribution`} color="#2ad6a0" />
          </div>
          <div style={S.cardBody}>
            <DataRow label="Your contribution rate" value={`${b.contrib}%`} valueColor="#2ad6a0" />
            <DataRow label="Employer match" value="50% up to 4% of salary" valueColor="#00e5ff" />
            <DataRow label="Vesting" value="3-year graded vesting" />
            {showContribEdit && (
              <div style={{ marginTop: 12, padding: 12, background: 'rgba(42,214,160,0.05)', border: '1px solid rgba(42,214,160,0.2)' }}>
                <label style={S.label}>New contribution rate: {contribDraft}%</label>
                <input type="range" min={0} max={10} value={contribDraft} style={{ width: '100%', marginBottom: 8 }} onChange={e => setContribDraft(Number(e.target.value))} />
                <div style={{ fontSize: 11, color: 'var(--t-text-muted)', marginBottom: 10 }}>
                  At {contribDraft}%: approx {fmt(monthlyContribEst)}/month (est. at full-time)
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button style={{ ...S.btnPrimary, opacity: savingContrib ? 0.6 : 1 }} disabled={savingContrib} onClick={saveContribution}>{savingContrib ? 'Saving…' : 'Save'}</button>
                  <button style={S.btnGhost} disabled={savingContrib} onClick={() => setShowContribEdit(false)}>Cancel</button>
                </div>
              </div>
            )}
            {!showContribEdit && (
              <button style={{ ...S.btnSm, marginTop: 12 }} onClick={() => { setContribDraft(b.contrib); setShowContribEdit(true) }}>Change Contribution</button>
            )}
          </div>
        </div>

      </div>

      {/* CT Paid Leave */}
      <div style={{ ...S.card, marginTop: 14 }}>
        <div style={S.cardHdr}>
          <span style={S.cardHdrTitle}>CT Paid Leave (CT P.A. 19-25)</span>
          {lv
            ? <Badge label={`${leaveRemaining}h remaining`} color={leaveRemaining > 20 ? '#2ad6a0' : leaveRemaining >= 5 ? '#ffb800' : '#ff4d7d'} />
            : <Badge label="No balance on record" color="#6b7a90" />}
        </div>
        <div style={S.cardBody}>
          {!lv ? (
            <div style={{ fontSize: 12, color: 'var(--t-text-muted)' }}>
              No CT paid-leave balance has been recorded for your account yet. Balances accrue at 1 hour per 30 hours worked (CT P.A. 19-25).
            </div>
          ) : (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1, background: 'var(--t-line)', border: '1px solid var(--t-line)', marginBottom: 14 }}>
                {[
                  { label: 'Accrued', val: `${leaveAccrued}h`, color: '#00e5ff' },
                  { label: 'Used', val: `${leaveUsed}h`, color: '#ff4d7d' },
                  { label: 'Remaining', val: `${leaveRemaining}h`, color: leaveRemaining > 20 ? '#2ad6a0' : leaveRemaining >= 5 ? '#ffb800' : '#ff4d7d' },
                ].map(k => (
                  <div key={k.label} style={{ background: 'var(--t-surface)', padding: '12px 16px' }}>
                    <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--t-text-muted)', marginBottom: 6 }}>{k.label}</div>
                    <div style={{ fontSize: 20, fontWeight: 800, color: k.color }}>{k.val}</div>
                  </div>
                ))}
              </div>
              <DataRow label="Accrual rate" value={`1 hour per 30 hours worked (CT P.A. 19-25)`} />
              <DataRow label="Annual cap" value={`${config.paid_leave_accrual_hours} hours`} />
              {lv.last_used_date && <DataRow label="Last used" value={new Date(lv.last_used_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} />}
            </>
          )}
          <div style={{ marginTop: 12 }}>
            <a href="#requests" style={{ ...S.btnGhost, display: 'inline-block', textDecoration: 'none', textAlign: 'center' }}>Request Leave</a>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── TAB 2: OPEN ENROLLMENT ────────────────────────────────────────────────────
function TabOpenEnrollment({ person, myData, reload, toast }) {
  const enr = myData?.enrollment || null
  const b = {
    health: enr?.health_plan || 'Waived',
    dental: enr?.dental_plan || 'Waived',
    vision: enr?.vision_plan || 'Waived',
    coverage: enr?.coverage_type || 'Employee Only',
    contrib: enr?.contrib_pct ?? 0,
  }
  const enrollOpen = isEnrollmentOpen()
  const [showWizard, setShowWizard] = useState(false)

  return (
    <div>
      {showWizard && (
        <EnrollmentWizard
          person={person}
          currentBenefits={b}
          savedDraft={myData?.draft}
          onClose={() => setShowWizard(false)}
          onSaved={reload}
          toast={toast}
        />
      )}

      <div style={{ ...S.alertBox(enrollOpen ? '255,184,0' : '0,229,255') }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: enrollOpen ? '#ffb800' : '#00e5ff', marginBottom: 4 }}>
          {enrollOpen ? 'OPEN ENROLLMENT IS NOW OPEN — Aug 1–31, 2026' : 'NEXT OPEN ENROLLMENT — Aug 1–31, 2026'}
        </div>
        <div style={{ fontSize: 11, color: 'var(--t-text-muted)' }}>
          {enrollOpen
            ? 'Make changes before the deadline. New elections take effect Jan 1, 2027.'
            : 'Enrollment opens August 1st. Plan changes must be submitted by Aug 31.'}
        </div>
      </div>

      <div style={{ ...S.card }}>
        <div style={S.cardHdr}>
          <span style={S.cardHdrTitle}>Enrollment Wizard</span>
          <Badge label={enrollOpen ? 'Open' : 'Closed'} color={enrollOpen ? '#2ad6a0' : '#6b7a90'} />
        </div>
        <div style={S.cardBody}>
          <div style={{ fontSize: 13, color: 'var(--t-text-muted)', marginBottom: 16, lineHeight: 1.6 }}>
            The 5-step wizard walks you through Health, Dental & Vision, 401k, and Beneficiary elections.
            You can save a draft at any step and return later.
          </div>
          {myData?.draft && (
            <div style={{ ...S.infoBox, marginBottom: 16 }}>
              <div style={{ fontSize: 11, color: '#00e5ff' }}>You have a saved draft in progress — reopening the wizard will restore it.</div>
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 1, background: 'var(--t-line)', border: '1px solid var(--t-line)', marginBottom: 16 }}>
            {['Health Plan', 'Dental & Vision', '401k', 'Beneficiaries', 'Review'].map((s, i) => (
              <div key={s} style={{ background: 'var(--t-surface)', padding: '10px 8px', textAlign: 'center' }}>
                <div style={{ fontSize: 16, fontWeight: 800, color: '#00e5ff', marginBottom: 4 }}>{i + 1}</div>
                <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--t-text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>{s}</div>
              </div>
            ))}
          </div>
          <button style={{ ...S.btnPrimary, opacity: enrollOpen ? 1 : 0.5, cursor: enrollOpen ? 'pointer' : 'not-allowed' }}
            onClick={() => enrollOpen ? setShowWizard(true) : toast('Enrollment window is not currently open.', 'error')}>
            {enrollOpen ? 'Start Enrollment Wizard' : 'Enrollment Not Open'}
          </button>
        </div>
      </div>

      <div style={S.infoBox}>
        <div style={{ fontSize: 10, fontWeight: 700, color: '#00e5ff', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>Qualifying Life Events</div>
        <div style={{ fontSize: 12, color: 'var(--t-text-muted)', lineHeight: 1.7 }}>
          Outside of open enrollment, you may change elections within 30 days of a qualifying life event: marriage, divorce, birth/adoption of a child, loss of other coverage, or change in employment status.<br />
          Contact HR at <strong style={{ color: 'var(--t-text)' }}>hr@vip.com</strong> to initiate a mid-year change.
        </div>
      </div>
    </div>
  )
}

// ── TAB 3: BENEFITS SUMMARY (managers) ───────────────────────────────────────
function TabBenefitsSummary({ rows, loading, err, reload, locations }) {
  const [fLoc, setFLoc] = useState('')
  const [fPlan, setFPlan] = useState('')
  const [fStatus, setFStatus] = useState('')
  const [sortCol, setSortCol] = useState('name')
  const [sortDir, setSortDir] = useState(1)

  const now = new Date()
  const deadlinePassed = now > OPEN_ENROLLMENT_END
  const missingDecision = rows.filter(e => e.status === 'PENDING' || e.status === 'NOT ENROLLED')

  const filtered = useMemo(() => {
    return rows
      .filter(e => {
        if (fLoc && e.location !== fLoc) return false
        if (fPlan && e.health !== fPlan) return false
        if (fStatus && e.status !== fStatus) return false
        return true
      })
      .sort((a, b) => {
        const vals = {
          name: [a.full_name, b.full_name],
          loc: [a.location || '', b.location || ''],
          health: [a.health || '', b.health || ''],
          contrib: [a.contrib || 0, b.contrib || 0],
          leave: [a.leave_remaining || 0, b.leave_remaining || 0],
          status: [a.status || '', b.status || ''],
        }
        const [va, vb] = vals[sortCol] || [a.full_name, b.full_name]
        return typeof va === 'number' ? (va - vb) * sortDir : String(va).localeCompare(String(vb)) * sortDir
      })
  }, [rows, fLoc, fPlan, fStatus, sortCol, sortDir])

  function toggleSort(col) {
    if (sortCol === col) setSortDir(d => -d)
    else { setSortCol(col); setSortDir(1) }
  }

  const thSort = (col, label) => (
    <th style={{ ...S.th, cursor: 'pointer' }} onClick={() => toggleSort(col)}>
      {label} {sortCol === col ? (sortDir === 1 ? '▲' : '▼') : ''}
    </th>
  )

  function exportCSV() {
    const cols = ['Employee', 'Location', 'Role', 'Health Plan', 'Dental', 'Vision', '401k%', 'CT Leave Balance', 'Status']
    const body = filtered.map(r => [
      `"${r.full_name}"`, `"${r.location || ''}"`, `"${r.role || ''}"`,
      r.health || '—', r.dental || '—', r.vision || '—',
      (r.contrib || 0) + '%', (r.leave_remaining || 0) + 'h', r.status,
    ].join(','))
    downloadCSV(cols, body, `benefits-summary-${new Date().toISOString().slice(0, 10)}.csv`)
  }

  if (loading) return <Spinner />
  if (err) return <ErrorState msg={err} onRetry={reload} />

  return (
    <div>
      {deadlinePassed && missingDecision.length > 0 && (
        <div style={{ ...S.alertBox('255,77,125') }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#ff4d7d', marginBottom: 4 }}>COMPLIANCE ALERT — {missingDecision.length} EMPLOYEES MISSING ENROLLMENT DECISION</div>
          <div style={{ fontSize: 11, color: 'var(--t-text-muted)' }}>The enrollment deadline has passed. The following employees have no active elections: {missingDecision.map(e => e.full_name).join(', ')}.</div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <select style={{ ...S.select, width: 140 }} value={fLoc} onChange={e => setFLoc(e.target.value)}>
          <option value="">All Locations</option>
          {locations.map(l => <option key={l.id} value={l.name}>{l.name}</option>)}
        </select>
        <select style={{ ...S.select, width: 150 }} value={fPlan} onChange={e => setFPlan(e.target.value)}>
          <option value="">All Health Plans</option>
          {HEALTH_PLANS.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        <select style={{ ...S.select, width: 140 }} value={fStatus} onChange={e => setFStatus(e.target.value)}>
          <option value="">All Status</option>
          {['ENROLLED', 'WAIVED', 'PENDING', 'NOT ENROLLED'].map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        {(fLoc || fPlan || fStatus) && <button style={S.btnSm} onClick={() => { setFLoc(''); setFPlan(''); setFStatus('') }}>Clear</button>}
        <button style={{ ...S.btnGhost, marginLeft: 'auto' }} onClick={exportCSV} disabled={!filtered.length}>Export CSV</button>
        <span style={{ fontSize: 11, color: 'var(--t-text-faint)' }}>{filtered.length} employees</span>
      </div>

      {rows.length === 0 ? (
        <div style={S.empty}>No employees in your scope yet. Benefit elections will appear here as staff enroll.</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={S.table}>
            <thead>
              <tr>
                {thSort('name', 'Employee')}
                {thSort('loc', 'Location')}
                <th style={S.th}>Role</th>
                {thSort('health', 'Health Plan')}
                <th style={S.th}>Dental</th>
                <th style={S.th}>Vision</th>
                {thSort('contrib', '401k%')}
                {thSort('leave', 'CT Leave Bal.')}
                {thSort('status', 'Status')}
              </tr>
            </thead>
            <tbody>
              {filtered.map(e => (
                <tr key={e.person_id}>
                  <td style={{ ...S.td, fontWeight: 600 }}>{e.full_name}</td>
                  <td style={S.td}>{e.location || '—'}</td>
                  <td style={{ ...S.td, color: 'var(--t-text-muted)' }}>{e.role || '—'}</td>
                  <td style={S.td}><Badge label={e.health || 'No election'} color={planColor(e.health)} /></td>
                  <td style={S.td}><Badge label={e.dental || 'No election'} color={planColor(e.dental)} /></td>
                  <td style={S.td}><Badge label={e.vision || 'No election'} color={planColor(e.vision)} /></td>
                  <td style={{ ...S.td, textAlign: 'center', fontWeight: 700, color: e.contrib > 0 ? '#2ad6a0' : 'var(--t-text-faint)' }}>{e.contrib || 0}%</td>
                  <td style={{ ...S.td, textAlign: 'center', fontWeight: 700, color: e.leave_remaining > 20 ? '#2ad6a0' : e.leave_remaining >= 5 ? '#ffb800' : '#ff4d7d' }}>{e.leave_remaining || 0}h</td>
                  <td style={S.td}><Badge label={e.status} color={statusColor(e.status)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── TAB 4: CT PAID LEAVE TRACKER (managers) ───────────────────────────────────
function TabPaidLeave({ config, rows, loading, err, reload, locations }) {
  const [fLoc, setFLoc] = useState('')
  const [sortCol, setSortCol] = useState('name')
  const [sortDir, setSortDir] = useState(1)

  const filtered = useMemo(() => {
    return rows
      .filter(e => !fLoc || e.location === fLoc)
      .sort((a, b) => {
        const vals = {
          name: [a.full_name, b.full_name],
          loc: [a.location || '', b.location || ''],
          accrued: [a.accrued || 0, b.accrued || 0],
          used: [a.used || 0, b.used || 0],
          remaining: [a.remaining || 0, b.remaining || 0],
          ytdHours: [a.ytd_hours || 0, b.ytd_hours || 0],
        }
        const [va, vb] = vals[sortCol] || [a.full_name, b.full_name]
        return typeof va === 'number' ? (va - vb) * sortDir : String(va).localeCompare(String(vb)) * sortDir
      })
  }, [rows, fLoc, sortCol, sortDir])

  function toggleSort(col) {
    if (sortCol === col) setSortDir(d => -d)
    else { setSortCol(col); setSortDir(1) }
  }

  const thSort = (col, label) => (
    <th style={{ ...S.th, cursor: 'pointer' }} onClick={() => toggleSort(col)}>
      {label} {sortCol === col ? (sortDir === 1 ? '▲' : '▼') : ''}
    </th>
  )

  const totalAccrued = filtered.reduce((s, e) => s + Number(e.accrued || 0), 0)
  const totalUsed = filtered.reduce((s, e) => s + Number(e.used || 0), 0)
  const lowBalance = filtered.filter(e => Number(e.remaining || 0) < 5).length

  function exportCSV() {
    const cols = ['Employee', 'Location', 'Role', 'Accrued (h)', 'Used (h)', 'Remaining (h)', 'YTD Hours Worked', 'Accrual Rate']
    const body = filtered.map(r => [
      `"${r.full_name}"`, `"${r.location || ''}"`, `"${r.role || ''}"`,
      r.accrued || 0, r.used || 0, r.remaining || 0, r.ytd_hours || 0, '1h/30h worked',
    ].join(','))
    downloadCSV(cols, body, `ct-paid-leave-${new Date().toISOString().slice(0, 10)}.csv`)
  }

  if (loading) return <Spinner />
  if (err) return <ErrorState msg={err} onRetry={reload} />

  return (
    <div>
      <div style={S.infoBox}>
        <div style={{ fontSize: 10, fontWeight: 700, color: '#00e5ff', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>CT Paid Sick Leave — P.A. 19-25 Summary</div>
        <div style={{ fontSize: 12, color: 'var(--t-text-muted)', lineHeight: 1.7 }}>
          Under CT P.A. 19-25, employees accrue <strong style={{ color: 'var(--t-text)' }}>1 hour of paid sick leave for every 30 hours worked</strong>, up to{' '}
          <strong style={{ color: 'var(--t-text)' }}>{config.paid_leave_accrual_hours} hours/year</strong>.
          Massachusetts Earned Sick Time (M.G.L. c.149 §148C) and PFML (c.175M). Leave may be used for employee illness, care for a family member, or safe leave.
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1, background: 'var(--t-line)', border: '1px solid var(--t-line)', marginBottom: 16 }}>
        {[
          { label: 'Total Accrued (all staff)', val: `${totalAccrued}h`, color: '#00e5ff' },
          { label: 'Total Used YTD', val: `${totalUsed}h`, color: '#ff4d7d' },
          { label: 'Low Balance (<5h)', val: lowBalance, color: lowBalance > 0 ? '#ffb800' : '#2ad6a0' },
        ].map(k => (
          <div key={k.label} style={{ background: 'var(--t-surface)', padding: '14px 18px' }}>
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--t-text-muted)', marginBottom: 6 }}>{k.label}</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: k.color, lineHeight: 1 }}>{k.val}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, alignItems: 'center' }}>
        <select style={{ ...S.select, width: 150 }} value={fLoc} onChange={e => setFLoc(e.target.value)}>
          <option value="">All Locations</option>
          {locations.map(l => <option key={l.id} value={l.name}>{l.name}</option>)}
        </select>
        {fLoc && <button style={S.btnSm} onClick={() => setFLoc('')}>Clear</button>}
        <button style={{ ...S.btnGhost, marginLeft: 'auto' }} onClick={exportCSV} disabled={!filtered.length}>Export CSV</button>
        <span style={{ fontSize: 11, color: 'var(--t-text-faint)' }}>{filtered.length} employees</span>
      </div>

      {rows.length === 0 ? (
        <div style={S.empty}>No CT paid-leave balances recorded for your scope yet.</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={S.table}>
            <thead>
              <tr>
                {thSort('name', 'Employee')}
                {thSort('loc', 'Location')}
                <th style={S.th}>Role</th>
                {thSort('accrued', 'Accrued (h)')}
                {thSort('used', 'Used (h)')}
                {thSort('remaining', 'Remaining (h)')}
                <th style={S.th}>Last Used</th>
                {thSort('ytdHours', 'YTD Hrs Worked')}
                <th style={S.th}>Accrual Rate</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(e => {
                const remColor = e.remaining > 20 ? '#2ad6a0' : e.remaining >= 5 ? '#ffb800' : '#ff4d7d'
                return (
                  <tr key={e.person_id}>
                    <td style={{ ...S.td, fontWeight: 600 }}>{e.full_name}</td>
                    <td style={S.td}>{e.location || '—'}</td>
                    <td style={{ ...S.td, color: 'var(--t-text-muted)' }}>{e.role || '—'}</td>
                    <td style={{ ...S.td, textAlign: 'center', color: '#00e5ff', fontWeight: 700 }}>{e.accrued || 0}h</td>
                    <td style={{ ...S.td, textAlign: 'center', color: '#ff4d7d', fontWeight: 700 }}>{e.used || 0}h</td>
                    <td style={{ ...S.td, textAlign: 'center', fontWeight: 800, color: remColor }}>{e.remaining || 0}h</td>
                    <td style={{ ...S.td, color: 'var(--t-text-muted)' }}>
                      {e.last_used ? new Date(e.last_used).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                    </td>
                    <td style={{ ...S.td, textAlign: 'center', color: 'var(--t-text-muted)' }}>{e.ytd_hours || 0}h</td>
                    <td style={{ ...S.td, color: 'var(--t-text-faint)', fontSize: 11 }}>1h / 30h worked</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── MAIN ──────────────────────────────────────────────────────────────────────
export default function Benefits() {
  const flagEnabled = useFeatureFlag('benefits_admin')
  const { session } = useAuth()
  const config = useConfig()
  const { show: toast, ToastEl } = useToast()
  const paidLeaveEnabled = useFeatureFlag('paid_leave')
  const { locationIds, locations } = useScope()

  const roleName = (session?.person?.role_name || '').toLowerCase()
  const isManager = ['ceo', 'hr', 'manager', 'coo', 'admin', 'owner'].some(r => roleName.includes(r))

  const sessionPerson = session?.person
  const person = {
    id: sessionPerson?.id || null,
    name: sessionPerson?.full_name || 'You',
    role: sessionPerson?.role_name || '',
  }

  // ── My benefits (all users) ──
  const [myData, setMyData] = useState(null)
  const [myLoading, setMyLoading] = useState(true)
  const [myErr, setMyErr] = useState(null)

  const loadMy = useCallback(async () => {
    if (!person.id) { setMyLoading(false); setMyData({ enrollment: null, beneficiaries: [], leave: null, draft: null }); return }
    setMyLoading(true); setMyErr(null)
    try {
      const { data, error } = await sb.rpc('benefits_my_summary', { p_person_id: person.id })
      if (error) throw error
      setMyData(data || { enrollment: null, beneficiaries: [], leave: null, draft: null })
    } catch (e) {
      setMyErr(e.message || 'Failed to load your benefits.')
      setMyData(null)
    } finally { setMyLoading(false) }
  }, [person.id])

  // ── Manager roll-ups ──
  const [mgrRows, setMgrRows] = useState([])
  const [leaveRows, setLeaveRows] = useState([])
  const [mgrLoading, setMgrLoading] = useState(true)
  const [mgrErr, setMgrErr] = useState(null)

  const loadMgr = useCallback(async () => {
    if (!isManager) { setMgrLoading(false); return }
    if (!locationIds.length) { setMgrLoading(false); setMgrRows([]); setLeaveRows([]); return }
    setMgrLoading(true); setMgrErr(null)
    try {
      const [s, l] = await Promise.all([
        sb.rpc('benefits_summary', { p_node_ids: locationIds }),
        sb.rpc('benefits_leave_summary', { p_node_ids: locationIds }),
      ])
      if (s.error) throw s.error
      if (l.error) throw l.error
      setMgrRows(Array.isArray(s.data) ? s.data : [])
      setLeaveRows(Array.isArray(l.data) ? l.data : [])
    } catch (e) {
      setMgrErr(e.message || 'Failed to load benefits roll-up.')
      setMgrRows([]); setLeaveRows([])
    } finally { setMgrLoading(false) }
  }, [isManager, locationIds.join(',')]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadMy() }, [loadMy])
  useEffect(() => { loadMgr() }, [loadMgr])

  const [tab, setTab] = useState('my')

  if (!flagEnabled) return <FeatureDisabled name="Benefits Administration" />

  const enr = myData?.enrollment || null
  const lv = myData?.leave || null
  const myLeaveRemaining = Number(lv?.accrued_hours ?? 0) - Number(lv?.used_hours ?? 0)
  const enrollOpen = isEnrollmentOpen()
  const enrollEndsSoon = enrollmentWithin30Days()

  // Manager KPIs from live roll-up
  const totalEmp = mgrRows.length
  const enrolledHealth = mgrRows.filter(e => e.health && e.health !== 'Waived').length
  const enrolled401k = mgrRows.filter(e => (e.contrib || 0) > 0).length
  const totalLeave = leaveRows.reduce((s, e) => s + Number(e.remaining || 0), 0)

  const TABS = [
    { id: 'my', label: 'My Benefits' },
    { id: 'enrollment', label: 'Open Enrollment' },
    ...(isManager ? [
      { id: 'summary', label: 'Benefits Summary' },
      ...(paidLeaveEnabled ? [{ id: 'leave', label: 'CT Paid Leave Tracker' }] : []),
    ] : []),
  ]

  return (
    <div style={S.page}>
      <div style={S.hdr}>
        <div>
          <div style={S.hdrTitle}>BENEFITS ADMINISTRATION</div>
          <div style={S.hdrSub}>Health, dental, retirement and Massachusetts leave — Twisted Growers</div>
        </div>
        {enrollOpen && <button style={S.btnPrimary} onClick={() => setTab('enrollment')}>Open Enrollment Active</button>}
      </div>

      <div style={S.body}>
        {/* KPI strip */}
        <div style={S.kpiStrip}>
          {isManager ? (
            <>
              <div style={S.kpiCell}>
                <div style={S.kpiLabel}>Enrolled in Health</div>
                <div style={S.kpiVal('#2ad6a0')}>{enrolledHealth}/{totalEmp}</div>
                <div style={S.kpiSub}>employees covered</div>
              </div>
              <div style={S.kpiCell}>
                <div style={S.kpiLabel}>401k Participants</div>
                <div style={S.kpiVal('#ffb800')}>{enrolled401k}/{totalEmp}</div>
                <div style={S.kpiSub}>contributing</div>
              </div>
              <div style={S.kpiCell}>
                <div style={S.kpiLabel}>CT Leave Balance (total)</div>
                <div style={S.kpiVal('#00e5ff')}>{totalLeave}h</div>
                <div style={S.kpiSub}>across all employees</div>
              </div>
              <div style={S.kpiCell}>
                <div style={S.kpiLabel}>Open Enrollment Ends</div>
                <div style={S.kpiVal(enrollEndsSoon ? '#ffb800' : 'var(--t-text)')}>Aug 31, 2026</div>
                <div style={S.kpiSub}>{enrollOpen ? 'enrollment open now' : 'not currently open'}</div>
              </div>
            </>
          ) : (
            <>
              <div style={S.kpiCell}>
                <div style={S.kpiLabel}>My Health Plan</div>
                <div style={S.kpiVal(planColor(enr?.health_plan))}>{enr?.health_plan || 'No election'}</div>
                <div style={S.kpiSub}>{enr?.coverage_type || '—'}</div>
              </div>
              <div style={S.kpiCell}>
                <div style={S.kpiLabel}>My 401k Rate</div>
                <div style={S.kpiVal('#2ad6a0')}>{enr?.contrib_pct ?? 0}%</div>
                <div style={S.kpiSub}>contribution rate</div>
              </div>
              <div style={S.kpiCell}>
                <div style={S.kpiLabel}>CT Paid Leave Balance</div>
                <div style={S.kpiVal(myLeaveRemaining > 20 ? '#2ad6a0' : '#ffb800')}>{lv ? `${myLeaveRemaining}h` : '—'}</div>
                <div style={S.kpiSub}>of {config.paid_leave_accrual_hours}h annual cap</div>
              </div>
              <div style={S.kpiCell}>
                <div style={S.kpiLabel}>Next Benefit Change Window</div>
                <div style={S.kpiVal(enrollEndsSoon ? '#ffb800' : 'var(--t-text-muted)', 14)}>Aug 1–31</div>
                <div style={S.kpiSub}>Open Enrollment 2026</div>
              </div>
            </>
          )}
        </div>

        {/* Tabs */}
        <div style={S.tabRow}>
          {TABS.map(t => (
            <button key={t.id} style={S.tabBtn(tab === t.id)} onClick={() => setTab(t.id)}>{t.label}</button>
          ))}
        </div>

        {tab === 'my' && (
          myLoading ? <Spinner />
          : myErr ? <ErrorState msg={myErr} onRetry={loadMy} />
          : <TabMyBenefits person={person} config={config} myData={myData} reload={loadMy} toast={toast} />
        )}
        {tab === 'enrollment' && (
          myLoading ? <Spinner />
          : myErr ? <ErrorState msg={myErr} onRetry={loadMy} />
          : <TabOpenEnrollment person={person} myData={myData} reload={loadMy} toast={toast} />
        )}
        {tab === 'summary' && isManager && (
          <TabBenefitsSummary rows={mgrRows} loading={mgrLoading} err={mgrErr} reload={loadMgr} locations={locations} />
        )}
        {tab === 'leave' && isManager && paidLeaveEnabled && (
          <TabPaidLeave config={config} rows={leaveRows} loading={mgrLoading} err={mgrErr} reload={loadMgr} locations={locations} />
        )}
      </div>

      <ToastEl />
    </div>
  )
}
