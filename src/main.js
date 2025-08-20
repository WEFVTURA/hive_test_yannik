import { initModals } from './ui/modals.js';
import { db_listSpaces, db_createSpace, db_listNotes, db_listFiles, getSupabase, auth_getUser, auth_signIn, auth_signUp, auth_signOut, profile_get, auth_restoreFromCookies } from './lib/supabase.js';
import { renderSpace } from './ui/space.js';
import { renderAuth } from './ui/auth.js';
import { renderChat } from './ui/chat.js';
import { initSelectEnhancer } from './ui/select.js';
import { getPrefs, openSettingsModal, openProfileModal } from './ui/settings.js';
import { openModalWithExtractor } from './ui/modals.js';
import { ragIndex } from './lib/rag.js';

initModals();
const prefs = getPrefs();

// Lightweight global debug logger so logs are captured even before Settings is opened
(function initDebugLogger(){
	try{
		if (!prefs.enableDebugLog) return;
		window.__hiveLogBuffer = window.__hiveLogBuffer || [];
		function capture(level, args){
			try{ window.__hiveLogBuffer.push({ t: Date.now(), level, args: Array.from(args) }); if (window.__hiveLogBuffer.length>1000) window.__hiveLogBuffer.shift(); }catch{}
		}
		const orig = { log:console.log, warn:console.warn, error:console.error, info:console.info };
		['log','warn','error','info'].forEach(k=>{
			console[k] = function(){ capture(k==='log'?'debug':k, arguments); return orig[k].apply(console, arguments); };
		});
		window.__hiveLog = function(level, ...args){ capture(level, args); };
	}catch{}
})();


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
    <div class="mobile-header">
      <button class="button mobile-only" id="mobileMenuBtn"><i data-lucide="menu" class="icon" aria-hidden="true"></i></button>
      <div class="brand">${prefs.profileName}</div>
      <div style="display:flex; gap:6px; align-items:center">
        <span id="layoutBadge" class="badge mobile-only" style="display:inline-block">Web</span>
        <button class="button mobile-only" id="openChatMobile"><i data-lucide="message-square" class="icon" aria-hidden="true"></i> Chat</button>
        <button class="button mobile-only" id="openSettingsMobile"><i data-lucide="settings" class="icon" aria-hidden="true"></i></button>
      </div>
    </div>
    <aside class="sidebar panel">
      <div class="profile">
        <div class="avatar">G</div>
        <div>
          <div class="brand">${prefs.profileName}</div>
          <div class="muted" style="font-size:12px">Ask Hive</div>
        </div>
        <div class="spacer"></div>
        <button class="button ghost" id="authToggleBtn" title="Sign out" aria-label="Sign out" style="position:relative">
          <svg class="icon"><use href="#exit"></use></svg>
          <span id="logoutHint" style="display:none; position:absolute; top:100%; right:0; margin-top:6px; background:var(--panel-2); border:1px solid var(--border); padding:6px 8px; border-radius:8px; font-size:12px; color:var(--text)">Log out</span>
        </button>
      </div>

      <button class="button primary" id="askHiveBtn" style="width:100%"><svg class="icon"><use href="#spark"></use></svg> Ask Hive</button>
      <button class="button" id="meetingBtn" style="width:100%"><svg class="icon"><use href="#spark"></use></svg> Meeting Intelligence</button>
      <button class="button" id="deepResearchBtn" style="width:100%"><svg class="icon"><use href="#search"></use></svg> Deep Research</button>
      <button class="button" id="quickNewNoteBtn" style="width:100%"><svg class="icon"><use href="#edit"></use></svg> New Note</button>
      <button class="button" id="simplifiedViewBtn" style="width:100%"><i data-lucide="smartphone" class="icon" aria-hidden="true"></i> Simplified view</button>
      

      <div class="section">Giannandrea's Library</div>
      <div class="nav-group" id="spacesList"></div>

      <button class="button" id="createSpaceBtn" style="width:100%"><svg class="icon"><use href="#plus"></use></svg> Create a new space</button>

      <div class="promo panel" style="border-radius:12px; position:relative">
        <strong>Upgrade to Hive Pro</strong>
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
    <div class="mobile-drawer" id="mobileDrawer" aria-hidden="true"></div>
    <div class="mobile-scrim" id="mobileScrim" aria-hidden="true"></div>
    <div class="simplified-dock" id="simplifiedDock" style="display:none">
      <button class="button" id="dockMenuBtn"><i data-lucide="menu" class="icon" aria-hidden="true"></i></button>
      <button class="button" id="dockLibraryBtn"><i data-lucide="book" class="icon" aria-hidden="true"></i></button>
      <button class="button" id="dockSettingsBtn"><i data-lucide="settings" class="icon" aria-hidden="true"></i></button>
    </div>
  </div>`;
try{ window.lucide && window.lucide.createIcons(); }catch{}
try{ initSelectEnhancer(); }catch{}
// Disable legacy mobile stylesheet; Simplified view will handle mobile
try{ const m=document.getElementById('mobileCss'); if(m){ m.setAttribute('media','not all'); m.disabled=true; m.setAttribute('data-forced','0'); } }catch{}

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
// resetApp removed from UI; keep no-op to avoid errors if present
openSettings2?.addEventListener('keydown', (e)=>{ if(e.key==='Enter' || e.key===' '){ e.preventDefault(); openSettingsModal(); } });
openProfileBtn?.addEventListener('keydown', (e)=>{ if(e.key==='Enter' || e.key===' '){ e.preventDefault(); openProfileModal(); } });
openAuthBtn?.addEventListener('keydown', (e)=>{ if(e.key==='Enter' || e.key===' '){ e.preventDefault(); renderAuth(content); } });
resetAppBtn && resetAppBtn.remove();
 

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

// Quick New Note (sidebar): choose space and open rich editor
const quickNewNoteBtn = document.getElementById('quickNewNoteBtn');
quickNewNoteBtn?.addEventListener('click', async ()=>{
  try{
    const { db_listSpaces, db_createNote } = await import('./lib/supabase.js');
    const list = await db_listSpaces().catch(()=>[]);
    const options = list.map(s=>`<option value='${s.id}'>${s.name}</option>`).join('');
    const body = `
      <div class='field'><label>Target space</label><select id='tSpace' class='select' style='width:100%'>${options}</select></div>
      <div class='field'><label>Title</label><input id='tTitle' placeholder='Untitled'></div>`;
    const { openModalWithExtractor } = await import('./ui/modals.js');
    const res = await openModalWithExtractor('New note', body, (root)=>({ sid: root.querySelector('#tSpace')?.value||'', title: root.querySelector('#tTitle')?.value||'' }));
    if (!res.ok) return; const sid = res.values?.sid || list?.[0]?.id; if (!sid) return;
    const n = await db_createNote(sid);
    if (res.values?.title) { try{ (await import('./lib/supabase.js')).db_updateNote(n.id, { title: res.values.title }); }catch{} }
    window.hiveFocusNoteId = n.id;
    location.hash = 'space/'+sid;
    if (typeof window.hiveRenderRoute === 'function') window.hiveRenderRoute();
  }catch{}
});

// Mobile: open chat quickly (removed if not used)
document.getElementById('openChatMobile')?.addEventListener('click', ()=>{
  const appRoot = document.getElementById('appRoot'); if (!appRoot) return;
  appRoot.classList.add('chat-open'); appRoot.classList.remove('chat-closed');
});

// Mobile drawer with spaces
const mobileMenuBtn = document.getElementById('mobileMenuBtn');
const mobileDrawer = document.getElementById('mobileDrawer');
const mobileScrim = document.getElementById('mobileScrim');
function closeDrawer(){ mobileDrawer.classList.remove('open'); mobileScrim.classList.remove('show'); mobileDrawer.setAttribute('aria-hidden','true'); mobileScrim.setAttribute('aria-hidden','true'); }
function openDrawer(){ mobileDrawer.classList.add('open'); mobileScrim.classList.add('show'); mobileDrawer.setAttribute('aria-hidden','false'); mobileScrim.setAttribute('aria-hidden','false'); }
async function populateSpacesDrawer(){
  try{
    mobileDrawer.innerHTML = '<div class="muted" style="font-size:12px">Spaces</div><div id="drawerSpaces" style="display:grid; gap:8px"></div>';
    const spaces = await db_listSpaces().catch(()=>[]);
    const container = mobileDrawer.querySelector('#drawerSpaces');
    container.innerHTML = spaces.map(s=>`<button class='button' data-go='${s.id}' style='justify-content:flex-start'>${s.name}</button>`).join('');
    container.querySelectorAll('[data-go]').forEach(btn=>btn.addEventListener('click', ()=>{
      const sid = btn.getAttribute('data-go');
      const chatsId = localStorage.getItem('hive_chats_space_id')||'';
      const appRoot = document.getElementById('appRoot');
      if (appRoot){
        const isChatSpace = sid===chatsId;
        appRoot.classList.toggle('chat-open', isChatSpace);
        appRoot.classList.toggle('chat-closed', !isChatSpace);
      }
      location.hash='space/'+sid; closeDrawer();
    }));
  }catch{}
}
mobileMenuBtn?.addEventListener('click', async()=>{ await populateSpacesDrawer(); openDrawer(); });
mobileScrim?.addEventListener('click', closeDrawer);
document.getElementById('openSettingsMobile')?.addEventListener('click', ()=>{ closeDrawer(); openSettingsModal(); });

// Simplified dock: appears in simplified view as a bottom/upper tab for menu/library/settings
const simplifiedDock = document.getElementById('simplifiedDock');
const dockMenuBtn = document.getElementById('dockMenuBtn');
const dockLibraryBtn = document.getElementById('dockLibraryBtn');
const dockSettingsBtn = document.getElementById('dockSettingsBtn');
dockMenuBtn?.addEventListener('click', async()=>{ 
  // In simplified view, overlay the full sidebar instead of the small drawer
  const isSimplified = document.documentElement.getAttribute('data-simplified')==='1';
  const appRoot = document.getElementById('appRoot');
  if (isSimplified && appRoot){
    appRoot.classList.add('sidebar-overlay-open');
    mobileScrim.classList.add('show');
    mobileScrim.setAttribute('aria-hidden','false');
  } else {
    await populateSpacesDrawer(); openDrawer();
  }
});
// Clicking scrim in overlay mode closes sidebar overlay
mobileScrim?.addEventListener('click', ()=>{
  const appRoot = document.getElementById('appRoot');
  if (appRoot){ appRoot.classList.remove('sidebar-overlay-open'); }
});
dockLibraryBtn?.addEventListener('click', ()=>{ const appRoot=document.getElementById('appRoot'); if(appRoot){ appRoot.classList.add('chat-closed'); appRoot.classList.remove('chat-open'); } location.hash=''; if(typeof window.hiveRenderRoute==='function') window.hiveRenderRoute(); });
dockSettingsBtn?.addEventListener('click', ()=>{ openSettingsModal(); });

// Toggle explicit Mobile/Web view
document.getElementById('toggleMobileView')?.addEventListener('click', ()=>{
  const link = document.getElementById('mobileCss');
  if (!link) return;
  const isForced = link.getAttribute('data-forced')==='1';
  if (isForced){
    // Return to responsive-only
    link.setAttribute('media','(max-width: 780px)');
    link.setAttribute('data-forced','0');
    try{ link.disabled = true; }catch{}
    try{ document.documentElement.removeAttribute('data-mobile-forced'); }catch{}
    try{ removeForceMobileStyles(); }catch{}
    const b = document.getElementById('layoutBadge'); if (b) b.textContent = 'Web';
    window.showToast && window.showToast('Web view');
  } else {
    // Force mobile stylesheet
    link.setAttribute('media','all');
    link.setAttribute('data-forced','1');
    try{ link.disabled = false; }catch{}
    try{ document.documentElement.setAttribute('data-mobile-forced','1'); }catch{}
    try{ applyForceMobileStyles(); }catch{}
    const b = document.getElementById('layoutBadge'); if (b) b.textContent = 'Mobile';
    window.showToast && window.showToast('Mobile view');
  }
});

// Simplified view toggle (also used for mobile). Applies a hard override scoped to [data-simplified="1"]
const simplifiedBtn = document.getElementById('simplifiedViewBtn');
simplifiedBtn?.addEventListener('click', ()=>{
  const isOn = document.documentElement.getAttribute('data-simplified')==='1';
  if (isOn){ removeSimplifiedStyles(); window.showToast && window.showToast('Simplified view off'); }
  else { applySimplifiedStyles(); window.showToast && window.showToast('Simplified view on'); }
});

// Initialize badge based on current state
(function initLayoutBadge(){
  const b = document.getElementById('layoutBadge'); if(!b) return;
  const isSimplified = document.documentElement.getAttribute('data-simplified')==='1';
  if (isSimplified){ b.textContent = 'Simplified'; return; }
  b.textContent = 'Web';
})();

// Auto-enable Simplified on small screens; disable on wide screens
function autoSimplifiedByViewport(){
  const isSmall = window.matchMedia('(max-width: 820px)').matches;
  const enabled = document.documentElement.getAttribute('data-simplified')==='1';
  if (isSmall && !enabled) applySimplifiedStyles();
}
window.addEventListener('resize', ()=>{ try{ autoSimplifiedByViewport(); }catch{} });
try{ autoSimplifiedByViewport(); }catch{}

// HARD OVERRIDE: Inject inline styles with highest precedence when mobile is forced
function applyForceMobileStyles(){
  let el = document.getElementById('forceMobileStyle');
  if (el) return; // already applied
  el = document.createElement('style');
  el.id = 'forceMobileStyle';
  el.textContent = `
    /* Hard mobile overrides */
    .mobile-header{display:flex !important; padding:6px 8px !important}
    .mobile-header .brand{font-size:14px !important}
    .mobile-header .button{padding:6px 8px !important; border-radius:8px !important}
    .mobile-header .icon{width:16px !important; height:16px !important}
    .sidebar{display:none !important}
    .splitter{display:none !important}
    .content-head{display:none !important}
    .mobile-only{display:inline-flex !important}
    .hide-mobile,.mobile-hidden{display:none !important}
    .segmented{display:none !important}
    .card-grid{grid-template-columns:1fr !important}
    /* Chat-first on mobile */
    .main{display:none !important}
    .right{display:grid !important}
    .app.chat-closed .main{display:grid !important}
    .app.chat-closed .right{display:none !important}
    /* Space view panels */
    #spaceTabs{display:flex !important; gap:8px !important; padding:8px 0 !important}
    #spaceTabs .button{flex:1 !important; justify-content:center !important}
    #filesSection{display:none !important}
    #notesSection{display:flex !important}
  `;
  document.head.appendChild(el);
}
function removeForceMobileStyles(){
  const el = document.getElementById('forceMobileStyle');
  if (el && el.parentNode) el.parentNode.removeChild(el);
}

// Applies simplified layout styles using a high-specificity attribute selector and !important rules
function applySimplifiedStyles(){
	let el = document.getElementById('simplifiedStyle');
	if (!el){
		el = document.createElement('style');
		el.id = 'simplifiedStyle';
		document.head.appendChild(el);
	}
	el.textContent = `
		html[data-simplified="1"] .app{ grid-template-columns:1fr !important; padding:6px !important }
		html[data-simplified="1"] .mobile-only{ display:inline-flex !important }
		html[data-simplified="1"] .mobile-header{ display:flex !important; height:44px !important; padding:4px 8px !important; align-items:center !important; justify-content:space-between !important; background: var(--panel) !important; border-bottom:1px solid var(--border) !important }
		html[data-simplified="1"] .mobile-header .brand{ font-size:14px !important }
		html[data-simplified="1"] .mobile-header .button{ padding:6px 8px !important; border-radius:8px !important }
		html[data-simplified="1"] .mobile-header .icon{ width:16px !important; height:16px !important }
		html[data-simplified="1"] .sidebar{ display:none !important }
		html[data-simplified="1"] .splitter{ display:none !important }
		/* Library header visible, space header hidden */
		html[data-simplified="1"] #content[data-view="library"] .content-head{ display:flex !important }
		html[data-simplified="1"] #content[data-view="space"] .content-head{ display:none !important }
		html[data-simplified="1"] .card-grid{ grid-template-columns:1fr !important }
		html[data-simplified="1"] .right{ display:grid !important; position:fixed !important; inset:0 !important; width:100% !important; height:100% !important; padding:0 !important; border-radius:0 !important; z-index:50 !important }
		html[data-simplified="1"] .main{ display:none !important }
		html[data-simplified="1"] .app.chat-closed .main{ display:grid !important }
		html[data-simplified="1"] .app.chat-closed .right{ display:none !important }
		/* Space view panels */
		html[data-simplified="1"] #spaceTabs{ display:flex !important; gap:8px !important; padding:8px 0 !important }
		html[data-simplified="1"] #spaceTabs .button{ flex:1 !important; justify-content:center !important }
		/* Keep library cards visible */
		html[data-simplified="1"] .lib-card.mobile-open{ display:flex !important; max-height:calc(100vh - 140px) !important; overflow:auto !important }
		html[data-simplified="1"] .lib-card.mobile-open .note-editor,
		html[data-simplified="1"] .lib-card.mobile-open .note-rich,
		html[data-simplified="1"] .lib-card.mobile-open #filesList{ min-height:calc(100vh - 200px) !important }
		/* Dock: show persistent access to menu/library/settings */
		html[data-simplified="1"] .simplified-dock{ display:flex !important; position:fixed !important; left:0 !important; right:0 !important; bottom:0 !important; z-index:90 !important; padding:8px !important; gap:8px !important; justify-content:center !important; background:var(--panel) !important; border-top:1px solid var(--border) !important }
		/* Overlay sidebar when requested */
		html[data-simplified="1"] .app.sidebar-overlay-open .sidebar{ display:block !important; position:fixed !important; inset:0 40% 0 0 !important; z-index:95 !important; overflow:auto !important }
		html[data-simplified="1"] .app.sidebar-overlay-open .mobile-scrim{ display:block !important }
	`;
	try{ document.documentElement.setAttribute('data-simplified','1'); }catch{}
	try{ const b=document.getElementById('layoutBadge'); if(b) b.textContent='Simplified'; }catch{}
	try{ window.lucide && window.lucide.createIcons(); }catch{}
	try{ localStorage.setItem('hive_simplified','1'); }catch{}
    try{ const d=document.getElementById('simplifiedDock'); if(d) d.style.display='flex'; }catch{}
}

// Removes simplified layout styles and attribute
function removeSimplifiedStyles(){
	try{ document.documentElement.removeAttribute('data-simplified'); }catch{}
	const el = document.getElementById('simplifiedStyle'); if (el && el.parentNode) el.parentNode.removeChild(el);
	try{ const b=document.getElementById('layoutBadge'); if(b) b.textContent='Web'; }catch{}
	try{ localStorage.removeItem('hive_simplified'); }catch{}
    try{ const d=document.getElementById('simplifiedDock'); if(d) d.style.display='none'; }catch{}
}

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
  content.setAttribute('data-view','library');
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
  // Promote baseline spaces first: Deep Research, Meetings, Chats
  const meetingsId = localStorage.getItem('hive_meetings_space_id')||'';
  const chatsId = localStorage.getItem('hive_chats_space_id')||'';
  const researchId = localStorage.getItem('hive_research_space_id')||'';
  spaces.sort((a,b)=>{
    const score = (s)=>((s.id===researchId)?-3:0) + ((s.id===meetingsId)?-2:0) + ((s.id===chatsId)?-1:0);
    return score(a) - score(b);
  });
  grid.innerHTML = spaces.map(s=>{
    const color = (typeof localStorage!=='undefined') ? (localStorage.getItem('space_color_'+s.id)||'') : '';
    let cover;
    if (s.id===meetingsId){ cover = `<div style=\"display:grid; place-items:center; height:100%\"><svg class=\"icon card-icon\"><use href=\"#video\"></use></svg></div>`; }
    else if (s.id===chatsId){ cover = `<div style=\"display:grid; place-items:center; height:100%\"><svg class=\"icon card-icon\"><use href=\"#chat\"></use></svg></div>`; }
    else { cover = s.cover_url ? `<img src="${s.cover_url}" alt="cover" style="width:100%; height:100%; object-fit:cover; border-radius:12px">` : `<div style=\"display:grid; place-items:center; gap:8px\"><svg class=\"icon\"><use href=\"#box\"></use></svg><span class=\"muted\">Cover</span></div>`; }
    return `<article class="lib-card" data-id="${s.id}">
      <div class="lib-visual" style="${color?`border:2px solid ${color}`:''}">${cover}<div class="card-title-overlay">${s.name}</div></div>
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
  const storedColor = (typeof localStorage!=='undefined') ? (localStorage.getItem('space_color_'+space.id)||'') : '';
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
    </div>`;
  const res = await openModalWithExtractor('Space options', body, (root)=>({ name: root.querySelector('#spName')?.value||'', vis: root.querySelector('#spVis')?.value||space.visibility||'private', color: root.querySelector('#spColors [data-selected="1"]')?.getAttribute('data-color')||'' }));
  const scrim = document.getElementById('modalScrim');
  // Color interactions
  try{
    scrim.querySelectorAll('#spColors [data-color]').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        scrim.querySelectorAll('#spColors [data-color]').forEach(b=>{ b.removeAttribute('data-selected'); b.style.borderColor='var(--border)'; });
        btn.setAttribute('data-selected','1'); btn.style.borderColor = '#fff';
      });
      if (storedColor && btn.getAttribute('data-color')===storedColor){ btn.setAttribute('data-selected','1'); btn.style.borderColor='#fff'; }
    });
  }catch{}
  if (!res.ok) return;
  const { name, vis, color } = res.values || {};
  const sb = await import('./lib/supabase.js');
  // Persist color locally
  try{ if (typeof localStorage!=='undefined'){ if (color){ localStorage.setItem('space_color_'+space.id, color); } else { localStorage.removeItem('space_color_'+space.id); } } }catch{}
  if (name && name!==space.name) await sb.db_updateSpace(space.id, { name });
  if (vis && vis!==space.visibility) await sb.db_updateSpace(space.id, { visibility: vis });
  renderRoute();
}

async function renderRoute(){
  // Do not fetch data until authenticated to avoid 401s
  const me = await auth_getUser().catch(()=>null);
  if (!me){ renderAuth(content); return; }
  const hash = location.hash.replace(/^#/, '');
  if (hash.startsWith('space/')){
    content.setAttribute('data-view','space');
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
  // Restore simplified view if user enabled it previously
  try{ if ((localStorage.getItem('hive_simplified')||'')==='1') applySimplifiedStyles(); }catch{}
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
