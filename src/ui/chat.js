import { ragSearch } from '../lib/rag.js';
import { util_getEnv, db_listSpaces } from '../lib/supabase.js';
import { getPrefs } from './settings.js';
import { getSupabase } from '../lib/supabase.js';
import { marked } from 'https://cdn.jsdelivr.net/npm/marked@12/+esm';

export function renderChat(root){
  const prefs = getPrefs();
  root.innerHTML = `
    <div class="chat-root">
      <div class="panel" style="padding:12px; border-radius:12px; border:1px solid var(--border); background:var(--panel-2); height:100%; overflow:auto" id="chatMessages"></div>
      <div class="rag-debug" id="ragDebug" style="margin-top:10px; padding:10px; background:var(--panel-2); border:1px dashed var(--border); border-radius:10px; color:var(--muted); font-size:12px; max-height:180px; overflow:auto; display:none"></div>
      <div class="composer panel">
        <div class="composer-head" style="padding:12px 14px; border-bottom:1px solid var(--border); background:var(--panel-2); display:flex; align-items:center; justify-content:space-between">
          <div>Ask HIve assistant</div>
          <div style="display:flex; gap:8px">
            <button class="button ghost" id="editChatBtn" title="Edit">✎</button>
            <button class="button ghost" id="clearChatBtn">Clear</button>
            <button class="button ghost" id="hideChatBtn">Hide</button>
          </div>
        </div>
        <div class="composer-body" style="padding:12px; display:grid; gap:8px">
          <div class="muted">context: <span id="chatScopeLabel">All Libraries</span></div>
          <div style="display:flex; gap:8px; align-items:center">
            <label class="muted" style="font-size:12px">Search scope</label>
            <select id="spaceScope" style="flex:1; background:transparent; color:var(--text); border:1px solid var(--border); border-radius:8px; padding:6px 8px">
              <option value="ALL" ${prefs.defaultScope==='ALL'?'selected':''}>ALL</option>
            </select>
          </div>
          <div class="input" style="display:flex; align-items:center; gap:10px; border:1px solid var(--border); background:var(--panel); border-radius:12px; padding:8px">
            <input id="chatInput" placeholder="Type your question" style="flex:1; background:transparent; border:0; color:var(--text); outline:none; padding:8px"/>
            <div class="pill" id="modelBtn">${prefs.defaultModel} ▾</div>
          </div>
        </div>
      </div>
    </div>`;

  const chatMessagesEl = root.querySelector('#chatMessages');
  const chatInput = root.querySelector('#chatInput');
  const clearBtn = root.querySelector('#clearChatBtn');
  const hideBtn = root.querySelector('#hideChatBtn');
  const ragDebugEl = root.querySelector('#ragDebug');
  const scopeSel = root.querySelector('#spaceScope');
  let history = [];
  let model = prefs.defaultModel;

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
          ? `<div style="margin-top:8px"><div class="muted" style="font-size:12px">Sources</div><ul style="margin:6px 0 0 18px; padding:0">${m.citations.map(c=>`<li><span class='muted'>${(c.similarity??0).toFixed(2)}</span> ${c.content.substring(0,160)}...</li>`).join('')}</ul></div>`
          : '';
        return `<div class="message assistant"><div class="md">${inner}</div>${cites}</div>`;
      }
      return `<div class="message ${m.role}">${m.content}</div>`;
    }).join(''); chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
  }

  clearBtn.addEventListener('click', ()=>{ history=[]; renderMessages(); });
  hideBtn.addEventListener('click', ()=>{ const appRoot=document.getElementById('appRoot'); const scrim=document.getElementById('scrim'); if(appRoot){ appRoot.classList.remove('chat-open'); appRoot.classList.add('chat-closed'); } if(scrim){ scrim.style.display='none'; }});

  async function callModel(prompt){
    const anon = util_getEnv('SUPABASE_ANON_KEY','SUPABASE_ANON_KEY');
    const started = performance.now();
    try{
      if (model === 'Mistral'){
        const r = await fetch('https://lmrnnfjuytygomdfujhs.supabase.co/functions/v1/mistral-chat', { method:'POST', headers:{ 'Content-Type':'application/json', 'Authorization': `Bearer ${anon}`, 'apikey': anon }, body: JSON.stringify({ prompt, model:'mistral-medium-latest' }) });
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
        const { data } = await sb.from('notes').select('id,title,content,updated_at').eq('space_id', sp.id).order('updated_at', { ascending:false }).limit(100);
        notes = notes.concat(data||[]);
      }
    } else {
      const { data } = await sb.from('notes').select('id,title,content,updated_at').eq('space_id', scopeVal).order('updated_at', { ascending:false }).limit(300);
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

  chatInput.addEventListener('keydown', async (e)=>{
    if (e.key==='Enter' && !e.shiftKey){
      e.preventDefault();
      const text = (chatInput.value||'').trim(); if(!text) return; chatInput.value='';
      history = history.concat([{ role:'user', content:text }]); renderMessages();
      const scopeVal = scopeSel ? scopeSel.value : 'ALL';

      let prompt;
      if (prefs.directMode){
        const ctx = await buildDirectContext(scopeVal);
        const sys = 'Use the following project notes as authoritative context. If insufficient, say: "Information not found, try a different query".';
        prompt = `${sys}\n\nContext:\n${ctx}\n\nQuestion: ${text}`;
        if (ragDebugEl){ ragDebugEl.style.display='block'; ragDebugEl.textContent = `Direct mode | scope: ${scopeVal} | ctx chars: ${ctx.length}\n`;
        }
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
    }
  });

  renderMessages();
}
