# The AI bridge — setup

This lets you chat with Claude **inside the Twisted Growers OS**, with the assistant reading
the live Metrc data as it answers.

It runs on your own computer and uses the Claude subscription you already pay for.
**There is no extra bill, and there is no longer a paid fallback that could create one.**

> **Last verified 7 August 2026** against the live site, from a real browser, end to end.
> Anything in this file marked ⚠ is a trap that has already cost time here — read those.

---

## Who this is for

| | Plan needed |
|---|---|
| Owner's machine | Claude Max — set up and working |
| Any second machine | Claude Max — follow *Setting this up on a second machine* below |

Anyone without a subscription still gets every built-in report, dashboard and suggestion
button in the OS. Those are database queries and have always been free. They just don't get
the free-form conversation.

---

## Part 1 — Sign in to Claude Code (once)

1. Double-click **"Sign in to Claude Code"** on the desktop.
2. Type `/login` and press Enter.
3. Sign in with the Claude account in the browser window that opens.
4. Close the window when it says you're signed in.

That's permanent. You never do it again on this machine.

**If the shortcut isn't there**, open a terminal, run `claude`, then `/login`.

---

## Part 2 — Start the bridge

**It starts by itself when Windows starts** — `TG OS AI Bridge.lnk` lives in the Startup
folder and launches it hidden. Nothing to do day to day.

To start it by hand — after a crash, or if you closed it — double-click **"Start TG Bridge"**
on the desktop. A small window opens and stays open. Leave it running; minimise it if it's in
the way.

**To check it's alive**, open this in a browser:

```
http://127.0.0.1:8765/health
```

You should see `{"ok":true,...}`. If the page won't load, the bridge isn't running.

> ⚠ **Only ever have ONE startup shortcut.** Two shortcuts pointing at the same script were
> found in the Startup folder on 7 Aug 2026 — the bridge launched twice at login and the
> second copy died on "port already in use". Harmless but confusing. One is correct.

---

## Part 3 — Use it

Open the OS, go to **Budz Assistant**, and ask anything.

Every answer says which one wrote it:

- **"Researched by Claude on your desktop"** — the bridge. Free. This is the normal answer.
- No label — the plain database report. Always free.

The app tries, in order: **desktop bridge → local model (if configured) → paid API.**
Only the first one is expected ever to answer.

**Paid answers are switched OFF** (`ai_settings.paid_model_enabled = false`, set 7 Aug 2026
at the owner's instruction: *"NO PAID ONLY WHEN WE TURN ON"*). Total spend to date is
**$0.00**. If anything reaches that path it now says *"Paid answers are switched off in
Settings"* — it does not spend and it does not pretend a cap was hit. Only an owner turns it
back on, deliberately, in Settings.

---

## Setting this up on a second machine

Everything below happens on **that** computer.

### 1. Install what's needed

- **Node.js** — https://nodejs.org (take the LTS button)
- **Claude Code**:

```bash
npm install -g @anthropic-ai/claude-code
```

### 2. Get the bridge

Pull the repository, or copy the whole `bridge` folder across. Pulling is better — every fix
in this file arrives with it.

### 3. Point it at the project — with an environment variable, not an edit

`server.mjs` reads:

```js
const PROJECT = process.env.TG_PROJECT || "C:\\Users\\demar\\Documents\\Claude_Twisted Growers";
```

Set `TG_PROJECT` to wherever the project sits on that machine. **Do not edit the line** — an
edit is overwritten by the next `git pull`, and the bridge then silently points at a folder
that does not exist.

If the project isn't checked out there, point it at any folder. The database connector still
works; there's just no source code to read.

### 4. The bridge token — the SAME one, not a new one

> ⚠ **This is the step the old version of this file got wrong.** It said "give them their own
> token, don't reuse the owner's." That breaks it.

`ai_settings` holds **one** `bridge_token` for the whole platform — a single row, id 1. The
browser sends that one value to whatever bridge is on that machine. So:

**Copy the owner's `bridge/token.txt` to the second machine byte for byte.**

If they differ, that browser gets `{"ok":false,"reply":"Bad bridge token."}` and the assistant
quietly falls through as if the bridge were off.

To check without ever revealing the token, compare fingerprints:

```bash
node -e "console.log(require('crypto').createHash('sha256').update(require('fs').readFileSync('bridge/token.txt','utf8').trim()).digest('hex'))"
```

and in SQL:

```sql
select encode(digest(bridge_token,'sha256'),'hex') from ai_settings where id = 1;
```

The two strings must be identical.

### 5. Connect Claude Desktop to the database

Follow `CLAUDE_DESKTOP_SETUP.md` in the project root. That's what gives the bridge live data
to read.

### 6. Sign in, start, and auto-start

```bash
claude
```

then `/login`. Then double-click `start-bridge.cmd`.

To auto-start: press `Windows + R`, type `shell:startup`, press Enter, and drop **one**
shortcut to `start-bridge-hidden.vbs` into the folder that opens.

### 7. Verify from the browser — not from a terminal

See the next section. This matters more than it sounds.

---

## ⚠ The trap that cost a whole afternoon: curl cannot verify this

On 7 August 2026 the bridge answered `/health` perfectly from the terminal while the badge in
the browser read **"AI offline"** at the same moment, and the assistant fell through to the
paid path and reported *"the monthly budget cap has been reached"* — with $0.00 ever spent.

**Chrome's Private Network Access** is why. A page on a public `https://` origin reaching a
loopback address must first pass a preflight carrying
`Access-Control-Request-Private-Network: true`, and the reply **must** carry
`Access-Control-Allow-Private-Network: true` or Chrome drops the request before any handler in
`server.mjs` is ever reached.

**`curl` does not send that header.** So the terminal says healthy and the browser says
offline, for the same port and the same request, and nothing in the failure tells you which.

`server.mjs` now sends that header. To verify properly, open the OS in the browser, press F12,
and paste this into the Console:

```js
await (await fetch('http://127.0.0.1:8765/health')).text()
```

`{"ok":true,...}` means the browser can reach it. An error means it still cannot, whatever the
terminal says.

To test the full request the assistant actually makes — a POST with a custom header, which
forces the complete preflight — send a **deliberately wrong** token, so you never handle the
real one:

```js
(await fetch('http://127.0.0.1:8765/ask', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'x-tg-token': 'deliberately-wrong' },
  body: JSON.stringify({ question: 'probe', context: {} })
})).status
```

**`401` is the passing result.** It means the browser got through and the bridge answered;
only the fake token was refused. A thrown error means it is still blocked.

---

## ⚠ Deploy previews

Netlify serves every preview from a hash-prefixed address —
`https://<hash>--twisted-growers-enterprise-os.netlify.app`. The bridge used to trust three
exact strings, so a preview page read "AI offline" with the bridge running perfectly.

It now matches the project rather than the literal string, so previews work. If you rename the
Netlify site, update `isOurs()` in `server.mjs` or every preview breaks again.

---

## If something goes wrong

| What you see | What it is |
|---|---|
| "The bridge is running but Claude Code is not signed in yet" | Do Part 1. |
| Badge says **AI offline**, but `http://127.0.0.1:8765/health` loads fine in a tab | Private Network Access. Read the trap section above and check from the Console, not curl. |
| **"Bad bridge token"** | `token.txt` and `ai_settings.bridge_token` differ. Compare the sha256 fingerprints in step 4 — never paste the tokens themselves. |
| Answers arrive but never say "on your desktop" | The bridge was not reached. Check the badge, then the Console test. |
| Any message about a **budget cap** | Should now be impossible — paid answers are off and $0.00 has ever been spent. If you see one, the gate has regressed; check `tg_ai_gate()`. |
| It's slow | The bridge is genuinely running Claude against the live database. 10–40 seconds for a real question is normal. It gives up at five minutes and says so. |

---

## ChatGPT and Grok

ChatGPT has **no equivalent of Claude Code**, so there is no bridge for it — a Plus or Pro
subscription cannot be driven from an application the way Claude Code can. Same for Grok.

What works instead: the **"Send to Claude"** / **"Send to ChatGPT"** button on the Budz page.
It copies your question together with a full briefing — the licences, the database views, and
the analytical traps to avoid — and opens the other tool. Paste and go.

So: **Claude answers inside the OS. ChatGPT and Grok are one paste away.**

---

## Security

- The bridge listens on **127.0.0.1 only**. Nothing outside the computer can reach it — not
  the office network, not the internet.
- A shared token is required on every `/ask`. That token is the gate that matters; CORS only
  decides which browser may read a reply.
- The browser is restricted to the Twisted Growers site and its own deploy previews. No other
  site is admitted, and the private-network header is only ever sent back to an origin already
  recognised.
- Database access is **read only**, and service keys are blocked outright.

---

## For an agent picking this up

Facts worth having before you touch anything:

- **Order of attempts** in `app/web/src/budz.jsx`: bridge → local model → `budz-chat`. Only the
  bridge is expected to answer.
- **`ai_settings` is a single row, id 1.** `bridge_token` is shared platform-wide; there is no
  per-user bridge token anywhere in the schema.
- **`tg_ai_gate()`** returns `{allowed, reason, message}` and names which of six causes stopped
  a paid answer. It reads `auth.uid()`, so **it must be called on a client carrying the user's
  JWT** — a service-role client always returns `no_identity`. That exact mistake made
  `budz-chat` block every user at every spend under every cap while reporting it as a budget
  cap. `tg_ai_budget_ok()` still exists with its original behaviour; do not call it from a
  service-role client.
- **Never verify the browser path with curl.** See the trap section. Use the Console at the
  site's origin.
- **Never print the bridge token.** Compare sha256 fingerprints.
- The bridge process is `node bridge/server.mjs`. After editing it you must restart it —
  nothing hot-reloads.
