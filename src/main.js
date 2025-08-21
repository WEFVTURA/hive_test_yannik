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

// Initialize API keys from environment variables for client-side use
(function initAPIKeys(){
  try {
    // In Vercel, env vars are exposed without VITE_ prefix
    // In local dev with Vite, they need VITE_ prefix
    // Check both to support all environments
    
    // OpenAI - Your Vercel uses OPEN_AI_API
    window.OPENAI_API_KEY = import.meta.env.VITE_OPENAI_API_KEY || 
                            import.meta.env.OPEN_AI_API || 
                            import.meta.env.OPENAI_API_KEY || '';
    
    // Mistral - Your Vercel uses MISTRAL
    window.MISTRAL_API_KEY = import.meta.env.VITE_MISTRAL_API_KEY || 
                             import.meta.env.MISTRAL || 
                             import.meta.env.MISTRAL_AI_API || 
                             import.meta.env.MISTRAL_API_KEY || '';
    
    // Deepgram - Not in your Vercel list! Need to add it
    window.DEEPGRAM_API_KEY = import.meta.env.VITE_DEEPGRAM_API_KEY || 
                              import.meta.env.DEEPGRAM_API_KEY || 
                              import.meta.env.DEEPGRAM || 
                              'd07d3f107acd0c8e6b9faf97ed1ff8295b900119'; // Fallback to default
    
    // Perplexity - Your Vercel uses PERPLEXITY
    window.PERPLEXITY_API_KEY = import.meta.env.VITE_PERPLEXITY || 
                                import.meta.env.PERPLEXITY || 
                                import.meta.env.PERPLEXITY_API_KEY || '';
    
    // Debug log (remove in production)
    console.log('API Keys initialized:', {
      openai: !!window.OPENAI_API_KEY,
      mistral: !!window.MISTRAL_API_KEY,
      deepgram: !!window.DEEPGRAM_API_KEY,
      perplexity: !!window.PERPLEXITY_API_KEY
    });
  } catch(e) {
    console.warn('Failed to initialize API keys:', e);
  }
})();

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
      
      <div class="section">Transcripts</div>
      <button class="button" id="meetingsHubBtn" style="width:100%"><i data-lucide="calendar" class="icon" aria-hidden="true"></i> Meetings Hub</button>

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

// Meetings navigation
const meetingsHubBtn = document.getElementById('meetingsHubBtn');
meetingsHubBtn?.addEventListener('click', ()=>{ location.hash = 'meetings/hub'; });

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

// Render just the spaces list in the sidebar
async function renderSpacesList(){
  try {
    const { db_listSpaces } = await import('./lib/supabase.js');
    let spaces = await db_listSpaces().catch((err) => {
      console.error('Failed to load spaces:', err);
      return [];
    });
    // If for any reason no spaces are returned, ensure baseline spaces and retry once
    if (!Array.isArray(spaces) || spaces.length===0){
      try{ if (typeof ensureBaselineSpaces === 'function') await ensureBaselineSpaces(); }catch{}
      try{ spaces = await db_listSpaces().catch(()=>[]); }catch{}
    }
    if (currentQuery) spaces = spaces.filter(s => (s.name||'').toLowerCase().includes(currentQuery));

    const list = document.getElementById('spacesList');
    if (list) {
      list.innerHTML = `
        <div class="nav-header" style="display:flex; align-items:center; justify-content:space-between; padding:10px 12px; background:var(--panel-2)">
          <div style="display:flex; align-items:center; gap:8px"><svg class="icon"><use href="#folder"></use></svg><span>Library</span></div>
          <div style="display:flex; align-items:center; gap:6px">
            <button class="button ghost sm" id="cardsView" title="Cards"><svg class="icon sm"><use href="#grid"></use></svg></button>
            <button class="button ghost sm" id="listView" title="List"><svg class="icon sm"><use href="#list"></use></svg></button>
          </div>
        </div>
        <div class="nav-items" id="navItems"></div>`;
      
      const navItems = document.getElementById('navItems');
      if (navItems) {
        navItems.innerHTML = spaces.slice(0,4).map(s=>`<div class="nav-item" data-id="${s.id}"><div style="display:flex; align-items:center; gap:8px"><svg class="icon"><use href="#book"></use></svg><span>${s.name}</span></div><button class="button ghost sm" data-space-menu="${s.id}" title="Options">⋯</button></div>`).join('');
        navItems.querySelectorAll('[data-id]').forEach(el=>{ el.addEventListener('click', ()=>{ location.hash = 'space/'+el.getAttribute('data-id'); }); });
        // Add space menu event listeners
        navItems.querySelectorAll('[data-space-menu]').forEach(btn=>{
          btn.addEventListener('click', async (e)=>{
            e.stopPropagation();
            const spaceId = btn.getAttribute('data-space-menu');
            await openSpaceOptions(spaceId);
          });
        });
      }
    }
  } catch (error) {
    console.error('Failed to render spaces list:', error);
  }
}

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

  // Load spaces for both the sidebar and main content
  const { db_listSpaces } = await import('./lib/supabase.js');
  let spaces = await db_listSpaces().catch(()=>[]);
  if (currentQuery) spaces = spaces.filter(s => (s.name||'').toLowerCase().includes(currentQuery));

  // Render sidebar spaces
  const list = document.getElementById('spacesList');
  if (list) {
    list.innerHTML = `
      <div class="nav-header" style="display:flex; align-items:center; justify-content:space-between; padding:10px 12px; background:var(--panel-2)">
        <div style="display:flex; align-items:center; gap:8px"><svg class="icon"><use href="#folder"></use></svg><span>Library</span></div>
        <div class="badge">${spaces.length}</div>
      </div>
      <div class="nav-items" id="navItems"></div>`;
    
    const navItems = document.getElementById('navItems');
    if (navItems) {
      const topSpaces = spaces.slice(0, Math.max(4, spaces.length));
      navItems.innerHTML = topSpaces.map(s=>`<div class="nav-item" data-id="${s.id}"><div style="display:flex; align-items:center; gap:8px"><svg class="icon"><use href="#book"></use></svg><span>${s.name}</span></div><button class="button ghost sm" data-space-menu="${s.id}" title="Options">⋯</button></div>`).join('');
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
    }
  }

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

// Comprehensive Meetings Hub (combines dashboard, list, and search)
async function renderMeetingsHub(root){
  // Clear notes cache
  window.notesCache = [];
  
  root.innerHTML = `
    <div class="content-head">
      <div class="title">
        <i data-lucide="calendar" class="icon"></i>
        Meetings Hub
      </div>
      <button class="button ghost" id="backToLibrary" style="margin-left:12px"><i data-lucide="arrow-left" class="icon"></i> Back to Library</button>
      <button class="button primary" id="transcriptListBtn" style="margin-left:8px" title="Browse and Import Transcripts">
        <i data-lucide="list" class="icon"></i> Transcript List
      </button>
      <button class="button" id="directImportBtn" style="margin-left:8px" title="Manual Import">
        <i data-lucide="file-plus" class="icon"></i> Import Transcript
      </button>
      <div class="search-bar" style="flex: 1; max-width: 400px; margin-left: 16px;">
        <input type="text" id="meetingsSearch" placeholder="Search meetings..." 
               style="width: 100%; padding: 8px 12px; border: 1px solid var(--border); border-radius: 6px; font-size: 14px;">
      </div>
    </div>
    <div class="content-body">
      <div id="meetingsHubContent">
        <div class="loading">Loading meetings...</div>
      </div>
    </div>
  `;
  
  lucide.createIcons();
  
  try {
    // Fetch meeting data from backend API
    const response = await fetch('/api/meetings-data');
    const data = await response.json();
    
    // Log debug info to console
    console.log('Meetings data response:', {
      success: data.success,
      total: data.total,
      space_id: data.space_id,
      debug: data.debug,
      notes_count: data.notes?.length || 0
    });
    
    if (!data.success) {
      throw new Error(data.error || data.message || 'Failed to load meetings');
    }
    
    const notes = data.notes || [];
    
    const hubContent = document.getElementById('meetingsHubContent');
    if (notes && notes.length > 0) {
      // Store notes in cache for summary generation
      window.notesCache = notes;
      
      // Render comprehensive view
      hubContent.innerHTML = `
        <!-- Stats Dashboard -->
        <div class="stats-section" style="margin-bottom: 32px;">
          <h3 style="margin-bottom: 16px; color: var(--primary);">📊 Overview</h3>
          <div class="stats-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px;">
            <div class="stat-card" style="padding: 16px; border: 1px solid var(--border); border-radius: 8px; text-align: center;">
              <div style="font-size: 28px; font-weight: 700; color: var(--primary);">${notes.length}</div>
              <div style="color: var(--muted); font-size: 14px;">Total Meetings</div>
            </div>
            <div class="stat-card" style="padding: 16px; border: 1px solid var(--border); border-radius: 8px; text-align: center;">
              <div style="font-size: 28px; font-weight: 700; color: var(--success);">${notes.filter(n => n.created_at > new Date(Date.now() - 7*24*60*60*1000).toISOString()).length}</div>
              <div style="color: var(--muted); font-size: 14px;">This Week</div>
            </div>
            <div class="stat-card" style="padding: 16px; border: 1px solid var(--border); border-radius: 8px; text-align: center;">
              <div style="font-size: 28px; font-weight: 700; color: var(--warning);">${Math.round(notes.reduce((acc, n) => acc + (n.content?.length || 0), 0) / 1000)}K</div>
              <div style="color: var(--muted); font-size: 14px;">Total Characters</div>
            </div>
          </div>
        </div>

        <!-- Filter Controls -->
        <div class="filter-section" style="margin-bottom: 24px; padding: 16px; background: var(--panel-2); border-radius: 8px;">
          <div style="display: flex; gap: 12px; align-items: center; flex-wrap: wrap; margin-bottom: 12px;">
            <span style="font-weight: 600;">Filter:</span>
            <button class="button sm filter-btn active" data-filter="all">All (${notes.length})</button>
            <button class="button sm filter-btn" data-filter="recall">Recall (${notes.filter(n => n.title?.includes('Recall')).length})</button>
            <button class="button sm filter-btn" data-filter="today">Today (${notes.filter(n => new Date(n.created_at).toDateString() === new Date().toDateString()).length})</button>
            <button class="button sm filter-btn" data-filter="week">This Week (${notes.filter(n => n.created_at > new Date(Date.now() - 7*24*60*60*1000).toISOString()).length})</button>
            <div style="margin-left: auto; display: flex; gap: 8px;">
              <select id="sortMeetings" style="padding: 6px 8px; border: 1px solid var(--border); border-radius: 4px; font-size: 12px;">
                <option value="date-desc">📅 Newest First</option>
                <option value="date-asc">📅 Oldest First</option>
                <option value="title">📝 Title A-Z</option>
                <option value="size">📊 By Size</option>
              </select>
            </div>
          </div>
          <!-- Transcript View Selector (now single robust view, keep button to refresh) -->
          <div style="border-top: 1px solid var(--border); padding-top: 12px; display:flex; gap:8px; align-items:center;">
            <span style="font-weight: 600; margin-right: 12px;">Transcript View:</span>
            <span class="muted" style="font-size:12px">Auto (Names from participants)</span>
            <button class="button sm" id="refreshMeetingsView">Refresh formatting</button>
          </div>
        </div>

        <!-- Meetings List -->
        <div class="meetings-section">
          <h3 style="margin-bottom: 16px; color: var(--primary);">💬 Meeting Transcripts</h3>
          <div id="meetingsList">
            ${notes.map(note => `
              <div class="meeting-card" data-id="${note.id}" data-title="${(cleanMeetingTitle(note.title) || '').toLowerCase()}" data-date="${note.created_at}" 
                   style="max-width:1100px; margin:0 auto 16px auto; border: 1px solid var(--border); border-radius: 12px; overflow: hidden; transition: all 0.2s;">
                <div class="meeting-header" style="padding: 16px; background: var(--panel-1);">
                  <div style="display: grid; grid-template-columns: 2fr 1fr; gap: 16px; align-items: start;">
                    <div>
                      <h4 style="margin: 0 0 6px 0; font-size: 16px; font-weight: 700; color: var(--primary);">
                        ${note.title?.includes('Recall') ? '🎙️' : '📝'} ${cleanMeetingTitle(note.title)}
                      </h4>
                      <div style="font-size: 12px; color: var(--muted); margin-bottom: 10px;">
                        📅 ${new Date(note.created_at).toLocaleDateString()}
                      </div>
                      <!-- Preview -->
                      <div class="meeting-preview" style="background: var(--panel-2); padding: 10px; border-radius: 6px; border-left: 3px solid var(--accent); max-height: 150px; overflow:auto;">
                        ${formatTranscriptContent(note.content, true)}
                      </div>
                      <div style="margin-top:8px; display:flex; gap:8px;">
                        <button class="button sm" onclick="toggleMeetingExpand('${note.id}')"><i data-lucide="chevron-down" id="chevron-${note.id}"></i> Expand</button>
                        <button class="button sm ghost" onclick="copyMeetingText('${note.id}')"><i data-lucide="copy"></i> Copy</button>
                        <button class="button sm ghost" onclick="downloadMeeting('${note.id}', '${cleanMeetingTitle(note.title)}')"><i data-lucide="download"></i> Download</button>
                        <button class="button sm danger" onclick="deleteMeeting('${note.id}')"><i data-lucide="trash-2"></i> Delete</button>
                      </div>
                    </div>
                  </div>
                </div>
                <div id="meeting-full-${note.id}" class="meeting-full" style="display: none; padding: 16px; background: var(--background); border-top: 1px solid var(--border);">
                  <!-- Editable Title and Speaker Tags -->
                  <div style="margin-bottom: 16px; padding: 16px; background: var(--panel-1); border-radius: 8px;">
                    <div style="margin-bottom: 12px;">
                      <label style="display: block; font-size: 12px; color: var(--muted); margin-bottom: 4px;">Meeting Title</label>
                      <input type="text" id="title-${note.id}" value="${note.metadata?.edited_title || cleanMeetingTitle(note.title)}" 
                        style="width: 100%; padding: 8px; border: 1px solid var(--border); border-radius: 4px; 
                        font-size: 16px; font-weight: 600; background: var(--background); color: var(--text);"
                        onchange="updateMeetingTitle('${note.id}', this.value)">
                    </div>
                    
                    <div>
                      <label style="display: block; font-size: 12px; color: var(--muted); margin-bottom: 4px;">
                        Participants (click to add)
                      </label>
                      <div id="speakers-${note.id}" style="display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 8px;">
                        <!-- Speaker tags will be populated after render -->
                      </div>
                      <button class="button sm ghost" onclick="addSpeakerTag('${note.id}')">
                        <i data-lucide="user-plus"></i> Add Participant
                      </button>
                    </div>
                  </div>
                  
                  <!-- Formatted Transcript -->
                  <div style="max-height: 650px; overflow-y: auto; padding-right: 8px;">
                    <div id="transcript-content-${note.id}">
                      ${formatEnhancedTranscript(note.content, note.id)}
                    </div>
                  </div>
                  
                  <!-- Summary section under transcript -->
                  <div style="margin-top: 16px; border-top: 1px solid var(--border); padding-top: 16px;">
                    <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;">
                      <h4 style="margin: 0; font-size: 16px; font-weight: 600; color: var(--primary);">
                        <i data-lucide="sparkles" style="width: 16px; height: 16px; display: inline-block; vertical-align: text-bottom;"></i>
                        AI Summary
                      </h4>
                      <div style="display: flex; gap: 8px;">
                        <button id="generateSummaryBtn-${note.id}" class="button sm primary" onclick="generateSummaryForNote('${note.id}')">
                          <i data-lucide="wand-2"></i> Generate Summary
                        </button>
                        <button id="toggleSummaryBtn-${note.id}" class="button sm ghost" style="display: none;" onclick="toggleSummary('${note.id}')">
                          <i data-lucide="chevron-down" id="summaryChevron-${note.id}"></i> Hide
                        </button>
                      </div>
                    </div>
                    <div id="summary-container-${note.id}" style="display: none;">
                      <div id="summary-${note.id}" style="
                        background: linear-gradient(135deg, var(--panel-2), var(--panel-1));
                        padding: 16px;
                        border-radius: 8px;
                        border-left: 3px solid var(--accent);
                        font-size: 14px;
                        line-height: 1.6;
                        color: var(--text);
                      ">
                        <!-- Summary content will be inserted here -->
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      `;
      
      // Add functionality
      setupMeetingsHubInteractions();
      
    } else {
      hubContent.innerHTML = `
        <div class="empty-state" style="text-align: center; padding: 60px; color: var(--muted);">
          <i data-lucide="calendar-x" style="width: 64px; height: 64px; margin-bottom: 24px;"></i>
          <h3>No meetings found</h3>
          <p style="margin-top: 8px;">Your meeting transcripts will appear here once imported</p>
          <div style="margin-top: 24px;">
            <button class="button" onclick="location.hash = 'space/' + localStorage.getItem('hive_meetings_space_id')">
              Go to Meetings Space
            </button>
          </div>
        </div>
      `;
    }
    
    lucide.createIcons();
  } catch (error) {
    document.getElementById('meetingsHubContent').innerHTML = `
      <div class="error" style="color: var(--danger); padding: 24px; text-align: center;">
        <i data-lucide="alert-circle" style="width: 48px; height: 48px; margin-bottom: 16px;"></i>
        <h3>Error loading meetings</h3>
        <p style="margin-top: 8px;">${error.message}</p>
      </div>
    `;
    lucide.createIcons();
  }
}

// Old dashboard function - now integrated into hub
async function renderMeetingsDashboard(root){
  root.innerHTML = `
    <div class="content-head">
      <div class="title">
        <i data-lucide="calendar" class="icon"></i>
        Meetings Dashboard
      </div>
    </div>
    <div class="content-body">
      <div id="meetingsDashContent">
        <div class="loading">Loading meetings...</div>
      </div>
    </div>
  `;
  
  lucide.createIcons();
  
  try {
    // Fetch meeting data from backend API
    const response = await fetch('/api/meetings-data');
    const data = await response.json();
    
    if (!data.success) {
      throw new Error(data.message || 'Failed to load meetings');
    }
    
    const notes = data.notes || [];
    
    const dashContent = document.getElementById('meetingsDashContent');
    if (notes && notes.length > 0) {
      dashContent.innerHTML = `
        <div class="stats-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 16px; margin-bottom: 24px;">
          <div class="stat-card" style="padding: 16px; border: 1px solid var(--border); border-radius: 8px;">
            <div style="font-size: 24px; font-weight: 700; color: var(--primary);">${notes.length}</div>
            <div style="color: var(--muted);">Total Meetings</div>
          </div>
          <div class="stat-card" style="padding: 16px; border: 1px solid var(--border); border-radius: 8px;">
            <div style="font-size: 24px; font-weight: 700; color: var(--primary);">${notes.filter(n => n.title?.includes('Recall')).length}</div>
            <div style="color: var(--muted);">Recall Transcripts</div>
          </div>
          <div class="stat-card" style="padding: 16px; border: 1px solid var(--border); border-radius: 8px;">
            <div style="font-size: 24px; font-weight: 700; color: var(--primary);">${notes.filter(n => n.created_at > new Date(Date.now() - 7*24*60*60*1000).toISOString()).length}</div>
            <div style="color: var(--muted);">This Week</div>
          </div>
        </div>
        <div class="recent-meetings">
          <h3>Recent Meetings</h3>
          <div class="notes-list">
            ${notes.slice(0, 10).map(note => `
              <div class="note-card" style="padding: 12px; border: 1px solid var(--border); border-radius: 6px; margin-bottom: 8px; cursor: pointer;" onclick="expandNote('${note.id}', this)">
                <div class="note-title" style="font-weight: 600;">${note.title || 'Untitled'}</div>
                <div class="note-meta" style="font-size: 12px; color: var(--muted); margin-top: 4px;">
                  ${new Date(note.created_at).toLocaleDateString()} • ${Math.round((note.content?.length || 0) / 100)} min read
                </div>
                <div class="note-preview" style="display: none; margin-top: 8px; padding-top: 8px; border-top: 1px solid var(--border);">
                  <div style="max-height: 200px; overflow-y: auto; font-size: 14px; line-height: 1.4;">
                    ${formatTranscriptContent(note.content || '', true)}
                  </div>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    } else {
      dashContent.innerHTML = `
        <div class="empty-state" style="text-align: center; padding: 40px; color: var(--muted);">
          <i data-lucide="calendar-x" style="width: 48px; height: 48px; margin-bottom: 16px;"></i>
          <div>No meetings found</div>
          <div style="font-size: 14px; margin-top: 8px;">Your meeting transcripts will appear here</div>
        </div>
      `;
      lucide.createIcons();
    }
  } catch (error) {
    document.getElementById('meetingsDashContent').innerHTML = `
      <div class="error" style="color: var(--danger); padding: 16px;">
        Error loading meetings: ${error.message}
      </div>
    `;
  }
}

async function renderMeetingsList(root){
  root.innerHTML = `
    <div class="content-head">
      <div class="title">
        <i data-lucide="list" class="icon"></i>
        Meeting Notes
      </div>
    </div>
    <div class="content-body">
      <div id="meetingsListContent">
        <div class="loading">Loading meeting notes...</div>
      </div>
    </div>
  `;
  
  lucide.createIcons();
  
  try {
    // Fetch meeting data from backend API
    const response = await fetch('/api/meetings-data');
    const data = await response.json();
    
    if (!data.success) {
      throw new Error(data.message || 'Failed to load meetings');
    }
    
    const notes = data.notes || [];
    
    const listContent = document.getElementById('meetingsListContent');
    if (notes && notes.length > 0) {
      listContent.innerHTML = `
        <div class="filter-bar" style="margin-bottom: 16px; display: flex; gap: 8px; align-items: center;">
          <input type="text" id="meetingFilter" placeholder="Filter meetings..." style="flex: 1; padding: 8px; border: 1px solid var(--border); border-radius: 4px;">
          <select id="sortBy" style="padding: 8px; border: 1px solid var(--border); border-radius: 4px;">
            <option value="date-desc">Newest First</option>
            <option value="date-asc">Oldest First</option>
            <option value="title">Title A-Z</option>
            <option value="size">By Size</option>
          </select>
        </div>
        <div id="filteredNotes">
          ${notes.map(note => `
            <div class="meeting-item" data-title="${(note.title || '').toLowerCase()}" style="padding: 16px; border: 1px solid var(--border); border-radius: 8px; margin-bottom: 12px;">
              <div class="meeting-header" style="display: flex; justify-content: between; align-items: start; margin-bottom: 8px;">
                <div>
                  <h4 style="margin: 0; font-weight: 600;">${note.title || 'Untitled Meeting'}</h4>
                  <div style="font-size: 12px; color: var(--muted); margin-top: 4px;">
                    ${new Date(note.created_at).toLocaleString()} • ${(note.content?.length || 0).toLocaleString()} characters
                  </div>
                </div>
                <button class="button ghost sm" onclick="toggleMeetingContent('${note.id}')">
                  <i data-lucide="chevron-down"></i>
                </button>
              </div>
              <div id="content-${note.id}" class="meeting-content" style="display: none; padding-top: 12px; border-top: 1px solid var(--border);">
                <div style="max-height: 300px; overflow-y: auto; font-size: 14px; line-height: 1.5; white-space: pre-wrap;">
                  ${formatTranscriptContent(note.content || '')}
                </div>
                <div style="margin-top: 12px; display: flex; gap: 8px;">
                  <button class="button sm" onclick="copyToClipboard('${note.id}')">Copy</button>
                  <button class="button sm ghost" onclick="downloadNote('${note.id}', '${note.title}')">Download</button>
                </div>
              </div>
            </div>
          `).join('')}
        </div>
      `;
      
      // Add filter functionality
      document.getElementById('meetingFilter').addEventListener('input', filterMeetings);
      document.getElementById('sortBy').addEventListener('change', sortMeetings);
      
    } else {
      listContent.innerHTML = `
        <div class="empty-state" style="text-align: center; padding: 40px; color: var(--muted);">
          <i data-lucide="file-text" style="width: 48px; height: 48px; margin-bottom: 16px;"></i>
          <div>No meeting notes found</div>
        </div>
      `;
    }
    
    lucide.createIcons();
  } catch (error) {
    document.getElementById('meetingsListContent').innerHTML = `
      <div class="error" style="color: var(--danger); padding: 16px;">
        Error loading meetings: ${error.message}
      </div>
    `;
  }
}

async function renderMeetingsSearch(root){
  root.innerHTML = `
    <div class="content-head">
      <div class="title">
        <i data-lucide="search" class="icon"></i>
        Meeting Search
      </div>
    </div>
    <div class="content-body">
      <div class="search-interface">
        <div style="margin-bottom: 24px;">
          <input type="text" id="meetingSearchInput" placeholder="Search through all your meeting transcripts..." 
                 style="width: 100%; padding: 12px; border: 1px solid var(--border); border-radius: 8px; font-size: 16px;">
          <div style="margin-top: 8px; display: flex; gap: 8px; flex-wrap: wrap;">
            <button class="button sm" onclick="searchMeetings('Recall')">Recall Transcripts</button>
            <button class="button sm" onclick="searchMeetings('today')">Today</button>
            <button class="button sm" onclick="searchMeetings('this week')">This Week</button>
            <button class="button sm" onclick="searchMeetings('')">All</button>
          </div>
        </div>
        <div id="searchResults">
          <div style="text-align: center; color: var(--muted); padding: 40px;">
            <i data-lucide="search" style="width: 48px; height: 48px; margin-bottom: 16px;"></i>
            <div>Enter a search term to find specific meetings</div>
            <div style="font-size: 14px; margin-top: 8px;">Search through titles, content, and dates</div>
          </div>
        </div>
      </div>
    </div>
  `;
  
  lucide.createIcons();
  
  // Add search functionality
  document.getElementById('meetingSearchInput').addEventListener('input', debounce(performMeetingSearch, 300));
  document.getElementById('meetingSearchInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') performMeetingSearch();
  });
}

// Helper: single, robust transcript formatter with real speaker names
function formatTranscriptContent(content, isPreview = false) {
  if (!content) return 'No content available';
  
  // Check if content is plain text or JSON
  const contentStr = typeof content === 'string' ? content : JSON.stringify(content);
  const isLikelyJSON = contentStr.trim().startsWith('[') || contentStr.trim().startsWith('{');
  
  if (!isLikelyJSON) {
    // Plain text transcript - just format it nicely
    return formatPlainText(contentStr, isPreview);
  }
  
  try {
    const data = tryParseTranscriptJson(contentStr);
    
    // Case A: top-level array of blocks with participant + words
    if (Array.isArray(data) && data.length > 0 && data[0] && typeof data[0] === 'object' && 'participant' in data[0] && 'words' in data[0]){
      return formatRecallTranscriptFromBlocks(data, isPreview);
    }
    
    // Handle direct array of word objects
    if (Array.isArray(data) && data.length > 0 && data[0].text) {
      return formatRecallTranscriptAdvanced(data, isPreview);
    }
    
    // Handle nested words array
    if (data.words && Array.isArray(data.words)) {
      return formatRecallTranscriptAdvanced(data.words, isPreview);
    }
    
    // Fallback: extract all text fields
    const extractedText = extractAllTextFromJSON(data);
    if (extractedText.length > 10) {
      return formatPlainTextWithSpeakers(extractedText, isPreview);
    }
    
    return `<div style="background: var(--panel-2); padding: 12px; border-radius: 6px; font-family: monospace; font-size: 12px; max-height: 300px; overflow-y: auto;">${JSON.stringify(data, null, 2)}</div>`;
    
  } catch (e) {
    return formatPlainTextWithSpeakers(content, isPreview);
  }
}

// Try to parse first valid JSON structure from an arbitrary string
function tryParseTranscriptJson(raw){
  // Fast path
  try{ return JSON.parse(raw); }catch{}
  // Extract the first top-level JSON array or object using a simple bracket counter
  const startIdx = raw.search(/[\[{]/);
  if (startIdx === -1) throw new Error('no_json');
  let depth = 0; let endIdx = -1;
  const open = raw[startIdx]; const close = open === '[' ? ']' : '}';
  for (let i=startIdx;i<raw.length;i++){
    const ch = raw[i];
    if (ch === open) depth++;
    else if (ch === close){ depth--; if (depth===0){ endIdx = i; break; } }
  }
  if (endIdx !== -1){
    const slice = raw.slice(startIdx, endIdx+1);
    return JSON.parse(slice);
  }
  // As last resort, try to find an array of word objects
  const match = raw.match(/\[(.|\n|\r)*?\]/);
  if (match){ return JSON.parse(match[0]); }
  throw new Error('parse_failed');
}

// Enhanced text extraction function
function extractAllTextFromJSON(data) {
  let allText = [];
  
  function extractRecursive(obj) {
    if (typeof obj === 'string' && obj.trim().length > 0) {
      allText.push(obj.trim());
    } else if (Array.isArray(obj)) {
      obj.forEach(extractRecursive);
    } else if (obj && typeof obj === 'object') {
      // Prioritize text fields
      if (obj.text) allText.push(obj.text);
      else if (obj.word) allText.push(obj.word);
      else {
        Object.values(obj).forEach(extractRecursive);
      }
    }
  }
  
  extractRecursive(data);
  return allText.join(' ').replace(/\s+/g, ' ').trim();
}

// Enhanced formatting functions
function formatRecallTranscriptFromBlocks(blocks, isPreview = false){
  // blocks: [{ participant: { id, name, ... }, words: [{ text, ... }, ...] }, ...]
  const paragraphs = [];
  for (const blk of blocks){
    const name = (blk?.participant?.name || 'Speaker').toString();
    const words = Array.isArray(blk?.words) ? blk.words : [];
    const text = words.map(w => w?.text || w?.word || '').filter(Boolean).join(' ').trim();
    if (text){
      paragraphs.push({ speaker: name, text });
      if (isPreview && paragraphs.length >= 3) break;
    }
  }
  if (!paragraphs.length) return '';
  return paragraphs.map(p => `
    <div style="margin-bottom: 16px; padding: 12px; background: var(--panel-2); border-radius: 6px; border-left: 3px solid var(--primary);">
      <div style="font-weight: 600; color: var(--primary); margin-bottom: 8px;">${p.speaker}</div>
      <div style="line-height: 1.6; white-space: pre-wrap;">${p.text}</div>
    </div>
  `).join('');
}
function formatRecallTranscriptAdvanced(words, isPreview = false) {
  if (!words || !Array.isArray(words)) return 'No transcript data available';
  
  const text = words.map(w => w.text || w.word || '').filter(Boolean).join(' ');
  return formatPlainTextWithSpeakers(text, isPreview);
}

function formatPlainTextWithSpeakers(text, isPreview = false) {
  if (!text) return 'No content available';
  
  // Split into sentences and add speaker labels
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 5);
  let result = '';
  let speakerIndex = 1;
  
  for (let i = 0; i < sentences.length; i += 2) {
    const group = sentences.slice(i, i + 2).join('. ').trim() + '.';
    result += `
      <div style="margin-bottom: 16px; padding: 12px; background: var(--panel-2); border-radius: 6px; border-left: 3px solid var(--primary);">
        <div style="font-weight: 600; color: var(--primary); margin-bottom: 8px;">Speaker ${speakerIndex}</div>
        <div style="line-height: 1.6;">${group}</div>
      </div>
    `;
    speakerIndex = speakerIndex === 1 ? 2 : 1;
    if (isPreview && i >= 4) break; // Limit preview
  }
  
  return result;
}

// Format Recall transcript with speaker detection and timestamps
function formatRecallTranscript(words, isPreview = false) {
  if (!words || !Array.isArray(words)) return 'No transcript available';
  
  let currentSpeaker = null;
  let currentParagraph = [];
  let paragraphs = [];
  let lastTimestamp = 0;
  
  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const text = word.text || word.word || '';
    const speaker = word.speaker || word.participant_id || `Speaker ${i % 2 + 1}`;
    const timestamp = word.start_timestamp?.absolute || word.start_timestamp?.relative || word.start || 0;
    
    // Detect speaker changes or significant time gaps (5+ seconds)
    const timeDiff = timestamp - lastTimestamp;
    const speakerChanged = speaker !== currentSpeaker;
    const significantPause = timeDiff > 5000; // 5 seconds
    
    if ((speakerChanged || significantPause) && currentParagraph.length > 0) {
      // End current paragraph
      const paragraphText = currentParagraph.join(' ').trim();
      if (paragraphText) {
        const timeStr = formatTimestamp(lastTimestamp);
        paragraphs.push({
          speaker: currentSpeaker || 'Speaker',
          text: paragraphText,
          timestamp: timeStr
        });
      }
      currentParagraph = [];
    }
    
    currentSpeaker = speaker;
    lastTimestamp = timestamp;
    
    if (text.trim()) {
      currentParagraph.push(text);
    }
    
    // For preview, limit to first few paragraphs
    if (isPreview && paragraphs.length >= 3) break;
  }
  
  // Add final paragraph
  if (currentParagraph.length > 0) {
    const paragraphText = currentParagraph.join(' ').trim();
    if (paragraphText) {
      const timeStr = formatTimestamp(lastTimestamp);
      paragraphs.push({
        speaker: currentSpeaker || 'Speaker',
        text: paragraphText,
        timestamp: timeStr
      });
    }
  }
  
  // Format as rich HTML
  return paragraphs.map(p => `
    <div class="transcript-paragraph" style="margin-bottom: 16px; padding: 12px; background: var(--panel-2); border-radius: 6px; border-left: 3px solid var(--primary);">
      <div class="transcript-header" style="display: flex; justify-content: between; align-items: center; margin-bottom: 8px;">
        <strong style="color: var(--primary);">${p.speaker}</strong>
        <span style="font-size: 12px; color: var(--muted);">${p.timestamp}</span>
      </div>
      <div class="transcript-text" style="line-height: 1.6; white-space: pre-wrap;">${p.text}</div>
    </div>
  `).join('');
}

// Format plain text into readable paragraphs
function formatPlainText(text, isPreview = false) {
  if (!text) return 'No content available';
  
  // Split into sentences and group into paragraphs
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 10);
  const paragraphs = [];
  
  // Group sentences into paragraphs of 3-4 sentences each
  for (let i = 0; i < sentences.length; i += 3) {
    const paragraphSentences = sentences.slice(i, i + 3);
    const paragraph = paragraphSentences.join('. ').trim() + '.';
    paragraphs.push(paragraph);
    
    if (isPreview && paragraphs.length >= 2) break;
  }
  
  return paragraphs.map(p => `<p style="margin-bottom: 12px; line-height: 1.6;">${p}</p>`).join('');
}

// Format timestamp (milliseconds) to readable time
function formatTimestamp(ms) {
  if (!ms) return '0:00';
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
}

// Setup interactions for the Meetings Hub
function setupMeetingsHubInteractions() {
  // Search functionality
  const searchInput = document.getElementById('meetingsSearch');
  if (searchInput) {
    searchInput.addEventListener('input', debounce(filterMeetingsHub, 300));
  }
  
  // Filter buttons
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      filterMeetingsHub();
    });
  });
  
  // Sort dropdown
  const sortSelect = document.getElementById('sortMeetings');
  if (sortSelect) {
    sortSelect.addEventListener('change', sortMeetingsHub);
  }
  
  // Refresh button
  document.getElementById('refreshMeetingsView')?.addEventListener('click', ()=>{
    renderMeetingsHub(document.getElementById('content'));
  });
  // Back to library
  document.getElementById('backToLibrary')?.addEventListener('click', ()=>{ location.hash=''; });
  
  // Direct Import button
  document.getElementById('directImportBtn')?.addEventListener('click', () => {
    location.hash = 'meetings/import';
  });
  
  // Batch Import button
  document.getElementById('batchImportBtn')?.addEventListener('click', () => {
    location.hash = 'meetings/batch';
  });
  
  // Recall Browser button
  document.getElementById('recallBrowserBtn')?.addEventListener('click', () => {
    location.hash = 'meetings/recall';
  });
  
  // Transcript List button
  document.getElementById('transcriptListBtn')?.addEventListener('click', () => {
    location.hash = 'transcripts';
  });
  
  // Bot List button
  document.getElementById('botListBtn')?.addEventListener('click', () => {
    location.hash = 'bots';
  });
  
  // Test Auth button
  document.getElementById('testAuthBtn')?.addEventListener('click', async () => {
    const btn = document.getElementById('testAuthBtn');
    if (!btn) return;
    
    btn.disabled = true;
    btn.innerHTML = '⏳ Testing...';
    
    try {
      const resp = await fetch('/api/test-recall-auth');
      const data = await resp.json();
      
      const modal = document.createElement('div');
      modal.className = 'modal-overlay';
      modal.innerHTML = `
        <div class="modal-content" style="max-width: 900px; max-height: 80vh; overflow-y: auto;">
          <div class="modal-header">
            <h2>Recall API Authentication Test</h2>
            <button class="button ghost" onclick="this.closest('.modal-overlay').remove()">✕</button>
          </div>
          <div class="modal-body">
            <pre style="background: var(--bg-secondary); padding: 16px; border-radius: 8px; overflow-x: auto; font-size: 12px; line-height: 1.5;">${JSON.stringify(data, null, 2)}</pre>
          </div>
        </div>
      `;
      document.body.appendChild(modal);
    } catch(e) {
      alert('Test failed: ' + e.message);
    } finally {
      btn.disabled = false;
      btn.innerHTML = '🔑 Test Auth';
    }
  });
  
  // Debug button
  document.getElementById('debugBtn')?.addEventListener('click', async () => {
    const btn = document.getElementById('debugBtn');
    if (!btn) return;
    
    btn.textContent = '🔄 Running tests...';
    btn.disabled = true;
    
    const results = {
      env: null,
      mistral: null,
      recall: null,
      summary: null
    };
    
    try {
      // Test environment variables
      const envResp = await fetch('/api/env-test');
      results.env = await envResp.json();
      
      // Test Mistral
      const mistralResp = await fetch('/api/mistral-test-simple');
      results.mistral = await mistralResp.json();
      
      // Test Recall
      const recallResp = await fetch('/api/recall-test-simple');
      results.recall = await recallResp.json();
      
      // Test summary
      const summaryResp = await fetch('/api/summarize-mistral', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'Test',
          content: 'Test content for summary'
        })
      });
      results.summary = await summaryResp.json();
      
      // Show results
      console.log('🐛 DEBUG RESULTS:', results);
      alert(`Debug Results (check console for details):
      
Environment Variables:
- Mistral: ${results.env?.VITE_MISTRAL ? '✅' : '❌'}
- Recall: ${results.env?.RECALL_API_KEY ? '✅' : '❌'}
- Deepgram: ${results.env?.VITE_DEEPGRAM_API_KEY ? '✅' : '❌'}

API Tests:
- Mistral API: ${results.mistral?.key_found ? '✅' : '❌'} ${results.mistral?.test_result?.ok ? '(working)' : '(not working)'}
- Recall API: ${results.recall?.has_key ? '✅' : '❌'} ${results.recall?.attempts?.some(a => a.ok) ? '(working)' : '(not working)'}
- Summary Generation: ${results.summary?.summary ? '✅' : '❌'}

Check browser console for full details.`);
      
    } catch (error) {
      console.error('Debug error:', error);
      alert('Debug failed - check console');
    } finally {
      btn.textContent = '🐛 Debug';
      btn.disabled = false;
    }
  });
  
  // Sync Recall button
  document.getElementById('syncRecallBtn')?.addEventListener('click', async () => {
    const btn = document.getElementById('syncRecallBtn');
    if (!btn) return;
    
    // Show loading state
    const originalContent = btn.innerHTML;
    btn.innerHTML = '<i data-lucide="loader" class="icon spinning"></i> Syncing...';
    btn.disabled = true;
    
    try {
      // Call the new v2 sync endpoint that properly lists bots first
      const response = await fetch('/api/recall-sync-v2', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      
      const result = await response.json();
      
      if (result.success) {
        // Show success message
        const message = `Sync complete: ${result.summary.imported} new, ${result.summary.skipped} skipped, ${result.summary.failed} failed`;
        window.showToast && window.showToast(message, 'success');
        
        // Log details for debugging
        console.log('Recall sync result:', result);
        
        // Refresh the meetings view to show new transcripts
        await renderMeetingsHub(document.getElementById('content'));
      } else {
        throw new Error(result.error || 'Sync failed');
      }
    } catch (error) {
      console.error('Recall sync error:', error);
      window.showToast && window.showToast(`Sync failed: ${error.message}`, 'error');
    } finally {
      // Restore button state
      btn.innerHTML = originalContent;
      btn.disabled = false;
      lucide.createIcons();
    }
  });
}

// Filter meetings in the hub
function filterMeetingsHub() {
  const searchTerm = document.getElementById('meetingsSearch')?.value.toLowerCase() || '';
  const activeFilter = document.querySelector('.filter-btn.active')?.getAttribute('data-filter') || 'all';
  const meetings = document.querySelectorAll('.meeting-card');
  
  meetings.forEach(meeting => {
    const title = meeting.getAttribute('data-title') || '';
    const date = meeting.getAttribute('data-date') || '';
    const isRecall = title.includes('recall');
    const meetingDate = new Date(date);
    const today = new Date();
    const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
    
    let matchesFilter = true;
    let matchesSearch = true;
    
    // Apply filter
    switch (activeFilter) {
      case 'recall':
        matchesFilter = isRecall;
        break;
      case 'today':
        matchesFilter = meetingDate.toDateString() === today.toDateString();
        break;
      case 'week':
        matchesFilter = meetingDate >= weekAgo;
        break;
      default:
        matchesFilter = true;
    }
    
    // Apply search
    if (searchTerm) {
      const content = meeting.textContent.toLowerCase();
      matchesSearch = content.includes(searchTerm);
    }
    
    meeting.style.display = (matchesFilter && matchesSearch) ? 'block' : 'none';
  });
}

// Sort meetings in the hub
function sortMeetingsHub() {
  const sortBy = document.getElementById('sortMeetings')?.value || 'date-desc';
  const container = document.getElementById('meetingsList');
  const meetings = Array.from(container.children);
  
  meetings.sort((a, b) => {
    switch (sortBy) {
      case 'date-asc':
        return new Date(a.getAttribute('data-date')) - new Date(b.getAttribute('data-date'));
      case 'title':
        return a.getAttribute('data-title').localeCompare(b.getAttribute('data-title'));
      case 'size':
        const aSize = parseInt(a.textContent.match(/(\d+) characters/)?.[1] || '0');
        const bSize = parseInt(b.textContent.match(/(\d+) characters/)?.[1] || '0');
        return bSize - aSize;
      default: // date-desc
        return new Date(b.getAttribute('data-date')) - new Date(a.getAttribute('data-date'));
    }
  });
  
  meetings.forEach(meeting => container.appendChild(meeting));
}

// Toggle meeting expansion
window.toggleMeetingExpand = (noteId) => {
  const fullContent = document.getElementById(`meeting-full-${noteId}`);
  const chevron = document.getElementById(`chevron-${noteId}`);
  
  if (fullContent && chevron) {
    const isVisible = fullContent.style.display !== 'none';
    fullContent.style.display = isVisible ? 'none' : 'block';
    chevron.setAttribute('data-lucide', isVisible ? 'chevron-down' : 'chevron-up');
    lucide.createIcons();
    
    // If expanding, load saved participants
    if (!isVisible) {
      loadSavedParticipants(noteId);
    }
  }
};

// Load saved participants from metadata
async function loadSavedParticipants(noteId) {
  const note = window.notesCache?.find(n => n.id === noteId);
  if (!note || !note.metadata?.participants) return;
  
  const speakersDiv = document.getElementById(`speakers-${noteId}`);
  if (!speakersDiv || speakersDiv.children.length > 0) return; // Already loaded
  
  // Add each saved participant as a tag
  note.metadata.participants.forEach(participant => {
    const tagId = `speaker-${noteId}-${Date.now()}-${Math.random()}`;
    const color = getSpeakerColor(participant.name);
    
    const tag = document.createElement('div');
    tag.id = tagId;
    tag.style.cssText = `
      display: inline-flex; align-items: center; gap: 6px;
      padding: 6px 12px; background: ${color}20; border: 1px solid ${color}40;
      border-radius: 20px; font-size: 13px;
    `;
    
    tag.innerHTML = `
      <div style="width: 20px; height: 20px; border-radius: 50%; background: ${color}; 
                  display: flex; align-items: center; justify-content: center; color: white; font-size: 10px;">
        ${participant.name.charAt(0).toUpperCase()}
      </div>
      <div>
        <div style="font-weight: 500;">${escapeHtml(participant.name)}</div>
        ${participant.email ? `<div style="font-size: 11px; color: var(--muted);">${escapeHtml(participant.email)}</div>` : ''}
      </div>
      <button onclick="removeSpeakerTag('${tagId}')" style="
        background: none; border: none; color: var(--muted); cursor: pointer;
        padding: 0; margin-left: 4px; display: flex; align-items: center;
      ">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </button>
    `;
    
    speakersDiv.appendChild(tag);
  });
}

// Copy meeting text
window.copyMeetingText = async (noteId) => {
  const fullContent = document.getElementById(`meeting-full-${noteId}`);
  if (fullContent) {
    try {
      await navigator.clipboard.writeText(fullContent.textContent);
      window.showToast && window.showToast('Meeting transcript copied to clipboard');
    } catch (e) {
      window.showToast && window.showToast('Failed to copy transcript');
    }
  }
};

// Download meeting
window.downloadMeeting = (noteId, title) => {
  const fullContent = document.getElementById(`meeting-full-${noteId}`);
  if (fullContent) {
    const blob = new Blob([fullContent.textContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title || 'meeting'}-transcript.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }
};

// Delete transcript (note)
window.deleteMeeting = async (noteId) => {
  if (!confirm('Delete this transcript?')) return;
  try{
    const r = await fetch('/api/delete-note', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ id: noteId }) });
    if (!r.ok) throw new Error('api_failed');
    window.showToast && window.showToast('Deleted');
    renderMeetingsHub(document.getElementById('content'));
  }catch(e){ window.showToast && window.showToast('Delete failed'); }
};

// Clean title: hide internal IDs
function cleanMeetingTitle(title){
  if (!title) return 'Meeting';
  return String(title).replace(/^Recall\s+[0-9a-f\-]+\s*/i,'').trim() || 'Meeting';
}

// Extract speaker names from JSON
function extractSpeakerNames(raw){
  try{
    const data = tryParseTranscriptJson(raw);
    const names = new Set();
    if (Array.isArray(data)){
      for (const blk of data){
        const name = blk?.participant?.name;
        if (name) names.add(name);
      }
    } else if (Array.isArray(data?.participants)){
      for (const p of data.participants){ if (p?.name) names.add(p.name); }
    }
    return Array.from(names).slice(0,6);
  }catch{ return []; }
}

// Generate summary for a specific note
window.generateSummaryForNote = async (noteId) => {
  const btn = document.getElementById(`generateSummaryBtn-${noteId}`);
  const summaryEl = document.getElementById(`summary-${noteId}`);
  const containerEl = document.getElementById(`summary-container-${noteId}`);
  const toggleBtn = document.getElementById(`toggleSummaryBtn-${noteId}`);
  
  if (!btn || !summaryEl) return;
  
  // Get note content
  const note = window.notesCache?.find(n => n.id === noteId);
  if (!note) {
    alert('Note not found');
    return;
  }
  
  // Update button state
  btn.disabled = true;
  btn.innerHTML = '<span style="display: inline-flex; align-items: center;"><svg class="icon" style="animation: spin 1s linear infinite; width: 14px; height: 14px; margin-right: 4px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 11-6.219-8.56"/></svg> Generating...</span>';
  
  // Add spinning animation if not exists
  if (!document.getElementById('summarySpinnerStyle')) {
    const style = document.createElement('style');
    style.id = 'summarySpinnerStyle';
    style.textContent = '@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }';
    document.head.appendChild(style);
  }
  
  try {
    // Call the API to generate summary
    const resp = await fetch('/api/summarize-mistral', { 
      method: 'POST', 
      headers: {'Content-Type': 'application/json'}, 
      body: JSON.stringify({ 
        title: note.title, 
        content: note.content 
      }) 
    });
    
    if (!resp.ok) throw new Error('Failed to generate summary');
    
    const data = await resp.json();
    const summary = data.summary || '';
    
    if (summary) {
      // Format and display the summary
      const formattedSummary = formatSummaryContent(summary);
      summaryEl.innerHTML = formattedSummary;
      
      // Show the summary container
      containerEl.style.display = 'block';
      btn.style.display = 'none';
      toggleBtn.style.display = 'inline-flex';
      
      // Save summary to database
      try {
        await fetch('/api/save-summary', { 
          method: 'POST', 
          headers: {'Content-Type': 'application/json'}, 
          body: JSON.stringify({ id: noteId, summary }) 
        });
      } catch(e) {
        console.error('Failed to save summary:', e);
      }
    } else {
      summaryEl.innerHTML = '<em style="color: var(--muted);">No summary available</em>';
      containerEl.style.display = 'block';
    }
    
  } catch(error) {
    console.error('Summary generation error:', error);
    summaryEl.innerHTML = `<span style="color: var(--danger);">Failed to generate summary: ${error.message}</span>`;
    containerEl.style.display = 'block';
    btn.disabled = false;
    btn.innerHTML = '<i data-lucide="wand-2"></i> Generate Summary';
  }
  
  // Re-create icons
  lucide.createIcons();
};

// Toggle summary visibility
window.toggleSummary = (noteId) => {
  const container = document.getElementById(`summary-container-${noteId}`);
  const chevron = document.getElementById(`summaryChevron-${noteId}`);
  const toggleBtn = document.getElementById(`toggleSummaryBtn-${noteId}`);
  
  if (!container) return;
  
  if (container.style.display === 'none') {
    container.style.display = 'block';
    toggleBtn.innerHTML = '<i data-lucide="chevron-up" id="summaryChevron-' + noteId + '"></i> Hide';
  } else {
    container.style.display = 'none';
    toggleBtn.innerHTML = '<i data-lucide="chevron-down" id="summaryChevron-' + noteId + '"></i> Show';
  }
  
  lucide.createIcons();
};

// Enhanced transcript formatting with proper structure
function formatEnhancedTranscript(content, noteId) {
  if (!content) return '<p style="color: var(--muted);">No transcript content available</p>';
  
  const contentStr = typeof content === 'string' ? content : JSON.stringify(content);
  
  // Check if it's already formatted with speaker labels (look for more patterns)
  if (contentStr.includes('Speaker:') || contentStr.includes('Speaker 1:') || 
      contentStr.includes('Speaker 2:') || contentStr.includes('Speaker Unknown:') ||
      contentStr.includes('Unknown:')) {
    return formatSpeakerBasedTranscript(contentStr);
  }
  
  // Try to parse as JSON for structured data
  try {
    const data = JSON.parse(contentStr);
    
    // Handle array of speaker blocks
    if (Array.isArray(data)) {
      return formatStructuredTranscript(data);
    }
    
    // Handle object with transcript field
    if (data.transcript) {
      return formatStructuredTranscript(data.transcript);
    }
    
    // Handle words array
    if (data.words && Array.isArray(data.words)) {
      return formatWordsTranscript(data.words);
    }
  } catch(e) {
    // Not JSON, treat as plain text
  }
  
  // For plain text, try to detect speaker patterns or format nicely
  return formatIntelligentTranscript(contentStr);
}

// Format speaker-based transcript
function formatSpeakerBasedTranscript(text) {
  const lines = text.split('\n');
  let html = '';
  let currentSpeaker = '';
  let currentContent = [];
  
  for (const line of lines) {
    // More flexible speaker matching pattern
    const speakerMatch = line.match(/^((?:Speaker\s*(?:\d+|Unknown)|Unknown|\w+(?:\s+\w+)?)):\s*(.+)/i);
    
    if (speakerMatch) {
      // Save previous speaker's content
      if (currentSpeaker && currentContent.length > 0) {
        html += renderSpeakerBlock(currentSpeaker, currentContent.join(' '));
      }
      
      // Start new speaker
      currentSpeaker = speakerMatch[1].trim();
      currentContent = [speakerMatch[2].trim()];
    } else if (line.trim()) {
      // Continue current speaker's content
      currentContent.push(line.trim());
    }
  }
  
  // Add last speaker's content
  if (currentSpeaker && currentContent.length > 0) {
    html += renderSpeakerBlock(currentSpeaker, currentContent.join(' '));
  }
  
  return html || formatIntelligentTranscript(text);
}

// Format intelligent transcript - detect patterns and format accordingly
function formatIntelligentTranscript(text) {
  // Clean and normalize the text
  const cleaned = text.replace(/\s+/g, ' ').trim();
  
  // Try to detect speaker patterns
  const speakerPatterns = [
    /Speaker\s*(?:\d+|Unknown):/gi,
    /\b(?:Unknown|Speaker):/gi,
    /^([A-Z][a-z]+ [A-Z][a-z]+):/gm
  ];
  
  for (const pattern of speakerPatterns) {
    if (pattern.test(cleaned)) {
      return formatSpeakerBasedTranscript(text);
    }
  }
  
  // If no speakers detected, create conversational blocks
  const sentences = cleaned.split(/(?<=[.!?])\s+/);
  let html = '';
  let currentBlock = [];
  let speakerNum = 1;
  
  for (let i = 0; i < sentences.length; i++) {
    currentBlock.push(sentences[i]);
    
    // Create a block every 2-3 sentences or on natural breaks
    if (currentBlock.length >= 2 || i === sentences.length - 1) {
      const blockText = currentBlock.join(' ').trim();
      if (blockText) {
        html += renderSpeakerBlock(`Speaker ${speakerNum}`, blockText);
        speakerNum = speakerNum === 1 ? 2 : 1; // Alternate between speakers
      }
      currentBlock = [];
    }
  }
  
  return html || '<p style="color: var(--muted);">No transcript content available</p>';
}

// Format structured transcript from JSON
function formatStructuredTranscript(data) {
  if (!Array.isArray(data)) return formatIntelligentTranscript(JSON.stringify(data));
  
  let html = '';
  const speakerMap = new Map(); // Track unique speakers
  
  for (const segment of data) {
    // Extract speaker name from various possible locations
    let speaker = '';
    
    // Check for participant object (Recall format)
    if (segment.participant) {
      speaker = segment.participant.name || segment.participant.display_name || 
                segment.participant.email || `Participant ${segment.participant.id || 'Unknown'}`;
    }
    // Check for direct speaker fields
    else if (segment.speaker) {
      speaker = segment.speaker;
    }
    else if (segment.speaker_name) {
      speaker = segment.speaker_name;
    }
    // Check for speaker_id
    else if (segment.speaker_id !== undefined && segment.speaker_id !== null) {
      // Try to map speaker_id to a name if we've seen it before
      const speakerId = segment.speaker_id.toString();
      if (speakerMap.has(speakerId)) {
        speaker = speakerMap.get(speakerId);
      } else {
        speaker = `Speaker ${segment.speaker_id}`;
        speakerMap.set(speakerId, speaker);
      }
    }
    // Default fallback
    else {
      speaker = 'Unknown Speaker';
    }
    
    // Extract text content
    let text = '';
    if (segment.text) {
      text = segment.text;
    } else if (segment.words && Array.isArray(segment.words)) {
      text = segment.words.map(w => w.text || w.word || w).join(' ');
    } else if (typeof segment === 'string') {
      text = segment;
    }
    
    if (text && text.trim()) {
      html += renderSpeakerBlock(speaker, text);
    }
  }
  
  // If no content was generated, show debug info
  if (!html && data.length > 0) {
    console.log('Debug: Sample segment structure:', data[0]);
    html = `<div style="color: var(--muted); padding: 12px; background: var(--panel-2); border-radius: 8px;">
      <p>Transcript data found but unable to parse. Sample structure:</p>
      <pre style="font-size: 11px; margin-top: 8px;">${JSON.stringify(data[0], null, 2).substring(0, 500)}</pre>
    </div>`;
  }
  
  return html || '<p style="color: var(--muted);">No transcript content found</p>';
}

// Format words-based transcript
function formatWordsTranscript(words) {
  const text = words.map(w => w.text || w.word || '').join(' ');
  return formatIntelligentTranscript(text);
}


// Render a speaker block with nice formatting
function renderSpeakerBlock(speaker, text) {
  // Clean up the text
  const cleanText = text
    .replace(/\s+/g, ' ')
    .replace(/([.!?])\s+([A-Z])/g, '$1</p><p>$2')
    .trim();
  
  // Get speaker color based on name
  const speakerColor = getSpeakerColor(speaker);
  
  return `
    <div style="margin-bottom: 20px; padding: 16px; background: linear-gradient(135deg, var(--panel-2), var(--panel-1)); 
                border-radius: 12px; border-left: 4px solid ${speakerColor};">
      <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 10px;">
        <div style="width: 32px; height: 32px; border-radius: 50%; background: ${speakerColor}; 
                    display: flex; align-items: center; justify-content: center; color: white; font-weight: 600;">
          ${speaker.charAt(0).toUpperCase()}
        </div>
        <div>
          <div style="font-weight: 600; color: var(--primary); font-size: 14px;">${escapeHtml(speaker)}</div>
          <div style="font-size: 11px; color: var(--muted);">Participant</div>
        </div>
      </div>
      <div style="line-height: 1.8; color: var(--text); font-size: 14px;">
        <p style="margin: 0;">${cleanText}</p>
      </div>
    </div>
  `;
}

// Get consistent color for speaker
function getSpeakerColor(speaker) {
  const colors = [
    '#3b82f6', // blue
    '#10b981', // green
    '#f59e0b', // amber
    '#ef4444', // red
    '#8b5cf6', // violet
    '#ec4899', // pink
    '#14b8a6', // teal
    '#f97316'  // orange
  ];
  
  let hash = 0;
  for (let i = 0; i < speaker.length; i++) {
    hash = speaker.charCodeAt(i) + ((hash << 5) - hash);
  }
  
  return colors[Math.abs(hash) % colors.length];
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Update meeting title
window.updateMeetingTitle = async (noteId, newTitle) => {
  try {
    // Get current note to preserve metadata
    const sb = getSupabase();
    const { data: currentNote, error: fetchError } = await sb
      .from('notes')
      .select('*')
      .eq('id', noteId)
      .single();
    
    // Handle missing note or metadata gracefully
    if (fetchError && fetchError.code !== 'PGRST116') throw fetchError;
    
    // Preserve existing metadata and update title
    const metadata = currentNote?.metadata || {};
    metadata.edited_title = newTitle;
    metadata.last_edited = new Date().toISOString();
    
    // Update in database with new title and metadata
    const { error } = await sb
      .from('notes')
      .update({ 
        title: `[Recall] ${newTitle}`,
        metadata: metadata
      })
      .eq('id', noteId);
    
    if (error) throw error;
    
    // Update in cache
    const note = window.notesCache?.find(n => n.id === noteId);
    if (note) {
      note.title = `[Recall] ${newTitle}`;
      note.metadata = metadata;
    }
    
    // Update in UI
    const headerTitle = document.querySelector(`[data-id="${noteId}"] h4`);
    if (headerTitle) {
      headerTitle.innerHTML = `🎙️ ${newTitle}`;
    }
    
    window.showToast && window.showToast('Title updated successfully');
  } catch(e) {
    alert('Failed to update title: ' + e.message);
  }
};

// Add speaker tag
window.addSpeakerTag = (noteId) => {
  const name = prompt('Enter participant name:');
  if (!name) return;
  
  const email = prompt('Enter participant email (optional):');
  
  const speakersDiv = document.getElementById(`speakers-${noteId}`);
  if (!speakersDiv) return;
  
  const tagId = `speaker-${noteId}-${Date.now()}`;
  const color = getSpeakerColor(name);
  
  const tag = document.createElement('div');
  tag.id = tagId;
  tag.style.cssText = `
    display: inline-flex; align-items: center; gap: 6px;
    padding: 6px 12px; background: ${color}20; border: 1px solid ${color}40;
    border-radius: 20px; font-size: 13px;
  `;
  
  tag.innerHTML = `
    <div style="width: 20px; height: 20px; border-radius: 50%; background: ${color}; 
                display: flex; align-items: center; justify-content: center; color: white; font-size: 10px;">
      ${name.charAt(0).toUpperCase()}
    </div>
    <div>
      <div style="font-weight: 500;">${escapeHtml(name)}</div>
      ${email ? `<div style="font-size: 11px; color: var(--muted);">${escapeHtml(email)}</div>` : ''}
    </div>
    <button onclick="removeSpeakerTag('${tagId}')" style="
      background: none; border: none; color: var(--muted); cursor: pointer;
      padding: 0; margin-left: 4px; display: flex; align-items: center;
    ">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <line x1="18" y1="6" x2="6" y2="18"></line>
        <line x1="6" y1="6" x2="18" y2="18"></line>
      </svg>
    </button>
  `;
  
  speakersDiv.appendChild(tag);
  
  // Save speakers to note metadata
  saveSpeakersToNote(noteId);
};

// Remove speaker tag
window.removeSpeakerTag = (tagId) => {
  const tag = document.getElementById(tagId);
  if (tag) {
    tag.remove();
    // Extract noteId from tagId
    const noteId = tagId.split('-')[1];
    saveSpeakersToNote(noteId);
  }
};

// Save speakers to note metadata
async function saveSpeakersToNote(noteId) {
  const speakersDiv = document.getElementById(`speakers-${noteId}`);
  if (!speakersDiv) return;
  
  const speakers = [];
  const tags = speakersDiv.querySelectorAll('[id^="speaker-"]');
  
  tags.forEach(tag => {
    const nameDiv = tag.querySelector('div > div:first-child');
    const emailDiv = tag.querySelector('div > div:last-child');
    
    if (nameDiv) {
      speakers.push({
        name: nameDiv.textContent,
        email: emailDiv?.textContent || ''
      });
    }
  });
  
  try {
    // Get current note metadata
    const sb = getSupabase();
    const { data: currentNote, error: fetchError } = await sb
      .from('notes')
      .select('*')
      .eq('id', noteId)
      .single();
    
    // Handle missing note or metadata gracefully
    if (fetchError && fetchError.code !== 'PGRST116') throw fetchError;
    
    // Update metadata with speakers
    const metadata = currentNote?.metadata || {};
    metadata.participants = speakers;
    metadata.participants_updated = new Date().toISOString();
    
    // Save to database
    const { error } = await sb
      .from('notes')
      .update({ metadata })
      .eq('id', noteId);
    
    if (error) throw error;
    
    // Update cache
    const note = window.notesCache?.find(n => n.id === noteId);
    if (note) {
      note.metadata = metadata;
    }
    
    console.log('Speakers saved for note', noteId, speakers);
  } catch(e) {
    console.error('Failed to save speakers:', e);
  }
}

// Format summary content for display
function formatSummaryContent(summary) {
  if (!summary) return '';
  
  // Remove any JSON or HTML artifacts
  let formatted = summary;
  
  // If it looks like JSON, try to parse it
  if (summary.startsWith('{') || summary.startsWith('[')) {
    try {
      const parsed = JSON.parse(summary);
      if (typeof parsed === 'string') {
        formatted = parsed;
      } else if (parsed.summary) {
        formatted = parsed.summary;
      } else if (parsed.text) {
        formatted = parsed.text;
      } else {
        formatted = JSON.stringify(parsed, null, 2);
      }
    } catch(e) {
      // Not JSON, use as-is
    }
  }
  
  // Convert markdown-style formatting to HTML
  formatted = formatted
    .replace(/^## (.+)$/gm, '<h3 style="margin: 16px 0 8px 0; font-size: 15px; font-weight: 600; color: var(--primary);">$1</h3>')
    .replace(/^### (.+)$/gm, '<h4 style="margin: 12px 0 6px 0; font-size: 14px; font-weight: 600;">$1</h4>')
    .replace(/^\* (.+)$/gm, '<li>$1</li>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n\n/g, '</p><p style="margin: 8px 0;">')
    .replace(/\n/g, '<br>');
  
  // Wrap lists
  formatted = formatted.replace(/(<li>.*<\/li>)(?:\s*<li>)/g, '<ul style="margin: 8px 0; padding-left: 20px;">$1');
  formatted = formatted.replace(/(<\/li>)(?![\s]*<li>)/g, '$1</ul>');
  
  // Wrap in paragraph if not already structured
  if (!formatted.includes('<p>') && !formatted.includes('<h')) {
    formatted = `<p style="margin: 8px 0;">${formatted}</p>`;
  }
  
  return formatted;
}

// Helper functions for meeting views
window.expandNote = (noteId, element) => {
  const preview = element.querySelector('.note-preview');
  if (preview) {
    preview.style.display = preview.style.display === 'none' ? 'block' : 'none';
  }
};

window.toggleMeetingContent = (noteId) => {
  const content = document.getElementById(`content-${noteId}`);
  const icon = event.target.closest('button').querySelector('i');
  if (content) {
    const isVisible = content.style.display !== 'none';
    content.style.display = isVisible ? 'none' : 'block';
    icon.setAttribute('data-lucide', isVisible ? 'chevron-down' : 'chevron-up');
    lucide.createIcons();
  }
};

// Alternative Import View #1: Direct Transcript Import
async function renderTranscriptImport(root) {
  root.innerHTML = `
    <div class="content-head">
      <div class="title">
        <i data-lucide="file-plus" class="icon"></i>
        Direct Transcript Import
      </div>
      <button class="button ghost" id="backToHub" style="margin-left:12px">
        <i data-lucide="arrow-left" class="icon"></i> Back to Hub
      </button>
    </div>
    <div class="content-body">
      <div style="max-width: 800px; margin: 0 auto; padding: 24px;">
        <div class="card" style="padding: 24px; border-radius: 12px; border: 1px solid var(--border);">
          <h3 style="margin-bottom: 16px;">Import Single Transcript</h3>
          
          <div class="field" style="margin-bottom: 16px;">
            <label>Meeting Title</label>
            <input id="transcriptTitle" type="text" placeholder="e.g., Team Standup - Dec 20" 
                   style="width: 100%; padding: 8px 12px; border: 1px solid var(--border); border-radius: 6px;">
          </div>
          
          <div class="field" style="margin-bottom: 16px;">
            <label>Transcript Content</label>
            <textarea id="transcriptContent" rows="10" placeholder="Paste your transcript here..."
                      style="width: 100%; padding: 8px 12px; border: 1px solid var(--border); border-radius: 6px; font-family: monospace; font-size: 13px;"></textarea>
          </div>
          
          <div class="field" style="margin-bottom: 16px;">
            <label>Source (optional)</label>
            <select id="transcriptSource" style="padding: 8px 12px; border: 1px solid var(--border); border-radius: 6px;">
              <option value="manual">Manual Entry</option>
              <option value="zoom">Zoom</option>
              <option value="teams">Microsoft Teams</option>
              <option value="meet">Google Meet</option>
              <option value="other">Other</option>
            </select>
          </div>
          
          <div style="display: flex; gap: 12px;">
            <button class="button primary" id="importBtn">
              <i data-lucide="upload" class="icon"></i> Import Transcript
            </button>
            <button class="button ghost" id="clearBtn">Clear Form</button>
          </div>
          
          <div id="importStatus" style="margin-top: 16px; padding: 12px; border-radius: 6px; display: none;"></div>
        </div>
        
        <!-- File Upload Option -->
        <div class="card" style="margin-top: 24px; padding: 24px; border-radius: 12px; border: 1px solid var(--border);">
          <h3 style="margin-bottom: 16px;">Import from File</h3>
          <input type="file" id="fileInput" accept=".txt,.vtt,.srt,.json" style="margin-bottom: 12px;">
          <button class="button" id="fileImportBtn">
            <i data-lucide="file-text" class="icon"></i> Import from File
          </button>
        </div>
      </div>
    </div>
  `;
  
  lucide.createIcons();
  
  // Event handlers
  document.getElementById('backToHub')?.addEventListener('click', () => {
    location.hash = 'meetings/hub';
  });
  
  document.getElementById('clearBtn')?.addEventListener('click', () => {
    document.getElementById('transcriptTitle').value = '';
    document.getElementById('transcriptContent').value = '';
    document.getElementById('transcriptSource').value = 'manual';
  });
  
  document.getElementById('importBtn')?.addEventListener('click', async () => {
    const title = document.getElementById('transcriptTitle').value.trim();
    const content = document.getElementById('transcriptContent').value.trim();
    const source = document.getElementById('transcriptSource').value;
    const statusEl = document.getElementById('importStatus');
    
    if (!title || !content) {
      statusEl.style.display = 'block';
      statusEl.style.background = 'var(--danger-bg)';
      statusEl.innerHTML = '⚠️ Please provide both title and content';
      return;
    }
    
    statusEl.style.display = 'block';
    statusEl.style.background = 'var(--info-bg)';
    statusEl.innerHTML = '⏳ Importing transcript...';
    
    try {
      const response = await fetch('/api/transcript-import-direct', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, content, source })
      });
      
      const result = await response.json();
      
      if (result.success) {
        statusEl.style.background = 'var(--success-bg)';
        statusEl.innerHTML = '✅ Transcript imported successfully!';
        setTimeout(() => {
          location.hash = 'meetings/hub';
        }, 1500);
      } else {
        statusEl.style.background = 'var(--danger-bg)';
        statusEl.innerHTML = `❌ Import failed: ${result.error}`;
      }
    } catch (e) {
      statusEl.style.background = 'var(--danger-bg)';
      statusEl.innerHTML = `❌ Import error: ${e.message}`;
    }
  });
  
  document.getElementById('fileImportBtn')?.addEventListener('click', async () => {
    const fileInput = document.getElementById('fileInput');
    const file = fileInput.files[0];
    
    if (!file) {
      window.showToast && window.showToast('Please select a file');
      return;
    }
    
    const reader = new FileReader();
    reader.onload = async (e) => {
      const content = e.target.result;
      const title = file.name.replace(/\.[^/.]+$/, '');
      
      document.getElementById('transcriptTitle').value = title;
      document.getElementById('transcriptContent').value = content;
      
      // Auto-import
      document.getElementById('importBtn').click();
    };
    reader.readAsText(file);
  });
}

// Alternative Import View #2: Batch Import
async function renderBatchImport(root) {
  root.innerHTML = `
    <div class="content-head">
      <div class="title">
        <i data-lucide="folder-plus" class="icon"></i>
        Batch Transcript Import
      </div>
      <button class="button ghost" id="backToHub" style="margin-left:12px">
        <i data-lucide="arrow-left" class="icon"></i> Back to Hub
      </button>
    </div>
    <div class="content-body">
      <div style="max-width: 900px; margin: 0 auto; padding: 24px;">
        <div class="card" style="padding: 24px; border-radius: 12px; border: 1px solid var(--border);">
          <h3 style="margin-bottom: 16px;">Batch Import Multiple Transcripts</h3>
          
          <div id="transcriptList" style="margin-bottom: 24px;">
            <!-- Dynamic transcript entries will be added here -->
          </div>
          
          <div style="display: flex; gap: 12px; margin-bottom: 24px;">
            <button class="button" id="addTranscriptBtn">
              <i data-lucide="plus" class="icon"></i> Add Transcript
            </button>
            <button class="button primary" id="importAllBtn">
              <i data-lucide="upload-cloud" class="icon"></i> Import All
            </button>
            <button class="button ghost" id="clearAllBtn">Clear All</button>
          </div>
          
          <div id="batchStatus" style="padding: 16px; border-radius: 8px; display: none;"></div>
        </div>
        
        <!-- JSON Import -->
        <div class="card" style="margin-top: 24px; padding: 24px; border-radius: 12px; border: 1px solid var(--border);">
          <h3 style="margin-bottom: 16px;">Import from JSON</h3>
          <p style="color: var(--muted); margin-bottom: 12px;">
            Format: [{"title": "Meeting 1", "content": "..."}, ...]
          </p>
          <textarea id="jsonInput" rows="6" placeholder='[{"title": "Meeting Title", "content": "Transcript content..."}]'
                    style="width: 100%; padding: 8px 12px; border: 1px solid var(--border); border-radius: 6px; font-family: monospace; font-size: 12px;"></textarea>
          <button class="button" id="jsonImportBtn" style="margin-top: 12px;">
            <i data-lucide="code" class="icon"></i> Import from JSON
          </button>
        </div>
      </div>
    </div>
  `;
  
  lucide.createIcons();
  
  let transcriptCounter = 0;
  
  const addTranscriptEntry = () => {
    transcriptCounter++;
    const entryId = `transcript-${transcriptCounter}`;
    const entryHtml = `
      <div id="${entryId}" class="transcript-entry" style="border: 1px solid var(--border); padding: 16px; border-radius: 8px; margin-bottom: 12px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
          <h4>Transcript #${transcriptCounter}</h4>
          <button class="button sm danger" onclick="document.getElementById('${entryId}').remove()">
            <i data-lucide="x" class="icon"></i> Remove
          </button>
        </div>
        <input type="text" placeholder="Meeting Title" class="transcript-title" 
               style="width: 100%; padding: 6px 10px; border: 1px solid var(--border); border-radius: 4px; margin-bottom: 8px;">
        <textarea rows="4" placeholder="Transcript content..." class="transcript-content"
                  style="width: 100%; padding: 6px 10px; border: 1px solid var(--border); border-radius: 4px; font-size: 13px;"></textarea>
      </div>
    `;
    
    document.getElementById('transcriptList').insertAdjacentHTML('beforeend', entryHtml);
    lucide.createIcons();
  };
  
  // Event handlers
  document.getElementById('backToHub')?.addEventListener('click', () => {
    location.hash = 'meetings/hub';
  });
  
  document.getElementById('addTranscriptBtn')?.addEventListener('click', addTranscriptEntry);
  
  document.getElementById('clearAllBtn')?.addEventListener('click', () => {
    document.getElementById('transcriptList').innerHTML = '';
    transcriptCounter = 0;
  });
  
  document.getElementById('importAllBtn')?.addEventListener('click', async () => {
    const entries = document.querySelectorAll('.transcript-entry');
    const transcripts = [];
    
    entries.forEach(entry => {
      const title = entry.querySelector('.transcript-title').value.trim();
      const content = entry.querySelector('.transcript-content').value.trim();
      
      if (title && content) {
        transcripts.push({ title, content, source: 'batch' });
      }
    });
    
    if (transcripts.length === 0) {
      window.showToast && window.showToast('No valid transcripts to import');
      return;
    }
    
    const statusEl = document.getElementById('batchStatus');
    statusEl.style.display = 'block';
    statusEl.style.background = 'var(--info-bg)';
    statusEl.innerHTML = `⏳ Importing ${transcripts.length} transcript(s)...`;
    
    try {
      const response = await fetch('/api/transcript-import-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcripts })
      });
      
      const result = await response.json();
      
      if (result.success) {
        statusEl.style.background = 'var(--success-bg)';
        statusEl.innerHTML = `✅ Import complete! ${result.imported} imported, ${result.failed} failed`;
        
        if (result.errors && result.errors.length > 0) {
          statusEl.innerHTML += '<br>Errors: ' + result.errors.join('<br>');
        }
        
        setTimeout(() => {
          location.hash = 'meetings/hub';
        }, 2000);
      } else {
        statusEl.style.background = 'var(--danger-bg)';
        statusEl.innerHTML = `❌ Import failed: ${result.error}`;
      }
    } catch (e) {
      statusEl.style.background = 'var(--danger-bg)';
      statusEl.innerHTML = `❌ Import error: ${e.message}`;
    }
  });
  
  document.getElementById('jsonImportBtn')?.addEventListener('click', () => {
    const jsonInput = document.getElementById('jsonInput').value.trim();
    
    try {
      const transcripts = JSON.parse(jsonInput);
      
      if (!Array.isArray(transcripts)) {
        throw new Error('Input must be an array');
      }
      
      // Clear existing entries
      document.getElementById('transcriptList').innerHTML = '';
      transcriptCounter = 0;
      
      // Add entries from JSON
      transcripts.forEach(t => {
        addTranscriptEntry();
        const lastEntry = document.querySelector('.transcript-entry:last-child');
        lastEntry.querySelector('.transcript-title').value = t.title || '';
        lastEntry.querySelector('.transcript-content').value = t.content || '';
      });
      
      window.showToast && window.showToast(`Loaded ${transcripts.length} transcript(s)`);
    } catch (e) {
      window.showToast && window.showToast(`Invalid JSON: ${e.message}`);
    }
  });
  
  // Add initial entry
  addTranscriptEntry();
}

// Recall Browser - Direct connection to Recall API
async function renderRecallBrowser(root) {
  root.innerHTML = `
    <div class="content-head">
      <div class="title">
        <i data-lucide="database" class="icon"></i>
        Recall Transcript Browser
      </div>
      <button class="button ghost" id="backToHub" style="margin-left:12px">
        <i data-lucide="arrow-left" class="icon"></i> Back to Hub
      </button>
      <button class="button primary" id="refreshRecallBtn" style="margin-left:auto">
        <i data-lucide="refresh-cw" class="icon"></i> Refresh
      </button>
      <button class="button ghost" id="testRecallBtn" style="margin-left:8px">
        🔍 Test API
      </button>
    </div>
    <div class="content-body">
      <div style="padding: 24px;">
        <!-- Loading state -->
        <div id="recallLoading" style="text-align: center; padding: 48px;">
          <div class="loading">Connecting to Recall API...</div>
        </div>
        
        <!-- Transcript list -->
        <div id="recallContent" style="display: none;">
          <div style="margin-bottom: 24px; padding: 16px; background: var(--panel-1); border-radius: 8px;">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <h3 style="margin: 0;">Available Transcripts</h3>
              <div style="display: flex; gap: 12px;">
                <button class="button sm" id="selectAllBtn">Select All</button>
                <button class="button sm" id="deselectAllBtn">Deselect All</button>
                <button class="button primary" id="importSelectedBtn">
                  <i data-lucide="download" class="icon"></i> Import Selected
                </button>
              </div>
            </div>
          </div>
          
          <div id="transcriptList" style="display: grid; gap: 16px;">
            <!-- Transcripts will be loaded here -->
          </div>
        </div>
        
        <!-- Error state -->
        <div id="recallError" style="display: none; text-align: center; padding: 48px;">
          <i data-lucide="alert-circle" style="width: 48px; height: 48px; color: var(--danger);"></i>
          <h3>Failed to load transcripts</h3>
          <p id="errorMessage" style="color: var(--muted);"></p>
          <button class="button" onclick="location.reload()">Retry</button>
        </div>
      </div>
    </div>
  `;
  
  lucide.createIcons();
  
  // Load transcripts from Recall
  loadRecallTranscripts();
  
  // Event handlers
  document.getElementById('backToHub')?.addEventListener('click', () => {
    location.hash = 'meetings/hub';
  });
  
  document.getElementById('refreshRecallBtn')?.addEventListener('click', () => {
    loadRecallTranscripts();
  });
  
  document.getElementById('testRecallBtn')?.addEventListener('click', async () => {
    const btn = document.getElementById('testRecallBtn');
    btn.textContent = '⏳ Testing...';
    
    try {
      // Test multiple endpoints
      const tests = [
        { name: 'Recordings API', url: '/api/recall-fetch-recordings' },
        { name: 'List Transcripts', url: '/api/recall-list-transcripts' },
        { name: 'List Bots', url: '/api/recall-list-bots' },
        { name: 'Test Connection', url: '/api/recall-test-connection' }
      ];
      
      let results = '🔍 API Test Results:\n\n';
      
      for (const test of tests) {
        const resp = await fetch(test.url);
        const data = await resp.json();
        
        results += `${test.name}:\n`;
        results += `  Status: ${resp.ok ? '✅' : '❌'}\n`;
        
        if (test.name === 'Recordings API') {
          results += `  Transcripts found: ${data.transcripts?.length || 0}\n`;
          results += `  Bots found: ${data.bot_count || 0}\n`;
          results += `  Recordings found: ${data.recording_count || 0}\n`;
        } else if (test.name === 'List Transcripts') {
          results += `  Total bots: ${data.total_bots || 0}\n`;
          results += `  Transcripts: ${data.transcripts?.length || 0}\n`;
        } else if (test.name === 'List Bots') {
          results += `  Bots: ${data.total || 0}\n`;
          results += `  Completed: ${data.completed || 0}\n`;
        } else if (test.name === 'Test Connection') {
          results += `  Has key: ${data.has_key ? '✅' : '❌'}\n`;
          results += `  Working endpoint: ${data.working_endpoint || 'none'}\n`;
          results += `  Bot count: ${data.bot_count || 0}\n`;
        }
        
        results += '\n';
      }
      
      console.log('Full API test results:', { tests });
      alert(results);
      
    } catch(e) {
      alert(`Test failed: ${e.message}`);
    } finally {
      btn.textContent = '🔍 Test API';
    }
  });
  
  async function loadRecallTranscripts() {
    const loadingEl = document.getElementById('recallLoading');
    const contentEl = document.getElementById('recallContent');
    const errorEl = document.getElementById('recallError');
    
    loadingEl.style.display = 'block';
    contentEl.style.display = 'none';
    errorEl.style.display = 'none';
    
    try {
      // First try the new recordings endpoint
      let response = await fetch('/api/recall-fetch-recordings');
      let data = await response.json();
      
      // If that fails or returns no transcripts, fall back to the original endpoint
      if (!data.success || !data.transcripts || data.transcripts.length === 0) {
        response = await fetch('/api/recall-list-transcripts');
        data = await response.json();
      }
      
      if (!data.success) {
        throw new Error(data.error || 'Failed to load transcripts');
      }
      
      const transcripts = data.transcripts || [];
      const listEl = document.getElementById('transcriptList');
      
      if (transcripts.length === 0) {
        listEl.innerHTML = `
          <div style="text-align: center; padding: 48px; color: var(--muted);">
            <i data-lucide="inbox" style="width: 48px; height: 48px;"></i>
            <h3>No bots found</h3>
            <p>Send Recall bot to a meeting first</p>
            <div style="margin-top: 16px; padding: 12px; background: var(--panel-2); border-radius: 8px; text-align: left; max-width: 400px; margin-left: auto; margin-right: auto;">
              <strong>Debug Info:</strong><br>
              Total bots: ${data.total_bots || 0}<br>
              Region: ${data.debug?.region || 'unknown'}<br>
              Errors: ${data.debug?.errors?.length || 0}
            </div>
          </div>
        `;
      } else {
        // Show total counts at top
        const withTranscripts = transcripts.filter(t => t.has_transcript).length;
        const completed = transcripts.filter(t => t.status === 'done').length;
        
        listEl.innerHTML = `
          <div style="margin-bottom: 16px; padding: 12px; background: var(--info-bg); border-radius: 8px; font-size: 13px;">
            📊 Found ${transcripts.length} bot(s) | ${completed} completed | ${withTranscripts} with transcripts
          </div>
        ` + transcripts.map((t, idx) => `
          <div class="transcript-item" data-id="${t.id}" style="border: 1px solid var(--border); border-radius: 12px; padding: 16px; background: var(--panel-1);">
            <div style="display: flex; gap: 16px;">
              <input type="checkbox" class="transcript-checkbox" data-idx="${idx}" style="width: 20px; height: 20px;">
              
              <div style="flex: 1;">
                <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 12px;">
                  <div>
                    <h4 style="margin: 0 0 4px 0; color: var(--primary);">
                      ${t.title}
                    </h4>
                    <div style="font-size: 12px; color: var(--muted);">
                      📅 ${new Date(t.created_at).toLocaleString()} 
                      ${t.participants > 0 ? `· 👥 ${t.participant_names || t.participants + ' participants'}` : ''}
                      ${t.duration ? `· ${t.duration}` : ''}
                    </div>
                  </div>
                  <div style="display: flex; flex-direction: column; gap: 4px; align-items: flex-end;">
                    <span class="badge ${t.status === 'done' ? 'success' : t.status === 'fatal' ? 'danger' : 'warning'}" 
                          style="padding: 4px 8px; border-radius: 4px; font-size: 11px;">
                      ${t.status_display || t.status}
                    </span>
                    ${t.has_transcript ? 
                      '<span class="badge success" style="padding: 4px 8px; border-radius: 4px; font-size: 11px;">✅ Has Transcript</span>' : 
                      '<span class="badge muted" style="padding: 4px 8px; border-radius: 4px; font-size: 11px;">📝 No Transcript Yet</span>'
                    }
                  </div>
                </div>
                
                ${t.meeting_url ? `
                  <div style="font-size: 12px; color: var(--muted); margin-bottom: 8px;">
                    🔗 ${t.meeting_url.substring(0, 50)}...
                  </div>
                ` : ''}
                
                ${t.transcript_preview ? `
                  <div style="margin-bottom: 12px;">
                    <div style="font-weight: 600; margin-bottom: 6px; font-size: 13px;">Preview:</div>
                    <div class="transcript-preview" style="background: var(--panel-2); padding: 12px; border-radius: 6px; font-size: 12px; line-height: 1.5; max-height: 100px; overflow: hidden; position: relative;">
                      ${t.transcript_preview}
                      ${t.transcript_length > 500 ? '<div style="position: absolute; bottom: 0; left: 0; right: 0; height: 30px; background: linear-gradient(transparent, var(--panel-2));"></div>' : ''}
                    </div>
                    <div style="font-size: 11px; color: var(--muted); margin-top: 4px;">
                      📝 ${t.transcript_length} characters
                    </div>
                  </div>
                ` : `
                  <div style="padding: 12px; background: var(--panel-2); border-radius: 6px; color: var(--muted); font-size: 12px;">
                    No transcript preview available
                  </div>
                `}
                
                <div style="display: flex; gap: 8px;">
                  <button class="button sm" onclick="viewFullTranscript(${idx})">
                    <i data-lucide="eye" class="icon"></i> View Full
                  </button>
                  <button class="button sm ghost" onclick="copyTranscript(${idx})">
                    <i data-lucide="copy" class="icon"></i> Copy
                  </button>
                </div>
              </div>
            </div>
            
            <!-- Hidden full transcript data -->
            <div id="transcript-full-${idx}" style="display: none;">
              ${t.full_transcript || 'No transcript available'}
            </div>
          </div>
        `).join('');
      }
      
      loadingEl.style.display = 'none';
      contentEl.style.display = 'block';
      lucide.createIcons();
      
      // Store transcripts for later use
      window.recallTranscripts = transcripts;
      
    } catch (error) {
      loadingEl.style.display = 'none';
      errorEl.style.display = 'block';
      document.getElementById('errorMessage').textContent = error.message;
    }
  }
  
  // Select/Deselect all
  document.getElementById('selectAllBtn')?.addEventListener('click', () => {
    document.querySelectorAll('.transcript-checkbox').forEach(cb => cb.checked = true);
  });
  
  document.getElementById('deselectAllBtn')?.addEventListener('click', () => {
    document.querySelectorAll('.transcript-checkbox').forEach(cb => cb.checked = false);
  });
  
  // Import selected transcripts
  document.getElementById('importSelectedBtn')?.addEventListener('click', async () => {
    const selected = [];
    document.querySelectorAll('.transcript-checkbox:checked').forEach(cb => {
      const idx = parseInt(cb.getAttribute('data-idx'));
      if (window.recallTranscripts && window.recallTranscripts[idx]) {
        const t = window.recallTranscripts[idx];
        if (t.full_transcript) {
          selected.push({
            title: t.title,
            content: t.full_transcript,
            source: 'recall'
          });
        }
      }
    });
    
    if (selected.length === 0) {
      window.showToast && window.showToast('No transcripts selected');
      return;
    }
    
    const btn = document.getElementById('importSelectedBtn');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i data-lucide="loader" class="icon spinning"></i> Importing...';
    btn.disabled = true;
    
    try {
      const response = await fetch('/api/transcript-import-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcripts: selected })
      });
      
      const result = await response.json();
      
      if (result.success) {
        window.showToast && window.showToast(`Imported ${result.imported} transcript(s)`);
        setTimeout(() => {
          location.hash = 'meetings/hub';
        }, 1500);
      } else {
        window.showToast && window.showToast(`Import failed: ${result.error}`);
      }
    } catch (e) {
      window.showToast && window.showToast(`Error: ${e.message}`);
    } finally {
      btn.innerHTML = originalText;
      btn.disabled = false;
      lucide.createIcons();
    }
  });
}

// Helper functions for Recall browser
window.viewFullTranscript = (idx) => {
  const transcript = window.recallTranscripts?.[idx];
  if (!transcript) return;
  
  const modal = document.createElement('div');
  modal.style.cssText = `
    position: fixed; inset: 0; background: rgba(0,0,0,0.8); 
    z-index: 1000; display: flex; align-items: center; justify-content: center;
  `;
  
  modal.innerHTML = `
    <div style="background: var(--panel); border-radius: 12px; max-width: 90%; max-height: 90%; 
                overflow: hidden; display: flex; flex-direction: column;">
      <div style="padding: 16px; border-bottom: 1px solid var(--border); display: flex; justify-content: space-between;">
        <h3 style="margin: 0;">${transcript.title}</h3>
        <button onclick="this.closest('div[style*=fixed]').remove()" style="background: none; border: none; cursor: pointer; font-size: 24px;">×</button>
      </div>
      <div style="padding: 16px; overflow-y: auto; max-height: 70vh;">
        <pre style="white-space: pre-wrap; font-family: monospace; font-size: 13px; line-height: 1.6;">
${transcript.full_transcript || 'No transcript available'}
        </pre>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
};

window.copyTranscript = async (idx) => {
  const transcript = window.recallTranscripts?.[idx];
  if (!transcript?.full_transcript) return;
  
  try {
    await navigator.clipboard.writeText(transcript.full_transcript);
    window.showToast && window.showToast('Transcript copied to clipboard');
  } catch (e) {
    window.showToast && window.showToast('Failed to copy transcript');
  }
};

// Transcript List View - Direct from Recall API
async function renderTranscriptList(root) {
  root.innerHTML = `
    <div class="content-head">
      <div class="title">
        <i data-lucide="list" class="icon"></i>
        Transcript List (Direct API)
      </div>
      <button class="button ghost" id="backToHub" style="margin-left:12px">
        <i data-lucide="arrow-left" class="icon"></i> Back to Hub
      </button>
      <button class="button primary" id="refreshTranscriptsBtn" style="margin-left:auto">
        <i data-lucide="refresh-cw" class="icon"></i> Refresh
      </button>
    </div>
    <div class="content-body">
      <div style="padding: 24px;">
        <div id="transcriptLoading" style="text-align: center; padding: 48px;">
          <div class="loading">Fetching transcripts from Recall API...</div>
        </div>
        
        <div id="transcriptContent" style="display: none;">
          <div style="margin-bottom: 24px; padding: 16px; background: var(--panel-1); border-radius: 8px;">
            <h3 style="margin: 0 0 8px 0;">Available Transcripts</h3>
            <p style="margin: 0; color: var(--muted); font-size: 13px;">
              Using /api/v1/transcript/ endpoint directly
            </p>
          </div>
          
          <div id="transcriptListContainer">
            <!-- Transcripts will be loaded here -->
          </div>
        </div>
        
        <div id="transcriptError" style="display: none; text-align: center; padding: 48px;">
          <i data-lucide="alert-circle" style="width: 48px; height: 48px; color: var(--danger);"></i>
          <h3>Failed to load transcripts</h3>
          <p id="errorMsg" style="color: var(--muted);"></p>
          <div id="debugInfo" style="margin-top: 16px; padding: 16px; background: var(--panel-2); border-radius: 8px; text-align: left; font-family: monospace; font-size: 12px; max-width: 600px; margin-left: auto; margin-right: auto;">
          </div>
        </div>
      </div>
    </div>
  `;
  
  lucide.createIcons();
  
  // Load transcripts
  loadTranscripts();
  
  // Event handlers
  document.getElementById('backToHub')?.addEventListener('click', () => {
    location.hash = 'meetings/hub';
  });
  
  document.getElementById('refreshTranscriptsBtn')?.addEventListener('click', () => {
    loadTranscripts();
  });
  
  async function loadTranscripts() {
    const loadingEl = document.getElementById('transcriptLoading');
    const contentEl = document.getElementById('transcriptContent');
    const errorEl = document.getElementById('transcriptError');
    
    loadingEl.style.display = 'block';
    contentEl.style.display = 'none';
    errorEl.style.display = 'none';
    
    try {
      const response = await fetch('/api/recall-transcript-list');
      const data = await response.json();
      
      console.log('Transcript List API response:', data);
      
      if (!data.success) {
        throw new Error(data.error || 'Failed to load transcripts');
      }
      
      const transcripts = data.transcripts || [];
      const container = document.getElementById('transcriptListContainer');
      
      if (transcripts.length === 0) {
        container.innerHTML = `
          <div style="text-align: center; padding: 48px; color: var(--muted);">
            <i data-lucide="file-x" style="width: 48px; height: 48px;"></i>
            <h3>No transcripts found</h3>
            <p>The /api/v1/transcript/ endpoint returned no results</p>
            <div style="margin-top: 16px; padding: 12px; background: var(--panel-2); border-radius: 8px;">
              <strong>Debug Info:</strong><br>
              Base URL: ${data.debug?.base || 'unknown'}<br>
              Endpoint: ${data.debug?.endpoint || 'unknown'}<br>
              Attempts: ${data.debug?.attempts?.length || 0}
            </div>
          </div>
        `;
      } else {
        container.innerHTML = `
          <div style="margin-bottom: 16px; padding: 12px; background: var(--success-bg); border-radius: 8px;">
            ✅ Found ${transcripts.length} transcript(s) from Recall API
          </div>
          <div style="display: grid; gap: 16px;">
            ${transcripts.map((t, idx) => `
              <div class="transcript-card" style="border: 1px solid var(--border); border-radius: 12px; padding: 16px; background: var(--panel-1);">
                <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 12px;">
                  <div>
                    <h4 style="margin: 0 0 4px 0; color: var(--primary);">
                      ${t.title || 'Untitled Transcript'}
                    </h4>
                    <div style="font-size: 12px; color: var(--muted);">
                      ID: ${t.id}<br>
                      Recording ID: ${t.recording_id || 'N/A'}<br>
                      Created: ${new Date(t.created_at).toLocaleString()}<br>
                      Status: ${t.status}
                    </div>
                  </div>
                  <span class="badge ${t.has_transcript ? 'success' : 'warning'}" 
                        style="padding: 6px 10px; border-radius: 6px; font-size: 12px;">
                    ${t.has_transcript ? '✅ Has Content' : '⚠️ No Content'}
                  </span>
                </div>
                
                ${t.meeting_url ? `
                  <div style="font-size: 12px; color: var(--muted); margin-bottom: 12px;">
                    🔗 ${t.meeting_url}
                  </div>
                ` : ''}
                
                ${t.transcript_preview ? `
                  <div style="margin-bottom: 12px;">
                    <div style="font-weight: 600; margin-bottom: 6px; font-size: 13px;">Preview:</div>
                    <div style="background: var(--panel-2); padding: 12px; border-radius: 6px; font-size: 12px; line-height: 1.5; max-height: 150px; overflow: auto;">
                      <pre style="white-space: pre-wrap; margin: 0; font-family: inherit;">
${t.transcript_preview}
                      </pre>
                    </div>
                    <div style="font-size: 11px; color: var(--muted); margin-top: 4px;">
                      📝 ${t.transcript_length} characters total
                    </div>
                  </div>
                ` : `
                  <div style="padding: 12px; background: var(--panel-2); border-radius: 6px; color: var(--muted); font-size: 12px;">
                    No transcript content available
                  </div>
                `}
                
                <div style="display: flex; gap: 8px;">
                  ${t.has_transcript ? `
                    <button class="button sm primary" onclick="importTranscriptDirect('${t.id}', ${idx})">
                      <i data-lucide="download" class="icon"></i> Import to Meetings
                    </button>
                  ` : ''}
                  <button class="button sm ghost" onclick="viewTranscriptDebug(${idx})">
                    <i data-lucide="code" class="icon"></i> View Debug
                  </button>
                </div>
              </div>
            `).join('')}
          </div>
        `;
      }
      
      loadingEl.style.display = 'none';
      contentEl.style.display = 'block';
      lucide.createIcons();
      
      // Store for access
      window.transcriptListData = transcripts;
      
    } catch (error) {
      loadingEl.style.display = 'none';
      errorEl.style.display = 'block';
      document.getElementById('errorMsg').textContent = error.message;
      document.getElementById('debugInfo').innerHTML = `
        <strong>Error Details:</strong><br>
        ${error.message}<br><br>
        <strong>Stack:</strong><br>
        ${error.stack || 'No stack trace'}
      `;
    }
  }
}

// Helper functions for Transcript List
window.importTranscriptDirect = async (transcriptId, idx) => {
  const transcript = window.transcriptListData?.[idx];
  if (!transcript?.full_transcript) {
    alert('No transcript content to import');
    return;
  }
  
  const btn = event.target.closest('button');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<i data-lucide="loader" class="icon spinning"></i> Importing...';
  }
  
  try {
    const response = await fetch('/api/transcript-import-direct', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: transcript.title || `Transcript ${transcriptId}`,
        content: transcript.full_transcript,
        source: 'recall-api'
      })
    });
    
    const result = await response.json();
    
    if (result.success) {
      alert('Transcript imported successfully!');
      setTimeout(() => {
        location.hash = 'meetings/hub';
      }, 1500);
    } else {
      alert(`Import failed: ${result.error || 'Unknown error'}`);
      console.error('Import error:', result);
    }
  } catch (e) {
    alert(`Error: ${e.message}`);
    console.error('Import exception:', e);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i data-lucide="download" class="icon"></i> Import to Meetings';
    }
  }
};

window.viewTranscriptDebug = (idx) => {
  const transcript = window.transcriptListData?.[idx];
  if (!transcript) return;
  
  const modal = document.createElement('div');
  modal.style.cssText = `
    position: fixed; inset: 0; background: rgba(0,0,0,0.8); 
    z-index: 1000; display: flex; align-items: center; justify-content: center;
  `;
  
  modal.innerHTML = `
    <div style="background: var(--panel); border-radius: 12px; max-width: 90%; max-height: 90%; 
                overflow: hidden; display: flex; flex-direction: column;">
      <div style="padding: 16px; border-bottom: 1px solid var(--border); display: flex; justify-content: space-between;">
        <h3 style="margin: 0;">Debug Info - Transcript ${transcript.id}</h3>
        <button onclick="this.closest('div[style*=fixed]').remove()" style="background: none; border: none; cursor: pointer; font-size: 24px;">×</button>
      </div>
      <div style="padding: 16px; overflow-y: auto; max-height: 70vh;">
        <pre style="white-space: pre-wrap; font-family: monospace; font-size: 12px; line-height: 1.4;">
${JSON.stringify(transcript, null, 2)}
        </pre>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
};

// Bot List View - Fetch bots and their transcripts
async function renderBotList(root) {
  root.innerHTML = `
    <div class="content-head">
      <div class="title">
        <i data-lucide="bot" class="icon"></i>
        Bot List (with Transcripts)
      </div>
      <button class="button ghost" id="backToHub" style="margin-left:12px">
        <i data-lucide="arrow-left" class="icon"></i> Back to Hub
      </button>
      <button class="button primary" id="refreshBotsBtn" style="margin-left:auto">
        <i data-lucide="refresh-cw" class="icon"></i> Refresh
      </button>
    </div>
    <div class="content-body">
      <div style="padding: 24px;">
        <div id="botLoading" style="text-align: center; padding: 48px;">
          <div class="loading">Fetching bots and transcripts...</div>
        </div>
        
        <div id="botContent" style="display: none;">
          <div style="margin-bottom: 24px; padding: 16px; background: var(--panel-1); border-radius: 8px;">
            <h3 style="margin: 0 0 8px 0;">Bot List with Full Details</h3>
            <p style="margin: 0; color: var(--muted); font-size: 13px;">
              Fetching each bot individually to get transcript data
            </p>
          </div>
          
          <div id="botListContainer">
            <!-- Bots will be loaded here -->
          </div>
        </div>
        
        <div id="botError" style="display: none; text-align: center; padding: 48px;">
          <i data-lucide="alert-circle" style="width: 48px; height: 48px; color: var(--danger);"></i>
          <h3>Failed to load bots</h3>
          <p id="errorMsg" style="color: var(--muted);"></p>
        </div>
      </div>
    </div>
  `;
  
  lucide.createIcons();
  
  // Load bots
  loadBots();
  
  // Event handlers
  document.getElementById('backToHub')?.addEventListener('click', () => {
    location.hash = 'meetings/hub';
  });
  
  document.getElementById('refreshBotsBtn')?.addEventListener('click', () => {
    loadBots();
  });
  
  async function loadBots() {
    const loadingEl = document.getElementById('botLoading');
    const contentEl = document.getElementById('botContent');
    const errorEl = document.getElementById('botError');
    
    loadingEl.style.display = 'block';
    contentEl.style.display = 'none';
    errorEl.style.display = 'none';
    
    try {
      const response = await fetch('/api/recall-bot-list');
      const data = await response.json();
      
      console.log('Bot List API response:', data);
      
      if (!data.success) {
        throw new Error(data.error || 'Failed to load bots');
      }
      
      const bots = data.bots || [];
      const container = document.getElementById('botListContainer');
      
      if (bots.length === 0) {
        container.innerHTML = `
          <div style="text-align: center; padding: 48px; color: var(--muted);">
            <i data-lucide="bot" style="width: 48px; height: 48px;"></i>
            <h3>No bots found</h3>
            <p>Send a Recall bot to a meeting first</p>
          </div>
        `;
      } else {
        const withTranscripts = bots.filter(b => b.has_transcript).length;
        
        container.innerHTML = `
          <div style="margin-bottom: 16px; padding: 12px; background: var(--info-bg); border-radius: 8px;">
            📊 Found ${bots.length} bot(s) | ${withTranscripts} with transcripts | ${data.transcripts_found} transcripts total
          </div>
          <div style="display: grid; gap: 16px;">
            ${bots.map((bot, idx) => `
              <div class="bot-card" style="border: 1px solid var(--border); border-radius: 12px; padding: 16px; background: var(--panel-1);">
                <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 12px;">
                  <div>
                    <h4 style="margin: 0 0 4px 0; color: var(--primary);">
                      ${bot.meeting_title}
                    </h4>
                    <div style="font-size: 12px; color: var(--muted);">
                      Bot ID: ${bot.id}<br>
                      Status: <span class="${bot.status === 'done' ? 'success' : 'warning'}">${bot.status}</span><br>
                      Created: ${new Date(bot.created_at).toLocaleString()}<br>
                      ${bot.participants ? `Participants: ${bot.participants}<br>` : ''}
                      ${bot.recording_id ? `Recording ID: ${bot.recording_id}<br>` : ''}
                      ${bot.transcript_id ? `Transcript ID: ${bot.transcript_id}<br>` : ''}
                      ${bot.video_url ? '🎥 Has video<br>' : ''}
                      ${bot.chat_messages > 0 ? `💬 ${bot.chat_messages} chat messages<br>` : ''}
                    </div>
                  </div>
                  <div style="text-align: right;">
                    <span class="badge ${bot.has_transcript ? 'success' : 'warning'}" 
                          style="padding: 6px 10px; border-radius: 6px; font-size: 12px;">
                      ${bot.has_transcript ? '✅ Has Transcript' : '⚠️ No Transcript'}
                    </span>
                    ${bot.transcript_structure ? `
                      <div style="margin-top: 8px; font-size: 11px; color: var(--muted);">
                        Type: ${bot.transcript_structure.type}<br>
                        ${bot.transcript_structure.length ? `Length: ${bot.transcript_structure.length}<br>` : ''}
                        ${bot.transcript_structure.source ? `Source: ${bot.transcript_structure.source}` : ''}
                      </div>
                    ` : ''}
                  </div>
                </div>
                
                ${bot.meeting_url ? `
                  <div style="font-size: 12px; color: var(--muted); margin-bottom: 12px;">
                    🔗 ${bot.meeting_url}
                  </div>
                ` : ''}
                
                ${bot.transcript_preview ? `
                  <div style="margin-bottom: 12px;">
                    <div style="font-weight: 600; margin-bottom: 6px; font-size: 13px;">Transcript Preview:</div>
                    <div style="background: var(--panel-2); padding: 12px; border-radius: 6px; font-size: 12px; line-height: 1.5; max-height: 150px; overflow: auto;">
                      <pre style="white-space: pre-wrap; margin: 0; font-family: inherit;">
${bot.transcript_preview}
                      </pre>
                    </div>
                    <div style="font-size: 11px; color: var(--muted); margin-top: 4px;">
                      📝 ${bot.transcript_length} characters total
                    </div>
                  </div>
                ` : bot.has_transcript ? `
                  <div style="padding: 12px; background: var(--warning-bg); border-radius: 6px; font-size: 12px;">
                    ⚠️ Transcript exists but appears empty
                  </div>
                ` : `
                  <div style="padding: 12px; background: var(--panel-2); border-radius: 6px; color: var(--muted); font-size: 12px;">
                    No transcript available for this bot
                  </div>
                `}
                
                <div style="display: flex; gap: 8px;">
                  ${bot.has_transcript && bot.transcript_length > 0 ? `
                    <button class="button sm primary" onclick="importBotTranscript('${bot.id}', ${idx})">
                      <i data-lucide="download" class="icon"></i> Import Transcript
                    </button>
                    <button class="button sm" onclick="viewBotTranscript(${idx})">
                      <i data-lucide="eye" class="icon"></i> View Full
                    </button>
                  ` : ''}
                  <button class="button sm ghost" onclick="viewBotDebug(${idx})">
                    <i data-lucide="code" class="icon"></i> Debug Info
                  </button>
                </div>
              </div>
            `).join('')}
          </div>
        `;
      }
      
      loadingEl.style.display = 'none';
      contentEl.style.display = 'block';
      lucide.createIcons();
      
      // Store for access
      window.botListData = bots;
      
    } catch (error) {
      loadingEl.style.display = 'none';
      errorEl.style.display = 'block';
      document.getElementById('errorMsg').textContent = error.message;
    }
  }
}

// Helper functions for Bot List
window.importBotTranscript = async (botId, idx) => {
  const bot = window.botListData?.[idx];
  if (!bot?.full_transcript) {
    alert('No transcript content to import');
    return;
  }
  
  const btn = event.target.closest('button');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<i data-lucide="loader" class="icon spinning"></i> Importing...';
  }
  
  try {
    const response = await fetch('/api/transcript-import-direct', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: bot.meeting_title || `Bot ${botId}`,
        content: bot.full_transcript,
        source: 'Recall'
      })
    });
    
    const result = await response.json();
    
    if (result.success) {
      alert('Transcript imported successfully!');
      setTimeout(() => {
        location.hash = 'meetings/hub';
      }, 1500);
    } else {
      alert(`Import failed: ${result.error || 'Unknown error'}`);
      console.error('Import error:', result);
    }
  } catch (e) {
    alert(`Error: ${e.message}`);
    console.error('Import exception:', e);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i data-lucide="download" class="icon"></i> Import Transcript';
    }
  }
};

window.viewBotTranscript = (idx) => {
  const bot = window.botListData?.[idx];
  if (!bot?.full_transcript) return;
  
  const modal = document.createElement('div');
  modal.style.cssText = `
    position: fixed; inset: 0; background: rgba(0,0,0,0.8); 
    z-index: 1000; display: flex; align-items: center; justify-content: center;
  `;
  
  modal.innerHTML = `
    <div style="background: var(--panel); border-radius: 12px; max-width: 90%; max-height: 90%; 
                overflow: hidden; display: flex; flex-direction: column;">
      <div style="padding: 16px; border-bottom: 1px solid var(--border); display: flex; justify-content: space-between;">
        <h3 style="margin: 0;">${bot.meeting_title}</h3>
        <button onclick="this.closest('div[style*=fixed]').remove()" style="background: none; border: none; cursor: pointer; font-size: 24px;">×</button>
      </div>
      <div style="padding: 16px; overflow-y: auto; max-height: 70vh;">
        <pre style="white-space: pre-wrap; font-family: inherit; font-size: 13px; line-height: 1.6;">
${bot.full_transcript}
        </pre>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
};

window.viewBotDebug = (idx) => {
  const bot = window.botListData?.[idx];
  if (!bot) return;
  
  const modal = document.createElement('div');
  modal.style.cssText = `
    position: fixed; inset: 0; background: rgba(0,0,0,0.8); 
    z-index: 1000; display: flex; align-items: center; justify-content: center;
  `;
  
  modal.innerHTML = `
    <div style="background: var(--panel); border-radius: 12px; max-width: 90%; max-height: 90%; 
                overflow: hidden; display: flex; flex-direction: column;">
      <div style="padding: 16px; border-bottom: 1px solid var(--border); display: flex; justify-content: space-between;">
        <h3 style="margin: 0;">Debug Info - Bot ${bot.id}</h3>
        <button onclick="this.closest('div[style*=fixed]').remove()" style="background: none; border: none; cursor: pointer; font-size: 24px;">×</button>
      </div>
      <div style="padding: 16px; overflow-y: auto; max-height: 70vh;">
        <pre style="white-space: pre-wrap; font-family: monospace; font-size: 12px; line-height: 1.4;">
${JSON.stringify(bot, null, 2)}
        </pre>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
};

window.copyToClipboard = async (noteId) => {
  const content = document.getElementById(`content-${noteId}`);
  if (content) {
    try {
      await navigator.clipboard.writeText(content.textContent);
      window.showToast && window.showToast('Copied to clipboard');
    } catch (e) {
      window.showToast && window.showToast('Failed to copy');
    }
  }
};

window.downloadNote = (noteId, title) => {
  const content = document.getElementById(`content-${noteId}`);
  if (content) {
    const blob = new Blob([content.textContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title || 'meeting'}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }
};

window.filterMeetings = () => {
  const filter = document.getElementById('meetingFilter').value.toLowerCase();
  const items = document.querySelectorAll('.meeting-item');
  items.forEach(item => {
    const title = item.getAttribute('data-title') || '';
    item.style.display = title.includes(filter) ? 'block' : 'none';
  });
};

window.sortMeetings = () => {
  const sortBy = document.getElementById('sortBy').value;
  const container = document.getElementById('filteredNotes');
  const items = Array.from(container.children);
  
  items.sort((a, b) => {
    switch(sortBy) {
      case 'date-asc': return new Date(a.querySelector('.meeting-header div div').textContent.split(' •')[0]) - new Date(b.querySelector('.meeting-header div div').textContent.split(' •')[0]);
      case 'title': return a.getAttribute('data-title').localeCompare(b.getAttribute('data-title'));
      case 'size': return parseInt(b.querySelector('.meeting-header div div').textContent.split(' • ')[1]) - parseInt(a.querySelector('.meeting-header div div').textContent.split(' • ')[1]);
      default: return new Date(b.querySelector('.meeting-header div div').textContent.split(' •')[0]) - new Date(a.querySelector('.meeting-header div div').textContent.split(' •')[0]);
    }
  });
  
  items.forEach(item => container.appendChild(item));
};

window.searchMeetings = (query) => {
  document.getElementById('meetingSearchInput').value = query;
  performMeetingSearch();
};

async function performMeetingSearch() {
  const query = document.getElementById('meetingSearchInput').value.toLowerCase().trim();
  const results = document.getElementById('searchResults');
  
  if (!query) {
    results.innerHTML = `
      <div style="text-align: center; color: var(--muted); padding: 40px;">
        <i data-lucide="search" style="width: 48px; height: 48px; margin-bottom: 16px;"></i>
        <div>Enter a search term to find specific meetings</div>
      </div>
    `;
    lucide.createIcons();
    return;
  }
  
  results.innerHTML = '<div class="loading">Searching...</div>';
  
  try {
    // Fetch meeting data from backend API
    const response = await fetch('/api/meetings-data');
    const data = await response.json();
    
    if (!data.success) {
      throw new Error(data.message || 'Failed to load meetings');
    }
    
    const notes = data.notes || [];
    
    const filtered = notes.filter(note => 
      (note.title || '').toLowerCase().includes(query) ||
      (note.content || '').toLowerCase().includes(query) ||
      new Date(note.created_at).toLocaleDateString().includes(query)
    );
    
    if (filtered.length > 0) {
      results.innerHTML = `
        <div style="margin-bottom: 16px; color: var(--muted);">
          Found ${filtered.length} result${filtered.length === 1 ? '' : 's'} for "${query}"
        </div>
        ${filtered.map(note => {
          const titleMatch = (note.title || '').toLowerCase().includes(query);
          const contentMatch = (note.content || '').toLowerCase().includes(query);
          let snippet = '';
          
          if (contentMatch) {
            const index = (note.content || '').toLowerCase().indexOf(query);
            const start = Math.max(0, index - 100);
            const end = Math.min((note.content || '').length, index + 200);
            snippet = (note.content || '').substring(start, end);
            snippet = snippet.replace(new RegExp(`(${query})`, 'gi'), '<mark>$1</mark>');
          }
          
          return `
            <div class="search-result" style="padding: 16px; border: 1px solid var(--border); border-radius: 8px; margin-bottom: 12px;">
              <h4 style="margin: 0 0 8px 0;">
                ${titleMatch ? (note.title || '').replace(new RegExp(`(${query})`, 'gi'), '<mark>$1</mark>') : (note.title || 'Untitled')}
              </h4>
              <div style="font-size: 12px; color: var(--muted); margin-bottom: 8px;">
                ${new Date(note.created_at).toLocaleString()}
              </div>
              ${snippet ? `<div style="font-size: 14px; line-height: 1.4;">...${snippet}...</div>` : ''}
              <button class="button sm" style="margin-top: 8px;" onclick="viewFullNote('${note.id}')">View Full Note</button>
            </div>
          `;
        }).join('')}
      `;
    } else {
      results.innerHTML = `
        <div style="text-align: center; color: var(--muted); padding: 40px;">
          <i data-lucide="search-x" style="width: 48px; height: 48px; margin-bottom: 16px;"></i>
          <div>No results found for "${query}"</div>
          <div style="font-size: 14px; margin-top: 8px;">Try a different search term</div>
        </div>
      `;
    }
    
    lucide.createIcons();
  } catch (error) {
    results.innerHTML = `
      <div class="error" style="color: var(--danger); padding: 16px;">
        Search error: ${error.message}
      </div>
    `;
  }
}

window.viewFullNote = (noteId) => {
  // Navigate to the meetings space and highlight the specific note
  const meetingsId = localStorage.getItem('hive_meetings_space_id') || '';
  window.hiveFocusNoteId = noteId;
  location.hash = `space/${meetingsId}`;
};

function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
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
  else if (hash === 'meetings/hub'){
    await renderMeetingsHub(content);
    await renderSpacesList();
  }
  else if (hash === 'meetings/import'){
    await renderTranscriptImport(content);
    await renderSpacesList();
  }
  else if (hash === 'meetings/batch'){
    await renderBatchImport(content);
    await renderSpacesList();
  }
  else if (hash === 'meetings/recall'){
    await renderRecallBrowser(content);
    await renderSpacesList();
  }
  else if (hash === 'transcripts'){
    await renderTranscriptList(content);
    await renderSpacesList();
  }
  else if (hash === 'bots'){
    await renderBotList(content);
    await renderSpacesList();
  }
  else { 
    await renderLibrary(); 
  }
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
