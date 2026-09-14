// Bilingual course lesson content — loaded dynamically by Academy.jsx
// This module exports buildCourses(lang) which returns full lesson objects.
// Twisted Growers starter curriculum. Every lesson is a DRAFT skeleton for the training lead to
// complete in Academy › Courses; nothing here is a certified procedure until it is reviewed.

const D = { en: 'DRAFT — the training lead completes this lesson in Academy › Courses.', es: 'BORRADOR — el responsable de formación completa esta lección en Academy › Courses.' }
const t = (lang, en, es) => (lang === 'es' ? es : en)

export function buildCourses(lang) {
  const d = t(lang, D.en, D.es)
  return [
    {
      id: 'cultivation-basics',
      lessons: [
        { title: t(lang, 'Welcome to the Grow', 'Bienvenido al cultivo'), content: t(lang, 'The four flowering rooms, veg, mother and clone rooms, and the dry and cure rooms — what happens in each, and why every plant carries a Metrc tag. ' + d, 'Las cuatro salas de floración, vegetativo, madres y clones, y las salas de secado y curado: qué ocurre en cada una y por qué cada planta lleva una etiqueta Metrc. ' + d), quiz: null },
        { title: t(lang, 'Water, IPM, Defoliation', 'Riego, MIP, defoliación'), content: d, quiz: null },
        { title: t(lang, 'Room Readings & Logs', 'Lecturas y registros de sala'), content: d,
          quiz: { question: t(lang, 'A plant without a Metrc tag is…', 'Una planta sin etiqueta Metrc es…'), options: t(lang, ['Fine if the room is labelled', 'A violation — stop and tell your lead', 'Normal for clones'], ['Aceptable si la sala está etiquetada', 'Una infracción: detente y avisa a tu responsable', 'Normal en clones']), answer: 1 } },
      ],
    },
    {
      id: 'metrc-tagging',
      lessons: [
        { title: t(lang, 'Metrc is the Record of Truth', 'Metrc es el registro de la verdad'), content: t(lang, 'Plant tags, harvest batches and package tags: what each one means, and why a spreadsheet never overrides Metrc. ' + d, 'Etiquetas de planta, lotes de cosecha y etiquetas de paquete: qué significa cada una y por qué una hoja de cálculo nunca prevalece sobre Metrc. ' + d), quiz: null },
        { title: t(lang, 'Weights: Weigh Twice, Write Once', 'Pesos: pesa dos veces, escribe una'), content: d, quiz: null },
      ],
    },
    {
      id: 'trim-standards',
      lessons: [
        { title: t(lang, 'Trim Room Setup', 'Preparación de la sala de recorte'), content: d, quiz: null },
        { title: t(lang, 'One Harvest per Table', 'Una cosecha por mesa'), content: d, quiz: null },
      ],
    },
    {
      id: 'extraction-safety',
      lessons: [
        { title: t(lang, 'Hydrocarbon Room Rules', 'Normas de la sala de hidrocarburos'), content: t(lang, 'Never alone in the room; ventilation and gas detection checked before every run. ' + d, 'Nunca solo en la sala; ventilación y detección de gas comprobadas antes de cada ciclo. ' + d), quiz: null },
        { title: t(lang, 'Solventless Basics', 'Fundamentos sin solventes'), content: d, quiz: null },
      ],
    },
    {
      id: 'packaging-labeling',
      lessons: [
        { title: t(lang, 'Massachusetts Label Requirements', 'Requisitos de etiquetado de Massachusetts'), content: d, quiz: null },
        { title: t(lang, 'Finish Pack & the Vault', 'Empaque final y la bóveda'), content: d, quiz: null },
      ],
    },
    {
      id: 'ma-cannabis-compliance',
      lessons: [
        { title: t(lang, 'Agent Registration & Badge', 'Registro de agente y credencial'), content: t(lang, 'Every employee is a registered agent with the Cannabis Control Commission (935 CMR 500.030) and wears the badge on shift. ' + d, 'Cada empleado es un agente registrado ante la Cannabis Control Commission (935 CMR 500.030) y lleva la credencial durante el turno. ' + d), quiz: null },
        { title: t(lang, 'Diversion, Security & Reporting', 'Desvío, seguridad y reportes'), content: d, quiz: null },
      ],
    },
  ]
}
