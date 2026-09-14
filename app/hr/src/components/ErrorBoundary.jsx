import { Component } from 'react'

// Route-level error boundary. Catches render/runtime crashes in a screen so a
// single broken page shows a recoverable panel instead of blanking the whole app.
// Keyed by route path in App so navigating away resets it automatically.
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    // Surface in console for debugging; no external reporting.
    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary] screen crashed:', error, info?.componentStack)
  }

  handleReset = () => this.setState({ error: null })

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    return (
      <div style={{ padding: '48px 32px', color: 'var(--t-text)', maxWidth: 720 }}>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.1em', color: 'var(--t-warn)', textTransform: 'uppercase', marginBottom: 10 }}>
          Screen Error
        </div>
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: '0 0 8px' }}>This page hit a problem</h1>
        <div style={{ fontSize: 13, color: 'var(--t-text-muted)', marginBottom: 20 }}>
          The rest of the platform is unaffected — use the navigation to move to another page, or retry below.
        </div>
        <pre style={{
          fontSize: 11, fontFamily: 'monospace', color: 'var(--t-text-muted)',
          background: 'var(--t-surface-2)', border: '1px solid var(--t-line)',
          padding: '12px 14px', borderRadius: 0, overflowX: 'auto', marginBottom: 20, whiteSpace: 'pre-wrap',
        }}>
          {String(error?.message || error)}
        </pre>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={this.handleReset} style={{
            fontSize: 12, fontWeight: 700, padding: '9px 18px', background: 'var(--t-accent)',
            border: 'none', color: '#fff', borderRadius: 0, cursor: 'pointer', letterSpacing: '.04em',
          }}>
            ↺ Retry
          </button>
          <button onClick={() => { window.location.href = '/' }} style={{
            fontSize: 12, fontWeight: 600, padding: '9px 18px', background: 'var(--t-surface)',
            border: '1px solid var(--t-line)', color: 'var(--t-text-muted)', borderRadius: 0, cursor: 'pointer',
          }}>
            Go to Dashboard
          </button>
        </div>
      </div>
    )
  }
}
