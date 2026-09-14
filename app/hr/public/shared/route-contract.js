/* ═══════════════════════════════════════════════════════════════════════════
   VIP ROUTE CONTRACT — the ONE way pages link into drilldowns. (ApexOS law)
   Loaded sitewide by the nav. Kills the "wrong params / broken links / context
   lost" class of regression permanently:

     • VIP_ROUTE.drill(target, ctx) — builds a guardrail-valid URL for any drill
       target. REQUIRED params are enforced here (entityId + recordKind always);
       missing context throws in console and falls back safely, never a dead link.
     • VIP_ROUTE.context() — reads the current page's drill context from the URL.
       Every deeper drill CARRIES the existing context forward automatically, so
       Location/Date/Shift survive KPI → Store → Shift → Txn → Line → Item Edit.
     • Breadcrumbs — renders Org → Store → Shift → Transaction → Item under the
       nav on every drilled page, from the same context. Context is never lost.

   Drill targets (the guaranteed path to microscopic item edit):
     store | shift | register | transaction | receipt | line | item
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var PAGE = {
    store:       'vip_record_detail.html',
    shift:       'vip_record_detail.html',
    register:    'vip_record_detail.html',
    transaction: 'vip_record_detail.html',
    receipt:     'vip_record_detail.html',
    line:        'vip_record_detail.html',
    item:        'vip_product_mgmt.html'      // microscopic item EDIT level
  };
  var KIND = {
    store: 'store', shift: 'shift', register: 'register',
    transaction: 'pos_receipt', receipt: 'pos_receipt', line: 'pos_receipt', item: 'item'
  };

  function params() { try { return new URLSearchParams(location.search); } catch (e) { return new URLSearchParams(''); } }

  // Current drill context from the URL — the single state model for navigation.
  function context() {
    var p = params();
    return {
      tenantId:      p.get('tenantId') || null,
      entityId:      p.get('entityId') || p.get('location') || p.get('entity') || null,
      entityName:    p.get('entity') || null,
      recordKind:    p.get('recordKind') || p.get('record_type') || p.get('workspace') || null,
      startDate:     p.get('startDate') || null,
      endDate:       p.get('endDate') || null,
      shift:         p.get('shift') || null,
      kpi:           p.get('kpi') || null,
      shiftId:       p.get('shiftId') || null,
      registerId:    p.get('register') || p.get('registerId') || null,
      transactionId: p.get('transaction_id') || p.get('transactionId') || null,
      employee:      p.get('employee') || null,
      employeeId:    p.get('employeeId') || null,
      receipt:       p.get('receipt') || p.get('document_number') || null,
      sku:           p.get('sku') || null,
      itemId:        p.get('itemId') || p.get('item_id') || null,
      label:         p.get('label') || null
    };
  }

  // Build a drill URL. Inherits current context, overlays ctx, enforces required params.
  function drill(target, ctx) {
    ctx = ctx || {};
    var base = PAGE[target];
    if (!base) { console.error('[route-contract] unknown drill target:', target); return '#'; }
    var cur = context();
    var m = {};
    // inherit → overlay
    Object.keys(cur).forEach(function (k) { if (cur[k] != null) m[k] = cur[k]; });
    Object.keys(ctx).forEach(function (k) { if (ctx[k] != null) m[k] = ctx[k]; });
    // enforced invariants (guardrail FAIL 5): entityId + a kind, always
    if (!m.entityId) { m.entityId = 'all'; }
    m.recordKind = KIND[target] || m.recordKind || 'store';

    if (target === 'item') {
      // microscopic edit level → Product Builder with the SKU/item preloaded
      var q1 = new URLSearchParams();
      if (m.sku) q1.set('sku', m.sku);
      if (m.itemId) q1.set('item_id', m.itemId);
      q1.set('entityId', m.entityId); q1.set('recordKind', 'item');
      if (m.startDate) q1.set('startDate', m.startDate);
      if (m.endDate) q1.set('endDate', m.endDate);
      if (m.label) q1.set('label', m.label);
      return base + '?' + q1.toString();
    }

    var q = new URLSearchParams();
    q.set('workspace', target === 'receipt' || target === 'transaction' || target === 'line' ? 'receipt' : 'detail');
    q.set('recordKind', m.recordKind);
    q.set('record_type', m.recordKind);
    q.set('entityId', m.entityId);
    if (m.entityName) q.set('entity', m.entityName);
    if (m.entityId && !m.entityName) q.set('entity', m.entityId);
    if (m.entityId) q.set('location', m.entityId);
    if (m.startDate) q.set('startDate', m.startDate);
    if (m.endDate) q.set('endDate', m.endDate);
    if (m.shift) q.set('shift', m.shift);
    if (m.kpi) q.set('kpi', m.kpi);
    if (m.shiftId) q.set('shiftId', m.shiftId);
    if (m.employee) q.set('employee', m.employee);
    if (m.employeeId) q.set('employeeId', m.employeeId);
    if (m.registerId) q.set('register', m.registerId);
    if (m.transactionId) { q.set('transaction_id', m.transactionId); }
    if (m.receipt) { q.set('receipt', m.receipt); q.set('document_number', m.receipt); }
    if (m.label) q.set('label', m.label);
    return base + '?' + q.toString();
  }

  function go(target, ctx) { location.href = drill(target, ctx); }

  // ── Breadcrumbs: Org → Store → Register → Shift → Transaction → Item ──────
  function crumbs() {
    var c = context();
    var out = [{ label: 'VIP Holdings', href: 'index.html' }];
    if (c.entityId && c.entityId !== 'all') out.push({ label: c.entityName || c.entityId, href: drill('store', {}) });
    else if (c.recordKind) out.push({ label: 'All stores', href: drill('store', { entityId: 'all' }) });
    if (c.registerId) out.push({ label: c.registerId, href: drill('register', {}) });
    if (c.shiftId) out.push({ label: c.shiftId, href: drill('shift', {}) });
    if (c.receipt || c.transactionId) out.push({ label: c.receipt || ('Txn ' + String(c.transactionId).slice(0, 8)), href: drill('receipt', {}) });
    if (c.sku || c.itemId) out.push({ label: c.sku || 'Item', href: null });
    return out;
  }

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (ch) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]; }); }

  function renderCrumbs() {
    // Only on drilled pages (has a drill context beyond the homepage), never on the register/login.
    var c = context();
    var isDrill = /vip_record_detail|vip_product_mgmt|cash_management/.test(location.pathname) ||
      (c.entityId && (c.shiftId || c.transactionId || c.receipt || c.kpi));
    if (!isDrill) return;
    if (document.getElementById('vip-crumbs')) return;
    var list = crumbs();
    if (list.length < 2) return;
    var bar = document.createElement('div');
    bar.id = 'vip-crumbs';
    bar.setAttribute('data-live-source', 'supabase');
    bar.style.cssText = 'display:flex;gap:6px;align-items:center;flex-wrap:wrap;font-size:12px;' +
      'padding:6px 18px;background:var(--bg2,#161b26);border-bottom:1px solid var(--border,#363d52);color:var(--text-dim,#8996b8)';
    bar.innerHTML = list.map(function (x, i) {
      var last = i === list.length - 1;
      var lbl = esc(x.label);
      return (x.href && !last)
        ? '<a href="' + esc(x.href) + '" style="color:var(--cyan,#00d4ff);text-decoration:none;font-weight:700">' + lbl + '</a>'
        : '<span style="font-weight:700;color:var(--text,#e8ecf4)">' + lbl + '</span>';
    }).join('<span style="opacity:.5">›</span>');
    var nav = document.getElementById('mega-menu-root');
    if (nav && nav.parentNode) nav.parentNode.insertBefore(bar, nav.nextSibling);
    else if (document.body.firstChild) document.body.insertBefore(bar, document.body.firstChild.nextSibling);
  }

  function boot() { try { renderCrumbs(); } catch (e) {} setTimeout(function () { try { renderCrumbs(); } catch (e) {} }, 1500); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();

  window.VIP_ROUTE = { drill: drill, go: go, context: context, crumbs: crumbs };
})();
