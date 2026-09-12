// SAMPLE DATA banner — shown on screens whose content is illustrative sample data,
// not live records. D365 "demo company" rule: sample data must be unmistakable.
// Uses the app's own theme tokens; no new colors or styling language introduced.
export default function SampleDataBanner({ note }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      border: '1px solid var(--t-warning, var(--t-accent))',
      background: 'var(--t-surface-2)',
      color: 'var(--t-text)',
      padding: '10px 14px', marginBottom: 16, fontSize: 13,
    }}>
      <span style={{
        fontWeight: 800, fontSize: 11, letterSpacing: 1, textTransform: 'uppercase',
        color: 'var(--t-warning, var(--t-accent))', whiteSpace: 'nowrap',
      }}>⚠ Sample data</span>
      <span style={{ color: 'var(--t-text-muted)' }}>
        {note || 'This screen shows illustrative sample records — it is not yet connected to live data. Names, cases, and figures here are fictional.'}
      </span>
    </div>
  )
}
