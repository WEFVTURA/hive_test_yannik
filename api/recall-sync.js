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
      const headersList = [
        { Authorization:`Token ${RECALL_KEY}`, Accept:'application/json' },
        { 'X-Api-Key': RECALL_KEY, Accept:'application/json' },
      ];
      const region = (process.env.RECALL_REGION || '').trim();
      const explicitBase = (process.env.RECALL_BASE_URL || '').trim();
      const bases = [];
      if (explicitBase) bases.push(explicitBase.replace(/\/$/, ''));
      bases.push('https://api.recall.ai', 'https://app.recall.ai');
      if (region){
        bases.push(`https://api.${region}.recall.ai`, `https://app.${region}.recall.ai`);
        bases.push(`https://${region}.api.recall.ai`, `https://${region}.app.recall.ai`);
      }
      const paths = [ '/v1/transcripts', '/api/v1/transcripts' ];
      const queryVariants = [ '', '?status=completed', '?state=completed' ];
      const urls = [];
      for (const base of bases){
        for (const path of paths){
          for (const q of queryVariants){ urls.push(`${base}${path}${q}${q? '&' : '?'}limit=100`); }
        }
      }
      const aggregated = [];
      for (const firstUrl of urls){
        let url = firstUrl;
        let guard = 0;
        while (url && guard < 20){
          guard++;
          let resp, data={};
          let ok=false;
          for (const hdrs of headersList){
            try{ resp = await fetch(url, { headers: hdrs }); data = await resp.json().catch(()=>({})); ok=true; break; }catch{ ok=false; }
          }
          if (!ok){ data={}; }
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


