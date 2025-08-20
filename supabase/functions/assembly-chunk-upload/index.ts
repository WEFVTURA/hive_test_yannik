// Deno Edge Function: chunked upload to AssemblyAI (workaround for large files or flaky networks)
// Client should POST raw bytes with headers: x-file-name, x-content-type
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'

function buildCors(req: Request){
  const o = req.headers.get('Origin') || '*';
  return {
    'Access-Control-Allow-Origin': o,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-file-name, x-content-type',
    'Access-Control-Max-Age': '86400'
  } as Record<string,string>;
}

serve(async (req)=>{
  const cors = buildCors(req);
  if (req.method === 'OPTIONS') return new Response(null, { status:204, headers:cors });
  if (req.method !== 'POST') return new Response('Method not allowed', { status:405, headers:cors });
  try{
    const apiKey = Deno.env.get('ASSEMBLYAI_API_KEY') || '';
    if (!apiKey) return new Response(JSON.stringify({ error:'ASSEMBLYAI_API_KEY missing' }), { status:500, headers:{...cors,'Content-Type':'application/json'} });
    const body = req.body;
    if (!body) return new Response(JSON.stringify({ error:'no body' }), { status:400, headers:{...cors,'Content-Type':'application/json'} });
    const up = await fetch('https://api.assemblyai.com/v2/upload', { method:'POST', headers:{ Authorization: apiKey }, body });
    const j = await up.json().catch(()=>({}));
    if (!up.ok) return new Response(JSON.stringify({ error:j?.error||'upload_failed' }), { status:up.status, headers:{...cors,'Content-Type':'application/json'} });
    return new Response(JSON.stringify(j), { status:200, headers:{...cors,'Content-Type':'application/json'} });
  }catch(e){
    return new Response(JSON.stringify({ error:'bad_request' }), { status:400, headers:{...cors,'Content-Type':'application/json'} });
  }
});


