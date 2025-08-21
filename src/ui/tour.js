// Simple product tour overlay with steps
// Each step: { target: 'css-selector', title: '...', body: '...', placement?: 'right'|'left'|'top'|'bottom' }

export function startTour(steps){
	if (!Array.isArray(steps) || !steps.length) return;
	let idx = 0;
	const scrim = document.createElement('div');
	scrim.className = 'tour-scrim';
	scrim.setAttribute('role','dialog');
	scrim.setAttribute('aria-modal','true');
	document.body.appendChild(scrim);

	const pop = document.createElement('div');
	pop.className = 'tour-pop';
	pop.innerHTML = `
		<div class="tour-head">
			<svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2m1 15h-2v-2h2Zm2.07-7.75A3.5 3.5 0 0 0 8.5 12h2a1.5 1.5 0 1 1 3 0c0 1.5-2 1.3-2 3h2c0-1.2 2-1.5 2-3a3.49 3.49 0 0 0-1.43-2.75Z"/></svg>
			<div class="tour-title"></div>
		</div>
		<div class="tour-body"></div>
		<div class="tour-actions">
			<button class="button ghost" data-tour-skip>Skip</button>
			<button class="button primary" data-tour-next>Next</button>
		</div>
	`;
	document.body.appendChild(pop);

	const spot = document.createElement('div');
	spot.className = 'tour-spot';
	document.body.appendChild(spot);

	function place(step){
		const el = document.querySelector(step.target);
		if (!el){ pop.style.display='none'; spot.style.display='none'; return; }
		pop.style.display='grid';
		const r = el.getBoundingClientRect();
		const p = step.placement || 'right';
		const margin = 12;
		let top = r.top + window.scrollY;
		let left = r.left + window.scrollX;
		switch(p){
			case 'left': left = left - pop.offsetWidth - margin; break;
			case 'top': top = top - pop.offsetHeight - margin; break;
			case 'bottom': top = top + r.height + margin; break;
			default: left = left + r.width + margin;
		}
		// Clamp within viewport
		left = Math.max(12, Math.min(left, window.scrollX + document.documentElement.clientWidth - pop.offsetWidth - 12));
		top = Math.max(12, Math.min(top, window.scrollY + document.documentElement.clientHeight - pop.offsetHeight - 12));
		pop.style.top = top + 'px';
		pop.style.left = left + 'px';
		pop.classList.remove('pos-right','pos-left','pos-top','pos-bottom');
		pop.classList.add('pos-'+(p==='left'?'left':p==='top'?'top':p==='bottom'?'bottom':'right'));

		// Spotlight ring around target
		spot.style.display='block';
		spot.style.top = (r.top + window.scrollY - 6) + 'px';
		spot.style.left = (r.left + window.scrollX - 6) + 'px';
		spot.style.width = (r.width + 12) + 'px';
		spot.style.height = (r.height + 12) + 'px';
	}

	async function waitFor(selector, timeoutMs=2000){
		const start = Date.now();
		while(Date.now()-start < timeoutMs){ if (document.querySelector(selector)) return true; await new Promise(r=>setTimeout(r,120)); }
		return !!document.querySelector(selector);
	}

	async function render(){
		const step = steps[idx]; if (!step){ cleanup(); return; }
		try{ if (typeof step.before === 'function'){ await step.before(); } }catch{}
		const ok = await waitFor(step.target, 2000);
		if (!ok){ idx++; return render(); }
		pop.querySelector('.tour-title').textContent = step.title || '';
		pop.querySelector('.tour-body').innerHTML = step.body || '';
		pop.querySelector('[data-tour-next]').textContent = (idx === steps.length-1)? 'Done':'Next';
		requestAnimationFrame(()=>place(step));
	}

	function next(){ idx++; if (idx>=steps.length){ cleanup(); } else { render(); } }
	function cleanup(){ scrim.remove(); pop.remove(); spot.remove(); }

	pop.querySelector('[data-tour-next]').addEventListener('click', next);
	pop.querySelector('[data-tour-skip]').addEventListener('click', cleanup);
	scrim.addEventListener('click', cleanup);
	window.addEventListener('resize', ()=>render(), { passive:true });
	window.addEventListener('scroll', ()=>render(), { passive:true });

	render();
}

// Default single-step tour to showcase Ask button
export function startDefaultTour(){
	function sleep(ms){ return new Promise(r=>setTimeout(r, ms)); }
	async function gotoFirstSpace(){
		if (location.hash.startsWith('#space/')) return;
		try{
			const mod = await import('../lib/supabase.js');
			const list = await mod.db_listSpaces().catch(()=>[]);
			if (Array.isArray(list) && list.length){ location.hash = 'space/'+list[0].id; await sleep(300); }
		}catch{}
	}
	async function openChatPanel(){
		const btn = document.getElementById('askHiveBtn');
		if (btn){ btn.click(); await sleep(150); }
	}

	startTour([
		{ target:'#askHiveBtn', title:'Ask HIve assistant', body:'<div class="muted">Open the AI side panel and ask questions about your notes, files, or entire library.</div><div style="margin-top:8px">Use the mode selector for RAG, FTS, or SQL search.</div>', placement:'right' },
		{ target:'#askBtn', title:'Type and Ask', body:'Use the Ask button or press Enter to send your question. Resize the panel using the vertical handle.', placement:'left', before: openChatPanel },
		{ target:'#createSpaceBtn', title:'Create spaces', body:'Organize your work in spaces. Click here to create a new space for a project or topic.', placement:'right' },
		{ target:'#uploadBtn', title:'Upload files', body:'Drop PDFs, images, audio. We extract text and index for AI. Try Transcribe audio for recordings.', placement:'bottom', before: gotoFirstSpace },
		{ target:'#reindexBtn', title:'Bulk index all', body:'Changed a lot of content? Reindex the current space to refresh embeddings.', placement:'left', before: gotoFirstSpace },
		{ target:'#openSettings', title:'Settings & Profile', body:'Manage model, search provider, and profile from here.', placement:'right' },
		{ target:'#shareBtn', title:'Share spaces', body:'Invite collaborators by email to access this space.', placement:'left', before: gotoFirstSpace },
		{ target:'#backBtn', title:'Back to Library', body:'Return to your Library overview.', placement:'left', before: gotoFirstSpace }
	]);
}


