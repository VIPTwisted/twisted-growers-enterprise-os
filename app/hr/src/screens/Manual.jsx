import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import { useAuth } from '../lib/auth.jsx'
import { useScope } from '../lib/scope.jsx'
import { sb } from '../lib/supabase'

// ─────────────────────────────────────────────────────────────────────────────
// HANDBOOK CONTENT — Twisted Growers starter skeleton (DRAFT until published in the Handbook Builder)
// ─────────────────────────────────────────────────────────────────────────────

// NOTHING IS TYPED IN HERE (Bible §12g, 14 Sep 2026). The handbook is hr.handbook_documents /
// hr_policies through get_employee_manual; procedures, contacts, holidays and pay periods come from
// hr.manual_reference() — published procedures (hr.hr_policies), the company's support contacts
// (hr.company_branding), the OS holiday calendar (public.holidays) and pay periods
// (public.pay_periods). An empty list is shown as empty with the place HR enters it.
const HANDBOOK_SECTIONS = []
const OPS_SECTIONS = []

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

  // Live handbook only — no typed-in fallback. Empty means HR has not published one yet.
  const handbookSections = liveHandbook && liveHandbook.length ? liveHandbook : HANDBOOK_SECTIONS

  // Quick reference and procedures: rows from hr.manual_reference()
  const [ref, setRef] = useState(null)
  const [refError, setRefError] = useState('')
  useEffect(() => {
    let live = true
    sb.rpc('manual_reference', { p_node_ids: locationIds || null, p_year: null }).then(({ data, error }) => {
      if (!live) return
      if (error) { setRefError(error.message); setRef({ procedures: [], contacts: [], holidays: [], pay_periods: [] }); return }
      setRef(data || { procedures: [], contacts: [], holidays: [], pay_periods: [] })
    })
    return () => { live = false }
  }, [JSON.stringify(locationIds)])
  const opsSections = useMemo(() => (ref?.procedures || []).map(p => ({
    id: 'ops-' + p.id, title: p.title, icon: '📋', version: p.version, effective_date: p.effective_date,
    steps: String(p.content || '').split(/\n+/).map(t => t.trim()).filter(Boolean).map((text, i) => ({ num: i + 1, text })),
  })), [ref])
  const CONTACTS = ref?.contacts || []
  const HOLIDAYS = ref?.holidays || []
  const PAY_PERIODS = ref?.pay_periods || []
  const refYear = ref?.year || new Date().getFullYear()
  const todayIso = new Date().toISOString().slice(0, 10)

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
    if (!search.trim()) return opsSections
    const q = search.toLowerCase()
    return opsSections.filter(s =>
      s.title.toLowerCase().includes(q) ||
      s.steps.some(st => st.text.toLowerCase().includes(q))
    )
  }, [search, opsSections])

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
            {tab === 'Operations Manual' && `${filteredOps.length} of ${opsSections.length} procedures match`}
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

          {handbookSections.length === 0 && (
            <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--t-text-muted)', fontSize: 13 }}>
              No handbook is published yet. HR writes Twisted Growers&rsquo; handbook in the Handbook Builder and publishes it; nothing here is company policy until then.
            </div>
          )}
          {handbookSections.length > 0 && filteredHandbook.length === 0 && (
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
              {opsSections.length} published procedure{opsSections.length === 1 ? '' : 's'}
            </span>
            <button
              onClick={() => expandAll(opsSections.map(s => s.id))}
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

          {ref === null && <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--t-text-faint)', fontSize: 13 }}>Reading procedures…</div>}
          {ref !== null && opsSections.length === 0 && (
            <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--t-text-muted)', fontSize: 13 }}>
              No procedures are published yet. HR writes them in the Policies hub (category “Procedure”) and publishes; they appear here the moment they are published.{refError && ` (${refError})`}
            </div>
          )}
          {ref !== null && opsSections.length > 0 && filteredOps.length === 0 && (
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
                  {CONTACTS.length <= 1 && <tr><td colSpan={4} style={{ padding: '10px 16px', color: 'var(--t-text-faint)', fontSize: 11 }}>HR / support contacts are entered in Settings › Company (support phone and email).</td></tr>}
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
                    {['Date', 'Holiday', 'Paid'].map(h => (
                      <th key={h} style={{ padding: '9px 16px', textAlign: 'left', fontWeight: 700, color: 'var(--t-accent)', letterSpacing: '.04em', borderBottom: '1px solid var(--t-line)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ref !== null && HOLIDAYS.length === 0 && <tr><td colSpan={3} style={{ padding: '10px 16px', color: 'var(--t-text-faint)', fontSize: 11 }}>No holidays are set for {refYear}. The calendar is entered in the OS (Settings › Holidays) and appears here.</td></tr>}
                  {HOLIDAYS.map((h, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid var(--t-line)' }}>
                      <td style={{ padding: '10px 16px', fontWeight: 600, color: 'var(--t-text)', whiteSpace: 'nowrap' }}>{h.date}</td>
                      <td style={{ padding: '10px 16px', color: 'var(--t-text-muted)' }}>{h.holiday}{h.department ? ` · ${h.department}` : ''}</td>
                      <td style={{ padding: '10px 16px' }}>
                        <span style={{ padding: '2px 8px', fontSize: 10, fontWeight: 700, background: h.paid ? 'rgba(0,230,118,.15)' : 'rgba(255,149,0,.12)', color: h.paid ? 'var(--t-success)' : 'var(--t-warn)', letterSpacing: '.04em' }}>
                          {h.paid ? `PAID${h.hours ? ` · ${h.hours} h` : ''}` : 'UNPAID'}{h.multiplier_if_worked ? ` · ×${h.multiplier_if_worked} if worked` : ''}
                        </span>
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
              <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--t-text)' }}>Pay Period Calendar {refYear}</span>
              <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--t-text-muted)' }}>{PAY_PERIODS[0]?.frequency ? `${PAY_PERIODS[0].frequency} · from the OS pay periods` : 'from the OS pay periods'}</span>
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
                  {ref !== null && PAY_PERIODS.length === 0 && <tr><td colSpan={4} style={{ padding: '10px 16px', color: 'var(--t-text-faint)', fontSize: 11 }}>No pay periods are set for {refYear}. They are entered in the OS (Finance › Pay Periods) and appear here.</td></tr>}
                  {PAY_PERIODS.map((p, i) => {
                    const isCurrent = p.start <= todayIso && todayIso <= p.end
                    return (
                      <tr key={i} style={{ borderBottom: '1px solid var(--t-line)', background: isCurrent ? 'rgba(0,229,255,.05)' : 'transparent' }}>
                        <td style={{ padding: '10px 16px', fontFamily: 'monospace', fontWeight: 700, color: isCurrent ? 'var(--t-accent)' : 'var(--t-text-muted)' }}>{p.period}</td>
                        <td style={{ padding: '10px 16px', color: 'var(--t-text-muted)' }}>{p.start}</td>
                        <td style={{ padding: '10px 16px', color: 'var(--t-text-muted)' }}>{p.end}</td>
                        <td style={{ padding: '10px 16px', fontWeight: 600, color: isCurrent ? 'var(--t-accent)' : 'var(--t-text)' }}>
                          {p.payday}
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
