#!/usr/bin/env node
/* CHECK: a control a keyboard cannot reach is not a control.
 *
 * OWNER RULE, 8 Aug 2026: "always hard rule to review code and ensure MIT... microsoft google
 * standard or beat them. Nothing underpar."
 *
 * Accessibility is a HARD LAUNCH BLOCKER at both Google and Microsoft — not a nice-to-have, not
 * a later phase. Measured here on 8 Aug 2026, this platform had:
 *
 *     339 onClick handlers.  0 role= attributes.  4 aria-* attributes in total.
 *       App.jsx     313 onClick   0 role   4 aria
 *       kiosk.jsx    12 onClick   0 role   0 aria    <-- a SHARED FLOOR TERMINAL
 *       roster.jsx    5 onClick   0 role   0 aria
 *       hrdash.jsx    7 onClick   0 role   0 aria
 *       empfile.jsx   2 onClick   0 role   0 aria
 *
 * A click handler on a <div> is invisible to a keyboard and silent to a screen reader. The
 * kiosk is the worst possible place for it: a shared terminal, gloved hands, staff with varying
 * needs, no mouse.
 *
 * WHY A RATCHET AND NOT A CLIFF. 339 sites cannot be fixed in one sitting, and a gate that is
 * red on arrival gets switched off — that already happened here once, when --max-warnings 0 was
 * wired with 24 warnings outstanding. So the baselines below are the honest debt, they may only
 * FALL, and a NEW inaccessible control fails immediately.
 *
 * WHAT IT CHECKS
 *   1 · A click handler on a non-interactive element needs role AND tabIndex AND a key handler.
 *       <button> and <a href> are already interactive and need none of it.
 *   2 · Every <img> carries alt (alt="" is valid and means decorative — that is a decision).
 *   3 · No positive tabIndex. It hijacks document order; WCAG 2.4.3.
 *   4 · Every <input>/<select>/<textarea> has a label, aria-label or aria-labelledby.
 *
 * This is a static check on JSX, so it cannot prove a page is accessible — only that these four
 * classes of defect are not GROWING. Saying otherwise would be the vacuous-gate failure this
 * repository has already suffered twice.
 *
 *   node tools/checks/accessibility.mjs
 */
import { readdirSync, statSync, readFileSync, existsSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SRC = join(ROOT, "app", "web", "src");

/* BASELINES — MEASURED on 8 Aug 2026, not estimated. Lower as work lands; NEVER raise.
 *
 * A CORRECTION WORTH KEEPING. A raw grep counted 339 onClick and 0 role= and I reported that
 * as "none of them is keyboard-reachable". Wrong. Running this scanner gives 36: the other ~303
 * sit on <button> or on React components, which is correct practice and needs no role, tabIndex
 * or key handler. Counting a pattern and inferring meaning without checking what it is attached
 * to is the same error that read still_in_room_lb as a dry weight and called three cultivation
 * views a payroll leak. Measure with the tool, not with grep. */
const BASELINE = {
  clickWithoutKeyboard: 36,
  imgWithoutAlt: 0,
  positiveTabIndex: 0,
  inputWithoutLabel: 133,
};

const INTERACTIVE = /^(button|a|input|select|textarea|summary|label|option)$/i;

function jsxFiles(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (/node_modules|dist|build/.test(p)) continue;
    if (statSync(p).isDirectory()) jsxFiles(p, out);
    else if (/\.[jt]sx$/.test(e)) out.push(p);
  }
  return out;
}

/* Walk opening tags. Deliberately a scanner rather than a parser: it must never crash the build
   on syntax it does not understand, so anything ambiguous is SKIPPED rather than guessed at.
   A false pass is recoverable; a gate that dies on valid code gets deleted. */
function openingTags(src) {
  const tags = [];
  const re = /<([A-Za-z][A-Za-z0-9.]*)((?:[^<>'"]|'[^']*'|"[^"]*"|\{(?:[^{}]|\{[^{}]*\})*\})*?)(\/?)>/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    tags.push({ name: m[1], attrs: m[2] || "", index: m.index });
  }
  return tags;
}

const lineOf = (src, i) => src.slice(0, i).split("\n").length;

const found = { clickWithoutKeyboard: [], imgWithoutAlt: [], positiveTabIndex: [], inputWithoutLabel: [] };

for (const abs of jsxFiles(SRC)) {
  const rel = relative(ROOT, abs).split("\\").join("/");
  const src = readFileSync(abs, "utf8");

  for (const t of openingTags(src)) {
    const a = t.attrs;
    const at = `${rel}:${lineOf(src, t.index)} <${t.name}>`;
    const has = (re) => re.test(a);

    /* 1 · a control the keyboard cannot reach */
    if (has(/\bonClick\s*=/) && !INTERACTIVE.test(t.name) && !/^[A-Z]/.test(t.name)) {
      const reachable = has(/\brole\s*=/) && has(/\btabIndex\s*=/) &&
                        has(/\bonKey(Down|Press|Up)\s*=/);
      if (!reachable) found.clickWithoutKeyboard.push(at);
    }

    /* 2 · an image with no alt decision */
    if (/^img$/i.test(t.name) && !has(/\balt\s*=/)) found.imgWithoutAlt.push(at);

    /* 3 · positive tabIndex hijacks document order */
    const ti = a.match(/\btabIndex\s*=\s*\{?\s*["']?(-?\d+)/);
    if (ti && Number(ti[1]) > 0) found.positiveTabIndex.push(`${at} tabIndex=${ti[1]}`);

    /* 4 · a field nobody can identify. Hidden and submit inputs carry no label. */
    if (/^(input|select|textarea)$/i.test(t.name)) {
      const type = (a.match(/\btype\s*=\s*["']([a-z]+)["']/i) || [])[1] || "";
      if (!/^(hidden|submit|button|image|reset)$/i.test(type)) {
        if (!has(/\baria-label(ledby)?\s*=/) && !has(/\bid\s*=/) && !has(/\btitle\s*=/)) {
          found.inputWithoutLabel.push(at);
        }
      }
    }
  }
}

const LABELS = {
  clickWithoutKeyboard: "click handler on a non-interactive element with no role + tabIndex + key handler",
  imgWithoutAlt: "<img> with no alt (alt=\"\" is valid and means decorative)",
  positiveTabIndex: "positive tabIndex — hijacks document order, WCAG 2.4.3",
  inputWithoutLabel: "form field with no label, aria-label, id or title",
};

let failed = false;
for (const k of Object.keys(BASELINE)) {
  const n = found[k].length;
  if (n > BASELINE[k]) {
    failed = true;
    console.error(`accessibility: FAIL — ${n} ${k} (baseline ${BASELINE[k]}, +${n - BASELINE[k]}).`);
    console.error(`    ${LABELS[k]}`);
    found[k].slice(0, 12).forEach((x) => console.error(`      ${x}`));
    if (n > 12) console.error(`      … and ${n - 12} more`);
  } else {
    console.log(`accessibility: ok      — ${n} ${k}, baseline ${BASELINE[k]}${n < BASELINE[k] ? "  (improved — lower the baseline)" : ""}`);
  }
}

if (failed) {
  console.error("");
  console.error("Accessibility is a HARD LAUNCH BLOCKER at Google and at Microsoft. The owner's");
  console.error("standing rule is their standard or better, nothing under par.");
  console.error("");
  console.error("A click handler on a <div> is invisible to a keyboard and silent to a screen");
  console.error("reader. Use <button type=\"button\">, which needs no role, no tabIndex and no key");
  console.error("handler because the platform gives you all three. If it must be a div, it needs");
  console.error("role, tabIndex={0} and onKeyDown handling Enter and Space — all three, or none");
  console.error("of it works.");
  console.error("");
  console.error("Do NOT raise a baseline to go green. The baselines are the debt and may only fall.");
  process.exit(1);
}
console.log("accessibility: PASS — no new keyboard-unreachable controls, unlabelled fields or missing alt text.");
