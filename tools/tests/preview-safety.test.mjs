import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { assertPreviewSafety, previewSafety } from "../../app/web/build/preview-safety.mjs";

const clientPath = new URL("../../app/web/src/lib/supabase.js", import.meta.url);
const clientSource = readFileSync(clientPath, "utf8");

test("approved production and ordinary local builds retain their pinned connection", () => {
  for (const env of [{ CONTEXT: "production", NETLIFY: "true" }, {}]) {
    assert.doesNotThrow(() => assertPreviewSafety({ env, mode: "production", clientSource }));
  }
});

test("Netlify previews, branch deploys and unknown hosted contexts fail closed", () => {
  for (const context of ["deploy-preview", "branch-deploy", "dev", "unexpected", ""]) {
    assert.throws(
      () => assertPreviewSafety({ env: { CONTEXT: context, NETLIFY: "true" }, mode: "production", clientSource }),
      /Preview blocked:.*production database/,
    );
  }
});

test("explicit local preview modes cannot inherit the production exception", () => {
  for (const mode of ["preview", "staging"]) {
    for (const env of [{}, { CONTEXT: "production" }]) {
      assert.throws(() => assertPreviewSafety({ env, mode, clientSource }), /Preview blocked/);
    }
  }
});

test("environment variable substitution cannot pretend the pinned client is isolated", () => {
  const env = {
    CONTEXT: "deploy-preview",
    VITE_SUPABASE_URL: "https://isolatedtest.supabase.co",
    VITE_SUPABASE_ANON_KEY: "public-test-key",
  };
  assert.throws(() => assertPreviewSafety({ env, clientSource }), /pinned client/);
});

test("unrecognized client wiring and partial isolation remain blocked", () => {
  for (const source of ["const URL = process.env.URL;", 'const URL = "https://isolatedtest.supabase.co";']) {
    assert.throws(
      () => assertPreviewSafety({ env: { CONTEXT: "deploy-preview" }, clientSource: source }),
      /Preview blocked/,
    );
  }
});

test("Vite hook rejects the real production client before emitting a preview", () => {
  const plugin = previewSafety({ env: { CONTEXT: "deploy-preview" }, clientPath });
  assert.throws(() => plugin.configResolved({ mode: "production" }), /production database/);
});
