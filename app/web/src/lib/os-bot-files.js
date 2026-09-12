/* Bots desk documents. PDF, spreadsheet, Word, HTML from the answer on screen.
   No invented figures. If there are no live records, the file is the chat text. */

function slug(name) {
  return String(name || "document").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "document";
}

function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function wantedFormats(question) {
  const q = String(question || "");
  const out = [];
  if (/\bpdf\b/i.test(q)) out.push("pdf");
  if (/\b(xlsx|xls|csv|spreadsheet|excel)\b/i.test(q)) out.push("xls");
  if (/\b(docx|word document)\b/i.test(q) || /\bas (a )?word\b/i.test(q)) out.push("docx");
  if (/\bhtml\b/i.test(q) || /\bweb page\b/i.test(q)) out.push("html");
  return out;
}

function linesOf(text) {
  return String(text || "").replace(/\r\n/g, "\n").split("\n");
}

function tableOf(facts, text) {
  const rows = Array.isArray(facts) ? facts.filter((r) => r && typeof r === "object") : [];
  if (rows.length) {
    const skip = new Set(["label", "detail", "meta", "drill", "action"]);
    let keys = Object.keys(rows[0]).filter((k) => k !== "id" && !skip.has(k));
    if (!keys.length) keys = Object.keys(rows[0]).filter((k) => k !== "id").slice(0, 12);
    keys = keys.slice(0, 12);
    return {
      headers: keys,
      rows: rows.map((r) => keys.map((k) => r[k] == null ? "" : String(r[k]))),
    };
  }
  return { headers: ["Line"], rows: linesOf(text).filter(Boolean).map((l) => [l]) };
}

function downloadBlob(name, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return url;
}

function crc32(bytes) {
  let c = ~0;
  for (let i = 0; i < bytes.length; i += 1) {
    c ^= bytes[i];
    for (let j = 0; j < 8; j += 1) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function u16(n) {
  const b = new Uint8Array(2);
  b[0] = n & 255;
  b[1] = (n >>> 8) & 255;
  return b;
}
function u32(n) {
  const b = new Uint8Array(4);
  b[0] = n & 255;
  b[1] = (n >>> 8) & 255;
  b[2] = (n >>> 16) & 255;
  b[3] = (n >>> 24) & 255;
  return b;
}
function cat(parts) {
  const n = parts.reduce((a, p) => a + p.length, 0);
  const out = new Uint8Array(n);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

function zipStore(files) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  const enc = new TextEncoder();
  for (const f of files) {
    const name = enc.encode(f.name);
    const data = f.data;
    const crc = crc32(data);
    const local = cat([
      u32(0x04034b50), u16(20), u16(0), u16(0), u16(0), u16(0),
      u32(crc), u32(data.length), u32(data.length), u16(name.length), u16(0),
      name, data,
    ]);
    const central = cat([
      u32(0x02014b50), u16(20), u16(20), u16(0), u16(0), u16(0), u16(0),
      u32(crc), u32(data.length), u32(data.length), u16(name.length), u16(0),
      u16(0), u16(0), u16(0), u32(0), u32(offset), name,
    ]);
    locals.push(local);
    centrals.push(central);
    offset += local.length;
  }
  const center = cat(centrals);
  const end = cat([
    u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length),
    u32(center.length), u32(offset), u16(0),
  ]);
  return cat([...locals, center, end]);
}

function pdfEscape(s) {
  return String(s).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function makePdf(title, body) {
  const header = String(title || "OS document");
  const wrap = [];
  for (const line of linesOf(body)) {
    const t = line || " ";
    for (let i = 0; i < t.length; i += 92) wrap.push(t.slice(i, i + 92));
  }
  const pages = [];
  const per = 48;
  for (let i = 0; i < wrap.length; i += per) pages.push(wrap.slice(i, i + per));
  if (!pages.length) pages.push([" "]);
  const objs = [];
  const kids = [];
  let n = 3;
  const fontId = 3 + pages.length * 2;
  pages.forEach((pg) => {
    const contentId = n;
    const pageId = n + 1;
    n += 2;
    kids.push(pageId);
    let y = 742;
    const cmds = [`BT /F1 11 Tf 50 ${y} Td (${pdfEscape(header)}) Tj`];
    y -= 22;
    cmds.push(`/F1 10 Tf 50 ${y} Td`);
    for (const line of pg) {
      y -= 14;
      cmds.push(`T* (${pdfEscape(line)}) Tj`);
    }
    cmds.push("ET");
    const stream = cmds.join("\n");
    objs.push({ id: contentId, body: `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream` });
    objs.push({ id: pageId, body: `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${contentId} 0 R /Resources << /Font << /F1 ${fontId} 0 R >> >> >>` });
  });
  objs.push({ id: fontId, body: "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>" });
  const catalog = { id: 1, body: "<< /Type /Catalog /Pages 2 0 R >>" };
  const pagesObj = { id: 2, body: `<< /Type /Pages /Kids [${kids.map((id) => id + " 0 R").join(" ")}] /Count ${kids.length} >>` };
  const all = [catalog, pagesObj, ...objs].sort((a, b) => a.id - b.id);
  let out = "%PDF-1.4\n";
  const xref = [0];
  for (const o of all) {
    xref[o.id] = out.length;
    out += `${o.id} 0 obj\n${o.body}\nendobj\n`;
  }
  const start = out.length;
  out += `xref\n0 ${all.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= all.length; i += 1) {
    out += `${String(xref[i] || 0).padStart(10, "0")} 00000 n \n`;
  }
  out += `trailer << /Size ${all.length + 1} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`;
  return new Blob([out], { type: "application/pdf" });
}

function makeHtml(title, body, table) {
  const esc = (s) => String(s).replace(/&/g, "&").replace(/</g, "<").replace(/>/g, ">");
  const rows = (table.rows || []).map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`).join("");
  const head = (table.headers || []).map((h) => `<th>${esc(h)}</th>`).join("");
  const html = `<!doctype html><html lang="en"><meta charset="utf-8"><title>${esc(title)}</title>
<style>body{font:15px/1.45 system-ui,sans-serif;max-width:52rem;margin:2rem auto;color:#111;background:#fff}table{border-collapse:collapse;width:100%}th,td{border:1px solid #ccc;padding:.4rem .5rem;text-align:left}th{background:#f3f3f3}pre{white-space:pre-wrap}</style>
<h1>${esc(title)}</h1>
<p>From Twisted Growers OS chat on ${esc(stamp())}. Not a certified Metrc figure unless a named live view is in the table.</p>
${table.headers?.length > 1 ? `<table><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table>` : `<pre>${esc(body)}</pre>`}
</html>`;
  return new Blob([html], { type: "text/html;charset=utf-8" });
}

function makeXls(title, table) {
  const cell = (v) => `<Cell><Data ss:Type="String">${String(v).replace(/&/g, "&").replace(/</g, "<")}</Data></Cell>`;
  const header = `<Row>${(table.headers || []).map(cell).join("")}</Row>`;
  const body = (table.rows || []).map((r) => `<Row>${r.map(cell).join("")}</Row>`).join("");
  const xml = `<?xml version="1.0"?><?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
<Worksheet ss:Name="OS"><Table>
<Row><Cell><Data ss:Type="String">${String(title).replace(/&/g, "&")}</Data></Cell></Row>
<Row><Cell><Data ss:Type="String">From Twisted Growers OS. Not a certified Metrc figure unless a named live view is in this sheet.</Data></Cell></Row>
${header}${body}
</Table></Worksheet></Workbook>`;
  return new Blob([xml], { type: "application/vnd.ms-excel" });
}

function makeDocx(title, body) {
  const enc = new TextEncoder();
  const p = (t) => `<w:p><w:r><w:t xml:space="preserve">${String(t).replace(/&/g, "&").replace(/</g, "<")}</w:t></w:r></w:p>`;
  const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:body>
${p(title)}
${p("From Twisted Growers OS on " + stamp() + ". Not a certified Metrc figure unless a named live view is quoted.")}
${linesOf(body).map(p).join("")}
<w:sectPr><w:pgSz w:w="12240" w:h="15840"/></w:sectPr>
</w:body></w:document>`;
  const types = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;
  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;
  const zip = zipStore([
    { name: "[Content_Types].xml", data: enc.encode(types) },
    { name: "_rels/.rels", data: enc.encode(rels) },
    { name: "word/document.xml", data: enc.encode(document) },
  ]);
  return new Blob([zip], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
}

export function makeDocuments({ title, body, facts, formats, download }) {
  const name = slug(title) + "-" + stamp();
  const table = tableOf(facts, body);
  const text = [title, "", body].filter(Boolean).join("\n");
  const made = [];
  const kinds = formats && formats.length ? formats : ["pdf", "xls", "docx", "html"];
  for (const kind of kinds) {
    let blob;
    let file;
    if (kind === "pdf") { blob = makePdf(title, text); file = name + ".pdf"; }
    else if (kind === "xls") { blob = makeXls(title, table); file = name + ".xls"; }
    else if (kind === "docx") { blob = makeDocx(title, text); file = name + ".docx"; }
    else { blob = makeHtml(title, text, table); file = name + ".html"; }
    if (download) downloadBlob(file, blob);
    made.push({ kind, name: file, url: URL.createObjectURL(blob) });
  }
  return made;
}
