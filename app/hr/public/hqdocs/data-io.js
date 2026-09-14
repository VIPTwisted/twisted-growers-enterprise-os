/* =============================================================================
   VIP IO — reusable import/export utility, mountable anywhere.
   VIP_IO.exportCsv(rows, cols, filename)
   VIP_IO.exportJson(rows, filename)
   VIP_IO.importCsv(onRows)   -> opens file picker, parses CSV -> array of objects
   VIP_IO.print(html, title)  -> printable report window
============================================================================= */
(function () {
  'use strict';
  function download(text, mime, filename) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: mime }));
    a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  }
  function cell(v) { return '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"'; }

  function parseCsv(text) {
    var rows = [], row = [], val = '', q = false, i = 0, c;
    for (; i < text.length; i++) { c = text[i];
      if (q) { if (c === '"') { if (text[i + 1] === '"') { val += '"'; i++; } else q = false; } else val += c; }
      else if (c === '"') q = true;
      else if (c === ',') { row.push(val); val = ''; }
      else if (c === '\n' || c === '\r') { if (val !== '' || row.length) { row.push(val); rows.push(row); row = []; val = ''; } if (c === '\r' && text[i + 1] === '\n') i++; }
      else val += c; }
    if (val !== '' || row.length) { row.push(val); rows.push(row); }
    if (!rows.length) return [];
    var head = rows.shift();
    return rows.map(function (r) { var o = {}; head.forEach(function (h, j) { o[h.trim()] = r[j]; }); return o; });
  }

  window.VIP_IO = {
    exportCsv: function (rows, cols, filename) {
      cols = cols || (rows[0] ? Object.keys(rows[0]) : []);
      var csv = cols.map(cell).join(',') + '\n' +
        rows.map(function (r) { return cols.map(function (c) { return cell(r[c]); }).join(','); }).join('\n');
      download(csv, 'text/csv;charset=utf-8', (filename || 'export') + '.csv');
    },
    exportJson: function (rows, filename) { download(JSON.stringify(rows, null, 2), 'application/json', (filename || 'export') + '.json'); },
    importCsv: function (onRows) {
      var inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.csv,text/csv';
      inp.addEventListener('change', function (e) {
        var f = e.target.files[0]; if (!f) return;
        var rd = new FileReader(); rd.onload = function () { try { onRows(parseCsv(String(rd.result)), f); } catch (err) { alert('Import parse error: ' + err.message); } };
        rd.readAsText(f);
      });
      inp.click();
    },
    parseCsv: parseCsv,
    print: function (html, title) {
      var w = window.open('', '_blank', 'width=900,height=700');
      w.document.write('<html><head><title>' + (title || 'Report') + '</title>' +
        '<style>body{font-family:Arial,Helvetica,sans-serif;padding:24px;color:#111}h1{font-size:18px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #ccc;padding:6px 8px;font-size:12px;text-align:left}</style>' +
        '</head><body>' + html + '</body></html>');
      w.document.close(); w.focus(); setTimeout(function () { w.print(); }, 250);
    }
  };
})();
