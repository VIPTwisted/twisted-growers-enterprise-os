import { createWriteStream } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { createHash } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";

const DEFAULT_SUPABASE_URL = "https://fxetuqjryttnypgepsru.supabase.co";

export function allowedAssistantUrl(raw, base = process.env.TG_SUPABASE_URL || DEFAULT_SUPABASE_URL) {
  try {
    const url = new URL(String(raw || ""));
    const expected = new URL(base);
    return url.protocol === "https:" && url.host === expected.host &&
      url.pathname.startsWith("/storage/v1/object/public/assistant/");
  } catch {
    return false;
  }
}

function safeName(value, index) {
  const cleaned = String(value || `attachment-${index}`)
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, "_")
    .replace(/^\.+/, "")
    .slice(0, 180);
  return `${String(index + 1).padStart(3, "0")}-${cleaned || `attachment-${index}`}`;
}

export async function prepareAttachments(attachments, options = {}) {
  const rows = Array.isArray(attachments) ? attachments : [];
  if (!rows.length) return { files: [], errors: [], cleanup: async () => {} };

  const maxFiles = Number(options.maxFiles || process.env.TG_ATTACHMENT_MAX_FILES || 100);
  const maxBytes = Number(options.maxBytes || process.env.TG_ATTACHMENT_MAX_BYTES || 268435456);
  const baseUrl = options.baseUrl || process.env.TG_SUPABASE_URL || DEFAULT_SUPABASE_URL;
  const root = await mkdtemp(path.join(os.tmpdir(), "tg-codex-attachments-"));
  const files = [];
  const errors = [];

  for (const [index, row] of rows.slice(maxFiles).entries()) {
    errors.push(`${String(row?.name || `attachment-${maxFiles + index + 1}`).replace(/[\r\n]+/g, " ")}: not downloaded because the configured limit is ${maxFiles} files`);
  }

  for (const [index, row] of rows.slice(0, maxFiles).entries()) {
    const url = String(row?.url || "");
    const name = String(row?.name || `attachment-${index + 1}`);
    if (!allowedAssistantUrl(url, baseUrl)) {
      errors.push(`${name}: refused URL outside the TG assistant upload bucket`);
      continue;
    }
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(60000) });
      if (!response.ok || !response.body) throw new Error(`download returned HTTP ${response.status}`);
      const declared = Number(response.headers.get("content-length") || row?.size || 0);
      if (maxBytes > 0 && declared > maxBytes) throw new Error(`file exceeds ${maxBytes} bytes`);
      let received = 0;
      const hash = createHash("sha256");
      const counter = new Transform({
        transform(chunk, _encoding, callback) {
          received += chunk.length;
          if (maxBytes > 0 && received > maxBytes) callback(new Error(`file exceeds ${maxBytes} bytes`));
          else { hash.update(chunk); callback(null, chunk); }
        },
      });
      const localPath = path.join(root, safeName(name, index));
      await pipeline(Readable.fromWeb(response.body), counter, createWriteStream(localPath, { flags: "wx" }));
      files.push({
        name,
        path: localPath,
        type: String(row?.type || response.headers.get("content-type") || "application/octet-stream"),
        size: received,
        sha256: hash.digest("hex"),
      });
    } catch (error) {
      errors.push(`${name}: ${String(error?.message || error).slice(0, 300)}`);
    }
  }

  return {
    files,
    errors,
    cleanup: async () => {
      const resolved = path.resolve(root);
      if (resolved.startsWith(path.resolve(os.tmpdir()) + path.sep) && path.basename(resolved).startsWith("tg-codex-attachments-")) {
        await rm(resolved, { recursive: true, force: true });
      }
    },
  };
}

export function attachmentBrief(prepared) {
  const lines = [];
  if (prepared.files?.length) {
    lines.push("FILES UPLOADED BY THE SIGNED-IN OS USER (read and analyze their actual content):");
    for (const file of prepared.files) {
      const name = String(file.name || "attachment").replace(/[\r\n]+/g, " ");
      const type = String(file.type || "application/octet-stream").replace(/[\r\n]+/g, " ");
      lines.push(`- ${name} | ${type} | ${file.size} bytes | sha256 ${file.sha256 || "not-recorded"} | local path: ${file.path}`);
    }
  }
  if (prepared.errors?.length) {
    lines.push("ATTACHMENT FAILURES (state these plainly; never imply the file was analyzed):");
    for (const error of prepared.errors) lines.push(`- ${String(error).replace(/[\r\n]+/g, " ")}`);
  }
  return lines.length ? `\n\n${lines.join("\n")}` : "";
}
