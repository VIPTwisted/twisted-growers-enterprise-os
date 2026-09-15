import { useState, useEffect, useCallback, useRef } from 'react'
import { sb } from '../lib/supabase'
import { useAuth } from '../lib/auth.jsx'
import { useScope } from '../lib/scope.jsx'
import { useFeatureFlag } from '../lib/featureFlags.js'
import { useConfig } from '../lib/config.js'
import DrillDown from '../components/DrillDown.jsx'
import { companyName } from '../lib/config.js'

// ── Role helpers ─────────────────────────────────────────────────────────────
const isHRRole = (r = '') =>
  ['ceo', 'hr', 'manager', 'coo', 'admin', 'owner'].some(k => r.toLowerCase().includes(k))

// ── Constants ────────────────────────────────────────────────────────────────
const CATEGORIES = ['All', 'HR Policy', 'Employee File', 'Training', 'Legal', 'Operations', 'Handbook', 'Compliance', 'Tax', 'Contract', 'Custom']
const STATUSES   = ['All', 'active', 'draft', 'archived']
const LOCATIONS  = ['All', 'Lakeville — Cultivation', 'Lakeville — Manufacturing', 'Dispensary (planned)']
const DOC_TYPES  = ['All', 'policy', 'sop', 'handbook', 'contract', 'form', 'custom']
const ROLES_LIST = ['All Roles', 'Admin/Owner', 'CEO', 'CFO', 'HR Manager', 'Department Head', 'Lead', 'Associate']
const TABS       = ['Library', 'Upload', 'Distribute', 'AI Generator', 'Distribution Log', 'I-9 Expiry', 'Handbook']

const WORK_AUTH_TYPES = ['US Citizen', 'Permanent Resident', 'EAD', 'H-1B', 'TN']

const CAT_COLOR = {
  'HR Policy':     'var(--t-accent)',
  'Employee File': 'var(--t-success)',
  'Training':      'var(--t-warn)',
  'Legal':         'var(--t-danger)',
  'Operations':    'var(--t-accent)',
  'Handbook':      'var(--t-success)',
  'Compliance':    'var(--t-warn)',
  'Tax':           'var(--t-danger)',
  'Contract':      'var(--t-danger)',
  'Custom':        '#a78bfa',
}

const STATUS_CLS = { active: 'badge green', draft: 'badge amber', archived: 'badge red' }
const TYPE_CLS   = { policy: 'badge blue', sop: 'badge blue', handbook: 'badge green', contract: 'badge red', form: 'badge amber', custom: 'badge amber' }

// ── Date helpers ──────────────────────────────────────────────────────────────
const fromNow = n => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().split('T')[0] }

// ── AI document templates ────────────────────────────────────────────────────
const TODAY = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
const FUTURE30  = new Date(Date.now() + 30  * 86400000).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
const FUTURE60  = new Date(Date.now() + 60  * 86400000).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
const FUTURE90  = new Date(Date.now() + 90  * 86400000).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
const FINAL_PAY = new Date(Date.now() +  3  * 86400000).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })

const AI_QUICK = [
  { label: 'Performance Improvement Plan (PIP)', key: 'pip' },
  { label: 'Final Written Warning',              key: 'final_warning' },
  { label: 'Termination Letter',                 key: 'termination' },
  { label: 'First Written Warning',              key: 'first_warning' },
  { label: 'Job Offer Letter',                   key: 'offer' },
  { label: 'Promotion Letter',                   key: 'promotion' },
  { label: 'Leave of Absence Approval',          key: 'loa' },
  { label: 'Return to Work Letter',              key: 'rtw' },
]

const AI_TEMPLATES = {
  pip: (emp = '[Employee Name]', mgr = '[Manager Name]') => ({
    title: `Performance Improvement Plan — ${emp}`,
    body: `PERFORMANCE IMPROVEMENT PLAN (PIP)
{companyName()} — Massachusetts

Date:       ${TODAY}
Employee:   ${emp}
Position:   [Job Title] — [Location]
Manager:    ${mgr}
HR Contact: [HR Manager Name]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

PURPOSE
This Performance Improvement Plan (PIP) is designed to provide ${emp} with a structured framework for addressing and correcting specific performance deficiencies identified below. Successful completion of this plan is required to maintain continued employment.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

PERFORMANCE DEFICIENCIES IDENTIFIED

1. Attendance & Punctuality
   ${emp} has accumulated [X] unexcused tardies and [Y] unscheduled absences in the past 60 days, exceeding the company threshold defined in the Employee Handbook §4.3.

2. Sales Performance
   Monthly sales figures are consistently [X]% below the minimum store average. Target units per transaction (UPT) has not been met for [Z] consecutive periods.

3. Policy Compliance
   [Describe specific policy violation(s), e.g., register procedures, opening/closing protocol, required uniform standards]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

IMPROVEMENT TARGETS & MILESTONES

30-Day Checkpoint (${FUTURE30})
  □ Zero unexcused absences or tardies
  □ UPT at or above store average for at least 3 of 4 weeks
  □ Completion of refresher training module [Module Name]
  □ Signed acknowledgment of all applicable policies

60-Day Checkpoint (${FUTURE60})
  □ Sustained zero unexcused absences
  □ Sales performance within 5% of store average
  □ Demonstrated consistent adherence to [specific policy]

90-Day Final Review (${FUTURE90})
  □ Full compliance with all attendance requirements
  □ Sales performance meets or exceeds store average
  □ Manager assessment: "meets expectations" or higher
  □ No additional policy violations of any kind

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

SUPPORT PROVIDED
- Weekly 15-minute check-in meetings with ${mgr}
- Access to additional product training resources
- Open-door HR consultation available upon request

CONSEQUENCES
Failure to meet the benchmarks outlined above within the 90-day review period may result in further disciplinary action up to and including termination of employment.

This document does not alter the at-will nature of employment at ${companyName()}.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

SIGNATURES

Employee:  ____________________________  Date: ____________
Manager:   ____________________________  Date: ____________
HR:        ____________________________  Date: ____________

Copy provided to: Employee  ☐   HR File  ☐   Direct Manager  ☐
`,
  }),

  first_warning: (emp = '[Employee Name]', mgr = '[Manager Name]') => ({
    title: `First Written Warning — ${emp}`,
    body: `FIRST WRITTEN WARNING
{companyName()} — Massachusetts

Date:      ${TODAY}
Employee:  ${emp}
Position:  [Job Title] — [Location]
Manager:   ${mgr}
Policy:    ${companyName()} Employee Handbook §4.1 — Progressive Discipline

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

NOTICE OF FIRST WRITTEN WARNING

This written warning is being issued to ${emp} regarding the following policy violation(s):

Violation:   [Describe the specific infraction, e.g., "unexcused absence on [date]", "failure to follow register close-out procedure on [date]", "unapproved use of employee discount"]

Date of Incident: [Date]
Location of Incident: [Store / Area]

Previous Verbal Warning on File: ☐ Yes — Date: _________   ☐ No

DESCRIPTION OF INCIDENT
[Provide a factual, objective account of what occurred, what policy was violated, and any impact on store operations, coworkers, or customers.]

EXPECTED BEHAVIOR GOING FORWARD
Consistent adherence to all ${companyName()} policies and procedures as outlined in the Employee Handbook. Any recurrence of this or similar conduct may result in escalated disciplinary action, including a Final Written Warning or termination.

EMPLOYEE RESPONSE (optional)
[Space for employee's written response or rebuttal, to be attached]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

SIGNATURES

By signing below, the employee acknowledges receipt of this warning. Acknowledgment does not constitute agreement.

Employee:  ____________________________  Date: ____________
Manager:   ____________________________  Date: ____________
HR:        ____________________________  Date: ____________
`,
  }),

  final_warning: (emp = '[Employee Name]', mgr = '[Manager Name]') => ({
    title: `Final Written Warning — ${emp}`,
    body: `FINAL WRITTEN WARNING
{companyName()} — Massachusetts

⚠ THIS IS YOUR FINAL WARNING PRIOR TO TERMINATION ⚠

Date:      ${TODAY}
Employee:  ${emp}
Position:  [Job Title] — [Location]
Manager:   ${mgr}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

PRIOR DISCIPLINARY HISTORY

1. Verbal Warning — Date: _________   Issue: _______________
2. First Written Warning — Date: _________   Issue: _______________
3. [Additional actions if applicable]

CURRENT VIOLATION
[Describe the specific conduct or performance failure that has prompted this Final Written Warning. Reference any previous warnings and note the pattern of behavior.]

Date of Current Incident: [Date]
Policy Reference: ${companyName()} Employee Handbook §[Section]

CONSEQUENCES
Any further violations of company policy, repetition of the behaviors described above, or failure to meet the performance standards established during any active Performance Improvement Plan will result in the immediate termination of ${emp}'s employment with ' + companyName() + '.

This is a final opportunity to correct the pattern of conduct described herein.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

SIGNATURES

Employee:  ____________________________  Date: ____________
Manager:   ____________________________  Date: ____________
HR:        ____________________________  Date: ____________

Witness:   ____________________________  Date: ____________
`,
  }),

  termination: (emp = '[Employee Name]', mgr = '[Manager Name]') => ({
    title: `Termination Letter — ${emp}`,
    body: `NOTICE OF EMPLOYMENT TERMINATION
{companyName()} (${companyName()}) — Massachusetts

CONFIDENTIAL

Date:      ${TODAY}
Employee:  ${emp}
Position:  [Job Title] — [Location]
Last Day:  ${TODAY}
Manager:   ${mgr}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Dear ${emp},

This letter serves as formal notice that your employment with ${companyName()} is terminated effective ${TODAY}.

REASON FOR TERMINATION
[Select applicable: Voluntary Resignation / Involuntary Termination — Performance / Involuntary Termination — Misconduct / Position Elimination / End of Temporary Assignment]

Details: [Provide a clear, factual description of the reason(s) for termination. Reference any prior warnings, PIP milestones missed, or documented policy violations.]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

FINAL PAY & BENEFITS

Final Paycheck Date: ${FINAL_PAY}
Method: [Direct Deposit / Manual Check — pick up at [Location]]

Accrued PTO Payout: [X hours × $Y/hr = $Z — per CT P.A. 11-52]

Health Insurance: Coverage ends [last day of month of termination]. COBRA continuation notice will be mailed within 14 days.

401(k) / Retirement: Contact [Plan Administrator] at [phone] to discuss options for your account balance.

Employee Discount: Terminated immediately as of today.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

RETURN OF COMPANY PROPERTY

Please return the following items to your manager immediately:
  ☐ Store keys / key fob
  ☐ Company-issued uniforms or apparel
  ☐ Any company-issued devices or equipment
  ☐ All confidential documents or materials

Failure to return company property may result in deduction from final pay to the extent permitted by Massachusetts law.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CONFIDENTIALITY
You remain bound by any Non-Disclosure Agreement or Confidentiality Agreement signed during your employment. Unauthorized disclosure of proprietary company information is prohibited.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

SIGNATURES

Manager:   ____________________________  Date: ____________
HR:        ____________________________  Date: ____________
Employee:  ____________________________  Date: ____________

(Employee signature acknowledges receipt — not agreement)
`,
  }),

  offer: (emp = '[Candidate Name]') => ({
    title: `Job Offer Letter — ${emp}`,
    body: `OFFER OF EMPLOYMENT
{companyName()} (${companyName()}) — Massachusetts

Date: ${TODAY}

Dear ${emp},

On behalf of ${companyName()}, we are pleased to offer you the position of [Job Title] at our [Location] location. We believe your skills and experience will be a great addition to our team.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

POSITION DETAILS

Title:          [Job Title]
Department:     [Department]
Location:       [Store Location] — [Address]
Reports To:     [Supervisor Name], [Supervisor Title]
Employment Type: ☐ Full-Time (30+ hrs/wk)   ☐ Part-Time
Start Date:     [Start Date]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

COMPENSATION

Base Pay:       $[X.XX] per hour
Pay Frequency:  Bi-weekly (every other Friday)
Pay Method:     Direct deposit or check — your choice

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

BENEFITS

- PTO Accrual: Begins accruing after 90 days of employment
- Employee Discount: [X]% on all store merchandise
- Training: Access to ${companyName()} Learning Platform
- Advancement: Internal promotion pathways available to all employees
- Additional benefits as described in the Employee Handbook

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CONDITIONS OF EMPLOYMENT

This offer is contingent upon:
  1. Successful completion of a background check
  2. Completion of I-9 employment eligibility verification
  3. Submission of all required onboarding paperwork prior to your start date
  4. [If applicable] Successful receipt of Massachusetts cannabis retail permit

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

AT-WILL EMPLOYMENT
Employment with ${companyName()} is at-will. Either party may end the employment relationship at any time, with or without cause and with or without prior notice.

Please indicate your acceptance by signing and returning this letter no later than [Response Deadline].

We look forward to welcoming you to the ${companyName()} family!

Warmly,
[Hiring Manager Name]
[Title] — ${companyName()}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

I accept the above offer of employment:

Signature:  ____________________________  Date: ____________
Printed:    ${emp}
`,
  }),

  promotion: (emp = '[Employee Name]') => ({
    title: `Promotion Letter — ${emp}`,
    body: `LETTER OF PROMOTION
{companyName()} — Massachusetts

Date:      ${TODAY}
Employee:  ${emp}
From:      [Current Title]
To:        [New Title]
Effective: [Effective Date]

Dear ${emp},

It is our pleasure to inform you that, effective [Effective Date], you are being promoted to the position of [New Title] at ${companyName()} — [Location].

This promotion reflects your consistent performance, reliability, and the leadership qualities you have demonstrated over the past [X months/years]. We are confident that you will excel in this expanded role.

CHANGES TO YOUR COMPENSATION & RESPONSIBILITIES

New Title:          [New Job Title]
New Hourly Rate:    $[X.XX] per hour (previously $[Y.YY])
New Schedule:       [Schedule details if changed]
Additional Duties:  [Key new responsibilities]

All other terms of your employment remain unchanged.

Please acknowledge receipt and acceptance of this promotion by signing below.

Congratulations — your hard work has earned this.

[Manager Name]
[Title] — ${companyName()}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Employee:  ____________________________  Date: ____________
Manager:   ____________________________  Date: ____________
`,
  }),

  loa: (emp = '[Employee Name]') => ({
    title: `Leave of Absence Approval — ${emp}`,
    body: `LEAVE OF ABSENCE APPROVAL
{companyName()} — Massachusetts

Date:         ${TODAY}
Employee:     ${emp}
Position:     [Job Title] — [Location]
Leave Type:   ☐ Medical   ☐ Family   ☐ Personal   ☐ FMLA   ☐ Military
Leave Start:  [Start Date]
Leave End:    [End Date — Estimated]

Dear ${emp},

Your request for a leave of absence has been reviewed and is hereby approved subject to the conditions outlined below.

TERMS OF LEAVE

1. Duration: Your leave is approved from [Start Date] through [End Date]. Extensions must be requested in writing at least 5 business days before this date.

2. Pay Status: ☐ Paid (using accrued PTO)   ☐ Unpaid   ☐ Partially paid ([X] hours PTO applied)

3. Benefits Continuation: Health insurance coverage will continue during this leave. You are responsible for your normal employee contribution amount of $[X] per pay period.

4. Return to Work: You are expected to return to your regular position on [Return Date]. A physician's release may be required before resuming work duties.

5. Contact During Leave: Please provide updated contact information and check in with HR on [Check-in Date].

6. FMLA (if applicable): This leave has been designated as FMLA-qualifying under the Family and Medical Leave Act, 29 U.S.C. § 2601 et seq.

This approval does not alter the at-will nature of your employment.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

HR:        ____________________________  Date: ____________
Manager:   ____________________________  Date: ____________
Employee:  ____________________________  Date: ____________
`,
  }),

  rtw: (emp = '[Employee Name]') => ({
    title: `Return to Work Letter — ${emp}`,
    body: `RETURN TO WORK AUTHORIZATION
{companyName()} — Massachusetts

Date:          ${TODAY}
Employee:      ${emp}
Position:      [Job Title] — [Location]
Leave Period:  [Start Date] — [End Date]
Return Date:   [Return Date]

Dear ${emp},

We are pleased to confirm your approved return to work effective [Return Date], following your approved leave of absence.

RETURN CONDITIONS

1. Medical Clearance: ☐ Required — Please provide a physician's release to HR before your first shift.   ☐ Not required for this leave type.

2. Schedule: You will return to your previous schedule of [Schedule]. Any requested modifications must be submitted to your manager in advance.

3. Accommodations: ☐ No accommodations required.   ☐ The following temporary accommodations have been approved: [Describe accommodations, if any, e.g., light duty, modified hours]

4. Performance Expectations: Upon your return, all standard performance expectations apply as outlined in the Employee Handbook and any active performance documentation.

5. Benefits: All benefits resume on your return date. Please confirm direct deposit details have not changed.

We are glad to have you back. Please don't hesitate to reach out to HR with any questions or concerns.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

HR:        ____________________________  Date: ____________
Manager:   ____________________________  Date: ____________
Employee:  ____________________________  Date: ____________
`,
  }),
}

// ── Utility ───────────────────────────────────────────────────────────────────
const fmt = iso => iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'
const pct  = (n, t) => (t ? Math.round((n / t) * 100) : 0)

function exportCSV(rows, filename) {
  if (!rows.length) return
  const keys = Object.keys(rows[0])
  const csv  = [keys.join(','), ...rows.map(r => keys.map(k => `"${String(r[k] ?? '').replace(/"/g, '""')}"`).join(','))].join('\n')
  const a    = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([csv], { type: 'text/csv' })), download: filename })
  a.click()
}

// ── Shared style atoms ────────────────────────────────────────────────────────
const S = {
  input: { background: 'var(--t-surface-2)', border: '1px solid var(--t-line)', color: 'var(--t-text)', padding: '8px 12px', fontSize: 13, width: '100%', boxSizing: 'border-box', outline: 'none', fontFamily: 'inherit' },
  sel:   { background: 'var(--t-surface-2)', border: '1px solid var(--t-line)', color: 'var(--t-text)', padding: '8px 12px', fontSize: 13, cursor: 'pointer', outline: 'none', fontFamily: 'inherit' },
  lbl:   { fontSize: 11, fontWeight: 700, color: 'var(--t-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' },
  card:  { background: 'var(--t-surface)', border: '1px solid var(--t-line)', padding: 20 },
  th:    { padding: '10px 12px', textAlign: 'left', fontWeight: 700, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--t-text-muted)', whiteSpace: 'nowrap' },
  td:    { padding: '10px 12px', fontSize: 13 },
}

function btn(color, solid = false, small = false) {
  const bg  = solid ? color : 'transparent'
  const fg  = solid ? (color === 'var(--t-accent)' || color === 'var(--t-success)' ? '#000' : '#fff') : color
  return { padding: small ? '4px 10px' : '7px 16px', fontSize: small ? 11 : 12, fontWeight: 700, border: `1px solid ${color}`, background: bg, color: fg, cursor: 'pointer', whiteSpace: 'nowrap', letterSpacing: '0.03em', fontFamily: 'inherit' }
}

// ── Micro-components ──────────────────────────────────────────────────────────
function Toggle({ on, onToggle }) {
  return (
    <div onClick={onToggle} style={{ width: 40, height: 22, background: on ? 'var(--t-success)' : 'var(--t-line)', position: 'relative', cursor: 'pointer', transition: 'background .2s', flexShrink: 0 }}>
      <div style={{ position: 'absolute', top: 3, left: on ? 20 : 3, width: 16, height: 16, background: '#fff', transition: 'left .2s' }} />
    </div>
  )
}

function KpiTile({ label, value, sub, accent, onClick }) {
  return (
    <div onClick={onClick} title={onClick ? 'Click to drill into records' : undefined} style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', padding: '18px 22px', flex: 1, cursor: onClick ? 'pointer' : 'default' }}>
      <div style={{ fontSize: 28, fontWeight: 800, color: accent || 'var(--t-accent)', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--t-text)', marginTop: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--t-text-muted)', marginTop: 3 }}>{sub}</div>}
    </div>
  )
}

function ProgressBar({ done, total, height = 6 }) {
  const p  = pct(done, total)
  const fg = p === 100 ? 'var(--t-success)' : p >= 50 ? 'var(--t-warn)' : 'var(--t-danger)'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ flex: 1, height, background: 'var(--t-line)', maxWidth: 100 }}>
        <div style={{ height: '100%', width: `${p}%`, background: fg, transition: 'width .3s' }} />
      </div>
      <span style={{ fontSize: 11, fontWeight: 700, color: fg, fontVariantNumeric: 'tabular-nums' }}>{done}/{total}</span>
    </div>
  )
}

// ── View Modal ────────────────────────────────────────────────────────────────
function ViewModal({ doc, onClose }) {
  if (!doc) return null
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 9000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }} onClick={onClose}>
      <div style={{ background: 'var(--t-bg)', border: '1px solid var(--t-line)', width: '100%', maxWidth: 760, maxHeight: '90vh', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--t-line)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 15, color: 'var(--t-text)' }}>{doc.name}</div>
            <div style={{ fontSize: 11, color: 'var(--t-text-muted)', marginTop: 2 }}>
              v{doc.version} · {doc.category} · {doc.location} · {fmt(doc.created_at)}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span className={STATUS_CLS[doc.status] || 'badge amber'}>{doc.status}</span>
            {doc.requires_ack && <span className="badge green">Ack Required</span>}
            <button style={btn('var(--t-text-muted)')} onClick={onClose}>✕ Close</button>
          </div>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
          {doc.content ? (
            <pre style={{ margin: 0, fontFamily: 'monospace', fontSize: 12, whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: 'var(--t-text)', lineHeight: 1.8 }}>{doc.content}</pre>
          ) : (
            <div style={{ color: 'var(--t-text-muted)', fontSize: 13, fontStyle: 'italic' }}>
              No text content stored — this document was uploaded as a file.
              {doc.file_url && <><br /><a href={doc.file_url} target="_blank" rel="noreferrer" style={{ color: 'var(--t-accent)' }}>Open file ↗</a></>}
            </div>
          )}
        </div>
        {doc.requires_ack && (
          <div style={{ padding: 16, borderTop: '1px solid var(--t-line)', flexShrink: 0 }}>
            <ProgressBar done={doc.signed || 0} total={doc.total || 0} height={8} />
          </div>
        )}
      </div>
    </div>
  )
}

// ── Edit Modal ────────────────────────────────────────────────────────────────
function EditModal({ doc, onClose, onSave }) {
  const [name,    setName]    = useState(doc.name)
  const [cat,     setCat]     = useState(doc.category || 'HR Policy')
  const [content, setContent] = useState(doc.content || '')
  const [status,  setStatus]  = useState(doc.status)
  const [saving,  setSaving]  = useState(false)

  async function handleSave() {
    setSaving(true)
    const { data, error } = await sb.rpc('docmanager_save', {
      p_id: doc.id, p_node_id: doc.node_id ?? null, p_name: name, p_type: doc.type ?? null,
      p_category: cat, p_location: doc.location ?? null, p_version: doc.version ?? null,
      p_status: status, p_requires_ack: doc.requires_ack ?? false, p_content: content,
      p_actor: null,
    })
    setSaving(false)
    if (error) {
      window.dispatchEvent(new CustomEvent('vip-toast', { detail: { msg: 'Could not save changes: ' + error.message, type: 'error' } }))
      return
    }
    onSave(data ? { ...doc, ...data } : { ...doc, name, category: cat, content, status })
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 9000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }} onClick={onClose}>
      <div style={{ background: 'var(--t-bg)', border: '1px solid var(--t-line)', width: '100%', maxWidth: 620, display: 'flex', flexDirection: 'column', maxHeight: '90vh' }} onClick={e => e.stopPropagation()}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--t-line)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div style={{ fontWeight: 800, fontSize: 15, color: 'var(--t-text)' }}>Edit Document</div>
          <button style={btn('var(--t-text-muted)')} onClick={onClose}>✕</button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={S.lbl}>Document Name</label>
            <input value={name} onChange={e => setName(e.target.value)} style={S.input} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={S.lbl}>Category</label>
              <select value={cat} onChange={e => setCat(e.target.value)} style={S.sel}>
                {CATEGORIES.filter(c => c !== 'All').map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={S.lbl}>Status</label>
              <select value={status} onChange={e => setStatus(e.target.value)} style={S.sel}>
                {STATUSES.filter(s => s !== 'All').map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={S.lbl}>Content</label>
            <textarea value={content} onChange={e => setContent(e.target.value)} rows={10} style={{ ...S.input, resize: 'vertical' }} placeholder="Paste or type document body…" />
          </div>
        </div>
        <div style={{ padding: '12px 20px', borderTop: '1px solid var(--t-line)', display: 'flex', justifyContent: 'flex-end', gap: 10, flexShrink: 0 }}>
          <button style={btn('var(--t-text-muted)')} onClick={onClose}>Cancel</button>
          <button style={btn('var(--t-success)', true)} onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save Changes'}</button>
        </div>
      </div>
    </div>
  )
}

// ── TAB 1 — Library ───────────────────────────────────────────────────────────
function LibraryTab({ docs, setDocs, loading, isHR, reload }) {
  const [search,      setSearch]      = useState('')
  const [catFilter,   setCatFilter]   = useState('All')
  const [typeFilter,  setTypeFilter]  = useState('All')
  const [statusFil,   setStatusFil]   = useState('All')
  const [locFilter,   setLocFilter]   = useState('All')
  const [dateFrom,    setDateFrom]    = useState('')
  const [dateTo,      setDateTo]      = useState('')
  const [sort,        setSort]        = useState('newest')
  const [compact,     setCompact]     = useState(false)
  const [viewDoc,     setViewDoc]     = useState(null)
  const [editDoc,     setEditDoc]     = useState(null)
  const [drill,       setDrill]       = useState(null)

  const LIB_COLS = [
    { key: 'name', label: 'Document', value: d => d.name },
    { key: 'type', label: 'Type', value: d => d.type },
    { key: 'category', label: 'Category', value: d => d.category },
    { key: 'location', label: 'Location', value: d => d.location },
    { key: 'version', label: 'Version', value: d => `v${d.version}` },
    { key: 'signed', label: 'Signed', value: d => (d.requires_ack ? `${d.signed || 0}/${d.total || 0}` : '—'), align: 'right', sortKey: d => d.signed || 0 },
    { key: 'status', label: 'Status', value: d => d.status },
    { key: 'created_at', label: 'Added', value: d => fmt(d.created_at), sortKey: d => d.created_at },
  ]
  const openDrill = (title, rows, accent) => setDrill({ title, subtitle: `${rows.length} document${rows.length === 1 ? '' : 's'}`, columns: LIB_COLS, rows, accent })

  const filtered = docs.filter(d => {
    if (catFilter  !== 'All' && d.category !== catFilter)                      return false
    if (typeFilter !== 'All' && d.type     !== typeFilter)                     return false
    if (statusFil  !== 'All' && d.status   !== statusFil)                     return false
    if (locFilter  !== 'All' && d.location !== locFilter && d.location !== 'All') return false
    if (search && !d.name.toLowerCase().includes(search.toLowerCase()))        return false
    if (dateFrom && new Date(d.created_at) < new Date(dateFrom))               return false
    if (dateTo   && new Date(d.created_at) > new Date(dateTo + 'T23:59:59'))   return false
    return true
  }).sort((a, b) => {
    if (sort === 'newest')   return new Date(b.created_at) - new Date(a.created_at)
    if (sort === 'name')     return a.name.localeCompare(b.name)
    if (sort === 'signed')   return (b.signed || 0) - (a.signed || 0)
    if (sort === 'ack')      return (b.requires_ack ? 1 : 0) - (a.requires_ack ? 1 : 0)
    return 0
  })

  async function handleDelete(doc) {
    if (!window.confirm(`Delete "${doc.name}"? This cannot be undone.`)) return
    const { error } = await sb.rpc('docmanager_delete', { p_id: doc.id })
    if (error) {
      window.dispatchEvent(new CustomEvent('vip-toast', { detail: { msg: 'Could not delete: ' + error.message, type: 'error' } }))
      return
    }
    setDocs(prev => prev.filter(d => d.id !== doc.id))
    reload?.()
  }

  function handleEditSave(updated) {
    setDocs(prev => prev.map(d => d.id === updated.id ? updated : d))
    setEditDoc(null)
    reload?.()
  }

  const kpiTotal   = docs.length
  const kpiActive  = docs.filter(d => d.status === 'active').length
  const kpiAck     = docs.filter(d => d.requires_ack).length
  const kpiRecent  = docs.filter(d => (Date.now() - new Date(d.created_at)) / 86400000 <= 7).length

  if (loading) return <div style={{ padding: 80, textAlign: 'center', color: 'var(--t-text-muted)' }}>Loading library…</div>

  return (
    <>
      {viewDoc && <ViewModal doc={viewDoc} onClose={() => setViewDoc(null)} />}
      {editDoc && <EditModal doc={editDoc} onClose={() => setEditDoc(null)} onSave={handleEditSave} />}
      <DrillDown open={!!drill} onClose={() => setDrill(null)} {...(drill || {})} />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* KPI row */}
        <div style={{ display: 'flex', gap: 12 }}>
          <KpiTile label="Total Docs"  value={kpiTotal}  sub="in library"
            onClick={() => openDrill('All Documents', docs, 'var(--t-accent)')} />
          <KpiTile label="Active"      value={kpiActive} sub="live & available"  accent="var(--t-success)"
            onClick={() => openDrill('Active Documents', docs.filter(d => d.status === 'active'), 'var(--t-success)')} />
          <KpiTile label="Require Ack" value={kpiAck}    sub="need employee sign" accent="var(--t-warn)"
            onClick={() => openDrill('Require Acknowledgment', docs.filter(d => d.requires_ack), 'var(--t-warn)')} />
          <KpiTile label="Last 7 Days" value={kpiRecent} sub="recently added"
            onClick={() => openDrill('Added in Last 7 Days', docs.filter(d => (Date.now() - new Date(d.created_at)) / 86400000 <= 7), 'var(--t-accent)')} />
        </div>

        {/* Filter bar */}
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name…" style={{ ...S.input, width: 200 }} />
          <select value={catFilter}  onChange={e => setCatFilter(e.target.value)}  style={S.sel}>{CATEGORIES.map(c => <option key={c}>{c}</option>)}</select>
          <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} style={S.sel}>{DOC_TYPES.map(t => <option key={t}>{t}</option>)}</select>
          <select value={statusFil}  onChange={e => setStatusFil(e.target.value)}  style={S.sel}>{STATUSES.map(s => <option key={s}>{s}</option>)}</select>
          <select value={locFilter}  onChange={e => setLocFilter(e.target.value)}  style={S.sel}>{LOCATIONS.map(l => <option key={l}>{l}</option>)}</select>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={{ ...S.input, width: 150 }} />
          <input type="date" value={dateTo}   onChange={e => setDateTo(e.target.value)}   style={{ ...S.input, width: 150 }} />
          <select value={sort} onChange={e => setSort(e.target.value)} style={S.sel}>
            <option value="newest">Newest First</option>
            <option value="name">Name A–Z</option>
            <option value="signed">Most Signed</option>
            <option value="ack">Requires Ack</option>
          </select>
          <button style={btn(compact ? 'var(--t-accent)' : 'var(--t-text-muted)', compact)} onClick={() => setCompact(v => !v)}>☰ Compact</button>
          <button style={btn('var(--t-text-muted)')} onClick={() => exportCSV(filtered.map(d => ({ name: d.name, type: d.type, category: d.category, location: d.location, version: d.version, status: d.status, requires_ack: d.requires_ack, created_at: d.created_at })), 'vip-documents.csv')}>↓ CSV</button>
        </div>

        {/* List */}
        {compact ? (
          /* Compact table */
          <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'var(--t-surface-2)', borderBottom: '1px solid var(--t-line)' }}>
                  {['Name', 'Type', 'Category', 'Location', 'Version', 'Date', 'Ack', 'Signed', 'Status', ''].map(h => (
                    <th key={h} style={S.th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={10} style={{ ...S.td, textAlign: 'center', color: 'var(--t-text-muted)', padding: 32 }}>No documents match filters.</td></tr>
                ) : filtered.map((d, i) => (
                  <tr key={d.id} style={{ borderBottom: '1px solid var(--t-line)', background: i % 2 ? 'rgba(255,255,255,0.015)' : 'transparent' }}>
                    <td style={{ ...S.td, fontWeight: 600, color: 'var(--t-text)', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.name}</td>
                    <td style={S.td}><span className={TYPE_CLS[d.type] || 'badge amber'}>{d.type}</span></td>
                    <td style={S.td}><span style={{ fontSize: 11, color: CAT_COLOR[d.category] || 'var(--t-text-muted)', fontWeight: 700 }}>{d.category}</span></td>
                    <td style={{ ...S.td, color: 'var(--t-text-muted)' }}>{d.location}</td>
                    <td style={{ ...S.td, fontFamily: 'monospace', color: 'var(--t-text-muted)' }}>v{d.version}</td>
                    <td style={{ ...S.td, color: 'var(--t-text-muted)', whiteSpace: 'nowrap' }}>{fmt(d.created_at)}</td>
                    <td style={{ ...S.td, textAlign: 'center' }}>{d.requires_ack ? <span style={{ color: 'var(--t-success)', fontWeight: 700 }}>✓</span> : <span style={{ color: 'var(--t-text-faint)' }}>–</span>}</td>
                    <td style={{ ...S.td, minWidth: 110 }}>{d.requires_ack ? <ProgressBar done={d.signed || 0} total={d.total || 0} /> : <span style={{ color: 'var(--t-text-faint)', fontSize: 11 }}>—</span>}</td>
                    <td style={S.td}><span className={STATUS_CLS[d.status] || 'badge amber'}>{d.status}</span></td>
                    <td style={{ ...S.td, whiteSpace: 'nowrap' }}>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button style={btn('var(--t-accent)', false, true)} onClick={() => setViewDoc(d)}>View</button>
                        {isHR && <button style={btn('var(--t-text-muted)', false, true)} onClick={() => setEditDoc(d)}>Edit</button>}
                        {isHR && <button style={btn('var(--t-danger)', false, true)} onClick={() => handleDelete(d)}>Del</button>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          /* Card grid */
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 14 }}>
            {filtered.length === 0 ? (
              <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: 48, color: 'var(--t-text-muted)' }}>No documents match the current filters.</div>
            ) : filtered.map(d => (
              <div key={d.id} style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', display: 'flex', flexDirection: 'column' }}>
                <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--t-line)' }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--t-text)', marginBottom: 6, lineHeight: 1.3 }}>{d.name}</div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <span className={TYPE_CLS[d.type] || 'badge amber'}>{d.type}</span>
                    <span className={STATUS_CLS[d.status] || 'badge amber'}>{d.status}</span>
                    {d.requires_ack && <span className="badge green">Ack Required</span>}
                  </div>
                </div>
                <div style={{ padding: '10px 16px', display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                    <span style={{ color: 'var(--t-text-muted)' }}>Category</span>
                    <span style={{ color: CAT_COLOR[d.category] || 'var(--t-text-muted)', fontWeight: 700 }}>{d.category}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                    <span style={{ color: 'var(--t-text-muted)' }}>Location</span>
                    <span style={{ color: 'var(--t-text)', fontWeight: 600 }}>{d.location}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                    <span style={{ color: 'var(--t-text-muted)' }}>Version</span>
                    <span style={{ fontFamily: 'monospace', color: 'var(--t-text)' }}>v{d.version}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                    <span style={{ color: 'var(--t-text-muted)' }}>Added</span>
                    <span style={{ color: 'var(--t-text-muted)' }}>{fmt(d.created_at)}</span>
                  </div>
                  {d.requires_ack && (
                    <div style={{ marginTop: 4 }}>
                      <div style={{ fontSize: 11, color: 'var(--t-text-muted)', marginBottom: 4 }}>Signature progress</div>
                      <ProgressBar done={d.signed || 0} total={d.total || 0} height={5} />
                    </div>
                  )}
                </div>
                <div style={{ padding: '10px 16px', borderTop: '1px solid var(--t-line)', display: 'flex', gap: 6 }}>
                  <button style={btn('var(--t-accent)', false, true)} onClick={() => setViewDoc(d)}>View</button>
                  {isHR && <button style={btn('var(--t-text-muted)', false, true)} onClick={() => setEditDoc(d)}>Edit</button>}
                  {isHR && <button style={btn('var(--t-text-muted)', false, true)}>Distribute</button>}
                  {isHR && <button style={{ ...btn('var(--t-danger)', false, true), marginLeft: 'auto' }} onClick={() => handleDelete(d)}>Delete</button>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  )
}

// ── TAB 2 — Upload ────────────────────────────────────────────────────────────
function UploadTab({ person, nodeId, reload }) {
  const [file,       setFile]       = useState(null)
  const [dragging,   setDragging]   = useState(false)
  const [pasteMode,  setPasteMode]  = useState(false)
  const [name,       setName]       = useState('')
  const [category,   setCategory]   = useState('HR Policy')
  const [type,       setType]       = useState('policy')
  const [location,   setLocation]   = useState('All')
  const [version,    setVersion]    = useState('1.0')
  const [status,     setStatus]     = useState('active')
  const [reqAck,     setReqAck]     = useState(false)
  const [notes,      setNotes]      = useState('')
  const [content,    setContent]    = useState('')
  const [analyzing,  setAnalyzing]  = useState(false)
  const [aiResult,   setAiResult]   = useState(null)
  const [saving,     setSaving]     = useState(false)
  const [saved,      setSaved]      = useState(false)
  const fileRef = useRef()

  function pickFile(f) {
    if (!f) return
    setFile(f)
    setName(f.name.replace(/\.[^.]+$/, ''))
    setAiResult(null)
    runAI(f.name)
  }

  // Local, deterministic classifier — derives suggestions from the file name /
  // pasted title. No network, no fabricated confidence scores.
  function runAI(filename = '') {
    setAnalyzing(true)
    const lc = filename.toLowerCase()
    const suggestType     = lc.includes('policy') ? 'policy' : lc.includes('handbook') ? 'handbook' : lc.includes('contract') || lc.includes('nda') ? 'contract' : lc.includes('form') || lc.includes('w-4') || lc.includes('i-9') ? 'form' : lc.includes('sop') || lc.includes('procedure') ? 'sop' : 'custom'
    const suggestCategory = lc.includes('hr') || lc.includes('pto') || lc.includes('leave') ? 'HR Policy' : lc.includes('training') || lc.includes('onboard') ? 'Training' : lc.includes('compliance') || lc.includes('osha') || lc.includes('cannabis') ? 'Compliance' : lc.includes('contract') || lc.includes('nda') ? 'Contract' : lc.includes('tax') || lc.includes('w-4') ? 'Tax' : lc.includes('sop') || lc.includes('procedure') || lc.includes('inventory') ? 'Operations' : 'HR Policy'
    const suggestAck      = ['policy', 'handbook', 'contract'].includes(suggestType)
    setAiResult([
      { field: 'Suggested Type',     value: suggestType },
      { field: 'Suggested Category', value: suggestCategory },
      { field: 'Requires Ack',       value: suggestAck ? 'Yes' : 'No' },
      { field: 'Suggested Tags',     value: '#vip #' + suggestCategory.toLowerCase().replace(/\s/g, '-') },
      { field: 'Review Cycle',       value: suggestType === 'policy' ? 'Annual' : 'As needed' },
    ])
    setType(suggestType)
    setCategory(suggestCategory)
    setReqAck(suggestAck)
    setAnalyzing(false)
  }

  async function handleSave() {
    if (!name.trim()) return
    setSaving(true)
    const { error } = await sb.rpc('docmanager_save', {
      p_id: null, p_node_id: nodeId ?? null, p_name: name, p_type: type,
      p_category: category, p_location: location, p_version: version, p_status: status,
      p_requires_ack: reqAck, p_content: content || notes, p_actor: person?.id ?? null,
    })
    setSaving(false)
    if (error) {
      window.dispatchEvent(new CustomEvent('vip-toast', { detail: { msg: 'Could not save document: ' + error.message, type: 'error' } }))
      return
    }
    await reload?.()
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
    setFile(null); setName(''); setNotes(''); setContent(''); setAiResult(null)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Drop zone */}
      {!pasteMode ? (
        <div
          onDragOver={e => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={e => { e.preventDefault(); setDragging(false); pickFile(e.dataTransfer.files[0]) }}
          onClick={() => fileRef.current.click()}
          style={{ border: `2px dashed ${dragging ? 'var(--t-accent)' : 'var(--t-line)'}`, padding: 48, textAlign: 'center', cursor: 'pointer', background: dragging ? 'rgba(0,229,255,0.04)' : 'var(--t-surface)', transition: 'all .15s', color: dragging ? 'var(--t-accent)' : 'var(--t-text-muted)' }}
        >
          <input ref={fileRef} type="file" style={{ display: 'none' }} accept=".pdf,.doc,.docx,.txt" onChange={e => pickFile(e.target.files[0])} />
          <div style={{ fontSize: 36, marginBottom: 8 }}>📄</div>
          {file ? (
            <div style={{ fontWeight: 700, color: 'var(--t-text)' }}>{file.name} — {(file.size / 1024).toFixed(0)} KB</div>
          ) : (
            <>
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>Drop file here or click to browse</div>
              <div style={{ fontSize: 12 }}>PDF, DOC, DOCX, TXT accepted</div>
              <button style={{ ...btn('var(--t-text-muted)', false, true), marginTop: 12 }} onClick={e => { e.stopPropagation(); setPasteMode(true) }}>or paste text instead</button>
            </>
          )}
        </div>
      ) : (
        <div style={S.card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
            <div style={{ fontWeight: 700, color: 'var(--t-text)' }}>Paste Document Text</div>
            <button style={btn('var(--t-text-muted)', false, true)} onClick={() => setPasteMode(false)}>← Use file upload</button>
          </div>
          <textarea value={content} onChange={e => setContent(e.target.value)} rows={8} style={{ ...S.input, resize: 'vertical' }} placeholder="Paste document body here…" />
        </div>
      )}

      {/* AI Analysis */}
      <div style={S.card}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: aiResult ? 14 : 0 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 13 }}>AI Analysis</div>
            <div style={{ fontSize: 11, color: 'var(--t-text-muted)', marginTop: 2 }}>Auto-detect category, type, and acknowledgment requirement</div>
          </div>
          <button style={btn('var(--t-accent)', true)} onClick={() => runAI(name || file?.name || '')} disabled={analyzing}>
            {analyzing ? 'Analyzing…' : 'Run AI Analysis'}
          </button>
        </div>
        {analyzing && <div style={{ display: 'flex', gap: 6, alignItems: 'center', color: 'var(--t-text-muted)', fontSize: 12, marginTop: 12 }}><span style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }}>⟳</span> Analyzing document structure…</div>}
        {aiResult && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 8 }}>
            {aiResult.map(r => (
              <div key={r.field} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: 'var(--t-surface-2)', border: '1px solid var(--t-line)', fontSize: 12 }}>
                <div>
                  <div style={{ color: 'var(--t-text-muted)', fontWeight: 600, fontSize: 10, textTransform: 'uppercase' }}>{r.field}</div>
                  <div style={{ color: 'var(--t-accent)', fontWeight: 700, marginTop: 2 }}>{r.value}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Form */}
      <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', padding: 20, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <div style={{ gridColumn: '1/-1', display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={S.lbl}>Document Name *</label>
          <input value={name} onChange={e => setName(e.target.value)} style={S.input} placeholder="Enter document name…" />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={S.lbl}>Category</label>
          <select value={category} onChange={e => setCategory(e.target.value)} style={S.sel}>{CATEGORIES.filter(c => c !== 'All').map(c => <option key={c}>{c}</option>)}</select>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={S.lbl}>Document Type</label>
          <select value={type} onChange={e => setType(e.target.value)} style={S.sel}>{DOC_TYPES.filter(t => t !== 'All').map(t => <option key={t}>{t}</option>)}</select>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={S.lbl}>Location(s)</label>
          <select value={location} onChange={e => setLocation(e.target.value)} style={S.sel}>{LOCATIONS.map(l => <option key={l}>{l}</option>)}</select>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={S.lbl}>Version</label>
          <input value={version} onChange={e => setVersion(e.target.value)} style={S.input} placeholder="1.0" />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={S.lbl}>Status</label>
          <select value={status} onChange={e => setStatus(e.target.value)} style={S.sel}>
            <option value="active">Active</option>
            <option value="draft">Draft</option>
          </select>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <label style={S.lbl}>Requires Acknowledgment</label>
          <Toggle on={reqAck} onToggle={() => setReqAck(v => !v)} />
        </div>
        <div style={{ gridColumn: '1/-1', display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={S.lbl}>Notes / Summary</label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} style={{ ...S.input, resize: 'vertical' }} placeholder="Brief summary of this document's purpose…" />
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button style={btn(saved ? 'var(--t-success)' : 'var(--t-accent)', true)} onClick={handleSave} disabled={saving || !name.trim()}>
          {saving ? 'Saving…' : saved ? '✓ Saved to Library' : 'Save to Library'}
        </button>
      </div>
    </div>
  )
}

// ── TAB 3 — Distribute ────────────────────────────────────────────────────────
function DistributeTab({ docs, person, roster, nodeId, reload }) {
  const [scope,       setScope]       = useState('all')
  const [scopeLoc,    setScopeLoc]    = useState('All')
  const [scopeRole,   setScopeRole]   = useState('All Roles')
  const [picked,      setPicked]      = useState([])   // array of person ids
  const [selectedDoc, setSelectedDoc] = useState('')
  const [docSearch,   setDocSearch]   = useState('')
  const [reqSig,      setReqSig]      = useState(false)
  const [dueDate,     setDueDate]     = useState(fromNow(7))
  const [message,     setMessage]     = useState('')
  const [sending,     setSending]     = useState(false)
  const [sent,        setSent]        = useState(false)

  const filteredDocs = docs.filter(d => d.name.toLowerCase().includes(docSearch.toLowerCase()))
  const chosenDoc    = docs.find(d => d.name === selectedDoc)

  function toggleEmployee(id) {
    setPicked(prev => prev.includes(id) ? prev.filter(n => n !== id) : [...prev, id])
  }

  // Resolve the real recipient set from the live roster for the chosen scope.
  function recipients() {
    if (scope === 'all')        return roster
    if (scope === 'location')   return scopeLoc === 'All' ? roster : roster.filter(r => (r.location || '') === scopeLoc)
    if (scope === 'role')       return scopeRole === 'All Roles' ? roster : roster.filter(r => (r.role || '').toLowerCase().includes(scopeRole.toLowerCase().replace(/\/.*$/, '').trim()))
    if (scope === 'individual') return roster.filter(r => picked.includes(r.id))
    return []
  }

  function recipientLabel() {
    if (scope === 'all')        return 'All Employees'
    if (scope === 'location')   return `${scopeLoc} Location`
    if (scope === 'role')       return `${scopeRole} Role`
    if (scope === 'individual') return recipients().map(r => r.full_name).join(', ') || '—'
    return '—'
  }

  function recipientCount() { return recipients().length }

  async function handleSend() {
    if (!selectedDoc) return
    const recips = recipients().filter(r => r.id)
    if (recips.length === 0) {
      window.dispatchEvent(new CustomEvent('vip-toast', { detail: { msg: 'No recipients in the selected scope.', type: 'error' } }))
      return
    }
    setSending(true)
    const { error } = await sb.rpc('docmanager_distribute', {
      p_doc_id: chosenDoc?.id ?? null, p_doc_name: selectedDoc, p_node_id: nodeId ?? null,
      p_sent_to_label: recipientLabel(), p_require_sig: reqSig, p_due_date: reqSig ? dueDate : null,
      p_message: message, p_person_ids: recips.map(r => r.id), p_person_names: recips.map(r => r.full_name),
      p_actor: person?.id ?? null, p_actor_name: person?.full_name ?? '' + companyName() + ' HR',
    })
    setSending(false)
    if (error) {
      window.dispatchEvent(new CustomEvent('vip-toast', { detail: { msg: 'Could not distribute: ' + error.message, type: 'error' } }))
      return
    }
    await reload?.()
    setSent(true)
    setTimeout(() => setSent(false), 2500)
    setSelectedDoc(''); setMessage(''); setPicked([])
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {/* Recipients */}
        <div style={{ ...S.card, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={S.lbl}>Send To</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {[['all', 'All Employees'], ['location', 'By Location'], ['role', 'By Role'], ['individual', 'Specific People']].map(([v, l]) => (
              <button key={v} onClick={() => setScope(v)} style={{ ...btn(scope === v ? 'var(--t-accent)' : 'var(--t-text-muted)', scope === v, true) }}>{l}</button>
            ))}
          </div>
          {scope === 'location' && (
            <select value={scopeLoc} onChange={e => setScopeLoc(e.target.value)} style={S.sel}>{LOCATIONS.map(l => <option key={l}>{l}</option>)}</select>
          )}
          {scope === 'role' && (
            <select value={scopeRole} onChange={e => setScopeRole(e.target.value)} style={S.sel}>{ROLES_LIST.map(r => <option key={r}>{r}</option>)}</select>
          )}
          {scope === 'individual' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 200, overflowY: 'auto' }}>
              {roster.length === 0 && <div style={{ fontSize: 12, color: 'var(--t-text-muted)' }}>No employees in scope.</div>}
              {roster.map(r => (
                <label key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer', padding: '4px 0' }}>
                  <input type="checkbox" checked={picked.includes(r.id)} onChange={() => toggleEmployee(r.id)} />
                  <span style={{ color: picked.includes(r.id) ? 'var(--t-accent)' : 'var(--t-text)' }}>{r.full_name}{r.location ? ` · ${r.location}` : ''}</span>
                </label>
              ))}
            </div>
          )}
          <div style={{ fontSize: 12, color: 'var(--t-text-muted)', paddingTop: 4, borderTop: '1px solid var(--t-line)' }}>
            Recipients: <strong style={{ color: 'var(--t-text)' }}>{recipientLabel()}</strong> · <strong style={{ color: 'var(--t-accent)' }}>{recipientCount()}</strong> people
          </div>
        </div>

        {/* Document picker */}
        <div style={{ ...S.card, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={S.lbl}>Select Document</div>
          <input value={docSearch} onChange={e => setDocSearch(e.target.value)} placeholder="Search library…" style={S.input} />
          <div style={{ maxHeight: 180, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
            {filteredDocs.map(d => (
              <div key={d.id} onClick={() => setSelectedDoc(d.name)} style={{ padding: '8px 12px', cursor: 'pointer', border: `1px solid ${selectedDoc === d.name ? 'var(--t-accent)' : 'var(--t-line)'}`, background: selectedDoc === d.name ? 'rgba(0,229,255,0.08)' : 'var(--t-surface-2)', fontSize: 13, fontWeight: selectedDoc === d.name ? 700 : 400, color: selectedDoc === d.name ? 'var(--t-accent)' : 'var(--t-text)' }}>
                {d.name}
              </div>
            ))}
          </div>
          {chosenDoc && (
            <div style={{ padding: '8px 12px', background: 'var(--t-surface-2)', border: '1px solid var(--t-line)', fontSize: 11 }}>
              <div style={{ color: 'var(--t-text-muted)' }}>Type: <strong style={{ color: 'var(--t-text)' }}>{chosenDoc.type}</strong> · Version <strong style={{ color: 'var(--t-text)' }}>v{chosenDoc.version}</strong></div>
              {chosenDoc.requires_ack && <div style={{ color: 'var(--t-warn)', marginTop: 2 }}>⚠ This document already requires acknowledgment</div>}
            </div>
          )}
        </div>
      </div>

      {/* Options */}
      <div style={{ ...S.card, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={S.lbl}>Distribution Options</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={S.lbl}>Personal Message (optional)</label>
          <textarea value={message} onChange={e => setMessage(e.target.value)} rows={3} style={{ ...S.input, resize: 'vertical' }} placeholder="Add a note that will appear with this distribution…" />
        </div>
        <div style={{ display: 'flex', gap: 32, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <label style={S.lbl}>Require Signature</label>
            <Toggle on={reqSig} onToggle={() => setReqSig(v => !v)} />
          </div>
          {reqSig && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={S.lbl}>Due Date</label>
              <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} style={{ ...S.input, width: 160 }} />
            </div>
          )}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button style={btn(sent ? 'var(--t-success)' : 'var(--t-accent)', true)} onClick={handleSend} disabled={!selectedDoc || sending}>
            {sending ? 'Sending…' : sent ? '✓ Distributed' : `Distribute to ${recipientCount()} recipients`}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── TAB 4 — AI Generator ──────────────────────────────────────────────────────
function AIGeneratorTab({ person, nodeId, reload }) {
  const [prompt,    setPrompt]    = useState('')
  const [genResult, setGenResult] = useState(null)
  const [genTitle,  setGenTitle]  = useState('')
  const [genBody,   setGenBody]   = useState('')
  const [empName,   setEmpName]   = useState('')
  const [mgrName,   setMgrName]   = useState('')
  const [thinking,  setThinking]  = useState(false)
  const [saved,     setSaved]     = useState(false)
  const [activeKey, setActiveKey] = useState(null)

  function generate(key, customPrompt) {
    setActiveKey(key)
    setThinking(true)
    setGenResult(null)
    setTimeout(() => {
      let result
      if (key && AI_TEMPLATES[key]) {
        result = AI_TEMPLATES[key](empName || undefined, mgrName || undefined)
      } else {
        const p = customPrompt || prompt
        result = {
          title: p.length > 60 ? p.slice(0, 57) + '…' : p,
          body:  `DOCUMENT: ${p}\n\nDate: ${TODAY}\nPrepared By: ${companyName()} HR Department\nLocation: [Location]\n\n${'━'.repeat(40)}\n\nThis document was generated based on your request:\n"${p}"\n\nCustomize the content below to match your specific situation. All ${companyName()} documents should be reviewed by HR before distribution.\n\n${'━'.repeat(40)}\n\nEmployee: ____________________________  Date: ____________\nManager:  ____________________________  Date: ____________\nHR:       ____________________________  Date: ____________`,
        }
      }
      setGenTitle(result.title)
      setGenBody(result.body)
      setGenResult(result)
      setThinking(false)
    }, 500)
  }

  async function handleSave() {
    const { error } = await sb.rpc('docmanager_save', {
      p_id: null, p_node_id: nodeId ?? null, p_name: genTitle, p_type: 'custom',
      p_category: 'HR Policy', p_location: 'All', p_version: '1.0', p_status: 'draft',
      p_requires_ack: false, p_content: genBody, p_actor: person?.id ?? null,
    })
    if (error) {
      window.dispatchEvent(new CustomEvent('vip-toast', { detail: { msg: 'Could not save document: ' + error.message, type: 'error' } }))
      return
    }
    await reload?.()
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Person fields */}
      <div style={{ ...S.card, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <div>
          <label style={S.lbl}>Employee Name (for personalization)</label>
          <input value={empName} onChange={e => setEmpName(e.target.value)} style={{ ...S.input, marginTop: 6 }} placeholder="Leave blank for template placeholder" />
        </div>
        <div>
          <label style={S.lbl}>Manager Name</label>
          <input value={mgrName} onChange={e => setMgrName(e.target.value)} style={{ ...S.input, marginTop: 6 }} placeholder="Leave blank for template placeholder" />
        </div>
      </div>

      {/* Quick buttons */}
      <div style={{ ...S.card }}>
        <div style={{ ...S.lbl, marginBottom: 12 }}>Quick Generate</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8 }}>
          {AI_QUICK.map(({ label, key }) => (
            <button
              key={key}
              onClick={() => generate(key)}
              style={{ padding: '12px 14px', fontSize: 12, fontWeight: 600, textAlign: 'left', border: `1px solid ${activeKey === key ? 'var(--t-accent)' : 'var(--t-line)'}`, background: activeKey === key ? 'rgba(0,229,255,0.06)' : 'var(--t-surface-2)', color: activeKey === key ? 'var(--t-accent)' : 'var(--t-text)', cursor: 'pointer', lineHeight: 1.4 }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Free text */}
      <div style={S.card}>
        <div style={{ ...S.lbl, marginBottom: 8 }}>Custom Request</div>
        <div style={{ display: 'flex', gap: 10 }}>
          <input
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && generate(null, prompt)}
            placeholder="Describe the document you need…"
            style={{ ...S.input, flex: 1 }}
          />
          <button style={btn('var(--t-accent)', true)} onClick={() => generate(null, prompt)} disabled={!prompt.trim() || thinking}>
            {thinking ? 'Generating…' : 'Generate'}
          </button>
        </div>
      </div>

      {/* Thinking indicator */}
      {thinking && (
        <div style={{ ...S.card, display: 'flex', alignItems: 'center', gap: 12, color: 'var(--t-text-muted)', fontSize: 13 }}>
          <div style={{ width: 18, height: 18, border: '2px solid var(--t-line)', borderTop: '2px solid var(--t-accent)', borderRadius: '50%', animation: 'spin 0.7s linear infinite', flexShrink: 0 }} />
          Composing document…
        </div>
      )}

      {/* Output */}
      {genResult && !thinking && (
        <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-accent)', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--t-line)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
            <div>
              <div style={{ fontWeight: 800, color: 'var(--t-accent)', fontSize: 14 }}>{genTitle}</div>
              <div style={{ fontSize: 11, color: 'var(--t-text-muted)', marginTop: 2 }}>AI-generated — review and edit before saving</div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button style={btn('var(--t-text-muted)')} onClick={() => window.print()}>Print</button>
              <button style={btn('var(--t-success)', true)} onClick={handleSave} disabled={saved}>
                {saved ? '✓ Saved to Library' : 'Save to Library'}
              </button>
            </div>
          </div>
          <div style={{ padding: '6px 10px', borderBottom: '1px solid var(--t-line)', background: 'var(--t-surface-2)', display: 'flex', gap: 10, flexShrink: 0, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
              <label style={{ ...S.lbl, fontSize: 10 }}>Document Title</label>
              <input value={genTitle} onChange={e => setGenTitle(e.target.value)} style={{ ...S.input, fontSize: 12, padding: '6px 10px' }} />
            </div>
          </div>
          <textarea
            value={genBody}
            onChange={e => setGenBody(e.target.value)}
            rows={22}
            style={{ ...S.input, resize: 'vertical', fontFamily: 'monospace', fontSize: 12, lineHeight: 1.8, border: 'none', borderRadius: 0 }}
          />
        </div>
      )}
    </div>
  )
}

// ── TAB 5 — Distribution Log ──────────────────────────────────────────────────
function DistLogTab({ distributions, person }) {
  const [search,     setSearch]     = useState('')
  const [dateFrom,   setDateFrom]   = useState('')
  const [dateTo,     setDateTo]     = useState('')
  const [expandedId, setExpandedId] = useState(null)
  const [reminding,  setReminding]  = useState(null)

  const filtered = distributions.filter(d => {
    if (search   && !d.doc_name.toLowerCase().includes(search.toLowerCase())) return false
    if (dateFrom && new Date(d.sent_at) < new Date(dateFrom))                 return false
    if (dateTo   && new Date(d.sent_at) > new Date(dateTo + 'T23:59:59'))     return false
    return true
  }).sort((a, b) => new Date(b.sent_at) - new Date(a.sent_at))

  async function sendReminder(dist) {
    setReminding(dist.id)
    const { data, error } = await sb.rpc('docmanager_remind_distribution', { p_distribution_id: dist.id })
    setReminding(null)
    if (error) {
      window.dispatchEvent(new CustomEvent('vip-toast', { detail: { msg: 'Could not send reminder: ' + error.message, type: 'error' } }))
      return
    }
    const n = data?.reminded ?? (dist.total - dist.signed)
    window.dispatchEvent(new CustomEvent('vip-toast', { detail: { msg: `Reminder logged for ${n} unsigned recipient${n !== 1 ? 's' : ''}.`, type: 'success' } }))
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search document name…" style={{ ...S.input, width: 220 }} />
        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={{ ...S.input, width: 150 }} />
        <input type="date" value={dateTo}   onChange={e => setDateTo(e.target.value)}   style={{ ...S.input, width: 150 }} />
        <button style={btn('var(--t-text-muted)')} onClick={() => exportCSV(filtered.map(d => ({ document: d.doc_name, sent_by: d.sent_by, sent_to: d.sent_to_label, date: fmt(d.sent_at), signed: d.signed, total: d.total, percent: pct(d.signed, d.total) + '%' })), 'vip-distribution-log.csv')}>↓ Export CSV</button>
      </div>

      {/* Table */}
      <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: 'var(--t-surface-2)', borderBottom: '1px solid var(--t-line)' }}>
              {['Document', 'Sent Date', 'Sent By', 'Recipients', 'Signed', '% Signed', 'Actions'].map(h => <th key={h} style={S.th}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={7} style={{ ...S.td, textAlign: 'center', color: 'var(--t-text-muted)', padding: 40 }}>No distribution records found.</td></tr>
            ) : filtered.map((d, i) => {
              const p        = pct(d.signed, d.total)
              const complete = p === 100
              const isOpen   = expandedId === d.id
              return (
                <>
                  <tr
                    key={d.id}
                    onClick={() => setExpandedId(isOpen ? null : d.id)}
                    style={{ borderBottom: '1px solid var(--t-line)', background: isOpen ? 'rgba(0,229,255,0.04)' : i % 2 ? 'rgba(255,255,255,0.015)' : 'transparent', cursor: 'pointer' }}
                  >
                    <td style={{ ...S.td, fontWeight: 600, color: 'var(--t-text)' }}>{d.doc_name}</td>
                    <td style={{ ...S.td, color: 'var(--t-text-muted)', whiteSpace: 'nowrap' }}>{fmt(d.sent_at)}</td>
                    <td style={{ ...S.td, color: 'var(--t-text-muted)' }}>{d.sent_by}</td>
                    <td style={{ ...S.td, color: 'var(--t-text-muted)' }}>{d.sent_to_label}</td>
                    <td style={{ ...S.td }}>
                      <ProgressBar done={d.signed} total={d.total} />
                    </td>
                    <td style={{ ...S.td }}>
                      <span style={{ fontWeight: 800, color: complete ? 'var(--t-success)' : p >= 50 ? 'var(--t-warn)' : 'var(--t-danger)' }}>{p}%</span>
                    </td>
                    <td style={{ ...S.td }} onClick={e => e.stopPropagation()}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button style={btn('var(--t-accent)', false, true)} onClick={() => setExpandedId(isOpen ? null : d.id)}>{isOpen ? '▲ Hide' : '▼ Detail'}</button>
                        {!complete && (
                          <button style={btn('var(--t-warn)', false, true)} onClick={() => sendReminder(d)} disabled={reminding === d.id}>
                            {reminding === d.id ? '…' : 'Remind'}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                  {isOpen && (
                    <tr key={`${d.id}-detail`} style={{ borderBottom: '1px solid var(--t-line)' }}>
                      <td colSpan={7} style={{ padding: '0 0 0 24px', background: 'rgba(0,229,255,0.03)' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, margin: '8px 0' }}>
                          <thead>
                            <tr style={{ borderBottom: '1px solid var(--t-line)' }}>
                              <th style={{ ...S.th, fontSize: 10, padding: '6px 12px' }}>Recipient</th>
                              <th style={{ ...S.th, fontSize: 10, padding: '6px 12px' }}>Status</th>
                              <th style={{ ...S.th, fontSize: 10, padding: '6px 12px' }}>Signed Date</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(d.recipients || []).map((r, ri) => (
                              <tr key={ri} style={{ borderBottom: '1px solid var(--t-line)' }}>
                                <td style={{ ...S.td, padding: '6px 12px' }}>{r.name}</td>
                                <td style={{ ...S.td, padding: '6px 12px' }}>
                                  {r.signed
                                    ? <span className="badge green">Signed</span>
                                    : <span className="badge amber">Pending</span>}
                                </td>
                                <td style={{ ...S.td, padding: '6px 12px', color: 'var(--t-text-muted)' }}>{r.signed_at ? fmt(r.signed_at) : '—'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </td>
                    </tr>
                  )}
                </>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── TAB 6 — I-9 Expiry ───────────────────────────────────────────────────────
function I9AddModal({ roster, nodeId, person, onClose, onSaved }) {
  const [personId, setPersonId] = useState('')
  const [authType, setAuthType] = useState(WORK_AUTH_TYPES[0])
  const [origDate, setOrigDate] = useState('')
  const [reDate,   setReDate]   = useState('')
  const [notes,    setNotes]    = useState('')
  const [saving,   setSaving]   = useState(false)

  async function save() {
    if (!personId) return
    setSaving(true)
    const emp = roster.find(r => r.id === personId)
    const { error } = await sb.rpc('i9_record_save', {
      p_id: null, p_person_id: personId, p_node_id: emp?.node_id ?? nodeId ?? null,
      p_work_auth_type: authType, p_original_date: origDate || null,
      p_reverify_date: reDate || null, p_notes: notes, p_actor: person?.id ?? null,
    })
    setSaving(false)
    if (error) {
      window.dispatchEvent(new CustomEvent('vip-toast', { detail: { msg: 'Could not save I-9 record: ' + error.message, type: 'error' } }))
      return
    }
    onSaved()
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 9000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }} onClick={onClose}>
      <div style={{ background: 'var(--t-bg)', border: '1px solid var(--t-line)', width: '100%', maxWidth: 520 }} onClick={e => e.stopPropagation()}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--t-line)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontWeight: 800, fontSize: 15, color: 'var(--t-text)' }}>Record I-9 Verification</div>
          <button style={btn('var(--t-text-muted)')} onClick={onClose}>✕</button>
        </div>
        <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={S.lbl}>Employee *</label>
            <select value={personId} onChange={e => setPersonId(e.target.value)} style={S.sel}>
              <option value="">Select employee…</option>
              {roster.map(r => <option key={r.id} value={r.id}>{r.full_name}{r.location ? ` — ${r.location}` : ''}</option>)}
            </select>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={S.lbl}>Work Authorization</label>
              <select value={authType} onChange={e => setAuthType(e.target.value)} style={S.sel}>
                {WORK_AUTH_TYPES.map(w => <option key={w}>{w}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={S.lbl}>Original I-9 Date</label>
              <input type="date" value={origDate} onChange={e => setOrigDate(e.target.value)} style={S.input} />
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={S.lbl}>Re-Verification Date (leave blank if not required)</label>
            <input type="date" value={reDate} onChange={e => setReDate(e.target.value)} style={S.input} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={S.lbl}>Notes</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} style={{ ...S.input, resize: 'vertical' }} />
          </div>
        </div>
        <div style={{ padding: '12px 20px', borderTop: '1px solid var(--t-line)', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button style={btn('var(--t-text-muted)')} onClick={onClose}>Cancel</button>
          <button style={btn('var(--t-accent)', true)} onClick={save} disabled={saving || !personId}>{saving ? 'Saving…' : 'Save Record'}</button>
        </div>
      </div>
    </div>
  )
}

function I9ExpiryTab({ locationIds, roster, nodeId, person }) {
  const enabled = useFeatureFlag('i9_expiry')
  const config  = useConfig()
  const [filter,   setFilter]   = useState('All')
  const [dismissed, setDismissed] = useState(false)
  const [toastMsg,  setToastMsg]  = useState('')
  const [rows,     setRows]     = useState([])
  const [loading,  setLoading]  = useState(true)
  const [drill,    setDrill]    = useState(null)
  const [adding,   setAdding]   = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const { data, error } = await sb.rpc('i9_records_list', { p_node_ids: locationIds?.length ? locationIds : null })
    setRows(!error && Array.isArray(data) ? data : [])
    setLoading(false)
  }, [locationIds])

  useEffect(() => { if (enabled) load() }, [enabled, load])

  function showToast(msg) {
    setToastMsg(msg)
    setTimeout(() => setToastMsg(''), 2800)
  }

  async function sendReminder(r) {
    const { error } = await sb.rpc('i9_send_reminder', { p_id: r.id })
    if (error) {
      window.dispatchEvent(new CustomEvent('vip-toast', { detail: { msg: 'Could not log reminder: ' + error.message, type: 'error' } }))
      return
    }
    showToast(`Reminder logged for ${r.name}`)
    load()
  }

  if (!enabled) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: 'var(--t-text-muted)', fontSize: 14 }}>
        Feature disabled — enable in Feature Toggles.
      </div>
    )
  }

  const days = config.i9_warning_days.split(',').map(Number) // [60, 30, 7]

  const criticalCount  = rows.filter(r => r.status === 'CRITICAL').length
  const warningCount   = rows.filter(r => r.status === 'WARNING').length
  const upcomingCount  = rows.filter(r => r.status === 'UPCOMING').length
  const validCount     = rows.filter(r => r.status === 'VALID' || r.status === 'NA').length

  const I9_COLS = [
    { key: 'name', label: 'Employee', value: r => r.name },
    { key: 'loc', label: 'Location', value: r => r.loc },
    { key: 'authType', label: 'Work Auth', value: r => r.authType },
    { key: 'origDate', label: 'Original I-9', value: r => r.origDate || '—', sortKey: r => r.origDate || '' },
    { key: 'reVerifyDate', label: 'Re-Verify', value: r => r.reVerifyDate || '—', sortKey: r => r.reVerifyDate || '' },
    { key: 'daysUntil', label: 'Days Until', value: r => (r.daysUntil != null ? `${r.daysUntil}d` : '—'), align: 'right', sortKey: r => (r.daysUntil == null ? 99999 : r.daysUntil) },
    { key: 'status', label: 'Status', value: r => r.status },
  ]
  const openDrill = (title, list, accent) => setDrill({ title, subtitle: `${list.length} employee${list.length === 1 ? '' : 's'}`, columns: I9_COLS, rows: list, accent })

  const displayed = filter === 'All'      ? rows
    : filter === 'Critical'               ? rows.filter(r => r.status === 'CRITICAL')
    : filter === 'Warning'                ? rows.filter(r => r.status === 'WARNING')
    : filter === 'Upcoming'               ? rows.filter(r => r.status === 'UPCOMING')
    : rows.filter(r => r.status === 'VALID' || r.status === 'NA')

  function statusBadge(status) {
    if (status === 'CRITICAL')  return <span style={{ display:'inline-block', padding:'2px 8px', fontSize:11, fontWeight:700, background:'var(--t-danger)22', color:'var(--t-danger)' }}>CRITICAL</span>
    if (status === 'WARNING')   return <span style={{ display:'inline-block', padding:'2px 8px', fontSize:11, fontWeight:700, background:'var(--t-warn)22', color:'var(--t-warn)' }}>WARNING</span>
    if (status === 'UPCOMING')  return <span style={{ display:'inline-block', padding:'2px 8px', fontSize:11, fontWeight:700, background:'var(--t-warn)22', color:'var(--t-warn)' }}>UPCOMING</span>
    if (status === 'NA')        return <span style={{ display:'inline-block', padding:'2px 8px', fontSize:11, fontWeight:700, background:'var(--t-success)22', color:'var(--t-success)' }}>N/A</span>
    return <span style={{ display:'inline-block', padding:'2px 8px', fontSize:11, fontWeight:700, background:'var(--t-success)22', color:'var(--t-success)' }}>VALID</span>
  }

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
      {adding && <I9AddModal roster={roster} nodeId={nodeId} person={person} onClose={() => setAdding(false)} onSaved={() => { setAdding(false); load() }} />}
      {toastMsg && (
        <div style={{ position:'fixed', top:20, right:20, zIndex:9999, background:'var(--t-success)', color:'#000', padding:'10px 18px', fontWeight:700, fontSize:13 }}>
          {toastMsg}
        </div>
      )}

      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:12 }}>
        <div style={{ fontSize:14, fontWeight:800, color:'var(--t-text)', textTransform:'uppercase', letterSpacing:'0.04em' }}>
          I-9 Re-Verification Tracking
        </div>
        <button style={btn('var(--t-success)', true)} onClick={() => setAdding(true)}>+ Record I-9</button>
      </div>

      {/* Critical banner */}
      {criticalCount > 0 && !dismissed && (
        <div style={{ background:'var(--t-danger)18', border:'1px solid var(--t-danger)44', padding:'12px 16px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <span style={{ color:'var(--t-danger)', fontWeight:700, fontSize:13 }}>
            ⚠ {criticalCount} employee{criticalCount !== 1 ? 's' : ''} require immediate I-9 attention
          </span>
          <button onClick={() => setDismissed(true)} style={{ background:'transparent', border:'none', color:'var(--t-danger)', cursor:'pointer', fontWeight:700, fontSize:14 }}>✕</button>
        </div>
      )}

      {/* KPI row */}
      <div style={{ display:'flex', gap:12 }}>
        <KpiTile label={`Critical (≤${days[2]} days)`}  value={criticalCount} sub="Immediate action" accent="var(--t-danger)"
          onClick={() => openDrill('Critical I-9 Re-Verifications', rows.filter(r => r.status === 'CRITICAL'), 'var(--t-danger)')} />
        <KpiTile label={`Warning (≤${days[1]} days)`}   value={warningCount}  sub="Action soon"      accent="var(--t-warn)"
          onClick={() => openDrill('Warning I-9 Re-Verifications', rows.filter(r => r.status === 'WARNING'), 'var(--t-warn)')} />
        <KpiTile label={`Upcoming (≤${days[0]} days)`}  value={upcomingCount} sub="Monitor"          accent="var(--t-warn)"
          onClick={() => openDrill('Upcoming I-9 Re-Verifications', rows.filter(r => r.status === 'UPCOMING'), 'var(--t-warn)')} />
        <KpiTile label="Valid / No Re-Verify"            value={validCount}    sub="In good standing" accent="var(--t-success)"
          onClick={() => openDrill('Valid / No Re-Verify', rows.filter(r => r.status === 'VALID' || r.status === 'NA'), 'var(--t-success)')} />
      </div>

      {/* Filter buttons */}
      <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
        {['All','Critical','Warning','Upcoming','Valid'].map(f => (
          <button key={f} onClick={() => setFilter(f)}
            style={{ ...btn(filter === f ? 'var(--t-accent)' : 'var(--t-text-muted)', filter === f, true) }}>
            {f}
          </button>
        ))}
      </div>

      {/* Table */}
      <div style={{ background:'var(--t-surface)', border:'1px solid var(--t-line)', overflow:'hidden' }}>
        <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
          <thead>
            <tr style={{ background:'var(--t-surface-2)', borderBottom:'1px solid var(--t-line)' }}>
              {['Employee','Location','Work Auth Type','Original I-9','Re-Verify Date','Days Until Expiry','Status','Action'].map(h => (
                <th key={h} style={S.th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} style={{ ...S.td, textAlign:'center', color:'var(--t-text-muted)', padding:40 }}>Loading I-9 records…</td></tr>
            ) : displayed.length === 0 ? (
              <tr><td colSpan={8} style={{ ...S.td, textAlign:'center', color:'var(--t-text-muted)', padding:40 }}>No I-9 records yet. Use “Record I-9” to add employment-eligibility tracking.</td></tr>
            ) : displayed.map((r, i) => (
              <tr key={r.id} style={{ borderBottom:'1px solid var(--t-line)', background: i % 2 ? 'rgba(255,255,255,0.015)' : 'transparent' }}>
                <td style={{ ...S.td, fontWeight:600 }}>{r.name}</td>
                <td style={S.td}>{r.loc}</td>
                <td style={S.td}>{r.authType}</td>
                <td style={{ ...S.td, fontFamily:'monospace', color:'var(--t-text-muted)' }}>{r.origDate || '—'}</td>
                <td style={{ ...S.td, fontFamily:'monospace', color: r.status === 'CRITICAL' ? 'var(--t-danger)' : r.status === 'WARNING' || r.status === 'UPCOMING' ? 'var(--t-warn)' : 'var(--t-text-muted)' }}>
                  {r.reVerifyDate || '—'}
                </td>
                <td style={{ ...S.td, fontVariantNumeric:'tabular-nums', color: r.daysUntil == null ? 'var(--t-text-muted)' : r.daysUntil <= days[2] ? 'var(--t-danger)' : r.daysUntil <= days[1] ? 'var(--t-warn)' : 'var(--t-text)' }}>
                  {r.daysUntil != null ? `${r.daysUntil}d` : '—'}
                </td>
                <td style={S.td}>{statusBadge(r.status)}</td>
                <td style={S.td}>
                  <button style={btn('var(--t-accent)', false, true)} onClick={() => sendReminder(r)}>
                    Send Reminder
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <DrillDown open={!!drill} onClose={() => setDrill(null)} {...(drill || {})} />
    </div>
  )
}

// ── TAB 7 — Handbook Acknowledgment ──────────────────────────────────────────
function HandbookTab({ locationIds }) {
  const enabled = useFeatureFlag('handbook_ack')
  const config  = useConfig()
  const [rows,    setRows]    = useState([])
  const [version, setVersion] = useState('')
  const [loading, setLoading] = useState(true)
  const [drill,   setDrill]   = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    const [rosterRes, docRes] = await Promise.all([
      sb.rpc('handbook_signature_roster', { p_node_ids: locationIds?.length ? locationIds : null }),
      sb.rpc('handbook_get_document'),
    ])
    const doc = docRes?.data
    setVersion(doc?.version || config.handbook_version || '')
    const list = Array.isArray(rosterRes?.data) ? rosterRes.data : []
    setRows(list.map(r => ({
      person_id: r.person_id,
      name:      r.name,
      loc:       r.location || '—',
      role:      r.role || '—',
      status:    r.status,                       // signed | pending | outdated
      signed:    r.status === 'signed',
      signDate:  r.signed_at ? String(r.signed_at).split('T')[0] : null,
      signedVersion: r.signed_version,
    })))
    setLoading(false)
  }, [locationIds, config.handbook_version])

  useEffect(() => { if (enabled) load() }, [enabled, load])

  if (!enabled) {
    return (
      <div style={{ padding:40, textAlign:'center', color:'var(--t-text-muted)', fontSize:14 }}>
        Feature disabled — enable in Feature Toggles.
      </div>
    )
  }

  const signedCount   = rows.filter(r => r.signed).length
  const pendingCount  = rows.filter(r => r.status === 'pending').length
  const outdatedCount = rows.filter(r => r.status === 'outdated').length
  const completionPct = rows.length ? Math.round((signedCount / rows.length) * 100) : 0

  const HB_COLS = [
    { key: 'name', label: 'Employee', value: r => r.name },
    { key: 'loc', label: 'Location', value: r => r.loc },
    { key: 'role', label: 'Role', value: r => r.role },
    { key: 'signed', label: 'Status', value: r => (r.signed ? 'Signed' : r.status === 'outdated' ? 'Outdated' : 'Pending') },
    { key: 'signDate', label: 'Date Signed', value: r => r.signDate || '—', sortKey: r => r.signDate || '' },
    { key: 'signedVersion', label: 'Signed Ver.', value: r => r.signedVersion || '—' },
  ]
  const openDrill = (title, list, accent) => setDrill({ title, subtitle: `${list.length} employee${list.length === 1 ? '' : 's'}`, columns: HB_COLS, rows: list, accent })

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
      {/* Header row */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:12 }}>
        <div style={{ fontSize:14, fontWeight:800, color:'var(--t-text)', textTransform:'uppercase', letterSpacing:'0.04em' }}>
          Handbook Acknowledgment{version ? ` — Version ${version}` : ''}
        </div>
        <button style={btn('var(--t-text-muted)')} onClick={() => exportCSV(rows.map(r => ({ name:r.name, location:r.loc, role:r.role, status:r.status, date_signed:r.signDate||'', signed_version:r.signedVersion||'' })), `handbook-ack-v${version || 'current'}.csv`)}>
          Export CSV
        </button>
      </div>

      {/* KPI row */}
      <div style={{ display:'flex', gap:12 }}>
        <KpiTile label="Signed"       value={signedCount}   sub="Current version"  accent="var(--t-success)"
          onClick={() => openDrill('Signed Handbook Acknowledgments', rows.filter(r => r.signed), 'var(--t-success)')} />
        <KpiTile label="Pending"      value={pendingCount}  sub="Never signed"     accent="var(--t-warn)"
          onClick={() => openDrill('Pending Signatures', rows.filter(r => r.status === 'pending'), 'var(--t-warn)')} />
        <KpiTile label="Outdated"     value={outdatedCount} sub="Signed old version" accent="var(--t-warn)"
          onClick={() => openDrill('Outdated Signatures', rows.filter(r => r.status === 'outdated'), 'var(--t-warn)')} />
        <KpiTile label="Completion %" value={`${completionPct}%`} sub={`${signedCount} of ${rows.length}`} accent={completionPct >= 80 ? 'var(--t-success)' : 'var(--t-warn)'}
          onClick={() => openDrill('Handbook Acknowledgment — All Employees', rows, 'var(--t-success)')} />
      </div>

      {/* Table */}
      <div style={{ background:'var(--t-surface)', border:'1px solid var(--t-line)', overflow:'hidden' }}>
        <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
          <thead>
            <tr style={{ background:'var(--t-surface-2)', borderBottom:'1px solid var(--t-line)' }}>
              {['Employee','Location','Role','Status','Date Signed','Signed Version'].map(h => (
                <th key={h} style={S.th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} style={{ ...S.td, textAlign:'center', color:'var(--t-text-muted)', padding:40 }}>Loading acknowledgments…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={6} style={{ ...S.td, textAlign:'center', color:'var(--t-text-muted)', padding:40 }}>No employees in scope.</td></tr>
            ) : rows.map((r, i) => (
              <tr key={r.person_id} style={{ borderBottom:'1px solid var(--t-line)', background: i % 2 ? 'rgba(255,255,255,0.015)' : 'transparent' }}>
                <td style={{ ...S.td, fontWeight:600 }}>{r.name}</td>
                <td style={S.td}>{r.loc}</td>
                <td style={S.td}>{r.role}</td>
                <td style={S.td}>
                  {r.signed
                    ? <span style={{ display:'inline-block', padding:'2px 8px', fontSize:11, fontWeight:700, background:'var(--t-success)22', color:'var(--t-success)' }}>✓ Signed</span>
                    : r.status === 'outdated'
                      ? <span style={{ display:'inline-block', padding:'2px 8px', fontSize:11, fontWeight:700, background:'var(--t-warn)22', color:'var(--t-warn)' }}>Outdated</span>
                      : <span style={{ display:'inline-block', padding:'2px 8px', fontSize:11, fontWeight:700, background:'var(--t-warn)22', color:'var(--t-warn)' }}>Pending</span>
                  }
                </td>
                <td style={{ ...S.td, fontFamily:'monospace', color:'var(--t-text-muted)' }}>{r.signDate || '—'}</td>
                <td style={{ ...S.td, fontFamily:'monospace', color:'var(--t-text-muted)' }}>{r.signedVersion || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <DrillDown open={!!drill} onClose={() => setDrill(null)} {...(drill || {})} />
    </div>
  )
}

// ── Main export ───────────────────────────────────────────────────────────────
export default function DocManager() {
  const { session }    = useAuth()
  const { locationIds } = useScope()
  const person         = session?.person ?? {}
  const roleName       = person.role_name ?? ''

  const [activeTab,      setActiveTab]      = useState('Library')
  const [docs,           setDocs]           = useState([])
  const [distributions,  setDistributions]  = useState([])
  const [roster,         setRoster]         = useState([])
  const [loading,        setLoading]        = useState(true)

  const isHR = isHRRole(roleName)
  const ids    = locationIds?.length ? locationIds : null
  const nodeId = locationIds?.length ? locationIds[0] : null

  const load = useCallback(async () => {
    setLoading(true)
    const [docsRes, distRes, rosterRes] = await Promise.all([
      sb.rpc('docmanager_documents',     { p_node_ids: ids }),
      sb.rpc('docmanager_distributions', { p_node_ids: ids }),
      sb.rpc('get_roster',               { p_node_ids: ids, p_actor: person?.id ?? null }),
    ])
    setDocs(Array.isArray(docsRes?.data) ? docsRes.data : [])
    setDistributions(Array.isArray(distRes?.data) ? distRes.data : [])
    const rl = Array.isArray(rosterRes?.data) ? rosterRes.data : []
    setRoster(rl.map(r => ({
      id: r.id ?? r.person_id,
      full_name: r.full_name,
      role: r.role_name ?? r.role,
      node_id: r.node_id,
      location: r.node_name ?? r.location,
    })).filter(p => p.id && p.full_name))
    setLoading(false)
  }, [ids, person?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load() }, [load])

  if (!isHR) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 80, gap: 16, color: 'var(--t-text-muted)' }}>
        <div style={{ fontSize: 48 }}>🔒</div>
        <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--t-text)' }}>Access Restricted</div>
        <div style={{ fontSize: 13 }}>This area is limited to HR and Management roles.</div>
      </div>
    )
  }

  const tabCounts = {
    Library: docs.length,
    'Distribution Log': distributions.length,
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--t-line)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--t-text)', letterSpacing: '-0.01em' }}>Document Manager</div>
          <div style={{ fontSize: 12, color: 'var(--t-text-muted)', marginTop: 2 }}>Library · Upload · Distribute · AI Generation</div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button style={btn('var(--t-accent)')} onClick={() => setActiveTab('AI Generator')}>✦ AI Generate</button>
          <button style={btn('var(--t-success)', true)} onClick={() => setActiveTab('Upload')}>+ Upload</button>
        </div>
      </div>

      {/* Tab bar */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--t-line)', background: 'var(--t-surface)', flexShrink: 0 }}>
        {TABS.map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{ padding: '12px 18px', fontSize: 13, fontWeight: 700, background: 'transparent', border: 'none', borderBottom: activeTab === tab ? '2px solid var(--t-accent)' : '2px solid transparent', color: activeTab === tab ? 'var(--t-accent)' : 'var(--t-text-muted)', cursor: 'pointer', letterSpacing: '0.02em', whiteSpace: 'nowrap' }}
          >
            {tab}
            {tabCounts[tab] !== undefined && (
              <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 800, color: activeTab === tab ? 'var(--t-accent)' : 'var(--t-text-faint)', fontVariantNumeric: 'tabular-nums' }}>
                {tabCounts[tab]}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
        {activeTab === 'Library'          && <LibraryTab      docs={docs} setDocs={setDocs} loading={loading} isHR={isHR} reload={load} />}
        {activeTab === 'Upload'           && <UploadTab       person={person} nodeId={nodeId} reload={load} />}
        {activeTab === 'Distribute'       && <DistributeTab   docs={docs} person={person} roster={roster} nodeId={nodeId} reload={load} />}
        {activeTab === 'AI Generator'     && <AIGeneratorTab  person={person} nodeId={nodeId} reload={load} />}
        {activeTab === 'Distribution Log' && <DistLogTab      distributions={distributions} person={person} />}
        {activeTab === 'I-9 Expiry'       && <I9ExpiryTab      locationIds={locationIds} roster={roster} nodeId={nodeId} person={person} />}
        {activeTab === 'Handbook'         && <HandbookTab      locationIds={locationIds} />}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
