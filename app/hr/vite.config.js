import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
export default defineConfig({
  // Served at /hr on the Twisted Growers OS domain (Netlify rewrite) and on its own site.
  base: '/hr/', plugins: [react()] })
