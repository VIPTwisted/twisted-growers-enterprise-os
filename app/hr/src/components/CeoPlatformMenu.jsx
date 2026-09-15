import { useState, useEffect } from 'react'
import { sb } from '../lib/supabase'

/* ── CROSS-APP MENU: every OS module, reachable from HR (white-label) ────────
   PLATFORM LAW: navigation comes from the governed nav registry, one schema for
   all modules. This reads the OS's own public.nav_registry through
   hr.tg_os_modules() (the enabled side-menu and launcher rows, grouped by their
   category) and links to the OS at /#view_key — same site, same sign-in.
   Nothing is hardwired here: a module the registry does not carry is not shown,
   and when the registry cannot be read the panel says so instead of showing a
   list that belongs to another company. */

const OS_HOME = '/'

export default function CeoPlatformMenu() {
  const [q, setQ] = useState('')
  const ql = q.trim().toLowerCase()
  const [groups, setGroups] = useState(null)
  const [co, setCo] = useState(null)   // the company, from its org node — never a name in this file
  const [err, setErr] = useState(null)

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const [{ data, error }, c] = await Promise.all([sb.rpc('tg_os_modules'), sb.rpc('tg_company')])
        if (!alive) return
        if (!c.error) setCo(c.data)
        if (error) { setErr(error.message || 'the nav registry could not be read'); return }
        const by = {}
        ;(Array.isArray(data) ? data : []).forEach(r => { (by[r.category] = by[r.category] || []).push([r.label, `${OS_HOME}#${r.view_key}`, r.description || '']) })
        setGroups(Object.keys(by).map(g => [g, by[g]]))
      } catch (e) { if (alive) setErr(e?.message || 'the nav registry could not be read') }
    })()
    return () => { alive = false }
  }, [])

  const total = (groups || []).reduce((a, g) => a + g[1].length, 0)
  return (
    <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', margin: '0 0 0 0' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, padding: '10px 24px', background: 'var(--t-surface-2)', borderBottom: '1px solid var(--t-line)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.06em', color: 'var(--t-accent)', textTransform: 'uppercase' }}>{co?.name || 'Company'} OS — modules</span>
          <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--t-text-faint)' }}>{err ? 'registry not read — ' + err : groups ? `${total} modules · nav registry` : 'reading…'}</span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Filter modules…" aria-label="Filter modules"
            style={{ padding: '4px 10px', fontSize: 12, background: 'var(--t-bg)', color: 'var(--t-text)', border: '1px solid var(--t-line)' }} />
          <a href={OS_HOME} style={{ fontSize: 11, fontWeight: 700, color: 'var(--t-accent)', textDecoration: 'none', border: '1px solid var(--t-line)', padding: '4px 10px' }}>Open the OS →</a>
        </div>
      </div>
      {groups && (
        <div style={{ padding: 14, display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(230px,1fr))', gap: 10, alignItems: 'start' }}>
          {groups.map(([title, items]) => {
            const shown = items.filter(([lbl]) => !ql || lbl.toLowerCase().includes(ql))
            if (!shown.length) return null
            return (
              <div key={title} style={{ background: 'var(--t-bg)', border: '1px solid var(--t-line)' }}>
                <div style={{ padding: '7px 8px', fontSize: 11, fontWeight: 800, letterSpacing: '.04em', color: 'var(--t-accent)', textTransform: 'uppercase', borderBottom: '1px solid var(--t-line)' }}>{title}</div>
                {shown.map(([lbl, href, desc]) => (
                  <a key={lbl + href} href={href} title={desc}
                    style={{ display: 'block', padding: '5px 8px', fontSize: 13, color: 'var(--t-text)', textDecoration: 'none', borderBottom: '1px solid var(--t-line)' }}>{lbl} →</a>
                ))}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
