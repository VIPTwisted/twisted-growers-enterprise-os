#!/usr/bin/env node
/* ext-zip-fresh — the downloadable add-on must be the add-on in this repository.
 *
 * WHY THIS EXISTS. app/web/public/tg-ai-ext.zip is what a user actually downloads
 * and loads into Chrome. app/web/public/tg-ai-ext/ is what we edit and review. They
 * are two copies of the same thing, and nothing kept them together: on 8 Sep 2026
 * the zip went out four files stale - the source had the fixed completion detection
 * and the push-button setup, and the download still had the old build. Every review
 * would have passed, because the reviewed files were correct. The users would have
 * been running something else.
 *
 * That is the same shape as a green sync over a frozen mirror: the thing you
 * inspect is fine, the thing in use is not, and nothing compares them.
 *
 * Fails if any file differs, is missing from the zip, or exists only in the zip.
 * Fix by rebuilding the archive from the folder, then re-running.
 */
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const DIR = join(ROOT, "app/web/public/tg-ai-ext");
const ZIP = join(ROOT, "app/web/public/tg-ai-ext.zip");

/* LINE ENDINGS, and this cost a red CI run before it was understood.
 *
 * git normalises text on checkout: the same file is CRLF in a Windows working tree
 * and LF on Linux CI. The archive stores whatever bytes it was built from. So a raw
 * byte compare passes on the machine that built the zip and FAILS everywhere else -
 * a gate that is green for the author and red for everyone is worse than no gate.
 *
 * Text is therefore compared with CRLF normalised to LF. Binary (the icons) is
 * compared byte for byte, because normalising a PNG would corrupt the comparison
 * and hide a real difference. */
const TEXT = new Set([".js", ".json", ".txt", ".html", ".css", ".md"]);
const isText = (name) => TEXT.has((name.match(/\.[^.]+$/) || [""])[0].toLowerCase());

const md5 = (buf, name) => {
  const b = isText(name) ? Buffer.from(buf.toString("utf8").replace(/\r\n/g, "\n"), "utf8") : buf;
  return createHash("md5").update(b).digest("hex");
};

if (!existsSync(DIR) || !existsSync(ZIP)) {
  console.log("ext-zip-fresh: SKIP - no add-on folder or archive in this tree.");
  process.exit(0);
}

/* Read the archive with Node's own zip reading via a tiny inflate. Rather than add
   a dependency for one check, shell out to PowerShell's Expand-Archive equivalent
   through .NET, which is present on every machine this repo runs on and in CI on
   Windows. On any other platform, fall back to `unzip -p`. */
function zipEntries() {
  const ps = `
    Add-Type -AssemblyName System.IO.Compression.FileSystem;
    $a=[System.IO.Compression.ZipFile]::OpenRead('${ZIP.replace(/'/g, "''")}');
    foreach($e in $a.Entries){
      $s=$e.Open(); $ms=New-Object System.IO.MemoryStream; $s.CopyTo($ms);
      $b=$ms.ToArray(); $s.Close(); $ms.Close();
      Write-Output ($e.FullName + '|' + [System.Convert]::ToBase64String($b))
    }
    $a.Dispose();`;
  try {
    const out = execFileSync("powershell", ["-NoProfile", "-NonInteractive", "-Command", ps],
      { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
    /* PowerShell hands back raw base64 so the hashing - and the line-ending
       normalisation above - happens in ONE place for both platforms. Split on the
       FIRST pipe: base64 never contains one, but a path could. */
    return out.split(/\r?\n/).filter(Boolean).map((l) => {
      const i = l.indexOf("|");
      const name = l.slice(0, i).replace(/\\/g, "/");
      return { name, hash: md5(Buffer.from(l.slice(i + 1), "base64"), name) };
    });
  } catch {
    /* Not Windows, or PowerShell refused. Try unzip. */
    const list = execFileSync("unzip", ["-Z1", ZIP], { encoding: "utf8" }).split(/\r?\n/).filter(Boolean);
    return list.map((name) => ({
      name: name.replace(/\\/g, "/"),
      hash: md5(execFileSync("unzip", ["-p", ZIP, name], { maxBuffer: 64 * 1024 * 1024 }), name),
    }));
  }
}

let entries;
try {
  entries = zipEntries();
} catch (e) {
  console.error("ext-zip-fresh: FAIL - could not read " + ZIP);
  console.error("  " + String(e.message || e).split("\n")[0]);
  process.exit(1);
}

const problems = [];
const seen = new Set();

for (const { name, hash } of entries) {
  const rel = name.replace(/^tg-ai-ext\//, "");
  if (!rel) continue;                       /* the directory entry itself */
  seen.add(rel);
  const onDisk = join(DIR, rel);
  if (!existsSync(onDisk) || !statSync(onDisk).isFile()) {
    problems.push(`in the archive but not in the folder: ${rel}`);
    continue;
  }
  if (md5(readFileSync(onDisk), rel) !== hash) {
    problems.push(`STALE in the archive: ${rel}`);
  }
}

for (const f of readdirSync(DIR)) {
  if (statSync(join(DIR, f)).isFile() && !seen.has(f)) {
    problems.push(`in the folder but not in the archive: ${f}`);
  }
}

if (problems.length) {
  console.error("ext-zip-fresh: FAIL - the download does not match the reviewed source.");
  problems.forEach((p) => console.error("  " + p));
  console.error("");
  console.error("  Users download tg-ai-ext.zip. Reviewers read tg-ai-ext/. If they differ,");
  console.error("  every review passes and the users still run something else.");
  console.error("");
  console.error("  Rebuild it:");
  console.error("    powershell -Command \"Set-Location app/web/public; Remove-Item tg-ai-ext.zip -Force;\" \\");
  console.error("      \"Compress-Archive -Path tg-ai-ext -DestinationPath tg-ai-ext.zip -Force\"");
  process.exit(1);
}

console.log(`ext-zip-fresh: PASS - all ${seen.size} add-on files in the download match the source.`);
