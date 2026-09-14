import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { useAuth } from '../lib/auth.jsx'
import { useFeatureFlag } from '../lib/featureFlags.js'
import { useConfig } from '../lib/config.js'
import { sb, getSession } from '../lib/supabase'
import DrillDown from '../components/DrillDown.jsx'
import { getLocationNames, getSiteNames } from '../lib/locations.js'


// ── Location node ids for the signed-in user (scopes every read) ─────────────
function useNodeIds() {
  return useMemo(() => {
    const me = getSession()
    const nodes = me?.nodes || []
    const locs = nodes.filter(n => n && n.node_type === 'location')
    return (locs.length ? locs : nodes).map(n => (n && n.id) ? n.id : n).filter(Boolean)
  }, [])
}

// ── Role check ────────────────────────────────────────────────────────────────
const isHRRole = (roleName) =>
  ['ceo', 'manager', 'coo', 'admin', 'owner', 'hr'].some(r => (roleName || '').toLowerCase().includes(r))

// ── Static data ───────────────────────────────────────────────────────────────
const FULL_POLICIES = [
  { id: 1,  category: 'Handbook',   title: 'Purpose of the Employee Handbook',        version: '0.1', effective: '', ackRequired: true,  content: 'DRAFT — to be written and approved by Twisted Growers HR. Nothing here is company policy until it is published in the Handbook Builder.' },
  { id: 2,  category: 'Handbook',   title: 'Right to Revise',                          version: '0.1', effective: '', ackRequired: false, content: 'DRAFT — to be written and approved by Twisted Growers HR. Nothing here is company policy until it is published in the Handbook Builder.' },
  { id: 3,  category: 'Handbook',   title: 'Confidentiality of this Manual',           version: '0.1', effective: '', ackRequired: true,  content: 'DRAFT — to be written and approved by Twisted Growers HR. Nothing here is company policy until it is published in the Handbook Builder.' },
  { id: 4,  category: 'Onboarding', title: 'Welcome — Your First Two Weeks',           version: '0.1', effective: '', ackRequired: false, content: 'DRAFT — to be written and approved by Twisted Growers HR. Nothing here is company policy until it is published in the Handbook Builder.' },
  { id: 5,  category: 'Onboarding', title: 'Agent Registration & Badge',               version: '0.1', effective: '', ackRequired: true,  content: 'Every employee holds a CCC agent registration and wears the badge on shift (935 CMR 500.030). DRAFT — to be written and approved by Twisted Growers HR. Nothing here is company policy until it is published in the Handbook Builder.' },
  { id: 6,  category: 'Employment', title: 'At-Will Employment',                       version: '0.1', effective: '', ackRequired: true,  content: 'DRAFT — to be written and approved by Twisted Growers HR. Nothing here is company policy until it is published in the Handbook Builder.' },
  { id: 7,  category: 'Employment', title: 'Equal Employment Opportunity',             version: '0.1', effective: '', ackRequired: true,  content: 'M.G.L. c.151B; CROWN Act. DRAFT — to be written and approved by Twisted Growers HR. Nothing here is company policy until it is published in the Handbook Builder.' },
  { id: 8,  category: 'Employment', title: 'Anti-Harassment (M.G.L. c.151B §3A)',      version: '0.1', effective: '', ackRequired: true,  content: 'Distributed annually. DRAFT — to be written and approved by Twisted Growers HR. Nothing here is company policy until it is published in the Handbook Builder.' },
  { id: 9,  category: 'Attendance', title: 'Attendance, Punctuality & Call-outs',      version: '0.1', effective: '', ackRequired: true,  content: 'DRAFT — to be written and approved by Twisted Growers HR. Nothing here is company policy until it is published in the Handbook Builder.' },
  { id: 10, category: 'Attendance', title: 'Scheduling, Swaps & Open Shifts',          version: '0.1', effective: '', ackRequired: false, content: 'DRAFT — to be written and approved by Twisted Growers HR. Nothing here is company policy until it is published in the Handbook Builder.' },
  { id: 11, category: 'Pay',        title: 'Wages, Overtime & Pay Days',               version: '0.1', effective: '', ackRequired: true,  content: 'MA minimum wage $15.00 (c.151 §1); OT 1.5× over 40 h (c.151 §1A). DRAFT — to be written and approved by Twisted Growers HR. Nothing here is company policy until it is published in the Handbook Builder.' },
  { id: 12, category: 'Pay',        title: 'Meal Breaks (M.G.L. c.149 §100)',          version: '0.1', effective: '', ackRequired: false, content: '30 minutes on shifts over six hours; two waves. DRAFT — to be written and approved by Twisted Growers HR. Nothing here is company policy until it is published in the Handbook Builder.' },
  { id: 13, category: 'Leave',      title: 'Earned Sick Time (M.G.L. c.149 §148C)',    version: '0.1', effective: '', ackRequired: true,  content: '1 hour per 30 worked, up to 40 hours a year. DRAFT — to be written and approved by Twisted Growers HR. Nothing here is company policy until it is published in the Handbook Builder.' },
  { id: 14, category: 'Leave',      title: 'Paid Family & Medical Leave (c.175M)',     version: '0.1', effective: '', ackRequired: true,  content: 'DRAFT — to be written and approved by Twisted Growers HR. Nothing here is company policy until it is published in the Handbook Builder.' },
  { id: 15, category: 'Leave',      title: 'PTO & Holidays',                           version: '0.1', effective: '', ackRequired: false, content: 'DRAFT — to be written and approved by Twisted Growers HR. Nothing here is company policy until it is published in the Handbook Builder.' },
  { id: 16, category: 'Conduct',    title: 'Drug-Free Workplace (935 CMR 500.105)',    version: '0.1', effective: '', ackRequired: true,  content: 'DRAFT — to be written and approved by Twisted Growers HR. Nothing here is company policy until it is published in the Handbook Builder.' },
  { id: 17, category: 'Conduct',    title: 'Code of Conduct',                          version: '0.1', effective: '', ackRequired: true,  content: 'DRAFT — to be written and approved by Twisted Growers HR. Nothing here is company policy until it is published in the Handbook Builder.' },
  { id: 18, category: 'Conduct',    title: 'Progressive Discipline',                   version: '0.1', effective: '', ackRequired: true,  content: 'DRAFT — to be written and approved by Twisted Growers HR. Nothing here is company policy until it is published in the Handbook Builder.' },
  { id: 19, category: 'Safety',     title: 'PPE, Rooms & Extraction Safety',           version: '0.1', effective: '', ackRequired: true,  content: 'DRAFT — to be written and approved by Twisted Growers HR. Nothing here is company policy until it is published in the Handbook Builder.' },
  { id: 20, category: 'Safety',     title: 'Injury Reporting & Workers\' Compensation', version: '0.1', effective: '', ackRequired: true,  content: 'DRAFT — to be written and approved by Twisted Growers HR. Nothing here is company policy until it is published in the Handbook Builder.' },
  { id: 21, category: 'Compliance', title: 'Metrc — Tags, Weights & Record of Truth',  version: '0.1', effective: '', ackRequired: true,  content: 'If it is not tagged, it does not exist. Metrc overrides every spreadsheet. DRAFT — to be written and approved by Twisted Growers HR. Nothing here is company policy until it is published in the Handbook Builder.' },
  { id: 22, category: 'Compliance', title: 'Diversion & Inventory Integrity',          version: '0.1', effective: '', ackRequired: true,  content: 'DRAFT — to be written and approved by Twisted Growers HR. Nothing here is company policy until it is published in the Handbook Builder.' },
  { id: 23, category: 'Compliance', title: 'Security, Access & Surveillance (935 CMR 500.110)', version: '0.1', effective: '', ackRequired: true, content: 'DRAFT — to be written and approved by Twisted Growers HR. Nothing here is company policy until it is published in the Handbook Builder.' },
  { id: 24, category: 'Compliance', title: 'Confidentiality & Data',                   version: '0.1', effective: '', ackRequired: true,  content: 'DRAFT — to be written and approved by Twisted Growers HR. Nothing here is company policy until it is published in the Handbook Builder.' },
]

const LAW_ALERTS = [
  { id: 1, title: 'MA Minimum Wage — $15.00/hr', scope: 'State', affects: 'Compensation Policy, Pay Practices', detail: 'Massachusetts minimum wage is $15.00 per hour (M.G.L. c.151 §1). Confirm every rate on file is at or above it. Verify with counsel before publishing.' },
  { id: 2, title: 'MA Earned Sick Time', scope: 'State', affects: 'Leave Policy, PTO', detail: 'Employees accrue 1 hour per 30 hours worked, up to 40 hours a year (M.G.L. c.149 §148C); poster and notice required.' },
  { id: 3, title: 'MA Paid Family & Medical Leave', scope: 'State', affects: 'Leave Policy, Payroll', detail: 'Contributions and the written notice of rights within 30 days of hire (M.G.L. c.175M).' },
  { id: 4, title: 'MA CROWN Act — Hair Discrimination Protections', scope: 'State', affects: 'Dress Code & Appearance', detail: 'Discrimination based on hair texture or protective hairstyle is prohibited (M.G.L. c.151B §4, 2022).' },
  { id: 5, title: 'CCC Agent Registration & Training', scope: 'State', affects: 'Onboarding, Training', detail: 'Every marijuana establishment agent must be registered with the Cannabis Control Commission and complete the required annual training (935 CMR 500.030, 500.105). Verify current hours with the CCC.' },
  { id: 6, title: 'MA Anti-Harassment Policy — Annual Distribution', scope: 'State', affects: 'Conduct, Handbook', detail: 'A written sexual-harassment policy must be adopted and distributed to every employee annually (M.G.L. c.151B §3A).' },
  { id: 7, title: 'Federal FLSA Overtime Threshold', scope: 'Federal', affects: 'Overtime Policy, Pay Practices', detail: 'Review salaried exempt classifications against the current DOL salary threshold.' },
  { id: 8, title: 'Federal Pregnant Workers Fairness Act', scope: 'Federal', affects: 'Leave Policy, EEO', detail: 'EEOC regulations require reasonable accommodation for pregnancy, childbirth and related conditions.' },
]

const ROLES = ['Admin/Owner', 'CEO', 'CFO', 'HR Manager', 'Department Head', 'Lead', 'Associate']

const DC_FEATURES = [
  { id: 'dashboard',     label: 'Dashboard',             category: 'Pages' },
  { id: 'scheduling',    label: 'Scheduling',            category: 'Pages' },
  { id: 'attendance',    label: 'Attendance',            category: 'Pages' },
  { id: 'training',      label: 'Training',              category: 'Pages' },
  { id: 'disciplinary',  label: 'Disciplinary Actions',  category: 'Pages' },
  { id: 'performance',   label: 'Performance Reviews',   category: 'Pages' },
  { id: 'payroll',       label: 'Payroll Hours',         category: 'Pages' },
  { id: 'reporting',     label: 'Reports & Export',      category: 'Pages' },
  { id: 'void-tracker',  label: 'Void Tracker',          category: 'Pages' },
  { id: 'documents',     label: 'Document Manager',      category: 'Pages' },
  { id: 'handbook',      label: 'Handbook Builder',      category: 'Pages' },
  { id: 'ai-training',   label: 'AI Power Sessions',     category: 'AI Features' },
  { id: 'ai-design',     label: 'AI Design Assistant',   category: 'AI Features' },
  { id: 'ai-reports',    label: 'AI Report Generation',  category: 'AI Features' },
  { id: 'approve-pto',   label: 'Approve PTO',           category: 'Actions' },
  { id: 'issue-da',      label: 'Issue Disciplinary Action', category: 'Actions' },
  { id: 'edit-schedule', label: 'Edit Schedule',         category: 'Actions' },
  { id: 'fix-timecards', label: 'Fix Time Cards',        category: 'Actions' },
  { id: 'delete-msgs',   label: 'Delete Messages',       category: 'Actions' },
  { id: 'user-mgmt',     label: 'User Management',       category: 'Actions' },
  { id: 'demo-mode',     label: 'Demo/Training Mode',    category: 'Actions' },
]

// ── Default handbook design (used until an admin saves one) ──────────────────
const DEFAULT_DESIGN = {
  companyName: 'Twisted Growers',
  tagline: 'Employee Handbook 2026',
  logo: null,
  gradColors: ['#1e1b4b', '#7c3aed', '#c4b5fd'],
  coverTextDark: false,
  autoToc: true,
  showPageNumbers: true,
  tocStyle: 'numbered',
  bodyFont: "'Inter', sans-serif",
  headingFont: "'Inter', sans-serif",
  fontSize: 14,
  primaryColor: '#7c3aed',
  secondaryColor: '#e5e7eb',
}

// Fetch the single working handbook config document (design/content/access/publish).
async function loadDoc() {
  const { data, error } = await sb.rpc('handbook_get_document')
  if (error) throw error
  return data || { exists: false }
}

const fmtDate = (v) => {
  if (!v) return '—'
  try { return new Date(v).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) }
  catch { return '—' }
}

// ── Styles ────────────────────────────────────────────────────────────────────
const S = {
  page:      { padding: '24px', background: 'var(--t-bg)', minHeight: '100vh' },
  header:    { marginBottom: 24 },
  title:     { fontSize: 22, fontWeight: 800, color: 'var(--t-text)', letterSpacing: 1, textTransform: 'uppercase' },
  sub:       { fontSize: 12, color: 'var(--t-text-muted)', marginTop: 4 },
  kpiRow:    { display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' },
  kpi:       { background: 'var(--t-surface)', border: '1px solid var(--t-line)', padding: '12px 20px', flex: 1, minWidth: 140, borderRadius: 0 },
  kpiVal:    { fontSize: 26, fontWeight: 800, color: 'var(--t-accent)' },
  kpiLabel:  { fontSize: 11, color: 'var(--t-text-muted)', textTransform: 'uppercase', letterSpacing: 0.8 },
  tabs:      { display: 'flex', borderBottom: '1px solid var(--t-line)', marginBottom: 20, gap: 0, flexWrap: 'wrap' },
  card:      { background: 'var(--t-surface)', border: '1px solid var(--t-line)', marginBottom: 16, borderRadius: 0 },
  cardHeader: { padding: '12px 16px', borderBottom: '1px solid var(--t-line)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: { fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.8, color: 'var(--t-text-muted)' },
  cardBody:  { padding: 16 },
  label:     { fontSize: 11, color: 'var(--t-text-muted)', textTransform: 'uppercase', letterSpacing: 0.6, display: 'block', marginBottom: 4, marginTop: 12 },
  input:     { background: 'var(--t-surface-2)', border: '1px solid var(--t-line)', color: 'var(--t-text)', padding: '7px 10px', fontSize: 13, width: '100%', borderRadius: 0, outline: 'none', boxSizing: 'border-box' },
  btn:       { background: 'var(--t-accent)', color: '#000', border: 'none', padding: '8px 16px', fontSize: 12, fontWeight: 700, cursor: 'pointer', borderRadius: 0, textTransform: 'uppercase', letterSpacing: 0.6 },
  btnGhost:  { background: 'transparent', color: 'var(--t-text-muted)', border: '1px solid var(--t-line)', padding: '7px 14px', fontSize: 12, cursor: 'pointer', borderRadius: 0 },
  btnDanger: { background: 'var(--t-danger)', color: '#fff', border: 'none', padding: '7px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer', borderRadius: 0 },
  btnAmber:  { background: '#f59e0b', color: '#000', border: 'none', padding: '7px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer', borderRadius: 0 },
  btnSm:     { background: 'transparent', color: 'var(--t-text-muted)', border: '1px solid var(--t-line)', padding: '4px 8px', fontSize: 11, cursor: 'pointer', borderRadius: 0 },
  row:       { display: 'flex', alignItems: 'center', gap: 8 },
  table:     { width: '100%', borderCollapse: 'collapse', fontSize: 12 },
  th:        { padding: '8px 12px', textAlign: 'left', borderBottom: '1px solid var(--t-line)', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--t-text-muted)', letterSpacing: 0.6 },
  td:        { padding: '8px 12px', borderBottom: '1px solid var(--t-line)', color: 'var(--t-text)', verticalAlign: 'middle' },
  select:    { background: 'var(--t-surface-2)', border: '1px solid var(--t-line)', color: 'var(--t-text)', padding: '7px 10px', fontSize: 13, borderRadius: 0, outline: 'none', width: '100%' },
  textarea:  { background: 'var(--t-surface-2)', border: '1px solid var(--t-line)', color: 'var(--t-text)', padding: '8px 10px', fontSize: 13, borderRadius: 0, outline: 'none', resize: 'vertical', width: '100%', boxSizing: 'border-box' },
  badge:     (c) => ({ fontSize: 10, fontWeight: 700, padding: '2px 7px', letterSpacing: 0.6, textTransform: 'uppercase', borderRadius: 0, background: c === 'green' ? 'rgba(34,197,94,0.15)' : c === 'red' ? 'rgba(239,68,68,0.15)' : c === 'amber' ? 'rgba(245,158,11,0.15)' : c === 'blue' ? 'rgba(59,130,246,0.15)' : 'rgba(148,163,184,0.15)', color: c === 'green' ? '#22c55e' : c === 'red' ? '#ef4444' : c === 'amber' ? '#f59e0b' : c === 'blue' ? '#3b82f6' : '#94a3b8' }),
}

function TabBtn({ label, active, onClick }) {
  return (
    <button onClick={onClick} style={{ padding: '10px 18px', cursor: 'pointer', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.8, color: active ? 'var(--t-accent)' : 'var(--t-text-muted)', background: 'none', border: 'none', borderBottom: active ? '2px solid var(--t-accent)' : '2px solid transparent', borderRadius: 0 }}>
      {label}
    </button>
  )
}

function KTile({ label, value, sub, color, alert, onClick }) {
  return (
    <div onClick={onClick} title={onClick ? 'Click to drill into records' : undefined} style={{ ...S.kpi, border: `1px solid ${alert === 'red' ? 'var(--t-danger)' : alert === 'amber' ? '#f59e0b' : 'var(--t-line)'}`, position: 'relative', overflow: 'hidden', cursor: onClick ? 'pointer' : 'default' }}>
      {alert === 'red' && <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'var(--t-danger)' }} />}
      {alert === 'amber' && <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: '#f59e0b' }} />}
      <div style={S.kpiLabel}>{label}</div>
      <div style={{ ...S.kpiVal, color: color || 'var(--t-accent)' }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--t-text-muted)', marginTop: 2 }}>{sub}</div>}
    </div>
  )
}

function Toast({ msg, onDone }) {
  useEffect(() => { const t = setTimeout(onDone, 3000); return () => clearTimeout(t) }, [onDone])
  return (
    <div style={{ position: 'fixed', top: 20, right: 20, background: 'var(--t-accent)', color: '#000', padding: '12px 20px', fontWeight: 700, fontSize: 13, zIndex: 99999, borderRadius: 0, boxShadow: '0 4px 24px rgba(0,0,0,0.3)' }}>
      {msg}
    </div>
  )
}

// ── BLISS BOOK — CATEGORY COLORS ─────────────────────────────────────────────
const CAT_COLOR = {
  'Handbook':    '#4f46e5',
  'Onboarding':  '#0369a1',
  'Company':     '#0d9488',
  'Key Holder':  '#b45309',
  'Operations':  '#c2410c',
  'Culture':     '#15803d',
}

// ── BLISS BOOK — CONTENT RENDERER ────────────────────────────────────────────
function BlissContent({ text, color }) {
  if (!text) return null
  const chunks = text.split('|').map(s => s.trim()).filter(Boolean)
  return (
    <div style={{ fontSize: 13, lineHeight: 1.8, color: 'var(--t-text)' }}>
      {chunks.map((chunk, i) => {
        if (/^[●•]/.test(chunk)) return (
          <div key={i} style={{ display: 'flex', gap: 10, marginBottom: 5, paddingLeft: 2 }}>
            <span style={{ color, flexShrink: 0, fontWeight: 900, fontSize: 10, marginTop: 4 }}>▸</span>
            <span>{chunk.replace(/^[●•]\s*/, '')}</span>
          </div>
        )
        if (/^\d+\.\s/.test(chunk)) return (
          <div key={i} style={{ fontWeight: 800, fontSize: 14, color, marginTop: 18, marginBottom: 6, paddingBottom: 5, borderBottom: `1px solid ${color}22` }}>
            {chunk}
          </div>
        )
        if (/^[🚫📌🚨🚭⚠️✅]/.test(chunk)) return (
          <div key={i} style={{ background: `${color}12`, borderLeft: `3px solid ${color}`, padding: '8px 12px', marginBottom: 8, marginTop: 8, fontSize: 13 }}>
            {chunk}
          </div>
        )
        if (chunk.endsWith(':') && chunk.length < 80) return (
          <div key={i} style={{ fontWeight: 700, fontSize: 11, color, marginTop: 14, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.6 }}>
            {chunk}
          </div>
        )
        if (chunk.length < 60 && !chunk.includes(',') && !/[.!?]$/.test(chunk)) return (
          <div key={i} style={{ display: 'flex', gap: 10, marginBottom: 4, paddingLeft: 2 }}>
            <span style={{ color: `${color}88`, flexShrink: 0, fontSize: 11, marginTop: 3 }}>–</span>
            <span style={{ color: 'var(--t-text-muted)' }}>{chunk}</span>
          </div>
        )
        return <p key={i} style={{ marginBottom: 10, marginTop: 0 }}>{chunk}</p>
      })}
    </div>
  )
}

// ── BLISS POLICY CARD ─────────────────────────────────────────────────────────
function BlissPolicy({ policy, seqNum, read, onRead }) {
  const [expanded, setExpanded] = useState(true)
  const color = CAT_COLOR[policy.category] || '#4f46e5'
  const num = String(seqNum).padStart(2, '0')
  return (
    <div id={`policy-${policy.id}`} style={{ marginBottom: 12, border: '1px solid var(--t-line)', borderTop: `3px solid ${color}`, background: 'var(--t-surface)', position: 'relative', overflow: 'hidden' }}>
      {read && <div style={{ position: 'absolute', left: 0, top: 3, bottom: 0, width: 3, background: 'var(--t-success)' }} />}

      {/* Header */}
      <div style={{ padding: '14px 20px 12px 20px', cursor: 'pointer', display: 'flex', alignItems: 'flex-start', gap: 14 }} onClick={() => setExpanded(e => !e)}>
        <div style={{ fontSize: 26, fontWeight: 900, color: `${color}2e`, lineHeight: 1, minWidth: 38, textAlign: 'right', fontVariantNumeric: 'tabular-nums', letterSpacing: -1 }}>{num}</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1.2, color, marginBottom: 3 }}>{policy.category}</div>
          <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--t-text)', lineHeight: 1.3 }}>{policy.title}</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 5, flexShrink: 0 }}>
          {policy.ackRequired && <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 6px', background: '#f59e0b22', color: '#f59e0b', letterSpacing: 0.6, textTransform: 'uppercase' }}>SIG REQ</span>}
          {read && <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 6px', background: 'rgba(34,197,94,0.15)', color: 'var(--t-success)', letterSpacing: 0.6 }}>READ ✓</span>}
          <span style={{ fontSize: 11, color: 'var(--t-text-muted)', marginTop: 2 }}>{expanded ? '▲' : '▼'}</span>
        </div>
      </div>

      {/* Body */}
      {expanded && (
        <div style={{ paddingLeft: 72, paddingRight: 20, paddingBottom: 16 }}>
          <BlissContent text={policy.content} color={color} />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 16, paddingTop: 12, borderTop: `1px solid var(--t-line)` }}>
            <div style={{ fontSize: 10, color: 'var(--t-text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Effective {policy.effective} · v{policy.version}
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 12, color: read ? 'var(--t-success)' : 'var(--t-text-muted)', fontWeight: 600 }}>
              <input type="checkbox" checked={!!read} onChange={onRead} style={{ accentColor: color, width: 13, height: 13 }} />
              {read ? 'Marked Read' : 'Mark as Read'}
            </label>
          </div>
        </div>
      )}
    </div>
  )
}

// ── TAB 1 — HANDBOOK DESIGN ───────────────────────────────────────────────────
function TabDesign({ toast, actorId }) {
  const [design, setDesign] = useState(DEFAULT_DESIGN)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let alive = true
    loadDoc()
      .then(doc => {
        if (!alive) return
        const d = doc && doc.design && Object.keys(doc.design).length ? doc.design : {}
        setDesign({ ...DEFAULT_DESIGN, ...d })
      })
      .catch(() => { if (alive) toast('Unable to load handbook design') })
    return () => { alive = false }
  }, [toast])

  const logoRef = useRef(null)

  function upd(k, v) { setDesign(d => ({ ...d, [k]: v })) }

  function handleLogo(e) {
    const f = e.target.files[0]
    if (!f) return
    if (f.size > 2 * 1024 * 1024) { toast('Logo must be under 2MB'); return }
    const reader = new FileReader()
    reader.onload = ev => { upd('logo', ev.target.result) }
    reader.readAsDataURL(f)
  }

  async function saveDesign() {
    setSaving(true)
    const { data, error } = await sb.rpc('handbook_save_design', { p_design: design, p_actor: actorId ?? null })
    setSaving(false)
    if (error || !data?.ok) { toast('Could not save design — try again'); return }
    toast('Design saved')
  }

  const gradStyle = `linear-gradient(135deg, ${design.gradColors[0]}, ${design.gradColors[1]}, ${design.gradColors[2]})`

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '350px 1fr', gap: 16 }}>
      {/* Left: controls */}
      <div>
        <div style={S.card}>
          <div style={S.cardHeader}><span style={S.cardTitle}>Cover Page</span></div>
          <div style={S.cardBody}>
            <label style={S.label}>Company Name</label>
            <input style={S.input} value={design.companyName} onChange={e => upd('companyName', e.target.value)} />
            <label style={S.label}>Tagline</label>
            <input style={S.input} value={design.tagline} onChange={e => upd('tagline', e.target.value)} />
            <label style={S.label}>Logo (max 2MB)</label>
            <div style={S.row}>
              <button style={S.btnGhost} onClick={() => logoRef.current.click()}>Upload Logo</button>
              {design.logo && <button style={S.btnSm} onClick={() => upd('logo', null)}>Remove</button>}
            </div>
            <input ref={logoRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleLogo} />
            <label style={S.label}>Cover Gradient</label>
            <div style={S.row}>
              {design.gradColors.map((c, i) => (
                <div key={i}>
                  <div style={{ fontSize: 10, color: 'var(--t-text-muted)', marginBottom: 2 }}>Stop {i + 1}</div>
                  <input type="color" value={c} onChange={e => { const nc = [...design.gradColors]; nc[i] = e.target.value; upd('gradColors', nc) }} style={{ width: 40, height: 28, border: '1px solid var(--t-line)', cursor: 'pointer', borderRadius: 0 }} />
                </div>
              ))}
            </div>
            <label style={S.label}>Cover Text</label>
            <div style={S.row}>
              <label style={{ fontSize: 12, color: 'var(--t-text)' }}>
                <input type="radio" checked={!design.coverTextDark} onChange={() => upd('coverTextDark', false)} /> Light
              </label>
              <label style={{ fontSize: 12, color: 'var(--t-text)', marginLeft: 12 }}>
                <input type="radio" checked={design.coverTextDark} onChange={() => upd('coverTextDark', true)} /> Dark
              </label>
            </div>
          </div>
        </div>

        <div style={S.card}>
          <div style={S.cardHeader}><span style={S.cardTitle}>Table of Contents</span></div>
          <div style={S.cardBody}>
            <div style={{ ...S.row, marginBottom: 8 }}>
              <input type="checkbox" checked={design.autoToc} onChange={e => upd('autoToc', e.target.checked)} id="autotoc" />
              <label htmlFor="autotoc" style={{ fontSize: 12, color: 'var(--t-text)', cursor: 'pointer' }}>Auto-generate TOC</label>
            </div>
            <div style={{ ...S.row, marginBottom: 8 }}>
              <input type="checkbox" checked={design.showPageNumbers} onChange={e => upd('showPageNumbers', e.target.checked)} id="pgnum" />
              <label htmlFor="pgnum" style={{ fontSize: 12, color: 'var(--t-text)', cursor: 'pointer' }}>Show page numbers</label>
            </div>
            <label style={S.label}>TOC Style</label>
            {['list', 'numbered', 'sectioned'].map(s => (
              <label key={s} style={{ ...S.row, marginBottom: 4, cursor: 'pointer' }}>
                <input type="radio" checked={design.tocStyle === s} onChange={() => upd('tocStyle', s)} />
                <span style={{ fontSize: 12, color: 'var(--t-text)', textTransform: 'capitalize' }}>{s}</span>
              </label>
            ))}
          </div>
        </div>

        <div style={S.card}>
          <div style={S.cardHeader}><span style={S.cardTitle}>Typography</span></div>
          <div style={S.cardBody}>
            <label style={S.label}>Body Font</label>
            <select style={S.select} value={design.bodyFont} onChange={e => upd('bodyFont', e.target.value)}>
              {["'Inter', sans-serif", "'Georgia', serif", "'Calibri', sans-serif", "'Arial', sans-serif", "'Roboto', sans-serif"].map(f => (
                <option key={f} value={f}>{f.split("'")[1]}</option>
              ))}
            </select>
            <label style={S.label}>Heading Font</label>
            <select style={S.select} value={design.headingFont} onChange={e => upd('headingFont', e.target.value)}>
              {["'Inter', sans-serif", "'Georgia', serif", "'Calibri', sans-serif", "'Arial', sans-serif", "'Roboto', sans-serif"].map(f => (
                <option key={f} value={f}>{f.split("'")[1]}</option>
              ))}
            </select>
            <label style={S.label}>Font Size</label>
            <div style={S.row}>
              {[12, 13, 14, 15].map(sz => (
                <label key={sz} style={{ fontSize: 12, color: 'var(--t-text)', cursor: 'pointer' }}>
                  <input type="radio" checked={design.fontSize === sz} onChange={() => upd('fontSize', sz)} /> {sz}px
                </label>
              ))}
            </div>
          </div>
        </div>

        <div style={S.card}>
          <div style={S.cardHeader}><span style={S.cardTitle}>Branding</span></div>
          <div style={S.cardBody}>
            <label style={S.label}>Primary Color (section headers)</label>
            <div style={S.row}>
              <input type="color" value={design.primaryColor} onChange={e => upd('primaryColor', e.target.value)} style={{ width: 40, height: 28, border: '1px solid var(--t-line)', borderRadius: 0, cursor: 'pointer' }} />
              <span style={{ fontSize: 12, color: 'var(--t-text)', fontFamily: 'monospace' }}>{design.primaryColor}</span>
            </div>
            <label style={S.label}>Secondary Color (dividers)</label>
            <div style={S.row}>
              <input type="color" value={design.secondaryColor} onChange={e => upd('secondaryColor', e.target.value)} style={{ width: 40, height: 28, border: '1px solid var(--t-line)', borderRadius: 0, cursor: 'pointer' }} />
              <span style={{ fontSize: 12, color: 'var(--t-text)', fontFamily: 'monospace' }}>{design.secondaryColor}</span>
            </div>
            <button style={{ ...S.btn, marginTop: 12 }} onClick={() => toast('Primary color applied to all sections')}>Apply to All Sections</button>
          </div>
        </div>

        <button style={{ ...S.btn, width: '100%' }} onClick={saveDesign}>Save Design</button>
      </div>

      {/* Right: live preview */}
      <div>
        <div style={S.card}>
          <div style={S.cardHeader}><span style={S.cardTitle}>Cover Page Preview</span></div>
          <div style={S.cardBody}>
            <div style={{ background: gradStyle, padding: 40, minHeight: 420, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', position: 'relative' }}>
              {design.logo ? (
                <img src={design.logo} alt="Logo" style={{ maxHeight: 80, maxWidth: 200, objectFit: 'contain', marginBottom: 24 }} />
              ) : (
                <div style={{ width: 80, height: 80, background: 'rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, fontWeight: 900, color: design.coverTextDark ? '#1a1a1a' : '#fff', marginBottom: 24, letterSpacing: 2 }}>TG</div>
              )}
              <div style={{ borderTop: `1px solid ${design.coverTextDark ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.4)'}`, width: '100%', marginBottom: 20 }} />
              <div style={{ fontSize: 28, fontWeight: 900, color: design.coverTextDark ? '#1a1a1a' : '#fff', letterSpacing: 3, textTransform: 'uppercase', marginBottom: 4 }}>{design.companyName}</div>
              <div style={{ fontSize: 13, color: design.coverTextDark ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,0.7)', marginBottom: 24, letterSpacing: 1 }}>Twisted Growers</div>
              <div style={{ borderTop: `1px solid ${design.coverTextDark ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.4)'}`, width: '100%', marginBottom: 20 }} />
              <div style={{ fontSize: 18, fontWeight: 700, color: design.coverTextDark ? '#1a1a1a' : '#fff', textTransform: 'uppercase', letterSpacing: 2, marginBottom: 8 }}>{design.tagline}</div>
              <div style={{ fontSize: 11, color: design.coverTextDark ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.6)', marginBottom: 16 }}>Effective: January 1, 2026</div>
              <div style={{ borderTop: `1px solid ${design.coverTextDark ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.4)'}`, width: '100%', marginBottom: 16 }} />
              <div style={{ fontSize: 10, color: design.coverTextDark ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.6)', textTransform: 'uppercase', letterSpacing: 1, textAlign: 'center' }}>
                Confidential — For Internal Use Only<br />
                {getSiteNames().length} location{getSiteNames().length === 1 ? '' : 's'}: {getLocationNames().join(' · ')}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── TAB 2 — CONTENT BUILDER ───────────────────────────────────────────────────
function TabContent({ toast, actorId }) {
  const defaultItems = useMemo(() => {
    const divider = { type: 'divider', id: 'd-welcome', title: 'Welcome & Introduction', hidden: false }
    const customWelcome = { type: 'custom', id: 'c-welcome', title: 'Welcome Letter from Management', content: 'Dear Team,\n\nWelcome to Twisted Growers. We are thrilled to have you as part of our family...', hidden: false }
    const policies = FULL_POLICIES.map(p => ({ type: 'policy', id: `p-${p.id}`, policyId: p.id, title: p.title, category: p.category, version: p.version, roles: 'all', hidden: false }))
    return [divider, customWelcome, ...policies]
  }, [])

  const [items, setItems] = useState(defaultItems)

  useEffect(() => {
    let alive = true
    loadDoc()
      .then(doc => {
        if (!alive) return
        if (Array.isArray(doc.content) && doc.content.length) setItems(doc.content)
      })
      .catch(() => { if (alive) toast('Unable to load handbook content') })
    return () => { alive = false }
  }, [toast])
  const [roleFilter, setRoleFilter] = useState('all')
  const [customTitle, setCustomTitle] = useState('')
  const [customContent, setCustomContent] = useState('')
  const [addingCustom, setAddingCustom] = useState(false)
  const [editingCustomId, setEditingCustomId] = useState(null)

  function moveUp(idx) {
    if (idx === 0) return
    setItems(prev => { const n = [...prev]; [n[idx - 1], n[idx]] = [n[idx], n[idx - 1]]; return n })
  }
  function moveDown(idx) {
    setItems(prev => { if (idx >= prev.length - 1) return prev; const n = [...prev]; [n[idx], n[idx + 1]] = [n[idx + 1], n[idx]]; return n })
  }
  function remove(idx) { setItems(prev => prev.filter((_, i) => i !== idx)) }
  function toggleHide(idx) { setItems(prev => prev.map((it, i) => i === idx ? { ...it, hidden: !it.hidden } : it)) }
  function setRole(idx, val) { setItems(prev => prev.map((it, i) => i === idx ? { ...it, roles: val } : it)) }

  function addDivider() {
    setItems(prev => [...prev, { type: 'divider', id: `d-${Date.now()}`, title: 'New Section', hidden: false }])
  }

  function addCustom() {
    if (!customTitle.trim()) return
    setItems(prev => [...prev, { type: 'custom', id: `c-${Date.now()}`, title: customTitle, content: customContent, hidden: false, roles: 'all' }])
    setCustomTitle(''); setCustomContent(''); setAddingCustom(false)
    toast('Custom page added')
  }

  async function saveContent() {
    const { data, error } = await sb.rpc('handbook_save_content', { p_content: items, p_actor: actorId ?? null })
    if (error || !data?.ok) { toast('Could not save order — try again'); return }
    toast('Content order saved')
  }

  const filtered = roleFilter === 'all' ? items : items.filter(it => it.roles === 'all' || it.roles === roleFilter)

  const roleLabels = { all: 'All', manager: 'Manager+', keyholder: 'Key Holder+', associate: 'Associate' }

  return (
    <div>
      <div style={{ ...S.row, marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <button style={S.btn} onClick={addDivider}>+ Add Section Divider</button>
        <button style={S.btn} onClick={() => setAddingCustom(true)}>+ Add Custom Page</button>
        <div style={{ marginLeft: 'auto', ...S.row }}>
          <span style={{ fontSize: 11, color: 'var(--t-text-muted)' }}>Filter by role:</span>
          {Object.entries(roleLabels).map(([k, v]) => (
            <button key={k} onClick={() => setRoleFilter(k)} style={{ ...S.btnSm, background: roleFilter === k ? 'var(--t-accent)' : 'transparent', color: roleFilter === k ? '#000' : 'var(--t-text-muted)' }}>{v}</button>
          ))}
        </div>
        <button style={S.btnGhost} onClick={saveContent}>Save Order</button>
      </div>

      {addingCustom && (
        <div style={{ ...S.card, marginBottom: 16 }}>
          <div style={S.cardHeader}><span style={S.cardTitle}>New Custom Page</span><button style={S.btnSm} onClick={() => setAddingCustom(false)}>Cancel</button></div>
          <div style={S.cardBody}>
            <label style={S.label}>Page Title</label>
            <input style={S.input} placeholder="e.g., CEO Welcome Message" value={customTitle} onChange={e => setCustomTitle(e.target.value)} />
            <label style={S.label}>Content</label>
            <textarea style={{ ...S.textarea, minHeight: 100 }} placeholder="Write your content here..." value={customContent} onChange={e => setCustomContent(e.target.value)} />
            <button style={{ ...S.btn, marginTop: 12 }} onClick={addCustom}>Add to Handbook</button>
          </div>
        </div>
      )}

      <div style={S.card}>
        <div style={S.cardHeader}><span style={S.cardTitle}>Handbook Content — {filtered.length} items</span></div>
        <div style={S.cardBody}>
          {filtered.map((item, idx) => {
            const realIdx = items.indexOf(item)
            if (item.type === 'divider') return (
              <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 0', borderBottom: '1px solid var(--t-line)', opacity: item.hidden ? 0.4 : 1 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <button style={S.btnSm} onClick={() => moveUp(realIdx)}>▲</button>
                  <button style={S.btnSm} onClick={() => moveDown(realIdx)}>▼</button>
                </div>
                <div style={{ flex: 1, fontWeight: 700, color: 'var(--t-accent)', fontSize: 12, letterSpacing: 1, textTransform: 'uppercase' }}>══ SECTION: {item.title} ══</div>
                <button style={S.btnSm} onClick={() => {
                  const title = window.prompt('Section title:', item.title)
                  if (title) setItems(prev => prev.map((it, i) => i === realIdx ? { ...it, title } : it))
                }}>Edit</button>
                <button style={S.btnSm} onClick={() => remove(realIdx)}>✕</button>
              </div>
            )
            return (
              <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 0', borderBottom: '1px solid var(--t-line)', opacity: item.hidden ? 0.4 : 1 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <button style={S.btnSm} onClick={() => moveUp(realIdx)}>▲</button>
                  <button style={S.btnSm} onClick={() => moveDown(realIdx)}>▼</button>
                </div>
                <div style={{ width: 6, height: 6, background: 'var(--t-text-muted)', borderRadius: '50%' }} />
                <div style={{ flex: 1, fontSize: 13, color: 'var(--t-text)' }}>
                  {item.title}
                  <span style={{ ...S.badge('blue'), marginLeft: 8 }}>{item.category || 'Custom'}</span>
                  {item.version && <span style={{ fontSize: 10, color: 'var(--t-text-muted)', marginLeft: 6 }}>{item.version}</span>}
                </div>
                <select style={{ ...S.select, width: 160 }} value={item.roles || 'all'} onChange={e => setRole(realIdx, e.target.value)}>
                  <option value="all">All Employees</option>
                  <option value="manager">Manager & Above</option>
                  <option value="keyholder">Key Holder & Above</option>
                  <option value="associate">Associates Only</option>
                </select>
                <button style={S.btnSm} onClick={() => toggleHide(realIdx)} title={item.hidden ? 'Show' : 'Hide'}>{item.hidden ? '👁‍🗨' : '👁'}</button>
                <button style={S.btnSm} onClick={() => remove(realIdx)}>✕</button>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ── TAB 3 — PUBLISH & PREVIEW ─────────────────────────────────────────────────
function TabPublish({ toast, actorId }) {
  const [version, setVersion] = useState('1.0')
  const [effectiveDate, setEffectiveDate] = useState('2026-01-01')
  const [notes, setNotes] = useState('')
  const [locations, setLocations] = useState(() => Object.fromEntries(getLocationNames().map(l => [l, true])))
  const [requireSig, setRequireSig] = useState(true)
  const [sigDeadline, setSigDeadline] = useState('2026-07-31')
  const [published, setPublished] = useState(false)
  const [design, setDesign] = useState(DEFAULT_DESIGN)

  useEffect(() => {
    let alive = true
    loadDoc().then(doc => {
      if (!alive) return
      setDesign({ ...DEFAULT_DESIGN, ...(doc.design || {}) })
      if (doc.version) setVersion(doc.version)
      if (doc.effective_date) setEffectiveDate(doc.effective_date)
      if (doc.notes != null) setNotes(doc.notes)
      if (doc.audience && Object.keys(doc.audience).length) setLocations(a => ({ ...a, ...doc.audience }))
      if (typeof doc.require_sig === 'boolean') setRequireSig(doc.require_sig)
      if (doc.sig_deadline) setSigDeadline(doc.sig_deadline)
      if (doc.status === 'published') setPublished(true)
    }).catch(() => { if (alive) toast('Unable to load publish settings') })
    return () => { alive = false }
  }, [toast])

  const policyItems = FULL_POLICIES.map((p, i) => ({ ...p, page: i * 2 + 1 }))
  const gradStyle = `linear-gradient(135deg, ${design.gradColors[0]}, ${design.gradColors[1]}, ${design.gradColors[2]})`

  async function publish() {
    const { data, error } = await sb.rpc('handbook_publish', {
      p_version: version,
      p_effective_date: effectiveDate || null,
      p_notes: notes || null,
      p_audience: locations,
      p_require_sig: requireSig,
      p_sig_deadline: requireSig ? (sigDeadline || null) : null,
      p_actor: actorId ?? null,
    })
    if (error || !data?.ok) { toast('Publish failed — try again'); return false }
    setPublished(true)
    toast(`Handbook v${version} published`)
    return true
  }

  async function sendToEmployees() {
    if (!window.confirm('Publish and make this handbook available to all employees to review and sign?')) return
    const ok = await publish()
    if (ok) toast('Handbook is now available to all employees')
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 16 }}>
      <div>
        <div style={S.card}>
          <div style={S.cardHeader}><span style={S.cardTitle}>Publish Settings</span></div>
          <div style={S.cardBody}>
            <label style={S.label}>Version Number</label>
            <input style={S.input} value={version} onChange={e => setVersion(e.target.value)} placeholder="e.g., 2.1" />
            <label style={S.label}>Effective Date</label>
            <input style={{ ...S.input, colorScheme: 'dark' }} type="date" value={effectiveDate} onChange={e => setEffectiveDate(e.target.value)} />
            <label style={S.label}>What's New in This Version</label>
            <textarea style={{ ...S.textarea, minHeight: 80 }} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Describe changes from previous version..." />
            <label style={S.label}>Audience</label>
            {getLocationNames().map(loc => (
              <div key={loc} style={{ ...S.row, marginBottom: 4 }}>
                <input type="checkbox" checked={locations[loc]} onChange={e => setLocations(p => ({ ...p, [loc]: e.target.checked }))} id={`loc-${loc}`} />
                <label htmlFor={`loc-${loc}`} style={{ fontSize: 12, color: 'var(--t-text)', cursor: 'pointer' }}>{loc}</label>
              </div>
            ))}
            <label style={S.label}>Require Signature</label>
            <div style={S.row}>
              <label style={{ fontSize: 12, color: 'var(--t-text)' }}><input type="radio" checked={requireSig} onChange={() => setRequireSig(true)} /> Yes</label>
              <label style={{ fontSize: 12, color: 'var(--t-text)', marginLeft: 12 }}><input type="radio" checked={!requireSig} onChange={() => setRequireSig(false)} /> No</label>
            </div>
            {requireSig && <>
              <label style={S.label}>Signature Deadline</label>
              <input style={{ ...S.input, colorScheme: 'dark' }} type="date" value={sigDeadline} onChange={e => setSigDeadline(e.target.value)} />
            </>}
          </div>
        </div>
        <button style={{ ...S.btn, width: '100%', marginBottom: 8, background: published ? 'var(--t-success)' : 'var(--t-accent)' }} onClick={publish}>
          {published ? 'Published ✓' : 'Publish Handbook'}
        </button>
        <button style={{ ...S.btnGhost, width: '100%', marginBottom: 8 }} onClick={() => toast('PDF download requires backend integration — contact IT')}>Download PDF</button>
        <button style={{ ...S.btn, width: '100%', background: '#f59e0b', color: '#000' }} onClick={sendToEmployees}>Send to Employees</button>
      </div>

      <div>
        <div style={S.card}>
          <div style={S.cardHeader}><span style={S.cardTitle}>Handbook Preview</span></div>
          <div style={{ height: 600, overflowY: 'auto', padding: 0 }}>
            <div style={{ background: '#fff', color: '#1a1a1a', fontFamily: 'Georgia, serif', fontSize: 13, lineHeight: 1.6 }}>
              {/* Cover */}
              <div style={{ background: gradStyle, padding: '48px 40px', textAlign: 'center', color: '#fff', minHeight: 200 }}>
                <div style={{ fontSize: 24, fontWeight: 900, letterSpacing: 3, textTransform: 'uppercase', marginBottom: 8 }}>{design.companyName}</div>
                <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 16 }}>Twisted Growers</div>
                <div style={{ fontSize: 18, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 2, marginBottom: 4 }}>Employee Handbook {version}</div>
                <div style={{ fontSize: 11, opacity: 0.6 }}>Effective: January 1, 2026 | Confidential</div>
              </div>
              {/* TOC */}
              <div style={{ padding: '24px 32px' }}>
                <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 12, color: design.primaryColor, borderBottom: `2px solid ${design.primaryColor}`, paddingBottom: 4 }}>TABLE OF CONTENTS</div>
                {policyItems.map((p, i) => (
                  <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px dotted #ccc', marginBottom: 4, fontSize: 12, color: '#333' }}>
                    <span>{i + 1}. {p.title}</span>
                    <span>{p.page}</span>
                  </div>
                ))}
              </div>
              {/* Sections — Bliss Book preview */}
              {policyItems.map(p => {
                const c = CAT_COLOR[p.category] || design.primaryColor
                const chunks = p.content ? p.content.split('|').map(s => s.trim()).filter(Boolean) : []
                return (
                  <div key={p.id} style={{ padding: '20px 32px', borderTop: '1px solid #e8e8e8' }}>
                    <div style={{ borderTop: `3px solid ${c}`, paddingTop: 14, marginBottom: 14 }}>
                      <div style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1.2, color: c, marginBottom: 5 }}>{p.category}</div>
                      <div style={{ fontSize: 17, fontWeight: 900, color: '#111', lineHeight: 1.3 }}>{p.title}</div>
                    </div>
                    <div style={{ fontSize: 12, color: '#333', lineHeight: 1.85 }}>
                      {chunks.map((chunk, ci) => {
                        if (/^[●•]/.test(chunk)) return <div key={ci} style={{ display: 'flex', gap: 8, marginBottom: 5 }}><span style={{ color: c, flexShrink: 0, fontWeight: 700, fontSize: 10, marginTop: 3 }}>▸</span><span>{chunk.replace(/^[●•]\s*/, '')}</span></div>
                        if (/^\d+\.\s/.test(chunk)) return <div key={ci} style={{ fontWeight: 800, color: c, marginTop: 12, marginBottom: 5, paddingBottom: 4, borderBottom: `1px solid ${c}22` }}>{chunk}</div>
                        if (/^[🚫📌🚨🚭⚠️✅]/.test(chunk)) return <div key={ci} style={{ background: `${c}10`, borderLeft: `3px solid ${c}`, padding: '6px 10px', marginBottom: 7 }}>{chunk}</div>
                        if (chunk.endsWith(':') && chunk.length < 80) return <div key={ci} style={{ fontWeight: 700, fontSize: 10, color: c, marginTop: 12, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>{chunk}</div>
                        if (chunk.length < 60 && !chunk.includes(',') && !/[.!?]$/.test(chunk)) return <div key={ci} style={{ display: 'flex', gap: 8, marginBottom: 4, color: '#555' }}><span style={{ color: `${c}88` }}>–</span><span>{chunk}</span></div>
                        return <p key={ci} style={{ marginBottom: 9, marginTop: 0 }}>{chunk}</p>
                      })}
                    </div>
                    <div style={{ fontSize: 9, color: '#bbb', marginTop: 12, borderTop: '1px solid #eee', paddingTop: 6, display: 'flex', justifyContent: 'space-between' }}>
                      <span>Twisted Growers Employee Handbook {version} · Confidential</span>
                      <span>Page {p.page}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── TAB 4 — SIGNATURE CENTER ──────────────────────────────────────────────────
function TabSignatures({ toast }) {
  const nodeIds = useNodeIds()
  const [filterLoc, setFilterLoc] = useState('All')
  const [filterStatus, setFilterStatus] = useState('All')
  const [filterRole, setFilterRole] = useState('All')
  const [sigModal, setSigModal] = useState(null)
  const [roster, setRoster] = useState([])
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [drill, setDrill] = useState(null)

  const load = useCallback(async () => {
    setLoading(true); setError('')
    const [r, h] = await Promise.all([
      sb.rpc('handbook_signature_roster', { p_node_ids: nodeIds.length ? nodeIds : null }),
      sb.rpc('handbook_get_signatures'),
    ])
    if (r.error) { setError(r.error.message || 'Unable to load signatures'); setRoster([]) }
    else setRoster(Array.isArray(r.data) ? r.data : [])
    setHistory(!h.error && Array.isArray(h.data) ? h.data : [])
    setLoading(false)
  }, [nodeIds])

  useEffect(() => { load() }, [load])

  const enriched = roster.map(e => ({ ...e, signedDate: e.signed_at ? fmtDate(e.signed_at) : null }))

  const locOptions = ['All', ...Array.from(new Set(enriched.map(e => e.location).filter(Boolean)))]
  const roleOptions = ['All', ...Array.from(new Set(enriched.map(e => e.role).filter(Boolean)))]

  const filtered = enriched.filter(e =>
    (filterLoc === 'All' || e.location === filterLoc) &&
    (filterStatus === 'All' || e.status === filterStatus) &&
    (filterRole === 'All' || e.role === filterRole)
  )

  const signed = enriched.filter(e => e.status === 'signed').length
  const pending = enriched.filter(e => e.status === 'pending').length
  const outdated = enriched.filter(e => e.status === 'outdated').length
  const total = enriched.length

  const SIG_COLS = [
    { key: 'name', label: 'Employee', value: e => e.name },
    { key: 'location', label: 'Location', value: e => e.location },
    { key: 'role', label: 'Role', value: e => e.role },
    { key: 'status', label: 'Status', value: e => e.status },
    { key: 'signedDate', label: 'Signed Date', value: e => e.signedDate || '—', sortKey: e => e.signedDate || '' },
    { key: 'version', label: 'Version', value: e => e.signed_version || '—' },
  ]
  const openDrill = (title, list, accent) => setDrill({ title, subtitle: `${list.length} employee${list.length === 1 ? '' : 's'}`, columns: SIG_COLS, rows: list, accent })

  const statusBadge = (s) => {
    if (s === 'signed') return <span style={S.badge('green')}>SIGNED ✓</span>
    if (s === 'outdated') return <span style={S.badge('red')}>OUTDATED</span>
    return <span style={S.badge('amber')}>PENDING</span>
  }

  return (
    <div>
      {sigModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', padding: 32, width: 400, maxWidth: '90vw', borderRadius: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--t-text)', marginBottom: 16 }}>Electronic Signature Record</div>
            <div style={{ fontSize: 12, color: 'var(--t-text-muted)', marginBottom: 8 }}>Employee: <strong style={{ color: 'var(--t-text)' }}>{sigModal.name}</strong></div>
            <div style={{ fontSize: 12, color: 'var(--t-text-muted)', marginBottom: 8 }}>Signed: <strong style={{ color: 'var(--t-text)' }}>{sigModal.signedDate}</strong></div>
            <div style={{ fontSize: 12, color: 'var(--t-text-muted)', marginBottom: 16 }}>Location: <strong style={{ color: 'var(--t-text)' }}>{sigModal.location || '—'}</strong></div>
            <div style={{ background: 'var(--t-bg)', border: '1px solid var(--t-line)', padding: 12, fontSize: 11, color: 'var(--t-text-muted)', marginBottom: 16, lineHeight: 1.6 }}>
              "I acknowledge that I have received, read, and understood the Twisted Growers Employee Handbook. I agree to comply with all policies and procedures contained therein."
            </div>
            <div style={{ fontFamily: 'cursive', fontSize: 20, color: 'var(--t-text)', borderBottom: '1px solid var(--t-text)', paddingBottom: 4, marginBottom: 8 }}>{sigModal.name}</div>
            <div style={{ fontSize: 10, color: 'var(--t-text-muted)', marginBottom: 16 }}>Digitally signed · {sigModal.signedDate} · v{sigModal.signed_version || '—'}</div>
            <button style={S.btnGhost} onClick={() => setSigModal(null)}>Close</button>
          </div>
        </div>
      )}

      <div style={S.kpiRow}>
        <KTile label="Total Signed" value={total ? `${signed}/${total}` : '0'} sub={total ? `${Math.round((signed / total) * 100)}% compliance` : 'no employees yet'} color="var(--t-success)"
          onClick={() => openDrill('Signed Handbook Acknowledgments', enriched.filter(e => e.status === 'signed'), 'var(--t-success)')} />
        <KTile label="Pending Signature" value={pending} alert={pending > 0 ? 'amber' : undefined}
          onClick={() => openDrill('Pending Signatures', enriched.filter(e => e.status === 'pending'), '#f59e0b')} />
        <KTile label="Outdated Version" value={outdated} alert={outdated > 0 ? 'red' : undefined}
          onClick={() => openDrill('Signed an Older Version', enriched.filter(e => e.status === 'outdated'), 'var(--t-danger)')} />
        <KTile label="Total Employees" value={total}
          onClick={() => openDrill('All Employees', enriched, 'var(--t-accent)')} />
      </div>

      <div style={S.card}>
        <div style={S.cardHeader}>
          <span style={S.cardTitle}>Signature Matrix</span>
          <div style={S.row}>
            <select style={{ ...S.select, width: 140 }} value={filterLoc} onChange={e => setFilterLoc(e.target.value)}>
              {locOptions.map(l => <option key={l}>{l}</option>)}
            </select>
            <select style={{ ...S.select, width: 120 }} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
              {['All', 'signed', 'pending', 'outdated'].map(s => <option key={s}>{s}</option>)}
            </select>
            <select style={{ ...S.select, width: 140 }} value={filterRole} onChange={e => setFilterRole(e.target.value)}>
              {roleOptions.map(r => <option key={r}>{r}</option>)}
            </select>
            <button style={S.btnGhost} onClick={load}>Refresh</button>
          </div>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={S.table}>
            <thead>
              <tr style={{ background: 'var(--t-bg)' }}>
                {['Employee', 'Location', 'Role', 'Status', 'Signed Date', 'Version', 'Actions'].map(h => (
                  <th key={h} style={S.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((emp, i) => (
                <tr key={emp.person_id} style={{ background: i % 2 === 0 ? 'var(--t-bg)' : 'var(--t-surface)' }}>
                  <td style={{ ...S.td, fontWeight: 600 }}>{emp.name}</td>
                  <td style={S.td}>{emp.location || '—'}</td>
                  <td style={S.td}>{emp.role}</td>
                  <td style={S.td}>{statusBadge(emp.status)}</td>
                  <td style={S.td}>{emp.signedDate || '—'}</td>
                  <td style={S.td}>{emp.signed_version || '—'}</td>
                  <td style={S.td}>
                    <div style={S.row}>
                      {emp.status !== 'pending' && <button style={S.btnSm} onClick={() => setSigModal(emp)}>View</button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {loading && <div style={{ padding: 24, textAlign: 'center', color: 'var(--t-text-muted)', fontSize: 12 }}>Loading employees…</div>}
          {!loading && error && <div style={{ padding: 24, textAlign: 'center', color: 'var(--t-danger)', fontSize: 12 }}>{error}</div>}
          {!loading && !error && filtered.length === 0 && (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--t-text-muted)', fontSize: 12 }}>
              No employees in your locations yet.
            </div>
          )}
        </div>
      </div>

      <div style={S.card}>
        <div style={S.cardHeader}><span style={S.cardTitle}>Signature History</span></div>
        <div style={S.cardBody}>
          {history.length === 0 && <div style={{ fontSize: 12, color: 'var(--t-text-muted)' }}>No signatures recorded yet.</div>}
          {history.map((ev, i) => (
            <div key={i} style={{ fontSize: 12, color: 'var(--t-text-muted)', padding: '6px 0', borderBottom: '1px solid var(--t-line)' }}>
              <span style={{ color: 'var(--t-text)', fontWeight: 600 }}>{ev.person_name || 'Employee'}</span> signed the Employee Handbook (v{ev.version || '—'}) on {fmtDate(ev.signed_at)}
            </div>
          ))}
        </div>
      </div>

      <DrillDown open={!!drill} onClose={() => setDrill(null)} {...(drill || {})} />
    </div>
  )
}

// ── TAB 5 — LAW ALERTS ────────────────────────────────────────────────────────
function TabLawAlerts({ toast, actorId }) {
  const [statuses, setStatuses] = useState({})
  const [filterScope, setFilterScope] = useState('All')
  const [filterStatus, setFilterStatus] = useState('All')

  useEffect(() => {
    let alive = true
    sb.rpc('handbook_get_law_status').then(({ data, error }) => {
      if (!alive) return
      if (error) { toast('Unable to load alert statuses'); return }
      setStatuses(data && typeof data === 'object' ? data : {})
    })
    return () => { alive = false }
  }, [toast])

  async function setStatus(id, status) {
    const key = String(id)
    const prev = statuses
    const next = { ...statuses, [key]: status }
    setStatuses(next)                        // optimistic
    const { data, error } = await sb.rpc('handbook_set_law_status', { p_alert_key: key, p_status: status, p_actor: actorId ?? null })
    if (error || !data?.ok) { setStatuses(prev); toast('Could not update alert — try again') }
  }

  const scopeColor = (s) => s === 'Federal' ? 'blue' : s === 'State' ? 'amber' : 'green'

  const filtered = LAW_ALERTS.filter(a => {
    const st = statuses[a.id] || 'unreviewed'
    return (filterScope === 'All' || a.scope === filterScope) && (filterStatus === 'All' || st === filterStatus)
  })

  const unreviewed = LAW_ALERTS.filter(a => !statuses[a.id] || statuses[a.id] === 'unreviewed').length

  const [drill, setDrill] = useState(null)
  const ALERT_COLS = [
    { key: 'title', label: 'Alert', value: a => a.title },
    { key: 'scope', label: 'Scope', value: a => a.scope },
    { key: 'affects', label: 'Affects Policies', value: a => a.affects },
    { key: 'status', label: 'Status', value: a => (statuses[a.id] || 'unreviewed'), sortKey: a => (statuses[a.id] || 'unreviewed') },
    { key: 'detail', label: 'Detail', value: a => a.detail },
  ]
  const openDrill = (title, list, accent) => setDrill({ title, subtitle: `${list.length} alert${list.length === 1 ? '' : 's'}`, columns: ALERT_COLS, rows: list, accent })

  return (
    <div>
      <div style={S.kpiRow}>
        <KTile label="Unreviewed Alerts" value={unreviewed} alert={unreviewed > 0 ? 'amber' : undefined}
          onClick={() => openDrill('Unreviewed Law Alerts', LAW_ALERTS.filter(a => !statuses[a.id] || statuses[a.id] === 'unreviewed'), '#f59e0b')} />
        <KTile label="Federal" value={LAW_ALERTS.filter(a => a.scope === 'Federal').length} color="var(--t-accent)"
          onClick={() => openDrill('Federal Law Alerts', LAW_ALERTS.filter(a => a.scope === 'Federal'), 'var(--t-accent)')} />
        <KTile label="State (CT)" value={LAW_ALERTS.filter(a => a.scope === 'State').length}
          onClick={() => openDrill('State (CT) Law Alerts', LAW_ALERTS.filter(a => a.scope === 'State'), 'var(--t-accent)')} />
        <KTile label="Local" value={LAW_ALERTS.filter(a => a.scope === 'Local').length}
          onClick={() => openDrill('Local Law Alerts', LAW_ALERTS.filter(a => a.scope === 'Local'), 'var(--t-accent)')} />
      </div>

      <div style={{ ...S.row, marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        {['All', 'Federal', 'State', 'Local'].map(s => (
          <button key={s} style={{ ...S.btnSm, background: filterScope === s ? 'var(--t-accent)' : 'transparent', color: filterScope === s ? '#000' : 'var(--t-text-muted)' }} onClick={() => setFilterScope(s)}>{s}</button>
        ))}
        <div style={{ width: 1, background: 'var(--t-line)', height: 20 }} />
        {['All', 'unreviewed', 'reviewed', 'dismissed'].map(s => (
          <button key={s} style={{ ...S.btnSm, background: filterStatus === s ? 'var(--t-accent)' : 'transparent', color: filterStatus === s ? '#000' : 'var(--t-text-muted)', textTransform: 'capitalize' }} onClick={() => setFilterStatus(s)}>{s === 'All' ? 'All Statuses' : s}</button>
        ))}
      </div>

      {filtered.map(alert => {
        const st = statuses[alert.id] || 'unreviewed'
        return (
          <div key={alert.id} style={{ ...S.card, borderLeft: `3px solid ${st === 'reviewed' ? 'var(--t-success)' : st === 'dismissed' ? 'var(--t-line)' : '#f59e0b'}` }}>
            <div style={S.cardHeader}>
              <div style={S.row}>
                <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--t-text)' }}>{alert.title}</span>
                <span style={S.badge(scopeColor(alert.scope))}>{alert.scope}</span>
                <span style={S.badge(st === 'reviewed' ? 'green' : st === 'dismissed' ? '' : 'amber')}>{st.toUpperCase()}</span>
              </div>
            </div>
            <div style={S.cardBody}>
              <div style={{ fontSize: 13, color: 'var(--t-text)', marginBottom: 8 }}>{alert.detail}</div>
              <div style={{ fontSize: 11, color: 'var(--t-text-muted)', marginBottom: 12 }}>
                Affects policies: <span style={{ color: 'var(--t-accent)' }}>{alert.affects}</span>
              </div>
              <div style={S.row}>
                {st !== 'reviewed' && <button style={S.btn} onClick={() => { setStatus(alert.id, 'reviewed'); toast('Alert marked as reviewed') }}>Mark Reviewed</button>}
                <button style={S.btnGhost} onClick={() => toast(`Navigate to Edit Policies → ${alert.affects.split(',')[0].trim()}`)}>Update Policy →</button>
                {st !== 'dismissed' && <button style={S.btnSm} onClick={() => { setStatus(alert.id, 'dismissed'); toast('Alert dismissed') }}>Dismiss</button>}
                {st === 'dismissed' && <button style={S.btnSm} onClick={() => { setStatus(alert.id, 'unreviewed'); toast('Alert restored') }}>Restore</button>}
              </div>
            </div>
          </div>
        )
      })}

      {filtered.length === 0 && (
        <div style={{ textAlign: 'center', color: 'var(--t-text-muted)', padding: 40 }}>No alerts match the current filter.</div>
      )}

      <DrillDown open={!!drill} onClose={() => setDrill(null)} {...(drill || {})} />
    </div>
  )
}

// ── TAB 6 — ROLE-BASED ACCESS ─────────────────────────────────────────────────
function TabAccess({ toast, actorId }) {
  const defaultMatrix = useMemo(() => {
    const matrix = {}
    const roleDefaults = {
      'Admin/Owner': true,
      'COO': true,
      'HR Manager': true,
      'Store Manager': (feat) => !['delete-msgs', 'user-mgmt', 'demo-mode', 'handbook', 'ai-design'].includes(feat),
      'Key Holder': (feat) => ['dashboard', 'scheduling', 'attendance', 'training', 'documents', 'approve-pto'].includes(feat),
      'Associate/Cashier': (feat) => ['dashboard', 'scheduling', 'attendance', 'training'].includes(feat),
    }
    DC_FEATURES.forEach(f => {
      matrix[f.id] = {}
      ROLES.forEach(role => {
        const def = roleDefaults[role]
        matrix[f.id][role] = typeof def === 'function' ? def(f.id) : def
      })
    })
    return matrix
  }, [])

  const [matrix, setMatrix] = useState(defaultMatrix)
  const [previewRole, setPreviewRole] = useState('')

  useEffect(() => {
    let alive = true
    loadDoc().then(doc => {
      if (!alive) return
      if (doc.access_matrix && Object.keys(doc.access_matrix).length) setMatrix(doc.access_matrix)
    }).catch(() => { if (alive) toast('Unable to load access rules') })
    return () => { alive = false }
  }, [toast])

  function toggle(featId, role) {
    if (role === 'Admin/Owner') return
    setMatrix(prev => ({ ...prev, [featId]: { ...prev[featId], [role]: !prev[featId][role] } }))
  }

  async function save() {
    const { data, error } = await sb.rpc('handbook_save_access', { p_access: matrix, p_actor: actorId ?? null })
    if (error || !data?.ok) { toast('Could not save access rules — try again'); return }
    toast('Access rules saved')
  }

  const categories = [...new Set(DC_FEATURES.map(f => f.category))]

  return (
    <div>
      <div style={{ ...S.row, marginBottom: 16, justifyContent: 'space-between' }}>
        <div style={S.row}>
          <span style={{ fontSize: 12, color: 'var(--t-text-muted)' }}>Preview as:</span>
          <select style={{ ...S.select, width: 180 }} value={previewRole} onChange={e => setPreviewRole(e.target.value)}>
            <option value="">— Select Role —</option>
            {ROLES.map(r => <option key={r}>{r}</option>)}
          </select>
        </div>
        <button style={S.btn} onClick={save}>Save Access Rules</button>
      </div>

      {categories.map(cat => (
        <div key={cat} style={S.card}>
          <div style={S.cardHeader}><span style={S.cardTitle}>{cat}</span></div>
          <div style={{ overflowX: 'auto' }}>
            <table style={S.table}>
              <thead>
                <tr style={{ background: 'var(--t-bg)' }}>
                  <th style={{ ...S.th, minWidth: 160 }}>Feature</th>
                  {ROLES.map(r => <th key={r} style={{ ...S.th, textAlign: 'center' }}>{r}</th>)}
                </tr>
              </thead>
              <tbody>
                {DC_FEATURES.filter(f => f.category === cat).map(feat => {
                  const visible = !previewRole || matrix[feat.id]?.[previewRole]
                  return (
                    <tr key={feat.id} style={{ background: previewRole && !visible ? 'rgba(239,68,68,0.06)' : feat.id.indexOf(cat.toLowerCase()) !== -1 ? 'var(--t-bg)' : 'var(--t-surface)', opacity: previewRole && !visible ? 0.5 : 1 }}>
                      <td style={{ ...S.td, fontWeight: 600, fontSize: 12 }}>{feat.label}</td>
                      {ROLES.map(role => {
                        const checked = matrix[feat.id]?.[role] ?? false
                        const locked = role === 'Admin/Owner'
                        return (
                          <td key={role} style={{ ...S.td, textAlign: 'center' }}>
                            {locked ? (
                              <span style={{ fontSize: 16, color: 'var(--t-success)' }}>✓</span>
                            ) : (
                              <input type="checkbox" checked={checked} onChange={() => toggle(feat.id, role)} style={{ cursor: 'pointer', accentColor: 'var(--t-accent)', width: 14, height: 14 }} />
                            )}
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  )
}

// ── TAB 7 — MY HANDBOOK ───────────────────────────────────────────────────────
function TabMyHandbook({ toast }) {
  const me = getSession()
  const personRole = me?.role_name || me?.title || 'Associate'
  const personId = me?.id || null
  const personName = me?.full_name || `${me?.first_name || ''} ${me?.last_name || ''}`.trim() || 'Employee'

  const [doc, setDoc] = useState({ version: '1.0', require_sig: true, access_matrix: null })
  const [readSet, setReadSet] = useState({})
  const [activeToc, setActiveToc] = useState(null)
  const [sigName, setSigName] = useState(personName)
  const [sigChecked, setSigChecked] = useState(false)
  const [signed, setSigned] = useState(false)
  const [signedDate, setSignedDate] = useState(null)

  const access = doc.access_matrix
  const published = doc  // published config used in the render below

  const visiblePolicies = useMemo(() => {
    if (!access) return FULL_POLICIES
    return FULL_POLICIES.filter(p => {
      const featId = p.id === 10 ? 'payroll' : p.id === 8 ? 'documents' : 'dashboard'
      return access[featId]?.[personRole] !== false
    })
  }, [access, personRole])

  const load = useCallback(async () => {
    const d = await loadDoc().catch(() => ({}))
    setDoc({
      version: d.version || '1.0',
      require_sig: d.require_sig !== false,
      access_matrix: d.access_matrix && Object.keys(d.access_matrix).length ? d.access_matrix : null,
      effective_date: d.effective_date,
    })
    if (!personId) return
    const [rd, sg] = await Promise.all([
      sb.rpc('handbook_get_read', { p_person_id: personId }),
      sb.rpc('handbook_get_signatures'),
    ])
    const keys = (!rd.error && Array.isArray(rd.data)) ? rd.data : []
    const set = {}; keys.forEach(k => { set[k] = true })
    setReadSet(set)
    const sigs = (!sg.error && Array.isArray(sg.data)) ? sg.data : []
    const mine = sigs.find(s => s.person_id === personId && s.version === (d.version || '1.0'))
    if (mine) { setSigned(true); setSignedDate(fmtDate(mine.signed_at)) }
  }, [personId])

  useEffect(() => { load() }, [load])
  useEffect(() => { setSigName(personName) }, [personName])

  const totalSections = visiblePolicies.length
  const readCount = visiblePolicies.filter(p => readSet[p.id]).length
  const progress = totalSections > 0 ? Math.round((readCount / totalSections) * 100) : 0

  async function markRead(id) {
    const key = String(id)
    if (readSet[key]) return
    setReadSet(prev => ({ ...prev, [key]: true }))          // optimistic
    if (!personId) { toast('Sign in to save your progress'); return }
    const { data, error } = await sb.rpc('handbook_mark_read', { p_person_id: personId, p_policy_key: key })
    if (error || !data?.ok) {
      setReadSet(prev => { const n = { ...prev }; delete n[key]; return n })
      toast('Could not save progress')
    }
  }

  async function submitSignature() {
    if (!sigChecked || !sigName.trim()) { toast('Please check the acknowledgment box and enter your name'); return }
    if (!personId) { toast('You must be signed in to sign the handbook'); return }
    const firstNode = (me?.nodes || []).map(n => (n && n.id) ? n.id : n).filter(Boolean)[0] || null
    const { data, error } = await sb.rpc('handbook_sign', {
      p_person_id: personId,
      p_person_name: sigName,
      p_version: doc.version || '1.0',
      p_node_id: firstNode,
      p_ack: 'I have received, read, and understood the Twisted Growers Employee Handbook.',
    })
    if (error || !data?.ok) { toast('Signature not saved — try again'); return }
    setSigned(true)
    setSignedDate(fmtDate(data.signed_at || new Date().toISOString()))
    toast('Handbook signed successfully')
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 16 }}>
      {/* TOC Sidebar */}
      <div>
        <div style={{ ...S.card, position: 'sticky', top: 0, maxHeight: 'calc(100vh - 200px)', overflowY: 'auto' }}>
          <div style={S.cardHeader}><span style={S.cardTitle}>Contents</span></div>
          <div style={S.cardBody}>
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 11, color: 'var(--t-text-muted)', marginBottom: 4 }}>Progress: {readCount}/{totalSections}</div>
              <div style={{ height: 4, background: 'var(--t-line)', borderRadius: 0 }}>
                <div style={{ height: '100%', background: 'var(--t-accent)', width: `${progress}%`, transition: 'width 0.3s' }} />
              </div>
            </div>
            {visiblePolicies.map(p => (
              <div key={p.id} onClick={() => setActiveToc(p.id)} style={{ padding: '6px 0', cursor: 'pointer', fontSize: 12, color: activeToc === p.id ? 'var(--t-accent)' : readSet[p.id] ? 'var(--t-text-muted)' : 'var(--t-text)', borderBottom: '1px solid var(--t-line)', display: 'flex', alignItems: 'center', gap: 6 }}>
                {readSet[p.id] ? <span style={{ color: 'var(--t-success)', fontSize: 10 }}>✓</span> : <span style={{ width: 10 }} />}
                <span style={{ flex: 1, lineHeight: 1.3 }}>{p.title}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Main content */}
      <div>
        {/* Cover mini */}
        <div style={{ ...S.card, marginBottom: 16 }}>
          <div style={{ background: 'linear-gradient(135deg, #1e1b4b, #7c3aed, #c4b5fd)', padding: '24px 32px', color: '#fff', textAlign: 'center' }}>
            <div style={{ fontSize: 20, fontWeight: 900, letterSpacing: 2, textTransform: 'uppercase' }}>TG</div>
            <div style={{ fontSize: 13, opacity: 0.7, marginBottom: 4 }}>Employee Handbook 2026</div>
            <div style={{ fontSize: 11, opacity: 0.6 }}>Effective January 1, 2026 · v{published.version || '2.1'}</div>
          </div>
          <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 12, color: 'var(--t-text-muted)' }}>Your progress:</span>
            <div style={{ flex: 1, height: 6, background: 'var(--t-line)' }}>
              <div style={{ height: '100%', background: progress === 100 ? 'var(--t-success)' : 'var(--t-accent)', width: `${progress}%`, transition: 'width 0.3s' }} />
            </div>
            <span style={{ fontSize: 12, color: 'var(--t-text-muted)' }}>{readCount} of {totalSections} sections read ({progress}%)</span>
          </div>
        </div>

        {/* Policy sections — Bliss Book */}
        {visiblePolicies.map((p, idx) => (
          <BlissPolicy key={p.id} policy={p} seqNum={idx + 1} read={!!readSet[p.id]} onRead={() => markRead(p.id)} />
        ))}

        {/* E-Signature */}
        {published.require_sig && !signed && (
          <div style={{ ...S.card, border: '1px solid var(--t-accent)' }}>
            <div style={S.cardHeader}><span style={S.cardTitle}>Electronic Signature Required</span></div>
            <div style={S.cardBody}>
              <div style={{ fontSize: 13, color: 'var(--t-text)', lineHeight: 1.7, marginBottom: 16 }}>
                By signing below, I acknowledge that I have received and read the Twisted Growers Employee Handbook and agree to comply with all policies and procedures contained herein. I understand that my employment is at-will and that this handbook does not constitute a contract of employment.
              </div>
              <label style={S.label}>Full Name</label>
              <input style={{ ...S.input, maxWidth: 280 }} value={sigName} onChange={e => setSigName(e.target.value)} placeholder="Enter your full name" />
              <div style={{ fontSize: 11, color: 'var(--t-text-muted)', marginTop: 8, marginBottom: 12 }}>
                Date: {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })} (auto)
              </div>
              <label style={{ ...S.row, cursor: 'pointer', marginBottom: 16 }}>
                <input type="checkbox" checked={sigChecked} onChange={e => setSigChecked(e.target.checked)} style={{ accentColor: 'var(--t-accent)', width: 14, height: 14 }} />
                <span style={{ fontSize: 13, color: 'var(--t-text)' }}>I have read and understand this handbook</span>
              </label>
              <button style={{ ...S.btn, background: sigChecked && sigName.trim() ? 'var(--t-accent)' : 'var(--t-line)', color: sigChecked && sigName.trim() ? '#000' : 'var(--t-text-muted)', cursor: sigChecked && sigName.trim() ? 'pointer' : 'not-allowed' }} onClick={submitSignature}>
                Sign & Submit
              </button>
            </div>
          </div>
        )}

        {signed && (
          <div style={{ ...S.card, border: '1px solid var(--t-success)', background: 'rgba(34,197,94,0.06)' }}>
            <div style={{ padding: 24, textAlign: 'center' }}>
              <div style={{ fontSize: 32, color: 'var(--t-success)', fontWeight: 900, marginBottom: 8 }}>SIGNED ✓</div>
              <div style={{ fontSize: 14, color: 'var(--t-text)', fontWeight: 600 }}>You have signed the 2026 Employee Handbook</div>
              {signedDate && <div style={{ fontSize: 12, color: 'var(--t-text-muted)', marginTop: 4 }}>Signed on {signedDate}</div>}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── MAIN COMPONENT ────────────────────────────────────────────────────────────
const TABS = ['Handbook Design', 'Content Builder', 'Publish & Preview', 'Signature Center', 'Law Alerts', 'Role-Based Access', 'My Handbook']

export default function HandbookBuilder() {
  const { session } = useAuth()
  const config = useConfig()
  const enabled = useFeatureFlag('handbook_builder')
  const [activeTab, setActiveTab] = useState(0)
  const [toast, setToast] = useState(null)
  const toastFn = (msg) => setToast(msg)

  const person = session?.person
  const roleName = person?.role_name || person?.title || ''
  const isHR = isHRRole(roleName)
  const actorId = getSession().id || null

  // Live overview data (real backend)
  const nodeIds = useNodeIds()
  const [ov, setOv] = useState({ doc: {}, roster: [], lawStatus: {} })
  useEffect(() => {
    let alive = true
    Promise.all([
      loadDoc().catch(() => ({})),
      sb.rpc('handbook_signature_roster', { p_node_ids: nodeIds.length ? nodeIds : null }),
      sb.rpc('handbook_get_law_status'),
    ]).then(([doc, r, l]) => {
      if (!alive) return
      setOv({
        doc: doc || {},
        roster: (!r.error && Array.isArray(r.data)) ? r.data : [],
        lawStatus: (!l.error && l.data && typeof l.data === 'object') ? l.data : {},
      })
    }).catch(() => {})
    return () => { alive = false }
  }, [nodeIds, activeTab])

  const openAlertsList = LAW_ALERTS.filter(a => (ov.lawStatus[String(a.id)] || 'unreviewed') === 'unreviewed')
  const openAlerts = openAlertsList.length
  const totalEmp = ov.roster.length
  const totalSigned = ov.roster.filter(e => e.status === 'signed').length
  const version = ov.doc.version || '1.0'
  const lastUpdated = ov.doc.updated_at ? fmtDate(ov.doc.updated_at) : '—'

  const [drill, setDrill] = useState(null)
  const OV_SIG_COLS = [
    { key: 'name', label: 'Employee', value: e => e.name },
    { key: 'location', label: 'Location', value: e => e.location || '—' },
    { key: 'role', label: 'Role', value: e => e.role },
    { key: 'signed', label: 'Signed', value: e => (e.status === 'signed' ? 'Signed' : e.status === 'outdated' ? 'Outdated' : 'Not Signed'), sortKey: e => (e.status === 'signed' ? 2 : e.status === 'outdated' ? 1 : 0) },
  ]
  const OV_ALERT_COLS = [
    { key: 'title', label: 'Alert', value: a => a.title },
    { key: 'scope', label: 'Scope', value: a => a.scope },
    { key: 'affects', label: 'Affects Policies', value: a => a.affects },
    { key: 'detail', label: 'Detail', value: a => a.detail },
  ]

  if (!enabled) {
    return (
      <div style={{ ...S.page, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', color: 'var(--t-text-muted)' }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>🔒</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--t-text)', marginBottom: 4 }}>Handbook Builder</div>
          <div style={{ fontSize: 13 }}>This feature is currently disabled. Contact your administrator.</div>
        </div>
      </div>
    )
  }

  return (
    <div style={S.page}>
      {toast && <Toast msg={toast} onDone={() => setToast(null)} />}

      <div style={S.header}>
        <div style={S.title}>Employee Handbook Builder</div>
        <div style={S.sub}>Twisted Growers — Twisted Growers</div>
      </div>

      <div style={S.kpiRow}>
        <KTile label="Published Version" value={`v${version}`} sub={ov.doc.status === 'published' ? 'Published' : 'Draft'}
          onClick={() => setDrill({ title: 'Handbook Signature Status — All Employees', subtitle: `${totalEmp} employee${totalEmp === 1 ? '' : 's'}`, columns: OV_SIG_COLS, rows: ov.roster, accent: 'var(--t-accent)' })} />
        <KTile label="Signatures" value={totalEmp ? `${totalSigned}/${totalEmp}` : '0'} sub={totalEmp ? `${Math.round((totalSigned / totalEmp) * 100)}% complete` : 'no employees yet'} color="var(--t-success)"
          onClick={() => setDrill({ title: 'Handbook Signatures', subtitle: `${totalEmp} employee${totalEmp === 1 ? '' : 's'}`, columns: OV_SIG_COLS, rows: ov.roster, accent: 'var(--t-success)' })} />
        <KTile label="Open Alerts" value={openAlerts} sub="law changes requiring review" alert={openAlerts > 0 ? 'amber' : undefined}
          onClick={() => setDrill({ title: 'Open Law Alerts', subtitle: `${openAlerts} alert${openAlerts === 1 ? '' : 's'}`, columns: OV_ALERT_COLS, rows: openAlertsList, accent: '#f59e0b' })} />
        <KTile label="Last Updated" value={lastUpdated} sub={ov.doc.status === 'published' ? 'last published change' : 'last saved change'}
          onClick={() => setDrill({ title: 'All Law Alerts', subtitle: `${LAW_ALERTS.length} alerts`, columns: OV_ALERT_COLS, rows: LAW_ALERTS, accent: 'var(--t-accent)' })} />
      </div>

      <div style={S.tabs}>
        {isHR
          ? TABS.map((tab, i) => <TabBtn key={tab} label={tab} active={activeTab === i} onClick={() => setActiveTab(i)} />)
          : <TabBtn label="My Handbook" active={true} onClick={() => {}} />
        }
      </div>

      {/* Render active tab */}
      {isHR ? (
        <>
          {activeTab === 0 && <TabDesign toast={toastFn} actorId={actorId} />}
          {activeTab === 1 && <TabContent toast={toastFn} actorId={actorId} />}
          {activeTab === 2 && <TabPublish toast={toastFn} actorId={actorId} />}
          {activeTab === 3 && <TabSignatures toast={toastFn} />}
          {activeTab === 4 && <TabLawAlerts toast={toastFn} actorId={actorId} />}
          {activeTab === 5 && <TabAccess toast={toastFn} actorId={actorId} />}
          {activeTab === 6 && <TabMyHandbook toast={toastFn} />}
        </>
      ) : (
        <TabMyHandbook toast={toastFn} />
      )}

      <DrillDown open={!!drill} onClose={() => setDrill(null)} {...(drill || {})} />
    </div>
  )
}
