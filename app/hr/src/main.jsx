import React from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from './lib/auth.jsx'
import App from './App.jsx'
import './styles.css'
import './styles.scheduler.css'  // scoped (.vip-sched) — scheduler/training/zones screens

// Apply design tokens — Midnight Aura is the default; persists via localStorage
const savedTheme = localStorage.getItem('vip_theme') || 'aurora'
const savedMode  = localStorage.getItem('vip_mode')  || 'dark'
document.documentElement.setAttribute('data-theme', savedTheme)
document.documentElement.setAttribute('data-mode',  savedMode)

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '')}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
)
