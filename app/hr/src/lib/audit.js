// audit.js — client hook into the immutable Supabase audit_log.
// Fire-and-forget: never blocks the UI, never throws. Actor is read from the
// active session. Use logAudit() at every meaningful action (login, role change,
// coverage request, DA, timecard edit, permission change, export, etc.).
import { sb } from './supabase'

function actor() {
  try { const p = JSON.parse(sessionStorage.getItem('vip_session') || '{}')?.person || {}; return { id: p.id || null, name: p.full_name || 'Unknown', role: p.role_name || '' } }
  catch { return { id: null, name: 'Unknown', role: '' } }
}

export function logAudit(action, opts = {}) {
  const a = actor()
  const isUuid = a.id && /^[0-9a-f-]{36}$/i.test(String(a.id))
  try {
    sb.rpc('write_audit', {
      p_actor_id: isUuid ? a.id : null,
      p_actor_name: opts.actorName || a.name,
      p_actor_role: a.role,
      p_action: action,
      p_target: opts.target || null,
      p_node_name: opts.node || null,
      p_result: opts.result || 'Success',
      p_meta: opts.meta || null,
    }).then(() => {}, () => {})
  } catch (_) {}
}

export async function fetchAuditLog({ from = null, to = null, action = null, limit = 500 } = {}) {
  try {
    const { data } = await sb.rpc('get_audit_log', { p_from: from, p_to: to, p_action: action, p_limit: limit })
    return Array.isArray(data) ? data : []
  } catch (_) { return [] }
}
