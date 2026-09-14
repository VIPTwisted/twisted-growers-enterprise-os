import { createContext, useContext, useState, useMemo, useEffect } from 'react'
import { useAuth } from './auth.jsx'

const ScopeCtx = createContext(null)
export const useScope = () => useContext(ScopeCtx)

// Executive roles have unrestricted, company-wide visibility. The scope selector
// can never hide data from them — they always resolve to every location.
const EXEC_RX = /admin|owner|coo|ceo|cfo|president|chief/i

export function ScopeProvider({ children }) {
  const { session } = useAuth()
  const isExec = EXEC_RX.test(session?.person?.role_name || '')

  const locations = useMemo(
    () => (session?.nodes || []).filter(n => n.node_type === 'location'),
    [session]
  )
  const allNodeIds = useMemo(() => (session?.nodes || []).map(n => n.id), [session])

  // Scope persists across reloads (the role switcher reloads the page; a manual
  // refresh shouldn't silently reset what location you were viewing).
  const [scope, setScopeState] = useState(() => {
    try { const saved = sessionStorage.getItem('vip_scope'); if (saved) return saved } catch { /* ignore */ }
    return (isExec || locations.length > 1) ? 'ALL' : (locations[0]?.id || null)
  })
  const setScope = (v) => { setScopeState(v); try { sessionStorage.setItem('vip_scope', v) } catch { /* ignore */ } }

  // Self-heal: if a persisted scope points at a location this session can't see
  // (e.g. after switching to a different user), fall back to All.
  useEffect(() => {
    if (scope && scope !== 'ALL' && locations.length && !locations.some(l => l.id === scope)) {
      setScope('ALL')
    }
  }, [scope, locations])

  // The selector drives what every page shows — for EXECS too. Execs are still
  // entitled to every location (RLS-safe), so narrowing here is purely a view
  // preference; they default to 'ALL' and can switch back at any time.
  // TWISTED GROWERS: people are assigned to DEPARTMENT nodes under the one facility
  // (hr.sync_person_from_os), not to the location itself as VIP's were. Every RPC scopes
  // with `node_id = any(p_node_ids)`, so a location id alone reached 11 of 27 people
  // (measured 14 Sep 2026). The scope therefore carries the location FIRST (screens that
  // take locationIds[0] as "the" node keep working) and then every node beneath it, read
  // from the session's own reachable nodes by ltree path — nothing hardwired.
  const withDescendants = (ids) => {
    const nodes = session?.nodes || []
    const out = []
    for (const id of ids) {
      const root = nodes.find(n => n.id === id)
      out.push(id)
      if (!root?.path) continue
      for (const n of nodes) if (n.id !== id && n.path && n.path.startsWith(root.path + '.')) out.push(n.id)
    }
    return [...new Set(out)]
  }
  const locationIds = useMemo(() => {
    if (scope === 'ALL' || scope == null) return withDescendants(locations.map(l => l.id))
    const node = (session?.nodes || []).find(n => n.id === scope)
    if (node && node.node_type === 'location') return withDescendants([scope])
    return withDescendants(locations.map(l => l.id)) // portfolio/company → all reachable locations
  }, [scope, session, locations])

  // The single location currently in focus (null when viewing All). Pages use
  // this to show a consistent "you are viewing X" indicator and to sync their
  // own local selectors to the global scope.
  const activeLocation = useMemo(
    () => (scope && scope !== 'ALL') ? (locations.find(l => l.id === scope) || null) : null,
    [scope, locations]
  )
  const isAllScope = !activeLocation

  return (
    <ScopeCtx.Provider value={{ scope, setScope, locations, locationIds, activeLocation, isAllScope, isExec, allNodeIds, nodes: session?.nodes || [] }}>
      {children}
    </ScopeCtx.Provider>
  )
}
