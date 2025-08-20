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
    let file = null;
    if (ct.startsWith('multipart/form-data')){
      const form = await req.formData();
      file = form.get('file');
    } else {
      // Support URL ingestion: { url }
      const j = await req.json().catch(()=>({}));
      const url = j?.url||'';
      if (url){
        const rf = await fetch(url);
        const blob = await rf.blob();
        file = new File([blob], (new URL(url).pathname.split('/').pop()||'audio.m4a'), { type: blob.type||'application/octet-stream' });
      }
    }
    if (!file) return new Response(JSON.stringify({ error:'file missing' }), { status:400, headers:{...cors,'Content-Type':'application/json'} });
    const hdrAuth = req.headers.get('authorization') || '';
    const inlineKey = hdrAuth.toLowerCase().startsWith('bearer ') ? hdrAuth.slice(7).trim() : '';
    const apiKey = inlineKey || process.env.OPENAI_API_KEY || '';
    if (!apiKey) return new Response(JSON.stringify({ error:'OPENAI_API_KEY missing' }), { status:500, headers:{...cors,'Content-Type':'application/json'} });

    const body = new FormData();
    body.append('file', file, file.name || 'audio.m4a');
    body.append('model', 'whisper-1');
    body.append('response_format', 'json');

    const r = await fetch('https://api.openai.com/v1/audio/transcriptions', { method:'POST', headers:{ Authorization: `Bearer ${apiKey}` }, body });
    const j = await r.json().catch(()=>({}));
    if (!r.ok) return new Response(JSON.stringify({ error:j?.error?.message || 'openai_failed' }), { status:r.status, headers:{...cors,'Content-Type':'application/json'} });
    // OpenAI returns { text: "..." }
    return new Response(JSON.stringify({ text: j.text || '' }), { status:200, headers:{...cors,'Content-Type':'application/json'} });
  }catch{
    return new Response(JSON.stringify({ error:'bad_request' }), { status:400, headers:{...cors,'Content-Type':'application/json'} });
  }
}


