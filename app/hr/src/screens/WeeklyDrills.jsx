import React, { useState, useEffect, useMemo, useCallback } from 'react';
import DrillDown from '../components/DrillDown.jsx';
import { sb, getSession } from '../lib/supabase';
import { useAuth } from '../lib/auth.jsx';
import { useScope } from '../lib/scope.jsx';

// ── helpers ───────────────────────────────────────────────────────────────────
function getWeekNumber(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function fmtTime(seconds) {
  if (!seconds) return '—';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

// Static enums for the authoring form (not data).
const CATEGORY_OPTIONS = ['Sales', 'Product', 'Safety', 'Policy', 'Customer Service'];

// ── KTile ─────────────────────────────────────────────────────────────────────
function KTile({ label, value, sub, color, alert, onClick }) {
  return (
    <div
      onClick={onClick}
      title={onClick ? 'Click to drill into records' : undefined}
      style={{
      background: 'var(--t-surface)',
      border: `1px solid ${alert === 'red' ? 'var(--t-danger)' : alert === 'amber' ? 'var(--t-warn)' : 'var(--t-line)'}`,
      padding: '14px 16px',
      position: 'relative',
      overflow: 'hidden',
      cursor: onClick ? 'pointer' : 'default',
    }}>
      {alert === 'red' && <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'var(--t-danger)' }} />}
      {alert === 'amber' && <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'var(--t-warn)' }} />}
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.08em', color: 'var(--t-text-muted)', textTransform: 'uppercase', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800, color: color || 'var(--t-text)', lineHeight: 1, marginBottom: 4 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--t-text-faint)' }}>{sub}</div>}
    </div>
  );
}

// ── confetti ──────────────────────────────────────────────────────────────────
function Confetti() {
  const pieces = useMemo(() => Array.from({ length: 22 }, (_, i) => ({
    id: i,
    left: `${4 + i * 4.2}%`,
    delay: `${(i * 0.13).toFixed(2)}s`,
    color: ['var(--t-accent)', 'var(--t-success)', 'var(--t-warn)', '#ff6bff', '#ffcc00'][i % 5],
    char: ['🎉', '⭐', '✨', '🏆', '💥'][i % 5],
  })), []);
  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden', zIndex: 5 }}>
      <style>{`
        @keyframes confettiFall {
          0%   { transform: translateY(-40px) rotate(0deg); opacity: 1; }
          80%  { opacity: 1; }
          100% { transform: translateY(120px) rotate(360deg); opacity: 0; }
        }
      `}</style>
      {pieces.map(p => (
        <span key={p.id} style={{
          position: 'absolute',
          top: 0,
          left: p.left,
          fontSize: 18,
          animation: `confettiFall 1.4s ease-in ${p.delay} both`,
          color: p.color,
          userSelect: 'none',
        }}>{p.char}</span>
      ))}
    </div>
  );
}

// ── drill runner ──────────────────────────────────────────────────────────────
function DrillRunner({ drill, onComplete, onCancel }) {
  const [qIdx, setQIdx] = useState(0);
  const [selected, setSelected] = useState(null);
  const [revealed, setRevealed] = useState(false);
  const [answers, setAnswers] = useState([]);
  const [startTime] = useState(Date.now());
  const [done, setDone] = useState(false);
  const [scoreData, setScoreData] = useState(null);

  const q = drill.questions[qIdx];
  const total = drill.questions.length;
  const progress = ((qIdx + (revealed ? 1 : 0)) / total) * 100;

  function handleSelect(idx) {
    if (revealed) return;
    setSelected(idx);
  }

  function handleReveal() {
    if (selected === null) return;
    setRevealed(true);
  }

  function handleNext() {
    const updated = [...answers, { qIdx, selected, correct: q.correct, isRight: selected === q.correct }];
    setAnswers(updated);
    if (qIdx + 1 >= total) {
      const rightCount = updated.filter(a => a.isRight).length;
      const pct = Math.round((rightCount / total) * 100);
      const timeSec = Math.round((Date.now() - startTime) / 1000);
      const pts = Math.round(drill.points * pct / 100);
      setScoreData({ pct, rightCount, total, timeSec, pts });
      setDone(true);
    } else {
      setQIdx(qIdx + 1);
      setSelected(null);
      setRevealed(false);
    }
  }

  function optStyle(idx) {
    const base = {
      width: '100%', textAlign: 'left', padding: '13px 16px',
      background: 'var(--t-surface-2)', border: '1px solid var(--t-line)',
      color: 'var(--t-text)', cursor: revealed ? 'default' : 'pointer',
      fontSize: 14, lineHeight: 1.5, transition: 'border-color .15s, background .15s',
      marginBottom: 8, display: 'flex', alignItems: 'center', gap: 10,
    };
    if (!revealed) {
      if (selected === idx) return { ...base, borderColor: 'var(--t-accent)', background: 'rgba(0,229,255,0.08)', color: 'var(--t-accent)' };
      return base;
    }
    if (idx === q.correct) return { ...base, borderColor: 'var(--t-success)', background: 'rgba(0,200,100,0.1)', color: 'var(--t-success)' };
    if (selected === idx && idx !== q.correct) return { ...base, borderColor: 'var(--t-danger)', background: 'rgba(255,70,70,0.08)', color: 'var(--t-danger)' };
    return { ...base, opacity: 0.45 };
  }

  if (done && scoreData) {
    const perfect = scoreData.pct === 100;
    return (
      <div style={{ padding: 32, textAlign: 'center', position: 'relative' }}>
        {perfect && <Confetti />}
        <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.1em', color: 'var(--t-text-muted)', marginBottom: 8, textTransform: 'uppercase' }}>Drill Complete</div>
        <div style={{ fontSize: 64, fontWeight: 900, color: perfect ? 'var(--t-success)' : scoreData.pct >= 67 ? 'var(--t-warn)' : 'var(--t-danger)', lineHeight: 1, marginBottom: 8 }}>
          {scoreData.pct}%
        </div>
        {perfect && <div style={{ fontSize: 22, marginBottom: 16 }}>🏆 Perfect Score!</div>}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 24, marginBottom: 28, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 11, color: 'var(--t-text-muted)', textTransform: 'uppercase', letterSpacing: '.06em' }}>Correct</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--t-text)' }}>{scoreData.rightCount}/{scoreData.total}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: 'var(--t-text-muted)', textTransform: 'uppercase', letterSpacing: '.06em' }}>Time</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--t-text)' }}>{fmtTime(scoreData.timeSec)}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: 'var(--t-text-muted)', textTransform: 'uppercase', letterSpacing: '.06em' }}>XP Earned</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--t-accent)' }}>+{scoreData.pts}</div>
          </div>
        </div>
        <button
          onClick={() => onComplete(scoreData)}
          style={{ padding: '12px 32px', background: 'var(--t-accent)', border: 'none', color: '#000', fontWeight: 800, fontSize: 15, cursor: 'pointer' }}
        >
          Done
        </button>
      </div>
    );
  }

  return (
    <div style={{ padding: '24px 28px' }}>
      {/* progress bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <div style={{ flex: 1, height: 4, background: 'var(--t-line)', borderRadius: 2 }}>
          <div style={{ height: '100%', width: `${progress}%`, background: 'var(--t-accent)', borderRadius: 2, transition: 'width .3s' }} />
        </div>
        <div style={{ fontSize: 12, color: 'var(--t-text-muted)', whiteSpace: 'nowrap', fontWeight: 700 }}>
          {qIdx + 1} / {total}
        </div>
      </div>

      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.08em', color: 'var(--t-accent)', textTransform: 'uppercase', marginBottom: 10 }}>
        {drill.category}
      </div>
      <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--t-text)', lineHeight: 1.5, marginBottom: 22 }}>
        {q.q}
      </div>

      <div style={{ marginBottom: 20 }}>
        {q.options.map((opt, idx) => (
          <button key={idx} style={optStyle(idx)} onClick={() => handleSelect(idx)}>
            <span style={{ fontSize: 11, fontWeight: 800, color: revealed ? 'inherit' : 'var(--t-text-muted)', minWidth: 18 }}>
              {String.fromCharCode(65 + idx)}.
            </span>
            <span style={{ flex: 1 }}>{opt}</span>
            {revealed && idx === q.correct && <span style={{ fontSize: 14 }}>✓</span>}
            {revealed && selected === idx && idx !== q.correct && <span style={{ fontSize: 14 }}>✗</span>}
          </button>
        ))}
      </div>

      {revealed && q.tip && (
        <div style={{ background: 'rgba(0,229,255,0.06)', border: '1px solid var(--t-accent)', padding: '12px 16px', marginBottom: 18, fontSize: 13, color: 'var(--t-text)', lineHeight: 1.6 }}>
          <span style={{ fontWeight: 700, color: 'var(--t-accent)' }}>Tip: </span>{q.tip}
        </div>
      )}

      <div style={{ display: 'flex', gap: 10 }}>
        {!revealed ? (
          <button
            onClick={handleReveal}
            disabled={selected === null}
            style={{
              padding: '11px 28px', background: selected !== null ? 'var(--t-accent)' : 'var(--t-surface-2)',
              border: '1px solid var(--t-line)', color: selected !== null ? '#000' : 'var(--t-text-faint)',
              fontWeight: 700, fontSize: 14, cursor: selected !== null ? 'pointer' : 'not-allowed',
            }}
          >
            Check Answer
          </button>
        ) : (
          <button
            onClick={handleNext}
            style={{ padding: '11px 28px', background: 'var(--t-accent)', border: 'none', color: '#000', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}
          >
            {qIdx + 1 >= total ? 'See Results' : 'Next Question →'}
          </button>
        )}
        <button
          onClick={onCancel}
          style={{ padding: '11px 20px', background: 'none', border: '1px solid var(--t-line)', color: 'var(--t-text-muted)', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ── history chart (sparkline avg scores) ─────────────────────────────────────
function ScoreSparkline({ rows }) {
  if (!rows || rows.length < 2) return null;
  const pts = rows.slice().reverse();
  const W = 320, H = 70, PAD = 8;
  const scores = pts.map(r => r.score);
  const max = 100, min = 0;
  const xStep = (W - PAD * 2) / (pts.length - 1);
  const yScale = v => H - PAD - ((v - min) / (max - min)) * (H - PAD * 2);
  const d = pts.map((r, i) => `${i === 0 ? 'M' : 'L'}${PAD + i * xStep},${yScale(r.score)}`).join(' ');
  const avgScore = Math.round(scores.reduce((s, v) => s + v, 0) / scores.length);
  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.07em', color: 'var(--t-text-muted)', marginBottom: 8 }}>
        Score Trend (last {pts.length} drills) — avg {avgScore}%
      </div>
      <svg width={W} height={H} style={{ display: 'block', overflow: 'visible' }}>
        <defs>
          <linearGradient id="sparkGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--t-accent)" stopOpacity="0.3" />
            <stop offset="100%" stopColor="var(--t-accent)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={`${d} L${PAD + (pts.length - 1) * xStep},${H} L${PAD},${H} Z`} fill="url(#sparkGrad)" />
        <path d={d} fill="none" stroke="var(--t-accent)" strokeWidth="2" strokeLinejoin="round" />
        {pts.map((r, i) => (
          <circle key={i} cx={PAD + i * xStep} cy={yScale(r.score)} r={3}
            fill={r.score === 100 ? 'var(--t-success)' : r.score >= 67 ? 'var(--t-warn)' : 'var(--t-danger)'}
            stroke="var(--t-bg)" strokeWidth="1.5" />
        ))}
      </svg>
    </div>
  );
}

// ── streak calendar ───────────────────────────────────────────────────────────
function StreakCalendar({ rows }) {
  const currentWeek = getWeekNumber(new Date());
  const weeks = useMemo(() => {
    const set = new Set(rows.map(r => r.week));
    return Array.from({ length: 12 }, (_, i) => {
      const w = currentWeek - 11 + i;
      return { week: w, done: set.has(w) };
    });
  }, [rows, currentWeek]);

  return (
    <div style={{ marginTop: 20 }}>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.07em', color: 'var(--t-text-muted)', marginBottom: 10 }}>
        Completion Calendar (last 12 weeks)
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {weeks.map(({ week, done }) => (
          <div key={week} title={`Week ${week}`} style={{
            width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 10, fontWeight: 700,
            background: done ? 'var(--t-success)' : 'var(--t-surface-2)',
            border: `1px solid ${done ? 'var(--t-success)' : 'var(--t-line)'}`,
            color: done ? '#000' : 'var(--t-text-faint)',
          }}>
            {week}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── manage drills form (real writes) ──────────────────────────────────────────
function ManageDrills({ drillStats, locations, onCreate }) {
  const [form, setForm] = useState({
    title: '',
    category: 'Sales',
    minutes: 5,
    points: 50,
    assignTo: 'all',
    questions: [{ q: '', options: ['', '', '', ''], correct: 0 }],
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState('');

  function updateQ(qIdx, field, value) {
    setForm(f => {
      const qs = f.questions.map((q, i) => i === qIdx ? { ...q, [field]: value } : q);
      return { ...f, questions: qs };
    });
  }

  function updateOpt(qIdx, oIdx, value) {
    setForm(f => {
      const qs = f.questions.map((q, i) => {
        if (i !== qIdx) return q;
        const opts = q.options.map((o, j) => j === oIdx ? value : o);
        return { ...q, options: opts };
      });
      return { ...f, questions: qs };
    });
  }

  function addQuestion() {
    setForm(f => ({ ...f, questions: [...f.questions, { q: '', options: ['', '', '', ''], correct: 0 }] }));
  }

  function removeQuestion(qIdx) {
    setForm(f => ({ ...f, questions: f.questions.filter((_, i) => i !== qIdx) }));
  }

  async function handleSubmit() {
    if (!form.title.trim() || saving) return;
    setSaving(true);
    setErr('');
    const cleanQuestions = form.questions
      .filter(q => q.q.trim())
      .map(q => ({
        q: q.q.trim(),
        options: q.options.map(o => o.trim()).filter(Boolean),
        correct: q.correct,
      }));
    const res = await onCreate({
      title: form.title.trim(),
      category: form.category,
      minutes: form.minutes,
      points: form.points,
      assignTo: form.assignTo,
      questions: cleanQuestions,
    });
    setSaving(false);
    if (res && res.ok) {
      setSaved(true);
      setTimeout(() => {
        setSaved(false);
        setForm({ title: '', category: 'Sales', minutes: 5, points: 50, assignTo: 'all', questions: [{ q: '', options: ['', '', '', ''], correct: 0 }] });
      }, 2500);
    } else {
      setErr((res && res.error) || 'Could not save drill. Please try again.');
    }
  }

  const inputStyle = {
    width: '100%', padding: '9px 12px', background: 'var(--t-surface-2)',
    border: '1px solid var(--t-line)', color: 'var(--t-text)', fontSize: 13,
    boxSizing: 'border-box',
  };
  const labelStyle = { display: 'block', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.07em', color: 'var(--t-text-muted)', marginBottom: 5 };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, alignItems: 'start' }}>
      {/* LEFT: add drill form */}
      <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', padding: 20 }}>
        <div style={{ fontSize: 13, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.07em', color: 'var(--t-text-muted)', marginBottom: 18 }}>
          Create New Drill
        </div>

        {saved && (
          <div style={{ background: 'rgba(0,200,100,0.1)', border: '1px solid var(--t-success)', padding: '10px 14px', marginBottom: 16, fontSize: 13, color: 'var(--t-success)', fontWeight: 700 }}>
            ✓ Drill published to the rotation.
          </div>
        )}
        {err && (
          <div style={{ background: 'rgba(255,70,70,0.1)', border: '1px solid var(--t-danger)', padding: '10px 14px', marginBottom: 16, fontSize: 13, color: 'var(--t-danger)', fontWeight: 700 }}>
            {err}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={labelStyle}>Drill Title</label>
            <input style={inputStyle} value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Holiday Upsell Tactics" />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={labelStyle}>Category</label>
              <select style={{ ...inputStyle }} value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
                {CATEGORY_OPTIONS.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Points</label>
              <input type="number" style={inputStyle} min={10} max={200} value={form.points} onChange={e => setForm(f => ({ ...f, points: +e.target.value }))} />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={labelStyle}>Est. Minutes</label>
              <input type="number" style={inputStyle} min={1} max={30} value={form.minutes} onChange={e => setForm(f => ({ ...f, minutes: +e.target.value }))} />
            </div>
            <div>
              <label style={labelStyle}>Assign To</label>
              <select style={{ ...inputStyle }} value={form.assignTo} onChange={e => setForm(f => ({ ...f, assignTo: e.target.value }))}>
                <option value="all">All Staff</option>
                <option value="associate">Associates Only</option>
                <option value="manager">Managers Only</option>
                {locations.map(l => <option key={l.id} value={l.id}>{l.name} Location</option>)}
              </select>
            </div>
          </div>

          {/* Questions */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <label style={{ ...labelStyle, marginBottom: 0 }}>Questions ({form.questions.length})</label>
              <button onClick={addQuestion} style={{ fontSize: 12, fontWeight: 700, color: 'var(--t-accent)', background: 'none', border: '1px solid var(--t-accent)', padding: '3px 10px', cursor: 'pointer' }}>
                + Add
              </button>
            </div>

            {form.questions.map((question, qi) => (
              <div key={qi} style={{ background: 'var(--t-surface-2)', border: '1px solid var(--t-line)', padding: 14, marginBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--t-text-muted)' }}>Q{qi + 1}</span>
                  {form.questions.length > 1 && (
                    <button onClick={() => removeQuestion(qi)} style={{ fontSize: 11, color: 'var(--t-danger)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700 }}>Remove</button>
                  )}
                </div>
                <textarea
                  rows={2}
                  style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit', marginBottom: 8 }}
                  placeholder="Question text..."
                  value={question.q}
                  onChange={e => updateQ(qi, 'q', e.target.value)}
                />
                {question.options.map((opt, oi) => (
                  <div key={oi} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <input
                      type="radio"
                      name={`correct-${qi}`}
                      checked={question.correct === oi}
                      onChange={() => updateQ(qi, 'correct', oi)}
                      title="Mark as correct answer"
                    />
                    <input
                      style={{ ...inputStyle, flex: 1 }}
                      placeholder={`Option ${String.fromCharCode(65 + oi)}`}
                      value={opt}
                      onChange={e => updateOpt(qi, oi, e.target.value)}
                    />
                  </div>
                ))}
                <div style={{ fontSize: 10, color: 'var(--t-text-faint)', marginTop: 2 }}>Select radio = correct answer</div>
              </div>
            ))}
          </div>

          <button
            onClick={handleSubmit}
            disabled={!form.title.trim() || saving}
            style={{
              padding: '12px 24px', background: form.title.trim() && !saving ? 'var(--t-accent)' : 'var(--t-surface-2)',
              border: 'none', color: form.title.trim() && !saving ? '#000' : 'var(--t-text-faint)',
              fontWeight: 800, fontSize: 14, cursor: form.title.trim() && !saving ? 'pointer' : 'not-allowed',
            }}
          >
            {saving ? 'Publishing…' : 'Publish Drill'}
          </button>
        </div>
      </div>

      {/* RIGHT: drill library table */}
      <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--t-line)', fontSize: 13, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.07em', color: 'var(--t-text-muted)' }}>
          Drill Library — {drillStats.length} drills
        </div>
        {drillStats.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 48, color: 'var(--t-text-muted)', fontSize: 13 }}>
            No drills published yet. Create one to start the rotation.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: 'var(--t-surface-2)' }}>
                  {['Title', 'Cat', 'Pts', 'Assigned', 'Done', 'Avg %'].map(h => (
                    <th key={h} style={{ padding: '9px 12px', textAlign: 'left', fontWeight: 700, color: 'var(--t-text-muted)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '.07em', whiteSpace: 'nowrap', borderBottom: '1px solid var(--t-line)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {drillStats.map((d, i) => (
                  <tr key={d.id} style={{ borderBottom: '1px solid var(--t-line)', background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)' }}>
                    <td style={{ padding: '9px 12px', color: 'var(--t-text)', fontWeight: 600, maxWidth: 130 }}>{d.title}</td>
                    <td style={{ padding: '9px 12px' }}>
                      <span className={`badge ${d.category === 'Sales' ? 'blue' : d.category === 'Safety' ? 'red' : d.category === 'Policy' ? 'amber' : d.category === 'Product' ? 'purple' : 'green'}`}>
                        {d.category}
                      </span>
                    </td>
                    <td style={{ padding: '9px 12px', color: 'var(--t-accent)', fontWeight: 700 }}>{d.points}</td>
                    <td style={{ padding: '9px 12px', color: 'var(--t-text-muted)' }}>{d.total_assigned}</td>
                    <td style={{ padding: '9px 12px', color: 'var(--t-text)' }}>{d.completed_count}</td>
                    <td style={{ padding: '9px 12px' }}>
                      <span className={`badge ${d.avg_score >= 80 ? 'green' : d.avg_score >= 60 ? 'amber' : 'red'}`}>{d.avg_score}%</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ── main component ────────────────────────────────────────────────────────────
export default function WeeklyDrills() {
  const { session } = useAuth();
  const { locationIds, locations, activeLocation } = useScope();

  const person = session?.person ?? { id: null, full_name: '', role_name: '' };
  const r = person.role_name || '';
  const isHR = ['ceo', 'hr', 'manager', 'coo', 'admin', 'owner'].some(x => r.toLowerCase().includes(x));

  const nodeIds = useMemo(() => (locationIds?.length ? locationIds : null), [locationIds]);
  const writeNodeId = activeLocation?.id ?? (nodeIds ? nodeIds[0] : null);

  const currentWeek = getWeekNumber(new Date());
  const currentYear = new Date().getFullYear();

  // ── tab ────────────────────────────────────────────────────────────────────
  const [tab, setTab] = useState('week');

  // ── live data ──────────────────────────────────────────────────────────────
  const [library, setLibrary] = useState([]);        // drill definitions (curriculum)
  const [completionsList, setCompletionsList] = useState([]); // this person's completions
  const [stats, setStats] = useState([]);            // HR per-drill stats
  const [benchmark, setBenchmark] = useState([]);    // HR per-employee benchmark
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState('');

  // ── drill runner state ─────────────────────────────────────────────────────
  const [runningDrill, setRunningDrill] = useState(null); // { drill, week }

  // ── loaders ────────────────────────────────────────────────────────────────
  const loadCompletions = useCallback(async () => {
    if (!person.id) { setCompletionsList([]); return; }
    const { data, error } = await sb.rpc('get_drill_completions', { p_person_id: person.id, p_year: currentYear });
    if (!error) setCompletionsList(Array.isArray(data) ? data : []);
  }, [person.id, currentYear]);

  const loadHR = useCallback(async () => {
    if (!isHR) { setStats([]); setBenchmark([]); return; }
    const [statsRes, benchRes] = await Promise.all([
      sb.rpc('get_drill_stats', { p_node_ids: nodeIds }),
      sb.rpc('get_drill_team_benchmark', { p_node_ids: nodeIds }),
    ]);
    if (!statsRes.error) setStats(Array.isArray(statsRes.data) ? statsRes.data : []);
    if (!benchRes.error) setBenchmark(Array.isArray(benchRes.data) ? benchRes.data : []);
  }, [isHR, nodeIds]);

  const loadLibrary = useCallback(async () => {
    const { data, error } = await sb.rpc('get_drill_definitions', { p_node_ids: nodeIds });
    if (error) throw error;
    setLibrary(Array.isArray(data) ? data : []);
  }, [nodeIds]);

  useEffect(() => {
    let mounted = true;
    async function loadAll() {
      setLoading(true);
      setLoadErr('');
      try {
        await Promise.all([loadLibrary(), loadCompletions(), loadHR()]);
      } catch (e) {
        if (mounted) setLoadErr(e?.message || 'Failed to load drills.');
      } finally {
        if (mounted) setLoading(false);
      }
    }
    loadAll();
    return () => { mounted = false; };
  }, [loadLibrary, loadCompletions, loadHR]);

  // ── derived: completions map keyed drillId_week ────────────────────────────
  const completions = useMemo(() => {
    const map = {};
    for (const c of completionsList) {
      map[`${c.drill_id}_${c.iso_week}`] = {
        pct: c.score_pct ?? 0,
        timeSec: c.time_sec ?? 0,
        pts: c.points_earned ?? 0,
        completedAt: c.completed_at ?? null,
      };
    }
    return map;
  }, [completionsList]);

  // ── this week's drill (rotation over the real curriculum) ──────────────────
  const weekDrill = library.length ? library[(currentWeek - 1) % library.length] : null;
  const weekCompletion = weekDrill ? (completions[`${weekDrill.id}_${currentWeek}`] || null) : null;
  const weekDrillIdx = library.length ? (currentWeek - 1) % library.length : 0;

  // ── history rows (from real completions) ───────────────────────────────────
  const history = useMemo(() => {
    return completionsList
      .map(c => ({
        week: c.iso_week,
        drillId: c.drill_id,
        title: c.title,
        category: c.category,
        score: c.score_pct ?? 0,
        timeSec: c.time_sec ?? 0,
        pointsEarned: c.points_earned ?? 0,
        completedAt: c.completed_at,
      }))
      .sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt));
  }, [completionsList]);

  // ── KPI computations ───────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    const all = Object.values(completions);
    const weekDone = weekCompletion !== null ? 1 : 0;
    const totalDone = all.length;
    const avgScore = totalDone > 0
      ? Math.round(all.reduce((s, c) => s + (c.pct || 0), 0) / totalDone)
      : 0;
    const totalPts = all.reduce((s, c) => s + (c.pts || 0), 0);

    // streak: consecutive prior weeks (down from current) with a completion
    let streak = 0;
    if (library.length) {
      for (let w = currentWeek; w >= 1; w--) {
        const weekDrillId = library[(w - 1) % library.length].id;
        if (completions[`${weekDrillId}_${w}`]) streak++;
        else break;
      }
    }

    // team benchmark average (real, from server aggregate)
    const scored = benchmark.filter(b => (b.completed || 0) > 0);
    const teamAvg = scored.length
      ? Math.round(scored.reduce((s, b) => s + (b.avg_score || 0), 0) / scored.length)
      : 0;

    return { weekDone, totalDone, avgScore, totalPts, streak, teamAvg };
  }, [completions, weekCompletion, currentWeek, library, benchmark]);

  // ── forensic drill-down ────────────────────────────────────────────────────
  const [drill, setDrill] = useState(null);
  function openDrill(cfg) { setDrill(cfg); }

  function drillTitle(id) {
    const d = library.find(x => x.id === id);
    return d ? d.title : id;
  }

  // real records behind each KPI tile
  const drillRows = useMemo(() => {
    const completionRows = completionsList.map(c => ({
      drillId: c.drill_id,
      title: c.title || drillTitle(c.drill_id),
      week: c.iso_week,
      pct: c.score_pct ?? 0,
      timeSec: c.time_sec ?? 0,
      pts: c.points_earned ?? 0,
      completedAt: c.completed_at || null,
    }));

    const weekRows = [];
    if (library.length) {
      for (let w = currentWeek; w >= Math.max(1, currentWeek - 11); w--) {
        const wd = library[(w - 1) % library.length];
        const c = completions[`${wd.id}_${w}`] || null;
        weekRows.push({
          week: w,
          title: wd.title,
          category: wd.category,
          status: c ? 'Completed' : (w === currentWeek ? 'Due Now' : 'Missed'),
          pct: c ? (c.pct || 0) : null,
          completedAt: c ? (c.completedAt || null) : null,
        });
      }
    }

    const employeeRows = benchmark.map(b => ({
      name: b.name,
      location: b.location,
      role: b.role,
      completed: b.completed ?? 0,
      avgScore: b.avg_score ?? 0,
      pts: b.pts ?? 0,
    }));

    return { completionRows, weekRows, employeeRows };
  }, [completionsList, completions, currentWeek, library, benchmark]);

  // ── column sets ────────────────────────────────────────────────────────────
  const catColor = c => ({ Sales: 'var(--t-accent)', Product: 'var(--t-accent)', Safety: 'var(--t-danger)', Policy: 'var(--t-warn)', 'Customer Service': 'var(--t-success)' }[c] || 'var(--t-text)');
  const pctColor = p => p == null ? 'var(--t-text-muted)' : p === 100 ? 'var(--t-success)' : p >= 67 ? 'var(--t-warn)' : 'var(--t-danger)';

  const completionCols = [
    { key: 'title', label: 'Drill' },
    { key: 'week', label: 'Week', align: 'right', value: r => `W${r.week}`, sortKey: r => r.week },
    { key: 'pct', label: 'Score', align: 'right', value: r => <span style={{ color: pctColor(r.pct), fontWeight: 700 }}>{r.pct}%</span>, sortKey: r => r.pct },
    { key: 'timeSec', label: 'Time', align: 'right', value: r => fmtTime(r.timeSec), sortKey: r => r.timeSec },
    { key: 'pts', label: 'XP', align: 'right', value: r => `+${r.pts}`, sortKey: r => r.pts },
    { key: 'completedAt', label: 'Completed', value: r => fmtDate(r.completedAt), sortKey: r => r.completedAt || '' },
  ];

  const weekCols = [
    { key: 'week', label: 'Week', align: 'right', value: r => `W${r.week}`, sortKey: r => r.week },
    { key: 'title', label: 'Drill' },
    { key: 'category', label: 'Category', value: r => <span style={{ color: catColor(r.category), fontWeight: 700 }}>{r.category}</span> },
    { key: 'status', label: 'Status', value: r => <span style={{ color: r.status === 'Completed' ? 'var(--t-success)' : r.status === 'Due Now' ? 'var(--t-warn)' : 'var(--t-danger)', fontWeight: 700 }}>{r.status}</span> },
    { key: 'pct', label: 'Score', align: 'right', value: r => r.pct == null ? '—' : <span style={{ color: pctColor(r.pct), fontWeight: 700 }}>{r.pct}%</span>, sortKey: r => r.pct == null ? -1 : r.pct },
    { key: 'completedAt', label: 'Completed', value: r => fmtDate(r.completedAt), sortKey: r => r.completedAt || '' },
  ];

  const employeeCols = [
    { key: 'name', label: 'Employee' },
    { key: 'location', label: 'Location' },
    { key: 'role', label: 'Role' },
    { key: 'completed', label: 'Drills', align: 'right', sortKey: r => r.completed },
    { key: 'avgScore', label: 'Avg Score', align: 'right', value: r => <span style={{ color: pctColor(r.avgScore), fontWeight: 700 }}>{r.avgScore}%</span>, sortKey: r => r.avgScore },
    { key: 'pts', label: 'Total XP', align: 'right', value: r => `+${r.pts}`, sortKey: r => r.pts },
  ];

  // ── handle drill completion (real write + refresh) ─────────────────────────
  async function handleDrillComplete(scoreData) {
    const rd = runningDrill;
    setRunningDrill(null);
    if (!rd || !person.id) return;
    try {
      const { data, error } = await sb.rpc('drill_complete', {
        p_person_id: person.id,
        p_drill_id: rd.drill.id,
        p_node_id: writeNodeId,
        p_iso_week: rd.week,
        p_iso_year: currentYear,
        p_score_pct: scoreData.pct,
        p_time_sec: scoreData.timeSec,
        p_points_earned: scoreData.pts,
      });
      if (error || (data && data.ok === false)) throw (error || new Error(data?.error || 'save failed'));
      await loadCompletions();
      if (isHR) await loadHR();
    } catch (e) {
      try {
        window.dispatchEvent(new CustomEvent('vip-toast', {
          detail: { msg: 'Drill score not saved — please try again.', type: 'error' },
        }));
      } catch (_) { /* non-browser */ }
    }
  }

  // ── create drill (real write, HR) ──────────────────────────────────────────
  async function handleCreateDrill(payload) {
    if (!person.id) return { ok: false, error: 'You must be signed in.' };
    // resolve assignTo → node scope (a location id targets one node; else all)
    const assignNode = locations.some(l => l.id === payload.assignTo) ? payload.assignTo : null;
    const { data, error } = await sb.rpc('drill_definition_upsert', {
      p_id: null,
      p_node_id: assignNode,
      p_title: payload.title,
      p_category: payload.category,
      p_minutes: payload.minutes,
      p_points: payload.points,
      p_questions: payload.questions,
      p_assign_to: payload.assignTo,
      p_actor: person.id,
    });
    if (error) return { ok: false, error: error.message };
    if (data && data.ok === false) return { ok: false, error: data.error };
    await Promise.all([loadLibrary(), loadHR()]);
    return { ok: true };
  }

  // ── badge color helpers ────────────────────────────────────────────────────
  function scoreBadge(score) {
    return score === 100 ? 'badge green' : score >= 67 ? 'badge amber' : 'badge red';
  }

  function catBadge(cat) {
    const map = { Sales: 'blue', Product: 'purple', Safety: 'red', Policy: 'amber', 'Customer Service': 'green' };
    return `badge ${map[cat] || 'blue'}`;
  }

  // ── tabs ───────────────────────────────────────────────────────────────────
  const tabs = [
    { id: 'week', label: "This Week's Drills" },
    { id: 'history', label: 'Drill History' },
    ...(isHR ? [{ id: 'manage', label: 'Manage Drills' }] : []),
  ];

  // ── inline drill runner overlay ────────────────────────────────────────────
  if (runningDrill) {
    return (
      <div style={{ padding: 24 }}>
        <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', maxWidth: 640 }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--t-line)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.08em', color: 'var(--t-text-muted)', textTransform: 'uppercase' }}>{runningDrill.drill.category}</div>
              <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--t-text)' }}>{runningDrill.drill.title}</div>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ fontSize: 12, color: 'var(--t-text-muted)' }}>{runningDrill.drill.questions.length} questions</span>
              <span style={{ fontSize: 12, color: 'var(--t-accent)', fontWeight: 700 }}>+{runningDrill.drill.points} XP</span>
            </div>
          </div>
          <DrillRunner
            drill={runningDrill.drill}
            onComplete={handleDrillComplete}
            onCancel={() => setRunningDrill(null)}
          />
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: 24 }}>
      {/* header */}
      <div style={{ marginBottom: 22 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: 'var(--t-text)', letterSpacing: '-0.3px' }}>Weekly Drills</h1>
        <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--t-text-muted)' }}>
          Short punchy training drills to sharpen skills — required every week.
        </p>
      </div>

      {loadErr && (
        <div style={{ background: 'rgba(255,70,70,0.1)', border: '1px solid var(--t-danger)', padding: '10px 14px', marginBottom: 16, fontSize: 13, color: 'var(--t-danger)', fontWeight: 700 }}>
          {loadErr}
        </div>
      )}

      {/* KPI row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10, marginBottom: 22 }}>
        <KTile label="Drills This Week" value={`${kpis.weekDone}/1`} sub={`Week ${currentWeek}`} color={kpis.weekDone ? 'var(--t-success)' : 'var(--t-warn)'} alert={kpis.weekDone ? null : 'amber'}
          onClick={() => openDrill({
            title: `This Week's Drill — Week ${currentWeek}`,
            subtitle: `${kpis.weekDone ? 'Completed' : 'Not yet completed'}${weekDrill ? ' · ' + weekDrill.title : ''}`,
            accent: kpis.weekDone ? 'var(--t-success)' : 'var(--t-warn)',
            columns: weekCols,
            rows: drillRows.weekRows.filter(r => r.week === currentWeek),
            summary: [
              { label: 'Week', value: currentWeek },
              { label: 'Status', value: kpis.weekDone ? 'Done' : 'Due', color: kpis.weekDone ? 'var(--t-success)' : 'var(--t-warn)' },
            ],
          })} />
        <KTile label="Completed %" value={kpis.weekDone ? '100%' : '0%'} sub="this week"
          onClick={() => openDrill({
            title: 'Weekly Completion Record',
            subtitle: `Completion status across the last ${drillRows.weekRows.length} weeks`,
            accent: 'var(--t-accent)',
            columns: weekCols,
            rows: drillRows.weekRows,
            summary: [
              { label: 'Weeks Tracked', value: drillRows.weekRows.length },
              { label: 'Completed', value: drillRows.weekRows.filter(r => r.status === 'Completed').length, color: 'var(--t-success)' },
              { label: 'Missed / Due', value: drillRows.weekRows.filter(r => r.status !== 'Completed').length, color: 'var(--t-danger)' },
            ],
          })} />
        <KTile label="Avg Score" value={`${kpis.avgScore}%`} sub="all time" color={kpis.avgScore >= 80 ? 'var(--t-success)' : kpis.avgScore >= 60 ? 'var(--t-warn)' : 'var(--t-danger)'}
          onClick={() => openDrill({
            title: 'All Drill Completions — Score Detail',
            subtitle: `${drillRows.completionRows.length} completed drills · avg ${kpis.avgScore}%`,
            accent: 'var(--t-accent)',
            columns: completionCols,
            rows: drillRows.completionRows,
            summary: [
              { label: 'Completions', value: drillRows.completionRows.length },
              { label: 'Avg Score', value: `${kpis.avgScore}%`, color: pctColor(kpis.avgScore) },
              { label: 'Perfect', value: drillRows.completionRows.filter(r => r.pct === 100).length, color: 'var(--t-success)' },
            ],
          })} />
        <KTile label="Points Earned" value={kpis.totalPts} sub="total XP" color="var(--t-accent)"
          onClick={() => openDrill({
            title: 'XP Ledger — Points Earned',
            subtitle: `Every drill completion and the XP it awarded · ${kpis.totalPts} total`,
            accent: 'var(--t-accent)',
            columns: completionCols,
            rows: drillRows.completionRows,
            summary: [
              { label: 'Total XP', value: `+${kpis.totalPts}`, color: 'var(--t-accent)' },
              { label: 'Completions', value: drillRows.completionRows.length },
            ],
          })} />
        <KTile label="Streak" value={`${kpis.streak}wk`} sub="consecutive" color={kpis.streak >= 4 ? 'var(--t-success)' : 'var(--t-text)'}
          onClick={() => openDrill({
            title: `Completion Streak — ${kpis.streak} week${kpis.streak === 1 ? '' : 's'}`,
            subtitle: 'Consecutive weeks with a completed drill (most recent first)',
            accent: kpis.streak >= 4 ? 'var(--t-success)' : 'var(--t-accent)',
            columns: weekCols,
            rows: drillRows.weekRows,
            summary: [
              { label: 'Current Streak', value: `${kpis.streak}wk`, color: kpis.streak >= 4 ? 'var(--t-success)' : 'var(--t-text)' },
              { label: 'Completed', value: drillRows.weekRows.filter(r => r.status === 'Completed').length, color: 'var(--t-success)' },
            ],
          })} />
        {isHR && (
          <KTile label="vs Team Avg" value={`${kpis.teamAvg}%`} sub="team benchmark"
            onClick={() => openDrill({
              title: 'Team Benchmark — Per-Employee Drill Performance',
              subtitle: `${drillRows.employeeRows.length} employees · team avg ${kpis.teamAvg}%`,
              accent: 'var(--t-accent)',
              columns: employeeCols,
              rows: drillRows.employeeRows,
              summary: [
                { label: 'Employees', value: drillRows.employeeRows.length },
                { label: 'Team Avg', value: `${kpis.teamAvg}%`, color: pctColor(kpis.teamAvg) },
                { label: 'Your Avg', value: `${kpis.avgScore}%`, color: pctColor(kpis.avgScore) },
              ],
            })} />
        )}
      </div>

      {/* tab bar */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--t-line)', marginBottom: 20 }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            background: 'none', border: 'none',
            borderBottom: tab === t.id ? '2px solid var(--t-accent)' : '2px solid transparent',
            color: tab === t.id ? 'var(--t-accent)' : 'var(--t-text-muted)',
            padding: '10px 18px', fontSize: 13, fontWeight: 700, cursor: 'pointer',
            textTransform: 'uppercase', letterSpacing: '.06em',
          }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── TAB: This Week's Drills ── */}
      {tab === 'week' && (
        <div>
          {loading ? (
            <div style={{ textAlign: 'center', padding: 80, color: 'var(--t-text-muted)' }}>Loading drills…</div>
          ) : !weekDrill ? (
            <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', padding: 48, textAlign: 'center', color: 'var(--t-text-muted)', fontSize: 13 }}>
              No drills have been published yet.{isHR ? ' Use the Manage Drills tab to create the first one.' : ' Check back soon.'}
            </div>
          ) : (
          <>
          {/* featured drill */}
          <div style={{
            background: weekCompletion ? 'linear-gradient(135deg, rgba(0,200,100,0.07) 0%, var(--t-surface) 100%)' : 'linear-gradient(135deg, rgba(0,229,255,0.05) 0%, var(--t-surface) 100%)',
            border: `1px solid ${weekCompletion ? 'var(--t-success)' : 'var(--t-accent)'}`,
            padding: 24, marginBottom: 20,
          }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 18, gap: 16, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.08em', color: 'var(--t-text-muted)', textTransform: 'uppercase', marginBottom: 4 }}>
                  Featured — Week {currentWeek}
                </div>
                <div style={{ fontSize: 19, fontWeight: 800, color: 'var(--t-text)' }}>{weekDrill.title}</div>
                <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  <span className={catBadge(weekDrill.category)}>{weekDrill.category}</span>
                  <span style={{ fontSize: 12, color: 'var(--t-text-muted)' }}>{weekDrill.questions.length} questions · ~{weekDrill.minutes} min</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--t-accent)' }}>+{weekDrill.points} XP</span>
                </div>
              </div>
              {weekCompletion
                ? <span className="badge green">✓ Completed</span>
                : <span className="badge red">Required</span>}
            </div>

            {weekCompletion ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
                <div style={{ textAlign: 'center', padding: '14px 24px', background: 'rgba(0,200,100,0.1)', border: '1px solid var(--t-success)' }}>
                  <div style={{ fontSize: 36, fontWeight: 900, color: 'var(--t-success)', lineHeight: 1 }}>{weekCompletion.pct}%</div>
                  <div style={{ fontSize: 10, color: 'var(--t-text-muted)', textTransform: 'uppercase', letterSpacing: '.07em', marginTop: 3 }}>Score</div>
                </div>
                <div style={{ display: 'flex', gap: 20 }}>
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--t-text-muted)' }}>XP Earned</div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--t-accent)' }}>+{weekCompletion.pts}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--t-text-muted)' }}>Time</div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--t-text)' }}>{fmtTime(weekCompletion.timeSec)}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--t-text-muted)' }}>Completed</div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--t-text)' }}>{fmtDate(weekCompletion.completedAt)}</div>
                  </div>
                </div>
                {weekCompletion.pct === 100 && (
                  <div style={{ fontSize: 20 }}>🏆 Perfect!</div>
                )}
              </div>
            ) : (
              <button
                onClick={() => setRunningDrill({ drill: weekDrill, week: currentWeek })}
                disabled={!weekDrill.questions?.length}
                style={{ padding: '12px 28px', background: 'var(--t-accent)', border: 'none', color: '#000', fontWeight: 800, fontSize: 15, cursor: 'pointer' }}
              >
                Start Drill →
              </button>
            )}
          </div>

          {/* rotation schedule (real curriculum) */}
          <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)' }}>
            <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--t-line)', fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.07em', color: 'var(--t-text-muted)' }}>
              Drill Rotation Schedule
            </div>
            {library.map((d, di) => {
              const isCurrent = di === weekDrillIdx;
              const weeksAway = (di - weekDrillIdx + library.length) % library.length;
              return (
                <div key={d.id} style={{
                  display: 'flex', alignItems: 'center', gap: 14, padding: '12px 18px',
                  borderBottom: '1px solid var(--t-line)', opacity: isCurrent ? 1 : 0.65,
                  background: isCurrent ? 'rgba(0,229,255,0.04)' : 'transparent',
                }}>
                  <div style={{ width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--t-surface-2)', border: `1px solid ${isCurrent ? 'var(--t-accent)' : 'var(--t-line)'}`, fontSize: 11, fontWeight: 800, color: isCurrent ? 'var(--t-accent)' : 'var(--t-text-muted)', flexShrink: 0 }}>
                    {di + 1}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--t-text)' }}>{d.title}</div>
                    <div style={{ fontSize: 11, color: 'var(--t-text-muted)', marginTop: 2 }}>
                      {d.questions.length}q · ~{d.minutes}min · {d.points}pts
                    </div>
                  </div>
                  <span className={catBadge(d.category)}>{d.category}</span>
                  {isCurrent
                    ? <span className="badge green">This Week</span>
                    : <span className="badge blue">+{weeksAway}wk</span>}
                </div>
              );
            })}
          </div>
          </>
          )}
        </div>
      )}

      {/* ── TAB: History ── */}
      {tab === 'history' && (
        <div>
          {loading ? (
            <div style={{ textAlign: 'center', padding: 80, color: 'var(--t-text-muted)' }}>Loading history…</div>
          ) : (
            <>
              {/* score sparkline */}
              {history.length >= 2 && (
                <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', padding: 20, marginBottom: 16 }}>
                  <ScoreSparkline rows={history} />
                  <StreakCalendar rows={history} />
                </div>
              )}

              {/* history table */}
              <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)' }}>
                <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--t-line)', fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.07em', color: 'var(--t-text-muted)' }}>
                  Completed Drills ({history.length})
                </div>
                {history.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: 64, color: 'var(--t-text-muted)', fontSize: 13 }}>
                    No drills completed yet. Head to "This Week's Drills" to start!
                  </div>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                      <thead>
                        <tr style={{ background: 'var(--t-surface-2)' }}>
                          {['Date', 'Drill', 'Category', 'Score', 'Time', 'Points'].map(h => (
                            <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 700, color: 'var(--t-text-muted)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '.07em', borderBottom: '1px solid var(--t-line)', whiteSpace: 'nowrap' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {history.map((row, i) => (
                          <tr key={i} style={{ borderBottom: '1px solid var(--t-line)' }}>
                            <td style={{ padding: '10px 14px', color: 'var(--t-text-muted)', whiteSpace: 'nowrap' }}>{fmtDate(row.completedAt)}</td>
                            <td style={{ padding: '10px 14px', color: 'var(--t-text)', fontWeight: 600 }}>{row.title}</td>
                            <td style={{ padding: '10px 14px' }}><span className={catBadge(row.category)}>{row.category}</span></td>
                            <td style={{ padding: '10px 14px' }}><span className={scoreBadge(row.score)}>{row.score}%</span></td>
                            <td style={{ padding: '10px 14px', color: 'var(--t-text-muted)', whiteSpace: 'nowrap' }}>{fmtTime(row.timeSec)}</td>
                            <td style={{ padding: '10px 14px', color: 'var(--t-accent)', fontWeight: 700 }}>+{row.pointsEarned}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* ── TAB: Manage Drills (HR) ── */}
      {tab === 'manage' && isHR && (
        <ManageDrills drillStats={stats} locations={locations} onCreate={handleCreateDrill} />
      )}

      {/* forensic drill-down modal */}
      <DrillDown open={!!drill} onClose={() => setDrill(null)} {...(drill || {})} />
    </div>
  );
}
