export const config = { runtime: 'edge' };

async function jres(data, status=200, cors){ return new Response(JSON.stringify(data), { status, headers:{ ...(cors||{}), 'Content-Type':'application/json' } }); }

export default async function handler(req){
  const cors = {
    'Access-Control-Allow-Origin': req.headers.get('Origin') || '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400'
  };
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'GET' && req.method !== 'POST') return new Response('Method Not Allowed', { status: 405, headers: cors });

  // Support multiple env var names to match project setups; do NOT expose values
  const RECALL_KEY = process.env.RECALL_API_KEY || process.env.RECALL_KEY || process.env.RECALL || '';
  const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || process.env.REACT_APP_SUPABASE_URL || '';
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SERVICE_KEY || '';
  if (!RECALL_KEY || !SUPABASE_URL || !SERVICE_KEY){
    return jres({
      error: 'Missing env RECALL_API_KEY/SUPABASE_*',
      present: {
        RECALL_API_KEY: Boolean(RECALL_KEY),
        SUPABASE_URL: Boolean(SUPABASE_URL),
        SUPABASE_SERVICE_ROLE_KEY: Boolean(SERVICE_KEY)
      }
    }, 500, cors);
  }

  // Ensure Meetings space
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

  let imported = 0; let checked = 0;
  try{
    // Try multiple list variants + pagination
    async function fetchAllCandidates(){
      const headers = { Authorization:`Token ${RECALL_KEY}`, Accept: 'application/json' };
      const urls = [
        // Primary base (observed in API docs)
        'https://api.recall.ai/v1/transcripts?status=completed&limit=100',
        'https://api.recall.ai/v1/transcripts?state=completed&limit=100',
        'https://api.recall.ai/v1/transcripts?limit=100',
        // Fallback base (some deployments/documentation variants)
        'https://api.recall.ai/api/v1/transcripts?status=completed&limit=100',
        'https://api.recall.ai/api/v1/transcripts?state=completed&limit=100',
        'https://api.recall.ai/api/v1/transcripts?limit=100'
      ];
      const aggregated = [];
      for (const base of urls){
        let url = base;
        let guard = 0;
        while (url && guard < 20){
          guard++;
          let resp, data={};
          try{ resp = await fetch(url, { headers }); data = await resp.json().catch(()=>({})); }catch{ data = {}; }
          const chunk = Array.isArray(data) ? data : (Array.isArray(data?.results) ? data.results : []);
          if (chunk.length) aggregated.push(...chunk);
          let nextUrl = data?.next || data?.links?.next || '';
          if (nextUrl && typeof nextUrl === 'string'){
            // Support relative next links
            if (nextUrl.startsWith('/')) nextUrl = `https://api.recall.ai${nextUrl}`;
            url = nextUrl;
          } else {
            break;
          }
        }
        if (aggregated.length) break;
      }
      return aggregated;
    }

    const list = await fetchAllCandidates();
    for (const t of list){
      checked++;
      const status = t?.status || t?.state || '';
      if (String(status).toLowerCase() !== 'completed') continue;
      const id = t?.id || t?.transcript_id || '';
      const title = (t?.meeting_title || `Recall ${id || ''}`).trim() || `Recall ${new Date().toISOString()}`;
      let text = t?.text || t?.transcript || '';
      try{ if (!text && t?.transcript_url){ const rr = await fetch(String(t.transcript_url)); text = await rr.text(); } }catch{}
      if (!text) continue;
      // Avoid naive duplicates by searching for same title prefix
      try{
        const exist = await fetch(`${SUPABASE_URL}/rest/v1/notes?select=id&title=eq.${encodeURIComponent(title)}`, { headers:{ apikey:SERVICE_KEY, Authorization:`Bearer ${SERVICE_KEY}` } });
        const exj = await exist.json().catch(()=>[]);
        if (Array.isArray(exj) && exj.length) continue;
      }catch{}
      try{
        await fetch(`${SUPABASE_URL}/rest/v1/notes`, { method:'POST', headers:{ 'Content-Type':'application/json', apikey:SERVICE_KEY, Authorization:`Bearer ${SERVICE_KEY}` }, body: JSON.stringify({ space_id: spaceId||null, title, content: text }) });
        imported++;
      }catch{}
    }
  }catch{}

  return jres({ ok:true, space_id: spaceId, checked, imported }, 200, cors);
}


