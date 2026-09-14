/* =============================================================================
   VIP FILTERS — reusable, config-driven filter bar. Mount on any page/tab.
   Each page declares only the fields it needs; onChange gets the value map.

   VIP_FILTERS.mount(elOrId, {
     fields: [
       { key:'search', type:'search', placeholder:'Search…' },
       { key:'entity', type:'select', label:'Entity', options:[{value,label}] },
       { key:'location', type:'select', label:'Location', options:[...] },
       { key:'from', type:'date', label:'From' }, { key:'to', type:'date', label:'To' },
       { key:'status', type:'select', label:'Status', options:[...] }
     ],
     onChange: function(values){ ... }         // debounced for search/text
   })  -> returns { values(), set(k,v), reset() }
============================================================================= */
(function () {
  'use strict';
  function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  function css(){
    if(document.getElementById('vf-css'))return;
    var s=document.createElement('style');s.id='vf-css';
    s.textContent=[
      '.vf-bar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:8px 0}',
      '.vf-bar label{font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:var(--muted,#8a94a8);margin-right:4px}',
      '.vf-bar input,.vf-bar select{background:var(--bg,#0f1419);border:1px solid var(--border,#363d52);color:var(--text,#e8ecf4);padding:6px 8px;font-size:12px}',
      '.vf-bar .vf-reset{background:transparent;border:1px solid var(--border,#363d52);color:var(--muted,#8a94a8);padding:6px 10px;font-size:12px;cursor:pointer}'
    ].join('\n');
    document.head.appendChild(s);
  }
  window.VIP_FILTERS = {
    mount: function (elOrId, cfg) {
      css();
      var el = typeof elOrId === 'string' ? document.getElementById(elOrId) : elOrId;
      if (!el) { console.warn('[filters] target not found', elOrId); return null; }
      var fields = cfg.fields || [], values = {};
      var html = '<div class="vf-bar">' + fields.map(function (f) {
        if (f.type === 'select') {
          return '<span><label>' + esc(f.label || f.key) + '</label><select data-k="' + f.key + '">' +
            (f.placeholder ? '<option value="">' + esc(f.placeholder) + '</option>' : '') +
            (f.options || []).map(function (o) { return '<option value="' + esc(o.value) + '">' + esc(o.label) + '</option>'; }).join('') +
            '</select></span>';
        }
        if (f.type === 'date') return '<span><label>' + esc(f.label || f.key) + '</label><input type="date" data-k="' + f.key + '"></span>';
        return '<input type="' + (f.type === 'search' ? 'search' : 'text') + '" data-k="' + f.key + '" placeholder="' + esc(f.placeholder || f.label || f.key) + '" style="min-width:160px">';
      }).join('') + '<button class="vf-reset" data-reset>Reset</button></div>';
      el.innerHTML = html;
      var t;
      function emit(now) { clearTimeout(t); if (now) return cfg.onChange && cfg.onChange(Object.assign({}, values)); t = setTimeout(function () { cfg.onChange && cfg.onChange(Object.assign({}, values)); }, 280); }
      el.querySelectorAll('[data-k]').forEach(function (n) {
        var k = n.getAttribute('data-k');
        var ev = (n.tagName === 'SELECT' || n.type === 'date') ? 'change' : 'input';
        n.addEventListener(ev, function () { values[k] = n.value || null; emit(ev === 'change'); });
      });
      el.querySelector('[data-reset]').addEventListener('click', function () {
        values = {}; el.querySelectorAll('[data-k]').forEach(function (n) { n.value = ''; }); emit(true);
      });
      return {
        values: function () { return Object.assign({}, values); },
        set: function (k, v) { values[k] = v; var n = el.querySelector('[data-k="' + k + '"]'); if (n) n.value = v == null ? '' : v; },
        reset: function () { el.querySelector('[data-reset]').click(); }
      };
    }
  };
})();
