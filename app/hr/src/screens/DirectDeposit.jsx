import { useState, useEffect, useCallback, useMemo } from 'react';
import { sb, getSession } from '../lib/supabase';
import { useAuth } from '../lib/auth.jsx';
import { useScope } from '../lib/scope.jsx';
import DrillDown from '../components/DrillDown.jsx';

// ── HELPERS ───────────────────────────────────────────────────────────────────

function maskAcct(val) {
  if (!val) return '—';
  const s = String(val);
  return '••••' + s.slice(-4);
}

function maskRouting(val) {
  if (!val) return '—';
  const s = String(val);
  return '•••••' + s.slice(-4);
}

function fmt$(n) {
  return '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(d) {
  if (!d) return '—';
  const dt = new Date(d);
  if (isNaN(dt)) return '—';
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function toast(msg, type = 'success') {
  try { window.dispatchEvent(new CustomEvent('vip-toast', { detail: { msg, type } })); } catch (_) { /* non-browser */ }
}

const CUR_YEAR = new Date().getFullYear();

// Map a real pay_stubs row to the shape the UI renders.
function mapStub(s) {
  const gross = Number(s.gross) || 0;
  const fed = Number(s.fed_tax) || 0, st = Number(s.state_tax) || 0, ct = Number(s.ct_tax) || 0;
  const health = Number(s.health) || 0, k401 = Number(s.retirement_401k) || 0, other = Number(s.other_deductions) || 0;
  const total_ded = (s.total_ded != null) ? Number(s.total_ded) : (fed + st + ct + health + k401 + other);
  const net = (s.net != null) ? Number(s.net) : (gross - total_ded);
  const ref = s.pay_date || s.period_end;
  return {
    id: s.id,
    period_start: s.period_start, period_end: s.period_end, pay_date: s.pay_date,
    reg_hours: Number(s.reg_hours) || 0, ot_hours: Number(s.ot_hours) || 0, tips: Number(s.tips) || 0,
    gross, fed_tax: fed, state_tax: st, ct_tax: ct, health, k401, other_deductions: other,
    total_ded, net, status: s.status || 'Paid',
    year: ref ? new Date(ref).getFullYear() : CUR_YEAR,
  };
}

// ── KPI TILE ──────────────────────────────────────────────────────────────────

function KTile({ label, value, sub, color, alert, onClick }) {
  return (
    <div onClick={onClick} title={onClick ? 'Click to drill into records' : undefined} style={{
      background: 'var(--t-surface)',
      border: `1px solid ${alert === 'red' ? 'var(--t-danger)' : alert === 'amber' ? 'var(--t-warn)' : 'var(--t-line)'}`,
      padding: '14px 16px',
      position: 'relative',
      overflow: 'hidden',
      borderRadius: 6,
      cursor: onClick ? 'pointer' : 'default',
    }}>
      {alert === 'red'   && <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'var(--t-danger)' }} />}
      {alert === 'amber' && <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'var(--t-warn)' }} />}
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.08em', color: 'var(--t-text-muted)', textTransform: 'uppercase', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800, color: color || 'var(--t-text)', lineHeight: 1, marginBottom: 4 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--t-text-faint)' }}>{sub}</div>}
    </div>
  );
}

// ── BADGE ─────────────────────────────────────────────────────────────────────

function Badge({ status }) {
  const cls =
    status === 'Active'  ? 'badge green'  :
    status === 'Pending' ? 'badge amber'  :
    status === 'Paid'    ? 'badge green'  :
    status === 'Missing' ? 'badge red'    :
    status === 'W-4 Filed' ? 'badge blue' :
    'badge red';
  return <span className={cls}>{status}</span>;
}

// ── SECTION WRAPPER ───────────────────────────────────────────────────────────

function Section({ title, badge, children, action }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--t-text-muted)' }}>{title}</span>
          {badge && <span className="badge blue" style={{ fontSize: 10 }}>{badge}</span>}
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

function EmptyState({ children }) {
  return (
    <div style={{ background: 'var(--t-surface)', border: '1px dashed var(--t-line)', borderRadius: 6, textAlign: 'center', padding: '28px 20px', color: 'var(--t-text-faint)', fontSize: 13 }}>
      {children}
    </div>
  );
}

// ── INPUT STYLES ──────────────────────────────────────────────────────────────

const inputStyle = {
  width: '100%', boxSizing: 'border-box',
  background: 'var(--t-surface-2)', border: '1px solid var(--t-line)',
  borderRadius: 6, padding: '9px 12px',
  color: 'var(--t-text)', fontSize: 13,
  outline: 'none', fontFamily: 'inherit',
};

const selectStyle = { ...inputStyle };

const btnPrimary = {
  background: 'var(--t-accent)', color: '#070b14',
  border: 'none', borderRadius: 6, padding: '9px 18px',
  fontWeight: 700, fontSize: 13, cursor: 'pointer', letterSpacing: '.04em',
};

const btnSecondary = {
  background: 'transparent', color: 'var(--t-text-muted)',
  border: '1px solid var(--t-line)', borderRadius: 6, padding: '9px 16px',
  fontWeight: 600, fontSize: 13, cursor: 'pointer',
};

const btnDanger = {
  background: 'transparent', color: 'var(--t-danger)',
  border: '1px solid var(--t-danger)', borderRadius: 6, padding: '9px 16px',
  fontWeight: 600, fontSize: 13, cursor: 'pointer',
};

// ── TAB 1 — MY PAY INFO ───────────────────────────────────────────────────────

function MyPayInfoTab({ emp, history, kpis, personId, onChanged }) {
  const [showBankForm, setShowBankForm] = useState(false);
  const [bankForm, setBankForm] = useState({ bank_name: '', routing: '', account: '', confirm: '', type: 'Checking' });
  const [bankErrors, setBankErrors] = useState({});
  const [bankSaved, setBankSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [expandedStub, setExpandedStub] = useState(null);

  const payStubs = history.slice(0, 12);
  const hasBank = !!emp.acct;

  const w2Years = useMemo(
    () => [...new Set(history.filter(p => (p.status || '').toLowerCase() === 'paid').map(p => p.year))].sort((a, b) => b - a),
    [history]
  );

  function validateBank() {
    const e = {};
    if (!bankForm.bank_name.trim()) e.bank_name = 'Required';
    if (!/^\d{9}$/.test(bankForm.routing)) e.routing = 'Must be 9 digits';
    if (!bankForm.account.trim()) e.account = 'Required';
    if (bankForm.account !== bankForm.confirm) e.confirm = 'Account numbers do not match';
    return e;
  }

  async function handleBankSubmit(ev) {
    ev.preventDefault();
    const e = validateBank();
    if (Object.keys(e).length) { setBankErrors(e); return; }
    if (!personId) { toast('No employee session — cannot submit.', 'error'); return; }
    setSaving(true);
    const { error } = await sb.rpc('submit_dd_change', {
      p_person_id: personId,
      p_bank_name: bankForm.bank_name.trim(),
      p_account_type: bankForm.type,
      p_routing_last4: bankForm.routing,
      p_account_last4: bankForm.account,
    });
    setSaving(false);
    if (error) { toast('Could not submit account change: ' + error.message, 'error'); return; }
    setBankSaved(true);
    setShowBankForm(false);
    setBankForm({ bank_name: '', routing: '', account: '', confirm: '', type: 'Checking' });
    toast('Bank account change submitted for review.');
    onChanged();
  }

  return (
    <div>
      {/* Pay Overview */}
      <Section title="Current Pay Setup">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))', gap: 12 }}>
          <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', borderRadius: 6, padding: '14px 16px' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--t-text-muted)', textTransform: 'uppercase', marginBottom: 6, letterSpacing: '.08em' }}>Hourly Rate</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--t-accent)' }}>••••/hr</div>
            <div style={{ fontSize: 11, color: 'var(--t-text-faint)', marginTop: 4 }}>Masked for privacy</div>
          </div>
          <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', borderRadius: 6, padding: '14px 16px' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--t-text-muted)', textTransform: 'uppercase', marginBottom: 6, letterSpacing: '.08em' }}>Pay Schedule</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--t-text)' }}>Bi-Weekly</div>
            <div style={{ fontSize: 11, color: 'var(--t-text-faint)', marginTop: 4 }}>Every 2 weeks — Friday</div>
          </div>
          <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', borderRadius: 6, padding: '14px 16px' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--t-text-muted)', textTransform: 'uppercase', marginBottom: 6, letterSpacing: '.08em' }}>Next Pay Date</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--t-success)' }}>{kpis.nextPayDate}</div>
            <div style={{ fontSize: 11, color: 'var(--t-text-faint)', marginTop: 4 }}>{kpis.nextEst > 0 ? `Est. ${fmt$(kpis.nextEst)} net` : 'No pending pay period'}</div>
          </div>
          <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', borderRadius: 6, padding: '14px 16px' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--t-text-muted)', textTransform: 'uppercase', marginBottom: 6, letterSpacing: '.08em' }}>YTD Earnings</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--t-text)' }}>{fmt$(kpis.ytdGross)}</div>
            <div style={{ fontSize: 11, color: 'var(--t-text-faint)', marginTop: 4 }}>Gross year-to-date</div>
          </div>
          <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', borderRadius: 6, padding: '14px 16px' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--t-text-muted)', textTransform: 'uppercase', marginBottom: 6, letterSpacing: '.08em' }}>YTD Taxes Withheld</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--t-warn)' }}>{fmt$(kpis.ytdTaxes)}</div>
            <div style={{ fontSize: 11, color: 'var(--t-text-faint)', marginTop: 4 }}>Fed + State + CT</div>
          </div>
        </div>
      </Section>

      {/* Bank Account on File */}
      <Section title="Bank Account on File" action={
        <button style={btnSecondary} onClick={() => { setShowBankForm(v => !v); setBankSaved(false); setBankErrors({}); }}>
          {hasBank ? 'Update Account' : 'Add Account'}
        </button>
      }>
        <div style={{ background: 'var(--t-surface)', border: `1px solid ${hasBank ? 'var(--t-line)' : 'var(--t-danger)'}`, borderRadius: 6, padding: '16px 18px' }}>
          {hasBank ? (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px 24px' }}>
              <div>
                <div style={{ fontSize: 10, color: 'var(--t-text-muted)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 4 }}>Bank</div>
                <div style={{ fontWeight: 600, color: 'var(--t-text)' }}>{emp.bank || '—'}</div>
              </div>
              <div>
                <div style={{ fontSize: 10, color: 'var(--t-text-muted)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 4 }}>Account</div>
                <div style={{ fontWeight: 600, color: 'var(--t-text)', fontFamily: 'monospace' }}>{emp.type || ''} {maskAcct(emp.acct)}</div>
              </div>
              <div>
                <div style={{ fontSize: 10, color: 'var(--t-text-muted)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 4 }}>Routing</div>
                <div style={{ fontWeight: 600, color: 'var(--t-text)', fontFamily: 'monospace' }}>{maskRouting(emp.routing)}</div>
              </div>
              <div>
                <div style={{ fontSize: 10, color: 'var(--t-text-muted)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 4 }}>Status</div>
                <Badge status={emp.status === 'Pending' ? 'Pending' : 'Active'} />
              </div>
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '16px 0', color: 'var(--t-danger)', fontWeight: 600 }}>
              No bank account on file — direct deposit inactive
            </div>
          )}
        </div>

        {bankSaved && (
          <div style={{ background: 'rgba(0,229,255,.08)', border: '1px solid var(--t-accent)', borderRadius: 6, padding: '10px 14px', marginTop: 10, fontSize: 13, color: 'var(--t-accent)', fontWeight: 600 }}>
            Account change submitted. It will be active once HR approves it.
          </div>
        )}

        {showBankForm && (
          <form onSubmit={handleBankSubmit} style={{ marginTop: 14, background: 'var(--t-surface-2)', border: '1px solid var(--t-line)', borderRadius: 8, padding: '18px 20px' }}>
            <div style={{ fontSize: 12, color: 'var(--t-warn)', background: 'rgba(255,170,0,.08)', border: '1px solid rgba(255,170,0,.3)', borderRadius: 6, padding: '9px 13px', marginBottom: 16 }}>
              Changes require manager approval and take 1–2 pay cycles to activate. Only the last 4 digits are retained.
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 18px' }}>
              <div style={{ gridColumn: '1/-1' }}>
                <label style={{ fontSize: 11, color: 'var(--t-text-muted)', fontWeight: 700, letterSpacing: '.06em', display: 'block', marginBottom: 5 }}>BANK NAME *</label>
                <input style={{ ...inputStyle, borderColor: bankErrors.bank_name ? 'var(--t-danger)' : 'var(--t-line)' }}
                  value={bankForm.bank_name} onChange={e => { setBankForm(p => ({ ...p, bank_name: e.target.value })); setBankErrors(p => ({ ...p, bank_name: '' })); }}
                  placeholder="Chase, Wells Fargo…" />
                {bankErrors.bank_name && <span style={{ fontSize: 11, color: 'var(--t-danger)' }}>{bankErrors.bank_name}</span>}
              </div>
              <div>
                <label style={{ fontSize: 11, color: 'var(--t-text-muted)', fontWeight: 700, letterSpacing: '.06em', display: 'block', marginBottom: 5 }}>ROUTING NUMBER (9 digits) *</label>
                <input style={{ ...inputStyle, fontFamily: 'monospace', borderColor: bankErrors.routing ? 'var(--t-danger)' : 'var(--t-line)' }}
                  inputMode="numeric" maxLength={9} value={bankForm.routing}
                  onChange={e => { setBankForm(p => ({ ...p, routing: e.target.value.replace(/\D/g,'') })); setBankErrors(p => ({ ...p, routing: '' })); }}
                  placeholder="123456789" />
                {bankErrors.routing && <span style={{ fontSize: 11, color: 'var(--t-danger)' }}>{bankErrors.routing}</span>}
              </div>
              <div>
                <label style={{ fontSize: 11, color: 'var(--t-text-muted)', fontWeight: 700, letterSpacing: '.06em', display: 'block', marginBottom: 5 }}>ACCOUNT TYPE *</label>
                <select style={selectStyle} value={bankForm.type} onChange={e => setBankForm(p => ({ ...p, type: e.target.value }))}>
                  <option value="Checking">Checking</option>
                  <option value="Savings">Savings</option>
                </select>
              </div>
              <div>
                <label style={{ fontSize: 11, color: 'var(--t-text-muted)', fontWeight: 700, letterSpacing: '.06em', display: 'block', marginBottom: 5 }}>ACCOUNT NUMBER *</label>
                <input type="password" style={{ ...inputStyle, fontFamily: 'monospace', borderColor: bankErrors.account ? 'var(--t-danger)' : 'var(--t-line)' }}
                  autoComplete="new-password" value={bankForm.account}
                  onChange={e => { setBankForm(p => ({ ...p, account: e.target.value.replace(/\D/g,'') })); setBankErrors(p => ({ ...p, account: '' })); }}
                  placeholder="Account number" />
                {bankErrors.account && <span style={{ fontSize: 11, color: 'var(--t-danger)' }}>{bankErrors.account}</span>}
              </div>
              <div>
                <label style={{ fontSize: 11, color: 'var(--t-text-muted)', fontWeight: 700, letterSpacing: '.06em', display: 'block', marginBottom: 5 }}>CONFIRM ACCOUNT NUMBER *</label>
                <input type="password" style={{ ...inputStyle, fontFamily: 'monospace', borderColor: bankErrors.confirm ? 'var(--t-danger)' : 'var(--t-line)' }}
                  autoComplete="new-password" value={bankForm.confirm}
                  onChange={e => { setBankForm(p => ({ ...p, confirm: e.target.value.replace(/\D/g,'') })); setBankErrors(p => ({ ...p, confirm: '' })); }}
                  placeholder="Re-enter account number" />
                {bankErrors.confirm && <span style={{ fontSize: 11, color: 'var(--t-danger)' }}>{bankErrors.confirm}</span>}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
              <button type="submit" style={btnPrimary} disabled={saving}>{saving ? 'Submitting…' : 'Submit Change'}</button>
              <button type="button" style={btnSecondary} onClick={() => setShowBankForm(false)}>Cancel</button>
            </div>
          </form>
        )}
      </Section>

      {/* Pay Stubs */}
      <Section title="Pay Stubs" badge={payStubs.length ? `Last ${payStubs.length} Periods` : null}>
        {payStubs.length === 0 ? (
          <EmptyState>No pay stubs on record yet. Stubs appear here after your first processed payroll.</EmptyState>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {payStubs.map((p, i) => (
              <div key={p.id} style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', borderRadius: 6, overflow: 'hidden' }}>
                <div
                  onClick={() => setExpandedStub(expandedStub === i ? null : i)}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '11px 14px', cursor: 'pointer' }}
                >
                  <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--t-text)', fontFamily: 'monospace' }}>
                      {fmtDate(p.period_start)} – {fmtDate(p.period_end)}
                    </span>
                    <Badge status={p.status} />
                  </div>
                  <div style={{ display: 'flex', gap: 18, alignItems: 'center' }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--t-success)' }}>{fmt$(p.net)}</span>
                    <span style={{ color: 'var(--t-text-faint)', fontSize: 12 }}>{expandedStub === i ? '▲' : '▼'}</span>
                  </div>
                </div>
                {expandedStub === i && (
                  <div style={{ borderTop: '1px solid var(--t-line)', padding: '12px 16px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 32px', background: 'var(--t-surface-2)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}><span style={{ color: 'var(--t-text-muted)' }}>Regular Hours</span><span style={{ color: 'var(--t-text)', fontWeight: 600 }}>{p.reg_hours} hrs</span></div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}><span style={{ color: 'var(--t-text-muted)' }}>OT Hours</span><span style={{ color: p.ot_hours > 0 ? 'var(--t-warn)' : 'var(--t-text-faint)', fontWeight: 600 }}>{p.ot_hours} hrs</span></div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}><span style={{ color: 'var(--t-text-muted)' }}>Tips</span><span style={{ color: 'var(--t-text)', fontWeight: 600 }}>{fmt$(p.tips)}</span></div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}><span style={{ color: 'var(--t-text-muted)' }}>Gross Pay</span><span style={{ color: 'var(--t-text)', fontWeight: 700 }}>{fmt$(p.gross)}</span></div>
                    <div style={{ gridColumn: '1/-1', height: 1, background: 'var(--t-line)', margin: '4px 0' }} />
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}><span style={{ color: 'var(--t-text-muted)' }}>Federal Tax</span><span style={{ color: 'var(--t-danger)', fontWeight: 600 }}>({fmt$(p.fed_tax)})</span></div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}><span style={{ color: 'var(--t-text-muted)' }}>State Tax</span><span style={{ color: 'var(--t-danger)', fontWeight: 600 }}>({fmt$(p.state_tax)})</span></div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}><span style={{ color: 'var(--t-text-muted)' }}>CT Tax</span><span style={{ color: 'var(--t-danger)', fontWeight: 600 }}>({fmt$(p.ct_tax)})</span></div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}><span style={{ color: 'var(--t-text-muted)' }}>Health Insurance</span><span style={{ color: 'var(--t-danger)', fontWeight: 600 }}>({fmt$(p.health)})</span></div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}><span style={{ color: 'var(--t-text-muted)' }}>401(k)</span><span style={{ color: 'var(--t-danger)', fontWeight: 600 }}>({fmt$(p.k401)})</span></div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}><span style={{ color: 'var(--t-text-muted)' }}>Total Deductions</span><span style={{ color: 'var(--t-danger)', fontWeight: 700 }}>({fmt$(p.total_ded)})</span></div>
                    <div style={{ gridColumn: '1/-1', height: 1, background: 'var(--t-line)', margin: '4px 0' }} />
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, gridColumn: '1/-1' }}><span style={{ color: 'var(--t-text)', fontWeight: 700 }}>Net Pay</span><span style={{ color: 'var(--t-success)', fontWeight: 800, fontSize: 15 }}>{fmt$(p.net)}</span></div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* W-2 Section — years derived from real paid stubs */}
      <Section title="W-2 / Tax Documents">
        {w2Years.length === 0 ? (
          <EmptyState>No W-2 documents available yet.</EmptyState>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {w2Years.map(yr => (
              <div key={yr} style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px' }}>
                <div>
                  <span style={{ fontWeight: 700, color: 'var(--t-text)', marginRight: 12 }}>W-2 — Tax Year {yr}</span>
                  <span className="badge green" style={{ fontSize: 10 }}>Earnings on file</span>
                </div>
                <button style={{ ...btnSecondary, padding: '5px 12px', fontSize: 11 }} onClick={() => toast('W-2 PDF export is not available yet.', 'error')}>Request PDF</button>
              </div>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}

// ── TAB 2 — PAY HISTORY ───────────────────────────────────────────────────────

function PayHistoryTab({ history }) {
  const [yearFilter, setYearFilter] = useState(String(CUR_YEAR));
  const [expanded, setExpanded] = useState(null);

  const years = [...new Set(history.map(p => String(p.year)))].sort((a, b) => b - a);
  const filtered = yearFilter === 'all' ? history : history.filter(p => String(p.year) === yearFilter);

  const totGross = filtered.reduce((a, p) => a + p.gross, 0);
  const totNet   = filtered.reduce((a, p) => a + p.net, 0);
  const totDed   = filtered.reduce((a, p) => a + p.total_ded, 0);

  if (history.length === 0) {
    return <EmptyState>No pay history yet. Processed pay periods will appear here.</EmptyState>;
  }

  return (
    <div>
      {/* Totals row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginBottom: 18 }}>
        <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', borderRadius: 6, padding: '12px 14px' }}>
          <div style={{ fontSize: 10, color: 'var(--t-text-muted)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 5 }}>Period Gross</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--t-text)' }}>{fmt$(totGross)}</div>
        </div>
        <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', borderRadius: 6, padding: '12px 14px' }}>
          <div style={{ fontSize: 10, color: 'var(--t-text-muted)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 5 }}>Total Deductions</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--t-danger)' }}>({fmt$(totDed)})</div>
        </div>
        <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', borderRadius: 6, padding: '12px 14px' }}>
          <div style={{ fontSize: 10, color: 'var(--t-text-muted)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 5 }}>Net Pay</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--t-success)' }}>{fmt$(totNet)}</div>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <span style={{ fontSize: 12, color: 'var(--t-text-muted)' }}>{filtered.length} pay periods</span>
        <div style={{ display: 'flex', gap: 6 }}>
          <button style={{ ...btnSecondary, padding: '5px 10px', fontSize: 11, background: yearFilter === 'all' ? 'var(--t-surface-2)' : 'transparent' }} onClick={() => setYearFilter('all')}>All</button>
          {years.map(y => (
            <button key={y} style={{ ...btnSecondary, padding: '5px 10px', fontSize: 11, background: yearFilter === y ? 'var(--t-accent)' : 'transparent', color: yearFilter === y ? '#070b14' : 'var(--t-text-muted)' }} onClick={() => setYearFilter(y)}>{y}</button>
          ))}
        </div>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: '2px solid var(--t-line)' }}>
              {['Pay Period', 'Pay Date', 'Gross', 'Deductions', 'Net Pay', 'Status', ''].map(h => (
                <th key={h} style={{ textAlign: 'left', padding: '8px 12px', fontSize: 11, fontWeight: 700, color: 'var(--t-text-muted)', textTransform: 'uppercase', letterSpacing: '.06em', whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((p, i) => (
              <>
                <tr key={p.id} style={{ borderBottom: '1px solid var(--t-line)', background: i % 2 === 1 ? 'var(--t-surface-2)' : 'transparent' }}>
                  <td style={{ padding: '10px 12px', fontFamily: 'monospace', fontSize: 12, color: 'var(--t-text)' }}>{p.period_start} – {p.period_end}</td>
                  <td style={{ padding: '10px 12px', color: 'var(--t-text-muted)', fontSize: 12 }}>{fmtDate(p.pay_date)}</td>
                  <td style={{ padding: '10px 12px', fontWeight: 700, color: 'var(--t-text)' }}>{fmt$(p.gross)}</td>
                  <td style={{ padding: '10px 12px', color: 'var(--t-danger)' }}>({fmt$(p.total_ded)})</td>
                  <td style={{ padding: '10px 12px', fontWeight: 800, color: 'var(--t-success)' }}>{fmt$(p.net)}</td>
                  <td style={{ padding: '10px 12px' }}><Badge status={p.status} /></td>
                  <td style={{ padding: '10px 12px' }}>
                    <button style={{ ...btnSecondary, padding: '3px 8px', fontSize: 11 }} onClick={() => setExpanded(expanded === i ? null : i)}>
                      {expanded === i ? 'Hide' : 'Details'}
                    </button>
                  </td>
                </tr>
                {expanded === i && (
                  <tr key={p.id + '-det'} style={{ background: 'rgba(0,229,255,.03)' }}>
                    <td colSpan={7} style={{ padding: '12px 16px', borderBottom: '1px solid var(--t-line)' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '8px 20px', fontSize: 12 }}>
                        <div><span style={{ color: 'var(--t-text-muted)' }}>Reg Hours: </span><span style={{ fontWeight: 700, color: 'var(--t-text)' }}>{p.reg_hours}</span></div>
                        <div><span style={{ color: 'var(--t-text-muted)' }}>OT Hours: </span><span style={{ fontWeight: 700, color: p.ot_hours > 0 ? 'var(--t-warn)' : 'var(--t-text-faint)' }}>{p.ot_hours}</span></div>
                        <div><span style={{ color: 'var(--t-text-muted)' }}>Tips: </span><span style={{ fontWeight: 700, color: 'var(--t-text)' }}>{fmt$(p.tips)}</span></div>
                        <div><span style={{ color: 'var(--t-text-muted)' }}>Federal Tax: </span><span style={{ fontWeight: 700, color: 'var(--t-danger)' }}>{fmt$(p.fed_tax)}</span></div>
                        <div><span style={{ color: 'var(--t-text-muted)' }}>State Tax: </span><span style={{ fontWeight: 700, color: 'var(--t-danger)' }}>{fmt$(p.state_tax)}</span></div>
                        <div><span style={{ color: 'var(--t-text-muted)' }}>CT Tax: </span><span style={{ fontWeight: 700, color: 'var(--t-danger)' }}>{fmt$(p.ct_tax)}</span></div>
                        <div><span style={{ color: 'var(--t-text-muted)' }}>Health Ins: </span><span style={{ fontWeight: 700, color: 'var(--t-danger)' }}>{fmt$(p.health)}</span></div>
                        <div><span style={{ color: 'var(--t-text-muted)' }}>401(k): </span><span style={{ fontWeight: 700, color: 'var(--t-danger)' }}>{fmt$(p.k401)}</span></div>
                      </div>
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── TAB 3 — TAX & WITHHOLDING ─────────────────────────────────────────────────

function TaxTab({ history, personId, w4, onChanged }) {
  const [showW4Form, setShowW4Form] = useState(false);
  const [form, setForm] = useState({
    filing: w4?.filing_status || 'Single',
    allowances: String(w4?.allowances ?? 1),
    extra: w4?.extra_withholding ? String(w4.extra_withholding) : '',
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setForm({
      filing: w4?.filing_status || 'Single',
      allowances: String(w4?.allowances ?? 1),
      extra: w4?.extra_withholding ? String(w4.extra_withholding) : '',
    });
  }, [w4]);

  const ytd = history.filter(p => p.year === CUR_YEAR);
  const ytdFed   = ytd.reduce((a, p) => a + p.fed_tax, 0);
  const ytdState = ytd.reduce((a, p) => a + p.state_tax, 0);
  const ytdCT    = ytd.reduce((a, p) => a + p.ct_tax, 0);
  const ytdTot   = ytdFed + ytdState + ytdCT;

  const [drill, setDrill] = useState(null);
  const TAX_COLS = [
    { key: 'period', label: 'Pay Period', value: p => `${p.period_start} – ${p.period_end}`, sortKey: p => p.period_end },
    { key: 'pay_date', label: 'Pay Date', value: p => fmtDate(p.pay_date), sortKey: p => p.pay_date },
    { key: 'gross', label: 'Gross', value: p => fmt$(p.gross), align: 'right', sortKey: p => p.gross },
    { key: 'fed_tax', label: 'Federal', value: p => fmt$(p.fed_tax), align: 'right', sortKey: p => p.fed_tax },
    { key: 'state_tax', label: 'State', value: p => fmt$(p.state_tax), align: 'right', sortKey: p => p.state_tax },
    { key: 'ct_tax', label: 'CT Tax', value: p => fmt$(p.ct_tax), align: 'right', sortKey: p => p.ct_tax },
  ];
  const openTaxDrill = (title, accent) => setDrill({ title, subtitle: `${ytd.length} pay periods`, columns: TAX_COLS, rows: ytd, accent });

  const hasW4 = !!w4;

  async function handleW4(ev) {
    ev.preventDefault();
    if (!personId) { toast('No employee session — cannot save W-4.', 'error'); return; }
    setSaving(true);
    const { error } = await sb.rpc('save_w4', {
      p_person_id: personId,
      p_filing_status: form.filing,
      p_allowances: parseInt(form.allowances, 10) || 0,
      p_extra: parseFloat(String(form.extra).replace(/[^0-9.]/g, '')) || 0,
      p_updated_by: personId,
    });
    setSaving(false);
    if (error) { toast('Could not save W-4: ' + error.message, 'error'); return; }
    setShowW4Form(false);
    toast('W-4 updated. Changes take effect next pay period.');
    onChanged();
  }

  return (
    <div>
      {/* YTD Tax Summary */}
      <Section title={`YTD Tax Summary — ${CUR_YEAR}`}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(180px,1fr))', gap: 10, marginBottom: 16 }}>
          <KTile label="YTD Federal Tax" value={fmt$(ytdFed)} sub={`Withheld ${CUR_YEAR}`} color="var(--t-warn)"
            onClick={ytd.length ? () => openTaxDrill(`YTD Federal Tax — ${CUR_YEAR} Pay Periods`, 'var(--t-warn)') : undefined} />
          <KTile label="YTD State Tax" value={fmt$(ytdState)} sub={`Withheld ${CUR_YEAR}`} color="var(--t-warn)"
            onClick={ytd.length ? () => openTaxDrill(`YTD State Tax — ${CUR_YEAR} Pay Periods`, 'var(--t-warn)') : undefined} />
          <KTile label="YTD CT Tax" value={fmt$(ytdCT)} sub={`Withheld ${CUR_YEAR}`} color="var(--t-warn)"
            onClick={ytd.length ? () => openTaxDrill(`YTD CT Tax — ${CUR_YEAR} Pay Periods`, 'var(--t-warn)') : undefined} />
          <KTile label="Total Withheld" value={fmt$(ytdTot)} sub={`All taxes ${CUR_YEAR}`} color="var(--t-danger)"
            onClick={ytd.length ? () => openTaxDrill(`Total Withheld — ${CUR_YEAR} Pay Periods`, 'var(--t-danger)') : undefined} />
        </div>
        {ytd.length === 0 ? (
          <EmptyState>No tax withholding recorded yet this year.</EmptyState>
        ) : (
          <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', borderRadius: 6, overflow: 'hidden' }}>
            {[
              { label: 'Federal Income Tax (W-4)', amt: ytdFed },
              { label: 'Massachusetts State Tax', amt: ytdState },
              { label: 'CT Additional Tax', amt: ytdCT },
            ].map((row, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '11px 16px', borderBottom: i < 2 ? '1px solid var(--t-line)' : 'none' }}>
                <span style={{ fontSize: 13, color: 'var(--t-text)' }}>{row.label}</span>
                <span style={{ fontWeight: 700, color: 'var(--t-danger)', fontFamily: 'monospace' }}>{fmt$(row.amt)}</span>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* W-4 Info */}
      <Section title="W-4 — Federal Withholding" action={
        <button style={btnSecondary} onClick={() => setShowW4Form(v => !v)}>
          {showW4Form ? 'Cancel' : (hasW4 ? 'Update W-4' : 'File W-4')}
        </button>
      }>
        {!hasW4 && !showW4Form ? (
          <EmptyState>No W-4 on file. File your federal withholding to set tax deductions.</EmptyState>
        ) : (
          <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', borderRadius: 6, padding: '16px 18px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px 24px' }}>
              <div>
                <div style={{ fontSize: 10, color: 'var(--t-text-muted)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 4 }}>Filing Status</div>
                <div style={{ fontWeight: 700, color: 'var(--t-text)' }}>{w4?.filing_status || form.filing}</div>
              </div>
              <div>
                <div style={{ fontSize: 10, color: 'var(--t-text-muted)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 4 }}>Allowances</div>
                <div style={{ fontWeight: 700, color: 'var(--t-text)' }}>{w4?.allowances ?? form.allowances}</div>
              </div>
              <div>
                <div style={{ fontSize: 10, color: 'var(--t-text-muted)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 4 }}>Additional Withholding</div>
                <div style={{ fontWeight: 700, color: 'var(--t-text)' }}>{fmt$(w4?.extra_withholding || 0)}</div>
              </div>
              <div>
                <div style={{ fontSize: 10, color: 'var(--t-text-muted)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 4 }}>Status</div>
                <Badge status={hasW4 ? 'W-4 Filed' : 'Missing'} />
              </div>
              <div>
                <div style={{ fontSize: 10, color: 'var(--t-text-muted)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 4 }}>Last Updated</div>
                <div style={{ fontSize: 13, color: 'var(--t-text)' }}>{fmtDate(w4?.effective_date || w4?.created_at)}</div>
              </div>
            </div>
          </div>
        )}

        {showW4Form && (
          <form onSubmit={handleW4} style={{ marginTop: 14, background: 'var(--t-surface-2)', border: '1px solid var(--t-line)', borderRadius: 8, padding: '18px 20px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 18px' }}>
              <div>
                <label style={{ fontSize: 11, color: 'var(--t-text-muted)', fontWeight: 700, letterSpacing: '.06em', display: 'block', marginBottom: 5 }}>FILING STATUS</label>
                <select style={selectStyle} value={form.filing} onChange={e => setForm(p => ({ ...p, filing: e.target.value }))}>
                  <option>Single</option>
                  <option>Married Filing Jointly</option>
                  <option>Married Filing Separately</option>
                  <option>Head of Household</option>
                </select>
              </div>
              <div>
                <label style={{ fontSize: 11, color: 'var(--t-text-muted)', fontWeight: 700, letterSpacing: '.06em', display: 'block', marginBottom: 5 }}>ALLOWANCES</label>
                <select style={selectStyle} value={form.allowances} onChange={e => setForm(p => ({ ...p, allowances: e.target.value }))}>
                  {[0,1,2,3,4,5].map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
              <div style={{ gridColumn: '1/-1' }}>
                <label style={{ fontSize: 11, color: 'var(--t-text-muted)', fontWeight: 700, letterSpacing: '.06em', display: 'block', marginBottom: 5 }}>ADDITIONAL WITHHOLDING (per pay period)</label>
                <input style={inputStyle} placeholder="$0.00" value={form.extra} onChange={e => setForm(p => ({ ...p, extra: e.target.value }))} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
              <button type="submit" style={btnPrimary} disabled={saving}>{saving ? 'Saving…' : 'Save W-4'}</button>
              <button type="button" style={btnSecondary} onClick={() => setShowW4Form(false)}>Cancel</button>
            </div>
          </form>
        )}
      </Section>

      {/* CT State Info — derived from filed W-4 + real YTD */}
      <Section title="Massachusetts State Tax Info">
        <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', borderRadius: 6, padding: '16px 18px', fontSize: 13, lineHeight: 1.7 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 24px' }}>
            {[
              ['CT Filing Status', w4?.filing_status || '— (W-4 not filed)'],
              ['CT Exemptions', w4 ? String(w4.allowances) : '—'],
              ['CT Base Rate', '5.5% (first $10,000)'],
              ['CT Top Rate', '6.99% (over $500,000)'],
              ['YTD CT Withheld', fmt$(ytdCT + ytdState)],
            ].map(([k, v]) => (
              <div key={k}>
                <div style={{ fontSize: 10, color: 'var(--t-text-muted)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 3 }}>{k}</div>
                <div style={{ fontWeight: 600, color: 'var(--t-text)' }}>{v}</div>
              </div>
            ))}
          </div>
        </div>
      </Section>

      <DrillDown open={!!drill} onClose={() => setDrill(null)} {...(drill || {})} />
    </div>
  );
}

// ── TAB 4 — PAYROLL ADMIN ─────────────────────────────────────────────────────

function PayrollAdminTab({ isHR, roster, pendingDD, runs, adjustments, personId, nodeIds, onChanged }) {
  const [showRunConfirm, setShowRunConfirm] = useState(false);
  const [running, setRunning] = useState(false);
  const [adjEmp, setAdjEmp] = useState('');
  const [adjAmt, setAdjAmt] = useState('');
  const [adjType, setAdjType] = useState('Bonus');
  const [adjNote, setAdjNote] = useState('');
  const [adjBusy, setAdjBusy] = useState(false);

  if (!isHR) {
    return (
      <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--t-text-muted)' }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>🔐</div>
        <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 6 }}>HR/Admin Access Required</div>
        <div style={{ fontSize: 13 }}>Contact your administrator for payroll access.</div>
      </div>
    );
  }

  const missing = roster.filter(e => e.dd_status === 'Missing');
  const queuedTotal = adjustments.reduce((a, x) => a + Number(x.amount || 0), 0);

  async function runPayroll() {
    if (!Array.isArray(nodeIds) || nodeIds.length === 0) { toast('No location in scope.', 'error'); return; }
    setRunning(true);
    const { error } = await sb.rpc('run_payroll', { p_node_ids: nodeIds, p_pay_date: null, p_created_by: personId });
    setRunning(false);
    setShowRunConfirm(false);
    if (error) { toast('Could not record payroll run: ' + error.message, 'error'); return; }
    toast('Payroll run recorded.');
    onChanged();
  }

  async function reviewDD(id, action) {
    const { error } = await sb.rpc('review_dd_change', { p_request_id: id, p_action: action, p_reviewer_id: personId });
    if (error) { toast('Could not update request: ' + error.message, 'error'); return; }
    toast(action === 'approve' ? 'Direct deposit change approved.' : 'Direct deposit change rejected.');
    onChanged();
  }

  async function submitAdj(ev) {
    ev.preventDefault();
    if (!adjEmp || !adjAmt) return;
    setAdjBusy(true);
    const { error } = await sb.rpc('add_pay_adjustment', {
      p_person_id: adjEmp,
      p_type: adjType,
      p_amount: parseFloat(adjAmt) || 0,
      p_note: adjNote || null,
      p_created_by: personId,
    });
    setAdjBusy(false);
    if (error) { toast('Could not add adjustment: ' + error.message, 'error'); return; }
    setAdjAmt(''); setAdjNote(''); setAdjEmp('');
    toast('Adjustment queued.');
    onChanged();
  }

  async function removeAdj(id) {
    const { error } = await sb.rpc('remove_pay_adjustment', { p_id: id });
    if (error) { toast('Could not remove adjustment: ' + error.message, 'error'); return; }
    toast('Adjustment removed.');
    onChanged();
  }

  return (
    <div>
      {/* Missing bank alert */}
      {missing.length > 0 && (
        <div style={{ background: 'rgba(255,59,48,.07)', border: '1px solid var(--t-danger)', borderRadius: 8, padding: '12px 16px', marginBottom: 18, display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          <span style={{ fontSize: 16 }}>⚠️</span>
          <div>
            <div style={{ fontWeight: 700, color: 'var(--t-danger)', marginBottom: 4 }}>Missing Bank Accounts — {missing.length} Employee{missing.length > 1 ? 's' : ''}</div>
            <div style={{ fontSize: 12, color: 'var(--t-text-muted)' }}>{missing.map(e => e.full_name).join(' · ')} — will receive paper checks until updated.</div>
          </div>
        </div>
      )}

      {/* Pending Direct Deposit Changes — live from get_pending_dd_changes */}
      <Section title="Pending Direct Deposit Changes" badge={pendingDD.length ? `${pendingDD.length} Awaiting Review` : null}>
        {pendingDD.length === 0 ? (
          <EmptyState>No direct deposit changes awaiting review.</EmptyState>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--t-line)' }}>
                  {['Employee', 'Location', 'Bank', 'Account Type', 'Submitted', 'Status', ''].map(h => (
                    <th key={h} style={{ textAlign: 'left', padding: '8px 12px', fontSize: 11, fontWeight: 700, color: 'var(--t-text-muted)', textTransform: 'uppercase', letterSpacing: '.06em', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pendingDD.map((c, i) => (
                  <tr key={c.id || i} style={{ borderBottom: '1px solid var(--t-line)', background: i % 2 === 1 ? 'var(--t-surface-2)' : 'transparent' }}>
                    <td style={{ padding: '9px 12px', fontWeight: 600, color: 'var(--t-text)' }}>{c.employee_name || '—'}</td>
                    <td style={{ padding: '9px 12px', color: 'var(--t-text-muted)' }}>{c.location || '—'}</td>
                    <td style={{ padding: '9px 12px', color: 'var(--t-text-muted)' }}>{c.bank_name || '—'}</td>
                    <td style={{ padding: '9px 12px', color: 'var(--t-text-muted)' }}>{c.account_type || '—'}</td>
                    <td style={{ padding: '9px 12px', color: 'var(--t-text-faint)', fontSize: 12 }}>{fmtDate(c.submitted_at)}</td>
                    <td style={{ padding: '9px 12px' }}><Badge status={c.status === 'pending' ? 'Pending' : (c.status || 'Pending')} /></td>
                    <td style={{ padding: '9px 12px', whiteSpace: 'nowrap' }}>
                      {c.id && (
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button style={{ ...btnPrimary, padding: '4px 10px', fontSize: 11 }} onClick={() => reviewDD(c.id, 'approve')}>Approve</button>
                          <button style={{ ...btnDanger, padding: '4px 10px', fontSize: 11 }} onClick={() => reviewDD(c.id, 'reject')}>Reject</button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* Payroll Run */}
      <Section title="Payroll Run">
        <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', borderRadius: 8, padding: '18px 20px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '12px 20px', marginBottom: 18 }}>
            <div>
              <div style={{ fontSize: 10, color: 'var(--t-text-muted)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 4 }}>Employees In Scope</div>
              <div style={{ fontWeight: 800, fontSize: 18, color: 'var(--t-text)' }}>{roster.length}</div>
            </div>
            <div>
              <div style={{ fontSize: 10, color: 'var(--t-text-muted)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 4 }}>Queued Adjustments</div>
              <div style={{ fontWeight: 800, fontSize: 18, color: 'var(--t-text)' }}>{fmt$(queuedTotal)}</div>
            </div>
            <div>
              <div style={{ fontSize: 10, color: 'var(--t-text-muted)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 4 }}>Missing DD</div>
              <div style={{ fontWeight: 800, fontSize: 18, color: missing.length > 0 ? 'var(--t-danger)' : 'var(--t-success)' }}>{missing.length}</div>
            </div>
            <div>
              <div style={{ fontSize: 10, color: 'var(--t-text-muted)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 4 }}>Last Run</div>
              <div style={{ fontWeight: 800, fontSize: 18, color: 'var(--t-accent)' }}>{runs.length ? fmtDate(runs[0].run_date) : '—'}</div>
            </div>
          </div>
          <button style={{ ...btnPrimary, padding: '10px 24px' }} onClick={() => setShowRunConfirm(true)} disabled={roster.length === 0}>
            Record Payroll Run
          </button>
        </div>
      </Section>

      {/* Confirm Modal */}
      {showRunConfirm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', borderRadius: 12, padding: '28px 32px', maxWidth: 420, width: '90%', boxShadow: '0 24px 64px rgba(0,0,0,.4)' }}>
            <div style={{ fontWeight: 800, fontSize: 18, color: 'var(--t-text)', marginBottom: 12 }}>Confirm Payroll Run</div>
            <div style={{ fontSize: 13, color: 'var(--t-text-muted)', marginBottom: 8, lineHeight: 1.6 }}>
              This records a payroll run for <strong style={{ color: 'var(--t-text)' }}>{roster.length}</strong> employees and applies all queued adjustments (<strong style={{ color: 'var(--t-text)' }}>{fmt$(queuedTotal)}</strong>).
            </div>
            {missing.length > 0 && (
              <div style={{ fontSize: 12, color: 'var(--t-warn)', background: 'rgba(255,170,0,.08)', border: '1px solid rgba(255,170,0,.3)', borderRadius: 6, padding: '8px 12px', marginBottom: 16 }}>
                {missing.length} employee{missing.length > 1 ? 's' : ''} missing direct deposit — will receive paper checks.
              </div>
            )}
            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              <button style={{ ...btnPrimary, padding: '10px 20px' }} onClick={runPayroll} disabled={running}>{running ? 'Recording…' : 'Confirm & Run'}</button>
              <button style={btnSecondary} onClick={() => setShowRunConfirm(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* All Employees Status */}
      <Section title="All Employees — Pay Setup Status">
        {roster.length === 0 ? (
          <EmptyState>No employees in the selected location scope.</EmptyState>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--t-line)' }}>
                  {['Employee', 'Location', 'Role', 'Pay Rate', 'Bank', 'Account', 'DD Status'].map(h => (
                    <th key={h} style={{ textAlign: 'left', padding: '8px 12px', fontSize: 11, fontWeight: 700, color: 'var(--t-text-muted)', textTransform: 'uppercase', letterSpacing: '.06em', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {roster.map((e, i) => (
                  <tr key={e.person_id || i} style={{ borderBottom: '1px solid var(--t-line)', background: i % 2 === 1 ? 'var(--t-surface-2)' : 'transparent' }}>
                    <td style={{ padding: '9px 12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ width: 26, height: 26, borderRadius: 0, background: 'var(--t-accent)', color: '#070b14', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, flexShrink: 0 }}>
                          {(e.full_name || '?').charAt(0)}
                        </div>
                        <span style={{ fontWeight: 600, color: 'var(--t-text)' }}>{e.full_name}</span>
                      </div>
                    </td>
                    <td style={{ padding: '9px 12px', color: 'var(--t-text-muted)' }}>{e.location || '—'}</td>
                    <td style={{ padding: '9px 12px' }}>{e.role_name ? <span className="badge blue" style={{ fontSize: 10, textTransform: 'capitalize' }}>{e.role_name}</span> : '—'}</td>
                    <td style={{ padding: '9px 12px', fontFamily: 'monospace', fontWeight: 700, color: 'var(--t-text)' }}>{e.wage != null ? `${fmt$(e.wage)}/hr` : '—'}</td>
                    <td style={{ padding: '9px 12px', color: 'var(--t-text-muted)' }}>{e.bank_name || <span style={{ color: 'var(--t-danger)' }}>None</span>}</td>
                    <td style={{ padding: '9px 12px', fontFamily: 'monospace', color: 'var(--t-text-faint)' }}>{e.account_last4 ? maskAcct(e.account_last4) : '—'}</td>
                    <td style={{ padding: '9px 12px' }}><Badge status={e.dd_status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* Payroll Run History */}
      <Section title="Payroll Run History" badge={runs.length ? `Last ${runs.length} Runs` : null}>
        {runs.length === 0 ? (
          <EmptyState>No payroll runs recorded yet.</EmptyState>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {runs.map((run, i) => (
              <div key={run.id} style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px' }}>
                <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
                  <span style={{ fontSize: 12, fontFamily: 'monospace', color: 'var(--t-text)', fontWeight: 700 }}>Run #{runs.length - i} — {fmtDate(run.run_date)}</span>
                  <Badge status={run.status === 'completed' ? 'Paid' : (run.status || 'Paid')} />
                </div>
                <div style={{ display: 'flex', gap: 24, alignItems: 'center' }}>
                  <span style={{ fontSize: 12, color: 'var(--t-text-muted)' }}>{run.employee_count} employees</span>
                  <span style={{ fontWeight: 800, color: 'var(--t-text)', fontFamily: 'monospace' }}>{fmt$(run.total_gross)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* Per-Employee Pay Adjustments */}
      <Section title="Pay Adjustments" badge="Next Run">
        <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', borderRadius: 8, padding: '16px 18px', marginBottom: 14 }}>
          <form onSubmit={submitAdj} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 2fr auto', gap: 10, alignItems: 'end' }}>
            <div>
              <label style={{ fontSize: 11, color: 'var(--t-text-muted)', fontWeight: 700, display: 'block', marginBottom: 5 }}>EMPLOYEE</label>
              <select style={selectStyle} value={adjEmp} onChange={e => setAdjEmp(e.target.value)}>
                <option value="">Select employee…</option>
                {roster.map(e => <option key={e.person_id} value={e.person_id}>{e.full_name}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 11, color: 'var(--t-text-muted)', fontWeight: 700, display: 'block', marginBottom: 5 }}>TYPE</label>
              <select style={selectStyle} value={adjType} onChange={e => setAdjType(e.target.value)}>
                <option>Bonus</option>
                <option>Commission</option>
                <option>Correction</option>
                <option>Deduction</option>
                <option>Reimbursement</option>
              </select>
            </div>
            <div>
              <label style={{ fontSize: 11, color: 'var(--t-text-muted)', fontWeight: 700, display: 'block', marginBottom: 5 }}>AMOUNT ($)</label>
              <input style={inputStyle} type="number" step="0.01" placeholder="0.00" value={adjAmt} onChange={e => setAdjAmt(e.target.value)} />
            </div>
            <div>
              <label style={{ fontSize: 11, color: 'var(--t-text-muted)', fontWeight: 700, display: 'block', marginBottom: 5 }}>NOTE</label>
              <input style={inputStyle} placeholder="Optional note…" value={adjNote} onChange={e => setAdjNote(e.target.value)} />
            </div>
            <button type="submit" style={{ ...btnPrimary, padding: '9px 16px', whiteSpace: 'nowrap' }} disabled={adjBusy}>{adjBusy ? '…' : 'Add'}</button>
          </form>
        </div>
        {adjustments.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {adjustments.map(a => (
              <div key={a.id} style={{ background: 'var(--t-surface-2)', border: '1px solid var(--t-line)', borderRadius: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 14px', fontSize: 13 }}>
                <span style={{ fontWeight: 600, color: 'var(--t-text)' }}>{a.employee_name || '—'}</span>
                <span className="badge blue" style={{ fontSize: 10 }}>{a.adj_type}</span>
                <span style={{ fontWeight: 700, color: a.adj_type === 'Deduction' ? 'var(--t-danger)' : 'var(--t-success)', fontFamily: 'monospace' }}>{a.adj_type === 'Deduction' ? '-' : '+'}{fmt$(a.amount)}</span>
                <span style={{ fontSize: 11, color: 'var(--t-text-faint)' }}>{a.note}</span>
                <button style={{ ...btnDanger, padding: '3px 8px', fontSize: 11 }} onClick={() => removeAdj(a.id)}>Remove</button>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '20px', color: 'var(--t-text-faint)', fontSize: 13 }}>No adjustments queued.</div>
        )}
      </Section>
    </div>
  );
}

// ── FORENSIC KPI PANEL ────────────────────────────────────────────────────────

function ForensicKPIPanel({ kpis, isHR, history, roster }) {
  const [drill, setDrill] = useState(null);

  const PP_COLS = [
    { key: 'period', label: 'Pay Period', value: p => `${p.period_start} – ${p.period_end}`, sortKey: p => p.period_end },
    { key: 'pay_date', label: 'Pay Date', value: p => fmtDate(p.pay_date), sortKey: p => p.pay_date },
    { key: 'gross', label: 'Gross', value: p => fmt$(p.gross), align: 'right', sortKey: p => p.gross },
    { key: 'total_ded', label: 'Deductions', value: p => fmt$(p.total_ded), align: 'right', sortKey: p => p.total_ded },
    { key: 'net', label: 'Net', value: p => fmt$(p.net), align: 'right', sortKey: p => p.net },
    { key: 'ot_hours', label: 'OT Hrs', value: p => p.ot_hours, align: 'right', sortKey: p => p.ot_hours },
    { key: 'status', label: 'Status', value: p => p.status },
  ];
  const ytd = history.filter(p => p.year === CUR_YEAR);
  const openPP = (title, rows, accent) => setDrill({ title, subtitle: `${rows.length} pay period${rows.length === 1 ? '' : 's'}`, columns: PP_COLS, rows, accent });

  const EMP_COLS = [
    { key: 'name', label: 'Employee', value: e => e.full_name },
    { key: 'loc', label: 'Location', value: e => e.location },
    { key: 'role', label: 'Role', value: e => e.role_name },
    { key: 'rate', label: 'Pay Rate', value: e => e.wage != null ? `${fmt$(e.wage)}/hr` : '—', align: 'right', sortKey: e => Number(e.wage) || 0 },
    { key: 'bank', label: 'Bank', value: e => e.bank_name || 'None' },
    { key: 'status', label: 'DD Status', value: e => e.dd_status },
  ];
  const openEmp = (title, rows, accent) => setDrill({ title, subtitle: `${rows.length} employee${rows.length === 1 ? '' : 's'}`, columns: EMP_COLS, rows, accent });

  const hr = kpis.hrKPIs;

  return (
    <div style={{ marginBottom: 24 }}>
      {/* Row 1 — personal (always) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: 8, marginBottom: 8 }}>
        <KTile label="Next Pay Date"   value={kpis.nextPayDate} sub="Scheduled" color="var(--t-success)"
          onClick={history.length ? () => openPP('Pay Periods', history, 'var(--t-success)') : undefined} />
        <KTile label="Est. Next Pay"   value={fmt$(kpis.nextEst)} sub="Net estimate" color="var(--t-accent)"
          onClick={history.length ? () => openPP('Pay Periods — Net Estimate', history, 'var(--t-accent)') : undefined} />
        <KTile label="YTD Gross"       value={fmt$(kpis.ytdGross)} sub="Year-to-date"
          onClick={ytd.length ? () => openPP(`YTD Gross — ${CUR_YEAR} Pay Periods`, ytd, 'var(--t-accent)') : undefined} />
        <KTile label="YTD Net"         value={fmt$(kpis.ytdNet)} sub="After deductions" color="var(--t-success)"
          onClick={ytd.length ? () => openPP(`YTD Net — ${CUR_YEAR} Pay Periods`, ytd, 'var(--t-success)') : undefined} />
        <KTile label="YTD Taxes"       value={fmt$(kpis.ytdTaxes)} sub="Fed + State + CT" color="var(--t-warn)"
          onClick={ytd.length ? () => openPP(`YTD Taxes — ${CUR_YEAR} Pay Periods`, ytd, 'var(--t-warn)') : undefined} />
        <KTile label="YTD OT Pay"      value={fmt$(kpis.ytdOT)} sub="Overtime earned" color={kpis.ytdOT > 500 ? 'var(--t-warn)' : 'var(--t-text)'} alert={kpis.ytdOT > 1000 ? 'amber' : null}
          onClick={ytd.length ? () => openPP(`Overtime — ${CUR_YEAR} Pay Periods`, ytd.filter(p => p.ot_hours > 0), 'var(--t-warn)') : undefined} />
      </div>

      {/* Row 2 — HR only (real roster/run metrics) */}
      {isHR && hr && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 8, marginBottom: 8 }}>
          <KTile label="Payroll MTD"      value={fmt$(hr.mtd)} sub="Recorded this month" color="var(--t-text)" />
          <KTile label="Employees"        value={hr.headcount} sub="In scope"
            onClick={() => openEmp('All Employees', roster, 'var(--t-accent)')} />
          <KTile label="DD On File"       value={hr.onFile} sub="Active direct deposit" color="var(--t-success)"
            onClick={() => openEmp('Direct Deposit On File', roster.filter(e => e.dd_status === 'Active'), 'var(--t-success)')} />
          <KTile label="Missing Bank Accts" value={hr.missing} sub="Paper check required"
            alert={hr.missing > 0 ? 'red' : null} color={hr.missing > 0 ? 'var(--t-danger)' : 'var(--t-success)'}
            onClick={() => openEmp('Missing Bank Accounts', roster.filter(e => e.dd_status === 'Missing'), 'var(--t-danger)')} />
          <KTile label="Pending Changes"  value={hr.pending} sub="Awaiting review" color={hr.pending > 0 ? 'var(--t-warn)' : 'var(--t-text)'}
            onClick={() => openEmp('Pending Direct Deposit', roster.filter(e => e.dd_status === 'Pending'), 'var(--t-warn)')} />
        </div>
      )}

      {/* Row 3 — Location breakdown (HR only) */}
      {isHR && hr && hr.locStats.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, background: 'var(--t-surface)', border: '1px solid var(--t-line)', borderRadius: 6, overflow: 'hidden' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--t-line)' }}>
                {['Location', 'Headcount', 'DD On File', 'Missing', 'Pending'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '8px 14px', fontSize: 10, fontWeight: 700, color: 'var(--t-text-muted)', textTransform: 'uppercase', letterSpacing: '.06em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {hr.locStats.map((l, i) => (
                <tr key={l.loc} title="Click to drill into this location's employees" onClick={() => openEmp(`${l.loc} — Employees`, roster.filter(e => (e.location || '—') === l.loc), 'var(--t-accent)')} style={{ borderBottom: i < hr.locStats.length - 1 ? '1px solid var(--t-line)' : 'none', cursor: 'pointer' }}>
                  <td style={{ padding: '9px 14px', fontWeight: 700, color: 'var(--t-text)' }}>{l.loc}</td>
                  <td style={{ padding: '9px 14px', color: 'var(--t-text-muted)' }}>{l.count}</td>
                  <td style={{ padding: '9px 14px', fontFamily: 'monospace', color: 'var(--t-success)' }}>{l.onFile}</td>
                  <td style={{ padding: '9px 14px', fontFamily: 'monospace', color: l.missing > 0 ? 'var(--t-danger)' : 'var(--t-text-faint)' }}>{l.missing}</td>
                  <td style={{ padding: '9px 14px', fontFamily: 'monospace', color: l.pending > 0 ? 'var(--t-warn)' : 'var(--t-text-faint)' }}>{l.pending}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <DrillDown open={!!drill} onClose={() => setDrill(null)} {...(drill || {})} />
    </div>
  );
}

// ── MAIN EXPORT ───────────────────────────────────────────────────────────────

const TABS_EMP = ['MY PAY INFO', 'PAY HISTORY', 'TAX & WITHHOLDING'];
const TABS_HR  = ['MY PAY INFO', 'PAY HISTORY', 'TAX & WITHHOLDING', 'PAYROLL ADMIN'];

export default function DirectDeposit() {
  const { session } = useAuth();
  const person = session?.person || getSession();
  const personId = person?.id || null;
  const { locationIds } = useScope();

  const r = person?.role_name || '';
  const isHR = ['ceo', 'hr', 'manager', 'coo', 'admin', 'owner'].some(x => r.toLowerCase().includes(x));

  const [tab, setTab] = useState(0);

  const [currentDD, setCurrentDD] = useState(null);
  const [pendingDD, setPendingDD] = useState([]);
  const [roster, setRoster] = useState([]);
  const [stubs, setStubs] = useState([]);
  const [w4, setW4] = useState(null);
  const [runs, setRuns] = useState([]);
  const [adjustments, setAdjustments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  const idsKey = Array.isArray(locationIds) ? locationIds.join(',') : '';

  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    const ids = Array.isArray(locationIds) ? locationIds : [];
    const has = ids.length > 0;
    const results = await Promise.allSettled([
      personId ? sb.rpc('get_my_direct_deposit', { p_person_id: personId }) : Promise.resolve({ data: null }),
      personId ? sb.rpc('get_my_pay_stubs', { p_person_id: personId, p_limit: 26 }) : Promise.resolve({ data: [] }),
      personId ? sb.rpc('get_my_w4', { p_person_id: personId }) : Promise.resolve({ data: [] }),
      has ? sb.rpc('get_dd_roster', { p_node_ids: ids }) : Promise.resolve({ data: [] }),
      has ? sb.rpc('get_pending_dd_changes', { p_node_ids: ids }) : Promise.resolve({ data: [] }),
      has ? sb.rpc('get_payroll_runs', { p_node_ids: ids, p_limit: 12 }) : Promise.resolve({ data: [] }),
      has ? sb.rpc('get_pay_adjustments', { p_node_ids: ids, p_status: 'queued' }) : Promise.resolve({ data: [] }),
    ]);

    let failed = false;
    const val = (i) => {
      const s = results[i];
      if (s.status !== 'fulfilled') { failed = true; return { data: null, error: s.reason }; }
      if (s.value?.error) { failed = true; }
      return s.value || { data: null };
    };

    const dd = val(0); setCurrentDD(Array.isArray(dd.data) ? (dd.data[0] || null) : (dd.data || null));
    const st = val(1); setStubs(Array.isArray(st.data) ? st.data.map(mapStub) : []);
    const w = val(2); setW4(Array.isArray(w.data) ? (w.data[0] || null) : (w.data || null));
    const ro = val(3); setRoster(Array.isArray(ro.data) ? ro.data : []);
    const pe = val(4); setPendingDD(Array.isArray(pe.data) ? pe.data : []);
    const ru = val(5); setRuns(Array.isArray(ru.data) ? ru.data : []);
    const ad = val(6); setAdjustments(Array.isArray(ad.data) ? ad.data : []);

    if (failed) setErr('Some payroll data could not be loaded. Showing what is available.');
    setLoading(false);
  }, [personId, idsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(); }, [load]);

  // Current employee from real roster + current DD
  const myRow = useMemo(() => roster.find(e => e.person_id === personId) || null, [roster, personId]);

  const emp = useMemo(() => {
    const acct = currentDD?.account_number ?? currentDD?.account_last4 ?? myRow?.account_last4 ?? null;
    return {
      name: person?.full_name || 'You',
      role: myRow?.role_name || person?.role_name || '',
      loc: myRow?.location || '',
      wage: myRow?.wage ?? null,
      bank: currentDD?.bank_name || myRow?.bank_name || null,
      acct,
      routing: currentDD?.routing_number ?? currentDD?.routing_last4 ?? null,
      type: currentDD?.account_type || myRow?.account_type || null,
      status: acct ? (myRow?.dd_status === 'Pending' ? 'Pending' : 'Active') : (myRow?.dd_status || 'Missing'),
    };
  }, [currentDD, myRow, person]);

  const history = stubs;

  const kpis = useMemo(() => {
    const thisYear = history.filter(p => p.year === CUR_YEAR);
    const ytdGross = thisYear.reduce((a, p) => a + p.gross, 0);
    const ytdNet   = thisYear.reduce((a, p) => a + p.net, 0);
    const ytdTaxes = thisYear.reduce((a, p) => a + p.fed_tax + p.state_tax + p.ct_tax, 0);
    const wage = Number(emp.wage) || 0;
    const ytdOT = thisYear.reduce((a, p) => a + p.ot_hours * wage * 1.5, 0);
    const next = history.find(p => (p.status || '').toLowerCase() !== 'paid');
    const nextPayDate = next ? fmtDate(next.pay_date) : '—';
    const nextEst = next ? next.net : 0;

    let hrKPIs = null;
    if (isHR) {
      const now = new Date();
      const mtd = runs
        .filter(rn => { const d = new Date(rn.pay_date || rn.run_date); return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth(); })
        .reduce((a, rn) => a + Number(rn.total_gross || 0), 0);
      const missing = roster.filter(e => e.dd_status === 'Missing').length;
      const onFile = roster.filter(e => e.dd_status === 'Active').length;
      const pending = roster.filter(e => e.dd_status === 'Pending').length;
      const locs = [...new Set(roster.map(e => e.location || '—'))];
      const locStats = locs.map(loc => {
        const emps = roster.filter(e => (e.location || '—') === loc);
        return {
          loc,
          count: emps.length,
          onFile: emps.filter(e => e.dd_status === 'Active').length,
          missing: emps.filter(e => e.dd_status === 'Missing').length,
          pending: emps.filter(e => e.dd_status === 'Pending').length,
        };
      });
      hrKPIs = { mtd, headcount: roster.length, onFile, missing, pending, locStats };
    }
    return { nextPayDate, nextEst, ytdGross, ytdNet, ytdTaxes, ytdOT, hrKPIs };
  }, [history, emp.wage, isHR, roster, runs]);

  const TABS = isHR ? TABS_HR : TABS_EMP;

  return (
    <div style={{ padding: '16px 0', minHeight: '100vh', background: 'var(--t-bg)' }}>
      {/* Page Header */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: 'var(--t-text)' }}>Pay & Direct Deposit</h2>
          <span className="badge blue" style={{ fontSize: 10 }}>TG</span>
        </div>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--t-text-muted)' }}>
          {emp.name}{emp.role ? ` · ${emp.role}` : ''}{emp.loc ? ` · ${emp.loc}` : ''}
        </p>
      </div>

      {err && (
        <div style={{ background: 'rgba(255,170,0,.08)', border: '1px solid var(--t-warn)', borderRadius: 6, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: 'var(--t-warn)' }}>
          {err}
        </div>
      )}

      {/* Always-visible Forensic KPI Panel */}
      <ForensicKPIPanel kpis={kpis} isHR={isHR} history={history} roster={roster} />

      {/* Tab Bar */}
      <div style={{ display: 'flex', gap: 4, borderBottom: '2px solid var(--t-line)', marginBottom: 22 }}>
        {TABS.map((label, i) => (
          <button
            key={label}
            onClick={() => setTab(i)}
            style={{
              background: 'transparent', border: 'none', outline: 'none', cursor: 'pointer',
              padding: '9px 16px', fontSize: 11, fontWeight: 700, letterSpacing: '.08em',
              color: tab === i ? 'var(--t-accent)' : 'var(--t-text-muted)',
              borderBottom: tab === i ? '2px solid var(--t-accent)' : '2px solid transparent',
              marginBottom: -2, transition: 'color .15s',
            }}
          >
            {label}
            {label === 'PAYROLL ADMIN' && isHR && roster.filter(e => e.dd_status === 'Missing').length > 0 && (
              <span className="badge amber" style={{ marginLeft: 6, fontSize: 9 }}>
                {roster.filter(e => e.dd_status === 'Missing').length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '48px 20px', color: 'var(--t-text-muted)', fontSize: 13 }}>Loading pay data…</div>
      ) : (
        <>
          {tab === 0 && <MyPayInfoTab emp={emp} history={history} kpis={kpis} personId={personId} onChanged={load} />}
          {tab === 1 && <PayHistoryTab history={history} />}
          {tab === 2 && <TaxTab history={history} personId={personId} w4={w4} onChanged={load} />}
          {tab === 3 && isHR && (
            <PayrollAdminTab
              isHR={isHR}
              roster={roster}
              pendingDD={pendingDD}
              runs={runs}
              adjustments={adjustments}
              personId={personId}
              nodeIds={locationIds}
              onChanged={load}
            />
          )}
        </>
      )}
    </div>
  );
}
