export function downloadBlob(name: string, text: string, type = "text/html") {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export function printHtml(title: string, html: string) {
  const w = window.open("", "_blank", "noopener,width=900,height=700");
  if (!w) return;
  w.document.write(
    `<!doctype html><html><head><title>${title}</title><style>
      body{font:14px/1.45 Georgia,serif;color:#111;padding:28px;max-width:720px}
      h1{font-size:20px;margin:0 0 6px} .k{font:11px/1.2 system-ui;letter-spacing:.12em;text-transform:uppercase;color:#555}
      table{width:100%;border-collapse:collapse;margin:12px 0} td{padding:6px 8px;border-top:1px solid #ddd;vertical-align:top}
      td:first-child{width:38%;color:#444} .gap{color:#b00} .ok{color:#166}
    </style></head><body>${html}</body></html>`,
  );
  w.document.close();
  w.focus();
  w.print();
}
