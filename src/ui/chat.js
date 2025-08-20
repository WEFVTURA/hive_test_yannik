import { ragSearch } from '../lib/rag.js';
import { util_getEnv, db_listSpaces } from '../lib/supabase.js';
import { getPrefs } from './settings.js';
import { getSupabase } from '../lib/supabase.js';
import { marked } from 'https://cdn.jsdelivr.net/npm/marked@12/+esm';
import { listChats, saveChat, deleteChat, getChat } from '../lib/chatStore.js';

export function renderChat(root){
  const prefs = getPrefs();
  const savedWidth = localStorage.getItem('hive_chat_width');
  if (savedWidth) document.documentElement.style.setProperty('--chatWidth', savedWidth+'px');
  root.innerHTML = `
    <div class="chat-root">
      <div class="panel" style="padding:12px; border-radius:12px; border:1px solid var(--border); background:var(--panel-2); height:100%; overflow:auto" id="chatMessages"></div>
      <div class="rag-debug" id="ragDebug" style="margin-top:10px; padding:10px; background:var(--panel-2); border:1px dashed var(--border); border-radius:10px; color:var(--muted); font-size:12px; max-height:180px; overflow:auto; display:none"></div>
      <div class="composer panel">
        <div class="composer-head" style="padding:12px 14px; border-bottom:1px solid var(--border); background:var(--panel-2); display:flex; align-items:center; justify-content:space-between">
          <div style="display:flex; align-items:center; gap:10px">
            <span>Ask Hive assistant</span>
            <span id="activeModelIndicator" style="display:none; background:var(--accent); color:white; padding:2px 8px; border-radius:12px; font-size:10px; font-weight:600; letter-spacing:0.5px"></span>
          </div>
          <div style="display:flex; gap:8px">
            <button class="button ghost" id="saveChatBtn" data-tip="Save"><i data-lucide="save" class="icon" aria-hidden="true"></i></button>
            <button class="button ghost" id="openChatBtn" data-tip="History"><i data-lucide="history" class="icon" aria-hidden="true"></i></button>
            <button class="button ghost" id="clearChatBtn" data-tip="Clear"><i data-lucide="eraser" class="icon" aria-hidden="true"></i></button>
            <button class="button ghost" id="hideChatBtn" data-tip="Hide">Hide</button>
          </div>
        </div>
        <div class="composer-body" style="padding:12px; display:grid; gap:8px">
          <div class="muted">context: <span id="chatScopeLabel">All Libraries</span></div>
          <div style="display:flex; gap:8px; align-items:center">
            <label class="muted" style="font-size:12px">Mode</label>
            <span class="select-wrap"><select id="queryMode" class="select">
              <option value="rag">RAG</option>
              <option value="direct">Direct (concat notes)</option>
              <option value="fts">FTS (BM25)</option>
              <option value="sql" selected>SQL (notes)</option>
              <option value="pplx">Deep Research</option>
            </select></span>
          </div>
          <div style="display:flex; gap:8px; align-items:center">
            <label class="muted" style="font-size:12px">Model</label>
            <span class="select-wrap"><select id="modelSelect" class="select">
              <option value="Mistral" ${prefs.defaultModel==='Mistral'?'selected':''}>Mistral</option>
              <option value="GPT-4o" ${prefs.defaultModel==='GPT-4o'?'selected':''}>GPT-4o</option>
              <option value="Perplexity" ${prefs.defaultModel==='Perplexity'?'selected':''}>Perplexity</option>
            </select></span>
            <button class="button ghost" id="toggleMoreModels" data-tip="More models via OpenRouter" style="padding:4px 8px; font-size:12px">+</button>
          </div>
          <div style="display:none; gap:8px; align-items:center" id="openRouterModelRow">
            <label class="muted" style="font-size:12px">OpenRouter Model</label>
            <span class="select-wrap" style="flex:1"><select id="openRouterModel" class="select" style="width:100%">
              <option value="anthropic/claude-3.5-sonnet">Claude 3.5 Sonnet</option>
              <option value="openai/gpt-4o">OpenAI GPT-4o</option>
              <option value="openai/gpt-4o-mini">OpenAI GPT-4o Mini</option>
              <option value="google/gemini-pro-1.5">Google Gemini Pro 1.5</option>
              <option value="meta-llama/llama-3.1-70b-instruct">Llama 3.1 70B</option>
              <option value="meta-llama/llama-3.1-405b-instruct">Llama 3.1 405B</option>
              <option value="mistralai/mistral-large">Mistral Large</option>
              <option value="mistralai/mistral-medium">Mistral Medium</option>
              <option value="perplexity/llama-3.1-sonar-large-128k-online">Perplexity Sonar Large</option>
              <option value="cohere/command-r-plus">Cohere Command R+</option>
              <option value="x-ai/grok-2">xAI Grok-2</option>
            </select></span>
          </div>
          <div style="display:flex; gap:8px; align-items:center">
            <label class="muted" style="font-size:12px">Search scope</label>
            <span class="select-wrap" style="flex:1"><select id="spaceScope" class="select" style="width:100%">
              <option value="ALL" ${prefs.defaultScope==='ALL'?'selected':''}>ALL</option>
            </select></span>
          </div>
          <div style="display:flex; gap:8px; align-items:center" id="researchModelRow">
            <label class="muted" style="font-size:12px">Research Model</label>
            <span class="select-wrap" style="flex:1"><select id="researchModel" class="select" style="width:100%">
              <option value="mistral" selected>Mistral AI</option>
              <option value="mistral-large">Mistral Large</option>
              <option value="openai">OpenAI GPT-4o</option>
              <option value="perplexity">Perplexity AI</option>
            </select></span>
          </div>
          <div class="input" style="display:flex; align-items:center; gap:10px; border:1px solid var(--border); background:var(--panel); border-radius:12px; padding:8px">
            <input id="chatInput" placeholder="Type your question" style="flex:1; background:transparent; border:0; color:var(--text); outline:none; padding:8px"/>
            <button class="button" id="askBtn">Ask</button>
          </div>
        </div>
      </div>
    </div>`;

  // Initialize Lucide icons for dynamically injected content
  try{ window.lucide && window.lucide.createIcons({ attrs: { width: 18, height: 18 } }); }catch{}

  const chatMessagesEl = root.querySelector('#chatMessages');
  const chatInput = root.querySelector('#chatInput');
  const clearBtn = root.querySelector('#clearChatBtn');
  const hideBtn = root.querySelector('#hideChatBtn');
  const ragDebugEl = root.querySelector('#ragDebug');
  const scopeSel = root.querySelector('#spaceScope');
  const saveBtn = root.querySelector('#saveChatBtn');
  const openBtn = root.querySelector('#openChatBtn');
  const researchModelRow = root.querySelector('#researchModelRow');
  const queryModeSelect = root.querySelector('#queryMode');
  const toggleMoreModelsBtn = root.querySelector('#toggleMoreModels');
  const openRouterModelRow = root.querySelector('#openRouterModelRow');
  let history = [];
  let model = prefs.defaultModel;
  let currentChatId = null;
  
  // Show/hide research model selector based on query mode
  function toggleResearchModelSelector() {
    const isResearchMode = queryModeSelect?.value === 'pplx';
    if (researchModelRow) {
      researchModelRow.style.display = isResearchMode ? 'flex' : 'none';
    }
    
    // Update model indicator
    updateActiveModelIndicator();
  }
  
  // Update active model indicator
  function updateActiveModelIndicator() {
    const activeModelIndicator = document.getElementById('activeModelIndicator');
    const queryMode = queryModeSelect?.value;
    const modelSelect = root.querySelector('#modelSelect');
    const researchModelSelect = root.querySelector('#researchModel');
    
    if (activeModelIndicator) {
      if (queryMode === 'pplx') {
        // Deep Research mode - show research model
        const selectedModel = researchModelSelect?.value || 'mistral';
        const modelNames = { mistral: 'Mistral AI', openai: 'OpenAI GPT-4o', perplexity: 'Perplexity AI', 'mistral-large': 'Mistral Large' };
        activeModelIndicator.textContent = modelNames[selectedModel] || selectedModel;
        activeModelIndicator.style.display = 'inline-block';
      } else if (queryMode === 'rag' || queryMode === 'fts' || queryMode === 'sql' || queryMode === 'direct') {
        // Regular chat modes - show chat model
        const selectedModel = modelSelect?.value || model;
        const openRouterSelect = root.querySelector('#openRouterModel');
        const isOpenRouterMode = openRouterModelRow && openRouterModelRow.style.display !== 'none';
        
        if (isOpenRouterMode && openRouterSelect) {
          // Show OpenRouter model name
          const selectedOpenRouterModel = openRouterSelect.value;
          const modelName = selectedOpenRouterModel.split('/').pop().replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
          activeModelIndicator.textContent = modelName;
        } else {
          // Show regular model names
          const modelNames = { 'Mistral': 'Mistral', 'GPT-4o': 'GPT-4o', 'Perplexity': 'Perplexity' };
          activeModelIndicator.textContent = modelNames[selectedModel] || selectedModel;
        }
        activeModelIndicator.style.display = 'inline-block';
      } else {
        activeModelIndicator.style.display = 'none';
      }
    }
  }
  
  // Initially set research model selector visibility
  toggleResearchModelSelector();
  
  // Initial model indicator update
  updateActiveModelIndicator();
  
  // Listen for query mode changes
  if (queryModeSelect) {
    queryModeSelect.addEventListener('change', toggleResearchModelSelector);
  }
  
  // Toggle OpenRouter models functionality
  if (toggleMoreModelsBtn) {
    toggleMoreModelsBtn.addEventListener('click', () => {
      const isVisible = openRouterModelRow.style.display !== 'none';
      openRouterModelRow.style.display = isVisible ? 'none' : 'flex';
      toggleMoreModelsBtn.textContent = isVisible ? '+' : '−';
      toggleMoreModelsBtn.setAttribute('data-tip', isVisible ? 'More models via OpenRouter' : 'Hide OpenRouter models');
      updateActiveModelIndicator();
    });
  }

  // Listen for model selector changes
  const modelSelect = root.querySelector('#modelSelect');
  const researchModelSelect = root.querySelector('#researchModel');
  const openRouterModelSelect = root.querySelector('#openRouterModel');
  
  if (modelSelect) {
    modelSelect.addEventListener('change', () => {
      model = modelSelect.value;
      updateActiveModelIndicator();
    });
  }
  
  if (researchModelSelect) {
    researchModelSelect.addEventListener('change', updateActiveModelIndicator);
  }
  
  if (openRouterModelSelect) {
    openRouterModelSelect.addEventListener('change', updateActiveModelIndicator);
  }

  // Ensure any legacy side hide button is removed
  try{ document.querySelectorAll('.chat-side-hide').forEach(el=>el.remove()); }catch{}

  (async()=>{
    const spaces = await db_listSpaces().catch(()=>[]);
    for (const sp of spaces){ const opt = document.createElement('option'); opt.value = sp.id; opt.textContent = sp.name; if(prefs.defaultScope===sp.id) opt.selected = true; scopeSel.appendChild(opt); }
  })();

  function renderMessages(){
    if (!history.length){ chatMessagesEl.innerHTML = '<div class="empty">No messages yet. Type below to start the conversation.</div>'; return; }
    chatMessagesEl.innerHTML = history.map(m=>{
      if(m.role==='assistant'){
        const inner = marked.parse(m.content||'');
        const cites = Array.isArray(m.citations) && m.citations.length
          ? `<div style="margin-top:8px"><div class="muted" style="font-size:12px">Sources</div><ul style="margin:6px 0 0 18px; padding:0">${m.citations.map(c=>`<li><a href="#" data-cite="${c.source_type}:${c.source_id}"><span class='muted'>${(c.similarity??0).toFixed(2)}</span> ${c.content.substring(0,160)}...</a></li>`).join('')}</ul></div>`
          : '';
        return `<div class="message assistant"><div class="md">${inner}</div>${cites}</div>`;
      }
      return `<div class="message ${m.role}">${m.content}</div>`;
    }).join(''); chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
    chatMessagesEl.querySelectorAll('[data-cite]').forEach(a=>{
      a.addEventListener('click', (e)=>{ e.preventDefault(); const [t,id]=a.getAttribute('data-cite').split(':'); if(t==='note'){ location.hash='space/'+(scopeSel.value||'')+'#note-'+id; } });
    });
  }

  clearBtn.addEventListener('click', ()=>{ history=[]; renderMessages(); });
  function hideChat(){ const appRoot=document.getElementById('appRoot'); const scrim=document.getElementById('scrim'); if(appRoot){ appRoot.classList.remove('chat-open'); appRoot.classList.add('chat-closed'); } if(scrim){ scrim.style.display='none'; } }
  hideBtn.addEventListener('click', hideChat);

  // Save/Open (Supabase)
  saveBtn.addEventListener('click', async ()=>{
    const title = prompt('Chat title?', 'Untitled chat');
    const saved = await (await import('../lib/supabase.js')).db_saveChat({ id: currentChatId, title, scope: scopeSel.value||'ALL', model, messages: history }).catch(()=>null);
    if(saved){ currentChatId = saved.id; }
  });
  openBtn.addEventListener('click', async ()=>{
    const { db_listChats, db_deleteChat } = await import('../lib/supabase.js');
    const list = await db_listChats().catch(()=>[]);
    if(!list.length){ alert('No saved chats'); return; }
    const { openListModal } = await import('./modals.js');
    await openListModal('Chat history', list, (c)=>`<div style=\"display:flex; align-items:center; justify-content:space-between; border:1px solid var(--border); border-radius:8px; padding:8px\"><div><div style=\"font-weight:600\">${c.title}</div><div class=\"muted\" style=\"font-size:12px\">${c.scope} · ${new Date(c.updated_at||c.created_at).toLocaleString()}</div></div><div style=\"display:flex; gap:6px\"><button class=\"button\" data-open=\"${c.id}\">Open</button><button class=\"button ghost\" data-del=\"${c.id}\">Delete</button></div></div>`);
    const scrim = document.getElementById('modalScrim');
    scrim.querySelectorAll('[data-open]').forEach(btn=>btn.addEventListener('click', async ()=>{
      const id = btn.getAttribute('data-open');
      const row = list.find(x=>x.id===id); if(!row) return;
      currentChatId = row.id; history = row.messages||[]; scrim.style.display='none'; scrim.setAttribute('aria-hidden','true'); renderMessages();
    }));
    scrim.querySelectorAll('[data-del]').forEach(btn=>btn.addEventListener('click', async ()=>{
      const id = btn.getAttribute('data-del'); await db_deleteChat(id).catch(()=>{}); btn.closest('div[style]')?.remove();
    }));
  });

  // Persist chat width when user resizes
  window.addEventListener('mouseup', ()=>{
    const cs = getComputedStyle(document.documentElement).getPropertyValue('--chatWidth');
    const px = parseInt(cs||'0'); if(px>0) localStorage.setItem('hive_chat_width', px);
  });

  async function callModel(prompt){
    const anon = util_getEnv('VITE_SUPABASE_ANON_KEY','VITE_SUPABASE_ANON_KEY') || util_getEnv('SUPABASE_ANON_KEY','SUPABASE_ANON_KEY');
    const started = performance.now();
    try{
      // Check if OpenRouter model is selected
      const isOpenRouterMode = openRouterModelRow && openRouterModelRow.style.display !== 'none';
      const openRouterSelect = root.querySelector('#openRouterModel');
      
      if (isOpenRouterMode && openRouterSelect) {
        // Use OpenRouter API
        const selectedModel = openRouterSelect.value;
        const openRouterKey = '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';
        
        const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${openRouterKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': window.location.origin,
            'X-Title': 'Hive Central Brain'
          },
          body: JSON.stringify({
            model: selectedModel,
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.7
          })
        });
        
        const j = await r.json();
        if (!r.ok) { throw new Error(j?.error?.message || 'OpenRouter error'); }
        if (ragDebugEl) { ragDebugEl.textContent += `\nModel latency: ${Math.round(performance.now()-started)}ms`; }
        return j.choices?.[0]?.message?.content || '';
      }
      
      if (model === 'Mistral'){
        const mistralKey = util_getEnv('VITE_MISTRAL_API_KEY','VITE_MISTRAL_API_KEY') || util_getEnv('MISTRAL_AI_API','MISTRAL_AI_API') || '';
        if (mistralKey) {
          const r = await fetch('https://api.mistral.ai/v1/chat/completions', { 
            method:'POST', 
            headers:{ 
              'Authorization': `Bearer ${mistralKey}`, 
              'Content-Type':'application/json' 
            }, 
            body: JSON.stringify({ 
              model:'mistral-medium-latest', 
              messages:[{role:'user',content:prompt}] 
            }) 
          });
          const j = await r.json(); 
          if(!r.ok){ throw new Error(j?.error?.message||'mistral error'); } 
          if(ragDebugEl){ ragDebugEl.textContent += `\nModel latency: ${Math.round(performance.now()-started)}ms`; } 
          return j.choices?.[0]?.message?.content||'';
        } else {
          console.warn('Mistral API key not found, falling back to OpenAI');
        }
      } else if (model === 'Perplexity') {
        const pplxKey = util_getEnv('VITE_PERPLEXITY','VITE_PERPLEXITY') || util_getEnv('PERPLEXITY','PERPLEXITY') || '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';
        if (pplxKey) {
          console.log(`[Perplexity] API Key length: ${pplxKey.length}, prefix: ${pplxKey.substring(0, 10)}...`);
          
          // Simplified request without problematic parameters
          const requestBody = {
            model: 'llama-3.1-sonar-small-128k-online',
            messages: [{ role: 'user', content: prompt }]
          };
          
          console.log(`[Perplexity] Request:`, requestBody);
          
          const r = await fetch('https://api.perplexity.ai/chat/completions', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${pplxKey}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestBody)
          });
          
          console.log(`[Perplexity] Response status: ${r.status} ${r.statusText}`);
          
          const j = await r.json();
          console.log(`[Perplexity] Response:`, j);
          
          if (!r.ok) { 
            console.error('[Perplexity] Error details:', j);
            throw new Error(j?.error?.message || j?.message || `Perplexity API error: ${r.status}`); 
          }
          if (ragDebugEl) { ragDebugEl.textContent += `\nModel latency: ${Math.round(performance.now()-started)}ms`; }
          return j.choices?.[0]?.message?.content || '';
        } else {
          console.warn('Perplexity API key not found, falling back to OpenAI');
        }
      }
      
      // Use OpenAI (or fallback for other models if no key)
      {
        const openaiKey = util_getEnv('VITE_OPENAI_API_KEY','VITE_OPENAI_API_KEY') || util_getEnv('OPEN_AI_API','OPEN_AI_API') || window.OPENAI_API_KEY || '';
        const r = await fetch('https://lmrnnfjuytygomdfujhs.supabase.co/functions/v1/openai-chat', { method:'POST', headers:{ 'Content-Type':'application/json', 'Authorization': `Bearer ${anon}`, 'apikey': anon }, body: JSON.stringify({ prompt, model:'gpt-4o-mini', openai_api_key: openaiKey }) });
        const j = await r.json(); if(!r.ok){ throw new Error(j?.error||'openai error'); } if(ragDebugEl){ ragDebugEl.textContent += `\nModel latency: ${Math.round(performance.now()-started)}ms`; } return j.reply||'';
      }
    }catch(e){ if(ragDebugEl){ ragDebugEl.textContent += `\nModel error: ${e}`; } throw e; }
  }

  async function buildDirectContext(scopeVal){
    const sb = getSupabase();
    let notes = [];
    if (scopeVal==='ALL'){
      const spaces = await db_listSpaces().catch(()=>[]);
      for (const sp of spaces){
        const { data } = await sb.from('notes').select('id,title,content,updated_at,space_id').eq('space_id', sp.id).order('updated_at', { ascending:false }).limit(100);
        notes = notes.concat(data||[]);
      }
    } else {
      const { data } = await sb.from('notes').select('id,title,content,updated_at,space_id').eq('space_id', scopeVal).order('updated_at', { ascending:false }).limit(300);
      notes = data||[];
    }
    const budget = Math.max(2000, prefs.contextBudget||16000);
    let used = 0; const chunks = [];
    for (const n of notes){
      const text = `# ${n.title||'Untitled'}\n${n.content||''}\n\n`;
      if (used + text.length > budget) break;
      chunks.push(text); used += text.length;
    }
    return chunks.join('');
  }

  async function queryViaFTS(scopeVal, question){
    const { fts_searchNotes } = await import('../lib/supabase.js');
    const limit = Math.max(1, prefs.topK||6);
    const space = scopeVal==='ALL' ? null : scopeVal;
    const rows = await fts_searchNotes(question, space, limit).catch(()=>[]);
    const context = rows.map(r=>`[${(r.similarity??0).toFixed(2)}] ${r.title||''} ${r.content||''}`).join('\n');
    if (ragDebugEl){ ragDebugEl.style.display='block'; ragDebugEl.textContent = `FTS mode | scope: ${scopeVal} | matches: ${rows.length}\n`; }
    const sys = prefs.contextOnly ? 'Answer ONLY using provided context. If nothing relevant, reply: "Information not found, try a different query".' : 'Prefer provided context; if none, answer briefly without fabricating citations.';
    return `${sys}\n\nContext:\n${context}\n\nQuestion: ${question}`;
  }

  async function queryViaSQL(scopeVal, question){
    const sb = getSupabase();
    let rows = [];
    if (scopeVal==='ALL'){
      const spaces = await db_listSpaces().catch(()=>[]);
      for (const sp of spaces){
        const { data } = await sb.from('notes').select('id,title,content,space_id,updated_at').eq('space_id', sp.id).order('updated_at', { ascending:false }).limit(200);
        rows = rows.concat(data||[]);
      }
    } else {
      const { data } = await sb.from('notes').select('id,title,content,space_id,updated_at').eq('space_id', scopeVal).order('updated_at', { ascending:false }).limit(500);
      rows = data||[];
    }
    const hay = rows.map(r=>`[${r.id}] ${r.title}\n${r.content}`).join('\n\n');
    const sys = 'Search the provided notes text for relevant passages. Quote note ids that support the answer.';
    return `${sys}\n\nNotes:\n${hay}\n\nQuestion: ${question}`;
  }

  async function submitQuestion(){
      const text = (chatInput.value||'').trim(); if(!text) return; chatInput.value='';
      history = history.concat([{ role:'user', content:text }]); renderMessages();
      const scopeVal = scopeSel ? scopeSel.value : 'ALL';
      const modeSel = root.querySelector('#queryMode');
      const qMode = modeSel ? modeSel.value : 'rag';

      let prompt;
      if (qMode==='direct' || prefs.directMode){
        const ctx = await buildDirectContext(scopeVal);
        const sys = 'Use the following project notes as authoritative context. If insufficient, say: "Information not found, try a different query".';
        prompt = `${sys}\n\nContext:\n${ctx}\n\nQuestion: ${text}`;
        if (ragDebugEl){ ragDebugEl.style.display='block'; ragDebugEl.textContent = `Direct mode | scope: ${scopeVal} | ctx chars: ${ctx.length}\n`; }
      } else if (qMode==='fts'){
        prompt = await queryViaFTS(scopeVal, text);
      } else if (qMode==='sql'){
        const sqlPrompt = await queryViaSQL(scopeVal, text);
        prompt = sqlPrompt;
        if (ragDebugEl){ ragDebugEl.style.display='block'; ragDebugEl.textContent = `SQL mode | scope: ${scopeVal} | length: ${sqlPrompt.length}`; }
      } else if (qMode==='pplx'){
        // Get selected research model from dropdown
        const researchModelSel = document.getElementById('researchModel');
        const selectedModel = researchModelSel ? researchModelSel.value : 'mistral';
        
        if (ragDebugEl){ ragDebugEl.style.display='block'; ragDebugEl.textContent = `Deep research using ${selectedModel.toUpperCase()}…`; }
        
        // Show active model indicator
        const activeModelIndicator = document.getElementById('activeModelIndicator');
        if (activeModelIndicator) {
          const modelNames = { mistral: 'Mistral AI', openai: 'OpenAI GPT-4o', perplexity: 'Perplexity AI' };
          activeModelIndicator.textContent = `🔍 ${modelNames[selectedModel] || selectedModel}`;
          activeModelIndicator.style.display = 'inline-block';
        }
        
        let reply = 'Error in deep research';
        
        try{
          if (selectedModel === 'perplexity') {
            // Perplexity API for Deep Research
            const pplxKey = util_getEnv('VITE_PERPLEXITY','VITE_PERPLEXITY') || util_getEnv('PERPLEXITY','PERPLEXITY') || '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';
            if (pplxKey) {
              console.log(`[Perplexity Research] API Key length: ${pplxKey.length}, prefix: ${pplxKey.substring(0, 10)}...`);
              
              // Simplified request - remove temperature and system message that might cause issues
              const requestBody = { 
                model: 'llama-3.1-sonar-small-128k-online',
                messages: [
                  { role: 'user', content: `Research this topic thoroughly: ${text}` }
                ]
              };
              
              console.log(`[Perplexity Research] Request:`, requestBody);
              
              const rr = await fetch('https://api.perplexity.ai/chat/completions', { 
                method: 'POST', 
                headers: { 
                  'Authorization': `Bearer ${pplxKey}`, 
                  'Content-Type': 'application/json' 
                }, 
                body: JSON.stringify(requestBody) 
              });
              
              console.log(`[Perplexity Research] Response status: ${rr.status} ${rr.statusText}`);
              
              const jj = await rr.json().catch(()=>({})); 
              console.log(`[Perplexity Research] Response:`, jj);
              
              if (rr.ok) {
                reply = (jj?.choices?.[0]?.message?.content) || reply;
              } else {
                console.error('[Perplexity Research] Error details:', jj);
                throw new Error(jj?.error?.message || jj?.message || `Perplexity API failed: ${rr.status}`);
              }
            } else {
              throw new Error('Perplexity API key not found');
            }
          } else if (selectedModel === 'openai') {
            // OpenAI via Supabase for Deep Research
            const openaiKey = util_getEnv('VITE_OPENAI_API_KEY','VITE_OPENAI_API_KEY') || util_getEnv('OPEN_AI_API','OPEN_AI_API') || '';
            const anon = util_getEnv('VITE_SUPABASE_ANON_KEY','VITE_SUPABASE_ANON_KEY') || util_getEnv('SUPABASE_ANON_KEY','SUPABASE_ANON_KEY');
            if (openaiKey && anon) {
              const researchPrompt = `Research this topic thoroughly and provide detailed analysis with multiple perspectives: ${text}`;
              const r = await fetch('https://lmrnnfjuytygomdfujhs.supabase.co/functions/v1/openai-chat', { 
                method:'POST', 
                headers:{ 'Content-Type':'application/json', 'Authorization': `Bearer ${anon}`, 'apikey': anon }, 
                body: JSON.stringify({ prompt: researchPrompt, model:'gpt-4o-mini', openai_api_key: openaiKey }) 
              });
              const j = await r.json(); 
              if (r.ok) {
                reply = j.reply || reply;
              } else {
                throw new Error(`OpenAI API failed: ${r.status}`);
              }
            } else {
              throw new Error('OpenAI API key or Supabase key not found');
            }
          } else if (selectedModel === 'mistral-large') {
            // Mistral Large for Deep Research
            const mistralKey = util_getEnv('VITE_MISTRAL_API_KEY','VITE_MISTRAL_API_KEY') || util_getEnv('MISTRAL_AI_API','MISTRAL_AI_API') || '';
            if (mistralKey) {
              const sys = 'You are an expert research assistant with advanced reasoning capabilities. Provide a comprehensive, well-researched analysis with multiple perspectives, detailed evidence, and actionable insights. Structure your response with clear sections, bullet points, and supporting data.';
              const requestBody = { 
                model: 'mistral-large-latest', 
                temperature: 0.3, 
                messages: [
                  { role: 'system', content: sys },
                  { role: 'user', content: `Conduct thorough research on this topic: ${text}` }
                ]
              };
              const rr = await fetch('https://api.mistral.ai/v1/chat/completions', { 
                method: 'POST', 
                headers: { 
                  'Authorization': `Bearer ${mistralKey}`, 
                  'Content-Type': 'application/json' 
                }, 
                body: JSON.stringify(requestBody) 
              });
              const jj = await rr.json().catch(()=>({})); 
              if (rr.ok) {
                reply = (jj?.choices?.[0]?.message?.content) || reply;
              } else {
                console.error('Mistral Large Research Error:', rr.status, rr.statusText, jj);
                throw new Error(`Mistral Large API failed: ${rr.status}`);
              }
            } else {
              throw new Error('Mistral API key not found');
            }
          } else {
            // Default: Mistral AI for Deep Research
            const mistralKey = util_getEnv('VITE_MISTRAL_API_KEY','VITE_MISTRAL_API_KEY') || util_getEnv('MISTRAL_AI_API','MISTRAL_AI_API') || '';
            if (mistralKey) {
              const sys = 'You are an expert research assistant. Provide a comprehensive, well-researched analysis with multiple perspectives and actionable insights. Structure your response with clear sections and bullet points.';
              const requestBody = { 
                model: 'mistral-medium-latest', 
                temperature: 0.4, 
                messages: [
                  { role: 'system', content: sys },
                  { role: 'user', content: `Research this topic thoroughly: ${text}` }
                ]
              };
              const rr = await fetch('https://api.mistral.ai/v1/chat/completions', { 
                method: 'POST', 
                headers: { 
                  'Authorization': `Bearer ${mistralKey}`, 
                  'Content-Type': 'application/json' 
                }, 
                body: JSON.stringify(requestBody) 
              });
              const jj = await rr.json().catch(()=>({})); 
              if (rr.ok) {
                reply = (jj?.choices?.[0]?.message?.content) || reply;
              } else {
                console.error('Mistral Research Error:', rr.status, rr.statusText, jj);
                throw new Error(`Mistral API failed: ${rr.status}`);
              }
            } else {
              throw new Error('Mistral API key not found');
            }
          }
        }catch(err){
          console.error('Deep Research Error:', err);
          // Auto-fallback to next available model
          if (selectedModel === 'perplexity') {
            console.log('Falling back to Mistral...');
            const activeModelIndicator = document.getElementById('activeModelIndicator');
            if (activeModelIndicator) {
              activeModelIndicator.textContent = 'Mistral AI (fallback)';
            }
            const mistralKey = util_getEnv('VITE_MISTRAL_API_KEY','VITE_MISTRAL_API_KEY') || util_getEnv('MISTRAL_AI_API','MISTRAL_AI_API') || '';
            if (mistralKey) {
              try {
                const requestBody = { 
                  model: 'mistral-medium-latest', 
                  temperature: 0.4, 
                  messages: [
                    { role: 'system', content: 'You are an expert research assistant. Provide comprehensive analysis.' },
                    { role: 'user', content: `Research this topic: ${text}` }
                  ]
                };
                const rr = await fetch('https://api.mistral.ai/v1/chat/completions', { 
                  method: 'POST', 
                  headers: { 'Authorization': `Bearer ${mistralKey}`, 'Content-Type': 'application/json' }, 
                  body: JSON.stringify(requestBody) 
                });
                const jj = await rr.json().catch(()=>({})); 
                if (rr.ok) reply = (jj?.choices?.[0]?.message?.content) || reply;
              } catch (fallbackErr) {
                console.error('Fallback also failed:', fallbackErr);
              }
            }
          }
        }
        const sb = getSupabase();
        // Choose space: current scope or default to private user scratch space (create if missing)
        let targetSpaceId = scopeSel?.value || 'ALL';
        if (!targetSpaceId || targetSpaceId==='ALL'){
          const spaces = await db_listSpaces().catch(()=>[]);
          let priv = spaces.find(s=>/deep research/i.test(s.name||''));
          if(!priv){ priv = await (await import('../lib/supabase.js')).db_createSpace('Deep Researches').catch(()=>null); }
          targetSpaceId = priv?.id || spaces?.[0]?.id || null;
        }
        if (targetSpaceId){
          const { db_createNote, db_updateNote } = await import('../lib/supabase.js');
          const n = await db_createNote(targetSpaceId).catch(()=>null);
          if (n){
            await db_updateNote(n.id, { title: `Research: ${text.slice(0,64)}`, content: reply });
            // Trigger RAG index for immediate discoverability
            try{ const { getPrefs } = await import('./settings.js'); const prefs = getPrefs(); await (await import('../lib/rag.js')).ragIndex(targetSpaceId, [{ source_type:'note', source_id:n.id, content:`Research: ${text}\n${reply}` }], prefs.searchProvider); }catch{}
          }
        }
        history = history.concat([{ role:'assistant', content: reply }]); renderMessages();
        try{ const c = parseInt(localStorage.getItem('hive_reqs')||'0',10)||0; localStorage.setItem('hive_reqs', String(c+1)); }catch{}
        return;
      } else {
        const started = performance.now();
        const useOpenAI = prefs.searchProvider === 'openai';
        const j = await ragSearch(text, scopeVal==='ALL'? null : scopeVal, useOpenAI ? 'GPT-4o' : 'Mistral').catch(()=>({ matches: [] }));
        let matches = Array.isArray(j.matches)? j.matches: [];
        if (typeof prefs.minSimilarity === 'number') matches = matches.filter(m => (m.similarity ?? 0) >= prefs.minSimilarity);
        if (!prefs.includeNotes) matches = matches.filter(m => m.source_type !== 'note');
        if (!prefs.includeFiles) matches = matches.filter(m => m.source_type !== 'file');
        matches = matches.slice(0, Math.max(1, prefs.topK||6));
        const elapsed = Math.round(performance.now()-started);
        if (ragDebugEl){ ragDebugEl.style.display='block'; ragDebugEl.textContent = `Search via: ${useOpenAI ? 'rag-search-openai':'rag-search'} | scope: ${scopeVal} | matches: ${matches.length} | latency: ${elapsed}ms\n` + JSON.stringify({ matches },null,2); }
        const context = matches.map(m=>`[${(m.similarity??0).toFixed(2)}] ${m.content}`).join('\n');
        const sys = prefs.contextOnly ? 'Answer ONLY using provided context. If nothing relevant, reply: "Information not found, try a different query".' : 'Prefer provided context; if none, answer briefly without fabricating citations.';
        prompt = (context? `${sys}\n\nContext:\n${context}\n\nQuestion: ${text}` : `${sys}\n\nQuestion: ${text}`);
      }

      let reply = '';
      try { reply = await callModel(prompt); } catch { reply = 'Error contacting model.'; }
      const msg = { role:'assistant', content: reply };
      history = history.concat([msg]);
      renderMessages();
      try{ const c = parseInt(localStorage.getItem('hive_reqs')||'0',10)||0; localStorage.setItem('hive_reqs', String(c+1)); }catch{}
  }

  chatInput.addEventListener('keydown', async (e)=>{ if (e.key==='Enter' && !e.shiftKey){ e.preventDefault(); await submitQuestion(); } });
  root.querySelector('#askBtn').addEventListener('click', submitQuestion);

  renderMessages();

  // Expose a helper to open a saved chat from elsewhere (e.g., Chats space)
  window.hiveOpenChatById = async (id)=>{
    try{
      // Prefer Supabase chats if available
      const supa = await (await import('../lib/supabase.js')).db_listChats().catch(()=>[]);
      let row = Array.isArray(supa) ? supa.find(c=>c.id===id) : null;
      if (!row) row = getChat(id);
      if (!row) return;
      currentChatId = row.id; history = row.messages||[]; renderMessages();
      const appRoot=document.getElementById('appRoot'); const scrim=document.getElementById('scrim');
      if(appRoot){ appRoot.classList.remove('chat-closed'); appRoot.classList.add('chat-open'); }
      if(scrim){ scrim.style.display='block'; }
    }catch{}
  };
}

// Renders a list of saved chats in the main content area
export async function renderChatsSpace(root){
  const { db_listChats, db_deleteChat } = await import('../lib/supabase.js');
  let list = await db_listChats().catch(()=>[]);
  if (!Array.isArray(list) || !list.length){ list = listChats(); }
  root.innerHTML = `
    <div class="content-head">
      <div class="title"><h2>Chats</h2></div>
      <div class="view-controls"><button class="button" id="backBtn">Back</button><button class="button" id="newChatBtn">New chat</button></div>
    </div>
    <ul id="chatsList" style="display:flex; flex-direction:column; gap:4px; padding:0; margin:0; list-style:none"></ul>`;
  const listEl = root.querySelector('#chatsList');
  if (!list.length){ listEl.innerHTML = '<div class="empty">No saved chats yet</div>'; return; }
  listEl.innerHTML = list.map(c=>`<li class='chat-row'>
    <div style='min-width:0'>
      <div style='font-weight:600; font-size:12px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis'>${c.title||'Untitled chat'}</div>
      <div class='muted' style='font-size:12px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis'>${c.scope||'ALL'} · ${new Date(c.updated_at||c.created_at).toLocaleString()}</div>
    </div>
    <div style='display:flex; gap:6px'>
      <button class='button sm' data-open='${c.id}'>Open</button>
      <button class='button sm ghost' data-del='${c.id}'>Delete</button>
    </div>
  </li>`).join('');
  root.querySelector('#backBtn').addEventListener('click', ()=>{ window.location.hash=''; });
  listEl.querySelectorAll('[data-open]').forEach(btn=>btn.addEventListener('click', ()=>{ window.hiveOpenChatById && window.hiveOpenChatById(btn.getAttribute('data-open')); }));
  listEl.querySelectorAll('[data-del]').forEach(btn=>btn.addEventListener('click', async ()=>{
    const id = btn.getAttribute('data-del');
    await db_deleteChat(id).catch(()=>deleteChat(id));
    btn.closest('div[style]')?.remove();
  }));
}
