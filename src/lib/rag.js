import { util_getEnv, getSupabase } from './supabase.js';

export async function ragSearch(query, spaceId, modelLabel){
	const anon = util_getEnv('VITE_SUPABASE_ANON_KEY','VITE_SUPABASE_ANON_KEY') || util_getEnv('SUPABASE_ANON_KEY','SUPABASE_ANON_KEY');
	const base = util_getEnv('VITE_SUPABASE_URL','VITE_SUPABASE_URL') || util_getEnv('SUPABASE_URL','SUPABASE_URL');
	// Include user JWT so Supabase Functions can enforce RLS per user
	let userJwt = '';
	try { const sb = getSupabase(); const s = await sb.auth.getSession(); userJwt = s?.data?.session?.access_token || ''; } catch {}
	const url = (modelLabel === 'GPT-4o')
		? `${base.replace(/\/$/,'')}/functions/v1/rag-search-openai`
		: `${base.replace(/\/$/,'')}/functions/v1/rag-search`;
	const headers = { 'Content-Type':'application/json', 'Authorization':`Bearer ${anon}`, 'apikey': anon };
	if (userJwt) headers['X-User-JWT'] = userJwt;
	const r = await fetch(url, { method:'POST', headers, body: JSON.stringify({ query, top_k: 6, space_id: spaceId || null }) });
	const j = await r.json();
	return j;
}

export async function ragIndex(spaceId, items, provider='openai'){
	const anon = util_getEnv('VITE_SUPABASE_ANON_KEY','VITE_SUPABASE_ANON_KEY') || util_getEnv('SUPABASE_ANON_KEY','SUPABASE_ANON_KEY');
	if (provider === 'mistral'){
		const base = util_getEnv('VITE_SUPABASE_URL','VITE_SUPABASE_URL') || util_getEnv('SUPABASE_URL','SUPABASE_URL');
		const r = await fetch(`${base.replace(/\/$/,'')}/functions/v1/rag-embed-index`, { method:'POST', headers:{ 'Content-Type':'application/json', 'Authorization': `Bearer ${anon}`, 'apikey': anon }, body: JSON.stringify({ space_id: spaceId, items }) });
		return r.json();
	}
	const openai = window.OPENAI_API_KEY || '';
	const base2 = util_getEnv('VITE_SUPABASE_URL','VITE_SUPABASE_URL') || util_getEnv('SUPABASE_URL','SUPABASE_URL');
	const r = await fetch(`${base2.replace(/\/$/,'')}/functions/v1/rag-embed-index-openai`, { method:'POST', headers:{ 'Content-Type':'application/json', 'Authorization': `Bearer ${anon}`, 'apikey': anon }, body: JSON.stringify({ space_id: spaceId, items, openai_api_key: openai }) });
	return r.json();
}
