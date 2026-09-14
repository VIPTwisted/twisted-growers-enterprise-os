# TG OS desktop Codex integration

Owner ruling: preserve every visual and the existing Budz, Top G, Brain,
Second Brain, specialist, routine and provider architecture. Codex is a
subscription-authenticated engine beneath Top G—not another coordinator,
memory, task system or queue. No browser cookies, paid API fallback, new
extension or schema change.

## Implemented

- `gpt-app-client.mjs` speaks the installed Codex app-server stdio protocol.
  It verifies ChatGPT account mode, pins OpenAI, disables provider fallback,
  requests the read-only sandbox, treats turn acceptance separately from exact
  completion, supports interruption and closes on malformed/auth-changed or
  timed-out protocol state.
- `codex-app-runtime.mjs` owns the child process, sanitizes API/alternate-
  provider credentials, restores a persisted native Codex thread receipt and
  scopes every runtime thread to the immutable OS user plus conversation id.
- Only the `twisted-growers` MCP elicitation, exact read-only tool title and a
  guarded read-only SQL statement can be approved. The database role and a
  read-only transaction are additional controls.
- Existing `ai_bridge_jobs` carries durable transport, priority, revision,
  provider/model, owner, attachment and native-thread receipts. The edge queue
  rejects a stale/missing answer revision, blank success or old bridge version.
- Budz, Top G, TG Brain, the pet and Ask use one owner-scoped conversation id.
  The prompt includes `f_brain_memory_for(uid)`, the optional existing freeform
  Brain note, completed conversation turns and the existing orchestration map.
- Uploaded originals are downloaded only from the configured TG assistant
  bucket to a temporary directory, byte-counted, SHA-256 recorded, named on
  failure and removed after the turn.
- Explicit `create task:` and `complete task <uuid>` commands write through the
  signed-in user only after `f_ai_may` returns `allowed`, then re-read `tasks`
  and `task_activity`. The desktop database connector stays read-only.
- Existing company and per-session controls are mounted on Sync. Metrc remains
  manual-only. GPT never falls through to a paid API.

## Measured locally

- Installed Codex 0.153.4 reported `Logged in using ChatGPT`; credentials were
  not printed.
- A real app-server turn returned an exact sentinel. A fresh runtime resumed
  the persisted thread id and recalled that sentinel exactly.
- The focused protocol/security/attachment suite passes, as do parse, theme,
  lint and the Vite production build. See the final release report for current
  counts and commit hashes.

## Release gates still required

1. Deploy the committed `bridge-queue`, re-read the deployed source/version and
   pin its exact normalized hash in the existing manifest.
2. Replace the installed bridge only after the edge contract is live. The
   Windows scheduled task currently restarts the bridge every minute and must
   be changed—using administrator rights—to call `ensure-bridge.ps1`.
3. Run the signed-in preview acceptance: Budz turn, exact database re-read,
   Top G follow-up on the same conversation/native thread, then one approved
   task create/complete with task/activity/audit evidence.
4. Measure active, idle and closed desktop behavior. Closed means durable queue
   or an honest unavailable state; it never means a paid fallback.
5. Parallel execution remains off until the single-agent acceptance passes.
   The five-task multitasking/priority/cancel test and routine repairs are later
   gates, not claims made by this release.

The browser-visible chat feeds are not yet one automatically mirrored timeline;
the verified contract is shared model context and shared durable task state.
Realtime conversational voice, archive unpacking for every proprietary format,
routine missed-occurrence recovery and literal `ai_action_log` coverage remain
unproven or blocked and must be reported as such.
