/* One real click. Chrome will not grant host access from a background
   worker or from the OS page — it has to be a button on an extension page. */
const ORIGINS = [
  "https://grok.com/*",
  "https://www.grok.com/*",
  "https://grok.x.ai/*",
  "https://x.ai/*",
  "https://*.x.ai/*",
  "https://x.com/*",
  "https://www.x.com/*",
  "https://claude.ai/*",
  "https://www.claude.ai/*",
  "https://chatgpt.com/*",
  "https://www.chatgpt.com/*",
  "https://chat.openai.com/*",
];

const msg = document.getElementById("msg");
function say(text, err) {
  msg.hidden = false;
  msg.textContent = text;
  msg.classList.toggle("err", !!err);
}

chrome.permissions.contains({ origins: ORIGINS }).then((have) => {
  if (have) say("Already allowed. Go back to the OS and ask HI.");
}).catch(() => {});

document.getElementById("allow").addEventListener("click", async () => {
  say("Asking Chrome…");
  let ok = false;
  try {
    ok = await chrome.permissions.request({ origins: ORIGINS });
  } catch (e) {
    say("Chrome refused: " + String(e && e.message ? e.message : e).slice(0, 180), true);
    return;
  }
  if (!ok) {
    say("You pressed Block. Press Allow so the OS can type into Grok.", true);
    return;
  }
  say("Allowed. Go back to the OS, tap Grok, ask HI.");
  try { await chrome.runtime.sendMessage({ type: "TG_BOTS_GRANTED" }); } catch { /* worker may be asleep */ }
});
