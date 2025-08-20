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
  // Determine protected spaces for header controls
  const meetingsIdHdr = (typeof localStorage!=='undefined') ? localStorage.getItem('hive_meetings_space_id') : '';
  const chatsIdHdr = (typeof localStorage!=='undefined') ? localStorage.getItem('hive_chats_space_id') : '';
  const isProtectedHeader = [meetingsIdHdr, chatsIdHdr, researchId].filter(Boolean).includes(String(spaceId));
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
        ${!isProtectedHeader ? `<button class="button red" id="deleteHeaderBtn" data-tip="Delete space">Delete</button>` : ''}
        ${isDeepResearch ? `<button class="button ghost" id="backIconBtn" data-tip="Back" style="position:relative; z-index:70"><i data-lucide="arrow-left" class="icon" aria-hidden="true"></i></button>` : `<button class="button ghost" id="backBtn">Back</button>`}
      </div>
    </div>
    <div id="spaceTabs" class="mobile-only" style="display:none">
      <button class="button" id="tabFiles">Files</button>
      <button class="button" id="tabNotes">Notes</button>
    </div>
    <div class="card-grid ${isDeepResearch ? '' : 'space-2col'}">
      ${isDeepResearch ? '' : `
      <section class="lib-card" id="filesSection">
        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:6px">
          <div style="font-weight:600">Files</div>
          <button class="button sm ghost mobile-hidden" id="filesCollapseBtn">Collapse</button>
        </div>
        <div id="filesActions" style="display:flex; gap:8px; margin-bottom:6px">
          <button class="button" id="addLinkBtn">Add link</button>
          <button class="button" id="uploadBtn">Upload file</button>
          <div id="transcribeWrap" style="position:relative">
            <button class="button" id="uploadAudioBtn">Transcribe audio ▾</button>
            <div class="menu" id="uploadRouteMenu" style="display:none; right:0; min-width:260px">
              <button class="button" data-route="vercel" style="justify-content:flex-start">Route A · Vercel proxy → AssemblyAI</button>
              <button class="button" data-route="supabase" style="justify-content:flex-start">Route B · Supabase Function → AssemblyAI</button>
              <button class="button" data-route="storage" style="justify-content:flex-start">Route C · Supabase Storage → URL → AssemblyAI</button>
              <div style="height:1px; background:var(--border); margin:6px 0"></div>
              <button class="button" data-route="openai" style="justify-content:flex-start">OpenAI Whisper</button>
              <button class="button" data-route="deepgram" style="justify-content:flex-start">Deepgram</button>
            </div>
          </div>
        </div>
        <div id="filesList" style="display:grid; gap:8px"></div>
      </section>`}
      <section class="lib-card" id="notesSection" style="${isDeepResearch ? 'grid-column:1/-1' : ''}">
        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:6px">
          <div style="font-weight:600">Notes</div>
          ${isDeepResearch ? `<div style="display:flex; gap:8px"><button class="button" id="deepNewNote"><i data-lucide="file-plus" class="icon" aria-hidden="true"></i> New Note</button></div>` : `<button class="button mobile-hidden" id="addNoteBtn">New note</button>`}
        </div>
        <div id="notesList" style="display:grid; gap:10px"></div>
      </section>
    </div>`;
  // Mobile: tabs to toggle full-screen panels
  (function initMobileTabs(){
    try{
      const tabs = root.querySelector('#spaceTabs');
      const filesCard = root.querySelector('#filesSection');
      const notesCard = root.querySelector('#notesSection');
      if (!tabs || !filesCard || !notesCard) return;
      const isMobile = window.matchMedia('(max-width: 780px)').matches;
      if (!isMobile) return;
      tabs.style.display='flex';
      const show = (which)=>{
        filesCard.classList.remove('mobile-open'); notesCard.classList.remove('mobile-open');
        if (which==='files'){ filesCard.classList.add('mobile-open'); }
        else { notesCard.classList.add('mobile-open'); }
      };
      root.querySelector('#tabFiles')?.addEventListener('click', ()=>show('files'));
      root.querySelector('#tabNotes')?.addEventListener('click', ()=>show('notes'));
      show('notes');
    }catch{}
  })();

  // Title rename
  // Initialize Lucide icons for dynamic content in space header
  try{ window.lucide && window.lucide.createIcons({ attrs: { width: 18, height: 18 } }); }catch{}
  const titleEl = root.querySelector('#spaceTitle');
  titleEl.addEventListener('keydown', (e)=>{ if(e.key==='Enter'){ e.preventDefault(); titleEl.blur(); } });
  titleEl.addEventListener('blur', async ()=>{
    const newName = (titleEl.textContent||'').trim(); if(!newName || newName===space.name) return;
    await db_updateSpace(spaceId, { name: newName }).catch(alert);
  });

  // Approach B: header delete button
  const delHeader = root.querySelector('#deleteHeaderBtn');
  if (delHeader){
    delHeader.addEventListener('click', async ()=>{
      if (!confirm('Delete this space?')) return;
      try{ const { db_deleteSpace } = await import('../lib/supabase.js'); await db_deleteSpace(spaceId); console.info('Space deleted via header'); }
      catch(e){ console.error('Delete failed', e); window.showToast && window.showToast('Delete failed'); return; }
      try{ location.hash=''; }catch{}; try{ window.hiveRenderRoute && window.hiveRenderRoute(); }catch{};
    });
  }

  // Space settings modal (rename/visibility/delete + share)
  root.querySelector('#spaceSettingsBtn').addEventListener('click', async ()=>{
    const space = await db_getSpace(spaceId).catch(()=>({ id: spaceId, name:'Space', visibility:'private' }));
    const { openModalWithExtractor } = await import('./modals.js');
    const shares = await (await import('../lib/supabase.js')).db_listShares(spaceId).catch(()=>[]);
    const storedColor = (typeof localStorage!=='undefined') ? (localStorage.getItem('space_color_'+spaceId)||'') : '';
    const palette = ['#7c3aed','#2563eb','#059669','#f59e0b','#e11d48','#06b6d4','#a855f7'];
    const body = `
      <div class='field'><label>Name</label><input id='spName' value='${space.name||''}' /></div>
      <div class='field'><label>Visibility</label>
        <select id='spVis'>
          <option value='private' ${space.visibility==='private'?'selected':''}>Private</option>
          <option value='team' ${space.visibility==='team'?'selected':''}>Team</option>
          <option value='public' ${space.visibility==='public'?'selected':''}>Public</option>
        </select>
      </div>
      <div class='field'><label>Color</label>
        <div id='spColors' style='display:flex; gap:8px'>
          ${palette.map(c=>`<button class='button' data-color='${c}' title='${c}' style='width:26px; height:26px; padding:0; border-radius:999px; background:${c}; border:2px solid ${storedColor===c?'#fff':'var(--border)'}'></button>`).join('')}
          <button class='button' data-color='' title='None' style='width:26px; height:26px; padding:0; border-radius:999px; background:transparent'>✕</button>
        </div>
      </div>
      <div class='field'><label>Invite by email</label><input id='inviteEmail' placeholder='name@company.com' /></div>
      <div class='muted' style='font-size:12px'>Existing shares</div>
      <div style='display:grid; gap:6px'>${shares.map(s=>`<div style='border:1px solid var(--border); padding:6px; border-radius:8px'>${s.email}</div>`).join('')||'<div class=muted>None</div>'}</div>`;
    const modalPromise = openModalWithExtractor('Space options', body, (root)=>({ name: root.querySelector('#spName')?.value||'', vis: root.querySelector('#spVis')?.value||space.visibility||'private', email: root.querySelector('#inviteEmail')?.value?.trim()||'', color: root.querySelector('#spColors [data-selected="1"]')?.getAttribute('data-color')||'' }));
    const scrim = document.getElementById('modalScrim');
    // Color selection events
    try{ scrim.querySelectorAll('#spColors [data-color]').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        scrim.querySelectorAll('#spColors [data-color]').forEach(b=>{ b.removeAttribute('data-selected'); b.style.borderColor='var(--border)'; });
        btn.setAttribute('data-selected','1'); btn.style.borderColor='#fff';
      });
      if (storedColor && btn.getAttribute('data-color')===storedColor){ btn.setAttribute('data-selected','1'); btn.style.borderColor='#fff'; }
    }); }catch{}
    const res = await modalPromise;
    if (!res.ok) return;
    const { name, vis, email, color } = res.values || {};
    // Persist color locally for library card styling
    try{ if (typeof localStorage!=='undefined'){ if (color){ localStorage.setItem('space_color_'+spaceId, color); } else { localStorage.removeItem('space_color_'+spaceId); } } }catch{}
    if (name && name!==space.name){ try{ await db_updateSpace(spaceId, { name }); console.info('Space name updated'); }catch(e){ console.error('Update name failed', e); } }
    if (vis && vis!==space.visibility){ try{ await db_updateSpace(spaceId, { visibility: vis }); console.info('Visibility updated', vis); }catch(e){ console.error('Update visibility failed', e); } }
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

  // Files collapse/expand
  const filesCollapseBtn = root.querySelector('#filesCollapseBtn');
  const filesSection = root.querySelector('#filesSection');
  if (filesCollapseBtn && filesSection){
    filesCollapseBtn.addEventListener('click', ()=>{
      const collapsed = filesSection.classList.toggle('collapsed');
      filesCollapseBtn.textContent = collapsed ? 'Expand' : 'Collapse';
      const actions = root.querySelector('#filesActions');
      if (actions) actions.style.display = collapsed ? 'none' : 'flex';
      if (filesList) filesList.style.display = collapsed ? 'none' : 'grid';
      // When collapsed, let notes take full width
      try{
        const notesSection = root.querySelector('#notesSection');
        if (notesSection){
          notesSection.style.gridColumn = collapsed ? '1 / -1' : '';
        }
      }catch{}
      // On mobile, hide the entire files card instead of shrinking width
      try{
        const isMobile = window.matchMedia('(max-width: 780px)').matches;
        if (isMobile){ filesSection.style.display = collapsed ? 'none' : 'flex'; }
        else { filesSection.style.display = 'flex'; }
      }catch{}
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
          </div>
          <button class="button" data-toggle>${isCollapsed?'Expand':'Collapse'}</button>
          <button class="button red" data-delete>Delete</button>
          <button class="button" data-fullscreen>Fullscreen</button>
        </div>
      </div>
      <div class="note-snippet">${firstLines || '—'}</div>
      <div class="note-body rich" data-body>
        <textarea class="note-editor" data-content style="display:none">${n.content||''}</textarea>
        <div class="note-preview" data-preview style="display:none"></div>
        <div style="display:flex; gap:8px; align-items:center"><span class="muted" style="font-size:12px">Tags:</span><input data-note-tags placeholder="comma, tags" style="flex:1; background:transparent; border:1px solid var(--border); color:var(--text); padding:6px 8px; border-radius:8px"/></div>
      </div>`;

    const title = row.querySelector('[data-title]');
    const content = row.querySelector('[data-content]');
    const preview = row.querySelector('[data-preview]');
    const tagsInput = row.querySelector('[data-note-tags]');
    const body = row.querySelector('[data-body]');
    // Build rich editor and toolbar for every note
    const toolbar = document.createElement('div'); toolbar.className='rich-toolbar';
    toolbar.innerHTML = `
      <button class='button sm' data-cmd='bold'><strong>B</strong></button>
      <button class='button sm' data-cmd='italic'><em>I</em></button>
      <button class='button sm' data-cmd='insertUnorderedList'>• List</button>
      <button class='button sm' data-cmd='insertOrderedList'>1. List</button>
      <button class='button sm' data-cmd='formatBlock' data-value='h1'>H1</button>
      <button class='button sm' data-cmd='formatBlock' data-value='h2'>H2</button>
      <button class='button sm' data-cmd='formatBlock' data-value='h3'>H3</button>
      <button class='button sm' data-cmd='formatBlock' data-value='p'>P</button>
      <button class='button sm' data-cmd='createLink'>Link</button>
      <button class='button sm' data-cmd='formatBlock' data-value='blockquote'>Quote</button>
      <button class='button sm' data-cmd='insertHorizontalRule'>HR</button>
      <button class='button sm' data-cmd='formatBlock' data-value='pre'>Code</button>
      <button class='button sm' data-cmd='insertTable'>Table</button>`;
    const rich = document.createElement('div'); rich.className='note-rich'; rich.contentEditable='true';
    rich.innerHTML = n.content || '';
    body.prepend(toolbar);
    body.insertBefore(rich, body.querySelector('div[style]'));

    // Mode toggle: edit (rich) vs preview (read-only)
    const setMode = (mode)=>{
      const isEdit = mode==='edit';
      row.querySelectorAll('[data-mode]').forEach(b=>b.classList.toggle('active', b.getAttribute('data-mode')===mode));
      toolbar.style.display = isEdit ? '' : 'none';
      rich.style.display = isEdit ? '' : 'none';
      if (!isEdit){
        // Render markdown nicely (legacy notes) or fall back to HTML when content is rich
        const raw = content?.value || '';
        const htmlFromRich = rich.innerHTML || '';
        const looksLikeHtml = /<\s*\w+[^>]*>/i.test(raw) || /<\s*\w+[^>]*>/i.test(htmlFromRich);
        if (looksLikeHtml){
          preview.innerHTML = htmlFromRich || raw;
        } else {
          try{ preview.innerHTML = marked.parse(htmlFromRich || raw); }
          catch{ preview.textContent = htmlFromRich || raw; }
        }
        preview.style.display='block';
        preview.setAttribute('contenteditable','true');
        preview.style.outline='none';
      }
      else {
        if (preview && preview.getAttribute('contenteditable')==='true'){
          rich.innerHTML = preview.innerHTML;
        }
        preview.style.display='none';
        preview.removeAttribute('contenteditable');
      }
    };
    tagsInput.value = Array.isArray(n.tags)? n.tags.join(', ') : '';

    const getEditorValue = ()=> {
      const isPreviewMode = toolbar.style.display==='none';
      if (isPreviewMode) return preview?.innerHTML || content.value || '';
      return rich?.innerHTML || content.value || '';
    };
    const autosave = debounce(async()=>{
      const val = getEditorValue();
      await db_updateNote(n.id, { title: title.value||'', content: val, updated_at: new Date().toISOString() }).catch(console.error);
      try{ const { getPrefs } = await import('./settings.js'); const prefs = getPrefs(); await ragIndex(spaceId, [{ source_type:'note', source_id:n.id, content: (title.value||'')+'\n'+val }], prefs.searchProvider); } catch {}
    }, 800);

    title.addEventListener('input', autosave);
    rich.addEventListener('input', ()=>{ autosave(); });
    tagsInput.addEventListener('change', async ()=>{
      const tags = tagsInput.value.split(',').map(s=>s.trim()).filter(Boolean);
      try{ await db_updateNoteTags(n.id, tags); window.showToast && window.showToast('Note tags updated'); }catch{}
    });
    // Rich toolbar commands
    toolbar.querySelectorAll('[data-cmd]').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        const cmd = btn.getAttribute('data-cmd');
        if (cmd==='formatBlock'){ document.execCommand('formatBlock', false, btn.getAttribute('data-value')); }
        else if (cmd==='createLink'){ const url = prompt('Link URL'); if (url) document.execCommand('createLink', false, url); }
        else if (cmd==='insertTable'){ document.execCommand('insertHTML', false, '<table><tr><td> </td><td> </td></tr></table>'); }
        else { document.execCommand(cmd, false, null); }
        rich.focus();
      });
    });

    // Mode buttons
    row.querySelector('[data-mode="edit"]').addEventListener('click', ()=>setMode('edit'));
    row.querySelector('[data-mode="preview"]').addEventListener('click', ()=>setMode('preview'));
    setMode('edit');

    // Keep autosave while editing directly in preview
    preview.addEventListener('input', ()=>{ autosave(); });
    // Keyboard toggle Ctrl/Cmd+E
    row.addEventListener('keydown', (e)=>{
      if ((e.ctrlKey||e.metaKey) && e.key.toLowerCase()==='e'){ e.preventDefault();
        const to = toolbar.style.display==='none' ? 'edit' : 'preview'; setMode(to);
        try{ (to==='edit'?rich:preview).focus(); }catch{}
      }
    });

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
  const deepNew = root.querySelector('#deepNewNote');
  if (deepNew){
    deepNew.addEventListener('click', async ()=>{
      // Choose target space
      try{
        const { db_listSpaces } = await import('../lib/supabase.js');
        const spaces = await db_listSpaces().catch(()=>[]);
        const body = `<div class='field'><label>Target space</label><select id='targetSpace' class='select' style='width:100%'>${spaces.map(s=>`<option value='${s.id}'>${s.name}</option>`).join('')}</select></div>`;
        const { openModalWithExtractor } = await import('./modals.js');
        const res = await openModalWithExtractor('Create note', body, (root)=>({ sid: root.querySelector('#targetSpace')?.value||'' }));
        if (!res.ok) return; const sid = res.values?.sid || spaceId;
        const n = await db_createNote(sid);
        collapsedState.set(n.id, false);
        // Convert first note row to rich mode with toolbar
        renderSpace(root, sid);
        setTimeout(()=>{ try{ const body = document.querySelector('[data-body]'); if (!body) return; body.classList.add('rich');
          const toolbar = document.createElement('div'); toolbar.className='rich-toolbar';
          toolbar.innerHTML = `
            <button class='button sm' data-cmd='bold'><strong>B</strong></button>
            <button class='button sm' data-cmd='italic'><em>I</em></button>
            <button class='button sm' data-cmd='insertUnorderedList'>• List</button>
            <button class='button sm' data-cmd='insertOrderedList'>1. List</button>
            <button class='button sm' data-cmd='formatBlock' data-value='h3'>H3</button>
            <button class='button sm' data-cmd='formatBlock' data-value='p'>P</button>
            <button class='button sm' data-cmd='createLink'>Link</button>
            <button class='button sm' data-cmd='insertHorizontalRule'>HR</button>
            <button class='button sm' data-cmd='formatBlock' data-value='pre'>Code</button>
            <button class='button sm' data-cmd='insertTable'>Table</button>`;
          const rich = document.createElement('div'); rich.className='note-rich'; rich.contentEditable='true';
          const textarea = document.querySelector('.note-editor'); if (textarea) rich.innerHTML = textarea.value || '';
          const container = body; container.prepend(toolbar); container.appendChild(rich);
          // Commands
          toolbar.querySelectorAll('[data-cmd]').forEach(btn=>{
            btn.addEventListener('click', ()=>{
              const cmd = btn.getAttribute('data-cmd');
              if (cmd==='formatBlock'){ document.execCommand('formatBlock', false, btn.getAttribute('data-value')); }
              else if (cmd==='createLink'){ const url = prompt('Link URL'); if (url) document.execCommand('createLink', false, url); }
              else if (cmd==='insertTable'){ document.execCommand('insertHTML', false, '<table><tr><td> </td><td> </td></tr></table>'); }
              else { document.execCommand(cmd, false, null); }
            });
          });
          // Sync back to textarea on blur
          rich.addEventListener('blur', ()=>{ if (textarea) textarea.value = rich.innerHTML; });
        }catch{} }, 50);
      }catch{}
    });
  }
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
  if (uploadAudioBtn) uploadAudioBtn.addEventListener('click', async(e)=>{
    e.preventDefault();
    const menu = root.querySelector('#uploadRouteMenu'); if (!menu) return;
    menu.style.display = menu.style.display==='grid' ? 'none' : 'grid';
    const hide = (ev)=>{ if(!menu.contains(ev.target) && ev.target!==uploadAudioBtn){ menu.style.display='none'; document.removeEventListener('click', hide); } };
    setTimeout(()=>document.addEventListener('click', hide),0);

    async function pickFile(){ return await new Promise((resolve)=>{ const inp=document.createElement('input'); inp.type='file'; inp.accept='audio/*'; inp.onchange=()=>resolve(inp.files?.[0]||null); inp.click(); }); }
    const { showProgress, updateProgress, completeProgress } = await import('./progress.js');
    const sb = getSupabase();

    async function uploadViaVercel(file){
      const pId = showProgress({ label:'Uploading via Vercel…', determinate:true });
      const url = await new Promise((resolve, reject)=>{
        const xhr = new XMLHttpRequest(); xhr.open('POST','/api/assembly-upload'); xhr.responseType='json'; xhr.setRequestHeader('Authorization', `Bearer ${'808060f1237a4866ad46691bd4ea7153'}`); xhr.upload.onprogress=(e)=>{ if(e.lengthComputable) updateProgress(pId,(e.loaded/e.total)*100); }; xhr.onload=()=>{ if(xhr.status>=200&&xhr.status<300){ resolve((xhr.response?.upload_url)||xhr.response?.url||''); } else reject(new Error(String(xhr.status))); }; xhr.onerror=()=>reject(new Error('network')); const f=new FormData(); f.append('file',file); xhr.send(f); });
      completeProgress(pId,true); return url;
    }
    async function uploadViaFunction(file){
      const pId = showProgress({ label:'Uploading via Supabase Fn…', determinate:true });
      const base = (await import('../lib/supabase.js')).util_getEnv('VITE_SUPABASE_URL','VITE_SUPABASE_URL') || (await import('../lib/supabase.js')).util_getEnv('SUPABASE_URL','SUPABASE_URL');
      const anon = (await import('../lib/supabase.js')).util_getEnv('VITE_SUPABASE_ANON_KEY','VITE_SUPABASE_ANON_KEY') || (await import('../lib/supabase.js')).util_getEnv('SUPABASE_ANON_KEY','SUPABASE_ANON_KEY');
      const url = await new Promise((resolve,reject)=>{ const xhr=new XMLHttpRequest(); xhr.open('POST',`${base.replace(/\/$/,'')}/functions/v1/assembly-chunk-upload`); xhr.responseType='json'; xhr.setRequestHeader('Authorization',`Bearer ${anon}`); xhr.setRequestHeader('apikey',anon); xhr.upload.onprogress=(e)=>{ if(e.lengthComputable) updateProgress(pId,(e.loaded/e.total)*100); }; xhr.onload=()=>{ if(xhr.status>=200&&xhr.status<300){ resolve((xhr.response?.upload_url)||xhr.response?.url||''); } else reject(new Error(String(xhr.status))); }; xhr.onerror=()=>reject(new Error('network')); xhr.send(file); });
      completeProgress(pId,true); return url;
    }
    async function uploadViaStorage(file){
      const pId = showProgress({ label:'Uploading to Storage…', determinate:false });
      const path = `${spaceId}/${Date.now()}_${file.name}`; const bucket = sb.storage.from('hive-attachments'); const up = await bucket.upload(path,file,{ upsert:true }); if(up.error){ completeProgress(pId,false); throw up.error; } const url=bucket.getPublicUrl(path).data.publicUrl; completeProgress(pId,true); return url;
    }
    async function transcribe(url, title){
      const indId = showProgress({ label:'Transcribing…', determinate:false });
      try{ let r = await sb.functions.invoke('assembly',{ body:{ url, space_id: spaceId, api_key:'808060f1237a4866ad46691bd4ea7153', title } }); if(r.error){ r = await sb.functions.invoke('assembly-transcribe',{ body:{ url, space_id: spaceId, api_key:'808060f1237a4866ad46691bd4ea7153', title } }); } const j=r.data; if(typeof j?.transcript==='string'){ const n=await db_createNote(spaceId); await db_updateNote(n.id,{ title, content:j.transcript }); } completeProgress(indId,true); }catch{ completeProgress(indId,false); }
    }

    menu.querySelector('[data-route="vercel"]').onclick = async()=>{ menu.style.display='none'; const f=await pickFile(); if(!f) return; const u=await uploadViaVercel(f); await transcribe(u,(f.name||'Audio').replace(/\.[^/.]+$/,'')); };
    menu.querySelector('[data-route="supabase"]').onclick = async()=>{ menu.style.display='none'; const f=await pickFile(); if(!f) return; const u=await uploadViaFunction(f); await transcribe(u,(f.name||'Audio').replace(/\.[^/.]+$/,'')); };
    menu.querySelector('[data-route="storage"]').onclick = async()=>{ menu.style.display='none'; const f=await pickFile(); if(!f) return; const u=await uploadViaStorage(f); await transcribe(u,(f.name||'Audio').replace(/\.[^/.]+$/,'')); };
    menu.querySelector('[data-route="openai"]').onclick = async()=>{ menu.style.display='none'; const f=await pickFile(); if(!f) return; const pId=showProgress({ label:'OpenAI Whisper…', determinate:true }); try{ const form=new FormData(); form.append('file',f); const r=await fetch('/api/openai-whisper',{ method:'POST', headers:{ Authorization:`Bearer ${ (window.OPENAI_API_KEY||'') }` }, body: form }); const j=await r.json(); if(!r.ok) throw new Error(j?.error||'openai'); const n=await db_createNote(spaceId); await db_updateNote(n.id,{ title:(f.name||'Audio').replace(/\.[^/.]+$/,''), content:j.text||'' }); completeProgress(pId,true); }catch{ completeProgress(pId,false); } };
    menu.querySelector('[data-route="deepgram"]').onclick = async()=>{ menu.style.display='none'; const f=await pickFile(); if(!f) return; const pId=showProgress({ label:'Deepgram…', determinate:true }); try{ const form=new FormData(); form.append('file',f); const r=await fetch('/api/deepgram-upload',{ method:'POST', headers:{ Authorization:`Bearer ${'def4729bf48ec55083d38cec18e6c314c5a4a180'}` }, body: form }); const j=await r.json(); if(!r.ok) throw new Error(j?.error||'deepgram'); const n=await db_createNote(spaceId); await db_updateNote(n.id,{ title:(f.name||'Audio').replace(/\.[^/.]+$/,''), content:j.text||'' }); completeProgress(pId,true); }catch{ completeProgress(pId,false); } };
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
