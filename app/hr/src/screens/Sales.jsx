import { useState, useEffect, useCallback, useMemo } from 'react'
import { sb } from '../lib/supabase'
import { useAuth } from '../lib/auth.jsx'
import { useScope } from '../lib/scope.jsx'

// ── Formatters ────────────────────────────────────────────────────────────────
const fmt$ = (n) => `$${parseFloat(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const fmtPct = (n) => (n == null || n === '' || isNaN(n)) ? '—' : `${parseFloat(n).toFixed(1)}%`
const fmtN = (n) => Number(n || 0).toLocaleString('en-US')
const todayStr = () => new Date().toISOString().slice(0, 10)
const weekAgoStr = () => new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10)
const monthStartStr = () => todayStr().slice(0, 7) + '-01'
const quarterStartStr = () => {
  const d = new Date(); const q = Math.floor(d.getMonth() / 3)
  return `${d.getFullYear()}-${String(q * 3 + 1).padStart(2, '0')}-01`
}
const yearStartStr = () => `${new Date().getFullYear()}-01-01`
const lastYearTodayStr = () => {
  const d = new Date(); d.setFullYear(d.getFullYear() - 1)
  return d.toISOString().slice(0, 10)
}

// ── Constants ─────────────────────────────────────────────────────────────────
// Input vocabularies for the Log Sale form (not data — just picklists).
const PRODUCT_CATS = ['Vibrators', 'Lubricants', 'Lingerie', 'Games & Accessories', 'Gifts', 'Wellness', 'Couples', 'Solo', 'Cleaning', 'Other']
const TX_TYPES = ['Cash', 'Credit Card', 'Debit Card', 'Gift Card', 'Split', 'Exchange']
const TABS = ['Dashboard', 'By Employee', 'By Location', 'Voids & Refunds', 'Goals vs Actual']

// ── Inline style tokens ───────────────────────────────────────────────────────
const S = {
  th: { padding: '9px 12px', fontSize: 10, fontWeight: 700, color: 'var(--t-text-faint)', textTransform: 'uppercase', letterSpacing: '0.07em', textAlign: 'left', borderBottom: '1px solid var(--t-line)', background: '#0a0f18', whiteSpace: 'nowrap' },
  td: { padding: '9px 12px', fontSize: 12, color: 'var(--t-text)', borderBottom: '1px solid var(--t-line)', verticalAlign: 'middle' },
  panel: { background: 'var(--t-surface)', border: '1px solid var(--t-line)' },
  sec: { fontSize: 10, fontWeight: 800, color: 'var(--t-text-faint)', textTransform: 'uppercase', letterSpacing: '0.09em' },
  filterInp: { padding: '7px 10px', fontSize: 12, background: 'var(--t-surface)', border: '1px solid var(--t-line)', color: 'var(--t-text)', fontFamily: 'inherit', outline: 'none' },
  inp: { width: '100%', background: '#070b14', border: '1px solid var(--t-line)', color: 'var(--t-text)', fontSize: 13, padding: '9px 12px', fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' },
  lbl: { fontSize: 10, fontWeight: 700, color: 'var(--t-text-faint)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 5, display: 'block' },
}

// ── Live data assembly ────────────────────────────────────────────────────────
// Consumes the real get_sales_ledger payload (transactions, voids, spiff payouts,
// wide quarter/YTD aggregates, real goals) and rolls it up into the shapes the
// tabs render. No fabricated rows — empty payload yields honest zeroes.
function buildFromLive(payload, fallbackLocations) {
  const sales   = Array.isArray(payload?.sales)   ? payload.sales   : []
  const voids   = Array.isArray(payload?.voids)   ? payload.voids   : []
  const spiffs  = Array.isArray(payload?.spiffs)  ? payload.spiffs  : []
  const wide    = Array.isArray(payload?.wide)    ? payload.wide    : []
  const goalRaw = Array.isArray(payload?.goals)   ? payload.goals   : []
  const lyRevenue = Number(payload?.ly_revenue || 0)

  // Location list is REAL (from the ledger scope; falls back to session nodes).
  const locSrc = (Array.isArray(payload?.locations) && payload.locations.length)
    ? payload.locations : (fallbackLocations || [])
  const locations = locSrc.map(l => ({ id: l.id, name: l.name }))
  const locNames = locations.map(l => l.name)
  const nameById = Object.fromEntries(locations.map(l => [l.id, l.name]))
  const wideById = Object.fromEntries(wide.map(w => [w.node_id, w]))

  // Real goals keyed by location name → { daily, weekly, monthly }
  const goalsByLoc = {}
  locNames.forEach(n => { goalsByLoc[n] = { daily: null, weekly: null, monthly: null } })
  goalRaw.forEach(g => {
    const nm = nameById[g.node_id]; if (!nm) return
    if (!goalsByLoc[nm]) goalsByLoc[nm] = { daily: null, weekly: null, monthly: null }
    const p = String(g.period || ''); const t = g.target == null ? null : Number(g.target)
    if (p.startsWith('da')) goalsByLoc[nm].daily = t
    else if (p.startsWith('week') || p.startsWith('wk')) goalsByLoc[nm].weekly = t
    else if (p.startsWith('month') || p.startsWith('mo')) goalsByLoc[nm].monthly = t
  })

  const today = todayStr()

  // Real spiff payouts (this-week window + today) per person
  const spiffWeekByPerson = {}, spiffTodayByPerson = {}
  spiffs.forEach(s => {
    const d = String(s.awarded || '').slice(0, 10)
    if (d >= weekAgoStr()) spiffWeekByPerson[s.person_id] = (spiffWeekByPerson[s.person_id] || 0) + Number(s.amount || 0)
    if (d === today) spiffTodayByPerson[s.person_id] = (spiffTodayByPerson[s.person_id] || 0) + Number(s.amount || 0)
  })
  const spiffTodayTotal = Object.values(spiffTodayByPerson).reduce((a, v) => a + v, 0)

  // ── Rollup: per-rep stats ──
  const repMap = {}
  sales.forEach(s => {
    if (!repMap[s.person_id]) {
      repMap[s.person_id] = {
        person_id: s.person_id, name: s.rep_name || 'Unknown',
        node_id: s.node_id, node_name: s.location_name,
        role: s.role || '—',
        today: 0, today_tx: 0, today_items: 0,
        week: 0, week_tx: 0, month: 0, month_tx: 0,
        total: 0, total_tx: 0, total_items: 0,
        upsell_count: 0, void_count: 0, refund_amount: 0,
        spiff: 0,
      }
    }
    const r = repMap[s.person_id]
    const amt = Number(s.amount || 0), items = Number(s.items || 0)
    const d = String(s.sale_date || '').slice(0, 10)
    r.total += amt; r.total_tx += 1; r.total_items += items
    if (s.upsell) r.upsell_count += 1
    if (d === today) { r.today += amt; r.today_tx += 1; r.today_items += items }
    if (d >= weekAgoStr()) { r.week += amt; r.week_tx += 1 }
    if (d >= monthStartStr()) { r.month += amt; r.month_tx += 1 }
  })
  voids.forEach(v => {
    if (repMap[v.person_id]) {
      repMap[v.person_id].void_count += 1
      repMap[v.person_id].refund_amount += Number(v.amount || 0)
    }
  })
  const reps = Object.values(repMap).map(r => ({
    ...r,
    today: parseFloat(r.today.toFixed(2)),
    week: parseFloat(r.week.toFixed(2)),
    month: parseFloat(r.month.toFixed(2)),
    total: parseFloat(r.total.toFixed(2)),
    avg_ticket: r.total_tx > 0 ? parseFloat((r.total / r.total_tx).toFixed(2)) : 0,
    items_per_tx: r.total_tx > 0 ? parseFloat((r.total_items / r.total_tx).toFixed(1)) : 0,
    upsell_pct: r.total_tx > 0 ? parseFloat(((r.upsell_count / r.total_tx) * 100).toFixed(1)) : 0,
    void_rate: r.total_tx > 0 ? parseFloat(((r.void_count / (r.total_tx + r.void_count)) * 100).toFixed(1)) : 0,
    spiff: parseFloat((spiffWeekByPerson[r.person_id] || 0).toFixed(2)),
  }))

  // ── Rollup: per-location (today/week/month from window, quarter/YTD from server) ──
  const locMap = {}
  locations.forEach(l => {
    const dailyGoal = goalsByLoc[l.name]?.daily ?? null
    locMap[l.name] = {
      node_id: l.id, location_name: l.name,
      today: 0, week: 0, month: 0,
      quarter: Number(wideById[l.id]?.quarter || 0),
      ytd: Number(wideById[l.id]?.ytd || 0),
      today_tx: 0, week_tx: 0, month_tx: 0, goal: dailyGoal,
    }
  })
  sales.forEach(s => {
    const l = locMap[s.location_name]; if (!l) return
    const amt = Number(s.amount || 0)
    const d = String(s.sale_date || '').slice(0, 10)
    if (d === today) { l.today += amt; l.today_tx++ }
    if (d >= weekAgoStr()) { l.week += amt; l.week_tx++ }
    if (d >= monthStartStr()) { l.month += amt; l.month_tx++ }
  })
  const locationSummary = Object.values(locMap).map(l => ({
    ...l,
    today: parseFloat(l.today.toFixed(2)),
    week: parseFloat(l.week.toFixed(2)),
    month: parseFloat(l.month.toFixed(2)),
    quarter: parseFloat(l.quarter.toFixed(2)),
    ytd: parseFloat(l.ytd.toFixed(2)),
    avg_ticket: l.month_tx > 0 ? parseFloat((l.month / l.month_tx).toFixed(2)) : 0,
    vs_goal_pct: (l.goal && l.goal > 0) ? parseFloat(((l.today / l.goal) * 100).toFixed(1)) : null,
  }))

  // ── KPI totals ──
  const todaySales = sales.filter(s => String(s.sale_date).slice(0, 10) === today)
  const weekSales = sales.filter(s => String(s.sale_date).slice(0, 10) >= weekAgoStr())
  const monthSales = sales.filter(s => String(s.sale_date).slice(0, 10) >= monthStartStr())
  const sumAmt = arr => parseFloat(arr.reduce((a, s) => a + Number(s.amount || 0), 0).toFixed(2))
  const quarterTotal = parseFloat(wide.reduce((a, w) => a + Number(w.quarter || 0), 0).toFixed(2))
  const ytdTotal = parseFloat(wide.reduce((a, w) => a + Number(w.ytd || 0), 0).toFixed(2))
  const monthTotal = sumAmt(monthSales)

  const topSellerToday = [...reps].filter(r => r.today > 0).sort((a, b) => b.today - a.today)[0] || null
  const topSellerMonth = [...reps].filter(r => r.month > 0).sort((a, b) => b.month - a.month)[0] || null
  const lowestPerformer = [...reps].filter(r => r.month > 0).sort((a, b) => a.month - b.month)[0] || null

  const kpis = {
    today: sumAmt(todaySales),
    week: sumAmt(weekSales),
    month: monthTotal,
    quarter: quarterTotal,
    ytd: ytdTotal,
    vs_last_year_pct: lyRevenue > 0 ? parseFloat((((monthTotal - lyRevenue) / lyRevenue) * 100).toFixed(1)) : null,
    tx_today: todaySales.length,
    avg_ticket: todaySales.length > 0 ? parseFloat((sumAmt(todaySales) / todaySales.length).toFixed(2)) : 0,
    items_per_tx: todaySales.length > 0 ? parseFloat((todaySales.reduce((a, s) => a + Number(s.items || 0), 0) / todaySales.length).toFixed(1)) : 0,
    void_rate_pct: todaySales.length > 0 ? parseFloat(((voids.filter(v => String(v.void_date).slice(0, 10) === today).length / todaySales.length) * 100).toFixed(1)) : 0,
    refund_today: sumAmt(voids.filter(v => String(v.void_date).slice(0, 10) === today)),
    conversion_rate: null, // no foot-traffic source — honest '—'
    top_seller_today: topSellerToday,
    top_seller_month: topSellerMonth,
    lowest_performer: lowestPerformer,
    spiff_today: parseFloat(spiffTodayTotal.toFixed(2)),
    upsell_rate: todaySales.length > 0 ? parseFloat(((todaySales.filter(s => s.upsell).length / todaySales.length) * 100).toFixed(1)) : 0,
  }

  // ── Hourly data (today) ──
  const hourlyData = []
  for (let h = 10; h <= 20; h++) {
    const hourSales = todaySales.filter(s => parseInt(String(s.sale_date).slice(11, 13)) === h)
    hourlyData.push({ hour: h, label: h > 12 ? `${h - 12}pm` : h === 12 ? '12pm' : `${h}am`, amount: sumAmt(hourSales), tx: hourSales.length })
  }

  // ── Hot products (this month by category) ──
  const catTotals = {}
  monthSales.forEach(s => {
    const cat = s.category || 'Other'
    if (!catTotals[cat]) catTotals[cat] = { category: cat, revenue: 0, units: 0, tx: 0 }
    catTotals[cat].revenue += Number(s.amount || 0)
    catTotals[cat].units += Number(s.items || 0)
    catTotals[cat].tx += 1
  })
  const hotProducts = Object.values(catTotals).sort((a, b) => b.revenue - a.revenue).map(p => ({
    ...p, revenue: parseFloat(p.revenue.toFixed(2)),
  }))

  // ── Last 4 weeks goal attainment (real weekly goals) ──
  const goalHistory = []
  for (let wk = 3; wk >= 0; wk--) {
    const wkStart = new Date(Date.now() - (wk * 7 + 6) * 86400000).toISOString().slice(0, 10)
    const wkEnd = new Date(Date.now() - wk * 7 * 86400000).toISOString().slice(0, 10)
    const wkLabel = `Wk -${wk}`
    locNames.forEach(loc => {
      const locSales = sales.filter(s => s.location_name === loc && String(s.sale_date).slice(0, 10) >= wkStart && String(s.sale_date).slice(0, 10) <= wkEnd)
      const actual = sumAmt(locSales)
      const goal = goalsByLoc[loc]?.weekly ?? null
      goalHistory.push({ week: wkLabel, location: loc, actual: parseFloat(actual.toFixed(2)), goal, pct: (goal && goal > 0) ? parseFloat(((actual / goal) * 100).toFixed(1)) : null })
    })
  }

  return { sales, voids, reps, locationSummary, kpis, hourlyData, hotProducts, goalHistory, locations, locNames, goalsByLoc }
}

// ── UI Components ─────────────────────────────────────────────────────────────
function KPICard({ label, value, sub, color = 'var(--t-text)', small }) {
  return (
    <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', padding: small ? '10px 14px' : '14px 18px', flex: 1, minWidth: small ? 110 : 130 }}>
      <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--t-text-faint)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 5 }}>{label}</div>
      <div style={{ fontSize: small ? 16 : 22, fontWeight: 800, color, lineHeight: 1, marginBottom: sub ? 3 : 0 }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: 'var(--t-text-muted)', marginTop: 2 }}>{sub}</div>}
    </div>
  )
}

function BadgeEl({ text, color }) {
  const map = {
    green:  { bg: 'rgba(42,214,160,0.12)', color: '#2ad6a0', border: 'rgba(42,214,160,0.3)' },
    amber:  { bg: 'rgba(255,184,0,0.12)',  color: '#ffb800', border: 'rgba(255,184,0,0.3)' },
    red:    { bg: 'rgba(255,77,125,0.12)', color: '#ff4d7d', border: 'rgba(255,77,125,0.3)' },
    blue:   { bg: 'rgba(41,121,255,0.12)', color: '#2979ff', border: 'rgba(41,121,255,0.3)' },
    purple: { bg: 'rgba(124,77,255,0.12)', color: '#7c4dff', border: 'rgba(124,77,255,0.3)' },
    cyan:   { bg: 'rgba(0,229,255,0.12)',  color: '#00e5ff', border: 'rgba(0,229,255,0.3)' },
  }
  const c = map[color] || map.blue
  return (
    <span style={{ display: 'inline-block', fontSize: 9, fontWeight: 800, padding: '2px 7px', background: c.bg, color: c.color, border: `1px solid ${c.border}`, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{text}</span>
  )
}

function GoalBar({ pct, showLabel = true }) {
  const p = (pct == null || isNaN(pct)) ? 0 : Number(pct)
  const capped = Math.min(p, 100)
  const color = p >= 100 ? '#2ad6a0' : p >= 75 ? '#ffb800' : '#ff4d7d'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ flex: 1, height: 4, background: 'var(--t-line)', position: 'relative' }}>
        <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: `${capped}%`, background: color, transition: 'width 0.4s' }} />
      </div>
      {showLabel && <span style={{ fontSize: 11, fontWeight: 700, color, minWidth: 42, textAlign: 'right' }}>{fmtPct(pct)}</span>}
    </div>
  )
}

function SectionHeader({ label, children }) {
  return (
    <div style={{ padding: '14px 18px 12px', borderBottom: '1px solid var(--t-line)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
      <div style={S.sec}>{label}</div>
      {children}
    </div>
  )
}

function EmptyRow({ cols, msg = 'No data available' }) {
  return <tr><td colSpan={cols} style={{ ...S.td, textAlign: 'center', color: 'var(--t-text-faint)', padding: 32 }}>{msg}</td></tr>
}

// ── Tab: Sales Dashboard ──────────────────────────────────────────────────────
function TabDashboard({ data, dateFrom, setDateFrom, dateTo, setDateTo, locFilter, setLocFilter, roleGate }) {
  const { isManager: isMgr, isKH, canSeeDollars } = roleGate || { isManager: true, isKH: false, canSeeDollars: true }
  const { sales, reps, locationSummary, kpis, hourlyData, hotProducts } = data
  const today = todayStr()

  const setRange = (preset) => {
    if (preset === 'today') { setDateFrom(today); setDateTo(today) }
    if (preset === 'week')  { setDateFrom(weekAgoStr()); setDateTo(today) }
    if (preset === 'month') { setDateFrom(monthStartStr()); setDateTo(today) }
  }

  const filteredSales = useMemo(() => sales.filter(s => {
    const d = s.sale_date.slice(0, 10)
    if (locFilter !== 'all' && s.location_name !== locFilter) return false
    if (dateFrom && d < dateFrom) return false
    if (dateTo && d > dateTo) return false
    return true
  }), [sales, locFilter, dateFrom, dateTo])

  const totalFiltered = filteredSales.reduce((a, s) => a + s.amount, 0)
  const sortedReps = [...reps].sort((a, b) => b.week - a.week)
  const maxHourly = Math.max(...hourlyData.map(h => h.amount), 1)

  return (
    <div>
      {/* Date range + location filters */}
      <div style={{ ...S.panel, marginBottom: 16, padding: '12px 16px', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ ...S.sec, marginBottom: 0 }}>Period</div>
        {[['today', 'Today'], ['week', 'This Week'], ['month', 'Month']].map(([k, l]) => (
          <button key={k} onClick={() => setRange(k)} style={{ padding: '5px 12px', fontSize: 11, fontWeight: 700, background: 'var(--t-surface)', border: '1px solid var(--t-line)', color: 'var(--t-text-muted)', cursor: 'pointer', fontFamily: 'inherit' }}>{l}</button>
        ))}
        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={S.filterInp} />
        <span style={{ color: 'var(--t-text-faint)', fontSize: 11 }}>→</span>
        <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} style={S.filterInp} />
        <div style={{ display: 'flex', gap: 6 }}>
          {['all', ...data.locNames].map(loc => (
            <button key={loc} onClick={() => setLocFilter(loc)} style={{
              padding: '5px 11px', fontSize: 11, fontWeight: 700,
              background: locFilter === loc ? '#00e5ff' : 'var(--t-surface)',
              border: `1px solid ${locFilter === loc ? '#00e5ff' : 'var(--t-line)'}`,
              color: locFilter === loc ? '#070b14' : 'var(--t-text-muted)',
              cursor: 'pointer', fontFamily: 'inherit',
            }}>{loc === 'all' ? 'All' : loc}</button>
          ))}
        </div>
        <span style={{ fontSize: 11, color: 'var(--t-text-faint)', marginLeft: 'auto' }}>
          {filteredSales.length} transactions{isMgr ? ` · ${fmt$(totalFiltered)}` : ''}
        </span>
      </div>

      {/* Revenue cards per location */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12, marginBottom: 20 }}>
        {locationSummary.map(loc => {
          const locFiltered = filteredSales.filter(s => s.location_name === loc.location_name)
          const amt = locFiltered.reduce((a, s) => a + s.amount, 0)
          const lastWeekAmt = sales.filter(s => s.location_name === loc.location_name && s.sale_date.slice(0, 10) >= new Date(Date.now() - 13 * 86400000).toISOString().slice(0, 10) && s.sale_date.slice(0, 10) < weekAgoStr()).reduce((a, s) => a + s.amount, 0)
          const trendPct = lastWeekAmt > 0 ? ((amt - lastWeekAmt) / lastWeekAmt) * 100 : 0
          const locTx = locFiltered.length
          const avgTicket = locTx > 0 ? amt / locTx : 0
          return (
            <div key={loc.node_id} style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', padding: 18 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--t-text)' }}>{loc.location_name}</div>
                <span style={{ fontSize: 11, fontWeight: 700, color: trendPct >= 0 ? '#2ad6a0' : '#ff4d7d' }}>
                  {trendPct >= 0 ? '+' : ''}{fmtPct(trendPct)} vs prior
                </span>
              </div>
              <div style={{ fontSize: 26, fontWeight: 900, color: '#00e5ff', marginBottom: 4 }}>{isMgr ? fmt$(amt) : canSeeDollars ? gatedDollar(amt, data.goalsByLoc[loc.location_name]?.daily || 0, roleGate) : '—'}</div>
              <div style={{ display: 'flex', gap: 18, marginTop: 8 }}>
                <div><div style={{ fontSize: 9, color: 'var(--t-text-faint)', fontWeight: 700, textTransform: 'uppercase' }}>Transactions</div><div style={{ fontSize: 13, fontWeight: 700, color: 'var(--t-text)' }}>{locTx}</div></div>
                <div><div style={{ fontSize: 9, color: 'var(--t-text-faint)', fontWeight: 700, textTransform: 'uppercase' }}>Avg Ticket</div><div style={{ fontSize: 13, fontWeight: 700, color: 'var(--t-text)' }}>{isMgr ? fmt$(avgTicket) : '—'}</div></div>
                <div><div style={{ fontSize: 9, color: 'var(--t-text-faint)', fontWeight: 700, textTransform: 'uppercase' }}>vs Goal</div><div style={{ fontSize: 13, fontWeight: 700, color: loc.vs_goal_pct >= 100 ? '#2ad6a0' : '#ffb800' }}>{fmtPct(loc.vs_goal_pct)}</div></div>
              </div>
              <div style={{ marginTop: 10 }}><GoalBar pct={loc.vs_goal_pct} /></div>
            </div>
          )
        })}
      </div>

      {/* Leaderboard + Hourly side by side */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 16, marginBottom: 20 }}>
        {/* Leaderboard */}
        <div style={S.panel}>
          <SectionHeader label="Employee Leaderboard — This Week" />
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>{['Rank', 'Employee', 'Location', 'Transactions', 'Revenue', 'Avg Ticket', 'Items/Txn', 'Upsell %', 'Rank'].map(h => <th key={h} style={S.th}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {sortedReps.length === 0 ? <EmptyRow cols={9} /> : sortedReps.map((rep, i) => (
                  <tr key={rep.person_id} style={{ background: i === 0 ? 'rgba(255,184,0,0.04)' : i === 1 ? 'rgba(41,121,255,0.03)' : i === 2 ? 'rgba(124,77,255,0.03)' : i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.013)' }}>
                    <td style={{ ...S.td, fontWeight: 800, color: '#00e5ff', textAlign: 'center' }}>#{i + 1}</td>
                    <td style={{ ...S.td, fontWeight: 700 }}>{rep.name}</td>
                    <td style={{ ...S.td, fontSize: 11, color: 'var(--t-text-muted)' }}>{rep.node_name}</td>
                    <td style={{ ...S.td, color: 'var(--t-text-muted)' }}>{rep.week_tx}</td>
                    <td style={{ ...S.td, fontWeight: 700, color: '#2ad6a0' }}>{isMgr ? fmt$(rep.week) : isKH ? `#${sortedReps.indexOf(rep) + 1}` : '—'}</td>
                    <td style={{ ...S.td }}>{isMgr ? fmt$(rep.avg_ticket) : '—'}</td>
                    <td style={{ ...S.td, color: 'var(--t-text-muted)' }}>{rep.items_per_tx}</td>
                    <td style={{ ...S.td }}><span style={{ color: rep.upsell_pct >= 35 ? '#2ad6a0' : rep.upsell_pct >= 20 ? '#ffb800' : '#ff4d7d', fontWeight: 700 }}>{fmtPct(rep.upsell_pct)}</span></td>
                    <td style={{ ...S.td }}>
                      {i === 0 ? <BadgeEl text="GOLD" color="amber" /> : i === 1 ? <BadgeEl text="SILVER" color="blue" /> : i === 2 ? <BadgeEl text="BRONZE" color="purple" /> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Hourly trend */}
        <div style={S.panel}>
          <SectionHeader label="Hourly — Today" />
          <div style={{ padding: '14px 18px' }}>
            {hourlyData.map(h => (
              <div key={h.hour} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 7 }}>
                <div style={{ fontSize: 10, color: 'var(--t-text-faint)', fontWeight: 700, width: 30, textAlign: 'right' }}>{h.label}</div>
                <div style={{ flex: 1, height: 14, background: 'var(--t-line)', position: 'relative' }}>
                  <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: `${(h.amount / maxHourly) * 100}%`, background: h.amount > 0 ? '#00e5ff' : 'transparent', opacity: 0.8 }} />
                </div>
                <div style={{ fontSize: 10, fontWeight: 700, color: h.amount > 0 ? '#00e5ff' : 'var(--t-text-faint)', width: 60, textAlign: 'right' }}>{h.amount > 0 ? (isMgr ? fmt$(h.amount) : '—') : '—'}</div>
                <div style={{ fontSize: 9, color: 'var(--t-text-faint)', width: 20 }}>{h.tx > 0 ? h.tx : ''}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Hot products */}
      <div style={S.panel}>
        <SectionHeader label="Top Categories — This Month" />
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>{['#', 'Category', 'Revenue', 'Units Sold', 'Transactions', 'Avg per Txn'].map(h => <th key={h} style={S.th}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {hotProducts.slice(0, 10).map((p, i) => (
                <tr key={p.category} style={{ background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.013)' }}>
                  <td style={{ ...S.td, fontWeight: 800, color: '#00e5ff', textAlign: 'center', fontSize: 11 }}>#{i + 1}</td>
                  <td style={{ ...S.td, fontWeight: 700 }}>{p.category}</td>
                  <td style={{ ...S.td, fontWeight: 700, color: '#2ad6a0' }}>{isMgr ? fmt$(p.revenue) : '—'}</td>
                  <td style={{ ...S.td, color: 'var(--t-text-muted)' }}>{fmtN(p.units)}</td>
                  <td style={{ ...S.td, color: 'var(--t-text-muted)' }}>{fmtN(p.tx)}</td>
                  <td style={{ ...S.td }}>{isMgr && p.tx > 0 ? fmt$(p.revenue / p.tx) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ── Tab: By Employee ──────────────────────────────────────────────────────────
function TabByEmployee({ data, roleGate }) {
  const { isManager: isMgr } = roleGate || { isManager: true }
  const { reps, sales } = data
  const [locF, setLocF] = useState('all')
  const [empSearch, setEmpSearch] = useState('')
  const [sortKey, setSortKey] = useState('week')
  const [sortDir, setSortDir] = useState(-1)
  const [selected, setSelected] = useState(null)

  const filtered = useMemo(() => {
    let list = [...reps]
    if (locF !== 'all') list = list.filter(r => r.node_name === locF)
    if (empSearch) list = list.filter(r => r.name.toLowerCase().includes(empSearch.toLowerCase()))
    list.sort((a, b) => sortDir * (parseFloat(b[sortKey] || 0) - parseFloat(a[sortKey] || 0)))
    return list
  }, [reps, locF, empSearch, sortKey, sortDir])

  const sort = (k) => { if (sortKey === k) setSortDir(d => -d); else { setSortKey(k); setSortDir(-1) } }
  const sIco = (k) => sortKey === k ? (sortDir === -1 ? ' ▼' : ' ▲') : ''

  const selectedSales = selected ? sales.filter(s => s.person_id === selected.person_id).sort((a, b) => b.sale_date > a.sale_date ? 1 : -1) : []

  return (
    <div style={{ display: 'grid', gridTemplateColumns: selected ? '1fr 360px' : '1fr', gap: 16 }}>
      <div>
        {/* Filters */}
        <div style={{ ...S.panel, padding: '10px 14px', marginBottom: 14, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <select value={locF} onChange={e => setLocF(e.target.value)} style={S.filterInp}>
            <option value="all">All Locations</option>
            {data.locNames.map(l => <option key={l} value={l}>{l}</option>)}
          </select>
          <input placeholder="Search employee…" value={empSearch} onChange={e => setEmpSearch(e.target.value)} style={{ ...S.filterInp, minWidth: 160 }} />
          <span style={{ fontSize: 11, color: 'var(--t-text-faint)' }}>{filtered.length} employees</span>
        </div>

        <div style={S.panel}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {[['name', 'Name'], ['node_name', 'Location'], ['week', 'Week $'], ['month', 'Month $'], ['avg_ticket', 'Avg Ticket'], ['items_per_tx', 'Items/Txn'], ['void_count', 'Voids'], ['upsell_pct', 'Upsell %'], ['spiff', 'Spiff']].map(([k, l]) => (
                    <th key={k} style={{ ...S.th, cursor: 'pointer' }} onClick={() => sort(k)}>{l}{sIco(k)}</th>
                  ))}
                  <th style={S.th}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? <EmptyRow cols={10} /> : filtered.map((rep, i) => (
                  <tr key={rep.person_id} style={{ background: selected?.person_id === rep.person_id ? 'rgba(0,229,255,0.06)' : i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.013)', cursor: 'pointer' }} onClick={() => setSelected(rep === selected ? null : rep)}>
                    <td style={{ ...S.td, fontWeight: 700 }}>{rep.name}</td>
                    <td style={{ ...S.td, fontSize: 11, color: 'var(--t-text-muted)' }}>{rep.node_name}</td>
                    <td style={{ ...S.td, fontWeight: 700, color: '#2ad6a0' }}>{isMgr ? fmt$(rep.week) : '—'}</td>
                    <td style={{ ...S.td, fontWeight: 700 }}>{isMgr ? fmt$(rep.month) : '—'}</td>
                    <td style={{ ...S.td }}>{isMgr ? fmt$(rep.avg_ticket) : '—'}</td>
                    <td style={{ ...S.td, color: 'var(--t-text-muted)' }}>{rep.items_per_tx}</td>
                    <td style={{ ...S.td }}><span style={{ color: rep.void_count > 3 ? '#ff4d7d' : 'var(--t-text)' }}>{rep.void_count}</span></td>
                    <td style={{ ...S.td }}><span style={{ color: rep.upsell_pct >= 35 ? '#2ad6a0' : rep.upsell_pct >= 20 ? '#ffb800' : '#ff4d7d', fontWeight: 700 }}>{fmtPct(rep.upsell_pct)}</span></td>
                    <td style={{ ...S.td, color: '#2ad6a0', fontWeight: 700 }}>{fmt$(rep.spiff)}</td>
                    <td style={{ ...S.td }}>
                      <button onClick={e => { e.stopPropagation(); setSelected(selected?.person_id === rep.person_id ? null : rep) }}
                        style={{ padding: '3px 10px', fontSize: 10, fontWeight: 700, background: 'transparent', border: '1px solid var(--t-line)', color: '#00e5ff', cursor: 'pointer', fontFamily: 'inherit' }}>
                        {selected?.person_id === rep.person_id ? 'Close' : 'View'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Side panel */}
      {selected && (
        <div style={{ ...S.panel, maxHeight: 700, overflowY: 'auto' }}>
          <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--t-line)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--t-text)' }}>{selected.name}</div>
              <div style={{ fontSize: 11, color: 'var(--t-text-muted)' }}>{selected.node_name} · {selected.role}</div>
            </div>
            <button onClick={() => setSelected(null)} style={{ background: 'transparent', border: 'none', color: 'var(--t-text-faint)', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>×</button>
          </div>
          <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--t-line)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {[['Today', isMgr ? fmt$(selected.today) : '—'], ['Week', isMgr ? fmt$(selected.week) : '—'], ['Month', isMgr ? fmt$(selected.month) : '—'], ['Avg Ticket', isMgr ? fmt$(selected.avg_ticket) : '—'], ['Upsell %', fmtPct(selected.upsell_pct)], ['Spiff', isMgr ? fmt$(selected.spiff) : '—']].map(([l, v]) => (
              <div key={l}>
                <div style={{ fontSize: 9, color: 'var(--t-text-faint)', fontWeight: 700, textTransform: 'uppercase', marginBottom: 2 }}>{l}</div>
                <div style={{ fontSize: 14, fontWeight: 800, color: '#00e5ff' }}>{v}</div>
              </div>
            ))}
          </div>
          <div style={{ padding: '10px 16px', fontSize: 10, fontWeight: 700, color: 'var(--t-text-faint)', textTransform: 'uppercase', letterSpacing: '0.07em', borderBottom: '1px solid var(--t-line)' }}>Recent Sales</div>
          {selectedSales.slice(0, 30).map((s, i) => (
            <div key={s.id} style={{ padding: '8px 16px', borderBottom: '1px solid var(--t-line)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.013)' }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#2ad6a0' }}>{isMgr ? fmt$(s.amount) : '—'}</div>
                <div style={{ fontSize: 10, color: 'var(--t-text-faint)' }}>{s.category || '—'} · {s.items} item{s.items !== 1 ? 's' : ''}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 10, fontFamily: 'monospace', color: 'var(--t-text-muted)' }}>{s.sale_date.slice(0, 10)}</div>
                <div style={{ fontSize: 10, color: 'var(--t-text-faint)' }}>{s.sale_date.slice(11, 16)}</div>
              </div>
            </div>
          ))}
          {selectedSales.length > 30 && <div style={{ padding: '10px 16px', fontSize: 11, color: 'var(--t-text-faint)', textAlign: 'center' }}>+{selectedSales.length - 30} more transactions</div>}
        </div>
      )}
    </div>
  )
}

// ── Tab: By Location ──────────────────────────────────────────────────────────
function TabByLocation({ data, roleGate }) {
  const { isManager: isMgr } = roleGate || { isManager: true }
  const { sales, reps, locationSummary } = data
  const [activeLoc, setActiveLoc] = useState(() => data.locNames?.[0] || '')
  useEffect(() => {
    if ((!activeLoc || !data.locNames.includes(activeLoc)) && data.locNames.length) setActiveLoc(data.locNames[0])
  }, [data.locNames, activeLoc])

  const locSales = useMemo(() => sales.filter(s => s.location_name === activeLoc), [sales, activeLoc])
  const locReps = useMemo(() => reps.filter(r => r.node_name === activeLoc).sort((a, b) => b.month - a.month), [reps, activeLoc])
  const locData = locationSummary.find(l => l.location_name === activeLoc) || {}

  // Revenue by shift (approx: morning 10-14, afternoon 14-18, close 18-21)
  const byShift = useMemo(() => {
    const shifts = { 'Opening (10am-2pm)': 0, 'Afternoon (2pm-6pm)': 0, 'Closing (6pm-9pm)': 0 }
    locSales.filter(s => s.sale_date.slice(0, 10) >= monthStartStr()).forEach(s => {
      const h = parseInt(s.sale_date.slice(11, 13))
      if (h < 14) shifts['Opening (10am-2pm)'] += s.amount
      else if (h < 18) shifts['Afternoon (2pm-6pm)'] += s.amount
      else shifts['Closing (6pm-9pm)'] += s.amount
    })
    const total = Object.values(shifts).reduce((a, v) => a + v, 0)
    return Object.entries(shifts).map(([label, amt]) => ({ label, amt: parseFloat(amt.toFixed(2)), pct: total > 0 ? parseFloat(((amt / total) * 100).toFixed(1)) : 0 }))
  }, [locSales])

  // Top categories this month
  const topCats = useMemo(() => {
    const catMap = {}
    locSales.filter(s => s.sale_date.slice(0, 10) >= monthStartStr()).forEach(s => {
      if (!catMap[s.category]) catMap[s.category] = 0
      catMap[s.category] += s.amount
    })
    return Object.entries(catMap).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([cat, amt]) => ({ cat, amt: parseFloat(amt.toFixed(2)) }))
  }, [locSales])

  // Prior period comparison (last 7 days vs prior 7)
  const currentPeriodAmt = locSales.filter(s => s.sale_date.slice(0, 10) >= weekAgoStr()).reduce((a, s) => a + s.amount, 0)
  const priorWeekStart = new Date(Date.now() - 13 * 86400000).toISOString().slice(0, 10)
  const priorPeriodAmt = locSales.filter(s => s.sale_date.slice(0, 10) >= priorWeekStart && s.sale_date.slice(0, 10) < weekAgoStr()).reduce((a, s) => a + s.amount, 0)
  const compPct = priorPeriodAmt > 0 ? ((currentPeriodAmt - priorPeriodAmt) / priorPeriodAmt) * 100 : 0

  return (
    <div>
      {/* Location tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 20 }}>
        {data.locNames.length === 0 && <span style={{ fontSize: 12, color: 'var(--t-text-faint)' }}>No locations in scope.</span>}
        {data.locNames.map(loc => (
          <button key={loc} onClick={() => setActiveLoc(loc)} style={{
            padding: '8px 20px', fontSize: 12, fontWeight: 800,
            background: activeLoc === loc ? '#00e5ff' : 'var(--t-surface)',
            border: `1px solid ${activeLoc === loc ? '#00e5ff' : 'var(--t-line)'}`,
            color: activeLoc === loc ? '#070b14' : 'var(--t-text-muted)',
            cursor: 'pointer', fontFamily: 'inherit',
          }}>{loc}</button>
        ))}
      </div>

      {/* KPI row */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
        <KPICard label="Today" value={isMgr ? fmt$(locData.today) : '—'} sub={`${locData.today_tx || 0} transactions`} color="#2ad6a0" small />
        <KPICard label="This Week" value={isMgr ? fmt$(locData.week) : '—'} sub={`${locData.week_tx || 0} transactions`} color="#00e5ff" small />
        <KPICard label="This Month" value={isMgr ? fmt$(locData.month) : '—'} color="var(--t-text)" small />
        <KPICard label="Avg Ticket" value={isMgr ? fmt$(locData.avg_ticket) : '—'} color="var(--t-text)" small />
        <KPICard label="vs Daily Goal" value={fmtPct(locData.vs_goal_pct)} color={locData.vs_goal_pct >= 100 ? '#2ad6a0' : '#ffb800'} small />
        <KPICard label="vs Prior Week" value={`${compPct >= 0 ? '+' : ''}${fmtPct(compPct)}`} color={compPct >= 0 ? '#2ad6a0' : '#ff4d7d'} small />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
        {/* Revenue by shift */}
        <div style={S.panel}>
          <SectionHeader label="Revenue by Shift — This Month" />
          <div style={{ padding: '16px 20px' }}>
            {byShift.map(sh => (
              <div key={sh.label} style={{ marginBottom: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--t-text)' }}>{sh.label}</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#2ad6a0' }}>{isMgr ? fmt$(sh.amt) : '—'}</span>
                </div>
                <GoalBar pct={sh.pct} />
              </div>
            ))}
          </div>
        </div>

        {/* Top categories */}
        <div style={S.panel}>
          <SectionHeader label="Top 5 Categories — This Month" />
          <div style={{ padding: '16px 20px' }}>
            {topCats.length === 0 ? <div style={{ color: 'var(--t-text-faint)', fontSize: 12 }}>No data</div> : topCats.map((c, i) => (
              <div key={c.cat} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: '#00e5ff', width: 18, textAlign: 'right' }}>#{i + 1}</div>
                <div style={{ flex: 1, fontSize: 12, color: 'var(--t-text)' }}>{c.cat}</div>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#2ad6a0' }}>{isMgr ? fmt$(c.amt) : '—'}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Employee contributions */}
      <div style={S.panel}>
        <SectionHeader label="Employee Contributions — This Month" />
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>{['Employee', 'Role', 'Revenue', 'Transactions', 'Avg Ticket', 'Share %', 'Upsell %'].map(h => <th key={h} style={S.th}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {locReps.length === 0 ? <EmptyRow cols={7} /> : (() => {
                const total = locReps.reduce((a, r) => a + r.month, 0)
                return locReps.map((rep, i) => (
                  <tr key={rep.person_id} style={{ background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.013)' }}>
                    <td style={{ ...S.td, fontWeight: 700 }}>{rep.name}</td>
                    <td style={{ ...S.td, fontSize: 11, color: 'var(--t-text-muted)' }}>{rep.role}</td>
                    <td style={{ ...S.td, fontWeight: 700, color: '#2ad6a0' }}>{isMgr ? fmt$(rep.month) : '—'}</td>
                    <td style={{ ...S.td, color: 'var(--t-text-muted)' }}>{rep.month_tx}</td>
                    <td style={{ ...S.td }}>{isMgr ? fmt$(rep.avg_ticket) : '—'}</td>
                    <td style={{ ...S.td }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ width: 60, height: 4, background: 'var(--t-line)', position: 'relative' }}>
                          <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: `${total > 0 ? (rep.month / total) * 100 : 0}%`, background: '#00e5ff' }} />
                        </div>
                        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--t-text-muted)' }}>{total > 0 ? fmtPct((rep.month / total) * 100) : '—'}</span>
                      </div>
                    </td>
                    <td style={{ ...S.td }}><span style={{ color: rep.upsell_pct >= 35 ? '#2ad6a0' : '#ffb800', fontWeight: 700 }}>{fmtPct(rep.upsell_pct)}</span></td>
                  </tr>
                ))
              })()}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ── Tab: Voids & Refunds ──────────────────────────────────────────────────────
function TabVoids({ data, roleGate }) {
  const { isManager: isMgr } = roleGate || { isManager: true }
  const { voids, reps } = data
  const [locF, setLocF] = useState('all')
  const [showSuspOnly, setShowSuspOnly] = useState(false)

  const filtered = useMemo(() => {
    let list = [...voids].sort((a, b) => b.void_date > a.void_date ? 1 : -1)
    if (locF !== 'all') list = list.filter(v => v.location_name === locF)
    if (showSuspOnly) list = list.filter(v => v.suspicious)
    return list
  }, [voids, locF, showSuspOnly])

  const totalVoidAmt = filtered.reduce((a, v) => a + v.amount, 0)
  const suspCount = voids.filter(v => v.suspicious).length

  // Void rate by employee
  const empVoidRates = useMemo(() => {
    const map = {}
    reps.forEach(r => { map[r.name] = { name: r.name, loc: r.node_name, total_tx: r.total_tx, voids: r.void_count, rate: r.void_rate, flagged: r.void_rate > 3 } })
    return Object.values(map).sort((a, b) => b.rate - a.rate)
  }, [reps])

  // Pattern detection: voids by hour
  const voidsByHour = useMemo(() => {
    const map = {}
    voids.forEach(v => {
      const h = parseInt(v.void_date.slice(11, 13))
      if (!map[h]) map[h] = 0
      map[h] += 1
    })
    return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 5)
  }, [voids])

  return (
    <div>
      {/* Summary KPIs */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
        <KPICard label="Total Voids" value={voids.length} sub="all time (30 days)" color="var(--t-text)" small />
        <KPICard label="Void $ Impact" value={isMgr ? fmt$(voids.reduce((a, v) => a + v.amount, 0)) : '—'} color="#ff4d7d" small />
        <KPICard label="Suspicious Flags" value={suspCount} color={suspCount > 0 ? '#ff4d7d' : '#2ad6a0'} sub={`${fmtPct((suspCount / Math.max(voids.length, 1)) * 100)} of total`} small />
        <KPICard label="Manager Approved" value={voids.filter(v => v.manager_approved).length} color="#2ad6a0" small />
        <KPICard label="Not Approved" value={voids.filter(v => !v.manager_approved).length} color="#ffb800" small />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: 16, marginBottom: 20 }}>
        {/* Void rate by employee */}
        <div style={S.panel}>
          <SectionHeader label="Void Rate by Employee">
            <BadgeEl text="&gt;3% = Suspicious" color="red" />
          </SectionHeader>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>{['Employee', 'Location', 'Total Txn', 'Voids', 'Void Rate %', 'Flag'].map(h => <th key={h} style={S.th}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {empVoidRates.filter(r => r.total_tx > 0).map((r, i) => (
                  <tr key={r.name} style={{ background: r.flagged ? 'rgba(255,77,125,0.04)' : i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.013)' }}>
                    <td style={{ ...S.td, fontWeight: 700 }}>{r.name}</td>
                    <td style={{ ...S.td, fontSize: 11, color: 'var(--t-text-muted)' }}>{r.loc}</td>
                    <td style={{ ...S.td, color: 'var(--t-text-muted)' }}>{r.total_tx}</td>
                    <td style={{ ...S.td }}>{r.voids}</td>
                    <td style={{ ...S.td, fontWeight: 700 }}><span style={{ color: r.flagged ? '#ff4d7d' : '#2ad6a0' }}>{fmtPct(r.rate)}</span></td>
                    <td style={{ ...S.td }}>{r.flagged ? <BadgeEl text="REVIEW" color="red" /> : <BadgeEl text="OK" color="green" />}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Pattern detection */}
        <div style={S.panel}>
          <SectionHeader label="Void Pattern" />
          <div style={{ padding: '14px 16px' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--t-text-faint)', textTransform: 'uppercase', marginBottom: 10 }}>Peak void hours</div>
            {voidsByHour.map(([h, count]) => {
              const hr = parseInt(h); const label = hr > 12 ? `${hr - 12}pm` : hr === 12 ? '12pm' : `${hr}am`
              return (
                <div key={h} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--t-line)', fontSize: 12 }}>
                  <span style={{ color: 'var(--t-text)' }}>{label}</span>
                  <span style={{ fontWeight: 700, color: count >= 5 ? '#ff4d7d' : '#ffb800' }}>{count} voids</span>
                </div>
              )
            })}
            <div style={{ marginTop: 14, fontSize: 10, fontWeight: 700, color: 'var(--t-text-faint)', textTransform: 'uppercase', marginBottom: 10 }}>Void rate by location</div>
            {data.locNames.map(loc => {
              const locVoids = voids.filter(v => v.location_name === loc)
              const locSalesAll = data.sales.filter(s => s.location_name === loc)
              const rate = locSalesAll.length > 0 ? (locVoids.length / (locSalesAll.length + locVoids.length)) * 100 : 0
              return (
                <div key={loc} style={{ marginBottom: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 3 }}>
                    <span style={{ color: 'var(--t-text)', fontWeight: 600 }}>{loc}</span>
                    <span style={{ fontWeight: 700, color: rate > 3 ? '#ff4d7d' : '#2ad6a0' }}>{fmtPct(rate)}</span>
                  </div>
                  <GoalBar pct={Math.min(rate * 20, 100)} showLabel={false} />
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Void log table */}
      <div style={S.panel}>
        <SectionHeader label="Void & Refund Log">
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <select value={locF} onChange={e => setLocF(e.target.value)} style={S.filterInp}>
              <option value="all">All Locations</option>
              {data.locNames.map(l => <option key={l} value={l}>{l}</option>)}
            </select>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--t-text-muted)', cursor: 'pointer' }}>
              <input type="checkbox" checked={showSuspOnly} onChange={e => setShowSuspOnly(e.target.checked)} />
              Suspicious only
            </label>
            <span style={{ fontSize: 11, color: 'var(--t-text-faint)' }}>{filtered.length} voids{isMgr ? ` · ${fmt$(totalVoidAmt)}` : ''}</span>
          </div>
        </SectionHeader>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>{['Date', 'Time', 'Employee', 'Location', 'Amount', 'Original Sale', 'Reason', 'Mgr Approved', 'Flag'].map(h => <th key={h} style={S.th}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? <EmptyRow cols={9} /> : filtered.slice(0, 200).map((v, i) => (
                <tr key={v.id} style={{ background: v.suspicious ? 'rgba(255,77,125,0.05)' : i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.013)' }}>
                  <td style={{ ...S.td, fontFamily: 'monospace', fontSize: 11, color: 'var(--t-text-muted)' }}>{v.void_date.slice(0, 10)}</td>
                  <td style={{ ...S.td, fontFamily: 'monospace', fontSize: 11, color: 'var(--t-text-faint)' }}>{v.void_date.slice(11, 16)}</td>
                  <td style={{ ...S.td, fontWeight: 700 }}>{v.rep_name}</td>
                  <td style={{ ...S.td, fontSize: 11, color: 'var(--t-text-muted)' }}>{v.location_name}</td>
                  <td style={{ ...S.td, fontWeight: 700, color: '#ff4d7d' }}>{isMgr ? fmt$(v.amount) : '—'}</td>
                  <td style={{ ...S.td, fontFamily: 'monospace', fontSize: 11, color: 'var(--t-text-faint)' }}>{v.original_sale_date.slice(0, 10)}</td>
                  <td style={{ ...S.td, fontSize: 11, maxWidth: 160 }}><span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.reason}</span></td>
                  <td style={{ ...S.td }}>{v.manager_approved ? <BadgeEl text="YES" color="green" /> : <BadgeEl text="NO" color="red" />}</td>
                  <td style={{ ...S.td }}>{v.suspicious ? <BadgeEl text="SUSPICIOUS" color="red" /> : <BadgeEl text="CLEAN" color="green" />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ── Tab: Goals vs Actual ──────────────────────────────────────────────────────
function TabGoals({ data, roleGate }) {
  const { isManager: isMgr } = roleGate || { isManager: true }
  const { sales, locationSummary, goalHistory } = data
  const [period, setPeriod] = useState('daily')

  const goalRows = useMemo(() => {
    const key = period === 'daily' ? 'daily' : period === 'weekly' ? 'weekly' : 'monthly'
    const label = period === 'daily' ? 'Today' : period === 'weekly' ? 'This Week' : 'This Month'
    const actualKey = period === 'daily' ? 'today' : period === 'weekly' ? 'week' : 'month'
    return data.locNames.map(loc => {
      const locData = locationSummary.find(l => l.location_name === loc) || {}
      const goal = data.goalsByLoc[loc]?.[key] ?? null // real goal or none
      const actual = locData[actualKey] || 0
      const gap = (goal != null) ? actual - goal : null
      const pct = (goal != null && goal > 0) ? (actual / goal) * 100 : null
      return { location: loc, period: label, goal, actual, gap, pct }
    })
  }, [locationSummary, period, data.locNames, data.goalsByLoc])

  const totalGoal = goalRows.reduce((a, r) => a + (r.goal || 0), 0)
  const totalActual = goalRows.reduce((a, r) => a + r.actual, 0)
  const hasGoals = goalRows.some(r => r.goal != null)
  const totalGap = hasGoals ? totalActual - totalGoal : null
  const totalPct = (hasGoals && totalGoal > 0) ? (totalActual / totalGoal) * 100 : null

  return (
    <div>
      {/* Period toggle */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 20 }}>
        {[['daily', 'Daily'], ['weekly', 'Weekly'], ['monthly', 'Monthly']].map(([k, l]) => (
          <button key={k} onClick={() => setPeriod(k)} style={{
            padding: '7px 18px', fontSize: 12, fontWeight: 700,
            background: period === k ? '#00e5ff' : 'var(--t-surface)',
            border: `1px solid ${period === k ? '#00e5ff' : 'var(--t-line)'}`,
            color: period === k ? '#070b14' : 'var(--t-text-muted)',
            cursor: 'pointer', fontFamily: 'inherit',
          }}>{l}</button>
        ))}
      </div>

      {/* Goals table */}
      <div style={{ ...S.panel, marginBottom: 20 }}>
        <SectionHeader label={`Goals vs Actual — ${period === 'daily' ? 'Today' : period === 'weekly' ? 'This Week' : 'This Month'}`} />
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>{['Location', 'Period', 'Goal $', 'Actual $', 'Gap $', '% to Goal', 'Progress', 'Status'].map(h => <th key={h} style={S.th}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {goalRows.length === 0 ? <EmptyRow cols={8} msg="No locations in scope" /> : goalRows.map((r, i) => (
                <tr key={r.location} style={{ background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.013)' }}>
                  <td style={{ ...S.td, fontWeight: 700 }}>{r.location}</td>
                  <td style={{ ...S.td, fontSize: 11, color: 'var(--t-text-muted)' }}>{r.period}</td>
                  <td style={{ ...S.td, color: 'var(--t-text-muted)' }}>{isMgr ? (r.goal == null ? '—' : fmt$(r.goal)) : '—'}</td>
                  <td style={{ ...S.td, fontWeight: 700, color: '#2ad6a0' }}>{isMgr ? fmt$(r.actual) : '—'}</td>
                  <td style={{ ...S.td, fontWeight: 700, color: (r.gap ?? 0) >= 0 ? '#2ad6a0' : '#ff4d7d' }}>{isMgr ? (r.gap == null ? '—' : `${r.gap >= 0 ? '+' : ''}${fmt$(r.gap)}`) : '—'}</td>
                  <td style={{ ...S.td, fontWeight: 800, color: r.pct == null ? 'var(--t-text-faint)' : r.pct >= 100 ? '#2ad6a0' : r.pct >= 75 ? '#ffb800' : '#ff4d7d' }}>{fmtPct(r.pct)}</td>
                  <td style={{ ...S.td, minWidth: 140 }}><GoalBar pct={r.pct} /></td>
                  <td style={{ ...S.td }}>{r.pct == null ? <BadgeEl text="NO GOAL" color="blue" /> : r.pct >= 100 ? <BadgeEl text="ON TARGET" color="green" /> : r.pct >= 75 ? <BadgeEl text="ON TRACK" color="amber" /> : <BadgeEl text="BEHIND" color="red" />}</td>
                </tr>
              ))}
              {goalRows.length > 0 && (
              <tr style={{ background: 'rgba(0,229,255,0.04)', borderTop: '2px solid var(--t-line)' }}>
                <td style={{ ...S.td, fontWeight: 800, fontSize: 11, color: 'var(--t-text-faint)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>All Stores</td>
                <td style={{ ...S.td, color: 'var(--t-text-muted)', fontSize: 11 }}>—</td>
                <td style={{ ...S.td, fontWeight: 700 }}>{isMgr ? (hasGoals ? fmt$(totalGoal) : '—') : '—'}</td>
                <td style={{ ...S.td, fontWeight: 800, color: '#2ad6a0' }}>{isMgr ? fmt$(totalActual) : '—'}</td>
                <td style={{ ...S.td, fontWeight: 800, color: (totalGap ?? 0) >= 0 ? '#2ad6a0' : '#ff4d7d' }}>{isMgr ? (totalGap == null ? '—' : `${totalGap >= 0 ? '+' : ''}${fmt$(totalGap)}`) : '—'}</td>
                <td style={{ ...S.td, fontWeight: 800, color: totalPct == null ? 'var(--t-text-faint)' : totalPct >= 100 ? '#2ad6a0' : totalPct >= 75 ? '#ffb800' : '#ff4d7d' }}>{fmtPct(totalPct)}</td>
                <td style={{ ...S.td }}><GoalBar pct={totalPct} /></td>
                <td style={{ ...S.td }}>{totalPct == null ? <BadgeEl text="NO GOAL" color="blue" /> : totalPct >= 100 ? <BadgeEl text="ON TARGET" color="green" /> : totalPct >= 75 ? <BadgeEl text="ON TRACK" color="amber" /> : <BadgeEl text="BEHIND" color="red" />}</td>
              </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 4-week attainment trend */}
      <div style={S.panel}>
        <SectionHeader label="Last 4 Weeks — Goal Attainment %" />
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={S.th}>Location</th>
                {['Wk -3', 'Wk -2', 'Wk -1', 'Current'].map(w => <th key={w} style={S.th}>{w}</th>)}
                <th style={S.th}>Trend</th>
              </tr>
            </thead>
            <tbody>
              {data.locNames.length === 0 ? <EmptyRow cols={6} msg="No locations in scope" /> : data.locNames.map((loc, li) => {
                const locHistory = goalHistory.filter(g => g.location === loc)
                const pcts = locHistory.map(g => g.pct)
                const valid = pcts.filter(p => p != null)
                const trend = valid.length >= 2 ? valid[valid.length - 1] - valid[0] : null
                return (
                  <tr key={loc} style={{ background: li % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.013)' }}>
                    <td style={{ ...S.td, fontWeight: 700 }}>{loc}</td>
                    {pcts.map((pct, pi) => (
                      <td key={pi} style={{ ...S.td, fontWeight: 700, color: pct == null ? 'var(--t-text-faint)' : pct >= 100 ? '#2ad6a0' : pct >= 75 ? '#ffb800' : '#ff4d7d' }}>{fmtPct(pct)}</td>
                    ))}
                    <td style={{ ...S.td, fontWeight: 700, color: trend == null ? 'var(--t-text-faint)' : trend >= 0 ? '#2ad6a0' : '#ff4d7d' }}>
                      {trend == null ? '—' : `${trend >= 0 ? '↑' : '↓'} ${fmtPct(Math.abs(trend))}`}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ── Log Sale Modal ────────────────────────────────────────────────────────────
function LogSaleModal({ onClose, onSave, locationIds, locations, session, reps }) {
  const [form, setForm] = useState({
    employee: session?.person?.id || '',
    employee_name: session?.person?.full_name || '',
    category: '',
    amount: '',
    items: 1,
    transaction_type: 'Credit Card',
    notes: '',
    node_id: locationIds?.[0] || '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleSave = async () => {
    if (!form.amount || parseFloat(form.amount) <= 0) { setError('Enter a valid amount'); return }
    if (!form.node_id) { setError('Select a location'); return }
    setSaving(true); setError('')
    const { data, error: e } = await sb.rpc('log_sale', {
      p_person_id: form.employee || session?.person?.id || null,
      p_node_id: form.node_id,
      p_amount: parseFloat(form.amount),
      p_units: parseInt(form.items) || 1,
      p_category: form.category || null,
      p_transaction_type: form.transaction_type || null,
      p_notes: form.notes || null,
      p_is_upsell: false,
    })
    setSaving(false)
    if (e || (data && data.ok === false)) {
      setError((data && data.error) || (e && e.message) || 'Could not save sale — please try again.')
      return
    }
    onSave()
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(7,11,20,0.88)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }} onClick={onClose}>
      <div style={{ background: '#0d1117', border: '1px solid var(--t-line)', width: 440, maxWidth: '96vw', padding: '24px 28px' }} onClick={e => e.stopPropagation()}>
        <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--t-text)', marginBottom: 20 }}>Log Sale</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
          <div>
            <label style={S.lbl}>Location *</label>
            <select value={form.node_id} onChange={e => set('node_id', e.target.value)} style={S.inp}>
              <option value="">— Select —</option>
              {(locations || []).map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
          <div>
            <label style={S.lbl}>Employee</label>
            <select value={form.employee} onChange={e => { const r = reps?.find(r => r.person_id === e.target.value); set('employee', e.target.value); if (r) set('employee_name', r.name) }} style={S.inp}>
              <option value={session?.person?.id || ''}>{session?.person?.full_name || 'Me'}</option>
              {reps?.filter(r => r.person_id !== session?.person?.id).map(r => <option key={r.person_id} value={r.person_id}>{r.name}</option>)}
            </select>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
          <div>
            <label style={S.lbl}>Amount ($) *</label>
            <input type="number" step="0.01" min="0.01" value={form.amount} onChange={e => set('amount', e.target.value)} placeholder="0.00" style={S.inp} autoFocus />
          </div>
          <div>
            <label style={S.lbl}>Items Sold</label>
            <input type="number" min="1" value={form.items} onChange={e => set('items', e.target.value)} style={S.inp} />
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
          <div>
            <label style={S.lbl}>Category</label>
            <select value={form.category} onChange={e => set('category', e.target.value)} style={S.inp}>
              <option value="">— Any —</option>
              {PRODUCT_CATS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label style={S.lbl}>Transaction Type</label>
            <select value={form.transaction_type} onChange={e => set('transaction_type', e.target.value)} style={S.inp}>
              {TX_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
        </div>
        <div style={{ marginBottom: 20 }}>
          <label style={S.lbl}>Notes</label>
          <textarea value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Upsells, products, notes…" rows={2} style={{ ...S.inp, resize: 'vertical', minHeight: 52 }} />
        </div>
        {error && <div style={{ fontSize: 12, color: '#ff4d7d', marginBottom: 14, padding: '8px 12px', background: 'rgba(255,77,125,0.08)', border: '1px solid rgba(255,77,125,0.2)' }}>{error}</div>}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '9px 18px', background: 'transparent', border: '1px solid var(--t-line)', color: 'var(--t-text-muted)', cursor: 'pointer', fontSize: 13, fontFamily: 'inherit', fontWeight: 600 }}>Cancel</button>
          <button onClick={handleSave} disabled={saving} style={{ padding: '9px 22px', background: '#00e5ff', border: 'none', color: '#070b14', cursor: saving ? 'not-allowed' : 'pointer', fontSize: 13, fontFamily: 'inherit', fontWeight: 800, opacity: saving ? 0.7 : 1 }}>
            {saving ? 'Saving…' : 'Log Sale'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Role helpers (mirrors Cockpit.jsx pattern) ────────────────────────────────
function useRoleGate(session) {
  const nowH = new Date().getHours()
  const roleName = (session?.person?.role_name || '').toLowerCase()
  const isManager = ['ceo', 'manager', 'coo', 'admin', 'owner', 'hr'].some(r => roleName.includes(r))
  const isKH = !isManager && (roleName.includes('key') || roleName.includes('holder'))
  // Associates = everyone else
  const khCanSeeAMSales = isManager || nowH >= 12
  const khCanSeePMSales = isManager || nowH >= 20
  // Unified "can see dollars" flag (AM gate is the binding one for day-wide totals)
  const canSeeDollars = isManager || (isKH && khCanSeeAMSales)
  return { isManager, isKH, canSeeDollars, khCanSeeAMSales, khCanSeePMSales }
}

// Gate a dollar value: managers see full amount, KH after 12PM see pct+gap,
// KH before 12PM and associates see '—'
function gatedDollar(value, goal, { isManager, isKH, canSeeDollars }) {
  if (isManager) return fmt$(value)
  if (isKH && canSeeDollars && goal > 0) {
    const pct = Math.round((value / goal) * 100)
    const gap = Math.max(0, goal - value)
    return gap > 0 ? `${pct}% — Need ${fmt$(gap)}` : `${pct}% ✓`
  }
  if (isKH && !canSeeDollars) return 'Available after 12PM'
  return '—'
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function Sales() {
  const { session } = useAuth()
  const { locationIds, locations } = useScope()

  const roleName = (session?.person?.role_name || '').toLowerCase()
  const isHR = ['ceo', 'hr', 'manager', 'coo', 'admin', 'owner'].some(r => roleName.includes(r))
  const roleGate = useRoleGate(session)
  const { isManager: isMgr, canSeeDollars } = roleGate

  const [data, setData] = useState(null)
  const [dataSource, setDataSource] = useState({ live: false })
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState(0)
  const [showModal, setShowModal] = useState(false)

  // Shared filter state (Dashboard tab uses these)
  const today = todayStr()
  const [dateFrom, setDateFrom] = useState(weekAgoStr())
  const [dateTo, setDateTo] = useState(today)
  const [locFilter, setLocFilter] = useState('all')

  const load = useCallback(async () => {
    setLoading(true)
    const ids = locationIds || []
    const fallback = (locations || []).map(l => ({ id: l.id, name: l.name }))
    const { data: payload, error } = await sb.rpc('get_sales_ledger', { p_node_ids: ids, p_days: 45 })
    if (error) {
      setData(buildFromLive({}, fallback))
      setDataSource({ live: false, error: error.message || 'Sales data is temporarily unavailable.' })
    } else {
      setData(buildFromLive(payload, fallback))
      setDataSource({ live: true })
    }
    setLoading(false)
  }, [locationIds, locations])

  useEffect(() => { load() }, [load])

  if (loading || !data) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300, color: 'var(--t-text-muted)', fontSize: 13 }}>
        Loading sales data…
      </div>
    )
  }

  const { kpis } = data
  const totalDailyGoal = data.locNames.reduce((a, l) => a + (data.goalsByLoc[l]?.daily || 0), 0)

  return (
    <div style={{ padding: '20px 24px', maxWidth: 1440, margin: '0 auto' }}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20, gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 3 }}>
            <div style={{ fontSize: 20, fontWeight: 900, color: 'var(--t-text)', letterSpacing: '-0.02em' }}>Sales Intelligence</div>
            {dataSource.live
              ? <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.06em', padding: '3px 9px', background: 'var(--t-success)', color: '#04121a', textTransform: 'uppercase' }}>● Live Data</span>
              : <span title={dataSource.error || 'Sales data unavailable'} style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.06em', padding: '3px 9px', background: 'var(--t-warn)', color: '#111', textTransform: 'uppercase' }}>⚠ Data Unavailable</span>}
          </div>
          <div style={{ fontSize: 12, color: 'var(--t-text-muted)' }}>Twisted Growers · {data.locNames.length} location{data.locNames.length === 1 ? '' : 's'} · Forensic sales analytics</div>
        </div>
        <button onClick={() => setShowModal(true)} style={{ padding: '9px 20px', background: '#00e5ff', border: 'none', color: '#070b14', fontSize: 13, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
          + Log Sale
        </button>
      </div>

      {/* ── KPI Panel Row 1: Revenue ── */}
      <div style={{ marginBottom: 8 }}>
        <div style={{ fontSize: 9, fontWeight: 800, color: 'var(--t-text-faint)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>Revenue</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <KPICard label="Today's Revenue" value={isMgr ? fmt$(kpis.today) : canSeeDollars ? gatedDollar(kpis.today, totalDailyGoal, roleGate) : 'Available after 12PM'} sub={isMgr && totalDailyGoal > 0 ? `Goal: ${fmt$(totalDailyGoal)}` : undefined} color="#2ad6a0" small />
          <KPICard label="This Week" value={isMgr ? fmt$(kpis.week) : '—'} color="#00e5ff" small />
          <KPICard label="This Month" value={isMgr ? fmt$(kpis.month) : '—'} color="var(--t-text)" small />
          <KPICard label="This Quarter" value={isMgr ? fmt$(kpis.quarter) : '—'} color="var(--t-text)" small />
          <KPICard label="Year to Date" value={isMgr ? fmt$(kpis.ytd) : '—'} color="var(--t-text)" small />
          <KPICard label="vs Last Year" value={kpis.vs_last_year_pct == null ? '—' : `${kpis.vs_last_year_pct >= 0 ? '+' : ''}${fmtPct(kpis.vs_last_year_pct)}`} color={kpis.vs_last_year_pct == null ? 'var(--t-text-faint)' : kpis.vs_last_year_pct >= 0 ? '#2ad6a0' : '#ff4d7d'} sub="MTD comparison" small />
        </div>
      </div>

      {/* ── KPI Panel Row 2: Transactions ── */}
      <div style={{ marginBottom: 8 }}>
        <div style={{ fontSize: 9, fontWeight: 800, color: 'var(--t-text-faint)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>Transactions</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <KPICard label="Transactions Today" value={fmtN(kpis.tx_today)} color="var(--t-text)" small />
          <KPICard label="Avg Ticket" value={isMgr ? fmt$(kpis.avg_ticket) : '—'} color="#00e5ff" small />
          <KPICard label="Items / Transaction" value={kpis.items_per_tx} color="var(--t-text)" small />
          <KPICard label="Void Rate Today" value={fmtPct(kpis.void_rate_pct)} color={kpis.void_rate_pct > 3 ? '#ff4d7d' : '#2ad6a0'} small />
          <KPICard label="Refund Amount Today" value={isMgr ? fmt$(kpis.refund_today) : '—'} color={kpis.refund_today > 200 ? '#ff4d7d' : '#ffb800'} small />
          <KPICard label="Conversion Rate" value={kpis.conversion_rate == null ? '—' : fmtPct(kpis.conversion_rate)} sub={kpis.conversion_rate == null ? 'No traffic source' : undefined} color="#7c4dff" small />
        </div>
      </div>

      {/* ── KPI Panel Row 3: Per-Location compact table ── */}
      <div style={{ ...S.panel, marginBottom: 8 }}>
        <div style={{ padding: '8px 14px 0', fontSize: 9, fontWeight: 800, color: 'var(--t-text-faint)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Per-Location</div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>{['Location', 'Today $', 'Week $', 'Month $', 'Avg Ticket', 'Transactions'].map(h => <th key={h} style={{ ...S.th, padding: '6px 12px', fontSize: 9 }}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {data.locationSummary.length === 0 ? <EmptyRow cols={6} msg="No locations in scope" /> : data.locationSummary.map((loc, i) => (
                <tr key={loc.node_id} style={{ background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.013)' }}>
                  <td style={{ ...S.td, fontWeight: 700, padding: '7px 12px', fontSize: 11 }}>{loc.location_name}</td>
                  <td style={{ ...S.td, fontWeight: 700, color: '#2ad6a0', padding: '7px 12px', fontSize: 11 }}>{isMgr ? fmt$(loc.today) : canSeeDollars ? gatedDollar(loc.today, loc.goal || 0, roleGate) : '—'}</td>
                  <td style={{ ...S.td, color: '#00e5ff', padding: '7px 12px', fontSize: 11 }}>{isMgr ? fmt$(loc.week) : '—'}</td>
                  <td style={{ ...S.td, padding: '7px 12px', fontSize: 11 }}>{isMgr ? fmt$(loc.month) : '—'}</td>
                  <td style={{ ...S.td, padding: '7px 12px', fontSize: 11 }}>{isMgr ? fmt$(loc.avg_ticket) : '—'}</td>
                  <td style={{ ...S.td, color: 'var(--t-text-muted)', padding: '7px 12px', fontSize: 11 }}>{loc.today_tx}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── KPI Panel Row 4: Employee Performance ── */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 9, fontWeight: 800, color: 'var(--t-text-faint)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>Employee Performance</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <KPICard label="Top Seller Today" value={kpis.top_seller_today?.name?.split(' ')[0] || '—'} sub={isMgr && kpis.top_seller_today ? fmt$(kpis.top_seller_today.today) : kpis.top_seller_today ? 'Today' : 'No sales'} color="#ffb800" small />
          <KPICard label="Top Seller Month" value={kpis.top_seller_month?.name?.split(' ')[0] || '—'} sub={isMgr && kpis.top_seller_month ? fmt$(kpis.top_seller_month.month) : kpis.top_seller_month ? 'MTD Leader' : '—'} color="#7c4dff" small />
          <KPICard label="Lowest Performer" value={kpis.lowest_performer?.name?.split(' ')[0] || '—'} sub={isMgr && kpis.lowest_performer ? fmt$(kpis.lowest_performer.month) + ' MTD' : '—'} color="#ff4d7d" small />
          <KPICard label="Spiff Earned Today" value={isMgr ? fmt$(kpis.spiff_today) : '—'} sub="$2 / upsell" color="#2ad6a0" small />
          <KPICard label="Upsell Rate Today" value={fmtPct(kpis.upsell_rate)} color={kpis.upsell_rate >= 35 ? '#2ad6a0' : kpis.upsell_rate >= 20 ? '#ffb800' : '#ff4d7d'} small />
          {kpis.top_seller_today && (
            <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', padding: '10px 14px', flex: 1, minWidth: 160 }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--t-text-faint)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Contest Leaders</div>
              {data.reps.slice().sort((a, b) => b.week - a.week).slice(0, 3).map((r, i) => (
                <div key={r.person_id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, marginBottom: 3 }}>
                  <span style={{ color: i === 0 ? '#ffb800' : i === 1 ? '#00e5ff' : 'var(--t-text-muted)', fontWeight: 700 }}>#{i + 1} {r.name.split(' ')[0]}</span>
                  <span style={{ color: '#2ad6a0', fontWeight: 700 }}>{isMgr ? fmt$(r.week) : `#${i + 1}`}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Tabs ── */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 20, borderBottom: '1px solid var(--t-line)' }}>
        {TABS.map((t, i) => (
          <button key={t} onClick={() => setTab(i)} style={{
            padding: '10px 18px', fontSize: 12, fontWeight: 700,
            background: 'transparent', border: 'none',
            borderBottom: tab === i ? '2px solid #00e5ff' : '2px solid transparent',
            color: tab === i ? '#00e5ff' : 'var(--t-text-muted)',
            cursor: 'pointer', fontFamily: 'inherit',
            marginBottom: -1,
          }}>{t}</button>
        ))}
      </div>

      {/* ── Tab content ── */}
      {tab === 0 && (
        <TabDashboard
          data={data}
          dateFrom={dateFrom} setDateFrom={setDateFrom}
          dateTo={dateTo} setDateTo={setDateTo}
          locFilter={locFilter} setLocFilter={setLocFilter}
          roleGate={roleGate}
        />
      )}
      {tab === 1 && <TabByEmployee data={data} roleGate={roleGate} />}
      {tab === 2 && <TabByLocation data={data} roleGate={roleGate} />}
      {tab === 3 && <TabVoids data={data} roleGate={roleGate} />}
      {tab === 4 && <TabGoals data={data} roleGate={roleGate} />}

      {/* ── Log Sale Modal ── */}
      {showModal && (
        <LogSaleModal
          onClose={() => setShowModal(false)}
          onSave={() => { setShowModal(false); load() }}
          locationIds={locationIds}
          locations={locations}
          session={session}
          reps={data.reps}
        />
      )}
    </div>
  )
}
