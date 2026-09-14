import { createContext, useContext, useState, useEffect } from 'react'
import { pinLogin, sb, ensureSession } from '../lib/supabase'
import { logAudit } from './audit.js'
import { applySavedTheme } from './theme.js'

const AuthCtx = createContext(null)
export const useAuth = () => useContext(AuthCtx)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem('vip_session')) } catch { return null }
  })
  const [ssoTried, setSsoTried] = useState(false)

  // Signed into the Twisted Growers OS already? Then this is the same person — no second login.
  // session_login() links the OS user to their HR person (or creates it from the OS login) and returns
  // the same shape pin_login does. A kiosk with no OS session falls through to Employee ID + PIN.
  useEffect(() => {
    if (session) { setSsoTried(true); return }
    let alive = true
    ;(async () => {
      try {
        const { source } = await ensureSession()
        if (source === 'os') {
          const { data } = await sb.rpc('session_login')
          if (alive && data && data.ok) {
            const s = { person: data.person, nodes: data.nodes || [], sso: true }
            setSession(s)
            sessionStorage.setItem('vip_session', JSON.stringify(s))
            applySavedTheme(data.person)
            logAudit('Login', { target: data.person?.login_id, via: 'os-session' })
          }
        }
      } catch (e) { console.warn('[tg-hr] OS sign-on not available:', e?.message) }
      if (alive) setSsoTried(true)
    })()
    return () => { alive = false }
  }, [])

  async function login(loginId, pin) {
    const res = await pinLogin(loginId, pin)
    if (!res || !res.ok) return { ok: false }
    const s = { person: res.person, nodes: res.nodes || [] }
    setSession(s)
    sessionStorage.setItem('vip_session', JSON.stringify(s))
    applySavedTheme(res.person)
    // signal the login greeting to fire on THIS login (consumed once by GreetingModal)
    try { sessionStorage.setItem('vip_login_greet', String(Date.now())) } catch (_) {}
    logAudit('Login', { target: loginId })
    return { ok: true }
  }

  function logout() {
    logAudit('Logout')
    setSession(null)
    sessionStorage.removeItem('vip_session')
  }

  return <AuthCtx.Provider value={{ session, login, logout, ssoTried }}>{children}</AuthCtx.Provider>
}
