// AIAdvisor.jsx — reusable AI recommendations panel. Renders the role-routed,
// prioritized recommendations from lib/aiAdvisor over LIVE data. The AI monitors
// and recommends; a human approves every action (nothing auto-executes).
import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { ADVISOR_ROLES } from '../lib/aiAdvisor.js'

const SEV = {
  crit: { c: 'var(--t-danger)', label: 'CRITICAL', bg: 'rgba(255,59,48,0.08)' },
  warn: { c: 'var(--t-warn)', label: 'ACTION', bg: 'rgba(255,149,0,0.07)' },
  info: { c: 'var(--t-accent)', label: 'ADVISORY', bg: 'rgba(0,229,255,0.06)' },
}
const DISMISS_KEY = 'vip_ai_dismissed'

export default function AIAdvisor({ recommendations = [], role, defaultRole = 'All', title = 'AI Operations Advisor', compact = false }) {
  const nav = useNavigate()
  const [roleFilter, setRoleFilter] = useState(defaultRole)
  const [dismissed, setDismissed] = useState(() => { try { return JSON.parse(localStorage.getItem(DISMISS_KEY) || '[]') } catch { return [] } })

  const dismiss = (id) => { const next = [...new Set([...dismissed, id])]; setDismissed(next); try { localStorage.setItem(DISMISS_KEY, JSON.stringify(next)) } catch {} }

  const shown = useMemo(() => recommendations.filter(r => {
    if (dismissed.includes(r.id)) return false
    if (roleFilter !== 'All' && !(r.audience || []).includes(roleFilter)) return false
    return true
  }), [recommendations, dismissed, roleFilter])

  const counts = useMemo(() => ({
    crit: shown.filter(r => r.severity === 'crit').length,
    warn: shown.filter(r => r.severity === 'warn').length,
    info: shown.filter(r => r.severity === 'info').length,
  }), [shown])

  return (
    <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', marginBottom: 16 }}>
      {/* header */}
      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--t-line)', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', background: 'linear-gradient(135deg, rgba(0,229,255,0.06), transparent)' }}>
        <span style={{ fontSize: 18 }}>🧠</span>
        <div style={{ flex: 1, minWidth: 180 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--t-text)', letterSpacing: '-.2px' }}>{title}</div>
          <div style={{ fontSize: 11, color: 'var(--t-text-muted)' }}>Monitoring every shift, location & workflow · you approve, AI never acts alone</div>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {counts.crit > 0 && <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--t-danger)', border: '1px solid var(--t-danger)', padding: '2px 7px' }}>{counts.crit} CRITICAL</span>}
          {counts.warn > 0 && <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--t-warn)', border: '1px solid var(--t-warn)', padding: '2px 7px' }}>{counts.warn} ACTION</span>}
          <select value={roleFilter} onChange={e => setRoleFilter(e.target.value)} style={{ padding: '5px 8px', fontSize: 11, background: 'var(--t-bg)', color: 'var(--t-text)', border: '1px solid var(--t-line)', cursor: 'pointer' }}>
            {(ADVISOR_ROLES).map(r => <option key={r} value={r}>{r === 'All' ? 'All roles' : r}</option>)}
          </select>
        </div>
      </div>

      {/* body */}
      <div style={{ maxHeight: compact ? 300 : 520, overflowY: 'auto' }}>
        {shown.length === 0 ? (
          <div style={{ padding: 24, textAlign: 'center', color: 'var(--t-success)', fontSize: 13, fontWeight: 600 }}>
            ✓ All clear — AI has no open recommendations{roleFilter !== 'All' ? ` for ${roleFilter}` : ''}.
          </div>
        ) : shown.map(r => {
          const sv = SEV[r.severity] || SEV.info
          return (
            <div key={r.id} style={{ padding: '12px 16px', borderBottom: '1px solid var(--t-line)', background: sv.bg, display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <div style={{ width: 4, alignSelf: 'stretch', background: sv.c, flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 3 }}>
                  <span style={{ fontSize: 9, fontWeight: 800, color: sv.c, letterSpacing: '.05em' }}>{sv.label}</span>
                  <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--t-text-muted)', border: '1px solid var(--t-line)', padding: '1px 6px' }}>{r.area}</span>
                  {(r.audience || []).map(a => <span key={a} style={{ fontSize: 8, fontWeight: 700, color: 'var(--t-text-faint)' }}>{a}</span>)}
                  {r.metric && <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 800, color: sv.c }}>{r.metric}</span>}
                </div>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--t-text)' }}>{r.title}</div>
                <div style={{ fontSize: 12, color: 'var(--t-text-muted)', marginTop: 3, lineHeight: 1.45 }}>{r.detail}</div>
                <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center' }}>
                  <button onClick={() => r.to && nav(r.to)} style={{ padding: '5px 12px', fontSize: 11, fontWeight: 700, cursor: 'pointer', background: sv.c, color: '#04121a', border: 'none' }}>✓ {r.action || 'Review & approve'}</button>
                  <button onClick={() => dismiss(r.id)} style={{ padding: '5px 10px', fontSize: 11, fontWeight: 600, cursor: 'pointer', background: 'transparent', color: 'var(--t-text-muted)', border: '1px solid var(--t-line)' }}>Dismiss</button>
                  {typeof r.confidence === 'number' && <span style={{ fontSize: 10, color: 'var(--t-text-faint)', marginLeft: 'auto' }}>AI confidence {Math.round(r.confidence * 100)}%</span>}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
