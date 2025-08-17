import { initModals } from './ui/modals.js';
import { db_listSpaces } from './lib/supabase.js';
import { renderSpace } from './ui/space.js';
import { renderChat } from './ui/chat.js';

initModals();

const app = document.getElementById('app');
app.innerHTML = `
  <div class="app" id="appRoot" style="display:grid; grid-template-columns:260px 1fr 360px; gap:18px; height:100vh; padding:18px">
    <aside class="sidebar panel" style="padding:14px">
      <button class="button primary" id="askHiveBtn" style="width:100%">Ask HIve</button>
      <div class="section">Library</div>
      <div class="nav-group" id="spacesList" style="border:1px solid var(--border); border-radius:12px"></div>
    </aside>
    <main class="main panel" style="padding:14px">
      <div class="content" id="content"></div>
    </main>
    <aside class="right panel" id="chatPanel" style="padding:14px">
      <div id="chatRoot"></div>
    </aside>
  </div>`;

const content = document.getElementById('content');
const chatRoot = document.getElementById('chatRoot');
renderChat(chatRoot);

async function renderLibrary(){
  content.innerHTML = `<div class="content-head"><div class="title"><h2>My Library</h2></div></div><div class="card-grid" id="grid"></div>`;
  const spaces = await db_listSpaces().catch(()=>[]);
  const list = document.getElementById('spacesList');
  list.innerHTML = spaces.map(s=>`<div class="nav-item" data-id="${s.id}" style="padding:10px; border-top:1px solid var(--border); cursor:pointer">${s.name}</div>`).join('') || '<div class="muted" style="padding:10px">No spaces</div>';
  list.querySelectorAll('[data-id]').forEach(el=>{ el.addEventListener('click', ()=>{ location.hash = 'space/'+el.getAttribute('data-id'); }); });
}

async function renderRoute(){
  const hash = location.hash.replace(/^#/, '');
  if (hash.startsWith('space/')){ await renderSpace(content, hash.split('/')[1]); }
  else { await renderLibrary(); }
}

window.addEventListener('hashchange', renderRoute);
renderRoute();
