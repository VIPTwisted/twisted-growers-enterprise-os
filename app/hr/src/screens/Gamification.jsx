import { useState, useEffect, useCallback } from 'react'
import { sb } from '../lib/supabase'
import { useAuth } from '../lib/auth.jsx'
import { useScope } from '../lib/scope.jsx'
import DrillDown from '../components/DrillDown.jsx'

// ─── helpers ────────────────────────────────────────────────────────────────
function initials(name = '') {
  return name.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase()
}

function fmt(n) {
  if (n == null) return '—'
  n = Number(n)
  if (Number.isNaN(n)) return '—'
  if (n >= 1000) return (n / 1000).toFixed(1) + 'k'
  return String(n)
}

// ─── Level System ───────────────────────────────────────────────────────────
const LEVELS = [
  { level: 1, name: 'Rookie',          min: 0,     max: 499 },
  { level: 2, name: 'Team Player',     min: 500,   max: 999 },
  { level: 3, name: 'Rising Star',     min: 1000,  max: 1999 },
  { level: 4, name: 'Key Contributor', min: 2000,  max: 3499 },
  { level: 5, name: 'Go-Getter',       min: 3500,  max: 4999 },
  { level: 6, name: 'Standout',        min: 5000,  max: 7499 },
  { level: 7, name: 'Elite Associate', min: 7500,  max: 9999 },
  { level: 8, name: 'Twisted Growers All-Star',    min: 10000, max: 14999 },
  { level: 9, name: 'Floor Legend',    min: 15000, max: 24999 },
  { level:10, name: 'Hall of Fame',    min: 25000, max: Infinity },
]

function getLevel(pts) {
  pts = Number(pts) || 0
  return LEVELS.find(l => pts >= l.min && pts <= l.max) || LEVELS[0]
}

function xpProgress(pts) {
  pts = Number(pts) || 0
  const l = getLevel(pts)
  if (l.level === 10) return 100
  const range = l.max - l.min + 1
  const prog  = pts - l.min
  return Math.min(100, Math.round((prog / range) * 100))
}

const RARITY_COLOR = {
  Common:    'var(--t-text-muted)',
  Rare:      'var(--t-accent)',
  Epic:      '#a855f7',
  Legendary: '#f59e0b',
}

const AVAIL_COLOR = { 'in-stock':'var(--t-success)', 'limited':'var(--t-warn)', 'sold-out':'var(--t-danger)' }
const AVAIL_LABEL = { 'in-stock':'In Stock', 'limited':'Limited', 'sold-out':'Sold Out' }

// ─── Styles ──────────────────────────────────────────────────────────────────
const S = {
  screen: {
    padding: '24px',
    color: 'var(--t-text)',
    fontFamily: 'inherit',
  },
  title: {
    fontSize: '22px',
    fontWeight: 700,
    marginBottom: '4px',
    color: 'var(--t-text)',
  },
  subtitle: {
    fontSize: '13px',
    color: 'var(--t-text-muted)',
    marginBottom: '24px',
  },
  kpiSection: {
    background: 'var(--t-surface)',
    border: '1px solid var(--t-line)',
    borderRadius: '12px',
    padding: '20px',
    marginBottom: '20px',
  },
  kpiSectionTitle: {
    fontSize: '11px',
    fontWeight: 700,
    letterSpacing: '1px',
    color: 'var(--t-text-muted)',
    textTransform: 'uppercase',
    marginBottom: '14px',
  },
  kpiGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(6, 1fr)',
    gap: '12px',
  },
  kpiTile: {
    background: 'var(--t-surface-2)',
    border: '1px solid var(--t-line)',
    borderRadius: '8px',
    padding: '12px',
  },
  kpiLabel: {
    fontSize: '11px',
    color: 'var(--t-text-faint)',
    marginBottom: '4px',
  },
  kpiValue: {
    fontSize: '20px',
    fontWeight: 700,
    color: 'var(--t-accent)',
    lineHeight: 1,
  },
  kpiSub: {
    fontSize: '11px',
    color: 'var(--t-text-muted)',
    marginTop: '2px',
  },
  locTable: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '13px',
  },
  locTh: {
    textAlign: 'left',
    padding: '6px 10px',
    color: 'var(--t-text-muted)',
    fontWeight: 600,
    borderBottom: '1px solid var(--t-line)',
    fontSize: '11px',
  },
  locTd: {
    padding: '7px 10px',
    borderBottom: '1px solid var(--t-line)',
    color: 'var(--t-text)',
  },
  tabs: {
    display: 'flex',
    gap: '2px',
    marginBottom: '20px',
    borderBottom: '1px solid var(--t-line)',
    paddingBottom: '0',
  },
  tab: (active) => ({
    padding: '10px 18px',
    fontSize: '13px',
    fontWeight: 600,
    cursor: 'pointer',
    background: 'none',
    border: 'none',
    borderBottom: active ? '2px solid var(--t-accent)' : '2px solid transparent',
    color: active ? 'var(--t-accent)' : 'var(--t-text-muted)',
    transition: 'color 0.15s',
    marginBottom: '-1px',
  }),
  card: {
    background: 'var(--t-surface)',
    border: '1px solid var(--t-line)',
    borderRadius: '12px',
    padding: '20px',
    marginBottom: '16px',
  },
  cardTitle: {
    fontSize: '14px',
    fontWeight: 700,
    color: 'var(--t-text)',
    marginBottom: '14px',
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  avatar: (size = 40) => ({
    width: size,
    height: size,
    borderRadius: 0,
    background: 'var(--t-accent)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: size > 36 ? '15px' : '12px',
    fontWeight: 700,
    color: '#000',
    flexShrink: 0,
  }),
  progressBar: {
    height: '6px',
    background: 'var(--t-line)',
    borderRadius: '3px',
    overflow: 'hidden',
    flex: 1,
  },
  progressFill: (pct, color = 'var(--t-accent)') => ({
    height: '100%',
    width: pct + '%',
    background: color,
    borderRadius: '3px',
    transition: 'width 0.4s ease',
  }),
  badge: (rarity) => ({
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    padding: '4px 10px',
    borderRadius: '6px',
    fontSize: '12px',
    fontWeight: 600,
    border: `1px solid ${RARITY_COLOR[rarity] || 'var(--t-line)'}`,
    color: RARITY_COLOR[rarity] || 'var(--t-text-muted)',
    background: 'var(--t-surface-2)',
  }),
  btn: (variant = 'primary') => ({
    padding: '8px 18px',
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: 600,
    background: variant === 'primary' ? 'var(--t-accent)' : 'var(--t-surface-2)',
    color: variant === 'primary' ? '#000' : 'var(--t-text)',
    border: variant === 'primary' ? 'none' : '1px solid var(--t-line)',
    transition: 'opacity 0.15s',
  }),
  input: {
    background: 'var(--t-surface-2)',
    border: '1px solid var(--t-line)',
    borderRadius: '8px',
    padding: '8px 12px',
    color: 'var(--t-text)',
    fontSize: '13px',
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box',
  },
  select: {
    background: 'var(--t-surface-2)',
    border: '1px solid var(--t-line)',
    borderRadius: '8px',
    padding: '8px 12px',
    color: 'var(--t-text)',
    fontSize: '13px',
    outline: 'none',
  },
  modal: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.65)',
    zIndex: 1000,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px',
  },
  modalBox: {
    background: 'var(--t-surface)',
    border: '1px solid var(--t-line)',
    borderRadius: '14px',
    padding: '28px',
    maxWidth: '480px',
    width: '100%',
    position: 'relative',
  },
  modalTitle: {
    fontSize: '18px',
    fontWeight: 700,
    color: 'var(--t-text)',
    marginBottom: '12px',
  },
  tag: (color = 'var(--t-accent)') => ({
    display: 'inline-block',
    padding: '2px 8px',
    borderRadius: '4px',
    fontSize: '11px',
    fontWeight: 700,
    background: color + '22',
    color: color,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  }),
  divider: {
    height: '1px',
    background: 'var(--t-line)',
    margin: '16px 0',
  },
}

// ─── drill-down columns for employee records ─────────────────────────────────
const EMP_COLS = [
  { key: 'full_name', label: 'Employee', value: e => e.full_name },
  { key: 'location', label: 'Location', value: e => e.location },
  { key: 'role', label: 'Role', value: e => e.role },
  { key: 'level', label: 'Level', value: e => `Lvl ${getLevel(e.points_ytd).level}`, align: 'right', sortKey: e => getLevel(e.points_ytd).level },
  { key: 'points_mtd', label: 'Points MTD', value: e => fmt(e.points_mtd), align: 'right', sortKey: e => e.points_mtd },
  { key: 'points_ytd', label: 'Points YTD', value: e => fmt(e.points_ytd), align: 'right', sortKey: e => e.points_ytd },
  { key: 'streak', label: 'Streak', value: e => (e.streak > 0 ? `${e.streak}d` : '—'), align: 'right', sortKey: e => e.streak },
  { key: 'badges', label: 'Badges', value: e => (e.badges?.length ?? 0), align: 'right', sortKey: e => (e.badges?.length ?? 0) },
]
const REDEMPTION_COLS = [
  { key: 'reward_name', label: 'Reward', value: r => r.reward_name },
  { key: 'cost', label: 'Points', value: r => fmt(r.cost), align: 'right', sortKey: r => r.cost },
  { key: 'status', label: 'Status', value: r => r.status },
  { key: 'date', label: 'Date', value: r => r.date, sortKey: r => r.date },
]

// ─── Stats derived entirely from the real board ──────────────────────────────
function computeStats(board) {
  const emps = board.employees || []
  const reds = board.redemptions || []
  const st   = board.stats || {}
  const active = emps.length
  const totMtd = emps.reduce((s, e) => s + (Number(e.points_mtd) || 0), 0)
  const avgMtd = active ? Math.round(totMtd / active) : 0
  const participating = emps.filter(e => (Number(e.points_total) || 0) > 0)
  const engRate = active ? Math.round((participating.length / active) * 100) : 0
  const streaksActive = emps.filter(e => e.streak > 0).length
  const topLevel = emps.reduce((m, e) => Math.max(m, getLevel(e.points_ytd).level), 0)
  const topPlayer = [...emps].sort((a, b) => b.points_mtd - a.points_mtd)[0] || null
  const month = new Date().toISOString().slice(0, 7)
  const redeemed = reds.filter(r => (r.date || '').slice(0, 7) === month).length
  const pending  = reds.filter(r => r.status === 'Pending').length
  const budgetLimit = Number(st.budget_limit) || 0
  const budgetUsed  = budgetLimit ? Math.min(100, Math.round((Number(st.budget_used_month || 0) / budgetLimit) * 100)) : 0

  const locs = Array.from(new Set(emps.map(e => e.location).filter(Boolean)))
  const byLoc = locs.map(loc => {
    const le = emps.filter(e => e.location === loc)
    const avg = le.length ? Math.round(le.reduce((s, e) => s + (Number(e.points_mtd) || 0), 0) / le.length) : 0
    const top = [...le].sort((a, b) => b.points_mtd - a.points_mtd)[0]
    const streaks = le.filter(e => e.streak > 0).length
    const rr = reds.filter(r => r.location === loc).length
    return { loc, avg, top: top?.full_name ?? '—', streaks, reds: rr }
  })

  return {
    active, avgMtd,
    todayPts: Number(st.points_today) || 0,
    redeemed,
    badgesWeek: Number(st.badges_week) || 0,
    engRate, topLevel, topPlayer, streaksActive, pending, budgetUsed,
    newBadges: Number(st.badges_week) || 0,
    byLoc, participatingCount: participating.length,
  }
}

// ─── KPI Panel ───────────────────────────────────────────────────────────────
function KPIPanel({ board }) {
  const stats = computeStats(board)
  const employees = board.employees || []
  const redemptions = board.redemptions || []
  const [drill, setDrill] = useState(null)
  const openEmp = (title, rows, accent) => setDrill({ title, subtitle: `${rows.length} employee${rows.length === 1 ? '' : 's'}`, columns: EMP_COLS, rows, accent })
  const byMtd = [...employees].sort((a, b) => b.points_mtd - a.points_mtd)
  const byYtd = [...employees].sort((a, b) => b.points_ytd - a.points_ytd)
  const byBadges = [...employees].sort((a, b) => (b.badges?.length ?? 0) - (a.badges?.length ?? 0))
  const pendingReds = redemptions.filter(r => r.status === 'Pending')
  const levelName = (lvl) => lvl >= 1 && lvl <= 10 ? LEVELS[lvl - 1].name : '—'

  return (
    <div>
      <div style={S.kpiSection}>
        <div style={S.kpiSectionTitle}>Engagement Metrics</div>
        <div style={S.kpiGrid}>
          <KTile label="Active Players"         value={stats.active}       sub="enrolled employees" onClick={() => openEmp('Active Players', employees, 'var(--t-accent)')} />
          <KTile label="Avg Points MTD"         value={fmt(stats.avgMtd)}  sub="per employee" onClick={() => openEmp('Points MTD by Employee', byMtd, 'var(--t-accent)')} />
          <KTile label="Points Earned Today"    value={fmt(stats.todayPts)} sub="all locations" onClick={() => openEmp('Points Contributors', byMtd, 'var(--t-accent)')} />
          <KTile label="Rewards Redeemed"       value={stats.redeemed}     sub="this month" onClick={() => setDrill({ title: 'Rewards Redeemed', subtitle: `${redemptions.length} redemptions`, columns: REDEMPTION_COLS, rows: redemptions, accent: 'var(--t-success)' })} />
          <KTile label="Badges Awarded"         value={stats.badgesWeek}   sub="this week" onClick={() => openEmp('Badge Holders', byBadges, 'var(--t-accent)')} />
          <KTile label="Engagement Rate"        value={stats.engRate + '%'} sub="participating" onClick={() => openEmp('Participating Employees', employees.filter(e => (Number(e.points_total) || 0) > 0), 'var(--t-success)')} />
        </div>
      </div>

      <div style={S.kpiSection}>
        <div style={S.kpiSectionTitle}>Program Health</div>
        <div style={S.kpiGrid}>
          <KTile label="Top Level Achieved"     value={'Lvl ' + stats.topLevel} sub={levelName(stats.topLevel)} onClick={() => openEmp('Employees by Level (YTD)', byYtd, 'var(--t-accent)')} />
          <KTile label="Most Active Player"     value={stats.topPlayer?.full_name?.split(' ')[0] ?? '—'} sub={fmt(stats.topPlayer?.points_mtd) + ' pts MTD'} onClick={() => openEmp('Points MTD — Ranked', byMtd, 'var(--t-accent)')} />
          <KTile label="Active Streaks"         value={stats.streaksActive}  sub="employees on streak" onClick={() => openEmp('Active Streaks', employees.filter(e => e.streak > 0).sort((a, b) => b.streak - a.streak), 'var(--t-success)')} />
          <KTile label="Pending Redemptions"    value={stats.pending}         sub="awaiting approval" onClick={() => setDrill({ title: 'Pending Redemptions', subtitle: `${pendingReds.length} pending`, columns: REDEMPTION_COLS, rows: pendingReds, accent: 'var(--t-warn)' })} />
          <KTile label="Budget Used"            value={stats.budgetUsed + '%'} sub="of monthly budget" onClick={() => setDrill({ title: 'Redemptions Drawing Budget', subtitle: `${redemptions.length} redemptions`, columns: REDEMPTION_COLS, rows: redemptions, accent: 'var(--t-warn)' })} />
          <KTile label="New Badges This Week"   value={stats.newBadges}       sub="unlocked" onClick={() => openEmp('Badge Earners', byBadges, 'var(--t-accent)')} />
        </div>
      </div>

      <div style={S.kpiSection}>
        <div style={S.kpiSectionTitle}>By Location</div>
        {stats.byLoc.length === 0 ? (
          <div style={{ color:'var(--t-text-muted)', fontSize:'13px' }}>No locations in scope.</div>
        ) : (
          <table style={S.locTable}>
            <thead>
              <tr>
                {['Location','Avg Points MTD','Top Player','Active Streaks','Rewards Redeemed'].map(h => (
                  <th key={h} style={S.locTh}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {stats.byLoc.map(r => (
                <tr key={r.loc}>
                  <td style={S.locTd}><strong>{r.loc}</strong></td>
                  <td style={{ ...S.locTd, color:'var(--t-accent)', fontWeight:700 }}>{fmt(r.avg)}</td>
                  <td style={S.locTd}>{r.top}</td>
                  <td style={S.locTd}>{r.streaks}</td>
                  <td style={S.locTd}>{r.reds}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <DrillDown open={!!drill} onClose={() => setDrill(null)} {...(drill || {})} />
    </div>
  )
}

function KTile({ label, value, sub, onClick }) {
  return (
    <div onClick={onClick} title={onClick ? 'Click to drill into records' : undefined} style={{ ...S.kpiTile, cursor: onClick ? 'pointer' : 'default' }}>
      <div style={S.kpiLabel}>{label}</div>
      <div style={S.kpiValue}>{value}</div>
      {sub && <div style={S.kpiSub}>{sub}</div>}
    </div>
  )
}

// ─── Tab: My Profile ─────────────────────────────────────────────────────────
function MyProfile({ board, session }) {
  const employees = board.employees || []
  const me = employees.find(e => e.id === session?.person?.id) ?? employees[0]
  const [activity, setActivity] = useState([])

  useEffect(() => {
    let alive = true
    if (!me?.id) { setActivity([]); return }
    ;(async () => {
      const { data, error } = await sb.rpc('get_my_point_history', { p_person_id: me.id, p_limit: 12 })
      if (alive && !error && Array.isArray(data)) setActivity(data)
    })()
    return () => { alive = false }
  }, [me?.id])

  if (!me) return <div style={{ color:'var(--t-text-muted)' }}>No profile found for your account.</div>

  const badgeCatalog = board.badges || []
  const lvl   = getLevel(me.points_ytd)
  const prog  = xpProgress(me.points_ytd)
  const nextL = LEVELS[lvl.level] // next level (undefined at 10)
  const myBadges = badgeCatalog.filter(b => (me.badges || []).includes(b.code))
  const rules = board.rules || []

  return (
    <div>
      {/* Profile header */}
      <div style={{ ...S.card, display:'flex', gap:'20px', alignItems:'flex-start' }}>
        <div style={S.avatar(60)}>{initials(me.full_name)}</div>
        <div style={{ flex:1 }}>
          <div style={{ fontSize:'18px', fontWeight:700, marginBottom:'2px' }}>{me.full_name}</div>
          <div style={{ fontSize:'13px', color:'var(--t-text-muted)', marginBottom:'12px' }}>{me.role} · {me.location}</div>
          <div style={{ display:'flex', gap:'10px', marginBottom:'14px', flexWrap:'wrap' }}>
            <span style={S.tag('var(--t-accent)')}>Level {lvl.level}</span>
            <span style={{ ...S.badge('Common'), fontSize:'13px', padding:'4px 12px' }}>{lvl.name}</span>
            {me.streak > 0 && <span style={S.tag('var(--t-success)')}>🔥 {me.streak}-day streak</span>}
          </div>
          <div style={{ fontSize:'12px', color:'var(--t-text-muted)', marginBottom:'6px' }}>
            XP Progress {nextL ? `→ Level ${nextL.level} (${nextL.name})` : '(Max Level)'}
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:'10px' }}>
            <div style={S.progressBar}>
              <div style={S.progressFill(prog)} />
            </div>
            <span style={{ fontSize:'12px', fontWeight:700, color:'var(--t-accent)', whiteSpace:'nowrap' }}>{prog}%</span>
          </div>
          {nextL && (
            <div style={{ fontSize:'11px', color:'var(--t-text-faint)', marginTop:'4px' }}>
              {fmt(me.points_ytd)} / {fmt(nextL.min)} pts
            </div>
          )}
        </div>
        <div style={{ textAlign:'right', flexShrink:0 }}>
          <div style={{ fontSize:'11px', color:'var(--t-text-faint)', marginBottom:'2px' }}>Points This Month</div>
          <div style={{ fontSize:'26px', fontWeight:800, color:'var(--t-accent)' }}>{fmt(me.points_mtd)}</div>
          <div style={{ fontSize:'11px', color:'var(--t-text-muted)', marginTop:'6px' }}>All Time: {fmt(me.points_ytd)}</div>
          <div style={{ fontSize:'11px', color:'var(--t-text-muted)' }}>Best Streak: {me.best_streak || 0}d</div>
        </div>
      </div>

      {/* Badges earned */}
      <div style={S.card}>
        <div style={S.cardTitle}>Badges Earned ({myBadges.length}/{badgeCatalog.length})</div>
        {myBadges.length === 0 ? (
          <div style={{ color:'var(--t-text-muted)', fontSize:'13px' }}>No badges yet — keep earning!</div>
        ) : (
          <div style={{ display:'flex', flexWrap:'wrap', gap:'10px' }}>
            {myBadges.map(b => (
              <div key={b.code} style={{ ...S.badge(b.rarity), flexDirection:'column', padding:'10px 14px', alignItems:'center', gap:'4px' }}>
                <span style={{ fontSize:'22px' }}>{b.icon}</span>
                <span style={{ fontSize:'12px' }}>{b.name}</span>
                <span style={{ fontSize:'10px', opacity:0.7 }}>{b.rarity}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Activity feed — real point ledger history */}
      <div style={S.card}>
        <div style={S.cardTitle}>Recent Activity</div>
        {activity.length === 0 ? (
          <div style={{ color:'var(--t-text-muted)', fontSize:'13px' }}>No point activity yet.</div>
        ) : (
          <div>
            {activity.map(a => (
              <div key={a.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'8px 0', borderBottom:'1px solid var(--t-line)' }}>
                <div>
                  <div style={{ fontSize:'13px', color:'var(--t-text)' }}>{a.desc}</div>
                  <div style={{ fontSize:'11px', color:'var(--t-text-faint)' }}>{a.date}</div>
                </div>
                <div style={{ fontSize:'14px', fontWeight:700, color: a.pts >= 0 ? 'var(--t-success)' : 'var(--t-danger)' }}>{a.pts >= 0 ? '+' : ''}{a.pts}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* How to earn points — from the real rule catalog */}
      <div style={S.card}>
        <div style={S.cardTitle}>How to Earn Points</div>
        {rules.length === 0 ? (
          <div style={{ color:'var(--t-text-muted)', fontSize:'13px' }}>No point rules configured.</div>
        ) : (
          <div>
            {rules.map(rule => (
              <div key={rule.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'8px 0', borderBottom:'1px solid var(--t-line)' }}>
                <div>
                  <div style={{ fontSize:'13px', color:'var(--t-text)' }}>{rule.action}</div>
                  <div style={{ fontSize:'11px', color:'var(--t-text-faint)' }}>{rule.category}</div>
                </div>
                <div style={{ fontSize:'14px', fontWeight:700, color:'var(--t-accent)' }}>+{rule.points} pts</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Tab: Leaderboard ────────────────────────────────────────────────────────
function Leaderboard({ board, session }) {
  const employees = board.employees || []
  const locations = Array.from(new Set(employees.map(e => e.location).filter(Boolean)))
  const [locFilter, setLocFilter] = useState('All')
  const myId = session?.person?.id

  const filtered = locFilter === 'All' ? employees : employees.filter(e => e.location === locFilter)
  const sorted = [...filtered].sort((a, b) => b.points_mtd - a.points_mtd)

  const medalColors = ['#f59e0b','#94a3b8','#cd7f32']
  const medals      = ['🥇','🥈','🥉']
  const rowBg = (rank, isMe) => {
    if (isMe) return { border:'2px solid var(--t-accent)' }
    if (rank === 0) return { background:'rgba(245,158,11,0.08)' }
    if (rank === 1) return { background:'rgba(148,163,184,0.06)' }
    if (rank === 2) return { background:'rgba(205,127,50,0.06)' }
    return {}
  }

  return (
    <div style={S.card}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'14px' }}>
        <div style={S.cardTitle}>Monthly Leaderboard</div>
        <select style={S.select} value={locFilter} onChange={e => setLocFilter(e.target.value)}>
          <option value="All">All Locations</option>
          {locations.map(l => <option key={l}>{l}</option>)}
        </select>
      </div>
      {sorted.length === 0 ? (
        <div style={{ color:'var(--t-text-muted)', fontSize:'13px' }}>No employees in scope.</div>
      ) : (
        <div style={{ overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'13px' }}>
            <thead>
              <tr style={{ background:'var(--t-surface-2)' }}>
                {['Rank','','Name','Location','Level','Points MTD','Streak','Points YTD'].map(h => (
                  <th key={h} style={{ textAlign:'left', padding:'8px 10px', color:'var(--t-text-muted)', fontWeight:600, fontSize:'11px', borderBottom:'1px solid var(--t-line)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((emp, i) => {
                const pts  = Number(emp.points_mtd) || 0
                const lvl  = getLevel(emp.points_ytd)
                const isMe = emp.id === myId
                return (
                  <tr key={emp.id} style={{ ...rowBg(i, isMe), transition:'background 0.15s' }}>
                    <td style={{ padding:'10px', fontWeight:700, color: i < 3 ? medalColors[i] : 'var(--t-text-muted)' }}>#{i+1}</td>
                    <td style={{ padding:'10px' }}>{i < 3 ? medals[i] : ''}{isMe ? '👤' : ''}</td>
                    <td style={{ padding:'10px', fontWeight: isMe ? 700 : 400, color: isMe ? 'var(--t-accent)' : 'var(--t-text)' }}>{emp.full_name}</td>
                    <td style={{ padding:'10px', color:'var(--t-text-muted)' }}>{emp.location}</td>
                    <td style={{ padding:'10px' }}>
                      <span style={S.tag('var(--t-accent)')}>Lvl {lvl.level}</span>
                    </td>
                    <td style={{ padding:'10px', fontWeight:700, color:'var(--t-accent)' }}>{fmt(pts)}</td>
                    <td style={{ padding:'10px', color: emp.streak > 0 ? 'var(--t-success)' : 'var(--t-text-muted)' }}>
                      {emp.streak > 0 ? `🔥 ${emp.streak}d` : '—'}
                    </td>
                    <td style={{ padding:'10px', color:'var(--t-text-muted)' }}>{fmt(emp.points_ytd)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ─── Tab: Badges ─────────────────────────────────────────────────────────────
function Badges({ board, session }) {
  const employees = board.employees || []
  const badgeCatalog = board.badges || []
  const [selected, setSelected] = useState(null)
  const myId = session?.person?.id
  const me   = employees.find(e => e.id === myId) ?? employees[0]

  return (
    <div>
      {badgeCatalog.length === 0 ? (
        <div style={{ color:'var(--t-text-muted)', fontSize:'13px' }}>No badges configured.</div>
      ) : (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(220px, 1fr))', gap:'14px' }}>
          {badgeCatalog.map(b => {
            const earned = (me?.badges || []).includes(b.code)
            return (
              <div
                key={b.code}
                onClick={() => setSelected(b)}
                style={{
                  background: earned ? 'var(--t-surface)' : 'var(--t-surface-2)',
                  border: `1px solid ${earned ? RARITY_COLOR[b.rarity] : 'var(--t-line)'}`,
                  borderRadius: '10px',
                  padding: '16px',
                  cursor: 'pointer',
                  opacity: earned ? 1 : 0.55,
                  transition: 'transform 0.15s, box-shadow 0.15s',
                }}
              >
                <div style={{ fontSize:'28px', marginBottom:'8px' }}>{b.icon}</div>
                <div style={{ fontSize:'14px', fontWeight:700, marginBottom:'4px', color: earned ? 'var(--t-text)' : 'var(--t-text-muted)' }}>{b.name}</div>
                <div style={{ fontSize:'12px', color:'var(--t-text-muted)', marginBottom:'8px' }}>{b.desc}</div>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                  <span style={S.tag(RARITY_COLOR[b.rarity])}>{b.rarity}</span>
                  <span style={{ fontSize:'11px', color:'var(--t-text-faint)' }}>{b.holder_count} have it</span>
                </div>
                {earned && <div style={{ marginTop:'8px', fontSize:'11px', color:'var(--t-success)', fontWeight:700 }}>✓ EARNED</div>}
              </div>
            )
          })}
        </div>
      )}

      {selected && (
        <div style={S.modal} onClick={() => setSelected(null)}>
          <div style={S.modalBox} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize:'40px', marginBottom:'8px' }}>{selected.icon}</div>
            <div style={S.modalTitle}>{selected.name}</div>
            <div style={{ marginBottom:'8px' }}>
              <span style={S.tag(RARITY_COLOR[selected.rarity])}>{selected.rarity}</span>
            </div>
            <div style={{ fontSize:'13px', color:'var(--t-text-muted)', marginBottom:'14px' }}>{selected.desc}</div>
            <div style={S.divider} />
            <div style={{ fontSize:'12px', fontWeight:700, color:'var(--t-text-muted)', marginBottom:'6px' }}>HOW TO EARN</div>
            <div style={{ fontSize:'13px', color:'var(--t-text)', marginBottom:'14px' }}>{selected.how_to}</div>
            <div style={{ fontSize:'12px', color:'var(--t-text-faint)' }}>
              {selected.holder_count} employee(s) have earned this badge.
            </div>
            <div style={S.divider} />
            <button style={S.btn('secondary')} onClick={() => setSelected(null)}>Close</button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Tab: Rewards Store ───────────────────────────────────────────────────────
function RewardsStore({ board, session, onReload }) {
  const employees = board.employees || []
  const rewards = board.rewards || []
  const [catFilter, setCatFilter] = useState('All')
  const [subTab, setSubTab]       = useState('catalog')
  const [redeemModal, setRedeemModal] = useState(null)
  const [busy, setBusy]           = useState(false)
  const [toast, setToast]         = useState(null)

  const myId = session?.person?.id
  const me   = employees.find(e => e.id === myId) ?? employees[0]
  const myPts = Number(me?.redeemable) || 0
  const myRedemptions = (board.redemptions || []).filter(r => r.person_id === me?.id)

  const cats = ['All', ...Array.from(new Set(rewards.map(r => r.category)))]
  const filtered = catFilter === 'All' ? rewards : rewards.filter(r => r.category === catFilter)

  function showToast(msg, type='success') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  async function handleRedeem(reward) {
    if (!me?.id) { showToast('No employee profile found.', 'error'); return }
    setBusy(true)
    const { error } = await sb.rpc('redeem_reward', { p_person_id: me.id, p_reward_id: reward.id })
    setBusy(false)
    if (error) { showToast(error.message || 'Redemption failed.', 'error'); return }
    showToast(`Redemption request for "${reward.name}" submitted!`)
    setRedeemModal(null)
    onReload?.()
  }

  return (
    <div>
      {toast && (
        <div style={{
          position:'fixed', top:'20px', right:'20px', zIndex:2000,
          background: toast.type === 'error' ? 'var(--t-danger)' : 'var(--t-success)',
          color:'#fff', padding:'12px 20px', borderRadius:'8px', fontWeight:700, fontSize:'13px',
          boxShadow:'0 4px 20px rgba(0,0,0,0.3)',
        }}>
          {toast.msg}
        </div>
      )}

      <div style={{ display:'flex', gap:'8px', marginBottom:'16px', alignItems:'center', justifyContent:'space-between' }}>
        <div style={{ display:'flex', gap:'6px' }}>
          <button style={S.btn(subTab === 'catalog' ? 'primary' : 'secondary')} onClick={() => setSubTab('catalog')}>Catalog</button>
          <button style={S.btn(subTab === 'history' ? 'primary' : 'secondary')} onClick={() => setSubTab('history')}>My Redemptions</button>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
          <span style={{ fontSize:'13px', color:'var(--t-text-muted)' }}>Your balance:</span>
          <span style={{ fontSize:'16px', fontWeight:800, color:'var(--t-accent)' }}>{fmt(myPts)}</span>
        </div>
      </div>

      {subTab === 'catalog' && (
        <>
          <div style={{ display:'flex', gap:'8px', marginBottom:'14px', flexWrap:'wrap' }}>
            {cats.map(c => (
              <button
                key={c}
                onClick={() => setCatFilter(c)}
                style={{ ...S.btn(catFilter === c ? 'primary' : 'secondary'), padding:'6px 14px', fontSize:'12px' }}
              >
                {c}
              </button>
            ))}
          </div>
          {filtered.length === 0 ? (
            <div style={{ color:'var(--t-text-muted)', fontSize:'13px' }}>No rewards in the catalog.</div>
          ) : (
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(240px,1fr))', gap:'14px' }}>
              {filtered.map(r => {
                const canAfford = myPts >= r.cost
                return (
                  <div
                    key={r.id}
                    style={{
                      background:'var(--t-surface)',
                      border:'1px solid var(--t-line)',
                      borderRadius:'10px',
                      padding:'16px',
                      display:'flex',
                      flexDirection:'column',
                      gap:'8px',
                    }}
                  >
                    <div style={{ fontSize:'28px' }}>{r.icon}</div>
                    <div style={{ fontSize:'14px', fontWeight:700 }}>{r.name}</div>
                    <div style={{ fontSize:'12px', color:'var(--t-text-muted)', flex:1 }}>{r.desc}</div>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                      <span style={{ fontSize:'15px', fontWeight:800, color:'var(--t-accent)' }}>{fmt(r.cost)} pts</span>
                      <span style={{ fontSize:'11px', fontWeight:700, color: AVAIL_COLOR[r.availability] }}>
                        {AVAIL_LABEL[r.availability] || r.availability}
                      </span>
                    </div>
                    <span style={S.tag('var(--t-text-muted)')}>{r.category}</span>
                    <button
                      style={{ ...S.btn('primary'), opacity: canAfford && r.availability !== 'sold-out' ? 1 : 0.4 }}
                      disabled={!canAfford || r.availability === 'sold-out'}
                      onClick={() => setRedeemModal(r)}
                    >
                      {r.availability === 'sold-out' ? 'Sold Out' : !canAfford ? `Need ${fmt(r.cost - myPts)} more pts` : 'Redeem'}
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}

      {subTab === 'history' && (
        <div style={S.card}>
          <div style={S.cardTitle}>My Redemption History</div>
          {myRedemptions.length === 0 ? (
            <div style={{ color:'var(--t-text-muted)', fontSize:'13px' }}>No redemptions yet.</div>
          ) : (
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'13px' }}>
              <thead>
                <tr>
                  {['Reward','Points','Status','Date'].map(h => (
                    <th key={h} style={{ textAlign:'left', padding:'8px', color:'var(--t-text-muted)', fontWeight:600, fontSize:'11px', borderBottom:'1px solid var(--t-line)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {myRedemptions.map(rd => (
                  <tr key={rd.id}>
                    <td style={{ padding:'9px 8px' }}>{rd.reward_name}</td>
                    <td style={{ padding:'9px 8px', color:'var(--t-accent)', fontWeight:700 }}>{fmt(rd.cost)}</td>
                    <td style={{ padding:'9px 8px' }}>
                      <span className={`badge ${rd.status === 'Approved' ? 'green' : rd.status === 'Pending' ? 'amber' : 'red'}`}>
                        {rd.status}
                      </span>
                    </td>
                    <td style={{ padding:'9px 8px', color:'var(--t-text-muted)' }}>{rd.date}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {redeemModal && (
        <div style={S.modal} onClick={() => setRedeemModal(null)}>
          <div style={S.modalBox} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize:'32px', marginBottom:'8px' }}>{redeemModal.icon}</div>
            <div style={S.modalTitle}>Redeem: {redeemModal.name}</div>
            <div style={{ fontSize:'13px', color:'var(--t-text-muted)', marginBottom:'14px' }}>{redeemModal.desc}</div>
            <div style={S.divider} />
            <div style={{ display:'flex', justifyContent:'space-between', marginBottom:'6px' }}>
              <span style={{ fontSize:'13px', color:'var(--t-text-muted)' }}>Cost</span>
              <span style={{ fontWeight:700, color:'var(--t-accent)' }}>{fmt(redeemModal.cost)} pts</span>
            </div>
            <div style={{ display:'flex', justifyContent:'space-between', marginBottom:'16px' }}>
              <span style={{ fontSize:'13px', color:'var(--t-text-muted)' }}>Your balance after</span>
              <span style={{ fontWeight:700, color: myPts - redeemModal.cost >= 0 ? 'var(--t-success)' : 'var(--t-danger)' }}>
                {fmt(myPts - redeemModal.cost)} pts
              </span>
            </div>
            <div style={{ display:'flex', gap:'10px' }}>
              <button style={{ ...S.btn('primary'), opacity: busy ? 0.5 : 1 }} disabled={busy} onClick={() => handleRedeem(redeemModal)}>
                {busy ? 'Submitting…' : 'Confirm Redemption'}
              </button>
              <button style={S.btn('secondary')} onClick={() => setRedeemModal(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Tab: Admin ───────────────────────────────────────────────────────────────
function AdminPanel({ board, session, onReload }) {
  const employees = board.employees || []
  const rules = board.rules || []
  const rewards = board.rewards || []
  const stats = board.stats || {}

  const [bonusEmp, setBonusEmp]     = useState('')
  const [bonusPts, setBonusPts]     = useState('')
  const [bonusReason, setBonusReason] = useState('')
  const [bonusLog, setBonusLog]     = useState([])
  const [editRule, setEditRule]     = useState(null)
  const [toast, setToast]           = useState(null)
  const [addReward, setAddReward]   = useState(false)
  const [busy, setBusy]             = useState(false)
  const [newRw, setNewRw]           = useState({ icon:'🎁', name:'', cost:'', category:'Experience', desc:'' })

  const actorId = session?.person?.id ?? null
  const totalExposure = Number(stats.total_reward_exposure) || 0
  const budgetLimit   = Number(stats.budget_limit) || 0
  const budgetUsed    = Number(stats.budget_used_month) || 0

  function showToast(msg, type='success') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  async function saveRule(id, newPts) {
    setBusy(true)
    const { error } = await sb.rpc('update_gamification_rule', { p_id: id, p_points: Number(newPts) })
    setBusy(false)
    setEditRule(null)
    if (error) { showToast(error.message || 'Update failed.', 'error'); return }
    showToast('Point rule updated.')
    onReload?.()
  }

  async function awardBonus() {
    if (!bonusEmp || !bonusPts || !bonusReason) { showToast('Fill all fields.','error'); return }
    setBusy(true)
    const { error } = await sb.rpc('award_gamification_points', {
      p_person_id: bonusEmp, p_points: Number(bonusPts),
      p_reason: bonusReason, p_category: 'Bonus', p_awarded_by: actorId,
    })
    setBusy(false)
    if (error) { showToast(error.message || 'Award failed.', 'error'); return }
    const emp = employees.find(e => e.id === bonusEmp)
    setBonusLog(prev => [{
      id: 'bl'+Date.now(),
      name: emp?.full_name ?? bonusEmp,
      pts: bonusPts,
      reason: bonusReason,
      date: new Date().toISOString().slice(0,10),
    }, ...prev])
    setBonusEmp(''); setBonusPts(''); setBonusReason('')
    showToast('Bonus awarded!')
    onReload?.()
  }

  async function addRewardItem() {
    if (!newRw.name || !newRw.cost) { showToast('Name and cost required.','error'); return }
    setBusy(true)
    const { error } = await sb.rpc('upsert_gamification_reward', {
      p_id: null, p_icon: newRw.icon, p_name: newRw.name, p_cost: Number(newRw.cost),
      p_category: newRw.category, p_desc: newRw.desc, p_availability: 'in-stock',
    })
    setBusy(false)
    if (error) { showToast(error.message || 'Add failed.', 'error'); return }
    setNewRw({ icon:'🎁', name:'', cost:'', category:'Experience', desc:'' })
    setAddReward(false)
    showToast('Reward added to catalog.')
    onReload?.()
  }

  async function removeReward(id) {
    setBusy(true)
    const { error } = await sb.rpc('delete_gamification_reward', { p_id: id })
    setBusy(false)
    if (error) { showToast(error.message || 'Remove failed.', 'error'); return }
    showToast('Reward removed.')
    onReload?.()
  }

  return (
    <div>
      {toast && (
        <div style={{
          position:'fixed', top:'20px', right:'20px', zIndex:2000,
          background: toast.type === 'error' ? 'var(--t-danger)' : 'var(--t-success)',
          color:'#fff', padding:'12px 20px', borderRadius:'8px', fontWeight:700, fontSize:'13px',
        }}>
          {toast.msg}
        </div>
      )}

      {/* Budget overview */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:'14px', marginBottom:'20px' }}>
        {[
          { label:'Total Reward Exposure', value:fmt(totalExposure) + ' pts', sub:'active catalog cost' },
          { label:'Manual Bonuses (Month)', value:fmt(budgetUsed) + ' pts', sub:'awarded this month' },
          { label:'Budget Remaining', value: fmt(Math.max(0, budgetLimit - budgetUsed)) + ' pts', sub:'of ' + fmt(budgetLimit) + ' limit' },
        ].map(k => (
          <div key={k.label} style={S.kpiTile}>
            <div style={S.kpiLabel}>{k.label}</div>
            <div style={S.kpiValue}>{k.value}</div>
            <div style={S.kpiSub}>{k.sub}</div>
          </div>
        ))}
      </div>

      {/* Point Rules */}
      <div style={S.card}>
        <div style={S.cardTitle}>Point Rules</div>
        {rules.length === 0 ? (
          <div style={{ color:'var(--t-text-muted)', fontSize:'13px' }}>No point rules configured.</div>
        ) : (
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'13px' }}>
            <thead>
              <tr>
                {['Action','Category','Points','Edit'].map(h => (
                  <th key={h} style={{ textAlign:'left', padding:'8px', color:'var(--t-text-muted)', fontWeight:600, fontSize:'11px', borderBottom:'1px solid var(--t-line)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rules.map(r => (
                <tr key={r.id}>
                  <td style={{ padding:'9px 8px', color:'var(--t-text)' }}>{r.action}</td>
                  <td style={{ padding:'9px 8px' }}>
                    <span className="badge blue">{r.category}</span>
                  </td>
                  <td style={{ padding:'9px 8px', fontWeight:700, color:'var(--t-accent)' }}>
                    {editRule === r.id ? (
                      <input
                        type="number"
                        defaultValue={r.points}
                        style={{ ...S.input, width:'80px' }}
                        id={'rule-input-'+r.id}
                      />
                    ) : (
                      '+' + r.points
                    )}
                  </td>
                  <td style={{ padding:'9px 8px' }}>
                    {editRule === r.id ? (
                      <div style={{ display:'flex', gap:'6px' }}>
                        <button style={{ ...S.btn('primary'), padding:'4px 10px', fontSize:'12px' }}
                          onClick={() => saveRule(r.id, document.getElementById('rule-input-'+r.id)?.value)}>
                          Save
                        </button>
                        <button style={{ ...S.btn('secondary'), padding:'4px 10px', fontSize:'12px' }}
                          onClick={() => setEditRule(null)}>
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button style={{ ...S.btn('secondary'), padding:'4px 10px', fontSize:'12px' }}
                        onClick={() => setEditRule(r.id)}>
                        Edit
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Manual Bonus */}
      <div style={S.card}>
        <div style={S.cardTitle}>Award Manual Bonus</div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 120px 1fr', gap:'10px', marginBottom:'12px', alignItems:'end' }}>
          <div>
            <div style={{ fontSize:'12px', color:'var(--t-text-muted)', marginBottom:'4px' }}>Employee</div>
            <select style={S.select} value={bonusEmp} onChange={e => setBonusEmp(e.target.value)}>
              <option value="">— Select —</option>
              {employees.map(e => <option key={e.id} value={e.id}>{e.full_name} ({e.location})</option>)}
            </select>
          </div>
          <div>
            <div style={{ fontSize:'12px', color:'var(--t-text-muted)', marginBottom:'4px' }}>Points</div>
            <input style={S.input} type="number" min="1" placeholder="e.g. 100" value={bonusPts} onChange={e => setBonusPts(e.target.value)} />
          </div>
          <div>
            <div style={{ fontSize:'12px', color:'var(--t-text-muted)', marginBottom:'4px' }}>Reason</div>
            <input style={S.input} placeholder="Outstanding performance..." value={bonusReason} onChange={e => setBonusReason(e.target.value)} />
          </div>
        </div>
        <button style={{ ...S.btn('primary'), opacity: busy ? 0.5 : 1 }} disabled={busy} onClick={awardBonus}>Award Bonus</button>

        {bonusLog.length > 0 && (
          <div style={{ marginTop:'16px' }}>
            <div style={{ fontSize:'12px', fontWeight:700, color:'var(--t-text-muted)', marginBottom:'8px' }}>BONUS LOG (THIS SESSION)</div>
            {bonusLog.map(b => (
              <div key={b.id} style={{ display:'flex', justifyContent:'space-between', padding:'7px 0', borderBottom:'1px solid var(--t-line)', fontSize:'13px' }}>
                <span>{b.name}</span>
                <span style={{ color:'var(--t-accent)', fontWeight:700 }}>+{b.pts} pts</span>
                <span style={{ color:'var(--t-text-muted)' }}>{b.reason}</span>
                <span style={{ color:'var(--t-text-faint)' }}>{b.date}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Rewards Catalog Management */}
      <div style={S.card}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'14px' }}>
          <div style={S.cardTitle}>Rewards Catalog Management</div>
          <button style={S.btn('primary')} onClick={() => setAddReward(true)}>+ Add Reward</button>
        </div>

        {addReward && (
          <div style={{ background:'var(--t-surface-2)', border:'1px solid var(--t-line)', borderRadius:'10px', padding:'16px', marginBottom:'14px' }}>
            <div style={{ display:'grid', gridTemplateColumns:'60px 1fr 100px 1fr', gap:'10px', marginBottom:'10px' }}>
              <div>
                <div style={{ fontSize:'12px', color:'var(--t-text-muted)', marginBottom:'4px' }}>Icon</div>
                <input style={S.input} value={newRw.icon} onChange={e => setNewRw(p=>({...p,icon:e.target.value}))} placeholder="🎁" />
              </div>
              <div>
                <div style={{ fontSize:'12px', color:'var(--t-text-muted)', marginBottom:'4px' }}>Name</div>
                <input style={S.input} value={newRw.name} onChange={e => setNewRw(p=>({...p,name:e.target.value}))} placeholder="Reward name" />
              </div>
              <div>
                <div style={{ fontSize:'12px', color:'var(--t-text-muted)', marginBottom:'4px' }}>Cost (pts)</div>
                <input style={S.input} type="number" value={newRw.cost} onChange={e => setNewRw(p=>({...p,cost:e.target.value}))} placeholder="500" />
              </div>
              <div>
                <div style={{ fontSize:'12px', color:'var(--t-text-muted)', marginBottom:'4px' }}>Category</div>
                <select style={S.select} value={newRw.category} onChange={e => setNewRw(p=>({...p,category:e.target.value}))}>
                  {['Schedule Perks','Gift Cards','Company Swag','Experience','Twisted Growers Privileges'].map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
            </div>
            <div style={{ marginBottom:'10px' }}>
              <div style={{ fontSize:'12px', color:'var(--t-text-muted)', marginBottom:'4px' }}>Description</div>
              <input style={S.input} value={newRw.desc} onChange={e => setNewRw(p=>({...p,desc:e.target.value}))} placeholder="What the employee gets..." />
            </div>
            <div style={{ display:'flex', gap:'8px' }}>
              <button style={{ ...S.btn('primary'), opacity: busy ? 0.5 : 1 }} disabled={busy} onClick={addRewardItem}>Add to Catalog</button>
              <button style={S.btn('secondary')} onClick={() => setAddReward(false)}>Cancel</button>
            </div>
          </div>
        )}

        {rewards.length === 0 ? (
          <div style={{ color:'var(--t-text-muted)', fontSize:'13px' }}>No rewards in the catalog.</div>
        ) : (
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'13px' }}>
            <thead>
              <tr>
                {['','Name','Category','Cost','Availability','Remove'].map(h => (
                  <th key={h} style={{ textAlign:'left', padding:'8px', color:'var(--t-text-muted)', fontWeight:600, fontSize:'11px', borderBottom:'1px solid var(--t-line)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rewards.map(r => (
                <tr key={r.id}>
                  <td style={{ padding:'9px 8px', fontSize:'18px' }}>{r.icon}</td>
                  <td style={{ padding:'9px 8px', fontWeight:600 }}>{r.name}</td>
                  <td style={{ padding:'9px 8px' }}><span className="badge cyan">{r.category}</span></td>
                  <td style={{ padding:'9px 8px', color:'var(--t-accent)', fontWeight:700 }}>{fmt(r.cost)}</td>
                  <td style={{ padding:'9px 8px' }}>
                    <span className={`badge ${r.availability==='in-stock'?'green':r.availability==='limited'?'amber':'red'}`}>
                      {r.availability}
                    </span>
                  </td>
                  <td style={{ padding:'9px 8px' }}>
                    <button style={{ ...S.btn('secondary'), padding:'4px 10px', fontSize:'11px', color:'var(--t-danger)', border:'1px solid var(--t-danger)' }}
                      disabled={busy}
                      onClick={() => removeReward(r.id)}>
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function Gamification() {
  const { session } = useAuth()
  const { locationIds } = useScope()

  const [board, setBoard]     = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)
  const [activeTab, setActiveTab] = useState('profile')

  const roleRaw = session?.person?.role_name?.toLowerCase() ?? ''
  const isHR    = ['ceo','hr','manager','coo','admin','owner'].some(r => roleRaw.includes(r))

  const TABS = [
    { id:'profile',    label:'My Profile' },
    { id:'leaderboard',label:'Leaderboard' },
    { id:'badges',     label:'Badges' },
    { id:'rewards',    label:'Rewards Store' },
    ...(isHR ? [{ id:'admin', label:'Admin' }] : []),
  ]

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const { data, error } = await sb.rpc('get_gamification_board', { p_node_ids: locationIds })
    if (error) {
      setError(error.message || 'Failed to load gamification data.')
      setBoard(null)
    } else {
      setBoard(data || { employees: [], rules: [], rewards: [], badges: [], redemptions: [], stats: {} })
    }
    setLoading(false)
  }, [locationIds])

  useEffect(() => { load() }, [load])

  if (loading) {
    return (
      <div style={{ ...S.screen, display:'flex', alignItems:'center', justifyContent:'center', minHeight:'300px' }}>
        <div style={{ color:'var(--t-text-muted)', fontSize:'14px' }}>Loading gamification data…</div>
      </div>
    )
  }

  if (error || !board) {
    return (
      <div style={S.screen}>
        <div style={S.title}>Gamification Engine</div>
        <div style={{ ...S.card, color:'var(--t-danger)', fontSize:'13px' }}>
          Could not load gamification data. {error}
        </div>
      </div>
    )
  }

  return (
    <div style={S.screen}>
      <div style={S.title}>Gamification Engine</div>
      <div style={S.subtitle}>Employee engagement — points, badges, levels, streaks &amp; rewards</div>

      <KPIPanel board={board} />

      <div style={S.tabs}>
        {TABS.map(t => (
          <button key={t.id} style={S.tab(activeTab === t.id)} onClick={() => setActiveTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === 'profile'     && <MyProfile    board={board} session={session} />}
      {activeTab === 'leaderboard' && <Leaderboard  board={board} session={session} />}
      {activeTab === 'badges'      && <Badges       board={board} session={session} />}
      {activeTab === 'rewards'     && <RewardsStore board={board} session={session} onReload={load} />}
      {activeTab === 'admin' && isHR && <AdminPanel board={board} session={session} onReload={load} />}
    </div>
  )
}
