/* =============================================================================
   VIP DOC VAULT — reusable, sitewide document-management primitive.
   Company-managed: folders (any depth), document types, retention policies,
   upload to private storage, full filters, reports/CSV export, legal-hold,
   external archive, destroy (retention + hold enforced), forensic audit.
   Nothing hardwired — all folders/types/retention are tenant data via RPC.

   Mount:  VIP_DOC_VAULT.mount(elOrId, { scope:'hr', entityId, locationId, admin:true })
   Backend RPCs: dms_* (see migrations dms_core / dms_rpcs_*).
   Palette: inherits site theme vars (register aurora). No rounded corners.
============================================================================= */
(function () {
  'use strict';

  var BUCKET = 'hr-documents';
  function sb() { return window.VIP_SUPABASE; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  // --- tenant/context resolution (reuse platform conventions) ----------------
  var _tenant = null;
  async function tenantId() {
    if (_tenant) return _tenant;
    try { var c = window.VIP_AUTH && VIP_AUTH.getEmployeeContext && VIP_AUTH.getEmployeeContext();
      if (c && c.tenant_id) return (_tenant = c.tenant_id); } catch (_) {}
    try { var r = await sb().from('locations').select('tenant_id').limit(1).maybeSingle();
      if (r && r.data && r.data.tenant_id) return (_tenant = r.data.tenant_id); } catch (_) {}
    return null;
  }
  function actorId() { try { var u = window.VIP_AUTH && VIP_AUTH.currentUser; return (u && u.id) || null; } catch (_) { return null; } }
  async function rpc(name, args) {
    var res = await sb().rpc(name, args || {});
    if (res.error) throw new Error(res.error.message || name + ' failed');
    return res.data;
  }

  // --- one-time styles (theme-var driven, square edges) ----------------------
  function injectCss() {
    if (document.getElementById('dv-css')) return;
    var s = document.createElement('style'); s.id = 'dv-css';
    s.textContent = [
      '.dv-wrap{display:grid;grid-template-columns:240px 1fr;gap:0;border:1px solid var(--border,#363d52);background:var(--panel,#151b2e);color:var(--text,#e8ecf4);font-size:13px}',
      '.dv-side{border-right:1px solid var(--border,#363d52);padding:10px;overflow:auto;max-height:640px}',
      '.dv-main{padding:12px;overflow:auto;max-height:640px}',
      '.dv-side h4{font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted,#8a94a8);margin:0 0 8px}',
      '.dv-folder{padding:5px 8px;cursor:pointer;border-left:2px solid transparent;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.dv-folder:hover{background:rgba(0,212,255,.08)}',
      '.dv-folder.active{background:rgba(0,212,255,.14);border-left-color:var(--accent,#00d4ff);color:var(--accent,#00d4ff)}',
      '.dv-toolbar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:10px}',
      '.dv-toolbar input,.dv-toolbar select{background:var(--bg,#0f1419);border:1px solid var(--border,#363d52);color:var(--text,#e8ecf4);padding:6px 8px;font-size:12px}',
      '.dv-btn{background:var(--bg,#0f1419);border:1px solid var(--border,#363d52);color:var(--text,#e8ecf4);padding:6px 10px;font-size:12px;cursor:pointer}',
      '.dv-btn:hover{border-color:var(--accent,#00d4ff);color:var(--accent,#00d4ff)}',
      '.dv-btn.primary{background:var(--accent,#00d4ff);color:#04141c;border-color:var(--accent,#00d4ff);font-weight:700}',
      '.dv-table{width:100%;border-collapse:collapse}',
      '.dv-table th{text-align:left;font-size:10px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted,#8a94a8);border-bottom:1px solid var(--border,#363d52);padding:7px 8px}',
      '.dv-table td{border-bottom:1px solid rgba(54,61,82,.5);padding:7px 8px;vertical-align:middle}',
      '.dv-table tr:hover td{background:rgba(0,212,255,.05)}',
      '.dv-name{cursor:pointer;color:var(--accent,#00d4ff)}',
      '.dv-badge{display:inline-block;padding:2px 7px;font-size:10px;font-weight:700;letter-spacing:.03em;border:1px solid}',
      '.dv-b-retained{color:#00e676;border-color:#00e676}',
      '.dv-b-expiring_soon{color:#ffd600;border-color:#ffd600}',
      '.dv-b-eligible_for_destruction{color:#ff6d00;border-color:#ff6d00}',
      '.dv-b-legal_hold{color:#7c4dff;border-color:#7c4dff}',
      '.dv-b-no_policy{color:#8a94a8;border-color:#8a94a8}',
      '.dv-b-destroyed{color:#ff1744;border-color:#ff1744}',
      '.dv-kpis{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px}',
      '.dv-kpi{border:1px solid var(--border,#363d52);padding:8px 12px;min-width:96px}',
      '.dv-kpi .n{font-size:20px;font-weight:800;color:var(--accent,#00d4ff)}',
      '.dv-kpi .l{font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:var(--muted,#8a94a8)}',
      '.dv-modal{position:fixed;inset:0;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;z-index:100000}',
      '.dv-card{background:var(--panel,#151b2e);border:1px solid var(--border,#363d52);max-width:640px;width:92%;max-height:86vh;overflow:auto}',
      '.dv-card header{padding:12px 16px;border-bottom:1px solid var(--border,#363d52);display:flex;justify-content:space-between;align-items:center;font-weight:700}',
      '.dv-card .body{padding:16px}',
      '.dv-row{display:flex;justify-content:space-between;gap:12px;padding:6px 0;border-bottom:1px solid rgba(54,61,82,.4)}',
      '.dv-row .k{color:var(--muted,#8a94a8)}',
      '.dv-drop{border:1px dashed var(--border,#363d52);padding:22px;text-align:center;color:var(--muted,#8a94a8);cursor:pointer}',
      '.dv-drop.drag{border-color:var(--accent,#00d4ff);color:var(--accent,#00d4ff)}',
      '.dv-muted{color:var(--muted,#8a94a8)}'
    ].join('\n');
    document.head.appendChild(s);
  }

  // --- Doc Vault instance ----------------------------------------------------
  function Vault(el, opts) {
    this.el = el; this.opts = opts || {};
    this.folders = []; this.types = []; this.docs = [];
    this.state = { folderId: null, search: '', typeId: '', status: '', legalHold: '', expiring: '', from: '', to: '' };
  }

  Vault.prototype.mount = async function () {
    injectCss();
    this.el.innerHTML = '<div class="dv-muted" style="padding:16px">Loading document vault…</div>';
    try {
      var t = await tenantId();
      if (!t) { this.el.innerHTML = '<div class="dv-muted" style="padding:16px">No tenant context — sign in required.</div>'; return; }
      this.tenant = t;
      await this.reloadConfig();
      this.render();
      await this.reloadDocs();
    } catch (e) {
      this.el.innerHTML = '<div style="padding:16px;color:#ff1744">Vault error: ' + esc(e.message) + '</div>';
    }
  };

  Vault.prototype.reloadConfig = async function () {
    var a = { p_tenant_id: this.tenant };
    var res = await Promise.all([ rpc('dms_list_folders', a), rpc('dms_list_document_types', a) ]);
    this.folders = res[0] || []; this.types = res[1] || [];
  };

  Vault.prototype.render = function () {
    var self = this;
    var typeOpts = '<option value="">All types</option>' + this.types.map(function (t) {
      return '<option value="' + t.id + '">' + esc(t.label) + '</option>'; }).join('');
    this.el.innerHTML =
      '<div class="dv-kpis" data-dv="kpis"></div>' +
      '<div class="dv-wrap">' +
        '<div class="dv-side">' +
          '<h4>Folders</h4><div data-dv="tree"></div>' +
          '<div style="margin-top:10px"><button class="dv-btn" data-dv="newfolder">+ New folder</button></div>' +
          (this.opts.admin ? '<div style="margin-top:6px"><button class="dv-btn" data-dv="settings">⚙ Retention & types</button></div>' : '') +
        '</div>' +
        '<div class="dv-main">' +
          '<div class="dv-toolbar">' +
            '<input data-dv="search" placeholder="Search name/description…" style="min-width:180px">' +
            '<select data-dv="type">' + typeOpts + '</select>' +
            '<select data-dv="status"><option value="">Any status</option><option value="retained">Retained</option><option value="expiring_soon">Expiring 90d</option><option value="eligible_for_destruction">Eligible to destroy</option><option value="legal_hold">Legal hold</option><option value="no_policy">No policy</option></select>' +
            '<input data-dv="from" type="date" title="From"><input data-dv="to" type="date" title="To">' +
            '<button class="dv-btn primary" data-dv="upload">⬆ Upload</button>' +
            '<button class="dv-btn" data-dv="export">⬇ Export CSV</button>' +
            '<button class="dv-btn" data-dv="report">📊 Report</button>' +
          '</div>' +
          '<div data-dv="list"><div class="dv-muted">Loading…</div></div>' +
        '</div>' +
      '</div>';
    this.renderTree();
    // wire toolbar
    var q = function (s) { return self.el.querySelector('[data-dv="' + s + '"]'); };
    q('search').addEventListener('input', function (e) { self.state.search = e.target.value; self.debounced(); });
    q('type').addEventListener('change', function (e) { self.state.typeId = e.target.value; self.reloadDocs(); });
    q('status').addEventListener('change', function (e) { self.state.status = e.target.value; self.reloadDocs(); });
    q('from').addEventListener('change', function (e) { self.state.from = e.target.value; self.reloadDocs(); });
    q('to').addEventListener('change', function (e) { self.state.to = e.target.value; self.reloadDocs(); });
    q('upload').addEventListener('click', function () { self.openUpload(); });
    q('export').addEventListener('click', function () { self.exportCsv(); });
    q('report').addEventListener('click', function () { self.openReport(); });
    q('newfolder').addEventListener('click', function () { self.newFolder(); });
    if (this.opts.admin) q('settings').addEventListener('click', function () { self.openSettings(); });
  };

  Vault.prototype.debounced = function () {
    var self = this; clearTimeout(this._t); this._t = setTimeout(function () { self.reloadDocs(); }, 300);
  };

  Vault.prototype.renderTree = function () {
    var self = this, host = this.el.querySelector('[data-dv="tree"]');
    var byParent = {}; this.folders.forEach(function (f) { (byParent[f.parent_folder_id || 'root'] = byParent[f.parent_folder_id || 'root'] || []).push(f); });
    function walk(pid, depth) {
      return (byParent[pid] || []).map(function (f) {
        var pad = 6 + depth * 14;
        var cls = 'dv-folder' + (self.state.folderId === f.id ? ' active' : '');
        return '<div class="' + cls + '" style="padding-left:' + pad + 'px" data-fid="' + f.id + '">📁 ' + esc(f.name) + '</div>' + walk(f.id, depth + 1);
      }).join('');
    }
    host.innerHTML = '<div class="dv-folder' + (self.state.folderId === null ? ' active' : '') + '" data-fid="">🗂 All documents</div>' + walk('root', 0);
    host.querySelectorAll('[data-fid]').forEach(function (n) {
      n.addEventListener('click', function () { self.state.folderId = n.getAttribute('data-fid') || null; self.renderTree(); self.reloadDocs(); });
    });
  };

  Vault.prototype.reloadDocs = async function () {
    var host = this.el.querySelector('[data-dv="list"]'); if (!host) return;
    host.innerHTML = '<div class="dv-muted">Loading…</div>';
    var s = this.state;
    var args = { p_tenant_id: this.tenant, p_folder_id: s.folderId || null,
      p_document_type_id: s.typeId || null, p_entity_id: this.opts.entityId || null,
      p_location_id: this.opts.locationId || null,
      p_status: (s.status && s.status !== 'legal_hold' && !/expiring|eligible|no_policy|retained/.test(s.status)) ? s.status : null,
      p_search: s.search || null, p_date_from: s.from || null, p_date_to: s.to || null,
      p_legal_hold: s.status === 'legal_hold' ? true : null,
      p_expiring_days: s.status === 'expiring_soon' ? 90 : null };
    try {
      var rows = await rpc('dms_list_documents', args) || [];
      // client-side refine for computed statuses
      if (/eligible_for_destruction|no_policy|retained/.test(s.status))
        rows = rows.filter(function (r) { return r.retention_status === s.status; });
      this.docs = rows; this.renderList(rows); this.renderKpis();
    } catch (e) { host.innerHTML = '<div style="color:#ff1744">' + esc(e.message) + '</div>'; }
  };

  Vault.prototype.renderKpis = async function () {
    var host = this.el.querySelector('[data-dv="kpis"]'); if (!host) return;
    try {
      var r = await rpc('dms_document_report', { p_tenant_id: this.tenant, p_report: 'summary' }) || {};
      var k = [['total','Total'],['legal_hold','Legal hold'],['expiring_90d','Expiring 90d'],['eligible_for_destruction','To destroy'],['archived_external','Archived'],['no_policy','No policy']];
      host.innerHTML = k.map(function (x) { return '<div class="dv-kpi"><div class="n">' + (r[x[0]] || 0) + '</div><div class="l">' + x[1] + '</div></div>'; }).join('');
    } catch (_) {}
  };

  Vault.prototype.renderList = function (rows) {
    var self = this, host = this.el.querySelector('[data-dv="list"]');
    if (!rows.length) { host.innerHTML = '<div class="dv-muted" style="padding:16px">No documents match these filters.</div>'; return; }
    host.innerHTML = '<table class="dv-table"><thead><tr>' +
      '<th>Name</th><th>Type</th><th>Folder</th><th>Uploaded</th><th>Retention</th><th>Status</th><th>Size</th><th></th>' +
      '</tr></thead><tbody>' + rows.map(function (d) {
        var days = d.days_to_retention == null ? '' : (d.days_to_retention < 0 ? 'overdue' : d.days_to_retention + 'd');
        return '<tr>' +
          '<td><span class="dv-name" data-open="' + d.id + '">' + esc(d.name) + '</span></td>' +
          '<td>' + esc(d.type_label || '—') + '</td>' +
          '<td>' + esc(d.folder_name || '—') + '</td>' +
          '<td>' + (d.created_at ? String(d.created_at).slice(0, 10) : '') + '</td>' +
          '<td>' + (d.retention_until || '—') + ' <span class="dv-muted">' + days + '</span></td>' +
          '<td><span class="dv-badge dv-b-' + d.retention_status + '">' + String(d.retention_status).replace(/_/g, ' ') + '</span></td>' +
          '<td>' + (d.size_bytes ? Math.round(d.size_bytes / 1024) + ' KB' : '') + '</td>' +
          '<td><button class="dv-btn" data-open="' + d.id + '">Open</button></td>' +
        '</tr>'; }).join('') + '</tbody></table>';
    host.querySelectorAll('[data-open]').forEach(function (n) {
      n.addEventListener('click', function () { self.openDoc(n.getAttribute('data-open')); }); });
  };

  // --- upload ----------------------------------------------------------------
  Vault.prototype.openUpload = function () {
    var self = this;
    var typeOpts = '<option value="">— type —</option>' + this.types.map(function (t) { return '<option value="' + t.id + '">' + esc(t.label) + '</option>'; }).join('');
    var folderOpts = '<option value="">— no folder —</option>' + this.folders.map(function (f) { return '<option value="' + f.id + '"' + (f.id === self.state.folderId ? ' selected' : '') + '>' + esc(f.name) + '</option>'; }).join('');
    modal('Upload document',
      '<div class="dv-drop" data-u="drop">Drop a file here or click to choose</div>' +
      '<input type="file" data-u="file" style="display:none">' +
      '<div data-u="fname" class="dv-muted" style="margin:8px 0"></div>' +
      '<div class="dv-row"><span class="k">Folder</span><select data-u="folder">' + folderOpts + '</select></div>' +
      '<div class="dv-row"><span class="k">Type</span><select data-u="type">' + typeOpts + '</select></div>' +
      '<div class="dv-row"><span class="k">Description</span><input data-u="desc" style="flex:1"></div>' +
      '<div style="margin-top:14px;text-align:right"><button class="dv-btn primary" data-u="go" disabled>Upload</button></div>',
      function (root) {
        var file = null;
        var drop = root.querySelector('[data-u="drop"]'), inp = root.querySelector('[data-u="file"]');
        var go = root.querySelector('[data-u="go"]');
        function pick(f) { file = f; root.querySelector('[data-u="fname"]').textContent = f ? (f.name + ' (' + Math.round(f.size / 1024) + ' KB)') : ''; go.disabled = !f; }
        drop.addEventListener('click', function () { inp.click(); });
        inp.addEventListener('change', function (e) { pick(e.target.files[0]); });
        ['dragover','dragenter'].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add('drag'); }); });
        ['dragleave','drop'].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove('drag'); }); });
        drop.addEventListener('drop', function (e) { if (e.dataTransfer.files[0]) pick(e.dataTransfer.files[0]); });
        go.addEventListener('click', async function () {
          if (!file) return; go.disabled = true; go.textContent = 'Uploading…';
          try {
            var path = self.tenant + '/' + (root.querySelector('[data-u="folder"]').value || 'unfiled') + '/' + Date.now() + '_' + file.name.replace(/[^A-Za-z0-9._-]/g, '_');
            var up = await sb().storage.from(BUCKET).upload(path, file, { upsert: false });
            if (up.error) throw new Error(up.error.message);
            await rpc('dms_upload_document', { p_tenant_id: self.tenant, p_name: file.name, p_storage_path: path,
              p_folder_id: root.querySelector('[data-u="folder"]').value || null,
              p_document_type_id: root.querySelector('[data-u="type"]').value || null,
              p_entity_id: self.opts.entityId || null, p_location_id: self.opts.locationId || null,
              p_mime_type: file.type || null, p_size_bytes: file.size,
              p_description: root.querySelector('[data-u="desc"]').value || null,
              p_uploaded_by: actorId() });
            closeModal(); self.reloadDocs();
          } catch (e) { go.disabled = false; go.textContent = 'Upload'; alert('Upload failed: ' + e.message); }
        });
      });
  };

  // --- document detail (drill + actions + audit) -----------------------------
  Vault.prototype.openDoc = async function (id) {
    var self = this, d = this.docs.filter(function (x) { return x.id === id; })[0]; if (!d) return;
    var canDestroy = d.retention_status === 'eligible_for_destruction' && !d.legal_hold;
    modal('Document — ' + esc(d.name),
      '<div class="dv-row"><span class="k">Type</span><span>' + esc(d.type_label || '—') + '</span></div>' +
      '<div class="dv-row"><span class="k">Folder</span><span>' + esc(d.folder_name || '—') + '</span></div>' +
      '<div class="dv-row"><span class="k">Uploaded</span><span>' + esc((d.created_at || '').slice(0, 19).replace('T', ' ')) + ' · ' + esc(d.uploaded_by_email || '') + '</span></div>' +
      '<div class="dv-row"><span class="k">Retention until</span><span>' + (d.retention_until || '—') + (d.retention_override ? ' (override)' : '') + '</span></div>' +
      '<div class="dv-row"><span class="k">Status</span><span class="dv-badge dv-b-' + d.retention_status + '">' + String(d.retention_status).replace(/_/g, ' ') + '</span></div>' +
      (d.archive_location ? '<div class="dv-row"><span class="k">Archived to</span><span>' + esc(d.archive_location) + '</span></div>' : '') +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:14px">' +
        '<button class="dv-btn primary" data-a="download">⬇ Download</button>' +
        '<button class="dv-btn" data-a="move">Move</button>' +
        '<button class="dv-btn" data-a="archive">Archive externally</button>' +
        '<button class="dv-btn" data-a="hold">' + (d.legal_hold ? 'Release hold' : 'Legal hold') + '</button>' +
        '<button class="dv-btn" data-a="override">Set retention</button>' +
        '<button class="dv-btn" data-a="sign">✍ Request signature</button>' +
        (canDestroy ? '<button class="dv-btn" data-a="destroy" style="border-color:#ff1744;color:#ff1744">Destroy</button>' : '') +
      '</div>' +
      '<h4 style="margin:16px 0 6px;font-size:11px;text-transform:uppercase;color:var(--muted,#8a94a8)">Audit trail</h4>' +
      '<div data-a="audit" class="dv-muted">Loading…</div>',
      function (root) {
        var A = function (n) { return root.querySelector('[data-a="' + n + '"]'); };
        A('download').addEventListener('click', function () { self.download(d); });
        A('move').addEventListener('click', function () { self.moveDoc(d); });
        A('archive').addEventListener('click', function () { self.archiveDoc(d); });
        A('hold').addEventListener('click', async function () { await rpc('dms_set_legal_hold', { p_tenant_id: self.tenant, p_document_id: d.id, p_hold: !d.legal_hold, p_actor: actorId() }); closeModal(); self.reloadDocs(); });
        A('override').addEventListener('click', function () { self.overrideRetention(d); });
        A('sign').addEventListener('click', function () { if (window.VIP_SIGN) VIP_SIGN.request({ tenant: self.tenant, documentId: d.id, title: 'Sign ' + d.name }); else alert('Signature module not loaded'); });
        if (canDestroy) A('destroy').addEventListener('click', async function () { if (!confirm('Destroy this document? This is permanent and logged.')) return; try { await rpc('dms_destroy_document', { p_tenant_id: self.tenant, p_document_id: d.id, p_actor: actorId(), p_reason: 'manual' }); closeModal(); self.reloadDocs(); } catch (e) { alert(e.message); } });
        self.loadAudit(d.id, root.querySelector('[data-a="audit"]'));
      });
  };

  Vault.prototype.loadAudit = async function (id, host) {
    try {
      var r = await sb().from('audit_log').select('occurred_at,action,actor_id,after,severity').eq('table_name', 'documents').eq('record_id', id).order('occurred_at', { ascending: false }).limit(50);
      var rows = (r.data || []);
      if (!rows.length) { host.innerHTML = '<span class="dv-muted">No audit events yet.</span>'; return; }
      host.innerHTML = '<table class="dv-table"><tbody>' + rows.map(function (e) {
        return '<tr><td>' + String(e.occurred_at).slice(0, 19).replace('T', ' ') + '</td><td>' + esc(e.action) + '</td><td class="dv-muted">' + esc(JSON.stringify(e.after || {})) + '</td></tr>'; }).join('') + '</tbody></table>';
    } catch (e) { host.innerHTML = '<span style="color:#ff1744">' + esc(e.message) + '</span>'; }
  };

  Vault.prototype.download = async function (d) {
    try { var r = await sb().storage.from(BUCKET).createSignedUrl(d.storage_path, 120);
      if (r.error) throw new Error(r.error.message);
      window.open(r.data.signedUrl, '_blank');
      await sb().from('audit_log').insert({ actor_id: actorId(), action: 'DMS_DOWNLOAD', table_name: 'documents', record_id: d.id, after: { name: d.name } });
    } catch (e) { alert('Download failed: ' + e.message); }
  };

  Vault.prototype.moveDoc = async function (d) {
    var opts = this.folders.map(function (f) { return f.id + '::' + f.name; });
    var pick = prompt('Move to folder (type exact name):\n' + this.folders.map(function (f) { return '• ' + f.name; }).join('\n'));
    if (!pick) return; var f = this.folders.filter(function (x) { return x.name.toLowerCase() === pick.toLowerCase(); })[0];
    if (!f) return alert('No folder named "' + pick + '"');
    await rpc('dms_move_document', { p_tenant_id: this.tenant, p_document_id: d.id, p_folder_id: f.id, p_actor: actorId() });
    closeModal(); this.reloadDocs();
  };
  Vault.prototype.archiveDoc = async function (d) {
    var loc = prompt('Where did you archive this externally? (e.g. "S3 cold-archive 2026", "Iron Mountain box #412")'); if (!loc) return;
    await rpc('dms_archive_external', { p_tenant_id: this.tenant, p_document_id: d.id, p_archive_location: loc, p_actor: actorId() });
    closeModal(); this.reloadDocs();
  };
  Vault.prototype.overrideRetention = async function (d) {
    var v = prompt('Set retention-until date (YYYY-MM-DD):', d.retention_until || ''); if (!v) return;
    await rpc('dms_set_retention_override', { p_tenant_id: this.tenant, p_document_id: d.id, p_retention_until: v, p_actor: actorId() });
    closeModal(); this.reloadDocs();
  };

  Vault.prototype.newFolder = async function () {
    var name = prompt('New folder name:'); if (!name) return;
    await rpc('dms_create_folder', { p_tenant_id: this.tenant, p_name: name, p_parent_folder_id: this.state.folderId || null, p_entity_id: this.opts.entityId || null, p_created_by: actorId() });
    await this.reloadConfig(); this.renderTree();
  };

  // --- reports / export ------------------------------------------------------
  Vault.prototype.exportCsv = function () {
    var rows = this.docs; if (!rows.length) return alert('Nothing to export.');
    var cols = ['name', 'type_label', 'folder_name', 'created_at', 'retention_until', 'retention_status', 'legal_hold', 'size_bytes', 'uploaded_by_email'];
    if (window.VIP_IO) return VIP_IO.exportCsv(rows, cols, 'documents');
    var csv = cols.join(',') + '\n' + rows.map(function (r) { return cols.map(function (c) { return '"' + String(r[c] == null ? '' : r[c]).replace(/"/g, '""') + '"'; }).join(','); }).join('\n');
    var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = 'documents.csv'; a.click();
  };
  Vault.prototype.openReport = async function () {
    var r = await rpc('dms_document_report', { p_tenant_id: this.tenant, p_report: 'summary' }) || {};
    modal('Document retention report',
      Object.keys(r).map(function (k) { return '<div class="dv-row"><span class="k">' + k.replace(/_/g, ' ') + '</span><span>' + r[k] + '</span></div>'; }).join('') +
      '<div style="margin-top:14px;text-align:right"><button class="dv-btn" data-r="csv">Export current list CSV</button></div>',
      function (root) { root.querySelector('[data-r="csv"]').addEventListener('click', function () { closeModal(); this._x; }.bind(this)); }.bind(this));
  };

  // --- admin settings (folders / types / retention) --------------------------
  Vault.prototype.openSettings = async function () {
    var self = this;
    var pols = await rpc('dms_list_retention_policies', { p_tenant_id: this.tenant }) || [];
    modal('Retention & document types',
      '<h4 style="font-size:11px;text-transform:uppercase;color:var(--muted,#8a94a8)">Retention policies</h4>' +
      '<table class="dv-table"><tbody>' + pols.map(function (p) {
        return '<tr><td>' + esc(p.name) + (p.is_default ? ' <span class="dv-muted">(default)</span>' : '') + '</td><td>' + p.retention_years + 'y ' + (p.retention_months || 0) + 'm</td><td class="dv-muted">' + esc(p.basis) + '</td></tr>'; }).join('') + '</tbody></table>' +
      '<div style="margin:8px 0"><button class="dv-btn" data-s="addpol">+ Add policy</button></div>' +
      '<h4 style="font-size:11px;text-transform:uppercase;color:var(--muted,#8a94a8);margin-top:16px">Document types</h4>' +
      '<table class="dv-table"><tbody>' + this.types.map(function (t) { return '<tr><td>' + esc(t.label) + '</td><td class="dv-muted">' + esc(t.key) + '</td></tr>'; }).join('') + '</tbody></table>' +
      '<div style="margin:8px 0"><button class="dv-btn" data-s="addtype">+ Add type</button></div>',
      function (root) {
        root.querySelector('[data-s="addtype"]').addEventListener('click', async function () {
          var label = prompt('Document type label (e.g. "W-4", "Contract"):'); if (!label) return;
          await rpc('dms_upsert_document_type', { p_tenant_id: self.tenant, p_key: label, p_label: label, p_actor: actorId() });
          await self.reloadConfig(); closeModal(); self.openSettings();
        });
        root.querySelector('[data-s="addpol"]').addEventListener('click', async function () {
          var name = prompt('Policy name (e.g. "Payroll 4yr"):'); if (!name) return;
          var yrs = parseInt(prompt('Retention years:', '7') || '7', 10);
          var def = confirm('Make this the tenant DEFAULT policy? OK = yes.');
          await rpc('dms_upsert_retention_policy', { p_tenant_id: self.tenant, p_name: name, p_retention_years: yrs, p_is_default: def, p_actor: actorId() });
          if (confirm('Recompute retention on existing documents now?')) await rpc('dms_recompute_retention', { p_tenant_id: self.tenant, p_actor: actorId() });
          closeModal(); self.openSettings(); self.reloadDocs();
        });
      });
  };

  // --- modal helpers ---------------------------------------------------------
  function modal(title, bodyHtml, wire) {
    closeModal();
    var m = document.createElement('div'); m.className = 'dv-modal'; m.id = 'dv-modal';
    m.innerHTML = '<div class="dv-card"><header><span>' + esc(title) + '</span><button class="dv-btn" data-x>✕</button></header><div class="body">' + bodyHtml + '</div></div>';
    document.body.appendChild(m);
    m.addEventListener('click', function (e) { if (e.target === m) closeModal(); });
    m.querySelector('[data-x]').addEventListener('click', closeModal);
    if (wire) wire(m);
  }
  function closeModal() { var m = document.getElementById('dv-modal'); if (m) m.remove(); }

  // --- public API ------------------------------------------------------------
  window.VIP_DOC_VAULT = {
    mount: function (elOrId, opts) {
      var el = typeof elOrId === 'string' ? document.getElementById(elOrId) : elOrId;
      if (!el) { console.warn('[doc-vault] mount target not found', elOrId); return null; }
      var v = new Vault(el, opts || {}); v.mount(); return v;
    }
  };
})();
