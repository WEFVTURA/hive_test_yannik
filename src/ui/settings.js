const KEY = 'hive_prefs_v1';

export function getPrefs(){
	let p = {};
	try{ p = JSON.parse(localStorage.getItem(KEY)||'{}'); }catch{}
	return {
		profileName: p.profileName || 'User',
		defaultModel: p.defaultModel || 'Mistral',
		searchProvider: p.searchProvider || 'mistral',
		topK: Number.isFinite(p.topK) ? p.topK : 6,
		minSimilarity: typeof p.minSimilarity === 'number' ? p.minSimilarity : 0.0,
		contextOnly: Boolean(p.contextOnly ?? false),
		defaultScope: p.defaultScope || 'ALL',
		includeNotes: p.includeNotes ?? true,
		includeFiles: p.includeFiles ?? true,
		directMode: Boolean(p.directMode ?? false),
		contextBudget: Number.isFinite(p.contextBudget) ? p.contextBudget : 16000,
		logLevel: p.logLevel || 'info',
		enableDebugLog: Boolean(p.enableDebugLog ?? false),
	};
}

export function savePrefs(next){
	localStorage.setItem(KEY, JSON.stringify(next));
}

export async function openSettingsModal(){
	const p = getPrefs();
	const scrim = document.getElementById('modalScrim') || createScrim();
	scrim.classList.add('modal-show'); scrim.setAttribute('aria-hidden','false'); scrim.style.display='flex';
	scrim.innerHTML = `
		<div class="modal" role="dialog" aria-modal="true">
		  <div class="modal-head"><div>Settings</div><button class="button ghost" id="xClose">✕</button></div>
		  <div class="modal-body">
		    <div class="field"><label>Theme</label>
		      <select id="sTheme">
		        <option value="dark" ${document.documentElement.getAttribute('data-theme')==='dark'?'selected':''}>Default (Dark)</option>
		        <option value="light">Light</option>
		        <option value="slate">Slate</option>
		        <option value="zinc">Zinc</option>
		        <option value="rose">Rose</option>
		        <option value="emerald">Emerald</option>
		        <option value="amber">Amber</option>
		        <option value="indigo">Indigo</option>
		      </select>
		    </div>
		    <div class="field"><label>Default model</label>
		      <select id="sModel"><option ${p.defaultModel==='Mistral'?'selected':''}>Mistral</option><option ${p.defaultModel==='GPT-4o'?'selected':''}>GPT-4o</option></select>
		    </div>
		    <div class="field"><label>Search provider (RAG)</label>
		      <select id="sProvider"><option value="mistral" ${p.searchProvider==='mistral'?'selected':''}>Mistral (pgvector)</option><option value="openai" ${p.searchProvider==='openai'?'selected':''}>OpenAI (pgvector)</option></select>
		    </div>
		    <div class="field"><label>Top K</label><input id="sTopK" type="number" min="1" max="20" value="${p.topK}"></div>
		    <div class="field"><label>Min similarity (0..1)</label><input id="sMinSim" type="number" step="0.01" min="0" max="1" value="${p.minSimilarity}"></div>
		    <div class="field"><label>Default scope</label><input id="sScope" placeholder="ALL or space id" value="${p.defaultScope}"></div>
		    <div class="field"><label>Search types</label>
		      <div style="display:flex; gap:10px"><label><input type="checkbox" id="sNotes" ${p.includeNotes?'checked':''}> Notes</label><label><input type="checkbox" id="sFiles" ${p.includeFiles?'checked':''}> Files</label></div>
		    </div>
		    <div class="field"><label>AI restrictions</label>
		      <label><input type="checkbox" id="sContextOnly" ${p.contextOnly?'checked':''}> Only answer from retrieved context</label>
		    </div>
		    <div class="field"><label>Direct context mode (bypass RAG)</label>
		      <label><input type="checkbox" id="sDirect" ${p.directMode?'checked':''}> Concatenate notes into prompt</label>
		    </div>
		    <div class="field"><label>Direct context budget (characters)</label>
		      <input id="sCtxBudget" type="number" min="2000" max="180000" step="1000" value="${p.contextBudget}">
		    </div>
		    <div class="field"><label>Logging</label>
		      <div style="display:grid; gap:6px">
		        <label><input type="checkbox" id="sDebug" ${p.enableDebugLog?'checked':''}> Enable in-app debug log</label>
		        <select id="sLogLevel">
		          <option value="error" ${p.logLevel==='error'?'selected':''}>Error</option>
		          <option value="warn" ${p.logLevel==='warn'?'selected':''}>Warn</option>
		          <option value="info" ${p.logLevel==='info'?'selected':''}>Info</option>
		          <option value="debug" ${p.logLevel==='debug'?'selected':''}>Debug</option>
		        </select>
		      </div>
		    </div>
		    <div class="field"><label>Debug log</label>
		      <div id="debugLog" style="display:${p.enableDebugLog?'block':'none'}; max-height:200px; overflow:auto; font:12px/1.4 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace; background:var(--panel-2); border:1px solid var(--border); border-radius:8px; padding:8px"></div>
		    </div>
		  </div>
		  <div class="modal-actions"><button class="button" id="cancelBtn">Cancel</button><button class="button primary" id="saveBtn">Save</button></div>
		</div>`;
	function close(){ scrim.classList.remove('modal-show'); scrim.setAttribute('aria-hidden','true'); scrim.style.display='none'; }
	scrim.querySelector('#xClose').onclick = close;
	scrim.querySelector('#cancelBtn').onclick = close;
	// Live log hookup
	(function initDebugLog(){
		const box = scrim.querySelector('#debugLog');
		const chk = scrim.querySelector('#sDebug');
		const lvlSel = scrim.querySelector('#sLogLevel');
		function print(level, args){
			if (!box || !(chk?.checked)) return;
			const levels=['error','warn','info','debug'];
			const min = lvlSel?.value||'info';
			if (levels.indexOf(level) > levels.indexOf(min)) return;
			const redact = (s)=>{
				try{
					return String(s).replace(/https?:\/\/[^\s/]+supabase\.co/gi,'<redacted-supabase>').replace(/eyJhbG[^\s"]+/g,'<redacted-token>');
				}catch{return s}
			};
			const safeArgs = Array.from(args).map(a=> typeof a==='string'? redact(a) : redact(JSON.stringify(a)));
			const line = document.createElement('div');
			line.textContent = `[${new Date().toLocaleTimeString()}] ${level.toUpperCase()}: ` + safeArgs.join(' ');
			box.appendChild(line); box.scrollTop = box.scrollHeight;
		}
		const original = { log:console.log, warn:console.warn, error:console.error, info:console.info };
		['log','warn','error','info'].forEach(k=>{
			console[k] = function(){ try{ print(k==='log'?'debug':k, arguments); }catch{}; return original[k].apply(console, arguments); };
		});
		window.__hiveLog = function(level, ...args){ print(level, args); };
		// Flush buffered logs captured before opening Settings
		try{ (window.__hiveLogBuffer||[]).forEach(entry=>print(entry.level, entry.args)); }catch{}
		chk?.addEventListener('change', ()=>{ try{ box.style.display = chk.checked ? 'block' : 'none'; }catch{} });
	})();

	// Theme live preview
	const themeSel = scrim.querySelector('#sTheme');
	themeSel?.addEventListener('change', ()=>{
		const val = themeSel.value; const map = { dark:'dark', light:'light', slate:'slate', zinc:'zinc', rose:'rose', emerald:'emerald', amber:'amber', indigo:'indigo' };
		document.documentElement.setAttribute('data-theme', map[val]||'dark');
	});

	scrim.querySelector('#saveBtn').onclick = ()=>{
		const next = {
			...p,
			defaultModel: scrim.querySelector('#sModel').value,
			searchProvider: scrim.querySelector('#sProvider').value,
			topK: parseInt(scrim.querySelector('#sTopK').value,10)||6,
			minSimilarity: Math.max(0, Math.min(1, parseFloat(scrim.querySelector('#sMinSim').value)||0)),
			defaultScope: (scrim.querySelector('#sScope').value||'ALL').trim()||'ALL',
			includeNotes: scrim.querySelector('#sNotes').checked,
			includeFiles: scrim.querySelector('#sFiles').checked,
			contextOnly: scrim.querySelector('#sContextOnly').checked,
			directMode: scrim.querySelector('#sDirect').checked,
			contextBudget: parseInt(scrim.querySelector('#sCtxBudget').value,10) || 16000,
			enableDebugLog: scrim.querySelector('#sDebug').checked,
			logLevel: scrim.querySelector('#sLogLevel').value,
		};
		try{ const sel = themeSel?.value || 'dark'; document.documentElement.setAttribute('data-theme', sel); }catch{}
		savePrefs(next); close(); location.reload();
	};
}

export async function openProfileModal(){
	const { auth_getUser, profile_get, profile_upsert, profile_uploadAvatar } = await import('../lib/supabase.js');
	const me = await auth_getUser();
	if (!me){ alert('Please sign in first'); return; }
	const profile = await profile_get(me.id).catch(()=>null) || { email: me.email, full_name: '', avatar_url: '' };
	const scrim = document.getElementById('modalScrim') || createScrim();
	scrim.classList.add('modal-show'); scrim.setAttribute('aria-hidden','false'); scrim.style.display='flex';
	scrim.innerHTML = `
		<div class="modal" role="dialog" aria-modal="true">
		  <div class="modal-head"><div>My profile</div><button class="button ghost" id="xClose">✕</button></div>
		  <div class="modal-body">
		    <div style="display:flex; align-items:center; gap:12px">
		      <div id="avatarPreview" style="width:56px; height:56px; border-radius:50%; background:${profile.avatar_url?'transparent':'linear-gradient(135deg,#5a83f2,#7b61ff)'}; border:1px solid var(--border); background-size:cover; background-position:center; ${profile.avatar_url?`background-image:url('${profile.avatar_url}')`:''}"></div>
		      <div style="display:flex; gap:8px">
		        <button class="button" id="uploadAvatarBtn">Upload photo</button>
		        <button class="button ghost" id="removeAvatarBtn">Remove</button>
		      </div>
		    </div>
		    <div class="field"><label>Full name</label><input id="pName" value="${profile.full_name||''}" /></div>
		    <div class="field"><label>Email</label><input value="${profile.email||me.email||''}" disabled /></div>
		  </div>
		  <div class="modal-actions"><button class="button" id="cancelBtn">Close</button><button class="button primary" id="saveBtn">Save</button></div>
		</div>`;
	function close(){ scrim.classList.remove('modal-show'); scrim.setAttribute('aria-hidden','true'); scrim.style.display='none'; }
	scrim.querySelector('#xClose').onclick = close;
	scrim.querySelector('#cancelBtn').onclick = close;

	const avatarPreview = scrim.querySelector('#avatarPreview');
	const uploadBtn = scrim.querySelector('#uploadAvatarBtn');
	const removeBtn = scrim.querySelector('#removeAvatarBtn');
	// Logout
	const logoutBtn = document.createElement('button'); logoutBtn.className='button ghost'; logoutBtn.textContent='Log out';
	scrim.querySelector('.modal-actions').prepend(logoutBtn);
	logoutBtn.addEventListener('click', async()=>{ try{ (await import('../lib/supabase.js')).auth_signOut(); location.reload(); }catch{} });

	uploadBtn.addEventListener('click', async ()=>{
		const inp = document.createElement('input'); inp.type='file'; inp.accept='image/*';
		inp.onchange = async ()=>{
			const f = inp.files?.[0]; if(!f) return;
			try{
				const url = await profile_uploadAvatar(f);
				avatarPreview.style.backgroundImage = `url('${url}')`;
				avatarPreview.style.background = 'transparent';
				avatarPreview.style.backgroundSize = 'cover';
				window.showToast && window.showToast('Avatar updated');
				const av = document.querySelector('.avatar'); if (av){ av.style.backgroundImage = `url('${url}')`; av.style.backgroundSize='cover'; av.textContent=''; }
			}catch(e){ window.showToast && window.showToast('Upload failed'); }
		};
		inp.click();
	});

	removeBtn.addEventListener('click', async ()=>{
		try{
			await profile_upsert(me.id, { avatar_url: null });
			avatarPreview.style.backgroundImage = '';
			avatarPreview.style.background = 'linear-gradient(135deg,#5a83f2,#7b61ff)';
			window.showToast && window.showToast('Avatar removed');
			const av = document.querySelector('.avatar'); if (av){ av.style.backgroundImage=''; av.textContent = (me.email||'U').slice(0,1).toUpperCase(); }
		}catch(e){ window.showToast && window.showToast('Remove failed'); }
	});

	scrim.querySelector('#saveBtn').onclick = async ()=>{
		const name = scrim.querySelector('#pName').value || '';
		try{ 
			await profile_upsert(me.id, { full_name: name });
			// Update sidebar brand immediately
			const brandEl = document.querySelector('.brand');
			if (brandEl){ brandEl.textContent = name || brandEl.textContent; }
		}catch{}
		close();
	};
}

function createScrim(){
	const s = document.createElement('div'); s.className='modal-scrim'; s.id='modalScrim'; document.body.appendChild(s); return s;
}
