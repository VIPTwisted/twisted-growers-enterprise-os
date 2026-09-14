# Twisted Growers HR platform — `app/hr`

The HR platform of the Twisted Growers OS (Bible §12g, `brain/BLUEPRINT_2026_BEAT_THEM_ALL.md`).
It is the vip-hr-hub application cloned in full (owner ruling 12 Sep 2026, retail screens kept)
and re-pointed at **TG's own Supabase project `fxetuqjryttnypgepsru`, schema `hr`**. Zero VIP
data: every person, role, node, shift and document is a TG row.

## How it is served
- Built by the **same Netlify build as the OS** (root `netlify.toml`): the OS bundle first, then
  `app/hr` into `app/web/dist/hr` with Vite base `/hr/`. One repo, one deploy, one origin.
- Reached at **`/hr/`** on the OS domain. Human Resources on the OS rail is a door to it.
- Because it shares the OS origin it shares the OS sign-in: `supabase-js` keeps the session under
  the project's storage key, so a person signed into the OS is the same person here
  (`hr.session_login()` links `auth.uid()` → `hr.people`, creating the person from
  `public.app_users` / `public.employees` on first sight).
- No OS session (a wall kiosk) → Employee ID + PIN (`hr.pin_login`). That path needs an
  `authenticated` session, which is an anonymous auth session: **anonymous sign-ins are an
  owner switch in the Supabase dashboard** (Auth → Providers). Nothing is ever granted to `anon`.

## Rules carried from the OS
- Project URL and anon key are literals in `src/lib/supabase.js`, never `VITE_*` env (a stray
  team variable once pointed a build at the wrong project).
- Every reader is a `SECURITY DEFINER` function executable by `authenticated` only; the door is
  the caller's reach (`hr.assignments` → `hr.org_nodes` ltree, expanded by `hr.tg_reach_nodes`).
  TG assigns people to DEPARTMENT nodes under the one facility, so scope always carries the
  location plus every node beneath it.
- `hr.ai_providers` holds no keys; AI features go through TG's gateway.
- Schema `hr` is recorded where every TG migration is: the OS pipeline
  (`supabase/migrations/20260912193318_hr_00_schema_types_sequences.sql` and the `hr_0*` series that
  follow it, then the dated `hr_*` migrations). The clone's own SQL history (VIP's project, which
  granted to `anon`) is not kept here — rule E6 forbids it and it never applied to TG.
- Nothing is seeded. A screen with no rows says so; figures the OS holds only as provisional
  placeholders (pay rates today) are labelled provisional.

## Run locally
```bash
npm install
npm run dev        # http://localhost:5173/hr/
```
