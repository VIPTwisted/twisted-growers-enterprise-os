// locations.js — the places a screen may group, filter or colour by are the SESSION'S NODES,
// never a list typed into the screen (Bible §12g, 14 Sep 2026: "dynamic not hardwired").
// The clone carried its own five Connecticut stores in fourteen screens; TG has one facility
// and its departments, read here from the session hr.session_login() / pin_login() returned.
// Module-level constants in those screens call these at import time — the routes only mount
// after a session exists, so the list is the real one; an empty list is an honest empty.

function readNodes() {
  try {
    const s = JSON.parse(sessionStorage.getItem('vip_session'))
    return Array.isArray(s?.nodes) ? s.nodes : []
  } catch { return [] }
}

/* Names to group by: the location(s) first, then every department beneath them. */
export function getLocationNames() {
  const nodes = readNodes()
  const locs = nodes.filter(n => n.node_type === 'location').map(n => n.name)
  const depts = nodes.filter(n => n.node_type === 'department').map(n => n.name)
  return [...new Set([...locs, ...depts])]
}

/* Location names only (one facility today). */
export function getSiteNames() {
  return [...new Set(readNodes().filter(n => n.node_type === 'location').map(n => n.name))]
}

/* node id → name, for rows that carry a node_id. */
export function getNodeNameMap() {
  return Object.fromEntries(readNodes().map(n => [n.id, n.name]))
}

/* A stable accent per name — no name has a colour typed into a screen. */
const PALETTE = ['var(--t-accent)', 'var(--t-success)', 'var(--t-warn)', '#a78bfa', '#f472b6', '#2979ff', '#f59e0b', '#22d3ee']
export function locColor(name) {
  if (!name) return 'var(--t-text-muted)'
  let h = 0
  for (const c of String(name)) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return PALETTE[h % PALETTE.length]
}
export function locBorder(name) {
  const c = locColor(name)
  return c.startsWith('#') ? c + '80' : c
}
