import { useState, useEffect } from 'react'
import { sb } from '../lib/supabase'

/* ── COMPANY STRIP: THE OS MONEY SPINE → HR (white-label) ──────────────────
   The company figures on the HR CEO screen come from the OS money spine (BP-6)
   through hr.tg_company_kpi_strip(): revenue and COGS from the journal at tag
   grain, orders from Apex, bought-in and onboarding from the Control Tower.
   Same database, same sign-in, aggregates only. The strip says in words when a
   figure is indicative (the cost basis is provisional) or absent (no COGS has
   posted for the month because the tag ledger has not caught up) — it never
   shows a margin it cannot stand behind. If the read fails it says so. */

const OS_PNL = '/#pnl_live'
const money = n => '$' + Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })
const num = n => Number(n || 0).toLocaleString('en-US')
const when = s => (s ? new Date(s).toLocaleDateString('en-US', { day: 'numeric', month: 'short' }) : '—')

export default function CeoCompanyStrip() {
  const [k, setK] = useState(null)
  const [co, setCo] = useState(null)   // the company, from its org node — never a name in this file
  const [err, setErr] = useState(null)

  useEffect(() => {
    let alive = true
    const load = async () => {
      try {
        const [{ data, error }, c] = await Promise.all([sb.rpc('tg_company_kpi_strip'), sb.rpc('tg_company')])
        if (!alive) return
        if (error) { setErr(error.message || 'the money spine could not be read'); return }
        setErr(null); setK(data); if (!c.error) setCo(c.data)
      } catch (e) { if (alive) setErr(e?.message || 'the money spine could not be read') }
    }
    load()
    const id = setInterval(load, 60000)
    return () => { alive = false; clearInterval(id) }
  }, [])

  const margin = k && k.gross_margin_pct != null ? num(k.gross_margin_pct) + '%' + (k.cogs_indicative ? ' (indicative)' : '') : k && Number(k.revenue_mtd) > 0 ? 'no COGS yet' : '—'
  const tiles = k ? [
    [`REVENUE (${k.month})`, money(k.revenue_mtd), 'var(--t-accent)'],
    ['REVENUE LAST MONTH', money(k.revenue_last_month), 'var(--t-text)'],
    [`COGS (${k.month})`, k.cogs_indicative && Number(k.cogs_mtd) > 0 ? money(k.cogs_mtd) + ' (indicative)' : money(k.cogs_mtd), 'var(--t-text)'],
    ['GROSS MARGIN', margin, k.gross_margin_pct != null && Number(k.gross_margin_pct) >= 0 ? 'var(--t-ok,#16c784)' : 'var(--t-text)'],
    ['ORDERS (MTD)', num(k.orders_mtd), 'var(--t-text)'],
    ['LB SOLD (MTD)', num(k.lb_sold_mtd), 'var(--t-text)'],
    ['LABOUR POSTED (MTD)', money(k.labour_posted_mtd), 'var(--t-text)'],
    ['BOUGHT-IN OVERDUE', num(k.bought_in_overdue) + ' pkg', Number(k.bought_in_overdue) > 0 ? 'var(--t-danger,#ff5c5c)' : 'var(--t-ok,#16c784)'],
    ['BOUGHT-IN ON HAND', num(k.bought_in_on_hand_lb) + ' lb', 'var(--t-text)'],
    ['ONBOARDING OPEN', num(k.onboarding_blockers_open) + ' blockers · ' + num(k.onboarding_steps_open) + ' steps', Number(k.onboarding_blockers_open) > 0 ? 'var(--t-danger,#ff5c5c)' : 'var(--t-ok,#16c784)'],
    ['PEOPLE ACTIVE', num(k.people_active), 'var(--t-text)'],
    ['ON SHIFT TODAY', num(k.on_shift_today), 'var(--t-text)'],
  ] : []

  const asOf = k && k.as_of ? new Date(k.as_of).toLocaleTimeString() : ''

  return (
    <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', borderBottom: '1px solid var(--t-line)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, padding: '10px 24px', background: 'var(--t-surface-2)', borderBottom: '1px solid var(--t-line)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.08em', color: 'var(--t-accent)', textTransform: 'uppercase' }}>Company — {co?.name || 'the company'} · OS money spine</span>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: err ? 'var(--t-danger,#ff5c5c)' : 'var(--t-ok,#16c784)', display: 'inline-block' }} />
          <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--t-text-faint)' }}>{err ? 'NOT READ — ' + err : k ? 'LIVE · as of ' + asOf : 'reading…'}</span>
        </div>
        <a href={OS_PNL} style={{ fontSize: 11, fontWeight: 700, color: 'var(--t-accent)', textDecoration: 'none', border: '1px solid var(--t-line)', padding: '4px 10px' }}>
          Open Live P&amp;L →
        </a>
      </div>
      {k && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(120px,1fr))', gap: 1, background: 'var(--t-line)' }}>
            {tiles.map((t, i) => (
              <div key={i} style={{ background: 'var(--t-surface)', padding: '10px 12px' }}>
                <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '.06em', color: 'var(--t-text-muted)', textTransform: 'uppercase' }}>{t[0]}</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: t[2], marginTop: 3 }}>{t[1]}</div>
              </div>
            ))}
          </div>
          <div style={{ padding: '6px 24px', fontSize: 11, color: 'var(--t-text-muted)', borderTop: '1px solid var(--t-line)' }}>
            {k.how_to_read_it}{k.ledger_last_sold_at ? ` Tag ledger sold events through ${when(k.ledger_last_sold_at)}.` : ''}
          </div>
        </>
      )}
    </div>
  )
}
