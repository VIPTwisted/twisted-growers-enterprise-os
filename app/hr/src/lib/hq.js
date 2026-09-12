// HQ (CEO / headquarters) Supabase client — the single source of truth for
// the shared DOCUMENT + ONBOARDING system. This is SEPARATE from the HR app's
// own `sb` client (src/lib/supabase.js) which keeps serving the 177 HR-native
// calls. Only the doc/onboarding vault talks to HQ, so both stay isolated
// except where we deliberately share one document store.
import { createClient } from '@supabase/supabase-js'

// Twisted Growers: HQ is the Twisted Growers OS itself — the same Supabase project, schema
// `public` (the OS's nav registry, dashboards and document store). Never a VIP project.
const HQ_REF = 'fxetuqjryttnypgepsru'
const HQ_URL  = import.meta.env.VITE_HQ_SUPABASE_URL  || ['https://', HQ_REF, '.supabase.co'].join('')
const HQ_ANON = import.meta.env.VITE_HQ_SUPABASE_ANON ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ4ZXR1cWpyeXR0bnlwZ2Vwc3J1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU4NzY4MzksImV4cCI6MjEwMTQ1MjgzOX0.JVNn4OoGrTVRLrl0AhAxaodJUeMQi4NO1aZdOVhGn3M'

// Use a distinct storageKey so HQ auth/session never collides with the HR app's.
export const hq = createClient(HQ_URL, HQ_ANON, {
  auth: { storageKey: 'vip_hq_auth', persistSession: false, autoRefreshToken: false },
})
