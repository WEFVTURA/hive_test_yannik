import { getSupabase, db_getSpace, db_listFiles, db_listNotes, db_updateSpace, db_createNote, db_updateNote, db_deleteNote, db_updateFileTags, db_updateNoteTags } from '../lib/supabase.js';
import { ragIndex } from '../lib/rag.js';
import { openModalWithExtractor } from './modals.js';
import { marked } from 'https://cdn.jsdelivr.net/npm/marked@12/+esm';
import { extractPdfText, extractDocxText } from '../lib/extract.js';

const collapsedState = new Map();

export async function renderSpace(root, spaceId){
  const [space, files, notes] = await Promise.all([
    db_getSpace(spaceId).catch(()=>({ id: spaceId, name: 'Space'})),
    db_listFiles(spaceId).catch(()=>[]),
    db_listNotes(spaceId).catch(()=>[]),
  ]);

  const researchId = (typeof localStorage!=='undefined') ? localStorage.getItem('hive_research_space_id') : '';
  const isDeepResearch = (researchId && space.id===researchId) || /deep research/i.test(space.name||'');
  root.innerHTML = `
    <div class="content-head">
      <div class="title" style="display:flex; align-items:center; gap:10px">
        <img id="spaceCover" src="${space.cover_url||''}" alt="cover" style="width:32px; height:32px; border-radius:8px; object-fit:cover; border:1px solid var(--border)">
        <h2 id="spaceTitle" contenteditable="true" title="Click to rename">${space.name}</h2>
        <span class="muted">Files & Notes</span>
      </div>
      <div class="view-controls" style="pointer-events:auto">
        <button class="button ghost" id="spaceSettingsBtn" title="Space settings">Space settings</button>
        <button class="button ghost" id="coverBtn" title="Change cover">Cover</button>
        <button class="button ghost" id="reindexBtn" title="Reindex for AI">Reindex</button>
        ${isDeepResearch ? `<button class="button ghost" id="backIconBtn" data-tip="Back" style="position:relative; z-index:70"><i data-lucide="arrow-left" class="icon" aria-hidden="true"></i></button>` : `<button class="button ghost" id="backBtn">Back</button>`}
      </div>
    </div>
    <div class="card-grid ${isDeepResearch ? '' : 'space-2col'}">
      ${isDeepResearch ? '' : `
      <section class="lib-card">
        <div style="font-weight:600; margin-bottom:6px">Files</div>
        <div style="display:flex; gap:8px; margin-bottom:6px">
          <button class="button" id="addLinkBtn">Add link</button>
          <button class="button" id="uploadBtn">Upload file</button>
          <button class="button" id="uploadAudioBtn">Transcribe audio</button>
        </div>
        <div id="filesList" style="display:grid; gap:8px"></div>
      </section>`}
      <section class="lib-card" style="${isDeepResearch ? 'grid-column:1/-1' : ''}">
        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:6px">
          <div style="font-weight:600">Notes</div>
          <button class="button" id="addNoteBtn">New note</button>
        </div>
        <div id="notesList" style="display:grid; gap:10px"></div>
      </section>
    </div>`;

  // Title rename
  // Initialize Lucide icons for dynamic content in space header
  try{ window.lucide && window.lucide.createIcons({ attrs: { width: 18, height: 18 } }); }catch{}
  const titleEl = root.querySelector('#spaceTitle');
  titleEl.addEventListener('keydown', (e)=>{ if(e.key==='Enter'){ e.preventDefault(); titleEl.blur(); } });
  titleEl.addEventListener('blur', async ()=>{
    const newName = (titleEl.textContent||'').trim(); if(!newName || newName===space.name) return;
    await db_updateSpace(spaceId, { name: newName }).catch(alert);
  });

  // Space settings modal (rename/visibility/delete + share)
  root.querySelector('#spaceSettingsBtn').addEventListener('click', async ()=>{
    const space = await db_getSpace(spaceId).catch(()=>({ id: spaceId, name:'Space', visibility:'private' }));
    const { openModalWithExtractor } = await import('./modals.js');
    const shares = await (await import('../lib/supabase.js')).db_listShares(spaceId).catch(()=>[]);
    // Protect baseline spaces from deletion
    const meetingsId = (typeof localStorage!=='undefined') ? localStorage.getItem('hive_meetings_space_id') : '';
    const chatsId = (typeof localStorage!=='undefined') ? localStorage.getItem('hive_chats_space_id') : '';
    const researchId2 = (typeof localStorage!=='undefined') ? localStorage.getItem('hive_research_space_id') : '';
    const isProtected = [meetingsId, chatsId, researchId2].filter(Boolean).includes(String(spaceId));
    const body = `
      <div class='field'><label>Name</label><input id='spName' value='${space.name||''}' /></div>
      <div class='field'><label>Visibility</label>
        <select id='spVis'>
          <option value='private' ${space.visibility==='private'?'selected':''}>Private</option>
          <option value='team' ${space.visibility==='team'?'selected':''}>Team</option>
          <option value='public' ${space.visibility==='public'?'selected':''}>Public</option>
        </select>
      </div>
      <div class='field'><label>Invite by email</label><input id='inviteEmail' placeholder='name@company.com' /></div>
      <div class='muted' style='font-size:12px'>Existing shares</div>
      <div style='display:grid; gap:6px'>${shares.map(s=>`<div style='border:1px solid var(--border); padding:6px; border-radius:8px'>${s.email}</div>`).join('')||'<div class=muted>None</div>'}</div>
      <div class='muted' style='font-size:12px;margin-top:8px'>Danger zone</div>
      <button class='button red' id='spDelete' ${isProtected?'disabled':''}>${isProtected?'Cannot delete baseline space':'Delete space'}</button>`;
    const res = await openModalWithExtractor('Space options', body, (root)=>({ name: root.querySelector('#spName')?.value||'', vis: root.querySelector('#spVis')?.value||space.visibility||'private', email: root.querySelector('#inviteEmail')?.value?.trim()||'', del: root.querySelector('#spDelete')?.dataset?.clicked==='1' }));
    const scrim = document.getElementById('modalScrim');
    scrim?.querySelector('#spDelete')?.addEventListener('click', ()=>{ scrim.querySelector('#spDelete').dataset.clicked='1'; });
    if (!res.ok) return;
    const { name, vis, email, del } = res.values || {};
    if (del){
      if (isProtected){ window.showToast && window.showToast('Cannot delete baseline spaces (Meetings, Chats, Deep Researches)'); return; }
      await db_updateSpace(spaceId, { deleted_at: new Date().toISOString() }).catch(()=>{});
      window.location.hash='';
      return;
    }
    if (name && name!==space.name) await db_updateSpace(spaceId, { name });
    if (vis && vis!==space.visibility) await db_updateSpace(spaceId, { visibility: vis });
    if (email){ await (await import('../lib/supabase.js')).db_shareSpace(spaceId, email).catch(()=>alert('Share failed')); window.showToast && window.showToast('Invite sent to '+email); }
    renderSpace(root, spaceId);
  });

  // Files list (only present when not in Deep Research view)
  const filesList = root.querySelector('#filesList');
  if (filesList){
    filesList.innerHTML = files.map(f=>{
      const href = f.url || (f.storage_path ? `https://lmrnnfjuytygomdfujhs.supabase.co/storage/v1/object/public/hive-attachments/${f.storage_path}` : '#');
      const preview = (f.content_type||'').startsWith('image/') ? `<img src="${href}" alt="${f.name}" style="max-height:40px; border-radius:6px">` : `<svg class="icon"><use href="#box"></use></svg>`;
      const tags = Array.isArray(f.tags) ? f.tags : [];
      return `<div style="display:flex; align-items:center; justify-content:space-between; border:1px solid var(--border); padding:8px; border-radius:10px">
        <div style="display:flex; align-items:center; gap:10px"><a href="${href}" target="_blank">${preview}</a><a href="${href}" target="_blank">${f.name}</a></div>
        <div style="display:flex; gap:8px; align-items:center; font-size:12px">
          <span class="muted">${f.content_type||''}</span>
          <span class="muted" title="tags">${tags.map(t=>`#${t}`).join(' ')}</span>
          <button class="button sm" data-add-file-tag="${f.id}">Tags</button>
          <button class="button sm" data-convert-jina="${f.id}">Convert to note</button>
          <button class="button sm red" data-delete-file="${f.id}">Delete</button>
        </div>
      </div>`;
    }).join('');

    // File actions: convert to note (Jina), delete
    const fileById = new Map(files.map(x=>[String(x.id), x]));
    filesList.querySelectorAll('[data-convert-jina]').forEach(btn=>{
      btn.addEventListener('click', async ()=>{
        const id = btn.getAttribute('data-convert-jina');
        const f = fileById.get(id); if(!f) return;
        try{
          const href = f.url || (f.storage_path ? `https://lmrnnfjuytygomdfujhs.supabase.co/storage/v1/object/public/hive-attachments/${f.storage_path}` : '');
          if (!href){ window.showToast && window.showToast('File has no URL'); return; }
          const isHttps = href.startsWith('https://');
          const noScheme = href.replace(/^https?:\/\//i, '');
          const readerUrl = `https://r.jina.ai/${isHttps ? 'https' : 'http'}://${noScheme}`;
          const r = await fetch(readerUrl);
          const textContent = await r.text();
          const title = (f.name||'Document').replace(/\.[^/.]+$/,'');
          const n = await db_createNote(spaceId);
          await db_updateNote(n.id, { title, content: (textContent||'(no extractable text)').slice(0,50000) });
          collapsedState.set(n.id, false);
          window.showToast && window.showToast('Created note via Jina Reader');
          renderSpace(root, spaceId);
        }catch{ window.showToast && window.showToast('Jina conversion failed'); }
      });
    });
    filesList.querySelectorAll('[data-delete-file]').forEach(btn=>{
      btn.addEventListener('click', async ()=>{
        const id = btn.getAttribute('data-delete-file');
        const f = fileById.get(id); if(!f) return;
        const ok = confirm('Delete this file?'); if(!ok) return;
        try{
          const sb = getSupabase();
          if (f.storage_path){ await sb.storage.from('hive-attachments').remove([f.storage_path]); }
          await sb.from('files').delete().eq('id', f.id);
          window.showToast && window.showToast('File deleted');
          renderSpace(root, spaceId);
        }catch{ window.showToast && window.showToast('Delete failed'); }
      });
    });
    // File tags add/edit
    filesList.querySelectorAll('[data-add-file-tag]').forEach(btn=>{
      btn.addEventListener('click', async ()=>{
        const id = btn.getAttribute('data-add-file-tag');
        const f = fileById.get(id); if(!f) return;
        const current = Array.isArray(f.tags)? f.tags.join(', ') : '';
        const next = prompt('Add tags (comma separated)', current) || '';
        const tags = next.split(',').map(s=>s.trim()).filter(Boolean);
        try{ await db_updateFileTags(f.id, tags); window.showToast && window.showToast('Tags updated'); renderSpace(root, spaceId); }catch{ window.showToast && window.showToast('Failed to update tags'); }
      });
    });
  }

  // Notes list
  const notesList = root.querySelector('#notesList');
  for(const n of notes){
    const isCollapsed = collapsedState.get(n.id) ?? true;
    const row = document.createElement('div');
    row.className = 'note-row' + (isCollapsed ? ' collapsed' : '');
    const firstLines = (n.content||'').split('\n').slice(0,2).join('\n');
    row.innerHTML = `
      <div class="note-head">
        <input class="note-title" data-title value="${n.title||''}" placeholder="Note title" />
        <div class="note-controls">
          <div class="segmented" role="tablist">
            <button data-mode="edit" class="active">Edit</button>
            <button data-mode="preview">Preview</button>
            <button data-mode="split">Split</button>
          </div>
          <button class="button" data-toggle>${isCollapsed?'Expand':'Collapse'}</button>
          <button class="button red" data-delete>Delete</button>
          <button class="button" data-fullscreen>Fullscreen</button>
        </div>
      </div>
      <div class="note-snippet">${firstLines || '—'}</div>
      <div class="note-body edit" data-body>
        <textarea class="note-editor" data-content>${n.content||''}</textarea>
        <div class="note-preview" data-preview></div>
        <div style="display:flex; gap:8px; align-items:center"><span class="muted" style="font-size:12px">Tags:</span><input data-note-tags placeholder="comma, tags" style="flex:1; background:transparent; border:1px solid var(--border); color:var(--text); padding:6px 8px; border-radius:8px"/></div>
      </div>`;

    const title = row.querySelector('[data-title]');
    const content = row.querySelector('[data-content]');
    const preview = row.querySelector('[data-preview]');
    const tagsInput = row.querySelector('[data-note-tags]');
    const body = row.querySelector('[data-body]');

    const applyMode = (mode)=>{
      body.classList.remove('edit','preview','split');
      body.classList.add(mode);
      row.querySelectorAll('[data-mode]').forEach(b=>b.classList.toggle('active', b.getAttribute('data-mode')===mode));
    };

    const renderPrev = ()=>{ preview.innerHTML = marked.parse(content.value||''); };
    renderPrev();
    tagsInput.value = Array.isArray(n.tags)? n.tags.join(', ') : '';

    const autosave = debounce(async()=>{
      await db_updateNote(n.id, { title: title.value||'', content: content.value||'', updated_at: new Date().toISOString() }).catch(console.error);
      try{ const { getPrefs } = await import('./settings.js'); const prefs = getPrefs(); await ragIndex(spaceId, [{ source_type:'note', source_id:n.id, content: (title.value||'')+'\n'+(content.value||'') }], prefs.searchProvider); } catch {}
    }, 800);

    title.addEventListener('input', autosave);
    content.addEventListener('input', ()=>{ renderPrev(); autosave(); });
    tagsInput.addEventListener('change', async ()=>{
      const tags = tagsInput.value.split(',').map(s=>s.trim()).filter(Boolean);
      try{ await db_updateNoteTags(n.id, tags); window.showToast && window.showToast('Note tags updated'); }catch{}
    });
    row.querySelector('[data-mode="edit"]').addEventListener('click', ()=>applyMode('edit'));
    row.querySelector('[data-mode="preview"]').addEventListener('click', ()=>applyMode('preview'));
    row.querySelector('[data-mode="split"]').addEventListener('click', ()=>applyMode('split'));

    const fsBtn = row.querySelector('[data-fullscreen]');
    fsBtn.addEventListener('click', ()=>{
      const isFs = row.classList.toggle('note-fullscreen');
      fsBtn.textContent = isFs ? 'Exit fullscreen' : 'Fullscreen';
    });

    const toggleBtn = row.querySelector('[data-toggle]');
    toggleBtn.addEventListener('click', ()=>{
      const nowCollapsed = row.classList.toggle('collapsed');
      collapsedState.set(n.id, nowCollapsed);
      toggleBtn.textContent = nowCollapsed ? 'Expand' : 'Collapse';
    });
    const snippet = row.querySelector('.note-snippet');
    snippet.addEventListener('click', ()=>{ toggleBtn.click(); });

    const delBtn = row.querySelector('[data-delete]');
    delBtn.addEventListener('click', async ()=>{
      const ok = confirm('Delete this note?');
      if(!ok) return;
      await db_deleteNote(n.id).catch(()=>{});
      renderSpace(root, spaceId);
    });

    notesList.appendChild(row);
  }

  // Buttons (header)
  const backBtnEl = root.querySelector('#backBtn') || root.querySelector('#backIconBtn');
  if (backBtnEl){
    const navigateToLibrary = ()=>{
      try{ const inp = document.getElementById('globalSearch'); if (inp){ inp.value=''; inp.dispatchEvent(new Event('input')); } }catch{}
      // Strategy 1: explicit navigate to root hash
      try{ location.assign('#'); }catch{}
      // Strategy 2: force router render shortly after
      setTimeout(()=>{ try{ if (typeof window.hiveRenderRoute === 'function'){ window.hiveRenderRoute(); } }catch{} }, 0);
      // Strategy 3: final fallback - full reload to root
      setTimeout(()=>{ try{ if ((location.hash||'') !== '' && (location.hash||'') !== '#'){ location.href = '#'; } }catch{} }, 150);
    };
    backBtnEl.addEventListener('click', (e)=>{ e.preventDefault(); e.stopPropagation(); navigateToLibrary(); });
  }
  const addNoteBtn = root.querySelector('#addNoteBtn');
  if (addNoteBtn){ addNoteBtn.addEventListener('click', async()=>{ const nn = await db_createNote(spaceId); collapsedState.set(nn.id, false); renderSpace(root, spaceId); }); }
  const reindexBtn = root.querySelector('#reindexBtn');
  if (reindexBtn) reindexBtn.addEventListener('click', async()=>{
    const { getPrefs } = await import('./settings.js');
    const prefs = getPrefs();
    const payload = notes.slice(0,50).map(n=>({ source_type:'note', source_id:n.id, content:(n.title||'')+'\n'+(n.content||'') }));
    const res = await ragIndex(spaceId, payload, prefs.searchProvider).catch(()=>null);
    window.showToast && window.showToast('Reindex completed');
  });
  const addLinkBtn = root.querySelector('#addLinkBtn');
  if (addLinkBtn) addLinkBtn.addEventListener('click', async()=>{
    const res = await openModalWithExtractor('Add link', `<div class="field"><label>Name</label><input id="fName" placeholder="Link name"></div><div class="field"><label>URL</label><input id="fUrl" placeholder="https://..."></div>`, (root)=>({ name: root.querySelector('#fName')?.value?.trim()||'', url: root.querySelector('#fUrl')?.value?.trim()||'' }));
    if(!res.ok) return; let { name, url } = res.values || {}; if(!name||!url) return; if(!/^https?:\/\//i.test(url)) url='https://'+url;
    const sb = getSupabase();
    const { data, error } = await sb.from('files').insert([{ space_id: spaceId, name, kind: 'link', url, content_type: 'link' }]).select('*');
    if (!error){ const { getPrefs } = await import('./settings.js'); const prefs = getPrefs(); await ragIndex(spaceId, [{ source_type:'file', source_id:data?.[0]?.id, content:`${name} ${url}` }], prefs.searchProvider); renderSpace(root, spaceId); }
  });
  const uploadBtn = root.querySelector('#uploadBtn');
  if (uploadBtn) uploadBtn.addEventListener('click', async()=>{
    const res = await openModalWithExtractor('Upload file', `<div class="field"><label>File</label><input id="fInput" type="file"></div><div class="muted" style="font-size:12px">Uploads go to public bucket 'hive-attachments'</div>`, (root)=>({ file: root.querySelector('#fInput')?.files?.[0] || null }));
    if(!res.ok) return; const file = res.values?.file; if(!file) return;
    const sb = getSupabase();
    const path = `${spaceId}/${Date.now()}_${file.name}`;
    const bucket = sb.storage.from('hive-attachments');
    const up = await bucket.upload(path, file, { upsert:true }); if(up.error) return alert('Upload failed');
    const pub = bucket.getPublicUrl(path).data.publicUrl;
    const { data: fRow, error: dbErr } = await sb.from('files').insert({ space_id: spaceId, name: file.name, kind: 'upload', url: pub, content_type: file.type || 'file', storage_path: path }).select('*').single();
    if(!dbErr){
      try{
        let textContent = '';
        if ((file.type||'').startsWith('text/')) textContent = await file.text();
        else if ((file.type||'').includes('pdf')) textContent = await extractPdfText(file);
        else if ((file.name||'').toLowerCase().endsWith('.docx')) textContent = await extractDocxText(file);
        const content = `${file.name} ${pub}\n` + (textContent || `(${file.type||'file'})`);
        const { getPrefs } = await import('./settings.js'); const prefs = getPrefs(); await ragIndex(spaceId, [{ source_type:'file', source_id:fRow.id, content }], prefs.searchProvider);
        // Also create a note to visualize extracted text for verification
        if ((textContent||'').trim()){
          const title = (file.name||'Document').replace(/\.[^/.]+$/,'');
          const n = await db_createNote(spaceId);
          await db_updateNote(n.id, { title, content: textContent.slice(0, 50000) });
          // Expand the freshly created note in UI
          try{ collapsedState.set(n.id, false); }catch{}
        }
      }catch{}
      renderSpace(root, spaceId);
    }
  });
  const uploadAudioBtn = root.querySelector('#uploadAudioBtn');
  if (uploadAudioBtn) uploadAudioBtn.addEventListener('click', async()=>{
    const res = await openModalWithExtractor('Transcribe audio', `<div class="field"><label>Audio file</label><input id="aInput" type="file" accept="audio/*"></div>`, (root)=>({ file: root.querySelector('#aInput')?.files?.[0] || null }));
    if(!res.ok) return; const file = res.values?.file; if(!file) return;
    const sb = getSupabase();
    const path = `${spaceId}/${Date.now()}_${file.name}`;
    const bucket = sb.storage.from('hive-attachments');
    const up = await bucket.upload(path, file, { upsert:true }); if(up.error) return alert('Upload failed');
    const pub = bucket.getPublicUrl(path).data.publicUrl;
    const btn = document.getElementById('uploadAudioBtn');
    const origText = btn.textContent;
    btn.textContent = 'Transcribing…'; btn.setAttribute('disabled','true');
    // Create a placeholder note and expand it so user sees progress
    const tempTitle = (file.name||'Audio').replace(/\.[^/.]+$/,'');
    const tempNote = await db_createNote(spaceId).catch(()=>null);
    if (tempNote){ await db_updateNote(tempNote.id, { title: `${tempTitle} (transcribing…)`, content: 'Transcription in progress…' }).catch(()=>{}); try{ collapsedState.set(tempNote.id, false); }catch{} }
    try{
      let resp = await sb.functions.invoke('assembly', { body: { url: pub, space_id: spaceId, api_key: '808060f1237a4866ad46691bd4ea7153', title: file.name.replace(/\.[^/.]+$/,'') } });
      if (resp.error){
        // Fallback to alternate slug if the deployment name differs
        resp = await sb.functions.invoke('assembly-transcribe', { body: { url: pub, space_id: spaceId, api_key: '808060f1237a4866ad46691bd4ea7153', title: file.name.replace(/\.[^/.]+$/,'') } });
      }
      const { data, error } = resp;
      if (error) throw error; window.showToast && window.showToast('Transcription started');
      // If immediate transcript returned, create a note if function didn’t already
      if (typeof data?.transcript === 'string' && data.transcript){
        if (tempNote){ await db_updateNote(tempNote.id, { title: tempTitle, content: data.transcript }).catch(()=>{}); }
        else { const n = await db_createNote(spaceId); await db_updateNote(n.id, { title: tempTitle, content: data.transcript }); }
      }
    }catch{ window.showToast && window.showToast('Transcription failed'); }
    finally{ btn.textContent = origText; btn.removeAttribute('disabled'); renderSpace(root, spaceId); }
  });
  root.querySelector('#coverBtn').addEventListener('click', async()=>{
    const res = await openModalWithExtractor('Change cover', `<div class="field"><label>Upload</label><input id="coverInput" type="file" accept="image/*"></div>`, (root)=>({ file: root.querySelector('#coverInput')?.files?.[0]||null }));
    if(!res.ok) return; const file = res.values?.file; if(!file) return;
    const sb = getSupabase(); const path = `${spaceId}/${Date.now()}_${file.name}`; const bucket = sb.storage.from('space-covers');
    const up = await bucket.upload(path, file, { upsert:true }); if(up.error) return alert('Cover upload failed');
    const url = bucket.getPublicUrl(path).data.publicUrl; await sb.from('spaces').update({ cover_url:url }).eq('id', spaceId); renderSpace(root, spaceId);
  });
}

function debounce(fn, wait){ let t=null; return (...args)=>{ clearTimeout(t); t=setTimeout(()=>fn(...args), wait); }; }
