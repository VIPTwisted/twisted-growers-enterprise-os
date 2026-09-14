/* =============================================================================
   VIP ONBOARDING ADMIN — create new-hire packets, get the share link, track.
   Mount: VIP_ONBOARDING.mount(elOrId, { entityId, locationId })
   Backend: onboarding_create_packet / onboarding_list_packets / onboarding_get_packet
   Guest link: <origin>/onboarding.html?token=<token>  (works on any device)
============================================================================= */
(function () {
  'use strict';
  function sb(){return window.VIP_SUPABASE;}
  function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  function actorId(){try{var u=window.VIP_AUTH&&VIP_AUTH.currentUser;return (u&&u.id)||null;}catch(_){return null;}}
  async function rpc(n,a){var r=await sb().rpc(n,a||{});if(r.error)throw new Error(r.error.message||n);return r.data;}
  var _t=null;
  async function tenantId(){ if(_t)return _t;
    try{var c=window.VIP_AUTH&&VIP_AUTH.getEmployeeContext&&VIP_AUTH.getEmployeeContext();if(c&&c.tenant_id)return (_t=c.tenant_id);}catch(_){}
    try{var r=await sb().from('locations').select('tenant_id').limit(1).maybeSingle();if(r&&r.data)return (_t=r.data.tenant_id);}catch(_){}
    return null; }
  function linkFor(token){ return location.origin + location.pathname.replace(/[^\/]*$/,'') + 'onboarding.html?token=' + token; }

  function css(){ if(document.getElementById('onb-css'))return; var s=document.createElement('style');s.id='onb-css';
    s.textContent=[
      '.onb-toolbar{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px}',
      '.onb-toolbar input{background:var(--bg,#0f1419);border:1px solid var(--border,#363d52);color:var(--text,#e8ecf4);padding:7px 9px;font-size:13px}',
      '.onb-btn{background:var(--accent,#00d4ff);color:#04141c;border:none;padding:8px 14px;font-weight:700;cursor:pointer;font-size:13px}',
      '.onb-btn.sec{background:var(--bg,#0f1419);color:var(--text,#e8ecf4);border:1px solid var(--border,#363d52)}',
      '.onb-table{width:100%;border-collapse:collapse}',
      '.onb-table th{text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:var(--muted,#8a94a8);border-bottom:1px solid var(--border,#363d52);padding:7px}',
      '.onb-table td{border-bottom:1px solid rgba(54,61,82,.5);padding:7px}',
      '.onb-badge{padding:2px 8px;font-size:10px;font-weight:700;border:1px solid}',
      '.onb-link{background:var(--panel2,#1a2236);border:1px solid var(--accent,#00d4ff);padding:10px;margin:8px 0;word-break:break-all;font-size:12px;color:var(--accent,#00d4ff)}'
    ].join('\n'); document.head.appendChild(s); }

  function Admin(el,opts){this.el=el;this.opts=opts||{};}
  Admin.prototype.mount=async function(){
    css(); this.el.innerHTML='<div style="color:var(--muted,#8a94a8);padding:12px">Loading onboarding…</div>';
    this.tenant=await tenantId();
    if(!this.tenant){ this.el.innerHTML='<div style="padding:12px;color:var(--muted,#8a94a8)">Sign in required.</div>'; return; }
    this.render(); this.reload();
  };
  Admin.prototype.render=function(){
    var self=this;
    this.el.innerHTML=
      '<div class="onb-toolbar">'+
        '<input data-o="name" placeholder="New hire full name">'+
        '<input data-o="email" placeholder="Email (for the link)">'+
        '<input data-o="pos" placeholder="Position">'+
        '<button class="onb-btn" data-o="create">+ Create packet &amp; link</button>'+
      '</div>'+
      '<div data-o="newlink"></div>'+
      '<div data-o="list"><div style="color:var(--muted,#8a94a8)">Loading…</div></div>';
    this.el.querySelector('[data-o="create"]').addEventListener('click',function(){self.create();});
  };
  Admin.prototype.create=async function(){
    var name=this.el.querySelector('[data-o="name"]').value.trim();
    var email=this.el.querySelector('[data-o="email"]').value.trim();
    var pos=this.el.querySelector('[data-o="pos"]').value.trim();
    if(!name){ alert('Enter the new hire name.'); return; }
    try{
      var r=await rpc('onboarding_create_packet',{p_tenant_id:this.tenant,p_candidate_name:name,p_candidate_email:email||null,p_position:pos||null,p_entity_id:this.opts.entityId||null,p_location_id:this.opts.locationId||null,p_created_by:actorId()});
      var link=linkFor(r.token);
      this.el.querySelector('[data-o="newlink"]').innerHTML=
        '<div class="onb-link">'+esc(link)+'</div>'+
        '<div class="onb-toolbar"><button class="onb-btn" data-c="copy">Copy link</button>'+
        (email?'<button class="onb-btn sec" data-c="mail">Open email to '+esc(email)+'</button>':'')+
        '<span style="color:var(--muted,#8a94a8);font-size:12px;align-self:center">Share by text/email — opens on any phone or tablet, no login.</span></div>';
      var box=this.el.querySelector('[data-o="newlink"]');
      box.querySelector('[data-c="copy"]').addEventListener('click',function(){navigator.clipboard.writeText(link);this.textContent='Copied ✓';}.bind(box.querySelector('[data-c="copy"]')));
      var mail=box.querySelector('[data-c="mail"]');
      if(mail) mail.addEventListener('click',function(){ location.href='mailto:'+encodeURIComponent(email)+'?subject='+encodeURIComponent('Your onboarding paperwork')+'&body='+encodeURIComponent('Welcome! Please complete your new-hire onboarding here (works on your phone):\n\n'+link); });
      this.el.querySelector('[data-o="name"]').value=''; this.el.querySelector('[data-o="email"]').value=''; this.el.querySelector('[data-o="pos"]').value='';
      this.reload();
    }catch(e){ alert('Could not create packet: '+e.message); }
  };
  Admin.prototype.reload=async function(){
    var host=this.el.querySelector('[data-o="list"]');
    try{
      var rows=await rpc('onboarding_list_packets',{p_tenant_id:this.tenant})||[];
      if(!rows.length){ host.innerHTML='<div style="color:var(--muted,#8a94a8);padding:8px">No packets yet. Create one above.</div>'; return; }
      var colors={draft:'#8a94a8',sent:'#ffd600',in_progress:'#00d4ff',submitted:'#00e676',completed:'#00e676',void:'#ff1744'};
      host.innerHTML='<table class="onb-table"><thead><tr><th>New hire</th><th>Position</th><th>Status</th><th>Created</th><th></th></tr></thead><tbody>'+
        rows.map(function(p){var c=colors[p.status]||'#8a94a8';
          return '<tr><td>'+esc(p.candidate_name)+'</td><td>'+esc(p.position||'—')+'</td>'+
            '<td><span class="onb-badge" style="color:'+c+';border-color:'+c+'">'+esc(p.status)+'</span></td>'+
            '<td>'+String(p.created_at||'').slice(0,10)+'</td>'+
            '<td><button class="onb-btn sec" data-copy="'+p.id+'">Link</button></td></tr>';
        }).join('')+'</tbody></table>';
      var self=this;
      host.querySelectorAll('[data-copy]').forEach(function(b){ b.addEventListener('click',async function(){
        var d=await rpc('onboarding_get_packet',{p_tenant_id:self.tenant,p_packet_id:b.getAttribute('data-copy')});
        if(d&&d.invite&&d.invite.token){ var lk=linkFor(d.invite.token); navigator.clipboard.writeText(lk); b.textContent='Copied ✓'; }
      }); });
    }catch(e){ host.innerHTML='<div style="color:#ff1744">'+esc(e.message)+'</div>'; }
  };

  window.VIP_ONBOARDING={ mount:function(elOrId,opts){var el=typeof elOrId==='string'?document.getElementById(elOrId):elOrId; if(!el){console.warn('[onboarding] target not found');return null;} var a=new Admin(el,opts||{}); a.mount(); return a; } };
})();
