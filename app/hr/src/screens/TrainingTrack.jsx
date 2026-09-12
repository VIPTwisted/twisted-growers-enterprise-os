import React, { useState, useEffect, useMemo } from 'react';

// ── Hooks ─────────────────────────────────────────────────────────────────────
function useAuth() {
  return {
    session: {
      person: {
        id: 'emp-007',
        full_name: 'Jordan Kim',
        role_name: 'Key Holder',
      },
    },
  };
}

function useScope() {
  return { locationIds: ['loc-2'] };
}

function useSupabase() {
  return {
    rpc: async () => ({ data: null, error: new Error('mock') }),
  };
}

// ── Deterministic seed ────────────────────────────────────────────────────────
function seed(a, b) {
  return ((a * 31 + b) * 17 + a * b) % 100;
}

// ── Constants ─────────────────────────────────────────────────────────────────
const STAGES = [
  {
    num: 1,
    name: 'New Hire',
    range: 'Days 1–30',
    color: '#00e5ff',
    courses: [
      { id: 'c01', name: 'Orientation & Welcome', hours: 2 },
      { id: 'c02', name: 'Store Safety & Emergency Procedures', hours: 3 },
      { id: 'c03', name: 'Product Basics Overview', hours: 4 },
      { id: 'c04', name: 'POS System Training', hours: 3 },
    ],
  },
  {
    num: 2,
    name: 'Product Expert',
    range: 'Days 31–90',
    color: '#7c4dff',
    courses: [
      { id: 'c05', name: 'Advanced Product Knowledge', hours: 6 },
      { id: 'c06', name: 'Inventory Management', hours: 4 },
      { id: 'c07', name: 'Customer Service Fundamentals', hours: 5 },
    ],
  },
  {
    num: 3,
    name: 'Sales Pro',
    range: 'Days 91–180',
    color: '#ff9800',
    courses: [
      { id: 'c08', name: 'Advanced Sales Techniques', hours: 6 },
      { id: 'c09', name: 'Upselling & Cross-Selling', hours: 4 },
      { id: 'c10', name: 'Customer Cultivation & Loyalty', hours: 5 },
      { id: 'c11', name: 'Performance Metrics & KPIs', hours: 3 },
    ],
  },
  {
    num: 4,
    name: 'Manager Track',
    range: 'Days 181+',
    color: '#f44336',
    courses: [
      { id: 'c12', name: 'Leadership Basics', hours: 8 },
      { id: 'c13', name: 'Scheduling & Workforce Planning', hours: 5 },
      { id: 'c14', name: 'Disciplinary Procedures & Documentation', hours: 4 },
      { id: 'c15', name: 'P&L Basics & Store Finance', hours: 6 },
    ],
  },
];

const CERT_DEFINITIONS = [
  { id: 'cert-01', name: 'Product Knowledge — Lingerie', icon: '📜', expiresMonths: 12 },
  { id: 'cert-02', name: 'Sales Pro Certified', icon: '🏆', expiresMonths: null },
  { id: 'cert-03', name: 'Safety Compliance 2025', icon: '📜', expiresMonths: 12 },
  { id: 'cert-04', name: 'POS System Proficiency', icon: '🏆', expiresMonths: null },
  { id: 'cert-05', name: 'Customer Service Excellence', icon: '🏆', expiresMonths: 24 },
  { id: 'cert-06', name: 'Inventory Management', icon: '📜', expiresMonths: 24 },
  { id: 'cert-07', name: 'Leadership Foundations', icon: '🏆', expiresMonths: null },
  { id: 'cert-08', name: 'Adult Products — Advanced', icon: '📜', expiresMonths: 12 },
];

const SKILL_CATEGORIES = [
  {
    id: 'product',
    label: 'Product Knowledge',
    color: '#00e5ff',
    skills: [
      { id: 'pk1', name: 'Lingerie', required: 4 },
      { id: 'pk2', name: 'Toys & Novelties', required: 3 },
      { id: 'pk3', name: 'BDSM / Kink', required: 2 },
      { id: 'pk4', name: 'Couples Items', required: 3 },
      { id: 'pk5', name: 'Skincare & Beauty', required: 3 },
    ],
  },
  {
    id: 'sales',
    label: 'Sales Techniques',
    color: '#7c4dff',
    skills: [
      { id: 'st1', name: 'Upselling', required: 4 },
      { id: 'st2', name: 'Needs Assessment', required: 4 },
      { id: 'st3', name: 'Objection Handling', required: 3 },
      { id: 'st4', name: 'Closing', required: 4 },
    ],
  },
  {
    id: 'service',
    label: 'Customer Service',
    color: '#4caf50',
    skills: [
      { id: 'cs1', name: 'Rapport Building', required: 4 },
      { id: 'cs2', name: 'Privacy Handling', required: 5 },
      { id: 'cs3', name: 'Complaint Resolution', required: 4 },
      { id: 'cs4', name: 'Follow-up', required: 3 },
    ],
  },
  {
    id: 'leadership',
    label: 'Leadership',
    color: '#ff9800',
    skills: [
      { id: 'ldr1', name: 'Team Communication', required: 3 },
      { id: 'ldr2', name: 'Scheduling', required: 3 },
      { id: 'ldr3', name: 'Conflict Resolution', required: 4 },
      { id: 'ldr4', name: 'Performance Coaching', required: 3 },
    ],
  },
  {
    id: 'ops',
    label: 'Operations',
    color: '#f44336',
    skills: [
      { id: 'op1', name: 'POS System', required: 5 },
      { id: 'op2', name: 'Inventory', required: 4 },
      { id: 'op3', name: 'Opening / Closing', required: 4 },
      { id: 'op4', name: 'Cash Handling', required: 5 },
    ],
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────
function hashStr(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function genVerificationCode(empId, certId) {
  const n = hashStr(empId + certId);
  const a = String(n % 10000).padStart(4, '0');
  const b = String((n >> 8) % 10000).padStart(4, '0');
  return `Twisted Growers-${a}-${b}`;
}

function addDays(dateStr, days) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function daysFromNow(dateStr) {
  const now = new Date('2026-06-27');
  const then = new Date(dateStr);
  return Math.round((then - now) / 86400000);
}

function fmtDate(d) {
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// Build course completion map deterministically from empId
function buildCompletionMap(empId) {
  const eid = hashStr(empId);
  const map = {};
  let idx = 0;
  STAGES.forEach(stage => {
    stage.courses.forEach(course => {
      const sv = seed(eid % 97, idx + 1);
      map[course.id] = sv < 72; // ~72% completion rate
      idx++;
    });
  });
  // Force stage 1 all done (any hired employee)
  STAGES[0].courses.forEach(c => { map[c.id] = true; });
  return map;
}

// Build cert list for employee
function buildCerts(empId) {
  const eid = hashStr(empId);
  const BASE_DATE = '2025-03-15';
  return CERT_DEFINITIONS.filter((_, i) => seed(eid % 97, i + 10) < 55).map((cert, i) => {
    const issueDate = addDays(BASE_DATE, seed(eid % 97, i + 20) * 3);
    const expiryDate = cert.expiresMonths
      ? addDays(issueDate, cert.expiresMonths * 30)
      : null;
    return { ...cert, issueDate, expiryDate };
  });
}

// Build skill ratings
function buildSkillRatings(empId) {
  const eid = hashStr(empId);
  const ratings = {};
  const sources = {};
  let idx = 0;
  SKILL_CATEGORIES.forEach(cat => {
    cat.skills.forEach(skill => {
      const v = seed(eid % 97, idx + 30);
      ratings[skill.id] = Math.max(1, Math.min(5, Math.floor(v / 20) + 1));
      sources[skill.id] = v > 50 ? 'Training' : 'Manager Rating';
      idx++;
    });
  });
  return { ratings, sources };
}

// ── KTile ─────────────────────────────────────────────────────────────────────
function KTile({ label, value, sub, color, alert }) {
  return (
    <div
      style={{
        background: 'var(--t-surface)',
        border: `1px solid ${
          alert === 'red'
            ? 'var(--t-danger)'
            : alert === 'amber'
            ? 'var(--t-warn)'
            : 'var(--t-line)'
        }`,
        padding: '14px 16px',
        position: 'relative',
        overflow: 'hidden',
        flex: 1,
        minWidth: 0,
      }}
    >
      {alert === 'red' && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: 2,
            background: 'var(--t-danger)',
          }}
        />
      )}
      {alert === 'amber' && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: 2,
            background: 'var(--t-warn)',
          }}
        />
      )}
      <div
        style={{
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: '.08em',
          color: 'var(--t-text-muted)',
          textTransform: 'uppercase',
          marginBottom: 6,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 24,
          fontWeight: 800,
          color: color || 'var(--t-text)',
          lineHeight: 1,
          marginBottom: 4,
        }}
      >
        {value}
      </div>
      {sub && (
        <div style={{ fontSize: 11, color: 'var(--t-text-faint)' }}>{sub}</div>
      )}
    </div>
  );
}

// ── Progress Ring (SVG) ───────────────────────────────────────────────────────
function ProgressRing({ pct, size = 52, stroke = 4, color, bg = 'var(--t-line)', label }) {
  const r = (size - stroke * 2) / 2;
  const circ = 2 * Math.PI * r;
  const dash = circ - (pct / 100) * circ;
  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)', display: 'block' }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={bg} strokeWidth={stroke} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeDasharray={circ}
        strokeDashoffset={dash}
        strokeLinecap="round"
        style={{ transition: 'stroke-dashoffset 0.6s ease' }}
      />
      {label && (
        <text
          x={size / 2}
          y={size / 2 + 4}
          textAnchor="middle"
          style={{
            transform: 'rotate(90deg)',
            transformOrigin: `${size / 2}px ${size / 2}px`,
            fontSize: 10,
            fontWeight: 700,
            fill: color,
          }}
        >
          {label}
        </text>
      )}
    </svg>
  );
}

// ── Star Rating ───────────────────────────────────────────────────────────────
function StarRating({ value, onChange, readonly = false }) {
  const [hover, setHover] = useState(0);
  return (
    <span style={{ fontSize: 18, letterSpacing: 1 }}>
      {[1, 2, 3, 4, 5].map(i => (
        <span
          key={i}
          style={{
            color: (hover || value) >= i ? '#ffc107' : 'var(--t-line)',
            cursor: readonly ? 'default' : 'pointer',
            userSelect: 'none',
          }}
          onMouseEnter={() => !readonly && setHover(i)}
          onMouseLeave={() => !readonly && setHover(0)}
          onClick={() => !readonly && onChange && onChange(i)}
        >
          {(hover || value) >= i ? '★' : '☆'}
        </span>
      ))}
    </span>
  );
}

// ── Tab Bar ───────────────────────────────────────────────────────────────────
function TabBar({ tabs, active, onChange }) {
  return (
    <div
      style={{
        display: 'flex',
        borderBottom: '1px solid var(--t-line)',
        marginBottom: 24,
        gap: 0,
      }}
    >
      {tabs.map(t => (
        <button
          key={t}
          onClick={() => onChange(t)}
          style={{
            background: 'none',
            border: 'none',
            borderBottom: active === t ? '2px solid var(--t-accent)' : '2px solid transparent',
            color: active === t ? 'var(--t-accent)' : 'var(--t-text-muted)',
            padding: '10px 22px',
            cursor: 'pointer',
            fontSize: 13,
            fontWeight: active === t ? 700 : 400,
            marginBottom: -1,
            whiteSpace: 'nowrap',
          }}
        >
          {t}
        </button>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB 1 — MY LEARNING PATH
// ─────────────────────────────────────────────────────────────────────────────
function LearningPathTab({ empId }) {
  const completionMap = useMemo(() => buildCompletionMap(empId), [empId]);

  // Per-stage stats
  const stageStats = useMemo(() =>
    STAGES.map(stage => {
      const total = stage.courses.length;
      const done = stage.courses.filter(c => completionMap[c.id]).length;
      const pct = Math.round((done / total) * 100);
      return { ...stage, done, total, pct };
    }),
  [completionMap]);

  // Determine current stage (first incomplete)
  const currentStageIdx = useMemo(() => {
    const first = stageStats.findIndex(s => s.pct < 100);
    return first === -1 ? stageStats.length - 1 : first;
  }, [stageStats]);

  const currentStage = stageStats[currentStageIdx];
  const nextStage = stageStats[currentStageIdx + 1] || null;

  // Status label
  function stageStatus(pct) {
    if (pct >= 100) return { label: 'Complete', color: 'var(--t-success)' };
    if (pct >= 50) return { label: 'In Progress', color: 'var(--t-warn)' };
    return { label: 'Not Started', color: 'var(--t-text-muted)' };
  }

  // On track / behind / ahead heuristic
  const eid = hashStr(empId);
  const daysSinceHire = 45 + (eid % 30);
  const expectedPct = Math.min(100, Math.round((daysSinceHire / 90) * 100));
  const overallPct = Math.round(
    stageStats.reduce((s, st) => s + st.pct, 0) / stageStats.length
  );
  const trackStatus =
    overallPct >= expectedPct + 10
      ? { label: 'Ahead', cls: 'badge green' }
      : overallPct >= expectedPct - 10
      ? { label: 'On Track', cls: 'badge blue' }
      : { label: 'Behind', cls: 'badge red' };

  const daysToMilestone = Math.max(
    1,
    30 - daysSinceHire + (currentStageIdx * 60)
  );

  // Next 2 incomplete courses
  const nextCourses = useMemo(() => {
    const list = [];
    for (const stage of STAGES) {
      for (const course of stage.courses) {
        if (!completionMap[course.id]) list.push({ ...course, stageName: stage.name });
        if (list.length >= 2) return list;
      }
    }
    return list;
  }, [completionMap]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
      {/* Timeline */}
      <div
        style={{
          background: 'var(--t-surface)',
          border: '1px solid var(--t-line)',
          padding: '32px 24px 24px',
        }}
      >
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '.1em',
            color: 'var(--t-text-muted)',
            textTransform: 'uppercase',
            marginBottom: 32,
          }}
        >
          Training Journey
        </div>

        {/* Horizontal timeline */}
        <div style={{ position: 'relative', paddingBottom: 24 }}>
          {/* Connecting line */}
          <div
            style={{
              position: 'absolute',
              top: 26,
              left: 60,
              right: 60,
              height: 2,
              background: 'var(--t-line)',
              zIndex: 0,
            }}
          />

          {/* Stages row */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: `repeat(${STAGES.length}, 1fr)`,
              gap: 0,
              position: 'relative',
              zIndex: 1,
            }}
          >
            {stageStats.map((stage, i) => {
              const isCurrent = i === currentStageIdx;
              const isPast = i < currentStageIdx;
              const nodeColor = isPast
                ? 'var(--t-success)'
                : isCurrent
                ? stage.color
                : 'var(--t-surface-2)';
              const textColor = isPast
                ? 'var(--t-success)'
                : isCurrent
                ? stage.color
                : 'var(--t-text-faint)';
              const borderColor = isPast
                ? 'var(--t-success)'
                : isCurrent
                ? stage.color
                : 'var(--t-line)';

              return (
                <div
                  key={stage.num}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 12,
                  }}
                >
                  {/* Ring + node */}
                  <div style={{ position: 'relative', width: 52, height: 52 }}>
                    {/* Background circle */}
                    <div
                      style={{
                        position: 'absolute',
                        inset: 0,
                        borderRadius: '50%',
                        background: isCurrent || isPast ? 'var(--t-bg)' : 'var(--t-surface-2)',
                        border: `2px solid ${borderColor}`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        zIndex: 1,
                      }}
                    >
                      <span
                        style={{
                          fontSize: 18,
                          fontWeight: 900,
                          color: textColor,
                          lineHeight: 1,
                        }}
                      >
                        {isPast ? '✓' : stage.num}
                      </span>
                    </div>
                    {/* Progress ring overlaid */}
                    <div style={{ position: 'absolute', inset: 0, zIndex: 2 }}>
                      <ProgressRing
                        pct={stage.pct}
                        size={52}
                        stroke={3}
                        color={nodeColor}
                        bg="transparent"
                      />
                    </div>
                  </div>

                  {/* Labels below */}
                  <div style={{ textAlign: 'center' }}>
                    <div
                      style={{
                        fontSize: 12,
                        fontWeight: 700,
                        color: isCurrent ? stage.color : isPast ? 'var(--t-text)' : 'var(--t-text-faint)',
                        marginBottom: 2,
                      }}
                    >
                      {stage.name}
                    </div>
                    <div
                      style={{
                        fontSize: 10,
                        color: 'var(--t-text-muted)',
                        marginBottom: 4,
                      }}
                    >
                      {stage.range}
                    </div>
                    <div
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        color: textColor,
                      }}
                    >
                      {stage.pct}%
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Current stage detail */}
      <div
        style={{
          background: 'var(--t-surface)',
          border: `1px solid ${currentStage.color}40`,
          borderLeft: `3px solid ${currentStage.color}`,
          padding: 20,
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            marginBottom: 16,
          }}
        >
          <div>
            <div
              style={{
                fontSize: 14,
                fontWeight: 800,
                color: 'var(--t-text)',
                marginBottom: 2,
              }}
            >
              Stage {currentStage.num}: {currentStage.name}
            </div>
            <div style={{ fontSize: 12, color: 'var(--t-text-muted)' }}>
              {currentStage.done} of {currentStage.total} courses complete
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span className={trackStatus.cls}>{trackStatus.label}</span>
            <span
              style={{
                fontSize: 12,
                color: 'var(--t-text-faint)',
              }}
            >
              ~{daysToMilestone}d to next milestone
            </span>
          </div>
        </div>

        {/* Progress bar */}
        <div
          style={{
            background: 'var(--t-line)',
            height: 6,
            marginBottom: 16,
            borderRadius: 3,
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              height: '100%',
              width: `${currentStage.pct}%`,
              background: currentStage.color,
              borderRadius: 3,
              transition: 'width 0.6s ease',
            }}
          />
        </div>

        {/* Course checklist */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {currentStage.courses.map(course => {
            const done = completionMap[course.id];
            return (
              <div
                key={course.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '8px 12px',
                  background: done ? 'rgba(76,175,80,.07)' : 'var(--t-surface-2)',
                  border: `1px solid ${done ? 'rgba(76,175,80,.2)' : 'var(--t-line)'}`,
                }}
              >
                <span
                  style={{
                    fontSize: 16,
                    lineHeight: 1,
                    color: done ? 'var(--t-success)' : 'var(--t-line)',
                  }}
                >
                  {done ? '✓' : '○'}
                </span>
                <span
                  style={{
                    flex: 1,
                    fontSize: 13,
                    color: done ? 'var(--t-text)' : 'var(--t-text-muted)',
                    fontWeight: done ? 600 : 400,
                  }}
                >
                  {course.name}
                </span>
                <span
                  style={{
                    fontSize: 11,
                    color: 'var(--t-text-faint)',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {course.hours}h
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Next Up */}
      {nextCourses.length > 0 && (
        <div
          style={{
            background: 'var(--t-surface)',
            border: '1px solid var(--t-line)',
            padding: 20,
          }}
        >
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '.1em',
              color: 'var(--t-text-muted)',
              textTransform: 'uppercase',
              marginBottom: 14,
            }}
          >
            Next Up
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            {nextCourses.map((course, i) => (
              <div
                key={course.id}
                style={{
                  flex: 1,
                  background: 'var(--t-surface-2)',
                  border: '1px solid var(--t-line)',
                  padding: '14px 16px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10,
                }}
              >
                <div>
                  <div
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      color: 'var(--t-accent)',
                      textTransform: 'uppercase',
                      letterSpacing: '.06em',
                      marginBottom: 4,
                    }}
                  >
                    {course.stageName}
                  </div>
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 700,
                      color: 'var(--t-text)',
                      marginBottom: 2,
                    }}
                  >
                    {course.name}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--t-text-faint)' }}>
                    {course.hours} hours
                  </div>
                </div>
                <button
                  onClick={() => alert(`Starting: ${course.name}`)}
                  style={{
                    background: i === 0 ? 'var(--t-accent)' : 'var(--t-surface)',
                    border: `1px solid ${i === 0 ? 'transparent' : 'var(--t-line)'}`,
                    color: i === 0 ? '#000' : 'var(--t-text)',
                    padding: '7px 0',
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: 'pointer',
                    width: '100%',
                  }}
                >
                  {i === 0 ? 'Start Now →' : 'Queue Up'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB 2 — MY CERTIFICATES
// ─────────────────────────────────────────────────────────────────────────────
function CertificatesTab({ empId }) {
  const certs = useMemo(() => buildCerts(empId), [empId]);
  const [printMsg, setPrintMsg] = useState(null);

  function handlePrint(certName) {
    setPrintMsg(`Certificate "${certName}" sent to printer.`);
    setTimeout(() => setPrintMsg(null), 3000);
  }

  function certAlertInfo(cert) {
    if (!cert.expiryDate) return null;
    const d = daysFromNow(cert.expiryDate);
    if (d < 0) return { type: 'expired', label: `Expired ${Math.abs(d)}d ago`, color: 'var(--t-danger)', cls: 'badge red' };
    if (d <= 60) return { type: 'expiring', label: `Expires in ${d}d`, color: 'var(--t-warn)', cls: 'badge amber' };
    return { type: 'active', label: `Expires ${fmtDate(cert.expiryDate)}`, color: 'var(--t-text-faint)', cls: 'badge green' };
  }

  if (certs.length === 0) {
    return (
      <div
        style={{
          textAlign: 'center',
          padding: 60,
          color: 'var(--t-text-muted)',
          fontSize: 14,
        }}
      >
        No certificates earned yet. Complete courses to earn certificates.
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Toast */}
      {printMsg && (
        <div
          style={{
            background: 'var(--t-success)',
            color: '#000',
            padding: '10px 16px',
            fontSize: 13,
            fontWeight: 600,
            borderRadius: 2,
          }}
        >
          ✓ {printMsg}
        </div>
      )}

      {/* Summary row */}
      <div style={{ display: 'flex', gap: 8 }}>
        <div
          style={{
            background: 'var(--t-surface)',
            border: '1px solid var(--t-line)',
            padding: '10px 16px',
            fontSize: 12,
            color: 'var(--t-text-muted)',
          }}
        >
          <span style={{ fontWeight: 800, color: 'var(--t-text)', fontSize: 20 }}>{certs.length}</span>{' '}
          certificates earned
        </div>
        <div
          style={{
            background: 'var(--t-surface)',
            border: '1px solid var(--t-line)',
            padding: '10px 16px',
            fontSize: 12,
            color: 'var(--t-text-muted)',
          }}
        >
          <span
            style={{
              fontWeight: 800,
              color: 'var(--t-warn)',
              fontSize: 20,
            }}
          >
            {certs.filter(c => { const ai = certAlertInfo(c); return ai && ai.type === 'expiring'; }).length}
          </span>{' '}
          expiring soon
        </div>
        <div
          style={{
            background: 'var(--t-surface)',
            border: '1px solid var(--t-line)',
            padding: '10px 16px',
            fontSize: 12,
            color: 'var(--t-text-muted)',
          }}
        >
          <span
            style={{
              fontWeight: 800,
              color: 'var(--t-danger)',
              fontSize: 20,
            }}
          >
            {certs.filter(c => { const ai = certAlertInfo(c); return ai && ai.type === 'expired'; }).length}
          </span>{' '}
          expired
        </div>
      </div>

      {/* Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 16,
        }}
      >
        {certs.map(cert => {
          const alert = certAlertInfo(cert);
          const isExpired = alert && alert.type === 'expired';
          return (
            <div
              key={cert.id}
              style={{
                background: 'var(--t-surface)',
                border: `1px solid ${isExpired ? 'var(--t-danger)40' : 'var(--t-line)'}`,
                padding: '20px 18px',
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
                opacity: isExpired ? 0.75 : 1,
                position: 'relative',
                overflow: 'hidden',
              }}
            >
              {/* Top accent for expiring */}
              {alert && alert.type === 'expiring' && (
                <div
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    height: 2,
                    background: 'var(--t-warn)',
                  }}
                />
              )}
              {alert && alert.type === 'expired' && (
                <div
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    height: 2,
                    background: 'var(--t-danger)',
                  }}
                />
              )}

              {/* Icon + status */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                }}
              >
                <span style={{ fontSize: 28 }}>{cert.icon}</span>
                <span
                  className={
                    isExpired
                      ? 'badge red'
                      : alert && alert.type === 'expiring'
                      ? 'badge amber'
                      : 'badge green'
                  }
                >
                  {isExpired ? 'Expired' : 'Active'}
                </span>
              </div>

              {/* Name */}
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 800,
                  color: isExpired ? 'var(--t-text-muted)' : 'var(--t-text)',
                  lineHeight: 1.3,
                }}
              >
                {cert.name}
              </div>

              {/* Dates */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: 11,
                  }}
                >
                  <span style={{ color: 'var(--t-text-muted)' }}>Issued</span>
                  <span style={{ color: 'var(--t-text)', fontWeight: 600 }}>
                    {fmtDate(cert.issueDate)}
                  </span>
                </div>
                {alert && (
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      fontSize: 11,
                    }}
                  >
                    <span style={{ color: 'var(--t-text-muted)' }}>Expiry</span>
                    <span style={{ color: alert.color, fontWeight: 700 }}>
                      {alert.label}
                    </span>
                  </div>
                )}
                {!cert.expiresMonths && (
                  <div style={{ fontSize: 11, color: 'var(--t-text-faint)' }}>
                    No expiration
                  </div>
                )}
              </div>

              {/* Verification code */}
              <div
                style={{
                  background: 'var(--t-surface-2)',
                  border: '1px solid var(--t-line)',
                  padding: '6px 10px',
                  fontSize: 11,
                  fontFamily: 'monospace',
                  letterSpacing: '.05em',
                  color: 'var(--t-text-muted)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <span>{genVerificationCode(empId, cert.id)}</span>
                <span style={{ fontSize: 9, color: 'var(--t-text-faint)' }}>VERIFY</span>
              </div>

              {/* Print button */}
              <button
                onClick={() => handlePrint(cert.name)}
                style={{
                  background: 'var(--t-surface-2)',
                  border: '1px solid var(--t-line)',
                  color: 'var(--t-text)',
                  padding: '7px 0',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                  width: '100%',
                  marginTop: 2,
                }}
              >
                🖨 Download / Print
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB 3 — SKILLS PORTFOLIO
// ─────────────────────────────────────────────────────────────────────────────
function SkillsTab({ empId }) {
  const base = useMemo(() => buildSkillRatings(empId), [empId]);
  const [ratings, setRatings] = useState(base.ratings);
  const [sources, setSources] = useState(base.sources);
  const [expanded, setExpanded] = useState({ product: true });

  function handleRate(skillId, val) {
    setRatings(prev => ({ ...prev, [skillId]: val }));
    setSources(prev => ({ ...prev, [skillId]: 'Self-Assessment' }));
  }

  function toggleCat(id) {
    setExpanded(prev => ({ ...prev, [id]: !prev[id] }));
  }

  // Skills below required for Manager Track
  const gaps = useMemo(() => {
    const list = [];
    SKILL_CATEGORIES.forEach(cat => {
      cat.skills.forEach(skill => {
        const r = ratings[skill.id] || 0;
        if (r < skill.required) {
          list.push({ skill, cat, current: r, required: skill.required });
        }
      });
    });
    return list;
  }, [ratings]);

  // Mastered count
  const masteredCount = useMemo(() => {
    let count = 0;
    SKILL_CATEGORIES.forEach(cat =>
      cat.skills.forEach(skill => {
        if ((ratings[skill.id] || 0) >= 4) count++;
      })
    );
    return count;
  }, [ratings]);

  const totalSkills = SKILL_CATEGORIES.reduce((s, c) => s + c.skills.length, 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Summary strip */}
      <div style={{ display: 'flex', gap: 8 }}>
        <div
          style={{
            background: 'var(--t-surface)',
            border: '1px solid var(--t-line)',
            padding: '10px 20px',
          }}
        >
          <div
            style={{
              fontSize: 22,
              fontWeight: 800,
              color: 'var(--t-accent)',
            }}
          >
            {masteredCount}
          </div>
          <div style={{ fontSize: 11, color: 'var(--t-text-muted)' }}>
            Skills Mastered (≥ 4★)
          </div>
        </div>
        <div
          style={{
            background: 'var(--t-surface)',
            border: '1px solid var(--t-line)',
            padding: '10px 20px',
          }}
        >
          <div
            style={{
              fontSize: 22,
              fontWeight: 800,
              color: gaps.length > 0 ? 'var(--t-warn)' : 'var(--t-success)',
            }}
          >
            {gaps.length}
          </div>
          <div style={{ fontSize: 11, color: 'var(--t-text-muted)' }}>
            Gaps Below Required
          </div>
        </div>
        <div
          style={{
            background: 'var(--t-surface)',
            border: '1px solid var(--t-line)',
            padding: '10px 20px',
          }}
        >
          <div
            style={{
              fontSize: 22,
              fontWeight: 800,
              color: 'var(--t-text)',
            }}
          >
            {totalSkills}
          </div>
          <div style={{ fontSize: 11, color: 'var(--t-text-muted)' }}>
            Total Skills Tracked
          </div>
        </div>
      </div>

      {/* Category cards */}
      {SKILL_CATEGORIES.map(cat => {
        const isOpen = !!expanded[cat.id];
        const catAvg =
          Math.round(
            (cat.skills.reduce((s, sk) => s + (ratings[sk.id] || 0), 0) /
              cat.skills.length) *
              10
          ) / 10;
        const catGaps = cat.skills.filter(
          sk => (ratings[sk.id] || 0) < sk.required
        ).length;

        return (
          <div
            key={cat.id}
            style={{
              background: 'var(--t-surface)',
              border: `1px solid var(--t-line)`,
              borderLeft: `3px solid ${cat.color}`,
            }}
          >
            {/* Header */}
            <button
              onClick={() => toggleCat(cat.id)}
              style={{
                width: '100%',
                background: 'none',
                border: 'none',
                padding: '14px 16px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span
                  style={{
                    fontSize: 14,
                    fontWeight: 800,
                    color: 'var(--t-text)',
                  }}
                >
                  {cat.label}
                </span>
                {catGaps > 0 && (
                  <span className="badge amber">{catGaps} gap{catGaps > 1 ? 's' : ''}</span>
                )}
              </div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                }}
              >
                <span
                  style={{
                    fontSize: 13,
                    fontWeight: 700,
                    color: cat.color,
                  }}
                >
                  {catAvg}★ avg
                </span>
                <span
                  style={{
                    color: 'var(--t-text-muted)',
                    fontSize: 14,
                    transform: isOpen ? 'rotate(180deg)' : 'rotate(0)',
                    transition: 'transform 0.2s',
                    display: 'inline-block',
                  }}
                >
                  ▾
                </span>
              </div>
            </button>

            {/* Skills list */}
            {isOpen && (
              <div style={{ padding: '0 16px 16px' }}>
                {cat.skills.map(skill => {
                  const r = ratings[skill.id] || 0;
                  const src = sources[skill.id] || 'Training';
                  const gap = r < skill.required;
                  return (
                    <div
                      key={skill.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        padding: '10px 0',
                        borderTop: '1px solid var(--t-line)',
                      }}
                    >
                      {/* Skill name */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            fontSize: 13,
                            fontWeight: 600,
                            color: 'var(--t-text)',
                            marginBottom: 2,
                          }}
                        >
                          {skill.name}
                        </div>
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                          }}
                        >
                          <span
                            style={{
                              fontSize: 10,
                              color: 'var(--t-text-faint)',
                              background: 'var(--t-surface-2)',
                              border: '1px solid var(--t-line)',
                              padding: '1px 6px',
                            }}
                          >
                            {src}
                          </span>
                          {gap && (
                            <span
                              style={{
                                fontSize: 10,
                                color: 'var(--t-warn)',
                                fontWeight: 700,
                              }}
                            >
                              Needs {skill.required}★ for Manager Track
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Stars */}
                      <div style={{ flexShrink: 0 }}>
                        <StarRating
                          value={r}
                          onChange={val => handleRate(skill.id, val)}
                        />
                      </div>

                      {/* Current vs required */}
                      <div
                        style={{
                          width: 60,
                          textAlign: 'right',
                          flexShrink: 0,
                        }}
                      >
                        <span
                          style={{
                            fontSize: 11,
                            color: gap ? 'var(--t-warn)' : 'var(--t-success)',
                            fontWeight: 700,
                          }}
                        >
                          {r}/{skill.required}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      {/* Gap analysis */}
      <div
        style={{
          background: 'var(--t-surface)',
          border: gaps.length > 0 ? '1px solid var(--t-warn)30' : '1px solid var(--t-line)',
          padding: 20,
        }}
      >
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '.1em',
            color: gaps.length > 0 ? 'var(--t-warn)' : 'var(--t-text-muted)',
            textTransform: 'uppercase',
            marginBottom: 14,
          }}
        >
          Gap Analysis — Manager Track Readiness
        </div>

        {gaps.length === 0 ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              fontSize: 14,
              color: 'var(--t-success)',
              fontWeight: 700,
            }}
          >
            <span style={{ fontSize: 20 }}>✓</span>
            All skills meet Manager Track requirements
          </div>
        ) : (
          <>
            <div
              style={{
                fontSize: 13,
                color: 'var(--t-text-muted)',
                marginBottom: 12,
              }}
            >
              <span
                style={{ color: 'var(--t-warn)', fontWeight: 800 }}
              >
                {gaps.length} skill{gaps.length > 1 ? 's' : ''}
              </span>{' '}
              below required level for Manager Track
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {gaps.map(({ skill, cat, current, required }) => (
                <div
                  key={skill.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 12px',
                    background: 'var(--t-surface-2)',
                    border: '1px solid var(--t-line)',
                    fontSize: 12,
                  }}
                >
                  <div>
                    <span style={{ fontWeight: 700, color: 'var(--t-text)' }}>
                      {skill.name}
                    </span>
                    <span
                      style={{
                        color: 'var(--t-text-faint)',
                        marginLeft: 6,
                      }}
                    >
                      ({cat.label})
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <StarRating value={current} readonly />
                    <span
                      style={{
                        color: 'var(--t-warn)',
                        fontWeight: 700,
                        fontSize: 11,
                      }}
                    >
                      {current}/{required}★
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────
export default function TrainingTrack() {
  const { session } = useAuth();
  const { locationIds } = useScope();
  const sb = useSupabase();

  const person = session?.person || {};
  const empId = person.id || 'emp-001';
  const fullName = person.full_name || 'Team Member';
  const roleName = person.role_name || '';

  const isHR = useMemo(() => {
    const r = (roleName || '').toLowerCase();
    return ['ceo', 'hr', 'manager', 'coo', 'admin', 'owner'].some(x => r.includes(x));
  }, [roleName]);

  const [tab, setTab] = useState('My Learning Path');
  const [loading, setLoading] = useState(true);

  // Derived stats for KPIs
  const completionMap = useMemo(() => buildCompletionMap(empId), [empId]);
  const certs = useMemo(() => buildCerts(empId), [empId]);
  const { ratings } = useMemo(() => buildSkillRatings(empId), [empId]);

  const allCourses = useMemo(() => STAGES.flatMap(s => s.courses), []);
  const completedCourses = useMemo(
    () => allCourses.filter(c => completionMap[c.id]),
    [allCourses, completionMap]
  );
  const totalHours = useMemo(
    () => completedCourses.reduce((s, c) => s + c.hours, 0),
    [completedCourses]
  );
  const overallPct = useMemo(
    () => Math.round((completedCourses.length / allCourses.length) * 100),
    [completedCourses, allCourses]
  );
  const masteredCount = useMemo(() => {
    let count = 0;
    SKILL_CATEGORIES.forEach(cat =>
      cat.skills.forEach(sk => {
        if ((ratings[sk.id] || 0) >= 4) count++;
      })
    );
    return count;
  }, [ratings]);

  // Next milestone estimate
  const stageStats = useMemo(() =>
    STAGES.map(stage => {
      const done = stage.courses.filter(c => completionMap[c.id]).length;
      const pct = Math.round((done / stage.courses.length) * 100);
      return { ...stage, done, pct };
    }),
  [completionMap]);
  const currentStageIdx = useMemo(() => {
    const f = stageStats.findIndex(s => s.pct < 100);
    return f === -1 ? stageStats.length - 1 : f;
  }, [stageStats]);
  const eid = hashStr(empId);
  const daysSinceHire = 45 + (eid % 30);
  const daysToMilestone = Math.max(
    1,
    30 - (daysSinceHire % 30) + currentStageIdx * 10
  );

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        await sb.rpc('get_my_training', { p_emp_id: empId });
      } catch (_) {
        // use mock data
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [empId]);

  if (loading) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 80,
          color: 'var(--t-text-muted)',
          fontSize: 14,
        }}
      >
        Loading your training data…
      </div>
    );
  }

  return (
    <div style={{ padding: 24, maxWidth: 1100 }}>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          marginBottom: 24,
        }}
      >
        <div>
          <div
            style={{
              fontSize: 22,
              fontWeight: 900,
              color: 'var(--t-text)',
              letterSpacing: -0.5,
              marginBottom: 4,
            }}
          >
            My Training Journey
          </div>
          <div style={{ fontSize: 13, color: 'var(--t-text-muted)' }}>
            {fullName} · {roleName}
          </div>
        </div>
        {isHR && (
          <span className="badge blue" style={{ fontSize: 11 }}>
            HR View: Your Own Record
          </span>
        )}
      </div>

      {/* KPI strip */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 28 }}>
        <KTile
          label="Training Path Progress"
          value={`${overallPct}%`}
          sub={`${completedCourses.length} of ${allCourses.length} courses`}
          color={
            overallPct >= 80
              ? 'var(--t-success)'
              : overallPct >= 50
              ? 'var(--t-warn)'
              : 'var(--t-danger)'
          }
          alert={overallPct < 50 ? 'amber' : null}
        />
        <KTile
          label="Certificates Earned"
          value={certs.length}
          sub="across all modules"
          color="var(--t-accent)"
        />
        <KTile
          label="Skills Mastered"
          value={masteredCount}
          sub="rated 4 stars or above"
          color="var(--t-success)"
        />
        <KTile
          label="Courses Completed"
          value={completedCourses.length}
          sub={`${allCourses.length - completedCourses.length} remaining`}
          color="var(--t-text)"
        />
        <KTile
          label="Training Hours"
          value={`${totalHours}h`}
          sub="total logged"
          color="var(--t-text-muted)"
        />
        <KTile
          label="Next Milestone"
          value={`${daysToMilestone}d`}
          sub="estimated"
          alert={daysToMilestone <= 7 ? 'amber' : null}
          color={daysToMilestone <= 7 ? 'var(--t-warn)' : 'var(--t-text)'}
        />
      </div>

      {/* Tabs */}
      <TabBar
        tabs={['My Learning Path', 'My Certificates', 'Skills Portfolio']}
        active={tab}
        onChange={setTab}
      />

      {/* Tab content */}
      {tab === 'My Learning Path' && <LearningPathTab empId={empId} />}
      {tab === 'My Certificates' && <CertificatesTab empId={empId} />}
      {tab === 'Skills Portfolio' && <SkillsTab empId={empId} />}
    </div>
  );
}
