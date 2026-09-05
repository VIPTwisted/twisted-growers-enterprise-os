/* TG Bots — runs on grok.com, claude.ai, chatgpt.com only.
   Types the question as plain text. Never eval. Never reads passwords. */
(function () {
  if (window.__tgBots) return;
  window.__tgBots = true;

  function composer() {
    const nodes = [
      ...document.querySelectorAll("textarea"),
      ...document.querySelectorAll('[contenteditable="true"]'),
    ];
    return nodes.find((n) => {
      const r = n.getBoundingClientRect();
      return r.width > 80 && r.height > 16 && r.bottom > 0;
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

  function sendButton() {
    const buttons = [...document.querySelectorAll("button")];
    return (
      buttons.find((b) => /send|submit/i.test(b.getAttribute("aria-label") || "")) ||
      buttons.find((b) => b.getAttribute("type") === "submit" && !b.disabled) ||
      null
    );
  }

  function lastReply(beforeCount) {
    const bubbles = [...document.querySelectorAll("[data-message-author-role], .message, article, [class*='message']")];
    const texts = bubbles
      .map((n) => (n.innerText || "").trim())
      .filter((t) => t.length > 20);
    if (texts.length <= beforeCount) return "";
    return texts[texts.length - 1] || "";
  }

  function waitReply(beforeCount) {
    return new Promise((resolve) => {
      let last = "";
      let stable = 0;
      const started = Date.now();
      const t = setInterval(() => {
        const now = lastReply(beforeCount);
        if (now && now === last) stable += 1;
        else { last = now; stable = 0; }
        if (last && stable >= 4) { clearInterval(t); resolve(last); }
        if (Date.now() - started > 120000) {
          clearInterval(t);
          resolve(last || "");
        }
      }, 800);
    });
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (!msg || msg.type !== "TG_BOTS_ASK") return;
    (async () => {
      const question = String(msg.question || "").slice(0, 20000);
      if (!question) { sendResponse({ ok: false, error: "empty question" }); return; }
      const before = lastReply(-1) ? 1 : 0;
      const box = composer();
      if (!box) {
        sendResponse({ ok: false, error: "No composer on this tab. Sign in, then leave the tab open." });
        return;
      }
      setText(box, question);
      const btn = sendButton();
      if (btn && !btn.disabled) btn.click();
      else box.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", bubbles: true }));
      const reply = await waitReply(before);
      if (!reply) sendResponse({ ok: false, error: "No reply appeared. Stay signed in on this tab." });
      else sendResponse({ ok: true, reply: reply.slice(0, 180000) });
    })().catch((e) => sendResponse({ ok: false, error: String(e).slice(0, 200) }));
    return true;
  });
})();
