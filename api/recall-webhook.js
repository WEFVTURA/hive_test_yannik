export const config = { runtime: 'edge' };

async function json(res, status=200, cors){ return new Response(JSON.stringify(res), { status, headers:{ ...(cors||{}), 'Content-Type':'application/json' } }); }

export default async function handler(req){
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-recall-signature',
    'Access-Control-Max-Age': '86400'
  };
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405, headers: cors });

  let body={}; try{ body = await req.json(); }catch{ return json({ error:'bad_json' }, 400, cors); }
  // Expected schema (approx): { id, meeting_id, status, transcript_id, transcript_text?, transcript_url? }
  const status = body?.status || '';
  if (!status){ return json({ ok:true }, 200, cors); }
  if (status !== 'completed'){ return json({ ok:true, ignored:true }, 200, cors); }

  // Accept multiple env names to match different deployments
  const RECALL_KEY = process.env.RECALL_API_KEY || process.env.RECALL_KEY || process.env.RECALL || '';
  const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || process.env.REACT_APP_SUPABASE_URL || '';
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SERVICE_KEY || '';
  if (!SUPABASE_URL || !SERVICE_KEY){ return json({ error:'supabase_env_missing', present:{ SUPABASE_URL: Boolean(SUPABASE_URL), SUPABASE_SERVICE_ROLE_KEY: Boolean(SERVICE_KEY) } }, 500, cors); }

  // Fetch transcript text
  let text = body?.transcript_text || '';
  try{
    if (!text){
      if (body?.transcript_url){
        const r = await fetch(String(body.transcript_url));
        text = await r.text();
      } else if (RECALL_KEY && body?.transcript_id){
        const r = await fetch(`https://api.recall.ai/api/v1/transcripts/${body.transcript_id}`, { headers:{ Authorization:`Token ${RECALL_KEY}` } });
        const j = await r.json().catch(()=>({}));
        text = j?.text || j?.transcript || '';
      }
    }
  }catch{}

  // Title + space
  const title = body?.meeting_title || body?.id || `Meeting ${new Date().toLocaleString()}`;
  let spaceId = '';
  try{
    const q = await fetch(`${SUPABASE_URL}/rest/v1/spaces?select=id&name=eq.Meetings`, { headers:{ apikey:SERVICE_KEY, Authorization:`Bearer ${SERVICE_KEY}` } });
    const arr = await q.json().catch(()=>[]);
    if (Array.isArray(arr) && arr.length) spaceId = arr[0].id;
    else {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/spaces`, { method:'POST', headers:{ 'Content-Type':'application/json', apikey:SERVICE_KEY, Authorization:`Bearer ${SERVICE_KEY}` }, body: JSON.stringify({ name:'Meetings', visibility:'private' }) });
      const created = await r.json().catch(()=>({}));
      spaceId = created?.[0]?.id || created?.id || '';
    }
  }catch{}

  // Insert note if we have any text
  if (text){
    try{
      await fetch(`${SUPABASE_URL}/rest/v1/notes`, { method:'POST', headers:{ 'Content-Type':'application/json', apikey:SERVICE_KEY, Authorization:`Bearer ${SERVICE_KEY}` }, body: JSON.stringify({ space_id: spaceId||null, title, content: text }) });
    }catch{}
  }

  return json({ ok:true, space_id: spaceId, saved: Boolean(text) }, 200, cors);
}


