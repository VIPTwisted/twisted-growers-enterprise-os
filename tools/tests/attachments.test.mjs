import assert from "node:assert/strict";
import test from "node:test";

import { existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { allowedAssistantUrl, attachmentBrief, prepareAttachments } from "../../bridge/attachments.mjs";

const base = "https://example.supabase.co";

test("attachment downloader accepts only the configured TG assistant bucket", () => {
  assert.equal(allowedAssistantUrl("https://example.supabase.co/storage/v1/object/public/assistant/chat/a.pdf", base), true);
  assert.equal(allowedAssistantUrl("https://example.supabase.co/storage/v1/object/public/other/a.pdf", base), false);
  assert.equal(allowedAssistantUrl("https://attacker.invalid/storage/v1/object/public/assistant/a.pdf", base), false);
  assert.equal(allowedAssistantUrl("file:///C:/secret.txt", base), false);
});

test("attachment prompt distinguishes analyzed files from failed downloads", () => {
  const brief = attachmentBrief({
    files: [{ name: "report.xlsx", type: "sheet", size: 12, path: "C:\\Temp\\report.xlsx" }],
    errors: ["bad.pdf: HTTP 404"],
  });
  assert.match(brief, /read and analyze their actual content/);
  assert.match(brief, /report\.xlsx/);
  assert.match(brief, /never imply the file was analyzed/);
});

test("attachment downloader verifies bytes, hash, overflow and cleanup", async t => {
  const prior = globalThis.fetch;
  const bytes = Buffer.from("actual spreadsheet bytes");
  globalThis.fetch = async () => new Response(bytes, {
    status: 200,
    headers: { "content-length": String(bytes.length), "content-type": "application/octet-stream" },
  });
  t.after(() => { globalThis.fetch = prior; });
  const prepared = await prepareAttachments([
    { name: "report.xlsx", url: `${base}/storage/v1/object/public/assistant/chat/report.xlsx` },
    { name: "overflow.pdf", url: `${base}/storage/v1/object/public/assistant/chat/overflow.pdf` },
  ], { baseUrl: base, maxFiles: 1, maxBytes: 1024 });
  assert.equal(prepared.files.length, 1);
  assert.deepEqual(readFileSync(prepared.files[0].path), bytes);
  assert.equal(prepared.files[0].sha256, createHash("sha256").update(bytes).digest("hex"));
  assert.match(prepared.errors[0], /overflow\.pdf: not downloaded/);
  const savedPath = prepared.files[0].path;
  await prepared.cleanup();
  assert.equal(existsSync(savedPath), false);
});
