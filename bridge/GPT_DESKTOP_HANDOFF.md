# GPT desktop integration — isolated probe

Owner: preserve every visual and existing setup on Budz and Top G. Only wire,
map, and sync. Preserve other providers. Subscription only; no paid fallback,
new extension, schema changes, or production rollout without existing gates.

## Implemented here

`gpt-app-client.mjs` is an isolated stdio protocol adapter. It checks managed
ChatGPT authentication, starts/resumes OpenAI threads in readOnly sandbox,
forwards notifications, rejects unhandled approval requests, and closes on
authentication change, malformed protocol, disconnect, or request timeout.
Turn acceptance is explicitly not completion. Eight synthetic protocol tests
pass with `node --test bridge/gpt-app-client.test.mjs`.

It is NOT imported into the live bridge or frontend. It does not launch Codex,
persist OS conversations, execute queue jobs, implement interactive approvals,
or deliver files/voice. No real model call has been tested in this workspace.
Read-only sandbox does not constrain separately configured MCP tools: review
those before launching. The host must isolate credentials/configuration and
terminate its child process on adapter disconnect; closing the adapter alone
does not stop an already-running model turn. Do not automatically retry an
uncertain mutation. Validate against the installed version's generated schema.

## Desktop Codex: next steps

1. Fetch this branch and inspect current main plus local running bridge; do not
   overwrite another agent's checkout. Read repository ownership instructions.
2. Verify installed CLI version and ChatGPT sign-in. Never print credentials.
   Generate the installed App Server schema and validate this adapter against it.
   Review configuration, inherited API credentials, provider endpoints, MCP
   tools, and process lifecycle before a harmless live probe. No billing fallback.
3. Run a real text turn and thread resume through local stdio. Capture safe
   timing/status evidence, actual model, and completion/error notifications.
4. Wire both existing chat surfaces to the same owner-scoped persistent thread,
   using suitable existing records. Request missing schema from Agent I.
   Keep UI, labels, controls, setup, other providers, loops and memory unchanged.
5. Implement cancellation, owner approval forwarding, result read-back, and
   idempotent queue processing before enabling writes. Never use a service key
   as the owner's session. Verify actual file contents are delivered.
6. Test Budz -> Top G follow-up, reload, upload interpretation, authorized
   software task, interrupted connection, no duplicate execution, and logout.
   Measure active/idle/off behavior. Do not claim all ChatGPT modes transfer.
7. Commit reviewable changes and supply commit SHA plus sanitized test evidence.
   Remote GPT can review these; it cannot continuously observe this desktop.

## Findings to recheck against current main

- Budz log is component state; Bots history is separate localStorage.
- Shared askBudzFull prompt names Grok; browser choice can override default.
- Top G sends attachment filenames; metadata insertion errors are unchecked.
- Queue fallback inserts pending while handoff contract says queued.
- Existing GPT CLI path buffers output, lacks thread resume, and unknown
  provider selection falls back to Claude.
- Live browser review here reached sign-in, not authenticated pages.

Earlier in this chat, ai_settings row 1 was changed and re-read as provider
openai / model gpt-current / mode tokenless / paid_model_enabled false /
bridge_enabled true. Recheck current values; this did not prove live GPT routing.

Official protocol: https://learn.chatgpt.com/docs/app-server
The WebSocket transport is experimental. Use local stdio for this probe.
