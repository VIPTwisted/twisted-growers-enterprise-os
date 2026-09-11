import { readFileSync } from "node:fs";

const PRODUCTION_PROJECT = "fxetuqjryttnypgepsru";

/** A preview URL alone does not isolate the database used by its JavaScript. */
export function assertPreviewSafety({ env, mode, clientSource }) {
  const context = env.CONTEXT || "";
  const isNetlify = env.NETLIFY === "true";
  const explicitlyPreview = mode === "preview" || mode === "staging";
  if (!context && !isNetlify && !explicitlyPreview) return;
  if (context === "production" && !explicitlyPreview) return;

  const match = clientSource.match(/^const URL = ["']https:\/\/([a-z0-9]+)\.supabase\.co["'];$/m);
  if (!match || match[1] === PRODUCTION_PROJECT) {
    throw new Error(
      "Preview blocked: the app still connects to the production database. " +
      "Provision and verify an isolated test environment before publishing a review build. " +
      "Changing VITE_SUPABASE_URL alone does not change this app's pinned client.",
    );
  }

  // A changed primary client is insufficient: direct function calls and the
  // downloadable browser extension also contain production connections today.
  // Keep previews closed until that full isolation has been implemented and tested.
  throw new Error(
    "Preview blocked: complete isolation of direct API calls and downloadable " +
    "extension assets has not yet been verified. No preview bypass is supported.",
  );
}

export function previewSafety({ env = process.env, clientPath }) {
  return {
    name: "tg-preview-safety",
    configResolved(config) {
      assertPreviewSafety({
        env,
        mode: config.mode,
        clientSource: readFileSync(clientPath, "utf8"),
      });
    },
  };
}
