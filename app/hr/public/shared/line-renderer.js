/* ═══════════════════════════════════════════════════════════════════════════
   VIP LINE RENDERER — the ONE forensic contract for every line-item cell (D5).
   Loaded sitewide by the nav. Any table that shows a transaction line MUST render
   its item cell through window.VIP_LINE.renderCell(line, ctx):
     • real item  → drill link to the item fix/edit page (vip_product_mgmt.html)
     • orphan     → red "⚠ Missing Item # — FIX" link, pre-filtered to that line,
                    where the user Searches/Creates a SKU → Attach (pos_attach_line_item)
                    → force-repost recomputes the day's KPIs.
   No line may ever render a missing item as silent plain text. Enforced by
   tools/site-guardrail.sh. Plain <script> IIFE global — no import/export.
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  function esc(s){ return String(s==null?'':s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];}); }

  function itemHref(ctx){
    if (window.VIP_ROUTE && VIP_ROUTE.drill) return VIP_ROUTE.drill('item', ctx);
    var q = new URLSearchParams();
    if (ctx.sku) q.set('sku', ctx.sku);
    if (ctx.itemId) q.set('item_id', ctx.itemId);
    q.set('entityId', ctx.entityId || 'all'); q.set('recordKind','item');
    if (ctx.transaction_id) q.set('transaction_id', ctx.transaction_id);
    if (ctx.lineId) q.set('lineId', ctx.lineId);
    if (ctx.label) q.set('label', ctx.label);
    return 'vip_product_mgmt.html?' + q.toString();
  }

  // line: {id, item_id, sku, name}   ctx: {transactionId, entityId}
  function renderCell(line, ctx){
    ctx = ctx || {};
    var hasItem = !!(line && (line.item_id || (line.sku && String(line.sku).trim())));
    if (hasItem){
      return '<a class="line-item-link" href="' + esc(itemHref({
        itemId: line.item_id||'', sku: line.sku||'', entityId: ctx.entityId,
        transaction_id: ctx.transactionId, label: 'Edit ' + (line.sku||'item')
      })) + '" onclick="event.stopPropagation()" style="color:var(--cyan,#00d4ff);text-decoration:none;font-weight:700">'
        + esc(line.sku || line.name || 'item') + '</a>';
    }
    // ORPHAN — clickable red fix-link, pre-filtered to this exact line
    return '<a class="fix-flag fix-flag--missing-item" href="' + esc(itemHref({
      itemId:'', sku:'', entityId: ctx.entityId, transaction_id: ctx.transactionId,
      lineId: line && line.id || '', label: 'Fix missing item'
    })) + '" onclick="event.stopPropagation()" '
      + 'style="color:#ff5252;font-weight:800;text-decoration:none;font-size:11px;white-space:nowrap;border:1px solid #ff5252;padding:1px 6px">'
      + '⚠ MISSING ITEM # — FIX</a>';
  }

  window.VIP_LINE = { renderCell: renderCell, itemHref: itemHref };
})();
