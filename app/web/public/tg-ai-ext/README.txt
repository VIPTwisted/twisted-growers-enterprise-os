TG Bots — Chrome / Edge add-on for Twisted Growers OS
Version 1.1.0

Answers come from the Grok, Claude, GPT or Grok Bots subscription you already pay
for, on this computer. No API key. No extra bill.

Install (once per computer)
1. Unzip this folder.
2. Chrome or Edge -> chrome://extensions (or edge://extensions)
3. Turn on Developer mode
4. Load unpacked -> pick this folder
5. Open the TG Bots icon
6. Paste the same bridge token the desktop already uses (bridge/token.txt)
7. Pick Grok / Grok Bots / Claude / GPT
8. Press "Load my versions", then choose the one you want
9. Turn Running on
10. Stay signed in on that site in a tab

Choosing a version
The version list is read from the provider's OWN model menu on your signed-in
tab. It therefore shows exactly what your subscription can open - nothing this
add-on guessed, and nothing that goes stale when a provider ships a new model.
Each provider keeps its own choice, so switching back and forth remembers.
Leave it on "Whatever the tab already has selected" to use the tab as-is.

If a version you picked stops being offered, the add-on says so and refuses,
rather than quietly answering on a different model. Every answer is reported
back with the provider and the model that produced it.

What it does NOT do
- It never returns a half-written answer as a finished one. If the reply is
  still being written when time runs out, that is reported as a failure, with
  the partial text attached for a human to look at. An answer that looks
  complete but was cut off is worse than an error, because nothing tells you
  to check it.
- It never runs the question. It types it as text.
- It never reads passwords.
- Metrc stays read-only. The hard gate still holds.

Security
- Token is stored only on this computer (chrome.storage.local). It does not sync.
- Token is never logged. It is sent only to the OS queue as a header.
- Pages touched: grok.com, claude.ai, chatgpt.com, and the OS queue.

Worth knowing
Driving a signed-in chat session with a script is not something Grok, OpenAI or
Anthropic permit in their consumer terms. The account at risk is yours. This
add-on exists because the owner chose that trade deliberately over per-token
API billing; it is written to be honest about what it did, not to hide it.

For Grok Bots, paste your Buddy bot https://grok.com/... address in the popup.
