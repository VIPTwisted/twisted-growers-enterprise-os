import { useState, useEffect, useCallback, useMemo, useRef, Fragment } from 'react'
import { sb, getSession } from '../lib/supabase'

/* ── helpers ─────────────────────────────────────────────────────── */
async function callRpc(fn, args) {
  const { data, error } = await sb.rpc(fn, args)
  if (error) throw error
  return data
}

function timeAgo(ts) {
  if (!ts) return '—'
  const then = new Date(ts).getTime()
  if (Number.isNaN(then)) return '—'
  const s = Math.floor((Date.now() - then) / 1000)
  if (s < 60) return 'Just now'
  const m = Math.floor(s / 60); if (m < 60) return `${m} min ago`
  const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24); if (d < 30) return `${d}d ago`
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function fmtTs(ts) {
  if (!ts) return '—'
  const d = new Date(ts)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function isToday(ts) {
  if (!ts) return false
  const d = new Date(ts); const n = new Date()
  return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate()
}

const slug = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'integration'

/* ── sub-components ──────────────────────────────────────────────── */

function KTile({ label, value, sub, color, alert }) {
  return (
    <div style={{
      background: 'var(--t-surface)',
      border: `1px solid ${alert === 'red' ? 'var(--t-danger)' : alert === 'amber' ? 'var(--t-warn)' : 'var(--t-line)'}`,
      padding: '14px 16px', position: 'relative', overflow: 'hidden', flex: 1, minWidth: 120,
    }}>
      {alert === 'red' && <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'var(--t-danger)' }} />}
      {alert === 'amber' && <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'var(--t-warn)' }} />}
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.08em', color: 'var(--t-text-muted)', textTransform: 'uppercase', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800, color: color || 'var(--t-text)', lineHeight: 1, marginBottom: 4 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--t-text-faint)' }}>{sub}</div>}
    </div>
  )
}

function Toast({ message, type, onDone }) {
  useEffect(() => { const t = setTimeout(onDone, 3000); return () => clearTimeout(t) }, [onDone])
  return (
    <div style={{
      position: 'fixed', bottom: 24, right: 24, zIndex: 9999,
      background: type === 'error' ? 'rgba(255,59,48,.18)' : type === 'warn' ? 'rgba(255,179,71,.18)' : 'rgba(29,233,182,.18)',
      border: `1px solid ${type === 'error' ? 'rgba(255,59,48,.5)' : type === 'warn' ? 'rgba(255,179,71,.5)' : 'rgba(29,233,182,.5)'}`,
      backdropFilter: 'blur(12px)', padding: '12px 20px', fontSize: 13, fontWeight: 600,
      color: 'var(--t-text)', fontFamily: 'inherit', maxWidth: 360, boxShadow: '0 8px 32px rgba(0,0,0,.4)',
    }}>
      {message}
    </div>
  )
}

const inputStyle = {
  width: '100%', boxSizing: 'border-box', background: 'var(--t-surface)', border: '1px solid var(--t-line)',
  color: 'var(--t-text)', padding: '6px 10px', fontSize: 12, outline: 'none', fontFamily: 'inherit', borderRadius: 0,
}

/* ── Connected tab ───────────────────────────────────────────────── */
function ConnectedTab({ integrations, actorId, onChanged, showToast }) {
  const [testing, setTesting] = useState({})
  const [configOpen, setConfigOpen] = useState(null)
  const [cfg, setCfg] = useState({})
  const [saving, setSaving] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [form, setForm] = useState({ name: '', category: '', description: '', direction: 'inbound', sync_freq: '', endpoint_url: '' })

  const statusBadge = (s) => ({
    connected: 'badge green', warning: 'badge amber', disconnected: 'badge red',
  })[s] || 'badge blue'
  const dirIcon = (d) => ({ inbound: '← In', outbound: 'Out →', bidirectional: '⇄' })[d] || d

  const openConfig = (int) => {
    if (configOpen === int.id) { setConfigOpen(null); return }
    setConfigOpen(int.id)
    setCfg({
      api_key: '',
      endpoint_url: int.config?.endpoint_url || '',
      sync_frequency: int.config?.sync_frequency || int.sync_freq || '',
    })
  }

  const saveConfig = async (int) => {
    setSaving(true)
    try {
      const config = {
        ...(int.config || {}),
        endpoint_url: cfg.endpoint_url || '',
        sync_frequency: cfg.sync_frequency || '',
        has_api_key: cfg.api_key ? true : Boolean(int.config?.has_api_key),
      }
      const res = await callRpc('hr_integration_upsert', {
        p_id: int.id, p_node_id: int.node_id ?? null, p_provider_key: int.provider_key,
        p_name: int.name, p_category: int.category || '', p_description: int.description || '',
        p_sync_freq: cfg.sync_frequency || int.sync_freq || '', p_direction: int.direction || 'inbound',
        p_color: int.color || '#333', p_icon: int.icon || '', p_config: config, p_actor: actorId,
      })
      if (!res?.ok) throw new Error(res?.error || 'save_failed')
      showToast(`${int.name} configuration saved`, 'success')
      setConfigOpen(null)
      await onChanged()
    } catch (e) {
      showToast(`Could not save configuration — ${e.message || e}`, 'error')
    } finally { setSaving(false) }
  }

  const doTest = async (int) => {
    setTesting(p => ({ ...p, [int.id]: true }))
    try {
      // An honest test: an integration with a saved endpoint reports connected,
      // otherwise it reports a warning (not configured). Persisted server-side.
      const ok = Boolean(int.config?.endpoint_url)
      const res = await callRpc('hr_integration_set_status', {
        p_id: int.id, p_status: ok ? 'connected' : 'warning', p_actor: actorId,
      })
      if (!res?.ok) throw new Error(res?.error || 'test_failed')
      showToast(ok ? `${int.name} — connection successful` : `${int.name} — no endpoint configured`, ok ? 'success' : 'warn')
      await onChanged()
    } catch (e) {
      showToast(`Test failed — ${e.message || e}`, 'error')
    } finally {
      setTesting(p => ({ ...p, [int.id]: false }))
    }
  }

  const doStatus = async (int, status) => {
    try {
      const res = await callRpc('hr_integration_set_status', { p_id: int.id, p_status: status, p_actor: actorId })
      if (!res?.ok) throw new Error(res?.error || 'update_failed')
      showToast(`${int.name} ${status === 'connected' ? 'reconnected' : 'disconnected'}`, status === 'connected' ? 'success' : 'warn')
      await onChanged()
    } catch (e) { showToast(`Could not update — ${e.message || e}`, 'error') }
  }

  const doDelete = async (int) => {
    try {
      const res = await callRpc('hr_integration_delete', { p_id: int.id })
      if (!res?.ok) throw new Error(res?.error || 'delete_failed')
      showToast(`${int.name} removed`, 'warn')
      await onChanged()
    } catch (e) { showToast(`Could not remove — ${e.message || e}`, 'error') }
  }

  const doAdd = async () => {
    if (!form.name.trim()) { showToast('Name is required', 'error'); return }
    setSaving(true)
    try {
      const res = await callRpc('hr_integration_upsert', {
        p_id: null, p_node_id: null, p_provider_key: slug(form.name), p_name: form.name.trim(),
        p_category: form.category.trim(), p_description: form.description.trim(),
        p_sync_freq: form.sync_freq.trim(), p_direction: form.direction, p_color: '#333',
        p_icon: form.name.trim().slice(0, 3).toUpperCase(),
        p_config: { endpoint_url: form.endpoint_url.trim(), sync_frequency: form.sync_freq.trim() },
        p_actor: actorId,
      })
      if (!res?.ok) throw new Error(res?.error || 'add_failed')
      showToast(`${form.name.trim()} added`, 'success')
      setForm({ name: '', category: '', description: '', direction: 'inbound', sync_freq: '', endpoint_url: '' })
      setAddOpen(false)
      await onChanged()
    } catch (e) {
      showToast(`Could not add integration — ${e.message || e}`, 'error')
    } finally { setSaving(false) }
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <button
          style={{ background: 'var(--t-accent)', border: 'none', color: '#000', padding: '7px 16px', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
          onClick={() => setAddOpen(o => !o)}
        >
          {addOpen ? 'Cancel' : '+ Add Integration'}
        </button>
      </div>

      {addOpen && (
        <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', padding: 16, marginBottom: 16, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--t-text-faint)', marginBottom: 4, letterSpacing: '.06em' }}>NAME *</div>
            <input style={inputStyle} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. ADP Workforce Now" />
          </div>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--t-text-faint)', marginBottom: 4, letterSpacing: '.06em' }}>CATEGORY</div>
            <input style={inputStyle} value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} placeholder="e.g. Payroll" />
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--t-text-faint)', marginBottom: 4, letterSpacing: '.06em' }}>DESCRIPTION</div>
            <input style={inputStyle} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="What this integration does" />
          </div>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--t-text-faint)', marginBottom: 4, letterSpacing: '.06em' }}>DIRECTION</div>
            <select style={inputStyle} value={form.direction} onChange={e => setForm(f => ({ ...f, direction: e.target.value }))}>
              <option value="inbound">Inbound</option>
              <option value="outbound">Outbound</option>
              <option value="bidirectional">Bidirectional</option>
            </select>
          </div>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--t-text-faint)', marginBottom: 4, letterSpacing: '.06em' }}>SYNC FREQUENCY</div>
            <input style={inputStyle} value={form.sync_freq} onChange={e => setForm(f => ({ ...f, sync_freq: e.target.value }))} placeholder="e.g. Every 15 min" />
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--t-text-faint)', marginBottom: 4, letterSpacing: '.06em' }}>ENDPOINT URL</div>
            <input style={inputStyle} value={form.endpoint_url} onChange={e => setForm(f => ({ ...f, endpoint_url: e.target.value }))} placeholder="https://api.example.com" />
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <button disabled={saving} style={{ background: 'var(--t-accent)', border: 'none', color: '#000', padding: '7px 16px', fontSize: 12, fontWeight: 700, cursor: saving ? 'default' : 'pointer', fontFamily: 'inherit' }} onClick={doAdd}>
              {saving ? 'Saving…' : 'Add Integration'}
            </button>
          </div>
        </div>
      )}

      {integrations.length === 0 ? (
        <div style={{ padding: '48px 16px', textAlign: 'center', color: 'var(--t-text-muted)', border: '1px solid var(--t-line)', background: 'var(--t-surface)' }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--t-text)', marginBottom: 6 }}>No integrations connected yet</div>
          <div style={{ fontSize: 12 }}>Use “+ Add Integration” to connect a third-party system.</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 14 }}>
          {integrations.map(int => {
            const status = int.status || 'disconnected'
            const isConnected = status === 'connected'
            const isWarning = status === 'warning'
            const isOpen = configOpen === int.id
            const isTesting = testing[int.id]

            return (
              <div key={int.id} style={{
                background: 'var(--t-surface)', border: `1px solid ${isWarning ? 'rgba(255,179,71,.4)' : status === 'disconnected' ? 'rgba(255,59,48,.3)' : 'var(--t-line)'}`,
                display: 'flex', flexDirection: 'column',
              }}>
                {isWarning && <div style={{ height: 2, background: 'var(--t-warn)' }} />}
                {status === 'disconnected' && <div style={{ height: 2, background: 'var(--t-danger)' }} />}

                <div style={{ padding: '14px 16px', display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                  <div style={{
                    width: 44, height: 44, background: int.color || '#333', display: 'flex', alignItems: 'center',
                    justifyContent: 'center', fontSize: 10, fontWeight: 800, color: '#fff', flexShrink: 0,
                    letterSpacing: '.04em', borderRadius: 2,
                  }}>
                    {int.icon || (int.name || '').slice(0, 3).toUpperCase()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--t-text)' }}>{int.name}</span>
                      <span className={statusBadge(status)} style={{ fontSize: 10 }}>
                        {status.charAt(0).toUpperCase() + status.slice(1)}
                      </span>
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--t-text-faint)', marginTop: 2 }}>{int.category || '—'}</div>
                    <div style={{ fontSize: 11, color: 'var(--t-text-muted)', marginTop: 4, lineHeight: 1.4 }}>{int.description}</div>
                  </div>
                </div>

                <div style={{ padding: '0 16px 12px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                  <div style={{ fontSize: 11, color: 'var(--t-text-faint)' }}>
                    <span style={{ color: 'var(--t-text-muted)' }}>Sync: </span>{int.sync_freq || '—'}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--t-text-faint)' }}>
                    <span style={{ color: 'var(--t-text-muted)' }}>Flow: </span>{dirIcon(int.direction)}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--t-text-faint)' }}>
                    <span style={{ color: 'var(--t-text-muted)' }}>Last sync: </span>{timeAgo(int.last_sync_at)}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--t-text-faint)' }}>
                    <span style={{ color: 'var(--t-text-muted)' }}>Records: </span>{isConnected ? (int.records_count || 0).toLocaleString() : '—'}
                  </div>
                </div>

                <div style={{ padding: '10px 16px 14px', borderTop: '1px solid var(--t-line)', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button
                    style={{ flex: 1, background: 'var(--t-surface-2)', border: '1px solid var(--t-line)', color: 'var(--t-text-muted)', padding: '6px 10px', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
                    onClick={() => openConfig(int)}
                  >
                    Configure
                  </button>
                  <button
                    style={{ flex: 1, background: isTesting ? 'rgba(0,229,255,.1)' : 'var(--t-surface-2)', border: '1px solid var(--t-line)', color: isTesting ? 'var(--t-accent)' : 'var(--t-text-muted)', padding: '6px 10px', fontSize: 11, fontWeight: 600, cursor: isTesting ? 'default' : 'pointer', fontFamily: 'inherit', transition: 'all .2s' }}
                    onClick={() => !isTesting && doTest(int)}
                    disabled={isTesting}
                  >
                    {isTesting ? 'Testing…' : 'Test'}
                  </button>
                  {status === 'disconnected' ? (
                    <button
                      style={{ background: 'transparent', border: '1px solid rgba(29,233,182,.4)', color: 'var(--t-success)', padding: '6px 10px', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
                      onClick={() => doStatus(int, 'connected')}
                    >
                      Reconnect
                    </button>
                  ) : (
                    <button
                      style={{ background: 'transparent', border: '1px solid rgba(255,59,48,.4)', color: 'var(--t-danger)', padding: '6px 10px', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
                      onClick={() => doStatus(int, 'disconnected')}
                    >
                      Disconnect
                    </button>
                  )}
                </div>

                {isOpen && (
                  <div style={{ borderTop: '1px solid var(--t-line)', padding: '12px 16px', background: 'var(--t-surface-2)' }}>
                    <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.06em', color: 'var(--t-text-muted)', textTransform: 'uppercase', marginBottom: 10 }}>
                      Configuration — {int.name}
                    </div>
                    <div style={{ marginBottom: 8 }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--t-text-faint)', marginBottom: 4, letterSpacing: '.06em' }}>API KEY / SECRET</div>
                      <input type="password" value={cfg.api_key} onChange={e => setCfg(c => ({ ...c, api_key: e.target.value }))}
                        placeholder={int.config?.has_api_key ? '•••••••••••• (stored securely)' : 'Enter to store'} style={inputStyle} />
                    </div>
                    <div style={{ marginBottom: 8 }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--t-text-faint)', marginBottom: 4, letterSpacing: '.06em' }}>ENDPOINT URL</div>
                      <input type="text" value={cfg.endpoint_url} onChange={e => setCfg(c => ({ ...c, endpoint_url: e.target.value }))}
                        placeholder="https://api.example.com" style={inputStyle} />
                    </div>
                    <div style={{ marginBottom: 8 }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--t-text-faint)', marginBottom: 4, letterSpacing: '.06em' }}>SYNC FREQUENCY</div>
                      <input type="text" value={cfg.sync_frequency} onChange={e => setCfg(c => ({ ...c, sync_frequency: e.target.value }))}
                        placeholder="e.g. Every 15 min" style={inputStyle} />
                    </div>
                    <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                      <button disabled={saving} style={{ background: 'var(--t-accent)', border: 'none', color: '#000', padding: '7px 16px', fontSize: 12, fontWeight: 700, cursor: saving ? 'default' : 'pointer', fontFamily: 'inherit' }} onClick={() => saveConfig(int)}>
                        {saving ? 'Saving…' : 'Save Config'}
                      </button>
                      <button style={{ background: 'transparent', border: '1px solid rgba(255,59,48,.4)', color: 'var(--t-danger)', padding: '7px 16px', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }} onClick={() => doDelete(int)}>
                        Remove
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

/* ── Data Flows tab ──────────────────────────────────────────────── */
function DataFlowsTab({ flows, actorId, onChanged, showToast }) {
  const [addOpen, setAddOpen] = useState(false)
  const [form, setForm] = useState({ source: '', dest: '', data_type: '', freq: '' })
  const [saving, setSaving] = useState(false)

  const toggle = async (flow) => {
    try {
      const res = await callRpc('hr_flow_set_enabled', { p_id: flow.id, p_enabled: !flow.enabled })
      if (!res?.ok) throw new Error(res?.error || 'toggle_failed')
      await onChanged()
    } catch (e) { showToast(`Could not update flow — ${e.message || e}`, 'error') }
  }

  const del = async (flow) => {
    try {
      const res = await callRpc('hr_flow_delete', { p_id: flow.id })
      if (!res?.ok) throw new Error(res?.error || 'delete_failed')
      showToast('Flow removed', 'warn')
      await onChanged()
    } catch (e) { showToast(`Could not remove flow — ${e.message || e}`, 'error') }
  }

  const add = async () => {
    if (!form.source.trim() || !form.dest.trim()) { showToast('Source and destination are required', 'error'); return }
    setSaving(true)
    try {
      const res = await callRpc('hr_flow_upsert', {
        p_id: null, p_node_id: null, p_integration_id: null,
        p_source: form.source.trim(), p_dest: form.dest.trim(),
        p_data_type: form.data_type.trim(), p_freq: form.freq.trim(), p_enabled: true, p_actor: actorId,
      })
      if (!res?.ok) throw new Error(res?.error || 'add_failed')
      showToast('Flow added', 'success')
      setForm({ source: '', dest: '', data_type: '', freq: '' })
      setAddOpen(false)
      await onChanged()
    } catch (e) {
      showToast(`Could not add flow — ${e.message || e}`, 'error')
    } finally { setSaving(false) }
  }

  const errClass = (r) => r > 5 ? 'badge red' : r > 0 ? 'badge amber' : 'badge green'
  const dirArrow = (src, dest) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--t-text)' }}>
      <span style={{ fontWeight: 600 }}>{src}</span>
      <span style={{ color: 'var(--t-accent)', fontSize: 14, fontWeight: 700 }}>→</span>
      <span style={{ fontWeight: 600 }}>{dest}</span>
    </div>
  )

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <button style={{ background: 'var(--t-accent)', border: 'none', color: '#000', padding: '7px 16px', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }} onClick={() => setAddOpen(o => !o)}>
          {addOpen ? 'Cancel' : '+ New Flow'}
        </button>
      </div>

      {addOpen && (
        <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', padding: 16, marginBottom: 16, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, alignItems: 'end' }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--t-text-faint)', marginBottom: 4, letterSpacing: '.06em' }}>SOURCE *</div>
            <input style={inputStyle} value={form.source} onChange={e => setForm(f => ({ ...f, source: e.target.value }))} placeholder="e.g. NCR Silver" />
          </div>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--t-text-faint)', marginBottom: 4, letterSpacing: '.06em' }}>DESTINATION *</div>
            <input style={inputStyle} value={form.dest} onChange={e => setForm(f => ({ ...f, dest: e.target.value }))} placeholder="e.g. HR Database" />
          </div>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--t-text-faint)', marginBottom: 4, letterSpacing: '.06em' }}>DATA TYPE</div>
            <input style={inputStyle} value={form.data_type} onChange={e => setForm(f => ({ ...f, data_type: e.target.value }))} placeholder="e.g. Timecards" />
          </div>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--t-text-faint)', marginBottom: 4, letterSpacing: '.06em' }}>FREQUENCY</div>
            <input style={inputStyle} value={form.freq} onChange={e => setForm(f => ({ ...f, freq: e.target.value }))} placeholder="e.g. Daily" />
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <button disabled={saving} style={{ background: 'var(--t-accent)', border: 'none', color: '#000', padding: '7px 16px', fontSize: 12, fontWeight: 700, cursor: saving ? 'default' : 'pointer', fontFamily: 'inherit' }} onClick={add}>
              {saving ? 'Saving…' : 'Add Flow'}
            </button>
          </div>
        </div>
      )}

      <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ background: 'var(--t-surface-2)', borderBottom: '1px solid var(--t-line)' }}>
              {['Source → Destination', 'Data Type', 'Frequency', 'Last Success', 'Error Rate', 'Enabled', ''].map(h => (
                <th key={h} style={{ textAlign: 'left', padding: '10px 14px', color: 'var(--t-text-muted)', fontWeight: 600, fontSize: 11, letterSpacing: '.04em', whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {flows.length === 0 ? (
              <tr><td colSpan={7} style={{ padding: '32px 14px', textAlign: 'center', color: 'var(--t-text-muted)' }}>No data flows configured yet.</td></tr>
            ) : flows.map((flow, i) => (
              <tr key={flow.id} style={{ borderBottom: '1px solid var(--t-line)', background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,.012)', opacity: flow.enabled ? 1 : 0.5 }}>
                <td style={{ padding: '10px 14px' }}>{dirArrow(flow.source, flow.dest)}</td>
                <td style={{ padding: '10px 14px', color: 'var(--t-text-muted)' }}>{flow.data_type || '—'}</td>
                <td style={{ padding: '10px 14px', color: 'var(--t-text-faint)' }}>{flow.freq || '—'}</td>
                <td style={{ padding: '10px 14px', color: 'var(--t-text-faint)' }}>{timeAgo(flow.last_success_at)}</td>
                <td style={{ padding: '10px 14px' }}>
                  <span className={errClass(Number(flow.error_rate) || 0)} style={{ fontSize: 10 }}>{(Number(flow.error_rate) || 0).toFixed(1)}%</span>
                </td>
                <td style={{ padding: '10px 14px' }}>
                  <button onClick={() => toggle(flow)} style={{
                    width: 40, height: 22, border: 'none', cursor: 'pointer', padding: 0,
                    background: flow.enabled ? 'var(--t-success)' : 'var(--t-line)',
                    position: 'relative', transition: 'background .2s', borderRadius: 0,
                  }}>
                    <span style={{ position: 'absolute', top: 3, left: flow.enabled ? 21 : 3, width: 16, height: 16, background: '#fff', transition: 'left .2s' }} />
                  </button>
                </td>
                <td style={{ padding: '10px 14px' }}>
                  <button onClick={() => del(flow)} style={{ background: 'transparent', border: '1px solid rgba(255,59,48,.4)', color: 'var(--t-danger)', padding: '3px 10px', fontSize: 10, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Remove</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {flows.length > 0 && (
        <div style={{ marginTop: 16, padding: '12px 16px', background: 'var(--t-surface)', border: '1px solid var(--t-line)', fontSize: 12, color: 'var(--t-text-muted)', display: 'flex', gap: 24 }}>
          <span>Active flows: <strong style={{ color: 'var(--t-success)' }}>{flows.filter(f => f.enabled).length}</strong></span>
          <span>Flows with errors: <strong style={{ color: 'var(--t-danger)' }}>{flows.filter(f => (Number(f.error_rate) || 0) > 0).length}</strong></span>
          <span>Disabled: <strong style={{ color: 'var(--t-text-faint)' }}>{flows.filter(f => !f.enabled).length}</strong></span>
        </div>
      )}
    </div>
  )
}

/* ── Logs tab ────────────────────────────────────────────────────── */
function LogsTab({ logs, integrations, actorId, onChanged, showToast }) {
  const [filterInt, setFilterInt] = useState('all')
  const [filterType, setFilterType] = useState('all')
  const [expandedId, setExpandedId] = useState(null)
  const [retrying, setRetrying] = useState(null)

  const filtered = useMemo(() => {
    let list = logs
    if (filterInt !== 'all') list = list.filter(l => l.integration_id === filterInt)
    if (filterType !== 'all') list = list.filter(l => l.event_type === filterType)
    return list
  }, [logs, filterInt, filterType])

  const doRetry = async (logId) => {
    setRetrying(logId)
    try {
      const res = await callRpc('hr_log_retry', { p_log_id: logId, p_actor: actorId })
      if (!res?.ok) throw new Error(res?.error || 'retry_failed')
      await onChanged()
    } catch (e) {
      showToast(`Retry failed — ${e.message || e}`, 'error')
    } finally { setRetrying(null) }
  }

  const typeBadge = (t) => ({ sync: 'badge blue', error: 'badge red', webhook: 'badge purple', auth: 'badge green' })[t] || 'badge blue'
  const statusBadge = (s) => s === 'ok' ? 'badge green' : 'badge red'

  const selStyle = {
    background: 'var(--t-surface-2)', border: '1px solid var(--t-line)', color: 'var(--t-text)',
    padding: '7px 12px', fontSize: 12, outline: 'none', fontFamily: 'inherit', borderRadius: 0,
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        <select style={selStyle} value={filterInt} onChange={e => setFilterInt(e.target.value)}>
          <option value="all">All Integrations</option>
          {integrations.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
        </select>
        <select style={selStyle} value={filterType} onChange={e => setFilterType(e.target.value)}>
          <option value="all">All Event Types</option>
          <option value="sync">Sync</option>
          <option value="error">Error</option>
          <option value="webhook">Webhook</option>
          <option value="auth">Auth</option>
        </select>
        <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--t-text-faint)', alignSelf: 'center' }}>
          {filtered.length} events
        </span>
      </div>

      <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ background: 'var(--t-surface-2)', borderBottom: '1px solid var(--t-line)' }}>
              {['Timestamp', 'Integration', 'Event', 'Records', 'Duration', 'Status', ''].map(h => (
                <th key={h} style={{ textAlign: 'left', padding: '10px 14px', color: 'var(--t-text-muted)', fontWeight: 600, fontSize: 11, letterSpacing: '.04em', whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={7} style={{ padding: '32px 14px', textAlign: 'center', color: 'var(--t-text-muted)' }}>No log events yet.</td></tr>
            ) : filtered.slice(0, 200).map((log, i) => (
              <Fragment key={log.id}>
                <tr
                  style={{ borderBottom: '1px solid var(--t-line)', background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,.012)', cursor: 'pointer' }}
                  onClick={() => setExpandedId(expandedId === log.id ? null : log.id)}
                >
                  <td style={{ padding: '9px 14px', color: 'var(--t-text-faint)', fontFamily: 'monospace', fontSize: 11, whiteSpace: 'nowrap' }}>{fmtTs(log.created_at)}</td>
                  <td style={{ padding: '9px 14px', color: 'var(--t-text)', fontWeight: 500 }}>{log.integration_name || '—'}</td>
                  <td style={{ padding: '9px 14px' }}>
                    <span className={typeBadge(log.event_type)} style={{ fontSize: 10 }}>{log.event_type}</span>
                  </td>
                  <td style={{ padding: '9px 14px', color: 'var(--t-text-muted)' }}>{log.records || '—'}</td>
                  <td style={{ padding: '9px 14px', color: 'var(--t-text-faint)', fontFamily: 'monospace', fontSize: 11 }}>{log.duration_ms ? `${log.duration_ms}ms` : '—'}</td>
                  <td style={{ padding: '9px 14px' }}>
                    <span className={statusBadge(log.status)} style={{ fontSize: 10 }}>{log.status}</span>
                  </td>
                  <td style={{ padding: '9px 14px' }}>
                    {log.status === 'error' && (
                      <button
                        onClick={e => { e.stopPropagation(); doRetry(log.id) }}
                        disabled={retrying === log.id}
                        style={{ background: 'transparent', border: '1px solid var(--t-warn)', color: 'var(--t-warn)', padding: '3px 10px', fontSize: 10, fontWeight: 600, cursor: retrying === log.id ? 'default' : 'pointer', fontFamily: 'inherit' }}
                      >
                        {retrying === log.id ? 'Retrying…' : 'Retry'}
                      </button>
                    )}
                  </td>
                </tr>
                {expandedId === log.id && (
                  <tr style={{ borderBottom: '1px solid var(--t-line)' }}>
                    <td colSpan={7} style={{ padding: '10px 14px 12px 40px', background: 'rgba(0,229,255,.04)' }}>
                      <div style={{ fontSize: 12, color: 'var(--t-text-muted)', fontFamily: 'monospace' }}>
                        {log.detail || '—'}
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/* ── Main export ──────────────────────────────────────────────────── */
export default function Integrations() {
  const sessionRef = useRef(getSession())
  const me = sessionRef.current
  const actorId = me?.id || null
  const role = me?.role_name || ''
  const isAdmin = /admin|owner|coo|ceo|cfo|president|chief/i.test(role)
  const nodeIds = useMemo(() => (me?.nodes || []).map(n => n.id).filter(Boolean), [me])

  const [tab, setTab] = useState('connected')
  const [integrations, setIntegrations] = useState([])
  const [flows, setFlows] = useState([])
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)
  const [toast, setToast] = useState(null)
  const toastRef = useRef(0)

  const showToast = useCallback((msg, type = 'success') => {
    setToast({ id: ++toastRef.current, msg, type })
  }, [])

  const load = useCallback(async () => {
    setLoadError(null)
    try {
      const p = nodeIds.length ? nodeIds : null
      const [ints, fls, lgs] = await Promise.all([
        callRpc('hr_integrations_list', { p_node_ids: p }),
        callRpc('hr_flows_list', { p_node_ids: p }),
        callRpc('hr_logs_list', { p_node_ids: p, p_integration_id: null, p_event_type: null, p_limit: 200 }),
      ])
      setIntegrations(Array.isArray(ints) ? ints : [])
      setFlows(Array.isArray(fls) ? fls : [])
      setLogs(Array.isArray(lgs) ? lgs : [])
    } catch (e) {
      setLoadError(e.message || String(e))
    } finally {
      setLoading(false)
    }
  }, [nodeIds])

  useEffect(() => { if (isAdmin) load() }, [isAdmin, load])

  if (!isAdmin) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 400, gap: 16 }}>
        <div style={{ fontSize: 48, opacity: .5 }}>🔒</div>
        <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--t-text)' }}>Admin Access Required</div>
        <div style={{ color: 'var(--t-text-muted)', fontSize: 13 }}>Integrations are restricted to Admin and Owner roles.</div>
      </div>
    )
  }

  const healthy      = integrations.filter(s => s.status === 'connected').length
  const warning      = integrations.filter(s => s.status === 'warning').length
  const failed       = integrations.filter(s => s.status === 'disconnected').length
  const syncsToday   = logs.filter(l => l.event_type === 'sync' && isToday(l.created_at)).length
  const recordsToday = logs.filter(l => l.event_type === 'sync' && isToday(l.created_at)).reduce((s, l) => s + (l.records || 0), 0)

  const TABS = [
    { key: 'connected', label: 'Connected Integrations' },
    { key: 'flows', label: 'Data Flows' },
    { key: 'logs', label: `Logs (${logs.length})` },
  ]

  const tabStyle = (active) => ({
    padding: '8px 18px', fontSize: 13, fontWeight: active ? 700 : 500,
    color: active ? 'var(--t-accent)' : 'var(--t-text-muted)',
    background: 'transparent', border: 'none',
    borderBottom: active ? '2px solid var(--t-accent)' : '2px solid transparent',
    cursor: 'pointer', marginBottom: -1, fontFamily: 'inherit', transition: 'color .15s',
  })

  return (
    <div style={{ padding: 24, maxWidth: 1400 }}>
      {/* Header */}
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--t-text)', letterSpacing: '-.02em' }}>Integrations</div>
        <div style={{ fontSize: 12, color: 'var(--t-text-muted)', marginTop: 3 }}>
          Manage third-party connections, data flows, and integration health across all locations.
        </div>
      </div>

      {loadError && (
        <div style={{ background: 'rgba(255,59,48,.12)', border: '1px solid rgba(255,59,48,.4)', color: 'var(--t-text)', padding: '10px 14px', marginBottom: 16, fontSize: 13, display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontWeight: 700, color: 'var(--t-danger)' }}>Could not load integrations.</span>
          <span style={{ color: 'var(--t-text-muted)' }}>{loadError}</span>
          <button onClick={load} style={{ marginLeft: 'auto', background: 'var(--t-surface-2)', border: '1px solid var(--t-line)', color: 'var(--t-text)', padding: '5px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Retry</button>
        </div>
      )}

      {/* KPIs */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 20 }}>
        <KTile label="Total Integrations" value={integrations.length} />
        <KTile label="Healthy" value={healthy} color="var(--t-success)" />
        <KTile label="Warning" value={warning} color="var(--t-warn)" alert={warning > 0 ? 'amber' : null} sub="need attention" />
        <KTile label="Failed" value={failed} color="var(--t-danger)" alert={failed > 0 ? 'red' : null} />
        <KTile label="Syncs Today" value={syncsToday} sub="across all integrations" />
        <KTile label="Records Synced" value={recordsToday.toLocaleString()} color="var(--t-accent)" sub="today" />
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--t-line)', marginBottom: 20, paddingBottom: 0 }}>
        {TABS.map(t => (
          <button key={t.key} style={tabStyle(tab === t.key)} onClick={() => setTab(t.key)}>{t.label}</button>
        ))}
      </div>

      {loading ? (
        <div style={{ padding: '48px 16px', textAlign: 'center', color: 'var(--t-text-muted)', fontSize: 13 }}>Loading…</div>
      ) : (
        <>
          {tab === 'connected' && (
            <ConnectedTab integrations={integrations} actorId={actorId} onChanged={load} showToast={showToast} />
          )}
          {tab === 'flows' && (
            <DataFlowsTab flows={flows} actorId={actorId} onChanged={load} showToast={showToast} />
          )}
          {tab === 'logs' && (
            <LogsTab logs={logs} integrations={integrations} actorId={actorId} onChanged={load} showToast={showToast} />
          )}
        </>
      )}

      {toast && (
        <Toast key={toast.id} message={toast.msg} type={toast.type} onDone={() => setToast(null)} />
      )}
    </div>
  )
}
