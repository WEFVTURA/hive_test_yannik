// Supabase Edge Function: assembly-webhook
// Receives completion-only webhooks from AssemblyAI and stores transcripts as notes
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OPENAI_API_KEY (optional)

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

Deno.serve(async (req: Request) => {
	if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
	let body: any = {};
	try { body = await req.json(); } catch { return new Response('Bad JSON', { status: 400 }); }

	// AssemblyAI completion-style payloads commonly include: id, status, text
	const status = body.status || body.event || 'completed';
	const text = body.text || body.transcript || '';
	if (!text) return new Response(JSON.stringify({ ok: true, skipped: 'no_text' }), { headers: { 'Content-Type': 'application/json' } });

	const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
	const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
	const OPENAI_KEY = Deno.env.get('OPENAI_API_KEY') || '';

	// Lazily create/find the space
	async function fetchJson(url: string, init: RequestInit){
		const r = await fetch(url, init);
		const j = await r.json().catch(()=>({}));
		if (!r.ok) throw new Error(JSON.stringify(j));
		return j;
	}

	let spaceId: string | null = null;
	try{
		const q = await fetch(`${SUPABASE_URL}/rest/v1/spaces?select=id&name=eq.Meetings`, { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } });
		const arr = await q.json();
		if (Array.isArray(arr) && arr.length){ spaceId = arr[0].id; }
		else {
			const created = await fetchJson(`${SUPABASE_URL}/rest/v1/spaces`, {
				method: 'POST',
				headers: { 'Content-Type':'application/json', apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
				body: JSON.stringify({ name: 'Meetings', visibility: 'private' })
			});
			spaceId = created?.[0]?.id || created?.id || null;
		}
	} catch(e){
		return new Response(JSON.stringify({ ok:false, error:'space_create_failed', detail: String(e) }), { status: 500, headers: { 'Content-Type':'application/json' } });
	}
	if (!spaceId) return new Response(JSON.stringify({ ok:false, error:'no_space' }), { status: 500 });

	// Insert note
	const title = body.title || `Call ${new Date().toISOString()}`;
	try{
		await fetchJson(`${SUPABASE_URL}/rest/v1/notes`, {
			method:'POST',
			headers: { 'Content-Type':'application/json', apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
			body: JSON.stringify({ space_id: spaceId, title, content: text })
		});
	} catch(e){
		return new Response(JSON.stringify({ ok:false, error:'note_insert_failed', detail:String(e) }), { status:500, headers:{'Content-Type':'application/json'} });
	}

	// Optional: index immediately
	try{
		if (OPENAI_KEY){
			await fetch(`${SUPABASE_URL}/functions/v1/rag-embed-index-openai`, {
				method:'POST',
				headers: { 'Content-Type':'application/json', apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
				body: JSON.stringify({ space_id: spaceId, items: [{ source_type:'note', source_id:'assembly', content: `${title}\n${text}` }], openai_api_key: OPENAI_KEY })
			});
		}
	}catch(_){ /* non-fatal */ }

	return new Response(JSON.stringify({ ok:true, space_id: spaceId }), { headers: { 'Content-Type':'application/json' } });
});

