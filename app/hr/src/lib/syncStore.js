// syncStore.js — durable cross-device persistence for config/list features.
// localStorage is the fast cache; Supabase (app_state table) is the source of
// truth so data survives a browser/device change. Write-through on save; hydrate
// from the DB on mount (merging into local cache).
import { sb } from './supabase'

function actor() { try { return JSON.parse(sessionStorage.getItem('vip_session') || '{}')?.person?.full_name || 'system' } catch { return 'system' } }

// synchronous cache read (for useState initializers)
export function loadCached(key, def) {
  try { const r = localStorage.getItem(key); return r ? JSON.parse(r) : def } catch { return def }
}

// write to cache immediately + push to Supabase (best-effort, non-blocking)
export function saveSynced(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)) } catch (_) {}
  try { sb.rpc('set_app_state', { p_key: key, p_value: value, p_by: actor() }).then(() => {}, () => {}) } catch (_) {}
  return value
}

// hydrate from Supabase (source of truth). Returns the DB value or null.
export async function hydrate(key) {
  try {
    const { data } = await sb.rpc('get_app_state', { p_key: key })
    if (data != null) { try { localStorage.setItem(key, JSON.stringify(data)) } catch (_) {} ; return data }
  } catch (_) {}
  return null
}
