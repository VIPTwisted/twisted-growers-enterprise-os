const $ = (id) => document.getElementById(id);

function say(text, err) {
  const el = $("msg");
  el.hidden = false;
  el.textContent = text;
  el.classList.toggle("err", !!err);
}

const currentProvider = () =>
  (document.querySelector('input[name="provider"]:checked') || {}).value || "grok";

/* Fill the version dropdown. `known` is whatever we last read from the provider's
   own menu for this provider; `chosen` is what the user picked. We never invent a
   version name - an option that is not in the provider's menu is one the account
   cannot open, and offering it would only produce a refusal later. */
function paintModels(known, chosen) {
  const sel = $("model");
  sel.innerHTML = "";
  const blank = document.createElement("option");
  blank.value = "";
  blank.textContent = "Whatever the tab already has selected";
  sel.appendChild(blank);
  for (const m of known || []) {
    const o = document.createElement("option");
    o.value = m;
    o.textContent = m;
    sel.appendChild(o);
  }
  /* A previously chosen version that is no longer offered stays visible and
     marked, rather than silently reverting to the default and answering on
     something other than what was picked. */
  if (chosen && !(known || []).includes(chosen)) {
    const o = document.createElement("option");
    o.value = chosen;
    o.textContent = `${chosen} — not offered right now`;
    sel.appendChild(o);
  }
  sel.value = chosen || "";
}

async function load() {
  const s = await chrome.storage.local.get(["token", "provider", "botsUrl", "on", "models", "modelList"]);
  $("on").checked = s.on === true;
  $("token").value = s.token ? "••••••••" : "";
  $("token").dataset.set = s.token ? "1" : "";
  $("botsUrl").value = s.botsUrl || "";
  const p = s.provider || "grok";
  const radio = document.querySelector(`input[name="provider"][value="${p}"]`);
  if (radio) radio.checked = true;
  const lists = (s.modelList && typeof s.modelList === "object") ? s.modelList : {};
  const chosen = (s.models && typeof s.models === "object") ? s.models : {};
  paintModels(lists[p], chosen[p]);
}

/* Reads the provider's live model menu on the signed-in tab. */
$("loadModels").addEventListener("click", async () => {
  const provider = currentProvider();
  say("Reading the versions on your signed-in tab…");
  let r;
  try {
    r = await chrome.runtime.sendMessage({ type: "TG_BOTS_LIST_MODELS", provider });
  } catch (e) {
    say("Could not reach the tab: " + String(e).slice(0, 120), true);
    return;
  }
  if (!r || !r.ok) {
    say((r && r.error) || "No model menu found. Open and sign in to that site first.", true);
    return;
  }
  const s = await chrome.storage.local.get(["modelList", "models"]);
  const lists = (s.modelList && typeof s.modelList === "object") ? s.modelList : {};
  const chosen = (s.models && typeof s.models === "object") ? s.models : {};
  lists[provider] = r.models;
  await chrome.storage.local.set({ modelList: lists });
  paintModels(r.models, chosen[provider]);
  say(`${r.models.length} version${r.models.length === 1 ? "" : "s"} available${r.active ? ` · now on ${r.active}` : ""}.`);
});

$("model").addEventListener("change", async () => {
  const provider = currentProvider();
  const s = await chrome.storage.local.get(["models"]);
  const models = (s.models && typeof s.models === "object") ? s.models : {};
  models[provider] = $("model").value;
  await chrome.storage.local.set({ models });
  say($("model").value ? `Answers will use ${$("model").value}.` : "Answers will use whatever that tab has selected.");
});

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

/* Switching provider repaints the version list for THAT provider, so each one
   keeps its own choice instead of carrying a name across that does not exist there. */
document.querySelectorAll('input[name="provider"]').forEach((el) => {
  el.addEventListener("change", async () => {
    await chrome.storage.local.set({ provider: el.value });
    const s = await chrome.storage.local.get(["modelList", "models"]);
    const lists = (s.modelList && typeof s.modelList === "object") ? s.modelList : {};
    const chosen = (s.models && typeof s.models === "object") ? s.models : {};
    paintModels(lists[el.value], chosen[el.value]);
    say(lists[el.value] ? "" : "Press Load my versions to read what this account can open.");
  });
});

load();
