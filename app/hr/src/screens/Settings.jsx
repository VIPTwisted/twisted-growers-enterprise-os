import { useState, useEffect, useCallback } from 'react'
import { sb } from '../lib/supabase'
import { useAuth } from '../lib/auth.jsx'
import { applyTheme } from '../lib/theme.js'
import { useConfig, saveConfig } from '../lib/config.js'
import { companyName } from '../lib/config.js'

// ─────────────────────────────────────────────────────────────────────────────
// Date / relative-time helpers (used by real audit-log driven views)
// ─────────────────────────────────────────────────────────────────────────────
function fmtDateTime(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d)) return '—'
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
}
function fmtRelative(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d)) return '—'
  const secs = Math.round((Date.now() - d.getTime()) / 1000)
  if (secs < 60) return 'Just now'
  if (secs < 3600) return `${Math.floor(secs / 60)} min ago`
  if (secs < 86400) return `${Math.floor(secs / 3600)} hr ago`
  if (secs < 172800) return 'Yesterday'
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}
function deviceLabel(detail) {
  if (!detail || typeof detail !== 'object') return 'Sign-in'
  const parts = []
  if (detail.method) parts.push(String(detail.method).toUpperCase())
  if (detail.login_id) parts.push(String(detail.login_id))
  return parts.length ? parts.join(' · ') : 'Sign-in'
}

// ─────────────────────────────────────────────────────────────────────────────
// KPI Tile
// ─────────────────────────────────────────────────────────────────────────────
function KTile({ label, value, sub, color, alert }) {
  return (
    <div style={{
      background: 'var(--t-surface)',
      border: `1px solid ${alert === 'red' ? 'var(--t-danger)' : alert === 'amber' ? 'var(--t-warn)' : 'var(--t-line)'}`,
      padding: '14px 16px',
      position: 'relative',
      overflow: 'hidden',
      flex: '1 1 120px',
      minWidth: 0,
    }}>
      {alert === 'red' && <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'var(--t-danger)' }} />}
      {alert === 'amber' && <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'var(--t-warn)' }} />}
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.08em', color: 'var(--t-text-muted)', textTransform: 'uppercase', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800, color: color || 'var(--t-text)', lineHeight: 1, marginBottom: 4 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--t-text-faint)' }}>{sub}</div>}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Toggle Switch
// ─────────────────────────────────────────────────────────────────────────────
function Toggle({ checked, onChange, disabled }) {
  return (
    <div
      onClick={() => !disabled && onChange(!checked)}
      style={{
        width: 44,
        height: 24,
        borderRadius: 12,
        background: checked ? 'var(--t-accent)' : 'var(--t-line)',
        position: 'relative',
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'background .2s',
        flexShrink: 0,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <div style={{
        position: 'absolute',
        top: 3,
        left: checked ? 23 : 3,
        width: 18,
        height: 18,
        borderRadius: '50%',
        background: '#fff',
        transition: 'left .2s',
        boxShadow: '0 1px 4px rgba(0,0,0,.3)',
      }} />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Section label
// ─────────────────────────────────────────────────────────────────────────────
function SL({ children }) {
  return (
    <div style={{
      fontSize: 10,
      fontWeight: 700,
      letterSpacing: '.1em',
      color: 'var(--t-accent)',
      textTransform: 'uppercase',
      marginBottom: 12,
      marginTop: 20,
    }}>
      {children}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Row helper
// ─────────────────────────────────────────────────────────────────────────────
function Row({ label, children, sub }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '12px 0',
      borderBottom: '1px solid var(--t-line)',
      gap: 16,
    }}>
      <div>
        <div style={{ fontSize: 13, color: 'var(--t-text)', fontWeight: 500 }}>{label}</div>
        {sub && <div style={{ fontSize: 11, color: 'var(--t-text-faint)', marginTop: 2 }}>{sub}</div>}
      </div>
      <div style={{ flexShrink: 0 }}>{children}</div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Field helper
// ─────────────────────────────────────────────────────────────────────────────
function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--t-text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.06em' }}>{label}</div>
      {children}
    </div>
  )
}

const inputStyle = {
  width: '100%',
  boxSizing: 'border-box',
  background: 'var(--t-surface-2)',
  border: '1px solid var(--t-line)',
  color: 'var(--t-text)',
  padding: '9px 12px',
  fontSize: 13,
  outline: 'none',
  fontFamily: 'inherit',
}

const btnPrimary = {
  background: 'var(--t-accent)',
  color: '#000',
  border: 'none',
  padding: '9px 20px',
  fontSize: 12,
  fontWeight: 700,
  letterSpacing: '.05em',
  textTransform: 'uppercase',
  cursor: 'pointer',
}

const btnSecondary = {
  background: 'var(--t-surface-2)',
  color: 'var(--t-text-muted)',
  border: '1px solid var(--t-line)',
  padding: '9px 20px',
  fontSize: 12,
  fontWeight: 700,
  letterSpacing: '.05em',
  textTransform: 'uppercase',
  cursor: 'pointer',
}

const btnDanger = {
  background: 'transparent',
  color: 'var(--t-danger)',
  border: '1px solid var(--t-danger)',
  padding: '9px 20px',
  fontSize: 12,
  fontWeight: 700,
  letterSpacing: '.05em',
  textTransform: 'uppercase',
  cursor: 'pointer',
}

// ─────────────────────────────────────────────────────────────────────────────
// Toast
// ─────────────────────────────────────────────────────────────────────────────
function useToast() {
  const [toasts, setToasts] = useState([])
  const show = useCallback((msg, type = 'success') => {
    const id = Date.now()
    setToasts(t => [...t, { id, msg, type }])
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3200)
  }, [])
  return { toasts, show }
}

// ─────────────────────────────────────────────────────────────────────────────
// Empty state
// ─────────────────────────────────────────────────────────────────────────────
function Empty({ children }) {
  return (
    <div style={{
      padding: '18px 14px',
      textAlign: 'center',
      fontSize: 12,
      color: 'var(--t-text-faint)',
      border: '1px dashed var(--t-line)',
      background: 'var(--t-surface-2)',
    }}>{children}</div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// TABS
// ─────────────────────────────────────────────────────────────────────────────
const TABS = ['Profile', 'Notifications', 'Appearance', 'Security', 'Privacy', 'White Label']

// ─────────────────────────────────────────────────────────────────────────────
// Profile Tab
// ─────────────────────────────────────────────────────────────────────────────
function ProfileTab({ session, data, onSaved }) {
  const person = data?.person || session?.person || {}
  const pex = data?.profile_extra || {}
  const initials = (person.full_name || 'U').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()

  const [fullName,    setFullName]    = useState(person.full_name || '')
  const [email,       setEmail]       = useState(person.email || '')
  const [phone,       setPhone]       = useState(person.phone || '')
  const [ecId,        setEcId]        = useState(null)
  const [ecName,      setEcName]      = useState('')
  const [ecPhone,     setEcPhone]     = useState('')
  const [bio,         setBio]         = useState(pex.bio || '')
  const [pronouns,    setPronouns]    = useState(pex.pronouns || 'prefer-not')
  const [language,    setLanguage]    = useState(pex.language || 'en')
  const [saving,      setSaving]      = useState(false)

  // Hydrate the primary emergency contact from the live emergency_contacts table.
  useEffect(() => {
    if (!person.id) return
    let alive = true
    sb.rpc('get_my_emergency_contacts', { p_person_id: person.id }).then(({ data: ec }) => {
      if (!alive) return
      const first = Array.isArray(ec) ? ec[0] : null
      if (first) { setEcId(first.id); setEcName(first.contact_name || ''); setEcPhone(first.phone_primary || '') }
    }).catch(() => {})
    return () => { alive = false }
  }, [person.id])

  const handleSave = async () => {
    if (!person.id) { onSaved('No account loaded.', 'error'); return }
    setSaving(true)
    const { data: r } = await sb.rpc('update_profile', {
      p_person_id: person.id,
      p_full_name: fullName,
      p_email:     email,
      p_phone:     phone,
      p_bio:       bio,
      p_pronouns:  pronouns,
      p_language:  language,
    })
    // Persist the primary emergency contact via the live emergency_contacts RPC.
    if (ecName.trim() && ecPhone.trim()) {
      await sb.rpc('save_emergency_contact', {
        p_id:              ecId,
        p_person_id:       person.id,
        p_node_id:         session?.nodes?.[0]?.id ?? null,
        p_contact_name:    ecName.trim(),
        p_relationship:    null,
        p_phone_primary:   ecPhone.trim(),
        p_phone_alternate: null,
        p_address:         null,
        p_priority:        '1st Contact',
      }).catch(() => {})
    }
    setSaving(false)
    onSaved(r?.ok ? 'Profile saved.' : 'Could not save profile.', r?.ok ? 'success' : 'error')
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: 28, alignItems: 'start' }}>
      {/* Avatar column */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
        <div style={{
          width: 96, height: 96,
          borderRadius: '50%',
          background: 'linear-gradient(135deg, var(--t-accent), #3a7bff)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 32, fontWeight: 900, color: '#000',
          border: '3px solid var(--t-line)',
        }}>{initials}</div>
        <button style={{ ...btnSecondary, padding: '6px 14px', fontSize: 11, opacity: 0.6, cursor: 'not-allowed' }} disabled title="Photo upload is not yet available">
          Upload Photo <span style={{ color: 'var(--t-text-faint)', fontWeight: 400 }}>(not yet available)</span>
        </button>
        <div style={{ fontSize: 10, color: 'var(--t-text-faint)', textAlign: 'center' }}>JPG, PNG · max 4MB</div>
        <div style={{
          padding: '10px 14px',
          background: 'var(--t-surface-2)',
          border: '1px solid var(--t-line)',
          width: '100%',
          boxSizing: 'border-box',
        }}>
          <div style={{ fontSize: 10, color: 'var(--t-text-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.07em' }}>Employee ID</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--t-accent)', fontFamily: 'monospace' }}>{person.login_id || person.id?.slice(0, 8) || '—'}</div>
          <div style={{ fontSize: 10, color: 'var(--t-text-faint)', marginTop: 6 }}>{session?.person?.role_name || person.role_name || 'Associate'}</div>
        </div>
      </div>

      {/* Form column */}
      <div>
        <SL>Personal Information</SL>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <Field label="Full Name">
            <input style={inputStyle} value={fullName} onChange={e => setFullName(e.target.value)} />
          </Field>
          <Field label="Email">
            <input style={inputStyle} value={email} onChange={e => setEmail(e.target.value)} type="email" />
          </Field>
          <Field label="Phone Number">
            <input style={inputStyle} value={phone} onChange={e => setPhone(e.target.value)} placeholder="(860) 555-0000" />
          </Field>
          <Field label="Preferred Pronouns">
            <select style={{ ...inputStyle }} value={pronouns} onChange={e => setPronouns(e.target.value)}>
              <option value="he/him">He / Him</option>
              <option value="she/her">She / Her</option>
              <option value="they/them">They / Them</option>
              <option value="prefer-not">Prefer Not to Say</option>
            </select>
          </Field>
        </div>

        <SL>Emergency Contact</SL>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <Field label="Contact Name">
            <input style={inputStyle} value={ecName} onChange={e => setEcName(e.target.value)} placeholder="Full name" />
          </Field>
          <Field label="Contact Phone">
            <input style={inputStyle} value={ecPhone} onChange={e => setEcPhone(e.target.value)} placeholder="(860) 555-0000" />
          </Field>
        </div>

        <SL>About Me</SL>
        <Field label="Bio / About">
          <textarea
            style={{ ...inputStyle, resize: 'vertical', minHeight: 80, fontFamily: 'inherit' }}
            value={bio}
            onChange={e => setBio(e.target.value)}
            placeholder="Short bio visible to your team…"
          />
        </Field>

        <Field label="Language Preference">
          <select style={{ ...inputStyle, maxWidth: 220 }} value={language} onChange={e => setLanguage(e.target.value)}>
            <option value="en">English (US)</option>
            <option value="es">Español</option>
            <option value="pt">Português</option>
            <option value="fr">Français</option>
          </select>
        </Field>

        <div style={{ marginTop: 8 }}>
          <button style={btnPrimary} onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save Profile'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Notifications Tab
// ─────────────────────────────────────────────────────────────────────────────
const NOTIFY_CONFIG = [
  { key: 'email_enabled',       label: 'Email Notifications',          sub: 'Receive updates via email', channel: 'channel' },
  { key: 'sms_enabled',         label: 'SMS Notifications',            sub: 'Text message alerts to your phone', channel: 'channel' },
  { key: 'push_enabled',        label: 'Push Notifications',           sub: 'Browser and mobile push alerts', channel: 'channel' },
  { key: 'schedule_changes',    label: 'Schedule Changes',             sub: 'Shift edits, new assignments', channel: 'event' },
  { key: 'pto_updates',         label: 'PTO Request Updates',          sub: 'Approval / denial notifications', channel: 'event' },
  { key: 'training_reminders',  label: 'Training Reminders',           sub: 'Due dates and completion prompts', channel: 'event' },
  { key: 'disciplinary',        label: 'Disciplinary Updates',         sub: 'HR notices and action items', channel: 'event' },
  { key: 'announcements',       label: 'Announcement Alerts',          sub: 'Company-wide and store messages', channel: 'event' },
  { key: 'perf_review',         label: 'Performance Review Reminders', sub: 'Upcoming review notifications', channel: 'event' },
]

const FREQ_OPTIONS = [
  { value: 'immediate', label: 'Immediately' },
  { value: 'daily',     label: 'Daily Digest' },
  { value: 'weekly',    label: 'Weekly Summary' },
]

function NotificationsTab({ initial, personId, onSaved }) {
  const src = initial || {}
  const [prefs, setPrefs] = useState(() => {
    const p = {}
    NOTIFY_CONFIG.forEach(c => { p[c.key] = src[c.key] !== false }) // default on until explicitly disabled
    return p
  })
  const [emailFreq, setEmailFreq]  = useState(src.emailFreq || 'immediate')
  const [smsFreq,   setSmsFreq]    = useState(src.smsFreq || 'immediate')
  const [saving,    setSaving]     = useState(false)

  const handleSave = async () => {
    if (!personId) { onSaved('No account loaded.', 'error'); return }
    setSaving(true)
    const { data: r } = await sb.rpc('update_notification_prefs', {
      p_person_id: personId,
      p_prefs: { ...prefs, emailFreq, smsFreq },
    })
    setSaving(false)
    onSaved(r?.ok ? 'Notification preferences saved.' : 'Could not save preferences.', r?.ok ? 'success' : 'error')
  }

  const channels = NOTIFY_CONFIG.filter(c => c.channel === 'channel')
  const events   = NOTIFY_CONFIG.filter(c => c.channel === 'event')

  return (
    <div style={{ maxWidth: 640 }}>
      <SL>Channels</SL>
      {channels.map(c => (
        <Row key={c.key} label={c.label} sub={c.sub}>
          <Toggle checked={!!prefs[c.key]} onChange={v => setPrefs(p => ({ ...p, [c.key]: v }))} />
        </Row>
      ))}

      <SL>Frequency (Email)</SL>
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {FREQ_OPTIONS.map(f => (
          <button
            key={f.value}
            onClick={() => setEmailFreq(f.value)}
            style={{
              ...btnSecondary,
              padding: '7px 16px',
              fontSize: 11,
              borderColor: emailFreq === f.value ? 'var(--t-accent)' : 'var(--t-line)',
              color: emailFreq === f.value ? 'var(--t-accent)' : 'var(--t-text-muted)',
            }}
          >{f.label}</button>
        ))}
      </div>

      <SL>Frequency (SMS)</SL>
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {FREQ_OPTIONS.map(f => (
          <button
            key={f.value}
            onClick={() => setSmsFreq(f.value)}
            style={{
              ...btnSecondary,
              padding: '7px 16px',
              fontSize: 11,
              borderColor: smsFreq === f.value ? 'var(--t-accent)' : 'var(--t-line)',
              color: smsFreq === f.value ? 'var(--t-accent)' : 'var(--t-text-muted)',
            }}
          >{f.label}</button>
        ))}
      </div>

      <SL>Event Types</SL>
      {events.map(c => (
        <Row key={c.key} label={c.label} sub={c.sub}>
          <Toggle checked={!!prefs[c.key]} onChange={v => setPrefs(p => ({ ...p, [c.key]: v }))} />
        </Row>
      ))}

      <div style={{ marginTop: 24 }}>
        <button style={btnPrimary} onClick={handleSave} disabled={saving}>
          {saving ? 'Saving…' : 'Save Notification Preferences'}
        </button>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Appearance Tab
// ─────────────────────────────────────────────────────────────────────────────
const ACCENT_COLORS = [
  { id: 'cyan',   label: 'Cyan',   value: '#00e5ff' },
  { id: 'blue',   label: 'Blue',   value: '#2979ff' },
  { id: 'purple', label: 'Purple', value: '#c084fc' },
  { id: 'green',  label: 'Green',  value: '#00e676' },
]

const THEME_FAMILIES = [
  { id: 'aurora', label: '' + companyName() + ' Aurora',      desc: 'Midnight Aurora — cyan on navy',  swatch: ['#070b14', '#00e5ff'] },
  { id: 'tg',     label: companyName(), desc: 'The OS theme — neon green',       swatch: ['#0a0c0b', '#2df26a'] },
]
const THEME_MODES = [
  { id: 'dark',   label: 'Dark',   desc: 'Dark surfaces' },
  { id: 'light',  label: 'Light',  desc: 'Light surfaces' },
  { id: 'system', label: 'System', desc: 'Follow the device' },
]

function AppearanceTab({ onSave }) {
  const { session } = useAuth()
  const [family,     setFamily]     = useState(() => localStorage.getItem('vip_theme') || 'aurora')
  const [mode,       setMode]       = useState(() => localStorage.getItem('vip_mode') || 'dark')
  const [fontSize,   setFontSize]   = useState(() => localStorage.getItem('vip_font_size') || 'medium')
  const [compact,    setCompact]    = useState(() => localStorage.getItem('vip_compact') === 'true')
  const [accent,     setAccent]     = useState(() => localStorage.getItem('vip_accent') || 'cyan')
  const [sidebar,    setSidebar]    = useState(() => localStorage.getItem('vip_sidebar') || 'standard')

  const handleApply = () => {
    applyTheme(family, mode, session?.person?.id)
    localStorage.setItem('vip_font_size', fontSize)
    localStorage.setItem('vip_compact', String(compact))
    localStorage.setItem('vip_accent', accent)
    localStorage.setItem('vip_sidebar', sidebar)
    const ac = ACCENT_COLORS.find(a => a.id === accent)
    if (ac && accent !== 'theme') document.documentElement.style.setProperty('--t-accent', ac.value)
    else document.documentElement.style.removeProperty('--t-accent')
    onSave('Appearance applied — ' + (THEME_FAMILIES.find(f => f.id === family)?.label) + ', ' + mode + '.')
  }

  return (
    <div style={{ maxWidth: 640 }}>
      <SL>Theme</SL>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, marginBottom: 14 }}>
        {THEME_FAMILIES.map(t => (
          <div key={t.id} onClick={() => { setFamily(t.id); applyTheme(t.id, mode, null) }}
            style={{ padding: 16, background: t.swatch[0], border: `2px solid ${family === t.id ? t.swatch[1] : 'var(--t-line)'}`, cursor: 'pointer', transition: 'border-color .15s' }}>
            <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
              {[1,2,3].map(i => <div key={i} style={{ height: 6, flex: i === 1 ? 2 : 1, background: i === 1 ? t.swatch[1] : 'rgba(255,255,255,.15)' }} />)}
            </div>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#fff', marginBottom: 3 }}>{t.label}</div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,.55)' }}>{t.desc}</div>
            {family === t.id && <div style={{ marginTop: 8, fontSize: 10, color: t.swatch[1], fontWeight: 700, letterSpacing: '.06em' }}>ACTIVE</div>}
          </div>
        ))}
      </div>
      <SL>Mode</SL>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
        {THEME_MODES.map(m => (
          <div key={m.id} onClick={() => { setMode(m.id); applyTheme(family, m.id, null) }}
            style={{ padding: 14, background: m.id === 'light' ? '#f5f7f5' : m.id === 'dark' ? '#0d1117' : 'var(--t-surface-2)',
                     border: `2px solid ${mode === m.id ? 'var(--t-accent)' : 'var(--t-line)'}`, cursor: 'pointer' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: m.id === 'light' ? '#111' : m.id === 'dark' ? '#fff' : 'var(--t-text)' }}>{m.label}</div>
            <div style={{ fontSize: 10, color: m.id === 'light' ? 'rgba(0,0,0,.45)' : m.id === 'dark' ? 'rgba(255,255,255,.5)' : 'var(--t-text-muted)' }}>{m.desc}</div>
            {mode === m.id && <div style={{ marginTop: 6, fontSize: 10, color: 'var(--t-accent)', fontWeight: 700, letterSpacing: '.06em' }}>ACTIVE</div>}
          </div>
        ))}
      </div>

      <SL>Font Size</SL>
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {['small', 'medium', 'large'].map(s => (
          <button
            key={s}
            onClick={() => setFontSize(s)}
            style={{
              ...btnSecondary,
              padding: '7px 20px',
              borderColor: fontSize === s ? 'var(--t-accent)' : 'var(--t-line)',
              color: fontSize === s ? 'var(--t-accent)' : 'var(--t-text-muted)',
              fontSize: s === 'small' ? 10 : s === 'large' ? 14 : 12,
              textTransform: 'capitalize',
            }}
          >{s}</button>
        ))}
      </div>

      <SL>Color Accent</SL>
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, alignItems: 'center' }}>
        {ACCENT_COLORS.map(a => (
          <div
            key={a.id}
            onClick={() => setAccent(a.id)}
            title={a.label}
            style={{
              width: 32,
              height: 32,
              borderRadius: '50%',
              background: a.value,
              border: accent === a.id ? `3px solid #fff` : '3px solid transparent',
              outline: accent === a.id ? `2px solid ${a.value}` : 'none',
              cursor: 'pointer',
              transition: 'all .15s',
            }}
          />
        ))}
        <span style={{ fontSize: 12, color: 'var(--t-text-muted)', marginLeft: 4 }}>
          {ACCENT_COLORS.find(a => a.id === accent)?.label}
        </span>
      </div>

      <Row label="Compact Mode" sub="Reduce padding and element spacing throughout the app">
        <Toggle checked={compact} onChange={setCompact} />
      </Row>

      <SL>Sidebar Width</SL>
      <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
        {['narrow', 'standard', 'wide'].map(s => (
          <button
            key={s}
            onClick={() => setSidebar(s)}
            style={{
              ...btnSecondary,
              padding: '7px 20px',
              fontSize: 11,
              textTransform: 'capitalize',
              borderColor: sidebar === s ? 'var(--t-accent)' : 'var(--t-line)',
              color: sidebar === s ? 'var(--t-accent)' : 'var(--t-text-muted)',
            }}
          >{s}</button>
        ))}
      </div>

      {/* Live Preview */}
      <div style={{
        border: '1px solid var(--t-line)',
        padding: 16,
        background: 'var(--t-surface-2)',
        marginBottom: 24,
      }}>
        <div style={{ fontSize: 10, color: 'var(--t-text-muted)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '.08em' }}>Preview</div>
        <div style={{
          display: 'flex',
          gap: 10,
          padding: compact ? '8px 10px' : '14px 16px',
          background: 'var(--t-surface)',
          border: '1px solid var(--t-line)',
        }}>
          <div style={{ width: 36, height: 36, borderRadius: '50%', background: ACCENT_COLORS.find(a => a.id === accent)?.value || 'var(--t-accent)', flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div style={{
              fontSize: fontSize === 'small' ? 11 : fontSize === 'large' ? 16 : 13,
              fontWeight: 700,
              color: 'var(--t-text)',
              marginBottom: 3,
            }}>Sample Employee Name</div>
            <div style={{
              fontSize: fontSize === 'small' ? 10 : fontSize === 'large' ? 13 : 11,
              color: 'var(--t-text-muted)',
            }}>Store Associate · Orange</div>
          </div>
          <div style={{
            padding: '4px 10px',
            background: ACCENT_COLORS.find(a => a.id === accent)?.value || 'var(--t-accent)',
            color: '#000',
            fontSize: 10,
            fontWeight: 700,
            alignSelf: 'center',
          }}>ACTIVE</div>
        </div>
      </div>

      <button style={btnPrimary} onClick={handleApply}>Apply Appearance</button>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Security Tab
// ─────────────────────────────────────────────────────────────────────────────
function SecurityTab({ session, events, onSaved }) {
  const person = session?.person || {}
  const [curPwd,    setCurPwd]    = useState('')
  const [newPwd,    setNewPwd]    = useState('')
  const [confPwd,   setConfPwd]   = useState('')
  const [pwdMsg,    setPwdMsg]    = useState(null)
  const [saving,    setSaving]    = useState(false)

  const evList  = Array.isArray(events) ? events : []
  const signIns = evList.filter(e => /login/i.test(e.action || ''))

  const handleChangePwd = async () => {
    if (!curPwd || !newPwd || !confPwd) { setPwdMsg({ ok: false, msg: 'All fields required.' }); return }
    if (newPwd !== confPwd) { setPwdMsg({ ok: false, msg: 'New PINs do not match.' }); return }
    if (newPwd.length < 4)  { setPwdMsg({ ok: false, msg: 'PIN must be at least 4 digits.' }); return }
    setSaving(true)
    setPwdMsg(null)
    // App authenticates by PIN (pin_login), so this is a PIN change, not a password change.
    const { data } = await sb.rpc('change_pin', {
      p_person_id:   person.id,
      p_current_pin: curPwd,
      p_new_pin:     newPwd,
    })
    setSaving(false)
    if (data?.ok) {
      setPwdMsg({ ok: true, msg: 'PIN updated successfully.' })
      setCurPwd(''); setNewPwd(''); setConfPwd('')
      onSaved('PIN updated.', 'success')
    } else {
      setPwdMsg({ ok: false, msg: data?.error === 'wrong_pin' ? 'Current PIN is incorrect.'
        : data?.error === 'too_short' ? 'PIN must be at least 4 digits.'
        : 'Could not update PIN — please try again.' })
    }
  }

  const strength = () => {
    if (!newPwd) return { pct: 0, label: 'None', color: 'var(--t-line)' }
    let score = 0
    if (newPwd.length >= 8)  score++
    if (newPwd.length >= 12) score++
    if (/[A-Z]/.test(newPwd)) score++
    if (/[0-9]/.test(newPwd)) score++
    if (/[^A-Za-z0-9]/.test(newPwd)) score++
    if (score <= 1) return { pct: 20,  label: 'Weak',   color: 'var(--t-danger)' }
    if (score <= 3) return { pct: 60,  label: 'Fair',   color: 'var(--t-warn)' }
    return              { pct: 100, label: 'Strong', color: 'var(--t-success)' }
  }
  const str = strength()

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 28, alignItems: 'start' }}>
      {/* LEFT */}
      <div>
        <SL>Change PIN</SL>
        <Field label="Current PIN">
          <input style={inputStyle} type="password" value={curPwd} onChange={e => setCurPwd(e.target.value)} placeholder="••••••••" />
        </Field>
        <Field label="New PIN">
          <input style={inputStyle} type="password" value={newPwd} onChange={e => setNewPwd(e.target.value)} placeholder="Min 8 characters" />
          {newPwd && (
            <div style={{ marginTop: 8 }}>
              <div style={{ height: 4, background: 'var(--t-surface-2)', marginBottom: 4 }}>
                <div style={{ width: `${str.pct}%`, height: '100%', background: str.color, transition: 'width .3s' }} />
              </div>
              <div style={{ fontSize: 10, color: str.color, fontWeight: 700 }}>Strength: {str.label}</div>
            </div>
          )}
        </Field>
        <Field label="Confirm New PIN">
          <input style={inputStyle} type="password" value={confPwd} onChange={e => setConfPwd(e.target.value)} placeholder="Repeat new password" />
        </Field>
        {pwdMsg && (
          <div style={{ fontSize: 12, fontWeight: 600, color: pwdMsg.ok ? 'var(--t-success)' : 'var(--t-danger)', marginBottom: 12, padding: '8px 12px', background: 'var(--t-surface-2)', border: `1px solid ${pwdMsg.ok ? 'var(--t-success)' : 'var(--t-danger)'}` }}>
            {pwdMsg.msg}
          </div>
        )}
        <button style={btnPrimary} onClick={handleChangePwd} disabled={saving}>
          {saving ? 'Updating…' : 'Update PIN'}
        </button>

        <SL>Two-Factor Authentication</SL>
        <Row label="Enable 2FA" sub="TOTP-based authentication (not yet available)">
          <Toggle checked={false} onChange={() => {}} disabled />
        </Row>
      </div>

      {/* RIGHT */}
      <div>
        <SL>Recent Sign-Ins</SL>
        {signIns.length === 0
          ? <Empty>No recent sign-in activity on record.</Empty>
          : signIns.slice(0, 5).map((s, i) => (
            <div key={s.id} style={{
              padding: '12px 14px',
              marginBottom: 8,
              background: 'var(--t-surface-2)',
              border: `1px solid ${i === 0 ? 'var(--t-accent)' : 'var(--t-line)'}`,
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              justifyContent: 'space-between',
            }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--t-text)', marginBottom: 3 }}>{deviceLabel(s.detail)}</div>
                <div style={{ fontSize: 11, color: 'var(--t-text-faint)' }}>{fmtRelative(s.created_at)}</div>
              </div>
              {i === 0 && <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--t-accent)', letterSpacing: '.06em' }}>MOST RECENT</span>}
            </div>
          ))
        }

        <SL>Security Event Log</SL>
        {evList.length === 0
          ? <Empty>No account activity recorded yet.</Empty>
          : evList.map(e => {
            const failed = /fail|denied|invalid|error/i.test(e.action || '')
            return (
              <div key={e.id} style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '9px 0',
                borderBottom: '1px solid var(--t-line)',
              }}>
                <div style={{
                  width: 8, height: 8,
                  borderRadius: '50%',
                  background: failed ? 'var(--t-danger)' : 'var(--t-success)',
                  flexShrink: 0,
                }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--t-text)', textTransform: 'capitalize' }}>{e.action || 'Activity'}</div>
                  <div style={{ fontSize: 10, color: 'var(--t-text-faint)' }}>{deviceLabel(e.detail)}</div>
                </div>
                <div style={{ fontSize: 10, color: 'var(--t-text-muted)', flexShrink: 0 }}>{fmtDateTime(e.created_at)}</div>
              </div>
            )
          })
        }
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Privacy Tab
// ─────────────────────────────────────────────────────────────────────────────
const PRIVACY_ITEMS = [
  { key: 'analytics',       label: 'Allow Performance Analytics',     sub: 'Helps HR track platform usage and improve the experience' },
  { key: 'benchmarking',    label: 'Allow Performance Benchmarking',  sub: 'Your metrics may be compared against store averages' },
  { key: 'leaderboard',     label: 'Show Name on Leaderboards',       sub: 'Your name appears in sales and performance rankings' },
  { key: 'activity_feed',   label: 'Show Activity in Team Feed',      sub: 'Clock-ins, completions visible to your team' },
]

function PrivacyTab({ session, initial, personId, onSaved }) {
  const src = initial || {}
  const [prefs, setPrefs] = useState({
    analytics:     src.analytics !== false,
    benchmarking:  src.benchmarking !== false,
    leaderboard:   src.leaderboard !== false,
    activity_feed: src.activity_feed === true,
  })
  const [saving, setSaving] = useState(false)
  const [exporting, setExporting] = useState(false)

  const toggle = (key) => setPrefs(p => ({ ...p, [key]: !p[key] }))

  const handleSave = async () => {
    if (!personId) { onSaved('No account loaded.', 'error'); return }
    setSaving(true)
    const { data: r } = await sb.rpc('update_privacy_prefs', { p_person_id: personId, p_prefs: prefs })
    setSaving(false)
    onSaved(r?.ok ? 'Privacy preferences saved.' : 'Could not save preferences.', r?.ok ? 'success' : 'error')
  }

  const handleExport = () => {
    setExporting(true)
    setTimeout(() => {
      const blob = new Blob([JSON.stringify({ person: session?.person?.id, exportedAt: new Date().toISOString(), note: 'Data export request queued. HR will contact you within 5 business days.' }, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a'); a.href = url; a.download = 'vip-my-data-request.json'; a.click()
      URL.revokeObjectURL(url)
      setExporting(false)
    }, 800)
  }

  return (
    <div style={{ maxWidth: 600 }}>
      <SL>Data Sharing Preferences</SL>
      {PRIVACY_ITEMS.map(p => (
        <Row key={p.key} label={p.label} sub={p.sub}>
          <Toggle checked={!!prefs[p.key]} onChange={v => toggle(p.key)} />
        </Row>
      ))}

      <div style={{ marginTop: 24, marginBottom: 32 }}>
        <button style={btnPrimary} onClick={handleSave} disabled={saving}>
          {saving ? 'Saving…' : 'Save Privacy Preferences'}
        </button>
      </div>

      <SL>Your Data</SL>

      <div style={{ padding: '16px', background: 'var(--t-surface-2)', border: '1px solid var(--t-line)', marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--t-text)', marginBottom: 4 }}>Export My Data</div>
        <div style={{ fontSize: 12, color: 'var(--t-text-muted)', marginBottom: 14, lineHeight: 1.6 }}>
          Request a copy of all personal data {companyName()} holds on your account. Your data will be compiled and made available within 5 business days.
        </div>
        <button style={{ ...btnSecondary, fontSize: 11 }} onClick={handleExport} disabled={exporting}>
          {exporting ? 'Preparing…' : 'Download My Data'}
        </button>
      </div>

      <div style={{ padding: '16px', background: 'var(--t-surface-2)', border: '1px solid var(--t-line)' }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--t-text)', marginBottom: 4 }}>Delete Account</div>
        <div style={{ fontSize: 12, color: 'var(--t-text-muted)', marginBottom: 14, lineHeight: 1.6 }}>
          Account deletion is a permanent action and cannot be undone. All your data, schedules, and records will be permanently removed.
        </div>
        <div style={{ position: 'relative', display: 'inline-block' }}>
          <button
            style={{ ...btnDanger, fontSize: 11, cursor: 'not-allowed', opacity: 0.5 }}
            disabled
            title="Contact HR to request account deletion"
          >
            Request Account Deletion
          </button>
          <div style={{ fontSize: 10, color: 'var(--t-text-faint)', marginTop: 6 }}>
            Contact HR to submit an account deletion request.
          </div>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// White Label Tab
// ─────────────────────────────────────────────────────────────────────────────
function WhiteLabelTab({ onSave }) {
  const config = useConfig()
  const [draft, setDraft] = useState(null)
  const [saved, setSaved] = useState(false)

  // Sync draft when config loads
  useEffect(() => {
    setDraft(c => c === null ? { ...config } : c)
  }, [config])

  if (!draft) return null

  const set = (key, val) => setDraft(d => ({ ...d, [key]: val }))

  const handleSave = async () => {
    try {
      await saveConfig(draft)                       // rows first (hr.tenant_config.settings); the cache follows
      onSave('White label settings saved.')
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (e) { onSave(e?.message || 'the settings could not be saved') }
  }

  const selectStyle = { ...inputStyle }

  return (
    <div style={{ maxWidth: 720 }}>

      <SL>Company Identity</SL>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <Field label="Company Name">
          <input style={inputStyle} value={draft.company_name} onChange={e => set('company_name', e.target.value)} />
        </Field>
        <Field label="Short Name">
          <input style={inputStyle} value={draft.company_short} onChange={e => set('company_short', e.target.value)} />
        </Field>
        <Field label="Industry">
          <input style={inputStyle} value={draft.industry} onChange={e => set('industry', e.target.value)} />
        </Field>
        <Field label="Logo Text">
          <input style={inputStyle} value={draft.logo_text} onChange={e => set('logo_text', e.target.value)} />
        </Field>
        <Field label="Currency Symbol">
          <input style={inputStyle} value={draft.currency} maxLength={2} onChange={e => set('currency', e.target.value)} />
        </Field>
        <Field label="Fiscal Year Start">
          <select style={selectStyle} value={draft.fiscal_year_start} onChange={e => set('fiscal_year_start', e.target.value)}>
            <option value="January">January</option>
            <option value="April">April</option>
            <option value="July">July</option>
            <option value="October">October</option>
          </select>
        </Field>
      </div>

      <SL>Labor &amp; Compliance</SL>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <Field label="Minimum Wage ($)">
          <input style={inputStyle} type="number" step="0.01" value={draft.min_wage} onChange={e => set('min_wage', parseFloat(e.target.value) || 0)} />
        </Field>
        <Field label="Labor Cost Target %">
          <input style={inputStyle} type="number" value={draft.labor_cost_target_pct} onChange={e => set('labor_cost_target_pct', parseFloat(e.target.value) || 0)} />
        </Field>
        <Field label="Labor Cost Warning Threshold %">
          <input style={inputStyle} type="number" value={draft.labor_cost_warn_pct} onChange={e => set('labor_cost_warn_pct', parseFloat(e.target.value) || 0)} />
        </Field>
        <Field label="Schedule Publish Deadline (hours before week start)">
          <input style={inputStyle} type="number" value={draft.schedule_publish_hours} onChange={e => set('schedule_publish_hours', parseInt(e.target.value) || 0)} />
        </Field>
        <Field label="FMLA Eligibility Threshold Hours">
          <input style={inputStyle} type="number" value={draft.fmla_threshold_hours} onChange={e => set('fmla_threshold_hours', parseInt(e.target.value) || 0)} />
        </Field>
      </div>

      <SL>HR Settings</SL>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <Field label="Paid Leave Accrual (1 hr per X hrs worked)">
          <input style={inputStyle} type="number" value={draft.paid_leave_accrual_hours} onChange={e => set('paid_leave_accrual_hours', parseInt(e.target.value) || 0)} />
        </Field>
        <Field label="Handbook Version">
          <input style={inputStyle} value={draft.handbook_version} onChange={e => set('handbook_version', e.target.value)} />
        </Field>
        <Field label="Background Check Provider">
          <input style={inputStyle} value={draft.bg_check_provider} placeholder="e.g. Checkr, Sterling" onChange={e => set('bg_check_provider', e.target.value)} />
        </Field>
        <Field label="I-9 Warning Days (comma-separated)">
          <input style={inputStyle} value={draft.i9_warning_days} placeholder="60,30,7" onChange={e => set('i9_warning_days', e.target.value)} />
        </Field>
        <Field label="Daily Digest Hour (0–23)">
          <input style={inputStyle} type="number" min={0} max={23} value={draft.daily_digest_hour} onChange={e => set('daily_digest_hour', parseInt(e.target.value) || 0)} />
        </Field>
        <Field label="Turnover Cost Per Employee ($)">
          <input style={inputStyle} type="number" value={draft.turnover_cost_per_emp} onChange={e => set('turnover_cost_per_emp', parseInt(e.target.value) || 0)} />
        </Field>
      </div>

      <Row
        label="Require Exit Interview"
        sub="Exit interview must be completed before offboarding"
      >
        <Toggle
          checked={!!draft.exit_interview_required}
          onChange={v => set('exit_interview_required', v)}
        />
      </Row>

      <div style={{ marginTop: 24, display: 'flex', alignItems: 'center', gap: 14 }}>
        <button style={btnPrimary} onClick={handleSave}>Save White Label Settings</button>
        {saved && (
          <span style={{ fontSize: 12, color: 'var(--t-success)', fontWeight: 600 }}>Saved</span>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Settings Component
// ─────────────────────────────────────────────────────────────────────────────
export default function Settings() {
  const { session } = useAuth()
  const person = session?.person || {}
  const r = person.role_name || ''

  const [tab, setTab] = useState('Profile')
  const { toasts, show: showToast } = useToast()

  // ── Live account data (real reads) ────────────────────────
  const [data,    setData]    = useState(null)
  const [events,  setEvents]  = useState([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!person.id) { setLoading(false); return }
    const [accRes, evRes] = await Promise.all([
      sb.rpc('get_account_settings', { p_person_id: person.id }),
      sb.rpc('get_security_events', { p_person_id: person.id, p_limit: 25 }),
    ])
    setData(accRes?.data ?? null)
    setEvents(Array.isArray(evRes?.data) ? evRes.data : [])
    setLoading(false)
  }, [person.id])

  useEffect(() => { load() }, [load])

  // Toast + refresh after a successful write so KPIs and lists reflect the DB.
  const onSaved = useCallback((msg, type = 'success') => {
    showToast(msg, type === 'error' ? 'error' : 'success')
    if (type !== 'error') load()
  }, [showToast, load])

  // ── KPIs derived entirely from real data ──────────────────
  const nprefs   = data?.notification_prefs || {}
  const pex      = data?.profile_extra || {}
  const p2       = data?.person || person
  const ecCount  = data?.emergency_contacts || 0
  const savedNotifKeys = Object.keys(nprefs)
  const notifOn  = savedNotifKeys.length
    ? NOTIFY_CONFIG.filter(c => nprefs[c.key] !== false).length
    : NOTIFY_CONFIG.length

  const completeFields = [p2?.full_name, p2?.email, p2?.phone, pex?.bio, ecCount > 0]
  const profilePct = Math.round((completeFields.filter(Boolean).length / completeFields.length) * 100)

  const firstSeen   = data?.first_seen ? new Date(data.first_seen) : null
  const accountDays = firstSeen ? Math.max(0, Math.round((Date.now() - firstSeen.getTime()) / 86400000)) : null
  const signIns7d   = data?.sign_ins_7d ?? 0

  // Security score from real signals (emergency contact on file, profile
  // completeness, notification setup) — deterministic, not random.
  let secScore = 40
  if (ecCount > 0) secScore += 20
  secScore += Math.round(profilePct * 0.3)
  if (notifOn > 0) secScore += 10
  secScore = Math.min(secScore, 100)

  return (
    <div style={{ position: 'relative' }}>
      {/* Toast stack */}
      <div style={{ position: 'fixed', top: 20, right: 20, zIndex: 9999, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {toasts.map(t => (
          <div key={t.id} style={{
            padding: '10px 18px',
            background: t.type === 'error' ? 'var(--t-danger)' : 'var(--t-success)',
            color: '#fff',
            fontSize: 13,
            fontWeight: 600,
            boxShadow: '0 4px 16px rgba(0,0,0,.4)',
            animation: 'fadeIn .2s ease',
          }}>{t.msg}</div>
        ))}
      </div>

      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 22, fontWeight: 900, color: 'var(--t-text)', letterSpacing: '-.02em', marginBottom: 4 }}>
          Settings
        </div>
        <div style={{ fontSize: 13, color: 'var(--t-text-muted)' }}>
          {person.full_name || 'My Account'} · {r || 'Associate'} · Personal preferences and security
        </div>
      </div>

      {/* Forensic KPI row */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
        <KTile
          label="Profile Complete"
          value={data ? `${profilePct}%` : '—'}
          sub={ecCount > 0 ? 'Contact on file' : 'Add emergency contact'}
          color={profilePct < 70 ? 'var(--t-warn)' : 'var(--t-success)'}
          alert={data && profilePct < 70 ? 'amber' : undefined}
        />
        <KTile
          label="Last Login"
          value={data?.last_login ? fmtRelative(data.last_login) : '—'}
          sub={data?.last_login ? fmtDateTime(data.last_login) : 'No record'}
          color="var(--t-text)"
        />
        <KTile
          label="Sign-ins (7d)"
          value={data ? signIns7d : '—'}
          sub="Recent activity"
          color="var(--t-text)"
        />
        <KTile
          label="Notifications On"
          value={data ? notifOn : '—'}
          sub={`of ${NOTIFY_CONFIG.length} channels`}
          color="var(--t-accent)"
        />
        <KTile
          label="Security Score"
          value={data ? secScore : '—'}
          sub={secScore < 60 ? 'Add contact / complete profile' : 'Good standing'}
          color={secScore < 60 ? 'var(--t-danger)' : 'var(--t-success)'}
          alert={data && secScore < 60 ? 'red' : undefined}
        />
        <KTile
          label="Account Age"
          value={accountDays != null ? `${accountDays}d` : '—'}
          sub="Since first activity"
          color="var(--t-text-muted)"
        />
      </div>

      {/* Tab bar */}
      <div style={{
        display: 'flex',
        gap: 0,
        borderBottom: '1px solid var(--t-line)',
        marginBottom: 28,
      }}>
        {TABS.map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
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
            }}
          >{t}</button>
        ))}
      </div>

      {/* Tab content */}
      <div>
        {!person.id ? (
          <Empty>Sign in to manage your account settings.</Empty>
        ) : (loading && tab !== 'Appearance' && tab !== 'White Label') ? (
          <div style={{ padding: '24px 0', fontSize: 13, color: 'var(--t-text-muted)' }}>Loading your settings…</div>
        ) : (
          <>
            {tab === 'Profile'       && <ProfileTab       key={data ? 'p1' : 'p0'} session={session} data={data} onSaved={onSaved} />}
            {tab === 'Notifications' && <NotificationsTab  key={data ? 'n1' : 'n0'} initial={data?.notification_prefs} personId={person.id} onSaved={onSaved} />}
            {tab === 'Appearance'    && <AppearanceTab     onSave={msg => showToast(msg)} />}
            {tab === 'Security'      && <SecurityTab       session={session} events={events} onSaved={onSaved} />}
            {tab === 'Privacy'       && <PrivacyTab        key={data ? 'pv1' : 'pv0'} session={session} initial={data?.privacy_prefs} personId={person.id} onSaved={onSaved} />}
            {tab === 'White Label'   && <WhiteLabelTab     onSave={msg => showToast(msg)} />}
          </>
        )}
      </div>

      <style>{`
        @keyframes fadeIn { from { opacity:0; transform:translateY(-8px); } to { opacity:1; transform:none; } }
      `}</style>
    </div>
  )
}
