export const config = { runtime: 'edge' };

// Same-origin proxy to avoid browser CORS
// Prefers Supabase Edge Function if SUPABASE_URL/ANON are present
// Falls back to calling Perplexity directly with PERPLEXITY key
export default async function handler(req) {
  const cors = {
    'Access-Control-Allow-Origin': req.headers.get('Origin') || '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey',
    'Access-Control-Max-Age': '86400'
  };
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405, headers: cors });
  try{
    const bodyText = await req.text();
    const supaUrl = process.env.SUPABASE_URL || '';
    const anon = process.env.SUPABASE_ANON_KEY || '';
    if (supaUrl && anon){
      const url = `${supaUrl.replace(/\/$/, '')}/functions/v1/pplx-research`;
      const r = await fetch(url, { method:'POST', headers:{ 'Content-Type':'application/json', 'Authorization':`Bearer ${anon}`, 'apikey': anon }, body: bodyText });
      const txt = await r.text();
      return new Response(txt, { status: r.status, headers: { ...cors, 'Content-Type':'application/json' } });
    }
    // Fallback: direct Perplexity
    const { question } = JSON.parse(bodyText||'{}');
    const key = process.env.PERPLEXITY || process.env.PPLX || process.env.VITE_PERPLEXITY || '';
    if (!key){ return new Response(JSON.stringify({ error:'PERPLEXITY key missing on server' }), { status:500, headers:{ ...cors, 'Content-Type':'application/json' } }); }
    const rr = await fetch('https://api.perplexity.ai/chat/completions', { method:'POST', headers:{ 'Authorization':`Bearer ${key}`, 'Content-Type':'application/json' }, body: JSON.stringify({ model:'pplx-70b-online', temperature:0.3, messages:[{role:'system',content:'Deep research assistant.'},{role:'user',content:String(question||'')}] }) });
    const jj = await rr.json().catch(()=>({}));
    if (!rr.ok){ return new Response(JSON.stringify({ error: jj?.error?.message || 'Perplexity API error' }), { status: rr.status, headers:{ ...cors, 'Content-Type':'application/json' } }); }
    return new Response(JSON.stringify({ reply: jj?.choices?.[0]?.message?.content || '' }), { status:200, headers:{ ...cors, 'Content-Type':'application/json' } });
  }catch{
    return new Response(JSON.stringify({ error: 'Bad request' }), { status: 400, headers: { ...cors, 'Content-Type':'application/json' } });
  }
}


