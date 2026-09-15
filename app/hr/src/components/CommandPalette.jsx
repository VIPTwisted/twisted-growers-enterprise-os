// CommandPalette.jsx — global Cmd/Ctrl-K search & jump across every screen.
// Fuzzy-matches destinations, keyboard-navigable, opens instantly anywhere.
import { useState, useEffect, useRef, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'

// curated jump targets across the whole platform (label, path, group, keywords)
const TARGETS = [
  ['Dashboard', '/', 'Main', 'home overview cockpit'],
  ['Experience Hub', '/experience', 'Main', 'viva engagement'],
  ['Command Center', '/command-center', 'Boards', 'ops'],
  ['Schedule Command Center', '/schedule-center', 'Scheduling', 'shifts roster assign coverage zones'],
  ['Coverage Monitor', '/coverage-monitor', 'Scheduling', 'callout coverage live'],
  ['Weekly Schedule', '/schedule', 'Scheduling', ''],
  ['Calendar View', '/cal', 'Scheduling', ''],
  ['AI Scheduler', '/ai-schedule', 'Scheduling', 'auto generate'],
  ['Availability', '/availability', 'Scheduling', ''],
  ['Time Clock', '/timeclock', 'Time', 'punch clock in out'],
  ['Attendance Manager', '/attendance', 'Time', 'callout late ncns'],
  ['Callout Tracker', '/callout', 'Time', ''],
  ['Time-Off Approvals', '/time-off-board', 'Time', 'pto vacation'],
  ['Staff Roster', '/roster', 'Employee', 'directory people'],
  ['Employee 360', '/employee-360', 'Employee', 'forensic file'],
  ['Org Chart', '/org-chart', 'Employee', 'hierarchy'],
  ['Flight-Risk Model', '/flight-risk', 'Employee', 'retention attrition churn'],
  ['9-Box & Succession', '/nine-box', 'Employee', 'talent grid potential performance succession bench nine box'],
  ['Health Scores', '/health-scores', 'Employee', ''],
  ['Skills Matrix', '/skills-matrix', 'Employee', 'certification'],
  ['Performance Reviews', '/reviews', 'Employee', 'appraisal'],
  ['Appraisals', '/appraisals', 'Employee', 'review cycle'],
  ['Disciplinary Actions', '/disciplinary', 'Policies', 'da warning write-up'],
  ['Incidents', '/incidents', 'Policies', 'theft injury safety'],
  ['CT Compliance', '/ct-compliance', 'Policies', 'labor law'],
  ['Cert Expirations', '/compliance-expirations', 'Policies', 'expiring i-9 training'],
  ['Onboarding Hub', '/onboarding-hub', 'Hiring', 'new hire'],
  ['AI Staffing Planner', '/hiring-planner', 'Hiring', 'requisition need'],
  ['AI Availability Import', '/availability-import', 'Hiring', 'application parse'],
  ['Recruiting Board', '/recruiting', 'Hiring', 'applicants ats'],
  ['Applicant Tracking', '/ats', 'Hiring', ''],
  ['Training & Dev', '/training', 'Training', 'courses lms'],
  ['Learning Paths', '/learning-paths', 'Training', 'journey'],
  ['Academy', '/academy', 'Training', ''],
  ['Reports', '/reports', 'Business', 'export analytics'],
  ['Analytics', '/analytics', 'Business', 'insights export'],
  ['Labor Budget', '/labor-budget', 'Business', 'cost variance actual'],
  ['Benchmarking', '/benchmarking', 'Business', 'compare locations rank'],
  ['KPI Dashboard', '/kpi', 'Business', ''],
  ['Payroll', '/payroll', 'Business', 'hours ot pay'],
  ['Sales Tracker', '/sales', 'Business', 'revenue transactions'],
  ['Audit Log', '/audit-log', 'Admin', 'trail forensic'],
  ['Feature Flags', '/feature-toggles', 'Admin', 'permissions access'],
  ['e-Sign', '/sign', 'Boards', 'signature document'],
  ['Help Desk', '/helpdesk', 'Boards', 'ticket'],
  ['Tasks Board', '/tasks-board', 'Boards', ''],
  ['Pulse Surveys', '/pulse', 'Engagement', 'enps mood survey'],
  ['Insights', '/insights', 'Engagement', ''],
  ['Messages', '/messages', 'Comms', 'chat'],
  ['Daily Huddle', '/huddle', 'Comms', ''],
  ['Settings', '/settings', 'Admin', 'config'],
]

export default function CommandPalette() {
  const nav = useNavigate()
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [idx, setIdx] = useState(0)
  const inputRef = useRef(null)

  useEffect(() => {
    const h = (e) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) { e.preventDefault(); setOpen(o => !o); setQ(''); setIdx(0) }
      else if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [])
  useEffect(() => { if (open) setTimeout(() => inputRef.current?.focus(), 30) }, [open])

  const results = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return TARGETS.slice(0, 8)
    return TARGETS.map(t => {
      const hay = (t[0] + ' ' + t[2] + ' ' + t[3]).toLowerCase()
      let score = 0
      if (t[0].toLowerCase().startsWith(s)) score += 10
      if (hay.includes(s)) score += 5
      // subsequence fuzzy
      let j = 0; for (const ch of hay) { if (ch === s[j]) j++; if (j === s.length) break }
      if (j === s.length) score += 2
      return { t, score }
    }).filter(r => r.score > 0).sort((a, b) => b.score - a.score).slice(0, 12).map(r => r.t)
  }, [q])

  useEffect(() => { setIdx(0) }, [q])
  if (!open) return null

  const go = (t) => { setOpen(false); nav(t[1]) }
  const onKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setIdx(i => Math.min(results.length - 1, i + 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setIdx(i => Math.max(0, i - 1)) }
    else if (e.key === 'Enter' && results[idx]) { e.preventDefault(); go(results[idx]) }
  }

  return (
    <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(4,8,18,0.6)', zIndex: 10002, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: '12vh' }}>
      <div onClick={e => e.stopPropagation()} style={{ width: 'min(560px, 94vw)', background: 'var(--t-bg)', border: '1px solid var(--t-accent)', boxShadow: '0 24px 70px rgba(0,0,0,.6)' }}>
        <input ref={inputRef} value={q} onChange={e => setQ(e.target.value)} onKeyDown={onKey}
          placeholder="Jump to… (type a screen, then Enter)"
          style={{ width: '100%', boxSizing: 'border-box', background: 'var(--t-surface)', border: 'none', borderBottom: '1px solid var(--t-line)', color: 'var(--t-text)', padding: '14px 16px', fontSize: 15, outline: 'none' }} />
        <div style={{ maxHeight: 360, overflowY: 'auto' }}>
          {results.length === 0 && <div style={{ padding: 18, fontSize: 13, color: 'var(--t-text-faint)' }}>No matches.</div>}
          {results.map((t, i) => (
            <div key={t[1]} onMouseEnter={() => setIdx(i)} onClick={() => go(t)}
              style={{ padding: '10px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, background: i === idx ? 'var(--t-surface-2)' : 'transparent', borderLeft: i === idx ? '3px solid var(--t-accent)' : '3px solid transparent' }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--t-text)' }}>{t[0]}</span>
              <span style={{ marginLeft: 'auto', fontSize: 9, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--t-text-faint)', border: '1px solid var(--t-line)', padding: '1px 6px' }}>{t[2]}</span>
            </div>
          ))}
        </div>
        <div style={{ padding: '8px 16px', borderTop: '1px solid var(--t-line)', background: 'var(--t-surface)', fontSize: 10, color: 'var(--t-text-faint)', display: 'flex', gap: 14 }}>
          <span>↑↓ navigate</span><span>⏎ open</span><span>esc close</span><span style={{ marginLeft: 'auto' }}>⌘/Ctrl-K anywhere</span>
        </div>
      </div>
    </div>
  )
}
