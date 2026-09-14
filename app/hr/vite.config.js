import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The HR platform is served at /hr on the Twisted Growers OS origin, built by the SAME Netlify
// build as the OS (root netlify.toml) — one repo, one deploy, one origin, so the OS sign-in is
// the HR sign-in (same Supabase project, same auth storage key). The bundle lands inside the OS
// publish directory; the OS build runs first (it empties app/web/dist), this one second.
// tg-hr.netlify.app was never linked to Git and is retired: nothing proxies to it.
export default defineConfig({
  base: '/hr/',
  plugins: [react()],
  build: { outDir: '../web/dist/hr', emptyOutDir: true },
})
