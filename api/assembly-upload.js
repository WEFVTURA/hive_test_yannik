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
    const form = await req.formData();
    const file = form.get('file');
    if (!file) return new Response(JSON.stringify({ error:'file missing' }), { status:400, headers:{...cors,'Content-Type':'application/json'} });
    // Prefer key from Authorization: Bearer <key> or x-assembly-key header for dev
    const hdrAuth = req.headers.get('authorization') || '';
    const inlineKey = hdrAuth.toLowerCase().startsWith('bearer ') ? hdrAuth.slice(7).trim() : (req.headers.get('x-assembly-key')||'');
    const apiKey = inlineKey || process.env.ASSEMBLYAI_API_KEY || process.env.ASSEMBLY_API_KEY || '';
    if (!apiKey) return new Response(JSON.stringify({ error:'ASSEMBLYAI_API_KEY missing on server' }), { status:500, headers:{...cors,'Content-Type':'application/json'} });

    // Forward to AssemblyAI upload endpoint
    const up = await fetch('https://api.assemblyai.com/v2/upload', {
      method:'POST',
      headers:{ 'Authorization': apiKey },
      body: file
    });
    const uj = await up.json().catch(()=>({}));
    if (!up.ok) return new Response(JSON.stringify({ error: uj?.error || 'upload_failed' }), { status: up.status, headers:{...cors,'Content-Type':'application/json'} });
    return new Response(JSON.stringify(uj), { status:200, headers:{...cors,'Content-Type':'application/json'} });
  }catch(err){
    return new Response(JSON.stringify({ error:'bad_request' }), { status:400, headers:{...cors,'Content-Type':'application/json'} });
  }
}


