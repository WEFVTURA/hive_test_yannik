import { ragSearch } from '../lib/rag.js';

export function renderChat(root){
  root.innerHTML = `
    <div class="panel" style="padding:12px; border-radius:12px; border:1px solid var(--border); background:var(--panel-2); height:340px; overflow:auto" id="chatMessages"></div>
    <div class="composer panel">
      <div class="composer-head" style="padding:12px 14px; border-bottom:1px solid var(--border); background:var(--panel-2); display:flex; align-items:center; justify-content:space-between">
        <div>Ask HIve assistant</div>
        <div style="display:flex; gap:8px">
          <button class="button ghost" id="clearChatBtn">Clear</button>
        </div>
      </div>
      <div class="composer-body" style="padding:12px; display:grid; gap:8px">
        <div class="muted">context: <span id="chatScopeLabel">All Libraries</span></div>
        <div class="input" style="display:flex; align-items:center; gap:10px; border:1px solid var(--border); background:var(--panel); border-radius:12px; padding:8px">
          <input id="chatInput" placeholder="Type your question" style="flex:1; background:transparent; border:0; color:var(--text); outline:none; padding:8px"/>
          <div class="pill" id="modelBtn">Mistral ▾</div>
          <div class="menu" id="modelMenu" style="display:none; position:absolute"></div>
        </div>
      </div>
    </div>`;

  const chatMessagesEl = root.querySelector('#chatMessages');
  const chatInput = root.querySelector('#chatInput');
  const clearBtn = root.querySelector('#clearChatBtn');
  let history = [];
  let model = 'Mistral';

  function renderMessages(){
    if (!history.length){ chatMessagesEl.innerHTML = '<div class="empty">No messages yet.</div>'; return; }
    chatMessagesEl.innerHTML = history.map(m=>`<div class="message ${m.role}">${m.content}</div>`).join('');
    chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
  }
  clearBtn.addEventListener('click', ()=>{ history=[]; renderMessages(); });

  chatInput.addEventListener('keydown', async (e)=>{
    if (e.key==='Enter' && !e.shiftKey){
      e.preventDefault();
      const text = (chatInput.value||'').trim(); if(!text) return; chatInput.value='';
      history = history.concat([{ role:'user', content:text }]); renderMessages();
      const scope = (document.getElementById('spaceScope')?.value||'ALL');
      const j = await ragSearch(text, scope==='ALL'? null : scope, model).catch(()=>({ matches: [] }));
      const seen = new Set();
      const raw = Array.isArray(j.matches)? j.matches: [];
      const top = raw.filter(m=>{ const k=`${m.source_type}:${m.source_id}`; if(seen.has(k)) return false; seen.add(k); return true; }).slice(0,6);
      const context = top.map(m=>`[${(m.similarity??0).toFixed(2)}] ${m.content}`).join('\n');
      const sys = 'You are HIve. Prefer using provided context; otherwise answer briefly without fake citations.';
      const prompt = (context? sys+'\n\nContext:\n'+context+'\n\nQuestion: '+text : sys+'\n\nQuestion: '+text);
      history = history.concat([{ role:'assistant', content: (context? 'Retrieved '+top.length+' snippets.' : 'No context found. Answering best‑effort.') }]);
      renderMessages();
    }
  });

  renderMessages();
}
