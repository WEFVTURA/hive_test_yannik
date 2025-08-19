import { initModals } from './ui/modals.js';
import { db_listSpaces, db_createSpace, db_listNotes, db_listFiles, getSupabase, auth_getUser, auth_signIn, auth_signUp, auth_signOut, profile_get, auth_restoreFromCookies } from './lib/supabase.js';
import { renderSpace } from './ui/space.js';
import { renderAuth } from './ui/auth.js';
import { renderChat } from './ui/chat.js';
import { getPrefs, openSettingsModal, openProfileModal } from './ui/settings.js';
import { openModalWithExtractor } from './ui/modals.js';
import { ragIndex } from './lib/rag.js';

initModals();
const prefs = getPrefs();


// Toasts container and helper
(function ensureToasts(){
	if (!document.querySelector('.toasts')){
		const t = document.createElement('div'); t.className='toasts'; document.body.appendChild(t);
	}
	window.showToast = function(msg){
		const t = document.querySelector('.toasts'); const el = document.createElement('div'); el.className='toast'; el.textContent = msg; t.appendChild(el); setTimeout(()=>{ el.remove(); }, 3000);
	};
})();

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
        <button class="button ghost" id="authToggleBtn" title="Sign out" aria-label="Sign out" style="position:relative">
          <svg class="icon"><use href="#exit"></use></svg>
          <span id="logoutHint" style="display:none; position:absolute; top:100%; right:0; margin-top:6px; background:var(--panel-2); border:1px solid var(--border); padding:6px 8px; border-radius:8px; font-size:12px; color:var(--text)">Log out</span>
        </button>
      </div>

      <button class="button primary" id="askHiveBtn" style="width:100%"><svg class="icon"><use href="#spark"></use></svg> Ask HIve</button>
      <button class="button" id="meetingBtn" style="width:100%"><svg class="icon"><use href="#spark"></use></svg> Meeting Intelligence</button>
      <button class="button" id="deepResearchBtn" style="width:100%"><svg class="icon"><use href="#search"></use></svg> Deep Research</button>

      <div class="section">Giannandrea's Library</div>
      <div class="nav-group" id="spacesList"></div>

      <button class="button" id="createSpaceBtn" style="width:100%"><svg class="icon"><use href="#plus"></use></svg> Create a new space</button>

      <div class="promo panel" style="border-radius:12px; position:relative">
        <strong>Upgrade to HIve Pro</strong>
        <div class="muted">Up to 1800 minutes of audio transcriptions and meetings</div>
        <div class="muted">Unlimited research requests (with Mistral Large)</div>
        <button class="button" id="learnMoreBtn" style="justify-self:start">Learn more</button>
      </div>

      <div class="muted" style="font-size:12px">Database: Connected</div>
      <button class="button" id="bulkIndexAll" style="width:100%">Bulk Index All</button>

      <div class="meter">
        <div class="row"><span>Transcribed minutes</span><span class="muted" id="statMinutes">0</span></div>
        <div class="bar" data-val="0"><span></span></div>
        <div class="row"><span>Files uploaded</span><span class="muted" id="statFiles">0</span></div>
        <div class="bar" data-val="0"><span></span></div>
        <div class="row"><span>Notes created</span><span class="muted" id="statNotes">0</span></div>
        <div class="bar" data-val="0"><span></span></div>
        <div class="row"><span>Research requests</span><span class="muted" id="statRequests">0</span></div>
        <div class="bar" data-val="0"><span></span></div>
      </div>

      <div class="section">Preferences</div>
      <div class="prefs">
        <div class="pref-item" id="openProfile"><svg class="icon"><use href="#user"></use></svg> <span>My profile</span></div>
        <div class="pref-item" id="openSettings2"><svg class="icon"><use href="#settings"></use></svg> <span>Settings</span></div>
        
        <div class="pref-item" id="toggleTheme"><svg class="icon"><use href="#sun"></use></svg> <span>Light mode</span></div>
        <div class="pref-item" id="openGuide"><svg class="icon"><use href="#sliders"></use></svg> <span>Guide</span></div>
        <div class="pref-item" id="resetApp"><svg class="icon"><use href="#edit"></use></svg> <span>Reset app state</span></div>
        <div class="pref-item" id="openAuth"><svg class="icon"><use href="#user"></use></svg> <span>Sign in / Sign up</span></div>
      </div>
    </aside>
    <main class="main panel">
      <div class="topbar">
        <div class="search" role="search">
          <input placeholder="Search in your library" id="globalSearch" />
          <button class="go-btn" id="goBtn" title="Go">Go</button>
        </div>
        <button class="button ghost" id="toggleChatBtn" title="Toggle side panel"><svg class="icon"><use href="#split"></use></svg></button>
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
document.getElementById('goBtn')?.addEventListener('click', ()=>{ renderRoute(); });

// Light/dark toggle
const toggleTheme = document.getElementById('toggleTheme');
// Toggle side panel button
document.getElementById('toggleChatBtn')?.addEventListener('click', ()=>{
  const appRoot = document.getElementById('appRoot');
  if (!appRoot) return;
  // Consider visible unless explicitly marked closed
  const isVisible = !appRoot.classList.contains('chat-closed');
  appRoot.classList.toggle('chat-closed', isVisible);
  appRoot.classList.toggle('chat-open', !isVisible);
});
toggleTheme?.addEventListener('click', ()=>{
  const light = document.documentElement.getAttribute('data-theme') === 'light';
  document.documentElement.setAttribute('data-theme', light ? 'dark' : 'light');
});

// Settings/Profile/Auth actions
const openSettings2 = document.getElementById('openSettings2');
const openProfileBtn = document.getElementById('openProfile');
const openAuthBtn = document.getElementById('openAuth');
const authToggleBtn = document.getElementById('authToggleBtn');
const resetAppBtn = document.getElementById('resetApp');
 
openSettings2?.addEventListener('click', openSettingsModal);
openProfileBtn?.addEventListener('click', openProfileModal);
openAuthBtn?.addEventListener('click', async()=>{ renderAuth(content); });
authToggleBtn?.addEventListener('click', async()=>{
  try{
    const me = await auth_getUser();
    if (me){ await auth_signOut(); location.reload(); }
    else { renderAuth(content); }
  }catch{ renderAuth(content); }
});
// Hover hint for logout icon
authToggleBtn?.addEventListener('mouseenter', ()=>{ const h=document.getElementById('logoutHint'); if(h) h.style.display='block'; });
authToggleBtn?.addEventListener('mouseleave', ()=>{ const h=document.getElementById('logoutHint'); if(h) h.style.display='none'; });
openSettings2?.setAttribute('tabindex','0');
openProfileBtn?.setAttribute('tabindex','0');
openAuthBtn?.setAttribute('tabindex','0');
resetAppBtn?.setAttribute('tabindex','0');
openSettings2?.addEventListener('keydown', (e)=>{ if(e.key==='Enter' || e.key===' '){ e.preventDefault(); openSettingsModal(); } });
openProfileBtn?.addEventListener('keydown', (e)=>{ if(e.key==='Enter' || e.key===' '){ e.preventDefault(); openProfileModal(); } });
openAuthBtn?.addEventListener('keydown', (e)=>{ if(e.key==='Enter' || e.key===' '){ e.preventDefault(); renderAuth(content); } });
resetAppBtn?.addEventListener('click', ()=>{
  try{ localStorage.clear(); sessionStorage.clear(); }catch{}
  try{ document.cookie = 'sb_access_token=; Max-Age=0; Path=/'; document.cookie = 'sb_refresh_token=; Max-Age=0; Path=/'; }catch{}
  location.reload();
});
 

// Learn more modal
document.getElementById('learnMoreBtn')?.addEventListener('click', async()=>{
  const { openModalWithExtractor } = await import('./ui/modals.js');
  const body = `
    <div class='muted' style='font-size:12px; margin-bottom:6px'>Choose a plan</div>
    <div class='pricing'>
      <div class='price-card price-free'>
        <div style='font-weight:700; margin-bottom:4px'>Free</div>
        <div class='muted' style='font-size:12px'>300 minutes<br>100 requests<br>Shared spaces up to 5 people</div>
      </div>
      <div class='price-card price-premium'>
        <div style='font-weight:700; margin-bottom:4px'>Premium · $19/month</div>
        <div class='muted' style='font-size:12px'>Up to 1800 minutes of audio + meetings<br>Unlimited research requests (Mistral Large)<br>Share spaces with up to 100 people</div>
      </div>
      <div class='price-card price-enterprise'>
        <div style='font-weight:700; margin-bottom:4px'>Enterprise</div>
        <div class='muted' style='font-size:12px'>Get in touch: <a href='mailto:info@fvtura.com'>info@fvtura.com</a></div>
      </div>
    </div>
  `;
  const scrim = document.getElementById('modalScrim') || (function(){ const s=document.createElement('div'); s.className='modal-scrim'; s.id='modalScrim'; document.body.appendChild(s); return s; })();
  scrim.classList.add('modal-show'); scrim.setAttribute('aria-hidden','false'); scrim.style.display='flex';
  scrim.innerHTML = `
    <div class="modal pricing-modal" role="dialog" aria-modal="true">
      <div class="modal-head"><div>HIve Pro</div><button class="button ghost" id="xClose">✕</button></div>
      <div class="modal-body">${body}</div>
      <div class="modal-actions"><button class="button" id="closeBtn">Close</button></div>
    </div>`;
  const close=()=>{ scrim.classList.remove('modal-show'); scrim.setAttribute('aria-hidden','true'); scrim.style.display='none'; };
  scrim.querySelector('#xClose').onclick=close; scrim.querySelector('#closeBtn').onclick=close; scrim.addEventListener('click',(e)=>{ if(e.target===scrim) close(); });
});

// Open chat side panel
const askBtn = document.getElementById('askHiveBtn');
askBtn?.addEventListener('click', ()=>{
  const appRoot = document.getElementById('appRoot');
  if (appRoot){ appRoot.classList.remove('chat-closed'); appRoot.classList.add('chat-open'); }
  setTimeout(()=>{ try{ document.getElementById('chatInput')?.focus(); }catch{} }, 0);
});

// Tour trigger
document.getElementById('openGuide')?.addEventListener('click', async()=>{
  const { startDefaultTour } = await import('./ui/tour.js');
  startDefaultTour();
});

// Meeting Intelligence button -> modal
const meetingBtn = document.getElementById('meetingBtn');
meetingBtn?.addEventListener('click', async ()=>{
  const res = await openModalWithExtractor('Send HIVE bot', `
    <div class="field"><label>Meeting URL</label><input id="mUrl" placeholder="Paste Zoom/Meet/Teams URL"></div>
    <div class="muted" style="font-size:12px">HIVE bot will join and record. Transcripts are available in the <strong>Meetings</strong> space in your dashboard. <em>(It can take a few minutes for transcripts to appear there after the call.)</em></div>
  `, (root)=>({ url: root.querySelector('#mUrl')?.value?.trim()||'' }));
  if (!res.ok) return; const url = res.values?.url; if(!url){ window.showToast && window.showToast('Add a meeting URL'); return; }
  try{
    const sb = getSupabase();
    const { data, error } = await sb.functions.invoke('recall-create-bot', { body: { meeting_url: url } });
    if (error) throw error;
    window.showToast && window.showToast('HIVE bot joining meeting');
  }catch(e){ window.showToast && window.showToast('Failed to send bot'); }
});

// Deep Research button -> open chat side panel in Perplexity mode
const deepResearchBtn = document.getElementById('deepResearchBtn');
deepResearchBtn?.addEventListener('click', ()=>{
  const appRoot = document.getElementById('appRoot');
  if (appRoot){ appRoot.classList.remove('chat-closed'); appRoot.classList.add('chat-open'); }
  setTimeout(()=>{
    try{
      const modeSel = document.querySelector('#chatRoot #queryMode');
      if (modeSel){ modeSel.value = 'pplx'; modeSel.dispatchEvent(new Event('change')); }
      document.getElementById('chatInput')?.focus();
    }catch{}
  }, 0);
});

// Create Space button -> prompt name and create
const createSpaceBtn = document.getElementById('createSpaceBtn');
createSpaceBtn?.addEventListener('click', async ()=>{
  const me = await ensureAuth(); if (!me) return;
  const res = await openModalWithExtractor('Create a new space', `
    <div class="field"><label>Space name</label><input id="sName" placeholder="e.g., Research, Projects, Journal"></div>
  `, (root)=>({ name: root.querySelector('#sName')?.value?.trim()||'' }));
  if (!res.ok) return; const name = res.values?.name||'';
  if (!name){ window.showToast && window.showToast('Add a space name'); return; }
  try{
    const space = await db_createSpace(name);
    window.showToast && window.showToast('Space created');
    location.hash = 'space/'+space.id;
  }catch(e){ window.showToast && window.showToast('Failed to create space'); }
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
  navItems.innerHTML = spaces.slice(0,4).map(s=>`<div class="nav-item" data-id="${s.id}"><div style="display:flex; align-items:center; gap:8px"><svg class="icon"><use href="#book"></use></svg><span>${s.name}</span></div><button class="button ghost sm" data-space-menu="${s.id}" title="Options">⋯</button></div>`).join('');
  navItems.querySelectorAll('[data-id]').forEach(el=>{ el.addEventListener('click', ()=>{ location.hash = 'space/'+el.getAttribute('data-id'); }); });
  // Prevent row navigation when clicking the options button
  navItems.querySelectorAll('[data-space-menu]').forEach(btn=>{
    btn.addEventListener('click', async (e)=>{
      e.stopPropagation();
      const id = btn.getAttribute('data-space-menu');
      const space = spaces.find(s=>s.id===id);
      if (!space) return;
      await openSpaceOptions(space);
    });
  });

  const grid = document.getElementById('grid');
  // Promote baseline spaces first
  const meetingsId = localStorage.getItem('hive_meetings_space_id')||'';
  const chatsId = localStorage.getItem('hive_chats_space_id')||'';
  spaces.sort((a,b)=>{
    const aScore = ((a.id===meetingsId)?-2:0) + ((a.id===chatsId)?-1:0);
    const bScore = ((b.id===meetingsId)?-2:0) + ((b.id===chatsId)?-1:0);
    return aScore - bScore;
  });
  grid.innerHTML = spaces.map(s=>{
    let cover;
    if (s.id===meetingsId){ cover = `<div style=\"display:grid; place-items:center; height:100%\"><svg class=\"icon card-icon\"><use href=\"#video\"></use></svg></div>`; }
    else if (s.id===chatsId){ cover = `<div style=\"display:grid; place-items:center; height:100%\"><svg class=\"icon card-icon\"><use href=\"#chat\"></use></svg></div>`; }
    else { cover = s.cover_url ? `<img src="${s.cover_url}" alt="cover" style="width:100%; height:100%; object-fit:cover; border-radius:12px">` : `<div style=\"display:grid; place-items:center; gap:8px\"><svg class=\"icon\"><use href=\"#box\"></use></svg><span class=\"muted\">Cover</span></div>`; }
    return `<article class="lib-card" data-id="${s.id}">
      <div class="lib-visual">${cover}<div class="card-title-overlay">${s.name}</div></div>
      <div class="lib-meta"><span>Space</span><span></span><button class="button ghost sm" data-space-menu-grid="${s.id}" title="Options">⋯</button></div>
    </article>`;
  }).join('');
  grid.querySelectorAll('[data-id]').forEach(el=>{ el.addEventListener('click', ()=>{ location.hash = 'space/'+el.getAttribute('data-id'); }); });
  grid.querySelectorAll('[data-space-menu-grid]').forEach(btn=>{
    btn.addEventListener('click', async (e)=>{
      e.stopPropagation();
      const id = btn.getAttribute('data-space-menu-grid');
      const space = spaces.find(s=>s.id===id);
      if (!space) return;
      await openSpaceOptions(space);
    });
  });
}

async function openSpaceOptions(space){
  const { openModalWithExtractor } = await import('./ui/modals.js');
  const body = `
    <div class='field'><label>Name</label><input id='spName' value='${space.name||''}' /></div>
    <div class='field'><label>Visibility</label>
      <select id='spVis'>
        <option value='private' ${space.visibility==='private'?'selected':''}>Private</option>
        <option value='team' ${space.visibility==='team'?'selected':''}>Team</option>
        <option value='public' ${space.visibility==='public'?'selected':''}>Public</option>
      </select>
    </div>
    <div class='muted' style='font-size:12px'>Danger zone</div>
    <button class='button red' id='spDelete'>Delete space</button>`;
  const res = await openModalWithExtractor('Space options', body, (root)=>({ name: root.querySelector('#spName')?.value||'', vis: root.querySelector('#spVis')?.value||space.visibility||'private', del: root.querySelector('#spDelete')?.dataset?.clicked==='1' }));
  const scrim = document.getElementById('modalScrim');
  scrim?.querySelector('#spDelete')?.addEventListener('click', ()=>{ scrim.querySelector('#spDelete').dataset.clicked='1'; });
  if (!res.ok) return;
  const { name, vis, del } = res.values || {};
  const sb = await import('./lib/supabase.js');
  if (del){ await (await import('./lib/supabase.js')).db_updateSpace(space.id, { deleted_at: new Date().toISOString() }).catch(()=>{}); }
  else { if (name && name!==space.name) await sb.db_updateSpace(space.id, { name }); if (vis && vis!==space.visibility) await sb.db_updateSpace(space.id, { visibility: vis }); }
  renderRoute();
}

async function renderRoute(){
  // Do not fetch data until authenticated to avoid 401s
  const me = await auth_getUser().catch(()=>null);
  if (!me){ renderAuth(content); return; }
  const hash = location.hash.replace(/^#/, '');
  if (hash.startsWith('space/')){
    const sid = hash.split('/')[1];
    const chatsId = localStorage.getItem('hive_chats_space_id')||'';
    if (sid && chatsId && sid===chatsId){ const { renderChatsSpace } = await import('./ui/chat.js'); await renderChatsSpace(content); }
    else { await renderSpace(content, sid); }
  }
  else { await renderLibrary(); }
}

window.addEventListener('hashchange', renderRoute);
renderRoute();

// Expose router for programmatic navigation from other modules
try{ window.hiveRenderRoute = renderRoute; }catch{}

// Chat splitter drag
const splitter = document.getElementById('chatSplitter');
let dragging = false; let startX = 0; let startWidth = 360;
splitter?.addEventListener('mousedown', (e)=>{ dragging=true; startX=e.clientX; const cs=getComputedStyle(document.documentElement).getPropertyValue('--chatWidth'); startWidth=parseInt(cs||'360'); document.body.style.userSelect='none'; });
window.addEventListener('mousemove', (e)=>{ if(!dragging) return; const dx = e.clientX - startX; const next = Math.max(260, startWidth - dx); document.documentElement.style.setProperty('--chatWidth', next+'px'); });
window.addEventListener('mouseup', ()=>{ dragging=false; document.body.style.userSelect=''; });

async function ensureAuth(){
  const user = await auth_getUser();
  if (user) return user;
  const res = await openModalWithExtractor('Sign in to HIve', `
    <div class="field"><label>Email</label><input id="authEmail" placeholder="you@company.com" /></div>
    <div class="field"><label>Password</label><input id="authPass" type="password" placeholder="********" /></div>
    <div class="muted" style="font-size:12px">No email verification. Use a password you control.</div>
    <div class="muted" id="authMsg" style="font-size:12px"></div>
  `, (root)=>({ email: root.querySelector('#authEmail')?.value?.trim()||'', password: root.querySelector('#authPass')?.value||'' }));
  if (!res.ok) return null;
  const { email, password } = res.values || { email:'', password:'' };
  if (!email || !password){ window.showToast && window.showToast('Enter email and password'); return await ensureAuth(); }
  try{
    try { await auth_signIn(email, password); }
    catch { await auth_signUp(email, password); }
  } catch(e){ window.showToast && window.showToast('Auth failed'); return await ensureAuth(); }
  return await auth_getUser();
}

// Bootstrap auth early (restore from cookies first to avoid re-login on refresh)
(async()=>{
  try{
    await auth_restoreFromCookies();
  }catch{}
  let user=null; try{ user = await auth_getUser(); }catch(e){ console.warn('auth_getUser failed', e); }
  if (!user){
    // Ensure non-auth users always see the login/signup surface
    try{ renderAuth(content); }catch{}
    // Also label the auth toggle button accordingly
    const btn = document.getElementById('authToggleBtn'); if (btn){ btn.textContent = 'Sign in'; }
    return;
  }
  const btn = document.getElementById('authToggleBtn'); if (btn){ btn.setAttribute('title','Sign out'); }
  await ensureBaselineSpaces();
  await migrateResearchSpaces();
  await hydrateProfileUI();
  await maybeRunOnboardingTour();
  // Re-render route to reflect possible space renames (e.g., Private Research -> Deep Researches)
  try{ await renderRoute(); }catch{}
})();
// Load stats
(async()=>{
  try{
    const { stats_summary } = await import('./lib/supabase.js');
    const s = await stats_summary();
    const mEl = document.getElementById('statMinutes'); if(mEl) mEl.textContent = `${s.transcribedMinutes}m`;
    const fEl = document.getElementById('statFiles'); if(fEl) fEl.textContent = String(s.filesUploaded);
    const nEl = document.getElementById('statNotes'); if(nEl) nEl.textContent = String(s.notesCreated);
    const rEl = document.getElementById('statRequests'); if(rEl) rEl.textContent = String(s.researchRequests);
  }catch{}
})();

// Hydrates sidebar avatar and name from Supabase profile
async function hydrateProfileUI(){
	const me = await auth_getUser();
	if (!me) return;
	const brandEl = document.querySelector('.brand');
	const avatarEl = document.querySelector('.avatar');
	let fullName = '';
	let avatarUrl = '';
	try{
		const p = await profile_get(me.id);
		fullName = (p?.full_name||'').trim();
		avatarUrl = p?.avatar_url||'';
	}catch{}
	if (brandEl){
		const fallbackName = (me?.email||'User');
		brandEl.textContent = fullName || brandEl.textContent || fallbackName;
	}
	if (avatarEl){
		if (avatarUrl){
			avatarEl.style.backgroundImage = `url('${avatarUrl}')`;
			avatarEl.style.backgroundSize = 'cover';
			avatarEl.textContent = '';
		}else{
			avatarEl.style.backgroundImage = '';
			const letterSource = fullName || me.email || 'U';
			avatarEl.textContent = letterSource.slice(0,1).toUpperCase();
		}
	}
}

// Ensure baseline spaces exist: Meetings and Chats
async function ensureBaselineSpaces(){
  try{
    const spaces = await db_listSpaces().catch(()=>[]);
    const hasMeetings = spaces.find(s=> (s.name||'').toLowerCase()==='meetings');
    const hasChats = spaces.find(s=> (s.name||'').toLowerCase()==='chats');
    const hasResearch = spaces.find(s=> /deep research/i.test(s.name||''));
    if (!hasMeetings){ const s = await db_createSpace('Meetings'); localStorage.setItem('hive_meetings_space_id', s.id); }
    else { localStorage.setItem('hive_meetings_space_id', hasMeetings.id); }
    if (!hasChats){ const s2 = await db_createSpace('Chats'); localStorage.setItem('hive_chats_space_id', s2.id); }
    else { localStorage.setItem('hive_chats_space_id', hasChats.id); }
    if (!hasResearch){ const s3 = await db_createSpace('Deep Researches'); localStorage.setItem('hive_research_space_id', s3.id); }
    else { localStorage.setItem('hive_research_space_id', hasResearch.id); }
  }catch{}
}

// One-off migration: rename legacy "Private Research" to "Deep Researches"
async function migrateResearchSpaces(){
  try{
    const spaces = await db_listSpaces().catch(()=>[]);
    const legacy = spaces.find(s=> /private\s+research/i.test(s.name||''));
    if (legacy && legacy.name !== 'Deep Researches'){
      await db_updateSpace(legacy.id, { name: 'Deep Researches' }).catch(()=>{});
      try{ localStorage.setItem('hive_research_space_id', legacy.id); }catch{}
    }
  }catch{}
}

// Onboarding: auto-run the tour in a user's first 3 sessions
async function maybeRunOnboardingTour(){
  try{
    const me = await auth_getUser(); if(!me) return;
    const key = `hive_onboard_${me.id}`;
    const count = parseInt(localStorage.getItem(key)||'0',10)||0;
    if (count >= 3) return;
    const { startDefaultTour } = await import('./ui/tour.js');
    setTimeout(()=>{ startDefaultTour(); }, 300);
    localStorage.setItem(key, String(count+1));
  }catch{}
}
