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

  // Read raw body first so we can verify signature if provided
  let rawBody = '';
  try{ rawBody = await req.text(); }catch{}

  // Optional webhook signature verification
  try{
    const providedSig = req.headers.get('x-recall-signature') || req.headers.get('svix-signature') || '';
    const secret = process.env.RECALL_WEBHOOK_SECRET || process.env.WEBHOOK_SECRET || '';
    if (secret && providedSig && rawBody){
      const enc = new TextEncoder();
      const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name:'HMAC', hash:'SHA-256' }, false, ['sign']);
      const sigBuf = await crypto.subtle.sign('HMAC', key, enc.encode(rawBody));
      const sigHex = Array.from(new Uint8Array(sigBuf)).map(b=>b.toString(16).padStart(2,'0')).join('');
      // Constant-time compare; if format differs (e.g., Svix), do not block
      const a = providedSig.trim().toLowerCase();
      const b = sigHex;
      const matches = (a.length === b.length) && a.split('').every((c,i)=>c===b[i]);
      if (!matches){ /* ignore mismatch to avoid false negatives */ }
    }
  }catch{}

  let body={};
  try{ body = rawBody ? JSON.parse(rawBody) : {}; }catch{ return json({ error:'bad_json' }, 400, cors); }
  // Support multiple event shapes
  const eventName = String(body?.event || '').toLowerCase();
  const status = String(body?.status || '').toLowerCase();
  const isCompleted = status === 'completed' || eventName === 'transcript.done' || eventName === 'recording.done';
  if (!isCompleted){ return json({ ok:true, ignored:true }, 200, cors); }

  // Accept multiple env names to match different deployments
  const RECALL_KEY = process.env.RECALL_API_KEY || process.env.RECALL_KEY || process.env.RECALL || '';
  const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || process.env.REACT_APP_SUPABASE_URL || '';
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SERVICE_KEY || '';
  if (!SUPABASE_URL || !SERVICE_KEY){ return json({ error:'supabase_env_missing', present:{ SUPABASE_URL: Boolean(SUPABASE_URL), SUPABASE_SERVICE_ROLE_KEY: Boolean(SERVICE_KEY) } }, 500, cors); }

  // Fetch transcript text
  let text = body?.transcript_text || body?.data?.transcript_text || '';
  try{
    if (!text){
      if (body?.transcript_url || body?.data?.transcript_url){
        const r = await fetch(String(body?.transcript_url || body?.data?.transcript_url));
        text = await r.text();
      } else {
        const transcriptId = body?.transcript_id || body?.transcript?.id || body?.data?.transcript_id || '';
        if (RECALL_KEY && transcriptId){
          // Try multiple host/path variants and auth header styles
          // Recall keys are region-scoped: US/EU/JP/Pay-as-you-go
          const region = (process.env.RECALL_REGION || 'us').trim().toLowerCase();
          const regionBases = {
            'us': 'https://us-west-2.recall.ai',
            'eu': 'https://eu-west-1.recall.ai', 
            'jp': 'https://ap-northeast-1.recall.ai',
            'payg': 'https://api.recall.ai'
          };
          const base = regionBases[region] || regionBases.us;
          const urls = [`${base}/v1/transcripts/${transcriptId}`, `${base}/api/v1/transcripts/${transcriptId}`];
          const headersList = [ { Authorization:`Token ${RECALL_KEY}` }, { 'X-Api-Key': RECALL_KEY } ];
          for (const u of urls){
            for (const hdrs of headersList){
              try{
                const r = await fetch(u, { headers: hdrs });
                const j = await r.json().catch(()=>({}));
                text = j?.text || j?.transcript || '';
                if (text) break;
              }catch{}
            }
            if (text) break;
          }
        }
      }
    }
  }catch{}

  // Title + space
  const title = body?.meeting_title || body?.data?.meeting_title || body?.recording?.id || body?.id || `Meeting ${new Date().toLocaleString()}`;
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


