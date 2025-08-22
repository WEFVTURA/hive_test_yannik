import { getSupabase, db_getSpace, db_updateSpace, db_listShares } from '../lib/supabase.js';

export async function renderSpaceSettings(root, spaceId){
  const space = await db_getSpace(spaceId).catch(()=>({ id: spaceId, name: 'Space', visibility: 'private', settings: {} }));
  const shares = await db_listShares(spaceId).catch(()=>[]);
  const storedColor = (typeof localStorage!=='undefined') ? (localStorage.getItem('space_color_'+spaceId)||'') : '';
  const palette = ['#7c3aed','#2563eb','#059669','#f59e0b','#e11d48','#06b6d4','#a855f7'];
  const currentPublicPerm = (space.settings && space.settings.public_permissions) ? String(space.settings.public_permissions) : 'view';

  root.setAttribute('data-view','space-settings');
  root.innerHTML = `
    <div class="content-head">
      <div class="title"><h2>Space Settings</h2><span class="muted" style="margin-left:8px">${space.name||''}</span></div>
      <div class="view-controls"><button class="button ghost" id="backToSpace">Back to space</button></div>
    </div>
    <div class="content-body">
      <div class="lib-card" style="padding:16px; display:grid; gap:14px; max-width:760px">
        <div class="field"><label>Name</label><input id="spName" value="${space.name||''}"></div>
        <div class="field"><label>Visibility</label>
          <select id="spVis">
            <option value="private" ${space.visibility==='private'?'selected':''}>Private</option>
            <option value="team" ${space.visibility==='team'?'selected':''}>Team</option>
            <option value="public" ${space.visibility==='public'?'selected':''}>Public</option>
          </select>
        </div>
        <div class="field" id="spPublicPermWrap" style="${space.visibility==='public'?'':'display:none'}">
          <label>Public Permissions</label>
          <select id="spPublicPerm">
            <option value="view" ${currentPublicPerm==='view'?'selected':''}>View only</option>
            <option value="edit" ${currentPublicPerm==='edit'?'selected':''}>Allow note edits by registered users</option>
          </select>
        </div>
        <div class="field"><label>Color</label>
          <div id="spColors" style="display:flex; gap:8px">
            ${palette.map(c=>`<button class='button' data-color='${c}' title='${c}' style='width:26px; height:26px; padding:0; border-radius:999px; background:${c}; border:2px solid ${storedColor===c?'#fff':'var(--border)'}'></button>`).join('')}
            <button class='button' data-color='' title='None' style='width:26px; height:26px; padding:0; border-radius:999px; background:transparent'>✕</button>
          </div>
        </div>
        <div class="field"><label>Share with users</label>
          <div style="display:flex; gap:8px; align-items:center">
            <input id="shareEmail" placeholder="user@example.com" style="flex:1">
            <select id="shareRole"><option value="viewer">Viewer</option><option value="editor">Editor</option></select>
            <button class="button" id="addShare">Invite</button>
          </div>
          <div id="sharesList" class="muted" style="margin-top:8px; font-size:13px">${shares.length? '' : 'No shares yet.'}</div>
        </div>
        <div style="display:flex; gap:8px; justify-content:flex-end; margin-top:8px">
          <button class="button ghost" id="cancelBtn">Cancel</button>
          <button class="button" id="saveBtn">Save</button>
        </div>
      </div>
    </div>
  `;

  // Fill shares list
  const list = root.querySelector('#sharesList');
  if (list && shares.length){
    list.innerHTML = shares.map(s=>`<div style='display:flex; align-items:center; justify-content:space-between; gap:8px; border:1px solid var(--border); border-radius:6px; padding:6px 8px; margin-top:6px'>
      <span>${s.email} <em style='opacity:.7'>(${s.role||'viewer'})</em></span>
      <button class='button ghost sm' data-unshare='${s.email}'>Remove</button>
    </div>`).join('');
  }

  // Color selection
  try{
    root.querySelectorAll('#spColors [data-color]').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        root.querySelectorAll('#spColors [data-color]').forEach(b=>{ b.removeAttribute('data-selected'); b.style.borderColor='var(--border)'; });
        btn.setAttribute('data-selected','1'); btn.style.borderColor = '#fff';
      });
      if (storedColor && btn.getAttribute('data-color')===storedColor){ btn.setAttribute('data-selected','1'); btn.style.borderColor='#fff'; }
    });
  }catch{}

  // Visibility toggle
  const visSel = root.querySelector('#spVis');
  const permWrap = root.querySelector('#spPublicPermWrap');
  visSel?.addEventListener('change', ()=>{ if (permWrap) permWrap.style.display = visSel.value==='public' ? '' : 'none'; });

  // Invite share
  root.querySelector('#addShare')?.addEventListener('click', async ()=>{
    const email = (root.querySelector('#shareEmail')?.value||'').trim();
    const role = (root.querySelector('#shareRole')?.value||'viewer').trim();
    if (!email){ window.showToast && window.showToast('Enter an email'); return; }
    try{
      let token=''; try{ const sb = getSupabase(); const ss = await sb.auth.getSession(); token = ss?.data?.session?.access_token || ''; }catch{}
      const r = await fetch('/api/spaces-share', { method:'POST', headers:{ 'Content-Type':'application/json', ...(token? { Authorization:`Bearer ${token}` }: {}) }, body: JSON.stringify({ space_id: spaceId, email, role }) });
      if (!r.ok){ const t = await r.text(); window.showToast && window.showToast('Share failed: '+t); return; }
      window.showToast && window.showToast('Invitation added');
      const div = document.createElement('div');
      div.style.cssText='display:flex; align-items:center; justify-content:space-between; gap:8px; border:1px solid var(--border); border-radius:6px; padding:6px 8px; margin-top:6px';
      div.innerHTML = `<span>${email} <em style='opacity:.7'>(${role})</em></span><button class='button ghost sm' data-unshare='${email}'>Remove</button>`;
      list?.appendChild(div);
    }catch(e){ window.showToast && window.showToast('Share failed'); }
  });

  // Unshare handlers
  list?.querySelectorAll('[data-unshare]')?.forEach(btn=>{
    btn.addEventListener('click', async ()=>{
      try{
        let token=''; try{ const sb = getSupabase(); const ss = await sb.auth.getSession(); token = ss?.data?.session?.access_token || ''; }catch{}
        await fetch('/api/spaces-share', { method:'DELETE', headers:{ 'Content-Type':'application/json', ...(token? { Authorization:`Bearer ${token}` }: {}) }, body: JSON.stringify({ space_id: spaceId, email: btn.getAttribute('data-unshare') }) });
        btn.closest('div')?.remove();
      }catch{}
    });
  });

  // Save
  root.querySelector('#saveBtn')?.addEventListener('click', async ()=>{
    const name = (root.querySelector('#spName')?.value||'').trim();
    const vis = (root.querySelector('#spVis')?.value||'private').trim();
    const color = root.querySelector('#spColors [data-selected="1"]')?.getAttribute('data-color')||'';
    const pubPerm = (root.querySelector('#spPublicPerm')?.value||'view').trim();
    const updates = {};
    if (name && name!==space.name) updates.name = name;
    if (vis && vis!==space.visibility) updates.visibility = vis;
    // Use edge endpoint to avoid RLS client issues
    try{
      let token=''; try{ const sb = getSupabase(); const ss = await sb.auth.getSession(); token = ss?.data?.session?.access_token || ''; }catch{}
      if (Object.keys(updates).length){
        const r = await fetch('/api/space-update', { method:'POST', headers:{ 'Content-Type':'application/json', ...(token? { Authorization:`Bearer ${token}` }: {}) }, body: JSON.stringify({ id: spaceId, fields: updates }) });
        if (!r.ok){ const t = await r.text(); window.showToast && window.showToast('Failed to save: '+t); }
      }
    }catch{}
    // Persist color locally
    try{ if (typeof localStorage!=='undefined'){ if (color){ localStorage.setItem('space_color_'+spaceId, color); } else { localStorage.removeItem('space_color_'+spaceId); } } }catch{}
    // Update public permissions in settings
    if (vis==='public'){
      const settings = { ...(space.settings||{}) };
      settings.public_permissions = pubPerm||'view';
      try{
        let token=''; try{ const sb = getSupabase(); const ss = await sb.auth.getSession(); token = ss?.data?.session?.access_token || ''; }catch{}
        await fetch('/api/space-update', { method:'POST', headers:{ 'Content-Type':'application/json', ...(token? { Authorization:`Bearer ${token}` }: {}) }, body: JSON.stringify({ id: spaceId, fields: { settings } }) });
      }catch{}
    }
    window.showToast && window.showToast('Saved');
  });

  // Back
  root.querySelector('#backToSpace')?.addEventListener('click', ()=>{ try{ location.hash = 'space/'+spaceId; }catch{} });
  root.querySelector('#cancelBtn')?.addEventListener('click', ()=>{ try{ location.hash = 'space/'+spaceId; }catch{} });
}


