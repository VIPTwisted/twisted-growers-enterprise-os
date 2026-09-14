import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useFeatureFlag } from '../lib/featureFlags.js'
import { pushNotification } from '../lib/platform.js'
import { sb } from '../lib/supabase'
import { useAuth } from '../lib/auth.jsx'
import { useScope } from '../lib/scope.jsx'
import DrillDown from '../components/DrillDown.jsx'

// All data on this screen is live from the HR brain (project fxetuqjryttnypgepsru, schema hr):
//   lms_courses_list  → catalog (nested sections/lessons) + all enrollments
//   get_roster        → the real employee roster (scoped by location)
//   get_training_overview → certification expiry rows (Expiry Tracker)
// Writes: lms_course_upsert / lms_course_delete / lms_enroll / lms_bulk_enroll /
//   lms_unenroll / lms_mark_complete / lms_set_due. No seeds, no localStorage
//   datastore, no fabricated employees or scores — empty means honest zero.

// ── Course draft → RPC section payload ────────────────────────────────────────
function sectionsPayload(course) {
  return (course.sections || []).map((s, si) => ({
    title: s.title,
    position: si + 1,
    lessons: (s.lessons || []).map((l, li) => ({ title: l.title, kind: l.type, position: li + 1 })),
  }))
}

// ── KPI Tile ──────────────────────────────────────────────────────────────────
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
      cursor: onClick ? 'pointer' : undefined,
    }}>
      {alert === 'red' && <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'var(--t-danger)' }} />}
      {alert === 'amber' && <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'var(--t-warn)' }} />}
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.08em', color: 'var(--t-text-muted)', textTransform: 'uppercase', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800, color: color || 'var(--t-text)', lineHeight: 1, marginBottom: 4 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--t-text-faint)' }}>{sub}</div>}
    </div>
  );
}

// ── Shared input style ────────────────────────────────────────────────────────
const inputStyle = {
  padding: '7px 10px',
  background: 'var(--t-bg)',
  border: '1px solid var(--t-line)',
  color: 'var(--t-text)',
  fontSize: 13,
  fontFamily: 'inherit',
  width: '100%',
  boxSizing: 'border-box',
  outline: 'none',
};

const selectStyle = {
  ...inputStyle,
  cursor: 'pointer',
};

const btnBase = {
  padding: '6px 14px',
  fontSize: 12,
  fontWeight: 700,
  fontFamily: 'inherit',
  cursor: 'pointer',
  border: 'none',
  letterSpacing: '0.04em',
};

const btnAccent = { ...btnBase, background: 'var(--t-accent)', color: '#000' };
const btnSurface = { ...btnBase, background: 'var(--t-surface-2)', border: '1px solid var(--t-line)', color: 'var(--t-text-muted)' };
const btnDanger = { ...btnBase, background: 'rgba(255,59,48,0.15)', border: '1px solid var(--t-danger)', color: 'var(--t-danger)' };

// ── Tab Bar ───────────────────────────────────────────────────────────────────
function TabBar({ tabs, active, onChange }) {
  return (
    <div style={{ display: 'flex', borderBottom: '1px solid var(--t-line)', marginBottom: 24 }}>
      {tabs.map(t => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          style={{
            padding: '10px 18px',
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: '0.07em',
            textTransform: 'uppercase',
            fontFamily: 'inherit',
            cursor: 'pointer',
            border: 'none',
            borderBottom: active === t.id ? '2px solid var(--t-accent)' : '2px solid transparent',
            background: 'transparent',
            color: active === t.id ? 'var(--t-accent)' : 'var(--t-text-muted)',
            marginBottom: -1,
          }}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB 1: COURSE BUILDER
// ══════════════════════════════════════════════════════════════════════════════
function CourseBuilder({ courses, setCourses, onCreate, onDelete, onSave, busy }) {
  const [selectedId, setSelectedId] = useState(null);
  const [preview, setPreview] = useState(false);
  const [dirty, setDirty] = useState(false);

  const selected = courses.find(c => c.id === selectedId) || null;

  async function addCourse() {
    const newId = await onCreate();
    if (newId) { setSelectedId(newId); setPreview(false); setDirty(false); }
  }

  function updateCourse(field, value) {
    setCourses(prev => prev.map(c => c.id === selectedId ? { ...c, [field]: value } : c));
    setDirty(true);
  }

  async function deleteCourse(id) {
    await onDelete(id);
    if (selectedId === id) setSelectedId(null);
  }

  async function saveCourse() {
    if (!selected) return;
    const ok = await onSave(selected);
    if (ok) setDirty(false);
  }

  function addSection() {
    setDirty(true);
    const sId = 'sec-' + Date.now();
    setCourses(prev => prev.map(c => {
      if (c.id !== selectedId) return c;
      return {
        ...c,
        sections: [...c.sections, {
          id: sId,
          title: 'New Section',
          order: c.sections.length + 1,
          lessons: [],
        }],
      };
    }));
  }

  function updateSection(sId, field, value) {
    setDirty(true);
    setCourses(prev => prev.map(c => {
      if (c.id !== selectedId) return c;
      return { ...c, sections: c.sections.map(s => s.id === sId ? { ...s, [field]: value } : s) };
    }));
  }

  function deleteSection(sId) {
    setDirty(true);
    setCourses(prev => prev.map(c => {
      if (c.id !== selectedId) return c;
      return { ...c, sections: c.sections.filter(s => s.id !== sId) };
    }));
  }

  function moveSectionUp(sId) {
    setDirty(true);
    setCourses(prev => prev.map(c => {
      if (c.id !== selectedId) return c;
      const idx = c.sections.findIndex(s => s.id === sId);
      if (idx === 0) return c;
      const secs = [...c.sections];
      [secs[idx - 1], secs[idx]] = [secs[idx], secs[idx - 1]];
      return { ...c, sections: secs.map((s, i) => ({ ...s, order: i + 1 })) };
    }));
  }

  function moveSectionDown(sId) {
    setDirty(true);
    setCourses(prev => prev.map(c => {
      if (c.id !== selectedId) return c;
      const idx = c.sections.findIndex(s => s.id === sId);
      if (idx === c.sections.length - 1) return c;
      const secs = [...c.sections];
      [secs[idx], secs[idx + 1]] = [secs[idx + 1], secs[idx]];
      return { ...c, sections: secs.map((s, i) => ({ ...s, order: i + 1 })) };
    }));
  }

  function addLesson(sId) {
    setDirty(true);
    const lId = 'les-' + Date.now();
    setCourses(prev => prev.map(c => {
      if (c.id !== selectedId) return c;
      return {
        ...c,
        sections: c.sections.map(s => {
          if (s.id !== sId) return s;
          return { ...s, lessons: [...s.lessons, { id: lId, title: 'New Lesson', type: 'Text' }] };
        }),
      };
    }));
  }

  function updateLesson(sId, lId, field, value) {
    setDirty(true);
    setCourses(prev => prev.map(c => {
      if (c.id !== selectedId) return c;
      return {
        ...c,
        sections: c.sections.map(s => {
          if (s.id !== sId) return s;
          return { ...s, lessons: s.lessons.map(l => l.id === lId ? { ...l, [field]: value } : l) };
        }),
      };
    }));
  }

  function deleteLesson(sId, lId) {
    setDirty(true);
    setCourses(prev => prev.map(c => {
      if (c.id !== selectedId) return c;
      return {
        ...c,
        sections: c.sections.map(s => {
          if (s.id !== sId) return s;
          return { ...s, lessons: s.lessons.filter(l => l.id !== lId) };
        }),
      };
    }));
  }

  const typeIcon = { Text: '📄', Video: '🎬', Quiz: '📝' };
  const totalLessons = selected ? selected.sections.reduce((a, s) => a + s.lessons.length, 0) : 0;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 16, height: '100%' }}>
      {/* Left: course list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
        <button onClick={addCourse} style={{ ...btnAccent, marginBottom: 12, width: '100%', padding: '9px 0', fontSize: 12 }}>
          + New Course
        </button>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, overflowY: 'auto', maxHeight: 560 }}>
          {courses.map(c => (
            <div
              key={c.id}
              onClick={() => { setSelectedId(c.id); setPreview(false); }}
              style={{
                padding: '10px 12px',
                cursor: 'pointer',
                background: selectedId === c.id ? 'rgba(0,229,255,0.08)' : 'var(--t-surface)',
                border: `1px solid ${selectedId === c.id ? 'var(--t-accent)' : 'var(--t-line)'}`,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--t-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {c.title}
                </div>
                <div style={{ fontSize: 10, color: 'var(--t-text-faint)', marginTop: 2 }}>
                  {c.category} · {c.sections.length} sections
                </div>
                {c.required && (
                  <span style={{ fontSize: 9, fontWeight: 800, color: 'var(--t-danger)', letterSpacing: '0.06em' }}>REQUIRED</span>
                )}
              </div>
              <button
                onClick={e => { e.stopPropagation(); deleteCourse(c.id); }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--t-text-faint)', fontSize: 14, padding: '0 0 0 6px', lineHeight: 1, flexShrink: 0 }}
              >×</button>
            </div>
          ))}
        </div>
      </div>

      {/* Right: course editor or empty state */}
      {!selected ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--t-surface)', border: '1px solid var(--t-line)', flexDirection: 'column', gap: 12, color: 'var(--t-text-muted)' }}>
          <div style={{ fontSize: 32 }}>📚</div>
          <div style={{ fontSize: 14, fontWeight: 600 }}>Select a course to edit</div>
          <div style={{ fontSize: 12, color: 'var(--t-text-faint)' }}>or create a new one</div>
        </div>
      ) : preview ? (
        /* Preview mode */
        <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', padding: 24, overflowY: 'auto', maxHeight: 620 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <div>
              <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--t-text)' }}>{selected.title}</div>
              <div style={{ fontSize: 12, color: 'var(--t-text-faint)', marginTop: 4 }}>
                {selected.category} · {selected.level} · {selected.durationHours}h · {totalLessons} lessons
                {selected.required && <span style={{ marginLeft: 8, color: 'var(--t-danger)', fontWeight: 700 }}>REQUIRED</span>}
              </div>
            </div>
            <button onClick={() => setPreview(false)} style={btnSurface}>Edit Mode</button>
          </div>
          {selected.description && (
            <div style={{ fontSize: 13, color: 'var(--t-text-muted)', marginBottom: 20, lineHeight: 1.6 }}>{selected.description}</div>
          )}
          {selected.sections.map((sec, si) => (
            <div key={sec.id} style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--t-accent)', marginBottom: 8 }}>
                Section {si + 1}: {sec.title}
              </div>
              {sec.lessons.map((les, li) => (
                <div key={les.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: 'var(--t-bg)', border: '1px solid var(--t-line)', marginBottom: 4 }}>
                  <span style={{ fontSize: 14 }}>{typeIcon[les.type]}</span>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--t-text)' }}>{les.title}</div>
                    <div style={{ fontSize: 10, color: 'var(--t-text-faint)' }}>{les.type}</div>
                  </div>
                </div>
              ))}
              {sec.lessons.length === 0 && (
                <div style={{ fontSize: 12, color: 'var(--t-text-faint)', fontStyle: 'italic', padding: '6px 12px' }}>No lessons in this section</div>
              )}
            </div>
          ))}
          {selected.sections.length === 0 && (
            <div style={{ fontSize: 13, color: 'var(--t-text-faint)', fontStyle: 'italic' }}>No sections added yet.</div>
          )}
        </div>
      ) : (
        /* Edit mode */
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0, overflowY: 'auto', maxHeight: 660 }}>
          {/* Header form */}
          <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', padding: 20, marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--t-accent)' }}>
                Course Settings{dirty && <span style={{ marginLeft: 8, color: 'var(--t-warn)' }}>• unsaved</span>}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setPreview(true)} style={btnSurface}>Preview</button>
                <button onClick={saveCourse} disabled={busy} style={{ ...btnAccent, opacity: busy ? 0.6 : 1 }}>
                  {busy ? 'Saving…' : 'Save Course'}
                </button>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div style={{ gridColumn: '1 / -1' }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--t-text-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Course Title</div>
                <input
                  value={selected.title}
                  onChange={e => updateCourse('title', e.target.value)}
                  style={inputStyle}
                />
              </div>
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--t-text-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Category</div>
                <select value={selected.category} onChange={e => updateCourse('category', e.target.value)} style={selectStyle}>
                  {['Compliance', 'Product', 'Sales', 'Safety', 'Leadership'].map(o => <option key={o}>{o}</option>)}
                </select>
              </div>
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--t-text-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Level</div>
                <select value={selected.level} onChange={e => updateCourse('level', e.target.value)} style={selectStyle}>
                  {['Beginner', 'Intermediate', 'Advanced'].map(o => <option key={o}>{o}</option>)}
                </select>
              </div>
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--t-text-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Duration (hours)</div>
                <input
                  type="number"
                  min={0.5}
                  max={40}
                  step={0.5}
                  value={selected.durationHours}
                  onChange={e => updateCourse('durationHours', parseFloat(e.target.value) || 1)}
                  style={inputStyle}
                />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <input
                  type="checkbox"
                  id="required-toggle"
                  checked={selected.required}
                  onChange={e => updateCourse('required', e.target.checked)}
                  style={{ width: 16, height: 16, cursor: 'pointer' }}
                />
                <label htmlFor="required-toggle" style={{ fontSize: 13, color: 'var(--t-text)', cursor: 'pointer', fontWeight: 600 }}>
                  Mark as Required
                </label>
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--t-text-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Description</div>
                <textarea
                  value={selected.description}
                  onChange={e => updateCourse('description', e.target.value)}
                  rows={2}
                  style={{ ...inputStyle, resize: 'vertical' }}
                />
              </div>
            </div>
          </div>

          {/* Sections */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {selected.sections.map((sec, si) => (
              <div key={sec.id} style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', padding: 16 }}>
                {/* Section header */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--t-text-muted)', minWidth: 24 }}>§{si + 1}</div>
                  <input
                    value={sec.title}
                    onChange={e => updateSection(sec.id, 'title', e.target.value)}
                    style={{ ...inputStyle, flex: 1, fontWeight: 700 }}
                    placeholder="Section title…"
                  />
                  <button
                    onClick={() => moveSectionUp(sec.id)}
                    disabled={si === 0}
                    title="Move up"
                    style={{ ...btnSurface, padding: '5px 8px', opacity: si === 0 ? 0.3 : 1 }}
                  >↑</button>
                  <button
                    onClick={() => moveSectionDown(sec.id)}
                    disabled={si === selected.sections.length - 1}
                    title="Move down"
                    style={{ ...btnSurface, padding: '5px 8px', opacity: si === selected.sections.length - 1 ? 0.3 : 1 }}
                  >↓</button>
                  <button onClick={() => deleteSection(sec.id)} style={{ ...btnDanger, padding: '5px 8px' }}>✕</button>
                </div>

                {/* Lessons */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingLeft: 16 }}>
                  {sec.lessons.map((les, li) => (
                    <div key={les.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 10, color: 'var(--t-text-faint)', minWidth: 20 }}>{li + 1}.</span>
                      <input
                        value={les.title}
                        onChange={e => updateLesson(sec.id, les.id, 'title', e.target.value)}
                        style={{ ...inputStyle, flex: 1, fontSize: 12 }}
                        placeholder="Lesson title…"
                      />
                      <select
                        value={les.type}
                        onChange={e => updateLesson(sec.id, les.id, 'type', e.target.value)}
                        style={{ ...selectStyle, width: 90, fontSize: 12, padding: '7px 6px' }}
                      >
                        <option>Text</option>
                        <option>Video</option>
                        <option>Quiz</option>
                      </select>
                      <span style={{ fontSize: 14 }}>{typeIcon[les.type]}</span>
                      <button onClick={() => deleteLesson(sec.id, les.id)} style={{ ...btnDanger, padding: '4px 8px', fontSize: 11 }}>✕</button>
                    </div>
                  ))}
                  <button onClick={() => addLesson(sec.id)} style={{ ...btnSurface, alignSelf: 'flex-start', marginTop: 4, fontSize: 11 }}>
                    + Add Lesson
                  </button>
                </div>
              </div>
            ))}

            <button onClick={addSection} style={{ ...btnSurface, alignSelf: 'flex-start', marginTop: 4 }}>
              + Add Section
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB 2: ENROLLMENT MANAGER
// ══════════════════════════════════════════════════════════════════════════════
function EnrollmentManager({ courses, enrollments, employees, locations, reload }) {
  const [selectedCourseId, setSelectedCourseId] = useState(courses[0]?.id || '');
  const roles = useMemo(() => [...new Set(employees.map(e => e.role).filter(Boolean))], [employees]);
  const [bulkRole, setBulkRole] = useState('');
  const [bulkLoc, setBulkLoc] = useState('');
  const [busy, setBusy] = useState(false);

  // Keep the selected course valid as the live catalog loads / changes.
  useEffect(() => {
    if (!courses.find(c => c.id === selectedCourseId)) setSelectedCourseId(courses[0]?.id || '');
  }, [courses, selectedCourseId]);
  useEffect(() => { if (!bulkRole && roles.length) setBulkRole(roles[0]); }, [roles, bulkRole]);
  useEffect(() => { if (!bulkLoc && locations.length) setBulkLoc(locations[0]); }, [locations, bulkLoc]);

  const course = courses.find(c => c.id === selectedCourseId);
  const courseEnroll = enrollments[selectedCourseId] || {};
  const enrolledEmps = employees.filter(e => courseEnroll[e.id]?.enrolled);
  const notEnrolledEmps = employees.filter(e => !courseEnroll[e.id]?.enrolled);
  const enrolledCount = enrolledEmps.length;

  const dueIn30 = () => { const d = new Date(); d.setDate(d.getDate() + 30); return d.toISOString().split('T')[0]; };

  async function enroll(empId) {
    if (!course) return;
    const emp = employees.find(e => e.id === empId);
    if (!emp) return;
    setBusy(true);
    const due = dueIn30();
    const { data, error } = await sb.rpc('lms_enroll', {
      p_course_id: selectedCourseId, p_person_id: empId, p_person_name: emp.name,
      p_node_id: emp.node_id ?? null, p_due_date: due,
    });
    setBusy(false);
    if (error || (data && data.ok === false)) return;
    pushNotification({
      title: 'Training Assigned',
      message: `You have been enrolled in "${course.title}". Please complete by ${new Date(due).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}.`,
      type: 'info', category: 'training', targetPersonIds: [empId],
    });
    await reload();
  }

  async function markComplete(empId) {
    if (!course) return;
    const emp = employees.find(e => e.id === empId);
    setBusy(true);
    const { data, error } = await sb.rpc('lms_mark_complete', {
      p_course_id: selectedCourseId, p_person_id: empId, p_score: null,
      p_person_name: emp?.name ?? '', p_node_id: emp?.node_id ?? null,
    });
    setBusy(false);
    if (error || (data && data.ok === false)) return;
    pushNotification({
      title: 'Training Completed',
      message: `"${course.title}" marked complete.`,
      type: 'success', category: 'training', targetPersonIds: [empId],
    });
    await reload();
  }

  async function unenroll(empId) {
    setBusy(true);
    const { error } = await sb.rpc('lms_unenroll', { p_course_id: selectedCourseId, p_person_id: empId });
    setBusy(false);
    if (!error) await reload();
  }

  async function setDue(empId, date) {
    const { error } = await sb.rpc('lms_set_due', { p_course_id: selectedCourseId, p_person_id: empId, p_due_date: date || null });
    if (!error) await reload();
  }

  async function bulkEnroll(persons) {
    if (!course || !persons.length) return;
    setBusy(true);
    const { data, error } = await sb.rpc('lms_bulk_enroll', {
      p_course_id: selectedCourseId,
      p_persons: persons.map(e => ({ person_id: e.id, person_name: e.name, node_id: e.node_id ?? null })),
      p_due_date: dueIn30(),
    });
    setBusy(false);
    if (error || (data && data.ok === false)) return;
    await reload();
  }

  const enrollByRole = (role) => bulkEnroll(employees.filter(e => e.role === role && !courseEnroll[e.id]?.enrolled));
  const enrollByLocation = (loc) => bulkEnroll(employees.filter(e => e.location === loc && !courseEnroll[e.id]?.enrolled));

  function pctColor(pct, completed) {
    if (completed || pct === 100) return 'var(--t-success)';
    if (pct > 0) return 'var(--t-accent)';
    return 'var(--t-text-faint)';
  }

  const colHeader = {
    fontSize: 10,
    fontWeight: 800,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: 'var(--t-text-muted)',
    marginBottom: 10,
    paddingBottom: 8,
    borderBottom: '1px solid var(--t-line)',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Course selector + bulk controls */}
      <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', padding: 16, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div style={{ flex: 2, minWidth: 200 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--t-text-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Course</div>
          <select value={selectedCourseId} onChange={e => setSelectedCourseId(e.target.value)} style={selectStyle}>
            {courses.map(c => (
              <option key={c.id} value={c.id}>{c.title}</option>
            ))}
          </select>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', background: 'rgba(0,229,255,0.08)', border: '1px solid var(--t-accent)', fontSize: 13, fontWeight: 700, color: 'var(--t-accent)' }}>
          {enrolledCount} enrolled
        </div>
        <div style={{ flex: 1, minWidth: 140 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--t-text-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Enroll All by Role</div>
          <div style={{ display: 'flex', gap: 6 }}>
            <select value={bulkRole} onChange={e => setBulkRole(e.target.value)} style={{ ...selectStyle, flex: 1 }}>
              {roles.map(r => <option key={r}>{r}</option>)}
            </select>
            <button onClick={() => enrollByRole(bulkRole)} style={{ ...btnAccent, whiteSpace: 'nowrap' }}>Enroll</button>
          </div>
        </div>
        <div style={{ flex: 1, minWidth: 140 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--t-text-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Enroll All by Location</div>
          <div style={{ display: 'flex', gap: 6 }}>
            <select value={bulkLoc} onChange={e => setBulkLoc(e.target.value)} style={{ ...selectStyle, flex: 1 }}>
              {locations.map(l => <option key={l}>{l}</option>)}
            </select>
            <button onClick={() => enrollByLocation(bulkLoc)} style={{ ...btnAccent, whiteSpace: 'nowrap' }}>Enroll</button>
          </div>
        </div>
      </div>

      {/* Two-column layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {/* Enrolled */}
        <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', padding: 16 }}>
          <div style={colHeader}>Enrolled ({enrolledEmps.length})</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 460, overflowY: 'auto' }}>
            {enrolledEmps.length === 0 && (
              <div style={{ fontSize: 13, color: 'var(--t-text-faint)', fontStyle: 'italic', padding: '12px 0' }}>No enrolled employees</div>
            )}
            {enrolledEmps.map(emp => {
              const info = courseEnroll[emp.id];
              const isComplete = info?.completed || info?.pct === 100;
              return (
                <div key={emp.id} style={{ padding: '10px 12px', background: 'var(--t-bg)', border: '1px solid var(--t-line)', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--t-text)' }}>{emp.name}</div>
                      <div style={{ fontSize: 10, color: 'var(--t-text-faint)' }}>{emp.role} · {emp.location}</div>
                    </div>
                    {isComplete && <span style={{ fontSize: 16 }} title="Completed">✅</span>}
                    <button onClick={() => unenroll(emp.id)} style={{ ...btnDanger, fontSize: 10, padding: '3px 8px' }}>Remove</button>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ height: 4, background: 'var(--t-line)' }}>
                        <div style={{ height: '100%', width: `${info?.pct || 0}%`, background: pctColor(info?.pct || 0, isComplete) }} />
                      </div>
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 700, color: pctColor(info?.pct || 0, isComplete), minWidth: 30 }}>{info?.pct || 0}%</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 10, color: 'var(--t-text-muted)' }}>Due:</span>
                    <input
                      type="date"
                      value={info?.dueDate || ''}
                      onChange={e => setDue(emp.id, e.target.value)}
                      style={{ ...inputStyle, width: 'auto', flex: 1, fontSize: 11, padding: '3px 6px' }}
                    />
                  </div>
                  {!isComplete && (
                    <button onClick={() => markComplete(emp.id)} style={{ ...btnAccent, fontSize: 10, padding: '3px 10px', alignSelf: 'flex-start' }}>
                      Mark Complete
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Not enrolled */}
        <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', padding: 16 }}>
          <div style={colHeader}>Not Enrolled ({notEnrolledEmps.length})</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 460, overflowY: 'auto' }}>
            {notEnrolledEmps.length === 0 && (
              <div style={{ fontSize: 13, color: employees.length ? 'var(--t-success)' : 'var(--t-text-faint)', fontWeight: 600, padding: '12px 0' }}>
                {employees.length ? 'All employees enrolled' : 'No employees in scope'}
              </div>
            )}
            {notEnrolledEmps.map(emp => (
              <div key={emp.id} style={{ padding: '10px 12px', background: 'var(--t-bg)', border: '1px solid var(--t-line)', display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--t-text)' }}>{emp.name}</div>
                  <div style={{ fontSize: 10, color: 'var(--t-text-faint)' }}>{emp.role} · {emp.location}</div>
                </div>
                <button onClick={() => enroll(emp.id)} style={{ ...btnAccent, fontSize: 11, padding: '4px 12px' }}>Enroll</button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB 3: COMPLIANCE MATRIX
// ══════════════════════════════════════════════════════════════════════════════
function ComplianceMatrix({ courses, enrollments, employees, locations }) {
  const [courseFilter, setCourseFilter] = useState('');
  const [locFilter, setLocFilter] = useState('All');

  const requiredCourses = useMemo(() => courses.filter(c => c.required), [courses]);

  const filteredCourses = useMemo(() => {
    let list = requiredCourses;
    if (courseFilter.trim()) {
      const q = courseFilter.toLowerCase();
      list = list.filter(c => c.title.toLowerCase().includes(q));
    }
    return list;
  }, [requiredCourses, courseFilter]);

  const filteredEmps = useMemo(() => {
    if (locFilter === 'All') return employees;
    return employees.filter(e => e.location === locFilter);
  }, [locFilter, employees]);

  // Non-compliance count per employee (number of required courses not completed)
  const nonComplianceCount = useMemo(() => {
    return filteredEmps.map(emp => {
      const count = filteredCourses.filter(c => {
        const info = enrollments[c.id]?.[emp.id];
        return !info?.enrolled || (!info?.completed && (info?.pct || 0) < 100);
      }).length;
      return { empId: emp.id, count };
    });
  }, [filteredEmps, filteredCourses, enrollments]);

  function cellStatus(courseId, empId) {
    const info = enrollments[courseId]?.[empId];
    if (!info?.enrolled) return 'none';
    if (info.completed || info.pct === 100) return 'done';
    return 'progress';
  }

  const cellContent = {
    done: { icon: '✓', bg: 'rgba(0,229,147,0.12)', color: 'var(--t-success)' },
    progress: { icon: '⏱', bg: 'rgba(255,159,10,0.1)', color: 'var(--t-warn)' },
    none: { icon: '✕', bg: 'rgba(255,59,48,0.1)', color: 'var(--t-danger)' },
  };

  function handleExport() {
    // Export exactly what the on-screen matrix shows (respects active filters).
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const statusLabel = { done: 'Complete', progress: 'In Progress', none: 'Not Enrolled' };
    const header = ['Required Course', 'Category', ...filteredEmps.map(e => `${e.name} (${e.location})`)];
    const lines = [header.map(esc).join(',')];
    filteredCourses.forEach(course => {
      const row = [course.title, course.category, ...filteredEmps.map(emp => statusLabel[cellStatus(course.id, emp.id)])];
      lines.push(row.map(esc).join(','));
    });
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `compliance-matrix-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Filters + export */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          value={courseFilter}
          onChange={e => setCourseFilter(e.target.value)}
          placeholder="Filter required courses…"
          style={{ ...inputStyle, width: 220, flex: 'none' }}
        />
        <select value={locFilter} onChange={e => setLocFilter(e.target.value)} style={{ ...selectStyle, width: 160, flex: 'none' }}>
          <option value="All">All Locations</option>
          {locations.map(l => <option key={l}>{l}</option>)}
        </select>
        <div style={{ flex: 1 }} />
        <button onClick={handleExport} style={{ ...btnAccent, padding: '7px 16px' }}>Export CSV</button>
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', gap: 16, fontSize: 11 }}>
        {Object.entries(cellContent).map(([k, v]) => (
          <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ color: v.color, fontWeight: 700 }}>{v.icon}</span>
            <span style={{ color: 'var(--t-text-faint)' }}>{k === 'done' ? 'Completed' : k === 'progress' ? 'Enrolled / In Progress' : 'Not Enrolled'}</span>
          </div>
        ))}
      </div>

      {/* Matrix table with sticky first column */}
      {filteredCourses.length === 0 ? (
        <div style={{ padding: 24, color: 'var(--t-text-faint)', textAlign: 'center', background: 'var(--t-surface)', border: '1px solid var(--t-line)' }}>
          No required courses match filter
        </div>
      ) : (
        <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: 520, border: '1px solid var(--t-line)' }}>
          <table style={{ borderCollapse: 'collapse', tableLayout: 'fixed', minWidth: 900 }}>
            <thead>
              <tr style={{ background: 'var(--t-surface)' }}>
                {/* Sticky corner */}
                <th style={{
                  position: 'sticky',
                  left: 0,
                  zIndex: 10,
                  background: 'var(--t-surface)',
                  width: 220,
                  minWidth: 220,
                  padding: '10px 14px',
                  textAlign: 'left',
                  fontSize: 10,
                  fontWeight: 800,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  color: 'var(--t-text-muted)',
                  borderRight: '2px solid var(--t-line)',
                  borderBottom: '1px solid var(--t-line)',
                }}>
                  Required Course
                </th>
                {filteredEmps.map(emp => {
                  const nc = nonComplianceCount.find(x => x.empId === emp.id)?.count || 0;
                  return (
                    <th key={emp.id} style={{
                      padding: '8px 4px',
                      textAlign: 'center',
                      fontSize: 10,
                      fontWeight: 700,
                      color: nc > 0 ? 'var(--t-danger)' : 'var(--t-text-muted)',
                      borderBottom: '1px solid var(--t-line)',
                      width: 72,
                      minWidth: 72,
                      verticalAlign: 'bottom',
                      lineHeight: 1.3,
                    }}>
                      <div style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)', maxHeight: 80, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                        {emp.name.split(' ')[0]}
                      </div>
                      {nc > 0 && <div style={{ fontSize: 9, background: 'var(--t-danger)', color: '#fff', borderRadius: 8, padding: '1px 5px', marginTop: 2, display: 'inline-block' }}>{nc}</div>}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {filteredCourses.map((course, ci) => (
                <tr key={course.id} style={{ background: ci % 2 === 0 ? 'var(--t-bg)' : 'var(--t-surface)' }}>
                  <td style={{
                    position: 'sticky',
                    left: 0,
                    background: ci % 2 === 0 ? 'var(--t-bg)' : 'var(--t-surface)',
                    zIndex: 5,
                    padding: '10px 14px',
                    fontSize: 12,
                    fontWeight: 600,
                    color: 'var(--t-text)',
                    borderRight: '2px solid var(--t-line)',
                    borderBottom: '1px solid var(--t-line)',
                    maxWidth: 220,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}>
                    {course.title}
                    <div style={{ fontSize: 10, fontWeight: 400, color: 'var(--t-text-faint)' }}>{course.category}</div>
                  </td>
                  {filteredEmps.map(emp => {
                    const status = cellStatus(course.id, emp.id);
                    const cell = cellContent[status];
                    return (
                      <td key={emp.id} style={{
                        textAlign: 'center',
                        padding: '10px 4px',
                        background: cell.bg,
                        borderBottom: '1px solid var(--t-line)',
                        fontSize: 14,
                        color: cell.color,
                        fontWeight: 700,
                      }}>
                        {cell.icon}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Summary row */}
      <div style={{ fontSize: 12, color: 'var(--t-text-faint)' }}>
        {filteredCourses.length} required course{filteredCourses.length !== 1 ? 's' : ''} ·{' '}
        {filteredEmps.length} employee{filteredEmps.length !== 1 ? 's' : ''} ·{' '}
        {nonComplianceCount.filter(x => x.count > 0).length} with gaps
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB 4: REPORTS
// ══════════════════════════════════════════════════════════════════════════════
function Reports({ courses, enrollments, employees }) {
  // Aggregate stats
  const totalCourses = courses.length;
  const totalEnrollments = useMemo(() => {
    let count = 0;
    courses.forEach(c => {
      employees.forEach(e => {
        if (enrollments[c.id]?.[e.id]?.enrolled) count++;
      });
    });
    return count;
  }, [courses, enrollments]);

  const completions = useMemo(() => {
    let count = 0;
    courses.forEach(c => {
      employees.forEach(e => {
        const info = enrollments[c.id]?.[e.id];
        if (info?.enrolled && (info.completed || info.pct === 100)) count++;
      });
    });
    return count;
  }, [courses, enrollments]);

  const completionRate = totalEnrollments > 0 ? Math.round((completions / totalEnrollments) * 100) : 0;

  const avgScore = useMemo(() => {
    const scores = [];
    courses.forEach(c => {
      employees.forEach(e => {
        const info = enrollments[c.id]?.[e.id];
        if (info?.score != null) scores.push(info.score);
      });
    });
    if (!scores.length) return 0;
    return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
  }, [courses, enrollments]);

  const overdueLearners = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    const set = new Set();
    courses.forEach(c => {
      employees.forEach(e => {
        const info = enrollments[c.id]?.[e.id];
        if (info?.enrolled && !(info.completed || info.pct === 100) && info.dueDate && info.dueDate < today) {
          set.add(e.id);
        }
      });
    });
    return set.size;
  }, [courses, enrollments]);

  // Certs issued this month: real completions whose completion date falls in the
  // current calendar month (from live enrollment rows — no estimation).
  const certsThisMonth = useMemo(() => {
    const now = new Date();
    const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    let count = 0;
    courses.forEach(c => {
      employees.forEach(e => {
        const info = enrollments[c.id]?.[e.id];
        if (info?.enrolled && (info.completed || info.pct === 100) && info.completedAt &&
            String(info.completedAt).slice(0, 7) === ym) count++;
      });
    });
    return count;
  }, [courses, enrollments, employees]);

  // Per-course completion rates (top 6 for bar chart)
  const courseRates = useMemo(() => {
    return courses.map(c => {
      const enrolled = employees.filter(e => enrollments[c.id]?.[e.id]?.enrolled).length;
      const done = employees.filter(e => {
        const info = enrollments[c.id]?.[e.id];
        return info?.enrolled && (info.completed || info.pct === 100);
      }).length;
      const pct = enrolled > 0 ? Math.round((done / enrolled) * 100) : 0;
      return { title: c.title, enrolled, done, pct, category: c.category };
    }).sort((a, b) => b.pct - a.pct).slice(0, 6);
  }, [courses, enrollments]);

  // Most challenging (lowest avg score)
  const challengingCourses = useMemo(() => {
    return courses.map(c => {
      const scores = employees
        .map(e => enrollments[c.id]?.[e.id]?.score)
        .filter(s => s != null);
      const avg = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
      return { title: c.title, category: c.category, avgScore: avg, attempts: scores.length };
    }).filter(c => c.avgScore != null).sort((a, b) => a.avgScore - b.avgScore);
  }, [courses, enrollments]);

  // ROI calc
  const trainingHours = courses.reduce((a, c) => a + c.durationHours, 0);
  const costPerHour = 15;
  const totalEmps = employees.length;
  const opportunityCost = Math.round(trainingHours * costPerHour * totalEmps);
  const retentionBenefit = Math.round(opportunityCost * 2.4); // 2.4x ROI estimate

  // SVG bar chart
  const chartW = 600;
  const chartH = 200;
  const chartPad = { top: 20, right: 20, bottom: 50, left: 40 };
  const innerW = chartW - chartPad.left - chartPad.right;
  const innerH = chartH - chartPad.top - chartPad.bottom;
  const barCount = courseRates.length;
  const barGap = 10;
  const barW = barCount > 0 ? (innerW - (barCount - 1) * barGap) / barCount : 0;

  function barColor(pct) {
    if (pct >= 80) return 'var(--t-success)';
    if (pct >= 50) return 'var(--t-warn)';
    return 'var(--t-danger)';
  }

  // ── Drill-down wiring ─────────────────────────────────────────────────────
  const [drill, setDrill] = useState(null);
  const openDrill = (title, columns, rows, accent) =>
    setDrill({ title, subtitle: `${rows.length} record${rows.length === 1 ? '' : 's'}`, columns, rows, accent });
  const today = new Date().toISOString().split('T')[0];

  // Flatten enrollments into row objects the columns can read.
  const enrollmentRows = useMemo(() => {
    const rows = [];
    courses.forEach(c => {
      employees.forEach(e => {
        const info = enrollments[c.id]?.[e.id];
        if (info?.enrolled) {
          const done = info.completed || info.pct === 100;
          rows.push({
            emp: e.name, location: e.location, course: c.title, category: c.category,
            pct: info.pct || 0, completed: done, dueDate: info.dueDate || '—', score: info.score,
            overdue: !done && info.dueDate && info.dueDate < today,
          });
        }
      });
    });
    return rows;
  }, [courses, enrollments, today]);

  const courseCols = [
    { key: 'title', label: 'Course', value: r => r.title },
    { key: 'category', label: 'Category', value: r => r.category },
    { key: 'level', label: 'Level', value: r => r.level },
    { key: 'durationHours', label: 'Duration', value: r => `${r.durationHours}h`, align: 'center', sortKey: r => r.durationHours },
    { key: 'required', label: 'Required', value: r => r.required ? 'YES' : 'No', align: 'center', sortKey: r => (r.required ? 1 : 0) },
    { key: 'sectionCount', label: 'Sections', value: r => r.sectionCount, align: 'center', sortKey: r => r.sectionCount },
    { key: 'lessonCount', label: 'Lessons', value: r => r.lessonCount, align: 'center', sortKey: r => r.lessonCount },
  ];
  const courseRows = courses.map(c => ({
    title: c.title, category: c.category, level: c.level, durationHours: c.durationHours,
    required: c.required, sectionCount: c.sections.length,
    lessonCount: c.sections.reduce((a, s) => a + s.lessons.length, 0),
  }));

  const enrollCols = [
    { key: 'emp', label: 'Employee', value: r => r.emp },
    { key: 'location', label: 'Location', value: r => r.location },
    { key: 'course', label: 'Course', value: r => r.course },
    { key: 'pct', label: 'Progress', value: r => `${r.pct}%`, align: 'center', sortKey: r => r.pct },
    { key: 'completed', label: 'Status', value: r => (r.completed ? 'Completed' : r.overdue ? 'Overdue' : 'In Progress'), align: 'center' },
    { key: 'dueDate', label: 'Due Date', value: r => r.dueDate, align: 'center' },
    { key: 'score', label: 'Score', value: r => (r.score != null ? `${r.score}%` : '—'), align: 'center', sortKey: r => (r.score == null ? -1 : r.score) },
  ];

  const scoreRows = enrollmentRows.filter(r => r.score != null);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* KPI tiles */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 12 }}>
        <KTile label="Total Courses" value={totalCourses} sub="in library"
          onClick={() => openDrill('Total Courses', courseCols, courseRows, 'var(--t-accent)')} />
        <KTile label="Total Enrollments" value={totalEnrollments} sub="across all courses"
          onClick={() => openDrill('Total Enrollments', enrollCols, enrollmentRows, 'var(--t-accent)')} />
        <KTile
          label="Completion Rate"
          value={`${completionRate}%`}
          sub={`${completions} of ${totalEnrollments}`}
          color={completionRate >= 75 ? 'var(--t-success)' : completionRate >= 50 ? 'var(--t-warn)' : 'var(--t-danger)'}
          alert={completionRate < 50 ? 'red' : completionRate < 75 ? 'amber' : null}
          onClick={() => openDrill('Completed Enrollments', enrollCols, enrollmentRows.filter(r => r.completed), 'var(--t-success)')}
        />
        <KTile
          label="Avg Quiz Score"
          value={`${avgScore}%`}
          sub="across all quizzes"
          color={avgScore >= 80 ? 'var(--t-success)' : avgScore >= 60 ? 'var(--t-warn)' : 'var(--t-danger)'}
          onClick={() => openDrill('Scored Quizzes', enrollCols, scoreRows, 'var(--t-accent)')}
        />
        <KTile
          label="Overdue Learners"
          value={overdueLearners}
          sub="past due date"
          color={overdueLearners > 0 ? 'var(--t-danger)' : 'var(--t-success)'}
          alert={overdueLearners > 0 ? 'red' : null}
          onClick={() => openDrill('Overdue Enrollments', enrollCols, enrollmentRows.filter(r => r.overdue), 'var(--t-danger)')}
        />
        <KTile label="Certs Issued" value={certsThisMonth} sub="this month" color="var(--t-accent)"
          onClick={() => openDrill('Certifications (Completed)', enrollCols, enrollmentRows.filter(r => r.completed), 'var(--t-accent)')} />
      </div>

      {/* SVG Bar Chart */}
      <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', padding: 20 }}>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--t-accent)', marginBottom: 16 }}>
          Completion Rate by Course (Top 6)
        </div>
        {courseRates.length === 0 ? (
          <div style={{ color: 'var(--t-text-faint)', fontSize: 13, textAlign: 'center', padding: 24 }}>No data</div>
        ) : (
          <svg width="100%" viewBox={`0 0 ${chartW} ${chartH}`} style={{ overflow: 'visible', display: 'block' }}>
            {/* Y-axis gridlines + labels */}
            {[0, 25, 50, 75, 100].map(v => {
              const y = chartPad.top + innerH - (v / 100) * innerH;
              return (
                <g key={v}>
                  <line x1={chartPad.left} y1={y} x2={chartPad.left + innerW} y2={y} stroke="var(--t-line)" strokeWidth={1} />
                  <text x={chartPad.left - 6} y={y + 4} textAnchor="end" fontSize={9} fill="var(--t-text-faint)">{v}%</text>
                </g>
              );
            })}
            {/* Bars */}
            {courseRates.map((c, i) => {
              const x = chartPad.left + i * (barW + barGap);
              const barH2 = Math.max(2, (c.pct / 100) * innerH);
              const y = chartPad.top + innerH - barH2;
              const color = barColor(c.pct);
              const shortTitle = c.title.length > 14 ? c.title.slice(0, 12) + '…' : c.title;
              return (
                <g key={c.title}>
                  <rect x={x} y={y} width={barW} height={barH2} fill={color} opacity={0.85} />
                  <text x={x + barW / 2} y={y - 4} textAnchor="middle" fontSize={10} fontWeight={700} fill={color}>{c.pct}%</text>
                  <text
                    x={x + barW / 2}
                    y={chartPad.top + innerH + 14}
                    textAnchor="middle"
                    fontSize={9}
                    fill="var(--t-text-faint)"
                    transform={`rotate(-25, ${x + barW / 2}, ${chartPad.top + innerH + 14})`}
                  >{shortTitle}</text>
                </g>
              );
            })}
            {/* X-axis line */}
            <line
              x1={chartPad.left} y1={chartPad.top + innerH}
              x2={chartPad.left + innerW} y2={chartPad.top + innerH}
              stroke="var(--t-line)" strokeWidth={1}
            />
            {/* Y-axis line */}
            <line
              x1={chartPad.left} y1={chartPad.top}
              x2={chartPad.left} y2={chartPad.top + innerH}
              stroke="var(--t-line)" strokeWidth={1}
            />
          </svg>
        )}
      </div>

      {/* Most Challenging Courses table */}
      <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-line)', padding: 20 }}>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--t-warn)', marginBottom: 14 }}>
          Most Challenging Courses (by Avg Score)
        </div>
        {challengingCourses.length === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--t-text-faint)', fontStyle: 'italic' }}>No quiz data yet</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--t-line)' }}>
                <th style={{ textAlign: 'left', padding: '8px 0', fontWeight: 800, fontSize: 10, color: 'var(--t-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Course</th>
                <th style={{ textAlign: 'left', padding: '8px 0', fontWeight: 800, fontSize: 10, color: 'var(--t-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Category</th>
                <th style={{ textAlign: 'center', padding: '8px 0', fontWeight: 800, fontSize: 10, color: 'var(--t-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Avg Score</th>
                <th style={{ textAlign: 'center', padding: '8px 0', fontWeight: 800, fontSize: 10, color: 'var(--t-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Completions</th>
              </tr>
            </thead>
            <tbody>
              {challengingCourses.map((c, i) => (
                <tr key={c.title} style={{ borderBottom: '1px solid var(--t-line)', background: i % 2 === 0 ? 'transparent' : 'var(--t-bg)' }}>
                  <td style={{ padding: '9px 0', color: 'var(--t-text)', fontWeight: 600 }}>{c.title}</td>
                  <td style={{ padding: '9px 0', color: 'var(--t-text-muted)' }}>{c.category}</td>
                  <td style={{ padding: '9px 0', textAlign: 'center', fontWeight: 800, color: c.avgScore >= 80 ? 'var(--t-success)' : c.avgScore >= 60 ? 'var(--t-warn)' : 'var(--t-danger)' }}>
                    {c.avgScore}%
                  </td>
                  <td style={{ padding: '9px 0', textAlign: 'center', color: 'var(--t-text-muted)' }}>{c.attempts}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ROI Estimate */}
      <div style={{ background: 'var(--t-surface)', border: '1px solid var(--t-accent)', padding: 20, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 20 }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--t-accent)', marginBottom: 12 }}>
            Training ROI Estimate
          </div>
          <div style={{ fontSize: 12, color: 'var(--t-text-faint)', lineHeight: 1.7 }}>
            {totalEmps} employees × {trainingHours}h × ${costPerHour}/hr opportunity cost
          </div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 11, color: 'var(--t-text-muted)', marginBottom: 4, textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.06em' }}>Opportunity Cost</div>
          <div style={{ fontSize: 26, fontWeight: 800, color: 'var(--t-warn)' }}>${opportunityCost.toLocaleString()}</div>
          <div style={{ fontSize: 10, color: 'var(--t-text-faint)' }}>lost productivity hours</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 11, color: 'var(--t-text-muted)', marginBottom: 4, textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.06em' }}>Est. Retention Benefit</div>
          <div style={{ fontSize: 26, fontWeight: 800, color: 'var(--t-success)' }}>${retentionBenefit.toLocaleString()}</div>
          <div style={{ fontSize: 10, color: 'var(--t-text-faint)' }}>2.4× industry multiplier</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 11, color: 'var(--t-text-muted)', marginBottom: 4, textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.06em' }}>Net ROI</div>
          <div style={{ fontSize: 26, fontWeight: 800, color: 'var(--t-accent)' }}>
            +${(retentionBenefit - opportunityCost).toLocaleString()}
          </div>
          <div style={{ fontSize: 10, color: 'var(--t-text-faint)' }}>estimated net value</div>
        </div>
      </div>

      <DrillDown open={!!drill} onClose={() => setDrill(null)} {...(drill || {})} />
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB 5: EXPIRY TRACKER
// ══════════════════════════════════════════════════════════════════════════════
function ExpiryTracker({ locationIds }) {
  const [locFilter, setLocFilter] = useState('All')
  const [statusFilter, setStatusFilter] = useState('All')
  const [moduleFilter, setModuleFilter] = useState('All')
  const [toast, setToast] = useState('')

  // Live certification/expiry rows only — no mock fallback. Empty = honest empty.
  const [liveData, setLiveData] = useState([])

  // Fetch real training certification/expiry data from get_training_overview.
  useEffect(() => {
    let cancelled = false
    const nodeIds = locationIds || []
    if (!nodeIds.length) { setLiveData([]); return }
    ;(async () => {
      try {
        const { data, error } = await sb.rpc('get_training_overview', { p_node_ids: nodeIds })
        if (cancelled) return
        if (error || !Array.isArray(data) || data.length === 0) { setLiveData([]); return }
        const today = new Date()
        const mapped = data
          // Only rows with an actual completed certification carry expiry data.
          .filter(r => r.cert_expires && r.completed_at)
          .map(r => {
            const completed = String(r.completed_at).split('T')[0].split(' ')[0]
            const expires = String(r.cert_expires).split('T')[0].split(' ')[0]
            const daysUntilExpiry = Math.floor((new Date(expires + 'T00:00:00') - today) / 86400000)
            const cs = String(r.cert_status || '').toLowerCase()
            let status
            if (cs === 'expired' || daysUntilExpiry < 0) status = 'EXPIRED'
            else if (cs === 'expiring' || daysUntilExpiry <= 30) status = 'EXPIRING SOON'
            else status = 'CURRENT'
            return {
              empId: r.person_id,
              empName: r.full_name,
              location: r.node_name,
              module: r.module,
              completed,
              expires,
              daysUntilExpiry,
              status,
            }
          })
        setLiveData(mapped)
      } catch {
        if (!cancelled) setLiveData([])
      }
    })()
    return () => { cancelled = true }
  }, [locationIds])

  const data = liveData

  const filtered = useMemo(() => {
    return data.filter(r => {
      if (locFilter !== 'All' && r.location !== locFilter) return false
      if (statusFilter !== 'All' && r.status !== statusFilter) return false
      if (moduleFilter !== 'All' && r.module !== moduleFilter) return false
      return true
    })
  }, [data, locFilter, statusFilter, moduleFilter])

  // Derive filter options from the active data set so live data stays filterable.
  const locationOptions = useMemo(() => [...new Set(data.map(r => r.location))].sort(), [data])
  const moduleOptions = useMemo(() => [...new Set(data.map(r => r.module))].sort(), [data])

  const expired = data.filter(r => r.status === 'EXPIRED').length
  const expiring30 = data.filter(r => r.status === 'EXPIRING SOON' && r.daysUntilExpiry >= 0 && r.daysUntilExpiry <= 30).length
  const expiring90 = data.filter(r => r.status === 'CURRENT' && r.daysUntilExpiry <= 90).length
  const current = data.filter(r => r.status === 'CURRENT' && r.daysUntilExpiry > 90).length

  // ── Drill-down wiring ─────────────────────────────────────────────────────
  const [drill, setDrill] = useState(null)
  const expiryCols = [
    { key: 'empName', label: 'Employee', value: r => r.empName },
    { key: 'location', label: 'Location', value: r => r.location },
    { key: 'module', label: 'Module', value: r => r.module },
    { key: 'completed', label: 'Completed', value: r => r.completed, align: 'center' },
    { key: 'expires', label: 'Expires', value: r => r.expires, align: 'center' },
    { key: 'daysUntilExpiry', label: 'Days Until Expiry', value: r => (r.daysUntilExpiry < 0 ? `${Math.abs(r.daysUntilExpiry)}d ago` : `${r.daysUntilExpiry}d`), align: 'center', sortKey: r => r.daysUntilExpiry },
    { key: 'status', label: 'Status', value: r => r.status, align: 'center' },
  ]
  const openDrill = (title, rows, accent) =>
    setDrill({ title, subtitle: `${rows.length} record${rows.length === 1 ? '' : 's'}`, columns: expiryCols, rows, accent })

  // Real action: notify the employee (app notification bus) that their
  // certification needs renewal. No fabricated "success" — a notification is
  // actually delivered to that person.
  function reassign(row) {
    if (row.empId) {
      pushNotification({
        title: 'Certification Renewal Required',
        message: `Your "${row.module}" certification is ${row.status === 'EXPIRED' ? 'expired' : 'expiring soon'}. Please renew.`,
        type: 'warning', category: 'training', targetPersonIds: [row.empId],
      })
    }
    setToast(`Renewal notice sent to ${row.empName}`)
    setTimeout(() => setToast(''), 3000)
  }

  function statusBadge(status) {
    if (status === 'EXPIRED') return { label: 'EXPIRED', color: 'var(--t-danger)', bg: 'rgba(255,59,48,0.12)' }
    if (status === 'EXPIRING SOON') return { label: 'EXPIRING SOON', color: 'var(--t-warn)', bg: 'rgba(255,159,10,0.12)' }
    return { label: 'CURRENT', color: 'var(--t-success)', bg: 'rgba(0,229,147,0.1)' }
  }

  const thStyle = { padding: '9px 12px', textAlign: 'left', fontSize: 10, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--t-text-muted)', borderBottom: '1px solid var(--t-line)', background: 'var(--t-surface)' }
  const tdStyle = { padding: '9px 12px', fontSize: 12, color: 'var(--t-text)', borderBottom: '1px solid var(--t-line)' }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Toast */}
      {toast && (
        <div style={{ position: 'fixed', top: 20, right: 20, background: 'var(--t-success)', color: '#000', padding: '10px 18px', fontWeight: 700, fontSize: 13, zIndex: 9999 }}>
          {toast}
        </div>
      )}

      {/* KPI row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10 }}>
        <KTile label="Expired Now" value={expired} color="var(--t-danger)" alert="red" sub="requires action"
          onClick={() => openDrill('Expired Certifications', data.filter(r => r.status === 'EXPIRED'), 'var(--t-danger)')} />
        <KTile label="Expiring in 30 Days" value={expiring30} color="var(--t-warn)" alert="amber" sub="needs reassignment"
          onClick={() => openDrill('Expiring in 30 Days', data.filter(r => r.status === 'EXPIRING SOON' && r.daysUntilExpiry >= 0 && r.daysUntilExpiry <= 30), 'var(--t-warn)')} />
        <KTile label="Expiring in 90 Days" value={expiring90} color="var(--t-warn)" alert="amber" sub="schedule soon"
          onClick={() => openDrill('Expiring in 90 Days', data.filter(r => r.status === 'CURRENT' && r.daysUntilExpiry <= 90), 'var(--t-warn)')} />
        <KTile label="Fully Current" value={current} color="var(--t-success)" sub="no action needed"
          onClick={() => openDrill('Fully Current Certifications', data.filter(r => r.status === 'CURRENT' && r.daysUntilExpiry > 90), 'var(--t-success)')} />
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--t-text-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Location</div>
          <select value={locFilter} onChange={e => setLocFilter(e.target.value)} style={{ ...selectStyle, width: 150 }}>
            <option value="All">All Locations</option>
            {locationOptions.map(l => <option key={l}>{l}</option>)}
          </select>
        </div>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--t-text-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Status</div>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ ...selectStyle, width: 150 }}>
            <option value="All">All Statuses</option>
            <option value="EXPIRED">Expired</option>
            <option value="EXPIRING SOON">Expiring Soon</option>
            <option value="CURRENT">Current</option>
          </select>
        </div>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--t-text-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Module</div>
          <select value={moduleFilter} onChange={e => setModuleFilter(e.target.value)} style={{ ...selectStyle, width: 220 }}>
            <option value="All">All Modules</option>
            {moduleOptions.map(m => <option key={m}>{m}</option>)}
          </select>
        </div>
        <div style={{ fontSize: 12, color: 'var(--t-text-muted)', paddingBottom: 8 }}>
          {filtered.length} records
        </div>
      </div>

      {/* Table */}
      <div style={{ overflowX: 'auto', border: '1px solid var(--t-line)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
          <thead>
            <tr>
              <th style={thStyle}>Employee</th>
              <th style={thStyle}>Location</th>
              <th style={thStyle}>Module</th>
              <th style={thStyle}>Completed</th>
              <th style={thStyle}>Expires</th>
              <th style={{ ...thStyle, textAlign: 'center' }}>Days Until Expiry</th>
              <th style={{ ...thStyle, textAlign: 'center' }}>Status</th>
              <th style={thStyle}>Action</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r, i) => {
              const badge = statusBadge(r.status)
              return (
                <tr key={`${r.empId}-${r.module}`} style={{ background: i % 2 === 0 ? 'var(--t-bg)' : 'var(--t-surface)' }}>
                  <td style={{ ...tdStyle, fontWeight: 600 }}>{r.empName}</td>
                  <td style={tdStyle}>{r.location}</td>
                  <td style={tdStyle}>{r.module}</td>
                  <td style={{ ...tdStyle, color: 'var(--t-text-muted)', fontFamily: 'monospace', fontSize: 11 }}>{r.completed}</td>
                  <td style={{ ...tdStyle, color: 'var(--t-text-muted)', fontFamily: 'monospace', fontSize: 11 }}>{r.expires}</td>
                  <td style={{ ...tdStyle, textAlign: 'center', fontWeight: 700, color: badge.color }}>
                    {r.daysUntilExpiry < 0 ? `${Math.abs(r.daysUntilExpiry)}d ago` : `${r.daysUntilExpiry}d`}
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'center' }}>
                    <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.06em', color: badge.color, background: badge.bg, padding: '3px 8px' }}>
                      {badge.label}
                    </span>
                  </td>
                  <td style={tdStyle}>
                    {(r.status === 'EXPIRED' || r.status === 'EXPIRING SOON') && (
                      <button onClick={() => reassign(r)} style={{ ...btnAccent, fontSize: 11, padding: '4px 10px' }}>
                        Send Renewal Notice
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <DrillDown open={!!drill} onClose={() => setDrill(null)} {...(drill || {})} />
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB 6: EFFECTIVENESS
// ══════════════════════════════════════════════════════════════════════════════
function EffectivenessTab({ courses, enrollments, employees }) {
  const [sortBy, setSortBy] = useState('completion')

  // Real per-course training outcomes, computed from live enrollment rows:
  // completion rate + average quiz score among scored completions. No
  // fabricated pre/post baselines — quiz scores are recorded only when a real
  // assessment is graded, so rows appear as data accrues.
  const modules = useMemo(() => {
    return courses.map(c => {
      const infos = employees.map(e => enrollments[c.id]?.[e.id]).filter(i => i?.enrolled)
      const enrolled = infos.length
      const done = infos.filter(i => i.completed || i.pct === 100).length
      const scores = infos.map(i => i.score).filter(s => s != null)
      const avgScore = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null
      const completionRate = enrolled ? Math.round((done / enrolled) * 100) : 0
      return {
        module: c.title, category: c.category, enrolled, completed: done,
        completionRate, avgScore, scored: scores.length, required: c.required,
      }
    }).filter(m => m.enrolled > 0)
  }, [courses, enrollments, employees])

  const sorted = useMemo(() => {
    return [...modules].sort((a, b) => {
      if (sortBy === 'completion') return b.completionRate - a.completionRate
      if (sortBy === 'name') return a.module.localeCompare(b.module)
      if (sortBy === 'score') return (b.avgScore ?? -1) - (a.avgScore ?? -1)
      return 0
    })
  }, [modules, sortBy])

  const scoredModules = modules.filter(m => m.avgScore != null)
  const overallAvgScore = scoredModules.length
    ? Math.round(scoredModules.reduce((a, m) => a + m.avgScore, 0) / scoredModules.length) : null
  const avgCompletion = modules.length
    ? Math.round(modules.reduce((a, m) => a + m.completionRate, 0) / modules.length) : 0
  const lowCompletion = modules.filter(m => m.completionRate < 50).length

  // ── Drill-down wiring ─────────────────────────────────────────────────────
  const [drill, setDrill] = useState(null)
  const effCols = [
    { key: 'module', label: 'Course', value: r => r.module },
    { key: 'category', label: 'Category', value: r => r.category },
    { key: 'enrolled', label: 'Enrolled', value: r => r.enrolled, align: 'center', sortKey: r => r.enrolled },
    { key: 'completed', label: 'Completed', value: r => r.completed, align: 'center', sortKey: r => r.completed },
    { key: 'completionRate', label: 'Completion', value: r => `${r.completionRate}%`, align: 'center', sortKey: r => r.completionRate },
    { key: 'avgScore', label: 'Avg Score', value: r => (r.avgScore != null ? `${r.avgScore}%` : '—'), align: 'center', sortKey: r => (r.avgScore ?? -1) },
  ]
  const openDrill = (title, rows, accent) =>
    setDrill({ title, subtitle: `${rows.length} course${rows.length === 1 ? '' : 's'}`, columns: effCols, rows, accent })

  const thStyle = { padding: '9px 12px', textAlign: 'left', fontSize: 10, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--t-text-muted)', borderBottom: '1px solid var(--t-line)', background: 'var(--t-surface)' }
  const tdStyle = { padding: '9px 12px', fontSize: 12, color: 'var(--t-text)', borderBottom: '1px solid var(--t-line)' }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* KPI row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 10 }}>
        <KTile label="Courses With Activity" value={modules.length} sub="enrolled learners"
          onClick={() => openDrill('Courses With Activity', modules, 'var(--t-accent)')} />
        <KTile label="Avg Completion Rate" value={`${avgCompletion}%`} color={avgCompletion >= 75 ? 'var(--t-success)' : avgCompletion >= 50 ? 'var(--t-warn)' : 'var(--t-danger)'} sub="across active courses"
          onClick={() => openDrill('Completion by Course', modules, 'var(--t-success)')} />
        <KTile label="Avg Quiz Score" value={overallAvgScore != null ? `${overallAvgScore}%` : '—'} color={overallAvgScore == null ? undefined : overallAvgScore >= 80 ? 'var(--t-success)' : 'var(--t-warn)'} sub={overallAvgScore == null ? 'no graded quizzes' : 'graded assessments'}
          onClick={() => openDrill('Scored Courses', scoredModules, 'var(--t-accent)')} />
        <KTile label="Low Completion Courses" value={lowCompletion} color={lowCompletion > 0 ? 'var(--t-warn)' : 'var(--t-success)'} alert={lowCompletion > 0 ? 'amber' : null} sub="under 50%"
          onClick={() => openDrill('Low Completion Courses', modules.filter(m => m.completionRate < 50), 'var(--t-warn)')} />
      </div>

      {/* Sort control */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--t-text-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Sort By</div>
          <select value={sortBy} onChange={e => setSortBy(e.target.value)} style={{ ...selectStyle, width: 200 }}>
            <option value="completion">Completion Rate (default)</option>
            <option value="name">Course Name</option>
            <option value="score">Avg Quiz Score</option>
          </select>
        </div>
      </div>

      {/* Table */}
      {sorted.length === 0 ? (
        <div style={{ padding: 24, color: 'var(--t-text-faint)', textAlign: 'center', background: 'var(--t-surface)', border: '1px solid var(--t-line)' }}>
          No training activity yet — effectiveness appears once employees are enrolled and complete courses.
        </div>
      ) : (
      <div style={{ overflowX: 'auto', border: '1px solid var(--t-line)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
          <thead>
            <tr>
              <th style={thStyle}>Course</th>
              <th style={thStyle}>Category</th>
              <th style={{ ...thStyle, textAlign: 'center' }}>Enrolled</th>
              <th style={{ ...thStyle, textAlign: 'center' }}>Completed</th>
              <th style={{ ...thStyle, textAlign: 'center' }}>Completion Rate</th>
              <th style={{ ...thStyle, textAlign: 'center' }}>Avg Quiz Score</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((m, i) => (
              <tr key={m.module} style={{ background: i % 2 === 0 ? 'var(--t-bg)' : 'var(--t-surface)' }}>
                <td style={{ ...tdStyle, fontWeight: 600 }}>{m.module}</td>
                <td style={tdStyle}>{m.category}</td>
                <td style={{ ...tdStyle, textAlign: 'center', color: 'var(--t-text-muted)' }}>{m.enrolled}</td>
                <td style={{ ...tdStyle, textAlign: 'center', color: 'var(--t-text-muted)' }}>{m.completed}</td>
                <td style={{ ...tdStyle, textAlign: 'center', fontWeight: 800, color: m.completionRate >= 80 ? 'var(--t-success)' : m.completionRate >= 50 ? 'var(--t-warn)' : 'var(--t-danger)' }}>{m.completionRate}%</td>
                <td style={{ ...tdStyle, textAlign: 'center', fontWeight: 700, color: m.avgScore == null ? 'var(--t-text-faint)' : m.avgScore >= 80 ? 'var(--t-success)' : 'var(--t-warn)' }}>
                  {m.avgScore != null ? `${m.avgScore}%` : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      )}

      <div style={{ fontSize: 11, color: 'var(--t-text-faint)', fontStyle: 'italic' }}>
        Completion and quiz-score effectiveness are computed from live enrollment records. Sales/attendance outcome correlation requires the Sales Tracker integration and is not shown until connected.
      </div>

      <DrillDown open={!!drill} onClose={() => setDrill(null)} {...(drill || {})} />
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN EXPORT
// ══════════════════════════════════════════════════════════════════════════════
export default function TrainingLMS() {
  const { session } = useAuth();
  const { locationIds } = useScope();

  const r = session?.person?.role_name || '';
  const isHR = ['ceo', 'hr', 'manager', 'coo', 'admin', 'owner'].some(x => r.toLowerCase().includes(x));

  const [tab, setTab] = useState('builder');
  const [courses, setCourses] = useState([]);
  const [enrollments, setEnrollments] = useState({});
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [saving, setSaving] = useState(false);

  const showExpiry = useFeatureFlag('training_expiry')
  const showEffectiveness = useFeatureFlag('training_effectiveness')

  const actorId = session?.person?.id ?? null;
  const nodeKey = (locationIds || []).join(',');
  const defaultNode = (locationIds && locationIds.length === 1) ? locationIds[0] : null;

  // ── Load the live catalog + enrollments + roster (scoped by location) ────────
  const reload = useCallback(async () => {
    const nodeIds = locationIds || [];
    setLoading(true); setLoadError(null);
    const [lmsRes, rosterRes] = await Promise.all([
      sb.rpc('lms_courses_list', { p_node_ids: nodeIds }),
      sb.rpc('get_roster', { p_node_ids: nodeIds, p_actor: actorId }),
    ]);

    if (lmsRes.error) {
      setLoadError(lmsRes.error.message || 'Failed to load courses');
      setCourses([]); setEnrollments({});
    } else {
      const payload = lmsRes.data || {};
      setCourses(Array.isArray(payload.courses) ? payload.courses : []);
      const map = {};
      (Array.isArray(payload.enrollments) ? payload.enrollments : []).forEach(e => {
        (map[e.course_id] ||= {})[e.person_id] = {
          enrolled: true,
          pct: e.pct || 0,
          completed: !!e.completed,
          dueDate: e.due_date || null,
          score: e.score,
          completedAt: e.completed_at || null,
        };
      });
      setEnrollments(map);
    }

    const roster = (rosterRes.error ? [] : (rosterRes.data || []))
      .filter(p => p.is_active !== false)
      .map(p => ({
        id: p.id ?? p.person_id,
        name: p.full_name || '—',
        role: p.role_name ?? p.role ?? '—',
        location: p.node_name ?? p.location ?? '—',
        node_id: p.node_id ?? null,
      }));
    setEmployees(roster);
    setLoading(false);
  }, [nodeKey, actorId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { reload(); }, [reload]);

  const locations = useMemo(
    () => [...new Set(employees.map(e => e.location).filter(l => l && l !== '—'))].sort(),
    [employees]
  );

  // ── Course persistence handlers (real writes → refresh) ──────────────────────
  const createCourse = useCallback(async () => {
    setSaving(true);
    const { data, error } = await sb.rpc('lms_course_upsert', {
      p_id: null, p_title: 'Untitled Course', p_category: 'Compliance', p_description: '',
      p_level: 'Beginner', p_duration_hours: 1, p_required: false, p_sections: [],
      p_node_id: defaultNode, p_actor: actorId,
    });
    setSaving(false);
    if (error || (data && data.ok === false)) return null;
    await reload();
    return data?.id ?? null;
  }, [defaultNode, actorId, reload]);

  const saveCourse = useCallback(async (course) => {
    setSaving(true);
    const { data, error } = await sb.rpc('lms_course_upsert', {
      p_id: course.id, p_title: course.title, p_category: course.category,
      p_description: course.description || '', p_level: course.level,
      p_duration_hours: course.durationHours, p_required: !!course.required,
      p_sections: sectionsPayload(course), p_node_id: defaultNode, p_actor: actorId,
    });
    setSaving(false);
    if (error || (data && data.ok === false)) return false;
    await reload();
    return true;
  }, [defaultNode, actorId, reload]);

  const deleteCourse = useCallback(async (id) => {
    setSaving(true);
    const { error } = await sb.rpc('lms_course_delete', { p_id: id });
    setSaving(false);
    if (!error) await reload();
  }, [reload]);

  // Derived KPIs
  const requiredCount = courses.filter(c => c.required).length;
  const totalEnrolls = useMemo(() => {
    let n = 0;
    courses.forEach(c => employees.forEach(e => { if (enrollments[c.id]?.[e.id]?.enrolled) n++; }));
    return n;
  }, [courses, enrollments]);
  const totalComplete = useMemo(() => {
    let n = 0;
    courses.forEach(c => employees.forEach(e => {
      const info = enrollments[c.id]?.[e.id];
      if (info?.enrolled && (info.completed || info.pct === 100)) n++;
    }));
    return n;
  }, [courses, enrollments]);
  const overdue = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    const set = new Set();
    courses.forEach(c => employees.forEach(e => {
      const info = enrollments[c.id]?.[e.id];
      if (info?.enrolled && !(info.completed || info.pct === 100) && info.dueDate && info.dueDate < today) set.add(e.id);
    }));
    return set.size;
  }, [courses, enrollments]);
  const completionRate = totalEnrolls > 0 ? Math.round((totalComplete / totalEnrolls) * 100) : 0;

  // ── Drill-down wiring ─────────────────────────────────────────────────────
  const [drill, setDrill] = useState(null);
  const openDrill = (title, columns, rows, accent) =>
    setDrill({ title, subtitle: `${rows.length} record${rows.length === 1 ? '' : 's'}`, columns, rows, accent });
  const todayStr = new Date().toISOString().split('T')[0];

  const stripEnrollRows = useMemo(() => {
    const rows = [];
    courses.forEach(c => employees.forEach(e => {
      const info = enrollments[c.id]?.[e.id];
      if (info?.enrolled) {
        const done = info.completed || info.pct === 100;
        rows.push({
          emp: e.name, location: e.location, course: c.title,
          pct: info.pct || 0, completed: done, dueDate: info.dueDate || '—', score: info.score,
          overdue: !done && info.dueDate && info.dueDate < todayStr,
        });
      }
    }));
    return rows;
  }, [courses, enrollments, todayStr]);

  const stripCourseCols = [
    { key: 'title', label: 'Course', value: r => r.title },
    { key: 'category', label: 'Category', value: r => r.category },
    { key: 'level', label: 'Level', value: r => r.level },
    { key: 'durationHours', label: 'Duration', value: r => `${r.durationHours}h`, align: 'center', sortKey: r => r.durationHours },
    { key: 'required', label: 'Required', value: r => r.required ? 'YES' : 'No', align: 'center', sortKey: r => (r.required ? 1 : 0) },
    { key: 'sectionCount', label: 'Sections', value: r => r.sectionCount, align: 'center', sortKey: r => r.sectionCount },
  ];
  const stripCourseRows = courses.map(c => ({
    title: c.title, category: c.category, level: c.level, durationHours: c.durationHours,
    required: c.required, sectionCount: c.sections.length,
  }));
  const stripEnrollCols = [
    { key: 'emp', label: 'Employee', value: r => r.emp },
    { key: 'location', label: 'Location', value: r => r.location },
    { key: 'course', label: 'Course', value: r => r.course },
    { key: 'pct', label: 'Progress', value: r => `${r.pct}%`, align: 'center', sortKey: r => r.pct },
    { key: 'completed', label: 'Status', value: r => (r.completed ? 'Completed' : r.overdue ? 'Overdue' : 'In Progress'), align: 'center' },
    { key: 'dueDate', label: 'Due Date', value: r => r.dueDate, align: 'center' },
    { key: 'score', label: 'Score', value: r => (r.score != null ? `${r.score}%` : '—'), align: 'center', sortKey: r => (r.score == null ? -1 : r.score) },
  ];

  const tabs = [
    { id: 'builder',       label: 'Course Builder' },
    { id: 'enrollment',    label: 'Enrollment Manager' },
    { id: 'matrix',        label: 'Compliance Matrix' },
    { id: 'reports',       label: 'Reports' },
    ...(showExpiry        ? [{ id: 'expiry',        label: 'Expiry Tracker' }] : []),
    ...(showEffectiveness ? [{ id: 'effectiveness', label: 'Effectiveness' }] : []),
  ];

  return (
    <div style={{ fontFamily: 'inherit', color: 'var(--t-text)', minHeight: '100%' }}>
      {/* Page header */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--t-text)', letterSpacing: '-0.01em', marginBottom: 4 }}>
          Training LMS
        </div>
        <div style={{ fontSize: 12, color: 'var(--t-text-faint)' }}>
          Course builder · Enrollment management · Compliance tracking · Analytics
        </div>
      </div>

      {/* KPI strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10, marginBottom: 24 }}>
        <KTile label="Total Courses" value={courses.length} sub={`${requiredCount} required`}
          onClick={() => openDrill('Total Courses', stripCourseCols, stripCourseRows, 'var(--t-accent)')} />
        <KTile label="Total Enrollments" value={totalEnrolls} sub="active assignments"
          onClick={() => openDrill('Total Enrollments', stripEnrollCols, stripEnrollRows, 'var(--t-accent)')} />
        <KTile
          label="Completion Rate"
          value={`${completionRate}%`}
          sub={`${totalComplete} completed`}
          color={completionRate >= 75 ? 'var(--t-success)' : completionRate >= 50 ? 'var(--t-warn)' : 'var(--t-danger)'}
          alert={completionRate < 50 ? 'red' : completionRate < 75 ? 'amber' : null}
          onClick={() => openDrill('Completed Enrollments', stripEnrollCols, stripEnrollRows.filter(r => r.completed), 'var(--t-success)')}
        />
        <KTile
          label="Overdue Learners"
          value={overdue}
          sub="past due date"
          color={overdue > 0 ? 'var(--t-danger)' : 'var(--t-success)'}
          alert={overdue > 0 ? 'red' : null}
          onClick={() => openDrill('Overdue Enrollments', stripEnrollCols, stripEnrollRows.filter(r => r.overdue), 'var(--t-danger)')}
        />
      </div>

      {/* Load / error banner */}
      {loadError && (
        <div style={{ background: 'rgba(255,59,48,0.12)', border: '1px solid var(--t-danger)', color: 'var(--t-danger)', padding: '10px 14px', marginBottom: 16, fontSize: 12, fontWeight: 600 }}>
          Could not load training data: {loadError}
        </div>
      )}
      {loading && courses.length === 0 && !loadError && (
        <div style={{ color: 'var(--t-text-faint)', fontSize: 12, marginBottom: 16 }}>Loading…</div>
      )}

      {/* Tab bar */}
      <TabBar tabs={tabs} active={tab} onChange={setTab} />

      {/* Tab content */}
      {tab === 'builder' && (
        <CourseBuilder
          courses={courses}
          setCourses={setCourses}
          onCreate={createCourse}
          onDelete={deleteCourse}
          onSave={saveCourse}
          busy={saving}
        />
      )}
      {tab === 'enrollment' && (
        <EnrollmentManager
          courses={courses}
          enrollments={enrollments}
          employees={employees}
          locations={locations}
          reload={reload}
        />
      )}
      {tab === 'matrix' && (
        <ComplianceMatrix
          courses={courses}
          enrollments={enrollments}
          employees={employees}
          locations={locations}
        />
      )}
      {tab === 'reports' && (
        <Reports
          courses={courses}
          enrollments={enrollments}
          employees={employees}
        />
      )}
      {tab === 'expiry' && showExpiry && <ExpiryTracker locationIds={locationIds} />}
      {tab === 'effectiveness' && showEffectiveness && (
        <EffectivenessTab courses={courses} enrollments={enrollments} employees={employees} />
      )}

      <DrillDown open={!!drill} onClose={() => setDrill(null)} {...(drill || {})} />
    </div>
  );
}
