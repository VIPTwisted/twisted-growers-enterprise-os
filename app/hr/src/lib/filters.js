// filters.js — tiny helpers to wire the shared FilterBar (with custom date range)
// into any list/table screen in a few lines. HR/COO/management filtering, sitewide.
import { useState, useCallback } from 'react'

// filter-value state + setter + clear, ready for <FilterBar value onChange onClear/>
export function useFilters(initial = {}) {
  const [fv, setFv] = useState(initial)
  const onChange = useCallback((k, v) => setFv(p => ({ ...p, [k]: v })), [])
  const onClear = useCallback(() => setFv({}), [])
  return { fv, setFv, onChange, onClear }
}

// ── matchers ──
export function matchSearch(row, q, fields) {
  if (!q) return true
  const s = String(q).toLowerCase()
  return fields.some(f => String(typeof f === 'function' ? f(row) : row[f] ?? '').toLowerCase().includes(s))
}
export function matchMulti(val, sel) {
  if (!sel || !sel.length) return true
  return sel.includes(val)
}
// dateStr: 'YYYY-MM-DD' (or anything Date-parseable); range: {from,to}
export function matchDateRange(dateStr, range) {
  if (!range || (!range.from && !range.to)) return true
  if (!dateStr) return false
  const d = String(dateStr).slice(0, 10)
  if (range.from && d < range.from) return false
  if (range.to && d > range.to) return false
  return true
}

// generic apply: config = [{ key, type, get }]  where get(row)->value
// type: 'search'(get returns array of fields) | 'multi' | 'daterange'
export function applyFilters(rows, fv, config) {
  return (rows || []).filter(row => config.every(c => {
    const v = fv[c.key]
    if (c.type === 'search') return matchSearch(row, v, c.fields)
    if (c.type === 'multi') return matchMulti(c.get(row), v)
    if (c.type === 'daterange') return matchDateRange(c.get(row), v)
    return true
  }))
}
