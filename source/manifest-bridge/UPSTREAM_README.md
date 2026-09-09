# Manifest Bridge (tg)

Full-stack rebuild of `2.0/manifest_bridge.py` — planner pack orders ⇄ METRC
manifests, auto-matched, content-verified, with the complete per-order toolkit
(compare & edit · payments & credit · order details · email invoice).

**Fully self-contained.** Everything the old Streamlit app leaned on was
*copied* in, not imported: the engine (`slc.py`, `planner.py`, `apex_core.py`)
lives in `backend/engine/`, every JSON cache lives in `backend/data/`, and the
Graph/email secrets live in `backend/engine/.streamlit/secrets.toml`. Nothing
reads from or writes to the old `2.0/` folder — the two apps can now diverge.

## Stack

- **Backend** — FastAPI (port **8010**), wrapping the battle-tested engine
  functions through a Streamlit shim (`backend/engine/stshim.py`). The shim
  gives the engine a real `session_state` + `secrets`; every `st.*` UI call is
  a no-op.
- **Frontend** — Next.js App Router + TypeScript + Tailwind + shadcn/ui
  (port **3001**), dark/orange theme matching pipeline-tracker.

## Run it

Backend (first terminal):

```
cd tg\backend
.venv\Scripts\python -m uvicorn app.main:app --port 8010
```

Frontend (second terminal):

```
cd tg\frontend
npm run dev
```

Then open http://localhost:3001.

## What's where

| Piece | Location |
| --- | --- |
| Board / matching / verify / quick-ship / split / tiers / pair tools | `backend/app/bridge.py` |
| Review panel ops (compare edits, payments, meta, email, downloads) | `backend/app/review.py` |
| API routes | `backend/app/main.py` |
| Engine bootstrap (shim install, cwd pin, session persistence) | `backend/app/deps.py` |
| Copied engine | `backend/engine/slc.py`, `planner.py`, `apex_core.py` |
| All caches / state | `backend/data/*.json` |
| Board UI | `frontend/src/app/page.tsx` + `frontend/src/components/bridge/` |
| Contacts grid: Ctrl+A, .xlsx export | `frontend/src/components/bridge/contacts-panel.tsx`, `POST /api/contacts/xlsx` |
| 📨 Email Blast (one mail per vendor, paced, killable) | `backend/app/blast.py`, `frontend/src/components/bridge/email-blast.tsx` |
| 🤖 Bridge Assistant (local-LLM chat agent, bottom-right bubble) | `backend/app/ai.py`, `frontend/src/components/bridge/ai-chat.tsx` |
| 📦 Batch inventory grid (view/edit qty — port of the 2.0 grid) | `backend/app/inventory.py`, `frontend/src/components/bridge/inventory-panel.tsx` |

## 🤖 Bridge Assistant

A floating chat bubble (bottom-right). The LLM — **qwen3:8b running locally
via Ollama** (`http://localhost:11434`), nothing ever leaves the machine —
drives an agent loop with five tools: `search_catalog`, `parse_order` (free
text -> catalog-matched line items), `get_board`, `find_contacts`, and
`draft_email`. Tool results are computed by deterministic Python reusing the
engine (`slc.py`) — the model never invents products or addresses.

**Email flow:** `draft_email` stages a draft (rendered as a card in the
chat, and remembered server-side); the mail goes out either when the human
clicks the card's "📧 Send as vincent@…" button (`POST /api/ai/send-email`)
**or** when the human says "send it" in chat — the `send_draft` tool then
sends the staged draft *verbatim* (the model can't alter recipients or
content at send time; changes require a new draft). Either way it leaves
through the same Graph mailbox as everything else
(`vincent@twistedgrowers.com`, plain text, no attachments yet).

Requires the Ollama app running (`ollama pull qwen3:8b` once); replies take
~10–60s on CPU. Chat history lives in the browser tab only.

## 📨 Email Blast

The 📇 contacts grid can send the same notice to many vendors at once — pick
rows (Ctrl+A selects all), attach one or more files, write the message once. Each vendor
gets their **own** email with only their addresses on the To line; `{vendor}`
in the subject or body is replaced with that vendor's name.

Sends run one at a time on a worker thread with a gap between them (default
2s) because Exchange Online throttles a mailbox at roughly 30 messages/minute.
Attachments are capped at 3 MB **total** — Graph inlines every file into every message. `🛑 STOP` halts the queue mid-run — the flag is checked before every send and
during every gap, so only a send already in flight completes. Send is
two-click: the first click arms, the second fires, and editing anything
disarms.

Every run is appended to `backend/data/blast_log.json` (last 20 runs) with a
per-vendor sent/failed record.

## Notable differences from the Streamlit original

- The 🔑 b-api session **persists across restarts** (saved to
  `backend/data/bapi_session.json`); the Streamlit app lost it every reload.
- The review panel is driven by JSON endpoints — same engine calls
  underneath, so verdicts/pushes behave identically.
- Styled invoice PDFs use Playwright's Chromium when installed
  (`.venv\Scripts\python -m playwright install chromium`); otherwise the
  reportlab fallback renders automatically, exactly like the original.
