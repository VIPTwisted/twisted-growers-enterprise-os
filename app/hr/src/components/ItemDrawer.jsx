// ItemDrawer.jsx — Monday.com-style item panel: slides in from the right with
// the item's details + an Updates feed (comments) you can post to. Generic:
// works on any entity via (entityType, entityId). Backed by get_comments/add_comment.
import { useState, useEffect, useCallback } from 'react'
import { sb } from '../lib/supabase'

const initials = (n) => !n ? '?' : n.split(' ').map(x => x[0]).slice(0, 2).join('').toUpperCase()
const when = (s) => {
  if (!s) return ''
  const diff = Math.floor((Date.now() - new Date(s).getTime()) / 60000)
  if (diff < 1) return 'just now'
  if (diff < 60) return `${diff}m ago`
  if (diff < 1440) return `${Math.floor(diff / 60)}h ago`
  return new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export default function ItemDrawer({ open, onClose, entityType, entityId, title, subtitle, fields = [], actorId, accent = 'var(--t-accent)', actions = null }) {
  const [comments, setComments] = useState([])
  const [loading, setLoading] = useState(false)
  const [body, setBody] = useState('')
  const [posting, setPosting] = useState(false)

  const load = useCallback(async () => {
    if (!entityId) return
    setLoading(true)
    try {
      const { data } = await sb.rpc('get_comments', { p_entity_type: entityType, p_entity_id: entityId })
      setComments(Array.isArray(data) ? data : [])
    } catch { setComments([]) } finally { setLoading(false) }
  }, [entityType, entityId])

  useEffect(() => { if (open && entityId) { setBody(''); load() } }, [open, entityId, load])

  async function post() {
    const text = body.trim()
    if (!text || posting) return
    setPosting(true)
    const optimistic = { id: 'tmp-' + Date.now(), body: text, author_name: 'You', created_at: new Date().toISOString(), mentions: [] }
    setComments(c => [...c, optimistic]); setBody('')
    try {
      const { data, error } = await sb.rpc('add_comment', { p_entity_type: entityType, p_entity_id: entityId, p_author_id: actorId, p_body: text })
      if (error || !data?.ok) throw new Error('failed')
      load()
    } catch {
      setComments(c => c.filter(x => x.id !== optimistic.id)); setBody(text)
    } finally { setPosting(false) }
  }

  if (!open) return null

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9998, display: 'flex', justifyContent: 'flex-end' }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: 'min(440px, 94vw)', height: '100%', background: 'var(--t-bg)', borderLeft: `1px solid var(--t-line)`,
        display: 'flex', flexDirection: 'column', boxShadow: '-8px 0 40px rgba(0,0,0,0.5)', animation: 'none',
      }}>
        {/* header */}
        <div style={{ padding: '16px 18px', borderBottom: '1px solid var(--t-line)', background: 'var(--t-surface)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
            <div>
              <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--t-text)', borderLeft: `3px solid ${accent}`, paddingLeft: 10 }}>{title || 'Item'}</div>
              {subtitle && <div style={{ fontSize: 12, color: 'var(--t-text-muted)', marginTop: 4, paddingLeft: 13 }}>{subtitle}</div>}
            </div>
            <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--t-text-muted)', fontSize: 22, cursor: 'pointer', lineHeight: 1 }}>×</button>
          </div>
          {actions && <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>{actions}</div>}
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: 18 }}>
          {/* details */}
          {fields.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.08em', color: 'var(--t-text-muted)', textTransform: 'uppercase', marginBottom: 8 }}>Details</div>
              <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr', rowGap: 8, columnGap: 10, fontSize: 13 }}>
                {fields.map((f, i) => (
                  <>
                    <div key={'l' + i} style={{ color: 'var(--t-text-muted)', fontSize: 12 }}>{f.label}</div>
                    <div key={'v' + i} style={{ color: 'var(--t-text)', fontWeight: 500 }}>{f.value ?? '—'}</div>
                  </>
                ))}
              </div>
            </div>
          )}

          {/* updates */}
          <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.08em', color: 'var(--t-text-muted)', textTransform: 'uppercase', marginBottom: 10 }}>
            Updates {comments.length > 0 && `(${comments.length})`}
          </div>
          {loading ? <div style={{ fontSize: 12, color: 'var(--t-accent)' }}>Loading…</div> :
            comments.length === 0 ? <div style={{ fontSize: 12, color: 'var(--t-text-faint)', padding: '8px 0 16px' }}>No updates yet. Start the conversation below.</div> :
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>
                {comments.map(c => (
                  <div key={c.id} style={{ display: 'flex', gap: 10 }}>
                    <span style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--t-surface-2)', border: '1px solid var(--t-line)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800, color: 'var(--t-text-muted)', flexShrink: 0 }}>{initials(c.author_name)}</span>
                    <div style={{ flex: 1, background: 'var(--t-surface)', border: '1px solid var(--t-line)', padding: '8px 12px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 3 }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--t-text)' }}>{c.author_name || 'Unknown'}</span>
                        <span style={{ fontSize: 10, color: 'var(--t-text-faint)' }}>{when(c.created_at)}</span>
                      </div>
                      <div style={{ fontSize: 13, color: 'var(--t-text)', whiteSpace: 'pre-wrap' }}>{c.body}</div>
                    </div>
                  </div>
                ))}
              </div>}
        </div>

        {/* composer */}
        <div style={{ padding: 14, borderTop: '1px solid var(--t-line)', background: 'var(--t-surface)' }}>
          <textarea value={body} onChange={e => setBody(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) post() }}
            placeholder="Write an update…  (⌘/Ctrl+Enter to send)"
            rows={2}
            style={{ width: '100%', resize: 'none', background: 'var(--t-bg)', color: 'var(--t-text)', border: '1px solid var(--t-line)', padding: 10, fontSize: 13, fontFamily: 'inherit' }} />
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
            <button onClick={post} disabled={posting || !body.trim()} style={{
              padding: '7px 18px', fontSize: 12, fontWeight: 700, cursor: posting || !body.trim() ? 'default' : 'pointer',
              background: body.trim() ? accent : 'var(--t-surface-2)', color: body.trim() ? 'var(--t-on-grad,#04212a)' : 'var(--t-text-faint)',
              border: 'none', opacity: posting ? 0.6 : 1,
            }}>{posting ? 'Posting…' : 'Update'}</button>
          </div>
        </div>
      </div>
    </div>
  )
}
