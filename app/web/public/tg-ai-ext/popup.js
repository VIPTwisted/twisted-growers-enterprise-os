const $ = (id) => document.getElementById(id);

function say(text, err) {
  const el = $("msg");
  el.hidden = false;
  el.textContent = text;
  el.classList.toggle("err", !!err);
}

async function load() {
  const s = await chrome.storage.local.get(["token", "provider", "botsUrl", "on"]);
  $("on").checked = s.on === true;
  $("token").value = s.token ? "••••••••" : "";
  $("token").dataset.set = s.token ? "1" : "";
  $("botsUrl").value = s.botsUrl || "";
  const p = s.provider || "grok";
  const radio = document.querySelector(`input[name="provider"][value="${p}"]`);
  if (radio) radio.checked = true;
}

$("save").addEventListener("click", async () => {
  const provider = (document.querySelector('input[name="provider"]:checked') || {}).value || "grok";
  const botsUrl = $("botsUrl").value.trim();
  if (botsUrl) {
    try {
      const u = new URL(botsUrl);
      if (u.protocol !== "https:" || u.hostname.replace(/^www\./, "") !== "grok.com") {
        say("Grok Bots address must be https://grok.com/…", true);
        return;
      }
    } catch {
      say("That address is not a valid https link.", true);
      return;
    }
  }
  const typed = $("token").value.trim();
  const patch = { provider, botsUrl, on: $("on").checked };
  if (typed && typed !== "••••••••") patch.token = typed;
  if (!typed && !$("token").dataset.set) {
    say("Paste the bridge token first. It is the same one as the desktop file.", true);
    return;
  }
  await chrome.storage.local.set(patch);
  say("Saved on this computer only.");
});

$("clear").addEventListener("click", async () => {
  await chrome.storage.local.remove("token");
  $("token").value = "";
  $("token").dataset.set = "";
  say("Token removed from this computer.");
});

$("on").addEventListener("change", async () => {
  await chrome.storage.local.set({ on: $("on").checked });
});

document.querySelectorAll('input[name="provider"]').forEach((el) => {
  el.addEventListener("change", async () => {
    await chrome.storage.local.set({ provider: el.value });
  });
});

load();
