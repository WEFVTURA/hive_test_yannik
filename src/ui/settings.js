const KEY = 'hive_prefs_v1';

export function getPrefs(){
	let p = {};
	try{ p = JSON.parse(localStorage.getItem(KEY)||'{}'); }catch{}
	return {
		profileName: p.profileName || 'Giannandrea G.',
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
	};
}

export function savePrefs(next){
	localStorage.setItem(KEY, JSON.stringify(next));
}

export function openSettingsModal(){
	const p = getPrefs();
	const scrim = document.getElementById('modalScrim') || createScrim();
	scrim.classList.add('modal-show'); scrim.setAttribute('aria-hidden','false'); scrim.style.display='flex';
	scrim.innerHTML = `
		<div class="modal" role="dialog" aria-modal="true">
		  <div class="modal-head"><div>Settings</div><button class="button ghost" id="xClose">✕</button></div>
		  <div class="modal-body">
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
		  </div>
		  <div class="modal-actions"><button class="button" id="cancelBtn">Cancel</button><button class="button primary" id="saveBtn">Save</button></div>
		</div>`;
	function close(){ scrim.classList.remove('modal-show'); scrim.setAttribute('aria-hidden','true'); scrim.style.display='none'; }
	scrim.querySelector('#xClose').onclick = close;
	scrim.querySelector('#cancelBtn').onclick = close;
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
		};
		savePrefs(next); close(); location.reload();
	};
}

export function openProfileModal(){
	const p = getPrefs();
	const scrim = document.getElementById('modalScrim') || createScrim();
	scrim.classList.add('modal-show'); scrim.setAttribute('aria-hidden','false'); scrim.style.display='flex';
	scrim.innerHTML = `
		<div class="modal" role="dialog" aria-modal="true">
		  <div class="modal-head"><div>My profile</div><button class="button ghost" id="xClose">✕</button></div>
		  <div class="modal-body">
		    <div class="field"><label>Display name</label><input id="pName" value="${p.profileName}" /></div>
		  </div>
		  <div class="modal-actions"><button class="button" id="cancelBtn">Cancel</button><button class="button primary" id="saveBtn">Save</button></div>
		</div>`;
	function close(){ scrim.classList.remove('modal-show'); scrim.setAttribute('aria-hidden','true'); scrim.style.display='none'; }
	scrim.querySelector('#xClose').onclick = close;
	scrim.querySelector('#cancelBtn').onclick = close;
	scrim.querySelector('#saveBtn').onclick = ()=>{
		const next = { ...p, profileName: scrim.querySelector('#pName').value || p.profileName };
		savePrefs(next); close(); location.reload();
	};
}

function createScrim(){
	const s = document.createElement('div'); s.className='modal-scrim'; s.id='modalScrim'; document.body.appendChild(s); return s;
}
