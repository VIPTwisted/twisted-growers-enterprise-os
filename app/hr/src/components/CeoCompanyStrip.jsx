import { useState, useEffect } from 'react'
import { hq } from '../lib/hq'

/* ── CROSS-BRAIN FEDERATION: CEO PLATFORM → HR ──────────────────────────────
   The CEO dashboard runs on its own Supabase brain (vip-ceo-platform). This
   strip reads company-wide KPIs LIVE from there via the granted, aggregate-only
   RPC `ceo_company_kpi_strip` (no PII crosses the boundary) and renders them in
   the HR Command Center's own dark theme (--t-* tokens). Mirror of the
   "WORKFORCE (LIVE)" strip the CEO dashboard shows for HR — true two-way. */

const CEO_APP = 'https://vip-ceo-platform.netlify.app'
const money = n => '$' + Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })
const num = n => Number(n || 0).toLocaleString('en-US')

export default function CeoCompanyStrip() {
  const [k, setK] = useState(null)
  const [err, setErr] = useState(false)

  useEffect(() => {
    let alive = true
    const load = async () => {
      try {
        const { data, error } = await hq.rpc('ceo_company_kpi_strip', { p_tenant: null })
        if (!alive) return
        if (error) { setErr(true); return }
        setK(data)
      } catch (e) { if (alive) setErr(true) }
    }
    load()
    const id = setInterval(load, 60000)
    return () => { alive = false; clearInterval(id) }
  }, [])

  if (err) return null // federation unavailable → show nothing, never fake

  const tiles = k ? [
    ['REVENUE (MTD)', money(k.revenue_mtd), 'var(--t-accent)'],
    ['NET INCOME (MTD)', money(k.net_income_mtd), 'var(--t-ok,#16c784)'],
    ['GROSS MARGIN', num(k.gross_margin_pct) + '%', 'var(--t-ok,#16c784)'],
    ['SALES TODAY', money(k.net_sales_today), 'var(--t-accent)'],
    ['TXNS TODAY', num(k.transactions_today), 'var(--t-text)'],
    ['AOV TODAY', money(k.aov_today), 'var(--t-text)'],
    ['ENTITIES', num(k.entities), 'var(--t-text)'],
    ['LOCATIONS', num(k.locations), 'var(--t-text)'],
    ['MLM CONSULTANTS', num(k.mlm_consultants), 'var(--t-accent)'],
    ['MLM GROSS SALES', money(k.mlm_gross_sales), 'var(--t-ok,#16c784)'],
  ] : []

  const asOf = k && k.as_of ? new Date(k.as_of).toLocaleTimeString() : ''

  return (
    <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', borderBottom: '1px solid var(--t-line)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, padding: '10px 24px', background: 'var(--t-surface-2)', borderBottom: '1px solid var(--t-line)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.08em', color: 'var(--t-accent)', textTransform: 'uppercase' }}>Company — CEO Platform</span>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--t-ok,#16c784)', display: 'inline-block' }} />
          <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--t-text-faint)' }}>{k ? 'LIVE · as of ' + asOf : 'connecting…'}</span>
        </div>
        <a href={CEO_APP} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, fontWeight: 700, color: 'var(--t-accent)', textDecoration: 'none', border: '1px solid var(--t-line)', padding: '4px 10px' }}>
          Open CEO Dashboard →
        </a>
      </div>
      {k && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(120px,1fr))', gap: 1, background: 'var(--t-line)' }}>
          {tiles.map((t, i) => (
            <div key={i} style={{ background: 'var(--t-surface)', padding: '10px 12px' }}>
              <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '.06em', color: 'var(--t-text-muted)', textTransform: 'uppercase' }}>{t[0]}</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: t[2], marginTop: 3 }}>{t[1]}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
