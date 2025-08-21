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
  root.innerHTML = `
    <div class="content-head">
      <div class="title">
        <i data-lucide="calendar" class="icon"></i>
        Meetings Hub
      </div>
      <button class="button ghost" id="backToLibrary" style="margin-left:12px"><i data-lucide="arrow-left" class="icon"></i> Back to Library</button>
      <button class="button primary" id="syncRecallBtn" style="margin-left:8px">
        <i data-lucide="refresh-cw" class="icon"></i> Sync Recall
      </button>
      <button class="button ghost" id="debugBtn" style="margin-left:8px" title="Debug APIs">
        🐛 Debug
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
    
    if (!data.success) {
      throw new Error(data.message || 'Failed to load meetings');
    }
    
    const notes = data.notes || [];
    
    const hubContent = document.getElementById('meetingsHubContent');
    if (notes && notes.length > 0) {
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
              <div style="font-size: 28px; font-weight: 700; color: var(--accent);">${notes.filter(n => n.title?.includes('Recall')).length}</div>
              <div style="color: var(--muted); font-size: 14px;">Recall Transcripts</div>
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
                    <div>
                      <div style="font-weight:700; margin-bottom:6px;">🧠 Summary</div>
                      <div id="summary-${note.id}" style="font-size:14px; line-height:1.5; background: var(--panel-2); padding: 10px; border-radius: 6px; min-height: 80px;">
                        Generating summary...
                      </div>
                    </div>
                  </div>
                </div>
                <div id="meeting-full-${note.id}" class="meeting-full" style="display: none; padding: 16px; background: var(--background); border-top: 1px solid var(--border);">
                  <div style="max-height: 420px; overflow-y: auto; padding-right: 8px;">
                    ${formatTranscriptContent(note.content, false)}
                  </div>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      `;
      
      // Add functionality
      setupMeetingsHubInteractions();
      // Fetch summaries async
      (async()=>{
        for (const n of notes){
          try{ await fetchAndRenderSummary(n.id, n.title, n.content); }catch{}
        }
      })();
      
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
- Mistral: ${results.env?.MISTRAL ? '✅' : '❌'}
- Recall: ${results.env?.RECALL ? '✅' : '❌'}
- Deepgram: ${results.env?.DEEPGRAM_API_KEY ? '✅' : '❌'}

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
      // Call the manual sync endpoint
      const response = await fetch('/api/recall-sync-manual', {
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
  }
};

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

// Server summary using Mistral via backend proxy (simple fetch to edge if available)
async function fetchAndRenderSummary(noteId, title, content){
  const el = document.getElementById(`summary-${noteId}`);
  if (!el) return;
  try{
    const resp = await fetch('/api/summarize-mistral', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ title, content }) });
    if (!resp.ok) throw new Error('summary_failed');
    const j = await resp.json();
    const summary = j.summary || '';
    el.textContent = summary || 'No summary available';
    // Persist once server-side for re-use
    try{ await fetch('/api/save-summary', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ id: noteId, summary }) }); }catch{}
  }catch{
    // Client fallback quick heuristic summary
    try{
      const txt = typeof content==='string' ? content : JSON.stringify(content);
      const parsed = formatTranscriptContent(txt, false).replace(/<[^>]+>/g,'');
      el.textContent = (parsed.split(/\n+/).slice(0,3).join(' ').substring(0,500)) || '—';
      try{ await fetch('/api/save-summary', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ id: noteId, summary: el.textContent }) }); }catch{}
    }catch{ el.textContent = '—'; }
  }
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
