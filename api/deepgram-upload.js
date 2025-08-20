export const config = { runtime: 'edge' };

export default async function handler(req){
  const cors = {
    'Access-Control-Allow-Origin': req.headers.get('Origin') || '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400'
  };
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405, headers: cors });
  try{
    const ct = req.headers.get('Content-Type')||'';
    let directBody = null; let useUrl = '';
    if (ct.startsWith('multipart/form-data')){
      const form = await req.formData();
      const file = form.get('file');
      if (!file) return new Response(JSON.stringify({ error:'file missing' }), { status:400, headers:{...cors,'Content-Type':'application/json'} });
      directBody = file;
    } else {
      const j = await req.json().catch(()=>({}));
      useUrl = j?.url||'';
      if (!useUrl) return new Response(JSON.stringify({ error:'file missing' }), { status:400, headers:{...cors,'Content-Type':'application/json'} });
    }
    const hdrAuth = req.headers.get('authorization') || '';
    const inlineKey = hdrAuth.toLowerCase().startsWith('bearer ') ? hdrAuth.slice(7).trim() : '';
    const apiKey = inlineKey || process.env.DEEPGRAM_API_KEY || '';
    if (!apiKey) return new Response(JSON.stringify({ error:'DEEPGRAM_API_KEY missing' }), { status:500, headers:{...cors,'Content-Type':'application/json'} });

    const endpoint = useUrl ? `https://api.deepgram.com/v1/listen?smart_format=true&url=${encodeURIComponent(useUrl)}` : 'https://api.deepgram.com/v1/listen?smart_format=true';
    const r = await fetch(endpoint, { method:'POST', headers:{ Authorization: `Token ${apiKey}` }, body: directBody||undefined });
    const j = await r.json().catch(()=>({}));
    if (!r.ok) return new Response(JSON.stringify({ error: j?.error || 'deepgram_failed' }), { status:r.status, headers:{...cors,'Content-Type':'application/json'} });
    // Deepgram returns results -> channels[0].alternatives[0].transcript
    const text = j?.results?.channels?.[0]?.alternatives?.[0]?.transcript || '';
    return new Response(JSON.stringify({ text }), { status:200, headers:{...cors,'Content-Type':'application/json'} });
  }catch{
    return new Response(JSON.stringify({ error:'bad_request' }), { status:400, headers:{...cors,'Content-Type':'application/json'} });
  }
}


