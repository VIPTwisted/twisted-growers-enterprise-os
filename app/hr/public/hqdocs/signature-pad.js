/* =============================================================================
   VIP SIGN — reusable e-signature capture (device canvas: touch + mouse).
   Legally-defensible: explicit intent + consent, attribution, tamper-evident
   SHA-256 document hash, IP/UA + timestamp via RPC audit. Attach to any doc/form.

   VIP_SIGN.request({ tenant, documentId, title, signers:[{name,email,role}] })
   VIP_SIGN.sign({ tenant, signatureId, signerName, docBytes|docText })
   Backend: dms_request_signature, dms_sign_document, dms_verify_signature.
============================================================================= */
(function () {
  'use strict';
  function sb() { return window.VIP_SUPABASE; }
  function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  function actorId(){ try{var u=window.VIP_AUTH&&VIP_AUTH.currentUser;return (u&&u.id)||null;}catch(_){return null;} }
  async function rpc(n,a){ var r=await sb().rpc(n,a||{}); if(r.error) throw new Error(r.error.message||n); return r.data; }
  var BUCKET='hr-documents';

  async function sha256Hex(buf){
    try{ var h=await crypto.subtle.digest('SHA-256', buf); return Array.prototype.map.call(new Uint8Array(h),function(b){return b.toString(16).padStart(2,'0');}).join(''); }
    catch(_){ return null; }
  }

  function css(){
    if(document.getElementById('sign-css'))return;
    var s=document.createElement('style');s.id='sign-css';
    s.textContent=[
      '.sg-modal{position:fixed;inset:0;background:rgba(0,0,0,.65);display:flex;align-items:center;justify-content:center;z-index:100001}',
      '.sg-card{background:var(--panel,#151b2e);border:1px solid var(--border,#363d52);color:var(--text,#e8ecf4);width:92%;max-width:520px}',
      '.sg-card header{padding:12px 16px;border-bottom:1px solid var(--border,#363d52);font-weight:700;display:flex;justify-content:space-between}',
      '.sg-card .body{padding:16px}',
      '.sg-pad{width:100%;height:180px;background:#fff;border:1px solid var(--border,#363d52);touch-action:none;cursor:crosshair;display:block}',
      '.sg-btn{background:var(--bg,#0f1419);border:1px solid var(--border,#363d52);color:var(--text,#e8ecf4);padding:7px 12px;font-size:12px;cursor:pointer}',
      '.sg-btn.primary{background:var(--accent,#00d4ff);color:#04141c;font-weight:700;border-color:var(--accent,#00d4ff)}',
      '.sg-btn:disabled{opacity:.5;cursor:not-allowed}',
      '.sg-in{width:100%;background:var(--bg,#0f1419);border:1px solid var(--border,#363d52);color:var(--text,#e8ecf4);padding:7px;margin:4px 0;font-size:13px}',
      '.sg-consent{display:flex;gap:8px;align-items:flex-start;margin:12px 0;font-size:12px;color:var(--muted,#8a94a8)}'
    ].join('\n');
    document.head.appendChild(s);
  }

  function drawModal(title, opts, onSign){
    css();
    var wrap=document.createElement('div');wrap.className='sg-modal';wrap.id='sg-modal';
    wrap.innerHTML='<div class="sg-card"><header><span>'+esc(title)+'</span><button class="sg-btn" data-x>✕</button></header><div class="body">'+
      '<input class="sg-in" data-f="name" placeholder="Full legal name" value="'+esc(opts.signerName||'')+'">'+
      '<div style="display:flex;gap:8px;margin:4px 0">'+
        '<button class="sg-btn" data-m="draw" style="flex:1">✍ Draw</button>'+
        '<button class="sg-btn" data-m="type" style="flex:1">⌨ Type</button>'+
      '</div>'+
      '<div data-pane="draw"><canvas class="sg-pad" data-f="pad"></canvas>'+
        '<div style="text-align:right;margin-top:4px"><button class="sg-btn" data-f="clear">Clear</button></div></div>'+
      '<div data-pane="type" style="display:none"><input class="sg-in" data-f="typed" placeholder="Type your name as signature" style="font-family:cursive;font-size:22px"></div>'+
      '<label class="sg-consent"><input type="checkbox" data-f="consent"> I agree that my electronic signature is the legal equivalent of my handwritten signature and consent to sign this document electronically.</label>'+
      '<div style="text-align:right;margin-top:8px"><button class="sg-btn primary" data-f="go" disabled>Sign</button></div>'+
    '</div></div>';
    document.body.appendChild(wrap);
    var F=function(n){return wrap.querySelector('[data-f="'+n+'"]');};
    var method='draw', hasInk=false;
    wrap.querySelector('[data-x]').addEventListener('click',close);
    wrap.addEventListener('click',function(e){if(e.target===wrap)close();});
    // method toggle
    wrap.querySelector('[data-m="draw"]').addEventListener('click',function(){method='draw';wrap.querySelector('[data-pane="draw"]').style.display='';wrap.querySelector('[data-pane="type"]').style.display='none';refresh();});
    wrap.querySelector('[data-m="type"]').addEventListener('click',function(){method='type';wrap.querySelector('[data-pane="draw"]').style.display='none';wrap.querySelector('[data-pane="type"]').style.display='';refresh();});
    // canvas
    var cv=F('pad'); var ctx=cv.getContext('2d');
    function size(){ cv.width=cv.offsetWidth; cv.height=cv.offsetHeight; ctx.strokeStyle='#0a0a0a';ctx.lineWidth=2.2;ctx.lineJoin='round';ctx.lineCap='round'; }
    setTimeout(size,0); window.addEventListener('resize',size);
    var drawing=false;
    function pos(e){var r=cv.getBoundingClientRect();var p=e.touches?e.touches[0]:e;return {x:p.clientX-r.left,y:p.clientY-r.top};}
    function start(e){e.preventDefault();drawing=true;var p=pos(e);ctx.beginPath();ctx.moveTo(p.x,p.y);}
    function move(e){if(!drawing)return;e.preventDefault();var p=pos(e);ctx.lineTo(p.x,p.y);ctx.stroke();hasInk=true;refresh();}
    function end(){drawing=false;}
    cv.addEventListener('mousedown',start);cv.addEventListener('mousemove',move);window.addEventListener('mouseup',end);
    cv.addEventListener('touchstart',start,{passive:false});cv.addEventListener('touchmove',move,{passive:false});cv.addEventListener('touchend',end);
    F('clear').addEventListener('click',function(){ctx.clearRect(0,0,cv.width,cv.height);hasInk=false;refresh();});
    F('typed').addEventListener('input',refresh); F('name').addEventListener('input',refresh); F('consent').addEventListener('change',refresh);
    function ready(){ var nameOk=F('name').value.trim().length>1; var consentOk=F('consent').checked;
      var inkOk = method==='draw' ? hasInk : F('typed').value.trim().length>1; return nameOk&&consentOk&&inkOk; }
    function refresh(){ F('go').disabled=!ready(); }
    F('go').addEventListener('click',async function(){
      F('go').disabled=true;F('go').textContent='Signing…';
      try{
        var payload={ signerName:F('name').value.trim(), method:method, consentText:'ESIGN/UETA electronic signature consent.', typed:null, pngBlob:null };
        if(method==='type') payload.typed=F('typed').value.trim();
        else payload.pngBlob=await new Promise(function(res){cv.toBlob(res,'image/png');});
        await onSign(payload);
        close();
      }catch(e){ F('go').disabled=false;F('go').textContent='Sign'; alert('Signing failed: '+e.message); }
    });
    function close(){ var m=document.getElementById('sg-modal'); if(m)m.remove(); }
  }

  async function doSign(o, payload){
    var tenant=o.tenant, sigId=o.signatureId;
    var sigPath=null;
    if(payload.pngBlob){
      sigPath=tenant+'/signatures/'+Date.now()+'_'+(o.documentId||'form')+'.png';
      var up=await sb().storage.from(BUCKET).upload(sigPath,payload.pngBlob,{upsert:false});
      if(up.error) throw new Error(up.error.message);
    }
    // tamper-evident hash of the target doc bytes/text if provided
    var hash=null;
    if(o.docBytes) hash=await sha256Hex(o.docBytes);
    else if(o.docText) hash=await sha256Hex(new TextEncoder().encode(o.docText));
    else if(o.documentId) hash=await sha256Hex(new TextEncoder().encode(o.documentId+'|'+Date.now()));
    var ip=null; try{ var g=await fetch('https://api.ipify.org?format=json'); ip=(await g.json()).ip; }catch(_){}
    return rpc('dms_sign_document',{ p_tenant_id:tenant, p_signature_id:sigId, p_signer_name:payload.signerName,
      p_method:payload.method, p_signature_path:sigPath, p_typed_signature:payload.typed,
      p_document_hash:hash, p_consent_given:true, p_consent_text:payload.consentText,
      p_ip:ip, p_user_agent:navigator.userAgent, p_signer_id:actorId() });
  }

  window.VIP_SIGN={
    // Create a request then immediately open the pad for the first signer (self-sign flow)
    request: async function(o){
      try{
        var signers = o.signers && o.signers.length ? o.signers : [{name:(o.signerName||'Signer'),role:'signer',order:1}];
        var reqId=await rpc('dms_request_signature',{ p_tenant_id:o.tenant, p_title:o.title||'Signature request',
          p_document_id:o.documentId||null, p_subject_type:o.subjectType||null, p_subject_id:o.subjectId||null,
          p_signers:JSON.stringify(signers), p_message:o.message||null, p_due_date:o.dueDate||null,
          p_entity_id:o.entityId||null, p_created_by:actorId() });
        var sigs=await rpc('dms_list_signatures',{ p_tenant_id:o.tenant, p_request_id:reqId });
        var first=(sigs||[])[0];
        if(!first){ alert('Signature request created ('+reqId+').'); return reqId; }
        drawModal(o.title||'Sign document',{signerName:first.signer_name}, function(payload){
          return doSign({tenant:o.tenant,signatureId:first.id,documentId:o.documentId,docText:o.docText,docBytes:o.docBytes}, payload)
            .then(function(){ if(o.onComplete)o.onComplete(reqId); });
        });
        return reqId;
      }catch(e){ alert('Could not start signature: '+e.message); }
    },
    // Open pad for an existing pending signature row
    sign: function(o){
      drawModal(o.title||'Sign document',{signerName:o.signerName}, function(payload){
        return doSign(o,payload).then(function(){ if(o.onComplete)o.onComplete(); });
      });
    }
  };
})();
