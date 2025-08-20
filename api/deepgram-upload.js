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

    // Optional callback to save transcript via webhook
    let callback = '';
    try{
      if (useUrl){
        const jbody = await req.json().catch(()=>null);
        const spaceId = jbody?.space_id || '';
        const title = (jbody?.title||'Audio').toString().slice(0,120);
        const proto = req.headers.get('x-forwarded-proto') || 'https';
        const host = req.headers.get('x-forwarded-host') || req.headers.get('host') || '';
        if (spaceId && host){ callback = `&callback=${encodeURIComponent(`${proto}://${host}/api/deepgram-webhook?space_id=${encodeURIComponent(spaceId)}&title=${encodeURIComponent(title)}`)}`; }
      }
    }catch{}

    const endpoint = useUrl ? `https://api.deepgram.com/v1/listen?smart_format=true&url=${encodeURIComponent(useUrl)}${callback}` : 'https://api.deepgram.com/v1/listen?smart_format=true';
    const r = await fetch(endpoint, { method:'POST', headers:{ Authorization: `Token ${apiKey}` }, body: directBody||undefined });
    const j = await r.json().catch(()=>({}));
    if (!r.ok) return new Response(JSON.stringify({ error: j?.error || 'deepgram_failed' }), { status:r.status, headers:{...cors,'Content-Type':'application/json'} });
    // Deepgram may return immediate transcript or accepted job
    const text = j?.results?.channels?.[0]?.alternatives?.[0]?.transcript
      || j?.results?.channels?.[0]?.alternatives?.[0]?.paragraphs?.transcript
      || '';
    if (text) return new Response(JSON.stringify({ text }), { status:200, headers:{...cors,'Content-Type':'application/json'} });
    return new Response(JSON.stringify({ accepted:true, request_id: j?.request_id || j?.id || j?.metadata?.request_id || null }), { status:202, headers:{...cors,'Content-Type':'application/json'} });
  }catch{
    return new Response(JSON.stringify({ error:'bad_request' }), { status:400, headers:{...cors,'Content-Type':'application/json'} });
  }
}


