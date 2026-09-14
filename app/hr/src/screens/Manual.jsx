import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import { useAuth } from '../lib/auth.jsx'
import { useScope } from '../lib/scope.jsx'
import { sb } from '../lib/supabase'

// ─────────────────────────────────────────────────────────────────────────────
// HANDBOOK CONTENT — Twisted Growers starter skeleton (DRAFT until published in the Handbook Builder)
// ─────────────────────────────────────────────────────────────────────────────

const HANDBOOK_SECTIONS = [
  {
    id: 'hb-overview', title: 'Company Overview', icon: '🏢',
    content: [
      { type: 'heading', text: 'About Twisted Growers' },
      { type: 'para', text: 'Twisted Growers is a licensed Massachusetts cannabis cultivator (MC281714) and product manufacturer (MP281909) at 415 Millennium Circle, Lakeville, MA, with a dispensary planned. Every plant and package we touch is tracked in Metrc, the Commonwealth\'s seed-to-sale system.' },
      { type: 'heading', text: 'Our Mission' },
      { type: 'para', text: 'DRAFT — to be written and approved by Twisted Growers HR. Nothing here is company policy until it is published in the Handbook Builder.' },
    ],
  },
  {
    id: 'hb-employment', title: 'Employment Basics', icon: '📋',
    content: [
      { type: 'heading', text: 'At-Will Employment' },
      { type: 'para', text: 'Employment with Twisted Growers is at-will under Massachusetts law: either the employee or the company may end the relationship at any time, with or without cause or notice, subject to applicable law. Nothing in this handbook creates a contract of employment. DRAFT — to be written and approved by Twisted Growers HR. Nothing here is company policy until it is published in the Handbook Builder.' },
      { type: 'heading', text: 'Equal Employment Opportunity' },
      { type: 'para', text: 'Twisted Growers does not discriminate on any basis protected by M.G.L. c.151B or federal law, including hair texture and protective hairstyles (CROWN Act, 2022). DRAFT — to be written and approved by Twisted Growers HR. Nothing here is company policy until it is published in the Handbook Builder.' },
      { type: 'heading', text: 'Agent Registration' },
      { type: 'para', text: 'Every employee must hold a Cannabis Control Commission agent registration before working with product and must wear the agent badge on shift (935 CMR 500.030). A lapsed registration means no floor work until it is renewed. DRAFT — to be written and approved by Twisted Growers HR. Nothing here is company policy until it is published in the Handbook Builder.' },
    ],
  },
  {
    id: 'hb-attendance', title: 'Attendance & Scheduling', icon: '🕒',
    content: [
      { type: 'heading', text: 'Schedules' },
      { type: 'para', text: 'Schedules are drafted in the HR platform and posted a week at a time by a sign-off role. Swaps, call-outs and availability changes are made in the app so the floor is never short without notice. DRAFT — to be written and approved by Twisted Growers HR. Nothing here is company policy until it is published in the Handbook Builder.' },
      { type: 'heading', text: 'Call-outs' },
      { type: 'para', text: 'Call out through the app as early as you can; the notice window is set in Settings › Attendance. A no-call/no-show is recorded against the attendance policy. DRAFT — to be written and approved by Twisted Growers HR. Nothing here is company policy until it is published in the Handbook Builder.' },
    ],
  },
  {
    id: 'hb-pay', title: 'Pay & Time', icon: '💵',
    content: [
      { type: 'heading', text: 'Wages & Overtime' },
      { type: 'para', text: 'Massachusetts minimum wage is $15.00 per hour (M.G.L. c.151 §1). Overtime is paid at 1.5× for hours over 40 in a week (c.151 §1A). Wages are paid on the schedule set in Settings and within the timing M.G.L. c.149 §148 requires. DRAFT — to be written and approved by Twisted Growers HR. Nothing here is company policy until it is published in the Handbook Builder.' },
      { type: 'heading', text: 'Meal Breaks' },
      { type: 'para', text: 'A 30-minute unpaid meal break is provided on any shift longer than six hours (M.G.L. c.149 §100); breaks run in two waves so the floor is never empty. DRAFT — to be written and approved by Twisted Growers HR. Nothing here is company policy until it is published in the Handbook Builder.' },
      { type: 'heading', text: 'Time Clock' },
      { type: 'para', text: 'Clock in and out at the kiosk or in the app with your Employee ID and PIN. Edits to a punch are requested through your manager and are kept in the audit trail. DRAFT — to be written and approved by Twisted Growers HR. Nothing here is company policy until it is published in the Handbook Builder.' },
    ],
  },
  {
    id: 'hb-timeoff', title: 'Time Off & Leave', icon: '🏖️',
    content: [
      { type: 'heading', text: 'Earned Sick Time' },
      { type: 'para', text: 'Under M.G.L. c.149 §148C employees accrue one hour of earned sick time for every 30 hours worked, up to 40 hours per year. DRAFT — to be written and approved by Twisted Growers HR. Nothing here is company policy until it is published in the Handbook Builder.' },
      { type: 'heading', text: 'Paid Family & Medical Leave' },
      { type: 'para', text: 'Massachusetts PFML (M.G.L. c.175M) provides paid family and medical leave through the Department of Family and Medical Leave; the notice of rights is provided at hire. DRAFT — to be written and approved by Twisted Growers HR. Nothing here is company policy until it is published in the Handbook Builder.' },
      { type: 'heading', text: 'PTO' },
      { type: 'para', text: 'DRAFT — to be written and approved by Twisted Growers HR. Nothing here is company policy until it is published in the Handbook Builder.' },
    ],
  },
  {
    id: 'hb-conduct', title: 'Conduct, Safety & Drug-Free Workplace', icon: '🛡️',
    content: [
      { type: 'heading', text: 'Drug-Free Workplace' },
      { type: 'para', text: 'No cannabis or alcohol may be consumed on the premises or during a shift, and no employee may work impaired (935 CMR 500.105). DRAFT — to be written and approved by Twisted Growers HR. Nothing here is company policy until it is published in the Handbook Builder.' },
      { type: 'heading', text: 'Safety' },
      { type: 'para', text: 'Gloves, eye protection and closed-toe footwear are required in grow and production rooms; extraction rooms follow their own written safety procedures. Report every injury the same day. DRAFT — to be written and approved by Twisted Growers HR. Nothing here is company policy until it is published in the Handbook Builder.' },
      { type: 'heading', text: 'Anti-Harassment' },
      { type: 'para', text: 'Twisted Growers maintains a written sexual-harassment policy distributed annually as M.G.L. c.151B §3A requires. DRAFT — to be written and approved by Twisted Growers HR. Nothing here is company policy until it is published in the Handbook Builder.' },
    ],
  },
  {
    id: 'hb-compliance', title: 'Compliance & Metrc', icon: '🏷️',
    content: [
      { type: 'heading', text: 'Metrc is the Record of Truth' },
      { type: 'para', text: 'Every plant, harvest and package carries a Metrc tag. If it is not tagged, it does not exist. Any difference between a spreadsheet and Metrc is resolved in Metrc\'s favour and logged for review. Diversion is grounds for immediate termination and is reported to the Commission. DRAFT — to be written and approved by Twisted Growers HR. Nothing here is company policy until it is published in the Handbook Builder.' },
      { type: 'heading', text: 'Security & Confidentiality' },
      { type: 'para', text: 'Access-controlled rooms and video surveillance are required by 935 CMR 500.110. Standard operating procedures, yields, pricing and customer information are confidential. Nothing in this section limits your right to discuss wages or working conditions with coworkers. DRAFT — to be written and approved by Twisted Growers HR. Nothing here is company policy until it is published in the Handbook Builder.' },
    ],
  },
]

// ─────────────────────────────────────────────────────────────────────────────
// OPERATIONS MANUAL CONTENT
// ─────────────────────────────────────────────────────────────────────────────

const OPS_SECTIONS = [
  { id: 'ops-opening', title: 'Opening — Grow & Production', icon: '🌅', steps: [
    { num: 1, text: 'Badge in at the kiosk; agent badge visible. DRAFT — to be written and approved by Twisted Growers HR. Nothing here is company policy until it is published in the Handbook Builder.' },
    { num: 2, text: 'Walk every room: temperature, humidity, lights, fans, doors. Log anything off.' },
    { num: 3, text: 'Check the day\'s posted schedule and your zone in the app.' },
  ]},
  { id: 'ops-closing', title: 'Closing', icon: '🌙', steps: [
    { num: 1, text: 'Rooms tidy, tools cleaned, waste logged in Metrc. DRAFT — to be written and approved by Twisted Growers HR. Nothing here is company policy until it is published in the Handbook Builder.' },
    { num: 2, text: 'Leave zero surprises for the opener: restock, label, note.' },
    { num: 3, text: 'Badge out. Do not leave with product, tags or notes.' },
  ]},
  { id: 'ops-harvest', title: 'Harvest Day', icon: '✂️', steps: [
    { num: 1, text: 'Confirm the harvest batch and plant tags in Metrc before the first cut. DRAFT — to be written and approved by Twisted Growers HR. Nothing here is company policy until it is published in the Handbook Builder.' },
    { num: 2, text: 'Weigh wet at the room; weights are entered once, at the scale.' },
    { num: 3, text: 'Hang in the assigned dry room; label the rack with the harvest name.' },
  ]},
  { id: 'ops-trim', title: 'Trim Room', icon: '🌿', steps: [
    { num: 1, text: 'Gloves on, station wiped, scale zeroed. DRAFT — to be written and approved by Twisted Growers HR. Nothing here is company policy until it is published in the Handbook Builder.' },
    { num: 2, text: 'One harvest per table at a time; never mix tags.' },
  ]},
  { id: 'ops-extraction', title: 'Extraction', icon: '🧪', steps: [
    { num: 1, text: 'Follow the room\'s written safety procedure; never work alone in the hydrocarbon room. DRAFT — to be written and approved by Twisted Growers HR. Nothing here is company policy until it is published in the Handbook Builder.' },
  ]},
  { id: 'ops-packaging', title: 'Packaging & Labelling', icon: '📦', steps: [
    { num: 1, text: 'Every finished unit carries the Metrc package tag and the required Massachusetts label. DRAFT — to be written and approved by Twisted Growers HR. Nothing here is company policy until it is published in the Handbook Builder.' },
  ]},
]

// ─────────────────────────────────────────────────────────────────────────────
// QUICK REFERENCE CONTENT
// ─────────────────────────────────────────────────────────────────────────────

const CONTACTS = [
  // Filled in Settings › Locations once HR enters Twisted Growers contacts. Emergency: 911.
  { name: 'Police / Fire / EMS', role: 'Emergency', phone: '911', email: '—' },
]

const HOLIDAYS_2026 = [
  { date: 'January 1',    holiday: 'New Year\'s Day',        status: 'To be set by HR' },
  { date: 'January 19',   holiday: 'Martin Luther King Jr.',  status: 'To be set by HR' },
  { date: 'February 16',  holiday: 'Presidents\' Day',        status: 'To be set by HR' },
  { date: 'April 3',      holiday: 'Good Friday',             status: 'Open – Normal Hours' },
  { date: 'May 25',       holiday: 'Memorial Day',            status: 'To be set by HR' },
  { date: 'July 4',       holiday: 'Independence Day',        status: 'To be set by HR' },
  { date: 'September 7',  holiday: 'Labor Day',               status: 'To be set by HR' },
  { date: 'November 26',  holiday: 'Thanksgiving',            status: 'To be set by HR' },
  { date: 'November 27',  holiday: 'Black Friday',            status: 'Open – Extended Hours' },
  { date: 'December 24',  holiday: 'Christmas Eve',           status: 'Open – 10am–6pm' },
  { date: 'December 25',  holiday: 'Christmas Day',           status: 'To be set by HR' },
  { date: 'December 31',  holiday: 'New Year\'s Eve',         status: 'Open – 10am–8pm' },
]

const PAY_PERIODS_2026 = [
  { period: 'PP-01', start: 'Jan 4',  end: 'Jan 17',  payday: 'Jan 23' },
  { period: 'PP-02', start: 'Jan 18', end: 'Jan 31',  payday: 'Feb 6' },
  { period: 'PP-03', start: 'Feb 1',  end: 'Feb 14',  payday: 'Feb 20' },
  { period: 'PP-04', start: 'Feb 15', end: 'Feb 28',  payday: 'Mar 6' },
  { period: 'PP-05', start: 'Mar 1',  end: 'Mar 14',  payday: 'Mar 20' },
  { period: 'PP-06', start: 'Mar 15', end: 'Mar 28',  payday: 'Apr 3' },
  { period: 'PP-07', start: 'Mar 29', end: 'Apr 11',  payday: 'Apr 17' },
  { period: 'PP-08', start: 'Apr 12', end: 'Apr 25',  payday: 'May 1' },
  { period: 'PP-09', start: 'Apr 26', end: 'May 9',   payday: 'May 15' },
  { period: 'PP-10', start: 'May 10', end: 'May 23',  payday: 'May 29' },
  { period: 'PP-11', start: 'May 24', end: 'Jun 6',   payday: 'Jun 12' },
  { period: 'PP-12', start: 'Jun 7',  end: 'Jun 20',  payday: 'Jun 26' },
  { period: 'PP-13', start: 'Jun 21', end: 'Jul 4',   payday: 'Jul 10' },
  { period: 'PP-14', start: 'Jul 5',  end: 'Jul 18',  payday: 'Jul 24' },
]

const BENEFIT_DATES = []  // HR sets Twisted Growers enrollment windows in Benefits › Administration

const TRAINING_DEADLINES = []  // Training deadlines come from Training › Modules once HR assigns them

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const cardStyle = {
  background: 'var(--t-surface)',
  border: '1px solid var(--t-line)',
  padding: 0,
  overflow: 'hidden',
}

// Escape a plain string so it is safe to inject as HTML text content.
// This prevents any HTML in the static content or search term from being
// interpreted as markup. Only used for the search-highlight path.
function escHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// ─────────────────────────────────────────────────────────────────────────────
// Live employee-manual mapping (Supabase RPC → handbook section shape)
// ─────────────────────────────────────────────────────────────────────────────

const HB_ICON_BY_CATEGORY = {
  'Code of Conduct': '⚖️',
  'Safety': '🛡️',
  'Employment': '📋',
  'Compensation': '💰',
  'Attendance': '🗓️',
}

// Turn a plain-text policy body (numbered sections separated by blank lines)
// into the block shape SectionCard already renders. Lines like "1. PURPOSE"
// become headings; everything else becomes a paragraph.
function bodyToBlocks(body) {
  const blocks = []
  const chunks = String(body || '').split(/\n\s*\n/)
  chunks.forEach(chunk => {
    const trimmed = chunk.trim()
    if (!trimmed) return
    const lines = trimmed.split('\n')
    const first = lines[0].trim()
    // Heading = "N. UPPERCASE TITLE" with no lowercase letters in the label.
    const m = first.match(/^(\d+)\.\s+(.+)$/)
    if (m && m[2] === m[2].toUpperCase() && /[A-Z]/.test(m[2])) {
      blocks.push({ type: 'heading', text: `${m[1]}. ${m[2].trim()}` })
      const rest = lines.slice(1).join('\n').trim()
      if (rest) blocks.push({ type: 'para', text: rest })
    } else {
      blocks.push({ type: 'para', text: trimmed })
    }
  })
  return blocks.length ? blocks : [{ type: 'para', text: String(body || '') }]
}

// Map the RPC rows into handbook sections. Rows repeat per node id, so dedupe
// by policy id. Returns [] when nothing usable so callers keep the mock.
function rowsToHandbookSections(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return []
  const seen = new Set()
  const out = []
  rows.forEach(r => {
    if (!r || seen.has(r.id)) return
    seen.add(r.id)
    let parsed = {}
    try { parsed = typeof r.content === 'string' ? JSON.parse(r.content) : (r.content || {}) }
    catch { parsed = {} }
    const title = parsed.title || r.name || 'Policy'
    const category = parsed.category || ''
    const content = []
    if (parsed.summary) content.push({ type: 'para', text: parsed.summary })
    const meta = []
    if (parsed.applies_to) meta.push(['Applies To', parsed.applies_to])
    if (parsed.status) meta.push(['Status', parsed.status])
    if (parsed.version_label) meta.push(['Version', parsed.version_label])
    if (parsed.effective_date) meta.push(['Effective', parsed.effective_date])
    if (r.requires_ack) meta.push(['Acknowledgement', 'Required'])
    if (meta.length) content.push({ type: 'table', headers: ['Field', 'Detail'], rows: meta })
    if (parsed.body) content.push(...bodyToBlocks(parsed.body))
    out.push({
      id: `hb-live-${r.id}`,
      title,
      icon: HB_ICON_BY_CATEGORY[category] || '📄',
      content,
    })
  })
  return out
}

function SectionCard({ section, open, onToggle, search }) {
  // Highlight matching search terms. Content is static (hardcoded in this
  // file, never from user input or the network), but we HTML-escape both the
  // content text and the search term before constructing the markup so there
  // is no XSS surface regardless of the content source.
  const highlight = (text) => {
    const escaped = escHtml(text)
    if (!search.trim()) return escaped
    const escapedQuery = escHtml(search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const re = new RegExp(`(${escapedQuery})`, 'gi')
    return escaped.replace(re, '<mark style="background:rgba(0,229,255,.25);color:inherit;padding:0 2px;">$1</mark>')
  }

  return (
    <div style={cardStyle}>
      {/* Header */}
      <div
        onClick={onToggle}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '14px 18px',
          cursor: 'pointer',
          background: open ? 'var(--t-surface-2)' : 'var(--t-surface)',
          borderBottom: open ? '1px solid var(--t-line)' : 'none',
          transition: 'background .15s',
        }}
      >
        <span style={{ fontSize: 18 }}>{section.icon}</span>
        <span style={{ flex: 1, fontSize: 14, fontWeight: 700, color: 'var(--t-text)' }}>{section.title}</span>
        <span style={{ fontSize: 18, color: 'var(--t-text-muted)', transition: 'transform .2s', transform: open ? 'rotate(180deg)' : 'none' }}>
          ▾
        </span>
      </div>

      {/* Body */}
      {open && (
        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {section.content.map((block, i) => {
            if (block.type === 'heading') return (
              <div key={i} style={{ fontSize: 13, fontWeight: 800, color: 'var(--t-accent)', textTransform: 'uppercase', letterSpacing: '.06em', marginTop: i > 0 ? 8 : 0 }}>
                {block.text}
              </div>
            )
            if (block.type === 'para') return (
              <p key={i} style={{ fontSize: 13, lineHeight: 1.7, color: 'var(--t-text-muted)', margin: 0 }}
                dangerouslySetInnerHTML={{ __html: highlight(block.text) }} />
            )
            if (block.type === 'list') return (
              <ul key={i} style={{ margin: 0, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {block.items.map((item, j) => (
                  <li key={j} style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--t-text-muted)' }}
                    dangerouslySetInnerHTML={{ __html: highlight(item) }} />
                ))}
              </ul>
            )
            if (block.type === 'table') return (
              <div key={i} style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: 'rgba(0,229,255,.08)' }}>
                      {block.headers.map((h, k) => (
                        <th key={k} style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 700, color: 'var(--t-accent)', letterSpacing: '.04em', borderBottom: '1px solid var(--t-line)', whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {block.rows.map((row, k) => (
                      <tr key={k} style={{ borderBottom: '1px solid var(--t-line)' }}>
                        {row.map((cell, m) => (
                          <td key={m} style={{ padding: '8px 12px', color: 'var(--t-text-muted)', fontSize: 12 }}>{cell}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
            return null
          })}
        </div>
      )}
    </div>
  )
}

function OpsCard({ section, open, onToggle }) {
  return (
    <div style={cardStyle}>
      <div
        onClick={onToggle}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '14px 18px',
          cursor: 'pointer',
          background: open ? 'var(--t-surface-2)' : 'var(--t-surface)',
          borderBottom: open ? '1px solid var(--t-line)' : 'none',
          transition: 'background .15s',
        }}
      >
        <span style={{ fontSize: 18 }}>{section.icon}</span>
        <span style={{ flex: 1, fontSize: 14, fontWeight: 700, color: 'var(--t-text)' }}>{section.title}</span>
        <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--t-text-muted)', marginRight: 8 }}>{section.steps.length} steps</span>
        <span style={{ fontSize: 18, color: 'var(--t-text-muted)', transition: 'transform .2s', transform: open ? 'rotate(180deg)' : 'none' }}>
          ▾
        </span>
      </div>
      {open && (
        <div style={{ padding: '16px 24px', display: 'flex', flexDirection: 'column', gap: 0 }}>
          {section.steps.map((step, i) => (
            <div key={i} style={{
              display: 'flex',
              gap: 14,
              padding: '12px 0',
              borderBottom: i < section.steps.length - 1 ? '1px solid var(--t-line)' : 'none',
              alignItems: 'flex-start',
            }}>
              <div style={{
                width: 28, height: 28,
                borderRadius: '50%',
                background: 'var(--t-surface-2)',
                border: '1px solid var(--t-line)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 11, fontWeight: 800, color: 'var(--t-accent)',
                flexShrink: 0,
                marginTop: 1,
              }}>{step.num}</div>
              <div style={{ fontSize: 13, lineHeight: 1.65, color: 'var(--t-text-muted)', flex: 1 }}>{step.text}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────

const TABS = ['Employee Handbook', 'Operations Manual', 'Quick Reference']

export default function Manual() {
  const { session } = useAuth()
  const person = session?.person
  const { locationIds } = useScope()
  const [tab,    setTab]    = useState('Employee Handbook')
  const [search, setSearch] = useState('')
  const [openIds, setOpenIds] = useState(() => new Set(['hb-overview', 'ops-opening']))

  // Live employee-manual sections from Supabase. Null until a non-empty,
  // error-free result arrives — on error/empty we keep the hardcoded mock.
  const [liveHandbook, setLiveHandbook] = useState(null)

  useEffect(() => {
    let cancelled = false
    if (!locationIds || locationIds.length === 0) return
    ;(async () => {
      try {
        const { data, error } = await sb.rpc('get_employee_manual', { p_node_ids: locationIds })
        if (cancelled) return
        if (error) { console.warn('get_employee_manual failed', error); return }
        const mapped = rowsToHandbookSections(data)
        if (mapped.length) setLiveHandbook(mapped)
      } catch (e) {
        if (!cancelled) console.warn('get_employee_manual threw', e)
      }
    })()
    return () => { cancelled = true }
  }, [locationIds])

  // Use live handbook content when available; otherwise fall back to the mock.
  const handbookSections = liveHandbook && liveHandbook.length ? liveHandbook : HANDBOOK_SECTIONS

  const searchRef = useRef(null)

  const toggleSection = useCallback((id) => {
    setOpenIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const expandAll = useCallback((ids) => {
    setOpenIds(new Set(ids))
  }, [])

  const collapseAll = useCallback(() => {
    setOpenIds(new Set())
  }, [])

  // Filter handbook by search
  const filteredHandbook = useMemo(() => {
    if (!search.trim()) return handbookSections
    const q = search.toLowerCase()
    return handbookSections.filter(s =>
      s.title.toLowerCase().includes(q) ||
      s.content.some(b => {
        if (b.type === 'para' || b.type === 'heading') return b.text.toLowerCase().includes(q)
        if (b.type === 'list') return b.items.some(item => item.toLowerCase().includes(q))
        if (b.type === 'table') return b.rows.some(row => row.some(cell => cell.toLowerCase().includes(q)))
        return false
      })
    )
  }, [search, handbookSections])

  const filteredOps = useMemo(() => {
    if (!search.trim()) return OPS_SECTIONS
    const q = search.toLowerCase()
    return OPS_SECTIONS.filter(s =>
      s.title.toLowerCase().includes(q) ||
      s.steps.some(st => st.text.toLowerCase().includes(q))
    )
  }, [search])

  // Auto-expand search hits
  useEffect(() => {
    if (search.trim()) {
      if (tab === 'Employee Handbook') {
        setOpenIds(new Set(filteredHandbook.map(s => s.id)))
      } else if (tab === 'Operations Manual') {
        setOpenIds(new Set(filteredOps.map(s => s.id)))
      }
    }
  }, [search, tab, filteredHandbook, filteredOps])

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 900, color: 'var(--t-text)', letterSpacing: '-.02em', marginBottom: 2 }}>
              Employee Handbook & Operations Manual
            </div>
            <div style={{ fontSize: 13, color: 'var(--t-text-muted)' }}>
              Twisted Growers · Massachusetts · 4 Locations
            </div>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{
              padding: '4px 10px',
              background: 'var(--t-surface-2)',
              border: '1px solid var(--t-line)',
              fontSize: 11,
              color: 'var(--t-text-muted)',
              fontFamily: 'monospace',
            }}>v2.1.0</span>
            <span style={{
              padding: '4px 10px',
              background: 'var(--t-surface-2)',
              border: '1px solid var(--t-line)',
              fontSize: 11,
              color: 'var(--t-text-muted)',
            }}>Last Updated: Jun 1, 2026</span>
          </div>
        </div>

        {/* Search bar — prominent */}
        <div style={{ position: 'relative' }}>
          <div style={{
            position: 'absolute',
            left: 14,
            top: '50%',
            transform: 'translateY(-50%)',
            fontSize: 16,
            color: 'var(--t-text-muted)',
            pointerEvents: 'none',
          }}>⌕</div>
          <input
            ref={searchRef}
            type="search"
            placeholder={`Search ${tab === 'Employee Handbook' ? 'handbook' : tab === 'Operations Manual' ? 'operations manual' : 'quick reference'}…`}
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              width: '100%',
              boxSizing: 'border-box',
              background: 'var(--t-surface)',
              border: '1px solid var(--t-line)',
              color: 'var(--t-text)',
              padding: '12px 14px 12px 40px',
              fontSize: 14,
              outline: 'none',
              fontFamily: 'inherit',
            }}
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              style={{
                position: 'absolute',
                right: 12,
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'none',
                border: 'none',
                color: 'var(--t-text-muted)',
                cursor: 'pointer',
                fontSize: 16,
                lineHeight: 1,
              }}
            >✕</button>
          )}
        </div>
        {search && (
          <div style={{ fontSize: 11, color: 'var(--t-text-muted)', marginTop: 6 }}>
            {tab === 'Employee Handbook' && `${filteredHandbook.length} of ${handbookSections.length} sections match`}
            {tab === 'Operations Manual' && `${filteredOps.length} of ${OPS_SECTIONS.length} sections match`}
          </div>
        )}
      </div>

      {/* Tab bar */}
      <div style={{
        display: 'flex',
        gap: 0,
        borderBottom: '1px solid var(--t-line)',
        marginBottom: 24,
      }}>
        {TABS.map(t => (
          <button
            key={t}
            onClick={() => { setTab(t); setSearch('') }}
            style={{
              background: 'none',
              border: 'none',
              borderBottom: tab === t ? '2px solid var(--t-accent)' : '2px solid transparent',
              color: tab === t ? 'var(--t-accent)' : 'var(--t-text-muted)',
              padding: '10px 20px',
              fontSize: 13,
              fontWeight: tab === t ? 700 : 500,
              cursor: 'pointer',
              letterSpacing: '.03em',
              transition: 'all .15s',
              marginBottom: -1,
              fontFamily: 'inherit',
              whiteSpace: 'nowrap',
            }}
          >{t}</button>
        ))}
      </div>

      {/* ── EMPLOYEE HANDBOOK ─────────────────────────────── */}
      {tab === 'Employee Handbook' && (
        <div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 16, alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: 'var(--t-text-muted)', marginRight: 4 }}>
              {handbookSections.length} sections
            </span>
            <button
              onClick={() => expandAll(handbookSections.map(s => s.id))}
              style={{ background: 'var(--t-surface-2)', border: '1px solid var(--t-line)', color: 'var(--t-text-muted)', padding: '5px 12px', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}
            >
              Expand All
            </button>
            <button
              onClick={collapseAll}
              style={{ background: 'var(--t-surface-2)', border: '1px solid var(--t-line)', color: 'var(--t-text-muted)', padding: '5px 12px', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}
            >
              Collapse All
            </button>
          </div>

          {filteredHandbook.length === 0 && (
            <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--t-text-muted)', fontSize: 13 }}>
              No sections match "{search}"
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {filteredHandbook.map(s => (
              <SectionCard
                key={s.id}
                section={s}
                open={openIds.has(s.id)}
                onToggle={() => toggleSection(s.id)}
                search={search}
              />
            ))}
          </div>
        </div>
      )}

      {/* ── OPERATIONS MANUAL ─────────────────────────────── */}
      {tab === 'Operations Manual' && (
        <div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 16, alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: 'var(--t-text-muted)', marginRight: 4 }}>
              {OPS_SECTIONS.length} procedure sets
            </span>
            <button
              onClick={() => expandAll(OPS_SECTIONS.map(s => s.id))}
              style={{ background: 'var(--t-surface-2)', border: '1px solid var(--t-line)', color: 'var(--t-text-muted)', padding: '5px 12px', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}
            >
              Expand All
            </button>
            <button
              onClick={collapseAll}
              style={{ background: 'var(--t-surface-2)', border: '1px solid var(--t-line)', color: 'var(--t-text-muted)', padding: '5px 12px', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}
            >
              Collapse All
            </button>
          </div>

          {filteredOps.length === 0 && (
            <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--t-text-muted)', fontSize: 13 }}>
              No procedures match "{search}"
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {filteredOps.map(s => (
              <OpsCard
                key={s.id}
                section={s}
                open={openIds.has(s.id)}
                onToggle={() => toggleSection(s.id)}
              />
            ))}
          </div>
        </div>
      )}

      {/* ── QUICK REFERENCE ───────────────────────────────── */}
      {tab === 'Quick Reference' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

          {/* Contact Directory */}
          <div style={cardStyle}>
            <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--t-line)', display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 18 }}>📞</span>
              <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--t-text)' }}>Contact Directory</span>
              <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--t-text-muted)', fontStyle: 'italic' }}>Print-ready reference</span>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: 'rgba(0,229,255,.07)' }}>
                    <th style={{ padding: '9px 16px', textAlign: 'left', fontWeight: 700, color: 'var(--t-accent)', letterSpacing: '.04em', borderBottom: '1px solid var(--t-line)' }}>Name</th>
                    <th style={{ padding: '9px 16px', textAlign: 'left', fontWeight: 700, color: 'var(--t-accent)', letterSpacing: '.04em', borderBottom: '1px solid var(--t-line)' }}>Role</th>
                    <th style={{ padding: '9px 16px', textAlign: 'left', fontWeight: 700, color: 'var(--t-accent)', letterSpacing: '.04em', borderBottom: '1px solid var(--t-line)' }}>Phone</th>
                    <th style={{ padding: '9px 16px', textAlign: 'left', fontWeight: 700, color: 'var(--t-accent)', letterSpacing: '.04em', borderBottom: '1px solid var(--t-line)' }}>Email</th>
                  </tr>
                </thead>
                <tbody>
                  {CONTACTS.map((c, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid var(--t-line)', background: c.role === 'Emergency' ? 'rgba(255,82,82,.06)' : 'transparent' }}>
                      <td style={{ padding: '10px 16px', fontWeight: c.role === 'Emergency' ? 700 : 500, color: 'var(--t-text)' }}>{c.name}</td>
                      <td style={{ padding: '10px 16px', color: 'var(--t-text-muted)' }}>{c.role}</td>
                      <td style={{ padding: '10px 16px', fontFamily: 'monospace', color: c.role === 'Emergency' ? 'var(--t-danger)' : 'var(--t-accent)' }}>{c.phone}</td>
                      <td style={{ padding: '10px 16px', color: 'var(--t-text-muted)', fontFamily: 'monospace', fontSize: 11 }}>{c.email}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Holiday Schedule */}
          <div style={cardStyle}>
            <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--t-line)', display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 18 }}>🎉</span>
              <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--t-text)' }}>Holiday Schedule 2026</span>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: 'rgba(0,229,255,.07)' }}>
                    {['Date', 'Holiday', 'Status'].map(h => (
                      <th key={h} style={{ padding: '9px 16px', textAlign: 'left', fontWeight: 700, color: 'var(--t-accent)', letterSpacing: '.04em', borderBottom: '1px solid var(--t-line)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {HOLIDAYS_2026.map((h, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid var(--t-line)' }}>
                      <td style={{ padding: '10px 16px', fontWeight: 600, color: 'var(--t-text)', whiteSpace: 'nowrap' }}>{h.date}</td>
                      <td style={{ padding: '10px 16px', color: 'var(--t-text-muted)' }}>{h.holiday}</td>
                      <td style={{ padding: '10px 16px' }}>
                        <span style={{
                          padding: '2px 8px',
                          fontSize: 10,
                          fontWeight: 700,
                          background: h.status === 'Closed' ? 'rgba(255,82,82,.15)' : h.status.includes('Extended') ? 'rgba(0,230,118,.15)' : 'rgba(255,149,0,.12)',
                          color: h.status === 'Closed' ? 'var(--t-danger)' : h.status.includes('Extended') ? 'var(--t-success)' : 'var(--t-warn)',
                          letterSpacing: '.04em',
                        }}>{h.status}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Pay Period Calendar */}
          <div style={cardStyle}>
            <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--t-line)', display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 18 }}>💳</span>
              <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--t-text)' }}>Pay Period Calendar 2026</span>
              <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--t-text-muted)' }}>Bi-weekly · Payday = Friday</span>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: 'rgba(0,229,255,.07)' }}>
                    {['Period', 'Start', 'End', 'Payday'].map(h => (
                      <th key={h} style={{ padding: '9px 16px', textAlign: 'left', fontWeight: 700, color: 'var(--t-accent)', letterSpacing: '.04em', borderBottom: '1px solid var(--t-line)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {PAY_PERIODS_2026.map((p, i) => {
                    const isCurrent = p.period === 'PP-12' || p.period === 'PP-13'
                    return (
                      <tr key={i} style={{ borderBottom: '1px solid var(--t-line)', background: isCurrent ? 'rgba(0,229,255,.05)' : 'transparent' }}>
                        <td style={{ padding: '10px 16px', fontFamily: 'monospace', fontWeight: 700, color: isCurrent ? 'var(--t-accent)' : 'var(--t-text-muted)' }}>{p.period}</td>
                        <td style={{ padding: '10px 16px', color: 'var(--t-text-muted)' }}>{p.start}, 2026</td>
                        <td style={{ padding: '10px 16px', color: 'var(--t-text-muted)' }}>{p.end}, 2026</td>
                        <td style={{ padding: '10px 16px', fontWeight: 600, color: isCurrent ? 'var(--t-accent)' : 'var(--t-text)' }}>
                          {p.payday}, 2026
                          {isCurrent && <span style={{ marginLeft: 8, fontSize: 9, fontWeight: 700, color: 'var(--t-accent)', letterSpacing: '.06em' }}>CURRENT</span>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Benefit Enrollment Dates */}
          <div style={cardStyle}>
            <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--t-line)', display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 18 }}>🏥</span>
              <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--t-text)' }}>Benefit Enrollment Dates</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              {BENEFIT_DATES.map((b, i) => (
                <div key={i} style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 16,
                  padding: '12px 18px',
                  borderBottom: i < BENEFIT_DATES.length - 1 ? '1px solid var(--t-line)' : 'none',
                  flexWrap: 'wrap',
                }}>
                  <div style={{ minWidth: 200 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--t-text)' }}>{b.event}</div>
                    <div style={{ fontSize: 11, color: 'var(--t-text-faint)', marginTop: 2 }}>{b.note}</div>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--t-accent)', fontWeight: 600, fontFamily: 'monospace' }}>{b.dates}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Training Deadlines */}
          <div style={cardStyle}>
            <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--t-line)', display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 18 }}>📆</span>
              <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--t-text)' }}>Training Deadlines 2026</span>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: 'rgba(0,229,255,.07)' }}>
                    {['Module', 'Required For', 'Deadline', ''].map((h, i) => (
                      <th key={i} style={{ padding: '9px 16px', textAlign: 'left', fontWeight: 700, color: 'var(--t-accent)', letterSpacing: '.04em', borderBottom: '1px solid var(--t-line)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {TRAINING_DEADLINES.map((t, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid var(--t-line)', background: t.status === 'urgent' ? 'rgba(255,82,82,.04)' : 'transparent' }}>
                      <td style={{ padding: '10px 16px', fontWeight: 600, color: 'var(--t-text)' }}>{t.module}</td>
                      <td style={{ padding: '10px 16px', color: 'var(--t-text-muted)' }}>{t.role}</td>
                      <td style={{ padding: '10px 16px', color: t.status === 'urgent' ? 'var(--t-danger)' : 'var(--t-text-muted)', fontWeight: t.status === 'urgent' ? 700 : 400 }}>{t.deadline}</td>
                      <td style={{ padding: '10px 16px' }}>
                        <span style={{
                          padding: '2px 8px',
                          fontSize: 9,
                          fontWeight: 700,
                          letterSpacing: '.06em',
                          background: t.status === 'urgent' ? 'rgba(255,82,82,.18)' : 'rgba(0,229,255,.1)',
                          color: t.status === 'urgent' ? 'var(--t-danger)' : 'var(--t-accent)',
                        }}>
                          {t.status === 'urgent' ? 'URGENT' : 'REQUIRED'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

        </div>
      )}
    </div>
  )
}
