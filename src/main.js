import { initModals } from './ui/modals.js';
import { db_listSpaces, db_createSpace, db_listNotes, db_listFiles } from './lib/supabase.js';
import { renderSpace } from './ui/space.js';
import { renderChat } from './ui/chat.js';
import { getPrefs, openSettingsModal, openProfileModal } from './ui/settings.js';
import { openModalWithExtractor } from './ui/modals.js';
import { ragIndex } from './lib/rag.js';

initModals();
const prefs = getPrefs();

const app = document.getElementById('app');
app.innerHTML = `
  <div class="app" id="appRoot">
    <aside class="sidebar panel">
      <div class="profile">
        <div class="avatar">G</div>
        <div>
          <div class="brand">${prefs.profileName}</div>
          <div class="muted" style="font-size:12px">Ask HIve</div>
        </div>
        <div class="spacer"></div>
        <button class="button ghost" id="openSettings" title="settings"><svg class="icon"><use href="#settings"></use></svg></button>
      </div>

      <button class="button primary" id="askHiveBtn" style="width:100%"><svg class="icon"><use href="#spark"></use></svg> Ask HIve</button>

      <div class="section">Giannandrea's Library</div>
      <div class="nav-group" id="spacesList"></div>

      <button class="button" id="createSpaceBtn" style="width:100%"><svg class="icon"><use href="#plus"></use></svg> Create a new space</button>

      <div class="promo panel" style="border-radius:12px">
        <strong>Upgrade to HIve Pro</strong>
        <div class="muted">Unlimited savings & co‑pilot, 30 h/month YouTube transcription, Claude 3.5 Sonnet</div>
        <button class="button" style="justify-self:start">Learn more</button>
      </div>

      <div class="muted" style="font-size:12px">Database: Connected</div>
      <button class="button" id="bulkIndexAll" style="width:100%">Bulk Index All</button>

      <div class="meter">
        <div class="row"><span>YT transcript</span><span class="muted">0m / 2h</span></div>
        <div class="bar" data-val="15"><span></span></div>
        <div class="row"><span>Materials upload</span><span class="muted">0 / 30</span></div>
        <div class="bar" data-val="0"><span></span></div>
        <div class="row"><span>Assistant requests</span><span class="muted">0 / 50</span></div>
        <div class="bar" data-val="0"><span></span></div>
        <div class="row"><span>Research requests</span><span class="muted">0 / 0</span></div>
        <div class="bar" data-val="0"><span></span></div>
      </div>

      <div class="section">Preferences</div>
      <div class="prefs">
        <div class="pref-item" id="openProfile"><svg class="icon"><use href="#user"></use></svg> <span>My profile</span></div>
        <div class="pref-item" id="openSettings2"><svg class="icon"><use href="#settings"></use></svg> <span>Settings</span></div>
        <div class="pref-item" id="toggleTheme"><svg class="icon"><use href="#sun"></use></svg> <span>Light mode</span></div>
        <div class="pref-item"><svg class="icon"><use href="#chrome"></use></svg> <span>Chrome extension</span></div>
      </div>
    </aside>
    <main class="main panel">
      <div class="topbar">
        <div class="search" role="search">
          <input placeholder="Search in space 'Giannandrea's Library'" id="globalSearch" />
        </div>
        <button class="go-btn" title="Go">Go</button>
      </div>
      <div class="content" id="content"></div>
    </main>
    <div class="splitter" id="chatSplitter" aria-hidden="true"></div>
    <aside class="right panel" id="chatPanel">
      <div id="chatRoot"></div>
    </aside>
  </div>`;

const content = document.getElementById('content');
const chatRoot = document.getElementById('chatRoot');
renderChat(chatRoot);

let currentQuery = '';
const globalSearchInput = document.getElementById('globalSearch');
globalSearchInput?.addEventListener('input', ()=>{ currentQuery = (globalSearchInput.value||'').toLowerCase(); renderRoute(); });

// Light/dark toggle
const toggleTheme = document.getElementById('toggleTheme');
toggleTheme?.addEventListener('click', ()=>{
  const light = document.documentElement.getAttribute('data-theme') === 'light';
  document.documentElement.setAttribute('data-theme', light ? 'dark' : 'light');
});

// Settings/Profile actions
const openSettingsBtn = document.getElementById('openSettings');
const openSettings2 = document.getElementById('openSettings2');
const openProfileBtn = document.getElementById('openProfile');
openSettingsBtn?.addEventListener('click', openSettingsModal);
openSettings2?.addEventListener('click', openSettingsModal);
openProfileBtn?.addEventListener('click', openProfileModal);
openSettings2?.setAttribute('tabindex','0');
openProfileBtn?.setAttribute('tabindex','0');
openSettings2?.addEventListener('keydown', (e)=>{ if(e.key==='Enter' || e.key===' '){ e.preventDefault(); openSettingsModal(); } });
openProfileBtn?.addEventListener('keydown', (e)=>{ if(e.key==='Enter' || e.key===' '){ e.preventDefault(); openProfileModal(); } });

// Create Space
const createSpaceBtn = document.getElementById('createSpaceBtn');
createSpaceBtn?.addEventListener('click', async ()=>{
  const res = await openModalWithExtractor('Create a new space', `<div class="field"><label>Space name</label><input id="spaceName" placeholder="e.g. Research Notes"></div>`, (root)=>({ name: root.querySelector('#spaceName')?.value?.trim()||'' }));
  if (!res.ok) return; const name = res.values?.name; if(!name) return;
  try{ const s = await db_createSpace(name); location.hash = 'space/'+s.id; }catch(e){ alert('Failed to create space'); }
});

// Bulk Index All
const bulkBtn = document.getElementById('bulkIndexAll');
bulkBtn?.addEventListener('click', async ()=>{
  bulkBtn.disabled = true; bulkBtn.textContent = 'Bulk indexing…';
  try{
    const spaces = await db_listSpaces().catch(()=>[]);
    for (const sp of spaces){
      const [notes, files] = await Promise.all([db_listNotes(sp.id).catch(()=>[]), db_listFiles(sp.id).catch(()=>[])]);
      const items = [];
      for(const n of notes){ items.push({ source_type:'note', source_id:n.id, content:`${n.title||''}\n${n.content||''}` }); }
      for(const f of files){ items.push({ source_type:'file', source_id:f.id, content:`${f.name||''} ${f.url||''}` }); }
      if(items.length) await ragIndex(sp.id, items);
    }
    bulkBtn.textContent = 'Bulk Index All (done)';
  }catch(e){
    bulkBtn.textContent = 'Bulk Index All (error)';
  }finally{ bulkBtn.disabled = false; setTimeout(()=>{ bulkBtn.textContent='Bulk Index All'; }, 1500); }
});

async function renderLibrary(){
  content.innerHTML = `
    <div class="content-head">
      <div class="title"><h2>My Library</h2></div>
      <div class="view-controls">
        <div class="segmented" role="tablist">
          <button id="cardsBtn" class="active" role="tab">Cards</button>
          <button id="listBtn" role="tab">List</button>
        </div>
      </div>
    </div>
    <div class="card-grid" id="grid"></div>`;

  let spaces = await db_listSpaces().catch(()=>[]);
  if (currentQuery) spaces = spaces.filter(s => (s.name||'').toLowerCase().includes(currentQuery));

  const list = document.getElementById('spacesList');
  list.innerHTML = `
    <div class="nav-header" style="display:flex; align-items:center; justify-content:space-between; padding:10px 12px; background:var(--panel-2)">
      <div style="display:flex; align-items:center; gap:8px"><svg class="icon"><use href="#folder"></use></svg><span>Library</span></div>
      <div class="badge">${spaces.length}</div>
    </div>
    <div class="nav-items" id="navItems"></div>`;
  const navItems = document.getElementById('navItems');
  navItems.innerHTML = spaces.map(s=>`<div class="nav-item" data-id="${s.id}"><div style="display:flex; align-items:center; gap:8px"><svg class="icon"><use href="#book"></use></svg><span>${s.name}</span></div><svg class="icon"><use href="#chev-right"></use></svg></div>`).join('');
  navItems.querySelectorAll('[data-id]').forEach(el=>{ el.addEventListener('click', ()=>{ location.hash = 'space/'+el.getAttribute('data-id'); }); });

  const grid = document.getElementById('grid');
  grid.innerHTML = spaces.map(s=>{
    const cover = s.cover_url ? `<img src="${s.cover_url}" alt="cover" style="width:100%; height:100%; object-fit:cover; border-radius:12px">` : `<div style=\"display:grid; place-items:center; gap:8px\"><svg class=\"icon\"><use href=\"#box\"></use></svg><span class=\"muted\">Cover</span></div>`;
    return `<article class="lib-card" data-id="${s.id}">
      <div class="lib-visual">${cover}<div class="card-title-overlay">${s.name}</div></div>
      <div class="lib-meta"><span>Space</span><span></span><span title="Open">›</span></div>
    </article>`;
  }).join('');
  grid.querySelectorAll('[data-id]').forEach(el=>{ el.addEventListener('click', ()=>{ location.hash = 'space/'+el.getAttribute('data-id'); }); });
}

async function renderRoute(){
  const hash = location.hash.replace(/^#/, '');
  if (hash.startsWith('space/')){ await renderSpace(content, hash.split('/')[1]); }
  else { await renderLibrary(); }
}

window.addEventListener('hashchange', renderRoute);
renderRoute();

// Chat splitter drag
const splitter = document.getElementById('chatSplitter');
let dragging = false; let startX = 0; let startWidth = 360;
splitter?.addEventListener('mousedown', (e)=>{ dragging=true; startX=e.clientX; const cs=getComputedStyle(document.documentElement).getPropertyValue('--chatWidth'); startWidth=parseInt(cs||'360'); document.body.style.userSelect='none'; });
window.addEventListener('mousemove', (e)=>{ if(!dragging) return; const dx = e.clientX - startX; const next = Math.max(260, startWidth - dx); document.documentElement.style.setProperty('--chatWidth', next+'px'); });
window.addEventListener('mouseup', ()=>{ dragging=false; document.body.style.userSelect=''; });
