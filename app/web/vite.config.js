import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { execFileSync } from "node:child_process";

/* THE BUILD STAMP — the missing half of tools/checks/deploy-current.mjs.
 *
 * That tool exists because of the owner's 11 Aug 2026 ruling ("THERE IS NO AGENT
 * MONITORING WHAT FAILS SILENT, WHEN AGENTS DEPLOY IF IT FAILS") and it reads a
 * stamp described as "injected by vite.config.js" — but no injection was ever
 * committed, so the assertion has failed on every deploy since it was written,
 * green ones included: "the live site carries NO build stamp." Found 12 Aug 2026
 * while confirming the 4dec42b deploy; the deploy list said ready and the house
 * tool still could not say WHICH commit was serving. This closes that hole.
 *
 * The commit comes from Netlify's own COMMIT_REF in CI, from git locally, and is
 * stamped "unknown" only when both are unavailable — deploy-current treats
 * "unknown" as its own finding rather than a pass, which is correct: absence
 * must be explained, never blank (A3). Two meta tags in <head>; nothing the
 * user sees changes.
 */
function buildStamp() {
  let commit = process.env.COMMIT_REF || "";
  if (!commit) {
    try { commit = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(); }
    catch { commit = "unknown"; }
  }
  return { commit, at: new Date().toISOString() };
}
const stamp = buildStamp();

export default defineConfig({
  plugins: [
    react(),
    {
      name: "tg-build-stamp",
      transformIndexHtml(html) {
        return html.replace(
          "</head>",
          `  <meta name="tg-build-commit" content="${stamp.commit}">\n` +
          `  <meta name="tg-build-at" content="${stamp.at}">\n</head>`,
        );
      },
    },
  ],
});
