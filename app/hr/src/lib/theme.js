// theme.js — one place that applies a theme family + mode and remembers it.
import { sb } from './supabase.js'

export const THEME_FAMILY_IDS = ['aurora', 'tg']
export const THEME_MODE_IDS = ['dark', 'light', 'system']

/* Applies a theme family + mode to the document, remembers it for the next boot (index.html and
   main.jsx read vip_theme / vip_mode before React renders, so there is no flash), and saves it on
   the person's record (people.theme_pref) so it follows them to any device. */
export function applyTheme(family, mode, personId) {
  document.documentElement.setAttribute('data-theme', family)
  document.documentElement.setAttribute('data-mode', mode)
  try { localStorage.setItem('vip_theme', family); localStorage.setItem('vip_mode', mode) } catch {}
  if (personId) {
    sb.rpc('update_person_prefs', { p_person_id: personId, p_theme_pref: { family, mode } }).then(({ error }) => {
      if (error) console.warn('[tg-hr] theme not saved to profile:', error.message)
    })
  }
}


/* On sign-in: the person's saved preference wins over whatever this device last used. */
export function applySavedTheme(person) {
  const tp = person && person.theme_pref
  if (tp && THEME_FAMILY_IDS.includes(tp.family) && THEME_MODE_IDS.includes(tp.mode)) applyTheme(tp.family, tp.mode, null)
}
