/* TG Bots — runs on grok.com, claude.ai, chatgpt.com only.
   Types the question as plain text. Never eval. Never reads passwords.

   WHAT CHANGED, 8 Sep 2026, and why it matters more than it looks:

   1. A TIMED-OUT ANSWER IS NO LONGER RETURNED AS A GOOD ONE. The previous build
      resolved with whatever partial text it had after 120s, and the caller treated
      any non-empty string as success. A half-written reply came back looking
      complete. That is the silent-wrong-data failure this project already tracks
      as trap D1 - it is worse than an error, because nothing tells you to look.

   2. COMPLETION IS DETECTED BY THE STOP CONTROL, NOT BY TEXT STANDING STILL.
      The old rule was "unchanged for 4 polls" = 3.2 seconds. Any model that pauses
      longer than that mid-answer was recorded as finished. We now watch the site's
      own stop/streaming control appear and then disappear, which is what the site
      itself uses to mean "still generating".

   3. SELECTORS ARE PER-SITE AND OVERRIDABLE. Generic heuristics ("any textarea
      over 80x16", "any class containing 'message'") match rename boxes, search
      fields and obfuscated CSS-module classes that change on every provider
      deploy. The OS can now push a corrected selector set with the job, so a
      provider redesign is a config edit, not a reinstall on every computer.

   4. THE MODEL THAT ANSWERED IS REPORTED. An answer you cannot attribute to a
      model cannot be audited, and this OS does not accept unauditable figures. */
(function () {
  if (window.__tgBots) return;
  window.__tgBots = true;

  /* Built-in defaults. The OS may override any of these per job - see job.selectors.
     Each is a comma-separated selector list, tried in order, first match wins. */
  const BUILTIN = {
    "claude.ai": {
      composer:  'div.ProseMirror[contenteditable="true"], [contenteditable="true"][role="textbox"]',
      send:      'button[aria-label*="Send" i]',
      streaming: 'button[aria-label*="Stop" i]',
      messages:  '[data-is-streaming], div.font-claude-message, [data-testid="conversation-turn"]',
      model:     '[data-testid="model-selector-dropdown"], button[aria-haspopup="menu"]',
    },
    "chatgpt.com": {
      composer:  '#prompt-textarea, [contenteditable="true"]',
      send:      'button[data-testid="send-button"], button[aria-label*="Send" i]',
      streaming: 'button[data-testid="stop-button"], button[aria-label*="Stop" i]',
      messages:  '[data-message-author-role="assistant"]',
      model:     '[data-testid="model-switcher-dropdown-button"]',
    },
    "grok.com": {
      composer:  'textarea[placeholder*="Ask" i], textarea[placeholder*="Message" i], div.ProseMirror[contenteditable="true"], [contenteditable="true"][role="textbox"], textarea, [contenteditable="true"]',
      send:      'button[type="submit"]:not([disabled]), button[aria-label*="Send" i], button[aria-label*="Submit" i]',
      streaming: 'button[aria-label*="Stop" i]',
      messages:  '[data-testid="conversation-turn"], [class*="message"], [class*="response"], .message-bubble, article',
      model:     'button[aria-haspopup="menu"]',
    },
  };

  const host = location.hostname.replace(/^www\./, "");
  let SEL = BUILTIN[host] || BUILTIN["grok.com"];

  const pick = (list) => {
    for (const s of String(list || "").split(",").map((x) => x.trim()).filter(Boolean)) {
      const el = document.querySelector(s);
      if (el) return el;
    }
    return null;
  };
  const pickAll = (list) => {
    for (const s of String(list || "").split(",").map((x) => x.trim()).filter(Boolean)) {
      const els = document.querySelectorAll(s);
      if (els.length) return [...els];
    }
    return [];
  };

  /* Visible, and big enough to be a real composer. Kept as a LAST resort only -
     the per-site selector above is tried first, because "any visible textarea"
     is how you end up typing a business question into a rename dialog. */
  function composerFallback() {
    const nodes = [
      ...document.querySelectorAll("textarea"),
      ...document.querySelectorAll('[contenteditable="true"]'),
    ];
    return nodes.find((n) => {
      const r = n.getBoundingClientRect();
      return r.width > 200 && r.height > 20 && r.bottom > 0 && r.top < innerHeight;
    }) || null;
  }

  function setText(el, text) {
    el.focus();
    if (el.tagName === "TEXTAREA" || el.tagName === "INPUT") {
      const desc = Object.getOwnPropertyDescriptor(el.constructor.prototype, "value");
      if (desc && desc.set) desc.set.call(el, text);
      else el.value = text;
    } else {
      el.textContent = text;
    }
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }

  /* The model currently selected on the page, as the page itself displays it.
     Read, never set: reading survives a redesign far better than clicking through
     a menu, and a wrong model silently selected is worse than none reported. */
  function activeModel() {
    const el = pick(SEL.model);
    const t = (el && (el.innerText || el.textContent) || "").trim().split("\n")[0];
    return t && t.length <= 60 ? t : "";
  }

  const isStreaming = () => !!pick(SEL.streaming);

  /* ── MODEL LIST AND MODEL CHOICE ────────────────────────────────────────────
     The versions on offer are read from the site's own model menu, never from a
     list baked into this extension. That is the only way the choices match what
     THIS account is actually entitled to: a hardcoded list goes stale the day a
     provider ships a model, and it would offer versions the subscription cannot
     open. Read what is there; if a name is not in the menu, it is not available. */
  const MENU_ITEM = '[role="menuitem"], [role="option"], [role="menuitemradio"]';

  function menuOptions() {
    return [...document.querySelectorAll(MENU_ITEM)]
      .map((n) => ({ el: n, label: (n.innerText || "").trim().split("\n")[0] }))
      .filter((o) => o.label && o.label.length <= 60);
  }

  async function openModelMenu() {
    const btn = pick(SEL.model);
    if (!btn) return null;
    btn.click();
    for (let i = 0; i < 20; i++) {           /* up to 2s for the menu to render */
      await sleep(100);
      const opts = menuOptions();
      if (opts.length) return opts;
    }
    return [];
  }

  const closeMenu = () =>
    document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true }));

  async function listModels() {
    const opts = await openModelMenu();
    if (opts === null) return { ok: false, error: "No model menu found on this site." };
    const models = [...new Set(opts.map((o) => o.label))];
    closeMenu();
    await sleep(150);
    return { ok: true, models, active: activeModel(), host };
  }

  /* Selects a model. TWO VOCABULARIES MEET HERE, which is why this is not a
     plain equality test:

       - the OS sends ai_models.bridge_alias  -> "sonnet", "opus", "haiku"
       - the site's menu shows its own label  -> "Claude Sonnet 4.5"

     An exact match is tried first. Failing that, an alias that matches exactly
     ONE menu entry (case-insensitive, as a word or fragment) is accepted. If it
     matches none, or more than one, we REFUSE and list what is there - guessing
     between two versions would produce an answer nobody could attribute, which
     is the thing this build exists to prevent. */
  const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9.]+/g, " ").trim();

  async function selectModel(want) {
    const target = String(want || "").trim();
    if (!target) return { ok: true, model: activeModel() };
    if (activeModel() === target) return { ok: true, model: target };

    const opts = await openModelMenu();
    if (opts === null) return { ok: false, error: "No model menu found on this site." };
    if (!opts.length) return { ok: false, error: "The model menu opened but listed nothing." };

    let hit = opts.find((o) => o.label === target);
    if (!hit) {
      const t = norm(target);
      const near = opts.filter((o) => norm(o.label).includes(t));
      if (near.length === 1) hit = near[0];
      else if (near.length > 1) {
        closeMenu();
        return { ok: false, error: `"${target}" matches ${near.length} versions here (${near.map((o) => o.label).join(", ")}). Refusing to guess - name one exactly.` };
      }
    }
    if (!hit) {
      closeMenu();
      return { ok: false, error: `"${target}" is not offered on this account. Available: ${opts.map((o) => o.label).join(", ")}` };
    }

    hit.el.click();
    await sleep(400);
    /* Report what the page now shows, not what we asked for. If the click did
       not take, the answer must not claim a model it did not use. */
    return { ok: true, model: activeModel() || hit.label };
  }

  function replies() {
    return pickAll(SEL.messages)
      .map((n) => (n.innerText || "").trim())
      .filter((t) => t.length > 0);
  }
  const lastReply = () => { const r = replies(); return r.length ? r[r.length - 1] : ""; };

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  /* Returns { text, complete, why }. `complete` is only ever true when the site's
     own stop control went up and came back down, or - with no stop control found -
     the text held still for a full 8 seconds. Anything else is reported INCOMPLETE
     and the caller must not publish it. */
  async function awaitAnswer(baselineCount, budgetMs) {
    const started = Date.now();
    const left = () => budgetMs - (Date.now() - started);

    /* Phase 1: did generation start? Either the stop control appears, or a new
       message shows up. Give it 20s - a cold tab can be slow. */
    let sawStreaming = false;
    while (left() > 0 && Date.now() - started < 20000) {
      if (isStreaming()) { sawStreaming = true; break; }
      if (replies().length > baselineCount) break;
      await sleep(300);
    }

    /* Phase 2: wait for it to finish. */
    if (sawStreaming) {
      let goneFor = 0;
      while (left() > 0) {
        await sleep(400);
        if (isStreaming()) { goneFor = 0; continue; }
        goneFor += 400;
        /* 1.6s with the stop control absent - long enough to ride out the gap
           between two streamed chunks, short enough not to stall the queue. */
        if (goneFor >= 1600) {
          return { text: lastReply(), complete: true, why: "stop control cleared" };
        }
      }
      return { text: lastReply(), complete: false, why: "timed out while still generating" };
    }

    /* No stop control on this site (or it was missed). Fall back to text
       stability, but demand 8 SECONDS rather than the old 3.2 - and say in the
       result that this was a heuristic, so the OS can weigh it accordingly. */
    let last = "", stable = 0;
    while (left() > 0) {
      await sleep(500);
      const now = lastReply();
      if (now && now === last) stable += 500; else { last = now; stable = 0; }
      if (last && stable >= 8000) {
        return { text: last, complete: true, why: "text stable 8s (no stop control found)" };
      }
    }
    return { text: last, complete: false, why: "timed out waiting for the answer to settle" };
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (!msg) return;
    if (msg.type === "TG_BOTS_PING_TAB") {
      sendResponse({ ok: true, host });
      return;
    }
    if (msg.type !== "TG_BOTS_ASK" && msg.type !== "TG_BOTS_MODELS") return;
    (async () => {
      /* An OS-supplied selector set wins over the built-ins, so a provider
         redesign is fixed centrally instead of on every computer. */
      if (msg.selectors && typeof msg.selectors === "object") {
        SEL = { ...SEL, ...msg.selectors };
      }

      /* "What versions does THIS account actually have?" - read off the page. */
      if (msg.type === "TG_BOTS_MODELS") { sendResponse(await listModels()); return; }

      const question = String(msg.question || "").slice(0, 20000);
      if (!question) { sendResponse({ ok: false, error: "empty question" }); return; }

      /* Pick the requested version BEFORE asking. A refusal here is deliberate:
         answering on a different model than the one selected would be an
         unattributable result, and this OS does not accept those. */
      if (msg.model) {
        const sel = await selectModel(msg.model);
        if (!sel.ok) { sendResponse({ ok: false, error: sel.error, host }); return; }
      }

      const budget = Math.min(Math.max(Number(msg.budgetMs) || 180000, 30000), 600000);

      const baseline = replies().length;
      const box = pick(SEL.composer) || composerFallback();
      if (!box) {
        sendResponse({ ok: false, error: "No composer on this tab. Sign in, then leave the tab open." });
        return;
      }

      setText(box, question);
      await sleep(120);                       /* let the send button enable */
      const btn = pick(SEL.send);
      if (btn && !btn.disabled) btn.click();
      else box.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", bubbles: true }));

      const model = activeModel();
      const out = await awaitAnswer(baseline, budget);

      if (!out.text) {
        sendResponse({ ok: false, error: `No reply appeared (${out.why}). Stay signed in on this tab.`, model, host });
        return;
      }
      if (!out.complete) {
        /* THE IMPORTANT ONE. A partial answer is a failure, not a result. It is
           handed back as `partial` so a human can look, but ok is false and the
           OS must never publish it as an answer. */
        sendResponse({
          ok: false,
          error: `Answer was still being written when the time ran out (${out.why}). Not returning a partial answer as a complete one.`,
          partial: out.text.slice(0, 4000),
          model, host,
        });
        return;
      }
      /* The conversation URL, so the OS can keep asking in the SAME thread next
         time instead of starting a fresh chat per question. Two reasons that
         matters: the thread stays readable in your own Claude/GPT/Grok history
         on desktop or web, and the model keeps the context of what it already
         answered rather than meeting the work cold every time. */
      sendResponse({
        ok: true,
        reply: out.text.slice(0, 180000),
        model, host,
        completion: out.why,
        threadUrl: location.href,
      });
    })().catch((e) => sendResponse({ ok: false, error: String(e).slice(0, 200) }));
    return true;
  });
})();
