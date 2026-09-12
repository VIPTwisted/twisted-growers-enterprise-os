import { useState, useEffect } from 'react'
import { scopeData } from '../lib/supabase'
import { useAuth } from './auth.jsx'
import { useScope } from './scope.jsx'

// Loads live roster + shift counts for the current scope. No hardcoded data.
export function useScopeData() {
  const { session } = useAuth()
  const { locationIds } = useScope()
  const [state, setState] = useState({ loading: true, error: null, data: null })

  useEffect(() => {
    let alive = true
    setState({ loading: true, error: null, data: null })
    if (!locationIds.length) { setState({ loading: false, error: 'No locations in scope', data: null }); return }
    scopeData(session.person.id, locationIds)
      .then(res => {
        if (!alive) return
        if (!res || !res.ok) { setState({ loading: false, error: res?.error || 'No access', data: null }); return }
        setState({ loading: false, error: null, data: res })
      })
      .catch(e => alive && setState({ loading: false, error: e.message || String(e), data: null }))
    return () => { alive = false }
  }, [session.person.id, locationIds.join(',')])

  return state
}
