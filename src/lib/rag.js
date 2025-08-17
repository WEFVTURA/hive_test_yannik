import { util_getEnv } from './supabase.js';

export async function ragSearch(query, spaceId, modelLabel){
  const anon = util_getEnv('SUPABASE_ANON_KEY','SUPABASE_ANON_KEY');
  const url = modelLabel === 'GPT-4o'
    ? 'https://lmrnnfjuytygomdfujhs.supabase.co/functions/v1/rag-search-openai'
    : 'https://lmrnnfjuytygomdfujhs.supabase.co/functions/v1/rag-search';
  const r = await fetch(url, { method:'POST', headers:{ 'Content-Type':'application/json', 'Authorization':`Bearer ${anon}`, 'apikey': anon }, body: JSON.stringify({ query, top_k: 6, space_id: spaceId || null }) });
  const j = await r.json();
  return j;
}

export async function ragIndex(spaceId, items){
  const anon = util_getEnv('SUPABASE_ANON_KEY','SUPABASE_ANON_KEY');
  const openai = window.OPENAI_API_KEY || '';
  const r = await fetch('https://lmrnnfjuytygomdfujhs.supabase.co/functions/v1/rag-embed-index-openai', { method:'POST', headers:{ 'Content-Type':'application/json', 'Authorization': `Bearer ${anon}`, 'apikey': anon }, body: JSON.stringify({ space_id: spaceId, items, openai_api_key: openai }) });
  return r.json();
}
