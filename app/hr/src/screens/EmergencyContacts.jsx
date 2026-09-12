import { useState, useEffect, useCallback } from 'react'
import { useFeatureFlag } from '../lib/featureFlags.js'
import { sb, getSession } from '../lib/supabase'

function SL({ children }) {
  return (
    <div style={{
      fontSize: 11,
      fontWeight: 700,
      letterSpacing: '.1em',
      color: 'var(--t-accent)',
      textTransform: 'uppercase',
      marginBottom: 10,
    }}>
      {children}
    </div>
  )
}

const RELATIONSHIP_OPTIONS = ['Spouse', 'Parent', 'Sibling', 'Friend', 'Other']
const PRIORITY_OPTIONS = ['1st Contact', '2nd Contact', '3rd Contact']

const emptyForm = {
  contactName: '',
  relationship: 'Spouse',
  phonePrimary: '',
  phoneAlternate: '',
  address: '',
  priority: '1st Contact',
}

// Map a DB emergency_contacts row -> form-shaped object used by the UI.
function fromRow(r) {
  return {
    id: r.id,
    contactName: r.contact_name || '',
    relationship: r.relationship || 'Other',
    phonePrimary: r.phone_primary || '',
    phoneAlternate: r.phone_alternate || '',
    address: r.address || '',
    priority: r.priority || '1st Contact',
  }
}

function fmtDate(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d)) return ''
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function EmergencyContacts() {
  const enabled = useFeatureFlag('emergency_contacts')
  if (!enabled) return null

  const me = getSession()
  const personId = me?.id || null
  const role = me?.role_name || ''
  const roleName = role.toLowerCase()
  const isMgr = ['ceo', 'manager', 'coo', 'admin', 'owner', 'hr'].some(r => roleName.includes(r))

  const locationNodes = (me?.nodes || []).filter(n => n.node_type === 'location')
  const nodeIds = locationNodes.map(n => n.id)
  const myNodeId = locationNodes[0]?.id || null
  const nodeName = (id) => locationNodes.find(n => n.id === id)?.name || '—'

  // ── Self-service state ────────────────────────────────────────────────────
  const [myContacts, setMyContacts] = useState([])
  const [myLoading, setMyLoading] = useState(true)
  const [myError, setMyError] = useState('')
  const [showAddForm, setShowAddForm] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [editingId, setEditingId] = useState(null)
  const [saving, setSaving] = useState(false)

  // ── Manager roster state ──────────────────────────────────────────────────
  const [roster, setRoster] = useState([])
  const [rosterLoading, setRosterLoading] = useState(true)
  const [rosterError, setRosterError] = useState('')

  const [locationFilter, setLocationFilter] = useState('All')
  const [statusFilter, setStatusFilter] = useState('All')
  const [hoveredRow, setHoveredRow] = useState(null)

  const [toastMsg, setToastMsg] = useState('')

  function showToast(msg) {
    setToastMsg(msg)
    setTimeout(() => setToastMsg(''), 3000)
  }

  // ── Loaders (real backend) ────────────────────────────────────────────────
  const loadMyContacts = useCallback(async () => {
    if (!personId) { setMyContacts([]); setMyLoading(false); return }
    setMyLoading(true); setMyError('')
    try {
      const { data, error } = await sb.rpc('get_my_emergency_contacts', { p_person_id: personId })
      if (error) throw error
      const rows = Array.isArray(data) ? data : (data ? [data] : [])
      setMyContacts(rows.map(fromRow))
    } catch (e) {
      setMyError('Could not load your emergency contacts.')
      setMyContacts([])
    } finally {
      setMyLoading(false)
    }
  }, [personId])

  const loadRoster = useCallback(async () => {
    if (!isMgr) { setRosterLoading(false); return }
    setRosterLoading(true); setRosterError('')
    try {
      const { data, error } = await sb.rpc('get_emergency_contact_roster', {
        p_node_ids: nodeIds.length ? nodeIds : null,
      })
      if (error) throw error
      setRoster(Array.isArray(data) ? data : [])
    } catch (e) {
      setRosterError('Could not load the employee contact roster.')
      setRoster([])
    } finally {
      setRosterLoading(false)
    }
  }, [isMgr, JSON.stringify(nodeIds)])

  useEffect(() => { loadMyContacts() }, [loadMyContacts])
  useEffect(() => { loadRoster() }, [loadRoster])

  // ── Form handlers ─────────────────────────────────────────────────────────
  function handleFormChange(field, value) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  async function persistContact(id) {
    if (!form.contactName.trim() || !form.phonePrimary.trim()) {
      showToast('Contact name and primary phone are required.')
      return
    }
    if (!personId) { showToast('No signed-in employee.'); return }
    setSaving(true)
    try {
      const { data, error } = await sb.rpc('save_emergency_contact', {
        p_id: id,
        p_person_id: personId,
        p_node_id: myNodeId,
        p_contact_name: form.contactName.trim(),
        p_relationship: form.relationship,
        p_phone_primary: form.phonePrimary.trim(),
        p_phone_alternate: form.phoneAlternate.trim() || null,
        p_address: form.address.trim() || null,
        p_priority: form.priority,
      })
      if (error) throw error
      if (data && data.ok === false) { showToast(data.error || 'Could not save contact.'); return }
      setForm(emptyForm)
      setShowAddForm(false)
      setEditingId(null)
      await loadMyContacts()
      showToast(id ? 'Contact updated.' : 'Emergency contact saved.')
    } catch (e) {
      showToast('Could not save contact.')
    } finally {
      setSaving(false)
    }
  }

  function handleAddContact() { persistContact(null) }
  function handleEditContact() { persistContact(editingId) }

  async function handleDeleteContact(id) {
    if (!window.confirm('Delete this emergency contact?')) return
    try {
      const { data, error } = await sb.rpc('delete_emergency_contact', {
        p_id: id, p_person_id: personId,
      })
      if (error) throw error
      if (data && data.ok === false) { showToast('Could not delete contact.'); return }
      await loadMyContacts()
      showToast('Contact deleted.')
    } catch (e) {
      showToast('Could not delete contact.')
    }
  }

  function openEdit(contact) {
    setEditingId(contact.id)
    setForm({
      contactName: contact.contactName,
      relationship: contact.relationship,
      phonePrimary: contact.phonePrimary,
      phoneAlternate: contact.phoneAlternate || '',
      address: contact.address || '',
      priority: contact.priority,
    })
    setShowAddForm(false)
  }

  function cancelForm() {
    setShowAddForm(false)
    setEditingId(null)
    setForm(emptyForm)
  }

  // ── Manager view derived data (from real roster) ──────────────────────────
  const rosterRows = roster.map(r => ({
    ...r,
    location: nodeName(r.node_id),
    lastUpdatedLabel: fmtDate(r.last_updated),
  }))

  const filteredEmployees = rosterRows.filter(emp => {
    if (locationFilter !== 'All' && emp.location !== locationFilter) return false
    if (statusFilter !== 'All' && emp.status !== statusFilter.toUpperCase()) return false
    return true
  })

  const missingEmployees = rosterRows.filter(e => e.status === 'MISSING')

  function handleExportCSV() {
    const headers = ['Employee', 'Location', 'Contact 1 Name', 'Contact 1 Phone', 'Contact 1 Relationship', 'Last Updated', 'Status']
    const rows = rosterRows.map(e => [
      e.name, e.location, e.contact_name || '', e.phone || '', e.relationship || '', e.lastUpdatedLabel, e.status,
    ])
    const csv = [headers, ...rows].map(r => r.map(v => `"${String(v ?? '')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'emergency_contacts.csv'
    a.click()
    URL.revokeObjectURL(url)
    showToast('CSV exported.')
  }

  async function handleSendReminder() {
    try {
      const ids = missingEmployees.map(e => e.person_id).filter(Boolean)
      const { data, error } = await sb.rpc('send_emergency_contact_reminders', {
        p_node_ids: nodeIds.length ? nodeIds : null,
        p_person_ids: ids,
      })
      if (error) throw error
      const n = (data && data.count != null) ? data.count : ids.length
      showToast(`Reminder sent to ${n} employees to update emergency contacts.`)
    } catch (e) {
      showToast('Could not send reminders.')
    }
  }

  const priorityColor = (p) => {
    if (p === '1st Contact') return 'var(--t-danger, #e53935)'
    if (p === '2nd Contact') return 'var(--t-warning, #f59e0b)'
    return 'var(--t-text-muted, #6b7280)'
  }

  const statusColor = (s) => {
    if (s === 'ON FILE') return 'var(--t-success, #22c55e)'
    if (s === 'MISSING') return 'var(--t-danger, #e53935)'
    return 'var(--t-warning, #f59e0b)'
  }

  const contactForm = (onSave, onCancel, isEdit) => (
    <div style={{
      background: 'var(--t-surface-2, #0d1420)',
      border: '1px solid var(--t-line, #1e2a3a)',
      padding: 20,
      marginTop: 12,
      borderRadius: 0,
    }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--t-accent, #38bdf8)', letterSpacing: '.08em', marginBottom: 14 }}>
        {isEdit ? 'EDIT CONTACT' : 'ADD EMERGENCY CONTACT'}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={labelStyle}>Contact Name *</label>
          <input
            type="text"
            value={form.contactName}
            onChange={e => handleFormChange('contactName', e.target.value)}
            placeholder="Full name"
            style={inputStyle}
          />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={labelStyle}>Relationship</label>
          <select value={form.relationship} onChange={e => handleFormChange('relationship', e.target.value)} style={inputStyle}>
            {RELATIONSHIP_OPTIONS.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={labelStyle}>Phone Primary *</label>
          <input
            type="tel"
            value={form.phonePrimary}
            onChange={e => handleFormChange('phonePrimary', e.target.value)}
            placeholder="(860) 000-0000"
            style={inputStyle}
          />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={labelStyle}>Phone Alternate</label>
          <input
            type="tel"
            value={form.phoneAlternate}
            onChange={e => handleFormChange('phoneAlternate', e.target.value)}
            placeholder="Optional"
            style={inputStyle}
          />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, gridColumn: '1 / -1' }}>
          <label style={labelStyle}>Address</label>
          <input
            type="text"
            value={form.address}
            onChange={e => handleFormChange('address', e.target.value)}
            placeholder="Optional"
            style={inputStyle}
          />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={labelStyle}>Priority</label>
          <select value={form.priority} onChange={e => handleFormChange('priority', e.target.value)} style={inputStyle}>
            {PRIORITY_OPTIONS.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
        <button onClick={onSave} disabled={saving} style={{ ...btnPrimary, opacity: saving ? 0.6 : 1 }}>
          {saving ? 'Saving…' : 'Save Contact'}
        </button>
        <button onClick={onCancel} style={btnSecondary}>Cancel</button>
      </div>
    </div>
  )

  return (
    <div style={{ background: 'var(--t-bg, #060d18)', minHeight: '100vh', color: 'var(--t-text, #e2e8f0)', fontFamily: 'inherit' }}>

      {/* Page Header */}
      <div style={{
        background: 'linear-gradient(135deg,#0a1628,#0d1f3c)',
        borderBottom: '1px solid var(--t-line, #1e2a3a)',
        padding: 24,
        borderRadius: 0,
      }}>
        <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: '.04em', color: 'var(--t-text, #e2e8f0)' }}>
          EMERGENCY CONTACTS
        </div>
        <div style={{ fontSize: 13, color: 'var(--t-text-muted, #6b7280)', marginTop: 4 }}>
          {isMgr ? 'All employee emergency contacts — manager view' : 'Your personal emergency contacts'}
        </div>
      </div>

      <div style={{ padding: 24, maxWidth: 1200 }}>

        {/* ── SELF-SERVICE SECTION ────────────────────── */}
        <div style={{ marginBottom: 40 }}>
          <SL>My Emergency Contacts</SL>

          {myError && (
            <div style={errorBox}>{myError}</div>
          )}

          {myLoading ? (
            <div style={mutedBox}>Loading your emergency contacts…</div>
          ) : (
            <>
              {myContacts.length === 0 && !showAddForm && (
                <div style={{
                  borderLeft: '3px solid var(--t-warning, #f59e0b)',
                  background: 'var(--t-surface, #0b1220)',
                  padding: '14px 18px',
                  marginBottom: 16,
                  borderRadius: 0,
                  fontSize: 13,
                  color: 'var(--t-warning, #f59e0b)',
                  fontWeight: 600,
                }}>
                  No emergency contacts on file. Please add at least one contact for emergency situations.
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>
                {myContacts.map((contact) => (
                  <div key={contact.id}>
                    <div style={{
                      background: 'var(--t-surface, #0b1220)',
                      border: '1px solid var(--t-line, #1e2a3a)',
                      padding: 16,
                      borderRadius: 0,
                    }}>
                      {/* Header row */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <span style={{ fontWeight: 800, fontSize: 15, color: 'var(--t-text, #e2e8f0)' }}>{contact.contactName}</span>
                          <span style={badgeStyle('var(--t-accent, #38bdf8)')}>{contact.relationship}</span>
                          <span style={badgeStyle(priorityColor(contact.priority))}>{contact.priority}</span>
                        </div>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button onClick={() => openEdit(contact)} style={btnSmall}>Edit</button>
                          <button onClick={() => handleDeleteContact(contact.id)} style={{ ...btnSmall, color: 'var(--t-danger, #e53935)', borderColor: 'var(--t-danger, #e53935)' }}>Delete</button>
                        </div>
                      </div>

                      {/* Data rows */}
                      <div style={dataRow}>
                        <span style={dataLabel}>Phone (Primary)</span>
                        <span style={dataVal}>{contact.phonePrimary}</span>
                      </div>
                      {contact.phoneAlternate && (
                        <div style={dataRow}>
                          <span style={dataLabel}>Phone (Alternate)</span>
                          <span style={dataVal}>{contact.phoneAlternate}</span>
                        </div>
                      )}
                      {contact.address && (
                        <div style={dataRow}>
                          <span style={dataLabel}>Address</span>
                          <span style={dataVal}>{contact.address}</span>
                        </div>
                      )}
                    </div>

                    {editingId === contact.id && contactForm(handleEditContact, cancelForm, true)}
                  </div>
                ))}
              </div>

              {myContacts.length < 3 && !showAddForm && editingId === null && (
                <button onClick={() => setShowAddForm(true)} style={btnPrimary}>
                  + Add Contact
                </button>
              )}

              {showAddForm && contactForm(handleAddContact, cancelForm, false)}
            </>
          )}
        </div>

        {/* ── MANAGER VIEW ────────────────────────────── */}
        {isMgr && (
          <div>
            <SL>All Employee Contacts — Manager View</SL>

            {rosterError && <div style={errorBox}>{rosterError}</div>}

            {rosterLoading ? (
              <div style={mutedBox}>Loading employee contact roster…</div>
            ) : (
              <>
                {/* Missing contacts alert */}
                {missingEmployees.length > 0 && (
                  <div style={{
                    borderLeft: '3px solid var(--t-danger, #e53935)',
                    background: 'var(--t-surface, #0b1220)',
                    padding: 16,
                    marginBottom: 20,
                    borderRadius: 0,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}>
                    <div>
                      <div style={{ fontWeight: 700, color: 'var(--t-danger, #e53935)', fontSize: 14 }}>
                        ⚠ {missingEmployees.length} employees have no emergency contact on file
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--t-text-muted, #6b7280)', marginTop: 4 }}>
                        {missingEmployees.map(e => e.name).join(', ')}
                      </div>
                    </div>
                    <button onClick={handleSendReminder} style={btnPrimary}>Send Reminder</button>
                  </div>
                )}

                {/* Filter bar */}
                <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <label style={labelStyle}>Location</label>
                    <select value={locationFilter} onChange={e => setLocationFilter(e.target.value)} style={{ ...inputStyle, minWidth: 140 }}>
                      <option value="All">All</option>
                      {locationNodes.map(l => <option key={l.id} value={l.name}>{l.name}</option>)}
                    </select>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <label style={labelStyle}>Status</label>
                    <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ ...inputStyle, minWidth: 140 }}>
                      <option value="All">All</option>
                      <option value="On File">On File</option>
                      <option value="Missing">Missing</option>
                      <option value="Outdated">Outdated</option>
                    </select>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, justifyContent: 'flex-end' }}>
                    <label style={{ ...labelStyle, visibility: 'hidden' }}>_</label>
                    <button onClick={handleExportCSV} style={btnSecondary}>Export CSV</button>
                  </div>
                </div>

                {/* Table */}
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr style={{ background: 'var(--t-surface-2, #0d1420)' }}>
                        {['Employee', 'Location', 'Contact 1 Name', 'Contact 1 Phone', 'Contact 1 Relationship', 'Last Updated', 'Status'].map(col => (
                          <th key={col} style={{
                            padding: '8px 12px',
                            fontWeight: 700,
                            fontSize: 10,
                            textTransform: 'uppercase',
                            letterSpacing: '.06em',
                            color: 'var(--t-text-muted, #6b7280)',
                            textAlign: 'left',
                            whiteSpace: 'nowrap',
                            borderBottom: '1px solid var(--t-line, #1e2a3a)',
                          }}>
                            {col}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredEmployees.map((emp, i) => (
                        <tr
                          key={emp.person_id || emp.name || i}
                          onMouseEnter={() => setHoveredRow(i)}
                          onMouseLeave={() => setHoveredRow(null)}
                          style={{
                            borderBottom: '1px solid var(--t-line, #1e2a3a)',
                            background: hoveredRow === i ? 'var(--t-surface-2, #0d1420)' : 'transparent',
                            transition: 'background 0.15s',
                          }}
                        >
                          <td style={tdStyle}>{emp.name}</td>
                          <td style={tdStyle}>{emp.location}</td>
                          <td style={tdStyle}>{emp.contact_name || '—'}</td>
                          <td style={tdStyle}>{emp.phone || '—'}</td>
                          <td style={tdStyle}>{emp.relationship || '—'}</td>
                          <td style={tdStyle}>{emp.lastUpdatedLabel || '—'}</td>
                          <td style={tdStyle}>
                            <span style={badgeStyle(statusColor(emp.status))}>{emp.status}</span>
                          </td>
                        </tr>
                      ))}
                      {filteredEmployees.length === 0 && (
                        <tr>
                          <td colSpan={7} style={{ padding: '24px 12px', textAlign: 'center', color: 'var(--t-text-muted, #6b7280)', fontSize: 13 }}>
                            {rosterRows.length === 0 ? 'No employee records yet.' : 'No employees match the selected filters.'}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Toast */}
      {toastMsg && (
        <div style={{
          position: 'fixed',
          top: 20,
          right: 20,
          background: 'var(--t-success, #22c55e)',
          color: '#000',
          padding: '12px 20px',
          fontWeight: 700,
          zIndex: 9999,
          fontSize: 13,
          borderRadius: 0,
          boxShadow: '0 4px 24px rgba(0,0,0,0.4)',
        }}>
          {toastMsg}
        </div>
      )}
    </div>
  )
}

// ── Shared style objects ──────────────────────────────────

const labelStyle = {
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: '.06em',
  textTransform: 'uppercase',
  color: 'var(--t-text-muted, #6b7280)',
}

const inputStyle = {
  background: 'var(--t-surface-2, #0d1420)',
  border: '1px solid var(--t-line, #1e2a3a)',
  color: 'var(--t-text, #e2e8f0)',
  padding: '7px 10px',
  fontSize: 13,
  borderRadius: 0,
  outline: 'none',
  width: '100%',
  boxSizing: 'border-box',
}

const btnPrimary = {
  background: 'var(--t-accent, #38bdf8)',
  color: '#000',
  border: 'none',
  padding: '8px 18px',
  fontSize: 12,
  fontWeight: 700,
  cursor: 'pointer',
  borderRadius: 0,
  letterSpacing: '.04em',
}

const btnSecondary = {
  background: 'transparent',
  color: 'var(--t-text-muted, #6b7280)',
  border: '1px solid var(--t-line, #1e2a3a)',
  padding: '8px 18px',
  fontSize: 12,
  fontWeight: 700,
  cursor: 'pointer',
  borderRadius: 0,
  letterSpacing: '.04em',
}

const btnSmall = {
  background: 'transparent',
  color: 'var(--t-text-muted, #6b7280)',
  border: '1px solid var(--t-line, #1e2a3a)',
  padding: '4px 10px',
  fontSize: 11,
  fontWeight: 700,
  cursor: 'pointer',
  borderRadius: 0,
}

const badgeStyle = (color) => ({
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: '.06em',
  padding: '2px 7px',
  border: `1px solid ${color}`,
  color,
  textTransform: 'uppercase',
  borderRadius: 0,
  whiteSpace: 'nowrap',
})

const dataRow = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '4px 0',
  borderBottom: '1px solid var(--t-line, #1e2a3a)',
}

const dataLabel = {
  fontSize: 11,
  color: 'var(--t-text-muted, #6b7280)',
  fontWeight: 600,
}

const dataVal = {
  fontSize: 12,
  color: 'var(--t-text, #e2e8f0)',
  fontWeight: 500,
}

const tdStyle = {
  padding: '8px 12px',
  color: 'var(--t-text, #e2e8f0)',
  fontSize: 12,
  whiteSpace: 'nowrap',
}

const mutedBox = {
  background: 'var(--t-surface, #0b1220)',
  border: '1px solid var(--t-line, #1e2a3a)',
  padding: '14px 18px',
  borderRadius: 0,
  fontSize: 13,
  color: 'var(--t-text-muted, #6b7280)',
  marginBottom: 16,
}

const errorBox = {
  borderLeft: '3px solid var(--t-danger, #e53935)',
  background: 'var(--t-surface, #0b1220)',
  padding: '12px 16px',
  marginBottom: 16,
  borderRadius: 0,
  fontSize: 13,
  color: 'var(--t-danger, #e53935)',
  fontWeight: 600,
}
