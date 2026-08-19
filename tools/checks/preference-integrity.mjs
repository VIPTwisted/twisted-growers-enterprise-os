#!/usr/bin/env node
/* Account preferences may apply optimistically, but a failed write must be visible and must never be called saved. */
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const app = readFileSync(join(root, "app/web/src/App.jsx"), "utf8");
const budz = readFileSync(join(root, "app/web/src/budz.jsx"), "utf8");

const between = (source, start, end) => {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  return from >= 0 && to > from ? source.slice(from, to) : "";
};
const failures = [];
const need = (test, message) => { if (!test) failures.push(message); };

const prefs = between(app, "function usePrefs", "function useNav");
const settings = between(app, "function Settings", "function Help");
const brain = between(app, "function BrainScreen", "/* ---------- Tasks v1");
const shell = between(app, "export default function App", "const [navVersion");
const petPersist = between(budz, "const petPersist", "export function useBudzPet");
const petControls = between(budz, "export function PetControls", "export function BudzScreen");

need(prefs.includes("const { error } = await") && prefs.includes("announcePreferenceFailure"),
  "global theme/sidebar persistence does not surface its database error");
need(prefs.includes('state: "failed"') && prefs.includes("Saved on this device only"),
  "optimistic local preferences are not distinguished from an account save");
need(settings.includes("error: saveError") && settings.includes("if (saveError)"),
  "profile photo still claims saved without checking the user_settings write");
need(settings.includes("const { error } = await") && settings.includes("Canvas was not saved"),
  "canvas preference still ignores its database error");
need(brain.includes("Your TG Brain role was not saved") && brain.includes("TG Brain memory was not saved"),
  "TG Brain role or memory can still claim saved after a failed write");
need(shell.includes('window.addEventListener("tg-preference-error"'),
  "the application shell does not receive preference failures");
need(app.includes('role="alert"') && app.includes("was not saved to your account"),
  "preference failures have no visible alert surface");
need(petPersist.includes("error: userError") && petPersist.includes("announcePetPreferenceFailure"),
  "Budz pet persistence still swallows authentication or database errors");
need(petPersist.includes(".upsert(") && petPersist.includes('onConflict: "user_id"'),
  "Budz pet persistence can silently update zero rows for a new user");
need(petControls.includes("setNotify(previous)") && petControls.includes("preference was not saved"),
  "Budz notification toggles do not roll back and disclose a rejected write");
need(!/\.upsert\([^;]+\)\.then\(\(\)\s*=>\s*\{\}\)/s.test(prefs),
  "global preference upsert still has an empty completion handler");

if (failures.length) {
  console.error("preference-integrity: FAIL");
  failures.forEach((failure) => console.error(`  - ${failure}`));
  process.exit(1);
}
console.log("preference-integrity: PASS — account, Settings, TG Brain, and Budz preference failures remain visible and cannot claim success.");
