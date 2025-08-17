import { getSupabase, db_getSpace, db_listFiles, db_listNotes, db_updateSpace, db_createNote } from '../lib/supabase.js';
import { ragIndex } from '../lib/rag.js';
import { openModalWithExtractor } from './modals.js';
import { marked } from 'https://cdn.jsdelivr.net/npm/marked@12/+esm';

export async function renderSpace(root, spaceId){
  const [space, files, notes] = await Promise.all([
    db_getSpace(spaceId).catch(()=>({ id: spaceId, name: 'Space'})),
    db_listFiles(spaceId).catch(()=>[]),
    db_listNotes(spaceId).catch(()=>[]),
  ]);

  root.innerHTML = `
    <div class="content-head">
      <div class="title" style="display:flex; align-items:center; gap:10px">
        <h2 id="spaceTitle" contenteditable="true" title="Click to rename">${space.name}</h2>
        <span class="muted">Files & Notes</span>
      </div>
      <div class="view-controls">
        <button class="button ghost" id="reindexBtn" title="Reindex for AI">Reindex</button>
        <button class="button ghost" id="backBtn">Back</button>
      </div>
    </div>
    <div class="card-grid" style="grid-template-columns:1fr 1fr">
      <section class="lib-card">
        <div style="font-weight:600; margin-bottom:6px">Files</div>
        <div style="display:flex; gap:8px; margin-bottom:6px">
          <button class="button" id="addLinkBtn">Add link</button>
          <button class="button" id="uploadBtn">Upload file</button>
        </div>
        <div id="filesList" style="display:grid; gap:8px"></div>
      </section>
      <section class="lib-card">
        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:6px">
          <div style="font-weight:600">Notes</div>
          <button class="button" id="addNoteBtn">New note</button>
        </div>
        <div id="notesList" style="display:grid; gap:10px"></div>
      </section>
    </div>`;

  // Title rename
  const titleEl = root.querySelector('#spaceTitle');
  titleEl.addEventListener('keydown', (e)=>{ if(e.key==='Enter'){ e.preventDefault(); titleEl.blur(); } });
  titleEl.addEventListener('blur', async ()=>{
    const newName = (titleEl.textContent||'').trim(); if(!newName || newName===space.name) return;
    await db_updateSpace(spaceId, { name: newName }).catch(alert);
  });

  // Files list
  const filesList = root.querySelector('#filesList');
  filesList.innerHTML = files.map(f=>`<div style="display:flex; justify-content:space-between; border:1px solid var(--border); padding:8px; border-radius:10px"><div>${f.name}</div><div class="muted">${f.content_type||''}</div></div>`).join('');

  // Notes list
  const notesList = root.querySelector('#notesList');
  for(const n of notes){
    const row = document.createElement('div');
    row.style.border = '1px solid var(--border)'; row.style.borderRadius='10px'; row.style.padding='8px';
    row.innerHTML = `<input data-title value="${n.title||''}" style="width:100%; background:transparent; border:1px solid var(--border); border-radius:8px; padding:6px; margin-bottom:6px; color:var(--text)">
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px">
        <textarea data-content style="width:100%; min-height:160px; background:transparent; border:1px solid var(--border); border-radius:8px; padding:8px; color:var(--text)">${n.content||''}</textarea>
        <div data-preview style="border:1px solid var(--border); border-radius:8px; padding:10px; background:var(--panel)"></div>
      </div>`;
    const title = row.querySelector('[data-title]');
    const content = row.querySelector('[data-content]');
    const preview = row.querySelector('[data-preview]');
    const renderPrev = ()=>{ preview.innerHTML = marked.parse(content.value||''); };
    renderPrev();
    const autosave = debounce(async()=>{
      await db_updateNote(n.id, { title: title.value||'', content: content.value||'', updated_at: new Date().toISOString() }).catch(console.error);
      // index
      try{ await ragIndex(spaceId, [{ source_type:'note', source_id:n.id, content: (title.value||'')+'\n'+(content.value||'') }]); } catch {}
    }, 800);
    title.addEventListener('input', autosave);
    content.addEventListener('input', ()=>{ renderPrev(); autosave(); });
    notesList.appendChild(row);
  }

  // Buttons
  root.querySelector('#backBtn').addEventListener('click', ()=>{ window.location.hash=''; });
  root.querySelector('#addNoteBtn').addEventListener('click', async()=>{ await db_createNote(spaceId); renderSpace(root, spaceId); });
  root.querySelector('#reindexBtn').addEventListener('click', async()=>{
    const payload = notes.slice(0,50).map(n=>({ source_type:'note', source_id:n.id, content:(n.title||'')+'\n'+(n.content||'') }));
    const res = await ragIndex(spaceId, payload).catch(()=>null);
    alert('Reindex: '+JSON.stringify(res||{},null,2));
  });
}

function debounce(fn, wait){ let t=null; return (...args)=>{ clearTimeout(t); t=setTimeout(()=>fn(...args), wait); }; }
