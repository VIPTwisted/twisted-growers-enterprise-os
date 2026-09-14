# VIP HR Platform — Dynamic React App (hand this to Claude Code)

A fully dynamic React + Vite + Supabase app. **No hardcoded/fake data** — every person, role,
shift, and node is fetched live from Supabase at runtime via secure RPCs. This is the real,
deployable foundation, wired to the live database.

## Stack
- React 18 + React Router + Vite
- Supabase (live project: `zsmdejhgdyyaakqsjhmk`)
- Netlify (build: `npm run build`, publish: `dist`)

## What works right now (verified against the live DB)
- **Login** — ID + PIN, verified server-side (bcrypt) via the `pin_login` RPC. Hashes never leave
  the server. Returns the person + their reachable org nodes (ltree cascade).
- **Scope selector** — built from the logged-in person's reachable nodes. The CEO sees
  "All locations (5)" + each of Manchester, Southington, Orange, Hartford, Warehouse + the
  company/portfolio. A location-scoped user sees only their location. (This is the fix for the
  old "CEO sees 1 node" bug — now driven by real reachability.)
- **Cockpit** — live KPIs + per-location cards (real staff, roles, shift counts).
- **Roster** — live table of all in-scope people, sorted by rank.
- **Schedule** — live shifts for in-scope locations.

## Run locally
```bash
npm install
cp .env.example .env        # fill in VITE_SUPABASE_ANON_KEY (anon/publishable key, NOT service role)
npm run dev
```

## Deploy to Netlify
This repo is ready for Netlify (see `netlify.toml`). Set the env var in Netlify:
- `VITE_SUPABASE_URL = https://zsmdejhgdyyaakqsjhmk.supabase.co`
- `VITE_SUPABASE_ANON_KEY = <your anon/publishable key>`   ← already set on site af72161a-070e-4530-9ad0-ef7c315b948b
Then `npm run build` → publish `dist`. Or connect this repo and let Netlify build it.

## Database (already live)
The RPCs this app calls are ALREADY APPLIED to the live Supabase project. The SQL is in
`db/migrations/` as source of truth (see `db/migrations/000_NOTES.md`). If you point this at a
fresh project, run those migrations there.

## Project structure
```
src/
  main.jsx              app entry (Router + AuthProvider)
  App.jsx               auth gate + routes
  styles.css            violet theme
  lib/
    supabase.js         Supabase client + RPC wrappers (pinLogin, scopeData)
    auth.jsx            session context (login/logout, sessionStorage)
    scope.jsx           scope context (selected node → location ids)
    useScopeData.js     hook: load live roster + shift counts for current scope
  components/
    Shell.jsx           header, nav, scope selector
  screens/
    Login.jsx           PIN login
    Cockpit.jsx         KPIs + per-location cards (live)
    Roster.jsx          live roster table
    Schedule.jsx        live shifts table
db/migrations/          the live Supabase functions (source of truth)
```

## How to extend (the full platform)
This is the working spine. The complete blueprint for every remaining screen — scheduling engine,
communication, bookends, attendance, AI CEO, cultivation, HR, bulletin board, requests/incidents,
admin, etc. — is in the accompanying spec files (BUILD-SPEC.md, SCHEDULING-ENGINE-SPEC.md, and the
rest). Build each screen the same way: a `screens/X.jsx` that calls a security-definer RPC and
renders live data. NEVER hardcode data. Each new data need = a new RPC in `db/migrations/` +
a screen that calls it.

## Auth model note
The app authenticates via the `pin_login` RPC (anon client + security-definer RPCs). It does NOT
ship the service-role key to the browser. For the full Supabase Auth session model (so RLS on base
tables applies directly), see CLAUDE-CODE-PROMPT-AUTH-FIX.md — that's the next hardening step.
The current RPC model is safe (definer functions re-verify reachability) and works today.
