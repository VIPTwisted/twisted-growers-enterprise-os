import { useState, useEffect, useCallback, useMemo } from 'react'
import { useFeatureFlag } from '../lib/featureFlags.js'
import { useConfig } from '../lib/config.js'
import { sb, getSession } from '../lib/supabase'
import { companyName } from '../lib/config.js'

// ── Shared sub-components ────────────────────────────────────────────────────

function KTile({ label, value, sub, color, alert }) {
  return (
    <div style={{ background: 'var(--t-surface)', border: `1px solid ${alert === 'red' ? 'var(--t-danger)' : alert === 'amber' ? 'var(--t-warn)' : 'var(--t-line)'}`, padding: '14px 16px', position: 'relative', overflow: 'hidden', borderRadius: 0 }}>
      {alert === 'red' && <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'var(--t-danger)' }} />}
      {alert === 'amber' && <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'var(--t-warn)' }} />}
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.08em', color: 'var(--t-text-muted)', textTransform: 'uppercase', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800, color: color || 'var(--t-text)', lineHeight: 1, marginBottom: 4 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--t-text-faint)' }}>{sub}</div>}
    </div>
  )
}

function SL({ children }) {
  return <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.1em', color: 'var(--t-accent)', textTransform: 'uppercase', marginBottom: 10 }}>{children}</div>
}

// ── Static catalog (Massachusetts statutory requirements — reference definitions, not data; verify with counsel) ──

function buildCategories(config) {
  return [
    {
      id: 'wage-hour',
      name: 'MA WAGE & HOUR',
      items: [
        { id: 'mawh1', label: `Minimum wage posted ($${config.min_wage}/hr — M.G.L. c.151 §1)` },
        { id: 'mawh2', label: `Overtime paid at ${config.ot_multiplier}× for >${config.ot_threshold_weekly}h/week (c.151 §1A)` },
        { id: 'mawh3', label: 'Wages paid within the timing of M.G.L. c.149 §148; pay stubs on each pay date' },
        { id: 'mawh4', label: 'Payroll records retained 3+ years (c.151 §15)' },
        { id: 'mawh5', label: 'Discharged employees paid in full on the day of discharge (c.149 §148)' },
        { id: 'mawh6', label: '30-minute meal break on shifts over 6 hours (c.149 §100)' },
      ],
    },
    {
      id: 'sick-time',
      name: 'MA EARNED SICK TIME — c.149 §148C',
      items: [
        { id: 'mast1', label: 'Accrual rate correct (1 hr per 30 h worked)' },
        { id: 'mast2', label: `Cap enforced (${config.paid_leave_accrual_hours} hours/year)` },
        { id: 'mast3', label: 'Earned Sick Time poster displayed' },
        { id: 'mast4', label: 'Employees notified of rights at hire' },
        { id: 'mast5', label: 'Records maintained for 3 years' },
      ],
    },
    {
      id: 'pfml',
      name: 'MA PAID FAMILY & MEDICAL LEAVE — c.175M',
      items: [
        { id: 'mapf1', label: 'PFML poster displayed' },
        { id: 'mapf2', label: 'Written notice of rights given within 30 days of hire (signed)' },
        { id: 'mapf3', label: 'Contributions remitted to the Department of Family and Medical Leave' },
        { id: 'mapf4', label: 'Leave policy in employee handbook' },
      ],
    },
    {
      id: 'cannabis',
      name: 'CANNABIS CONTROL COMMISSION — 935 CMR 500',
      items: [
        { id: 'macc1', label: 'Every employee holds a current agent registration (500.030)' },
        { id: 'macc2', label: 'Agent badges worn on the premises' },
        { id: 'macc3', label: 'Required annual agent training completed and recorded (500.105)' },
        { id: 'macc4', label: 'Diversion and theft reporting procedure in place' },
        { id: 'macc5', label: 'Security, access and surveillance requirements met (500.110)' },
        { id: 'macc6', label: 'Metrc entries current; discrepancies logged and reviewed' },
      ],
    },
    {
      id: 'posters',
      name: 'REQUIRED POSTINGS',
      items: [
        { id: 'mapo1', label: 'MA Wage & Hour laws poster' },
        { id: 'mapo2', label: 'MA Fair Employment (c.151B) poster' },
        { id: 'mapo3', label: 'Unemployment Insurance and Workers\' Compensation notices' },
        { id: 'mapo4', label: 'Parental Leave notice (c.149 §105D)' },
        { id: 'mapo5', label: 'Federal posters: FLSA, EEO, OSHA, FMLA, USERRA, EPPA' },
      ],
    },
    {
      id: 'harassment',
      name: 'ANTI-HARASSMENT — c.151B §3A',
      items: [
        { id: 'mahr1', label: 'Written sexual-harassment policy adopted' },
        { id: 'mahr2', label: 'Policy distributed to every employee annually (acknowledgments on file)' },
        { id: 'mahr3', label: 'Complaint procedure and MCAD / EEOC contact information included' },
      ],
    },
  ]
}

const STATUS_OPTIONS = ['Pending', 'Scheduled', 'Due Soon', 'Complete']

function statusColor(s) {
  if (s === 'Due Soon') return 'var(--t-danger)'
  if (s === 'Pending') return 'var(--t-warn)'
  if (s === 'Scheduled') return 'var(--t-accent)'
  if (s === 'Complete') return 'var(--t-success)'
  return 'var(--t-text-muted)'
}

function fmtDate(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d)) return '—'
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

// ── Tab 1: Compliance Checklist (real state via RPC) ─────────────────────────

function ChecklistTab({ config, categories, state, nodeId, personId, loading, error, onReload }) {
  const [collapsed, setCollapsed] = useState({})
  const [toast, setToast] = useState('')
  const [drafts, setDrafts] = useState({}) // local note edits before blur

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(''), 3000)
    return () => clearTimeout(t)
  }, [toast])

  const canSave = !!nodeId

  async function persist(itemKey, checked, note) {
    if (!canSave) { setToast('Assign a location before recording compliance.'); return }
    const { data, error: err } = await sb.rpc('compliance_checklist_set', {
      p_node_id: nodeId,
      p_item_key: itemKey,
      p_checked: checked,
      p_note: note ?? null,
      p_reviewed_by: personId,
    })
    if (err || (data && data.ok === false)) {
      setToast('Not saved — please try again.')
      return
    }
    await onReload()
  }

  function toggle(item) {
    const cur = state[item.id] || {}
    persist(item.id, !cur.checked, drafts[item.id] ?? cur.note ?? '')
  }

  function onNoteBlur(item) {
    const cur = state[item.id] || {}
    const draft = drafts[item.id]
    if (draft === undefined || draft === (cur.note ?? '')) return
    persist(item.id, !!cur.checked, draft)
    setToast('Note saved.')
  }

  function exportReport() {
    const lines = ['' + companyName() + ' — LABOR COMPLIANCE REPORT', `Generated: ${new Date().toLocaleString()}`, '']
    categories.forEach(cat => {
      lines.push(`== ${cat.name} ==`)
      cat.items.forEach(item => {
        const st = state[item.id] || {}
        lines.push(`  [${st.checked ? 'X' : ' '}] ${item.label}`)
        if (st.note) lines.push(`       Note: ${st.note}`)
        if (st.last_reviewed_at) lines.push(`       Last reviewed: ${fmtDate(st.last_reviewed_at)}`)
      })
      lines.push('')
    })
    const blob = new Blob([lines.join('\n')], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `ct-compliance-${new Date().toISOString().slice(0, 10)}.txt`
    a.click()
    URL.revokeObjectURL(url)
    setToast('Report exported.')
  }

  if (loading) return <div style={{ padding: '24px', color: 'var(--t-text-muted)', fontSize: 13 }}>Loading compliance status…</div>
  if (error) return <div style={{ padding: '24px', color: 'var(--t-danger)', fontSize: 13 }}>Could not load compliance status. {error}</div>

  return (
    <div style={{ padding: '20px 24px' }}>
      {toast && (
        <div style={{ position: 'fixed', top: 20, right: 20, background: 'var(--t-success)', color: '#fff', padding: '12px 20px', fontWeight: 700, zIndex: 9999, fontSize: 13, borderRadius: 0 }}>
          {toast}
        </div>
      )}

      {!canSave && (
        <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-warn)', padding: '10px 14px', marginBottom: 16, fontSize: 12, color: 'var(--t-text-muted)', borderRadius: 0 }}>
          No location assigned to your account — compliance status is read-only until a location is assigned.
        </div>
      )}

      {categories.map(cat => {
        const total = cat.items.length
        const compliant = cat.items.filter(it => state[it.id]?.checked).length
        const isOpen = !collapsed[cat.id]
        return (
          <div key={cat.id} style={{ marginBottom: 16, border: '1px solid var(--t-line)', borderRadius: 0 }}>
            <div
              onClick={() => setCollapsed(p => ({ ...p, [cat.id]: !p[cat.id] }))}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: 'var(--t-surface)', cursor: 'pointer', userSelect: 'none' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontWeight: 800, fontSize: 12, letterSpacing: '.06em', color: 'var(--t-text)' }}>{cat.name}</span>
                <span style={{
                  background: compliant === total ? 'var(--t-success)' : compliant >= total * 0.8 ? 'var(--t-warn)' : 'var(--t-danger)',
                  color: '#fff',
                  fontSize: 10,
                  fontWeight: 700,
                  padding: '2px 8px',
                  borderRadius: 0,
                  letterSpacing: '.04em',
                }}>
                  {compliant}/{total} COMPLIANT
                </span>
              </div>
              <span style={{ color: 'var(--t-text-muted)', fontSize: 12 }}>{isOpen ? '▲' : '▼'}</span>
            </div>

            {isOpen && (
              <div>
                {cat.items.map(item => {
                  const st = state[item.id] || {}
                  const isChecked = !!st.checked
                  const noteVal = drafts[item.id] !== undefined ? drafts[item.id] : (st.note ?? '')
                  return (
                    <div
                      key={item.id}
                      style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 12, padding: '10px 16px', borderTop: '1px solid var(--t-line)', alignItems: 'start' }}
                    >
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <input
                            type="checkbox"
                            checked={isChecked}
                            disabled={!canSave}
                            onChange={() => toggle(item)}
                            style={{ width: 15, height: 15, accentColor: 'var(--t-accent)', cursor: canSave ? 'pointer' : 'not-allowed', flexShrink: 0 }}
                          />
                          <span style={{ fontSize: 13, color: 'var(--t-text)', fontWeight: isChecked ? 400 : 600 }}>{item.label}</span>
                        </div>
                        <div style={{ paddingLeft: 25 }}>
                          <input
                            type="text"
                            placeholder="Add note (optional)"
                            value={noteVal}
                            disabled={!canSave}
                            onChange={e => setDrafts(d => ({ ...d, [item.id]: e.target.value }))}
                            onBlur={() => onNoteBlur(item)}
                            style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', color: 'var(--t-text)', fontSize: 11, padding: '4px 8px', width: '100%', maxWidth: 360, outline: 'none', borderRadius: 0 }}
                          />
                        </div>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, paddingTop: 2 }}>
                        <span style={{
                          background: isChecked ? 'var(--t-success)' : 'var(--t-warn)',
                          color: '#fff',
                          fontSize: 10,
                          fontWeight: 700,
                          padding: '2px 8px',
                          borderRadius: 0,
                          letterSpacing: '.04em',
                          whiteSpace: 'nowrap',
                        }}>
                          {isChecked ? 'Compliant ✓' : 'Needs Review'}
                        </span>
                        <span style={{ fontSize: 10, color: 'var(--t-text-faint)', whiteSpace: 'nowrap' }}>
                          {st.last_reviewed_at ? `Last reviewed ${fmtDate(st.last_reviewed_at)}` : 'Not yet reviewed'}
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}

      <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
        <button
          onClick={exportReport}
          style={{ background: 'var(--t-surface)', color: 'var(--t-text)', border: '1px solid var(--t-line)', padding: '10px 22px', fontWeight: 700, fontSize: 12, cursor: 'pointer', letterSpacing: '.06em', borderRadius: 0 }}
        >
          EXPORT REPORT
        </button>
      </div>
    </div>
  )
}

// ── Tab 2: Statutory reference — rows for the company's state (hr.compliance_rules) ───────

function LawCard({ title, effectiveDate, badgeColor, children, footer }) {
  return (
    <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', padding: 16, borderRadius: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <span style={{ fontWeight: 800, fontSize: 13, color: 'var(--t-text)', letterSpacing: '.04em' }}>{title}</span>
        {effectiveDate && (
          <span style={{ background: badgeColor || 'var(--t-accent)', color: '#fff', fontSize: 9, fontWeight: 700, padding: '2px 8px', letterSpacing: '.06em', borderRadius: 0 }}>
            {effectiveDate}
          </span>
        )}
      </div>
      <div style={{ fontSize: 12, color: 'var(--t-text-muted)', lineHeight: 1.6 }}>
        {children}
      </div>
      {footer && (
        <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px solid var(--t-line)', fontSize: 11, color: 'var(--t-text-faint)' }}>
          {footer}
        </div>
      )}
    </div>
  )
}

function Row({ label, value }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
      <span style={{ color: 'var(--t-text-muted)' }}>{label}</span>
      <span style={{ color: 'var(--t-text)', fontWeight: 600 }}>{value}</span>
    </div>
  )
}

function LawReferenceTab({ config, reference }) {
  // STATUTORY REFERENCE IS ROWS (Bible §12g, 14 Sep 2026): hr.compliance_rules for the
  // company's own state, read by hr.compliance_reference(). The clone printed Connecticut
  // statutes here; nothing is typed in now and no law text is invented — HR / counsel enter
  // the rows and they render as cards.
  const rules = reference?.rules || []
  const state = reference?.state_code || '—'
  const byDomain = rules.reduce((m, r) => { (m[r.domain || 'General'] ||= []).push(r); return m }, {})
  const label = (k) => String(k || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
  const fmtVal = (v) => v == null ? '—' : typeof v === 'object' ? Object.entries(v).map(([a, b]) => `${label(a)}: ${b}`).join(' · ') : String(v)
  return (
    <div style={{ padding: '20px 24px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
      <LawCard title="PLATFORM CONFIGURATION" effectiveDate={`${state} · from Settings`}>
        <Row label="Minimum wage used by the checklist" value={config?.min_wage != null ? `$${config.min_wage}/hr` : '—'} />
        <Row label="Paid leave accrual cap" value={config?.paid_leave_accrual_hours != null ? `${config.paid_leave_accrual_hours} hours` : '—'} />
        <Row label="Federal FMLA threshold" value={config?.fmla_threshold_hours != null ? `${config.fmla_threshold_hours} hours` : '—'} />
        <div style={{ marginTop: 8, fontSize: 11, color: 'var(--t-text-faint)' }}>These are the figures the checklist uses; change them in Settings.</div>
      </LawCard>
      {reference === null && <LawCard title="STATUTORY REFERENCE" effectiveDate="reading…"><div style={{ fontSize: 12, color: 'var(--t-text-faint)' }}>Reading the reference rows…</div></LawCard>}
      {reference !== null && rules.length === 0 && (
        <LawCard title={`${state} STATUTORY REFERENCE`} effectiveDate="no rows yet">
          <div style={{ fontSize: 12, color: 'var(--t-text)', lineHeight: 1.6 }}>
            No statutory reference rows are entered for {state} yet. HR or counsel enter each rule (domain, key, value, citation, effective date) in hr.compliance_rules and it appears here as a card. Nothing on this page is written by the platform.
          </div>
        </LawCard>
      )}
      {Object.entries(byDomain).map(([domain, rs]) => (
        <LawCard key={domain} title={label(domain).toUpperCase()} effectiveDate={`${state} · ${rs.length} rule${rs.length === 1 ? '' : 's'}`}>
          {rs.map(r => (
            <div key={r.id} style={{ marginBottom: 8 }}>
              <Row label={label(r.rule_key)} value={fmtVal(r.rule_value)} />
              <div style={{ fontSize: 10, color: 'var(--t-text-faint)' }}>{r.citation || 'no citation'}{r.effective_from ? ` · effective ${r.effective_from}` : ''}</div>
            </div>
          ))}
        </LawCard>
      ))}
    </div>
  )
}

// ── Tab 3: Upcoming Deadlines (real CRUD via RPC) ────────────────────────────

const emptyDeadline = { id: null, requirement: '', due_date: '', status: 'Pending', responsible: '', notes: '' }

function DeadlinesTab({ deadlines, nodeId, personId, loading, error, onReload }) {
  const [form, setForm] = useState(emptyDeadline)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState('')

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(''), 3000)
    return () => clearTimeout(t)
  }, [toast])

  function startAdd() { setForm(emptyDeadline); setShowForm(true) }
  function startEdit(row) {
    setForm({
      id: row.id,
      requirement: row.requirement || '',
      due_date: row.due_date || '',
      status: row.status || 'Pending',
      responsible: row.responsible || '',
      notes: row.notes || '',
    })
    setShowForm(true)
  }

  async function save() {
    if (!form.requirement.trim()) { setToast('Requirement is required.'); return }
    setSaving(true)
    const { data, error: err } = await sb.rpc('compliance_deadline_save', {
      p_id: form.id,
      p_node_id: nodeId,
      p_requirement: form.requirement.trim(),
      p_due_date: form.due_date || null,
      p_status: form.status,
      p_responsible: form.responsible || null,
      p_notes: form.notes || null,
      p_created_by: personId,
    })
    setSaving(false)
    if (err || (data && data.ok === false)) { setToast('Not saved — please try again.'); return }
    setShowForm(false)
    setForm(emptyDeadline)
    await onReload()
    setToast('Deadline saved.')
  }

  async function remove(row) {
    if (!window.confirm(`Delete "${row.requirement}"?`)) return
    const { data, error: err } = await sb.rpc('compliance_deadline_delete', { p_id: row.id })
    if (err || (data && data.ok === false)) { setToast('Not deleted — please try again.'); return }
    await onReload()
    setToast('Deadline deleted.')
  }

  const inputStyle = { background: 'var(--t-bg)', border: '1px solid var(--t-line)', color: 'var(--t-text)', fontSize: 12, padding: '7px 10px', outline: 'none', borderRadius: 0, width: '100%' }
  const labelStyle = { fontSize: 10, fontWeight: 700, letterSpacing: '.06em', color: 'var(--t-text-muted)', textTransform: 'uppercase', marginBottom: 4, display: 'block' }

  return (
    <div style={{ padding: '20px 24px' }}>
      {toast && (
        <div style={{ position: 'fixed', top: 20, right: 20, background: 'var(--t-success)', color: '#fff', padding: '12px 20px', fontWeight: 700, zIndex: 9999, fontSize: 13, borderRadius: 0 }}>
          {toast}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <SL>Upcoming Compliance Deadlines</SL>
        <button
          onClick={startAdd}
          style={{ background: 'var(--t-accent)', color: '#fff', border: 'none', padding: '8px 18px', fontWeight: 700, fontSize: 11, cursor: 'pointer', letterSpacing: '.06em', borderRadius: 0 }}
        >
          + ADD DEADLINE
        </button>
      </div>

      {showForm && (
        <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', padding: 16, marginBottom: 16, borderRadius: 0 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div>
              <label style={labelStyle}>Requirement *</label>
              <input style={inputStyle} value={form.requirement} onChange={e => setForm(f => ({ ...f, requirement: e.target.value }))} />
            </div>
            <div>
              <label style={labelStyle}>Due Date</label>
              <input type="date" style={inputStyle} value={form.due_date || ''} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))} />
            </div>
            <div>
              <label style={labelStyle}>Status</label>
              <select style={inputStyle} value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
                {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 12, marginBottom: 12 }}>
            <div>
              <label style={labelStyle}>Responsible</label>
              <input style={inputStyle} value={form.responsible} onChange={e => setForm(f => ({ ...f, responsible: e.target.value }))} />
            </div>
            <div>
              <label style={labelStyle}>Notes</label>
              <input style={inputStyle} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={save} disabled={saving} style={{ background: 'var(--t-accent)', color: '#fff', border: 'none', padding: '8px 20px', fontWeight: 700, fontSize: 11, cursor: saving ? 'default' : 'pointer', letterSpacing: '.06em', borderRadius: 0, opacity: saving ? 0.6 : 1 }}>
              {saving ? 'SAVING…' : (form.id ? 'UPDATE' : 'SAVE')}
            </button>
            <button onClick={() => { setShowForm(false); setForm(emptyDeadline) }} style={{ background: 'var(--t-surface)', color: 'var(--t-text)', border: '1px solid var(--t-line)', padding: '8px 20px', fontWeight: 700, fontSize: 11, cursor: 'pointer', letterSpacing: '.06em', borderRadius: 0 }}>
              CANCEL
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div style={{ padding: '20px 0', color: 'var(--t-text-muted)', fontSize: 13 }}>Loading deadlines…</div>
      ) : error ? (
        <div style={{ padding: '20px 0', color: 'var(--t-danger)', fontSize: 13 }}>Could not load deadlines. {error}</div>
      ) : deadlines.length === 0 ? (
        <div style={{ padding: '32px 0', textAlign: 'center', color: 'var(--t-text-faint)', fontSize: 13 }}>
          No compliance deadlines yet. Use “+ Add Deadline” to create one.
        </div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ background: 'var(--t-surface-2, #0d1420)' }}>
              {['REQUIREMENT', 'DUE DATE', 'STATUS', 'RESPONSIBLE', 'NOTES', ''].map((h, i) => (
                <th key={i} style={{ padding: '8px 12px', fontWeight: 700, fontSize: 10, letterSpacing: '.06em', color: 'var(--t-text-muted)', textAlign: 'left', borderRadius: 0 }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {deadlines.map((row) => (
              <tr key={row.id} style={{ borderBottom: '1px solid var(--t-line)' }}>
                <td style={{ padding: '8px 12px', color: 'var(--t-text)', fontWeight: 600 }}>{row.requirement}</td>
                <td style={{ padding: '8px 12px', color: 'var(--t-text)', whiteSpace: 'nowrap' }}>{fmtDate(row.due_date)}</td>
                <td style={{ padding: '8px 12px' }}>
                  <span style={{
                    background: statusColor(row.status),
                    color: '#fff',
                    fontSize: 10,
                    fontWeight: 700,
                    padding: '2px 8px',
                    letterSpacing: '.04em',
                    borderRadius: 0,
                    whiteSpace: 'nowrap',
                  }}>
                    {row.status}
                  </span>
                </td>
                <td style={{ padding: '8px 12px', color: 'var(--t-text-muted)' }}>{row.responsible || '—'}</td>
                <td style={{ padding: '8px 12px', color: 'var(--t-text-faint)', fontStyle: 'italic' }}>{row.notes || '—'}</td>
                <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>
                  <button onClick={() => startEdit(row)} style={{ background: 'none', border: '1px solid var(--t-line)', color: 'var(--t-accent)', padding: '3px 10px', fontSize: 10, fontWeight: 700, cursor: 'pointer', borderRadius: 0, marginRight: 6 }}>EDIT</button>
                  <button onClick={() => remove(row)} style={{ background: 'none', border: '1px solid var(--t-line)', color: 'var(--t-danger)', padding: '3px 10px', fontSize: 10, fontWeight: 700, cursor: 'pointer', borderRadius: 0 }}>DELETE</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

// ── Main export ──────────────────────────────────────────────────────────────

export default function CTCompliance() {
  const enabled = useFeatureFlag('ct_compliance')
  const config = useConfig()

  const me = getSession()
  const personId = me?.id || null
  const roleName = (me?.role_name || '').toLowerCase()
  const isMgr = ['ceo', 'manager', 'coo', 'admin', 'owner', 'hr'].some(r => roleName.includes(r))

  const locationNodes = (me?.nodes || []).filter(n => n.node_type === 'location')
  const nodeIds = useMemo(() => locationNodes.map(n => n.id), [me])
  const myNodeId = locationNodes[0]?.id || null

  const categories = useMemo(() => buildCategories(config), [config])

  const [tab, setTab] = useState(0)
  const [checkState, setCheckState] = useState({})   // item_key -> { checked, note, last_reviewed_at }
  const [deadlines, setDeadlines] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const reload = useCallback(async () => {
    if (!nodeIds.length) { setCheckState({}); setDeadlines([]); setLoading(false); setError(''); return }
    setLoading(true)
    try {
      const [chk, dl] = await Promise.all([
        sb.rpc('compliance_checklist_get', { p_node_ids: nodeIds }),
        sb.rpc('compliance_deadlines_list', { p_node_ids: nodeIds }),
      ])
      if (chk.error) throw chk.error
      if (dl.error) throw dl.error
      const map = {}
      ;(chk.data || []).forEach(r => { map[r.item_key] = { checked: !!r.checked, note: r.note || '', last_reviewed_at: r.last_reviewed_at } })
      setCheckState(map)
      setDeadlines(dl.data || [])
      setError('')
    } catch (e) {
      setError(e?.message || 'Unknown error')
      setCheckState({})
      setDeadlines([])
    } finally {
      setLoading(false)
    }
  }, [nodeIds])

  useEffect(() => { if (enabled && isMgr) reload() }, [enabled, isMgr, reload])

  if (!enabled) return null

  if (!isMgr) {
    return (
      <div style={{ padding: 32 }}>
        <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', padding: 24, borderRadius: 0, maxWidth: 420 }}>
          <SL>Access Restricted</SL>
          <div style={{ fontSize: 13, color: 'var(--t-text-muted)' }}>Access restricted to managers. Contact your HR manager or COO for compliance information.</div>
        </div>
      </div>
    )
  }

  // ── KPI figures derived from real loaded data (no hardcoded numbers) ────────
  const totalItems = categories.reduce((n, c) => n + c.items.length, 0)
  const compliantCount = categories.reduce((n, c) => n + c.items.filter(it => checkState[it.id]?.checked).length, 0)
  const openIssues = totalItems - compliantCount
  const dueSoon = deadlines.filter(d => d.status === 'Due Soon').length
  const compliancePct = totalItems ? Math.round((compliantCount / totalItems) * 100) : 0
  const lastAuditIso = Object.values(checkState).reduce((max, s) => {
    if (!s.last_reviewed_at) return max
    return (!max || new Date(s.last_reviewed_at) > new Date(max)) ? s.last_reviewed_at : max
  }, null)

  const [reference, setReference] = useState(null)
  useEffect(() => {
    let live = true
    sb.rpc('compliance_reference').then(({ data, error }) => { if (live) setReference(error ? { state_code: null, rules: [], error: error.message } : (data || { rules: [] })) })
    return () => { live = false }
  }, [])
  const TABS = ['COMPLIANCE CHECKLIST', `${reference?.state_code || 'STATE'} LAW REFERENCE`, 'UPCOMING DEADLINES']

  return (
    <div style={{ minHeight: '100dvh', background: 'var(--t-bg)', color: 'var(--t-text)', fontFamily: 'inherit' }}>
      {/* Page header */}
      <div style={{ background: 'linear-gradient(135deg, #0a1628, #0d1f3c)', borderBottom: '1px solid var(--t-line)', padding: 24 }}>
        <div style={{ fontSize: 22, fontWeight: 900, color: 'var(--t-text)', letterSpacing: '-.01em', marginBottom: 4 }}>
          {reference?.state_code || 'STATE'} LABOR COMPLIANCE
        </div>
        <div style={{ fontSize: 12, color: 'var(--t-text-muted)' }}>
          {reference?.company || companyName()} compliance tracker · state {reference?.state_code || '—'} from the company record
        </div>
      </div>

      {/* KPI row */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        padding: '20px 24px',
        background: '#080d18',
        borderBottom: '1px solid var(--t-line)',
        gap: 12,
      }}>
        <KTile label="Overall Compliance Score" value={loading ? '…' : `${compliancePct}%`} color={compliancePct >= 90 ? 'var(--t-success)' : compliancePct >= 70 ? 'var(--t-warn)' : 'var(--t-danger)'} />
        <KTile label="Open Issues" value={loading ? '…' : String(openIssues)} color="var(--t-warn)" alert={openIssues > 0 ? 'amber' : undefined} />
        <KTile label="Deadlines Due Soon" value={loading ? '…' : String(dueSoon)} color="var(--t-accent)" />
        <KTile label="Last Reviewed" value={loading ? '…' : fmtDate(lastAuditIso)} color="var(--t-text)" />
      </div>

      {/* Tabs bar */}
      <div style={{ padding: '0 24px', borderBottom: '1px solid var(--t-line)', display: 'flex', gap: 0 }}>
        {TABS.map((t, i) => (
          <button
            key={t}
            onClick={() => setTab(i)}
            style={{
              background: 'none',
              border: 'none',
              borderBottom: tab === i ? '2px solid var(--t-accent)' : '2px solid transparent',
              color: tab === i ? 'var(--t-accent)' : 'var(--t-text-muted)',
              fontWeight: tab === i ? 700 : 400,
              fontSize: 11,
              letterSpacing: '.08em',
              padding: '12px 16px',
              cursor: 'pointer',
              outline: 'none',
              marginBottom: -1,
              borderRadius: 0,
              transition: 'color .15s, border-color .15s',
            }}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 0 && (
        <ChecklistTab
          config={config}
          categories={categories}
          state={checkState}
          nodeId={myNodeId}
          personId={personId}
          loading={loading}
          error={error}
          onReload={reload}
        />
      )}
      {tab === 1 && <LawReferenceTab config={config} reference={reference} />}
      {tab === 2 && (
        <DeadlinesTab
          deadlines={deadlines}
          nodeId={myNodeId}
          personId={personId}
          loading={loading}
          error={error}
          onReload={reload}
        />
      )}
    </div>
  )
}
