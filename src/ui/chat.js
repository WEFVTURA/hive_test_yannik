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
          <div>Ask Hive assistant</div>
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
              <option value="pplx">Perplexity (deep research)</option>
            </select></span>
          </div>
          <div style="display:flex; gap:8px; align-items:center">
            <label class="muted" style="font-size:12px">Search scope</label>
            <span class="select-wrap" style="flex:1"><select id="spaceScope" class="select" style="width:100%">
              <option value="ALL" ${prefs.defaultScope==='ALL'?'selected':''}>ALL</option>
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
  let history = [];
  let model = prefs.defaultModel;
  let currentChatId = null;

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
    const anon = util_getEnv('SUPABASE_ANON_KEY','SUPABASE_ANON_KEY');
    const started = performance.now();
    try{
      if (model === 'Mistral'){
        const r = await fetch('/api/mistral-chat', { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ prompt, model:'mistral-medium-latest' }) });
        const j = await r.json(); if(!r.ok){ throw new Error(j?.error||'mistral error'); } if(ragDebugEl){ ragDebugEl.textContent += `\nModel latency: ${Math.round(performance.now()-started)}ms`; } return j.reply||'';
      } else {
        const r = await fetch('https://lmrnnfjuytygomdfujhs.supabase.co/functions/v1/openai-chat', { method:'POST', headers:{ 'Content-Type':'application/json', 'Authorization': `Bearer ${anon}`, 'apikey': anon }, body: JSON.stringify({ prompt, model:'gpt-4o-mini', openai_api_key: (window.OPENAI_API_KEY||'') }) });
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
        if (ragDebugEl){ ragDebugEl.style.display='block'; ragDebugEl.textContent = 'Perplexity deep research…'; }
        // Prefer direct API when key is provided; else try Supabase function; last resort: local /api route
        let reply = 'Error contacting Perplexity';
        try{
          const apiKey = util_getEnv('PERPLEXITY','PERPLEXITY');
          if (apiKey){
            const sys = 'You are a research assistant. Do a deep, multi-step investigation with sources and a concise report.';
            const rr = await fetch('https://api.perplexity.ai/chat/completions', { method:'POST', headers:{ 'Authorization': `Bearer ${apiKey}`, 'Content-Type':'application/json' }, body: JSON.stringify({ model:'pplx-70b-online', temperature:0.3, messages:[{role:'system',content:sys},{role:'user',content:text}] }) });
            const jj = await rr.json().catch(()=>({})); if (rr.ok) reply = (jj?.choices?.[0]?.message?.content)||reply;
          }
        }catch{}
        if (reply==='Error contacting Perplexity'){
          try{
            const base = util_getEnv('SUPABASE_URL','SUPABASE_URL');
            const anon = util_getEnv('SUPABASE_ANON_KEY','SUPABASE_ANON_KEY');
            if (base && anon){
              const url = `${base.replace(/\/$/,'')}/functions/v1/pplx-research`;
              const r = await fetch(url, { method:'POST', mode:'cors', headers:{ 'Content-Type':'application/json', 'Authorization': `Bearer ${anon}`, 'apikey': anon }, body: JSON.stringify({ question: text }) }).catch(()=>null);
              if (r && r.ok){ const j = await r.json().catch(()=>({})); reply = j.reply||reply; }
            }
          }catch{}
        }
        if (reply==='Error contacting Perplexity'){
          try{
            const r = await fetch('/api/pplx-research', { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ question: text }) }).catch(()=>null);
            if (r && r.ok){ const j = await r.json().catch(()=>({})); reply = j.reply||reply; }
          }catch{}
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
