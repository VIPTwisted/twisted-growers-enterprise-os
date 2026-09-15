import { useState, useEffect, useCallback, useMemo } from 'react'
import { sb, getSession } from '../lib/supabase'
import { useAuth } from '../lib/auth.jsx'
import { useScope } from '../lib/scope.jsx'
import { getConfig } from '../lib/config.js'

// ── Role helpers ──────────────────────────────────────────────────────────────
function roleIsHR(role) {
  const r = (role || '').toLowerCase()
  return ['ceo','hr','manager','coo','admin','owner'].some(x => r.includes(x))
}
function roleIsAdmin(role) {
  const r = (role || '').toLowerCase()
  return r.includes('admin') || r.includes('owner') || r.includes('coo')
}
function roleIsKeyholder(role) {
  return (role || '').toLowerCase().includes('key')
}

// ── Static option lists (enums for filters/forms — not data) ──────────────────
const CATEGORIES = ['All','Product Knowledge','Customer Service','Loss Prevention','Compliance','Leadership','Wellness','Sales Techniques','Safety']
const LEVELS     = ['All','Beginner','Intermediate','Advanced']

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtDuration(min) {
  if (min < 60) return `${min}m`
  const h = Math.floor(min / 60), m = min % 60
  return m ? `${h}h ${m}m` : `${h}h`
}
function stars(n) {
  return '★'.repeat(Math.round(n)) + '☆'.repeat(5 - Math.round(n))
}
function daysUntil(dateStr) {
  if (!dateStr) return null
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const diff = new Date(dateStr) - today
  return Math.ceil(diff / 86400000)
}

// ── KPI Tile ──────────────────────────────────────────────────────────────────
function KTile({ label, value, sub, color, alert }) {
  return (
    <div style={{
      background: 'var(--t-surface)',
      border: `1px solid ${alert === 'red' ? 'var(--t-danger)' : alert === 'amber' ? 'var(--t-warn)' : 'var(--t-line)'}`,
      padding: '14px 16px',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {alert === 'red'   && <div style={{ position:'absolute', top:0, left:0, right:0, height:2, background:'var(--t-danger)' }} />}
      {alert === 'amber' && <div style={{ position:'absolute', top:0, left:0, right:0, height:2, background:'var(--t-warn)'   }} />}
      <div style={{ fontSize:10, fontWeight:700, letterSpacing:'.08em', color:'var(--t-text-muted)', textTransform:'uppercase', marginBottom:6 }}>{label}</div>
      <div style={{ fontSize:24, fontWeight:800, color: color || 'var(--t-text)', lineHeight:1, marginBottom:4 }}>{value}</div>
      {sub && <div style={{ fontSize:11, color:'var(--t-text-faint)' }}>{sub}</div>}
    </div>
  )
}

// ── ProgressBar ───────────────────────────────────────────────────────────────
function ProgressBar({ pct, color, height }) {
  const c = color || (pct === 100 ? 'var(--t-success)' : pct > 0 ? 'var(--t-accent)' : 'var(--t-line)')
  return (
    <div style={{ height: height || 4, background: 'var(--t-line)', width: '100%' }}>
      <div style={{ height: '100%', width: `${Math.min(pct, 100)}%`, background: c, transition: 'width 0.4s ease' }} />
    </div>
  )
}

// ── CourseCard ────────────────────────────────────────────────────────────────
function CourseCard({ course, myPct, myCert, lang, onStart, onSelect }) {
  const pct = myPct || 0
  const status = myCert ? 'certified' : pct > 0 ? 'in_progress' : 'not_started'
  const days = daysUntil(course.dueDate)
  const urgent = course.required && days !== null && days <= 7 && !myCert

  return (
    <div
      onClick={() => onSelect && onSelect(course)}
      style={{
        background: 'var(--t-surface)',
        border: myCert ? '1px solid var(--t-success)' : urgent ? '1px solid var(--t-danger)' : '1px solid var(--t-line)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden', cursor: 'pointer',
        transition: 'border-color 0.15s',
      }}
    >
      <div style={{ height: 4, background: course.color }} />
      <div style={{ padding: '16px 16px 14px', display: 'flex', flexDirection: 'column', gap: 10, flex: 1 }}>
        {/* Title row */}
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <span style={{ fontSize: 28, lineHeight: 1, flexShrink: 0 }}>{course.icon}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 800, fontSize: 13, color: 'var(--t-text)', lineHeight: 1.3 }}>{course.title}</div>
            <div style={{ fontSize: 11, color: 'var(--t-text-faint)', marginTop: 3 }}>{fmtDuration(course.duration)} · {course.level}</div>
          </div>
        </div>

        {/* Badges */}
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'center' }}>
          <span className="badge blue" style={{ background:`${course.color}22`, color:course.color, borderColor:`${course.color}55` }}>{course.category}</span>
          {course.required
            ? <span className={urgent ? 'badge red' : 'badge amber'}>
                {urgent ? `⚠ Due ${days}d` : 'Required'}
              </span>
            : <span className="badge blue">Optional</span>
          }
          {myCert && <span className="badge green">Certified</span>}
        </div>

        {/* Rating (if reviewed) + real enrolled count */}
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--t-text-muted)' }}>
          <span style={{ color: '#fbbf24', letterSpacing: 1 }}>{course.rating ? stars(course.rating) : ''}</span>
          <span>{course.enrolled || 0} enrolled</span>
        </div>

        {/* Progress */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--t-text-faint)', marginBottom: 5 }}>
            <span>Progress</span>
            <span style={{ fontWeight: 700, color: pct === 100 ? 'var(--t-success)' : 'var(--t-text-muted)' }}>{pct}%</span>
          </div>
          <ProgressBar pct={pct} color={myCert ? 'var(--t-success)' : course.color} />
        </div>

        {/* CTA */}
        <button
          onClick={e => { e.stopPropagation(); onStart(course) }}
          style={{
            marginTop: 4, padding: '7px 0', fontSize: 12, fontWeight: 700, letterSpacing: '.05em',
            cursor: 'pointer', fontFamily: 'var(--font-sans)', width: '100%',
            background: myCert ? 'transparent' : course.color,
            color: myCert ? course.color : '#000',
            border: `1px solid ${course.color}`,
          }}
        >
          {myCert ? 'Review' : status === 'in_progress' ? 'Continue' : 'Start Course'}
        </button>
      </div>
    </div>
  )
}

// ── CoursePlayer Overlay (full-screen) ────────────────────────────────────────
function CoursePlayer({ course, prog, lang, onClose, onLessonComplete, onCertify }) {
  const [lessonIdx,    setLessonIdx]    = useState(Math.min(prog?.lessonsCompleted || 0, (course.lessons?.length || 1) - 1))
  const [selectedOpt,  setSelectedOpt]  = useState(null)
  const [quizSubmitted, setQuizSubmitted] = useState(false)
  const [quizResults,  setQuizResults]  = useState({})   // lessonIdx → answered correctly (real, this session)
  const [saving,       setSaving]        = useState(false)
  const [showComplete, setShowComplete]  = useState(false)
  const [finalScore,   setFinalScore]    = useState(null)

  const lessons = course.lessons || []
  const lesson  = lessons[lessonIdx] || {}
  const totalL  = lessons.length
  const completed = prog?.lessonsCompleted || 0
  const isLocked  = lessonIdx > completed
  const pct       = totalL ? Math.round(((lessonIdx + 1) / totalL) * 100) : 100
  const quiz      = lesson.quiz
  const hasQuiz   = Boolean(quiz)
  const isLast    = lessonIdx === totalL - 1
  const passed    = finalScore === null || finalScore >= 70   // null = no quizzes → certify on completion

  const handleNext = async () => {
    if (hasQuiz && !quizSubmitted) return
    if (lessonIdx >= completed) {
      setSaving(true)
      await onLessonComplete(course.id, lessonIdx, false, null)
      setSaving(false)
    }
    if (isLast) {
      // Real score: percentage of knowledge checks answered correctly this session.
      // Courses with no quizzes certify on completion with no score (null).
      const answered = Object.values(quizResults)
      const score = answered.length ? Math.round((answered.filter(Boolean).length / answered.length) * 100) : null
      setFinalScore(score)
      setShowComplete(true)
      if (score === null || score >= 70) await onCertify(course.id, score)
    } else {
      setLessonIdx(i => i + 1)
      setSelectedOpt(null)
      setQuizSubmitted(false)
    }
  }

  const lbl = lang === 'es'

  return (
    <div style={{ position:'fixed', inset:0, zIndex:9999, background:'#070b14', display:'flex', flexDirection:'column' }}>
      {/* Header */}
      <div style={{ background:`linear-gradient(135deg,${course.color}66,${course.color}33)`, borderBottom:'1px solid var(--t-line)', padding:'0 24px', display:'flex', alignItems:'center', gap:16, flexShrink:0, minHeight:64 }}>
        <button onClick={onClose} style={{ background:'rgba(255,255,255,0.1)', border:'none', color:'#fff', padding:'6px 14px', cursor:'pointer', fontFamily:'var(--font-sans)', fontWeight:700, fontSize:12 }}>
          ← {lbl ? 'Salir' : 'Exit'}
        </button>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontWeight:800, fontSize:14, color:'#fff', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{course.title}</div>
          <div style={{ fontSize:11, color:'rgba(255,255,255,0.6)', marginTop:2 }}>
            {lbl ? 'Lección' : 'Lesson'} {lessonIdx + 1} {lbl ? 'de' : 'of'} {totalL}
          </div>
        </div>
        <div style={{ width:120, flexShrink:0 }}>
          <div style={{ fontSize:10, color:'rgba(255,255,255,0.6)', marginBottom:4, textAlign:'right' }}>{pct}%</div>
          <ProgressBar pct={pct} color={course.color} height={4} />
        </div>
      </div>

      {/* Body */}
      <div style={{ flex:1, overflow:'auto', padding:24, display:'flex', justifyContent:'center' }}>
        <div style={{ maxWidth:720, width:'100%', display:'flex', flexDirection:'column', gap:20 }}>
          {showComplete ? (
            <div style={{ textAlign:'center', padding:'60px 24px' }}>
              <div style={{ fontSize:64, marginBottom:16 }}>{passed ? '🏆' : '📋'}</div>
              <div style={{ fontSize:28, fontWeight:800, color: passed ? 'var(--t-success)' : 'var(--t-warn)', marginBottom:8 }}>
                {passed ? (lbl ? '¡Certificado!' : 'Certified!') : (lbl ? 'Curso Completado' : 'Course Completed')}
              </div>
              {finalScore !== null && (
                <div style={{ fontSize:48, fontWeight:900, color: passed ? 'var(--t-success)' : 'var(--t-accent)', marginBottom:8, fontFamily:'var(--font-mono)' }}>{finalScore}%</div>
              )}
              <div style={{ fontSize:14, color:'var(--t-text-muted)', marginBottom:16 }}>
                {passed
                  ? (lbl ? 'Obtuviste la certificación para este curso.' : 'You earned the certification for this course.')
                  : (lbl ? 'Necesitas 70% o más para certificarte.' : 'You need 70%+ to certify. Try again.')}
              </div>
              {passed && <span className="badge green" style={{ fontSize:14, padding:'8px 20px' }}>{lbl ? 'Insignia Ganada' : 'Certification Badge Earned'}</span>}
              <div style={{ marginTop:32 }}>
                <button onClick={onClose} style={{ padding:'12px 32px', fontWeight:700, fontSize:14, cursor:'pointer', background:'var(--t-accent)', color:'#000', border:'none', fontFamily:'var(--font-sans)', letterSpacing:'.05em' }}>
                  {lbl ? 'Volver a la Academia' : 'Back to Academy'}
                </button>
              </div>
            </div>
          ) : lessons.length === 0 ? (
            <div style={{ textAlign:'center', padding:64, color:'var(--t-text-muted)' }}>
              <div style={{ fontSize:48, marginBottom:16 }}>{course.icon}</div>
              <div style={{ fontSize:20, fontWeight:800, color:'var(--t-text)', marginBottom:8 }}>{course.title}</div>
              <div style={{ fontSize:13, color:'var(--t-text-muted)', marginBottom:24 }}>No lesson modules have been published for this course yet. Complete the training with your manager, then mark it done below.</div>
              <button onClick={async () => { setSaving(true); await onCertify(course.id, null); setSaving(false); setFinalScore(null); setShowComplete(true) }}
                style={{ padding:'10px 28px', fontWeight:700, fontSize:13, cursor:'pointer', background:'var(--t-accent)', color:'#000', border:'none', fontFamily:'var(--font-sans)' }}>
                {saving ? 'Completing…' : 'Mark Complete & Certify'}
              </button>
            </div>
          ) : (
            <>
              <div>
                <div style={{ fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'.1em', color:course.color, marginBottom:8 }}>
                  {lbl ? 'Lección' : 'Lesson'} {lessonIdx + 1}
                </div>
                <div style={{ fontSize:22, fontWeight:800, color:'var(--t-text)', lineHeight:1.3 }}>{lesson.title}</div>
              </div>
              <div style={{ background:'var(--t-surface)', border:'1px solid var(--t-line)', padding:24 }}>
                <div style={{ fontSize:15, color:'var(--t-text)', lineHeight:1.8 }}>{lesson.content}</div>
              </div>
              {hasQuiz && (
                <div style={{ background:'var(--t-surface)', border:`1px solid ${course.color}44`, padding:24 }}>
                  <div style={{ fontSize:11, fontWeight:800, textTransform:'uppercase', letterSpacing:'.1em', color:course.color, marginBottom:12 }}>
                    {lbl ? 'Verificación de Conocimiento' : 'Knowledge Check'}
                  </div>
                  <div style={{ fontSize:15, fontWeight:700, color:'var(--t-text)', marginBottom:16, lineHeight:1.4 }}>{quiz.question}</div>
                  <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                    {quiz.options.map((opt, i) => {
                      let bg = 'var(--t-surface-2)', border = '1px solid var(--t-line)', color = 'var(--t-text)'
                      if (selectedOpt === i && !quizSubmitted) { bg = `${course.color}18`; border = `1px solid ${course.color}`; color = course.color }
                      if (quizSubmitted) {
                        if (i === quiz.correct)                            { bg = 'rgba(34,197,94,0.12)'; border = '1px solid var(--t-success)'; color = 'var(--t-success)' }
                        else if (i === selectedOpt && i !== quiz.correct)  { bg = 'rgba(239,68,68,0.1)';  border = '1px solid var(--t-danger)';  color = 'var(--t-danger)'  }
                        else                                               { bg = 'var(--t-surface-2)';   border = '1px solid var(--t-line)';    color = 'var(--t-text-faint)' }
                      }
                      return (
                        <div key={i} onClick={() => { if (!quizSubmitted) setSelectedOpt(i) }}
                          style={{ background:bg, border, color, padding:'12px 16px', cursor: quizSubmitted ? 'default' : 'pointer', display:'flex', alignItems:'center', gap:12, fontSize:14 }}>
                          <span style={{ fontWeight:700, width:20, flexShrink:0 }}>{String.fromCharCode(65+i)}.</span>
                          <span>{opt}</span>
                          {quizSubmitted && i === quiz.correct    && <span style={{ marginLeft:'auto' }}>✓</span>}
                          {quizSubmitted && i === selectedOpt && i !== quiz.correct && <span style={{ marginLeft:'auto' }}>✗</span>}
                        </div>
                      )
                    })}
                  </div>
                  {!quizSubmitted && (
                    <button onClick={() => { if (selectedOpt !== null) { setQuizSubmitted(true); setQuizResults(r => ({ ...r, [lessonIdx]: selectedOpt === quiz.correct })) } }} disabled={selectedOpt === null}
                      style={{ marginTop:14, padding:'8px 20px', fontWeight:700, fontSize:12, background: selectedOpt !== null ? course.color : 'var(--t-line)', color: selectedOpt !== null ? '#000' : 'var(--t-text-muted)', border:'none', cursor: selectedOpt !== null ? 'pointer' : 'not-allowed', fontFamily:'var(--font-sans)' }}>
                      {lbl ? 'Verificar Respuesta' : 'Check Answer'}
                    </button>
                  )}
                  {quizSubmitted && (
                    <div style={{ marginTop:12, fontSize:13, color: selectedOpt === quiz.correct ? 'var(--t-success)' : 'var(--t-danger)', fontWeight:700 }}>
                      {selectedOpt === quiz.correct
                        ? (lbl ? '¡Correcto! Continúa.' : 'Correct! Continue to the next lesson.')
                        : (lbl ? `Incorrecto. Respuesta: ${quiz.options[quiz.correct]}` : `Incorrect. Correct answer: ${quiz.options[quiz.correct]}`)}
                    </div>
                  )}
                </div>
              )}
              {isLocked && <div style={{ textAlign:'center', padding:'16px 0', color:'var(--t-text-faint)', fontSize:13 }}>{lbl ? 'Completa las lecciones anteriores primero.' : 'Complete previous lessons first.'}</div>}
            </>
          )}
        </div>
      </div>

      {/* Footer */}
      {!showComplete && lessons.length > 0 && (
        <div style={{ background:'var(--t-surface)', borderTop:'1px solid var(--t-line)', padding:'14px 24px', display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0 }}>
          <button onClick={() => { if (lessonIdx > 0) { setLessonIdx(i => i - 1); setSelectedOpt(null); setQuizSubmitted(false) } }} disabled={lessonIdx === 0}
            style={{ padding:'8px 20px', fontWeight:700, fontSize:12, cursor: lessonIdx === 0 ? 'not-allowed' : 'pointer', background:'var(--t-surface-2)', border:'1px solid var(--t-line)', color: lessonIdx === 0 ? 'var(--t-text-faint)' : 'var(--t-text)', fontFamily:'var(--font-sans)' }}>
            ← {lbl ? 'Anterior' : 'Prev'}
          </button>
          <div style={{ fontSize:12, color:'var(--t-text-muted)' }}>{lessonIdx + 1} / {totalL}</div>
          <button onClick={handleNext} disabled={isLocked || (hasQuiz && !quizSubmitted) || saving}
            style={{ padding:'8px 20px', fontWeight:700, fontSize:12, cursor: (isLocked||(hasQuiz&&!quizSubmitted)||saving) ? 'not-allowed' : 'pointer', background: (isLocked||(hasQuiz&&!quizSubmitted)) ? 'var(--t-line)' : 'var(--t-accent)', color: (isLocked||(hasQuiz&&!quizSubmitted)) ? 'var(--t-text-faint)' : '#000', border:'none', fontFamily:'var(--font-sans)' }}>
            {saving ? 'Saving…' : isLast ? (lbl ? 'Finalizar →' : 'Finish Course →') : (lbl ? 'Siguiente →' : 'Next →')}
          </button>
        </div>
      )}
    </div>
  )
}

// ── Course Detail panel (tab 3 equivalent as side panel) ──────────────────────
function CourseDetailPanel({ course, myProg, onClose, onStart }) {
  if (!course) return null
  const pct  = myProg?.pct || 0
  const cert = myProg?.certified || false
  const days = daysUntil(course.dueDate)
  const objs = [
    'Understand core concepts and best practices',
    'Apply learned skills in real store scenarios',
    'Pass the knowledge check with 70%+',
    `Earn your ${getConfig().company_name || 'company'} Academy certification badge`,
  ]
  return (
    <div style={{ position:'fixed', inset:0, zIndex:8000, background:'rgba(0,0,0,0.7)', display:'flex', justifyContent:'flex-end' }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()}
        style={{ width: Math.min(520, window.innerWidth), background:'var(--t-bg)', borderLeft:'1px solid var(--t-line)', display:'flex', flexDirection:'column', overflow:'hidden' }}>
        {/* Header */}
        <div style={{ background:`linear-gradient(135deg,${course.color}55,${course.color}22)`, borderBottom:'1px solid var(--t-line)', padding:'20px 20px 16px' }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:12 }}>
            <span style={{ fontSize:36 }}>{course.icon}</span>
            <button onClick={onClose} style={{ background:'rgba(255,255,255,0.1)', border:'none', color:'var(--t-text)', padding:'4px 10px', cursor:'pointer', fontFamily:'var(--font-sans)', fontWeight:700, fontSize:13 }}>✕</button>
          </div>
          <div style={{ fontWeight:800, fontSize:17, color:'var(--t-text)', marginBottom:4 }}>{course.title}</div>
          <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
            <span className="badge blue" style={{ background:`${course.color}22`, color:course.color, borderColor:`${course.color}55` }}>{course.category}</span>
            <span className="badge blue">{course.level}</span>
            {course.required ? <span className={days !== null && days <= 7 && !cert ? 'badge red' : 'badge amber'}>Required{days !== null ? ` · ${days}d` : ''}</span> : <span className="badge blue">Optional</span>}
            {cert && <span className="badge green">Certified</span>}
          </div>
        </div>

        <div style={{ flex:1, overflow:'auto', padding:20, display:'flex', flexDirection:'column', gap:16 }}>
          {/* Stats row */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:8 }}>
            <div style={{ background:'var(--t-surface)', border:'1px solid var(--t-line)', padding:'10px 12px', textAlign:'center' }}>
              <div style={{ fontSize:16, fontWeight:800, color:'var(--t-text)' }}>{fmtDuration(course.duration)}</div>
              <div style={{ fontSize:10, color:'var(--t-text-faint)', marginTop:2 }}>Duration</div>
            </div>
            <div style={{ background:'var(--t-surface)', border:'1px solid var(--t-line)', padding:'10px 12px', textAlign:'center' }}>
              <div style={{ fontSize:16, fontWeight:800, color:'#fbbf24' }}>{course.lessons?.length || 0}</div>
              <div style={{ fontSize:10, color:'var(--t-text-faint)', marginTop:2 }}>Lessons</div>
            </div>
            <div style={{ background:'var(--t-surface)', border:'1px solid var(--t-line)', padding:'10px 12px', textAlign:'center' }}>
              <div style={{ fontSize:16, fontWeight:800, color:'var(--t-accent)' }}>{course.enrolled || 0}</div>
              <div style={{ fontSize:10, color:'var(--t-text-faint)', marginTop:2 }}>Enrolled</div>
            </div>
          </div>

          {/* Progress */}
          <div style={{ background:'var(--t-surface)', border:'1px solid var(--t-line)', padding:'12px 14px' }}>
            <div style={{ display:'flex', justifyContent:'space-between', fontSize:11, color:'var(--t-text-muted)', marginBottom:8 }}>
              <span>Your Progress</span>
              <span style={{ fontWeight:800, color: cert ? 'var(--t-success)' : 'var(--t-text)' }}>{pct}%</span>
            </div>
            <ProgressBar pct={pct} color={cert ? 'var(--t-success)' : course.color} />
            {cert && myProg?.score && <div style={{ fontSize:11, color:'var(--t-success)', marginTop:8 }}>Quiz score: {myProg.score}% · Certificate earned</div>}
          </div>

          {/* Learning objectives */}
          <div>
            <div style={{ fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'.08em', color:'var(--t-text-muted)', marginBottom:10 }}>Learning Objectives</div>
            {objs.map((o, i) => (
              <div key={i} style={{ display:'flex', gap:10, alignItems:'flex-start', marginBottom:8 }}>
                <div style={{ width:16, height:16, borderRadius:'50%', background:cert ? 'var(--t-success)' : `${course.color}33`, border:`1px solid ${cert ? 'var(--t-success)' : course.color}`, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, marginTop:1 }}>
                  {cert && <span style={{ fontSize:9, color:'var(--t-success)' }}>✓</span>}
                </div>
                <div style={{ fontSize:13, color:'var(--t-text)', lineHeight:1.4 }}>{o}</div>
              </div>
            ))}
          </div>

          {/* Modules */}
          {course.lessons?.length > 0 && (
            <div>
              <div style={{ fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'.08em', color:'var(--t-text-muted)', marginBottom:10 }}>Course Modules ({course.lessons.length})</div>
              {course.lessons.map((l, i) => (
                <div key={i} style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 10px', background: i < (myProg?.lessonsCompleted || 0) ? `${course.color}11` : 'var(--t-surface)', border:'1px solid var(--t-line)', marginBottom:4 }}>
                  <div style={{ width:20, height:20, borderRadius:'50%', background: i < (myProg?.lessonsCompleted || 0) ? course.color : 'var(--t-line)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                    <span style={{ fontSize:10, fontWeight:800, color: i < (myProg?.lessonsCompleted || 0) ? '#000' : 'var(--t-text-faint)' }}>{i + 1}</span>
                  </div>
                  <div style={{ flex:1, fontSize:12, color:'var(--t-text)', lineHeight:1.3 }}>{l.title}</div>
                  {l.quiz && <span className="badge blue" style={{ fontSize:9 }}>Quiz</span>}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer CTA */}
        <div style={{ padding:'14px 20px', borderTop:'1px solid var(--t-line)', background:'var(--t-surface)' }}>
          <button onClick={() => onStart(course)}
            style={{ width:'100%', padding:'11px', fontWeight:700, fontSize:13, cursor:'pointer', background: cert ? 'transparent' : course.color, color: cert ? course.color : '#000', border:`1px solid ${course.color}`, fontFamily:'var(--font-sans)', letterSpacing:'.04em' }}>
            {cert ? 'Review Course' : pct > 0 ? 'Continue Course' : 'Start Course'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function Academy() {
  const { session }     = useAuth()
  const { locationIds } = useScope()

  // Flat session accessor (sessionStorage 'vip_session') — resilient fallback for
  // person identity and node scope when the context hasn't hydrated yet.
  // Memoized once: getSession() returns a fresh object each call.
  const flatSession = useMemo(() => getSession(), [])

  const personId = session?.person?.id || flatSession.id || null
  const fullName = session?.person?.full_name || flatSession.display_name || flatSession.full_name || ''
  const roleName = session?.person?.role_name || flatSession.role_name || ''
  const isKH     = roleIsKeyholder(roleName)
  const isHRUser = roleIsHR(roleName)

  // ── State ──────────────────────────────────────────────────────────────────
  const [lang,          setLang]          = useState(() => { try { return localStorage.getItem('vip_academy_lang') || 'en' } catch { return 'en' } })
  const [tab,           setTab]           = useState('my-academy')
  const [progress,      setProgress]      = useState({})
  const [loading,       setLoading]       = useState(true)
  const [activeOverlay, setActiveOverlay] = useState(null)
  const [detailCourse,  setDetailCourse]  = useState(null)
  const [catFilter,     setCatFilter]     = useState('All')
  const [levelFilter,   setLevelFilter]   = useState('All')
  const [reqFilter,     setReqFilter]     = useState('All')  // All | Required | Optional
  const [searchQ,       setSearchQ]       = useState('')
  const [manageView,    setManageView]    = useState('courses') // courses | enrollments | add
  const [newCourse,     setNewCourse]     = useState({ title:'', category:'Product Knowledge', duration:30, required:false, dueDate:'', level:'Beginner' })
  const [editingCourse, setEditingCourse] = useState(null)

  // ── Data (all live) ──────────────────────────────────────────────────────────
  const [dbCourses,  setDbCourses]  = useState([])   // catalog from academy_courses_list
  const [lessonMap,  setLessonMap]  = useState({})   // id → bundled lesson content
  const [stats,      setStats]      = useState(null) // academy_stats payload
  const [error,      setError]      = useState('')

  const nodeIds = useMemo(() => {
    if (locationIds && locationIds.length) return locationIds
    return (flatSession.nodes || []).map(n => n.id).filter(Boolean)
  }, [locationIds, flatSession])

  // Bundled bilingual lesson content (curriculum text/quizzes, not data).
  useEffect(() => {
    import('./Academy.courses.js')
      .then(m => {
        const map = {}
        for (const c of m.buildCourses(lang)) map[c.id] = c.lessons
        setLessonMap(map)
      })
      .catch(() => setLessonMap({}))
  }, [lang])

  // Catalog metadata (DB) merged with bundled lesson content.
  const mergedCourses = useMemo(
    () => dbCourses.map(c => ({ ...c, lessons: lessonMap[c.id] || [] })),
    [dbCourses, lessonMap]
  )
  const courses = mergedCourses

  // ── Load catalog + progress + team stats ─────────────────────────────────────
  const loadAll = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const [cl, st] = await Promise.all([
        sb.rpc('academy_courses_list', { p_node_ids: nodeIds, p_person_id: personId || null }),
        sb.rpc('academy_stats', { p_node_ids: nodeIds }),
      ])
      if (cl.error) throw cl.error
      if (st.error) throw st.error
      const list = (cl.data && cl.data.courses) || []
      setDbCourses(list)
      const prog = {}
      for (const c of list) {
        if (c.my) prog[c.id] = {
          lessonsCompleted: c.my.lessonsCompleted || 0,
          pct:              c.my.pct || 0,
          certified:        !!c.my.certified,
          score:            c.my.score ?? null,
          enrolledAt:       c.my.enrolledAt || null,
        }
      }
      setProgress(prog)
      setStats(st.data || null)
    } catch (e) {
      console.error('academy load failed', e)
      setError(e?.message || 'Could not load the Academy.')
      setDbCourses([]); setProgress({}); setStats(null)
    } finally {
      setLoading(false)
    }
  }, [nodeIds, personId])

  useEffect(() => { loadAll() }, [loadAll])
  useEffect(() => { try { localStorage.setItem('vip_academy_lang', lang) } catch {} }, [lang])

  // ── Save progress (real write → refetch) ─────────────────────────────────────
  const persistProgress = useCallback(async (courseId, nextProg) => {
    if (!personId) return
    const p = nextProg[courseId]
    const { data, error: err } = await sb.rpc('academy_log_progress', {
      p_person_id:        personId,
      p_course_id:        courseId,
      p_lessons_completed:p.lessonsCompleted || 0,
      p_pct:              p.pct || 0,
      p_certified:        !!p.certified,
      p_score:            p.score ?? null,
      p_person_name:      fullName,
      p_node_id:          nodeIds[0] || null,
    })
    if (err || (data && data.ok === false)) {
      console.error('academy_log_progress failed', err || data)
      setError('Progress could not be saved. Please try again.')
    }
  }, [personId, fullName, nodeIds])

  const saveProgress = useCallback(async (courseId, lessonIdx, certified, score) => {
    const course     = courses.find(c => c.id === courseId)
    const totalL     = course?.lessons?.length || 1
    const newLessons = Math.max((progress[courseId]?.lessonsCompleted || 0), lessonIdx + 1)
    const newPct     = Math.round((Math.min(newLessons, totalL) / totalL) * 100)
    const updated    = {
      ...progress,
      [courseId]: {
        lessonsCompleted: newLessons,
        certified: certified || progress[courseId]?.certified || false,
        score: score ?? progress[courseId]?.score ?? null,
        pct: newPct,
        enrolledAt: progress[courseId]?.enrolledAt || new Date().toISOString(),
      }
    }
    setProgress(updated)
    await persistProgress(courseId, updated)
    return updated
  }, [progress, courses, persistProgress])

  const handleLessonComplete = useCallback(async (courseId, lessonIdx) => {
    await saveProgress(courseId, lessonIdx, false, null)
  }, [saveProgress])

  const handleCertify = useCallback(async (courseId, score) => {
    const course = courses.find(c => c.id === courseId)
    const totalL = course?.lessons?.length || 1
    const updated = { ...progress, [courseId]: {
      ...(progress[courseId] || {}),
      lessonsCompleted: totalL, certified: true, score: score ?? progress[courseId]?.score ?? null, pct: 100,
      enrolledAt: progress[courseId]?.enrolledAt || new Date().toISOString(),
    } }
    setProgress(updated)
    await persistProgress(courseId, updated)
    loadAll()  // refresh team stats/leaderboard after a new certification
  }, [progress, courses, persistProgress, loadAll])

  // ── HR course CRUD (real writes → refetch) ───────────────────────────────────
  const [savingCourse, setSavingCourse] = useState(false)
  const saveCourse = useCallback(async (payload, existingId) => {
    setSavingCourse(true); setError('')
    try {
      const { data, error: err } = await sb.rpc('academy_course_upsert', {
        p_id:       existingId || null,
        p_title:    payload.title,
        p_category: payload.category,
        p_level:    payload.level,
        p_duration: payload.duration ? Number(payload.duration) : 30,
        p_required: !!payload.required,
        p_due_date: payload.dueDate || null,
        p_color:    payload.color || '#00e5ff',
        p_icon:     payload.icon || '🎓',
        p_node_id:  null,
        p_actor:    personId || null,
      })
      if (err) throw err
      if (data && data.ok === false) throw new Error(data.error || 'Could not save course.')
      await loadAll()
      return true
    } catch (e) {
      setError(e?.message || 'Could not save the course.')
      return false
    } finally {
      setSavingCourse(false)
    }
  }, [personId, loadAll])

  const deleteCourse = useCallback(async (courseId) => {
    setError('')
    const { data, error: err } = await sb.rpc('academy_course_delete', { p_id: courseId })
    if (err || (data && data.ok === false)) {
      setError('Could not remove the course.')
      return
    }
    await loadAll()
  }, [loadAll])

  // ── Derived KPI data ───────────────────────────────────────────────────────
  const kpis            = stats?.kpis || {}
  const totalCourses    = kpis.total_courses ?? courses.length
  const mandatoryCnt    = kpis.mandatory ?? courses.filter(c => c.required).length
  const myCertifiedList = courses.filter(c => progress[c.id]?.certified)
  const myCertCnt       = myCertifiedList.length
  const myInProgress    = courses.filter(c => { const p = progress[c.id]; return p && p.pct > 0 && p.pct < 100 && !p.certified })
  const myPcts          = courses.map(c => progress[c.id]?.pct || 0)
  const myAvgPct        = myPcts.length ? Math.round(myPcts.reduce((a, b) => a + b, 0) / myPcts.length) : 0
  const myOverdue       = courses.filter(c => { const days = daysUntil(c.dueDate); return c.required && days !== null && days <= 0 && !progress[c.id]?.certified })
  const myScores        = courses.map(c => progress[c.id]?.score).filter(v => v != null)
  const myAvgScore      = myScores.length ? Math.round(myScores.reduce((a, b) => a + b, 0) / myScores.length) : 0
  const myXP            = courses.reduce((sum, c) => sum + (progress[c.id]?.pct || 0) * 2 + (progress[c.id]?.certified ? 150 : 0), 0)

  // Global (team) stats — all live from academy_stats.
  const totalCertsIssued = kpis.certs_issued ?? 0
  const locationStats    = stats?.locations || []
  const leaderboard      = (stats?.leaderboard || []).map(e => ({
    id: e.person_id, name: e.name, location: e.location || '—', role: e.role || '—',
    certs: e.certs || 0, xp: e.xp || 0, quizAvg: e.quizAvg || 0,
  }))
  const enrollments      = stats?.enrollments || []
  const mostPopular      = courses.reduce((a, b) => ((a?.enrolled || 0) >= (b?.enrolled || 0) ? a : b), courses[0] || null)

  const teamEnrolledMonth = kpis.enrolled_month ?? 0
  const teamCompleteMonth = kpis.completed_month ?? 0
  const totalXP           = leaderboard.reduce((s, e) => s + (e.xp || 0), 0)
  const newThisMonth      = kpis.new_this_month ?? 0

  // Filtered library
  const filteredLib = useMemo(() => {
    return courses.filter(c => {
      if (catFilter !== 'All' && c.category !== catFilter) return false
      if (levelFilter !== 'All' && c.level !== levelFilter) return false
      if (reqFilter === 'Required' && !c.required) return false
      if (reqFilter === 'Optional' && c.required)  return false
      if (searchQ && !c.title.toLowerCase().includes(searchQ.toLowerCase()) && !c.category.toLowerCase().includes(searchQ.toLowerCase())) return false
      return true
    })
  }, [courses, catFilter, levelFilter, reqFilter, searchQ])

  // ── Tabs ───────────────────────────────────────────────────────────────────
  const tabs = [
    { id:'my-academy', label:'My Academy' },
    { id:'library',    label:'Course Library' },
    { id:'leaderboard',label:'Leaderboard' },
    ...(isHRUser ? [{ id:'manage', label:'Manage' }] : []),
  ]

  // ── Loading ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{ display:'flex', alignItems:'center', justifyContent:'center', padding:80, color:'var(--t-text-muted)' }}>
        Loading Academy…
      </div>
    )
  }

  // ── Forensic KPI Panel ─────────────────────────────────────────────────────
  const kpiPanel = (
    <div style={{ marginBottom: 24 }}>
      {/* Row 1 — Platform overview */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(6,1fr)', gap:8, marginBottom:8 }}>
        <KTile label="Total Courses"        value={totalCourses}      sub="in catalog" />
        <KTile label="Mandatory"            value={mandatoryCnt}      sub="required courses"   color="var(--t-warn)" />
        <KTile label="Enrolled This Month"  value={teamEnrolledMonth} sub="team-wide"          color="var(--t-accent)" />
        <KTile label="Completions / Month"  value={teamCompleteMonth} sub="certified"          color="var(--t-success)" />
        <KTile label="Certs Issued Total"   value={totalCertsIssued}  sub="all employees"     color="var(--t-success)" />
        <KTile label="New This Month"       value={newThisMonth}      sub="new courses"       color="var(--t-accent)" />
      </div>

      {/* Row 2 — My stats */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(6,1fr)', gap:8, marginBottom:8 }}>
        <KTile label="My Completion %"    value={`${myAvgPct}%`}   sub={`${myCertCnt} certified`} color={myAvgPct >= 70 ? 'var(--t-success)' : 'var(--t-warn)'} alert={myAvgPct < 50 ? 'amber' : undefined} />
        <KTile label="Overdue Mandatory"  value={myOverdue.length} sub="past due date"           color={myOverdue.length > 0 ? 'var(--t-danger)' : 'var(--t-success)'} alert={myOverdue.length > 0 ? 'red' : undefined} />
        <KTile label="Avg Quiz Score"     value={myAvgScore ? `${myAvgScore}%` : '—'} sub="my quizzes" color="var(--t-text)" />
        <KTile label="My XP Earned"       value={myXP.toLocaleString()} sub="experience points" color="var(--t-accent)" />
        <KTile label="Most Popular"       value={mostPopular?.enrolled || 0} sub={mostPopular ? mostPopular.title.slice(0,18)+'…' : 'no enrollments yet'} color="var(--t-text)" />
        <KTile label="Team XP Total"      value={Math.round(totalXP/1000)+'k'}  sub="all employees"  color="var(--t-accent)" />
      </div>

      {/* Row 3 — Location table */}
      <div style={{ background:'var(--t-surface)', border:'1px solid var(--t-line)', overflow:'hidden' }}>
        <div style={{ padding:'8px 14px', background:'var(--t-surface-2)', borderBottom:'1px solid var(--t-line)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div style={{ fontSize:10, fontWeight:700, letterSpacing:'.08em', textTransform:'uppercase', color:'var(--t-text-muted)' }}>Location Training Breakdown</div>
          <span className="badge blue" style={{ fontSize:9 }}>Live</span>
        </div>
        <div style={{ overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
            <thead>
              <tr style={{ borderBottom:'1px solid var(--t-line)' }}>
                {['Location','Employees','Enrolled','Completed','Comp %','Overdue'].map(h => (
                  <th key={h} style={{ padding:'8px 12px', textAlign:h==='Location'?'left':'center', fontSize:10, fontWeight:700, letterSpacing:'.06em', textTransform:'uppercase', color:'var(--t-text-muted)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {locationStats.map((ls, i) => (
                <tr key={ls.loc} style={{ borderBottom:i<locationStats.length-1?'1px solid var(--t-line)':undefined, background: i%2===0 ? 'transparent' : 'var(--t-surface-2)' }}>
                  <td style={{ padding:'9px 12px', fontWeight:700, color:'var(--t-text)', fontSize:12 }}>{ls.loc}</td>
                  <td style={{ padding:'9px 12px', textAlign:'center', color:'var(--t-text-muted)' }}>{ls.emps}</td>
                  <td style={{ padding:'9px 12px', textAlign:'center', color:'var(--t-text-muted)' }}>{ls.enrolled}</td>
                  <td style={{ padding:'9px 12px', textAlign:'center', color:'var(--t-success)', fontWeight:700 }}>{ls.completed}</td>
                  <td style={{ padding:'9px 12px', textAlign:'center' }}>
                    <span style={{ color: ls.compPct >= 70 ? 'var(--t-success)' : ls.compPct >= 40 ? 'var(--t-warn)' : 'var(--t-danger)', fontWeight:800 }}>{ls.compPct}%</span>
                  </td>
                  <td style={{ padding:'9px 12px', textAlign:'center' }}>
                    <span style={{ color: ls.overdue > 0 ? 'var(--t-danger)' : 'var(--t-success)', fontWeight:700 }}>{ls.overdue}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )

  // ── Tab: My Academy ────────────────────────────────────────────────────────
  const tabMyAcademy = (
    <div style={{ display:'flex', flexDirection:'column', gap:20 }}>
      {/* Hero banner */}
      <div style={{ background:`linear-gradient(135deg,#4c1d95 0%,#6d28d9 60%,#7c3aed 100%)`, padding:'24px 28px', display:'flex', alignItems:'center', gap:24, flexWrap:'wrap' }}>
        <div style={{ flex:1, minWidth:200 }}>
          <div style={{ fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'.1em', color:'rgba(255,255,255,0.6)', marginBottom:6 }}>
            {getConfig().company_name || 'Company'} Academy · {fullName || 'Team Member'}
          </div>
          <div style={{ fontSize:28, fontWeight:900, color:'#fff', marginBottom:4, lineHeight:1 }}>
            Level {Math.floor(myCertCnt / 2) + 1}
          </div>
          <div style={{ fontSize:13, color:'rgba(255,255,255,0.75)', marginBottom:12 }}>
            {myXP.toLocaleString()} XP · {myCertCnt} certifications earned
          </div>
          <div style={{ height:8, background:'rgba(255,255,255,0.2)', marginBottom:6 }}>
            <div style={{ height:'100%', width:`${myAvgPct}%`, background:'#fff', transition:'width 0.4s ease' }} />
          </div>
          <div style={{ fontSize:11, color:'rgba(255,255,255,0.6)' }}>{myAvgPct}% overall completion · {myCertCnt}/{totalCourses} courses certified</div>
        </div>
        <div style={{ display:'flex', gap:20, flexShrink:0 }}>
          <div style={{ textAlign:'center' }}>
            <div style={{ fontSize:36, fontWeight:900, color:'#fff', lineHeight:1, fontFamily:'var(--font-mono)' }}>{myCertCnt}</div>
            <div style={{ fontSize:10, color:'rgba(255,255,255,0.6)', marginTop:4, textTransform:'uppercase', letterSpacing:'.06em' }}>Certified</div>
          </div>
          <div style={{ width:1, background:'rgba(255,255,255,0.2)' }} />
          <div style={{ textAlign:'center' }}>
            <div style={{ fontSize:36, fontWeight:900, color:'#fff', lineHeight:1, fontFamily:'var(--font-mono)' }}>{myXP.toLocaleString()}</div>
            <div style={{ fontSize:10, color:'rgba(255,255,255,0.6)', marginTop:4, textTransform:'uppercase', letterSpacing:'.06em' }}>XP</div>
          </div>
        </div>
      </div>

      {/* Overdue alert */}
      {myOverdue.length > 0 && (
        <div style={{ background:'rgba(239,68,68,0.08)', border:'1px solid var(--t-danger)', padding:'14px 16px', display:'flex', gap:12, alignItems:'flex-start' }}>
          <span style={{ fontSize:20, flexShrink:0 }}>⚠️</span>
          <div>
            <div style={{ fontWeight:700, fontSize:13, color:'var(--t-danger)', marginBottom:4 }}>Overdue Mandatory Courses</div>
            <div style={{ fontSize:12, color:'var(--t-text-muted)' }}>{myOverdue.map(c => c.title).join(' · ')}</div>
          </div>
        </div>
      )}

      {/* Active / in-progress courses */}
      {myInProgress.length > 0 && (
        <div>
          <div style={{ fontSize:11, fontWeight:800, letterSpacing:'.1em', textTransform:'uppercase', color:'var(--t-accent)', marginBottom:12, borderBottom:'1px solid var(--t-line)', paddingBottom:8 }}>
            Continue Where You Left Off ({myInProgress.length})
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(300px,1fr))', gap:12 }}>
            {myInProgress.map(course => {
              const mc = mergedCourses.find(c => c.id === course.id) || course
              return (
                <CourseCard key={course.id} course={mc} myPct={progress[course.id]?.pct} myCert={progress[course.id]?.certified} lang={lang}
                  onStart={c => setActiveOverlay(c)} onSelect={c => setDetailCourse(c)} />
              )
            })}
          </div>
        </div>
      )}

      {/* Required / mandatory */}
      <div>
        <div style={{ fontSize:11, fontWeight:800, letterSpacing:'.1em', textTransform:'uppercase', color:'var(--t-warn)', marginBottom:12, borderBottom:'1px solid var(--t-line)', paddingBottom:8 }}>
          Mandatory Courses ({mandatoryCnt})
        </div>
        <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
          {courses.filter(c => c.required).map(course => {
            const p    = progress[course.id]
            const days = daysUntil(course.dueDate)
            const mc   = mergedCourses.find(x => x.id === course.id) || course
            return (
              <div key={course.id} style={{ background:'var(--t-surface)', border:`1px solid ${p?.certified ? 'var(--t-success)' : days !== null && days <= 3 ? 'var(--t-danger)' : 'var(--t-line)'}`, padding:'12px 14px', display:'flex', alignItems:'center', gap:14 }}>
                <span style={{ fontSize:22, flexShrink:0 }}>{course.icon}</span>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontWeight:700, fontSize:13, color:'var(--t-text)', marginBottom:2 }}>{course.title}</div>
                  <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                    <div style={{ flex:1, height:3, background:'var(--t-line)', maxWidth:160 }}>
                      <div style={{ height:'100%', width:`${p?.pct || 0}%`, background: p?.certified ? 'var(--t-success)' : course.color }} />
                    </div>
                    <span style={{ fontSize:10, color:'var(--t-text-faint)' }}>{p?.pct || 0}%</span>
                  </div>
                </div>
                {days !== null && !p?.certified && (
                  <span className={days <= 0 ? 'badge red' : days <= 7 ? 'badge amber' : 'badge blue'} style={{ flexShrink:0 }}>
                    {days <= 0 ? 'Overdue' : `${days}d left`}
                  </span>
                )}
                {p?.certified && <span className="badge green" style={{ flexShrink:0 }}>Done</span>}
                <button onClick={() => setActiveOverlay(mc)}
                  style={{ padding:'6px 14px', fontSize:11, fontWeight:700, cursor:'pointer', background: p?.certified ? 'transparent' : course.color, color: p?.certified ? course.color : '#000', border:`1px solid ${course.color}`, fontFamily:'var(--font-sans)', flexShrink:0 }}>
                  {p?.certified ? 'Review' : p?.pct > 0 ? 'Continue' : 'Start'}
                </button>
              </div>
            )
          })}
        </div>
      </div>

      {/* Recently completed */}
      {myCertifiedList.length > 0 && (
        <div>
          <div style={{ fontSize:11, fontWeight:800, letterSpacing:'.1em', textTransform:'uppercase', color:'var(--t-success)', marginBottom:12, borderBottom:'1px solid var(--t-line)', paddingBottom:8 }}>
            Certificates Earned ({myCertCnt})
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(240px,1fr))', gap:10 }}>
            {myCertifiedList.map(course => (
              <div key={course.id} onClick={() => { const mc = mergedCourses.find(x => x.id === course.id) || course; setDetailCourse(mc) }}
                style={{ background:'var(--t-surface)', border:'1px solid var(--t-success)', padding:'12px 14px', cursor:'pointer', display:'flex', gap:12, alignItems:'center' }}>
                <div style={{ width:36, height:36, borderRadius:'50%', background:'var(--t-success)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                  <span style={{ fontSize:18 }}>🏆</span>
                </div>
                <div style={{ minWidth:0 }}>
                  <div style={{ fontWeight:700, fontSize:12, color:'var(--t-text)', marginBottom:2, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{course.title}</div>
                  <div style={{ fontSize:10, color:'var(--t-success)' }}>{progress[course.id]?.score != null ? `Score: ${progress[course.id].score}%` : 'Certified'}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recommended next */}
      <div>
        <div style={{ fontSize:11, fontWeight:800, letterSpacing:'.1em', textTransform:'uppercase', color:'var(--t-text-muted)', marginBottom:12, borderBottom:'1px solid var(--t-line)', paddingBottom:8 }}>
          Recommended Next
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(300px,1fr))', gap:12 }}>
          {courses.filter(c => !progress[c.id]?.certified && (progress[c.id]?.pct || 0) === 0).slice(0, 3).map(course => {
            const mc = mergedCourses.find(x => x.id === course.id) || course
            return (
              <CourseCard key={course.id} course={mc} myPct={0} myCert={false} lang={lang}
                onStart={c => setActiveOverlay(c)} onSelect={c => setDetailCourse(c)} />
            )
          })}
        </div>
      </div>
    </div>
  )

  // ── Tab: Course Library ────────────────────────────────────────────────────
  const tabLibrary = (
    <div>
      {/* Filters */}
      <div style={{ display:'flex', gap:8, marginBottom:16, flexWrap:'wrap', alignItems:'center' }}>
        <input value={searchQ} onChange={e => setSearchQ(e.target.value)} placeholder="Search courses…"
          style={{ flex:'1 1 200px', minWidth:160, padding:'8px 12px', background:'var(--t-surface)', border:'1px solid var(--t-line)', color:'var(--t-text)', fontFamily:'var(--font-sans)', fontSize:12 }} />
        <select value={catFilter} onChange={e => setCatFilter(e.target.value)}
          style={{ padding:'8px 10px', background:'var(--t-surface)', border:'1px solid var(--t-line)', color:'var(--t-text)', fontFamily:'var(--font-sans)', fontSize:12, cursor:'pointer' }}>
          {CATEGORIES.map(c => <option key={c}>{c}</option>)}
        </select>
        <select value={levelFilter} onChange={e => setLevelFilter(e.target.value)}
          style={{ padding:'8px 10px', background:'var(--t-surface)', border:'1px solid var(--t-line)', color:'var(--t-text)', fontFamily:'var(--font-sans)', fontSize:12, cursor:'pointer' }}>
          {LEVELS.map(l => <option key={l}>{l}</option>)}
        </select>
        <select value={reqFilter} onChange={e => setReqFilter(e.target.value)}
          style={{ padding:'8px 10px', background:'var(--t-surface)', border:'1px solid var(--t-line)', color:'var(--t-text)', fontFamily:'var(--font-sans)', fontSize:12, cursor:'pointer' }}>
          {['All','Required','Optional'].map(r => <option key={r}>{r}</option>)}
        </select>
        <div style={{ fontSize:12, color:'var(--t-text-muted)', whiteSpace:'nowrap' }}>{filteredLib.length} courses</div>
      </div>

      {filteredLib.length === 0 ? (
        <div style={{ textAlign:'center', padding:64, color:'var(--t-text-muted)', fontSize:14 }}>No courses match your filters.</div>
      ) : (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(300px,1fr))', gap:14 }}>
          {filteredLib.map(course => {
            const mc = mergedCourses.find(x => x.id === course.id) || course
            return (
              <CourseCard key={course.id} course={mc} myPct={progress[course.id]?.pct} myCert={progress[course.id]?.certified} lang={lang}
                onStart={c => setActiveOverlay(c)} onSelect={c => setDetailCourse(c)} />
            )
          })}
        </div>
      )}
    </div>
  )

  // ── Tab: Leaderboard ───────────────────────────────────────────────────────
  const board = leaderboard
  const tabLeaderboard = (
    <div style={{ display:'flex', flexDirection:'column', gap:20 }}>
      {/* Location ranking */}
      <div>
        <div style={{ fontSize:11, fontWeight:800, letterSpacing:'.1em', textTransform:'uppercase', color:'var(--t-accent)', marginBottom:12, borderBottom:'1px solid var(--t-line)', paddingBottom:8 }}>
          Location Rankings by Completion %
        </div>
        {locationStats.length === 0 && (
          <div style={{ background:'var(--t-surface)', border:'1px solid var(--t-line)', padding:32, textAlign:'center', color:'var(--t-text-faint)', fontSize:13 }}>No location activity yet.</div>
        )}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(220px,1fr))', gap:10 }}>
          {[...locationStats].sort((a, b) => b.compPct - a.compPct).map((ls, i) => (
            <div key={ls.node_id || ls.loc} style={{ background:'var(--t-surface)', border:'1px solid var(--t-line)', padding:'14px 16px', position:'relative', overflow:'hidden' }}>
              <div style={{ position:'absolute', top:0, left:0, bottom:0, width:`${ls.compPct}%`, background:`${['#fbbf24','#94a3b8','#cd7f32','#60a5fa'][i]}22`, transition:'width 0.4s ease' }} />
              <div style={{ position:'relative' }}>
                <div style={{ fontWeight:800, fontSize:15, color:'var(--t-text)', marginBottom:4 }}>
                  {['🥇','🥈','🥉','4️⃣'][i]} {ls.loc}
                </div>
                <div style={{ fontSize:28, fontWeight:900, color: ls.compPct >= 70 ? 'var(--t-success)' : 'var(--t-warn)', lineHeight:1, marginBottom:4, fontFamily:'var(--font-mono)' }}>{ls.compPct}%</div>
                <div style={{ fontSize:11, color:'var(--t-text-faint)' }}>{ls.completed} certs · {ls.overdue} overdue</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Top 10 employees */}
      <div>
        <div style={{ fontSize:11, fontWeight:800, letterSpacing:'.1em', textTransform:'uppercase', color:'var(--t-accent)', marginBottom:12, borderBottom:'1px solid var(--t-line)', paddingBottom:8 }}>
          Top 10 — Most Certifications This Month
        </div>
        <div style={{ background:'var(--t-surface)', border:'1px solid var(--t-line)', overflow:'hidden' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
            <thead>
              <tr style={{ borderBottom:'1px solid var(--t-line)', background:'var(--t-surface-2)' }}>
                {['#','Name','Location','Role','Certs','XP','Quiz Avg'].map(h => (
                  <th key={h} style={{ padding:'9px 12px', textAlign: h==='#'||h==='Certs'||h==='XP'||h==='Quiz Avg' ? 'center' : 'left', fontSize:10, fontWeight:700, letterSpacing:'.06em', textTransform:'uppercase', color:'var(--t-text-muted)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {board.length === 0 && (
                <tr><td colSpan={7} style={{ padding:'28px 12px', textAlign:'center', color:'var(--t-text-faint)' }}>No certifications recorded yet.</td></tr>
              )}
              {board.slice(0, 10).map((emp, i) => (
                <tr key={emp.id} style={{ borderBottom: i < 9 ? '1px solid var(--t-line)' : undefined, background: i < 3 ? `rgba(251,191,36,0.${3-i})` : i % 2 === 0 ? 'transparent' : 'var(--t-surface-2)' }}>
                  <td style={{ padding:'10px 12px', textAlign:'center', fontWeight:900, color: i === 0 ? '#fbbf24' : i === 1 ? '#94a3b8' : i === 2 ? '#cd7f32' : 'var(--t-text-faint)', fontSize: i < 3 ? 16 : 13 }}>
                    {i < 3 ? ['🥇','🥈','🥉'][i] : i + 1}
                  </td>
                  <td style={{ padding:'10px 12px', fontWeight: i < 3 ? 800 : 600, color:'var(--t-text)' }}>{emp.name}</td>
                  <td style={{ padding:'10px 12px', color:'var(--t-text-muted)', fontSize:12 }}>{emp.location}</td>
                  <td style={{ padding:'10px 12px', color:'var(--t-text-faint)', fontSize:11 }}>{emp.role}</td>
                  <td style={{ padding:'10px 12px', textAlign:'center', fontWeight:800, color:'var(--t-success)', fontFamily:'var(--font-mono)' }}>{emp.certs}</td>
                  <td style={{ padding:'10px 12px', textAlign:'center', color:'var(--t-accent)', fontFamily:'var(--font-mono)' }}>{emp.xp.toLocaleString()}</td>
                  <td style={{ padding:'10px 12px', textAlign:'center', color: emp.quizAvg >= 80 ? 'var(--t-success)' : emp.quizAvg >= 60 ? 'var(--t-warn)' : 'var(--t-danger)', fontFamily:'var(--font-mono)' }}>
                    {emp.quizAvg ? `${emp.quizAvg}%` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Most XP */}
      <div>
        <div style={{ fontSize:11, fontWeight:800, letterSpacing:'.1em', textTransform:'uppercase', color:'var(--t-accent)', marginBottom:12, borderBottom:'1px solid var(--t-line)', paddingBottom:8 }}>
          Most XP Earned
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(200px,1fr))', gap:8 }}>
          {[...board].sort((a, b) => b.xp - a.xp).slice(0, 6).map((emp, i) => (
            <div key={emp.id} style={{ background:'var(--t-surface)', border:'1px solid var(--t-line)', padding:'12px 14px', display:'flex', gap:10, alignItems:'center' }}>
              <div style={{ width:32, height:32, borderRadius:'50%', background:'var(--t-accent)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, fontWeight:900, fontSize:12, color:'#000' }}>
                {i + 1}
              </div>
              <div style={{ minWidth:0 }}>
                <div style={{ fontWeight:700, fontSize:12, color:'var(--t-text)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{emp.name}</div>
                <div style={{ fontSize:11, color:'var(--t-accent)', fontFamily:'var(--font-mono)' }}>{emp.xp.toLocaleString()} XP</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Perfect quiz scores */}
      <div>
        <div style={{ fontSize:11, fontWeight:800, letterSpacing:'.1em', textTransform:'uppercase', color:'var(--t-success)', marginBottom:12, borderBottom:'1px solid var(--t-line)', paddingBottom:8 }}>
          Perfect Quiz Scores (100%)
        </div>
        <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
          {board.filter(e => e.quizAvg === 100).slice(0, 8).map(emp => (
            <div key={emp.id} style={{ background:'rgba(34,197,94,0.1)', border:'1px solid var(--t-success)', padding:'6px 12px', fontSize:12, color:'var(--t-success)', fontWeight:700 }}>
              🎯 {emp.name}
            </div>
          ))}
          {board.filter(e => e.quizAvg === 100).length === 0 && (
            <div style={{ fontSize:12, color:'var(--t-text-faint)' }}>No perfect scores yet this month.</div>
          )}
        </div>
      </div>
    </div>
  )

  // ── Tab: Manage (HR only) ──────────────────────────────────────────────────

  const tabManage = (
    <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
      {/* Sub-nav */}
      <div style={{ display:'flex', gap:0, border:'1px solid var(--t-line)', alignSelf:'flex-start' }}>
        {[['courses','All Courses'],['enrollments','Enrollment Report'],['add','+ Add Course']].map(([v, label]) => (
          <button key={v} onClick={() => setManageView(v)}
            style={{ padding:'8px 18px', fontSize:12, fontWeight:700, background: manageView===v ? 'var(--t-accent)' : 'var(--t-surface)', color: manageView===v ? '#000' : 'var(--t-text-muted)', border:'none', cursor:'pointer', fontFamily:'var(--font-sans)', letterSpacing:'.04em', borderRight: v !== 'add' ? '1px solid var(--t-line)' : undefined }}>
            {label}
          </button>
        ))}
      </div>

      {/* All Courses CRUD */}
      {manageView === 'courses' && (
        <div style={{ background:'var(--t-surface)', border:'1px solid var(--t-line)', overflow:'hidden' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
            <thead>
              <tr style={{ borderBottom:'1px solid var(--t-line)', background:'var(--t-surface-2)' }}>
                {['Course','Category','Level','Duration','Required','Due Date','Enrolled','Avg Comp %','Actions'].map(h => (
                  <th key={h} style={{ padding:'9px 10px', textAlign:'left', fontSize:10, fontWeight:700, letterSpacing:'.06em', textTransform:'uppercase', color:'var(--t-text-muted)', whiteSpace:'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {courses.length === 0 && (
                <tr><td colSpan={9} style={{ padding:'28px 10px', textAlign:'center', color:'var(--t-text-faint)' }}>No courses in the catalog yet. Use “+ Add Course” to create one.</td></tr>
              )}
              {courses.map((c, i) => {
                const rows = enrollments.filter(e => e.course_id === c.id)
                const empAvgPct = rows.length ? Math.round(rows.reduce((sum, e) => sum + (e.pct || 0), 0) / rows.length) : 0
                return (
                  <tr key={c.id} style={{ borderBottom: i < courses.length-1 ? '1px solid var(--t-line)' : undefined, background: i%2===0 ? 'transparent' : 'var(--t-surface-2)' }}>
                    <td style={{ padding:'9px 10px', maxWidth:180 }}>
                      <div style={{ fontWeight:700, color:'var(--t-text)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{c.icon} {c.title}</div>
                    </td>
                    <td style={{ padding:'9px 10px', color:'var(--t-text-muted)', whiteSpace:'nowrap' }}>{c.category}</td>
                    <td style={{ padding:'9px 10px' }}><span className={`badge ${c.level==='Beginner'?'blue':c.level==='Intermediate'?'amber':'red'}`}>{c.level}</span></td>
                    <td style={{ padding:'9px 10px', color:'var(--t-text-muted)', whiteSpace:'nowrap' }}>{fmtDuration(c.duration)}</td>
                    <td style={{ padding:'9px 10px' }}>
                      <span className={c.required ? 'badge amber' : 'badge blue'}>{c.required ? 'Yes' : 'No'}</span>
                    </td>
                    <td style={{ padding:'9px 10px', color:'var(--t-text-faint)', whiteSpace:'nowrap', fontSize:11 }}>{c.dueDate || '—'}</td>
                    <td style={{ padding:'9px 10px', color:'var(--t-accent)', fontFamily:'var(--font-mono)' }}>{c.enrolled || 0}</td>
                    <td style={{ padding:'9px 10px' }}>
                      {rows.length === 0
                        ? <span style={{ color:'var(--t-text-faint)' }}>—</span>
                        : <span style={{ color: empAvgPct >= 70 ? 'var(--t-success)' : empAvgPct >= 40 ? 'var(--t-warn)' : 'var(--t-danger)', fontWeight:800, fontFamily:'var(--font-mono)' }}>{empAvgPct}%</span>}
                    </td>
                    <td style={{ padding:'9px 10px' }}>
                      <div style={{ display:'flex', gap:5 }}>
                        <button onClick={() => setEditingCourse(c)}
                          style={{ padding:'4px 10px', fontSize:10, fontWeight:700, cursor:'pointer', background:'transparent', border:'1px solid var(--t-accent)', color:'var(--t-accent)', fontFamily:'var(--font-sans)' }}>Edit</button>
                        <button onClick={() => { if (window.confirm(`Remove “${c.title}” from the catalog?`)) deleteCourse(c.id) }}
                          style={{ padding:'4px 10px', fontSize:10, fontWeight:700, cursor:'pointer', background:'transparent', border:'1px solid var(--t-danger)', color:'var(--t-danger)', fontFamily:'var(--font-sans)' }}>Del</button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Enrollment Report — live from academy_stats.enrollments */}
      {manageView === 'enrollments' && (() => {
        const locMap = {}
        for (const l of locationStats) locMap[l.node_id] = l.loc
        const people = []
        const seen = new Set()
        for (const e of enrollments) {
          if (!seen.has(e.person_id)) {
            seen.add(e.person_id)
            people.push({ id: e.person_id, name: e.person_name || '—', location: locMap[e.node_id] || '—' })
          }
        }
        people.sort((a, b) => a.name.localeCompare(b.name))
        const lookup = {}
        for (const e of enrollments) lookup[`${e.person_id}|${e.course_id}`] = e
        const cols = courses.slice(0, 10)
        const exportCsv = () => {
          const header = ['Employee', 'Location', ...cols.map(c => c.title)]
          const lines = people.map(pn => [pn.name, pn.location, ...cols.map(c => {
            const p = lookup[`${pn.id}|${c.id}`]
            return p ? (p.certified ? 'Certified' : `${p.pct || 0}%`) : 'Not enrolled'
          })])
          const csv = [header, ...lines].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')
          const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
          const a = document.createElement('a'); a.href = url; a.download = 'academy-enrollments.csv'; a.click()
          URL.revokeObjectURL(url)
        }
        return (
        <div>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
            <div style={{ fontSize:12, color:'var(--t-text-muted)' }}>{people.length} employees enrolled · {enrollments.length} records · {cols.length} of {courses.length} courses shown</div>
            <button onClick={exportCsv} disabled={enrollments.length === 0}
              style={{ padding:'7px 16px', fontSize:11, fontWeight:700, cursor: enrollments.length === 0 ? 'not-allowed' : 'pointer', opacity: enrollments.length === 0 ? 0.45 : 1, background:'var(--t-accent)', color:'#000', border:'none', fontFamily:'var(--font-sans)' }}>Export CSV</button>
          </div>
          {enrollments.length === 0 ? (
            <div style={{ background:'var(--t-surface)', border:'1px solid var(--t-line)', padding:48, textAlign:'center', color:'var(--t-text-faint)', fontSize:13 }}>
              No enrollments yet. Records appear here as employees start courses.
            </div>
          ) : (
          <div style={{ background:'var(--t-surface)', border:'1px solid var(--t-line)', overflow:'auto', maxHeight:500 }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:11 }}>
              <thead style={{ position:'sticky', top:0, zIndex:2 }}>
                <tr style={{ background:'var(--t-surface-2)', borderBottom:'1px solid var(--t-line)' }}>
                  <th style={{ padding:'8px 10px', textAlign:'left', fontWeight:700, letterSpacing:'.06em', textTransform:'uppercase', color:'var(--t-text-muted)', fontSize:9, whiteSpace:'nowrap', minWidth:140 }}>Employee</th>
                  <th style={{ padding:'8px 10px', textAlign:'left', fontWeight:700, letterSpacing:'.06em', textTransform:'uppercase', color:'var(--t-text-muted)', fontSize:9 }}>Location</th>
                  {cols.map(c => (
                    <th key={c.id} style={{ padding:'8px 6px', textAlign:'center', fontWeight:700, letterSpacing:'.04em', textTransform:'uppercase', color:'var(--t-text-muted)', fontSize:8, whiteSpace:'nowrap', maxWidth:60, overflow:'hidden' }} title={c.title}>
                      {c.title.slice(0, 12)}…
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {people.map((emp, ei) => (
                  <tr key={emp.id} style={{ borderBottom:'1px solid var(--t-line)', background: ei%2===0 ? 'transparent' : 'var(--t-surface-2)' }}>
                    <td style={{ padding:'8px 10px', fontWeight:600, color:'var(--t-text)', whiteSpace:'nowrap' }}>{emp.name}</td>
                    <td style={{ padding:'8px 10px', color:'var(--t-text-faint)', whiteSpace:'nowrap' }}>{emp.location}</td>
                    {cols.map(c => {
                      const p = lookup[`${emp.id}|${c.id}`]
                      return (
                        <td key={c.id} style={{ padding:'8px 6px', textAlign:'center' }}>
                          {p?.certified
                            ? <span style={{ color:'var(--t-success)', fontWeight:800 }}>✓</span>
                            : p?.pct > 0
                            ? <span style={{ color:'var(--t-warn)', fontFamily:'var(--font-mono)', fontSize:10 }}>{p.pct}%</span>
                            : p
                            ? <span style={{ color:'var(--t-text-faint)', fontSize:10 }}>—</span>
                            : <span style={{ color:'var(--t-line)', fontSize:10 }}>·</span>}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          )}
          <div style={{ marginTop:8, fontSize:11, color:'var(--t-text-faint)' }}>✓ = certified · % = in progress · — = enrolled, not started · · = not enrolled · (Showing first 10 courses)</div>
        </div>
        )
      })()}

      {/* Add Course Form */}
      {manageView === 'add' && (
        <div style={{ maxWidth:560 }}>
          <div style={{ background:'var(--t-surface)', border:'1px solid var(--t-line)', padding:24, display:'flex', flexDirection:'column', gap:14 }}>
            <div style={{ fontSize:13, fontWeight:800, color:'var(--t-text)', marginBottom:4 }}>New Course</div>
            {error && <div style={{ background:'rgba(239,68,68,0.1)', border:'1px solid var(--t-danger)', color:'var(--t-danger)', padding:'8px 12px', fontSize:12 }}>{error}</div>}
            <div style={{ display:'grid', gridTemplateColumns:'1fr 90px', gap:12 }}>
              <div>
                <div style={{ fontSize:11, fontWeight:700, color:'var(--t-text-muted)', marginBottom:5, textTransform:'uppercase', letterSpacing:'.06em' }}>Title</div>
                <input type="text" placeholder="Course title…" value={newCourse.title || ''} onChange={e => setNewCourse(p => ({ ...p, title: e.target.value }))}
                  style={{ width:'100%', padding:'9px 11px', background:'var(--t-surface-2)', border:'1px solid var(--t-line)', color:'var(--t-text)', fontFamily:'var(--font-sans)', fontSize:13, boxSizing:'border-box' }} />
              </div>
              <div>
                <div style={{ fontSize:11, fontWeight:700, color:'var(--t-text-muted)', marginBottom:5, textTransform:'uppercase', letterSpacing:'.06em' }}>Icon</div>
                <input type="text" placeholder="🎓" value={newCourse.icon || ''} onChange={e => setNewCourse(p => ({ ...p, icon: e.target.value }))}
                  style={{ width:'100%', padding:'9px 11px', background:'var(--t-surface-2)', border:'1px solid var(--t-line)', color:'var(--t-text)', fontFamily:'var(--font-sans)', fontSize:13, boxSizing:'border-box', textAlign:'center' }} />
              </div>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
              <div>
                <div style={{ fontSize:11, fontWeight:700, color:'var(--t-text-muted)', marginBottom:5, textTransform:'uppercase', letterSpacing:'.06em' }}>Category</div>
                <select value={newCourse.category} onChange={e => setNewCourse(p => ({ ...p, category: e.target.value }))}
                  style={{ width:'100%', padding:'9px 11px', background:'var(--t-surface-2)', border:'1px solid var(--t-line)', color:'var(--t-text)', fontFamily:'var(--font-sans)', fontSize:13, cursor:'pointer' }}>
                  {CATEGORIES.filter(c => c !== 'All').map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <div style={{ fontSize:11, fontWeight:700, color:'var(--t-text-muted)', marginBottom:5, textTransform:'uppercase', letterSpacing:'.06em' }}>Level</div>
                <select value={newCourse.level} onChange={e => setNewCourse(p => ({ ...p, level: e.target.value }))}
                  style={{ width:'100%', padding:'9px 11px', background:'var(--t-surface-2)', border:'1px solid var(--t-line)', color:'var(--t-text)', fontFamily:'var(--font-sans)', fontSize:13, cursor:'pointer' }}>
                  {['Beginner','Intermediate','Advanced'].map(l => <option key={l}>{l}</option>)}
                </select>
              </div>
              <div>
                <div style={{ fontSize:11, fontWeight:700, color:'var(--t-text-muted)', marginBottom:5, textTransform:'uppercase', letterSpacing:'.06em' }}>Duration (min)</div>
                <input type="number" min={5} max={300} value={newCourse.duration} onChange={e => setNewCourse(p => ({ ...p, duration: Number(e.target.value) }))}
                  style={{ width:'100%', padding:'9px 11px', background:'var(--t-surface-2)', border:'1px solid var(--t-line)', color:'var(--t-text)', fontFamily:'var(--font-sans)', fontSize:13, boxSizing:'border-box' }} />
              </div>
              <div>
                <div style={{ fontSize:11, fontWeight:700, color:'var(--t-text-muted)', marginBottom:5, textTransform:'uppercase', letterSpacing:'.06em' }}>Due Date (if required)</div>
                <input type="date" value={newCourse.dueDate} onChange={e => setNewCourse(p => ({ ...p, dueDate: e.target.value }))}
                  style={{ width:'100%', padding:'9px 11px', background:'var(--t-surface-2)', border:'1px solid var(--t-line)', color:'var(--t-text)', fontFamily:'var(--font-sans)', fontSize:13, boxSizing:'border-box' }} />
              </div>
            </div>
            <div style={{ display:'flex', gap:10, alignItems:'center' }}>
              <label style={{ display:'flex', gap:8, alignItems:'center', cursor:'pointer', fontSize:13, color:'var(--t-text)' }}>
                <input type="checkbox" checked={newCourse.required} onChange={e => setNewCourse(p => ({ ...p, required: e.target.checked }))} />
                Mark as Mandatory
              </label>
            </div>
            <div style={{ display:'flex', gap:10, marginTop:4 }}>
              <button disabled={savingCourse || !newCourse.title?.trim()}
                onClick={async () => {
                  const ok = await saveCourse(newCourse, null)
                  if (ok) { setNewCourse({ title:'', category:'Product Knowledge', duration:30, required:false, dueDate:'', level:'Beginner', icon:'' }); setManageView('courses') }
                }}
                style={{ padding:'10px 24px', fontWeight:700, fontSize:13, cursor:(savingCourse || !newCourse.title?.trim()) ? 'not-allowed' : 'pointer', opacity:(savingCourse || !newCourse.title?.trim()) ? 0.45 : 1, background:'var(--t-accent)', color:'#000', border:'none', fontFamily:'var(--font-sans)' }}>
                {savingCourse ? 'Saving…' : 'Save Course'}
              </button>
              <button onClick={() => setManageView('courses')}
                style={{ padding:'10px 20px', fontWeight:700, fontSize:13, cursor:'pointer', background:'transparent', color:'var(--t-text-muted)', border:'1px solid var(--t-line)', fontFamily:'var(--font-sans)' }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Inline Edit Modal — real persistence via academy_course_upsert */}
      {editingCourse && (
        <div style={{ position:'fixed', inset:0, zIndex:9000, background:'rgba(0,0,0,0.7)', display:'flex', alignItems:'center', justifyContent:'center' }} onClick={() => setEditingCourse(null)}>
          <div onClick={e => e.stopPropagation()} style={{ background:'var(--t-bg)', border:'1px solid var(--t-line)', padding:28, maxWidth:480, width:'90%', display:'flex', flexDirection:'column', gap:14 }}>
            <div style={{ fontWeight:800, fontSize:15, color:'var(--t-text)', marginBottom:4 }}>Edit Course</div>
            {error && <div style={{ background:'rgba(239,68,68,0.1)', border:'1px solid var(--t-danger)', color:'var(--t-danger)', padding:'8px 12px', fontSize:12 }}>{error}</div>}
            <div>
              <div style={{ fontSize:11, fontWeight:700, color:'var(--t-text-muted)', marginBottom:5, textTransform:'uppercase', letterSpacing:'.06em' }}>Title</div>
              <input type="text" value={editingCourse.title || ''} onChange={e => setEditingCourse(c => ({ ...c, title: e.target.value }))}
                style={{ width:'100%', padding:'9px 11px', background:'var(--t-surface-2)', border:'1px solid var(--t-line)', color:'var(--t-text)', fontFamily:'var(--font-sans)', fontSize:13, boxSizing:'border-box' }} />
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
              <div>
                <div style={{ fontSize:11, fontWeight:700, color:'var(--t-text-muted)', marginBottom:5, textTransform:'uppercase', letterSpacing:'.06em' }}>Category</div>
                <select value={editingCourse.category} onChange={e => setEditingCourse(c => ({ ...c, category: e.target.value }))}
                  style={{ width:'100%', padding:'9px 11px', background:'var(--t-surface-2)', border:'1px solid var(--t-line)', color:'var(--t-text)', fontFamily:'var(--font-sans)', fontSize:13, cursor:'pointer' }}>
                  {CATEGORIES.filter(c => c !== 'All').map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <div style={{ fontSize:11, fontWeight:700, color:'var(--t-text-muted)', marginBottom:5, textTransform:'uppercase', letterSpacing:'.06em' }}>Level</div>
                <select value={editingCourse.level} onChange={e => setEditingCourse(c => ({ ...c, level: e.target.value }))}
                  style={{ width:'100%', padding:'9px 11px', background:'var(--t-surface-2)', border:'1px solid var(--t-line)', color:'var(--t-text)', fontFamily:'var(--font-sans)', fontSize:13, cursor:'pointer' }}>
                  {['Beginner','Intermediate','Advanced'].map(l => <option key={l}>{l}</option>)}
                </select>
              </div>
              <div>
                <div style={{ fontSize:11, fontWeight:700, color:'var(--t-text-muted)', marginBottom:5, textTransform:'uppercase', letterSpacing:'.06em' }}>Duration (min)</div>
                <input type="number" min={5} max={300} value={editingCourse.duration} onChange={e => setEditingCourse(c => ({ ...c, duration: Number(e.target.value) }))}
                  style={{ width:'100%', padding:'9px 11px', background:'var(--t-surface-2)', border:'1px solid var(--t-line)', color:'var(--t-text)', fontFamily:'var(--font-sans)', fontSize:13, boxSizing:'border-box' }} />
              </div>
              <div>
                <div style={{ fontSize:11, fontWeight:700, color:'var(--t-text-muted)', marginBottom:5, textTransform:'uppercase', letterSpacing:'.06em' }}>Due Date</div>
                <input type="date" value={editingCourse.dueDate || ''} onChange={e => setEditingCourse(c => ({ ...c, dueDate: e.target.value }))}
                  style={{ width:'100%', padding:'9px 11px', background:'var(--t-surface-2)', border:'1px solid var(--t-line)', color:'var(--t-text)', fontFamily:'var(--font-sans)', fontSize:13, boxSizing:'border-box' }} />
              </div>
            </div>
            <label style={{ display:'flex', gap:8, alignItems:'center', cursor:'pointer', fontSize:13, color:'var(--t-text)' }}>
              <input type="checkbox" checked={!!editingCourse.required} onChange={e => setEditingCourse(c => ({ ...c, required: e.target.checked }))} />
              Mark as Mandatory
            </label>
            <div style={{ display:'flex', gap:10, marginTop:8 }}>
              <button disabled={savingCourse || !editingCourse.title?.trim()}
                onClick={async () => { const ok = await saveCourse(editingCourse, editingCourse.id); if (ok) setEditingCourse(null) }}
                style={{ padding:'9px 22px', fontWeight:700, fontSize:12, cursor:(savingCourse || !editingCourse.title?.trim()) ? 'not-allowed' : 'pointer', opacity:(savingCourse || !editingCourse.title?.trim()) ? 0.45 : 1, background:'var(--t-accent)', color:'#000', border:'none', fontFamily:'var(--font-sans)' }}>
                {savingCourse ? 'Saving…' : 'Save Changes'}
              </button>
              <button onClick={() => setEditingCourse(null)}
                style={{ padding:'9px 16px', fontWeight:700, fontSize:12, cursor:'pointer', background:'transparent', color:'var(--t-text-muted)', border:'1px solid var(--t-line)', fontFamily:'var(--font-sans)' }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <>
      {/* ── Page Header ──────────────────────────────────────────────────── */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', flexWrap:'wrap', gap:12, marginBottom:20 }}>
        <div>
          <div className="section-title" style={{ marginBottom:4 }}>{getConfig().company_name || 'Company'} Academy</div>
          <div style={{ fontSize:12, color:'var(--t-text-faint)' }}>Training & Learning Hub · {fullName || 'Team Member'}</div>
        </div>
        {/* Lang toggle */}
        <div style={{ display:'flex', gap:0, border:'1px solid var(--t-line)' }}>
          {['en','es'].map(l => (
            <button key={l} onClick={() => setLang(l)}
              style={{ padding:'7px 18px', fontSize:12, fontWeight:700, background: lang===l ? 'var(--t-accent)' : 'var(--t-surface)', color: lang===l ? '#000' : 'var(--t-text-muted)', border:'none', cursor:'pointer', fontFamily:'var(--font-sans)', letterSpacing:'.06em', textTransform:'uppercase' }}>
              {l.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {/* ── Error banner ──────────────────────────────────────────────────── */}
      {error && (
        <div style={{ background:'rgba(239,68,68,0.08)', border:'1px solid var(--t-danger)', color:'var(--t-danger)', padding:'10px 14px', fontSize:12, marginBottom:16 }}>
          {error}
        </div>
      )}

      {/* ── Forensic KPI Panel ────────────────────────────────────────────── */}
      {kpiPanel}

      {/* ── Tab Nav ───────────────────────────────────────────────────────── */}
      <div style={{ display:'flex', gap:0, borderBottom:'1px solid var(--t-line)', marginBottom:20 }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{ padding:'10px 20px', fontSize:12, fontWeight:700, letterSpacing:'.05em', background:'transparent', border:'none', borderBottom: tab===t.id ? '2px solid var(--t-accent)' : '2px solid transparent', color: tab===t.id ? 'var(--t-accent)' : 'var(--t-text-muted)', cursor:'pointer', fontFamily:'var(--font-sans)', whiteSpace:'nowrap', marginBottom:-1 }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Tab Content ───────────────────────────────────────────────────── */}
      {tab === 'my-academy'  && tabMyAcademy}
      {tab === 'library'     && tabLibrary}
      {tab === 'leaderboard' && tabLeaderboard}
      {tab === 'manage'      && isHRUser && tabManage}

      {/* ── Keyholder note ────────────────────────────────────────────────── */}
      {!isKH && !isHRUser && tab === 'my-academy' && (
        <div style={{ marginTop:20, background:'var(--t-surface)', border:'1px solid var(--t-line)', padding:'14px 20px', display:'flex', gap:12, alignItems:'center' }}>
          <span style={{ fontSize:20 }}>🔑</span>
          <div style={{ fontSize:12, color:'var(--t-text-muted)' }}>
            <strong style={{ color:'var(--t-text)' }}>Keyholder Responsibilities</strong>{' '}course is available to Keyholders and Management only.
          </div>
        </div>
      )}

      {/* ── Course Detail Side Panel ──────────────────────────────────────── */}
      {detailCourse && (
        <CourseDetailPanel
          course={detailCourse}
          myProg={progress[detailCourse.id]}
          onClose={() => setDetailCourse(null)}
          onStart={c => { setDetailCourse(null); setActiveOverlay(mergedCourses.find(x => x.id === c.id) || c) }}
        />
      )}

      {/* ── Course Player Overlay ─────────────────────────────────────────── */}
      {activeOverlay && (
        <CoursePlayer
          course={activeOverlay}
          prog={progress[activeOverlay.id]}
          lang={lang}
          onClose={() => setActiveOverlay(null)}
          onLessonComplete={handleLessonComplete}
          onCertify={handleCertify}
        />
      )}
    </>
  )
}
